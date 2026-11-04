import { Ago, isStatic } from './motion.jsx';

export default function Nav({ desk, live }) {
  const snapshot = isStatic();
  return (
    <header className="nav">
      <a className="brand" href="#top" aria-label="Crypto Migration Desk, top">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32"><path d="M9 16h14M16 9v14" /></svg>
        </span>
        <span className="brand-name">Crypto Migration Desk</span>
      </a>
      <nav className="nav-links" aria-label="Sections">
        <a href="#findings">Findings</a>
        <a href="#inventory">Inventory</a>
        <a href="#timeline">Timeline</a>
      </nav>
      <div className={`live ${live ? 'on' : ''}`} role="status">
        <span className="live-dot" aria-hidden="true" />
        {snapshot ? 'Snapshot' : live ? 'Live' : 'Reconnecting'}
        {desk && (
          <span className="live-meta">
            main@<code>{desk.head}</code> · <Ago iso={desk.readAt} />
          </span>
        )}
      </div>
    </header>
  );
}
