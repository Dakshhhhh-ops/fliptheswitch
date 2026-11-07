#!/usr/bin/env node
// desk-signer: the reviewer's and the shipper's keys, held by one process
// instead of sitting in files every agent can read.
//
// With key files (live runs 1-3), any agent on the machine could read
// .origin/keys/shipper.pem and sign a ship nobody ordered: the signature then
// proves the key, not the person. The signer closes that: it loads both keys,
// and with --own-keys overwrites and deletes the files, so after start-up the
// keys exist only in this process. Agents ask it to sign over HTTP on
// 127.0.0.1, naming the Mattermost post that justifies the request. Before it
// signs, the signer reads that post itself from Mattermost and checks:
//
//   ship / accept   the post is in the finding's own room (<team>-f<n>-...),
//                   was written by the security lead, and says
//                   "ship F<n>" / "accept risk F<n>" for the same finding.
//                   The ordered-by, order-at and order-text it signs come
//                   from that post, not from the request. With --origin, the
//                   fix must also have its approval ref there.
//   approve         the post is in that finding's room, was written by the
//                   reviewer agent's bot account, and says
//                   "APPROVED <branch> @ <sha>" for the commit being signed.
//
// Anything else gets HTTP 403 and a reason. The signed blocks are the same
// ones tools/desk-sign.mjs makes with a key file, so the origin's gate and
// npm run judge check them unchanged.
//
//   node tools/desk-signer.mjs --keys .origin/keys --own-keys --team desk5 \
//     --mm-url http://127.0.0.1:59881 --lead user [--reviewer <team>-reviewer] \
//     [--origin .origin/demo-payments.git] [--port 59890]
//   Token: MM_TOKEN (a read-only personal access token), or --mm-token.
//
// What it doesn't do: on one machine, a process running as the same OS user
// can still read this process's memory. Production keeps each key in a KMS
// or HSM that runs this same check. See docs/ENFORCEMENT.md.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { signedBlock } from './desk-signature.mjs';

export class Refusal extends Error {}
const refuse = (why) => {
  throw new Refusal(why);
};

