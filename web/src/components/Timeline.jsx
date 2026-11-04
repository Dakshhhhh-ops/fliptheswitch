import { Reveal } from './motion.jsx';

const fmt = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Timeline({ timeline }) {
  return (
    <section className="section" id="timeline">
      <Reveal className="section-head">
        <span className="section-index">03</span>
        <h2>Timeline</h2>
        <p>Every commit on main, newest first. Ships and accepted risks are the security lead's decisions, carried out by the shipper.</p>
      </Reveal>
      <ol className="timeline">
        {timeline.map((t, i) => (
          <Reveal as="li" key={t.sha} delay={i * 40} className={`tl tl-${t.kind}`}>
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
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
