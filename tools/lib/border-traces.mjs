// Tracing a named border line onto real Natural Earth boundary segments.
//
// Shared by tools/build-straits-overlay.mjs (the straits map's famous-lines
// overlay) and tools/build-border-lines.mjs (the border-lines map's data), so
// the two cannot drift apart on what "the Durand Line" means.
//
// Lines are picked by the two countries on either side (ADM0_LEFT/ADM0_RIGHT),
// not by "every border inside a box", which used to paint e.g.
// Iran–Afghanistan as part of the Durand Line.
//
// Point of view: a famous line is the subject of the lesson, so it is traced
// even where Bangladesh's point of view drops it from the basemap borders (the
// Green Line). Those segments come back tagged bdPov 'unrecognized' so the
// choice stays visible rather than silently applied.
import mapshaper from 'mapshaper';
import { readSource } from './geo.mjs';

/** The two Natural Earth 1:10m line files a named line can be traced from. */
export function loadBoundarySources() {
  return [
    ...readSource('ne_10m_admin_0_boundary_lines_land.geojson').features,
    ...readSource('ne_10m_admin_0_boundary_lines_disputed_areas.geojson').features,
  ];
}

/** Does this Natural Earth segment sit between the two named countries? */
export const matches = (props, { between, featurecla }) => {
  const pair = [props.ADM0_LEFT, props.ADM0_RIGHT].sort().join('|');
  if (pair !== [...between].sort().join('|')) return false;
  return !featurecla || String(props.FEATURECLA).startsWith(featurecla);
};

// Keep only the runs of real Natural Earth points inside the box. No points
// are invented; a run is split wherever the line leaves the box, so nothing
// is drawn straight across a gap.
export function clipRuns(coords, [minX, minY, maxX, maxY]) {
  const inside = ([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  const runs = [];
  let run = [];
  for (const pt of coords) {
    if (inside(pt)) run.push(pt);
    else {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

// Natural Earth stores one border as many short pieces (the Afghanistan–
// Pakistan line is 70). Join pieces that share an endpoint so each line is a
// few continuous runs: smaller file, and the label lands mid-line.
export function joinRuns(runs) {
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

/** Douglas–Peucker at a metre interval, shapes preserved. */
export async function simplifyFeatures(features, metres) {
  if (!features.length) return features;
  const out = await mapshaper.applyCommands(
    `-i in.json -simplify dp interval=${metres} keep-shapes -o out.json format=geojson geojson-type=FeatureCollection precision=0.00001`,
    { 'in.json': { type: 'FeatureCollection', features } },
  );
  return JSON.parse(out['out.json'].toString()).features;
}

/**
 * The runs that make up one named line, grouped by Bangladesh point of view.
 * Returns { shown: [[pt,…],…], unrecognized: [...] }; both may be empty when a
 * line has no `match` rule (a historical line that follows no modern border).
 *
 * Insertion order matters to the callers' output, so it is fixed here: source
 * order within a group, and `shown` before `unrecognized`.
 */
export function traceRuns(line, sourceLines) {
  const runsByPov = { shown: [], unrecognized: [] };
  if (!line.match) return runsByPov;
  for (const f of sourceLines.filter((f) => matches(f.properties, line.match))) {
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const bdPov = f.properties.FCLASS_BD === 'Unrecognized' ? 'unrecognized' : 'shown';
    for (const part of parts) runsByPov[bdPov].push(...(line.region ? clipRuns(part, line.region) : [part]));
  }
  return runsByPov;
}

/**
 * Where a line's label belongs: the middle of its longest traced run, or the
 * hand-placed point in data.js when nothing was traced.
 */
export function labelAnchor(traces, fallbackCoords) {
  const longest = traces.reduce(
    (a, b) => (b.geometry.coordinates.length > (a?.geometry.coordinates.length || 0) ? b : a),
    null,
  );
  return longest ? longest.geometry.coordinates[Math.floor(longest.geometry.coordinates.length / 2)] : fallbackCoords;
}
