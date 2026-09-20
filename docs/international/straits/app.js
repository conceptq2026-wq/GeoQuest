import { PASSAGES, SEAS } from './data.js';
import * as maplibregl from '../../shared/vendor/maplibre-gl-6.9.0/maplibre-gl.mjs';
import { resolver } from '../../shared/resolver.js';

/*
|--------------------------------------------------------------------------
| DOM
|--------------------------------------------------------------------------
*/

const selector = document.getElementById('straitSelector');
const mapShell = document.querySelector('.map-shell');
const infoSheet = document.getElementById('infoSheet');
const infoSheetBody = document.getElementById('infoSheetBody');
const sheetHandle = document.getElementById('sheetHandle');
const infoKicker = document.getElementById('infoKicker');
const infoTitle = document.getElementById('infoTitle');
const infoCountries = document.getElementById('infoCountries');
const infoConnects = document.getElementById('infoConnects');
const infoBoundary = document.getElementById('infoBoundary');
const infoOpened = document.getElementById('infoOpened');
const infoLength = document.getElementById('infoLength');
const infoRoute = document.getElementById('infoRoute');
const loadNotice = document.getElementById('loadNotice');
const layersToggleBtn = document.getElementById('layersToggleBtn');
const layersMenu = document.getElementById('layersMenu');
const layerCheckboxes = document.querySelectorAll('#layersMenu input[type="checkbox"]');
const prevBtn = document.getElementById('prevPassage');
const nextBtn = document.getElementById('nextPassage');

/*
 * Animations the student did not ask for are skipped when the system asks for
 * reduced motion — the same rule the marker pulse follows in style.css. The
 * camera still moves, it just arrives immediately.
 */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motion = (ms) => (reduceMotion.matches ? 0 : ms);

/*
|--------------------------------------------------------------------------
| BUILD CONTROLS
|
| Controls are English; place names and the information card are Bengali.
| One dropdown picks the passage: with 20 straits and canals, reading a
| list beats swiping through a row of pills, and it costs one slim line.
|--------------------------------------------------------------------------
*/

/** The passage being shown, or null on the opening world view. */
let currentKey = null;

// Grouped under প্রণালি / খাল, in data.js order.
Object.entries(PASSAGES).forEach(([key, passage]) => {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = passage.nameBn;
  selector.querySelector(`optgroup[data-kind="${passage.kind}"]`).appendChild(option);
});

/*
|--------------------------------------------------------------------------
| DATA SOURCES — all served from this repo
|
| world.pmtiles (shared by every GeoQuest map) holds two tilesets:
|   z0–6   whole world, Natural Earth 1:50m
|   z7–10  1:10m, only inside small boxes around narrow waterways
| They are read as two sources. Outside the boxes the "world" tiles simply
| overzoom; inside them, "detail" paints a sea-coloured mask over the
| coarse 1:50m shapes and draws the 1:10m coastline on top. Without this the
| Bosporus would be a straight wedge at the zoom it opens at.
|
| Labels use MapLibre's `font-faces` with a bundled Noto Sans Bengali, so the
| browser shapes Bengali properly (প্র, ি, কৌ). This is why MapLibre is pinned
| at 6.9.0 — see README "Bengali labels".
|--------------------------------------------------------------------------
*/

// Every URL below comes from shared/resolver.js. Nothing here composes one.
//
// The font is named by the path it has inside the 'glyphs' class, not by a
// finished URL: MapLibre hands it to transformRequest before fetching it, and
// the resolver turns it into a URL there. See shared/resolver.js.
const BENGALI_FONT = 'noto-sans-bengali/NotoSansBengali-Regular.woff2';
const LABEL_FONT = ['Noto Sans Bengali'];

/*
 * pmtiles reads the archive with its own HTTP range requests, through its own
 * Source — they never pass through MapLibre, so transformRequest cannot reach
 * them. The archive URL has to be right at the moment the PMTiles object is
 * made, so it is made once, here, and the Protocol is given that instance.
 * A signed URL will be supplied at this same line and nowhere else.
 */
const WORLD = resolver.pmtilesSource('world.pmtiles');
const protocol = new window.pmtiles.Protocol();
protocol.add(new window.pmtiles.PMTiles(WORLD.archive));
maplibregl.addProtocol('pmtiles', protocol.tile);

