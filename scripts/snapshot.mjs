#!/usr/bin/env node
// npm run snapshot: a real screenshot of a live run's board, for the README.
//
// Builds board.html from the git history the agents left in a live run
// (docs/live-run-2/origin.bundle by default), then has a headless Chrome or
// Edge capture it to docs/img/board-live-run-2.png. Nothing is drawn by hand:
// the page is tools/board.mjs reading git.
//
//   node scripts/snapshot.mjs [--run docs/live-run-2] [--out docs/img/board-live-run-2.png]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const run = resolve(DESK, opt('--run', 'docs/live-run-2'));
const out = resolve(DESK, opt('--out', join('docs', 'img', `board-${run.split(/[\\/]/).pop()}.png`)));

const BROWSERS = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = BROWSERS.find((b) => existsSync(b));
if (!browser) {
  console.error('No Chrome, Chromium or Edge found. Set CHROME to its path.');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'desk-snapshot-'));
try {
  const page = join(tmp, 'board.html');
  const board = spawnSync(process.execPath, [join(DESK, 'tools', 'board.mjs'), '--origin', join(run, 'origin.bundle'), '--out', page], { encoding: 'utf8' });
  if (board.status !== 0) throw new Error(board.stderr || board.stdout);
  process.stdout.write(board.stdout.split('\n')[0] + '\n');

  mkdirSync(dirname(out), { recursive: true });
  const shot = spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,820', `--screenshot=${out}`, pathToFileURL(page).href], { encoding: 'utf8' });
  if (shot.status !== 0 || !existsSync(out)) throw new Error(shot.stderr || 'the browser wrote no screenshot');
  console.log(`Screenshot written to ${out}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
