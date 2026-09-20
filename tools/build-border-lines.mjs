// Builds data-sources/border-lines/ — the data the border-lines map will need,
// where selecting a line highlights the countries it separates.
//
//   lines.geojson         traces only, each keyed by a stable line id
//   lines.seed.json       a STARTING POINT for authored records, not records
//   countries.geojson     polygons for the countries the lines name
//   countries.seed.json   id, nameEn, nameBn for those countries
//
// Nothing here is served. It moves into the served tree when the map is built.
//
// Tracing is shared with build-straits-overlay.mjs via lib/border-traces.mjs,
// so the two builds cannot disagree about what a named line is.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSource } from './lib/geo.mjs';
import { loadBoundarySources, traceRuns, joinRuns, simplifyFeatures, innerPoints, labelAnchor, matchesCodes } from './lib/border-traces.mjs';

const ROOT = path.resolve('..');
// Where the authored line list lives today. It is the straits map's file for
// historical reasons; the border lines are no longer that map's concern, and
// this is the only thing still read from there.
const LINES_SOURCE = path.join(ROOT, 'docs/international/straits/data.js');
// Everything this script writes. Not served. Change here if it moves.
const OUT_DIR = path.join(ROOT, 'data-sources/border-lines');

// Traces are viewed at world-to-regional zooms; 250 m is well below what shows.
const LINE_SIMPLIFY_METRES = 250;
// Country polygons are whole-country shapes shown at world scale, and they ship
// to students on low-end phones, so they are simplified much harder than the
// lines. 2 km is under two pixels at the basemap's maximum world zoom (z6), and
// these shapes exist only to be washed with a translucent highlight — edge
// precision is invisible at any zoom the map reaches.
const COUNTRY_SIMPLIFY_METRES = 2000;

/*
 * INTERNAL KEYS. Never displayed, permanent once set.
 *
 * FAMOUS_LINES is an array with no key field, and these ids cannot be derived
 * from nameEn ("Line of Control (LoC)" -> loc is a judgement, not a slug), so
 * the mapping is authored here and keyed on nameEn, the only stable handle the
 * source offers.
 *
 * Radcliffe is deliberately one id across two source entries: it is one line
 * with a Punjab sector and a Bengal sector, and the map highlights a list of
 * countries rather than a pair.
 */
const LINE_IDS = {
  'McMahon Line': 'mcmahon',
  'Radcliffe Line (Punjab)': 'radcliffe',
  'Radcliffe Line (Bengal)': 'radcliffe',
  'Durand Line': 'durand',
  'Line of Control (LoC)': 'loc',
  'Korean DMZ (38th Parallel)': 'koreanDmz',
  'Green Line': 'greenLine',
  'Berlin Wall': 'berlinWall',
  '17th Parallel': 'parallel17',
  'Sykes–Picot Line': 'sykesPicot',
};

/*
 * WHICH COUNTRIES EACH LINE RUNS BETWEEN, as ADM0_A3 codes.
 *
 * data.js states these as display names, and a display name is content: the
 * countries file has no "China" (it calls it "People's Republic of China") and
 * no "Israel" at all, so a name-based join silently loses lines. ADM0_A3 is
 * unique across all 248 countries and is carried natively by both boundary-line
 * files as ADM0_A3_L / ADM0_A3_R, so it is the identity here.
 *
 * Every code below was read off the features that data.js's name-based rule
 * already matched — none is typed from memory.
 */
const BETWEEN = {
  'McMahon Line': ['CHN', 'IND'],
  'Radcliffe Line (Punjab)': ['IND', 'PAK'],
  'Radcliffe Line (Bengal)': ['BGD', 'IND'],
  'Durand Line': ['AFG', 'PAK'],
  'Line of Control (LoC)': ['IND', 'PAK'],
  'Korean DMZ (38th Parallel)': ['KOR', 'PRK'],
  'Green Line': ['ISR', 'PSX'],
};

/**
 * The code rule for a line: this table's pair, with everything else about the
 * rule still taken from data.js. Only the country identity changes — the
 * featurecla filter that separates the Radcliffe Line from the Line of Control
 * along the same India/Pakistan pair is carried through untouched, because
 * restating it here would be a second place to get it wrong.
 */
const codeRule = (line) =>
  BETWEEN[line.nameEn] ? { between: BETWEEN[line.nameEn], featurecla: line.match?.featurecla } : null;

