// Builds the atmosphere-layers diagram's folder — its data, the exploded view's
// art and the art's manifest — from the approved seed, the descriptor authored
// in that folder, and the art tool's staging folder
// (tools/build-diagram-atmosphere-art.mjs, run first).
//
//   node tools/build-diagram-atmosphere-layers.mjs             into docs/diagrams/atmosphere-layers/
//   node tools/build-diagram-atmosphere-layers.mjs <out-dir>   into another copy of that folder,
//                                                              as tools/preview.mjs --build does
//
// The folder is the build's but for descriptor.json, which is authored there
// as a map's is and only read: everything else in it is removed and written
// again, so a file the build no longer makes does not linger.
//
// data.json is the seed's content with its provenance left out: no `review`,
// no `sources`. A height ships as the seed gives it, under one name — km in
// `fromKm`, `toKm` or `atKm`, or [least, greatest] where the seed gives a
// range instead (`fromKmRange`, `toKmRange`, `atKmRange`: the tropopause,
// 6–20 km). Where two records meet — a layer and the one below it, a pause
// and the layers either side, a profile point and its pause — their heights
// must agree, or the build stops. The Earth's boundary is the first layer's
// foot, the one above the stack the last layer's top. A pending null stays
// null, and the page hides it. The build prints the pending list.
//
// No network, ever: every input is a local file.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The approved seed, the art tool's staging folder with the manifest, and the
// diagram's own folder in the served tree, where its descriptor is authored.
const SEED_DIR = path.join(ROOT, 'data-sources/atmosphere-layers');
const SEED = path.join(SEED_DIR, 'atmosphere.seed.json');
const ART = path.join(SEED_DIR, 'build');
const DIAGRAM_DIR = path.join(ROOT, 'docs/diagrams/atmosphere-layers');
// Authored in the diagram's folder, never written by the build.
const DESCRIPTOR_FILE = 'descriptor.json';

// The Earth under the stack: a place in the art, not a layer of the seed.
const GROUND = 'earth';
// A profile point stands at a boundary: one of the seed's boundary ids, or one
// of these, which name the boundary by the layers it lies between.
const PROFILE_AT = { surface: [GROUND, 'troposphere'], 'thermosphere top': ['thermosphere', 'exosphere'] };

const problems = [];
const fail = (why) => problems.push(why);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const OUT = path.resolve(process.argv[2] ?? DIAGRAM_DIR);
if (!fs.existsSync(path.join(OUT, DESCRIPTOR_FILE))) {
  console.error(`no ${DESCRIPTOR_FILE} in ${OUT}: the build writes into a diagram folder whose descriptor is already there`);
  process.exit(2);
}

const seed = readJson(SEED);
const descriptor = readJson(path.join(OUT, DESCRIPTOR_FILE));
const manifest = readJson(path.join(ART, 'manifest.json'));

// ---- the art is the art the seed approved -----------------------------------------------

for (const [file, sha] of Object.entries(seed.art.files)) {
  if (manifest.inputs[file] !== sha) fail(`the art build is stale: manifest has ${file} ${manifest.inputs[file] ?? '(none)'}, the seed ${sha} — run tools/build-diagram-atmosphere-art.mjs`);
}
for (const file of Object.keys(manifest.inputs)) if (!(file in seed.art.files)) fail(`the manifest was built from ${file}, which the seed does not list`);
const artFiles = [
  ...Object.values(manifest.view.files),
  ...manifest.slabs.flatMap((s) => Object.values(s.files)),
  ...manifest.icons.flatMap((i) => Object.values(i.files)),
];
for (const file of artFiles) if (!fs.existsSync(path.join(ART, file))) fail(`the manifest names ${file}, which the art build did not write`);

