import fs from 'node:fs';
for (const d of process.argv.slice(2)) fs.rmSync(d, { recursive: true, force: true });
