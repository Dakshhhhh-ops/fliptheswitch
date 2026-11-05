# Live run, 5–6 November 2026

The desk run end to end in Switch on the demo service: four agents (scout and
migrator on Claude, reviewer on Codex, shipper on Claude), three work rooms
(F5, F1, F3), the security lead as Switch user `user`, and the engineer as
Mattermost user `arjun` (Arjun Mehta). Nothing below is scripted: the agents
wrote the code, the reviewer ran the tests, and the shipper merged through the
origin's gate.

**Result: Shipped 2/6 · Accepted risk 1 · Open 3**, read from git by
`tools/board.mjs`.

## What happened

| Finding | What the agents did | People | Git |
|---|---|---|---|
| **F5** merchant webhooks, ECDSA P-256 | Migrator dual-signed every event with ECDSA P-256 and ML-DSA-65, with a test that an ECDSA-only verifier still accepts it | Arjun: "about 40 merchants still verify ECDSA … keep the ECDSA signature working" | `6666ccb` approved, shipped as `7761387` |
| **F1** card vault, RSA-OAEP 2048 | Migrator wrapped data keys with hybrid X25519 + ML-KEM-768 (HKDF-SHA-256 over both secrets), kept a read path for old envelopes. **Reviewer requested changes**: the scanner still saw RSA. Migrator added a test that a v2 envelope has no RSA fields | Arjun: "Nothing else unwraps them … keep the legacy read path". Security lead ruled that the read path is accepted if three conditions hold | `76ebe32`, then `f03d6e0` approved, shipped as `33c152b` |
| **F3** TLS, classical key exchange | Shipper recorded the risk in `ACCEPTED-RISKS.md` only | Security lead: "production TLS terminates at the acquirer's edge gateway … review in 90 days" | `d248e99`, owner security lead, review by 2027-02-04 |

Both ship certificates verify:

```sh
node tools/certificate.mjs verify docs/live-run/F5.cert.json   # Signature valid (ML-DSA-65). 14/14 tests at the merge
node tools/certificate.mjs verify docs/live-run/F1.cert.json   # Signature valid (ML-DSA-65). 24/24 tests at the merge
```

## What Switch refused

| | Screenshot |
|---|---|
| Arjun: `@Shipper ship F1`. Switch answers at once ("I only take instructions from my owner, and this chat account isn't linked to a Switch user yet"), with no "Starting a session" first, so no agent ran. The reason is the unlinked account; a linked non-owner being refused is not shown | [refusal-ship.png](refusal-ship.png) (thread on the right) |
| Arjun: `@Shipper accept risk: …` in the F3 room. Same refusal: only the security lead can accept a risk | [refusal-accept-risk.png](refusal-accept-risk.png) |
| The security lead's `ship F1`, while no agent held the room's `reviewer` role. The shipper refused, following its instructions: the approval didn't come from the reviewer of record. Switch makes the role exclusive; the shipper does the checking | [one-reviewer-of-record.png](one-reviewer-of-record.png) |
| Reviewer: CHANGES REQUESTED on F1, no approval mark pushed | [review-changes-requested.png](review-changes-requested.png) |
| The security lead's accept-risk, which the shipper carried out | [user-accepts-risk.png](user-accepts-risk.png) |

## The scan after the run

[scan-after.md](scan-after.md) is `cbom-scan` on main after the run, with the
run's findings as the baseline so the ids match. Without `--baseline` the ids
are renumbered by priority, so rescan with
`node tools/cbom-scan.mjs <checkout> --baseline work/<team>-findings.json`. F1's RSA is now
`legacy-read` and F5's ECDSA `dual-signed`, both P3 and still listed, because
old envelopes stay RSA-wrapped until they're re-wrapped, and ECDSA stays
until every merchant checks ML-DSA. F3 is still `vulnerable`: an accepted
risk is recorded, not fixed.

## What went wrong, and what changed because of it

- **The legacy read path had no rule.** The reviewer's checklist said a
  finding passes only when the scanner no longer reports it, with an
  exception for dual signatures only. So it rightly rejected F1, and the
  security lead had to rule. The scanner now marks such a path
  `legacy-read`, and the template says what the reviewer checks for one.
- **The reviewer could hold only one role at a time.** It still held
  `reviewer` in the F5 room, so it couldn't take it in the F1 room, and the
  shipper refused to ship. The template now has the reviewer release its
  role once a finding ships.
- **Messages from the wrong account.** Several orders were first sent from
  the engineer's window. Switch refused every one that needed the security
  lead, which is the point, but it cost time. The security lead's first F1
  ruling was also sent from Arjun's account (it shows in the screenshots).
  It was sent again as `user` the same minute. The migrator's test commit and
  the reviewer's approval came after both messages, so this run can't show
  which one they acted on. The F1 approval is still only for the exact
  commit the reviewer checked, and only `user` could order the ship.
- **Codex's Windows sandbox setup** blocked the reviewer's shell for about 5
  minutes on its second review. It finished on its own.

## Files

- `main-log.txt`, `refs.txt`: the origin's main history and every ref,
  including both `refs/approved/<sha>` marks
- `F5.cert.json`, `F1.cert.json`: the migration certificates
- `ACCEPTED-RISKS.md`: the file as the accept-risk commit left it
- `scan-after.md`: the scan of main after the run
- `*.png`: chat screenshots (cropped to the Mattermost window)
