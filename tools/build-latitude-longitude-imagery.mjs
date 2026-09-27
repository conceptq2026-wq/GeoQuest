// Builds the latitude-longitude globe's imagery: NASA's Blue Marble: Next
// Generation (July, with topography and bathymetry), reprojected to Web
// Mercator and cut into 512 px WebP tiles, zoom 0 to 3, in one PMTiles
// archive in the map's folder.
//
//   tools/.cache/world.topo.bathy.200407.3x5400x2700.jpg  INPUT, pinned by SHA-256 in tools/sources.json
//                                                        (nasaBlueMarble), fetched by tools/fetch-sources.mjs
//   docs/maps/latitude-longitude/imagery.pmtiles          OUTPUT
//
// No network: the pinned file and ffmpeg on this machine, nothing else. The
// output is byte-identical from one run to the next.
//
//   node tools/build-latitude-longitude-imagery.mjs [out-file]
//
// The poles. Web Mercator stops at ±85.05°, and so do the tiles; on a globe
// the renderer fills each polar cap by stretching the tiles' edge outward, so
// the cap takes the image's own colour at that edge — no hole, and no line
// where the tiles stop. The false ring at 85.05°S came from the world
// basemap's coastline stroke, not from the imagery: the map uses world-light,
// which draws no coastline, and the imagery covers the basemap wherever it is
// opaque.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { zxyToTileId } from 'pmtiles';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The pins, the cache and the output. Change here if one moves.
const SOURCES = path.join(HERE, 'sources.json');
const CACHE = path.join(HERE, '.cache');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'docs/maps/latitude-longitude/imagery.pmtiles'));

// Zoom 0 to 3 in 512 px tiles: the z3 world is 4096 px across, which the
// 5400 px source fills without enlarging it. Above z3 the renderer enlarges
// the z3 tiles while the imagery fades out over the vector basemap (z3–4).
const MAX_ZOOM = 3;
const TILE = 512;
// WebP at quality 75: the investigation's setting, 1,094,709 bytes for z0–3
// from the January image, 106,906 bytes read when the globe opens.
const QUALITY = 75;
const WEB_MERCATOR_MAX_LAT = 85.0511287798066;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const entry = JSON.parse(fs.readFileSync(SOURCES, 'utf8')).nasaBlueMarble;
const input = path.join(CACHE, entry.file);
if (!fs.existsSync(input)) throw new Error(`${entry.file} is not in tools/.cache — run tools/fetch-sources.mjs`);
const source = fs.readFileSync(input);
if (source.length !== entry.size || sha256(source) !== entry.sha256) {
  throw new Error(`${entry.file}: ${source.length} bytes, sha256 ${sha256(source)} — pinned ${entry.size} bytes, ${entry.sha256}; refusing it`);
}

function ffmpeg(args, stdin) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { input: stdin, maxBuffer: 2 ** 31 - 1 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

// The source at the width the top zoom needs, 2:1, as raw RGB.
const W = TILE * 2 ** MAX_ZOOM;
const H = W / 2;
const raw = ffmpeg(['-i', 'pipe:0', '-vf', `scale=${W}:${H}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], source);
if (raw.length !== W * H * 3) throw new Error(`decoded ${raw.length} bytes, expected ${W * H * 3}`);

/*
 * Equirectangular to Web Mercator. Longitude is linear in both, so a column
 * of the output is a block of the source's columns, averaged; latitude is
 * not, so a row of the output is the source's row at that latitude,
 * interpolated between its two nearest rows. The top and bottom rows are the
 * image at 85.05° — the edge the renderer stretches over each pole.
 */
function mercatorWorld(z) {
  const n = TILE * 2 ** z;
  const out = Buffer.alloc(n * n * 3);
  const step = W / n;
  for (let Y = 0; Y < n; Y++) {
    const my = (Y + 0.5) / n;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;
    const sy = ((90 - lat) / 180) * H - 0.5;
    const y0 = Math.max(0, Math.min(H - 1, Math.floor(sy)));
    const y1 = Math.min(H - 1, y0 + 1);
    const fy = Math.max(0, Math.min(1, sy - y0));
    for (let X = 0; X < n; X++) {
      const xs = Math.floor(X * step);
      const xe = Math.max(xs + 1, Math.floor((X + 1) * step));
      for (let c = 0; c < 3; c++) {
        let a = 0;
        let b = 0;
        for (let x = xs; x < xe; x++) {
          a += raw[(y0 * W + x) * 3 + c];
          b += raw[(y1 * W + x) * 3 + c];
        }
        out[(Y * n + X) * 3 + c] = Math.round(((1 - fy) * a + fy * b) / (xe - xs));
      }
    }
  }
  return { n, out };
}

const tiles = [];
const edge = {};
for (let z = 0; z <= MAX_ZOOM; z++) {
  const { n, out } = mercatorWorld(z);
  if (z === 0) {
    const mean = (row) => [0, 1, 2].map((c) => Math.round(Array.from({ length: n }, (_, x) => out[(row * n + x) * 3 + c]).reduce((s, v) => s + v, 0) / n));
    edge.north = mean(0);
    edge.south = mean(n - 1);
  }
  for (let ty = 0; ty < 2 ** z; ty++) {
    for (let tx = 0; tx < 2 ** z; tx++) {
      const block = Buffer.alloc(TILE * TILE * 3);
      for (let r = 0; r < TILE; r++) out.copy(block, r * TILE * 3, ((ty * TILE + r) * n + tx * TILE) * 3, ((ty * TILE + r) * n + tx * TILE + TILE) * 3);
      const webp = ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${TILE}x${TILE}`, '-i', 'pipe:0', '-c:v', 'libwebp', '-quality', String(QUALITY), '-compression_level', '6', '-f', 'webp', 'pipe:1'], block);
      tiles.push({ z, x: tx, y: ty, data: webp });
    }
  }
}

