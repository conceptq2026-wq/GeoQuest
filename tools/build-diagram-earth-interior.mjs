// Builds the earth-interior diagram into its folder: the descriptor, the data
// and the art's manifest, with the geometry measured on the approved master.
//
//   node tools/build-diagram-earth-interior.mjs [out]          build (out: docs/diagrams/earth-interior)
//   node tools/build-diagram-earth-interior.mjs --measure      measure and print; writes nothing
//
// From the seed, data-sources/earth-interior/earth-interior.seed.json, which it
// reads and never writes, and from the art tool's staging folder
// (tools/build-diagram-earth-interior-art.mjs runs first). All Bengali shown is
// the seed's; nothing that is provenance — `sources`' citations — is shipped.
//
// The geometry. The master is a globe with a quarter cut away; its cut face
// shows the layers as bands round the cut's corner, which the painting draws
// neither concentric nor quite round about it. So every band boundary is its
// own circle, fitted to where the colour changes along rays from the corner,
// and each layer is an annular sector between its two circles, bounded by
// the cut's two straight edges, measured as lines: the continental crust on
// the top of the outer band, the oceanic crust on its right, split where the
// painting's brown slab gives way to its grey band. Output is deterministic:
// a second build writes the same bytes.
//
// No network, ever: the master is checked against the seed's pins, and ffmpeg
// decodes it on this machine.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { decode } from './lib/diagram-art.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed, the approved master, the art tool's staging folder, and where the diagram goes.
const SEED = path.join(ROOT, 'data-sources/earth-interior/earth-interior.seed.json');
const ART = path.join(ROOT, 'data-sources/earth-interior/art');
const STAGING = path.join(ROOT, 'data-sources/earth-interior/build');
const DEFAULT_OUT = path.join(ROOT, 'docs/diagrams/earth-interior');

const ID = 'earth-interior';
const SECTION = 'misc';
const MASTER = 'earth-master.png';
// The layers from the outside in, each by the colour class of its band; the
// two crusts share the outer band.
const CORE_TO_CRUST = ['inner-core', 'outer-core', 'lower-mantle', 'upper-mantle'];
// Rays from the corner, this far inside each cut edge (degrees), every STEP degrees.
const RAY = { margin: 4, step: 1, start: 30 };
// A fitted point further than this from its circle (master px) is refitted without.
const OUTLIER = 3;
// The build fails if a boundary's circle misses its points by more than this (master px, RMS).
const FIT_LIMIT = 2.5;
// Where each band's label leader meets it: its radial middle along this ray.
// The four inner bands share the cut's bisector; the continental crust takes
// the middle of its own stretch, the oceanic crust a ray a fifth of the way
// down its own, so the anchors run down the picture in the layers' order and
// no two leaders cross.
const ANCHOR = { oceanicAlong: 0.2 };

