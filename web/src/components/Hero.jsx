import { Suspense, lazy, useLayoutEffect, useRef } from 'react';

// three.js is the biggest dependency by far; load it after the first paint.
// Until it arrives (or if WebGL is unavailable) a still dot grid stands in.
const Lattice = lazy(() => import('./Lattice.jsx'));
import { Lines } from './motion.jsx';
import { calm, gsap } from '../lib/motion.js';

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
      <div className="lattice" aria-hidden="true">
        <span className="lattice-still" />
        <Suspense fallback={null}>
          <Lattice progress={total ? counts.shipped / total : 0} />
        </Suspense>
      </div>
      <div className="hero-inner">
        <p className="hero-eyebrow">Post-quantum migration · run by people and agents in Switch</p>
        <h1 className="hero-title">
          <Lines lines={['Your', 'encryption', <>has an <em>expiry</em></>, <em key="d">date.</em>]} />
        </h1>
        <div className="hero-foot">
          <div className="hero-lede-box">
            <p className="hero-lede">
              The scanner knows what's broken. Only people know what's safe to change. A desk of agents works it out with them in
              team chat, and Switch decides who may approve and who may ship.
            </p>
            <div className="hero-ctas">
              <a className="hero-cta" href="#flip">Flip the switch →</a>
              <a className="hero-cta-2" href="#break">or try to forge a ship</a>
            </div>
          </div>
          <a className="scroll-cue" href="#flip" data-cursor="Scroll">
            <span>Scroll</span>
            <i aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
