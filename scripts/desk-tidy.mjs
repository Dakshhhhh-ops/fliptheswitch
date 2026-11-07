#!/usr/bin/env node
// npm run desk:tidy: stop Switch agents the current run doesn't need.
//
//   npm run desk:tidy [-- --dry-run] [--team desk4]
//
// It stops:
//   - Claude agents of an earlier desk team. After live run 2, fourteen of
//     them were still running a day later, holding memory the next run needed.
//   - every Codex session but the newest. The reviewer starts a session per
//     room; in live run 3 its F5 session was still running when the F1 review
//     began, and the F1 shell stalled until the old one was stopped.
// It never touches an editor's Claude or Codex (they have no --agent and no
// Switch MCP), or the switch-buddy agent. The team comes from .desk-run.json.
// Safe during a run: desk:watch suggests it when it sees two Codex sessions.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, leftovers, processes, stop, switchAgents } from './local-switch.mjs';

const DESK = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function currentTeam() {
  const f = join(DESK, '.desk-run.json');
  try {
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).team ?? null : null;
  } catch {
    return null;
  }
}

// Stops (or with dryRun only lists) the leftovers. Returns what it found.
export function tidy({ team = currentTeam(), fresh = false, dryRun = false, say = console.log } = {}) {
  const agents = switchAgents(processes());
  const extra = leftovers(agents, { team, fresh });
  const verb = dryRun ? 'Would stop' : 'Stopped';
  if (extra.claude.length) {
    if (!dryRun) extra.claude.forEach((a) => stop(a.pid));
    say(`  ✔ ${verb} ${extra.claude.length} Claude agent${extra.claude.length === 1 ? '' : 's'} from an earlier run: ${describe(extra.claude)}`);
  } else say(`  ✔ No Claude agents left over from an earlier run${team ? ` (this run: ${team})` : ''}`);
  if (extra.codex.length) {
    if (!dryRun) extra.codex.forEach((a) => stop(a.pid));
    say(`  ✔ ${verb} ${extra.codex.length} Codex session${extra.codex.length === 1 ? '' : 's'}${fresh ? '' : ', keeping the newest'}: ${describe(extra.codex)}`);
  } else if (agents.codex.length) say(`  ✔ One Codex session (${describe(agents.codex)}), nothing to stop`);
  return { agents, extra };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const team = argv.includes('--team') ? argv[argv.indexOf('--team') + 1] : currentTeam();
  console.log(`desk:tidy${team ? ` (run ${team})` : ' (no .desk-run.json: Claude agents older than 6 hours count as left over)'}`);
  tidy({ team, dryRun: argv.includes('--dry-run') });
}
