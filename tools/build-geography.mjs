// Builds the five Geography maps — deserts, lakes, forests, mountains,
// waterfalls — from their approved seeds. One build, because they share one
// shape: a record is an area or a point, drawn with a photo marker, and shown
// on a card with its photo and credit.
//
//   data-sources/<map>/<map>.seed.json   INPUT: content, provenance, geometry, photo
//   docs/maps/<map>/records.json         one record each, shipped
//   docs/maps/<map>/areas.geojson        the areas drawn (maps with areas only)
//   docs/maps/<map>/photos/*.webp        made by tools/extract-commons-photos.mjs
//
//   node tools/build-geography.mjs [map ...]     (all five when none is named)
//
// The seeds are never rewritten here. Content fields ship as they stand; the
// geometry comes from the one source each record's `geometry` names; the
// photo files are checked, not made.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readSource } from './lib/geo.mjs';
import { simplifyFeatures, innerPoints } from './lib/border-traces.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Each map's seed and served folder, and how hard its areas are simplified.
// Change here if a map moves.
const MAPS = {
  deserts: { seed: 'data-sources/deserts/deserts.seed.json', dir: 'docs/maps/deserts', simplifyMetres: 0 },
  lakes: { seed: 'data-sources/lakes/lakes.seed.json', dir: 'docs/maps/lakes', simplifyMetres: 1000 },
  forests: { seed: 'data-sources/forests/forests.seed.json', dir: 'docs/maps/forests', simplifyMetres: 0 },
  mountains: { seed: 'data-sources/mountains/mountains.seed.json', dir: 'docs/maps/mountains', simplifyMetres: 0 },
  waterfalls: { seed: 'data-sources/waterfalls/waterfalls.seed.json', dir: 'docs/maps/waterfalls', simplifyMetres: 0 },
};
// The committed extracts a seed's geometry may name.
const SOURCES = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
const EXTRACTS = {
  wikidata: SOURCES.wikidataPoints,
  osm: SOURCES.osmWaterfalls,
  resolve: { file: SOURCES.resolveEcoregions.extract, sha256: SOURCES.resolveEcoregions.extractSha256 },
};

// The content fields a record may ship. Everything else in a seed is build
// input or provenance and stays behind.
const SHIPPED = ['groupBn', 'nameBn', 'nameEn', 'typeBn', 'countriesBn', 'areaBn', 'heightBn', 'noteBn'];
// Licences a shipped photo may carry.
const FREE_LICENCES = /^(Public domain|CC0( 1\.0)?|CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0))$/;
// Every marker on a map loads at once, so markers are held small; a card
// loads only when it opens. The approved sample was 1.9 KB and 9.7 KB.
const PHOTO_MAX_KB = { marker: 8, card: 40 };

/*
 * Frames, measured at phone width (390 px viewport, 368 px of map, the card
 * open). A point's frame is FRAME_HALF either side of it, as the headquarters
 * map measured, landing near z5.5. An area's frame is its extent, never
 * narrower than a point's — a small lake framed tight would land past z6,
 * where the world tiles stop — and never past ±80° latitude, which Mercator
 * cannot frame.
 */
const FRAME_HALF = { lon: 2.6, lat: 3.0 };
const FRAME_LAT_LIMIT = 80;

/*
 * PINNED: each record's geometry exactly as its source has it, before any
 * processing. A move means a different feature was matched or the source
 * changed — stop and report old and new; never re-pin to make a build pass.
 */
const EXPECTED = JSON.parse(fs.readFileSync(path.join(HERE, 'geography-pins.json'), 'utf8'));

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const readExtract = (name) => {
  const e = EXTRACTS[name];
  const text = fs.readFileSync(path.join(ROOT, e.file), 'utf8');
  if (sha256(text) !== e.sha256) throw new Error(`${e.file} has changed.\n  pinned ${e.sha256}\n  actual ${sha256(text)}`);
  return JSON.parse(text);
};
const extracts = {};
const extract = (name) => (extracts[name] ??= readExtract(name));
const neFiles = {};
const neFile = (file) => (neFiles[file] ??= readSource(file));

// A match value is one exact value, or a list of exact values any of which may answer.
const matches = (props, match) => Object.entries(match).every(([k, v]) => (Array.isArray(v) ? v.includes(props[k]) : props[k] === v));

