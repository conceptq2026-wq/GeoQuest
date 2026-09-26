// One-off: saves dated OpenStreetMap snapshots for the Bangladesh basemap into
// tools/sources/, which build-bangladesh.mjs reads instead of any live service.
//
//   osm-bangladesh-rivers.geojson  the named major rivers, one selector each
//   osm-bangladesh-land.geojson    coastline land: `overview` for all of
//                                  COVERAGE, `detail` for the detail area
//
// Re-run only on purpose, then review the diff and update the checksums in
// sources.json. The land files are regenerated upstream every day, so what
// they were is recorded here (date, size, sha256) rather than fetched again:
// the snapshot is the pinned input.
//
//   node extract-bangladesh.mjs [overpass-response.json]
//
// A saved Overpass response may be passed to skip the four-minute query.
//
// Data © OpenStreetMap contributors, ODbL 1.0 — the extracts stay under ODbL.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';
import { CACHE } from './lib/geo.mjs';
import { COVERAGE, DETAIL_AREAS } from './bangladesh.config.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const OUT_RIVERS = path.join(ROOT, 'tools', 'sources', 'osm-bangladesh-rivers.geojson');
const OUT_LAND = path.join(ROOT, 'tools', 'sources', 'osm-bangladesh-land.geojson');
const LAND_OVERVIEW = path.join(CACHE, 'osm-land', 'simplified-land-polygons-complete-3857', 'simplified_land_polygons.shp');
const LAND_DETAIL = path.join(CACHE, 'osm-land', 'land-polygons-split-4326', 'land_polygons.shp');
const ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/*
 * RIVERS. Each river is matched by exact name (name or name:en) AND inside its
 * own box — never by bare name. The boxes matter: OSM has three "Jamuna
 * River"s in COVERAGE (Bangladesh's, one in North 24 Parganas, one in Assam)
 * and a second যমুনা in the Barind. Found by probing OSM on 2026-09-26.
 *
 * The Brahmaputra family is split by way id, because OSM's names do not follow
 * the NRCC entries: the Old Brahmaputra above Mymensingh is tagged plain
 * "Brahmaputra River", and the main channel in Kurigram "Brahmaputra".
 */
const byName = (names, box) => ({ names, box });
const RIVERS = {
  padma: byName(['পদ্মা নদী', 'Padma River'], [88.0, 23.1, 90.8, 24.7]),
  meghna: byName(['মেঘনা নদী', 'Meghna River'], [90.4, 22.2, 91.3, 24.4]),
  teesta: byName(['Teesta', 'Teesta River'], [88.3, 25.3, 89.8, 27.6]),
  karatoya: byName(['করতোয়া নদী', 'Karatoya', 'Karatoya River', 'Karotoya River'], [88.5, 24.0, 89.7, 26.6]),
  surma: byName(['সুরমা নদী', 'Surma River'], [90.9, 24.3, 92.6, 25.2]),
  kushiyara: byName(['কুশিয়ারা নদী', 'Kushiyara River'], [91.0, 24.3, 92.6, 25.0]),
  karnaphuli: byName(['কর্ণফুলী নদী', 'Karnaphuli River', 'Karnafuli River'], [91.7, 22.1, 92.5, 23.0]),
  madhumati: byName(['মধুমতি', 'Madhumoti'], [89.4, 22.9, 89.9, 23.6]),
  bhagirathi: byName(['Bhagirathi'], [87.9, 22.9, 88.6, 24.6]),
  hooghly: byName(['Hooghly'], [87.9, 21.7, 88.5, 24.5]),
  ganga: byName(['Ganga', 'Ganges'], [85.0, 24.5, 88.1, 25.7]),
  // The Bangladesh Jamuna only: west of 89.5 is the Barind's own যমুনা.
  brahmaputraJamuna: { names: ['যমুনা নদী', 'Jamuna River'], box: [89.5, 23.7, 90.0, 25.3], ids: [232252698, 553617232, 438859570, 910696546] },
  oldBrahmaputra: { ids: [136383902, 929230691, 1262235705, 1262235706, 119373978, 622181033, 321520913, 928996321, 562551830, 257348356, 337081762, 607637590, 756867297] },
  brahmaputra: { ids: [657218553, 657595519] },
  brahmaputraAssam: { ids: [367136354, 1533995089, 157701252, 169984534, 444994352, 910696547, 1291355485] },
};
const REGEX = 'Padma|Jamuna|Meghna|Brahmaputra|Bhramaputra|Teesta|Karatoya|Karotoya|Surma|Kushiyara|Karnaphuli|Karnafuli|Madhumoti|Bhagirathi|Hooghly|Ganga|Ganges|পদ্মা|যমুনা|মেঘনা|ব্রহ্মপুত্র|করতোয়া|সুরমা|কুশিয়ারা|কর্ণফুলী|মধুমতি';
const [W, S, E, N] = COVERAGE;
const QUERY = `[out:json][timeout:600];
way[waterway=river](${S},${W},${N},${E})->.r;
(way.r[name~"${REGEX}"];way.r["name:en"~"${REGEX}"];);
out tags geom;`;

