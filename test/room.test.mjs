import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOG, OUT, build, parseLog } from '../scripts/room-moments.mjs';

const logText = readFileSync(LOG, 'utf8');
const room = JSON.parse(readFileSync(OUT, 'utf8'));

test('the desk app\'s "In the room" data is generated from live run 3\'s chat log and up to date', () => {
  assert.deepEqual(room, build(logText), 'run: node scripts/room-moments.mjs');
});

test('every line in the room is word for word from the log line it links to', () => {
  const byLine = new Map(parseLog(logText).map((l) => [l.n, l]));
  const groups = [...room.moments.map((m) => [m.id, m.lines]), ...Object.entries(room.added)];
  for (const [id, lines] of groups) {
    for (const l of lines) {
      const src = byLine.get(l.line);
      assert.ok(src, `${id}: no log line ${l.line}`);
      assert.equal(`${src.at}Z`, l.at);
      const quoted = l.text.replace(/ …$/, '');
      assert.ok(src.text.replace(/^🎭\s*/, '').startsWith(quoted), `${id} ${l.at}: "${quoted}" is not the start of log line ${l.line}`);
      assert.match(l.href, new RegExp(`chat-log\\.md\\?plain=1#L${l.line}$`));
    }
  }
});

test('the room shows the three moments: people change the fix, Switch refuses, the role lock holds', () => {
  assert.deepEqual(room.moments.map((m) => m.id), ['people', 'refusal', 'role']);
  assert.equal(room.label, 'From live run 3, 7 Nov 2026');
});

test('what people added covers all six findings, each in a person\'s own words', () => {
  assert.deepEqual(Object.keys(room.added).sort(), ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']);
  for (const [id, lines] of Object.entries(room.added)) assert.ok(lines.some((l) => l.kind === 'person'), id);
});
