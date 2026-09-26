// Builds shared/tiles/bangladesh.pmtiles: the regional basemap for the
// Bangladesh section. What it covers and where the detail stops are in
// bangladesh.config.mjs; every input is pinned in sources.json.
//
//   land, coast       OpenStreetMap (committed snapshot, extract-bangladesh.mjs)
//   muted             the land of every unit this basemap does not cover
//   lakes             Natural Earth 1:10m
//   rivers            OpenStreetMap (committed snapshot), named inside Bangladesh
//   river_labels      the two display names of the main channel, placed as points
//   borders           Bangladesh's land border from OCHA COD-AB (the Bangladesh
//                     Bureau of Statistics' line); every other border from
//                     Natural Earth 1:10m, Bangladesh point of view
//   admin             division and district lines of Bangladesh (OCHA COD-AB),
//                     district and state lines of West Bengal, Tripura and
//                     Cachar (geoBoundaries India), Rakhine's state line
//                     (Natural Earth admin-1)
//   admin_labels      unit names — Bengali from tools/sources/bangladesh-names.json
//   country_labels    the fields world.pmtiles carries, so the shell baseline
//                     works on this archive unchanged
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import mapshaper from 'mapshaper';
import { writeArchive } from './lib/pmtiles-writer.mjs';
import { CACHE, readSource, prepare, bangladeshLineClass, featureCollection, bboxPolygon, zipEntry } from './lib/geo.mjs';
import { COVERAGE, FRAME, DETAIL_AREAS, OVERVIEW_MIN_ZOOM, OVERVIEW_MAX_ZOOM, DETAIL_MIN_ZOOM, DETAIL_MAX_ZOOM } from './bangladesh.config.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Inside the served tree. Change here if it moves.
const OUT = path.join(ROOT, 'docs', 'shared', 'tiles', 'bangladesh.pmtiles');
const NAMES = path.join(HERE, 'sources', 'bangladesh-names.json');
const VT_OPTIONS = { extent: 4096, buffer: 64, tolerance: 3, indexMaxPoints: 0 };
const [DETAIL_BOX] = Object.values(DETAIL_AREAS);
// The class Bangladesh's own border carries in the borders layer.
const BD_BORDER_CLASS = 'Bangladesh land border (BBS, COD-AB v03)';

const sources = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
function pinned(entry, file) {
  const buf = fs.readFileSync(file);
  if (sha256(buf) !== entry.sha256) throw new Error(`${path.basename(file)}: sha256 ${sha256(buf)}, pinned ${entry.sha256} — refusing it`);
  return buf;
}

/*
|--------------------------------------------------------------------------
| PINNED COUNTS
|--------------------------------------------------------------------------
|
| How many units each source holds, how many Natural Earth lines of each
| class the Bangladesh point of view draws here, and how long Bangladesh's own
| border is as COD-AB draws it. A move in any of them changes what a student
| sees, so the build stops and reports rather than draw it.
*/
const EXPECTED = {
  'Bangladesh divisions': 8,
  'Bangladesh districts': 64,
  'West Bengal districts': 23,
  'Tripura districts': 8,
  // Natural Earth's lines inside COVERAGE other than Bangladesh's own.
  'border classes': { 'International boundary (verify)': 5, 'Disputed (please verify)': 2 },
  // The mainland stretch from the Sundarbans to the Naf, and the
  // Dahagram–Angarpota exclave, in km.
  'Bangladesh land border': { parts: 2, km: [4038, 29] },
};
const drift = [];
const expect = (what, got) => {
  const want = EXPECTED[what];
  if (JSON.stringify(want) !== JSON.stringify(got)) drift.push(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};

/*
|--------------------------------------------------------------------------
| INPUTS
|--------------------------------------------------------------------------
*/
const codAbZip = pinned(sources.codAbBangladesh, path.join(CACHE, sources.codAbBangladesh.file));
const bd0 = zipEntry(codAbZip, 'bgd_admin0.geojson');
const bd1 = zipEntry(codAbZip, 'bgd_admin1.geojson');
const bd2 = zipEntry(codAbZip, 'bgd_admin2.geojson');
const capitals = zipEntry(codAbZip, 'bgd_admincapitals.geojson');
const gbIndia = JSON.parse(pinned(sources.geoBoundariesIndia, path.join(CACHE, sources.geoBoundariesIndia.file)));
const riversIn = JSON.parse(pinned(sources.osmBangladeshRivers, path.join(ROOT, sources.osmBangladeshRivers.file)));
const landIn = JSON.parse(pinned(sources.osmBangladeshLand, path.join(ROOT, sources.osmBangladeshLand.file)));
const countries = readSource('ne_10m_admin_0_countries_bdg.geojson');
const admin1 = readSource('ne_10m_admin_1_states_provinces.geojson');
const neLines = readSource('ne_10m_admin_0_boundary_lines_land.geojson');
const names = JSON.parse(fs.readFileSync(NAMES, 'utf8'));

expect('Bangladesh divisions', bd1.features.length);
expect('Bangladesh districts', bd2.features.length);

async function ms(cmd, files, target) {
  const out = await mapshaper.applyCommands(`${cmd} -o ${target ? `target=${target} ` : ''}out.json format=geojson geojson-type=FeatureCollection`, files);
  return JSON.parse(out['out.json'].toString());
}
const fc = featureCollection;
const inBox = ([x, y], [w, s, e, n]) => x >= w && x <= e && y >= s && y <= n;
const round = (fcIn, digits = 5) => JSON.parse(JSON.stringify(fcIn, (k, v) => (typeof v === 'number' && k === '' ? v : Array.isArray(v) && typeof v[0] === 'number' ? v.map((n) => Math.round(n * 10 ** digits) / 10 ** digits) : v)));
const linesOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const ringsOf = (g) => (g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []);
const bboxOf = (rings) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (const [x, y] of r) (b[0] = Math.min(b[0], x)), (b[1] = Math.min(b[1], y)), (b[2] = Math.max(b[2], x)), (b[3] = Math.max(b[3], y));
  return b;
};
const inRing = ([x, y], ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inPolygon = (pt, g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)));
const lineKm = (c) => c.slice(1).reduce((d, b, i) => d + Math.hypot((b[0] - c[i][0]) * Math.cos((c[i][1] * Math.PI) / 180), b[1] - c[i][1]) * 111.32, 0);

