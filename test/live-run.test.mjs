// The live run in Switch, checked from what the agents left in git.
//
// docs/live-run/origin.bundle is the agents' origin as the run left it: every
// commit, branch and approval mark they pushed. These tests check that the
// certificates match it, that a forged certificate fails, and that the
// agents' pushes, replayed in order, all pass the gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit, canonical, check, publicKeyFrom } from '../tools/certificate.mjs';
import { counts, readDesk } from '../tools/board.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const BUNDLE = here('../docs/live-run/origin.bundle');
const KEY = publicKeyFrom(here('../docs/live-run/desk-key.pub.pem'));
const cert = (id) => JSON.parse(readFileSync(here(`../docs/live-run/${id}.cert.json`), 'utf8'));
const gate = here('../scripts/pre-receive.mjs').split('\\').join('/');

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}`.trim() };
}

function must(cwd, ...args) {
  const r = git(cwd, ...args);
  assert.ok(r.ok, `git ${args.join(' ')}\n${r.out}`);
  return r.out;
}

for (const id of ['F1', 'F5']) {
  test(`${id}: the certificate is signed by the desk's key and every claim in it matches git`, () => {
    const c = cert(id);
    assert.ok(check(c, { publicKey: KEY }), 'signature by the desk key');
    for (const r of audit(c, BUNDLE)) assert.ok(r.ok, `${r.name}: ${r.detail}`);
  });
}

test('a certificate re-signed with another key is valid on its own but not as the desk', () => {
  const { signature, ...body } = cert('F5');
  const forged = { ...body, review: { ...body.review, approvedCommit: '0'.repeat(40) } };
  const { privateKey, publicKey } = generateKeyPairSync('ml-dsa-65');
  const signed = {
    ...forged,
    signature: {
      algorithm: 'ML-DSA-65',
      publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      value: sign(null, Buffer.from(canonical(forged)), privateKey).toString('base64'),
    },
  };
  assert.ok(check(signed), 'self-consistent');
  assert.equal(check(signed, { publicKey: KEY }), false, 'not the desk key');
  assert.equal(check({ ...signed, signature }), false, 'the desk signature does not cover the change');
});

test('a certificate that claims a different approved commit fails against git', () => {
  const c = cert('F1');
  const lie = { ...c, review: { approvedCommit: c.before.commit, approvalRef: `refs/approved/${c.before.commit}` } };
  const failed = audit(lie, BUNDLE).filter((r) => !r.ok).map((r) => r.name);
  assert.ok(failed.includes('It merges exactly the approved commit onto the commit before it'), failed.join('; '));
  assert.ok(failed.includes('The approval mark points at the approved commit'), failed.join('; '));
});

test("the agents' pushes, replayed in order, all pass the gate, and a shortcut does not", () => {
  const root = mkdtempSync(join(tmpdir(), 'live-replay-'));
  const live = join(root, 'live');
  must(root, 'clone', '-q', BUNDLE, live);
  must(live, 'fetch', '-q', 'origin', '+refs/approved/*:refs/approved/*', '+refs/heads/*:refs/remotes/origin/*');

  // A fresh origin holding only the planted code, with the gate installed.
  const first = must(live, 'rev-list', '--max-parents=0', 'origin/main');
  const origin = join(root, 'origin.git');
  must(root, 'init', '-q', '--bare', '-b', 'main', origin);
  must(live, 'push', '-q', origin, `${first}:refs/heads/main`);
  const hook = join(origin, 'hooks', 'pre-receive');
  writeFileSync(hook, `#!/bin/sh\nexec node "${gate}"\n`);
  chmodSync(hook, 0o755);

  const push = (src, ref) => git(live, 'push', origin, `${src}:${ref}`);
  const sha = (subject) => must(live, 'log', '--all', '--format=%H', '--fixed-strings', `--grep=${subject}`).split('\n')[0];
  const f5 = '6666ccbc40f8d8b45855c1776d209dc2b977215d';
  const f1First = '76ebe32b94b0615ced9e01e4a29a2b3f3d74acef';
  const f1 = 'f03d6e0f193abe92678c2b8ce0f46e22ce25d6d9';

  // A shortcut first: the migrator's F1 commit straight onto main.
  assert.equal(push(f1First, 'refs/heads/main').ok, false, 'a fix straight to main is refused');

  const steps = [
    [f5, 'refs/heads/pqc/f5-webhooks', 'migrator pushes the F5 fix'],
    [f5, `refs/approved/${f5}`, 'reviewer approves 6666ccb'],
    [sha('Ship F5:'), 'refs/heads/main', 'shipper ships F5'],
    [f1First, 'refs/heads/pqc/f1-envelope', 'migrator pushes the first F1 fix (changes requested)'],
    [f1, 'refs/heads/pqc/f1-envelope', 'migrator adds the test the reviewer asked for'],
    [f1, `refs/approved/${f1}`, 'reviewer approves f03d6e0'],
    [sha('Ship F1:'), 'refs/heads/main', 'shipper ships F1'],
    [sha('Accept risk F3:'), 'refs/heads/main', 'shipper records the F3 accepted risk'],
  ];
  for (const [src, ref, what] of steps) {
    const r = push(src, ref);
    assert.ok(r.ok, `${what} should pass the gate:\n${r.out}`);
  }
  assert.equal(must(origin, 'rev-parse', 'main'), must(live, 'rev-parse', 'origin/main'), 'the replayed main is the live main');
  assert.equal(push(f1First, `refs/approved/${f1}`).ok, false, 'an approval cannot be moved');
});

test('the board read from the live origin says Shipped 2/6, Accepted risk 1', () => {
  const c = counts(readDesk(BUNDLE).rows);
  assert.deepEqual(c, { shipped: 2, 'accepted risk': 1, 'in review': 0, open: 3 });
});
