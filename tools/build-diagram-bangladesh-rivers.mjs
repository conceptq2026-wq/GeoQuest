// Builds the Rivers of Bangladesh diagram into its folder: the descriptor, the
// data, and the two frames — the picture's geometry as SVG path data.
//
//   node tools/build-diagram-bangladesh-rivers.mjs [out]      build (out: docs/diagrams/bangladesh-rivers)
//   node tools/build-diagram-bangladesh-rivers.mjs --print-pins   print the line hashes; writes nothing
//
// From the seed, data-sources/bangladesh-rivers/bangladesh-rivers.seed.json,
// which it reads and never writes, and from the pinned files it names:
//
//   tools/.cache/ne_10m_rivers_lake_centerlines.geojson       Natural Earth — the river's far course
//   tools/.cache/ne_10m_land.geojson                          Natural Earth — the land
//   tools/.cache/ne_10m_admin_0_boundary_lines_land.geojson   Natural Earth — the neighbours' borders
//   tools/.cache/bgd_admin_boundaries.geojson.zip             COD-AB — Bangladesh's outline and upazilas
//   tools/sources/osm-bangladesh-rivers.geojson               OpenStreetMap — the pinned rivers snapshot
//   tools/sources/osm-bangladesh-rivers-pilot.geojson         OpenStreetMap — the ways this picture adds
//
// Each river is one chain of features (a way list with its trims, or Natural
// Earth's lines end to end); the chain is refused if it branches, loops or has
// a gap wider than 3 m. Every assembled line has its hash in
// tools/bangladesh-rivers-pins.json: a build whose line moved stops and says
// so, and is never re-pinned to pass. One flat projection per frame — the
// frame file carries its parameters, and tools/verify.mjs projects the seed's
// coordinates with the same code. Every Bengali word shipped is the seed's;
// nothing that is provenance is shipped, but the credits. Output is
// deterministic: a second build writes the same bytes.
//
// No network, ever: the inputs are pinned files that the fetch tools filled.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, zipEntry, bangladeshLineClass } from './lib/geo.mjs';
import { projection, distM, nearestOnLine, lengthKm, fractionAlong, simplify, simplifyRing, clipRing, clipLine, chainWays, pathData } from './lib/rivers-frame.mjs';
import { loadRiversSeed } from './lib/rivers-seed.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed, the pins and where the diagram goes. Change here if one moves.
// The seed: a common file and one file per river system (tools/lib/rivers-seed.mjs merges them).
const SEED = path.join(ROOT, 'data-sources/bangladesh-rivers');
const SOURCES = path.join(HERE, 'sources.json');
const PINS = path.join(HERE, 'bangladesh-rivers-pins.json');
const COUNTRY_NAMES = path.join(HERE, 'country-names-bn.json');
const DEFAULT_OUT = path.join(ROOT, 'docs/diagrams/bangladesh-rivers');

const ID = 'bangladesh-rivers';
const SECTION = 'bangladesh';
// Drawing tolerances in each frame's own units (u; the frame is 1000 u wide):
// Douglas–Peucker for rivers, land, the outline and the neighbours' borders.
const TOL = { whole: { river: 1.0, land: 1.5, outline: 0.6, border: 0.8 }, bangladesh: { river: 0.8, land: 1.5, outline: 0.7, border: 0.8 } };
// Land is clipped this far (u) beyond the frame, so no cut edge shows.
const BLEED = 5;
// A land ring smaller than this (u²) is not drawn.
const MIN_LAND_AREA = 3;
// The most any line's ends may miss each other, and every check's ground tolerance (metres).
const CHAIN_TOL_M = 3;
// The seed's entry point may miss the computed border crossing by this much (metres): its eight decimals.
const SNAP_M = 0.05;
// A district name's anchor is scored by its distance to its river (km) plus 2 for every km it comes within BUSY_KM of a marker or a river's name.
const BUSY_KM = 30;
// A tributary's or distributary's drawn end further than CONNECT_FROM_M from its drawn parent, and no
// more than CONNECT_MAX_M, gets a straight connector to the parent's nearest point (the user's rule,
// 2026-09-29: 10 km, then 12 km for the Dhaleshwari, then "gaps over 12 km stay unjoined" for every line).
const CONNECT_FROM_M = 50;
const CONNECT_MAX_M = 12000;
const JOIN_M = 500;
// The Padma–Meghna junction: the Padma's end must lie this near a Meghna vertex (metres).
const JUNCTION_M = 3;
// The Teesta's mouth may lie this far from Sundarganj upazila, where BWDB puts it
// (metres): the OSM mouth is 679 m outside it, in Gaibandha Sadar.
const SUNDARGANJ_M = 1000;

