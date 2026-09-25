// Builds the org-headquarters map from its approved seed.
//
//   data-sources/org-headquarters/organisations.seed.json   INPUT, user-approved
//   data-sources/org-headquarters/cities.seed.json          derived, with provenance
//   docs/maps/org-headquarters/records.json                 organisations, shipped
//   docs/maps/org-headquarters/cities.json                  one record per city
//   docs/maps/org-headquarters/countries.json               the host countries
//   docs/maps/org-headquarters/countries.geojson            their outlines
//
// The seed is content and is never rewritten here: it is read, and everything
// the map needs beyond it — the cities, their points and frames, the host
// countries — is derived from it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readSource } from './lib/geo.mjs';
import { simplifyFeatures, innerPoints } from './lib/border-traces.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed and the derived provenance. Not served. Change here if it moves.
const SEED_DIR = path.join(ROOT, 'data-sources/org-headquarters');
// The map folder inside the served tree. Change here if the map moves.
const MAP_DIR = path.join(ROOT, 'docs/maps/org-headquarters');
// The committed OSM extract for the towns Natural Earth does not carry.
const OSM_FILE = path.join(ROOT, 'tools/sources/osm-places.geojson');

// Host countries are washed and outlined at z5–6 and ship to low-end phones,
// so they are simplified hard: 5 km is about three pixels at frame zoom.
// Where the outline leaves the coast, it is the basemap's own coarse
// coastline at these zooms that differs — 3 km moved the edge no visibly
// closer and cost half as much again in bytes.
const COUNTRY_SIMPLIFY_METRES = 5000;

// A city's frame: this far either side of its point. Measured at phone width
// (a 390 px viewport, 368 px of map, the sheet open): width is what limits
// the fit, and every frame lands at z5.5 — close enough to read the country
// around the city, under the z6 where the world tiles stop outside the detail
// areas. The latitude half is larger so a wide desktop map, which is limited
// by height instead, still stays under z6.
const FRAME_HALF = { lon: 2.6, lat: 3.0 };

const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/sources.json'), 'utf8'));
const NE_BASE = sources.naturalEarth.baseUrl;

const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'organisations.seed.json'), 'utf8'));

/*
|--------------------------------------------------------------------------
| THE SEED'S OWN RULES
|--------------------------------------------------------------------------
*/
const problems = [];
for (const [id, r] of Object.entries(seed)) {
  if (r.id !== id) problems.push(`${id}: its id field says "${r.id}"`);
  for (const f of ['category', 'pickerLabel', 'nameBn', 'cityBn', 'countryBn', 'nameEn', 'cityEn', 'iso3'])
    if (typeof r[f] !== 'string' || !r[f]) problems.push(`${id}: ${f} is missing`);
  // Every record is either editor-verified or cited; a `review` means neither
  // yet, and is allowed only while it says so.
  if (!r.sources && !r.review) problems.push(`${id}: no sources and no review`);
  // The user's own verification is a dated string; a citation is an object
  // with a URL. The two stay distinguishable.
  for (const [field, v] of Object.entries(r.sources ?? {})) {
    const ok = (typeof v === 'string' && /^editor-verified \d{4}-\d{2}-\d{2}/.test(v)) || (Array.isArray(v) && v.length >= 1 && v.every((c) => c.url && c.states));
    if (!ok) problems.push(`${id}.sources.${field}: neither an editor-verified date nor a citation with a URL`);
    // One host is one source, however many pages it has.
    const hosts = Array.isArray(v) ? v.map((c) => new URL(c.url).host) : [];
    if (new Set(hosts).size !== hosts.length) problems.push(`${id}.sources.${field}: two citations from ${hosts.join(', ')}`);
  }
}
if (problems.length) throw new Error(`the seed breaks its own rules:\n  ${problems.join('\n  ')}`);

/*
|--------------------------------------------------------------------------
| CITIES — one per (cityEn, iso3), in the order the seed first names them
|
| One marker per city rather than per organisation: Geneva hosts eighteen,
| and eighteen markers on one point is a stack nobody can tap.
|--------------------------------------------------------------------------
*/
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const cityKey = (r) => `${slug(r.cityEn)}-${r.iso3.toLowerCase()}`;

const cities = new Map();
for (const r of Object.values(seed)) {
  const key = cityKey(r);
  const c = cities.get(key);
  if (!c) {
    cities.set(key, { nameEn: r.cityEn, nameBn: r.cityBn, iso3: r.iso3, countryBn: r.countryBn });
    continue;
  }
  // One city, one Bengali name. A second spelling would be a content question.
  if (c.nameBn !== r.cityBn) throw new Error(`${key}: named "${c.nameBn}" and "${r.cityBn}" in the seed`);
  if (c.countryBn !== r.countryBn) throw new Error(`${key}: country "${c.countryBn}" and "${r.countryBn}" in the seed`);
}

