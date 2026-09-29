// Geometry helpers for the Rivers of Bangladesh picture
// (tools/build-diagram-bangladesh-rivers.mjs, and tools/verify.mjs, which
// projects the seed's source coordinates with the same code).
//
// One flat projection per frame: x = (lon - lonMin) * cosLat * scale,
// y = (latMax - lat) * scale, in the frame's own units (u). A picture is a
// drawing, not a map of record, so the projection is the simplest one that
// keeps the shapes right at this latitude; the frame file carries its
// parameters, and every distance a check makes is taken on the ground.

const M_PER_DEG = 111194.93; // one degree of latitude, mean Earth radius 6371.0088 km

export function projection({ lonMin, latMax, cosLat, scale }) {
  return {
    lonMin, latMax, cosLat, scale,
    project: (lon, lat) => [(lon - lonMin) * cosLat * scale, (latMax - lat) * scale],
    invert: (x, y) => [lonMin + x / (cosLat * scale), latMax - y / scale],
  };
}

/** Ground distance in metres between two [lon, lat] points. */
export function distM(a, b) {
  const rad = Math.PI / 180;
  const dx = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * rad) * M_PER_DEG;
  const dy = (b[1] - a[1]) * M_PER_DEG;
  return Math.hypot(dx, dy);
}

/**
 * The point of a [lon, lat] polyline nearest to `p`: { m, seg, t, pt } — the
 * ground distance in metres, the segment index, the fraction along that
 * segment and the point itself.
 */
export function nearestOnLine(p, line) {
  const cos = Math.cos((p[1] * Math.PI) / 180);
  let best = { m: Infinity, seg: -1, t: 0, pt: null };
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - p[0]) * cos, ay = line[i][1] - p[1];
    const bx = (line[i + 1][0] - p[0]) * cos, by = line[i + 1][1] - p[1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const m = Math.hypot(ax + t * dx, ay + t * dy) * M_PER_DEG;
    if (m < best.m) {
      best = { m, seg: i, t, pt: [line[i][0] + t * (line[i + 1][0] - line[i][0]), line[i][1] + t * (line[i + 1][1] - line[i][1])] };
    }
  }
  return best;
}

/** Ground length in kilometres of a [lon, lat] polyline. */
export function lengthKm(line) {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += distM(line[i - 1], line[i]);
  return m / 1000;
}

/** Position along a polyline, 0..1 by ground length, of the point at (seg, t). */
export function fractionAlong(line, seg, t) {
  let before = 0, total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = distM(line[i - 1], line[i]);
    if (i - 1 < seg) before += d;
    else if (i - 1 === seg) before += d * t;
    total += d;
  }
  return total === 0 ? 0 : before / total;
}

/** Douglas–Peucker on [x, y] points, tolerance in the points' own units. */
export function simplify(points, tol) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let worst = -1, at = -1;
    const [ax, ay] = points[lo], [bx, by] = points[hi];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let i = lo + 1; i < hi; i++) {
      const [px, py] = points[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([lo, at], [at, hi]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** A ring simplified as a closed loop (its first point stays). */
export function simplifyRing(ring, tol) {
  const open = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
  if (open.length < 4) return open;
  const out = simplify([...open, open[0]], tol);
  out.pop();
  return out.length >= 3 ? out : open;
}

/** Sutherland–Hodgman: a polygon ring clipped to the rectangle [x0, y0, x1, y1]. */
export function clipRing(ring, [x0, y0, x1, y1]) {
  let out = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring.slice();
  const edges = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (!out.length) return [];
  }
  return out;
}

/** A polyline clipped to the rectangle: the pieces that lie inside, in order. */
export function clipLine(line, [x0, y0, x1, y1]) {
  const pieces = [];
  let current = null;
  const push = (p) => { if (!current) { current = []; pieces.push(current); } const last = current.at(-1); if (!last || last[0] !== p[0] || last[1] !== p[1]) current.push(p); };
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1];
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) { t0 = 2; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { t0 = 2; break; } if (r > t0) t0 = r; } else { if (r < t0) { t0 = 2; break; } if (r < t1) t1 = r; }
    }
    if (t0 > t1) { current = null; continue; }
    const a = [ax + t0 * dx, ay + t0 * dy], b = [ax + t1 * dx, ay + t1 * dy];
    if (t0 > 0) current = null;
    push(a);
    push(b);
    if (t1 < 1) current = null;
  }
  return pieces.filter((p) => p.length >= 2);
}

