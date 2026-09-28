// Builds the seasons diagram into its folder: the descriptor, the data and
// the art's manifest, from the seed and the art tool's staging folder.
//
//   node tools/build-diagram-seasons.mjs [out]      (out: docs/diagrams/seasons)
//
// From the seed, data-sources/seasons/seasons.seed.json, which it reads and
// never writes, and from data-sources/seasons/build/ (run
// tools/build-diagram-seasons-art.mjs first). All Bengali shown is the
// seed's: the card titles and picker items are its `ui` templates filled with
// each position's date and name; the card's rows follow `ui.rowOrder`, a row
// the position does not have left out; ⓘ shows `ui.creditsBn`. Nothing that
// is provenance — `sources`' citations — is shipped. Everything the diagram
// draws besides its two paintings is drawn by the view (docs/visual/orbit.js)
// from the data's geometry. A second build writes the same bytes.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed, the art tool's staging folder, and where the diagram goes.
const SEED = path.join(ROOT, 'data-sources/seasons/seasons.seed.json');
const STAGING = path.join(ROOT, 'data-sources/seasons/build');
const DEFAULT_OUT = path.join(ROOT, 'docs/diagrams/seasons');

const ID = 'seasons';
const SECTION = 'misc';
// The four placements the view draws, and the order ⓘ's lines stand for.
const PLACEMENTS = ['right', 'top', 'left', 'bottom'];
const CREDIT_SOURCES = [
  ['nctb', /NCTB/],
  ['nasa', /NASA/],
  ['computed', /NOAA/],
];

const OUT = path.resolve(process.argv[2] ?? DEFAULT_OUT);
const fail = (msg) => {
  throw new Error(`seasons: ${msg}`);
};

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const ui = seed.ui;
for (const word of ['pickerPlaceholderBn', 'closeBn', 'sunLabelBn', 'cardTitle', 'pickerItem']) if (!ui?.[word]) fail(`the seed's ui has no ${word}`);
const geometry = seed.geometry;
if (!(geometry?.axisTiltFromVerticalDeg > 0) || !geometry.axisAngleLabelBn) fail('the seed gives no axis tilt and its label');
if (!['anticlockwise', 'clockwise'].includes(geometry.orbitDirection)) fail(`the orbit's direction is "${geometry.orbitDirection}"`);

// ---- the positions ----------------------------------------------------------------------

const fillIn = (template, p) => template.replace(/\{(\w+)\}/g, (_, k) => p[k] ?? fail(`${p.id}: the template asks for ${k}, which it has not`));
const positions = Object.values(seed.positions).sort((a, b) => a.order - b.order);
const placements = positions.map((p) => p.placement);
if ([...placements].sort().join() !== [...PLACEMENTS].sort().join()) fail(`the placements are ${placements.join(', ')}; the view draws one each of ${PLACEMENTS.join(', ')}`);
const shipped = positions.map((p) => {
  for (const [k, v] of Object.entries(p.rows)) {
    if (!ui.rowOrder.includes(k)) fail(`${p.id} has a row ${k} that ui.rowOrder does not place`);
    if (typeof v !== 'string') fail(`${p.id}.${k} is not filled (${JSON.stringify(v).slice(0, 60)})`);
    if (!p.sources?.[k]?.length) fail(`${p.id}.${k} cites nothing`);
  }
  return {
    id: p.id,
    order: p.order,
    placement: p.placement,
    dateBn: p.dateBn,
    nameBn: p.nameBn,
    title: fillIn(ui.cardTitle, p),
    item: fillIn(ui.pickerItem, p),
    rows: Object.fromEntries(ui.rowOrder.filter((k) => p.rows[k] !== undefined).map((k) => [k, p.rows[k]])),
  };
});

// ---- ⓘ: the seed's own lines, each linked to its source where it has one --------------------

if (ui.creditsBn?.length !== CREDIT_SOURCES.length) fail(`ui.creditsBn has ${ui.creditsBn?.length} lines; the build knows ${CREDIT_SOURCES.length}`);
const credits = ui.creditsBn.map((line, i) => {
  const [key, names] = CREDIT_SOURCES[i];
  if (!names.test(line)) fail(`ui.creditsBn[${i}] («${line}») is not the ${key} line`);
  const source = seed.sources[key] ?? fail(`the seed has no source ${key}`);
  return { title: line, ...(source.url ? { url: source.url } : {}), ...(/[ঀ-৿]/.test(line) ? { lang: 'bn' } : {}) };
});

// ---- the art -----------------------------------------------------------------------------

const artFile = path.join(STAGING, 'manifest.json');
if (!fs.existsSync(artFile)) fail('no staged art: run node tools/build-diagram-seasons-art.mjs first');
const art = JSON.parse(fs.readFileSync(artFile, 'utf8'));
for (const [name, pin] of Object.entries(seed.art.files)) if (art.inputs?.[name] !== pin.sha256) fail(`the staged art was cut from another ${name}: run the art tool again`);
const piece = (a) => ({ width: a.width, height: a.height, disc: a.disc, files: a.files });

// ---- the files ------------------------------------------------------------------------------

const json = (v) => JSON.stringify(v, null, 2) + '\n';
const descriptor = {
  id: ID,
  section: SECTION,
  language: 'bn',
  title: { en: seed.titleEn, bn: seed.titleBn },
  data: 'data.json',
  views: [{ id: 'orbit', type: 'orbit', art: 'manifest.json' }],
  // Interface words are data: the seed's, and no others.
  words: {
    picker: ui.pickerPlaceholderBn,
    close: ui.closeBn,
    sun: ui.sunLabelBn,
    tilt: geometry.axisAngleLabelBn,
    rows: ui.rowOrder.map((key) => ({ key, label: ui.rowLabelsBn[key] ?? fail(`ui.rowLabelsBn has no label for ${key}`) })),
  },
};
const data = {
  _about: 'Built by tools/build-diagram-seasons.mjs from data-sources/seasons/seasons.seed.json; do not edit.',
  positions: shipped,
  geometry: { tiltDeg: geometry.axisTiltFromVerticalDeg, orbitDirection: geometry.orbitDirection },
  credits,
};
const manifest = {
  _about: 'Built by tools/build-diagram-seasons.mjs from the art tool\'s staging folder. Sizes in the 1× files\' px; each disc is the painted body\'s, measured on its cut-out.',
  page: art.page,
  sun: piece(art.sun),
  earth: piece(art.earth),
};

fs.mkdirSync(OUT, { recursive: true });
for (const a of [art.sun, art.earth]) for (const f of Object.values(a.files)) fs.copyFileSync(path.join(STAGING, f), path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'descriptor.json'), json(descriptor));
fs.writeFileSync(path.join(OUT, 'data.json'), json(data));
fs.writeFileSync(path.join(OUT, 'manifest.json'), json(manifest));
console.log(`wrote ${path.relative(ROOT, OUT) || OUT}: descriptor.json, data.json, manifest.json and the 4 art files`);
