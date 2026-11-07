import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { calm, gsap, ScrollTrigger } from '../lib/motion.js';
import { API, SNAPSHOT, when } from '../lib/snapshot.js';

const HEX = '0123456789abcdef';
const clamp = (v) => Math.max(0, Math.min(1, v));

// Shows `text` decoded up to `k` characters; the rest is noise.
function decode(text, k) {
  let out = '';
  for (let i = 0; i < text.length; i++) out += i < k || text[i] === ' ' ? text[i] : HEX[(Math.random() * 16) | 0];
  return out;
}

function Bytes({ parts, dimRef }) {
  return (
    <div className="qd-bytes" ref={dimRef}>
      {parts.map((p) => (
        <div className="qd-part" key={p.label}>
          <span className="qd-part-label">
            {p.label} <b>{p.bytes} B</b>
          </span>
          <code className="qd-hex">{p.hex}</code>
        </div>
      ))}
    </div>
  );
}

// Harvest now, decrypt later: a real specimen sealed twice on the server a
// moment ago. Scrolling moves the dial to Q-Day; the RSA-sealed copy opens,
// the hybrid one doesn't.
export default function QDay() {
  const [spec, setSpec] = useState(null);
  const root = useRef(null);
  const dial = useRef(null);
  const year = useRef(null);
  const plain = useRef(null);
  const classicHex = useRef(null);
  const stamp = useRef(null);

  const load = () => fetch(API.specimen).then((r) => r.json()).then(setSpec).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  useLayoutEffect(() => {
    if (!spec) return undefined;
    const update = (p) => {
      dial.current.style.setProperty('--p', p);
      year.current.textContent = p < 0.62 ? `Recorded · ${new Date(spec.madeAt).getFullYear()}` : 'Q-Day';
      const k = Math.round(clamp((p - 0.62) / 0.22) * spec.plaintext.length);
      plain.current.textContent = p < 0.62 ? '' : decode(spec.plaintext, k);
      plain.current.classList.toggle('done', k >= spec.plaintext.length);
      classicHex.current.style.opacity = String(1 - clamp((p - 0.6) / 0.15) * 0.85);
      stamp.current.classList.toggle('on', p > 0.66);
      root.current.classList.toggle('opened', p > 0.62);
    };
    if (calm()) {
      update(1);
      return undefined;
    }
    const mm = gsap.matchMedia();
    mm.add('(min-width: 961px)', () => {
      const st = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top top', end: '+=160%', pin: true, scrub: 0.6, refreshPriority: 1, onUpdate: (s) => update(s.progress) },
      });
      return () => st.kill();
    });
    mm.add('(max-width: 960px)', () => {
      const st = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top 70%', end: 'bottom 40%', scrub: 0.6, onUpdate: (s) => update(s.progress) },
      });
      return () => st.kill();
    });
    update(0);
    // Pinning adds scroll length above everything below; recompute their positions.
    ScrollTrigger.refresh();
    return () => mm.revert();
  }, [spec]);

  return (
    <section className="qday" id="qday" ref={root}>
      <div className="qd-head">
        <span className="section-index">02 — Harvest now, decrypt later</span>
        <h2 className="section-title">
          Recorded today.
          <br />
          <em>Opened on Q-Day.</em>
        </h2>
        <p className="section-sub">
          {SNAPSHOT ? (
            <>
              A test card number was sealed twice with <code>node:crypto</code> when this snapshot was exported
              {spec && <> ({when(spec.madeAt)})</>}. The bytes below are that real ciphertext.{' '}
            </>
          ) : (
            <>
              The server just sealed a test card number twice with <code>node:crypto</code>. The bytes below are that real
              ciphertext.{' '}
            </>
          )}
          Scroll to move the dial to Q-Day: the day a large quantum computer exists. Nobody knows when. NIST plans to deprecate
          RSA and elliptic curves in 2030 and disallow them in 2035.
        </p>
      </div>

      <div className="qd-dial" ref={dial} aria-hidden="true">
        <span className="qd-track" />
        <span className="qd-knob" />
        <span className="qd-year" ref={year}>Recorded</span>
        <span className="qd-mark qd-mark-now">Today</span>
        <span className="qd-mark qd-mark-q">Q-Day ?</span>
      </div>

      {spec ? (
        <div className="qd-grid">
          <article className="qd-card qd-classic">
            <header>
              <span className="qd-tag">Today's code</span>
              <h3>{spec.classical.scheme}</h3>
            </header>
            <Bytes parts={spec.classical.parts} dimRef={classicHex} />
            <p className="sr-only">After Q-Day, a large quantum computer could recover the plaintext from this copy: {spec.plaintext}.</p>
            <div className="qd-plain" aria-hidden="true">
              <span className="qd-plain-label">After Q-Day, recovered by Shor's algorithm</span>
              <span className="qd-plain-text" ref={plain} />
            </div>
            <footer>{spec.classical.ms} ms to seal, including key generation</footer>
          </article>
          <article className="qd-card qd-hybrid">
            <header>
              <span className="qd-tag">After the migration</span>
              <h3>{spec.hybrid.scheme}</h3>
            </header>
            <Bytes parts={spec.hybrid.parts} />
            <p className="sr-only">This copy stays sealed after Q-Day.</p>
            <div className="qd-stamp" ref={stamp} aria-hidden="true">
              <span>Still sealed</span>
            </div>
            <footer>{spec.hybrid.ms} ms to seal, including key generation</footer>
          </article>
        </div>
      ) : (
        <p className="qd-wait">{SNAPSHOT ? 'Loading the specimen…' : 'Sealing a specimen…'}</p>
      )}

      <div className="qd-foot">
        <span>
          Illustration: the ciphertext is real and {SNAPSHOT ? 'was sealed at export time' : 'new on every visit'}; the RSA copy
          "opening" is what a large quantum computer would allow, not something done here.
        </span>
        {SNAPSHOT ? (
          <span className="qd-snap">Snapshot · run locally to seal a new one</span>
        ) : (
          <button type="button" onClick={load} data-cursor="Reseal">
            Seal a new specimen
          </button>
        )}
      </div>
    </section>
  );
}
