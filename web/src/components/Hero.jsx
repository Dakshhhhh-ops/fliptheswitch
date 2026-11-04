import { Counter, Reveal } from './motion.jsx';
import { STATES, slug } from '../useDesk.js';

function Ring({ done, total }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const p = total ? done / total : 0;
  return (
    <svg className="ring" viewBox="0 0 128 128" aria-hidden="true">
      <circle cx="64" cy="64" r={r} className="ring-track" />
      <circle cx="64" cy="64" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
    </svg>
  );
}

export default function Hero({ counts, total }) {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <Reveal as="p" className="eyebrow">Post-quantum migration · run in Switch</Reveal>
        <Reveal as="h1" delay={80} className="display">
          Your encryption
          <br />
          has an <em>expiry date.</em>
        </Reveal>
        <Reveal as="p" delay={180} className="lede">
          Agents find every quantum-vulnerable use of crypto, open a room for each one with the engineer who owns the code,
          and fix it with them. Only the security lead can ship.
        </Reveal>
      </div>

      <Reveal className="hero-score" delay={240}>
        <div className="score-ring">
          <Ring done={counts.shipped} total={total} />
          <div className="score-num">
            <span className="big">
              <Counter value={counts.shipped} />
            </span>
            <span className="of">/{total}</span>
          </div>
        </div>
        <p className="score-label">findings shipped</p>
        <div className="ribbon" role="img" aria-label={STATES.map((s) => `${counts[s]} ${s}`).join(', ')}>
          {STATES.map((s) => (counts[s] ? <span key={s} className={`seg s-${slug(s)}`} style={{ flexGrow: counts[s] }} /> : null))}
        </div>
        <ul className="legend">
          {STATES.map((s) => (
            <li key={s}>
              <span className={`dot s-${slug(s)}`} aria-hidden="true" />
              {s} <b>{counts[s]}</b>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
