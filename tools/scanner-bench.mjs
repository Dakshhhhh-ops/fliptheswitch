#!/usr/bin/env node
// cbom-scan: ignore-file (it names algorithms in its output)
// How good is the scanner? Score it against labelled code.
//
//   node tools/scanner-bench.mjs [dir]     (default: test/fixtures/scanner-bench)
//
// Each fixture line ends with what the scanner should report on that line:
//   // expect: sha1       an algorithm it should name (a|b: either name is right)
//   // expect: review     code where the algorithm is only known at runtime: it
//                         should flag the line for a person, not name it
//   // expect: none       nothing (a comment, a docs string, a modern algorithm)
//   // expect: sha1 gap   a known miss: counted as a miss, and listed
// A report on a line marked none, or with no label, is a false positive.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ALGORITHMS, scanSource } from './cbom-scan.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEW_KEYS = new Set(['hash-unknown', 'cipher-unknown']);

// What the scanner reports: anything that isn't fine today.
const reported = (hit) => REVIEW_KEYS.has(hit.key) || hit.status === 'review' || (ALGORITHMS[hit.key] && ALGORITHMS[hit.key].status !== 'ok');

export function bench(dir = join(DESK, 'test', 'fixtures', 'scanner-bench')) {
  const cases = [];
  for (const file of readdirSync(dir).filter((f) => /\.(m|c)?(js|ts)$/.test(f)).sort()) {
    const src = readFileSync(join(dir, file), 'utf8');
    const hits = scanSource(src, file).filter(reported);
    const lines = src.split(/\r?\n/);
    const labelled = new Set();
    lines.forEach((text, i) => {
      const m = /\/\/ expect: ([\w|-]+)( gap)?\s*$/.exec(text);
      if (!m) return;
      const line = i + 1;
      labelled.add(line);
      const [, want, gap] = m;
      const here = hits.filter((h) => h.line === line);
      const named = here.map((h) => (REVIEW_KEYS.has(h.key) || h.status === 'review' ? 'review' : h.key));
      let result;
      if (want === 'none') result = here.length ? 'false positive' : 'correct';
      else if (want.split('|').some((w) => named.includes(w))) result = gap ? 'found (was a known gap)' : 'found';
      else result = here.length ? 'wrong name' : 'missed';
      cases.push({ file, line, want, gap: Boolean(gap), got: named, result, code: text.replace(/\s*\/\/ expect:.*$/, '').trim() });
    });
    for (const h of hits) {
      if (!labelled.has(h.line)) cases.push({ file, line: h.line, want: 'none', gap: false, got: [h.key], result: 'false positive', code: lines[h.line - 1].trim() });
    }
  }

  const positives = cases.filter((c) => c.want !== 'none');
  const tp = positives.filter((c) => c.result.startsWith('found')).length;
  const fp = cases.filter((c) => c.result === 'false positive' || c.result === 'wrong name').length;
  const named = positives.filter((c) => c.want !== 'review');
  return {
    cases,
    total: cases.length,
    precision: tp / (tp + fp || 1),
    recall: tp / (positives.length || 1),
    namedRecall: named.filter((c) => c.result.startsWith('found')).length / (named.length || 1),
    tp,
    fp,
    positives: positives.length,
    decoys: cases.filter((c) => c.want === 'none').length,
    misses: positives.filter((c) => !c.result.startsWith('found')),
    falsePositives: cases.filter((c) => c.result === 'false positive' || c.result === 'wrong name'),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = bench(process.argv[2] && resolve(process.argv[2]));
  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log(`${r.total} labelled lines: ${r.positives} with crypto to report, ${r.decoys} with nothing to report\n`);
  console.log(`  precision ${pct(r.precision)}  (${r.fp} false positive${r.fp === 1 ? '' : 's'})`);
  console.log(`  recall    ${pct(r.recall)}  (${r.tp} of ${r.positives}, counting runtime algorithms flagged for review)\n`);
  for (const c of r.misses) console.log(`  missed ${c.file}:${c.line}  ${c.want}${c.gap ? ' (known gap)' : ''}  ${c.code}`);
  for (const c of r.falsePositives) console.log(`  false positive ${c.file}:${c.line}  ${c.got.join(', ')}  ${c.code}`);
  process.exitCode = r.misses.some((c) => !c.gap) || r.falsePositives.length ? 1 : 0;
}
