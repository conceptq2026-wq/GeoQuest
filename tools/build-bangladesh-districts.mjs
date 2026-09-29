// Builds docs/shared/bangladesh-districts.json: Bangladesh's 64 districts as
// COD-AB draws them, simplified, with their Bengali names — one shared file
// that any diagram reads through the resolver's 'sharedData' kind, so a device
// fetches and caches it once.
//
//   node tools/build-bangladesh-districts.mjs [out]
//
// Reads, and never writes: COD-AB's zip (tools/.cache, pinned as
// codAbBangladesh in tools/sources.json) for the boundaries, and
// tools/sources/bangladesh-names.json for the Bengali names — the names the
// Bangladesh basemap already uses, from bangladesh.gov.bd, since COD-AB has
// none. No network. Output is deterministic: a second build writes the same
// bytes, and tools/verify.mjs rebuilds it and compares.
//
// The file is a small topology: every boundary between two districts, and
// every stretch of Bangladesh's own outline, is one arc, stored once and
// simplified once, so neighbours share their edge exactly. An arc is a flat
// list of integers in 1e-4 degrees — the first point whole, then deltas. A
// district's ring lists arc indices; ~i (that is, −i−1) means arc i reversed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, zipEntry } from './lib/geo.mjs';
import { simplify } from './lib/rivers-frame.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where the file goes, and what it reads. Change here if one moves.
const DEFAULT_OUT = path.join(ROOT, 'docs/shared/bangladesh-districts.json');
const NAMES = path.join(HERE, 'sources/bangladesh-names.json');
const SOURCES = path.join(HERE, 'sources.json');
const ADMIN2 = 'bgd_admin2.geojson';
// Douglas–Peucker per arc, in degrees (about 220 m: the rivers' own drawing tolerance at their scale).
const TOL = 0.002;
// Coordinates are stored in units of this many degrees.
const Q = 1e-4;
// The district count COD-AB v03 has.
const DISTRICTS = 64;

const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? DEFAULT_OUT);
const fail = (msg) => {
  throw new Error(`bangladesh-districts: ${msg}`);
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const codab = JSON.parse(fs.readFileSync(SOURCES, 'utf8')).codAbBangladesh;
const zip = fs.readFileSync(path.join(CACHE, codab.file));
if (zip.length !== codab.size || sha256(zip) !== codab.sha256) fail(`${codab.file} is not the pinned file`);
const admin2 = zipEntry(zip, ADMIN2);
const names = JSON.parse(fs.readFileSync(NAMES, 'utf8')).bangladesh;
if (admin2.features.length !== DISTRICTS) fail(`COD-AB has ${admin2.features.length} districts, not ${DISTRICTS}`);

// ---- the edges, and who owns each ----------------------------------------------------------

const key = (p) => `${p[0]},${p[1]}`;
const features = [...admin2.features].sort((a, b) => a.properties.adm2_pcode.localeCompare(b.properties.adm2_pcode));
const rings = []; // { pcode, pts }
for (const f of features) {
  const pcode = f.properties.adm2_pcode;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys)
    for (const ring of poly) {
      const pts = ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
      if (key(pts[0]) !== key(pts.at(-1))) pts.push(pts[0]);
      if (pts.length >= 4) rings.push({ pcode, pts });
    }
}
const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const owners = new Map(); // edge → sorted owner list
const incident = new Map(); // vertex → set of edge keys
for (const { pcode, pts } of rings)
  for (let i = 1; i < pts.length; i++) {
    const a = key(pts[i - 1]);
    const b = key(pts[i]);
    const e = edgeKey(a, b);
    const o = owners.get(e) ?? [];
    if (!o.includes(pcode)) o.push(pcode);
    owners.set(e, o);
    for (const v of [a, b]) {
      if (!incident.has(v)) incident.set(v, new Set());
      incident.get(v).add(e);
    }
  }
const sig = (e) => owners.get(e).slice().sort().join('+');
// A node is where arcs meet: not exactly two edges, or two edges owned differently.
const isNode = (v) => {
  const es = [...incident.get(v)];
  return es.length !== 2 || sig(es[0]) !== sig(es[1]);
};

// ---- the arcs: each ring cut at its nodes, every chain kept once ----------------------------------

