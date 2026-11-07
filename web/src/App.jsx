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
import { NextPage, PageCards } from './components/Pages.jsx';
import { Glossary, Guide, HowItWorks } from './components/Help.jsx';
import Facts from './components/Facts.jsx';
import Tour from './components/Tour.jsx';
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
      return (
        <>
          <Guide time="1 minute" steps={[
            'Keep the sample code, or paste your own JavaScript or TypeScript.',
            'Press Scan (or Ctrl+Enter). It runs in your browser; nothing is uploaded.',
            'Change “Data must stay secret for” and watch how urgent each problem becomes.',
          ]} />
          <Scan />
        </>
      );
    case 'run':
      return (
        <>
          <Guide time="3 minutes" steps={[
            'Read three real messages from the run: a person changing a fix, a release, and an accepted risk.',
            'Press Play on the replay to watch four hours of the run in under a minute. Drag the bar to jump around.',
            'Scroll on to compare what the scanner suggested with what people changed.',
          ]} />
          <Room />
          <Replay />
          <Added rows={desk.rows} />
        </>
      );
    case 'verify':
      return (
        <>
          <Guide time="1 minute" steps={[
            'Every approval and release in the run was digitally signed. Below is the real signed release of F5.',
            'Click a button like “Say the engineer ordered it”, or edit any line yourself.',
            'The check turns red: the signature no longer matches. “Restore the original” turns it green again.',
          ]} />
          <Attack />
          <Receipt desk={desk} counts={counts} />
        </>
      );
    case 'inventory':
      return (
        <>
          <Guide time="2 minutes" steps={[
            'See the six problems in the demo app, most urgent first. Click one to see its code before and after the fix.',
            'Scroll through “Recorded today, opened on Q-Day” to see why recorded data is already at risk.',
            'At the bottom: every piece of encryption in the app, placed by how safe it is.',
          ]} />
          <Findings rows={desk.rows} />
          <QDay />
          <Spectrum inventory={desk.inventory} />
        </>
      );
    default:
      return (
        <>
          <Hero counts={counts} total={desk.rows.length} started />
          <Facts />
          <HowItWorks />
          <Flip />
          <PageCards />
          <Glossary />
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
      <Tour />
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
