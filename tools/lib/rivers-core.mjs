// The rivers' build core, shared by the two products of one seed: the SVG
// diagram (tools/build-diagram-bangladesh-rivers.mjs) and the MapLibre map
// (tools/build-bangladesh-rivers-map.mjs). It reads the seed and the pinned
// files, assembles every line as one chain, holds the 68 geometry pins,
// splits lines at COD-AB's border, runs the checks that need no picture, and
// gathers the words (cards, markers, the pending list, the credits). Moved
// here verbatim from the diagram build (2026-09-30); the diagram still writes
// the same bytes, which tools/verify.mjs holds.
//
// No network, ever: the inputs are pinned files that the fetch tools filled.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, zipEntry } from './geo.mjs';
import { distM, nearestOnLine, fractionAlong, chainWays } from './rivers-frame.mjs';
import { loadRiversSeed } from './rivers-seed.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '../..');
// The seed, the pins and the pinned sources. Change here if one moves.
// The seed: a common file and one file per river system (./rivers-seed.mjs merges them).
export const SEED = path.join(ROOT, 'data-sources/bangladesh-rivers');
const SOURCES = path.join(ROOT, 'tools/sources.json');
export const PINS = path.join(ROOT, 'tools/bangladesh-rivers-pins.json');
const COUNTRY_NAMES = path.join(ROOT, 'tools/country-names-bn.json');

export const CHAIN_TOL_M = 3;
// The seed's entry point may miss the computed border crossing by this much (metres): its eight decimals.
export const SNAP_M = 0.05;
// A tributary's or distributary's drawn end further than CONNECT_FROM_M from its drawn parent, and no
// more than CONNECT_MAX_M, gets a straight connector to the parent's nearest point (the user's rule,
// 2026-09-29: 10 km, then 12 km for the Dhaleshwari, then "gaps over 12 km stay unjoined" for every line).
export const CONNECT_FROM_M = 50;
export const CONNECT_MAX_M = 12000;
// Lines left unjoined by the user's decision though nearer than CONNECT_MAX_M: the Harinbhanga (decision 5
// after Stage 3 — BWDB has it rise from the Raimangal, which is not drawn; the Ichamati is 8.3 km off).
// tools/verify.mjs holds the same list.
export const UNJOINED_BY_DECISION = new Set(['harinbhanga']);
export const JOIN_M = 500;
// The Padma–Meghna junction: the Padma's end must lie this near a Meghna vertex (metres).
export const JUNCTION_M = 3;
// The Teesta's mouth may lie this far from Sundarganj upazila, where BWDB puts it
// (metres): the OSM mouth is 679 m outside it, in Gaibandha Sadar.
export const SUNDARGANJ_M = 1000;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const gitBlobSha1 = (buf) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
export const hashLine = (coords) => sha256(Buffer.from(JSON.stringify(coords))).slice(0, 16);
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const json = (v) => JSON.stringify(v, null, 2) + '\n';

/**
 * Everything both builds draw from, checked. `id` prefixes every failure;
 * `printPins` prints the line hashes and exits, as --print-pins does.
 */
