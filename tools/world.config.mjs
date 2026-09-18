// What goes into shared/tiles/world.pmtiles.
//
// z0–6  whole world, Natural Earth 1:50m.
// z7–10 only inside DETAIL_AREAS, Natural Earth 1:10m. 1:50m cannot show
//       narrow waterways — at the Bosporus zoom it draws a 0.7 km strait as
//       a straight wedge. The page uses these tiles as a second source drawn
//       over a mask, so outside the boxes the 1:50m tiles simply overzoom.
//
// Boxes are [west, south, east, north]. Keep them generous: the join between
// 1:50m and 1:10m coastline shows at a box edge, so the edge should sit well
// outside the view a map opens at.
export const WORLD_MAX_ZOOM = 6;
export const DETAIL_MIN_ZOOM = 7;
export const DETAIL_MAX_ZOOM = 10;

export const DETAIL_AREAS = {
  turkishStraits: [25.2, 39.2, 30.6, 42.0], // Bosporus, Sea of Marmara, Dardanelles
  gibraltar: [-7.4, 35.0, -3.6, 37.0],
  babElMandeb: [41.8, 11.2, 45.0, 14.2],
  hormuz: [54.2, 24.6, 58.6, 28.0],
  malaccaSingapore: [98.0, 0.2, 105.2, 6.8],
  bering: [-173.0, 64.0, -165.0, 67.8], // Big & Little Diomede lie on the US–Russia line
  // Added with the 2026-09-18 passages — kept tight around the narrows (and
  // each canal) so the tile index stays small. Formosa (~130 km wide) reads
  // fine at 1:50m and has no box.
  dover: [0.3, 50.4, 2.6, 51.5],
  palk: [78.8, 8.8, 80.5, 10.5], // Adam's Bridge shoals
  sunda: [104.8, -6.9, 106.4, -5.4],
  magellan: [-75.5, -54.8, -68.0, -52.2], // narrows under 2 km wide
  cook: [173.8, -41.8, 175.4, -40.6],
  suez: [32.0, 29.8, 32.8, 31.4], // Bitter Lakes on the route
  panama: [-80.2, 8.8, -79.4, 9.5], // Gatun Lake on the route
  kiel: [8.8, 53.8, 10.3, 54.5],
  corinth: [22.6, 37.7, 23.3, 38.1],
  soo: [-84.6, 46.3, -84.1, 46.7],
  welland: [-79.4, 42.8, -79.0, 43.3],
};
