// Builds the bangladesh-research-institutes map («বাংলাদেশের গবেষণা প্রতিষ্ঠান», work in progress; RES-3, 2026-10-10):
//
//   node tools/build-bangladesh-research-institutes.mjs <out>   (the local preview's copy; never docs/ while in tools/wip.json)
//
// Reads only: the seed, its pinned pages' URLs (sources.json) and its points (pins.json), all in
// data-sources/bangladesh-research-institutes/; the shared district file (docs/shared/bangladesh-districts.json, for
// the tab frames — the map draws the outlines from that same file through the shell's `sharedGeometry`); and the
// approved words of global-indices' seed (the months, «সর্বশেষ যাচাই», ⓘ's headings). No network. A second build
// writes the same bytes.
//
// Four tabs, one per category (the user's decision, RES-1/RES-3), each its own records table and its own clustered
// point source, so a tab's bubbles count only its own institutes. Each institute is a disc numbered ১, ২, … in the
// tab's order (the seed's: by founding year), at its pinned point — never moved; an approximate point is a hollow
// disc and its card says so. Nearby discs merge into a navy count bubble that splits when tapped (the shell's
// `cluster`); a bubble whose members share one point lists them instead (`cluster.list`, RES-3). Each disc's frame
// is drawn small enough to set it apart from its nearest neighbour. The card ends with «সর্বশেষ যাচাই» and
// «সূত্র ↗» (a row's `link`, RES-3).
//
// A string the user has not approved yet is used here — this is the local preview — and listed at the end; the map
// cannot leave tools/wip.json while one is (tools/verify.mjs).
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const ID = 'bangladesh-research-institutes';
const out = process.argv[2];
if (!out) throw new Error(`usage: node tools/build-${ID}.mjs <out-dir>`);
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dir = path.join(ROOT, 'data-sources', ID);
const seed = read(path.join(dir, `${ID}.seed.json`));
const pages = read(path.join(dir, 'sources.json')).sources;
const points = read(path.join(dir, 'pins.json')).points;
const shared = read(path.join(ROOT, 'docs', 'shared', 'bangladesh-districts.json'));
const gi = read(path.join(ROOT, 'data-sources', 'global-indices', 'global-indices.seed.json')).words;
// COD-AB's dataset page, from its pinned download (tools/sources.json, codAbBangladesh).
const CODAB_PAGE = read(path.join(HERE, 'sources.json')).codAbBangladesh.url.replace(/\/resource\/.*$/, '');
const S = seed.strings;

