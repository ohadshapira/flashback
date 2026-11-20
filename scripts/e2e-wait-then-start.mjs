// Waits for the primary E2E server (which owns the build), then starts a second server from the same build.
import { spawn } from 'node:child_process';
const [waitUrl, port] = process.argv.slice(2);
const deadline = Date.now() + 280_000;
for (;;) {
  try {
    if ((await fetch(waitUrl)).ok) break;
  } catch {
    /* not up yet */
  }
  if (Date.now() > deadline) throw new Error(`timed out waiting for ${waitUrl}`);
  await new Promise((r) => setTimeout(r, 1000));
}
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'start', '-p', port], { stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (c) => process.exit(c ?? 0));
