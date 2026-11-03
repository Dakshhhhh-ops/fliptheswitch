#!/usr/bin/env node
// medlist: the only way the medicine list changes. @register runs it.
//
//   node tools/medlist.mjs show
//   node tools/medlist.mjs add "<brand>" --dose 1-0-1 [--when "after food"] [--for BP] [--for-hi बीपी] --by <name> --reason "<why>"
//   node tools/medlist.mjs remove "<brand>" --by <name> --reason "<why>"
//   node tools/medlist.mjs replace "<old brand>" "<new brand>" [--dose 1-0-0] --by <name> --reason "<why>"
//   node tools/medlist.mjs chart [--out state/pill-chart.html]
//   node tools/medlist.mjs log
//
// Every change needs who decided it and why, is checked against the lookup
// table, and is appended to the decision log. Who may decide is not this
// tool's job: Switch only lets the decision-maker address @register.
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LOG_FILE, STATE, doseText, lookup, readList, readLog, writeList } from './lib.mjs';

function parseDose(text) {
  const m = /^(\d)-(\d)-(\d)$/.exec(text ?? '');
  if (!m) throw new Error(`dose must look like 1-0-1 (morning-afternoon-night), not "${text}"`);
  return { morning: +m[1], afternoon: +m[2], night: +m[3] };
}

function find(list, brand) {
  const target = lookup(brand)?.brand ?? brand;
  const i = list.medicines.findIndex((m) => m.brand.toLowerCase() === target.toLowerCase());
  if (i < 0) throw new Error(`${brand} is not on the list`);
  return i;
}

function entry(brand, opts, base = {}) {
  const info = lookup(brand);
  if (!info) throw new Error(`${brand} is not in the lookup table. Add it there first, so it can be checked.`);
  return {
    brand: info.brand,
    contains: info.ingredients.map((i) => `${i.name} ${i.mg} mg`).join(' + '),
    dose: opts.dose ? parseDose(opts.dose) : base.dose ?? parseDose(undefined),
    when: opts.when ?? base.when ?? '',
    for: opts.for ?? base.for ?? '',
    forHi: opts['for-hi'] ?? base.forHi ?? '',
  };
}

export function apply(list, change) {
  const next = structuredClone(list);
  if (change.action === 'add') {
    if (next.medicines.some((m) => m.brand === lookup(change.brand)?.brand)) throw new Error(`${change.brand} is already on the list`);
    next.medicines.push(entry(change.brand, change.opts));
  } else if (change.action === 'remove') {
    next.medicines.splice(find(next, change.brand), 1);
  } else if (change.action === 'replace') {
    const i = find(next, change.brand);
    next.medicines[i] = entry(change.to, change.opts, next.medicines[i]);
  } else {
    throw new Error(`unknown change ${change.action}`);
  }
  next.version = (list.version ?? 0) + 1;
  next.updatedAt = change.at;
  next.updatedBy = change.by;
  return next;
}

export function table(list) {
  const rows = list.medicines.map((m) => `| ${m.brand} | ${m.contains} | ${doseText(m.dose)} | ${m.when} | ${m.for} |`);
  return [
    `**${list.patient}** · version ${list.version} · updated ${list.updatedAt} by ${list.updatedBy}`,
    '',
    '| Medicine | Contains | Morning-Afternoon-Night | When | For |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

const SLOTS = [
  { key: 'morning', en: 'Morning', hi: 'सुबह', icon: '☀️' },
  { key: 'afternoon', en: 'Afternoon', hi: 'दोपहर', icon: '🌤️' },
  { key: 'night', en: 'Night', hi: 'रात', icon: '🌙' },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function chart(list) {
  const sections = SLOTS.map((slot) => {
    const meds = list.medicines.filter((m) => m.dose[slot.key] > 0);
    const items = meds.length
      ? meds.map((m) => `<li><span class="name">${esc(m.brand)}</span> <span class="count">× ${m.dose[slot.key]}</span><span class="note">${esc(m.when)}${m.for ? ` · ${esc(m.for)}${m.forHi ? ` / ${esc(m.forHi)}` : ''}` : ''}</span></li>`).join('')
      : '<li class="none">No tablets · कोई दवा नहीं</li>';
    return `<section><h2><span>${slot.icon}</span> ${slot.hi} · ${slot.en}</h2><ul>${items}</ul></section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="hi"><head><meta charset="utf-8"><title>${esc(list.patient)} · दवा चार्ट</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: "Noto Sans", "Nirmala UI", system-ui, sans-serif; color: #111; background: #fff; margin: 0 auto; max-width: 780px; padding: 16px; }
  h1 { font-size: 30px; margin: 0 0 4px; }
  .meta { font-size: 16px; color: #444; margin-bottom: 18px; }
  section { border: 3px solid #111; border-radius: 12px; padding: 10px 16px; margin-bottom: 14px; break-inside: avoid; }
  h2 { font-size: 28px; margin: 4px 0 8px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { font-size: 26px; padding: 8px 0; border-top: 1px solid #ccc; }
  li:first-child { border-top: 0; }
  .name { font-weight: 700; } .count { font-weight: 700; }
  .note { display: block; font-size: 18px; color: #333; }
  .none { color: #555; }
  footer { font-size: 14px; color: #444; margin-top: 12px; }
</style></head><body>
<h1>${esc(list.patient)} · दवा चार्ट</h1>
<div class="meta">Version ${list.version} · ${esc(list.updatedAt)} · approved by ${esc(list.updatedBy)}</div>
${sections}
<footer>Made from the family's medicine list. Do not change doses without asking the doctor. · डॉक्टर से पूछे बिना दवा न बदलें।</footer>
</body></html>
`;
}

// The family's clock, not the server's: "2026-11-05 14:30".
function localTime() {
  return new Date().toLocaleString('sv-SE', { timeZone: process.env.FAMILY_TZ ?? 'Asia/Kolkata' }).slice(0, 16);
}

function opts(args) {
  const o = {};
  for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) o[args[i].slice(2)] = args[++i];
  return o;
}

function main(argv) {
  const [cmd, ...rest] = argv.slice(2);
  const positional = rest.filter((a, i) => !a.startsWith('--') && !(rest[i - 1] ?? '').startsWith('--'));
  const o = opts(rest);
  const list = readList();

  if (cmd === 'show') return console.log(table(list));
  if (cmd === 'log') return console.log(readLog().map((d) => `${d.at} · v${d.version} · ${d.summary} · by ${d.by} · ${d.reason}`).join('\n') || 'No decisions yet.');
  if (cmd === 'chart') {
    const out = o.out ?? join(STATE, 'pill-chart.html');
    writeFileSync(out, chart(list));
    return console.log(`Pill chart written to ${out}`);
  }

  if (!['add', 'remove', 'replace'].includes(cmd)) {
    console.error('usage: medlist show | add | remove | replace | chart | log');
    process.exit(2);
  }
  if (!o.by || !o.reason) {
    console.error('Every change needs --by <who decided> and --reason "<why>".');
    process.exit(2);
  }
  const change = { action: cmd, brand: positional[0], to: positional[1], opts: o, by: o.by, at: localTime() };
  const next = apply(list, change);
  writeList(next);
  const summary = cmd === 'replace' ? `replaced ${change.brand} with ${lookup(change.to).brand}` : `${cmd === 'add' ? 'added' : 'removed'} ${change.brand}`;
  appendFileSync(LOG_FILE, JSON.stringify({ at: change.at, version: next.version, summary, by: change.by, reason: o.reason }) + '\n');
  console.log(`v${next.version}: ${summary}. Reason: ${o.reason}\n\n${table(next)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
