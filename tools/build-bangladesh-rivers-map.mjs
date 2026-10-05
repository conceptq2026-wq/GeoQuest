// Builds the Rivers of Bangladesh map — the MapLibre map of the diagram's seed —
// into its folder: the descriptor, the records, the lines as GeoJSON, the
// marker icons and ⓘ's lines.
//
//   node tools/build-bangladesh-rivers-map.mjs [out]      build (out: docs/maps/bangladesh-rivers-map)
//
// From the same seed and pinned files as the diagram, through the shared core
// (tools/lib/rivers-core.mjs), which holds the 68 geometry pins: every line is
// the pinned full-precision chain, whole, split at COD-AB's border where the
// seed says so (dashed outside), and simplified by Douglas–Peucker to at most
// MAX_DEVIATION_M from the chain — checked here in metres, vertex by vertex,
// and every drawn vertex lies on the chain. A branch whose parent-side end
// misses its parent by more than CONNECT_FROM_M, up to CONNECT_MAX_M, gets a
// straight connector to the parent as the map draws it, as in the diagram.
// Two views, as tabs (M3, 2026-09-30; R-55, 2026-10-05): «বাংলাদেশে» draws,
// names and takes taps on Bangladesh only — each line's pieces inside COD-AB's
// outline widened by BD_BAND_M — and frames a selection on the inside pieces
// of the river and its descendants; and «পুরো পথ», framed on all of it with
// every pinned reach outside, disabled for a selection with none. The lines,
// markers and names of the seed's Bangladesh frame, and the whole-course
// frame's (the origin, the Yarlung's name).
//
// Every Bengali word shipped is the seed's: the cards and their rows, the
// markers' cards, the names on the lines, the legend, ⓘ's headings and lines,
// and the credits. A null in the seed stays null in the records — unverified,
// hidden by the shell, counted as pending. Output is deterministic.
//
// No network, ever: the inputs are pinned files that the fetch tools filled.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { distM, nearestOnLine, lengthKm } from './lib/rivers-frame.mjs';
import { CACHE } from './lib/geo.mjs';
import { riversCore, itemsOnly, SEED, MAP_PINS, CONNECT_FROM_M, CONNECT_MAX_M, UNJOINED_BY_DECISION } from './lib/rivers-core.mjs';
import { SegmentGrid } from './lib/bangladesh-units.mjs';
import { cutAt, headJoins, byIdHead, snapshotBoxes, snapshotRivers, CUT_TOL_M, BD_BAND_M } from './lib/rivers-cut.mjs';
import { districtLabels, NAME_ROOM } from './lib/bd-labels.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where the map goes. Change here if it moves.
const DEFAULT_OUT = path.join(ROOT, 'docs/maps/bangladesh-rivers-map');

const ID = 'bangladesh-rivers-map';
const SECTION = 'bangladesh';
// Douglas–Peucker's tolerance, and the most any chain vertex may lie from the drawn line (metres).
// The tolerance sits under the limit so the check, measured the same way, holds with room.
const SIMPLIFY_M = 14;
const MAX_DEVIATION_M = 15;
// A drawn vertex must lie on the chain within this (metres): the 6-decimal rounding is 0.11 m at most.
const ON_CHAIN_M = 0.5;
const DECIMALS = 6;
// The lines' colours and widths, by role — the diagram's (docs/visual/rivers.css).
const LINE = { main: { color: '#0b3d91', width: 2.9 }, tributary: { color: '#0f9d8a', width: 2 }, distributary: { color: '#e07b00', width: 2 }, disputed: { color: '#7e57c2', width: 2 } };
const NAME_COLOR = { main: '#0b3d91', tributary: '#0a6e61', distributary: '#9a5000', disputed: '#5e35b1' };
const LIT = '#ffc933';
// A place's name on the water: the basemap's water-name colour. An ancestor of the selected river, drawn
// for context: this much of its line's opacity, and of its name's.
const WATER_NAME = '#2f6c9e';
const CONTEXT_LINE = 0.45;
const CONTEXT_NAME = 0.6;
// A card has a pinned reach outside Bangladesh when its lines run this far outside COD-AB's outline (km):
// less is a border river's sliver, not a reach.
const OUTSIDE_KM = 1;
// «বাংলাদেশে» draws a line where it lies inside COD-AB's outline or within BD_BAND_M of it (tools/lib/rivers-cut.mjs)
// — so a reach that follows the border is not cut into bits where the two traces part — and drops an inside piece
// shorter than BD_BIT_KM between reaches outside: a flicker, not a reach (R-55, 2026-10-05).
const BD_BIT_KM = 1;
// The open card takes at most this share of the map's height; the rest of it scrolls inside (R-55).
const SHEET_MAX = 0.4;
// «পুরো পথ»'s frames: this share of the span added on each side, at least MARGIN_MIN degrees.
const MARGIN = 0.05;
const MARGIN_MIN = 0.1;
const OSM_CREDIT = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>';