/*
 * PMTiles v3: one root directory, tiles in tile-id order, each stored as it
 * is (WebP is compressed already), the directory and metadata gzipped.
 */
function varints(values) {
  const out = [];
  for (let n of values) {
    while (n >= 0x80) {
      out.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    out.push(n);
  }
  return out;
}
const sorted = tiles.map((t) => ({ id: zxyToTileId(t.z, t.x, t.y), data: t.data })).sort((a, b) => a.id - b.id);
const directory = [
  ...varints([sorted.length]),
  ...(() => {
    let last = 0;
    return varints(sorted.map((t) => {
      const d = t.id - last;
      last = t.id;
      return d;
    }));
  })(),
  ...varints(sorted.map(() => 1)),
  ...varints(sorted.map((t) => t.data.length)),
  // Offsets: 0 means "right after the previous tile", which every tile is.
  ...varints(sorted.map((t, i) => (i === 0 ? 1 : 0))),
];
const gzip = (buf) => zlib.gzipSync(buf, { level: 9 });
const root = gzip(Buffer.from(directory));
const metadata = gzip(Buffer.from(JSON.stringify({ name: 'latitude-longitude imagery', format: 'webp', type: 'baselayer', attribution: entry.credit, source: entry.product })));
if (127 + root.length > 16384) throw new Error(`root directory ${root.length} B does not fit the first 16 KiB`);
const header = Buffer.alloc(127);
const u64 = (at, v) => header.writeBigUInt64LE(BigInt(v), at);
const e7 = (deg) => Math.round(deg * 1e7);
const dataLength = sorted.reduce((s, t) => s + t.data.length, 0);
header.write('PMTiles', 0, 'ascii');
header[7] = 3;
u64(8, 127);
u64(16, root.length);
u64(24, 127 + root.length);
u64(32, metadata.length);
u64(40, 0);
u64(48, 0);
u64(56, 127 + root.length + metadata.length);
u64(64, dataLength);
u64(72, sorted.length);
u64(80, sorted.length);
u64(88, sorted.length);
header[96] = 1; // clustered
header[97] = 2; // internal compression: gzip
header[98] = 1; // tile compression: none (WebP)
header[99] = 4; // tile type: WebP
header[100] = 0;
header[101] = MAX_ZOOM;
header.writeInt32LE(e7(-180), 102);
header.writeInt32LE(e7(-WEB_MERCATOR_MAX_LAT), 106);
header.writeInt32LE(e7(180), 110);
header.writeInt32LE(e7(WEB_MERCATOR_MAX_LAT), 114);
header[118] = 0;
header.writeInt32LE(0, 119);
header.writeInt32LE(0, 123);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, root, metadata, ...sorted.map((t) => t.data)]));

// ---- report ----------------------------------------------------------------------------
const perZoom = {};
for (const t of tiles) perZoom[t.z] = (perZoom[t.z] ?? 0) + t.data.length;
const archive = fs.statSync(OUT).size;
// What a globe opening at zoom 1 reads: the pmtiles client's first 16 KiB
// (header, directory, metadata), then the four z1 tiles.
const atOpen = Math.min(16384, archive) + perZoom[1];
const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
console.log(`imagery: ${OUT}`);
console.log(`  source ${entry.file} (${entry.size} B, sha256 ${entry.sha256.slice(0, 16)}…), WebP q${QUALITY}, ${TILE} px tiles`);
for (let z = 0; z <= MAX_ZOOM; z++) console.log(`  z${z}: ${4 ** z} tile(s), ${perZoom[z]} B`);
console.log(`  archive ${archive} B, sha256 ${sha256(fs.readFileSync(OUT))}`);
console.log(`  read at open (first 16 KiB + the z1 tiles): ${atOpen} B`);
console.log(`  image edge at 85.05°: north ${hex(edge.north)}, south ${hex(edge.south)} (mean of the z0 tile's top and bottom rows)`);
