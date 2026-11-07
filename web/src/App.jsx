import { useState } from 'react';
import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import QDay from './components/QDay.jsx';
import Findings from './components/Findings.jsx';
import Room from './components/Room.jsx';
import Spectrum from './components/Spectrum.jsx';
import Receipt from './components/Receipt.jsx';
import Preloader from './components/Preloader.jsx';
import Cursor from './components/Cursor.jsx';
import { countStates, useDesk } from './useDesk.js';
import { useSmoothScroll } from './lib/motion.js';

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

export default function App() {
  const { desk, live, error } = useDesk();
  const [started, setStarted] = useState(false);
  useSmoothScroll(Boolean(desk));
  const counts = desk ? countStates(desk.rows) : null;

  return (
    <>
      <Preloader ready={Boolean(desk || error)} onDone={() => setStarted(true)} />
      <Cursor />
      <div className="grain" aria-hidden="true" />
      <Nav desk={desk} live={live} />
      {error && !desk && <Empty error={error} />}
      {desk && (
        <>
          <main>
            <Hero counts={counts} total={desk.rows.length} started={started} />
            <QDay />
            <Findings rows={desk.rows} />
            <Room />
            <Spectrum inventory={desk.inventory} />
          </main>
          <Receipt desk={desk} counts={counts} />
        </>
      )}
    </>
  );
}
