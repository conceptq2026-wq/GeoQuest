// Builds the latitude-longitude map — the globe's lines of latitude and
// longitude, the poles and Greenwich, Bangladesh, Dhaka and Bangladesh's
// antipode — from the editor's seed.
//
//   data-sources/latitude-longitude/latitude-longitude.seed.json  INPUT, the editor's — read, never written
//   tools/.cache/ne_10m_geographic_lines.geojson   INPUT, pinned — the International Date Line
//   tools/.cache/bgd_admin_boundaries.geojson.zip  INPUT, pinned — Bangladesh, its districts, Dhaka (COD-AB)
//   docs/maps/latitude-longitude/descriptor.json   OUTPUT
//   docs/maps/latitude-longitude/records.json      OUTPUT, one record per selectable line, point and place
//   docs/maps/latitude-longitude/lines.geojson     OUTPUT, the named lines
//   docs/maps/latitude-longitude/graticule.geojson OUTPUT, the 15° graticule, drawn but never selected
//   docs/maps/latitude-longitude/areas.geojson     OUTPUT, Bangladesh and its antipode
//   docs/maps/latitude-longitude/imagery.pmtiles   made by tools/build-latitude-longitude-imagery.mjs
//
// Every line is drawn at the seed's value — the conventional 23°30′ and
// 66°30′, by the user's decision — except the date line, which is Natural
// Earth's. The build makes no network call: its inputs are the seed and the
// pinned cache that tools/fetch-sources.mjs fills.
//
// The descriptor declares `globe`, which the shell's globe module draws
// (docs/shell/globe.js): the globe opening on Bangladesh, a pill per record
// in place of the picker row, each line named at the globe's edge, the
// latitude and longitude beside Bangladesh and Dhaka, and the button that
// turns the globe between Bangladesh and its antipode. The card's row labels
// and the button's two labels are the words the user approved (WORDS); no
// other Bengali is written here, only the seed's.
//
//   node tools/build-latitude-longitude.mjs [out-dir]
//
// With no argument it writes the map's folder under docs/; tools/preview.mjs
// passes the folder of its own copy instead.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';
import { CACHE, zipEntry, rewind } from './lib/geo.mjs';
import { clipEdgeVertices, lostPieces, projectY, TILER } from './tile-clip.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The seed, the pins and the served folder. Change here if one moves.
const SEED = path.join(ROOT, 'data-sources/latitude-longitude/latitude-longitude.seed.json');
const SOURCES = path.join(HERE, 'sources.json');
const PINS = path.join(HERE, 'latitude-longitude-pins.json');
const MAP_DIR = path.join(ROOT, 'docs/maps/latitude-longitude');
const OUT = path.resolve(process.argv[2] ?? MAP_DIR);
const MAP_ID = 'latitude-longitude';

// The files this build writes. The imagery beside them is its own tool's.
const OWN_FILES = ['descriptor.json', 'records.json', 'lines.geojson', 'graticule.geojson', 'areas.geojson'];
const IMAGERY_FILE = 'imagery.pmtiles';

// The one value the seed may leave pending: the date line's geometry, which
// this build takes from Natural Earth.
const PENDING_ALLOWED = 'lines.date-line.geometry';
// The current International Date Line in Natural Earth's geographic lines, by
// its stable id, and the class it must have. The file holds one date line
// (v5.1.2): it runs east of Kiribati's Line Islands to 150°W, the line as it
// has been since 1995.
const DATE_LINE = { field: 'ne_id', value: 1159100219, featurecla: 'Date line', reachesWestOf: -150 };

// Generated lines: a parallel is straight in Web Mercator and a meridian too,
// so the renderer bends them on the globe and a vertex is only an anchor. The
// tiler drops a line's piece where a vertex sits exactly on a tile's clip edge
// (tools/tile-clip.mjs), so a parallel gets a vertex every 30° but none at
// ±90°, whose x is a clip edge at z0 — never 1°, 5° or 15° apart.
const PARALLEL_LONS = [-180, -150, -120, -60, -30, 0, 30, 60, 120, 150, 180];
const MERIDIAN_LATS = [-90, 0, 90];
// The graticule leaves out the lines drawn as records of their own.
const GRATICULE_SKIP = { parallels: [0], meridians: [0, 90] };
// Zooms the lines are proved over: the world basemap's overview reaches z6.
const PROVE_TO_ZOOM = 6;

// Bangladesh's outline: COD-AB's admin0, simplified for a globe that reaches
// z6, where a pixel is about 1.1 km at Dhaka's latitude.
const SIMPLIFY_METRES = 500;
const DECIMALS = 4;