/*
 * Nearest point on a set of polylines, through a grid of their segments —
 * the lines here run to hundreds of thousands of vertices.
 */
class SegmentGrid {
  constructor(lines, cell = 0.02) {
    this.cell = cell;
    this.cells = new Map();
    for (const line of lines) for (let i = 1; i < line.length; i++) this.add(line[i - 1], line[i]);
  }
  add(a, b) {
    const c = this.cell;
    for (let ix = Math.floor(Math.min(a[0], b[0]) / c); ix <= Math.floor(Math.max(a[0], b[0]) / c); ix++)
      for (let iy = Math.floor(Math.min(a[1], b[1]) / c); iy <= Math.floor(Math.max(a[1], b[1]) / c); iy++) {
        const k = ix * 100000 + iy;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push([a[0], a[1], b[0], b[1]]);
      }
  }
  /** { km, at } for the nearest point within maxKm, or null. */
  nearest(p, maxKm) {
    const c = this.cell;
    const k = Math.cos((p[1] * Math.PI) / 180);
    const r = maxKm / 111.32;
    let best = null;
    let bestD = Infinity;
    for (let ix = Math.floor((p[0] - r / k) / c); ix <= Math.floor((p[0] + r / k) / c); ix++)
      for (let iy = Math.floor((p[1] - r) / c); iy <= Math.floor((p[1] + r) / c); iy++)
        for (const [ax, ay, bx, by] of this.cells.get(ix * 100000 + iy) ?? []) {
          const dx = (bx - ax) * k;
          const dy = by - ay;
          const t = Math.max(0, Math.min(1, (((p[0] - ax) * k) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
          const d = Math.hypot((p[0] - ax) * k - t * dx, p[1] - ay - t * dy);
          if (d < bestD) (bestD = d), (best = [ax + t * (bx - ax), ay + t * (by - ay)]);
        }
    return best && bestD * 111.32 <= maxKm ? { km: bestD * 111.32, at: best } : null;
  }
}

/*
|--------------------------------------------------------------------------
| UNITS
|--------------------------------------------------------------------------
|
| Bangladesh by COD-AB pcode. India by geoBoundaries shapeName, but only as
| the name the names table records for a district the Local Government
| Directory lists, and only inside COVERAGE: each must match exactly once.
| Rakhine by Natural Earth's adm1_code.
*/
const inCoverage = await ms(`-i in.json -clip bbox=${COVERAGE}`, { 'in.json': gbIndia });
const indiaUnits = new Map(); // geoBoundaries shapeName → names-table entry
for (const [key, unit] of Object.entries(names.india)) {
  const hits = inCoverage.features.filter((f) => f.properties.shapeName === unit.geoBoundaries);
  if (hits.length !== 1) throw new Error(`${key}: geoBoundaries "${unit.geoBoundaries}" matches ${hits.length} features inside COVERAGE`);
  indiaUnits.set(unit.geoBoundaries, { key, ...unit, shapeID: hits[0].properties.shapeID });
}
const focusIndia = (shapeName) => indiaUnits.get(shapeName)?.state;
expect('West Bengal districts', [...indiaUnits.values()].filter((u) => u.state === 'West Bengal').length);
expect('Tripura districts', [...indiaUnits.values()].filter((u) => u.state === 'Tripura').length);

const RAKHINE = 'MMR-3273';
const POV = ['BGD', 'IND', 'MMR', 'NPL', 'BTN', 'CHN'];
const pov = Object.fromEntries(
  await Promise.all(
    POV.map(async (a3) => [a3, (await ms(`-i in.json -clip bbox=${COVERAGE}`, { 'in.json': fc(countries.features.filter((f) => f.properties.ADM0_A3 === a3)) })).features]),
  ),
);

/*
|--------------------------------------------------------------------------
| BANGLADESH'S LAND BORDER — the government's line
|--------------------------------------------------------------------------
|
| Inside this archive Bangladesh's own border is the Bangladesh Bureau of
| Statistics' line, as OCHA COD-AB v03 publishes it, not Natural Earth's
| point-of-view line: measured along the whole border, the 1:10m line runs a
| median 1.44 km and up to 8.64 km off it, and crosses the Padma. Every other
| border in the box stays Natural Earth's.
|
| COD-AB's outline is coast and land border in one ring. The land border is
| the stretch of the mainland ring between the two places where Natural
| Earth's own Bangladesh lines meet the sea — in the Sundarbans and in the
| Naf — taken as the ring vertices nearest those two ends, together with the
| whole ring of any part the land surrounds (the Dahagram–Angarpota
| exclave). Every other part is an island, all coast.
*/
const bd = fc(bd0.features.map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })));
const bdParts = bd0.features[0].geometry.coordinates;
const neBangladesh = neLines.features.filter((f) => bangladeshLineClass(f.properties) !== null && [f.properties.ADM0_A3_L, f.properties.ADM0_A3_R].includes('BGD'));
const neBangladeshParts = neBangladesh.flatMap((f) => linesOf(f.geometry).map((c) => ({ c, with: f.properties.ADM0_A3_L === 'BGD' ? f.properties.ADM0_A3_R : f.properties.ADM0_A3_L })));
const endKey = (p) => p.map((v) => v.toFixed(6)).join();
const endCount = new Map();
for (const { c } of neBangladeshParts) for (const p of [c[0], c[c.length - 1]]) endCount.set(endKey(p), (endCount.get(endKey(p)) ?? 0) + 1);
const seaEnds = neBangladeshParts.flatMap(({ c }) => [c[0], c[c.length - 1]]).filter((p) => endCount.get(endKey(p)) === 1);
if (seaEnds.length !== 2) throw new Error(`Natural Earth's Bangladesh lines have ${seaEnds.length} free ends, not the two where they meet the sea`);

