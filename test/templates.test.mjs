import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIXED, MAIN, ROOMS, build } from '../scripts/make-fixed-rooms.mjs';

const main = readFileSync(MAIN, 'utf8');

test('the fixed-rooms template is generated from the main one and up to date', () => {
  assert.equal(readFileSync(FIXED, 'utf8'), build(main), 'run: node scripts/make-fixed-rooms.mjs');
});

test('the main template opens rooms only for the focus findings, F5 first', () => {
  assert.match(main, /default: F5, F1, F3\n/);
  assert.doesNotMatch(main, /open a room for every finding/);
  assert.match(main, /open a room for each finding in this list/);
});

test('the fixed-rooms template declares each room with an exclusive reviewer role', () => {
  const fixed = readFileSync(FIXED, 'utf8');
  for (const r of ROOMS) {
    assert.match(fixed, new RegExp(`\\n  ${r.key}:\\n    type: room\\n    group: desk\\n    name: '\\{team\\}-${r.key}-${r.stem}'`));
    assert.match(fixed, new RegExp(`\\{from: intake, to: ${r.key}, label: finding ${r.id}\\}`));
  }
  assert.equal(fixed.match(/exclusive: true/g).length, ROOMS.length);
  assert.doesNotMatch(fixed, /## Opening work rooms/);
});

test('a single provider is offered for people without Codex', () => {
  assert.match(main, /No Codex\? Set this and the reviewer's provider both to claude\./);
});

// Lessons from the live runs: the reviewer released its role right after
// approving, and a stalled shell made it give up at once.
test('the reviewer keeps its role until the ship, and retries a stalled shell', () => {
  assert.match(main, /Keep the role after your verdict/);
  assert.match(main, /up to three times over\s+about five minutes/);
  assert.match(main, /Never approve without running the checks below/);
});

test('the shipper ships only a verdict from the agent holding the role now', () => {
  assert.match(main, /holds the\s+`reviewer` role in this room now/);
  assert.match(main, /If\s+nobody holds it, or someone else does, don't ship/);
});
