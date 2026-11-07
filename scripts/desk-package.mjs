#!/usr/bin/env node
// npm run desk:package: keep a finished live run as evidence anyone can check.
//
//   npm run desk:package [-- --out docs/live-run-3] [--origin <repo>] [--certs <dir>]
//
// Writes the next docs/live-run-N folder:
//   origin.bundle      the agents' git origin: every commit, branch and approval mark
//   F<n>.cert.json     the shipper's certificate for each shipped finding, kept
//                      only if it is signed by the desk's key and matches this origin
//   chat-log.md        desk:watch's log: every message and push, timestamped
//   main-log.txt, refs.txt, scan-after.md, desk-key.pub.pem
//   run.json           the board it ended on, which npm test and npm run judge check
//   README.md          a first write-up: the board, what people sent, how to check it
// Then it verifies everything it wrote: certificates, the replay through the
// gate, and the board. Add screenshots to the folder yourself.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boardLine, counts, readDesk } from '../tools/board.mjs';
import { audit, check, publicKeyFrom } from '../tools/certificate.mjs';
import { replay } from '../tools/replay.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const slash = (p) => p.split('\\').join('/');

// docs/live-run, docs/live-run-2, … : the first name not taken.
export function nextRunDir(docs = join(DESK, 'docs')) {
  for (let n = 1; ; n++) {
    const dir = join(docs, n === 1 ? 'live-run' : `live-run-${n}`);
    if (!existsSync(dir)) return { dir, n };
  }
}