const PRINT_PINS = process.argv.includes('--print-pins');
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? DEFAULT_OUT);
const fail = (msg) => {
  throw new Error(`${ID}: ${msg}`);
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const gitBlobSha1 = (buf) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
const hashLine = (coords) => sha256(Buffer.from(JSON.stringify(coords))).slice(0, 16);
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const json = (v) => JSON.stringify(v, null, 2) + '\n';
const say = (s) => console.log(s);

// ---- the seed and the pinned inputs ---------------------------------------------------------

const { seed } = loadRiversSeed(SEED);
const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
const ui = seed.ui;
const G = seed.geometry;

function pinnedBuffer(file, size, checks) {
  const buf = fs.readFileSync(file);
  const now = { size: buf.length, sha256: sha256(buf), gitBlobSha1: gitBlobSha1(buf) };
  for (const [k, want] of Object.entries({ size, ...checks })) if (want !== undefined && now[k] !== want) fail(`${path.basename(file)}: ${k} is ${now[k]}, pinned ${want}; refusing it`);
  return buf;
}
function neFile(name) {
  const e = sources.naturalEarth.files[name] ?? fail(`tools/sources.json pins no ${name}`);
  return JSON.parse(pinnedBuffer(path.join(CACHE, name), e.size, { gitBlobSha1: e.gitBlobSha1, sha256: e.sha256 }).toString('utf8'));
}
const neRivers = neFile(G.files.ne.rivers);
const neLand = neFile(G.files.ne.land);
const neBoundaries = neFile(G.files.ne.boundaries);
const codab = sources.codAbBangladesh;
if (G.files.codab.zip !== codab.file) fail(`the seed reads ${G.files.codab.zip}, tools/sources.json pins ${codab.file}`);
const zip = pinnedBuffer(path.join(CACHE, codab.file), codab.size, { sha256: codab.sha256 });
const admin0 = zipEntry(zip, G.files.codab.admin0);
const admin3 = zipEntry(zip, G.files.codab.admin3);
const admin2 = zipEntry(zip, G.files.codab.admin2);
const osmFile = (entry, rel) => {
  if (entry.file !== rel) fail(`the seed reads ${rel}, tools/sources.json pins ${entry.file}`);
  return JSON.parse(pinnedBuffer(path.join(ROOT, entry.file), undefined, { sha256: entry.sha256 }).toString('utf8'));
};
const osmSnapshot = osmFile(sources.osmBangladeshRivers, G.files.osmSnapshot);
const osmPilot = osmFile(sources.osmBangladeshRiversPilot, G.files.osmPilot);
// Each system's own extract (tools/extract-bangladesh-rivers-system.mjs), pinned as osmBangladeshRivers<System>.
const extractKey = (sys) => `osmBangladeshRivers${sys[0].toUpperCase()}${sys.slice(1)}`;
const systemExtracts = Object.entries(G.files.osmSystems ?? {}).map(([sys, rel]) => [sys, osmFile(sources[extractKey(sys)] ?? fail(`tools/sources.json pins no ${extractKey(sys)}`), rel)]);

// The seed's country names are Natural Earth's NAME_BN, as the map baseline has them.
const countryTable = JSON.parse(fs.readFileSync(COUNTRY_NAMES, 'utf8'));
const countries = Object.fromEntries(Object.entries(seed.countries).filter(([k]) => !k.startsWith('_')));
for (const [code, name] of Object.entries(countries)) if (countryTable[code] !== name) fail(`country ${code}: the seed has «${name}», tools/country-names-bn.json «${countryTable[code]}»`);

// ---- OpenStreetMap ways, and the chains ------------------------------------------------------

const ways = new Map();
for (const f of osmSnapshot.features) ways.set(f.properties.osm_id, { id: f.properties.osm_id, coords: f.geometry.coordinates });
const wayFrom = new Map([...ways.keys()].map((id) => [id, 'snapshot']));
// A way in two files must agree within 1 m; the later file, which carries node ids, wins.
const addExtract = (features, label) => {
  for (const f of features) {
    const id = f.properties.osm_id;
    const w = { id, coords: f.geometry.coordinates, nodes: f.properties.nodes };
    const other = ways.get(id);
    if (other) {
      if (other.coords.length !== w.coords.length) fail(`way ${id} has ${other.coords.length} points in the ${wayFrom.get(id)} and ${w.coords.length} in the ${label} extract`);
      const worst = Math.max(...w.coords.map((p, i) => distM(p, other.coords[i])));
      if (worst > 1) fail(`way ${id}: the ${wayFrom.get(id)} and the ${label} extract differ by ${round(worst, 2)} m (limit 1 m)`);
      wayFrom.set(id, wayFrom.get(id) === 'snapshot' && label === 'pilot' ? 'both' : `${wayFrom.get(id)}+${label}`);
    } else wayFrom.set(id, label);
    ways.set(id, w);
  }
};
addExtract(osmPilot.features, 'pilot');
for (const [sys, file] of systemExtracts) addExtract(file.features, sys);
const usedWays = new Set();
const trim = (w, t) => {
  if (!t) return w;
  if (!w.nodes) fail(`way ${w.id} is trimmed by node but has no node list`);
  const a = t.fromNode ? w.nodes.indexOf(t.fromNode) : 0;
  const b = t.toNode ? w.nodes.indexOf(t.toNode) : w.nodes.length - 1;
  if (a < 0 || b < 0 || a >= b) fail(`way ${w.id}: trim ${JSON.stringify(t)} does not fit its nodes`);
  return { ...w, coords: w.coords.slice(a, b + 1), nodes: w.nodes.slice(a, b + 1) };
};
function chain(name, spec, ids = spec.ways) {
  const ws = ids.map((id) => {
    const w = ways.get(id) ?? fail(`${name}: way ${id} is in neither OpenStreetMap file`);
    usedWays.add(id);
    return trim(w, spec.trims?.[String(id)]);
  });
  return chainWays(ws, { tolM: CHAIN_TOL_M, downstream: spec.down, label: name });
}

// Natural Earth's course, four lines end to end.
const nePick = (n) => {
  const hits = neRivers.features.filter((f) => f.properties.rivernum === n.rivernum && f.properties.name === n.name && (n.nameEn === undefined || f.properties.name_en === n.nameEn));
  if (hits.length !== 1) fail(`Natural Earth has ${hits.length} rivers for ${n.name} (rivernum ${n.rivernum}), not one`);
  if (hits[0].geometry.type !== 'MultiLineString') fail(`Natural Earth's ${n.name} is a ${hits[0].geometry.type}`);
  return hits[0].geometry.coordinates[n.line] ?? fail(`Natural Earth's ${n.name} has no line ${n.line}`);
};
const neParts = G.main.ne.map(nePick);
const neChain = neParts[0].slice();
for (let i = 1; i < neParts.length; i++) {
  const gap = distM(neChain.at(-1), neParts[i][0]);
  if (gap > 1) fail(`Natural Earth's ${G.main.ne[i].name} begins ${round(gap)} m from where ${G.main.ne[i - 1].name} ends`);
  neChain.push(...neParts[i].slice(1));
}

// The seam: the first vertex of the OSM chain within maxM of Natural Earth's line.
const osmMain = chain('main', G.main);
let seam = null;
for (let i = 0; i < osmMain.coords.length && !seam; i++) {
  const n = nearestOnLine(osmMain.coords[i], neChain);
  if (n.m <= G.main.seam.maxM) seam = { vertex: i, foot: n };
}
if (!seam) fail(`no vertex of the OSM chain lies within ${G.main.seam.maxM} m of Natural Earth's line`);
if (seam.vertex !== G.main.seam.expectVertex) fail(`the seam is at OSM vertex ${seam.vertex}, the seed pins ${G.main.seam.expectVertex}`);
const seamGapM = distM(seam.foot.pt, osmMain.coords[seam.vertex]);
const dedupe = (pts) => pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
const mainCoords = dedupe([...neChain.slice(0, seam.foot.seg + 1), seam.foot.pt, ...osmMain.coords.slice(seam.vertex)]);

const lines = { main: { id: 'main', role: 'main', coords: mainCoords } };
for (const [id, spec] of Object.entries(G.lines)) {
  const r = chain(id, spec);
  lines[id] = { id, role: spec.role, coords: r.coords, gaps: r.gaps, spec };
}
const padmaEnd = lines.padma.coords.at(-1);
const junction = Math.min(...lines.meghna.coords.map((p) => distM(p, padmaEnd)));
if (junction > JUNCTION_M) fail(`the Padma ends ${round(junction)} m from the nearest Meghna vertex (limit ${JUNCTION_M} m)`);
const mainToPadma = distM(mainCoords.at(-1), lines.padma.coords[0]);
if (mainToPadma > JOIN_M) fail(`the Jamuna's end is ${round(mainToPadma)} m from the Padma's start (limit ${JOIN_M} m)`);
// Another system's main river may be drawn as several lines, in the seed's order: each begins where the last ends.
const mainJoins = [];
for (const e of seed.entities.filter((x) => x.role === 'main' && x.id !== 'main')) {
  const ids = Object.keys(G.lines).filter((id) => G.lines[id].entity === e.id);
  if (ids.some((id) => lines[id].role !== 'main')) fail(`${e.id}: every line of a main river's card is a main line`);
  for (let i = 1; i < ids.length; i++) {
    const gap = distM(lines[ids[i - 1]].coords.at(-1), lines[ids[i]].coords[0]);
    if (gap > CHAIN_TOL_M) fail(`${e.id}: ${ids[i]} begins ${round(gap)} m from where ${ids[i - 1]} ends (limit ${CHAIN_TOL_M} m)`);
    mainJoins.push(`${ids[i - 1]}→${ids[i]} ${round(gap, 1)} m`);
  }
}

// The line hashes.
const drawnHashes = Object.fromEntries(Object.keys(lines).map((id) => [id, hashLine(lines[id].coords)]));
if (PRINT_PINS) {
  console.log(json(drawnHashes));
  process.exit(0);
}
const PINNED = fs.existsSync(PINS) ? JSON.parse(fs.readFileSync(PINS, 'utf8')) : {};
const moved = Object.entries(drawnHashes).filter(([id, h]) => PINNED[id] !== h).map(([id, h]) => `${id}: pinned ${PINNED[id] ?? '(none)'}, now ${h}`);
const stale = Object.keys(PINNED).filter((id) => !(id in drawnHashes)).map((id) => `${id}: pinned but not drawn`);
if (moved.length || stale.length) fail(`geometry pins do not hold — stop and report, never re-pin to pass:\n  ${[...moved, ...stale].join('\n  ')}`);

// ---- Bangladesh: the outline, the upazilas ---------------------------------------------------

if (admin0.features.length !== 1 || admin0.features[0].geometry.type !== 'MultiPolygon' || admin0.features[0].geometry.coordinates.length !== 13) fail('COD-AB admin0 is not one MultiPolygon of 13 polygons');
const outline = admin0.features[0].geometry;

const ringBox = (ring) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) (x < x0 && (x0 = x), x > x1 && (x1 = x), y < y0 && (y0 = y), y > y1 && (y1 = y));
  return [x0, y0, x1, y1];
};
const polygonsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const indexed = (g) => polygonsOf(g).map((rings) => ({ rings, boxes: rings.map(ringBox) }));
const inRing = (p, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inside = (p, idx) => idx.some(({ rings, boxes }) => boxes[0][0] <= p[0] && p[0] <= boxes[0][2] && boxes[0][1] <= p[1] && p[1] <= boxes[0][3] && rings.reduce((n, r) => n + (inRing(p, r) ? 1 : 0), 0) % 2 === 1);
const outlineIdx = indexed(outline);
const outlineRings = outline.coordinates.flat();
const distToRings = (p, rings) => Math.min(...rings.map((r) => nearestOnLine(p, r).m));
const upazila = (name, district) => {
  const hits = admin3.features.filter((f) => f.properties.adm3_name === name && f.properties.adm2_name === district);
  if (hits.length !== 1) fail(`COD-AB has ${hits.length} upazilas «${name}» in ${district}`);
  return hits[0].geometry;
};

// ---- the main line split at Bangladesh's border ------------------------------------------------

// Where segment a→b crosses the ring's edges, as fractions along it.
function crossings(a, b, rings) {
  const out = [];
  const [sx0, sx1, sy0, sy1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const { rings: rs, boxes } of rings)
    for (let k = 0; k < rs.length; k++) {
      const [x0, y0, x1, y1] = boxes[k];
      if (x1 < sx0 || x0 > sx1 || y1 < sy0 || y0 > sy1) continue;
      const r = rs[k];
      for (let i = 1; i < r.length; i++) {
        const p = r[i - 1], q = r[i];
        if (Math.max(p[0], q[0]) < sx0 || Math.min(p[0], q[0]) > sx1 || Math.max(p[1], q[1]) < sy0 || Math.min(p[1], q[1]) > sy1) continue;
        const ex = q[0] - p[0], ey = q[1] - p[1];
        const den = dx * ey - dy * ex;
        if (den === 0) continue;
        const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den;
        const u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t);
      }
    }
  return out.sort((s, t) => s - t).filter((t, i, all) => i === 0 || t - all[i - 1] > 1e-12);
}
function splitAtBorder(line) {
  const pieces = [];
  let cur = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const ts = crossings(a, b, outlineIdx);
    const pts = [a, ...ts.map((t) => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]), b];
    for (let k = 0; k < pts.length - 1; k++) {
      const mid = [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2];
      const inn = inside(mid, outlineIdx);
      if (!cur || cur.inside !== inn) {
        cur = { inside: inn, coords: [pts[k]] };
        pieces.push(cur);
      }
      cur.coords.push(pts[k + 1]);
    }
  }
  return pieces;
}
const mainPieces = splitAtBorder(mainCoords);
// Every line drawn dashed outside Bangladesh: the Jamuna's main line, and any line whose seed says `split: "border"`.
const borderPieces = new Map([['main', mainPieces], ...Object.entries(lines).filter(([id, l]) => id !== 'main' && l.spec?.split === 'border').map(([id, l]) => [id, splitAtBorder(l.coords)])]);

