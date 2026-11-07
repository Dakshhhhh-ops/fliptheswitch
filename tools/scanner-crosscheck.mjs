#!/usr/bin/env node
// cbom-scan: ignore-file (it names algorithms in its output)
// Checks the rule scanner against an independent parser, on real code.
//
//   npm run scanner:crosscheck                 demo-payments plus the real repos
//   node tools/scanner-crosscheck.mjs <dir>…   any folders
//   … --fetch                                  clone the pinned real repos into .cache/real first
//   … --json <file>                            also write the full result
//
// The rules (tools/cbom-scan.mjs) and the parser pass (tools/cbom-ast.mjs)
// share no code. On the same JavaScript files:
//   recall:    of the crypto calls the parser finds, how many the rules flag
//              on the same lines
//   precision: of the rules' call-site hits, how many sit on a crypto call the
//              parser finds (hits on algorithm names written as strings are
//              counted apart: they are string literals by construction)
// Neither side is our labelling, which is what the benchmark is.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ignoresFile, listSourceFiles, scanSource } from './cbom-scan.mjs';
import { astScan, parsable } from './cbom-ast.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The real code, pinned to the commits checked.
export const REAL = [
  { name: 'ssh2', url: 'https://github.com/mscdex/ssh2.git', commit: 'a3a39d7' },
  { name: 'forge', url: 'https://github.com/digitalbazaar/forge.git', commit: '01119d6' },
  { name: 'jsonwebtoken', url: 'https://github.com/auth0/node-jsonwebtoken.git', commit: 'b924272' },
];

// Is the algorithm a call names (or implies) quantum-vulnerable or broken?
const WEAK = /^(rsa|rsa-pss|ec(:.*)?|ecdh|ecdsa|dsa|dh|ffdh|x25519|x448|ed25519|ed448|sha-?1|md5|md4|des|des-ede3.*|rc4|ripemd.*|(rs|es|ps)\d+|modp\d+|prime256v1|secp\d+r1|p-?(256|384|521)|rsa-sha.*|ecdsa-.*)$/i;
const IMPLIED = { publicEncrypt: 'rsa', privateDecrypt: 'rsa', privateEncrypt: 'rsa', publicDecrypt: 'rsa', createECDH: 'ecdh', 'ecdh.computeSecret': 'ecdh', createDiffieHellman: 'ffdh', getDiffieHellman: 'ffdh', createDiffieHellmanGroup: 'ffdh' };

export function strength(s) {
  const alg = s.algorithm ?? IMPLIED[s.api];
  if (alg === undefined || alg === 'null') return 'not named';
  if (/^(forge\.pki\.rsa|node-rsa|elliptic|tweetnacl)/.test(s.api)) return 'weak';
  return alg.split(',').some((a) => WEAK.test(a.trim())) ? 'weak' : 'modern';
}