// A frame per record. The globe module fits a place to its frame (Greenwich,
// Bangladesh, Dhaka, the antipode) and flies to a line or a pole whole-globe,
// so only a place's frame is ever flown to. Frames need basemap context: the
// world tiles stop at z6, so none may land past z6 on a 390×780 phone
// (368 × 728 px of map), and a point's frame is never narrower than this.
const MIN_FRAME_LON = 4.2;
const PHONE_MAP_PX = [368, 728];
const MAX_FRAME_ZOOM = 6;
// The antipode is open ocean; its frame reaches east to the coast of Chile,
// the land its card names, so it has something to stand against.
const ANTIPODE_CONTEXT_EAST = -69;

// The districts each line crosses, checked against the editor's own count and
// list in the seed's review, from COD-AB's districts at the card's value.
const DISTRICT_CHECKS = { 'tropic-cancer': { lat: 23.5 }, 'meridian-90e': { lon: 90 } };

// Colours, from the mockup where it has the line.
const LINE_COLOURS = {
  equator: '#e53935',
  'tropic-cancer': '#f57c00',
  'tropic-capricorn': '#f57c00',
  'arctic-circle': '#1e88e5',
  'antarctic-circle': '#1e88e5',
  'prime-meridian': '#138a43',
  'meridian-90e': '#00897b',
  'date-line': '#7b3fc4',
};
const DASHED = ['tropic-cancer', 'tropic-capricorn', 'arctic-circle', 'antarctic-circle'];
const AREA_COLOURS = { bangladesh: ['#1f9d55', '#0d5c2e'], antipode: ['#e08a00', '#8a4b00'] };
// The imagery fades out over the vector world basemap between these zooms.
const IMAGERY_FADE_OUT = [3, 4];

// The globe (the shell's globe module): its diameter as a share of the map's
// shorter side — the investigation's opening view, 320 px on a 390 px phone —
// the record that faces the viewer when it opens, and how long a flight to a
// pill's record and the turn to the antipode take (the measured flight).
const GLOBE_SIZE = 0.82;
const GLOBE_OPEN = 'bangladesh';
const FLIGHT_MS = 1800;
const ANTIPODE_MS = 2600;
// The latitude and longitude callouts beside Bangladesh and Dhaka show from
// this zoom: below it Bangladesh is under about 30 px across, and two callouts
// either side of it crowd a 320 px phone.
const COORDINATES_MIN_ZOOM = 3.2;

