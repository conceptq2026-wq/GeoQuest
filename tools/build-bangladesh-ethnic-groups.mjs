// Builds the bangladesh-ethnic-groups map (work in progress, ETH-3, 2026-10-08) from its seed:
//
//   node tools/build-bangladesh-ethnic-groups.mjs <out>
//
// While the map is in tools/wip.json, tools/preview.mjs runs this into its own copy of docs/; the build also
// writes docs/maps/bangladesh-ethnic-groups/, which tools/verify-descriptor.mjs holds to a fresh build in a
// temporary folder, byte for byte. <out> is required.
//
// It reads data-sources/bangladesh-ethnic-groups/bangladesh-ethnic-groups.seed.json, the shared district file
// docs/shared/bangladesh-districts.json (for the frames and the districts' Bengali names; the map draws the
// districts from that same file through the shell's `sharedGeometry`, so nothing of it is copied), and the
// district capitals of the pinned COD-AB zip (tools/sources.json, codAbBangladesh) for the institutes no source
// places. No network. A second build writes the same bytes.
//
// Three view tabs (the user's decision, 2026-10-08): «পাহাড়ি» and «সমতল» each pick one of their groups — the hill
// rule's split, 6 and 13 — and colour the districts that are its main settlement (the seed's rule, 80 % + 1,000);
// «প্রতিষ্ঠান» shows the ten institutes of the Ministry of Cultural Affairs as discs numbered ১–১০ in the ministry's
// order. Every Bengali word is the seed's; the numbers are written in Bengali digits, grouped as Bengali text groups
// them (৪,৮৩,৩৬৫).
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, zipEntry } from './lib/geo.mjs';

const ID = 'bangladesh-ethnic-groups';
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const out = process.argv[2];
if (!out) throw new Error(`usage: node tools/build-${ID}.mjs <out>, e.g. docs/maps/${ID}`);
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-sources', ID, `${ID}.seed.json`), 'utf8'));
const shared = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/shared/bangladesh-districts.json'), 'utf8'));
const S = seed.strings;

// ---- numbers as Bengali text.
const DIGITS = '০১২৩৪৫৬৭৮৯';
const bnDigits = (s) => String(s).replace(/\d/g, (d) => DIGITS[d]);
const bnCount = (n) => {
  const s = String(n);
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ',');
  return bnDigits(head ? `${head},${s.slice(-3)}` : s);
};
const bnShare = (x) => bnDigits(Number.isInteger(x) ? x : x.toFixed(1));

