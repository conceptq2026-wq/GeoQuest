// One-off: saves a dated snapshot of OpenStreetMap's traffic-separation
// schemes (the official IMO shipping lanes) around each strait into
// tools/sources/osm-tss.geojson. The build reads that committed file and never
// the live API, so a rebuild can't change silently when OSM changes.
//
// Re-run only on purpose (e.g. when OSM gains a scheme we lack), then review
// the diff and update the checksum in sources.json.
//
// Data © OpenStreetMap contributors, ODbL 1.0 — the extract stays under ODbL.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve('..');
// The straits map's folder, relative to the repo root. Change here if the map moves.
const STRAITS_DIR = path.join(ROOT, 'docs/international/straits');
const OUT = path.join(ROOT, 'tools', 'sources', 'osm-tss.geojson');
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const { PASSAGES } = await import(pathToFileURL(path.join(STRAITS_DIR, 'data.js')).href);

async function overpass(query) {
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
const features = [];
const seen = new Set();
// Canals are drawn from their own line (extract-osm-canals.mjs), not a scheme.
const STRAITS = Object.entries(PASSAGES).filter(([, p]) => p.kind === 'strait');
for (const [key, strait] of STRAITS) {
  const [w, s, e, n] = strait.frame;
  const { json, url } = await overpass(`[out:json][timeout:170];way["seamark:type"~"^separation_"](${s},${w},${n},${e});out tags geom;`);
  let added = 0;
  for (const way of json.elements) {
    if (seen.has(way.id)) continue; // a way can fall inside two frames
    seen.add(way.id);
    const coords = way.geometry.map((p) => [round(p.lon), round(p.lat)]);
    const closed = coords.length > 3 && coords[0][0] === coords.at(-1)[0] && coords[0][1] === coords.at(-1)[1];
    const type = way.tags['seamark:type'];
    features.push({
      type: 'Feature',
      properties: { osm_id: way.id, seamark: type },
      geometry: type === 'separation_zone' && closed ? { type: 'Polygon', coordinates: [coords] } : { type: 'LineString', coordinates: coords },
    });
    added++;
  }
  console.log(`${key.padEnd(12)} ${String(added).padStart(3)} ways  (${url.replace('https://', '')})`);
}

const out = {
  type: 'FeatureCollection',
  properties: {
    source: 'OpenStreetMap, ways tagged seamark:type=separation_*',
    fetched: new Date().toISOString().slice(0, 10),
    licence: 'ODbL 1.0 — © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)',
  },
  features,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const body = JSON.stringify(out) + '\n';
fs.writeFileSync(OUT, body);
console.log(`\n${features.length} ways → ${path.relative(ROOT, OUT)} (${(body.length / 1024).toFixed(1)} KB)`);
console.log('sha256', crypto.createHash('sha256').update(body).digest('hex'));
