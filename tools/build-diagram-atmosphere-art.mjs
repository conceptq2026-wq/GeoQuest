// Builds the atmosphere-layers exploded view's art from the approved masters.
//
// The default view is the master itself, cut to the stack's bounds and written
// as WebP at 1× and 2× for a layout 390 CSS px wide. Each of the five slabs is
// cut out of its own image with a soft alpha key against that image's
// background, placed where the master shows it, trimmed and written the same
// way: it is drawn only when its slab is lit, over the master, scaled about
// its centre and lifted — each slab at the least scale from LIT.scale up that
// covers the master's own copy of it. The Earth is never lit and has no
// cut-out. The card's 13 icons are cut out of their grid as squares inside
// the cell borders, on the card's white. A manifest gives the view's place,
// and for each slab its cut-out's box and lit scale, and — from the master —
// its tap outline, the line its name is laid along, its upright edges and the
// points where the km axis ticks and the temperature curve meet it. Then the
// proof: the view against the master, each cut against its own image (the
// build fails beyond CUT_LIMIT), the encoder's loss, and each slab lit.
//
//   node tools/build-diagram-atmosphere-art.mjs            build into the staging folder
//   node tools/build-diagram-atmosphere-art.mjs --measure  fit every placement again and
//                                                          print it; writes nothing
//
// No network, ever: the inputs are the approved files in data-sources/, each
// checked against the SHA-256 the seed records, and ffmpeg decodes and encodes
// on this machine. Needs ffmpeg with libwebp on the PATH.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { backgroundOf, cut as cutArt, decode, distances, edgeOf, encode as encodeArt, resample, straight } from './lib/diagram-art.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The approved art, the seed that records its hashes, and the staging folder
// the outputs wait in until the diagram's own folder lands in docs/diagrams/.
const ART = path.join(ROOT, 'data-sources/atmosphere-layers/art');
const SEED = path.join(ROOT, 'data-sources/atmosphere-layers/atmosphere.seed.json');
const OUT = path.join(ROOT, 'data-sources/atmosphere-layers/build');

// The whole stack without text: the position reference.
const MASTER = 'stack-master.png';
// The card's icons, in a grid of cells with light borders.
const ICON_MASTER = 'icons-master.png';
// Bottom to top, as the master stacks them: each covers the back of the one below.
const ORDER = ['earth', 'troposphere', 'stratosphere', 'mesosphere', 'thermosphere', 'exosphere'];
// The icon grid read left to right, top to bottom, as the seed's feature ids.
const ICONS = ['ozone', 'jets', 'balloon', 'weather', 'lightning', 'everest', 'jetstream', 'meteors', 'highclouds', 'aurora', 'ionosphere', 'radio', 'satellites'];
// The layout the art is made for: the master's width becomes this many CSS px.
const LAYOUT_WIDTH = 390;
// The icons' display size, in CSS px.
const ICON_SIZE = 40;

// Where each image sits on the master — its scale and its offset in master px
// — fitted by the ends of its two upright edges alone and in the master
// (--measure prints the fit; the build fails if these drift from it). The
// images are the model's own renders, a slab up to 17 px thicker or thinner
// than in the master, so each is centred on its four edge ends. The editor's
// measurements, the top of the front-left upright edge alone → in the master:
// exosphere 245 → 247, thermosphere 330 → 402, mesosphere 518 → 564,
// stratosphere 681 → 740, troposphere 679 → 934 — within 1.2 to 4.5 px of
// these — and the Earth at scale 0.9, its left edge at x 176, top y 1181,
// which the fit meets: 0.9, 176, 1181.5.
const PLACE = {
  earth: { scale: 0.9, dx: 51.8, dy: 322.9 },
  troposphere: { scale: 1, dx: 0.5, dy: 250.5 },
  stratosphere: { scale: 1, dx: 0, dy: 61 },
  mesosphere: { scale: 1, dx: -0.5, dy: 44.3 },
  thermosphere: { scale: 1, dx: 0.5, dy: 70.5 },
  exosphere: { scale: 1, dx: 1.5, dy: 0.8 },
};

// The soft key. Inside a picture's shape — every pixel SHAPE levels or more
// off its image's background, holes filled, eroded by ERODE px — it is solid,
// so painted light, a white cloud or a white edge, never turns into a window
// onto the slab below. Outside it, in the edge and the glow: a pixel as far as
// FLOOR from the background is that background's noise and is cut away; from
// SOLID on it is solid; between, it takes the least alpha that still explains
// it over the background, or the ramp's, whichever is more. Over that
// background every pixel then shows exactly as painted, so no halo. A part of
// the shape smaller than SPECK px is a speck of the image's noise, not art.
const KEY = { floor: 3, solid: 48, shape: 10, erode: 2, speck: 64 };
// The outline features placements are fitted by: pixels this far off the background.
const BODY = 24;
// WebP quality steps down from START until a file fits its cap, never below FLOOR.
const QUALITY = { start: 82, step: 6, floor: 58 };
// Size caps in bytes, per file.
const CAP = { view: { 1: 24 * 1024, 2: 64 * 1024 }, slab: { 1: 12 * 1024, 2: 32 * 1024 }, icon: { 1: 1024, 2: 2 * 1024 } };
// A lit slab, in layout px: scaled from SCALE up, never past MAX_SCALE, lifted
// LIFT, over a white outline OUTLINE wide and a soft white glow reaching GLOW.
const LIT = { scale: 1.08, maxScale: 1.2, lift: 2, outline: 1.5, glow: 8 };
// The cut's limit, in 0–255 levels: each slab's 2× pixels, as handed to the
// encoder, over the page's colour may differ from its own image by this much,
// mean and 99th percentile. The encoder's own loss is reported beside it.
const CUT_LIMIT = { mean: 1, p99: 4 };

