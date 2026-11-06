#!/usr/bin/env node
// npm run doctor: is this machine ready to run the desk?
//
// Checks what `npm run judge` and `npm test` need, then what the live run in
// Switch needs, and says how to fix anything missing. Nothing is changed.
//
//   SWITCH_URL=http://127.0.0.1:59880      if the Switch server can't be found
//   MATTERMOST_URL=http://127.0.0.1:59881  if Mattermost can't be found
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codexSessions, STALE_CODEX_MINUTES } from './local-switch.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = join(DESK, '.origin', 'demo-payments.git');
const slash = (p) => p.split('\\').join('/');

let failed = 0;
const ok = (what, detail = '') => console.log(`  ✔ ${what}${detail ? `  (${detail})` : ''}`);
const bad = (what, fix) => {
  failed++;
  console.log(`  ✘ ${what}\n      fix: ${fix}`);
};
const warn = (what, note) => console.log(`  ! ${what}\n      ${note}`);

function run(cmd, args) {
  // .cmd shims (claude, codex) need cmd.exe on Windows.
  const [exe, argv] = process.platform === 'win32' ? ['cmd.exe', ['/d', '/c', cmd, ...args]] : [cmd, args];
  const r = spawnSync(exe, argv, { encoding: 'utf8', timeout: 15000 });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

const atLeast = (have, want) => {
  for (let i = 0; i < want.length; i++) {
    if ((have[i] ?? 0) !== want[i]) return (have[i] ?? 0) > want[i];
  }
  return true;
};

async function reachable(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

console.log('Crypto Migration Desk: doctor\n');
console.log('For npm run judge and npm test');

const node = process.versions.node.split('.').map(Number);
if (atLeast(node, [24, 7])) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node}: the desk needs 24.7 or later for ML-KEM and ML-DSA`, 'install Node 24 LTS from https://nodejs.org');

try {
  generateKeyPairSync('ml-kem-768');
  generateKeyPairSync('ml-dsa-65');
  ok('node:crypto has ML-KEM-768 and ML-DSA-65');
} catch {
  bad('node:crypto has no ML-KEM or ML-DSA', 'use the official Node 24.7+ build (OpenSSL 3.5)');
}

const gitV = run('git', ['--version']);
const gitNum = (/(\d+)\.(\d+)/.exec(gitV.out) ?? []).slice(1).map(Number);
if (!gitV.ok) bad('git not found', 'install git from https://git-scm.com');
else if (atLeast(gitNum, [2, 38])) ok(gitV.out);
else bad(`${gitV.out}: the gate uses \`git merge-tree --write-tree\`, which needs git 2.38 or later`, 'update git');

console.log('\nFor the live run in Switch');

if (!existsSync(ORIGIN)) {
  bad('No local git origin yet', 'npm run setup');
} else {
  const hookFile = join(ORIGIN, 'hooks', 'pre-receive');
  const hook = existsSync(hookFile) ? readFileSync(hookFile, 'utf8') : '';
  if (hook.includes(slash(join(DESK, 'scripts', 'pre-receive.mjs')))) ok('Origin has the gate, pointing at this folder');
  else bad('The origin\'s gate is missing or points at another folder (was the folder moved?)', 'npm run setup');

  const commits = run('git', ['--git-dir', ORIGIN, 'rev-list', '--count', 'main']);
  if (commits.out === '1') ok('Origin is fresh: only the planted code');
  else warn(`Origin main has ${commits.out} commits from an earlier run`, 'npm run reset starts again from the planted code.');
}

const work = join(DESK, 'work');
const leftovers = existsSync(work) ? readdirSync(work) : [];
if (leftovers.length) warn(`work/ has checkouts from an earlier run: ${leftovers.join(', ')}`, 'Fine: npm run desk:up picks a team prefix no earlier run used.');

const claude = run('claude', ['--version']);
if (claude.ok) ok('Claude Code', claude.out.split('\n')[0]);
else bad('Claude Code not found (the migrator, scout and shipper run on it)', 'npm install -g @anthropic-ai/claude-code, then run `claude` once to sign in');

const codex = run('codex', ['--version']);
if (codex.ok) ok('Codex', codex.out.split('\n').pop());
else warn('Codex not found', 'Optional. Set both providers in the form to `claude`; the reviewer is then its own agent on the same model.');

// Codex agent sessions left over from an earlier run. In the live run, four
// stale ones (from the day before) were running when the reviewer's shell
// stalled; once they were stopped, the sandbox worked again.
if (codex.ok) {
  const sessions = codexSessions();
  const stale = sessions.filter(([, minutes]) => minutes > STALE_CODEX_MINUTES);
  const pids = stale.map(([pid]) => pid);
  if (stale.length) {
    warn(
      `${stale.length} Codex agent session${stale.length === 1 ? '' : 's'} older than 6 hours: PID ${pids.join(', ')}`,
      `Left over from an earlier run, they can stall the reviewer's sandboxed shell. Stop them before a run: ${
        process.platform === 'win32' ? `Stop-Process -Id ${pids.join(',')}` : `kill ${pids.join(' ')}`
      } (or npm run desk:up -- --stop-stale-codex)`,
    );
  } else if (sessions.length) ok(`Codex agent sessions: ${sessions.length}, none older than 6 hours`);
}

const docker = run('docker', ['info', '--format', '{{.ServerVersion}}']);
if (docker.ok) ok('Docker is running', `server ${docker.out}`);
else bad('Docker is not running (Switch Console runs Mattermost in it)', 'start Docker Desktop');

// The Switch server: SWITCH_URL, or every server Switch Console has made agents for.
const agentsDir = join(homedir(), '.switch', 'agents');
const found = existsSync(agentsDir)
  ? readdirSync(agentsDir)
      .map((d) => /^(localhost|127\.0\.0\.1)-(\d+)$/.exec(d))
      .filter(Boolean)
      .map((m) => `http://127.0.0.1:${m[2]}`)
  : [];
const servers = [...new Set([process.env.SWITCH_URL, ...found].filter(Boolean))];
let up = null;
for (const s of servers) if (!up && (await reachable(`${s}/health`))) up = s;
if (up) ok('Switch server is up', up);
else if (servers.length) bad(`Switch server not answering at ${servers.join(', ')}`, 'open Switch Console and start the server');
else bad('No Switch server found', 'install Switch Console (https://github.com/sandbox-quantum/switch/releases/latest) and add a server with Mattermost, or set SWITCH_URL');

// Mattermost: MATTERMOST_URL, or a running mattermost container's published port.
const mmUrls = [process.env.MATTERMOST_URL].filter(Boolean);
if (docker.ok) {
  const ps = run('docker', ['ps', '--filter', 'name=mattermost', '--format', '{{.Ports}}']);
  for (const m of ps.out.matchAll(/(?:0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d+)->8065/g)) mmUrls.push(`http://127.0.0.1:${m[1]}`);
}
let mm = null;
for (const u of [...new Set(mmUrls)]) if (!mm && (await reachable(`${u}/api/v4/system/ping`))) mm = u;
if (mm) ok('Mattermost is up', mm);
else bad('Mattermost not found', 'add a server with Mattermost in Switch Console, or set MATTERMOST_URL');

console.log(
  failed
    ? `\n${failed} thing${failed === 1 ? '' : 's'} to fix. The judge and the tests only need the first section.`
    : '\nReady. Next: npm run desk:up (docs/RUN-SHEET.md has the whole run).',
);
process.exitCode = failed ? 1 : 0;
