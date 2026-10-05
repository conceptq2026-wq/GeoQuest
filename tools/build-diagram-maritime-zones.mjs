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
//
// Step 3 (2026-10-05): the view is `zones3d`, a real-time 3D block drawn with
// Three.js r128 from SCENE below (the user's approved mockup
// tools/.cache/unclos/maritime-zones-mockup-3d-v7.html); the 2D model stays in
// the same file for the fallback without WebGL. The zones' colours are the
// seed's (drawing.colours).
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

// The words' inks and what they sit on: a number on its disc, the ruler on the page.
const INK = '#13252D';
const DISC = '#F7FAFB';
const PAGE = '#EEF3F8';
const CONTRAST_MIN = 4.5;

// ---- the model, in the picture's units (the mockup's) -----------------------------------

const U = { land0: 10, coast: 70, base: 110, u12: 190, u24: 268, u200: 360, fade: 398, end: 450 };
// Depth under the sea surface at each u: the shelf, the slope from about 312, the rise, the deep floor.
const PROFILE = [[70, 3], [110, 10], [190, 24], [268, 37], [312, 47], [338, 85], [360, 111], [398, 126], [450, 132]];
// The block's floor: thin earth under the deepest sea (step 2c: 150, from 170).
const FLOOR = 150;
// The bay: the coast pulled back 24 units between v 0.3 and 0.75 — the internal waters.
const BAY = { from: 0.3, to: 0.75, depth: 24 };
// Each view: the face cut along the coast (v), and x, y as [·u, ·v, ·z, constant]. Sized for about
// half a phone's screen (the user's decision, step 2d): the picture, cropped to the drawing by the
// view, is as wide as the stage and about as tall as it is wide.
// «পাশ থেকে»: x = u + 40v, y = 300 − 140v + 1.3z (the mockup's u + 55v, 180 − 80v + z).
// «সমুদ্র থেকে», from the open sea toward the baseline: a = (end − u) / (end − coast);
// x = 84 + 280v + 150a, y = 600 − 165a + 0.8z (the mockup's 40 + 300v + 150a, 330 − 210a + 0.9z).
const span = U.end - U.coast;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const VIEWS = {
  side: { cut: 0, x: [1, 40, 0, 0], y: [0, -140, 1.3, 300] },
  sea: { cut: 1, x: [r6(-150 / span), 280, 0, r6(84 + (150 * U.end) / span)], y: [r6(165 / span), 0, 0.8, r6(600 - (165 * U.end) / span)] },
};
// The distance bars (the user's decision, step 2d): thin strips in each zone's own colour, on the sea
// surface along its v = 0 edge — the front edge from the side, the left edge from the sea — every one
// starting at the baseline (০): the territorial sea's ০→১২ nearest the edge, then the contiguous zone's
// ০→২৪ (hatched), the EEZ's ০→২০০, and the shelf's ০→২০০ then dashed beyond. Each zone's number
// stands just past its bar's tip. Rows are `thick` units deep with `gap` between them; the tick
// labels stand `labels` units off the edge, away from the surface. The zones' own areas stay where
// the Convention puts them; only the bars start at the baseline.
const BARS = {
  side: { thick: 7, gap: 2, labels: 28 },
  sea: { thick: 9, gap: 2, labels: 34 },
  beyond: 440,
  order: [['territorial-sea', 'u12'], ['contiguous-zone', 'u24'], ['eez', 'u200'], ['continental-shelf', 'beyond']],
};
// Where each zone's number stands: [u, v, z], z as a depth or relative to the seabed ('bed+n',
// 'bed-n' above it), clear of the bars along the v = 0 edge. Each number's disc is also its zone's
// tap target, TEXT.hitPx CSS px in radius: the numbers stand far enough apart for that.
const BADGES = {
  side: { 'internal-waters': [78, 0.75, 0], 'territorial-sea': [165, 0.6, 0], 'contiguous-zone': [229, 0.8, 0], eez: [320, 0.6, 0], 'high-seas': [420, 0.8, 0], 'continental-shelf': [240, 0, 'bed+34'], 'the-area': [425, 0, 'bed-12'] },
  sea: { 'internal-waters': [90, 0.45, 0], 'territorial-sea': [150, 0.95, 0], 'contiguous-zone': [229, 0.4, 0], eez: [314, 0.85, 0], 'high-seas': [405, 0.35, 0], 'continental-shelf': [330, 0.65, 'bed+0'], 'the-area': [450, 0.5, 'bed+8'] },
};
// Decoration, simple original shapes: hills [u, v, half-width, height], ships [u, v, scale], light in
// the side view's water [u, width, drift], one platform on the shelf at u.
const DECOR = {
  side: { hills: [[34, 0.25, 15, 24], [32, 0.65, 17, 32], [44, 0.92, 10, 18]], ships: [[420, 0.74, 0.8], [292, 0.38, 0.62]], rays: [[150, 18, 40], [232, 14, 52], [318, 22, 70], [400, 16, 60]] },
  sea: { hills: [[30, 0.2, 22, 30], [34, 0.55, 26, 40], [40, 0.88, 20, 26]], ships: [[418, 0.22, 0.75], [300, 0.62, 0.55]] },
  platform: 300,
};
// The picture's words and discs, in its units: the view crops the frame to the drawing and fits its
// width to the stage, so a 560-unit-wide picture on a 320 px screen draws 26 units as 14.9 px —
// never under 14 at 1×. Each disc's tap target is hitPx CSS px in radius — 45 px across — at any zoom.
const TEXT = { size: 26, disc: 16, legend: 25, hitPx: 22.5 };

