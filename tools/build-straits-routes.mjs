// Builds straits/routes.geojson from the pinned OSM traffic-separation
// snapshot (tools/sources/osm-tss.geojson, see extract-osm-tss.mjs).
//
// Only mapped lanes are drawn. No connectors, no guessed approach legs: a
// guessed line shown as if it were the real channel teaches something false.
// Where OSM has no scheme, the card says so instead (routeStatus in data.js).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve('..');
const SRC = path.join(ROOT, 'tools', 'sources', 'osm-tss.geojson');
const OUT = path.join(ROOT, 'straits', 'routes.geojson');
const pinned = JSON.parse(fs.readFileSync('sources.json', 'utf8')).osmTss;

const body = fs.readFileSync(SRC);
const sha = crypto.createHash('sha256').update(body).digest('hex');
if (sha !== pinned.sha256) throw new Error(`osm-tss.geojson checksum ${sha} ≠ pinned ${pinned.sha256} — review the new extract, then update sources.json`);

const src = JSON.parse(body);
const out = {
  type: 'FeatureCollection',
  // Carried into the served file: it is ODbL data and says so.
  properties: src.properties,
  features: src.features.map((f) => ({ type: 'Feature', properties: { seamark: f.properties.seamark }, geometry: f.geometry })),
};
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
const counts = out.features.reduce((m, f) => ((m[f.properties.seamark] = (m[f.properties.seamark] || 0) + 1), m), {});
console.log(`routes.geojson: ${out.features.length} ways (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB) ${JSON.stringify(counts)}`);
