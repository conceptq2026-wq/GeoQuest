// Checks the built files before they are committed: the archive reads back
// with the official pmtiles reader, sample tiles exist where maps need them,
// land rings are wound the way vector tiles expect, and vendored libraries
// are byte-identical to the pinned npm packages.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PMTiles } from 'pmtiles';
import { DETAIL_AREAS } from './world.config.mjs';
import { sourcesAt, scan, SURFACE, librarySurface, scanBuildTool } from './outbound.mjs';
import { assetVersion, codeFiles, references } from './lib/asset-version.mjs';
import { CACHE, zipEntry } from './lib/geo.mjs';
import { projection, distM, nearestOnLine, parsePath } from './lib/rivers-frame.mjs';
import { loadRiversSeed } from './lib/rivers-seed.mjs';
import { seedFor } from './lib/rivers-core.mjs';
import { sourceText } from './lib/html-text.mjs';

const require = createRequire(import.meta.url);
const vtRequire = createRequire(require.resolve('vt-pbf'));
const { VectorTile } = vtRequire('@mapbox/vector-tile');
const Pbf = vtRequire('pbf');

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The served tree — everything GitHub Pages publishes, and nothing else.
// Change here if it moves.
const SERVED = path.join(ROOT, 'docs');
// The straits map's folder inside the served tree. Change here if the map moves.
const STRAITS_DIR = path.join(SERVED, 'international/straits');
// Data kept out of the served tree because no map draws it.
const DATA_SOURCES = path.join(ROOT, 'data-sources');
// The Rivers of Bangladesh diagram: the built files, the seed, the build tool and its geometry pins. Change here if they move.
const RIVERS_DIR = path.join(SERVED, 'diagrams/bangladesh-rivers');
const RIVERS_SEED = path.join(DATA_SOURCES, 'bangladesh-rivers');
const RIVERS_BUILD = path.join(HERE, 'build-diagram-bangladesh-rivers.mjs');
const RIVERS_PINS = path.join(HERE, 'bangladesh-rivers-pins.json');
// The same seed on the map shell, and the build that makes it.
const RIVERS_MAP_DIR = path.join(SERVED, 'maps/bangladesh-rivers-map');
const RIVERS_MAP_BUILD = path.join(HERE, 'build-bangladesh-rivers-map.mjs');
const readJ = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
// The vendored browser libraries, one folder per library and version.
const VENDOR_DIR = path.join(SERVED, 'shared/vendor');
// Build tools, which make no network call at all — maps' and diagrams' alike:
// tools/build-*.mjs. Only tools/fetch-sources.mjs downloads, into tools/.cache/,
// and the extract tools fetch when re-run on purpose. Change here if they are
// named otherwise.
const BUILD_TOOL = /^build-.*\.mjs$/;
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures++;
};

// ---- world.pmtiles ----
class FileSource {
  constructor(file) { this.buf = fs.readFileSync(file); }
  getKey() { return 'world'; }
  async getBytes(offset, length) {
    return { data: this.buf.buffer.slice(this.buf.byteOffset + offset, this.buf.byteOffset + offset + length) };
  }
}
const archive = new PMTiles(new FileSource(path.join(SERVED, 'shared/tiles/world.pmtiles')));
const header = await archive.getHeader();
check(header.specVersion === 3 && header.tileType === 1, `world.pmtiles is PMTiles v3 / MVT (z${header.minZoom}–${header.maxZoom})`);

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
async function tileAt(lon, lat, z) {
  const t = await archive.getZxy(z, lon2x(lon, z), lat2y(lat, z));
  return t && new VectorTile(new Pbf(new Uint8Array(t.data)));
}

const hormuz = await tileAt(56.35, 26.55, 6);
check(hormuz && hormuz.layers.land && hormuz.layers.country_labels, 'world tile at Hormuz z6 has land and country labels');

for (const [name, [w, s, e, n]] of Object.entries(DETAIL_AREAS)) {
  const t = await tileAt((w + e) / 2, (s + n) / 2, 10);
  check(t && t.layers.detail_extent, `detail tile exists at z10 in ${name}`);
}

// Outer rings must be clockwise on screen (tile y points down), which is a
// positive area with this formula — see lib/geo.mjs.
// Checking the largest ring in a tile is enough to catch an unwound build.
const ringArea = (ring) => {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y);
  return s / 2;
};
let outerOk = true;
for (let i = 0; i < hormuz.layers.land.length; i++) {
  const rings = hormuz.layers.land.feature(i).loadGeometry();
  const biggest = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
  if (ringArea(biggest) < 0) outerOk = false;
}
check(outerOk, 'land outer rings are wound correctly (land will not render as sea)');

// ---- cache-busting ----
// Every script and stylesheet the shells load carries the current version of
// their code (tools/lib/asset-version.mjs), so a phone or the app's WebView
// never keeps an old one after a push; tools/stamp-assets.mjs writes it.
{
  const version = assetVersion(SERVED);
  const stale = [];
  let count = 0;
  for (const file of codeFiles(SERVED))
    for (const r of references(file, fs.readFileSync(file, 'utf8'))) {
      count++;
      const where = `${path.relative(SERVED, file).split(path.sep).join('/')}: ${r.ref}`;
      if (r.v !== version) stale.push(`${where} ?v=${r.v ?? '(none)'}`);
      if (!fs.existsSync(path.resolve(path.dirname(file), r.ref))) stale.push(`${where} (no such file)`);
    }
  check(count > 0 && stale.length === 0, `every shell script and stylesheet reference carries the current version, ?v=${version} (${count}); run node tools/stamp-assets.mjs after a shell change${stale.length ? ` — not ${stale.slice(0, 5).join('; ')}` : ''}`);
}

// ---- bangladesh.pmtiles ----
// The shell's baseline reads these layers and fields from whichever archive a
// map names, so a regional archive must carry them exactly as world.pmtiles does.
{
  const bd = new PMTiles(new FileSource(path.join(SERVED, 'shared/tiles/bangladesh.pmtiles')));
  const h = await bd.getHeader();
  check(h.specVersion === 3 && h.tileType === 1, `bangladesh.pmtiles is PMTiles v3 / MVT (z${h.minZoom}–${h.maxZoom})`);
  const meta = (await bd.getMetadata()).geoquest ?? {};
  const box = (b) => Array.isArray(b) && b.length === 4 && b[0] < b[2] && b[1] < b[3];
  check(box(meta.frame) && box(meta.maxBounds) && meta.frame.every((v, i) => (i < 2 ? v >= meta.maxBounds[i] : v <= meta.maxBounds[i])), 'bangladesh.pmtiles metadata carries a frame inside its maxBounds');
  const tile = async (lon, lat, z) => {
    const t = await bd.getZxy(z, lon2x(lon, z), lat2y(lat, z));
    return t && new VectorTile(new Pbf(new Uint8Array(t.data)));
  };
  const overview = await tile(90.4, 23.8, 6);
  const fieldsOf = (layer) => (layer ? new Set(Object.keys(layer.feature(0).properties)) : new Set());
  const labels = fieldsOf((await tile(90.4, 23.8, 4))?.layers.country_labels);
  check(['name_bn', 'name_en', 'adm0_a3', 'min_zoom'].every((k) => labels.has(k)), 'bangladesh z4 country_labels carry name_bn, name_en, adm0_a3, min_zoom');
  check(['land', 'lakes', 'borders'].every((k) => overview?.layers[k]), 'bangladesh z6 tile has land, lakes and borders');
  const dhaka = await tile(90.41, 23.81, 10);
  check(dhaka && ['detail_extent', 'land', 'admin', 'admin_labels', 'rivers'].every((k) => dhaka.layers[k]), 'bangladesh z10 tile at Dhaka has detail_extent, land, admin, admin_labels, rivers');
  const rakhine = await tile(93.5, 20.0, 6);
  // Its tile reaches Cox's Bazar: whatever lines and names it holds are Bangladesh's.
  const own = (layer) => !layer || Array.from({ length: layer.length }, (_, i) => layer.feature(i).properties.bd).every((v) => v === true);
  check(rakhine?.layers.land && own(rakhine.layers.admin_labels) && own(rakhine.layers.admin), "bangladesh z6 tile at Rakhine has land, and no line or name but Bangladesh's: Bangladesh maps show Bangladesh only");
  let wound = true;
  for (let i = 0; i < dhaka.layers.land.length; i++) {
    const rings = dhaka.layers.land.feature(i).loadGeometry();
    if (ringArea(rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a))) < 0) wound = false;
  }
  check(wound, 'bangladesh land outer rings are wound correctly');
  // Bangladesh's own border is the government's line (COD-AB), in both tile sets.
  const classes = (t) => new Set(t?.layers.borders ? Array.from({ length: t.layers.borders.length }, (_, i) => t.layers.borders.feature(i).properties.class) : []);
  const rajshahi = await tile(88.6, 24.35, 9);
  check(classes(rajshahi).has('Bangladesh land border (BBS, COD-AB v03)') && classes(overview).has('Bangladesh land border (BBS, COD-AB v03)'), "bangladesh borders carry Bangladesh's land border from COD-AB, at z6 and at z9 on the Padma");
  // The main channel's two display names, and no unit label without a Bengali name.
  const riverLabels = [];
  const unitLabels = [];
  const notBangladesh = new Set(); // a layer that ships a feature of a neighbour's
  for (let x = lon2x(85.5, 6); x <= lon2x(95.3, 6); x++)
    for (let y = lat2y(27.6, 6); y <= lat2y(17.0, 6); y++) {
      const t = await bd.getZxy(6, x, y);
      if (!t) continue;
      const v = new VectorTile(new Pbf(new Uint8Array(t.data)));
      for (let i = 0; i < (v.layers.river_labels?.length ?? 0); i++) riverLabels.push(v.layers.river_labels.feature(i).properties.name_bn);
      for (let i = 0; i < (v.layers.admin_labels?.length ?? 0); i++) unitLabels.push(v.layers.admin_labels.feature(i).properties);
      for (const layer of ['admin', 'admin_labels', 'borders', 'rivers']) for (let i = 0; i < (v.layers[layer]?.length ?? 0); i++) if (v.layers[layer].feature(i).properties.bd !== true) notBangladesh.add(layer);
    }
  check(JSON.stringify(riverLabels.sort()) === JSON.stringify(['ব্রহ্মপুত্র', 'যমুনা'].sort()), `bangladesh z6 river_labels are the main channel's two names (${riverLabels.join(', ')})`);
  check(unitLabels.length > 0 && unitLabels.every((p) => p.name_bn), `every bangladesh unit label has a Bengali name (${unitLabels.length} at z6)`);
  // Bangladesh maps show Bangladesh only (2026-09-28): the lines, names and rivers are all its own.
  check(notBangladesh.size === 0, `every bangladesh z6 line, unit name and river is Bangladesh's own (bd)${notBangladesh.size ? ` — not in ${[...notBangladesh].join(', ')}` : ''}`);
}

