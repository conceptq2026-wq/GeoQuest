// Builds the earth-interior diagram's art from the approved master: the master
// cut out of its white background to transparency, trimmed to the globe, and
// written as WebP at 1× and 2×.
//
//   node tools/build-diagram-earth-interior-art.mjs
//
// It refuses a master whose SHA-256, or whose decoded pixels' SHA-256, is not
// the seed's pin. The outputs are staged, untracked, in
// data-sources/earth-interior/build/, from where
// tools/build-diagram-earth-interior.mjs copies them into the diagram's
// folder. The master is the only art: nothing is drawn over it but the
// diagram's own outlines, leaders and words.
//
// No network, ever: ffmpeg decodes and encodes on this machine (with libwebp).
// The cutting and saving are shared with the other diagram art tools, in
// tools/lib/diagram-art.mjs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { backgroundOf, cut, decode, encode, resample, straight } from './lib/diagram-art.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed that pins the master, the master, and the staging folder.
const SEED = path.join(ROOT, 'data-sources/earth-interior/earth-interior.seed.json');
const ART = path.join(ROOT, 'data-sources/earth-interior/art');
const OUT = path.join(ROOT, 'data-sources/earth-interior/build');

const MASTER = 'earth-master.png';
// The layout the art is made for: the master's width becomes this many CSS px
// at 1×: a 390 px phone shows the globe about as wide as the 1× file.
const LAYOUT_WIDTH = 400;
// The diagram shell's page colour (--page in docs/visual/style.css): what a
// transparent pixel lends its neighbours in the encoder.
const PAGE = [0xee, 0xf3, 0xf8];
// The soft key against the master's white, as the atmosphere art's (see
// tools/lib/diagram-art.mjs): solid inside the globe's shape, soft only at its
// edge, a speck of the image's noise dropped.
const KEY = { floor: 3, solid: 48, shape: 10, erode: 2, speck: 64 };
// WebP quality steps down from START until a file fits its cap, never below FLOOR.
const QUALITY = { start: 82, step: 6, floor: 58 };
// Size caps in bytes: the picture loads with the page.
const CAP = { 1: 40 * 1024, 2: 112 * 1024 };
// Kept round the globe's shape, in master px.
const PAD = 2;

const fail = (msg) => {
  throw new Error(`earth-interior art: ${msg}`);
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

// ---- the master, checked against the seed's pins ----------------------------------------

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const pin = seed.art?.files?.[MASTER] ?? fail(`the seed pins no ${MASTER}`);
for (const name of Object.keys(seed.art.files)) if (name !== MASTER) fail(`the seed pins ${name}, which this tool does not read`);
const file = path.join(ART, MASTER);
const hash = sha256(fs.readFileSync(file));
if (hash !== pin.sha256) fail(`${MASTER} is not the approved file: SHA-256 ${hash}, the seed pins ${pin.sha256}`);
const master = decode(file);
const pixels = sha256(master.data);
if (pixels !== pin.rgbPixelsSha256) fail(`${MASTER}'s pixels are not the approved ones: RGB SHA-256 ${pixels}, the seed pins ${pin.rgbPixelsSha256}`);

// ---- cut out, trimmed ------------------------------------------------------------------------

const white = backgroundOf(master);
const cutout = cut(master, white, KEY);
let [x0, y0, x1, y1] = [master.w, master.h, -1, -1];
for (let y = 0; y < master.h; y++)
  for (let x = 0; x < master.w; x++)
    if (cutout.px[(y * master.w + x) * 4 + 3] > 0) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
if (x1 < 0) fail('the cut left nothing');
[x0, y0, x1, y1] = [Math.max(0, x0 - PAD), Math.max(0, y0 - PAD), Math.min(master.w, x1 + 1 + PAD), Math.min(master.h, y1 + 1 + PAD)];

// Whole pixels at 1×, and exactly twice them at 2×, so both files cover the same box.
const S = LAYOUT_WIDTH / master.w;
const X0 = Math.floor(x0 * S);
const Y0 = Math.floor(y0 * S);
const W1 = Math.ceil(x1 * S) - X0;
const H1 = Math.ceil(y1 * S) - Y0;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const files = {};
const written = [];
for (const k of [1, 2]) {
  const name = `earth@${k}x.webp`;
  const rgba = straight(resample(cutout, { scale: 1, dx: 0, dy: 0 }, S * k, X0 * k, Y0 * k, W1 * k, H1 * k), PAGE);
  const got = encode(rgba, W1 * k, H1 * k, path.join(OUT, name), CAP[k], { quality: QUALITY });
  files[`${k}x`] = name;
  written.push(`${name} ${W1 * k}×${H1 * k}, ${got.bytes} bytes at quality ${got.quality} (cap ${CAP[k]})`);
}

const round = (v) => Math.round(v * 1000) / 1000;
const manifest = {
  master: hash,
  background: hex(white),
  page: hex(PAGE),
  layout: round(S),
  // The box the files cover, in master px.
  box: { x: round(X0 / S), y: round(Y0 / S), width: round(W1 / S), height: round(H1 / S) },
  size: { width: W1, height: H1 },
  files,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`the master's background ${hex(white)}; the globe's box ${x0}–${x1} × ${y0}–${y1} (master px)`);
for (const line of written) console.log(`  ${line}`);
console.log(`wrote ${path.relative(ROOT, OUT)}/: manifest.json, ${Object.values(files).join(', ')}`);
