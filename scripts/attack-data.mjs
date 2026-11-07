#!/usr/bin/env node
// Builds web/src/data/attack.json for the desk app's "Try to break it": the
// real signed approval and ship for F5 from live run 3's git
// (docs/live-run-3/origin.bundle), and the reviewer's and shipper's public
// keys from docs/live-run-3. The page verifies them with ML-DSA-65 in the
// browser; `npm test` checks the file is up to date and that Node's own
// ML-DSA-65 accepts every signature in it.
//
//   node scripts/attack-data.mjs          writes web/src/data/attack.json
//   node scripts/attack-data.mjs --check  exits 1 if the file is out of date
import { execFileSync } from 'node:child_process';
import { createPublicKey } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSigned } from '../tools/desk-signature.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN = join(DESK, 'docs', 'live-run-3');
export const OUT = join(DESK, 'web', 'src', 'data', 'attack.json');
const SHIP = '4769ce0';
const BLOB = 'https://github.com/Dakshhhhh-ops/fliptheswitch/blob/main/docs/live-run-3';

// The raw ML-DSA-65 public key (1952 bytes) at the end of the SPKI encoding.
export const rawKey = (pem) => {
  const der = createPublicKey(pem).export({ type: 'spki', format: 'der' });
  return Buffer.from(der.subarray(der.length - 1952)).toString('base64');
};

function git(dir, ...args) {
  return execFileSync('git', ['--git-dir', dir, ...args], { encoding: 'utf8' });
}

export function build() {
  const tmp = mkdtempSync(join(tmpdir(), 'desk-attack-'));
  try {
    const dir = join(tmp, 'origin.git');
    execFileSync('git', ['init', '-q', '--bare', dir]);
    git(dir, 'fetch', '-q', join(RUN, 'origin.bundle'), 'refs/*:refs/*');
    const shipMsg = git(dir, 'log', '-1', '--format=%B', SHIP);
    const ship = parseSigned(shipMsg);
    const tagRef = `refs/approved/${ship.fields.fix}`;
    const tagMsg = git(dir, 'for-each-ref', '--format=%(contents)', tagRef);
    const approve = parseSigned(tagMsg);
    const pick = (s, who, what) => ({ who, what, kind: s.kind, payload: s.payload, signature: s.signature });
    return {
      label: 'Live run 3, finding F5',
      source: `${BLOB}/origin.bundle`,
      keys: {
        reviewer: { name: "the reviewer's key", key: rawKey(readFileSync(join(RUN, 'reviewer.pub.pem'))), href: `${BLOB}/reviewer.pub.pem` },
        shipper: { name: "the shipper's key", key: rawKey(readFileSync(join(RUN, 'shipper.pub.pem'))), href: `${BLOB}/shipper.pub.pem` },
      },
      signed: [
        pick(approve, 'reviewer', `The approval mark ${tagRef.slice(0, 22)}…, an annotated tag the reviewer pushed`),
        pick(ship, 'shipper', `The ship merge ${SHIP} on main`),
      ],
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const json = `${JSON.stringify(build(), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== json) {
      console.error('web/src/data/attack.json is out of date: run node scripts/attack-data.mjs');
      process.exit(1);
    }
    console.log('attack.json matches the run');
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, json);
    console.log(`Wrote ${OUT}`);
  }
}
