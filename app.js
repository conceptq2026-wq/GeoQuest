import { STRAITS, INITIAL_STRAIT_KEY, FAMOUS_LINES } from './data.js';
import * as maplibregl from './vendor/maplibre-gl.mjs';

/*
|--------------------------------------------------------------------------
| DOM
|--------------------------------------------------------------------------
*/

const selector = document.getElementById('straitSelector');
const buttonContainer = document.getElementById('straitButtons');
const infoTitle = document.getElementById('infoTitle');
const infoBn = document.getElementById('infoBn');
const infoCountries = document.getElementById('infoCountries');
const infoConnects = document.getElementById('infoConnects');
const infoBoundary = document.getElementById('infoBoundary');
const setupNotice = document.getElementById('setupNotice');
const layersToggleBtn = document.getElementById('layersToggleBtn');
const layersMenu = document.getElementById('layersMenu');
const layerCheckboxes = document.querySelectorAll('#layersMenu input[type="checkbox"]');

/*
|--------------------------------------------------------------------------
| BUILD CONTROLS
|--------------------------------------------------------------------------
*/

Object.entries(STRAITS).forEach(([key, strait]) => {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = `${strait.nameBn} — ${strait.nameEn}`;
  selector.appendChild(option);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'strait-button';
  button.dataset.strait = key;
  button.textContent = strait.nameEn;
  button.setAttribute('lang', 'en');
  button.addEventListener('click', () => selectStrait(key));
  buttonContainer.appendChild(button);
});

/*
|--------------------------------------------------------------------------
| MAP — fully local. No CDN, no remote style.json, no tile server.
|
| The style below has zero "sources" pointing anywhere online — it is
| just a background colour. Real coastlines and real political border
| lines are loaded straight after from ./data/*.geojson on this same
| origin (see loadLocalGeography). If those files are missing, the
| shipping-route + marker still work and a setup notice explains what
| to add — the previous version went fully blank with no explanation
| when the network wasn't available, which is the bug this replaces.
|--------------------------------------------------------------------------
*/

const initialKey = INITIAL_STRAIT_KEY;
const initial = STRAITS[initialKey];

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'bg',
        type: 'background',
        // Carto "Dark Matter" style palette — near-black base.
        paint: { 'background-color': '#0a0a0c' },
      },
    ],
  },
  center: initial.center,
  zoom: initial.zoom,
  pitch: 0,
  bearing: 0,
  // No default attribution control (removes the bottom-left MapLibre
  // link/logo). MapLibre GL JS is BSD-licensed — no branding requirement.
  attributionControl: false,
  dragRotate: true,
  touchZoomRotate: true,
});

// Compact, self-written credit line for the data sources actually used
// (good practice for Natural Earth's CC0 terms) — no MapLibre branding.
map.addControl(
  new maplibregl.AttributionControl({
    compact: true,
    customAttribution: 'Map data © Natural Earth (CC0)',
  }),
  'bottom-right',
);

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

// Fix: keep the canvas correctly sized on container/orientation changes.
window.addEventListener('resize', () => map.resize());

// Fix: surface map errors instead of failing silently with a blank canvas.
map.on('error', (event) => {
  console.error('Map error:', event && event.error);
});

/*
|--------------------------------------------------------------------------
| GEOJSON HELPERS
|--------------------------------------------------------------------------
*/

function createRouteGeoJSON(coordinates) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      },
    ],
  };
}

function createMarkerGeoJSON(center, strait) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: strait.nameEn },
        geometry: { type: 'Point', coordinates: center },
      },
    ],
  };
}

function createFamousLinesGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: FAMOUS_LINES.map((line) => {
      const anchor = famousLineAnchors[line.nameEn] || line.coords;
      return {
        type: 'Feature',
        properties: {
          nameEn: line.nameEn,
          nameBn: line.nameBn,
          status: line.status,
          note: line.note,
          label: line.status === 'historical' ? `${line.nameEn} †` : line.nameEn,
        },
        geometry: { type: 'Point', coordinates: anchor },
      };
    }),
  };
}

