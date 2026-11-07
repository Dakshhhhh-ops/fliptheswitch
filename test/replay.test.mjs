import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOG, parseLog } from '../scripts/room-moments.mjs';
import { OUT, build, shown } from '../scripts/replay-data.mjs';

const logText = readFileSync(LOG, 'utf8');
const replay = JSON.parse(readFileSync(OUT, 'utf8'));

test('the desk app\'s replay is generated from live run 3\'s chat log and up to date', () => {
  assert.deepEqual(replay, build(logText), 'run: node scripts/replay-data.mjs');
});

test('every replayed event is word for word from its log line, in order, at its real time', () => {
  const byLine = new Map(parseLog(logText).map((l) => [l.n, l]));
  let last = -1;
  for (const e of replay.events) {
    const src = byLine.get(e.line);
    assert.ok(src, `no log line ${e.line}`);
    assert.equal(`${src.at}Z`, e.at);
    assert.ok(e.t >= last, `event at line ${e.line} is out of order`);
    last = e.t;
    const quoted = e.text.replace(/ …$/, '');
    assert.ok(shown(src.text.replace(/^🎭\s*/, '')).startsWith(quoted), `line ${e.line}: "${quoted}"`);
  }
});

test('the replay ends where the run did: five ships, one accepted risk, and F6 in review', () => {
  const git = replay.events.filter((e) => e.kind === 'git').map((e) => e.text);
  const ships = git.map((t) => /^\w+ Ship (F\d):/.exec(t)?.[1]).filter(Boolean);
  assert.deepEqual(ships.sort(), ['F1', 'F2', 'F3', 'F4', 'F5']);
  assert.equal(git.filter((t) => /^\w+ Accept risk F3:/.test(t)).length, 1);
  assert.ok(replay.events.some((e) => e.room === 'heads/pqc/f6-vault'));
  assert.ok(!JSON.stringify(replay).toLowerCase().includes('claude'));
});
