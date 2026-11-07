Scanned C:\Users\daksh\AppData\Local\Temp\desk-package-BPkHzv: 9 crypto assets, 3 findings.

| # | Priority | Where | Algorithm | Status | Mosca |
|---|---|---|---|---|---|
| F1 | P3 | `src/envelope.js:146` | RSA-OAEP | legacy-read | Legacy read path: new data is post-quantum, old records wait for re-wrap |
| F2 | P3 | `src/vault.js:14` | AES-128-GCM | policy | Not on Mosca's clock: Grover only halves its strength |
| F3 | P3 | `src/webhooks.js:30` | ECDSA (P-256) | dual-signed | Dual-signed: classical kept on purpose beside ML-DSA |