// ---- the descriptor ---------------------------------------------------------------------

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (n) => String(n).replace(/[0-9]/g, (d) => BN_DIGITS[d]);
if (descriptor.id !== 'atmosphere-layers') fail(`descriptor id "${descriptor.id}"`);
if (descriptor.language !== 'bn') fail(`descriptor language "${descriptor.language}" — this diagram is in Bengali`);
for (const word of ['close', 'unit', 'spanJoin', 'curve', 'scale', 'hint', 'altitude', 'temperature', 'happens', 'chip', 'loadFailed', 'loadAdvice']) {
  if (typeof descriptor.words?.[word] !== 'string' || !descriptor.words[word]) fail(`descriptor.words.${word} is missing`);
}
if (!descriptor.words?.chip?.includes('{n}')) fail('descriptor.words.chip has no {n} for the layer number');
const exploded = descriptor.views?.find((v) => v.type === 'exploded');
if (!exploded) fail('descriptor declares no exploded view');
else if (exploded.art !== 'manifest.json') fail(`the exploded view's art is "${exploded.art}", not manifest.json`);
if (descriptor.data !== 'data.json') fail(`descriptor.data is "${descriptor.data}", not data.json`);

// ---- layers, bottom to top, as the art stacks them --------------------------------------

const layers = Object.values(seed.layers).sort((a, b) => a.order - b.order);
const slabIds = manifest.slabs.map((s) => s.id);
if (layers.map((l) => l.id).join() !== slabIds.join()) fail(`the seed's layers ${layers.map((l) => l.id)} are not the art's slabs ${slabIds}`);
layers.forEach((l, n) => {
  if (l.order !== n + 1) fail(`${l.id}: order ${l.order}, expected ${n + 1}`);
  const chip = descriptor.words.chip.replace('{n}', bn(l.order));
  if (l.orderBn !== chip) fail(`${l.id}: the seed's orderBn "${l.orderBn}" is not the descriptor's chip "${chip}"`);
  if (!descriptor.colours?.chips?.[l.id]) fail(`${l.id}: descriptor.colours.chips has no colour`);
});

// Every field a seed layer may have: shipped as it stands, shipped as a
// height, or left out for a reason. Any other stops the build, so new
// content never vanishes on its way to the page.
const LAYER_FIELDS = {
  shipped: ['id', 'order', 'nameBn', 'trendBn', 'rateBn', 'noteBn', 'featureIds'],
  heights: ['fromKm', 'fromKmRange', 'toKm', 'toKmRange'],
  // provenance; the English name (the page is Bengali); orderBn, checked
  // against the descriptor's chip above; the temperatures, which the curve
  // takes from the profile; and the troposphere's top by latitude, kept in
  // the seed for the cross-section view, which is not built yet
  left: ['sources', 'review', 'nameEn', 'orderBn', 'tempFromC', 'tempToC', 'toKmByLatitude'],
};
for (const l of layers) {
  const known = Object.values(LAYER_FIELDS).flat();
  for (const field of Object.keys(l)) if (!known.includes(field)) fail(`${l.id}.${field} is a field the build does not know — ship it or leave it out, in LAYER_FIELDS`);
}

/**
 * A height as the seed gives it: `name` in km (null while pending), or
 * `nameRange`, [least, greatest] in km, where the seed gives a range — one or
 * the other, never both. undefined where the record gives neither.
 */
