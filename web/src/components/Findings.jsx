import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Code from './Code.jsx';
import { calm, finePointer, gsap, lockScroll, revealOnView } from '../lib/motion.js';
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
      <div className="compare single" tabIndex={0} role="region" aria-label={`Code in ${row.file}`}>
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
      <span className="compare-bar" style={{ left: `${split}%` }} role="slider" tabIndex={0}
        aria-label="Divider between the code before and main now" aria-valuemin={4} aria-valuemax={96} aria-valuenow={Math.round(split)}
        aria-valuetext={`${Math.round(split)}% before, ${100 - Math.round(split)}% main now`}
        onKeyDown={(e) => {
          const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, Home: -100, End: 100 }[e.key];
          if (step === undefined) return;
          e.preventDefault();
          setSplit((s) => Math.max(4, Math.min(96, s + step)));
        }} />
    </div>
  );
}

// Mosca's rule: data lifetime + migration time against years until Q-Day.
function Mosca({ m }) {
  const life = m.lifetime;
  const sums = life && (m.clock === 'secrecy' || m.clock === 'trust');
  const x = life ? (life.years === null || life.years > 1e6 ? '∞' : Math.round(life.years * 10) / 10) : null;
  return (
    <>
      <strong className={`m-${slug(m.verdict)}`}>{m.label}.</strong>{' '}
      {sums && (
        <>
          {x} {m.clock === 'secrecy' ? 'years secret' : 'years trusted'} + {m.migrationYears} to migrate, against {m.yearsLeft} until {m.qdayYear}.{' '}
          From <code>{life.source}</code>: “{life.quote}”
        </>
      )}
      {m.verdict === 'ask' && <>Nothing in the code says how long this data lives, so the scout asks the engineer instead of guessing.</>}
    </>
  );
}

function Evidence({ row }) {
  if (row.ship) return <>Merged <code>{row.ship.sha}</code> on {row.ship.date}. {row.stillFlagged && 'The classical algorithm stays beside the new one on purpose.'}</>;
  if (row.risk) return <>{row.risk}</>;
  if (row.branch) return <>Fix under review on <code>{row.branch}</code>.</>;
  return <>Room open in Switch. Nothing on the origin yet.</>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Drawer({ row, onClose }) {
  const panel = useRef(null);
  const close = useRef(null);
  useEffect(() => {
    const keys = (e) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panel.current) return undefined;
      // Keep Tab inside the dialog while it is open.
      const els = [...panel.current.querySelectorAll(FOCUSABLE)];
      if (els.length === 0) return undefined;
      const first = els[0];
      const last = els[els.length - 1];
      const inside = panel.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
      return undefined;
    };
    window.addEventListener('keydown', keys);
    close.current?.focus({ preventScroll: true });
    if (!calm()) gsap.fromTo(panel.current, { xPercent: 100 }, { xPercent: 0, duration: 0.8, ease: 'expo.out' });
    return () => window.removeEventListener('keydown', keys);
  }, [row.id]);
  useEffect(() => {
    lockScroll(true);
    return () => lockScroll(false);
  }, []);
  return (
    <div className="drawer-wrap" onClick={onClose} data-lenis-prevent>
      <aside className="drawer" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="drawer-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <span className="drawer-id">{row.id}</span>
          <div>
            <h3 id="drawer-title">
              <span className="sr-only">{row.id}: </span>
              {row.algorithm}
            </h3>
            <code>{row.file}:{row.line} · {row.priority} · {row.status}</code>
          </div>
          <span className={`pill s-${slug(row.state)}`}>{row.state}</span>
          <button className="drawer-close" ref={close} onClick={onClose} aria-label="Close">×</button>
        </header>
        <Compare row={row} />
        <dl className="drawer-body">
          {row.mosca && <div><dt>Mosca</dt><dd><Mosca m={row.mosca} /></dd></div>}
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
  // The code preview follows the mouse, so it only shows for mouse hover, not keyboard focus.
  const [byMouse, setByMouse] = useState(false);
  // `?open=F1` opens a finding directly, so a link can point at one.
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('open'));
  const preview = useRef(null);
  const root = useRef(null);
  const pos = useRef(null);
  // The row that opened the drawer, to give focus back to when it closes.
  const opener = useRef(null);

  useLayoutEffect(() => {
    if (!finePointer() || calm()) return undefined;
    const x = gsap.quickTo(preview.current, 'x', { duration: 0.5, ease: 'power3' });
    const y = gsap.quickTo(preview.current, 'y', { duration: 0.5, ease: 'power3' });
    pos.current = { x, y };
    return undefined;
  }, []);

  useLayoutEffect(() => {
    const list = root.current.querySelector('.fx-list');
    return revealOnView(list, list.querySelectorAll('.fx-row'), { yPercent: 60, autoAlpha: 0 });
  }, [rows.length]);

  const closeDrawer = () => {
    setOpen(null);
    // Give focus back to the row that opened it (or the row itself, for ?open=).
    const back = opener.current ?? root.current?.querySelector(`[data-row="${open}"]`);
    opener.current = null;
    requestAnimationFrame(() => back?.focus({ preventScroll: true }));
  };

  const current = rows.find((r) => r.id === hover);
  const openRow = rows.find((r) => r.id === open);

  return (
    <section className="section" id="findings" ref={root}>
      <div className="section-head">
        <span className="section-index">02 — Findings</span>
        <h2 className="section-title">
          Six lines of code,
          <br />
          <em>ranked by how late.</em>
        </h2>
        <p className="section-sub">Under each, Mosca's rule: how long the data must stay secret, plus the migration, against the years left before Q-Day. A finding being worked has its own Switch room with the engineer who owns the code. Hover for the line itself; open one to compare it with main.</p>
      </div>

      <ol className="fx-list" onMouseMove={(e) => pos.current && (pos.current.x(e.clientX + 24), pos.current.y(e.clientY - 120))} onMouseLeave={() => setHover(null)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHover(null)}>
        {rows.map((r) => (
          <li key={r.id} className={`fx-row st-${slug(r.state)} ${hover && hover !== r.id ? 'dim' : ''}`}>
            <button
              onMouseEnter={(e) => {
                // Start beside the cursor, even if the row scrolled under a still mouse.
                if (preview.current) gsap.set(preview.current, { x: e.clientX + 24, y: e.clientY - 120 });
                setByMouse(true);
                setHover(r.id);
              }}
              onFocus={() => {
                setByMouse(false);
                setHover(r.id);
              }}
              onClick={(e) => {
                opener.current = e.currentTarget;
                setOpen(r.id);
              }}
              data-row={r.id}
              aria-haspopup="dialog"
              data-cursor="Open"
            >
              <span className="fx-id">{r.id}</span>
              <span className="fx-algo">
                {r.algorithm}
                {r.mosca && <small className={`fx-mosca m-${slug(r.mosca.verdict)}`}>{r.mosca.label}</small>}
              </span>
              <code className="fx-where">{r.file}:{r.line}</code>
              <span className={`pill s-${slug(r.state)}`}>{r.state}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className={`fx-preview ${current && byMouse && finePointer() && !calm() ? 'on' : ''}`} ref={preview} aria-hidden="true">
        {current && (
          <>
            <span className="fx-preview-head">{current.file}</span>
            <Code source={current.code.before} from={current.line - 3} to={current.line + 6} marks={current.lines} />
          </>
        )}
      </div>

      {openRow && <Drawer row={openRow} onClose={closeDrawer} />}
    </section>
  );
}
