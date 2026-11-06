# Crypto Migration Desk

[![CI](https://github.com/Dakshhhhh-ops/fliptheswitch/actions/workflows/ci.yml/badge.svg)](https://github.com/Dakshhhhh-ops/fliptheswitch/actions/workflows/ci.yml)

**Your encryption has an expiry date. Some of it is already past it.**

**[Open the desk app](https://dakshhhhh-ops.github.io/fliptheswitch/)** · [Judge it in 90 seconds](#judge-it-in-90-seconds) · [The live runs](docs/live-run-2/README.md) · [Why it needs Switch](#why-it-needs-switch) · [Run it yourself](#run-it-yourself)

Data sent today with classical crypto can be recorded now and decrypted once
a large quantum computer exists. [ssh2](https://github.com/mscdex/ssh2), one
of npm's most used SSH libraries, offers only classical key exchange. For
data that must stay secret for years, that's a problem now, not in 2035
([Mosca's rule](docs/SCANNER.md#moscas-rule)).

Crypto Migration Desk runs the migration in team chat with
[Switch](https://github.com/sandbox-quantum/switch). Four agents and two
people:

- a **scout** finds every quantum-vulnerable use of crypto and opens a
  private room per finding, with the engineer who owns the code
- a **migrator** (Claude Code) writes the fix with the engineer
- a **reviewer** on a different model (Codex) approves the exact commit
- a **shipper** merges it, and only on the **security lead's** word: Switch
  refuses anyone else, and git refuses anything unreviewed

## Judge it in 90 seconds

1. **Watch the agents in Switch:** [live run 2](docs/live-run-2/README.md),
   with a timestamped log and screenshots of the refusals.
2. **Check it yourself, nothing to install** (Node 24.7+):
   ```sh
   git clone https://github.com/Dakshhhhh-ops/fliptheswitch && cd fliptheswitch
   npm run judge
   ```
   24 checks in about a minute. It plays the desk's git moves against the
   real gate (every shortcut refused, the approved ship accepted), then checks
   **both live Switch runs** from the git history the agents left: their
   signed certificates, every push replayed through the gate, and the board.
3. **Scan your own code:** `node tools/cbom-scan.mjs ../your-repo`. Measured
   on labelled code: 100% precision, 94% recall ([more](docs/SCANNER.md)).

## The live runs

Run end to end in Switch twice, with nothing scripted. The latest:
**[live run 2](docs/live-run-2/README.md)** (`desk3`, 6 November 2026), with a
timestamped log of every message and push.

**Shipped 3/6 (F3 with a risk on record) · Open 3**

| Finding | What happened |
|---|---|
| **F5** webhooks, ECDSA | Arjun (the engineer): "40 merchants still verify ECDSA". So the fix dual-signs with ECDSA and ML-DSA-65. Approved first time, shipped as `90d83ac` |
| **F1** card keys, RSA-OAEP | Hybrid X25519 + ML-KEM-768, with RSA kept only to read old envelopes. Codex **requested changes** (the commit didn't say when RSA retires), the migrator fixed it, Codex approved. Shipped as `947f2c2` |
| **F3** TLS | Staging moved to hybrid TLS 1.3 (`a343979`). Production is on the acquirer's gateway, outside the repo: a change request, and an accepted risk with an owner and a review date (`374c45f`) |
| **People** | 3 answers from the engineer, 4 decisions from the security lead, no nudges. One retry after Codex's sandbox stalled on Windows |
| **Refusals** | Switch refused Arjun's "ship F3" [before any agent ran](docs/live-run-2/refusal-ship.png), and the migrator's edit to the scout's inventory with a [`403`](docs/live-run-2/inventory-lock-and-board.png). [Live run 1](docs/live-run/README.md) also caught its `400` for a second [reviewer](docs/live-run/role-lock.png) |

Check it from git: `node tools/replay.mjs docs/live-run-2/origin.bundle` and
`node tools/certificate.mjs verify docs/live-run-2/F1.cert.json --tests`.

## How it works

```mermaid
flowchart TB
  subgraph intake["desk-intake"]
    scout["@desk-scout<br/>scans, keeps the Crypto inventory"]
  end
  subgraph work["one private room per finding: desk-f5-webhooks · desk-f1-envelope · desk-f3-tls"]
    mig["@desk-migrator (Claude Code)<br/>plan → branch → tests"]
    eng(["Engineer<br/>adds what the code doesn't show"])
    rev["reviewer role → @desk-reviewer (Codex)<br/>APPROVED sha / CHANGES REQUESTED"]
    lead(["Security lead"])
    ship["@desk-shipper<br/>addressing: owner"]
  end
  scout -- "create_room + link_rooms" --> work
  eng <--> mig
  mig -- "hand-off to the reviewer role" --> rev
  rev -- "approved" --> lead
  lead -- "ship / accept risk" --> ship
  ship -- "shipped at sha" --> scout
```

1. The security lead runs the template. Switch creates the four agents and
   the intake room.
2. The scout scans, writes a CycloneDX CBOM and a **Crypto inventory**
   document, and opens a private room for each finding to work.
3. In each room the migrator posts a plan, the engineer adds what the code
   doesn't show, and the migrator pushes a branch with tests.
4. The agent holding the room's exclusive **reviewer** role checks out that
   commit, runs the tests and the scanner, and approves or requests changes.
   An approval is a `refs/approved/<sha>` mark in git, for that exact commit.
5. The security lead tells the shipper "ship" or "accept risk". The shipper
   merges, issues an ML-DSA-signed certificate, and tells the scout, which
   rescans and moves the board.

## Why it needs Switch

Take Switch away and the desk stops working. These parts are Switch's:

| Switch feature | What it does here | Without it | In the live run |
|---|---|---|---|
| Template | One form creates the four agents, the intake room, its guide document and the kickoff | Four agents and their rules set up by hand, per team | Run from a chat message to Switch's buddy agent |
| Agents creating rooms (`create_room`, `link_rooms`) | The scout opens a private room per finding with the right people | One shared channel for every finding | The scout opened the F5, F1 and F3 rooms itself |
| Addressing policies | `owner` on the shipper is the ship gate. `owner-agents` on the reviewer: only the security lead and the desk's own agents can ask it for a verdict | Any agent obeys anyone who can type in the room, so the engineer could ask the reviewer to approve | Arjun's "ship F3" refused before an agent ran ([screenshot](docs/live-run-2/refusal-ship.png)) |
| Exclusive room role | One reviewer of record per finding | Any agent can claim it reviewed | A second agent's `assume_role("reviewer")` got Switch's `400` ([screenshot](docs/live-run/role-lock.png)) |
| Room documents | Only the scout can edit the inventory, so the board can't be quietly changed | Any agent can rewrite it | The migrator's edit got Switch's `403` ([screenshot](docs/live-run-2/inventory-lock-and-board.png)) |
| Targeted messages | Hand-offs go to whoever holds the reviewer role; the shipper tells the scout what shipped | Agents polling chat for their name | Every hand-off and ship notice |
| Rooms shared by people and agents | Engineer, security lead and agents negotiate in one thread | Constraints relayed by hand between tools | Arjun's constraints changed both fixes |
| Different providers in one room | Claude Code writes, Codex reviews | The author marks its own work | Codex requested changes on F1 in both runs ([run 1 screenshot](docs/live-run/review-changes-requested.png)) |

Switch decides **who** may order a ship, and who may ask the reviewer for a verdict. Git decides **what** a ship may
contain: the origin's gate only lets main take a merge of an approved commit,
or an accepted risk that changes no code. Every rule, what enforces it and
what proves it: [docs/ENFORCEMENT.md](docs/ENFORCEMENT.md).

## Run it yourself

Every step that doesn't need a person is a command. The whole run, with every
message to send and what to do if it gets stuck: [docs/RUN-SHEET.md](docs/RUN-SHEET.md).

You need [Switch Console](https://github.com/sandbox-quantum/switch/releases/latest)
with its Mattermost (which needs Docker), Node 24.7+, git 2.38+ and Claude
Code; Codex is optional. Once per machine, link your Mattermost account to
your Switch user (Home → Messaging apps), so the shipper knows it's you.

```sh
npm run doctor         # what this machine has and what's missing, with the fix for each
npm run desk:up        # origin, a fresh team prefix, the engineer's account, templates, Codex check;
                       # prints the one message that starts the desk
npm run desk:watch     # logs every message and push, and says when an agent is waiting on you
npm run desk:package   # keeps the run as docs/live-run-N and verifies it
```

## Repository

```
template/      the Switch template (and a backup that declares the rooms)
tools/         scanner and its benchmark, Mosca's rule, certificates, board, live-run replay
scripts/       judge, doctor, desk:up/watch/package, the git gate, origin setup
web/           the desk app: React UI on a Node API that reads the agents' git
demo-payments/ the payments service being migrated, with six planted problems
docs/          both live runs, enforcement, scanner, desk app, real-world scans
test/          73 tests, plus demo-payments' own; CI runs them on Linux, Windows and macOS
```

More: [the scanner and CI gate](docs/SCANNER.md) ·
[the desk app](docs/DESK-APP.md) ·
[what it found in ssh2 and jose](docs/REAL-SCANS.md) ·
[the live run, step by step](docs/RUN-SHEET.md) ·
[the demo video run-sheet](docs/DEMO.md)

## Limits

- The scanner uses fixed rules for JavaScript and TypeScript, not a parser:
  predictable and measured, not complete ([details](docs/SCANNER.md#how-accurate-it-is)).
- The origin is a local folder with no accounts, so git can't tell which
  agent pushed. Switch's addressing decides who may order a ship; the gate
  decides what it may contain.
- On Windows, Switch Console can't grant a GitHub connection, so the agents
  push to a local origin instead of opening pull requests.
- Switch has no scheduled messages yet, so accepted-risk review dates are
  recorded, not reminded.
