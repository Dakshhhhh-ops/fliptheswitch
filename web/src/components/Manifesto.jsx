import { useLayoutEffect, useRef } from 'react';
import { calm, gsap } from '../lib/motion.js';

const TEXT =
  'Anything encrypted with RSA or elliptic curves today can be recorded now and decrypted later. Moving off them is not a find-and-replace. Each fix needs the engineer who knows the code, a second opinion, and a person who decides what ships.';
const HIGHLIGHT = new Set(['recorded', 'now', 'decrypted', 'later.', 'decides']);

// Each word lights up as it scrolls past.
export default function Manifesto() {
  const root = useRef(null);
  useLayoutEffect(() => {
    if (calm()) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.mf-word',
        { opacity: 0.14 },
        { opacity: 1, stagger: 0.04, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top 75%', end: 'bottom 55%', scrub: true } },
      );
    }, root);
    return () => ctx.revert();
  }, []);
  return (
    <section className="manifesto" id="manifesto" ref={root}>
      <span className="section-index">00 — Why</span>
      <p className="mf-text">
        {TEXT.split(' ').map((w, i) => (
          <span key={i} className={`mf-word ${HIGHLIGHT.has(w) ? 'hl' : ''}`}>
            {w}{' '}
          </span>
        ))}
      </p>
    </section>
  );
}
