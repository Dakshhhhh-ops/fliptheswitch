#!/usr/bin/env node
// cbom-scan: find cryptography in a JavaScript codebase and write a
// CycloneDX 1.6 CBOM (cryptography bill of materials) plus a findings table.
//
//   node tools/cbom-scan.mjs <repo-dir> [--out cbom.json] [--json]
//
// Detection is a fixed rule table, not a model, so the same code always gives
// the same inventory. @scout runs it and the agents work from its output.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// What each algorithm is, and what we think of it.
//   vulnerable: broken by a large quantum computer (Shor). Harvest-now risk for key exchange and encryption.
//   broken:     already broken by ordinary computers.
//   policy:     not broken, but below the CNSA 2.0 / org policy level.
//   ok:         meets policy, including post-quantum algorithms.
const ALGORITHMS = {
  'rsa-oaep':    { name: 'RSA-OAEP', primitive: 'pke', status: 'vulnerable', priority: 'P1', oid: '1.2.840.113549.1.1.7', nistQ: 0,
                   why: 'RSA is broken by Shor\'s algorithm. Anything wrapped with it today can be recorded now and unwrapped later.',
                   fix: 'Hybrid X25519 + ML-KEM-768 (FIPS 203) key wrap, then HKDF and AES-256-GCM.' },
  'ecdh':        { name: 'ECDH', primitive: 'key-agree', status: 'vulnerable', priority: 'P1', oid: '1.2.840.10045.2.1', nistQ: 0,
                   why: 'Elliptic-curve key agreement is broken by Shor\'s algorithm. Recorded traffic can be decrypted later.',
                   fix: 'Hybrid X25519 + ML-KEM-768 (FIPS 203), both secrets fed into HKDF.' },
  'ecdsa':       { name: 'ECDSA', primitive: 'signature', status: 'vulnerable', priority: 'P2', oid: '1.2.840.10045.4.3.2', nistQ: 0,
                   why: 'ECDSA signatures can be forged once a large quantum computer exists. Lower urgency than key exchange, because past signatures stay valid.',
                   fix: 'ML-DSA-65 (FIPS 204). Keep ECDSA beside it while verifiers still need it (dual signatures).' },
  'sha1':        { name: 'SHA-1', primitive: 'hash', status: 'broken', priority: 'P2', oid: '1.3.14.3.2.26', nistQ: 0,
                   why: 'SHA-1 collisions are practical today on ordinary hardware (SHAttered, 2017). This is not a quantum issue.',
                   fix: 'SHA-256 or SHA3-256. Use HMAC if the checksum should also prove who made it.' },
  'md5':         { name: 'MD5', primitive: 'hash', status: 'broken', priority: 'P2', oid: '1.2.840.113549.2.5', nistQ: 0,
                   why: 'MD5 collisions are trivial today. This is not a quantum issue.',
                   fix: 'SHA-256 or SHA3-256.' },
  'aes-128-gcm': { name: 'AES-128-GCM', primitive: 'ae', status: 'policy', priority: 'P3', oid: '2.16.840.1.101.3.4.1.6', nistQ: 1,
                   why: 'Not broken. Grover\'s algorithm halves its effective strength, and CNSA 2.0 requires AES-256 for long-lived data.',
                   fix: 'AES-256-GCM, with a plan to re-encrypt existing records.' },
  'aes-256-gcm': { name: 'AES-256-GCM', primitive: 'ae', status: 'ok', oid: '2.16.840.1.101.3.4.1.46', nistQ: 5 },
  'sha256':      { name: 'SHA-256', primitive: 'hash', status: 'ok', oid: '2.16.840.1.101.3.4.2.1', nistQ: 2 },
  'sha384':      { name: 'SHA-384', primitive: 'hash', status: 'ok', oid: '2.16.840.1.101.3.4.2.2', nistQ: 4 },
  'sha512':      { name: 'SHA-512', primitive: 'hash', status: 'ok', oid: '2.16.840.1.101.3.4.2.3', nistQ: 4 },
  'sha3-256':    { name: 'SHA3-256', primitive: 'hash', status: 'ok', oid: '2.16.840.1.101.3.4.2.8', nistQ: 2 },
  'ml-kem-768':  { name: 'ML-KEM-768', primitive: 'kem', status: 'ok', oid: '2.16.840.1.101.3.4.4.2', nistQ: 3 },
  'ml-kem-1024': { name: 'ML-KEM-1024', primitive: 'kem', status: 'ok', oid: '2.16.840.1.101.3.4.4.3', nistQ: 5 },
  'ml-dsa-65':   { name: 'ML-DSA-65', primitive: 'signature', status: 'ok', oid: '2.16.840.1.101.3.4.3.18', nistQ: 3 },
  'ml-dsa-87':   { name: 'ML-DSA-87', primitive: 'signature', status: 'ok', oid: '2.16.840.1.101.3.4.3.19', nistQ: 5 },
  'x25519-hybrid': { name: 'X25519 (hybrid with ML-KEM)', primitive: 'key-agree', status: 'ok', oid: '1.3.101.110', nistQ: 0 },
  'x25519':      { name: 'X25519', primitive: 'key-agree', status: 'vulnerable', priority: 'P1', oid: '1.3.101.110', nistQ: 0,
                   why: 'X25519 on its own is broken by Shor\'s algorithm.',
                   fix: 'Pair it with ML-KEM-768 (hybrid).' },
  'tls-classical': { name: 'TLS key exchange (classical)', primitive: 'key-agree', status: 'vulnerable', priority: 'P1', nistQ: 0,
                   why: 'The TLS handshake uses only classical elliptic-curve key exchange, so recorded sessions can be decrypted later.',
                   fix: 'Offer the hybrid group X25519MLKEM768 first (OpenSSL 3.5+), keeping X25519 as fallback.' },
  'tls-hybrid':  { name: 'TLS key exchange (X25519MLKEM768)', primitive: 'key-agree', status: 'ok', nistQ: 3 },
};

