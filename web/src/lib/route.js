import { useEffect, useState } from 'react';
import { ScrollTrigger, jumpTo } from './motion.js';

// Pages live in the hash (#/scan), so the static snapshot works on any host.
// Old section links (#break, #replay…) still work: they open the page that
// holds that section and scroll to it.
export const PAGES = [
  { id: '', label: 'Home', title: 'Crypto Migration Desk' },
  { id: 'scan', label: 'Scan', title: 'Scan your code', line: 'Paste JavaScript or TypeScript. The real scanner runs in your browser.' },
  { id: 'run', label: 'Live run', title: 'The live run', line: 'Inside a finding room, a replay of run 3, and what people changed.' },
  { id: 'verify', label: 'Verify', title: 'Verify it', line: "Edit run 3's real signed ship and watch ML-DSA-65 refuse it." },
  { id: 'inventory', label: 'Findings', title: 'Findings', line: 'The six findings, harvest now and decrypt later, and the crypto inventory.' },
];

const SECTION_PAGE = {
  top: '', facts: '', how: '', flip: '', linked: '', words: '',
  scan: 'scan',
  room: 'run', replay: 'run', added: 'run',
  break: 'verify', receipt: 'verify',
  qday: 'inventory', findings: 'inventory', spectrum: 'inventory',
};

function parse(hash) {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  if (h.startsWith('/')) {
    const page = h.slice(1).split('/')[0];
    return { page: PAGES.some((p) => p.id === page) ? page : '', section: null };
  }
  if (h in SECTION_PAGE) return { page: SECTION_PAGE[h], section: h };
  return { page: '', section: null };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // A new page starts at the top (or at the section asked for), and anything
  // pinned or scroll-driven measures itself again.
  useEffect(() => {
    const page = PAGES.find((p) => p.id === route.page);
    document.title = page.id ? `${page.title} · Crypto Migration Desk` : 'Crypto Migration Desk';
    jumpTo(0);
    const t = setTimeout(() => {
      ScrollTrigger.refresh();
      if (route.section && route.section !== 'top') {
        const el = document.getElementById(route.section);
        if (el) jumpTo(el);
      }
    }, 60);
    return () => clearTimeout(t);
  }, [route.page, route.section]);

  return route;
}

export const href = (page) => `#/${page}`;
