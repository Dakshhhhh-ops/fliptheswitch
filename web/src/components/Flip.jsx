import { useState } from 'react';

// Flip the switch: five moments from the live runs. With Switch on, each
// outcome is what Switch recorded, linked to the log. With Switch off, the
// outcome is a what-if: the same message with Switch's rules taken away.
const LOG3 = 'https://github.com/Dakshhhhh-ops/fliptheswitch/blob/main/docs/live-run-3/chat-log.md?plain=1';
const RUN1 = 'https://github.com/Dakshhhhh-ops/fliptheswitch/blob/main/docs/live-run/README.md?plain=1';

const BEATS = [
  {
    id: 'approve',
    rule: 'Reviewer takes requests only from the owner and their agents',
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
    rule: 'One exclusive reviewer role per room',
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
    rule: 'Only the agent that made a document can change it',
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
    rule: 'Shipper obeys only its owner',
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
    rule: 'The same rule, from the person it lets through',
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
        <span className="section-index">01 — Flip the switch</span>
        <h2 className="section-title">
          Take Switch
          <br />
          <em>away.</em>
        </h2>
        <p className="section-sub">
          Five moments from the live runs. With Switch on, each answer is what Switch recorded, linked to the log. Turn it off
          and the same messages meet no rules: that side is a what-if, not a recording.
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
                    <span className="fl-after">{out.after}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

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
