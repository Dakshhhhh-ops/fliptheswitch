// Helpers for the local Switch stack the live run uses: Switch Console's
// server, its Mattermost container, the buddy agent's folder, and Codex
// sessions. Used by doctor, desk:up and desk:watch.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function run(cmd, args, { timeout = 20000 } = {}) {
  // .cmd shims (claude, codex) need cmd.exe on Windows.
  const shim = process.platform === 'win32' && ['claude', 'codex'].includes(cmd);
  const [exe, argv] = shim ? ['cmd.exe', ['/d', '/c', cmd, ...args]] : [cmd, args];
  const r = spawnSync(exe, argv, { encoding: 'utf8', timeout });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), stdout: (r.stdout ?? '').trim() };
}

export async function reachable(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

const AGENTS = join(homedir(), '.switch', 'agents');

// Switch servers Switch Console has made agents for, plus SWITCH_URL.
export function switchServers() {
  const found = existsSync(AGENTS)
    ? readdirSync(AGENTS)
        .map((d) => /^(localhost|127\.0\.0\.1)-(\d+)$/.exec(d))
        .filter(Boolean)
        .map((m) => `http://127.0.0.1:${m[2]}`)
    : [];
  return [...new Set([process.env.SWITCH_URL, ...found].filter(Boolean))];
}

export async function switchUp() {
  for (const s of switchServers()) if (await reachable(`${s}/health`)) return s;
  return null;
}

// The buddy agent's folders: Switch runs a template from a chat message when
// the template file is in its folder.
export function buddyDirs() {
  if (!existsSync(AGENTS)) return [];
  return readdirSync(AGENTS).flatMap((server) => {
    const dir = join(AGENTS, server);
    return readdirSync(dir)
      .filter((d) => d.startsWith('switch-buddy'))
      .map((d) => join(dir, d));
  });
}

// The Mattermost container Switch Console runs, and its URL.
export function mattermost() {
  const ps = run('docker', ['ps', '--filter', 'name=mattermost', '--format', '{{.Names}}\t{{.Ports}}']);
  if (!ps.ok || !ps.stdout) return null;
  const [name, ports = ''] = ps.stdout.split('\n')[0].split('\t');
  const port = /(?:0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d+)->8065/.exec(ports)?.[1];
  return { container: name, url: process.env.MATTERMOST_URL ?? (port ? `http://127.0.0.1:${port}` : null) };
}

export function mmctl(container, ...args) {
  return run('docker', ['exec', container, 'mmctl', '--local', ...args]);
}

// Every process that might be a Switch agent: { pid, ppid, minutes, cmd }.
export function processes() {
  if (process.platform === 'win32') {
    const ps = run('powershell', [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'claude|codex' } | ForEach-Object { '{0}|~|{1}|~|{2}|~|{3}' -f $_.ProcessId, $_.ParentProcessId, [int]((Get-Date) - $_.CreationDate).TotalMinutes, $_.CommandLine }",
    ]);
    return ps.stdout
      .split(/\r?\n/)
      .map((l) => l.split('|~|'))
      .filter((p) => p.length >= 4)
      .map(([pid, ppid, minutes, ...cmd]) => ({ pid: Number(pid), ppid: Number(ppid), minutes: Number(minutes), cmd: cmd.join('|~|') }));
  }
  const ps = run('ps', ['-eo', 'pid=,ppid=,etimes=,args=']);
  return ps.stdout
    .split('\n')
    .map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l))
    .filter((m) => m && /claude|codex/.test(m[4]))
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), minutes: Math.round(Number(m[3]) / 60), cmd: m[4] }));
}

// The Switch agents among those processes. Switch starts each Claude agent
// with `--agent <name>` and each Codex agent as an app-server wired to
// Switch's MCP. Interactive sessions (an editor's Claude or Codex) have
// neither, so they're never listed here.
//   claude: [{ pid, minutes, agent, team }]   team: the deskN prefix, or null
//   codex:  [{ pid, minutes }]                newest first, one per session
export function switchAgents(procs) {
  const claude = procs
    .map((p) => ({ ...p, agent: /--agent"?\s+"?([\w.-]+)/.exec(p.cmd)?.[1] }))
    .filter((p) => p.agent && /claude/i.test(p.cmd) && !p.agent.startsWith('switch-'))
    .map(({ pid, minutes, agent }) => ({ pid, minutes, agent, team: /^(desk\d*)-/.exec(agent)?.[1] ?? null }));
  const app = procs.filter((p) => /codex/i.test(p.cmd) && /app-server/.test(p.cmd) && /mcp_servers\.switch\./.test(p.cmd));
  // A session is a launcher (node codex.js) and its codex.exe; keep the top one.
  const pids = new Set(app.map((p) => p.pid));
  const codex = app
    .filter((p) => !pids.has(p.ppid))
    .map(({ pid, minutes }) => ({ pid, minutes }))
    .sort((a, b) => a.minutes - b.minutes);
  return { claude, codex };
}

export const STALE_MINUTES = 6 * 60;

// The agents a run doesn't need. `team` is the run's team (null if unknown).
//   - Claude agents of another desk team, or (no team known) older than 6 h
//   - Codex sessions but the newest: the reviewer starts a new session per
//     room, and in live run 3 the F5 session still running stalled the F1
//     review. With `fresh` (a new run is starting) every Codex session goes.
export function leftovers({ claude, codex }, { team = null, fresh = false } = {}) {
  return {
    claude: claude.filter((a) => (team ? a.team && a.team !== team : a.minutes > STALE_MINUTES)),
    codex: fresh ? codex : codex.slice(1),
  };
}

export function stop(pid) {
  return process.platform === 'win32' ? run('taskkill', ['/PID', String(pid), '/T', '/F']).ok : run('kill', [String(pid)]).ok;
}

export const describe = (list) => list.map((a) => (a.agent ? `${a.agent} (PID ${a.pid}, ${hours(a.minutes)})` : `PID ${a.pid} (${hours(a.minutes)})`)).join(', ');
const hours = (m) => (m >= 90 ? `${Math.round(m / 60)} h` : `${m} min`);