const MEASURE = process.argv.includes('--measure');
const fail = (msg) => {
  throw new Error(`atmosphere art: ${msg}`);
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ---- the inputs, checked against the seed ------------------------------------------

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const recorded = seed.art?.files ?? fail(`the seed records no art hashes (${path.relative(ROOT, SEED)} has no art.files)`);
const INPUTS = [MASTER, ...ORDER.map((id) => `${id}.png`), ICON_MASTER];
const inputs = {};
for (const name of INPUTS) {
  const file = path.join(ART, name);
  if (!fs.existsSync(file)) fail(`${name} is missing from ${path.relative(ROOT, ART)}`);
  const hash = sha256(fs.readFileSync(file));
  if (!recorded[name]) fail(`the seed records no hash for ${name}`);
  if (recorded[name] !== hash) fail(`${name} is not the approved file: SHA-256 ${hash}, the seed records ${recorded[name]}`);
  inputs[name] = hash;
}
for (const name of Object.keys(recorded)) if (!INPUTS.includes(name)) fail(`the seed records ${name}, which this tool does not read`);
const layers = Object.values(seed.layers).sort((a, b) => a.order - b.order).map((l) => l.id);
if (layers.join() !== ORDER.slice(1).join()) fail(`the seed's layers, bottom to top, are ${layers.join(', ')}; the art has ${ORDER.slice(1).join(', ')}`);
if ([...ICONS].sort().join() !== Object.keys(seed.features).sort().join()) fail(`the icons (${ICONS.join(', ')}) are not the seed's features (${Object.keys(seed.features).join(', ')})`);

// ---- pixels: the shared cutting and saving, with this tool's constants ------------

const cut = (img, bg) => cutArt(img, bg, KEY);
const encode = (rgba, W, H, file, cap, alpha = true) => encodeArt(rgba, W, H, file, cap, { alpha, quality: QUALITY });

// ---- shapes ----------------------------------------------------------------------------

// The solid shape (alpha over one half) of premultiplied pixels W×H standing at
// (X0, Y0) on the master: its upright edges, front corner, the slope of its
// front-left face, and its convex outline, all in master px.
function shapeOf(px, W, H, X0, Y0) {
  const left = new Int32Array(H).fill(-1);
  const right = new Int32Array(H).fill(-1);
  const low = new Int32Array(W).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (px[(y * W + x) * 4 + 3] > 0.5) {
        if (left[y] < 0) left[y] = x;
        right[y] = x;
        low[x] = y;
      }
  // the upright edges, found as the placements are fitted
  const upright = (ends, pick) => {
    const run = longest(uprightRuns(ends, outermost(ends, pick), pick));
    return { x: X0 + run.x, top: Y0 + run.top, bottom: Y0 + run.bottom };
  };
  const rows = [...left.keys()].filter((y) => left[y] >= 0);
  const L = upright(left, Math.min);
  const R = upright(right, Math.max);
  const lowest = Math.max(...low);
  const frontXs = [...low.keys()].filter((x) => low[x] >= lowest - 1);
  const F = { x: X0 + frontXs.reduce((a, b) => a + b, 0) / frontXs.length, y: Y0 + lowest };
  // the front-left face's lower edge, fitted over its middle half
  const pts = [];
  for (let x = Math.round(L.x - X0 + 0.25 * (F.x - L.x)); x <= Math.round(L.x - X0 + 0.75 * (F.x - L.x)); x++) if (low[x] >= 0) pts.push([X0 + x, Y0 + low[x]]);
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  // the convex outline of every row's two ends
  const ends = [];
  for (const y of rows) ends.push([X0 + left[y], Y0 + y], [X0 + right[y] + 1, Y0 + y], [X0 + left[y], Y0 + y + 1], [X0 + right[y] + 1, Y0 + y + 1]);
  return { L, R, F, slope, lowerAt: (x) => my + slope * (x - mx), hull: simplify(hull(ends), 1.5) };
}

// Andrew's monotone chain.
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// Douglas–Peucker on a closed ring, split at its two farthest points.
function simplify(ring, tol) {
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let worst = 0;
    let at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / len;
      if (d > worst) [worst, at] = [d, i];
    }
    return worst <= tol ? [a, b] : [...dp(pts.slice(0, at + 1)).slice(0, -1), ...dp(pts.slice(at))];
  };
  let far = 0;
  for (let i = 1; i < ring.length; i++) if (Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]) > Math.hypot(ring[far][0] - ring[0][0], ring[far][1] - ring[0][1])) far = i;
  return [...dp(ring.slice(0, far + 1)).slice(0, -1), ...dp([...ring.slice(far), ring[0]]).slice(0, -1)];
}

// ---- the icon grid ---------------------------------------------------------------------

