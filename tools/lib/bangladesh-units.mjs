// The units bangladesh.pmtiles is drawn from — Bangladesh as COD-AB draws it,
// India's districts, Myanmar's states and the other countries' point-of-view
// polygons — Bangladesh's land border, and who owns the land between them.
//
// build-bangladesh.mjs draws these; build-janapadas.mjs unions them into
// janapada areas. One module, so the basemap and the areas cannot disagree
// about where a unit ends.
import mapshaper from 'mapshaper';
import { bangladeshLineClass, featureCollection } from './geo.mjs';
import { COVERAGE } from '../bangladesh.config.mjs';

// Myanmar's Rakhine State in Natural Earth admin-1.
export const RAKHINE = 'MMR-3273';
// The countries the box holds, by their Bangladesh point-of-view polygons.
export const POV = ['BGD', 'IND', 'MMR', 'NPL', 'BTN', 'CHN'];

const fc = featureCollection;
async function ms(cmd, files, target) {
  const out = await mapshaper.applyCommands(`${cmd} -o ${target ? `target=${target} ` : ''}out.json format=geojson geojson-type=FeatureCollection`, files);
  return JSON.parse(out['out.json'].toString());
}

export const linesOf = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
export const ringsOf = (g) => (g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []);
export const bboxOf = (rings) => {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (const [x, y] of r) (b[0] = Math.min(b[0], x)), (b[1] = Math.min(b[1], y)), (b[2] = Math.max(b[2], x)), (b[3] = Math.max(b[3], y));
  return b;
};
export const inRing = ([x, y], ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
export const inPolygon = (pt, g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)));
export const lineKm = (c) => c.slice(1).reduce((d, b, i) => d + Math.hypot((b[0] - c[i][0]) * Math.cos((c[i][1] * Math.PI) / 180), b[1] - c[i][1]) * 111.32, 0);
export const kmBetween = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180), a[1] - b[1]) * 111.32;
export const endKey = (p) => p.map((v) => v.toFixed(6)).join();

/*
 * Nearest point on a set of polylines, through a grid of their segments —
 * the lines here run to hundreds of thousands of vertices.
 */
