// Builds docs/maps/environment-treaties/ from the editor's seed:
//
//   records.json  one table, `items`: every convention, treaty and protocol,
//                 summit and COP, in the seed's order, each with the tab it is
//                 shown under, its city's point and its frame
//   places.json   a city that holds two or more records within one tab, drawn
//                 as one marker whose card lists them all
//   tabs.json     the tabs, in the seed's order, with their Bengali and English
//                 titles
//
// The map is shown in English, by the user's decision (2026-09-27): the
// editor's English fields ship beside the Bengali ones, which stay in the data
// unused here. Three values are derived from them for the card: the year a
// convention came into force (inForceYear, the one year in inForceEn), the
// short name of a parent that is not on the map (parentShortEn, the
// abbreviation closing parentTextEn), and each record's tab title in English
// (tabEn), which names a timeline row whose records carry no theme.
//
// The seed is read and never written. City points come from cities.seed.json
// (tools/extract-treaty-cities.mjs), pinned by checksum in tools/sources.json;
// a value the seed leaves null and a cited source was found for comes from
// additions.seed.json, and only where the seed says null.
//
// Run:  node tools/build-environment-treaties.mjs   (from the repo root or tools/)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The map's folder, its seeds, and the pins. Change here if they move.
const DIR = path.join(ROOT, 'docs/maps/environment-treaties');
const SEEDS = path.join(ROOT, 'data-sources/environment-treaties');
const SEED = path.join(SEEDS, 'treaties.seed.json');
const CITIES = path.join(SEEDS, 'cities.seed.json');
const ADDITIONS = path.join(SEEDS, 'additions.seed.json');
const PINS = path.join(ROOT, 'tools/sources.json');

// The seed's four tables, in tab order, and how many records each must hold.
const COUNTS = { conventions: 12, treaties: 7, summits: 4, cops: 31 };

// Fields a record may carry, and what each is. `cited` fields carry the
// citation that justifies them in the seed's `sources`; the editor's fields
// are the draft the user approved — Bengali names, themes and tab placement
// are editor content (the seed's own review says so), as is shortBn, the dot
// label the editor derived from each nameBn — and are not cited.
const CITED = ['year', 'cityBn', 'signedBn', 'inForceBn', 'parentId', 'noteBn', 'parentTextBn'];
const EDITOR = ['nameBn', 'shortBn', 'nameEn', 'themeBn', 'countryBn'];
// The English display fields the editor added for this map (2026-09-27): each
// is its Bengali field's translation, or for a date the cited source's own
// wording, so it is null or absent exactly where its Bengali field is — the
// same fact, pending or not applicable alike.
const ENGLISH = { shortEn: 'shortBn', themeEn: 'themeBn', cityEn: 'cityBn', countryEn: 'countryBn', signedEn: 'signedBn', inForceEn: 'inForceBn', noteEn: 'noteBn', parentTextEn: 'parentTextBn' };
const SHIPPED = ['nameBn', 'shortBn', 'nameEn', 'themeBn', 'year', 'cityBn', 'countryBn', 'signedBn', 'inForceBn', 'bdRatificationBn', 'parentId', 'parentTextBn', 'noteBn', ...Object.keys(ENGLISH)];
const BUILD_INPUT = ['id', 'cityQuery', 'sources', 'review'];

// One host is one source, so two citations from one host on a field fail —
// except where a field makes two claims, each cited to its own page. Listed,
// with the reason, and the build fails a listing that no longer applies.
const SAME_HOST_EXCEPTIONS = {
  'rio-1992.noteBn': 'The note names two conventions opened for signature at Rio — UNFCCC and CBD — and cites each to its own article; both articles are on en.wikipedia.org.',
};

