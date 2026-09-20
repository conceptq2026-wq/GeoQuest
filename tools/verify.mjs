// Checks the built files before they are committed: the archive reads back
// with the official pmtiles reader, sample tiles exist where maps need them,
// land rings are wound the way vector tiles expect, and vendored libraries
// are byte-identical to the pinned npm packages.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PMTiles } from 'pmtiles';
import { DETAIL_AREAS } from './world.config.mjs';

const require = createRequire(import.meta.url);
const vtRequire = createRequire(require.resolve('vt-pbf'));
const { VectorTile } = vtRequire('@mapbox/vector-tile');
const Pbf = vtRequire('pbf');

const ROOT = path.resolve('..');
// The served tree — everything GitHub Pages publishes, and nothing else.
// Change here if it moves.
const SERVED = path.join(ROOT, 'docs');
// The straits map's folder inside the served tree. Change here if the map moves.
const STRAITS_DIR = path.join(SERVED, 'international/straits');
// Data kept out of the served tree because no map draws it.
const DATA_SOURCES = path.join(ROOT, 'data-sources');
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures++;
};

// ---- world.pmtiles ----
class FileSource {
  constructor(file) { this.buf = fs.readFileSync(file); }
  getKey() { return 'world'; }
  async getBytes(offset, length) {
    return { data: this.buf.buffer.slice(this.buf.byteOffset + offset, this.buf.byteOffset + offset + length) };
  }
}
const archive = new PMTiles(new FileSource(path.join(SERVED, 'shared/tiles/world.pmtiles')));
const header = await archive.getHeader();
check(header.specVersion === 3 && header.tileType === 1, `world.pmtiles is PMTiles v3 / MVT (z${header.minZoom}–${header.maxZoom})`);

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
async function tileAt(lon, lat, z) {
  const t = await archive.getZxy(z, lon2x(lon, z), lat2y(lat, z));
  return t && new VectorTile(new Pbf(new Uint8Array(t.data)));
}

const hormuz = await tileAt(56.35, 26.55, 6);
check(hormuz && hormuz.layers.land && hormuz.layers.country_labels, 'world tile at Hormuz z6 has land and country labels');

for (const [name, [w, s, e, n]] of Object.entries(DETAIL_AREAS)) {
  const t = await tileAt((w + e) / 2, (s + n) / 2, 10);
  check(t && t.layers.detail_extent, `detail tile exists at z10 in ${name}`);
}

// Outer rings must be clockwise on screen (tile y points down), which is a
// positive area with this formula — see lib/geo.mjs.
// Checking the largest ring in a tile is enough to catch an unwound build.
const ringArea = (ring) => {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y);
  return s / 2;
};
let outerOk = true;
for (let i = 0; i < hormuz.layers.land.length; i++) {
  const rings = hormuz.layers.land.feature(i).loadGeometry();
  const biggest = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
  if (ringArea(biggest) < 0) outerOk = false;
}
check(outerOk, 'land outer rings are wound correctly (land will not render as sea)');

// ---- vendored libraries ----
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const vendored = [
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl.mjs'],
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl-shared.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs'],
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl-worker.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'],
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl.css', 'node_modules/maplibre-gl/dist/maplibre-gl.css'],
  ['shared/vendor/pmtiles-4.5.0/pmtiles.js', 'node_modules/pmtiles/dist/pmtiles.js'],
];
for (const [copy, original] of vendored) check(sha(path.join(SERVED, copy)) === sha(original), `${copy} matches the pinned npm package`);

// ---- straits map: each passage's first view must show what it sits between ----
const { PASSAGES, SEAS } = await import(pathToFileURL(path.join(STRAITS_DIR, 'data.js')).href);
const inFrame = ([w, s, e, n], [x, y]) => x >= w && x <= e && y >= s && y <= n;
for (const [key, p] of Object.entries(PASSAGES)) {
  const missing = [['the passage', p.center], ...p.seas.map((k) => [`sea "${k}"`, SEAS[k]?.at])]
    .filter(([, pt]) => !pt || !inFrame(p.frame, pt))
    .map(([what]) => what);
  check(missing.length === 0, `straits/${key}: frame contains the passage and its ${p.seas.length} sea label(s)${missing.length ? ` — outside: ${missing.join(', ')}` : ''}`);
}

