#!/usr/bin/env node
// cbom-scan: ignore-file (its tables name every algorithm it looks for)
// cbom-scan: find cryptography in a JavaScript codebase and write a
// CycloneDX 1.6 CBOM (cryptography bill of materials) plus a findings table.
//
//   node tools/cbom-scan.mjs <repo-dir> [--out cbom.json] [--json] [--baseline findings.json]
//                                       [--sarif findings.sarif] [--fail-on p1|p2|p3|any|none]
//                                       [--migration-years 3] [--qday-year 2035]
//
// --sarif writes SARIF 2.1.0 for GitHub code scanning. --fail-on makes the
// scan a CI gate: exit 1 if a finding at or above that priority is new
// (not in the baseline, or any finding at all when there is no baseline).
// Each finding also gets a Mosca verdict (tools/mosca.mjs): is it already
// late, given how long its data must stay secret?
//
// Detection is a fixed rule table, not a model, so the same code always gives
// the same inventory. @scout runs it and the agents work from its output.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { moscaLine, withMosca } from './mosca.mjs';

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
  'ml-kem-512':  { name: 'ML-KEM-512', primitive: 'kem', status: 'ok', oid: '2.16.840.1.101.3.4.4.1', nistQ: 1 },
  'ml-kem-768':  { name: 'ML-KEM-768', primitive: 'kem', status: 'ok', oid: '2.16.840.1.101.3.4.4.2', nistQ: 3 },
  'ml-kem-1024': { name: 'ML-KEM-1024', primitive: 'kem', status: 'ok', oid: '2.16.840.1.101.3.4.4.3', nistQ: 5 },
  'ml-dsa-44':   { name: 'ML-DSA-44', primitive: 'signature', status: 'ok', oid: '2.16.840.1.101.3.4.3.17', nistQ: 2 },
  'ml-dsa-65':   { name: 'ML-DSA-65', primitive: 'signature', status: 'ok', oid: '2.16.840.1.101.3.4.3.18', nistQ: 3 },
  'ml-dsa-87':   { name: 'ML-DSA-87', primitive: 'signature', status: 'ok', oid: '2.16.840.1.101.3.4.3.19', nistQ: 5 },
  'x25519-hybrid': { name: 'X25519 (hybrid with ML-KEM)', primitive: 'key-agree', status: 'ok', oid: '1.3.101.110', nistQ: 0 },
  'x25519':      { name: 'X25519', primitive: 'key-agree', status: 'vulnerable', priority: 'P1', oid: '1.3.101.110', nistQ: 0,
                   why: 'X25519 on its own is broken by Shor\'s algorithm.',
                   fix: 'Pair it with ML-KEM-768 (hybrid).' },
  'tls-classical': { name: 'TLS classical key exchange', primitive: 'key-agree', status: 'vulnerable', priority: 'P1', nistQ: 0,
                   why: 'The TLS handshake uses only classical elliptic-curve key exchange, so recorded sessions can be decrypted later.',
                   fix: 'Offer the hybrid group X25519MLKEM768 first (OpenSSL 3.5+), keeping X25519 as fallback.' },
  'tls-hybrid':  { name: 'TLS hybrid key exchange', primitive: 'key-agree', status: 'ok', nistQ: 3 },
  'rsa-sig':     { name: 'RSA signature', primitive: 'signature', status: 'vulnerable', priority: 'P2', oid: '1.2.840.113549.1.1.11', nistQ: 0,
                   why: 'RSA signatures can be forged once a large quantum computer exists. Lower urgency than key exchange, because past signatures stay valid.',
                   fix: 'ML-DSA-65 (FIPS 204), dual-signed beside RSA while verifiers still need it.' },
  'eddsa':       { name: 'EdDSA', primitive: 'signature', status: 'vulnerable', priority: 'P2', oid: '1.3.101.112', nistQ: 0,
                   why: 'Ed25519 and Ed448 are elliptic-curve signatures, broken by Shor\'s algorithm. Lower urgency than key exchange.',
                   fix: 'ML-DSA-65 (FIPS 204), dual-signed beside EdDSA while verifiers still need it.' },
  'ffdh':        { name: 'Finite-field Diffie-Hellman', primitive: 'key-agree', status: 'vulnerable', priority: 'P1', nistQ: 0,
                   why: 'Classic Diffie-Hellman is broken by Shor\'s algorithm. Recorded sessions can be decrypted later.',
                   fix: 'A hybrid key exchange with ML-KEM-768 (for SSH, mlkem768x25519-sha256).' },
  'pq-hybrid-kex': { name: 'Hybrid post-quantum key exchange', primitive: 'key-agree', status: 'ok', nistQ: 3 },
  'chacha20-poly1305': { name: 'ChaCha20-Poly1305', primitive: 'ae', status: 'ok', nistQ: 5 },
  'aes-256':     { name: 'AES-256', primitive: 'block-cipher', status: 'ok', nistQ: 5 },
  'aes-128':     { name: 'AES-128', primitive: 'block-cipher', status: 'policy', priority: 'P3', nistQ: 1,
                   why: 'Not broken. Grover\'s algorithm halves its effective strength, and CNSA 2.0 requires AES-256 for long-lived data.',
                   fix: 'AES-256.' },
  'legacy-cipher': { name: 'Legacy cipher (DES, 3DES, RC4 or Blowfish)', primitive: 'block-cipher', status: 'broken', priority: 'P2', nistQ: 0,
                   why: 'These ciphers are weak against ordinary computers today. This is not a quantum issue.',
                   fix: 'AES-256-GCM or ChaCha20-Poly1305.' },
};

