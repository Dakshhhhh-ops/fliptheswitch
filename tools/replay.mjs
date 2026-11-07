#!/usr/bin/env node
// Replay a live run's git history through the desk's gate.
//
//   node tools/replay.mjs docs/live-run-2/origin.bundle
//
// A run's origin.bundle holds every commit, branch and approval mark the
// agents pushed. This builds a fresh origin holding only the planted code,
// installs the gate (scripts/pre-receive.mjs), and pushes the agents' work in
// the order it landed on main: for each ship, the approved commit to a pqc/
// branch, its refs/approved mark, then the ship merge; for each accepted
// risk, the commit. Every push should pass, and the replayed main should be
// the run's main. A shortcut (the first fix straight onto main) is also
// tried, and should be refused.
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gate = join(DESK, 'scripts', 'pre-receive.mjs').split('\\').join('/');

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=replay', '-c', 'user.email=replay@crypto-desk.local', ...args], { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}`.trim() };
}
function must(cwd, ...args) {
  const r = git(cwd, ...args);
  if (!r.ok) throw new Error(`git ${args.join(' ')}\n${r.out}`);
  return r.out;
}
const reason = (out) => (out.split('\n').find((l) => l.includes('  - '))?.replace(/^.*?- /, '') ?? out.split('\n').at(-1) ?? '').trim();

// Every documented live run: a docs/live-run* folder with a run.json.
export function liveRuns() {
  const docs = join(DESK, 'docs');
  return readdirSync(docs)
    .filter((d) => d.startsWith('live-run') && existsSync(join(docs, d, 'run.json')))
    .sort()
    .map((d) => ({ dir: join(docs, d), folder: `docs/${d}`, ...JSON.parse(readFileSync(join(docs, d, 'run.json'), 'utf8')) }));
}

// Returns { steps: [{ what, ok, expect, detail }], sameMain, signed }.
// `keys`: a folder with the run's reviewer.pub.pem and shipper.pub.pem. They
// are registered in the fresh origin, so the gate checks every signature too.
export function replay(bundlePath, { keep = false, keys } = {}) {
  const bundle = resolve(bundlePath);
  const root = mkdtempSync(join(tmpdir(), 'crypto-desk-replay-'));
  try {
    const live = join(root, 'live');
    must(root, 'clone', '-q', bundle, live);
    must(live, 'fetch', '-q', 'origin', '+refs/approved/*:refs/approved/*');
    const liveMain = must(live, 'rev-parse', 'origin/main');
    const [first, ...chain] = must(live, 'rev-list', '--first-parent', '--reverse', 'origin/main').split('\n');

    const origin = join(root, 'origin.git');
    must(root, 'init', '-q', '--bare', '-b', 'main', origin);
    must(live, 'push', '-q', origin, `${first}:refs/heads/main`);
    const hook = join(origin, 'hooks', 'pre-receive');
    writeFileSync(hook, `#!/bin/sh\nexec node "${gate}"\n`);
    chmodSync(hook, 0o755);
    const signed = Boolean(keys && existsSync(join(keys, 'reviewer.pub.pem')) && existsSync(join(keys, 'shipper.pub.pem')));
    if (signed) {
      mkdirSync(join(origin, 'desk-keys'));
      for (const role of ['reviewer', 'shipper']) copyFileSync(join(keys, `${role}.pub.pem`), join(origin, 'desk-keys', `${role}.pub.pem`));
    }

    const steps = [];
    const push = (what, src, ref, expect = 'pass') => {
      const r = git(live, 'push', origin, `${src}:${ref}`);
      const ok = expect === 'pass' ? r.ok : !r.ok;
      steps.push({ what, ok, expect, detail: r.ok ? 'accepted' : reason(r.out) });
      return r.ok;
    };

    let shortcutTried = false;
    for (const sha of chain) {
      const subject = must(live, 'log', '-1', '--format=%s', sha);
      const parents = must(live, 'log', '-1', '--format=%P', sha).split(' ');
      const ship = /^Ship (F\d+):/.exec(subject);
      const accept = /^Accept risk (F\d+):/.exec(subject);
      if (ship && parents.length === 2) {
        const [id, fix] = [ship[1], parents[1]];
        if (!shortcutTried) {
          push(`shortcut: ${id}'s fix ${fix.slice(0, 7)} straight onto main`, fix, 'refs/heads/main', 'refuse');
          shortcutTried = true;
        }
        push(`${id}: migrator's fix ${fix.slice(0, 7)} to its branch`, fix, `refs/heads/pqc/${id.toLowerCase()}-replay`);
        const marked = git(live, 'rev-parse', '--verify', '--quiet', `refs/approved/${fix}`).ok;
        // Push the mark as the run made it: the commit itself, or a signed tag.
        if (marked) push(`${id}: reviewer's approval mark for ${fix.slice(0, 7)}${signed ? ', signature checked' : ''}`, `refs/approved/${fix}`, `refs/approved/${fix}`);
        else steps.push({ what: `${id}: reviewer's approval mark for ${fix.slice(0, 7)}`, ok: false, expect: 'pass', detail: 'not in the bundle' });
        push(`${id}: shipper's merge ${sha.slice(0, 7)}`, sha, 'refs/heads/main');
      } else if (accept) {
        push(`${accept[1]}: shipper's accepted risk ${sha.slice(0, 7)}`, sha, 'refs/heads/main');
      } else {
        push(`unexpected commit on main: ${sha.slice(0, 7)} "${subject}"`, sha, 'refs/heads/main');
      }
    }
    const replayedMain = must(origin, 'rev-parse', 'main');
    return { steps, sameMain: replayedMain === liveMain, signed, root };
  } finally {
    if (!keep) rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bundle = process.argv[2];
  if (!bundle) {
    console.error('usage: node tools/replay.mjs <origin.bundle>');
    process.exit(2);
  }
  const { steps, sameMain, signed } = replay(bundle, { keys: dirname(resolve(bundle)) });
  console.log(signed ? 'Signed run: the replay origin has its keys, so every signature is checked again.\n' : 'Unsigned run: replayed under the unsigned rules it ran with.\n');
  for (const s of steps) console.log(`${s.ok ? '✔' : '✘'} ${s.what}\n    ${s.expect === 'refuse' ? 'refused, as it should be' : s.detail}${s.expect === 'refuse' && !s.ok ? ' (EXPECTED a refusal)' : ''}${s.expect === 'refuse' && s.ok ? `: ${s.detail}` : ''}`);
  console.log(sameMain ? "✔ The replayed main is the run's main" : "✘ The replayed main differs from the run's main");
  process.exitCode = steps.every((s) => s.ok) && sameMain ? 0 : 1;
}