// Values the seed gives without a citation. The seed's own description says
// every value is cited; these are not, and the build fails any other uncited
// value. They stand on the user's approval of the draft (each record's review:
// "Draft approved by the user 2026-09-27") — editor-verified, which is kept
// apart from cited. `table.*.field` covers a whole table.
const EDITOR_VERIFIED = {
  'cops.*.parentId': 'Every record of the cops table is a UNFCCC COP — the seed describes the table so, and the user asked for COPs to link to UNFCCC. The year and city of each are cited to the list of UNFCCC conferences.',
  'cop6_2.noteBn': 'The note that COP 6-2 was the resumed session of COP 6.',
  'cop26.noteBn': 'The note that COP 26 was put off from 2020 to 2021 by COVID; the review records that the source table lists it under both years.',
};

// A city's frame: this far either side of its point. The org-headquarters
// map's measured half-sizes: at phone width (a 390 px viewport, 368 px of map)
// a frame this wide lands under the z6 where the world tiles stop outside the
// detail areas; measured again for this map in its report.
const FRAME_HALF = { lon: 2.6, lat: 3.0 };

const problems = [];
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const seed = readJson(SEED);
const cities = readJson(CITIES);
const additions = readJson(ADDITIONS);

// ---- the seed's shape --------------------------------------------------------
const tabIds = seed.tabs.map((t) => t.id);
if (JSON.stringify(tabIds) !== JSON.stringify(Object.keys(COUNTS))) problems.push(`the seed's tabs are ${tabIds.join(', ')}, not ${Object.keys(COUNTS).join(', ')}`);
for (const t of seed.tabs) if (!t.titleBn || !t.titleEn) problems.push(`tab ${t.id} has no Bengali or no English title`);
for (const [table, n] of Object.entries(COUNTS)) {
  const have = Object.keys(seed[table] ?? {}).length;
  if (have !== n) problems.push(`${table}: ${have} records, expected ${n}`);
}
const rows = {}; // key -> { tab, row }, in the seed's order
for (const tab of tabIds)
  for (const [key, row] of Object.entries(seed[tab])) {
    if (key in rows) problems.push(`${key} appears in both ${rows[key].tab} and ${tab}`);
    if (row.id !== key) problems.push(`${tab}.${key}: its id is "${row.id}"`);
    rows[key] = { tab, row };
  }

