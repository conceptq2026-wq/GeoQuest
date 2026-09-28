// Builds shared/tiles/bangladesh.pmtiles: the regional basemap for the
// Bangladesh section. What it covers and where the detail stops are in
// bangladesh.config.mjs; every input is pinned in sources.json.
//
//   land, coast       OpenStreetMap (committed snapshot, extract-bangladesh.mjs)
//   bangladesh        Bangladesh's own land (COD-AB), and the land between its
//                     border and a neighbour's edge that is Bangladesh's; drawn
//                     over the rest of the land, which is drawn plain — the
//                     Bangladesh maps show Bangladesh only (2026-09-28)
//   lakes             Natural Earth 1:10m
//   rivers            OpenStreetMap (committed snapshot), inside Bangladesh only
//   river_labels      the two display names of the main channel, placed as points
//   borders           Bangladesh's land border from OCHA COD-AB (the Bangladesh
//                     Bureau of Statistics' line), and no other
//   admin             division and district lines of Bangladesh (OCHA COD-AB)
//   admin_labels      Bangladesh's divisions and districts — Bengali from
//                     tools/sources/bangladesh-names.json
//                     Every feature of these, and of rivers, carries `bd`.
//                     Nothing of a neighbour's is shipped but its land and its
//                     country name (the user's decision, 2026-09-28).
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
import { CACHE, readSource, prepare, featureCollection, bboxPolygon, zipEntry } from './lib/geo.mjs';
import { bangladeshUnits, SegmentGrid, RAKHINE, POV, linesOf, ringsOf, bboxOf, lineKm, kmBetween, endKey } from './lib/bangladesh-units.mjs';
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
  // What the archive names: Bangladesh's divisions and districts, and no
  // neighbour's unit (2026-09-28).
  'labels shipped': { division: 8, district: 64 },
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

/*
|--------------------------------------------------------------------------
| UNITS, AND BANGLADESH'S LAND BORDER — the government's line
|--------------------------------------------------------------------------
|
| Bangladesh by COD-AB pcode. India by geoBoundaries shapeName, but only as
| the name the names table records for a district the Local Government
| Directory lists, and only inside COVERAGE: each must match exactly once.
| Rakhine by Natural Earth's adm1_code.
|
| Inside this archive Bangladesh's own border is the Bangladesh Bureau of
| Statistics' line, as OCHA COD-AB v03 publishes it, not Natural Earth's
| point-of-view line: measured along the whole border, the 1:10m line runs a
| median 1.44 km and up to 8.64 km off it, and crosses the Padma. Every other
| border in the box stays Natural Earth's. Every other unit yields to it.
|
| All of this is lib/bangladesh-units.mjs, which build-janapadas.mjs reads
| too, so the janapada areas end where these units do.
*/
const {
  inCoverage, indiaUnits, pov, bd, neBangladeshParts, mainland, landBorderLines, borderGrid, landDetailAll,
  myanmarAll, myanmarStates, units, unownedPieces, ownerOf,
} = await bangladeshUnits({ bd0, gbIndia, landIn, countries, admin1, neLines, names });
const focusIndia = (shapeName) => indiaUnits.get(shapeName)?.state;
expect('West Bengal districts', [...indiaUnits.values()].filter((u) => u.state === 'West Bengal').length);
expect('Tripura districts', [...indiaUnits.values()].filter((u) => u.state === 'Tripura').length);
const landBorder = fc(landBorderLines.map((c) => ({ type: 'Feature', properties: { class: BD_BORDER_CLASS, bd: true }, geometry: { type: 'LineString', coordinates: c } })));
expect('Bangladesh land border', { parts: landBorderLines.length, km: landBorderLines.map((c) => Math.round(lineKm(c))) });