// Words the user approved for this map (2026-09-27), the card's row labels
// and the antipode button's two labels. No other Bengali is shown but the
// seed's own.
const WORDS = {
  latitude: 'অক্ষাংশ',
  longitude: 'দ্রাঘিমাংশ',
  time: 'সময়',
  nearestLand: 'নিকটতম স্থলভাগ',
  where: 'অবস্থান',
  toAntipode: 'প্রতিপাদে যান',
  toBangladesh: 'বাংলাদেশে ফিরুন',
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
function pinned(entry, file) {
  const buf = fs.readFileSync(file);
  if (buf.length !== entry.size || sha256(buf) !== entry.sha256) throw new Error(`${path.basename(file)}: ${buf.length} bytes, sha256 ${sha256(buf)} — pinned ${entry.size} bytes, ${entry.sha256}; refusing it`);
  return buf;
}
const fail = (msg) => {
  throw new Error(`${MAP_ID}: ${msg}`);
};
const round = (v) => Number(v.toFixed(DECIMALS));

// ---- the seed ------------------------------------------------------------------------
const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const pendingIn = (node, trail, out = []) => {
  if (node === null) out.push(trail);
  else if (Array.isArray(node)) node.forEach((v, i) => pendingIn(v, `${trail}[${i}]`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) pendingIn(v, trail ? `${trail}.${k}` : k, out);
  return out;
};
const pending = pendingIn(seed, '');
const stray = pending.filter((p) => p !== PENDING_ALLOWED);
if (stray.length) fail(`the seed has pending fields besides the date line's geometry: ${stray.join(', ')}`);

const entries = [
  ...Object.values(seed.lines).map((e) => ({ ...e, group: 'line' })),
  ...Object.values(seed.points).map((e) => ({ ...e, group: 'point' })),
  ...Object.values(seed.places).map((e) => ({ ...e, group: 'place' })),
].sort((a, b) => a.order - b.order);
const graticuleSeed = seed.lines.graticule;
if (graticuleSeed?.kind !== 'graticule' || graticuleSeed.tappable !== false) fail('the seed has no graticule that is not tappable');
const selectable = entries.filter((e) => e.kind !== 'graticule');

// ---- inputs ----------------------------------------------------------------------------
const neEntry = sources.naturalEarth.files['ne_10m_geographic_lines.geojson'];
const geoLines = JSON.parse(pinned(neEntry, path.join(CACHE, 'ne_10m_geographic_lines.geojson')).toString('utf8'));
const codAb = pinned(sources.codAbBangladesh, path.join(CACHE, sources.codAbBangladesh.file));
const bd0 = zipEntry(codAb, 'bgd_admin0.geojson');
const bd2 = zipEntry(codAb, 'bgd_admin2.geojson');
const capitals = zipEntry(codAb, 'bgd_admincapitals.geojson');

// ---- the lines -------------------------------------------------------------------------
const line = (id, coordinates) => ({ type: 'Feature', properties: { id }, geometry: { type: 'LineString', coordinates } });
const lineFeatures = [];
for (const e of entries.filter((x) => x.group === 'line' && x.kind !== 'graticule')) {
  if (e.kind === 'parallel') lineFeatures.push(line(e.id, PARALLEL_LONS.map((lon) => [lon, e.lat])));
  else if (e.kind === 'meridian') lineFeatures.push(line(e.id, MERIDIAN_LATS.map((lat) => [e.lon, lat])));
  else if (e.kind === 'dateLine') {
    const found = geoLines.features.filter((f) => f.properties[DATE_LINE.field] === DATE_LINE.value);
    if (found.length !== 1) fail(`Natural Earth has ${found.length} features with ${DATE_LINE.field} ${DATE_LINE.value}, not one`);
    const f = found[0];
    if (f.properties.featurecla !== DATE_LINE.featurecla) fail(`the date line's featurecla is "${f.properties.featurecla}", not "${DATE_LINE.featurecla}"`);
    const others = geoLines.features.filter((g) => g !== f && g.properties.featurecla === DATE_LINE.featurecla);
    if (others.length) fail(`Natural Earth has ${others.length} other date line(s); decide which one is current before building`);
    const lons = f.geometry.coordinates.flat().map(([lon]) => lon);
    if (!lons.some((lon) => lon <= DATE_LINE.reachesWestOf + 0.01 && lon < 0)) fail(`the date line does not reach ${-DATE_LINE.reachesWestOf}°W round Kiribati — not the post-1995 line`);
    lineFeatures.push({ type: 'Feature', properties: { id: e.id }, geometry: f.geometry });
  } else fail(`line ${e.id} has kind "${e.kind}", which this build does not draw`);
}
const graticuleFeatures = [];
const step = graticuleSeed.stepDeg;
for (let lat = -90 + step; lat < 90; lat += step) {
  if (!GRATICULE_SKIP.parallels.includes(lat)) graticuleFeatures.push({ type: 'Feature', properties: { kind: 'parallel', deg: lat }, geometry: { type: 'LineString', coordinates: PARALLEL_LONS.map((lon) => [lon, lat]) } });
}
for (let lon = -180; lon < 180; lon += step) {
  if (!GRATICULE_SKIP.meridians.includes(lon)) graticuleFeatures.push({ type: 'Feature', properties: { kind: 'meridian', deg: lon }, geometry: { type: 'LineString', coordinates: MERIDIAN_LATS.map((lat) => [lon, lat]) } });
}
const linesFc = { type: 'FeatureCollection', features: lineFeatures };
const graticuleFc = { type: 'FeatureCollection', features: graticuleFeatures };

// Proof that no line loses a piece at any zoom the map shows. Parallels carry
// no vertex on a clip edge; a meridian at a multiple of 45° lies on one by
// construction, and the date line is Natural Earth's — for both, the tiling
// itself is the proof.
const parallels = { type: 'FeatureCollection', features: [...lineFeatures, ...graticuleFeatures].filter((f) => f.geometry.coordinates.length > 3 && f.geometry.type === 'LineString') };
const parallelHits = clipEdgeVertices(parallels, PROVE_TO_ZOOM, (f) => f.properties.id ?? `graticule ${f.properties.deg}°`);
if (parallelHits.length) fail(`a parallel has a vertex on a tile's clip edge: ${parallelHits.join('; ')}`);
const dateLineHits = clipEdgeVertices({ type: 'FeatureCollection', features: lineFeatures.filter((f) => f.properties.id === 'date-line') }, PROVE_TO_ZOOM);
const meridianHits = clipEdgeVertices({ type: 'FeatureCollection', features: [...lineFeatures, ...graticuleFeatures].filter((f) => f.geometry.type === 'LineString' && f.geometry.coordinates.length === 3) }, PROVE_TO_ZOOM, (f) => f.properties.id ?? `graticule ${f.properties.deg}°`);
const proof = lostPieces({ type: 'FeatureCollection', features: [...lineFeatures, ...graticuleFeatures.map((f) => ({ ...f, properties: { id: `graticule ${f.properties.kind} ${f.properties.deg}°` } }))] }, PROVE_TO_ZOOM);
if (proof.lost.length) fail(`${proof.lost.length} line piece(s) lost in the tiling: ${proof.lost.slice(0, 12).join('; ')}`);

// ---- Bangladesh, its antipode and Dhaka --------------------------------------------------
async function simplified(fc) {
  const out = await mapshaper.applyCommands(`-i in.json -simplify interval=${SIMPLIFY_METRES} keep-shapes -filter-fields -o out.json format=geojson geojson-type=FeatureCollection precision=${10 ** -DECIMALS}`, { 'in.json': JSON.parse(JSON.stringify(fc)) });
  return JSON.parse(out['out.json'].toString());
}
const bdSimple = await simplified(bd0);
if (bdSimple.features.length !== 1) fail(`COD-AB admin0 simplified to ${bdSimple.features.length} features, not one`);
const bdGeometry = rewind(bdSimple.features[0].geometry);
const flip = (g) => {
  const ring = (r) => r.map(([lon, lat]) => [round(lon - 180), round(-lat)]);
  return rewind(g.type === 'Polygon' ? { type: 'Polygon', coordinates: g.coordinates.map(ring) } : { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(ring)) });
};
const antipodeGeometry = flip(bdGeometry);
const areasFc = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { id: 'bangladesh' }, geometry: bdGeometry },
    { type: 'Feature', properties: { id: 'antipode' }, geometry: antipodeGeometry },
  ],
};
const areaHits = clipEdgeVertices(areasFc, PROVE_TO_ZOOM);
// Where Bangladesh's latitude and longitude callout points: the outline's
// inner point, the spot deepest inside it — the one mapshaper finds.
const innerPoint = await (async () => {
  const out = await mapshaper.applyCommands('-i in.json -points inner -o out.json format=geojson geojson-type=FeatureCollection', { 'in.json': { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: JSON.parse(JSON.stringify(bdGeometry)) }] } });
  return JSON.parse(out['out.json'].toString()).features[0].geometry.coordinates.map(round);
})();

