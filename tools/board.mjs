#!/usr/bin/env node
// board: the desk's status, read from git, as one HTML page.
//
//   node tools/board.mjs [--origin .origin/demo-payments.git] [--out board.html] [--json]
//
// Nothing here is typed in by hand. The findings come from scanning the first
// commit (before the migration) and main (now) with cbom-scan. A finding is:
//   shipped        a "Ship <id>:" merge is on main
//   accepted risk  ACCEPTED-RISKS.md on main has a line for it, and it isn't shipped
//
// A finding counts once. A shipped finding can still have a risk on record
// (F3 in live run 2: the staging fix shipped, production TLS stays with the
// acquirer), so the board line names those beside the shipped count.
//   in review      a pqc/<id>-* branch exists on the origin
//   open           none of those
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findings, scan, toCbom } from './cbom-scan.mjs';
import { withMosca } from './mosca.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export function readDesk(origin) {
  const work = mkdtempSync(join(tmpdir(), 'desk-board-'));
  try {
    git(['clone', '-q', origin, work]);
    const root = git(['rev-list', '--max-parents=0', 'HEAD'], work).split('\n').pop();
    const headFull = git(['rev-parse', 'HEAD'], work);
    const head = headFull.slice(0, 7);
    const fileAt = (rev, path) => {
      try {
        return git(['show', `${rev}:${path}`], work);
      } catch {
        return null;
      }
    };

    const nowHits = scan(work);
    const now = findings(nowHits);
    const cbomNow = toCbom(nowHits, { name: 'main' });

    const risksFile = join(work, 'ACCEPTED-RISKS.md');
    const risks = existsSync(risksFile) ? parseRisks(readFileSync(risksFile, 'utf8')) : {};

    const ships = {};
    const timeline = [];
    for (const line of git(['log', '--first-parent', '--format=%h%x09%cI%x09%an%x09%s', 'HEAD'], work).split('\n').filter(Boolean)) {
      const [sha, at, author, subject] = line.split('\t');
      const ship = /^Ship (F\d+):\s*(.*)$/.exec(subject);
      const risk = /^Accept risk (F\d+):\s*(.*)$/.exec(subject);
      if (ship && !ships[ship[1]]) ships[ship[1]] = { sha, date: at.slice(0, 10), subject: ship[2] };
      timeline.push({ sha, at, author, subject, kind: ship ? 'ship' : risk ? 'risk' : 'commit', finding: (ship ?? risk)?.[1] ?? null });
    }

    const branches = git(['branch', '-r', '--format=%(refname:short)'], work)
      .split('\n')
      .map((b) => b.replace(/^origin\//, ''))
      .filter((b) => b.startsWith('pqc/'));

    git(['checkout', '-q', root], work);
    const baseHits = scan(work);
    const base = withMosca(findings(baseHits), work);
    const cbomBase = toCbom(baseHits, { name: 'before' });

    const rows = base.map((f) => {
      const key = `${f.file}#${f.algorithm}`;
      const stillFlagged = now.some((n) => `${n.file}#${n.algorithm}` === key);
      const branch = branches.find((b) => b.startsWith(`pqc/${f.id.toLowerCase()}-`));
      let state = 'open';
      if (ships[f.id]) state = 'shipped';
      else if (risks[f.id]) state = 'accepted risk';
      else if (branch) state = 'in review';
      // The file as it was before the migration, and as it is on main now.
      const code = { before: fileAt(root, f.file), now: fileAt(headFull, f.file) };
      return { ...f, state, stillFlagged, branch, ship: ships[f.id], risk: risks[f.id], code };
    });

    return {
      head,
      root: root.slice(0, 7),
      rows,
      branches,
      timeline,
      assets: { before: summarize(cbomBase), now: summarize(cbomNow) },
      inventory: { before: assetList(cbomBase), now: assetList(cbomNow) },
      cbom: cbomNow,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function parseRisks(md) {
  const out = {};
  for (const line of md.split(/\r?\n/)) {
    const m = /^\s*-\s*(F\d+):\s*(.+)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

// The CBOM's assets, flattened for display.
function assetList(cbom) {
  return cbom.components.map((c) => ({
    ref: c['bom-ref'],
    name: c.name,
    status: c.properties.find((p) => p.name === 'crypto-desk:status')?.value,
    primitive: c.cryptoProperties.algorithmProperties.primitive,
    nistQuantumLevel: c.cryptoProperties.algorithmProperties.nistQuantumSecurityLevel,
    oid: c.cryptoProperties.oid ?? null,
    occurrences: c.evidence.occurrences.map((o) => ({ file: o.location, line: o.line })),
  }));
}

function summarize(cbom) {
  const count = { ok: 0, vulnerable: 0, broken: 0, policy: 0, review: 0 };
  for (const c of cbom.components) {
    const status = c.properties.find((p) => p.name === 'crypto-desk:status')?.value;
    count[status] = (count[status] ?? 0) + 1;
  }
  return { total: cbom.components.length, ...count };
}

export function counts(rows) {
  const c = { shipped: 0, 'accepted risk': 0, 'in review': 0, open: 0, 'risks on record': 0 };
  for (const r of rows) {
    c[r.state]++;
    if (r.risk) c['risks on record']++;
  }
  return c;
}

// "Shipped 3/6 (F3 with a risk on record) · Accepted risk 0 · In review 0 · Open 3"
export function boardLine(rows) {
  const c = counts(rows);
  const withRisk = rows.filter((r) => r.state === 'shipped' && r.risk).map((r) => r.id);
  const shipped = `Shipped ${c.shipped}/${rows.length}${withRisk.length ? ` (${withRisk.join(', ')} with a risk on record)` : ''}`;
  return [shipped, `Accepted risk ${c['accepted risk']}`, `In review ${c['in review']}`, `Open ${c.open}`].join(' · ');
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export function html(desk) {
  const c = counts(desk.rows);
  const n = desk.rows.length;
  const rows = desk.rows.map((r) => {
    const detail = r.ship
      ? `Merged <code>${esc(r.ship.sha)}</code> on ${esc(r.ship.date)}${r.stillFlagged ? ' · still in the scan (dual-signed, classical kept on purpose)' : ''}${r.risk ? ` · risk on record: ${esc(r.risk)}` : ''}`
      : r.risk
        ? esc(r.risk)
        : r.branch
          ? `Branch <code>${esc(r.branch)}</code>`
          : 'Not started';
    return `<tr>
      <td class="id">${esc(r.id)}</td>
      <td><span class="pri">${esc(r.priority)}</span></td>
      <td><code>${esc(r.file)}:${esc(r.line)}</code></td>
      <td>${esc(r.algorithm)}<div class="why">${esc(r.status)}</div></td>
      <td><span class="state s-${r.state.replace(' ', '-')}">${esc(r.state)}</span></td>
      <td class="detail">${detail}</td>
    </tr>`;
  }).join('');
  const bar = ['shipped', 'accepted risk', 'in review', 'open']
    .map((k) => (c[k] ? `<span class="seg s-${k.replace(' ', '-')}" style="flex:${c[k]}" title="${k}: ${c[k]}"></span>` : ''))
    .join('');
  const a = desk.assets;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crypto Desk board</title>
<style>
  :root { --bg:#f7f7f5; --card:#fff; --ink:#16181d; --muted:#5d6470; --line:#e3e4e8;
          --ok:#1f7a4d; --risk:#9a6700; --review:#2a5bd7; --open:#6b717c; --pill-ink:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111317; --card:#1a1d23; --ink:#eceef2; --muted:#9aa1ad; --line:#2b2f37;
          --ok:#4cc38a; --risk:#e0b341; --review:#7aa2ff; --open:#9aa1ad; --pill-ink:#111317; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1040px; margin: 0 auto; padding: 28px 16px 48px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 22px; }
  .tiles { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:12px; margin-bottom: 14px; }
  .tile { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
  .tile b { display:block; font-size: 28px; line-height: 1.1; }
  .tile span { color: var(--muted); font-size: 13px; }
  .bar { display:flex; height:10px; border-radius:6px; overflow:hidden; background:var(--line); margin: 6px 0 26px; }
  .seg { display:block; }
  .s-shipped { background: var(--ok); } .s-accepted-risk { background: var(--risk); }
  .s-in-review { background: var(--review); } .s-open { background: var(--open); }
  .tablewrap { overflow-x:auto; background:var(--card); border:1px solid var(--line); border-radius:10px; }
  table { border-collapse: collapse; width: 100%; min-width: 760px; }
  th, td { text-align:left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  tr:last-child td { border-bottom: 0; }
  .id { font-weight: 700; } .pri { font-variant-numeric: tabular-nums; color: var(--muted); }
  .why { color: var(--muted); font-size: 13px; }
  .state { display:inline-block; color:var(--pill-ink); font-weight:600; border-radius: 999px; padding: 2px 10px; font-size: 13px; white-space: nowrap; }
  .detail { color: var(--muted); font-size: 14px; }
  code { font: 13px ui-monospace, SFMono-Regular, Consolas, monospace; }
  footer { color: var(--muted); font-size: 13px; margin-top: 16px; }
</style></head><body><main>
<h1>Crypto Migration Desk</h1>
<p class="sub">demo-payments · main at <code>${esc(desk.head)}</code> · read from git, not typed in</p>
<div class="tiles">
  <div class="tile"><b>${c.shipped}/${n}</b><span>shipped</span></div>
  <div class="tile"><b>${c['accepted risk']}</b><span>accepted risk</span></div>
  <div class="tile"><b>${c['in review']}</b><span>in review</span></div>
  <div class="tile"><b>${c.open}</b><span>open</span></div>
  <div class="tile"><b>${a.before.ok} → ${a.now.ok}</b><span>crypto assets that meet policy (CBOM)</span></div>
</div>
<div class="bar" role="img" aria-label="${c.shipped} shipped, ${c['accepted risk']} accepted risk, ${c['in review']} in review, ${c.open} open">${bar}</div>
<div class="tablewrap"><table>
<thead><tr><th>#</th><th>Priority</th><th>Where</th><th>Algorithm</th><th>State</th><th>Evidence</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<footer>Findings from <code>tools/cbom-scan.mjs</code> on the first commit (<code>${esc(desk.root)}</code>). Shipped = a "Ship" merge on main. Accepted risk = a line in ACCEPTED-RISKS.md on main. In review = a pqc/ branch on the origin.</footer>
</main></body></html>
`;
}

function main(argv) {
  const args = argv.slice(2);
  const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const origin = resolve(opt('--origin', join(DESK, '.origin', 'demo-payments.git')));
  const desk = readDesk(origin);
  if (args.includes('--json')) return console.log(JSON.stringify(desk, null, 2));
  const out = resolve(opt('--out', join(DESK, 'board.html')));
  writeFileSync(out, html(desk));
  const c = counts(desk.rows);
  console.log(`Shipped ${c.shipped}/${desk.rows.length} · Accepted risk ${c['accepted risk']} · In review ${c['in review']} · Open ${c.open}`);
  console.log(`Board written to ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);
