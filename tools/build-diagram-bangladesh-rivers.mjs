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
import fs from 'node:fs';
import path from 'node:path';
import { bangladeshLineClass } from './lib/geo.mjs';
import { projection, distM, nearestOnLine, lengthKm, fractionAlong, simplify, simplifyRing, clipRing, clipLine, pathData } from './lib/rivers-frame.mjs';
import { riversCore, itemsOnly, SEED, CONNECT_FROM_M, CONNECT_MAX_M, UNJOINED_BY_DECISION, JOIN_M } from './lib/rivers-core.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where the diagram goes. Change here if it moves. The seed and the pins are named in tools/lib/rivers-core.mjs.
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
// A district name's anchor is scored by its distance to its river (km) plus 2 for every km it comes within BUSY_KM of a marker or a river's name.
const BUSY_KM = 30;

const PRINT_PINS = process.argv.includes('--print-pins');
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? DEFAULT_OUT);
const fail = (msg) => {
  throw new Error(`${ID}: ${msg}`);
};
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const json = (v) => JSON.stringify(v, null, 2) + '\n';
const say = (s) => console.log(s);

// The seed, the pinned inputs, the chains, the pins, the border split, the checks that need no
// picture and the words: tools/lib/rivers-core.mjs, shared with the map build.
const {
  seed, ui, G, neLand, neBoundaries, admin2, countries, wayFrom, usedWays, neChain, seam, seamGapM, osmMain, lines,
  junction, mainToPadma, mainJoins, joinsParent, parentSideAtTail, basinOf, drawnHashes, outline, ringBox, polygonsOf,
  indexed, inside, outlineRings, distToRings, mainPieces, borderPieces, upazilaChecks, markerSeed, sundarganj, entrySeed,
  crossing, entryToBorder, bwdbToBorder, dewanganj, cited, pending, entities, markers, systems, picker, pickerGroups,
  labelTexts, credit, wholeSeed,
} = riversCore({ id: ID, product: 'diagram', printPins: PRINT_PINS });

// ---- the frames --------------------------------------------------------------------------------

const roleRank = { continuation: 0, distributary: 1, disputed: 1.5, tributary: 2, main: 3 };
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
      const basin = basinOf(id);
      return { id, role: l.role, system: spec.system, ...(card ? { entity: card } : {}), ...(basin ? { basin } : {}), pieces, ...trace };
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
    if (!joinsParent(l)) continue;
    const parent = l.spec.join?.parent ?? 'main';
    if (!spec.lines.includes(parent)) continue;
    // Unjoined by the user's decision though nearer than 12 km: no connector.
    if (UNJOINED_BY_DECISION.has(id)) continue;
    const end = P.project(...(parentSideAtTail(l) ? l.coords.at(-1) : l.coords[0]));
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

for (const f of Object.values(frames)) for (const l of f.file.labels) if (!(l.id in labelTexts)) fail(`label ${l.id} has no text in the seed`);

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

// Nothing the map alone draws reaches the diagram (the user's decision, 2026-09-30): no id of its cards,
// markers, lines or places, and none of its Bengali texts, anywhere in the four files.
const mapOnly = itemsOnly(wholeSeed, 'map');
const shipped = [];
const gather = (v) => (typeof v === 'string' ? shipped.push(v) : v && typeof v === 'object' ? Object.values(v).forEach(gather) : null);
gather(files);
const shippedIds = [...Object.keys(data.entities), ...Object.keys(data.markers), ...Object.values(frames).flatMap((f) => [...f.file.lines.map((l) => l.id), ...f.file.markers.map((m) => m.id), ...f.file.labels.map((l) => l.id)])];
const leaks = [...shipped.filter((t) => mapOnly.texts.has(t)), ...shippedIds.filter((k) => mapOnly.ids.has(k))];
if (leaks.length) fail(`map-only content reaches the diagram: ${leaks.join(' | ')}`);
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
say(`map-only: ${mapOnly.ids.size} ids and ${mapOnly.texts.size} texts held back, none shipped`);
say(`wrote ${path.relative(ROOT, OUT) || OUT}: ${Object.entries(sizes).map(([n, b]) => `${n} ${b} B`).join(', ')}; data ${sizes['data.json'] + sizes['frame-whole.json'] + sizes['frame-bangladesh.json']} B`);