// ---- the checks that need no frame ---------------------------------------------------------------

const upazilaChecks = [];
const markerSeed = Object.fromEntries(seed.markers.map((m) => [m.id, m]));
function inUpazila(markerId, name, district) {
  const m = markerSeed[markerId];
  if (!inside(m.lonLat, indexed(upazila(name, district)))) fail(`${markerId}'s point is not in COD-AB's ${name} upazila (${district}), as the seed says`);
  upazilaChecks.push(`${markerId} in ${name}`);
}
inUpazila('padmaConfluence', 'Goalanda', 'Rajbari');
inUpazila('dharlaConfluence', 'Ulipur', 'Kurigram');
inUpazila('oldBrahmaputraMouth', 'Raipura', 'Narsingdi');
inUpazila('padmaJamunaConfluence', 'Goalanda', 'Rajbari');
inUpazila('padmaMouth', 'Chandpur Sadar', 'Chandpur');
inUpazila('mahanandaConfluence', 'Chapainawabganj Sadar', 'Chapainababganj');
const sundarganj = distToRings(markerSeed.teestaConfluence.lonLat, polygonsOf(upazila('Sundarganj', 'Gaibandha')).flat());
if (sundarganj > SUNDARGANJ_M) fail(`the Teesta's mouth is ${round(sundarganj)} m from Sundarganj upazila (limit ${SUNDARGANJ_M} m)`);
// Its card and marker name only the district COD-AB agrees with (the user's policy, as for the entry).
if (!admin3.features.some((f) => f.properties.adm2_name === 'Gaibandha' && inside(markerSeed.teestaConfluence.lonLat, indexed(f.geometry)))) fail("the Teesta's mouth is not in COD-AB's Gaibandha district, as its card says");
upazilaChecks.push('teestaConfluence in Gaibandha district');
// The entry marker stands where the drawn main line first crosses COD-AB's border
// going downstream (the user's decision, 2026-09-29); BWDB's point is kept as snappedFrom.
const entrySeed = markerSeed.entry;
const firstIn = mainPieces.findIndex((p) => p.inside);
if (firstIn < 1) fail('the main line does not run from outside Bangladesh into it');
const crossing = mainPieces[firstIn].coords[0];
const entrySnapM = distM(entrySeed.lonLat, crossing);
if (entrySnapM > SNAP_M) fail(`the entry marker is ${round(entrySnapM, 3)} m from where the main line crosses COD-AB's border (${crossing.map((v) => v.toFixed(8)).join(', ')}); the seed must hold that point`);
{
  const c = entrySeed.coordSource;
  const w = ways.get(c.way);
  const [a, b] = c.vertices ?? [];
  if (!G.main.ways.includes(c.way) || b !== a + 1 || !w?.coords[b] || nearestOnLine(crossing, [w.coords[a], w.coords[b]]).m > SNAP_M) fail(`the entry crossing is not on way ${c.way}'s segment ${a}–${b}, one of the main line's ways`);
  const next = mainPieces[firstIn].coords[1];
  const justIn = [crossing[0] + (next[0] - crossing[0]) * 1e-3, crossing[1] + (next[1] - crossing[1]) * 1e-3];
  if (!inside(justIn, indexed(upazila(c.upazila.adm3, c.upazila.adm2)))) fail(`the drawn crossing is not in COD-AB's ${c.upazila.adm3} upazila (${c.upazila.adm2}), as the seed says`);
  upazilaChecks.push(`entry crossing in ${c.upazila.adm3}`);
  const from = entrySeed.snappedFrom;
  if (!inside(from.lonLat, indexed(upazila('Nageshwari', 'Kurigram')))) fail("BWDB's entry point is not in COD-AB's Nageshwari upazila (Kurigram), as the seed says");
  upazilaChecks.push('BWDB entry point in Nageshwari');
  if (Math.round(distM(from.lonLat, crossing)) !== from.offsetM) fail(`BWDB's entry point is ${round(distM(from.lonLat, crossing))} m from the crossing; the seed records ${from.offsetM} m`);
}
const entryToBorder = distToRings(entrySeed.lonLat, outlineRings);
const bwdbToBorder = distToRings(entrySeed.snappedFrom.lonLat, outlineRings);
if (entryToBorder > JOIN_M || bwdbToBorder > JOIN_M) fail(`the border-entry marker is ${round(entryToBorder)} m, and BWDB's point ${round(bwdbToBorder)} m, from Bangladesh's border (limit ${JOIN_M} m)`);

