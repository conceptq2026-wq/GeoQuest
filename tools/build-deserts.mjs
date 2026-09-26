// Builds the deserts map from its seed.
//
//   data-sources/deserts/deserts.seed.json   INPUT: content, provenance, photo
//   docs/maps/deserts/records.json           one record per desert, shipped
//   docs/maps/deserts/areas.geojson          each desert's area, from Natural Earth
//   docs/maps/deserts/photos/*.webp          made by tools/extract-commons-photos.mjs
//
// The seed is never rewritten here. Every shipped field is taken from it as it
// stands; the area, its label point and its frame are derived from Natural
// Earth; the photo files are checked, not made.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readSource } from './lib/geo.mjs';
import { innerPoints } from './lib/border-traces.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed. Not served. Change here if it moves.
const SEED = path.join(ROOT, 'data-sources/deserts/deserts.seed.json');
// The map folder inside the served tree. Change here if the map moves.
const MAP_DIR = path.join(ROOT, 'docs/maps/deserts');

// Licences a shipped photo may carry: free to use, and all but PD/CC0 need
// the credit the card shows.
const FREE_LICENCES = /^(Public domain|CC0( 1\.0)?|CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0))$/;
// A photo file bigger than this is a mistake on a phone data plan.
const PHOTO_MAX_KB = { marker: 20, card: 80 };

/*
 * PINNED: each area's geometry exactly as Natural Earth has it, before any
 * processing. A move means the feature matched or its source changed —
 * stop and report old and new; never re-pin to make the build pass.
 */
const EXPECTED_AREA = {
  sahara: 'e42aa9aa89b9a86b',
};

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));

/*
|--------------------------------------------------------------------------
| THE SEED'S OWN RULES
|--------------------------------------------------------------------------
*/
const SHIPPED = ['nameBn', 'nameEn', 'typeBn', 'countriesBn', 'areaBn', 'noteBn'];
const problems = [];
for (const [id, r] of Object.entries(seed)) {
  if (r.id !== id) problems.push(`${id}: its id field says "${r.id}"`);
  if (!r.nameEn) problems.push(`${id}: no nameEn`);
  // A content field the seed carries is either cited or editor-verified; a
  // null is unverified and ships as null, to the pending list.
  for (const f of SHIPPED) {
    if (r[f] === undefined || r[f] === null || f === 'nameEn') continue;
    const v = r.sources?.[f];
    const ok = (typeof v === 'string' && /^editor-verified \d{4}-\d{2}-\d{2}/.test(v)) || (Array.isArray(v) && v.length >= 1 && v.every((c) => c.url && c.states));
    if (!ok) problems.push(`${id}.${f}: neither cited nor editor-verified`);
    const hosts = Array.isArray(v) ? v.map((c) => new URL(c.url).host) : [];
    if (new Set(hosts).size !== hosts.length) problems.push(`${id}.sources.${f}: two citations from ${hosts.join(', ')}`);
  }
  // The photo's credit is not optional: CC BY and CC BY-SA require it.
  const p = r.photo;
  if (p) {
    for (const f of ['commonsFile', 'page', 'author', 'licence', 'licenceUrl', 'sha1']) if (!p[f]) problems.push(`${id}.photo: no ${f}`);
    if (!FREE_LICENCES.test(p.licence ?? '')) problems.push(`${id}.photo: licence "${p.licence}" is not one this map may ship`);
    for (const kind of ['marker', 'card']) {
      const file = path.join(MAP_DIR, 'photos', `${id}-${kind}.webp`);
      if (!fs.existsSync(file)) problems.push(`${id}.photo: ${path.relative(ROOT, file)} is missing — run tools/extract-commons-photos.mjs`);
      else if (fs.statSync(file).size > PHOTO_MAX_KB[kind] * 1024) problems.push(`${id}.photo: ${kind} file is over ${PHOTO_MAX_KB[kind]} KB`);
    }
  }
}
if (problems.length) throw new Error(`the seed breaks its own rules:\n  ${problems.join('\n  ')}`);

