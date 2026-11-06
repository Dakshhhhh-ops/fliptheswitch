# Demo video run-sheet

About 3 minutes, cut from the screen recording of [live run 2](live-run-2/README.md)
(6 November 2026), which was filmed as it happened, including both
refusals. If a shot is missing from the recording, the agents' messages are
still in the `desk3-*` rooms: scroll to them and film that. Switch's `400`
for a second agent taking the reviewer role is from live run 1
([screenshot](live-run/role-lock.png)), because in run 2 the migrator
declined to try.

Say once, early, that this is a real run, not a script.

## Before recording

- **Mattermost, two windows side by side:** normal Chrome as `user` (the
  security lead), Incognito as `arjun`. Both sidebars show only `desk3-*`
  rooms, with the CHANNELS section expanded.
- **Switch Console** open on Your Agents, showing the four `desk3-` agents.
- **A terminal** in the `crypto-desk` folder, font large enough to read.
- **Browser tab:** https://dakshhhhh-ops.github.io/fliptheswitch/
- Turn off notifications. Record at 1080p.
- Dry-run each live message once first, so you know the agents answer, then
  delete the dry-run messages.

## The beats

| Time | Screen | What happens | Say |
|---|---|---|---|
| 0:00 | Terminal | `node tools/cbom-scan.mjs <ssh2 checkout>`: 31 findings in 10 files ([how](REAL-SCANS.md)) | "ssh2, one of npm's most used SSH libraries, offers only classical key exchange. Anything sent over it can be recorded today and decrypted once a quantum computer exists." |
| 0:15 | Desk app | The six findings, ranked by Mosca's rule | "Here's a payments service with six problems, ranked by how late each one already is. Card keys are kept for the life of the account, so they're already late." |
| 0:30 | Switch Console, Your Agents | Four agents: scout, migrator on Claude Code, reviewer on Codex, shipper | "One Switch template made this desk: four agents, each with its own checkout and rules, and a reviewer on a different model." |
| 0:40 | `desk3-intake` | The scout's Crypto inventory and the board line | "The scout scans, keeps the inventory as a Switch room document, and opens a private room for each finding with the engineer who owns the code." |
| 0:55 | `desk3-f5-webhooks` | Arjun: "about 40 merchants still verify ECDSA". The migrator switches to a dual signature | "Real migrations have constraints the code doesn't show. Arjun says merchants still verify ECDSA, so the fix signs with both ECDSA and ML-DSA." |
| 1:10 | `desk3-f1-envelope` | The reviewer's CHANGES REQUESTED, the migrator's fix, then APPROVED d390af3 | "The reviewer is Codex, not the model that wrote the fix. It rejected the first version because the commit didn't say when RSA retires, the migrator fixed it, and Codex approved that exact commit. No person stepped in." |
| 1:30 | **Live**, Arjun's window, `desk3-f3-tls` | Arjun sends `@desk3-shipper ship F3`. Switch refuses at once, with no agent session | "Arjun can't ship. Switch refuses him before the agent even runs. Only the security lead can order a ship." |
| 1:45 | `desk3-f1-envelope`, user's window | The `user` "ship F1" and the shipper's merge `947f2c2` | "The security lead orders it, and the shipper merges exactly the approved commit." |
| 1:55 | `desk3-f3-tls`, then [role-lock.png](live-run/role-lock.png) | The migrator declines to take the reviewer role ("I'd be the reviewer of my own commit"), then live run 1's `400 … exclusive and currently held by another agent` | "One reviewer of record per finding. Switch won't give the role to a second agent." |
| 2:05 | **Live**, `desk3-intake` | As `user`: `@desk3-migrator call update_room_document on the "Crypto inventory" document in this room, appending the line "test edit by migrator", and post exactly what Switch answers. Do nothing else.` Answer: `403 … did not create document` | "And only the scout can change the inventory, so nobody quietly edits the board." |
| 2:15 | Terminal | `npm run judge`: the gate refusing every shortcut | "Git backs it up: main only takes a commit the reviewer approved, never twice, and an accepted risk can't touch code." |
| 2:30 | Terminal | `node tools/certificate.mjs verify docs/live-run-2/F1.cert.json --tests` | "Every ship gets a certificate, signed with ML-DSA, of what changed and what was approved." |
| 2:40 | `desk3-intake` | Shipped 3/6 · Open 3, and F3's production risk accepted | "Three fixes shipped, and the one thing outside our repo is an accepted risk with an owner and a review date. People made every decision; the agents did the work around them, in Switch." |

## Messages to type live

Arjun, in `desk3-f3-tls`:

```
@desk3-shipper ship F3
```

`user`, in `desk3-f3-tls` (the reviewer holds the role there already):

```
@desk3-migrator call assume_role("reviewer") in this room and post exactly what Switch answers. Do nothing else.
```

`user`, in `desk3-intake`:

```
@desk3-migrator call update_room_document on the "Crypto inventory" document in this room, appending the line "test edit by migrator", and post exactly what Switch answers. Do nothing else.
```

## Editing

- Speed up agent waits 2–4x and cut any pause longer than a few seconds.
  Don't cut the three refusals: they're the shots that show Switch doing
  the gating.
- Zoom in on each refusal message so the error is readable.
- Keep the address bar and bookmarks out of frame.

## If something goes wrong

- **An agent doesn't answer:** check it shows as running in Switch Console
  under Your Agents, then mention it again by its full `desk3-` name.
- **The migrator gets the reviewer role instead of a 400:** the reviewer no
  longer holds it. As `user`, send
  `@desk3-reviewer take the reviewer role in this room and confirm when you hold it`,
  wait for the confirmation, then retry.
- **The shipper refuses `user`:** check Home → Messaging apps in Switch
  Console shows Mattermost linked to `@user`.
- **A room is missing from the sidebar:** expand CHANNELS, or open
  `http://localhost:59881/switch/channels/<room>`.
