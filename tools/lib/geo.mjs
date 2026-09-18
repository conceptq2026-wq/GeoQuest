// Geometry clean-up shared by every map build.
import fs from 'node:fs';
import path from 'node:path';

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
