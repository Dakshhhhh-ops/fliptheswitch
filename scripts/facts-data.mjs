#!/usr/bin/env node
// Builds web/src/data/facts.json: facts no scanner could find, each said by a
// person in live run 3 and pinned to its line in docs/live-run-3/chat-log.md
// by the exact words (`says`). `without` is what fixing from the code alone
// would do; `changed` is what the run did instead, also pinned to a log line.
// `npm test` checks every pinned phrase is on its line.
//
//   node scripts/facts-data.mjs          writes web/src/data/facts.json
//   node scripts/facts-data.mjs --check  exits 1 if the file is out of date
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOG, parseLog } from './room-moments.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(DESK, 'web', 'src', 'data', 'facts.json');
const SOURCE = 'https://github.com/Dakshhhhh-ops/fliptheswitch/blob/main/docs/live-run-3/chat-log.md?plain=1';

export const FACTS = [
  {
    finding: 'F5', what: 'webhook signatures (ECDSA)',
    says: 'About 40 merchants still verify ECDSA on old SDKs',
    without: 'Replacing ECDSA outright stops those merchants verifying webhooks.',
    changed: 'Dual-signed: ECDSA kept beside ML-DSA-65 until 30 June 2027.',
    proof: 'Plan change: I\'ll document 30 June 2027',
  },
  {
    finding: 'F1', what: 'card vault encryption (RSA)',
    says: 'old envelopes in the vault must stay readable',
    without: 'Swapping RSA out leaves stored envelopes unreadable.',
    changed: 'New envelopes hybrid; RSA kept read-only for old ones until they are resealed.',
    proof: 'card vault envelopes wrapped with hybrid',
  },
  {
    finding: 'F3', what: 'TLS',
    says: 'has to stay secret for at least 7 years',
    without: 'The scanner could only say "lifetime unknown: ask the engineer".',
    changed: 'Ranked by Mosca\'s rule: already late by 1 year.',
    proof: 'Already late by 1 year',
  },
  {
    finding: 'F3', what: 'TLS',
    says: 'Production TLS stays on the acquirer\'s edge gateway, outside our repo',
    without: 'The repo fix looks done; production stays classical.',
    changed: 'Staging fixed; production recorded as a signed accepted risk, with a change request.',
    proof: 'Accept risk F3',
  },
  {
    finding: 'F2', what: 'partner session keys (ECDH)',
    says: 'the acquirer\'s settlement client is built from this repo',
    without: 'Keep a P-256 fallback for an unknown peer.',
    changed: 'Both sides move to the hybrid together, with no classical fallback.',
    proof: 'there\'s no P-256 fallback',
  },
  {
    finding: 'F4', what: 'receipt checksums (SHA-1)',
    says: 'support re-issues it as v2 from our records',
    without: 'Keeping old receipts checkable means keeping SHA-1 in the code.',
    changed: 'SHA-1 removed completely; old receipts are re-issued.',
    proof: 'I\'m removing SHA-1 completely',
  },
  {
    finding: 'F6', what: 'stored customer records (AES-128)',
    says: 'our DBA re-encrypts every stored record to AES-256-GCM',
    without: 'Keeping old records readable means keeping AES-128 in the code.',
    changed: 'AES-256-GCM only, behind a tested gate that blocks deploy while old records remain.',
    proof: 'deploy gate that blocks until every customer record is v2',
  },
];

const find = (log, phrase) => {
  const hit = log.find((l) => l.text.includes(phrase));
  if (!hit) throw new Error(`"${phrase}" is not in ${LOG}`);
  return hit;
};

export function build(logText) {
  const log = parseLog(logText);
  return {
    title: 'Facts no scanner could find',
    label: 'Said by people in live run 3, 7 Nov 2026',
    facts: FACTS.map((f) => {
      const said = find(log, f.says);
      const proof = find(log, f.proof);
      return {
        finding: f.finding,
        what: f.what,
        who: said.who === 'user' ? 'Security lead' : said.who === 'arjun' ? 'Arjun, the engineer' : said.who,
        says: f.says,
        without: f.without,
        changed: f.changed,
        line: said.n,
        href: `${SOURCE}#L${said.n}`,
        proofLine: proof.n,
        proofHref: `${SOURCE}#L${proof.n}`,
      };
    }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const json = `${JSON.stringify(build(readFileSync(LOG, 'utf8')), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== json) {
      console.error('web/src/data/facts.json is out of date: run node scripts/facts-data.mjs');
      process.exit(1);
    }
    console.log('facts.json matches the chat log');
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, json);
    console.log(`Wrote ${OUT}`);
  }
}
