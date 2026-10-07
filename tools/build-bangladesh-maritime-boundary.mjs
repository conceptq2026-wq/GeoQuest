// Builds the bangladesh-maritime-boundary map (work in progress, step 1) from its seed:
//
//   node tools/build-bangladesh-maritime-boundary.mjs <out>
//
// While the map is in tools/wip.json, tools/preview.mjs runs this into its own copy of
// docs/ and tools/verify-descriptor.mjs into a temporary folder; nothing is written under
// docs/ until it is finished, so <out> is required.
//
// It reads data-sources/bangladesh-maritime-boundary/bangladesh-maritime-boundary.seed.json
// and the coastline behind the Bangladesh basemap, tools/sources/osm-bangladesh-land.geojson
// (pinned in tools/sources.json as osmBangladeshLand). No network.
//
//   lines      ITLOS's line with Myanmar (points 1–8, 9–11, then the 215° geodesic to the
//              junction), the PCA's line with India (LBT, 2, 3, then the 177°30′ geodesic to
//              the junction) and the 2015 baselines' four published points — all geodesics,
//              computed with tools/lib/geodesic.mjs
//   arc        ITLOS's 12 nm envelope round St Martin's (points 8 to 9), which the judgment
//              gives no coordinates for: derived from the OSM coastline, approximate, dashed
//   area       Bangladesh's sea area, closed by that coastline and the two lines
//   vertices   the published turning points, as small dots; the baselines' numbered
//
// The build stops, naming the check, if:
//   - the 215° and 177°30′ geodesics, computed from the PCA appendix's own unrounded start
//     (¶14 Prov-3, ¶22), meet more than 0.01″ from the junction the appendix publishes (¶23);
//   - Bangladesh's amended CLCS submission's point differs from the junction by 0.1″ or more;
//   - St Martin's is not the seed's number of polygons in its box;
//   - the map's bounds do not hold the junction with a degree to spare.
// It prints the distance from ITLOS points 8 and 9 to the derived envelope, and every Bengali
// string the user has not yet approved.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mapshaper from 'mapshaper';
import geojsonvt from 'geojson-vt';
import { GRS80, NM, dms, toDms, direct, inverse, densify, meet } from './lib/geodesic.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const ID = 'bangladesh-maritime-boundary';
const SEED = path.join(ROOT, 'data-sources', ID, `${ID}.seed.json`);
if (!process.argv[2]) throw new Error(`usage: node tools/build-${ID}.mjs <out> — the map is work in progress, so nothing is written under docs/`);
const OUT = path.resolve(process.argv[2]);

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const sources = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));

function fail(message) {
  console.error(`STOP: ${message}`);
  process.exit(1);
}

// The coastline file, held to its pin.
const coastPin = sources[seed.coast.source];
const coastBuf = fs.readFileSync(path.join(ROOT, coastPin.file));
if (crypto.createHash('sha256').update(coastBuf).digest('hex') !== coastPin.sha256) fail(`${coastPin.file} is not the pinned file`);
const land = JSON.parse(coastBuf.toString('utf8'));

// ---- points -----------------------------------------------------------------------------
const lonLat = (p) => [dms(...p.lon), dms(...p.lat)];
const P = Object.fromEntries(Object.entries(seed.points).map(([id, p]) => [id, lonLat(p)]));
const fmt = ([lon, lat]) => {
  const s = (v, h) => { const [d, m, x] = toDms(v); return `${d}°${String(m).padStart(2, '0')}′${x.toFixed(5).padStart(8, '0')}″${h}`; };
  return `${s(lat, 'N')} ${s(lon, 'E')}`;
};
const secondsApart = (a, b) => ({ lat: Math.abs(a[1] - b[1]) * 3600, lon: Math.abs(a[0] - b[0]) * 3600 });

