#!/usr/bin/env node
// Replays a live run's origin onto GitHub as a real pull-request workflow.
//
//   node scripts/github/replay.mjs --repo <owner>/<name> [--run docs/live-run-3]
//
// From the run's origin.bundle (the agents' own git, byte for byte):
//   1. creates the repository and a `desk` default branch holding the gate
//      (scripts/pre-receive.mjs, scripts/github/gate.mjs, the signature code),
//      the run's public keys in desk-keys/ and .github/workflows/desk-gate.yml;
//   2. pushes main at the planted code, and a ruleset on main: no deletion, no
//      force push;
//   3. for every finding branch, opens a pull request into main and pushes the
//      reviewer's signed approval tag (approved/<sha>) if the run made one;
//   4. runs the gate: each PR gets desk-gate/approval ✓ or ✗;
//   5. moves main to the run's final main (the shipper's signed merges, one
//      per ship), which GitHub records as merging those pull requests;
//   6. runs the gate again: each commit on main gets desk-gate/main.
// Commits, approvals and ships are the agents' originals; only the GitHub
// objects (repository, PRs, statuses) are new. Uses the `gh` CLI, signed in.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const repo = arg('--repo');
const run = resolve(ROOT, arg('--run', 'docs/live-run-3'));
if (!repo) {
  console.error('Usage: node scripts/github/replay.mjs --repo <owner>/<name> [--run docs/live-run-3]');
  process.exit(2);
}
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
const git = (cwd, ...a) => sh('git', a, { cwd });
const gh = (...a) => sh('gh', a);
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runLink = `https://github.com/Dakshhhhh-ops/fliptheswitch/blob/main/${run.slice(ROOT.length + 1).replace(/\\/g, '/')}`;

// The run's origin, with its approvals.
const work = mkdtempSync(join(tmpdir(), 'desk-gh-'));
const origin = join(work, 'origin.git');
sh('git', ['clone', '--quiet', '--bare', join(run, 'origin.bundle'), origin]);
git(origin, 'fetch', '--quiet', join(run, 'origin.bundle'), '+refs/approved/*:refs/approved/*');
const remote = `https://github.com/${repo}.git`;
const approvals = git(origin, 'for-each-ref', '--format=%(refname:strip=2)', 'refs/approved/').split('\n').filter(Boolean);
const branches = git(origin, 'for-each-ref', '--format=%(refname:strip=2) %(objectname)', 'refs/heads/pqc/').split('\n').filter(Boolean)
  .map((l) => { const [name, sha] = l.split(' '); return { name, sha }; });
const tip = git(origin, 'rev-parse', 'refs/heads/main');
const base = git(origin, 'rev-list', '--first-parent', '--max-parents=0', tip);

// 1. The repository and its desk branch.
say(`1. ${repo}`);
try {
  gh('repo', 'view', repo, '--json', 'name');
  say('   exists already');
} catch {
  gh('repo', 'create', repo, '--public', '--description',
    'Crypto Migration Desk live run 3, replayed onto GitHub as pull requests, with the desk’s ML-DSA-65 signature gate as a GitHub check.');
  say('   created');
}
const desk = join(work, 'desk');
mkdirSync(join(desk, '.github', 'workflows'), { recursive: true });
mkdirSync(join(desk, 'scripts', 'github'), { recursive: true });
mkdirSync(join(desk, 'tools'), { recursive: true });
mkdirSync(join(desk, 'desk-keys'), { recursive: true });
cpSync(join(ROOT, 'scripts', 'github', 'desk-gate.yml'), join(desk, '.github', 'workflows', 'desk-gate.yml'));
cpSync(join(ROOT, 'scripts', 'github', 'gate.mjs'), join(desk, 'scripts', 'github', 'gate.mjs'));
cpSync(join(ROOT, 'scripts', 'pre-receive.mjs'), join(desk, 'scripts', 'pre-receive.mjs'));
cpSync(join(ROOT, 'tools', 'desk-signature.mjs'), join(desk, 'tools', 'desk-signature.mjs'));
cpSync(join(run, 'reviewer.pub.pem'), join(desk, 'desk-keys', 'reviewer.pub.pem'));
cpSync(join(run, 'shipper.pub.pem'), join(desk, 'desk-keys', 'shipper.pub.pem'));
writeFileSync(join(desk, 'README.md'), `# demo-payments-desk

[Crypto Migration Desk](https://github.com/Dakshhhhh-ops/fliptheswitch)'s live run 3 on [Switch](https://github.com/sandbox-quantum/switch),
replayed onto GitHub as pull requests. The agents' commits, signed approvals
and signed ships are the originals from the run's git
([origin.bundle](${runLink}/origin.bundle), [chat log](${runLink}/chat-log.md)).

- **main** is the run's main: the planted payments app, then one \`Ship F<n>\`
  merge per shipped finding, each signed by the shipper's ML-DSA-65 key.
- **Pull requests**, one per finding branch. A PR's head needs the reviewer's
  signed approval: the annotated tag \`approved/<sha>\`.
- **desk-gate** (this branch, the default one) is the desk's git gate as a
  GitHub Actions check. It posts \`desk-gate/approval\` on every PR and
  \`desk-gate/main\` on every commit of main. F6's PR shows ✗: the run ended
  before the reviewer approved it.

github.com has no pre-receive hooks (only GitHub Enterprise Server does), so
here a bad commit is reported, not refused. A ruleset blocks deleting or
force-pushing main. The desk's own origin still refuses a bad push outright.
This branch holds the gate's code and public keys only, so main stays exactly
what the agents signed.
`);
git(work, 'init', '--quiet', '-b', 'desk', desk);
git(desk, 'add', '-A');
git(desk, 'commit', '--quiet', '-m', 'desk-gate: the desk’s git gate as a GitHub check, with live run 3’s public keys');
git(desk, 'push', '--quiet', '--force', remote, 'desk:refs/heads/desk');
gh('repo', 'edit', repo, '--default-branch', 'desk');
say('   desk branch pushed and made the default');