/*
|--------------------------------------------------------------------------
| AREAS — Natural Earth's geography regions, matched by name AND class
|
| Never by name alone: the file has a "SAHARA" desert and a Saharan Atlas
| mountain range. The seed names the NAME and FEATURECLA to match, and
| exactly one feature must answer.
|--------------------------------------------------------------------------
*/
const regions = new Map();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const features = [];
const moved = [];
for (const [id, r] of Object.entries(seed)) {
  if (!r.area) continue;
  const file = regions.get(r.area.file) ?? readSource(r.area.file);
  regions.set(r.area.file, file);
  const hits = file.features.filter((f) => f.properties.NAME === r.area.NAME && f.properties.FEATURECLA === r.area.FEATURECLA);
  if (hits.length !== 1) throw new Error(`${id}: ${hits.length} ${r.area.FEATURECLA} features named ${r.area.NAME} — the match must be exactly one`);
  const hash = sha256(JSON.stringify(hits[0].geometry.coordinates)).slice(0, 16);
  if (EXPECTED_AREA[id] !== hash) moved.push(`${id}: pinned ${EXPECTED_AREA[id]}, now ${hash}`);
  features.push({ type: 'Feature', properties: { id, ne_id: hits[0].properties.NE_ID }, geometry: hits[0].geometry });
}
if (moved.length) throw new Error(`an area's geometry moved — stop and report, never re-pin to pass:\n  ${moved.join('\n  ')}`);
const unexpected = Object.keys(EXPECTED_AREA).filter((id) => !seed[id]?.area);
if (unexpected.length) throw new Error(`EXPECTED_AREA is stale: ${unexpected.join(', ')}`);

// The photo marker sits inside the area, at its pole of inaccessibility —
// computed from the very polygon drawn, so it cannot fall outside it.
const labelAt = await innerPoints(features.map((f) => ({ type: 'Feature', properties: { id: f.properties.id }, geometry: f.geometry })));

// A frame is the area's extent. A desert is region-scale, so it lands far
// under z6 at phone width; no widening is needed for basemap context.
const extent = (geometry) => {
  const pts = JSON.stringify(geometry.coordinates).match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g).map((p) => p.split(',').map(Number));
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))].map((n) => Number(n.toFixed(3)));
};

/*
|--------------------------------------------------------------------------
| RECORDS — the seed's content fields as they stand, plus what is derived
|--------------------------------------------------------------------------
*/
const out = {};
for (const [id, r] of Object.entries(seed)) {
  const rec = {};
  for (const f of SHIPPED) if (f in r) rec[f] = r[f];
  const area = features.find((f) => f.properties.id === id);
  rec.labelAt = labelAt[id] ?? null;
  rec.frame = area ? extent(area.geometry) : null;
  // The photo ships with its credit: the card cannot show one without the other.
  if (r.photo) {
    rec.photo = {
      marker: `photos/${id}-marker.webp`,
      card: `photos/${id}-card.webp`,
      author: r.photo.author,
      licence: r.photo.licence,
      licenceUrl: r.photo.licenceUrl,
      page: r.photo.page,
    };
  }
  out[id] = rec;
}

fs.mkdirSync(MAP_DIR, { recursive: true });
fs.writeFileSync(path.join(MAP_DIR, 'records.json'), JSON.stringify(out, null, 2) + '\n');
fs.writeFileSync(path.join(MAP_DIR, 'areas.geojson'), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');

console.log(`records: ${Object.keys(out).length}   areas: ${features.length}`);
for (const [id, r] of Object.entries(out)) console.log(`  ${id}: labelAt ${r.labelAt}  frame ${r.frame}  photo ${r.photo ? r.photo.licence : 'none'}`);
for (const kind of ['marker', 'card'])
  for (const id of Object.keys(out)) {
    const file = path.join(MAP_DIR, 'photos', `${id}-${kind}.webp`);
    if (fs.existsSync(file)) console.log(`  photos/${id}-${kind}.webp  ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
  }
