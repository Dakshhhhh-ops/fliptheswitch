import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findings, gate, scan, toCbom, toSarif } from '../tools/cbom-scan.mjs';

const demo = fileURLToPath(new URL('../demo-payments', import.meta.url));
const scanner = fileURLToPath(new URL('../tools/cbom-scan.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

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

// Cases from an outside review of the scanner.

test('a crypto name in a trailing comment or a template string is not a finding', () => {
  const dir = repoWith({
    'c.js': [
      "const x = 1; // migrated away from 'RS256'",
      "const doc = `use createHash('md5') here`;",
      "/* createECDH('prime256v1') */",
    ].join('\n'),
  });
  assert.deepEqual(scan(dir), []);
});

test('a call split across lines is found, on the line it starts', () => {
  const dir = repoWith({ 'e.js': "const a = 1;\nconst e = crypto.createECDH(\n  'prime256v1');" });
  const [f] = findings(scan(dir));
  assert.equal(f.algorithm, 'ECDH (P-256)');
  assert.equal(f.line, 2);
});

test('hash names are read in any spelling, from constants, and from pbkdf2 and Sign', () => {
  const dir = repoWith({
    'h.js': [
      "const alg = 'sha1';",
      'crypto.createHash(alg);',
      "crypto.createHash('SHA-1');",
      "crypto.pbkdf2Sync(pw, salt, 1000, 32, 'sha1');",
      "crypto.createSign('RSA-SHA1');",
    ].join('\n'),
  });
  const sha1 = findings(scan(dir)).find((f) => f.algorithm === 'SHA-1');
  assert.deepEqual(sha1.lines, [2, 3, 4, 5]);
  assert.ok(findings(scan(dir)).some((f) => f.algorithm === 'RSA signature'), "createSign('RSA-SHA1') is an RSA signature");
});

test('a hash or cipher named by a value the scanner cannot resolve is flagged for review', () => {
  const dir = repoWith({ 'r.js': 'createHash(opts.alg);\ncreateCipheriv(this.name, key, iv);' });
  assert.deepEqual(
    findings(scan(dir)).map((f) => [f.algorithm, f.status]),
    [['Cipher chosen at runtime', 'review'], ['Hash chosen at runtime', 'review']],
  );
});

test('a signature with a key loaded from PEM is a classical signature', () => {
  const dir = repoWith({
    'p.js': [
      "const key = crypto.createPrivateKey(readFileSync('k.pem'));",
      "crypto.sign('sha256', data, key);",
      "crypto.createSign('sha256').update(data).sign(key);",
    ].join('\n'),
  });
  const [f] = findings(scan(dir));
  assert.equal(f.algorithm, 'Classical signature (RSA or ECDSA)');
  assert.deepEqual(f.lines, [2, 3]);
  assert.match(f.fix, /ML-DSA/);
});

test('an RSA key that signs is an RSA signature, not RSA-OAEP', () => {
  const dir = repoWith({
    's.js': "const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });\nsign('sha256', data, privateKey);",
  });
  const found = findings(scan(dir));
  assert.deepEqual(found.map((f) => f.algorithm), ['RSA signature (2048)']);
  assert.match(found[0].fix, /ML-DSA/);
});

test('with a baseline, fixing a finding does not renumber the others', () => {
  const before = findings(scan(demo));
  const baseline = before.map(({ id, ref }) => ({ id, ref }));
  const afterF1 = findings(scan(demo).filter((h) => h.file !== 'src/envelope.js'), { baseline });
  for (const f of afterF1) assert.equal(f.id, before.find((b) => b.ref === f.ref).id, f.ref);
  assert.ok(!afterF1.some((f) => f.id === 'F1'));
  const fresh = findings(scan(repoWith({ 'n.js': "createHash('md5');" })), { baseline });
  assert.equal(fresh[0].id, 'F7', 'a new finding gets the next free number');
});

test('the command line explains a missing folder and scans one without package.json', () => {
  const run = (...args) => spawnSync(process.execPath, [scanner, ...args], { encoding: 'utf8' });
  const missing = run(join(tmpdir(), 'no-such-folder-crypto-desk'));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /is not a folder/);
  assert.doesNotMatch(missing.stderr, /at .*node:fs/);

  const dir = mkdtempSync(join(tmpdir(), 'cbom-'));
  writeFileSync(join(dir, 'a.js'), "createHash('md5');");
  const base = join(dir, 'baseline.json');
  const first = run(dir, '--json', '--baseline', base);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).findings[0].id, 'F1');
  assert.deepEqual(JSON.parse(readFileSync(base, 'utf8')).findings, [{ id: 'F1', ref: 'a.js#md5' }]);
});