// ---- each record -------------------------------------------------------------
const hostOf = (url) => new URL(url).host;
for (const [key, { tab, row }] of Object.entries(rows)) {
  for (const f of Object.keys(row)) if (![...SHIPPED, ...BUILD_INPUT].includes(f)) problems.push(`${key}: unknown field "${f}"`);
  // A Bengali name on every record: none of these is English-name-final.
  if (typeof row.nameBn !== 'string' || !row.nameBn) problems.push(`${key}: no nameBn`);
  if (typeof row.shortBn !== 'string' || !row.shortBn) problems.push(`${key}: no shortBn, the label for its dot`);
  if (!row.nameEn) problems.push(`${key}: no nameEn`);
  for (const [en, bnField] of Object.entries(ENGLISH)) {
    const state = (v) => (v === undefined ? 'absent' : v === null ? 'null' : 'value');
    if (state(row[en]) !== state(row[bnField])) problems.push(`${key}: ${en} is ${state(row[en])} where ${bnField} is ${state(row[bnField])}`);
  }
  if (!Number.isInteger(row.year)) problems.push(`${key}: year ${JSON.stringify(row.year)} is not a whole year`);
  // A city has a query to find it by, and a query a city.
  if ((row.cityBn === null || row.cityBn === undefined) !== (row.cityQuery === null || row.cityQuery === undefined)) problems.push(`${key}: cityBn and cityQuery disagree on whether there is a city`);
  for (const f of CITED) {
    const v = row[f];
    if (v === null || v === undefined) continue;
    const cites = row.sources?.[f];
    if (!Array.isArray(cites) || !cites.length) {
      if (!EDITOR_VERIFIED[`${key}.${f}`] && !EDITOR_VERIFIED[`${tab}.*.${f}`]) problems.push(`${key}.${f}: no citation, and not listed as editor-verified`);
      continue;
    }
    if (EDITOR_VERIFIED[`${key}.${f}`] || EDITOR_VERIFIED[`${tab}.*.${f}`]) problems.push(`${key}.${f}: listed as editor-verified, but the seed cites it — drop the listing`);
    for (const c of cites) {
      if (!c.url || !c.states) problems.push(`${key}.${f}: a citation without its url or what it states`);
      // Every value in this seed carries a pinned Wikipedia revision.
      else if (!/^https:\/\/en\.wikipedia\.org\/w\/index\.php\?(.*&)?oldid=\d+/.test(c.url)) problems.push(`${key}.${f}: citation ${c.url} is not a pinned Wikipedia revision`);
    }
    const hosts = cites.map((c) => hostOf(c.url));
    if (new Set(hosts).size < hosts.length && !SAME_HOST_EXCEPTIONS[`${key}.${f}`]) problems.push(`${key}.${f}: two citations from one host (${hosts.join(', ')}) — one host is one source`);
  }
  if (row.parentId !== null && row.parentId !== undefined && !(row.parentId in rows)) problems.push(`${key}: parentId "${row.parentId}" is no record`);
}
for (const listed of Object.keys(EDITOR_VERIFIED)) {
  const [scope, star, field] = listed.split('.');
  const keys = star === '*' ? Object.keys(rows).filter((k) => rows[k].tab === scope) : [scope];
  const f = star === '*' ? field : star;
  if (!keys.length || keys.some((k) => rows[k]?.row[f] === null || rows[k]?.row[f] === undefined)) problems.push(`EDITOR_VERIFIED lists ${listed}, which no longer names a value on every record it covers`);
}
for (const listed of Object.keys(SAME_HOST_EXCEPTIONS)) {
  const [key, f] = listed.split('.');
  const hosts = (rows[key]?.row.sources?.[f] ?? []).map((c) => hostOf(c.url));
  if (!(new Set(hosts).size < hosts.length)) problems.push(`SAME_HOST_EXCEPTIONS lists ${listed}, whose citations no longer share a host`);
}

// ---- values found for the seed's nulls ------------------------------------------
const added = {}; // key -> { field: value }
for (const [key, entry] of Object.entries(additions)) {
  if (key === '_about') continue;
  if (!(key in rows)) {
    problems.push(`additions.seed.json: "${key}" is no record`);
    continue;
  }
  for (const [f, v] of Object.entries(entry)) {
    if (['sources', 'review'].includes(f)) continue;
    if (rows[key].row[f] !== null) problems.push(`additions.seed.json: ${key}.${f} — the seed gives ${JSON.stringify(rows[key].row[f])}, not null; the seed wins, drop the addition`);
    const cites = entry.sources?.[f];
    if (!Array.isArray(cites) || !cites.length || !cites.every((c) => c.url && c.states)) problems.push(`additions.seed.json: ${key}.${f} is not cited with what its source states`);
    if (f === 'parentId' && !(v in rows)) problems.push(`additions.seed.json: ${key}.parentId "${v}" is no record`);
    (added[key] ??= {})[f] = v;
  }
}

// ---- city points: the pinned extract --------------------------------------------
const pinned = readJson(PINS).treatyCities;
const citiesSha = crypto.createHash('sha256').update(fs.readFileSync(CITIES)).digest('hex');
if (citiesSha !== pinned?.sha256) problems.push(`cities.seed.json is ${citiesSha}, pinned ${pinned?.sha256} — re-made on purpose? review it and update tools/sources.json`);
for (const [key, { row }] of Object.entries(rows)) {
  if (!row.cityQuery) continue;
  const c = cities[row.cityQuery];
  if (!c) {
    problems.push(`${key}: no point for "${row.cityQuery}" in cities.seed.json`);
    continue;
  }
  if (!/^Q\d+$/.test(c.wikidata) || !Array.isArray(c.at) || c.at.length !== 2 || !c.at.every(Number.isFinite)) problems.push(`"${row.cityQuery}": no Wikidata item and point`);
  const cite = c.sources?.at?.[0];
  if (!cite?.states || !/^https:\/\/www\.wikidata\.org\/w\/index\.php\?title=Q\d+&oldid=\d+$/.test(cite?.url ?? '') || !cite.url.includes(`title=${c.wikidata}&`)) problems.push(`"${row.cityQuery}": its point is not cited to a revision of its own item`);
}