const CURVE_NAMES = { prime256v1: 'P-256', 'P-256': 'P-256', secp384r1: 'P-384', 'P-384': 'P-384', secp521r1: 'P-521' };

// Line rules. Each returns the algorithm key (plus details) or null.
// `ctx` holds facts about the whole file, for rules that need them.
const RULES = [
  { re: /(publicEncrypt|privateDecrypt)\s*\(/, fn: ['encrypt', 'decrypt'],
    hit: (m, ctx) => ({ key: 'rsa-oaep', param: ctx.rsaBits, func: m[1] === 'publicEncrypt' ? 'encrypt' : 'decrypt' }) },
  { re: /generateKeyPairSync\(\s*['"]rsa['"]/,
    hit: (m, ctx) => ({ key: 'rsa-oaep', param: ctx.rsaBits, func: 'keygen' }) },
  { re: /createECDH\(\s*['"]([\w-]+)['"]/,
    hit: (m) => ({ key: 'ecdh', curve: CURVE_NAMES[m[1]] ?? m[1], func: 'keygen' }) },
  { re: /computeSecret\s*\(/,
    hit: (m, ctx) => (ctx.hasECDH ? { key: 'ecdh', curve: ctx.ecdhCurve, func: 'keyderive' } : null) },
  { re: /generateKeyPairSync\(\s*['"]ec['"]/,
    hit: (m, ctx) => ({ key: ctx.hasSign ? 'ecdsa' : 'ecdh', curve: ctx.ecCurve, func: 'keygen' }) },
  { re: /\b(sign|verify)\(\s*['"](sha\d+)['"]/,
    hit: (m, ctx) => (ctx.hasEcKeys ? { key: 'ecdsa', curve: ctx.ecCurve, func: m[1] } : null) },
  { re: /\b(sign|verify)\(\s*null\b/,
    hit: (m, ctx) => (ctx.mlDsa ? { key: ctx.mlDsa, func: m[1] } : null) },
  { re: /createHash\(\s*['"]([\w-]+)['"]/,
    hit: (m) => {
      const k = m[1].toLowerCase();
      return ALGORITHMS[k] ? { key: k, func: 'digest' } : null;
    } },
  { re: /createHmac\(\s*['"]([\w-]+)['"]/,
    hit: (m) => {
      const k = m[1].toLowerCase();
      return ALGORITHMS[k] ? { key: k, func: 'tag' } : null;
    } },
  { re: /createCipheriv\(\s*['"](aes-(?:128|256)-gcm)['"]/,
    hit: (m) => ({ key: m[1], func: 'encrypt' }) },
  { re: /createDecipheriv\(\s*['"](aes-(?:128|256)-gcm)['"]/,
    hit: (m) => ({ key: m[1], func: 'decrypt' }) },
  { re: /generateKeyPairSync\(\s*['"](ml-kem-\d+|ml-dsa-\d+)['"]/,
    hit: (m) => ({ key: m[1], func: 'keygen' }) },
  { re: /\b(encapsulate|decapsulate)\s*\(/,
    hit: (m, ctx) => ({ key: ctx.mlKem ?? 'ml-kem-768', func: m[1] }) },
  { re: /generateKeyPairSync\(\s*['"]x25519['"]/,
    hit: (m, ctx) => ({ key: ctx.mlKem ? 'x25519-hybrid' : 'x25519', func: 'keygen' }) },
  { re: /ecdhCurve\s*:\s*['"]([^'"]+)['"]/,
    hit: (m) => ({ key: /MLKEM/i.test(m[1]) ? 'tls-hybrid' : 'tls-classical', param: m[1], func: 'keyderive', protocol: 'tls' }) },
];

function fileFacts(src) {
  const ecCurve = src.match(/namedCurve\s*:\s*['"]([\w-]+)['"]/)?.[1];
  const ecdhCurve = src.match(/createECDH\(\s*['"]([\w-]+)['"]/)?.[1];
  return {
    rsaBits: src.match(/modulusLength\s*:\s*(\d+)/)?.[1],
    hasECDH: Boolean(ecdhCurve),
    ecdhCurve: CURVE_NAMES[ecdhCurve] ?? ecdhCurve,
    hasEcKeys: /generateKeyPairSync\(\s*['"]ec['"]/.test(src),
    ecCurve: CURVE_NAMES[ecCurve] ?? ecCurve,
    hasSign: /\bsign\(/.test(src),
    mlKem: src.match(/['"](ml-kem-\d+)['"]/)?.[1],
    mlDsa: src.match(/['"](ml-dsa-\d+)['"]/)?.[1],
  };
}

function listSourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'test') out.push(...listSourceFiles(full));
    } else if (/\.(m|c)?js$/.test(name)) {
      out.push(full);
    }
  }
  return out.sort();
}

export function scan(repoDir) {
  const hits = [];
  for (const file of listSourceFiles(repoDir)) {
    const src = readFileSync(file, 'utf8');
    const ctx = fileFacts(src);
    const rel = relative(repoDir, file).split(sep).join('/');
    src.split(/\r?\n/).forEach((text, i) => {
      if (/^\s*\/\//.test(text)) return;
      for (const rule of RULES) {
        const m = text.match(rule.re);
        const hit = m && rule.hit(m, ctx);
        if (hit) hits.push({ ...hit, file: rel, line: i + 1, code: text.trim() });
      }
    });
  }
  return hits;
}

const PRIORITY_ORDER = { P1: 1, P2: 2, P3: 3 };

// One finding per (file, algorithm) that is not ok.
export function findings(hits) {
  const groups = new Map();
  for (const h of hits) {
    const algo = ALGORITHMS[h.key];
    if (algo.status === 'ok') continue;
    const id = `${h.file}#${h.key}`;
    if (!groups.has(id)) groups.set(id, { file: h.file, key: h.key, algo, hits: [] });
    groups.get(id).hits.push(h);
  }
  return [...groups.values()]
    .sort((a, b) => PRIORITY_ORDER[a.algo.priority] - PRIORITY_ORDER[b.algo.priority] || a.file.localeCompare(b.file))
    .map((g, i) => {
      const first = g.hits[0];
      const detail = first.curve ?? (first.param ? `${first.param}` : undefined);
      return {
        id: `F${i + 1}`,
        file: g.file,
        line: first.line,
        lines: g.hits.map((h) => h.line),
        algorithm: g.algo.name + (detail ? ` (${detail})` : ''),
        status: g.algo.status,
        priority: g.algo.priority,
        why: g.algo.why,
        fix: g.algo.fix,
      };
    });
}

export function toCbom(hits, { name = 'scanned-repo' } = {}) {
  const components = new Map();
  for (const h of hits) {
    const algo = ALGORITHMS[h.key];
    const variant = h.curve ?? h.param;
    const ref = `crypto/${h.key}${variant ? `/${String(variant).toLowerCase()}` : ''}`;
    if (!components.has(ref)) {
      const algorithmProperties = {
        primitive: algo.primitive,
        executionEnvironment: 'software-plain-ram',
        implementationPlatform: 'generic',
        cryptoFunctions: [],
        nistQuantumSecurityLevel: algo.nistQ,
      };
      if (h.curve) algorithmProperties.curve = h.curve;
      if (h.param && h.protocol !== 'tls') algorithmProperties.parameterSetIdentifier = String(h.param);
      components.set(ref, {
        type: 'cryptographic-asset',
        'bom-ref': ref,
        name: algo.name,
        cryptoProperties: {
          assetType: 'algorithm',
          algorithmProperties,
          ...(algo.oid ? { oid: algo.oid } : {}),
        },
        evidence: { occurrences: [] },
        properties: [
          { name: 'crypto-desk:status', value: algo.status },
          ...(algo.priority ? [{ name: 'crypto-desk:priority', value: algo.priority }] : []),
          ...(h.protocol === 'tls' ? [{ name: 'crypto-desk:tls-groups', value: String(h.param) }] : []),
        ],
      });
    }
    const c = components.get(ref);
    const fns = c.cryptoProperties.algorithmProperties.cryptoFunctions;
    if (h.func && !fns.includes(h.func)) fns.push(h.func);
    c.evidence.occurrences.push({ location: h.file, line: h.line, additionalContext: h.code });
  }
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: { components: [{ type: 'application', name: 'crypto-desk cbom-scan', version: '0.1.0' }] },
      component: { type: 'application', name, 'bom-ref': 'app' },
    },
    components: [...components.values()],
  };
}

export function table(found) {
  if (found.length === 0) return 'No quantum-vulnerable or weak crypto found.';
  const rows = found.map((f) => `| ${f.id} | ${f.priority} | \`${f.file}:${f.line}\` | ${f.algorithm} | ${f.status} |`);
  return ['| # | Priority | Where | Algorithm | Status |', '|---|---|---|---|---|', ...rows].join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  const repo = args.find((a) => !a.startsWith('--')) ?? '.';
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  const hits = scan(repo);
  const found = findings(hits);
  const name = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).name;
  const cbom = toCbom(hits, { name });
  if (out) writeFileSync(out, JSON.stringify(cbom, null, 2) + '\n');
  if (args.includes('--json')) {
    console.log(JSON.stringify({ findings: found }, null, 2));
  } else {
    const assets = cbom.components.length;
    console.log(`Scanned ${repo}: ${assets} crypto assets, ${found.length} findings.\n`);
    console.log(table(found));
    if (out) console.log(`\nCBOM written to ${out}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);
