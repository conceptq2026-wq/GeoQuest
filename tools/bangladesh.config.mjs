// What goes into shared/tiles/bangladesh.pmtiles.
//
// Boxes are [west, south, east, north]. Each is the extent of what it has to
// hold plus at least 0.3°, rounded outward to 0.1°; build-bangladesh.mjs
// recomputes those extents from the data and fails if a box no longer holds
// them.
//
// COVERAGE   every unit the basemap covers: Bangladesh; West Bengal, Tripura
//            and Cachar (Assam) in India; Rakhine State in Myanmar. Nothing
//            outside it is drawn, and maps on this basemap cannot pan past it.
// FRAME      where a map opens unless it sets its own frame: Bangladesh, West
//            Bengal and Tripura. Rakhine lies mostly south of it.
// DETAIL     z7–10 tiles exist only here — Bangladesh. Outside it the z6
//            tiles overzoom, as on world.pmtiles.
export const COVERAGE = [85.5, 17.0, 95.3, 27.6];
export const FRAME = [85.5, 20.2, 93.0, 27.6];
export const DETAIL_AREAS = { bangladesh: [87.7, 20.2, 93.0, 27.0] };

export const OVERVIEW_MIN_ZOOM = 3;
export const OVERVIEW_MAX_ZOOM = 6;
export const DETAIL_MIN_ZOOM = 7;
export const DETAIL_MAX_ZOOM = 10;
