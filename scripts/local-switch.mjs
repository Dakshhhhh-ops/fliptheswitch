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

// Codex agent sessions (codex app-server) and how long each has run, in minutes.
export function codexSessions() {
  if (process.platform === 'win32') {
    const ps = run('powershell', [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='codex.exe'\" | Where-Object { $_.CommandLine -match 'app-server' -and $_.CommandLine -notmatch '\\.vscode' } | ForEach-Object { '{0} {1}' -f $_.ProcessId, [int]((Get-Date) - $_.CreationDate).TotalMinutes }",
    ]);
    return ps.stdout.split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
  }
  const ps = run('ps', ['-eo', 'pid=,etimes=,args=']);
  return ps.stdout
    .split('\n')
    .filter((l) => /codex.*app-server/.test(l))
    .map((l) => l.trim().split(/\s+/).slice(0, 2).map(Number))
    .map(([pid, secs]) => [pid, Math.round(secs / 60)]);
}

export const STALE_CODEX_MINUTES = 6 * 60;
