// cbom-scan: ignore-file (it names algorithms in its own tables)
// An independent second opinion on the scanner: parse each file with acorn
// (a real JavaScript parser, vendored in tools/vendor/) and list every call
// into a crypto API, with the algorithm when the code names it.
//
// It shares no code with the rule scanner in tools/cbom-scan.mjs. It works
// from the syntax tree, so it knows what a name is bound to: `crypto.sign(...)`
// on `require('node:crypto')` is a crypto call, and `jwt.sign(...)` is a
// jsonwebtoken call, where the rules only see the word `sign(`.
//
// Limits, on purpose: one file at a time (no imports followed), algorithm
// names resolved only from a literal, a constant declared with one, or a
// constant object's property. TypeScript isn't parsed: acorn reads
// JavaScript only, so .ts files are reported as skipped.
import { parse } from './vendor/acorn.mjs';

const NODE_CRYPTO = new Set(['crypto', 'node:crypto']);

// node:crypto functions that pick or use an algorithm, and which argument
// names it (index), if any.
export const NODE_FNS = {
  createHash: 0, createHmac: 0, createSign: 0, createVerify: 0,
  sign: 0, verify: 0,
  generateKeyPair: 0, generateKeyPairSync: 0, generateKey: 0, generateKeySync: 0,
  publicEncrypt: null, privateDecrypt: null, privateEncrypt: null, publicDecrypt: null,
  createECDH: 0, createCipheriv: 0, createDecipheriv: 0,
  createDiffieHellman: null, getDiffieHellman: 0, createDiffieHellmanGroup: 0, diffieHellman: null,
  encapsulate: null, decapsulate: null,
  pbkdf2: 4, pbkdf2Sync: 4, hkdf: 0, hkdfSync: 0, scrypt: null, scryptSync: null,
};
const SUBTLE_FNS = new Set(['encrypt', 'decrypt', 'sign', 'verify', 'digest', 'generateKey', 'deriveKey', 'deriveBits', 'importKey', 'wrapKey', 'unwrapKey', 'encapsulateKey', 'decapsulateKey', 'encapsulateBits', 'decapsulateBits']);
const TLS_FNS = new Set(['connect', 'createServer', 'createSecureContext', 'request', 'get', 'Agent']);
const TLS_OPTS = ['ecdhCurve', 'ciphers', 'sigalgs'];

function parseAny(src) {
  const opts = { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowImportExportEverywhere: true };
  try {
    return parse(src, { ...opts, sourceType: 'module' });
  } catch {
    return parse(src, { ...opts, sourceType: 'script' }); // throws if this fails too
  }
}

// Every node in the tree, parents first.
function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) walk(c, visit);
    else if (v && typeof v.type === 'string') walk(v, visit);
  }
}

const requiredModule = (n) =>
  n?.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' &&
  n.arguments[0]?.type === 'Literal' && typeof n.arguments[0].value === 'string' ? n.arguments[0].value : null;

// `cond ? require('crypto') : null` and `x || require('crypto')` still bind the module.
function unwrap(n) {
  if (n?.type === 'ConditionalExpression') return requiredModule(n.consequent) ? n.consequent : requiredModule(n.alternate) ? n.alternate : n;
  if (n?.type === 'LogicalExpression') return requiredModule(n.right) ? n.right : requiredModule(n.left) ? n.left : n;
  return n;
}
const KEY_AGREEMENT = new Set(['createECDH', 'createDiffieHellman', 'getDiffieHellman', 'createDiffieHellmanGroup']);

// `a.b.c` as ['a', 'b', 'c']; a `require('x')` at the root becomes 'require:x'.
function chain(n) {
  const out = [];
  while (n) {
    if (n.type === 'MemberExpression') {
      if (n.computed && n.property.type !== 'Literal') return null;
      out.unshift(n.computed ? String(n.property.value) : n.property.name);
      n = n.object;
    } else if (n.type === 'Identifier') { out.unshift(n.name); return out; }
    else if (n.type === 'ThisExpression') { out.unshift('this'); return out; }
    else if (requiredModule(n)) { out.unshift(`require:${requiredModule(n)}`); return out; }
    else if (n.type === 'ChainExpression') n = n.expression;
    else return null;
  }
  return null;
}