/*
|--------------------------------------------------------------------------
| BBOX LINE CLIPPING
|
| Cuts the real border/disputed LineStrings down to just the portion
| inside a famous line's region — no new coordinates are invented, this
| only keeps points that are already part of the real Natural Earth
| geometry. Splits into separate runs wherever the line exits the box,
| so we don't draw a straight jump across a gap.
|--------------------------------------------------------------------------
*/

function clipLineStringsToBBox(geojson, bbox) {
  if (!geojson || !Array.isArray(geojson.features)) return [];
  const [minX, minY, maxX, maxY] = bbox;
  const inside = ([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  const segments = [];

  const processLine = (coords) => {
    let current = [];
    coords.forEach((pt) => {
      if (inside(pt)) {
        current.push(pt);
      } else if (current.length > 1) {
        segments.push(current);
        current = [];
      } else {
        current = [];
      }
    });
    if (current.length > 1) segments.push(current);
  };

  geojson.features.forEach((feature) => {
    const geom = feature.geometry;
    if (!geom) return;
    if (geom.type === 'LineString') processLine(geom.coordinates);
    else if (geom.type === 'MultiLineString') geom.coordinates.forEach(processLine);
  });

  return segments;
}

// Filled in inside loadLocalGeography() once the real border data is in —
// maps a famous line's nameEn to the midpoint of its longest traced
// real-geometry segment, so the label sits ON the actual line.
const famousLineAnchors = {};

/*
|--------------------------------------------------------------------------
| ONE LABEL PER COUNTRY
|
| Natural Earth's admin-0 countries file has a separate polygon feature
| per landmass/enclave/island group (so Bangladesh, France, etc. can be
| several features) — labelling every feature prints the name several
| times. This keeps only the single largest-by-bounding-box feature per
| country name and returns a Point at that feature's bbox centre.
|--------------------------------------------------------------------------
*/

function dedupeCountryLabels(countriesGeoJSON) {
  const nameOf = (props) => props.NAME || props.name || props.NAME_EN || props.ADMIN || props.GEOUNIT;

  const bboxOf = (geometry) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (coords) => {
      if (typeof coords[0] === 'number') {
        const [x, y] = coords;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        coords.forEach(walk);
      }
    };
    walk(geometry.coordinates);
    return [minX, minY, maxX, maxY];
  };

  const bestByName = new Map();
  (countriesGeoJSON.features || []).forEach((feature) => {
    if (!feature.geometry) return;
    const name = nameOf(feature.properties || {});
    if (!name) return;
    const bbox = bboxOf(feature.geometry);
    const area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
    const existing = bestByName.get(name);
    if (!existing || area > existing.area) {
      bestByName.set(name, { area, bbox });
    }
  });

  const features = [];
  bestByName.forEach(({ bbox }, name) => {
    features.push({
      type: 'Feature',
      properties: { name },
      geometry: { type: 'Point', coordinates: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] },
    });
  });

  return { type: 'FeatureCollection', features };
}

/*
|--------------------------------------------------------------------------
| LOCAL GEOGRAPHY (real coastlines + real political border lines)
|
| Put these four files, downloaded once on a machine with internet
| access, into ./data/ — see SETUP.md for exact sources/commands:
|   - land.geojson      Natural Earth 1:50m "Land" polygons
|   - borders.geojson   Natural Earth 1:50m "Admin 0 – Boundary Lines"
|   - disputed.geojson  Natural Earth 1:50m "Admin 0 – Boundary Lines,
|                        Disputed Areas" (Kashmir/LoC, Western Sahara,
|                        the Elemi Triangle, etc. — the "famous" lines)
|   - countries.geojson Natural Earth 1:50m "Admin 0 – Countries"
|                        (used only for country name labels — see the
|                        de-duplication below for why a country like
|                        Bangladesh, which is one polygon feature per
|                        landmass/island in this file, doesn't print
|                        its name multiple times)
|
| All four are public-domain, survey-based Natural Earth datasets, so
| the coastlines and borders drawn here are the real thing — not
| hand-drawn guesses — and once the files sit next to this HTML, the
| whole page runs with zero network requests.
|--------------------------------------------------------------------------
*/

