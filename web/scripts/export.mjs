// A static snapshot of the desk, for hosting without the Node API (Vercel,
// Netlify, GitHub Pages, any file server).
//
//   npm run export            -> web/dist-static
//   npm run export -- --out <dir>
//
// It builds the UI in snapshot mode (VITE_SNAPSHOT=1: no live stream, relative
// paths so it works under a subpath) and writes what the API would have
// served, as of now:
//
//   api/desk.json      the body of GET /api/desk
//   api/specimen.json  one specimen, sealed during this export
//   cbom.json          the CycloneDX CBOM from GET /api/cbom
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGIN, readState } from '../server/desk.mjs';
import { specimen } from '../server/specimen.mjs';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const out = resolve(outArg >= 0 ? args[outArg + 1] : join(web, 'dist-static'));

// Read the desk first: there is no point building a snapshot of nothing.
const { body, cbom } = readState(ORIGIN);
if (!cbom) {
  console.error(`No git origin at ${ORIGIN}. Run \`npm run setup\` in the repository root first.`);
  process.exit(1);
}

process.env.VITE_SNAPSHOT = '1';
const { build } = await import('vite');
await build({
  root: web,
  base: './',
  logLevel: 'warn',
  build: { outDir: out, emptyOutDir: true },
});

mkdirSync(join(out, 'api'), { recursive: true });
writeFileSync(join(out, 'api', 'desk.json'), body);
writeFileSync(join(out, 'api', 'specimen.json'), JSON.stringify(specimen()));
writeFileSync(join(out, 'cbom.json'), cbom);
// GitHub Pages: serve the folder as is, without Jekyll.
writeFileSync(join(out, '.nojekyll'), '');

const desk = JSON.parse(body);
console.log(`Snapshot of main@${desk.head} (${desk.rows.length} findings) written to ${out}`);
