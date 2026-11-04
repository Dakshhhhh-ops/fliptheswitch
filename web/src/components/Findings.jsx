import { useLayoutEffect, useRef } from 'react';
import { calm, gsap, ScrollTrigger } from '../lib/motion.js';
import { slug } from '../useDesk.js';

function Evidence({ row }) {
  if (row.ship)
    return (
      <>
        Merged <code>{row.ship.sha}</code> on {row.ship.date}.
        {row.stillFlagged && ' Still in the scan on purpose: the classical algorithm stays beside the new one.'}
      </>
    );
  if (row.risk) return <>{row.risk}</>;
  if (row.branch) return <>Fix under review on <code>{row.branch}</code>.</>;
  return <>Room open. Nothing on the origin yet.</>;
}

// Pinned on wide screens: scrolling down moves the cards sideways.
export default function Findings({ rows }) {
  const root = useRef(null);
  const track = useRef(null);

  useLayoutEffect(() => {
    if (calm()) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 961px)', () => {
      const distance = () => track.current.scrollWidth - window.innerWidth + 80;
      const tween = gsap.to(track.current, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1 },
      });
      gsap.to('.fc-progress i', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top top', end: () => `+=${distance()}`, scrub: true } });
      return () => tween.kill();
    });
    mm.add('(max-width: 960px)', () => {
      gsap.utils.toArray('.fcard').forEach((card) =>
        gsap.from(card, { y: 70, autoAlpha: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: card, start: 'top 88%' } }),
      );
    });
    return () => mm.revert();
  }, [rows.length]);

  useLayoutEffect(() => {
    ScrollTrigger.refresh();
  }, [rows]);

  return (
    <section className="findings" id="findings" ref={root}>
      <div className="findings-head">
        <span className="section-index">01 — Findings</span>
        <h2 className="section-title">
          Six problems,
          <br />
          <em>one room each.</em>
        </h2>
        <p className="section-sub">From the scan of the first commit. Each one is worked in its own Switch room with the engineer who owns the code.</p>
        <span className="fc-progress" aria-hidden="true"><i /></span>
      </div>
      <div className="findings-track" ref={track}>
        {rows.map((r) => (
          <article className={`fcard st-${slug(r.state)}`} key={r.id} data-cursor={r.state}>
            <header className="fcard-top">
              <span className="fcard-id">{r.id}</span>
              <span className={`pill s-${slug(r.state)}`}>{r.state}</span>
            </header>
            <h3 className="fcard-algo">{r.algorithm}</h3>
            <code className="fcard-where">
              {r.file}:{r.line} · {r.priority} · {r.status}
            </code>
            <dl className="fcard-body">
              <div>
                <dt>Why</dt>
                <dd>{r.why}</dd>
              </div>
              <div>
                <dt>Fix</dt>
                <dd>{r.fix}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>
                  <Evidence row={r} />
                </dd>
              </div>
            </dl>
          </article>
        ))}
        <div className="fcard fcard-end" aria-hidden="true">
          <span>Every state here is read from git, not typed in.</span>
        </div>
      </div>
    </section>
  );
}
