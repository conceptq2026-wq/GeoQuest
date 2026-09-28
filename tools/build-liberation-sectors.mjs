// Builds the sector outlines of liberation-war-1971 from the editor's trace
// of the NCTB class-8 sector map (data-sources/liberation-war-1971/sector-trace.json)
// and COD-AB, into data-sources/liberation-war-1971/sectors.geojson.
//
//   node tools/build-liberation-sectors.mjs [--overlay <out.svg>]
//
// No network: its inputs are the trace and the pinned COD-AB zip in tools/.cache.
//
// 1. Georeference. An affine fit, by least squares, from the scan's pixels to
//    longitude/latitude over the trace's control points. The map is drawn
//    equirectangular: the fit is made in plain lon/lat, and a Web Mercator fit
//    is reported beside it for comparison. Both RMS errors are printed in km.
// 2. Snap. Each traced sector line is densified every SAMPLE_KM; wherever it runs
//    within SNAP_KM of an internal COD-AB boundary (an edge two upazilas share —
//    every district boundary is one), that stretch is replaced by the shortest
//    path along those boundaries between where it comes in and goes out,
//    keeping to a corridor SNAP_KM wide about the traced line. Junctions stay
//    where the book puts them.
// 3. Cut. A line that ends on the border ends where it first meets COD-AB's
//    border (walking out from its junction); a line into the sea likewise ends
//    at the coast.
// 4. Faces. The mainland's border and the cut lines form a planar network;
//    each bounded face is one sector, named by the book's label inside it.
//    COD-AB's islands are whole, each given to its district's sector (the
//    trace's `islands` table).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';
import polygonClipping from 'polygon-clipping';
import { CACHE, zipEntry } from './lib/geo.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The map's source folder: the trace in, the outlines out. Change here if it moves.
const DATA = path.join(ROOT, 'data-sources', 'liberation-war-1971');
const TRACE = path.join(DATA, 'sector-trace.json');
const OUT = path.join(DATA, 'sectors.geojson');
const SOURCES = path.join(HERE, 'sources.json');

const SNAP_KM = 5; // the user's rule: within 5 km of a district or upazila boundary, follow it
const SAMPLE_KM = 0.25;
const SIMPLIFY_METRES = 100; // the written outlines; the map build simplifies again for display
const KX = 111.32 * Math.cos((23.7 * Math.PI) / 180); // km per degree of longitude, mid-Bangladesh
const KY = 110.57;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fail = (msg) => {
  throw new Error(`liberation-war-1971 sectors: ${msg}`);
};

// ---- inputs ------------------------------------------------------------------
const trace = JSON.parse(fs.readFileSync(TRACE, 'utf8'));
const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
const zipFile = path.join(CACHE, sources.codAbBangladesh.file);
const zip = fs.readFileSync(zipFile);
if (zip.length !== sources.codAbBangladesh.size || sha256(zip) !== sources.codAbBangladesh.sha256) fail(`${zipFile} does not match its pin in sources.json`);
const a0 = zipEntry(zip, 'bgd_admin0.geojson').features[0].geometry;
const a2 = zipEntry(zip, 'bgd_admin2.geojson').features;
const a3 = zipEntry(zip, 'bgd_admin3.geojson').features;
const parts = (g) => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]);

