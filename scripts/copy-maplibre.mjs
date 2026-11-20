// maplibre-gl v6 ships its web worker as a separate ES module that bundlers mis-resolve.
// We serve it as a static asset and point MapLibre at it with setWorkerUrl().
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
const dest = path.resolve('public/maplibre/maplibre-gl-worker.mjs');
if (!fs.existsSync(src)) {
  console.warn('[copy-maplibre] maplibre-gl not installed yet; skipping');
  process.exit(0);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-maplibre] worker ->', path.relative(process.cwd(), dest));
