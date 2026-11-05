Scanned main after the run: 11 crypto assets, 6 findings.

| # | Priority | Where | Algorithm | Status | Mosca |
|---|---|---|---|---|---|
| F2 | P1 | `src/session.js:7` | ECDH (P-256) | vulnerable | Already late by 1 year (7 + 3 vs 9 years, from infra/DEPLOY.md:17) |
| F3 | P1 | `src/tls.js:6` | TLS classical key exchange (prime256v1) | vulnerable | Lifetime unknown: ask the engineer how long it must stay secret |
| F4 | P2 | `src/receipts.js:17` | SHA-1 | broken | Late now: broken today, no quantum computer needed |
| F1 | P3 | `src/envelope.js:48` | RSA-OAEP (2048) | legacy-read | Legacy read path: new data is post-quantum, old records wait for re-wrap |
| F6 | P3 | `src/vault.js:14` | AES-128-GCM | policy | Not on Mosca's clock: Grover only halves its strength |
| F5 | P3 | `src/webhooks.js:21` | ECDSA (P-256) | dual-signed | Dual-signed: classical kept on purpose beside ML-DSA |
