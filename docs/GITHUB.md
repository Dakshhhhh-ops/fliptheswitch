# On GitHub: pull requests and a signature check

**[Dakshhhhh-ops/demo-payments-desk](https://github.com/Dakshhhhh-ops/demo-payments-desk/pulls?q=is%3Apr)**
is live run 3's git on GitHub as a pull-request workflow. The commits, the
reviewer's signed approvals and the shipper's signed merges are the agents'
originals from the run's [origin.bundle](live-run-3/origin.bundle). Only the
GitHub objects are new: the repository, the pull requests and the checks.

| Pull request | Finding | desk-gate/approval | What happened |
|---|---|---|---|
| [#5](https://github.com/Dakshhhhh-ops/demo-payments-desk/pull/5) | F5 webhooks | ✅ reviewer's ML-DSA-65 signature valid | merged by the shipper's signed merge `4769ce0` |
| [#1](https://github.com/Dakshhhhh-ops/demo-payments-desk/pull/1) | F1 card vault | ✅ | merged, `a0f015b` |
| [#3](https://github.com/Dakshhhhh-ops/demo-payments-desk/pull/3) | F3 TLS | ✅ | merged, `525a4a3`; production TLS an accepted risk, `695ea59` |
| [#2](https://github.com/Dakshhhhh-ops/demo-payments-desk/pull/2) | F2 session keys | ✅ | merged, `77492d6` |
| [#4](https://github.com/Dakshhhhh-ops/demo-payments-desk/pull/4) | F4 receipts | ✅ | merged, `b1fedca` |
| [#6](https://github.com/Dakshhhhh-ops/demo-payments-desk/pull/6) | F6 records | ❌ no signed approval | open: the run ended before the reviewer re-checked it |
| [#7](https://github.com/Dakshhhhh-ops/demo-payments-desk/pull/7) | attack | ❌ the approval isn't signed by the reviewer's key | open, never merged: turns off webhook checks, with an approval signed by another ML-DSA-65 key |

Every commit on main carries **desk-gate/main ✅**: a signed `Ship F<n>` merge
of an approved commit with nothing added, or a signed `Accept risk F<n>` that
changes only `ACCEPTED-RISKS.md`. GitHub marked #1 to #5 merged because the
shipper's merges brought their exact heads into main.

## How it works

- **main** is the run's main, unchanged. A ruleset blocks deleting it or
  force-pushing it.
- **Approvals** are the reviewer's annotated tags, `approved/<sha>`, each with
  its ML-DSA-65 signature over the exact commit.
- **desk-gate** is a GitHub Actions workflow
  ([desk-gate.yml](../scripts/github/desk-gate.yml)) on the `desk` branch, the
  default one. It runs the desk's own gate code
  ([pre-receive.mjs](../scripts/pre-receive.mjs) via
  [gate.mjs](../scripts/github/gate.mjs)) against the run's public keys in
  `desk-keys/`, and posts its verdict as commit statuses: `desk-gate/approval`
  on each open pull request's head and `desk-gate/main` on each commit of main.
  It runs on demand, every 15 minutes, and whenever the gate changes. It reads
  pull requests as git objects and never runs their code.
- **Why a separate branch:** GitHub runs a workflow from the files in the
  commit it's checking, and main has to stay exactly what the agents signed,
  so the gate can't be committed to main.

Rebuild it: `node scripts/github/replay.mjs --repo <you>/<name>`. It needs `gh`,
signed in. Tested by [test/github-gate.test.mjs](../test/github-gate.test.mjs).

## What this does and doesn't show

- **It's a replay.** The agents pushed to the desk's local origin during the
  run, because Switch Console on Windows can't grant a GitHub connection. The
  history is theirs; the pull requests were opened from it afterwards, by this
  account.
- **GitHub reports, the desk's origin refuses.** github.com has no pre-receive
  hooks; only GitHub Enterprise Server has them. So here a bad commit would
  land and then show ❌. The desk's own origin refuses it outright, with the
  same code. A required status check can't stand in: the shipper's signed merge
  is a new commit, so it has no status until after it's pushed.
