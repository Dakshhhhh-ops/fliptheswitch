#!/usr/bin/env node
// Builds web/src/data/replay.json, the desk app's replay of live run 3: every
// message and git push from docs/live-run-3/chat-log.md, in order, with its
// real time. Greetings, "starting a session" notes and tool-call summaries are
// left out. Text is word for word (cut at a word boundary for length), except
// that one agent's handle is shown as "[stand-in reviewer]". `npm test` checks
// the JSON still matches the log.
//
//   node scripts/replay-data.mjs          writes web/src/data/replay.json
//   node scripts/replay-data.mjs --check  exits 1 if the file is out of date
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOG, PEOPLE, parseLog, words } from './room-moments.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(DESK, 'web', 'src', 'data', 'replay.json');
const SOURCE = 'https://github.com/Dakshhhhh-ops/fliptheswitch/blob/main/docs/live-run-3/chat-log.md?plain=1';

const NOISE = /^(Hello!|Hey!|Hey there!|Hi!|Hi there!)|I'm on standby|Starting a session to handle this|^\*\*Worked for|^📄 (created|updated) room document/;
export const ALIAS = [['desk4-reviewer-claude', '[stand-in reviewer]']];
export const shown = (text) => ALIAS.reduce((t, [from, to]) => t.split(from).join(to), text);

const sec = (at) => {
  const [h, m, s] = at.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

export function build(logText) {
  const log = parseLog(logText).filter((l) => !NOISE.test(l.text));
  const start = sec(log[0].at);
  return {
    label: 'Live run 3, 7 Nov 2026, times in UTC',
    source: SOURCE.replace('?plain=1', ''),
    events: log.map((l) => {
      const who = PEOPLE[l.who] ?? { name: l.who, role: 'agent', kind: 'agent' };
      return {
        t: sec(l.at) - start,
        at: `${l.at}Z`,
        room: l.who === 'GIT' ? l.room.replace(/^refs\//, '') : l.room.replace(/^desk4-/, ''),
        name: who.name,
        kind: who.kind,
        text: words(shown(l.text.replace(/^🎭\s*/, '')), 240),
        line: l.n,
      };
    }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const json = `${JSON.stringify(build(readFileSync(LOG, 'utf8')))}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== json) {
      console.error('web/src/data/replay.json is out of date: run node scripts/replay-data.mjs');
      process.exit(1);
    }
    console.log('replay.json matches the chat log');
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, json);
    console.log(`Wrote ${OUT}`);
  }
}