const MEASURE = process.argv.includes('--measure');
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? DEFAULT_OUT);
const fail = (msg) => {
  throw new Error(`earth-interior: ${msg}`);
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const deg = Math.PI / 180;

// ---- the inputs --------------------------------------------------------------------------

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const pin = seed.art?.files?.[MASTER] ?? fail(`the seed pins no ${MASTER}`);
const masterFile = path.join(ART, MASTER);
if (sha256(fs.readFileSync(masterFile)) !== pin.sha256) fail(`${MASTER} is not the approved file (SHA-256 differs from the seed's pin)`);
const master = decode(masterFile);
if (sha256(master.data) !== pin.rgbPixelsSha256) fail(`${MASTER}'s pixels are not the approved ones (RGB SHA-256 differs from the seed's pin)`);
if (master.w !== pin.size[0] || master.h !== pin.size[1]) fail(`${MASTER} is ${master.w}×${master.h}, the seed pins ${pin.size.join('×')}`);

const layers = Object.values(seed.layers).sort((a, b) => a.order - b.order);
for (const word of ['pickerPlaceholderBn', 'scaleNoteBn', 'closeBn', 'pageBn']) if (!seed.ui?.[word]) fail(`the seed's ui has no ${word}`);
const byId = Object.fromEntries(layers.map((l) => [l.id, l]));
for (const id of [...CORE_TO_CRUST, 'continental-crust', 'oceanic-crust']) if (!byId[id]) fail(`the seed has no layer ${id}`);
if (byId['continental-crust'].face !== 'top' || byId['oceanic-crust'].face !== 'right') fail('the seed puts the continental crust on the top face and the oceanic crust on the right; the geometry below assumes it');

// ---- colours ------------------------------------------------------------------------------

const { w: W, h: H, data } = master;
const at = (x, y) => {
  const i = (Math.round(y) * W + Math.round(x)) * 3;
  return [data[i], data[i + 1], data[i + 2]];
};
/*
 * What a pixel of the cut face is: a layer's band, the crust (grey or brown),
 * or anything else — the globe's painted surface, the white page. Read off the
 * master's own flat colours: the inner core yellow to white, the outer core
 * orange, the lower mantle deep red, the upper mantle red-orange, the oceanic
 * crust grey, the continental crust's slab brown.
 */
function classOf([r, g, b]) {
  if (r >= 230 && g >= 175 && b < 215) return 'inner-core';
  if (r >= 225 && g >= 115 && g < 175 && b < 80) return 'outer-core';
  if (r >= 90 && r < 200 && g < 50 && b < 60) return 'lower-mantle';
  if (r >= 200 && g < 115 && b < 60) return 'upper-mantle';
  if (Math.max(r, g, b) - Math.min(r, g, b) < 30 && r > 30 && r < 170) return 'grey';
  if (r > g && g > b && r >= 100 && r < 190 && g >= 45 && g < 140 && r - b > 40) return 'brown';
  return 'other';
}
/** The cut, in any band or crust colour — what the globe's surface is not. */
const isCut = (c) => classOf(c) !== 'other';

// ---- the cut's two straight edges, and its corner --------------------------------------------

/** Least squares v = a + b·u, refitted without points further than EDGE_OFF. */
const EDGE_OFF = 4;
function line(all) {
  const first = fitLine(all);
  const points = all.filter(([u, v]) => Math.abs(first.a + first.b * u - v) <= EDGE_OFF);
  return { ...fitLine(points), kept: points.length, of: all.length };
}
function fitLine(points) {
  const n = points.length;
  const mu = points.reduce((s, p) => s + p[0], 0) / n;
  const mv = points.reduce((s, p) => s + p[1], 0) / n;
  let suu = 0;
  let suv = 0;
  for (const [u, v] of points) (suu += (u - mu) ** 2), (suv += (u - mu) * (v - mv));
  const b = suv / suu;
  const a = mv - b * mu;
  const worst = Math.max(...points.map(([u, v]) => Math.abs(a + b * u - v)));
  return { a, b, worst };
}

// The left edge: in each row, the first pixel of the cut after the globe's surface.
const leftPoints = [];
for (let y = 300; y <= 640; y += 4) {
  for (let x = 500; x < 640; x++) if (!isCut(at(x - 1, y)) && isCut(at(x, y)) && isCut(at(x + 3, y))) {
    leftPoints.push([y, x - 0.5]);
    break;
  }
}
const left = line(leftPoints); // x = a + b·y
// The bottom edge. Under the face runs the lower cut face, seen edge on: a
// sliver some 20 px deep of the same layers, darker. The face ends where it
// begins — in each column, the sharpest change of colour in the SLIVER px
// above where the cut gives way to the globe's surface below it.
const SLIVER = 45;
const bottomPoints = [];
for (let x = 620; x <= 1060; x += 8) {
  let foot = -1;
  for (let y = 640; y < 840; y++) if (isCut(at(x, y - 1)) && !isCut(at(x, y)) && !isCut(at(x, y + 3))) {
    foot = y;
    break;
  }
  if (foot < 0) continue;
  let best = -1;
  let sharpest = 0;
  for (let y = foot - SLIVER; y < foot - 4; y++) {
    const [a, b] = [at(x, y - 1), at(x, y + 1)];
    const change = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    if (change > sharpest) (sharpest = change), (best = y);
  }
  if (best > 0) bottomPoints.push([x, best]);
}
const bottom = line(bottomPoints); // y = a + b·x
if (left.kept < 40 || bottom.kept < 30) fail(`the cut's edges hold at only ${left.kept} rows and ${bottom.kept} columns`);
// The corner: x = la + lb·y and y = ba + bb·x.
const cy = (bottom.a + bottom.b * left.a) / (1 - bottom.b * left.b);
const corner = [left.a + left.b * cy, cy];
// Their angles, in degrees anticlockwise from east, the picture's y running down.
const angleLeft = Math.atan2(1, -left.b) / deg; // the left edge, going up
const angleBottom = Math.atan2(-bottom.b, 1) / deg; // the bottom edge, going right

// ---- band boundaries along rays from the corner ----------------------------------------------

const dir = (a) => [Math.cos(a * deg), -Math.sin(a * deg)];
const RUN = 4; // samples a new class must hold for, at half a pixel each
// The inner core's edge is sought no nearer the corner than this share of the outer core's end.
const EDGE_FROM = 0.35;
// A ray's boundary this far (master px) from the median of its neighbours' is a
// ray that grazed a cut edge's thin sliver, not the band, and is left out.
const NEIGHBOURS = { window: 3, off: 8 };
// Nor is one further than this share from the median over all its rays: a run
// of grazing rays agrees with itself (the left edge's sliver, found 32 px out).
const SPREAD = 0.35;

/** The classes along a ray from the corner, every half pixel, until it leaves the picture. */
function walk(a) {
  const [dx, dy] = dir(a);
  const out = [];
  for (let t = 0; ; t += 0.5) {
    const x = corner[0] + t * dx;
    const y = corner[1] + t * dy;
    if (x < 1 || y < 1 || x > W - 2 || y > H - 2) break;
    out.push(classOf(at(x, y)));
  }
  return out;
}

/** Where, after `from`, the ray first holds one of `classes` for RUN samples: the boundary's t. */
function firstRun(cls, from, classes) {
  for (let i = Math.max(from, 0); i + RUN <= cls.length; i++) {
    let ok = true;
    for (let k = 0; k < RUN && ok; k++) ok = classes.includes(cls[i + k]);
    if (ok) return i;
  }
  return -1;
}

const boundaries = { 'inner-core': [], 'outer-core': [], 'lower-mantle': [], 'upper-mantle': [], 'continental-crust': [], 'oceanic-crust': [] };
const crustKind = []; // [angle, 'brown' | 'grey'] along the outer band
for (let a = angleBottom + RAY.margin; a <= angleLeft - RAY.margin + 1e-9; a += RAY.step) {
  const cls = walk(a);
  const [dx, dy] = dir(a);
  const point = (i) => [corner[0] + (i - 0.5) * 0.5 * dx, corner[1] + (i - 0.5) * 0.5 * dy];
  // From inside out. The outer core ends where the deep red begins, the lower
  // mantle where the red-orange does, the upper mantle at the crust.
  let crustAt = -1;
  let i = RAY.start * 2;
  const found = {};
  for (const [layer, next] of [['outer-core', ['lower-mantle']], ['lower-mantle', ['upper-mantle']], ['upper-mantle', ['grey', 'brown']]]) {
    const j = firstRun(cls, i + RUN, next);
    if (j < 0) break;
    found[layer] = j;
    i = j;
  }
  if (found['upper-mantle'] === undefined) continue;
  for (const layer of ['outer-core', 'lower-mantle', 'upper-mantle']) boundaries[layer].push(point(found[layer]));
  crustAt = found['upper-mantle'];
  // The inner core is a bright disc whose edge fades into the outer core's
  // glow, so no one colour marks it: its edge is where the green falls
  // fastest, between the ray's start and the outer core's end.
  const green = [];
  for (let k = 0; k < found['outer-core']; k++) green.push(at(corner[0] + k * 0.5 * dx, corner[1] + k * 0.5 * dy)[1]);
  const smooth = green.map((_, k) => {
    const win = green.slice(Math.max(0, k - 2), k + 3);
    return win.reduce((s, v) => s + v, 0) / win.length;
  });
  let steepest = -1;
  let drop = 0;
  for (let k = Math.round(found['outer-core'] * EDGE_FROM); k + 4 < found['outer-core'] - 20; k++) {
    const d = smooth[k] - smooth[k + 4];
    if (d > drop) (drop = d), (steepest = k + 2);
  }
  if (steepest > 0) boundaries['inner-core'].push(point(steepest + 0.5));
  if (crustAt < 0) continue;
  // The crust: brown or grey, whichever it mostly is, out to the globe's surface.
  const end = firstRun(cls, crustAt + RUN, ['other', 'upper-mantle', 'outer-core', 'inner-core', 'lower-mantle']);
  if (end < 0) continue;
  const run = cls.slice(crustAt, end);
  const brown = run.filter((c) => c === 'brown').length;
  const kind = brown * 2 > run.length ? 'brown' : 'grey';
  crustKind.push([a, kind]);
  boundaries[kind === 'brown' ? 'continental-crust' : 'oceanic-crust'].push(point(end));
}

// The split: the angle between the last grey ray and the first brown ray above it.
const firstBrown = crustKind.find(([, k]) => k === 'brown');
const lastGrey = [...crustKind].reverse().find(([, k]) => k === 'grey');
if (!firstBrown || !lastGrey || lastGrey[0] > firstBrown[0]) fail('the crust is not grey on the right and brown on top, as the seed says');
const mixed = crustKind.filter(([a, k]) => (a < firstBrown[0] && k === 'brown') || (a > lastGrey[0] && k === 'grey'));
if (mixed.length) fail(`the crust changes from grey to brown more than once (${mixed.map(([a, k]) => `${round(a, 1)}° ${k}`).join(', ')})`);
const angleSplit = (firstBrown[0] + lastGrey[0]) / 2;
// Points near the split belong to both stretches' surfaces only loosely: the
// continental surface is fitted from its own rays, the oceanic from its own.

// ---- circles ------------------------------------------------------------------------------

/** Kasa's algebraic fit, refitted without points beyond OUTLIER: centre, radius, residuals. */
function circle(points, name) {
  const fit = (all) => {
    // About the points' mean, which keeps the sums small enough to solve exactly.
    const mx = all.reduce((s, p) => s + p[0], 0) / all.length;
    const my = all.reduce((s, p) => s + p[1], 0) / all.length;
    const pts = all.map(([x, y]) => [x - mx, y - my]);
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
    const n = pts.length;
    for (const [x, y] of pts) {
      const z = x * x + y * y;
      sx += x, sy += y, sxx += x * x, syy += y * y, sxy += x * y, sxz += x * z, syz += y * z, sz += z;
    }
    // Solve [sxx sxy sx; sxy syy sy; sx sy n]·[D E F] = −[sxz syz sz].
    const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
    const B = [-sxz, -syz, -sz];
    const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const d = det(A);
    const [D, E, F] = [0, 1, 2].map((k) => det(A.map((row, r) => row.map((v, c) => (c === k ? B[r] : v)))) / d);
    const cx = -D / 2;
    const cy = -E / 2;
    return { cx: cx + mx, cy: cy + my, r: Math.sqrt(cx * cx + cy * cy - F) };
  };
  if (points.length < 12) fail(`the ${name} boundary was found on only ${points.length} rays`);
  let c = fit(points);
  const off = (p) => Math.abs(Math.hypot(p[0] - c.cx, p[1] - c.cy) - c.r);
  const kept = points.filter((p) => off(p) <= OUTLIER);
  if (kept.length < points.length * 0.8) fail(`the ${name} boundary: only ${kept.length} of ${points.length} points lie within ${OUTLIER} px of a circle`);
  c = fit(kept);
  const res = kept.map(off);
  const rms = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / res.length);
  if (rms > FIT_LIMIT) fail(`the ${name} boundary's circle misses its points by ${round(rms)} px RMS, over ${FIT_LIMIT}`);
  return { ...c, rays: points.length, kept: kept.length, rms, worst: Math.max(...res) };
}

