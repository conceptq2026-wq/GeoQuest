import { STRAITS, INITIAL_STRAIT_KEY } from './data.js';
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
const infoEn = document.getElementById('infoEn');
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
| Controls are English; the place names on them are Bengali content. One
| dropdown picks the passage: with 10+ straits and canals, reading a list
| beats swiping through a row of pills, and it costs one slim line.
|--------------------------------------------------------------------------
*/

let currentKey = INITIAL_STRAIT_KEY;

Object.entries(STRAITS).forEach(([key, strait]) => {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = `${strait.nameBn} — ${strait.nameEn}`;
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
| overzoom; inside them, "detail" paints an ocean-coloured mask over the
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

const COLORS = {
  sea: '#0a0a0c',
  land: '#1c1c1f',
  coast: '#33333a',
  border: '#6d6d78',
  famous: '#5ad1ff',
  countryLabel: '#9a9aa5',
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
    ? [{ id: 'world-coast', type: 'line', source, 'source-layer': 'land', paint: { 'line-color': COLORS.coast, 'line-width': 0.6 } }]
    : []),
  {
    id: `${source}-borders`,
    type: 'line',
    source,
    'source-layer': 'borders',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': COLORS.border, 'line-width': 0.8, 'line-opacity': 0.85 },
  },
];

const initialKey = INITIAL_STRAIT_KEY;
const initial = STRAITS[initialKey];

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    'font-faces': { 'Noto Sans Bengali': BENGALI_FONT },
    sources: {
      world: tileSource(0, 6),
      detail: tileSource(7, 10),
      famous: { type: 'geojson', data: './famous-lines.geojson' },
      'strait-route': { type: 'geojson', data: createRouteGeoJSON(initial.route) },
      'strait-marker': { type: 'geojson', data: createMarkerGeoJSON(initial) },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': COLORS.sea } },
      ...landLayers('world'),
      { id: 'detail-mask', type: 'fill', source: 'detail', 'source-layer': 'detail_extent', paint: { 'fill-color': COLORS.sea } },
      ...landLayers('detail'),
      {
        id: 'famous-line-traced',
        type: 'line',
        source: 'famous',
        filter: ['==', ['get', 'kind'], 'trace'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': COLORS.famous, 'line-width': 2.6, 'line-opacity': 0.95 },
      },
      {
        id: 'strait-route-glow',
        type: 'line',
        source: 'strait-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#f8c84a', 'line-width': 11, 'line-opacity': 0.18 },
      },
      {
        id: 'strait-route-line',
        type: 'line',
        source: 'strait-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffd65a', 'line-width': 3.5, 'line-opacity': 0.95, 'line-dasharray': [2, 2] },
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
        paint: { 'text-color': COLORS.countryLabel, 'text-halo-color': COLORS.sea, 'text-halo-width': 1.2 },
      },
      {
        id: 'famous-line-points',
        type: 'circle',
        source: 'famous',
        filter: ['==', ['get', 'kind'], 'label'],
        paint: {
          'circle-radius': 5,
          'circle-color': ['match', ['get', 'status'], 'historical', '#9a9aa5', COLORS.famous],
          'circle-stroke-width': 1.2,
          'circle-stroke-color': COLORS.sea,
        },
      },
      {
        id: 'famous-line-labels',
        type: 'symbol',
        source: 'famous',
        filter: ['==', ['get', 'kind'], 'label'],
        layout: {
          'text-field': ['case', ['==', ['get', 'status'], 'historical'], ['concat', ['get', 'nameBn'], ' †'], ['get', 'nameBn']],
          'text-font': LABEL_FONT,
          'text-size': 12,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-optional': true,
        },
        paint: {
          'text-color': ['match', ['get', 'status'], 'historical', '#c7c7cf', COLORS.famous],
          'text-halo-color': COLORS.sea,
          'text-halo-width': 1.4,
        },
      },
      {
        id: 'strait-name',
        type: 'symbol',
        source: 'strait-marker',
        layout: {
          'text-field': ['get', 'nameBn'],
          'text-font': LABEL_FONT,
          'text-size': 16,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#07121d', 'text-halo-width': 2 },
      },
    ],
  },
  center: initial.center,
  zoom: initial.zoom,
  minZoom: 1,
  maxZoom: 11,
  attributionControl: false,
  dragRotate: true,
  touchZoomRotate: true,
});

