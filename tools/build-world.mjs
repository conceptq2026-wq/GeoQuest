// Builds shared/tiles/world.pmtiles from the pinned Natural Earth sources.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import mapshaper from 'mapshaper';
import { writeArchive } from './lib/pmtiles-writer.mjs';
import { readSource, prepare, bangladeshLineClass, featureCollection, bboxPolygon } from './lib/geo.mjs';
import { WORLD_MAX_ZOOM, DETAIL_MIN_ZOOM, DETAIL_MAX_ZOOM, DETAIL_AREAS } from './world.config.mjs';

// Inside the served tree. Change here if it moves.
const OUT = path.resolve('..', 'docs', 'shared', 'tiles', 'world.pmtiles');
const VT_OPTIONS = { extent: 4096, buffer: 64, tolerance: 3, indexMaxPoints: 0 };

const lineProps = (p) => ({ class: bangladeshLineClass(p) });
const isBdLine = (p) => bangladeshLineClass(p) !== null;

// Read once: this file is 13 MB, and both the label layer and the name pin
// below need it.
const countriesBdg = readSource('ne_10m_admin_0_countries_bdg.geojson');

/*
|--------------------------------------------------------------------------
| PINNED BENGALI COUNTRY NAMES
|--------------------------------------------------------------------------
|
| country_labels carries name_bn, and every map displays it. The names come
| from Natural Earth's NAME_BN, and world.pmtiles is a committed binary — so a
| pin bump that renamed a country in Bengali would show in git as
| "world.pmtiles changed" and nothing more. That is the most invisible change
| the pipeline can make: a student reads a different country name and no diff
| says so.
|
| A hash rather than a 248-entry literal table, which nobody would read. The
| mapping itself is written to country-names-bn.json beside this script and
| committed, so the hash says THAT something moved and the file says WHAT.
|
| The country POLYGONS are deliberately not pinned, here or in
| build-border-lines.mjs: their only job is to be washed with a translucent
| highlight, so a border moving a kilometre is invisible and pinning it would
| churn for no reader. The bar for a pin is that a value is derived from an
| external source AND is either displayed to a student or load-bearing for
| what is displayed.
*/
const NAMES_FILE = path.resolve('country-names-bn.json');
const EXPECTED_NAME_BN_COUNT = 248;
const EXPECTED_NAME_BN_HASH = '225f20facb7e4861';

const nameBnByCode = Object.fromEntries(
  countriesBdg.features
    .map((f) => [f.properties.ADM0_A3, f.properties.NAME_BN])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
);
const nameBnHash = crypto.createHash('sha256').update(JSON.stringify(nameBnByCode)).digest('hex').slice(0, 16);

// Every pinned value checked in this build collects here, so one run reports
// all of its drift rather than stopping at the first.
const drift = [];

const actualCount = Object.keys(nameBnByCode).length;
if (actualCount !== EXPECTED_NAME_BN_COUNT)
  drift.push(`name_bn count: expected ${EXPECTED_NAME_BN_COUNT} countries, got ${actualCount}`);

if (nameBnHash !== EXPECTED_NAME_BN_HASH) {
  // A bare hash mismatch across 248 entries is useless to act on, so name the
  // codes that moved by diffing against the committed copy.
  const previous = fs.existsSync(NAMES_FILE) ? JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8')) : {};
  const before = drift.length;
  for (const code of [...new Set([...Object.keys(previous), ...Object.keys(nameBnByCode)])].sort()) {
    const was = previous[code];
    const now = nameBnByCode[code];
    if (was === now) continue;
    if (was === undefined) drift.push(`name_bn ${code}: added as "${now}"`);
    else if (now === undefined) drift.push(`name_bn ${code}: removed (was "${was}")`);
    else drift.push(`name_bn ${code}: "${was}" -> "${now}"`);
  }
  if (drift.length === before)
    drift.push(
      `name_bn hash: expected ${EXPECTED_NAME_BN_HASH}, got ${nameBnHash}, but ${path.basename(NAMES_FILE)} matches the new mapping — the committed copy is stale, or the pinned hash was never updated`,
    );
}

