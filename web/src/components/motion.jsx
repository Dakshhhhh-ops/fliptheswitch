import { useEffect, useRef, useState } from 'react';

export const isStatic = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('static');

// No motion for people who asked for less, and none in `?static` snapshots.
const reduced = () =>
  typeof window !== 'undefined' && (isStatic() || window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// Fades a block up the first time it scrolls into view.
export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (reduced()) return setShown(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setShown(true), io.disconnect()), { threshold: 0.12 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

// Counts up to a number when it changes.
export function Counter({ value, duration = 900 }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) return setShown(value);
    const start = performance.now();
    const a = from.current;
    let frame;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{shown}</>;
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
