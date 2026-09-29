// Builds the Rivers of Bangladesh map — the MapLibre map of the diagram's seed —
// into its folder: the descriptor, the records, the lines as GeoJSON, the
// marker icons and ⓘ's lines.
//
//   node tools/build-bangladesh-rivers-map.mjs [out]      build (out: docs/maps/bangladesh-rivers-map)
//
// From the same seed and pinned files as the diagram, through the shared core
// (tools/lib/rivers-core.mjs), which holds the 68 geometry pins: every line is
// the pinned full-precision chain, split at COD-AB's border where the seed
// says so (dashed outside), cut at the Bangladesh basemap's box, and
// simplified by Douglas–Peucker to at most MAX_DEVIATION_M from the chain —
// checked here in metres, vertex by vertex, and every drawn vertex lies on the
// chain. A branch whose parent-side end misses its parent by more than
// CONNECT_FROM_M, up to CONNECT_MAX_M, gets a straight connector to the
// parent as the map draws it, as in the diagram. The Bangladesh view only (M2):
// the lines, markers and names of the seed's Bangladesh frame.
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
import { COVERAGE } from './bangladesh.config.mjs';
import { distM, nearestOnLine, clipLine } from './lib/rivers-frame.mjs';
import { CACHE } from './lib/geo.mjs';
import { riversCore, itemsOnly, SEED, MAP_PINS, CONNECT_FROM_M, CONNECT_MAX_M, UNJOINED_BY_DECISION } from './lib/rivers-core.mjs';

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

const { wholeSeed, seed, ui, G, lines, joinsParent, parentSideAtTail, borderPieces, markerSeed, outlineRings, labelTexts, pending, credit, cited } = riversCore({ id: ID, product: 'map' });
const frame = G.frames.bangladesh;
const entitySeed = Object.fromEntries(seed.entities.map((e) => [e.id, e]));


// ---- the lines: each piece cut at the box and simplified, in metres -----------------------------

const entityOf = (id) => (id === 'main' ? 'main' : lines[id].spec?.entity ?? fail(`line ${id} has no card`));
const box = COVERAGE;
const inBox = (p) => p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3];

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
    for (const cut of clipLine(piece.coords, box)) {
      const keep = keepIndices(cut, SIMPLIFY_M);
      const out = keep.map((i) => fix(cut[i]));
      // Every vertex of the chain within MAX_DEVIATION_M of the drawn line, measured on the drawn (rounded) segment.
      for (let k = 1; k < keep.length; k++)
        for (let i = keep[k - 1] + 1; i < keep[k]; i++) {
          const m = nearestOnLine(cut[i], [out[k - 1], out[k]]).m;
          if (m > worstDeviation.m) worstDeviation = { m, line: id };
        }
      // Every drawn vertex on the chain: a chain vertex, a border crossing or the box's cut, each on a chain segment.
      for (const v of out) worstOnChain = Math.max(worstOnChain, nearestOnLine(v, piece.coords).m);
      chainVertices += cut.length;
      drawnVertices += out.length;
      pieces.push({ line: id, entity: entityOf(id), dashed: !piece.inside, coords: out });
    }
  }
}
if (worstDeviation.m > MAX_DEVIATION_M) fail(`${worstDeviation.line}: a chain vertex lies ${round(worstDeviation.m, 2)} m from the drawn line (limit ${MAX_DEVIATION_M} m)`);
if (worstOnChain > ON_CHAIN_M) fail(`a drawn vertex lies ${round(worstOnChain, 2)} m off its chain (limit ${ON_CHAIN_M} m)`);
for (const id of frame.lines) if (!pieces.some((p) => p.line === id)) fail(`${id} has nothing inside the basemap's box`);

// ---- the connectors: from a branch's parent-side end to its parent as the map draws it -----------