/*
|--------------------------------------------------------------------------
| PINNED BOUNDARY CLASSES
|--------------------------------------------------------------------------
|
| `class` comes from Natural Earth's FCLASS_BD, and bangladeshLineClass DROPS a
| line Bangladesh does not recognise rather than marking it — 73 of them across
| the four groups below. So `class` does not merely label a boundary, it decides
| whether the basemap draws it at all. A reclassification upstream would move
| the app's editorial position inside a committed binary, where no diff shows it.
|
| Counts per class rather than a hash: there are only a handful, and a failure
| should say WHICH class moved. The counts are taken after the Bangladesh filter
| and before the detail clip, so they track the source and the filter, not the
| DETAIL_AREAS boxes — changing a box is a config decision and must not churn
| these.
|
| min_zoom is deliberately not pinned: it decides when a label appears, not what
| it says. Display timing, not fact.
*/
const EXPECTED_LINE_CLASSES = {
  'world.borders': {
    'Disputed (please verify)': 15,
    'Indefinite (please verify)': 5,
    'Indeterminant frontier': 2,
    'International boundary (verify)': 358,
    'Line of control (please verify)': 5,
  },
  'world.disputed': {
    Breakaway: 1,
    'Claim boundary': 19,
    'Disputed (please verify)': 1,
    'International boundary (verify)': 1,
  },
  'detail.borders': {
    'Disputed (please verify)': 29,
    'Indefinite (please verify)': 12,
    'Indeterminant frontier': 4,
    'International boundary (verify)': 442,
    'Lease limit': 2,
    'Line of control (please verify)': 7,
    'Overlay limit': 5,
  },
  'detail.disputed': {
    'Claim boundary': 29,
    'Disputed (please verify)': 1,
    'Elusive frontier': 1,
    'Indefinite (please verify)': 1,
    'International boundary (verify)': 1,
  },
};

const classCounts = (fc) => {
  const counts = {};
  for (const f of fc.features) counts[f.properties.class] = (counts[f.properties.class] || 0) + 1;
  return counts;
};

function checkLineClasses(actual) {
  for (const group of [...new Set([...Object.keys(EXPECTED_LINE_CLASSES), ...Object.keys(actual)])].sort()) {
    const expected = EXPECTED_LINE_CLASSES[group] ?? {};
    const got = actual[group] ?? {};
    for (const cls of [...new Set([...Object.keys(expected), ...Object.keys(got)])].sort()) {
      const was = expected[cls];
      const now = got[cls];
      if (was === now) continue;
      if (was === undefined) drift.push(`${group}: class "${cls}" appeared, ${now} feature(s)`);
      else if (now === undefined) drift.push(`${group}: class "${cls}" disappeared, was ${was} feature(s)`);
      else drift.push(`${group}: class "${cls}" expected ${was} feature(s), got ${now}`);
    }
  }
}

// ---- World layers (1:50m) ----
const world = {
  land: prepare(readSource('ne_50m_land.geojson'), () => ({})),
  // Natural Earth's land polygons fill lakes in as land; without this layer
  // the Great Lakes (Soo, Welland) and Gatun Lake (Panama) would be solid.
  lakes: prepare(readSource('ne_50m_lakes.geojson'), () => ({})),
  borders: prepare(readSource('ne_50m_admin_0_boundary_lines_land.geojson'), lineProps, isBdLine),
  disputed: prepare(readSource('ne_50m_admin_0_boundary_lines_disputed_areas.geojson'), lineProps, isBdLine),
  // Label points come from the Bangladesh-POV countries file: one point per
  // country at Natural Earth's own label position, Bengali name included.
  country_labels: featureCollection(
    countriesBdg.features.map((f) => ({
      type: 'Feature',
      properties: {
        // The join key a map uses to suppress this label when it draws the
        // country's name itself. A code rather than a name: this file calls
        // China "People's Republic of China", and matching on names has
        // already gone wrong once.
        adm0_a3: f.properties.ADM0_A3,
        name_bn: f.properties.NAME_BN,
        name_en: f.properties.NAME_EN,
        min_zoom: f.properties.MIN_LABEL,
      },
      geometry: { type: 'Point', coordinates: [f.properties.LABEL_X, f.properties.LABEL_Y] },
    })),
  ),
};

// ---- Detail layers (1:10m), clipped to the detail boxes ----
async function clip(fc, bbox) {
  const out = await mapshaper.applyCommands(`-i in.json -clip bbox=${bbox.join(',')} -o out.json format=geojson geojson-type=FeatureCollection`, { 'in.json': fc });
  return JSON.parse(out["out.json"].toString()).features;
}
const land10 = prepare(readSource('ne_10m_land.geojson'), () => ({}));
const lakes10 = prepare(readSource('ne_10m_lakes.geojson'), () => ({}));
const borders10 = prepare(readSource('ne_10m_admin_0_boundary_lines_land.geojson'), lineProps, isBdLine);
const disputed10 = prepare(readSource('ne_10m_admin_0_boundary_lines_disputed_areas.geojson'), lineProps, isBdLine);
checkLineClasses({
  'world.borders': classCounts(world.borders),
  'world.disputed': classCounts(world.disputed),
  'detail.borders': classCounts(borders10),
  'detail.disputed': classCounts(disputed10),
});