// The cells: the light border lines, found as long thin runs of their colour
// (longer than 195 px, at most 4 px thick — an icon's own light blue makes
// shorter or thicker ones), 8 across and 8 down; then in each cell holding an
// icon, the largest centred square 8 px inside its lines, clear of the rounded
// corners, whose corners are checked to hold no border pixel. In reading order.
function iconSquares(img) {
  const { w, h, data } = img;
  const white = backgroundOf(img);
  const isBorder = (x, y) => {
    const i = (y * w + x) * 3;
    const off = Math.max(white[0] - data[i], white[1] - data[i + 1], white[2] - data[i + 2]);
    return off >= 6 && off <= 70 && data[i + 2] - data[i] >= 5;
  };
  const lines = (n, m, at) => {
    const hits = [];
    for (let a = 0; a < n; a++) {
      let run = 0;
      let longest = 0;
      for (let b = 0; b < m; b++) {
        run = at(a, b) ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      if (longest > 195) hits.push(a);
    }
    // neighbouring hits are one line, and a line is thin
    const groups = [];
    for (const a of hits) if (!groups.length || a - groups[groups.length - 1].at(-1) > 1) groups.push([a]);
    else groups[groups.length - 1].push(a);
    return groups.filter((g) => g.length <= 4).map((g) => [g[0], g[g.length - 1]]);
  };
  const cols = lines(w, h, (x, y) => isBorder(x, y));
  const rows = lines(h, w, (y, x) => isBorder(x, y));
  if (cols.length !== 8 || rows.length !== 8) fail(`${ICON_MASTER}: found ${cols.length} border lines across and ${rows.length} down, not 8 and 8`);
  // cells lie between a line and the next, the gutters between them are narrow
  const spans = (ls) => ls.slice(0, -1).map((l, i) => [l[1] + 1, ls[i + 1][0] - 1]).filter(([a, b]) => b - a > 120);
  const INSET = 8;
  const CORNER = 24;
  const squares = [];
  for (const [y0, y1] of spans(rows))
    for (const [x0, x1] of spans(cols)) {
      let ink = 0;
      for (let y = y0 + 20; y < y1 - 20; y += 2) for (let x = x0 + 20; x < x1 - 20; x += 2) if (Math.max(...[0, 1, 2].map((c) => white[c] - data[(y * w + x) * 3 + c])) > 24) ink++;
      if (ink < 50) continue;
      const cx = (x0 + x1 + 1) / 2;
      const cy = (y0 + y1 + 1) / 2;
      let side = Math.min(x1 - x0 + 1, y1 - y0 + 1) - 2 * INSET;
      // a border pixel in any of the square's corners shrinks it
      const cornersClean = (s) => {
        const [sx, sy] = [Math.round(cx - s / 2), Math.round(cy - s / 2)];
        for (const [ax, ay] of [[sx, sy], [sx + s - CORNER, sy], [sx, sy + s - CORNER], [sx + s - CORNER, sy + s - CORNER]])
          for (let y = ay; y < ay + CORNER; y++) for (let x = ax; x < ax + CORNER; x++) if (isBorder(x, y) && (x - x0 < CORNER || x1 - x < CORNER) && (y - y0 < CORNER || y1 - y < CORNER)) return false;
        return true;
      };
      let shrunk = 0;
      while (!cornersClean(side)) {
        if ((shrunk += 2) > 20) fail(`${ICON_MASTER}: the cell at ${x0},${y0} keeps border pixels in its square`);
        side -= 2;
      }
      squares.push({ x: Math.round(cx - side / 2), y: Math.round(cy - side / 2), side });
    }
  if (squares.length !== ICONS.length) fail(`${ICON_MASTER} holds ${squares.length} icons, not ${ICONS.length}`);
  return { squares, white };
}

// ---- placements, fitted by outline -----------------------------------------------------

// Each row's outermost body pixels, left and right (−1 for none).
function endsOf(img) {
  const dist = distances(img, backgroundOf(img));
  const left = new Int32Array(img.h).fill(-1);
  const right = new Int32Array(img.h).fill(-1);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++)
      if (dist[y * img.w + x] > BODY) {
        left[y] = x;
        break;
      }
    for (let x = img.w - 1; x >= 0; x--)
      if (dist[y * img.w + x] > BODY) {
        right[y] = x;
        break;
      }
  }
  return { left, right };
}

// Upright edges: runs of rows whose outermost body pixel stands within 2 px
// of x, a break of up to 4 rows bridged; each with its own outermost x.
function uprightRuns(ends, x, pick) {
  const runs = [];
  let run = null;
  for (let y = 0; y <= ends.length; y++) {
    const on = y < ends.length && ends[y] >= 0 && Math.abs(ends[y] - x) <= 2;
    if (on) {
      if (run && y - run.bottom <= 5) run.bottom = y;
      else run = { top: y, bottom: y };
      if (!runs.includes(run)) runs.push(run);
    }
  }
  return runs
    .filter((r) => r.bottom - r.top >= 20)
    .map((r) => ({ ...r, x: pick(...Array.from(ends.slice(r.top, r.bottom + 1)).filter((v) => v >= 0 && Math.abs(v - x) <= 2)) }));
}
const outermost = (ends, pick) => pick(...Array.from(ends).filter((v) => v >= 0));
const longest = (runs) => runs.reduce((a, b) => (b.bottom - b.top > a.bottom - a.top ? b : a));

// Every placement, from the ends of each picture's two upright edges alone and
// in the master: the offset that best fits all four ends at once, so a slab
// drawn a little thicker or thinner than in the master is centred on it. The
// Earth's scale comes from the distance between its two upright edges, the
// Earth being the only picture wider than the slabs in the master.
function fitPlacements(master, images) {
  // the editor's offsets, only to tell each slab's edges in the master apart
  const NEAR = { exosphere: 2, thermosphere: 72, mesosphere: 46, stratosphere: 59, troposphere: 255 };
  const m = endsOf(master);
  const fits = {};
  for (const id of ORDER) {
    const a = endsOf(images[id]);
    const aL = longest(uprightRuns(a.left, outermost(a.left, Math.min), Math.min));
    const aR = longest(uprightRuns(a.right, outermost(a.right, Math.max), Math.max));
    let mL;
    let mR;
    let scale = 1;
    if (id === 'earth') {
      mL = longest(uprightRuns(m.left, outermost(m.left, Math.min), Math.min));
      mR = longest(uprightRuns(m.right, outermost(m.right, Math.max), Math.max));
      scale = (mR.x - mL.x) / (aR.x - aL.x);
    } else {
      const nearest = (runs, top) => runs.reduce((p, r) => (Math.abs(r.top - top) < Math.abs(p.top - top) ? r : p));
      mL = nearest(uprightRuns(m.left, aL.x, Math.min), aL.top + NEAR[id]);
      mR = nearest(uprightRuns(m.right, aR.x, Math.max), aR.top + NEAR[id]);
    }
    const dx = (mL.x - aL.x * scale + (mR.x - aR.x * scale)) / 2;
    const dys = [mL.top - aL.top * scale, mL.bottom - aL.bottom * scale, mR.top - aR.top * scale, mR.bottom - aR.bottom * scale];
    const dy = dys.reduce((s, v) => s + v, 0) / 4;
    fits[id] = { scale: round(scale, 4), dx: round(dx, 1), dy: round(dy, 1), alone: { left: aL, right: aR }, master: { left: mL, right: mR }, spread: round(Math.max(...dys) - Math.min(...dys), 1) };
  }
  return fits;
}

// ---- the build -------------------------------------------------------------------------