// ---- check 1: the junction, from the two azimuths ------------------------------------------
const myanmarAz = seed.lines.myanmar.parts.find((p) => p.kind === 'azimuth');
const indiaAz = seed.lines.india.parts.find((p) => p.kind === 'azimuth');
const met = meet(lonLat(seed.checkOnly.prov3), indiaAz.azimuthDeg, P[myanmarAz.from], myanmarAz.azimuthDeg, 100e3, 800e3, GRS80);
const d1 = secondsApart(met.point, P.junction);
console.log(`junction, published (PCA appendix ¶23):      ${fmt(P.junction)}`);
console.log(`junction, computed from appendix ¶14 Prov-3: ${fmt(met.point)}  (Δlat ${d1.lat.toFixed(5)}″, Δlon ${d1.lon.toFixed(5)}″, ${inverse(met.point, P.junction).distance.toFixed(3)} m)`);
const metRounded = meet(P['pca-3'], indiaAz.azimuthDeg, P[myanmarAz.from], myanmarAz.azimuthDeg, 100e3, 800e3, GRS80);
const d1r = secondsApart(metRounded.point, P.junction);
console.log(`junction, computed from ¶509's rounded DP3:   ${fmt(metRounded.point)}  (Δlat ${d1r.lat.toFixed(5)}″, Δlon ${d1r.lon.toFixed(5)}″, ${inverse(metRounded.point, P.junction).distance.toFixed(3)} m — ¶26: the award's points are rounded to 0.1″)`);
if (d1.lat > 0.01 || d1.lon > 0.01) fail(`the computed junction is ${d1.lat.toFixed(5)}″ / ${d1.lon.toFixed(5)}″ from PCA appendix ¶23, over 0.01″`);
// The drawn lines run from their published points to the published junction; their starting azimuths:
const azM = inverse(P[myanmarAz.from], P.junction).azimuth1;
const azI = inverse(P['pca-3'], P.junction).azimuth1;
console.log(`drawn: point 11 → junction leaves at ${azM.toFixed(6)}° (ITLOS ¶505: 215°); DP3 → junction at ${azI.toFixed(6)}° (PCA ¶509(3): 177.5°)`);

// ---- check 2: the CLCS submission's point -------------------------------------------------
const cc = seed.points.junction.crossCheck;
const d2 = secondsApart(lonLat(cc), P.junction);
console.log(`junction, Bangladesh's amended CLCS submission (Table 1): ${fmt(lonLat(cc))}  (Δlat ${d2.lat.toFixed(5)}″, Δlon ${d2.lon.toFixed(5)}″; given to 0.1″)`);
if (d2.lat >= 0.1 || d2.lon >= 0.1) fail('the CLCS submission\'s point is 0.1″ or more from the PCA junction');