async function loadLocalGeography() {
  const fetchJSON = (path) =>
    fetch(path).then((response) => {
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response.json();
    });

  const [landResult, borderResult, disputedResult, countriesResult] = await Promise.allSettled([
    fetchJSON('./data/land.geojson'),
    fetchJSON('./data/borders.geojson'),
    fetchJSON('./data/disputed.geojson'),
    fetchJSON('./data/countries.geojson'),
  ]);

  if (landResult.status === 'fulfilled') {
    map.addSource('land', { type: 'geojson', data: landResult.value });
    map.addLayer({
      id: 'land-fill',
      type: 'fill',
      source: 'land',
      // Carto Dark Matter palette — subtle, low-contrast land fill.
      paint: { 'fill-color': '#1c1c1f', 'fill-opacity': 1 },
    });
    map.addLayer({
      id: 'land-outline',
      type: 'line',
      source: 'land',
      paint: { 'line-color': '#33333a', 'line-width': 0.6 },
    });
  } else {
    console.warn('Local land data not found:', landResult.reason);
  }

  if (borderResult.status === 'fulfilled') {
    map.addSource('borders', { type: 'geojson', data: borderResult.value });
    map.addLayer({
      id: 'border-lines',
      type: 'line',
      source: 'borders',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        // Muted grey — Carto-style borders, not a shouty accent colour.
        'line-color': '#6d6d78',
        'line-width': 0.8,
        'line-opacity': 0.85,
      },
    });
  } else {
    console.warn('Local border data not found:', borderResult.reason);
  }

  if (disputedResult.status === 'fulfilled') {
    map.addSource('disputed-borders', { type: 'geojson', data: disputedResult.value });
    map.addLayer({
      id: 'disputed-border-lines',
      type: 'line',
      source: 'disputed-borders',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        // Distinct accent — these are the "famous" contested lines
        // (Kashmir LoC, Western Sahara, the Elemi Triangle, etc.).
        'line-color': '#e34ec9',
        'line-width': 1.6,
        'line-dasharray': [2.5, 1.5],
      },
    });
  } else {
    console.warn('Local disputed-borders data not found:', disputedResult.reason);
  }

  // Trace each famous line's REAL geometry: clip the actual border/
  // disputed LineStrings down to that line's region. No coordinates are
  // invented here — only real points already in borders.geojson /
  // disputed.geojson survive the clip. Lines with region: null (the
  // historical ones with no matching current boundary) are skipped —
  // they stay as a labelled point only, see data.js for why.
  const tracedFeatures = [];
  FAMOUS_LINES.forEach((line) => {
    if (!line.region) return;
    const segments = [
      ...(borderResult.status === 'fulfilled' ? clipLineStringsToBBox(borderResult.value, line.region) : []),
      ...(disputedResult.status === 'fulfilled' ? clipLineStringsToBBox(disputedResult.value, line.region) : []),
    ];
    if (!segments.length) return;

    segments.forEach((coords) => {
      tracedFeatures.push({
        type: 'Feature',
        properties: { nameEn: line.nameEn, nameBn: line.nameBn, status: line.status },
        geometry: { type: 'LineString', coordinates: coords },
      });
    });

    // Anchor the label at the midpoint of the longest matched segment.
    const longest = segments.reduce((a, b) => (b.length > a.length ? b : a));
    famousLineAnchors[line.nameEn] = longest[Math.floor(longest.length / 2)];
  });

  if (tracedFeatures.length) {
    map.addSource('famous-line-traced', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: tracedFeatures },
    });
    map.addLayer({
      id: 'famous-line-traced',
      type: 'line',
      source: 'famous-line-traced',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        // Bright highlight tracing the exact real border/disputed
        // geometry for the segment that carries a famous name.
        'line-color': '#5ad1ff',
        'line-width': 2.6,
        'line-opacity': 0.95,
      },
    });
  }

  if (countriesResult.status === 'fulfilled') {
    map.addSource('countries', { type: 'geojson', data: dedupeCountryLabels(countriesResult.value) });
    map.addLayer({
      id: 'country-labels',
      type: 'symbol',
      source: 'countries',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 9, 6, 12, 10, 15],
        'text-allow-overlap': false,
        'text-optional': true,
      },
      paint: {
        'text-color': '#9a9aa5',
        'text-halo-color': '#0a0a0c',
        'text-halo-width': 1.2,
      },
    });
  } else {
    console.warn('Local countries data not found:', countriesResult.reason);
  }

  const missing = [landResult, borderResult, disputedResult, countriesResult].some(
    (r) => r.status === 'rejected',
  );
  setupNotice.classList.toggle('visible', missing);
}