/*
 * Light "school atlas" palette: a teaching map on a phone needs a clear
 * land/sea edge and labels that read over either, more than it needs to
 * look sophisticated. Every label sits on a white halo; no text colour is
 * lighter than #3f4650 on the light background.
 */
const COLORS = {
  sea: '#b9d9ee',
  land: '#f6f2e7',
  coast: '#7fa7c4',
  border: '#a0928a',
  label: '#3f4650',
  halo: '#ffffff',
  navy: '#0b3d91',
  route: '#e8590c',
  seaLabel: '#1f5f99',
  seaLabelActive: '#0b3d91',
  canal: '#2f7fc1',
};

const tileSource = (minzoom, maxzoom) => ({
  type: 'vector',
  tiles: [WORLD.tiles],
  minzoom,
  maxzoom,
  attribution: '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a>',
});

const landLayers = (source) => [
  { id: `${source}-land`, type: 'fill', source, 'source-layer': 'land', paint: { 'fill-color': COLORS.land } },
  // Lakes are water on a teaching map: the Great Lakes are what Soo and
  // Welland connect, and Panama runs through Gatun Lake.
  { id: `${source}-lakes`, type: 'fill', source, 'source-layer': 'lakes', paint: { 'fill-color': COLORS.sea } },
  // (Detail lakes are clipped to their box, so only world lakes get a shore line.)
  ...(source === 'world'
    ? [{ id: 'world-lake-shore', type: 'line', source, 'source-layer': 'lakes', paint: { 'line-color': COLORS.coast, 'line-width': 0.7 } }]
    : []),
  // Detail land is clipped to its box, so an outline would also trace the
  // box edge as a fake coast. Only the world tiles get the coast stroke.
  ...(source === 'world'
    ? [{ id: 'world-coast', type: 'line', source, 'source-layer': 'land', paint: { 'line-color': COLORS.coast, 'line-width': 0.9 } }]
    : []),
  {
    id: `${source}-borders`,
    type: 'line',
    source,
    'source-layer': 'borders',
    layout: { 'line-join': 'round' },
    paint: { 'line-color': COLORS.border, 'line-width': 1, 'line-dasharray': [3, 1.5] },
  },
];

// Below this zoom the lanes carry no information — only orange smudges.
const LANE_MIN_ZOOM = 4;

/** A cluster's count in Bengali numerals — the count is content, not chrome. */
const toBengaliDigits = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const BENGALI_COUNT = [
  'match',
  ['get', 'point_count'],
  ...Array.from({ length: 19 }, (_, i) => [i + 2, toBengaliDigits(i + 2)]).flat(),
  ['to-string', ['get', 'point_count']],
];

/** One label per connected sea; the chosen passage's seas are "active". */
function seasGeoJSON() {
  const active = new Set(currentKey ? PASSAGES[currentKey].seas : []);
  return {
    type: 'FeatureCollection',
    features: Object.entries(SEAS).map(([key, sea]) => ({
      type: 'Feature',
      properties: { nameBn: sea.nameBn, active: active.has(key) },
      geometry: { type: 'Point', coordinates: sea.at },
    })),
  };
}

/** Every passage as a point, so the opening world view shows them all. */
function passagesGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: Object.entries(PASSAGES).map(([key, passage]) => ({
      type: 'Feature',
      properties: { key, nameBn: passage.nameBn, selected: key === currentKey },
      geometry: { type: 'Point', coordinates: passage.center },
    })),
  };
}