// Algorithm names that appear as string literals: Web Crypto and JOSE
// identifiers, and SSH protocol names. Exact, case-insensitive matches only.
const NAMED = {
  'rsa-oaep': 'rsa-oaep', 'rsa-oaep-256': 'rsa-oaep', 'rsa-oaep-384': 'rsa-oaep', 'rsa-oaep-512': 'rsa-oaep', 'rsa1_5': 'rsa-oaep',
  'rsassa-pkcs1-v1_5': 'rsa-sig', 'rsa-pss': 'rsa-sig', rs256: 'rsa-sig', rs384: 'rsa-sig', rs512: 'rsa-sig',
  ps256: 'rsa-sig', ps384: 'rsa-sig', ps512: 'rsa-sig', 'ssh-rsa': 'rsa-sig', 'rsa-sha2-256': 'rsa-sig', 'rsa-sha2-512': 'rsa-sig',
  ecdsa: 'ecdsa', es256: 'ecdsa', es384: 'ecdsa', es512: 'ecdsa', es256k: 'ecdsa',
  'ecdsa-sha2-nistp256': 'ecdsa', 'ecdsa-sha2-nistp384': 'ecdsa', 'ecdsa-sha2-nistp521': 'ecdsa',
  ecdh: 'ecdh', 'ecdh-es': 'ecdh', 'ecdh-es+a128kw': 'ecdh', 'ecdh-es+a192kw': 'ecdh', 'ecdh-es+a256kw': 'ecdh',
  'ecdh-sha2-nistp256': 'ecdh', 'ecdh-sha2-nistp384': 'ecdh', 'ecdh-sha2-nistp521': 'ecdh',
  ed25519: 'eddsa', ed448: 'eddsa', eddsa: 'eddsa', 'ssh-ed25519': 'eddsa',
  x25519: 'x25519', x448: 'x25519', 'curve25519-sha256': 'x25519', 'curve25519-sha256@libssh.org': 'x25519',
  'diffie-hellman-group1-sha1': 'ffdh', 'diffie-hellman-group14-sha1': 'ffdh', 'diffie-hellman-group14-sha256': 'ffdh',
  'diffie-hellman-group15-sha512': 'ffdh', 'diffie-hellman-group16-sha512': 'ffdh', 'diffie-hellman-group17-sha512': 'ffdh',
  'diffie-hellman-group18-sha512': 'ffdh', 'diffie-hellman-group-exchange-sha1': 'ffdh', 'diffie-hellman-group-exchange-sha256': 'ffdh',
  'mlkem768x25519-sha256': 'pq-hybrid-kex', 'sntrup761x25519-sha512': 'pq-hybrid-kex', 'sntrup761x25519-sha512@openssh.com': 'pq-hybrid-kex',
  x25519mlkem768: 'tls-hybrid',
  'ml-kem-512': 'ml-kem-512', 'ml-kem-768': 'ml-kem-768', 'ml-kem-1024': 'ml-kem-1024',
  'ml-dsa-44': 'ml-dsa-44', 'ml-dsa-65': 'ml-dsa-65', 'ml-dsa-87': 'ml-dsa-87',
};

function cipherKey(name) {
  const n = name.toLowerCase();
  if (n === 'aes-128-gcm' || n === 'aes-256-gcm') return n;
  if (/^aes-?128/.test(n) || /^aes128/.test(n)) return 'aes-128';
  if (/^aes-?(192|256)/.test(n) || /^aes(192|256)/.test(n)) return 'aes-256';
  if (/^chacha20/.test(n)) return 'chacha20-poly1305';
  if (/^(des|3des|des-ede|rc4|arcfour|bf|blowfish)/.test(n)) return 'legacy-cipher';
  return null;
}

