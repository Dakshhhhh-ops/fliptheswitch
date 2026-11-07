#!/usr/bin/env node
// Builds web/src/data/room.json, the desk app's "In the room" section, from
// live run 3's chat log. Every line is picked from docs/live-run-3/chat-log.md
// by its time and speaker, and kept word for word (cut only at the end of a
// sentence). `npm test` checks the JSON still matches the log.
//
//   node scripts/room-moments.mjs          writes web/src/data/room.json
//   node scripts/room-moments.mjs --check  exits 1 if the file is out of date
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOG = join(DESK, 'docs', 'live-run-3', 'chat-log.md');
export const OUT = join(DESK, 'web', 'src', 'data', 'room.json');
const SOURCE = 'https://github.com/Dakshhhhh-ops/fliptheswitch/blob/main/docs/live-run-3/chat-log.md?plain=1';

// Who is who, in the words the page shows.
export const PEOPLE = {
  arjun: { name: 'Arjun', role: 'engineer', kind: 'person' },
  user: { name: 'Security lead', role: 'owner', kind: 'person' },
  'desk4-migrator': { name: 'Migrator', role: 'agent', kind: 'agent' },
  'desk4-reviewer': { name: 'Reviewer', role: 'Codex agent', kind: 'agent' },
  'desk4-reviewer-claude': { name: 'Stand-in reviewer', role: 'agent', kind: 'agent' },
  'desk4-shipper': { name: 'Shipper', role: 'agent', kind: 'agent' },
  'desk4-scout': { name: 'Scout', role: 'agent', kind: 'agent' },
  'switch-admin': { name: 'Switch', role: 'platform', kind: 'switch' },
  GIT: { name: 'git', role: 'origin', kind: 'git' },
};

// The three moments. Each line: time, speaker, how many sentences to keep,
// and an optional note the page prints under it.
export const MOMENTS = [
  {
    id: 'people',
    title: 'A person changes the fix',
    sub: 'The scanner knows the algorithm. Only the engineer knows who still depends on it.',
    lines: [
      { at: '05:53:59', who: 'arjun', keep: 2, finding: 'F5' },
      { at: '06:17:13', who: 'GIT', keep: 1, upto: ' (approved', finding: 'F5' },
      { at: '07:00:52', who: 'user', keep: 2, finding: 'F3' },
      { at: '07:01:27', who: 'GIT', keep: 1, finding: 'F3' },
      { at: '09:01:25', who: 'arjun', keep: 2, finding: 'F4' },
      { at: '09:02:04', who: 'desk4-migrator', keep: 1, finding: 'F4' },
    ],
  },
  {
    id: 'refusal',
    title: 'Switch refuses, in the same second',
    sub: 'The engineer asks the reviewer to approve. Switch answers for the reviewer; the migrator\'s hand-off gets through.',
    lines: [
      { at: '06:04:45', who: 'arjun', keep: 1 },
      { at: '06:04:45', who: 'desk4-migrator', keep: 1, note: 'the hand-off, at the same second' },
      { at: '06:05:03', who: 'desk4-reviewer', match: '@arjun', keep: 1, note: 'posted by Switch: addressing is owner-agents' },
      { at: '06:05:23', who: 'desk4-reviewer', keep: 1 },
    ],
  },
  {
    id: 'role',
    title: 'The role lock holds',
    sub: 'F6 is written and approved in the room, but not shipped: the one reviewer role was still held by an agent out of quota.',
    lines: [
      { at: '09:37:32', who: 'desk4-reviewer', match: 'usage limit', keep: 2 },
      { at: '09:55:10', who: 'desk4-reviewer-claude', keep: 3, note: 'no role, so no signed approval and nothing for the shipper' },
    ],
  },
];