// The Brahmaputra is the name above Dewanganj, the Jamuna the name below it.
const dewanganjIdx = indexed(upazila('Dewanganj', 'Jamalpur'));
const dewFractions = mainCoords.map((p, i) => [p, i]).filter(([p]) => inside(p, dewanganjIdx)).map(([, i]) => fractionAlong(mainCoords, i, 0));
if (!dewFractions.length) fail('no vertex of the main line lies in COD-AB’s Dewanganj upazila');
const dewanganj = dewFractions.reduce((s, v) => s + v, 0) / dewFractions.length;

// ---- the frames --------------------------------------------------------------------------------

const roleRank = { continuation: 0, distributary: 1, tributary: 2, main: 3 };
const coordsOf = (id) => lines[id].coords;
const cap = (coords, north) => clipLine(coords, [-180, -90, 180, north]);

function frameBounds(spec) {
  if (!spec.fit) return { lonMin: spec.lonMin, lonMax: spec.lonMax, latMin: spec.latMin, latMax: spec.latMax };
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (const id of spec.fit.lines)
    for (const piece of cap(coordsOf(id), spec.fit.northCap)) for (const [lo, la] of piece) (lonMin = Math.min(lonMin, lo), lonMax = Math.max(lonMax, lo), latMin = Math.min(latMin, la), latMax = Math.max(latMax, la));
  // With `outline`, the whole of Bangladesh as COD-AB draws it, besides the lines.
  if (spec.fit.outline) for (const [lo, la] of outlineRings.flat()) (lonMin = Math.min(lonMin, lo), lonMax = Math.max(lonMax, lo), latMin = Math.min(latMin, la), latMax = Math.max(latMax, la));
  const m = spec.fit.margin;
  return { lonMin: Math.floor((lonMin - m) * 100) / 100, lonMax: Math.ceil((lonMax + m) * 100) / 100, latMin: Math.floor((latMin - m) * 100) / 100, latMax: Math.ceil((latMax + m) * 100) / 100 };
}

