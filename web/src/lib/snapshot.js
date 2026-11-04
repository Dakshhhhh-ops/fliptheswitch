// Snapshot mode: a static export (`npm run export`) with no API behind it.
// Set at build time, so a live build never silently pretends to be one.
export const SNAPSHOT = import.meta.env.VITE_SNAPSHOT === '1';

// Where the data comes from. Snapshot paths are relative, so the export works
// under a subpath such as GitHub Pages' /<repo>/.
export const API = SNAPSHOT
  ? { desk: 'api/desk.json', specimen: 'api/specimen.json', cbom: 'cbom.json' }
  : { desk: '/api/desk', specimen: '/api/specimen', cbom: '/api/cbom', stream: '/api/stream' };

export const when = (iso) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