if (process.env.EI_DEBUG) fs.writeFileSync(process.env.EI_DEBUG, JSON.stringify({ corner, boundaries }));
/** The points whose distance from the corner agrees with their neighbouring rays'. */
function agreeing(points) {
  const t = points.map(([x, y]) => Math.hypot(x - corner[0], y - corner[1]));
  const median = [...t].sort((a, b) => a - b)[t.length >> 1];
  return points.filter((_, k) => {
    if (Math.abs(t[k] - median) > SPREAD * median) return false;
    const near = t.slice(Math.max(0, k - NEIGHBOURS.window), k + NEIGHBOURS.window + 1).sort((a, b) => a - b);
    return Math.abs(t[k] - near[near.length >> 1]) <= NEIGHBOURS.off;
  });
}
const circles = Object.fromEntries(Object.entries(boundaries).map(([name, pts]) => [name, { ...circle(agreeing(pts), name), found: pts.length }]));

// ---- the six sectors ------------------------------------------------------------------------

/** Where the ray from the corner at angle a meets a circle: its distance along the ray. */
function reach(c, a) {
  const [dx, dy] = dir(a);
  const ox = corner[0] - c.cx;
  const oy = corner[1] - c.cy;
  const b = ox * dx + oy * dy;
  const q = ox * ox + oy * oy - c.r * c.r;
  const disc = b * b - q;
  if (disc < 0) fail(`a ray at ${round(a, 1)}° misses a circle`);
  return -b + Math.sqrt(disc);
}
const pointAt = (t, a) => {
  const [dx, dy] = dir(a);
  return [corner[0] + t * dx, corner[1] + t * dy];
};