/*
 * WHEN A LINE CAME INTO BEING, AND WHEN IT CEASED.
 *
 * Taken from the notes exactly as they read, in Bengali digits. Two fields
 * rather than one "signed" year, because several of these were not signed:
 * the Berlin Wall was built, and ১৯৬১–১৯৮৯ is a span, not a signing date.
 *
 * endedBn is ABSENT on a line still in force — not applicable. establishedBn
 * is null only where no source here carries a year at all, which is the repo's
 * convention for a fact that is real but unverified, and puts it on the
 * pending list rather than inviting a guess.
 *
 * sykesPicot is historical and still has no endedBn, deliberately: the 1916
 * line was never implemented as a border, so there is no date on which it
 * ceased. Absent, not null — settled, not awaiting a decision.
 */
const DATES = {
  mcmahon: { establishedBn: '১৯১৪' },
  radcliffe: { establishedBn: '১৯৪৭' },
  durand: { establishedBn: '১৮৯৩' },
  loc: { establishedBn: null },
  koreanDmz: { establishedBn: '১৯৫৩' },
  greenLine: { establishedBn: '১৯৪৯' },
  berlinWall: { establishedBn: '১৯৬১', endedBn: '১৯৮৯' },
  parallel17: { establishedBn: '১৯৫৪', endedBn: '১৯৭৫' },
  sykesPicot: { establishedBn: '১৯১৬' },
};

/*
 * Values for a merged record that no single source entry can supply, given by
 * the project owner. Only what the merge makes ambiguous is listed; everything
 * else still comes straight out of data.js.
 */
const MERGED = {
  radcliffe: {
    nameEn: 'Radcliffe Line',
    // Three, not a pair: the Punjab sector divides India and Pakistan, the
    // Bengal sector India and Bangladesh.
    countries: ['IND', 'PAK', 'BGD'],
  },
};

/** Decisions left open on purpose, carried into the seed so they stay visible. */
const REVIEW = {
  mcmahon:
    'nameBn spelling undecided: data.js has "ম্যাকমাহন লাইন", the BCS corpus has "ম্যাকমোহন লাইন". Kept as data.js has it; change here and it changes everywhere.',
  radcliffe:
    'noteBn is null because the merge has no source value: the two sectors carry different notes, and merging them is writing new content. The originals are kept verbatim under "sectors".',
};

const { FAMOUS_LINES } = await import(pathToFileURL(LINES_SOURCE).href);
const sourceLines = loadBoundarySources();

// ---- trace every line, grouped by its id -----------------------------------
const byId = new Map(); // id -> { entries: [], traces: [] }
for (const line of FAMOUS_LINES) {
  const id = LINE_IDS[line.nameEn];
  if (!id) throw new Error(`no id mapped for "${line.nameEn}" — add it to LINE_IDS`);

  // The code rule replaces data.js's name-based one. Anything data.js can
  // match but BETWEEN cannot is a gap to report, not to paper over.
  const rule = codeRule(line);
  if (line.match && !rule) throw new Error(`"${line.nameEn}" has a match rule in data.js but no ADM0_A3 pair in BETWEEN`);
  if (rule && !line.match) throw new Error(`"${line.nameEn}" has an ADM0_A3 pair but no match rule in data.js`);

  const traces = [];
  const runsByPov = traceRuns({ match: rule, region: line.region }, sourceLines, matchesCodes);
  for (const [bdPov, runs] of Object.entries(runsByPov))
    for (const run of joinRuns(runs))
      traces.push({
        type: 'Feature',
        // id first: it is the identity. nameEn/nameBn stay because on a merged
        // line they are the only record of which sector a trace came from.
        properties: { id, kind: 'trace', bdPov, nameEn: line.nameEn, nameBn: line.nameBn, status: line.status },
        geometry: { type: 'LineString', coordinates: run },
      });

  if (rule && !traces.length) throw new Error(`${line.nameEn}: ${rule.between.join('/')} found no Natural Earth lines`);

  const rec = byId.get(id) ?? { entries: [], traces: [] };
  rec.entries.push(line);
  rec.traces.push(...traces);
  byId.set(id, rec);
}

