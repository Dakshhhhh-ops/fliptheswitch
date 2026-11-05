import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findings, scan } from '../tools/cbom-scan.mjs';
import { findLifetime, lifetimeIn, moscaLine, verdict, withMosca } from '../tools/mosca.mjs';

const DEMO = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'demo-payments');
const NOW = new Date('2026-11-05T00:00:00Z');

test('reads how long data is kept, only from sentences about keeping it', () => {
  assert.equal(lifetimeIn('Settlement files are kept for 7 years').years, 7);
  assert.equal(lifetimeIn('retained 18 months for chargebacks').years, 1.5);
  assert.ok(lifetimeIn('valid inside the 5 minutes replay window').years < 0.001);
  assert.equal(lifetimeIn('stored for the life of the customer account').years, Infinity);
  assert.equal(lifetimeIn('Rotate keys after 3 years'), null, 'no keeping verb');
  assert.equal(lifetimeIn('The service started 2 years ago and is kept small').years, 2, 'known limit: one sentence, first amount');
});

test('finds the lifetime in the file comments first, then in docs that name the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mosca-'));
  try {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'infra'));
    writeFileSync(join(dir, 'src', 'a.js'), '// Tokens are kept for 2 years.\nexport const a = 1;\n');
    writeFileSync(join(dir, 'src', 'b.js'), 'export const b = 1;\n');
    writeFileSync(join(dir, 'src', 'c.js'), 'export const c = 1;\n');
    writeFileSync(join(dir, 'infra', 'NOTES.md'), '# Notes\n\n- Files from `src/b.js` are\n  archived for 10 years.\n- Something else is kept 1 year.\n');
    assert.deepEqual(findLifetime(dir, 'src/a.js').source, 'src/a.js:1');
    const b = findLifetime(dir, 'src/b.js');
    assert.equal(b.years, 10);
    assert.equal(b.source, 'infra/NOTES.md:3');
    assert.equal(findLifetime(dir, 'src/c.js'), null, 'a doc line that does not name the file does not count');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('x + y > z is late; a missing lifetime asks instead of guessing', () => {
  const f = { status: 'vulnerable', primitive: 'key-agree' };
  const opts = { now: NOW, migrationYears: 3, qdayYear: 2035 };
  assert.equal(verdict(f, { years: 7, said: '7 years' }, opts).verdict, 'late');
  assert.equal(verdict(f, { years: 7, said: '7 years' }, opts).margin, -1);
  assert.equal(verdict(f, { years: 5, said: '5 years' }, opts).verdict, 'close');
  assert.equal(verdict(f, { years: 1, said: '1 year' }, opts).verdict, 'on time');
  assert.equal(verdict(f, { years: Infinity, said: 'life of the account' }, opts).verdict, 'late');
  assert.equal(verdict(f, null, opts).verdict, 'ask');
  assert.equal(verdict({ status: 'broken' }, null, opts).verdict, 'late');
  assert.equal(verdict({ status: 'policy' }, null, opts).verdict, 'n/a');
  assert.equal(verdict(f, { years: 7, said: '7 years' }, { ...opts, qdayYear: 2040 }).verdict, 'on time', 'z is an assumption you can change');
});

test('on the demo: card vault and settlement files are late, TLS asks, webhooks are on time', () => {
  const found = withMosca(findings(scan(DEMO)), DEMO, { now: NOW });
  const by = Object.fromEntries(found.map((f) => [f.id, f.mosca]));
  assert.equal(by.F1.verdict, 'late');
  assert.match(by.F1.lifetime.source, /^infra\/DEPLOY\.md:/);
  assert.equal(by.F2.verdict, 'late');
  assert.equal(by.F2.lifetime.years, 7);
  assert.equal(by.F3.verdict, 'ask');
  assert.equal(by.F4.clock, 'broken');
  assert.equal(by.F5.verdict, 'on time');
  assert.equal(by.F6.clock, 'grover');
  assert.match(moscaLine(by.F2), /7 \+ 3 vs 9 years, from infra\/DEPLOY\.md:\d+/);
});
