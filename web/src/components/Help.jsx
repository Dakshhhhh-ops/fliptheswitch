
// Plain-language help for someone who has never heard of Switch or
// post-quantum crypto: what this is, who's who, what to do on each page, and
// the words the site uses.

const STEPS = [
  { n: '1', t: 'A scanner finds old encryption', d: 'Code that uses encryption a future quantum computer could break, like RSA or ECDSA.' },
  { n: '2', t: 'An AI agent asks the person who owns that code', d: 'Each problem gets its own team-chat room. The engineer explains what the code can’t show, like "40 customers still need the old signature".' },
  { n: '3', t: 'A second AI checks the fix', d: 'A different AI model reviews the change. The AI that wrote it can’t approve its own work.' },
  { n: '4', t: 'Only the security lead can release it', d: 'Anyone else who says "ship it" is turned away. That rule is enforced by Switch, not by trust.' },
];

const CAST = [
  { who: 'Arjun', role: 'Engineer, a person', d: 'Owns the payments code. Knows what is safe to change.' },
  { who: 'Security lead', role: 'A person', d: 'The only one allowed to say "ship it".' },
  { who: 'Scout', role: 'AI agent', d: 'Scans the code and opens a chat room for each problem.' },
  { who: 'Migrator', role: 'AI agent (Claude)', d: 'Writes the fix after talking to the engineer.' },
  { who: 'Reviewer', role: 'AI agent (Codex)', d: 'Checks the fix. Takes requests only from the security lead’s side.' },
  { who: 'Shipper', role: 'AI agent', d: 'Releases the fix, only when the security lead says so.' },
];

export function HowItWorks() {
  return (
    <section className="section hw" id="how">
      <div className="section-head">
        <span className="section-index">How it works</span>
        <h2 className="section-title">
          Fixing old encryption,
          <br />
          <em>with people in charge.</em>
        </h2>
        <p className="section-sub">
          Messages recorded today can be stored and unlocked years from now by a quantum computer, so old encryption has to be
          replaced. <b>Switch</b> is the system that runs the AI agents in team chat and decides who each one will listen to.
        </p>
      </div>

      <ol className="hw-steps">
        {STEPS.map((s) => (
          <li key={s.n} className="hw-step">
            <span className="hw-n">{s.n}</span>
            <b>{s.t}</b>
            <span>{s.d}</span>
          </li>
        ))}
      </ol>

      <h3 className="hw-cast-title">Who's who</h3>
      <ul className="hw-cast">
        {CAST.map((c) => (
          <li key={c.who}>
            <b>{c.who}</b>
            <span className="hw-role">{c.role}</span>
            <span>{c.d}</span>
          </li>
        ))}
      </ul>
      <p className="hw-note">
        Everything you see here happened in three real runs on 6–7 November 2026, on a small payments app with six planted
        problems (F1 to F6). New word? See <a href="#words">the glossary</a>.
      </p>
    </section>
  );
}

// "What you can do here", at the top of each page.
export function Guide({ steps, time }) {
  return (
    <aside className="section gd" aria-label="What you can do here">
      <div className="gd-box">
        <p className="gd-title">
          What you can do here{time ? <span> · {time}</span> : null}
        </p>
        <ol>
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <a className="gd-help" href="#words">New word? Glossary</a>
      </div>
    </aside>
  );
}

const WORDS = [
  ['Post-quantum', 'Encryption designed to stay safe even against a large quantum computer.'],
  ['Q-Day', 'The day a quantum computer can break today’s common encryption. Nobody knows when; this site assumes 2035.'],
  ['Harvest now, decrypt later', 'Attackers record encrypted data today and unlock it on Q-Day. That’s why the fix can’t wait.'],
  ['Mosca’s rule', 'If data must stay secret for X years and moving off old encryption takes Y years, you’re late when X + Y is more than the years left before Q-Day.'],
  ['Switch', 'Open-source software from SandboxAQ that runs AI agents in team chat (here, Mattermost) and enforces who each agent listens to.'],
  ['Agent', 'An AI program with a job: scout, migrator, reviewer or shipper.'],
  ['Room', 'A team-chat channel. Each problem gets its own.'],
  ['Finding (F1–F6)', 'One problem the scanner found, like "F5: webhook signatures use ECDSA".'],
  ['Ship', 'Release the fix: merge it into the main code.'],
  ['Accepted risk', 'A problem the security lead decides to live with for now, written down and signed.'],
  ['ML-KEM, ML-DSA', 'The new post-quantum standards from NIST: ML-KEM protects keys, ML-DSA makes signatures.'],
  ['Signature', 'A digital seal. Change one character of what was signed and the check fails.'],
  ['RSA, ECDSA, ECDH', 'Today’s common encryption and signatures. A quantum computer could break them.'],
  ['SHA-1', 'An old fingerprint method that’s already broken today, no quantum computer needed.'],
  ['CBOM', 'A list of every piece of encryption in the code, like an ingredients list.'],
];

export function Glossary() {
  return (
    <section className="section gl" id="words">
      <div className="section-head">
        <span className="section-index">Glossary</span>
        <h2 className="section-title">
          Words used
          <br />
          <em>on this site.</em>
        </h2>
      </div>
      <dl className="gl-list">
        {WORDS.map(([w, d]) => (
          <div key={w}>
            <dt>{w}</dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
