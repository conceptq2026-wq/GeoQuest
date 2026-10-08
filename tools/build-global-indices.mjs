// Builds the global-indices map («বৈশ্বিক সূচক», work in progress, IDX-2, 2026-10-08):
//
//   node tools/build-global-indices.mjs [<out>]     (default: docs/maps/global-indices/)
//
// Reads data-sources/global-indices/global-indices.seed.json and the pinned Natural Earth countries file (Bangladesh's
// point of view) only — no network. Writes the descriptor, the rankings (indices.json), the countries (countries.json,
// countries.geojson), the two view tabs and ⓘ. An open ranking shades every country it ranks in seven classes of one
// blue, by rank (by value for a ranking given as values only); a facts-only ranking stores and shows Bangladesh, the
// top and the bottom alone. A ranking whose facts await the user (user-input), or that is held out, is not built.
// A second build writes the same bytes.
import fs from 'node:fs';
import path from 'node:path';
import { readSource } from './lib/geo.mjs';
import { simplifyFeatures } from './lib/border-traces.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const ID = 'global-indices';
const out = process.argv[2] ?? path.join(ROOT, 'docs', 'maps', ID);
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-sources', ID, `${ID}.seed.json`), 'utf8'));
const W = seed.words;
const t = (s) => s?.bn ?? null;
const DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (v) => String(v).replace(/[0-9]/g, (d) => DIGITS[d]);
const SHADES = ['#08306b', '#08519c', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef'];
const SAARC = ['AFG', 'BGD', 'BTN', 'IND', 'MDV', 'NPL', 'PAK', 'LKA'];

// ---- the countries: every Natural Earth shape, its Bengali name (the basemap's), its label point
const ne = readSource('ne_10m_admin_0_countries_bdg.geojson');
const byAdm = new Map(ne.features.map((f) => [f.properties.ADM0_A3, f]));
// A ranking's ISO3 to the shape it shades: ISO_A3, else ISO_A3_EH (France, Norway), else the seed's own list.
const toAdm = new Map();
for (const f of ne.features) {
  const p = f.properties;
  for (const code of [p.ISO_A3, p.ISO_A3_EH]) if (code && code !== '-99' && !toAdm.has(code)) toAdm.set(code, p.ADM0_A3);
}
for (const [iso, adm] of Object.entries(seed.isoToShape ?? {})) toAdm.set(iso, adm);
const countries = {};
for (const f of [...ne.features].sort((a, b) => a.properties.ADM0_A3.localeCompare(b.properties.ADM0_A3))) {
  const p = f.properties;
  countries[p.ADM0_A3] = { nameBn: p.NAME_BN, nameEn: p.NAME_EN, labelAt: [+p.LABEL_X.toFixed(3), +p.LABEL_Y.toFixed(3)] };
}
const nameOf = (iso, fallback) => {
  const adm = toAdm.get(iso);
  return (adm && countries[adm]?.nameBn) || t(seed.countryNames?.[iso]) || fallback;
};

const raw = ne.features.map((f) => ({ type: 'Feature', properties: { id: f.properties.ADM0_A3 }, geometry: f.geometry }));
const simplified = await simplifyFeatures(raw, 10000);
const round = (ring) => {
  const o = [];
  for (const p of ring) {
    const q = [+p[0].toFixed(3), +p[1].toFixed(3)];
    const l = o.at(-1);
    if (!l || l[0] !== q[0] || l[1] !== q[1]) o.push(q);
  }
  if (o.length > 1 && (o[0][0] !== o.at(-1)[0] || o[0][1] !== o.at(-1)[1])) o.push([...o[0]]);
  return o.length >= 4 ? o : null;
};
const geoFeatures = simplified
  .map((f) => {
    const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((poly) => poly.map(round).filter(Boolean)).filter((poly) => poly.length);
    if (!polys.length) return null;
    return { type: 'Feature', properties: { id: f.properties.id }, geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } };
  })
  .filter(Boolean)
  .sort((a, b) => a.properties.id.localeCompare(b.properties.id));