const map = new maplibregl.Map({
  container: 'map',
  // Everything MapLibre fetches for itself goes through the resolver here,
  // rather than being rewritten inside the style: the hook sees the request
  // and its resource type at the moment it is made.
  transformRequest: (url, resourceType) => resolver.transformRequest(url, resourceType),
  style: {
    version: 8,
    'font-faces': { 'Noto Sans Bengali': BENGALI_FONT },
    sources: {
      world: tileSource(0, 6),
      detail: tileSource(7, 10),
      // Points closer than 25 px merge into one numbered cluster, so passages
      // that genuinely overlap (Bosporus, Dardanelles, Corinth; Dover and Kiel)
      // don't pile up at world zoom. Tapping a cluster zooms in until they
      // separate. 25 px, not 40: at 40 every passage merged on a portrait
      // phone and the opening view showed numbers instead of names — the
      // opening view exists so a student sees what exists straight away.
      // Offsetting points was rejected (it would put them in the wrong place)
      // and so was letting labels hide each other (a hidden point can't be
      // tapped).
      passages: { type: 'geojson', data: passagesGeoJSON(), cluster: true, clusterRadius: 25, clusterMaxZoom: 6 },
      seas: { type: 'geojson', data: seasGeoJSON() },
      // OpenStreetMap traffic-separation schemes (ODbL), built from a pinned
      // snapshot by tools/build-straits-routes.mjs. Only mapped lanes are
      // drawn — nothing is guessed or hand-joined.
      // Each canal's navigation line, from a pinned OSM snapshot (ODbL).
      canals: { type: 'geojson', data: resolver.url('mapData', 'canals.geojson') },
      routes: { type: 'geojson', data: resolver.url('mapData', 'routes.geojson'), attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': COLORS.sea } },
      ...landLayers('world'),
      { id: 'detail-mask', type: 'fill', source: 'detail', 'source-layer': 'detail_extent', paint: { 'fill-color': COLORS.sea } },
      ...landLayers('detail'),
      // Canals, drawn as water with a white casing so the cut reads on land.
      // Always shown: the canal is what the student came to see, not an
      // optional overlay.
      {
        id: 'canal-casing',
        type: 'line',
        source: 'canals',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 10, 8] },
      },
      {
        id: 'canal-lines',
        type: 'line',
        source: 'canals',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLORS.canal, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.5, 10, 5] },
      },
      // A traffic-separation scheme as charted (from LANE_MIN_ZOOM up): the separation zone between
      // the two lanes (outlined — a tinted fill read as a strip of land), the
      // scheme's outer boundaries (dashed), and the one-way lanes themselves
      // with arrows in the direction of travel.
      {
        id: 'tss-zones',
        type: 'line',
        source: 'routes',
        minzoom: LANE_MIN_ZOOM,
        filter: ['in', ['get', 'seamark'], ['literal', ['separation_zone', 'separation_line', 'separation_roundabout']]],
        paint: { 'line-color': COLORS.route, 'line-width': 1.2, 'line-opacity': 0.9 },
      },
      {
        id: 'tss-edges',
        type: 'line',
        source: 'routes',
        minzoom: LANE_MIN_ZOOM,
        filter: ['==', ['get', 'seamark'], 'separation_boundary'],
        paint: { 'line-color': COLORS.route, 'line-width': 1, 'line-opacity': 0.8, 'line-dasharray': [3, 2] },
      },
      {
        id: 'tss-lanes',
        type: 'line',
        source: 'routes',
        minzoom: LANE_MIN_ZOOM,
        filter: ['==', ['get', 'seamark'], 'separation_lane'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLORS.route, 'line-width': 2.5 },
      },
      {
        id: 'tss-arrows',
        type: 'symbol',
        source: 'routes',
        filter: ['==', ['get', 'seamark'], 'separation_lane'],
        minzoom: 6,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 90,
          'text-field': '→',
          'text-font': LABEL_FONT,
          'text-size': 16,
          'text-keep-upright': false,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': COLORS.route, 'text-halo-color': COLORS.halo, 'text-halo-width': 1.5 },
      },
      {
        id: 'country-labels',
        type: 'symbol',
        source: 'world',
        'source-layer': 'country_labels',
        // Natural Earth's own MIN_LABEL: small countries appear as you zoom in.
        filter: ['<=', ['get', 'min_zoom'], ['+', ['zoom'], 1]],
        layout: {
          'text-field': ['coalesce', ['get', 'name_bn'], ['get', 'name_en']],
          'text-font': LABEL_FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 13, 10, 16],
          'text-allow-overlap': false,
          'text-optional': true,
        },
        paint: { 'text-color': COLORS.label, 'text-halo-color': COLORS.halo, 'text-halo-width': 1.4 },
      },
      // Water-body names in blue, as atlases do. Other passages' seas only
      // from zoom 3 (at world zoom they would crowd the passage points).
      {
        id: 'sea-labels',
        type: 'symbol',
        source: 'seas',
        filter: ['all', ['!', ['get', 'active']], ['>=', ['zoom'], 3]],
        layout: {
          'text-field': ['get', 'nameBn'],
          'text-font': LABEL_FONT,
          'text-size': 12,
          'text-max-width': 7,
          'text-optional': true,
        },
        paint: { 'text-color': COLORS.seaLabel, 'text-halo-color': COLORS.halo, 'text-halo-width': 1.6 },
      },
      {
        id: 'passage-clusters',
        type: 'circle',
        source: 'passages',
        filter: ['has', 'point_count'],
        paint: { 'circle-radius': 14, 'circle-color': COLORS.navy, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' },
      },
      {
        id: 'passage-cluster-count',
        type: 'symbol',
        source: 'passages',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': BENGALI_COUNT,
          'text-font': LABEL_FONT,
          'text-size': 14,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#ffffff' },
      },
      // The selected passage is drawn by the pulsing DOM marker instead.
      {
        id: 'passage-points',
        type: 'circle',
        source: 'passages',
        filter: ['all', ['!', ['has', 'point_count']], ['!', ['get', 'selected']]],
        paint: { 'circle-radius': 6, 'circle-color': COLORS.navy, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
      },
      // Invisible, finger-sized tap target around each point or cluster
      // (~44 px across).
      {
        id: 'passage-hit',
        type: 'circle',
        source: 'passages',
        paint: { 'circle-radius': 22, 'circle-color': '#000000', 'circle-opacity': 0 },
      },
      {
        id: 'passage-labels',
        type: 'symbol',
        source: 'passages',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'nameBn'],
          'text-font': LABEL_FONT,
          'text-size': ['case', ['get', 'selected'], 16, 12],
          // Below the point if there is room, otherwise whichever side is
          // free — so a passage name never sits on top of a sea's name.
          'text-variable-anchor': ['top', 'bottom', 'right', 'left'],
          'text-radial-offset': 1,
          // The selected passage's name is placed first, so it wins collisions.
          'symbol-sort-key': ['case', ['get', 'selected'], 0, 1],
          'text-optional': true,
        },
        paint: { 'text-color': COLORS.navy, 'text-halo-color': COLORS.halo, 'text-halo-width': 2 },
      },
      // The two seas the chosen passage joins: always shown — they are half of
      // what the student came to learn. Placed first (topmost layer) and kept
      // in the collision index, so the passage name moves out of their way.
      {
        id: 'sea-labels-active',
        type: 'symbol',
        source: 'seas',
        filter: ['get', 'active'],
        layout: {
          'text-field': ['get', 'nameBn'],
          'text-font': LABEL_FONT,
          'text-size': 15,
          'text-max-width': 7,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': COLORS.seaLabelActive, 'text-halo-color': COLORS.halo, 'text-halo-width': 1.8 },
      },
    ],
  },
  // Opening view: a world view, so a student sees the passages before
  // picking one. On a portrait phone Mercator can't zoom out past the point
  // where the world fills the screen's height, which leaves only ~145° of
  // longitude — so this frames Gibraltar to East Asia, where most passages
  // are. The Americas and the far Pacific are one swipe away, and every
  // passage is always in the dropdown.
  bounds: [
    [-20, -12],
    [120, 62],
  ],
  minZoom: 0,
  maxZoom: 11,
  // Past this a flat map turns to mush at the horizon, and there is no terrain
  // to justify it: world.pmtiles carries no elevation, so tilting gives a
  // tilted flat map, not relief. A drag gesture cannot exceed this either.
  maxPitch: 60,
  attributionControl: false,
  dragRotate: true,
  touchZoomRotate: true,
});

