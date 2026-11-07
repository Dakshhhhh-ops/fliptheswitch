# The scanner

[`tools/cbom-scan.mjs`](../tools/cbom-scan.mjs) finds quantum-vulnerable and
weak crypto in JavaScript and TypeScript, ranks it by Mosca's rule, and
writes a CycloneDX 1.6 CBOM. No install, no dependencies:

```sh
node tools/cbom-scan.mjs ../your-repo --out cbom.json
```

On the demo service it prints:

| # | Priority | Where | Algorithm | Mosca |
|---|---|---|---|---|
| F1 | P1 | `src/envelope.js:15` | RSA-OAEP (2048) | Already late: kept for the life of the customer account (from `infra/DEPLOY.md`) |
| F2 | P1 | `src/session.js:7` | ECDH (P-256) | Already late by 1 year (7 + 3 vs 9 years, from `infra/DEPLOY.md`) |
| F3 | P1 | `src/tls.js:6` | TLS classical key exchange | Lifetime unknown: ask the engineer |
| F4 | P2 | `src/receipts.js:17` | SHA-1 | Late now: broken today, no quantum computer needed |
| F5 | P2 | `src/webhooks.js:7` | ECDSA (P-256) | On time: 6 years to spare |
| F6 | P3 | `src/vault.js:14` | AES-128-GCM | Not on Mosca's clock: Grover only halves its strength |

## Mosca's rule

If (how long the data must stay secret) + (how long the migration takes) >
(years until a quantum computer), you are already late. The lifetime comes
from the code itself: a comment in the file, or a doc line that names the
file ("kept for 7 years"). When nothing says, the verdict is "ask the
engineer", never a guess. Migration time (3 years) and Q-Day (2035, NIST's
planned disallow date, which is a planning date, not a prediction) are stated
assumptions, and `--migration-years` and `--qday-year` change them.

## Keep it from coming back

Migrating once isn't enough if the next pull request adds RSA again. The
scanner doubles as a CI gate:

```sh
node tools/cbom-scan.mjs . --baseline crypto-baseline.json              # once: record today's findings, commit the file
node tools/cbom-scan.mjs . --baseline crypto-baseline.json --fail-on p1 # in CI: fail only on new P1 findings
node tools/cbom-scan.mjs . --sarif cbom-scan.sarif                      # findings for GitHub code scanning
```

With a baseline, only findings that are new since it was written count, so a
team can turn the gate on before it has fixed everything. `--fail-on` takes
`p1`, `p2`, `p3`, `any` or `none`. SARIF puts each finding on its line in
GitHub's code scanning, with a fingerprint that follows it across commits:

| Finding | SARIF level | security-severity |
|---|---|---|
| Quantum-vulnerable key exchange or encryption (P1) | error | 9.0 |
| Broken today: SHA-1, MD5, DES/3DES/RC4 (P2) | error | 7.0 |
| Quantum-vulnerable signature (P2) | warning | 7.0 |
| Algorithm picked at runtime, needs review (P3) | warning | 4.0 |
| Below policy: AES-128 (P3) | note | 4.0 |
| Kept on purpose beside its post-quantum replacement: legacy read path or dual signature (P3) | note | 4.0 |

This repository's [CI](../.github/workflows/ci.yml) uploads the demo's
findings to code scanning. It doesn't fail on them: they're planted.

## The demo codebase

[`demo-payments/`](../demo-payments/) is a small payments service with six
planted problems, and its 8 tests pass. The scanner uses fixed rules, so every
run starts from the same six-finding inventory. The fixes below are what the
agents are briefed to make. Every fix uses only `node:crypto`: Node 24.7+
ships ML-KEM and ML-DSA (FIPS 203 and 204).

| # | Where | Problem | Planned fix |
|---|---|---|---|
| F1 | `src/envelope.js` | RSA-OAEP wraps card data keys | Hybrid X25519 + ML-KEM-768 → HKDF → AES-256-GCM |
| F2 | `src/session.js` | ECDH P-256 settlement keys, files kept 7 years | Hybrid X25519 + ML-KEM-768 |
| F3 | `src/tls.js` | Classical-only TLS key exchange | Staging gets `X25519MLKEM768`. Production TLS is on the acquirer's gateway: a change request, and an accepted risk until it's done |
| F4 | `src/receipts.js` | SHA-1 checksums (**classically broken**, not a quantum issue) | SHA-256 / HMAC-SHA-256 |
| F5 | `src/webhooks.js` | ECDSA P-256 webhook signatures | ML-DSA-65 **dual-signed** beside ECDSA, because merchants still verify ECDSA |
| F6 | `src/vault.js` | AES-128-GCM (fine today, below CNSA 2.0 for long-lived data) | AES-256-GCM with a versioned format so old records stay readable |

## On real code

The same scanner, run on two widely used Node libraries
([full tables](REAL-SCANS.md)):