/*
 * WHERE EACH CITY'S POINT COMES FROM. One source per city.
 *
 * Natural Earth populated places first, matched on name AND country code —
 * never name alone. A place Natural Earth knows under another name is listed
 * here rather than matched loosely: Gurugram was Gurgaon until 2016, and
 * Natural Earth still carries the old name.
 */
const NE_ALIASES = { 'Gurugram|IND': 'Gurgaon' };

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(',')[0]
    .replace(/^the /, '')
    .trim();

const places = readSource('ne_10m_populated_places_simple.geojson').features;
const osm = JSON.parse(fs.readFileSync(OSM_FILE, 'utf8'));
const osmSha = crypto.createHash('sha256').update(fs.readFileSync(OSM_FILE, 'utf8')).digest('hex');
if (osmSha !== sources.osmPlaces?.sha256)
  throw new Error(`tools/sources/osm-places.geojson has changed.\n  pinned ${sources.osmPlaces?.sha256}\n  actual ${osmSha}`);
const osmByKey = new Map(osm.features.map((f) => [f.properties.key, f]));

const unplaced = [];
for (const [key, c] of cities) {
  const seedKey = `${c.nameEn}|${c.iso3}`;
  const want = norm(NE_ALIASES[seedKey] ?? c.nameEn);
  const hits = places.filter(
    (f) => f.properties.adm0_a3 === c.iso3 && [f.properties.name, f.properties.nameascii, f.properties.namealt].filter(Boolean).some((n) => norm(n) === want),
  );
  if (hits.length > 1) throw new Error(`${key}: ${hits.length} Natural Earth places match — the match is not specific enough`);
  const o = osmByKey.get(seedKey);
  if (hits.length === 1 && o) throw new Error(`${key}: found in Natural Earth AND in the OSM extract — one source per city`);

  if (hits.length === 1) {
    const p = hits[0].properties;
    c.at = hits[0].geometry.coordinates.map((n) => Number(n.toFixed(5)));
    c.source = 'naturalEarth';
    c.sources = {
      at: [
        {
          title: `ne_10m_populated_places_simple — ${p.name}${NE_ALIASES[seedKey] ? ` (the pre-rename name of ${c.nameEn})` : ''}`,
          publisher: 'Natural Earth v5.1.2',
          url: `${NE_BASE}ne_10m_populated_places_simple.geojson`,
          states: `${p.name}, ${p.adm0name} (${p.adm0_a3}), ne_id ${p.ne_id}, ${p.featurecla}.`,
        },
      ],
    };
  } else if (o) {
    c.at = o.geometry.coordinates;
    c.source = 'osm';
    c.sources = {
      at: [
        {
          title: `OpenStreetMap node ${o.properties.osmNode} — ${o.properties.name}`,
          publisher: 'OpenStreetMap contributors, ODbL 1.0',
          url: `https://www.openstreetmap.org/node/${o.properties.osmNode}`,
          states: `place=${o.properties.place}, found by name inside a bounding box. Committed as tools/sources/osm-places.geojson.`,
        },
      ],
    };
  } else {
    unplaced.push(key);
  }
}
if (unplaced.length) throw new Error(`no point for: ${unplaced.join(', ')} — add it to the OSM extract, never guess one`);

// Frames centred on the point; see FRAME_HALF for how they were measured.
for (const c of cities.values()) {
  const [lon, lat] = c.at;
  c.frame = [lon - FRAME_HALF.lon, lat - FRAME_HALF.lat, lon + FRAME_HALF.lon, lat + FRAME_HALF.lat].map((n) => Number(n.toFixed(3)));
}

/*
|--------------------------------------------------------------------------
| HOST COUNTRIES — the emphasis, derived from iso3
|
| Selecting an organisation emphasises its host country the way border-lines
| emphasises the countries a line divides: a `countries` table with a point
| to label, an outline to wash, and a `refs` field on each organisation.
| The Bengali name is the seed's countryBn, the approved exam name, not
| Natural Earth's.
|--------------------------------------------------------------------------
*/
const countryBnByCode = new Map();
for (const r of Object.values(seed)) {
  const had = countryBnByCode.get(r.iso3);
  if (had && had !== r.countryBn) throw new Error(`${r.iso3}: "${had}" and "${r.countryBn}" in the seed`);
  countryBnByCode.set(r.iso3, r.countryBn);
}