function buildFrame(frameId, spec) {
  const tol = TOL[frameId];
  const bounds = frameBounds(spec);
  const cosLat = Math.cos((spec.cosLatDeg * Math.PI) / 180);
  const width = spec.width;
  const scale = width / ((bounds.lonMax - bounds.lonMin) * cosLat);
  const height = round((bounds.latMax - bounds.latMin) * scale, 1);
  const P = projection({ lonMin: bounds.lonMin, latMax: bounds.latMax, cosLat, scale });
  const proj = (pts) => pts.map((p) => P.project(p[0], p[1]));
  const RECT = [0, 0, width, height];
  const BLEED_RECT = [-BLEED, -BLEED, width + BLEED, height + BLEED];
  const inRect = ([x, y]) => x >= -0.05 && x <= width + 0.05 && y >= -0.05 && y <= height + 0.05;
  const around = 1;
  const near = (box) => box[2] >= bounds.lonMin - around && box[0] <= bounds.lonMax + around && box[3] >= bounds.latMin - around && box[1] <= bounds.latMax + around;

  // The land, then Bangladesh over it, then the neighbours' borders.
  const fillRing = (ring, t, minArea = 0) => {
    const clipped = clipRing(proj(ring), BLEED_RECT);
    if (clipped.length < 3) return null;
    const simple = simplifyRing(clipped, t);
    if (simple.length < 3) return null;
    if (minArea) {
      let a = 0;
      for (let i = 0, j = simple.length - 1; i < simple.length; j = i++) a += (simple[j][0] + simple[i][0]) * (simple[j][1] - simple[i][1]);
      if (Math.abs(a / 2) < minArea) return null;
    }
    return pathData(simple, true);
  };
  const land = [];
  for (const f of neLand.features) for (const polygon of polygonsOf(f.geometry)) for (const ring of polygon) if (near(ringBox(ring))) land.push(fillRing(ring, tol.land, MIN_LAND_AREA));
  const bdFill = outline.coordinates.flatMap((polygon) => polygon.map((ring) => fillRing(ring, tol.outline)));
  const bdBorder = outline.coordinates.flatMap((polygon) =>
    polygon.flatMap((ring) => clipLine(proj([...ring, ring[0]]), RECT).map((pc) => pathData(simplify(pc, tol.outline)))),
  );
  const borders = [];
  for (const f of neBoundaries.features) {
    const p = f.properties;
    if (!bangladeshLineClass(p) || p.ADM0_A3_L === 'BGD' || p.ADM0_A3_R === 'BGD') continue;
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const part of parts) if (near(ringBox(part))) for (const pc of clipLine(proj(part), RECT)) borders.push(pathData(simplify(pc, tol.border)));
  }

  // The rivers.
  const drawn = (coords) => clipLine(proj(coords), RECT).map((pc) => pathData(simplify(pc, tol.river))).filter((d) => d.includes('l'));
  const frameLines = spec.lines
    .map((id) => {
      const l = lines[id];
      const pieces = borderPieces.has(id) ? borderPieces.get(id).flatMap((pc) => drawn(pc.coords).map((d) => (pc.inside ? { d } : { d, dash: true }))) : drawn(l.coords).map((d) => ({ d }));
      if (!pieces.length) fail(`${frameId}: ${id} is not in the frame`);
      const trace = id === 'main' ? { ne: G.main.ne.map((n) => ({ name: n.name, rivernum: n.rivernum })), ways: G.main.ways } : { ways: l.spec.ways };
      const spec = id === 'main' ? G.main : l.spec;
      const card = spec.entity ?? (id === 'main' ? 'main' : null);
      return { id, role: l.role, system: spec.system, ...(card ? { entity: card } : {}), pieces, ...trace };
    })
    .sort((a, b) => roleRank[a.role] - roleRank[b.role]);

  // The connectors: from a branch's parent-side end (a tributary's mouth, a distributary's head) to the
  // nearest point of its parent as drawn. Kept apart from the sourced lines, never merged into them.
  const drawnPolys = (id) => (borderPieces.has(id) ? borderPieces.get(id).map((pc) => pc.coords) : [lines[id].coords]).flatMap((c) => clipLine(proj(c), RECT).map((pc) => simplify(pc, tol.river)));
  const footOn = (p, polys) => {
    let best = null;
    for (const poly of polys)
      for (let i = 1; i < poly.length; i++) {
        const [a, b] = [poly[i - 1], poly[i]];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len2 = dx * dx + dy * dy;
        const s = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
        const q = [a[0] + s * dx, a[1] + s * dy];
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (!best || d < best.d) best = { q, d };
      }
    return best.q;
  };
  const connectors = [];
  for (const id of spec.lines) {
    const l = lines[id];
    if (l.role !== 'tributary' && l.role !== 'distributary') continue;
    const parent = l.spec.join?.parent ?? 'main';
    if (!spec.lines.includes(parent)) continue;
    const end = P.project(...(l.role === 'tributary' ? l.coords.at(-1) : l.coords[0]));
    // A line the seed leaves unjoined may end outside the picture; any other must end in it.
    if (!inRect(end)) {
      if (l.spec.exempt) continue;
      fail(`${frameId}: ${id}'s parent-side end is outside the frame`);
    }
    const q = (xy) => xy.map((v) => Math.round(v * 10) / 10);
    const [a, b] = [q(end), q(footOn(end, drawnPolys(parent)))];
    const m = distM(P.invert(...a), P.invert(...b));
    if (m > CONNECT_FROM_M && m <= CONNECT_MAX_M) connectors.push({ id, parent, m: Math.round(m), d: pathData([a, b]) });
  }

  // The districts: a grey name for each one the tappable lines run through for at least minKm in
  // Bangladesh, at an anchor inside it near the river; those holding one of the frame's markers
  // from the opening view, the rest from zoomAll×. The boundaries come from the shared file.
  let districtsOut;
  if (spec.districts) {
    const ds = spec.districts;
    const polys = admin2.features.map((f) => ({ pcode: f.properties.adm2_pcode, en: f.properties.adm2_name, idx: indexed(f.geometry), rings: polygonsOf(f.geometry).flat(), box: ringBox(polygonsOf(f.geometry).flat().flat()), center: [f.properties.center_lon, f.properties.center_lat] }));
    const within = (p, d) => p[0] >= d.box[0] && p[0] <= d.box[2] && p[1] >= d.box[1] && p[1] <= d.box[3] && inside(p, d.idx);
    const districtOf = (p) => polys.find((d) => within(p, d)) ?? null;
    const systemOf = (id) => (id === 'main' ? G.main.system : lines[id].spec.system);
    const tappableBy = spec.lines
      .filter((id) => lines[id].role !== 'continuation')
      .flatMap((id) => (borderPieces.has(id) ? borderPieces.get(id).filter((pc) => pc.inside).map((pc) => pc.coords) : [lines[id].coords]).map((coords) => ({ coords, system: systemOf(id) })));
    const tappable = tappableBy.map((t) => t.coords);
    const km = new Map();
    const kmBy = new Map(); // "system|pcode" → km
    const runs = new Map(); // pcode → the longest stretch of points inside it
    for (const { coords, system } of tappableBy) {
      let cur = null;
      for (let i = 1; i < coords.length; i++) {
        const mid = [(coords[i - 1][0] + coords[i][0]) / 2, (coords[i - 1][1] + coords[i][1]) / 2];
        const d = districtOf(mid);
        if (d) {
          km.set(d.pcode, (km.get(d.pcode) ?? 0) + distM(coords[i - 1], coords[i]) / 1000);
          kmBy.set(`${system}|${d.pcode}`, (kmBy.get(`${system}|${d.pcode}`) ?? 0) + distM(coords[i - 1], coords[i]) / 1000);
        }
        if (!d || cur?.pcode !== d.pcode) {
          cur = d ? { pcode: d.pcode, pts: [coords[i - 1]] } : null;
          if (cur) {
            const all = runs.get(d.pcode) ?? [];
            all.push(cur);
            runs.set(d.pcode, all);
          }
        }
        if (cur) cur.pts.push(coords[i]);
      }
    }
    const always = new Set();
    const alwaysBy = new Set(); // "system|pcode"
    for (const id of spec.markers) {
      const p = markerSeed[id].lonLat;
      const d = districtOf(p) ?? polys.map((q) => [q, distToRings(p, q.rings)]).sort((a, b) => a[1] - b[1]).find(([, m]) => m <= JOIN_M)?.[0];
      if (!d) fail(`${frameId}: marker ${id} is in no COD-AB district`);
      always.add(d.pcode);
      alwaysBy.add(`${markerSeed[id].system}|${d.pcode}`);
    }
    const chosen = [...km].filter(([, k]) => k >= ds.minKm).map(([pcode]) => pcode);
    for (const key of alwaysBy) if ((kmBy.get(key) ?? 0) < ds.minKm) fail(`${frameId}: ${key} holds a marker but its system's lines run through it for under ${ds.minKm} km`);
    for (const pcode of always) if (!chosen.includes(pcode)) fail(`${frameId}: district ${pcode} holds a marker but the lines run through it for under ${ds.minKm} km`);
    const lineSegs = tappable;
    // Where the picture is already busy: the markers and the rivers' own names. A district's name keeps its distance.
    const busy = [...spec.markers.map((id) => markerSeed[id].lonLat), ...spec.labels.map((lab) => nearestOnLine(lab.near, lines[lab.line].coords).pt)];
    const crowd = (p) => busy.reduce((s, b) => s + Math.max(0, BUSY_KM - distM(p, b) / 1000) * 2, 0);
    const toLines = (p) => Math.min(...lineSegs.map((c) => nearestOnLine(p, c).m));
    const labelsOut = chosen
      .map((pcode) => {
        const d = polys.find((q) => q.pcode === pcode);
        const run = runs.get(pcode).sort((a, b) => b.pts.length - a.pts.length)[0];
        const river = run.pts[Math.floor(run.pts.length / 2)];
        const simple = d.rings.map((r) => simplify(r, 0.002));
        const simpleIdx = [{ rings: simple, boxes: simple.map(ringBox) }];
        const step = 0.01;
        const grid = [];
        for (let x = Math.ceil(d.box[0] / step) * step; x <= d.box[2]; x += step) for (let y = Math.ceil(d.box[1] / step) * step; y <= d.box[3]; y += step) grid.push([Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
        const insideGrid = grid.filter((p) => inside(p, simpleIdx) && inside(p, d.idx)).map((p) => ({ p, edge: distToRings(p, simple), toRiver: distM(p, river) / 1000 + crowd(p) }));
        let best = null;
        for (const [edgeM, clearM] of [[3000, 1500], [2000, 1000], [1200, 600], [600, 0], [0, 0]]) {
          const ok = insideGrid.filter((c) => c.edge >= edgeM).sort((a, b) => a.toRiver - b.toRiver);
          best = ok.find((c) => clearM === 0 || toLines(c.p) >= clearM) ?? null;
          if (best) break;
        }
        const anchor = best ? best.p : within(d.center, d) ? d.center : river;
        if (!inside(anchor, d.idx)) fail(`${frameId}: no anchor inside ${pcode}`);
        const [x, y] = P.project(anchor[0], anchor[1]).map((v) => round(v, 1));
        if (!inRect([x, y])) fail(`${frameId}: the ${pcode} label's anchor is outside the frame`);
        // Per system: named from the opening view where the district holds one of its markers, from zoomAll× where its lines run through it.
        const systems = Object.fromEntries(seed.systems.map((s) => s.id).filter((s) => (kmBy.get(`${s}|${pcode}`) ?? 0) >= ds.minKm).map((s) => [s, alwaysBy.has(`${s}|${pcode}`) ? 'always' : 'zoom']));
        return { pcode, x, y, always: always.has(pcode), systems, km: km.get(pcode), en: d.en, lonLat: anchor };
      })
      .sort((a, b) => Number(b.always) - Number(a.always) || b.km - a.km || a.pcode.localeCompare(b.pcode));
    districtsOut = { file: ds.file, zoomAll: ds.zoomAll, labels: labelsOut.map(({ pcode, x, y, systems }) => ({ pcode, x, y, systems })) };
    districtReport[frameId] = labelsOut;
  }

  // The markers, at their recorded coordinates.
  const markers = spec.markers.map((id) => {
    const m = markerSeed[id] ?? fail(`${frameId}: the seed has no marker ${id}`);
    const [x, y] = P.project(m.lonLat[0], m.lonLat[1]).map((v) => round(v, 1));
    if (!inRect([x, y])) fail(`${frameId}: marker ${id} is outside the frame`);
    const src = { source: m.coordSource.source };
    for (const k of ['ne', 'way', 'node', 'vertex', 'vertices']) if (m.coordSource[k] !== undefined) src[k] = m.coordSource[k];
    return { id, kind: m.kind, system: m.system, x, y, lonLat: m.lonLat, src };
  });

  // The labels, at the nearest point of their lines to the seed's hint.
  const fractions = {};
  const labels = spec.labels.map((lab) => {
    const l = lines[lab.line] ?? fail(`${frameId}: label ${lab.id} names no line ${lab.line}`);
    const n = nearestOnLine(lab.near, l.coords);
    const [x, y] = P.project(n.pt[0], n.pt[1]).map((v) => round(v, 1));
    if (!inRect([x, y])) fail(`${frameId}: the ${lab.id} label's anchor is outside the frame`);
    fractions[lab.id] = fractionAlong(l.coords, n.seg, n.t);
    return { id: lab.id, line: lab.line, x, y };
  });
  const countryAnchors = spec.countryLabels.map((c) => {
    if (!(c.id in countries)) fail(`${frameId}: country ${c.id} is not in the seed's table`);
    const [x, y] = P.project(c.at[0], c.at[1]).map((v) => round(v, 1));
    if (!inRect([x, y])) fail(`${frameId}: the ${c.id} label is outside the frame`);
    return { id: c.id, x, y };
  });
  if ('brahmaputra' in fractions && 'jamuna' in fractions && !(fractions.brahmaputra < dewanganj && dewanganj < fractions.jamuna)) fail(`${frameId}: the Brahmaputra label (${round(fractions.brahmaputra, 3)}) and the Jamuna label (${round(fractions.jamuna, 3)}) do not fall either side of Dewanganj (${round(dewanganj, 3)})`);
  if ('yarlung' in fractions && !(fractions.yarlung < fractions.brahmaputra)) fail(`${frameId}: the Yarlung label is not upstream of the Brahmaputra label`);

  // The opening view, in frame units: fitted to the stage width on open.lonMin–lonMax, centred on open.lat.
  let view;
  if (spec.view) {
    const o = spec.view.open;
    const [x0, cy] = P.project(o.lonMin, o.lat);
    const [x1] = P.project(o.lonMax, o.lat);
    if (!(x0 >= 0 && x1 <= width && cy >= 0 && cy <= height && x1 > x0)) fail(`${frameId}: the opening view is not inside the frame`);
    view = { x0: round(x0, 1), x1: round(x1, 1), cy: round(cy, 1), zoomMax: spec.view.zoomMax, keep: spec.view.keep };
  }
  const file = {
    _about: `Built by tools/build-diagram-${ID}.mjs from the seed in ${path.relative(ROOT, SEED).replace(/\\/g, '/')}/; do not edit. Units u: x = (lon − lonMin)·cosLat·scale, y = (latMax − lat)·scale.`,
    id: frameId,
    projection: { lonMin: bounds.lonMin, latMax: bounds.latMax, cosLat, scale, width, height },
    bounds,
    ...(view ? { view } : {}),
    land: land.filter(Boolean).join(''),
    bangladesh: { fill: bdFill.filter(Boolean).join(''), border: bdBorder.join('') },
    borders: borders.join(''),
    lines: frameLines,
    connectors,
    ...(districtsOut ? { districts: districtsOut } : {}),
    markers,
    labels,
    countries: countryAnchors,
  };
  return { file, bounds, width, height, cosLat, scale };
}
const districtReport = {};
const frames = { whole: buildFrame('whole', G.frames.whole), bangladesh: buildFrame('bangladesh', G.frames.bangladesh) };

// ---- the words: every Bengali string is the seed's -----------------------------------------------

const entitiesSeed = Object.fromEntries(seed.entities.map((e) => [e.id, e]));
const cited = new Set(['naturalEarth', 'codab', 'osm']);
const pending = [];
const walkSources = (node, trail) => {
  if (node === null) pending.push(trail);
  else if (Array.isArray(node)) node.forEach((v, i) => walkSources(v, `${trail}[${i}]`));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) (k === 'source' && typeof v === 'string' && cited.add(v), walkSources(v, trail ? `${trail}.${k}` : k));
};
for (const e of seed.entities) walkSources(e, e.id);
for (const m of seed.markers) walkSources(m, `marker ${m.id}`);
for (const c of seed.continuations) walkSources(c, c.id);
for (const [i, l] of seed.infoBn.lines.entries()) {
  if (!l.sources?.length) fail(`ⓘ line ${i + 1} carries no source`);
  walkSources(l, `ⓘ line ${i + 1}`);
}
for (const s of cited) if (!(s in seed.sources)) fail(`the seed cites a source «${s}» that it does not list`);