// Every string shown: the seed's, approved or (this preview only) awaiting the user — listed.
const pending = new Set();
const t = (x) => {
  if (!x || typeof x.bn !== 'string') throw new Error(`not a string: ${JSON.stringify(x)}`);
  if (x.approved !== true) pending.add(x.bn);
  return x.bn;
};
const DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (v) => String(v).replace(/[0-9]/g, (d) => DIGITS[d]);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const MONTHS = gi.months.map(t);
const dateBn = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${bn(dd)} ${MONTHS[m - 1]} ${bn(y)}`; };
const round = (v) => Math.round(v * 1e5) / 1e5;

// ---- the tabs and their institutes ---------------------------------------------------------------------------------
const TABS = ['agri', 'sci', 'health', 'socio'];
const km = (a, b) => { const r = Math.PI / 180; const dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r; return 12742 * Math.asin(Math.sqrt(Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2)); };
// A disc's frame: wide enough to show its district's surroundings, narrow enough that its nearest neighbour in the
// tab sits clear of it (about a tenth of the frame away, so well past the cluster radius at the zoom it settles at).
const FRAME_MAX = 0.12, FRAME_MIN = 0.0025;
const frameOf = (p, others) => {
  const near = Math.min(...others.filter((o) => o !== p).map((o) => km(p, o)).filter((d) => d > 0.005), Infinity);
  const deg = near === Infinity ? FRAME_MAX : Math.min(FRAME_MAX, Math.max(FRAME_MIN, (near / 111.32) * 2.2));
  return [p.lon - deg, p.lat - deg * 0.9, p.lon + deg, p.lat + deg * 0.9].map(round);
};
const L = S.labels;
const tables = {};
const tabFrames = {};
for (const tab of TABS) {
  const keys = seed.tabs[tab];
  const pts = keys.map((k) => points[k]);
  const rows = {};
  keys.forEach((key, i) => {
    const x = seed.institutes[key];
    const p = points[key];
    const num = bn(i + 1);
    const yearBn = x.founded.predecessor ? fill(t(S.templates.predecessor), { year: bn(x.founded.year), place: t(S.places[x.founded.predecessor.place]) }) : bn(x.founded.year);
    const area = x.address.area ? t(x.address.area) : null;
    const page = pages[x.sourcePage];
    if (!page || !/^https:\/\//.test(page.url)) throw new Error(`${key}: no https «সূত্র» page`);
    // A page read through a site's own JSON (icddr,b's script-rendered site) is linked at the site itself.
    const url = /\/api\//.test(page.url) ? new URL(page.url).origin + '/' : page.url;
    rows[key] = {
      numBn: num,
      labelBn: `${num}. ${t(x.name)} (${x.abbr})`,
      ...(p.kind === 'approximate' ? { approxBn: t(L.approximate) } : {}),
      foundedBn: yearBn,
      ...(x.currentForm?.year ? { currentBn: fill(t(L.currentForm), { year: bn(x.currentForm.year) }) } : {}),
      locationBn: area ? `${area}, ${t(x.address.district)}` : t(x.address.district),
      ...(x.parent ? { parentBn: t(S.parents[x.parent]) } : {}),
      focusBn: t(x.focus),
      verifiedBn: dateBn(x.verified),
      sourceUrl: encodeURI(decodeURI(url)),
      approx: p.kind === 'approximate',
      at: [p.lon, p.lat],
      frame: frameOf(p, pts),
    };
  });
  tables[tab] = rows;
  const xs = pts.map((p) => p.lon), ys = pts.map((p) => p.lat);
  const pad = 0.25;
  tabFrames[tab] = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad].map(round);
}
const tabs = Object.fromEntries(TABS.map((tab) => [tab, { titleBn: t(S.tabs[tab]), placeholderBn: t(L.picker), frame: tabFrames[tab] }]));
const districts = Object.fromEntries(shared.districts.map((d) => d.pcode).sort().map((p) => [p, {}]));

// ---- ⓘ: the sources, grouped, and the map data's credits ------------------------------------------------------------
const link = (url, text) => {
  if (!/^https:\/\//.test(url)) throw new Error(`credit ${text}: not an https link (${url})`);
  return `<a href="${encodeURI(decodeURI(url))}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, '');
const order = TABS.flatMap((tab) => seed.tabs[tab]);
const ownSite = (key) => { const u = pages[seed.institutes[key].sourcePage].url; return new URL(u).origin + '/'; };
const cited = new Set();
for (const x of Object.values(seed.institutes)) for (const c of [x.name.cite, x.address.cite, x.founded.cite, x.currentForm?.cite ?? [], [x.focus.page], x.address.area?.cite ?? [], ...x.events.map((e) => e.cite)].flat()) cited.add(c.source);
for (const v of Object.values(S.parents)) for (const c of v.cite) cited.add(c.source);
const ownHosts = new Set(order.map((k) => hostOf(ownSite(k))));
const GOV = /\.gov\.bd$/;
const govHosts = [...new Set([...cited].map((id) => pages[id].url).filter((u) => /^https:/.test(u)).map(hostOf).filter((h) => GOV.test(h) && !ownHosts.has(h)))].sort();
const wiki = Object.values(S.places).filter((v) => v.tier === 'secondary').map((v) => pages[v.cite[0].source]);
const CODAB = `Bangladesh administrative boundaries (COD-AB v03): Bangladesh Bureau of Statistics / OCHA, ${link(CODAB_PAGE, 'CC BY-IGO 3.0')} — the district outlines and the approximate points (district capitals)`;
const OSM = `© ${link('https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors')} (ODbL) — the points of ${Object.entries(points).filter(([, p]) => p.kind === 'osm').map(([k]) => seed.institutes[k].abbr).join(', ')}, from Geofabrik's extract of 1 October 2026`;
const extra = [
  `The institutes' own websites: ${order.map((k) => link(ownSite(k), seed.institutes[k].abbr)).join(', ')}`,
  `Ministries, divisions and directorates: ${govHosts.map((h) => link(`https://${h}/`, h)).join(', ')}`,
  'Acts and ordinances: Laws of Bangladesh, bdlaws.minlaw.gov.bd (Legislative and Parliamentary Affairs Division)',
  ...wiki.map((w) => link(w.permalink, `Bengali Wikipedia, revision ${w.revid}`)),
  CODAB,
  OSM,
];

