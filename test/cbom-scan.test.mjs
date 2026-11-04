import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findings, scan, toCbom } from '../tools/cbom-scan.mjs';

const demo = fileURLToPath(new URL('../demo-payments', import.meta.url));

function repoWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'cbom-'));
  writeFileSync(join(dir, 'package.json'), '{"name":"fixture"}');
  mkdirSync(join(dir, 'src'));
  for (const [name, src] of Object.entries(files)) writeFileSync(join(dir, 'src', name), src);
  return dir;
}

test('finds the six planted problems in demo-payments, highest priority first', () => {
  const found = findings(scan(demo));
  assert.deepEqual(
    found.map((f) => [f.file, f.status, f.priority]),
    [
      ['src/envelope.js', 'vulnerable', 'P1'],
      ['src/session.js', 'vulnerable', 'P1'],
      ['src/tls.js', 'vulnerable', 'P1'],
      ['src/receipts.js', 'broken', 'P2'],
      ['src/webhooks.js', 'vulnerable', 'P2'],
      ['src/vault.js', 'policy', 'P3'],
    ],
  );
});

test('SHA-1 is reported as classically broken, not as a quantum problem', () => {
  const sha1 = findings(scan(demo)).find((f) => f.file === 'src/receipts.js');
  assert.equal(sha1.status, 'broken');
  assert.match(sha1.why, /not a quantum issue/);
});

test('writes a CycloneDX 1.6 CBOM with evidence for every asset', () => {
  const cbom = toCbom(scan(demo), { name: 'demo-payments' });
  assert.equal(cbom.bomFormat, 'CycloneDX');
  assert.equal(cbom.specVersion, '1.6');
  for (const c of cbom.components) {
    assert.equal(c.type, 'cryptographic-asset');
    assert.equal(c.cryptoProperties.assetType, 'algorithm');
    assert.ok(c.evidence.occurrences.length > 0, c['bom-ref']);
  }
  const rsa = cbom.components.find((c) => c.name === 'RSA-OAEP');
  assert.equal(rsa.cryptoProperties.algorithmProperties.nistQuantumSecurityLevel, 0);
  assert.deepEqual(rsa.cryptoProperties.algorithmProperties.cryptoFunctions.sort(), ['decrypt', 'encrypt', 'keygen']);
});

test('migrated code comes back clean', () => {
  const dir = repoWith({
    'kem.js': `
      import c from 'node:crypto';
      const kem = c.generateKeyPairSync('ml-kem-768');
      const x = c.generateKeyPairSync('x25519');
      const { sharedKey, ciphertext } = c.encapsulate(kem.publicKey);
      c.createCipheriv('aes-256-gcm', key, iv);
    `,
    'sig.js': `
      import c from 'node:crypto';
      const k = c.generateKeyPairSync('ml-dsa-65');
      c.sign(null, body, k.privateKey);
      c.createHash('sha3-256');
    `,
    'tls.js': `export const tlsOptions = { ecdhCurve: 'X25519MLKEM768:X25519' };`,
  });
  assert.deepEqual(findings(scan(dir)), []);
});

test('X25519 alone is flagged, X25519 beside ML-KEM is not', () => {
  const alone = repoWith({ 'a.js': `crypto.generateKeyPairSync('x25519');` });
  assert.equal(findings(scan(alone)).length, 1);
});

test('dual signatures keep ECDSA flagged so the inventory shows it is still there', () => {
  const dir = repoWith({
    'w.js': `
      const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const pq = generateKeyPairSync('ml-dsa-65');
      sign('sha256', body, ec.privateKey);
      sign(null, body, pq.privateKey);
    `,
  });
  const found = findings(scan(dir));
  assert.equal(found.length, 1);
  assert.equal(found[0].algorithm, 'ECDSA (P-256)');
});

test('commented-out code is ignored', () => {
  const dir = repoWith({ 'c.js': `// createHash('sha1')` });
  assert.deepEqual(scan(dir), []);
});

const algorithmsOf = (dir) => findings(scan(dir)).map((f) => f.algorithm.replace(/ \(.*/, '')).sort();

test('Web Crypto and JOSE algorithm names are found in TypeScript', () => {
  const dir = repoWith({
    'keys.ts': `
      const wrap = { name: 'RSA-OAEP', hash: 'SHA-256' };
      const sig = { name: 'ECDSA', namedCurve: 'P-256' };
      export const algs = ['RS256', 'EdDSA', 'ECDH-ES'];
    `,
    'types.d.ts': `export type A = 'RSA-OAEP';`,
  });
  assert.deepEqual(algorithmsOf(dir), ['ECDH', 'ECDSA', 'EdDSA', 'RSA signature', 'RSA-OAEP']);
  assert.ok(scan(dir).every((h) => h.file === 'src/keys.ts'), 'type declarations are skipped');
});

test('SSH key exchange and host key names are found, and hybrid PQ names are not flagged', () => {
  const dir = repoWith({
    'kex.js': `
      const KEX = ['mlkem768x25519-sha256', 'ecdh-sha2-nistp256', 'diffie-hellman-group14-sha256'];
      const HOST = ['ssh-ed25519', 'rsa-sha2-256'];
    `,
  });
  assert.deepEqual(algorithmsOf(dir), ['ECDH', 'EdDSA', 'Finite-field Diffie-Hellman', 'RSA signature']);
});

test('post-quantum algorithms named in Web Crypto style count as meeting policy', () => {
  const dir = repoWith({ 'pq.ts': `export const algs = ['ML-DSA-65', 'ML-KEM-768'];` });
  assert.deepEqual(findings(scan(dir)), []);
  const cbom = toCbom(scan(dir));
  assert.deepEqual(cbom.components.map((c) => c.name).sort(), ['ML-DSA-65', 'ML-KEM-768']);
});

test('ciphers beyond AES-GCM are classified', () => {
  const dir = repoWith({
    'c.js': `
      createCipheriv('chacha20-poly1305', k, iv);
      createCipheriv('aes-128-ctr', k, iv);
      createCipheriv('des-ede3-cbc', k, iv);
    `,
  });
  assert.deepEqual(algorithmsOf(dir), ['AES-128', 'Legacy cipher']);
});

test('test, example and build folders are not scanned', () => {
  const dir = repoWith({ 'ok.js': '' });
  for (const skip of ['tap', 'cookbook', 'dist']) {
    mkdirSync(join(dir, skip));
    writeFileSync(join(dir, skip, 'x.js'), `createHash('md5');`);
  }
  assert.deepEqual(scan(dir), []);
});
