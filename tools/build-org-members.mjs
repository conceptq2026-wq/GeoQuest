// org-members, step 2. Writes the map into the folder it is given (the local
// preview's copy). Nothing under docs/. Reads the seed and the pinned
// Bangladesh-view countries file. No network.
//
//   node tools/build-org-members.mjs <out-dir>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readSource } from './lib/geo.mjs';
import { simplifyFeatures, innerPoints } from './lib/border-traces.mjs';

const outDir = process.argv[2];
if (!outDir) throw new Error('usage: node tools/build-org-members.mjs <out-dir>');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-sources/org-members/org-members.seed.json'), 'utf8'));

const LISTS = ['members', 'observer', 'dialoguePartner', 'candidate', 'potentialCandidate'];
const STATUS = {
  member: { list: 'members', color: '#0072B2', style: 'solid', dash: null },
  observer: { list: 'observer', color: '#E69F00', style: 'dashed', dash: [3, 2] },
  dialoguePartner: { list: 'dialoguePartner', color: '#009E73', style: 'dotted', dash: [0.6, 1.5] },
  candidate: { list: 'candidate', color: '#D55E00', style: 'solid', dash: null },
  potentialCandidate: { list: 'potentialCandidate', color: '#CC79A7', style: 'dotted', dash: [0.4, 1.8] },
};
// English names for a non-country row whose Bengali name the user has not given.
const NON_EN = {
  turkishCypriotState: 'Turkish Cypriot State',
  mnlf: 'Moro National Liberation Front',
  puoicm: 'Parliamentary Union of the OIC Member States',
  nam: 'Non-Aligned Movement',
  chineseTaipei: 'Chinese Taipei',
  aseanSecretariat: 'ASEAN Secretariat',
  pecc: 'Pacific Economic Cooperation Council',
  pifSecretariat: 'Pacific Islands Forum Secretariat',
  turkicCouncil: 'Cooperation Council of Turkic Speaking States',
  energyCharter: 'International Energy Charter',
};
const NON_LABEL = {
  members: 'nonCountry.members',
  observer: 'nonCountry.observer',
  dialoguePartner: 'nonCountry.dialoguePartner',
  candidate: 'nonCountry.candidate',
  potentialCandidate: 'nonCountry.potentialCandidate',
};

const bn = (n) => String(n).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const bnDate = (iso) => bn(iso);
const text = (spec) => spec?.bn ?? null;

const orgs = seed.organisations;
const codes = [...new Set(Object.values(orgs).flatMap((o) => LISTS.flatMap((l) => (o[l] ?? []).map((m) => m.code))))].sort();
const ne = readSource('ne_10m_admin_0_countries_bdg.geojson');
const by = new Map(ne.features.map((f) => [f.properties.ADM0_A3, f]));
const missing = codes.filter((c) => !by.has(c));
if (missing.length) throw new Error(`no shape for ${missing.join(', ')}`);

const raw = codes.map((code) => ({ type: 'Feature', properties: { id: code }, geometry: by.get(code).geometry }));

function cleanGeometry(geometry) {
  const roundRing = (ring) => {
    const out = [];
    for (const p of ring) {
      const q = [+p[0].toFixed(3), +p[1].toFixed(3)];
      const last = out.at(-1);
      if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
    }
    if (out.length > 1 && out[0][0] === out.at(-1)[0] && out[0][1] === out.at(-1)[1]) out.pop();
    if (out.length >= 3) out.push([...out[0]]);
    return out.length >= 4 ? out : null;
  };
  const polys = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)
    .map((poly) => poly.map(roundRing).filter(Boolean))
    .filter((poly) => poly.length && poly[0]);
  if (!polys.length) return null;
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

