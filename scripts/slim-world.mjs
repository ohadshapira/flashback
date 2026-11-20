// One-off: slim Natural Earth 110m countries (public domain) into a small geometry-only file.
import fs from 'node:fs';
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const r = (n) => Math.round(n * 100) / 100;
const round = (c) => (typeof c[0] === 'number' ? [r(c[0]), r(c[1])] : c.map(round));
const out = {
  type: 'FeatureCollection',
  features: src.features.map((f) => ({ type: 'Feature', properties: {}, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } })),
};
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log('features', out.features.length);
