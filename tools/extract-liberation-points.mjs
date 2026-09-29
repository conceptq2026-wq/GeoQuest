// One-off: the OpenStreetMap points liberation-war-1971 takes where its
// sources give no point (the user's rule, 2026-09-28: OSM next, matched by
// name inside the expected upazila or district; else the upazila's centroid).
//
//   node tools/extract-liberation-points.mjs --search[=id,id]   list every name match per target
//   node tools/extract-liberation-points.mjs                    save the chosen elements
//
// Output: tools/sources/osm-liberation-points.geojson (ODbL), each element by
// type, id and version, checked to lie inside its area. Re-run only on
// purpose, then review the diff and update its checksum in sources.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, zipEntry } from './lib/geo.mjs';
import { UA } from './net.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where the extract goes, and the pinned COD-AB it checks areas against. Change here if they move.
const OUT = path.join(ROOT, 'tools', 'sources', 'osm-liberation-points.geojson');
const SOURCES = path.join(HERE, 'sources.json');
const HEADERS = { 'User-Agent': UA };

/*
 * Each target: the name to match (a regular expression over name, name:en,
 * name:bn and alt_name) and the area it must lie in — a COD-AB upazila (adm3) or district
 * (adm2) of Bangladesh, or, for a place in India, a box [south, west, north,
 * east] round the district its source names. `search`, where given, is a
 * smaller box the name search runs in, so that Overpass answers; the element
 * must still lie inside `area`. `pick` is the element chosen from a --search,
 * as type/id; null where nothing matched or more than one place could be meant.
 * Bengali য় is matched in both its encodings (U+09DF and U+09AF U+09BC).
 */
export const TARGETS = {
  'hq-3-teliapara': { name: 'teliapara|তেলিয়াপাড়া', area: { adm2: 'Habiganj' }, pick: 'node/12169803344' },
  'hq-1-harina': { name: 'harina|হরিণা|হরিনা', area: { adm2: 'Khagrachhari' }, pick: null },
  'hq-4-nasimpur': { name: 'nasimpur|masimpur|নাসিমপুর|মাসিমপুর', area: { box: [24.4, 92.1, 25.1, 93.1], why: 'Karimganj and Cachar, Assam' }, pick: null },
  'hq-5-banshtala': { name: 'banshtala|bashtala|bansh tala|বাঁশতলা', area: { adm3: 'Dowarabazar' }, pick: 'node/9843505110' },
  'hq-6-burimari': { name: 'burimari|বুড়িমারী|বুড়িমারি', area: { adm3: 'Patgram' }, pick: 'node/9271966139' },
  'hq-11-mahendraganj': { name: 'mahendra ?ganj|মহেন্দ্রগঞ্জ', area: { box: [25.1, 89.7, 25.6, 90.2], why: 'South West Garo Hills, Meghalaya' }, pick: 'node/5945043728' },
  'place-arts-building': { name: 'arts building|arts faculty|kala bhaban|kola bhobon|কলা ভবন|কলাভবন', area: { adm3: 'Dhaka South City Corporation' }, pick: 'way/1152392502' },
  'place-paltan-maidan': { name: 'paltan maidan|paltan moidan|পল্টন ময়দান', area: { adm3: 'Dhaka South City Corporation' }, pick: null },
  'place-rajarbagh-police-lines': { name: 'rajarbagh police|রাজারবাগ পুলিশ', area: { adm3: 'Dhaka South City Corporation' }, pick: 'way/24475522' },
  'place-kalurghat-radio': { name: 'kalurghat.*(radio|betar|transmitter)|কালুরঘাট.*বেতার|স্বাধীন বাংলা বেতার', area: { adm2: 'Chattogram' }, search: [22.34, 91.82, 22.46, 91.93], pick: 'node/4273252489' },
  'place-rayerbazar-killing-field': { name: 'rayer ?bazar.*(boddho|bodho|killing|memorial|বধ্য)|রায়ের ?বাজার.*বধ্য|বধ্যভূমি.*রায়ের', area: { adm2: 'Dhaka' }, search: [23.72, 90.33, 23.77, 90.38], pick: 'way/1074764129' },
  'grave-mostafa-kamal': { name: 'mostafa kamal|mustafa kamal|mustofa kamal|মোস্তফা কামাল|bir ?s[h]?res?h?th?[ao]|বীর ?শ্রেষ্ঠ', area: { adm3: 'Akhaura' }, pick: 'node/9365730988' },
  'grave-ruhul-amin': { name: 'ruhul amin|রুহুল আমিন|bir ?s[h]?res?h?th?[ao]|বীর ?শ্রেষ্ঠ', area: { adm3: 'Rupsa' }, pick: null },
  'grave-munshi-abdur-rouf': { name: 'abdur rouf|abdur rauf|আব্দুর রউফ|আবদুর রউফ|bir ?s[h]?res?h?th?[ao]|বীর ?শ্রেষ্ঠ', area: { adm3: 'Naniarchar' }, pick: null },
};

