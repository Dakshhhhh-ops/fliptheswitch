import { useLayoutEffect, useRef } from 'react';
import room from '../data/room.json';
import { revealOnView } from '../lib/motion.js';

// For each finding: the scanner's own suggestion, what people and the reviewer
// added in the room (word for word from live run 3's chat log, via
// scripts/room-moments.mjs), and what shipped (the merge on main).
const VERDICT = { late: 'm-late', 'on time': 'm-on-time', ask: 'm-ask' };

function shipped(row) {
  if (row.state !== 'shipped' || !row.ship) return null;
  const s = row.ship.subject.replace(/^F\d: /, '');
  const cut = s.indexOf(' (approved');
  return cut > 0 ? s.slice(0, cut) : s;
}

export default function Added({ rows }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    const list = root.current.querySelector('.ad-list');
    return revealOnView(list, list.querySelectorAll('.ad-row'), { yPercent: 12, autoAlpha: 0 });
  }, []);

  return (
    <section className="section" id="added" ref={root}>
      <div className="section-head">
        <span className="section-index">02 — What people added</span>
        <h2 className="section-title">
          What the scanner
          <br />
          <em>couldn't know.</em>
        </h2>
        <p className="section-sub">
          Each finding as the scanner saw it, then what the engineer, the security lead and the reviewer added in the room, word
          for word from live run 3's <a href={room.source} target="_blank" rel="noreferrer">chat log</a>, and what shipped.
        </p>
      </div>

      <ol className="ad-list">
        {rows.map((r) => {
          const lines = room.added[r.id] ?? [];
          const ship = shipped(r);
          return (
            <li className="ad-row" key={r.id}>
              <div className="ad-head">
                <span className="ad-id">{r.id}</span>
                <span className="ad-algo">{r.algorithm}</span>
                <span className={`ad-late ${VERDICT[r.mosca.verdict] ?? ''}`}>{r.mosca.label}</span>
              </div>
              <div className="ad-cols">
                <div className="ad-col">
                  <span className="ad-label">The scanner suggested</span>
                  <p className="ad-fix">{r.fix}</p>
                </div>
                <div className="ad-col ad-people">
                  <span className="ad-label">People and the reviewer added</span>
                  <ul>
                    {lines.map((l) => (
                      <li key={l.line} className={`ad-say rm-${l.kind}`}>
                        <span className="ad-who">
                          {l.name} <span className="ad-role">{l.role}</span>
                          <a href={l.href} target="_blank" rel="noreferrer" aria-label={`${l.at}, line ${l.line} of the chat log`}>{l.at.slice(0, 5)}</a>
                        </span>
                        <q>{l.text}</q>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="ad-col">
                  <span className="ad-label">What shipped</span>
                  {ship ? (
                    <p className="ad-ship">
                      {ship} <code>{r.ship.sha}</code>
                    </p>
                  ) : (
                    <p className="ad-ship ad-wait">Not shipped: {r.state}.</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