// ---- straits map: lanes and canals come only from the pinned OSM snapshots ----
const pinnedSources = JSON.parse(fs.readFileSync('sources.json', 'utf8'));
for (const entry of [pinnedSources.osmTss, pinnedSources.osmCanals]) {
  check(sha(path.join(ROOT, entry.file)) === entry.sha256, `${entry.file} matches its pinned checksum`);
}
const canalLines = JSON.parse(fs.readFileSync(path.join(STRAITS_DIR, 'canals.geojson'), 'utf8'));
for (const name of ['routes', 'canals']) {
  const fc = JSON.parse(fs.readFileSync(path.join(STRAITS_DIR, `${name}.geojson`), 'utf8'));
  check(/ODbL/.test(fc.properties?.licence || ''), `straits/${name}.geojson carries its ODbL licence`);
}
const laneFile = JSON.parse(fs.readFileSync(path.join(STRAITS_DIR, 'routes.geojson'), 'utf8'));
const laneCoords = laneFile.features.flatMap((f) => (f.geometry.type === 'Polygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates));
for (const [key, p] of Object.entries(PASSAGES).filter(([, q]) => q.routeStatus === 'none')) {
  const [w, s, e, n] = p.frame;
  const inside = laneCoords.filter(([x, y]) => x >= w && x <= e && y >= s && y <= n).length;
  check(inside === 0, `straits/${key}: card says no mapped lane, and no lane is drawn in its frame${inside ? ` — ${inside} points drawn` : ''}`);
}
for (const [key, p] of Object.entries(PASSAGES)) {
  const okStatus = p.kind === 'canal' ? p.routeStatus === 'canal' : ['mapped', 'partial', 'none'].includes(p.routeStatus);
  check(okStatus && !('route' in p), `straits/${key}: routeStatus "${p.routeStatus}", no hand-drawn route`);
  if (p.kind === 'canal') check(canalLines.features.some((f) => f.properties.canal === key), `straits/${key}: canal line present`);
}

// ---- per-map files ----
const famous = JSON.parse(fs.readFileSync(path.join(DATA_SOURCES, 'famous-lines.geojson'), 'utf8'));
check(famous.features.some((f) => f.properties.kind === 'trace'), 'data-sources/famous-lines.geojson has traced lines');
check(fs.existsSync(path.join(SERVED, 'shared/fonts/noto-sans-bengali/OFL.txt')), 'Noto Sans Bengali licence is shipped next to the font');

/*
|--------------------------------------------------------------------------
| THE BASELINE — what every map gets without asking
|
| Sea labels, country labels and the section a map belongs to are provided by
| the shell and the build, so with those in place these checks are
| structurally true. That is the point of writing them down: they fail the
| day someone makes one of them declarable again "just for this one map",
| which is exactly when nobody is looking.
|--------------------------------------------------------------------------
*/
console.log('\n---- the baseline ----');

const SECTIONS = ['bangladesh', 'international', 'geography'];
// Provided by the shell. A descriptor may not declare any of these, by any route.
const BASELINE_LAYERS = ['country-labels', 'country-labels-named', 'country-labels-active', 'sea-labels', 'sea-labels-active'];
const BASELINE_SOURCES = ['seas', 'countryLabels'];
const BASELINE_RECORDS = ['seas'];

const MAPS_DIR = path.join(SERVED, 'maps');
const mapIds = fs
  .readdirSync(MAPS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const shellSource = fs.readFileSync(path.join(SERVED, 'shell/app.js'), 'utf8');
for (const id of BASELINE_LAYERS) {
  check(shellSource.includes(`id: '${id}'`), `the shell still creates the baseline layer "${id}"`);
}

const descriptors = {};
for (const id of mapIds) {
  const d = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, id, 'descriptor.json'), 'utf8'));
  descriptors[id] = d;
  check(SECTIONS.includes(d.section), `${id}: section "${d.section}" is one of ${SECTIONS.join(', ')}`);

  const declaredLayers = (d.layers ?? []).map((l) => l.id).filter((l) => BASELINE_LAYERS.includes(l));
  const declaredSources = Object.keys(d.sources ?? {}).filter((s) => BASELINE_SOURCES.includes(s));
  const declaredRecords = Object.keys(d.records ?? {}).filter((r) => BASELINE_RECORDS.includes(r));
  const taken = [...declaredLayers, ...declaredSources, ...declaredRecords];
  check(taken.length === 0, `${id}: declares nothing the shell provides${taken.length ? ` — ${taken.join(', ')}` : ''}`);
}

// The registry is generated, so it cannot disagree with the descriptors — and
// this is the check that says so out loud if the generator stops being run.
const registry = JSON.parse(fs.readFileSync(path.join(SERVED, 'registry.json'), 'utf8'));
const registered = registry.maps.map((m) => m.id).sort();
check(
  registered.length === mapIds.length && registered.every((id, i) => id === mapIds[i]),
  `registry.json lists exactly the maps that exist (${registered.length})${registered.join(',') === mapIds.join(',') ? '' : ` — registry ${registered.join(', ')} vs folders ${mapIds.join(', ')}`}`,
);
const drifted = registry.maps.filter((entry) => {
  const d = descriptors[entry.id];
  return d && (entry.section !== d.section || entry.title?.en !== d.title?.en || entry.title?.bn !== d.title?.bn);
});
check(
  drifted.length === 0,
  `every registry entry matches its descriptor${drifted.length ? ` — ${drifted.map((e) => e.id).join(', ')} stale, re-run tools/build-registry.mjs` : ''}`,
);
check(
  registry.sections.join(',') === SECTIONS.join(','),
  `registry.json keeps the syllabus section order (${SECTIONS.join(', ')})`,
);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