const mainIndex = bdParts.reduce((a, p, i) => (p[0].length > bdParts[a][0].length ? i : a), 0);
const mainRing = bdParts[mainIndex][0].slice(0, -1);
const kmBetween = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180), a[1] - b[1]) * 111.32;
const nearestVertex = (pt) => mainRing.reduce((best, v, i) => (kmBetween(v, pt) < kmBetween(mainRing[best], pt) ? i : best), 0);
const [ia, ib] = seaEnds.map(nearestVertex).sort((a, b) => a - b);
const pathA = mainRing.slice(ia, ib + 1);
const pathB = [...mainRing.slice(ib), ...mainRing.slice(0, ia + 1)];
// The land border runs beside Natural Earth's line; the coast runs away from it.
const neGrid = new SegmentGrid(neBangladeshParts.map((x) => x.c));
const meanOff = (p) => {
  const step = Math.max(1, Math.floor(p.length / 400));
  const ds = [];
  for (let i = 0; i < p.length; i += step) ds.push(neGrid.nearest(p[i], 50)?.km ?? 50);
  return ds.reduce((a, b) => a + b, 0) / ds.length;
};
const mainland = meanOff(pathA) < meanOff(pathB) ? pathA : pathB;
// A part the land surrounds: every point just outside its bounding box is on land.
const landDetailAll = landIn.features.filter((f) => f.properties.set === 'detail');
const onLand = (pt) => landDetailAll.some((f) => inPolygon(pt, f.geometry));
const surrounded = bdParts
  .map((p, i) => ({ ring: p[0], i }))
  .filter(({ i }) => i !== mainIndex)
  .filter(({ ring }) => {
    const [w, s, e, n] = bboxOf([ring]).map((v, j) => v + (j < 2 ? -0.02 : 0.02));
    return [[w, s], [e, s], [e, n], [w, n], [(w + e) / 2, s], [(w + e) / 2, n], [w, (s + n) / 2], [e, (s + n) / 2]].every(onLand);
  });
const landBorderLines = [mainland, ...surrounded.map(({ ring }) => ring)];
const landBorder = fc(landBorderLines.map((c) => ({ type: 'Feature', properties: { class: BD_BORDER_CLASS }, geometry: { type: 'LineString', coordinates: c } })));
expect('Bangladesh land border', { parts: landBorderLines.length, km: landBorderLines.map((c) => Math.round(lineKm(c))) });
const borderGrid = new SegmentGrid(landBorderLines);
// It must run beside Natural Earth's line all the way, or the wrong stretch was taken.
const worstOff = Math.max(...landBorderLines.flatMap((c) => c.filter((_, i) => i % 50 === 0).map((p) => neGrid.nearest(p, 20)?.km ?? 20)));
if (worstOff > 12) throw new Error(`the land border strays ${worstOff.toFixed(1)} km from Natural Earth's Bangladesh line — the wrong stretch of the outline was taken`);

// Every other unit yields to Bangladesh as COD-AB draws it, and to the
// point-of-view polygons of the other countries.
const others = (...a3s) => fc([...bd.features, ...a3s.flatMap((x) => pov[x])]);
const indiaDistricts = await ms('-i combine-files d.json o.json -target d -erase source=o -filter-fields shapeName,shapeID', { 'd.json': inCoverage, 'o.json': others('MMR', 'NPL', 'BTN', 'CHN') }, 'd');
const myanmarAll = await ms(`-i in.json -clip bbox=${COVERAGE} -filter-fields adm1_code,name`, { 'in.json': fc(admin1.features.filter((f) => f.properties.adm0_a3 === 'MMR')) });
const myanmarStates = await ms('-i combine-files s.json o.json -target s -erase source=o', { 's.json': myanmarAll, 'o.json': others('IND', 'NPL', 'BTN', 'CHN') }, 's');
if (myanmarStates.features.filter((f) => f.properties.adm1_code === RAKHINE).length !== 1) throw new Error(`${RAKHINE} (Rakhine) must match exactly once`);

const units = [
  ...bd.features.map((f) => ({ ...f, properties: { unit: 'BGD', country: 'BGD', focus: true } })),
  ...indiaDistricts.features.map((f) => ({ ...f, properties: { unit: f.properties.shapeName, country: 'IND', focus: !!focusIndia(f.properties.shapeName) } })),
  ...myanmarStates.features.map((f) => ({ ...f, properties: { unit: f.properties.adm1_code, country: 'MMR', focus: f.properties.adm1_code === RAKHINE } })),
  ...['NPL', 'BTN', 'CHN'].flatMap((a3) => pov[a3].map((f) => ({ ...f, properties: { unit: a3, country: a3, focus: false } }))),
];

/*
|--------------------------------------------------------------------------
| MUTED LAND, and where the sources disagree
|--------------------------------------------------------------------------
|
| District edges from geoBoundaries and Natural Earth do not lie on
| Bangladesh's border, and no source's coast lies on OSM's. The land between
| them belongs to no unit. A piece that touches Bangladesh's border lies
| outside it — the border is COD-AB's own edge — so it goes to the nearest
| unit across the border. Any other piece goes to the nearest unit of the
| country whose point-of-view polygon holds it. Each is muted or not with the
| unit it joins, so the muted land meets the border exactly.
*/
function nearestUnit(point, candidates) {
  let best = null;
  let bestD = Infinity;
  const [px, py] = point;
  const k = Math.cos((py * Math.PI) / 180);
  for (const u of candidates) {
    const [w, s, e, n] = u.bbox;
    if (px < w - bestD / k || px > e + bestD / k || py < s - bestD || py > n + bestD) continue;
    for (const ring of u.rings)
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1];
        const [bx, by] = ring[i];
        const dx = (bx - ax) * k;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, (((px - ax) * k) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot((px - ax) * k - t * dx, py - ay - t * dy);
        if (d < bestD) (bestD = d), (best = u);
      }
  }
  return { unit: best, km: bestD * 111.32 };
}
// Distances are measured against lightly simplified units: 100 m is far below what a piece can be off by.
const unitIndex = (await ms('-i in.json -simplify dp interval=100 keep-shapes', { 'in.json': fc(units) })).features.map((f) => {
  const rings = ringsOf(f.geometry);
  return { ...f.properties, rings, bbox: bboxOf(rings) };
});
const acrossBorder = unitIndex.filter((u) => u.country !== 'BGD');
// On the border: within a metre of it — the erase leaves the piece's edge on it exactly.
const touchesBorder = (g) => ringsOf(g).some((r) => r.some((p) => borderGrid.nearest(p, 0.001)));