// What people (and the reviewer) added to each finding, beyond what the
// scanner suggested. `chars` cuts a long line at a word boundary.
export const ADDED = {
  F5: [
    { at: '05:53:59', who: 'arjun', chars: 220 },
    { at: '06:10:34', who: 'desk4-reviewer', chars: 190 },
    { at: '06:11:46', who: 'arjun', chars: 220 },
  ],
  F1: [
    { at: '06:19:24', who: 'arjun', chars: 220 },
    { at: '06:30:21', who: 'desk4-reviewer', chars: 190 },
  ],
  F3: [
    { at: '06:35:15', who: 'arjun', chars: 220 },
    { at: '07:00:52', who: 'user', chars: 220 },
  ],
  F2: [
    { at: '07:44:40', who: 'arjun', chars: 220 },
    { at: '07:55:12', who: 'desk4-reviewer', chars: 190 },
  ],
  F4: [
    { at: '08:04:08', who: 'arjun', chars: 220 },
    { at: '08:53:52', who: 'desk4-reviewer', chars: 190 },
    { at: '09:01:25', who: 'arjun', chars: 220 },
  ],
  F6: [
    { at: '09:07:59', who: 'arjun', chars: 220 },
    { at: '09:27:17', who: 'desk4-reviewer', chars: 190 },
  ],
};

// The first `n` characters, cut at a word boundary, word for word.
export function words(text, n) {
  if (text.length <= n) return text;
  return `${text.slice(0, text.lastIndexOf(' ', n)).trim()} …`;
}

const LINE = /^(\d\d:\d\d:\d\d)Z (?:HUMAN#\d+ (\S+) (\S+)|agent (\S+) (\S+)|GIT (\S+) (\S+)) ?:? ?(.*)$/;

export function parseLog(text) {
  return text.split('\n').flatMap((raw, i) => {
    const m = LINE.exec(raw);
    if (!m) return [];
    const [, at, hRoom, hWho, aRoom, aWho, ref, sha, rest] = m;
    if (ref) return [{ n: i + 1, at, who: 'GIT', room: ref, text: `${sha} ${rest}`.trim() }];
    return [{ n: i + 1, at, who: (hWho ?? aWho).replace(/:$/, ''), room: hRoom ?? aRoom, text: rest }];
  });
}

// The first `n` sentences, word for word; the rest becomes an ellipsis.
export function sentences(text, n) {
  const parts = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [text];
  const kept = parts.slice(0, n).join('').trim();
  return kept.length < text.trim().length ? `${kept} …` : kept;
}

function pick(log, want) {
  const hit = log.find((l) => l.at === want.at && l.who === want.who && (!want.match || l.text.includes(want.match)));
  if (!hit) throw new Error(`No ${want.who} line at ${want.at}Z in ${LOG}`);
  const who = PEOPLE[want.who];
  let text = hit.text.replace(/^🎭\s*/, '');
  if (want.upto && text.includes(want.upto)) text = `${text.slice(0, text.indexOf(want.upto))} …`;
  else if (want.chars) text = words(text, want.chars);
  else text = sentences(text, want.keep);
  return {
    finding: want.finding ?? null,
    at: `${hit.at}Z`,
    room: hit.room.startsWith('desk4-') ? hit.room.slice(6) : hit.room,
    name: who.name,
    role: who.role,
    kind: who.kind,
    text,
    note: want.note ?? null,
    line: hit.n,
    href: `${SOURCE}#L${hit.n}`,
  };
}

export function build(logText) {
  const log = parseLog(logText);
  return {
    label: 'From live run 3, 7 Nov 2026',
    source: SOURCE.replace('?plain=1', ''),
    moments: MOMENTS.map((m) => ({
      id: m.id,
      title: m.title,
      sub: m.sub,
      lines: m.lines.map((want) => pick(log, want)),
    })),
    added: Object.fromEntries(Object.entries(ADDED).map(([id, lines]) => [id, lines.map((want) => pick(log, want))])),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const json = `${JSON.stringify(build(readFileSync(LOG, 'utf8')), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const now = readFileSync(OUT, 'utf8');
    if (now !== json) {
      console.error('web/src/data/room.json is out of date: run node scripts/room-moments.mjs');
      process.exit(1);
    }
    console.log('room.json matches the chat log');
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, json);
    console.log(`Wrote ${OUT}`);
  }
}
