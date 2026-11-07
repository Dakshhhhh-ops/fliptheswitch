import { useMemo, useState } from 'react';
import { findings, ignoresFile, scanSource } from '../../../tools/cbom-scan.mjs';
import { DEFAULTS, lifetimeIn, verdict } from '../../../tools/mosca.mjs';

// Scan your code: the same scanner as `npm run scan`, run on whatever the
// visitor pastes, in their browser. Nothing is sent anywhere.
const SAMPLE = `import crypto from 'node:crypto';

// Card numbers are kept for 7 years after the account closes.
export function sealCard(pan, publicKey) {
  return crypto.publicEncrypt({ key: publicKey, oaepHash: 'sha256' }, Buffer.from(pan));
}

export function signWebhook(body, privateKey) {
  return crypto.sign('sha256', Buffer.from(body), privateKey); // an EC P-256 key
}

export const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

export function receiptChecksum(receipt) {
  return crypto.createHash('sha1').update(receipt).digest('hex');
}

export function newSessionKey() {
  return crypto.generateKeyPairSync('ml-kem-768');
}
`;

const LIFETIMES = [
  { v: 'auto', label: 'what the code comments say' },
  { v: '0.1', label: 'about a month' },
  { v: '1', label: '1 year' },
  { v: '5', label: '5 years' },
  { v: '10', label: '10 years' },
  { v: '25', label: '25 years' },
  { v: 'inf', label: 'forever' },
];

// The first comment in the code that says how long something is kept.
function lifetimeFromComments(src) {
  for (const [i, line] of src.split('\n').entries()) {
    const m = /(?:\/\/|\/\*+|^\s*\*)\s?(.*)$/.exec(line);
    const life = m && m[1].trim() ? lifetimeIn(m[1]) : null;
    if (life) return { ...life, source: `line ${i + 1}` };
  }
  return null;
}

const STATUS = {
  vulnerable: 'quantum-vulnerable',
  broken: 'broken today',
  policy: 'policy',
  review: 'needs review',
  'legacy-read': 'kept: legacy read',
  'dual-signed': 'kept: dual-signed',
};