const seam = {};
async function mutedLand(land, box, label) {
  const inside = await ms(`-i combine-files l.json u.json -target l -clip bbox=${box} -clip source=u`, { 'l.json': land, 'u.json': fc(units.filter((u) => !u.properties.focus)) }, 'l');
  const gaps = await ms(`-i combine-files l.json u.json -target l -clip bbox=${box} -erase source=u -explode -filter "this.area > 1e4"`, { 'l.json': land, 'u.json': fc(units) }, 'l');
  const points = await ms('-i in.json -points inner', { 'in.json': gaps });
  const tally = { pieces: gaps.features.length, km2: 0, muted: 0, byCountry: {}, border: {}, borderPieces: 0, biggest: null };
  const muted = [];
  gaps.features.forEach((piece, i) => {
    const pt = points.features[i].geometry.coordinates;
    const onBorder = touchesBorder(piece.geometry);
    const home = POV.find((a3) => pov[a3].some((f) => inPolygon(pt, f.geometry)));
    const { unit } = nearestUnit(pt, onBorder ? acrossBorder : home ? unitIndex.filter((u) => u.country === home) : unitIndex);
    const km2 = Math.abs(ringArea(piece.geometry));
    tally.km2 += km2;
    tally.byCountry[unit.country] = (tally.byCountry[unit.country] || 0) + km2;
    if (onBorder) {
      tally.borderPieces++;
      tally.border[unit.country] = (tally.border[unit.country] || 0) + km2;
      if (!tally.biggest || km2 > tally.biggest.km2) tally.biggest = { km2, at: pt };
    }
    if (!unit.focus) muted.push(piece), (tally.muted += 1);
  });
  seam[label] = tally;
  console.log(`  ${label}: ${tally.pieces} unowned pieces, ${tally.km2.toFixed(0)} km² — to ${Object.entries(tally.byCountry).map(([c, a]) => `${c} ${a.toFixed(0)}`).join(', ')} km²; ${tally.borderPieces} on Bangladesh's border; ${tally.muted} muted`);
  return fc([...inside.features, ...muted].map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })));
}
function ringArea(g) {
  const R = 6371.0088;
  let total = 0;
  for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
    poly.forEach((ring, i) => {
      let s = 0;
      for (let j = 0; j < ring.length - 1; j++) {
        const [x1, y1] = ring[j];
        const [x2, y2] = ring[j + 1];
        s += (((x2 - x1) * Math.PI) / 180) * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
      }
      total += (i === 0 ? 1 : -1) * Math.abs((s * R * R) / 2);
    });
  return total;
}

/*
|--------------------------------------------------------------------------
| LINES
|--------------------------------------------------------------------------
|
| Administrative lines are the edges each source shares between its own
| units; an edge on a country's outside is never drawn, because the border
| already is. Bangladesh's district lines end on its border exactly — COD-AB
| draws both. Another source's line that overshoots a border is cut there;
| one that stops short is carried straight on to it (at most 3 km). Natural
| Earth's lines that met its old Bangladesh line — India and Myanmar's, at
| the three-country point — are carried on to the new one the same way.
*/
const neOthers = prepare(neLines, (p) => ({ class: bangladeshLineClass(p) }), (p) => bangladeshLineClass(p) !== null && ![p.ADM0_A3_L, p.ADM0_A3_R].includes('BGD'));
const neInBox = await ms(`-i combine-files l.json b.json -target l -clip bbox=${COVERAGE} -erase source=b`, { 'l.json': neOthers, 'b.json': bd }, 'l');
const borderClasses = {};
for (const f of neInBox.features) borderClasses[f.properties.class] = (borderClasses[f.properties.class] || 0) + 1;
expect('border classes', Object.fromEntries(Object.entries(borderClasses).sort(([a], [b]) => (a === 'International boundary (verify)' ? -1 : b === 'International boundary (verify)' ? 1 : a.localeCompare(b)))));

function snapTo(lines, grid, maxKm) {
  const degree = new Map();
  const parts = lines.features.flatMap((f) => linesOf(f.geometry));
  for (const c of parts) for (const p of [c[0], c[c.length - 1]]) degree.set(endKey(p), (degree.get(endKey(p)) || 0) + 1);
  let extended = 0;
  let longest = 0;
  const extend = (c) => {
    for (const end of [0, 1]) {
      const p = end ? c[c.length - 1] : c[0];
      if (degree.get(endKey(p)) !== 1) continue;
      const hit = grid.nearest(p, maxKm);
      if (!hit || hit.km < 0.001) continue;
      if (end) c.push(hit.at);
      else c.unshift(hit.at);
      extended++;
      longest = Math.max(longest, hit.km);
    }
    return c;
  };
  const features = lines.features.map((f) => ({
    ...f,
    geometry: f.geometry.type === 'LineString' ? { type: 'LineString', coordinates: extend([...f.geometry.coordinates]) } : { type: 'MultiLineString', coordinates: f.geometry.coordinates.map((c) => extend([...c])) },
  }));
  return { lines: fc(features), extended, longest };
}
// Natural Earth's own lines join the new border where they met the old one.
const neSnap = snapTo(neInBox, borderGrid, 5);
const allBorders = fc([...neSnap.lines.features, ...landBorder.features]);
const allBorderGrid = new SegmentGrid(allBorders.features.flatMap((f) => linesOf(f.geometry)));

const bdLines = await ms(`-i in.json -lines adm1_pcode -filter "TYPE != 'outer'" -each "level = TYPE == 'adm1_pcode' ? 'division' : 'district'" -filter-fields level`, { 'in.json': bd2 });
const indiaLines = await ms(
  `-i combine-files d.json o.json -target d -each "grp = ${JSON.stringify(Object.fromEntries([...indiaUnits.values()].map((u) => [u.geoBoundaries, u.state]))).replace(/"/g, "'")}[shapeName] || 'other', key = grp == 'other' ? 'other' : shapeName" -dissolve key copy-fields=grp -lines grp -filter "TYPE != 'outer'" -each "level = TYPE == 'grp' ? 'state' : 'district'" -filter-fields level -erase source=o`,
  { 'd.json': inCoverage, 'o.json': others('MMR', 'NPL', 'BTN', 'CHN') },
  'd',
);
const myanmarLines = await ms(
  `-i combine-files s.json o.json -target s -each "grp = adm1_code == '${RAKHINE}' ? 'rakhine' : 'other'" -dissolve grp -lines -filter "TYPE != 'outer'" -each "level='state'" -filter-fields level -erase source=o`,
  { 's.json': myanmarAll, 'o.json': others('IND', 'NPL', 'BTN', 'CHN') },
  's',
);
const indiaSnap = snapTo(indiaLines, allBorderGrid, 3);
const myanmarSnap = snapTo(myanmarLines, allBorderGrid, 3);
const admin = fc([...bdLines.features, ...indiaSnap.lines.features, ...myanmarSnap.lines.features]);

