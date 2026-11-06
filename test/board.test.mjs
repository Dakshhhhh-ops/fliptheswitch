import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { boardLine, counts, html, parseRisks, readDesk } from '../tools/board.mjs';

const demo = fileURLToPath(new URL('../demo-payments', import.meta.url));
const git = (args, cwd) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd, stdio: 'ignore' });

// A bare origin holding demo-payments, then the history a run would leave.
function originAfterRun() {
  const dir = mkdtempSync(join(tmpdir(), 'board-test-'));
  const work = join(dir, 'work');
  cpSync(demo, work, { recursive: true });
  git(['init', '-q', '-b', 'main'], work);
  git(['add', '.'], work);
  git(['commit', '-q', '-m', 'before migration'], work);

  // F1 fixed on a branch, then shipped.
  git(['checkout', '-q', '-b', 'pqc/f1-envelope'], work);
  writeFileSync(join(work, 'src', 'envelope.js'), "import c from 'node:crypto';\nc.generateKeyPairSync('ml-kem-768');\nc.generateKeyPairSync('x25519');\nc.createCipheriv('aes-256-gcm', k, iv);\n");
  git(['commit', '-q', '-am', 'F1: hybrid key wrap'], work);
  git(['checkout', '-q', 'main'], work);
  git(['merge', '-q', '--no-ff', 'pqc/f1-envelope', '-m', 'Ship F1: hybrid key wrap (approved by reviewer at abc1234, shipped by the security lead)'], work);

  // F3 accepted as a risk on main.
  writeFileSync(join(work, 'ACCEPTED-RISKS.md'), '# Accepted risks\n\n- F3: TLS terminates at the acquirer gateway (owner: user, review by: 2027-02-02)\n');
  git(['add', 'ACCEPTED-RISKS.md'], work);
  git(['commit', '-q', '-m', 'Accept risk F3: acquirer gateway'], work);

  // F5 has a branch under review.
  git(['branch', 'pqc/f5-webhooks'], work);

  const origin = join(dir, 'origin.git');
  git(['clone', '-q', '--bare', work, origin], dir);
  return origin;
}

test('reads every state from git', () => {
  const desk = readDesk(originAfterRun());
  const state = Object.fromEntries(desk.rows.map((r) => [r.id, r.state]));
  assert.equal(desk.rows.length, 6, 'findings come from the first commit, so all six stay listed');
  assert.equal(state.F1, 'shipped');
  assert.equal(state.F3, 'accepted risk');
  assert.equal(state.F5, 'in review');
  assert.equal(state.F2, 'open');
  assert.deepEqual(counts(desk.rows), { shipped: 1, 'accepted risk': 1, 'in review': 1, open: 3, 'risks on record': 1 });
});

test('a shipped fix that cleared the scan is not marked as still flagged', () => {
  const f1 = readDesk(originAfterRun()).rows.find((r) => r.id === 'F1');
  assert.equal(f1.stillFlagged, false);
  assert.match(f1.ship.subject, /hybrid key wrap/);
});

test('the CBOM count of assets that meet policy goes up after a fix', () => {
  const { assets } = readDesk(originAfterRun());
  assert.ok(assets.now.ok > assets.before.ok);
});

test('accepted risks are read from the markdown file', () => {
  assert.deepEqual(parseRisks('# Accepted risks\n\n- F3: reason one\n- F6: reason two\nnot a risk\n'), { F3: 'reason one', F6: 'reason two' });
});

test('the page escapes what it shows', () => {
  const page = html({
    head: 'abc', root: 'def',
    assets: { before: { ok: 0 }, now: { ok: 0 } },
    rows: [{ id: 'F1', priority: 'P1', file: 'src/x.js', line: 1, algorithm: '<script>', status: 'vulnerable', state: 'open' }],
  });
  assert.doesNotMatch(page, /<script>/);
  assert.match(page, /&lt;script&gt;/);
});

test('a shipped finding with a risk on record is named on the board line', () => {
  const rows = [
    { id: 'F1', state: 'shipped' },
    { id: 'F3', state: 'shipped', risk: 'production TLS is on the acquirer gateway' },
    { id: 'F5', state: 'open' },
  ];
  assert.equal(boardLine(rows), 'Shipped 2/3 (F3 with a risk on record) · Accepted risk 0 · In review 0 · Open 1');
  assert.equal(counts(rows)['risks on record'], 1);
});
