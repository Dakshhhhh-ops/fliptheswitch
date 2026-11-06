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

## Limits

The scanner reads JavaScript and TypeScript with fixed rules, not a parser.
It is predictable, not complete. A constant in the same file is resolved, and
any other algorithm picked at runtime is flagged for review rather than
named. Values passed between files, and code inside a template literal's
`${...}`, aren't followed.
