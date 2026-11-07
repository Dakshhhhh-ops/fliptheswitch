import { useLayoutEffect, useRef } from 'react';
import { calm, gsap } from '../lib/motion.js';
import { STATES } from '../useDesk.js';
import { API, SNAPSHOT, when } from '../lib/snapshot.js';

// A barcode drawn from the CBOM's SHA-256: change one byte and it changes.
function Barcode({ hex }) {
  const bars = [];
  let x = 0;
  for (let i = 0; i < hex.length; i++) {
    const v = parseInt(hex[i], 16);
    const w = 1 + (v % 3);
    if (v % 2 === 0) bars.push(<rect key={i} x={x} y="0" width={w} height="56" />);
    x += w + 1;
  }
  return (
    <svg className="barcode" viewBox={`0 0 ${x} 56`} preserveAspectRatio="none" aria-label={`SHA-256 ${hex}`} role="img">
      {bars}
    </svg>
  );
}

const pad = (left, right, width = 38) => `${left} ${'.'.repeat(Math.max(2, width - left.length - right.length))} ${right}`;

// The desk's state as a till receipt, printed from git. It feeds out as you
// scroll to it.
export default function Receipt({ desk, counts }) {
  const root = useRef(null);
  useLayoutEffect(() => {
    if (calm()) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo('.receipt-paper', { clipPath: 'inset(0 0 100% 0)', yPercent: -6 }, {
        clipPath: 'inset(0 0 0% 0)', yPercent: 0, ease: 'steps(28)', duration: 1.6,
        scrollTrigger: { trigger: root.current, start: 'top 70%' },
      });
    }, root);
    return () => ctx.revert();
  }, []);

  const read = new Date(desk.readAt);
  return (
    <footer className="receipt" id="receipt" ref={root}>
      <div className="receipt-copy">
        <span className="section-index">08 — Receipt</span>
        <h2 className="section-title">
          People decide.
          <br />
          <em>The repo keeps the receipt.</em>
        </h2>
        <p className="section-sub">Everything on this page was read from the agents' git origin, not typed in. The work happens in Switch rooms; this is the record of it.</p>
        <a className="receipt-dl" href={API.cbom} download="demo-payments.cbom.json" data-cursor="Save">
          Download the CBOM <span>CycloneDX 1.6 · JSON</span>
        </a>
        {SNAPSHOT && (
          <p className="snapshot-note">
            Snapshot taken {when(desk.readAt)} · run locally for live updates
          </p>
        )}
      </div>

      <div className="receipt-slot">
        <div className="receipt-paper" role="region" aria-label="Receipt">
          <pre>
{`      CRYPTO MIGRATION DESK
        demo-payments · main
   ${read.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}  ${read.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
--------------------------------------
`}
{desk.rows.map((r) => pad(`${r.id} ${r.algorithm.replace(/ \(.*/, '')}`, r.state.toUpperCase())).join('\n')}
{`
--------------------------------------
`}
{STATES.map((s) => pad(s.toUpperCase(), String(counts[s]))).join('\n')}
{`
${pad('ASSETS MEETING POLICY', `${desk.assets.before.ok} -> ${desk.assets.now.ok}`)}
--------------------------------------
LEDGER
`}
{desk.timeline.map((t) => `${t.sha}  ${t.subject.length > 28 ? `${t.subject.slice(0, 27)}…` : t.subject}`).join('\n')}
{`
--------------------------------------
CBOM ${desk.cbomSerial.replace('urn:uuid:', '').slice(0, 30)}
SHA-256
${desk.cbomSha256.match(/.{1,32}/g).join('\n')}
`}
          </pre>
          <Barcode hex={desk.cbomSha256} />
          <p className="receipt-thanks">first commit {desk.root} · main {desk.head}</p>
        </div>
      </div>
    </footer>
  );
}