// ---- 1. georeference ---------------------------------------------------------
function lsq3(rows, rhs) {
  const M = [0, 1, 2].map(() => [0, 0, 0, 0]);
  rows.forEach((r, k) => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) M[i][j] += r[i] * r[j];
      M[i][3] += r[i] * rhs[k];
    }
  });
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    [M[i], M[p]] = [M[p], M[i]];
    for (let k = 0; k < 3; k++) {
      if (k === i) continue;
      const f = M[k][i] / M[i][i];
      for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
    }
  }
  return M.map((r, i) => r[3] / r[i]);
}
const kmBetween = (a, b) => {
  const t = Math.PI / 180;
  const h = Math.sin(((b[1] - a[1]) * t) / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(((b[0] - a[0]) * t) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
};
const MODELS = {
  equirectangular: { fwd: (ll) => ll, inv: (p) => p },
  webMercator: {
    fwd: ([lon, lat]) => [lon, (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI],
    inv: ([x, y]) => [x, ((2 * Math.atan(Math.exp((y * Math.PI) / 180)) - Math.PI / 2) * 180) / Math.PI],
  },
};
function fitModel(model, cps) {
  const rows = cps.map((c) => [c.px[0], c.px[1], 1]);
  const X = lsq3(rows, cps.map((c) => model.fwd(c.ll)[0]));
  const Y = lsq3(rows, cps.map((c) => model.fwd(c.ll)[1]));
  const toLL = ([x, y]) => model.inv([X[0] * x + X[1] * y + X[2], Y[0] * x + Y[1] * y + Y[2]]);
  const residuals = cps.map((c) => ({ id: c.id, km: kmBetween(toLL(c.px), c.ll) }));
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r.km ** 2, 0) / residuals.length);
  return { toLL, residuals, rms, X, Y };
}
const cps = trace.controlPoints;
if (cps.length < 8) fail(`${cps.length} control points; the user asked for at least 8`);
const fits = Object.fromEntries(Object.entries(MODELS).map(([k, m]) => [k, fitModel(m, cps)]));
const loo = (name) => {
  const errs = cps.map((c, i) => kmBetween(fitModel(MODELS[name], cps.filter((_, j) => j !== i)).toLL(c.px), c.ll));
  return Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
};
const MODEL = 'equirectangular';
const geo = fits[MODEL];
console.log('georeference (NCTB B8 p. ২৬ scan → COD-AB), control points:', cps.length);
for (const [k, f] of Object.entries(fits)) console.log(`  ${k.padEnd(16)} RMS ${f.rms.toFixed(2)} km, leave-one-out RMS ${loo(k).toFixed(2)} km${k === MODEL ? '  ← used' : ''}`);
for (const r of geo.residuals) console.log(`    ${r.id.padEnd(16)} ${r.km.toFixed(2)} km`);
const kmPerPx = kmBetween(geo.toLL([150, 200]), geo.toLL([151, 200]));
console.log(`  scale ≈ ${kmPerPx.toFixed(2)} km per scan pixel`);

// ---- COD-AB: the mainland border, islands, internal boundaries ------------------
const polys = parts(a0).map((p) => p[0]);
const mainIdx = polys.reduce((best, r, i) => (r.length > polys[best].length ? i : best), 0);
const mainland = polys[mainIdx];
const islands = polys.filter((_, i) => i !== mainIdx);
const key = (p) => `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
const toKm = ([lon, lat]) => [lon * KX, lat * KY];

// internal edges: segments two upazila polygons share (COD-AB is topologically clean)
const segCount = new Map();
for (const f of a3)
  for (const poly of parts(f.geometry))
    for (const ring of poly)
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = key(ring[i]), b = key(ring[i + 1]);
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        const e = segCount.get(k);
        if (e) e.n++;
        else segCount.set(k, { n: 1, a: ring[i], b: ring[i + 1] });
      }
const internal = [...segCount.values()].filter((e) => e.n >= 2);
// grid index over internal segments, cells of CELL degrees
const CELL = 0.05;
const cellOf = (lon, lat) => `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`;
const grid = new Map();
internal.forEach((e, i) => {
  const [x0, x1] = [Math.min(e.a[0], e.b[0]), Math.max(e.a[0], e.b[0])];
  const [y0, y1] = [Math.min(e.a[1], e.b[1]), Math.max(e.a[1], e.b[1])];
  for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
    for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) {
      const k = `${gx},${gy}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
});
const near = (p, rKm) => {
  const r = Math.ceil(rKm / (CELL * KY)) + 1;
  const gx = Math.floor(p[0] / CELL), gy = Math.floor(p[1] / CELL);
  const out = new Set();
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (const i of grid.get(`${gx + dx},${gy + dy}`) || []) out.add(i);
  return out;
};
const distPointSeg = (p, a, b) => {
  const [px, py] = toKm(p), [ax, ay] = toKm(a), [bx, by] = toKm(b);
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const nearestInternal = (p, rKm) => {
  let best = Infinity;
  for (const i of near(p, rKm)) best = Math.min(best, distPointSeg(p, internal[i].a, internal[i].b));
  return best;
};

// ---- 2. snap ---------------------------------------------------------------------
function densify(line) {
  const out = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const n = Math.max(1, Math.ceil(kmBetween(a, b) / SAMPLE_KM));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
function corridorGraph(samples) {
  // nodes and edges of internal boundaries within SNAP_KM of the traced line
  const ids = new Set();
  for (let i = 0; i < samples.length; i += 4) for (const e of near(samples[i], SNAP_KM + 1)) ids.add(e);
  const adj = new Map();
  const within = (p) => {
    let best = Infinity;
    for (let i = 0; i < samples.length; i += 2) best = Math.min(best, Math.hypot(...toKm(p).map((v, j) => v - toKm(samples[i])[j])));
    return best <= SNAP_KM + 0.3;
  };
  const okNode = new Map();
  const ok = (p) => {
    const k = key(p);
    if (!okNode.has(k)) okNode.set(k, within(p));
    return okNode.get(k);
  };
  for (const i of ids) {
    const { a, b } = internal[i];
    if (!ok(a) || !ok(b)) continue;
    const ka = key(a), kb = key(b), w = kmBetween(a, b);
    if (!adj.has(ka)) adj.set(ka, { p: a, e: [] });
    if (!adj.has(kb)) adj.set(kb, { p: b, e: [] });
    adj.get(ka).e.push([kb, w]);
    adj.get(kb).e.push([ka, w]);
  }
  return adj;
}
function shortestPath(adj, from, to) {
  // Dijkstra with a binary heap
  const dist = new Map([[from, 0]]), prev = new Map(), done = new Set();
  const heap = [[0, from]];
  const push = (x) => {
    heap.push(x);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === to) break;
    for (const [v, w] of adj.get(u).e) {
      const nd = d + w;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, u);
        push([nd, v]);
      }
    }
  }
  if (!done.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path.map((k) => adj.get(k).p);
}
function components(adj) {
  const comp = new Map();
  let c = 0;
  for (const k of adj.keys()) {
    if (comp.has(k)) continue;
    const stack = [k];
    comp.set(k, c);
    while (stack.length) for (const [v] of adj.get(stack.pop()).e) if (!comp.has(v)) comp.set(v, c), stack.push(v);
    c++;
  }
  return comp;
}
function nodeIndex(adj) {
  const g = new Map();
  for (const [k, n] of adj) {
    const c = cellOf(n.p[0], n.p[1]);
    if (!g.has(c)) g.set(c, []);
    g.get(c).push(k);
  }
  return (p) => {
    let best = null, bd = Infinity;
    const gx = Math.floor(p[0] / CELL), gy = Math.floor(p[1] / CELL);
    for (let r = 1; r <= 3 && !best; r++)
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++)
          for (const k of g.get(`${gx + dx},${gy + dy}`) || []) {
            const d = kmBetween(p, adj.get(k).p);
            if (d < bd) (bd = d), (best = k);
          }
    return best;
  };
}
function snapLine(id, raw) {
  const samples = densify(raw);
  const d = samples.map((p) => nearestInternal(p, SNAP_KM));
  const isNear = d.map((v) => v <= SNAP_KM);
  // the two ends stay as traced (a junction, or the run out to the border)
  isNear[0] = isNear[samples.length - 1] = false;
  const adj = corridorGraph(samples);
  const comp = components(adj);
  const nearestNode = nodeIndex(adj);
  const nodeOf = samples.map((p, k) => (isNear[k] ? nearestNode(p) : null));
  const out = [];
  let snappedKm = 0, tracedKm = 0, runs = 0;
  let i = 0;
  while (i < samples.length) {
    if (!isNear[i] || !nodeOf[i]) {
      out.push(samples[i]);
      i++;
      continue;
    }
    // a sub-run: consecutive near samples whose nearest boundary node is in one connected piece
    let j = i;
    while (j + 1 < samples.length && isNear[j + 1] && nodeOf[j + 1] && comp.get(nodeOf[j + 1]) === comp.get(nodeOf[i])) j++;
    const a = nodeOf[i], b = nodeOf[j];
    const p = a !== b ? shortestPath(adj, a, b) : null;
    if (p) {
      out.push(...p);
      runs++;
      for (let k = i + 1; k <= j; k++) snappedKm += kmBetween(samples[k - 1], samples[k]);
    } else out.push(...samples.slice(i, j + 1));
    i = j + 1;
  }
  for (let k = 1; k < samples.length; k++) tracedKm += kmBetween(samples[k - 1], samples[k]);
  // drop consecutive duplicates
  const clean = out.filter((p, k) => k === 0 || key(p) !== key(out[k - 1]));
  return { id, line: clean, tracedKm, snappedKm, runs };
}