export class SegmentGrid {
  constructor(lines, cell = 0.02) {
    this.cell = cell;
    this.cells = new Map();
    for (const line of lines) for (let i = 1; i < line.length; i++) this.add(line[i - 1], line[i]);
  }
  add(a, b) {
    const c = this.cell;
    for (let ix = Math.floor(Math.min(a[0], b[0]) / c); ix <= Math.floor(Math.max(a[0], b[0]) / c); ix++)
      for (let iy = Math.floor(Math.min(a[1], b[1]) / c); iy <= Math.floor(Math.max(a[1], b[1]) / c); iy++) {
        const k = ix * 100000 + iy;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push([a[0], a[1], b[0], b[1]]);
      }
  }
  /** { km, at } for the nearest point within maxKm, or null. */
  nearest(p, maxKm) {
    const c = this.cell;
    const k = Math.cos((p[1] * Math.PI) / 180);
    const r = maxKm / 111.32;
    let best = null;
    let bestD = Infinity;
    for (let ix = Math.floor((p[0] - r / k) / c); ix <= Math.floor((p[0] + r / k) / c); ix++)
      for (let iy = Math.floor((p[1] - r) / c); iy <= Math.floor((p[1] + r) / c); iy++)
        for (const [ax, ay, bx, by] of this.cells.get(ix * 100000 + iy) ?? []) {
          const dx = (bx - ax) * k;
          const dy = by - ay;
          const t = Math.max(0, Math.min(1, (((p[0] - ax) * k) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
          const d = Math.hypot((p[0] - ax) * k - t * dx, p[1] - ay - t * dy);
          if (d < bestD) (bestD = d), (best = [ax + t * (bx - ax), ay + t * (by - ay)]);
        }
    return best && bestD * 111.32 <= maxKm ? { km: bestD * 111.32, at: best } : null;
  }
}

function nearestUnit(point, candidates) {
  let best = null;
  let bestD = Infinity;
  const [px, py] = point;
  const k = Math.cos((py * Math.PI) / 180);
  for (const u of candidates) {
    const [w, s, e, n] = u.bbox;
    if (px < w - bestD / k || px > e + bestD / k || py < s - bestD || py > n + bestD) continue;
    for (const ring of u.rings)
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1];
        const [bx, by] = ring[i];
        const dx = (bx - ax) * k;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, (((px - ax) * k) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot((px - ax) * k - t * dx, py - ay - t * dy);
        if (d < bestD) (bestD = d), (best = u);
      }
  }
  return { unit: best, km: bestD * 111.32 };
}

/**
 * Everything both builds need, from the pinned inputs each build has already
 * read and checked: the COD-AB zip's admin0, geoBoundaries India, the OSM land
 * snapshot, Natural Earth's point-of-view countries, admin-1 and boundary
 * lines, and the names table.
 */
export async function bangladeshUnits({ bd0, gbIndia, landIn, countries, admin1, neLines, names }) {
  /*
   * UNITS. Bangladesh by COD-AB pcode. India by geoBoundaries shapeName, but
   * only as the name the names table records for a district the Local
   * Government Directory lists, and only inside COVERAGE: each must match
   * exactly once. Rakhine by Natural Earth's adm1_code.
   */
  const inCoverage = await ms(`-i in.json -clip bbox=${COVERAGE}`, { 'in.json': gbIndia });
  const indiaUnits = new Map(); // geoBoundaries shapeName → names-table entry
  for (const [key, unit] of Object.entries(names.india)) {
    const hits = inCoverage.features.filter((f) => f.properties.shapeName === unit.geoBoundaries);
    if (hits.length !== 1) throw new Error(`${key}: geoBoundaries "${unit.geoBoundaries}" matches ${hits.length} features inside COVERAGE`);
    indiaUnits.set(unit.geoBoundaries, { key, ...unit, shapeID: hits[0].properties.shapeID });
  }
  const focusIndia = (shapeName) => indiaUnits.get(shapeName)?.state;

  const pov = Object.fromEntries(
    await Promise.all(
      POV.map(async (a3) => [a3, (await ms(`-i in.json -clip bbox=${COVERAGE}`, { 'in.json': fc(countries.features.filter((f) => f.properties.ADM0_A3 === a3)) })).features]),
    ),
  );

  /*
   * BANGLADESH'S LAND BORDER — the government's line. COD-AB's outline is
   * coast and land border in one ring. The land border is the stretch of the
   * mainland ring between the two places where Natural Earth's own Bangladesh
   * lines meet the sea — in the Sundarbans and in the Naf — taken as the ring
   * vertices nearest those two ends, together with the whole ring of any part
   * the land surrounds (the Dahagram–Angarpota exclave). Every other part is
   * an island, all coast.
   */
  const bd = fc(bd0.features.map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })));
  const bdParts = bd0.features[0].geometry.coordinates;
  const neBangladesh = neLines.features.filter((f) => bangladeshLineClass(f.properties) !== null && [f.properties.ADM0_A3_L, f.properties.ADM0_A3_R].includes('BGD'));
  const neBangladeshParts = neBangladesh.flatMap((f) => linesOf(f.geometry).map((c) => ({ c, with: f.properties.ADM0_A3_L === 'BGD' ? f.properties.ADM0_A3_R : f.properties.ADM0_A3_L })));
  const endCount = new Map();
  for (const { c } of neBangladeshParts) for (const p of [c[0], c[c.length - 1]]) endCount.set(endKey(p), (endCount.get(endKey(p)) ?? 0) + 1);
  const seaEnds = neBangladeshParts.flatMap(({ c }) => [c[0], c[c.length - 1]]).filter((p) => endCount.get(endKey(p)) === 1);
  if (seaEnds.length !== 2) throw new Error(`Natural Earth's Bangladesh lines have ${seaEnds.length} free ends, not the two where they meet the sea`);

  const mainIndex = bdParts.reduce((a, p, i) => (p[0].length > bdParts[a][0].length ? i : a), 0);
  const mainRing = bdParts[mainIndex][0].slice(0, -1);
  const nearestVertex = (pt) => mainRing.reduce((best, v, i) => (kmBetween(v, pt) < kmBetween(mainRing[best], pt) ? i : best), 0);
  const [ia, ib] = seaEnds.map(nearestVertex).sort((a, b) => a - b);
  const pathA = mainRing.slice(ia, ib + 1);
  const pathB = [...mainRing.slice(ib), ...mainRing.slice(0, ia + 1)];
  // The land border runs beside Natural Earth's line; the coast runs away from it.
  const neGrid = new SegmentGrid(neBangladeshParts.map((x) => x.c));
  const meanOff = (p) => {
    const step = Math.max(1, Math.floor(p.length / 400));
    const ds = [];
    for (let i = 0; i < p.length; i += step) ds.push(neGrid.nearest(p[i], 50)?.km ?? 50);
    return ds.reduce((a, b) => a + b, 0) / ds.length;
  };
  const mainland = meanOff(pathA) < meanOff(pathB) ? pathA : pathB;
  // A part the land surrounds: every point just outside its bounding box is on land.
  const landDetailAll = landIn.features.filter((f) => f.properties.set === 'detail');
  const onLand = (pt) => landDetailAll.some((f) => inPolygon(pt, f.geometry));
  const surrounded = bdParts
    .map((p, i) => ({ ring: p[0], i }))
    .filter(({ i }) => i !== mainIndex)
    .filter(({ ring }) => {
      const [w, s, e, n] = bboxOf([ring]).map((v, j) => v + (j < 2 ? -0.02 : 0.02));
      return [[w, s], [e, s], [e, n], [w, n], [(w + e) / 2, s], [(w + e) / 2, n], [w, (s + n) / 2], [e, (s + n) / 2]].every(onLand);
    });
  const landBorderLines = [mainland, ...surrounded.map(({ ring }) => ring)];
  const borderGrid = new SegmentGrid(landBorderLines);
  // It must run beside Natural Earth's line all the way, or the wrong stretch was taken.
  const worstOff = Math.max(...landBorderLines.flatMap((c) => c.filter((_, i) => i % 50 === 0).map((p) => neGrid.nearest(p, 20)?.km ?? 20)));
  if (worstOff > 12) throw new Error(`the land border strays ${worstOff.toFixed(1)} km from Natural Earth's Bangladesh line — the wrong stretch of the outline was taken`);

  // Every other unit yields to Bangladesh as COD-AB draws it, and to the
  // point-of-view polygons of the other countries.
  const others = (...a3s) => fc([...bd.features, ...a3s.flatMap((x) => pov[x])]);
  const indiaDistricts = await ms('-i combine-files d.json o.json -target d -erase source=o -filter-fields shapeName,shapeID', { 'd.json': inCoverage, 'o.json': others('MMR', 'NPL', 'BTN', 'CHN') }, 'd');
  const myanmarAll = await ms(`-i in.json -clip bbox=${COVERAGE} -filter-fields adm1_code,name`, { 'in.json': fc(admin1.features.filter((f) => f.properties.adm0_a3 === 'MMR')) });
  const myanmarStates = await ms('-i combine-files s.json o.json -target s -erase source=o', { 's.json': myanmarAll, 'o.json': others('IND', 'NPL', 'BTN', 'CHN') }, 's');
  if (myanmarStates.features.filter((f) => f.properties.adm1_code === RAKHINE).length !== 1) throw new Error(`${RAKHINE} (Rakhine) must match exactly once`);

  const units = [
    ...bd.features.map((f) => ({ ...f, properties: { unit: 'BGD', country: 'BGD', focus: true } })),
    ...indiaDistricts.features.map((f) => ({ ...f, properties: { unit: f.properties.shapeName, country: 'IND', focus: !!focusIndia(f.properties.shapeName) } })),
    ...myanmarStates.features.map((f) => ({ ...f, properties: { unit: f.properties.adm1_code, country: 'MMR', focus: f.properties.adm1_code === RAKHINE } })),
    ...['NPL', 'BTN', 'CHN'].flatMap((a3) => pov[a3].map((f) => ({ ...f, properties: { unit: a3, country: a3, focus: false } }))),
  ];

  /*
   * THE LAND BETWEEN. District edges from geoBoundaries and Natural Earth do
   * not lie on Bangladesh's border, and no source's coast lies on OSM's. The
   * land between them belongs to no unit. A piece that touches Bangladesh's
   * border lies outside it — the border is COD-AB's own edge — so it goes to
   * the nearest unit across the border. Any other piece goes to the nearest
   * unit of the country whose point-of-view polygon holds it.
   */
  // Distances are measured against lightly simplified units: 100 m is far below what a piece can be off by.
  const unitIndex = (await ms('-i in.json -simplify dp interval=100 keep-shapes', { 'in.json': fc(units) })).features.map((f) => {
    const rings = ringsOf(f.geometry);
    return { ...f.properties, rings, bbox: bboxOf(rings) };
  });
  const acrossBorder = unitIndex.filter((u) => u.country !== 'BGD');
  // On the border: within a metre of it — the erase leaves the piece's edge on it exactly.
  const touchesBorder = (g) => ringsOf(g).some((r) => r.some((p) => borderGrid.nearest(p, 0.001)));
  /** The land inside `box` that no unit owns, in pieces of more than 0.01 km², each with a point inside it. */
  const unownedPieces = async (land, box) => {
    const gaps = await ms(`-i combine-files l.json u.json -target l -clip bbox=${box} -erase source=u -explode -filter "this.area > 1e4"`, { 'l.json': land, 'u.json': fc(units) }, 'l');
    const points = await ms('-i in.json -points inner', { 'in.json': gaps });
    return gaps.features.map((piece, i) => ({ piece, point: points.features[i].geometry.coordinates }));
  };
  /** Which unit a piece joins, and whether it lies on Bangladesh's border. */
  const ownerOf = ({ piece, point }) => {
    const onBorder = touchesBorder(piece.geometry);
    const home = POV.find((a3) => pov[a3].some((f) => inPolygon(point, f.geometry)));
    const { unit } = nearestUnit(point, onBorder ? acrossBorder : home ? unitIndex.filter((u) => u.country === home) : unitIndex);
    return { unit, onBorder };
  };

  return {
    inCoverage, indiaUnits, pov, bd, neBangladeshParts, mainland, landBorderLines, borderGrid, landDetailAll,
    others, indiaDistricts, myanmarAll, myanmarStates, units, touchesBorder, unownedPieces, ownerOf,
  };
}
