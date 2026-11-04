import { useLayoutEffect, useRef } from 'react';
import { calm, gsap } from '../lib/motion.js';

const fmt = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Timeline({ timeline }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    if (calm()) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo('.tl-line', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.timeline', start: 'top 70%', end: 'bottom 60%', scrub: true } });
      gsap.utils.toArray('.tl').forEach((el) =>
        gsap.from(el, { x: -30, autoAlpha: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%' } }),
      );
    }, root);
    return () => ctx.revert();
  }, [timeline.length]);

  return (
    <section className="section" id="timeline" ref={root}>
      <div className="section-head">
        <span className="section-index">03 — Timeline</span>
        <h2 className="section-title">
          What shipped,
          <br />
          <em>and who said so.</em>
        </h2>
        <p className="section-sub">Every commit on main, newest first. Ships and accepted risks are the security lead's decisions, carried out by the shipper agent.</p>
      </div>
      <ol className="timeline">
        <span className="tl-line" aria-hidden="true" />
        {timeline.map((t) => (
          <li key={t.sha} className={`tl tl-${t.kind}`}>
            <span className="tl-dot" aria-hidden="true" />
            <div className="tl-main">
              <span className="tl-kind">{t.kind === 'ship' ? `Shipped ${t.finding}` : t.kind === 'risk' ? `Accepted risk ${t.finding}` : 'Commit'}</span>
              <p className="tl-subject">{t.subject}</p>
            </div>
            <div className="tl-meta">
              <code>{t.sha}</code>
              <span>{t.author}</span>
              <time dateTime={t.at}>{fmt(t.at)}</time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
