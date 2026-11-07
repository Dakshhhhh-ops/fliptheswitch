import { useEffect, useRef } from 'react';
import { Ago } from './motion.jsx';
import { isStatic, magnetic } from '../lib/motion.js';
import { SNAPSHOT } from '../lib/snapshot.js';
import { PAGES, href } from '../lib/route.js';

export default function Nav({ desk, live, page }) {
  const links = useRef(null);
  useEffect(() => {
    const offs = [...links.current.querySelectorAll('a')].map((a) => magnetic(a, 0.35));
    return () => offs.forEach((off) => off());
  }, []);
  const snapshot = SNAPSHOT || isStatic();
  return (
    <header className="nav">
      <a className="brand" href="#/" aria-label="Crypto Migration Desk, top">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32"><path d="M9 16h14M16 9v14" /></svg>
        </span>
        <span className="brand-name">Crypto Migration Desk</span>
      </a>
      <nav className="nav-links" ref={links} aria-label="Sections">
        {PAGES.filter((p) => p.id).map((p) => (
          <a key={p.id} href={href(p.id)} aria-current={page === p.id ? 'page' : undefined}>
            {p.label}
          </a>
        ))}
      </nav>
      <div className={`live ${live ? 'on' : ''}`} role="status">
        <span className="live-dot" aria-hidden="true" />
        {snapshot ? 'Snapshot' : live ? 'Live' : 'Connecting'}
        {desk && (
          <span className="live-meta">
            main@<code>{desk.head}</code> · <Ago iso={desk.readAt} />
          </span>
        )}
      </div>
    </header>
  );
}