// No line may end near the border without ending on it. Near the border's two
// ends — where it reaches the sea — a line ending on the coast is ending right.
const termini = [mainland[0], mainland[mainland.length - 1]];
const dangling = [];
for (const [what, set] of [['Bangladesh', bdLines], ['India', indiaSnap.lines], ['Myanmar', myanmarSnap.lines], ['Natural Earth borders', neSnap.lines]]) {
  const degree = new Map();
  const parts = set.features.flatMap((f) => linesOf(f.geometry));
  for (const c of parts) for (const p of [c[0], c[c.length - 1]]) degree.set(endKey(p), (degree.get(endKey(p)) || 0) + 1);
  for (const c of parts)
    for (const p of [c[0], c[c.length - 1]]) {
      if (degree.get(endKey(p)) !== 1) continue;
      const hit = borderGrid.nearest(p, 3);
      if (hit && hit.km > 0.001 && termini.every((t) => kmBetween(t, p) > 5)) dangling.push(`${what} line end ${hit.km.toFixed(3)} km from Bangladesh's border at ${p.map((v) => v.toFixed(4)).join(', ')}`);
    }
}
if (dangling.length) throw new Error(`lines end near Bangladesh's border without meeting it:\n  ${dangling.join('\n  ')}`);
console.log(`lines: Bangladesh ${bdLines.features.length} (end on its border), India ${indiaLines.features.length} (${indiaSnap.extended} ends carried to a border, longest ${indiaSnap.longest.toFixed(2)} km), Myanmar ${myanmarLines.features.length} (${myanmarSnap.extended}, longest ${myanmarSnap.longest.toFixed(2)} km), Natural Earth borders ${neSnap.extended} carried to Bangladesh's (longest ${neSnap.longest.toFixed(2)} km)`);

/*
|--------------------------------------------------------------------------
| THE SEAM, measured
|--------------------------------------------------------------------------
|
| Bangladesh's border against the neighbours' own edges — geoBoundaries for
| India, Natural Earth admin-1 for Myanmar: how much each claims of the
| other (overlap), how much land neither claims (gap, from the pieces that
| touch the border), and how far apart they run, walking the border at 200 m.
| The janapada unions sit on this seam. Also, for the record, how far
| Natural Earth's point-of-view line runs from COD-AB's.
*/
function densify(lines, stepKm) {
  const out = [];
  for (const c of lines)
    for (let i = 1; i < c.length; i++) {
      const [ax, ay] = c[i - 1];
      const [bx, by] = c[i];
      const n = Math.max(1, Math.ceil((Math.hypot((bx - ax) * Math.cos((ay * Math.PI) / 180), by - ay) * 111.32) / stepKm));
      for (let j = 0; j < n; j++) out.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]);
    }
  return out;
}
const stats = (samples) => {
  const all = samples.map((x) => x.km).sort((a, b) => a - b);
  const q = (f) => all[Math.floor(f * (all.length - 1))];
  const worst = samples.reduce((a, b) => (b.km > a.km ? b : a));
  return { samples: all.length, median: q(0.5), p95: q(0.95), max: worst.km, at: worst.p };
};
const areaKm2 = async (fcIn) => JSON.parse((await mapshaper.applyCommands('-i in.json -each "km2=this.area/1e6" -o out.json format=json', { 'in.json': fcIn }))['out.json'].toString()).reduce((s, r) => s + r.km2, 0);
const clipTo = async (a, b) => ms('-i combine-files a.json b.json -target a -clip source=b', { 'a.json': a, 'b.json': b }, 'a');
const indiaUnion = await ms('-i in.json -dissolve', { 'in.json': inCoverage });
const rakhineOnly = fc(myanmarAll.features.filter((f) => f.properties.adm1_code === RAKHINE));
const otherMyanmar = fc(myanmarAll.features.filter((f) => f.properties.adm1_code !== RAKHINE));
const overlap = {
  India: await areaKm2(await clipTo(indiaUnion, bd)),
  Rakhine: await areaKm2(await clipTo(rakhineOnly, bd)),
  'Myanmar, other states': await areaKm2(await clipTo(otherMyanmar, bd)),
};
// Which neighbour each stretch of the border faces: the country across Natural Earth's nearest line.
const byCountryGrid = { IND: new SegmentGrid(neBangladeshParts.filter((x) => x.with === 'IND').map((x) => x.c)), MMR: new SegmentGrid(neBangladeshParts.filter((x) => x.with === 'MMR').map((x) => x.c)) };
const edges = { IND: new SegmentGrid(ringsOf(indiaUnion.features[0].geometry)), MMR: new SegmentGrid(myanmarAll.features.flatMap((f) => ringsOf(f.geometry))) };
const offset = { IND: [], MMR: [] };
for (const p of densify(landBorderLines, 0.2)) {
  const i = byCountryGrid.IND.nearest(p, 30)?.km ?? Infinity;
  const m = byCountryGrid.MMR.nearest(p, 30)?.km ?? Infinity;
  const c = i <= m ? 'IND' : 'MMR';
  offset[c].push({ p, km: edges[c].nearest(p, 30)?.km ?? 30 });
}
const neVsCodAb = stats(densify(neBangladeshParts.map((x) => x.c), 0.2).map((p) => ({ p, km: borderGrid.nearest(p, 30)?.km ?? 30 })));

