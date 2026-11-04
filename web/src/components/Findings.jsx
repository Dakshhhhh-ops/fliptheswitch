import { useState } from 'react';
import { Reveal } from './motion.jsx';
import { STATES, slug } from '../useDesk.js';

function Evidence({ row }) {
  if (row.ship) {
    return (
      <p>
        Merged <code>{row.ship.sha}</code> on {row.ship.date}: {row.ship.subject}
        {row.stillFlagged && <span className="note"> Still in the scan on purpose: the classical algorithm is kept beside the new one.</span>}
      </p>
    );
  }
  if (row.risk) return <p>{row.risk}</p>;
  if (row.branch) return <p>Fix under review on <code>{row.branch}</code>.</p>;
  return <p>Not started. The scout opened its room; nothing is on the origin yet.</p>;
}

export default function Findings({ rows }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const shown = filter === 'all' ? rows : rows.filter((r) => r.state === filter);

  return (
    <section className="section" id="findings">
      <Reveal className="section-head">
        <span className="section-index">01</span>
        <h2>Findings</h2>
        <p>Every finding from the scan of the first commit, and where it stands now.</p>
      </Reveal>

      <div className="filters" role="tablist" aria-label="Filter findings">
        {['all', ...STATES].map((s) => {
          const n = s === 'all' ? rows.length : rows.filter((r) => r.state === s).length;
          return (
            <button key={s} role="tab" aria-selected={filter === s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
              {s} <span>{n}</span>
            </button>
          );
        })}
      </div>

      <ol className="findings">
        {shown.map((r, i) => {
          const isOpen = open === r.id;
          return (
            <Reveal as="li" key={r.id} delay={i * 50} className={`finding ${isOpen ? 'expanded' : ''}`}>
              <button className="finding-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                <span className="f-id">{r.id}</span>
                <span className="f-main">
                  <span className="f-algo">{r.algorithm}</span>
                  <code className="f-where">
                    {r.file}:{r.line}
                  </code>
                </span>
                <span className={`pri pri-${r.priority.toLowerCase()}`}>{r.priority}</span>
                <span className={`pill s-${slug(r.state)}`}>{r.state}</span>
                <span className="chev" aria-hidden="true">+</span>
              </button>
              <div className="finding-body" hidden={!isOpen}>
                <div>
                  <h3>Why it matters</h3>
                  <p>{r.why}</p>
                  <p className="tag">{r.status}</p>
                </div>
                <div>
                  <h3>Planned fix</h3>
                  <p>{r.fix}</p>
                </div>
                <div>
                  <h3>Evidence</h3>
                  <Evidence row={r} />
                </div>
              </div>
            </Reveal>
          );
        })}
      </ol>
    </section>
  );
}