const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? DEFAULT_OUT);
const fail = (msg) => {
  throw new Error(`${ID}: ${msg}`);
};
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const fix = (p) => [round(p[0], DECIMALS), round(p[1], DECIMALS)];
const json = (v) => JSON.stringify(v, null, 1) + '\n';
// GeoJSON: one feature to a line, so a diff shows which line moved.
const geojson = (features) => `{"type":"FeatureCollection","features":[\n${features.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
const say = (s) => console.log(s);

const { wholeSeed, seed, ui, G, lines, ways, joinsParent, parentSideAtTail, borderPieces, splitAtBorder, markerSeed, outlineRings, outlineIdx, inside, labelTexts, pending, credit, cited } = riversCore({ id: ID, product: 'map' });
const frame = G.frames.bangladesh;
const wholeFrame = G.frames.whole;
const words = ui.mapOnlyBn ?? fail('the seed has no ui.mapOnlyBn');
const entitySeed = Object.fromEntries(seed.entities.map((e) => [e.id, e]));


// ---- the lines: each piece whole, simplified in metres -----------------------------------------------

const entityOf = (id) => (id === 'main' ? 'main' : lines[id].spec?.entity ?? fail(`line ${id} has no card`));
for (const id of wholeFrame.lines) if (!frame.lines.includes(id)) fail(`the whole-course frame draws ${id}, which the Bangladesh frame does not`);

/** Douglas–Peucker on [lon, lat], in metres as nearestOnLine measures them: the indices kept. */
function keepIndices(pts, tolM) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const m = nearestOnLine(pts[i], [pts[a], pts[b]]).m;
      if (m > worst) (worst = m), (at = i);
    }
    if (worst > tolM) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return [...keep.keys()].filter((i) => keep[i]);
}

let chainVertices = 0;
let drawnVertices = 0;
let worstDeviation = { m: 0, line: null };
let worstOnChain = 0;
const pieces = []; // { line, entity, dashed, coords }
for (const id of frame.lines) {
  const l = lines[id] ?? fail(`the Bangladesh frame names no line ${id}`);
  const raw = borderPieces.has(id) ? borderPieces.get(id) : [{ inside: true, coords: l.coords }];
  for (const piece of raw) {
    for (const cut of [piece.coords]) {
      const keep = keepIndices(cut, SIMPLIFY_M);
      const out = keep.map((i) => fix(cut[i]));
      // Every vertex of the chain within MAX_DEVIATION_M of the drawn line, measured on the drawn (rounded) segment.
      for (let k = 1; k < keep.length; k++)
        for (let i = keep[k - 1] + 1; i < keep[k]; i++) {
          const m = nearestOnLine(cut[i], [out[k - 1], out[k]]).m;
          if (m > worstDeviation.m) worstDeviation = { m, line: id };
        }
      // Every drawn vertex on the chain: a chain vertex or a border crossing, each on a chain segment.
      for (const v of out) worstOnChain = Math.max(worstOnChain, nearestOnLine(v, piece.coords).m);
      chainVertices += cut.length;
      drawnVertices += out.length;
      pieces.push({ line: id, entity: entityOf(id), dashed: !piece.inside, coords: out });
    }
  }
}
if (worstDeviation.m > MAX_DEVIATION_M) fail(`${worstDeviation.line}: a chain vertex lies ${round(worstDeviation.m, 2)} m from the drawn line (limit ${MAX_DEVIATION_M} m)`);
if (worstOnChain > ON_CHAIN_M) fail(`a drawn vertex lies ${round(worstOnChain, 2)} m off its chain (limit ${ON_CHAIN_M} m)`);
for (const id of frame.lines) if (!pieces.some((p) => p.line === id)) fail(`${id} draws nothing`);
// The main line crosses itself only where its pinned chain does: the simplification adds no crossing.
const crossings = (polys) => {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const segs = polys.flatMap((pc) => pc.slice(1).map((pt, i) => [pc[i], pt]));
  const at = [];
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 2; j < segs.length; j++) {
      const [a, b] = segs[i];
      const [c, d] = segs[j];
      if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) at.push(a.map((v) => round(v, 3)));
    }
  return at;
};
const mainCrossings = { chain: crossings([lines.main.coords]), drawn: crossings(pieces.filter((q) => q.line === 'main').map((q) => q.coords)) };
if (mainCrossings.drawn.length > mainCrossings.chain.length) fail(`the drawn main line crosses itself ${mainCrossings.drawn.length} times, its pinned chain ${mainCrossings.chain.length}`);

// ---- the connectors: from a branch's parent-side end to its parent as the map draws it -----------

const drawnOf = (id) => pieces.filter((p) => p.line === id).map((p) => p.coords);
const connectors = [];
for (const id of frame.lines) {
  const l = lines[id];
  if (!joinsParent(l)) continue;
  const parent = l.spec.join?.parent ?? 'main';
  if (!frame.lines.includes(parent) || UNJOINED_BY_DECISION.has(id)) continue;
  const end = parentSideAtTail(l) ? l.coords.at(-1) : l.coords[0];
  let best = null;
  for (const c of drawnOf(parent)) {
    const n = nearestOnLine(end, c);
    if (!best || n.m < best.m) best = n;
  }
  const m = distM(end, best.pt);
  if (m > CONNECT_FROM_M && m <= CONNECT_MAX_M) connectors.push({ line: id, entity: entityOf(id), parent, m: Math.round(m), coords: [fix(end), fix(best.pt)] });
}

// ---- «বাংলাদেশে»: Bangladesh only (R-55, 2026-10-05) ----------------------------------------------------

const outlineGrid = new SegmentGrid(outlineRings, 0.02);
const inBd = (p) => inside(p, outlineIdx) || outlineGrid.nearest(p, BD_BAND_M / 1000) !== null;
const bdPieces = []; // { line, entity, coords }: the inside pieces, simplified as the rest
const banded = new Set(); // lines the band keeps a reach of that lies outside the outline itself
const bits = [];
// The map-only upstream reaches (Stage 4, 2026-10-05) are «পুরো পথ»'s alone: none of them reaches «বাংলাদেশে», even
// where one runs within the band (the Khawthlangtuipui's last reach, along the border above Barkal).
const s4Left = [];
for (const id of frame.lines) {
  if (lines[id].spec?.only === 'map') {
    s4Left.push(id);
    continue;
  }
  const runs = [];
  let cur = null;
  for (const p of lines[id].coords) {
    if (inBd(p)) (cur ??= []).push(p);
    else if (cur) (runs.push(cur), (cur = null));
  }
  if (cur) runs.push(cur);
  const real = runs.filter((r) => r.length > 1);
  for (const r of real) {
    if (real.length > 1 && lengthKm(r) < BD_BIT_KM) {
      bits.push(`${id} ${round(lengthKm(r), 2)} km`);
      continue;
    }
    if (r.some((p) => !inside(p, outlineIdx))) banded.add(id);
    bdPieces.push({ line: id, entity: entityOf(id), coords: keepIndices(r, SIMPLIFY_M).map((i) => fix(r[i])) });
  }
}
const bdConnectors = connectors.filter((c) => c.coords.every(inBd));

// ---- the records -----------------------------------------------------------------------------------

// A card's parent card: the card of the line its first line joins; a main river has none (it is a root).
const upOf = (entityId) => {
  const e = entitySeed[entityId];
  if (e.role === 'main') return undefined;
  const ids = frame.lines.filter((id) => entityOf(id) === entityId);
  const ups = [...new Set(ids.map((id) => entityOf(lines[id].spec.join?.parent ?? 'main')).filter((u) => u !== entityId))];
  if (ups.length !== 1) fail(`${entityId}: its lines join ${ups.length} cards (${ups.join(', ')}), not one`);
  return ups[0];
};
const order = seed.systems.flatMap((s) => seed.entities.filter((e) => e.system === s.id).map((e) => e.id));
const rivers = {};
for (const eid of order) {
  const e = entitySeed[eid];
  if (!frame.lines.some((id) => entityOf(id) === eid)) fail(`card ${eid} has no line in the Bangladesh frame`);
  const lineRoles = new Set(frame.lines.filter((id) => entityOf(id) === eid).map((id) => lines[id].role));
  if (lineRoles.size !== 1 || !lineRoles.has(e.role)) fail(`${eid}: its lines' roles (${[...lineRoles].join(', ')}) are not its card's, ${e.role}`);
  const up = upOf(eid);
  const row = { nameBn: e.nameBn, role: e.role, system: e.system, ...(up ? { up } : {}) };
  row.solid = pieces.some((p) => p.entity === eid && !p.dashed);
  row.dashed = pieces.some((p) => p.entity === eid && p.dashed);
  row.joined = connectors.some((c) => c.entity === eid);
  row.hasBd = bdPieces.some((p) => p.entity === eid);
  row.bdJoined = bdConnectors.some((c) => c.entity === eid);
  // The rows, in ui.rowOrder: a null stays null (unverified, hidden, pending); a row the card lacks stays absent.
  for (const k of ui.rowOrder) if (k in e.values) row[k] = e.values[k];
  for (const k of Object.keys(e.values)) if (!ui.rowOrder.includes(k)) fail(`${eid} has a row ${k} that ui.rowOrder does not place`);
  rivers[eid] = row;
}
const marks = {};
for (const mid of [...frame.markers, ...wholeFrame.markers.filter((k) => !frame.markers.includes(k))]) {
  const m = markerSeed[mid] ?? fail(`the seed has no marker ${mid}`);
  if (!(m.entity in rivers)) fail(`marker ${mid}'s card ${m.entity} is not on the map`);
  // The card's heading, as the diagram composes it: the marker's name — its kind.
  marks[mid] = { nameBn: m.nameBn, titleBn: `${m.nameBn} — ${ui.legendBn[m.kind]}`, kind: m.kind, river: m.entity, at: m.lonLat, inBd: inBd(m.lonLat), [m.row]: m.valueBn };
}
const names = {};
const mapLabels = [...frame.labels, ...wholeFrame.labels.filter((l) => !frame.labels.some((b) => b.id === l.id))];
for (const lab of mapLabels) {
  const l = lines[lab.line] ?? fail(`name ${lab.id} names no line ${lab.line}`);
  const text = labelTexts[lab.id] ?? fail(`name ${lab.id} has no text in the seed`);
  // On the line as the map draws it, nearest the seed's hint.
  let best = null;
  for (const c of drawnOf(lab.line)) {
    const n = nearestOnLine(lab.near, c);
    if (!best || n.m < best.m) best = n;
  }
  const eid = entityOf(lab.line);
  names[lab.id] = { nameBn: text, river: eid, role: l.role, at: fix(best.pt), inBd: inBd(best.pt) };
}
// A branch's ancestors, up to its main river, and their names: drawn for context, lighter, while it is
// selected. A main river has none (absent, not applicable).
for (const [eid, row] of Object.entries(rivers)) {
  if (!row.up) continue;
  const chain = [];
  for (let at = row.up; at; at = rivers[at].up) chain.push(at);
  row.ancestors = chain;
  row.ancestorNames = Object.keys(names).filter((k) => chain.includes(names[k].river));
}

