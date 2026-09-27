// Builds the atmosphere-layers exploded view's art from the approved masters.
//
// Each slab and the Earth slice is cut out of its own image with a soft alpha
// key against that image's background, placed where the master shows it,
// trimmed, and written as WebP at 1× and 2× for a layout 390 CSS px wide. The
// card's 13 icons are cut out of their grid as squares inside the cell
// borders, on the card's white. A manifest gives each slab's place, size, draw
// order, tap outline, the line its name is laid along, and the points where
// the km axis ticks and the temperature curve meet it. Then the proof: each
// cut against its own image, where the build fails beyond CUT_LIMIT, and the
// stack recomposed from the written files against the master, reported.
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
// Bottom to top, the order the page draws them in: each covers the back of the one below.
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
// which is the untouched earth-original-v3.png's scale: the retouched
// earth.png draws the Earth 580 px wide, not 750, so it takes 1.1638.
const PLACE = {
  earth: { scale: 1.1638, dx: -81.2, dy: -182.3 },
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
const CAP = { slab: { 1: 12 * 1024, 2: 32 * 1024 }, icon: { 1: 1024, 2: 2 * 1024 } };
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

// ---- pixels ----------------------------------------------------------------------------

function decode(file, pixFmt = 'rgb24') {
  const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file])
    .toString()
    .trim()
    .split('x')
    .map(Number);
  const channels = pixFmt === 'rgba' ? 4 : 3;
  const data = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', pixFmt, '-'], { maxBuffer: w * h * channels + 1024 });
  if (data.length !== w * h * channels) fail(`${path.basename(file)} decoded to ${data.length} bytes, not ${w}×${h}×${channels}`);
  return { w, h, data };
}

// An image's background: the median colour of its outer 8 px.
function backgroundOf({ w, h, data }) {
  const ch = [[], [], []];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x >= 8 && x < w - 8 && y >= 8 && y < h - 8) continue;
      for (let c = 0; c < 3; c++) ch[c].push(data[(y * w + x) * 3 + c]);
    }
  return ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
}

// How far each pixel stands from the background: its largest channel difference.
function distances({ w, h, data }, bg) {
  const dist = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = Math.max(...[0, 1, 2].map((c) => Math.abs(data[i * 3 + c] - bg[c])));
  return dist;
}

// A picture's shape: pixels at least `level` off the background, with every
// hole filled — whatever the background cannot reach from the image's border.
function shapeMask(dist, w, h, level) {
  const outside = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (i) => {
    if (!outside[i] && dist[i] < level) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < (h - 1) * w) push(i + w);
  }
  // A part smaller than KEY.speck px is a speck of the image's noise, not art.
  const shape = outside.map((o) => 1 - o);
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!shape[s] || seen[s]) continue;
    const part = [s];
    seen[s] = 1;
    for (let k = 0; k < part.length; k++) {
      const i = part[k];
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w])
        if (j >= 0 && j < w * h && shape[j] && !seen[j]) (seen[j] = 1), part.push(j);
    }
    if (part.length < KEY.speck) for (const i of part) shape[i] = 0;
  }
  return shape;
}

// A mask shrunk by r px: a pixel stays only if everything within r of it is in.
function erode(mask, w, h, r) {
  const across = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let all = 1;
      for (let k = -r; k <= r && all; k++) all = x + k >= 0 && x + k < w && mask[y * w + x + k] ? 1 : 0;
      across[y * w + x] = all;
    }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let all = 1;
      for (let k = -r; k <= r && all; k++) all = y + k >= 0 && y + k < h && across[(y + k) * w + x] ? 1 : 0;
      out[y * w + x] = all;
    }
  return out;
}

// What touches the shape: the pixels above the floor reachable from it, so a
// glow or a shadow stays and a stray speck of the image's noise does not.
function touching(shape, dist, w, h) {
  const keep = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let tail = 0;
  for (let i = 0; i < w * h; i++) if (shape[i]) (keep[i] = 1), (queue[tail++] = i);
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w])
      if (j >= 0 && j < w * h && !keep[j] && dist[j] > KEY.floor) (keep[j] = 1), (queue[tail++] = j);
  }
  return keep;
}