// ---- bangladesh-rivers ----
// The picture is drawn in code from a seed and pinned sources: every marker
// and line is held to the source it came from (the user's checks a–f,
// 2026-09-29). The frames are the drawn truth; the pinned sources are the
// reference; the build is re-run to a temp folder and must equal the files
// committed under docs/.
{
  const S = loadRiversSeed(RIVERS_SEED).seed;
  const G = S.geometry;
  // The diagram's own lines: the seed less the map's (only: "map", Stage 4's upstream reaches), as its build reads it.
  const GD = seedFor(S, 'diagram').geometry;
  const riversSources = readJ(path.join(HERE, 'sources.json'));
  const frames = {
    whole: readJ(path.join(RIVERS_DIR, 'frame-whole.json')),
    bangladesh: readJ(path.join(RIVERS_DIR, 'frame-bangladesh.json')),
  };
  const proj = Object.fromEntries(Object.entries(frames).map(([k, f]) => [k, projection(f.projection)]));
  const M_PER_U = (k) => 111194.93 / frames[k].projection.scale; // one u on the ground, north–south
  const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
  const pinned = (file, want) => {
    const buf = fs.readFileSync(file);
    if (sha256(buf) !== want) throw new Error(`${path.basename(file)} is not the pinned file (sha256 ${sha256(buf).slice(0, 12)}…, pinned ${want.slice(0, 12)}…)`);
    return buf;
  };
  // A drawn line, as [lon, lat] points in order, from the pieces of its path data.
  const lineOf = (k, id) => {
    const l = frames[k].lines.find((x) => x.id === id);
    return l ? l.pieces.map((p) => parsePath(p.d).flat().map(([x, y]) => proj[k].invert(x, y))) : null;
  };
  const xyOf = (k, id) => frames[k].lines.find((x) => x.id === id).pieces.map((p) => parsePath(p.d).flat());

  // The pinned sources.
  const systemPins = Object.keys(G.files.osmSystems ?? {}).map((name) => riversSources[`osmBangladeshRivers${name.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('')}`]);
  const osmFiles = [riversSources.osmBangladeshRivers, riversSources.osmBangladeshRiversPilot, ...systemPins].map((e) => JSON.parse(pinned(path.join(ROOT, e.file), e.sha256).toString('utf8')));
  const osmWays = new Map(); // the pilot extract, which carries node ids, wins where a way is in both
  for (const f of osmFiles.flatMap((o) => o.features)) osmWays.set(f.properties.osm_id, f);
  const neEntry = riversSources.naturalEarth.files['ne_10m_rivers_lake_centerlines.geojson'];
  const ne = JSON.parse(pinned(path.join(CACHE, 'ne_10m_rivers_lake_centerlines.geojson'), neEntry.sha256).toString('utf8'));
  const codab = riversSources.codAbBangladesh;
  const admin0 = zipEntry(pinned(path.join(CACHE, codab.file), codab.sha256), 'bgd_admin0.geojson');
  const bdRings = admin0.features[0].geometry.coordinates.flat();
  check(osmWays.size > 0 && ne.features.length > 0 && bdRings.length > 0, `the pinned sources read back by their checksums: ${osmWays.size} OpenStreetMap ways, ${ne.features.length} Natural Earth rivers, COD-AB's ${bdRings.length} border rings`);

  // 7a — every marker: its source coordinate, projected by the picture's own projection, is where it is drawn.
  const seedMarker = Object.fromEntries(S.markers.map((m) => [m.id, m]));
  const worst = { px: 0, m: 0 };
  let drawnMarkers = 0;
  for (const [k, f] of Object.entries(frames))
    for (const m of f.markers) {
      const src = seedMarker[m.id];
      const [x, y] = proj[k].project(...src.lonLat);
      const px = Math.max(Math.abs(x - m.x), Math.abs(y - m.y));
      const gm = distM(proj[k].invert(m.x, m.y), src.lonLat);
      const same = m.lonLat[0] === src.lonLat[0] && m.lonLat[1] === src.lonLat[1];
      check(same && px <= 1 && gm <= 500, `a. ${k}: ${m.id} is drawn ${round(px, 2)} px and ${round(gm)} m from its source coordinate (${src.lonLat.join(', ')})`);
      worst.px = Math.max(worst.px, px);
      worst.m = Math.max(worst.m, gm);
      drawnMarkers++;
    }

  // 7b — every tributary and distributary: its parent-side end (a tributary's mouth, a distributary's head)
  // within 50 m of its parent line as drawn, or of a connector of at most 12 km that runs from that end to
  // the parent line; a line with neither is exempt, and the seed says why. The unjoined lines are the user's
  // decisions (2026-09-29): the Jamuna's three, and the Padma system's two over 12 km.
  const EXEMPT = ['karatoya', 'atrai', 'banshi', 'madhumati', 'mahananda', 'karnaphuli', 'kasalong', 'mathabhanga', 'bhairab', 'nabaganga2', 'nabaganga3', 'chitra2', 'tangon', 'sangu2', 'tetuliaBarishal', 'burishwar', 'mogra2', 'harinbhanga'];
  // Unjoined though nearer than 12 km, by the user's decision: the Harinbhanga (decision 5 after Stage 3 —
  // BWDB has it rise from the Raimangal, which is not drawn; the Ichamati is 8.3 km off).
  const UNJOINED_BY_DECISION = new Set(['harinbhanga']);
  const NEAR_M = 50;
  // 10 km, then 12 km for the Dhaleshwari alone, then 12 km for every line (Stage 1, 2026-09-29).
  const CONNECTOR_MAX_M = 12000;
  const maxFor = () => CONNECTOR_MAX_M;
  // A branch: a tributary, a distributary, a river whose role the books dispute, or a main river's later piece.
  const branches = Object.entries(GD.lines).filter(([, l]) => ['tributary', 'distributary', 'disputed'].includes(l.role) || (l.role === 'main' && l.join?.parent));
  const connectors = frames.bangladesh.connectors ?? [];
  const connectorOf = new Map();
  for (const c of connectors) {
    const pts = parsePath(c.d).flat().map(([x, y]) => proj.bangladesh.invert(x, y));
    const len = distM(pts[0], pts.at(-1));
    check(pts.length === 2 && len <= maxFor(c.id) && Math.abs(len - c.m) <= 1 && branches.some(([id]) => id === c.id) && !connectorOf.has(c.id), `b. connector ${c.id} → ${c.parent}: one straight segment, ${round(len)} m (it records ${c.m} m; limit ${maxFor(c.id) / 1000} km)`);
    connectorOf.set(c.id, { ...c, pts });
  }
  check((frames.whole.connectors ?? []).length === 0, 'b. the whole-course frame draws no branch, so no connector');
  const viaConnector = [];
  const exempt = [];
  const alone = [];
  for (const [id, spec] of branches) {
    const pieces = lineOf('bangladesh', id);
    const atTail = spec.join?.end ? spec.join.end === 'tail' : spec.role === 'tributary';
    const end = atTail ? pieces.at(-1).at(-1) : pieces[0][0];
    const parentId = spec.join?.parent ?? 'main';
    const parent = lineOf('bangladesh', parentId).flat();
    const toParent = nearestOnLine(end, parent).m;
    const con = connectorOf.get(id);
    if (spec.join?.point || spec.join?.node !== undefined) {
      const j = spec.join;
      const w = j.node !== undefined ? spec.ways.map((x) => osmWays.get(x)).find((x) => x?.properties.nodes?.includes(j.node)) : osmWays.get(j.way);
      const p = w && (j.node !== undefined ? w.geometry.coordinates[w.properties.nodes.indexOf(j.node)] : w.geometry.coordinates[j.vertex]);
      check(Boolean(p) && spec.ways.includes(w.properties.osm_id) && (!j.point || distM(p, j.point) <= 2), `b. ${id}: the recorded join point is ${j.node !== undefined ? `node ${j.node}` : `vertex ${j.vertex}`} of way ${w?.properties.osm_id}, one of the line's own ways${j.point ? ', within 2 m of the point' : ''}`);
    }
    if (toParent <= NEAR_M) {
      check(!con, `b. ${id}: its end is ${round(toParent)} m from the ${parentId} line (limit ${NEAR_M} m), with no connector`);
      alone.push(`${id} ${round(toParent)} m`);
    } else if (con) {
      const startGap = distM(con.pts[0], end);
      const footGap = nearestOnLine(con.pts.at(-1), parent).m;
      check(con.parent === parentId && startGap <= NEAR_M && footGap <= NEAR_M, `b. ${id}: its end is ${round(toParent)} m from the ${parentId} line; its connector starts ${round(startGap)} m from that end and ends ${round(footGap)} m from the line (limit ${NEAR_M} m each)`);
      viaConnector.push(`${id} ${round(con.m / 1000, 2)} km`);
    } else {
      check(typeof spec.exempt === 'string' && spec.exempt.length > 20 && (toParent > maxFor(id) || UNJOINED_BY_DECISION.has(id)), `b. ${id}: no connector — its end is ${round(toParent / 1000, 1)} km from the ${parentId} line, ${UNJOINED_BY_DECISION.has(id) ? "unjoined by the user's decision" : `over ${maxFor(id) / 1000} km`} — and the seed says why it has no join point`);
      exempt.push(id);
    }
  }
  check(JSON.stringify([...exempt].sort()) === JSON.stringify([...EXEMPT].sort()), `b. the lines left unjoined are exactly ${EXEMPT.join(', ')} (the user's decisions, 2026-09-29): ${exempt.join(', ')}`);
  console.log(`     connectors: ${connectors.map((c) => `${c.id} → ${c.parent} ${c.m} m`).join(', ') || 'none'}`);

  // 7c — the border-entry marker lies on Bangladesh's border; so does BWDB's entry point, from which it was snapped.
  const entry = seedMarker.entry;
  const entrySrc = Math.min(...bdRings.map((r) => nearestOnLine(entry.lonLat, r).m));
  const entryBwdb = Math.min(...bdRings.map((r) => nearestOnLine(entry.snappedFrom.lonLat, r).m));
  check(entrySrc <= 500, `c. the entry marker's point is ${round(entrySrc)} m from COD-AB's border (limit 500 m)`);
  check(entryBwdb <= 500, `c. BWDB's entry point, from which the marker was snapped ${round(distM(entry.snappedFrom.lonLat, entry.lonLat) / 1000, 1)} km along the border, is ${round(entryBwdb)} m from it (limit 500 m)`);
  for (const k of Object.keys(frames)) {
    const ring = parsePath(frames[k].bangladesh.border).map((r) => [...r, r[0]].map(([x, y]) => proj[k].invert(x, y)));
    const m = frames[k].markers.find((x) => x.id === 'entry');
    const d = Math.min(...ring.map((r) => nearestOnLine(proj[k].invert(m.x, m.y), r).m));
    const limit = Math.max(500, M_PER_U(k));
    check(d <= limit, `c. ${k}: the entry marker is ${round(d)} m (${round(d / M_PER_U(k), 2)} u) from the drawn border (limit ${round(limit)} m: 500 m, or 1 px where that is finer than the picture)`);
  }

  // 7f — the border-entry marker lies on the drawn main line, where it turns from dashed (outside Bangladesh) to solid.
  const entryF = [];
  for (const k of Object.keys(frames)) {
    const pieces = frames[k].lines.find((x) => x.id === 'main').pieces;
    const turn = pieces.findIndex((p, i) => p.dash && pieces[i + 1] && !pieces[i + 1].dash);
    const m = frames[k].markers.find((x) => x.id === 'entry');
    const at = proj[k].invert(m.x, m.y);
    const toLine = nearestOnLine(at, lineOf(k, 'main').flat()).m;
    const switchPt = turn < 0 ? null : parsePath(pieces[turn].d).flat().at(-1);
    const toSwitch = switchPt ? distM(at, proj[k].invert(...switchPt)) : Infinity;
    check(toLine <= 500 && toSwitch <= 500, `f. ${k}: the entry marker is ${round(toLine)} m from the drawn main line and ${round(toSwitch)} m from where it turns from dashed to solid (limit 500 m each)`);
    entryF.push(`${k} ${round(toLine)} / ${round(toSwitch)} m`);
  }

  // 7d — the main river is one connected line from its origin to the Padma confluence.
  const crosses = (a, b, c, d) => {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (const k of Object.keys(frames)) {
    const pieces = lineOf(k, 'main');
    const xy = xyOf(k, 'main').flat();
    const gaps = pieces.slice(1).map((p, i) => distM(pieces[i].at(-1), p[0]));
    const seen = new Set();
    let dup = 0;
    const segs = [];
    xyOf(k, 'main').forEach((piece) => {
      for (let i = 1; i < piece.length; i++) {
        const [a, b] = [piece[i - 1], piece[i]];
        const key = [a, b].sort((p, q) => p[0] - q[0] || p[1] - q[1]).map((p) => p.join(',')).join('|');
        if (seen.has(key)) dup++;
        seen.add(key);
        segs.push([a, b]);
      }
    });
    let tangles = 0;
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 2; j < segs.length; j++) if (crosses(...segs[i], ...segs[j])) tangles++;
    const { width, height } = frames[k].projection;
    const outside = xy.filter(([x, y]) => x < -0.05 || x > width + 0.05 || y < -0.05 || y > height + 0.05).length;
    check(pieces.length >= 1 && Math.max(0, ...gaps) <= 500 && dup === 0 && tangles === 0 && outside === 0, `d. ${k}: the main line is ${pieces.length} piece(s) end to end, gaps ${gaps.length ? gaps.map((g) => `${round(g)} m`).join(', ') : 'none'} (limit 500 m), ${dup} duplicate segments, ${tangles} self-crossings, ${outside} points outside the frame (${segs.length} segments)`);
  }
  // Another system's main river, drawn as several main lines: in the Bangladesh frame, each begins
  // within 500 m of where the last ends, as drawn.
  const mainNote = [];
  for (const e of S.entities.filter((x) => x.role === 'main' && x.id !== 'main')) {
    const ids = frames.bangladesh.lines.filter((l) => l.entity === e.id).map((l) => l.id);
    const order = Object.keys(GD.lines).filter((id) => ids.includes(id));
    // A piece joined to the one before (join.parent) is held by b., with its connector or its reason.
    const gaps = order.slice(1).flatMap((id, i) => (G.lines[id].join?.parent === order[i] ? [] : [distM(lineOf('bangladesh', order[i]).at(-1).at(-1), lineOf('bangladesh', id)[0][0])]));
    const roles = order.every((id) => G.lines[id].role === 'main');
    check(order.length >= 1 && roles && Math.max(0, ...gaps) <= 500, `d. ${e.id}: its main river is ${order.length} main line(s) end to end in the Bangladesh frame (${order.join(' → ')}), gaps ${gaps.map((g) => `${round(g)} m`).join(', ') || 'none'} (limit 500 m)`);
    mainNote.push(`${e.id} ${order.length} lines`);
  }
  {
    const whole = lineOf('whole', 'main').flat();
    const origin = seedMarker.origin.lonLat;
    const padma = seedMarker.padmaConfluence.lonLat;
    const a = distM(whole[0], origin);
    const b = distM(whole.at(-1), padma);
    const tol = Math.max(500, M_PER_U('whole'));
    check(a <= tol, `d. the main line begins ${round(a)} m from the origin marker's source coordinate (limit ${round(tol)} m: 1 px at that scale)`);
    check(b <= 2000, `d. the main line ends ${round(b)} m from the Padma-confluence coordinate BWDB gives (the seed records 1.5 km; limit 2 km)`);
    const exp = G.main.seam.expectVertex;
    check(Number.isInteger(exp) && exp > 0, `d. the Natural Earth → OpenStreetMap seam is pinned at way ${G.main.ways[0]} vertex ${exp}; the rebuild below re-measures it`);
    const notDrawn = [...G.main.identified.split('not drawn:')[1].matchAll(/\d{6,}/g)].map((m) => Number(m[0]));
    check(notDrawn.length === 9 && notDrawn.every((w) => osmWays.has(w) && !G.main.ways.includes(w)), `d. one channel only: the nine side channels, bars and duplicates the seed names are pinned and none is in the main line's ways (${G.main.ways.length} ways)`);
  }

  // 7e — every drawn line and marker traces to an id in the pinned sources.
  const drawnIds = new Set(Object.values(frames).flatMap((f) => f.lines.map((l) => l.id)));
  const wayIds = new Set();
  const bad = [];
  for (const id of drawnIds) {
    const spec = id === 'main' ? G.main : G.lines[id];
    if (!spec) { bad.push(`${id}: no entry in the seed`); continue; }
    for (const w of spec.ways) (osmWays.has(w) ? wayIds.add(w) : bad.push(`${id}: way ${w}`));
  }
  for (const n of G.main.ne) {
    const hit = ne.features.filter((f) => f.properties.rivernum === n.rivernum && f.properties.name === n.name);
    if (hit.length !== 1 || !hit[0].geometry.coordinates[n.line]) bad.push(`Natural Earth ${n.name} (rivernum ${n.rivernum}, line ${n.line})`);
  }
  const kinds = { ne: 0, osm: 0, crossing: 0, bwdb: 0 };
  for (const m of S.markers) {
    const c = m.coordSource;
    if (c.source === 'naturalEarth') {
      const f = ne.features.find((x) => x.properties.rivernum === c.ne.rivernum && x.properties.name === c.ne.name);
      const p = f?.geometry.coordinates[c.ne.line]?.[c.ne.vertex];
      if (!p || distM(p, m.lonLat) > 1) bad.push(`${m.id}: not Natural Earth ${c.ne.name} line ${c.ne.line} vertex ${c.ne.vertex}`);
      kinds.ne++;
    } else if (c.source === 'osm' && c.vertices) {
      // A crossing: a point on one segment of a main-line way that is also on COD-AB's border.
      const w = osmWays.get(c.way);
      const [a, b] = c.vertices;
      const seg = w && b === a + 1 && w.geometry.coordinates[b] ? [w.geometry.coordinates[a], w.geometry.coordinates[b]] : null;
      const onBorder = Math.min(...bdRings.map((r) => nearestOnLine(m.lonLat, r).m));
      if (!seg || !G.main.ways.includes(c.way) || nearestOnLine(m.lonLat, seg).m > 1 || onBorder > 1) bad.push(`${m.id}: not where OSM way ${c.way}'s segment ${a}–${b} crosses COD-AB's border`);
      const from = m.snappedFrom;
      if (from && (!(from.source in S.sources) || !S.sources[from.source].url || !from.where)) bad.push(`${m.id}: snapped from ${from.source}, not a listed document`);
      kinds.crossing++;
    } else if (c.source === 'osm') {
      const w = osmWays.get(c.way);
      const at = c.node !== undefined ? w?.properties.nodes?.indexOf(c.node) : c.vertex;
      if (!w || at === undefined || at < 0 || distM(w.geometry.coordinates[at] ?? [0, 0], m.lonLat) > 2) bad.push(`${m.id}: not OSM way ${c.way} ${c.node !== undefined ? `node ${c.node}` : `vertex ${c.vertex}`}`);
      kinds.osm++;
    } else {
      if (!(c.source in S.sources) || !S.sources[c.source].url || !c.where) bad.push(`${m.id}: source ${c.source} is not a listed document`);
      kinds.bwdb++;
    }
  }
  check(bad.length === 0, `e. every drawn line and marker traces to a pinned id: ${drawnIds.size} lines, ${G.main.ne.length} Natural Earth lines and ${wayIds.size} OpenStreetMap ways, ${S.markers.length} markers — ${kinds.ne} a Natural Earth vertex, ${kinds.osm} an OSM node or vertex, ${kinds.crossing} where an OSM segment crosses COD-AB's border, ${kinds.bwdb} a BWDB table row${bad.length ? ` — not: ${bad.join('; ')}` : ''}`);

  // 7g — the district names (the user's checks, 2026-09-29): every labelled district is crossed by a drawn,
  // tappable line; every anchor lies inside its district as COD-AB draws it; every district holding a marker
  // is labelled from the opening view. And the shared district file is its build's output, byte for byte.
  const districtNote = [];
  {
    const fb = frames.bangladesh;
    const admin2 = zipEntry(pinned(path.join(CACHE, codab.file), codab.sha256), 'bgd_admin2.geojson');
    const box = (rings) => rings.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    const inRing = (p, ring) => {
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (ring[i][1] > p[1] !== ring[j][1] > p[1] && p[0] < ((ring[j][0] - ring[i][0]) * (p[1] - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) hit = !hit;
      return hit;
    };
    const polys = new Map(admin2.features.map((f) => {
      const rings = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
      return [f.properties.adm2_pcode, { en: f.properties.adm2_name, rings, box: box(rings.flat()) }];
    }));
    const insideD = (p, d) => p[0] >= d.box[0] && p[0] <= d.box[2] && p[1] >= d.box[1] && p[1] <= d.box[3] && d.rings.some((poly) => poly.reduce((n, r) => n + (inRing(p, r) ? 1 : 0), 0) % 2 === 1);
    const labels = fb.districts?.labels ?? [];
    const tappable = fb.lines.filter((l) => l.role !== 'continuation').flatMap((l) => lineOf('bangladesh', l.id));
    const samples = [];
    for (const piece of tappable)
      for (let i = 1; i < piece.length; i++) {
        const n = Math.max(1, Math.ceil(distM(piece[i - 1], piece[i]) / 100));
        for (let k = 0; k < n; k++) samples.push([piece[i - 1][0] + ((piece[i][0] - piece[i - 1][0]) * (k + 0.5)) / n, piece[i - 1][1] + ((piece[i][1] - piece[i - 1][1]) * (k + 0.5)) / n]);
      }
    const uncrossed = labels.filter((l) => !samples.some((p) => insideD(p, polys.get(l.pcode))));
    check(labels.length > 0 && uncrossed.length === 0, `g. every labelled district (${labels.length}) is crossed by a drawn tappable line${uncrossed.length ? ` — not: ${uncrossed.map((l) => l.pcode).join(', ')}` : ''}`);
    const outside = labels.filter((l) => !insideD(proj.bangladesh.invert(l.x, l.y), polys.get(l.pcode)));
    check(outside.length === 0, `g. every district name's anchor lies inside its district as COD-AB draws it${outside.length ? ` — not: ${outside.map((l) => l.pcode).join(', ')}` : ''}`);
    const markerDistricts = new Set(); // "system|pcode"
    let located = 0;
    for (const m of fb.markers) {
      const p = proj.bangladesh.invert(m.x, m.y);
      let at = [...polys].find(([, d]) => insideD(p, d))?.[0];
      if (!at) at = [...polys].map(([pc, d]) => [pc, Math.min(...d.rings.flat().map((r) => nearestOnLine(p, r).m))]).sort((a, b) => a[1] - b[1]).find(([, mm]) => mm <= 500)?.[0];
      if (at) (markerDistricts.add(`${m.system}|${at}`), located++);
    }
    const missing = [...markerDistricts].filter((key) => {
      const [s, pc] = key.split('|');
      return !labels.some((l) => l.pcode === pc && l.systems?.[s] === 'always');
    });
    check(located === fb.markers.length, `g. every marker lies in a COD-AB district, or on its edge (${located} of ${fb.markers.length}, in ${markerDistricts.size} districts)`);
    check(missing.length === 0, `g. every district holding a system's marker is labelled from the opening view when that system is current: ${[...markerDistricts].map((key) => `${key.split('|')[0]} ${polys.get(key.split('|')[1]).en}`).join(', ')}${missing.length ? ` — not: ${missing.join(', ')}` : ''}`);
    districtNote.push(`${labels.filter((l) => Object.values(l.systems).includes('always')).length} from the opening view, ${labels.filter((l) => !Object.values(l.systems).includes('always')).length} from ${fb.districts?.zoomAll}×`);
    const outD = fs.mkdtempSync(path.join(os.tmpdir(), 'districts-'));
    const builtD = path.join(outD, 'bangladesh-districts.json');
    try {
      execFileSync(process.execPath, [path.join(HERE, 'build-bangladesh-districts.mjs'), builtD], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {}
    const sameD = fs.existsSync(builtD) && fs.readFileSync(builtD).equals(fs.readFileSync(path.join(SERVED, 'shared', 'bangladesh-districts.json')));
    fs.rmSync(outD, { recursive: true, force: true });
    check(sameD, 'g. docs/shared/bangladesh-districts.json is tools/build-bangladesh-districts.mjs\'s output, byte for byte');
  }

  // The build, re-run offline to a temp folder, is the committed diagram — and its own checks (chains within 3 m, seam, junctions, the geometry pins) held.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rivers-'));
  let say = '';
  try {
    say = execFileSync(process.execPath, [RIVERS_BUILD, out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    say = `${e.stderr ?? e.message}`;
  }
  const built = ['descriptor.json', 'data.json', 'frame-whole.json', 'frame-bangladesh.json'];
  const same = built.every((f) => fs.existsSync(path.join(out, f)) && fs.readFileSync(path.join(out, f)).equals(fs.readFileSync(path.join(RIVERS_DIR, f))));
  fs.rmSync(out, { recursive: true, force: true });
  const seamLine = /seam gap ([\d.]+) m at ([\d.]+)°E.*?jamuna→padma ([\d.]+) m; padma→meghna junction ([\d.]+) m/.exec(say);
  const pins = JSON.parse(fs.readFileSync(RIVERS_PINS, 'utf8'));
  check(same && Object.keys(pins).length === 68, `the build reproduces the ${built.length} committed files byte for byte, and its ${Object.keys(pins).length} geometry pins hold${same ? '' : ` — ${say.split('\n').slice(0, 3).join(' | ')}`}`);
  check(Boolean(seamLine) && Number(seamLine[1]) <= G.main.seam.maxM && Number(seamLine[3]) <= 500 && Number(seamLine[4]) <= 3, `d. the seam is ${seamLine?.[1]} m at ${seamLine?.[2]}°E (limit ${G.main.seam.maxM} m); the Jamuna ends ${seamLine?.[3]} m from the Padma, which ends ${seamLine?.[4]} m from the Meghna`);
  console.log(`bangladesh-rivers: a. ${drawnMarkers} markers within ${round(worst.px, 2)} px / ${round(worst.m)} m; b. ${alone.length + viaConnector.length} joined (${alone.join(', ')} on their own; ${viaConnector.join(', ')} by a connector), ${exempt.length} unjoined (${exempt.join(', ')}); c. entry ${round(entrySrc)} m from the border (BWDB's point ${round(entryBwdb)} m); d. main connected, gaps ≤ 500 m${mainNote.length ? ` (and ${mainNote.join(', ')})` : ''}; e. ${drawnIds.size} lines, ${wayIds.size} ways, ${S.markers.length} markers traced; f. entry on the line and at the dash switch: ${entryF.join(', ')}; g. district names ${districtNote.join('')}`);

  // ---- bangladesh-rivers-map: the same checks a–g in metres, on the map's own GeoJSON (2026-09-30) ----
  // The diagram's are in its frame units (1 u ≈ 512 m in its Bangladesh frame, its lines simplified by up to
  // 0.8 u); the map's lines are the chains within 15 m, so each limit here is the diagram's or tighter.
  {
    const mapGj = (f) => readJ(path.join(RIVERS_MAP_DIR, f));
    // The build, run once, first: the committed map is its output (checked at the end), and d. reads its count.
    // The build, re-run offline to a temp folder, is the committed map — its deviation check (every chain vertex
    // within 15 m of the drawn line, every drawn vertex on the chain) and the 68 geometry pins held.
    const outM = fs.mkdtempSync(path.join(os.tmpdir(), 'rivers-map-'));
    let sayM = '';
    try {
      sayM = execFileSync(process.execPath, [RIVERS_MAP_BUILD, outM], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      sayM = `${e.stderr ?? e.message}`;
    }
    const fb = G.frames.bangladesh;
    const features = [...mapGj('lines-in.geojson').features.map((f) => ({ ...f, dashed: false })), ...mapGj('lines-out.geojson').features.map((f) => ({ ...f, dashed: true }))];
    const mapCons = mapGj('connectors.geojson').features;
    const mapMarks = mapGj('marks.json');
    const drawnM = (id) => features.filter((f) => f.properties.line === id).map((f) => f.geometry.coordinates);
    const toDrawn = (p, id) => Math.min(...drawnM(id).map((c) => nearestOnLine(p, c).m));
    const ON_M = 0.5; // a point the build puts on a line or at a vertex: the 6-decimal rounding is 0.11 m
    const note = [];

    // a — every marker stands at its source coordinate exactly (the diagram: within 1 u and 500 m).
    // The Bangladesh frame's markers and the whole-course frame's it lacks (the origin, M3).
    const mapMarkerIds = [...fb.markers, ...G.frames.whole.markers.filter((k) => !fb.markers.includes(k))];
    const aBad = mapMarkerIds.filter((id) => !mapMarks[id] || distM(mapMarks[id].at, seedMarker[id].lonLat) > ON_M);
    check(Object.keys(mapMarks).length === mapMarkerIds.length && aBad.length === 0, `map a. the ${mapMarkerIds.length} markers stand at their source coordinates (limit ${ON_M} m; the diagram's 1 u ≈ 512 m and 500 m)${aBad.length ? ` — not: ${aBad.join(', ')}` : ''}`);

    // b — every branch's parent-side end: within 50 m of its parent as the map draws it, or joined by a connector of at
    // most 12 km that starts at that end and ends on the parent (within ON_M each; the diagram's 50 m), or unjoined by decision.
    const mapConOf = new Map(mapCons.map((c) => [c.properties.line, c]));
    const bAlone = [];
    const bVia = [];
    const bExempt = [];
    const bBad = [];
    for (const [id, spec] of branches.filter(([bid]) => fb.lines.includes(bid))) {
      const parentId = spec.join?.parent ?? 'main';
      if (!fb.lines.includes(parentId)) continue;
      const own = drawnM(id);
      const atTail = spec.join?.end ? spec.join.end === 'tail' : spec.role === 'tributary';
      const ends = own.map((c) => (atTail ? c.at(-1) : c[0]));
      // The parent-side end: the drawn end nearest the parent, as a clipped line has more than one.
      const end = ends.sort((p, q) => toDrawn(p, parentId) - toDrawn(q, parentId))[0];
      const toParent = toDrawn(end, parentId);
      const con = mapConOf.get(id);
      if (toParent <= NEAR_M && !con) bAlone.push(`${id} ${round(toParent)} m`);
      else if (con) {
        const pts = con.geometry.coordinates;
        const len = distM(pts[0], pts[1]);
        const good = pts.length === 2 && con.properties.parent === parentId && len <= CONNECTOR_MAX_M && Math.abs(len - con.properties.m) <= 1 && distM(pts[0], end) <= ON_M && toDrawn(pts[1], parentId) <= ON_M;
        (good ? bVia : bBad).push(`${id} ${round(len / 1000, 2)} km`);
      } else if (typeof spec.exempt === 'string' && spec.exempt.length > 20 && (toParent > CONNECTOR_MAX_M || UNJOINED_BY_DECISION.has(id))) bExempt.push(id);
      else bBad.push(`${id} ${round(toParent)} m, no connector`);
    }
    const wantExempt = EXEMPT.filter((id) => fb.lines.includes(id));
    check(bBad.length === 0 && JSON.stringify([...bExempt].sort()) === JSON.stringify([...wantExempt].sort()), `map b. every branch meets its parent: ${bAlone.length} within ${NEAR_M} m, ${bVia.length} by a connector ≤ ${CONNECTOR_MAX_M / 1000} km whose ends lie within ${ON_M} m of the branch's end and the parent (the diagram's ${NEAR_M} m), ${bExempt.length} unjoined — the user's decisions, as in the diagram${bBad.length ? ` — not: ${bBad.join('; ')}` : ''}`);
    note.push(`b. ${bAlone.length} within ${NEAR_M} m, ${bVia.length} connectors, ${bExempt.length} unjoined`);

    // c — the entry marker on COD-AB's border at full precision (the diagram: 500 m, or 1 u of its drawn border).
    const cM = Math.min(...bdRings.map((r) => nearestOnLine(mapMarks.entry.at, r).m));
    check(cM <= ON_M, `map c. the entry marker is ${round(cM, 3)} m from COD-AB's border (limit ${ON_M} m; the diagram's 500 m or 1 u)`);

    // d — the main river one connected line: its pieces end to end, no duplicate segment, no self-crossing, nothing
    // outside the basemap's box (the diagram: gaps within 500 m).
    const mainPieces = features.filter((f) => f.properties.line === 'main').map((f) => f.geometry.coordinates);
    const starts = mainPieces.filter((c) => !mainPieces.some((o) => o !== c && distM(o.at(-1), c[0]) <= ON_M));
    const segs = mainPieces.flatMap((c) => c.slice(1).map((p, i) => [c[i], p]));
    const segKeys = segs.map(([a, b]) => [a, b].sort((p, q) => p[0] - q[0] || p[1] - q[1]).join('|'));
    let dTangles = 0;
    for (let i = 0; i < segs.length; i++) for (let j = i + 2; j < segs.length; j++) if (crosses(...segs[i], ...segs[j])) dTangles++;
    // The map's own bounds: since M3 it draws every line whole, to the origin.
    const [bw, bs, be, bn] = mapGj('descriptor.json').constraints.maxBounds;
    // The pinned chain's own crossings, as the build counts them (re-run below): the drawn line may have those, no more.
    const chainCrossings = Number(/pinned chain (\d+)/.exec(sayM)?.[1] ?? NaN);
    const dOrigin = distM(mainPieces.flat().sort((q, r) => distM(q, seedMarker.origin.lonLat) - distM(r, seedMarker.origin.lonLat))[0], seedMarker.origin.lonLat);
    const dOut = mainPieces.flat().filter(([x, y]) => x < bw || x > be || y < bs || y > bn).length;
    // Its end: the one piece whose end begins no other.
    const lastPieces = mainPieces.filter((c) => !mainPieces.some((o) => o !== c && distM(c.at(-1), o[0]) <= ON_M));
    const dEnd = lastPieces.length === 1 ? distM(lastPieces[0].at(-1), seedMarker.padmaConfluence.lonLat) : Infinity;
    check(starts.length === 1 && new Set(segKeys).size === segKeys.length && dTangles === chainCrossings && dOut === 0 && dEnd <= 2000 && dOrigin <= ON_M, `map d. from ${round(dOrigin, 3)} m of the origin marker (limit ${ON_M} m; the diagram's 1 u), the main line is ${mainPieces.length} pieces end to end within ${ON_M} m (the diagram's 500 m), ${segKeys.length - new Set(segKeys).size} duplicate segments, ${dTangles} self-crossings (its pinned chain's own: ${chainCrossings}), ${dOut} points outside the map's bounds, ${round(dEnd)} m from the Padma-confluence coordinate (limit 2 km, as the diagram's)`);
    // A line's head and tail as drawn: the piece start no other piece ends at, the piece end no other begins at
    // (the files hold the solid pieces before the dashed, not in the line's order).
    const headOf = (id) => drawnM(id).find((c, _, all) => !all.some((o) => o !== c && distM(o.at(-1), c[0]) <= ON_M))[0];
    const tailOf = (id) => drawnM(id).find((c, _, all) => !all.some((o) => o !== c && distM(c.at(-1), o[0]) <= ON_M)).at(-1);
    const mainGaps = [];
    for (const e of S.entities.filter((x) => x.role === 'main' && x.id !== 'main')) {
      const order = Object.keys(G.lines).filter((id) => G.lines[id].entity === e.id && fb.lines.includes(id));
      for (let i = 1; i < order.length; i++) if (G.lines[order[i]].join?.parent !== order[i - 1]) mainGaps.push(distM(tailOf(order[i - 1]), headOf(order[i])));
    }
    check(Math.max(0, ...mainGaps) <= 3.5, `map d. every other main river drawn as several lines runs end to end: gaps ${mainGaps.map((g) => `${round(g, 2)} m`).join(', ') || 'none'} (limit 3.5 m: the chains' 3 m and the rounding; the diagram's 500 m)`);

    // e — every drawn piece is a line of the seed's Bangladesh frame, on its own card; every marker one of the frame's.
    const eBad = features.concat(mapCons).filter((f) => !fb.lines.includes(f.properties.line) || f.properties.key !== (f.properties.line === 'main' ? 'main' : G.lines[f.properties.line]?.entity));
    const eMissing = fb.lines.filter((id) => !drawnM(id).length);
    check(eBad.length === 0 && eMissing.length === 0 && Object.keys(mapMarks).every((id) => mapMarkerIds.includes(id)), `map e. every piece (${features.length}) and connector (${mapCons.length}) is a line of the seed's Bangladesh frame on its own card, every one of its ${fb.lines.length} lines is drawn, and every marker is the frame's — each traced to the pinned ids by e. above`);

    // f — the entry marker where the main line turns from dashed to solid (the diagram: within 500 m of each).
    const entryAt = mapMarks.entry.at;
    const fDash = Math.min(...features.filter((f) => f.properties.line === 'main' && f.dashed).map((f) => distM(f.geometry.coordinates.at(-1), entryAt)));
    const fSolid = Math.min(...features.filter((f) => f.properties.line === 'main' && !f.dashed).map((f) => distM(f.geometry.coordinates[0], entryAt)));
    check(fDash <= ON_M && fSolid <= ON_M, `map f. the entry marker is ${round(fDash, 3)} m from where the dashed main line ends and ${round(fSolid, 3)} m from where the solid one begins (limit ${ON_M} m each; the diagram's 500 m)`);

    // g — every marker in a COD-AB district, or within 500 m of one (as the diagram's); the district names are the
    // basemap's own (all 64, at 14 px, from z7), so the diagram's label checks have nothing to hold here.
    const admin2 = zipEntry(pinned(path.join(CACHE, codab.file), codab.sha256), 'bgd_admin2.geojson');
    const inRingG = (p, ring) => {
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (ring[i][1] > p[1] !== ring[j][1] > p[1] && p[0] < ((ring[j][0] - ring[i][0]) * (p[1] - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) hit = !hit;
      return hit;
    };
    const polysG = admin2.features.map((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
    // The Bangladesh frame's markers, as the diagram's g. holds them; the origin, in Tibet, is in no district.
    const gOut = Object.entries(mapMarks).filter(([k]) => fb.markers.includes(k)).filter(([, m]) => !polysG.some((poly) => poly.some((rings) => rings.reduce((n, r) => n + (inRingG(m.at, r) ? 1 : 0), 0) % 2 === 1)) && Math.min(...polysG.flat(2).map((r) => nearestOnLine(m.at, r).m)) > 500).map(([k]) => k);
    check(gOut.length === 0, `map g. every marker of the Bangladesh frame lies in a COD-AB district or within 500 m of one (${fb.markers.length}); the district names are the basemap's${gOut.length ? ` — not: ${gOut.join(', ')}` : ''}`);
    // The names on the lines: each on its own river as the map draws it.
    const names = mapGj('names.json');
    const nameIds = fb.labels.filter((l) => toDrawn(names[l.id].at, l.line) > ON_M).map((l) => l.id);
    check(nameIds.length === 0, `map: every name on a line (${fb.labels.length}) stands on its own river as drawn (limit ${ON_M} m)${nameIds.length ? ` — not: ${nameIds.join(', ')}` : ''}`);

    const builtM = fs.readdirSync(RIVERS_MAP_DIR).sort();
    const sameM = builtM.every((f) => fs.existsSync(path.join(outM, f)) && fs.readFileSync(path.join(outM, f)).equals(fs.readFileSync(path.join(RIVERS_MAP_DIR, f)))) && fs.readdirSync(outM).length === builtM.length;
    fs.rmSync(outM, { recursive: true, force: true });
    const dev = /worst chain vertex ([\d.]+) m/.exec(sayM)?.[1];
    check(sameM && dev !== undefined && Number(dev) <= 15, `map: the build reproduces the ${builtM.length} committed files byte for byte; every chain vertex within ${dev} m of the drawn line (limit 15 m)${sameM ? '' : ` — ${sayM.split('\n').slice(0, 3).join(' | ')}`}`);
    console.log(`bangladesh-rivers-map: a. ${mapMarkerIds.length} markers at their coordinates; ${note.join('; ')}; c. entry ${round(cM, 3)} m from the border; d. main ${mainPieces.length} pieces, 0 gaps; f. entry ${round(fDash, 3)} / ${round(fSolid, 3)} m`);

    // ---- parity (M4): the diagram and the map, from their built files, say the same (the user's check, 2026-09-30) ----
    // Cards and picker groups, card rows word for word, markers' cards, ⓘ's lines but the items one product
    // alone draws (the seed's `only`), line ids and roles, and the pending facts. A difference fails.
    {
      const dData = readJ(path.join(RIVERS_DIR, 'data.json'));
      const dFrames = ['frame-whole.json', 'frame-bangladesh.json'].map((f) => readJ(path.join(RIVERS_DIR, f)));
      const mDesc = mapGj('descriptor.json');
      const mRivers = mapGj('rivers.json');
      const mInfo = mapGj('info.json');
      const rowOrder = S.ui.rowOrder;
      const diffs = [];
      // Cards and their groups, in the picker's order.
      const dCards = dData.picker.map((q) => `${q.key}|${q.group}|${q.label}`);
      const mCards = Object.entries(mRivers).map(([k, r]) => `${k}|${r.system}|${r.nameBn}`);
      if (JSON.stringify(dCards) !== JSON.stringify(mCards)) diffs.push('cards or their groups');
      const mGroups = mDesc.controls.find((c) => c.type === 'picker').groupBy.order.map((g) => `${g}|${mDesc.lookups.systems[g].nameBn}`);
      if (JSON.stringify(dData.pickerGroups.map((g) => `${g.value}|${g.label}`)) !== JSON.stringify(mGroups)) diffs.push('picker groups');
      // Rows, word for word: the diagram ships a card's shown rows; the map the same, and a null for each pending one.
      let pendingD = 0;
      let pendingM = 0;
      for (const [k, r] of Object.entries(mRivers)) {
        const shown = Object.fromEntries(rowOrder.filter((f) => f in r && r[f] !== null).map((f) => [f, r[f]]));
        if (JSON.stringify(shown) !== JSON.stringify(dData.entities[k]?.values ?? null)) diffs.push(`rows of ${k}`);
        pendingM += rowOrder.filter((f) => r[f] === null).length;
      }
      // Pending: a row the seed holds as null is shown by neither, and is the map's null.
      for (const e of S.entities) for (const [f, v] of Object.entries(e.values)) if (v === null) (pendingD += !(f in (dData.entities[e.id]?.values ?? {})) ? 1 : 0);
      if (pendingD !== pendingM) diffs.push(`pending ${pendingD} / ${pendingM}`);
      // Markers' cards, for the markers both draw.
      const mMarks = mapGj('marks.json');
      for (const [k, m] of Object.entries(mMarks)) {
        const d = dData.markers[k];
        if (!d || d.name !== m.nameBn || d.kind !== m.kind || d.entity !== m.river || m[d.row] !== d.value) diffs.push(`marker ${k}`);
      }
      // ⓘ's lines, but the items the seed keeps to one product.
      const onlyTexts = new Set(S.infoBn.lines.filter((l) => l.only).map((l) => l.textBn));
      const dLines = dData.credits.filter((c) => c.group).map((c) => `${c.group}|${c.title}`).filter((t) => !onlyTexts.has(t.split('|').slice(1).join('|')));
      // The map's own upstream lines for cut cards (R-55): the seed's map-only sentence after a card's name, built, not listed.
      const cutLine = (s) => s.endsWith(`: ${S.ui.mapOnlyBn?.upstreamInPart}`) && !S.infoBn.lines.some((l) => l.textBn === s);
      const mLines = mInfo.lines.map((l) => `${l.group}|${l.text}`).filter((t) => !onlyTexts.has(t.split('|').slice(1).join('|')) && !cutLine(t.split('|').slice(1).join('|')));
      if (JSON.stringify(dLines) !== JSON.stringify(mLines)) diffs.push('ⓘ lines');
      const flaggedD = dData.credits.filter((c) => c.group && onlyTexts.has(c.title)).length;
      const flaggedM = mInfo.lines.filter((l) => onlyTexts.has(l.text) || cutLine(l.text)).length;
      // Line ids and roles: every line either frame draws, and the map's, each with its card's role.
      const dLineRoles = [...new Map(dFrames.flatMap((f) => f.lines.map((l) => [l.id, l.role]))).entries()].sort().map(([k, r]) => `${k}|${r}`);
      // The map's own lines (only: "map", Stage 4's upstream reaches) set aside, as its own ⓘ lines are.
      const mapOnlyLines = new Set(Object.entries(G.lines).filter(([, l]) => l.only === 'map').map(([id]) => id));
      const mLineRoles = [...new Map(features.filter((f) => !mapOnlyLines.has(f.properties.line)).map((f) => [f.properties.line, mRivers[f.properties.key].role])).entries()].sort().map(([k, r]) => `${k}|${r}`);
      if (JSON.stringify(dLineRoles) !== JSON.stringify(mLineRoles)) diffs.push('line ids or roles');
      check(diffs.length === 0, `parity: diagram and map — ${dCards.length} cards in ${mGroups.length} groups, their rows word for word, ${Object.keys(mMarks).length} markers' cards, ${dLines.length} ⓘ lines alike (the diagram's own ${flaggedD} and the map's own ${flaggedM} set aside by the seed's only), ${dLineRoles.length} line ids and roles (the map's own ${mapOnlyLines.size} lines set aside), ${pendingD} pending facts${diffs.length ? ` — differ: ${diffs.join('; ')}` : ''}`);
    }
  }
}

// ---- vendored libraries ----
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const vendored = [
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl.mjs'],
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl-shared.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs'],
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl-worker.mjs', 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'],
  ['shared/vendor/maplibre-gl-6.9.0/maplibre-gl.css', 'node_modules/maplibre-gl/dist/maplibre-gl.css'],
  ['shared/vendor/pmtiles-4.5.0/pmtiles.js', 'node_modules/pmtiles/dist/pmtiles.js'],
  ['shared/vendor/three-0.185.1/three.module.min.js', 'node_modules/three/build/three.module.min.js'],
  ['shared/vendor/three-0.185.1/three.core.min.js', 'node_modules/three/build/three.core.min.js'],
  ['shared/vendor/three-0.185.1/LICENSE', 'node_modules/three/LICENSE'],
];
for (const [copy, original] of vendored) check(sha(path.join(SERVED, copy)) === sha(path.join(HERE, original)), `${copy} matches the pinned npm package`);
// The diagram shell's one vendored library, Three.js r128 for the maritime-zones 3D view only (the
// user's exception, 2026-10-05): each file the one tools/sources.json pins, and nothing else there.
{
  const pin = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8')).threeR128;
  const want = Object.values(pin.files).map((f) => f.vendored.slice('docs/'.length));
  const there = fs.readdirSync(path.join(SERVED, 'visual/vendor'), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(SERVED, path.join(e.parentPath ?? e.path, e.name)).split(path.sep).join('/'));
  for (const f of Object.values(pin.files)) check(sha(path.join(ROOT, f.vendored)) === f.sha256, `${f.vendored} matches ${pin.package}'s file, by the SHA-256 in tools/sources.json`);
  const extra = there.filter((f) => !want.includes(f));
  check(extra.length === 0, `docs/visual/vendor/ holds only ${pin.package}'s pinned files${extra.length ? ` — not: ${extra.join(', ')}` : ''}`);
}

// ---- straits map: each passage's first view must show what it sits between ----
const { PASSAGES, SEAS } = await import(pathToFileURL(path.join(STRAITS_DIR, 'data.js')).href);
const inFrame = ([w, s, e, n], [x, y]) => x >= w && x <= e && y >= s && y <= n;
for (const [key, p] of Object.entries(PASSAGES)) {
  const missing = [['the passage', p.center], ...p.seas.map((k) => [`sea "${k}"`, SEAS[k]?.at])]
    .filter(([, pt]) => !pt || !inFrame(p.frame, pt))
    .map(([what]) => what);
  check(missing.length === 0, `straits/${key}: frame contains the passage and its ${p.seas.length} sea label(s)${missing.length ? ` — outside: ${missing.join(', ')}` : ''}`);
}

// ---- straits map: lanes and canals come only from the pinned OSM snapshots ----
const pinnedSources = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
for (const entry of [pinnedSources.osmTss, pinnedSources.osmCanals]) {
  check(sha(path.join(ROOT, entry.file)) === entry.sha256, `${entry.file} matches its pinned checksum`);
}
const canalLines = JSON.parse(fs.readFileSync(path.join(STRAITS_DIR, 'canals.geojson'), 'utf8'));
for (const name of ['routes', 'canals']) {
  const fc = JSON.parse(fs.readFileSync(path.join(STRAITS_DIR, `${name}.geojson`), 'utf8'));
  check(/ODbL/.test(fc.properties?.licence || ''), `straits/${name}.geojson carries its ODbL licence`);
}
const laneFile = JSON.parse(fs.readFileSync(path.join(STRAITS_DIR, 'routes.geojson'), 'utf8'));
const laneCoords = laneFile.features.flatMap((f) => (f.geometry.type === 'Polygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates));
for (const [key, p] of Object.entries(PASSAGES).filter(([, q]) => q.routeStatus === 'none')) {
  const [w, s, e, n] = p.frame;
  const inside = laneCoords.filter(([x, y]) => x >= w && x <= e && y >= s && y <= n).length;
  check(inside === 0, `straits/${key}: card says no mapped lane, and no lane is drawn in its frame${inside ? ` — ${inside} points drawn` : ''}`);
}
for (const [key, p] of Object.entries(PASSAGES)) {
  const okStatus = p.kind === 'canal' ? p.routeStatus === 'canal' : ['mapped', 'partial', 'none'].includes(p.routeStatus);
  check(okStatus && !('route' in p), `straits/${key}: routeStatus "${p.routeStatus}", no hand-drawn route`);
  if (p.kind === 'canal') check(canalLines.features.some((f) => f.properties.canal === key), `straits/${key}: canal line present`);
}

// ---- per-map files ----
const famous = JSON.parse(fs.readFileSync(path.join(DATA_SOURCES, 'famous-lines.geojson'), 'utf8'));
check(famous.features.some((f) => f.properties.kind === 'trace'), 'data-sources/famous-lines.geojson has traced lines');
check(fs.existsSync(path.join(SERVED, 'shared/fonts/noto-sans-bengali/OFL.txt')), 'Noto Sans Bengali licence is shipped next to the font');

/*
|--------------------------------------------------------------------------
| THE BASELINE — what every map gets without asking
|
| Sea labels, country labels and the section a map belongs to are provided by
| the shell and the build, so with those in place these checks are
| structurally true. That is the point of writing them down: they fail the
| day someone makes one of them declarable again "just for this one map",
| which is exactly when nobody is looking.
|--------------------------------------------------------------------------
*/
console.log('\n---- the baseline ----');

const SECTIONS = ['bangladesh', 'international', 'geography', 'misc'];
// Provided by the shell. A descriptor may not declare any of these, by any route.
const BASELINE_LAYERS = ['country-labels', 'country-labels-named', 'country-labels-active', 'sea-labels', 'sea-labels-active'];
const BASELINE_SOURCES = ['seas', 'countryLabels'];
const BASELINE_RECORDS = ['seas'];

const MAPS_DIR = path.join(SERVED, 'maps');
const mapIds = fs
  .readdirSync(MAPS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();
// Interactive diagrams: listed in the registry beside the maps, opened by the
// diagram shell, and outside the map baseline. The folder comes with the first
// diagram. Change here if it moves.
const DIAGRAMS_DIR = path.join(SERVED, 'diagrams');
const diagramIds = fs.existsSync(DIAGRAMS_DIR)
  ? fs
      .readdirSync(DIAGRAMS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];

const shellSource = fs.readFileSync(path.join(SERVED, 'shell/app.js'), 'utf8');
for (const id of BASELINE_LAYERS) {
  check(shellSource.includes(`id: '${id}'`), `the shell still creates the baseline layer "${id}"`);
}

// A map is named by its id, a diagram by its kind and id, as their registry
// entries say — so the two cannot stand in for each other below.
const keyOf = (entry) => (entry.kind ? `${entry.kind}:${entry.id}` : entry.id);
const found = [...mapIds.map((id) => ({ id })), ...diagramIds.map((id) => ({ id, kind: 'diagram' }))];
const descriptors = {};
for (const entry of found) {
  const name = keyOf(entry);
  const d = JSON.parse(fs.readFileSync(path.join(entry.kind ? DIAGRAMS_DIR : MAPS_DIR, entry.id, 'descriptor.json'), 'utf8'));
  descriptors[name] = d;
  check(SECTIONS.includes(d.section), `${name}: section "${d.section}" is one of ${SECTIONS.join(', ')}`);
  // The baseline is the map shell's: a diagram has no basemap, no labels and
  // no picker row for its descriptor to take.
  if (entry.kind === 'diagram') continue;

  const declaredLayers = (d.layers ?? []).map((l) => l.id).filter((l) => BASELINE_LAYERS.includes(l));
  const declaredSources = Object.keys(d.sources ?? {}).filter((s) => BASELINE_SOURCES.includes(s));
  const declaredRecords = Object.keys(d.records ?? {}).filter((r) => BASELINE_RECORDS.includes(r));
  const taken = [...declaredLayers, ...declaredSources, ...declaredRecords];
  check(taken.length === 0, `${name}: declares nothing the shell provides${taken.length ? ` — ${taken.join(', ')}` : ''}`);
}
const both = diagramIds.filter((id) => mapIds.includes(id));
check(both.length === 0, `no id is both a map and a diagram${both.length ? ` — ${both.join(', ')}` : ''}`);

// Work in progress (tools/wip.json) may have its folder under docs/ while its
// work continues; it is finished when it is in the registry, and not before.
const wipItems = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/wip.json'), 'utf8')).items ?? [];
const wipKeys = new Set(wipItems.map((w) => (w.kind === 'diagram' ? `diagram:${w.id}` : w.id)));

// The registry is generated, so it cannot disagree with the descriptors — and
// this is the check that says so out loud if the generator stops being run.
const registry = JSON.parse(fs.readFileSync(path.join(SERVED, 'registry.json'), 'utf8'));
const registered = registry.maps.map(keyOf).sort();
const existing = found.map(keyOf).filter((k) => !wipKeys.has(k)).sort();
const inProgressFolders = found.map(keyOf).filter((k) => wipKeys.has(k));
check(
  registered.join(',') === existing.join(','),
  `registry.json lists exactly the finished maps and diagrams that exist (${existing.length}; in progress, left out: ${inProgressFolders.join(', ') || 'none'})${registered.join(',') === existing.join(',') ? '' : ` — registry ${registered.join(', ')} vs folders ${existing.join(', ')}`}`,
);
// Each entry exactly as the generator writes it: { id, section, title } for a
// map, with no new field, and "kind": "diagram" after the id for a diagram.
// A card's own words (tools/home-cards.json, 2026-09-30): a Bengali title, an optional one-line caption.
const homeCards = JSON.parse(fs.readFileSync(path.join(HERE, 'home-cards.json'), 'utf8')).cards ?? {};
const drifted = registry.maps.filter((entry) => {
  const d = descriptors[keyOf(entry)];
  const kind = entry.kind ? { kind: entry.kind } : {};
  const card = homeCards[entry.id];
  return d && JSON.stringify(entry) !== JSON.stringify({ id: d.id, ...kind, section: d.section, title: { en: d.title?.en, bn: card?.titleBn ?? d.title?.bn }, ...(card?.captionBn ? { caption: { bn: card.captionBn } } : {}) });
});
{
  const bad = Object.entries(homeCards).filter(([id, c]) => {
    const entry = registry.maps.find((e) => e.id === id);
    const oneLine = (t) => typeof t === 'string' && /[ঀ-৿]/.test(t) && !/[\n\r]/.test(t) && t === t.trim() && t.length <= 60;
    return !entry || (entry.kind === 'diagram') !== (c.kind === 'diagram') || Object.keys(c).some((k) => !['kind', 'titleBn', 'captionBn'].includes(k)) || (c.titleBn !== undefined && !oneLine(c.titleBn)) || (c.captionBn !== undefined && !oneLine(c.captionBn));
  });
  const captioned = registry.maps.filter((e) => e.caption);
  check(bad.length === 0 && captioned.every((e) => homeCards[e.id]?.captionBn === e.caption.bn && Object.keys(e.caption).join() === 'bn'), `tools/home-cards.json: each of its ${Object.keys(homeCards).length} cards is a finished map or diagram of its kind, its title and caption one line of Bengali (≤ 60 characters); ${captioned.length} registry entries carry a caption, every one from it${bad.length ? ` — not: ${bad.map(([id]) => id).join(', ')}` : ''}`);
}
check(
  drifted.length === 0,
  `every registry entry matches its descriptor${drifted.length ? ` — ${drifted.map((e) => e.id).join(', ')} stale, re-run tools/build-registry.mjs` : ''}`,
);
check(
  registry.sections.join(',') === SECTIONS.join(','),
  `registry.json keeps the syllabus section order (${SECTIONS.join(', ')})`,
);

// Work in progress (tools/wip.json): on the local preview's home page only,
// through tools/preview.mjs. An id is in progress or finished, never both, and
// finished means in the registry — so an unfinished map or diagram never shows
// on the live home page, even while its folder is under docs/ as its work
// continues.
{
  const items = wipItems;
  const malformed = items.filter((w) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(w.id ?? '') || !['map', 'diagram'].includes(w.kind) || !SECTIONS.includes(w.section) || !w.title?.bn || !w.title?.en);
  check(malformed.length === 0, `tools/wip.json: every item has an id, a kind (map or diagram), a section and both titles (${items.length})${malformed.length ? ` — not: ${malformed.map((w) => w.id).join(', ')}` : ''}`);
  const ids = items.map((w) => w.id);
  check(new Set(ids).size === ids.length, 'tools/wip.json lists each id once');
  const finished = ids.filter((id) => registry.maps.some((e) => e.id === id));
  check(finished.length === 0, `no work in progress is a finished map or diagram — in registry.json${finished.length ? ` — ${finished.join(', ')}` : ''}`);
  // A folder already there is the item it is listed as: its kind and its section. Its titles may differ
  // while it is in progress — the preview card's title is the list's (the user's decision, 2026-09-30:
  // «নদী ১» and «নদী ২» for the rivers diagram and map); the live card takes the descriptor's.
  const drift = items.filter((w) => {
    const d = descriptors[w.kind === 'diagram' ? `diagram:${w.id}` : w.id];
    return d && (d.id !== w.id || d.section !== w.section);
  });
  const withFolder = items.filter((w) => descriptors[w.kind === 'diagram' ? `diagram:${w.id}` : w.id]).map((w) => w.id);
  check(drift.length === 0, `work in progress with a folder under docs/ matches its tools/wip.json entry (${withFolder.join(', ') || 'none'})${drift.length ? ` — not: ${drift.map((w) => w.id).join(', ')}` : ''}`);
}

/*
|--------------------------------------------------------------------------
| NO CALLS OUT — a page asks only its own host for static files, through the
| resolver: no API, no third-party service, no analytics. Strict over the
| diagram shell; over the map shell and the home page a report that fails
| nothing. What counts as a link, a request or a name: tools/outbound.mjs.
| Beside it, the vendored libraries' network surface, pinned by count, and
| the diagram build tools, which make no network call at all.
|--------------------------------------------------------------------------
*/
console.log('\n---- no calls out ----');
const relToRoot = (f) => path.relative(ROOT, f).replaceAll('\\', '/');
const describe = (f) => `${relToRoot(f.file)}:${f.line} ${f.class} — ${f.rule}: ${f.what}${f.note ? ` (${f.note})` : ''}`;
{
  // Diagram shell. Everything but a namespace name fails.
  const files = sourcesAt(path.join(SERVED, 'visual'));
  const found = files.flatMap((f) => scan(f).findings).filter((f) => f.class !== 'namespace');
  for (const f of found) check(false, describe(f));
  if (!found.length) {
    check(true, `docs/visual/ asks for no absolute URL, no hand-written request or data path and no third-party host${files.length ? ` (${files.length} files)` : ' (no such folder yet)'}`);
  }
}
{
  // Map shell and home page, report only.
  const files = [...sourcesAt(path.join(SERVED, 'shell')), path.join(SERVED, 'index.html')];
  const results = files.map(scan);
  const found = results.flatMap((r) => r.findings);
  const sum = (pick) => results.reduce((n, r) => n + pick(r), 0);
  console.log(
    `     report only, nothing fails — docs/shell/ and docs/index.html, ${files.length} files: ${found.length} finding(s); ` +
      `data requests through the resolver ${sum((r) => r.requests.resolver)}, through a value ${sum((r) => r.requests.value)}; ` +
      `relative code and subresources ${sum((r) => r.own.relative)}, loaded through a value ${sum((r) => r.own.value)}`,
  );
  for (const f of found) console.log(`       ${describe(f)}`);
}
{
  // Vendored libraries: each one's network surface, counted by
  // tools/outbound.mjs over its JS and CSS, pinned here. A changed count — a
  // version bump above all — fails, naming the library and the count, until
  // someone has read what changed. Byte identity with npm is checked above.
  const PINNED_SURFACE = {
    'maplibre-gl-6.9.0': { 'absolute URLs': 8, 'fetch( sites': 3, 'image src': 5, XHR: 1, workers: 2, sockets: 0, beacons: 0, 'dynamic imports': 2 },
    'pmtiles-4.5.0': { 'absolute URLs': 1, 'fetch( sites': 2, 'image src': 1, XHR: 0, workers: 0, sockets: 0, beacons: 0, 'dynamic imports': 0 },
    'three-0.185.1': { 'absolute URLs': 2, 'fetch( sites': 3, 'image src': 1, XHR: 0, workers: 0, sockets: 0, beacons: 0, 'dynamic imports': 0 },
  };
  // The diagram shell's Three.js r128 (maritime-zones' 3D view only), counted the same way.
  const PINNED_VISUAL = { 'three-0.128.0': { 'absolute URLs': 4, 'fetch( sites': 2, 'image src': 1, XHR: 1, workers: 0, sockets: 0, beacons: 0, 'dynamic imports': 0 } };
  for (const [lib, pinned] of Object.entries(PINNED_VISUAL)) {
    const counted = librarySurface(path.join(SERVED, 'visual/vendor', lib));
    const moved = Object.keys(SURFACE).filter((k) => counted[k] !== pinned[k]);
    for (const k of moved) check(false, `docs/visual/vendor/${lib}: ${k} ${counted[k]}, pinned ${pinned[k]} — review the library's network code before re-pinning`);
    if (!moved.length) check(true, `docs/visual/vendor/${lib}: network surface as pinned (${Object.entries(counted).map(([k, n]) => `${k} ${n}`).join(', ')})`);
  }
  const vendored = fs
    .readdirSync(VENDOR_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const lib of vendored) {
    const pinned = PINNED_SURFACE[lib];
    if (!pinned) {
      check(false, `docs/shared/vendor/${lib}: no pinned network surface — count it and review it before it ships`);
      continue;
    }
    const counted = librarySurface(path.join(VENDOR_DIR, lib));
    const moved = Object.keys(SURFACE).filter((k) => counted[k] !== pinned[k]);
    for (const k of moved) check(false, `docs/shared/vendor/${lib}: ${k} ${counted[k]}, pinned ${pinned[k]} — review the library's network code before re-pinning`);
    if (!moved.length) check(true, `docs/shared/vendor/${lib}: network surface as pinned (${Object.entries(counted).map(([k, n]) => `${k} ${n}`).join(', ')})`);
  }
  for (const lib of Object.keys(PINNED_SURFACE).filter((l) => !vendored.includes(l))) check(false, `${lib}: network surface pinned, but no such folder under docs/shared/vendor/`);
}
{
  // Build tools, a map's or a diagram's: no network call at all, in the tool
  // or in any local module it imports. Their inputs are the seeds, the
  // committed extracts and the pinned cache that tools/fetch-sources.mjs fills.
  const tools = fs
    .readdirSync(HERE)
    .filter((f) => BUILD_TOOL.test(f))
    .sort()
    .map((f) => path.join(HERE, f));
  const found = tools.flatMap((f) => scanBuildTool(f));
  for (const f of found) check(false, `${relToRoot(f.file)}:${f.line} ${f.rule}: ${f.what}${f.via ? ` (imported by ${f.via})` : ''} — a build tool makes no network call`);
  if (!found.length) check(true, `build tools (tools/build-*.mjs, maps' and diagrams') make no network call (${tools.length}); only tools/fetch-sources.mjs downloads`);
}
{
  // No e-mail address anywhere (the user's rule, 2026-09-29): every tool that
  // makes a request sends tools/net.mjs's UA, and no other User-Agent.
  const netTools = fs.readdirSync(HERE).filter((f) => f.endsWith('.mjs') && f !== 'net.mjs').sort();
  let fetching = 0;
  for (const f of netTools) {
    const code = fs.readFileSync(path.join(HERE, f), 'utf8');
    if (/User-Agent'\s*:\s*['"`]/.test(code)) check(false, `tools/${f}: a User-Agent written out — send UA from tools/net.mjs`);
    // A call, not a mention: comments and quoted strings are set aside first.
    const calls = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:\\'"`])\/\/[^\n]*/gm, '$1')
      .replace(/'[^'\n]*'|"[^"\n]*"/g, "''");
    if (!/(?<![\w$.])fetch\s*\(/.test(calls)) continue;
    fetching++;
    if (!/^import \{ UA \} from '\.\/net\.mjs';$/m.test(code) || !/'User-Agent'\s*:\s*UA\b/.test(code)) check(false, `tools/${f}: fetches without tools/net.mjs's UA`);
  }
  check(fetching > 0, `tools that make a request send tools/net.mjs's User-Agent (${fetching})`);
}
{
  // Bengali text as shown (the user's rule, 2026-09-29): no space before «,», «;» or «।», and no doubled
  // space, in any Bengali string of any served JSON file — every map's and diagram's data and words.
  const BN = /[ঀ-৿]/;
  const BAD = / [,;।]| {2}/;
  const served = execFileSync('git', ['-C', ROOT, 'ls-files', '-z', 'docs'], { encoding: 'utf8' }).split('\0').filter((f) => f.endsWith('.json'));
  const bad = [];
  let strings = 0;
  const walk = (v, file) => {
    if (typeof v === 'string') {
      if (!BN.test(v)) return;
      strings++;
      if (BAD.test(v)) bad.push(`${file}: «${v.slice(Math.max(0, v.search(BAD) - 20), v.search(BAD) + 12)}»`);
    } else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x, file);
  };
  for (const f of served) walk(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')), f);
  for (const b of bad) check(false, `Bengali spacing: a space before , ; । or a doubled space — ${b}`);
  if (!bad.length) check(true, `Bengali spacing: no space before , ; । and no doubled space in the ${strings} Bengali strings of the ${served.length} served JSON files`);
}
{
  // No tracked file holds an e-mail-address pattern. Text is read whole; in a
  // PNG or WebP only what is not compressed pixel data (a match there is a
  // chance run of bytes). An allowed match is demonstrably not a person's.
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
  const ALLOWED = [
    // An image file name's pixel-density suffix (troposphere@2x.webp), in the
    // diagrams' manifests, their notes and the resolver's test.
    { match: /^[\w.-]+@[1-9]x\.(webp|png|avif|jpe?g)$/ },
    // The C2PA content credentials the image generator embedded in these two
    // mockups: its certificate authority's emailAddress attribute (X.509, OID
    // 1.2.840.113549.1.9.1, in the CA's "Division" certificate) — an
    // organisation's certificate contact, not a person's.
    { file: /^design\/mockups\/(atmosphere-layers-exploded|globe-latitude-longitude)\.png$/, match: /^\w{2}@trufo\.ai\d?$/ },
    // GitHub's no-reply commit identity for the repo owner, written in CLAUDE.md's
    // rule on commit identity: an address GitHub does not deliver, the one the
    // user chose instead of a personal address (2026-09-29).
    { file: /^CLAUDE\.md$/, match: /^319420647\+conceptq2026-wq@users\.noreply\.github\.com$/ },
  ];
  const textOf = (buf, file) => {
    const skip = (parts) => parts.map((b) => b.toString('latin1')).join('\n');
    if (/\.png$/i.test(file) && buf.readUInt32BE(0) === 0x89504e47) {
      const parts = [];
      for (let at = 8; at + 12 <= buf.length; ) {
        const len = buf.readUInt32BE(at);
        const type = buf.toString('latin1', at + 4, at + 8);
        if (type !== 'IDAT') parts.push(buf.subarray(at + 8, at + 8 + len));
        at += 12 + len;
      }
      return skip(parts);
    }
    if (/\.webp$/i.test(file) && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
      const parts = [];
      for (let at = 12; at + 8 <= buf.length; ) {
        const type = buf.toString('latin1', at, at + 4);
        const len = buf.readUInt32LE(at + 4);
        if (!['VP8 ', 'VP8L', 'ALPH', 'ANMF'].includes(type)) parts.push(buf.subarray(at + 8, at + 8 + len));
        at += 8 + len + (len % 2);
      }
      return skip(parts);
    }
    return buf.toString('latin1');
  };
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  let hits = 0;
  let allowed = 0;
  for (const file of tracked) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    for (const m of textOf(fs.readFileSync(full), file).match(EMAIL) ?? []) {
      if (ALLOWED.some((a) => (!a.file || a.file.test(file)) && a.match.test(m))) allowed++;
      else hits++, check(false, `${file}: an e-mail-address pattern (not printed) — remove it, or allow-list it with why it is not a person's`);
    }
  }
  if (!hits) check(true, `no e-mail address in the ${tracked.length} tracked files (${allowed} allowed matches: image file names and a certificate authority's)`);
}

// ---- world-revolutions: every marker traced to its pinned file -------------------------
// Re-derived here from the seed and the pinned files, apart from the build:
// the seed names a file and a key, the file gives the point. A country's point
// is its Natural Earth label point — where world.pmtiles labels it — and every
// marker lies inside its own country's polygon in the countries file
// world.pmtiles is built from. An event with no marker is the seed's noPoint
// list, and the cards-only tab has none (tools/verify-descriptor.mjs holds both).
console.log('\n---- world-revolutions: markers ----');
{
  const seed = JSON.parse(fs.readFileSync(path.join(DATA_SOURCES, 'world-revolutions/world-revolutions.seed.json'), 'utf8'));
  const recs = JSON.parse(fs.readFileSync(path.join(SERVED, 'maps/world-revolutions/records.json'), 'utf8'));
  const pins = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
  const blob = (buf) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
  const ne = (name) => {
    const buf = fs.readFileSync(path.join(CACHE, name));
    const pin = pins.naturalEarth.files[name];
    check(buf.length === pin.size && blob(buf) === pin.gitBlobSha1, `world-revolutions: ${name} is the pinned file`);
    return JSON.parse(buf.toString('utf8'));
  };
  const countries = ne('ne_10m_admin_0_countries_bdg.geojson').features;
  const cities = ne('ne_10m_populated_places_simple.geojson').features;
  const admin1 = ne('ne_10m_admin_1_states_provinces.geojson').features;
  const codAbBuf = fs.readFileSync(path.join(CACHE, pins.codAbBangladesh.file));
  check(crypto.createHash('sha256').update(codAbBuf).digest('hex') === pins.codAbBangladesh.sha256, 'world-revolutions: the COD-AB zip is the pinned file');
  const codAb = zipEntry(codAbBuf, 'bgd_adminpoints.geojson').features;
  const pointOf = (p) => {
    if (p.source === 'NE-0') {
      const f = countries.filter((c) => c.properties.ADM0_A3 === p.adm0);
      return f.length === 1 ? [[f[0].properties.LABEL_X, f[0].properties.LABEL_Y], p.adm0] : null;
    }
    if (p.source === 'NE-pp') {
      const f = cities.filter((c) => c.properties.name === p.name && c.properties.adm0_a3 === p.adm0);
      return f.length === 1 ? [[f[0].properties.longitude, f[0].properties.latitude], p.adm0] : null;
    }
    if (p.source === 'NE-1') {
      const f = admin1.filter((c) => c.properties.name === p.name && c.properties.adm0_a3 === p.adm0);
      return f.length === 1 ? [[f[0].properties.longitude, f[0].properties.latitude], p.adm0] : null;
    }
    if (p.source === 'COD-AB') {
      const f = codAb.filter((c) => c.properties.admin_level === p.level && c.properties[p.level === 2 ? 'adm2_pcode' : 'adm3_pcode'] === p.pcode && c.properties.name === p.name);
      return f.length === 1 ? [f[0].geometry.coordinates, 'BGD'] : null;
    }
    return null;
  };
  const inRing = ([x, y], ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const inside = (pt, adm0) => {
    const f = countries.find((c) => c.properties.ADM0_A3 === adm0);
    const polys = f?.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f?.geometry.coordinates ?? [];
    return polys.some((rings) => inRing(pt, rings[0]) && !rings.slice(1).some((h) => inRing(pt, h)));
  };
  const round = (n) => Number(n.toFixed(5));
  const bad = [];
  let traced = 0;
  for (const e of seed.events) {
    const r = recs[e.id];
    if (!e.point) {
      if (r?.at || r?.marker) bad.push(`${e.id}: drawn, though the seed gives no point`);
      continue;
    }
    const got = pointOf(e.point);
    if (!got) bad.push(`${e.id}: ${e.point.source} has no single match`);
    else if (JSON.stringify(r?.at) !== JSON.stringify(got[0].map(round))) bad.push(`${e.id}: its marker is not its ${e.point.source} point`);
    else if (!inside(got[0], got[1])) bad.push(`${e.id}: outside ${got[1]}`);
    else if (!countries.some((c) => c.properties.ADM0_A3 === got[1] && c.properties.NAME_BN)) bad.push(`${e.id}: ${got[1]} has no label on world.pmtiles`);
    else traced++;
  }
  check(bad.length === 0, `world-revolutions: every marker is its pinned file's point, inside its own labelled country (${traced} of ${seed.events.length} events; ${seed.events.filter((e) => !e.point).length} with none)${bad.length ? ` — not ${bad.join('; ')}` : ''}`);

  // Every Bengali string a student sees on this map (the user's review, 2026-10-01): no project-internal
  // word, one century and decade form, «সূত্র» for a source, and no stray space before , ; । or doubled.
  const dir = path.join(SERVED, 'maps/world-revolutions');
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'descriptor.json'), 'utf8'));
  const readMap = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const itemFields = Object.entries(d.records.items.fields).filter(([, fd]) => fd.display !== false && fd.type === 'text').map(([f]) => f);
  const shown = [
    ...Object.values(recs).flatMap((r) => itemFields.map((f) => r[f]).filter((v) => typeof v === 'string')),
    ...Object.values(readMap('places.json')).map((p) => p.nameBn),
    ...Object.values(readMap('tabs.json')).flatMap((t) => [t.titleBn, t.placeholderBn]),
    ...Object.values(readMap('groups.json')).map((g) => g.nameBn),
    ...readMap('info.json').lines.map((l) => l.text),
    d.title.bn,
    d.controls.find((c) => c.type === 'picker').placeholder,
    ...d.controls.find((c) => c.type === 'picker').groupBy.order,
    ...d.legend.items.map((i) => i.label),
    ...Object.values(d.info.headings),
    ...Object.values(d.sheets).flatMap((sh) => (sh.rows ?? []).map((r) => r.label).filter(Boolean)),
  ];
  const INTERNAL = /পিন|উৎস|ভিত্তিমানচিত্র|\bNE-|COD-AB|Natural Earth|\bextract|\bseed\b|pending|basemap|\bpin(ned)?\b/i;
  // One century form, the ordinal word with «শতক» as the NCTB book writes «অষ্টাদশ শতকের শেষার্ধে» (p. ১১৩), spelt
  // «উনবিংশ» as bn Wikipedia and the exam spell it; decades as «১৯৮০-এর দশক». A quoted source («…») keeps its own.
  const WRONG = [/[০-৯]+শ? শতক/, /শতাব্দী/, /ঊনবিংশ/, /(?<![ঀ-৿])(এগারো|সতেরো|আঠারো|উনিশ|বিশ|একুশ) শতক/, /[০-৯]-র দশক/];
  const unquoted = (t) => {
    for (let prev; prev !== t; ) [prev, t] = [t, t.replace(/«[^«»]*»|“[^“”]*”/g, '')];
    return t;
  };
  const badText = shown.filter((t) => INTERNAL.test(t) || WRONG.some((re) => re.test(unquoted(t))) || / [,;।]|  /.test(t));
  check(badText.length === 0, `world-revolutions: every shown Bengali string (${shown.length}) is free of project words, holds one century and decade form, and has no space before , ; । or doubled${badText.length ? ` — not: ${badText.slice(0, 4).join(' | ')}` : ''}`);
}

// ---- maritime-zones (work in progress): the seed alone, step 1 -------------------------
// Two sources, by the user's decision (2026-10-02): the DOALOS overview page and the
// Convention's full text linked from it, pinned in the seed by each downloaded file's
// SHA-256 and kept in tools/.cache/unclos/. A quote is committed only as its place in a
// pinned file's normalised text and its SHA-256 (the UN site's Terms of Use, step 1c):
// each is sliced out again and hashed, and no tracked file may hold its words.
console.log('\n---- maritime-zones: seed ----');
{
  const seedFile = path.join(DATA_SOURCES, 'maritime-zones/maritime-zones.seed.json');
  const seedText = fs.readFileSync(seedFile, 'utf8');
  const seed = JSON.parse(seedText);
  const dir = path.join(ROOT, 'tools/.cache/unclos');
  // The normalisation notes/maritime-zones.md defines: Latin-1, no script, style or comment,
  // a newline for each block tag, every other tag dropped, entities decoded, whitespace collapsed.
  const ENT = { nbsp: ' ', amp: '&', quot: '"', lt: '<', gt: '>', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: '–', mdash: '—' };
  const textOf = (buf) =>
    buf
      .toString('latin1')
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '')
      .replace(/<(p|div|br|li|tr|table|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
      .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m)
      .replace(/\s+/g, ' ');
  const text = {}; // "<source>/<file>" -> that pinned file's normalised text
  const badPins = [];
  for (const [id, s] of Object.entries(seed.sources)) {
    for (const [file, p] of Object.entries(s.files)) {
      const at = path.join(dir, file);
      const buf = fs.existsSync(at) ? fs.readFileSync(at) : null;
      if (!buf || buf.length !== p.bytes || crypto.createHash('sha256').update(buf).digest('hex') !== p.sha256) badPins.push(`${id}/${file}`);
      else text[`${id}/${file}`] = textOf(buf);
    }
  }
  check(badPins.length === 0, `maritime-zones: each source file is the pinned one (${Object.values(seed.sources).reduce((n, s) => n + Object.keys(s.files).length, 0)} files, tools/.cache/unclos/)${badPins.length ? ` — not: ${badPins.join(', ')}` : ''}`);
  // The seed's pins are the ones tools/sources.json records (unclosOverview, unclosConvention).
  const listed = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
  const pinOf = { 'overview.html': listed.unclosOverview && { bytes: listed.unclosOverview.size, sha256: listed.unclosOverview.sha256 } };
  for (const [f, p] of Object.entries(listed.unclosConvention?.files ?? {})) pinOf[f] = { bytes: p.size, sha256: p.sha256 };
  const seedPins = Object.values(seed.sources).flatMap((s) => Object.entries(s.files));
  const drift = seedPins.filter(([f, p]) => pinOf[f]?.bytes !== p.bytes || pinOf[f]?.sha256 !== p.sha256).map(([f]) => f);
  check(drift.length === 0 && Object.keys(pinOf).length === seedPins.length, `maritime-zones: the seed's ${seedPins.length} pins are tools/sources.json's${drift.length ? ` — not: ${drift.join(', ')}` : ''}`);

  // Every sentence and every drawing position cites; each quote is its place in a pinned file's
  // normalised text: sliced there, it is at most 15 words and hashes to the recorded SHA-256.
  const cites = [];
  const uncited = [];
  const walkCites = (v, where) => {
    if (Array.isArray(v)) v.forEach((x, i) => walkCites(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') {
      if ('cite' in v) {
        if (!Array.isArray(v.cite) || !v.cite.length) uncited.push(where);
        else for (const c of v.cite) cites.push({ ...c, where });
      }
      for (const [k, x] of Object.entries(v)) if (k !== 'cite') walkCites(x, `${where}.${k}`);
    }
  };
  walkCites(seed.items, 'items');
  walkCites(seed.textOnly, 'textOnly');
  walkCites(seed.drawing, 'drawing');
  const sentences = [...seed.items, ...seed.textOnly].flatMap((i) => i.sentences ?? []);
  const quoteOf = (c) => {
    const t = text[`${c.source}/${c.file}`];
    if (typeof t !== 'string' || !Number.isInteger(c.offset) || !Number.isInteger(c.length) || c.offset < 0 || c.length < 1 || c.offset + c.length > t.length) return null;
    return t.slice(c.offset, c.offset + c.length);
  };
  const quotes = [];
  const badQuotes = cites.filter((c) => {
    const q = quoteOf(c);
    if (q !== null) quotes.push(q);
    return 'quote' in c || !c.at || q === null || q.trim().split(/\s+/).length > 15 || crypto.createHash('sha256').update(q).digest('hex') !== c.sha256;
  });
  check(uncited.length === 0 && sentences.every((s) => s.cite?.length), `maritime-zones: every sentence (${sentences.length}) and every drawn position cites its source${uncited.length ? ` — not: ${uncited.join(', ')}` : ''}`);
  check(badQuotes.length === 0, `maritime-zones: every quote (${cites.length}) is its source, place, file, offset and length, at most 15 words there, matching its SHA-256, with no words committed${badQuotes.length ? ` — not: ${badQuotes.slice(0, 3).map((c) => `${c.where} (${c.at})`).join('; ')}` : ''}`);

  // No tracked file may hold a quote's words (whitespace collapsed, so a wrapped line counts too),
  // as written or as a JSON string would escape them.
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean);
  const forms = quotes.flatMap((q) => [q, JSON.stringify(q).slice(1, -1)]);
  const holding = new Set();
  for (const f of tracked) {
    const at = path.join(ROOT, f);
    if (!fs.existsSync(at) || fs.statSync(at).size > 64 * 1024 * 1024) continue;
    const buf = fs.readFileSync(at);
    if (buf.subarray(0, 8000).includes(0)) continue; // binary
    const flat = buf.toString('utf8').replace(/\s+/g, ' ');
    if (forms.some((q) => flat.includes(q))) holding.add(f);
  }
  check(holding.size === 0 && quotes.length === cites.length, `maritime-zones: none of the ${quotes.length} quotes appears in any of the ${tracked.length} tracked files${holding.size ? ` — found in: ${[...holding].join(', ')}` : ''}`);

  // The picker's seven items, coast to sea, and the three lines shown only as text.
  const ITEMS = ['internal-waters', 'territorial-sea', 'contiguous-zone', 'eez', 'continental-shelf', 'high-seas', 'the-area'];
  const TEXT_ONLY = ['straits', 'archipelagic-waters', 'land-locked-states'];
  check(JSON.stringify(seed.items.map((i) => i.id)) === JSON.stringify(ITEMS) && JSON.stringify(seed.textOnly.map((i) => i.id)) === JSON.stringify(TEXT_ONLY), `maritime-zones: the picker's ${ITEMS.length} items run coast to sea, and ${TEXT_ONLY.length} lines are text only`);

  // Every Bengali string is the "bn" of an object that says whether the user approved it.
  const bengali = [];
  const unflagged = [];
  let approved = 0;
  const walkBn = (v, where, owner, key) => {
    if (typeof v === 'string') {
      if (!/[ঀ-৿]/.test(v)) return;
      if (key === 'bn' && typeof owner?.approved === 'boolean') {
        bengali.push(v);
        if (owner.approved) approved++;
      } else unflagged.push(where);
    } else if (Array.isArray(v)) v.forEach((x, i) => walkBn(x, `${where}[${i}]`, v, i));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkBn(x, `${where}.${k}`, v, k);
  };
  walkBn(seed, 'seed', null, null);
  check(unflagged.length === 0, `maritime-zones: every Bengali string (${bengali.length}) carries its approval flag (${approved} approved)${unflagged.length ? ` — not: ${unflagged.slice(0, 3).join(', ')}` : ''}`);

  // No project words, no stray spacing, nautical miles only, no e-mail address.
  const INTERNAL = /পিন|উৎস|ভিত্তিমানচিত্র|\bNE-|COD-AB|Natural Earth|\bextract|\bseed\b|pending|basemap|\bpin(ned)?\b/i;
  const badBn = bengali.filter((t) => INTERNAL.test(t) || / [,;।]|  /.test(t));
  check(badBn.length === 0, `maritime-zones: no Bengali string holds a project word or a space before , ; । or doubled${badBn.length ? ` — not: ${badBn.slice(0, 3).join(' | ')}` : ''}`);
  check(!/কিলোমিটার|কি\.মি\.|\bkm\b|kilomet/i.test(seedText), 'maritime-zones: distances in nautical miles only, no kilometre anywhere in the seed');
  check(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(seedText), 'maritime-zones: no e-mail address in the seed');
}

// ---- bangladesh-maritime-boundary (live 2026-10-08): the seed, its sources and quotes -----------
// Every source is pinned in the seed and in tools/sources.json (bangladeshMaritime) and kept in
// tools/.cache/bd-maritime/. A coordinate's citation is its place in the pinned PDF's text, as
// pdftotext prints it (notes/bangladesh-maritime-boundary.md), and the SHA-256 of the quote: each is
// sliced out again, hashed, and read back as the seed's numbers; no tracked file may hold its words.
// A scanned page has no text: its citation says so and gives the page.
console.log('\n---- bangladesh-maritime-boundary: seed ----');
{
  const MB = 'bangladesh-maritime-boundary';
  const seedText = fs.readFileSync(path.join(DATA_SOURCES, MB, `${MB}.seed.json`), 'utf8');
  const seed = JSON.parse(seedText);
  const listed = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8')).bangladeshMaritime;
  const dir = path.join(HERE, '.cache', listed.dir);
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const text = {}; // "<source>/<text file>" -> the normalised text
  const badPins = [];
  let pinned = 0;
  for (const [id, s] of Object.entries(seed.sources)) {
    for (const [file, p] of Object.entries(s.files)) {
      pinned++;
      const l = listed.files[file];
      const buf = fs.existsSync(path.join(dir, file)) ? fs.readFileSync(path.join(dir, file)) : null;
      if (!l || l.source !== id || l.size !== p.bytes || l.sha256 !== p.sha256 || !buf || buf.length !== p.bytes || sha(buf) !== p.sha256) badPins.push(`${id}/${file}`);
      if (!p.text) continue;
      const tAt = path.join(dir, 'text', p.text.file);
      const t = fs.existsSync(tAt) ? fs.readFileSync(tAt) : null;
      if (!t || t.length !== p.text.bytes || sha(t) !== p.text.sha256 || l?.text?.sha256 !== p.text.sha256 || l?.text?.size !== p.text.bytes) badPins.push(`${id}/text/${p.text.file}`);
      else text[`${id}/${p.text.file}`] = t.toString('utf8').replace(/\s+/g, ' ');
    }
  }
  check(badPins.length === 0 && Object.keys(listed.files).length === pinned, `${MB}: each of the ${pinned} source files, and the ${Object.keys(text).length} texts quoted from, is the pinned one, as tools/sources.json records it${badPins.length ? ` — not: ${badPins.join(', ')}` : ''}`);

  // Every point, line part and ⓘ line cites; a quote is sliced, at most 15 words, matching its SHA-256.
  const cites = [];
  const walk = (v, where) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') {
      if ('cite' in v) for (const c of v.cite) cites.push({ ...c, where });
      for (const [k, x] of Object.entries(v)) if (k !== 'cite') walk(x, `${where}.${k}`);
    }
  };
  walk(seed, 'seed');
  const uncited = [...seed.items.flatMap((i) => Object.entries(i.rows ?? {}).filter(([, r]) => !r.cite?.length).map(([k]) => `${i.id}.rows.${k}`)), ...Object.entries(seed.points).filter(([, p]) => !p.cite?.length).map(([k]) => `points.${k}`), ...Object.entries(seed.lines).filter(([, l]) => !l.cite?.length).map(([k]) => `lines.${k}`), ...Object.values(seed.lines).flatMap((l) => l.parts).filter((p) => p.kind !== 'geodesic' && !p.cite?.length).map((p) => p.kind), ...seed.info.filter((l) => !l.cite?.length).map((l) => l.bn.slice(0, 20))];
  check(uncited.length === 0, `${MB}: every point (${Object.keys(seed.points).length}), line, azimuth or envelope and ⓘ line (${seed.info.length}) cites its source${uncited.length ? ` — not: ${uncited.join(', ')}` : ''}`);
  const quotes = [];
  const badCites = cites.filter((c) => {
    if (!(c.source in seed.sources) || !c.at || 'quote' in c) return true;
    if (c.offset === undefined) return false; // a place without words: a scanned page, or a paragraph
    const t = text[`${c.source}/${c.file}`];
    if (typeof t !== 'string' || !Number.isInteger(c.offset) || !Number.isInteger(c.length) || c.offset < 0 || c.offset + c.length > t.length) return true;
    const q = t.slice(c.offset, c.offset + c.length);
    quotes.push(q);
    return q.trim().split(/\s+/).length > 15 || sha(q) !== c.sha256;
  });
  check(badCites.length === 0 && quotes.length > 0, `${MB}: every citation (${cites.length}) names a source and its place; each of the ${quotes.length} quotes is at its file, offset and length, at most 15 words, matching its SHA-256, with no words committed${badCites.length ? ` — not: ${badCites.slice(0, 3).map((c) => `${c.where} (${c.at})`).join('; ')}` : ''}`);
  const scans = cites.filter((c) => c.scan);
  check(scans.every((c) => c.offset === undefined && Object.values(seed.sources[c.source].files).every((f) => !f.text)), `${MB}: the ${scans.length} citations of a scanned page give the page and no offset, and their files have no text`);
  // Each coordinate quote reads back as the seed's own numbers.
  const numbers = (s) => s.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const misread = [];
  for (const [k, p] of Object.entries(seed.points)) {
    const want = JSON.stringify([...p.lat, ...p.lon]);
    for (const c of [...p.cite.filter((c) => c.offset !== undefined)]) if (JSON.stringify(numbers(text[`${c.source}/${c.file}`].slice(c.offset, c.offset + c.length))) !== want) misread.push(k);
    for (const c of p.crossCheck?.cite ?? []) if (JSON.stringify(numbers(text[`${c.source}/${c.file}`].slice(c.offset, c.offset + c.length))) !== JSON.stringify([...p.crossCheck.lat, ...p.crossCheck.lon])) misread.push(`${k} (cross-check)`);
  }
  const prov3 = seed.checkOnly.prov3;
  const pc = prov3.cite[0];
  if (JSON.stringify(numbers(text[`${pc.source}/${pc.file}`].slice(pc.offset, pc.offset + pc.length))) !== JSON.stringify([...prov3.lat, ...prov3.lon])) misread.push('checkOnly.prov3');
  check(misread.length === 0, `${MB}: every quoted coordinate reads back as the seed's numbers (${Object.values(seed.points).filter((p) => p.cite.some((c) => c.offset !== undefined)).length} points, the CLCS cross-check and the appendix's start)${misread.length ? ` — not: ${misread.join(', ')}` : ''}`);

  // No tracked file may hold a quote's words (whitespace collapsed), as written or JSON-escaped. A quote of three
  // words or fewer is a name, a date or a number — a fact the seed states, not reusable text (step 2, 2026-10-07).
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean);
  const worded = quotes.filter((q) => q.trim().split(/\s+/).length > 3);
  const forms = worded.flatMap((q) => [q, JSON.stringify(q).slice(1, -1)]);
  const holding = new Set();
  for (const f of [...tracked, `data-sources/${MB}/${MB}.seed.json`, `tools/build-${MB}.mjs`, `notes/${MB}.md`]) {
    const at = path.join(ROOT, f);
    if (!fs.existsSync(at) || fs.statSync(at).size > 64 * 1024 * 1024) continue;
    const buf = fs.readFileSync(at);
    if (buf.subarray(0, 8000).includes(0)) continue; // binary
    const flat = buf.toString('utf8').replace(/\s+/g, ' ');
    if (forms.some((q) => flat.includes(q))) holding.add(f);
  }
  check(holding.size === 0, `${MB}: none of the ${worded.length} quotes of four words or more (of ${quotes.length}) appears in any tracked file, the seed, the build or the notes${holding.size ? ` — found in: ${[...holding].join(', ')}` : ''}`);

  // Step 1's five items, and nothing the user left out (2026-10-05): no grey area, no 12/24/200 nm line drawn. A
  // card row may name the grey area (step 2), so the card's rows and labels are not read for it.
  const ITEMS = ['myanmar-line', 'india-line', 'st-martins', 'baselines-2015', 'junction'];
  check(JSON.stringify(seed.items.map((i) => i.id)) === JSON.stringify(ITEMS) && !/"(greyArea|grayArea|zones|eezLine|limit(12|24|200))"/.test(JSON.stringify({ ...seed, rowLabels: undefined, items: seed.items.map(({ rows, ...i }) => i) })), `${MB}: the five items of step 1, and no grey area or distance line`);
  check(seed.lines.myanmar.parts.filter((p) => p.kind === 'envelope').every((p) => p.approximate === true && p.radiusNm === 12) && seed.coast.source in JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8')), `${MB}: the 8–9 envelope is flagged approximate, 12 nm round St Martin's, from the pinned coastline (${seed.coast.source})`);

  // Every Bengali string is the "bn" of an object that says whether the user approved it.
  const bengali = [];
  const unflagged = [];
  const walkBn = (v, where, owner, key) => {
    if (typeof v === 'string') {
      if (!/[ঀ-৿]/.test(v)) return;
      if (key === 'bn' && typeof owner?.approved === 'boolean') bengali.push({ text: v, approved: owner.approved });
      // A source's own title, as the source names itself, a place in it, and the spellings found for the user's choice carry no flag.
      else if (!(key === 'title' && /^seed\.sources\.\w+$/.test(where.replace(/\.title$/, ''))) && !(key === 'at' && owner?.source) && !(key === 'form' && where.startsWith('seed.spellings.'))) unflagged.push(where);
    } else if (Array.isArray(v)) v.forEach((x, i) => walkBn(x, `${where}[${i}]`, v, i));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkBn(x, `${where}.${k}`, v, k);
  };
  walkBn(seed, 'seed', null, null);
  check(unflagged.length === 0, `${MB}: every Bengali string (${bengali.length}) carries its approval flag (${bengali.filter((b) => b.approved).length} approved, ${bengali.filter((b) => !b.approved).length} awaiting the user)${unflagged.length ? ` — not: ${unflagged.slice(0, 3).join(', ')}` : ''}`);
  const INTERNAL = /পিন|উৎস|ভিত্তিমানচিত্র|\bNE-|COD-AB|Natural Earth|\bextract|\bseed\b|pending|basemap|\bpin(ned)?\b/i;
  const badBn = bengali.map((b) => b.text).filter((t) => INTERNAL.test(t) || / [,;।]|  /.test(t) || /কিলোমিটার|কি\.মি\./.test(t));
  check(badBn.length === 0, `${MB}: no Bengali string holds a project word, a kilometre or a space before , ; । or doubled${badBn.length ? ` — not: ${badBn.slice(0, 3).join(' | ')}` : ''}`);
  check(!bengali.some((b) => b.text === seed.area.label.bn && /একান্ত অর্থনৈতিক অঞ্চল/.test(b.text)), `${MB}: the sea area's label is not the exclusive economic zone's name`);
  check(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(seedText), `${MB}: no e-mail address in the seed`);

  // Official sources only (the user's rule, 2026-10-07): every source is the Government of Bangladesh's (its
  // portals, bdlaws, the Gazette), the two tribunals', Bangladesh's own CLCS submission, or a neighbour's note as
  // the UN publishes it; a citation names one of them, or the user. No textbook is used or named — not in the
  // seed, the build or what it writes.
  const OFFICIAL = ['gob-portal', 'bdlaws', 'gazette', 'itlos', 'pca', 'clcs-bangladesh', 'un-deposit'];
  const notOfficial = Object.entries(seed.sources).filter(([, s]) => !OFFICIAL.includes(s.kind)).map(([k]) => k);
  const strayCites = cites.filter((c) => c.source !== 'user' && !(c.source in seed.sources)).map((c) => c.where);
  const BOOK = /NCTB|textbook|পাঠ্যপুস্তক|পাঠ্যবই|ভূগোল ও পরিবেশ|বাংলাদেশ ও বিশ্বপরিচয়/i;
  const built = path.join(ROOT, 'docs/maps', MB);
  const bookIn = [
    [`data-sources/${MB}/${MB}.seed.json`, seedText],
    [`tools/build-${MB}.mjs`, fs.readFileSync(path.join(HERE, `build-${MB}.mjs`), 'utf8')],
    ...(fs.existsSync(built) ? fs.readdirSync(built).filter((f) => f.endsWith('.json')).map((f) => [`built ${f}`, fs.readFileSync(path.join(built, f), 'utf8')]) : []),
  ].filter(([, s]) => BOOK.test(s)).map(([f]) => f);
  // Live since 2026-10-08: on the home page under Bangladesh, out of the work in progress; its built files are held
  // to a fresh build, and its seed to its pin, by tools/verify-descriptor.mjs.
  check(!wipItems.some((w) => w.id === MB) && registry.maps.some((e) => e.id === MB && e.section === 'bangladesh') && fs.existsSync(path.join(ROOT, 'docs/maps', MB, 'descriptor.json')), `${MB}: live — in registry.json under Bangladesh, its folder under docs/maps/, no longer in tools/wip.json`);
  check(notOfficial.length === 0 && strayCites.length === 0 && bookIn.length === 0, `${MB}: official sources only — ${Object.keys(seed.sources).length} sources, each of an official kind (${[...new Set(Object.values(seed.sources).map((s) => s.kind))].join(', ')}); every citation names one of them or the user; no textbook in the seed, the build or the built files${notOfficial.length || strayCites.length || bookIn.length ? ` — not: ${[...notOfficial, ...strayCites, ...bookIn].slice(0, 4).join(', ')}` : ''}`);
}

// ---- org-members (live 2026-10-07): the seed, its pages and quotes --------------------------------
// Every page is pinned in the seed and in tools/sources.json (orgMembers) and kept in
// tools/.cache/org-members/sources/, with its text as tools/lib/html-text.mjs makes it. Each member,
// status and stated count cites its place in that text and the quote's SHA-256: sliced out again and
// hashed, no words committed (notes/org-members.md). Codes are shapes of the Bangladesh-view file.
console.log('\n---- org-members: seed ----');
{
  const OM = 'org-members';
  const seedText = fs.readFileSync(path.join(DATA_SOURCES, OM, `${OM}.seed.json`), 'utf8');
  const seed = JSON.parse(seedText);
  const allSources = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
  const listed = allSources.orgMembers;
  const dir = path.join(HERE, '.cache', listed.dir);
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const text = {};
  const badPins = [];
  const pages = Object.entries(seed.sources);
  for (const [id, s] of pages) {
    const l = listed.files[s.file];
    const raw = fs.existsSync(path.join(dir, s.file)) ? fs.readFileSync(path.join(dir, s.file)) : null;
    const t = fs.existsSync(path.join(dir, s.text.file)) ? fs.readFileSync(path.join(dir, s.text.file)) : null;
    const same = l && l.source === id && l.url === s.url && l.size === s.bytes && l.sha256 === s.sha256 && l.text.size === s.text.bytes && l.text.sha256 === s.text.sha256 && (l.extract ?? null) === (s.extract ?? null) && (l.via === 'browser') === (s.via === 'browser');
    if (!same || !raw || raw.length !== s.bytes || sha(raw) !== s.sha256 || !t || t.length !== s.text.bytes || sha(t) !== s.text.sha256) { badPins.push(id); continue; }
    if (sourceText(raw, s.extract) !== t.toString('utf8') || EMAIL.test(t.toString('utf8'))) { badPins.push(`${id} (text)`); continue; }
    text[id] = t.toString('utf8');
  }
  const authorityBad = pages.filter(([, s]) => !['organisation', 'presidency'].includes(s.authority) || (s.authority === 'presidency') !== (s.org === 'g7' || s.org === 'g20'));
  check(badPins.length === 0 && authorityBad.length === 0 && Object.keys(listed.files).length === pages.length && !listed.nctbBgs6, `${OM}: each of the ${pages.length} pages is the pinned one, as tools/sources.json records it, and each page's text is html-text.mjs's, with no e-mail address; a source is the organisation's own site or a presidency government's${badPins.length || authorityBad.length ? ` — not: ${[...badPins, ...authorityBad.map(([id]) => id)].join(', ')}` : ''}`);
  check(Object.values(seed.terms['eu-cc-by'] ?? {}).length && seed.terms['eu-cc-by'].licence === 'CC BY 4.0' && /CC BY 4\.0/.test(seed.terms['eu-cc-by'].credit ?? '') && pages.every(([, s]) => s.terms in seed.terms), `${OM}: every page names its terms; the EU's CC BY 4.0 credit is recorded`);

  // Every cite is at its offset and length in its page's text, at most 15 words, matching its SHA-256.
  const LISTS = ['members', 'observer', 'dialoguePartner', 'candidate', 'potentialCandidate'];
  const orgs = Object.entries(seed.organisations);
  const cites = [];
  for (const [id, o] of orgs) {
    for (const l of LISTS) for (const m of o[l] ?? []) cites.push({ id, where: `${id}.${l}.${m.code}`, c: m.cite });
    for (const n of o.nonCountry ?? []) cites.push({ id, where: `${id}.nonCountry.${n.key}`, c: n.cite });
    for (const [k, s] of Object.entries(o.stated ?? {})) cites.push({ id, where: `${id}.stated.${k}`, c: s.cite });
  }
  const sentences = [];
  const badCites = cites.filter(({ id, where, c }) => {
    const t = text[c?.source];
    if (typeof t !== 'string' || seed.sources[c.source].org !== id || !Number.isInteger(c.offset) || !Number.isInteger(c.length) || c.offset < 0 || c.offset + c.length > t.length) return true;
    const q = t.slice(c.offset, c.offset + c.length);
    if (where.includes('.stated.')) sentences.push(q);
    return q.trim().split(/\s+/).length > 15 || sha(q) !== c.sha256;
  });
  check(badCites.length === 0 && !/"quote"\s*:/.test(seedText), `${OM}: every member, status, non-country row and stated count (${cites.length}) cites its own organisation's page at an offset and length, at most 15 words, matching its SHA-256, with no words committed${badCites.length ? ` — not: ${badCites.slice(0, 4).map((b) => b.where).join(', ')}` : ''}`);
  // A stated count is the page's own sentence, not a name: no tracked file may hold it.
  const long = [...new Set(sentences.map((q) => q.replace(/\s+/g, ' ')))];
  const forms = long.flatMap((q) => [q, JSON.stringify(q).slice(1, -1)]);
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean);
  const holding = new Set();
  for (const f of [...tracked, `data-sources/${OM}/${OM}.seed.json`, `notes/${OM}.md`]) {
    const at = path.join(ROOT, f);
    if (!fs.existsSync(at) || fs.statSync(at).size > 64 * 1024 * 1024) continue;
    const buf = fs.readFileSync(at);
    if (buf.subarray(0, 8000).includes(0)) continue;
    const flat = buf.toString('utf8').replace(/\s+/g, ' ');
    if (forms.some((q) => flat.includes(q))) holding.add(f);
  }
  check(holding.size === 0, `${OM}: none of the ${long.length} sentence quotes appears in any tracked file, the seed or the notes${holding.size ? ` — found in: ${[...holding].join(', ')}` : ''}`);

  // Codes are shapes of the Bangladesh-view countries file; a list holds a code once, and an
  // organisation gives a country one status; non-country rows carry no code, so nothing colours them.
  const bdg = JSON.parse(fs.readFileSync(path.join(CACHE, seed.geometry.file), 'utf8'));
  const shapes = new Set(bdg.features.map((f) => f.properties.ADM0_A3));
  const noShape = [], twice = [];
  for (const [id, o] of orgs) {
    const seen = new Set();
    for (const l of LISTS) for (const m of o[l] ?? []) {
      if (!shapes.has(m.code)) noShape.push(`${id}.${l}.${m.code}`);
      if (seen.has(m.code)) twice.push(`${id}.${m.code}`);
      seen.add(m.code);
    }
  }
  const codes = new Set(orgs.flatMap(([, o]) => LISTS.flatMap((l) => (o[l] ?? []).map((m) => m.code))));
  check(noShape.length === 0 && twice.length === 0 && orgs.every(([, o]) => (o.nonCountry ?? []).every((n) => !('code' in n) && LISTS.includes(n.role))), `${OM}: the ${codes.size} countries are shapes of ${seed.geometry.file}, each once per organisation, and the non-country rows carry no code${noShape.length + twice.length ? ` — not: ${[...noShape, ...twice].slice(0, 5).join(', ')}` : ''}`);
  const absorbs = Object.entries(seed.geometry.absorbs);
  check(absorbs.every(([k, v]) => shapes.has(k) && v.every((a) => !shapes.has(a))) && seed.geometry.ownShape.every((c) => shapes.has(c)) && !codes.has('ISR') && !codes.has('TWN'), `${OM}: the shapes that hold another territory (${absorbs.map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')}) are the file's, and no list names Israel or Taiwan`);

  // Statuses only as the pages state them: the five lists and no other, no suspension; each stated
  // count is its list's length.
  const stray = orgs.flatMap(([id, o]) => Object.keys(o).filter((k) => /suspen/i.test(k) || ['nctb', 'conflicts'].includes(k) || (Array.isArray(o[k]) && !LISTS.includes(k) && !['sources', 'nonCountry'].includes(k))).map((k) => `${id}.${k}`));
  check(stray.length === 0 && !/suspen/i.test(JSON.stringify(seed.organisations)) && LISTS.every((l) => l === 'members' || !seed.organisations.au[l]), `${OM}: statuses are members, observer, dialogue partner, candidate and potential candidate only, with no suspension and none for the AU${stray.length ? ` — not: ${stray.join(', ')}` : ''}`);
  const nc = (o, role) => (o.nonCountry ?? []).filter((n) => n.role === role).length;
  const COUNT = {
    count: (o) => o.members.length + nc(o, 'members'),
    countries: (o) => o.members.length,
    bodies: (o) => nc(o, 'members'),
    observers: (o) => (o.observer ?? []).length + nc(o, 'observer'),
    dialoguePartners: (o) => (o.dialoguePartner ?? []).length + nc(o, 'dialoguePartner'),
    aspiring: (o) => (o.candidate ?? []).length + (o.potentialCandidate ?? []).length,
  };
  const miscount = orgs.flatMap(([id, o]) => Object.entries(o.stated ?? {}).filter(([k, s]) => s.value !== undefined && (!COUNT[k] || COUNT[k](o) !== s.value)).map(([k, s]) => `${id}.${k} ${s.value}`));
  const stated = orgs.flatMap(([, o]) => Object.values(o.stated ?? {})).filter((s) => s.value !== undefined).length;
  check(miscount.length === 0, `${OM}: each of the ${stated} counts a page states is its list's length${miscount.length ? ` — not: ${miscount.join(', ')}` : ''}`);
  // Cites are an official page (the organisation's own, or a presidency government's) or the user.
  const citeBad = [];
  const walkCite = (v, where) => {
    if (Array.isArray(v)) v.forEach((x, i) => walkCite(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') {
      if (v.cite) {
        const c = v.cite;
        const official = c.source in seed.sources && ['organisation', 'presidency'].includes(seed.sources[c.source].authority);
        const user = c.source === 'user' && c.date === '2026-10-06' && !('offset' in c) && where.endsWith('.nameBn');
        if (!official && !user) citeBad.push(where);
      }
      for (const [k, x] of Object.entries(v)) if (k !== 'cite') walkCite(x, `${where}.${k}`);
    }
  };
  walkCite(seed.organisations, 'organisations');
  check(citeBad.length === 0 && !/nctb|NCTB|textbook|বিশ্বপরিচয়/.test(seedText), `${OM}: every cite is the organisation's own site, a presidency government's, or the user's decision of 2026-10-06, and no book is a source${citeBad.length ? ` — not: ${citeBad.slice(0, 4).join(', ')}` : ''}`);
  const asean = seed.organisations.asean;
  check(asean.members.length === 11 && asean.members.some((m) => m.code === 'TLS') && !seed.strings.info.conflictsHeading && !seed.strings.info.asean, `${OM}: ASEAN's 11 members include Timor-Leste, from its own site`);

  // Every Bengali string is the "bn" of an object that says whether the user approved it; a reused
  // name is the org-headquarters seed's, as approved there.
  const bengali = [];
  const unflagged = [];
  const walkBn = (v, where, owner, key) => {
    if (typeof v === 'string') {
      if (!/[ঀ-৿]/.test(v)) return;
      if (key === 'bn' && typeof owner?.approved === 'boolean') bengali.push({ text: v, approved: owner.approved, owner });
      else if (!(key === 'note' && typeof owner?.approved === 'boolean')) unflagged.push(where);
    } else if (Array.isArray(v)) v.forEach((x, i) => walkBn(x, `${where}[${i}]`, v, i));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkBn(x, `${where}.${k}`, v, k);
  };
  walkBn(seed, 'seed', null, null);
  const pending = bengali.filter((b) => !b.approved).map((b) => b.text);
  // The tab labels «সংস্থা» and «দেশ» approved by the user on 2026-10-07: every string now is.
  check(unflagged.length === 0 && pending.length === 0, `${OM}: all ${bengali.length} Bengali strings approved${unflagged.length || pending.length ? ` — not: ${[...unflagged, ...pending].slice(0, 4).join(', ')}` : ''}`);
  const hq = JSON.parse(fs.readFileSync(path.join(DATA_SOURCES, 'org-headquarters/organisations.seed.json'), 'utf8'));
  const hqNames = new Set(Object.values(hq).map((r) => r.nameBn));
  const reused = bengali.filter((b) => b.owner.from === 'org-headquarters seed');
  const namedByUser = ['ইউরোপীয় ইউনিয়ন', 'জি-৭', 'জি-২০'];
  check(reused.every((b) => hqNames.has(b.text)) && namedByUser.every((t) => bengali.some((b) => b.text === t && b.owner.cite?.source === 'user')), `${OM}: the ${reused.length} reused names are the org-headquarters seed's, and «ইউরোপীয় ইউনিয়ন», «জি-৭» and «জি-২০» cite the user`);
  const INTERNAL = /পিন|উৎস|ভিত্তিমানচিত্র|\bNE-|COD-AB|Natural Earth|\bextract|\bseed\b|pending|basemap|\bpin(ned)?\b/i;
  const badBn = bengali.map((b) => b.text).filter((t) => INTERNAL.test(t) || / [,;।]|  /.test(t));
  check(badBn.length === 0, `${OM}: no Bengali string holds a project word or a space before , ; । or doubled${badBn.length ? ` — not: ${badBn.slice(0, 3).join(' | ')}` : ''}`);
  const used = LISTS.filter((l) => orgs.some(([, o]) => o[l]?.length));
  check(used.every((l) => seed.strings.status[l] && seed.strings.legend[l]), `${OM}: every status a page states (${used.join(', ')}) has its label and legend line`);
  check(!EMAIL.test(seedText), `${OM}: no e-mail address in the seed`);
  // Live since 2026-10-07: on the home page under International, out of the work in progress; its built files
  // are held to a fresh build, and its seed to its pin, by tools/verify-descriptor.mjs.
  check(!wipItems.some((w) => w.id === OM) && registry.maps.some((e) => e.id === OM && e.section === 'international') && fs.existsSync(path.join(ROOT, 'docs/maps', OM, 'descriptor.json')), `${OM}: live — in registry.json under International, its folder under docs/maps/, no longer in tools/wip.json`);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
