import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Code from './Code.jsx';
import { calm, finePointer, gsap } from '../lib/motion.js';
import { slug } from '../useDesk.js';

// Drag the divider to compare the file before the migration with main now.
function Compare({ row }) {
  const [split, setSplit] = useState(50);
  const box = useRef(null);
  const changed = row.code.now != null && row.code.now !== row.code.before;
  const drag = (e) => {
    const r = box.current.getBoundingClientRect();
    setSplit(Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100)));
  };
  if (!changed) {
    return (
      <div className="compare single">
        <Code source={row.code.before} marks={row.lines} />
        <span className="compare-note">{row.state === 'accepted risk' ? 'Accepted as a risk: this code stays.' : 'No fix on main yet. This is the code as it is.'}</span>
      </div>
    );
  }
  return (
    <div
      className="compare"
      ref={box}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag(e);
      }}
      onPointerMove={(e) => e.buttons && drag(e)}
      data-cursor="Drag"
    >
      <div className="compare-pane before" style={{ width: `${split}%` }}>
        <span className="compare-label">Before</span>
        <Code source={row.code.before} marks={row.lines} />
      </div>
      <div className="compare-pane after" style={{ width: `${100 - split}%` }}>
        <span className="compare-label">Main now</span>
        <Code source={row.code.now} />
      </div>
      <span className="compare-bar" style={{ left: `${split}%` }} role="slider" aria-label="Before and after" aria-valuenow={Math.round(split)} tabIndex={0}
        onKeyDown={(e) => setSplit((s) => Math.max(4, Math.min(96, s + (e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0))))} />
    </div>
  );
}

function Evidence({ row }) {
  if (row.ship) return <>Merged <code>{row.ship.sha}</code> on {row.ship.date}. {row.stillFlagged && 'The classical algorithm stays beside the new one on purpose.'}</>;
  if (row.risk) return <>{row.risk}</>;
  if (row.branch) return <>Fix under review on <code>{row.branch}</code>.</>;
  return <>Room open in Switch. Nothing on the origin yet.</>;
}

function Drawer({ row, onClose }) {
  const panel = useRef(null);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    panel.current?.focus();
    if (!calm()) gsap.fromTo(panel.current, { xPercent: 100 }, { xPercent: 0, duration: 0.8, ease: 'expo.out' });
    return () => window.removeEventListener('keydown', esc);
  }, [row.id]);
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${row.id} ${row.algorithm}`} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <span className="drawer-id">{row.id}</span>
          <div>
            <h3>{row.algorithm}</h3>
            <code>{row.file}:{row.line} · {row.priority} · {row.status}</code>
          </div>
          <span className={`pill s-${slug(row.state)}`}>{row.state}</span>
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <Compare row={row} />
        <dl className="drawer-body">
          <div><dt>Why</dt><dd>{row.why}</dd></div>
          <div><dt>Planned fix</dt><dd>{row.fix}</dd></div>
          <div><dt>Evidence</dt><dd><Evidence row={row} /></dd></div>
        </dl>
      </aside>
    </div>
  );
}

// An index of findings. Hovering one shows its real code beside the cursor;
// opening one shows before and after.
export default function Findings({ rows }) {
  const [hover, setHover] = useState(null);
  // `?open=F1` opens a finding directly, so a link can point at one.
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('open'));
  const preview = useRef(null);
  const root = useRef(null);
  const pos = useRef(null);

  useLayoutEffect(() => {
    if (!finePointer() || calm()) return undefined;
    const x = gsap.quickTo(preview.current, 'x', { duration: 0.5, ease: 'power3' });
    const y = gsap.quickTo(preview.current, 'y', { duration: 0.5, ease: 'power3' });
    pos.current = { x, y };
    const ctx = gsap.context(() => {
      gsap.from('.fx-row', { yPercent: 60, autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.06, scrollTrigger: { trigger: '.fx-list', start: 'top 80%' } });
    }, root);
    return () => ctx.revert();
  }, []);

  const current = rows.find((r) => r.id === hover);
  const openRow = rows.find((r) => r.id === open);

  return (
    <section className="section" id="findings" ref={root}>
      <div className="section-head">
        <span className="section-index">02 — Findings</span>
        <h2 className="section-title">
          Six lines of code,
          <br />
          <em>six rooms.</em>
        </h2>
        <p className="section-sub">Each finding is worked in its own Switch room with the engineer who owns the code. Hover for the line itself; open one to compare it with main.</p>
      </div>

      <ol className="fx-list" onMouseMove={(e) => pos.current && (pos.current.x(e.clientX + 24), pos.current.y(e.clientY - 120))} onMouseLeave={() => setHover(null)}>
        {rows.map((r) => (
          <li key={r.id} className={`fx-row st-${slug(r.state)} ${hover && hover !== r.id ? 'dim' : ''}`}>
            <button onMouseEnter={() => setHover(r.id)} onFocus={() => setHover(r.id)} onClick={() => setOpen(r.id)} data-cursor="Open">
              <span className="fx-id">{r.id}</span>
              <span className="fx-algo">{r.algorithm}</span>
              <code className="fx-where">{r.file}:{r.line}</code>
              <span className={`pill s-${slug(r.state)}`}>{r.state}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className={`fx-preview ${current && finePointer() && !calm() ? 'on' : ''}`} ref={preview} aria-hidden="true">
        {current && (
          <>
            <span className="fx-preview-head">{current.file}</span>
            <Code source={current.code.before} from={current.line - 3} to={current.line + 6} marks={current.lines} />
          </>
        )}
      </div>

      {openRow && <Drawer row={openRow} onClose={() => setOpen(null)} />}
    </section>
  );
}
