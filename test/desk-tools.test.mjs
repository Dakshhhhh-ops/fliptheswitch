// desk:up, desk:watch and desk:package: the parts that don't need Switch running.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextTeam, packaged, teamsIn } from '../scripts/desk-up.mjs';
import { isPerson, parsePosts } from '../scripts/desk-watch.mjs';
import { nextRunDir, packageRun } from '../scripts/desk-package.mjs';
import { judge } from '../scripts/judge.mjs';

test('desk:up picks the first team prefix no earlier run used', () => {
  const taken = teamsIn(['desk-scout', 'desk2-intake', 'desk2-f1-envelope', 'desk3-findings.json', 'arjun', 'switch-buddy-admin', 'desk3-shipper']);
  assert.deepEqual([...taken].sort(), ['desk', 'desk2', 'desk3']);
  assert.equal(nextTeam(taken), 'desk4');
  assert.equal(nextTeam(new Set()), 'desk');
});

test("desk:up knows whether the origin's run is already in docs/", () => {
  const docs = mkdtempSync(join(tmpdir(), 'desk-docs-'));
  mkdirSync(join(docs, 'live-run-2'));
  writeFileSync(join(docs, 'live-run-2', 'refs.txt'), 'refs/heads/main 374c45f3ec4949ec45dd43a3f842e345b59e70ba\n');
  assert.ok(packaged('374c45f3ec4949ec45dd43a3f842e345b59e70ba', docs));
  assert.equal(packaged('0000000000000000000000000000000000000000', docs), false);
});

test("desk:watch reads mmctl's post list, and tells people from agents", () => {
  const raw = [
    'abcdefghijklmnopqrstuvwxyz [desk4-migrator] F5 plan:',
    '1. dual-sign',
    '2. tests',
    'bcdefghijklmnopqrstuvwxyza [arjun] @desk4-migrator keep ECDSA',
    'There are 2 posts on local instance',
  ].join('\n');
  const posts = parsePosts(raw);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].text, 'F5 plan: 1. dual-sign 2. tests');
  assert.equal(isPerson('arjun', 'desk4'), true);
  assert.equal(isPerson('user', 'desk4'), true);
  assert.equal(isPerson('desk4-shipper', 'desk4'), false);
  assert.equal(isPerson('switch-admin', 'desk4'), false);
});

test('desk:package names the next run folder', () => {
  const docs = mkdtempSync(join(tmpdir(), 'desk-docs-'));
  assert.equal(nextRunDir(docs).n, 1);
  mkdirSync(join(docs, 'live-run'));
  mkdirSync(join(docs, 'live-run-2'));
  assert.deepEqual([nextRunDir(docs).n, nextRunDir(docs).dir], [3, join(docs, 'live-run-3')]);
});

test('desk:package keeps a run as evidence, and skips a certificate from another run', () => {
  // The judge's scripted run: F5 shipped with a certificate, F3 accepted.
  const { root, certFile } = judge({ log: () => {}, keep: true });
  const certs = mkdtempSync(join(tmpdir(), 'desk-certs-'));
  writeFileSync(join(certs, 'F5.cert.json'), readFileSync(certFile));
  const log = join(certs, 'run-log.md');
  writeFileSync(log, '12:00:00Z HUMAN#1 desk9-f5-webhooks user: @desk9-shipper ship F5\n12:00:15Z agent desk9-f5-webhooks desk9-shipper: F5 shipped\n');
  const out = join(mkdtempSync(join(tmpdir(), 'desk-out-')), 'live-run-9');

  // The judge signs with a throwaway key: package against that key.
  const key = join(root, 'desk-key.pub.pem');
  const r = packageRun({ origin: join(root, 'origin.git'), certs, out, log, team: 'desk9', name: 'Test run', key });
  assert.deepEqual(r.run.certificates, ['F5']);
  assert.ok(r.certChecks.every((c) => c.ok));
  assert.ok(r.replay.ok, 'the replay passes the gate');
  assert.equal(r.run.board.shipped, 1);
  assert.equal(r.run.board['accepted risk'], 1);
  for (const f of ['origin.bundle', 'refs.txt', 'main-log.txt', 'scan-after.md', 'chat-log.md', 'run.json', 'README.md', 'F5.cert.json']) assert.ok(existsSync(join(out, f)), f);
  assert.match(readFileSync(join(out, 'README.md'), 'utf8'), /\| 12:00 \| user \| f5-webhooks \| @desk9-shipper ship F5 \|/);

  // The same certificate against the desk's real key: not the desk's, so it's left out.
  const out2 = join(mkdtempSync(join(tmpdir(), 'desk-out-')), 'live-run-9');
  const r2 = packageRun({ origin: join(root, 'origin.git'), certs, out: out2, log, team: 'desk9', name: 'Test run' });
  assert.deepEqual(r2.run.certificates, []);
  assert.match(r2.skipped[0], /^F5: /);
});
