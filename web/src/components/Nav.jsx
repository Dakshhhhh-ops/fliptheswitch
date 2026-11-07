import { PAGES, href } from '../lib/route.js';

export default function Nav({ page }) {
  return (
    <header className="nav">
      <a className="brand" href="#/" aria-label="Crypto Migration Desk, home">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32"><path d="M9 16h14M16 9v14" /></svg>
        </span>
        <span className="brand-name">Crypto Migration Desk</span>
      </a>
      <nav className="nav-links" aria-label="Pages">
        {PAGES.filter((p) => p.id).map((p) => (
          <a key={p.id} href={href(p.id)} aria-current={page === p.id ? 'page' : undefined}>
            {p.label}
          </a>
        ))}
      </nav>
      <a className="nav-repo" href="https://github.com/Dakshhhhh-ops/fliptheswitch" target="_blank" rel="noreferrer">GitHub</a>
    </header>
  );
}