// What the file binds: names for modules, functions imported from them, and
// constants with literal values (strings, or objects of strings).
function bindings(ast) {
  const mod = new Map(); // local name -> module ('crypto', 'node-rsa', 'elliptic.ec', ...)
  const fn = new Map(); // local name -> { module, name }
  const consts = new Map(); // name -> string
  const objects = new Map(); // name -> { prop: string }
  const ecdh = new Set(); // names and properties holding crypto.createECDH(...) or a DH object
  const tlsOptions = []; // object literals with TLS key-exchange options
  const norm = (m) => (NODE_CRYPTO.has(m) ? 'crypto' : m);
  const agreement = (init) => {
    if (init?.type !== 'CallExpression') return false;
    const c = chain(init.callee);
    return Boolean(c && KEY_AGREEMENT.has(c[c.length - 1]));
  };
  walk(ast, (n) => {
    if (n.type === 'AssignmentExpression' && n.operator === '=') {
      const req = requiredModule(unwrap(n.right));
      if (req && n.left.type === 'Identifier') mod.set(n.left.name, norm(req));
      if (agreement(n.right)) {
        if (n.left.type === 'Identifier') ecdh.add(n.left.name);
        else if (n.left.type === 'MemberExpression' && !n.left.computed) ecdh.add(n.left.property.name);
      }
    }
    if (n.type === 'Property' && !n.computed && agreement(n.value)) ecdh.add(n.key.name ?? n.key.value);
    if (n.type === 'Property' && n.shorthand && n.value.type === 'Identifier' && ecdh.has(n.value.name)) ecdh.add(n.key.name);
    if (n.type === 'ObjectExpression') {
      const p = n.properties.find((q) => q.type === 'Property' && !q.computed && (q.key.name ?? q.key.value) === 'ecdhCurve');
      if (p) tlsOptions.push({ node: p, value: p.value });
    }
    if (n.type === 'ImportDeclaration') {
      const m = norm(n.source.value);
      for (const s of n.specifiers) {
        if (s.type === 'ImportSpecifier') fn.set(s.local.name, { module: m, name: s.imported.name ?? s.imported.value });
        else mod.set(s.local.name, m);
      }
    }
    if (n.type !== 'VariableDeclarator' || !n.init) return;
    const init = unwrap(n.init.type === 'AwaitExpression' ? n.init.argument : n.init);
    const req = requiredModule(init);
    const reqProp = init.type === 'MemberExpression' && requiredModule(init.object) && !init.computed
      ? `${norm(requiredModule(init.object))}.${init.property.name}` : null;
    if (n.id.type === 'Identifier') {
      if (req) mod.set(n.id.name, norm(req));
      else if (reqProp) {
        const [m, p] = reqProp.split('.');
        if (m === 'crypto' && p === 'webcrypto') mod.set(n.id.name, 'crypto.webcrypto');
        else if (m === 'crypto' && p in NODE_FNS) fn.set(n.id.name, { module: 'crypto', name: p });
        else mod.set(n.id.name, reqProp);
      } else if (init.type === 'Literal' && typeof init.value === 'string') { if (!consts.has(n.id.name)) consts.set(n.id.name, init.value); }
      else if (init.type === 'TemplateLiteral' && init.expressions.length === 0) consts.set(n.id.name, init.quasis[0].value.cooked);
      else if (init.type === 'ObjectExpression') {
        const o = {};
        for (const p of init.properties) {
          if (p.type === 'Property' && p.value.type === 'Literal' && typeof p.value.value === 'string') o[p.key.name ?? p.key.value] = p.value.value;
        }
        objects.set(n.id.name, o);
      } else if (agreement(init)) ecdh.add(n.id.name);
    } else if (n.id.type === 'ObjectPattern' && (req || init.type === 'Identifier')) {
      const m = req ? norm(req) : mod.get(init.name);
      if (!m) return;
      for (const p of n.id.properties) {
        if (p.type !== 'Property' || p.value.type !== 'Identifier') continue;
        const name = p.key.name ?? p.key.value;
        if (m === 'crypto' && name === 'subtle') mod.set(p.value.name, 'crypto.subtle');
        else if (m === 'crypto' && name === 'webcrypto') mod.set(p.value.name, 'crypto.webcrypto');
        else if (m === 'elliptic' && (name === 'ec' || name === 'eddsa')) mod.set(p.value.name, `elliptic.${name}`);
        else fn.set(p.value.name, { module: m, name });
      }
    }
  });
  return { mod, fn, consts, objects, ecdh, tlsOptions };
}

