// Shared helpers: the brand lookup and the medicine list file.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOME = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STATE = process.env.SIBLING_SHIFT_STATE ?? join(HOME, 'state');
export const LIST_FILE = join(STATE, 'medicines.json');
export const LOG_FILE = join(STATE, 'decisions.jsonl');

const BRANDS = JSON.parse(readFileSync(join(HOME, 'data', 'brands.json'), 'utf8')).brands;

// "Tab. TELSARTAN-40 mg" and "Telsartan 40" are the same entry.
export function normalize(name) {
  return String(name)
    .toLowerCase()
    .replace(/^\s*(tab|tablet|cap|capsule)\.?\s+/, '')
    .replace(/(\d)\s*mg\b/g, '$1')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const INDEX = new Map(Object.entries(BRANDS).map(([brand, info]) => [normalize(brand), { brand, ...info }]));

export function lookup(name) {
  return INDEX.get(normalize(name)) ?? null;
}

export function readList() {
  return JSON.parse(readFileSync(LIST_FILE, 'utf8'));
}

export function writeList(list) {
  mkdirSync(dirname(LIST_FILE), { recursive: true });
  writeFileSync(LIST_FILE, JSON.stringify(list, null, 2) + '\n');
}

export function readLog() {
  if (!existsSync(LOG_FILE)) return [];
  return readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function doseText(dose) {
  return `${dose.morning ?? 0}-${dose.afternoon ?? 0}-${dose.night ?? 0}`;
}
