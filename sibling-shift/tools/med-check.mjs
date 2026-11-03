#!/usr/bin/env node
// med-check: compare a new prescription with the current medicine list.
//
//   node tools/med-check.mjs <prescription.json> [--list state/medicines.json] [--json]
//
// It flags only what a fixed lookup table can show for certain:
//   duplicate:  the same ingredient twice (including inside combination tablets)
//   same-class: two different medicines from the same family
//   unknown:    a brand not in the table, so nothing about it can be checked
// It never says what to take. Every flag ends in a question for the doctor.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LIST_FILE, lookup } from './lib.mjs';

function resolve(item, source) {
  const info = lookup(item.brand);
  return { ...item, source, info };
}

export function check(current, prescription) {
  const doctor = prescription.doctor ?? 'the doctor';
  const existing = current.medicines.map((m) => resolve(m, 'current'));
  const incoming = prescription.items.map((m) => resolve(m, 'new'));
  const flags = [];

  for (const item of incoming) {
    if (!item.info) {
      flags.push({
        kind: 'unknown',
        level: 'check',
        brand: item.brand,
        message: `${item.brand} is not in the lookup table, so it could not be checked against the list.`,
        ask: `Ask the pharmacist what ${item.brand} contains, and add it to the table before it goes on the list.`,
      });
    }
  }

  // Compare each new item with the current list, and with the new items before it.
  incoming.forEach((item, i) => {
    if (!item.info) return;
    const others = [...existing, ...incoming.slice(0, i)].filter((o) => o.info);
    for (const other of others) {
      const shared = item.info.ingredients
        .map((ing) => ing.name)
        .filter((n) => other.info.ingredients.some((o) => o.name === n));
      if (shared.length) {
        const where = other.source === 'current' ? 'already on the list' : 'also on this prescription';
        flags.push({
          kind: 'duplicate',
          level: 'stop',
          brand: item.brand,
          other: other.brand,
          ingredients: shared,
          message: `${item.brand} and ${other.brand} (${where}) both contain ${shared.join(' and ')}. Taking both would double the ${shared.join(' and ')}.`,
          ask: `Ask ${doctor}: should ${item.brand} replace ${other.brand}, or is there a reason for both?`,
        });
        continue;
      }
      const sharedClass = item.info.classes.filter((c) => other.info.classes.includes(c));
      if (sharedClass.length) {
        flags.push({
          kind: 'same-class',
          level: 'ask',
          brand: item.brand,
          other: other.brand,
          classes: sharedClass,
          message: `${item.brand} and ${other.brand} are different medicines from the same family: ${sharedClass.join(', ')}. Usually one replaces the other.`,
          ask: `Ask ${doctor}: does ${item.brand} replace ${other.brand}?`,
        });
      }
    }
  });

  const order = { stop: 0, ask: 1, check: 2 };
  flags.sort((a, b) => order[a.level] - order[b.level]);
  return { doctor, flags, clear: incoming.filter((i) => i.info && !flags.some((f) => f.brand === i.brand)).map((i) => i.brand) };
}

export function report(result) {
  const lines = [];
  const icon = { stop: 'STOP', ask: 'ASK', check: 'CHECK' };
  if (result.flags.length === 0) lines.push('No duplicates or same-family medicines found against the current list.');
  for (const f of result.flags) lines.push(`[${icon[f.level]}] ${f.message}\n  -> ${f.ask}`);
  if (result.clear.length) lines.push(`No flags for: ${result.clear.join(', ')}.`);
  lines.push('This is a list check, not medical advice. Nothing changes on the list until the decision-maker approves it.');
  return lines.join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  const rxPath = args.find((a) => !a.startsWith('--'));
  if (!rxPath) {
    console.error('usage: med-check <prescription.json> [--list medicines.json] [--json]');
    process.exit(2);
  }
  const li = args.indexOf('--list');
  const current = JSON.parse(readFileSync(li >= 0 ? args[li + 1] : LIST_FILE, 'utf8'));
  const result = check(current, JSON.parse(readFileSync(rxPath, 'utf8')));
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : report(result));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);
