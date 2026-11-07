#!/usr/bin/env node
// A migration certificate for one shipped finding, signed with ML-DSA-65
// (FIPS 204), the post-quantum signature the desk itself recommends.
//
//   node tools/certificate.mjs issue <origin.git> <F-id> [--key desk-key.pem] [--out F5.cert.json]
//   node tools/certificate.mjs verify <F5.cert.json> [--key desk-key.pub.pem] [--origin <repo or .bundle>] [--tests]
//
// It's read from git, not from chat: the crypto in the finding's file before
// and after the ship, the exact commit the reviewer approved and its
// refs/approved mark, the ship merge, and the tests run at that merge.
//
// verify checks three things:
//   1. the signature covers every byte of the certificate
//   2. it was made by the desk's key (--key, or desk-key.pub.pem beside the
//      certificate), not just by whatever key the certificate carries
//   3. with --origin (or origin.bundle beside the certificate), every claim in
//      it against git: the merge is on main, it merges exactly the approved
//      commit onto the commit before it, the approval mark points at that
//      commit, and the scanner sees the same crypto before and after.
//      --tests also reruns the tests at the merge.
import { execFileSync, spawnSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findings, scan } from './cbom-scan.mjs';
import { withMosca } from './mosca.mjs';
import { parseSigned } from './desk-signature.mjs';

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

export const pubFileFor = (file) => file.replace(/\.pem$/, '') + '.pub.pem';

// The desk's signing key. Created once if the file doesn't exist, with its
// public half written beside it (<file>.pub.pem) for anyone who verifies.
export function deskKey(file) {
  if (file && existsSync(file)) return createPrivateKey(readFileSync(file, 'utf8'));
  const { privateKey, publicKey } = generateKeyPairSync('ml-dsa-65');
  if (file) {
    writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    writeFileSync(pubFileFor(file), publicKey.export({ type: 'spki', format: 'pem' }));
  }
  return privateKey;
}

// A public key as base64 DER, from a public or a private PEM file.
export function publicKeyFrom(file) {
  const pem = readFileSync(file, 'utf8');
  const key = pem.includes('PRIVATE KEY') ? createPublicKey(createPrivateKey(pem)) : createPublicKey(pem);
  return key.export({ type: 'spki', format: 'der' }).toString('base64');
}

// The crypto the scanner sees in one file at the current checkout.
export function cryptoIn(work, file) {
  const seen = new Map();
  for (const h of scan(work)) {
    if (h.file !== file) continue;
    const k = `${h.key}${h.curve ? `/${h.curve}` : ''}`;
    if (!seen.has(k)) seen.set(k, { key: h.key, curve: h.curve, lines: [] });
    seen.get(k).lines.push(h.line);
  }
  return [...seen.values()];
}

function runTests(work) {
  const t = spawnSync(process.execPath, ['--test'], { cwd: work, encoding: 'utf8' });
  const summary = /# pass (\d+)[\s\S]*# fail (\d+)|ℹ pass (\d+)[\s\S]*ℹ fail (\d+)/.exec(`${t.stdout}${t.stderr}`);
  return { passed: t.status === 0, pass: Number(summary?.[1] ?? summary?.[3] ?? 0), fail: Number(summary?.[2] ?? summary?.[4] ?? 0) };
}