/*
 * A hash of each line's MATCHED SOURCE GEOMETRY — the runs as they come out of
 * Natural Earth, clipped to the line's region and joined, but before any
 * simplification.
 *
 * Hashing this rather than the written file is deliberate: changing
 * LINE_SIMPLIFY_METRES is a rendering decision and must not churn all nine
 * hashes, while a Natural Earth boundary moving must. The inputs are pinned and
 * checksum-verified, so these only move when someone bumps the pin — which is
 * exactly the moment to look at whether a line shifted.
 */
const geometryHash = (traces) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(traces.map((t) => t.geometry.coordinates)))
    .digest('hex')
    .slice(0, 16);

const actualGeometry = Object.fromEntries([...byId].map(([id, rec]) => [id, geometryHash(rec.traces)]));

/*
 * Each line's Bangladesh point of view, as a literal rather than a hash: it is
 * a two-value enum and belongs readable in the source. 'absent' is a line with
 * no traces, which has no point of view at all.
 *
 * A line whose traces disagree comes out as "shown+unrecognized", which matches
 * no expectation and so fails — the right outcome, since the seed stores bdPov
 * as a scalar.
 */
const actualBdPov = Object.fromEntries(
  [...byId].map(([id, rec]) => {
    const povs = [...new Set(rec.traces.map((t) => t.properties.bdPov))].sort();
    return [id, povs.length === 0 ? 'absent' : povs.join('+')];
  }),
);

// Simplify once, across every trace, so a merged line is treated as one line.
const allTraces = await simplifyFeatures([...byId.values()].flatMap((r) => r.traces), LINE_SIMPLIFY_METRES);
const tracesById = new Map();
for (const t of allTraces) {
  const list = tracesById.get(t.properties.id) ?? [];
  list.push(t);
  tracesById.set(t.properties.id, list);
}

/*
 * HOW MANY TRACES EACH LINE MUST HAVE.
 *
 * radcliffe's Punjab sector and loc are both IND/PAK: the only thing telling
 * them apart is a featurecla string. Dropping that filter once moved the total
 * from 12 to 13 and shifted loc by three points, and nothing failed — it was
 * caught only because a number was noticed.
 *
 * A Natural Earth reclassification would merge or swap two lines just as
 * quietly. These counts are the tripwire.
 */
/*
 * The same tripwire for shape rather than count. A boundary can move without
 * changing how many segments it splits into, and the counts alone would not
 * see it. These are hashes of the matched source geometry before
 * simplification, so changing LINE_SIMPLIFY_METRES does not churn them.
 */
const EXPECTED_GEOMETRY = {
  mcmahon: 'b04c9ebd196339a4',
  radcliffe: '31f258d1964cedc1',
  durand: '151646968f622957',
  loc: 'f63ad8a7647f8c65',
  koreanDmz: 'a48d0bd366b5d4cf',
  greenLine: 'c612db704d988b09',
  // The three lines that trace nothing all hash the empty list, which is the
  // same value on purpose: it moves the moment any of them gains geometry.
  berlinWall: '4f53cda18c2baa0c',
  parallel17: '4f53cda18c2baa0c',
  sykesPicot: '4f53cda18c2baa0c',
};

/*
 * The third pin, and the last silent hole. bdPov is derived from Natural
 * Earth's FCLASS_BD, so a pin bump could flip a line from recognised to
 * unrecognised without moving a coordinate or changing a segment count, and
 * neither of the other two checks would see it.
 *
 * Kept separate from the geometry hash rather than folded in, so that "the line
 * moved" and "the classification changed" stay distinguishable — they call for
 * different responses — and so the geometry hashes keep meaning exactly what
 * their name says.
 *
 * status, nameEn and nameBn need no pin: they are authored in data.js and
 * cannot change under the build.
 */
const EXPECTED_BDPOV = {
  mcmahon: 'shown',
  radcliffe: 'shown',
  durand: 'shown',
  loc: 'shown',
  koreanDmz: 'shown',
  greenLine: 'unrecognized',
  // No traces, so no point of view. If one ever gains geometry this fires, and
  // its empty-geometry hash moves in the same run.
  berlinWall: 'absent',
  parallel17: 'absent',
  sykesPicot: 'absent',
};

const EXPECTED_TRACES = {
  mcmahon: 2,
  radcliffe: 3,
  durand: 1,
  loc: 1,
  koreanDmz: 1,
  greenLine: 4,
  berlinWall: 0,
  parallel17: 0,
  sykesPicot: 0,
};

