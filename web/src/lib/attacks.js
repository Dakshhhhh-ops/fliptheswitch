// The attacks "Try to break it" offers, as plain functions so `npm test` can
// run each one against the real signatures (test/attack.test.mjs).
const swapLast = (sha) => sha.slice(0, -1) + (sha.endsWith('0') ? '1' : '0');

export const ATTACKS = {
  ship: [
    { label: 'Order it as "ship F6"', edit: (p) => p.replace(/^order-text .*/m, 'order-text ship F6') },
    { label: 'Say the engineer ordered it', edit: (p) => p.replace(/^ordered-by .*/m, 'ordered-by arjun') },
    { label: 'Swap the approved commit', edit: (p) => p.replace(/^fix (\w+)/m, (_, s) => `fix ${swapLast(s)}`) },
    { label: "Check it with the reviewer's key", key: 'reviewer' },
  ],
  approve: [
    { label: 'Approve a different commit', edit: (p) => p.replace(/^commit (\w+)/m, (_, s) => `commit ${swapLast(s)}`) },
    { label: 'Claim the migrator approved it', edit: (p) => p.replace(/^agent .*/m, 'agent desk4-migrator') },
    { label: "Check it with the shipper's key", key: 'shipper' },
  ],
};