// SARIF for GitHub code scanning, and the --fail-on CI gate.

const cli = (args, opts = {}) => spawnSync(process.execPath, [scanner, ...args], { encoding: 'utf8', ...opts });

test('SARIF has one rule per algorithm and one result per finding, on the right line', () => {
  const found = findings(scan(demo));
  const sarif = toSarif(found, { root: 'demo-payments' });
  assert.equal(sarif.version, '2.1.0');
  const [run] = sarif.runs;
  const rules = run.tool.driver.rules;
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length, 'rule ids are unique');
  const rsa = rules.find((r) => r.id === 'pqc/rsa-oaep');
  assert.ok(rsa.name && rsa.shortDescription.text && rsa.help.text.includes('ML-KEM'));
  assert.ok(rsa.properties.tags.includes('quantum-vulnerable'));
  assert.equal(rsa.properties['security-severity'], '9.0');
  assert.ok(rules.find((r) => r.id === 'pqc/sha1').properties.tags.includes('classically-broken'));
  assert.ok(rules.find((r) => r.id === 'pqc/aes-128-gcm').properties.tags.includes('policy'));

  assert.equal(run.results.length, found.length);
  for (const [i, r] of run.results.entries()) {
    assert.equal(rules[r.ruleIndex].id, r.ruleId);
    const { uri } = r.locations[0].physicalLocation.artifactLocation;
    assert.equal(uri, `demo-payments/${found[i].file}`);
    assert.doesNotMatch(uri, /\|^\/|^[A-Za-z]:/, 'relative, forward slashes');
    assert.equal(r.locations[0].physicalLocation.region.startLine, found[i].line);
    assert.equal(r.partialFingerprints['cryptoDeskFinding/v1'], found[i].ref);
  }
  const levelOf = (file) => run.results.find((r) => r.locations[0].physicalLocation.artifactLocation.uri.endsWith(file)).level;
  assert.equal(levelOf('envelope.js'), 'error', 'vulnerable P1');
  assert.equal(levelOf('receipts.js'), 'error', 'classically broken');
  assert.equal(levelOf('webhooks.js'), 'warning', 'vulnerable P2');
  assert.equal(levelOf('vault.js'), 'note', 'policy');
});

test('SARIF leaves out crypto that meets policy', () => {
  const dir = repoWith({
    'mixed.js': "createHash('sha256');\ncreateCipheriv('aes-256-gcm', k, iv);\ncreateHash('md5');",
  });
  const run = toSarif(findings(scan(dir))).runs[0];
  assert.deepEqual(run.results.map((r) => r.ruleId), ['pqc/md5']);
  assert.equal(run.results[0].locations[0].physicalLocation.artifactLocation.uri, 'src/mixed.js');
  assert.ok(!run.tool.driver.rules.some((r) => r.id === 'pqc/sha256'), 'no rule for an ok algorithm');
  const ok = { id: 'F9', ref: 'src/x.js#sha256', key: 'sha256', file: 'src/x.js', line: 1, lines: [1], status: 'ok' };
  assert.equal(toSarif([ok]).runs[0].results.length, 0);
});

test('the command line writes SARIF with paths from the repo root', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'sarif-')), 'scan.sarif');
  const r = cli(['demo-payments', '--sarif', out], { cwd: repoRoot });
  assert.equal(r.status, 0, r.stderr);
  const sarif = JSON.parse(readFileSync(out, 'utf8'));
  assert.ok(sarif.runs[0].results.every((x) => x.locations[0].physicalLocation.artifactLocation.uri.startsWith('demo-payments/src/')));
});

