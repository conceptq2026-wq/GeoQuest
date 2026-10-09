// A minimal reader for OpenStreetMap's PBF format (https://wiki.openstreetmap.org/wiki/PBF_Format), written for
// RES-2 because no OSM tool is installed and none may be downloaded. It reads a local file only — no network.
//   for (const block of blocks(file)) for (const e of elements(block, { nodes, ways, relations })) …
// An element is { type: 'node'|'way'|'relation', id, version, tags, lat?, lon?, refs?, members? }.
// Ids are JavaScript numbers (OSM ids stay far below 2^53).
import fs from 'node:fs';
import zlib from 'node:zlib';

// ---- protobuf wire format ----------------------------------------------------------------------------------------
function* fields(buf, start = 0, end = buf.length) {
  let p = start;
  while (p < end) {
    let key = 0, shift = 0, b;
    do { b = buf[p++]; key += (b & 0x7f) * 2 ** shift; shift += 7; } while (b & 0x80);
    const no = Math.floor(key / 8), wire = key % 8;
    if (wire === 0) {
      let v = 0; shift = 0;
      do { b = buf[p++]; v += (b & 0x7f) * 2 ** shift; shift += 7; } while (b & 0x80);
      yield [no, wire, v];
    } else if (wire === 2) {
      let len = 0; shift = 0;
      do { b = buf[p++]; len += (b & 0x7f) * 2 ** shift; shift += 7; } while (b & 0x80);
      yield [no, wire, p, p + len];
      p += len;
    } else if (wire === 1) { yield [no, wire, p]; p += 8; }
    else if (wire === 5) { yield [no, wire, p]; p += 4; }
    else throw new Error(`protobuf: wire type ${wire} at ${p}`);
  }
}
// Packed varints as unsigned numbers, or zigzag-decoded (sint), for values below 2^53.
function packed(buf, start, end, zigzag = false) {
  const out = [];
  let p = start;
  while (p < end) {
    let v = 0, shift = 0, b;
    do { b = buf[p++]; v += (b & 0x7f) * 2 ** shift; shift += 7; } while (b & 0x80);
    out.push(zigzag ? (v % 2 ? -(v + 1) / 2 : v / 2) : v);
  }
  return out;
}
const zz = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);

// ---- file blocks ---------------------------------------------------------------------------------------------------
/** Each OSMData block of a file (a path) or of its bytes (a Buffer: a download held in memory, never written),
 *  inflated: { buf, strings, groups, granularity, latOffset, lonOffset }. */
export function* blocks(source) {
  const mem = Buffer.isBuffer(source) ? source : null;
  const fd = mem ? null : fs.openSync(source, 'r');
  const size = mem ? mem.length : fs.fstatSync(fd).size;
  const read = (n, at) => { if (mem) return mem.subarray(at, at + n); const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, at); return b; };
  let pos = 0;
  try {
    while (pos < size) {
      const hlen = read(4, pos).readUInt32BE(0); pos += 4;
      const hbuf = read(hlen, pos); pos += hlen;
      let type = '', datasize = 0;
      for (const [no, , a, b] of fields(hbuf)) { if (no === 1) type = hbuf.toString('utf8', a, b); else if (no === 3) datasize = a; }
      const blob = read(datasize, pos); pos += datasize;
      if (type !== 'OSMData') continue;
      let data = null;
      for (const [no, , a, b] of fields(blob)) {
        if (no === 1) data = blob.subarray(a, b);
        else if (no === 3) data = zlib.inflateSync(blob.subarray(a, b));
      }
      if (!data) throw new Error('osm-pbf: a blob with neither raw nor zlib data');
      yield block(data);
    }
  } finally { if (fd !== null) fs.closeSync(fd); }
}

function block(buf) {
  const out = { buf, strings: [], groups: [], granularity: 100, latOffset: 0, lonOffset: 0 };
  for (const [no, w, a, b] of fields(buf)) {
    if (no === 1) for (const [n2, , c, d] of fields(buf, a, b)) { if (n2 === 1) out.strings.push(buf.toString('utf8', c, d)); }
    else if (no === 2) out.groups.push([a, b]);
    else if (no === 17 && w === 0) out.granularity = a;
    else if (no === 19 && w === 0) out.latOffset = a;
    else if (no === 20 && w === 0) out.lonOffset = a;
  }
  return out;
}

