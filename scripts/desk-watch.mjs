#!/usr/bin/env node
// npm run desk:watch: follow a live run as it happens.
//
// Prints, and appends to work/<team>-run-log.md with the UTC time it was seen:
//   - every chat message in the team's rooms (cut to 300 characters)
//   - every change to a ref on the origin (branches, approval marks, main)
// Messages from people are numbered HUMAN#n, so the log shows exactly what
// people sent. When an agent mentions a person, it prints "→ your turn".
// When two Codex sessions are alive, it suggests npm run desk:tidy.
// desk:package turns the log into the run's chat-log.md. Ctrl-C stops it.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mattermost, mmctl, processes, switchAgents } from './local-switch.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = join(DESK, '.origin', 'demo-payments.git');
const NOT_PEOPLE = /^(switch-|system-bot$|admin$)/;

// One post per "<26-char id> [username] message" line; continuation lines of
// a multi-line message belong to the post above them.
export function parsePosts(raw) {
  const posts = [];
  for (const line of raw.split('\n')) {
    const m = /^([a-z0-9]{26}) \[([^\]]+)\] ?(.*)$/.exec(line);
    if (m) posts.push({ id: m[1], name: m[2], text: m[3] });
    else if (posts.length && !/^There are \d+ posts/.test(line)) posts.at(-1).text += ` ${line}`;
  }
  return posts.map((p) => ({ ...p, text: p.text.replace(/\s+/g, ' ').trim() }));
}

export const isPerson = (name, team) => !name.startsWith(`${team}-`) && !NOT_PEOPLE.test(name);
const noise = (text) => !text || /(joined|added to) the (channel|team)/.test(text) || /^\*\*Working…/.test(text) || /^Starting a session/.test(text) || /^\*\*Queued/.test(text);

async function main() {
  const runFile = join(DESK, '.desk-run.json');
  if (!existsSync(runFile)) {
    console.error('No .desk-run.json: run npm run desk:up first.');
    process.exit(1);
  }
  const { team, mattermostTeam } = JSON.parse(readFileSync(runFile, 'utf8'));
  const mm = mattermost();
  if (!mm) {
    console.error('No Mattermost container running.');
    process.exit(1);
  }
  mkdirSync(join(DESK, 'work'), { recursive: true });
  const logFile = join(DESK, 'work', `${team}-run-log.md`);
  const log = (line) => {
    const s = `${new Date().toISOString().slice(11, 19)}Z ${line}`;
    appendFileSync(logFile, `${s}\n`);
    console.log(s);
  };

  const seen = new Set();
  let refs = '';
  let people = 0;
  let warnedCodex = false;
  log(`watching ${team}; log in ${logFile}`);
  for (;;) {
    let now = '';
    try {
      now = execFileSync('git', ['--git-dir', ORIGIN, 'for-each-ref', '--format=%(refname) %(objectname:short) %(subject)'], { encoding: 'utf8' }).trim();
    } catch {}
    if (now !== refs) {
      const before = new Set(refs.split('\n'));
      for (const r of now.split('\n')) if (r && !before.has(r)) log(`GIT ${r}`);
      refs = now;
    }
    const rooms = mmctl(mm.container, 'channel', 'list', mattermostTeam)
      .stdout.split('\n')
      .map((l) => new RegExp(`^(${team}-[\\w-]+)`).exec(l.trim())?.[1])
      .filter(Boolean);
    for (const room of rooms) {
      for (const p of parsePosts(mmctl(mm.container, 'post', 'list', `${mattermostTeam}:${room}`, '--number', '200', '-i').stdout)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        if (noise(p.text)) continue;
        const person = isPerson(p.name, team);
        if (person) people++;
        log(`${person ? `HUMAN#${people}` : 'agent'} ${room} ${p.name}: ${p.text.slice(0, 300)}`);
        if (!person) {
          const asked = [...p.text.matchAll(/@([\w.-]+)/g)].map((m) => m[1]).filter((n) => isPerson(n, team));
          if (asked.length) console.log(`   → your turn: ${room} is waiting on ${[...new Set(asked)].join(', ')} (docs/RUN-SHEET.md)`);
        }
      }
    }
    // Two Codex sessions: the reviewer's last room is still running, which
    // stalled the F1 review in live run 3.
    const codex = switchAgents(processes()).codex.length;
    if (codex > 1 && !warnedCodex) console.log(`   ! ${codex} Codex sessions alive: if the reviewer stalls, run npm run desk:tidy (keeps the newest)`);
    warnedCodex = codex > 1;
    await new Promise((r) => setTimeout(r, 15000));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
