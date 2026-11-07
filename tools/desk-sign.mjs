#!/usr/bin/env node
// desk-sign: the reviewer's approval and the shipper's merges, signed with
// that agent's ML-DSA-65 key, so the origin's gate can check who made them.
//
//   approve <full sha> --repo <checkout> --key .origin/keys/reviewer.pem
//           [--room <id>] [--role reviewer] [--agent <name>]
//       Pushes refs/approved/<sha> as an annotated tag on that commit, with
//       the signed approval in its message.
//   ship <F-id> <branch> --repo <checkout> --key .origin/keys/shipper.pem -m "<one line>"
//           [--room <id>] [--ordered-by <owner>] [--order-at <time>] [--order-text "<the order>"]
//       Merges <branch> into main (--no-ff) with the signed ship in the
//       message. Doesn't push: run the tests, then git push origin main.
//   accept <F-id> --repo <checkout> --key .origin/keys/shipper.pem -m "<reason>" [same order flags]
//       Commits ACCEPTED-RISKS.md (edit it first) with the signed acceptance.
//       Doesn't push.
//   show <git message file or ->
//       Prints the signed fields in a message.
//
// Signer mode: with --signer http://127.0.0.1:<port> instead of --key, the
// block is signed by tools/desk-signer.mjs, which holds the keys and checks
// the request against Mattermost first. approve then also needs
// --branch <pqc/...> --approval-post <post id of the APPROVED verdict>, and
// ship and accept need --order-post <post id of the security lead's order>;
// the signer takes ordered-by, order-at and order-text from that post.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseSigned, signedBlock } from './desk-signature.mjs';

function git(repo, ...args) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

// git needs an author for a merge or commit. Use the checkout's own, or the
// agent's name when it has none (a fresh CI runner, or a new checkout).
function ident(repo, who) {
  const name = spawnSync('git', ['-C', repo, 'config', 'user.name'], { encoding: 'utf8' }).stdout.trim();
  return name ? [] : ['-c', `user.name=${who}`, '-c', `user.email=${who}@crypto-desk.local`];
}

const VALUED = ['--repo', '--key', '-m', '--room', '--role', '--agent', '--ordered-by', '--order-at', '--order-text', '--signer', '--branch', '--approval-post', '--order-post'];

export function parseArgs(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (VALUED.includes(argv[i])) opts[argv[i].replace(/^-+/, '')] = argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, opts };
}

// Asks the signer for a block. Synchronous like the rest of this file: a
// short child process makes the HTTP request.
export function requestBlock(signer, kind, body) {
  const script = [
    'const [u, b] = process.argv.slice(1);',
    "fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: b })",
    '  .then(async (r) => process.stdout.write(JSON.stringify({ status: r.status, body: await r.text() })))',
    '  .catch((e) => process.stdout.write(JSON.stringify({ status: 0, body: JSON.stringify({ error: e.message }) })));',
  ].join('\n');
  const url = `${signer.replace(/\/+$/, '')}/sign/${kind}`;
  const r = spawnSync(process.execPath, ['-e', script, url, JSON.stringify(body)], { encoding: 'utf8' });
  let res;
  try {
    res = JSON.parse(r.stdout);
  } catch {
    throw new Error(`the signer at ${signer} didn't answer: ${(r.stderr || '').trim()}`);
  }
  let parsed = {};
  try {
    parsed = JSON.parse(res.body);
  } catch {}
  if (res.status !== 200) throw new Error(`the signer refused: ${parsed.error ?? res.body}`);
  return parsed.block;
}

const orderFields = (o) => ({ room: o.room, 'ordered-by': o['ordered-by'], 'order-at': o['order-at'], 'order-text': o['order-text'] });