/*
|--------------------------------------------------------------------------
| MAP CHROME — compass, then tilt, top-right
|
| No +/− buttons: pinch already zooms. MapLibre's own compass shows which way is
| north after a two-finger rotate, and a tap on it turns the map back — which is
| exactly the behaviour wanted, so the default control is used. A lettered
| N/S/E/W dial was tried here and rejected: at control size the letters are
| illegible.
|
| Chrome is English ("Tilt"/"Flat"); only place names and the card are Bengali.
|--------------------------------------------------------------------------
*/

const TILT_PITCH = 55;

/** Toggles between flat and tilted. The label says what a tap will do. */
class TiltControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.className = 'ctrl-btn ctrl-tilt';
    this._button.addEventListener('click', () => {
      const flat = map.getPitch() < 1;
      map.easeTo({ pitch: flat ? TILT_PITCH : 0, duration: motion(500) });
    });

    this._sync = () => {
      const flat = map.getPitch() < 1;
      // What tapping does next, not what the map is now.
      this._button.textContent = flat ? 'Tilt' : 'Flat';
      this._button.setAttribute('aria-label', flat ? 'Tilt the map' : 'Return the map to flat');
      this._button.title = this._button.getAttribute('aria-label');
      this._button.setAttribute('aria-pressed', String(!flat));
    };
    map.on('pitch', this._sync);
    this._sync();

    this._container.appendChild(this._button);
    return this._container;
  }

  onRemove() {
    this._map.off('pitch', this._sync);
    this._container.remove();
  }
}

