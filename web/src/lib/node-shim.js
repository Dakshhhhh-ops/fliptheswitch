// The browser build imports the real scanner (tools/cbom-scan.mjs) and Mosca
// (tools/mosca.mjs). Their pure functions run as they are; only the
// command-line parts touch these Node modules, and the page never calls them.
const none = () => {
  throw new Error('Not available in the browser');
};
export const existsSync = () => false;
export const readFileSync = none;
export const readdirSync = () => [];
export const statSync = none;
export const writeFileSync = none;
export const sep = '/';
export const join = (...p) => p.join('/');
export const basename = (p) => String(p).split('/').pop();
export const relative = (a, b) => b;
export const resolve = (...p) => p.join('/');
export const isAbsolute = () => false;
export const randomUUID = () => globalThis.crypto.randomUUID();
export const pathToFileURL = (p) => ({ href: `file://${p}` });
export default {};
