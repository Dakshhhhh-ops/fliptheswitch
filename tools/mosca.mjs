// Mosca's rule, per finding.
//
//   x = how long the data must stay secret (or a signature must stay trusted)
//   y = how long the migration takes
//   z = years until a quantum computer can break the algorithm
//
// If x + y > z, data recorded today will still matter on the day it can be
// decrypted: the migration is already late.
//
// x is read from the codebase itself: a comment in the finding's own file, or
// a line in the repo's Markdown docs that names that file, saying how long the
// data is kept ("kept for 7 years", "for the life of the customer account",
// "replay window of 5 minutes"). If nothing says, the finding is marked "ask
// the engineer" rather than guessed. y and z are stated assumptions, and both
// can be changed: z defaults to 2035, the year NIST plans to disallow RSA and
// elliptic curves, which is a planning date, not a prediction.
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

export const DEFAULTS = { migrationYears: 3, qdayYear: 2035 };

const UNIT_YEARS = { year: 1, yr: 1, month: 1 / 12, week: 1 / 52, day: 1 / 365, hour: 1 / 8760, minute: 1 / 525600, min: 1 / 525600 };
const AMOUNT = /\b(\d+(?:\.\d+)?)\s*(years?|yrs?|months?|weeks?|days?|hours?|minutes?|mins?)\b/i;
// The amount only counts in a sentence about keeping or trusting something.
const KEEPING = /\b(kept|keep|retained|retain|retention|stored|archived|held|valid|trusted|secret|replay window|expires?|lives?)\b/i;
const OPEN_ENDED = /\b(life(?:time)? of the (?:\w+ )?account|indefinitely|forever|permanently)\b/i;

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

function markdownFiles(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(name.name)) continue;
    const path = join(dir, name.name);
    if (name.isDirectory()) markdownFiles(path, out);
    else if (name.name.toLowerCase().endsWith('.md')) out.push(path);
  }
  return out;
}

// Splits Markdown into notes: a list item or a paragraph, with the line it starts on.
function notesOf(text) {
  const notes = [];
  let cur = null;
  text.split('\n').forEach((line, i) => {
    const starts = /^\s*([-*+]|\d+\.)\s/.test(line) || /^#/.test(line);
    if (!line.trim() || starts) {
      if (cur) notes.push(cur);
      cur = line.trim() ? { line: i + 1, text: line } : null;
    } else if (cur) cur.text += ` ${line.trim()}`;
    else cur = { line: i + 1, text: line };
  });
  if (cur) notes.push(cur);
  return notes;
}

// The comment lines of a source file, each as a note.
function commentNotes(text) {
  const notes = [];
  text.split('\n').forEach((line, i) => {
    const m = /(?:\/\/|\/\*+|^\s*\*)\s?(.*)$/.exec(line);
    if (m && m[1].trim()) notes.push({ line: i + 1, text: m[1] });
  });
  return notes;
}

// How long a note says data is kept, in years, or null if it doesn't say.
export function lifetimeIn(text) {
  if (OPEN_ENDED.test(text)) return { years: Infinity, said: OPEN_ENDED.exec(text)[1] };
  if (!KEEPING.test(text)) return null;
  const m = AMOUNT.exec(text);
  if (!m) return null;
  const unit = m[2].toLowerCase().replace(/s$/, '');
  return { years: Number(m[1]) * UNIT_YEARS[unit], said: m[0] };
}

function quote(text) {
  const t = text.replace(/\*\*|`/g, '').replace(/^\s*([-*+]|\d+\.)\s+/, '').trim();
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

// Finds where the codebase says how long the data behind `file` lives.
export function findLifetime(repoDir, file, { docs } = {}) {
  let src = '';
  try {
    src = readFileSync(join(repoDir, file), 'utf8');
  } catch {
    // A file that can't be read just has no comments to offer.
  }
  for (const n of commentNotes(src)) {
    const life = lifetimeIn(n.text);
    if (life) return { ...life, source: `${file}:${n.line}`, quote: quote(n.text) };
  }
  const names = [file, basename(file)];
  for (const doc of docs ?? markdownFiles(repoDir)) {
    const rel = relative(repoDir, doc).split(sep).join('/');
    for (const n of notesOf(readFileSync(doc, 'utf8'))) {
      if (!names.some((name) => n.text.includes(name))) continue;
      const life = lifetimeIn(n.text);
      if (life) return { ...life, source: `${rel}:${n.line}`, quote: quote(n.text) };
    }
  }
  return null;
}

const round = (n) => Math.round(n * 10) / 10;
const yrs = (n) => `${round(n)} year${round(n) === 1 ? '' : 's'}`;
const SECRECY = new Set(['pke', 'key-agree', 'kem']);

// The Mosca verdict for one finding. `lifetime` is what findLifetime returned.
export function verdict(finding, lifetime, { migrationYears = DEFAULTS.migrationYears, qdayYear = DEFAULTS.qdayYear, now = new Date() } = {}) {
  const yearsLeft = qdayYear - now.getFullYear();
  const base = { migrationYears, qdayYear, yearsLeft, lifetime: lifetime ?? null };
  if (finding.status === 'broken') return { ...base, clock: 'broken', verdict: 'late', label: 'Late now: broken today, no quantum computer needed' };
  if (finding.status === 'policy') return { ...base, clock: 'grover', verdict: 'n/a', label: "Not on Mosca's clock: Grover only halves its strength" };
  if (finding.status !== 'vulnerable') return { ...base, clock: 'review', verdict: 'n/a', label: 'Algorithm picked at runtime: review first' };
  const clock = SECRECY.has(finding.primitive) ? 'secrecy' : 'trust';
  if (!lifetime) return { ...base, clock, verdict: 'ask', label: `Lifetime unknown: ask the engineer how long it must stay ${clock === 'secrecy' ? 'secret' : 'trusted'}` };
  const margin = yearsLeft - (lifetime.years + migrationYears);
  if (lifetime.years === Infinity) return { ...base, clock, margin: -Infinity, verdict: 'late', label: `Already late: kept for the ${lifetime.said.replace(/^life(time)? of/i, 'life of')}` };
  if (margin < 0) return { ...base, clock, margin: round(margin), verdict: 'late', label: `Already late by ${yrs(-margin)}` };
  if (margin < 2) return { ...base, clock, margin: round(margin), verdict: 'close', label: `Cutting it close: ${yrs(margin)} to spare` };
  return { ...base, clock, margin: round(margin), verdict: 'on time', label: `On time: ${yrs(margin)} to spare` };
}

// Adds `mosca` to each finding.
export function withMosca(found, repoDir, opts = {}) {
  const docs = markdownFiles(repoDir);
  return found.map((f) => ({ ...f, mosca: verdict(f, findLifetime(repoDir, f.file, { docs }), opts) }));
}

// One line for the inventory: "x + y vs z" with the source of x.
export function moscaLine(m) {
  if (!m.lifetime || m.clock === 'broken' || m.clock === 'grover' || m.clock === 'review') return m.label;
  const x = m.lifetime.years === Infinity ? '∞' : round(m.lifetime.years);
  return `${m.label} (${x} + ${m.migrationYears} vs ${m.yearsLeft} years, from ${m.lifetime.source})`;
}
