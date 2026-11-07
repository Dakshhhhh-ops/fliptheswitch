// desk:up, desk:watch and desk:package: the parts that don't need Switch running.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextTeam, packaged, teamsIn } from '../scripts/desk-up.mjs';
import { cleanLog, isPerson, parsePosts } from '../scripts/desk-watch.mjs';
import { nextRunDir, packageRun } from '../scripts/desk-package.mjs';
import { leftovers, switchAgents } from '../scripts/local-switch.mjs';
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

  // Repackaging into the same folder (--out): the written-up README, the
  // screenshots and the run's name are kept; the draft goes elsewhere.
  writeFileSync(join(out, 'README.md'), '# My write-up\n');
  writeFileSync(join(out, 'final-board.png'), 'png');
  writeFileSync(join(out, 'run.json'), JSON.stringify({ name: 'Live run 9' }));
  const draft = join(certs, 'draft.md');
  const again = packageRun({ origin: join(root, 'origin.git'), certs, out, log, draft, team: 'desk9', key });
  assert.equal(readFileSync(join(out, 'README.md'), 'utf8'), '# My write-up\n');
  assert.equal(readFileSync(join(out, 'final-board.png'), 'utf8'), 'png');
  assert.ok(again.readmeKept);
  assert.equal(again.run.name, 'Live run 9');
  assert.match(readFileSync(draft, 'utf8'), /ship F5/);
  assert.deepEqual(again.run.certificates, ['F5']);

  // The same certificate against the desk's real key: not the desk's, so it's left out.
  const out2 = join(mkdtempSync(join(tmpdir(), 'desk-out-')), 'live-run-9');
  const r2 = packageRun({ origin: join(root, 'origin.git'), certs, out: out2, log, team: 'desk9', name: 'Test run' });
  assert.deepEqual(r2.run.certificates, []);
  assert.match(r2.skipped[0], /^F5: /);
});

// Process lines as Switch and an editor start them (from live run 3's machine).
const NPM = '"C:\Users\d\AppData\Roaming\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe"';
const agentCmd = (name) => `${NPM}    "--output-format" "stream-json" "--verbose" "--input-format" "stream-json" "--agent" "${name}" "--permission-prompt-tool"`;
const codexApp = (port) => `app-server --enable multi_agent_v2 -c "mcp_servers.switch.url=\\"http://127.0.0.1:${port}/mcp\\""`;
const PROCS = [
  { pid: 1, ppid: 0, minutes: 1200, cmd: 'c:\Users\d\.vscode\extensions\anthropic.claude-code\claude.exe --output-format stream-json --verbose --input-format stream-json' },
  { pid: 2, ppid: 0, minutes: 1200, cmd: 'c:\Users\d\.vscode\extensions\openai.chatgpt\codex.exe app-server --analytics-default-enabled' },
  { pid: 3, ppid: 0, minutes: 1167, cmd: agentCmd('desk3-scout') },
  { pid: 4, ppid: 0, minutes: 1149, cmd: agentCmd('desk3-shipper') },
  { pid: 5, ppid: 0, minutes: 77, cmd: agentCmd('desk4-scout') },
  { pid: 6, ppid: 0, minutes: 30, cmd: agentCmd('switch-buddy-admin') },
  { pid: 7, ppid: 0, minutes: 80, cmd: `"node" "C:\npm\node_modules\@openai\codex\bin\codex.js" ${codexApp(55200)}` },
  { pid: 8, ppid: 7, minutes: 80, cmd: `C:\npm\node_modules\@openai\codex\vendor\codex.exe ${codexApp(55200)}` },
  { pid: 9, ppid: 0, minutes: 28, cmd: `"node" "C:\npm\node_modules\@openai\codex\bin\codex.js" ${codexApp(51271)}` },
  { pid: 10, ppid: 9, minutes: 28, cmd: `C:\npm\node_modules\@openai\codex\vendor\codex.exe ${codexApp(51271)}` },
];

test('switchAgents lists only Switch agents, one entry per Codex session', () => {
  const { claude, codex } = switchAgents(PROCS);
  assert.deepEqual(claude.map((a) => [a.pid, a.agent, a.team]), [[3, 'desk3-scout', 'desk3'], [4, 'desk3-shipper', 'desk3'], [5, 'desk4-scout', 'desk4']]);
  assert.deepEqual(codex.map((a) => a.pid), [9, 7]);
});

test('leftovers: other teams, and every Codex session but the newest', () => {
  const agents = switchAgents(PROCS);
  const mid = leftovers(agents, { team: 'desk4' });
  assert.deepEqual(mid.claude.map((a) => a.pid), [3, 4]);
  assert.deepEqual(mid.codex.map((a) => a.pid), [7]);
  const fresh = leftovers(agents, { team: 'desk5', fresh: true });
  assert.deepEqual(fresh.claude.map((a) => a.pid), [3, 4, 5]);
  assert.deepEqual(fresh.codex.map((a) => a.pid), [9, 7]);
  assert.deepEqual(leftovers(agents).claude.map((a) => a.pid), [3, 4], 'no team known: older than 6 hours');
});

test('cleanLog drops what a restarted desk:watch logged again, and keeps resends', () => {
  const log = [
    '05:00:00Z watching desk4; log in work/desk4-run-log.md',
    '05:00:10Z GIT refs/heads/main abc1234 planted',
    '05:01:00Z HUMAN#1 desk4-f3-tls user: @desk4-shipper ship F3',
    '05:02:00Z HUMAN#2 desk4-f3-tls user: @desk4-shipper ship F3',
    '06:00:00Z watching desk4; log in work/desk4-run-log.md',
    '06:00:05Z GIT refs/heads/main abc1234 planted',
    '06:00:06Z HUMAN#1 desk4-f3-tls user: @desk4-shipper ship F3',
    '06:00:07Z HUMAN#2 desk4-f3-tls user: @desk4-shipper ship F3',
    '06:05:00Z HUMAN#3 desk4-f2-jwt arjun: use ML-DSA',
    '06:06:00Z agent desk4-f2-jwt desk4-migrator: ok',
  ];
  assert.deepEqual(cleanLog(log), [
    '05:00:10Z GIT refs/heads/main abc1234 planted',
    '05:01:00Z HUMAN#1 desk4-f3-tls user: @desk4-shipper ship F3',
    '05:02:00Z HUMAN#2 desk4-f3-tls user: @desk4-shipper ship F3',
    '06:05:00Z HUMAN#3 desk4-f2-jwt arjun: use ML-DSA',
    '06:06:00Z agent desk4-f2-jwt desk4-migrator: ok',
  ]);
});