const drawn = new Set(geoFeatures.map((f) => f.properties.id));

// ---- the rankings
const MONTHS = W.months.map(t);
const bnDate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return d ? `${bn(d)} ${MONTHS[m - 1]} ${bn(y)}` : m ? `${MONTHS[m - 1]} ${bn(y)}` : bn(y);
};
const num = (v) => {
  if (v === null || v === undefined) return null;
  const s = Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : String(v);
  return bn(s);
};
const built = seed.indices.filter((x) => (x.kind === 'open' || x.kind === 'facts') && x.latest && !x.heldOut);
const indices = {};
const LISTS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 'hiTop', 'hiBottom', 'bd'];
for (const x of built) {
  const L = x.latest;
  const lists = Object.fromEntries(LISTS.map((k) => [k, []]));
  const unshaded = [];
  let southAsia;
  if (x.kind === 'open') {
    // Shade classes: by rank, or by value (lowest first) for a ranking given as values only.
    const order = x.valueOnly ? [...L.rows].sort((a, b) => a.value - b.value || a.iso3.localeCompare(b.iso3)) : [...L.rows].sort((a, b) => a.rank - b.rank || a.iso3.localeCompare(b.iso3));
    const n = order.length;
    order.forEach((r, i) => {
      const adm = toAdm.get(r.iso3);
      const pos = x.valueOnly ? i : r.rank - 1;
      if (!adm || !drawn.has(adm)) {
        unshaded.push(`${nameOf(r.iso3, r.name)}${x.valueOnly ? '' : ` (${bn(r.rank)})`}`);
        return;
      }
      lists[`s${Math.min(7, Math.floor((pos * 7) / n) + 1)}`].push(adm);
    });
    if (!x.valueOnly) {
      const sa = L.rows.filter((r) => SAARC.includes(r.iso3)).sort((a, b) => a.rank - b.rank);
      const at = sa.findIndex((r) => r.iso3 === 'BGD');
      if (at >= 0) southAsia = t(W.southAsiaOf).replace('{n}', bn(sa.length)).replace('{nth}', t(W.ordinals[at]));
    }
  } else {
    for (const [k, who] of [['hiTop', L.top], ['hiBottom', L.bottom]]) {
      const adm = toAdm.get(who.iso3);
      if (adm && drawn.has(adm)) lists[k].push(adm);
      else unshaded.push(nameOf(who.iso3, who.name));
    }
  }
  if (L.bd && (L.bd.rank || L.bd.value !== undefined)) lists.bd.push('BGD');
  for (const k of LISTS) lists[k].sort();
  const change = !x.valueOnly && x.previous?.bd?.rank && L.bd?.rank ? x.previous.bd.rank - L.bd.rank : undefined;
  const rankMeans = [t(x.rankMeans), x.sortedByValue ? t(W.sortedNote) : null, x.projection ? t(W.projection) : null].filter(Boolean).join('; ');
  const adm = (who) => toAdm.get(who.iso3) ?? null;
  indices[x.id] = {
    nameBn: t(x.nameBn),
    nameEn: x.nameEn,
    kind: x.kind,
    valueOnly: Boolean(x.valueOnly),
    ...(x.valueOnly ? {} : { bdRank: L.bd.rank, bdOf: L.n }),
    ...(x.valueOnly ? { bdValue: bn(L.bd.value.toFixed(4)) } : {}),
    topCode: adm(L.top),
    topName: nameOf(L.top.iso3, L.top.name),
    bottomCode: adm(L.bottom),
    bottomName: `${nameOf(L.bottom.iso3, L.bottom.name)}${L.bottom.shared ? ` (${t(W.shared)})` : ''}`,
    ...(x.valueOnly ? { topLabel: t(W.valueTopStat), bottomLabel: t(W.valueBottomStat), pillTop: t(W.valuePillTop), pillBottom: t(W.valuePillBottom) } : {}),
    publisher: x.publisher,
    edition: `${L.edition}${L.releaseDate ? ` · ${t(W.released).replace('{date}', bnDate(L.releaseDate))}` : ''}`,
    ...(southAsia ? { southAsia } : {}),
    rankMeans,
    ...(unshaded.length ? { unshaded: unshaded.join(', ') } : {}),
    verified: bnDate(seed.verified),
    url: L.pageUrl ?? L.releaseUrl ?? L.dataUrl,
    ...(change !== undefined ? { change } : {}),
    ...(x.goodIs ? { goodIs: x.goodIs } : {}),
    ...lists,
  };
}
// The «বাংলাদেশ» tab's own rows (Dhaka's city ranking), once their facts are in.
for (const x of seed.indices.filter((y) => y.kind === 'city' && y.latest && !y.heldOut)) {
  const L = x.latest;
  indices[x.id] = { nameBn: t(x.nameBn), nameEn: x.nameEn, kind: 'facts', valueOnly: false, bdRank: L.bd.rank, bdOf: L.n, publisher: x.publisher, edition: L.edition, verified: bnDate(seed.verified), url: L.pageUrl ?? L.releaseUrl, bdOnly: true, ...Object.fromEntries(LISTS.map((k) => [k, []])) };
}

