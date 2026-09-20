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
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSource } from './lib/geo.mjs';
import { loadBoundarySources, traceRuns, joinRuns, simplifyFeatures, labelAnchor } from './lib/border-traces.mjs';

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
// lines. 1 km is under two pixels at the basemap's maximum world zoom (z6).
const COUNTRY_SIMPLIFY_METRES = 1000;

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
 * Values for a merged record that no single source entry can supply, given by
 * the project owner. Only what the merge makes ambiguous is listed; everything
 * else still comes straight out of data.js.
 */
const MERGED = {
  radcliffe: {
    nameEn: 'Radcliffe Line',
    // Three, not a pair: the Punjab sector divides India and Pakistan, the
    // Bengal sector India and Bangladesh.
    countries: ['India', 'Pakistan', 'Bangladesh'],
  },
};

/** Decisions left open on purpose, carried into the seed so they stay visible. */
const REVIEW = {
  mcmahon:
    'nameBn spelling undecided: data.js has "ম্যাকমাহন লাইন", the BCS corpus has "ম্যাকমোহন লাইন". Kept as data.js has it; change here and it changes everywhere.',
  radcliffe:
    'nameBn and noteBn are null because the merge has no source value: the two source entries carry different names and different notes, and no merged Bengali name exists in any source. Author them, or pick one sector\'s. The originals are kept verbatim under "sectors".',
};

const { FAMOUS_LINES } = await import(pathToFileURL(LINES_SOURCE).href);
const sourceLines = loadBoundarySources();

// ---- trace every line, grouped by its id -----------------------------------
const byId = new Map(); // id -> { entries: [], traces: [] }
for (const line of FAMOUS_LINES) {
  const id = LINE_IDS[line.nameEn];
  if (!id) throw new Error(`no id mapped for "${line.nameEn}" — add it to LINE_IDS`);

  const traces = [];
  const runsByPov = traceRuns(line, sourceLines);
  for (const [bdPov, runs] of Object.entries(runsByPov))
    for (const run of joinRuns(runs))
      traces.push({
        type: 'Feature',
        // id first: it is the identity. nameEn/nameBn stay because on a merged
        // line they are the only record of which sector a trace came from.
        properties: { id, kind: 'trace', bdPov, nameEn: line.nameEn, nameBn: line.nameBn, status: line.status },
        geometry: { type: 'LineString', coordinates: run },
      });

  if (line.match && !traces.length) throw new Error(`${line.nameEn}: match found no Natural Earth lines — check data.js`);

  const rec = byId.get(id) ?? { entries: [], traces: [] };
  rec.entries.push(line);
  rec.traces.push(...traces);
  byId.set(id, rec);
}

// Simplify once, across every trace, so a merged line is treated as one line.
const allTraces = await simplifyFeatures([...byId.values()].flatMap((r) => r.traces), LINE_SIMPLIFY_METRES);
const tracesById = new Map();
for (const t of allTraces) {
  const list = tracesById.get(t.properties.id) ?? [];
  list.push(t);
  tracesById.set(t.properties.id, list);
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
    nameBn: single ? single.nameBn : null,
    status: statuses[0],
    bdPov: povs.length === 0 ? null : povs.length === 1 ? povs[0] : povs,
    countries: merged?.countries ?? (single.match ? [...single.match.between] : []),
    labelAt: labelAnchor(traces, single ? single.coords : null),
    noteBn: single ? single.note : null,
    hasTrace: traces.length > 0,
  };
  if (REVIEW[id]) seed[id].review = REVIEW[id];
  if (!single)
    seed[id].sectors = rec.entries.map((e) => ({
      nameEn: e.nameEn,
      nameBn: e.nameBn,
      noteBn: e.note,
      labelAt: e.coords,
      countries: e.match ? [...e.match.between] : [],
    }));
}

// ---- countries --------------------------------------------------------------
const wanted = [...new Set(Object.values(seed).flatMap((r) => r.countries))].sort();
const countriesFc = readSource('ne_10m_admin_0_countries_bdg.geojson');
// NAME_EN / NAME_BN / ADM0_A3 are the same fields build-world.mjs reads for
// country_labels, so the two cannot disagree on a country's Bengali name.
const byName = new Map(countriesFc.features.map((f) => [f.properties.NAME_EN, f]));

const resolved = [];
const unresolved = [];
for (const name of wanted) {
  const f = byName.get(name);
  if (f) resolved.push({ name, feature: f });
  else unresolved.push(name);
}

const countryFeatures = await simplifyFeatures(
  resolved.map(({ feature }) => ({
    type: 'Feature',
    properties: { id: feature.properties.ADM0_A3 },
    geometry: feature.geometry,
  })),
  COUNTRY_SIMPLIFY_METRES,
);

const countrySeed = {};
for (const { feature } of resolved) {
  const p = feature.properties;
  countrySeed[p.ADM0_A3] = { id: p.ADM0_A3, nameEn: p.NAME_EN, nameBn: p.NAME_BN };
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
for (const name of unresolved) {
  // A near match is reported, never substituted: the file calling China
  // something else is a fact about the source, not a typo to fix.
  const near = countriesFc.features
    .filter((f) => String(f.properties.NAME_EN).toLowerCase().includes(name.toLowerCase()))
    .map((f) => `${JSON.stringify(f.properties.NAME_EN)} (${f.properties.ADM0_A3}, ${f.properties.NAME_BN})`);
  console.log(`  UNRESOLVED ${name} — ${near.length ? 'file calls it ' + near.join('; ') : 'no near match in the file at all'}`);
}
