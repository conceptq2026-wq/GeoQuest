// Builds the ancient-janapadas map — the ancient janapadas of Bengal — from
// the editor's seed. A janapada is drawn as the union of the whole
// present-day administrative units its seed names; the card says the area is
// approximate.
//
//   data-sources/ancient-janapadas/janapadas.seed.json  INPUT, the editor's — read, never written
//   data-sources/ancient-janapadas/photos.seed.json     INPUT, the photo found for a record whose
//                                                       seed photo is null, and the point of the
//                                                       site it shows
//   docs/maps/ancient-janapadas/records.json            OUTPUT, the records that ship
//   docs/maps/ancient-janapadas/areas.geojson           OUTPUT, their areas
//   docs/maps/ancient-janapadas/photos/*.webp           made by tools/extract-commons-photos.mjs
//
// The units are bangladesh.pmtiles' own, from lib/bangladesh-units.mjs: a
// unit outside Bangladesh is cut at Bangladesh's border as COD-AB draws it,
// and the land between it and that border is given to it as the basemap gives
// it, so an area's international edge is the basemap's border.
//
// Every record's area is built, pinned and measured; only SHIP is written.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';
import { CACHE, readSource, zipEntry } from './lib/geo.mjs';
import { innerPoints, simplifyFeatures } from './lib/border-traces.mjs';
import { bangladeshUnits, SegmentGrid, ringsOf, inPolygon } from './lib/bangladesh-units.mjs';
import { COVERAGE, DETAIL_AREAS } from './bangladesh.config.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed, the photo seed, the served folder, the names table, the pins. Change here if one moves.
const SEED = path.join(ROOT, 'data-sources/ancient-janapadas/janapadas.seed.json');
const PHOTOS = path.join(ROOT, 'data-sources/ancient-janapadas/photos.seed.json');
const DIR = path.join(ROOT, 'docs/maps/ancient-janapadas');
const NAMES = path.join(HERE, 'sources/bangladesh-names.json');
const PINS = path.join(HERE, 'janapada-pins.json');

// The records that ship. Every record in the seed is built, pinned and
// measured; one added later ships only once it is listed here.
export const SHIP = ['pundra', 'barendra', 'banga', 'gauda', 'samatata', 'radha', 'harikela', 'chandradwip', 'tamralipta', 'suhma', 'ruhma'];

// The content fields a record may ship. Everything else in the seed is build
// input or provenance and stays behind.
const SHIPPED = ['nameBn', 'nameEn', 'altNamesBn', 'locationBn', 'districtsBn', 'areaCaptionBn', 'capitalBn', 'noteBn'];
// Facts a student reads, each cited in the seed. districtsBn is the list of
// units the geometry citation covers; areaCaptionBn describes how the area is
// drawn, not the janapada.
const CITED = ['nameBn', 'altNamesBn', 'locationBn', 'capitalBn', 'noteBn'];
const FREE_LICENCES = /^(Public domain|CC0( 1\.0)?|CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0))$/;
const PHOTO_MAX_KB = { marker: 8, card: 40 };

// The outline's resolution: 250 m, the user's choice against the basemap's
// district lines (at 1,000 m it sat up to a kilometre off them).
const SIMPLIFY_METRES = 250;
// A frame is the area's extent with this much of it added on each side, so the
// outline never sits on the edge of the screen.
const FRAME_MARGIN = 0.08;
// Outside the detail box the basemap stops at z6, so a frame there is never
// narrower than this. A 390 px phone shows 368 px of map, 336 px of it inside
// the fit's margins, which is 3.69° of longitude at z6: a frame at least this
// wide lands at z6 or below whatever card is open. Widened about its centre.
const MIN_FRAME_LON = 3.7;
const [DETAIL_BOX] = Object.values(DETAIL_AREAS);

// Where a unit's Bengali in the seed has no counterpart in the names table,
// and that is right. The names table holds a unit's Bengali only from the
// unit's official source; the seed may name it from the seed's own cited
// source. Each exception gives its reason, and the build checks that the
// record's own citation carries the name. Any other disagreement fails.
const NAME_EXCEPTIONS = {
  'harikela/Cachar': {
    nameBn: 'কাছাড়',
    reason:
      "Cachar's official sites give no Bengali name (checked 2026-09-26), so the names table has none and the basemap draws no label for it. " +
      "The seed names it from its own cited source, bn.wikipedia's janapada list, revision 9167617, which reads \"চট্টগ্রাম, পার্বত্য চট্টগ্রাম, ত্রিপুরা, সিলেট ও কাছাড়\". " +
      'The card shows the seed\'s name and the basemap shows none: the two rules do not conflict. Allowed by the user, 2026-09-26.',
  },
};