/*
|--------------------------------------------------------------------------
| RIVERS, LAKES, COAST
|--------------------------------------------------------------------------
*/
const riverNames = names.rivers;
for (const f of riversIn.features) if (!riverNames[f.properties.river]) throw new Error(`river "${f.properties.river}" has no entry in ${path.basename(NAMES)}`);
// Named only where they run through Bangladesh: outside it the basemap names
// only the units it covers. A river whose names table gives display labels
// is named by those, at their places, not along its line.
const riversNamed = await ms('-i combine-files r.json b.json -target r -clip source=b', { 'r.json': riversIn, 'b.json': bd }, 'r');
const riversOutside = await ms(`-i combine-files r.json b.json -target r -clip bbox=${COVERAGE} -erase source=b`, { 'r.json': riversIn, 'b.json': bd }, 'r');
const rivers = fc([
  ...riversNamed.features.map((f) => {
    const n = riverNames[f.properties.river];
    return { ...f, properties: n.displayLabels || !n.nameBn ? {} : { name_en: n.nameEn, name_bn: n.nameBn } };
  }),
  ...riversOutside.features.map((f) => ({ ...f, properties: {} })),
]);
// The display labels: each on the river, at the point nearest the town it is
// placed by — on the channel itself, a stretch of 20 km or more, never on a
// short side piece that happens to lie nearer.
const MAIN_STRETCH_KM = 20;
const riverLabels = [];
for (const [key, r] of Object.entries(riverNames)) {
  if (!r.displayLabels) continue;
  const grid = new SegmentGrid(riversNamed.features.filter((f) => f.properties.river === key).flatMap((f) => linesOf(f.geometry)).filter((c) => lineKm(c) >= MAIN_STRETCH_KM));
  for (const d of r.displayLabels) {
    const towns = capitals.features.filter((c) => c.properties.adm2_pcode === d.near.adm2_pcode && (c.properties.adm3_pcode ?? null) === (d.near.adm3_pcode ?? null));
    if (towns.length !== 1) throw new Error(`${key} label ${d.nameBn}: ${towns.length} COD-AB capitals match ${JSON.stringify(d.near)}`);
    const town = towns[0].geometry.coordinates;
    const hit = grid.nearest(town, 30);
    if (!hit) throw new Error(`${key} label ${d.nameBn}: no stretch of the river within 30 km of ${d.near.place}`);
    riverLabels.push({
      type: 'Feature',
      // The name sits beside the channel, on the town's side of it.
      properties: { name_bn: d.nameBn, name_en: d.nameEn, anchor: town[0] < hit.at[0] ? 'right' : 'left', min_zoom: 6, max_zoom: 24, detail: inBox(hit.at, DETAIL_BOX) },
      geometry: { type: 'Point', coordinates: hit.at },
    });
  }
}
const lakes = await ms(`-i in.json -clip bbox=${COVERAGE} -filter-fields`, { 'in.json': readSource('ne_10m_lakes.geojson') });

const landOverview = fc(landIn.features.filter((f) => f.properties.set === 'overview'));
const landDetail = fc(landDetailAll);

// The coast is the land outline less every stretch that lies on the clip box.
function coastOf(land, [w, s, e, n]) {
  const on = (a, b) => (a[0] === b[0] && (a[0] === w || a[0] === e)) || (a[1] === b[1] && (a[1] === s || a[1] === n));
  const lines = [];
  for (const f of land.features)
    for (const ring of ringsOf(f.geometry)) {
      let run = [ring[0]];
      for (let i = 1; i < ring.length; i++) {
        if (on(ring[i - 1], ring[i])) {
          if (run.length > 1) lines.push(run);
          run = [ring[i]];
        } else run.push(ring[i]);
      }
      if (run.length > 1) lines.push(run);
    }
  return fc(lines.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })));
}

/*
|--------------------------------------------------------------------------
| LABELS
|--------------------------------------------------------------------------
|
| Bangladesh: every division and district, Bengali from the National Portal.
| Outside Bangladesh: only the units this basemap covers for the janapada
| maps. A unit with no sourced Bengali name is not labelled — never in
| English — and is listed below.
*/
const LISTED_WB = ['Maldah', 'Uttar Dinajpur', 'Dakshin Dinajpur', 'Murshidabad', 'Birbhum', 'Barddhaman', 'Paschim Barddhaman', 'Nadia', 'Bankura', 'Hugli', 'Haora', 'Purba Medinipur', 'Paschim Medinipur', 'Jhargram'];
const unlabelled = [];
const labels = [];
const label = (pt, props, minZoom, maxZoom = 24) => {
  if (!props.name_bn) return unlabelled.push(`${props.level} ${props.name_en}`);
  labels.push({ type: 'Feature', properties: { ...props, min_zoom: minZoom, max_zoom: maxZoom, detail: inBox(pt, DETAIL_BOX) }, geometry: { type: 'Point', coordinates: pt } });
};
const innerPoints = async (fcIn) => (await ms('-i in.json -points inner', { 'in.json': fcIn })).features;
for (const [f, p] of (await innerPoints(bd1)).map((p, i) => [bd1.features[i], p])) {
  const n = names.bangladesh[f.properties.adm1_pcode];
  label(p.geometry.coordinates, { level: 'division', name_en: n.nameEn, name_bn: n.nameBn }, 5, 7);
}
for (const [f, p] of (await innerPoints(bd2)).map((p, i) => [bd2.features[i], p])) {
  const n = names.bangladesh[f.properties.adm2_pcode];
  if (!n) throw new Error(`${f.properties.adm2_pcode}: no name in ${path.basename(NAMES)}`);
  label(p.geometry.coordinates, { level: 'district', name_en: n.nameEn, name_bn: n.nameBn }, 7);
}
const listed = inCoverage.features.filter((f) => LISTED_WB.includes(f.properties.shapeName) || f.properties.shapeName === 'Cachar');
if (listed.length !== LISTED_WB.length + 1) throw new Error(`listed Indian units: ${listed.length} of ${LISTED_WB.length + 1} found`);
for (const [f, p] of (await innerPoints(fc(listed))).map((p, i) => [listed[i], p])) {
  const u = indiaUnits.get(f.properties.shapeName);
  label(p.geometry.coordinates, { level: 'district', name_en: u.nameEn, ...(u.nameBn ? { name_bn: u.nameBn } : {}) }, 6);
}
// Tripura and Rakhine as whole states. Their Bengali names are Natural Earth's, the same field world.pmtiles uses for countries.
const tripura = await ms(`-i in.json -filter "${JSON.stringify(Object.values(names.india).filter((u) => u.state === 'Tripura').map((u) => u.geoBoundaries)).replace(/"/g, "'")}.includes(shapeName)" -dissolve`, { 'in.json': inCoverage });
const states = [
  [tripura, admin1.features.find((f) => f.properties.adm1_code === 'IND-3301').properties],
  [fc(myanmarStates.features.filter((f) => f.properties.adm1_code === RAKHINE)), admin1.features.find((f) => f.properties.adm1_code === RAKHINE).properties],
];
for (const [shape, p] of states) {
  const [pt] = await innerPoints(shape);
  label(pt.geometry.coordinates, { level: 'state', name_en: p.name_en, ...(p.name_bn ? { name_bn: p.name_bn } : {}) }, 5);
}
const adminLabels = fc(labels);

