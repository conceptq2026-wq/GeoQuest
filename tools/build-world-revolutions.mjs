// Builds docs/maps/world-revolutions/ from the editor's seed:
//
//   records.json  one table, `items`: every event, in the seed's order, each
//                 with its tab, its card's values and — where its source names
//                 a place a pinned file can locate — its marker and frame
//   places.json   a spot that holds two or more events within one tab, drawn
//                 as one marker whose card lists them all
//   tabs.json     the three tabs, with their titles and the picker's prompt
//   info.json     the lines under ⓘ: each event's sources, then every
//                 disagreement between sources, value by value
//
// The seed, data-sources/world-revolutions/world-revolutions.seed.json, is
// read and never written. Every value it gives is cited: a Wikipedia article
// at a pinned revision, the NCTB textbook, or a past exam question on two
// independent sites. A value no source gives is null — pending, its card row
// hidden.
//
// MARKERS (the user's decision, 2026-10-01). A filled dot where the cited
// source names a specific place, a hollow ring where it names only a country
// or a region. Every point comes from a pinned file, never typed: a country's
// Natural Earth label point (NE-0 — the same point world.pmtiles labels the
// country at), a Natural Earth populated place (NE-pp) matched on name AND
// country code, a Natural Earth admin-1 unit's label point (NE-1), or a
// COD-AB district or upazila point (COD-AB). A source that gives only a
// historical name is placed only where a cited source states the present-day
// place; the seed records that statement as the point's `match`.
//
// NO POINT — THE EXCEPTION TO "NEVER SILENTLY ABSENT FROM THE MAP"
// (notes/descriptor.md, the user's decision of 2026-10-01). An event whose
// sources name no single place a pinned file can locate is listed in the
// seed's `noPoint` with the reason, is still in the picker, and its card says
// «নির্দিষ্ট বিন্দু নেই» — absent, but not silently. The build and
// tools/verify-descriptor.mjs both fail when the list and the events disagree
// either way.
//
// THE BASEMAP CHECK. Every marker's country is one world.pmtiles labels
// (Natural Earth's Bangladesh-POV countries file, which build-world.mjs reads),
// and every marker lies inside that country's own polygon in the same file.
//
// Run:  node tools/build-world-revolutions.mjs   (from the repo root or tools/)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, zipEntry } from './lib/geo.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The map's folder, its seed and the pins. Change here if they move.
const DIR = path.join(ROOT, 'docs/maps/world-revolutions');
const SEED = path.join(ROOT, 'data-sources/world-revolutions/world-revolutions.seed.json');
const PINS = path.join(ROOT, 'tools/sources.json');

// The approved shortlist's tabs and how many events each holds: 30, 14 and 9
// (2026-10-01); then the three Iraqi coups out and five 1848 members in (Stage 2).
const COUNTS = { revolution: 32, uprising: 14, nonpolitical: 9 };
// The tab that shows cards only: its events have no point, by the user's decision.
const CARDS_ONLY = 'nonpolitical';


// A spot's frame: this far either side of its point — environment-treaties'
// half-sizes, measured there at phone width.
const FRAME_HALF = { lon: 2.6, lat: 3.0 };

// The picker's groups: the century an event began in, in Bengali ordinals.
const CENTURY_BN = { 11: 'একাদশ শতক', 17: 'সপ্তদশ শতক', 18: 'অষ্টাদশ শতক', 19: 'ঊনবিংশ শতক', 20: 'বিংশ শতক', 21: 'একবিংশ শতক' };
const NO_CENTURY_BN = 'সময় নির্দিষ্ট নয়';

// The card's fixed words (the user's, 2026-10-01).
const WORDS = { noPoint: 'নির্দিষ্ট বিন্দু নেই', rebelGroup: 'বিদ্রোহী দল' };

const problems = [];
const fail = (msg) => problems.push(msg);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const seed = readJson(SEED);
const pins = readJson(PINS);
// Events with no marker, and why — the exception, written out in the seed.
const NO_POINT = seed.noPoint ?? {};
for (const [id, why] of Object.entries(NO_POINT)) if (typeof why !== 'string' || !why) fail(`noPoint: ${id} gives no reason`);

