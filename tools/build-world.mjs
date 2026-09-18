// Builds shared/tiles/world.pmtiles from the pinned Natural Earth sources.
import fs from 'node:fs';
import path from 'node:path';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import mapshaper from 'mapshaper';
import { writeArchive } from './lib/pmtiles-writer.mjs';
import { readSource, prepare, bangladeshLineClass, featureCollection, bboxPolygon } from './lib/geo.mjs';
import { WORLD_MAX_ZOOM, DETAIL_MIN_ZOOM, DETAIL_MAX_ZOOM, DETAIL_AREAS } from './world.config.mjs';

const OUT = path.resolve('..', 'shared', 'tiles', 'world.pmtiles');
const VT_OPTIONS = { extent: 4096, buffer: 64, tolerance: 3, indexMaxPoints: 0 };

const lineProps = (p) => ({ class: bangladeshLineClass(p) });
const isBdLine = (p) => bangladeshLineClass(p) !== null;

// ---- World layers (1:50m) ----
const world = {
  land: prepare(readSource('ne_50m_land.geojson'), () => ({})),
  borders: prepare(readSource('ne_50m_admin_0_boundary_lines_land.geojson'), lineProps, isBdLine),
  disputed: prepare(readSource('ne_50m_admin_0_boundary_lines_disputed_areas.geojson'), lineProps, isBdLine),
  // Label points come from the Bangladesh-POV countries file: one point per
  // country at Natural Earth's own label position, Bengali name included.
  country_labels: featureCollection(
    readSource('ne_10m_admin_0_countries_bdg.geojson').features.map((f) => ({
      type: 'Feature',
      properties: {
        name_bn: f.properties.NAME_BN,
        name_en: f.properties.NAME_EN,
        min_zoom: f.properties.MIN_LABEL,
      },
      geometry: { type: 'Point', coordinates: [f.properties.LABEL_X, f.properties.LABEL_Y] },
    })),
  ),
};

// ---- Detail layers (1:10m), clipped to the detail boxes ----
async function clip(fc, bbox) {
  const out = await mapshaper.applyCommands(`-i in.json -clip bbox=${bbox.join(',')} -o out.json format=geojson geojson-type=FeatureCollection`, { 'in.json': fc });
  return JSON.parse(out["out.json"].toString()).features;
}
const land10 = prepare(readSource('ne_10m_land.geojson'), () => ({}));
const borders10 = prepare(readSource('ne_10m_admin_0_boundary_lines_land.geojson'), lineProps, isBdLine);
const disputed10 = prepare(readSource('ne_10m_admin_0_boundary_lines_disputed_areas.geojson'), lineProps, isBdLine);
const detail = { detail_extent: [], land: [], borders: [], disputed: [] };
for (const [name, bbox] of Object.entries(DETAIL_AREAS)) {
  detail.detail_extent.push({ ...bboxPolygon(bbox), properties: { area: name } });
  detail.land.push(...(await clip(land10, bbox)));
  detail.borders.push(...(await clip(borders10, bbox)));
  detail.disputed.push(...(await clip(disputed10, bbox)));
}
for (const k of Object.keys(detail)) detail[k] = prepare(featureCollection(detail[k]), (p) => p);

// ---- Tiling ----
const tiles = [];
const perZoom = {};
function emit(indexes, z, x, y) {
  const layers = {};
  for (const [name, index] of Object.entries(indexes)) {
    const t = index.getTile(z, x, y);
    if (t && t.features.length) layers[name] = t;
  }
  if (!Object.keys(layers).length) return;
  const data = Buffer.from(vtpbf.fromGeojsonVt(layers, { version: 2 }));
  tiles.push({ z, x, y, data });
  perZoom[z] = (perZoom[z] || 0) + 1;
}

const worldIdx = Object.fromEntries(Object.entries(world).map(([k, fc]) =>
  [k, geojsonvt(fc, { ...VT_OPTIONS, maxZoom: WORLD_MAX_ZOOM, indexMaxZoom: WORLD_MAX_ZOOM })]));
for (let z = 0; z <= WORLD_MAX_ZOOM; z++)
  for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) emit(worldIdx, z, x, y);

const detailIdx = Object.fromEntries(Object.entries(detail).map(([k, fc]) =>
  [k, geojsonvt(fc, { ...VT_OPTIONS, maxZoom: DETAIL_MAX_ZOOM, indexMaxZoom: 4 })]));
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
const done = new Set();
for (const [w, s, e, n] of Object.values(DETAIL_AREAS))
  for (let z = DETAIL_MIN_ZOOM; z <= DETAIL_MAX_ZOOM; z++)
    for (let x = lon2x(w, z); x <= lon2x(e, z); x++)
      for (let y = lat2y(n, z); y <= lat2y(s, z); y++) {
        const key = `${z}/${x}/${y}`;
        if (done.has(key)) continue;
        done.add(key);
        emit(detailIdx, z, x, y);
      }

// ---- Write ----
const fields = (fc) => Object.fromEntries(Object.keys(fc.features[0]?.properties || {}).map((k) => [k, 'String']));
const metadata = {
  name: 'GeoQuest world',
  description: 'Shared world basemap for GeoQuest maps. z0–6 Natural Earth 1:50m; z7–10 Natural Earth 1:10m inside detail areas only.',
  attribution: 'Natural Earth v5.1.2 (public domain), Bangladesh point of view',
  vector_layers: [
    ...Object.entries(world).map(([id, fc]) => ({ id, fields: fields(fc), minzoom: 0, maxzoom: WORLD_MAX_ZOOM })),
    { id: 'detail_extent', fields: { area: 'String' }, minzoom: DETAIL_MIN_ZOOM, maxzoom: DETAIL_MAX_ZOOM },
  ],
  geoquest: { detailAreas: DETAIL_AREAS, worldMaxZoom: WORLD_MAX_ZOOM, detailMinZoom: DETAIL_MIN_ZOOM, detailMaxZoom: DETAIL_MAX_ZOOM },
};
const { buffer, stats } = writeArchive(tiles, metadata, {
  minZoom: 0, maxZoom: DETAIL_MAX_ZOOM, bounds: [-180, -85.05, 180, 85.05], center: [60, 25, 2],
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buffer);
console.log(`world.pmtiles: ${(buffer.length / 1024).toFixed(0)} KB, ${stats.tiles} tiles (${stats.unique} unique), root directory ${stats.rootBytes} B`);
console.log('tiles per zoom:', Object.entries(perZoom).map(([z, n]) => `z${z}:${n}`).join(' '));