// The soft key, into premultiplied RGBA floats (0–1): alpha·colour = pixel − (1 − alpha)·background.
function cut(img, bg) {
  const { w, h, data } = img;
  const dist = distances(img, bg);
  const shape = shapeMask(dist, w, h, KEY.shape);
  const inside = erode(shape, w, h, KEY.erode);
  const keep = touching(shape, dist, w, h);
  const px = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let a;
    if (inside[i]) a = 1;
    else {
      if (!keep[i]) continue;
      let least = 0;
      for (let c = 0; c < 3; c++) {
        const d = data[i * 3 + c] - bg[c];
        least = Math.max(least, d > 0 ? d / (255 - bg[c]) : -d / bg[c]);
      }
      const t = Math.min(1, (dist[i] - KEY.floor) / (KEY.solid - KEY.floor));
      a = Math.min(1, Math.max(least, t * t * (3 - 2 * t)));
    }
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.min(a, Math.max(0, (data[i * 3 + c] - (1 - a) * bg[c]) / 255));
    px[i * 4 + 3] = a;
  }
  return { w, h, px };
}

// Area-average resampling of premultiplied pixels. Output pixel (i, j) covers
// the master's box [(X0 + i) / S, (X0 + i + 1) / S) across and the same down;
// the source's pixel (x, y) sits on the master at (x·scale + dx, y·scale + dy).
// Whatever falls outside the source is transparent.
function resample(src, { scale, dx, dy }, S, X0, Y0, W, H) {
  const spans = (n, O, off, size) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((O + i) / S - off) / scale;
      const b = ((O + i + 1) / S - off) / scale;
      const list = [];
      for (let s = Math.max(0, Math.floor(a)); s < Math.min(size, Math.ceil(b)); s++) {
        const w = Math.min(b, s + 1) - Math.max(a, s);
        if (w > 0) list.push([s, w]);
      }
      return list;
    });
  const across = spans(W, X0, dx, src.w);
  const down = spans(H, Y0, dy, src.h);
  const area = 1 / (S * scale) ** 2;
  const rows = new Set(down.flat().map(([s]) => s));
  const mid = new Map();
  for (const sy of rows) {
    const row = new Float32Array(W * 4);
    for (let i = 0; i < W; i++)
      for (const [sx, w] of across[i]) {
        const p = (sy * src.w + sx) * 4;
        for (let c = 0; c < 4; c++) row[i * 4 + c] += src.px[p + c] * w;
      }
    mid.set(sy, row);
  }
  const out = new Float32Array(W * H * 4);
  for (let j = 0; j < H; j++)
    for (const [sy, w] of down[j]) {
      const row = mid.get(sy);
      for (let k = 0; k < W * 4; k++) out[j * W * 4 + k] += row[k] * w;
    }
  for (let k = 0; k < out.length; k++) out[k] = Math.min(1, out[k] / area);
  return out;
}

// Premultiplied floats to straight RGBA bytes; a fully transparent pixel takes
// the page's background colour, so any colour it lends a neighbour in the
// encoder is the colour already behind it.
function straight(px, bg) {
  const out = Buffer.alloc(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    const a8 = Math.round(a * 255);
    for (let c = 0; c < 3; c++) out[i + c] = a8 === 0 ? bg[c] : Math.round(Math.min(1, px[i + c] / a) * 255);
    out[i + 3] = a8;
  }
  return out;
}

// WebP, quality stepping down until the file fits its cap.
function encode(rgba, W, H, file, cap, alpha = true) {
  for (let q = QUALITY.start; ; q -= QUALITY.step) {
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-',
      '-map_metadata', '-1', '-c:v', 'libwebp', '-pix_fmt', alpha ? 'yuva420p' : 'yuv420p', '-quality', String(q), '-compression_level', '6', file,
    ], { input: rgba });
    const bytes = fs.statSync(file).size;
    if (bytes <= cap) return { bytes, quality: q };
    if (q - QUALITY.step < QUALITY.floor) fail(`${path.relative(OUT, file)} is ${bytes} bytes at quality ${q}, over its cap of ${cap}`);
  }
}

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
const page = backgroundOf(master);
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
// emptied rather than removed, so a shell standing in it does not stop the build
fs.mkdirSync(OUT, { recursive: true });
for (const entry of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'slabs'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'proof'), { recursive: true });
const sizes = [];
// each slab's 2× pixels as written, before the encoder, for the proof
const before2x = {};