// ---- elements ------------------------------------------------------------------------------------------------------
const tagsOf = (s, keys, vals) => { const t = {}; keys.forEach((k, i) => { t[s[k]] = s[vals[i]]; }); return t; };
const versionOf = (buf, a, b) => { for (const [no, w, v] of fields(buf, a, b)) if (no === 1 && w === 0) return v; return null; };

/** The elements of one block; `want` picks the kinds to decode ({ nodes, ways, relations }, default all). */
export function* elements(blk, want = { nodes: true, ways: true, relations: true }) {
  const { buf, strings: s, granularity: g, latOffset, lonOffset } = blk;
  const coord = (v, off) => (off + g * v) / 1e9;
  for (const [ga, gb] of blk.groups) {
    for (const [no, , a, b] of fields(buf, ga, gb)) {
      if (no === 2 && want.nodes) {
        let ids = [], lats = [], lons = [], kv = [], versions = [];
        for (const [n2, , c, d] of fields(buf, a, b)) {
          if (n2 === 1) ids = packed(buf, c, d, true);
          else if (n2 === 8) lats = packed(buf, c, d, true);
          else if (n2 === 9) lons = packed(buf, c, d, true);
          else if (n2 === 10) kv = packed(buf, c, d);
          else if (n2 === 5) for (const [n3, , e, f] of fields(buf, c, d)) if (n3 === 1) versions = packed(buf, e, f);
        }
        let id = 0, lat = 0, lon = 0, k = 0;
        for (let i = 0; i < ids.length; i++) {
          id += ids[i]; lat += lats[i]; lon += lons[i];
          const tags = {};
          while (k < kv.length && kv[k] !== 0) { tags[s[kv[k]]] = s[kv[k + 1]]; k += 2; }
          k++;
          yield { type: 'node', id, version: versions[i] ?? null, tags, lat: coord(lat, latOffset), lon: coord(lon, lonOffset) };
        }
      } else if (no === 1 && want.nodes) {
        let id = 0, lat = 0, lon = 0, keys = [], vals = [], version = null;
        for (const [n2, w, c, d] of fields(buf, a, b)) {
          if (n2 === 1) id = zz(c); else if (n2 === 8) lat = zz(c); else if (n2 === 9) lon = zz(c);
          else if (n2 === 2) keys = packed(buf, c, d); else if (n2 === 3) vals = packed(buf, c, d);
          else if (n2 === 4 && w === 2) version = versionOf(buf, c, d);
        }
        yield { type: 'node', id, version, tags: tagsOf(s, keys, vals), lat: coord(lat, latOffset), lon: coord(lon, lonOffset) };
      } else if (no === 3 && want.ways) {
        let id = 0, keys = [], vals = [], refs = [], version = null;
        for (const [n2, w, c, d] of fields(buf, a, b)) {
          if (n2 === 1) id = c; else if (n2 === 2) keys = packed(buf, c, d); else if (n2 === 3) vals = packed(buf, c, d);
          else if (n2 === 8) { let r = 0; refs = packed(buf, c, d, true).map((x) => (r += x)); }
          else if (n2 === 4 && w === 2) version = versionOf(buf, c, d);
        }
        yield { type: 'way', id, version, tags: tagsOf(s, keys, vals), refs };
      } else if (no === 4 && want.relations) {
        let id = 0, keys = [], vals = [], roles = [], memids = [], types = [], version = null;
        for (const [n2, w, c, d] of fields(buf, a, b)) {
          if (n2 === 1) id = c; else if (n2 === 2) keys = packed(buf, c, d); else if (n2 === 3) vals = packed(buf, c, d);
          else if (n2 === 8) roles = packed(buf, c, d);
          else if (n2 === 9) { let r = 0; memids = packed(buf, c, d, true).map((x) => (r += x)); }
          else if (n2 === 10) types = packed(buf, c, d);
          else if (n2 === 4 && w === 2) version = versionOf(buf, c, d);
        }
        const T = ['node', 'way', 'relation'];
        yield { type: 'relation', id, version, tags: tagsOf(s, keys, vals), members: memids.map((ref, i) => ({ type: T[types[i]], ref, role: s[roles[i]] })) };
      }
    }
  }
}