const master = decode(path.join(ART, MASTER));
const images = Object.fromEntries(ORDER.map((id) => [id, decode(path.join(ART, `${id}.png`))]));
const fits = fitPlacements(master, images);
if (MEASURE) {
  const EDITOR = { exosphere: [245, 247], thermosphere: [330, 402], mesosphere: [518, 564], stratosphere: [681, 740], troposphere: [679, 934] };
  for (const [id, f] of Object.entries(fits)) {
    const e = (r) => `x ${r.x}, y ${r.top}–${r.bottom}`;
    const editor = EDITOR[id] ? `editor ${EDITOR[id][0]} → ${EDITOR[id][1]} (+${EDITOR[id][1] - EDITOR[id][0]})` : 'editor: scale 0.9, left x 176, top y 1181';
    console.log(
      `${id.padEnd(13)} alone: left ${e(f.alone.left)}, right ${e(f.alone.right)} | master: left ${e(f.master.left)}, right ${e(f.master.right)} | ` +
        `fit scale ${f.scale} dx ${f.dx} dy ${f.dy} (the four ends spread ${f.spread} px) | ${editor} | recorded ${JSON.stringify(PLACE[id])}`,
    );
  }
  process.exit(0);
}
for (const [id, f] of Object.entries(fits)) {
  const p = PLACE[id];
  if (Math.abs(p.scale - f.scale) > 0.0005 || Math.abs(p.dx - f.dx) > 0.5 || Math.abs(p.dy - f.dy) > 0.5)
    fail(`${id} is recorded at ${JSON.stringify(p)} but fits at scale ${f.scale} dx ${f.dx} dy ${f.dy} — stop and report; never re-record to pass`);
}