// Whom the shipped areas must credit, by what they are made of. The build
// fails if the descriptor's credit for the areas leaves one out.
const CREDITS = {
  'COD-AB': {
    link: 'data.humdata.org/dataset/cod-ab-bgd',
    source: 'Unions of whole districts: "Bangladesh - Subnational Administrative Boundaries" (OCHA COD-AB v03, Bangladesh Bureau of Statistics / OCHA FISS), https://data.humdata.org/dataset/cod-ab-bgd',
    licence: 'CC BY 3.0 IGO (http://creativecommons.org/licenses/by/3.0/igo/legalcode) — adapted: districts merged and simplified',
  },
  geoBoundaries: {
    link: 'geoboundaries.org',
    source: 'India\'s districts: geoBoundaries IND ADM2, https://www.geoboundaries.org',
    licence: 'ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/)',
  },
  'Natural Earth': {
    link: 'naturalearthdata.com',
    source: 'Myanmar\'s states: Natural Earth 1:10m admin-1, https://www.naturalearthdata.com',
    licence: 'public domain',
  },
  OpenStreetMap: {
    link: 'openstreetmap.org/copyright',
    source: 'The land between a unit and Bangladesh\'s border: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright',
    licence: 'ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/)',
  },
};
// A database made with ODbL data is offered under the ODbL, so where any part
// of the areas is ODbL the areas file is, and the descriptor says so.
const ODBL_PARTS = ['geoBoundaries', 'OpenStreetMap'];
const ODBL = 'https://opendatacommons.org/licenses/odbl/1-0/';

const sources = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function pinned(entry, file = path.join(CACHE, entry.file)) {
  const buf = fs.readFileSync(file);
  if (sha256(buf) !== entry.sha256) throw new Error(`${entry.file}: sha256 ${sha256(buf)}, pinned ${entry.sha256} — refusing it`);
  return buf;
}
async function ms(cmd, files) {
  // Copies: mapshaper rewinds the rings of an input it is handed, in place.
  const copies = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  const out = await mapshaper.applyCommands(`${cmd} -o out.json format=geojson geojson-type=FeatureCollection`, copies);
  return JSON.parse(out['out.json'].toString());
}
const fc = (features) => ({ type: 'FeatureCollection', features });
const shapes = (geometries) => fc(geometries.map((geometry, i) => ({ type: 'Feature', properties: { i }, geometry })));
async function km2(fcIn) {
  if (!fcIn.features.length) return 0;
  const out = await mapshaper.applyCommands('-i in.json -each "km2=this.area/1e6" -o out.json format=json', { 'in.json': JSON.parse(JSON.stringify(fcIn)) });
  return JSON.parse(out['out.json'].toString()).reduce((s, r) => s + r.km2, 0);
}
// The part of a that b covers. (Measured this way, not by erasing: mapshaper's
// erase of one of these unions from another comes back empty.)
const within = (a, b) => ms('-i combine-files a.json b.json -target a -clip source=b', { 'a.json': a, 'b.json': b });

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const photos = fs.existsSync(PHOTOS) ? JSON.parse(fs.readFileSync(PHOTOS, 'utf8')) : {};
const names = JSON.parse(fs.readFileSync(NAMES, 'utf8'));
const admin1 = readSource('ne_10m_admin_1_states_provinces.geojson');