// Each layer: its outer circle, its inner one (none for the inner core: the
// corner), and its stretch of the cut, from the bottom edge up.
const inner = { 'inner-core': null, 'outer-core': 'inner-core', 'lower-mantle': 'outer-core', 'upper-mantle': 'lower-mantle', 'continental-crust': 'upper-mantle', 'oceanic-crust': 'upper-mantle' };
const stretch = (id) => (id === 'continental-crust' ? [angleSplit, angleLeft] : id === 'oceanic-crust' ? [angleBottom, angleSplit] : [angleBottom, angleLeft]);

const bisector = (angleBottom + angleLeft) / 2;
function anchorAngle(id) {
  const [from, to] = stretch(id);
  if (id === 'continental-crust') return (from + to) / 2;
  if (id === 'oceanic-crust') return to - (to - from) * ANCHOR.oceanicAlong;
  return bisector;
}

const sectors = layers.map((layer) => {
  const id = layer.id;
  const [from, to] = stretch(id);
  const a = anchorAngle(id);
  const tIn = inner[id] ? reach(circles[inner[id]], a) : 0;
  const tOut = reach(circles[id], a);
  // The band's least thickness along its stretch, for the tap zone's reach.
  let thinnest = Infinity;
  for (let s = from; s <= to + 1e-9; s += 0.5) thinnest = Math.min(thinnest, reach(circles[id], s) - (inner[id] ? reach(circles[inner[id]], s) : 0));
  return { id, outer: id, inner: inner[id], from, to, anchor: pointAt((tIn + tOut) / 2, a), thinnest };
});