export default function Scan() {
  const [src, setSrc] = useState(SAMPLE);
  const [name, setName] = useState('payments.js');
  const [life, setLife] = useState('auto');
  const [ran, setRan] = useState(SAMPLE);

  const result = useMemo(() => {
    const file = /\.[cm]?[jt]sx?$/.test(name) ? name : `${name || 'pasted'}.js`;
    if (ignoresFile(ran)) return { file, found: [], hits: [], ignored: true };
    const hits = scanSource(ran, file);
    const lifetime =
      life === 'auto' ? lifetimeFromComments(ran) : { years: life === 'inf' ? Infinity : Number(life), said: life === 'inf' ? 'forever' : `${life} years`, source: 'you' };
    const found = findings(hits).map((f) => ({ ...f, mosca: verdict(f, lifetime) }));
    const safe = hits.filter((h) => /^ml-(kem|dsa)-|x25519-hybrid/.test(h.key)).length;
    return { file, found, hits, lifetime, safe };
  }, [ran, name, life]);

  const flagged = new Map();
  for (const f of result.found) for (const l of f.lines) flagged.set(l, f.status === 'broken' || f.mosca.verdict === 'late' ? 'hot' : 'warn');
  const lines = ran.split('\n');
  const late = result.found.filter((f) => f.mosca.verdict === 'late').length;
  const changed = src !== ran;

  return (
    <section className="section" id="scan">
      <div className="section-head">
        <span className="section-index">02 — Scan your code</span>
        <h2 className="section-title">
          Paste yours.
          <br />
          <em>It runs here.</em>
        </h2>
        <p className="section-sub">
          The same scanner the scout ran in every live run (<code>npm run scan</code>), on JavaScript or TypeScript you paste.
          It runs in your browser: nothing is uploaded. Each finding is ranked by Mosca's rule against a {DEFAULTS.qdayYear} quantum
          computer and a {DEFAULTS.migrationYears}-year migration.
        </p>
      </div>

      <div className="sc">
        <div className="sc-in">
          <div className="sc-bar">
            <label className="sc-field">
              <span>File</span>
              <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} aria-label="File name" />
            </label>
            <div className="sc-actions">
              <button type="button" className="sc-ghost" onClick={() => { setSrc(SAMPLE); setRan(SAMPLE); setName('payments.js'); }}>
                Sample
              </button>
              <button type="button" className="sc-ghost" onClick={() => { setSrc(''); setRan(''); }}>
                Clear
              </button>
              <button type="button" className={`rp-play ${changed ? 'sc-due' : ''}`} onClick={() => setRan(src)}>
                Scan
              </button>
            </div>
          </div>
          <textarea
            className="sc-code"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') setRan(src);
            }}
            spellCheck={false}
            aria-label="Code to scan"
            placeholder="Paste JavaScript or TypeScript here, then press Scan (Ctrl+Enter)."
          />
          <label className="sc-field sc-life">
            <span>Data must stay secret for</span>
            <select value={life} onChange={(e) => setLife(e.target.value)}>
              {LIFETIMES.map((l) => (
                <option key={l.v} value={l.v}>{l.label}</option>
              ))}
            </select>
            {life === 'auto' && (
              <em>{result.lifetime ? `${result.lifetime.said}, from ${result.lifetime.source}` : 'no comment says, so the desk would ask the engineer'}</em>
            )}
          </label>
        </div>

        <div className="sc-out" aria-live="polite">
          <p className="sc-total">
            {result.ignored ? (
              'This file opts out with a cbom-scan: ignore-file comment.'
            ) : result.found.length === 0 ? (
              <><b className="ok">Nothing to migrate.</b> {result.safe ? `${result.safe} post-quantum use${result.safe === 1 ? '' : 's'} found.` : 'No crypto calls found.'}</>
            ) : (
              <>
                <b>{result.found.length}</b> finding{result.found.length === 1 ? '' : 's'} in {result.file}
                {late ? <>, <b className="hot">{late} already late</b></> : null}
                {result.safe ? `, ${result.safe} already post-quantum` : ''}
              </>
            )}
          </p>

          <ol className="sc-list">
            {result.found.map((f) => (
              <li key={f.ref} className={`sc-f v-${f.mosca.verdict.replace(' ', '-')}`}>
                <div className="sc-f-head">
                  <b>{f.id}</b>
                  <span className="sc-algo">{f.algorithm}</span>
                  <span className="sc-pri">{f.priority}</span>
                  <span className="sc-st">{STATUS[f.status] ?? f.status}</span>
                  <span className="sc-at">line {f.lines.join(', ')}</span>
                </div>
                <p className="sc-mosca">{f.mosca.label}</p>
                <p className="sc-why">{f.why}</p>
                <p className="sc-fix"><span>Fix</span> {f.fix}</p>
              </li>
            ))}
          </ol>

          {result.found.length > 0 && (
            <pre className="sc-view" aria-label="Your code with flagged lines">
              {lines.map((l, i) => (
                <span key={i} className={flagged.has(i + 1) ? `sc-l sc-${flagged.get(i + 1)}` : 'sc-l'}>
                  <i>{i + 1}</i>
                  {l || ' '}
                  {'\n'}
                </span>
              ))}
            </pre>
          )}

          <p className="sc-note">
            Fixed rules, not a parser: 100% precision and 94% recall on{' '}
            <a href="https://github.com/Dakshhhhh-ops/fliptheswitch/blob/main/docs/SCANNER.md#how-accurate-it-is" target="_blank" rel="noreferrer">
              a set we labelled
            </a>
            . A scanner only finds it. On the desk, the engineer in each finding's room says what's safe to change.
          </p>
        </div>
      </div>
    </section>
  );
}
