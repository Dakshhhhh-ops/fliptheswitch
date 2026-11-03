#!/usr/bin/env node
// Put the demo medicine list in place and clear the decision log.
// Prints the folder the template's form asks for.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const home = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const state = join(home, 'state');

mkdirSync(state, { recursive: true });
cpSync(join(home, 'demo', 'papa-medicines.json'), join(state, 'medicines.json'));
rmSync(join(state, 'decisions.jsonl'), { force: true });
rmSync(join(state, 'pill-chart.html'), { force: true });

console.log(`Demo list in place: ${join(state, 'medicines.json')}`);
console.log(`\nFill the template form with:\n  care_dir: ${home.split('\\').join('/')}`);