const rowValues = (values, who) => {
  for (const k of Object.keys(values)) if (!ui.rowOrder.includes(k)) fail(`${who} has a row ${k} that ui.rowOrder does not place`);
  return Object.fromEntries(ui.rowOrder.filter((k) => values[k] !== undefined && values[k] !== null).map((k) => [k, values[k]]));
};
const entities = {};
for (const e of seed.entities) {
  for (const [k, v] of Object.entries(e.values)) if (v !== null && !e.sources?.[k]?.length) fail(`${e.id}: the ${k} value carries no source`);
  if (!e.sources?.nameBn?.length) fail(`${e.id}: the name carries no source`);
  if (!(e.id in lines)) fail(`entity ${e.id} has no line`);
  entities[e.id] = { role: e.role, system: e.system, name: e.nameBn, values: rowValues(e.values, e.id) };
}
const markers = {};
for (const m of seed.markers) {
  if (!m.sources?.valueBn?.length || !m.sources?.nameBn?.length) fail(`marker ${m.id} carries no source for its name or its value`);
  if (m.infoBn !== undefined && !m.sources?.infoBn?.length) fail(`marker ${m.id}: its ⓘ note carries no source`);
  if (!(m.entity in entitiesSeed) || !ui.rowOrder.includes(m.row) || !(m.kind in ui.legendBn)) fail(`marker ${m.id}: entity, row or kind is unknown`);
  markers[m.id] = { kind: m.kind, entity: m.entity, name: m.nameBn, row: m.row, value: m.valueBn };
}
// The picker: every card, grouped by its system, in the systems' order and each system's own; a system with no card has no group.
// A system's main river's card, where it has one; a system with no card yet ships no main (never a null).
const systems = seed.systems.map((s) => {
  const main = seed.entities.find((e) => e.system === s.id && e.role === 'main')?.id;
  return { id: s.id, name: s.nameBn, ...(main ? { main } : {}) };
});
const picker = seed.systems.flatMap((s) => seed.entities.filter((e) => e.system === s.id).map((e) => ({ key: e.id, label: e.nameBn, group: s.id })));
const pickerGroups = systems.filter((s) => picker.some((p) => p.group === s.id)).map((s) => ({ value: s.id, label: s.name }));
for (const s of systems) if (seed.entities.some((e) => e.system === s.id) && !s.main) fail(`system ${s.id} has cards but no main river`);

