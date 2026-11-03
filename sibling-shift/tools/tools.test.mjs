import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { lookup, normalize } from './lib.mjs';
import { check } from './med-check.mjs';
import { apply, chart } from './medlist.mjs';

const demo = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`../demo/${f}`, import.meta.url)), 'utf8'));
const papa = demo('papa-medicines.json');
const rx = demo('rx-cardiology.json');

test('brand names are matched the way prescriptions write them', () => {
  assert.equal(normalize('Tab. TELSARTAN-40 mg'), normalize('Telsartan 40'));
  assert.equal(lookup('tab telma 40').brand, 'Telma 40');
  assert.equal(lookup('Crocin 650'), null);
});

test('Telsartan on top of Telma is a duplicate: same medicine, double dose', () => {
  const { flags } = check(papa, rx);
  const dup = flags.find((f) => f.kind === 'duplicate');
  assert.equal(dup.level, 'stop');
  assert.equal(dup.brand, 'Telsartan 40');
  assert.equal(dup.other, 'Telma 40');
  assert.deepEqual(dup.ingredients, ['telmisartan']);
  assert.match(dup.ask, /Dr\. Kavita Rao/);
});

test('a second statin is flagged as same family, not as a duplicate', () => {
  const sameClass = check(papa, rx).flags.find((f) => f.kind === 'same-class');
  assert.equal(sameClass.brand, 'Rozavel 10');
  assert.equal(sameClass.other, 'Storvas 10');
  assert.equal(sameClass.level, 'ask');
});

test('aspirin plus clopidogrel is not flagged: different families, often prescribed together', () => {
  assert.ok(check(papa, rx).clear.includes('Clopilet 75'));
});

test('a combination tablet is caught when one of its ingredients is already taken', () => {
  const { flags } = check(papa, { items: [{ brand: 'Telma-AM' }] });
  assert.equal(flags[0].kind, 'duplicate');
  assert.equal(flags[0].other, 'Telma 40');
});

test('an unknown brand is reported, never guessed', () => {
  const { flags, clear } = check(papa, { items: [{ brand: 'Crocin 650' }] });
  assert.equal(flags[0].kind, 'unknown');
  assert.deepEqual(clear, []);
});

test('duplicates inside the same prescription are caught too', () => {
  const { flags } = check({ medicines: [] }, { items: [{ brand: 'Amlong 5' }, { brand: 'Stamlo 5' }] });
  assert.equal(flags[0].kind, 'duplicate');
});

test('replacing keeps the timing and purpose, bumps the version and records who', () => {
  const next = apply(papa, { action: 'replace', brand: 'Telma 40', to: 'Telsartan 40', opts: {}, by: 'Didi', at: '2026-11-05 14:30' });
  const bp = next.medicines.find((m) => m.brand === 'Telsartan 40');
  assert.equal(bp.when, 'after breakfast');
  assert.equal(bp.for, 'BP');
  assert.equal(next.version, papa.version + 1);
  assert.equal(next.updatedBy, 'Didi');
  assert.ok(!next.medicines.some((m) => m.brand === 'Telma 40'));
  assert.equal(papa.medicines.some((m) => m.brand === 'Telma 40'), true, 'the original is not mutated');
});

test('a brand outside the lookup table cannot be added', () => {
  assert.throws(() => apply(papa, { action: 'add', brand: 'Crocin 650', opts: { dose: '0-0-1' } }), /not in the lookup table/);
});

test('the pill chart lists each tablet under the right time of day, in Hindi and English', () => {
  const html = chart(papa);
  assert.match(html, /सुबह · Morning/);
  const night = html.slice(html.indexOf('रात · Night'));
  assert.match(night, /Storvas 10/);
  assert.match(night, /Glycomet 500/);
  assert.doesNotMatch(night, /Telma 40/);
});
