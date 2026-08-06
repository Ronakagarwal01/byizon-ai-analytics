import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const pythonCommand = process.env.PYTHON || 'python';
const viteEntry = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const children = [];

function run(command, args, label) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  children.push(child);
  child.on('error', error => {
    console.error(`[${label}] ${error.message}`);
    shutdown(1);
  });
  child.on('exit', code => {
    if (code && code !== 0) shutdown(code);
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run(
  pythonCommand,
  ['-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8000'],
  'backend',
);
run(process.execPath, [viteEntry], 'frontend');
