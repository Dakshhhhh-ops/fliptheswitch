#!/usr/bin/env node
// The desk's git gate, run by the origin's pre-receive hook on every push.
// setup-origin.mjs installs it. It turns the rules in the agents' prompts
// into rules git enforces:
//
//   refs/heads/pqc/*        fix branches. Anyone may push, and rewrite them.
//   refs/approved/<sha>     the reviewer's approval of exactly that commit.
//                           Created once, pointing at <sha>, never moved or
//                           deleted.
//   refs/heads/main         moves forward only, one commit at a time, and
//                           each commit is one of:
//                           - "Ship F<n>: ..." a --no-ff merge of a commit that
//                             has an approval, with nothing added in the merge,
//                             and F<n> not shipped before
//                           - "Accept risk F<n>: ..." a commit that changes only
//                             ACCEPTED-RISKS.md
//   anything else           refused.
//
// What it can't do: this origin is a folder, with no accounts, so git can't
// tell which agent pushed. Who may order a ship is enforced by Switch (the
// shipper's addressing is `owner`). What a ship may contain is enforced here.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ZERO = /^0{40}$/;

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(...args) {
  try {
    return { ok: true, out: git(...args) };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? '').trim() };
  }
}

const approved = (sha) => tryGit('rev-parse', '--verify', '--quiet', `refs/approved/${sha}`).ok;

// The shipped finding ids on main up to `tip`.
function shippedIds(tip) {
  if (ZERO.test(tip)) return new Set();
  const subjects = git('log', '--first-parent', '--format=%s', tip).split('\n');
  return new Set(subjects.map((s) => /^Ship (F\d+):/.exec(s)?.[1]).filter(Boolean));
}

// Every reason the push to main should be refused, or none.
export function checkMain(oldSha, newSha) {
  if (ZERO.test(newSha)) return ['main cannot be deleted.'];
  if (ZERO.test(oldSha)) return ['main already exists on this origin; it cannot be created by a push.'];

  const chain = git('rev-list', '--first-parent', '--reverse', `${oldSha}..${newSha}`).split('\n').filter(Boolean);
  const firstParents = git('rev-list', '--first-parent', newSha).split('\n');
  if (!firstParents.includes(oldSha)) return ['main only moves forward: the new main must build on the current one (no force pushes).'];

  const problems = [];
  const shipped = shippedIds(oldSha);
  for (const sha of chain) {
    const short = sha.slice(0, 7);
    const subject = git('log', '-1', '--format=%s', sha);
    const parents = git('log', '-1', '--format=%P', sha).split(' ').filter(Boolean);
    const ship = /^Ship (F\d+):/.exec(subject);
    const accept = /^Accept risk (F\d+):/.exec(subject);

    if (ship) {
      const id = ship[1];
      if (parents.length !== 2) {
        problems.push(`${short} "${subject}": a ship must be a --no-ff merge of the approved branch.`);
        continue;
      }
      const [base, fix] = parents;
      if (!approved(fix)) {
        problems.push(`${short} ships ${fix.slice(0, 7)}, which has no approval (refs/approved/${fix.slice(0, 7)}…). The reviewer approves an exact commit.`);
      }
      const merged = tryGit('merge-tree', '--write-tree', base, fix);
      const tree = git('rev-parse', `${sha}^{tree}`);
      if (!merged.ok) problems.push(`${short}: the approved commit does not merge cleanly into main.`);
      else if (merged.out.split('\n')[0] !== tree) problems.push(`${short}: the merge adds changes that were not reviewed.`);
      if (shipped.has(id)) problems.push(`${short}: ${id} is already shipped.`);
      shipped.add(id);
    } else if (accept) {
      if (parents.length !== 1) {
        problems.push(`${short} "${subject}": an accepted risk is a single commit, not a merge.`);
        continue;
      }
      const changed = git('diff', '--name-only', parents[0], sha).split('\n').filter(Boolean);
      if (changed.length !== 1 || changed[0] !== 'ACCEPTED-RISKS.md') {
        problems.push(`${short} "${subject}": an accepted risk may change only ACCEPTED-RISKS.md (it changes ${changed.join(', ') || 'nothing'}).`);
      }
    } else {
      problems.push(`${short} "${subject}": main only takes "Ship F<n>: ..." merges and "Accept risk F<n>: ..." commits. Push fixes to a pqc/ branch.`);
    }
  }
  return problems;
}

export function checkApproval(ref, oldSha, newSha) {
  const named = ref.slice('refs/approved/'.length);
  if (!ZERO.test(oldSha)) return [`${ref} already exists. An approval is never moved or removed; approve the new commit instead.`];
  if (named !== newSha) return [`${ref} must point at the commit it names (${named}), with the full 40-character sha.`];
  if (tryGit('cat-file', '-t', newSha).out !== 'commit') return [`${ref}: ${newSha} is not a commit.`];
  return [];
}

export function check(ref, oldSha, newSha) {
  if (ref === 'refs/heads/main') return checkMain(oldSha, newSha);
  if (ref.startsWith('refs/heads/pqc/')) return [];
  if (ref.startsWith('refs/approved/')) return checkApproval(ref, oldSha, newSha);
  return [`${ref}: this origin only takes main, pqc/* branches and refs/approved/*.`];
}

function main() {
  const lines = readFileSync(0, 'utf8').split('\n').filter(Boolean);
  const problems = [];
  for (const line of lines) {
    const [oldSha, newSha, ref] = line.trim().split(/\s+/);
    problems.push(...check(ref, oldSha, newSha));
  }
  if (problems.length) {
    console.error('crypto-desk gate: push refused.');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
