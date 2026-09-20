/*
|--------------------------------------------------------------------------
| THE SHELL
|--------------------------------------------------------------------------
|
| One page that renders a map from its descriptor, chosen by ?map=<id>.
|
| THE CONTRACT: a descriptor is DATA, NEVER CODE. Nothing here evaluates a
| string as JavaScript, and nothing here knows any map by name. There is no
| branch on a map id anywhere in this file; if one ever appears, the vocabulary
| was not expressive enough and the fix belongs in the vocabulary.
|
| Everything the shell creates while building a map is recorded in a teardown
| registry and undone by walking it backwards. Nothing is cleaned up by hand.
|--------------------------------------------------------------------------
*/

import * as maplibregl from '../shared/vendor/maplibre-gl-6.9.0/maplibre-gl.mjs';
import { resolver } from '../shared/resolver.js';

/*
|--------------------------------------------------------------------------
| TEARDOWN REGISTRY
|
| Derived, never hand-maintained: every create goes through one of these, so
| the undo list cannot fall behind the code that grew it. Disposal runs in
| reverse, because a layer must go before the source it reads.
|--------------------------------------------------------------------------
*/

const registry = [];
const remember = (kind, name, dispose) => {
  registry.push({ kind, name, dispose });
};

function teardown() {
  for (let i = registry.length - 1; i >= 0; i--) {
    const entry = registry[i];
    try {
      entry.dispose();
    } catch (error) {
      console.error(`teardown failed for ${entry.kind} "${entry.name}"`, error);
    }
  }
  registry.length = 0;
}

/** Wrappers so nothing is ever created without being recorded. */
const own = {
  layer(map, spec, beforeId) {
    map.addLayer(spec, beforeId);
    remember('layer', spec.id, () => map.getLayer(spec.id) && map.removeLayer(spec.id));
  },
  source(map, id, spec) {
    map.addSource(id, spec);
    remember('source', id, () => map.getSource(id) && map.removeSource(id));
  },
  mapHandler(map, type, layerOrHandler, maybeHandler) {
    const layer = maybeHandler ? layerOrHandler : undefined;
    const handler = maybeHandler ?? layerOrHandler;
    if (layer) map.on(type, layer, handler);
    else map.on(type, handler);
    remember('map handler', `${type}${layer ? ` on ${layer}` : ''}`, () =>
      layer ? map.off(type, layer, handler) : map.off(type, handler),
    );
  },
  domHandler(node, type, handler, options) {
    node.addEventListener(type, handler, options);
    remember('dom handler', `${type} on ${node.id || node.nodeName}`, () => node.removeEventListener(type, handler, options));
  },
  observer(observerInstance, target) {
    observerInstance.observe(target);
    remember('observer', target.id || target.nodeName, () => observerInstance.disconnect());
  },
  control(map, control, position) {
    map.addControl(control, position);
    remember('control', control.constructor.name, () => map.removeControl(control));
  },
  marker(markerInstance, name) {
    remember('marker', name, () => markerInstance.remove());
    return markerInstance;
  },
  node(element, name) {
    remember('dom node', name, () => element.remove());
    return element;
  },
};

/*
|--------------------------------------------------------------------------
| DOM
|--------------------------------------------------------------------------
*/

const dom = {
  title: document.getElementById('pageTitle'),
  picker: document.getElementById('recordPicker'),
  prev: document.getElementById('prevRecord'),
  next: document.getElementById('nextRecord'),
  mapShell: document.querySelector('.map-shell'),
  sheet: document.getElementById('infoSheet'),
  sheetBody: document.getElementById('infoSheetBody'),
  sheetHandle: document.getElementById('sheetHandle'),
  kicker: document.getElementById('infoKicker'),
  sheetTitle: document.getElementById('infoTitle'),
  rows: document.getElementById('infoRows'),
  loadNotice: document.getElementById('loadNotice'),
  layersControl: document.getElementById('layersControl'),
  layersToggleBtn: document.getElementById('layersToggleBtn'),
  layersToggleLabel: document.getElementById('layersToggleLabel'),
  layersMenu: document.getElementById('layersMenu'),
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motion = (ms) => (reduceMotion.matches ? 0 : ms);

/*
|--------------------------------------------------------------------------
| THE BASEMAP — shell-owned
|
| The shell adds the basemap, which is why it can tell a basemap failure from
| an overlay one, and why a descriptor never names a basemap layer id. Slots
| are the only way a descriptor positions itself, and the basemap declares
| which ones it offers in its own metadata.
|--------------------------------------------------------------------------
*/

const BASEMAP_COLORS = { sea: '#b9d9ee', land: '#f6f2e7', coast: '#7fa7c4', border: '#a0928a' };
const BASEMAP_SOURCES = { world: 'basemap', detail: 'basemap-detail' };

function basemapStyle(archive) {
  const tiles = (minzoom, maxzoom) => ({
    type: 'vector',
    tiles: [archive.tiles],
    minzoom,
    maxzoom,
    attribution: '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a>',
  });
  const land = (source, withStrokes) => [
    { id: `${source}-land`, type: 'fill', source, 'source-layer': 'land', paint: { 'fill-color': BASEMAP_COLORS.land } },
    { id: `${source}-lakes`, type: 'fill', source, 'source-layer': 'lakes', paint: { 'fill-color': BASEMAP_COLORS.sea } },
    // Detail land is clipped to its box, so an outline would also trace the
    // box edge as a fake coast. Only the world tiles get the strokes.
    ...(withStrokes
      ? [
          { id: `${source}-lake-shore`, type: 'line', source, 'source-layer': 'lakes', paint: { 'line-color': BASEMAP_COLORS.coast, 'line-width': 0.7 } },
          { id: `${source}-coast`, type: 'line', source, 'source-layer': 'land', paint: { 'line-color': BASEMAP_COLORS.coast, 'line-width': 0.9 } },
        ]
      : []),
    {
      id: `${source}-borders`,
      type: 'line',
      source,
      'source-layer': 'borders',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': BASEMAP_COLORS.border, 'line-width': 1, 'line-dasharray': [3, 1.5] },
    },
  ];

  return {
    version: 8,
    // Slots, declared by the basemap itself. A descriptor may name one of
    // these and nothing else; it can never reach a basemap layer id.
    metadata: { slots: ['belowLabels', 'aboveLabels', 'top'] },
    sources: {
      [BASEMAP_SOURCES.world]: tiles(0, 6),
      [BASEMAP_SOURCES.detail]: tiles(7, 10),
    },
    layers: [
      { id: 'basemap-bg', type: 'background', paint: { 'background-color': BASEMAP_COLORS.sea } },
      ...land(BASEMAP_SOURCES.world, true),
      { id: 'basemap-detail-mask', type: 'fill', source: BASEMAP_SOURCES.detail, 'source-layer': 'detail_extent', paint: { 'fill-color': BASEMAP_COLORS.sea } },
      ...land(BASEMAP_SOURCES.detail, false),
    ],
  };
}

/*
|--------------------------------------------------------------------------
| DESCRIPTOR LOADING
|--------------------------------------------------------------------------
*/

const mapId = new URLSearchParams(location.search).get('map');
if (!mapId) throw new Error('no ?map=<id> given');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(mapId)) throw new Error(`"${mapId}" is not a valid map id`);