// ---- the pinned files a check reads beyond the core's -----------------------------------------------

const sourcesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/sources.json'), 'utf8'));
const mapPins = fs.existsSync(MAP_PINS) ? JSON.parse(fs.readFileSync(MAP_PINS, 'utf8')) : {};
const pinnedNe = (name) => {
  const pin = sourcesJson.naturalEarth.files[name] ?? fail(`tools/sources.json pins no ${name}`);
  const buf = fs.readFileSync(path.join(CACHE, name));
  const blob = crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
  if (buf.length !== pin.size || blob !== pin.gitBlobSha1) fail(`${name} is not the pinned file (${buf.length} bytes, blob ${blob.slice(0, 8)}…)`);
  return JSON.parse(buf.toString('utf8'));
};
const pinnedGeoBoundaries = (name) => {
  const pin = sourcesJson.geoBoundariesIndia ?? fail('tools/sources.json pins no geoBoundariesIndia');
  const buf = fs.readFileSync(path.join(CACHE, name));
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (!pin.sha256 || sha !== pin.sha256) fail(`${name} is not the pinned geoBoundaries file (sha256 ${sha.slice(0, 12)}…)`);
  return JSON.parse(buf.toString('utf8'));
};
const hashGeometry = (coords) => crypto.createHash('sha256').update(JSON.stringify(coords)).digest('hex').slice(0, 16);
const inRing = (p, ring) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (ring[i][1] > p[1] !== ring[j][1] > p[1] && p[0] < ((ring[j][0] - ring[i][0]) * (p[1] - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) hit = !hit;
  return hit;
};

// ---- the two views: what a selection draws, inside Bangladesh and in all -----------------------------

// Each line cut at COD-AB's outline, for the frames and for the reaches outside.
const split = new Map(Object.keys(lines).map((id) => [id, splitAtBorder(lines[id].coords)]));
const linesOf = (card) => frame.lines.filter((id) => entityOf(id) === card);
const outsideKm = Object.fromEntries(Object.keys(rivers).map((k) => [k, linesOf(k).reduce((n, id) => n + split.get(id).filter((q) => !q.inside).reduce((m, q) => m + lengthKm(q.coords), 0), 0)]));
const bbox = (pts) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
// The bounds a frame needs on a map up to `tall` times as high as wide, fitted to its width: MapLibre keeps the
// whole view inside them. Mercator about the frame's middle, outward to whole degrees, holding `base` too.
const TALL = 2.2;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latOf = (y) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;
function tallBounds(f, tall, base) {
  const width = ((f[2] - f[0]) * Math.PI) / 180;
  const [s, n] = [mercY(f[1]), mercY(f[3])];
  const half = Math.max(n - s, width * tall) / 2;
  const middle = (s + n) / 2;
  return [Math.min(base[0], Math.floor(f[0])), Math.min(base[1], Math.floor(latOf(middle - half))), Math.max(base[2], Math.ceil(f[2])), Math.max(base[3], Math.ceil(latOf(middle + half)))];
}
const outward = (b, d = 2) => [Math.floor(b[0] * 10 ** d) / 10 ** d, Math.floor(b[1] * 10 ** d) / 10 ** d, Math.ceil(b[2] * 10 ** d) / 10 ** d, Math.ceil(b[3] * 10 ** d) / 10 ** d];
const margin = (b) => {
  const m = Math.max(MARGIN_MIN, MARGIN * Math.max(b[2] - b[0], b[3] - b[1]));
  return [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
};
// What a selection draws (focus): the card, its descendants, its ancestors.
const setOf = (card) => {
  const keys = new Set([card]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [k, r] of Object.entries(rivers)) if (!keys.has(k) && keys.has(r.up)) (keys.add(k), (grew = true));
  }
  for (const a of rivers[card].ancestors ?? []) keys.add(a);
  return [...keys];
};
// A card and its descendants, every generation: what «বাংলাদেশে» frames (R-55: not its ancestors).
const treeOf = (card) => {
  const keys = new Set([card]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [k, r] of Object.entries(rivers)) if (!keys.has(k) && keys.has(r.up)) (keys.add(k), (grew = true));
  }
  return [...keys];
};
const bdBox = (cards) => {
  const pts = bdPieces.filter((p) => cards.includes(p.entity)).flatMap((p) => p.coords);
  return pts.length ? outward(bbox(pts)) : null;
};
// «বাংলাদেশে» at rest: the main rivers' inside pieces.
const bdRest = bdBox(Object.keys(rivers).filter((k) => rivers[k].role === 'main')) ?? fail('no main river has a piece inside Bangladesh');
const noInside = Object.keys(rivers).filter((k) => !rivers[k].hasBd);
const framedOnRest = [];
// A frame keeps a name besides the river's own (the user's default, 2026-10-05): a «বাংলাদেশে» frame whose
// square holds no district's label point, as the basemap draws it, takes in the nearest one with room for its name — so a
// small river opens no closer than the zoom that shows where it is. Larger frames are left as they are.
const { points: districtPoints } = await districtLabels();
const widened = [];
// The frame as the room above the open card shows it, about square on a phone: its shorter side widened to its longer.
const squared = (box) => {
  const k = Math.cos((((box[1] + box[3]) / 2) * Math.PI) / 180);
  const half = Math.max((box[2] - box[0]) * k, box[3] - box[1]) / 2;
  const [cx, cy] = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  return [cx - half / k, cy - half, cx + half / k, cy + half];
};
const named = (k, box) => {
  const seen = squared(box);
  if (districtPoints.some(({ at: [x, y] }) => x >= seen[0] && x <= seen[2] && y >= seen[1] && y <= seen[3])) return box;
  const gap = ({ at: [x, y] }) => Math.hypot(Math.max(box[0] - x, 0, x - box[2]) * Math.cos((y * Math.PI) / 180), Math.max(box[1] - y, 0, y - box[3]));
  const near = districtPoints.reduce((a, b) => (gap(b) < gap(a) ? b : a));
  const [x, y] = near.at;
  const out = outward([Math.min(box[0], x - NAME_ROOM[0]), Math.min(box[1], y - NAME_ROOM[1]), Math.max(box[2], x + NAME_ROOM[0]), Math.max(box[3], y + NAME_ROOM[1])]);
  widened.push(`${k} → «${near.nameBn}»`);
  return out;
};
for (const [k, row] of Object.entries(rivers)) {
  const set = setOf(k);
  const ids = set.flatMap(linesOf);
  const own = bdBox(treeOf(k));
  row.frameBd = own ? named(k, own) : (framedOnRest.push(k), bdRest);
  row.frameWhole = outward(margin(bbox(ids.flatMap((id) => lines[id].coords))));
  row.outsideSet = set.some((c) => outsideKm[c] >= OUTSIDE_KM);
  // «পুরো পথ» rests on every main river whose system — the river and its descendants — has a reach outside.
  row.restWhole = row.role === 'main' && treeOf(k).some((c) => outsideKm[c] >= OUTSIDE_KM);
  if (row.dashed) row.dashedKind = 'outside';
  // A disabled «পুরো পথ» says no part outside is drawn: then nothing of it may be.
  if (!row.outsideSet && set.some((c) => outsideKm[c] > 0)) fail(`${k}: its set has ${set.filter((c) => outsideKm[c] > 0).join(', ')} outside Bangladesh, under ${OUTSIDE_KM} km — «${words.wholeDisabled}» would not hold`);
}
for (const m of Object.values(marks)) Object.assign(m, { frameBd: rivers[m.river].frameBd, frameWhole: rivers[m.river].frameWhole, outsideSet: rivers[m.river].outsideSet });
const restWhole = Object.keys(rivers).filter((k) => rivers[k].restWhole);
if (!restWhole.length) fail('no main river has a reach outside Bangladesh');
const views = {
  bd: { titleBn: ui.tabsBn.bangladesh, frame: null },
  whole: { titleBn: ui.tabsBn.whole, frame: outward(margin(bbox(restWhole.flatMap(treeOf).flatMap(linesOf).flatMap((id) => lines[id].coords)))), disabledBn: words.wholeDisabled },
};
const disabledCards = Object.keys(rivers).filter((k) => !rivers[k].outsideSet);

