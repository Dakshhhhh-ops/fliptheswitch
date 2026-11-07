# Crypto Migration Desk

[![CI](https://github.com/Dakshhhhh-ops/fliptheswitch/actions/workflows/ci.yml/badge.svg)](https://github.com/Dakshhhhh-ops/fliptheswitch/actions/workflows/ci.yml)

> **Verified end to end:** 3 live runs on real Switch, nothing scripted. Live run 3 shipped 5 of 6 findings. Switch refused the engineer's approve and ship requests live. Re-check everything from git with one command: `npm run judge`.

**Scanners find broken crypto. They can't know that 40 merchants still depend on it. Crypto Migration Desk negotiates the fix with the people who know, and the approval itself is signed with post-quantum crypto.**

### Negotiated migration

The fix isn't generated, it's negotiated: agents take each problem to the
engineer who owns the code, in its own [Switch](https://github.com/sandbox-quantum/switch)
room, and change the plan around what people say. A second model checks it,
and only the security lead can ship; Switch turns everyone else away.

**Facts no scanner could find**, said by Arjun, the engineer, and the security lead in live run 3 (names starting `desk4` are run 3's agents and rooms):

| | What only people knew | Fixing from the code alone | What the run did |
|---|---|---|---|
| F5 webhooks | [“About 40 merchants still verify ECDSA on old SDKs”](docs/live-run-3/chat-log.md?plain=1#L31) | Replacing ECDSA outright stops those merchants verifying webhooks. | [Dual-signed: ECDSA kept beside ML-DSA-65 until 30 June 2027.](docs/live-run-3/chat-log.md?plain=1#L33) |
| F1 card keys | [“old envelopes in the vault must stay readable”](docs/live-run-3/chat-log.md?plain=1#L62) | Swapping RSA out leaves stored envelopes unreadable. | [New envelopes hybrid; RSA kept read-only for old ones until they are resealed.](docs/live-run-3/chat-log.md?plain=1#L81) |
| F3 TLS | [“has to stay secret for at least 7 years”](docs/live-run-3/chat-log.md?plain=1#L84) | The scanner could only say "lifetime unknown: ask the engineer". | [Ranked by Mosca's rule: already late by 1 year.](docs/live-run-3/chat-log.md?plain=1#L111) |
| F3 TLS | [“Production TLS stays on the acquirer's edge gateway, outside our repo”](docs/live-run-3/chat-log.md?plain=1#L84) | The repo fix looks done; production stays classical. | [Staging fixed; production recorded as a signed accepted risk, with a change request.](docs/live-run-3/chat-log.md?plain=1#L113) |
| F2 session keys | [“the acquirer's settlement client is built from this repo”](docs/live-run-3/chat-log.md?plain=1#L163) | Keep a P-256 fallback for an unknown peer. | [Both sides move to the hybrid together, with no classical fallback.](docs/live-run-3/chat-log.md?plain=1#L165) |
| F4 receipts | [“support re-issues it as v2 from our records”](docs/live-run-3/chat-log.md?plain=1#L217) | Keeping old receipts checkable means keeping SHA-1 in the code. | [SHA-1 removed completely; old receipts are re-issued.](docs/live-run-3/chat-log.md?plain=1#L218) |
| F6 records | [“our DBA re-encrypts every stored record to AES-256-GCM”](docs/live-run-3/chat-log.md?plain=1#L231) | Keeping old records readable means keeping AES-128 in the code. | [AES-256-GCM only, behind a tested gate that blocks deploy while old records remain.](docs/live-run-3/chat-log.md?plain=1#L245) |

**It eats its own dog food.** The desk that migrates you to post-quantum signs
its own approvals and ships with ML-DSA-65, so its audit trail survives Q-Day too.

**[Open the desk app](https://dakshhhhh-ops.github.io/fliptheswitch/):** flip Switch off and watch real moments go wrong, [scan your own code](https://dakshhhhh-ops.github.io/fliptheswitch/#/scan), replay [run 3](https://dakshhhhh-ops.github.io/fliptheswitch/#/run), or [forge a ship](https://dakshhhhh-ops.github.io/fliptheswitch/#/verify) and watch ML-DSA-65 refuse it.

### Quick look: only Node 24.7+ and git, about 2 minutes

Or [open a Codespace](https://codespaces.new/Dakshhhhh-ops/fliptheswitch?quickstart=1) and run `npm run judge` (a few minutes there).

```sh
git clone https://github.com/Dakshhhhh-ops/fliptheswitch && cd fliptheswitch
npm install     # nothing to fetch
npm run scan    # the six planted problems in demo-payments/, ranked by Mosca's rule, and a CycloneDX CBOM
npm run judge   # verify every claim in this README in about a minute: 34 checks against the git gate and all three live runs
node tools/board.mjs --origin docs/live-run-3/origin.bundle   # board.html: live run 3's real board, read from the agents' git
npm test        # 103 tests, plus demo-payments' 8
```

`demo-payments/` is planted on purpose, so every run starts from the same six
problems and can be compared and replayed. The scanner also runs on real
code: [ssh2](docs/REAL-SCANS.md) (31 findings in 10 files) and
[jose](docs/REAL-SCANS.md) (25 in 7). Its 100% precision and 94% recall are
on a set we labelled ourselves ([details](docs/SCANNER.md#how-accurate-it-is)).

**Full Switch run:** [about an hour](#run-it-yourself).

Findings are ranked by **Mosca's rule**: data that must stay secret longer than the years left before a quantum computer, minus the migration, is late today.

### One finding, end to end: F5 in live run 3 (UTC)

| | |
|---|---|
| [05:51](docs/live-run-3/chat-log.md?plain=1#L27) | The scout opens F5's own room with the engineer and asks what the code doesn't show |
| [05:53](docs/live-run-3/chat-log.md?plain=1#L31) | Arjun: "About 40 merchants still verify ECDSA on old SDKs, so we can't drop it yet." |
| [06:01](docs/live-run-3/chat-log.md?plain=1#L33) | The migrator: "Plan change": keep ECDSA beside ML-DSA-65 until 30 June 2027 |
| [06:10](docs/live-run-3/chat-log.md?plain=1#L44) | Codex requests changes (nothing signs a time for the 5-minute replay window); [approves](docs/live-run-3/chat-log.md?plain=1#L52) the fix at 06:14 |
| [06:16](docs/live-run-3/chat-log.md?plain=1#L54) | The security lead: "ship F5"; the [signed merge](docs/live-run-3/chat-log.md?plain=1#L56) lands on main |
| [06:18](docs/live-run-3/chat-log.md?plain=1#L60) | The scout moves the board: Shipped 1/6 |

## What breaks if you remove Switch

Every rule about **who** may do what lives in Switch, on a real Switch server
in [three live runs](#the-live-runs).

| Remove this Switch feature | And this breaks | Seen in a live run |
|---|---|---|
| Shipper obeys only its owner | Anyone in the room can order a merge | Arjun's "ship F3" refused by Switch ([screenshot](docs/live-run-3/refusal-ship.png)). Linked or not, a non-owner is refused; only the message differs (see below) |
| Reviewer takes requests only from the owner and their agents | The engineer can ask for an approval | Arjun's "approve it" refused; the migrator's hand-off got through ([screenshot](docs/live-run-3/refusal-reviewer.png)) |
| Exclusive `reviewer` room role | Any agent can claim it reviewed | Switch's `400` to a second claimant ([screenshot](docs/live-run/role-lock.png)); F6 couldn't ship on a reviewer without the role |
| Room documents | Any agent can rewrite the board | Switch's `403` to the migrator ([screenshot](docs/live-run-2/inventory-lock-and-board.png)) |
| Agents creating rooms (`create_room`, `link_rooms`) | One channel for every finding | The scout opened all six rooms itself |
| Targeted messages and roles | Hand-offs by polling chat | Every hand-off and ship notice ([log](docs/live-run-3/chat-log.md)) |
| Different providers in one room | The author marks its own work | Codex requested changes on F1, F2, F4, F5 and F6 ([screenshot](docs/live-run-3/changes-requested.png)) |
| [Template](template/crypto-desk.template.yaml) | Four agents set up by hand | Started from one chat message to Switch's buddy agent |

Switch decides **who**; git decides **what**: main only takes a signed merge of
an approved commit, or a signed accepted risk that changes no code
([every rule and its proof](docs/ENFORCEMENT.md)).

## The moment that needs Switch

From [live run 3](docs/live-run-3/chat-log.md), times in UTC.

```text
desk4-f5-webhooks, the fix just pushed:
06:04:45  arjun (engineer)      @desk4-reviewer looks good to me, approve it
06:04:45  desk4-migrator        @reviewer F5 is ready for review. [...]
06:05:03  desk4-reviewer        @arjun I only take instructions from my owner, and this chat
          (posted by Switch)    account isn't linked to a Switch user yet [...]
06:05:23  desk4-reviewer        assumed the `reviewer` role      <- the migrator got through

desk4-f3-tls, after the reviewer's signed APPROVED:
06:47:19  arjun (engineer)      @desk4-shipper ship F3
06:47:38  desk4-shipper         @arjun I only take instructions from my owner [...]
          (posted by Switch)    ...nothing merged, no shipper session ran
06:52:55  user (security lead)  @desk4-shipper ship F3
06:54:22  git                   main 525a4a3 Ship F3 [...] signed by the shipper's key:
                                room e6e3…, ordered-by user, order-text "ship F3"
```

**Linked or not, Arjun is refused.** Switch has two replies to a non-owner. If his chat account isn't linked to a Switch user, he gets the one recorded here: "I only take instructions from my owner, and this chat account isn't linked to a Switch user yet". If it is linked, he gets "You're not permitted to direct messages to me in this room". Both are refusals: the decision is `allowed = False` either way, and only the wording changes ([addressing.py](https://github.com/sandbox-quantum/switch/blob/main/core/switch_core/delivery/addressing.py), with both cases pinned in [test_addressing_enforcement.py](https://github.com/sandbox-quantum/switch/blob/main/core/tests/switch_core/delivery/test_addressing_enforcement.py)). Linking him doesn't make him the owner, so nothing he says reaches the shipper.

<p>
<img src="docs/live-run-3/refusal-reviewer.png" width="49%" alt="Switch refusing the engineer's request that the reviewer approve">
<img src="docs/live-run-3/reviewer-addressing-console.png" width="49%" alt="Switch Console: who can talk to the reviewer">
</p>

## The live runs

**[Live run 3](docs/live-run-3/README.md)**, with a timestamped log of every
message and push: **shipped 5 of 6**, plus F3's production TLS as an accepted
risk. [Run 2](docs/live-run-2/README.md) and [run 1](docs/live-run/README.md) too.

![Live run 3's board, read from the agents' git](docs/img/board-live-run-3.png)

Codex requested changes on 5 of the 6 fixes before approving. F6 (`b8180e4`) is **not shipped**: Codex hit its usage limit while holding the reviewer role; it re-reviews when the limit resets (17 November), then the lead ships.

The run wasn't smooth: four messages were sent again because Switch started
no agent for them, the server crashed once under low memory, and the Codex
reviewer stalled three times. All of it is in the
[run's write-up](docs/live-run-3/README.md#what-went-wrong-and-what-it-cost).

## Run it yourself

**Requirements**

- [ ] [Switch Console](https://github.com/sandbox-quantum/switch/releases/latest), with a server on this computer and its bundled Mattermost
- [ ] Docker, running (for that Mattermost)
- [ ] Node 24.7+ and git 2.38+
- [ ] Claude Code, signed in. Codex signed in, optional: without it, set both providers to `claude`
- [ ] Your Mattermost account linked to your Switch user (Home → Messaging apps), so the shipper knows it's you

Every command, every message to send, and what to do if it gets stuck:
[docs/RUN-SHEET.md](docs/RUN-SHEET.md).

More: [the scanner and its CI gate](docs/SCANNER.md).

## Built for Flip the Switch

- **Ours:** the template, agents' rules, scanner, git gate, signing,
  certificates, board, desk app, demo-payments and every live run. MIT
  licensed.
- **Not ours:** [Switch](https://github.com/sandbox-quantum/switch) (v0.40.1,
  run unmodified through Switch Console, with its bundled Mattermost), Node's
  built-in `node:crypto`, and the desk app's React and Vite.

## Limits

- The scanner uses fixed rules for JavaScript and TypeScript, not a parser:
  predictable and measured, not complete.
- The ML-DSA signature binds Switch's facts (room, role, who ordered, the
  order's text) to an exact commit, so later changes show up in an audit. On
  one machine every agent can read every key file, so it detects tampering
  rather than preventing it; production would keep each key in a KMS or HSM.
- On Windows, Switch Console can't grant a GitHub connection, so the agents
  push to a local origin instead of opening pull requests.