const driftErrors = [];
for (const [id, expected] of Object.entries(EXPECTED_TRACES)) {
  const actual = (tracesById.get(id) ?? []).length;
  if (actual !== expected) driftErrors.push(`${id}: expected ${expected} trace(s), got ${actual}`);
}
for (const id of tracesById.keys())
  if (!(id in EXPECTED_TRACES)) driftErrors.push(`${id}: traced but has no entry in EXPECTED_TRACES`);
const expectedTotal = Object.values(EXPECTED_TRACES).reduce((a, b) => a + b, 0);
if (allTraces.length !== expectedTotal)
  driftErrors.push(`total: expected ${expectedTotal} trace(s), got ${allTraces.length}`);
// A line can keep its segment count and still be reshaped, which the counts
// alone would not see.
for (const [id, expected] of Object.entries(EXPECTED_GEOMETRY)) {
  const actual = actualGeometry[id];
  if (actual === undefined) driftErrors.push(`${id}: in EXPECTED_GEOMETRY but the build produced no such line`);
  else if (actual !== expected) driftErrors.push(`${id}: expected geometry ${expected}, got ${actual}`);
}
for (const id of Object.keys(actualGeometry))
  if (!(id in EXPECTED_GEOMETRY)) driftErrors.push(`${id}: traced but has no entry in EXPECTED_GEOMETRY`);

// A reclassification moves neither a coordinate nor a count.
for (const [id, expected] of Object.entries(EXPECTED_BDPOV)) {
  const actual = actualBdPov[id];
  if (actual === undefined) driftErrors.push(`${id}: in EXPECTED_BDPOV but the build produced no such line`);
  else if (actual !== expected) driftErrors.push(`${id}: expected bdPov ${expected}, got ${actual}`);
}
for (const id of Object.keys(actualBdPov))
  if (!(id in EXPECTED_BDPOV)) driftErrors.push(`${id}: built but has no entry in EXPECTED_BDPOV`);

if (driftErrors.length)
  throw new Error(`the source data or a match rule moved under this build:\n  ${driftErrors.join('\n  ')}`);

/**
 * The merged line's Bengali name: the sector names with the parenthetical
 * dropped. A stem of strings that already exist, not new content — and if the
 * sectors ever disagree on the stem this fails rather than picking one.
 */
function mergedNameBn(entries) {
  const stems = [...new Set(entries.map((e) => e.nameBn.replace(/\s*\(.*\)\s*$/, '')))];
  if (stems.length !== 1) throw new Error(`sectors disagree on the merged nameBn stem: ${stems.join(' / ')}`);
  return stems[0];
}

// ---- lines.seed.json --------------------------------------------------------
const seed = {};
for (const [id, rec] of byId) {
  const traces = tracesById.get(id) ?? [];
  const merged = MERGED[id];
  const single = rec.entries.length === 1 ? rec.entries[0] : null;

  const povs = [...new Set(traces.map((t) => t.properties.bdPov))];
  const statuses = [...new Set(rec.entries.map((e) => e.status))];
  if (statuses.length > 1) throw new Error(`${id}: merged entries disagree on status (${statuses.join(', ')})`);

  seed[id] = {
    id,
    nameEn: merged?.nameEn ?? single.nameEn,
    // null means "no source value", the repo's convention for a fact that is
    // real but not yet settled. Never a guess, never a derived string.
    nameBn: single ? single.nameBn : mergedNameBn(rec.entries),
    status: statuses[0],
    countries: merged?.countries ?? (BETWEEN[single.nameEn] ? [...BETWEEN[single.nameEn]] : []),
    labelAt: labelAnchor(traces, single ? single.coords : null),
    noteBn: single ? single.note : null,
    hasTrace: traces.length > 0,
  };
  // establishedBn is always present, value or null. endedBn only where the line
  // ceased: absent means not applicable, which is not the same as unverified.
  const dates = DATES[id];
  if (!dates) throw new Error(`${id}: no entry in DATES`);
  seed[id].establishedBn = dates.establishedBn;
  if ('endedBn' in dates) seed[id].endedBn = dates.endedBn;
  // bdPov describes traces, so a line with none simply has no bdPov: absent,
  // not null. Null would put it on the pending list as if a decision were
  // owed, and none is.
  if (povs.length === 1) seed[id].bdPov = povs[0];
  else if (povs.length > 1) throw new Error(`${id}: traces disagree on bdPov (${povs.join(', ')})`);

  if (REVIEW[id]) seed[id].review = REVIEW[id];
  if (!single)
    seed[id].sectors = rec.entries.map((e) => ({
      nameEn: e.nameEn,
      nameBn: e.nameBn,
      noteBn: e.note,
      labelAt: e.coords,
      countries: BETWEEN[e.nameEn] ? [...BETWEEN[e.nameEn]] : [],
    }));
}