const S = LAYOUT_WIDTH / master.w;
const LAYOUT_HEIGHT = Math.round(master.h * S);
const W2 = LAYOUT_WIDTH * 2;
const H2 = LAYOUT_HEIGHT * 2;
const page = backgroundOf(master);
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const toLayout = (p) => [round(p[0] * S), round(p[1] * S)];
const AS_IS = { scale: 1, dx: 0, dy: 0 };
const opaqueOf = (img) => {
  const px = new Float32Array(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i++) {
    for (let c = 0; c < 3; c++) px[i * 4 + c] = img.data[i * 3 + c] / 255;
    px[i * 4 + 3] = 1;
  }
  return { w: img.w, h: img.h, px };
};
// emptied rather than removed, so a shell standing in it does not stop the build
fs.mkdirSync(OUT, { recursive: true });
for (const entry of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
for (const dir of ['slabs', 'icons', 'proof']) fs.mkdirSync(path.join(OUT, dir), { recursive: true });
const sizes = [];

// ---- the default view: the master itself, cut to the stack's bounds ------------------------

const masterCut = cut(master, page);
let [vx0, vy0, vx1, vy1] = [Infinity, Infinity, -1, -1];
for (let y = 0; y < master.h; y++)
  for (let x = 0; x < master.w; x++)
    if (masterCut.px[(y * master.w + x) * 4 + 3] > 0) {
      vx0 = Math.min(vx0, x);
      vy0 = Math.min(vy0, y);
      vx1 = Math.max(vx1, x);
      vy1 = Math.max(vy1, y);
    }
const view = { x: Math.floor(vx0 * S), y: Math.floor(vy0 * S) };
view.width = Math.ceil((vx1 + 1) * S) - view.x;
view.height = Math.ceil((vy1 + 1) * S) - view.y;
view.files = {};
const masterOpaque = opaqueOf(master);
const viewBefore = {};
for (const k of [1, 2]) {
  const [W, H] = [view.width * k, view.height * k];
  const file = path.join(OUT, `stack@${k}x.webp`);
  viewBefore[k] = straight(resample(masterOpaque, AS_IS, S * k, view.x * k, view.y * k, W, H), page);
  const got = encode(viewBefore[k], W, H, file, CAP.view[k], false);
  view.files[`${k}x`] = `stack@${k}x.webp`;
  sizes.push({ file: view.files[`${k}x`], W, H, ...got });
}

// ---- the five slabs, cut out for the lit state ------------------------------------------

// The Earth is never lit, so it has no cut-out; its place in the master still
// gives the boundary at the surface.
const LAYERS = ORDER.slice(1);
const before2x = {};
const slabs = LAYERS.map((id, n) => {
  const img = images[id];
  const src = cut(img, backgroundOf(img));
  const place = PLACE[id];
  // what it covers on the master, at the master's own pixels
  let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++)
      if (src.px[(y * src.w + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const [mx0, my0] = [Math.floor(x0 * place.scale + place.dx), Math.floor(y0 * place.scale + place.dy)];
  const [mx1, my1] = [Math.ceil((x1 + 1) * place.scale + place.dx), Math.ceil((y1 + 1) * place.scale + place.dy)];
  if (mx0 < 0 || my0 < 0 || mx1 > master.w || my1 > master.h) fail(`${id} leaves the master's frame when placed: its cut spans x ${x0}–${x1}, y ${y0}–${y1} alone, x ${mx0}–${mx1}, y ${my0}–${my1} on the master`);
  // its box in layout px, whole pixels, so the 1× and 2× files cover it exactly
  const X0 = Math.floor(mx0 * S);
  const Y0 = Math.floor(my0 * S);
  const X1 = Math.ceil(mx1 * S);
  const Y1 = Math.ceil(my1 * S);
  const files = {};
  for (const k of [1, 2]) {
    const [W, H] = [(X1 - X0) * k, (Y1 - Y0) * k];
    const file = path.join(OUT, 'slabs', `${id}@${k}x.webp`);
    const rgba = straight(resample(src, place, S * k, X0 * k, Y0 * k, W, H), page);
    if (k === 2) before2x[id] = rgba;
    const got = encode(rgba, W, H, file, CAP.slab[k]);
    files[`${k}x`] = `slabs/${id}@${k}x.webp`;
    sizes.push({ file: files[`${k}x`], W, H, ...got });
  }
  // Its shape, at the master's own pixels. The default view is the master, so
  // everything laid over it follows the master's copy of the slab: the
  // cut-out's shape, its top face moved to the master's upright tops, its foot
  // to their feet, the walls between stretched; across, nothing moves.
  const shape = shapeOf(resample(src, place, 1, mx0, my0, mx1 - mx0, my1 - my0), mx1 - mx0, my1 - my0, mx0, my0);
  const onMaster = onMasterOf(fits[id], place);
  const wall = shape.L.bottom + 1 - shape.L.top;
  const along = (t) => shape.L.x + t * (shape.F.x - shape.L.x);
  const nameAt = (t) => onMaster([along(t), shape.lowerAt(along(t)) - 0.55 * wall]);
  const [from, to] = [nameAt(0.07), nameAt(0.55)];
  const m = fits[id].master;
  return {
    id,
    order: n + 1,
    x: X0,
    y: Y0,
    width: X1 - X0,
    height: Y1 - Y0,
    files,
    outline: shape.hull.map(onMaster).map(toLayout),
    nameLine: {
      from: toLayout(from),
      to: toLayout(to),
      angle: round((Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI),
      faceHeight: round((m.left.bottom + 1 - m.left.top) * S),
    },
    edges: edgesOf(m),
  };
});

// A master frame point of a placed picture, moved onto the master's own copy of
// it: above its upright tops by what the tops differ, below its feet by what
// the feet differ, in between in proportion, each read along from the left
// upright to the right.
function onMasterOf(f, place) {
  const at = (v) => v * place.scale;
  const cutL = { x: at(f.alone.left.x) + place.dx, top: at(f.alone.left.top) + place.dy, foot: at(f.alone.left.bottom + 1) + place.dy };
  const cutR = { x: at(f.alone.right.x + 1) + place.dx, top: at(f.alone.right.top) + place.dy, foot: at(f.alone.right.bottom + 1) + place.dy };
  const mL = { top: f.master.left.top, foot: f.master.left.bottom + 1 };
  const mR = { top: f.master.right.top, foot: f.master.right.bottom + 1 };
  const clamp = (v) => Math.max(0, Math.min(1, v));
  return ([x, y]) => {
    const t = clamp((x - cutL.x) / (cutR.x - cutL.x));
    const top = cutL.top + t * (cutR.top - cutL.top);
    const foot = cutL.foot + t * (cutR.foot - cutL.foot);
    const dTop = mL.top + t * (mR.top - mL.top) - top;
    const dFoot = mL.foot + t * (mR.foot - mL.foot) - foot;
    return [x, y + dTop + clamp((y - top) / (foot - top)) * (dFoot - dTop)];
  };
}

// A picture's upright edges in the master, in layout px.
function edgesOf(m) {
  return {
    left: { top: toLayout([m.left.x, m.left.top]), bottom: toLayout([m.left.x, m.left.bottom + 1]) },
    right: { top: toLayout([m.right.x + 1, m.right.top]), bottom: toLayout([m.right.x + 1, m.right.bottom + 1]) },
  };
}

// The boundaries: each in the middle of the gap between two pictures in the
// master, on the left for the km axis and on the right for the curve; the
// surface between the Earth and the troposphere; above the exosphere, half a
// gap over its top.
const stack = [{ id: 'earth', edges: edgesOf(fits.earth.master) }, ...slabs];
const mid = (a, b) => round((a + b) / 2);
const gaps = stack.slice(2).map((s, i) => stack[i + 1].edges.left.top[1] - s.edges.left.bottom[1]);
const halfGap = gaps.reduce((a, b) => a + b, 0) / gaps.length / 2;
const boundaryIds = Object.fromEntries(Object.values(seed.boundaries).map((b) => [b.between.join('|'), b.id]));
const boundaries = stack.map((below, i) => {
  const above = stack[i + 1];
  return {
    id: above ? boundaryIds[`${below.id}|${above.id}`] ?? null : null,
    between: [below.id, above ? above.id : null],
    left: [below.edges.left.top[0], above ? mid(below.edges.left.top[1], above.edges.left.bottom[1]) : round(below.edges.left.top[1] - halfGap)],
    right: [below.edges.right.top[0], above ? mid(below.edges.right.top[1], above.edges.right.bottom[1]) : round(below.edges.right.top[1] - halfGap)],
  };
});
for (const [n, s] of slabs.entries()) {
  const [under, over] = [boundaries[n], boundaries[n + 1]];
  s.meets = {
    axis: { bottom: [s.edges.left.bottom[0], under.left[1]], top: [s.edges.left.top[0], over.left[1]] },
    curve: { bottom: [s.edges.right.bottom[0], under.right[1]], top: [s.edges.right.top[0], over.right[1]] },
  };
}

// ---- the lit slab covers the master's own copy ------------------------------------------

// At 2×: each slab's own copy in the master — the master's solid shape inside
// its outline and inside no outline above it — and the lit cut-out, scaled
// about its box's centre and lifted, solid where its alpha passes one half.
// Each slab takes the least scale from LIT.scale up at which the cut-out
// alone covers its own copy; the white outline and the glow then lie wholly
// beyond it, and are free to be drawn thinner.
const masterSolid = (() => {
  const px = resample(masterCut, AS_IS, 2 * S, 0, 0, W2, H2);
  const out = new Uint8Array(W2 * H2);
  for (let i = 0; i < W2 * H2; i++) out[i] = px[i * 4 + 3] > 0.5 ? 1 : 0;
  return out;
})();
const fill = (poly) => {
  const out = new Uint8Array(W2 * H2);
  const p = poly.map(([x, y]) => [x * 2, y * 2]);
  const ys = p.map((q) => q[1]);
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H2 - 1, Math.ceil(Math.max(...ys))); y++) {
    const cy = y + 0.5;
    const xs = [];
    for (let i = 0; i < p.length; i++) {
      const [a, b] = [p[i], p[(i + 1) % p.length]];
      if (a[1] <= cy !== b[1] <= cy) xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W2 - 1, Math.floor(xs[k + 1] - 0.5)); x++) out[y * W2 + x] = 1;
  }
  return out;
};
const outlineMasks = slabs.map((s) => fill(s.outline));
// the lit cut-out's alpha on the 2× canvas: scaled about its box's centre, lifted
const litAlpha = (n, scale) => {
  const s = slabs[n];
  const px = before2x[s.id];
  const [w, h] = [s.width * 2, s.height * 2];
  const [cx, cy] = [(s.x + s.width / 2) * 2, (s.y + s.height / 2) * 2];
  const lift = LIT.lift * 2;
  const out = new Float32Array(W2 * H2);
  const [X0, X1] = [Math.max(0, Math.floor(cx - (w * scale) / 2) - 1), Math.min(W2 - 1, Math.ceil(cx + (w * scale) / 2) + 1)];
  const [Y0, Y1] = [Math.max(0, Math.floor(cy - lift - (h * scale) / 2) - 1), Math.min(H2 - 1, Math.ceil(cy - lift + (h * scale) / 2) + 1)];
  for (let Y = Y0; Y <= Y1; Y++)
    for (let X = X0; X <= X1; X++) {
      // bilinear, in the cut-out's own 2× pixels
      const sx = (X + 0.5 - cx) / scale + w / 2 - 0.5;
      const sy = (Y + 0.5 - (cy - lift)) / scale + h / 2 - 0.5;
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      let a = 0;
      for (const [dx, dy, wt] of [[0, 0, (1 - (sx - ix)) * (1 - (sy - iy))], [1, 0, (sx - ix) * (1 - (sy - iy))], [0, 1, (1 - (sx - ix)) * (sy - iy)], [1, 1, (sx - ix) * (sy - iy)]]) {
        const [u, v] = [ix + dx, iy + dy];
        if (u >= 0 && v >= 0 && u < w && v < h) a += (px[(v * w + u) * 4 + 3] / 255) * wt;
      }
      out[Y * W2 + X] = a;
    }
  return out;
};
// how far each pixel lies from the nearest pixel of a mask (3–4 chamfer, px)
const distanceTo = (mask) => {
  const d = new Float32Array(W2 * H2);
  for (let i = 0; i < W2 * H2; i++) d[i] = mask[i] ? 0 : 1e9;
  for (let y = 0; y < H2; y++)
    for (let x = 0; x < W2; x++) {
      const i = y * W2 + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 3);
      if (y > 0) {
        d[i] = Math.min(d[i], d[i - W2] + 3);
        if (x > 0) d[i] = Math.min(d[i], d[i - W2 - 1] + 4);
        if (x < W2 - 1) d[i] = Math.min(d[i], d[i - W2 + 1] + 4);
      }
    }
  for (let y = H2 - 1; y >= 0; y--)
    for (let x = W2 - 1; x >= 0; x--) {
      const i = y * W2 + x;
      if (x < W2 - 1) d[i] = Math.min(d[i], d[i + 1] + 3);
      if (y < H2 - 1) {
        d[i] = Math.min(d[i], d[i + W2] + 3);
        if (x < W2 - 1) d[i] = Math.min(d[i], d[i + W2 + 1] + 4);
        if (x > 0) d[i] = Math.min(d[i], d[i + W2 - 1] + 4);
      }
    }
  for (let i = 0; i < W2 * H2; i++) d[i] /= 3;
  return d;
};
// The part of a slab's own copy the lit cut-out leaves showing: its pixel
// count, and its reach — how far past the cut-out's edge it shows, in 2× px.
const uncovered = (own, cover) => {
  let count = 0;
  let reach = 0;
  const d = distanceTo(cover);
  for (let i = 0; i < W2 * H2; i++)
    if (own[i] && !cover[i]) {
      count++;
      reach = Math.max(reach, d[i]);
    }
  return { pixels: count, reach: round(reach, 1) };
};
const coverage = {};
for (const [n, s] of slabs.entries()) {
  const own = new Uint8Array(W2 * H2);
  for (let i = 0; i < W2 * H2; i++) own[i] = masterSolid[i] && outlineMasks[n][i] && !outlineMasks.slice(n + 1).some((m) => m[i]) ? 1 : 0;
  const coverAt = (scale) => {
    const a = litAlpha(n, scale);
    const cover = new Uint8Array(W2 * H2);
    for (let i = 0; i < W2 * H2; i++) cover[i] = a[i] > 0.5 ? 1 : 0;
    return cover;
  };
  const atFirst = uncovered(own, coverAt(LIT.scale));
  let scale = LIT.scale;
  let left = atFirst;
  while (left.pixels > 0) {
    scale = round(scale + 0.005, 3);
    if (scale > LIT.maxScale) fail(`${s.id}: even at scale ${LIT.maxScale} the lit cut-out leaves ${left.pixels} px of the master's own copy showing`);
    left = uncovered(own, coverAt(scale));
  }
  s.litScale = scale;
  coverage[s.id] = { ownPixels: own.reduce((a, b) => a + b, 0), atLitScale: atFirst, scale };
}