/**
 * Ways of one river joined end to end: `ways` is [{ id, coords, nodes? }];
 * ends are joined where they meet within `tolM`, and the result is one
 * polyline that uses every way once. The chain must be a simple path — a way
 * that would branch it or a gap wider than `tolM` is an error — and it runs
 * so that its last point is the one nearer `downstream` ([lon, lat]).
 * Returns { coords, order: [{ id, reversed }], gaps: [metres] }.
 */
export function chainWays(ways, { tolM = 30, downstream, label = 'chain' } = {}) {
  const ends = ways.flatMap((w) => [{ w, end: 0, pt: w.coords[0] }, { w, end: 1, pt: w.coords.at(-1) }]);
  const links = new Map(ways.map((w) => [w.id, [[], []]]));
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      if (ends[i].w === ends[j].w) continue;
      const d = distM(ends[i].pt, ends[j].pt);
      if (d <= tolM) { links.get(ends[i].w.id)[ends[i].end].push({ with: ends[j], d }); links.get(ends[j].w.id)[ends[j].end].push({ with: ends[i], d }); }
    }
  }
  for (const w of ways) for (const end of [0, 1]) {
    if (links.get(w.id)[end].length > 1) throw new Error(`${label}: way ${w.id} meets ${links.get(w.id)[end].length} ways at one end (${links.get(w.id)[end].map((l) => l.with.w.id).join(', ')})`);
  }
  const open = ends.filter((e) => links.get(e.w.id)[e.end].length === 0);
  if (ways.length === 1) open.length = 2;
  if (open.length !== 2) throw new Error(`${label}: the ways do not form one path (${open.length} loose ends: ${open.map((e) => `${e.w.id}/${e.end}`).join(', ')})`);
  const first = downstream && distM(open[0].pt, downstream) < distM(open[1].pt, downstream) ? open[1] : open[0];
  const coords = [];
  const order = [];
  const gaps = [];
  let at = first;
  const seen = new Set();
  for (;;) {
    const reversed = at.end === 1;
    const c = reversed ? at.w.coords.slice().reverse() : at.w.coords;
    coords.push(...(coords.length ? c.slice(1) : c));
    order.push({ id: at.w.id, reversed });
    seen.add(at.w.id);
    const tail = links.get(at.w.id)[reversed ? 0 : 1][0];
    if (!tail) break;
    gaps.push(Math.round(tail.d * 10) / 10);
    at = tail.with;
    if (seen.has(at.w.id)) throw new Error(`${label}: the ways loop at ${at.w.id}`);
  }
  if (seen.size !== ways.length) throw new Error(`${label}: ${ways.length - seen.size} way(s) are not on the path (${ways.filter((w) => !seen.has(w.id)).map((w) => w.id).join(', ')})`);
  return { coords, order, gaps };
}

const num = (v) => {
  const s = (Math.round(v * 10) / 10).toString();
  return s === '-0' ? '0' : s;
};

/** [x, y] points as SVG path data, quantised to 0.1 u, the first absolute and the rest relative. */
export function pathData(points, close = false) {
  if (points.length < 2) return '';
  const q = points.map(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]);
  let d = `M${num(q[0][0] / 10)} ${num(q[0][1] / 10)}`;
  let run = 'l';
  const parts = [];
  for (let i = 1; i < q.length; i++) {
    const dx = q[i][0] - q[i - 1][0], dy = q[i][1] - q[i - 1][1];
    if (dx === 0 && dy === 0) continue;
    parts.push(`${num(dx / 10)} ${num(dy / 10)}`);
  }
  if (!parts.length) return '';
  d += `${run}${parts.join(' ')}`.replace(/ -/g, '-');
  return close ? `${d}z` : d;
}

/** The [x, y] points a pathData string draws (absolute), at the 0.1 u it was quantised to. */
export function parsePath(d) {
  const out = [];
  for (const sub of d.split(/(?=M)/)) {
    if (!sub) continue;
    const m = /^M(-?[\d.]+)[ ,](-?[\d.]+)l?([^z]*)z?$/.exec(sub);
    if (!m) throw new Error(`unreadable path data: ${sub.slice(0, 40)}`);
    let x = +m[1], y = +m[2];
    const pts = [[x, y]];
    const nums = m[3].match(/-?[\d.]+/g) ?? [];
    for (let i = 0; i < nums.length; i += 2) { x += +nums[i]; y += +nums[i + 1]; pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]); }
    out.push(pts);
  }
  return out;
}