// Always-visible credit line (not the collapsible "i" button), kept to one
// line at phone width. Licence details are in the README.
map.addControl(
  new maplibregl.AttributionControl({
    compact: false,
    customAttribution: [
      '<a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>',
      '<a href="../shared/fonts/noto-sans-bengali/OFL.txt" target="_blank" rel="noopener">Noto Sans Bengali</a>',
    ],
  }),
  'bottom-right',
);

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

// Keep the canvas correctly sized on container/orientation changes.
window.addEventListener('resize', () => map.resize());

// Surface map errors instead of failing silently with a blank canvas. If the
// shared tiles can't be read, say so — routes, marker and labels still work.
map.on('error', (event) => {
  console.error('Map error:', event && event.error);
  if (event && (event.sourceId === 'world' || event.sourceId === 'detail')) loadNotice.classList.add('visible');
});

/*
|--------------------------------------------------------------------------
| GEOJSON HELPERS
|--------------------------------------------------------------------------
*/

function createRouteGeoJSON(coordinates) {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }],
  };
}

function createMarkerGeoJSON(strait) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { nameBn: strait.nameBn, nameEn: strait.nameEn },
        geometry: { type: 'Point', coordinates: strait.center },
      },
    ],
  };
}

/*
|--------------------------------------------------------------------------
| STRAIT MARKER
|
| A DOM marker with a CSS pulse. The old version changed a paint property
| on every animation frame, which forced a full map redraw 60 times a
| second — a steady drain on low-end phones. CSS animates on the
| compositor, so the map only redraws when it actually moves.
|--------------------------------------------------------------------------
*/

const markerEl = document.createElement('button');
markerEl.type = 'button';
markerEl.className = 'strait-marker';
markerEl.setAttribute('aria-label', 'Strait details');
markerEl.innerHTML = '<span class="strait-marker-pulse"></span><span class="strait-marker-core"></span>';

const marker = new maplibregl.Marker({ element: markerEl }).setLngLat(initial.center).addTo(map);

markerEl.addEventListener('click', (event) => {
  event.stopPropagation();
  const strait = STRAITS[currentKey];
  if (!strait) return;
  new maplibregl.Popup({ offset: 15, closeButton: true })
    .setLngLat(strait.center)
    .setDOMContent(popupContent(strait.nameBn, strait.nameEn, [{ text: strait.connects }]))
    .addTo(map);
});

function popupContent(titleBn, titleEn, lines) {
  const root = document.createElement('div');
  const title = document.createElement('strong');
  title.lang = 'bn';
  title.textContent = titleBn;
  const en = document.createElement('div');
  en.className = 'popup-en';
  en.textContent = titleEn;
  root.append(title, en);
  lines.forEach(({ text, lang, muted }) => {
    if (!text) return;
    const p = document.createElement('small');
    p.className = muted ? 'popup-line popup-muted' : 'popup-line';
    if (lang) p.lang = lang;
    p.textContent = text;
    root.append(p);
  });
  return root;
}

/*
|--------------------------------------------------------------------------
| SELECT STRAIT
|--------------------------------------------------------------------------
*/

function selectStrait(key) {
  const strait = STRAITS[key];
  if (!strait) return;

  currentKey = key;
  selector.value = key;

  // The student just asked for this passage, so its information reopens.
  updateInfo(key);
  setSheetOpen(true);
  showStrait(strait, true);

  const routeSource = map.getSource('strait-route');
  if (routeSource) routeSource.setData(createRouteGeoJSON(strait.route));

  const markerSource = map.getSource('strait-marker');
  if (markerSource) markerSource.setData(createMarkerGeoJSON(strait));
  marker.setLngLat(strait.center);
}

