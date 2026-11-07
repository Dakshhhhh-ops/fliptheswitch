import { useLayoutEffect, useRef, useState } from 'react';
import { Flip } from 'gsap/Flip';
import { calm, gsap } from '../lib/motion.js';

gsap.registerPlugin(Flip);

const LEVELS = [
  { n: 0, label: 'Broken by Shor', note: 'RSA, elliptic curves, SHA-1' },
  { n: 1, label: 'Level 1', note: 'AES-128 equivalent' },
  { n: 2, label: 'Level 2', note: 'SHA-256 collisions' },
  { n: 3, label: 'Level 3', note: 'AES-192, ML-KEM-768' },
  { n: 4, label: 'Level 4', note: 'SHA-384' },
  { n: 5, label: 'Level 5', note: 'AES-256' },
];
const STATUS = { ok: 'meets policy', vulnerable: 'quantum-vulnerable', broken: 'classically broken', policy: 'below policy', review: 'chosen at runtime' };

// Every crypto asset on a scale of NIST quantum security levels. Switching
// between the first commit and main moves each asset to where it now sits.
export default function Spectrum({ inventory }) {
  const [view, setView] = useState('now');
  const root = useRef(null);
  const flip = useRef(null);
  const assets = inventory[view];

  const change = (next) => {
    if (next === view) return;
    if (!calm()) flip.current = Flip.getState(root.current.querySelectorAll('.chip'));
    setView(next);
  };

  useLayoutEffect(() => {
    if (!flip.current) return;
    Flip.from(flip.current, {
      duration: 1.1,
      ease: 'expo.inOut',
      stagger: 0.03,
      absolute: true,
      onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.8, delay: 0.4 }),
      onLeave: (els) => gsap.to(els, { autoAlpha: 0, scale: 0.6, duration: 0.5 }),
    });
    flip.current = null;
  }, [view]);

  const ok = assets.filter((a) => a.status === 'ok').length;
  return (
    <section className="section" id="spectrum" ref={root}>
      <div className="section-head">
        <span className="section-index">09 — Inventory</span>
        <h2 className="section-title">
          Where every key
          <br />
          <em>stands.</em>
        </h2>
        <p className="section-sub">Each crypto asset in the CycloneDX CBOM, placed by its NIST quantum security level. Switch commits to watch them move.</p>
      </div>

      <div className="sp-bar">
        <div className="toggle" role="group" aria-label="Which commit">
          {[['before', 'First commit'], ['now', 'Main now']].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={view === k} className={view === k ? 'active' : ''} onClick={() => change(k)} data-cursor="Switch">
              {label}
            </button>
          ))}
        </div>
        <p className="inv-sum"><b>{ok}</b> of {assets.length} meet policy</p>
      </div>

      <div className="spectrum">
        {LEVELS.map((lv) => (
          <div className={`sp-col lv-${lv.n}`} key={lv.n}>
            <div className="sp-chips">
              {assets
                .filter((a) => (a.nistQuantumLevel ?? 0) === lv.n)
                .map((a) => (
                  <div className={`chip st-${a.status}`} key={a.name} data-flip-id={a.name} title={`${a.name}: ${STATUS[a.status]}`}>
                    <span className="chip-name">{a.name}</span>
                    <span className="chip-meta">{a.primitive} · {a.occurrences.length} use{a.occurrences.length === 1 ? '' : 's'}</span>
                  </div>
                ))}
            </div>
            <div className="sp-axis">
              <b>{lv.n}</b>
              <span>{lv.label}</span>
              <small>{lv.note}</small>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
