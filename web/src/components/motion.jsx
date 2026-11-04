import { useEffect, useRef, useState } from 'react';
import { calm, gsap } from '../lib/motion.js';

// A number that rolls to its new value.
export function Counter({ value, pad = 0 }) {
  const el = useRef(null);
  const from = useRef(0);
  useEffect(() => {
    const show = (v) => el.current && (el.current.textContent = String(Math.round(v)).padStart(pad, '0'));
    if (calm()) return show(value);
    const o = { v: from.current };
    const tw = gsap.to(o, { v: value, duration: 1.2, ease: 'power3.out', onUpdate: () => show(o.v), onComplete: () => (from.current = value) });
    return () => tw.kill();
  }, [value, pad]);
  return <span ref={el}>{String(0).padStart(pad, '0')}</span>;
}

// "12s ago", refreshed every second.
export function Ago({ iso }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return <>{s}s ago</>;
  if (s < 3600) return <>{Math.floor(s / 60)}m ago</>;
  return <>{Math.floor(s / 3600)}h ago</>;
}

// Splits text into masked lines/words that GSAP can lift into view.
export function Lines({ lines, className = '' }) {
  return lines.map((line, i) => (
    <span className={`mask ${className}`} key={i}>
      <span className="mask-in">{line}</span>
    </span>
  ));
}
