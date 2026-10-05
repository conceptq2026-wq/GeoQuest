/*
| The cut rule of the rivers map (R-55, 2026-10-05): a card counted as reaching the origin its seed
| states is CUT instead when its drawn course stops on the box an extract selected it in — its head
| line's upstream end lies within CUT_TOL_M of the edge of the box of a snapshot selection that line
| draws from. The rivers snapshot (osmBangladeshRivers, tools/extract-bangladesh.mjs) takes a river's
| ways by name only inside that river's own box, so a chain that ends on the box's edge ends there
| because the box did, not the river; a way read by its id (every later extract) is taken whole and
| ends where OpenStreetMap's way does. The Teesta stops at 27.601°N, on its box's 27.6°N.
|
| Refined by the user (2026-10-05): a line whose upstream end joins its parent river — on the parent's
| drawn course, within CONNECT_FROM_M, or the start of a connector to it — has reached its source, the
| point where it leaves its parent, however near a box's edge that lies. The Bhagirathi, which leaves the
| Ganga by its 7.4 km connector 0.7 km inside the hooghly box's 24.5°N, is reached; the Teesta, which
| joins its parent at its other end, stays cut.
|
| By id (Stage 4, the user's rule, 2026-10-05): a head line whose upstream end lies on a way read by its id has
| reached its source when that end is the way's own, named head (byIdHead below); trimmed short of it, it is cut.
| The Padma (gangaUpper), the Barak (barakUpper), the Karnaphuli (khawthlangtuipui) and the Teesta (lachenChu)
| end so, at the heads OpenStreetMap names.
|
| Read by tools/build-bangladesh-rivers-map.mjs, which gives every cut card the map's upstream ⓘ line,
| and by tools/verify-descriptor.mjs, which holds the map to it. No network: the boxes are read from the
| extract tool's own source, the ways from the pinned snapshot.
*/
import fs from 'node:fs';
import path from 'node:path';
import { distM, nearestOnLine } from './rivers-frame.mjs';
import { CONNECT_FROM_M } from './rivers-core.mjs';

export const CUT_TOL_M = 1000;
// «বাংলাদেশে»'s band (R-55): a line counts as inside Bangladesh where it lies inside COD-AB's outline or within
// this of it, so a reach that follows the border is not cut into bits where the two traces part. Read by
// the build, which splits the lines by it, and by the validator, which holds the tab to it.
export const BD_BAND_M = 500;
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..', '..');

/** The snapshot's selections, as tools/extract-bangladesh.mjs declares them: { <river>: [w, s, e, n] }. */
export function snapshotBoxes() {
  const src = fs.readFileSync(path.join(ROOT, 'tools/extract-bangladesh.mjs'), 'utf8');
  const out = {};
  for (const m of src.matchAll(/^\s*(\w+): (?:byName\(\[[^\]]*\], \[([^\]]*)\]\)|\{ names: \[[^\]]*\], box: \[([^\]]*)\])/gm)) out[m[1]] = (m[2] ?? m[3]).split(',').map(Number);
  if (Object.keys(out).length !== 12 || Object.values(out).some((b) => b.length !== 4 || b.some((v) => !Number.isFinite(v)))) throw new Error(`rivers-cut: tools/extract-bangladesh.mjs declares ${Object.keys(out).length} selection boxes, not the 12 this rule reads`);
  return out;
}

/** The snapshot's ways: osm id → the selection (river) it was taken for. */
export function snapshotRivers() {
  const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/sources/osm-bangladesh-rivers.geojson'), 'utf8'));
  return new Map(file.features.map((f) => [f.properties.osm_id, f.properties.river]));
}

/** The distance (m) from a point to a box's outline: to its nearest edge from inside, to the box from outside. */
function toOutline([x, y], [west, south, east, north]) {
  const inside = x >= west && x <= east && y >= south && y <= north;
  if (inside) return Math.min(distM([x, y], [west, y]), distM([x, y], [east, y]), distM([x, y], [x, south]), distM([x, y], [x, north]));
  return distM([x, y], [Math.min(Math.max(x, west), east), Math.min(Math.max(y, south), north)]);
}

/**
 * For a line's upstream end: the boxes of the snapshot selections the line draws any way from, and the least
 * distance from the end to one's outline — null where the line draws no snapshot way (every way read by id).
 */
export function cutAt(end, wayIds, boxes = snapshotBoxes(), rivers = snapshotRivers()) {
  let best = null;
  for (const river of new Set(wayIds.map((id) => rivers.get(id)).filter(Boolean))) {
    const box = boxes[river];
    if (!box) continue;
    const m = toOutline(end, box);
    if (!best || m < best.m) best = { river, box, m };
  }
  return best;
}

/**
 * A line's upstream end joins its parent: it starts a connector to the parent (connectorStarts, the parent-side
 * ends of the line's connectors), or lies within CONNECT_FROM_M of the parent's drawn course (parentCoords, its
 * pieces). Such a line is reached, not cut, whatever box it was taken in.
 */
export function headJoins(end, parentCoords, connectorStarts) {
  if (connectorStarts.some((s) => distM(s, end) <= 1)) return true;
  return parentCoords.some((c) => c.length > 1 && nearestOnLine(end, c).m <= CONNECT_FROM_M);
}

/*
 * A by-id head (Stage 4, 2026-10-05). Where the way that carries a line's upstream end was read by its id — no
 * snapshot selection took it, so no box can cut it — the chain has reached its named head when that end is the
 * way's own end: the head OpenStreetMap gives the river by that name, not a node the seed trims it to. Such a
 * line counts as reached; trimmed short of it, it is cut. Returns { way, byId, named }, or null where no way of
 * the line carries the end. `ways` is the core's map of untrimmed ways; `rivers` the snapshot's selections.
 */
export function byIdHead(end, wayIds, ways, rivers = snapshotRivers()) {
  const carrying = wayIds.map((id) => ways.get(id)).filter((w) => w && w.coords.some((p) => distM(p, end) <= 1));
  if (!carrying.length) return null;
  const atEnd = carrying.find((w) => [w.coords[0], w.coords.at(-1)].some((p) => distM(p, end) <= 1));
  const way = atEnd ?? carrying[0];
  return { way: way.id, byId: !rivers.has(way.id), named: Boolean(atEnd) };
}