/*
|--------------------------------------------------------------------------
| THE SEED'S OWN RULES
|--------------------------------------------------------------------------
*/
const problems = [];
const ids = Object.keys(seed).sort((a, b) => seed[a].order - seed[b].order);
if (JSON.stringify(ids.map((id) => seed[id].order)) !== JSON.stringify(ids.map((_, i) => i + 1))) problems.push(`order is not 1…${ids.length}, once each`);
for (const id of SHIP) if (!(id in seed)) problems.push(`SHIP names "${id}", which the seed does not have`);
for (const [id, r] of Object.entries(seed)) {
  if (r.id !== id) problems.push(`${id}: its id field says "${r.id}"`);
  for (const f of ['nameBn', 'nameEn']) if (typeof r[f] !== 'string' || !r[f]) problems.push(`${id}: ${f} is missing`);
  for (const f of CITED) {
    if (r[f] === undefined || r[f] === null) continue;
    const c = r.sources?.[f];
    if (!Array.isArray(c) || !c.length || !c.every((x) => x.url && x.states)) problems.push(`${id}.${f}: not cited with what the source states`);
  }
  // One host is one source: two citations from the same host are one citation.
  for (const [f, list] of Object.entries(r.sources ?? {})) {
    const hosts = (list ?? []).filter((c) => c.url).map((c) => new URL(c.url).host);
    if (new Set(hosts).size !== hosts.length) problems.push(`${id}.sources.${f}: two citations from one host`);
  }
  if (r.geometry?.area?.method !== 'adminUnion') problems.push(`${id}: geometry.area.method is not adminUnion`);
  if (!Array.isArray(r.sources?.geometry) || !r.sources.geometry.length) problems.push(`${id}: its units are not cited`);
}
// A photo is found only for a record whose seed says it wants one (null).
for (const [id, entry] of Object.entries(photos)) {
  if (!(id in seed)) problems.push(`photos.seed.json: "${id}" is not a record`);
  else if (seed[id].photo !== null) problems.push(`photos.seed.json: ${id}'s seed photo is ${JSON.stringify(seed[id].photo)}, not null`);
  const p = entry.photo;
  for (const f of ['commonsFile', 'page', 'author', 'licence', 'sha1', 'size', 'crop']) if (!p?.[f]) problems.push(`${id}.photo: no ${f}`);
  if (!FREE_LICENCES.test(p?.licence ?? '')) problems.push(`${id}.photo: licence "${p?.licence}" is not one these maps may ship`);
  if (/^CC BY/.test(p?.licence ?? '') && !p?.licenceUrl) problems.push(`${id}.photo: a CC BY licence needs its licenceUrl`);
  for (const kind of ['marker', 'card']) {
    const file = path.join(DIR, 'photos', `${id}-${kind}.webp`);
    if (!fs.existsSync(file)) problems.push(`${id}.photo: ${path.relative(ROOT, file)} is missing — run tools/extract-commons-photos.mjs ancient-janapadas`);
    else if (fs.statSync(file).size > PHOTO_MAX_KB[kind] * 1024) problems.push(`${id}.photo: ${kind} file is over ${PHOTO_MAX_KB[kind]} KB`);
  }
  // The photo's marker sits at the site it shows: the site's own point, from
  // its Wikidata item, cited — never the area's centre.
  const site = entry.site;
  if (!/^Q\d+$/.test(site?.wikidata ?? '') || !Array.isArray(site?.at) || site.at.length !== 2 || !site.at.every(Number.isFinite)) problems.push(`${id}.site: no Wikidata item and point for the site the photo shows`);
  const cites = entry.sources?.siteAt;
  if (!Array.isArray(cites) || !cites.length || !cites.every((c) => c.url && c.states)) problems.push(`${id}.site: its point is not cited with what the source states`);
  else if (!cites.some((c) => new URL(c.url).host === 'www.wikidata.org' && c.url.includes(site?.wikidata))) problems.push(`${id}.site: not cited to its own Wikidata item`);
}
if (problems.length) throw new Error(`the seed breaks its own rules:\n  ${problems.join('\n  ')}`);

