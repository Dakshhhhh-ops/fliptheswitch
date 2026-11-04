# The scanner on real code

`tools/cbom-scan.mjs` was written against the demo, then run on two widely
used Node libraries that call crypto directly. Both are pinned to the commit
scanned, so the tables can be reproduced.

The scanner reports where an algorithm is **used or offered**, not whether
that use is a bug. Libraries like these support classical algorithms on
purpose, because the other side of the connection needs them. The point of
an inventory is to see that surface before deciding what to migrate.

## [mscdex/ssh2](https://github.com/mscdex/ssh2) at `a3a39d7`

SSH client and server. 12 crypto assets, 31 findings across 10 files.

| Algorithm | Priority | Status | Files | Example |
|---|---|---|---|---|
| ECDH | P1 | vulnerable | 3 | `lib/protocol/constants.js:37` |
| Finite-field Diffie-Hellman | P1 | vulnerable | 2 | `lib/protocol/constants.js:42` |
| X25519 | P1 | vulnerable | 2 | `lib/protocol/constants.js:52` |
| ECDSA | P2 | vulnerable | 4 | `lib/keygen.js:40` |
| EdDSA | P2 | vulnerable | 3 | `lib/keygen.js:63` |
| MD5 | P2 | broken | 1 | `lib/protocol/keyParser.js:852` |
| RSA signature | P2 | vulnerable | 8 | `lib/agent.js:617` |
| Classical signature (RSA or ECDSA) | P2 | vulnerable | 1 | `lib/protocol/keyParser.js:390` |
| SHA-1 | P2 | broken | 1 | `lib/protocol/keyParser.js:1056` |
| Hash chosen at runtime | P3 | review | 3 | `lib/protocol/crypto.js:456` |
| Cipher chosen at runtime | P3 | review | 3 | `lib/protocol/crypto.js:316` |

What it shows:

- **Every key exchange the library offers is classical.** The default list in
  `lib/protocol/constants.js` is ECDH over the NIST curves, Curve25519 and
  finite-field Diffie-Hellman. No hybrid post-quantum exchange such as
  `mlkem768x25519-sha256`, which OpenSSH now offers, appears anywhere in
  `lib/`. SSH sessions recorded today can be decrypted later. That is the
  P1 item.
- **The MD5 and SHA-1 hits are not bugs.** Both derive keys from a passphrase
  to read older encrypted key files (OpenSSH's legacy PEM format and PuTTY's
  PPK), and those formats require them. They belong in the inventory, with a
  note, and are not something to "fix".

## [panva/jose](https://github.com/panva/jose) at `607c3f7`

JWT, JWS and JWE. 9 crypto assets, 25 findings across 7 files.

| Algorithm | Priority | Status | Files | Example |
|---|---|---|---|---|
| ECDH | P1 | vulnerable | 4 | `src/key/generate_key_pair.ts:37` |
| RSA-OAEP | P1 | vulnerable | 5 | `src/key/generate_key_pair.ts:25` |
| X25519 | P1 | vulnerable | 5 | `src/key/generate_key_pair.ts:134` |
| ECDSA | P2 | vulnerable | 4 | `src/key/generate_key_pair.ts:29` |
| EdDSA | P2 | vulnerable | 4 | `src/key/generate_key_pair.ts:32` |
| RSA signature | P2 | vulnerable | 3 | `src/key/generate_key_pair.ts:19` |

What it shows:

- **Signatures already have a post-quantum option.** The CBOM lists
  ML-DSA-44, ML-DSA-65 and ML-DSA-87 as assets that meet policy: jose
  supports them for JWS.
- **Encryption doesn't yet.** Every JWE key-management algorithm is RSA-OAEP
  or ECDH-ES, and no ML-KEM appears in `src/`. Tokens encrypted today can be
  recorded and opened later, so the P1 items are on the encryption side.

## What the first run taught the scanner

The first pass found 3 findings in ssh2 and **none** in jose. Real code names
algorithms in ways the demo didn't, so these rules were added, each with a
test:

- Web Crypto and JOSE identifiers (`'RSA-OAEP'`, `'ECDSA'`, `'RS256'`,
  `'ECDH-ES'`, `'ML-DSA-65'`), and TypeScript sources (`.d.ts` skipped)
- SSH protocol names (`'ecdh-sha2-nistp256'`, `'diffie-hellman-group14-sha256'`,
  `'ssh-ed25519'`, with `'mlkem768x25519-sha256'` counted as meeting policy)
- Ciphers beyond AES-GCM (ChaCha20-Poly1305, other AES modes, DES, 3DES, RC4)
- Test, example and build folders skipped

A review of the scanner then found real gaps, which were fixed, each with a
test:

- Comments and template-literal text were matched, so `// migrated away
  from 'RS256'` counted as an RSA signature. Both are now blanked before
  matching, with line numbers kept.
- Each rule read one line at a time, so a call split across lines was
  missed. Rules now run over the whole file.
- `createHash('SHA-1')`, `createSign('RSA-SHA256')`, `pbkdf2Sync(..., 'sha1')`
  and a signature made with a key loaded from PEM were missed. They are now
  found, and the last one is reported as "Classical signature (RSA or
  ECDSA)", because the key type isn't visible in the file.
- An algorithm named by a variable was invisible. A constant declared in the
  same file is resolved. Anything else is reported as **chosen at runtime**,
  status `review`, instead of being skipped.
- A signing RSA key made with `generateKeyPairSync` was labelled RSA-OAEP
  and told to use ML-KEM. It is now an RSA signature.
- Ids were renumbered on every scan, so fixing F1 turned the next finding
  into F1. With `--baseline FILE`, ids stay as they were in the first scan.

That review added 7 findings to ssh2: one signature with a runtime key
(`lib/protocol/keyParser.js`) and six places where the cipher, MAC or hash is
negotiated during the SSH handshake or read from a key file
(`lib/protocol/crypto.js`, `kex.js`, `keyParser.js`, `keygen.js`, `client.js`). Those are not bugs. They mark the
code a migration has to follow by hand, because the algorithm list lives
elsewhere. jose's results didn't change.

It still reads text with fixed rules rather than parsing JavaScript, so a
value passed between files, or code inside a template literal's `${...}`,
is not followed.

## Reproduce

```sh
git clone https://github.com/mscdex/ssh2 && git -C ssh2 checkout a3a39d7
git clone https://github.com/panva/jose && git -C jose checkout 607c3f7
node tools/cbom-scan.mjs ssh2 --out ssh2.cbom.json
node tools/cbom-scan.mjs jose --out jose.cbom.json
```
