// Start the API and the Vite dev server together, on any OS.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => spawn(cmd, args, { cwd: web, stdio: 'inherit', shell: process.platform === 'win32' });

const api = run(process.execPath, ['server/index.mjs']);
const ui = run('npx', ['vite']);
const stop = () => { api.kill(); ui.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', stop);
ui.on('exit', stop);
