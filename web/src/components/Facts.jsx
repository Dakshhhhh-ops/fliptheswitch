import data from '../data/facts.json';

// Facts no scanner could find: what people said in live run 3, what fixing
// from the code alone would do, and what the run did. facts.json is built from
// docs/live-run-3/chat-log.md by scripts/facts-data.mjs.
export default function Facts() {
  return (
    <section className="section fc" id="facts">
      <div className="section-head">
        <span className="section-index">Negotiated migration</span>
        <h2 className="section-title">
          Facts no scanner
          <br />
          <em>could find.</em>
        </h2>
        <p className="section-sub">
          The fix isn't generated, it's negotiated. These are the facts the engineer and the security lead gave the agents in live
          run 3, word for word, and what each one changed.
        </p>
      </div>

      <ol className="fc-list">
        {data.facts.map((f) => (
          <li className="fc-row" key={`${f.finding}-${f.line}`}>
            <span className="fc-id">{f.finding}<small>{f.what}</small></span>
            <div className="fc-col">
              <span className="fc-label">{f.who} said</span>
              <a className="fc-says" href={f.href} target="_blank" rel="noreferrer">“{f.says}”</a>
            </div>
            <div className="fc-col">
              <span className="fc-label">From the code alone</span>
              <p className="fc-without">{f.without}</p>
            </div>
            <div className="fc-col">
              <span className="fc-label">What the run did</span>
              <a className="fc-changed" href={f.proofHref} target="_blank" rel="noreferrer">{f.changed}</a>
            </div>
          </li>
        ))}
      </ol>

      <p className="fc-dog">
        <strong>It eats its own dog food.</strong> The desk that moves you to post-quantum crypto signs its own approvals and
        releases with ML-DSA-65, so its audit trail survives Q-Day too. <a href="#/verify">Try to forge one →</a>
      </p>
    </section>
  );
}
