import { useLayoutEffect, useRef } from 'react';
import room from '../data/room.json';
import { revealOnView } from '../lib/motion.js';

// Three moments from live run 3's chat, word for word. room.json is built from
// docs/live-run-3/chat-log.md by scripts/room-moments.mjs.
function Line({ l }) {
  return (
    <li className={`rm-line rm-${l.kind}`}>
      <div className="rm-meta">
        <span className="rm-name">{l.name}</span>
        <span className="rm-role">{l.role}</span>
        {l.finding && <span className="rm-finding">{l.finding}</span>}
        <a className="rm-time" href={l.href} target="_blank" rel="noreferrer" aria-label={`${l.at} in ${l.room}, line ${l.line} of the chat log`}>
          {l.room} · {l.at.slice(0, 8)}
        </a>
      </div>
      <p className="rm-text">{l.text}</p>
      {l.note && <p className="rm-note">{l.note}</p>}
    </li>
  );
}

export default function Room() {
  const root = useRef(null);
  useLayoutEffect(() => {
    const grid = root.current.querySelector('.rm-grid');
    return revealOnView(grid, grid.querySelectorAll('.rm-card'), { yPercent: 20, autoAlpha: 0 });
  }, []);

  return (
    <section className="section" id="room" ref={root}>
      <div className="section-head">
        <span className="section-index">04 — In the room</span>
        <h2 className="section-title">
          People decide
          <br />
          <em>what's safe to change.</em>
        </h2>
        <p className="section-sub">
          {room.label}, word for word from the run's <a href={room.source} target="_blank" rel="noreferrer">chat log</a>, times in UTC.
          The engineer and the security lead change the fixes; Switch decides who may approve and who may ship.
        </p>
      </div>

      <div className="rm-grid">
        {room.moments.map((m) => (
          <article className="rm-card" key={m.id} aria-labelledby={`rm-${m.id}`}>
            <h3 className="rm-title" id={`rm-${m.id}`}>{m.title}</h3>
            <p className="rm-sub">{m.sub}</p>
            <ol className="rm-log">
              {m.lines.map((l) => <Line key={l.line} l={l} />)}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
