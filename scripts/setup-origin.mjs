#!/usr/bin/env node
// Create the local git origin the desk's agents clone and push to.
//
//   node scripts/setup-origin.mjs           create it if missing
//   node scripts/setup-origin.mjs --reset   start again from the planted code
//
// It copies demo-payments into a bare repository at .origin/demo-payments.git,
// so the agents work as they would against a hosted repository, without one.
// Prints the folder the template's form asks for.
import { chmodSync, cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureKeys } from '../tools/desk-signature.mjs';

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

function installGate(bareRepo) {
  const script = slash(join(deskDir, 'scripts', 'pre-receive.mjs'));
  const hook = join(bareRepo, 'hooks', 'pre-receive');
  writeFileSync(hook, `#!/bin/sh\nexec node "${script}"\n`);
  chmodSync(hook, 0o755);
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

// The gate: main only takes reviewed ships and accepted risks (see
// scripts/pre-receive.mjs). Installed on every run, so an older origin gets it too.
installGate(origin);
console.log('Gate installed: main only takes approved "Ship F<n>:" merges and "Accept risk F<n>:" commits.');

// The reviewer's and shipper's signing keys, made once in .origin/keys/, with
// their public halves registered in the origin, so the gate checks that each
// approval, ship and accepted risk was signed by the right agent's key.
// --unsigned leaves them out: the unsigned rules live runs 1 and 2 used.
if (!process.argv.includes('--unsigned')) {
  ensureKeys(join(deskDir, '.origin', 'keys'), origin);
  console.log("Signing keys registered: approvals need the reviewer's key, ships and accepted risks the shipper's.");
}

console.log(`\nFill the template form with:\n  desk_dir: ${slash(deskDir)}`);
