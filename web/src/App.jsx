import { useState } from 'react';
import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import Ticker from './components/Ticker.jsx';
import Manifesto from './components/Manifesto.jsx';
import Stats from './components/Stats.jsx';
import Findings from './components/Findings.jsx';
import Inventory from './components/Inventory.jsx';
import Timeline from './components/Timeline.jsx';
import Footer from './components/Footer.jsx';
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
            <Hero counts={countStates(desk.rows)} total={desk.rows.length} started={started} />
            <Ticker />
            <Manifesto />
            <Stats counts={countStates(desk.rows)} assets={desk.assets} branches={desk.branches} />
            <Findings rows={desk.rows} />
            <Inventory inventory={desk.inventory} />
            <Timeline timeline={desk.timeline} />
          </main>
          <Footer desk={desk} />
        </>
      )}
    </>
  );
}
