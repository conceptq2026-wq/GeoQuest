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

import * as maplibregl from '../shared/vendor/maplibre-gl-6.9.0/maplibre-gl.mjs?v=4d425c1dee';
import { resolver } from '../shared/resolver.js?v=4d425c1dee';
import { pickerRow } from '../shared/picker.js?v=4d425c1dee';

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
  image(map, id, image, options) {
    map.addImage(id, image, options);
    remember('image', id, () => map.hasImage(id) && map.removeImage(id));
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
  /** A change a map makes to the page it did not create — a class, an inline style — undone at teardown. */
  undo(name, fn) {
    remember('change', name, fn);
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
  sheetSubtitle: document.getElementById('infoSubtitle'),
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
|
| A descriptor chooses its basemap by name in its `basemap` field. Every
| archive is tiled the same way — overview tiles to z6 everywhere, detail
| tiles z7–10 only inside its detail areas, drawn over a mask — so both keep
| the same two source ids, and `basemap` in a descriptor means the overview
| source whichever archive it is.
|--------------------------------------------------------------------------
*/

const BASEMAP_COLORS = { sea: '#b9d9ee', land: '#f6f2e7', coast: '#7fa7c4', border: '#a0928a', plain: '#e3e3e0', admin: '#a89a8e', river: '#8fbde0' };
const BASEMAP_SOURCES = { world: 'basemap', detail: 'basemap-detail' };
const LABEL_FONT = ['Noto Sans Bengali'];

/*
 * name → archive and style. `bounded` basemaps cover one region only: the
 * archive's own metadata carries its frame and its bounds, and a map on it
 * opens at that frame and cannot pan past those bounds. They are read from
 * the archive, not declared here, so a rebuilt box needs no shell edit.
 */
const BASEMAPS = {
  world: { archive: 'world.pmtiles', style: worldStyle, bounded: false },
  // The same archive, drawn as the environment-treaties mockup draws it: paler
  // water and land, thin solid borders, and no coastline stroke.
  'world-light': { archive: 'world.pmtiles', style: (archive) => worldStyle(archive, WORLD_LIGHT), bounded: false },
  bangladesh: { archive: 'bangladesh.pmtiles', style: regionStyle, bounded: true },
  // Bangladesh's archive over the world's, for a map that also draws what lies
  // beyond Bangladesh's box (the rivers' whole courses): see wideStyle.
  'bangladesh-wide': { archive: 'bangladesh.pmtiles', also: 'world.pmtiles', style: wideStyle, bounded: true },
};
const WORLD_LIGHT = { colors: { sea: '#bae3fd', land: '#f7f4e5', coast: '#bae3fd', border: '#cdd5d9' }, strokes: false, border: { 'line-width': 0.7 } };

const credit = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

// `look`, the palette, is a variant's own; the shell passes every style its
// region second, which for the world is null, so null means the usual look.
function worldStyle(archive, look) {
  const colors = look?.colors ?? BASEMAP_COLORS;
  const strokes = look?.strokes ?? true;
  const border = look?.border ?? { 'line-width': 1, 'line-dasharray': [3, 1.5] };
  const tiles = (minzoom, maxzoom) => ({
    type: 'vector',
    tiles: [archive.tiles],
    minzoom,
    maxzoom,
    attribution: '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a>',
  });
  const land = (source, withStrokes) => [
    { id: `${source}-land`, type: 'fill', source, 'source-layer': 'land', paint: { 'fill-color': colors.land } },
    { id: `${source}-lakes`, type: 'fill', source, 'source-layer': 'lakes', paint: { 'fill-color': colors.sea } },
    // Detail land is clipped to its box, so an outline would also trace the
    // box edge as a fake coast. Only the world tiles get the strokes.
    ...(withStrokes && strokes
      ? [
          { id: `${source}-lake-shore`, type: 'line', source, 'source-layer': 'lakes', paint: { 'line-color': colors.coast, 'line-width': 0.7 } },
          { id: `${source}-coast`, type: 'line', source, 'source-layer': 'land', paint: { 'line-color': colors.coast, 'line-width': 0.9 } },
        ]
      : []),
    {
      id: `${source}-borders`,
      type: 'line',
      source,
      'source-layer': 'borders',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': colors.border, ...border },
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
      { id: 'basemap-bg', type: 'background', paint: { 'background-color': colors.sea } },
      ...land(BASEMAP_SOURCES.world, true),
      { id: 'basemap-detail-mask', type: 'fill', source: BASEMAP_SOURCES.detail, 'source-layer': 'detail_extent', paint: { 'fill-color': colors.sea } },
      ...land(BASEMAP_SOURCES.detail, false),
    ],
  };
}

/*
 * A regional basemap, Bangladesh's: Bangladesh only (the user's decision,
 * 2026-09-28). Its own land in the land colour on plain land and the sea;
 * its border, its division and district lines, its rivers and its names —
 * the features the archive marks `bd` — and nothing of a neighbour's but
 * its land, plain. Coast is a line layer of its own, cut free of the tile-box edges,
 * so both sources can stroke it.
 *
 * Labels come last and are split by zoom rather than masked: a symbol hidden
 * under the detail mask would still take its collision space and push the
 * detail labels off the map. Below the detail zoom the overview labels draw;
 * above it they draw only outside the detail areas (`detail` is false).
 */
function regionStyle(archive, meta) {
  const { tiles, layersOf, labelsOf, outsideDetail, detailFrom } = regionParts(archive, meta);
  return {
    version: 8,
    metadata: { slots: ['belowLabels', 'aboveLabels', 'top'] },
    sources: {
      [BASEMAP_SOURCES.world]: tiles(0, meta.overviewMaxZoom),
      [BASEMAP_SOURCES.detail]: tiles(detailFrom, meta.detailMaxZoom),
    },
    layers: [
      { id: 'basemap-bg', type: 'background', paint: { 'background-color': BASEMAP_COLORS.sea } },
      ...layersOf(BASEMAP_SOURCES.world),
      { id: 'basemap-detail-mask', type: 'fill', source: BASEMAP_SOURCES.detail, 'source-layer': 'detail_extent', paint: { 'fill-color': BASEMAP_COLORS.sea } },
      ...layersOf(BASEMAP_SOURCES.detail),
      ...labelsOf(BASEMAP_SOURCES.world, outsideDetail),
      ...labelsOf(BASEMAP_SOURCES.detail, null),
    ],
  };
}

/** The region's sources and layers, by source id: regionStyle's, and wideStyle's over the world. */
function regionParts(archive, meta) {
  const attribution = [
    credit('https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors'),
    credit('https://data.humdata.org/dataset/cod-ab-bgd', 'BBS / OCHA (CC BY-IGO)'),
    credit('https://www.geoboundaries.org/', 'geoBoundaries (ODbL)'),
    credit('https://www.naturalearthdata.com/', 'Natural Earth'),
  ].join(' · ');
  const tiles = (minzoom, maxzoom) => ({ type: 'vector', tiles: [archive.tiles], minzoom, maxzoom, attribution });
  const detailFrom = meta.detailMinZoom;
  const layersOf = (source) => [
    { id: `${source}-land`, type: 'fill', source, 'source-layer': 'land', paint: { 'fill-color': BASEMAP_COLORS.plain } },
    { id: `${source}-bangladesh`, type: 'fill', source, 'source-layer': 'bangladesh', paint: { 'fill-color': BASEMAP_COLORS.land } },
    { id: `${source}-lakes`, type: 'fill', source, 'source-layer': 'lakes', paint: { 'fill-color': BASEMAP_COLORS.sea } },
    { id: `${source}-lake-shore`, type: 'line', source, 'source-layer': 'lakes', paint: { 'line-color': BASEMAP_COLORS.coast, 'line-width': 0.7 } },
    { id: `${source}-coast`, type: 'line', source, 'source-layer': 'coast', paint: { 'line-color': BASEMAP_COLORS.coast, 'line-width': 0.9 } },
    {
      id: `${source}-rivers`,
      type: 'line',
      source,
      'source-layer': 'rivers',
      filter: ['==', ['get', 'bd'], true],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': BASEMAP_COLORS.river, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 8, 1.8, 10, 3] },
    },
    {
      id: `${source}-admin-district`,
      type: 'line',
      source,
      'source-layer': 'admin',
      filter: ['all', ['==', ['get', 'bd'], true], ['==', ['get', 'level'], 'district']],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': BASEMAP_COLORS.admin, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 9, 0.9], 'line-dasharray': [2, 1.5] },
    },
    {
      id: `${source}-admin-major`,
      type: 'line',
      source,
      'source-layer': 'admin',
      filter: ['all', ['==', ['get', 'bd'], true], ['!=', ['get', 'level'], 'district']],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': BASEMAP_COLORS.admin, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 9, 1.5] },
    },
    {
      id: `${source}-borders`,
      type: 'line',
      source,
      'source-layer': 'borders',
      filter: ['==', ['get', 'bd'], true],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': BASEMAP_COLORS.border, 'line-width': 1.2, 'line-dasharray': [3, 1.5] },
    },
  ];
  const outsideDetail = ['any', ['<', ['zoom'], detailFrom], ['!=', ['get', 'detail'], true]];
  const name = ['coalesce', ['get', 'name_bn'], ['get', 'name_en']];
  const labelsOf = (source, only) => [
    {
      id: `${source}-river-labels`,
      type: 'symbol',
      source,
      'source-layer': 'rivers',
      filter: ['all', ['has', 'name_en'], ...(only ? [only] : [])],
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': LABEL_FONT, 'text-size': 11, 'symbol-spacing': 320 },
      paint: { 'text-color': '#2f6c9e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
    },
    // A river named at a place rather than along its line — the main channel,
    // which reads as two names. Beside the channel, on the named town's side.
    {
      id: `${source}-river-point-labels`,
      type: 'symbol',
      source,
      'source-layer': 'river_labels',
      filter: ['all', ['<=', ['get', 'min_zoom'], ['zoom']], ['>', ['get', 'max_zoom'], ['zoom']], ...(only ? [only] : [])],
      layout: { 'text-field': name, 'text-font': LABEL_FONT, 'text-size': 12, 'text-anchor': ['get', 'anchor'], 'text-radial-offset': 0.5 },
      paint: { 'text-color': '#2f6c9e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
    },
    {
      id: `${source}-admin-labels`,
      type: 'symbol',
      source,
      'source-layer': 'admin_labels',
      filter: ['all', ['==', ['get', 'bd'], true], ['<=', ['get', 'min_zoom'], ['zoom']], ['>', ['get', 'max_zoom'], ['zoom']], ...(only ? [only] : [])],
      layout: {
        'text-field': name,
        'text-font': LABEL_FONT,
        'text-size': ['match', ['get', 'level'], 'district', 11, 12.5],
        'text-max-width': 7,
        'text-optional': true,
      },
      paint: { 'text-color': ['match', ['get', 'level'], 'district', '#5b5047', '#463b33'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
    },
  ];

  return { tiles, layersOf, labelsOf, outsideDetail, detailFrom };
}

/*
 * Bangladesh's archive over the world's (`bangladesh-wide`), for a map whose
 * frames reach past Bangladesh's box — the rivers' whole courses, to Tibet.
 * The world archive draws everywhere, underneath: land plain, lakes, the
 * international borders and, as the baseline's source, the country names — no
 * state or province of any country, so the Bangladesh-only rule holds beyond
 * the box as well. Over it, a sea-coloured mask the size of Bangladesh's
 * archive (its own `maxBounds`, inline, no request) hides the world's coarser
 * layers inside the box, and the Bangladesh archive draws there as on its own
 * map — but without its own rivers and river names, which a map of rivers
 * draws itself, and with district names at 14 px and division names at 15.
 * North of 27.6°N and past the box's other edges only the world archive is
 * asked for; its overview tiles reach z6, which the whole-course frames open
 * on. Both land fills are the region's plain colour, so the box's edge does
 * not show across land.
 */
function wideStyle(archive, meta, also) {
  const { tiles, layersOf, labelsOf, outsideDetail, detailFrom } = regionParts(archive, meta);
  const plainNoRivers = (source) => layersOf(source).filter((l) => l['source-layer'] !== 'rivers');
  const labels = (source, only) =>
    labelsOf(source, only)
      .filter((l) => l['source-layer'] !== 'rivers' && l['source-layer'] !== 'river_labels')
      .map((l) => (l['source-layer'] === 'admin_labels' ? { ...l, layout: { ...l.layout, 'text-size': ['match', ['get', 'level'], 'district', 14, 15] } } : l));
  const world = 'basemap';
  const bd = 'basemap-bd';
  const bdDetail = 'basemap-bd-detail';
  const [w, s, e, n] = meta.maxBounds;
  const worldTiles = {
    type: 'vector',
    tiles: [also.tiles],
    minzoom: 0,
    maxzoom: 6,
    attribution: credit('https://www.naturalearthdata.com/', 'Natural Earth'),
  };
  return {
    version: 8,
    metadata: { slots: ['belowLabels', 'aboveLabels', 'top'] },
    sources: {
      [world]: worldTiles,
      [bd]: tiles(0, meta.overviewMaxZoom),
      [bdDetail]: tiles(detailFrom, meta.detailMaxZoom),
      'basemap-bd-box': { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } } },
    },
    layers: [
      { id: 'basemap-bg', type: 'background', paint: { 'background-color': BASEMAP_COLORS.sea } },
      { id: 'basemap-world-land', type: 'fill', source: world, 'source-layer': 'land', paint: { 'fill-color': BASEMAP_COLORS.plain } },
      { id: 'basemap-world-lakes', type: 'fill', source: world, 'source-layer': 'lakes', paint: { 'fill-color': BASEMAP_COLORS.sea } },
      { id: 'basemap-world-borders', type: 'line', source: world, 'source-layer': 'borders', layout: { 'line-join': 'round' }, paint: { 'line-color': BASEMAP_COLORS.border, 'line-width': 1, 'line-dasharray': [3, 1.5] } },
      { id: 'basemap-bd-box', type: 'fill', source: 'basemap-bd-box', minzoom: 3, paint: { 'fill-color': BASEMAP_COLORS.sea } },
      ...plainNoRivers(bd),
      { id: 'basemap-detail-mask', type: 'fill', source: bdDetail, 'source-layer': 'detail_extent', paint: { 'fill-color': BASEMAP_COLORS.sea } },
      ...plainNoRivers(bdDetail),
      ...labels(bd, outsideDetail),
      ...labels(bdDetail, null),
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
// This map's own text size and tab height (org-members). Other maps do not match it.
document.documentElement.dataset.map = descriptor.id;

/*
 * The map's language. Every map is in Bengali but one: environment-treaties is
 * in English, by the user's decision (2026-09-27). `language: "en"` turns the
 * shell's own words with it — the page's title and every lang attribute, the
 * load notice, the country names (the tiles' name_en), and the sea names, which
 * the shared table has in Bengali only and so are left off an English map.
 */
const LANGUAGE = descriptor.language ?? 'bn';

/*
 * A map that asks for it (`minTextSize: 14`, the rivers map, 2026-09-30)
 * shows no text under that size: every label's size on the map is floored —
 * the basemap's, the baseline's and its own; a number, or each output of a
 * zoom interpolate or step, a match or a case — and the shell's chrome follows
 * (style.css, under [data-min-text]). Every other map is drawn as before.
 */
const MIN_TEXT = descriptor.minTextSize;
if (MIN_TEXT !== undefined && MIN_TEXT !== 14) throw new Error(`minTextSize is 14 or absent, not ${MIN_TEXT}`);
if (MIN_TEXT) document.documentElement.dataset.minText = String(MIN_TEXT);
function floorTextSize(size, min) {
  if (typeof size === 'number') return Math.max(size, min);
  if (!Array.isArray(size)) return size;
  const outputs = (items, odd) => items.map((v, i) => (i % 2 === odd ? floorTextSize(v, min) : v));
  if (size[0] === 'interpolate') return [...size.slice(0, 3), ...outputs(size.slice(3), 1)];
  if (size[0] === 'step') return [...size.slice(0, 2), floorTextSize(size[2], min), ...outputs(size.slice(3), 1)];
  if (size[0] === 'match') return [...size.slice(0, 2), ...outputs(size.slice(2, -1), 1), floorTextSize(size.at(-1), min)];
  if (size[0] === 'case') return [size[0], ...outputs(size.slice(1, -1), 1), floorTextSize(size.at(-1), min)];
  throw new Error(`minTextSize: a text-size of form «${size[0]}» cannot be floored`);
}
const floorLayer = (layer) => (MIN_TEXT && layer.type === 'symbol' && layer.layout?.['text-size'] !== undefined ? { ...layer, layout: { ...layer.layout, 'text-size': floorTextSize(layer.layout['text-size'], MIN_TEXT) } } : layer);
if (!['bn', 'en'].includes(LANGUAGE)) throw new Error(`language "${LANGUAGE}" is neither bn nor en`);
const LOAD_NOTICE = { en: ['The map could not be loaded', 'Check the connection and reload the page.'] };
if (LANGUAGE !== 'bn') {
  for (const el of document.querySelectorAll('[lang="bn"]')) el.lang = LANGUAGE;
  const [headline, advice] = LOAD_NOTICE[LANGUAGE];
  dom.loadNotice.replaceChildren(Object.assign(document.createElement('strong'), { textContent: headline }), Object.assign(document.createElement('span'), { textContent: advice }));
}

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
// A sea may name a better place for its label on one basemap — the Bay of
// Bengal's world anchor lies outside the Bangladesh basemap's bounds. The name
// stays in its one record; only where it sits changes, and only there.
for (const row of Object.values(records.seas)) {
  const at = row.atByBasemap?.[descriptor.basemap];
  if (at) row.at = at;
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

/*
 * SHARED GEOMETRY (opt-in, 2026-10-08; bangladesh-ethnic-groups): a source may
 * take its geometry from a file every item shares, read once, instead of a
 * copy in its own folder. `sharedGeometry` names the file; each feature
 * carries its join key, as a map's own geometry file does. One decoder per
 * file, here: bangladesh-districts.json, the 64 districts as arcs
 * (tools/build-bangladesh-districts.mjs) — each feature keyed by `pcode`, each
 * ring a polygon of its own (the file has no holes), every ring wound the same
 * way so none is read as a hole. No other map declares it.
 */
const SHARED_GEOMETRY = {
  'bangladesh-districts.json': (file) => {
    const arcs = file.arcs.map((arc) => {
      const pts = [];
      for (let k = 0, x = 0, y = 0; k < arc.length; k += 2) {
        x += arc[k];
        y += arc[k + 1];
        pts.push([+(x * file.quantum).toFixed(4), +(y * file.quantum).toFixed(4)]);
      }
      return pts;
    });
    const area = (ring) => ring.reduce((s, [x, y], i) => s + (ring[(i + 1) % ring.length][0] - x) * (ring[(i + 1) % ring.length][1] + y), 0);
    const ringOf = (ids) => {
      const ring = ids.flatMap((r, j) => (r < 0 ? arcs[~r].slice().reverse() : arcs[r]).slice(j ? 1 : 0));
      return area(ring) > 0 ? ring.reverse() : ring; // counter-clockwise, as RFC 7946 winds an outer ring
    };
    return {
      type: 'FeatureCollection',
      features: file.districts.map((d) => {
        const rings = d.rings.map(ringOf);
        return { type: 'Feature', properties: { pcode: d.pcode }, geometry: rings.length === 1 ? { type: 'Polygon', coordinates: rings } : { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) } };
      }),
    };
  },
};
/*
 * world-countries.json (IDX-3, 2026-10-08): every country in Bangladesh's view, keyed by ISO3, with its ADM0_A3
 * (`adm0`) beside it; shared arcs, each polygon its rings (outer first, then holes). `sharedPart: 'main'` on a source
 * keeps, for each country, only the polygon its inner point falls in (a map's tap shape for it).
 */
SHARED_GEOMETRY['world-countries.json'] = (file) => {
  const arcs = file.arcs.map((arc) => {
    const pts = [];
    for (let k = 0, x = 0, y = 0; k < arc.length; k += 2) {
      x += arc[k];
      y += arc[k + 1];
      pts.push([+(x * file.quantum).toFixed(4), +(y * file.quantum).toFixed(4)]);
    }
    return pts;
  });
  const ringOf = (ids) => ids.flatMap((r, j) => (r < 0 ? arcs[~r].slice().reverse() : arcs[r]).slice(j ? 1 : 0));
  return {
    type: 'FeatureCollection',
    features: file.countries.map((c) => {
      const polygons = c.polygons.map((p) => p.map(ringOf));
      return { type: 'Feature', properties: { iso3: c.iso3, adm0: c.adm0, main: c.main }, geometry: polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons } };
    }),
  };
};
const SHARED_PARTS = {
  // The polygon a country's inner point falls in.
  main: (fc) => ({
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({ ...f, geometry: f.geometry.type === 'MultiPolygon' ? { type: 'Polygon', coordinates: f.geometry.coordinates[f.properties.main ?? 0] } : f.geometry })),
  }),
};
const sharedGeometry = {};
for (const [name, spec] of Object.entries(descriptor.sources ?? {})) {
  if (!spec.sharedGeometry) continue;
  const decode = SHARED_GEOMETRY[spec.sharedGeometry];
  if (!decode) throw new Error(`source "${name}": no decoder for shared geometry "${spec.sharedGeometry}"`);
  if (spec.sharedPart !== undefined && !SHARED_PARTS[spec.sharedPart]) throw new Error(`source "${name}": sharedPart "${spec.sharedPart}" is not one of ${Object.keys(SHARED_PARTS).join(', ')}`);
  sharedGeometry[spec.sharedGeometry] ??= decode(await fetchJson(resolver.url('sharedData', spec.sharedGeometry)));
  geometryFiles[name] = spec.sharedPart ? SHARED_PARTS[spec.sharedPart](sharedGeometry[spec.sharedGeometry]) : sharedGeometry[spec.sharedGeometry];
}

const pageTitle = descriptor.title?.[LANGUAGE] ?? descriptor.title?.bn;
if (pageTitle) dom.title.textContent = pageTitle;
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
// Photo markers, per source that declares `photoMarker`: built once, then
// shown, hidden and restyled from each re-derive. See PHOTO MARKERS below.
const photoMarkers = new Map();

const stateFields = (sourceSpec) => sourceSpec.state ?? [];

/*
 * RECORD FILTER — which records are on the map at all.
 *
 * A `recordFilter` control names a records table and a field; unchecking a
 * value hides every record of that table carrying it. A record of a table the
 * filtered one REFERENCES (a city, through the organisations' `cities` refs)
 * stays only while some shown record still points at it — so a city whose
 * organisations are all filtered out goes with them. Baseline sources are
 * shell chrome and are never filtered.
 *
 * Same mechanism as selection: the sources are re-derived with setData.
 */
const recordFilter = (descriptor.controls ?? []).find((c) => c.type === 'recordFilter') ?? null;
const filteredOut = new Set(); // values of recordFilter.field that are unchecked
let reachable = null; // table -> keys some shown record references; rebuilt on change

function shown(table, key) {
  if (!recordFilter || filteredOut.size === 0) return true;
  if (table === recordFilter.records) return !filteredOut.has(records[table]?.[key]?.[recordFilter.field]);
  reachable ??= referencedByShown();
  const keys = reachable.get(table);
  return keys ? keys.has(key) : true;
}

function referencedByShown() {
  const out = new Map();
  const rows = records[recordFilter.records] ?? {};
  for (const [field, decl] of Object.entries(descriptor.records[recordFilter.records]?.fields ?? {})) {
    if (decl.type !== 'refs') continue;
    const keys = out.get(decl.to) ?? new Set();
    for (const row of Object.values(rows)) {
      if (filteredOut.has(row[recordFilter.field])) continue;
      for (const ref of row[field] ?? []) keys.add(ref);
    }
    out.set(decl.to, keys);
  }
  return out;
}

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
  const all = deriveAll(name, spec);
  if (!spec.records || isBaselineSource(name) || ((!recordFilter || filteredOut.size === 0) && !hiders.length && !mapHiders.length)) return all;
  return { ...all, features: all.features.filter((f) => onMap(spec.records, f.properties.key) && !offMap(spec.records, f.properties.key)) };
}

function deriveAll(name, spec) {
  const fields = stateFields(spec);

  // Records joined to a geometry file on a shared key.
  if (spec.records && (spec.geometry || spec.sharedGeometry)) {
    const table = records[spec.records];
    // A shared file may hold more than a map has records for (world-countries.json): only its records' shapes are drawn.
    const features = spec.sharedGeometry ? geometryFiles[name].features.filter((f) => table?.[f.properties[spec.joinField]]) : geometryFiles[name].features;
    return {
      type: 'FeatureCollection',
      features: features.map((feature) => {
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
| SHELL MODULES — a term a descriptor may use, in a file of its own
|
| A module is downloaded and run only for a map whose descriptor uses its
| term; every other map loads exactly what it did before. Each exports
| `mount(shell)`, run here, before the map is built, so the room it takes on
| the page is there when the map measures its container; and `install(shell)`,
| run once everything else is built. `shell` is the one surface a module has.
|--------------------------------------------------------------------------
*/
const SHELL_MODULES = {
  tabs: './tabs.js?v=4d425c1dee',
  chips: './chips.js?v=4d425c1dee',
  timeline: './timeline.js?v=4d425c1dee',
  globe: './globe.js?v=4d425c1dee',
  focus: './focus.js?v=4d425c1dee',
  legend: './legend.js?v=4d425c1dee',
  info: './info.js?v=4d425c1dee',
  indices: './indices.js?v=4d425c1dee',
};
const hiders = []; // (table, key) => true takes a record off the map, the picker and ‹ ›
// (table, key) => true takes a record off the map only: the picker and ‹ › still list it (the focus module).
const mapHiders = [];
const offMap = (table, key) => mapHiders.some((hide) => hide(table, key));
const changeListeners = []; // (what) => …, after a selection ('select') or a change in what is shown ('filter')
const changed = (what) => changeListeners.forEach((listener) => listener(what));
const moduleActions = {}; // action name -> (action, context) => …, what a module adds to select and fitBounds
/*
 * What a module may set while it mounts, before the map is built:
 *   build.style    merged into the map's style (a projection, a sky)
 *   build.options  merged into the map's options (its camera, its limits)
 *   tapsOwned      true when the module resolves every tap itself, from
 *                  `tapTargets`; the shell then binds no click of its own
 * and `actions`, into which it may put an action of its own by name.
 */
const shell = {
  descriptor,
  language: LANGUAGE,
  records,
  dom,
  own,
  valueOf,
  selection,
  shown: onMap,
  hide: (hider) => hiders.push(hider),
  hideOnMap: (hider) => mapHiders.push(hider),
  drawn: (table, key) => onMap(table, key) && !offMap(table, key),
  file: (name) => mapFile(name.replace(/^\.\//, '')),
  // A record's card as an element of its own, its title and value rows as the sheet draws them (a cards-only tab's list).
  card: (table, key) => cardElement(table, key),
  build: { style: {}, options: {} },
  tapsOwned: false,
  actions: moduleActions,
};
const modules = [];
for (const [term, file] of Object.entries(SHELL_MODULES)) {
  if (descriptor[term] === undefined) continue;
  const module = await import(file);
  await module.mount?.(shell);
  modules.push(module);
}

/** On the map, in the picker and in ‹ ›: shown by the record filter, and hidden by no module. */
function onMap(table, key) {
  return shown(table, key) && !hiders.some((hide) => hide(table, key));
}

/*
|--------------------------------------------------------------------------
| THE MAP
|--------------------------------------------------------------------------
*/

const basemap = BASEMAPS[descriptor.basemap];
if (!basemap) throw new Error(`basemap "${descriptor.basemap}" is not one of: ${Object.keys(BASEMAPS).join(', ')}`);
const archive = resolver.pmtilesSource(basemap.archive);
const protocol = new window.pmtiles.Protocol();
const tileArchive = new window.pmtiles.PMTiles(archive.archive);
protocol.add(tileArchive);
maplibregl.addProtocol('pmtiles', protocol.tile);
remember('protocol', 'pmtiles', () => maplibregl.removeProtocol('pmtiles'));

// Only a bounded basemap is asked for its metadata; the world archive needs
// none, and its requests stay exactly what they were.
const region = basemap.bounded ? (await tileArchive.getMetadata()).geoquest : null;
// A basemap drawn from two archives (`also`, under the first) registers the second on the same protocol.
const alsoArchive = basemap.also ? resolver.pmtilesSource(basemap.also) : null;
if (alsoArchive) protocol.add(new window.pmtiles.PMTiles(alsoArchive.archive));
const style = basemap.style(archive, region, alsoArchive);
const SLOTS = style.metadata.slots;

const view = descriptor.view ?? {};
// A map's own frame wins; otherwise a regional basemap opens on its frame.
const frame = view.fitBounds ?? region?.frame;
const maxBounds = descriptor.constraints?.maxBounds ?? region?.maxBounds;
const map = new maplibregl.Map({
  container: 'map',
  transformRequest: (url, resourceType) => resolver.transformRequest(url, resourceType),
  style: {
    ...style,
    layers: style.layers.map(floorLayer),
    // Bengali is shaped by the browser from a bundled font; see the resolver.
    'font-faces': { 'Noto Sans Bengali': 'noto-sans-bengali/NotoSansBengali-Regular.woff2' },
    ...shell.build.style,
  },
  // A module that places the camera itself (the globe) says where; the frame
  // is then not the camera's.
  ...(frame && !('center' in shell.build.options) ? { bounds: [[frame[0], frame[1]], [frame[2], frame[3]]] } : {}),
  minZoom: descriptor.constraints?.minZoom ?? 0,
  maxZoom: descriptor.constraints?.maxZoom ?? 22,
  // The tilt button stops at 55; this stops a drag going further. Baseline,
  // not a descriptor field: every map gets the same ceiling.
  maxPitch: 60,
  ...(maxBounds ? { maxBounds } : {}),
  attributionControl: false,
  ...shell.build.options,
});
remember('map', 'map', () => map.remove());

const pristine = { layers: style.layers.map((l) => l.id), sources: Object.keys(style.sources) };

await new Promise((resolve) => map.once('load', resolve));
pristine.images = map.listImages();

/*
 * IMAGES — `images: { <id>: { file, pixelRatio } }`: the pictures a map's
 * symbol layers draw by name through `icon-image` — a flag, an anchor, a star.
 * Each is an SVG in the map's own folder, fetched as its other files are, its
 * own width and height drawn at `pixelRatio` pixels to the CSS pixel so it
 * stays sharp; registered like a layer, so teardown removes it.
 */
for (const [id, spec] of Object.entries(descriptor.images ?? {})) {
  const response = await fetch(mapFile(spec.file.replace(/^\.\//, '')));
  if (!response.ok) throw new Error(`image "${id}": ${spec.file} -> ${response.status}`);
  // Typed here, whatever the host calls it: an image decodes an SVG only as one.
  const local = URL.createObjectURL(new Blob([await response.text()], { type: 'image/svg+xml' }));
  try {
    // Its load event, not decode(): decode() may wait for a page that is not
    // being drawn, as a WebView's is before it shows, and the map would never open.
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`image "${id}": ${spec.file} is not an image`));
      img.src = local;
    });
    own.image(map, id, image, { pixelRatio: spec.pixelRatio ?? 1 });
  } finally {
    URL.revokeObjectURL(local);
  }
}

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
// Names in the map's language: the tiles carry name_en beside name_bn; the
// shared seas table has its names in Bengali only, so an English map has no
// sea names to show, and shows none.
const COUNTRY_NAME = LANGUAGE === 'en' ? ['get', 'name_en'] : ['coalesce', ['get', 'name_bn'], ['get', 'name_en']];
const SEA_NAME = LANGUAGE === 'en' ? 'nameEn' : 'nameBn';
const seasNamed = Object.values(records.seas).every((sea) => typeof sea[SEA_NAME] === 'string' && sea[SEA_NAME] !== '');
if (LANGUAGE !== 'bn' && records[COUNTRY_TABLE]) throw new Error(`a countries table on a map in "${LANGUAGE}" is not built: its names are Bengali`);

const BASELINE_SOURCES = {
  seas: { records: 'seas', geometryFrom: 'at', properties: seasNamed ? [SEA_NAME] : [], state: activeState(seaRelation) },
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
    rederive(name, spec);
  }
}

/** One source's features re-derived, and its photo markers brought into line. */
function rederive(name, spec) {
  const data = derive(name, spec);
  map.getSource(name)?.setData(data);
  syncPhotoMarkers(name, data);
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
/*
 * One exception (the user's, 2026-10-09; global-indices): `hideCountryLabels: true` draws no country name at all —
 * neither the basemap's nor the map's own — so the only names on the map are its own pins. Sea and ocean names stay.
 * Every other map keeps the baseline as it is.
 */
const HIDE_COUNTRY_LABELS = descriptor.hideCountryLabels === true;
if (descriptor.hideCountryLabels !== undefined && typeof descriptor.hideCountryLabels !== 'boolean') throw new Error('hideCountryLabels is true or false');
function baselineLayers() {
  const named = records[COUNTRY_TABLE] ? Object.keys(records[COUNTRY_TABLE]) : [];
  if (HIDE_COUNTRY_LABELS) {
    const plain = seasNamed ? [{ id: 'sea-labels', type: 'symbol', source: 'seas', style: 'sea-label', filter: ['all', NOT_ACTIVE, ['>=', ['zoom'], 3]], layout: { 'text-field': ['get', SEA_NAME] } }] : [];
    const active = seasNamed ? [{ id: 'sea-labels-active', type: 'symbol', source: 'seas', style: 'sea-label-active', filter: IS_ACTIVE, layout: { 'text-field': ['get', SEA_NAME] } }] : [];
    return { plain, active };
  }
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
      layout: { 'text-field': COUNTRY_NAME },
    },
    ...(records[COUNTRY_TABLE]
      ? [{ id: 'country-labels-named', type: 'symbol', source: 'countryLabels', style: 'country-label', filter: NOT_ACTIVE, layout: { 'text-field': ['get', 'nameBn'] } }]
      : []),
    ...(seasNamed
      ? [{ id: 'sea-labels', type: 'symbol', source: 'seas', style: 'sea-label', filter: ['all', NOT_ACTIVE, ['>=', ['zoom'], 3]], layout: { 'text-field': ['get', SEA_NAME] } }]
      : []),
  ];
  const active = [
    ...(seasNamed ? [{ id: 'sea-labels-active', type: 'symbol', source: 'seas', style: 'sea-label-active', filter: IS_ACTIVE, layout: { 'text-field': ['get', SEA_NAME] } }] : []),
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
    const spec = floorLayer({
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
    });
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

// A source may widen its target (`tapWidth`, px): a thin river is a hard line to hit with a finger.
function hitLayerPaint(kind, width) {
  if (kind === 'line') return { type: 'line', paint: { 'line-width': width ?? 22, 'line-color': '#000000', 'line-opacity': 0 } };
  if (kind === 'fill') return { type: 'fill', paint: { 'fill-color': '#000000', 'fill-opacity': 0 } };
  return { type: 'circle', paint: { 'circle-radius': (width ?? 44) / 2, 'circle-color': '#000000', 'circle-opacity': 0 } };
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

// A source may narrow its target (`tapFilter`, opt-in, 2026-10-07): a filter expression on the tap
// target, so a point drawn only below some zoom is tapped only there. org-members' country dots,
// drawn while a country is smaller than a finger. Without it the target covers every feature, as before.
for (const source of interactionSources) {
  const tapFilter = sourceSpecs[source].tapFilter;
  if (tapFilter !== undefined && !Array.isArray(tapFilter)) throw new Error(`source "${source}": tapFilter must be a filter expression`);
  own.layer(
    map,
    { id: hitLayerId(source), source, ...hitLayerPaint(geometryKind(source, sourceSpecs[source]), sourceSpecs[source].tapWidth), ...(tapFilter ? { filter: tapFilter } : {}) },
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

/*
 * ONE marker, however many sources ask for it: only one record is selected at
 * a time, so there is only ever one place to pulse. Each source that declares
 * selectionMarker says where its table's records sit; the marker goes to the
 * one whose table holds the selection.
 */
function markerFor() {
  const withMarker = Object.values(sourceSpecs).filter((spec) => spec.selectionMarker);
  if (!withMarker.length) return null;
  const element = own.node(document.createElement('button'), 'selection marker');
  element.type = 'button';
  element.className = 'selection-marker';
  element.setAttribute('aria-label', 'Show details');
  element.innerHTML = '<span class="selection-marker-pulse"></span><span class="selection-marker-core"></span>';
  own.domHandler(element, 'click', (event) => {
    event.stopPropagation();
    setSheetOpen(true);
  });
  return { instance: own.marker(new maplibregl.Marker({ element }), 'selection'), specs: withMarker };
}

function placeMarker(table, key) {
  if (!marker) return;
  const row = records[table][key];
  const spec = marker.specs.find((s) => s.records === table);
  const point = spec ? row[spec.geometryFrom] : null;
  // Taken off the map for a record it does not apply to, so selecting a
  // traced line after a marked one does not leave a pulse behind.
  // Behind a photo marker the pulse is drawn larger, so it shows round it.
  marker.instance.getElement().classList.toggle('selection-marker--photo', Boolean(spec?.photoMarker));
  if (point && markerApplies(spec, row)) marker.instance.setLngLat(point).addTo(map);
  else marker.instance.remove();
}

function runActions(actions, context) {
  for (const action of actions ?? []) {
    if (action.action === 'select') doSelect(context);
    else if (action.action === 'fitBounds') doFitBounds(action, context);
    else if (moduleActions[action.action]) moduleActions[action.action](action, context);
    else throw new Error(`unknown action "${action.action}"`);
  }
}

function doSelect({ table, key }) {
  // One selection at a time. The sheet shows one record, so a record from
  // another table replaces it — its state is cleared, not left lit behind.
  for (const other of [...selection.keys()]) {
    if (other === table) continue;
    selection.delete(other);
    refresh(other);
  }
  selection.set(table, key);
  refresh(table);
  // A selection the picker does not list puts the picker back to its prompt,
  // so it never names a record the sheet is not showing.
  if (dom.picker.dataset.table === table) dom.picker.value = key;
  else if (dom.picker.dataset.table) dom.picker.value = '';
  row?.sync();
  placeMarker(table, key);
  if (sheetFor(table)) {
    fillSheet(table, key);
    setSheetOpen(true);
  }
  changed('select');
}

/** Nothing selected: every table's selection cleared, and the marker and the card with it. */
function clearSelection() {
  if (!selection.size) return;
  const tables = [...selection.keys()];
  selection.clear();
  for (const table of tables) refresh(table);
  if (dom.picker.dataset.table) dom.picker.value = '';
  row?.sync();
  marker?.instance.remove();
  if (hasSheet) setSheetOpen(false);
  changed('select');
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
    if (spec.records !== table || !(spec.geometry || spec.sharedGeometry)) continue;
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
  if ((clear ?? []).includes('sheet') && !dom.sheet.hidden && sheetFloats()) base.bottom = sheetHeight() + 16;
  if (CLEAR_CONTROLS) base.right = Math.max(base.right, controlsColumn() + 16);
  return base;
}

/*
 * `frameClearsControls: true` (opt-in, 2026-10-06): every fit to a record keeps
 * the column of the map's top-right controls — the compass, the tilt button —
 * out of the frame on the right, measured as they stand, so a line's end is
 * never framed under them. The rivers map's Meghna, whose Barak ended there.
 * Without it a map frames as before.
 */
const CLEAR_CONTROLS = descriptor.frameClearsControls === true;
if (descriptor.frameClearsControls !== undefined && typeof descriptor.frameClearsControls !== 'boolean') throw new Error('frameClearsControls is true or false');
function controlsColumn() {
  const corner = map.getContainer().querySelector('.maplibregl-ctrl-top-right');
  if (!corner || !corner.offsetWidth) return 0;
  return Math.ceil(map.getContainer().getBoundingClientRect().right - corner.getBoundingClientRect().left);
}

/*
|--------------------------------------------------------------------------
| INTERACTIONS
|--------------------------------------------------------------------------
*/

/*
 * The tap target is a finger wide, so two points a few pixels apart are both
 * under it — Geneva and Cologny are at frame zoom. The one nearest the finger
 * wins, not whichever the renderer happened to list first.
 *
 * Areas nest — the Nubian Desert inside the Sahara, Rub' al Khali inside the
 * Arabian — so a tap on overlapping areas selects the SMALLEST: the one the
 * tap most specifically means. Measured on the record's whole geometry, not
 * the tile-clipped piece the renderer hands back.
 */
function nearest(features, point, source) {
  if (!features?.length) return null;
  let best = features[0];
  let bestScore = Infinity;
  for (const candidate of features) {
    const type = candidate.geometry?.type;
    let score;
    if (type === 'Point') {
      const at = map.project(candidate.geometry.coordinates);
      score = Math.hypot(at.x - point.x, at.y - point.y);
    } else if (type === 'Polygon' || type === 'MultiPolygon') {
      score = recordArea(source, candidate.properties.key);
    } else continue;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** A record's area in its source, in square degrees scaled by latitude — enough to rank. */
const areaCache = new Map();
function recordArea(source, key) {
  const id = `${source}|${key}`;
  if (areaCache.has(id)) return areaCache.get(id);
  const spec = sourceSpecs[source];
  let total = 0;
  for (const f of geometryFiles[source]?.features ?? []) {
    if (f.properties[spec.joinField] !== key) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const [outer] of polys) {
      let a = 0;
      for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) a += (outer[j][0] - outer[i][0]) * (outer[j][1] + outer[i][1]);
      const lat = outer.reduce((s, p) => s + p[1], 0) / outer.length;
      total += Math.abs(a / 2) * Math.cos((lat * Math.PI) / 180);
    }
  }
  areaCache.set(id, total || Infinity);
  return areaCache.get(id);
}

/*
 * A module that resolves taps itself (the globe: dots first, then lines,
 * then areas, and nothing on the far side) takes them all, from these: every
 * click interaction's source, its tap layer, what its geometry is, and what a
 * tap on it does. The shell then binds no click of its own.
 */
const tapTargets = interactions
  .filter((i) => i.on === 'click' && targetSource(i.target))
  .map((i) => {
    const source = targetSource(i.target);
    return { source, layer: hitLayerId(source), kind: geometryKind(source, sourceSpecs[source]), table: sourceSpecs[source].records, do: i.do };
  });

/*
 * A tap is resolved once, on the view it landed on: every tapped source's
 * features under the finger are found first, then each source's actions run,
 * in the descriptor's order, as each source's own handler once ran them. One
 * handler per source let the first source's camera jump — instant with
 * reduced motion — move another source's feature under the finger before
 * that source looked (ancient-janapadas: a tap on Samatata's area opened
 * Banga's card).
 */
async function runTap(interaction, source, feature) {
  const spec = sourceSpecs[source];
  // Cluster tap is the shell's, not the descriptor's: expanding a cluster is
  // what clustering means. The descriptor's interaction applies only to
  // unclustered features.
  if (spec.cluster && feature.properties.cluster) {
    const zoom = await map.getSource(source).getClusterExpansionZoom(feature.properties.cluster_id);
    map.easeTo({ center: feature.geometry.coordinates, zoom, duration: motion(700) });
    return;
  }
  runActions(interaction.do, { table: spec.records, key: feature.properties.key, feature });
}

const taps = [];
for (const interaction of interactions) {
  const source = targetSource(interaction.target);
  if (!source) throw new Error(`interaction target "${interaction.target}" is not a source`);

  if (interaction.on === 'click') taps.push({ interaction, source });
  else
    own.mapHandler(map, interaction.on, hitLayerId(source), async (event) => {
      const feature = nearest(event.features, event.point, source);
      if (feature) runTap(interaction, source, feature);
    });

  own.mapHandler(map, 'mouseenter', hitLayerId(source), () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  own.mapHandler(map, 'mouseleave', hitLayerId(source), () => {
    map.getCanvas().style.cursor = '';
  });
}

if (taps.length && !shell.tapsOwned)
  own.mapHandler(map, 'click', (event) => {
    const hits = [];
    for (const { interaction, source } of taps) {
      if (!map.getLayer(hitLayerId(source))) continue;
      const feature = nearest(map.queryRenderedFeatures(event.point, { layers: [hitLayerId(source)] }), event.point, source);
      if (feature) hits.push({ interaction, source, feature });
    }
    for (const { interaction, source, feature } of hits) runTap(interaction, source, feature);
  });

/*
|--------------------------------------------------------------------------
| PHOTO MARKERS
|
| A source may declare `photoMarker: { field }`: each of its features is then
| drawn as a round photo — the record's `field`, a value of type `photo` — at
| the feature's point, and tapping it runs the source's click interaction.
| The size, ring and shadow are the shell's, identical on every map; the
| selected one is larger with a dark ring, and the pulse sits behind it.
|
| DOM markers, not a symbol layer: a photo is an image with a ring and a
| shadow, which a symbol cannot draw. Each is made once and registered for
| teardown; a re-derive only shows, hides or restyles it.
|
| Two sites close together overlap at a wide zoom — Mahasthangarh and
| Paharpur on the janapada map. Both stay at their real sites; the selected
| one draws on top (shell CSS), and a tap on the overlap goes, as a tap on
| overlapping points does, to the site nearest the finger, not to whichever
| disc lies on top.
|--------------------------------------------------------------------------
*/

/*
 * By zoom (the user's decision, 2026-09-28): at the map's opening zoom and
 * below — up to the source's `zooms.dot` — a record is a small dot, in the
 * plain marker's colour with a white ring; zooming in it turns smoothly into
 * a round photo, PHOTO px at `zooms.photo`, growing to FULL px at
 * `zooms.full`. The selected one is always the round photo, SELECTED px,
 * above the rest. Every one keeps a round tap zone of at least TAP px. The
 * shell sets the size and the photo's opacity per source, as CSS variables
 * on the map, on every zoom; the ring, the shadow, the pulse, the collision
 * reserve and the names' offsets all follow the size.
 */
const MARKER = { dot: 10, photo: 24, full: 36, selected: 56, tap: 44 };

/** A photo marker's look at zoom z: its disc's size in px and its photo's opacity. */
function markerLook(z, { dot, photo, full }) {
  if (z <= dot) return { size: MARKER.dot, photo: 0 };
  if (z < photo) {
    const t = (z - dot) / (photo - dot);
    return { size: MARKER.dot + t * (MARKER.photo - MARKER.dot), photo: t };
  }
  const t = Math.min(1, (z - photo) / (full - photo));
  return { size: MARKER.photo + t * (MARKER.full - MARKER.photo), photo: 1 };
}

const photoVar = (name, what) => `--pm-${what}-${name}`;
function applyMarkerZoom() {
  const z = map.getZoom();
  const host = map.getCanvasContainer();
  for (const [name, { spec }] of photoMarkers) {
    const look = markerLook(z, spec.photoMarker.zooms);
    host.style.setProperty(photoVar(name, 'size'), look.size.toFixed(2));
    host.style.setProperty(photoVar(name, 'photo'), look.photo.toFixed(3));
  }
}

for (const [name, spec] of Object.entries(sourceSpecs)) {
  if (!spec.photoMarker) continue;
  const z = spec.photoMarker.zooms;
  if (!(z?.dot < z?.photo && z?.photo < z?.full)) throw new Error(`source "${name}": photoMarker declares no zooms { dot < photo < full }`);
  const click = interactions.find((i) => i.on === 'click' && targetSource(i.target) === name);
  photoMarkers.set(name, { spec, click, byKey: new Map() });
  syncPhotoMarkers(name, derive(name, spec));
}
if (photoMarkers.size) {
  applyMarkerZoom();
  own.mapHandler(map, 'zoom', applyMarkerZoom);
  own.undo('photo marker sizes', () => {
    for (const name of photoMarkers.keys()) for (const what of ['size', 'photo']) map.getCanvasContainer().style.removeProperty(photoVar(name, what));
  });
}

function syncPhotoMarkers(name, data) {
  const entry = photoMarkers.get(name);
  if (!entry) return;
  const { spec, byKey } = entry;
  const present = new Set();
  for (const feature of data.features) {
    const key = feature.properties.key;
    present.add(key);
    let m = byKey.get(key);
    if (!m) {
      const row = records[spec.records][key];
      const photo = row[spec.photoMarker.field];
      const element = own.node(document.createElement('button'), `photo marker ${key}`);
      element.type = 'button';
      // A record with no free photo is never left off the map: it gets the
      // plain dot the straits map gives a passage.
      element.className = photo ? 'photo-marker' : 'photo-marker plain';
      element.setAttribute('aria-label', valueOf(sheetFor(spec.records)?.title, row) ?? key);
      // The tap zone is the button; the disc inside it is what shows, sized by zoom.
      element.style.setProperty('--pm-size', `var(${photoVar(name, 'size')})`);
      element.style.setProperty('--pm-photo', `var(${photoVar(name, 'photo')})`);
      const disc = document.createElement('span');
      disc.className = 'photo-disc';
      element.appendChild(disc);
      if (photo) {
        const img = document.createElement('img');
        img.src = mapFile(photo.marker);
        img.alt = '';
        img.decoding = 'async';
        disc.appendChild(img);
      }
      own.domHandler(element, 'click', (event) => {
        event.stopPropagation();
        // A pointer's tap goes to the nearest site under it; a click with no
        // pointer (Enter or Space on the focused marker) is this marker's own.
        const hit = (event.detail && nearestPhoto(event.clientX, event.clientY)) || { entry, key };
        if (hit.entry.click) runActions(hit.entry.click.do, { table: hit.entry.spec.records, key: hit.key });
      });
      m = { instance: own.marker(new maplibregl.Marker({ element }), `photo ${key}`), element, shown: false };
      m.instance.setLngLat(feature.geometry.coordinates);
      byKey.set(key, m);
    }
    m.element.classList.toggle('selected', feature.properties.selected === true);
    if (!m.shown) {
      m.instance.addTo(map);
      m.shown = true;
    }
  }
  for (const [key, m] of byKey) {
    if (present.has(key) || !m.shown) continue;
    m.instance.remove();
    m.shown = false;
  }
}

/*
 * A photo marker is DOM, drawn above the canvas, so MapLibre places names
 * without seeing it and a name could land under another record's photo. Each
 * marker's circle is therefore reserved in MapLibre's collision index, by
 * invisible icons at the marker's point sized as the marker's disc is drawn
 * at each zoom, on the topmost layers so they are placed before any name.
 * Names then avoid a photo the way they avoid each other. The icons are always
 * placed (photos overlap one another, and each keeps its space) and never
 * drawn. They are not tap targets: nothing is bound to them, and a tap is
 * resolved on the hit layers and the markers themselves.
 *
 * The collision index holds boxes, not circles, so the circle is covered by
 * three centred rectangles, their corners at 35.3° and 54.7° round it: they
 * overreach it by at most 17% of the radius, where one square would by 41%
 * and turn away a name that sits beside a photo rather than under it.
 */
const PHOTO_SPACE = [
  // name, half-width and half-height as fractions of the radius
  ['wide', 1, Math.sqrt(1 / 3)],
  ['square', Math.sqrt(2 / 3), Math.sqrt(2 / 3)],
  ['tall', Math.sqrt(1 / 3), 1],
];
const PHOTO_SPACE_PX = 64; // the images' circle, in px; icon-size scales it to the marker's
const photoSpaceId = (part) => `photo-space-${part}`;
const photoSpaceLayerId = (source, part) => `${source}--photo-space-${part}`;

if (photoMarkers.size) {
  for (const [part, w, h] of PHOTO_SPACE) {
    // Rounded up, so the three still cover the whole circle.
    const width = Math.ceil(PHOTO_SPACE_PX * w);
    const height = Math.ceil(PHOTO_SPACE_PX * h);
    own.image(map, photoSpaceId(part), { width, height, data: new Uint8Array(width * height * 4) });
  }
  // A record with no photo keeps the plain dot, whatever the zoom, as the CSS draws it.
  const plainSize = { plain: markerSize('photo-marker plain'), plainSelected: markerSize('photo-marker plain selected') };
  for (const [name, { spec }] of photoMarkers) {
    const table = records[spec.records];
    const plain = Object.keys(table).filter((key) => !table[key][spec.photoMarker.field]);
    const byKind = (photo, dot) => (plain.length ? ['match', ['get', 'key'], plain, dot / PHOTO_SPACE_PX, photo / PHOTO_SPACE_PX] : photo / PHOTO_SPACE_PX);
    const at = (size) => ['case', ['==', ['get', 'selected'], true], byKind(MARKER.selected, plainSize.plainSelected), byKind(size, plainSize.plain)];
    const { dot, photo, full } = spec.photoMarker.zooms;
    for (const [part] of PHOTO_SPACE) {
      own.layer(map, {
        id: photoSpaceLayerId(name, part),
        type: 'symbol',
        source: name,
        layout: {
          'icon-image': photoSpaceId(part),
          'icon-size': ['interpolate', ['linear'], ['zoom'], dot, at(MARKER.dot), photo, at(MARKER.photo), full, at(MARKER.full)],
          'icon-allow-overlap': true,
          'icon-padding': 0,
        },
        paint: { 'icon-opacity': 0 },
      });
    }
  }
}

/** A photo marker's disc's width as the shell's CSS draws it, in px. */
function markerSize(className) {
  const probe = document.createElement('button');
  probe.className = className;
  probe.style.visibility = 'hidden';
  const disc = document.createElement('span');
  disc.className = 'photo-disc';
  probe.appendChild(disc);
  map.getCanvasContainer().appendChild(probe);
  try {
    return disc.offsetWidth;
  } finally {
    probe.remove();
  }
}

/** The shown photo marker whose tap zone holds this point and whose site is nearest it. */
function nearestPhoto(x, y) {
  let best = null;
  for (const entry of photoMarkers.values())
    for (const [key, m] of entry.byKey) {
      if (!m.shown) continue;
      const box = m.element.getBoundingClientRect();
      const distance = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
      if (distance <= box.width / 2 && distance < (best?.distance ?? Infinity)) best = { entry, key, distance };
    }
  return best;
}

/*
|--------------------------------------------------------------------------
| CONTROLS
|--------------------------------------------------------------------------
*/

const lookups = descriptor.lookups ?? {};
const lookupValue = (name, key, take) => lookups[name]?.[key]?.[take] ?? null;

const picker = (descriptor.controls ?? []).find((c) => c.type === 'picker');
const row = picker ? buildPicker(picker) : null;

/*
 * The picker row is shared with the diagram shell (../shared/picker.js): the
 * shown records, in author order under their groups, ‹ › stepping through
 * them, on one line at every width. The map keeps the
 * selection; the row reads it and runs the picker's actions on a choice.
 */
function buildPicker(control) {
  // `byTab` (org-members, 2026-10-06): the one picker lists a different table on
  // each view tab. Absent on every other map, which keeps the single `from`.
  const labelOf = (spec) => spec.label ?? (spec.labelField ? { field: spec.labelField } : null);
  const state = { from: control.from, label: labelOf(control), do: control.do, placeholder: control.placeholder };
  const apply = (spec) => {
    state.from = spec.from ?? control.from;
    state.label = labelOf(spec) ?? state.label;
    state.do = spec.do ?? control.do;
    if (spec.placeholder !== undefined) state.placeholder = spec.placeholder;
  };
  if (control.byTab) {
    for (const [tab, spec] of Object.entries(control.byTab)) if (!records[spec.from]) throw new Error(`picker byTab.${tab}: "${spec.from}" is not a records table`);
    const tab = shell.activeTab?.();
    if (tab && control.byTab[tab]) apply(control.byTab[tab]);
  }
  dom.picker.dataset.table = state.from;
  const group = control.groupBy;
  const itemsNow = () => {
    const table = records[state.from] ?? {};
    return Object.keys(table).map((key) => ({ key, label: valueOf(state.label, table[key]) ?? '', group: group ? table[key][group.field] : undefined }));
  };
  const built = pickerRow({
    select: dom.picker,
    prev: dom.prev,
    next: dom.next,
    placeholder: state.placeholder,
    label: control.labelEn,
    groups: group ? (group.order ?? []).map((value) => ({ value, label: lookupValue(group.lookup, value, group.take) ?? value })) : [],
    items: itemsNow(),
    shown: () => Object.keys(records[state.from] ?? {}).filter((key) => onMap(state.from, key)),
    current: () => selection.get(state.from),
    choose: (key) => runActions(state.do, { table: state.from, key }),
    listen: (element, type, handler) => own.domHandler(element, type, handler),
  });
  if (control.byTab) {
    shell.pickerForTab = (tab) => {
      const spec = control.byTab[tab];
      if (!spec) return;
      apply(spec);
      dom.picker.dataset.table = state.from;
      built.setItems(itemsNow(), state.placeholder);
    };
  }
  return built;
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

if (recordFilter) {
  if (toggle) throw new Error('a map declares both a layerToggle and a recordFilter; they share one corner');
  buildRecordFilter(recordFilter);
}

/**
 * The record filter's menu: the layerToggle's look and placement, a checkbox
 * per value. The values, their order and their labels are the picker's groups
 * on the same field, so the two can never list different things; a "select
 * all" row sits on top. Built here rather than in the page because it is the
 * map's, and everything it creates is registered for teardown.
 */
function buildRecordFilter(control) {
  const group = picker?.groupBy;
  if (!picker || picker.from !== control.records || group?.field !== control.field)
    throw new Error(`recordFilter on ${control.records}.${control.field} needs a picker grouped by that field`);
  const values = group.order ?? [];

  const wrapper = own.node(document.createElement('div'), 'record filter');
  wrapper.className = 'layers-control';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'layers-toggle-btn';
  button.lang = LANGUAGE;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'recordFilterMenu');
  button.textContent = `${control.label} ▾`;
  const menu = document.createElement('div');
  menu.id = 'recordFilterMenu';
  menu.className = 'layers-menu filter-menu';

  const row = (text, value) => {
    const label = document.createElement('label');
    label.className = 'layers-menu-item';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    if (value !== undefined) box.dataset.value = value;
    const span = document.createElement('span');
    span.lang = LANGUAGE;
    span.textContent = text;
    label.append(box, span);
    menu.appendChild(label);
    return box;
  };
  const all = row(control.allLabel);
  const boxes = values.map((v) => row(lookupValue(group.lookup, v, group.take) ?? v, v));

  wrapper.append(button, menu);
  dom.mapShell.appendChild(wrapper);

  own.domHandler(menu, 'change', (event) => {
    if (event.target === all) for (const box of boxes) box.checked = all.checked;
    filteredOut.clear();
    for (const box of boxes) if (!box.checked) filteredOut.add(box.dataset.value);
    all.checked = filteredOut.size === 0;
    all.indeterminate = filteredOut.size > 0 && filteredOut.size < boxes.length;
    applyFilter();
  });
  own.domHandler(button, 'click', (event) => {
    event.stopPropagation();
    const open = menu.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
  });
  own.domHandler(document, 'click', (event) => {
    if (!wrapper.contains(event.target)) {
      menu.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    }
  });
}

/**
 * After a filter change: a selection the filter now hides is cleared and its
 * card closed; every source is re-derived; the picker and ‹ › follow; a card
 * still open is refilled, since a city's list may have shrunk.
 */
function applyFilter() {
  reachable = null;
  for (const [table, key] of [...selection]) if (!onMap(table, key)) selection.delete(table);
  for (const [name, spec] of Object.entries(sourceSpecs)) rederive(name, spec);
  row?.render();
  row?.sync();
  const [current] = [...selection];
  if (!current) {
    marker?.instance.remove();
    if (hasSheet) setSheetOpen(false);
  } else if (sheetFor(current[0])) fillSheet(current[0], current[1]);
  changed('filter');
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

/*
 * `sheet` is the card for a map that selects from one table. `sheets` is the
 * same card keyed by records table, for a map where more than one table can
 * be selected — each table gets its own title and rows.
 */
// A declaration, not a const: photo markers are built, and name themselves
// from a card's title, before this point in module evaluation.
function sheetFor(table) {
  return (descriptor.sheets ? descriptor.sheets[table] : descriptor.sheet) ?? null;
}
const hasSheet = Boolean(descriptor.sheet || descriptor.sheets);

/*
 * A sheet may declare `photo: { field }`: the record's photo is shown at the
 * top of the card and its credit — author, licence, a link to its page — at
 * the bottom. One term draws both, so a card cannot show a photo without the
 * credit its licence requires.
 */
let sheetPhoto = null;
function photoParts() {
  if (sheetPhoto) return sheetPhoto;
  const img = own.node(document.createElement('img'), 'sheet photo');
  img.className = 'info-photo';
  img.alt = '';
  img.decoding = 'async';
  dom.sheetBody.insertBefore(img, dom.kicker);
  const credit = own.node(document.createElement('p'), 'sheet photo credit');
  credit.className = 'info-credit';
  dom.sheetBody.appendChild(credit);
  sheetPhoto = { img, credit };
  return sheetPhoto;
}

function fillPhoto(sheet, row) {
  const photo = sheet.photo ? row[sheet.photo.field] : null;
  if (!photo && !sheetPhoto) return;
  const { img, credit } = photoParts();
  img.hidden = credit.hidden = !photo;
  if (!photo) return;
  img.src = mapFile(photo.card);
  // External credit links open outside the WebView, and read as plain credit.
  const link = (href, text) => {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = text;
    return a;
  };
  // CC BY-SA asks the credit of a derivative to say what was changed.
  credit.replaceChildren(
    document.createTextNode(`Photo${photo.cropped ? ' (cropped)' : ''}: ${photo.author} · `),
    photo.licenceUrl ? link(photo.licenceUrl, photo.licence) : document.createTextNode(photo.licence),
    document.createTextNode(' · '),
    link(photo.page, 'Wikimedia Commons'),
  );
}

/*
 * A map may hold its card lower than the shell's 62% of the screen
 * (`sheetMaxHeight`, a share of the map's own height, 2026-10-05: the rivers
 * map's 0.4): the card's body scrolls inside the rest, and the camera, padded
 * for the card as it stands, frames the selection in the room above it. Every
 * other map's card is as before.
 */
const SHEET_MAX = descriptor.sheetMaxHeight;
if (SHEET_MAX !== undefined && !(typeof SHEET_MAX === 'number' && SHEET_MAX >= 0.2 && SHEET_MAX <= 0.62)) throw new Error(`sheetMaxHeight is a share of the map's height from 0.2 to 0.62, not ${SHEET_MAX}`);
function capSheet() {
  if (!SHEET_MAX || dom.sheet.hidden) return;
  dom.sheetBody.style.maxHeight = '';
  const chrome = dom.sheet.offsetHeight - dom.sheetBody.offsetHeight;
  dom.sheetBody.style.maxHeight = `${Math.max(64, Math.floor(SHEET_MAX * dom.mapShell.clientHeight) - chrome)}px`;
}
if (SHEET_MAX) own.undo('the card held low', () => (dom.sheetBody.style.maxHeight = ''));

function fillSheet(table, key) {
  fillSheetRows(table, key);
  capSheet();
}

function fillSheetRows(table, key) {
  const sheet = sheetFor(table);
  const row = records[table][key];
  dom.sheet.hidden = false;
  fillPhoto(sheet, row);
  // A chip — a record's theme — takes the kicker's line, drawn as a pill.
  const chip = valueOf(sheet.chip, row) ?? '';
  const kicker = chip || (valueOf(sheet.kicker, row) ?? '');
  dom.kicker.textContent = kicker;
  dom.kicker.hidden = kicker === '';
  dom.kicker.classList.toggle('info-chip', chip !== '');
  dom.sheetTitle.textContent = valueOf(sheet.title, row) ?? '';
  // A small grey line under the title; like a row, it hides when it has nothing to say.
  const subtitle = valueOf(sheet.subtitle, row) ?? '';
  dom.sheetSubtitle.textContent = subtitle;
  dom.sheetSubtitle.hidden = subtitle === '';

  dom.rows.replaceChildren();
  // `when` keeps a row to the records it applies to, in expectGeometry's field/value shape.
  const rows = (sheet.rows ?? []).map((spec, index) => ({ spec, index })).filter(({ spec }) => applies(spec.when, row));
  if (sheet.columns) {
    fillGrid(sheet.columns, rows, key, row);
    return;
  }
  for (const { spec, index } of rows) {
    const line = spec.referencedBy ? referencedByRow(spec, index, key) : valueRow(spec, row);
    if (line) dom.rows.appendChild(line);
  }
}

/**
 * A record's card as a standalone element: the sheet's title and its value
 * rows, as the sheet draws them — for a tab that lists cards in place of the
 * map (tabs.cardsOnly). A row that lists linked records is the sheet's alone.
 */
function cardElement(table, key) {
  const sheet = sheetFor(table);
  const row = records[table][key];
  const card = document.createElement('article');
  card.className = 'tab-card';
  card.dataset.key = key;
  const title = document.createElement('h3');
  title.className = 'tab-card-title';
  title.lang = LANGUAGE;
  title.textContent = valueOf(sheet.title, row) ?? '';
  card.append(title);
  for (const spec of (sheet.rows ?? []).filter((r) => !r.referencedBy && applies(r.when, row))) {
    const line = valueRow(spec, row);
    if (line) card.append(line);
  }
  return card;
}

/** A row of the card: its label and its value, or nothing where the value is null. */
function valueRow(spec, row) {
  const value = valueOf(spec, row);
  // A null value hides the row, uniformly, whichever mechanism produced it.
  if (value === null || value === undefined || value === '') return null;
  const line = document.createElement('div');
  // `stacked`: the value under its label, for a line of text rather than a fact.
  line.className = spec.stacked ? 'info-row info-row-stacked' : 'info-row';
  const label = document.createElement('span');
  label.className = 'info-label';
  label.lang = LANGUAGE;
  label.textContent = spec.label;
  const text = document.createElement('span');
  text.className = 'info-value';
  text.lang = LANGUAGE;
  text.textContent = value;
  line.append(label, text);
  return line;
}

/** `when: { field: value | [values] }` — every field named holds one of its values. */
function applies(when, row) {
  return !when || Object.entries(when).every(([field, values]) => (Array.isArray(values) ? values : [values]).includes(row[field]));
}

/*
 * A card in `columns` lays its rows out as cells of a grid, filled in order a
 * row of cells at a time. A cell that does not apply to the record — none of
 * the fields it reads, no linked record — is left out; one whose value is
 * null, unverified, keeps its place empty, so its neighbour stays in its own
 * column. A row of cells with nothing in it is dropped. Stacked rows run under
 * the grid and across it. A cell may declare `short`: the value it shows where
 * its own does not fit the cell's one line.
 */
function fillGrid(columns, rows, key, row) {
  const cells = [];
  for (const { spec, index } of rows) {
    if (spec.stacked) continue;
    const cell = gridCell(spec, index, key, row);
    if (cell !== undefined) cells.push(cell);
  }
  const grid = document.createElement('div');
  grid.className = 'info-grid';
  grid.style.setProperty('--columns', String(columns));
  for (let i = 0; i < cells.length; i += columns) {
    const line = cells.slice(i, i + columns);
    if (line.every((cell) => cell === null)) continue;
    for (const cell of line) grid.appendChild(cell ?? Object.assign(document.createElement('div'), { className: 'info-cell' }));
  }
  if (grid.children.length) dom.rows.appendChild(grid);
  for (const { spec } of rows) {
    if (!spec.stacked) continue;
    const line = valueRow(spec, row);
    if (line) dom.rows.appendChild(line);
  }
  fitCells();
}

/** A cell: its element; null for an empty place (the value unverified); undefined where it does not apply. */
function gridCell(spec, index, key, row) {
  let value;
  if (spec.referencedBy) {
    value = referencedByRow(spec, index, key)?.querySelector('.info-list');
    if (!value) return undefined;
    value.className = 'info-value info-list';
  } else {
    if (readsNothing(spec, row)) return undefined;
    const text = valueOf(spec, row);
    if (text === null || text === undefined || text === '') return null;
    value = document.createElement('span');
    value.className = 'info-value';
    value.lang = LANGUAGE;
    value.textContent = text;
    const short = spec.short ? valueOf(spec.short, row) : null;
    if (short !== null && short !== undefined && String(short) !== String(text)) {
      value.dataset.full = String(text);
      value.dataset.short = String(short);
    }
  }
  const cell = document.createElement('div');
  cell.className = 'info-cell';
  const label = document.createElement('span');
  label.className = 'info-label';
  label.lang = LANGUAGE;
  label.textContent = spec.label ?? '';
  cell.append(label, value);
  return cell;
}

/** Every field a value spec reads is absent from the record: it does not apply, rather than being unverified. */
function readsNothing(spec, row) {
  const fields =
    spec.field !== undefined
      ? [spec.field]
      : spec.of !== undefined
        ? [spec.of]
        : (spec.compose ?? []).flatMap((template) => [...template.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]));
  return fields.length > 0 && fields.every((field) => row[field] === undefined);
}

/** A value too long for its cell's one line takes its `short` form; measured again whenever the card is resized. */
function fitCells() {
  for (const value of dom.rows.querySelectorAll('.info-value[data-short]')) {
    value.textContent = value.dataset.full;
    value.classList.add('info-value-measuring');
    const over = value.scrollWidth > value.clientWidth + 0.5;
    value.classList.remove('info-value-measuring');
    if (over) value.textContent = value.dataset.short;
  }
}

/**
 * The reverse of a `refs` field: every record of `referencedBy.records` whose
 * `listField` lists this key, in that table's own order — the organisations a
 * city hosts, read off the organisations' own `cities` field. Same shape as
 * fromSelection, pointed the other way. Each is a button that runs the row's
 * `do` on that record. No record, no row: an empty list hides like a null.
 */
function referencedByRow(spec, index, key) {
  const { records: from, listField } = spec.referencedBy;
  const table = records[from] ?? {};
  const keys = Object.keys(table).filter((k) => (table[k][listField] ?? []).includes(key) && shown(from, k));
  if (!keys.length) return null;
  const line = document.createElement('div');
  line.className = spec.stacked ? 'info-row info-row-list info-row-stacked' : 'info-row info-row-list';
  if (spec.label) {
    const label = document.createElement('span');
    label.className = 'info-label';
    label.lang = LANGUAGE;
    label.textContent = spec.label;
    line.appendChild(label);
  }
  const list = document.createElement('ul');
  list.className = 'info-list';
  for (const k of keys) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'info-link';
    button.lang = LANGUAGE;
    button.dataset.row = String(index);
    button.dataset.key = k;
    button.textContent = valueOf(spec.item, table[k]) ?? '';
    item.appendChild(button);
    list.appendChild(item);
  }
  line.appendChild(list);
  return line;
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
// The card floats over the map on every map but one whose layout docks it
// beside the map (the timeline's): a docked card covers nothing, so the camera
// is not padded for it, and it is not dragged.
function sheetFloats() {
  return getComputedStyle(dom.sheet).position === 'absolute';
}
const closedOffset = () => (selection.size ? Math.max(0, sheetHeight() - HANDLE_HEIGHT) : sheetHeight());
const applySheetOffset = (offset) => {
  sheetOffset = offset;
  dom.sheet.style.setProperty('--sheet-offset', `${offset}px`);
  boundUnderCard();
};

/*
 * Bounds under the card. MapLibre keeps the whole canvas inside maxBounds,
 * card or no card, so on a bounded map an area near the box's edge could not
 * be lifted above the open card, and zooming out far enough to show it was
 * refused. While the card spans the map, the box's south edge gives way by
 * exactly the height the card covers: only what lies under the card may go
 * past the box, and everything the student sees stays inside it. When the card
 * closes, the camera eases back inside the box with it and the normal bounds
 * return. Like MapLibre's own bound, this takes the screen as unrotated. A map
 * without maxBounds never reaches any of it.
 */
let maxBox = maxBounds ? map.getMaxBounds() : null;
const boundsUnderCard = Boolean(maxBox) && maxBox.getWest() < maxBox.getEast();
let cardCovers = 0;
let boundsToRelease = false;
const mercatorX = (lng) => (180 + lng) / 360;
const mercatorY = (lat) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

/** The camera nearest this one whose view, less `covered` px at the bottom, lies inside the box. */
function insideBox(center, zoom, covered) {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const [w, e] = [mercatorX(maxBox.getWest()), mercatorX(maxBox.getEast())];
  const [n, s] = [mercatorY(maxBox.getNorth()), mercatorY(maxBox.getSouth())];
  // Zoomed in, if need be, until the box is as wide as the view and as tall as
  // the part above the card — about the middle of that part, where a record's
  // frame is fitted, so the frame stays in view.
  const z = Math.max(
    Math.min(Math.max(zoom, map.getMinZoom()), map.getMaxZoom()),
    Math.log2(width / ((e - w) * 512)),
    Math.log2(Math.max(1, height - covered) / ((s - n) * 512)),
  );
  const size = 512 * 2 ** z;
  const middle = mercatorY(center.lat) - covered / 2 / (512 * 2 ** zoom);
  const x = Math.min(Math.max(mercatorX(center.lng) * size, w * size + width / 2), e * size - width / 2) / size;
  const y = Math.min(Math.max(middle * size + covered / 2, n * size + height / 2), s * size + covered - height / 2) / size;
  return { center: new maplibregl.LngLat(x * 360 - 180, (360 / Math.PI) * Math.atan(Math.exp(((180 - y * 360) * Math.PI) / 180)) - 90), zoom: z };
}

function boundUnderCard() {
  if (!boundsUnderCard) return;
  // The card's own height to the fraction of a pixel: offsetHeight rounds it.
  const covered = sheetOpen && dom.sheet.offsetWidth >= map.getContainer().clientWidth ? Math.max(0, dom.sheet.getBoundingClientRect().height - sheetOffset) : 0;
  if (covered === cardCovers) return;
  cardCovers = covered;
  if (covered) {
    boundsToRelease = false;
    map.setTransformConstrain((center, zoom) => insideBox(center, zoom, covered));
    return;
  }
  const to = insideBox(map.getCenter(), map.getZoom(), 0);
  const here = map.getCenter();
  if (Math.abs(to.zoom - map.getZoom()) < 1e-9 && Math.abs(to.center.lng - here.lng) < 1e-9 && Math.abs(to.center.lat - here.lat) < 1e-9) {
    map.setTransformConstrain(null);
    return;
  }
  // Back inside the box as the card slides away; MapLibre's own bounds once there.
  boundsToRelease = true;
  map.easeTo({ center: to.center, zoom: to.zoom, duration: motion(280), essential: true });
}
/*
 * A module's own pan limit for the moment — a view tab's (`views.<tab>.maxBounds`,
 * the tabs module, 2026-10-05) — or, given null, the map's own again. The
 * bounds under the card follow it: the card's rule is the same, the box is
 * the one in force.
 */
function setBound(box) {
  if (!maxBox) throw new Error('a pan limit of its own needs the map to have one: constraints.maxBounds');
  map.setMaxBounds(box ?? maxBounds);
  maxBox = map.getMaxBounds();
  cardCovers = -1;
  boundUnderCard();
}
if (boundsUnderCard) {
  own.mapHandler(map, 'moveend', () => {
    if (!boundsToRelease || cardCovers) return;
    boundsToRelease = false;
    map.setTransformConstrain(null);
  });
  remember('constrain', 'bounds under the card', () => map.setTransformConstrain(null));
}

/*
 * `constraints.wholeWorld: true` (opt-in, 2026-10-07): the map may zoom out until a frame as wide as the
 * world fits a phone held upright. MapLibre otherwise keeps the world at least as tall as the map, which
 * on a portrait screen shows little more than half its width at any zoom; here the sea fills the room
 * above and below instead. Only the latitude of the centre and the zoom limits are held. For a map with
 * no maxBounds (whose own bounds the card logic above keeps). org-members' world-wide organisations.
 */
if (descriptor.constraints?.wholeWorld !== undefined && typeof descriptor.constraints.wholeWorld !== 'boolean') throw new Error('constraints.wholeWorld is true or false');
if (descriptor.constraints?.wholeWorld) {
  if (maxBox) throw new Error('constraints.wholeWorld is for a map without maxBounds');
  map.setTransformConstrain((center, zoom) => ({ center: new maplibregl.LngLat(center.lng, Math.max(-85, Math.min(85, center.lat))), zoom: Math.min(Math.max(zoom, map.getMinZoom()), map.getMaxZoom()) }));
  remember('constrain', 'the whole world', () => map.setTransformConstrain(null));
}

function setSheetOpen(open) {
  sheetOpen = open && selection.size > 0;
  dom.sheet.inert = selection.size === 0;
  dom.sheetHandle.setAttribute('aria-expanded', String(sheetOpen));
  dom.sheetHandle.setAttribute('aria-label', sheetOpen ? 'Hide details' : 'Show details');
  dom.sheetBody.inert = !sheetOpen;
  applySheetOffset(sheetOpen ? 0 : closedOffset());
}

if (hasSheet) {
  // One handler for every list button, however often the rows are rebuilt:
  // a handler per button would grow the teardown registry on every fill.
  own.domHandler(dom.rows, 'click', (event) => {
    const button = event.target.closest('.info-link');
    if (!button) return;
    const table = [...selection.keys()][0];
    const spec = sheetFor(table)?.rows?.[Number(button.dataset.row)];
    if (spec?.referencedBy) runActions(spec.do, { table: spec.referencedBy.records, key: button.dataset.key });
  });

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
    if (event.button !== 0 || selection.size === 0 || !sheetFloats()) return;
    // A list or card long enough to scroll scrolls; it does not drag the
    // sheet. The handle always drags.
    for (const scroller of [event.target.closest('.info-list'), event.target.closest('.info-sheet-body')])
      if (scroller && scroller.scrollHeight > scroller.clientHeight) return;
    drag = { id: event.pointerId, startY: event.clientY, startOffset: sheetOffset, lastY: event.clientY, lastT: event.timeStamp, velocity: 0, moved: false };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  });
  // The built map leaks this observer. Here it is owned like everything else.
  own.observer(
    new ResizeObserver(() => {
      applySheetOffset(sheetOpen ? 0 : closedOffset());
      // A card resized — shown, or turned — measures its cells again.
      fitCells();
    }),
    dom.sheet,
  );
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

// The compass where the map can turn, the tilt button where it can tilt — on
// every map but a globe, which a module holds north-up and upright.
if (map.dragRotate.isEnabled()) map.addControl(new maplibregl.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: false }), 'top-right');
if (map.getMaxPitch() > 0) map.addControl(new TiltControl(), 'top-right');
/*
 * ⓘ — MapLibre's own compact attribution, its credits gathered from the
 * sources as ever, but mounted in a row of its own directly above the map:
 * under the picker row, or under the tabs where a map has them, right-aligned
 * (the user's decision, 2026-09-28). Small and faint until pressed or
 * focused, its tap zone an invisible 44 px, so it covers no label on the map
 * and no card.
 */
const attribution = new maplibregl.AttributionControl({
  compact: true,
  customAttribution: [
    '<a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre</a>',
    `<a href="${resolver.url('glyphs', 'noto-sans-bengali/OFL.txt')}" target="_blank" rel="noopener noreferrer">Noto Sans Bengali</a>`,
    ...(descriptor.attribution?.extra ?? []),
  ],
});
const infoRow = own.node(document.createElement('div'), 'the credits row');
infoRow.className = 'info-credits'; // not info-row: the card's rows are
infoRow.append(attribution.onAdd(map));
dom.mapShell.before(infoRow);
own.undo('the credits', () => attribution.onRemove());
// The compact control opens expanded; it starts collapsed here.
infoRow.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
infoRow.querySelector('.maplibregl-ctrl-attrib')?.removeAttribute('open');

// The shell adds the basemap, so it is the only thing that can tell a basemap
// failure from an overlay one. The copy is generic Bengali; a descriptor never
// writes it.
const basemapSourceIds = new Set([...Object.values(BASEMAP_SOURCES), ...Object.keys(style.sources).filter((id) => style.sources[id].type === 'vector')]);
own.mapHandler(map, 'error', (event) => {
  console.error('Map error:', event?.error);
  if (event && basemapSourceIds.has(event.sourceId)) dom.loadNotice.classList.add('visible');
});

own.domHandler(window, 'resize', () => {
  map.resize();
  capSheet();
});

if (hasSheet) setSheetOpen(false);

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
    const extraImages = map.listImages().filter((id) => !pristine.images.includes(id));
    if (extraLayers.length) problems.push(`layers left behind: ${extraLayers.join(', ')}`);
    if (extraSources.length) problems.push(`sources left behind: ${extraSources.join(', ')}`);
    if (extraImages.length) problems.push(`images left behind: ${extraImages.join(', ')}`);
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

// Shell modules, once everything they may reach is built. `archive` opens a
// PMTiles archive through the resolver on the shell's own protocol — a map's
// imagery — and `geometry` hands out a source's geometry file as loaded.
Object.assign(shell, {
  map,
  // MapLibre itself, for a module that places HTML markers (indices).
  maplibregl,
  runActions,
  refilter: applyFilter,
  deselect: clearSelection,
  bound: setBound,
  onChange: (listener) => changeListeners.push(listener),
  tapTargets,
  archive: (path, kind) => {
    const source = resolver.pmtilesSource(path, kind);
    const opened = new window.pmtiles.PMTiles(source.archive);
    protocol.add(opened);
    return { ...source, header: () => opened.getHeader() };
  },
  geometry: (name) => geometryFiles[name] ?? null,
});
for (const module of modules) module.install?.(shell);

// Opening on one record's card (org-members, 2026-10-06): the picker stays on
// its own table, so it shows its prompt while this card is open.
if (descriptor.openOn) {
  const { records: table, key } = descriptor.openOn;
  if (!records[table]?.[key]) throw new Error(`openOn: ${table}.${key} is not a record`);
  doSelect({ table, key });
}

// The only surface the shell exposes, for the harness and for switchMap later.
window.__shell = {
  map,
  teardown,
  assertNoLeaks,
  registrySize: () => registry.length,
  descriptor,
  // For the harness on a focus map (tools/check.mjs): every key a source can draw, whatever is hidden now,
  // the records, and a way back to nothing selected.
  records,
  keysOf: (source) => [...new Set((deriveAll(source, sourceSpecs[source]).features ?? []).map((f) => f.properties?.key).filter((k) => k !== undefined))],
  deselect: clearSelection,
  // Drawn on the map now: shown, and hidden by no module (a focus map's rest set, a tab's).
  drawn: (table, key) => shell.drawn(table, key),
};