// The Switch facts a signed approval or ship recorded (tools/desk-signature.mjs):
// the room, role and agent of an approval; the room, who ordered a ship, when
// and in what words. Empty for unsigned runs.
function signedFacts(work, rev, kind) {
  let message;
  try {
    message = git(['cat-file', '-t', rev], work) === 'tag' ? git(['cat-file', 'tag', rev], work) : git(['log', '-1', '--format=%B', rev], work);
  } catch {
    return {};
  }
  const parsed = parseSigned(message);
  if (!parsed || parsed.kind !== kind || !parsed.signature) return {};
  const { commit, finding, base, fix, parent, ...facts } = parsed.fields;
  return Object.keys(facts).length ? { switch: facts } : {};
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
    const { passed, pass, fail } = runTests(work);

    const body = {
      type: 'crypto-desk/migration-certificate',
      version: 1,
      finding: { id, file: finding.file, lines: finding.lines, algorithm: finding.algorithm, status: finding.status, priority: finding.priority, mosca: finding.mosca.label },
      before: { commit: base, crypto: before },
      after: { commit: merge, crypto: after, stillFlagged: after.some((a) => a.key === finding.key) },
      review: { approvedCommit: fix, approvalRef, ...signedFacts(work, approvalRef, 'approve') },
      ship: { merge, subject, author, at, ...signedFacts(work, merge, 'ship') },
      tests: { command: 'node --test', at: merge, passed, pass, fail },
      issuedAt: new Date().toISOString(),
    };
    const publicKey = createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64');
    const value = sign(null, Buffer.from(canonical(body)), key).toString('base64');
    return { ...body, signature: { algorithm: 'ML-DSA-65', publicKey, value } };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// True if the signature covers exactly this certificate. With `publicKey`
// (base64 DER), it must also have been made by that key.
export function check(cert, { publicKey } = {}) {
  const { signature, ...body } = cert;
  if (signature?.algorithm !== 'ML-DSA-65') return false;
  if (publicKey && signature.publicKey !== publicKey) return false;
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey ?? signature.publicKey, 'base64'), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(canonical(body)), key, Buffer.from(signature.value, 'base64'));
  } catch {
    return false;
  }
}

const summarize = (crypto) => crypto.map((c) => `${c.key}${c.curve ? `/${c.curve}` : ''}`).join(', ') || 'none';