// ---- the pinned files -----------------------------------------------------------
const gitBlobSha1 = (buf) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
function pinnedNaturalEarth(name) {
  const pin = pins.naturalEarth?.files?.[name];
  if (!pin) throw new Error(`tools/sources.json pins no ${name}`);
  const buf = fs.readFileSync(path.join(CACHE, name));
  if (buf.length !== pin.size || gitBlobSha1(buf) !== pin.gitBlobSha1) throw new Error(`${name} is not the pinned file (${buf.length} bytes) — run tools/fetch-sources.mjs`);
  return JSON.parse(buf.toString('utf8'));
}
function pinnedCodAb(entry) {
  const pin = pins.codAbBangladesh;
  const buf = fs.readFileSync(path.join(CACHE, pin.file));
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length !== pin.size || sha !== pin.sha256) throw new Error(`${pin.file} is not the pinned file — run tools/fetch-sources.mjs`);
  return zipEntry(buf, entry);
}
const countries = pinnedNaturalEarth('ne_10m_admin_0_countries_bdg.geojson');
const places10 = pinnedNaturalEarth('ne_10m_populated_places_simple.geojson');
const admin1 = pinnedNaturalEarth('ne_10m_admin_1_states_provinces.geojson');
const codAb = pinnedCodAb('bgd_adminpoints.geojson');

const countryOf = new Map(countries.features.map((f) => [f.properties.ADM0_A3, f]));

// ---- where a point comes from: one pinned file per kind ----------------------------
const round = (n) => Number(n.toFixed(5));
function locate(ev) {
  const p = ev.point;
  if (p.source === 'NE-0') {
    const f = countryOf.get(p.adm0);
    if (!f) return fail(`${ev.id}: no country ${p.adm0} in the Natural Earth countries file`);
    return { at: [f.properties.LABEL_X, f.properties.LABEL_Y], adm0: p.adm0, key: `NE-0:${p.adm0}`, nameBn: f.properties.NAME_BN };
  }
  if (p.source === 'NE-pp') {
    // Name AND country code, never the name alone; a place Natural Earth
    // carries under another spelling is named by its own `name`, and the
    // seed's `matchAs` says which of its alternate names the source uses.
    const hits = places10.features.filter((f) => f.properties.name === p.name && f.properties.adm0_a3 === p.adm0);
    if (hits.length !== 1) return fail(`${ev.id}: ${hits.length} Natural Earth places named "${p.name}" in ${p.adm0}`);
    const props = hits[0].properties;
    if (p.matchAs && !String(props.namealt ?? '').split('|').includes(p.matchAs)) fail(`${ev.id}: "${p.name}" does not carry the alternate name "${p.matchAs}"`);
    return { at: [props.longitude, props.latitude], adm0: p.adm0, key: `NE-pp:${p.name}|${p.adm0}` };
  }
  if (p.source === 'NE-1') {
    const hits = admin1.features.filter((f) => f.properties.name === p.name && f.properties.adm0_a3 === p.adm0);
    if (hits.length !== 1) return fail(`${ev.id}: ${hits.length} Natural Earth admin-1 units named "${p.name}" in ${p.adm0}`);
    const props = hits[0].properties;
    return { at: [props.longitude, props.latitude], adm0: p.adm0, key: `NE-1:${p.name}|${p.adm0}`, nameBn: props.name_bn };
  }
  if (p.source === 'COD-AB') {
    const field = p.level === 2 ? 'adm2_pcode' : 'adm3_pcode';
    const hits = codAb.features.filter((f) => f.properties.admin_level === p.level && f.properties[field] === p.pcode);
    if (hits.length !== 1 || hits[0].properties.name !== p.name) return fail(`${ev.id}: COD-AB has ${hits.length} level-${p.level} points for ${p.pcode}${hits[0] ? `, named "${hits[0].properties.name}"` : ''}, not one named "${p.name}"`);
    return { at: hits[0].geometry.coordinates, adm0: 'BGD', key: `COD-AB:${p.pcode}` };
  }
  return fail(`${ev.id}: point source "${p.source}" is not NE-0, NE-pp, NE-1 or COD-AB`);
}

// ---- inside a country's polygon --------------------------------------------------------
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inCountry(pt, f) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  return polys.some((rings) => inRing(pt, rings[0]) && !rings.slice(1).some((hole) => inRing(pt, hole)));
}

// ---- the seed's shape ----------------------------------------------------------------
const tabIds = seed.tabs.map((t) => t.id);
if (JSON.stringify(tabIds) !== JSON.stringify(Object.keys(COUNTS))) fail(`the seed's tabs are ${tabIds.join(', ')}, not ${Object.keys(COUNTS).join(', ')}`);
for (const t of seed.tabs) if (!t.titleBn || !t.placeholderBn) fail(`tab ${t.id}: no title or no picker prompt`);
for (const [tab, n] of Object.entries(COUNTS)) {
  const have = seed.events.filter((e) => e.tab === tab).length;
  if (have !== n) fail(`${tab}: ${have} events, expected ${n}`);
}
const ids = new Set();
for (const ev of seed.events) {
  if (ids.has(ev.id)) fail(`${ev.id} appears twice`);
  ids.add(ev.id);
}

