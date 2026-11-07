import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeProblem } from '../scripts/need-node.mjs';

const yes = () => true;

test('Node 24.7 and later pass', () => {
  assert.equal(nodeProblem('24.7.0', yes), null);
  assert.equal(nodeProblem('25.1.0', yes), null);
});

test('older Node is refused with the version it needs', () => {
  for (const v of ['20.18.0', '22.11.0', '24.6.0']) assert.match(nodeProblem(v, yes), /needs Node 24\.7 or later/);
});

test('a Node build without ML-KEM or ML-DSA is refused', () => {
  assert.match(nodeProblem('24.9.0', () => false), /no ML-KEM or ML-DSA/);
});

test('this machine passes', () => {
  assert.equal(nodeProblem(), null);
});