// PINNED: the geometry that comes from outside, as drawn — the date line as
// Natural Earth has it, and Bangladesh's outline as simplified here. The
// inputs are pinned by checksum, so a move means a source, a selector or a
// constant changed: stop and report old and new; never re-pin to pass.
const geometryHash = (g) => sha256(Buffer.from(JSON.stringify(g.coordinates))).slice(0, 16);
const PINNED = fs.existsSync(PINS) ? JSON.parse(fs.readFileSync(PINS, 'utf8')) : {};
const drawn = { 'date-line': lineFeatures.find((f) => f.properties.id === 'date-line').geometry, bangladesh: bdGeometry };
const moved = Object.entries(drawn)
  .filter(([id, g]) => PINNED[id] !== geometryHash(g))
  .map(([id, g]) => `${id}: pinned ${PINNED[id] ?? '(none)'}, now ${geometryHash(g)}`);
const stalePins = Object.keys(PINNED).filter((id) => !(id in drawn));
if (moved.length || stalePins.length) fail(`geometry pins do not hold — stop and report, never re-pin to pass:\n  ${[...moved, ...stalePins.map((id) => `${id}: pinned but not drawn`)].join('\n  ')}`);

const rawRings = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const extent = (g) => rawRings(g).flat(2).reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const bdExtent = extent(bd0.features[0].geometry);

// Dhaka: COD-AB's national capital point, which the seed gives to six decimals.
const capital = capitals.features.filter((f) => f.properties.adm_p_lvl === 0);
if (capital.length !== 1 || capital[0].properties.name !== 'Dhaka') fail(`COD-AB has ${capital.length} national capital point(s), not Dhaka alone`);
const [capLon, capLat] = capital[0].geometry.coordinates.map((v) => Number(v.toFixed(6)));
const dhaka = seed.places.dhaka.point;
if (dhaka.lat !== capLat || dhaka.lon !== capLon) fail(`the seed puts Dhaka at ${dhaka.lat}, ${dhaka.lon}; COD-AB's capital point is ${capLat}, ${capLon}`);
const antipodePoint = seed.places.antipode.dhakaPoint;
const flippedDhaka = [Number((dhaka.lon - 180).toFixed(6)), -dhaka.lat];
if (antipodePoint.lon !== flippedDhaka[0] || antipodePoint.lat !== flippedDhaka[1]) fail(`the seed's antipode of Dhaka is ${antipodePoint.lat}, ${antipodePoint.lon}; flipping Dhaka gives ${flippedDhaka[1]}, ${flippedDhaka[0]}`);
if (seed.places.antipode.geometry?.from !== 'bangladesh') fail('the antipode is not drawn from Bangladesh');

