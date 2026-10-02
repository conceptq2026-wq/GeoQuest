// Builds the maritime-zones diagram into a folder: the descriptor, the data
// and the picture's model, from the seed alone.
//
//   node tools/build-diagram-maritime-zones.mjs [out]   (out: docs/diagrams/maritime-zones)
//
// While the diagram is work in progress (tools/wip.json) only the local preview
// runs it, into its own copy of docs/ (tools/preview.mjs); nothing is written
// under docs/ until it is finished.
//
// From the seed, data-sources/maritime-zones/maritime-zones.seed.json, which
// it reads and never writes. Every Bengali word shown is the seed's, approved.
// Provenance — each sentence's source, article and quote place — is not
// shipped: ⓘ names the two sources and links them. No quoted UN text is
// shipped.
//
// The picture (step 2b, the look of the user's approved mockup,
// tools/.cache/unclos/maritime-zones-mockup-v4.html): one 3D model — u, the
// distance from the land toward the open sea; v, 0 to 1 along the coast; z,
// the depth below the sea surface — seen in two projections, «পাশ থেকে» and
// «সমুদ্র থেকে», each an affine map of (u, v, z) to the picture's units. The
// view (docs/visual/zones.js) draws everything from this file; textures are
// SVG filters, nothing is an image. Not to scale. The zones are numbered ১–৭
// coast to sea; the numbers' ink and the ruler's reach 4.5:1 or the build
// fails. A second build writes the same bytes.
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
const DIGITS = '০১২৩৪৫৬৭৮৯';

// The approved fills (zones-design.md, light values), blended into the water by the view.
const FILL = {
  'internal-waters': '#0072B2',
  'territorial-sea': '#E69F00',
  'contiguous-zone': '#D55E00',
  eez: '#009E73',
  'continental-shelf': '#F0E442',
  'high-seas': '#56B4E9',
  'the-area': '#CC79A7',
};
// The words' inks and what they sit on: a number on its disc, the ruler on the page.
const INK = '#13252D';
const DISC = '#F7FAFB';
const PAGE = '#EEF3F8';
const CONTRAST_MIN = 4.5;

// ---- the model, in the picture's units (the mockup's) -----------------------------------

const U = { land0: 10, coast: 70, base: 110, u12: 190, u24: 268, u200: 360, fade: 398, end: 450 };
// Depth under the sea surface at each u: the shelf, the slope from about 312, the rise, the deep floor.
const PROFILE = [[70, 3], [110, 10], [190, 24], [268, 37], [312, 47], [338, 85], [360, 111], [398, 126], [450, 132]];
// The block's floor, under the deepest sea.
const FLOOR = 170;
// The bay: the coast pulled back 24 units between v 0.3 and 0.75 — the internal waters.
const BAY = { from: 0.3, to: 0.75, depth: 24 };
// Each view: its frame (x, y, width, height), the face cut along the coast (v), and x, y as
// [·u, ·v, ·z, constant]. «সমুদ্র থেকে» looks from the open sea toward the baseline, raised:
// a = (end − u) / (end − coast); x = 40 + 300v + 150a, y = 330 − 210a + 0.9z.
const span = U.end - U.coast;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const VIEWS = {
  side: { box: [0, 84, 520, 332], cut: 0, x: [1, 55, 0, 0], y: [0, -80, 1, 180] },
  sea: { box: [0, 40, 520, 470], cut: 1, x: [r6(-150 / span), 300, 0, r6(40 + (150 * U.end) / span)], y: [r6(210 / span), 0, 0.9, r6(330 - (210 * U.end) / span)] },
};
// Where each zone's number stands: [u, v, z], z as a depth or as so much under the seabed ('bed+n').
// Each number's disc is also its zone's tap target, at least TEXT.hitPx across the radius on a
// 320 px screen (79.5 units): the numbers stand at least that far apart in both views — the
// mockup's places, moved along the coast (v) where two were closer.
const BADGES = {
  side: { 'internal-waters': [78, 0.75, 0], 'territorial-sea': [180, 0.15, 0], 'contiguous-zone': [229, 0.75, 0], eez: [330, 0.85, 0], 'high-seas': [430, 0.15, 0], 'continental-shelf': [240, 0, 'bed+30'], 'the-area': [425, 0, 'bed+28'] },
  sea: { 'internal-waters': [90, 0.56, 0], 'territorial-sea': [150, 0.3, 0], 'contiguous-zone': [229, 0.153, 0], eez: [330, 0.9, 0], 'high-seas': [408, 0.38, 0], 'continental-shelf': [235, 0.5, 'bed+0'], 'the-area': [450, 0.5, 'bed+22'] },
};
// Decoration, simple original shapes: hills [u, v, half-width, height], ships [u, v, scale], one platform on the shelf at u.
const DECOR = {
  side: { hills: [[34, 0.25, 15, 24], [32, 0.65, 17, 32], [44, 0.92, 10, 18]], ships: [[420, 0.74, 0.8], [292, 0.38, 0.62]] },
  sea: { hills: [[30, 0.2, 22, 30], [34, 0.55, 26, 40], [40, 0.88, 20, 26]], ships: [[418, 0.22, 0.75], [300, 0.62, 0.55]] },
  platform: 300,
};
// The numbers' discs and the ruler's words, in the picture's units: 26 units is 14.4 px when the
// picture is 288 px wide (a 320 px screen), the least the user's rule allows. Each disc's tap
// target is hitPx CSS px in radius — 45 px across, past rounding — on any screen.
const TEXT = { size: 26, disc: 16.5, hitPx: 22.5 };

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
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
const inks = { number: contrast(INK, DISC), ruler: contrast(INK, PAGE) };
for (const [k, c] of Object.entries(inks)) if (c < CONTRAST_MIN) fail(`the ${k}'s ink reaches only ${c}:1`);

