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
import { sourcesAt, scan } from './outbound.mjs';

const require = createRequire(import.meta.url);
const vtRequire = createRequire(require.resolve('vt-pbf'));
const { VectorTile } = vtRequire('@mapbox/vector-tile');
const Pbf = vtRequire('pbf');

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
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

// ---- bangladesh.pmtiles ----
// The shell's baseline reads these layers and fields from whichever archive a
// map names, so a regional archive must carry them exactly as world.pmtiles does.
{
  const bd = new PMTiles(new FileSource(path.join(SERVED, 'shared/tiles/bangladesh.pmtiles')));
  const h = await bd.getHeader();
  check(h.specVersion === 3 && h.tileType === 1, `bangladesh.pmtiles is PMTiles v3 / MVT (z${h.minZoom}–${h.maxZoom})`);
  const meta = (await bd.getMetadata()).geoquest ?? {};
  const box = (b) => Array.isArray(b) && b.length === 4 && b[0] < b[2] && b[1] < b[3];
  check(box(meta.frame) && box(meta.maxBounds) && meta.frame.every((v, i) => (i < 2 ? v >= meta.maxBounds[i] : v <= meta.maxBounds[i])), 'bangladesh.pmtiles metadata carries a frame inside its maxBounds');
  const tile = async (lon, lat, z) => {
    const t = await bd.getZxy(z, lon2x(lon, z), lat2y(lat, z));
    return t && new VectorTile(new Pbf(new Uint8Array(t.data)));
  };
  const overview = await tile(90.4, 23.8, 6);
  const fieldsOf = (layer) => (layer ? new Set(Object.keys(layer.feature(0).properties)) : new Set());
  const labels = fieldsOf((await tile(90.4, 23.8, 4))?.layers.country_labels);
  check(['name_bn', 'name_en', 'adm0_a3', 'min_zoom'].every((k) => labels.has(k)), 'bangladesh z4 country_labels carry name_bn, name_en, adm0_a3, min_zoom');
  check(['land', 'lakes', 'borders'].every((k) => overview?.layers[k]), 'bangladesh z6 tile has land, lakes and borders');
  const dhaka = await tile(90.41, 23.81, 10);
  check(dhaka && ['detail_extent', 'land', 'admin', 'admin_labels', 'rivers'].every((k) => dhaka.layers[k]), 'bangladesh z10 tile at Dhaka has detail_extent, land, admin, admin_labels, rivers');
  const rakhine = await tile(93.5, 20.0, 6);
  check(rakhine?.layers.land && rakhine?.layers.admin_labels, 'bangladesh z6 tile at Rakhine has land and a unit label');
  let wound = true;
  for (let i = 0; i < dhaka.layers.land.length; i++) {
    const rings = dhaka.layers.land.feature(i).loadGeometry();
    if (ringArea(rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a))) < 0) wound = false;
  }
  check(wound, 'bangladesh land outer rings are wound correctly');
  // Bangladesh's own border is the government's line (COD-AB), in both tile sets.
  const classes = (t) => new Set(t?.layers.borders ? Array.from({ length: t.layers.borders.length }, (_, i) => t.layers.borders.feature(i).properties.class) : []);
  const rajshahi = await tile(88.6, 24.35, 9);
  check(classes(rajshahi).has('Bangladesh land border (BBS, COD-AB v03)') && classes(overview).has('Bangladesh land border (BBS, COD-AB v03)'), "bangladesh borders carry Bangladesh's land border from COD-AB, at z6 and at z9 on the Padma");
  // The main channel's two display names, and no unit label without a Bengali name.
  const riverLabels = [];
  const unitLabels = [];
  for (let x = lon2x(85.5, 6); x <= lon2x(95.3, 6); x++)
    for (let y = lat2y(27.6, 6); y <= lat2y(17.0, 6); y++) {
      const t = await bd.getZxy(6, x, y);
      if (!t) continue;
      const v = new VectorTile(new Pbf(new Uint8Array(t.data)));
      for (let i = 0; i < (v.layers.river_labels?.length ?? 0); i++) riverLabels.push(v.layers.river_labels.feature(i).properties.name_bn);
      for (let i = 0; i < (v.layers.admin_labels?.length ?? 0); i++) unitLabels.push(v.layers.admin_labels.feature(i).properties);
    }
  check(JSON.stringify(riverLabels.sort()) === JSON.stringify(['ব্রহ্মপুত্র', 'যমুনা'].sort()), `bangladesh z6 river_labels are the main channel's two names (${riverLabels.join(', ')})`);
  check(unitLabels.length > 0 && unitLabels.every((p) => p.name_bn), `every bangladesh unit label has a Bengali name (${unitLabels.length} at z6)`);
}

// ---- vendored libraries ----
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const vendored = [
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl.mjs'],
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl-shared.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs'],
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl-worker.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'],
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl.css', 'node_modules/maplibre-gl/dist/maplibre-gl.css'],
  ['shared/vendor/pmtiles-4.5.0/pmtiles.js', 'node_modules/pmtiles/dist/pmtiles.js'],
  ['shared/vendor/three-0.185.1/three.module.min.js', 'node_modules/three/build/three.module.min.js'],
  ['shared/vendor/three-0.185.1/three.core.min.js', 'node_modules/three/build/three.core.min.js'],
  ['shared/vendor/three-0.185.1/LICENSE', 'node_modules/three/LICENSE'],
];
for (const [copy, original] of vendored) check(sha(path.join(SERVED, copy)) === sha(path.join(HERE, original)), `${copy} matches the pinned npm package`);

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
const pinnedSources = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
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
// Interactive diagrams: listed in the registry beside the maps, opened by the
// diagram shell, and outside the map baseline. The folder comes with the first
// diagram. Change here if it moves.
const DIAGRAMS_DIR = path.join(SERVED, 'diagrams');
const diagramIds = fs.existsSync(DIAGRAMS_DIR)
  ? fs
      .readdirSync(DIAGRAMS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];