// ---- districts: frames from the shared file's own arcs.
const arcs = shared.arcs.map((arc) => {
  const pts = [];
  for (let k = 0, x = 0, y = 0; k < arc.length; k += 2) { x += arc[k]; y += arc[k + 1]; pts.push([x * shared.quantum, y * shared.quantum]); }
  return pts;
});
const round = (v) => Math.round(v * 1e4) / 1e4;
const boxOf = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))].map(round);
const union = (boxes) => [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
const district = new Map(shared.districts.map((d) => [d.pcode, { ...d, frame: boxOf(d.rings.flat().flatMap((r) => arcs[r < 0 ? ~r : r])) }]));
if (district.size !== 64) throw new Error(`${district.size} districts in the shared file, not 64`);

// ---- the groups, in the seed's order (the census's, largest first), split by the hill rule into the «পাহাড়ি» and
// «সমতল» tabs' tables (the user's decision, 2026-10-08): no group changes side.
const SHARE_SHOWN = 1; // the share line shows from 1 % in the three hill districts
const groupRow = (g) => {
  const ds = g.districts.map((d) => { if (!district.has(d.pcode)) throw new Error(`${g.id}: no district ${d.pcode}`); return d; });
  return {
    nameBn: g.name.bn,
    populationBn: S.templates.population.bn.replace('{n}', bnCount(g.population.value)),
    ...(g.zone.chtShare >= SHARE_SHOWN ? { shareBn: S.templates.zoneShare.bn.replace('{share}', bnShare(g.zone.chtShare)) } : {}),
    districtsBn: ds.map((d) => `${district.get(d.pcode).bn} (${bnCount(d.count)})`).join(', '),
    ...(g.language ? { language: g.language.bn } : {}),
    ...(g.religion ? { religion: g.religion.bn } : {}),
    ...(g.festivals ? { festivals: g.festivals.bn } : {}),
    frame: union(ds.map((d) => district.get(d.pcode).frame)),
    districts: ds.map((d) => d.pcode),
  };
};
const hill = Object.fromEntries(seed.groups.filter((g) => g.zone.value === 'hill').map((g) => [g.id, groupRow(g)]));
const plains = Object.fromEntries(seed.groups.filter((g) => g.zone.value === 'plains').map((g) => [g.id, groupRow(g)]));
if (Object.keys(hill).length !== 6 || Object.keys(plains).length !== 13) throw new Error(`hill ${Object.keys(hill).length}, plains ${Object.keys(plains).length}: not 6 and 13`);

// ---- the districts: only what the fills need (each joined by pcode; a district that is some group's main
// settlement carries the legend's kind). The «জেলা» tab is gone (2026-10-08).
const main = new Set(seed.groups.flatMap((g) => g.districts.map((d) => d.pcode)));
const districts = Object.fromEntries([...district.keys()].sort().map((p) => [p, main.has(p) ? { legendKind: 'main' } : {}]));

// ---- the institutes, numbered ১–১০ in the ministry's order (seed.institutesOrder). A cited point, or the
// district's capital (COD-AB).
const capitals = zipEntry(fs.readFileSync(path.join(CACHE, 'bgd_admin_boundaries.geojson.zip')), 'bgd_admincapitals.geojson').features;
const capitalOf = (pcode) => {
  const d = district.get(pcode);
  const f = capitals.find((c) => c.properties.adm_p_lvl === 2 && c.properties.adm2_pcode === pcode) ?? capitals.find((c) => c.properties.adm_p_lvl < 2 && c.properties.name === d.en);
  if (!f) throw new Error(`no capital point for ${d.en}`);
  return f.geometry.coordinates.map((v) => Math.round(v * 1e5) / 1e5);
};
const institutes = {};
for (const i of seed.institutes) {
  const at = i.location.kind === 'district' ? capitalOf(i.district.pcode) : [i.location.lon, i.location.lat];
  const num = bnDigits(i.number);
  institutes[i.id] = {
    numBn: num,
    labelBn: `${num}. ${i.name.bn}`,
    districtBn: district.get(i.district.pcode).bn,
    ...(i.groupsNamed ? { namedBn: i.groupsNamed.names.join(', ') } : {}),
    ...(i.location.kind === 'district' ? { locationBn: S.instituteCard.locationMissing.bn } : {}),
    at,
    frame: [at[0] - 0.12, at[1] - 0.1, at[0] + 0.12, at[1] + 0.1].map(round),
    hill: seed.groups.filter((g) => g.institutes.includes(i.id) && g.zone.value === 'hill').map((g) => g.id),
    plains: seed.groups.filter((g) => g.institutes.includes(i.id) && g.zone.value === 'plains').map((g) => g.id),
  };
}
if (JSON.stringify(Object.values(institutes).map((i) => i.numBn)) !== JSON.stringify([...Array(10)].map((_, k) => bnDigits(k + 1)))) throw new Error('the institutes are not numbered ১–১০ in order');

// ---- the tabs: «পাহাড়ি» opens on the three hill districts, «সমতল» and «প্রতিষ্ঠান» on Bangladesh.
const BANGLADESH = [88.0, 20.55, 92.7, 26.65];
const HILL_DISTRICTS = union(['BD2084', 'BD2046', 'BD2003'].map((p) => district.get(p).frame));
const tabs = {
  hill: { titleBn: S.zone.hill.bn, placeholderBn: S.pickers.groups.bn, frame: HILL_DISTRICTS },
  plains: { titleBn: S.zone.plains.bn, placeholderBn: S.pickers.groups.bn, frame: BANGLADESH },
  institutes: { titleBn: S.tabs.institutes.bn, placeholderBn: S.pickers.institutes.bn, frame: BANGLADESH },
};

// ---- credits: every source a shown fact cites, as an https link; Banglapedia once, as a source only.
const link = (url, text) => {
  if (!/^https:\/\//.test(url)) throw new Error(`credit ${text}: not an https link (${url})`);
  return `<a href="${encodeURI(decodeURI(url))}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};
const used = new Set(seed.groups.flatMap((g) => ['language', 'religion', 'festivals'].flatMap((f) => (g[f] ? g[f].cite.map((c) => c.source) : []))));
for (const i of seed.institutes) for (const c of [...(i.groupsNamed?.cite ?? []), ...(i.location.cite ?? []), ...(i.district.cite ?? [])]) used.add(c.source);
// The district portals are one line (the user's decision, 2026-10-08): their own name, as every cached portal page's
// header prints it, then the districts — the seed's approved string, linked to the national portal. Each fact keeps
// its own page's URL in the seed. Every other government page is a line of its own, once.
const P = S.credits.portals;
const isPortal = (url) => P.hosts.includes(new URL(url).host);
const pages = [...new Set([...used].filter((s) => seed.sources[s]?.kind === 'gob-portal').map((s) => seed.sources[s].url))].sort();
const portalPages = pages.filter(isPortal);
if (new Set(portalPages.map((u) => new URL(u).host)).size !== P.hosts.length) throw new Error(`the portal line names ${P.hosts.length} portals; the facts cite ${new Set(portalPages.map((u) => new URL(u).host)).size}`);
const portals = pages.filter((u) => !isPortal(u) && u !== seed.sources.mocaInstitutes.url);
const extra = [
  link(seed.sources.bbsNational.url, 'Bangladesh Bureau of Statistics, Population and Housing Census 2022, National Report Volume I (Table P29)'),
  link('https://bbs.gov.bd/pages/static-pages/6922e073933eb65569e27220', 'Bangladesh Bureau of Statistics, Population and Housing Census 2022, District Reports (Table P17), and the Preliminary Report (Bangla), table স-১.৪'),
  link(seed.sources.gazette2019.url, 'Ministry of Cultural Affairs, S.R.O. No. 78-Law/2019 (Bangladesh Gazette Extraordinary, 23 March 2019): the list of groups'),
  link(seed.sources.mocaInstitutes.url, 'Ministry of Cultural Affairs: its offices and institutes'),
  link('https://bangladesh.gov.bd/', P.bn),
  ...portals.map((url) => link(url, `Government portal: ${new URL(url).host}`)),
  link('https://bn.banglapedia.org/', 'Banglapedia, Asiatic Society of Bangladesh'),
];
const CODAB = `Bangladesh administrative boundaries (COD-AB v03): Bangladesh Bureau of Statistics / OCHA, <a href="${seed.sources.codab.url}" target="_blank" rel="noopener noreferrer">CC BY-IGO 3.0</a>`;
const OSM = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

const go = [{ action: 'select' }, { action: 'fitBounds', field: 'frame', clear: ['sheet'], duration: 900 }];
const pick = (from, placeholder, label = 'nameBn') => ({ from, label: { field: label }, placeholder, do: go });
const groupFields = {
  nameBn: { type: 'text', required: true }, populationBn: { type: 'text', required: true }, shareBn: { type: 'text' }, districtsBn: { type: 'text', required: true },
  language: { type: 'text' }, religion: { type: 'text' }, festivals: { type: 'text' },
  frame: { type: 'bbox', required: true }, districts: { type: 'refs', to: 'districts', display: false },
};
// One card for both group tables; the share line sits right under the population, unlabelled, where it shows.
const groupSheet = (listField) => ({
  title: { field: 'nameBn' },
  rows: [
    { label: S.groupCard.population.bn, field: 'populationBn' },
    { field: 'shareBn' },
    { label: S.groupCard.districts.bn, field: 'districtsBn', stacked: true },
    { label: S.groupCard.language.bn, field: 'language', stacked: true },
    { label: S.groupCard.religion.bn, field: 'religion', stacked: true },
    { label: S.groupCard.festivals.bn, field: 'festivals', stacked: true },
    { label: S.groupCard.institutes.bn, referencedBy: { records: 'institutes', listField }, item: { field: 'labelBn' }, stacked: true, do: go },
  ],
});
const descriptor = {
  schema: 'geoquest/map-descriptor@1',
  id: ID,
  section: 'bangladesh',
  title: { bn: seed.title.bn, en: 'Ethnic Groups of Bangladesh' },
  basemap: 'bangladesh-wide',
  view: { fitBounds: HILL_DISTRICTS },
  constraints: { maxZoom: 11, maxBounds: [86, 19, 95, 28] },
  minTextSize: 14,
  frameClearsControls: true,
  sheetMaxHeight: 0.5,
  records: {
    tabs: { file: './tabs.json', fields: { titleBn: { type: 'text', required: true }, placeholderBn: { type: 'text', required: true }, frame: { type: 'bbox', required: true } } },
    hill: { file: './hill.json', fields: groupFields },
    plains: { file: './plains.json', fields: groupFields },
    districts: { file: './districts.json', fields: { legendKind: { type: 'text', display: false } } },
    institutes: {
      file: './institutes.json',
      fields: {
        numBn: { type: 'text', required: true, display: false }, labelBn: { type: 'text', required: true }, districtBn: { type: 'text', required: true }, namedBn: { type: 'text' }, locationBn: { type: 'text' },
        at: { type: 'point', required: true }, frame: { type: 'bbox', required: true }, hill: { type: 'refs', to: 'hill', display: false }, plains: { type: 'refs', to: 'plains', display: false },
      },
    },
  },
  sources: {
    districtFill: {
      records: 'districts', sharedGeometry: 'bangladesh-districts.json', joinField: 'pcode',
      state: [{ name: 'inHill', fromSelection: { records: 'hill', listField: 'districts' } }, { name: 'inPlains', fromSelection: { records: 'plains', listField: 'districts' } }],
      attribution: CODAB,
    },
    institutes: { records: 'institutes', geometryFrom: 'at', state: ['selected'], properties: ['numBn'], selectionMarker: true, tapWidth: 44, attribution: OSM },
  },
  layers: [
    { id: 'district-group-fill', type: 'fill', source: 'districtFill', slot: 'belowLabels', filter: ['any', ['get', 'inHill'], ['get', 'inPlains']], paint: { 'fill-color': '#0072B2', 'fill-opacity': 0.45 } },
    { id: 'district-group-line', type: 'line', source: 'districtFill', slot: 'belowLabels', filter: ['any', ['get', 'inHill'], ['get', 'inPlains']], layout: { 'line-join': 'round' }, paint: { 'line-color': '#0b3d91', 'line-width': 1.5 } },
    // A numbered disc: 28 px across (radius 12 and a 2 px white stroke; the chosen one's stroke dark and 3 px), in
    // one colour, its number in Bengali at 14 px over it. No image file; the tap target is the shell's invisible
    // 44 px disc (tapWidth). Every disc stays at its sourced point.
    { id: 'institute-markers', type: 'circle', source: 'institutes', slot: 'aboveLabels', paint: { 'circle-radius': 12, 'circle-color': '#D55E00', 'circle-stroke-width': ['case', ['get', 'selected'], 3, 2], 'circle-stroke-color': ['case', ['get', 'selected'], '#111827', '#ffffff'] } },
    { id: 'institute-numbers', type: 'symbol', source: 'institutes', slot: 'aboveLabels', layout: { 'text-field': ['get', 'numBn'], 'text-font': ['Noto Sans Bengali'], 'text-size': 14, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#ffffff' } },
  ],
  controls: [{ type: 'picker', ...pick('hill', S.pickers.groups.bn), byTab: { hill: pick('hill', S.pickers.groups.bn), plains: pick('plains', S.pickers.groups.bn), institutes: pick('institutes', S.pickers.institutes.bn, 'labelBn') } }],
  interactions: [{ on: 'click', target: 'source:institutes', do: go }],
  tabs: {
    from: 'tabs', label: { field: 'titleBn' }, placeholder: { field: 'placeholderBn' }, frame: { field: 'frame' },
    views: {
      hill: { hide: { sources: ['institutes'] } },
      plains: { hide: { sources: ['institutes'] } },
      institutes: { hide: { sources: ['districtFill'] } },
    },
  },
  legend: {
    // The legend draws a line or an image only: the institutes' discs have no row (their tab names them).
    items: [{ kind: 'main', label: S.legend.district.bn, line: { color: '#0072B2', width: 8 } }],
    kinds: [{ records: 'districts', field: 'legendKind', tab: 'hill' }, { records: 'districts', field: 'legendKind', tab: 'plains' }],
  },
  info: { file: './info.json', headings: { sources: S.infoHeadings.sources.bn, notes: S.infoHeadings.notes.bn, conflicts: '' } },
  attribution: { extra },
  sheets: {
    hill: groupSheet('hill'),
    plains: groupSheet('plains'),
    institutes: {
      title: { field: 'labelBn' },
      subtitle: { field: 'locationBn' },
      rows: [
        { label: S.instituteCard.district.bn, field: 'districtBn' },
        { label: S.instituteCard.groupsNamed.bn, field: 'namedBn', stacked: true },
      ],
    },
  },
};

const files = {
  'descriptor.json': descriptor,
  'tabs.json': tabs,
  'hill.json': hill,
  'plains.json': plains,
  'districts.json': districts,
  'institutes.json': institutes,
  'info.json': { lines: seed.info.map((l) => ({ text: l.bn, group: 'notes' })) },
};
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f), { recursive: true });
for (const [name, v] of Object.entries(files)) fs.writeFileSync(path.join(out, name), JSON.stringify(v, null, 2) + '\n');

const pending = [];
const walk = (v, where) => {
  if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${where}[${i}]`));
  if (!v || typeof v !== 'object') return;
  if (typeof v.bn === 'string' && v.approved === false) pending.push(`${where}: «${v.bn}»`);
  for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
};
walk(seed, 'seed');
console.log(`${Object.keys(hill).length} hill and ${Object.keys(plains).length} plains groups, ${Object.keys(districts).length} districts (${Object.values(districts).filter((d) => d.legendKind).length} some group's main settlement), ${Object.keys(institutes).length} institutes numbered ১–১০ (${Object.values(institutes).filter((i) => i.locationBn).length} at their district), ${extra.length} credits`);
console.log(`${pending.length} Bengali strings await approval (approved: false):\n  ${pending.join('\n  ')}`);
