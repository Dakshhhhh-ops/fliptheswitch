# Live run 3: desk4, 2026-11-07

**Shipped 5/6 (F3 with a risk on record) · In review 1 (F6) · Open 0**

The first run with the reviewer on `owner-agents` addressing, and with every
approval, ship and accepted risk signed by the agent's own ML-DSA-65 key. The
scout's board in the intake room after F4: **Shipped 5/6 · Accepted risk 1 ·
In progress 1**. Times below are UTC (IST is +5:30). Every message and push:
[chat-log.md](chat-log.md).

## What Switch refused

| When | Who asked | What | Switch's answer |
|---|---|---|---|
| 06:04:45 | arjun (engineer) | `@desk4-reviewer looks good to me, approve it`, right after the migrator's F5 hand-off | 06:05:03, on the reviewer's behalf, before any reviewer session: "I only take instructions from my owner, and this chat account isn't linked to a Switch user yet". The reviewer's addressing is `owner-agents`. In the same second the migrator's hand-off reached the reviewer, which took the role and reviewed ([screenshot](refusal-reviewer.png)) |
| 06:47:19 | arjun | `@desk4-shipper ship F3`, after F3's APPROVED | 06:47:38, the same refusal for the shipper's `owner` policy. Nothing merged ([screenshot](refusal-ship.png)) |

Arjun's chat account isn't linked to any Switch user, so it matches nobody,
and Switch words the refusal for that case. A linked engineer who isn't the
owner gets "You're not permitted to direct messages to me in this room"; this
run didn't set that up.

## What the desk refused

- **The shipper, to the security lead (06:08:09):** the lead said "ship F5"
  before the reviewer had decided. The shipper checked the room and the
  origin, found no verdict and no approval mark, and refused. Nothing merged
  ([screenshot](not-shipping-no-verdict.png)).
- **The reviewer (Codex), to the migrator (Claude Code), twice:**
  - F5 (06:10:34): the fix signed only the body, but `infra/DEPLOY.md` says
    webhook signatures are valid for 5 minutes. CHANGES REQUESTED. The
    migrator asked Arjun whether a `signed_at` field in the body was safe for
    old SDKs, added it under both signatures, and the reviewer approved
    `56d574d`.
  - F1 (06:30:21): the commit kept an RSA read path without saying when it
    goes. CHANGES REQUESTED. The migrator amended the message, and the
    reviewer approved `cd3084a` ([screenshot](changes-requested.png)).

## Signed, with the Switch facts

Each approval is an annotated tag signed with the reviewer's key. Each ship
and accepted risk is a merge or commit signed with the shipper's key, and the
origin's gate refuses one without a valid signature. The signed block names
the Switch room and the order that allowed it, for example F5's ship:

```text
finding F5 · fix 56d574d · room e6e393a5-a20e-419a-b2dc-7d8ab0dd15f6
ordered-by user · order-at 2026-11-07T06:16:03.272Z · order-text "ship F5"
```

`node tools/desk-sign.mjs show` prints it from any of these commits.

## What went wrong, and what it cost

People sent 15 messages: 5 answers from the engineer, 2 deliberate refusal
tests from the engineer, and 8 from the security lead (3 ship orders, 1
accepted risk, and the 4 below). Five messages weren't needed:

- **Two messages Switch didn't deliver to an agent.** Arjun's first F5 answer
  (05:53:59) and the lead's first "ship F3" (06:47:56) started no agent
  session. Switch Console's log shows its chat activity feed dropping
  ("Chat activity feed dropped; agent activity may lag") around those times.
  Each was sent again (06:01:19, 06:52:55) and worked at once.
- **One stalled review.** The Codex reviewer's shell hung at the start of
  F1: its F5 session was still running, and the reviewer reported that
  connecting to the F1 room "displaced another live session of mine". The
  old session was stopped by hand and the lead asked once to review again
  (06:28:26).
- **One early ship order, sent twice by mistake** (06:07:12), refused above.
  The ship order that counted came after the approval (06:16).