function resolve(arg, b) {
  if (!arg) return undefined;
  if (arg.type === 'Literal') return arg.value === null ? 'null' : typeof arg.value === 'string' ? arg.value : undefined;
  if (arg.type === 'TemplateLiteral' && arg.expressions.length === 0) return arg.quasis[0].value.cooked;
  if (arg.type === 'Identifier') return arg.name === 'undefined' ? 'null' : b.consts.get(arg.name);
  if (arg.type === 'MemberExpression' && !arg.computed && arg.object.type === 'Identifier') return b.objects.get(arg.object.name)?.[arg.property.name];
  if (arg.type === 'ObjectExpression') {
    for (const p of arg.properties) {
      const k = p.type === 'Property' && (p.key.name ?? p.key.value);
      if (k === 'name' || k === 'algorithm' || k === 'hash') {
        const v = resolve(p.value, b);
        if (v) return v;
      }
    }
  }
  return undefined;
}

const optionValue = (obj, keys, b) => {
  if (obj?.type !== 'ObjectExpression') return undefined;
  for (const p of obj.properties) {
    const k = p.type === 'Property' && (p.key.name ?? p.key.value);
    if (keys.includes(k)) {
      if (p.value.type === 'ArrayExpression') return p.value.elements.map((e) => resolve(e, b)).filter(Boolean).join(',') || undefined;
      return resolve(p.value, b);
    }
  }
  return undefined;
};

// One crypto call site, or null.
function classify(n, b) {
  const c = chain(n.callee);
  if (!c) return null;
  const root = c[0];
  const rootMod = root.startsWith('require:') ? (NODE_CRYPTO.has(root.slice(8)) ? 'crypto' : root.slice(8)) : b.mod.get(root);
  const last = c[c.length - 1];
  const args = n.arguments;

  // node:crypto, by module binding, by imported function, or by require('crypto').fn
  if (c.length === 1 && b.fn.has(root)) {
    const f = b.fn.get(root);
    if (f.module === 'crypto' && f.name in NODE_FNS) return site('node:crypto', f.name, NODE_FNS[f.name], args, b);
    if (f.module === 'jsonwebtoken' && (f.name === 'sign' || f.name === 'verify')) return jwtSite(f.name, args, b);
  }
  if (rootMod === 'crypto' && c.length === 2 && last in NODE_FNS) return site('node:crypto', last, NODE_FNS[last], args, b);
  const subtle =
    (rootMod === 'crypto' && c[1] === 'webcrypto' && c[2] === 'subtle' && c.length === 4) ||
    (rootMod === 'crypto' && c[1] === 'subtle' && c.length === 3) ||
    (rootMod === 'crypto.webcrypto' && c[1] === 'subtle' && c.length === 3) ||
    (rootMod === 'crypto.subtle' && c.length === 2) ||
    (!b.mod.has('crypto') && (root === 'crypto' || root === 'globalThis' || root === 'window' || root === 'self') && c.includes('subtle') && c[c.length - 2] === 'subtle');
  if (subtle && SUBTLE_FNS.has(last)) return { api: `subtle.${last}`, algorithm: resolve(args[0], b) };
  if (last === 'computeSecret' && c.length >= 2 && b.ecdh.has(c[c.length - 2])) return { api: 'ecdh.computeSecret' };
  if (c.slice(-2).join('.') === 'pkcs5.pbkdf2') return { api: 'forge.pkcs5.pbkdf2', algorithm: resolve(args[4], b) };

  // TLS options on tls/https calls
  if ((rootMod === 'tls' || rootMod === 'https') && TLS_FNS.has(last)) {
    const opt = args.find((a) => a.type === 'ObjectExpression' && a.properties.some((p) => TLS_OPTS.includes(p.key?.name)));
    if (opt) return { api: `${rootMod}.${last}`, algorithm: optionValue(opt, ['ecdhCurve'], b) ?? optionValue(opt, ['ciphers'], b) };
  }

  // Libraries
  const tail = c.slice(-3).join('.');
  if (/^pki\.rsa\.(generateKeyPair|setPublicKey|setPrivateKey)$/.test(tail)) return { api: `forge.${tail}`, algorithm: 'rsa' };
  if (c.length >= 3 && c[c.length - 3] === 'md' && last === 'create') return { api: `forge.md.${c[c.length - 2]}.create`, algorithm: c[c.length - 2] };
  if (n.type === 'NewExpression' && rootMod === 'node-rsa' && c.length === 1) return { api: 'node-rsa', algorithm: 'rsa' };
  if (rootMod === 'tweetnacl' && (c[1] === 'box' || c[1] === 'scalarMult' || c[1] === 'sign')) return { api: `tweetnacl.${c.slice(1).join('.')}`, algorithm: c[1] === 'sign' ? 'ed25519' : 'x25519' };
  if (n.type === 'NewExpression') {
    const ell = rootMod === 'elliptic.ec' || rootMod === 'elliptic.eddsa' ? rootMod : rootMod === 'elliptic' && (c[1] === 'ec' || c[1] === 'eddsa') ? `elliptic.${c[1]}` : null;
    if (ell) return { api: ell, algorithm: resolve(args[0], b) };
  }
  if (rootMod === 'jsonwebtoken' && c.length === 2 && (last === 'sign' || last === 'verify')) return jwtSite(last, args, b);
  if (rootMod === 'jws' && c.length === 2 && ['sign', 'verify', 'createSign', 'createVerify'].includes(last)) {
    return { api: `jws.${last}`, algorithm: optionValue(args[0], ['alg', 'algorithm'], b) ?? resolve(args[1], b) };
  }
  return null;
}