// Leaders must not cross: the anchors run down the picture in the layers' order.
for (let k = 1; k < sectors.length; k++)
  if (!(sectors[k].anchor[1] > sectors[k - 1].anchor[1])) fail(`${sectors[k].id}'s anchor (y ${round(sectors[k].anchor[1])}) is not below ${sectors[k - 1].id}'s (y ${round(sectors[k - 1].anchor[1])}): leaders would cross`);

// ---- report ---------------------------------------------------------------------------------

const say = (s) => console.log(s);
say(`corner (${round(corner[0], 1)}, ${round(corner[1], 1)}); left edge ${round(angleLeft, 2)}° (${left.kept} of ${left.of} rows, worst ${round(left.worst, 1)} px), bottom edge ${round(angleBottom, 2)}° (${bottom.kept} of ${bottom.of} columns, worst ${round(bottom.worst, 1)} px); crust split ${round(angleSplit, 1)}°`);
for (const [name, c] of Object.entries(circles)) say(`  ${name.padEnd(17)} centre (${round(c.cx, 1)}, ${round(c.cy, 1)}) r ${round(c.r, 1)}; ${c.kept} of ${c.found} rays, RMS ${round(c.rms)} px, worst ${round(c.worst)} px`);
for (const s of sectors) say(`  ${s.id.padEnd(17)} ${round(s.from, 1)}°–${round(s.to, 1)}°, anchor (${round(s.anchor[0], 1)}, ${round(s.anchor[1], 1)}), thinnest ${round(s.thinnest, 1)} px`);
if (MEASURE) process.exit(0);