// ---- countries --------------------------------------------------------------
const wanted = [...new Set(Object.values(seed).flatMap((r) => r.countries))].sort();
const countriesFc = readSource('ne_10m_admin_0_countries_bdg.geojson');
// NAME_EN / NAME_BN / ADM0_A3 are the same fields build-world.mjs reads for
// country_labels, so the two cannot disagree on a country's Bengali name.
const byCode = new Map(countriesFc.features.map((f) => [f.properties.ADM0_A3, f]));

const resolved = [];
const unresolved = [];
for (const code of wanted) {
  const f = byCode.get(code);
  if (f) resolved.push({ code, feature: f });
  else unresolved.push(code);
}

const countryFeatures = await simplifyFeatures(
  resolved.map(({ feature }) => ({
    type: 'Feature',
    properties: { id: feature.properties.ADM0_A3 },
    geometry: feature.geometry,
  })),
  COUNTRY_SIMPLIFY_METRES,
);

// One label point per country, from the simplified polygon rather than from a
// hand-placed guess — see innerPoints for why it is a pole of inaccessibility.
const countryLabelPoints = await innerPoints(countryFeatures);

const countrySeed = {};
for (const { feature } of resolved) {
  const p = feature.properties;
  countrySeed[p.ADM0_A3] = {
    id: p.ADM0_A3,
    nameEn: p.NAME_EN,
    nameBn: p.NAME_BN,
    labelAt: countryLabelPoints[p.ADM0_A3],
  };
}

// ---- write ------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
const write = (name, data) => {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, JSON.stringify(data, null, name.endsWith('.seed.json') ? 2 : 0) + '\n');
  return `${name}: ${(fs.statSync(file).size / 1024).toFixed(1)} KB`;
};

const sizes = [
  write('lines.geojson', { type: 'FeatureCollection', features: allTraces }),
  write('lines.seed.json', seed),
  write('countries.geojson', { type: 'FeatureCollection', features: countryFeatures }),
  write('countries.seed.json', countrySeed),
];

// ---- report -----------------------------------------------------------------
console.log('wrote data-sources/border-lines/');
sizes.forEach((s) => console.log('  ' + s));

console.log(`\nrecords: ${Object.keys(seed).length}   traces: ${allTraces.length}`);
for (const [id, r] of Object.entries(seed))
  console.log(
    `  ${id.padEnd(12)}${String((tracesById.get(id) ?? []).length).padStart(2)} trace(s)  hasTrace ${String(r.hasTrace).padEnd(6)}${r.countries.length ? r.countries.join(' / ') : '(no countries — no match rule)'}`,
  );

console.log(`\ncountries wanted: ${wanted.length}   resolved: ${resolved.length}   unresolved: ${unresolved.length}`);
for (const code of unresolved) {
  // Reported, never substituted. A code with no polygon is a fact about the
  // Bangladesh point-of-view file, not a typo to correct.
  const elsewhere = countriesFc.features
    .filter((f) => Object.entries(f.properties).some(([k, v]) => /A3/.test(k) && v === code))
    .map((f) => `${JSON.stringify(f.properties.NAME_EN)} (ADM0_A3 ${f.properties.ADM0_A3})`);
  console.log(
    `  UNRESOLVED ${code} — ${elsewhere.length ? "appears only as another country's alternate code: " + elsewhere.join('; ') : 'no feature in the file carries this code in any A3 field'}`,
  );
}

// ---- the pending list -------------------------------------------------------
// Every null field: real, but not yet settled. Absent fields are not listed,
// because absent means not applicable rather than unverified.
console.log('\nPENDING (null = unverified, needs a decision):');
let pending = 0;
for (const [id, r] of Object.entries(seed))
  for (const [k, v] of Object.entries(r))
    if (v === null) {
      console.log(`  ${id}.${k}`);
      pending++;
    }
console.log(`  total pending: ${pending}`);