if (problems.length) {
  console.error(`environment-treaties: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// ---- values derived for the English card --------------------------------------------
const DIGITS = '০১২৩৪৫৬৭৮৯';
const western = (text) => text.replace(/[০-৯]/g, (d) => DIGITS.indexOf(d));
const derived = {}; // key -> { inForceYear?, parentShortEn? }
for (const [key, { row }] of Object.entries(rows)) {
  if (typeof row.inForceEn === 'string') {
    const years = row.inForceEn.match(/\b(1[5-9]\d\d|20\d\d)\b/g) ?? [];
    const bnYears = western(row.inForceBn ?? '').match(/\b(1[5-9]\d\d|20\d\d)\b/g) ?? [];
    if (years.length !== 1) problems.push(`${key}: inForceEn "${row.inForceEn}" does not name exactly one year`);
    else if (JSON.stringify(bnYears) !== JSON.stringify(years)) problems.push(`${key}: inForceEn says ${years[0]}, inForceBn says ${bnYears.join(', ') || 'no year'}`);
    else (derived[key] ??= {}).inForceYear = Number(years[0]);
  } else if (row.inForceEn === null) (derived[key] ??= {}).inForceYear = null;
  if (typeof row.parentTextEn === 'string') {
    const short = row.parentTextEn.match(/\(([A-Z][A-Za-z0-9-]*)\)\s*$/);
    if (!short) problems.push(`${key}: parentTextEn "${row.parentTextEn}" does not end in its abbreviation`);
    else (derived[key] ??= {}).parentShortEn = short[1];
  }
}
if (problems.length) {
  console.error(`environment-treaties: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// ---- places: one marker per city per tab -------------------------------------------
const round = (n) => Number(n.toFixed(5));
const frameAround = ([lon, lat]) => [lon - FRAME_HALF.lon, lat - FRAME_HALF.lat, lon + FRAME_HALF.lon, lat + FRAME_HALF.lat].map((n) => Number(n.toFixed(3)));
const groups = new Map(); // `${tab}|${query}` -> keys, in the seed's order
for (const [key, { tab, row }] of Object.entries(rows)) {
  if (!row.cityQuery) continue;
  const id = `${tab}|${row.cityQuery}`;
  groups.set(id, [...(groups.get(id) ?? []), key]);
}
const places = {};
const placeOf = {}; // record key -> place key
for (const [id, keys] of groups) {
  if (keys.length < 2) continue;
  const [tab, query] = id.split('|');
  const c = cities[query];
  const key = `${tab}-${c.wikidata}`;
  const first = rows[keys[0]].row;
  for (const k of keys) {
    const r = rows[k].row;
    if (r.cityBn !== first.cityBn || r.countryBn !== first.countryBn || r.cityEn !== first.cityEn || r.countryEn !== first.countryEn) {
      console.error(`${key}: its records name the city differently (${keys.map((x) => `${x} ${rows[x].row.cityBn} ${rows[x].row.cityEn}, ${rows[x].row.countryBn} ${rows[x].row.countryEn}`).join('; ')})`);
      process.exit(1);
    }
    placeOf[k] = key;
  }
  const themes = new Set(keys.map((k) => rows[k].row.themeBn));
  places[key] = {
    nameBn: first.cityBn,
    countryBn: first.countryBn,
    nameEn: first.cityEn,
    countryEn: first.countryEn,
    tab,
    count: keys.length,
    // The marker takes the records' theme where they share one; otherwise its tab's.
    ...(themes.size === 1 && first.themeBn ? { themeBn: first.themeBn } : {}),
    records: keys,
    at: c.at.map(round),
    frame: frameAround(c.at),
  };
}

// ---- records ---------------------------------------------------------------------
const children = {};
for (const [key, { row }] of Object.entries(rows)) {
  const parent = added[key]?.parentId ?? row.parentId;
  if (parent) (children[parent] ??= []).push(key);
}
const out = {};
for (const [key, { tab, row }] of Object.entries(rows)) {
  // tabBn, tabEn: the tab's title, which names a timeline row whose records carry no theme.
  const tabRow = seed.tabs.find((t) => t.id === tab);
  const rec = { tab, tabBn: tabRow.titleBn, tabEn: tabRow.titleEn };
  for (const f of SHIPPED) if (f in row) rec[f] = row[f];
  Object.assign(rec, added[key] ?? {}, derived[key] ?? {});
  if (row.cityQuery) {
    const at = cities[row.cityQuery].at.map(round);
    rec.at = at;
    // Alone in its city within its tab: its own marker. Otherwise the place's.
    if (placeOf[key]) rec.place = [placeOf[key]];
    else rec.soloAt = at;
    rec.frame = frameAround(cities[row.cityQuery].at);
  }
  if (children[key]) rec.children = children[key];
  out[key] = rec;
}

// Every marker must be inside the view the map opens on, or it opens without it.
const descriptor = readJson(path.join(DIR, 'descriptor.json'));
const view = descriptor.view?.fitBounds;
const outside = [...Object.entries(out).filter(([, r]) => r.soloAt).map(([k, r]) => [k, r.soloAt]), ...Object.entries(places).map(([k, p]) => [k, p.at])].filter(
  ([, [lon, lat]]) => !view || lon < view[0] || lon > view[2] || lat < view[1] || lat > view[3],
);
if (outside.length) {
  console.error(`markers outside the opening view ${JSON.stringify(view)}: ${outside.map(([k]) => k).join(', ')}`);
  process.exit(1);
}

const tabs = Object.fromEntries(seed.tabs.map((t) => [t.id, { titleBn: t.titleBn, titleEn: t.titleEn }]));

fs.mkdirSync(DIR, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(DIR, name), JSON.stringify(value, null, 2) + '\n');
write('records.json', out);
write('places.json', places);
write('tabs.json', tabs);

// ---- the report ----------------------------------------------------------------------
const pending = [];
for (const [key, rec] of Object.entries(out)) for (const [f, v] of Object.entries(rec)) if (v === null) pending.push(`${key}.${f}`);
const solo = Object.values(out).filter((r) => r.soloAt).length;
console.log(`environment-treaties: ${Object.keys(out).length} records (${Object.entries(COUNTS).map(([t, n]) => `${t} ${n}`).join(', ')}), ${Object.keys(tabs).length} tabs`);
console.log(`markers: ${solo} records alone in their city, ${Object.keys(places).length} places holding ${Object.values(places).reduce((a, p) => a + p.count, 0)} records (${Object.entries(places).map(([k, p]) => `${k} ${p.count}`).join(', ')}); no city: ${Object.entries(out).filter(([, r]) => !r.at).map(([k]) => k).join(', ')}`);
console.log(`added from additions.seed.json: ${Object.entries(added).map(([k, v]) => Object.keys(v).map((f) => `${k}.${f} = ${JSON.stringify(v[f])}`).join(', ')).join('; ') || 'none'}`);
console.log(`derived for the English card: inForceYear ${Object.values(derived).filter((d) => 'inForceYear' in d).length}, parentShortEn ${Object.entries(derived).filter(([, d]) => d.parentShortEn).map(([k, d]) => `${k} "${d.parentShortEn}"`).join(', ') || 'none'}`);
console.log(`same-host exceptions: ${Object.keys(SAME_HOST_EXCEPTIONS).join(', ') || 'none'}; editor-verified, uncited: ${Object.keys(EDITOR_VERIFIED).join(', ')}`);
console.log(`pending (${pending.length}): ${pending.join(', ')}`);
