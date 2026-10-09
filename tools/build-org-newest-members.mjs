// Builds the org-newest-members map («সংস্থার সর্বশেষ সদস্য», work in progress; ORGN-3, 2026-10-09):
//
//   node tools/build-org-newest-members.mjs <out>     (the local preview's copy; never docs/ while in tools/wip.json)
//
// Reads only: the seed (data-sources/org-newest-members/), its pinned pages' URLs (sources.json there), the shared
// countries file (docs/shared/world-countries.json), Natural Earth's pinned admin-0 file (Bangladesh's view: each
// country's Bengali name and label point), and approved strings of two live maps' seeds (global-indices: the months,
// «সর্বশেষ যাচাই», «সূত্র», «টীকা»; org-members: the picker's prompt and the borders note). No network.
// Writes descriptor.json, orgs.json (one record per built organisation, in the picker's order: the four groups, then
// the seed's order), countries.json (every country of the shared file), tabs.json and info.json.
// A held organisation is not built. The newest member(s) are shaded and pinned (up to three; a tiny shape gets a halo);
// one with no shape (ADB's Israel) is in the card and the list only. Bangladesh is shaded and pinned on every map.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const ID = 'org-newest-members';
const out = process.argv[2];
if (!out) throw new Error(`usage: node tools/build-${ID}.mjs <out-dir>`);
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const seed = read(path.join(ROOT, 'data-sources', ID, `${ID}.seed.json`));
const pinned = read(path.join(ROOT, 'data-sources', ID, 'sources.json')).sources;
const world = read(path.join(ROOT, 'docs', 'shared', 'world-countries.json'));
const ne = read(path.join(HERE, '.cache', 'ne_10m_admin_0_countries_bdg.geojson'));
const gi = read(path.join(ROOT, 'data-sources', 'global-indices', 'global-indices.seed.json'));
const om = read(path.join(ROOT, 'data-sources', 'org-members', 'org-members.seed.json')).strings;
const S = seed.strings;

// Every string shown must be approved.
const t = (x) => { if (!x || typeof x.bn !== 'string' || x.approved !== true) throw new Error(`not an approved string: ${JSON.stringify(x)}`); return x.bn; };
const DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (v) => String(v).replace(/[0-9]/g, (d) => DIGITS[d]);
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const MONTHS = gi.words.months.map(t);
const dateBn = (d) => { const [y, m, dd] = String(d).split('-'); return [dd ? bn(Number(dd)) : null, m ? MONTHS[Number(m) - 1] : null, bn(y)].filter(Boolean).join(' '); };
const ordinal = (n) => fill(t(S.ordinals[n] ?? S.ordinals.rest), { n: bn(n) });