test('--fail-on fails on the demo at p1, passes with none, and rejects a bad level', () => {
  const p1 = cli([demo, '--fail-on', 'p1']);
  assert.equal(p1.status, 1);
  assert.match(p1.stderr, /gate failed: 3 findings at P1 or above/);
  assert.match(p1.stderr, /src\/envelope\.js:15/);
  assert.doesNotMatch(p1.stderr, /receipts/, 'P2 findings do not fail a p1 gate');
  assert.equal(cli([demo, '--fail-on', 'none']).status, 0);
  assert.equal(cli([demo]).status, 0, 'no gate by default');
  assert.equal(cli([demo, '--fail-on', 'any']).status, 1);
  const bad = cli([demo, '--fail-on', 'p0']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--fail-on must be one of/);
});

test('with a baseline, --fail-on counts only new findings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  const all = join(dir, 'all.json');
  writeFileSync(all, JSON.stringify({ findings: findings(scan(demo)).map(({ id, ref }) => ({ id, ref })) }));
  const known = cli([demo, '--baseline', all, '--fail-on', 'p1', '--json']);
  assert.equal(known.status, 0, known.stderr);
  assert.match(known.stderr, /gate passed/);
  JSON.parse(known.stdout);

  // A baseline from before the TLS finding was added: only that one is new.
  const older = join(dir, 'older.json');
  const before = findings(scan(demo)).filter((f) => f.file !== 'src/tls.js');
  writeFileSync(older, JSON.stringify({ findings: before.map(({ id, ref }) => ({ id, ref })) }));
  const one = cli([demo, '--baseline', older, '--fail-on', 'p1']);
  assert.equal(one.status, 1);
  assert.match(one.stderr, /1 new finding \(not in the baseline\)/);
  assert.match(one.stderr, /src\/tls\.js/);
  assert.doesNotMatch(one.stderr, /envelope/);

  assert.deepEqual(gate(findings(scan(demo)), 'p2', { baseline: before }).map((f) => f.file), ['src/tls.js']);
});

test('RSA kept only to read old records, beside ML-KEM, is a P3 legacy read path', () => {
  const dir = repoWith({
    'envelope.js': `import { generateKeyPairSync, privateDecrypt, encapsulate } from 'node:crypto';
export const newKeys = () => generateKeyPairSync('ml-kem-768');
export const legacyKeys = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
export const openOld = (k, b) => privateDecrypt(k, b);
`,
  });
  const [f] = findings(scan(dir));
  assert.equal(f.status, 'legacy-read');
  assert.equal(f.priority, 'P3');
  assert.match(f.why, /re-wrapped/);
});

test('RSA that still encrypts new data stays vulnerable, even beside ML-KEM', () => {
  const dir = repoWith({
    'envelope.js': `import { generateKeyPairSync, publicEncrypt } from 'node:crypto';
export const newKeys = () => generateKeyPairSync('ml-kem-768');
export const seal = (k, b) => publicEncrypt(k, b);
`,
  });
  const [f] = findings(scan(dir));
  assert.equal(f.status, 'vulnerable');
  assert.equal(f.priority, 'P1');
});

test('ECDSA signed beside ML-DSA is dual-signed, ECDSA alone is not', () => {
  const both = repoWith({
    'webhooks.js': `import { generateKeyPairSync, sign } from 'node:crypto';
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pq = generateKeyPairSync('ml-dsa-65');
export const sigs = (b) => [sign('sha256', b, ec.privateKey), sign(null, b, pq.privateKey)];
`,
  });
  assert.deepEqual(findings(scan(both)).map((f) => [f.status, f.priority]), [['dual-signed', 'P3']]);
  const alone = findings(scan(demo)).find((f) => f.file === 'src/webhooks.js');
  assert.equal(alone.status, 'vulnerable');
});

test('skips work/ at the top of a scan, and files marked ignore-file, and says so', () => {
  const dir = repoWith({ 'ok.js': `// cbom-scan: ignore-file\nimport { createHash } from 'node:crypto';\ncreateHash('sha1');\n` });
  mkdirSync(join(dir, 'work'));
  writeFileSync(join(dir, 'work', 'copy.js'), `import { createHash } from 'node:crypto';\ncreateHash('md5');\n`);
  const ignored = [];
  assert.deepEqual(scan(dir, { ignored }), []);
  assert.deepEqual(ignored, ['src/ok.js']);
  const out = spawnSync(process.execPath, [scanner, dir], { encoding: 'utf8' });
  assert.match(out.stdout, /Skipped 1 file marked ignore-file: src\/ok\.js/);
});