/*
|--------------------------------------------------------------------------
| MAP LOAD
|--------------------------------------------------------------------------
*/

map.on('load', async () => {
  // Loaded first so land + both border layers sit below the route/marker
  // layers added further down — plain draw order does the rest.
  await loadLocalGeography();

  map.addSource('strait-route', { type: 'geojson', data: createRouteGeoJSON(initial.route) });

  map.addLayer({
    id: 'strait-route-glow',
    type: 'line',
    source: 'strait-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#f8c84a', 'line-width': 11, 'line-opacity': 0.18 },
  });

  map.addLayer({
    id: 'strait-route-line',
    type: 'line',
    source: 'strait-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffd65a',
      'line-width': 3.5,
      'line-opacity': 0.95,
      'line-dasharray': [2, 2],
    },
  });

  map.addSource('strait-marker', { type: 'geojson', data: createMarkerGeoJSON(initial.center, initial) });

  map.addLayer({
    id: 'strait-marker-pulse',
    type: 'circle',
    source: 'strait-marker',
    paint: {
      'circle-radius': 20,
      'circle-color': '#ff534d',
      'circle-opacity': 0.18,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ff7a74',
      'circle-stroke-opacity': 0.6,
    },
  });

  map.addLayer({
    id: 'strait-marker-core',
    type: 'circle',
    source: 'strait-marker',
    paint: {
      'circle-radius': 8,
      'circle-color': '#ff534d',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  map.addLayer({
    id: 'strait-name',
    type: 'symbol',
    source: 'strait-marker',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 14,
      'text-offset': [0, 1.8],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#07121d',
      'text-halo-width': 2,
    },
  });

  // Famous named border/demarcation lines — label points only (real line
  // geometry is the disputed/borders layers above). † marks lines that
  // no longer function as a live border (see data.js for sourcing notes).
  map.addSource('famous-lines', { type: 'geojson', data: createFamousLinesGeoJSON() });

  map.addLayer({
    id: 'famous-line-points',
    type: 'circle',
    source: 'famous-lines',
    paint: {
      'circle-radius': 4,
      'circle-color': [
        'match',
        ['get', 'status'],
        'historical',
        '#9a9aa5',
        '#5ad1ff',
      ],
      'circle-stroke-width': 1.2,
      'circle-stroke-color': '#0a0a0c',
    },
  });

  map.addLayer({
    id: 'famous-line-labels',
    type: 'symbol',
    source: 'famous-lines',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-allow-overlap': false,
      'text-optional': true,
    },
    paint: {
      'text-color': [
        'match',
        ['get', 'status'],
        'historical',
        '#c7c7cf',
        '#5ad1ff',
      ],
      'text-halo-color': '#0a0a0c',
      'text-halo-width': 1.4,
    },
  });

  updateInfo(initialKey);
  animatePulse();
});

/*
|--------------------------------------------------------------------------
| SELECT STRAIT
|--------------------------------------------------------------------------
*/

function selectStrait(key) {
  const strait = STRAITS[key];
  if (!strait) return;

  selector.value = key;

  map.flyTo({
    center: strait.center,
    zoom: strait.zoom,
    bearing: 0,
    pitch: 0,
    duration: 1800,
    essential: true,
  });

  const routeSource = map.getSource('strait-route');
  if (routeSource) routeSource.setData(createRouteGeoJSON(strait.route));

  const markerSource = map.getSource('strait-marker');
  if (markerSource) markerSource.setData(createMarkerGeoJSON(strait.center, strait));

  updateInfo(key);
}

/*
|--------------------------------------------------------------------------
| INFO PANEL
|--------------------------------------------------------------------------
*/