const slabs = ORDER.map((id, order) => {
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
  // its shape, measured at the master's own pixels and given in layout px
  const shape = shapeOf(resample(src, place, 1, mx0, my0, mx1 - mx0, my1 - my0), mx1 - mx0, my1 - my0, mx0, my0);
  const L = (p) => [round(p[0] * S), round(p[1] * S)];
  const wall = shape.L.bottom - shape.L.top;
  const along = (t) => shape.L.x + t * (shape.F.x - shape.L.x);
  const nameAt = (t) => [along(t), shape.lowerAt(along(t)) - 0.55 * wall];
  return {
    id,
    order,
    tappable: id !== 'earth',
    x: X0,
    y: Y0,
    width: X1 - X0,
    height: Y1 - Y0,
    files,
    outline: shape.hull.map(L),
    nameLine:
      id === 'earth'
        ? null
        : { from: L(nameAt(0.07)), to: L(nameAt(0.55)), angle: round((Math.atan(shape.slope) * 180) / Math.PI), faceHeight: round(wall * S) },
    edges: {
      left: { top: L([shape.L.x, shape.L.top]), bottom: L([shape.L.x, shape.L.bottom + 1]) },
      right: { top: L([shape.R.x + 1, shape.R.top]), bottom: L([shape.R.x + 1, shape.R.bottom + 1]) },
    },
  };
});

// The boundaries: each in the middle of the gap between two slabs, on the left
// for the km axis and on the right for the curve; above the exosphere, half a
// gap over its top.
const mid = (a, b) => round((a + b) / 2);
const gaps = slabs.slice(1).map((s, i) => slabs[i].edges.left.top[1] - s.edges.left.bottom[1]);
const halfGap = gaps.slice(1).reduce((a, b) => a + b, 0) / (gaps.length - 1) / 2;
const boundaryIds = Object.fromEntries(Object.values(seed.boundaries).map((b) => [b.between.join('|'), b.id]));
const boundaries = slabs.map((below, i) => {
  const above = slabs[i + 1];
  return {
    id: above ? boundaryIds[`${below.id}|${above.id}`] ?? null : null,
    between: [below.id, above ? above.id : null],
    left: [below.edges.left.top[0], above ? mid(below.edges.left.top[1], above.edges.left.bottom[1]) : round(below.edges.left.top[1] - halfGap)],
    right: [below.edges.right.top[0], above ? mid(below.edges.right.top[1], above.edges.right.bottom[1]) : round(below.edges.right.top[1] - halfGap)],
  };
});
for (const [i, s] of slabs.entries()) {
  if (s.id === 'earth') continue;
  const [under, over] = [boundaries[i - 1], boundaries[i]];
  s.meets = {
    axis: { bottom: [s.edges.left.bottom[0], under.left[1]], top: [s.edges.left.top[0], over.left[1]] },
    curve: { bottom: [s.edges.right.bottom[0], under.right[1]], top: [s.edges.right.top[0], over.right[1]] },
  };
}

// ---- the icons -------------------------------------------------------------------------

const iconMaster = decode(path.join(ART, ICON_MASTER));
const grid = iconSquares(iconMaster);
const icons = grid.squares.map((sq, n) => {
  const id = ICONS[n];
  // each icon cut out of its own square, so the cell's border never encloses it
  const square = { w: sq.side, h: sq.side, data: Buffer.alloc(sq.side * sq.side * 3) };
  for (let y = 0; y < sq.side; y++) iconMaster.data.copy(square.data, y * sq.side * 3, ((sq.y + y) * iconMaster.w + sq.x) * 3, ((sq.y + y) * iconMaster.w + sq.x + sq.side) * 3);
  // opaque, on the card's own white as the grid paints it: nothing is keyed away
  const iconCut = { w: square.w, h: square.h, px: new Float32Array(square.w * square.h * 4) };
  for (let i = 0; i < square.w * square.h; i++) {
    for (let c = 0; c < 3; c++) iconCut.px[i * 4 + c] = square.data[i * 3 + c] / 255;
    iconCut.px[i * 4 + 3] = 1;
  }
  const files = {};
  for (const k of [1, 2]) {
    const px = ICON_SIZE * k;
    const file = path.join(OUT, 'icons', `${id}@${k}x.webp`);
    const got = encode(straight(resample(iconCut, { scale: 1, dx: 0, dy: 0 }, px / sq.side, 0, 0, px, px), grid.white), px, px, file, CAP.icon[k], false);
    files[`${k}x`] = `icons/${id}@${k}x.webp`;
    sizes.push({ file: files[`${k}x`], W: px, H: px, ...got });
  }
  return { id, files };
});