// ---- the district checks, from COD-AB at the card's value --------------------------------
// A line crosses a district where it runs through its interior: the crossings
// of the line with the district's rings, paired inside to outside.
function crossesInterior(geometry, { lat, lon }) {
  for (const poly of rawRings(geometry)) {
    const cuts = [];
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j];
        const [bx, by] = ring[i];
        if (lat !== undefined && (ay > lat) !== (by > lat)) cuts.push(ax + ((lat - ay) * (bx - ax)) / (by - ay));
        if (lon !== undefined && (ax > lon) !== (bx > lon)) cuts.push(ay + ((lon - ax) * (by - ay)) / (bx - ax));
      }
    }
    cuts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k += 2) if (cuts[k + 1] - cuts[k] > 1e-9) return true;
  }
  return false;
}
const inRing = ([x, y], ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inPolygon = (pt, g) => rawRings(g).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)));
const districtsCrossed = (at) => bd2.features.filter((f) => crossesInterior(f.geometry, at)).map((f) => f.properties.adm2_name).sort();
const editorsCheck = (id) => {
  const m = /editor's check: (\d+) — ([^)]+)\)/.exec(seed.lines[id].review ?? '');
  if (!m) fail(`the seed's review of ${id} gives no editor's check of the districts it crosses`);
  return { count: Number(m[1]), names: m[2].split(', ').map((s) => s.trim()).sort() };
};
const districtResults = {};
for (const [id, at] of Object.entries(DISTRICT_CHECKS)) {
  const value = at.lat ?? at.lon;
  if ((at.lat !== undefined ? seed.lines[id].lat : seed.lines[id].lon) !== value) fail(`${id}: the check is at ${value}, the seed's card value is not`);
  const got = districtsCrossed(at);
  const want = editorsCheck(id);
  if (want.names.length !== want.count) fail(`${id}: the seed's review counts ${want.count} districts but names ${want.names.length}`);
  if (got.join('|') !== want.names.join('|')) fail(`${id}: COD-AB gives ${got.length} districts (${got.join(', ')}); the seed says ${want.count} (${want.names.join(', ')})`);
  districtResults[id] = got;
}
const meet = [DISTRICT_CHECKS['meridian-90e'].lon, DISTRICT_CHECKS['tropic-cancer'].lat];
const meetDistricts = bd2.features.filter((f) => inPolygon(meet, f.geometry)).map((f) => f.properties.adm2_name);
const meetSeed = /inside (\S+) district/.exec(seed.lines['meridian-90e'].review ?? '')?.[1];
if (meetDistricts.length !== 1 || meetDistricts[0] !== meetSeed) fail(`90°E meets 23°30′ N in ${meetDistricts.join(', ') || 'no district'}; the seed says ${meetSeed}`);
// passesBangladesh, where a line declares it, is what COD-AB's outline says;
// and no line without it crosses Bangladesh.
for (const e of selectable.filter((x) => x.group === 'line' && x.kind !== 'dateLine')) {
  const crosses = crossesInterior(bd0.features[0].geometry, e.kind === 'parallel' ? { lat: e.lat } : { lon: e.lon });
  if (crosses !== (e.passesBangladesh === true)) fail(`${e.id}: passesBangladesh is ${e.passesBangladesh}, but COD-AB's outline says ${crosses}`);
}