map.addControl(new maplibregl.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: false }), 'top-right');
map.addControl(new TiltControl(), 'top-right');

// Credits live behind an ⓘ button under the compass: always on the page (the
// data licences require it), never in the way. Top-right keeps it clear of
// the information sheet. MapLibre's compact control opens expanded; it starts
// collapsed here, and a tap on ⓘ shows the credits.
map.addControl(
  new maplibregl.AttributionControl({
    compact: true,
    customAttribution: [
      '<a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre</a>',
      `<a href="${resolver.url('glyphs', 'noto-sans-bengali/OFL.txt')}" target="_blank" rel="noopener noreferrer">Noto Sans Bengali</a>`,
    ],
  }),
  'top-right',
);
map.once('load', () => {
  document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
});

// Keep the canvas correctly sized on container/orientation changes.
window.addEventListener('resize', () => map.resize());

// Surface map errors instead of failing silently with a blank canvas. If the
// shared tiles can't be read, say so — the passages and routes still work.
map.on('error', (event) => {
  console.error('Map error:', event && event.error);
  if (event && (event.sourceId === 'world' || event.sourceId === 'detail')) loadNotice.classList.add('visible');
});

/*
|--------------------------------------------------------------------------
| TAPPING A PASSAGE ON THE MAP — same as picking it in the dropdown
|--------------------------------------------------------------------------
*/

map.on('click', 'passage-hit', async (event) => {
  const feature = event.features && event.features[0];
  if (!feature) return;
  if (feature.properties.cluster) {
    const zoom = await map.getSource('passages').getClusterExpansionZoom(feature.properties.cluster_id);
    map.easeTo({ center: feature.geometry.coordinates, zoom, duration: 700 });
    return;
  }
  selectStrait(feature.properties.key);
});

map.on('mouseenter', 'passage-hit', () => {
  map.getCanvas().style.cursor = 'pointer';
});

map.on('mouseleave', 'passage-hit', () => {
  map.getCanvas().style.cursor = '';
});

/*
|--------------------------------------------------------------------------
| SELECTED-PASSAGE MARKER
|
| A DOM marker with a CSS pulse. Changing a paint property on every animation
| frame would force a full map redraw 60 times a second — a steady drain on
| low-end phones. CSS animates on the compositor, so the map only redraws
| when it actually moves. Tapping it brings the information back.
|--------------------------------------------------------------------------
*/

const markerEl = document.createElement('button');
markerEl.type = 'button';
markerEl.className = 'strait-marker';
markerEl.setAttribute('aria-label', 'Show details');
markerEl.innerHTML = '<span class="strait-marker-pulse"></span><span class="strait-marker-core"></span>';
markerEl.addEventListener('click', (event) => {
  event.stopPropagation();
  setSheetOpen(true);
});

const marker = new maplibregl.Marker({ element: markerEl });

/*
|--------------------------------------------------------------------------
| SELECT A PASSAGE
|--------------------------------------------------------------------------
*/

function selectStrait(key) {
  const strait = PASSAGES[key];
  if (!strait) return;

  currentKey = key;
  selector.value = key;

  // The student just asked for this passage, so its information opens.
  updateInfo(key);
  setSheetOpen(true);
  showStrait(strait);

  map.getSource('passages')?.setData(passagesGeoJSON());
  map.getSource('seas')?.setData(seasGeoJSON());
  marker.setLngLat(strait.center).addTo(map);

  // Whichever route got here — dropdown, map tap, or the step buttons — the
  // ends of the list are re-checked in one place.
  syncStepButtons();
}

/**
 * Fits the passage's hand-set frame (data.js) — both neighbouring countries
 * and both connected seas — into the part of the map the sheet leaves
 * visible. A student first needs to see WHERE the passage is and what it
 * joins; pinching in shows how narrow it is.
 *
 * Orientation is preserved on purpose. It used to be forced to bearing 0 and
 * pitch 0, which threw away any rotation or tilt on the next selection and
 * would make the compass and the tilt button pointless. The compass is how a
 * student returns to north; the tilt button is how they return to flat.
 *
 * The current bearing is passed EXPLICITLY. Leaving it out does not mean
 * "keep it": MapLibre's cameraForBounds defaults the bearing to 0, so an
 * omitted option silently straightens the map. Measured in 6.9.0 — a fit from
 * bearing 45 landed at bearing 0. Given the bearing, it fits correctly for the
 * rotated view (the same bounds want zoom 4.315 at bearing 0 and 3.937 at 45).
 *
 * Pitch is a different story: cameraForBounds ignores it entirely, returning
 * the same zoom at every pitch, so a tilted fit runs slightly tight. See the
 * PITCH_FIT_EASE note below.
 */
