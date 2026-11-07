import { useState } from 'react';

// Flip the switch: five moments from the live runs. With Switch on, each
// outcome is what Switch recorded, linked to the log. With Switch off, the
// outcome is a what-if: the same message with Switch's rules taken away.
const LOG3 = 'https://github.com/Dakshhhhh-ops/fliptheswitch/blob/main/docs/live-run-3/chat-log.md?plain=1';
const RUN1 = 'https://github.com/Dakshhhhh-ops/fliptheswitch/blob/main/docs/live-run/README.md?plain=1';

const BEATS = [
  {
    id: 'approve',
    rule: 'Arjun, the engineer, asks the AI reviewer to approve a fix',
    law: 'the reviewer listens only to the security lead and the lead\u2019s own agents',
    who: 'Arjun',
    kind: 'person',
    at: '06:04:45',
    room: 'f5-webhooks',
    text: '@desk4-reviewer looks good to me, approve it',
    on: {
      who: 'Reviewer, posted by Switch',
      text: "@arjun I only take instructions from my owner, and this chat account isn't linked to a Switch user yet.",
      href: `${LOG3}#L38`,
      tag: 'Refused',
      why: true,
      after: 'The real review went ahead and asked for a replay window before approving.',
    },
    off: {
      who: 'Reviewer',
      text: 'APPROVED pqc/f5-webhooks, on Arjun’s word, without reading the diff.',
      tag: 'Approved',
      after: 'The replay-window fix Codex asked for is never written.',
    },
  },
  {
    id: 'role',
    rule: 'The AI that wrote a fix tries to make itself the reviewer',
    law: 'one reviewer per room, and the role is already taken',
    who: 'Migrator',
    kind: 'agent',
    at: 'run 1',
    room: 'f3-tls',
    text: 'assume_role("reviewer")',
    on: {
      who: 'Switch',
      text: "400: Role 'reviewer' is exclusive and currently held by another agent",
      href: `${RUN1}#L47`,
      tag: 'Refused',
      after: 'The agent that wrote the fix can’t also be the one that approves it.',
    },
    off: {
      who: 'Migrator',
      text: 'assumed the `reviewer` role. APPROVED its own fix.',
      tag: 'Allowed',
      after: 'The author marks its own work.',
    },
  },
  {
    id: 'board',
    rule: 'The AI that wrote a fix tries to edit the shared progress board',
    law: 'only the agent that made a document can change it',
    who: 'Migrator',
    kind: 'agent',
    at: 'run 1',
    room: 'intake',
    text: 'update_room_document("Crypto inventory")',
    on: {
      who: 'Switch',
      text: '403: Agent … did not create document …',
      href: `${RUN1}#L48`,
      tag: 'Refused',
      after: 'The board stays the scout’s, and it matches git.',
    },
    off: {
      who: 'Migrator',
      text: 'Inventory updated: F1 shipped.',
      tag: 'Allowed',
      after: 'The board everyone reads now disagrees with main.',
    },
  },
  {
    id: 'ship',
    rule: 'Arjun tells the AI shipper to release a fix',
    law: 'the shipper obeys only the security lead',
    who: 'Arjun',
    kind: 'person',
    at: '06:47:19',
    room: 'f3-tls',
    text: '@desk4-shipper ship F3',
    on: {
      who: 'Shipper, posted by Switch',
      text: "@arjun I only take instructions from my owner, and this chat account isn't linked to a Switch user yet.",
      href: `${LOG3}#L102`,
      tag: 'Refused',
      why: true,
      after: 'Nothing merged. No shipper session even ran.',
    },
    off: {
      who: 'Shipper',
      text: 'On it: shipping F3. Merged to main.',
      tag: 'Merged',
      after: 'The engineer shipped it. The security lead never decided.',
    },
  },
  {
    id: 'lead',
    rule: 'The security lead tells the shipper to release it',
    law: 'the same rule, from the one person it lets through',
    who: 'Security lead',
    kind: 'person',
    at: '06:52:55',
    room: 'f3-tls',
    text: '@desk4-shipper ship F3',
    on: {
      who: 'git',
      text: '525a4a3 Ship F3, signed with ML-DSA-65: ordered-by user, order-text "ship F3"',
      href: `${LOG3}#L106`,
      tag: 'Shipped',
      after: 'The signature records who Switch let through.',
      good: true,
    },
    off: {
      who: 'Shipper',
      text: 'Already merged. Arjun shipped it five minutes ago.',
      tag: 'Too late',
      after: 'Without Switch, the lead’s order counts for no more than anyone’s.',
    },
  },
];