// Every citation names a source the seed lists, and says what it states.
const refs = seed.refs;
const PINNED_URL = /^https:\/\/(bn|en)\.wikipedia\.org\/w\/index\.php\?title=[^&]+&oldid=\d+$/;
for (const [id, r] of Object.entries(refs)) {
  if (!r.title || !r.url) fail(`ref ${id}: no title or no url`);
  if (r.kind === 'wikipedia' && !PINNED_URL.test(r.url)) fail(`ref ${id}: ${r.url} is not a pinned Wikipedia revision`);
  if (!['wikipedia', 'nctb', 'exam', 'natural-earth'].includes(r.kind)) fail(`ref ${id}: kind "${r.kind}" is not wikipedia, nctb, exam or natural-earth`);
}
const checkCites = (where, cites) => {
  if (!Array.isArray(cites) || !cites.length) return fail(`${where}: not cited`);
  for (const c of cites) {
    if (!(c.ref in refs)) fail(`${where}: cites "${c.ref}", which the seed does not list`);
    if (typeof c.states !== 'string' || !c.states) fail(`${where}: a citation that does not say what its source states`);
    // A Bengali name taken from the pinned Natural Earth file is checked against it.
    if (refs[c.ref]?.kind === 'natural-earth') {
      const k = c.check ?? {};
      const got = c.ref === 'ne:admin0' ? countryOf.get(k.adm0)?.properties.NAME_BN : admin1.features.find((f) => f.properties.name === k.name && f.properties.adm0_a3 === k.adm0)?.properties.name_bn;
      if (!k.nameBn || got !== k.nameBn) fail(`${where}: Natural Earth names ${k.adm0}${k.name ? ` ${k.name}` : ''} «${got}», not «${k.nameBn}»`);
    }
  }
};

// The cited fields, each null or a value with its citation.
const CITED = ['nameBn', 'whenBn', 'placeBn'];
const out = {};
const located = {}; // id -> { at, adm0, key, marker }
for (const ev of seed.events) {
  for (const f of CITED) {
    if (ev[f] === undefined) fail(`${ev.id}: ${f} is absent — every event has it, null where no source gives it`);
    else if (ev[f] !== null) checkCites(`${ev.id}.${f}`, ev.cite?.[f]);
  }
  if (!ev.nameEn) fail(`${ev.id}: no nameEn`);
  for (const a of ev.aka ?? []) checkCites(`${ev.id} other name «${a.textBn}»`, a.cite);
  for (const c of ev.conflicts ?? []) {
    if (!CITED.includes(c.field)) fail(`${ev.id}: a conflict over "${c.field}", which is not a cited field`);
    for (const o of c.others ?? []) checkCites(`${ev.id} conflict ${c.field} «${o.valueBn}»`, o.cite);
  }
  if (ev.from !== null && ev.from !== undefined && !Number.isInteger(ev.from)) fail(`${ev.id}: from ${ev.from} is not a whole year`);
  if (ev.group && !(ev.group in (seed.groups ?? {}))) fail(`${ev.id}: group "${ev.group}" is not one of the seed's groups`);
  if (ev.group && seed.groups[ev.group]?.tab !== ev.tab) fail(`${ev.id}: its group lives in another tab`);
  for (const p of ev.parts ?? []) checkCites(`${ev.id} part «${p.textBn}»`, p.cite);
  if (ev.parts && ev.aka) fail(`${ev.id}: both parts and other names — a part is not another name`);

  // The point: none in the cards-only tab; otherwise a pinned place, or listed in NO_POINT.
  if (ev.tab === CARDS_ONLY && ev.point) fail(`${ev.id}: a point in the cards-only tab`);
  if (ev.tab !== CARDS_ONLY) {
    if (!ev.point && !(ev.id in NO_POINT)) fail(`${ev.id}: no point, and not listed in NO_POINT`);
    if (ev.point && ev.id in NO_POINT) fail(`${ev.id}: has a point now — drop it from NO_POINT`);
  }
  if (ev.point) {
    if (!['dot', 'ring'].includes(ev.point.marker)) fail(`${ev.id}: marker "${ev.point.marker}" is not dot or ring`);
    checkCites(`${ev.id}.point`, ev.cite?.point);
    if (ev.point.historical) checkCites(`${ev.id}.point.match`, ev.point.match);
    const loc = locate(ev);
    if (loc) located[ev.id] = { ...loc, marker: ev.point.marker };
  }
}
for (const id of Object.keys(NO_POINT)) if (!ids.has(id)) fail(`NO_POINT lists ${id}, which is no event`);
// The groups, each named by a source; the events left out, each with why and its source.
for (const [g, grp] of Object.entries(seed.groups ?? {})) {
  if (!grp.nameBn || !grp.memberBn || !COUNTS[grp.tab]) fail(`group ${g}: no name, member line or tab`);
  checkCites(`group ${g}`, grp.cite);
  if (seed.events.filter((e) => e.group === g).length < 2) fail(`group ${g}: fewer than two members`);
}
for (const [id, x] of Object.entries(seed.excluded ?? {})) {
  if (ids.has(id)) fail(`${id}: excluded, yet an event`);
  if (!x.nameBn || !x.reason) fail(`excluded ${id}: no name or no reason`);
  checkCites(`excluded ${id}`, x.cite);
}

