import { useLayoutEffect, useRef } from 'react';
import { Counter } from './motion.jsx';
import { calm, gsap } from '../lib/motion.js';

export default function Stats({ counts, assets, branches }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    if (calm()) return undefined;
    const ctx = gsap.context(() => {
      gsap.from('.stat', { y: 60, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: 0.08, scrollTrigger: { trigger: root.current, start: 'top 82%' } });
    }, root);
    return () => ctx.revert();
  }, []);

  const tiles = [
    { k: 'Shipped', v: counts.shipped, note: 'Ship merges on main', c: 'shipped' },
    { k: 'Accepted risk', v: counts['accepted risk'], note: 'In ACCEPTED-RISKS.md', c: 'accepted-risk' },
    { k: 'In review', v: counts['in review'], note: `${branches.length} pqc/ branch${branches.length === 1 ? '' : 'es'}`, c: 'in-review' },
    { k: 'Open', v: counts.open, note: 'Room open, not started', c: 'open' },
  ];
  return (
    <section className="stats" ref={root} aria-label="Summary">
      {tiles.map((t) => (
        <div className="stat" key={t.k}>
          <span className="stat-k"><i className={`dot s-${t.c}`} />{t.k}</span>
          <span className="stat-v"><Counter value={t.v} pad={2} /></span>
          <span className="stat-note">{t.note}</span>
        </div>
      ))}
      <div className="stat stat-wide">
        <span className="stat-k">CBOM assets that meet policy</span>
        <span className="stat-v">
          {String(assets.before.ok).padStart(2, '0')}
          <span className="stat-arrow">→</span>
          <Counter value={assets.now.ok} pad={2} />
        </span>
        <span className="stat-note">of {assets.now.total} crypto assets on main · the first commit had {assets.before.total}</span>
      </div>
    </section>
  );
}
