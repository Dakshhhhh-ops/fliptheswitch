import { useEffect, useMemo, useRef, useState } from 'react';
import replay from '../data/replay.json';
import { isStatic } from '../lib/motion.js';

// A replay of live run 3: every message and git push, in order, at its real
// time, sped up. replay.json is built from docs/live-run-3/chat-log.md by
// scripts/replay-data.mjs. The board below the controls is read from the git
// events only: a pqc/ branch puts a finding in review, a Ship merge ships it,
// an Accept risk commit records a risk.
const EVENTS = replay.events;
const END = EVENTS[EVENTS.length - 1].t;
const IDS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
const SPEEDS = [60, 300, 1200];

function boardAt(n) {
  const b = Object.fromEntries(IDS.map((id) => [id, { state: 'open', risk: false }]));
  for (const e of EVENTS.slice(0, n)) {
    if (e.kind !== 'git') continue;
    const branch = /^heads\/pqc\/f(\d)/.exec(e.room);
    const ship = /^\w+ Ship (F\d):/.exec(e.text);
    const risk = /^\w+ Accept risk (F\d):/.exec(e.text);
    if (branch && b[`F${branch[1]}`].state === 'open') b[`F${branch[1]}`].state = 'in review';
    if (ship) b[ship[1]].state = 'shipped';
    if (risk) b[risk[1]].risk = true;
  }
  return b;
}

const clock = (t) => {
  const s = 20638 + t; // 05:43:58 UTC, the run's first event
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
};

export default function Replay() {
  const still = isStatic();
  const [t, setT] = useState(still ? END : 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(300);
  const last = useRef(null);
  const feed = useRef(null);

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    const tick = (now) => {
      if (last.current != null) {
        setT((x) => {
          const next = Math.min(END, x + ((now - last.current) / 1000) * speed);
          if (next >= END) setPlaying(false);
          return next;
        });
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [playing, speed]);

  const shown = useMemo(() => EVENTS.filter((e) => e.t <= t).length, [t]);
  const board = useMemo(() => boardAt(shown), [shown]);
  const recent = EVENTS.slice(Math.max(0, shown - 7), shown);
  const shippedCount = IDS.filter((id) => board[id].state === 'shipped').length;

  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [shown]);

  const toggle = () => {
    if (!playing && t >= END) setT(0);
    setPlaying((p) => !p);
  };

  return (
    <section className="section" id="replay">
      <div className="section-head">
        <span className="section-index">05 — Replay</span>
        <h2 className="section-title">
          Four hours,
          <br />
          <em>played back.</em>
        </h2>
        <p className="section-sub">
          Every message and git push from live run 3, in order and at its real time, from the run's{' '}
          <a href={replay.source} target="_blank" rel="noreferrer">chat log</a>. Not a video edit: the board below moves only on
          what git recorded.
        </p>
      </div>

      <div className="rp">
        <div className="rp-bar">
          <button type="button" className="rp-play" onClick={toggle} aria-pressed={playing}>
            {playing ? 'Pause' : t >= END ? 'Replay' : 'Play'}
          </button>
          <div className="toggle" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button key={s} type="button" aria-pressed={speed === s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <span className="rp-clock" aria-live="off">{clock(Math.round(t))} UTC</span>
        </div>
        <input className="rp-scrub" type="range" min={0} max={END} step={1} value={Math.round(t)}
          aria-label="Position in the run" aria-valuetext={`${clock(Math.round(t))} UTC, ${shown} of ${EVENTS.length} events`}
          onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} />

        <ol className="rp-board" aria-label={`Board: ${shippedCount} of 6 shipped`}>
          {IDS.map((id) => (
            <li key={id} className={`rp-chip st-${board[id].state.replace(' ', '-')}`}>
              <b>{id}</b> {board[id].state}{board[id].risk ? ' · risk on record' : ''}
            </li>
          ))}
        </ol>

        <ol className="rp-feed" ref={feed} role="log" aria-live="off">
          {recent.length === 0 && <li className="rp-empty">Press Play: the run starts at 05:43 UTC with the planted code on main.</li>}
          {recent.map((e) => (
            <li key={e.line} className={`rp-msg rm-${e.kind === 'switch' ? 'agent' : e.kind}`}>
              <span className="rp-meta">
                <b>{e.name}</b> <span>{e.room}</span> <a href={`${replay.source}?plain=1#L${e.line}`} target="_blank" rel="noreferrer">{e.at.slice(0, 8)}</a>
              </span>
              <span className="rp-text">{e.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