/*
|--------------------------------------------------------------------------
| THE SEED'S BENGALI AGAINST THE NAMES TABLE
|--------------------------------------------------------------------------
|
| Every unit name a record shows is spelled as the names table spells it —
| each unit's one official source, the same the basemap labels from. A
| spelling family (ণ/ন, ঙ্গ/ঙ, a final দহ/দা) is how a near miss shows; a
| quotation inside a citation keeps its source's own spelling and is not
| checked. A unit the names table has no Bengali for must be a listed
| exception.
*/
const nfc = (s) => s?.normalize('NFC');
const STATES_BN = { 'IND-3301': 'Tripura', [admin1.features.find((f) => f.properties.adm0_a3 === 'MMR' && f.properties.name === 'Rakhine').properties.adm1_code]: 'Rakhine' };
const official = new Map(); // spelling → where it is from
for (const v of Object.values(names.bangladesh)) official.set(nfc(v.nameBn), `National Portal (${v.nameEn})`);
for (const v of Object.values(names.india)) if (v.nameBn) official.set(nfc(v.nameBn), `${v.state} district site (${v.nameEn})`);
for (const code of Object.keys(STATES_BN)) {
  const p = admin1.features.find((f) => f.properties.adm1_code === code).properties;
  official.set(nfc(p.name_bn), `Natural Earth (${p.name_en})`);
}
const fold = (s) => nfc(s).replace(/ণ/g, 'ন').replace(/ঙ্গ/g, 'ঙ').replace(/দহ$/, 'দা');
const byFold = new Map([...official.keys()].map((k) => [fold(k), k]));
const nameProblems = [];
const exceptionsUsed = new Set();
let displayedChecked = 0;
for (const id of ids) {
  const r = seed[id];
  for (const f of SHIPPED) {
    if (typeof r[f] !== 'string' || f === 'nameEn') continue;
    displayedChecked++;
    // Words, and runs of two or three — a name like পূর্ব বর্ধমান is two.
    const words = nfc(r[f]).split(/[\s,()।;—–-]+/).filter(Boolean);
    for (let n = 1; n <= 3; n++)
      for (let i = 0; i + n <= words.length; i++) {
        const run = words.slice(i, i + n).join(' ');
        const want = byFold.get(fold(run));
        if (want && want !== run) nameProblems.push(`${id}.${f}: "${run}" — the names table has "${want}" (${official.get(want)})`);
      }
  }
  const area = r.geometry.area;
  const unitNames = [
    ...(area.bangladesh ?? []).map((u) => ({ what: u.pcode, nameBn: u.nameBn, want: names.bangladesh[u.pcode]?.nameBn })),
    ...(area.outside ?? []).map((u) => {
      if (u.country === 'IND' && u.level !== 'admin1') {
        const d = Object.values(names.india).find((x) => x.state === u.admin1 && (x.nameEn === u.admin2 || x.geoBoundaries === u.admin2));
        return { what: u.admin2, nameBn: u.nameBn, want: d?.nameBn ?? null };
      }
      const code = Object.keys(STATES_BN).find((c) => STATES_BN[c] === u.admin1);
      return { what: u.admin1, nameBn: u.nameBn, want: code ? admin1.features.find((f) => f.properties.adm1_code === code).properties.name_bn : null };
    }),
  ];
  for (const u of unitNames) {
    if (u.want) {
      if (nfc(u.nameBn) !== nfc(u.want)) nameProblems.push(`${id}: unit ${u.what} is "${u.nameBn}" in the seed, "${u.want}" in the names table`);
      continue;
    }
    const key = `${id}/${u.what}`;
    const allowed = NAME_EXCEPTIONS[key];
    const citedHere = Object.values(r.sources ?? {}).flat().some((c) => nfc(c.states ?? '').includes(nfc(u.nameBn)));
    if (!allowed) nameProblems.push(`${key}: the names table has no Bengali for ${u.what}, and the seed's "${u.nameBn}" is not a listed exception`);
    else if (nfc(allowed.nameBn) !== nfc(u.nameBn)) nameProblems.push(`${key}: the exception allows "${allowed.nameBn}", the seed says "${u.nameBn}"`);
    else if (!citedHere) nameProblems.push(`${key}: allowed on the strength of the record's own citation, which does not carry "${u.nameBn}"`);
    else exceptionsUsed.add(key);
  }
}
for (const key of Object.keys(NAME_EXCEPTIONS)) if (!exceptionsUsed.has(key) && !nameProblems.some((p) => p.startsWith(key))) nameProblems.push(`${key}: listed as an exception but no longer needed — take it off the list`);
if (nameProblems.length) throw new Error(`the seed's Bengali disagrees with the names table:\n  ${nameProblems.join('\n  ')}`);

/*
|--------------------------------------------------------------------------
| UNITS — the basemap's own, each matched exactly once
|--------------------------------------------------------------------------
|
| Bangladesh: OCHA COD-AB districts, by pcode. India: geoBoundaries districts,
| by the name the names table records for a district the Local Government
| Directory lists in that state; Tripura is the union of its districts.
| Myanmar: Natural Earth admin-1, by name. Outside Bangladesh each unit is the
| basemap's: cut at Bangladesh's border as COD-AB draws it (and at the other
| countries' point-of-view polygons), with every piece of land between it and
| Bangladesh's border that the basemap gives it.
*/
const codAbZip = pinned(sources.codAbBangladesh);
const bd0 = zipEntry(codAbZip, 'bgd_admin0.geojson');
const bd2 = zipEntry(codAbZip, 'bgd_admin2.geojson');
const P = await bangladeshUnits({
  bd0,
  gbIndia: JSON.parse(pinned(sources.geoBoundariesIndia)),
  landIn: JSON.parse(pinned(sources.osmBangladeshLand, path.join(ROOT, sources.osmBangladeshLand.file))),
  countries: readSource('ne_10m_admin_0_countries_bdg.geojson'),
  admin1,
  neLines: readSource('ne_10m_admin_0_boundary_lines_land.geojson'),
  names,
});
const byProp = (features, prop) => {
  const m = new Map();
  for (const f of features) m.set(f.properties[prop], m.has(f.properties[prop]) ? null : f.geometry);
  return m;
};
const indiaCut = byProp(P.indiaDistricts.features, 'shapeID');
const indiaWhole = byProp(P.inCoverage.features, 'shapeID');
const myanmarCut = byProp(P.myanmarStates.features, 'adm1_code');
const myanmarWhole = byProp(P.myanmarAll.features, 'adm1_code');
// The land between each unit and Bangladesh's border, as the basemap gives it out.
const piecesOf = new Map(); // the basemap's unit key (shapeName, adm1_code) → [geometry]
for (const p of await P.unownedPieces(fc(P.landDetailAll), DETAIL_BOX)) {
  if (!P.touchesBorder(p.piece.geometry)) continue;
  const { unit } = P.ownerOf(p);
  if (!piecesOf.has(unit.unit)) piecesOf.set(unit.unit, []);
  piecesOf.get(unit.unit).push(p.piece.geometry);
}

