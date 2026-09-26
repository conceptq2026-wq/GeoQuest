// Geometry clean-up shared by every map build.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const CACHE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '.cache');
export const readSource = (name) => JSON.parse(fs.readFileSync(path.join(CACHE, name), 'utf8'));

/*
 * RING WINDING — do not remove.
 *
 * Vector tiles decide "is this ring land or a hole?" purely from the ring's
 * direction. Natural Earth's GeoJSON does not use one consistent direction,
 * so without this step some land renders as sea and whole tiles come out as
 * inverted rectangles (first seen on the Hormuz prototype, where the Musandam
 * peninsula was drawn as water). geojson-vt and vt-pbf pass the direction
 * straight through, so it must be fixed here, before tiling.
 *
 * Normalise to RFC 7946: outer rings counter-clockwise, holes clockwise.
 */
const signedArea = (ring) => {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return s; // > 0 means clockwise
};
const windPolygon = (rings) => rings.map((ring, i) => ((signedArea(ring) > 0) === (i === 0) ? ring.slice().reverse() : ring));
export function rewind(geometry) {
  if (!geometry) return geometry;
  if (geometry.type === 'Polygon') return { ...geometry, coordinates: windPolygon(geometry.coordinates) };
  if (geometry.type === 'MultiPolygon') return { ...geometry, coordinates: geometry.coordinates.map(windPolygon) };
  return geometry;
}

/*
 * BANGLADESH POINT OF VIEW for Natural Earth boundary lines.
 *
 * Natural Earth v5.1.2 tags each boundary line with FCLASS_BD, Bangladesh's
 * classification of that line. Rules (Natural Earth's convention):
 *   null            → no Bangladesh-specific ruling; use the default FEATURECLA
 *   'Unrecognized'  → Bangladesh does not recognise this line; drop it
 *   anything else   → use it as the line's class
 * Admin-1 (internal) lines are dropped either way — these maps show
 * international boundaries only.
 */
export function bangladeshLineClass(props) {
  const cls = props.FCLASS_BD ?? props.FEATURECLA;
  if (!cls || cls === 'Unrecognized' || /^Admin-1/.test(cls)) return null;
  return cls;
}

export const featureCollection = (features) => ({ type: 'FeatureCollection', features });

/** Keep only the listed features, with geometry rewound and properties replaced. */
export function prepare(fc, props, keep = () => true) {
  return featureCollection(
    fc.features
      .filter((f) => f.geometry && keep(f.properties))
      .map((f) => ({ type: 'Feature', geometry: rewind(f.geometry), properties: props(f.properties) })),
  );
}

export const bboxPolygon = ([w, s, e, n]) => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
});

/**
 * One JSON file out of a zip, without unpacking the rest beside it — the OCHA
 * boundary zip is 38 MB and a build wants two of its files.
 */
export function zipEntry(buf, name) {
  let eocd = buf.length - 22;
  while (buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < buf.readUInt16LE(eocd + 10); i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const skip = nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return JSON.parse((method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8'));
    }
    p += 46 + skip;
  }
  throw new Error(`${name} is not in the zip`);
}