function ringsOf(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.flat();
}
function orient(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function properCross(a, b, c, d) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}
function selfCross(geometry) {
  for (const ring of ringsOf(geometry)) {
    const n = ring.length - 1;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (properCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}
function inRing(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function inside(pt, geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.some((p) => inRing(pt, p[0]) && !p.slice(1).some((h) => inRing(pt, h)));
}
function bboxOf(geometry) {
  const pts = ringsOf(geometry).flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function segMetres(p, a, b) {
  const unwrap = (lon) => { let d = lon - p[0]; while (d > 180) d -= 360; while (d < -180) d += 360; return p[0] + d; };
  a = [unwrap(a[0]), a[1]];
  b = [unwrap(b[0]), b[1]];
  const lat = (a[1] + b[1] + p[1]) / 3;
  const m = Math.PI / 180;
  const xy = (q) => [q[0] * m * 6371000 * Math.cos(lat * m), q[1] * m * 6371000];
  const P = xy(p), A = xy(a), B = xy(b);
  const abx = B[0] - A[0], aby = B[1] - A[1];
  const ab2 = abx * abx + aby * aby || 1;
  let t = ((P[0] - A[0]) * abx + (P[1] - A[1]) * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(P[0] - (A[0] + t * abx), P[1] - (A[1] + t * aby));
}
function deviationMetres(original, simplified) {
  let near = 0, far = 0;
  const segs = ringsOf(simplified).flatMap((ring) => ring.slice(0, -1).map((p, i) => [p, ring[i + 1]]).filter(([a, b]) => Math.abs(a[0] - b[0]) <= 180));
  const verts = ringsOf(original).flat();
  const step = Math.max(1, Math.ceil(verts.length / 2500));
  for (let i = 0; i < verts.length; i += step) {
    const p = verts[i];
    let best = Infinity;
    for (const [a, b] of segs) {
      const close = (q) => Math.min(Math.abs(q[0] - p[0]), 360 - Math.abs(q[0] - p[0])) <= 8 && Math.abs(q[1] - p[1]) <= 8;
      if (!close(a) && !close(b)) continue;
      const d = segMetres(p, a, b);
      if (d < best) best = d;
      if (best < 1) break;
    }
    if (best === Infinity) continue;
    if (best <= 25000) near = Math.max(near, best);
    far = Math.max(far, best);
  }
  return { near, far };
}

console.log(`simplifying ${codes.length} countries…`);
const trials = [];
for (const metres of [8000, 12000, 16000, 20000, 25000]) {
  const simplified = await simplifyFeatures(raw.map((f) => ({ ...f, geometry: f.geometry })), metres);
  const features = [];
  let lost = null;
  for (const f of simplified) {
    const geometry = cleanGeometry(f.geometry);
    if (!geometry) { lost = f.properties.id; break; }
    features.push({ type: 'Feature', properties: { id: f.properties.id }, geometry });
  }
  if (lost) { console.log(`  ${metres} m: ${lost} vanished`); continue; }
  const crossed = features.filter((f) => selfCross(f.geometry)).map((f) => f.properties.id);
  const points = await innerPoints(features);
  const overlap = [];
  const boxes = features.map((f) => ({ f, box: bboxOf(f.geometry) }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i], boxes[j]];
    if (a.box[2] < b.box[0] || b.box[2] < a.box[0] || a.box[3] < b.box[1] || b.box[3] < a.box[1]) continue;
    const pa = points[a.f.properties.id], pb = points[b.f.properties.id];
    if (inside(pa, b.f.geometry) || inside(pb, a.f.geometry)) overlap.push(`${a.f.properties.id}/${b.f.properties.id}`);
  }
  const gj = JSON.stringify({ type: 'FeatureCollection', features });
  const gzip = zlib.gzipSync(gj).length;
  const ok = !crossed.length && !overlap.length;
  console.log(`  ${metres} m: ${gj.length} B, gzip ${gzip} B${ok ? '' : ` — cross ${crossed.slice(0, 3).join(',')} overlap ${overlap.slice(0, 3).join(',')}`}`);
  if (ok) trials.push({ metres, features, points, gzip, gj });
}
if (!trials.length) throw new Error('no simplification kept every country without a self-crossing or an overlap');
const target = 100 * 1024;
const pool = trials.filter((t) => t.gzip <= target * 1.2);
const chosen = (pool.length ? pool : trials).sort((a, b) => Math.abs(a.gzip - target) - Math.abs(b.gzip - target) || a.metres - b.metres)[0];
let near = 0, far = 0, farId = '';
for (const f of chosen.features) {
  const d = deviationMetres(by.get(f.properties.id).geometry, f.geometry);
  near = Math.max(near, d.near);
  if (d.far > far) { far = d.far; farId = f.properties.id; }
}
console.log(`chosen ${chosen.metres} m, ${chosen.gj.length} B, gzip ${chosen.gzip} B, worst kept-line deviation ${(near / 1000).toFixed(1)} km; a dropped islet of ${farId} is ${(far / 1000).toFixed(0)} km from what remains`);

const pointOf = chosen.points;
const geomOf = new Map(chosen.features.map((f) => [f.properties.id, f.geometry]));
// The part the inner point sits in: the tap target, a fill for every country. A dot only while
// that part is smaller than a finger (step 2b, 2026-10-07): its box under 44 px both ways at the
// current zoom. `dotUntil` is the zoom it reaches 44 px; the dot and its tap target show below it.
// The map zooms out to MIN_ZOOM, so a world-wide organisation fits a phone's width.
const MIN_ZOOM = -1;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) / (2 * Math.PI);
const dotUntilOf = (f) => +Math.log2(44 / (512 * Math.max((f[2] - f[0]) / 360, Math.abs(mercY(f[3]) - mercY(f[1])), 1e-9))).toFixed(2);
function mainPart(geometry, pt) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const hit = polys.find((p) => inRing(pt, p[0]) && !p.slice(1).some((h) => inRing(pt, h)));
  return { type: 'Polygon', coordinates: hit ?? polys[0] };
}
function frameOf(geometry) {
  const [w, s, e, n] = bboxOf(geometry);
  return e - w > 180 ? [-180, +s.toFixed(2), 180, +n.toFixed(2)] : [+w.toFixed(2), +s.toFixed(2), +e.toFixed(2), +n.toFixed(2)];
}
// The members' frame the short way round (2026-10-07): the longitudes their main parts cover, and
// the widest stretch none covers left out — across the antimeridian where that is shorter, the east
// edge then past 180°. Before, a span over 180° framed the whole world.
function unionFrame(frames) {
  const s = Math.min(...frames.map((f) => f[1]));
  const n = Math.max(...frames.map((f) => f[3]));
  if (frames.some((f) => f[2] - f[0] >= 359)) return [-180, +s.toFixed(2), 180, +n.toFixed(2)];
  const merged = [];
  for (const [w, e] of frames.map((f) => [f[0], f[2]]).sort((a, b) => a[0] - b[0])) {
    if (merged.length && w <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(merged.at(-1)[1], e);
    else merged.push([w, e]);
  }
  // The gap after each interval, to the next (the last wraps to the first).
  let best = { size: -1, after: merged.length - 1 };
  for (let i = 0; i < merged.length; i++) {
    const next = i + 1 < merged.length ? merged[i + 1][0] : merged[0][0] + 360;
    if (next - merged[i][1] > best.size) best = { size: next - merged[i][1], after: i };
  }
  const west = merged[(best.after + 1) % merged.length][0];
  let east = merged[best.after][1];
  if (east < west) east += 360;
  return [+west.toFixed(2), +s.toFixed(2), +east.toFixed(2), +n.toFixed(2)];
}

const countryFrames = {};
const countries = {};
const lands = [];
let dots = 0;
for (const code of codes) {
  const geometry = geomOf.get(code);
  const part = mainPart(geometry, pointOf[code]);
  const frame = frameOf(part);
  countryFrames[code] = frame;
  const dotUntil = dotUntilOf(frame);
  const small = dotUntil > MIN_ZOOM;
  const src = by.get(code).properties;
  countries[code] = { nameBn: src.NAME_BN, nameEn: src.NAME, frame, ...(small ? { dotAt: pointOf[code], dotUntil } : {}) };
  if (small) dots++;
  lands.push({ type: 'Feature', properties: { id: code }, geometry: part });
}
const unnamed = codes.filter((c) => !countries[c].nameBn);
if (unnamed.length) throw new Error(`no Bengali name for ${unnamed.join(', ')}`);
console.log(`dot targets: ${dots} of ${codes.length} (a dot below the zoom its main part reaches 44 px; every country a fill)`);

function shownName(entry) {
  return entry.nameBn?.bn || NON_EN[entry.key] || null;
}
function countOf(org) {
  if (org.stated?.count) return org.stated.count.value;
  if (org.stated?.countries && org.stated?.bodies) return org.stated.countries.value + org.stated.bodies.value;
  return (org.members?.length ?? 0) + (org.nonCountry ?? []).filter((n) => n.role === 'members').length;
}
function asOf(org) {
  return org.asOf.pageDate ?? org.asOf.retrieved;
}
const organisations = {};
for (const [id, org] of Object.entries(orgs)) {
  const row = {
    nameBn: org.nameBn.bn,
    nameEn: org.nameEn,
    abbr: org.abbr,
    count: bn(countOf(org)),
    asOf: bnDate(asOf(org)),
  };
  const frames = [];
  for (const list of LISTS) {
    row[list] = (org[list] ?? []).map((m) => m.code);
    for (const code of row[list]) frames.push(countryFrames[code]);
  }
  row.frame = frames.length ? unionFrame(frames) : [-180, -56, 180, 78];
  row.shown = codes;
  for (const [role, field] of Object.entries(NON_LABEL)) {
    const names = (org.nonCountry ?? []).filter((n) => n.role === role).map(shownName);
    if (names.some((n) => !n)) throw new Error(`${id}: a non-country row has no name`);
    if (names.length) row[field] = names.join(', ');
  }
  organisations[id] = row;
}

const sortedCountries = Object.fromEntries(Object.entries(countries).sort((a, b) => a[1].nameBn.localeCompare(b[1].nameBn, 'bn')));
const S = seed.strings;
const tabs = {
  orgs: { titleBn: text(S.tabs.orgs), placeholderBn: text(S.pickerPrompt) },
  countries: { titleBn: text(S.tabs.countries), placeholderBn: text(S.countryPickerPrompt) },
};

function lineLayer(kind) {
  const s = STATUS[kind];
  return {
    id: `country-${kind}-line`,
    type: 'line',
    source: 'countries',
    slot: 'belowLabels',
    filter: ['get', kind],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': s.color, 'line-width': 1.75, 'line-opacity': 0.95, ...(s.dash ? { 'line-dasharray': s.dash } : {}) },
  };
}
const legendItems = Object.entries(STATUS).map(([kind, s]) => ({
  kind,
  label: text(S.legend[kind === 'member' ? 'members' : kind]),
  line: { color: s.color, width: 3, ...(s.style === 'solid' ? {} : { style: s.style }) },
}));

const primarySource = (org) => org.sources.map((id) => seed.sources[id]).find((s) => s.role !== 'terms');
const infoLines = [
  { text: text(S.info.view), group: 'notes' },
  { text: text(S.info.abyei), group: 'notes' },
  { text: text(S.info.nonCountry), group: 'notes' },
  { text: text(S.info.statuses), group: 'notes' },
  { text: text(S.info.sco), group: 'notes' },
  { text: text(S.info.credits), group: 'sources' },
  { text: 'Country shapes: Natural Earth, public domain.', group: 'sources' },
  ...Object.entries(orgs).map(([id, org]) => ({ text: `${organisations[id].nameBn}: ${new URL(primarySource(org).url).origin}, ${bnDate(asOf(org))}`, group: 'sources' })),
];

const state = [
  'selected',
  { name: 'orgChosen', fromSelection: { records: 'organisations', listField: 'shown' } },
  ...Object.entries(STATUS).map(([name, s]) => ({ name, fromSelection: { records: 'organisations', listField: s.list } })),
];
const fit = [{ action: 'select' }, { action: 'fitBounds', field: 'frame', clear: ['sheet'], duration: 900 }];
const descriptor = {
  schema: 'geoquest/map-descriptor@1',
  id: 'org-members',
  section: 'international',
  title: { bn: text(S.title), en: 'Members of International Organisations' },
  basemap: 'world',
  view: { fitBounds: [-180, -56, 180, 78] },
  // wholeWorld (opt-in, 2026-10-07): zoom out past the world's height, so a world-wide organisation fits a
  // phone held upright.
  constraints: { minZoom: MIN_ZOOM, maxZoom: 8, wholeWorld: true },
  // The open card at most this share of the map's height; a frame fits the room above it (as the rivers map).
  sheetMaxHeight: 0.4,
  openOn: { tab: 'orgs', records: 'countries', key: 'BGD' },
  records: {
    tabs: { file: './tabs.json', fields: { titleBn: { type: 'text', required: true }, placeholderBn: { type: 'text', required: true } } },
    organisations: {
      file: './organisations.json',
      fields: {
        nameBn: { type: 'text', required: true },
        nameEn: { type: 'text', required: true, display: false },
        abbr: { type: 'text', required: true, display: false },
        count: { type: 'text', required: true },
        asOf: { type: 'text', required: true },
        frame: { type: 'bbox', required: true },
        shown: { type: 'refs', to: 'countries', display: false },
        ...Object.fromEntries(LISTS.map((l) => [l, { type: 'refs', to: 'countries' }])),
        ...Object.fromEntries(Object.values(NON_LABEL).map((f) => [f, { type: 'text' }])),
      },
    },
    countries: {
      file: './countries.json',
      fields: {
        nameBn: { type: 'text', required: true },
        nameEn: { type: 'text', required: true, display: false },
        frame: { type: 'bbox', required: true },
        dotAt: { type: 'point' },
        dotUntil: { type: 'number', display: false },
      },
    },
  },
  sources: {
    countries: { records: 'countries', geometry: './countries.geojson', joinField: 'id', state, properties: ['nameBn'] },
    lands: { records: 'countries', geometry: './lands.geojson', joinField: 'id', state: ['selected'], properties: ['nameBn'] },
    dots: { records: 'countries', geometryFrom: 'dotAt', state, properties: ['nameBn', 'dotUntil'], tapWidth: 44, tapFilter: ['<', ['zoom'], ['get', 'dotUntil']] },
  },
  layers: [
    ...Object.keys(STATUS).map((kind) => ({
      id: `country-${kind}-fill`, type: 'fill', source: 'countries', slot: 'belowLabels', filter: ['get', kind],
      paint: { 'fill-color': STATUS[kind].color, 'fill-opacity': 0.45 },
    })),
    ...Object.keys(STATUS).map(lineLayer),
    // The chosen country (2026-10-07): a dark outline over a white halo — Bangladesh at opening, its card open.
    { id: 'country-chosen-halo', type: 'line', source: 'countries', slot: 'aboveLabels', filter: ['get', 'selected'], layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 5 } },
    { id: 'country-chosen-line', type: 'line', source: 'countries', slot: 'aboveLabels', filter: ['get', 'selected'], layout: { 'line-join': 'round' }, paint: { 'line-color': '#111827', 'line-width': 2.5 } },
    {
      id: 'country-dots', type: 'circle', source: 'dots', slot: 'aboveLabels',
      // Only while the country is smaller than a finger at this zoom (its tap target, invisible, follows the same
      // rule), and only where the dot says something: the chosen organisation's members and statuses, or the chosen
      // country. No grey dot for the rest — at world zoom nearly every country is under 44 px (2026-10-07).
      filter: ['all', ['<', ['zoom'], ['get', 'dotUntil']], ['case', ['get', 'orgChosen'], ['any', ...Object.keys(STATUS).map((k) => ['get', k])], ['get', 'selected']]],
      paint: {
        'circle-radius': ['case', ['get', 'selected'], 7, 6],
        'circle-color': ['case', ...Object.keys(STATUS).flatMap((k) => [['get', k], STATUS[k].color]), '#64748b'],
        'circle-stroke-width': ['case', ['get', 'selected'], 3, 2],
        'circle-stroke-color': ['case', ['get', 'selected'], '#111827', '#ffffff'],
      },
    },
  ],
  interactions: [
    { on: 'click', target: 'source:lands', do: fit },
    { on: 'click', target: 'source:dots', do: fit },
  ],
  controls: [{
    type: 'picker',
    from: 'organisations',
    label: { field: 'nameBn' },
    placeholder: text(S.pickerPrompt),
    do: fit,
    byTab: {
      orgs: { from: 'organisations', label: { field: 'nameBn' }, placeholder: text(S.pickerPrompt), do: fit },
      countries: { from: 'countries', label: { field: 'nameBn' }, placeholder: text(S.countryPickerPrompt), do: fit },
    },
  }],
  tabs: { from: 'tabs', label: { field: 'titleBn' }, placeholder: { field: 'placeholderBn' } },
  legend: {
    items: legendItems,
    followsSelection: { records: 'organisations', lists: Object.fromEntries(Object.entries(STATUS).map(([k, s]) => [k, s.list])) },
  },
  info: { file: './info.json', headings: { sources: text(S.info.sourcesHeading), notes: text(S.info.heading), conflicts: '' } },
  sheets: {
    organisations: {
      title: { field: 'nameBn' },
      rows: [
        { label: text(S.card.count), field: 'count', stacked: true },
        { label: text(S.card.asOf), field: 'asOf', stacked: true },
        { label: text(S.nonCountry.members), field: 'nonCountry.members', stacked: true },
        { label: text(S.nonCountry.observer), field: 'nonCountry.observer', stacked: true },
        { label: text(S.nonCountry.dialoguePartner), field: 'nonCountry.dialoguePartner', stacked: true },
      ],
    },
    countries: {
      title: { field: 'nameBn' },
      rows: [
        { label: text(S.card.memberOf), referencedBy: { records: 'organisations', listField: 'members' }, item: { field: 'nameBn' }, stacked: true, do: fit },
        { label: text(S.card.observerOf), referencedBy: { records: 'organisations', listField: 'observer' }, item: { field: 'nameBn' }, stacked: true, do: fit },
        { label: text(S.card.dialoguePartnerOf), referencedBy: { records: 'organisations', listField: 'dialoguePartner' }, item: { field: 'nameBn' }, stacked: true, do: fit },
        { label: text(S.card.candidateOf), referencedBy: { records: 'organisations', listField: 'candidate' }, item: { field: 'nameBn' }, stacked: true, do: fit },
        { label: text(S.card.candidateOf), referencedBy: { records: 'organisations', listField: 'potentialCandidate' }, item: { field: 'nameBn' }, stacked: true, do: fit },
      ],
    },
  },
};

// The potential-candidate row needs its own label. The seed has one.
descriptor.sheets.countries.rows[4].label = text(S.status.potentialCandidate);

fs.mkdirSync(outDir, { recursive: true });
const write = (name, data, pretty = true) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, pretty ? 2 : 0) + (pretty ? '\n' : ''));
write('descriptor.json', descriptor);
write('tabs.json', tabs);
write('organisations.json', organisations);
write('countries.json', sortedCountries);
write('countries.geojson', { type: 'FeatureCollection', features: chosen.features }, false);
write('lands.geojson', { type: 'FeatureCollection', features: lands }, false);
write('info.json', { lines: infoLines });
console.log(`wrote ${outDir}`);