async function overpass(query) {
  for (let round = 0; round < 3; round++) {
    if (round) await new Promise((r) => setTimeout(r, 30_000));
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': 'GeoQuest-map-build/1.0 (https://github.com/conceptq2026-wq/GeoQuest)', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(700_000),
        });
        const text = await res.text();
        if (res.ok && text.startsWith('{')) return JSON.parse(text);
      } catch {}
    }
  }
  throw new Error('every Overpass endpoint failed, three times');
}

const response = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : await overpass(QUERY);
const snapshot = response.osm3s?.timestamp_osm_base;
const inBox = ([w, s, e, n], g) => g.every((p) => p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n);
const round = (v) => Math.round(v * 1e5) / 1e5;
const km = (g) => g.slice(1).reduce((d, b, i) => d + Math.hypot((b.lon - g[i].lon) * Math.cos((g[i].lat * Math.PI) / 180), b.lat - g[i].lat) * 111.32, 0);

const rivers = [];
const taken = new Map();
for (const [river, sel] of Object.entries(RIVERS)) {
  const ways = response.elements.filter(
    (w) => sel.ids?.includes(w.id) || (sel.names && (sel.names.includes(w.tags.name) || sel.names.includes(w.tags['name:en'])) && inBox(sel.box, w.geometry)),
  );
  for (const id of sel.ids ?? []) if (!ways.some((w) => w.id === id)) throw new Error(`${river}: way ${id} is gone from OSM — re-probe`);
  if (!ways.length) throw new Error(`${river}: matched nothing — OSM changed; re-probe`);
  for (const w of ways) {
    if (taken.has(w.id)) throw new Error(`way ${w.id} matched both ${taken.get(w.id)} and ${river}`);
    taken.set(w.id, river);
    rivers.push({ type: 'Feature', properties: { river, osm_id: w.id }, geometry: { type: 'LineString', coordinates: w.geometry.map((p) => [round(p.lon), round(p.lat)]) } });
  }
  console.log(`${river.padEnd(18)} ${String(ways.length).padStart(3)} ways ${ways.reduce((s, w) => s + km(w.geometry), 0).toFixed(0).padStart(5)} km`);
}

/*
 * LAND. The overview comes from OSM's simplified land polygons (made for low
 * zooms), the detail from the full coastline polygons, read straight out of
 * the 1.3 GB shapefile by record bounding box so it never has to be loaded
 * whole. Simplified to 20 m, well under a z10 pixel (~70 m here).
 */