const tabs = { countries: { titleBn: t(W.tabCountries) }, bangladesh: { titleBn: t(W.tabBangladesh) } };
const info = {
  lines: [
    ...built.map((x) => ({ text: `${t(x.nameBn)}: ${x.publisher}, ${x.latest.edition} — ${x.latest.dataUrl}`, group: 'sources' })),
    { text: 'Country shapes: Natural Earth, public domain.', group: 'sources' },
    ...(seed.infoNotes ?? []).map((n) => ({ text: t(n), group: 'notes' })),
  ],
};

const listField = (k) => ({ type: 'refs', to: 'countries', display: false });
const descriptor = {
  schema: 'geoquest/map-descriptor@1',
  id: ID,
  section: seed.section,
  title: { bn: t(W.title), en: 'Global Indices' },
  basemap: 'world',
  view: { fitBounds: [-170, -58, 180, 80] },
  constraints: { minZoom: -1, maxZoom: 6, wholeWorld: true },
  // No text under 14 px anywhere on this map, the basemap's names and the shell's chrome included (the user, 2026-10-08).
  minTextSize: 14,
  openOn: { tab: 'countries', records: 'indices', key: built[0].id },
  records: {
    tabs: { file: './tabs.json', fields: { titleBn: { type: 'text', required: true } } },
    indices: {
      file: './indices.json',
      fields: {
        nameBn: { type: 'text', required: true },
        nameEn: { type: 'text', required: true, display: false },
        kind: { type: 'text', required: true, display: false },
        valueOnly: { type: 'boolean', display: false },
        bdRank: { type: 'number', display: false },
        bdOf: { type: 'number', display: false },
        bdValue: { type: 'text', display: false },
        topCode: { type: 'text', display: false },
        topName: { type: 'text', display: false },
        bottomCode: { type: 'text', display: false },
        bottomName: { type: 'text', display: false },
        topLabel: { type: 'text', display: false },
        bottomLabel: { type: 'text', display: false },
        pillTop: { type: 'text', display: false },
        pillBottom: { type: 'text', display: false },
        publisher: { type: 'text', required: true },
        edition: { type: 'text', required: true },
        southAsia: { type: 'text' },
        rankMeans: { type: 'text', required: true },
        unshaded: { type: 'text' },
        verified: { type: 'text', required: true, display: false },
        url: { type: 'text', required: true, display: false },
        change: { type: 'number', display: false },
        goodIs: { type: 'text', display: false },
        bdOnly: { type: 'boolean', display: false },
        ...Object.fromEntries(LISTS.map((k) => [k, listField(k)])),
      },
    },
    countries: {
      file: './countries.json',
      fields: {
        nameBn: { type: 'text', required: true },
        nameEn: { type: 'text', required: true, display: false },
        labelAt: { type: 'point', display: false },
      },
    },
  },
  sources: {
    countries: {
      records: 'countries',
      geometry: './countries.geojson',
      joinField: 'id',
      state: LISTS.map((k) => ({ name: k, fromSelection: { records: 'indices', listField: k } })),
      properties: ['nameBn'],
    },
  },
  layers: [
    { id: 'ix-base', type: 'fill', source: 'countries', slot: 'belowLabels', paint: { 'fill-color': '#dfe4ea', 'fill-opacity': 0.9 } },
    ...SHADES.map((c, i) => ({ id: `ix-s${i + 1}`, type: 'fill', source: 'countries', slot: 'belowLabels', filter: ['get', `s${i + 1}`], paint: { 'fill-color': c, 'fill-opacity': 0.92 } })),
    { id: 'ix-hi-top', type: 'fill', source: 'countries', slot: 'belowLabels', filter: ['get', 'hiTop'], paint: { 'fill-color': '#08519c', 'fill-opacity': 0.92 } },
    { id: 'ix-hi-bottom', type: 'fill', source: 'countries', slot: 'belowLabels', filter: ['get', 'hiBottom'], paint: { 'fill-color': '#6b7280', 'fill-opacity': 0.92 } },
    { id: 'ix-bd', type: 'fill', source: 'countries', slot: 'belowLabels', filter: ['get', 'bd'], paint: { 'fill-color': '#d55e00', 'fill-opacity': 1 } },
    { id: 'ix-lines', type: 'line', source: 'countries', slot: 'belowLabels', layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 0.6 } },
  ],
  // No country is tapped: the card belongs to the chosen ranking.
  interactions: [],
  controls: [{ type: 'picker', from: 'indices', label: { field: 'nameBn' }, placeholder: t(W.pickerPrompt), do: [{ action: 'select' }] }],
  tabs: { from: 'tabs', label: { field: 'titleBn' } },
  indices: {
    records: 'indices',
    countries: 'countries',
    tabs: { map: 'countries', bangladesh: 'bangladesh' },
    words: Object.fromEntries(['bdStat', 'topStat', 'bottomStat', 'valueStat', 'pillTop', 'pillBottom', 'bd', 'legendTop', 'legendBottom', 'verified', 'source', 'factsNote', 'bdCaption', 'unchanged', 'steps'].map((k) => [k, t(W[k])])),
  },
  info: { file: './info.json', headings: { sources: t(W.infoSources), notes: t(W.infoNotes), conflicts: '' } },
  sheets: {
    indices: {
      title: { field: 'nameBn' },
      subtitle: { field: 'nameEn' },
      rows: [
        { label: t(W.rows.publisher), field: 'publisher' },
        { label: t(W.rows.edition), field: 'edition' },
        { label: t(W.rows.southAsia), field: 'southAsia' },
        { label: t(W.rows.rank), field: 'rankMeans' },
        { label: t(W.rows.unshaded), field: 'unshaded', stacked: true },
      ],
    },
  },
};

fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.rmSync(path.join(out, f), { recursive: true });
const write = (name, data, pretty = true) => fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, pretty ? 2 : 0) + '\n');
write('descriptor.json', descriptor);
write('tabs.json', tabs);
write('indices.json', indices);
write('countries.json', countries);
write('countries.geojson', { type: 'FeatureCollection', features: geoFeatures }, false);
write('info.json', info);
const pending = [];
JSON.stringify(seed, (k, v) => { if (v && typeof v === 'object' && typeof v.bn === 'string' && v.approved === false) pending.push(v.bn); return v; });
const waiting = seed.indices.filter((x) => x.kind === 'user-input' || (x.kind === 'city' && !x.latest)).map((x) => x.id);
console.log(`${built.length} rankings built (${built.filter((x) => x.kind === 'open').length} open, ${built.filter((x) => x.kind === 'facts').length} facts-only); user-input: ${waiting.join(', ') || 'none'}; held out: ${seed.indices.filter((x) => x.heldOut).map((x) => x.id).join(', ') || 'none'}; ${geoFeatures.length} shapes; ${pending.length} Bengali strings await approval`);
