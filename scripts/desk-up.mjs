#!/usr/bin/env node
// npm run desk:up: get this machine ready for a live run in Switch.
//
//   npm run desk:up [-- --team desk4] [--engineer arjun] [--claude-only]
//                   [--stop-stale-codex] [--force]
//
// It does every step of a run that doesn't need a person:
//   1. checks Switch, Mattermost, Docker, git and Node (npm run doctor)
//   2. puts the planted code back on the local git origin, with its gate,
//      refusing if the origin holds a run that hasn't been packaged
//   3. picks a team prefix no earlier run has used
//   4. creates the engineer's Mattermost account if it's missing
//   5. puts the desk's templates in the Switch buddy agent's folder, so one
//      chat message starts the desk
//   6. finds Codex sessions left over from an earlier run (they stalled the
//      reviewer's shell in live run 2), and stops them with --stop-stale-codex
//   7. writes .desk-run.json for desk:watch and desk:package
// Then it prints the one message to send, and what's left for you.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buddyDirs, codexSessions, mattermost, mmctl, run, STALE_CODEX_MINUTES, switchUp } from './local-switch.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = join(DESK, '.origin', 'demo-payments.git');
const slash = (p) => p.split('\\').join('/');

// The first deskN prefix (desk, desk2, desk3, …) that nothing has used.
export function nextTeam(taken) {
  for (let n = 1; ; n++) {
    const team = n === 1 ? 'desk' : `desk${n}`;
    if (!taken.has(team)) return team;
  }
}

// The team prefixes earlier runs used: from agent accounts, rooms and checkouts.
export function teamsIn(names) {
  const taken = new Set();
  for (const name of names) {
    const m = /^(desk\d*)-(scout|migrator|reviewer|shipper|intake|f\d+-[\w-]+|findings\.json)/.exec(name.trim());
    if (m) taken.add(m[1]);
  }
  return taken;
}

// Whether the origin's main is a run already packaged into docs/live-run*.
export function packaged(mainSha, docsDir = join(DESK, 'docs')) {
  return readdirSync(docsDir)
    .filter((d) => d.startsWith('live-run') && existsSync(join(docsDir, d, 'refs.txt')))
    .some((d) => readFileSync(join(docsDir, d, 'refs.txt'), 'utf8').includes(`refs/heads/main ${mainSha}`));
}