export function crosscheck(dir, { label = dir, rules = scanSource } = {}) {
  const out = { label, files: 0, skippedTs: 0, parseErrors: [], ast: [], rules: [], named: 0 };
  for (const full of listSourceFiles(dir)) {
    const rel = relative(dir, full).split(sep).join('/');
    const src = readFileSync(full, 'utf8');
    if (ignoresFile(src)) continue;
    if (!parsable(rel)) { out.skippedTs++; continue; }
    const a = astScan(src, rel);
    if (!a.parsed) { out.parseErrors.push(`${rel}: ${a.error}`); continue; }
    out.files++;
    const hits = rules(src, rel);
    out.named += hits.filter((h) => h.named).length;
    const calls = hits.filter((h) => !h.named);
    for (const s of a.sites) {
      const here = hits.filter((h) => h.line >= s.line && h.line <= s.endLine);
      out.ast.push({ ...s, strength: strength(s), ruleKeys: [...new Set(here.map((h) => h.key))] });
    }
    for (const h of calls) {
      const on = a.sites.find((s) => h.line >= s.line && h.line <= s.endLine);
      out.rules.push({ file: rel, line: h.line, key: h.key, code: h.code, parserApi: on?.api ?? null, parserAlgorithm: on?.algorithm });
    }
  }
  const found = out.ast.filter((s) => s.ruleKeys.length);
  const weak = out.ast.filter((s) => s.strength === 'weak');
  const onCall = out.rules.filter((r) => r.parserApi);
  out.summary = {
    files: out.files,
    skippedTs: out.skippedTs,
    parseErrors: out.parseErrors.length,
    parserSites: out.ast.length,
    flaggedByRules: found.length,
    recall: ratio(found.length, out.ast.length),
    weakSites: weak.length,
    weakFlagged: weak.filter((s) => s.ruleKeys.length).length,
    weakRecall: ratio(weak.filter((s) => s.ruleKeys.length).length, weak.length),
    ruleCallHits: out.rules.length,
    onParserCall: onCall.length,
    precision: ratio(onCall.length, out.rules.length),
    namedStringHits: out.named,
    // The rules said "chosen at runtime" where the parser resolved a name.
    resolvedByParser: out.rules.filter((r) => /-unknown$/.test(r.key) && r.parserAlgorithm && r.parserAlgorithm !== 'null').length,
  };
  out.missed = out.ast.filter((s) => !s.ruleKeys.length);
  out.offCall = out.rules.filter((r) => !r.parserApi);
  return out;
}

const ratio = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

export function fetchReal(root = join(DESK, '.cache', 'real')) {
  mkdirSync(root, { recursive: true });
  for (const r of REAL) {
    const dir = join(root, r.name);
    if (!existsSync(dir)) execFileSync('git', ['clone', '-q', '--filter=blob:none', r.url, dir], { stdio: 'inherit' });
    execFileSync('git', ['-C', dir, 'checkout', '-q', r.commit], { stdio: 'inherit' });
  }
  return root;
}

function main(argv) {
  const args = argv.slice(2);
  const jsonAt = args.indexOf('--json');
  const json = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
  const fetch = args.includes('--fetch');
  let dirs = args.filter((a) => !a.startsWith('--'));
  if (!dirs.length) {
    const real = join(DESK, '.cache', 'real');
    if (fetch) fetchReal(real);
    dirs = [join(DESK, 'demo-payments'), ...REAL.map((r) => join(real, r.name)).filter((d) => existsSync(d))];
    if (dirs.length === 1) console.log('(only demo-payments: add --fetch to clone the pinned real repos into .cache/real)\n');
  }
  const results = dirs.map((d) => crosscheck(d, { label: relative(DESK, d).split(sep).join('/') || d }));
  console.log('| Code | JS files | Parser call sites | Rules flagged | Recall | Weak sites flagged | Rule call hits on a parser call | Precision |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const s = r.summary;
    console.log(`| ${r.label} | ${s.files}${s.skippedTs ? ` (+${s.skippedTs} .ts skipped)` : ''} | ${s.parserSites} | ${s.flaggedByRules} | ${s.recall ?? '-'}% | ${s.weakFlagged}/${s.weakSites} (${s.weakRecall ?? '-'}%) | ${s.onParserCall}/${s.ruleCallHits} | ${s.precision ?? '-'}% |`);
  }
  for (const r of results) {
    if (r.missed.length) {
      console.log(`\n${r.label}: parser call sites the rules don't flag`);
      for (const m of r.missed) console.log(`  ${m.file}:${m.line}  ${m.api}${m.algorithm ? `(${m.algorithm})` : ''}  [${m.strength}]`);
    }
    if (r.offCall.length) {
      console.log(`\n${r.label}: rule hits not on a call the parser counts`);
      for (const h of r.offCall) console.log(`  ${h.file}:${h.line}  ${h.key}  ${h.code.slice(0, 90)}`);
    }
    if (r.parseErrors.length) console.log(`\n${r.label}: not parsed\n  ${r.parseErrors.join('\n  ')}`);
  }
  if (json) writeFileSync(json, JSON.stringify(results.map(({ label, summary, missed, offCall, parseErrors }) => ({ label, summary, missed, offCall, parseErrors })), null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);