const notes = [];
const once = (hits, what) => {
  if (hits.length !== 1) throw new Error(`${what}: ${hits.length} matches — every named unit must match exactly once`);
  return hits[0];
};
const theOne = (map, key, what) => {
  const g = map.get(key);
  if (!g) throw new Error(`${what}: ${g === null ? 'more than one' : 'no'} feature — every named unit must match exactly once`);
  return g;
};
function resolveUnits(id, area) {
  const units = [];
  for (const u of area.bangladesh ?? []) {
    const f = once(bd2.features.filter((x) => x.properties.adm2_pcode === u.pcode), `${id}: COD-AB ${u.pcode}`);
    if (f.properties.adm2_name !== u.nameEn) notes.push(`${id}: ${u.pcode} is "${f.properties.adm2_name}" in COD-AB, "${u.nameEn}" in the seed`);
    units.push({ country: 'BGD', id: u.pcode, label: f.properties.adm2_name, geometry: f.geometry, whole: f.geometry, pieces: [] });
  }
  for (const u of area.outside ?? []) {
    if (u.country === 'IND') {
      const districts = u.level === 'admin1'
        ? Object.values(names.india).filter((d) => d.state === u.admin1)
        : [once(Object.values(names.india).filter((d) => d.state === u.admin1 && (d.nameEn === u.admin2 || d.geoBoundaries === u.admin2)), `${id}: ${u.admin1} / ${u.admin2} in the names table`)];
      if (u.level === 'admin1' && districts.length === 0) throw new Error(`${id}: the names table lists no district of ${u.admin1}`);
      for (const d of districts) {
        // Matched exactly once inside COVERAGE by lib/bangladesh-units.mjs.
        const { shapeID } = P.indiaUnits.get(d.geoBoundaries);
        if (u.level !== 'admin1' && d.geoBoundaries !== u.admin2) notes.push(`${id}: "${u.admin2}" is geoBoundaries "${d.geoBoundaries}"`);
        units.push({
          country: 'IND',
          id: shapeID,
          label: d.geoBoundaries,
          geometry: theOne(indiaCut, shapeID, `${id}: geoBoundaries "${d.geoBoundaries}", cut at the border`),
          whole: theOne(indiaWhole, shapeID, `${id}: geoBoundaries "${d.geoBoundaries}"`),
          pieces: piecesOf.get(d.geoBoundaries) ?? [],
        });
      }
      if (u.level === 'admin1') notes.push(`${id}: ${u.admin1} is the union of its ${districts.length} districts — ${districts.map((d) => d.geoBoundaries).join(', ')}`);
      continue;
    }
    if (u.country === 'MMR' && u.level === 'admin1') {
      const f = once(admin1.features.filter((x) => x.properties.adm0_a3 === 'MMR' && x.properties.name === u.admin1), `${id}: Natural Earth admin-1 MMR "${u.admin1}"`);
      const code = f.properties.adm1_code;
      units.push({
        country: 'MMR',
        id: code,
        label: f.properties.name,
        geometry: theOne(myanmarCut, code, `${id}: Natural Earth ${code}, cut at the border`),
        whole: theOne(myanmarWhole, code, `${id}: Natural Earth ${code}`),
        pieces: piecesOf.get(code) ?? [],
      });
      continue;
    }
    throw new Error(`${id}: no source for ${JSON.stringify(u)}`);
  }
  return units;
}

