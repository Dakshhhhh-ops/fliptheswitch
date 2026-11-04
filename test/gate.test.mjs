// The origin's pre-receive gate, tested by pushing to a real bare repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const gate = fileURLToPath(new URL('../scripts/pre-receive.mjs', import.meta.url)).split('\\').join('/');

function run(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

function must(cwd, ...args) {
  const r = run(cwd, ...args);
  assert.ok(r.ok, `git ${args.join(' ')}\n${r.out}`);
  return r.out.trim();
}

// A bare origin with the gate installed, and a clone to push from.
function desk() {
  const root = mkdtempSync(join(tmpdir(), 'gate-'));
  const seed = join(root, 'seed');
  must(root, 'init', '-q', '-b', 'main', seed);
  writeFileSync(join(seed, 'app.js'), 'export const v = 1;\n');
  must(seed, 'add', '.');
  must(seed, 'commit', '-q', '-m', 'before migration');
  const origin = join(root, 'origin.git');
  must(root, 'clone', '-q', '--bare', seed, origin);
  const hook = join(origin, 'hooks', 'pre-receive');
  writeFileSync(hook, `#!/bin/sh\nexec node "${gate}"\n`);
  chmodSync(hook, 0o755);
  const work = join(root, 'work');
  must(root, 'clone', '-q', origin, work);
  return work;
}

// A fix on pqc/f1-app, pushed. Returns its full sha.
function pushFix(work, content = 'export const v = 2;\n') {
  must(work, 'checkout', '-q', '-B', 'pqc/f1-app', 'origin/main');
  writeFileSync(join(work, 'app.js'), content);
  must(work, 'commit', '-q', '-am', 'F1: fix');
  must(work, 'push', '-q', 'origin', 'pqc/f1-app');
  return must(work, 'rev-parse', 'HEAD');
}

const approve = (work, sha) => run(work, 'push', 'origin', `${sha}:refs/approved/${sha}`);

function ship(work, id = 'F1') {
  must(work, 'checkout', '-q', 'main');
  must(work, 'merge', '-q', '--no-ff', 'pqc/f1-app', '-m', `Ship ${id}: fix`);
  return run(work, 'push', 'origin', 'main');
}

test('an approved fix ships', () => {
  const work = desk();
  const fix = pushFix(work);
  assert.ok(approve(work, fix).ok);
  const r = ship(work);
  assert.ok(r.ok, r.out);
});

test('a fix without an approval does not ship', () => {
  const work = desk();
  pushFix(work);
  const r = ship(work);
  assert.equal(r.ok, false);
  assert.match(r.out, /has no approval/);
});

test('an approval covers only that commit: a later change to the branch needs a new one', () => {
  const work = desk();
  const fix = pushFix(work);
  approve(work, fix);
  writeFileSync(join(work, 'app.js'), 'export const v = 3;\n');
  must(work, 'commit', '-q', '-am', 'F1: unreviewed change');
  must(work, 'push', '-q', 'origin', 'pqc/f1-app');
  const r = ship(work);
  assert.equal(r.ok, false);
  assert.match(r.out, /has no approval/);
});

test('a ship merge that adds unreviewed changes is refused', () => {
  const work = desk();
  approve(work, pushFix(work));
  must(work, 'checkout', '-q', 'main');
  must(work, 'merge', '-q', '--no-ff', '--no-commit', 'pqc/f1-app');
  writeFileSync(join(work, 'extra.js'), 'export const sneaky = true;\n');
  must(work, 'add', 'extra.js');
  must(work, 'commit', '-q', '-m', 'Ship F1: fix');
  const r = run(work, 'push', 'origin', 'main');
  assert.equal(r.ok, false);
  assert.match(r.out, /not reviewed/);
});

test('direct commits to main and force pushes are refused', () => {
  const work = desk();
  writeFileSync(join(work, 'app.js'), 'export const v = 9;\n');
  must(work, 'commit', '-q', '-am', 'quick fix');
  const direct = run(work, 'push', 'origin', 'main');
  assert.equal(direct.ok, false);
  assert.match(direct.out, /main only takes/);

  must(work, 'reset', '-q', '--hard', 'HEAD~1');
  must(work, 'commit', '-q', '--amend', '-m', 'rewritten history');
  const forced = run(work, 'push', '--force', 'origin', 'main');
  assert.equal(forced.ok, false);
  assert.match(forced.out, /only moves forward/);
});

test('an approval cannot be moved, or point at a different commit', () => {
  const work = desk();
  const fix = pushFix(work);
  const base = must(work, 'rev-parse', 'origin/main');
  const wrong = run(work, 'push', 'origin', `${base}:refs/approved/${fix}`);
  assert.equal(wrong.ok, false);
  assert.ok(approve(work, fix).ok);
  const moved = run(work, 'push', '--force', 'origin', `${base}:refs/approved/${fix}`);
  assert.equal(moved.ok, false);
});

test('an accepted risk may change only ACCEPTED-RISKS.md', () => {
  const work = desk();
  writeFileSync(join(work, 'ACCEPTED-RISKS.md'), '# Accepted risks\n\n- F3: on the acquirer gateway\n');
  must(work, 'add', 'ACCEPTED-RISKS.md');
  must(work, 'commit', '-q', '-m', 'Accept risk F3: acquirer gateway');
  assert.ok(run(work, 'push', 'origin', 'main').ok);

  writeFileSync(join(work, 'app.js'), 'export const v = 5;\n');
  writeFileSync(join(work, 'ACCEPTED-RISKS.md'), '# Accepted risks\n\n- F3: on the acquirer gateway\n- F6: later\n');
  must(work, 'commit', '-q', '-am', 'Accept risk F6: later');
  const r = run(work, 'push', 'origin', 'main');
  assert.equal(r.ok, false);
  assert.match(r.out, /only ACCEPTED-RISKS\.md/);
});

test('a finding cannot ship twice', () => {
  const work = desk();
  approve(work, pushFix(work));
  assert.ok(ship(work).ok);
  approve(work, pushFix(work, 'export const v = 4;\n'));
  const r = ship(work);
  assert.equal(r.ok, false);
  assert.match(r.out, /already shipped/);
});
