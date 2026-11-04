# Demo run-sheet

A 3-minute video. You play **Priya**, the security lead, in a normal Chrome
window, and **Arjun**, the engineer, in an Incognito window. Record the
screen at 1080p and keep both windows side by side when Arjun talks.

## Before recording

```sh
npm run reset          # planted code back in the local origin
```

- In Switch Console, delete the agents and rooms from the last run (or use a
  new team prefix in the form, such as `desk2`).
- Mattermost: Priya logged in in Chrome, Arjun in Incognito.
- Open `board.html` in a third tab (`npm run board` refreshes it).

## The beats

| Time | Screen | What happens | What you say (voice-over) |
|---|---|---|---|
| 0:00 | Board, all open | Six findings in a payments service | "Everything encrypted with RSA today can be recorded now and decrypted later by a quantum computer. Here's a payments service with six problems." |
| 0:15 | Switch Console form | Run the template: four agents, one room | "One Switch template creates the desk: a scout, a migrator on Claude, a reviewer on Codex, and a shipper." |
| 0:30 | desk-intake | Scout posts the inventory; six rooms appear in the sidebar | "The scout scans, writes a CycloneDX crypto inventory, and opens a private room per finding with the engineer who owns the code." |
| 0:50 | desk-f1-envelope | Migrator's plan: hybrid X25519 + ML-KEM-768, old envelopes stay readable | "It doesn't swap RSA one-for-one. It's a hybrid key wrap, and it asks Arjun what the code can't show." |
| 1:05 | Arjun replies | "Nothing else unwraps them. Keep the legacy read path." | |
| 1:15 | Reviewer verdict | Codex checks out the branch, runs tests and the scanner, approves the exact commit | "A different model reviews it, from the code, not the summary." |
| 1:30 | Arjun: "@desk-shipper ship it" | **Switch refuses: the shipper only takes orders from Priya** | "Arjun can't ship. Switch enforces that, not a prompt." |
| 1:40 | Priya: "@desk-shipper ship" | Shipper merges, tells the scout, board moves | |
| 1:55 | desk-f5-webhooks | Arjun: "merchants still verify ECDSA." Migrator switches to dual signatures | "Real migrations have constraints. They negotiate it in the room." |
| 2:20 | desk-f3-tls | Scout marked it external owner. Priya: "@desk-shipper accept risk: TLS is on the acquirer's gateway, change request sent" | "Some things aren't ours to fix. It's recorded in the repo with an owner and a review date." |
| 2:40 | Board | Shipped 2/6 · Accepted risk 1 · and the CBOM count going up | "Every number here is read from git. People decide, agents do the work around the decision." |

Speed up agent work in editing (2-4x), and cut any wait longer than a few
seconds. Don't cut the refusal: it's the shot that shows Switch doing the
gating.

## Messages to type

Priya, in `desk-intake` (only if the kickoff didn't start the scout):

```
@desk-scout scan demo-payments, write the inventory, and open a work room for every finding. Work F1, F5, F3, in that order.
```

Arjun, in `desk-f1-envelope`, answering the migrator's question:

```
@desk-migrator Nothing else unwraps them. Only this service opens card envelopes, and the vault RSA key lives in our secrets store. Keep the legacy read path for now; we'll re-wrap old envelopes in a later batch job.
```

Arjun, after the reviewer approves (this one is meant to be refused):

```
@desk-shipper ship it
```

Priya:

```
@desk-shipper ship
```

Arjun, in `desk-f5-webhooks`, when the migrator posts its plan:

```
@desk-migrator Careful: about 40 merchants still verify ECDSA with an old SDK we can't force them to upgrade this quarter. Keep the ECDSA signature working.
```

Priya, in `desk-f3-tls`:

```
@desk-shipper accept risk: production TLS terminates at the acquirer's edge gateway, outside our repo. Change request sent to their platform team; review in 90 days.
```

## If something goes wrong

- **An agent doesn't answer:** check it shows as running in Switch Console
  under Your Agents, then mention it again.
- **The reviewer isn't reached:** mention `@desk-reviewer` by name in the
  work room.
- **"crypto-desk gate: push refused":** the origin's hook says why. Most
  often the reviewer didn't push its approval mark
  (`refs/approved/<sha>`), or the branch moved after the review. Ask the
  reviewer to review the current head again.
- **The shipper refuses Priya:** check Home → Messaging apps shows Mattermost
  linked to your account (`@user`).
