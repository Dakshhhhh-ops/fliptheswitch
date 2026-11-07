Scanned C:\Users\daksh\AppData\Local\Temp\desk-package-3LXVas: 11 crypto assets, 5 findings.

| # | Priority | Where | Algorithm | Status | Mosca |
|---|---|---|---|---|---|
| F1 | P1 | `src/session.js:7` | ECDH (P-256) | vulnerable | Already late by 1 year (7 + 3 vs 9 years, from infra/DEPLOY.md:22) |
| F2 | P2 | `src/receipts.js:17` | SHA-1 | broken | Late now: broken today, no quantum computer needed |
| F3 | P3 | `src/envelope.js:146` | RSA-OAEP | legacy-read | Legacy read path: new data is post-quantum, old records wait for re-wrap |
| F4 | P3 | `src/vault.js:14` | AES-128-GCM | policy | Not on Mosca's clock: Grover only halves its strength |
| F5 | P3 | `src/webhooks.js:30` | ECDSA (P-256) | dual-signed | Dual-signed: classical kept on purpose beside ML-DSA |