// ---- the descriptor ------------------------------------------------------------------------------------------------
const go = [{ action: 'select' }, { action: 'fitBounds', field: 'frame', clear: ['sheet'], duration: 900 }];
const pick = (tab) => ({ from: tab, label: { field: 'labelBn' }, placeholder: t(L.picker), do: go });
const fields = {
  numBn: { type: 'text', required: true, display: false }, labelBn: { type: 'text', required: true }, approxBn: { type: 'text' },
  foundedBn: { type: 'text', required: true }, currentBn: { type: 'text' }, locationBn: { type: 'text', required: true }, parentBn: { type: 'text' },
  focusBn: { type: 'text', required: true }, verifiedBn: { type: 'text', required: true }, sourceUrl: { type: 'text', required: true, display: false },
  approx: { type: 'boolean', display: false }, at: { type: 'point', required: true }, frame: { type: 'bbox', required: true },
};
const sourceOf = (tab) => `${tab}Points`;
const sheet = {
  title: { field: 'labelBn' },
  subtitle: { field: 'approxBn' },
  rows: [
    { label: t(L.founded), field: 'foundedBn' },
    { field: 'currentBn' },
    { label: t(L.location), field: 'locationBn' },
    { label: t(L.parent), field: 'parentBn' },
    { label: t(L.focus), field: 'focusBn', stacked: true },
    { label: t(gi.verified), field: 'verifiedBn', link: { field: 'sourceUrl', text: t(gi.source) } },
  ],
};
const ORANGE = '#D55E00';
const layersOf = (tab) => {
  const src = sourceOf(tab);
  const disc = ['!', ['has', 'point_count']];
  return [
    { id: `${tab}-clusters`, type: 'circle', source: src, slot: 'aboveLabels', style: 'cluster-circle', filter: ['has', 'point_count'] },
    { id: `${tab}-cluster-count`, type: 'symbol', source: src, slot: 'aboveLabels', style: 'cluster-count', filter: ['has', 'point_count'], layout: { 'text-field': ['number-format', ['get', 'point_count'], { locale: 'bn' }] } },
    // The ethnic map's disc: 28 px across, its number at 14 px; an approximate point hollow (white, an orange ring and
    // an orange number). The chosen disc's ring dark and 3 px, drawn above the others.
    { id: `${tab}-points`, type: 'circle', source: src, slot: 'aboveLabels', filter: disc, layout: { 'circle-sort-key': ['case', ['get', 'selected'], 1, 0] }, paint: { 'circle-radius': 12, 'circle-color': ['case', ['get', 'approx'], '#ffffff', ORANGE], 'circle-stroke-width': ['case', ['get', 'selected'], 3, ['get', 'approx'], 2.5, 2], 'circle-stroke-color': ['case', ['get', 'selected'], '#111827', ['get', 'approx'], ORANGE, '#ffffff'] } },
    { id: `${tab}-numbers`, type: 'symbol', source: src, slot: 'aboveLabels', filter: disc, layout: { 'text-field': ['get', 'numBn'], 'text-font': ['Noto Sans Bengali'], 'text-size': 14, 'text-allow-overlap': true, 'text-ignore-placement': true, 'symbol-sort-key': ['case', ['get', 'selected'], 1, 0] }, paint: { 'text-color': ['case', ['get', 'approx'], ORANGE, '#ffffff'] } },
  ];
};
const descriptor = {
  schema: 'geoquest/map-descriptor@1',
  id: ID,
  section: 'bangladesh',
  title: { bn: t(S.title), en: 'Research Institutes of Bangladesh' },
  basemap: 'bangladesh-wide',
  view: { fitBounds: tabFrames.agri },
  constraints: { maxZoom: 17, maxBounds: [86, 19, 95, 28] },
  minTextSize: 14,
  frameClearsControls: true,
  sheetMaxHeight: 0.5,
  styles: {
    'cluster-circle': { paint: { 'circle-radius': 16, 'circle-color': '#0b3d91', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' } },
    'cluster-count': { layout: { 'text-font': ['Noto Sans Bengali'], 'text-size': 14, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#ffffff' } },
  },
  records: {
    tabs: { file: './tabs.json', fields: { titleBn: { type: 'text', required: true }, placeholderBn: { type: 'text', required: true }, frame: { type: 'bbox', required: true } } },
    districts: { file: './districts.json', fields: {} },
    ...Object.fromEntries(TABS.map((tab) => [tab, { file: `./${tab}.json`, fields }])),
  },
  sources: {
    districtLines: { records: 'districts', sharedGeometry: 'bangladesh-districts.json', joinField: 'pcode', attribution: CODAB },
    ...Object.fromEntries(TABS.map((tab) => [sourceOf(tab), {
      records: tab, geometryFrom: 'at', state: ['selected'], properties: ['numBn', 'approx'], selectionMarker: true, tapWidth: 44,
      cluster: { radius: 22, maxZoom: 15, list: { label: 'labelBn' } },
      attribution: OSM,
    }])),
  },
  layers: [
    { id: 'district-lines', type: 'line', source: 'districtLines', slot: 'belowLabels', layout: { 'line-join': 'round' }, paint: { 'line-color': '#64748b', 'line-width': 0.8, 'line-opacity': 0.8 } },
    ...TABS.flatMap(layersOf),
  ],
  controls: [{ type: 'picker', ...pick('agri'), byTab: Object.fromEntries(TABS.map((tab) => [tab, pick(tab)])) }],
  interactions: TABS.map((tab) => ({ on: 'click', target: `source:${sourceOf(tab)}`, do: go })),
  tabs: {
    from: 'tabs', label: { field: 'titleBn' }, placeholder: { field: 'placeholderBn' }, frame: { field: 'frame' },
    views: Object.fromEntries(TABS.map((tab) => [tab, { hide: { sources: TABS.filter((o) => o !== tab).map(sourceOf) } }])),
  },
  info: { file: './info.json', headings: { sources: t(gi.infoSources), notes: t(gi.infoNotes), conflicts: '' } },
  attribution: { extra },
  sheets: Object.fromEntries(TABS.map((tab) => [tab, sheet])),
};

const files = {
  'descriptor.json': descriptor,
  'tabs.json': tabs,
  'districts.json': districts,
  ...Object.fromEntries(TABS.map((tab) => [`${tab}.json`, tables[tab]])),
  'info.json': { lines: [] },
};
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f), { recursive: true });
for (const [name, v] of Object.entries(files)) fs.writeFileSync(path.join(out, name), JSON.stringify(v, null, 1) + '\n');
console.log(`${TABS.map((tab) => `${tab} ${Object.keys(tables[tab]).length}`).join(', ')} institutes; ${Object.values(points).filter((p) => p.kind === 'approximate').length} approximate (hollow); ${extra.length} credit lines`);
if (pending.size) console.log(`${pending.size} strings shown here await the user's approval:\n  ${[...pending].join('\n  ')}`);