| Library | Findings | What stands out |
|---|---|---|
| [mscdex/ssh2](https://github.com/mscdex/ssh2) | 31 in 10 files | Every key exchange it offers is classical (ECDH, Curve25519, finite-field DH). No hybrid post-quantum exchange like OpenSSH's `mlkem768x25519-sha256` |
| [panva/jose](https://github.com/panva/jose) | 25 in 7 files | Signatures already offer ML-DSA. Encryption (JWE) is still RSA-OAEP or ECDH-ES only |

The first run on these found 3 and 0 findings: real code names algorithms in
ways the demo didn't. A later review found more gaps (comments matched, calls
split across lines missed, runtime algorithm names skipped). Every rule added
for these has a test, and [REAL-SCANS.md](REAL-SCANS.md) lists them.

## How accurate it is

`node tools/scanner-bench.mjs` scores the scanner against 53 labelled lines of
real-world crypto code in [test/fixtures/scanner-bench](../test/fixtures/scanner-bench/):
Node's crypto, Web Crypto, JOSE, node-forge, node-rsa, tweetnacl and
elliptic, plus decoys (comments, docs strings, modern algorithms) and code
whose algorithm is only known at runtime, which it should flag for a person.

**Precision 100%, recall 94%** (33 of 35). The two misses are listed as known
gaps: an algorithm passed through your own wrapper function, and a
standalone X25519 in a file that also does the hybrid (the scanner takes it
for the hybrid's classical half). `npm test` fails if precision drops,
recall falls under 90%, or a new miss appears.

Those labels are ours, so the next section checks the rules against
something that isn't.

## Checked by a parser

`npm run scanner:crosscheck` parses the same files with
[acorn](https://github.com/acornjs/acorn), a real JavaScript parser (MIT,
vendored in [tools/vendor/](../tools/vendor/), so nothing is downloaded).
[tools/cbom-ast.mjs](../tools/cbom-ast.mjs) walks the syntax tree and lists
every call into a crypto API. It shares no code with the rules, and it knows
what each name is bound to: `crypto.sign()` on `require('node:crypto')` is a
crypto call, `jwt.sign()` is a jsonwebtoken call, and a function imported as
`sign_` is still `sign`. Then:

- **recall:** of the call sites the parser finds, how many the rules flag on
  the same lines;
- **weak recall:** the same, counting only call sites whose algorithm is
  quantum-vulnerable or broken (named in the code, or implied by the API);
- **precision:** of the rules' hits on calls, how many sit on a call the
  parser finds. Hits on algorithm names written as strings (`'RS256'`,
  `'ecdh-sha2-nistp256'`) are left out, because they are string literals by
  construction.

The real code is pinned: [mscdex/ssh2](https://github.com/mscdex/ssh2) at
`a3a39d7`, [digitalbazaar/forge](https://github.com/digitalbazaar/forge) at
`01119d6` and [auth0/node-jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)
at `b924272`. `--fetch` clones them into `.cache/real/`.

**The rules as they were, against the parser** (the independent result):

| Code | Parser call sites | Recall | Weak recall | Precision |
|---|---|---|---|---|
| ssh2 (21 JS files) | 42 | 35/42, 83% | 12/13 | 35/38, 92% |
| node-forge (54) | 44 | 35/44, 80% | 31/32 | 35/35, 100% |
| jsonwebtoken (12) | 3 | 1/3 | 0/0 | 1/1 |
| **Real code, total** | **89** | **71/89, 80%** | **43/45, 96%** | **71/74, 96%** |
| demo-payments | 16 | 15/16 | 8/8 | 15/15 |

What the parser found that the rules missed:

- **Two quantum-vulnerable calls.** ssh2's `crypto.diffieHellman()` (which
  only does DH, ECDH, X25519 and X448), and forge's `pbkdf2Sync()` with no
  digest (old Node used SHA-1).
- **Six calls with an algorithm chosen at runtime** that should have been
  flagged for review: ssh2's `generateKeyPair_(...args)` (twice) and
  `sign_(algo, ...)`/`verify_(algo, ...)`, imported under a new name, and
  jsonwebtoken's `jws.sign`/`jws.verify`.
- **Eight modern digests** missing from forge's inventory
  (`forge.md.sha256/384/512.create()`).
- Two `sign(null, ...)`/`verify(null, ...)` calls in ssh2, still missed (below).
- **Three false positives**, all in ssh2: two method *declarations* named
  `computeSecret(...) {`, and a call to ssh2's own `computeSecret` wrapper.

**After fixing those rules:** real code 87/89 recall (98%), weak recall 45/45,
precision 88/89 (99%). These numbers are no longer independent: the fixes
were found with this check. The labelled benchmark is unchanged (precision
100%, recall 94%), and so are demo-payments' six findings.

The fixed rules are scanner version 2 (`SCANNER_VERSION` in
[tools/cbom-scan.mjs](../tools/cbom-scan.mjs)). The live runs' signed
migration certificates were issued with version 1, which records fewer lines
in the migrated files (it didn't see `crypto.diffieHellman()`). So a
certificate now names the version that issued it, and the audit re-runs that
version: version 1 is kept, frozen, in
[tools/scanner-versions/](../tools/scanner-versions/). A certificate without
the field is version 1.

What's left, and why:

- `sign(null, ...)`/`verify(null, ...)` in ssh2's `constants.js` (a probe for
  Ed25519 support): a `null` digest means EdDSA or ML-DSA, and nothing in that
  file says which.
- `crypto.scryptSync()` in demo-payments: a password KDF with no algorithm
  to choose, and not on Mosca's clock.
- The remaining false positive: the wrapper `this.computeSecret()` in ssh2,
  which does call ECDH one level down.

Limits of the check: acorn reads JavaScript, not TypeScript, so `.ts` files
(all of panva/jose) are skipped and reported as such. The parser works one
file at a time and resolves an algorithm only from a literal, a constant
declared with one, or a constant object's property, like the rules. It's a
second, independent reading of the same code, not a ground truth: a call
both of them miss doesn't show up here.

## Limits

The scanner reads JavaScript and TypeScript with fixed rules. The parser
check above measures them on real code, but they are predictable, not
complete. A constant in the same file is resolved, and any other algorithm
picked at runtime is flagged for review rather than named. Values passed
between files, and code inside a template literal's `${...}`, aren't
followed.