const shellSource = fs.readFileSync(path.join(SERVED, 'shell/app.js'), 'utf8');
for (const id of BASELINE_LAYERS) {
  check(shellSource.includes(`id: '${id}'`), `the shell still creates the baseline layer "${id}"`);
}

// A map is named by its id, a diagram by its kind and id, as their registry
// entries say — so the two cannot stand in for each other below.
const keyOf = (entry) => (entry.kind ? `${entry.kind}:${entry.id}` : entry.id);
const found = [...mapIds.map((id) => ({ id })), ...diagramIds.map((id) => ({ id, kind: 'diagram' }))];
const descriptors = {};
for (const entry of found) {
  const name = keyOf(entry);
  const d = JSON.parse(fs.readFileSync(path.join(entry.kind ? DIAGRAMS_DIR : MAPS_DIR, entry.id, 'descriptor.json'), 'utf8'));
  descriptors[name] = d;
  check(SECTIONS.includes(d.section), `${name}: section "${d.section}" is one of ${SECTIONS.join(', ')}`);
  // The baseline is the map shell's: a diagram has no basemap, no labels and
  // no picker row for its descriptor to take.
  if (entry.kind === 'diagram') continue;

  const declaredLayers = (d.layers ?? []).map((l) => l.id).filter((l) => BASELINE_LAYERS.includes(l));
  const declaredSources = Object.keys(d.sources ?? {}).filter((s) => BASELINE_SOURCES.includes(s));
  const declaredRecords = Object.keys(d.records ?? {}).filter((r) => BASELINE_RECORDS.includes(r));
  const taken = [...declaredLayers, ...declaredSources, ...declaredRecords];
  check(taken.length === 0, `${name}: declares nothing the shell provides${taken.length ? ` — ${taken.join(', ')}` : ''}`);
}
const both = diagramIds.filter((id) => mapIds.includes(id));
check(both.length === 0, `no id is both a map and a diagram${both.length ? ` — ${both.join(', ')}` : ''}`);

// The registry is generated, so it cannot disagree with the descriptors — and
// this is the check that says so out loud if the generator stops being run.
const registry = JSON.parse(fs.readFileSync(path.join(SERVED, 'registry.json'), 'utf8'));
const registered = registry.maps.map(keyOf).sort();
const existing = found.map(keyOf).sort();
check(
  registered.join(',') === existing.join(','),
  `registry.json lists exactly the maps and diagrams that exist (${mapIds.length} + ${diagramIds.length})${registered.join(',') === existing.join(',') ? '' : ` — registry ${registered.join(', ')} vs folders ${existing.join(', ')}`}`,
);
// Each entry exactly as the generator writes it: { id, section, title } for a
// map, with no new field, and "kind": "diagram" after the id for a diagram.
const drifted = registry.maps.filter((entry) => {
  const d = descriptors[keyOf(entry)];
  const kind = entry.kind ? { kind: entry.kind } : {};
  return d && JSON.stringify(entry) !== JSON.stringify({ id: d.id, ...kind, section: d.section, title: { en: d.title?.en, bn: d.title?.bn } });
});
check(
  drifted.length === 0,
  `every registry entry matches its descriptor${drifted.length ? ` — ${drifted.map((e) => e.id).join(', ')} stale, re-run tools/build-registry.mjs` : ''}`,
);
check(
  registry.sections.join(',') === SECTIONS.join(','),
  `registry.json keeps the syllabus section order (${SECTIONS.join(', ')})`,
);

/*
|--------------------------------------------------------------------------
| NO CALLS OUT — a page asks only its own host for static files, through the
| resolver: no API, no third-party service, no analytics. Strict over the
| diagram shell; over the map shell and the home page a report that fails
| nothing. What counts as a link, a request or a name: tools/outbound.mjs.
|--------------------------------------------------------------------------
*/
console.log('\n---- no calls out ----');
const relToRoot = (f) => path.relative(ROOT, f).replaceAll('\\', '/');
const describe = (f) => `${relToRoot(f.file)}:${f.line} ${f.class} — ${f.rule}: ${f.what}${f.note ? ` (${f.note})` : ''}`;
{
  // Diagram shell. Everything but a namespace name fails.
  const files = sourcesAt(path.join(SERVED, 'visual'));
  const found = files.flatMap((f) => scan(f).findings).filter((f) => f.class !== 'namespace');
  for (const f of found) check(false, describe(f));
  if (!found.length) {
    check(true, `docs/visual/ asks for no absolute URL, no hand-written request and no third-party host${files.length ? ` (${files.length} files)` : ' (no such folder yet)'}`);
  }
}
{
  // Map shell and home page, report only.
  const files = [...sourcesAt(path.join(SERVED, 'shell')), path.join(SERVED, 'index.html')];
  const results = files.map(scan);
  const found = results.flatMap((r) => r.findings);
  const sum = (pick) => results.reduce((n, r) => n + pick(r), 0);
  console.log(
    `     report only, nothing fails — docs/shell/ and docs/index.html, ${files.length} files: ${found.length} finding(s); ` +
      `data requests through the resolver ${sum((r) => r.requests.resolver)}, through a value ${sum((r) => r.requests.value)}; ` +
      `relative code and subresources ${sum((r) => r.own.relative)}, loaded through a value ${sum((r) => r.own.value)}`,
  );
  for (const f of found) console.log(`       ${describe(f)}`);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
