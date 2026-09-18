// One-off: saves a dated snapshot of each canal's navigation line from
// OpenStreetMap into tools/sources/osm-canals.geojson. Like the lane snapshot,
// the build reads the committed file and never the live API.
//
// Each canal has one explicit selector, found by probing OSM (2026-09-18):
// the named main line, not every irrigation or side canal in the area. The
// Soo is special: OSM maps the Soo Locks as St. Marys River segments tagged
// lock=yes (Poe and MacArthur locks), so those are what is drawn.
//
// Data © OpenStreetMap contributors, ODbL 1.0 — the extract stays under ODbL.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve('..');
const OUT = path.join(ROOT, 'tools', 'sources', 'osm-canals.geojson');
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const SELECTORS = {
  suez: 'way[waterway=canal]["name:en"="Suez Canal"](29.8,32.1,31.4,32.7);',
  panama: 'way[waterway=canal]["name:en"="Panama Canal"](8.8,-80.1,9.5,-79.4);',
  kiel: 'way[waterway=canal]["name:en"="Kiel Canal"](53.8,9.0,54.5,10.3);',
  corinth: 'way[waterway=canal]["name:en"="Corinth Canal"](37.85,22.9,38.0,23.1);',
  soo: 'way[waterway][lock=yes](46.49,-84.38,46.52,-84.32);',
  welland: 'way[waterway=canal][name="Welland Canal"](42.8,-79.35,43.3,-79.1);',
  grandCanal: 'way[waterway=canal][~"^name(:en)?$"~"Grand Canal|京杭"](29.9,115.5,40.1,121.0);',
};

// Public Overpass servers fail often; try each, then wait and go round again.
async function overpass(query) {
  for (let round = 0; round < 3; round++) {
    if (round) await new Promise((r) => setTimeout(r, 30_000));
    try {
      return await overpassOnce(query);
    } catch {}
  }
  throw new Error('every Overpass endpoint failed, three times');
}

async function overpassOnce(query) {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'GeoQuest-map-build/1.0 (educational maps)', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(180_000),
      });
      const text = await res.text();
      if (res.ok && text.startsWith('{')) return { json: JSON.parse(text), url };
    } catch {}
  }
  throw new Error('every Overpass endpoint failed');
}

const round = (v) => Math.round(v * 1e5) / 1e5;
const km = (c) => c.slice(1).reduce((d, b, i) => {
  const a = c[i];
  return d + Math.hypot((b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180), b[1] - a[1]) * 111.32;
}, 0);

const features = [];
for (const [canal, selector] of Object.entries(SELECTORS)) {
  const { json, url } = await overpass(`[out:json][timeout:170];${selector}out tags geom;`);
  if (!json.elements.length) throw new Error(`${canal}: selector matched nothing — OSM changed; re-probe`);
  let total = 0;
  for (const way of json.elements) {
    const coords = way.geometry.map((p) => [round(p.lon), round(p.lat)]);
    total += km(coords);
    features.push({ type: 'Feature', properties: { canal, osm_id: way.id }, geometry: { type: 'LineString', coordinates: coords } });
  }
  console.log(`${canal.padEnd(11)} ${String(json.elements.length).padStart(4)} ways ${total.toFixed(1).padStart(8)} km  (${url.replace('https://', '')})`);
}

const body = JSON.stringify({
  type: 'FeatureCollection',
  properties: {
    source: 'OpenStreetMap, each canal\'s navigation line (selectors in tools/extract-osm-canals.mjs)',
    fetched: new Date().toISOString().slice(0, 10),
    licence: 'ODbL 1.0 — © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)',
  },
  features,
}) + '\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body);
console.log(`\n${features.length} ways → ${path.relative(ROOT, OUT)} (${(body.length / 1024).toFixed(1)} KB)`);
console.log('sha256', crypto.createHash('sha256').update(body).digest('hex'));