// Countries: Natural Earth's own label point where it falls inside COVERAGE,
// else a point inside the part of the country that does. A sliver under
// 3,000 km² inside the box gets no label.
const countryLabels = [];
for (const a3 of POV) {
  const src = countries.features.find((f) => f.properties.ADM0_A3 === a3).properties;
  let pt = [src.LABEL_X, src.LABEL_Y];
  if (!inBox(pt, COVERAGE)) {
    const part = await ms('-i in.json -dissolve -each "km2=this.area/1e6"', { 'in.json': fc(pov[a3]) });
    if (!part.features.length || part.features[0].properties.km2 < 3000) continue;
    pt = (await innerPoints(part))[0].geometry.coordinates;
  }
  countryLabels.push({ type: 'Feature', properties: { adm0_a3: a3, name_bn: src.NAME_BN, name_en: src.NAME_EN, min_zoom: 0 }, geometry: { type: 'Point', coordinates: pt } });
}

/*
|--------------------------------------------------------------------------
| THE BOXES STILL HOLD WHAT THEY MUST
|--------------------------------------------------------------------------
*/
const extentOf = (features) => bboxOf(features.flatMap((f) => ringsOf(f.geometry)));
const ext = {
  Bangladesh: extentOf(bd2.features),
  'West Bengal': extentOf(inCoverage.features.filter((f) => focusIndia(f.properties.shapeName) === 'West Bengal')),
  Tripura: extentOf(tripura.features),
  Cachar: extentOf(inCoverage.features.filter((f) => f.properties.shapeName === 'Cachar')),
  Rakhine: extentOf(myanmarStates.features.filter((f) => f.properties.adm1_code === RAKHINE)),
};
const union = (list) => [Math.min(...list.map((b) => b[0])), Math.min(...list.map((b) => b[1])), Math.max(...list.map((b) => b[2])), Math.max(...list.map((b) => b[3]))];
const holds = (outer, inner, margin) => outer[0] <= inner[0] - margin && outer[1] <= inner[1] - margin && outer[2] >= inner[2] + margin && outer[3] >= inner[3] + margin;
const needs = {
  COVERAGE: [COVERAGE, union(Object.values(ext))],
  FRAME: [FRAME, union([ext.Bangladesh, ext['West Bengal'], ext.Tripura])],
  DETAIL: [DETAIL_BOX, ext.Bangladesh],
};
for (const [name, [box, need]] of Object.entries(needs)) {
  console.log(`${name.padEnd(8)} ${box.join(', ')}  holds ${need.map((v) => v.toFixed(3)).join(', ')}`);
  if (!holds(box, need, 0.3 - 1e-9)) drift.push(`${name} no longer holds its units with 0.3° to spare`);
}

if (drift.length) throw new Error(`pinned values moved — read the list before re-pinning:\n  ${drift.join('\n  ')}`);

/*
|--------------------------------------------------------------------------
| TILING
|--------------------------------------------------------------------------
|
| Bangladesh's border and its district lines are simplified as one layer, so
| the shared vertex where a line meets the border survives both.
*/
async function simplifiedLines(interval, box) {
  const both = fc([...admin.features.map((f) => ({ ...f, properties: { ...f.properties, kind: 'admin' } })), ...landBorder.features.map((f) => ({ ...f, properties: { ...f.properties, kind: 'border' } }))]);
  const out = await ms(`-i in.json ${box ? `-clip bbox=${box} ` : ''}-simplify dp interval=${interval}`, { 'in.json': both });
  const pick = (kind) => fc(out.features.filter((f) => f.properties.kind === kind).map(({ properties: { kind: _, ...p }, ...f }) => ({ ...f, properties: p })));
  return { admin: pick('admin'), border: pick('border') };
}
console.log('muted land:');
const overviewLines = await simplifiedLines(250);
const layersOverview = {
  land: prepare(landOverview, () => ({})),
  muted: prepare(await mutedLand(landOverview, COVERAGE, 'overview'), () => ({})),
  lakes: prepare(lakes, () => ({})),
  coast: coastOf(landOverview, COVERAGE),
  rivers: prepare(await ms('-i in.json -simplify dp interval=250', { 'in.json': rivers }), (p) => p),
  admin: prepare(overviewLines.admin, (p) => p),
  borders: prepare(fc([...neSnap.lines.features, ...overviewLines.border.features]), (p) => p),
  admin_labels: adminLabels,
  river_labels: fc(riverLabels),
  country_labels: fc(countryLabels),
};
const clipDetail = async (fcIn) => ms(`-i in.json -clip bbox=${DETAIL_BOX}`, { 'in.json': fcIn });
const detailLines = await simplifiedLines(20, DETAIL_BOX);
const layersDetail = {
  detail_extent: fc(Object.entries(DETAIL_AREAS).map(([area, box]) => ({ ...bboxPolygon(box), properties: { area } }))),
  land: prepare(landDetail, () => ({})),
  muted: prepare(await mutedLand(landDetail, DETAIL_BOX, 'detail'), () => ({})),
  lakes: prepare(await clipDetail(lakes), () => ({})),
  coast: coastOf(landDetail, DETAIL_BOX),
  rivers: prepare(await ms(`-i in.json -clip bbox=${DETAIL_BOX} -simplify dp interval=20`, { 'in.json': rivers }), (p) => p),
  admin: prepare(detailLines.admin, (p) => p),
  borders: prepare(fc([...(await clipDetail(neSnap.lines)).features, ...detailLines.border.features]), (p) => p),
  admin_labels: fc(adminLabels.features.filter((f) => f.properties.detail)),
  river_labels: fc(riverLabels.filter((f) => f.properties.detail)),
};
for (const layers of [layersOverview, layersDetail]) for (const k of Object.keys(layers)) layers[k] = round(layers[k]);

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
const tiles = [];
const perZoom = {};
const perLayer = {};
function tileRange(layers, [w, s, e, n], z0, z1) {
  const idx = Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, geojsonvt(v, { ...VT_OPTIONS, maxZoom: z1, indexMaxZoom: z0 })]));
  for (let z = z0; z <= z1; z++)
    for (let x = lon2x(w, z); x <= lon2x(e, z); x++)
      for (let y = lat2y(n, z); y <= lat2y(s, z); y++) {
        const t = {};
        for (const [name, index] of Object.entries(idx)) {
          const tile = index.getTile(z, x, y);
          if (tile && tile.features.length) t[name] = tile;
        }
        if (!Object.keys(t).length) continue;
        for (const [name, tile] of Object.entries(t)) perLayer[name] = (perLayer[name] || 0) + zlib.gzipSync(Buffer.from(vtpbf.fromGeojsonVt({ [name]: tile }, { version: 2 }))).length;
        tiles.push({ z, x, y, data: Buffer.from(vtpbf.fromGeojsonVt(t, { version: 2 })) });
        perZoom[z] = (perZoom[z] || 0) + 1;
      }
}
tileRange(layersOverview, COVERAGE, OVERVIEW_MIN_ZOOM, OVERVIEW_MAX_ZOOM);
for (const box of Object.values(DETAIL_AREAS)) tileRange(layersDetail, box, DETAIL_MIN_ZOOM, DETAIL_MAX_ZOOM);

