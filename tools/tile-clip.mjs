// Checks lines the way MapLibre 6.9.0 tiles a GeoJSON source, for the one way
// a line is known to vanish there.
//
// MapLibre's own tiler — @maplibre/geojson-vt, the version maplibre-gl itself
// resolves — clips each tile's features to the tile plus a buffer. A vertex
// lying exactly on that clip edge is kept as it is, with the importance the
// simplification gave it, instead of being replaced by an intersection point;
// on a straight line that importance is zero, so at a zoom that drops it the
// whole piece inside the tile collapses to one point and is not drawn. Found in
// the globe investigation (2026-09-27): parallels with a vertex every 1°, 5° or
// 15° lost every parallel from the eastern z1 tiles, whose clip edges fall at
// 45°W and 45°E; every 2°, 10° or 30°, none.
//
//   onClipEdge(vertex, maxZoom)   the zoom whose clip edge the vertex lies on, or -1
//   lostPieces(fc, maxZoom)       every tile a line crosses that keeps no piece of it
//
// Used by tools/build-latitude-longitude.mjs, which fails on either, and by
// tools/verify-descriptor.mjs, which re-checks the committed files.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The tiler as maplibre-gl resolves it, through the package's own ES entry
// (its CommonJS entry exports nothing to an import).
const require = createRequire(import.meta.url);
const tilerDir = path.dirname(path.dirname(createRequire(require.resolve('maplibre-gl/package.json')).resolve('@maplibre/geojson-vt')));
const tilerPackage = JSON.parse(fs.readFileSync(path.join(tilerDir, 'package.json'), 'utf8'));
const { GeoJSONVT } = await import(pathToFileURL(path.join(tilerDir, tilerPackage.exports['.'].import)).href);
export const TILER = `${tilerPackage.name} ${tilerPackage.version}`;

// The options MapLibre 6.9.0 hands the tiler for a GeoJSON source
// (src/source/geojson_source.ts): its defaults, buffer 128 px and tolerance
// 0.375 px, in tile units of an 8192 extent over a 512 px tile.
const EXTENT = 8192;
const SCALE = EXTENT / 512;
export const MAPLIBRE_GEOJSON = { extent: EXTENT, buffer: 128 * SCALE, tolerance: 0.375 * SCALE, maxZoom: 18, lineMetrics: false, generateId: false };

// The tiler's own projection to the unit square, clamped as it clamps.
export const projectX = (lon) => lon / 360 + 0.5;
export function projectY(lat) {
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI;
  return y < 0 ? 0 : y > 1 ? 1 : y;
}

/*
 * Clip edges. A tile at zoom z is clipped a quarter of a tile beyond its own
 * edges (buffer / extent), so its edges lie at odd multiples of 2^-(z+2) of
 * the world; at zoom 0 the world itself is copied across the antimeridian at
 * x = 1/4 and 3/4. Multiplying by a power of two is exact in floating point,
 * so the test is exact too.
 */
const BUFFER_TILES = MAPLIBRE_GEOJSON.buffer / EXTENT;
if (BUFFER_TILES !== 0.25) throw new Error(`tile-clip: the edges below assume a buffer of a quarter tile, not ${BUFFER_TILES}`);
function edgeZoom(v, maxZoom) {
  for (let z = 0; z <= maxZoom; z++) {
    const s = v * 2 ** (z + 2);
    if (Number.isInteger(s) && Math.abs(s % 2) === 1) return z;
  }
  return -1;
}
export const onClipEdge = ([lon, lat], maxZoom) => Math.max(edgeZoom(projectX(lon), maxZoom), edgeZoom(projectY(lat), maxZoom));

const partsOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []);
/** Every vertex of a collection that lies on a clip edge at z0..maxZoom, as "feature: [lon, lat] at zN". */
export function clipEdgeVertices(fc, maxZoom, name = (f, i) => f.properties?.id ?? String(i)) {
  const hits = [];
  fc.features.forEach((f, i) => {
    for (const part of partsOf(f.geometry)) for (const v of part) {
      const z = onClipEdge(v, maxZoom);
      if (z >= 0) hits.push(`${name(f, i)}: [${v.join(', ')}] at z${z}`);
    }
  });
  return hits;
}

// A segment keeps a positive length inside the tile's own square (Liang–Barsky).
function inside([x0, y0], [x1, y1]) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const [p, q] of [[-dx, x0], [dx, EXTENT - x0], [-dy, y0], [dy, EXTENT - y0]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return (t1 - t0) * Math.hypot(dx, dy) > 1;
}

/**
 * Tiles the lines of `fc` as MapLibre does and returns every (line, tile) at
 * z0..maxZoom where the line runs through the tile but the tile keeps no piece
 * of it, with the number of pairs checked.
 */
export function lostPieces(fc, maxZoom, name = (f, i) => f.properties?.id ?? String(i)) {
  const lines = fc.features.filter((f) => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString');
  const tagged = { type: 'FeatureCollection', features: lines.map((f, i) => ({ ...f, properties: { __line: i } })) };
  const index = new GeoJSONVT(tagged, MAPLIBRE_GEOJSON);
  const lost = [];
  let checked = 0;
  lines.forEach((f, i) => {
    for (let z = 0; z <= maxZoom; z++) {
      const n = 2 ** z;
      const tiles = new Set();
      for (const part of partsOf(f.geometry)) {
        for (let s = 0; s + 1 < part.length; s++) {
          const [ax, ay] = [projectX(part[s][0]), projectY(part[s][1])];
          const [bx, by] = [projectX(part[s + 1][0]), projectY(part[s + 1][1])];
          const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 4 * n));
          // Interior points only: a tile the line merely touches at a vertex is not one it runs through.
          for (let k = 0; k < steps; k++) {
            const t = (k + 0.5) / steps;
            const x = ax + (bx - ax) * t;
            const y = ay + (by - ay) * t;
            // Past the antimeridian the tiler wraps a line into the world's
            // other edge, and so does the tile it belongs to.
            tiles.add(`${Math.floor((x - Math.floor(x)) * n) % n}/${Math.min(n - 1, Math.max(0, Math.floor(y * n)))}`);
          }
        }
      }
      for (const key of tiles) {
        const [x, y] = key.split('/').map(Number);
        checked++;
        const kept = (index.getTile(z, x, y)?.features ?? []).filter((g) => g.tags.__line === i).flatMap((g) => g.geometry);
        if (!kept.some((p) => p.some((q, k) => k > 0 && inside(p[k - 1], q)))) lost.push(`${name(f, i)} at ${z}/${x}/${y}`);
      }
    }
  });
  return { checked, lost };
}
