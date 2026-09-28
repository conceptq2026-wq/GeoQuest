// liberation-war-1971, «মুক্তিযুদ্ধ ১৯৭১»: the map's records, tabs, geometry and
// marker pictures, from the editor's seed — read, never written.
//
//   node tools/build-liberation-war-1971.mjs
//
// One records table, `items`, each record carrying its tab: the eleven
// sectors, the three forces, the sixteen places and events, the seven Bir
// Sreshtho. A card's values are composed here from the seed's fields and its
// own joining words (`ui.composeBn`), so no Bengali is written in this file.
// Points come from the seed ({lon, lat}), the pinned OpenStreetMap extract
// ({osm}) or COD-AB's own district centre ({codab, centroid}). The sector
// outlines are data-sources/liberation-war-1971/sectors.geojson, from
// tools/build-liberation-sectors.mjs. The descriptor is written by hand.
// Byte-deterministic: the same inputs give the same files. No network.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, zipEntry } from './lib/geo.mjs';
import { scanGeoref } from './lib/scan-georef.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where the seed and the traced sectors are, and where the map goes. Change here if they move.
const DATA = path.join(ROOT, 'data-sources/liberation-war-1971');
const SEED = path.join(DATA, 'liberation-war-1971.seed.json');
const DIR = path.join(ROOT, 'docs/maps/liberation-war-1971');
const SOURCES = path.join(HERE, 'sources.json');

// The last term of every sector's last commander: the bn Wikipedia table's
// «৬ই এপ্ৰিল, ১৯৭২», after the war. The approved draft shows such a term as
// «(… থেকে)», and so does the card.
const AFTER_THE_WAR = '1972-04-06';
// A frame is its features' box, widened by this share of its size each way,
// and never narrower than MIN_SPAN degrees of longitude (latitude in proportion).
const FRAME_MARGIN = 0.08;
const MIN_SPAN = 0.3;
// The traced sectors, pinned: tools/build-liberation-sectors.mjs writes them from
// sector-trace.json, and a change moves this pin — stop and report it, never re-pin to pass.
const SECTORS_SHA256 = 'cd4dbb826356695280a0cef6964e94e4f6b01d123617d5d4c39bb083e729915d';
// The tabs, in the seed's order, and the key each record carries.
const TABS = ['sectors', 'forces', 'places', 'birSreshtho'];

const fail = (msg) => {
  throw new Error(msg);
};
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
const pinned = (entry, file) => {
  const buf = fs.readFileSync(file);
  if ((entry.size !== undefined && buf.length !== entry.size) || sha256(buf) !== entry.sha256) fail(`${path.relative(ROOT, file)} does not match its pin in tools/sources.json`);
  return buf;
};
const osm = JSON.parse(pinned(sources.osmLiberationPoints, path.join(ROOT, sources.osmLiberationPoints.file)).toString('utf8'));
const districts = zipEntry(pinned(sources.codAbBangladesh, path.join(CACHE, sources.codAbBangladesh.file)), 'bgd_admin2.geojson').features;
const sectorsBuf = fs.readFileSync(path.join(DATA, 'sectors.geojson'));
if (sha256(sectorsBuf) !== SECTORS_SHA256) fail(`data-sources/liberation-war-1971/sectors.geojson has moved from its pin: ${SECTORS_SHA256.slice(0, 16)} → ${sha256(sectorsBuf).slice(0, 16)}`);
const sectorsFc = JSON.parse(sectorsBuf.toString('utf8'));
const trace = JSON.parse(fs.readFileSync(path.join(DATA, 'sector-trace.json'), 'utf8'));

// ---- pending: every null in the seed, printed at every build --------------------------
const pending = [];
const walk = (v, p) => {
  if (v === null) pending.push(p);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
  else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!['sources', 'review', 'refs'].includes(k)) walk(x, p ? `${p}.${k}` : k);
};
walk({ ui: seed.ui, sectors: seed.sectors, forces: seed.forces, places: seed.places, birSreshtho: seed.birSreshtho }, '');
console.log(`pending: ${pending.length}${pending.length ? `\n  ${pending.join('\n  ')}` : ''}`);