// ---- the 3D scene (step 3, the user's approved mockup, tools/.cache/unclos/maritime-zones-mockup-3d-v7.html) ----
// Its own model, in its units: u from the land to the open sea, v along the coast (0–1), depth below the
// surface. World units: x = u · scale, z = −v · length, y up; the block's floor at −floor · scale. Not to
// scale. docs/visual/zones3d.js draws it with Three.js r128 and falls back to docs/visual/zones.js.
const SCENE = {
  u: { coast: 60, base: 100, u12: 180, u24: 255, u200: 350, fade: 392, end: 450 },
  // The seabed: the shelf, the slope from about 300, the rise, the deep floor.
  profile: [[0, 0], [60, 4], [100, 15], [180, 27], [255, 37], [300, 46], [330, 92], [350, 118], [392, 140], [450, 146]],
  scale: 0.02,
  length: 4.6,
  floor: 180,
  // The bay — the internal waters: the coast pulled back `depth` units between v from and to.
  bay: { from: 0.28, to: 0.76, depth: 28 },
  // Where each zone's number stands: [u, v, height above the surface], or [u, 0, null] on the near face,
  // a little under the seabed (the shelf and the Area, beside their bands).
  anchors: { 'internal-waters': [66, 0.5, 0.03], 'territorial-sea': [148, 0.1, 0.03], 'contiguous-zone': [222, 0.88, 0.03], eez: [305, 0.78, 0.03], 'high-seas': [418, 0.42, 0.03], 'continental-shelf': [215, 0, null], 'the-area': [410, 0, null] },
  // The four distance bars under the near face, every one from the baseline, nearest first, `barStep`
  // apart (world units: room for each label between two bars at 320 px); the shelf's solid to 200 and
  // dashed to `beyond`.
  barStep: 0.66,
  bars: [['territorial-sea', 'u12'], ['contiguous-zone', 'u24'], ['eez', 'u200'], ['continental-shelf', 'beyond']],
  beyond: 432,
  // The camera: one side view (the reset), its target, and the zoom's reach (distance × 0.35 to × 1.5).
  camera: { fov: 32, target: [4.5, -2.0, -2.2], azimuth: -0.12, elevation: 0.42, fit: [5.7, 4.6], zoom: [0.35, 1.5] },
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
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
const inks = { number: contrast(INK, DISC), ruler: contrast(INK, PAGE) };
for (const [k, c] of Object.entries(inks)) if (c < CONTRAST_MIN) fail(`the ${k}'s ink reaches only ${c}:1`);

// ---- the zones ------------------------------------------------------------------------

// Each zone's colours, the seed's (drawing.colours): the fill, and the shelf's and the Area's band and texture.
const COLOURS = seed.drawing.colours ?? fail('drawing.colours: none');
const HEX = /^#[0-9A-F]{6}$/;
const zones = seed.items.map((item, n) => {
  const c = COLOURS[item.id] ?? fail(`${item.id}: no colour`);
  for (const [k, v] of Object.entries(c)) if (!HEX.test(v)) fail(`${item.id}: colour ${k} is ${v}`);
  return {
    id: item.id,
    numberBn: DIGITS[n + 1],
    nameBn: approved(item.name, `${item.id}.name`),
    fill: c.fill ?? fail(`${item.id}: no fill`),
    ...(c.band ? { band: c.band } : {}),
    ...(c.texture ? { texture: c.texture } : {}),
    sentences: item.sentences.map((s, i) => approved(s, `${item.id}.sentences[${i}]`)),
  };
});
// A name on the picture is the approved name without the bracket that follows it (step 2).
const shortName = (id) => zones.find((z) => z.id === id).nameBn.replace(/\s*\([^)]*\)$/, '');
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
  // The 3D view (step 3); without WebGL it shows the 2D zones view from the same file.
  views: [{ id: 'zones', type: 'zones3d', art: 'zones.json' }],
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
      shelf: shortName('continental-shelf'),
    },
    // The 3D view's words (step 3): the tip under the picture, and each distance bar's label.
    tip: approved(w.tip3d, 'words.tip3d'),
    distances: Object.fromEntries(SCENE.bars.map(([id]) => [id, approved(d.distanceLabels?.[id], `drawing.distanceLabels.${id}`)])),
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
  bars: BARS,
  text: TEXT,
  scene: SCENE,
  ink: INK,
  disc: DISC,
  ticks: d.ticksNm.map((nm, i) => ({ u: { 0: U.base, 12: U.u12, 24: U.u24, 200: U.u200 }[nm], label: approved(d.tickLabels[i], `drawing.tickLabels[${i}]`) })),
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'descriptor.json'), json(descriptor));
fs.writeFileSync(path.join(OUT, 'data.json'), json(data));
fs.writeFileSync(path.join(OUT, 'zones.json'), json(model));
console.log(`wrote ${path.relative(ROOT, OUT) || OUT}: descriptor.json, data.json, zones.json — ${zones.length} zones; ink contrast: numbers ${inks.number}, ruler ${inks.ruler}`);
