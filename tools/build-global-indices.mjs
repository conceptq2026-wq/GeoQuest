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

// ---- the countries: the shared world file's (docs/shared/world-countries.json, keyed by ISO3 — Natural Earth's own
// ADM0_A3 where it has none, as Kosovo's KOS), each with the basemap's Bengali name and its label point.
const ne = readSource('ne_10m_admin_0_countries_bdg.geojson');
const keyOf = (p) => (p.ISO_A3 && p.ISO_A3 !== '-99' ? p.ISO_A3 : p.ADM0_A3);
const shared = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'shared', 'world-countries.json'), 'utf8'));
const drawn = new Set(shared.countries.map((c) => c.iso3));
// A ranking's code to the shape it shades: the same code, else ISO_A3_EH (France, Norway), else the seed's own list.
const toAdm = new Map([...drawn].map((k) => [k, k]));
for (const f of ne.features) {
  const p = f.properties;
  if (p.ISO_A3_EH && p.ISO_A3_EH !== '-99' && !toAdm.has(p.ISO_A3_EH)) toAdm.set(p.ISO_A3_EH, keyOf(p));
}
for (const [iso, key] of Object.entries(seed.isoToShape ?? {})) toAdm.set(iso, key);
const countries = {};
for (const f of [...ne.features].sort((a, b) => keyOf(a.properties).localeCompare(keyOf(b.properties)))) {
  const p = f.properties;
  countries[keyOf(p)] = { nameBn: p.NAME_BN, nameEn: p.NAME_EN, labelAt: [+p.LABEL_X.toFixed(3), +p.LABEL_Y.toFixed(3)] };
}
// A pin's point: the country's own label point — from the Bangladesh-view file, or, for a country with no shape there
// (Israel, Taiwan), from the pinned Natural Earth file of the default view; never another country's.
const neAll = readSource('ne_10m_admin_0_countries.geojson');
const ownPoint = new Map(neAll.features.filter((f) => f.properties.ISO_A3 && f.properties.ISO_A3 !== '-99').map((f) => [f.properties.ISO_A3, [+f.properties.LABEL_X.toFixed(3), +f.properties.LABEL_Y.toFixed(3)]]));
const pointOf = (iso) => { const key = toAdm.get(iso); return (key && countries[key]?.labelAt) ?? ownPoint.get(iso) ?? null; };
const nameOf = (iso, fallback) => {
  const key = toAdm.get(iso);
  return (key && countries[key]?.nameBn) || t(seed.countryNames?.[iso]) || fallback;
};

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
// A user-input ranking is built, as facts-only, once tools/ingest-user-input.mjs has put the user's facts in; until
// then it is hidden, with no placeholder.
const built = seed.indices.filter((x) => (x.kind === 'open' || x.kind === 'facts' || x.kind === 'user-input') && x.latest && !x.heldOut);
const kindOf = (x) => (x.kind === 'user-input' ? 'facts' : x.kind);
const indices = {};
const LISTS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 'hiTop', 'hiBottom', 'bd'];
for (const x of built) {
  const L = x.latest;
  const lists = Object.fromEntries(LISTS.map((k) => [k, []]));
  let southAsia;
  if (kindOf(x) === 'open') {
    // Shade classes: by rank, or by value (lowest first) for a ranking given as values only.
    const order = x.valueOnly ? [...L.rows].sort((a, b) => a.value - b.value || a.iso3.localeCompare(b.iso3)) : [...L.rows].sort((a, b) => a.rank - b.rank || a.iso3.localeCompare(b.iso3));
    const n = order.length;
    order.forEach((r, i) => {
      const adm = toAdm.get(r.iso3);
      const pos = x.valueOnly ? i : r.rank - 1;
      if (!adm || !drawn.has(adm)) return; // no shape: unshaded, and named nowhere but its own pin
      lists[`s${Math.min(7, Math.floor((pos * 7) / n) + 1)}`].push(adm);
    });
    if (!x.valueOnly) {
      const sa = L.rows.filter((r) => SAARC.includes(r.iso3)).sort((a, b) => a.rank - b.rank);
      const at = sa.findIndex((r) => r.iso3 === 'BGD');
      if (at >= 0) southAsia = t(W.southAsiaOf).replace('{n}', bn(sa.length)).replace('{nth}', t(W.ordinals[at]));
    }
  } else {
    for (const [k, who] of [['hiTop', [L.top]], ['hiBottom', L.bottom.tied ?? [L.bottom]]]) {
      for (const w of who) {
        const adm = toAdm.get(w.iso3);
        if (adm && drawn.has(adm)) lists[k].push(adm);
      }
    }
  }
  if (L.bd && (L.bd.rank || L.bd.value !== undefined)) lists.bd.push('BGD');
  for (const k of LISTS) lists[k].sort();
  const change = !x.valueOnly && x.previous?.bd?.rank && L.bd?.rank ? x.previous.bd.rank - L.bd.rank : undefined;
  const rankMeans = [t(x.rankMeans), x.sortedByValue ? t(W.sortedNote) : null, x.projection ? t(W.projection) : null].filter(Boolean).join('; ');
  const adm = (who) => toAdm.get(who.iso3) ?? null;
  // The ends, ties included: an open ranking's from its rows (by value for a ranking of values only), a facts-only
  // one's as read (its tied bottom, where two readings agree on one).
  const ends = (() => {
    if (kindOf(x) !== 'open') return { top: [L.top], bottom: L.bottom.tied ?? [L.bottom], topRank: L.top.rank, bottomRank: L.bottom.rank };
    if (x.valueOnly) {
      const lo = Math.min(...L.rows.map((r) => r.value)), hi = Math.max(...L.rows.map((r) => r.value));
      return { top: L.rows.filter((r) => r.value === lo), bottom: L.rows.filter((r) => r.value === hi) };
    }
    const lo = Math.min(...L.rows.map((r) => r.rank)), hi = Math.max(...L.rows.map((r) => r.rank));
    return { top: L.rows.filter((r) => r.rank === lo), bottom: L.rows.filter((r) => r.rank === hi), topRank: lo, bottomRank: hi };
  })();
  const pinsOf = (end, list, rank) => {
    const text = (who) => (x.valueOnly ? t(end === 'top' ? W.pinLow : W.pinHigh) : t(W.pinRank).replace('{rank}', bn(rank))).replace('{name}', nameOf(who.iso3, who.name));
    if (list.length > 2) return [{ kind: end, text: t(W.pinTie).replace('{rank}', bn(rank)).replace('{n}', bn(list.length)), at: pointOf(list[0].iso3) }];
    return list.map((who) => ({ kind: end, text: text(who), at: pointOf(who.iso3) }));
  };
  const pins = [
    { kind: 'bd', text: t(W.pinBd).replace('{value}', x.valueOnly ? bn(L.bd.value.toFixed(4)) : bn(L.bd.rank)), at: pointOf('BGD') },
    ...pinsOf('top', ends.top, ends.topRank),
    ...pinsOf('bottom', ends.bottom, ends.bottomRank),
  ];
  const lost = pins.filter((p) => !p.at);
  if (lost.length) throw new Error(`${x.id}: no point of its own for ${lost.map((p) => p.text).join(', ')}`);
  const statName = (list) => list.map((w) => nameOf(w.iso3, w.name)).join(', ') + (list.length > 1 ? ` (${t(W.shared)})` : '');
  indices[x.id] = {
    nameBn: t(x.nameBn),
    nameEn: x.nameEn,
    kind: kindOf(x),
    valueOnly: Boolean(x.valueOnly),
    ...(x.valueOnly ? {} : { bdRank: L.bd.rank, bdOf: L.n }),
    ...(x.valueOnly ? { bdValue: bn(L.bd.value.toFixed(4)) } : {}),
    topCode: adm(L.top),
    topName: statName(ends.top),
    bottomCode: adm(L.bottom),
    bottomName: statName(ends.bottom),
    pins: JSON.stringify(pins),
    ...(x.valueOnly ? { topLabel: t(W.valueTopStat), bottomLabel: t(W.valueBottomStat) } : {}),
    publisher: x.publisher,
    // Where the release date is unsure, its year only (the user, IDX-3).
    edition: `${L.edition}${L.releaseDate || L.releaseYear ? ` · ${t(W.released).replace('{date}', L.releaseDate ? bnDate(L.releaseDate) : bn(L.releaseYear))}` : ''}`,
    ...(southAsia ? { southAsia } : {}),
    rankMeans,
    basis: x.basis ?? 'edition',
    verified: bnDate(seed.verified),
    url: L.source?.url ?? x.pageUrl ?? L.releaseUrl ?? L.dataUrl,
    ...(change !== undefined ? { change } : {}),
    ...(x.goodIs ? { goodIs: x.goodIs } : {}),
    ...lists,
  };
}
// The «বাংলাদেশ» tab's own rows (Dhaka's city ranking), once their facts are in.
for (const x of seed.indices.filter((y) => y.kind === 'city' && y.latest && !y.heldOut)) {
  const L = x.latest;
  const change = x.previous?.bd?.rank && L.bd?.rank ? x.previous.bd.rank - L.bd.rank : undefined;
  indices[x.id] = { nameBn: t(x.nameBn), nameEn: x.nameEn, kind: 'facts', valueOnly: false, bdRank: L.bd.rank, bdOf: L.n, publisher: x.publisher, edition: L.edition, verified: bnDate(seed.verified), url: L.source?.url ?? x.officialUrl, bdOnly: true, basis: 'edition', ...(change !== undefined ? { change } : {}), ...(x.goodIs ? { goodIs: x.goodIs } : {}), ...Object.fromEntries(LISTS.map((k) => [k, []])) };
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
  // No other country's name on the map (the user, 2026-10-09: «অন্য দেশের নাম থাকবে না»): the pins are its only names;
  // sea and ocean names stay. A baseline exception, this map's alone (CLAUDE.md).
  hideCountryLabels: true,
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
        pins: { type: 'text', display: false },
        publisher: { type: 'text', required: true },
        edition: { type: 'text', required: true },
        southAsia: { type: 'text' },
        rankMeans: { type: 'text', required: true },
        basis: { type: 'text', display: false },
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
      // The shared countries (IDX-3): one light file for every map that shades countries.
      sharedGeometry: 'world-countries.json',
      joinField: 'iso3',
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
    words: Object.fromEntries(['bdStat', 'topStat', 'bottomStat', 'valueStat', 'legendTop', 'legendBottom', 'verified', 'source', 'factsNote', 'bdCaption', 'unchanged', 'better', 'worse', 'upNeutral', 'downNeutral', 'basisEdition', 'basisYear'].map((k) => [k, t(W[k])])),
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
write('info.json', info);
const pending = [];
JSON.stringify(seed, (k, v) => { if (v && typeof v === 'object' && typeof v.bn === 'string' && v.approved === false) pending.push(v.bn); return v; });
const waiting = seed.indices.filter((x) => x.kind === 'user-input' || (x.kind === 'city' && !x.latest)).map((x) => x.id);
console.log(`${built.length} rankings built (${built.filter((x) => x.kind === 'open').length} open, ${built.filter((x) => x.kind === 'facts').length} facts-only); user-input: ${waiting.join(', ') || 'none'}; held out: ${seed.indices.filter((x) => x.heldOut).map((x) => x.id).join(', ') || 'none'}; ${drawn.size} shapes (shared); ${pending.length} Bengali strings await approval`);