const drawnOf = (id) => pieces.filter((p) => p.line === id).map((p) => p.coords);
const connectors = [];
for (const id of frame.lines) {
  const l = lines[id];
  if (!joinsParent(l)) continue;
  const parent = l.spec.join?.parent ?? 'main';
  if (!frame.lines.includes(parent) || UNJOINED_BY_DECISION.has(id)) continue;
  const end = parentSideAtTail(l) ? l.coords.at(-1) : l.coords[0];
  if (!inBox(end)) {
    if (l.spec.exempt) continue;
    fail(`${id}'s parent-side end is outside the basemap's box`);
  }
  let best = null;
  for (const c of drawnOf(parent)) {
    const n = nearestOnLine(end, c);
    if (!best || n.m < best.m) best = n;
  }
  const m = distM(end, best.pt);
  if (m > CONNECT_FROM_M && m <= CONNECT_MAX_M) connectors.push({ line: id, entity: entityOf(id), parent, m: Math.round(m), coords: [fix(end), fix(best.pt)] });
}

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
  // The rows, in ui.rowOrder: a null stays null (unverified, hidden, pending); a row the card lacks stays absent.
  for (const k of ui.rowOrder) if (k in e.values) row[k] = e.values[k];
  for (const k of Object.keys(e.values)) if (!ui.rowOrder.includes(k)) fail(`${eid} has a row ${k} that ui.rowOrder does not place`);
  rivers[eid] = row;
}
const marks = {};
for (const mid of frame.markers) {
  const m = markerSeed[mid] ?? fail(`the seed has no marker ${mid}`);
  if (!(m.entity in rivers)) fail(`marker ${mid}'s card ${m.entity} is not on the map`);
  if (!inBox(m.lonLat)) fail(`marker ${mid} is outside the basemap's box`);
  // The card's heading, as the diagram composes it: the marker's name — its kind.
  marks[mid] = { nameBn: m.nameBn, titleBn: `${m.nameBn} — ${ui.legendBn[m.kind]}`, kind: m.kind, river: m.entity, at: m.lonLat, [m.row]: m.valueBn };
}
const names = {};
for (const lab of frame.labels) {
  const l = lines[lab.line] ?? fail(`name ${lab.id} names no line ${lab.line}`);
  const text = labelTexts[lab.id] ?? fail(`name ${lab.id} has no text in the seed`);
  // On the line as the map draws it, nearest the seed's hint.
  let best = null;
  for (const c of drawnOf(lab.line)) {
    const n = nearestOnLine(lab.near, c);
    if (!best || n.m < best.m) best = n;
  }
  const eid = entityOf(lab.line);
  names[lab.id] = { nameBn: text, river: eid, role: l.role, at: fix(best.pt) };
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

// ---- the map's own places: a name on the water where a cited book gives one --------------------------
// Each is a Natural Earth feature, by its ne_id in a file pinned in tools/sources.json, its geometry pinned in
// MAP_PINS' `places`; its name stands at the point inside it farthest from its shore.
const sourcesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/sources.json'), 'utf8'));
const mapPins = fs.existsSync(MAP_PINS) ? JSON.parse(fs.readFileSync(MAP_PINS, 'utf8')) : {};
const pinnedNe = (name) => {
  const pin = sourcesJson.naturalEarth.files[name] ?? fail(`tools/sources.json pins no ${name}`);
  const buf = fs.readFileSync(path.join(CACHE, name));
  const blob = crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
  if (buf.length !== pin.size || blob !== pin.gitBlobSha1) fail(`${name} is not the pinned file (${buf.length} bytes, blob ${blob.slice(0, 8)}…)`);
  return JSON.parse(buf.toString('utf8'));
};
const hashGeometry = (coords) => crypto.createHash('sha256').update(JSON.stringify(coords)).digest('hex').slice(0, 16);
const inRing = (p, ring) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (ring[i][1] > p[1] !== ring[j][1] > p[1] && p[0] < ((ring[j][0] - ring[i][0]) * (p[1] - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) hit = !hit;
  return hit;
};
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
  if (!best || !inBox(best.p)) fail(`place ${pl.id}: no point inside it for its name`);
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
  lines: [...seed.markers.filter((m) => m.infoBn).map((m) => ({ text: m.infoBn, group: 'notes' })), ...seed.infoBn.lines.map((l) => ({ text: l.textBn, group: l.group }))],
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
const fitSelected = [{ action: 'select' }, { action: 'fitBounds', clear: ['sheet'], duration: 1200 }];
const outline = outlineRings.flat();
const view = outline.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const rowFields = Object.fromEntries(ui.rowOrder.map((k) => [k, { type: 'text', verifiable: true }]));
const markRowFields = Object.fromEntries(ui.rowOrder.filter((k) => Object.values(marks).some((m) => k in m)).map((k) => [k, { type: 'text' }]));
const descriptor = {
  schema: 'geoquest/map-descriptor@1',
  id: ID,
  section: SECTION,
  title: { bn: seed.titleBn, en: `${seed.titleEn} (map)` },
  basemap: 'bangladesh-wide',
  view: { fitBounds: [Math.floor(view[0] * 20) / 20, Math.floor(view[1] * 20) / 20, Math.ceil(view[2] * 20) / 20, Math.ceil(view[3] * 20) / 20] },
  constraints: { maxZoom: 11 },
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
        ancestors: { type: 'refs', to: 'rivers', display: false },
        ancestorNames: { type: 'refs', to: 'names', display: false },
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
    names: { records: 'names', geometryFrom: 'at', state: [{ name: 'context', fromSelection: { records: 'rivers', listField: 'ancestorNames' } }], properties: ['nameBn', 'role'] },
    places: { records: 'places', geometryFrom: 'at', properties: ['nameBn'] },
    marks: { records: 'marks', geometryFrom: 'at', state: ['selected'], properties: ['kind'], tapWidth: 44 },
  },
  layers: [
    ...lineLayers('connectors', false),
    ...lineLayers('lines-out', true),
    ...lineLayers('lines-in', false),
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
    { on: 'click', target: 'source:marks', do: [{ action: 'select' }] },
  ],
  sheets: {
    rivers: { title: { field: 'nameBn' }, rows: ui.rowOrder.map((k) => ({ label: ui.rowLabelsBn[k], field: k })) },
    marks: { title: { field: 'titleBn' }, rows: Object.keys(markRowFields).map((k) => ({ label: ui.rowLabelsBn[k], field: k })) },
  },
  focus: { records: 'rivers', idle: { field: 'role', value: 'main' }, parent: 'up', also: [{ records: 'marks', field: 'river' }, { records: 'names', field: 'river' }] },
  legend: {
    items: [...roles.map((r) => ({ kind: r, label: ui.legendBn[r], line: { color: LINE[r].color, width: LINE[r].width } })), ...kindsDrawn.map((k) => ({ kind: k, label: ui.legendBn[k], image: k }))],
    kinds: [{ records: 'rivers', field: 'role' }, { records: 'marks', field: 'kind' }],
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
  'info.json': json(info),
  'lines-in.geojson': geojson(pieces.filter((p) => !p.dashed).map((p) => feature(p.entity, p.line, p.coords))),
  'lines-out.geojson': geojson(pieces.filter((p) => p.dashed).map((p) => feature(p.entity, p.line, p.coords))),
  'connectors.geojson': geojson(connectors.map((c) => ({ ...feature(c.entity, c.line, c.coords), properties: { key: c.entity, line: c.line, parent: c.parent, m: c.m } }))),
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
say(`connectors: ${connectors.map((c) => `${c.line} → ${c.parent} ${c.m} m`).join(', ') || 'none'} (from ${CONNECT_FROM_M} m to ${CONNECT_MAX_M / 1000} km)`);
say(`focus: ${Object.values(rivers).filter((r) => !r.up).length} roots (${Object.keys(rivers).filter((k) => !rivers[k].up).join(', ')}); ${Object.values(rivers).filter((r) => r.up && rivers[r.up]?.up).length} cards below a branch`);
say(`places: ${placeReport.join('; ') || 'none'}`);
say(`diagram-only: ${diagramOnly.ids.size} ids and ${diagramOnly.texts.size} texts held back, none shipped; map-only drawn: ${Object.keys(places).length} place(s), ${info.lines.length - seed.infoBn.lines.filter((l) => !l.only).length - seed.markers.filter((m) => m.infoBn).length} ⓘ line(s)`);
say(`pending: ${nPending}; ⓘ: ${extra.length} credits, ${info.lines.filter((l) => l.group === 'notes').length} notes, ${info.lines.filter((l) => l.group === 'conflicts').length} conflicts`);
say(`wrote ${path.relative(ROOT, OUT) || OUT}: ${Object.entries(files).map(([n, t]) => `${n} ${Buffer.byteLength(t)} B`).join(', ')}`);
