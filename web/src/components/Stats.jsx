import { Counter, Reveal } from './motion.jsx';

export default function Stats({ counts, assets, branches }) {
  const tiles = [
    { k: 'Shipped', v: counts.shipped, note: 'Ship merges on main' },
    { k: 'Accepted risk', v: counts['accepted risk'], note: 'In ACCEPTED-RISKS.md' },
    { k: 'In review', v: counts['in review'], note: `${branches.length} pqc/ branch${branches.length === 1 ? '' : 'es'}` },
    { k: 'Open', v: counts.open, note: 'Not started' },
  ];
  return (
    <section className="stats" aria-label="Summary">
      {tiles.map((t, i) => (
        <Reveal className="stat" key={t.k} delay={i * 60}>
          <span className="stat-k">{t.k}</span>
          <span className="stat-v">
            <Counter value={t.v} />
          </span>
          <span className="stat-note">{t.note}</span>
        </Reveal>
      ))}
      <Reveal className="stat stat-wide" delay={260}>
        <span className="stat-k">CBOM assets that meet policy</span>
        <span className="stat-v">
          {assets.before.ok}
          <span className="stat-arrow">→</span>
          <Counter value={assets.now.ok} />
        </span>
        <span className="stat-note">
          of {assets.now.total} crypto assets on main · first commit had {assets.before.total}
        </span>
      </Reveal>
    </section>
  );
}
