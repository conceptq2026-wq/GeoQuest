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

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed, the pins and where the diagram goes. Change here if one moves.
const SEED = path.join(ROOT, 'data-sources/bangladesh-rivers/bangladesh-rivers.seed.json');
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
// A tributary's or distributary's drawn end further than CONNECT_FROM_M from its drawn parent, and no
// more than CONNECT_MAX_M, gets a straight connector to the parent's nearest point (the user's rule, 2026-09-29).
const CONNECT_FROM_M = 50;
const CONNECT_MAX_M = 10000;
// The one exception, the user's decision (2026-09-29): the Dhaleshwari's head, 11.4 km out.
const CONNECT_MAX_M_FOR = { dhaleshwari: 12000 };
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

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
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
const osmFile = (entry, rel) => {
  if (entry.file !== rel) fail(`the seed reads ${rel}, tools/sources.json pins ${entry.file}`);
  return JSON.parse(pinnedBuffer(path.join(ROOT, entry.file), undefined, { sha256: entry.sha256 }).toString('utf8'));
};
const osmSnapshot = osmFile(sources.osmBangladeshRivers, G.files.osmSnapshot);
const osmPilot = osmFile(sources.osmBangladeshRiversPilot, G.files.osmPilot);

// The seed's country names are Natural Earth's NAME_BN, as the map baseline has them.
const countryTable = JSON.parse(fs.readFileSync(COUNTRY_NAMES, 'utf8'));
const countries = Object.fromEntries(Object.entries(seed.countries).filter(([k]) => !k.startsWith('_')));
for (const [code, name] of Object.entries(countries)) if (countryTable[code] !== name) fail(`country ${code}: the seed has «${name}», tools/country-names-bn.json «${countryTable[code]}»`);

// ---- OpenStreetMap ways, and the chains ------------------------------------------------------