// ---- St Martin's and the envelope round it -------------------------------------------------
const [bw, bs, be, bn] = seed.coast.stMartinsBox;
const inBox = (r) => r.every(([x, y]) => x >= bw && x <= be && y >= bs && y <= bn);
const island = land.features.filter((f) => f.properties.set === seed.coast.set && f.geometry.type === 'Polygon' && inBox(f.geometry.coordinates[0]));
if (island.length !== seed.coast.stMartinsPolygons) fail(`St Martin's: ${island.length} polygons in its box, not ${seed.coast.stMartinsPolygons}`);
const coastPts = [];
for (const f of island) {
  for (const ring of f.geometry.coordinates) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [a, b] = [ring[i], ring[i + 1]];
      const n = Math.max(1, Math.ceil(inverse(a, b).distance / 10));
      for (let k = 0; k < n; k++) coastPts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
}
const toCoast = (p) => coastPts.reduce((m, q) => Math.min(m, inverse(p, q).distance), Infinity);
const RADIUS = seed.lines.myanmar.parts.find((p) => p.kind === 'envelope').radiusNm * NM;
const centre = coastPts.reduce((s, p) => [s[0] + p[0] / coastPts.length, s[1] + p[1] / coastPts.length], [0, 0]);
// Along each bearing from the island's centre, the distance at which the nearest coast is 12 nm away.
const onEnvelope = (bearing) => {
  let lo = 0, hi = RADIUS * 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (toCoast(direct(centre, bearing, mid).point) < RADIUS) lo = mid; else hi = mid;
  }
  return direct(centre, bearing, (lo + hi) / 2).point;
};
const env = seed.lines.myanmar.parts.find((p) => p.kind === 'envelope');
const [p8, p9] = [P[env.from], P[env.to]];
const b8 = inverse(centre, p8).azimuth1;
const b9 = inverse(centre, p9).azimuth1;
const sweep = (b9 - b8 + 360) % 360; // clockwise, round the south of the island
const STEP = 2; // degrees
const arc = [p8];
for (let a = Math.ceil(b8 / STEP) * STEP; a < b8 + sweep; a += STEP) arc.push(onEnvelope(a % 360));
arc.push(p9);
const d8 = toCoast(p8) - RADIUS;
const d9 = toCoast(p9) - RADIUS;
console.log(`envelope: ${island.length} OSM polygons, ${coastPts.length} coast points every ≤10 m; swept ${sweep.toFixed(1)}° clockwise from point 8 to point 9 in ${STEP}° steps (${arc.length - 2} envelope points)`);
console.log(`ITLOS point 8 is ${d8.toFixed(0)} m and point 9 ${d9.toFixed(0)} m outside the derived 12 nm envelope (they lie ${(toCoast(p8) / NM).toFixed(3)} and ${(toCoast(p9) / NM).toFixed(3)} nm from the OSM coast)`);

// ---- the lines -------------------------------------------------------------------------------
const STEP_M = 2000;
const chain = (ids) => ids.slice(1).flatMap((b, i) => densify(P[ids[i]], P[b], STEP_M).slice(i ? 1 : 0));
const r6 = (c) => c.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]);
const partsOf = (line) =>
  line.parts.filter((p) => !p.approximate).map((p) => (p.kind === 'azimuth' ? densify(P[p.from], P[p.to], STEP_M) : chain(p.through)));
// Joined lines: the two exact parts of the Myanmar line, then the India line, then the baselines.
const myanmarParts = (() => {
  const parts = partsOf(seed.lines.myanmar);
  // 9–11 and 11 → junction are one run.
  return [parts[0], [...parts[1], ...parts[2].slice(1)]];
})();
const lineGeom = {
  'myanmar-line': { type: 'MultiLineString', coordinates: myanmarParts.map(r6) },
  'india-line': { type: 'LineString', coordinates: r6([...partsOf(seed.lines.india)[0], ...partsOf(seed.lines.india)[1].slice(1)]) },
  'baselines-2015': { type: 'LineString', coordinates: r6(partsOf(seed.lines.baselines)[0]) },
};

// ---- the sea area: the two lines, closed over land, less the land ------------------------------
// The ring runs out along the India line, back along the Myanmar line (the envelope included),
// then over land: up the Teknaf side, across the north and down to the land boundary terminus.
// Every closing vertex lies on land, so erasing the land leaves the sea bounded by the coastline.
const CLOSE_OVER_LAND = [[92.2, 21.3], [92.2, 23.2], [89.16, 23.2]];
const seaRing = [
  ...lineGeom['india-line'].coordinates,
  ...[...myanmarParts[1]].reverse().slice(1),
  ...[...arc].reverse().slice(1),
  ...[...myanmarParts[0]].reverse().slice(1),
  ...CLOSE_OVER_LAND,
  lineGeom['india-line'].coordinates[0],
];
async function ms(cmd, files) {
  const out = await mapshaper.applyCommands(`${cmd} -o out.json format=geojson geojson-type=FeatureCollection precision=0.00001`, files);
  return JSON.parse(out['out.json'].toString());
}
const landDetail = { type: 'FeatureCollection', features: land.features.filter((f) => f.properties.set === seed.coast.set) };
const pieces = await ms('-i combine-files s.json l.json -target s -erase source=l -explode -sort "this.area" descending', {
  's.json': { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [seaRing] } }] },
  'l.json': landDetail,
});
const seaExact = { type: 'FeatureCollection', features: [pieces.features[0]] };

