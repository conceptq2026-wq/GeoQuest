// One-off: saves a dated snapshot of the two border lines OpenStreetMap
// actually carries as geometry into tools/sources/osm-border-lines.geojson.
// The build reads that committed file and never the live API, so a rebuild
// cannot change silently when OSM changes.
//
// Re-run only on purpose, then review the diff and update the checksum in
// sources.json.
//
// Data © OpenStreetMap contributors, ODbL 1.0 — the extract stays under ODbL.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where committed third-party extracts live. Change here if it moves.
const OUT = path.join(ROOT, 'tools', 'sources', 'osm-border-lines.geojson');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/*
 * THE QUERIES, recorded here and in sources.json so the extract can be
 * reproduced and argued with.
 *
 * northernLimitLine: OSM maps it as a national maritime boundary, so the name
 * is enough to select it — but ONE way sharing the name is a different
 * Armistice feature, the Han estuary neutral zone, and it gives itself away
 * with left:country=Demarcation Zone rather than North Korea. Excluded by id
 * rather than by filter, so the exclusion is visible and reviewable.
 *
 * siegfriedLine: the relation is a `collection`, and the line-shaped members
 * are the surviving dragon's teeth, tagged barrier=tank_trap. Bunkers and
 * other point-like members are not geometry for a line.
 */
export const QUERIES = {
  northernLimitLine: '[out:json][timeout:180];way["name"="북방한계선"];out tags geom;',
  siegfriedLine: '[out:json][timeout:180];rel(1629004);way(r)["barrier"="tank_trap"];out tags geom;',
};
// Same name, different feature. See above.
export const EXCLUDE_WAYS = new Set([979904704]);

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
      console.log(`   (${new URL(url).host} -> HTTP ${res.status})`);
    } catch (error) {
      console.log(`   (${new URL(url).host} -> ${error.cause?.code ?? error.name})`);
    }
  }
  throw new Error('every Overpass endpoint failed');
}

const features = [];
for (const [id, query] of Object.entries(QUERIES)) {
  const { json, url } = await overpass(query);
  const ways = (json.elements ?? []).filter((e) => e.type === 'way' && e.geometry);
  let kept = 0;
  for (const way of ways) {
    if (EXCLUDE_WAYS.has(way.id)) {
      console.log(`  ${id}: excluding way/${way.id} (${way.tags?.['left:country'] ?? 'no left:country'})`);
      continue;
    }
    features.push({
      type: 'Feature',
      properties: {
        id,
        osmWay: way.id,
        // Kept so the extract can be checked against the tagging the query
        // relied on, without going back to the API.
        tags: Object.fromEntries(Object.entries(way.tags ?? {}).filter(([k]) => !k.startsWith('name:') || k === 'name:en')),
      },
      geometry: { type: 'LineString', coordinates: way.geometry.map((p) => [Number(p.lon.toFixed(5)), Number(p.lat.toFixed(5))]) },
    });
    kept++;
  }
  console.log(`  ${id}: ${kept} way(s) from ${new URL(url).host}`);
  await new Promise((r) => setTimeout(r, 3000));
}

const collection = {
  type: 'FeatureCollection',
  properties: {
    licence: 'ODbL 1.0 — © OpenStreetMap contributors',
    fetched: new Date().toISOString().slice(0, 10),
    queries: QUERIES,
    excludedWays: [...EXCLUDE_WAYS],
  },
  features,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const text = JSON.stringify(collection, null, 0) + '\n';
fs.writeFileSync(OUT, text);
const sha = crypto.createHash('sha256').update(text).digest('hex');

console.log(`\nwrote tools/sources/osm-border-lines.geojson — ${features.length} feature(s), ${(text.length / 1024).toFixed(1)} KB`);
console.log(`sha256: ${sha}`);
console.log('\nPut that checksum in tools/sources.json under osmBorderLines.');
