// The desk's API: the state of the migration, read from the agents' git
// origin, plus a live stream that fires when the agents push or merge.
//
//   GET /api/desk     the full state (findings, inventory, timeline)
//   GET /api/specimen a test card number sealed with RSA-OAEP and X25519+ML-KEM-768, now
//   GET /api/cbom     the CycloneDX CBOM, as a download
//   GET /api/stream   server-sent events: `desk` whenever the origin changes
//   GET /*            the built UI (web/dist), in production
//
// `npm run export` (scripts/export.mjs) writes the same data as static files.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGIN, fingerprint, readState } from './desk.mjs';
import { specimen } from './specimen.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '..', 'dist');
const PORT = Number(process.env.PORT ?? 4317);
const POLL_MS = 3000;

let cached = { print: undefined, body: null };

function state() {
  const print = fingerprint();
  if (print === cached.print && cached.body) return cached.body;
  const { body, cbom } = readState(ORIGIN, print !== null);
  cached = { print, body, cbom };
  return body;
}

const clients = new Set();
setInterval(() => {
  if (clients.size === 0) return;
  const before = cached.print;
  const body = state();
  if (cached.print !== before) for (const res of clients) res.write(`event: desk\ndata: ${body}\n\n`);
}, POLL_MS).unref();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };

function serveStatic(req, res) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(DIST, url));
  if (file !== DIST && !file.startsWith(DIST + sep)) return res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('UI not built. Run `npm run build` in web/, or `npm run dev` for development.');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  if (req.url === '/api/desk') {
    try {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(state());
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'read-failed', message: err.message }));
    }
  }
  if (req.url === '/api/specimen') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(specimen()));
  }
  if (req.url === '/api/cbom') {
    state();
    if (!cached.cbom) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/vnd.cyclonedx+json', 'content-disposition': 'attachment; filename="demo-payments.cbom.json"' });
    return res.end(cached.cbom);
  }
  if (req.url === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`event: desk\ndata: ${state()}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405).end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Crypto Desk API on http://127.0.0.1:${PORT} (origin: ${ORIGIN})`);
});
