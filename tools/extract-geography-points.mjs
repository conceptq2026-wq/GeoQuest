// One-off: saves the points the Geography maps take from outside Natural
// Earth, so the build reads committed files and never a live service.
//
//   tools/sources/wikidata-points.json    P625 of each item a seed names (CC0)
//   tools/sources/osm-waterfalls.geojson  each waterfall node a seed names (ODbL)
//
// Re-run only on purpose, then review the diff and update both checksums in
// sources.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seeds that name the points, and where the extracts go. Change here if they move.
const SEEDS = ['deserts', 'lakes', 'forests', 'mountains', 'waterfalls'].map((m) => path.join(ROOT, 'data-sources', m, `${m}.seed.json`));
const OUT_WIKIDATA = path.join(ROOT, 'tools', 'sources', 'wikidata-points.json');
const OUT_OSM = path.join(ROOT, 'tools', 'sources', 'osm-waterfalls.geojson');
const UA = { 'User-Agent': 'GeoQuest map build (educational maps)' };

/*
 * Each waterfall node is taken by its id AND only if it lies inside a box
 * round the fall and is tagged waterway=waterfall — an id typed wrong cannot
 * pass for a waterfall somewhere else. [south, west, north, east]
 */
export const BOXES = {
  tugela: [-28.8, 28.84, -28.7, 28.94],
  victoria_f: [-17.96, 25.8, -17.89, 25.9],
  khone: [13.9, 105.93, 14.02, 106.04],
  niagara: [43.05, -79.1, 43.1, -79.04],
  angel: [5.93, -62.58, 6.01, -62.49],
  iguazu: [-25.72, -54.47, -25.66, -54.4],
};

const wanted = { wikidata: new Map(), osm: new Map() };
for (const file of SEEDS) {
  for (const [id, r] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) {
    const p = r.geometry?.point;
    if (p?.source === 'wikidata') wanted.wikidata.set(p.qid, id);
    if (p?.source === 'osm') wanted.osm.set(id, p.node);
  }
}

// ---- Wikidata: P625, the item's own coordinate ------------------------------
const qids = [...wanted.wikidata.keys()];
const points = {};
for (let i = 0; i < qids.length; i += 45) {
  const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.slice(i, i + 45).join('|')}&props=claims|labels&languages=en&format=json`;
  const j = await (await fetch(u, { headers: UA })).json();
  for (const [q, e] of Object.entries(j.entities)) {
    const v = e.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (!v) throw new Error(`${q} (${wanted.wikidata.get(q)}) has no P625`);
    points[q] = { record: wanted.wikidata.get(q), label: e.labels?.en?.value, at: [Number(v.longitude.toFixed(5)), Number(v.latitude.toFixed(5))] };
    console.log(`  ${q.padEnd(9)} ${wanted.wikidata.get(q).padEnd(12)} ${points[q].at}  ${points[q].label}`);
  }
}
const wdText = JSON.stringify({ licence: 'CC0 — Wikidata', fetched: new Date().toISOString().slice(0, 10), points }, null, 1) + '\n';

// ---- OSM: waterfall nodes by id, inside their box ---------------------------
const EP = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(query) {
  for (let round = 1; round <= 4; round++) {
    for (const url of EP) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(90_000) });
        const t = await res.text();
        if (res.ok && t.startsWith('{')) return JSON.parse(t);
      } catch {}
    }
    await new Promise((r) => setTimeout(r, round * 10_000));
  }
  throw new Error('every Overpass endpoint failed');
}
const features = [];
const queries = {};
for (const [id, node] of wanted.osm) {
  const box = BOXES[id];
  if (!box) throw new Error(`${id}: no box to find node ${node} in`);
  const query = `[out:json][timeout:60];node(id:${node})["waterway"="waterfall"](${box.join(',')});out body;`;
  queries[id] = query;
  const els = (await overpass(query)).elements;
  if (els.length !== 1) throw new Error(`${id}: node ${node} is not a waterfall inside its box`);
  const n = els[0];
  features.push({ type: 'Feature', properties: { record: id, osmNode: n.id, name: n.tags.name ?? null, nameEn: n.tags['name:en'] ?? null, wikidata: n.tags.wikidata ?? null }, geometry: { type: 'Point', coordinates: [Number(n.lon.toFixed(5)), Number(n.lat.toFixed(5))] } });
  console.log(`  ${id.padEnd(12)} node/${n.id}  ${n.tags['name:en'] ?? n.tags.name}`);
  await new Promise((r) => setTimeout(r, 2000));
}
const osmText = JSON.stringify({ type: 'FeatureCollection', properties: { licence: 'ODbL 1.0 — © OpenStreetMap contributors', fetched: new Date().toISOString().slice(0, 10), queries }, features }) + '\n';

fs.writeFileSync(OUT_WIKIDATA, wdText);
fs.writeFileSync(OUT_OSM, osmText);
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
console.log(`\nwikidata-points.json  sha256 ${sha(wdText)}`);
console.log(`osm-waterfalls.geojson sha256 ${sha(osmText)}`);
