import { useEffect, useRef } from 'react';
import { PAGES, href } from '../lib/route.js';
import { startTour } from './Tour.jsx';

// The idea first: Home and the live run. Everything else sits under More.
const MAIN = ['', 'run'];

export default function Nav({ page }) {
  const more = useRef(null);
  // Close the More menu after a choice, or on a click outside it.
  useEffect(() => {
    const close = (e) => { if (more.current && !more.current.contains(e.target)) more.current.open = false; };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [page]);
  useEffect(() => { if (more.current) more.current.open = false; }, [page]);

  const extra = PAGES.filter((p) => !MAIN.includes(p.id));
  return (
    <header className="nav">
      <a className="brand" href="#/" aria-label="Crypto Migration Desk, home">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32"><path d="M9 16h14M16 9v14" /></svg>
        </span>
        <span className="brand-name">Crypto Migration Desk</span>
      </a>
      <nav className="nav-links" aria-label="Pages">
        {MAIN.map((id) => {
          const p = PAGES.find((x) => x.id === id);
          return (
            <a key={id || 'home'} href={href(id)} aria-current={(page || '') === id ? 'page' : undefined}>{p.label}</a>
          );
        })}
        <details className="nav-more" ref={more}>
          <summary aria-current={extra.some((p) => p.id === page) ? 'page' : undefined}>More</summary>
          <div className="nav-menu">
            {extra.map((p) => (
              <a key={p.id} href={href(p.id)} aria-current={page === p.id ? 'page' : undefined}>
                <b>{p.label}</b>
                <span>{p.line}</span>
              </a>
            ))}
          </div>
        </details>
        {extra.map((p) => (
          <a key={`m-${p.id}`} className="nav-small" href={href(p.id)} aria-current={page === p.id ? 'page' : undefined}>{p.label}</a>
        ))}
      </nav>
      <button type="button" className="nav-tour" onClick={startTour}>Tour</button>
      <a className="nav-repo" href="https://github.com/Dakshhhhh-ops/fliptheswitch" target="_blank" rel="noreferrer">GitHub</a>
    </header>
  );
}
