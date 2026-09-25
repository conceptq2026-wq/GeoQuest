// One-off: saves a dated snapshot of the OpenStreetMap place nodes for the
// headquarters towns too small for Natural Earth's populated places, into
// tools/sources/osm-places.geojson. The build reads that committed file and
// never the live API, so a rebuild cannot change silently when OSM changes.
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
const OUT = path.join(ROOT, 'tools', 'sources', 'osm-places.geojson');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/*
 * Every place is found by name INSIDE a tight box and only as a `place=*`
 * node — never by bare name. Several of these names exist elsewhere (there is
 * a Langley in British Columbia and in England, a Gland in Poland), and a bare
 * search is how a road in Ontario once passed for the Wallace Line.
 *
 * key: `${cityEn}|${iso3}`, matching the seed. bbox: [south, west, north, east].
 */
export const PLACES = {
  'Gland|CHE': { name: 'Gland', bbox: [46.38, 6.22, 46.46, 6.32] },
  'Nyon|CHE': { name: 'Nyon', bbox: [46.35, 6.2, 46.42, 6.28] },
  'Cologny|CHE': { name: 'Cologny', bbox: [46.2, 6.16, 46.24, 6.21] },
  // Anchored at both ends: the box also holds "Ébène Cybercity", the business
  // park inside the town, and the seed names the town.
  'Ebene|MUS': { name: '^[EÉ]b[eè]ne$', bbox: [-20.3, 57.45, -20.2, 57.53] },
  'Langley, Virginia|USA': { name: 'Langley', bbox: [38.9, -77.22, 39.0, -77.1] },
  'Fort Meade, Maryland|USA': { name: 'Fort Meade', bbox: [39.05, -76.8, 39.15, -76.68] },
};

async function overpass(query) {
  // Public Overpass mirrors return 504 under load; a few rounds with a pause
  // clears it far more often than a single pass does.
  for (let round = 1; round <= 4; round++) {
    try {
      return await overpassOnce(query);
    } catch (error) {
      if (round === 4) throw error;
      console.log(`   round ${round} failed on every mirror; waiting ${round * 10}s`);
      await new Promise((r) => setTimeout(r, round * 10_000));
    }
  }
}

async function overpassOnce(query) {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'GeoQuest-map-build/1.0 (educational maps)', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text();
      if (res.ok && text.startsWith('{')) return JSON.parse(text);
      console.log(`   (${new URL(url).host} -> HTTP ${res.status})`);
    } catch (error) {
      console.log(`   (${new URL(url).host} -> ${error.cause?.code ?? error.name})`);
    }
  }
  throw new Error('every Overpass endpoint failed');
}

const queries = {};
const features = [];
const problems = [];
for (const [key, { name, bbox }] of Object.entries(PLACES)) {
  const exact = !/[\^\[]/.test(name);
  const filter = exact ? `["name"="${name}"]` : `["name"~"${name}"]`;
  const query = `[out:json][timeout:60];node["place"]${filter}(${bbox.join(',')});out body;`;
  queries[key] = query;
  const json = await overpass(query);
  const nodes = json.elements ?? [];
  if (nodes.length !== 1) {
    problems.push(`${key}: ${nodes.length} place node(s) in its box — ${nodes.map((n) => `${n.tags?.name} (${n.tags?.place})`).join(', ') || 'none'}`);
  }
  for (const node of nodes) {
    features.push({
      type: 'Feature',
      properties: { key, osmNode: node.id, name: node.tags?.name, place: node.tags?.place },
      geometry: { type: 'Point', coordinates: [Number(node.lon.toFixed(5)), Number(node.lat.toFixed(5))] },
    });
    console.log(`  ${key.padEnd(26)} node/${node.id}  ${node.tags?.name} (${node.tags?.place})  ${node.lat.toFixed(4)}, ${node.lon.toFixed(4)}`);
  }
  await new Promise((r) => setTimeout(r, 2500));
}

if (problems.length) {
  console.error(`\nNot exactly one place node per box — nothing written:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const collection = {
  type: 'FeatureCollection',
  properties: { licence: 'ODbL 1.0 — © OpenStreetMap contributors', fetched: new Date().toISOString().slice(0, 10), queries },
  features,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const text = JSON.stringify(collection, null, 0) + '\n';
fs.writeFileSync(OUT, text);
console.log(`\nwrote tools/sources/osm-places.geojson — ${features.length} place(s)`);
console.log(`sha256: ${crypto.createHash('sha256').update(text).digest('hex')}`);
