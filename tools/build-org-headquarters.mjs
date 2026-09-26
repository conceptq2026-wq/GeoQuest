// Builds the org-headquarters map from its two approved seeds: international
// organisations, and technology companies, which the user put on the same map.
//
//   data-sources/org-headquarters/organisations.seed.json   INPUT, user-approved
//   data-sources/tech-headquarters/companies.seed.json      INPUT, user-approved
//   data-sources/org-headquarters/hubs.seed.json            INPUT, user-approved
//   data-sources/org-headquarters/cities.seed.json          derived, with provenance
//   docs/maps/org-headquarters/records.json                 organisations, shipped
//   docs/maps/org-headquarters/cities.json                  one record per city
//   docs/maps/org-headquarters/countries.json               the host countries
//   docs/maps/org-headquarters/countries.geojson            their outlines
//
// The seeds are content and are never rewritten here: they are read, and
// everything the map needs beyond them — the cities, their points and frames,
// the host countries — is derived from them.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readSource } from './lib/geo.mjs';
import { simplifyFeatures, innerPoints } from './lib/border-traces.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed and the derived provenance. Not served. Change here if it moves.
const SEED_DIR = path.join(ROOT, 'data-sources/org-headquarters');
// The technology companies' seed. Not served. Change here if it moves.
const TECH_SEED = path.join(ROOT, 'data-sources/tech-headquarters/companies.seed.json');
// The companies carry no category of their own; they are one picker group,
// shown after the organisations' eight. Label chosen by the user, 2026-09-26.
const TECH_CATEGORY = 'প্রযুক্তি প্রতিষ্ঠান';
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

const orgSeed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'organisations.seed.json'), 'utf8'));
const techSeed = JSON.parse(fs.readFileSync(TECH_SEED, 'utf8'));

// One table: the organisations in their order, then the companies in theirs.
// A company's `country` repeats its countryBn, so it is checked equal here
// and not shipped.
const seed = { ...orgSeed };
for (const [id, r] of Object.entries(techSeed)) {
  if (id in orgSeed) throw new Error(`${id}: in both seeds — record keys must be unique across the map`);
  if (r.country !== r.countryBn) throw new Error(`${id}: country "${r.country}" is not its countryBn "${r.countryBn}"`);
  const { id: own, ...rest } = r;
  seed[id] = { id: own, category: TECH_CATEGORY, ...rest };
}

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
| One marker per city rather than per record: Geneva hosts eighteen,
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
// The seed's qualifier after the comma, where Natural Earth names that
// first-level division differently.
const NE_STATE_NAMES = { 'D.C.': 'District of Columbia' };

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
  // "San Jose, California": where the seed names a state, the place must be
  // in it — a country code alone does not tell one American town from another.
  const qualifier = c.nameEn.includes(',') ? c.nameEn.split(',')[1].trim() : null;
  const state = NE_STATE_NAMES[qualifier] ?? qualifier;
  const hits = places.filter(
    (f) =>
      f.properties.adm0_a3 === c.iso3 &&
      (!state || f.properties.adm1name === state) &&
      [f.properties.name, f.properties.nameascii, f.properties.namealt].filter(Boolean).some((n) => norm(n) === want),
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
const frameAround = ([minLon, minLat, maxLon, maxLat]) =>
  [minLon - FRAME_HALF.lon, minLat - FRAME_HALF.lat, maxLon + FRAME_HALF.lon, maxLat + FRAME_HALF.lat].map((n) => Number(n.toFixed(3)));
for (const c of cities.values()) c.frame = frameAround([...c.at, ...c.at]);

/*
|--------------------------------------------------------------------------
| HUBS — towns too close together to be told apart share one marker
|
| Six Silicon Valley towns sit 2–7 px apart at frame zoom, against a finger
| about 40 px wide: a tap there opens one of six cards at random, and none
| lists every company. A hub replaces its towns in the MARKER table, so it
| has one marker and one card listing everything in all of them. The towns
| keep their own points and provenance in cities.seed.json, and each record
| keeps its own cityBn; it gains `regionBn`, the hub's name.
|
| The hub's point is the mean of its towns' points and its frame their extent
| widened by FRAME_HALF — derived from sourced points, nothing placed by hand.
|--------------------------------------------------------------------------
*/
const hubSeed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'hubs.seed.json'), 'utf8'));
const hubOfTown = new Map(); // city key -> hub key
const hubs = new Map();
for (const [hubKey, h] of Object.entries(hubSeed)) {
  if (cities.has(hubKey)) throw new Error(`hub "${hubKey}" has the key of a city`);
  const members = h.towns.map((t) => {
    const [cityEn, iso3] = t.split('|');
    const key = cityKey({ cityEn, iso3 });
    if (!cities.has(key)) throw new Error(`hub "${hubKey}": no record is in "${t}"`);
    if (hubOfTown.has(key)) throw new Error(`${key} is in two hubs`);
    hubOfTown.set(key, hubKey);
    return cities.get(key);
  });
  // One hub, one country: its card has one দেশ row.
  const countriesOf = new Set(members.map((m) => `${m.iso3}|${m.countryBn}`));
  if (countriesOf.size !== 1) throw new Error(`hub "${hubKey}" spans ${[...countriesOf].join(', ')}`);
  const lons = members.map((m) => m.at[0]);
  const lats = members.map((m) => m.at[1]);
  const mean = (xs) => Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(5));
  hubs.set(hubKey, {
    nameEn: h.nameEn,
    nameBn: h.nameBn,
    iso3: members[0].iso3,
    countryBn: members[0].countryBn,
    at: [mean(lons), mean(lats)],
    frame: frameAround([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]),
    members: h.towns.map((t) => cityKey({ cityEn: t.split('|')[0], iso3: t.split('|')[1] })),
  });
}
// The place a record's marker is: its hub if its town is in one, else its town.
const placeKey = (r) => hubOfTown.get(cityKey(r)) ?? cityKey(r);
const placeOf = (r) => hubs.get(placeKey(r)) ?? cities.get(cityKey(r));

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
// TWN: that file draws Taiwan inside China. Washing China instead would put a
// different country behind TSMC's card, so nothing is washed; the card still
// names the country as the seed does.
const KNOWN_NO_COUNTRY = ['ISR', 'TWN'];
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
| border-lines uses — one entry each today. `cities` names the marker the
| record hangs off — its town, or the town's hub — and `at` and `frame` are
| that marker's, so selecting a record pulses it and frames it.
|--------------------------------------------------------------------------
*/
// Provenance and identity stay in the seed; nothing here is content.
const NOT_SHIPPED = new Set(['id', 'sources', 'review', 'country']);
const organisations = {};
for (const [id, r] of Object.entries(seed)) {
  const out = {};
  for (const [k, v] of Object.entries(r)) if (!NOT_SHIPPED.has(k)) out[k] = v;
  const place = placeOf(r);
  const hub = hubs.get(placeKey(r));
  if (hub) out.regionBn = hub.nameBn;
  out.cities = [placeKey(r)];
  out.countries = [r.iso3];
  out.at = place.at;
  out.frame = place.frame;
  organisations[id] = out;
}