// ---- the manifest ----------------------------------------------------------------------

const manifest = {
  _about:
    'The atmosphere-layers exploded view: the stack cut from the approved art, for a layout ' +
    `${LAYOUT_WIDTH} CSS px wide, in which every position below is given (layout px; the master's ` +
    `${master.w} px make ${LAYOUT_WIDTH}). Slabs are drawn in "order", bottom to top, the selected one last. ` +
    '"outline" is the tap area; "nameLine" the line the slab\'s Bengali name is laid along, 45% down its ' +
    'front-left face; "edges" its upright edges\' ends; "meets" where the km axis ticks (left) and the ' +
    'temperature curve (right) meet it — each boundary in the middle of the gap between two slabs, and ' +
    `above the exosphere half a gap over its top. Each icon is a square ${ICON_SIZE} CSS px across, on the card's ` +
    'white. Written by tools/build-diagram-atmosphere-art.mjs.',
  inputs,
  layout: { width: LAYOUT_WIDTH, height: LAYOUT_HEIGHT, fromMaster: S, background: hex(page) },
  slabs,
  boundaries,
  icons: icons.map(({ id, files }) => ({ id, files, size: ICON_SIZE })),
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// ---- the proof -------------------------------------------------------------------------

// Two measures, both at 2×. The cut: each file over the page's colour against
// its own image at the same size and place — a halo, or a cut in the wrong
// place, would show here, and the build fails beyond CUT_LIMIT. The stack: the
// six files recomposed at the manifest's places on the page's colour against
// the master at the same size, where one slab alone covers a pixel, where none
// does and where slabs overlap, and per slab. That one is reported, not held
// to a limit: it measures how closely each slab's own image agrees with the
// master, which is the art's to answer, not the cut's.
const W2 = LAYOUT_WIDTH * 2;
const H2 = LAYOUT_HEIGHT * 2;
const opaqueOf = (img) => {
  const px = new Float32Array(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i++) {
    for (let c = 0; c < 3; c++) px[i * 4 + c] = img.data[i * 3 + c] / 255;
    px[i * 4 + 3] = 1;
  }
  return { w: img.w, h: img.h, px };
};
const summary = (list) => {
  const v = Float64Array.from(list).sort();
  const at = (q) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  return { pixels: v.length, mean: round(v.reduce((a, b) => a + b, 0) / v.length), p95: at(0.95), p99: at(0.99), max: v[v.length - 1], over16: round((100 * v.filter((d) => d > 16).length) / v.length) };
};
const reference = resample(opaqueOf(master), { scale: 1, dx: 0, dy: 0 }, 2 * S, 0, 0, W2, H2);
const stack = new Float32Array(W2 * H2 * 3);
const cover = new Uint8Array(W2 * H2);
const who = new Int8Array(W2 * H2).fill(-1);
for (let i = 0; i < W2 * H2; i++) for (let c = 0; c < 3; c++) stack[i * 3 + c] = page[c] / 255;
const cutProof = {};
const codecProof = {};
// a pixel of straight RGBA bytes over the page's colour, one channel, 0–255
const over = (rgba, p, c) => Math.round((rgba[p + c] / 255) * (rgba[p + 3] / 255) * 255 + page[c] * (1 - rgba[p + 3] / 255));
for (const [n, s] of slabs.entries()) {
  const img = decode(path.join(OUT, s.files['2x']), 'rgba');
  const own = resample(opaqueOf(images[s.id]), PLACE[s.id], 2 * S, s.x * 2, s.y * 2, img.w, img.h);
  const pre = before2x[s.id];
  const cutDiffs = [];
  const codecDiffs = [];
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const p = (y * img.w + x) * 4;
      const a = img.data[p + 3] / 255;
      let d = 0;
      let e = 0;
      for (let c = 0; c < 3; c++) {
        d = Math.max(d, Math.abs(over(pre, p, c) - Math.round(own[p + c] * 255)));
        e = Math.max(e, Math.abs(over(img.data, p, c) - over(pre, p, c)));
      }
      cutDiffs.push(d);
      codecDiffs.push(e);
      const [X, Y] = [s.x * 2 + x, s.y * 2 + y];
      if (X >= W2 || Y >= H2) continue;
      if (a > 0.05) (cover[Y * W2 + X] += 1), (who[Y * W2 + X] = n);
      for (let c = 0; c < 3; c++) stack[(Y * W2 + X) * 3 + c] = stack[(Y * W2 + X) * 3 + c] * (1 - a) + (img.data[p + c] / 255) * a;
    }
  cutProof[s.id] = summary(cutDiffs);
  codecProof[s.id] = summary(codecDiffs);
}
const diffs = { alone: [], background: [], overlap: [] };
const perSlab = Object.fromEntries(slabs.map((s) => [s.id, []]));
const sideBySide = Buffer.alloc(W2 * 3 * H2 * 3);
for (let y = 0; y < H2; y++)
  for (let x = 0; x < W2; x++) {
    const i = y * W2 + x;
    let d = 0;
    for (let c = 0; c < 3; c++) {
      const a = Math.round(stack[i * 3 + c] * 255);
      const b = Math.round(reference[i * 4 + c] * 255);
      d = Math.max(d, Math.abs(a - b));
      sideBySide[(y * W2 * 3 + x) * 3 + c] = a;
      sideBySide[(y * W2 * 3 + W2 + x) * 3 + c] = b;
    }
    const heat = Math.min(255, d * 4);
    sideBySide.set([heat, heat, heat], (y * W2 * 3 + 2 * W2 + x) * 3);
    if (cover[i] === 0) diffs.background.push(d);
    else if (cover[i] === 1) diffs.alone.push(d), perSlab[slabs[who[i]].id].push(d);
    else diffs.overlap.push(d);
  }
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W2 * 3}x${H2}`, '-i', '-', path.join(OUT, 'proof', 'recomposed-master-difference.png')], { input: sideBySide });
const proof = {
  cut: cutProof,
  codec: codecProof,
  stack: Object.fromEntries(Object.entries(diffs).map(([k, v]) => [k, summary(v)])),
  stackAloneBySlab: Object.fromEntries(Object.entries(perSlab).map(([k, v]) => [k, summary(v)])),
};
fs.writeFileSync(path.join(OUT, 'proof', 'difference.json'), `${JSON.stringify(proof, null, 2)}\n`);

// ---- the report ------------------------------------------------------------------------

console.log(`inputs: ${INPUTS.length} files, each the approved one by the seed's SHA-256`);
console.log(`layout ${LAYOUT_WIDTH}×${LAYOUT_HEIGHT} (master ×${round(S, 6)}), background ${hex(page)}; icons on the card's white ${hex(grid.white)}, squares ${grid.squares.map((q) => q.side).join(' ')} px`);
for (const f of sizes) console.log(`  ${f.file.padEnd(28)} ${`${f.W}×${f.H}`.padStart(9)}  ${String(f.bytes).padStart(6)} B  q${f.quality}`);
const total = (k) => sizes.filter((f) => f.file.endsWith(`@${k}x.webp`)).reduce((a, f) => a + f.bytes, 0);
console.log(`total: 1× ${total(1)} B, 2× ${total(2)} B, together ${total(1) + total(2)} B`);
const line = (v) => `mean ${v.mean}, p95 ${v.p95}, p99 ${v.p99}, max ${v.max}, over 16: ${v.over16}% of ${v.pixels} px`;
for (const [id, v] of Object.entries(proof.cut)) console.log(`cut, ${id.padEnd(13)} ${line(v)}`);
for (const [id, v] of Object.entries(proof.codec)) console.log(`codec, ${id.padEnd(13)} ${line(v)}`);
for (const [k, v] of Object.entries(proof.stack)) console.log(`stack vs master, ${k.padEnd(11)} ${line(v)}`);
for (const [id, v] of Object.entries(proof.stackAloneBySlab)) console.log(`stack vs master, ${id.padEnd(13)} alone: ${line(v)}`);
for (const [id, v] of Object.entries(proof.cut))
  if (v.mean > CUT_LIMIT.mean || v.p99 > CUT_LIMIT.p99) fail(`${id}'s cut over the page's colour differs from its own image by mean ${v.mean}, 99th percentile ${v.p99} — over ${CUT_LIMIT.mean} / ${CUT_LIMIT.p99}`);
console.log(`wrote ${path.relative(ROOT, OUT).replace(/\\/g, '/')}/: manifest.json, ${sizes.length} WebP files, proof/`);