// Every pin is checked before the clip and the tiling, so drift fails in
// seconds and nothing is written — not the tileset, not the names file.
if (drift.length)
  throw new Error(
    `pinned values derived from Natural Earth changed — read the list before re-pinning:\n  ${drift.join('\n  ')}`,
  );

// Written only once every pin has passed, so the committed copy always matches
// the pinned hash and is a usable base for the next diff.
fs.writeFileSync(NAMES_FILE, JSON.stringify(nameBnByCode, null, 2) + '\n');

const detail = { detail_extent: [], land: [], lakes: [], borders: [], disputed: [] };
for (const [name, bbox] of Object.entries(DETAIL_AREAS)) {
  detail.detail_extent.push({ ...bboxPolygon(bbox), properties: { area: name } });
  detail.land.push(...(await clip(land10, bbox)));
  detail.lakes.push(...(await clip(lakes10, bbox)));
  detail.borders.push(...(await clip(borders10, bbox)));
  detail.disputed.push(...(await clip(disputed10, bbox)));
}
for (const k of Object.keys(detail)) detail[k] = prepare(featureCollection(detail[k]), (p) => p);

// ---- Tiling ----
const tiles = [];
const perZoom = {};
function emit(indexes, z, x, y) {
  const layers = {};
  for (const [name, index] of Object.entries(indexes)) {
    const t = index.getTile(z, x, y);
    if (t && t.features.length) layers[name] = t;
  }
  if (!Object.keys(layers).length) return;
  const data = Buffer.from(vtpbf.fromGeojsonVt(layers, { version: 2 }));
  tiles.push({ z, x, y, data });
  perZoom[z] = (perZoom[z] || 0) + 1;
}

const worldIdx = Object.fromEntries(Object.entries(world).map(([k, fc]) =>
  [k, geojsonvt(fc, { ...VT_OPTIONS, maxZoom: WORLD_MAX_ZOOM, indexMaxZoom: WORLD_MAX_ZOOM })]));
for (let z = 0; z <= WORLD_MAX_ZOOM; z++)
  for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) emit(worldIdx, z, x, y);

const detailIdx = Object.fromEntries(Object.entries(detail).map(([k, fc]) =>
  [k, geojsonvt(fc, { ...VT_OPTIONS, maxZoom: DETAIL_MAX_ZOOM, indexMaxZoom: 4 })]));
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
const done = new Set();
for (const [w, s, e, n] of Object.values(DETAIL_AREAS))
  for (let z = DETAIL_MIN_ZOOM; z <= DETAIL_MAX_ZOOM; z++)
    for (let x = lon2x(w, z); x <= lon2x(e, z); x++)
      for (let y = lat2y(n, z); y <= lat2y(s, z); y++) {
        const key = `${z}/${x}/${y}`;
        if (done.has(key)) continue;
        done.add(key);
        emit(detailIdx, z, x, y);
      }

// ---- Write ----
const fields = (fc) => Object.fromEntries(Object.keys(fc.features[0]?.properties || {}).map((k) => [k, 'String']));
const metadata = {
  name: 'GeoQuest world',
  description: 'Shared world basemap for GeoQuest maps. z0–6 Natural Earth 1:50m; z7–10 Natural Earth 1:10m inside detail areas only.',
  attribution: 'Natural Earth v5.1.2 (public domain), Bangladesh point of view',
  vector_layers: [
    ...Object.entries(world).map(([id, fc]) => ({ id, fields: fields(fc), minzoom: 0, maxzoom: WORLD_MAX_ZOOM })),
    { id: 'detail_extent', fields: { area: 'String' }, minzoom: DETAIL_MIN_ZOOM, maxzoom: DETAIL_MAX_ZOOM },
  ],
  geoquest: { detailAreas: DETAIL_AREAS, worldMaxZoom: WORLD_MAX_ZOOM, detailMinZoom: DETAIL_MIN_ZOOM, detailMaxZoom: DETAIL_MAX_ZOOM },
};
const { buffer, stats } = writeArchive(tiles, metadata, {
  minZoom: 0, maxZoom: DETAIL_MAX_ZOOM, bounds: [-180, -85.05, 180, 85.05], center: [60, 25, 2],
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buffer);
console.log(`world.pmtiles: ${(buffer.length / 1024).toFixed(0)} KB, ${stats.tiles} tiles (${stats.unique} unique), root directory ${stats.rootBytes} B`);
console.log('tiles per zoom:', Object.entries(perZoom).map(([z, n]) => `z${z}:${n}`).join(' '));
