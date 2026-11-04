import { useLayoutEffect, useRef } from 'react';
import { calm, gsap } from '../lib/motion.js';

export default function Footer({ desk }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    if (calm()) return undefined;
    const ctx = gsap.context(() => {
      gsap.to('.mq-a', { xPercent: -50, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom top', scrub: 1 } });
      gsap.fromTo('.mq-b', { xPercent: -50 }, { xPercent: 0, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom top', scrub: 1 } });
    }, root);
    return () => ctx.revert();
  }, []);
  const a = 'People decide · ';
  const b = 'Agents do the work around the decision · ';
  return (
    <footer className="footer" ref={root}>
      <div className="mq" aria-hidden="true">
        <div className="mq-a">{a.repeat(8)}</div>
        <div className="mq-b"><em>{b.repeat(6)}</em></div>
      </div>
      <p className="sr-only">People decide. Agents do the work around the decision.</p>
      <div className="footer-row">
        <span>Every number on this page is read from git, at the agents' origin. The work itself happens in Switch rooms.</span>
        <span>
          First commit <code>{desk.root}</code> · main <code>{desk.head}</code>
        </span>
      </div>
    </footer>
  );
}
