#!/usr/bin/env node
// cbom-scan: ignore-file (builds the planted demo and its fix on purpose)
// Judge the desk in one command, without Switch, Claude or Codex:
//
//   npm run judge
//
// It builds a throwaway git origin with the real gate (scripts/pre-receive.mjs),
// scans demo-payments, and then plays the agents' git moves for F5 and F3:
// what they push is scripted, and what git, the scanner and the tests do with
// it is real. Every step says what should happen and checks that it did.
//
// Not shown here: Switch refusing the engineer's "ship it". That needs Switch,
// so it's in the live run and the video.
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findings, scan } from '../tools/cbom-scan.mjs';
import { moscaLine, withMosca } from '../tools/mosca.mjs';
import { boardLine, counts, readDesk } from '../tools/board.mjs';
import { liveRuns, replay } from '../tools/replay.mjs';
import { createPublicKey, sign } from 'node:crypto';
import { audit, canonical, check, deskKey, issue, pubFileFor, publicKeyFrom } from '../tools/certificate.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const slash = (p) => p.split('\\').join('/');

// The migrator's F5 fix: ML-DSA-65 beside ECDSA, because merchants on older
// SDKs still verify ECDSA (the engineer's constraint in the room).
const F5_FIX = `// Signed webhooks.
// Payment events are pushed to merchants, dual-signed:
//   X-Signature         ECDSA P-256, for merchants whose SDKs only know ECDSA
//   X-Signature-ML-DSA  ML-DSA-65 (FIPS 204), post-quantum
// ECDSA stays until those merchants have moved (sunset tracked in F5's room).
import { generateKeyPairSync, sign, verify } from 'node:crypto';

export function generateWebhookKeys() {
  const ecdsa = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const mldsa = generateKeyPairSync('ml-dsa-65');
  return { ...ecdsa, mldsa };
}

export function signEvent(event, privateKey, mldsaPrivateKey) {
  const body = JSON.stringify(event);
  const headers = { 'X-Signature': sign('sha256', Buffer.from(body), privateKey).toString('base64') };
  if (mldsaPrivateKey) headers['X-Signature-ML-DSA'] = sign(null, Buffer.from(body), mldsaPrivateKey).toString('base64');
  return { body, headers };
}

// Merchants on older SDKs: ECDSA, unchanged.
export function verifyEvent(body, headers, publicKey) {
  const signature = Buffer.from(headers['X-Signature'] ?? '', 'base64');
  return verify('sha256', Buffer.from(body), publicKey, signature);
}

// Merchants who have upgraded: ML-DSA-65.
export function verifyEventPq(body, headers, mldsaPublicKey) {
  const signature = Buffer.from(headers['X-Signature-ML-DSA'] ?? '', 'base64');
  return signature.length > 0 && verify(null, Buffer.from(body), mldsaPublicKey, signature);
}
`;

const F5_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify } from 'node:crypto';
import { generateWebhookKeys, signEvent, verifyEventPq } from '../src/webhooks.js';

test('a dual-signed event verifies with ML-DSA-65', () => {
  const keys = generateWebhookKeys();
  const { body, headers } = signEvent({ type: 'payment.succeeded', id: 'pay_1' }, keys.privateKey, keys.mldsa.privateKey);
  assert.ok(verifyEventPq(body, headers, keys.mldsa.publicKey));
  assert.equal(verifyEventPq(body.replace('pay_1', 'pay_2'), headers, keys.mldsa.publicKey), false);
});

// The engineer's constraint: merchants on old SDKs only know ECDSA.
test('a merchant SDK that only knows ECDSA still accepts the new events', () => {
  const keys = generateWebhookKeys();
  const { body, headers } = signEvent({ type: 'payment.succeeded', id: 'pay_1' }, keys.privateKey, keys.mldsa.privateKey);
  const oldSdk = (b, h, k) => verify('sha256', Buffer.from(b), k, Buffer.from(h['X-Signature'], 'base64'));
  assert.ok(oldSdk(body, headers, keys.publicKey));
});
`;

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=desk', '-c', 'user.email=desk@crypto-desk.local', ...args], { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}`.trim() };
}
function must(cwd, ...args) {
  const r = git(cwd, ...args);
  if (!r.ok) throw new Error(`git ${args.join(' ')} failed:\n${r.out}`);
  return r.out;
}
const reason = (out) => (out.split('\n').find((l) => l.includes('  - '))?.replace(/^.*?- /, '') ?? out.split('\n').at(-1)).trim();

