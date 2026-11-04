import { useLayoutEffect, useRef, useState } from 'react';
import { calm, finePointer, gsap } from '../lib/motion.js';

const STATUS_LABEL = { ok: 'meets policy', vulnerable: 'quantum-vulnerable', broken: 'classically broken', policy: 'below policy' };

function Level({ value }) {
  return (
    <span className="level" aria-label={`NIST quantum security level ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= value ? 'on' : ''} />
      ))}
    </span>
  );
}

// Cards tilt toward the pointer.
function tilt(e) {
  if (calm() || !finePointer()) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - 0.5;
  const py = (e.clientY - r.top) / r.height - 0.5;
  gsap.to(el, { rotateY: px * 10, rotateX: -py * 10, duration: 0.5, ease: 'power3.out', transformPerspective: 800 });
  el.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
  el.style.setProperty('--my', `${(py + 0.5) * 100}%`);
}
const untilt = (e) => gsap.to(e.currentTarget, { rotateY: 0, rotateX: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' });

export default function Inventory({ inventory }) {
  const [view, setView] = useState('now');
  const root = useRef(null);
  const assets = inventory[view];
  const ok = assets.filter((a) => a.status === 'ok').length;

  useLayoutEffect(() => {
    if (calm()) return undefined;
    const ctx = gsap.context(() => {
      gsap.from('.asset', { y: 50, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.05, scrollTrigger: { trigger: '.assets', start: 'top 85%' } });
    }, root);
    return () => ctx.revert();
  }, []);

  useLayoutEffect(() => {
    if (calm()) return;
    gsap.fromTo(root.current.querySelectorAll('.asset'), { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: 'power3.out', stagger: 0.03 });
  }, [view]);

  return (
    <section className="section" id="inventory" ref={root}>
      <div className="section-head">
        <span className="section-index">02 — Inventory</span>
        <h2 className="section-title">
          The crypto
          <br />
          <em>bill of materials.</em>
        </h2>
        <p className="section-sub">The CycloneDX 1.6 CBOM: every crypto asset the scanner found, with its NIST quantum security level and where it is used.</p>
      </div>

      <div className="inv-bar">
        <div className="toggle" role="tablist" aria-label="Which commit">
          {[
            ['before', 'Before migration'],
            ['now', 'Main now'],
          ].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>
        <p className="inv-sum">
          <b>{ok}</b> of {assets.length} meet policy
        </p>
      </div>

      <div className="assets">
        {assets.map((a) => {
          const files = new Set(a.occurrences.map((o) => o.file)).size;
          return (
            <article className={`asset st-${a.status}`} key={`${view}-${a.ref}`} onMouseMove={tilt} onMouseLeave={untilt}>
              <div className="asset-top">
                <span>{a.primitive}</span>
                <span className="asset-status">{STATUS_LABEL[a.status] ?? a.status}</span>
              </div>
              <h3 className="asset-name">{a.name}</h3>
              <div className="asset-meta">
                <Level value={a.nistQuantumLevel ?? 0} />
                <span>
                  {a.occurrences.length} use{a.occurrences.length === 1 ? '' : 's'} · {files} file{files === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="asset-occ">
                {a.occurrences.slice(0, 3).map((o, j) => (
                  <li key={j}>
                    <code>{o.file}:{o.line}</code>
                  </li>
                ))}
              </ul>
              {a.oid && <span className="asset-oid">OID {a.oid}</span>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