// ---- words ----------------------------------------------------------------------------
const W = seed.ui.composeBn;
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (v) => String(v).replace(/\d/g, (d) => BN_DIGITS[d]);
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => (k in values ? values[k] : fail(`composeBn template «${template}» wants {${k}}`)));
const grouped = (n) => bn(n.toLocaleString('en-US'));
/** An ISO date (yyyy-mm-dd or yyyy-mm) in the card's words; `year` false drops the year. */
function date(iso, year = true) {
  const [y, m, d] = iso.split('-');
  const month = W.months[Number(m) - 1] ?? fail(`no month in ${iso}`);
  return [d ? bn(Number(d)) : null, month, year ? bn(y) : null].filter(Boolean).join(' ');
}
/** A commander's term: «d m–d m yyyy» within one year, «… থেকে» for one that ran past the war. */
function term(from, to) {
  if (!from) return null;
  if (!to || to === AFTER_THE_WAR) return fill(W.since, { date: date(from) });
  return from.slice(0, 4) === to.slice(0, 4) ? `${date(from, false)}–${date(to)}` : `${date(from)}–${date(to)}`;
}
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${W.and} ${items.at(-1)}`);
if (!W.and) fail('composeBn has no «and»');

// ---- points ---------------------------------------------------------------------------
const r5 = (v) => Number(v.toFixed(5));
function point(p, where) {
  if (!p) fail(`${where}: no point`);
  if ('lon' in p) return [r5(p.lon), r5(p.lat)];
  if ('osm' in p) {
    const f = osm.features.find((x) => x.properties.target === p.osm);
    if (!f) fail(`${where}: OpenStreetMap target ${p.osm} is not in the extract`);
    return f.geometry.coordinates.map(r5);
  }
  if ('codab' in p) {
    const f = districts.find((x) => x.properties.adm2_name === p.codab.adm2);
    if (!f) fail(`${where}: no COD-AB district ${p.codab.adm2}`);
    return [r5(f.properties.center_lon), r5(f.properties.center_lat)];
  }
  fail(`${where}: a point of no known kind`);
}
// mapshaper writes a one-part sector as a Polygon, a sector of several as a MultiPolygon.
const polygons = (g) => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]);
const coordsOf = (g) => polygons(g).flat(2);
function frame(coords) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) [w, s, e, n] = [Math.min(w, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)];
  const dx = (e - w) * FRAME_MARGIN;
  const dy = (n - s) * FRAME_MARGIN;
  [w, s, e, n] = [w - dx, s - dy, e + dx, n + dy];
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const half = Math.max(e - w, MIN_SPAN) / 2;
  const halfY = Math.max(n - s, MIN_SPAN * Math.cos((cy * Math.PI) / 180)) / 2;
  return [r5(cx - half), r5(cy - halfY), r5(cx + half), r5(cy + halfY)];
}
const inRing = (p, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inArea = (p, g) => polygons(g).some((poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h)));

// ---- the records -----------------------------------------------------------------------
const items = {};
const places = []; // [key, [lon, lat]] — a place's points, one feature each
const ports = [];
const areas = [];

// Sectors, 1 to 11. A sector's number stands where the book prints it, carried
// through the trace's georeference; its area is the traced outline.
const { toLonLat } = scanGeoref(trace.controlPoints);
const outline = Object.fromEntries(sectorsFc.features.map((f) => [f.properties.sector, f]));
for (const [n, s] of Object.entries(seed.sectors)) {
  const key = `sector-${n}`;
  const rec = { tab: 'sectors', nameBn: fill(W.sector, { n: bn(n) }), nameEn: `Sector ${n}`, numberBn: bn(n) };
  if ('areaBn' in s) rec.areaBn = s.areaBn;
  if ('hqBn' in s) rec.hqBn = s.hqBn;
  const commanders = (s.commanders ?? []).map((c) => (term(c.from, c.to) ? `${c.nameBn} (${term(c.from, c.to)})` : c.nameBn));
  rec.commandersBn = commanders.length ? commanders.join(`, ${W.then} `) : (s.commandersNoteBn ?? fail(`sector ${n}: no commander and no word on why`));
  const special = (s.special ?? []).map((item) => {
    if (typeof item.value === 'string') return item.value;
    const number = fill(W[item.key] ?? fail(`sector ${n}: composeBn has no «${item.key}»`), { n: item.key === 'subSectors' ? bn(item.value) : grouped(item.value) });
    return item.approx ? fill(W.about, { n: number }) : number;
  });
  if (special.length) rec.specialBn = special.join('; ');
  if (s.noteBn) rec.noteBn = s.noteBn;
  const hq = (s.hqPoints ?? []).filter((h) => h.point);
  if (hq.length > 1) fail(`sector ${n}: ${hq.length} HQ points; the map draws one per sector`);
  if (hq.length) rec.hqAt = point(hq[0].point, `sector ${n} HQ`);
  const coords = [];
  if (outline[n]) {
    const at = toLonLat(trace.labels[n]).map(r5);
    if (!inArea(at, outline[n].geometry)) fail(`sector ${n}: its number, where the book prints it (${at}), lies outside its traced area`);
    rec.labelAt = at;
    rec.hasArea = true;
    coords.push(...coordsOf(outline[n].geometry));
    areas.push({ type: 'Feature', properties: { id: key }, geometry: outline[n].geometry });
  } else if ('areaBn' in s) fail(`sector ${n} has an area in words but no outline`);
  if (s.ports?.length) rec.hasPorts = true;
  for (const p of s.ports ?? []) {
    const at = point(p.point, `sector ${n} port ${p.labelBn}`);
    ports.push([key, at]);
    coords.push(at);
  }
  if (rec.hqAt) coords.push(rec.hqAt);
  // Selecting a sector fades the others — their areas, flags and ports: a relation the shell's state reads.
  rec.siblings = Object.keys(seed.sectors).filter((m) => m !== n).map((m) => `sector-${m}`);
  if (coords.length) rec.frame = frame(coords);
  items[key] = rec;
}

// The forces: cards only.
for (const [k, f] of Object.entries(seed.forces)) {
  const formed = f.formed ? [date(f.formed)] : [];
  const fought = f.areas.map((a) => ('sector' in a ? fill(W.sector, { n: bn(a.sector) }) : `${a.periodBn}: ${list(a.placesBn)}`));
  items[`force-${k}`] = {
    tab: 'forces',
    nameBn: f.nameBn,
    nameEn: `${k.toUpperCase()} Force`,
    commanderBn: f.commanderBn,
    formedUnitsBn: [...formed, f.unitsBn.join(', ')].join('; '),
    foughtBn: fought.join('; '),
    battlesBn: f.battlesBn.join(', '),
  };
}

// Places and events: red dots, one per point.
for (const [k, p] of Object.entries(seed.places).sort(([, a], [, b]) => a.order - b.order)) {
  const rec = { tab: 'places', nameBn: p.nameBn, nameEn: p.nameEn };
  if (p.dateTextBn) rec.dateTextBn = p.dateTextBn;
  if (p.placeBn) rec.placeBn = p.placeBn;
  if (p.statementBn) rec.statementBn = `${p.statementBn} (${p.statementCiteBn})`;
  const at = p.points.map((x, i) => point(x.point, `${k} point ${i + 1}`));
  for (const a of at) places.push([k, a]);
  rec.frame = frame(at);
  items[k] = rec;
}

// The Bir Sreshtho: gold stars at their graves.
for (const [k, b] of Object.entries(seed.birSreshtho).sort(([, x], [, y]) => x.order - y.order)) {
  const rec = { tab: 'birSreshtho', nameBn: b.nameBn, rankServiceBn: `${b.rankBn}, ${b.serviceBn}` };
  if (b.sectors) {
    const fromEnglishInfobox = (b.sources.sectors ?? []).every((s) => s.ref.startsWith('wen-'));
    rec.sectorBn = b.sectors.map((n) => fill(W.sector, { n: bn(n) })).join(`, ${W.then} `) + (b.subSectorBn ? ` (${fill(W.subSector, { name: b.subSectorBn })})` : '') + (fromEnglishInfobox ? ` (${W.enWikipedia})` : '');
  }
  rec.martyrdomBn = `${b.martyrdomPlaceBn}, ${date(b.martyrdomDate)}`;
  let burial = b.burialBn;
  if (b.reburial) burial += `; ${fill(W.reburied, { date: date(b.reburial) })}${b.firstBurialBn ? ` (${fill(W.firstBuried, { place: b.firstBurialBn })})` : ''}`;
  if (b.graveBn) burial = `${W.ministry}: ${b.burialBn}; ${W.wikipedia}: ${b.graveBn}, ${b.memorialBn}`;
  rec.burialBn = burial;
  rec.burialAt = point(b.point, `${k} burial`);
  rec.frame = frame([rec.burialAt]);
  items[k] = rec;
}

// ---- the tabs --------------------------------------------------------------------------
const tabs = {};
for (const t of TABS) {
  tabs[t] = { titleBn: seed.ui.tabsBn[t] ?? fail(`no tab word for ${t}`), placeholderBn: seed.ui.pickerPlaceholderBn[t] ?? fail(`no picker prompt for ${t}`) };
  if (t === 'sectors') tabs[t].noteBn = seed.ui.sectorNoteBn;
}
const byTab = Object.groupBy(Object.values(items), (r) => r.tab);
for (const t of TABS) if (!byTab[t]?.length) fail(`tab ${t} has no records`);
// The tabs' order is the records' order within the table, so the picker lists each tab in the seed's order.
const ordered = Object.fromEntries(TABS.flatMap((t) => Object.entries(items).filter(([, r]) => r.tab === t)));

// ---- the marker pictures ---------------------------------------------------------------
// Drawn here, at twice their size on the map (pixelRatio 2 in the descriptor).
const star = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.6 : 10.8;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12.8 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
})();
const PICTURES = {
  // A flag on its pole, the pole's foot at the bottom-left corner — the HQ's point.
  'flag.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 22 28"><path d="M2.2 27V2.2" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round"/><path d="M2.2 27V2.2" stroke="#3b3027" stroke-width="1.6" stroke-linecap="round"/><rect x="3" y="2.6" width="17.4" height="11.4" rx="1" fill="#006a4e" stroke="#ffffff" stroke-width="1.2"/><circle cx="10.6" cy="8.3" r="3.4" fill="#f42a41"/></svg>\n`,
  // An anchor on a white disc.
  'anchor.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.8" fill="#ffffff" stroke="#1d3557" stroke-width="1.4"/><g fill="none" stroke="#1d3557" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6.2" r="1.7"/><path d="M12 7.9V18.6M8.4 10.4H15.6M6.4 13.6C6.8 16.9 9.2 18.6 12 18.6C14.8 18.6 17.2 16.9 17.6 13.6M5.4 14.8L6.4 13.4L7.8 14.3M18.6 14.8L17.6 13.4L16.2 14.3"/></g></svg>\n`,
  // A gold star.
  'star.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><polygon points="${star}" fill="#e3a90f" stroke="#6b4e00" stroke-width="1.2" stroke-linejoin="round"/></svg>\n`,
};