/*
|--------------------------------------------------------------------------
| WRITE
|--------------------------------------------------------------------------
*/
const fields = (fcIn) => Object.fromEntries([...new Set(fcIn.features.flatMap((f) => Object.keys(f.properties)))].map((k) => [k, 'String']));
const metadata = {
  name: 'GeoQuest Bangladesh',
  description: 'Regional basemap for the Bangladesh section: Bangladesh in detail (z7–10), West Bengal, Tripura, Cachar and Rakhine to z6.',
  attribution: "© OpenStreetMap contributors (ODbL); BBS / OCHA COD-AB (CC BY-IGO), including Bangladesh's border; geoBoundaries (ODbL); Natural Earth, Bangladesh point of view, for every other border",
  vector_layers: [
    ...Object.entries(layersOverview).map(([id, v]) => ({ id, fields: fields(v), minzoom: OVERVIEW_MIN_ZOOM, maxzoom: layersDetail[id] ? DETAIL_MAX_ZOOM : OVERVIEW_MAX_ZOOM })),
    { id: 'detail_extent', fields: { area: 'String' }, minzoom: DETAIL_MIN_ZOOM, maxzoom: DETAIL_MAX_ZOOM },
  ],
  geoquest: { frame: FRAME, maxBounds: COVERAGE, detailAreas: DETAIL_AREAS, overviewMaxZoom: OVERVIEW_MAX_ZOOM, detailMinZoom: DETAIL_MIN_ZOOM, detailMaxZoom: DETAIL_MAX_ZOOM },
};
const [cw, cs, ce, cn] = FRAME;
const { buffer, stats: archiveStats } = writeArchive(tiles, metadata, { minZoom: OVERVIEW_MIN_ZOOM, maxZoom: DETAIL_MAX_ZOOM, bounds: COVERAGE, center: [(cw + ce) / 2, (cs + cn) / 2, 5] });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buffer);

console.log(`\nbangladesh.pmtiles: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(0)} KB), ${archiveStats.tiles} tiles (${archiveStats.unique} unique), zoom ${OVERVIEW_MIN_ZOOM}–${DETAIL_MAX_ZOOM}`);
console.log('tiles per zoom:', Object.entries(perZoom).map(([z, n]) => `z${z}:${n}`).join(' '));
console.log('per layer (gzip):', Object.entries(perLayer).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)} KB`).join(', '));
console.log(`units: Bangladesh ${bd1.features.length} divisions, ${bd2.features.length} districts (COD-AB ${bd2.features[0].properties.version}, valid ${bd2.features[0].properties.valid_on}); India ${indiaUnits.size} (West Bengal ${EXPECTED['West Bengal districts']}, Tripura ${EXPECTED['Tripura districts']}, Cachar)`);
console.log(`Bangladesh's land border (COD-AB): ${landBorderLines.map((c) => `${lineKm(c).toFixed(1)} km`).join(' + ')}, ends at ${[mainland[0], mainland[mainland.length - 1]].map((p) => p.map((v) => v.toFixed(4)).join(', ')).join(' and ')}`);
const fmt = (d) => `median ${d.median.toFixed(2)} km, 95th ${d.p95.toFixed(2)} km, max ${d.max.toFixed(2)} km at ${d.at.map((v) => v.toFixed(3)).join(', ')} (${d.samples} samples at 200 m)`;
console.log('the seam, Bangladesh (COD-AB) against its neighbours:');
console.log(`  overlap: India (geoBoundaries) ${overlap.India.toFixed(2)} km², Rakhine (Natural Earth) ${overlap.Rakhine.toFixed(2)} km², other Myanmar states ${overlap['Myanmar, other states'].toFixed(2)} km²`);
console.log(`  gap (land neither claims, detail): ${Object.entries(seam.detail.border).map(([c, a]) => `${c} ${a.toFixed(2)} km²`).join(', ')} in ${seam.detail.borderPieces} pieces; largest ${seam.detail.biggest.km2.toFixed(2)} km² at ${seam.detail.biggest.at.map((v) => v.toFixed(3)).join(', ')}`);
console.log(`  offset from India's edge (geoBoundaries): ${fmt(stats(offset.IND))}`);
console.log(`  offset from Myanmar's edge (Natural Earth admin-1): ${fmt(stats(offset.MMR))}`);
console.log(`  for the record — Natural Earth's point-of-view line from COD-AB's: ${fmt(neVsCodAb)}`);
console.log(`river display labels: ${riverLabels.map((f) => `${f.properties.name_bn} at ${f.geometry.coordinates.map((v) => v.toFixed(4)).join(', ')}`).join('; ')}`);
console.log(`not labelled, no Bengali name (${unlabelled.length}): ${unlabelled.join('; ') || 'none'}`);
