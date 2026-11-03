#!/usr/bin/env node
// Create the local git origin the desk's agents clone and push to.
//
//   node scripts/setup-origin.mjs           create it if missing
//   node scripts/setup-origin.mjs --reset   start again from the planted code
//
// It copies demo-payments into a bare repository at .origin/demo-payments.git,
// so the agents work as they would against a hosted repository, without one.
// Prints the folder the template's form asks for.
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const deskDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(deskDir, 'demo-payments');
const origin = join(deskDir, '.origin', 'demo-payments.git');
const slash = (p) => p.split('\\').join('/');

function git(args, cwd) {
  execFileSync('git', ['-c', 'user.name=crypto-desk setup', '-c', 'user.email=setup@crypto-desk.local', ...args], {
    cwd,
    stdio: 'ignore',
  });
}

if (process.argv.includes('--reset')) rmSync(origin, { recursive: true, force: true });

if (existsSync(origin)) {
  console.log('Origin already exists. Use --reset to start again from the planted code.');
} else {
  const work = mkdtempSync(join(tmpdir(), 'crypto-desk-'));
  cpSync(source, work, { recursive: true, filter: (p) => !p.includes('node_modules') });
  git(['init', '-b', 'main'], work);
  git(['add', '.'], work);
  git(['commit', '-m', 'demo-payments before migration'], work);
  git(['clone', '--bare', work, origin], deskDir);
  rmSync(work, { recursive: true, force: true });
  console.log('Origin created.');
}

console.log(`\nFill the template form with:\n  desk_dir: ${slash(deskDir)}`);
