// The live runs in Switch, checked from what the agents left in git.
//
// Each docs/live-run* folder with a run.json holds one run: origin.bundle (the
// agents' origin as the run left it: every commit, branch and approval mark
// they pushed), the shipper's certificates, and the board it ended on. For
// every run these tests check that the certificates are the desk's and match
// its git, that the agents' pushes replay through the gate, and the board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit, canonical, check, publicKeyFrom } from '../tools/certificate.mjs';
import { counts, readDesk } from '../tools/board.mjs';
import { liveRuns, replay } from '../tools/replay.mjs';

const KEY = publicKeyFrom(fileURLToPath(new URL('../docs/live-run/desk-key.pub.pem', import.meta.url)));
const runs = liveRuns();
const certOf = (run, id) => JSON.parse(readFileSync(join(run.dir, `${id}.cert.json`), 'utf8'));

test('there is at least one documented live run', () => {
  assert.ok(runs.length >= 1);
});

for (const run of runs) {
  const bundle = join(run.dir, 'origin.bundle');

  for (const id of run.certificates) {
    test(`${run.name}, ${id}: the certificate is signed by the desk's key and every claim in it matches git`, () => {
      const c = certOf(run, id);
      assert.ok(check(c, { publicKey: KEY }), 'signature by the desk key');
      for (const r of audit(c, bundle)) assert.ok(r.ok, `${r.name}: ${r.detail}`);
    });
  }

  test(`${run.name}: the agents' pushes, replayed in order, all pass the gate, and a shortcut does not`, () => {
    const { steps, sameMain } = replay(bundle, { keys: run.dir });
    for (const s of steps) assert.ok(s.ok, `${s.what}: expected ${s.expect === 'refuse' ? 'a refusal' : 'it to pass'}, got ${s.detail}`);
    assert.ok(steps.some((s) => s.expect === 'refuse'), 'a shortcut was tried');
    assert.ok(sameMain, "the replayed main is the run's main");
  });

  test(`${run.name}: the board read from its origin matches run.json`, () => {
    assert.deepEqual(counts(readDesk(bundle).rows), run.board);
  });
}

test('a certificate re-signed with another key is valid on its own but not as the desk', () => {
  const { signature, ...body } = certOf(runs[0], runs[0].certificates[0]);
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
  const run = runs[0];
  const c = certOf(run, run.certificates.at(-1));
  const lie = { ...c, review: { approvedCommit: c.before.commit, approvalRef: `refs/approved/${c.before.commit}` } };
  const failed = audit(lie, join(run.dir, 'origin.bundle')).filter((r) => !r.ok).map((r) => r.name);
  assert.ok(failed.includes('It merges exactly the approved commit onto the commit before it'), failed.join('; '));
  assert.ok(failed.includes('The approval mark points at the approved commit'), failed.join('; '));
});