/*
| The sea is drawn from two smoothed copies, one below zoom 8 and one from it (step 1b). MapLibre
| tiles a GeoJSON source and simplifies every ring in each tile — by about 460 m at zoom 6, 115 m at
| zoom 8, 14 m at zoom 11 — so an island or a creek bank closer to the coast than that is simplified
| across it, and the triangulation lays a sliver over open water: the lighter band of step 1, made by
| one island on the Teknaf coast 56 m from the shore. Each copy is opened, then closed, by its radius —
| no sea channel and no land spit narrower than twice that is left — then simplified; and the build
| tiles both as MapLibre does and stops if any two rings cross in any tile they are drawn at.
*/
const SMOOTH = { overview: { radius: 1000, interval: 100, zooms: [0, 7] }, detail: { radius: 120, interval: 20, zooms: [8, 11] } };
async function smoothSea({ radius: r, interval }) {
  const opened = await ms(`-i in.json -buffer radius=-${r} -buffer radius=${r} -buffer radius=${r} -buffer radius=-${r} -explode -sort "this.area" descending`, { 'in.json': seaExact });
  return (await ms(`-i in.json -simplify dp interval=${interval} keep-shapes`, { 'in.json': { type: 'FeatureCollection', features: [opened.features[0]] } })).features[0];
}
const seaOf = { overview: await smoothSea(SMOOTH.overview), detail: await smoothSea(SMOOTH.detail) };
const sea = seaOf.detail;
// MapLibre's GeoJSON source: geojson-vt with extent 8192, tolerance 0.375 and buffer 128 of a 512 px tile.
const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
function ringCrossings(rings) {
  const segs = [];
  rings.forEach((r, ri) => { for (let i = 0; i < r.length - 1; i++) segs.push([ri, i, r[i], r[i + 1]]); });
  const grid = new Map();
  segs.forEach((s, k) => {
    for (let x = Math.floor(Math.min(s[2][0], s[3][0]) / 256); x <= Math.floor(Math.max(s[2][0], s[3][0]) / 256); x++)
      for (let y = Math.floor(Math.min(s[2][1], s[3][1]) / 256); y <= Math.floor(Math.max(s[2][1], s[3][1]) / 256); y++) {
        const key = `${x},${y}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(k);
      }
  });
  const seen = new Set();
  let n = 0;
  for (const list of grid.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [segs[list[i]], segs[list[j]]];
        const key = `${list[i]}-${list[j]}`;
        if ((a[0] === b[0] && Math.abs(a[1] - b[1]) <= 1) || seen.has(key)) continue;
        seen.add(key);
        if (orient(a[2], a[3], b[2]) * orient(a[2], a[3], b[3]) < 0 && orient(b[2], b[3], a[2]) * orient(b[2], b[3], a[3]) < 0) n++;
      }
  return n;
}
const tileX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const tileY = (lat, z) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
for (const [name, s] of Object.entries(SMOOTH)) {
  const [z0, z1] = s.zooms;
  const index = geojsonvt({ type: 'FeatureCollection', features: [seaOf[name]] }, { extent: 8192, tolerance: 6, buffer: 2048, maxZoom: z1, indexMaxZoom: z1, indexMaxPoints: 0 });
  const xs = seaOf[name].geometry.coordinates[0].map((c) => c[0]);
  const ys = seaOf[name].geometry.coordinates[0].map((c) => c[1]);
  let tiles = 0;
  for (let z = z0; z <= z1; z++)
    for (let x = tileX(Math.min(...xs), z); x <= tileX(Math.max(...xs), z); x++)
      for (let y = tileY(Math.max(...ys), z); y <= tileY(Math.min(...ys), z); y++) {
        const tile = index.getTile(z, x, y);
        if (!tile) continue;
        tiles++;
        const k = tile.features.reduce((sum, ft) => sum + (ft.type === 3 ? ringCrossings(ft.geometry) : 0), 0);
        if (k) fail(`the sea area (${name}) crosses itself ${k} times in tile ${z}/${x}/${y} as MapLibre tiles it`);
      }
  const g = seaOf[name].geometry;
  console.log(`sea area, ${name} (zoom ${z0}–${z1}): smoothed by ${s.radius} m, simplified to ${s.interval} m; ${g.coordinates.length - 1} islands cut out, ${g.coordinates.flat().length} vertices; no ring crossing in ${tiles} tiles`);
}
const seaNorth = Math.max(...sea.geometry.coordinates[0].map((c) => c[1]));
console.log(`sea area reaches ${seaNorth.toFixed(3)}°N up the estuaries the OSM coastline leaves open`);
// The area's name sits on open water, well inside.
const AREA_LABEL_AT = [90.35, 19.4];
const inRing = ([x, y], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
if (!inRing(AREA_LABEL_AT, sea.geometry.coordinates[0])) fail('the area label is not inside the sea area');

// The junction's view: the junction with the nearest stretch of Bangladesh's own coast — the sea area's
// coastal edge, more than 3 km from either boundary line — so the view is never open water only.
const lineVerts = [...lineGeom['india-line'].coordinates, ...lineGeom['myanmar-line'].coordinates.flat(), ...arc];
const nearLine = (p) => lineVerts.some((q) => Math.abs(q[0] - p[0]) < 0.05 && Math.abs(q[1] - p[1]) < 0.05 && inverse(p, q).distance < 3000);
const coastNearJunction = sea.geometry.coordinates[0]
  .reduce((best, p) => { const d = Math.hypot((p[0] - P.junction[0]) * 0.95, p[1] - P.junction[1]); return d < best.d && !nearLine(p) ? { p, d } : best; }, { p: null, d: Infinity }).p;
if (!coastNearJunction) fail("no coast found for the junction's view");
console.log(`junction's view: with Bangladesh's coast at ${coastNearJunction.map((v) => v.toFixed(3)).join(', ')}, ${(inverse(P.junction, coastNearJunction).distance / 1000).toFixed(0)} km away`);

// ---- the frame, and the basemap's reach ---------------------------------------------------------
const BASEMAP = 'bangladesh-wide';
const FIT = [88.9, 16.5, 92.6, 22.9];
const MAX_BOUNDS = [85.5, 14.5, 95.5, 25.5];
const [jx, jy] = P.junction;
const margin = Math.min(jx - MAX_BOUNDS[0], MAX_BOUNDS[2] - jx, jy - MAX_BOUNDS[1], MAX_BOUNDS[3] - jy);
if (margin < 1) fail(`the map's bounds hold the junction with ${margin.toFixed(2)}° to spare, under 1°`);
const bdBox = JSON.parse(fs.readFileSync(path.join(HERE, 'bangladesh.config.mjs'), 'utf8').match(/export const COVERAGE = (\[[^\]]+\])/)[1]);
console.log(`basemap ${BASEMAP}: world.pmtiles draws the whole Earth; the Bangladesh archive's box ends at ${bdBox[1]}°N, the junction is at ${jy.toFixed(4)}°N (${(bdBox[1] - jy).toFixed(2)}° south of it, on world.pmtiles); the map's bounds hold it with ${margin.toFixed(2)}° to spare, and the opening frame with ${(jy - FIT[1]).toFixed(2)}°`);

// ---- records ---------------------------------------------------------------------------------
// The card's row fields, in the seed's label order; every item's rows must be among them.
const ROW_FIELDS = Object.keys(seed.rowLabels).filter((k) => !k.startsWith('_'));
for (const item of seed.items) for (const f of Object.keys(item.rows ?? {})) if (!ROW_FIELDS.includes(f)) throw new Error(`${item.id}: row «${f}» has no label in rowLabels`);
const bbox = (coords) => {
  const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 1e4) / 1e4);
};
const around = ([x, y], d) => [x - d, y - d, x + d, y + d].map((v) => Math.round(v * 1e4) / 1e4);
const stMartinsAt = centre.map((v) => Math.round(v * 1e5) / 1e5);
const records = {};
for (const item of seed.items) {
  const row = { nameBn: item.name.bn, kind: item.kind, hasLine: Boolean(item.line) };
  // The card's rows (step 2): each fact a field, from an official source; absent where the item has none.
  for (const [field, v] of Object.entries(item.rows ?? {})) row[field] = v.bn;
  if (item.line) row.frame = bbox(lineGeom[item.id].type === 'MultiLineString' ? [...lineGeom[item.id].coordinates.flat(), ...arc] : lineGeom[item.id].coordinates);
  if (item.at === 'stMartins') Object.assign(row, { at: stMartinsAt, frame: bbox([...arc, ...island.flatMap((f) => f.geometry.coordinates[0])]) });
  if (item.at === 'junction') {
    const [a, b] = [around(P.junction, 0.35), around(coastNearJunction, 0.15)];
    Object.assign(row, { at: P.junction.map((v) => Math.round(v * 1e6) / 1e6), frame: bbox([[a[0], a[1]], [a[2], a[3]], [b[0], b[1]], [b[2], b[3]]]) });
  }
  records[item.id] = row;
}

// ---- geometry files ----------------------------------------------------------------------------
const feature = (properties, geometry) => ({ type: 'Feature', properties, geometry });
const fc = (features) => ({ type: 'FeatureCollection', features });
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bnNumber = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[d]);
const vertices = [
  ...Object.keys(seed.points).filter((k) => k.startsWith('itlos-')).map((k) => feature({ kind: 'myanmar' }, { type: 'Point', coordinates: r6([P[k]])[0] })),
  ...Object.keys(seed.points).filter((k) => k.startsWith('pca-')).map((k) => feature({ kind: 'india' }, { type: 'Point', coordinates: r6([P[k]])[0] })),
  ...Object.keys(seed.points).filter((k) => k.startsWith('baseline-')).map((k) => feature({ kind: 'baseline', n: bnNumber(k.split('-')[1]) }, { type: 'Point', coordinates: r6([P[k]])[0] })),
];
const OSM_CREDIT = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>';
const files = {
  'items.json': records,
  'lines.geojson': fc(Object.entries(lineGeom).map(([item, g]) => feature({ item }, g))),
  'arc.geojson': fc([feature({ label: seed.approxLabel.bn }, { type: 'LineString', coordinates: r6(arc) })]),
  'area.geojson': fc([feature({}, seaOf.detail.geometry), feature({ label: seed.area.label.bn }, { type: 'Point', coordinates: AREA_LABEL_AT })]),
  'area-overview.geojson': fc([feature({}, seaOf.overview.geometry)]),
  'vertices.geojson': fc(vertices),
  'info.json': { _about: `Built by tools/build-${ID}.mjs from the seed in data-sources/${ID}/; do not edit.`, lines: seed.info.map((l) => ({ text: l.bn, group: l.group })) },
};

