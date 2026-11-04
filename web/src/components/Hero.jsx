import { useLayoutEffect, useRef } from 'react';
import Lattice from './Lattice.jsx';
import { Counter, Lines } from './motion.jsx';
import { calm, gsap } from '../lib/motion.js';
import { STATES, slug } from '../useDesk.js';

export default function Hero({ counts, total, started }) {
  const root = useRef(null);

  useLayoutEffect(() => {
    if (calm()) return undefined;
    const ctx = gsap.context(() => {
      gsap.set('.hero .mask-in', { yPercent: 110 });
      gsap.set(['.hero-eyebrow', '.hero-foot > *', '.lattice'], { autoAlpha: 0 });
    }, root);
    return () => ctx.revert();
  }, []);

  useLayoutEffect(() => {
    if (!started || calm()) return undefined;
    const ctx = gsap.context(() => {
      gsap.timeline({ delay: 0.15 })
        .to('.lattice', { autoAlpha: 1, duration: 2.2, ease: 'power2.out' }, 0)
        .to('.hero-eyebrow', { autoAlpha: 1, duration: 0.8 }, 0.1)
        .to('.hero .mask-in', { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.09 }, 0.15)
        .to('.hero-foot > *', { autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.08 }, 0.7);
      gsap.to('.hero-title', {
        yPercent: -18,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
      });
    }, root);
    return () => ctx.revert();
  }, [started]);

  return (
    <section className="hero" id="top" ref={root}>
      <Lattice progress={total ? counts.shipped / total : 0} />
      <div className="hero-inner">
        <p className="hero-eyebrow">Post-quantum migration · run by people and agents in Switch</p>
        <h1 className="hero-title">
          <Lines lines={['Your', 'encryption', <>has an <em>expiry</em></>, <em key="d">date.</em>]} />
        </h1>
        <div className="hero-foot">
          <p className="hero-lede">
            Agents find every quantum-vulnerable use of crypto, open a room for each with the engineer who owns the code, and fix
            it with them. Only the security lead can ship.
          </p>
          <div className="hero-score">
            <span className="hero-score-num">
              <Counter value={counts.shipped} pad={2} />
              <span>/{String(total).padStart(2, '0')}</span>
            </span>
            <span className="hero-score-label">findings shipped</span>
            <div className="ribbon" role="img" aria-label={STATES.map((s) => `${counts[s]} ${s}`).join(', ')}>
              {STATES.map((s) => (counts[s] ? <span key={s} className={`seg s-${slug(s)}`} style={{ flexGrow: counts[s] }} /> : null))}
            </div>
          </div>
          <a className="scroll-cue" href="#manifesto" data-cursor="Scroll">
            <span>Scroll</span>
            <i aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
