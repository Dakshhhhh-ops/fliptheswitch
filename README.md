# Crypto Migration Desk

[![CI](https://github.com/Dakshhhhh-ops/fliptheswitch/actions/workflows/ci.yml/badge.svg)](https://github.com/Dakshhhhh-ops/fliptheswitch/actions/workflows/ci.yml)

**A team of agents and two people migrate a codebase off quantum-vulnerable crypto, in team chat, with [Switch](https://github.com/sandbox-quantum/switch) deciding who may approve and who may ship.**

Your encryption has an expiry date, and some of it is already past it: data
sent today can be recorded now and decrypted once a large quantum computer
exists. The desk finds that crypto, fixes it with the engineer who owns it,
and ships only what a second model approved and the security lead ordered.

### Quick look: no Switch, no Docker, about 2 minutes

Needs only Node 24.7+ and git.

```sh
git clone https://github.com/Dakshhhhh-ops/fliptheswitch && cd fliptheswitch
npm install     # nothing to fetch: the desk has no dependencies
npm run scan    # the six planted problems in demo-payments/, ranked by Mosca's rule, and a CycloneDX CBOM
npm run judge   # 32 checks in about a minute: every shortcut to main refused by the git gate, then all three live Switch runs re-verified from the agents' git
npm run board   # board.html: each finding's state, read from git (all open on a fresh clone)
npm test        # 90 tests, plus demo-payments' 8: scanner, gate, signatures, certificates, board, templates, live-run replays
```

**Full run on real Switch:** [run it yourself](#run-it-yourself), about an hour, most of it watching the agents.

## What breaks if you remove Switch

The scanner and the git gate run without Switch. The desk doesn't: every
rule about **who** may do what lives in Switch, and runs on a real Switch
server in [three live runs](#the-live-runs).

| Remove this Switch feature | And this breaks | Where it is | Seen in a live run |
|---|---|---|---|
| Addressing policy `owner` on the shipper | Anyone in the room can tell the shipper to merge. Today Switch answers them itself, before the shipper runs | `addressing: owner` in the [template](template/crypto-desk.template.yaml) | Arjun's "ship F3" refused in runs 2 and 3 ([screenshot](docs/live-run-3/refusal-ship.png)) |
| Addressing policy `owner-agents` on the reviewer | The engineer can ask the reviewer to approve. Today only the security lead and the desk's own agents can address it | `addressing: owner-agents` in the template | Run 3: Arjun's "approve it" refused, while the migrator's hand-off in the same second got through ([screenshot](docs/live-run-3/refusal-reviewer.png)) |
| Exclusive room role | Any agent can claim it reviewed. Today there is one `reviewer` per finding's room | The scout's `create_room` defines `reviewer` with `exclusive: true` | A second agent's `assume_role("reviewer")` got Switch's `400` ([screenshot](docs/live-run/role-lock.png)) |
| Room documents | Any agent can rewrite the board. Today only the scout, which created the "Crypto inventory", can edit it | The scout's `create_room_document` | The migrator's edit got Switch's `403` ([screenshot](docs/live-run-2/inventory-lock-and-board.png)) |
| Agents creating rooms (`create_room`, `link_rooms`) | One shared channel for every finding, or a person making rooms. Today the scout opens a private room per finding, with the engineer in it | The scout's instructions | The scout opened the F5, F1 and F3 rooms itself |
| Targeted messages (`send_targeted_message`, `target_roles`) | Hand-offs by polling chat. Today the migrator hands off to whoever holds the reviewer role, and the shipper tells the scout | The migrator's and shipper's instructions | Every hand-off and ship notice ([log](docs/live-run-3/chat-log.md)) |
| Different providers in one room | The author marks its own work. Today Claude Code writes and Codex reviews | `provider` and `review_provider` in the template | Codex requested changes on F1 in every run, and on F5 in run 3 ([screenshot](docs/live-run-3/changes-requested.png)) |
| Template | Four agents and their rules set up by hand, per team. Today one form creates them, the intake room and the kickoff | [template/crypto-desk.template.yaml](template/crypto-desk.template.yaml) | Run from a chat message to Switch's buddy agent |

Switch decides **who** may order a ship or ask for a verdict. Git decides
**what** a ship may contain: the origin's gate only lets main take a merge of
an approved commit, or an accepted risk that changes no code, each signed
with the reviewer's or shipper's key. Every rule, what enforces it and what
proves it: [docs/ENFORCEMENT.md](docs/ENFORCEMENT.md).

## The moment that needs Switch

From [live run 3](docs/live-run-3/chat-log.md), 7 November 2026. Times are
UTC.

```text
desk4-f5-webhooks, the fix just pushed:
06:04:45  arjun (engineer)      @desk4-reviewer looks good to me, approve it
06:04:45  desk4-migrator        @reviewer F5 is ready for review. [...]
06:05:03  desk4-reviewer        @arjun I only take instructions from my owner, and this chat
          (posted by Switch)    account isn't linked to a Switch user yet [...]
06:05:23  desk4-reviewer        assumed the `reviewer` role      <- the migrator got through
06:10:34  desk4-reviewer        CHANGES REQUESTED 1. both headers sign only the body [...]

desk4-f3-tls, after the reviewer's signed APPROVED:
06:47:19  arjun (engineer)      @desk4-shipper ship F3
06:47:38  desk4-shipper         @arjun I only take instructions from my owner [...]
          (posted by Switch)    ...nothing merged, no shipper session ran
06:52:55  user (security lead)  @desk4-shipper ship F3
06:54:22  git                   main 525a4a3 Ship F3 [...] signed by the shipper's key:
                                room e6e3…, ordered-by user, order-text "ship F3"
```

Both refusals are Switch's own reply for an addressing policy
(`ADDRESSING_UNCLAIMED_MESSAGE` in Switch's
[addressing.py](https://github.com/sandbox-quantum/switch/blob/main/core/switch_core/delivery/addressing.py)):
`owner-agents` on the reviewer, `owner` on the shipper.

**"Isn't linked" is a refusal, not a failure to recognise him.** Arjun's chat
account isn't linked to any Switch user, so it matches nobody, and the policy
admits only the owner. Linking it wouldn't let him in: Switch would refuse
him with different words, "You're not permitted to direct messages to me in
this room". Switch's own tests pin both cases for an owner-only policy:
`test_unclaimed_sender_gets_link_your_account_wording` and
`test_other_user_denied_with_generic_wording`, both `allowed is False`
([test_addressing_enforcement.py](https://github.com/sandbox-quantum/switch/blob/main/core/tests/switch_core/delivery/test_addressing_enforcement.py)).
Not shown live: the second wording needs a second Switch user linked to
Arjun's account, which is done in Switch Console by that user; the
[run sheet](docs/RUN-SHEET.md) has the steps.

![Switch refusing the engineer's request that the reviewer approve](docs/live-run-3/refusal-reviewer.png)

## The live runs

Run end to end in Switch three times, nothing scripted. The latest:
**[live run 3](docs/live-run-3/README.md)** (`desk4`, 7 November 2026), the
first with the reviewer on `owner-agents` and every approval and ship signed,
with a timestamped log of every message and push.
[Run 2](docs/live-run-2/README.md) and [run 1](docs/live-run/README.md) are
there too.

![Live run 3's board, read from the agents' git](docs/img/board-live-run-3.png)

| Finding | What happened |
|---|---|
| **F5** webhooks, ECDSA | Arjun: "40 merchants still verify ECDSA", so the fix dual-signs with ECDSA and ML-DSA-65. Codex **requested changes**: the repo says webhook signatures are valid for 5 minutes, and nothing signed a time. The migrator asked Arjun, signed a timestamp, and shipped as `4769ce0` |
| **F1** card keys, RSA-OAEP | Hybrid X25519 + ML-KEM-768, RSA kept only to read old envelopes. Codex **requested changes** (no end date for RSA in the commit). Shipped as `a0f015b` |
| **F3** TLS | Staging moved to TLS 1.3 with hybrid key exchange (`525a4a3`). Production is on the acquirer's gateway: a change request, and a signed accepted risk with a review date (`695ea59`) |
| **Refusals** | Switch refused Arjun's "approve it" and his "ship F3". The shipper refused the security lead's "ship F5" sent before the verdict |
| **What went wrong** | Switch didn't deliver two messages to an agent, so each was sent again, and the Codex reviewer stalled once until an old session of its own was stopped ([details](docs/live-run-3/README.md#what-went-wrong-and-what-it-cost)) |

Check it from git: `node tools/replay.mjs docs/live-run-3/origin.bundle` and
`node tools/certificate.mjs verify docs/live-run-3/F1.cert.json --tests`.
`npm run snapshot -- --run docs/live-run-3` redraws the board image above
from the same git.

## How it works

```mermaid
flowchart TB
  subgraph intake["desk-intake"]
    scout["@desk-scout<br/>scans, keeps the Crypto inventory"]
  end
  subgraph work["one private room per finding: desk-f5-webhooks · desk-f1-envelope · desk-f3-tls"]
    mig["@desk-migrator (Claude Code)<br/>plan → branch → tests"]
    eng(["Engineer<br/>adds what the code doesn't show"])
    rev["reviewer role → @desk-reviewer (Codex)<br/>addressing: owner-agents"]
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
   An approval is a signed `refs/approved/<sha>` mark in git, for that exact
   commit.
5. The security lead tells the shipper "ship" or "accept risk". The shipper
   merges, issues an ML-DSA-signed certificate, and tells the scout, which
   rescans and moves the board.

## Run it yourself

**Requirements**

- [ ] [Switch Console](https://github.com/sandbox-quantum/switch/releases/latest), with a server on this computer and its bundled Mattermost
- [ ] Docker, running (for that Mattermost)
- [ ] Node 24.7+ and git 2.38+
- [ ] Claude Code, signed in. Codex signed in, optional: without it, set both providers to `claude`
- [ ] Your Mattermost account linked to your Switch user (Home → Messaging apps), so the shipper knows it's you

`npm run doctor` checks each of these on your machine and prints ✔ or ✘ with
the fix. Every step that doesn't need a person is a command; every message to
send, and what to do if it gets stuck: [docs/RUN-SHEET.md](docs/RUN-SHEET.md).

```sh
npm run doctor         # what this machine has and what's missing, with the fix for each
npm run desk:up        # origin and signing keys, a fresh team prefix, the engineer's account, templates;
                       # prints the one message that starts the desk
npm run desk:watch     # logs every message and push, and says when an agent is waiting on you
npm run desk:package   # keeps the run as docs/live-run-N and verifies it
```

## Repository

```
template/      the Switch template (and a backup that declares the rooms)
tools/         scanner and its benchmark, Mosca's rule, signing, certificates, board, live-run replay
scripts/       judge, doctor, desk:up/watch/package, snapshot, the git gate, origin setup
web/           the desk app: React UI on a Node API that reads the agents' git
demo-payments/ the payments service being migrated, with six planted problems
docs/          three live runs, enforcement, scanner, desk app, real-world scans
test/          the tests above, plus demo-payments' own; CI runs them on Linux, Windows and macOS
```

More: [the desk app](https://dakshhhhh-ops.github.io/fliptheswitch/) (a hosted snapshot) ·
[the scanner and CI gate](docs/SCANNER.md) ·
[what it found in ssh2 and jose](docs/REAL-SCANS.md) ·
[the live run, step by step](docs/RUN-SHEET.md)

## Limits

- The scanner uses fixed rules for JavaScript and TypeScript, not a parser:
  predictable and measured, not complete ([details](docs/SCANNER.md#how-accurate-it-is)).
- The origin is a local folder with no accounts. Approvals and ships are
  signed with the reviewer's and shipper's keys, and the gate checks them,
  but on one machine every agent can read every key file: the signature
  proves which key, not which process.
- On Windows, Switch Console can't grant a GitHub connection, so the agents
  push to a local origin instead of opening pull requests.
- Switch has no scheduled messages yet, so accepted-risk review dates are
  recorded, not reminded.
