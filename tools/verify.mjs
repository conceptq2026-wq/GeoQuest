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
const RIVERS_SEED = path.join(DATA_SOURCES, 'bangladesh-rivers/bangladesh-rivers.seed.json');
const RIVERS_BUILD = path.join(HERE, 'build-diagram-bangladesh-rivers.mjs');
const RIVERS_PINS = path.join(HERE, 'bangladesh-rivers-pins.json');
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
  const S = readJ(RIVERS_SEED);
  const G = S.geometry;
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
  const osmFiles = [riversSources.osmBangladeshRivers, riversSources.osmBangladeshRiversPilot].map((e) => JSON.parse(pinned(path.join(ROOT, e.file), e.sha256).toString('utf8')));
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

  // 7b — every tributary and distributary has an end at its parent line or its recorded join point.
  const EXEMPT = ['karatoya', 'atrai', 'dhaleshwari', 'banshi'];
  const branches = Object.entries(G.lines).filter(([, l]) => l.role === 'tributary' || l.role === 'distributary');
  const viaJoin = [];
  const exempt = [];
  const alone = [];
  for (const [id, spec] of branches) {
    const pts = lineOf('bangladesh', id).flat();
    const ends = [pts[0], pts.at(-1)];
    const parentId = spec.join?.parent ?? (id === 'shitalakshya' ? 'oldBrahmaputra' : 'main');
    const parent = lineOf('bangladesh', parentId).flat();
    const toParent = Math.min(...ends.map((e) => nearestOnLine(e, parent).m));
    const toJoin = spec.join?.point ? Math.min(...ends.map((e) => distM(e, spec.join.point))) : null;
    if (spec.join?.point) {
      const j = spec.join;
      const w = j.node !== undefined ? spec.ways.map((x) => osmWays.get(x)).find((x) => x?.properties.nodes?.includes(j.node)) : osmWays.get(j.way);
      const p = w && (j.node !== undefined ? w.geometry.coordinates[w.properties.nodes.indexOf(j.node)] : w.geometry.coordinates[j.vertex]);
      check(Boolean(p) && spec.ways.includes(w.properties.osm_id) && distM(p, j.point) <= 2, `b. ${id}: the recorded join point is ${j.node !== undefined ? `node ${j.node}` : `vertex ${j.vertex}`} of way ${w?.properties.osm_id}, one of the line's own ways, within 2 m of the point`);
    }
    if (spec.join) {
      check(toParent <= 500 || (toJoin !== null && toJoin <= 500), `b. ${id}: an end is ${round(toParent)} m from the ${parentId} line${toJoin === null ? '' : `, ${round(toJoin)} m from its recorded join point`}`);
      if (toParent > 500) viaJoin.push(`${id} ${round(toParent / 1000, 1)} km`);
    } else if (toParent <= 500) {
      check(true, `b. ${id}: no join point recorded, but an end is ${round(toParent)} m from the ${parentId} line, so it passes on its own`);
      alone.push(`${id} ${round(toParent)} m`);
    } else {
      check(typeof spec.exempt === 'string' && spec.exempt.length > 20, `b. ${id}: no join point recorded, and the seed says why — exempt (nearest end ${round(toParent / 1000, 1)} km from the ${parentId} line)`);
      exempt.push(id);
    }
  }
  check(JSON.stringify(exempt.sort()) === JSON.stringify([...EXEMPT].sort()), `b. the exempt lines are exactly karatoya and atrai (the user's) and dhaleshwari and banshi (no source plots their offtake): ${exempt.join(', ')}`);

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
  check(same && Object.keys(pins).length === 11, `the build reproduces the ${built.length} committed files byte for byte, and its ${Object.keys(pins).length} geometry pins hold${same ? '' : ` — ${say.split('\n').slice(0, 3).join(' | ')}`}`);
  check(Boolean(seamLine) && Number(seamLine[1]) <= G.main.seam.maxM && Number(seamLine[3]) <= 500 && Number(seamLine[4]) <= 3, `d. the seam is ${seamLine?.[1]} m at ${seamLine?.[2]}°E (limit ${G.main.seam.maxM} m); the Jamuna ends ${seamLine?.[3]} m from the Padma, which ends ${seamLine?.[4]} m from the Meghna`);
  console.log(`bangladesh-rivers: a. ${drawnMarkers} markers within ${round(worst.px, 2)} px / ${round(worst.m)} m; b. ${branches.length - exempt.length} joined (${viaJoin.join(', ')} via the join point; ${alone.join(', ')} with no join point, on their own), ${exempt.length} exempt (${exempt.join(', ')}); c. entry ${round(entrySrc)} m from the border (BWDB's point ${round(entryBwdb)} m); d. main connected, gaps ≤ 500 m; e. ${drawnIds.size} lines, ${wayIds.size} ways, ${S.markers.length} markers traced; f. entry on the line and at the dash switch: ${entryF.join(', ')}`);
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
const drifted = registry.maps.filter((entry) => {
  const d = descriptors[keyOf(entry)];
  const kind = entry.kind ? { kind: entry.kind } : {};
  return d && JSON.stringify(entry) !== JSON.stringify({ id: d.id, ...kind, section: d.section, title: { en: d.title?.en, bn: d.title?.bn } });
});
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
  // A folder already there is the item it is listed as: its kind, its section
  // and its titles, so the preview's card and the live one will not differ.
  const drift = items.filter((w) => {
    const d = descriptors[w.kind === 'diagram' ? `diagram:${w.id}` : w.id];
    return d && (d.id !== w.id || d.section !== w.section || d.title?.bn !== w.title.bn || d.title?.en !== w.title.en);
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

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
