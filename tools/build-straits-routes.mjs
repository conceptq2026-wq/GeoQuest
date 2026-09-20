// Builds the straits map's water-route files from the pinned OSM snapshots:
//   straits/routes.geojson  ← tools/sources/osm-tss.geojson    (extract-osm-tss.mjs)
//   straits/canals.geojson  ← tools/sources/osm-canals.geojson (extract-osm-canals.mjs)
//
// Only mapped data is drawn. No connectors, no guessed approach legs: a
// guessed line shown as if it were the real channel teaches something false.
// Where OSM has no scheme, the card says so instead (routeStatus in data.js).
//
// The map and the card must agree: inside the frame of a passage whose card
// says "no mapped lane" (routeStatus 'none'), no lane is drawn at all — not
// even a real port-approach scheme nearby (Formosa, Cook), because a drawn
// line beside "no data" tells the student the opposite, and the line wins.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import mapshaper from 'mapshaper';

const ROOT = path.resolve('..');
// The straits map's folder inside the served tree, relative to the repo root.
// Change here if the map moves.
const STRAITS_DIR = path.join(ROOT, 'docs/international/straits');
const sources = JSON.parse(fs.readFileSync('sources.json', 'utf8'));

function readPinned(entry) {
  const body = fs.readFileSync(path.join(ROOT, entry.file));
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  if (sha !== entry.sha256) throw new Error(`${entry.file} checksum ${sha} ≠ pinned ${entry.sha256} — review the new extract, then update sources.json`);
  return JSON.parse(body);
}

function write(name, collection) {
  const out = path.join(STRAITS_DIR, name);
  fs.writeFileSync(out, JSON.stringify(collection) + '\n');
  return `${(fs.statSync(out).size / 1024).toFixed(1)} KB`;
}

// ---- traffic-separation schemes ----
const { PASSAGES } = await import(pathToFileURL(path.join(STRAITS_DIR, 'data.js')).href);
const noLaneFrames = Object.entries(PASSAGES).filter(([, p]) => p.routeStatus === 'none');
const coordsOf = (g) => (g.type === 'Polygon' ? g.coordinates.flat() : g.coordinates);
const insideFrame = ([w, s, e, n]) => ([x, y]) => x >= w && x <= e && y >= s && y <= n;
const dropped = {};
const tss = readPinned(sources.osmTss);
const routes = {
  type: 'FeatureCollection',
  properties: tss.properties, // ODbL data, and the served file says so
  features: tss.features
    .filter((f) => {
      const hit = noLaneFrames.find(([, p]) => coordsOf(f.geometry).some(insideFrame(p.frame)));
      if (hit) dropped[hit[0]] = (dropped[hit[0]] || 0) + 1;
      return !hit;
    })
    .map((f) => ({ type: 'Feature', properties: { seamark: f.properties.seamark }, geometry: f.geometry })),
};
const counts = routes.features.reduce((m, f) => ((m[f.properties.seamark] = (m[f.properties.seamark] || 0) + 1), m), {});
console.log(`routes.geojson: ${routes.features.length} ways (${write('routes.geojson', routes)}) ${JSON.stringify(counts)}`);
console.log(`  not drawn (card says no mapped lane): ${JSON.stringify(dropped)}`);

// ---- canals ----
// Simplified to 100 m: invisible at the zooms a canal is viewed at, and it
// keeps the ~1,550 km Grand Canal from dominating the file.
const canalsSrc = readPinned(sources.osmCanals);
const simplified = await mapshaper.applyCommands(
  '-i in.json -simplify dp interval=100 keep-shapes -o out.json format=geojson geojson-type=FeatureCollection precision=0.00001',
  { 'in.json': { type: 'FeatureCollection', features: canalsSrc.features.map((f) => ({ ...f, properties: { canal: f.properties.canal } })) } },
);
const canals = { type: 'FeatureCollection', properties: canalsSrc.properties, features: JSON.parse(simplified['out.json'].toString()).features };
const perCanal = canals.features.reduce((m, f) => ((m[f.properties.canal] = (m[f.properties.canal] || 0) + 1), m), {});
console.log(`canals.geojson: ${canals.features.length} ways (${write('canals.geojson', canals)}) ${JSON.stringify(perCanal)}`);