// ---- the icons -------------------------------------------------------------------------

const iconMaster = decode(path.join(ART, ICON_MASTER));
const grid = iconSquares(iconMaster);
const icons = grid.squares.map((sq, n) => {
  const id = ICONS[n];
  // each icon cut out of its own square, opaque, on the card's own white as the
  // grid paints it: nothing is keyed away
  const iconCut = { w: sq.side, h: sq.side, px: new Float32Array(sq.side * sq.side * 4) };
  for (let y = 0; y < sq.side; y++)
    for (let x = 0; x < sq.side; x++) {
      const [i, j] = [((sq.y + y) * iconMaster.w + sq.x + x) * 3, (y * sq.side + x) * 4];
      for (let c = 0; c < 3; c++) iconCut.px[j + c] = iconMaster.data[i + c] / 255;
      iconCut.px[j + 3] = 1;
    }
  const files = {};
  for (const k of [1, 2]) {
    const px = ICON_SIZE * k;
    const file = path.join(OUT, 'icons', `${id}@${k}x.webp`);
    const got = encode(straight(resample(iconCut, AS_IS, px / sq.side, 0, 0, px, px), grid.white), px, px, file, CAP.icon[k], false);
    files[`${k}x`] = `icons/${id}@${k}x.webp`;
    sizes.push({ file: files[`${k}x`], W: px, H: px, ...got });
  }
  return { id, files, size: ICON_SIZE };
});

