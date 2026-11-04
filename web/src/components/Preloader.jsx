import { useLayoutEffect, useRef } from 'react';
import { calm, gsap } from '../lib/motion.js';

// A count to 100 while the desk is read from git, then a curtain lifts.
export default function Preloader({ ready, onDone }) {
  const root = useRef(null);
  const num = useRef(null);
  const tl = useRef(null);

  useLayoutEffect(() => {
    if (calm()) {
      onDone();
      return undefined;
    }
    const counter = { v: 0 };
    const ctx = gsap.context(() => {
      tl.current = gsap.timeline({ paused: true })
        .to(counter, { v: 100, duration: 1.4, ease: 'power2.inOut', onUpdate: () => (num.current.textContent = String(Math.round(counter.v)).padStart(3, '0')) })
        .to('.pre-line', { scaleX: 1, duration: 1.4, ease: 'power2.inOut' }, 0)
        .to('.pre-inner', { yPercent: -120, duration: 0.7, ease: 'power3.in' }, '+=0.15')
        .to(root.current, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1, ease: 'expo.inOut', onStart: onDone }, '-=0.25');
    }, root);
    return () => ctx.revert();
  }, []);

  useLayoutEffect(() => {
    if (ready) tl.current?.play();
  }, [ready]);

  if (calm()) return null;
  return (
    <div className="preloader" ref={root} aria-hidden="true">
      <div className="pre-inner">
        <span className="pre-label">Reading the desk from git</span>
        <span className="pre-num" ref={num}>000</span>
        <span className="pre-track"><span className="pre-line" /></span>
      </div>
    </div>
  );
}