const ways = new Map();
for (const f of osmSnapshot.features) ways.set(f.properties.osm_id, { id: f.properties.osm_id, coords: f.geometry.coordinates });
const wayFrom = new Map([...ways.keys()].map((id) => [id, 'snapshot']));
for (const f of osmPilot.features) {
  const id = f.properties.osm_id;
  const w = { id, coords: f.geometry.coordinates, nodes: f.properties.nodes };
  const other = ways.get(id);
  if (other) {
    if (other.coords.length !== w.coords.length) fail(`way ${id} has ${other.coords.length} points in the snapshot and ${w.coords.length} in the pilot extract`);
    const worst = Math.max(...w.coords.map((p, i) => distM(p, other.coords[i])));
    if (worst > 1) fail(`way ${id}: the snapshot and the pilot extract differ by ${round(worst, 2)} m (limit 1 m)`);
    wayFrom.set(id, 'both');
  } else wayFrom.set(id, 'pilot');
  ways.set(id, w);
}
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
const sundarganj = distToRings(markerSeed.teestaConfluence.lonLat, polygonsOf(upazila('Sundarganj', 'Gaibandha')).flat());
if (sundarganj > SUNDARGANJ_M) fail(`the Teesta's mouth is ${round(sundarganj)} m from Sundarganj upazila (limit ${SUNDARGANJ_M} m)`);
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
      const pieces = id === 'main' ? mainPieces.flatMap((pc) => drawn(pc.coords).map((d) => (pc.inside ? { d } : { d, dash: true }))) : drawn(l.coords).map((d) => ({ d }));
      if (!pieces.length) fail(`${frameId}: ${id} is not in the frame`);
      const trace = id === 'main' ? { ne: G.main.ne.map((n) => ({ name: n.name, rivernum: n.rivernum })), ways: G.main.ways } : { ways: l.spec.ways };
      return { id, role: l.role, pieces, ...trace };
    })
    .sort((a, b) => roleRank[a.role] - roleRank[b.role]);

  // The connectors: from a branch's parent-side end (a tributary's mouth, a distributary's head) to the
  // nearest point of its parent as drawn. Kept apart from the sourced lines, never merged into them.
  const drawnPolys = (id) => (id === 'main' ? mainPieces.map((pc) => pc.coords) : [lines[id].coords]).flatMap((c) => clipLine(proj(c), RECT).map((pc) => simplify(pc, tol.river)));
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
    if (!inRect(end)) fail(`${frameId}: ${id}'s parent-side end is outside the frame`);
    const q = (xy) => xy.map((v) => Math.round(v * 10) / 10);
    const [a, b] = [q(end), q(footOn(end, drawnPolys(parent)))];
    const m = distM(P.invert(...a), P.invert(...b));
    if (m > CONNECT_FROM_M && m <= (CONNECT_MAX_M_FOR[id] ?? CONNECT_MAX_M)) connectors.push({ id, parent, m: Math.round(m), d: pathData([a, b]) });
  }

  // The markers, at their recorded coordinates.
  const markers = spec.markers.map((id) => {
    const m = markerSeed[id] ?? fail(`${frameId}: the seed has no marker ${id}`);
    const [x, y] = P.project(m.lonLat[0], m.lonLat[1]).map((v) => round(v, 1));
    if (!inRect([x, y])) fail(`${frameId}: marker ${id} is outside the frame`);
    const src = { source: m.coordSource.source };
    for (const k of ['ne', 'way', 'node', 'vertex', 'vertices']) if (m.coordSource[k] !== undefined) src[k] = m.coordSource[k];
    return { id, kind: m.kind, x, y, lonLat: m.lonLat, src };
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

  const file = {
    _about: `Built by tools/build-diagram-${ID}.mjs from ${path.relative(ROOT, SEED).replace(/\\/g, '/')}; do not edit. Units u: x = (lon − lonMin)·cosLat·scale, y = (latMax − lat)·scale.`,
    id: frameId,
    projection: { lonMin: bounds.lonMin, latMax: bounds.latMax, cosLat, scale, width, height },
    bounds,
    land: land.filter(Boolean).join(''),
    bangladesh: { fill: bdFill.filter(Boolean).join(''), border: bdBorder.join('') },
    borders: borders.join(''),
    lines: frameLines,
    connectors,
    markers,
    labels,
    countries: countryAnchors,
  };
  return { file, bounds, width, height, cosLat, scale };
}
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
  entities[e.id] = { role: e.role, name: e.nameBn, values: rowValues(e.values, e.id) };
}
const markers = {};
for (const m of seed.markers) {
  if (!m.sources?.valueBn?.length || !m.sources?.nameBn?.length) fail(`marker ${m.id} carries no source for its name or its value`);
  if (m.infoBn !== undefined && !m.sources?.infoBn?.length) fail(`marker ${m.id}: its ⓘ note carries no source`);
  if (!(m.entity in entitiesSeed) || !ui.rowOrder.includes(m.row) || !(m.kind in ui.legendBn)) fail(`marker ${m.id}: entity, row or kind is unknown`);
  markers[m.id] = { kind: m.kind, entity: m.entity, name: m.nameBn, row: m.row, value: m.valueBn };
}
const picker = seed.entities.filter((e) => e.picker).map((e) => ({ key: e.id, label: e.nameBn }));
if (picker.length !== 1) fail('the pilot has one picker entry');

// Every label is a name a card gives.
const alias = String(entitiesSeed.main.values.alias ?? '').split('; ').map((s) => s.replace(/ \(.*\)$/, ''));
const known = new Set([...seed.entities.map((e) => e.nameBn), ...seed.markers.map((m) => m.nameBn), ...seed.continuations.map((c) => c.nameBn), ...alias]);
const labelTexts = Object.fromEntries(Object.entries(seed.labelsBn).filter(([k]) => !k.startsWith('_')));
for (const [id, text] of Object.entries(labelTexts)) if (!known.has(text)) fail(`label ${id} «${text}» is not a name any card gives`);
for (const f of Object.values(frames)) for (const l of f.file.labels) if (!(l.id in labelTexts)) fail(`label ${l.id} has no text in the seed`);
for (const c of seed.continuations) if (!lines[c.id] || lines[c.id].role !== 'continuation') fail(`continuation ${c.id} has no continuation line`);