async function main(argv) {
  const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const has = (n) => argv.includes(n);
  const say = (s = '') => console.log(s);
  const fail = (what, fix) => {
    say(`  ✘ ${what}\n      fix: ${fix}`);
    process.exitCode = 1;
  };

  say('Crypto Migration Desk: getting ready for a live run\n');

  // 1. The stack.
  say('1. Switch and Mattermost');
  const server = await switchUp();
  const mm = mattermost();
  if (!server) return fail('Switch server not answering', 'open Switch Console and start the server (npm run doctor shows more)');
  say(`  ✔ Switch server ${server}`);
  if (!mm) return fail('No Mattermost container running', 'in Switch Console, add a server with Mattermost, and start Docker');
  say(`  ✔ Mattermost ${mm.url ?? mm.container}`);
  const team = mmctl(mm.container, 'team', 'list').stdout.split('\n').map((l) => l.trim()).find((l) => l && !/^There are/.test(l));
  if (!team) return fail('Mattermost has no team', 'open Mattermost once and create a team');

  // 2. The origin.
  say('\n2. The local git origin');
  if (existsSync(ORIGIN)) {
    const main = run('git', ['--git-dir', ORIGIN, 'rev-parse', 'main']).stdout;
    const commits = run('git', ['--git-dir', ORIGIN, 'rev-list', '--count', 'main']).stdout;
    if (commits !== '1' && !packaged(main) && !has('--force')) {
      return fail(
        `The origin holds a run that isn't packaged yet (main at ${main.slice(0, 7)}, ${commits} commits)`,
        'npm run desk:package keeps it in docs/, then run desk:up again (or --force to drop it)',
      );
    }
  }
  const setup = run(process.execPath, [join(DESK, 'scripts', 'setup-origin.mjs'), '--reset']);
  if (!setup.ok) return fail('Could not reset the origin', setup.out);
  say('  ✔ Planted code on main, gate installed');

  // 3. A fresh team prefix.
  say('\n3. Team prefix');
  const names = [
    ...mmctl(mm.container, 'user', 'list', '--all').stdout.split('\n').map((l) => l.split(': ')[1]?.split(' ')[0] ?? ''),
    ...mmctl(mm.container, 'channel', 'list', team).stdout.split('\n'),
    ...(existsSync(join(DESK, 'work')) ? readdirSync(join(DESK, 'work')) : []),
  ];
  const teamPrefix = flag('--team') ?? nextTeam(teamsIn(names));
  say(`  ✔ ${teamPrefix}${flag('--team') ? '' : ' (no earlier run used it)'}`);

  // 4. The engineer.
  say('\n4. The engineer');
  const engineer = flag('--engineer') ?? 'arjun';
  let password = null;
  const exists = mmctl(mm.container, 'user', 'search', engineer).stdout.includes(`username: ${engineer}`);
  if (exists) {
    say(`  ✔ ${engineer} exists in Mattermost (mmctl --local user change-password ${engineer} sets a new password)`);
  } else {
    password = `Desk-${randomBytes(4).toString('hex')}!`;
    const made = mmctl(mm.container, 'user', 'create', '--email', `${engineer}@localhost.local`, '--username', engineer, '--password', password);
    if (!made.ok) return fail(`Could not create ${engineer}`, made.out);
    mmctl(mm.container, 'team', 'users', 'add', team, engineer);
    say(`  ✔ Created ${engineer}, password ${password}, on team ${team}. Don't link it to a Switch user.`);
  }

  // 5. Templates for the buddy agent.
  say('\n5. Templates');
  const buddies = buddyDirs();
  for (const dir of buddies) {
    for (const t of ['crypto-desk.template.yaml', 'crypto-desk-fixed-rooms.template.yaml']) copyFileSync(join(DESK, 'template', t), join(dir, t));
  }
  if (buddies.length) say(`  ✔ Copied to ${buddies.length} buddy agent folder${buddies.length === 1 ? '' : 's'}`);
  else say('  ! No buddy agent folder found. Import template/crypto-desk.template.yaml in Switch Console → Templates instead.');

  // 6. Codex.
  say('\n6. Codex');
  const codex = !has('--claude-only') && run('codex', ['--version']).ok;
  if (!codex) say('  - Not used: both agents run on Claude');
  else {
    const stale = codexSessions().filter(([, minutes]) => minutes > STALE_CODEX_MINUTES);
    if (!stale.length) say('  ✔ No Codex sessions left over from an earlier run');
    else if (has('--stop-stale-codex')) {
      for (const [pid] of stale) process.platform === 'win32' ? run('taskkill', ['/PID', String(pid), '/T', '/F']) : run('kill', [String(pid)]);
      say(`  ✔ Stopped ${stale.length} Codex session${stale.length === 1 ? '' : 's'} from an earlier run`);
    } else {
      say(`  ! ${stale.length} Codex session${stale.length === 1 ? '' : 's'} from an earlier run (PID ${stale.map(([p]) => p).join(', ')}). They stalled the reviewer's shell in live run 2.`);
      say('      Run desk:up again with --stop-stale-codex to stop them.');
    }
  }

  // 7. The run file.
  const provider = 'claude';
  const reviewProvider = codex ? 'codex' : 'claude';
  writeFileSync(
    join(DESK, '.desk-run.json'),
    JSON.stringify({ team: teamPrefix, engineer, provider, reviewProvider, mattermostTeam: team, startedAt: new Date().toISOString() }, null, 2) + '\n',
  );

  say(`
Ready. What's left for you:

  a. Once per machine: link your Mattermost account to your Switch user
     (Switch Console → Home → Messaging apps). The shipper only obeys you once
     it can tell the account is yours.
  b. Start the watcher in another terminal:   npm run desk:watch
  c. In Mattermost, as yourself, send this to switch-buddy-admin:

     Run the crypto-desk template (crypto-desk.template.yaml in your folder) with: team ${teamPrefix}, target_name demo-payments, desk_dir ${slash(DESK)}, engineer ${engineer}, focus F5, F1, F3, provider ${provider}, review_provider ${reviewProvider}. Keep every other setting at its default.

  d. Answer the agents from ${engineer}'s account and decide from yours:
     docs/RUN-SHEET.md has every message, and when to send it.
  e. When the board stops moving:   npm run desk:package
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
