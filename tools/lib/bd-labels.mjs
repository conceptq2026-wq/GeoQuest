/*
| Bangladesh's district names as the basemap draws them (2026-10-05): the 64 label points of
| bangladesh.pmtiles' admin_labels layer, level "district" — each district's inner point, drawn from z7
| (tools/build-bangladesh.mjs). Read from the served archive itself, a local file, so a frame held to them
| holds to what the student sees.
|
| Read by tools/build-bangladesh-rivers-map.mjs, which widens a «বাংলাদেশে» frame that holds no district
| name to the nearest one, and by tools/verify-descriptor.mjs, which holds every frame to it. No network.
*/
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PMTiles } from 'pmtiles';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ARCHIVE = path.resolve(HERE, '..', '..', 'docs/shared/tiles/bangladesh.pmtiles');
const require = createRequire(import.meta.url);
const vtRequire = createRequire(require.resolve('vt-pbf'));
const { VectorTile } = vtRequire('@mapbox/vector-tile');
const Pbf = vtRequire('pbf');

class FileSource {
  constructor(file) { this.buf = fs.readFileSync(file); }
  getKey() { return 'bangladesh'; }
  async getBytes(offset, length) {
    return { data: this.buf.buffer.slice(this.buf.byteOffset + offset, this.buf.byteOffset + offset + length) };
  }
}
const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);

/** The zoom district names appear from, and every district's label point: [{ nameBn, at: [lon, lat] }], 64 of them. */
export async function districtLabels() {
  const archive = new PMTiles(new FileSource(ARCHIVE));
  const z = 7;
  const out = new Map();
  let fromZoom = null;
  for (let x = lon2x(87.5, z); x <= lon2x(93.5, z); x++)
    for (let y = lat2y(27.5, z); y <= lat2y(20, z); y++) {
      const t = await archive.getZxy(z, x, y);
      const layer = t && new VectorTile(new Pbf(new Uint8Array(t.data))).layers.admin_labels;
      for (let i = 0; i < (layer?.length ?? 0); i++) {
        const f = layer.feature(i).toGeoJSON(x, y, z);
        if (f.properties.level !== 'district' || f.properties.bd !== true) continue;
        fromZoom = Math.max(fromZoom ?? 0, f.properties.min_zoom);
        out.set(f.properties.name_bn, { nameBn: f.properties.name_bn, at: f.geometry.coordinates });
      }
    }
  if (out.size !== 64) throw new Error(`bd-labels: bangladesh.pmtiles' z${z} tiles name ${out.size} districts, not 64`);
  return { fromZoom, points: [...out.values()] };
}

// Room round a district's label point for its name, in degrees [lon, lat] each side: a 14 px name up to
// 90 px wide and 20 px high, at z9, the zoom a frame widened to take one in opens at or under.
export const NAME_ROOM = [0.06, 0.02];