// Every label is a name a card gives.
const alias = seed.entities.filter((e) => e.role === 'main').flatMap((e) => String(e.values.alias ?? '').split('; ').map((s) => s.replace(/ \(.*\)$/, '')));
const known = new Set([...seed.entities.map((e) => e.nameBn), ...seed.markers.map((m) => m.nameBn), ...seed.continuations.map((c) => c.nameBn), ...alias]);
const labelTexts = Object.fromEntries(Object.entries(seed.labelsBn).filter(([k]) => !k.startsWith('_')));
for (const [id, text] of Object.entries(labelTexts)) if (!known.has(text)) fail(`label ${id} «${text}» is not a name any card gives`);
for (const f of Object.values(frames)) for (const l of f.file.labels) if (!(l.id in labelTexts)) fail(`label ${l.id} has no text in the seed`);
for (const c of seed.continuations) if (!lines[c.id] || lines[c.id].role !== 'continuation') fail(`continuation ${c.id} has no continuation line`);

const credit = (s, extra = '') => ({ title: s.title + (s.creditExtra ?? '') + extra, by: s.publisher, url: s.url, ...(/[ঀ-৿]/.test(s.title) ? { lang: 'bn' } : {}) });
const data = {
  _about: `Built by tools/build-diagram-${ID}.mjs from the seed in ${path.relative(ROOT, SEED).replace(/\\/g, '/')}/; do not edit.`,
  systems,
  picker,
  pickerGroups,
  entities,
  markers,
  labels: labelTexts,
  countries,
  credits: Object.entries(seed.sources)
    .filter(([key]) => key !== 'user' && cited.has(key))
    .map(([key, s]) => credit(s, s.page ? `, ${ui.pageBn} ${s.page}` : ''))
    // A note the seed gives a marker reads as plain text, with no link.
    .concat(seed.markers.filter((m) => m.infoBn).map((m) => ({ title: m.infoBn, lang: 'bn', group: 'notes' })))
    .concat(seed.infoBn.lines.map((l) => ({ title: l.textBn, lang: 'bn', group: l.group }))),
  // ⓘ's three headed blocks: the sources (the credits with no group, and the font), the notes, the conflicts.
  creditGroups: ui.creditGroupsBn,
};