// ---- the upstream rule: a card whose drawn course does not reach the origin the seed states -----------
// (M3 item 4, 2026-09-30.) The seed lists each card: an in-part ⓘ line with its evidence, or
// mapUpstreamReached with its; every piece of evidence is re-checked here against the pinned files.
const districtsBn = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/shared/bangladesh-districts.json'), 'utf8')).districts.map((d) => d.bn.normalize('NFC'));
const polygonFiles = new Map();
const upstreamEnd = (card) => lines[linesOf(card)[0]].coords[0];
const inPartLines = seed.infoBn.lines.filter((l) => l.card);
const inPartCards = inPartLines.map((l) => l.card);
function holds(card, ev) {
  const at = upstreamEnd(card);
  if (ev.kind === 'origin-point') return distM(at, markerSeed[ev.marker].lonLat) <= ON_CHAIN_M;
  if (ev.kind === 'head-joins') {
    const head = linesOf(card)[0];
    const parent = lines[head].spec.join?.parent;
    return parent !== undefined && entityOf(parent) === ev.card && !parentSideAtTail(lines[head]) && (Math.min(...drawnOf(parent).map((c) => nearestOnLine(at, c).m)) <= CONNECT_FROM_M || connectors.some((q) => q.line === head));
  }
  if (ev.kind === 'in' || ev.kind === 'not-in') {
    if (!polygonFiles.has(ev.file)) polygonFiles.set(ev.file, ev.file.startsWith('ne_') ? pinnedNe(ev.file) : pinnedGeoBoundaries(ev.file));
    const hits = polygonFiles.get(ev.file).features.filter((f) => f.properties[ev.key] === ev.value);
    if (!hits.length) fail(`${card}: ${ev.file} has no feature with ${ev.key} ${ev.value}`);
    const within = hits.some((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).some((poly) => poly.reduce((n, r) => n + (inRing(at, r) ? 1 : 0), 0) % 2 === 1));
    return ev.kind === 'in' ? within : !within;
  }
  if (ev.kind === 'starts-inside') return inside(at, outlineIdx);
  if (ev.kind === 'seed-note') return String(lines[ev.line]?.spec?.identified ?? '').includes(ev.quote);
  if (ev.kind === 'origin-in-part') return inPartCards.includes(ev.card);
  // The card its origin row names is itself listed as reached (Stage 4: the Meghna through the Barak).
  if (ev.kind === 'origin-reached') return reachedCards.includes(ev.card);
  if (ev.kind === 'origin-in-bangladesh') return districtsBn.includes(ev.district.normalize('NFC')) && String(entitySeed[card].values.origin ?? '').normalize('NFC').includes(ev.district.normalize('NFC'));
  fail(`${card}: unknown evidence «${ev.kind}»`);
}
const reachedCards = (seed.mapUpstreamReached ?? []).map((r) => r.card);
for (const l of inPartLines) {
  if (l.only !== 'map' || !(l.card in rivers)) fail(`the upstream line for ${l.card} is not a map-only line of a card on the map`);
  if (l.textBn !== `${rivers[l.card].nameBn}: ${words.upstreamInPart}`) fail(`the upstream line for ${l.card} is not «name: ${words.upstreamInPart}»`);
  for (const ev of l.evidence ?? fail(`the upstream line for ${l.card} carries no evidence`)) if (!holds(l.card, ev)) fail(`${l.card}: in part, but its evidence ${JSON.stringify(ev)} does not hold`);
}
for (const r of seed.mapUpstreamReached ?? []) for (const ev of r.evidence) if (!holds(r.card, ev)) fail(`${r.card}: reached, but its evidence ${JSON.stringify(ev)} does not hold`);
const both = inPartCards.filter((k) => reachedCards.includes(k));
const beginsOutside = Object.keys(rivers).filter((k) => !inside(upstreamEnd(k), outlineIdx));
const unruled = beginsOutside.filter((k) => !inPartCards.includes(k) && !reachedCards.includes(k));
if (both.length || unruled.length) fail(`the upstream rule: ${both.length ? `in part and reached: ${both.join(', ')}` : ''}${unruled.length ? ` begins outside Bangladesh, listed nowhere: ${unruled.join(', ')}` : ''}`);
// The cut rule (R-55, tools/lib/rivers-cut.mjs): a card listed as reached whose head line stops on the box a
// snapshot selection took it in is cut there, not reached — it gets the map's upstream ⓘ line.
const boxes = snapshotBoxes();
const snapRivers = snapshotRivers();
const cutReport = [];
const cutCards = [];
for (const card of reachedCards) {
  const head = linesOf(card)[0];
  const at = cutAt(upstreamEnd(card), head === 'main' ? G.main.ways : (lines[head].spec?.ways ?? []), boxes, snapRivers);
  // Refined (2026-10-05): a head that joins its parent — directly or by a connector — has reached its source.
  const parent = head === 'main' ? undefined : lines[head].spec?.join?.parent;
  const joins = parent !== undefined && !parentSideAtTail(lines[head]) && headJoins(upstreamEnd(card), drawnOf(parent), connectors.filter((q) => q.line === head).map((q) => q.coords[0]));
  // By id (Stage 4): a head on a way read by its id is reached at that way's named head, cut if trimmed short of it.
  const own = head === 'main' ? null : byIdHead(upstreamEnd(card), lines[head].spec?.ways ?? [], ways, snapRivers);
  const short = Boolean(own?.byId && !own.named);
  cutReport.push(`${card} ${at ? `${round(at.m / 1000, 3)} km from its ${at.river} box` : 'no box'}${joins ? `, joins ${parent} at its head` : ''}${own?.byId ? (own.named ? `, by id at its named head (way ${own.way})` : `, by id but trimmed short of its head (way ${own.way})`) : ''}`);
  if ((at && at.m <= CUT_TOL_M && !joins) || short) cutCards.push(card);
}
// Reached through another card only while that card is not cut.
for (const r of seed.mapUpstreamReached ?? []) for (const ev of r.evidence) if (ev.kind === 'origin-reached' && cutCards.includes(ev.card)) fail(`${r.card}: reached through ${ev.card}, which the cut rule cuts`);

