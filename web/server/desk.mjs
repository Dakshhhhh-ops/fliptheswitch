// Reading the desk's state from the agents' git origin. Shared by the live
// API (server/index.mjs) and the static export (scripts/export.mjs).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readDesk } from '../../tools/board.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const DESK = resolve(here, '..', '..');
export const ORIGIN = resolve(process.env.DESK_ORIGIN ?? join(DESK, '.origin', 'demo-payments.git'));

// A fingerprint of every ref on the origin: it changes on any push or merge.
// Null when there is no origin to read.
export function fingerprint(origin = ORIGIN) {
  if (!existsSync(origin)) return null;
  try {
    return execFileSync('git', ['--git-dir', origin, 'for-each-ref', '--format=%(refname) %(objectname)'], { encoding: 'utf8' });
  } catch {
    return null;
  }
}

// The body /api/desk returns (a JSON string) and the CBOM as a JSON string.
// `exists` false gives the no-origin error body and no CBOM.
export function readState(origin = ORIGIN, exists = existsSync(origin)) {
  if (!exists) {
    return {
      body: JSON.stringify({ error: 'no-origin', message: 'No git origin yet. Run `npm run setup` in the repository root.' }),
      cbom: null,
    };
  }
  const desk = readDesk(origin);
  const cbom = JSON.stringify(desk.cbom, null, 2);
  const cbomSha256 = createHash('sha256').update(cbom).digest('hex');
  const { cbom: _omit, ...rest } = desk;
  const body = JSON.stringify({ ...rest, cbomSha256, cbomSerial: desk.cbom.serialNumber, readAt: new Date().toISOString() });
  return { body, cbom };
}
