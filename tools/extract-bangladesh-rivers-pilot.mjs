// One-off: the OpenStreetMap ways the Rivers of Bangladesh picture draws beyond
// the pinned rivers snapshot (tools/sources/osm-bangladesh-rivers.geojson) —
// each fetched by its way id, with the node ids that let a build trim a way at
// a junction, and the tags that say how it was identified.
//
//   node tools/extract-bangladesh-rivers-pilot.mjs
//
// Output: tools/sources/osm-bangladesh-rivers-pilot.geojson (ODbL). Every way
// is read by id, never by search, so the file is exactly this list. Re-run
// only on purpose, then review the diff and update its checksum in sources.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UA } from './net.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where the extract goes. Change here if it moves.
const OUT = path.join(ROOT, 'tools', 'sources', 'osm-bangladesh-rivers-pilot.geojson');
const HEADERS = { 'User-Agent': UA };

// The ways, by group. A way in `evidence` is not drawn: it is what identifies
// an unnamed drawn way (the Shitalakshya's Bengali-named river polygon).
export const WAYS = {
  padmaMeghna: [82854640, 630320743, 908091551, 288284424, 288284422, 684921446, 684819155, 684920517, 1076997923, 288284425, 1076997905],
  oldBrahmaputra: [101999102, 255332935],
  teesta: [1214968882, 1382107976],
  karatoya: [398317969, 370553035],
  dharla: [27916059, 97822950, 169849859, 97817505, 97817513, 28801794],
  atrai: [583374581, 537492274, 154887673, 154887677, 198715293],
  dhaleshwari: [1080194377, 929186911, 142214393, 929186912, 929186913],
  banshi: [230302821, 231316206, 908263643, 723745215, 723940307, 723745214, 469003425, 1110536188, 48492816],
  shitalakshya: [928996328, 928996331],
  evidence: [30670081],
};

const EP = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(query) {
  for (let round = 1; round <= 3; round++) {
    for (const url of EP) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(120_000) });
        const t = await res.text();
        if (res.ok && t.startsWith('{')) return JSON.parse(t);
      } catch {}
    }
    await new Promise((r) => setTimeout(r, round * 10_000));
  }
  throw new Error('every Overpass endpoint failed');
}

const group = new Map(Object.entries(WAYS).flatMap(([g, ids]) => ids.map((id) => [id, g])));
const ids = [...group.keys()];
const res = await overpass(`[out:json][timeout:120];way(id:${ids.join(',')});out meta geom;`);
const byId = new Map(res.elements.filter((e) => e.type === 'way').map((e) => [e.id, e]));
const missing = ids.filter((id) => !byId.has(id));
if (missing.length) throw new Error(`Overpass returned no way for ${missing.join(', ')}`);

const KEEP = ['name', 'name:bn', 'name:en', 'alt_name', 'waterway', 'water', 'natural', 'boundary', 'intermittent'];
const features = ids.map((id) => {
  const e = byId.get(id);
  const tags = Object.fromEntries(KEEP.filter((k) => e.tags?.[k] !== undefined).map((k) => [k, e.tags[k]]));
  return {
    type: 'Feature',
    properties: { osm_id: id, group: group.get(id), version: e.version, timestamp: e.timestamp, tags, nodes: e.nodes },
    geometry: { type: 'LineString', coordinates: e.geometry.map((p) => [p.lon, p.lat]) },
  };
});
for (const f of features) if (f.properties.nodes.length !== f.geometry.coordinates.length) throw new Error(`way ${f.properties.osm_id}: nodes and geometry differ`);

const snapshot = res.osm3s?.timestamp_osm_base ?? null;
const fetched = new Date().toISOString().slice(0, 10);
const json = JSON.stringify({ type: 'FeatureCollection', properties: { licence: 'ODbL 1.0 — © OpenStreetMap contributors', fetched, snapshot }, features });
fs.writeFileSync(OUT, json);
const buf = Buffer.from(json);
console.log(`${features.length} ways, snapshot ${snapshot}, fetched ${fetched}, ${buf.length} bytes`);
console.log(JSON.stringify({ _comment: 'the OpenStreetMap ways the Rivers of Bangladesh picture draws beyond the rivers snapshot, by way id, with node ids', file: 'tools/sources/osm-bangladesh-rivers-pilot.geojson', fetched, snapshot, licence: 'ODbL 1.0 — © OpenStreetMap contributors', sha256: crypto.createHash('sha256').update(buf).digest('hex') }, null, 2));
