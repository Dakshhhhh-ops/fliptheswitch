# Crypto Migration Desk

**Your encryption has an expiry date.**

Anything encrypted with RSA or elliptic-curve keys today can be recorded now
and decrypted once a large quantum computer exists ("harvest now, decrypt
later"). Moving a real codebase to post-quantum crypto is not one big
find-and-replace. Each fix needs the engineer who knows the code, an
independent review, and a security lead who decides what ships.

Crypto Migration Desk runs that work in team chat with
[Switch](https://github.com/sandbox-quantum/switch). Agents find every
quantum-vulnerable or weak use of crypto, open a private room for each
finding with the engineer who owns the code, fix it together, and wait for
the security lead to ship it.

## What happens

```mermaid
flowchart TB
  subgraph intake["desk-intake"]
    scout["@desk-scout<br/>scans, keeps the Crypto inventory"]
  end
  subgraph work["desk-f1-envelope … desk-f6-vault (one private room per finding)"]
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

1. The security lead runs the template. Switch creates four agents and the
   `desk-intake` room, then posts the kickoff.
2. `@desk-scout` runs [`tools/cbom-scan.mjs`](tools/cbom-scan.mjs), writes a
   **CycloneDX 1.6 CBOM** (the standard crypto bill of materials), and keeps a
   **Crypto inventory** document in the intake room.
3. The scout opens **one private room per finding**, invites the engineer,
   links it back to intake and defines an exclusive `reviewer` role in it.
   The rooms appear in the sidebar on their own.
4. In each room `@desk-migrator` posts a plan, the engineer adds constraints
   the code doesn't show ("merchants still verify ECDSA"), and the migrator
   pushes a branch with tests.
5. The agent holding the **`reviewer` role** (`@desk-reviewer`, on Codex)
   checks out the branch, runs the tests and the scanner, and approves that
   exact commit or requests changes.
6. Only the security lead can make **`@desk-shipper`** act, because its
   Switch addressing policy is `owner`. When the engineer says "ship it",
   Switch refuses. When the security lead says it, the shipper merges and
   tells the scout. A finding the team can't fix becomes an **accepted risk**
   with a reason and a review date.
7. The scout rescans main and the board moves.

## Why it needs Switch

Take Switch away and this stops working. These parts are Switch's:

| Switch feature | What it does here |
|---|---|
| Template (`template/crypto-desk.template.yaml`) | One form creates the four agents, the intake room, its guide document and the kickoff |
| Agents creating rooms (`create_room`, `link_rooms`) | The scout opens a private room per finding with the right people and links them to intake |
| Addressing policies | `owner` on the shipper is the ship gate. `anyone` lets the engineer work with the other agents |
| Exclusive room role | Exactly one reviewer of record per finding, whichever agent holds it |
| Room documents | The inventory can only be edited by the scout that wrote it, so the board can't be quietly changed |
| Rooms shared by people and agents | Engineer, security lead and agents negotiate in the same thread |
| Different providers in one room | Claude Code writes, Codex reviews, so the review is independent |

## The demo codebase

[`demo-payments/`](demo-payments/) is a small payments service with six
planted problems, and its 8 tests pass. The scanner is a fixed rule table, so
it finds exactly these six; that is on purpose, so every run starts from the
same inventory. The fixes below are what the agents are briefed to make.

| # | Where | Problem | Planned fix |
|---|---|---|---|
| F1 | `src/envelope.js` | RSA-OAEP wraps card data keys | Hybrid X25519 + ML-KEM-768 → HKDF → AES-256-GCM |
| F2 | `src/session.js` | ECDH P-256 settlement keys, files kept 7 years | Hybrid X25519 + ML-KEM-768 |
| F3 | `src/tls.js` | Classical-only TLS key exchange | Staging gets `X25519MLKEM768`. Production TLS is on the acquirer's gateway, so it becomes an accepted risk with a change request |
| F4 | `src/receipts.js` | SHA-1 checksums (**classically broken**, not a quantum issue) | SHA-256 / HMAC-SHA-256 |
| F5 | `src/webhooks.js` | ECDSA P-256 webhook signatures | ML-DSA-65 **dual-signed** beside ECDSA, because merchants still verify ECDSA |
| F6 | `src/vault.js` | AES-128-GCM (fine today, below CNSA 2.0 for long-lived data) | AES-256-GCM with a versioned format so old records stay readable |

Every fix uses only `node:crypto`. Node 24.7+ ships ML-KEM and ML-DSA (FIPS 203 and 204).

## Run it yourself

You need: [Switch Console](https://github.com/sandbox-quantum/switch/releases/latest),
Docker (for the bundled Mattermost), Node 24.7+, git, and Claude Code and
Codex signed in.

```sh
npm test               # the scanner's tests and demo-payments' tests
npm run scan           # the six findings, and cbom.json
npm run setup          # creates the local git origin and prints two paths
```

1. In Switch Console, add a server on this computer with Mattermost.
2. In Mattermost, create a second account for the engineer.
3. Templates → Import `template/crypto-desk.template.yaml`. Fill in the
   folder `npm run setup` printed and the engineer's username.
   Create.
4. Watch `desk-intake`. Talk to the agents from the engineer's account in the
   work rooms, and approve from yours.

`npm run reset` puts the planted code back for another run. The agents push
to a local git origin, so nothing leaves your machine.

## Repository

```
template/crypto-desk.template.yaml   the Switch template: agents, intake room, kickoff
tools/cbom-scan.mjs                  rule-based crypto scanner and CycloneDX 1.6 CBOM writer
tools/cbom-scan.test.mjs             its tests
demo-payments/                       the codebase being migrated
scripts/setup-origin.mjs             local git origin for the agents
```

## Limits

- The scanner reads JavaScript using `node:crypto` with a fixed rule table. It
  is deliberately predictable, not complete.
- On Windows, Switch Console can't grant a GitHub connection, so the agents
  push to a local git origin instead of opening pull requests.
- Switch has no scheduled messages yet, so accepted-risk review dates are
  recorded, not reminded.