/*
|--------------------------------------------------------------------------
| AREAS
|--------------------------------------------------------------------------
|
| Each area is the union of its units, and each unit outside Bangladesh
| brings the land the basemap gives it. Measured against the union of the
| units as their own sources draw them: what the cut took away (land inside
| Bangladesh the area no longer claims) and what the land between added.
*/
const built = {};
for (const id of ids) {
  const units = resolveUnits(id, seed[id].geometry.area);
  const union = await ms('-i in.json -clean -dissolve', { 'in.json': shapes(units.flatMap((u) => [u.geometry, ...u.pieces])) });
  if (union.features.length !== 1) throw new Error(`${id}: the union came out as ${union.features.length} features`);
  const wholeUnion = await ms('-i in.json -dissolve', { 'in.json': shapes(units.map((u) => u.whole)) });
  const outside = units.filter((u) => u.country !== 'BGD');
  const cutFromUnits = (await km2(shapes(outside.map((u) => u.whole)))) - (await km2(shapes(outside.map((u) => u.geometry))));
  const cutByBangladesh = outside.length ? await km2(await within(shapes(outside.map((u) => u.whole)), P.bd)) : 0;
  const before = await km2(wholeUnion);
  const after = await km2(union);
  const kept = await km2(await within(union, wholeUnion));
  built[id] = {
    units,
    union: union.features[0].geometry,
    clip: { outside: outside.length, cutFromUnits, cutByBangladesh, lost: before - kept, added: after - kept, pieces: outside.reduce((s, u) => s + u.pieces.length, 0), before, after },
  };
}

// Simplified as the lakes map simplifies its areas, and together, so an edge
// two outlines share stays one line.
const simplified = await simplifyFeatures(JSON.parse(JSON.stringify(ids.map((id) => ({ type: 'Feature', properties: { id }, geometry: built[id].union })))), SIMPLIFY_METRES);
for (const f of simplified) built[f.properties.id].geometry = f.geometry;

