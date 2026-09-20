// Builds data-sources/famous-lines.geojson: the real boundary segments that carry
// a famous name (McMahon Line, Radcliffe Line…), plus one label point each.
//
// The tracing itself lives in lib/border-traces.mjs, shared with
// build-border-lines.mjs so the two builds cannot disagree about what a named
// line is. This script is the straits map's own overlay; the border-lines map
// has its own outputs and its own keys.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBoundarySources, traceRuns, joinRuns, simplifyFeatures, labelAnchor } from './lib/border-traces.mjs';

// The straits map's folder inside the served tree, relative to the repo root.
// Change here if the map moves.
const STRAITS_DIR = path.resolve('..', 'docs/international/straits');
// Where famous-lines.geojson is written. No map draws it, so it is kept out of
// the served tree rather than published for nothing. Change here if it moves.
const OUT_DIR = path.resolve('..', 'data-sources');
const { FAMOUS_LINES } = await import(pathToFileURL(path.join(STRAITS_DIR, 'data.js')).href);
const SIMPLIFY_METRES = 250; // well below what shows at the zooms these lines are viewed at

const sourceLines = loadBoundarySources();

const features = [];
const report = [];
for (const line of FAMOUS_LINES) {
  const base = { nameEn: line.nameEn, nameBn: line.nameBn, status: line.status };
  let traces = [];
  if (line.match) {
    const runsByPov = traceRuns(line, sourceLines);
    for (const [bdPov, runs] of Object.entries(runsByPov))
      for (const run of joinRuns(runs))
        traces.push({ type: 'Feature', properties: { kind: 'trace', bdPov, ...base }, geometry: { type: 'LineString', coordinates: run } });
    traces = await simplifyFeatures(traces, SIMPLIFY_METRES);
  }
  features.push(...traces);

  // Label: middle of the longest traced run, else the hand-placed point.
  features.push({
    type: 'Feature',
    properties: { kind: 'label', ...base, note: line.note },
    geometry: { type: 'Point', coordinates: labelAnchor(traces, line.coords) },
  });

  const hidden = traces.filter((t) => t.properties.bdPov === 'unrecognized').length;
  report.push(`${line.nameEn}: ${!line.match ? 'reference point only' : `${traces.length} segment(s)${hidden ? `, ${hidden} not shown in Bangladesh POV basemap` : ''}`}`);
  if (line.match && !traces.length) throw new Error(`${line.nameEn}: match found no Natural Earth lines — check data.js`);
}

const out = path.join(OUT_DIR, 'famous-lines.geojson');
fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
console.log(`famous-lines.geojson: ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
report.forEach((r) => console.log('  ' + r));