// ---- the basemap check: the country is labelled, and the point is inside it ----------
for (const [id, loc] of Object.entries(located)) {
  const f = countryOf.get(loc.adm0);
  if (!f) fail(`${id}: its country ${loc.adm0} is not in world.pmtiles' countries file`);
  else if (!inCountry(loc.at, f)) fail(`${id}: its point ${loc.at.join(', ')} lies outside ${loc.adm0}`);
}

if (problems.length) {
  console.error(`world-revolutions: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// ---- places: one marker per spot per tab ------------------------------------------------
const frameAround = ([lon, lat]) => [lon - FRAME_HALF.lon, lat - FRAME_HALF.lat, lon + FRAME_HALF.lon, lat + FRAME_HALF.lat].map((n) => Number(n.toFixed(3)));
const spots = new Map(); // `${tab}|${key}` -> ids, in the seed's order
for (const ev of seed.events) {
  const loc = located[ev.id];
  if (!loc) continue;
  const k = `${ev.tab}|${loc.key}`;
  spots.set(k, [...(spots.get(k) ?? []), ev.id]);
}
const places = {};
const placeOf = {};
for (const [k, members] of spots) {
  if (members.length < 2) continue;
  const [tab, key] = k.split('|');
  const loc = located[members[0]];
  const markers = new Set(members.map((m) => located[m].marker));
  if (markers.size !== 1) {
    console.error(`${key}: its events are drawn as ${[...markers].join(' and ')} — one spot, one kind of marker`);
    process.exit(1);
  }
  const id = `${tab}-${key.replace(/^[^:]+:/, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`;
  for (const m of members) placeOf[m] = id;
  places[id] = {
    // A spot's name is the country's or unit's Bengali name as the basemap
    // file has it; every shared spot today is a country or a unit.
    nameBn: loc.nameBn ?? null,
    tab,
    marker: loc.marker,
    count: members.length,
    records: members,
    at: loc.at.map(round),
    frame: frameAround(loc.at),
  };
}

// ---- records ----------------------------------------------------------------------------
const bn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const centuryOf = (ev) => {
  const c = ev.from != null ? Math.floor((ev.from - 1) / 100) + 1 : ev.century ?? null;
  if (c === null) return NO_CENTURY_BN;
  if (!CENTURY_BN[c]) {
    console.error(`${ev.id}: century ${c} has no Bengali name in CENTURY_BN`);
    process.exit(1);
  }
  return CENTURY_BN[c];
};
// Author order is the picker's: by the year each began, then the seed's order.
const order = seed.events.map((ev, i) => ({ ev, i, y: ev.from ?? (ev.century != null ? (ev.century - 1) * 100 : 99999) })).sort((a, b) => a.y - b.y || a.i - b.i);
for (const { ev } of order) {
  const rec = {
    tab: ev.tab,
    nameBn: ev.nameBn,
    nameEn: ev.nameEn,
    centuryBn: centuryOf(ev),
    whenBn: ev.whenBn,
    placeBn: ev.placeBn,
  };
  if (ev.aka?.length) rec.akaBn = ev.aka.map((a) => a.textBn).join(', ');
  if (ev.parts?.length) rec.partsBn = ev.parts.map((p) => p.textBn).join(', ');
  if (ev.kind === 'rebel-group') rec.kindBn = WORDS.rebelGroup;
  if (ev.group) {
    rec.group = ev.group;
    rec.groupBn = seed.groups[ev.group].memberBn;
  }
  if (ev.tab !== CARDS_ONLY && !ev.point) rec.noPointBn = WORDS.noPoint;
  const loc = located[ev.id];
  if (loc) {
    rec.marker = loc.marker;
    rec.at = loc.at.map(round);
    if (placeOf[ev.id]) rec.place = [placeOf[ev.id]];
    else rec.soloAt = rec.at;
    rec.frame = frameAround(loc.at);
  }
  out[ev.id] = rec;
}

// Every marker inside the view the map opens on, or it opens without it.
const descriptor = readJson(path.join(DIR, 'descriptor.json'));
const view = descriptor.view?.fitBounds;
const outside = Object.entries(located).filter(([, l]) => !view || l.at[0] < view[0] || l.at[0] > view[2] || l.at[1] < view[1] || l.at[1] > view[3]);
if (outside.length) {
  console.error(`markers outside the opening view ${JSON.stringify(view)}: ${outside.map(([k]) => k).join(', ')}`);
  process.exit(1);
}

const tabs = Object.fromEntries(seed.tabs.map((t) => [t.id, { titleBn: t.titleBn, placeholderBn: t.placeholderBn }]));
// The groups the chips offer, in the seed's order, each with its tab.
const groups = Object.fromEntries(Object.entries(seed.groups ?? {}).map(([g, grp]) => [g, { nameBn: grp.nameBn, tab: grp.tab }]));

// ---- ⓘ: each event's sources, then every disagreement ---------------------------------------
const refTitle = (id) => refs[id].titleBn ?? refs[id].title;
const lines = [];
for (const { ev } of order) {
  const used = new Set();
  for (const f of [...CITED, 'point']) for (const c of ev.cite?.[f] ?? []) used.add(c.ref);
  for (const a of ev.aka ?? []) for (const c of a.cite) used.add(c.ref);
  for (const p of ev.parts ?? []) for (const c of p.cite) used.add(c.ref);
  if (ev.point?.match) for (const c of ev.point.match) used.add(c.ref);
  lines.push({ text: `${ev.nameBn}: ${[...used].map(refTitle).join('; ')}।`, group: 'notes' });
  for (const n of ev.notesBn ?? []) lines.push({ text: `${ev.nameBn}: ${n}`, group: 'notes' });
}
// One line per disagreement: what the card shows and whose it is, then each other value and whose.
const FIELD_BN = { whenBn: 'সময়', placeBn: 'স্থান', nameBn: 'নাম' };
const whose = (cites) => [...new Set(cites.map((c) => refTitle(c.ref)))].join('; ');
for (const { ev } of order)
  for (const c of ev.conflicts ?? [])
    lines.push({ text: `${ev.nameBn}, ${FIELD_BN[c.field]}: কার্ডে «${ev[c.field]}» (${whose(ev.cite[c.field])}); ${c.others.map((o) => `«${o.valueBn}» (${whose(o.cite)})`).join('; ')}।`, group: 'conflicts' });

fs.mkdirSync(DIR, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(DIR, name), JSON.stringify(value, null, 2) + '\n');
write('records.json', out);
write('places.json', places);
write('tabs.json', tabs);
write('groups.json', groups);
write('info.json', { _about: 'Built by tools/build-world-revolutions.mjs from the seed in data-sources/world-revolutions/; do not edit.', lines });

// ---- the report ----------------------------------------------------------------------------
const pending = [];
for (const [key, rec] of Object.entries(out)) for (const [f, v] of Object.entries(rec)) if (v === null) pending.push(`${key}.${f}`);
for (const [key, p] of Object.entries(places)) for (const [f, v] of Object.entries(p)) if (v === null) pending.push(`places.${key}.${f}`);
const per = (tab) => Object.values(out).filter((r) => r.tab === tab);
console.log(`world-revolutions: ${Object.keys(out).length} events (${Object.keys(COUNTS).map((t) => `${t} ${per(t).length}`).join(', ')})`);
const drawn = Object.values(out).filter((r) => r.marker);
console.log(`markers: ${drawn.filter((r) => r.marker === 'dot').length} dots, ${drawn.filter((r) => r.marker === 'ring').length} rings; no point ${Object.keys(NO_POINT).length} (${Object.keys(NO_POINT).join(', ')}); cards only ${per(CARDS_ONLY).length}`);
console.log(`places: ${Object.entries(places).map(([k, p]) => `${k} ${p.count}`).join(', ') || 'none'}; alone: ${Object.values(out).filter((r) => r.soloAt).length}`);
console.log(`historical names placed by a cited match: ${seed.events.filter((e) => e.point?.historical).map((e) => e.id).join(', ') || 'none'}`);
console.log(`ⓘ: ${lines.filter((l) => l.group === 'notes').length} notes, ${lines.filter((l) => l.group === 'conflicts').length} conflicts`);
console.log(`pending (${pending.length}): ${pending.join(', ')}`);
