import { useEffect, useRef } from 'react';
import { Ago } from './motion.jsx';
import { isStatic, magnetic } from '../lib/motion.js';
import { SNAPSHOT } from '../lib/snapshot.js';

export default function Nav({ desk, live }) {
  const links = useRef(null);
  useEffect(() => {
    const offs = [...links.current.querySelectorAll('a')].map((a) => magnetic(a, 0.35));
    return () => offs.forEach((off) => off());
  }, []);
  const snapshot = SNAPSHOT || isStatic();
  return (
    <header className="nav">
      <a className="brand" href="#top" aria-label="Crypto Migration Desk, top">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32"><path d="M9 16h14M16 9v14" /></svg>
        </span>
        <span className="brand-name">Crypto Migration Desk</span>
      </a>
      <nav className="nav-links" ref={links} aria-label="Sections">
        <a href="#added">People</a>
        <a href="#qday">Q-Day</a>
        <a href="#findings">Findings</a>
        <a href="#room">In the room</a>
        <a href="#replay">Replay</a>
        <a href="#break">Break it</a>
        <a href="#spectrum">Inventory</a>
        <a href="#receipt">Receipt</a>
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