function updateInfo(key) {
  const strait = STRAITS[key];

  infoTitle.textContent = strait.nameEn;
  infoBn.textContent = strait.nameBn;
  infoCountries.textContent = strait.countries;
  infoConnects.textContent = strait.connects;
  if (infoBoundary) infoBoundary.textContent = strait.boundaryNote || '—';

  document.querySelectorAll('.strait-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.strait === key);
  });
}

/*
|--------------------------------------------------------------------------
| SELECT DROPDOWN
|--------------------------------------------------------------------------
*/

selector.addEventListener('change', (event) => {
  selectStrait(event.target.value);
});

/*
|--------------------------------------------------------------------------
| PULSING STRAIT MARKER
|--------------------------------------------------------------------------
*/

let pulseTime = 0;
let pulseFrame = null;

function animatePulse() {
  // Fix: stop the rAF loop cleanly if the layer is ever removed instead
  // of leaving a dangling requestAnimationFrame call with no layer.
  if (!map.getLayer('strait-marker-pulse')) {
    if (pulseFrame) cancelAnimationFrame(pulseFrame);
    return;
  }

  pulseTime += 0.045;
  const pulse = (Math.sin(pulseTime) + 1) / 2;

  map.setPaintProperty('strait-marker-pulse', 'circle-radius', 15 + pulse * 14);
  map.setPaintProperty('strait-marker-pulse', 'circle-opacity', 0.28 - pulse * 0.18);

  pulseFrame = requestAnimationFrame(animatePulse);
}

/*
|--------------------------------------------------------------------------
| CLICK MARKER
|--------------------------------------------------------------------------
*/

map.on('click', 'strait-marker-core', (event) => {
  // Fix: read the strait from the clicked feature's own properties
  // instead of assuming it always matches the dropdown's current value.
  const feature = event.features && event.features[0];
  const name = feature ? feature.properties.name : selector.options[selector.selectedIndex].textContent;
  const key = selector.value;
  const strait = STRAITS[key] || Object.values(STRAITS).find((s) => s.nameEn === name);
  if (!strait) return;

  new maplibregl.Popup({ offset: 15, closeButton: true })
    .setLngLat(event.lngLat)
    .setHTML(
      `<strong>${strait.nameEn}</strong><br>${strait.nameBn}<br><br><small>${strait.connects}</small>`,
    )
    .addTo(map);
});

map.on('mouseenter', 'strait-marker-core', () => {
  map.getCanvas().style.cursor = 'pointer';
});

map.on('mouseleave', 'strait-marker-core', () => {
  map.getCanvas().style.cursor = '';
});

map.on('click', 'famous-line-points', (event) => {
  const feature = event.features && event.features[0];
  if (!feature) return;
  const { nameEn, nameBn, note, status } = feature.properties;

  new maplibregl.Popup({ offset: 10, closeButton: true })
    .setLngLat(event.lngLat)
    .setHTML(
      `<strong>${nameEn}</strong><br>${nameBn}` +
        `<br><br><small>${note}</small>` +
        `<br><small style="opacity:.65">${status === 'historical' ? '† বর্তমানে সক্রিয় নয়' : 'বর্তমান সীমান্ত'}</small>`,
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
| LAYERS DROPDOWN (toggle borders / disputed lines / straits on & off)
|--------------------------------------------------------------------------
*/

const LAYER_GROUPS = {
  borders: ['border-lines'],
  disputed: ['disputed-border-lines'],
  straits: ['strait-route-glow', 'strait-route-line', 'strait-marker-pulse', 'strait-marker-core', 'strait-name'],
  countryLabels: ['country-labels'],
  famousLines: ['famous-line-points', 'famous-line-labels', 'famous-line-traced'],
};

function setGroupVisibility(groupKey, visible) {
  (LAYER_GROUPS[groupKey] || []).forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
  });
}

layerCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener('change', () => {
    setGroupVisibility(checkbox.dataset.layerGroup, checkbox.checked);
  });
});

layersToggleBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  layersMenu.classList.toggle('open');
});

document.addEventListener('click', (event) => {
  if (!layersMenu.contains(event.target) && event.target !== layersToggleBtn) {
    layersMenu.classList.remove('open');
  }
});

/*
|--------------------------------------------------------------------------
| INITIAL UI
|--------------------------------------------------------------------------
*/

selector.value = initialKey;
updateInfo(initialKey);
