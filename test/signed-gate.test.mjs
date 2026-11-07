// The gate in signed mode: the origin has the reviewer's and shipper's keys
// registered, so approvals, ships and accepted risks must carry the right
// agent's ML-DSA-65 signature. Pushed to a real bare repository with the hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureKeys, parseSigned } from '../tools/desk-signature.mjs';
import { accept, approve, ship } from '../tools/desk-sign.mjs';

const gate = fileURLToPath(new URL('../scripts/pre-receive.mjs', import.meta.url)).split('\\').join('/');

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}`.trim() };
}
function must(cwd, ...args) {
  const r = git(cwd, ...args);
  assert.ok(r.ok, `git ${args.join(' ')}\n${r.out}`);
  return r.out;
}
const tryRun = (fn) => {
  try {
    fn();
    return { ok: true, out: '' };
  } catch (e) {
    return { ok: false, out: e.message };
  }
};

// A signed origin with the gate, a checkout to work in, and the agents' keys.
function desk() {
  const root = mkdtempSync(join(tmpdir(), 'signed-gate-'));
  const seed = join(root, 'seed');
  must(root, 'init', '-q', '-b', 'main', seed);
  writeFileSync(join(seed, 'app.js'), 'export const v = 1;\n');
  must(seed, 'add', '.');
  must(seed, 'commit', '-q', '-m', 'before migration');
  const origin = join(root, 'origin.git');
  must(root, 'clone', '-q', '--bare', seed, origin);
  writeFileSync(join(origin, 'hooks', 'pre-receive'), `#!/bin/sh\nexec node "${gate}"\n`);
  chmodSync(join(origin, 'hooks', 'pre-receive'), 0o755);
  const keys = join(root, 'keys');
  ensureKeys(keys, origin);
  const work = join(root, 'work');
  must(root, 'clone', '-q', origin, work);
  must(work, 'config', 'user.name', 'desk');
  must(work, 'config', 'user.email', 'desk@t');
  must(work, 'checkout', '-q', '-b', 'pqc/f1-app');
  writeFileSync(join(work, 'app.js'), 'export const v = 2;\n');
  must(work, 'commit', '-q', '-am', 'F1: fix');
  must(work, 'push', '-q', 'origin', 'pqc/f1-app');
  const fix = must(work, 'rev-parse', 'HEAD');
  must(work, 'checkout', '-q', 'main');
  return { work, origin, fix, reviewer: join(keys, 'reviewer.pem'), shipper: join(keys, 'shipper.pem') };
}

const order = { room: 'room-123', 'ordered-by': 'user', 'order-at': '2026-11-07T10:00:00Z', 'order-text': '@desk-shipper ship F1' };

test('signed mode: a plain approval ref is refused', () => {
  const d = desk();
  const r = git(d.work, 'push', 'origin', `${d.fix}:refs/approved/${d.fix}`);
  assert.equal(r.ok, false);
  assert.match(r.out, /must be signed by the reviewer/);
});

test("signed mode: an approval signed with any key but the reviewer's is refused", () => {
  const d = desk();
  const r = tryRun(() => approve(d.fix, { repo: d.work, key: d.shipper, agent: 'desk-migrator' }));
  assert.equal(r.ok, false);
  assert.match(r.out, /isn't signed by the reviewer's key/);
});

test("signed mode: the reviewer's signed approval is accepted, and records the Switch room and role", () => {
  const d = desk();
  approve(d.fix, { repo: d.work, key: d.reviewer, room: 'room-123', role: 'reviewer', agent: 'desk-reviewer' });
  const tag = must(d.origin, 'cat-file', 'tag', `refs/approved/${d.fix}`);
  assert.deepEqual(parseSigned(tag).fields, { commit: d.fix, room: 'room-123', role: 'reviewer', agent: 'desk-reviewer' });
});

test('signed mode: an unsigned ship merge is refused, even of an approved commit', () => {
  const d = desk();
  approve(d.fix, { repo: d.work, key: d.reviewer });
  must(d.work, 'merge', '-q', '--no-ff', 'pqc/f1-app', '-m', 'Ship F1: fix');
  const r = git(d.work, 'push', 'origin', 'main');
  assert.equal(r.ok, false);
  assert.match(r.out, /has no signed "desk ship" block/);
});

test("signed mode: a ship signed with the reviewer's key is refused", () => {
  const d = desk();
  approve(d.fix, { repo: d.work, key: d.reviewer });
  ship('F1', 'pqc/f1-app', { repo: d.work, key: d.reviewer, m: 'fix' });
  const r = git(d.work, 'push', 'origin', 'main');
  assert.equal(r.ok, false);
  assert.match(r.out, /isn't signed by the shipper's key/);
});

test("signed mode: the shipper's signed ship is accepted, and records who ordered it in Switch", () => {
  const d = desk();
  approve(d.fix, { repo: d.work, key: d.reviewer });
  const merge = ship('F1', 'pqc/f1-app', { repo: d.work, key: d.shipper, m: 'fix', ...order });
  const r = git(d.work, 'push', 'origin', 'main');
  assert.ok(r.ok, r.out);
  const fields = parseSigned(must(d.work, 'log', '-1', '--format=%B', merge)).fields;
  assert.equal(fields['ordered-by'], 'user');
  assert.equal(fields['order-text'], '@desk-shipper ship F1');
  assert.equal(fields.fix, d.fix);
});

test("signed mode: a signed ship whose signature names another commit is refused", () => {
  const d = desk();
  approve(d.fix, { repo: d.work, key: d.reviewer });
  ship('F1', 'pqc/f1-app', { repo: d.work, key: d.shipper, m: 'fix' });
  // Rewrite the message to claim F2, keeping the F1 signature.
  const msg = must(d.work, 'log', '-1', '--format=%B').replace('Ship F1:', 'Ship F2:');
  writeFileSync(join(d.work, '.msg'), msg);
  must(d.work, 'commit', '-q', '--amend', '-F', '.msg');
  const r = git(d.work, 'push', 'origin', 'main');
  assert.equal(r.ok, false);
  assert.match(r.out, /signature is for F1/);
});

test("signed mode: an accepted risk needs the shipper's signature", () => {
  const d = desk();
  writeFileSync(join(d.work, 'ACCEPTED-RISKS.md'), '# Accepted risks\n\n- F3: on the acquirer gateway (owner: user, review by: 2027-02-04)\n');
  must(d.work, 'add', 'ACCEPTED-RISKS.md');
  must(d.work, 'commit', '-q', '-m', 'Accept risk F3: acquirer gateway');
  let r = git(d.work, 'push', 'origin', 'main');
  assert.equal(r.ok, false);
  assert.match(r.out, /has no signed "desk accept" block/);
  must(d.work, 'reset', '-q', '--hard', 'origin/main');
  writeFileSync(join(d.work, 'ACCEPTED-RISKS.md'), '# Accepted risks\n\n- F3: on the acquirer gateway (owner: user, review by: 2027-02-04)\n');
  accept('F3', { repo: d.work, key: d.shipper, m: 'acquirer gateway', ...order });
  r = git(d.work, 'push', 'origin', 'main');
  assert.ok(r.ok, r.out);
});