// ---- the art, from the art tool's staging folder -------------------------------------------------

const artManifest = path.join(STAGING, 'manifest.json');
if (!fs.existsSync(artManifest)) fail(`no staged art: run node tools/build-diagram-earth-interior-art.mjs first`);
const art = JSON.parse(fs.readFileSync(artManifest, 'utf8'));
if (art.master !== pin.sha256) fail(`the staged art was cut from another master (${art.master.slice(0, 12)}…): run the art tool again`);

// ---- the files ------------------------------------------------------------------------------

const json = (v) => JSON.stringify(v, null, 2) + '\n';
const pt = (p) => [round(p[0]), round(p[1])];
const ui = seed.ui;

const descriptor = {
  id: ID,
  section: SECTION,
  language: 'bn',
  title: { en: seed.titleEn, bn: seed.titleBn },
  data: 'data.json',
  views: [{ id: 'cutaway', type: 'cutaway', art: 'manifest.json' }],
  // Interface words are data: the seed's, and no others.
  words: {
    picker: ui.pickerPlaceholderBn,
    close: ui.closeBn,
    scale: ui.scaleNoteBn,
    rows: ui.rowOrder.map((key) => ({ key, label: ui.rowLabelsBn[key] })),
  },
};

const credit = (s, extra = '') => ({ title: s.title + extra, by: s.publisher, url: s.url, ...(/[ঀ-৿]/.test(s.title) ? { lang: 'bn' } : {}) });
const shipped = {
  _about: 'Built by tools/build-diagram-earth-interior.mjs from data-sources/earth-interior/earth-interior.seed.json; do not edit.',
  layers: layers.map((l) => ({ id: l.id, nameBn: l.nameBn, rows: Object.fromEntries(ui.rowOrder.filter((k) => l.rows[k] !== undefined).map((k) => [k, l.rows[k]])) })),
  // The sources the card's values cite, each once, in the seed's order; the
  // user's own decisions are not a source to credit.
  credits: Object.entries(seed.sources)
    .filter(([key]) => key !== 'user')
    .filter(([key]) => layers.some((l) => Object.values(l.sources ?? {}).some((list) => list.some((c) => c.source === key))))
    .map(([key, s]) => credit(s, s.page ? `, ${ui.pageBn} ${s.page}` : '')),
};
for (const l of layers) for (const k of Object.keys(l.rows)) if (!ui.rowOrder.includes(k)) fail(`${l.id} has a row ${k} that ui.rowOrder does not place`);

const manifest = {
  _about: 'Built by tools/build-diagram-earth-interior.mjs; master px throughout. The art is the approved master cut out; the geometry is measured on it.',
  page: art.page,
  master: { width: W, height: H },
  view: { x: art.box.x, y: art.box.y, width: art.box.width, height: art.box.height, layout: art.layout, files: art.files },
  corner: pt(corner),
  edges: { left: round(angleLeft), bottom: round(angleBottom), split: round(angleSplit) },
  circles: Object.fromEntries(Object.entries(circles).map(([k, c]) => [k, { cx: round(c.cx), cy: round(c.cy), r: round(c.r) }])),
  layers: sectors.map((s) => ({ id: s.id, outer: s.outer, inner: s.inner, from: round(s.from), to: round(s.to), anchor: pt(s.anchor), thinnest: round(s.thinnest) })),
};

fs.mkdirSync(OUT, { recursive: true });
for (const f of Object.values(art.files)) fs.copyFileSync(path.join(STAGING, f), path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'descriptor.json'), json(descriptor));
fs.writeFileSync(path.join(OUT, 'data.json'), json(shipped));
fs.writeFileSync(path.join(OUT, 'manifest.json'), json(manifest));
say(`wrote ${path.relative(ROOT, OUT) || OUT}: descriptor.json, data.json, manifest.json, ${Object.values(art.files).join(', ')}`);
