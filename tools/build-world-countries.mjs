// Builds docs/shared/world-countries.json (IDX-3, 2026-10-08): every country of the pinned Natural Earth 10m admin-0
// file in Bangladesh's view, simplified once and stored as shared arcs, for any map that shades or taps countries
// (sources.<id>.sharedGeometry, decoded in docs/shell/app.js). No network.
//
//   node tools/build-world-countries.mjs [<out file>]
//
// - Key: ISO 3166-1 alpha-3 (ISO_A3; where Natural Earth has none, its own ADM0_A3 — Kosovo KOS, as every map has
//   it); each country also carries its ADM0_A3, the key the basemap's labels and earlier maps use.
// - Shapes: Douglas–Peucker at 12 km, as org-members' were (2026-10-07), with mapshaper's keep-shapes, so no country
//   — however small at the opening zoom — disappears; no self-crossing ring and no country holding another's
//   interior point, or the build fails.
// - Arcs: each shared border stored once; an arc is [x0, y0, dx1, dy1, …] in units of `quantum` degrees (as
//   bangladesh-districts.json). A country is a list of polygons, each a list of rings (outer first, then holes), each a
//   list of arc indices (~i: arc i reversed). `main` is the polygon its inner point (mapshaper's pole of
//   inaccessibility) falls in: a map's tap shape for the country.
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';
import { readSource } from './lib/geo.mjs';
import { innerPoints } from './lib/border-traces.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
const OUT = process.argv[2] ?? path.join(ROOT, 'docs', 'shared', 'world-countries.json');
const METRES = 12000;
const QUANTUM = 0.001;

const ne = readSource('ne_10m_admin_0_countries_bdg.geojson');
const keyOf = (p) => (p.ISO_A3 && p.ISO_A3 !== '-99' ? p.ISO_A3 : p.ADM0_A3);
const features = ne.features.map((f) => ({ type: 'Feature', properties: { iso3: keyOf(f.properties), adm0: f.properties.ADM0_A3 }, geometry: f.geometry }));
const dup = features.map((f) => f.properties.iso3).filter((k, i, all) => all.indexOf(k) !== i);
if (dup.length) throw new Error(`two shapes share a key: ${dup.join(', ')}`);

const out = await mapshaper.applyCommands(
  `-i in.json -simplify dp interval=${METRES} keep-shapes -o out.json format=topojson no-quantization`,
  { 'in.json': { type: 'FeatureCollection', features } },
);
const topo = JSON.parse(out['out.json'].toString());
const layer = Object.values(topo.objects)[0];
const q = (v) => Math.round(v / QUANTUM);
// Arcs quantised; an arc that quantises to a single point is kept as two equal points so indices stay valid.
const arcs = topo.arcs.map((arc) => {
  const pts = arc.map(([x, y]) => [q(x), q(y)]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (pts.length === 1) pts.push([...pts[0]]);
  const enc = [pts[0][0], pts[0][1]];
  for (let i = 1; i < pts.length; i++) enc.push(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return enc;
});
const decodeArc = (i) => {
  const a = arcs[i < 0 ? ~i : i];
  const pts = [];
  for (let k = 0, x = 0, y = 0; k < a.length; k += 2) { x += a[k]; y += a[k + 1]; pts.push([+(x * QUANTUM).toFixed(4), +(y * QUANTUM).toFixed(4)]); }
  return i < 0 ? pts.reverse() : pts;
};
const ringOf = (ids) => ids.flatMap((id, j) => decodeArc(id).slice(j ? 1 : 0));
const countries = [];
const decoded = [];
for (const g of layer.geometries.sort((a, b) => a.properties.iso3.localeCompare(b.properties.iso3))) {
  const polygons = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  if (!polygons.length) throw new Error(`${g.properties.iso3}: no shape left after simplification`);
  countries.push({ iso3: g.properties.iso3, adm0: g.properties.adm0, polygons });
  const coords = polygons.map((p) => p.map(ringOf));
  decoded.push({ type: 'Feature', properties: { id: g.properties.iso3 }, geometry: coords.length === 1 ? { type: 'Polygon', coordinates: coords[0] } : { type: 'MultiPolygon', coordinates: coords } });
}

// The checks org-members' shapes passed: no self-crossing ring; no country holding another's inner point.
const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const cross = (a, b, c, d) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
const ringsOfGeom = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat();
const inRing = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inside = (pt, g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((p) => inRing(pt, p[0]) && !p.slice(1).some((h) => inRing(pt, h)));
const crossed = decoded.filter((f) => ringsOfGeom(f.geometry).some((ring) => { const n = ring.length - 1; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (cross(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true; } return false; })).map((f) => f.properties.id);
const points = await innerPoints(decoded);
const overlap = [];
for (const a of decoded) for (const b of decoded) if (a !== b && inside(points[a.properties.id], b.geometry)) overlap.push(`${a.properties.id} in ${b.properties.id}`);
if (crossed.length || overlap.length) throw new Error(`simplification at ${METRES} m: self-crossing ${crossed.join(', ') || 'none'}; inner point inside another country ${overlap.join(', ') || 'none'}`);
for (const [k, c] of countries.entries()) {
  const g = decoded[k].geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const hit = polys.findIndex((p) => inRing(points[c.iso3], p[0]) && !p.slice(1).some((h) => inRing(points[c.iso3], h)));
  c.main = hit < 0 ? 0 : hit;
}

const file = {
  _about: 'Built by tools/build-world-countries.mjs; do not edit. Every country of Natural Earth 10m admin-0 (v5.1.2, the Bangladesh point of view: ne_10m_admin_0_countries_bdg.geojson, pinned in tools/sources.json; public domain), simplified once (Douglas–Peucker 12 km, keep-shapes) and stored as shared arcs. Key: ISO 3166-1 alpha-3 (Natural Earth\'s ADM0_A3 where it has none: Kosovo KOS). An arc is [x0, y0, dx1, dy1, …] in units of `quantum` degrees; a country is polygons → rings (outer first) → arc indices (~i reversed); `main` is the polygon its inner point falls in.',
  quantum: QUANTUM,
  arcs,
  countries,
};
fs.writeFileSync(OUT, JSON.stringify(file) + '\n');
// The smallest kept countries (area of the shape as drawn, in square degrees scaled by the cosine of latitude).
const area = (ring) => Math.abs(ring.reduce((s, [x, y], i) => s + (ring[(i + 1) % ring.length][0] - x) * (ring[(i + 1) % ring.length][1] + y), 0) / 2);
const kmArea = (f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).reduce((s, p) => s + area(p[0]) * Math.cos((p[0][0][1] * Math.PI) / 180) * 12364, 0);
const smallest = decoded.map((f) => [f.properties.id, kmArea(f)]).sort((a, b) => a[1] - b[1]).slice(0, 6);
console.log(`${countries.length} countries, ${arcs.length} arcs, ${fs.statSync(OUT).size} bytes; smallest drawn: ${smallest.map(([k, a]) => `${k} ${a < 1 ? a.toFixed(2) : Math.round(a)} km²`).join(', ')}`);