// ---- the map's own places: a name on the water where a cited book gives one --------------------------
// Each is a Natural Earth feature, by its ne_id in a file pinned in tools/sources.json, its geometry pinned in
// MAP_PINS' `places`; its name stands at the point inside it farthest from its shore.
const places = {};
const placeReport = [];
for (const pl of seed.mapPlacesBn ?? []) {
  if (pl.only !== 'map') fail(`place ${pl.id} is not marked only: "map"; the diagram draws no places`);
  const cites = [...(pl.sources?.nameBn ?? []), ...(pl.sources?.outline ?? [])];
  if (!pl.sources?.nameBn?.length || !pl.sources?.outline?.length || cites.some((c) => !(c.source in seed.sources))) fail(`place ${pl.id}: its name and its outline each need a listed source`);
  for (const c of cites) cited.add(c.source);
  const hits = pinnedNe(pl.ne.file).features.filter((f) => f.properties.ne_id === pl.ne.ne_id);
  if (hits.length !== 1 || hits[0].geometry.type !== 'Polygon') fail(`place ${pl.id}: ${pl.ne.file} has ${hits.length} features with ne_id ${pl.ne.ne_id}, not one polygon`);
  const rings = hits[0].geometry.coordinates;
  const h = hashGeometry(rings);
  if (mapPins.places?.[pl.id] !== h) fail(`place ${pl.id}: geometry pin ${mapPins.places?.[pl.id] ?? '(none)'}, now ${h} — stop and report, never re-pin to pass`);
  const [x0, y0, x1, y1] = rings[0].reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const step = Math.max(x1 - x0, y1 - y0) / 120;
  let best = null;
  for (let x = x0 + step / 2; x < x1; x += step)
    for (let y = y0 + step / 2; y < y1; y += step) {
      const p = [x, y];
      if (!inRing(p, rings[0]) || rings.slice(1).some((r) => inRing(p, r))) continue;
      const m = Math.min(...rings.map((r) => nearestOnLine(p, r).m));
      if (!best || m > best.m) best = { p, m };
    }
  if (!best) fail(`place ${pl.id}: no point inside it for its name`);
  places[pl.id] = { nameBn: pl.nameBn, at: fix(best.p) };
  placeReport.push(`${pl.id} «${pl.nameBn}» at ${fix(best.p).join(', ')}, ${round(best.m)} m from its shore`);
}

// ---- ⓘ: the credits as links, the notes and the conflicts as plain lines --------------------------

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const credits = Object.entries(seed.sources)
  .filter(([key]) => key !== 'user' && cited.has(key))
  .map(([, s]) => credit(s, s.page ? `, ${ui.pageBn} ${s.page}` : ''));