function shapefileWindow(shp, [w, s, e, n]) {
  const shx = fs.readFileSync(shp.replace(/\.shp$/, '.shx'));
  const fd = fs.openSync(shp, 'r');
  const head = Buffer.alloc(44);
  const features = [];
  for (let i = 0; i < (shx.length - 100) / 8; i++) {
    const off = shx.readInt32BE(100 + i * 8) * 2;
    const len = shx.readInt32BE(104 + i * 8) * 2;
    fs.readSync(fd, head, 0, 44, off + 8);
    const [x0, y0, x1, y1] = [4, 12, 20, 28].map((o) => head.readDoubleLE(o));
    if (x1 < w || x0 > e || y1 < s || y0 > n) continue;
    const rec = Buffer.alloc(len);
    fs.readSync(fd, rec, 0, len, off + 8);
    const parts = rec.readInt32LE(36);
    const points = rec.readInt32LE(40);
    const starts = [...Array(parts)].map((_, k) => rec.readInt32LE(44 + 4 * k));
    const base = 44 + 4 * parts;
    const rings = starts.map((p, k) => {
      const ring = [];
      for (let j = p; j < (k + 1 < parts ? starts[k + 1] : points); j++) ring.push([rec.readDoubleLE(base + 16 * j), rec.readDoubleLE(base + 16 * j + 8)]);
      return ring;
    });
    // Shapefile rings: outer clockwise, holes counter-clockwise, holes after their outer.
    const clockwise = (r) => r.reduce((a, p, j) => a + (r[(j + 1) % r.length][0] - p[0]) * (r[(j + 1) % r.length][1] + p[1]), 0) > 0;
    const polygons = [];
    for (const r of rings) if (clockwise(r) || !polygons.length) polygons.push([r]); else polygons[polygons.length - 1].push(r);
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygons } });
  }
  fs.closeSync(fd);
  return { type: 'FeatureCollection', features };
}

async function run(cmd, files) {
  const out = await mapshaper.applyCommands(`${cmd} -o out.json format=geojson geojson-type=FeatureCollection precision=0.00001`, files);
  return JSON.parse(out['out.json'].toString()).features;
}
const fileInfo = (dir, zip) => {
  const f = path.join(CACHE, 'osm-land', zip);
  return { file: zip, size: fs.statSync(f).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'), readme: fs.readFileSync(path.join(CACHE, 'osm-land', dir, 'README.txt'), 'utf8').match(/Date of the data used is (\S+)/)?.[1] };
};

// Reprojected from spherical Mercator; clipped a little wide first so the reprojection has no edge to invent.
const merc = ([x, y]) => [(x * 20037508.34) / 180, Math.log(Math.tan(Math.PI / 4 + (y * Math.PI) / 360)) * 6378137];
const [mw, ms] = merc([W - 0.5, S - 0.5]);
const [me, mn] = merc([E + 0.5, N + 0.5]);
const overview = await run(
  `-i "${LAND_OVERVIEW.replace(/\\/g, '/')}" -clip bbox=${[mw, ms, me, mn].map(Math.round)} -proj wgs84 -clip bbox=${COVERAGE} -dissolve -explode -filter-fields -each "set='overview'"`,
);
const [dw, ds, de, dn] = Object.values(DETAIL_AREAS)[0];
const detail = await run(
  `-i in.json -clean -clip bbox=${[dw, ds, de, dn]} -dissolve -simplify dp interval=20 keep-shapes -filter-islands min-area=2000m2 -explode -filter-fields -each "set='detail'"`,
  { 'in.json': shapefileWindow(LAND_DETAIL, [dw - 0.2, ds - 0.2, de + 0.2, dn + 0.2]) },
);

const write = (file, properties, features) => {
  const body = JSON.stringify({ type: 'FeatureCollection', properties, features }) + '\n';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  console.log(`${path.relative(ROOT, file).replace(/\\/g, '/')}: ${features.length} features, ${(body.length / 1024).toFixed(0)} KB, sha256 ${crypto.createHash('sha256').update(body).digest('hex')}`);
};
const licence = 'ODbL 1.0 — © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)';
console.log('');
write(OUT_RIVERS, { source: 'OpenStreetMap waterway=river ways, one selector per river (tools/extract-bangladesh.mjs)', osmSnapshot: snapshot, fetched: new Date().toISOString().slice(0, 10), licence }, rivers);
write(
  OUT_LAND,
  {
    source: 'osmdata.openstreetmap.de land polygons',
    overview: fileInfo('simplified-land-polygons-complete-3857', 'simplified-land-polygons-complete-3857.zip'),
    detail: fileInfo('land-polygons-split-4326', 'land-polygons-split-4326.zip'),
    licence,
  },
  [...overview, ...detail],
);