function site(lib, fnName, argIndex, args, b) {
  let algorithm;
  if (argIndex !== null && argIndex !== undefined) algorithm = resolve(args[argIndex], b);
  if (fnName === 'createDiffieHellman') algorithm = 'ffdh';
  // Only DH, ECDH, X25519 and X448: classical whatever the keys are.
  if (fnName === 'diffieHellman') algorithm = 'dh';
  // No digest: Node before 6 used SHA-1 (later versions throw).
  const cb = (a) => a && /Function/.test(a.type);
  if ((fnName === 'pbkdf2Sync' && args.length === 4) || (fnName === 'pbkdf2' && args.length === 5 && cb(args[4]))) algorithm = 'sha1';
  if (/^(generateKeyPair|generateKeyPairSync)$/.test(fnName) && algorithm === 'ec') {
    const curve = optionValue(args[1], ['namedCurve'], b);
    if (curve) algorithm = `ec:${curve}`;
  }
  return { api: fnName, algorithm, lib };
}

function jwtSite(fnName, args, b) {
  const opts = args.find((a, i) => i >= 2 && a.type === 'ObjectExpression');
  return { api: `jsonwebtoken.${fnName}`, algorithm: optionValue(opts, ['algorithm', 'algorithms'], b) };
}

// Every crypto call site in one file's source.
export function astScan(src, file) {
  let ast;
  try {
    ast = parseAny(src);
  } catch (err) {
    return { file, parsed: false, error: err.message, sites: [] };
  }
  const b = bindings(ast);
  const sites = [];
  walk(ast, (n) => {
    if (n.type !== 'CallExpression' && n.type !== 'NewExpression') return;
    const s = classify(n, b);
    if (s) sites.push({ file, line: n.loc.start.line, endLine: n.loc.end.line, ...s });
  });
  // A TLS options object is a crypto choice even before it reaches tls.connect().
  for (const t of b.tlsOptions) {
    if (sites.some((s) => s.line <= t.node.loc.start.line && t.node.loc.start.line <= s.endLine && s.api.startsWith('tls'))) continue;
    sites.push({ file, line: t.node.loc.start.line, endLine: t.node.loc.end.line, api: 'tls.options.ecdhCurve', algorithm: resolve(t.value, b) });
  }
  sites.sort((x, y) => x.line - y.line);
  return { file, parsed: true, sites };
}

export const parsable = (file) => /\.(m|c)?js$/.test(file);
