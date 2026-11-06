// The scanner scored against labelled code (test/fixtures/scanner-bench):
// tricky real-world calls, decoys, and the cases a pattern scanner can't name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bench } from '../tools/scanner-bench.mjs';

test('the scanner reports nothing it should not, on the labelled code', () => {
  const r = bench();
  assert.deepEqual(r.falsePositives.map((c) => `${c.file}:${c.line}`), []);
  assert.equal(r.precision, 1);
});

test('the scanner finds at least 90% of what it should, and every miss is a known, listed gap', () => {
  const r = bench();
  assert.ok(r.recall >= 0.9, `recall ${r.recall}`);
  assert.deepEqual(r.misses.filter((c) => !c.gap).map((c) => `${c.file}:${c.line} ${c.want}`), []);
});