// ---- the zones ------------------------------------------------------------------------

const zones = seed.items.map((item, n) => ({
  id: item.id,
  numberBn: DIGITS[n + 1],
  nameBn: approved(item.name, `${item.id}.name`),
  fill: FILL[item.id] ?? fail(`${item.id}: no fill`),
  sentences: item.sentences.map((s, i) => approved(s, `${item.id}.sentences[${i}]`)),
}));
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
if (JSON.stringify(d.ticksNm) !== '[0,12,24,200]') fail(`the ticks are ${d.ticksNm.join(', ')}; the view draws 0, 12, 24 and 200`);
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
    viewSide: approved(w.viewSide, 'words.viewSide'),
    viewSea: approved(w.viewSea, 'words.viewSea'),
    legend: {
      baseline: approved(d.baseline.label, 'drawing.baseline.label'),
      contiguous: approved(w.legendContiguous, 'words.legendContiguous'),
      area: approved(w.legendArea, 'words.legendArea'),
      scale: approved(w.scale, 'words.scale'),
      ticks: approved(w.legendTicks, 'words.legendTicks'),
    },
  },
};
const data = {
  _about: 'Built by tools/build-diagram-maritime-zones.mjs from data-sources/maritime-zones/maritime-zones.seed.json; do not edit.',
  zones,
  credits,
  creditGroups: { sources: approved(w.infoSources, 'words.infoSources'), notes: approved(w.infoNotes, 'words.infoNotes') },
};
const model = {
  _about: 'Built by tools/build-diagram-maritime-zones.mjs. One 3D model in the picture\'s units — u from the land to the open sea, v along the coast (0–1), z the depth — and its two projections; not to scale. The zones\' fills are the approved ones, blended into the water by docs/visual/zones.js.',
  u: U,
  profile: PROFILE,
  floor: FLOOR,
  bay: BAY,
  views: VIEWS,
  badges: BADGES,
  decor: DECOR,
  text: TEXT,
  ink: INK,
  disc: DISC,
  ticks: d.ticksNm.map((nm, i) => ({ u: { 0: U.base, 12: U.u12, 24: U.u24, 200: U.u200 }[nm], label: approved(d.tickLabels[i], `drawing.tickLabels[${i}]`) })),
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'descriptor.json'), json(descriptor));
fs.writeFileSync(path.join(OUT, 'data.json'), json(data));
fs.writeFileSync(path.join(OUT, 'zones.json'), json(model));
console.log(`wrote ${path.relative(ROOT, OUT) || OUT}: descriptor.json, data.json, zones.json — ${zones.length} zones; ink contrast: numbers ${inks.number}, ruler ${inks.ruler}`);