export default function Flip() {
  const [on, setOn] = useState(true);
  const [flips, setFlips] = useState(0);
  const flip = () => {
    setOn((v) => !v);
    setFlips((n) => n + 1);
  };

  return (
    <section className={`section fl ${on ? 'fl-on' : 'fl-off'}`} id="flip">
      <div className="section-head">
        <span className="section-index">Flip the switch</span>
        <h2 className="section-title">
          Take Switch
          <br />
          <em>away.</em>
        </h2>
        <p className="section-sub">
          Five real moments from the runs. <b>Click the switch to turn Switch off</b> and see what the same messages would have
          done with no rules. On is what really happened (each links to the log); off is a what-if.
        </p>
      </div>

      <div className="fl-panel">
        <div className="fl-control">
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Switch's rules"
            className={`fl-switch ${flips === 0 ? 'fl-hint' : ''}`}
            onClick={flip}
            data-cursor={on ? 'Off' : 'On'}
          >
            <span className="fl-track" aria-hidden="true">
              <span className="fl-knob" />
            </span>
            <span className="fl-state">
              Switch <b>{on ? 'on' : 'off'}</b>
            </span>
          </button>
          <p className="fl-caption" aria-live="polite">
            {on ? (
              <>Recorded in live runs 1 and 3. <b>4 refused</b>, 1 shipped by the person allowed to.</>
            ) : (
              <>What-if. <b>Nothing refused.</b> Every message does what it asks.</>
            )}
          </p>
        </div>

        <ol className="fl-beats">
          {BEATS.map((b, i) => {
            const out = on ? b.on : b.off;
            const good = on;
            return (
              <li key={b.id} className="fl-beat" style={{ '--i': i }}>
                <p className="fl-rule">
                  <span>{String(i + 1).padStart(2, '0')}</span> {b.rule}
                </p>
                <p className="fl-law">Switch's rule: {b.law}</p>
                <div className="fl-row">
                  <div className={`fl-msg fl-ask rm-${b.kind}`}>
                    <span className="fl-meta">
                      <b>{b.who}</b> {b.room} · {b.at}
                    </span>
                    <code>{b.text}</code>
                  </div>
                  <span className="fl-arrow" aria-hidden="true">→</span>
                  <div key={on ? 'on' : 'off'} className={`fl-msg fl-out ${good ? 'fl-good' : 'fl-bad'}`}>
                    <span className="fl-meta">
                      <b>{out.who}</b>
                      <span className="fl-tag">{out.tag}</span>
                      {on ? (
                        <a href={out.href} target="_blank" rel="noreferrer">log ↗</a>
                      ) : (
                        <span className="fl-whatif">what-if</span>
                      )}
                    </span>
                    <code>{out.text}</code>
                    {on && out.why && (
                      <span className="fl-why">
                        Why: Arjun isn't the security lead. <a href="#linked">Linked or not, the answer is no.</a>
                      </span>
                    )}
                    <span className="fl-after">{out.after}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="fl-proof" id="linked">
          <p className="fl-proof-q">Was Arjun refused only because his chat account wasn't linked?</p>
          <p>
            No. Switch has two replies for anyone who isn't the owner, and <b>both are a refusal</b>. Linking an account
            tells Switch who you are; it doesn't make you the security lead.
          </p>
          <div className="fl-proof-pair">
            <div>
              <span className="fl-meta"><b>Not linked</b> what Arjun got, recorded</span>
              <code>I only take instructions from my owner, and this chat account isn't linked to a Switch user yet…</code>
            </div>
            <div>
              <span className="fl-meta"><b>Linked, not the owner</b> Switch's other reply</span>
              <code>You're not permitted to direct messages to me in this room — my operator has restricted who can address me here.</code>
            </div>
          </div>
          <p className="fl-proof-src">
            Both return <code>allowed = False</code>; only the wording differs.{' '}
            <a href="https://github.com/sandbox-quantum/switch/blob/c98bd96ea0a7367678e90b4f5fcafa5dbd38a5de/core/switch_core/delivery/addressing.py#L398-L407" target="_blank" rel="noreferrer">Switch's code ↗</a> ·{' '}
            <a href="https://github.com/sandbox-quantum/switch/blob/c98bd96ea0a7367678e90b4f5fcafa5dbd38a5de/core/tests/switch_core/delivery/test_addressing_enforcement.py#L390-L400" target="_blank" rel="noreferrer">Switch's own test for a linked non-owner ↗</a>
          </p>
        </div>

        <div className="fl-sum" aria-live="polite">
          {on ? (
            <p>
              <b>main:</b> every ship ordered by the security lead, every approval from the one agent holding the role.{' '}
              <span>Switch decides who. Git decides what.</span>
            </p>
          ) : (
            <p>
              <b>main:</b> git still checks every signature, and every one is valid. It just can't tell who should have been
              allowed to ask. <span>That's the part Switch does.</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