function height(record, name, where) {
  const range = `${name}Range`;
  if (name in record && range in record) fail(`${where} gives both ${name} and ${range}`);
  if (range in record) {
    const r = record[range];
    if (!Array.isArray(r) || r.length !== 2 || !r.every((v) => typeof v === 'number') || !(r[0] < r[1])) fail(`${where}.${range} is not [least, greatest] in km: ${JSON.stringify(r)}`);
    return r;
  }
  if (!(name in record)) return undefined;
  if (record[name] !== null && typeof record[name] !== 'number') fail(`${where}.${name} is neither km nor null: ${JSON.stringify(record[name])}`);
  return record[name];
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const km = (v) => (Array.isArray(v) ? `${v[0]}–${v[1]} km` : `${v} km`);

const shownLayers = [];
for (const l of layers) {
  const fromKm = height(l, 'fromKm', l.id);
  const toKm = height(l, 'toKm', l.id);
  if (fromKm === undefined || toKm === undefined) fail(`${l.id} has no ${fromKm === undefined ? 'foot' : 'top'}`);
  // A layer starts where the one below it ends, a range where that is one.
  const below = shownLayers.at(-1);
  if (below && fromKm !== null && below.toKm !== null && !same(fromKm, below.toKm)) fail(`${l.id} starts at ${km(fromKm)}, but ${below.id} ends at ${km(below.toKm)}`);
  // Absent stays absent and null stays null: the page shows neither.
  const own = Object.fromEntries(LAYER_FIELDS.shipped.filter((k) => k in l).map((k) => [k, l[k]]));
  shownLayers.push({ ...own, fromKm, toKm });
}

// ---- boundaries, as the art has them: the Earth's, the four pauses, the top ------------

const seedBoundaries = Object.values(seed.boundaries);
const boundaries = manifest.boundaries.map((b) => {
  const [under, over] = b.between;
  const lower = shownLayers.find((l) => l.id === under);
  const upper = shownLayers.find((l) => l.id === over);
  const own = seedBoundaries.find((s) => same(s.between, b.between));
  if (b.id !== (own?.id ?? null)) fail(`the art's boundary ${b.between} is "${b.id}", the seed's "${own?.id ?? null}"`);
  // At the Earth, the foot of the first layer; above the last, its top; a
  // pause as the seed gives it, where the layers either side of it meet.
  const atKm = under === GROUND ? upper.fromKm : !over ? lower.toKm : own ? height(own, 'atKm', own.id) : undefined;
  if (atKm === undefined) fail(`the boundary between ${b.between.join(' and ')} has no height`);
  else if (atKm !== null && own) {
    if (lower.toKm !== null && !same(atKm, lower.toKm)) fail(`${own.id} at ${km(atKm)}, but ${lower.id} ends at ${km(lower.toKm)}`);
    if (upper.fromKm !== null && !same(atKm, upper.fromKm)) fail(`${own.id} at ${km(atKm)}, but ${upper.id} starts at ${km(upper.fromKm)}`);
  }
  return { id: b.id, between: b.between, atKm };
});
for (const s of seedBoundaries) if (!boundaries.some((b) => b.id === s.id)) fail(`the seed's boundary ${s.id} is not in the art`);

// ---- features ---------------------------------------------------------------------------

const icons = new Set(manifest.icons.map((i) => i.id));
const features = {};
for (const l of layers) {
  for (const id of l.featureIds) {
    const f = seed.features[id];
    if (!f) fail(`${l.id} lists feature ${id}, which the seed does not have`);
    else if (f.layer !== l.id) fail(`${l.id} lists ${id}, whose layer is ${f.layer}`);
    if (!icons.has(id)) fail(`feature ${id} has no icon in the art`);
    if (!f) continue;
    const [fromKm, toKm] = [height(f, 'fromKm', id), height(f, 'toKm', id)];
    features[id] = { nameBn: f.nameBn, ...(fromKm !== undefined ? { fromKm } : {}), ...(toKm !== undefined ? { toKm } : {}) };
  }
}
for (const id of Object.keys(seed.features)) if (!features[id]) fail(`feature ${id} is in no layer's list`);

// ---- the temperature profile, each point at a boundary ----------------------------------

const profile = seed.profile.points.map((p) => {
  const between = PROFILE_AT[p.at];
  const index = between ? boundaries.findIndex((b) => same(b.between, between)) : boundaries.findIndex((b) => b.id === p.at);
  const atKm = height(p, 'atKm', `profile point "${p.at}"`);
  if (index < 0) fail(`profile point "${p.at}" stands at no boundary of the art`);
  else if (atKm !== undefined && atKm !== null && boundaries[index].atKm !== null && !same(atKm, boundaries[index].atKm)) fail(`profile point "${p.at}" at ${km(atKm)}, its boundary at ${km(boundaries[index].atKm)}`);
  if (typeof p.tempC !== 'number') fail(`profile point "${p.at}" has no temperature`);
  return { boundary: index, tempC: p.tempC, ...(p.upTo ? { upTo: true } : {}) };
});
if (profile.some((p, n) => n && p.boundary <= profile[n - 1].boundary)) fail('the profile does not climb the boundaries in order');

// ---- the sources, for ⓘ: each once, in the order first cited ----------------------------

const credits = [];
const cite = (record) => {
  for (const list of Object.values(record.sources ?? {})) {
    for (const c of list) {
      if (credits.some((k) => k.url === c.url)) continue;
      // The publisher without its note of revision and reading date.
      const by = c.publisher.replace(/\s*\([^)]*\)\s*$/, '');
      credits.push({ title: c.title, by, url: c.url, ...(/[ঀ-৿]/.test(c.title) ? { lang: 'bn' } : {}) });
    }
  }
};
for (const l of layers) cite(l);
for (const b of seedBoundaries) cite(b);
for (const l of layers) for (const id of l.featureIds) if (seed.features[id]) cite(seed.features[id]);
cite(seed.profile);
for (const c of credits) if (!/^https:\/\//.test(c.url)) fail(`source ${c.title} has no https URL`);

// ---- pending: every null in the content, and the descriptor's --------------------------

const pending = [];
const walk = (where, value) => {
  if (value === null) pending.push(where);
  else if (Array.isArray(value)) value.forEach((v, n) => walk(`${where}[${n}]`, v));
  else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) if (k !== 'sources' && k !== 'review') walk(`${where}.${k}`, v);
};
for (const table of ['layers', 'boundaries', 'features']) for (const [id, r] of Object.entries(seed[table])) walk(`${table}.${id}`, r);
seed.profile.points.forEach((p, n) => walk(`profile.points[${n}] (${p.at})`, p));
walk('descriptor.title', descriptor.title);