// A ring's area in km², on a sphere.
const ringKm2 = (ring) => {
  const R = 6371.0088;
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    s += (((x2 - x1) * Math.PI) / 180) * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
  }
  return Math.abs((s * R * R) / 2);
};
const bboxOf = (g) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
    for (const [x, y] of poly[0]) (b[0] = Math.min(b[0], x)), (b[1] = Math.min(b[1], y)), (b[2] = Math.max(b[2], x)), (b[3] = Math.max(b[3], y));
  return b;
};
const inRing = ([x, y], ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
// Where Bangladesh's border is an area's edge, how far the drawn outline lies
// from it: a point every 200 m along the border.
const STEP_KM = 0.2;
const borderSamples = [];
for (const c of P.landBorderLines) {
  let next = 0;
  let walked = 0;
  for (let i = 1; i < c.length; i++) {
    const [ax, ay] = c[i - 1];
    const [bx, by] = c[i];
    const len = Math.hypot((bx - ax) * Math.cos((ay * Math.PI) / 180), by - ay) * 111.32;
    for (; next <= walked + len; next += STEP_KM) {
      const t = len ? (next - walked) / len : 0;
      borderSamples.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    }
    walked += len;
  }
}
for (const id of ids) {
  const b = built[id];
  const { geometry } = b;
  b.holes = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).reduce((s, p) => s + p.length - 1, 0);
  // Which units each part holds, by each unit's own inner point.
  const unitPoints = await ms('-i in.json -points inner', { 'in.json': fc(b.units.map((u) => ({ type: 'Feature', properties: { unit: u.id }, geometry: u.geometry }))) });
  const parts = (await ms('-i in.json -explode -each "km2=this.area/1e6"', { 'in.json': fc([{ type: 'Feature', properties: {}, geometry }]) })).features.sort((x, y) => y.properties.km2 - x.properties.km2);
  const partHolds = parts.map((p) => unitPoints.features.filter((u) => inRing(u.geometry.coordinates, p.geometry.coordinates[0])).map((u) => b.units.find((x) => x.id === u.properties.unit).label));
  // A part holding no unit's own point is a piece of one — an island, an exclave.
  const partPoints = (await ms('-i in.json -points inner', { 'in.json': fc(parts) })).features;
  const inUnit = (pt, g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((poly) => inRing(pt, poly[0]));
  const pieceOf = parts.map((_, i) => b.units.find((u) => inUnit(partPoints[i].geometry.coordinates, u.geometry))?.label ?? null);
  b.parts = parts.map((p, i) => ({ km2: p.properties.km2, holds: partHolds[i], pieceOf: pieceOf[i], bbox: bboxOf(p.geometry) }));
  // The border stretches that are this area's edge, and the drawn outline's distance from them.
  const edgeGrid = new SegmentGrid(ringsOf(b.union));
  const onEdge = borderSamples.filter((p) => edgeGrid.nearest(p, 0.002));
  const drawnGrid = new SegmentGrid(ringsOf(geometry));
  const off = onEdge.map((p) => drawnGrid.nearest(p, 5)?.km ?? 5).sort((x, y) => x - y);
  b.edge = { km: onEdge.length * STEP_KM, median: off.length ? off[Math.floor(off.length / 2)] : 0, max: off.length ? off[off.length - 1] : 0 };
}

/*
|--------------------------------------------------------------------------
| REPORT — every area, shipped or not
|--------------------------------------------------------------------------
*/
const inDetail = (b) => Object.values(DETAIL_AREAS).some(([w, s, e, n]) => b[0] >= w && b[1] >= s && b[2] <= e && b[3] <= n);
const round3 = (b) => b.map((v) => Number(v.toFixed(3)));
const frameOf = ([w, s0, e, n]) => {
  const dx = (e - w) * FRAME_MARGIN;
  const dy = (n - s0) * FRAME_MARGIN;
  return [w - dx, s0 - dy, e + dx, n + dy];
};
const widened = (f) => {
  if (inDetail(f) || f[2] - f[0] >= MIN_FRAME_LON) return f;
  // About its centre, but never past the basemap's bounds, which the camera cannot cross.
  const [W, , E] = COVERAGE;
  const w = Math.min(Math.max((f[0] + f[2]) / 2 - MIN_FRAME_LON / 2, W), E - MIN_FRAME_LON);
  return [w, f[1], w + MIN_FRAME_LON, f[3]];
};
const extentOf = (g) => {
  const pts = JSON.stringify(g.coordinates).match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g).map((t) => t.split(',').map(Number));
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
};
for (const id of ids) {
  const tight = frameOf(extentOf(built[id].geometry));
  built[id].frame = round3(widened(tight));
  if (widened(tight) !== tight) built[id].widenedFrom = round3(tight);
}
const n0 = (v) => Math.round(v).toLocaleString('en-US');
console.log('id           units    km²   parts  holes  bbox                              frame                         in detail');
for (const id of ids) {
  const b = built[id];
  const total = b.parts.reduce((s, p) => s + p.km2, 0);
  const bbox = extentOf(b.geometry).map((v) => v.toFixed(2)).join(', ');
  console.log(`${id.padEnd(12)} ${String(b.units.length).padStart(5)} ${n0(total).padStart(7)} ${String(b.parts.length).padStart(6)} ${String(b.holes).padStart(6)}  ${bbox.padEnd(32)}  ${b.frame.join(', ').padEnd(28)}  ${inDetail(b.frame) ? 'yes' : 'no'}${SHIP.includes(id) ? '   SHIPPED' : ''}`);
  if (b.widenedFrom) console.log(`    frame widened to ${MIN_FRAME_LON}° of longitude outside the detail box, from ${b.widenedFrom.join(', ')}`);
  if (b.parts.length > 1)
    for (const [i, p] of b.parts.entries())
      console.log(`    part ${i + 1}: ${n0(p.km2)} km² — ${p.holds.length ? `holds ${p.holds.join(', ')}` : `a detached piece of ${p.pieceOf ?? '(no unit)'} at ${p.bbox.map((v) => v.toFixed(2)).join(', ')}`}`);
}
console.log('\nthe cut at Bangladesh\'s border and the land between (km², unsimplified)');
console.log('id           outside  cut from units (by Bangladesh)  lost by the area  added (pieces)   before → after          border as edge: km, drawn outline off it median / max');
for (const id of ids) {
  const { clip: c, edge: e } = built[id];
  console.log(`${id.padEnd(12)} ${String(c.outside).padStart(7)}  ${c.cutFromUnits.toFixed(2).padStart(10)} (${c.cutByBangladesh.toFixed(2).padStart(8)})      ${c.lost.toFixed(2).padStart(10)}      ${c.added.toFixed(2).padStart(9)} (${String(c.pieces).padStart(3)})   ${n0(c.before).padStart(7)} → ${n0(c.after).padStart(7)}     ${e.km.toFixed(1).padStart(7)}  ${(e.median * 1000).toFixed(0).padStart(4)} m / ${(e.max * 1000).toFixed(0).padStart(4)} m`);
}
console.log(`\nnames: ${displayedChecked} displayed strings and every unit of ${ids.length} records match the names table; ${exceptionsUsed.size} allowed exception(s): ${[...exceptionsUsed].map((k) => `${k} ${NAME_EXCEPTIONS[k].nameBn}`).join('; ') || 'none'}`);
if (notes.length) console.log(`\nmappings and differences:\n  ${notes.join('\n  ')}`);

