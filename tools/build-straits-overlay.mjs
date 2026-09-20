// Builds data-sources/famous-lines.geojson: the real boundary segments that carry
// a famous name (McMahon Line, Radcliffe Line…), plus one label point each.
//
// Lines are picked from Natural Earth 1:10m boundary lines by the two
// countries on either side (ADM0_LEFT/ADM0_RIGHT) — not "every border inside
// a box", which used to paint e.g. Iran–Afghanistan as part of the Durand Line.
//
// Point of view: a famous line is the subject of the lesson, so it is traced
// even where Bangladesh's point of view drops it from the basemap borders
// (the Green Line). Such segments get bdPov: 'unrecognized' and are listed
// in the build output, so the choice stays visible.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mapshaper from 'mapshaper';
import { readSource } from './lib/geo.mjs';

// The straits map's folder inside the served tree, relative to the repo root.
// Change here if the map moves.
const STRAITS_DIR = path.resolve('..', 'docs/international/straits');
// Where famous-lines.geojson is written. No map draws it, so it is kept out of
// the served tree rather than published for nothing. Change here if it moves.
const OUT_DIR = path.resolve('..', 'data-sources');
const { FAMOUS_LINES } = await import(pathToFileURL(path.join(STRAITS_DIR, 'data.js')).href);
const SIMPLIFY_METRES = 250; // well below what shows at the zooms these lines are viewed at

const sourceLines = [
  ...readSource('ne_10m_admin_0_boundary_lines_land.geojson').features,
  ...readSource('ne_10m_admin_0_boundary_lines_disputed_areas.geojson').features,
];

const matches = (props, { between, featurecla }) => {
  const pair = [props.ADM0_LEFT, props.ADM0_RIGHT].sort().join('|');
  if (pair !== [...between].sort().join('|')) return false;
  return !featurecla || String(props.FEATURECLA).startsWith(featurecla);
};

// Keep only the runs of real Natural Earth points inside the box. No points
// are invented; a run is split wherever the line leaves the box, so nothing
// is drawn straight across a gap.
function clipRuns(coords, [minX, minY, maxX, maxY]) {
  const inside = ([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  const runs = [];
  let run = [];
  for (const pt of coords) {
    if (inside(pt)) run.push(pt);
    else { if (run.length > 1) runs.push(run); run = []; }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

// Natural Earth stores one border as many short pieces (the Afghanistan–
// Pakistan line is 70). Join pieces that share an endpoint so each line is a
// few continuous runs: smaller file, and the label lands mid-line.
function joinRuns(runs) {
  const key = ([x, y]) => `${x},${y}`;
  const pool = runs.map((r) => r.slice());
  const joined = [];
  while (pool.length) {
    let cur = pool.pop();
    for (let grew = true; grew; ) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const r = pool[i];
        const [cs, ce, rs, re] = [key(cur[0]), key(cur[cur.length - 1]), key(r[0]), key(r[r.length - 1])];
        if (ce === rs) cur = cur.concat(r.slice(1));
        else if (ce === re) cur = cur.concat(r.slice(0, -1).reverse());
        else if (cs === re) cur = r.concat(cur.slice(1));
        else if (cs === rs) cur = r.slice(1).reverse().concat(cur);
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    joined.push(cur);
  }
  return joined;
}

async function simplify(features) {
  if (!features.length) return features;
  const out = await mapshaper.applyCommands(
    `-i in.json -simplify dp interval=${SIMPLIFY_METRES} keep-shapes -o out.json format=geojson geojson-type=FeatureCollection precision=0.00001`,
    { 'in.json': { type: 'FeatureCollection', features } },
  );
  return JSON.parse(out['out.json'].toString()).features;
}

const features = [];
const report = [];
for (const line of FAMOUS_LINES) {
  const base = { nameEn: line.nameEn, nameBn: line.nameBn, status: line.status };
  let traces = [];
  if (line.match) {
    const runsByPov = { shown: [], unrecognized: [] };
    for (const f of sourceLines.filter((f) => matches(f.properties, line.match))) {
      const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const bdPov = f.properties.FCLASS_BD === 'Unrecognized' ? 'unrecognized' : 'shown';
      for (const part of parts) runsByPov[bdPov].push(...(line.region ? clipRuns(part, line.region) : [part]));
    }
    for (const [bdPov, runs] of Object.entries(runsByPov))
      for (const run of joinRuns(runs))
        traces.push({ type: 'Feature', properties: { kind: 'trace', bdPov, ...base }, geometry: { type: 'LineString', coordinates: run } });
    traces = await simplify(traces);
  }
  features.push(...traces);

  // Label: middle of the longest traced run, else the hand-placed point.
  const longest = traces.reduce((a, b) => (b.geometry.coordinates.length > (a?.geometry.coordinates.length || 0) ? b : a), null);
  const anchor = longest ? longest.geometry.coordinates[Math.floor(longest.geometry.coordinates.length / 2)] : line.coords;
  features.push({ type: 'Feature', properties: { kind: 'label', ...base, note: line.note }, geometry: { type: 'Point', coordinates: anchor } });

  const hidden = traces.filter((t) => t.properties.bdPov === 'unrecognized').length;
  report.push(`${line.nameEn}: ${!line.match ? 'reference point only' : `${traces.length} segment(s)${hidden ? `, ${hidden} not shown in Bangladesh POV basemap` : ''}`}`);
  if (line.match && !traces.length) throw new Error(`${line.nameEn}: match found no Natural Earth lines — check data.js`);
}

const out = path.join(OUT_DIR, 'famous-lines.geojson');
fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
console.log(`famous-lines.geojson: ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
report.forEach((r) => console.log('  ' + r));