// Mattermost, through its REST API. Only reads.
export function mattermost(baseUrl, token) {
  const base = baseUrl.replace(/\/+$/, '');
  const get = async (path) => {
    const r = await fetch(`${base}/api/v4${path}`, { headers: { authorization: `Bearer ${token}` } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Mattermost ${path}: HTTP ${r.status}`);
    return r.json();
  };
  return {
    post: (id) => get(`/posts/${encodeURIComponent(id)}`),
    channel: (id) => get(`/channels/${encodeURIComponent(id)}`),
    user: (id) => get(`/users/${encodeURIComponent(id)}`),
  };
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

// The finding a room or branch belongs to: desk4-f5-webhooks -> F5, pqc/f5-webhooks -> F5.
const findingOfRoom = (name, team) => {
  const m = new RegExp(`^${team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-f(\\d+)-`, 'i').exec(name ?? '');
  return m ? `F${m[1]}` : null;
};
const findingOfBranch = (branch) => {
  const m = /^(?:origin\/)?pqc\/f(\d+)-/i.exec(branch ?? '');
  return m ? `F${m[1]}` : null;
};

// The post named by the request, with its room and author, or a refusal.
async function lookup(mm, postId, team) {
  if (!postId) refuse('no Mattermost post named: say which message this is for');
  const post = await mm.post(postId);
  if (!post) refuse(`no Mattermost post ${postId}`);
  const channel = await mm.channel(post.channel_id);
  const author = await mm.user(post.user_id);
  const room = channel?.name ?? '';
  return { post, room, roomFinding: findingOfRoom(room, team), author: author?.username ?? '' };
}

// The signer itself: keys in memory, Mattermost behind `mm`.
export function createSigner({ keys, mm, team, lead, reviewer, origin }) {
  if (!keys?.reviewer || !keys?.shipper) throw new Error('the signer needs the reviewer and shipper keys');
  if (!team || !lead) throw new Error('the signer needs --team and --lead');
  const reviewerBot = reviewer ?? `${team}-reviewer`;

  const approvedInOrigin = (fix) => {
    if (!origin) return true;
    const r = spawnSync('git', ['--git-dir', origin, 'rev-parse', '--verify', '--quiet', `refs/approved/${fix}`], { encoding: 'utf8' });
    return r.status === 0;
  };

  async function order(kind, { finding, orderPost }) {
    const id = String(finding ?? '').toUpperCase();
    if (!/^F\d+$/.test(id)) refuse(`${kind} needs a finding like F3`);
    const { post, room, roomFinding, author } = await lookup(mm, orderPost, team);
    if (roomFinding !== id) refuse(`the order was posted in ${room || 'an unknown room'}, not ${id}'s room`);
    if (author !== lead) refuse(`the order is from ${author || 'an unknown account'}, not the security lead (${lead})`);
    const text = oneLine(post.message);
    const said = kind === 'ship' ? /\bship\s+(F\d+)\b/i.exec(text) : /\baccept\s+risk\s+(F\d+)\b/i.exec(text);
    if (!said) refuse(`the post doesn't order a ${kind === 'ship' ? 'ship' : 'risk acceptance'}: "${text.slice(0, 80)}"`);
    if (said[1].toUpperCase() !== id) refuse(`the order is for ${said[1].toUpperCase()}, not ${id}`);
    return { 'ordered-by': author, 'order-at': new Date(post.create_at).toISOString(), 'order-text': text };
  }

  return {
    async approve({ commit, branch, room, role = 'reviewer', agent, approvalPost }) {
      if (!/^[0-9a-f]{40}$/.test(commit ?? '')) refuse('approve needs the full 40-character commit');
      const id = findingOfBranch(branch);
      if (!id) refuse(`approve needs the fix branch (pqc/f<n>-...), got "${branch ?? ''}"`);
      const { post, room: mmRoom, roomFinding, author } = await lookup(mm, approvalPost, team);
      if (roomFinding !== id) refuse(`the approval was posted in ${mmRoom || 'an unknown room'}, not ${id}'s room`);
      if (author !== reviewerBot) refuse(`the approval is from ${author || 'an unknown account'}, not the reviewer (${reviewerBot})`);
      const m = /\bAPPROVED\s+(?:origin\/)?(\S+)\s+@\s+([0-9a-f]{7,40})\b/.exec(post.message ?? '');
      if (!m) refuse('the post has no "APPROVED <branch> @ <sha>" verdict');
      if (m[1].replace(/^origin\//, '') !== branch.replace(/^origin\//, '')) refuse(`the verdict is for ${m[1]}, not ${branch}`);
      if (!commit.startsWith(m[2])) refuse(`the verdict approves ${m[2]}, not ${commit.slice(0, 12)}`);
      return signedBlock('approve', { commit, room, role, agent: agent ?? reviewerBot }, keys.reviewer);
    },
    async ship({ finding, base, fix, room, orderPost }) {
      if (!/^[0-9a-f]{40}$/.test(base ?? '') || !/^[0-9a-f]{40}$/.test(fix ?? '')) refuse('ship needs full base and fix commits');
      const facts = await order('ship', { finding, orderPost });
      if (!approvedInOrigin(fix)) refuse(`${fix.slice(0, 12)} has no approval in the origin`);
      return signedBlock('ship', { finding: finding.toUpperCase(), base, fix, room, ...facts }, keys.shipper);
    },
    async accept({ finding, parent, room, orderPost }) {
      if (!/^[0-9a-f]{40}$/.test(parent ?? '')) refuse('accept needs the full parent commit');
      const facts = await order('accept', { finding, orderPost });
      return signedBlock('accept', { finding: finding.toUpperCase(), parent, room, ...facts }, keys.shipper);
    },
  };
}

// Reads both keys, and with own=true overwrites and deletes the files, so the
// keys live only in this process from here on.
export function takeKeys(keysDir, { own = false } = {}) {
  const keys = {};
  for (const role of ['reviewer', 'shipper']) {
    const file = join(keysDir, `${role}.pem`);
    if (!existsSync(file)) throw new Error(`no ${role} key at ${file}`);
    keys[role] = readFileSync(file, 'utf8');
    if (own) {
      writeFileSync(file, Buffer.alloc(statSync(file).size, 0));
      unlinkSync(file);
    }
  }
  return keys;
}

const ROUTES = { '/sign/approve': 'approve', '/sign/ship': 'ship', '/sign/accept': 'accept' };

export function serve(signer, { port = 59890, host = '127.0.0.1', log = () => {} } = {}) {
  const server = createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const kind = ROUTES[req.url];
    if (req.method !== 'POST' || !kind) return reply(404, { error: 'POST /sign/approve, /sign/ship or /sign/accept' });
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const block = await signer[kind](JSON.parse(body || '{}'));
      log(`signed ${kind}`);
      reply(200, { block });
    } catch (e) {
      const refused = e instanceof Refusal;
      log(`${refused ? 'refused' : 'failed'} ${kind}: ${e.message}`);
      reply(refused ? 403 : 500, { error: e.message });
    }
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

function flags(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    if (a === '--own-keys') o['own-keys'] = true;
    else o[a.slice(2)] = argv[++i];
  }
  return o;
}

async function main(argv) {
  const o = flags(argv);
  const token = o['mm-token'] ?? process.env.MM_TOKEN;
  if (!o['mm-url'] || !token) throw new Error('needs --mm-url and a Mattermost token (MM_TOKEN or --mm-token)');
  const keys = takeKeys(o.keys ?? join('.origin', 'keys'), { own: Boolean(o['own-keys']) });
  const signer = createSigner({ keys, mm: mattermost(o['mm-url'], token), team: o.team, lead: o.lead, reviewer: o.reviewer, origin: o.origin });
  const port = Number(o.port ?? 59890);
  await serve(signer, { port, log: (m) => console.log(`${new Date().toISOString()} ${m}`) });
  console.log(`desk-signer on http://127.0.0.1:${port}${o['own-keys'] ? ', key files deleted: the keys are only in this process now' : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`desk-signer: ${e.message}`);
    process.exitCode = 1;
  });
}