// What the opaque files show at their edges, for the page and the card behind them.
view.edge = hex(edgeOf(Object.values(view.files).map((f) => path.join(OUT, f))));
const iconEdge = hex(edgeOf(icons.flatMap((i) => Object.values(i.files).map((f) => path.join(OUT, f)))));

// ---- the manifest ----------------------------------------------------------------------

const manifest = {
  _about:
    `The atmosphere-layers exploded view, for a layout ${LAYOUT_WIDTH} CSS px wide in which every position ` +
    `below is given (layout px; the master's ${master.w} px make ${LAYOUT_WIDTH}). The default view is "view": ` +
    'stack-master.png itself, cut to the stack\'s bounds, on the page\'s "background"; its files show ' +
    '"view.edge" at their edges once decoded, a level or two off it, and the page behind them takes that. A tapped slab is lit: ' +
    'its cut-out, "files" at its box, is drawn over the view scaled by "litScale" about the box\'s centre and ' +
    'lifted "lit.lift" px, over a white outline "lit.outline" px wide and a soft white glow reaching ' +
    '"lit.glow" px — at that scale it covers the master\'s own copy of the slab. The other slabs are not ' +
    'dimmed. "outline" is the tap area, on the master; taps test the slabs from the highest "order" down, ' +
    'since each outline includes its slab\'s top face hidden behind the slab above. "nameLine" is the line ' +
    'the slab\'s Bengali name is laid along, 45% down its front-left face; "edges" its upright edges\' ends ' +
    'in the master; "meets" where the km axis ticks (left) and the temperature curve (right) meet it. Each ' +
    'boundary lies in the middle of the gap between two pictures of the master; above the exosphere, half ' +
    `a gap over its top. Each icon is a square ${ICON_SIZE} CSS px across, on the card's white; their files ` +
    'show "iconEdge" at their edges once decoded, and the card behind them takes that. Written by ' +
    'tools/build-diagram-atmosphere-art.mjs.',
  inputs,
  layout: { width: LAYOUT_WIDTH, height: LAYOUT_HEIGHT, fromMaster: S, background: hex(page) },
  view,
  lit: { lift: LIT.lift, outline: LIT.outline, glow: LIT.glow },
  slabs,
  boundaries,
  icons,
  iconEdge,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// ---- the proof -------------------------------------------------------------------------

const summary = (list) => {
  const v = Float64Array.from(list).sort();
  const at = (q) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  return { pixels: v.length, mean: round(v.reduce((a, b) => a + b, 0) / v.length), p95: at(0.95), p99: at(0.99), max: v[v.length - 1], over16: round((100 * v.filter((d) => d > 16).length) / v.length) };
};
// a pixel of straight RGBA bytes over the page's colour, one channel, 0–255
const over = (rgba, p, c) => Math.round((rgba[p + c] / 255) * (rgba[p + 3] / 255) * 255 + page[c] * (1 - rgba[p + 3] / 255));
const blankCanvas = () => {
  const c = new Float32Array(W2 * H2 * 3);
  for (let i = 0; i < W2 * H2; i++) for (let k = 0; k < 3; k++) c[i * 3 + k] = page[k];
  return c;
};
const savePng = (rgb, w, h, file) => {
  const buf = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h * 3; i++) buf[i] = Math.max(0, Math.min(255, Math.round(rgb[i])));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', '-', file], { input: buf });
};
const proof = { view: {}, codec: {}, cut: {}, coverage };

// The default view: its 2× file, over the page's colour, against the master
// brought to the same size — within its box only the encoder's loss, outside
// it the page's colour against the master's own background.
const viewFile = decode(path.join(OUT, view.files['2x']), 'rgba');
const reference = resample(masterOpaque, AS_IS, 2 * S, 0, 0, W2, H2);
const shown = blankCanvas();
for (let y = 0; y < viewFile.h; y++)
  for (let x = 0; x < viewFile.w; x++) for (let c = 0; c < 3; c++) shown[((view.y * 2 + y) * W2 + view.x * 2 + x) * 3 + c] = viewFile.data[(y * viewFile.w + x) * 4 + c];
{
  const inBox = [];
  const outBox = [];
  const sheet = new Float32Array(W2 * 3 * H2 * 3);
  for (let y = 0; y < H2; y++)
    for (let x = 0; x < W2; x++) {
      const i = y * W2 + x;
      let d = 0;
      for (let c = 0; c < 3; c++) {
        const [a, b] = [shown[i * 3 + c], Math.round(reference[i * 4 + c] * 255)];
        d = Math.max(d, Math.abs(a - b));
        sheet[(y * W2 * 3 + x) * 3 + c] = a;
        sheet[(y * W2 * 3 + W2 + x) * 3 + c] = b;
      }
      for (let c = 0; c < 3; c++) sheet[(y * W2 * 3 + 2 * W2 + x) * 3 + c] = Math.min(255, d * 8);
      const inside = x >= view.x * 2 && x < (view.x + view.width) * 2 && y >= view.y * 2 && y < (view.y + view.height) * 2;
      (inside ? inBox : outBox).push(d);
    }
  proof.view = { inside: summary(inBox), outside: summary(outBox) };
  savePng(sheet, W2 * 3, H2, path.join(OUT, 'proof', 'view-master-difference.png'));
}
for (const k of [1, 2]) {
  const got = decode(path.join(OUT, view.files[`${k}x`]), 'rgba');
  const diffs = [];
  for (let p = 0; p < got.data.length; p += 4) diffs.push(Math.max(...[0, 1, 2].map((c) => Math.abs(got.data[p + c] - viewBefore[k][p + c]))));
  proof.codec[view.files[`${k}x`]] = summary(diffs);
}

