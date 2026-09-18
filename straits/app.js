import { SEAS, STRAITS } from './data.js';
import * as maplibregl from '../shared/vendor/maplibre-gl-6.9.0/maplibre-gl.mjs';

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
const infoTitle = document.getElementById('infoTitle');
const infoCountries = document.getElementById('infoCountries');
const infoConnects = document.getElementById('infoConnects');
const infoBoundary = document.getElementById('infoBoundary');
const loadNotice = document.getElementById('loadNotice');
const layersToggleBtn = document.getElementById('layersToggleBtn');
const layersMenu = document.getElementById('layersMenu');
const layerCheckboxes = document.querySelectorAll('#layersMenu input[type="checkbox"]');

/*
|--------------------------------------------------------------------------
| BUILD CONTROLS
|
| Controls are English; place names and the information card are Bengali.
| One dropdown picks the passage: with 10+ straits and canals, reading a
| list beats swiping through a row of pills, and it costs one slim line.
|--------------------------------------------------------------------------
*/

/** The passage being shown, or null on the opening world view. */
let currentKey = null;

Object.entries(STRAITS).forEach(([key, strait]) => {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = strait.nameBn;
  selector.appendChild(option);
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

const WORLD_PMTILES = new URL('../shared/tiles/world.pmtiles', location.href).href;
const BENGALI_FONT = new URL('../shared/fonts/noto-sans-bengali/NotoSansBengali-Regular.woff2', location.href).href;
const LABEL_FONT = ['Noto Sans Bengali'];

const protocol = new window.pmtiles.Protocol();
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
};

const tileSource = (minzoom, maxzoom) => ({
  type: 'vector',
  tiles: [`pmtiles://${WORLD_PMTILES}/{z}/{x}/{y}`],
  minzoom,
  maxzoom,
  attribution: '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>',
});

const landLayers = (source) => [
  { id: `${source}-land`, type: 'fill', source, 'source-layer': 'land', paint: { 'fill-color': COLORS.land } },
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

const EMPTY = { type: 'FeatureCollection', features: [] };

/** One label per connected sea; the chosen passage's seas are "active". */
function seasGeoJSON() {
  const active = new Set(currentKey ? STRAITS[currentKey].seas : []);
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
    features: Object.entries(STRAITS).map(([key, strait]) => ({
      type: 'Feature',
      properties: { key, nameBn: strait.nameBn, selected: key === currentKey },
      geometry: { type: 'Point', coordinates: strait.center },
    })),
  };
}

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    'font-faces': { 'Noto Sans Bengali': BENGALI_FONT },
    sources: {
      world: tileSource(0, 6),
      detail: tileSource(7, 10),
      passages: { type: 'geojson', data: passagesGeoJSON() },
      seas: { type: 'geojson', data: seasGeoJSON() },
      'strait-route': { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': COLORS.sea } },
      ...landLayers('world'),
      { id: 'detail-mask', type: 'fill', source: 'detail', 'source-layer': 'detail_extent', paint: { 'fill-color': COLORS.sea } },
      ...landLayers('detail'),
      {
        id: 'strait-route-casing',
        type: 'line',
        source: 'strait-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.95 },
      },
      {
        id: 'strait-route-line',
        type: 'line',
        source: 'strait-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLORS.route, 'line-width': 3.5, 'line-dasharray': [2, 1.2] },
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
      // Water-body names in blue, as atlases do; the two seas the chosen
      // passage joins are larger and darker, and win label collisions.
      {
        id: 'sea-labels',
        type: 'symbol',
        source: 'seas',
        // At world zoom the other seas' names would crowd the passage points.
        filter: ['any', ['get', 'active'], ['>=', ['zoom'], 3]],
        layout: {
          'text-field': ['get', 'nameBn'],
          'text-font': LABEL_FONT,
          'text-size': ['case', ['get', 'active'], 15, 12],
          'text-max-width': 7,
          'symbol-sort-key': ['case', ['get', 'active'], 0, 1],
          'text-optional': true,
        },
        paint: {
          'text-color': ['case', ['get', 'active'], COLORS.seaLabelActive, COLORS.seaLabel],
          'text-halo-color': COLORS.halo,
          'text-halo-width': 1.6,
        },
      },
      // The selected passage is drawn by the pulsing DOM marker instead.
      {
        id: 'passage-points',
        type: 'circle',
        source: 'passages',
        filter: ['!', ['get', 'selected']],
        paint: { 'circle-radius': 6, 'circle-color': COLORS.navy, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
      },
      // Invisible, finger-sized tap target around each point (~44 px across).
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
        layout: {
          'text-field': ['get', 'nameBn'],
          'text-font': LABEL_FONT,
          'text-size': ['case', ['get', 'selected'], 16, 12],
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          // The selected passage's name is placed first, so it wins collisions.
          'symbol-sort-key': ['case', ['get', 'selected'], 0, 1],
          'text-optional': true,
        },
        paint: { 'text-color': COLORS.navy, 'text-halo-color': COLORS.halo, 'text-halo-width': 2 },
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
  attributionControl: false,
  dragRotate: true,
  touchZoomRotate: true,
});

// No +/− buttons: pinch already zooms. The compass shows which way is north
// after a two-finger rotate, and a tap on it turns the map back.
map.addControl(new maplibregl.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: false }), 'top-right');

// Credits live behind an ⓘ button under the compass: always on the page (the
// data licences require it), never in the way. Top-right keeps it clear of
// the information sheet. MapLibre's compact control opens expanded; it starts
// collapsed here, and a tap on ⓘ shows the credits.
map.addControl(
  new maplibregl.AttributionControl({
    compact: true,
    customAttribution: [
      '<a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>',
      '<a href="../shared/fonts/noto-sans-bengali/OFL.txt" target="_blank" rel="noopener">Noto Sans Bengali</a>',
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

map.on('click', 'passage-hit', (event) => {
  const feature = event.features && event.features[0];
  if (feature) selectStrait(feature.properties.key);
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
  const strait = STRAITS[key];
  if (!strait) return;

  currentKey = key;
  selector.value = key;

  // The student just asked for this passage, so its information opens.
  updateInfo(key);
  setSheetOpen(true);
  showStrait(strait);

  map.getSource('strait-route')?.setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: strait.route } }],
  });
  map.getSource('passages')?.setData(passagesGeoJSON());
  map.getSource('seas')?.setData(seasGeoJSON());
  marker.setLngLat(strait.center).addTo(map);
}

/**
 * Centres the passage in the part of the map the sheet leaves visible:
 * MapLibre's padding shifts the centre point up by the sheet's height, so a
 * strait the student just picked never sits underneath it.
 */
function showStrait(strait) {
  map.flyTo({
    center: strait.center,
    zoom: strait.zoom,
    bearing: 0,
    pitch: 0,
    padding: { top: 0, right: 0, left: 0, bottom: sheetHeight() },
    duration: 1800,
    essential: true,
  });
}

function updateInfo(key) {
  const strait = STRAITS[key];

  infoTitle.textContent = strait.nameBn;
  infoCountries.textContent = strait.countriesBn;
  infoConnects.textContent = strait.connectsBn;
  infoBoundary.textContent = strait.boundaryNote || '—';
}

selector.addEventListener('change', (event) => {
  selectStrait(event.target.value);
});

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
  seas: ['sea-labels'],
  routes: ['strait-route-casing', 'strait-route-line'],
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