// 2. main at the planted code, protected.
git(origin, 'push', '--quiet', remote, `${base}:refs/heads/main`);
const rulesets = JSON.parse(gh('api', `repos/${repo}/rulesets`));
if (!rulesets.some((r) => r.name === 'main moves forward only')) execFileSync('gh', ['api', '-X', 'POST', `repos/${repo}/rulesets`, '--input', '-'], {
  input: JSON.stringify({
    name: 'main moves forward only',
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }],
  }),
  stdio: ['pipe', 'ignore', 'inherit'],
});
say(`2. main at the planted code (${base.slice(0, 7)}), ruleset: no deletion, no force push`);

// 3. One pull request per finding branch, and its approval if the run made one.
say('3. pull requests');
const shipSubject = new Map(git(origin, 'log', '--first-parent', '--format=%P%x09%s', tip).split('\n')
  .map((l) => l.split('\t')).filter(([p]) => p.includes(' ')).map(([p, s]) => [p.split(' ')[1], s]));
for (const b of branches) {
  git(origin, 'push', '--quiet', '--force', remote, `${b.sha}:refs/heads/${b.name}`);
  const approved = approvals.includes(b.sha);
  if (approved) git(origin, 'push', '--quiet', remote, `refs/approved/${b.sha}:refs/tags/approved/${b.sha}`);
  const id = /pqc\/f(\d)/.exec(b.name)[1];
  const subject = git(origin, 'log', '-1', '--format=%s', b.sha);
  const shipped = shipSubject.get(b.sha);
  const body = [
    `Live run 3, finding **F${id}**: the migrator's branch \`${b.name}\` from the agents' git, replayed as a pull request.`,
    '',
    approved ? `- **Approval:** the reviewer's signed tag \`approved/${b.sha}\` (ML-DSA-65), checked by desk-gate.` : '- **Approval:** none. The run ended before the reviewer approved this commit, so desk-gate marks it ✗.',
    shipped ? `- **Shipped** by the shipper's signed merge on main: "${shipped}"` : '- **Not shipped.**',
    `- What people said in the room: [chat log](${runLink}/chat-log.md).`,
  ].join('\n');
  const existing = JSON.parse(gh('pr', 'list', '--repo', repo, '--head', b.name, '--state', 'all', '--json', 'number'));
  if (!existing.length) gh('pr', 'create', '--repo', repo, '--base', 'main', '--head', b.name, '--title', `F${id}: ${subject.replace(/^F\d+:\s*/, '')}`, '--body', body);
  say(`   F${id} ${b.name} ${approved ? 'approved' : 'NOT approved'}${shipped ? ', shipped' : ''}`);
}

// Runs desk-gate once and waits for it to finish.
async function gate(label) {
  const latest = () => {
    try {
      return JSON.parse(gh('run', 'list', '--repo', repo, '--workflow', 'desk-gate.yml', '--json', 'databaseId', '--limit', '1'))[0]?.databaseId;
    } catch {
      return undefined; // the workflow isn't registered yet
    }
  };
  const before = latest();
  for (let i = 0; ; i++) {
    try {
      gh('workflow', 'run', 'desk-gate.yml', '--repo', repo, '--ref', 'desk');
      break;
    } catch (e) {
      if (i > 12) throw e;
      await sleep(5000); // a just-pushed workflow takes a moment to register
    }
  }
  let id;
  for (let i = 0; i < 40 && !id; i++) {
    await sleep(3000);
    id = latest();
    if (id === before) id = undefined;
  }
  try {
    sh('gh', ['run', 'watch', String(id), '--repo', repo, '--exit-status'], { stdio: ['ignore', 'ignore', 'ignore'] });
    say(`${label}: desk-gate run ${id} passed`);
  } catch {
    say(`${label}: desk-gate run ${id} FAILED`);
  }
}

await gate('4. pull requests checked');
// 5. The shipper's merges.
git(origin, 'push', '--quiet', remote, `${tip}:refs/heads/main`);
say(`5. main moved to ${tip.slice(0, 7)}, the run's final main`);
await gate('6. main checked');
say(`\nhttps://github.com/${repo}/pulls?q=is%3Apr`);