// Each cut-out: over the page's colour, as handed to the encoder, against its
// own image — the cut, held to CUT_LIMIT — and as encoded, against that — the
// encoder's loss, reported.
const decodedCut = {};
for (const s of slabs) {
  const img = decode(path.join(OUT, s.files['2x']), 'rgba');
  decodedCut[s.id] = img;
  const own = resample(opaqueOf(images[s.id]), PLACE[s.id], 2 * S, s.x * 2, s.y * 2, img.w, img.h);
  const pre = before2x[s.id];
  const cutDiffs = [];
  const codecDiffs = [];
  for (let p = 0; p < img.data.length; p += 4) {
    let d = 0;
    let e = 0;
    for (let c = 0; c < 3; c++) {
      d = Math.max(d, Math.abs(over(pre, p, c) - Math.round(own[p + c] * 255)));
      e = Math.max(e, Math.abs(over(img.data, p, c) - over(pre, p, c)));
    }
    cutDiffs.push(d);
    codecDiffs.push(e);
  }
  proof.cut[s.id] = summary(cutDiffs);
  proof.codec[s.files['2x']] = summary(codecDiffs);
}

// Each slab lit, as the page will draw it: the default view; the lit cut-out's
// soft white glow and white outline; the cut-out, scaled and lifted, on top.
for (const [n, s] of slabs.entries()) {
  const canvas = Float32Array.from(shown);
  const img = decodedCut[s.id];
  const [w, h] = [img.w, img.h];
  const [cx, cy] = [(s.x + s.width / 2) * 2, (s.y + s.height / 2) * 2 - LIT.lift * 2];
  const a = litAlpha(n, s.litScale);
  const solid = new Uint8Array(W2 * H2);
  for (let i = 0; i < W2 * H2; i++) solid[i] = a[i] > 0.5 ? 1 : 0;
  const d = distanceTo(solid);
  for (let i = 0; i < W2 * H2; i++) {
    const t = Math.min(1, d[i] / (LIT.glow * 2));
    const glowA = 0.85 * (1 - t * t * (3 - 2 * t));
    const ringA = Math.max(0, Math.min(1, LIT.outline * 2 + 0.5 - d[i]));
    const white = 1 - (1 - glowA) * (1 - ringA);
    for (let c = 0; c < 3; c++) canvas[i * 3 + c] = canvas[i * 3 + c] * (1 - white) + 255 * white;
  }
  for (let Y = 0; Y < H2; Y++)
    for (let X = 0; X < W2; X++) {
      const sx = (X + 0.5 - cx) / s.litScale + w / 2 - 0.5;
      const sy = (Y + 0.5 - cy) / s.litScale + h / 2 - 0.5;
      if (sx < -1 || sy < -1 || sx > w || sy > h) continue;
      const [ix, iy] = [Math.floor(sx), Math.floor(sy)];
      const acc = [0, 0, 0, 0];
      for (const [dx, dy, wt] of [[0, 0, (1 - (sx - ix)) * (1 - (sy - iy))], [1, 0, (sx - ix) * (1 - (sy - iy))], [0, 1, (1 - (sx - ix)) * (sy - iy)], [1, 1, (sx - ix) * (sy - iy)]]) {
        const [u, v] = [ix + dx, iy + dy];
        if (u < 0 || v < 0 || u >= w || v >= h) continue;
        const p = (v * w + u) * 4;
        const al = img.data[p + 3] / 255;
        for (let c = 0; c < 3; c++) acc[c] += img.data[p + c] * al * wt;
        acc[3] += al * wt;
      }
      if (acc[3] <= 0) continue;
      const i = Y * W2 + X;
      for (let c = 0; c < 3; c++) canvas[i * 3 + c] = canvas[i * 3 + c] * (1 - acc[3]) + acc[c];
    }
  savePng(canvas, W2, H2, path.join(OUT, 'proof', `lit-${s.id}.png`));
}
fs.writeFileSync(path.join(OUT, 'proof', 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);

// ---- the report ------------------------------------------------------------------------

console.log(`inputs: ${INPUTS.length} files, each the approved one by the seed's SHA-256`);
console.log(`layout ${LAYOUT_WIDTH}×${LAYOUT_HEIGHT} (master ×${round(S, 6)}), background ${hex(page)}; view at ${view.x},${view.y} ${view.width}×${view.height}; icons on the card's white ${hex(grid.white)}`);
for (const f of sizes) console.log(`  ${f.file.padEnd(28)} ${`${f.W}×${f.H}`.padStart(9)}  ${String(f.bytes).padStart(6)} B  q${f.quality}`);
const total = (k) => sizes.filter((f) => f.file.endsWith(`@${k}x.webp`)).reduce((a, f) => a + f.bytes, 0);
console.log(`total: 1× ${total(1)} B, 2× ${total(2)} B, together ${total(1) + total(2)} B`);
const line = (v) => `mean ${v.mean}, p95 ${v.p95}, p99 ${v.p99}, max ${v.max}, over 16: ${v.over16}% of ${v.pixels} px`;
console.log(`view vs master, inside its box: ${line(proof.view.inside)}`);
console.log(`view vs master, outside it:     ${line(proof.view.outside)}`);
for (const [f, v] of Object.entries(proof.codec)) console.log(`codec, ${f.padEnd(26)} ${line(v)}`);
for (const [id, v] of Object.entries(proof.cut)) console.log(`cut, ${id.padEnd(13)} ${line(v)}`);
for (const [id, v] of Object.entries(proof.coverage))
  console.log(`lit ${id.padEnd(13)} own copy ${v.ownPixels} px; at ${LIT.scale}: ${v.atLitScale.pixels} px uncovered, reaching ${v.atLitScale.reach} px (2×) past the cut-out; covered from scale ${v.scale}`);
for (const [id, v] of Object.entries(proof.cut))
  if (v.mean > CUT_LIMIT.mean || v.p99 > CUT_LIMIT.p99) fail(`${id}'s cut over the page's colour differs from its own image by mean ${v.mean}, 99th percentile ${v.p99} — over ${CUT_LIMIT.mean} / ${CUT_LIMIT.p99}`);
console.log(`wrote ${path.relative(ROOT, OUT).replace(/\\/g, '/')}/: manifest.json, ${sizes.length} WebP files, proof/`);