// ---- the descriptor ------------------------------------------------------------------------------
const COLOR = { myanmar: '#c2410c', india: '#6a1b9a', baseline: '#0b3d91', sea: '#1e88e5' };
const kindColor = ['match', ['get', 'kind'], 'myanmar', COLOR.myanmar, 'india', COLOR.india, COLOR.baseline];
const credit = (s) => `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title} (${s.by})</a>`;
const CREDITED = ['itlos', 'pca', 'sro328', 'act2021', 'clcs', 'ind2017', 'mmr2019', 'ind2021', 'mmr2021', 'teknafUpazila', 'coxsbazarDistrict'];
const selectAndFrame = [{ action: 'select' }, { action: 'fitBounds', clear: ['sheet'], duration: 1800, field: 'frame' }];
const descriptor = {
  schema: 'geoquest/map-descriptor@1',
  id: ID,
  section: seed.section,
  title: { bn: seed.title.bn, en: seed.title.en },
  basemap: BASEMAP,
  view: { fitBounds: FIT },
  constraints: { maxZoom: 11, maxBounds: MAX_BOUNDS },
  minTextSize: 14,
  lookups: {},
  records: {
    items: {
      file: './items.json',
      fields: {
        nameBn: { type: 'text', required: true },
        kind: { type: 'text', required: true, display: false },
        hasLine: { type: 'boolean', required: true, display: false },
        at: { type: 'point', appliesWhen: { hasLine: false } },
        frame: { type: 'bbox', required: true },
        ...Object.fromEntries(ROW_FIELDS.map((f) => [f, { type: 'text' }])),
      },
    },
  },
  sources: {
    area: { geometry: './area.geojson', attribution: OSM_CREDIT },
    areaOverview: { geometry: './area-overview.geojson', attribution: OSM_CREDIT },
    lines: { records: 'items', geometry: './lines.geojson', joinField: 'item', expectGeometry: { hasLine: true }, state: ['selected'], properties: ['kind', 'nameBn'] },
    arc: { geometry: './arc.geojson', attribution: OSM_CREDIT },
    vertices: { geometry: './vertices.geojson' },
    points: { records: 'items', geometryFrom: 'at', state: ['selected'], properties: ['nameBn'], selectionMarker: true },
  },
  styles: {
    'sea-fill': { paint: { 'fill-color': COLOR.sea, 'fill-opacity': 0.16 } },
    'line-casing': { layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'selected'], 8, 5.5] } },
    'line-trace': { layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': kindColor, 'line-width': ['case', ['get', 'selected'], 4.5, ['==', ['get', 'kind'], 'baseline'], 2, 3] } },
    'arc-line': { layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': COLOR.myanmar, 'line-width': 3, 'line-dasharray': [2, 1.5] } },
    'vertex-dot': { paint: { 'circle-radius': 3, 'circle-color': kindColor, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff' } },
    'vertex-number': { layout: { 'text-font': ['Noto Sans Bengali'], 'text-size': 14, 'text-offset': [0, -1.1], 'text-allow-overlap': false }, paint: { 'text-color': COLOR.baseline, 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
    'line-label': { layout: { 'symbol-placement': 'line', 'text-font': ['Noto Sans Bengali'], 'text-size': 14, 'symbol-spacing': 400, 'text-max-angle': 30 }, paint: { 'text-color': kindColor, 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
    'arc-label': { layout: { 'symbol-placement': 'line', 'text-font': ['Noto Sans Bengali'], 'text-size': 14, 'symbol-spacing': 300 }, paint: { 'text-color': COLOR.myanmar, 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
    'area-label': { layout: { 'text-font': ['Noto Sans Bengali'], 'text-size': 15 }, paint: { 'text-color': '#0d47a1', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
    'point-marker': { paint: { 'circle-radius': 6, 'circle-color': '#0b3d91', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } },
    'point-label': { layout: { 'text-font': ['Noto Sans Bengali'], 'text-variable-anchor': ['right', 'left', 'top', 'bottom'], 'text-radial-offset': 1, 'text-optional': true }, paint: { 'text-color': '#0b3d91', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
  },
  layers: [
    { id: 'sea-area-overview', type: 'fill', source: 'areaOverview', slot: 'belowLabels', style: 'sea-fill', maxzoom: SMOOTH.detail.zooms[0] },
    { id: 'sea-area', type: 'fill', source: 'area', slot: 'belowLabels', style: 'sea-fill', minzoom: SMOOTH.detail.zooms[0], filter: ['==', ['geometry-type'], 'Polygon'] },
    { id: 'line-casing', type: 'line', source: 'lines', slot: 'belowLabels', style: 'line-casing' },
    { id: 'line-trace', type: 'line', source: 'lines', slot: 'belowLabels', style: 'line-trace' },
    { id: 'arc-line', type: 'line', source: 'arc', slot: 'belowLabels', style: 'arc-line' },
    { id: 'vertex-dots', type: 'circle', source: 'vertices', slot: 'belowLabels', style: 'vertex-dot' },
    { id: 'line-labels', type: 'symbol', source: 'lines', slot: 'aboveLabels', style: 'line-label', filter: ['!=', ['get', 'kind'], 'baseline'], layout: { 'text-field': ['get', 'nameBn'] } },
    { id: 'arc-label', type: 'symbol', source: 'arc', slot: 'aboveLabels', style: 'arc-label', minzoom: 8, layout: { 'text-field': ['get', 'label'] } },
    { id: 'vertex-numbers', type: 'symbol', source: 'vertices', slot: 'aboveLabels', style: 'vertex-number', minzoom: 6, filter: ['has', 'n'], layout: { 'text-field': ['get', 'n'] } },
    { id: 'point-markers', type: 'circle', source: 'points', slot: 'aboveLabels', style: 'point-marker', filter: ['!', ['get', 'selected']] },
    { id: 'point-labels', type: 'symbol', source: 'points', slot: 'aboveLabels', style: 'point-label', layout: { 'text-field': ['get', 'nameBn'], 'text-size': ['case', ['get', 'selected'], 16, 14] } },
    // The sea area's name last: MapLibre places the topmost symbol layer first, so on a collision the
    // baseline's numbers and the other names give way to it (step 1b).
    { id: 'area-label', type: 'symbol', source: 'area', slot: 'aboveLabels', style: 'area-label', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['get', 'label'] } },
  ],
  controls: [
    { type: 'picker', id: 'item', from: 'items', labelField: 'nameBn', placeholder: seed.words.placeholder.bn, labelEn: 'Choose a boundary or a place', do: selectAndFrame },
  ],
  interactions: [
    { on: 'click', target: 'source:lines', do: selectAndFrame },
    { on: 'click', target: 'source:points', do: selectAndFrame },
  ],
  sheet: { title: { field: 'nameBn' }, rows: ROW_FIELDS.map((f) => ({ label: seed.rowLabels[f].bn, field: f })) },
  // No heading for conflicts: no source conflicts with another now (step 2).
  info: { file: './info.json', headings: { conflicts: '', ...Object.fromEntries(Object.entries(seed.infoHeadings).map(([k, v]) => [k, v.bn])) } },
  attribution: { extra: CREDITED.map((k) => credit(seed.sources[k])) },
};

// ---- write ------------------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { recursive: true });
fs.writeFileSync(path.join(OUT, 'descriptor.json'), JSON.stringify(descriptor, null, 2) + '\n');
for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), JSON.stringify(data) + '\n');
const sizes = fs.readdirSync(OUT).map((f) => `${f} ${fs.statSync(path.join(OUT, f)).size.toLocaleString('en')}`);
console.log(`wrote ${OUT}: ${sizes.join(', ')}`);

// ---- the strings awaiting the user's approval ---------------------------------------------------------
const pending = [];
const walk = (v, where) => {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
  else if (v && typeof v === 'object') {
    if (typeof v.bn === 'string' && v.approved === false) pending.push(`${where}: «${v.bn}»`);
    for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
  }
};
walk(seed, 'seed');
console.log(`${pending.length} Bengali strings await approval (approved: false):\n  ${pending.join('\n  ')}`);