// Natural Earth: each country's Bengali name and label point, keyed as the shared file keys it.
const country = new Map();
for (const f of ne.features) {
  const p = f.properties, key = p.ISO_A3 && p.ISO_A3 !== '-99' ? p.ISO_A3 : p.ADM0_A3;
  if (!country.has(key)) country.set(key, { nameBn: p.NAME_BN, nameEn: p.NAME_EN, at: [+p.LABEL_X.toFixed(3), +p.LABEL_Y.toFixed(3)] });
}
// Israel has no shape in Bangladesh's view; its Bengali name is global-indices' approved one.
// This map's own overrides first (the user, ORGN-3b: Micronesia, the State of Palestine), in text only.
const nameOf = (iso3) => (seed.countryNames?.[iso3] ? t(seed.countryNames[iso3]) : null) ?? country.get(iso3)?.nameBn ?? (gi.countryNames?.[iso3] ? t(gi.countryNames[iso3]) : null);
// The shared file's shapes: each country's main polygon, for a frame and a size (km² on the sphere, as drawn).
const q = world.quantum;
const arcs = world.arcs.map((a) => { const pts = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; pts.push([x * q, y * q]); } return pts; });
const ring = (ids) => ids.flatMap((i, k) => { const p = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return k ? p.slice(1) : p; });
const rad = Math.PI / 180, RE = 6371.0088;
const ringArea = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) { const [x1, y1] = r[i], [x2, y2] = r[i + 1]; s += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad)); } return Math.abs((s * RE * RE) / 2); };
const shapes = new Map(world.countries.map((c) => [c.iso3, c]));
const areaOf = (iso3) => { const c = shapes.get(iso3); if (!c) return 0; let a = 0; for (const poly of c.polygons) poly.forEach((r, k) => { const x = ringArea(ring(r)); a += k ? -x : x; }); return a; };
const boxOf = (iso3) => { const c = shapes.get(iso3); const pts = ring(c.polygons[c.main][0]); const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const union = (boxes) => boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
const TINY = 2000; // km², as drawn: a halo (the user, ORGN-3)

const GROUPS = ['un', 'regional', 'economic', 'other'];
const built = GROUPS.flatMap((g) => Object.entries(seed.organisations).filter(([, o]) => o.group === g && o.status === 'built'));
const cleanOutlet = (s) => String(s).replace(/\s*\(.*$/, '').replace(/:.*$/, '').trim();

const orgs = {};
for (const [id, o] of built) {
  const n = o.newest;
  const members = n.members.map((m) => ({ iso3: m.iso3, nameBn: nameOf(m.iso3) }));
  if (members.some((m) => !m.nameBn)) throw new Error(`${id}: a newest member with no Bengali name`);
  const drawn = members.filter((m) => shapes.has(m.iso3) && !n.noPin);
  const pinnedMembers = drawn.length <= 3 ? drawn : [];
  const pins = [
    ...pinnedMembers.map((m) => ({ kind: 'newest', text: m.nameBn, at: country.get(m.iso3).at, ...(areaOf(m.iso3) < TINY ? { halo: true } : {}) })),
    { kind: 'bd', text: t(S.legend.bangladesh), at: country.get('BGD').at },
  ];
  const frame = pinnedMembers.length ? union([...pinnedMembers.map((m) => boxOf(m.iso3)), boxOf('BGD')]).map((v) => +v.toFixed(3)) : [-170, -58, 180, 80];
  // The card's source: the newest member's own citation — the organisation's page, or, for a secondary-tier fact, the
  // first source that is not Wikipedia, named «সূত্র: {outlet}».
  let url, sourceLabel;
  if (n.cite) url = pinned[n.cite[0].source].url;
  else {
    const s = n.sources.find((x) => x.kind !== 'wikipedia') ?? n.sources[0];
    url = s.url;
    if (n.tier === 'secondary') sourceLabel = fill(t(S.sourceVia), { outlet: cleanOutlet(s.outlet) });
  }
  const marks = [
    ...(members.length > 1 ? [t(S.marks.tie)] : []),
    ...(n.rejoin ? [t(S.marks.rejoin)] : []),
    ...(n.suspended ? [t(S.marks.suspended)] : []),
    ...(o.withdrawals ?? []).filter((w) => w.status === 'pending').map((w) => fill(t(S.marks.withdrawalPending), { name: nameOf(w.iso3), date: dateBn(w.effective) })),
  ];
  const accession = n.accession && n.accession.date !== n.date ? fill(t(S.rows.accession), { date: dateBn(n.accession.date) }) : null;
  const ft = n.firstTime;
  orgs[id] = {
    nameBn: t(o.nameBn),
    nameEn: o.nameEn,
    group: o.group,
    groupBn: t(S.chips[o.group]),
    newest: drawn.map((m) => m.iso3),
    bd: ['BGD'],
    pins: JSON.stringify(pins),
    frame,
    countText: o.count?.n ? bn(o.count.n) : null,
    newestText: members.map((m) => m.nameBn).join(', '),
    orderText: o.order?.n && !n.rejoin && members.length === 1 ? ordinal(o.order.n) : null,
    dateText: [dateBn(n.date), accession].filter(Boolean).join('\n'),
    ...(ft ? { firstTimeText: `${ft.members.map((m) => nameOf(m.iso3)).join(', ')} — ${dateBn(ft.date)}` } : {}),
    ...(o.hqCityBn ? { hqText: t(o.hqCityBn) } : {}),
    ...(o.bangladesh?.status === 'member' ? { bdText: t(S.values.yes) } : o.bangladesh?.status === 'none' ? { bdText: t(S.values.no) } : {}),
    marks: JSON.stringify(marks),
    verified: dateBn(seed.retrieved),
    url,
    ...(sourceLabel ? { sourceLabel } : {}),
  };
}

// Every country of the shared file, so each is drawn (light grey) and can be shaded.
const countries = {};
for (const c of world.countries) countries[c.iso3] = { nameBn: nameOf(c.iso3) ?? country.get(c.iso3)?.nameEn ?? c.iso3 };

const tabs = { map: { titleBn: t(S.tabs.map) }, list: { titleBn: t(S.tabs.list) } };
const info = {
  lines: [
    ...built.map(([id]) => ({ text: `${orgs[id].nameBn}: ${orgs[id].url}`, group: 'sources' })),
    { text: t(om.info.view), group: 'notes' },
  ],
};

const descriptor = {
  schema: 'geoquest/map-descriptor@1',
  id: ID,
  section: seed.section,
  title: { bn: t(S.title), en: 'Newest Members of Organisations' },
  basemap: 'world',
  view: { fitBounds: [-170, -58, 180, 80] },
  constraints: { minZoom: -1, maxZoom: 6, wholeWorld: true },
  minTextSize: 14,
  // As global-indices: no country's name from the basemap; the pins are the map's only names; seas keep theirs.
  hideCountryLabels: true,
  // A flat 2D map: no tilt button (the user, ORGN-3b; a baseline exception, this map's alone).
  flat: true,
  openOn: { tab: 'map', records: 'orgs', key: 'un' },
  records: {
    tabs: { file: './tabs.json', fields: { titleBn: { type: 'text', required: true } } },
    orgs: {
      file: './orgs.json',
      fields: {
        nameBn: { type: 'text', required: true },
        nameEn: { type: 'text', required: true, display: false },
        group: { type: 'text', required: true, display: false },
        groupBn: { type: 'text', required: true, display: false },
        newest: { type: 'refs', to: 'countries', display: false },
        bd: { type: 'refs', to: 'countries', display: false },
        pins: { type: 'text', display: false },
        frame: { type: 'bbox', required: true },
        countText: { type: 'text', display: false },
        newestText: { type: 'text', required: true, display: false },
        orderText: { type: 'text', display: false },
        dateText: { type: 'text', required: true },
        firstTimeText: { type: 'text' },
        hqText: { type: 'text' },
        bdText: { type: 'text' },
        marks: { type: 'text', display: false },
        verified: { type: 'text', required: true, display: false },
        url: { type: 'text', required: true, display: false },
        sourceLabel: { type: 'text', display: false },
      },
    },
    countries: { file: './countries.json', fields: { nameBn: { type: 'text', required: true } } },
  },
  sources: {
    countries: {
      records: 'countries',
      sharedGeometry: 'world-countries.json',
      joinField: 'iso3',
      state: [{ name: 'newest', fromSelection: { records: 'orgs', listField: 'newest' } }, { name: 'bd', fromSelection: { records: 'orgs', listField: 'bd' } }],
      properties: ['nameBn'],
    },
  },
  layers: [
    { id: 'on-base', type: 'fill', source: 'countries', slot: 'belowLabels', paint: { 'fill-color': '#dfe4ea', 'fill-opacity': 0.9 } },
    { id: 'on-newest', type: 'fill', source: 'countries', slot: 'belowLabels', filter: ['get', 'newest'], paint: { 'fill-color': '#2563EB', 'fill-opacity': 1 } },
    { id: 'on-bd', type: 'fill', source: 'countries', slot: 'belowLabels', filter: ['get', 'bd'], paint: { 'fill-color': '#D55E00', 'fill-opacity': 1 } },
    { id: 'on-lines', type: 'line', source: 'countries', slot: 'belowLabels', layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 0.6 } },
  ],
  interactions: [],
  controls: [{ type: 'picker', from: 'orgs', label: { field: 'nameBn' }, placeholder: t(om.pickerPrompt), do: [{ action: 'select' }, { action: 'fitBounds', field: 'frame', duration: 900 }] }],
  tabs: { from: 'tabs', label: { field: 'titleBn' } },
  newest: {
    records: 'orgs',
    tabs: { map: 'map', list: 'list' },
    groups: GROUPS,
    words: {
      count: t(S.stats.count), newest: t(S.stats.newest), order: t(S.stats.order),
      legendNewest: t(S.legend.newest), legendBangladesh: t(S.legend.bangladesh),
      search: t(S.list.search), total: t(S.list.total),
      chips: Object.fromEntries(['all', ...GROUPS].map((g) => [g, t(S.chips[g])])),
      verified: t(gi.words.verified), source: t(gi.words.source),
    },
  },
  info: { file: './info.json', headings: { sources: t(gi.words.infoSources), notes: t(gi.words.infoNotes), conflicts: '' } },
  sheets: {
    orgs: {
      title: { field: 'nameBn' },
      subtitle: { field: 'nameEn' },
      rows: [
        { label: t(S.rows.date), field: 'dateText' },
        { label: t(S.rows.firstTime), field: 'firstTimeText' },
        { label: t(S.rows.hq), field: 'hqText' },
        { label: t(S.rows.bangladesh), field: 'bdText' },
      ],
    },
  },
};

fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f), { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 1) + '\n');
write('descriptor.json', descriptor);
write('orgs.json', orgs);
write('countries.json', countries);
write('tabs.json', tabs);
write('info.json', info);
const pinsAll = Object.values(orgs).reduce((s, o) => s + JSON.parse(o.pins).length, 0);
console.log(`${built.length} organisations built (${Object.keys(seed.organisations).length - built.length} held out), ${pinsAll} pins, ${Object.values(orgs).filter((o) => JSON.parse(o.pins).some((p) => p.halo)).length} with a halo; ${Object.keys(countries).length} countries`);
