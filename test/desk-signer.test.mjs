// The desk-signer: the reviewer's and shipper's keys held by one process,
// which signs only after checking the order itself in Mattermost (faked here
// with posts shaped like live run 3's). The end-to-end test pushes what it
// signs through the origin's real git gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureKeys, parseSigned, verifySigned } from '../tools/desk-signature.mjs';
import { createSigner, Refusal, takeKeys } from '../tools/desk-signer.mjs';
import { approve, ship } from '../tools/desk-sign.mjs';

const gate = fileURLToPath(new URL('../scripts/pre-receive.mjs', import.meta.url)).split('\\').join('/');
const signerModule = new URL('../tools/desk-signer.mjs', import.meta.url).href;

const FIX = 'ac797966c8bafcc30a4fad5456db01699ff90ea5';
const BASE = '695ea59aa0000000000000000000000000000000'.slice(0, 40);

// Mattermost as the signer sees it: rooms, people and posts like run 3's.
const CHANNELS = { c3: { name: 'desk4-f3-tls' }, c5: { name: 'desk4-f5-webhooks' } };
const USERS = { u_lead: { username: 'user' }, u_arjun: { username: 'arjun' }, u_rev: { username: 'desk4-reviewer' }, u_mig: { username: 'desk4-migrator' } };
const POSTS = {
  leadShipF3: { channel_id: 'c3', user_id: 'u_lead', create_at: 1794034368745, message: '@desk4-shipper ship F3\n' },
  arjunShipF3: { channel_id: 'c3', user_id: 'u_arjun', create_at: 1794034037601, message: '@desk4-shipper ship F3\n' },
  leadShipF3inF5: { channel_id: 'c5', user_id: 'u_lead', create_at: 1794034368745, message: '@desk4-shipper ship F3' },
  leadShipF5inF3: { channel_id: 'c3', user_id: 'u_lead', create_at: 1794034368745, message: '@desk4-shipper ship F5' },
  leadChatF3: { channel_id: 'c3', user_id: 'u_lead', create_at: 1794034368745, message: 'looks good, thanks' },
  leadAcceptF3: { channel_id: 'c3', user_id: 'u_lead', create_at: 1794036052000, message: '@desk4-shipper accept risk F3: production TLS is the acquirer\'s' },
  revApproveF3: { channel_id: 'c3', user_id: 'u_rev', create_at: 1794034027308, message: `APPROVED pqc/f3-tls @ ${FIX.slice(0, 7)}\n- F3 is resolved` },
  migApproveF3: { channel_id: 'c3', user_id: 'u_mig', create_at: 1794034027308, message: `APPROVED pqc/f3-tls @ ${FIX.slice(0, 7)}` },
  revChangesF3: { channel_id: 'c3', user_id: 'u_rev', create_at: 1794034027308, message: 'CHANGES REQUESTED pqc/f3-tls' },
};
const fakeMm = (posts = POSTS) => ({
  post: async (id) => posts[id] ?? null,
  channel: async (id) => CHANNELS[id] ?? null,
  user: async (id) => USERS[id] ?? null,
});

function keyDir() {
  const root = mkdtempSync(join(tmpdir(), 'desk-signer-'));
  const keys = join(root, 'keys');
  const origin = join(root, 'origin');
  ensureKeys(keys, origin);
  const pub = (role) => readFileSync(join(origin, 'desk-keys', `${role}.pub.pem`), 'utf8');
  return { root, keys, origin, pub };
}

function signer(d) {
  return createSigner({ keys: takeKeys(d.keys), mm: fakeMm(), team: 'desk4', lead: 'user' });
}

async function refused(promise, pattern) {
  await assert.rejects(promise, (e) => e instanceof Refusal && pattern.test(e.message));
}

