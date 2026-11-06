// The judge run doubles as an end-to-end test: real gate, scanner, tests and certificate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../scripts/judge.mjs';
import { liveRuns } from '../tools/replay.mjs';

// 15 checks on the scripted run, then per live run: one per certificate, the
// replay through the gate, and the board.
const expected = 15 + liveRuns().reduce((n, run) => n + run.certificates.length + 2, 0);

test('every check in the judge run holds', () => {
  const { results } = judge({ log: () => {}, keep: false });
  assert.equal(results.length, expected);
  for (const r of results) assert.ok(r.ok, `${r.title}: expected ${r.expect}`);
});