if (problems.length) {
  console.error(`atmosphere-layers cannot be built:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// ---- write ------------------------------------------------------------------------------

// Everything in the folder but the descriptor is the build's: removed, then written.
for (const entry of fs.readdirSync(OUT)) {
  if (entry !== DESCRIPTOR_FILE) fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
}
fs.copyFileSync(path.join(ART, 'manifest.json'), path.join(OUT, 'manifest.json'));
for (const file of artFiles) {
  fs.mkdirSync(path.dirname(path.join(OUT, file)), { recursive: true });
  fs.copyFileSync(path.join(ART, file), path.join(OUT, file));
}
const data = {
  _about: 'The atmosphere-layers diagram\'s content, bottom to top, from data-sources/atmosphere-layers/atmosphere.seed.json by tools/build-diagram-atmosphere-layers.mjs. A height is km, [least, greatest] where the seed gives a range, or null: pending, not shown. boundaries are the art manifest\'s, in its order; a profile point names its boundary by index.',
  layers: shownLayers,
  boundaries,
  features,
  profile,
  credits,
};
fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(data, null, 1) + '\n');

const size = (f) => fs.statSync(path.join(OUT, f)).size;
console.log(`wrote ${OUT}`);
console.log(`  descriptor.json ${size('descriptor.json')} B, data.json ${size('data.json')} B, manifest.json ${size('manifest.json')} B, ${artFiles.length} images ${artFiles.reduce((n, f) => n + size(f), 0)} B`);
console.log(`  ${shownLayers.length} layers, ${boundaries.length} boundaries, ${Object.keys(features).length} features, ${profile.length} profile points, ${credits.length} sources`);
console.log(`pending: ${pending.length}`);
for (const p of pending) console.log(`  ${p}`);