test("a ship the security lead ordered in the finding's room is signed with the shipper's key, with the order taken from Mattermost", async () => {
  const d = keyDir();
  const block = await signer(d).ship({ finding: 'f3', base: BASE, fix: FIX, room: 'room-3', orderPost: 'leadShipF3' });
  const parsed = parseSigned(block);
  assert.equal(verifySigned(parsed, d.pub('shipper')), true);
  assert.equal(verifySigned(parsed, d.pub('reviewer')), false);
  assert.equal(parsed.fields.finding, 'F3');
  assert.equal(parsed.fields['ordered-by'], 'user');
  assert.equal(parsed.fields['order-text'], '@desk4-shipper ship F3');
  assert.equal(parsed.fields['order-at'], new Date(1794034368745).toISOString());
});

test('Arjun\'s "ship F3" is refused: only the security lead\'s order counts', async () => {
  await refused(signer(keyDir()).ship({ finding: 'F3', base: BASE, fix: FIX, orderPost: 'arjunShipF3' }), /from arjun, not the security lead/);
});

test("an order posted in another finding's room is refused", async () => {
  await refused(signer(keyDir()).ship({ finding: 'F3', base: BASE, fix: FIX, orderPost: 'leadShipF3inF5' }), /desk4-f5-webhooks, not F3's room/);
});

test('an order for a different finding is refused', async () => {
  await refused(signer(keyDir()).ship({ finding: 'F3', base: BASE, fix: FIX, orderPost: 'leadShipF5inF3' }), /for F5, not F3/);
});

test("a post that isn't an order, or that doesn't exist, is refused", async () => {
  const s = signer(keyDir());
  await refused(s.ship({ finding: 'F3', base: BASE, fix: FIX, orderPost: 'leadChatF3' }), /doesn't order a ship/);
  await refused(s.ship({ finding: 'F3', base: BASE, fix: FIX, orderPost: 'nope' }), /no Mattermost post nope/);
  await refused(s.ship({ finding: 'F3', base: BASE, fix: FIX }), /no Mattermost post named/);
});

test("the security lead's accept-risk order is signed; a ship order can't be used for it", async () => {
  const d = keyDir();
  const s = signer(d);
  const block = await s.accept({ finding: 'F3', parent: BASE, orderPost: 'leadAcceptF3' });
  assert.equal(verifySigned(parseSigned(block), d.pub('shipper')), true);
  await refused(s.accept({ finding: 'F3', parent: BASE, orderPost: 'leadShipF3' }), /doesn't order a risk acceptance/);
});

test("an approval is signed only against the reviewer's own APPROVED verdict for that exact commit", async () => {
  const d = keyDir();
  const s = signer(d);
  const block = await s.approve({ commit: FIX, branch: 'pqc/f3-tls', room: 'room-3', approvalPost: 'revApproveF3' });
  assert.equal(verifySigned(parseSigned(block), d.pub('reviewer')), true);
  await refused(s.approve({ commit: FIX, branch: 'pqc/f3-tls', approvalPost: 'migApproveF3' }), /from desk4-migrator, not the reviewer/);
  await refused(s.approve({ commit: FIX, branch: 'pqc/f3-tls', approvalPost: 'revChangesF3' }), /no "APPROVED <branch> @ <sha>" verdict/);
  await refused(s.approve({ commit: BASE, branch: 'pqc/f3-tls', approvalPost: 'revApproveF3' }), /approves ac79796, not 695ea59aa000/);
  await refused(s.approve({ commit: FIX, branch: 'pqc/f5-webhooks', approvalPost: 'revApproveF3' }), /not F5's room/);
});

test('with --own-keys the key files are overwritten and deleted: the keys are only in the signer', () => {
  const d = keyDir();
  const keys = takeKeys(d.keys, { own: true });
  assert.ok(keys.reviewer.includes('PRIVATE KEY') && keys.shipper.includes('PRIVATE KEY'));
  assert.equal(existsSync(join(d.keys, 'reviewer.pem')), false);
  assert.equal(existsSync(join(d.keys, 'shipper.pem')), false);
  assert.throws(() => takeKeys(d.keys), /no reviewer key/);
});

// End to end: the signer runs as its own process holding the only copy of the
// keys; desk-sign asks it over HTTP; the origin's gate accepts the result.
function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}\n${r.stdout}${r.stderr}`);
  return r.stdout.trim();
}

test('end to end: with the key files gone, desk-sign gets its approval and ship from the signer, and the git gate accepts both', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'desk-signer-e2e-'));
  const seed = join(root, 'seed');
  git(root, 'init', '-q', '-b', 'main', seed);
  writeFileSync(join(seed, 'tls.js'), 'export const curve = "P-256";\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-q', '-m', 'before migration');
  const origin = join(root, 'origin.git');
  git(root, 'clone', '-q', '--bare', seed, origin);
  writeFileSync(join(origin, 'hooks', 'pre-receive'), `#!/bin/sh\nexec node "${gate}"\n`);
  chmodSync(join(origin, 'hooks', 'pre-receive'), 0o755);
  const keys = join(root, 'keys');
  ensureKeys(keys, origin);
  const work = join(root, 'work');
  git(root, 'clone', '-q', origin, work);
  git(work, 'config', 'user.name', 'desk');
  git(work, 'config', 'user.email', 'desk@t');
  git(work, 'checkout', '-q', '-b', 'pqc/f3-tls');
  writeFileSync(join(work, 'tls.js'), 'export const group = "X25519MLKEM768";\n');
  git(work, 'commit', '-q', '-am', 'F3: hybrid TLS');
  git(work, 'push', '-q', 'origin', 'pqc/f3-tls');
  const fix = git(work, 'rev-parse', 'HEAD');
  git(work, 'checkout', '-q', 'main');

  const posts = { ...POSTS, revApproveF3: { ...POSTS.revApproveF3, message: `APPROVED pqc/f3-tls @ ${fix.slice(0, 7)}` } };
  const script = `
    import { createSigner, serve, takeKeys } from ${JSON.stringify(signerModule)};
    const d = JSON.parse(process.env.FAKE);
    const mm = { post: async (id) => d.posts[id] ?? null, channel: async (id) => d.channels[id] ?? null, user: async (id) => d.users[id] ?? null };
    const keys = takeKeys(process.env.KEYS, { own: true });
    const server = await serve(createSigner({ keys, mm, team: 'desk4', lead: 'user', origin: process.env.ORIGIN }), { port: 0 });
    console.log('PORT ' + server.address().port);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, KEYS: keys, ORIGIN: origin, FAKE: JSON.stringify({ posts, channels: CHANNELS, users: USERS }) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (b) => {
      out += b;
      const m = /PORT (\d+)/.exec(out);
      if (m) resolve(Number(m[1]));
    });
    child.stderr.on('data', (b) => reject(new Error(String(b))));
    child.on('exit', (c) => reject(new Error(`signer exited ${c}`)));
  });
  const url = `http://127.0.0.1:${port}`;
  assert.equal(existsSync(join(keys, 'shipper.pem')), false, 'the key file is gone once the signer owns it');

  // No key file to read: a ship without the lead's order can't be signed at all.
  assert.throws(() => ship('F3', 'origin/pqc/f3-tls', { repo: work, signer: url, m: 'early', 'order-post': 'arjunShipF3' }), /signer refused: .*from arjun/);
  assert.throws(() => ship('F3', 'origin/pqc/f3-tls', { repo: work, signer: url, m: 'early', 'order-post': 'leadShipF3' }), /no approval in the origin/);
  git(work, 'reset', '-q', '--hard', 'origin/main');

  approve(fix, { repo: work, signer: url, branch: 'pqc/f3-tls', room: 'room-3', agent: 'desk4-reviewer', 'approval-post': 'revApproveF3' });
  const merged = ship('F3', 'origin/pqc/f3-tls', { repo: work, signer: url, room: 'room-3', m: 'hybrid TLS 1.3', 'order-post': 'leadShipF3' });
  git(work, 'push', '-q', 'origin', 'main');
  assert.equal(git(origin, 'rev-parse', 'main'), merged);
  const body = git(origin, 'log', '-1', '--format=%B', 'main');
  assert.match(body, /ordered-by user/);
  assert.match(body, /order-text @desk4-shipper ship F3/);
});
