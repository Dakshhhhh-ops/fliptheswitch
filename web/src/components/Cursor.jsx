import { useEffect, useRef } from 'react';
import { calm, finePointer, gsap } from '../lib/motion.js';

// A dot that follows the pointer and a ring that trails it. Over anything
// marked data-cursor, the ring grows and shows that label.
export default function Cursor() {
  const dot = useRef(null);
  const ring = useRef(null);
  const label = useRef(null);

  useEffect(() => {
    if (calm() || !finePointer()) return undefined;
    document.documentElement.classList.add('has-cursor');
    const dx = gsap.quickTo(dot.current, 'x', { duration: 0.12, ease: 'power3' });
    const dy = gsap.quickTo(dot.current, 'y', { duration: 0.12, ease: 'power3' });
    const rx = gsap.quickTo(ring.current, 'x', { duration: 0.55, ease: 'power3' });
    const ry = gsap.quickTo(ring.current, 'y', { duration: 0.55, ease: 'power3' });
    const move = (e) => {
      dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    };
    const over = (e) => {
      const t = e.target.closest('[data-cursor], a, button');
      const text = t?.getAttribute('data-cursor') ?? '';
      label.current.textContent = text;
      ring.current.classList.toggle('big', Boolean(t));
      ring.current.classList.toggle('labelled', Boolean(text));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerover', over);
    return () => {
      document.documentElement.classList.remove('has-cursor');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerover', over);
    };
  }, []);

  return (
    <>
      <span className="cursor-dot" ref={dot} aria-hidden="true" />
      <span className="cursor-ring" ref={ring} aria-hidden="true">
        <span ref={label} />
      </span>
    </>
  );
}