/*
|--------------------------------------------------------------------------
| BANGLADESH'S LAND, and where the sources disagree
|--------------------------------------------------------------------------
|
| The land no unit owns goes to a unit as lib/bangladesh-units.mjs decides:
| a piece on Bangladesh's border to the nearest unit across it, any other to
| the nearest unit of the country whose point-of-view polygon holds it. Each
| is Bangladesh's or not with the unit it joins, so Bangladesh's land meets
| its border exactly.
*/
// Bangladesh maps show Bangladesh only (the user's decision, 2026-09-28): the
// `bangladesh` layer is Bangladesh's own land, which the style draws over the
// rest of the land drawn plain, and every other feature of Bangladesh's — its
// lines, its names, its border, its rivers — carries `bd`, which the style
// draws alone. Nothing of a neighbour's is drawn but its land, plain.
const shown = (unit) => unit.country === 'BGD';
const seam = {};
async function bangladeshLand(land, box, label) {
  const inside = await ms(`-i combine-files l.json u.json -target l -clip bbox=${box} -clip source=u`, { 'l.json': land, 'u.json': fc(units.filter((u) => shown(u.properties))) }, 'l');
  const pieces = await unownedPieces(land, box);
  const tally = { pieces: pieces.length, km2: 0, own: 0, byCountry: {}, border: {}, borderPieces: 0, biggest: null };
  const own = [];
  pieces.forEach(({ piece, point: pt }) => {
    const { unit, onBorder } = ownerOf({ piece, point: pt });
    const km2 = Math.abs(ringArea(piece.geometry));
    tally.km2 += km2;
    tally.byCountry[unit.country] = (tally.byCountry[unit.country] || 0) + km2;
    if (onBorder) {
      tally.borderPieces++;
      tally.border[unit.country] = (tally.border[unit.country] || 0) + km2;
      if (!tally.biggest || km2 > tally.biggest.km2) tally.biggest = { km2, at: pt };
    }
    if (shown(unit)) own.push(piece), (tally.own += 1);
  });
  seam[label] = tally;
  console.log(`  ${label}: ${tally.pieces} unowned pieces, ${tally.km2.toFixed(0)} km² — to ${Object.entries(tally.byCountry).map(([c, a]) => `${c} ${a.toFixed(0)}`).join(', ')} km²; ${tally.borderPieces} on Bangladesh's border; ${tally.own} Bangladesh's`);
  return fc([...inside.features, ...own].map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })));
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
| Administrative lines are Bangladesh's own, the edges its divisions and
| districts share; an edge on its outside is never drawn, because the border
| already is. They end on the border exactly — COD-AB draws both. The
| neighbours' district and state lines, and Natural Earth's lines between
| other countries, are not shipped: the Bangladesh maps show Bangladesh only
| (the user's decision, 2026-09-28).
*/
const bdLines = await ms(`-i in.json -lines adm1_pcode -filter "TYPE != 'outer'" -each "level = TYPE == 'adm1_pcode' ? 'division' : 'district', bd = true" -filter-fields level,bd`, { 'in.json': bd2 });
const admin = bdLines;

// No line may end near the border without ending on it. Near the border's two
// ends — where it reaches the sea — a line ending on the coast is ending right.
const termini = [mainland[0], mainland[mainland.length - 1]];
const dangling = [];
for (const [what, set] of [['Bangladesh', bdLines]]) {
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
console.log(`lines: Bangladesh ${bdLines.features.length}, each ending on its border or on another line`);

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
const rivers = fc([
  ...riversNamed.features.map((f) => {
    const n = riverNames[f.properties.river];
    return { ...f, properties: { ...(n.displayLabels || !n.nameBn ? {} : { name_en: n.nameEn, name_bn: n.nameBn }), bd: true } };
  }),
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
| No neighbour's unit is named (2026-09-28). A unit with no sourced Bengali
| name is not labelled — never in English — and is listed below.
*/
const unlabelled = [];
const labels = [];
const label = (pt, props, minZoom, maxZoom = 24) => {
  if (!props.name_bn) return unlabelled.push(`${props.level} ${props.name_en}`);
  labels.push({ type: 'Feature', properties: { ...props, min_zoom: minZoom, max_zoom: maxZoom, detail: inBox(pt, DETAIL_BOX) }, geometry: { type: 'Point', coordinates: pt } });
};
const innerPoints = async (fcIn) => (await ms('-i in.json -points inner', { 'in.json': fcIn })).features;
for (const [f, p] of (await innerPoints(bd1)).map((p, i) => [bd1.features[i], p])) {
  const n = names.bangladesh[f.properties.adm1_pcode];
  label(p.geometry.coordinates, { level: 'division', name_en: n.nameEn, name_bn: n.nameBn, bd: true }, 5, 7);
}
for (const [f, p] of (await innerPoints(bd2)).map((p, i) => [bd2.features[i], p])) {
  const n = names.bangladesh[f.properties.adm2_pcode];
  if (!n) throw new Error(`${f.properties.adm2_pcode}: no name in ${path.basename(NAMES)}`);
  label(p.geometry.coordinates, { level: 'district', name_en: n.nameEn, name_bn: n.nameBn, bd: true }, 7);
}
// Tripura's extent, for the frame it must hold.
const tripura = await ms(`-i in.json -filter "${JSON.stringify(Object.values(names.india).filter((u) => u.state === 'Tripura').map((u) => u.geoBoundaries)).replace(/"/g, "'")}.includes(shapeName)" -dissolve`, { 'in.json': inCoverage });
const adminLabels = fc(labels);
expect('labels shipped', Object.fromEntries(['division', 'district'].map((level) => [level, labels.filter((f) => f.properties.level === level && f.properties.bd).length])));
if (labels.some((f) => !f.properties.bd)) throw new Error("a label that is not Bangladesh's");

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
console.log("Bangladesh's land:");
const overviewLines = await simplifiedLines(250);
const layersOverview = {
  land: prepare(landOverview, () => ({})),
  bangladesh: prepare(await bangladeshLand(landOverview, COVERAGE, 'overview'), () => ({})),
  lakes: prepare(lakes, () => ({})),
  coast: coastOf(landOverview, COVERAGE),
  rivers: prepare(await ms('-i in.json -simplify dp interval=250', { 'in.json': rivers }), (p) => p),
  admin: prepare(overviewLines.admin, (p) => p),
  borders: prepare(overviewLines.border, (p) => p),
  admin_labels: adminLabels,
  river_labels: fc(riverLabels),
  country_labels: fc(countryLabels),
};
const clipDetail = async (fcIn) => ms(`-i in.json -clip bbox=${DETAIL_BOX}`, { 'in.json': fcIn });
const detailLines = await simplifiedLines(20, DETAIL_BOX);
const layersDetail = {
  detail_extent: fc(Object.entries(DETAIL_AREAS).map(([area, box]) => ({ ...bboxPolygon(box), properties: { area } }))),
  land: prepare(landDetail, () => ({})),
  bangladesh: prepare(await bangladeshLand(landDetail, DETAIL_BOX, 'detail'), () => ({})),
  lakes: prepare(await clipDetail(lakes), () => ({})),
  coast: coastOf(landDetail, DETAIL_BOX),
  rivers: prepare(await ms(`-i in.json -clip bbox=${DETAIL_BOX} -simplify dp interval=20`, { 'in.json': rivers }), (p) => p),
  admin: prepare(detailLines.admin, (p) => p),
  borders: prepare(detailLines.border, (p) => p),
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