function showStrait(strait) {
  const [w, s, e, n] = strait.frame;
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    {
      padding: { top: 16, right: 16, left: 16, bottom: sheetHeight() + 16 },
      bearing: map.getBearing(),
      duration: 1800,
      essential: true,
    },
  );
}

function updateInfo(key) {
  const passage = PASSAGES[key];

  infoKicker.textContent = passage.kind === 'canal' ? 'খাল' : 'প্রণালি';
  infoTitle.textContent = passage.altNameBn ? `${passage.nameBn} (${passage.altNameBn})` : passage.nameBn;
  infoCountries.textContent = passage.countriesBn;
  infoConnects.textContent = passage.connectsBn;
  setRow(infoBoundary, passage.boundaryNote);
  // Canal facts stay hidden until checked against the textbook (data.js).
  setRow(infoOpened, passage.openedBn);
  setRow(infoLength, passage.lengthBn);
  infoRoute.textContent = ROUTE_STATUS_BN[passage.routeStatus];
}

/** Fills a card row, or hides it when there is nothing verified to show. */
function setRow(valueEl, value) {
  valueEl.textContent = value ?? '';
  valueEl.parentElement.hidden = value == null;
}

/*
 * What the card says about the shipping lane. Where OpenStreetMap has no
 * scheme, the card says so plainly and nothing is drawn.
 */
const ROUTE_STATUS_BN = {
  mapped: 'নির্ধারিত নৌপথ (IMO ট্রাফিক বিভাজন ব্যবস্থা) মানচিত্রে দেখানো হয়েছে',
  partial: 'আংশিক — নির্ধারিত নৌপথের কেবল কিছু অংশ মানচিত্রে আছে',
  none: 'এখানে কোনো নির্ধারিত নৌপথের মানচিত্রায়িত তথ্য নেই',
  canal: 'খালটিই নৌপথ — খালের পথ মানচিত্রে দেখানো হয়েছে',
};

selector.addEventListener('change', (event) => {
  selectStrait(event.target.value);
});

/*
|--------------------------------------------------------------------------
| PREVIOUS / NEXT
|
| Steps the whole list in data.js order. The প্রণালি / খাল grouping in the
| dropdown is visual only, so stepping crosses it without stopping.
|
| Both buttons go through selectStrait, the same route the dropdown takes, so
| the camera, the marker and the card have exactly one implementation.
|
| The ends stop rather than wrap. There is no counter anywhere, so a disabled
| button is the only "you are at the end" the student gets; wrapping silently
| from the last entry to the first would just look like a jump.
|--------------------------------------------------------------------------
*/

const ORDER = Object.keys(PASSAGES);

/** -1 when nothing is picked yet, so "next" lands on the first entry. */
const currentIndex = () => (currentKey === null ? -1 : ORDER.indexOf(currentKey));

function syncStepButtons() {
  const i = currentIndex();
  prevBtn.disabled = i <= 0;
  nextBtn.disabled = i >= ORDER.length - 1;
}

function step(delta) {
  const next = currentIndex() + delta;
  if (next < 0 || next >= ORDER.length) return;
  selectStrait(ORDER[next]);
}

prevBtn.addEventListener('click', () => step(-1));
nextBtn.addEventListener('click', () => step(1));

/*
|--------------------------------------------------------------------------
| INFORMATION SHEET — drag or tap to hide/show
|
| Tapping the handle is the dependable path; dragging the sheet is a bonus.
| The sheet is a separate element above the map, so a finger that starts on
| it never pans the map, and one that starts on the map never moves it.
| Hidden, only the handle strip stays visible and the map is full-screen.
| Before anything is picked there is nothing to show, so the sheet —
| handle included — stays fully off-screen.
|--------------------------------------------------------------------------
*/

const HANDLE_HEIGHT = 26;
const FLICK_SPEED = 0.5; // px per ms
const DRAG_SLOP = 6; // px of movement before a press counts as a drag