// ---- records -----------------------------------------------------------------------------
const mercY = (lat) => projectY(lat);
const fitZoom = ([w, s, e, n]) => {
  const dx = (e - w) / 360;
  const dy = mercY(s) - mercY(n);
  return Math.min(Math.log2(PHONE_MAP_PX[0] / (dx * 512)), Math.log2(PHONE_MAP_PX[1] / (dy * 512)));
};
const widen = ([w, s, e, n]) => {
  const extra = Math.max(0, MIN_FRAME_LON - (e - w)) / 2;
  return [round(w - extra), s, round(e + extra), n];
};
const pad = ([w, s, e, n], k) => [round(w - (e - w) * k), round(s - (n - s) * k), round(e + (e - w) * k), round(n + (n - s) * k)];
const clampLat = (lat) => Math.max(-85, Math.min(85, lat));
function frameOf(e) {
  if (e.kind === 'parallel') return [-180, clampLat(e.lat - 30), 180, clampLat(e.lat + 30)];
  if (e.kind === 'meridian') return [e.lon - 60, -60, e.lon + 60, 75];
  // Across the antimeridian: MapLibre takes an east edge past 180°.
  if (e.kind === 'dateLine') return [150, -60, 210, 75];
  if (e.id === 'north-pole') return [-180, 60, 180, 85];
  if (e.id === 'south-pole') return [-180, -85, 180, -60];
  if (e.id === 'bangladesh') return widen(pad(extent(bdGeometry), 0.08));
  if (e.id === 'antipode') {
    const [w, s, , n] = pad(extent(antipodeGeometry), 0.08);
    return [w, s, ANTIPODE_CONTEXT_EAST, n];
  }
  const [lon, lat] = atOf(e);
  return widen([round(lon - 0.5), round(lat - 1.2), round(lon + 0.5), round(lat + 1.2)]);
}
function atOf(e) {
  if (e.group === 'point') return [e.lon, e.lat];
  if (e.id === 'dhaka') return [e.point.lon, e.point.lat];
  if (e.id === 'antipode') return [e.dhakaPoint.lon, e.dhakaPoint.lat];
  return undefined;
}
// Seed fields that are build input or provenance, and never ship.
const NOT_SHIPPED = ['id', 'order', 'sources', 'review', 'geometry', 'point', 'dhakaPoint', 'group'];
const records = {};
for (const e of selectable) {
  const r = {};
  for (const [k, v] of Object.entries(e)) if (!NOT_SHIPPED.includes(k)) r[k] = v;
  r.group = e.group;
  const at = atOf(e);
  if (at) r.at = at;
  r.hasLine = e.group === 'line';
  r.hasArea = e.id === 'bangladesh' || e.id === 'antipode';
  // The callout of a place's latitude and longitude points here: Bangladesh's
  // inner point and Dhaka's own — the two places the user asked for.
  if (e.id === 'bangladesh') r.coordAt = innerPoint;
  if (e.id === 'dhaka') r.coordAt = at;
  r.frame = frameOf(e);
  const zoom = fitZoom(r.frame);
  if (zoom > MAX_FRAME_ZOOM) fail(`${e.id}: its frame lands at z${zoom.toFixed(2)} on a 390 px phone, past z${MAX_FRAME_ZOOM}`);
  records[e.id] = r;
}