/**
 * Centres the passage in the part of the map the sheet leaves visible:
 * MapLibre's padding shifts the centre point up by the sheet's height, so a
 * strait the student just picked never sits underneath it.
 */
function showStrait(strait, animate) {
  const camera = {
    center: strait.center,
    zoom: strait.zoom,
    bearing: 0,
    pitch: 0,
    padding: { top: 0, right: 0, left: 0, bottom: sheetHeight() },
  };
  if (animate) map.flyTo({ ...camera, duration: 1800, essential: true });
  else map.jumpTo(camera);
}

/*
|--------------------------------------------------------------------------
| INFO PANEL
|--------------------------------------------------------------------------
*/

function updateInfo(key) {
  const strait = STRAITS[key];

  infoTitle.textContent = strait.nameBn;
  infoEn.textContent = strait.nameEn;
  infoCountries.textContent = strait.countries;
  infoConnects.textContent = strait.connects;
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
|--------------------------------------------------------------------------
*/

const HANDLE_HEIGHT = 26;
const FLICK_SPEED = 0.5; // px per ms
const DRAG_SLOP = 6; // px of movement before a press counts as a drag

let sheetOpen = true;
let sheetOffset = 0;
let drag = null;
let lastDragEnd = -Infinity;

const sheetHeight = () => infoSheet.offsetHeight;
const closedOffset = () => Math.max(0, sheetHeight() - HANDLE_HEIGHT);

function applySheetOffset(offset) {
  sheetOffset = offset;
  infoSheet.style.setProperty('--sheet-offset', `${offset}px`);
  mapShell.style.setProperty('--sheet-visible', `${sheetHeight() - offset}px`);
}

function setSheetOpen(open) {
  sheetOpen = open;
  sheetHandle.setAttribute('aria-expanded', String(open));
  sheetHandle.setAttribute('aria-label', open ? 'Hide details' : 'Show details');
  infoSheetBody.inert = !open;
  applySheetOffset(open ? 0 : closedOffset());
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
  if (event.button !== 0) return;
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
// a hidden sheet tucked away and the credit line sitting right above it.
new ResizeObserver(() => applySheetOffset(sheetOpen ? 0 : closedOffset())).observe(infoSheet);


/*
|--------------------------------------------------------------------------
| FAMOUS LINES — tap a point for its note
|--------------------------------------------------------------------------
*/

map.on('click', 'famous-line-points', (event) => {
  const feature = event.features && event.features[0];
  if (!feature) return;
  const { nameEn, nameBn, note, status } = feature.properties;

  new maplibregl.Popup({ offset: 10, closeButton: true })
    .setLngLat(feature.geometry.coordinates)
    .setDOMContent(
      popupContent(nameBn, nameEn, [
        { text: note, lang: 'bn' },
        { text: status === 'historical' ? '† Historical — no longer in force' : 'Current boundary', muted: true },
      ]),
    )
    .addTo(map);
});

map.on('mouseenter', 'famous-line-points', () => {
  map.getCanvas().style.cursor = 'pointer';
});

map.on('mouseleave', 'famous-line-points', () => {
  map.getCanvas().style.cursor = '';
});

/*
|--------------------------------------------------------------------------
| LAYERS DROPDOWN (toggle borders / famous lines / labels / straits on & off)
|--------------------------------------------------------------------------
*/

const LAYER_GROUPS = {
  borders: ['world-borders', 'detail-borders'],
  straits: ['strait-route-glow', 'strait-route-line', 'strait-name'],
  countryLabels: ['country-labels'],
  famousLines: ['famous-line-points', 'famous-line-labels', 'famous-line-traced'],
};

function setGroupVisibility(groupKey, visible) {
  (LAYER_GROUPS[groupKey] || []).forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  });
  if (groupKey === 'straits') markerEl.hidden = !visible;
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
| INITIAL UI
|--------------------------------------------------------------------------
*/

selector.value = initialKey;
updateInfo(initialKey);
setSheetOpen(true);
showStrait(initial, false);
