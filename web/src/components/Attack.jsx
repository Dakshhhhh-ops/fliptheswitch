import { useEffect, useState } from 'react';
import attack from '../data/attack.json';
import { ATTACKS } from '../lib/attacks.js';

// Try to break it: the real signed approval and ship for F5 from live run 3's
// git, checked with ML-DSA-65 in the browser on every edit. attack.json is
// built from docs/live-run-3/origin.bundle by scripts/attack-data.mjs.
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let mlDsa = null;
const load = () => (mlDsa ??= import('@noble/post-quantum/ml-dsa.js').then((m) => m.ml_dsa65));

export default function Attack() {
  const [pick, setPick] = useState(1);
  const record = attack.signed[pick];
  const [text, setText] = useState(record.payload);
  const [key, setKey] = useState(record.who);
  const [result, setResult] = useState(null);
  const [tried, setTried] = useState(null);

  const choose = (i) => {
    setPick(i);
    setText(attack.signed[i].payload);
    setKey(attack.signed[i].who);
    setTried(null);
  };

  useEffect(() => {
    let live = true;
    setResult(null);
    const id = setTimeout(async () => {
      try {
        const v = await load();
        const ok = v.verify(b64(record.signature), new TextEncoder().encode(text), b64(attack.keys[key].key));
        if (live) setResult(ok);
      } catch {
        if (live) setResult(false);
      }
    }, 150);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [text, key, record]);

  const original = text === record.payload && key === record.who;
  const why = !original && (text !== record.payload ? 'one or more signed lines were changed' : `it was signed with ${attack.keys[record.who].name}, not ${attack.keys[key].name}`);

  return (
    <section className="section" id="break">
      <div className="section-head">
        <span className="section-index">Try to break it</span>
        <h2 className="section-title">
          Forge a ship.
          <br />
          <em>It won't take.</em>
        </h2>
        <p className="section-sub">
          The real signed {record.kind === 'ship' ? 'ship' : 'approval'} for F5 from live run 3's{' '}
          <a href={attack.source} target="_blank" rel="noreferrer">git</a>, checked with ML-DSA-65 in your browser on every edit.
          The origin's git gate runs the same check and refuses a push that fails it.
        </p>
      </div>

      <div className="ak">
        <div className="toggle" role="group" aria-label="Which signed record">
          {attack.signed.map((s, i) => (
            <button key={s.kind} type="button" aria-pressed={pick === i} className={pick === i ? 'active' : ''} onClick={() => choose(i)}>
              {s.kind === 'ship' ? 'The ship' : 'The approval'}
            </button>
          ))}
        </div>
        <p className="ak-what">{record.what}, signed by {attack.keys[record.who].name}.</p>

        <div className="ak-attacks" role="group" aria-label="Attacks to try">
          {ATTACKS[record.kind].map((a) => (
            <button key={a.label} type="button" className={tried === a.label ? 'on' : ''}
              onClick={() => {
                setText(a.edit ? a.edit(record.payload) : record.payload);
                setKey(a.key ?? record.who);
                setTried(a.label);
              }}>
              {a.label}
            </button>
          ))}
          <button type="button" className="ak-reset" onClick={() => { setText(record.payload); setKey(record.who); setTried(null); }}>
            Restore the original
          </button>
        </div>

        <label className="ak-label" htmlFor="ak-text">Signed lines (edit anything)</label>
        <textarea id="ak-text" className="ak-text" rows={record.payload.split('\n').length} spellCheck={false} value={text}
          onChange={(e) => { setText(e.target.value); setTried(null); }} />
        <p className="ak-sig">
          Desk-Signature: ML-DSA-65 <code>{record.signature.slice(0, 32)}…</code> ({b64(record.signature).length} bytes) · checked with{' '}
          <a href={attack.keys[key].href} target="_blank" rel="noreferrer">{attack.keys[key].name}</a>
        </p>

        <p className={`ak-result ${result === null ? '' : result ? 'ok' : 'no'}`} role="status" aria-live="polite">
          {result === null && 'Checking…'}
          {result === true && `Valid: an ML-DSA-65 signature by ${attack.keys[key].name}. ${original ? 'This is the record git holds.' : ''}`}
          {result === false && `Refused: the signature doesn't match, because ${why || 'the record changed'}. Main would not take this.`}
        </p>
      </div>
    </section>
  );
}
