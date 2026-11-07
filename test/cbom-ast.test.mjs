// cbom-scan: ignore-file (fixtures name algorithms on purpose)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { astScan, parsable } from '../tools/cbom-ast.mjs';
import { crosscheck } from '../tools/scanner-crosscheck.mjs';
import { SCANNER_VERSION, scan as scanNow, scanSource } from '../tools/cbom-scan.mjs';
import { scan as scanV1 } from '../tools/scanner-versions/cbom-scan-1.mjs';
import { scannerFor } from '../tools/certificate.mjs';

const DESK = join(dirname(fileURLToPath(import.meta.url)), '..');
const sites = (src) => astScan(src, 'x.js').sites.map((s) => `${s.line}:${s.api}${s.algorithm ? `(${s.algorithm})` : ''}`);
const keys = (src) => scanSource(src, 'x.js').map((h) => `${h.line}:${h.key}`);

test('the parser sees through comments, strings and renamed imports', () => {
  const src = [
    "const { createHash: digest } = require('node:crypto');",
    "// crypto.createHash('md5') in a comment is not a call",
    "const doc = \"createHash('md5') in a string is not a call\";",
    "digest('md5');",
  ].join('\n');
  assert.deepEqual(sites(src), ['4:createHash(md5)']);
});

test('the parser knows what a name is bound to', () => {
  const src = [
    "import jwt from 'jsonwebtoken';",
    "import { sign } from 'node:crypto';",
    "jwt.sign(payload, key, { algorithm: 'RS256' });",
    "sign('sha256', data, key);",
    'other.sign(data);',
  ].join('\n');
  assert.deepEqual(sites(src), ['3:jsonwebtoken.sign(RS256)', '4:sign(sha256)']);
});

test('the parser resolves a constant algorithm and a constant object property', () => {
  const src = [
    "const crypto = require('crypto');",
    "const ALG = 'sha1';",
    "const CFG = { cipher: 'aes-128-gcm' };",
    'crypto.createHash(ALG);',
    'crypto.createCipheriv(CFG.cipher, key, iv);',
    'crypto.createHash(runtimeValue);',
  ].join('\n');
  assert.deepEqual(sites(src), ['4:createHash(sha1)', '5:createCipheriv(aes-128-gcm)', '6:createHash']);
});

test('a guarded require and an ECDH object kept on a property still count', () => {
  const src = [
    "var _crypto = isNode ? require('crypto') : null;",
    "_crypto.generateKeyPair('rsa', {}, cb);",
    "this._dh = _crypto.createECDH('prime256v1');",
    'this._dh.computeSecret(peer);',
  ].join('\n');
  assert.deepEqual(sites(src), ['2:generateKeyPair(rsa)', '3:createECDH(prime256v1)', '4:ecdh.computeSecret']);
});

test('TypeScript is not parsed, and says so', () => {
  assert.equal(parsable('a.ts'), false);
  assert.equal(parsable('a.mjs'), true);
  assert.equal(astScan('let x: number = 1;', 'a.js').parsed, false);
});

test('the rule fixes the parser found on real code', () => {
  // ssh2: renamed imports, a runtime key type, crypto.diffieHellman()
  const ssh2 = [
    "const { sign: sign_, generateKeyPair: generateKeyPair_, diffieHellman } = require('crypto');",
    'sign_(algo, data, pem);',
    'generateKeyPair_(...args, cb);',
    'diffieHellman({ privateKey, publicKey });',
    'function sign(data, algo) { return 1; }',
    'computeSecret(other) { return 2; }',
  ].join('\n');
  assert.deepEqual(keys(ssh2), ['2:keytype-unknown', '3:keytype-unknown', '4:classical-kex']);
  // forge: pbkdf2 with no digest (old Node: SHA-1), and the SHA-2 family in the inventory
  const forge = ["const crypto = require('crypto');", 'crypto.pbkdf2Sync(p, s, c, dkLen);', 'forge.md.sha256.create();'].join('\n');
  assert.deepEqual(keys(forge), ['2:sha1', '3:sha256']);
});

test('a certificate is audited with the scanner version that issued it', () => {
  assert.equal(scannerFor({}), scanV1, 'no field: version 1, as in live runs 1-3');
  assert.equal(scannerFor({ scanner: SCANNER_VERSION }), scanNow);
  assert.equal(scannerFor({ scanner: 99 }), undefined, 'an unknown version is not audited as if it were current');
});

test('on demo-payments the rules and the parser agree, except scrypt', () => {
  const r = crosscheck(join(DESK, 'demo-payments'));
  assert.equal(r.summary.precision, 100, JSON.stringify(r.offCall));
  assert.deepEqual(r.missed.map((m) => `${m.file}:${m.api}`), ['src/vault.js:scryptSync']);
  assert.equal(r.summary.weakFlagged, r.summary.weakSites);
});