/** One record's geometry, from the one source its seed names. */
function resolveGeometry(id, g) {
  if (g.area) {
    const a = g.area;
    if (a.source === 'naturalEarth') {
      const hits = neFile(a.file).features.filter((f) => matches(f.properties, a.match));
      // One feature, or as many as a list of values names, or as many as the seed says.
      const want = a.count ?? Object.values(a.match).find(Array.isArray)?.length ?? 1;
      if (hits.length !== want) throw new Error(`${id}: ${hits.length} features in ${a.file} match ${JSON.stringify(a.match)} — expected ${want}`);
      const polys = hits.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
      return { kind: 'area', geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }, from: `Natural Earth ${a.file} ${JSON.stringify(a.match)}` };
    }
    if (a.source === 'resolve') {
      const f = extract('resolve').features.find((x) => x.properties.id === a.id);
      if (!f) throw new Error(`${id}: no "${a.id}" in the RESOLVE extract`);
      return { kind: 'area', geometry: f.geometry, from: `RESOLVE Ecoregions 2017 (${a.id})` };
    }
  }
  const p = g.point;
  if (p?.source === 'naturalEarth') {
    const hits = neFile(p.file).features.filter((f) => matches(f.properties, p.match));
    if (hits.length !== 1) throw new Error(`${id}: ${hits.length} features in ${p.file} match ${JSON.stringify(p.match)} — expected exactly one`);
    return { kind: 'point', geometry: { type: 'Point', coordinates: hits[0].geometry.coordinates.map((n) => Number(n.toFixed(5))) }, from: `Natural Earth ${p.file} ${JSON.stringify(p.match)}` };
  }
  if (p?.source === 'wikidata') {
    const w = extract('wikidata').points[p.qid];
    if (!w) throw new Error(`${id}: ${p.qid} is not in the Wikidata extract`);
    return { kind: 'point', geometry: { type: 'Point', coordinates: w.at }, from: `Wikidata ${p.qid} P625` };
  }
  if (p?.source === 'osm') {
    const f = extract('osm').features.find((x) => x.properties.osmNode === p.node);
    if (!f || f.properties.record !== id) throw new Error(`${id}: node ${p.node} is not in the OSM extract for it`);
    return { kind: 'point', geometry: f.geometry, from: `OSM node ${p.node}` };
  }
  throw new Error(`${id}: its geometry names no source this build knows`);
}

const extent = (geometry) => {
  const pts = JSON.stringify(geometry.coordinates).match(/-?\d+(\.\d+)?(e-?\d+)?,-?\d+(\.\d+)?(e-?\d+)?/g).map((s) => s.split(',').map(Number));
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
};
const frameOf = ([w, s, e, n], [cx, cy]) =>
  [Math.min(w, cx - FRAME_HALF.lon), Math.max(Math.min(s, cy - FRAME_HALF.lat), -FRAME_LAT_LIMIT), Math.max(e, cx + FRAME_HALF.lon), Math.min(Math.max(n, cy + FRAME_HALF.lat), FRAME_LAT_LIMIT)].map((v) => Number(v.toFixed(3)));
const cropped = (p) => {
  const [W, H] = p.size;
  return Object.values(p.crop).some(([x, y, w, h]) => x !== 0 || y !== 0 || w !== W || h !== H);
};

