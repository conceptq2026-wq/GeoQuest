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
};