The machine was short of memory during the run (about 1.3 GB free, with the
previous run's agents still running), which may explain the dropped feed and
the slow reviews.

## Part two: F2, F4 and F6 (afternoon)

After the first three, the security lead sent `@desk4-scout Open F2, F4 and
F6 and work them in that order`. The scout opened the three rooms, and when
the message arrived twice, said so and opened nothing twice.

- **F2** partner session keys, ECDH P-256 (`77492d6`). Arjun: both sides of
  the exchange run this repo's `session.js`, so both move together. Hybrid
  X25519 + ML-KEM-768 with HKDF-SHA-256. Codex **requested changes**: the
  responder state could be reused across sessions, so one leaked state would
  expose every session. The migrator made it single-use; Codex approved.
- **F4** receipt checksums, SHA-1 (`b1fedca`). First fix: keyed HMAC-SHA-256
  with a SHA-1 path kept for old receipts. Codex **requested changes**: the
  scan still found SHA-1, and only RSA is allowed a legacy read path. Arjun
  changed the constraint (support re-issues old receipts from records), the
  migrator removed SHA-1, and Codex approved.
- **F6** customer records, AES-128-GCM: **in review, not shipped.** The fix
  writes AES-256-GCM only, after the DBA re-encrypts stored records. Codex
  **requested changes** (nothing enforced "deploy only after zero old
  records"), and the migrator added a tested deploy gate (`b8180e4`). Codex
  then hit its usage limit and couldn't review again. A stand-in reviewer on
  Claude Code approved it in the room, but couldn't take the exclusive
  `reviewer` role, which the out-of-quota Codex agent still held, so it pushed
  no signed approval and the shipper had nothing to ship. Switch's role lock
  and the git gate both held.

What went wrong in part two, in addition to the above:

- **The Switch server crashed** while the machine was short of memory
  (under 1 GB free). Switch Console was restarted; rooms, history and the git
  origin were intact.
- **The Codex reviewer stalled or froze three times.** Each needed the lead
  to nudge it, close its old session (`npm run desk:tidy`), or have Switch's
  buddy agent restart it.
- **Two more messages reached no agent**: Arjun's first F6 answer (the
  migrator later said "I couldn't find an earlier constraint in this room")
  and one review hand-off. **Twice the reviewer's CHANGES REQUESTED didn't
  name the migrator**, so the lead pointed the migrator at it.
- **Codex's usage limit** ended its part in the run.

## Findings

| Finding | State | On main |
|---|---|---|
| F1 RSA-OAEP (2048) | shipped | `a0f015b` |
| F2 ECDH (P-256) | shipped | `77492d6` |
| F3 TLS classical key exchange (prime256v1) | shipped, risk on record | `525a4a3` |
| F4 SHA-1 | shipped | `b1fedca` |
| F5 ECDSA (P-256) | shipped | `4769ce0` |
| F6 AES-128-GCM | in review | branch `pqc/f6-vault` |

## What people sent

| Time (UTC) | Who | Room | Message |
|---|---|---|---|
| 05:53 | arjun | f5-webhooks | @desk4-migrator About 40 merchants still verify ECDSA on old SDKs, so we can't drop it yet. Keep X-Signature until every merchant SDK verifies X-Signature-ML-DS |
| 06:01 | arjun | f5-webhooks | @desk4-migrator Answer to your question: keep X-Signature (ECDSA) until 30 June 2027, when every merchant SDK should verify X-Signature-ML-DSA-65. |
| 06:04 | arjun | f5-webhooks | @desk4-reviewer looks good to me, approve it |
| 06:07 | user | f5-webhooks | @desk4-shipper ship F5 \ |
| 06:07 | user | f5-webhooks | @desk4-shipper ship F5 |
| 06:11 | arjun | f5-webhooks | @desk4-migrator Yes, put signed_at in the body. Merchant SDKs ignore JSON fields they don't know, so old SDKs keep verifying X-Signature as today, and upgraded  |
| 06:16 | user | f5-webhooks | @desk4-shipper ship F5 |
| 06:19 | arjun | f1-envelope | @desk4-migrator Nothing else unwraps these keys, but old envelopes in the vault must stay readable. Keep a legacy read path. |
| 06:28 | user | f1-envelope | @desk4-reviewer The machine is fixed, please review F1 again. |
| 06:32 | user | f1-envelope | @desk4-shipper ship F1 |
| 06:35 | arjun | f3-tls | @desk4-migrator It carries card authorisation data, which has to stay secret for at least 7 years. Nothing connects to local or staging over TLS 1.2 or P-256 on |
| 06:47 | arjun | f3-tls | @desk4-shipper ship F3 |
| 06:47 | user | f3-tls | @desk4-shipper ship F3 |
| 06:52 | user | f3-tls | @desk4-shipper ship F3 |
| 07:00 | user | f3-tls | @desk4-shipper accept risk F3: production TLS terminates at the acquirer's edge gateway, outside our repo. Change request sent, review in 90 days. |
| 07:41 | user | intake | @desk4-scout Open F2, F4 and F6 and work them in that order. |
| 07:42 | user | intake | @desk4-scout Open F2, F4 and F6 and work them in that order. |
| 07:44 | arjun | f2-session | @desk4-migrator Both sides of this exchange run our session.js: the acquirer's settlement client is built from this repo, so switch both to the hybrid together  |
| 07:53 | user | f2-session | @desk4-reviewer The machine is free now, please review F2 again. |
| 07:57 | user | f2-session | @desk4-migrator The reviewer requested changes on F2 in its thread above: completeSession must reject a reused responder state. Please fix it and hand off again |
| 08:00 | user | f2-session | @desk4-shipper ship F2 |
| 08:04 | arjun | f4-receipts | @desk4-migrator Only our support staff check these checksums, never customers or merchants, and receipts already issued must still verify. Use HMAC-SHA-256 for  |
| 08:25 | user | f4-receipts | @desk4-reviewer Your shell may have hung. Please run the F4 review again and post your verdict. |
| 08:34 | user | f4-receipts | @desk4-reviewer Please run the F4 review again and post your verdict. |
| 08:41 | user | f4-receipts | @desk4-reviewer The server restarted. Please run the F4 review again and post your verdict. |
| 09:01 | arjun | f4-receipts | @desk4-migrator Change of plan for F4: drop the SHA-1 check completely. If a customer forwards an old receipt, support re-issues it as v2 from our records inste |
| 09:05 | user | f4-receipts | @desk4-shipper ship F4 |
| 09:07 | arjun | f6-vault | @desk4-migrator Existing records must stay readable, but don't keep AES-128 in the new code: our DBA re-encrypts every stored record to AES-256-GCM tonight with |
| 09:16 | arjun | f6-vault | @desk4-migrator Your plan is fine with my constraint above: v2 AES-256-GCM only, no AES-128 read path, because the DBA re-encrypts old records. Go ahead. |
| 09:17 | arjun | f6-vault | @desk4-migrator Yes: the DBA's job runs from the current release, using today's vault.js, so it doesn't depend on your change. We only deploy this after the DBA |
| 09:37 | user | f6-vault | @desk4-reviewer F6 round 2 is ready: pqc/f6-vault at b8180e4. Please review it and post your verdict. |
| 09:48 | user | f6-vault | !invite-agent @desk4-reviewer-claude |
| 09:48 | user | f6-vault | @desk4-reviewer-claude The Codex reviewer hit its usage limit. Take the reviewer role in this room and review F6 round 2: pqc/f6-vault at b8180e4. Post your ver |

## Screenshots

Cropped to the Mattermost window.

- [reviewer-addressing-console.png](reviewer-addressing-console.png): Switch Console showing the reviewer's addressing, "Me and my agents", which is `owner-agents`
- [refusal-reviewer.png](refusal-reviewer.png): Arjun asks the reviewer to approve F5; Switch refuses for it
- [refusal-ship.png](refusal-ship.png): Arjun orders F3 shipped; Switch refuses for the shipper
- [not-shipping-no-verdict.png](not-shipping-no-verdict.png): the shipper refuses the security lead's early "ship F5"
- [changes-requested.png](changes-requested.png): the reviewer's stalled shell, then its CHANGES REQUESTED on F1
- [f5-shipped.png](f5-shipped.png): the shipper's checks, the merge, the certificate, and the scout told
- [f3-shipped.png](f3-shipped.png): F3 shipped, 40/40 tests, certificate verified
- [accepted-risk.png](accepted-risk.png): F3's production TLS recorded as an accepted risk, signed
- [final-board.png](final-board.png): the scout's summary and last board line, Shipped 3/6 · Accepted risk 1 · Open 3

This run didn't repeat the inventory `403` or the reviewer-role `400`; they
are in [live run 2](../live-run-2/inventory-lock-and-board.png) and
[live run 1](../live-run/role-lock.png).

## Check it yourself

```sh
git clone docs/live-run-3/origin.bundle run && git -C run log --graph --all --format="%h %an %s"
node tools/replay.mjs docs/live-run-3/origin.bundle
node tools/certificate.mjs verify docs/live-run-3/F1.cert.json --tests
node tools/certificate.mjs verify docs/live-run-3/F2.cert.json --tests
node tools/certificate.mjs verify docs/live-run-3/F3.cert.json --tests
node tools/certificate.mjs verify docs/live-run-3/F4.cert.json --tests
node tools/certificate.mjs verify docs/live-run-3/F5.cert.json --tests
```

`npm test` and `npm run judge` check this run from `run.json`.
