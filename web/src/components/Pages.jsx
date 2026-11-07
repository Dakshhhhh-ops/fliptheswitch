import { PAGES, href } from '../lib/route.js';

// The other pages, as cards on the home page.
export function PageCards() {
  return (
    <section className="section pg" aria-label="More pages">
      <ol className="pg-grid">
        {PAGES.filter((p) => p.id).map((p) => (
          <li key={p.id}>
            <a className="pg-card" href={href(p.id)}>
              <span className="pg-title">{p.title}</span>
              <span className="pg-line">{p.line}</span>
              <span className="pg-go" aria-hidden="true">→</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

// "Next" at the foot of each page, so the pages read in order.
export function NextPage({ page }) {
  const i = PAGES.findIndex((p) => p.id === page);
  const next = PAGES[(i + 1) % PAGES.length];
  return (
    <nav className="section pg-next" aria-label="Next page">
      <a href={href(next.id)}>
        <span>Next</span>
        <b>{next.id ? next.title : 'Back to the start'} →</b>
      </a>
    </nav>
  );
}
