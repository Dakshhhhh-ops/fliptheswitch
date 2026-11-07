import { useCallback, useEffect, useRef, useState } from 'react';
import { href } from '../lib/route.js';
import { jumpTo } from '../lib/motion.js';

// A guided tour: it opens each page, highlights what to look at and, where
// a step says so, moves a pointer to a button and clicks it, so a first-time
// visitor sees the desk work without knowing where to click. It plays by
// itself; Back, Next, Pause and Esc are always there. Start it from anywhere
// with startTour().
export const startTour = () => window.dispatchEvent(new Event('desk-tour'));

const STEPS = [
  { page: '', at: '.hero-lede', title: 'What this is',
    body: 'Old encryption has to be replaced before quantum computers can break it. AI agents and the people who own the code agree each change in a team chat, and Switch decides who may approve and release it.' },
  { page: '', at: '#facts .fc-row', title: 'What only people knew',
    body: 'A scanner finds the old encryption. It can\'t know that 40 merchants still depend on it. These are the facts the engineer gave in a real run, and what each one changed.' },
  { page: '', at: '.fl-switch', click: true, title: 'Switch is what says no',
    body: 'Here are real moments from the runs. Turn Switch off and the same messages go through: anyone could order a release. Turn it back on and they\'re refused.' },
  { page: 'scan', at: '#scan .rp-play', click: true, title: 'Scan code in your browser',
    body: 'The same scanner the agents use, on sample code. It lists each piece of old encryption and how urgent it is. Paste your own code here too.' },
  { page: 'run', at: '#room', title: 'Inside the chat rooms',
    body: 'Real messages from live run 3: the engineer changing a fix, agents and people pushing back on each other, and Switch refusing the engineer.' },
  { page: 'run', at: '#replay .rp-play', click: true, title: 'Replay four hours of the run',
    body: 'Every message and code change, in order, sped up. The board fills in as each fix is released.' },
  { page: 'verify', at: '#break .ak-attacks button', click: true, title: 'Try to forge a release',
    body: 'This is a real signed release from the run. Changing one word breaks the post-quantum signature, so the fake is refused, here and in git.' },
  { page: 'inventory', at: '#findings', title: 'The six problems, most urgent first',
    body: 'Each one is ranked by how long its data must stay secret. Open one to see the code before and after.' },
  { page: '', at: '.hero-ctas', title: 'That\'s the desk',
    body: 'Everything you saw came from three real runs on Switch. Anyone can re-check them from the code with one command: npm run judge.' },
];

const STEP_MS = 6500;
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function waitFor(selector, ms = 2500) {
  return new Promise((resolve) => {
    const start = performance.now();
    const look = () => {
      const el = document.querySelector(selector);
      if (el && el.getBoundingClientRect().height > 0) return resolve(el);
      if (performance.now() - start > ms) return resolve(null);
      requestAnimationFrame(look);
    };
    look();
  });
}

export default function Tour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const [box, setBox] = useState(null);
  const [pointer, setPointer] = useState(null);
  const target = useRef(null);
  const card = useRef(null);

  useEffect(() => {
    const on = () => { setI(0); setAuto(true); setOpen(true); };
    window.addEventListener('desk-tour', on);
    return () => window.removeEventListener('desk-tour', on);
  }, []);

  const close = useCallback(() => { setOpen(false); setBox(null); setPointer(null); target.current = null; }, []);
  const go = useCallback((n, manual) => {
    if (manual) setAuto(false);
    if (n < 0) return;
    if (n >= STEPS.length) return close();
    setI(n);
  }, [close]);

  // Open the step's page, find its element, bring it into view, and click it
  // if the step says so.
  useEffect(() => {
    if (!open) return undefined;
    const step = STEPS[i];
    let live = true;
    const timers = [];
    setPointer(null);
    const want = href(step.page);
    if (window.location.hash !== want && !(step.page === '' && ['', '#', '#/'].includes(window.location.hash))) window.location.hash = want;
    (async () => {
      const el = await waitFor(step.at);
      if (!live) return;
      target.current = el;
      if (!el) return;
      jumpTo(el);
      if (step.click) {
        timers.push(setTimeout(() => {
          if (!live) return;
          const r = el.getBoundingClientRect();
          setPointer({ x: r.left + r.width / 2, y: r.top + r.height / 2, pressed: false });
          timers.push(setTimeout(() => {
            if (!live) return;
            setPointer((p) => p && { ...p, pressed: true });
            el.click();
          }, calm() ? 0 : 900));
        }, calm() ? 300 : 1100));
      }
    })();
    return () => { live = false; timers.forEach(clearTimeout); };
  }, [open, i]);

  // Follow the highlighted element as the page scrolls or resizes.
  useEffect(() => {
    if (!open) return undefined;
    let raf;
    const measure = () => {
      const el = target.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setBox((b) => (b && Math.abs(b.top - r.top) < 0.5 && Math.abs(b.left - r.left) < 0.5 && b.width === r.width && b.height === r.height
          ? b : { top: r.top, left: r.left, width: r.width, height: r.height }));
      } else setBox(null);
    };
    const nudge = measure;
    window.addEventListener('scroll', nudge, { passive: true, capture: true });
    window.addEventListener('resize', nudge);
    const timers = [100, 300, 600, 1000, 1500, 2200, 3000].map((ms) => setTimeout(nudge, ms));
    const tick = () => {
      measure();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); window.removeEventListener('scroll', nudge, { capture: true }); window.removeEventListener('resize', nudge); };
  }, [open, i]);

  // Autoplay, and the keyboard.
  useEffect(() => {
    if (!open || !auto) return undefined;
    const t = setTimeout(() => go(i + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [open, auto, i, go]);
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(i + 1, true);
      else if (e.key === 'ArrowLeft') go(i - 1, true);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, i, go, close]);
  useEffect(() => { if (open) card.current?.focus({ preventScroll: true }); }, [open, i]);

  if (!open) return null;
  const step = STEPS[i];
  const pad = 8;
  return (
    <div className="tr" role="dialog" aria-modal="false" aria-label="Guided tour">
      {box && (
        <div className="tr-spot" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
      )}
      {pointer && <div className={`tr-pointer ${pointer.pressed ? 'pressed' : ''}`} style={{ top: pointer.y, left: pointer.x }} aria-hidden="true" />}
      <div className="tr-card" ref={card} tabIndex={-1}>
        <div className="tr-progress" aria-hidden="true">
          {STEPS.map((_, n) => <span key={n} className={n < i ? 'done' : n === i ? `now ${auto ? 'run' : ''}` : ''} style={n === i ? { animationDuration: `${STEP_MS}ms` } : undefined} />)}
        </div>
        <p className="tr-count">Step {i + 1} of {STEPS.length}</p>
        <h2 className="tr-title">{step.title}</h2>
        <p className="tr-body" aria-live="polite">{step.body}</p>
        <div className="tr-actions">
          <button type="button" className="tr-ghost" onClick={() => go(i - 1, true)} disabled={i === 0}>Back</button>
          <button type="button" className="tr-ghost" onClick={() => setAuto((a) => !a)} aria-pressed={auto}>{auto ? 'Pause' : 'Play'}</button>
          <button type="button" className="tr-next" onClick={() => go(i + 1, true)}>{i === STEPS.length - 1 ? 'Finish' : 'Next'}</button>
          <button type="button" className="tr-close" onClick={close} aria-label="Close the tour">×</button>
        </div>
      </div>
    </div>
  );
}
