// One-off, per river system: the OpenStreetMap ways a system of the Rivers of
// Bangladesh picture draws beyond the pinned files it already has — each
// fetched by its way id, with the node ids that let a build trim a way at a
// junction, and the tags that identify it.
//
//   node tools/extract-bangladesh-rivers-system.mjs <system>
//
// The ways are the system seed's `geometry.extract` (group → ids), in
// data-sources/bangladesh-rivers/systems/<system>.seed.json: one list, read by
// this tool and by the build. Output: tools/sources/osm-bangladesh-rivers-<system>.geojson
// (ODbL). Every way is read by id, never by search, so the file is exactly that
// list; a way carrying no name, name:bn, name:en or wikidata tag is refused (the
// user's rule, 2026-09-29) unless the seed lists it under `evidence`. Re-run
// only on purpose, then review the diff and update its checksum in sources.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where the systems' seeds are, and where an extract goes. Change here if one moves.
const SYSTEMS = path.join(ROOT, 'data-sources', 'bangladesh-rivers', 'systems');
const OUT_DIR = path.join(ROOT, 'tools', 'sources');
const UA = { 'User-Agent': 'GeoQuest map build (educational maps)' };

const system = process.argv[2];
if (!/^[a-z]+$/.test(system ?? '')) throw new Error('usage: node tools/extract-bangladesh-rivers-system.mjs <system>');
const seed = JSON.parse(fs.readFileSync(path.join(SYSTEMS, `${system}.seed.json`), 'utf8'));
const WAYS = seed.geometry?.extract;
if (!WAYS || !Object.keys(WAYS).length) throw new Error(`systems/${system}.seed.json lists no geometry.extract`);
const OUT = path.join(OUT_DIR, `osm-bangladesh-rivers-${system}.geojson`);

const EP = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(query) {
  for (let round = 1; round <= 3; round++) {
    for (const url of EP) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(120_000) });
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

const KEEP = ['name', 'name:bn', 'name:en', 'alt_name', 'wikidata', 'waterway', 'water', 'natural', 'boundary', 'intermittent'];
const untagged = ids.filter((id) => group.get(id) !== 'evidence' && !['name', 'name:bn', 'name:en', 'wikidata'].some((k) => byId.get(id).tags?.[k]));
if (untagged.length) throw new Error(`ways with no name, name:bn, name:en or wikidata: ${untagged.join(', ')}`);
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
const json = JSON.stringify({ type: 'FeatureCollection', properties: { licence: 'ODbL 1.0 — © OpenStreetMap contributors', system, fetched, snapshot }, features });
fs.writeFileSync(OUT, json);
const buf = Buffer.from(json);
console.log(`${features.length} ways, snapshot ${snapshot}, fetched ${fetched}, ${buf.length} bytes`);
console.log(JSON.stringify({ _comment: `the OpenStreetMap ways the Rivers of Bangladesh picture's ${system} system draws beyond the other pinned files, by way id, with node ids and tags, from tools/extract-bangladesh-rivers-system.mjs ${system}`, file: path.relative(ROOT, OUT).replace(/\\/g, '/'), fetched, snapshot, licence: 'ODbL 1.0 — © OpenStreetMap contributors', sha256: crypto.createHash('sha256').update(buf).digest('hex') }, null, 2));