let sheetOpen = false;
let sheetOffset = 0;
let drag = null;
let lastDragEnd = -Infinity;

const sheetHeight = () => infoSheet.offsetHeight;
const closedOffset = () => (currentKey ? Math.max(0, sheetHeight() - HANDLE_HEIGHT) : sheetHeight());

function applySheetOffset(offset) {
  sheetOffset = offset;
  infoSheet.style.setProperty('--sheet-offset', `${offset}px`);
}

function setSheetOpen(open) {
  sheetOpen = open && currentKey !== null;
  // Nothing picked yet: the sheet is fully off-screen and out of the tab order.
  infoSheet.inert = currentKey === null;
  sheetHandle.setAttribute('aria-expanded', String(sheetOpen));
  sheetHandle.setAttribute('aria-label', sheetOpen ? 'Hide details' : 'Show details');
  infoSheetBody.inert = !sheetOpen;
  applySheetOffset(sheetOpen ? 0 : closedOffset());
}

sheetHandle.addEventListener('click', (event) => {
  // A drag that starts on the handle ends with a click on it too; that click
  // must not undo what the drag just did.
  if (event.timeStamp - lastDragEnd < 400) return;
  setSheetOpen(!sheetOpen);
});

// A drag starts on the sheet but is followed on the window: a finger or
// mouse quickly leaves the 26 px handle strip while pulling it up.
infoSheet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || currentKey === null) return;
  drag = { id: event.pointerId, startY: event.clientY, startOffset: sheetOffset, lastY: event.clientY, lastT: event.timeStamp, velocity: 0, moved: false };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
});

function onDragMove(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const dy = event.clientY - drag.startY;
  if (!drag.moved) {
    if (Math.abs(dy) < DRAG_SLOP) return;
    drag.moved = true;
    infoSheet.classList.add('dragging');
    mapShell.classList.add('sheet-dragging');
  }
  const dt = event.timeStamp - drag.lastT;
  if (dt > 0) drag.velocity = (event.clientY - drag.lastY) / dt;
  drag.lastY = event.clientY;
  drag.lastT = event.timeStamp;
  applySheetOffset(Math.min(Math.max(drag.startOffset + dy, 0), closedOffset()));
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const { moved, velocity, startOffset } = drag;
  drag = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', endDrag);
  if (!moved) return; // a plain tap: the handle's click does the toggling
  lastDragEnd = event.timeStamp;
  infoSheet.classList.remove('dragging');
  mapShell.classList.remove('sheet-dragging');
  // A flick decides by its direction; otherwise it takes a third of the way.
  const third = closedOffset() / 3;
  let open;
  if (velocity > FLICK_SPEED) open = false;
  else if (velocity < -FLICK_SPEED) open = true;
  else open = startOffset === 0 ? sheetOffset < third : sheetOffset < closedOffset() - third;
  setSheetOpen(open);
}

// Content height changes between passages (a longer note, canal rows): keep
// a hidden sheet tucked away.
new ResizeObserver(() => applySheetOffset(sheetOpen ? 0 : closedOffset())).observe(infoSheet);

/*
|--------------------------------------------------------------------------
| LAYERS MENU — country names, connected seas, shipping routes
|--------------------------------------------------------------------------
*/

const LAYER_GROUPS = {
  countryLabels: ['country-labels'],
  seas: ['sea-labels', 'sea-labels-active'],
  routes: ['tss-zones', 'tss-edges', 'tss-lanes', 'tss-arrows'],
};

function setGroupVisibility(groupKey, visible) {
  (LAYER_GROUPS[groupKey] || []).forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  });
}

layerCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener('change', () => {
    setGroupVisibility(checkbox.dataset.layerGroup, checkbox.checked);
  });
});

layersToggleBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = layersMenu.classList.toggle('open');
  layersToggleBtn.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', (event) => {
  if (!layersMenu.contains(event.target) && event.target !== layersToggleBtn) {
    layersMenu.classList.remove('open');
    layersToggleBtn.setAttribute('aria-expanded', 'false');
  }
});

/*
|--------------------------------------------------------------------------
| INITIAL UI — world view, nothing selected, sheet off-screen
|--------------------------------------------------------------------------
*/

selector.value = '';
setSheetOpen(false);
// Nothing picked: ‹ is dead, › starts the list at its first entry.
syncStepButtons();
