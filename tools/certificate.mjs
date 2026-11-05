#!/usr/bin/env node
// A migration certificate for one shipped finding, signed with ML-DSA-65
// (FIPS 204), the post-quantum signature the desk itself recommends.
//
//   node tools/certificate.mjs issue <origin.git> <F-id> [--key desk-key.pem] [--out F5.cert.json]
//   node tools/certificate.mjs verify <F5.cert.json>
//
// It's read from git, not from chat: the crypto in the finding's file before
// and after the ship, the exact commit the reviewer approved and its
// refs/approved mark, the ship merge, and the tests run at that merge. Anyone
// with the certificate can check the signature, and anyone with the origin
// can check every sha in it.
import { execFileSync, spawnSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findings, scan } from './cbom-scan.mjs';
import { withMosca } from './mosca.mjs';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// JSON with sorted keys, so the signed bytes don't depend on key order.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

// The desk's signing key. Created once if the file doesn't exist.
export function deskKey(file) {
  if (file && existsSync(file)) return createPrivateKey(readFileSync(file, 'utf8'));
  const { privateKey } = generateKeyPairSync('ml-dsa-65');
  if (file) writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  return privateKey;
}

// The crypto the scanner sees in one file at the current checkout.
function cryptoIn(work, file) {
  const seen = new Map();
  for (const h of scan(work)) {
    if (h.file !== file) continue;
    const k = `${h.key}${h.curve ? `/${h.curve}` : ''}`;
    if (!seen.has(k)) seen.set(k, { key: h.key, curve: h.curve, lines: [] });
    seen.get(k).lines.push(h.line);
  }
  return [...seen.values()];
}

export function issue({ origin, id, key }) {
  const work = mkdtempSync(join(tmpdir(), 'crypto-desk-cert-'));
  try {
    git(['clone', '-q', origin, work]);
    git(['fetch', '-q', 'origin', '+refs/approved/*:refs/approved/*'], work);
    const log = git(['log', '--first-parent', '--format=%H%x09%P%x09%cI%x09%an%x09%s', 'main'], work).split('\n');
    const line = log.find((l) => l.split('\t')[4]?.startsWith(`Ship ${id}:`));
    if (!line) throw new Error(`${id} has no "Ship ${id}:" merge on main.`);
    const [merge, parents, at, author, subject] = line.split('\t');
    const [base, fix] = parents.split(' ');
    const approvals = git(['for-each-ref', '--format=%(refname)', 'refs/approved/'], work).split('\n');
    const approvalRef = `refs/approved/${fix}`;
    if (!approvals.includes(approvalRef)) throw new Error(`${fix.slice(0, 7)} has no approval mark; the gate should have refused this ship.`);

    // The finding as the first scan named it.
    const root = git(['rev-list', '--max-parents=0', 'main'], work);
    git(['checkout', '-q', root], work);
    const finding = withMosca(findings(scan(work)), work).find((f) => f.id === id);
    if (!finding) throw new Error(`${id} is not in the scan of the first commit.`);

    git(['checkout', '-q', base], work);
    const before = cryptoIn(work, finding.file);
    git(['checkout', '-q', merge], work);
    const after = cryptoIn(work, finding.file);
    const t = spawnSync(process.execPath, ['--test'], { cwd: work, encoding: 'utf8' });
    const summary = /# pass (\d+)[\s\S]*# fail (\d+)|ℹ pass (\d+)[\s\S]*ℹ fail (\d+)/.exec(`${t.stdout}${t.stderr}`);
    const pass = Number(summary?.[1] ?? summary?.[3] ?? 0);
    const failed = Number(summary?.[2] ?? summary?.[4] ?? 0);

    const body = {
      type: 'crypto-desk/migration-certificate',
      version: 1,
      finding: { id, file: finding.file, lines: finding.lines, algorithm: finding.algorithm, status: finding.status, priority: finding.priority, mosca: finding.mosca.label },
      before: { commit: base, crypto: before },
      after: { commit: merge, crypto: after, stillFlagged: after.some((a) => a.key === finding.key) },
      review: { approvedCommit: fix, approvalRef },
      ship: { merge, subject, author, at },
      tests: { command: 'node --test', at: merge, passed: t.status === 0, pass, fail: failed },
      issuedAt: new Date().toISOString(),
    };
    const publicKey = createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64');
    const value = sign(null, Buffer.from(canonical(body)), key).toString('base64');
    return { ...body, signature: { algorithm: 'ML-DSA-65', publicKey, value } };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// True if the signature covers exactly this certificate.
export function check(cert, { publicKey } = {}) {
  const { signature, ...body } = cert;
  if (signature?.algorithm !== 'ML-DSA-65') return false;
  const key = createPublicKey({ key: Buffer.from(publicKey ?? signature.publicKey, 'base64'), format: 'der', type: 'spki' });
  return verify(null, Buffer.from(canonical(body)), key, Buffer.from(signature.value, 'base64'));
}

function main(argv) {
  const [cmd, ...rest] = argv.slice(2);
  const flag = (n) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : null);
  const pos = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));
  if (cmd === 'issue' && pos.length === 2) {
    const cert = issue({ origin: pos[0], id: pos[1].toUpperCase(), key: deskKey(flag('--key')) });
    const out = flag('--out') ?? `${cert.finding.id}.cert.json`;
    writeFileSync(out, JSON.stringify(cert, null, 2) + '\n');
    console.log(`${cert.finding.id}: certificate written to ${out}, signed with ML-DSA-65.`);
  } else if (cmd === 'verify' && pos.length === 1) {
    const ok = check(JSON.parse(readFileSync(pos[0], 'utf8')));
    console.log(ok ? 'Signature valid (ML-DSA-65).' : 'Signature INVALID: the certificate was changed or not signed by this key.');
    process.exitCode = ok ? 0 : 1;
  } else {
    console.error('usage: certificate.mjs issue <origin.git> <F-id> [--key file] [--out file] | verify <file>');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);