// Algorithms the scanner can see are in use but cannot name exactly.
Object.assign(ALGORITHMS, {
  'classical-sig': { name: 'Classical signature (RSA or ECDSA)', primitive: 'signature', status: 'vulnerable', priority: 'P2', nistQ: 0,
                   why: 'A signature made with a digest name is RSA or ECDSA, and both can be forged once a large quantum computer exists. The key is loaded at runtime, so its exact type is not visible in this file.',
                   fix: 'ML-DSA-65 (FIPS 204), dual-signed beside the classical signature while verifiers still need it.' },
  'hash-unknown':  { name: 'Hash chosen at runtime', primitive: 'hash', status: 'review', priority: 'P3', nistQ: 0,
                   why: 'The algorithm name comes from a value the scanner cannot resolve, so it may be SHA-1 or MD5.',
                   fix: 'Check where the value comes from, and allow only SHA-256 or stronger.' },
  'cipher-unknown': { name: 'Cipher chosen at runtime', primitive: 'ae', status: 'review', priority: 'P3', nistQ: 0,
                   why: 'The cipher name comes from a value the scanner cannot resolve, so it may be weak.',
                   fix: 'Check where the value comes from, and allow only AES-256-GCM or ChaCha20-Poly1305.' },
});

const HASHES = {
  md5: 'md5', sha1: 'sha1', 'sha-1': 'sha1', sha256: 'sha256', 'sha-256': 'sha256', sha384: 'sha384', 'sha-384': 'sha384',
  sha512: 'sha512', 'sha-512': 'sha512', 'sha3-256': 'sha3-256',
};

// 'SHA-1', 'sha1', 'RSA-SHA1' and 'ecdsa-with-SHA1' all name SHA-1.
function hashKey(name) {
  const n = String(name).toLowerCase().replace(/^rsa-/, '').replace(/^ecdsa-with-/, '');
  return HASHES[n] ?? null;
}

const CURVE_NAMES = { prime256v1: 'P-256', 'P-256': 'P-256', secp384r1: 'P-384', 'P-384': 'P-384', secp521r1: 'P-521' };

// Blank out comments and template-literal text, keeping every newline, so
// offsets and line numbers still match the source. Quoted strings are kept,
// and also returned with their offsets for the name rule.
// Limits: code inside `${...}` is skipped, and regex literals are not parsed.
export function clean(src) {
  const out = src.split('');
  const strings = [];
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = src.length;
      blank(i, j);
      i = j;
    } else if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j < 0 ? src.length : j + 2;
      blank(i, j);
      i = j;
    } else if (c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== '`') j += src[j] === '\\' ? 2 : 1;
      j = Math.min(j + 1, src.length);
      blank(i, j);
      i = j;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      strings.push({ at: i, value: src.slice(i + 1, j) });
      i = j + 1;
    } else {
      i++;
    }
  }
  return { text: out.join(''), strings };
}

// The arguments of the call whose "(" is at `open`, split at top-level commas.
function callArgs(text, open) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let k = open; k < text.length; k++) {
    const ch = text[k];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        args.push(text.slice(start, k).trim());
        return args;
      }
    } else if (ch === ',' && depth === 1) {
      args.push(text.slice(start, k).trim());
      start = k + 1;
    }
  }
  return args;
}

