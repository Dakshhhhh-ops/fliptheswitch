import { useState } from 'react';
import { Reveal } from './motion.jsx';

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

export default function Inventory({ inventory }) {
  const [view, setView] = useState('now');
  const assets = inventory[view];
  const ok = assets.filter((a) => a.status === 'ok').length;

  return (
    <section className="section" id="inventory">
      <Reveal className="section-head">
        <span className="section-index">02</span>
        <h2>Inventory</h2>
        <p>The CycloneDX CBOM: every crypto asset the scanner found, with its NIST quantum security level.</p>
      </Reveal>

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
          <b>{ok}</b> of {assets.length} assets meet policy
        </p>
      </div>

      <div className="assets">
        {assets.map((a, i) => (
          <Reveal className={`asset st-${a.status}`} key={a.ref} delay={i * 40}>
            <div className="asset-top">
              <span className="asset-prim">{a.primitive}</span>
              <span className="asset-status">{STATUS_LABEL[a.status] ?? a.status}</span>
            </div>
            <h3 className="asset-name">{a.name}</h3>
            <div className="asset-meta">
              <Level value={a.nistQuantumLevel ?? 0} />
              <span>
                {a.occurrences.length} use{a.occurrences.length === 1 ? '' : 's'} · {new Set(a.occurrences.map((o) => o.file)).size} file
                {new Set(a.occurrences.map((o) => o.file)).size === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="asset-occ">
              {a.occurrences.slice(0, 3).map((o, j) => (
                <li key={j}>
                  <code>
                    {o.file}:{o.line}
                  </code>
                </li>
              ))}
            </ul>
            {a.oid && <span className="asset-oid">OID {a.oid}</span>}
          </Reveal>
        ))}
      </div>
    </section>
  );
}