// ---- the descriptor ------------------------------------------------------------------------
const marble = sources.nasaBlueMarble;
const anchor = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
const byKey = (table, fallback) => ['match', ['get', 'key'], ...Object.entries(table).flat(), fallback];
const lineColour = byKey(LINE_COLOURS, '#0b3d91');
const isDashed = ['in', ['get', 'key'], ['literal', DASHED]];
// A pill flies the globe to its record and opens its card; a tap on the globe
// only opens the card, where it is.
const pillDo = [{ action: 'select' }, { action: 'flyTo', duration: FLIGHT_MS }];
const tapDo = [{ action: 'select' }];
// The card: every Bengali field a record has, in the seed's order, each
// under its approved label, or on its own where none was approved.
const row = (field, label, when) => ({ ...(label ? { label } : {}), field, ...(when ? { when } : {}), stacked: true });
const descriptor = {
  schema: 'geoquest/map-descriptor@1',
  id: MAP_ID,
  section: 'geography',
  title: { bn: seed.titleBn, en: seed.titleEn },
  basemap: 'world-light',
  // A globe, drawn by the shell's globe module (docs/shell/globe.js).
  globe: {
    size: GLOBE_SIZE,
    open: { record: GLOBE_OPEN },
    // NASA's Blue Marble, tiled into this folder, over the vector world
    // basemap, fading out as the world basemap's own detail begins to matter.
    imagery: { file: `./${IMAGERY_FILE}`, fadeOut: IMAGERY_FADE_OUT },
    // The map's selector, in place of the picker row: one pill per record.
    pills: { from: 'items', label: { field: 'nameBn' }, labelEn: 'Lines, points and places', do: pillDo },
    // Each line's name where the line meets the globe's visible edge.
    edgeLabels: { source: 'lines', text: { field: 'nameBn' }, colour: { style: 'line', paint: 'line-color' } },
    // The latitude and longitude beside Bangladesh and Dhaka, as the seed words them.
    coordinates: { at: 'coordAt', lines: [{ field: 'latBn' }, { field: 'lonBn' }], minZoom: COORDINATES_MIN_ZOOM },
    // One button on either card turns the globe to the other place.
    antipode: { between: ['bangladesh', 'antipode'], labels: { bangladesh: WORDS.toAntipode, antipode: WORDS.toBangladesh }, duration: ANTIPODE_MS },
  },
  attribution: { extra: [anchor(marble.page, marble.credit)] },
  constraints: { minZoom: 0, maxZoom: 6 },
  records: {
    items: {
      file: './records.json',
      fields: {
        nameBn: { type: 'text', required: true },
        nameEn: { type: 'text', required: true, display: false },
        chipBn: { type: 'text', required: true },
        valueBn: { type: 'text' },
        factBn: { type: 'text' },
        timeBn: { type: 'text' },
        passesBangladesh: { type: 'boolean' },
        latBn: { type: 'text' },
        lonBn: { type: 'text' },
        ruleBn: { type: 'text' },
        whereBn: { type: 'text' },
        nearestBn: { type: 'text' },
        kind: { type: 'text', display: false },
        lat: { type: 'number', display: false },
        lon: { type: 'number', display: false },
        group: { type: 'text', required: true, display: false },
        at: { type: 'point' },
        coordAt: { type: 'point' },
        hasLine: { type: 'boolean', required: true },
        hasArea: { type: 'boolean', required: true },
        frame: { type: 'bbox', required: true },
      },
    },
  },
  sources: {
    graticule: { geometry: './graticule.geojson' },
    areas: {
      records: 'items',
      geometry: './areas.geojson',
      joinField: 'id',
      expectGeometry: { hasArea: true },
      state: ['selected'],
      properties: [],
      attribution: anchor('https://data.humdata.org/dataset/cod-ab-bgd', 'BBS / OCHA (CC BY-IGO)'),
    },
    lines: {
      records: 'items',
      geometry: './lines.geojson',
      joinField: 'id',
      expectGeometry: { hasLine: true },
      state: ['selected'],
      properties: ['nameBn'],
      attribution: anchor('https://www.naturalearthdata.com/', 'Natural Earth'),
    },
    points: {
      records: 'items',
      geometryFrom: 'at',
      state: ['selected'],
      properties: ['nameBn'],
      selectionMarker: true,
    },
  },
  styles: {
    // A line's colour, read by its layers and by its name at the globe's edge.
    line: { paint: { 'line-color': lineColour } },
    'point-marker': { paint: { 'circle-color': '#0b3d91', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-radius': 6 } },
    'point-label': {
      layout: { 'text-font': ['Noto Sans Bengali'], 'text-size': 12, 'text-variable-anchor': ['top', 'bottom', 'right', 'left'], 'text-radial-offset': 0.9, 'text-optional': true },
      paint: { 'text-color': '#0b3d91', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
    },
  },
  layers: [
    { id: 'graticule', type: 'line', source: 'graticule', slot: 'belowLabels', paint: { 'line-color': '#ffffff', 'line-opacity': 0.75, 'line-width': 0.8 } },
    {
      id: 'area-fill',
      type: 'fill',
      source: 'areas',
      slot: 'belowLabels',
      paint: { 'fill-color': byKey(Object.fromEntries(Object.entries(AREA_COLOURS).map(([k, [fill]]) => [k, fill])), '#1f9d55'), 'fill-opacity': ['case', ['get', 'selected'], 0.95, 0.8] },
    },
    {
      id: 'area-edge',
      type: 'line',
      source: 'areas',
      slot: 'belowLabels',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': byKey(Object.fromEntries(Object.entries(AREA_COLOURS).map(([k, [, edge]]) => [k, edge])), '#0d5c2e'), 'line-width': ['case', ['get', 'selected'], 2, 1] },
    },
    {
      id: 'line-solid',
      type: 'line',
      source: 'lines',
      slot: 'belowLabels',
      style: 'line',
      filter: ['!', isDashed],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-width': ['case', ['get', 'selected'], 4, 2] },
    },
    {
      id: 'line-dashed',
      type: 'line',
      source: 'lines',
      slot: 'belowLabels',
      style: 'line',
      filter: isDashed,
      layout: { 'line-join': 'round' },
      paint: { 'line-width': ['case', ['get', 'selected'], 4, 2], 'line-dasharray': [3, 2] },
    },
    { id: 'point-marker', type: 'circle', source: 'points', slot: 'aboveLabels', style: 'point-marker', filter: ['!=', ['get', 'selected'], true] },
    { id: 'point-label', type: 'symbol', source: 'points', slot: 'aboveLabels', style: 'point-label', layout: { 'text-field': ['get', 'nameBn'] } },
  ],
  // No picker row: the globe's pills are the map's selector.
  controls: [],
  interactions: ['lines', 'areas', 'points'].map((source) => ({ on: 'click', target: `source:${source}`, do: tapDo })),
  sheet: {
    chip: { field: 'chipBn' },
    title: { field: 'nameBn' },
    rows: [
      row('valueBn', WORDS.latitude, { kind: 'parallel' }),
      row('valueBn', WORDS.longitude, { kind: 'meridian' }),
      row('valueBn', null, { kind: 'dateLine' }),
      row('valueBn', null, { group: 'point' }),
      row('factBn'),
      row('timeBn', WORDS.time),
      row('ruleBn'),
      row('whereBn', WORDS.where),
      row('latBn', WORDS.latitude),
      row('lonBn', WORDS.longitude),
      row('nearestBn', WORDS.nearestLand),
    ],
  },
};

// ---- write ---------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) {
  if (f !== IMAGERY_FILE && !OWN_FILES.includes(f)) fail(`${path.join(OUT, f)} is neither this build's nor the imagery's — remove it by hand if it is stale`);
}
const json = (v) => JSON.stringify(v, null, 2) + '\n';
const geojson = (fc) => JSON.stringify(fc) + '\n';
const written = {
  'descriptor.json': json(descriptor),
  'records.json': json(records),
  'lines.geojson': geojson(linesFc),
  'graticule.geojson': geojson(graticuleFc),
  'areas.geojson': geojson(areasFc),
};
for (const [f, text] of Object.entries(written)) fs.writeFileSync(path.join(OUT, f), text);

// ---- report --------------------------------------------------------------------------------
const bytes = (f) => fs.statSync(path.join(OUT, f)).size;
console.log(`${MAP_ID}: wrote ${OUT}`);
for (const f of OWN_FILES) console.log(`  ${f.padEnd(18)} ${String(bytes(f)).padStart(7)} B  sha256 ${sha256(fs.readFileSync(path.join(OUT, f))).slice(0, 16)}`);
if (fs.existsSync(path.join(OUT, IMAGERY_FILE))) console.log(`  ${IMAGERY_FILE.padEnd(18)} ${String(bytes(IMAGERY_FILE)).padStart(7)} B  (its own tool's)`);
else console.log(`  ${IMAGERY_FILE} missing — run tools/build-latitude-longitude-imagery.mjs`);
console.log(`records: ${Object.keys(records).length} (${selectable.filter((e) => e.group === 'line').length} lines, ${selectable.filter((e) => e.group === 'point').length} points, ${selectable.filter((e) => e.group === 'place').length} places); graticule every ${step}°: ${graticuleFeatures.length} lines`);
console.log(`date line: Natural Earth ${DATE_LINE.field} = ${DATE_LINE.value} (featurecla "${DATE_LINE.featurecla}"), ${lineFeatures.find((f) => f.properties.id === 'date-line').geometry.coordinates.length} parts`);
console.log(`tiling (${TILER}, MapLibre's GeoJSON options): ${proof.checked} line-tile pairs over z0–${PROVE_TO_ZOOM}, ${proof.lost.length} lost`);
console.log(`vertices on a clip edge, z0–${PROVE_TO_ZOOM}: parallels 0; meridians ${meridianHits.length} (at multiples of 45°, on an edge by construction); date line ${dateLineHits.length}${dateLineHits.length ? ` (${dateLineHits.slice(0, 4).join('; ')})` : ''}; areas ${areaHits.length}`);
console.log(`Bangladesh (COD-AB): ${bdExtent.map((v) => v.toFixed(5)).join(', ')}; simplified at ${SIMPLIFY_METRES} m`);
console.log(`geometry pins hold: ${Object.entries(drawn).map(([id, g]) => `${id} ${geometryHash(g)}`).join(', ')} (tools/latitude-longitude-pins.json)`);
for (const [id, names] of Object.entries(districtResults)) console.log(`${id}: ${names.length} districts — ${names.join(', ')} (as the seed)`);
console.log(`90°E meets 23°30′ N in ${meetDistricts[0]} (as the seed)`);
console.log(`frames: z${Math.max(...Object.values(records).map((r) => fitZoom(r.frame))).toFixed(2)} at most on a 390 px phone`);
console.log(`pending: 0 (the seed's one pending field, ${PENDING_ALLOWED}, filled from Natural Earth)`);