export function riversCore({ id = 'bangladesh-rivers', printPins = false } = {}) {
  const ID = id;
  const PRINT_PINS = printPins;
  const fail = (msg) => {
    throw new Error(`${ID}: ${msg}`);
  };

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
  // «padma» → osmBangladeshRiversPadma; «padma-b2» (a later batch's extract) → osmBangladeshRiversPadmaB2.
  const extractKey = (name) => `osmBangladeshRivers${name.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('')}`;
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
  // Another system's main river may be drawn as several lines, in the seed's order: each begins where the
  // last ends — or, a piece of it, joins the last as a branch joins its parent (`join.parent`, by a connector
  // up to CONNECT_MAX_M, or unjoined with the seed's reason).
  const mainJoins = [];
  for (const e of seed.entities.filter((x) => x.role === 'main' && x.id !== 'main')) {
    const ids = Object.keys(G.lines).filter((id) => G.lines[id].entity === e.id);
    if (ids.some((id) => lines[id].role !== 'main')) fail(`${e.id}: every line of a main river's card is a main line`);
    for (let i = 1; i < ids.length; i++) {
      const gap = distM(lines[ids[i - 1]].coords.at(-1), lines[ids[i]].coords[0]);
      const piece = G.lines[ids[i]].join?.parent === ids[i - 1];
      if (gap > CHAIN_TOL_M && !piece) fail(`${e.id}: ${ids[i]} begins ${round(gap)} m from where ${ids[i - 1]} ends (limit ${CHAIN_TOL_M} m), and is not a piece joined to it`);
      mainJoins.push(`${ids[i - 1]}→${ids[i]} ${round(gap, 1)} m${piece ? ' (a piece)' : ''}`);
    }
  }
  // Which end of a line meets its parent: a tributary's mouth, a distributary's head, a main river's later piece's
  // head; a line whose role the books dispute says which (`join.end`), as its course, not its role, decides.
  const BRANCH_ROLES = new Set(['tributary', 'distributary', 'disputed']);
  const joinsParent = (l) => BRANCH_ROLES.has(l.role) || (l.role === 'main' && Boolean(l.spec?.join?.parent));
  const parentSideAtTail = (l) => {
    const end = l.spec?.join?.end;
    if (end !== undefined && end !== 'head' && end !== 'tail') fail(`${l.id}: join.end is «${end}», not head or tail`);
    if (l.role === 'disputed' && !end) fail(`${l.id}: a line whose role the books dispute must say which end meets its parent (join.end)`);
    return end ? end === 'tail' : l.role === 'tributary';
  };
  // A line's basin: the card of the main river it drains to, by its parents (a branch's parent is the Jamuna
  // unless its join names another). Choosing a main river lights its basin — in a system of one main river,
  // the whole system; in a group of rivers that each reach the sea (Stage 3), that river and its branches.
  const basinOf = (id, seen = new Set()) => {
    const l = lines[id];
    if (!l || l.role === 'continuation') return null;
    if (l.role === 'main') return id === 'main' ? 'main' : l.spec.entity;
    if (seen.has(id)) fail(`${id}: its parents run in a loop`);
    seen.add(id);
    return basinOf(l.spec?.join?.parent ?? 'main', seen);
  };

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
  // The Karnaphuli's mouth: its card names only the city, «চট্টগ্রাম শহরের কাছে»; COD-AB must agree on the district.
  if (!admin3.features.some((f) => f.properties.adm2_name === 'Chattogram' && inside(markerSeed.karnaphuliMouth.lonLat, indexed(f.geometry)))) fail("the Karnaphuli's mouth is not in COD-AB's Chattogram district");
  upazilaChecks.push('karnaphuliMouth in Chattogram district');
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
  // A card's name, with or without its bracketed district (same-name rivers: «ভৈরব (যশোর)» is drawn «ভৈরব»).
  const known = new Set([...seed.entities.flatMap((e) => [e.nameBn, e.nameBn.replace(/ \(.*\)$/, '')]), ...seed.markers.map((m) => m.nameBn), ...seed.continuations.map((c) => c.nameBn), ...alias]);
  const labelTexts = Object.fromEntries(Object.entries(seed.labelsBn).filter(([k]) => !k.startsWith('_')));
  for (const [id, text] of Object.entries(labelTexts)) if (!known.has(text)) fail(`label ${id} «${text}» is not a name any card gives`);
  for (const c of seed.continuations) if (!lines[c.id] || lines[c.id].role !== 'continuation') fail(`continuation ${c.id} has no continuation line`);

  const credit = (s, extra = '') => ({ title: s.title + (s.creditExtra ?? '') + extra, by: s.publisher, url: s.url, ...(/[ঀ-৿]/.test(s.title) ? { lang: 'bn' } : {}) });

  return {
    seed, sources, ui, G, neLand, neBoundaries, admin0, admin2, admin3, countries,
    ways, wayFrom, usedWays, neChain, seam, seamGapM, osmMain, mainCoords, lines,
    junction, mainToPadma, mainJoins, joinsParent, parentSideAtTail, basinOf, drawnHashes,
    outline, ringBox, polygonsOf, indexed, inside, outlineIdx, outlineRings, distToRings, upazila,
    splitAtBorder, mainPieces, borderPieces, upazilaChecks, markerSeed, sundarganj,
    entrySeed, crossing, entryToBorder, bwdbToBorder, dewanganj,
    entitiesSeed, cited, pending, entities, markers, systems, picker, pickerGroups, labelTexts, credit,
  };
}
