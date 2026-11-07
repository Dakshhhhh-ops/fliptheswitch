import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import Flip from './components/Flip.jsx';
import Scan from './components/Scan.jsx';
import QDay from './components/QDay.jsx';
import Findings from './components/Findings.jsx';
import Added from './components/Added.jsx';
import Attack from './components/Attack.jsx';
import Replay from './components/Replay.jsx';
import Room from './components/Room.jsx';
import Spectrum from './components/Spectrum.jsx';
import Receipt from './components/Receipt.jsx';
import Cursor from './components/Cursor.jsx';
import { NextPage, PageCards } from './components/Pages.jsx';
import { countStates, useDesk } from './useDesk.js';
import { useSmoothScroll } from './lib/motion.js';
import { useRoute } from './lib/route.js';

function Empty({ error }) {
  return (
    <main className="empty">
      <p className="hero-eyebrow">Crypto Migration Desk</p>
      <h1 className="empty-title">
        Nothing to <em>read yet.</em>
      </h1>
      <p className="hero-lede">{error.message}</p>
    </main>
  );
}

function Page({ page, desk, counts }) {
  switch (page) {
    case 'scan':
      return <Scan />;
    case 'run':
      return (
        <>
          <Room />
          <Replay />
          <Added rows={desk.rows} />
        </>
      );
    case 'verify':
      return (
        <>
          <Attack />
          <Receipt desk={desk} counts={counts} />
        </>
      );
    case 'inventory':
      return (
        <>
          <Findings rows={desk.rows} />
          <QDay />
          <Spectrum inventory={desk.inventory} />
        </>
      );
    default:
      return (
        <>
          <Hero counts={counts} total={desk.rows.length} started />
          <Flip />
          <PageCards />
        </>
      );
  }
}

export default function App() {
  const { desk, live, error } = useDesk();
  const { page } = useRoute();
  useSmoothScroll(Boolean(desk));
  const counts = desk ? countStates(desk.rows) : null;

  return (
    <>
      <Cursor />
      <div className="grain" aria-hidden="true" />
      <Nav desk={desk} live={live} page={page} />
      {error && !desk && <Empty error={error} />}
      {desk && (
        <main key={page} className={page ? 'page' : 'page page-home'}>
          <Page page={page} desk={desk} counts={counts} />
          {page && <NextPage page={page} />}
        </main>
      )}
    </>
  );
}
