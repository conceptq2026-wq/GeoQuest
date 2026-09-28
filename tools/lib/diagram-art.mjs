// Cutting a diagram's approved art out of its background and saving it, shared
// by the diagram art tools (atmosphere-layers, earth-interior). Moved here
// from tools/build-diagram-atmosphere-art.mjs unchanged but for its constants,
// which each tool passes in.
//
// No network: ffmpeg decodes and encodes on this machine (with libwebp).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const fail = (msg) => {
  throw new Error(`diagram art: ${msg}`);
};

// ---- pixels ----------------------------------------------------------------------------

export function decode(file, pixFmt = 'rgb24') {
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
export function backgroundOf({ w, h, data }) {
  const ch = [[], [], []];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x >= 8 && x < w - 8 && y >= 8 && y < h - 8) continue;
      for (let c = 0; c < 3; c++) ch[c].push(data[(y * w + x) * 3 + c]);
    }
  return ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
}

// The colour opaque files show along their edges once decoded: the median of
// their outer 2 px. The encoder moves a flat colour by a level or two, so what
// lies behind an opaque file — the page behind the view, the card behind an
// icon — must be this, not the colour painted, or the file's square shows.
export function edgeOf(files) {
  const ch = [[], [], []];
  for (const file of files) {
    const { w, h, data } = decode(file);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (x >= 2 && x < w - 2 && y >= 2 && y < h - 2) continue;
        for (let c = 0; c < 3; c++) ch[c].push(data[(y * w + x) * 3 + c]);
      }
  }
  return ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
}

// How far each pixel stands from the background: its largest channel difference.
export function distances({ w, h, data }, bg) {
  const dist = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = Math.max(...[0, 1, 2].map((c) => Math.abs(data[i * 3 + c] - bg[c])));
  return dist;
}

// A picture's shape: pixels at least `level` off the background, with every
// hole filled — whatever the background cannot reach from the image's border.
// A part smaller than `speck` px is a speck of the image's noise, not art.
export function shapeMask(dist, w, h, level, speck) {
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
    if (part.length < speck) for (const i of part) shape[i] = 0;
  }
  return shape;
}

// A mask shrunk by r px: a pixel stays only if everything within r of it is in.
export function erode(mask, w, h, r) {
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

// What touches the shape: the pixels above `floor` reachable from it, so a
// glow or a shadow stays and a stray speck of the image's noise does not.
export function touching(shape, dist, w, h, floor) {
  const keep = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let tail = 0;
  for (let i = 0; i < w * h; i++) if (shape[i]) (keep[i] = 1), (queue[tail++] = i);
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w])
      if (j >= 0 && j < w * h && !keep[j] && dist[j] > floor) (keep[j] = 1), (queue[tail++] = j);
  }
  return keep;
}

/*
 * The soft key, into premultiplied RGBA floats (0–1): alpha·colour = pixel −
 * (1 − alpha)·background. `key` is { floor, solid, shape, erode, speck }.
 * Inside a picture's shape — every pixel `shape` levels or more off the
 * background, holes filled, eroded by `erode` px — it is solid, so painted
 * light never turns into a window onto what lies behind. Outside it, in the
 * edge and the glow: a pixel as far as `floor` from the background is that
 * background's noise and is cut away; from `solid` on it is solid; between, it
 * takes the least alpha that still explains it over the background, or the
 * ramp's, whichever is more. Over that background every pixel then shows
 * exactly as painted, so no halo.
 */
export function cut(img, bg, key) {
  const { w, h, data } = img;
  const dist = distances(img, bg);
  const shape = shapeMask(dist, w, h, key.shape, key.speck);
  const inside = erode(shape, w, h, key.erode);
  const keep = touching(shape, dist, w, h, key.floor);
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
      const t = Math.min(1, (dist[i] - key.floor) / (key.solid - key.floor));
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
export function resample(src, { scale, dx, dy }, S, X0, Y0, W, H) {
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
export function straight(px, bg) {
  const out = Buffer.alloc(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    const a8 = Math.round(a * 255);
    for (let c = 0; c < 3; c++) out[i + c] = a8 === 0 ? bg[c] : Math.round(Math.min(1, px[i + c] / a) * 255);
    out[i + 3] = a8;
  }
  return out;
}

// WebP, quality stepping down from `quality.start` by `quality.step` until the
// file fits its cap, never below `quality.floor`.
export function encode(rgba, W, H, file, cap, { alpha = true, quality }) {
  for (let q = quality.start; ; q -= quality.step) {
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-',
      '-map_metadata', '-1', '-c:v', 'libwebp', '-pix_fmt', alpha ? 'yuva420p' : 'yuv420p', '-quality', String(q), '-compression_level', '6', file,
    ], { input: rgba });
    const bytes = fs.statSync(file).size;
    if (bytes <= cap) return { bytes, quality: q };
    if (q - quality.step < quality.floor) fail(`${path.basename(file)} is ${bytes} bytes at quality ${q}, over its cap of ${cap}`);
  }
}
