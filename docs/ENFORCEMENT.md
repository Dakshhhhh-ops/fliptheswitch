# What is enforced, and how it's proved

Some of the desk's rules are enforced by Switch, some by git, and some only
by the agents' instructions. This page lists every one of them, and what
proves it.

| Rule | Enforced by | How | Proved by |
|---|---|---|---|
| Only the security lead can make the shipper act | **Switch** | The shipper's addressing is `owner`. Switch answers anyone else itself, before an agent session starts | Live runs 1 and 2, for an unlinked engineer ([run 2](live-run-2/refusal-ship.png)): Switch refused Arjun's "ship F1" and "accept risk" with no agent session ([1](live-run/refusal-ship.png), [2](live-run/refusal-accept-risk.png)). An unlinked account [matches nobody, not the owner](https://github.com/sandbox-quantum/switch/blob/main/docs/official/internals/identity-and-access.md#identity-claims), so the owner rule turns it away; Switch words that case as "isn't linked" ([source](https://github.com/sandbox-quantum/switch/blob/main/core/switch_core/delivery/addressing.py)). **Not shown:** a linked non-owner, which needs a second Switch user (this server has one, sign-up off) |
| One reviewer of record per finding | **Switch**, and checked by the shipper | Switch keeps the `reviewer` role in each work room exclusive. The shipper only ships a verdict from the agent holding it | The shipper's check: live run 1, it refused F1 while nobody held the role ([screenshot](live-run/one-reviewer-of-record.png)). Switch itself: live run 1, the migrator's `assume_role("reviewer")` got `400: Role 'reviewer' is exclusive and currently held by another agent` ([screenshot](live-run/role-lock.png)) |
| Only the scout can change the inventory | **Switch** | A room document can only be edited by the agent that created it | Live runs 1 and 2 ([run 2](live-run-2/inventory-lock-and-board.png)): the migrator's `update_room_document` on the inventory got Switch's `403: Agent … did not create document …`, and the inventory was unchanged ([screenshot](live-run/inventory-lock.png)) |
| Main only takes reviewed fixes | **git** | The origin's `pre-receive` hook ([`scripts/pre-receive.mjs`](../scripts/pre-receive.mjs)) refuses any push to main that isn't a `Ship F<n>:` merge or an `Accept risk F<n>:` commit | `npm run judge` step 3; gate test "direct commits to main and force pushes are refused"; every live run's replay (`node tools/replay.mjs docs/live-run/origin.bundle`) |
| A ship contains exactly the approved commit | **git** | The merged commit needs a `refs/approved/<sha>` mark, which the reviewer pushes for the exact sha it checked. Any later push to the branch needs a new one. A merge that adds anything beyond the clean merge is refused | judge steps 3–4; gate tests "a fix without an approval does not ship", "an approval covers only that commit", "a ship merge that adds unreviewed changes is refused" |
| An approval can't be moved or reused | **git** | `refs/approved/<sha>` must point at that sha, and can't be updated or deleted | gate test "an approval cannot be moved, or point at a different commit" |
| No force pushes, no shipping twice | **git** | Main only moves forward, and an id that already shipped is refused | judge step 5; gate tests "a finding cannot ship twice", "direct commits to main and force pushes are refused" |
| An accepted risk changes no code | **git** | An `Accept risk` commit may only touch `ACCEPTED-RISKS.md` | judge step 6; gate test "an accepted risk may change only ACCEPTED-RISKS.md" |
| The migrator doesn't merge and the scout doesn't edit code | instructions, backed by git | The instructions say so, and the hook refuses the push anyway | the gate tests above |
| The reviewer reads the code, not the summary | instructions | It runs on a different provider. All four agents share one machine and folder | nothing automatic: read its review in the room |
| Who pushed | **nobody** | The origin is a folder with no accounts, so git can't tell agents apart. Anyone who can write to the folder can push an approval mark. On a hosted repository, branch protection and per-agent credentials would close this. Here, Switch's addressing decides who may order a ship, and the hook decides what a ship may contain | nothing: a stated limit |

`test/gate.test.mjs` and `npm run judge` push to a real bare repository with
the hook installed.

## Migration certificates

Every ship gets a migration certificate
([`tools/certificate.mjs`](../tools/certificate.mjs)): the crypto in the file
before and after, the approved sha and its mark, the merge, and the tests at
it. It is read from git and signed with ML-DSA-65, the signature the desk
itself recommends.

`certificate.mjs verify` checks that the signature is the desk's key
([`desk-key.pub.pem`](live-run/desk-key.pub.pem)), not just whatever key the
certificate carries, then checks every claim in it against git: the merge is
on main and merges exactly the approved commit, the approval mark points at
it, and the scanner sees the same crypto before and after. `--tests` reruns
the tests at the merge.

```sh
node tools/certificate.mjs verify docs/live-run/F1.cert.json --tests
```

A certificate with one sha changed fails the signature. The same forgery
re-signed with another key fails the key check and the git checks. Both are
in `npm run judge` and `test/live-run.test.mjs`.