// ---- write -----------------------------------------------------------------------------
const fc = (properties, features) => ({ type: 'FeatureCollection', ...(properties ? { properties } : {}), features });
const pointsFc = (list) => fc(null, list.map(([id, at]) => ({ type: 'Feature', properties: { id }, geometry: { type: 'Point', coordinates: at } })));
const files = {
  'records.json': JSON.stringify(ordered, null, 2) + '\n',
  'tabs.json': JSON.stringify(tabs, null, 2) + '\n',
  'sectors.geojson': JSON.stringify(fc({ source: sectorsFc.properties.about, licence: sectorsFc.properties.licence }, areas)) + '\n',
  'ports.geojson': JSON.stringify(pointsFc(ports)) + '\n',
  'places.geojson': JSON.stringify(pointsFc(places)) + '\n',
  ...PICTURES,
};
fs.mkdirSync(DIR, { recursive: true });
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(DIR, name), text);

const counts = Object.fromEntries(TABS.map((t) => [t, byTab[t].length]));
console.log(`liberation-war-1971: ${Object.keys(ordered).length} records (${Object.entries(counts).map(([t, c]) => `${t} ${c}`).join(', ')}); ${areas.length} sector areas, ${Object.values(items).filter((r) => r.hqAt).length} HQ flags, ${ports.length} ports, ${places.length} place dots, ${Object.values(items).filter((r) => r.burialAt).length} graves`);
for (const name of Object.keys(files)) console.log(`  ${name.padEnd(16)} ${String(fs.statSync(path.join(DIR, name)).size).padStart(7)} bytes  sha256 ${sha256(fs.readFileSync(path.join(DIR, name))).slice(0, 16)}`);
