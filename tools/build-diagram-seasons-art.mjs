// Builds the seasons diagram's art from the approved paintings: the Sun and
// one Earth, each cut out of its white background to transparency (the Earth
// is NOT clipped to a circle: the user's decision), trimmed, and written as
// WebP at 1× and 2×. Everything else in the diagram — the orbit, its arrows,
// the axes, the 23.5° mark, the equators, the night halves and every word —
// is drawn by code.
//
//   node tools/build-diagram-seasons-art.mjs
//
// It refuses an input whose SHA-256, or whose decoded pixels' SHA-256, is not
// the seed's pin (seed.art.files). The outputs are staged, untracked, in
// data-sources/seasons/build/, from where tools/build-diagram-seasons.mjs
// copies them into the diagram's folder. It also measures the Earth's disc in
// its cut-out — the circle whose area its solid part has, and its centre —
// which the view's axes, equator and tap zone are drawn from.
//
// No network, ever: ffmpeg decodes and encodes on this machine (with libwebp).
// The cutting and saving are shared, in tools/lib/diagram-art.mjs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { backgroundOf, cut, decode, encode, resample, straight } from './lib/diagram-art.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed that pins the art, the art, and the staging folder.
const SEED = path.join(ROOT, 'data-sources/seasons/seasons.seed.json');
const ART = path.join(ROOT, 'data-sources/seasons/art');
const OUT = path.join(ROOT, 'data-sources/seasons/build');

// Each painting, and the width its trimmed box has at 1×, in CSS px: a phone
// shows the Earth some 50–70 px across and the Sun, with its glow, some 110–150.
const PAINTINGS = {
  sun: { file: 'sun.png', width: 170, cap: { 1: 20 * 1024, 2: 56 * 1024 } },
  earth: { file: 'earth.png', width: 100, cap: { 1: 12 * 1024, 2: 32 * 1024 } },
};
// The diagram shell's page colour (--page in docs/visual/style.css).
const PAGE = [0xee, 0xf3, 0xf8];
// The soft key against white, as the other diagrams' (tools/lib/diagram-art.mjs).
const KEY = { floor: 3, solid: 48, shape: 10, erode: 2, speck: 64 };
const QUALITY = { start: 82, step: 6, floor: 58 };
const PAD = 2;

const fail = (msg) => {
  throw new Error(`seasons art: ${msg}`);
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const r3 = (v) => Math.round(v * 1000) / 1000;

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const pins = seed.art?.files ?? fail('the seed pins no art');
for (const name of Object.keys(pins)) if (!Object.values(PAINTINGS).some((p) => p.file === name)) fail(`the seed pins ${name}, which this tool does not read`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const manifest = { page: hex(PAGE), inputs: Object.fromEntries(Object.entries(pins).map(([name, pin]) => [name, pin.sha256])) };
for (const [id, spec] of Object.entries(PAINTINGS)) {
  const pin = pins[spec.file] ?? fail(`the seed pins no ${spec.file}`);
  const file = path.join(ART, spec.file);
  const hash = sha256(fs.readFileSync(file));
  if (hash !== pin.sha256) fail(`${spec.file} is not the approved file: SHA-256 ${hash}, the seed pins ${pin.sha256}`);
  const img = decode(file);
  const pixels = sha256(img.data);
  if (pixels !== pin.rgbPixelsSha256) fail(`${spec.file}'s pixels are not the approved ones: RGB SHA-256 ${pixels}, the seed pins ${pin.rgbPixelsSha256}`);

  const white = backgroundOf(img);
  const out = cut(img, white, KEY);
  let [x0, y0, x1, y1] = [img.w, img.h, -1, -1];
  let area = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const a = out.px[(y * img.w + x) * 4 + 3];
      if (a > 0) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
      if (a >= 0.5) (area += 1), (sx += x + 0.5), (sy += y + 0.5);
    }
  if (x1 < 0) fail(`${spec.file}: the cut left nothing`);
  [x0, y0, x1, y1] = [Math.max(0, x0 - PAD), Math.max(0, y0 - PAD), Math.min(img.w, x1 + 1 + PAD), Math.min(img.h, y1 + 1 + PAD)];

  // Whole pixels at 1×, and exactly twice them at 2×.
  const S = spec.width / (x1 - x0);
  const X0 = Math.floor(x0 * S);
  const Y0 = Math.floor(y0 * S);
  const W1 = Math.ceil(x1 * S) - X0;
  const H1 = Math.ceil(y1 * S) - Y0;
  const files = {};
  const sizes = {};
  for (const k of [1, 2]) {
    const name = `${id}@${k}x.webp`;
    const rgba = straight(resample(out, { scale: 1, dx: 0, dy: 0 }, S * k, X0 * k, Y0 * k, W1 * k, H1 * k), PAGE);
    const got = encode(rgba, W1 * k, H1 * k, path.join(OUT, name), spec.cap[k], { quality: QUALITY });
    files[`${k}x`] = name;
    sizes[`${k}x`] = { bytes: got.bytes, quality: got.quality };
  }
  // The solid part's disc: the circle of its area, at its centroid, in the 1× file's px.
  const disc = { cx: r3((sx / area) * S - X0), cy: r3((sy / area) * S - Y0), r: r3(Math.sqrt(area / Math.PI) * S) };
  manifest[id] = { width: W1, height: H1, files, disc, background: hex(white), sizes };
  console.log(`${id}: ${spec.file} on ${hex(white)}; ${W1}×${H1} at 1× (${sizes['1x'].bytes} bytes), ${W1 * 2}×${H1 * 2} at 2× (${sizes['2x'].bytes} bytes); its disc r ${disc.r} px at (${disc.cx}, ${disc.cy})`);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${path.relative(ROOT, OUT)}/: manifest.json and 4 WebP files`);