const YA = (re) => re.replace(/য়|য়/g, '(য়|য়)'); // Overpass has no (?:…)
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
const zip = fs.readFileSync(path.join(CACHE, sources.codAbBangladesh.file));
if (zip.length !== sources.codAbBangladesh.size || sha256(zip) !== sources.codAbBangladesh.sha256) throw new Error('COD-AB zip does not match its pin');
const adm = { adm2: zipEntry(zip, 'bgd_admin2.geojson').features, adm3: zipEntry(zip, 'bgd_admin3.geojson').features };
const parts = (g) => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]);
const pointInRing = (p, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
function areaOf(t) {
  if (t.area.box) {
    const [s, w, n, e] = t.area.box;
    return { box: t.area.box, inside: (p) => p[1] >= s && p[1] <= n && p[0] >= w && p[0] <= e, label: t.area.why };
  }
  const level = t.area.adm3 ? 'adm3' : 'adm2';
  const f = adm[level].find((x) => x.properties[`${level}_name`] === t.area[level]);
  if (!f) throw new Error(`no COD-AB ${level} named ${t.area[level]}`);
  const pts = parts(f.geometry).flatMap((p) => p[0]);
  const box = [Math.min(...pts.map((p) => p[1])), Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0]))];
  return { box, inside: (p) => parts(f.geometry).some((poly) => pointInRing(p, poly[0])), label: `${t.area[level]} (COD-AB ${level}, ${f.properties[`${level}_pcode`]})` };
}

const EP = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(query) {
  for (let round = 1; round <= 3; round++) {
    for (const url of EP) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(90_000) });
        const t = await res.text();
        if (res.ok && t.startsWith('{')) return JSON.parse(t);
      } catch {}
    }
    await new Promise((r) => setTimeout(r, round * 10_000));
  }
  throw new Error('every Overpass endpoint failed');
}
const at = (el) => (el.type === 'node' ? [el.lon, el.lat] : [el.center.lon, el.center.lat]);

const only = process.argv.find((a) => a.startsWith('--search='))?.slice(9).split(',');
if (only || process.argv.includes('--search')) {
  for (const [id, t] of Object.entries(TARGETS)) {
    if (only && !only.includes(id)) continue;
    const a = areaOf(t);
    const bb = (t.search ?? a.box).join(',');
    const re = YA(t.name);
    const q = `[out:json][timeout:60];(nwr["name"~"${re}",i](${bb});nwr["name:en"~"${re}",i](${bb});nwr["name:bn"~"${re}",i](${bb});nwr["alt_name"~"${re}",i](${bb}););out meta center;`;
    const els = (await overpass(q)).elements;
    console.log(`\n${id} — ${a.label}: ${els.length} name match(es) in the box`);
    for (const el of els) {
      const p = at(el), tg = el.tags || {};
      const kinds = ['historic', 'memorial', 'tourism', 'amenity', 'place', 'landuse', 'building', 'leisure', 'man_made', 'office', 'military', 'railway', 'highway'].filter((k) => tg[k]).map((k) => `${k}=${tg[k]}`).join(' ');
      console.log(`  ${a.inside(p) ? 'IN ' : 'out'} ${el.type}/${el.id} v${el.version}  ${p.map((v) => v.toFixed(5)).join(',')}  "${tg.name ?? ''}" en="${tg['name:en'] ?? ''}" bn="${tg['name:bn'] ?? ''}"${tg.alt_name ? ` alt="${tg.alt_name}"` : ''}  ${kinds}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  process.exit(0);
}

// A chosen element is read from the OSM API itself, by type and id: its current
// version, and for a way the centre of its bounding box (what Overpass calls its
// centre).
async function element(type, id) {
  const url = `https://api.openstreetmap.org/api/0.6/${type}/${id}${type === 'node' ? '' : '/full'}.json`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const els = (await res.json()).elements;
  const el = els.find((e) => e.type === type && String(e.id) === String(id));
  if (type === 'way') {
    const nodes = els.filter((e) => e.type === 'node');
    const lons = nodes.map((n) => n.lon), lats = nodes.map((n) => n.lat);
    el.center = { lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2 };
  }
  return el;
}

const features = [];
for (const [id, t] of Object.entries(TARGETS)) {
  if (!t.pick) {
    console.log(`  ${id.padEnd(32)} no OSM match chosen`);
    continue;
  }
  const [type, osmId] = t.pick.split('/');
  const a = areaOf(t);
  const el = await element(type, osmId);
  if (!el) throw new Error(`${id}: ${t.pick} not found`);
  const p = at(el);
  if (!a.inside(p)) throw new Error(`${id}: ${t.pick} at ${p} lies outside ${a.label}`);
  if (!new RegExp(YA(t.name), 'i').test([el.tags.name, el.tags['name:en'], el.tags['name:bn'], el.tags.alt_name].join(' | '))) throw new Error(`${id}: ${t.pick} is named "${el.tags.name}", not /${t.name}/`);
  features.push({ type: 'Feature', properties: { target: id, osm: { type: el.type, id: el.id, version: el.version, timestamp: el.timestamp }, name: el.tags.name ?? null, nameEn: el.tags['name:en'] ?? null, nameBn: el.tags['name:bn'] ?? null, altName: el.tags.alt_name ?? null, area: a.label }, geometry: { type: 'Point', coordinates: p.map((v) => Number(v.toFixed(6))) } });
  console.log(`  ${id.padEnd(32)} ${el.type}/${el.id} v${el.version}  ${el.tags.name}`);
  await new Promise((r) => setTimeout(r, 1000));
}
const text = JSON.stringify({ type: 'FeatureCollection', properties: { licence: 'ODbL 1.0 — © OpenStreetMap contributors', fetched: new Date().toISOString().slice(0, 10) }, features }, null, 1) + '\n';
fs.writeFileSync(OUT, text);
console.log(`\n${path.relative(ROOT, OUT)}  sha256 ${sha256(text)}`);