export function judge({ log = console.log, keep = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'crypto-desk-judge-'));
  const results = [];
  const step = (title, expect, ok, detail) => {
    results.push({ title, expect, ok });
    log(`${ok ? '  ✔' : '  ✘'} ${title}`);
    log(`      ${ok ? '' : 'EXPECTED: '}${expect}${detail ? `: ${detail}` : ''}`);
  };
  const t0 = Date.now();
  try {
    // A bare origin with the gate, seeded with the planted code, and one
    // checkout for the agents' moves.
    const seed = join(root, 'seed');
    cpSync(join(DESK, 'demo-payments'), seed, { recursive: true, filter: (p) => !p.includes('node_modules') });
    must(seed, 'init', '-q', '-b', 'main');
    must(seed, 'add', '.');
    must(seed, 'commit', '-q', '-m', 'demo-payments before migration');
    const origin = join(root, 'origin.git');
    must(root, 'clone', '-q', '--bare', seed, origin);
    writeFileSync(join(origin, 'hooks', 'pre-receive'), `#!/bin/sh\nexec node "${slash(join(DESK, 'scripts', 'pre-receive.mjs'))}"\n`);
    chmodSync(join(origin, 'hooks', 'pre-receive'), 0o755);
    const work = join(root, 'work');
    must(root, 'clone', '-q', origin, work);

    log('\n1. The scout scans main');
    const found = withMosca(findings(scan(work)), work);
    for (const f of found) log(`      ${f.id} ${f.priority} ${f.file.padEnd(16)} ${f.algorithm.padEnd(40)} ${moscaLine(f.mosca)}`);
    step('Six findings, ranked, each with a Mosca verdict', '6 findings, F1 and F2 already late', found.length === 6 && found[0].mosca.verdict === 'late' && found[1].mosca.verdict === 'late');

    log('\n2. F5: the migrator pushes a dual-signing fix to its branch');
    must(work, 'checkout', '-q', '-b', 'pqc/f5-webhooks');
    writeFileSync(join(work, 'src', 'webhooks.js'), F5_FIX);
    mkdirSync(join(work, 'test'), { recursive: true });
    writeFileSync(join(work, 'test', 'webhooks-pq.test.js'), F5_TEST);
    const tests = spawnSync(process.execPath, ['--test'], { cwd: work, encoding: 'utf8' });
    const pass = /ℹ pass (\d+)/.exec(tests.stdout)?.[1];
    step('The tests pass, including the old-SDK ECDSA check', 'all tests pass', tests.status === 0, `${pass} passed`);
    const pq = scan(work).filter((h) => h.file === 'src/webhooks.js').map((h) => h.key);
    step('The scanner sees ML-DSA-65 beside ECDSA', 'ml-dsa-65 present, ECDSA kept on purpose', pq.includes('ml-dsa-65') && pq.includes('ecdsa'));
    must(work, 'add', '-A');
    must(work, 'commit', '-q', '-m', 'F5: dual-sign webhooks with ML-DSA-65 beside ECDSA');
    must(work, 'push', '-q', 'origin', 'pqc/f5-webhooks');
    const fix = must(work, 'rev-parse', 'HEAD');

    log('\n3. Shortcuts the gate refuses');
    must(work, 'checkout', '-q', 'main');
    writeFileSync(join(work, 'src', 'webhooks.js'), F5_FIX);
    must(work, 'commit', '-q', '-am', 'quick fix straight to main');
    let r = git(work, 'push', 'origin', 'main');
    step('Pushing a fix straight to main', 'refused', !r.ok, reason(r.out));
    must(work, 'reset', '-q', '--hard', 'origin/main');

    must(work, 'merge', '-q', '--no-ff', 'pqc/f5-webhooks', '-m', 'Ship F5: dual-signed webhooks');
    r = git(work, 'push', 'origin', 'main');
    step('Shipping before the reviewer approved', 'refused', !r.ok, reason(r.out));
    must(work, 'reset', '-q', '--hard', 'origin/main');

    log('\n4. The reviewer approves the exact commit it checked');
    r = git(work, 'push', 'origin', `${fix}:refs/approved/${fix}`);
    step(`Approval mark refs/approved/${fix.slice(0, 7)}`, 'accepted', r.ok);

    must(work, 'checkout', '-q', 'pqc/f5-webhooks');
    writeFileSync(join(work, 'src', 'webhooks.js'), `${F5_FIX}\n// one more thing, after the review\n`);
    must(work, 'commit', '-q', '-am', 'F5: tweak after review');
    must(work, 'push', '-q', 'origin', 'pqc/f5-webhooks');
    must(work, 'checkout', '-q', 'main');
    must(work, 'merge', '-q', '--no-ff', 'pqc/f5-webhooks', '-m', 'Ship F5: dual-signed webhooks');
    r = git(work, 'push', 'origin', 'main');
    step('Shipping a branch that changed after the approval', 'refused', !r.ok, reason(r.out));
    must(work, 'reset', '-q', '--hard', 'origin/main');

    log('\n5. The security lead says "ship": the shipper merges the approved commit');
    must(work, 'merge', '-q', '--no-ff', fix, '-m', `Ship F5: dual-signed webhooks (approved by reviewer at ${fix.slice(0, 7)}, shipped by the security lead)`);
    r = git(work, 'push', 'origin', 'main');
    step('Shipping the approved commit', 'accepted', r.ok, r.ok ? `main is now ${must(work, 'rev-parse', '--short', 'HEAD')}` : reason(r.out));
    // A second, separately approved F5 change: approved, but F5 already shipped.
    must(work, 'checkout', '-q', '-b', 'pqc/f5-again');
    writeFileSync(join(work, 'src', 'webhooks.js'), `${F5_FIX}// a second F5 change\n`);
    must(work, 'commit', '-q', '-am', 'F5: second change');
    must(work, 'push', '-q', 'origin', 'pqc/f5-again');
    const again = must(work, 'rev-parse', 'HEAD');
    must(work, 'push', '-q', 'origin', `${again}:refs/approved/${again}`);
    must(work, 'checkout', '-q', 'main');
    must(work, 'merge', '-q', '--no-ff', 'pqc/f5-again', '-m', 'Ship F5: again');
    r = git(work, 'push', 'origin', 'main');
    step('Shipping F5 a second time, even with an approval', 'refused', !r.ok, reason(r.out));
    must(work, 'reset', '-q', '--hard', 'origin/main');

    log('\n6. F3 is outside the team: the security lead accepts the risk');
    writeFileSync(join(work, 'ACCEPTED-RISKS.md'), '# Accepted risks\n\n- F3: production TLS terminates at the acquirer\'s edge gateway; change request sent (owner: priya, review by: 2027-02-03)\n');
    writeFileSync(join(work, 'src', 'tls.js'), `${readFileSync(join(work, 'src', 'tls.js'), 'utf8')}// sneaked in with the risk\n`);
    must(work, 'add', '-A');
    must(work, 'commit', '-q', '-m', 'Accept risk F3: TLS on the acquirer gateway');
    r = git(work, 'push', 'origin', 'main');
    step('An accepted risk that also edits code', 'refused', !r.ok, reason(r.out));
    must(work, 'reset', '-q', '--hard', 'HEAD~1');
    must(work, 'checkout', '-q', 'origin/main', '--', 'src/tls.js');
    writeFileSync(join(work, 'ACCEPTED-RISKS.md'), '# Accepted risks\n\n- F3: production TLS terminates at the acquirer\'s edge gateway; change request sent (owner: priya, review by: 2027-02-03)\n');
    must(work, 'add', 'ACCEPTED-RISKS.md');
    must(work, 'commit', '-q', '-m', 'Accept risk F3: TLS on the acquirer gateway');
    r = git(work, 'push', 'origin', 'main');
    step('The accepted risk on its own', 'accepted', r.ok);

    log('\n7. The board, read from git');
    const desk = readDesk(origin);
    const c = counts(desk.rows);
    const line = boardLine(desk.rows);
    step(line, 'Shipped 1/6 · Accepted risk 1', c.shipped === 1 && c['accepted risk'] === 1 && desk.rows.length === 6);

    log('\n8. A signed migration certificate for F5');
    const keyFile = join(root, 'desk-key.pem');
    const key = deskKey(keyFile);
    const deskPub = publicKeyFrom(pubFileFor(keyFile));
    const cert = issue({ origin, id: 'F5', key });
    const certFile = join(root, 'F5.cert.json');
    writeFileSync(certFile, JSON.stringify(cert, null, 2) + '\n');
    const claims = audit(cert, origin);
    step(
      "Certificate signed by the desk's ML-DSA-65 key, every claim matching git",
      'valid',
      check(cert, { publicKey: deskPub }) && claims.every((x) => x.ok),
      `approved ${cert.review.approvedCommit.slice(0, 7)}, shipped ${cert.ship.merge.slice(0, 7)}, tests ${cert.tests.pass} passed, ${claims.length} claims checked`,
    );
    const forged = { ...cert, review: { ...cert.review, approvedCommit: '0'.repeat(40) } };
    step('The same certificate with the approval sha changed', 'invalid', !check(forged, { publicKey: deskPub }));
    const other = deskKey(null);
    const { signature: _, ...forgedBody } = forged;
    const resigned = {
      ...forgedBody,
      signature: {
        algorithm: 'ML-DSA-65',
        publicKey: createPublicKey(other).export({ type: 'spki', format: 'der' }).toString('base64'),
        value: sign(null, Buffer.from(canonical(forgedBody)), other).toString('base64'),
      },
    };
    step('That forgery re-signed with another key', "refused: not the desk's key, and git disagrees", !check(resigned, { publicKey: deskPub }) && audit(resigned, origin).some((x) => !x.ok));

    const livePub = publicKeyFrom(join(DESK, 'docs', 'live-run', 'desk-key.pub.pem'));
    for (const [n, run] of liveRuns().entries()) {
      const bundle = join(run.dir, 'origin.bundle');
      log(`\n${9 + n}. ${run.name} in Switch (${run.team}, ${run.dates}), checked from the git it left (${run.folder}/origin.bundle)`);
      for (const id of run.certificates) {
        const live = JSON.parse(readFileSync(join(run.dir, `${id}.cert.json`), 'utf8'));
        const liveClaims = audit(live, bundle);
        step(
          `${id}: the agents' certificate matches the agents' git`,
          "signed by the desk's key, every claim true",
          check(live, { publicKey: livePub }) && liveClaims.every((x) => x.ok),
          `approved ${live.review.approvedCommit.slice(0, 7)} by the reviewer, shipped ${live.ship.merge.slice(0, 7)} by the shipper, ${live.tests.pass} tests`,
        );
      }
      const { steps: pushes, sameMain } = replay(bundle);
      step(
        "The agents' pushes, replayed into a fresh origin, all pass the gate",
        'every push accepted, the shortcut refused, same main',
        pushes.every((x) => x.ok) && sameMain,
        `${pushes.filter((x) => x.expect === 'pass').length} pushes`,
      );
      const b = counts(readDesk(bundle).rows);
      const want = run.board;
      step(
        `Board from its origin: ${boardLine(readDesk(bundle).rows)}`,
        `Shipped ${want.shipped}/6 · Accepted risk ${want['accepted risk']} · risks on record ${want['risks on record']}`,
        Object.keys(want).every((k) => b[k] === want[k]),
      );
    }

    const failed = results.filter((x) => !x.ok);
    log(`\n${failed.length ? `✘ ${failed.length} of ${results.length} checks failed.` : `All ${results.length} checks held`} (${((Date.now() - t0) / 1000).toFixed(1)} s).`);
    if (keep) log(`The origin, checkout and certificate are in ${root}`);
    return { results, root, certFile };
  } finally {
    if (!keep) rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Crypto Migration Desk: judge run (real git gate, real scanner, real tests; the agents\' moves are scripted)');
  const { results } = judge();
  process.exitCode = results.every((r) => r.ok) ? 0 : 1;
}