const credit = (s, extra = '') => ({ title: s.title + (s.creditExtra ?? '') + extra, by: s.publisher, url: s.url, ...(/[ঀ-৿]/.test(s.title) ? { lang: 'bn' } : {}) });
const data = {
  _about: `Built by tools/build-diagram-${ID}.mjs from ${path.relative(ROOT, SEED).replace(/\\/g, '/')}; do not edit.`,
  picker,
  entities,
  markers,
  labels: labelTexts,
  countries,
  credits: Object.entries(seed.sources)
    .filter(([key]) => key !== 'user' && cited.has(key))
    .map(([key, s]) => credit(s, s.page ? `, ${ui.pageBn} ${s.page}` : ''))
    // A note the seed gives a marker reads as plain text, with no link.
    .concat(seed.markers.filter((m) => m.infoBn).map((m) => ({ title: m.infoBn, lang: 'bn' })))
    .concat(seed.infoBn.lines.map((l) => ({ title: l.textBn, lang: 'bn' }))),
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
say(`${ID}: ${Object.keys(lines).length} lines, ${usedWays.size} OSM ways (${[...usedWays].filter((id) => wayFrom.get(id) === 'pilot').length} pilot-only, ${[...usedWays].filter((id) => wayFrom.get(id) === 'snapshot').length} snapshot-only, ${[...usedWays].filter((id) => wayFrom.get(id) === 'both').length} in both), ${G.main.ne.length} Natural Earth lines, ${seed.markers.length} markers`);
for (const [id, l] of Object.entries(lines)) say(`  ${id.padEnd(15)} ${String(points(l.coords)).padStart(5)} pts ${String(round(lengthKm(l.coords))).padStart(7)} km  ${drawnHashes[id]}${l.gaps ? `  max gap ${Math.max(0, ...l.gaps)} m` : ''}`);
say(`main: Natural Earth ${neChain.length} pts + OSM from vertex ${seam.vertex}; seam gap ${round(seamGapM)} m at ${round(osmMain.coords[seam.vertex][0], 3)}°E; ${mainPieces.length} pieces (${mainPieces.filter((p) => p.inside).length} in Bangladesh, ${round(mainPieces.filter((p) => p.inside).reduce((s, p) => s + lengthKm(p.coords), 0))} km); jamuna→padma ${round(mainToPadma)} m; padma→meghna junction ${round(junction, 2)} m`);
say(`checks: ${upazilaChecks.join(', ')}; Teesta mouth ${round(sundarganj)} m from Sundarganj; entry ${round(entryToBorder)} m from the border (BWDB's point ${round(bwdbToBorder)} m, ${round(distM(entrySeed.snappedFrom.lonLat, crossing))} m from it); Dewanganj at ${round(dewanganj, 3)} of the main line`);
for (const [k, f] of Object.entries(frames)) if (f.file.connectors.length) say(`connectors, ${k}: ${f.file.connectors.map((c) => `${c.id} → ${c.parent} ${c.m} m`).join(', ')} (from ${CONNECT_FROM_M} m to ${CONNECT_MAX_M / 1000} km; ${Object.entries(CONNECT_MAX_M_FOR).map(([id, m]) => `${id} ${m / 1000} km`).join(', ')})`);
for (const [k, f] of Object.entries(frames)) say(`frame ${k}: viewBox 0 0 ${f.width} ${f.height}, lon ${f.bounds.lonMin}–${f.bounds.lonMax}, lat ${f.bounds.latMin}–${f.bounds.latMax}, scale ${round(f.scale, 2)} u/deg`);
say(`pending: ${pending.length} (${pending.join(', ')})`);
say(`wrote ${path.relative(ROOT, OUT) || OUT}: ${Object.entries(sizes).map(([n, b]) => `${n} ${b} B`).join(', ')}; data ${sizes['data.json'] + sizes['frame-whole.json'] + sizes['frame-bangladesh.json']} B`);