const only = process.argv.slice(2);
for (const [map, cfg] of Object.entries(MAPS)) {
  if (only.length && !only.includes(map)) continue;
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, cfg.seed), 'utf8'));
  const dir = path.join(ROOT, cfg.dir);

  // ---- the seed's own rules -------------------------------------------------
  const problems = [];
  for (const [id, r] of Object.entries(seed)) {
    if (r.id !== id) problems.push(`${id}: its id field says "${r.id}"`);
    for (const f of ['groupBn', 'nameBn', 'nameEn', 'countriesBn']) if (typeof r[f] !== 'string' || !r[f]) problems.push(`${id}: ${f} is missing`);
    // A number ships only with its page pinned to a revision and what it states.
    for (const f of ['areaBn', 'heightBn']) {
      if (r[f] === undefined || r[f] === null) continue;
      const c = r.sources?.[f];
      if (!Array.isArray(c) || !c.length || !c.every((x) => /oldid=\d+/.test(x.url ?? '') && x.states)) problems.push(`${id}.${f}: not cited to a pinned revision with what it states`);
    }
    for (const [f, v] of Object.entries(r.sources ?? {})) {
      const hosts = Array.isArray(v) ? v.filter((c) => c.url).map((c) => new URL(c.url).host + new URL(c.url).pathname + new URL(c.url).searchParams.get('title')) : [];
      if (new Set(hosts).size !== hosts.length) problems.push(`${id}.sources.${f}: the same page cited twice`);
    }
    const p = r.photo;
    if (p) {
      for (const f of ['commonsFile', 'page', 'author', 'licence', 'sha1', 'size', 'crop']) if (!p[f]) problems.push(`${id}.photo: no ${f}`);
      if (!FREE_LICENCES.test(p.licence ?? '')) problems.push(`${id}.photo: licence "${p.licence}" is not one these maps may ship`);
      for (const kind of ['marker', 'card']) {
        const file = path.join(dir, 'photos', `${id}-${kind}.webp`);
        if (!fs.existsSync(file)) problems.push(`${id}.photo: ${path.relative(ROOT, file)} is missing — run tools/extract-commons-photos.mjs ${map}`);
        else if (fs.statSync(file).size > PHOTO_MAX_KB[kind] * 1024) problems.push(`${id}.photo: ${kind} file is over ${PHOTO_MAX_KB[kind]} KB`);
      }
    }
    if (!r.geometry) problems.push(`${id}: no geometry — every record names one source for its place`);
  }
  if (problems.length) throw new Error(`${map}: the seed breaks its own rules:\n  ${problems.join('\n  ')}`);

  // ---- geometry, pinned ----------------------------------------------------
  const resolved = {};
  const moved = [];
  const pins = (EXPECTED[map] ??= {});
  for (const [id, r] of Object.entries(seed)) {
    const g = resolveGeometry(id, r.geometry);
    const hash = sha256(JSON.stringify(g.geometry.coordinates)).slice(0, 16);
    if (pins[id] !== hash) moved.push(`${map}/${id}: pinned ${pins[id] ?? '(none)'}, now ${hash} — ${g.from}`);
    resolved[id] = g;
  }
  const stale = Object.keys(pins).filter((id) => !(id in seed));
  if (moved.length || stale.length)
    throw new Error(`geometry pins do not hold — stop and report, never re-pin to pass:\n  ${[...moved, ...stale.map((id) => `${map}/${id}: pinned but no longer in the seed`)].join('\n  ')}`);

  // Areas are simplified for shipping; the marker sits at the pole of
  // inaccessibility of the very polygon drawn, so it cannot fall outside it.
  const areaIds = Object.keys(resolved).filter((id) => resolved[id].kind === 'area');
  let areaFeatures = areaIds.map((id) => ({ type: 'Feature', properties: { id }, geometry: resolved[id].geometry }));
  if (cfg.simplifyMetres) areaFeatures = await simplifyFeatures(areaFeatures, cfg.simplifyMetres);
  const inner = await innerPoints(areaFeatures);

  // ---- records ---------------------------------------------------------------
  const out = {};
  for (const [id, r] of Object.entries(seed)) {
    const rec = {};
    for (const f of SHIPPED) if (f in r) rec[f] = r[f];
    const g = resolved[id];
    const at = g.kind === 'area' ? inner[id] : g.geometry.coordinates;
    rec.labelAt = at.map((n) => Number(n.toFixed(5)));
    rec.hasArea = g.kind === 'area';
    rec.frame = frameOf(g.kind === 'area' ? extent(areaFeatures.find((f) => f.properties.id === id).geometry) : [...at, ...at], at);
    if (r.photo) {
      rec.photo = {
        marker: `photos/${id}-marker.webp`,
        card: `photos/${id}-card.webp`,
        author: r.photo.author,
        licence: r.photo.licence,
        ...(r.photo.licenceUrl ? { licenceUrl: r.photo.licenceUrl } : {}),
        page: r.photo.page,
        // CC BY-SA asks the credit of a derivative to say what was changed.
        ...(cropped(r.photo) ? { cropped: true } : {}),
      };
    }
    out[id] = rec;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'records.json'), JSON.stringify(out, null, 2) + '\n');
  if (areaFeatures.length) fs.writeFileSync(path.join(dir, 'areas.geojson'), JSON.stringify({ type: 'FeatureCollection', features: areaFeatures }) + '\n');
  else if (fs.existsSync(path.join(dir, 'areas.geojson'))) fs.rmSync(path.join(dir, 'areas.geojson'));

  const withPhoto = Object.values(out).filter((r) => r.photo).length;
  const areaKB = areaFeatures.length ? (fs.statSync(path.join(dir, 'areas.geojson')).size / 1024).toFixed(1) : '0';
  console.log(`${map}: ${Object.keys(out).length} records — ${areaIds.length} areas (${areaKB} KB), ${Object.keys(out).length - areaIds.length} points; ${withPhoto} with a photo`);
  for (const [id, r] of Object.entries(seed)) if (r.geometry.withheld) console.log(`  ${id}: area withheld — ${r.geometry.withheld.reason}`);
}