/*
|--------------------------------------------------------------------------
| PINNED: each area as drawn. The inputs are pinned by checksum and every
| unit is matched exactly once, so a move here means a unit list, a source or
| a constant changed — stop and report old and new; never re-pin to pass.
|--------------------------------------------------------------------------
*/
const PINNED = fs.existsSync(PINS) ? JSON.parse(fs.readFileSync(PINS, 'utf8')) : {};
const moved = [];
for (const id of ids) {
  built[id].hash = sha256(JSON.stringify(built[id].geometry.coordinates)).slice(0, 16);
  if (PINNED[id] !== built[id].hash) moved.push(`${id}: pinned ${PINNED[id] ?? '(none)'}, now ${built[id].hash}`);
}
const stale = Object.keys(PINNED).filter((id) => !(id in seed));
if (moved.length || stale.length) throw new Error(`area pins do not hold — stop and report, never re-pin to pass:\n  ${[...moved, ...stale.map((id) => `${id}: pinned but not in the seed`)].join('\n  ')}`);

/*
|--------------------------------------------------------------------------
| RECORDS — the shipped ones
|--------------------------------------------------------------------------
*/
const inner = await innerPoints(ids.map((id) => ({ type: 'Feature', properties: { id }, geometry: built[id].geometry })));
const cropped = (p) => Object.values(p.crop).some(([x, y, w, h]) => x !== 0 || y !== 0 || w !== p.size[0] || h !== p.size[1]);

const out = {};
for (const id of ids) {
  const r = seed[id];
  const rec = {};
  for (const f of SHIPPED) if (f in r) rec[f] = r[f];
  built[id].labelAt = inner[id].map((n) => Number(n.toFixed(5)));
  rec.labelAt = built[id].labelAt;
  rec.frame = built[id].frame;
  // null in the seed means a photo is wanted: the photo seed's, else still null.
  if ('photo' in r) {
    const p = photos[id]?.photo;
    rec.photo = p
      ? {
          marker: `photos/${id}-marker.webp`,
          card: `photos/${id}-card.webp`,
          author: p.author,
          licence: p.licence,
          ...(p.licenceUrl ? { licenceUrl: p.licenceUrl } : {}),
          page: p.page,
          // CC BY-SA asks the credit of a derivative to say what was changed.
          ...(cropped(p) ? { cropped: true } : {}),
        }
      : r.photo;
    // The photo's marker stands on the site the photo shows, which lies in the area.
    if (p) {
      const at = photos[id].site.at;
      if (!inPolygon(at, built[id].union)) throw new Error(`${id}: its photo's site ${photos[id].site.wikidata} at ${at.join(', ')} lies outside its area`);
      rec.siteAt = at.map((n) => Number(n.toFixed(5)));
    }
  }
  if (SHIP.includes(id)) out[id] = rec;
}

// What the shipped areas are made of, and so whom they credit.
const madeOf = new Set();
for (const id of SHIP)
  for (const u of built[id].units) {
    madeOf.add(u.country === 'BGD' ? 'COD-AB' : u.country === 'IND' ? 'geoBoundaries' : 'Natural Earth');
    if (u.pieces.length) madeOf.add('OpenStreetMap');
  }
const credited = JSON.parse(fs.readFileSync(path.join(DIR, 'descriptor.json'), 'utf8')).sources.areas.attribution;
const uncredited = [...madeOf].filter((s) => !credited.includes(CREDITS[s].link));
if (uncredited.length) throw new Error(`the shipped areas are made from ${[...madeOf].join(', ')}, and the descriptor's credit for them leaves out ${uncredited.join(', ')}`);
const made = Object.keys(CREDITS).filter((s) => madeOf.has(s));
const odbl = made.filter((s) => ODBL_PARTS.includes(s));
if (odbl.length && !credited.includes(ODBL.replace(/^https:\/\//, ''))) throw new Error(`the shipped areas hold ODbL data (${odbl.join(', ')}), and the descriptor does not say the areas file is offered under the ODbL`);

fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, 'records.json'), JSON.stringify(out, null, 2) + '\n');
fs.writeFileSync(
  path.join(DIR, 'areas.geojson'),
  JSON.stringify({
    type: 'FeatureCollection',
    properties: {
      source: made.map((s) => CREDITS[s].source).join('; '),
      licence: odbl.length
        ? `This file is offered under the ODbL 1.0 (${ODBL}). Its parts: ${made.map((s) => `${s}, ${CREDITS[s].licence}`).join('; ')}`
        : made.map((s) => CREDITS[s].licence).join('; '),
    },
    features: SHIP.map((id) => ({ type: 'Feature', properties: { id }, geometry: built[id].geometry })),
  }) + '\n',
);

console.log(`
ancient-janapadas: ${ids.length} areas built, ${SHIP.length} shipped (${SHIP.join(', ')}) — areas.geojson ${(fs.statSync(path.join(DIR, 'areas.geojson')).size / 1024).toFixed(1)} KB, records.json ${(fs.statSync(path.join(DIR, 'records.json')).size / 1024).toFixed(1)} KB`);