const mapFile = (name) => resolver.url('maps', `${mapId}/${name}`);
const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
};

const descriptor = await fetchJson(mapFile('descriptor.json'));

/*
 * BASELINE RECORDS — loaded on every map, declared by none.
 *
 * Sea names are wanted on all of them, so they are shared data rather than
 * one map's content. A map that needs to reference them (which seas a strait
 * joins) points a `refs` field at this table exactly as it would at its own.
 */
const BASELINE_TABLES = { seas: 'seas.json' };

/** Tables of authored records, keyed. Names, facts, camera frames. */
const records = {};
for (const [table, file] of Object.entries(BASELINE_TABLES)) {
  records[table] = await fetchJson(resolver.url('sharedData', file));
}
for (const [table, spec] of Object.entries(descriptor.records ?? {})) {
  if (table in BASELINE_TABLES) throw new Error(`descriptor declares records table "${table}", which the shell provides`);
  records[table] = spec.rows ?? (await fetchJson(mapFile(spec.file.replace(/^\.\//, ''))));
}

/** Generated geometry files, carrying join keys only. */
const geometryFiles = {};
for (const [name, spec] of Object.entries(descriptor.sources ?? {})) {
  if (!spec.geometry) continue;
  geometryFiles[name] = await fetchJson(mapFile(spec.geometry.replace(/^\.\//, '')));
}

if (descriptor.title?.bn) dom.title.textContent = descriptor.title.bn;
document.title = descriptor.title?.en ?? descriptor.title?.bn ?? document.title;

/*
|--------------------------------------------------------------------------
| SELECTION AND DERIVED STATE
|
| Selection is held per RECORDS TABLE, not per source, because two sources can
| derive from one table and must agree on what is selected.
|
| State is written into the features themselves and the source is re-derived
| with setData. That is not a workaround for feature-state: MapLibre rejects
| feature-state in filters and in layout properties, and maps vary selection in
| exactly those places, so re-deriving is the only mechanism that works.
|--------------------------------------------------------------------------
*/

const selection = new Map(); // records table -> key, or absent

const stateFields = (sourceSpec) => sourceSpec.state ?? [];

/** Does this state field describe the feature itself, or a relation to one? */
const stateValue = (field, table, key) => {
  if (typeof field === 'string') return selection.get(table) === key;
  const from = field.fromSelection;
  const selectedKey = selection.get(from.records);
  if (selectedKey === undefined) return false;
  const list = records[from.records]?.[selectedKey]?.[from.listField] ?? [];
  return list.includes(key);
};
const stateName = (field) => (typeof field === 'string' ? field : field.name);

/** Which records tables a source's state depends on. */
function dependsOn(sourceSpec) {
  const tables = new Set();
  for (const field of stateFields(sourceSpec)) {
    if (typeof field === 'string') tables.add(sourceSpec.records);
    else tables.add(field.fromSelection.records);
  }
  return tables;
}

/** A source's features, with its declared state written into each one. */
function derive(name, spec) {
  const fields = stateFields(spec);

  // Records joined to a geometry file on a shared key.
  if (spec.records && spec.geometry) {
    const table = records[spec.records];
    return {
      type: 'FeatureCollection',
      features: geometryFiles[name].features.map((feature) => {
        const key = feature.properties[spec.joinField];
        const row = table?.[key] ?? {};
        const properties = { key, ...pick(row, spec.properties) };
        for (const field of fields) properties[stateName(field)] = stateValue(field, spec.records, key);
        return { ...feature, properties };
      }),
    };
  }

  // Geometry taken from a field on each record.
  if (spec.records && spec.geometryFrom) {
    const table = records[spec.records] ?? {};
    return {
      type: 'FeatureCollection',
      // A record whose point is not yet settled has no feature at all. Null
      // coordinates would be a feature at nowhere, which MapLibre rejects and
      // which would be a lie even if it did not.
      features: Object.entries(table).filter(([, row]) => row[spec.geometryFrom] != null).map(([key, row]) => {
        const properties = { key, ...pick(row, spec.properties) };
        for (const field of fields) properties[stateName(field)] = stateValue(field, spec.records, key);
        return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: row[spec.geometryFrom] } };
      }),
    };
  }

  // Geometry alone: no records, no state, nothing to join.
  return geometryFiles[name];
}

function pick(row, keys) {
  const out = {};
  for (const key of keys ?? []) if (row[key] !== undefined && row[key] !== null) out[key] = row[key];
  return out;
}

/*
|--------------------------------------------------------------------------
| THE MAP
|--------------------------------------------------------------------------
*/

const archive = resolver.pmtilesSource('world.pmtiles');
const protocol = new window.pmtiles.Protocol();
protocol.add(new window.pmtiles.PMTiles(archive.archive));
maplibregl.addProtocol('pmtiles', protocol.tile);
remember('protocol', 'pmtiles', () => maplibregl.removeProtocol('pmtiles'));

const style = basemapStyle(archive);
const SLOTS = style.metadata.slots;

const view = descriptor.view ?? {};
const map = new maplibregl.Map({
  container: 'map',
  transformRequest: (url, resourceType) => resolver.transformRequest(url, resourceType),
  style: {
    ...style,
    // Bengali is shaped by the browser from a bundled font; see the resolver.
    'font-faces': { 'Noto Sans Bengali': 'noto-sans-bengali/NotoSansBengali-Regular.woff2' },
  },
  ...(view.fitBounds ? { bounds: [[view.fitBounds[0], view.fitBounds[1]], [view.fitBounds[2], view.fitBounds[3]]] } : {}),
  minZoom: descriptor.constraints?.minZoom ?? 0,
  maxZoom: descriptor.constraints?.maxZoom ?? 22,
  // The tilt button stops at 55; this stops a drag going further. Baseline,
  // not a descriptor field: every map gets the same ceiling.
  maxPitch: 60,
  ...(descriptor.constraints?.maxBounds ? { maxBounds: descriptor.constraints.maxBounds } : {}),
  attributionControl: false,
});
remember('map', 'map', () => map.remove());

const pristine = { layers: style.layers.map((l) => l.id), sources: Object.keys(style.sources) };

await new Promise((resolve) => map.once('load', resolve));

/*
|--------------------------------------------------------------------------
| SOURCES AND LAYERS
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| THE BASELINE — sea and country labels, on every map, declared by none
|
| These used to be descriptor content, which meant a map could omit them by
| forgetting them. They are shell chrome now: the styles, the layer ids and
| the order below are the same on every map and no descriptor can reach them.
|
| The one map-specific part is which labels are EMPHASISED — the seas a strait
| joins, the countries a border line divides. That is not declared either: it
| is DERIVED from the `refs` field a map already declares for its own data, so
| there is nothing extra to write and nothing extra to forget.
|--------------------------------------------------------------------------
*/

const COUNTRY_TABLE = 'countries';

/** The field on some declared table that lists keys of `target`, if any. */
function relationTo(target) {
  for (const [table, spec] of Object.entries(descriptor.records ?? {})) {
    for (const [field, decl] of Object.entries(spec.fields ?? {})) {
      if (decl.type === 'refs' && decl.to === target) return { records: table, listField: field };
    }
  }
  return null;
}

const seaRelation = relationTo('seas');
const countryRelation = records[COUNTRY_TABLE] ? relationTo(COUNTRY_TABLE) : null;
const activeState = (relation) => (relation ? [{ name: 'active', fromSelection: relation }] : []);

const BASELINE_SOURCES = {
  seas: { records: 'seas', geometryFrom: 'at', properties: ['nameBn'], state: activeState(seaRelation) },
  // Only where the map carries country records of its own. Their label points
  // are the map's, not Natural Earth's, so a map that has them puts its names
  // exactly where it computed them.
  ...(records[COUNTRY_TABLE]
    ? { countryLabels: { records: COUNTRY_TABLE, geometryFrom: 'labelAt', properties: ['nameBn'], state: activeState(countryRelation) } }
    : {}),
};

const isBaselineSource = (name) => name in BASELINE_SOURCES;
const sourceSpecs = { ...BASELINE_SOURCES, ...(descriptor.sources ?? {}) };

for (const [name, spec] of Object.entries(sourceSpecs)) {
  const geojson = { type: 'geojson', data: derive(name, spec) };
  if (spec.cluster) {
    geojson.cluster = true;
    geojson.clusterRadius = spec.cluster.radius ?? 25;
    geojson.clusterMaxZoom = spec.cluster.maxZoom ?? 6;
  }
  if (spec.attribution) geojson.attribution = spec.attribution;
  // Baseline sources belong to the page, not to the map, so they stay out of
  // the teardown registry — the registry is for what a MAP creates.
  if (isBaselineSource(name)) map.addSource(name, geojson);
  else own.source(map, name, geojson);
}

/** Re-derive every source whose state depends on a table that just changed. */
function refresh(changedTable) {
  for (const [name, spec] of Object.entries(sourceSpecs)) {
    if (!dependsOn(spec).has(changedTable)) continue;
    map.getSource(name)?.setData(derive(name, spec));
  }
}

/*
 * Baseline label appearance. Shell constants, identical on every map, so two
 * maps cannot drift into naming the same sea at two different sizes.
 */
const BASELINE_STYLES = {
  'country-label': {
    layout: {
      'text-font': ['Noto Sans Bengali'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 13, 10, 16],
      'text-allow-overlap': false,
      'text-optional': true,
    },
    paint: { 'text-color': '#3f4650', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
  },
  'country-label-active': {
    layout: {
      'text-font': ['Noto Sans Bengali'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 2, 13, 6, 16, 10, 19],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#0b3d91', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
  },
  'sea-label': {
    layout: { 'text-font': ['Noto Sans Bengali'], 'text-size': 12, 'text-max-width': 7, 'text-optional': true },
    paint: { 'text-color': '#1f5f99', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
  },
  'sea-label-active': {
    layout: { 'text-font': ['Noto Sans Bengali'], 'text-size': 15, 'text-max-width': 7, 'text-allow-overlap': true },
    paint: { 'text-color': '#0b3d91', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
  },
};

/*
 * Null-safe on purpose. A map with no relation to emphasise has no `active`
 * property on these features at all, and ["!", null] fails the expression's
 * type check — which drops every feature silently, so the labels simply do
 * not appear. Comparing against true works whether the property is there or
 * not, and means the same thing when it is.
 */
const NOT_ACTIVE = ['!=', ['get', 'active'], true];
const IS_ACTIVE = ['==', ['get', 'active'], true];

/**
 * The plain labels, drawn UNDER everything a map adds above the basemap, and
 * the emphasised ones, drawn OVER it. Both halves of the same decision: a
 * name for context stays out of the way, a name the selection points at does
 * not get covered.
 */
function baselineLayers() {
  const named = records[COUNTRY_TABLE] ? Object.keys(records[COUNTRY_TABLE]) : [];
  const plain = [
    {
      id: 'country-labels',
      type: 'symbol',
      source: 'basemap',
      sourceLayer: 'country_labels',
      style: 'country-label',
      filter: [
        'all',
        ['<=', ['get', 'min_zoom'], ['+', ['zoom'], 1]],
        // A country this map names itself is dropped here, or the name draws
        // twice. Joined on the code, never on the name: this file calls China
        // "People's Republic of China".
        ...(named.length ? [['!', ['in', ['get', 'adm0_a3'], ['literal', named]]]] : []),
      ],
      layout: { 'text-field': ['coalesce', ['get', 'name_bn'], ['get', 'name_en']] },
    },
    ...(records[COUNTRY_TABLE]
      ? [{ id: 'country-labels-named', type: 'symbol', source: 'countryLabels', style: 'country-label', filter: NOT_ACTIVE, layout: { 'text-field': ['get', 'nameBn'] } }]
      : []),
    { id: 'sea-labels', type: 'symbol', source: 'seas', style: 'sea-label', filter: ['all', NOT_ACTIVE, ['>=', ['zoom'], 3]], layout: { 'text-field': ['get', 'nameBn'] } },
  ];
  const active = [
    { id: 'sea-labels-active', type: 'symbol', source: 'seas', style: 'sea-label-active', filter: IS_ACTIVE, layout: { 'text-field': ['get', 'nameBn'] } },
    ...(records[COUNTRY_TABLE]
      ? [{ id: 'country-labels-active', type: 'symbol', source: 'countryLabels', style: 'country-label-active', filter: IS_ACTIVE, layout: { 'text-field': ['get', 'nameBn'] } }]
      : []),
  ];
  return { plain, active };
}

const baseline = baselineLayers();
const baselineIds = new Set([...baseline.plain, ...baseline.active].map((l) => l.id));

const styles = { ...BASELINE_STYLES, ...(descriptor.styles ?? {}) };
const resolveSource = (name) => (name === 'basemap' ? BASEMAP_SOURCES.world : name);

// Slot order is the layer order. Within a slot, descriptor order is kept.
const bySlot = new Map(SLOTS.map((slot) => [slot, []]));
for (const layer of descriptor.layers ?? []) {
  if (baselineIds.has(layer.id)) throw new Error(`layer "${layer.id}" is provided by the shell; a descriptor cannot declare it`);
  if (!bySlot.has(layer.slot)) throw new Error(`layer "${layer.id}" wants slot "${layer.slot}", which the basemap does not declare`);
  bySlot.get(layer.slot).push(layer);
}
// The labels bracket whatever the map puts in its top slot.
bySlot.set('aboveLabels', [...baseline.plain, ...bySlot.get('aboveLabels'), ...baseline.active]);

for (const slot of SLOTS) {
  for (const layer of bySlot.get(slot)) {
    const token = styles[layer.style] ?? {};
    const spec = {
      id: layer.id,
      type: layer.type,
      source: resolveSource(layer.source),
      ...(layer.sourceLayer ? { 'source-layer': layer.sourceLayer } : {}),
      ...(layer.filter ? { filter: layer.filter } : {}),
      ...(layer.minzoom !== undefined ? { minzoom: layer.minzoom } : {}),
      ...(layer.maxzoom !== undefined ? { maxzoom: layer.maxzoom } : {}),
      // The token supplies appearance; the descriptor's own layout and paint
      // win, because that is where expressions over properties and state live.
      layout: { ...(token.layout ?? {}), ...(layer.layout ?? {}) },
      paint: { ...(token.paint ?? {}), ...(layer.paint ?? {}) },
    };
    // Baseline labels are the page's, not the map's: unregistered, so a map
    // switch rebuilds around them rather than taking them with it.
    if (baselineIds.has(layer.id)) map.addLayer(spec);
    else own.layer(map, spec);
  }
}

// What the PAGE owns now includes the baseline, so tearing a map down and
// finding the sea labels still there is the correct outcome rather than a
// leak. Without this the leak check would demand the removal of the very
// thing that is supposed to outlive the map.
pristine.layers.push(...baselineIds);
pristine.sources.push(...Object.keys(BASELINE_SOURCES));

/*
|--------------------------------------------------------------------------
| SHELL BEHAVIOUR — derived, declared nowhere
|--------------------------------------------------------------------------
*/

const interactions = descriptor.interactions ?? [];
const targetSource = (target) => (target?.startsWith('source:') ? target.slice('source:'.length) : null);
const interactionSources = new Set(interactions.map((i) => targetSource(i.target)).filter(Boolean));

/*
 * An invisible finger-sized tap target for every source that is an interaction
 * target, derived from the SOURCE and never filtered — so a selected feature
 * stays tappable even when the visible layer filters it out, and so no
 * descriptor has to author an invisible layer.
 */
const hitLayerId = (source) => `${source}--hit`;

/*
 * The tap target has to match the geometry it is standing in for: a circle
 * layer renders nothing for a LineString, so a traced line fronted by a circle
 * would simply not be tappable.  Ask the geometry rather than assuming points.
 */
function geometryKind(name, spec) {
  if (spec.geometryFrom) return 'point';
  const type = geometryFiles[name]?.features?.[0]?.geometry?.type ?? 'Point';
  if (type.includes('Line')) return 'line';
  if (type.includes('Polygon')) return 'fill';
  return 'point';
}

function hitLayerPaint(kind) {
  if (kind === 'line') return { type: 'line', paint: { 'line-width': 22, 'line-color': '#000000', 'line-opacity': 0 } };
  if (kind === 'fill') return { type: 'fill', paint: { 'fill-color': '#000000', 'fill-opacity': 0 } };
  return { type: 'circle', paint: { 'circle-radius': 22, 'circle-color': '#000000', 'circle-opacity': 0 } };
}

/*
 * Where the tap target goes: directly above the source's own topmost drawn
 * layer, not on top of the whole style.  It is invisible either way, but a
 * finger-sized circle sitting above every label would take the first hit in a
 * queryRenderedFeatures result that belongs to a label underneath it.
 */
function hitLayerBefore(source) {
  const ids = map.getStyle().layers.map((l) => l.id);
  const drawn = ids.filter((id) => {
    const layer = map.getLayer(id);
    return layer && layer.source === source && layer.type !== 'symbol';
  });
  if (!drawn.length) return undefined;
  const above = ids.indexOf(drawn[drawn.length - 1]) + 1;
  return ids[above];
}

for (const source of interactionSources) {
  own.layer(
    map,
    { id: hitLayerId(source), source, ...hitLayerPaint(geometryKind(source, sourceSpecs[source])) },
    hitLayerBefore(source),
  );
}

/*
|--------------------------------------------------------------------------
| ACTIONS — select and fitBounds, and nothing else
|--------------------------------------------------------------------------
*/

const marker = markerFor();

/**
 * Whether the pulsing marker belongs on this record.
 *
 * `selectionMarker: true` means every record in the source, which is what a
 * map whose records ARE points wants. `{ when: { field: value } }` narrows it
 * — the same field/value shape expectGeometry uses — for a map that draws
 * most records as lines and marks only the ones it cannot draw.
 *
 * The marker is placed imperatively at one coordinate and touches no layer,
 * so narrowing it costs nothing elsewhere.
 */
function markerApplies(spec, row) {
  const rule = spec.selectionMarker;
  if (rule === true) return true;
  if (!rule || typeof rule !== 'object' || !rule.when) return false;
  return Object.entries(rule.when).every(([field, value]) => row[field] === value);
}

function markerFor() {
  const withMarker = Object.entries(sourceSpecs).find(([, spec]) => spec.selectionMarker);
  if (!withMarker) return null;
  const element = own.node(document.createElement('button'), 'selection marker');
  element.type = 'button';
  element.className = 'selection-marker';
  element.setAttribute('aria-label', 'Show details');
  element.innerHTML = '<span class="selection-marker-pulse"></span><span class="selection-marker-core"></span>';
  own.domHandler(element, 'click', (event) => {
    event.stopPropagation();
    setSheetOpen(true);
  });
  return { instance: own.marker(new maplibregl.Marker({ element }), 'selection'), source: withMarker[0], spec: withMarker[1] };
}

function runActions(actions, context) {
  for (const action of actions ?? []) {
    if (action.action === 'select') doSelect(context);
    else if (action.action === 'fitBounds') doFitBounds(action, context);
    else throw new Error(`unknown action "${action.action}"`);
  }
}

function doSelect({ table, key }) {
  selection.set(table, key);
  refresh(table);
  if (dom.picker.dataset.table === table) dom.picker.value = key;
  syncStepButtons();
  if (marker && marker.spec.records === table) {
    const row = records[table][key];
    const point = row[marker.spec.geometryFrom];
    // Taken off the map for a record it does not apply to, so selecting a
    // traced line after a marked one does not leave a pulse behind.
    if (point && markerApplies(marker.spec, row)) marker.instance.setLngLat(point).addTo(map);
    else marker.instance.remove();
  }
  if (descriptor.sheet) {
    fillSheet(table, key);
    setSheetOpen(true);
  }
}

function doFitBounds(action, { table, key, feature }) {
  const row = table ? records[table]?.[key] : null;
  const box = action.field ? row?.[action.field] : null;
  const padding = paddingFor(action.clear);
  if (box) {
    map.fitBounds([[box[0], box[1]], [box[2], box[3]]], {
      padding,
      // fitBounds defaults bearing to 0 — it straightens the map without
      // being asked. Passing the current bearing keeps a rotated map rotated,
      // so selecting something does not silently undo the compass. Pitch it
      // ignores entirely, which is why there is nothing to pass for it.
      bearing: action.bearing ?? map.getBearing(),
      ...(action.pitch !== undefined ? { pitch: action.pitch } : {}),
      duration: motion(action.duration ?? 1200),
      essential: true,
    });
    return;
  }
  // No named field: fit the selected record's own geometry.  Every feature of
  // it, not the one that was tapped — one record is often drawn as several
  // (a line traced in three pieces frames to a third of itself otherwise),
  // and the picker selects a record without tapping anything at all.
  const parts = table && key !== undefined ? geometryOf(table, key) : [];
  const coordinates = parts.length ? parts : feature?.geometry ? [feature.geometry.coordinates] : [];
  if (!coordinates.length) return;

  const flat = coordinates.flat(Infinity);
  const lngs = flat.filter((_, i) => i % 2 === 0);
  const lats = flat.filter((_, i) => i % 2 === 1);
  if (flat.length === 2) {
    map.easeTo({ center: [lngs[0], lats[0]], padding, duration: motion(action.duration ?? 1200), essential: true });
    return;
  }
  map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
    padding,
    bearing: action.bearing ?? map.getBearing(),
    duration: motion(action.duration ?? 1200),
    essential: true,
  });
}

/**
 * Every drawn coordinate belonging to one record, gathered across the sources
 * that join geometry to it. Label-point sources are left out on purpose: a
 * line's frame is its trace, not the spot its name sits on.
 */
function geometryOf(table, key) {
  const parts = [];
  for (const [name, spec] of Object.entries(sourceSpecs)) {
    if (spec.records !== table || !spec.geometry) continue;
    for (const candidate of derive(name, spec).features) {
      if (candidate.properties.key === key) parts.push(candidate.geometry.coordinates);
    }
  }
  return parts;
}

/*
 * A descriptor says what must stay clear, never a pixel number. The shell owns
 * the sheet, so only the shell can know how tall it currently is — and it
 * varies with how many rows a record hides.
 */
function paddingFor(clear) {
  const base = { top: 16, right: 16, bottom: 16, left: 16 };
  if ((clear ?? []).includes('sheet') && !dom.sheet.hidden) base.bottom = sheetHeight() + 16;
  return base;
}

/*
|--------------------------------------------------------------------------
| INTERACTIONS
|--------------------------------------------------------------------------
*/

for (const interaction of interactions) {
  const source = targetSource(interaction.target);
  if (!source) throw new Error(`interaction target "${interaction.target}" is not a source`);
  const spec = sourceSpecs[source];

  own.mapHandler(map, interaction.on, hitLayerId(source), async (event) => {
    const feature = event.features?.[0];
    if (!feature) return;

    // Cluster tap is the shell's, not the descriptor's: expanding a cluster is
    // what clustering means. The descriptor's interaction applies only to
    // unclustered features.
    if (spec.cluster && feature.properties.cluster) {
      const zoom = await map.getSource(source).getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({ center: feature.geometry.coordinates, zoom, duration: motion(700) });
      return;
    }
    runActions(interaction.do, { table: spec.records, key: feature.properties.key, feature });
  });

  own.mapHandler(map, 'mouseenter', hitLayerId(source), () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  own.mapHandler(map, 'mouseleave', hitLayerId(source), () => {
    map.getCanvas().style.cursor = '';
  });
}

/*
|--------------------------------------------------------------------------
| CONTROLS
|--------------------------------------------------------------------------
*/

const lookups = descriptor.lookups ?? {};
const lookupValue = (name, key, take) => lookups[name]?.[key]?.[take] ?? null;

let order = [];
const picker = (descriptor.controls ?? []).find((c) => c.type === 'picker');
if (picker) buildPicker(picker);

function buildPicker(control) {
  const table = records[control.from] ?? {};
  order = Object.keys(table); // author order, groups ignored
  dom.picker.hidden = false;
  dom.picker.dataset.table = control.from;
  if (control.labelEn) dom.picker.setAttribute('aria-label', control.labelEn);

  if (control.placeholder) {
    const option = document.createElement('option');
    option.value = '';
    option.disabled = true;
    option.selected = true;
    option.textContent = control.placeholder;
    dom.picker.appendChild(option);
  }

  const group = control.groupBy;
  if (group) {
    for (const value of group.order ?? []) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = lookupValue(group.lookup, value, group.take) ?? value;
      optgroup.dataset.value = value;
      dom.picker.appendChild(optgroup);
    }
  }

  // `labelField` names one field; `label` takes the same field/lookup/compose
  // spec the sheet uses, so a map whose names are still being approved can
  // fall back to another field instead of listing blank rows.
  const labelSpec = control.label ?? { field: control.labelField };
  for (const key of order) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = valueOf(labelSpec, table[key]) ?? '';
    const parent = group ? dom.picker.querySelector(`optgroup[data-value="${table[key][group.field]}"]`) : null;
    (parent ?? dom.picker).appendChild(option);
  }

  own.domHandler(dom.picker, 'change', (event) => {
    const key = event.target.value;
    if (key) runActions(control.do, { table: control.from, key });
  });

  // Previous/next: the full list in author order, ignoring the groups, and
  // stopping at the ends. A disabled button is the only position feedback
  // there is, so wrapping silently would just look like a jump.
  dom.prev.hidden = false;
  dom.next.hidden = false;
  const step = (delta) => {
    const current = selection.get(control.from);
    const index = current === undefined ? -1 : order.indexOf(current);
    const next = index + delta;
    if (next < 0 || next >= order.length) return;
    runActions(control.do, { table: control.from, key: order[next] });
  };
  own.domHandler(dom.prev, 'click', () => step(-1));
  own.domHandler(dom.next, 'click', () => step(1));
  syncStepButtons();
}

function syncStepButtons() {
  if (!picker) return;
  const current = selection.get(picker.from);
  const index = current === undefined ? -1 : order.indexOf(current);
  dom.prev.disabled = index <= 0;
  dom.next.disabled = index >= order.length - 1;
}

const toggle = (descriptor.controls ?? []).find((c) => c.type === 'layerToggle');
if (toggle) buildLayerToggle(toggle);

function buildLayerToggle(control) {
  dom.layersControl.hidden = false;
  if (control.labelEn) dom.layersToggleLabel.textContent = control.labelEn;

  for (const group of control.groups ?? []) {
    const label = document.createElement('label');
    label.className = 'layers-menu-item';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = group.on !== false;
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = swatchColour(group.swatch);
    label.append(box, swatch, document.createTextNode(group.labelEn ?? ''));
    dom.layersMenu.appendChild(label);
    own.node(label, `layer toggle ${group.labelEn}`);
    own.domHandler(box, 'change', () => {
      for (const id of group.layers) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', box.checked ? 'visible' : 'none');
      }
    });
  }

  own.domHandler(dom.layersToggleBtn, 'click', (event) => {
    event.stopPropagation();
    const open = dom.layersMenu.classList.toggle('open');
    dom.layersToggleBtn.setAttribute('aria-expanded', String(open));
  });
  own.domHandler(document, 'click', (event) => {
    if (!dom.layersMenu.contains(event.target) && event.target !== dom.layersToggleBtn) {
      dom.layersMenu.classList.remove('open');
      dom.layersToggleBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

/** A swatch names a style token, never a literal colour, so it cannot drift. */
function swatchColour(token) {
  const paint = styles[token]?.paint ?? {};
  for (const key of ['line-color', 'text-color', 'circle-color', 'fill-color']) {
    if (typeof paint[key] === 'string') return paint[key];
  }
  return 'transparent';
}

/*
|--------------------------------------------------------------------------
| THE SHEET
|--------------------------------------------------------------------------
*/

function fillSheet(table, key) {
  const sheet = descriptor.sheet;
  const row = records[table][key];
  dom.sheet.hidden = false;
  dom.kicker.textContent = valueOf(sheet.kicker, row) ?? '';
  dom.sheetTitle.textContent = valueOf(sheet.title, row) ?? '';

  dom.rows.replaceChildren();
  for (const spec of sheet.rows ?? []) {
    const value = valueOf(spec, row);
    // A null value hides the row, uniformly, whichever mechanism produced it.
    if (value === null || value === undefined || value === '') continue;
    const line = document.createElement('div');
    line.className = 'info-row';
    const label = document.createElement('span');
    label.className = 'info-label';
    label.lang = 'bn';
    label.textContent = spec.label;
    const text = document.createElement('span');
    text.className = 'info-value';
    text.lang = 'bn';
    text.textContent = value;
    line.append(label, text);
    dom.rows.appendChild(line);
  }
}

/** field | lookup | compose — the three mechanisms, and nothing else. */
function valueOf(spec, row) {
  if (spec === undefined || spec === null) return null;
  if (typeof spec === 'string') return fill(spec, row);
  if (spec.field !== undefined) return row[spec.field] ?? null;
  if (spec.lookup !== undefined) {
    const key = row[spec.of];
    return key === null || key === undefined ? null : lookupValue(spec.lookup, key, spec.take);
  }
  if (spec.compose !== undefined) {
    // Ordered templates: the first whose fields are all present wins.
    for (const template of spec.compose) {
      const needed = [...template.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]);
      if (needed.every((name) => row[name] !== undefined && row[name] !== null)) return fill(template, row);
    }
    return null;
  }
  return null;
}

// A declaration, not a const: valueOf is reached while the picker is being
// built, which happens before this point in module evaluation.
function fill(template, row) {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, name) => row[name] ?? '');
}

/*
 * Sheet behaviour is the shell's throughout: a descriptor never says a pixel.
 */
const HANDLE_HEIGHT = 26;
const FLICK_SPEED = 0.5;
const DRAG_SLOP = 6;
let sheetOpen = false;
let sheetOffset = 0;
let drag = null;
let lastDragEnd = -Infinity;

const sheetHeight = () => dom.sheet.offsetHeight;
const closedOffset = () => (selection.size ? Math.max(0, sheetHeight() - HANDLE_HEIGHT) : sheetHeight());
const applySheetOffset = (offset) => {
  sheetOffset = offset;
  dom.sheet.style.setProperty('--sheet-offset', `${offset}px`);
};

function setSheetOpen(open) {
  sheetOpen = open && selection.size > 0;
  dom.sheet.inert = selection.size === 0;
  dom.sheetHandle.setAttribute('aria-expanded', String(sheetOpen));
  dom.sheetHandle.setAttribute('aria-label', sheetOpen ? 'Hide details' : 'Show details');
  dom.sheetBody.inert = !sheetOpen;
  applySheetOffset(sheetOpen ? 0 : closedOffset());
}

if (descriptor.sheet) {
  own.domHandler(dom.sheetHandle, 'click', (event) => {
    if (event.timeStamp - lastDragEnd < 400) return;
    setSheetOpen(!sheetOpen);
  });

  const onDragMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dy) < DRAG_SLOP) return;
      drag.moved = true;
      dom.sheet.classList.add('dragging');
      dom.mapShell.classList.add('sheet-dragging');
    }
    const dt = event.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (event.clientY - drag.lastY) / dt;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    applySheetOffset(Math.min(Math.max(drag.startOffset + dy, 0), closedOffset()));
  };

  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { moved, velocity, startOffset } = drag;
    drag = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    if (!moved) return;
    lastDragEnd = event.timeStamp;
    dom.sheet.classList.remove('dragging');
    dom.mapShell.classList.remove('sheet-dragging');
    const third = closedOffset() / 3;
    let open;
    if (velocity > FLICK_SPEED) open = false;
    else if (velocity < -FLICK_SPEED) open = true;
    else open = startOffset === 0 ? sheetOffset < third : sheetOffset < closedOffset() - third;
    setSheetOpen(open);
  };

  own.domHandler(dom.sheet, 'pointerdown', (event) => {
    if (event.button !== 0 || selection.size === 0) return;
    drag = { id: event.pointerId, startY: event.clientY, startOffset: sheetOffset, lastY: event.clientY, lastT: event.timeStamp, velocity: 0, moved: false };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  });
  // The built map leaks this observer. Here it is owned like everything else.
  own.observer(new ResizeObserver(() => applySheetOffset(sheetOpen ? 0 : closedOffset())), dom.sheet);
}

/*
|--------------------------------------------------------------------------
| ATTRIBUTION, ERRORS, COMPASS, TILT
|
| SHELL CHROME, created once. None of it is registered for teardown and no
| descriptor can ask for it or opt out: the registry is for what a MAP
| creates, and these belong to the page. A control in the registry would
| disappear on the first map switch.
|--------------------------------------------------------------------------
*/

const TILT_PITCH = 55;

/**
 * A visible, tappable tilt toggle. Deliberately a button rather than a drag
 * on the compass or visualizePitch: a gesture nobody discovers is a feature
 * nobody has. The label says what a tap will DO, not what the map is now.
 */
class TiltControl {
  onAdd(controlMap) {
    this._map = controlMap;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    this._button = document.createElement('button');
    this._button.type = 'button';
    this._button.className = 'ctrl-btn ctrl-tilt';
    this._onClick = () => {
      const flat = controlMap.getPitch() < 1;
      controlMap.easeTo({ pitch: flat ? TILT_PITCH : 0, duration: motion(500) });
    };
    this._button.addEventListener('click', this._onClick);

    // Driven by the map's pitch rather than by the click, so a drag that
    // changes the pitch updates the label too.
    this._sync = () => {
      const flat = controlMap.getPitch() < 1;
      this._button.textContent = flat ? 'Tilt' : 'Flat';
      this._button.setAttribute('aria-label', flat ? 'Tilt the map' : 'Return the map to flat');
      this._button.title = this._button.getAttribute('aria-label');
      this._button.setAttribute('aria-pressed', String(!flat));
    };
    controlMap.on('pitch', this._sync);
    this._sync();

    this._container.appendChild(this._button);
    return this._container;
  }

  onRemove() {
    this._map.off('pitch', this._sync);
    this._button.removeEventListener('click', this._onClick);
    this._container.remove();
  }
}

map.addControl(new maplibregl.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: false }), 'top-right');
map.addControl(new TiltControl(), 'top-right');
map.addControl(
  new maplibregl.AttributionControl({
    compact: true,
    customAttribution: [
      '<a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre</a>',
      `<a href="${resolver.url('glyphs', 'noto-sans-bengali/OFL.txt')}" target="_blank" rel="noopener noreferrer">Noto Sans Bengali</a>`,
      ...(descriptor.attribution?.extra ?? []),
    ],
  }),
  'top-right',
);
// The compact control opens expanded; it starts collapsed here.
document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');