const descriptor = {
  id: ID,
  section: SECTION,
  language: 'bn',
  title: { en: seed.titleEn, bn: seed.titleBn },
  data: 'data.json',
  views: [
    { id: 'whole', type: 'rivers', tab: ui.tabsBn.whole, art: 'frame-whole.json' },
    { id: 'bangladesh', type: 'rivers', tab: ui.tabsBn.bangladesh, art: 'frame-bangladesh.json' },
  ],
  words: {
    picker: ui.pickerPlaceholderBn,
    close: ui.closeBn,
    reset: ui.resetBn,
    rows: ui.rowOrder.map((key) => ({ key, label: ui.rowLabelsBn[key] })),
    legend: ui.legendBn,
  },
};

// ---- write and report -------------------------------------------------------------------------------

const files = { 'descriptor.json': descriptor, 'data.json': data, 'frame-whole.json': frames.whole.file, 'frame-bangladesh.json': frames.bangladesh.file };
fs.mkdirSync(OUT, { recursive: true });
const sizes = {};
for (const [name, value] of Object.entries(files)) {
  const text = json(value);
  fs.writeFileSync(path.join(OUT, name), text);
  sizes[name] = Buffer.byteLength(text);
}

const points = (coords) => coords.length;
const byFile = {};
for (const id of usedWays) byFile[wayFrom.get(id)] = (byFile[wayFrom.get(id)] ?? 0) + 1;
say(`${ID}: ${Object.keys(lines).length} lines, ${usedWays.size} OSM ways (${Object.entries(byFile).map(([k, n]) => `${n} ${k === 'both' ? 'in snapshot and pilot' : k}`).join(', ')}), ${G.main.ne.length} Natural Earth lines, ${seed.markers.length} markers`);
for (const [id, l] of Object.entries(lines)) say(`  ${id.padEnd(15)} ${String(points(l.coords)).padStart(5)} pts ${String(round(lengthKm(l.coords))).padStart(7)} km  ${drawnHashes[id]}${l.gaps ? `  max gap ${Math.max(0, ...l.gaps)} m` : ''}`);
say(`main: Natural Earth ${neChain.length} pts + OSM from vertex ${seam.vertex}; seam gap ${round(seamGapM)} m at ${round(osmMain.coords[seam.vertex][0], 3)}°E; ${mainPieces.length} pieces (${mainPieces.filter((p) => p.inside).length} in Bangladesh, ${round(mainPieces.filter((p) => p.inside).reduce((s, p) => s + lengthKm(p.coords), 0))} km); jamuna→padma ${round(mainToPadma)} m; padma→meghna junction ${round(junction, 2)} m`);
if (mainJoins.length) say(`other main rivers, end to end: ${mainJoins.join(', ')}`);
say(`checks: ${upazilaChecks.join(', ')}; Teesta mouth ${round(sundarganj)} m from Sundarganj; entry ${round(entryToBorder)} m from the border (BWDB's point ${round(bwdbToBorder)} m, ${round(distM(entrySeed.snappedFrom.lonLat, crossing))} m from it); Dewanganj at ${round(dewanganj, 3)} of the main line`);
for (const [k, list] of Object.entries(districtReport)) say(`districts, ${k}: ${list.filter((d) => d.always).map((d) => d.en).join(', ')} (from the opening view); ${list.filter((d) => !d.always).map((d) => d.en).join(', ')} (from 2×)`);
for (const [k, f] of Object.entries(frames)) if (f.file.connectors.length) say(`connectors, ${k}: ${f.file.connectors.map((c) => `${c.id} → ${c.parent} ${c.m} m`).join(', ')} (from ${CONNECT_FROM_M} m to ${CONNECT_MAX_M / 1000} km)`);
for (const [k, f] of Object.entries(frames)) say(`frame ${k}: viewBox 0 0 ${f.width} ${f.height}, lon ${f.bounds.lonMin}–${f.bounds.lonMax}, lat ${f.bounds.latMin}–${f.bounds.latMax}, scale ${round(f.scale, 2)} u/deg`);
say(`pending: ${pending.length} (${pending.join(', ')})`);
say(`wrote ${path.relative(ROOT, OUT) || OUT}: ${Object.entries(sizes).map(([n, b]) => `${n} ${b} B`).join(', ')}; data ${sizes['data.json'] + sizes['frame-whole.json'] + sizes['frame-bangladesh.json']} B`);