const arcs = []; // arrays of [lon, lat]
const arcIndex = new Map(); // canonical chain key → index
const districtRings = new Map(features.map((f) => [f.properties.adm2_pcode, []]));
for (const { pcode, pts } of rings) {
  const ks = pts.map(key);
  const n = ks.length - 1; // closed: ks[n] === ks[0]
  let start = -1;
  for (let i = 0; i < n; i++) if (isNode(ks[i])) { start = i; break; }
  // A ring with no node (an island, or an enclave with one neighbour) starts at its smallest vertex.
  if (start < 0) start = ks.slice(0, n).reduce((best, k, i) => (k < ks[best] ? i : best), 0);
  const order = [...Array(n + 1).keys()].map((j) => (start + j) % n);
  const refs = [];
  let chain = [order[0]];
  for (let j = 1; j <= n; j++) {
    const i = order[j];
    chain.push(i);
    if (j === n || isNode(ks[i])) {
      const fwd = chain.map((c) => ks[c]).join(';');
      const rev = chain.map((c) => ks[c]).reverse().join(';');
      const canon = fwd < rev ? fwd : rev;
      let idx = arcIndex.get(canon);
      if (idx === undefined) {
        idx = arcs.length;
        arcIndex.set(canon, idx);
        const coords = (fwd <= rev ? chain : chain.slice().reverse()).map((c) => pts[c]);
        arcs.push(coords);
      }
      refs.push(fwd <= rev ? idx : ~idx);
      chain = [i];
    }
  }
  districtRings.get(pcode).push(refs);
}

// ---- simplified once, quantised, delta-encoded ------------------------------------------------------

const simplifyArc = (pts) => {
  if (key(pts[0]) !== key(pts.at(-1))) return simplify(pts, TOL);
  // A closed arc: split at the point furthest from its start, so both halves keep their ends.
  let far = 1;
  let farD = -1;
  pts.forEach((p, i) => {
    const d = (p[0] - pts[0][0]) ** 2 + (p[1] - pts[0][1]) ** 2;
    if (d > farD) (farD = d), (far = i);
  });
  return [...simplify(pts.slice(0, far + 1), TOL), ...simplify(pts.slice(far), TOL).slice(1)];
};
const encoded = arcs.map((pts) => {
  const q = simplifyArc(pts).map(([x, y]) => [Math.round(x / Q), Math.round(y / Q)]);
  const out = [q[0][0], q[0][1]];
  for (let i = 1; i < q.length; i++) {
    const dx = q[i][0] - q[i - 1][0];
    const dy = q[i][1] - q[i - 1][1];
    if (dx || dy || i === q.length - 1) out.push(dx, dy);
  }
  return out;
});

const districts = features.map((f) => {
  const p = f.properties;
  const name = names[p.adm2_pcode];
  if (!name || name.level !== 'district' || !name.nameBn) fail(`no Bengali name for ${p.adm2_pcode} (${p.adm2_name}) in ${path.relative(ROOT, NAMES)}`);
  return { pcode: p.adm2_pcode, bn: name.nameBn, en: p.adm2_name, division: p.adm1_pcode, rings: districtRings.get(p.adm2_pcode) };
});

const file = {
  _about: `Built by tools/build-bangladesh-districts.mjs; do not edit. Bangladesh's ${DISTRICTS} districts: boundaries from COD-AB v03 (${ADMIN2}), each arc simplified once (Douglas–Peucker ${TOL}°) and stored once; Bengali names as the Bangladesh basemap has them (bangladesh.gov.bd, tools/sources/bangladesh-names.json), since COD-AB has none. An arc is [x0, y0, dx1, dy1, …] in units of ${Q}° (x longitude, y latitude); a district's ring lists arc indices, ~i meaning arc i reversed. An arc used by two districts is a boundary between them; one used once is Bangladesh's outline.`,
  credit: { boundaries: 'Bangladesh administrative boundaries (COD-AB, v03) — Bangladesh Bureau of Statistics / OCHA, CC BY-IGO 3.0', names: 'বাংলাদেশ জাতীয় তথ্য বাতায়ন (bangladesh.gov.bd)' },
  quantum: Q,
  arcs: encoded,
  districts,
};
const text = JSON.stringify(file) + '\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text);
const shared = arcs.filter((_, i) => districts.reduce((n, d) => n + d.rings.flat().filter((r) => (r < 0 ? ~r : r) === i).length, 0) === 2).length;
console.log(`bangladesh-districts: ${districts.length} districts, ${arcs.length} arcs (${shared} between two districts), ${encoded.reduce((n, a) => n + a.length / 2, 0)} points; wrote ${path.relative(ROOT, OUT) || OUT}: ${Buffer.byteLength(text)} B, sha256 ${sha256(Buffer.from(text)).slice(0, 12)}…`);