// ---- 3. cut at the border ----------------------------------------------------------
const ringSegs = mainland.slice(0, -1).map((a, i) => [a, mainland[i + 1], i]);
const ringGrid = new Map();
ringSegs.forEach(([a, b], i) => {
  for (let gx = Math.floor(Math.min(a[0], b[0]) / CELL); gx <= Math.floor(Math.max(a[0], b[0]) / CELL); gx++)
    for (let gy = Math.floor(Math.min(a[1], b[1]) / CELL); gy <= Math.floor(Math.max(a[1], b[1]) / CELL); gy++) {
      const k = `${gx},${gy}`;
      if (!ringGrid.has(k)) ringGrid.set(k, []);
      ringGrid.get(k).push(i);
    }
});
function segIntersect(p, q, a, b) {
  const r = [q[0] - p[0], q[1] - p[1]], s = [b[0] - a[0], b[1] - a[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-18) return null;
  const t = ((a[0] - p[0]) * s[1] - (a[1] - p[1]) * s[0]) / den;
  const u = ((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}
function crossings(line) {
  // every point where the line meets the mainland border, in order along the line
  const out = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const p = line[i], q = line[i + 1];
    const cand = new Set();
    for (let gx = Math.floor(Math.min(p[0], q[0]) / CELL); gx <= Math.floor(Math.max(p[0], q[0]) / CELL); gx++)
      for (let gy = Math.floor(Math.min(p[1], q[1]) / CELL); gy <= Math.floor(Math.max(p[1], q[1]) / CELL); gy++) for (const s of ringGrid.get(`${gx},${gy}`) || []) cand.add(s);
    const here = [];
    for (const s of cand) {
      const [a, b] = ringSegs[s];
      const x = segIntersect(p, q, a, b);
      if (x) here.push({ ...x, seg: s, i, pos: i + x.t, p: [a[0] + (b[0] - a[0]) * x.u, a[1] + (b[1] - a[1]) * x.u] });
    }
    out.push(...here.sort((x, y) => x.t - y.t));
  }
  // a crossing exactly at a shared vertex is found twice; keep one
  return out.filter((c, k) => k === 0 || Math.abs(c.pos - out[k - 1].pos) > 1e-9);
}
function pointInRing(p, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ---- run: transform, snap, cut, faces — once from the traced lines as the book
// draws them (the reference for which side a pocket is on), once snapped ------
const signedArea = (r) => {
  let s = 0;
  for (let i = 0; i + 1 < r.length; i++) s += toKm(r[i])[0] * toKm(r[i + 1])[1] - toKm(r[i + 1])[0] * toKm(r[i])[1];
  return s / 2;
};

const insidePoint = (f) => {
  let best = 0;
  for (let i = 1; i + 1 < f.length; i++) if (kmBetween(f[i], f[i + 1]) > kmBetween(f[best], f[best + 1])) best = i;
  const [a, b] = [f[best], f[best + 1]];
  const [dx, dy] = [(b[0] - a[0]) * KX, (b[1] - a[1]) * KY], L = Math.hypot(dx, dy);
  return [(a[0] + b[0]) / 2 + (-dy / L / KX) * 0.001, (a[1] + b[1]) / 2 + (dx / L / KY) * 0.001];
};

const edgeKeys = (f) => {
  const m = new Map();
  for (let i = 0; i + 1 < f.length; i++) {
    const a = key(f[i]), b = key(f[i + 1]);
    m.set(a < b ? `${a}|${b}` : `${b}|${a}`, kmBetween(f[i], f[i + 1]));
  }
  return m;
};

const labels = Object.fromEntries(Object.entries(trace.labels).map(([n, px]) => [n, geo.toLL(px)]));
const J = Object.fromEntries(Object.entries(trace.junctions).map(([k, px]) => [k, geo.toLL(px)]));
function partition(snap, reference) {
  const cuts = []; // points inserted into the mainland ring: {seg, u, p}
  const lines = {};
  const report = [];
  for (const [id, def] of Object.entries(trace.lines)) {
    let raw = def.px.map((px) => geo.toLL(px));
    // junction ends are the shared junction points, exactly
    if (J[def.from]) raw[0] = J[def.from];
    if (J[def.to]) raw[raw.length - 1] = J[def.to];
    // orient so that the junction end comes first; a border- or sea-end last
    const flipped = !J[def.from];
    if (flipped) raw = raw.reverse();
    const s = snap ? snapLine(id, raw) : { line: densify(raw), tracedKm: 0, snappedKm: 0, runs: 0 };
    let line = s.line;
    // keep the line up to where it last leaves the mainland (and, open at both
    // ends, from where it first comes onto it): any stretch it runs outside in
    // between is noded against the border below, and its faces outside dropped
    const cr = crossings(line);
    const openAtStart = !J[flipped ? def.to : def.from];
    const openAtEnd = !J[flipped ? def.from : def.to];
    if (openAtStart || openAtEnd) {
      if (!cr.length) fail(`line ${id} never meets the border`);
      const first = openAtStart ? cr[0] : { pos: 0, p: line[0] };
      const last = cr[cr.length - 1];
      if (openAtStart && cr.length < 2) fail(`line ${id} does not cross the mainland`);
      if (!openAtStart && pointInRing(line[0], mainland) === false) fail(`line ${id}: its junction end is not on the mainland`);
      if (cr.length > (openAtStart ? 2 : 1)) report.push(`line ${id}: runs outside the mainland and back ${Math.floor((cr.length - (openAtStart ? 2 : 1)) / 2)} time(s) near its end; noded`);
      const inner = line.filter((_, k) => k > first.pos && k < last.pos);
      line = [first.p, ...inner, last.p].filter((v, k, arr) => k === 0 || key(v) !== key(arr[k - 1]));
      for (const c of [first, last]) if (c.seg !== undefined) cuts.push({ seg: c.seg, u: c.u, p: c.p });
    }
    lines[id] = line;
    if (snap) console.log(`  line ${id.padEnd(5)} traced ${s.tracedKm.toFixed(1).padStart(6)} km, snapped to boundaries ${((100 * s.snappedKm) / s.tracedKm).toFixed(0).padStart(3)}% in ${s.runs} run(s); ${line.length} vertices`);
  }

  // ---- 4. faces ------------------------------------------------------------------------------
  // the mainland ring with the cut points inserted
  const bySeg = new Map();
  for (const c of cuts) {
    if (!bySeg.has(c.seg)) bySeg.set(c.seg, []);
    bySeg.get(c.seg).push(c);
  }
  const ring = [];
  for (let i = 0; i < ringSegs.length; i++) {
    ring.push(ringSegs[i][0]);
    for (const c of (bySeg.get(i) || []).sort((x, y) => x.u - y.u)) if (c.u > 0 && c.u < 1) ring.push(c.p);
  }
  ring.push(ring[0]);
  // the network's edges: the ring, and every line; then split each edge where
  // it crosses another (noding), so that the faces are exact
  const ovIdx = process.argv.indexOf('--overlay');
  if (snap && ovIdx > 0) fs.writeFileSync(process.argv[ovIdx + 1].replace(/\.svg$/, '.json'), JSON.stringify({ lines, georef: { X: geo.X, Y: geo.Y }, cps }));
  const edges = [];
  for (let i = 0; i + 1 < ring.length; i++) edges.push([ring[i], ring[i + 1], 'ring']);
  for (const [id, line] of Object.entries(lines)) for (let i = 0; i + 1 < line.length; i++) edges.push([line[i], line[i + 1], id]);
  const eGrid = new Map();
  edges.forEach(([a, b], i) => {
    for (let gx = Math.floor(Math.min(a[0], b[0]) / CELL); gx <= Math.floor(Math.max(a[0], b[0]) / CELL); gx++)
      for (let gy = Math.floor(Math.min(a[1], b[1]) / CELL); gy <= Math.floor(Math.max(a[1], b[1]) / CELL); gy++) {
        const k = `${gx},${gy}`;
        if (!eGrid.has(k)) eGrid.set(k, []);
        eGrid.get(k).push(i);
      }
  });
  const splits = edges.map(() => []);
  let crossingsFound = 0;
  edges.forEach(([p, q, owner], i) => {
    if (owner === 'ring') return;
    const cand = new Set();
    for (let gx = Math.floor(Math.min(p[0], q[0]) / CELL); gx <= Math.floor(Math.max(p[0], q[0]) / CELL); gx++)
      for (let gy = Math.floor(Math.min(p[1], q[1]) / CELL); gy <= Math.floor(Math.max(p[1], q[1]) / CELL); gy++) for (const j of eGrid.get(`${gx},${gy}`) || []) if (j !== i) cand.add(j);
    for (const j of cand) {
      if (edges[j][2] !== 'ring' && j < i) continue; // each line-line pair once
      const [a, b] = edges[j];
      const x = segIntersect(p, q, a, b);
      if (!x) continue;
      const interiorHere = x.t > 1e-9 && x.t < 1 - 1e-9, interiorThere = x.u > 1e-9 && x.u < 1 - 1e-9;
      if (!interiorHere && !interiorThere) continue; // they meet at a shared vertex
      const pt = [p[0] + (q[0] - p[0]) * x.t, p[1] + (q[1] - p[1]) * x.t];
      if (interiorHere) splits[i].push([x.t, pt]);
      if (interiorThere) splits[j].push([x.u, pt]);
      crossingsFound++;
    }
  });
  if (crossingsFound) report.push(`${crossingsFound} crossing(s) between lines, or a line and the border, were noded`);
  const nodes = new Map(); // key -> {p, nb: Set(key)}
  const addEdge = (a, b) => {
    const ka = key(a), kb = key(b);
    if (ka === kb) return;
    if (!nodes.has(ka)) nodes.set(ka, { p: a, nb: new Set() });
    if (!nodes.has(kb)) nodes.set(kb, { p: b, nb: new Set() });
    nodes.get(ka).nb.add(kb);
    nodes.get(kb).nb.add(ka);
  };
  edges.forEach(([a, b], i) => {
    const pts = [a, ...splits[i].sort((x, y) => x[0] - y[0]).map((x) => x[1]), b];
    for (let k = 0; k + 1 < pts.length; k++) addEdge(pts[k], pts[k + 1]);
  });
  const dangling = [...nodes.values()].filter((n) => n.nb.size === 1);
  if (dangling.length) fail(`${dangling.length} dangling ends in the sector network, e.g. ${dangling[0].p}`);
  const order = new Map();
  for (const [k, n] of nodes) {
    const list = [...n.nb].map((m) => [m, Math.atan2(nodes.get(m).p[1] - n.p[1], nodes.get(m).p[0] - n.p[0])]).sort((x, y) => x[1] - y[1]).map((x) => x[0]);
    order.set(k, list);
  }
  const used = new Set();
  const faces = [];
  for (const [u, n] of nodes)
    for (const v of n.nb) {
      if (used.has(`${u}>${v}`)) continue;
      const face = [];
      let a = u, b = v;
      while (!used.has(`${a}>${b}`)) {
        used.add(`${a}>${b}`);
        face.push(nodes.get(a).p);
        const list = order.get(b);
        const i = list.indexOf(a);
        const c = list[(i - 1 + list.length) % list.length];
        a = b;
        b = c;
      }
      face.push(face[0]);
      faces.push(face);
    }
  const MIN_FACE_KM2 = 0.05;
  // a point just inside a face: 1 m to the left of its longest edge's midpoint
  const outsideFaces = faces.filter((f) => signedArea(f) > 0 && !pointInRing(insidePoint(f), mainland));
  if (outsideFaces.length) report.push(`${outsideFaces.length} face(s) between a line and the border outside the mainland dropped`);
  const bounded = faces.filter((f) => signedArea(f) > MIN_FACE_KM2 && pointInRing(insidePoint(f), mainland));
  const slivers = faces.filter((f) => signedArea(f) > 0 && signedArea(f) <= MIN_FACE_KM2);
  if (slivers.length) report.push(`${slivers.length} sliver face(s) under ${MIN_FACE_KM2} km² dropped, ${slivers.reduce((s, f) => s + signedArea(f), 0).toFixed(3)} km² in all`);
  const sectorFaces = {};
  const unlabelled = [];
  for (const f of bounded) {
    const inside = Object.entries(labels).filter(([, p]) => pointInRing(p, f)).map(([n]) => n);
    if (inside.length !== 1) {
      unlabelled.push({ km2: signedArea(f), at: f[0], n: f.length, labels: inside, face: f });
      continue;
    }
    if (sectorFaces[inside[0]]) fail(`sector ${inside[0]} has two mainland faces`);
    sectorFaces[inside[0]] = f;
  }
  // an unlabelled pocket (where a snapped stretch meets a traced one) joins the
  // sector it shares the longest edge with; one holding two labels is an error
  for (const u of unlabelled) {
    if (u.labels.length > 1) fail(`a face holds sector labels ${u.labels.join(' and ')}`);
    let best = null, why = '';
    if (reference) {
      // the book's side: the sector of the unsnapped trace that covers most of it
      let bestKm2 = 0;
      const mine = edgeKeys(u.face);
      const touching = new Set(Object.entries(sectorFaces).filter(([, f]) => [...edgeKeys(f).keys()].some((k) => mine.has(k))).map(([n]) => n));
      for (const [n, f] of Object.entries(reference)) {
        if (!touching.has(n)) continue;
        const km2 = polygonClipping.intersection([u.face], [f]).reduce((s, poly) => s + signedArea(poly[0]) - poly.slice(1).reduce((h, r) => h + signedArea(r), 0), 0);
        if (km2 > bestKm2) (bestKm2 = km2), (best = n);
      }
      why = `${((100 * bestKm2) / u.km2).toFixed(0)}% of it on that side of the book's line`;
    }
    if (!best) {
      const mine = edgeKeys(u.face);
      let bestKm = 0;
      for (const [n, f] of Object.entries(sectorFaces)) {
        let km = 0;
        for (const [k] of edgeKeys(f)) if (mine.has(k)) km += mine.get(k);
        if (km > bestKm) (bestKm = km), (best = n);
      }
      why = `shared edge ${bestKm.toFixed(2)} km`;
    }
    if (!best) fail(`an unlabelled face of ${u.km2.toFixed(2)} km² touches no sector`);
    const merged = polygonClipping.union([sectorFaces[best]], [u.face]);
    if (merged.length !== 1 || merged[0].length !== 1) fail(`merging a ${u.km2.toFixed(2)} km² pocket into sector ${best} left ${merged.length} part(s)`);
    sectorFaces[best] = merged[0][0];
    report.push(`a ${u.km2.toFixed(2)} km² pocket at ${u.at.map((v) => v.toFixed(3))} joined sector ${best} (${why})`);
  }
  return { sectorFaces, notes: report, lines };
}
const reference = partition(false, null);
const { sectorFaces, notes: report, lines } = partition(true, reference.sectorFaces);
for (const n of Object.keys(labels)) if (!sectorFaces[n]) fail(`no face holds the label of sector ${n}`);

// islands: whole, to their district's sector
const districtOf = (p) => a2.find((f) => parts(f.geometry).some((poly) => pointInRing(p, poly[0])))?.properties.adm2_name;
const islandOf = {};
for (const isl of islands) {
  // a vertex nudged 1 m inland stands for the island
  const c = isl.reduce((s, p) => [s[0] + p[0] / isl.length, s[1] + p[1] / isl.length], [0, 0]);
  let probe = pointInRing(c, isl) ? c : isl[0];
  const d = districtOf(probe) ?? districtOf(isl[Math.floor(isl.length / 2)]);
  const n = trace.islands[d];
  if (!n) fail(`an island in ${d ?? 'no district'} (${isl.length} vertices) has no sector in the trace's islands table`);
  (islandOf[n] ||= []).push({ ring: isl, district: d });
}

// ---- write ---------------------------------------------------------------------------------
const round = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const clean = (r) => r.map(round).filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]);
const features = Object.keys(sectorFaces)
  .sort((x, y) => Number(x) - Number(y))
  .map((n) => {
    const polysOut = [[clean(sectorFaces[n])], ...(islandOf[n] || []).map((i) => [clean(i.ring)])];
    const areaKm2 = polysOut.reduce((s, p) => s + Math.abs(signedArea(p[0])), 0);
    return {
      type: 'Feature',
      properties: { sector: Number(n), areaKm2: Math.round(areaKm2), islands: (islandOf[n] || []).map((i) => i.district) },
      geometry: { type: 'MultiPolygon', coordinates: polysOut },
    };
  });
const fc = {
  type: 'FeatureCollection',
  properties: {
    about: 'Sectors of the 1971 Liberation War, 1–9 and 11 (sector 10 had no land area). Traced from the sector map in NCTB «বাংলাদেশ ও বিশ্বপরিচয়», অষ্টম শ্রেণি (2026), p. ২৬; outer edge and snapped stretches from OCHA COD-AB v03 (BBS). Approximate: the book draws the sectors on a small map. Built by tools/build-liberation-sectors.mjs from sector-trace.json.',
    georeference: { model: MODEL, controlPoints: cps.length, rmsKm: Number(geo.rms.toFixed(2)), kmPerScanPixel: Number(kmPerPx.toFixed(2)) },
    snapKm: SNAP_KM,
    licence: 'Boundaries from OCHA COD-AB (CC BY-IGO 3.0, Bangladesh Bureau of Statistics / OCHA); sector lines traced from NCTB class 8 textbook map.',
  },
  features,
};
// simplified together (shared edges stay shared), as the other Bangladesh maps' areas are
const simplified = await mapshaper.applyCommands(`-i in.json -simplify interval=${SIMPLIFY_METRES} keep-shapes -o out.json format=geojson geojson-type=FeatureCollection precision=0.000001`, { 'in.json': JSON.parse(JSON.stringify(fc)) });
const outFc = JSON.parse(simplified['out.json']);
outFc.properties = { ...fc.properties, simplifiedMetres: SIMPLIFY_METRES };
fs.writeFileSync(OUT, JSON.stringify(outFc) + '\n');

// ---- checks -------------------------------------------------------------------------------------
const total = features.reduce((s, f) => s + f.properties.areaKm2, 0);
const country = Math.abs(signedArea(mainland)) + islands.reduce((s, r) => s + Math.abs(signedArea(r)), 0);
console.log(`\nsectors: ${features.length}; land ${Math.round(total)} km² of COD-AB's ${Math.round(country)} km² (${((100 * total) / country).toFixed(3)}%)`);
for (const f of features) console.log(`  sector ${String(f.properties.sector).padStart(2)}  ${String(f.properties.areaKm2).padStart(6)} km²${f.properties.islands.length ? `  + islands: ${f.properties.islands.join(', ')}` : ''}`);
if (Math.abs(total - country) / country > 0.001) fail(`the sectors cover ${total} km², COD-AB ${country} km²`);
for (const r of report) console.log(`  note: ${r}`);
console.log(`wrote ${path.relative(ROOT, OUT)} — ${fs.statSync(OUT).size} bytes, sha256 ${sha256(fs.readFileSync(OUT)).slice(0, 16)}`);

