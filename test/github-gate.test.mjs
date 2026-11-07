// The GitHub check (scripts/github/gate.mjs) on live run 3's own git, laid out
// the way GitHub holds it: approvals as tags approved/<sha>, the run's public
// keys in desk-keys/. Every commit on main passes; take away one approval and
// that ship fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const RUN = join(ROOT, 'docs', 'live-run-3');
const GATE = join(ROOT, 'scripts', 'github', 'gate.mjs');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

function githubLayout() {
  const dir = join(mkdtempSync(join(tmpdir(), 'gh-gate-')), 'origin.git');
  execFileSync('git', ['clone', '--quiet', '--bare', join(RUN, 'origin.bundle'), dir]);
  git(dir, 'fetch', '--quiet', join(RUN, 'origin.bundle'), '+refs/approved/*:refs/approved/*');
  for (const ref of git(dir, 'for-each-ref', '--format=%(refname)', 'refs/approved/').split('\n')) {
    git(dir, 'update-ref', `refs/tags/approved/${ref.slice('refs/approved/'.length)}`, git(dir, 'rev-parse', ref));
    git(dir, 'update-ref', '-d', ref); // GitHub's copy is read from the tags only
  }
  mkdirSync(join(dir, 'desk-keys'));
  cpSync(join(RUN, 'reviewer.pub.pem'), join(dir, 'desk-keys', 'reviewer.pub.pem'));
  cpSync(join(RUN, 'shipper.pub.pem'), join(dir, 'desk-keys', 'shipper.pub.pem'));
  return dir;
}

const runGate = (cwd) => {
  const env = { ...process.env, DESK_APPROVED_REFS: 'refs/tags/approved/' };
  delete env.GITHUB_REPOSITORY; // no GitHub: print, don't post
  return spawnSync(process.execPath, [GATE, '--dry-run'], { cwd, env, encoding: 'utf8' });
};

test('every commit on run 3 main passes the GitHub check, reading approvals from tags', () => {
  const r = runGate(githubLayout());
  assert.equal(r.status, 0, r.stderr);
  const rows = r.stdout.split('\n').filter((l) => l.includes('desk-gate/main'));
  assert.equal(rows.length, 6); // 5 ships and 1 accepted risk
  assert.ok(rows.every((l) => l.includes('✅')), r.stdout);
});

test('a ship whose approval tag is missing fails the check', () => {
  const dir = githubLayout();
  git(dir, 'update-ref', '-d', 'refs/tags/approved/56d574dc60aa86d514900c390495565227ffbc0c'); // F5's
  const r = runGate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /4769ce0.*❌.*has no approval/);
});