export function packageRun({ origin, certs, out, log, team = 'desk', name, dates = new Date().toISOString().slice(0, 10), key = join(DESK, 'docs', 'live-run', 'desk-key.pub.pem') }) {
  mkdirSync(out, { recursive: true });
  const bundle = join(out, 'origin.bundle');
  git('--git-dir', origin, 'bundle', 'create', bundle, '--all');
  writeFileSync(join(out, 'main-log.txt'), `${git('--git-dir', origin, 'log', '--graph', '--all', '--date=iso', '--format=%h %an %ad %s')}\n`);
  writeFileSync(join(out, 'refs.txt'), `${git('--git-dir', origin, 'for-each-ref', '--format=%(refname) %(objectname)')}\n`);
  copyFileSync(key, join(out, 'desk-key.pub.pem'));
  const deskKey = publicKeyFrom(key);

  // The board, and the scan of main.
  const desk = readDesk(bundle);
  const board = counts(desk.rows);
  const work = mkdtempSync(join(tmpdir(), 'desk-package-'));
  try {
    git('clone', '-q', bundle, work);
    writeFileSync(join(out, 'scan-after.md'), execFileSync(process.execPath, [join(DESK, 'tools', 'cbom-scan.mjs'), work], { encoding: 'utf8' }));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  // Certificates: only the desk's, and only ones that match this origin.
  const certificates = [];
  const skipped = [];
  for (const row of desk.rows.filter((r) => r.state === 'shipped')) {
    const src = join(certs, `${row.id}.cert.json`);
    if (!existsSync(src)) {
      skipped.push(`${row.id}: no certificate in ${slash(relative(DESK, certs) || certs)}`);
      continue;
    }
    const cert = JSON.parse(readFileSync(src, 'utf8'));
    const bad = audit(cert, bundle).filter((c) => !c.ok);
    if (!check(cert, { publicKey: deskKey }) || bad.length) {
      skipped.push(`${row.id}: ${bad[0]?.name ?? "not signed by the desk's key"} (a certificate from another run?)`);
      continue;
    }
    copyFileSync(src, join(out, `${row.id}.cert.json`));
    certificates.push(row.id);
  }

  // The log, and what people sent.
  let people = [];
  if (log && existsSync(log)) {
    const lines = readFileSync(log, 'utf8').split('\n').filter((l) => l && !/Working…|Queued\. Waiting/.test(l));
    writeFileSync(
      join(out, 'chat-log.md'),
      `# ${name ?? 'Live run'}: the log, as it happened\n\nWritten by \`npm run desk:watch\` during the run: every chat message in the ${team} rooms (each cut to 300 characters) and every change to a ref on the origin, with the UTC time it was seen. Messages from people are numbered \`HUMAN#n\`.\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`,
    );
    people = lines
      .map((l) => /^(\S+)Z HUMAN#\d+ (\S+) (\S+): (.*)$/.exec(l))
      .filter(Boolean)
      .map(([, time, room, who, text]) => ({ time: time.slice(0, 5), room: room.replace(`${team}-`, ''), who, text }));
  }

  const runName = name ?? `Live run ${nextRunDir().n - (existsSync(out) ? 1 : 0)}`;
  const run = { name: runName, team, dates, certificates, board };
  writeFileSync(join(out, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);

  // Verify what was written.
  const certChecks = certificates.map((id) => {
    const c = JSON.parse(readFileSync(join(out, `${id}.cert.json`), 'utf8'));
    return { id, ok: check(c, { publicKey: deskKey }) && audit(c, bundle).every((x) => x.ok) };
  });
  const { steps, sameMain } = replay(bundle);
  const folder = slash(relative(DESK, out));

  const esc = (s) => s.replace(/\|/g, '\\|');
  writeFileSync(
    join(out, 'README.md'),
    `# ${runName}: ${team}, ${dates}

**${boardLine(desk.rows)}**

Packaged by \`npm run desk:package\`. Add what happened, and screenshots.

## Findings

| Finding | State | On main |
|---|---|---|
${desk.rows.map((r) => `| ${r.id} ${esc(r.algorithm)} | ${r.state}${r.risk && r.state === 'shipped' ? ', risk on record' : ''} | ${r.ship ? `\`${r.ship.sha}\`` : r.risk ? esc(r.risk) : r.branch ? `branch \`${r.branch}\`` : '-'} |`).join('\n')}

## What people sent

${people.length ? `| Time (UTC) | Who | Room | Message |\n|---|---|---|---|\n${people.map((p) => `| ${p.time} | ${p.who} | ${p.room} | ${esc(p.text.slice(0, 160))} |`).join('\n')}` : 'No desk:watch log was found for this run.'}

## Screenshots to add

Crop each to the Mattermost window, and link it where it fits above.

- [ ] \`refusal-reviewer.png\`: the engineer asks the reviewer to approve; Switch refuses (owner-agents)
- [ ] \`refusal-ship.png\`: the engineer orders a ship; Switch refuses (owner)
- [ ] \`inventory-lock.png\`: the migrator edits the scout's inventory; Switch's \`403\`
- [ ] \`role-lock.png\`: a second agent takes the reviewer role; Switch's \`400\`
- [ ] \`changes-requested.png\`: a reviewer verdict of CHANGES REQUESTED, if there was one
- [ ] \`final-board.png\`: the scout's last board line in the intake room

## Check it yourself

\`\`\`sh
git clone ${folder}/origin.bundle run && git -C run log --graph --all --format="%h %an %s"
node tools/replay.mjs ${folder}/origin.bundle
${certificates.map((id) => `node tools/certificate.mjs verify ${folder}/${id}.cert.json --tests`).join('\n')}
\`\`\`

\`npm test\` and \`npm run judge\` check this run from \`run.json\`.
`,
  );

  return { out, run, certChecks, skipped, replay: { ok: steps.every((s) => s.ok) && sameMain, pushes: steps.length }, line: boardLine(desk.rows) };
}

async function main(argv) {
  const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const runFile = join(DESK, '.desk-run.json');
  const runInfo = existsSync(runFile) ? JSON.parse(readFileSync(runFile, 'utf8')) : {};
  const team = flag('--team') ?? runInfo.team ?? 'desk';
  const out = resolve(flag('--out') ?? nextRunDir().dir);
  const r = packageRun({
    origin: resolve(flag('--origin') ?? join(DESK, '.origin', 'demo-payments.git')),
    certs: resolve(flag('--certs') ?? join(DESK, 'work')),
    out,
    log: flag('--log') ?? join(DESK, 'work', `${team}-run-log.md`),
    team,
    name: flag('--name'),
    dates: runInfo.startedAt?.slice(0, 10),
  });
  console.log(`Packaged into ${slash(relative(DESK, r.out))}\n\n  ${r.line}`);
  for (const c of r.certChecks) console.log(`  ${c.ok ? '✔' : '✘'} ${c.id} certificate: the desk's key, every claim matches git`);
  for (const s of r.skipped) console.log(`  ! skipped ${s}`);
  console.log(`  ${r.replay.ok ? '✔' : '✘'} replay: ${r.replay.pushes} pushes through the gate, as the run made them`);
  console.log(`\nNext: add screenshots and what happened to ${slash(relative(DESK, r.out))}/README.md, then npm test.`);
  process.exitCode = r.certChecks.every((c) => c.ok) && r.replay.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
