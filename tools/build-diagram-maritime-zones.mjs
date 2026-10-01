// Builds the maritime-zones diagram into a folder: the descriptor, the data
// and the picture's layout, from the seed alone.
//
//   node tools/build-diagram-maritime-zones.mjs [out]   (out: docs/diagrams/maritime-zones)
//
// While the diagram is work in progress (tools/wip.json) only the local preview
// runs it, into its own copy of docs/ (tools/preview.mjs); nothing is written
// under docs/ until it is finished.
//
// From the seed, data-sources/maritime-zones/maritime-zones.seed.json, which
// it reads and never writes. Every Bengali word shown is the seed's, approved
// (a zone's label in the picture is its approved name without the bracket that
// follows it). Provenance — each sentence's source, article and quote place —
// is not shipped: ⓘ names the two sources and links them. No quoted UN text is
// shipped. The picture is drawn by the view (docs/visual/zones.js) from the
// layout written here: the columns' least widths at 320 px (each tap zone at
// least 44 px), the rows, the colours and, per fill, the label colour that
// reaches a 4.5:1 contrast (the build fails where neither does). Not to scale.
// A second build writes the same bytes.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed, and where the diagram goes.
const SEED = path.join(ROOT, 'data-sources/maritime-zones/maritime-zones.seed.json');
const DEFAULT_OUT = path.join(ROOT, 'docs/diagrams/maritime-zones');

const ID = 'maritime-zones';
const ITEMS = ['internal-waters', 'territorial-sea', 'contiguous-zone', 'eez', 'continental-shelf', 'high-seas', 'the-area'];
const TEXT_ONLY = ['straits', 'archipelagic-waters', 'land-locked-states'];

// The colours of zones-design.md (light values), the land's and the plain seabed's added.
const FILL = {
  land: '#D9C9A3',
  'internal-waters': '#0072B2',
  'territorial-sea': '#E69F00',
  'contiguous-zone': '#D55E00',
  eez: '#009E73',
  'high-seas': '#56B4E9',
  'continental-shelf': '#F0E442',
  'the-area': '#CC79A7',
  seabed: '#BDB6A8',
  baseline: '#222222',
};
const INK = { dark: '#111111', light: '#FFFFFF' };
const CONTRAST_MIN = 4.5;

// The picture, in CSS px. Columns, coast to sea, each at least `min` wide at 320 px
// (a 288 px stage), the room past that shared by `weight`.
const LAYOUT = {
  gutter: 16,
  columns: [
    { id: 'land', min: 26, weight: 0.3 },
    { id: 'internal-waters', min: 44, weight: 0.5 },
    { id: 'territorial-sea', min: 48, weight: 0.6 },
    { id: 'eez', min: 98, weight: 2.4 },
    { id: 'high-seas', min: 72, weight: 1.4 },
  ],
  // The contiguous zone: a strip over the EEZ's inner part, at the water's top.
  strip: { id: 'contiguous-zone', over: 'eez', min: 48, share: 0.3, height: 44 },
  // The seabed under the high seas: the shelf's fade past 200, then the Area, at least `min` wide.
  fade: { min: 28, share: 0.35 },
  area: { min: 44 },
  // The air row is as deep as ⓘ's tap zone hangs into the stage (docs/visual/style.css).
  rows: { air: 26, waterMin: 92, waterMax: 170, seabed: 48, ticks: 20, note: 20, legend: 20, gap: 2 },
  // A name's room inside its fill; its size (15 px, 14 under 390 px wide) is docs/visual/zones.css's.
  label: { pad: 4 },
  tap: 44,
};

const OUT = path.resolve(process.argv[2] ?? DEFAULT_OUT);
const fail = (msg) => {
  throw new Error(`${ID}: ${msg}`);
};

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const approved = (s, where) => {
  if (!s || typeof s.bn !== 'string' || !s.bn) fail(`${where}: no Bengali`);
  if (s.approved !== true) fail(`${where}: «${s.bn}» is not approved`);
  return s.bn;
};
if (JSON.stringify(seed.items.map((i) => i.id)) !== JSON.stringify(ITEMS)) fail(`the items are ${seed.items.map((i) => i.id).join(', ')}`);
if (JSON.stringify(seed.textOnly.map((i) => i.id)) !== JSON.stringify(TEXT_ONLY)) fail(`the text-only lines are ${seed.textOnly.map((i) => i.id).join(', ')}`);

