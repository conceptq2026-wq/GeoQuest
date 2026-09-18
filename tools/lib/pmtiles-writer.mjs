// Minimal PMTiles v3 writer (spec: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md).
// The `pmtiles` npm package only reads archives, so writing is done here.
// Scope: a single root directory (no leaf directories). That covers a few
// thousand tiles; writeArchive() throws if the root outgrows the 16 KiB the
// spec allows, rather than writing a file readers would reject.
import zlib from 'node:zlib';
import { zxyToTileId } from 'pmtiles';

const HEADER_BYTES = 127;
const MAX_ROOT_BYTES = 16384 - HEADER_BYTES;

function pushVarint(out, n) {
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

function serializeDirectory(entries) {
  const out = [];
  pushVarint(out, entries.length);
  let lastId = 0;
  for (const e of entries) { pushVarint(out, e.tileId - lastId); lastId = e.tileId; }
  for (const e of entries) pushVarint(out, e.runLength);
  for (const e of entries) pushVarint(out, e.length);
  entries.forEach((e, i) => {
    const contiguous = i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length;
    pushVarint(out, contiguous ? 0 : e.offset + 1);
  });
  return zlib.gzipSync(Buffer.from(out), { level: 9 });
}

/**
 * @param tiles    [{ z, x, y, data }] — data is an uncompressed MVT buffer
 * @param metadata JSON object stored in the archive (vector_layers, attribution…)
 * @param header   { minZoom, maxZoom, bounds: [w, s, e, n], center: [lon, lat, zoom] }
 */
export function writeArchive(tiles, metadata, header) {
  const sorted = tiles
    .map((t) => ({ id: zxyToTileId(t.z, t.x, t.y), data: zlib.gzipSync(t.data, { level: 9 }) }))
    .sort((a, b) => a.id - b.id);

  // Identical tiles (open ocean, solid land interiors) are stored once;
  // consecutive tile ids pointing at the same bytes become one run.
  const offsetByContent = new Map();
  const blobs = [];
  const entries = [];
  let dataLength = 0;
  for (const t of sorted) {
    const key = t.data.toString('base64');
    let offset = offsetByContent.get(key);
    if (offset === undefined) {
      offset = dataLength;
      offsetByContent.set(key, offset);
      blobs.push(t.data);
      dataLength += t.data.length;
    }
    const last = entries[entries.length - 1];
    if (last && last.offset === offset && last.tileId + last.runLength === t.id) last.runLength++;
    else entries.push({ tileId: t.id, offset, length: t.data.length, runLength: 1 });
  }

  const root = serializeDirectory(entries);
  if (root.length > MAX_ROOT_BYTES) {
    throw new Error(`Root directory is ${root.length} B (max ${MAX_ROOT_BYTES}); leaf directories would be needed.`);
  }
  const meta = zlib.gzipSync(Buffer.from(JSON.stringify(metadata)), { level: 9 });

  const h = Buffer.alloc(HEADER_BYTES);
  const u64 = (pos, v) => h.writeBigUInt64LE(BigInt(v), pos);
  const e7 = (deg) => Math.round(deg * 1e7);
  const rootOffset = HEADER_BYTES;
  const metaOffset = rootOffset + root.length;
  const dataOffset = metaOffset + meta.length;
  h.write('PMTiles', 0, 'ascii');
  h[7] = 3;
  u64(8, rootOffset); u64(16, root.length);
  u64(24, metaOffset); u64(32, meta.length);
  u64(40, 0); u64(48, 0); // no leaf directories
  u64(56, dataOffset); u64(64, dataLength);
  u64(72, sorted.length); u64(80, entries.length); u64(88, blobs.length);
  h[96] = 1;  // clustered: tile data is in tile-id order
  h[97] = 2;  // internal compression: gzip
  h[98] = 2;  // tile compression: gzip
  h[99] = 1;  // tile type: MVT
  h[100] = header.minZoom; h[101] = header.maxZoom;
  const [w, s, e, n] = header.bounds;
  h.writeInt32LE(e7(w), 102); h.writeInt32LE(e7(s), 106);
  h.writeInt32LE(e7(e), 110); h.writeInt32LE(e7(n), 114);
  const [clon, clat, cz] = header.center;
  h[118] = cz; h.writeInt32LE(e7(clon), 119); h.writeInt32LE(e7(clat), 123);

  return {
    buffer: Buffer.concat([h, root, meta, ...blobs]),
    stats: { tiles: sorted.length, unique: blobs.length, entries: entries.length, rootBytes: root.length },
  };
}
