import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import Ticker from './components/Ticker.jsx';
import Stats from './components/Stats.jsx';
import Findings from './components/Findings.jsx';
import Inventory from './components/Inventory.jsx';
import Timeline from './components/Timeline.jsx';
import { countStates, useDesk } from './useDesk.js';

function Empty({ error }) {
  return (
    <main className="empty">
      <p className="eyebrow">Crypto Migration Desk</p>
      <h1 className="display">
        {error ? <>Nothing to <em>read yet.</em></> : <>Reading <em>git…</em></>}
      </h1>
      {error && <p className="lede">{error.message}</p>}
    </main>
  );
}

export default function App() {
  const { desk, live, error } = useDesk();
  if (!desk) {
    return (
      <>
        <Nav desk={null} live={live} />
        <Empty error={error} />
      </>
    );
  }
  const counts = countStates(desk.rows);
  return (
    <>
      <div className="grain" aria-hidden="true" />
      <Nav desk={desk} live={live} />
      <main>
        <Hero counts={counts} total={desk.rows.length} />
        <Ticker />
        <Stats counts={counts} assets={desk.assets} branches={desk.branches} />
        <Findings rows={desk.rows} />
        <Inventory inventory={desk.inventory} />
        <Timeline timeline={desk.timeline} />
      </main>
      <footer className="footer">
        <p className="footer-big">
          People decide. <em>Agents do the work around the decision.</em>
        </p>
        <div className="footer-row">
          <span>Every number here is read from git, at the agents' origin. The work itself happens in Switch rooms.</span>
          <span>
            First commit <code>{desk.root}</code> · main <code>{desk.head}</code>
          </span>
        </div>
      </footer>
    </>
  );
}