for (const c of credits) if (!/^https:\/\//.test(c.url ?? '')) fail(`the credit «${c.title}» has no https link`);
const extra = credits.map((c) => `<a href="${escape(c.url)}" target="_blank" rel="noopener noreferrer">${escape(`${c.title} (${c.by})`)}</a>`);
const info = {
  _about: `Built by tools/build-${ID}.mjs from the seed in ${path.relative(ROOT, SEED).replace(/\\/g, '/')}/; do not edit.`,
  lines: (() => {
    // The seed's lines, the cut cards' upstream lines after its own (R-55).
    const own = seed.infoBn.lines.map((l) => ({ text: l.textBn, group: l.group }));
    const after = seed.infoBn.lines.findLastIndex((l) => l.card) + 1;
    const cut = cutCards.map((k) => ({ text: `${rivers[k].nameBn}: ${words.upstreamInPart}`, group: 'notes' }));
    return [...seed.markers.filter((m) => m.infoBn).map((m) => ({ text: m.infoBn, group: 'notes' })), ...own.slice(0, after), ...cut, ...own.slice(after)];
  })(),
};

// ---- the marker icons: the diagram's glyphs on a pale disc ----------------------------------------

const GLYPH = {
  origin: '<path d="M0-7.5L7 5.5H-7Z" fill="#0b3d91" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>',
  entry: '<path d="M0-8.5L8.5 0 0 8.5-8.5 0Z" fill="#0b3d91" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>',
  confluence: '<circle r="6" fill="#ffffff" stroke="#0b3d91" stroke-width="3"/>',
  mouth: '<rect x="-6" y="-6" width="12" height="12" fill="#0b3d91" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>',
};
const icon = (kind) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-16 -16 32 32"><circle r="13" fill="#ffffff" fill-opacity="0.72"/>${GLYPH[kind]}</svg>\n`;
const kindsDrawn = [...new Set(Object.values(marks).map((m) => m.kind))];
for (const k of kindsDrawn) if (!GLYPH[k] || !ui.legendBn[k]) fail(`marker kind ${k} has no glyph or no legend word`);
const images = Object.fromEntries(kindsDrawn.map((k) => [k, { file: `./${k}.svg`, pixelRatio: 1 }]));

// ---- the descriptor ---------------------------------------------------------------------------------

const roles = [...new Set(Object.values(rivers).map((r) => r.role))];
for (const r of roles) if (!LINE[r] || !ui.legendBn[r]) fail(`role ${r} has no colour or no legend word`);
const byRole = (values, fallback) => ['match', ['get', 'role'], ...roles.flatMap((r) => [r, values[r]]), fallback];
const lit = (yes, no) => ['case', ['==', ['get', 'selected'], true], yes, no];
const ctx = (yes, no) => ['case', ['==', ['get', 'context'], true], yes, no];
const lineLayers = (source, dashed) => [
  // A white halo under every line, the selected one's lit.
  {
    id: `${source}-halo`,
    type: 'line',
    source,
    slot: 'belowLabels',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': lit(LIT, '#ffffff'), 'line-opacity': lit(1, ctx(0.35, 0.85)), 'line-width': lit(7.8, byRole({ main: 4.9, tributary: 3.9, distributary: 3.9, disputed: 3.9 }, 3.9)) },
  },
  {
    id: `${source}-line`,
    type: 'line',
    source,
    slot: 'belowLabels',
    layout: { 'line-join': 'round', 'line-cap': dashed ? 'butt' : 'round' },
    paint: { 'line-opacity': ctx(CONTEXT_LINE, 1), 'line-color': byRole(Object.fromEntries(roles.map((r) => [r, LINE[r].color])), '#a9b4c3'), 'line-width': byRole(Object.fromEntries(roles.map((r) => [r, LINE[r].width])), 2), ...(dashed ? { 'line-dasharray': [2, 1.35] } : {}) },
  },
];
// Select, then frame by the open tab: inside Bangladesh, or the whole course (the tabs module's fitTab).
const fitSelected = [{ action: 'select' }, { action: 'fitTab', clear: ['sheet'], duration: 1200 }];
views.bd.frame = bdRest;
// Where the map may pan: every drawn line, with room round it (half-degrees, outward) — but the map-only
// upstream reaches (Stage 4, 2026-10-05): «বাংলাদেশে» and the map keep their bounds; only «পুরো পথ» pans to them.
const all = bbox(Object.values(lines).filter((l) => l.spec?.only !== 'map').flatMap((l) => l.coords));
const maxBounds = [Math.floor((all[0] - 1.5) * 2) / 2, Math.floor((all[1] - 1.5) * 2) / 2, Math.ceil((all[2] + 1.5) * 2) / 2, Math.ceil((all[3] + 1.5) * 2) / 2];
// «পুরো পথ» pans wider (2026-10-05): MapLibre keeps the whole view inside the bounds, so on a phone held upright
// the map's own bounds held its rest frame to their height and cut the courses off at the sides. Its bounds
// hold the rest frame fitted to the width of a map up to TALL times as high as wide, outward to whole degrees.
const wholeBounds = tallBounds(views.whole.frame, TALL, maxBounds);
const rowFields = Object.fromEntries(ui.rowOrder.map((k) => [k, { type: 'text', verifiable: true }]));
const markRowFields = Object.fromEntries(ui.rowOrder.filter((k) => Object.values(marks).some((m) => k in m)).map((k) => [k, { type: 'text' }]));
const descriptor = {
  schema: 'geoquest/map-descriptor@1',
  id: ID,
  section: SECTION,
  title: { bn: seed.titleBn, en: `${seed.titleEn} (map)` },
  basemap: 'bangladesh-wide',
  view: { fitBounds: bdRest },
  constraints: { maxZoom: 11, maxBounds },
  // No text under 14 px on this map: the labels floored, the chrome's too (the user's rule for it, M3).
  minTextSize: 14,
  // The open card at most this share of the map's height, the frame in the room above it (R-55).
  sheetMaxHeight: SHEET_MAX,
  lookups: { systems: Object.fromEntries(seed.systems.filter((s) => order.some((k) => rivers[k].system === s.id)).map((s) => [s.id, { nameBn: s.nameBn }])) },
  images,
  records: {
    rivers: {
      file: './rivers.json',
      fields: {
        nameBn: { type: 'text', required: true },
        role: { type: 'text', required: true, display: false },
        system: { type: 'text', required: true, display: false },
        up: { type: 'text', display: false },
        solid: { type: 'boolean', display: false },
        dashed: { type: 'boolean', display: false },
        joined: { type: 'boolean', display: false },
        hasBd: { type: 'boolean', display: false },
        bdJoined: { type: 'boolean', display: false },
        ancestors: { type: 'refs', to: 'rivers', display: false },
        ancestorNames: { type: 'refs', to: 'names', display: false },
        frameBd: { type: 'bbox', display: false },
        frameWhole: { type: 'bbox', display: false },
        outsideSet: { type: 'boolean', display: false },
        restWhole: { type: 'boolean', display: false },
        dashedKind: { type: 'text', display: false },
        ...rowFields,
      },
    },
    marks: {
      file: './marks.json',
      fields: {
        nameBn: { type: 'text', required: true, display: false },
        titleBn: { type: 'text', required: true },
        kind: { type: 'text', required: true, display: false },
        river: { type: 'text', required: true, display: false },
        at: { type: 'point', required: true },
        inBd: { type: 'boolean', required: true, display: false },
        frameBd: { type: 'bbox', display: false },
        frameWhole: { type: 'bbox', display: false },
        outsideSet: { type: 'boolean', display: false },
        ...markRowFields,
      },
    },
    names: {
      file: './names.json',
      fields: {
        nameBn: { type: 'text', required: true },
        river: { type: 'text', required: true, display: false },
        role: { type: 'text', required: true, display: false },
        at: { type: 'point', required: true },
        inBd: { type: 'boolean', required: true, display: false },
      },
    },
    views: {
      file: './views.json',
      fields: {
        titleBn: { type: 'text', required: true },
        frame: { type: 'bbox', required: true },
        disabledBn: { type: 'text' },
      },
    },
    places: {
      file: './places.json',
      fields: {
        nameBn: { type: 'text', required: true },
        at: { type: 'point', required: true },
      },
    },
  },
  sources: {
    connectors: { records: 'rivers', geometry: './connectors.geojson', joinField: 'key', expectGeometry: { joined: true }, state: ['selected', { name: 'context', fromSelection: { records: 'rivers', listField: 'ancestors' } }], properties: ['role'] },
    'lines-out': { records: 'rivers', geometry: './lines-out.geojson', joinField: 'key', expectGeometry: { dashed: true }, state: ['selected', { name: 'context', fromSelection: { records: 'rivers', listField: 'ancestors' } }], properties: ['role'], tapWidth: 44, attribution: OSM_CREDIT },
    'lines-in': { records: 'rivers', geometry: './lines-in.geojson', joinField: 'key', expectGeometry: { solid: true }, state: ['selected', { name: 'context', fromSelection: { records: 'rivers', listField: 'ancestors' } }], properties: ['role'], tapWidth: 44, attribution: OSM_CREDIT },
    // «বাংলাদেশে»'s own lines and connectors: the pieces inside Bangladesh (R-55).
    'bd-connectors': { records: 'rivers', geometry: './bd-connectors.geojson', joinField: 'key', expectGeometry: { bdJoined: true }, state: ['selected', { name: 'context', fromSelection: { records: 'rivers', listField: 'ancestors' } }], properties: ['role'] },
    'bd-lines': { records: 'rivers', geometry: './bd-lines.geojson', joinField: 'key', expectGeometry: { hasBd: true }, state: ['selected', { name: 'context', fromSelection: { records: 'rivers', listField: 'ancestors' } }], properties: ['role'], tapWidth: 44, attribution: OSM_CREDIT },
    names: { records: 'names', geometryFrom: 'at', state: [{ name: 'context', fromSelection: { records: 'rivers', listField: 'ancestorNames' } }], properties: ['nameBn', 'role'] },
    places: { records: 'places', geometryFrom: 'at', properties: ['nameBn'] },
    marks: { records: 'marks', geometryFrom: 'at', state: ['selected'], properties: ['kind'], tapWidth: 44 },
  },
  layers: [
    ...lineLayers('connectors', false),
    ...lineLayers('lines-out', true),
    ...lineLayers('lines-in', false),
    ...lineLayers('bd-connectors', false),
    ...lineLayers('bd-lines', false),
    // A place's name on the water, at least 14 px; below the rivers' names, which are placed first.
    {
      id: 'place-names',
      type: 'symbol',
      source: 'places',
      slot: 'aboveLabels',
      layout: { 'text-field': ['get', 'nameBn'], 'text-font': ['Noto Sans Bengali'], 'text-size': 15 },
      paint: { 'text-color': WATER_NAME, 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    },
    {
      id: 'river-names',
      type: 'symbol',
      source: 'names',
      slot: 'aboveLabels',
      layout: {
        'text-field': ['get', 'nameBn'],
        'text-font': ['Noto Sans Bengali'],
        'text-size': 15,
        // Beside the line, never on it; the main rivers' names are placed first.
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': 0.6,
        'symbol-sort-key': byRole({ main: 0, tributary: 1, distributary: 1, disputed: 1 }, 2),
      },
      paint: { 'text-color': byRole(NAME_COLOR, '#0b3d91'), 'text-opacity': ctx(CONTEXT_NAME, 1), 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
    },
    // One layer per kind, each drawing its own glyph; the selected marker ringed as the diagram rings it.
    ...kindsDrawn.map((k) => ({
      id: `marker-${k}`,
      type: 'symbol',
      source: 'marks',
      slot: 'aboveLabels',
      filter: ['==', ['get', 'kind'], k],
      layout: { 'icon-image': k, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
    })),
    {
      id: 'marker-ring',
      type: 'circle',
      source: 'marks',
      slot: 'aboveLabels',
      filter: ['==', ['get', 'selected'], true],
      paint: { 'circle-radius': 13, 'circle-opacity': 0, 'circle-stroke-color': LIT, 'circle-stroke-width': 3 },
    },
  ],
  controls: [
    {
      type: 'picker',
      id: 'rivers',
      from: 'rivers',
      placeholder: ui.pickerPlaceholderBn,
      labelEn: 'Choose a river',
      label: { field: 'nameBn' },
      groupBy: { field: 'system', order: seed.systems.map((s) => s.id).filter((s) => order.some((k) => rivers[k].system === s)), lookup: 'systems', take: 'nameBn' },
      do: fitSelected,
    },
  ],
  interactions: [
    { on: 'click', target: 'source:lines-in', do: fitSelected },
    { on: 'click', target: 'source:lines-out', do: fitSelected },
    { on: 'click', target: 'source:bd-lines', do: fitSelected },
    { on: 'click', target: 'source:marks', do: [{ action: 'select' }] },
  ],
  sheets: {
    rivers: { title: { field: 'nameBn' }, rows: ui.rowOrder.map((k) => ({ label: ui.rowLabelsBn[k], field: k })) },
    marks: { title: { field: 'titleBn' }, rows: Object.keys(markRowFields).map((k) => ({ label: ui.rowLabelsBn[k], field: k })) },
  },
  // Two views of one map: «বাংলাদেশে» frames a selection's parts inside Bangladesh, «পুরো পথ» all of it,
  // and is disabled for a selection with no reach outside; the selection stays when the tab changes.
  tabs: {
    from: 'views',
    label: { field: 'titleBn' },
    frame: { field: 'frame' },
    views: {
      // «বাংলাদেশে» draws Bangladesh only: its own inside pieces, and no name, marker or river with none (R-55).
      bd: {
        selectionFrame: 'frameBd',
        hide: {
          sources: ['connectors', 'lines-out', 'lines-in'],
          records: [
            // …nor in its picker and ‹ › (2026-10-05): Bhagirathi and Barak have no piece inside.
            { records: 'rivers', field: 'hasBd', value: false, picker: true },
            { records: 'names', field: 'inBd', value: false },
            { records: 'marks', field: 'inBd', value: false },
          ],
        },
      },
      whole: { selectionFrame: 'frameWhole', enabledBy: 'outsideSet', disabledNote: { field: 'disabledBn' }, hide: { sources: ['bd-connectors', 'bd-lines'] }, maxBounds: wholeBounds },
    },
  },
  focus: { records: 'rivers', idle: { field: 'role', value: 'main' }, idleByTab: { whole: { field: 'restWhole', value: true } }, parent: 'up', also: [{ records: 'marks', field: 'river' }, { records: 'names', field: 'river' }] },
  legend: {
    // A dashed reach is listed only while a drawn river has one.
    items: [...roles.map((r) => ({ kind: r, label: ui.legendBn[r], line: { color: LINE[r].color, width: LINE[r].width } })), { kind: 'outside', label: words.outside, line: { color: LINE.main.color, width: LINE.main.width, dash: true } }, ...kindsDrawn.map((k) => ({ kind: k, label: ui.legendBn[k], image: k }))],
    // The dashed reach outside is drawn only in «পুরো পথ».
    kinds: [{ records: 'rivers', field: 'role' }, { records: 'rivers', field: 'dashedKind', tab: 'whole' }, { records: 'marks', field: 'kind' }],
  },
  info: { file: './info.json', headings: ui.creditGroupsBn },
  attribution: { extra },
};

// ---- write and report ---------------------------------------------------------------------------------

const feature = (key, line, coords) => ({ type: 'Feature', properties: { key, line }, geometry: { type: 'LineString', coordinates: coords } });
const files = {
  'descriptor.json': json(descriptor),
  'rivers.json': json(rivers),
  'marks.json': json(marks),
  'names.json': json(names),
  'places.json': json(places),
  'views.json': json(views),
  'info.json': json(info),
  'lines-in.geojson': geojson(pieces.filter((p) => !p.dashed).map((p) => feature(p.entity, p.line, p.coords))),
  'lines-out.geojson': geojson(pieces.filter((p) => p.dashed).map((p) => feature(p.entity, p.line, p.coords))),
  'connectors.geojson': geojson(connectors.map((c) => ({ ...feature(c.entity, c.line, c.coords), properties: { key: c.entity, line: c.line, parent: c.parent, m: c.m } }))),
  'bd-lines.geojson': geojson(bdPieces.map((p) => feature(p.entity, p.line, p.coords))),
  'bd-connectors.geojson': geojson(bdConnectors.map((c) => ({ ...feature(c.entity, c.line, c.coords), properties: { key: c.entity, line: c.line, parent: c.parent, m: c.m } }))),
  ...Object.fromEntries(kindsDrawn.map((k) => [`${k}.svg`, icon(k)])),
};
// Nothing the diagram alone draws reaches the map (the user's decision, 2026-09-30): no id of its cards,
// markers, lines or places, and none of its Bengali texts, anywhere in the map's files.
const diagramOnly = itemsOnly(wholeSeed, 'diagram');
const shippedIds = [...Object.keys(rivers), ...Object.keys(marks), ...Object.keys(names), ...Object.keys(places), ...pieces.map((q) => q.line), ...connectors.map((c) => c.line)];
const leaks = [...Object.values(files).flatMap((t) => [...diagramOnly.texts].filter((x) => t.includes(JSON.stringify(x)))), ...shippedIds.filter((k) => diagramOnly.ids.has(k))];
if (leaks.length) fail(`diagram-only content reaches the map: ${leaks.join(' | ')}`);
fs.mkdirSync(OUT, { recursive: true });
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), text);

const nPending = Object.values(rivers).reduce((n, r) => n + Object.values(r).filter((v) => v === null).length, 0);
if (nPending !== pending.length) fail(`the records hold ${nPending} nulls, the seed ${pending.length}`);
say(`${ID}: ${frame.lines.length} lines in ${pieces.length} pieces (${pieces.filter((p) => p.dashed).length} dashed), ${Object.keys(rivers).length} cards, ${Object.keys(marks).length} markers, ${Object.keys(names).length} names`);
say(`simplified: ${chainVertices} chain vertices → ${drawnVertices} drawn (Douglas–Peucker ${SIMPLIFY_M} m); worst chain vertex ${round(worstDeviation.m, 2)} m from the drawn line (${worstDeviation.line}; limit ${MAX_DEVIATION_M} m); worst drawn vertex ${round(worstOnChain, 3)} m off its chain (limit ${ON_CHAIN_M} m)`);
say(`main line crossings: drawn ${mainCrossings.drawn.length}, pinned chain ${mainCrossings.chain.length}${mainCrossings.chain.length ? ` (at ${mainCrossings.chain.map((q) => q.join(', ')).join('; ')})` : ''}`);
say(`connectors: ${connectors.map((c) => `${c.line} → ${c.parent} ${c.m} m`).join(', ') || 'none'} (from ${CONNECT_FROM_M} m to ${CONNECT_MAX_M / 1000} km)`);
say(`focus: ${Object.values(rivers).filter((r) => !r.up).length} roots (${Object.keys(rivers).filter((k) => !rivers[k].up).join(', ')}); ${Object.values(rivers).filter((r) => r.up && rivers[r.up]?.up).length} cards below a branch`);
say(`places: ${placeReport.join('; ') || 'none'}`);
say(`views: «পুরো পথ» rests on ${restWhole.join(', ')}, framed ${views.whole.frame.join(', ')}, pans within ${wholeBounds.join(', ')} (a map up to ${TALL} times as high as wide); disabled for ${disabledCards.length} cards (${disabledCards.join(', ')}); «বাংলাদেশে» pans within ${maxBounds.join(', ')}`);
say(`frames with a name: ${widened.length} «বাংলাদেশে» frames held no district's name and take in the nearest (${widened.join(', ') || 'none'})`);
say(`upstream: in part ${inPartCards.length} (${inPartCards.join(', ')}); reached or rising in Bangladesh ${reachedCards.length} (${reachedCards.join(', ')})`);
say(`cut rule (within ${CUT_TOL_M} m of a selection box's edge): ${cutReport.join('; ')}; cut: ${cutCards.join(', ') || 'none'}`);
say(`«বাংলাদেশে»: ${bdPieces.length} inside pieces (band ${BD_BAND_M} m, bits under ${BD_BIT_KM} km dropped: ${bits.join(', ') || 'none'}); the band keeps ${banded.size} lines' border reaches (${[...banded].join(', ')}); ${bdConnectors.length} of ${connectors.length} connectors; no inside piece: ${noInside.join(', ') || 'none'} (framed on Bangladesh: ${framedOnRest.join(', ') || 'none'}); rest frame ${bdRest.join(', ')}; the map-only upstream reaches left out: ${s4Left.join(', ')}`);
say(`hidden in «বাংলাদেশে»: ${Object.keys(names).filter((k) => !names[k].inBd).length} names, ${Object.keys(marks).filter((k) => !marks[k].inBd).length} markers`);
for (const k of ['main', 'teesta', 'rupsa']) say(`frames ${k}: in Bangladesh ${rivers[k].frameBd.join(', ')}; whole ${rivers[k].frameWhole.join(', ')}`);
say(`diagram-only: ${diagramOnly.ids.size} ids and ${diagramOnly.texts.size} texts held back, none shipped; map-only drawn: ${Object.keys(places).length} place(s), ${info.lines.length - seed.infoBn.lines.filter((l) => !l.only).length - seed.markers.filter((m) => m.infoBn).length} ⓘ line(s)`);
say(`pending: ${nPending}; ⓘ: ${extra.length} credits, ${info.lines.filter((l) => l.group === 'notes').length} notes, ${info.lines.filter((l) => l.group === 'conflicts').length} conflicts`);
say(`wrote ${path.relative(ROOT, OUT) || OUT}: ${Object.entries(files).map(([n, t]) => `${n} ${Buffer.byteLength(t)} B`).join(', ')}`);