// ---- contrast (WCAG 2) ----------------------------------------------------------------

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// The label colour on each fill a label sits on: the better of dark and light ink, which must reach CONTRAST_MIN.
const labelled = ['land', 'internal-waters', 'territorial-sea', 'eez', 'high-seas', 'continental-shelf'];
// With one zone chosen the others' fills dim to DIM over the page, and their names turn dark (docs/visual/zones.css).
const PAGE = '#EEF3F8';
const DIM = 0.35;
const blend = (hex, alpha, under) => `#${[1, 3, 5].map((i) => Math.round(alpha * parseInt(hex.slice(i, i + 2), 16) + (1 - alpha) * parseInt(under.slice(i, i + 2), 16)).toString(16).padStart(2, '0')).join('')}`;
const colours = {};
for (const [id, fill] of Object.entries(FILL)) {
  const dark = contrast(fill, INK.dark);
  const light = contrast(fill, INK.light);
  const ink = dark >= light ? 'dark' : 'light';
  const ratio = Math.max(dark, light);
  if (labelled.includes(id) && ratio < CONTRAST_MIN) fail(`${id}: no label colour reaches ${CONTRAST_MIN}:1 on ${fill} (dark ${dark.toFixed(2)}, light ${light.toFixed(2)})`);
  const dimmed = contrast(blend(fill, DIM, PAGE), INK.dark);
  if (labelled.includes(id) && id !== 'land' && dimmed < CONTRAST_MIN) fail(`${id}: dark ink on the dimmed fill reaches only ${dimmed.toFixed(2)}:1`);
  colours[id] = { fill, text: INK[ink], contrast: Math.round(ratio * 100) / 100, dimmed: Math.round(dimmed * 100) / 100 };
}

// ---- the zones ------------------------------------------------------------------------

const label = (name) => name.replace(/\s*\([^()]*\)$/, '');
const zones = seed.items.map((item) => {
  const nameBn = approved(item.name, `${item.id}.name`);
  return {
    id: item.id,
    row: item.row,
    nameBn,
    labelBn: label(nameBn),
    sentences: item.sentences.map((s, i) => approved(s, `${item.id}.sentences[${i}]`)),
  };
});
for (const z of zones) if (!z.sentences.length || z.sentences.length > 3) fail(`${z.id}: ${z.sentences.length} sentences; a card shows 1 to 3`);

// ---- ⓘ: the two sources by name and link, then the notes ----------------------------------

const w = seed.words;
const d = seed.drawing;
const credits = [
  { title: `${seed.sources.overview.title.replace(/^United Nations, Division for Ocean Affairs and the Law of the Sea \(DOALOS\): /, 'UN DOALOS: ')}`, url: seed.sources.overview.url },
  { title: 'UN DOALOS: United Nations Convention on the Law of the Sea (full text)', url: seed.sources.convention.url },
  ...seed.textOnly.map((t) => ({ title: approved(t.sentences[0], `${t.id}`), lang: 'bn', group: 'notes' })),
  { title: approved(w.neutral, 'words.neutral'), lang: 'bn', group: 'notes' },
];

// ---- the files --------------------------------------------------------------------------

const json = (v) => JSON.stringify(v, null, 2) + '\n';
const descriptor = {
  id: ID,
  section: seed.section,
  language: 'bn',
  title: { en: w.title.en, bn: approved(w.title, 'words.title') },
  data: 'data.json',
  views: [{ id: 'zones', type: 'zones', art: 'zones.json' }],
  // Interface words are data: the seed's, and no others.
  words: {
    picker: approved(w.picker, 'words.picker'),
    close: approved(w.close, 'words.close'),
    scale: approved(w.scale, 'words.scale'),
    axis: approved(d.measuredFrom.label, 'drawing.measuredFrom.label'),
    baseline: approved(d.baseline.label, 'drawing.baseline.label'),
    land: approved(d.places.land, 'drawing.places.land'),
    beyond200: approved(d.shelfBeyond200.label, 'drawing.shelfBeyond200.label'),
  },
};
const data = {
  _about: 'Built by tools/build-diagram-maritime-zones.mjs from data-sources/maritime-zones/maritime-zones.seed.json; do not edit.',
  zones,
  credits,
  creditGroups: { sources: approved(w.infoSources, 'words.infoSources'), notes: approved(w.infoNotes, 'words.infoNotes') },
};
const ticks = d.ticksNm.map((nm, i) => ({ nm, label: approved(d.tickLabels[i], `drawing.tickLabels[${i}]`) }));
if (JSON.stringify(d.ticksNm) !== '[0,12,24,200]') fail(`the ticks are ${d.ticksNm.join(', ')}; the view draws 0, 12, 24 and 200`);
const zonesArt = {
  _about: 'Built by tools/build-diagram-maritime-zones.mjs. The picture\'s layout in CSS px, not to scale: each column\'s least width at 320 px (a 288 px stage) and its share of the room past that; the colours, and per fill the label colour and its contrast ratio.',
  ...LAYOUT,
  ticks,
  colours,
  legend: [
    { pattern: 'hatch', zone: 'contiguous-zone', text: zones.find((z) => z.id === 'contiguous-zone').labelBn },
    { pattern: 'fade', zone: 'continental-shelf', text: descriptor.words.beyond200 },
    { pattern: 'dots', zone: 'the-area', text: zones.find((z) => z.id === 'the-area').nameBn },
  ],
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'descriptor.json'), json(descriptor));
fs.writeFileSync(path.join(OUT, 'data.json'), json(data));
fs.writeFileSync(path.join(OUT, 'zones.json'), json(zonesArt));
console.log(`wrote ${path.relative(ROOT, OUT) || OUT}: descriptor.json, data.json, zones.json — ${zones.length} zones; label contrast ${labelled.map((id) => `${id} ${colours[id].contrast}`).join(', ')}`);
