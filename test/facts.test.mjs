import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOG, parseLog } from '../scripts/room-moments.mjs';
import { FACTS, OUT, build } from '../scripts/facts-data.mjs';

const logText = readFileSync(LOG, 'utf8');
const facts = JSON.parse(readFileSync(OUT, 'utf8'));

test('"Facts no scanner could find" is generated from live run 3\'s chat log and up to date', () => {
  assert.deepEqual(facts, build(logText), 'run: node scripts/facts-data.mjs');
});

test('every fact is a person\'s own words on its log line, and what changed is on its proof line', () => {
  const byLine = new Map(parseLog(logText).map((l) => [l.n, l]));
  facts.facts.forEach((f, i) => {
    const said = byLine.get(f.line);
    assert.ok(['arjun', 'user'].includes(said.who), `${f.finding}: line ${f.line} is not a person`);
    assert.ok(said.text.includes(f.says), `${f.finding}: "${f.says}" not on line ${f.line}`);
    assert.ok(byLine.get(f.proofLine).text.includes(FACTS[i].proof), `${f.finding}: proof not on line ${f.proofLine}`);
  });
});