// Every claim in the certificate, checked against the origin (a bare repo, a
// clone or a git bundle). Returns [{ name, ok, detail }].
export function audit(cert, origin, { tests = false } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'crypto-desk-audit-'));
  const out = [];
  const add = (name, ok, detail = '') => out.push({ name, ok: Boolean(ok), detail });
  const tryGit = (args) => {
    try {
      return git(args, work);
    } catch {
      return null;
    }
  };
  try {
    git(['clone', '-q', '--no-checkout', origin, work]);
    tryGit(['fetch', '-q', 'origin', '+refs/approved/*:refs/approved/*']);
    const { id } = cert.finding;
    const { merge } = cert.ship;
    const fix = cert.review.approvedCommit;
    const base = cert.before.commit;

    const mainLine = (tryGit(['rev-list', '--first-parent', 'origin/main']) ?? '').split('\n');
    add('The ship merge is on main', mainLine.includes(merge), merge.slice(0, 7));

    const subject = tryGit(['log', '-1', '--format=%s', merge]);
    add(`It is the "Ship ${id}:" merge`, subject === cert.ship.subject && subject?.startsWith(`Ship ${id}:`), subject ?? 'not found');

    const parents = (tryGit(['log', '-1', '--format=%P', merge]) ?? '').split(' ').filter(Boolean);
    add(
      'It merges exactly the approved commit onto the commit before it',
      parents.length === 2 && parents[0] === base && parents[1] === fix,
      `${parents.map((p) => p.slice(0, 7)).join(' + ') || 'no parents'} (certificate: ${base.slice(0, 7)} + ${fix.slice(0, 7)})`,
    );

    const mark = tryGit(['rev-parse', '--verify', '--quiet', `${cert.review.approvalRef}^{commit}`]);
    add('The approval mark points at the approved commit', cert.review.approvalRef === `refs/approved/${fix}` && mark === fix, cert.review.approvalRef);

    add('The certificate\'s "after" is the merge', cert.after.commit === merge);

    // What the signatures recorded from Switch must be what the certificate says.
    for (const [part, rev, kind] of [['review', cert.review.approvalRef, 'approve'], ['ship', merge, 'ship']]) {
      if (!cert[part].switch) continue;
      const got = signedFacts(work, rev, kind).switch;
      const who = kind === 'approve' ? "reviewer's" : "shipper's";
      const said = Object.entries(cert[part].switch).map(([k, v]) => `${k}=${v}`).join(' ');
      add(`The ${who} signed Switch facts match git`, canonical(got) === canonical(cert[part].switch), said);
    }

    if (parents.length === 2) {
      const same = (a, b) => canonical(a) === canonical(b);
      git(['checkout', '-q', base], work);
      const before = cryptoIn(work, cert.finding.file);
      add(`The scanner sees the same crypto in ${cert.finding.file} before`, same(before, cert.before.crypto), summarize(before));
      git(['checkout', '-q', merge], work);
      const after = cryptoIn(work, cert.finding.file);
      add(`The scanner sees the same crypto in ${cert.finding.file} after`, same(after, cert.after.crypto), summarize(after));
      if (tests) {
        const t = runTests(work);
        add(
          'The tests at the merge pass, as many as the certificate says',
          t.passed === cert.tests.passed && t.pass === cert.tests.pass,
          `${t.pass} passed, ${t.fail} failed (certificate: ${cert.tests.pass} passed)`,
        );
      }
    }
    return out;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Verify one certificate file, printing each check. Returns true if all held.
export function verifyFile(file, { key, origin, tests = false, log = console.log } = {}) {
  const cert = JSON.parse(readFileSync(file, 'utf8'));
  const besideIt = (name) => {
    const p = join(dirname(resolve(file)), name);
    return existsSync(p) ? p : null;
  };
  const keyFile = key ?? besideIt('desk-key.pub.pem');
  const originRepo = origin ?? besideIt('origin.bundle');
  let ok = true;
  const line = (good, name, detail) => {
    ok &&= good;
    log(`${good ? '✔' : '✘'} ${name}${detail ? `\n    ${detail}` : ''}`);
  };

  line(check(cert), 'The ML-DSA-65 signature covers every byte of the certificate');
  if (keyFile) line(check(cert, { publicKey: publicKeyFrom(keyFile) }), "It was signed by the desk's key", keyFile);
  else log("- Signer not checked: no --key, and no desk-key.pub.pem beside the certificate.\n    The signature proves the certificate wasn't changed, not who signed it.");
  if (originRepo) for (const c of audit(cert, originRepo, { tests })) line(c.ok, c.name, c.detail);
  else log('- Not checked against git: no --origin, and no origin.bundle beside the certificate.');
  const rv = cert.review.switch;
  const sh = cert.ship.switch;
  if (rv) log(`- Approved in Switch room ${rv.room ?? '?'} by ${rv.agent ?? 'the reviewer'}, holding the ${rv.role ?? 'reviewer'} role`);
  if (sh) log(`- Ship ordered in Switch room ${sh.room ?? '?'} by ${sh['ordered-by'] ?? '?'} at ${sh['order-at'] ?? '?'}: "${sh['order-text'] ?? ''}"`);
  log(ok ? `\n${cert.finding.id}: certificate valid.` : `\n${cert.finding.id}: certificate INVALID.`);
  return ok;
}

function main(argv) {
  const [cmd, ...rest] = argv.slice(2);
  const valued = new Set(['--key', '--out', '--origin']);
  const flag = (n) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : undefined);
  const pos = rest.filter((a, i) => !a.startsWith('--') && !valued.has(rest[i - 1]));
  if (cmd === 'issue' && pos.length === 2) {
    const cert = issue({ origin: pos[0], id: pos[1].toUpperCase(), key: deskKey(flag('--key')) });
    const out = flag('--out') ?? `${cert.finding.id}.cert.json`;
    writeFileSync(out, JSON.stringify(cert, null, 2) + '\n');
    console.log(`${cert.finding.id}: certificate written to ${out}, signed with ML-DSA-65.`);
  } else if (cmd === 'verify' && pos.length === 1) {
    const ok = verifyFile(pos[0], { key: flag('--key'), origin: flag('--origin'), tests: rest.includes('--tests') });
    process.exitCode = ok ? 0 : 1;
  } else {
    console.error('usage: certificate.mjs issue <origin.git> <F-id> [--key file] [--out file]');
    console.error('       certificate.mjs verify <file> [--key pub.pem] [--origin repo|bundle] [--tests]');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);