export function approve(sha, opts) {
  const { repo, key, room, role = 'reviewer', agent } = opts;
  const full = git(repo, 'rev-parse', '--verify', `${sha}^{commit}`);
  const block = opts.signer
    ? requestBlock(opts.signer, 'approve', { commit: full, branch: opts.branch, room, role, agent, approvalPost: opts['approval-post'] })
    : signedBlock('approve', { commit: full, room, role, agent }, readFileSync(key, 'utf8'));
  const tag = `desk-approve-${full.slice(0, 12)}`;
  const who = agent ?? 'desk-reviewer';
  spawnSync('git', ['-C', repo, 'tag', '-d', tag], { encoding: 'utf8' });
  git(repo, '-c', `user.name=${who}`, '-c', `user.email=${who}@crypto-desk.local`, 'tag', '-a', tag, full, '-m', `Approve ${full}`, '-m', block);
  try {
    git(repo, 'push', 'origin', `refs/tags/${tag}:refs/approved/${full}`);
  } finally {
    spawnSync('git', ['-C', repo, 'tag', '-d', tag], { encoding: 'utf8' });
  }
  return full;
}

export function ship(id, branch, opts) {
  const { repo, key, m } = opts;
  if (!m) throw new Error('ship needs -m "<one line>"');
  const base = git(repo, 'rev-parse', 'HEAD');
  const fix = git(repo, 'rev-parse', '--verify', `${branch}^{commit}`);
  const block = opts.signer
    ? requestBlock(opts.signer, 'ship', { finding: id, base, fix, room: opts.room, orderPost: opts['order-post'] })
    : signedBlock('ship', { finding: id, base, fix, ...orderFields(opts) }, readFileSync(key, 'utf8'));
  git(repo, ...ident(repo, 'desk-shipper'), 'merge', '--no-ff', fix, '-m', `Ship ${id}: ${m} (approved by reviewer at ${fix}, shipped by the security lead)`, '-m', block);
  return git(repo, 'rev-parse', 'HEAD');
}

export function accept(id, opts) {
  const { repo, key, m } = opts;
  if (!m) throw new Error('accept needs -m "<reason>"');
  const parent = git(repo, 'rev-parse', 'HEAD');
  const block = opts.signer
    ? requestBlock(opts.signer, 'accept', { finding: id, parent, room: opts.room, orderPost: opts['order-post'] })
    : signedBlock('accept', { finding: id, parent, ...orderFields(opts) }, readFileSync(key, 'utf8'));
  git(repo, 'add', 'ACCEPTED-RISKS.md');
  git(repo, ...ident(repo, 'desk-shipper'), 'commit', '-m', `Accept risk ${id}: ${m}`, '-m', block);
  return git(repo, 'rev-parse', 'HEAD');
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const { pos, opts } = parseArgs(rest);
  const need = (...ks) => {
    for (const k of ks) {
      if (k === 'key' && opts.signer) continue;
      if (!opts[k]) throw new Error(`${cmd} needs --${k}${k === 'key' ? ' (or --signer)' : ''}`);
    }
  };
  if (cmd === 'approve' && pos.length === 1) {
    need('repo', 'key');
    console.log(`Approved ${approve(pos[0], opts)}: refs/approved pushed, signed with the reviewer's key.`);
  } else if (cmd === 'ship' && pos.length === 2) {
    need('repo', 'key');
    console.log(`Merged ${pos[0]} as ${ship(pos[0].toUpperCase(), pos[1], opts)}, signed with the shipper's key. Run the tests, then git push origin main.`);
  } else if (cmd === 'accept' && pos.length === 1) {
    need('repo', 'key');
    console.log(`Committed the accepted risk for ${pos[0]} as ${accept(pos[0].toUpperCase(), opts)}, signed with the shipper's key. Now git push origin main.`);
  } else if (cmd === 'show' && pos.length === 1) {
    console.log(JSON.stringify(parseSigned(readFileSync(pos[0] === '-' ? 0 : pos[0], 'utf8')), null, 2));
  } else {
    console.error('usage: desk-sign.mjs approve <sha> | ship <F-id> <branch> | accept <F-id> | show <file>  (see the top of this file)');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`desk-sign: ${e.message}`);
    process.exitCode = 1;
  }
}
