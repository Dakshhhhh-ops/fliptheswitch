import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, build } from '../scripts/attack-data.mjs';
import { ATTACKS } from '../web/src/lib/attacks.js';

const attack = JSON.parse(readFileSync(OUT, 'utf8'));
const pem = (who) => createPublicKey(readFileSync(join('docs', 'live-run-3', `${who}.pub.pem`)));
const ok = (s, who, text = s.payload) => verify(null, Buffer.from(text), pem(who), Buffer.from(s.signature, 'base64'));

test('the desk app\'s "Try to break it" data comes from live run 3\'s git and is up to date', () => {
  assert.deepEqual(attack, build(), 'run: node scripts/attack-data.mjs');
});

test('each real signature verifies with its own key, and fails with the other key or any edit', () => {
  for (const s of attack.signed) {
    const other = s.who === 'shipper' ? 'reviewer' : 'shipper';
    assert.equal(ok(s, s.who), true, `${s.kind} should verify with ${s.who}`);
    assert.equal(ok(s, other), false, `${s.kind} must not verify with ${other}`);
    assert.equal(ok(s, s.who, s.payload.replace(/.$/, (c) => (c === '0' ? '1' : '0'))), false, `${s.kind} must fail after one edit`);
  }
});

test('every attack the page offers is refused, and the untouched record passes', () => {
  for (const s of attack.signed) {
    assert.equal(ok(s, s.who), true);
    for (const a of ATTACKS[s.kind]) {
      const text = a.edit ? a.edit(s.payload) : s.payload;
      const key = a.key ?? s.who;
      assert.ok(text !== s.payload || key !== s.who, `${a.label} changes nothing`);
      assert.equal(ok(s, key, text), false, `${a.label} should be refused`);
    }
  }
});