// What an argument is: a string literal, a constant declared with one in the
// same file, null, or something the scanner can't know.
function argValue(arg, ctx) {
  if (arg === undefined || arg === '') return { missing: true };
  if (arg === 'null' || arg === 'undefined') return { none: true };
  const lit = /^(['"])([^'"]*)\1$/.exec(arg);
  if (lit) return { value: lit[2] };
  if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
    const name = arg.replace(/\$/g, '\\$');
    const decl = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*(['"])([^'"]*)\\1`).exec(ctx.text);
    if (decl) return { value: decl[2] };
  }
  return { unknown: true };
}

function hashHit(arg, ctx, func) {
  const v = argValue(arg, ctx);
  if (v.unknown) return { key: 'hash-unknown', func };
  if (v.value === undefined) return null;
  const key = hashKey(v.value);
  return key ? { key, func } : null;
}

// The key type behind a signature made with a digest name.
function classicalSigKey(ctx) {
  if (ctx.hasEcKeys) return 'ecdsa';
  if (ctx.hasRsaKeys) return 'rsa-sig';
  return 'classical-sig';
}

// Each rule runs over the whole cleaned file, so a call split across lines is
// still found. `hit` returns one hit, a list of hits, or null.
const RULES = [
  { re: /\b(publicEncrypt|privateDecrypt)\s*\(/g,
    hit: (m, ctx) => ({ key: 'rsa-oaep', param: ctx.rsaBits, func: m[1] === 'publicEncrypt' ? 'encrypt' : 'decrypt' }) },
  { re: /\b(privateEncrypt|publicDecrypt)\s*\(/g,
    hit: (m, ctx) => ({ key: 'rsa-sig', param: ctx.rsaBits, func: m[1] === 'privateEncrypt' ? 'sign' : 'verify' }) },
  { re: /\bgenerateKeyPair(?:Sync)?\s*\(\s*['"](rsa|rsa-pss)['"]/g,
    hit: (m, ctx) => ({ key: m[1] === 'rsa-pss' || ctx.hasSign ? 'rsa-sig' : 'rsa-oaep', param: ctx.rsaBits, func: 'keygen' }) },
  { re: /\bgenerateKeyPair(?:Sync)?\s*\(\s*['"]ec['"]/g,
    hit: (m, ctx) => ({ key: ctx.hasSign ? 'ecdsa' : 'ecdh', curve: ctx.ecCurve, func: 'keygen' }) },
  { re: /\bcreateECDH\s*\(\s*(?:['"]([\w-]+)['"])?/g,
    hit: (m) => ({ key: 'ecdh', curve: m[1] ? CURVE_NAMES[m[1]] ?? m[1] : undefined, func: 'keygen' }) },
  { re: /\bcomputeSecret\s*\(/g,
    hit: (m, ctx) => (ctx.hasECDH ? { key: 'ecdh', curve: ctx.ecdhCurve, func: 'keyderive' } : null) },
  // crypto.sign(digest, data, key) and crypto.verify(...). A digest name means
  // RSA or ECDSA; null means Ed25519/Ed448 or ML-DSA.
  { re: /\b(sign|verify)\s*\(/g, call: true,
    hit: (m, ctx, args) => {
      const v = argValue(args[0], ctx);
      if (v.none) {
        if (ctx.mlDsa) return { key: ctx.mlDsa, func: m[1] };
        if (ctx.hasEd) return { key: 'eddsa', func: m[1] };
        return null;
      }
      const hash = v.value !== undefined ? hashKey(v.value) : null;
      if (!hash) return null;
      const key = classicalSigKey(ctx);
      const out = [{ key, curve: key === 'ecdsa' ? ctx.ecCurve : undefined, func: m[1] }];
      if (ALGORITHMS[hash].status !== 'ok') out.push({ key: hash, func: 'digest' });
      return out;
    } },
  // crypto.createSign('RSA-SHA256') and friends. Sign objects only do RSA and ECDSA.
  { re: /\b(createSign|createVerify)\s*\(/g, call: true,
    hit: (m, ctx, args) => {
      const func = m[1] === 'createSign' ? 'sign' : 'verify';
      const v = argValue(args[0], ctx);
      const name = (v.value ?? '').toLowerCase();
      const key = name.startsWith('rsa') ? 'rsa-sig' : name.startsWith('ecdsa') ? 'ecdsa' : classicalSigKey(ctx);
      const out = [{ key, func }];
      const hash = v.value !== undefined ? hashKey(v.value) : null;
      if (hash && ALGORITHMS[hash].status !== 'ok') out.push({ key: hash, func: 'digest' });
      return out;
    } },
  { re: /\b(createHash|createHmac)\s*\(/g, call: true,
    hit: (m, ctx, args) => hashHit(args[0], ctx, m[1] === 'createHash' ? 'digest' : 'tag') },
  // pbkdf2(password, salt, iterations, keylen, digest[, callback])
  { re: /\bpbkdf2(?:Sync)?\s*\(/g, call: true,
    hit: (m, ctx, args) => (args.length >= 5 ? hashHit(args[4], ctx, 'keyderive') : null) },
  { re: /\bhkdf(?:Sync)?\s*\(/g, call: true,
    hit: (m, ctx, args) => hashHit(args[0], ctx, 'keyderive') },
  { re: /\b(createCipheriv|createDecipheriv)\s*\(/g, call: true,
    hit: (m, ctx, args) => {
      const func = m[1] === 'createCipheriv' ? 'encrypt' : 'decrypt';
      const v = argValue(args[0], ctx);
      if (v.unknown) return { key: 'cipher-unknown', func };
      const key = v.value !== undefined ? cipherKey(v.value) : null;
      return key ? { key, func } : null;
    } },
  { re: /\b(createDiffieHellman|getDiffieHellman|createDiffieHellmanGroup)\s*\(/g,
    hit: () => ({ key: 'ffdh', func: 'keygen' }) },
  { re: /\bgenerateKeyPair(?:Sync)?\s*\(\s*['"](ed25519|ed448)['"]/g,
    hit: () => ({ key: 'eddsa', func: 'keygen' }) },
  { re: /\bgenerateKeyPair(?:Sync)?\s*\(\s*['"](ml-kem-\d+|ml-dsa-\d+)['"]/g,
    hit: (m) => ({ key: m[1], func: 'keygen' }) },
  { re: /\b(encapsulate|decapsulate)\s*\(/g,
    hit: (m, ctx) => ({ key: ctx.mlKem ?? 'ml-kem-768', func: m[1] }) },
  { re: /\bgenerateKeyPair(?:Sync)?\s*\(\s*['"]x25519['"]/g,
    hit: (m, ctx) => ({ key: ctx.mlKem ? 'x25519-hybrid' : 'x25519', func: 'keygen' }) },
  { re: /\becdhCurve\s*:\s*['"]([^'"]+)['"]/g,
    hit: (m) => ({ key: /MLKEM/i.test(m[1]) ? 'tls-hybrid' : 'tls-classical', param: m[1], func: 'keyderive', protocol: 'tls' }) },
];

// Algorithm names written as strings (Web Crypto, JOSE, SSH), exact matches only.
function namedHit(value, ctx) {
  const key = NAMED[value.toLowerCase()];
  if (!key) return null;
  if (key === 'x25519' && ctx.mlKem) return { key: 'x25519-hybrid', func: 'other', named: value };
  return { key, func: 'other', named: value };
}

function fileFacts(text) {
  const ecCurve = text.match(/namedCurve\s*:\s*['"]([\w-]+)['"]/)?.[1];
  const ecdhCurve = text.match(/createECDH\s*\(\s*['"]([\w-]+)['"]/)?.[1];
  return {
    text,
    rsaBits: text.match(/modulusLength\s*:\s*(\d+)/)?.[1],
    hasECDH: /\bcreateECDH\s*\(/.test(text),
    ecdhCurve: CURVE_NAMES[ecdhCurve] ?? ecdhCurve,
    hasEcKeys: /\bgenerateKeyPair(?:Sync)?\s*\(\s*['"]ec['"]/.test(text),
    hasRsaKeys: /\bgenerateKeyPair(?:Sync)?\s*\(\s*['"]rsa/.test(text),
    hasEd: /['"]ed(?:25519|448)['"]/i.test(text),
    ecCurve: CURVE_NAMES[ecCurve] ?? ecCurve,
    hasSign: /\b(?:sign|createSign)\s*\(/.test(text),
    mlKem: text.match(/['"](ml-kem-\d+)['"]/)?.[1],
    mlDsa: text.match(/['"](ml-dsa-\d+)['"]/)?.[1],
  };
}

// Tests, build output and examples are not the code that ships.
const SKIP_DIRS = new Set(['test', 'tests', '__tests__', 'tap', 'spec', 'e2e', 'fixtures', 'bench', 'benchmarks', 'dist', 'build', 'examples', 'cookbook', 'docs']);

// The desk's own folders at the top of a scan: work/ holds the agents'
// checkouts and .origin/ (skipped as a dot folder) the local git origin.
const SKIP_ROOT_DIRS = new Set(['work']);

function listSourceFiles(dir, root = true) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name) && !(root && SKIP_ROOT_DIRS.has(name))) out.push(...listSourceFiles(full, false));
    } else if (/\.(m|c)?(js|ts)$/.test(name) && !/\.d\.(m|c)?ts$/.test(name)) {
      out.push(full);
    }
  }
  return out.sort();
}

// Scan one file's source. `rel` is the path reported for it.
export function scanSource(src, rel) {
  const { text, strings } = clean(src);
  const ctx = fileFacts(text);
  const lineStarts = [0];
  for (let k = 0; k < src.length; k++) if (src[k] === '\n') lineStarts.push(k + 1);
  const lines = src.split(/\r?\n/);
  const lineOf = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const raw = [];
  RULES.forEach((rule, order) => {
    for (const m of text.matchAll(rule.re)) {
      const args = rule.call ? callArgs(text, m.index + m[0].length - 1) : undefined;
      const got = rule.hit(m, ctx, args);
      for (const h of [got].flat().filter(Boolean)) raw.push({ at: m.index, order, h });
    }
  });
  for (const s of strings) {
    const h = namedHit(s.value, ctx);
    if (h) raw.push({ at: s.at, order: RULES.length, h });
  }
  raw.sort((a, b) => a.at - b.at || a.order - b.order);

  const hits = [];
  const seen = new Set();
  for (const { at, h } of raw) {
    const line = lineOf(at);
    const id = `${line}#${h.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const hit = { ...h, file: rel, line, code: lines[line - 1].trim().slice(0, 200) };
    if (hit.curve === undefined) delete hit.curve;
    hits.push(hit);
  }
  return hits;
}

// A file that opts out with this comment in its first five lines is not
// scanned. The scan reports how many files did, so nothing is hidden.
const IGNORE_FILE = /cbom-scan:\s*ignore-file/;
export const ignoresFile = (src) => IGNORE_FILE.test(src.split('\n', 5).join('\n'));

export function scan(repoDir, { ignored = [] } = {}) {
  const hits = [];
  for (const file of listSourceFiles(repoDir)) {
    const rel = relative(repoDir, file).split(sep).join('/');
    const src = readFileSync(file, 'utf8');
    if (ignoresFile(src)) { ignored.push(rel); continue; }
    hits.push(...scanSource(src, rel));
  }
  return hits;
}

const PRIORITY_ORDER = { P1: 1, P2: 2, P3: 3 };

// A classical algorithm that a migration kept on purpose, next to its
// post-quantum replacement in the same file. It is still listed, at P3, so
// nobody forgets it, but it is no longer new use:
// - legacy-read: RSA that only decrypts or makes keys, in a file that wraps
//   new data with ML-KEM. Old records stay exposed until they are re-wrapped.
// - dual-signed: a classical signature made beside an ML-DSA one, for
//   verifiers that only know the classical one. A forger must break both.
export const KEPT = {
  'legacy-read': {
    why: 'Kept only to read records written before the migration; new data is wrapped with ML-KEM. Those old records can still be recorded now and decrypted later, until they are re-wrapped.',
    fix: 'Re-wrap the stored records with the new scheme, then delete this read path.',
  },
  'dual-signed': {
    why: 'Kept on purpose beside an ML-DSA signature, for verifiers that only know the classical one. A forger has to break both.',
    fix: 'Drop the classical signature once every verifier checks ML-DSA.',
  },
};

function keptStatus(group, pq) {
  const { algo, hits } = group;
  if (algo.status !== 'vulnerable') return undefined;
  if (algo.primitive === 'pke' && pq.kem && hits.every((h) => h.func !== 'encrypt')) return 'legacy-read';
  if (algo.primitive === 'signature' && pq.dsa) return 'dual-signed';
  return undefined;
}

// One finding per (file, algorithm) that is not ok. Its `ref` is that pair.
// With a baseline (the findings of an earlier scan), a finding keeps the id
// it had there and a new one gets the next free number, so ids never shift
// when a finding is fixed. Without one, ids are F1, F2, ... by priority.
export function findings(hits, { baseline = [] } = {}) {
  const groups = new Map();
  const pqByFile = new Map();
  for (const h of hits) {
    const pq = pqByFile.get(h.file) ?? {};
    if (/^ml-kem-/.test(h.key) || h.key === 'x25519-hybrid') pq.kem = true;
    if (/^ml-dsa-/.test(h.key)) pq.dsa = true;
    pqByFile.set(h.file, pq);
  }
  for (const h of hits) {
    const algo = ALGORITHMS[h.key];
    if (algo.status === 'ok') continue;
    const ref = `${h.file}#${h.key}`;
    if (!groups.has(ref)) groups.set(ref, { ref, file: h.file, algo, hits: [] });
    groups.get(ref).hits.push(h);
  }
  const known = new Map(baseline.map((b) => [b.ref, b.id]));
  let next = Math.max(0, ...baseline.map((b) => Number(String(b.id).slice(1)) || 0)) + 1;
  for (const g of groups.values()) {
    const kept = keptStatus(g, pqByFile.get(g.file) ?? {});
    if (kept) g.algo = { ...g.algo, status: kept, priority: 'P3', ...KEPT[kept] };
  }
  return [...groups.values()]
    .sort((a, b) => PRIORITY_ORDER[a.algo.priority] - PRIORITY_ORDER[b.algo.priority] || a.file.localeCompare(b.file) || a.ref.localeCompare(b.ref))
    .map((g) => {
      const first = g.hits[0];
      const detail = first.curve ?? (first.param ? `${first.param}` : undefined);
      return {
        id: known.get(g.ref) ?? `F${next++}`,
        ref: g.ref,
        key: first.key,
        file: g.file,
        line: first.line,
        lines: g.hits.map((h) => h.line),
        algorithm: g.algo.name + (detail ? ` (${detail})` : ''),
        status: g.algo.status,
        primitive: g.algo.primitive,
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
  const mosca = found.some((f) => f.mosca);
  const rows = found.map((f) => `| ${f.id} | ${f.priority} | \`${f.file}:${f.line}\` | ${f.algorithm} | ${f.status} |${mosca ? ` ${f.mosca ? moscaLine(f.mosca) : ''} |` : ''}`);
  const head = mosca ? ['| # | Priority | Where | Algorithm | Status | Mosca |', '|---|---|---|---|---|---|'] : ['| # | Priority | Where | Algorithm | Status |', '|---|---|---|---|---|'];
  return [...head, ...rows].join('\n');
}

// How each finding shows up in GitHub code scanning. Anything an attacker can
// use today (classically broken) or record now and decrypt later (P1) is an
// error. Signatures (P2, forged only once a quantum computer exists) and
// runtime-chosen names we could not resolve are warnings. Policy gaps are notes.
export function sarifLevel(algo) {
  if (algo.status in KEPT) return 'note';
  if (algo.status === 'broken') return 'error';
  if (algo.status === 'vulnerable') return algo.priority === 'P1' ? 'error' : 'warning';
  if (algo.status === 'review') return 'warning';
  return 'note';
}

// GitHub sorts and filters security alerts by this number (0 to 10).
const SECURITY_SEVERITY = { P1: '9.0', P2: '7.0', P3: '4.0' };

const STATUS_TAG = { vulnerable: 'quantum-vulnerable', broken: 'classically-broken', policy: 'policy', review: 'needs-review', 'legacy-read': 'legacy-read-path', 'dual-signed': 'dual-signed' };

// SARIF 2.1.0: one rule per algorithm, one result per finding. `root` is the
// scanned folder relative to the repository root, so GitHub puts each result
// on the right file. The fingerprint is the finding's `ref`, the same key
// --baseline matches on, so an alert keeps its identity across commits.
export function toSarif(found, { root = '' } = {}) {
  const dir = String(root).split(sep).join('/').replace(/^\.(\/|$)/, '').replace(/\/+$/, '');
  const prefix = dir ? `${dir}/` : '';
  const rules = Object.entries(ALGORITHMS)
    .filter(([, algo]) => algo.status !== 'ok')
    .map(([key, algo]) => ({
      id: `pqc/${key}`,
      name: algo.name.replace(/[^A-Za-z0-9]+/g, ''),
      shortDescription: { text: `${algo.name} (${algo.status})` },
      fullDescription: { text: algo.why },
      help: { text: `${algo.why}\n\nFix: ${algo.fix}`, markdown: `${algo.why}\n\n**Fix:** ${algo.fix}` },
      defaultConfiguration: { level: sarifLevel(algo) },
      properties: {
        tags: ['security', 'cryptography', STATUS_TAG[algo.status], algo.primitive],
        precision: 'high',
        'security-severity': SECURITY_SEVERITY[algo.priority],
      },
    }));
  const ruleIndex = new Map(rules.map((r, i) => [r.id, i]));
  const location = (f, line) => ({
    physicalLocation: {
      artifactLocation: { uri: prefix + f.file, uriBaseId: '%SRCROOT%' },
      region: { startLine: line },
    },
  });
  const results = found
    .filter((f) => f.status !== 'ok')
    .map((f) => {
      const ruleId = `pqc/${f.key}`;
      const result = {
        ruleId,
        ruleIndex: ruleIndex.get(ruleId),
        level: sarifLevel(f.status in KEPT ? f : ALGORITHMS[f.key]),
        message: { text: `${f.id} ${f.priority}: ${f.algorithm} is ${f.status}. ${f.why} Fix: ${f.fix}` },
        locations: [location(f, f.line)],
        partialFingerprints: { 'cryptoDeskFinding/v1': f.ref },
        properties: { findingId: f.id, priority: f.priority, status: f.status },
      };
      // Other lines in the same file that use the same algorithm.
      const more = f.lines.filter((line) => line !== f.line);
      if (more.length) {
        result.relatedLocations = more.map((line, i) => ({ id: i + 1, ...location(f, line), message: { text: `Also uses ${f.algorithm}` } }));
      }
      return result;
    });
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'crypto-desk cbom-scan', version: '0.1.0', informationUri: 'https://github.com/sandbox-quantum/switch', rules } },
      results,
    }],
  };
}

const FAIL_ON = { p1: 1, p2: 2, p3: 3, any: Infinity, none: 0 };

// The findings that fail a --fail-on gate: at or above `level` and not in the
// baseline. Matching is by `ref`, the same way findings() keeps ids stable.
export function gate(found, level, { baseline = [] } = {}) {
  if (!Object.hasOwn(FAIL_ON, level)) throw new Error(`--fail-on must be one of ${Object.keys(FAIL_ON).join(', ')}`);
  const known = new Set(baseline.map((b) => b.ref));
  return found.filter((f) => !known.has(f.ref) && (PRIORITY_ORDER[f.priority] ?? Infinity) <= FAIL_ON[level]);
}

function fail(message) {
  console.error(`cbom-scan: ${message}`);
  process.exit(1);
}

function main(argv) {
  const args = argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const out = flag('--out');
  const baselineFile = flag('--baseline');
  const sarifFile = flag('--sarif');
  const failOn = String(flag('--fail-on') ?? 'none').toLowerCase();
  if (!Object.hasOwn(FAIL_ON, failOn)) fail(`--fail-on must be one of ${Object.keys(FAIL_ON).join(', ')}.`);
  const moscaOpts = {};
  for (const [name, key] of [['--migration-years', 'migrationYears'], ['--qday-year', 'qdayYear']]) {
    if (flag(name) == null) continue;
    const n = Number(flag(name));
    if (!Number.isFinite(n) || n < 0) fail(`${name} must be a number.`);
    moscaOpts[key] = n;
  }
  const values = new Set([out, baselineFile, sarifFile, flag('--fail-on'), flag('--migration-years'), flag('--qday-year')].filter(Boolean));
  const repo = args.find((a) => !a.startsWith('--') && !values.has(a)) ?? '.';
  if (!existsSync(repo) || !statSync(repo).isDirectory()) fail(`${repo} is not a folder.`);

  // --baseline FILE keeps finding ids stable across rescans: the first run
  // writes FILE, and later runs reuse the ids in it.
  let baseline = [];
  if (baselineFile && existsSync(baselineFile)) {
    try {
      baseline = JSON.parse(readFileSync(baselineFile, 'utf8')).findings ?? [];
    } catch {
      fail(`${baselineFile} is not a findings baseline written by this tool.`);
    }
  }

  const ignored = [];
  const hits = scan(repo, { ignored });
  const found = withMosca(findings(hits, { baseline }), repo, moscaOpts);
  if (baselineFile && !existsSync(baselineFile)) {
    writeFileSync(baselineFile, JSON.stringify({ findings: found.map(({ id, ref }) => ({ id, ref })) }, null, 2) + '\n');
  }

  let name = basename(resolve(repo));
  const pkg = join(repo, 'package.json');
  if (existsSync(pkg)) {
    try {
      name = JSON.parse(readFileSync(pkg, 'utf8')).name ?? name;
    } catch {
      // A broken package.json only costs the CBOM its name.
    }
  }
  const cbom = toCbom(hits, { name });
  if (out) writeFileSync(out, JSON.stringify(cbom, null, 2) + '\n');
  if (sarifFile) {
    // SARIF paths are relative to where the scan runs, which is the repo root in CI.
    const root = relative(process.cwd(), resolve(repo));
    const inside = !root.startsWith('..') && !isAbsolute(root);
    writeFileSync(sarifFile, JSON.stringify(toSarif(found, { root: inside ? root : '' }), null, 2) + '\n');
  }
  if (args.includes('--json')) {
    console.log(JSON.stringify({ findings: found }, null, 2));
  } else {
    const assets = cbom.components.length;
    const skipped = ignored.length ? ` Skipped ${ignored.length} file${ignored.length === 1 ? '' : 's'} marked ignore-file: ${ignored.join(', ')}.` : '';
    console.log(`Scanned ${repo}: ${assets} crypto assets, ${found.length} findings.${skipped}\n`);
    console.log(table(found));
    if (out) console.log(`\nCBOM written to ${out}`);
    if (sarifFile) console.log(`SARIF written to ${sarifFile}`);
  }

  // The gate. Its messages go to stderr so --json output stays parseable.
  if (failOn !== 'none') {
    const failed = gate(found, failOn, { baseline });
    const scope = failOn === 'any' ? 'any priority' : `${failOn.toUpperCase()} or above`;
    const kind = (n) => `${baseline.length ? 'new ' : ''}finding${n === 1 ? '' : 's'}${baseline.length ? ' (not in the baseline)' : ''}`;
    if (failed.length) {
      console.error(`\ncbom-scan: gate failed: ${failed.length} ${kind(failed.length)} at ${scope}:`);
      for (const f of failed) console.error(`  ${f.id} ${f.priority} ${f.file}:${f.line} ${f.algorithm} (${f.status})`);
      process.exitCode = 1;
    } else {
      console.error(`\ncbom-scan: gate passed: no ${kind(0)} at ${scope}.`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);