// The shell adds the basemap, so it is the only thing that can tell a basemap
// failure from an overlay one. The copy is generic Bengali; a descriptor never
// writes it.
const basemapSourceIds = new Set(Object.values(BASEMAP_SOURCES));
own.mapHandler(map, 'error', (event) => {
  console.error('Map error:', event?.error);
  if (event && basemapSourceIds.has(event.sourceId)) dom.loadNotice.classList.add('visible');
});

own.domHandler(window, 'resize', () => map.resize());

if (descriptor.sheet) setSheetOpen(false);

/*
|--------------------------------------------------------------------------
| LEAK ASSERTION
|
| Teardown is derived, so the way to know it is complete is to tear down and
| compare against the pristine basemap. Exposed rather than run on load: the
| shell only builds one map today, and tearing it down would leave a blank
| page. switchMap will call this between maps.
|--------------------------------------------------------------------------
*/

function assertNoLeaks() {
  const problems = [];

  // teardown() ends by removing the map, which destroys the style.  Ask the
  // map rather than assuming: on a live map the style comparison is the whole
  // point, and after a full teardown there is no style left to read — reading
  // it anyway threw a TypeError and hid the real verdict.
  const style = map.getStyle?.();
  const mapAlive = Boolean(style && style.layers);

  let layers = [];
  let sources = [];
  if (mapAlive) {
    layers = style.layers.map((l) => l.id);
    sources = Object.keys(style.sources);

    const extraLayers = layers.filter((id) => !pristine.layers.includes(id));
    const extraSources = sources.filter((id) => !pristine.sources.includes(id));
    if (extraLayers.length) problems.push(`layers left behind: ${extraLayers.join(', ')}`);
    if (extraSources.length) problems.push(`sources left behind: ${extraSources.join(', ')}`);
    if (layers.length !== pristine.layers.length) problems.push(`layer count ${layers.length}, pristine ${pristine.layers.length}`);
  } else if (document.querySelector('#map canvas')) {
    // No style, yet MapLibre's canvas is still on the page: the map went away
    // without taking its own DOM with it.
    problems.push('the map canvas is still in the DOM after the map was removed');
  }

  if (registry.length) problems.push(`registry not empty: ${registry.length} entries`);
  if (document.querySelector('.maplibregl-marker')) problems.push('a marker is still in the DOM');
  if (document.querySelector('.maplibregl-popup')) problems.push('a popup is still in the DOM');
  if (document.querySelector('.selection-marker')) problems.push('the selection marker is still in the DOM');
  if (document.querySelector('.maplibregl-ctrl')) problems.push('a map control is still in the DOM');

  if (problems.length) throw new Error(`teardown left something behind:\n  ${problems.join('\n  ')}`);
  return mapAlive
    ? { map: 'live', layers: layers.length, sources: sources.length }
    : { map: 'removed', registry: registry.length };
}

// The only surface the shell exposes, for the harness and for switchMap later.
window.__shell = { map, teardown, assertNoLeaks, registrySize: () => registry.length, descriptor };