const countryFile = readSource('ne_10m_admin_0_countries_bdg.geojson');
const byCode = new Map(countryFile.features.map((f) => [f.properties.ADM0_A3, f]));
// Codes the seed names that Natural Earth's Bangladesh point-of-view file has
// no feature for. Declared so a NEW gap fails instead of hiding behind these.
const KNOWN_NO_COUNTRY = ['ISR'];
const noCountry = [...countryBnByCode.keys()].filter((c) => !byCode.has(c));
const surprise = noCountry.filter((c) => !KNOWN_NO_COUNTRY.includes(c));
if (surprise.length) throw new Error(`no Natural Earth country for: ${surprise.join(', ')}`);
const stale = KNOWN_NO_COUNTRY.filter((c) => byCode.has(c) || !countryBnByCode.has(c));
if (stale.length) throw new Error(`KNOWN_NO_COUNTRY is stale: ${stale.join(', ')}`);

const codes = [...countryBnByCode.keys()].filter((c) => byCode.has(c)).sort();
// Then rounded to COUNTRY_DECIMALS: after a 5 km simplification the fifth
// decimal (one metre) is noise that only costs bytes. A ring that rounding
// collapses below a triangle is dropped — it was under a pixel at z6.
const COUNTRY_DECIMALS = 3;
const round = (ring) => {
  const out = [];
  for (const [x, y] of ring) {
    const pt = [Number(x.toFixed(COUNTRY_DECIMALS)), Number(y.toFixed(COUNTRY_DECIMALS))];
    const last = out[out.length - 1];
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
  }
  return out.length >= 4 ? out : null;
};
const roundPolygon = (rings) => {
  const kept = rings.map(round);
  return kept[0] ? kept.filter(Boolean) : null;
};
const countryFeatures = (
  await simplifyFeatures(
    codes.map((code) => ({ type: 'Feature', properties: { id: code }, geometry: byCode.get(code).geometry })),
    COUNTRY_SIMPLIFY_METRES,
  )
).map((f) => {
  const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(roundPolygon).filter(Boolean);
  if (!polys.length) throw new Error(`${f.properties.id}: nothing left after rounding`);
  return { type: 'Feature', properties: f.properties, geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } };
});
const countryPoints = await innerPoints(countryFeatures);
const countries = {};
for (const code of codes) {
  countries[code] = { nameEn: byCode.get(code).properties.NAME_EN, nameBn: countryBnByCode.get(code), labelAt: countryPoints[code] };
}

/*
|--------------------------------------------------------------------------
| ORGANISATIONS — the seed's shipped fields, plus the joins the map needs
|
| `cities` and `countries` are lists of keys, the same `refs` shape
| border-lines uses — one entry each today. `at` and `frame` are the city's,
| so selecting an organisation pulses its city and frames it.
|--------------------------------------------------------------------------
*/
// Provenance and identity stay in the seed; nothing here is content.
const NOT_SHIPPED = new Set(['id', 'sources', 'review']);
const organisations = {};
for (const [id, r] of Object.entries(seed)) {
  const out = {};
  for (const [k, v] of Object.entries(r)) if (!NOT_SHIPPED.has(k)) out[k] = v;
  const c = cities.get(cityKey(r));
  out.cities = [cityKey(r)];
  out.countries = [r.iso3];
  out.at = c.at;
  out.frame = c.frame;
  organisations[id] = out;
}

const cityRecords = {};
const citySeed = {};
for (const [key, c] of cities) {
  const { source, sources: cited, ...shipped } = c;
  cityRecords[key] = shipped;
  citySeed[key] = { ...shipped, geometrySource: source, sources: cited };
}

// ---- write ------------------------------------------------------------------
fs.mkdirSync(MAP_DIR, { recursive: true });
// Tables are pretty-printed, as border-lines ships them; geometry is minified.
const write = (dir, name, data) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(data, null, name.endsWith('.geojson') ? 0 : 2) + '\n');
  return `${path.relative(ROOT, file).replace(/\\/g, '/')}: ${(fs.statSync(file).size / 1024).toFixed(1)} KB`;
};
const sizes = [
  write(SEED_DIR, 'cities.seed.json', citySeed),
  write(MAP_DIR, 'records.json', organisations),
  write(MAP_DIR, 'cities.json', cityRecords),
  write(MAP_DIR, 'countries.json', countries),
  write(MAP_DIR, 'countries.geojson', { type: 'FeatureCollection', features: countryFeatures }),
];

// ---- report -----------------------------------------------------------------
const bySource = { naturalEarth: [], osm: [] };
for (const [key, c] of cities) bySource[c.source].push(key);
console.log(sizes.join('\n'));
console.log(`\norganisations: ${Object.keys(organisations).length}   cities: ${cities.size}   countries: ${codes.length} (+ ${KNOWN_NO_COUNTRY.join(', ')} with no outline)`);
console.log(`  Natural Earth: ${bySource.naturalEarth.length}`);
console.log(`  OSM:           ${bySource.osm.length}  ${bySource.osm.join(', ')}`);
console.log(`  aliases:       ${Object.entries(NE_ALIASES).map(([k, v]) => `${k} as ${v}`).join(', ')}`);
