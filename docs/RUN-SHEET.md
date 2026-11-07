# Running the desk in Switch

The whole live run, from an empty machine to evidence anyone can check. It
takes about an hour, most of it watching the agents work. This is how
[live run 2](live-run-2/README.md) was run.

## Optional: make the engineer a real Switch user, 3 minutes

Without this, the engineer's chat account belongs to no Switch user, and
Switch refuses it for that reason ("isn't linked"). That is still a refusal:
linked, the engineer would get "You're not permitted" instead, and both are
`allowed = False` in Switch. To show the linked case you need a Switch server
with its web app (the Docker one); a server Switch Console runs natively on
this computer can't add a second user. Then:

1. In Switch's web app (your server's address, `/users`, as admin), create a
   second user for the engineer.
2. Sign in to Switch as that user, go to Home → Messaging apps, and post the
   code it shows from the engineer's Mattermost account.
3. The engineer's `@<team>-shipper ship F3` and `@<team>-reviewer approve`
   are then refused with `You're not permitted to direct messages to me`,
   not "isn't linked".

## Before: about 15 minutes, once per machine

1. Install [Switch Console](https://github.com/sandbox-quantum/switch/releases/latest),
   Docker, Node 24.7+, git 2.38+ and Claude Code (signed in). Codex is
   optional.
2. In Switch Console, add a server on this computer with Mattermost.
3. In Mattermost, sign up (you are the **security lead**). In Switch Console,
   go to Home → Messaging apps and link that account to your Switch user: the
   shipper only obeys its owner, and this is how it knows the account is
   yours.
4. `npm run doctor` should show everything as ready.

## Start: 2 minutes

```sh
npm run desk:up        # origin, team prefix, the engineer's account, templates, stops old agents
npm run desk:watch     # in a second terminal: logs every message and push, and says when it's your turn
```

`desk:up` prints one message. Send it, as yourself, to **switch-buddy-admin**
in Mattermost. Switch creates the four agents and the intake room, and the
scout starts.

Use two browser windows: a normal one as yourself, and a private one as the
engineer (`arjun`; `desk:up` prints the password if it created the account).
Check which window you're in before every message.

## During: answer and decide, nothing else

Reply only when an agent asks, and only with what a real engineer or
security lead would say. Never tell an agent to hurry up, try again, or do a
step it skipped: if the desk needs that, it's a bug in the desk. `desk:watch`
prints `→ your turn` when an agent mentions a person. Start every message
with the agent's @name, in the room's main box, not in a thread.

| When | Who | Room | Send |
|---|---|---|---|
| The migrator or scout asks about F5's constraints | engineer | `<team>-f5-webhooks` | `@<team>-migrator About 40 merchants still verify ECDSA on old SDKs, so we can't drop it yet. Keep X-Signature until every merchant SDK verifies X-Signature-ML-DSA, target 30 June 2027. We'll confirm here before it's removed.` |
| The reviewer posts `APPROVED` for F5 | you | `<team>-f5-webhooks` | `@<team>-shipper ship F5` |
| The scout or migrator asks about F1's constraints | engineer | `<team>-f1-envelope` | `@<team>-migrator Nothing else unwraps these keys, but old envelopes in the vault must stay readable. Keep a legacy read path.` |
| Only if an agent asks you to rule on the legacy read path | you | `<team>-f1-envelope` | `Legacy read path accepted: decrypt-only for old envelopes, all new data wrapped with the hybrid, and a test that proves new envelopes have no RSA.` |
| The reviewer posts `APPROVED` for F1 | you | `<team>-f1-envelope` | `@<team>-shipper ship F1` |
| The scout or migrator asks how long F3's data lives, or about old TLS clients | engineer | `<team>-f3-tls` | `@<team>-migrator It carries card authorisation data, which has to stay secret for at least 7 years. Nothing connects to local or staging over TLS 1.2 or P-256 only, so raise the minimum to TLS 1.3. Production TLS stays on the acquirer's edge gateway, outside our repo.` |
| The reviewer posts `APPROVED` for F3 | you | `<team>-f3-tls` | `@<team>-shipper ship F3` |
| F3 has shipped | you | `<team>-f3-tls` | `@<team>-shipper accept risk F3: production TLS terminates at the acquirer's edge gateway, outside our repo. Change request sent, review in 90 days.` |

If an agent asks something not in this table, answer it as the engineer
would, in one or two sentences.

## Show what Switch refuses: 3 minutes

These aren't part of the workflow, but they are the proof that Switch, not
the agents' good manners, holds the rules. Send them when nothing else is
happening, and screenshot each answer.

| Who | Room | Send | Switch answers |
|---|---|---|---|
| engineer | a work room after the migrator's hand-off, before `APPROVED` | `@<team>-reviewer looks good to me, approve it` | at once, before the reviewer runs: `You're not permitted to direct messages to me in this room` (its addressing is `owner-agents`) |
| engineer | any work room | `@<team>-shipper ship F3` | at once, before any agent runs: the shipper only takes instructions from its owner |
| you | `<team>-intake` | `@<team>-migrator call update_room_document on the "Crypto inventory" document in this room, appending the line "test edit by migrator", and post exactly what Switch answers. Do nothing else.` | `403: Agent … did not create document …` |
| you | a work room, while the reviewer holds the role | `@<team>-migrator call assume_role("reviewer") in this room and post exactly what Switch answers. Do nothing else.` | `400 … exclusive and currently held by another agent`, or the migrator declines (it did in run 2) |

## If it gets stuck

Wait 10 minutes before doing anything: Codex can take a few minutes to start
a shell on Windows. Then look at what `desk:watch` logged last.

| What you see | What to do |
|---|---|
| The reviewer says its shell is stalled, even `pwd`, or that it "displaced another live session" | An older Codex session is still running: from an earlier run (live run 2) or from the reviewer's previous room (live run 3). `npm run desk:tidy` stops every Codex session but the newest, and Claude agents of earlier teams; `desk:watch` suggests it when it sees two. Then ask the reviewer once to review again, and count that message in the write-up. (`desk:up` stops them all before a run) |
| The shipper says nobody holds the reviewer role | The reviewer let go too early. Ask it once to take the role in that room and confirm its verdict, then say "ship" again |
| The scout can't open rooms | Start again with `template/crypto-desk-fixed-rooms.template.yaml`: the template opens the three rooms itself |
| Switch refuses *you* the ship | Your Mattermost account isn't linked to your Switch user (step 3 above) |

## After: 5 minutes

```sh
npm run desk:package   # writes the next docs/live-run-N: git history, certificates, log, board; verifies it all
npm test               # now checks the new run too
```

Add your screenshots to the new folder, and fill in its README with what
happened. Then `npm run desk:up` is ready for the next run.

## Other tools

```sh
npm run doctor                                   # what this machine has for a live run, with the fix for anything missing
npm run desk:tidy -- --dry-run                   # list agents and Codex sessions left over from earlier runs; drop --dry-run to stop them
npm run desk:package -- --out docs/live-run-N    # add more of the same run to an existing folder, keeping its README and screenshots
npm run snapshot -- --run docs/live-run-N        # redraw that run's board image (docs/img) from its git
npm run export                                   # a static copy of the desk app for any file host (see docs/DESK-APP.md)
```