// The marker table: every town not in a hub, and each hub where its first
// town would have been. The seed keeps every town, with the hub it went to.
const cityRecords = {};
const citySeed = {};
for (const [key, c] of cities) {
  const { source, sources: cited, ...shipped } = c;
  const hubKey = hubOfTown.get(key);
  citySeed[key] = { ...shipped, geometrySource: source, sources: cited, ...(hubKey ? { hub: hubKey } : {}) };
  if (!hubKey) cityRecords[key] = shipped;
  else if (!(hubKey in cityRecords)) {
    const { members, ...hubShipped } = hubs.get(hubKey);
    cityRecords[hubKey] = hubShipped;
  }
}
for (const [hubKey, h] of hubs) {
  citySeed[hubKey] = {
    ...Object.fromEntries(Object.entries(h).filter(([k]) => k !== 'members')),
    geometrySource: 'generated',
    members: h.members,
    sources: { at: 'generated: the mean of its member towns’ points; frame: their extent widened by FRAME_HALF' },
  };
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
console.log(`\nrecords: ${Object.keys(organisations).length} (organisations ${Object.keys(orgSeed).length}, companies ${Object.keys(techSeed).length})   cities: ${cities.size}   countries: ${codes.length} (+ ${KNOWN_NO_COUNTRY.join(', ')} with no outline)`);
console.log(`  Natural Earth: ${bySource.naturalEarth.length}`);
console.log(`  OSM:           ${bySource.osm.length}  ${bySource.osm.join(', ')}`);
console.log(`  aliases:       ${Object.entries(NE_ALIASES).map(([k, v]) => `${k} as ${v}`).join(', ')}`);
console.log(`markers: ${Object.keys(cityRecords).length}   hubs: ${[...hubs].map(([k, h]) => `${k} (${h.members.length} towns, at ${h.at})`).join(', ')}`);
