// The judge run doubles as an end-to-end test: real gate, scanner, tests and certificate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../scripts/judge.mjs';

test('every check in the judge run holds', () => {
  const { results } = judge({ log: () => {}, keep: false });
  assert.equal(results.length, 14);
  for (const r of results) assert.ok(r.ok, `${r.title}: expected ${r.expect}`);
});
