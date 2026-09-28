// For the user's review of liberation-war-1971's sector outlines: the book's
// sector map next to the traced sectors, numbered, drawn on COD-AB's districts
// in the same frame, so the two can be compared line by line.
//
//   node tools/review-liberation-sectors.mjs
//
// Reads the page scan from tools/.cache (it stays out of git: copyright) and
// writes tools/.cache/liberation-war-1971/sectors-review.png. Nothing is fetched.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CACHE, zipEntry } from './lib/geo.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where the inputs and the output live. Change here if they move.
const DATA = path.join(ROOT, 'data-sources', 'liberation-war-1971');
const WORK = path.join(CACHE, 'liberation-war-1971');
const SCAN = path.join(WORK, 'sectormap', 'raw-000.png');
const OUT = path.join(WORK, 'sectors-review.png');
const SCALE = 3;
const BROWSERS = [process.env.CHECK_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/microsoft-edge', '/usr/bin/google-chrome'].filter(Boolean);

const trace = JSON.parse(fs.readFileSync(path.join(DATA, 'sector-trace.json'), 'utf8'));
const scan = fs.readFileSync(SCAN);
if (crypto.createHash('sha256').update(scan).digest('hex') !== trace.scan.imageSha256) throw new Error(`${SCAN} is not the scan sector-trace.json was read from`);
const fc = JSON.parse(fs.readFileSync(path.join(DATA, 'sectors.geojson'), 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(DATA, 'liberation-war-1971.seed.json'), 'utf8'));
const sources = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));
const zip = fs.readFileSync(path.join(CACHE, sources.codAbBangladesh.file));
if (zip.length !== sources.codAbBangladesh.size || crypto.createHash('sha256').update(zip).digest('hex') !== sources.codAbBangladesh.sha256) throw new Error('COD-AB zip does not match its pin');
const districts = zipEntry(zip, 'bgd_admin2.geojson').features;

// The same fit as the build's equirectangular model: lon and lat each affine in
// the scan's pixels, by least squares over the control points; inverted here.
function lsq(rows, ys) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
  rows.forEach((r, k) => { for (let i = 0; i < 3; i++) { b[i] += r[i] * ys[k]; for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; } });
  for (let i = 0; i < 3; i++) { const p = A[i][i]; for (let j = i + 1; j < 3; j++) { const f = A[j][i] / p; for (let k = i; k < 3; k++) A[j][k] -= f * A[i][k]; b[j] -= f * b[i]; } }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) x[i] = (b[i] - A[i].slice(i + 1).reduce((s, a, k) => s + a * x[i + 1 + k], 0)) / A[i][i];
  return x;
}
const rows = trace.controlPoints.map((c) => [c.px[0], c.px[1], 1]);
const X = lsq(rows, trace.controlPoints.map((c) => c.ll[0]));
const Y = lsq(rows, trace.controlPoints.map((c) => c.ll[1]));
const det = X[0] * Y[1] - X[1] * Y[0];
const px = ([lon, lat]) => { const a = lon - X[2], b = lat - Y[2]; return [((Y[1] * a - X[1] * b) / det) * SCALE, ((-Y[0] * a + X[0] * b) / det) * SCALE]; };
// A ring in screen space, keeping a vertex only once it is a pixel from the last kept one.
const d = (rings) => rings.map((r) => {
  const kept = [];
  for (const p of r.map(px)) if (!kept.length || Math.hypot(p[0] - kept.at(-1)[0], p[1] - kept.at(-1)[1]) >= 1) kept.push(p);
  return 'M' + kept.map((p) => p.map((v) => v.toFixed(1)).join(',')).join('L') + 'Z';
}).join('');
const parts = (g) => (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]);

const W = 351 * SCALE, H = 429 * SCALE;
const BN = (n) => String(n).replace(/\d/g, (c) => '০১২৩৪৫৬৭৮৯'[c]);
const FILL = { 1: '#f4a3a8', 2: '#9fd8a6', 3: '#a9c4f5', 4: '#f9c48d', 5: '#c9a8e8', 6: '#9fe3ee', 7: '#f5a8e0', 8: '#dcef9a', 9: '#9cd1c7', 11: '#d8bc94' };
const sectorPaths = fc.features.map((f) => `<path d="${parts(f.geometry).map((p) => d(p)).join('')}" fill="${FILL[f.properties.sector]}" fill-rule="evenodd" stroke="#1d2b4f" stroke-width="2.2" stroke-linejoin="round"/>`).join('');
const districtPaths = districts.map((f) => `<path d="${parts(f.geometry).map((p) => d([p[0]])).join('')}" fill="none" stroke="#5b6475" stroke-width="0.8" stroke-opacity="0.55"/>`).join('');
const numbers = Object.entries(trace.labels).map(([k, [x, y]]) => `<g transform="translate(${x * SCALE},${y * SCALE})"><circle r="24" fill="#fff" stroke="#1d2b4f" stroke-width="2"/><text y="10" text-anchor="middle" font-size="30" font-weight="700" fill="#1d2b4f">${BN(k)}</text></g>`).join('');
const ports = (seed.sectors['10']?.ports ?? []).filter((p) => p.point && 'lon' in p.point).map((p) => { const [x, y] = px([p.point.lon, p.point.lat]); return `<g transform="translate(${x},${y})"><path d="M0,-11 L10,6 L-10,6 Z" fill="#0b5cad" stroke="#fff" stroke-width="1.5"/><text x="14" y="6" font-size="20" font-weight="600" fill="#0b5cad" paint-order="stroke" stroke="#fff" stroke-width="4">${p.labelBn} (১০)</text></g>`; }).join('');

const g = fc.properties.georeference;
const cap = (t) => `<div style="font:600 22px/1.3 'Nirmala UI','Noto Sans Bengali',sans-serif;color:#1d2b4f;margin:0 0 10px">${t}</div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:'Nirmala UI','Noto Sans Bengali',sans-serif}.row{display:flex;gap:28px;padding:24px}</style></head><body>
<div style="padding:24px 24px 0;font:500 20px/1.4 sans-serif;color:#333">liberation-war-1971 — sector outlines for review. Georeference: ${g.controlPoints} control points, RMS ${g.rmsKm} km (${g.model}); internal lines snapped to COD-AB within ${fc.properties.snapKm} km; outer edge COD-AB. Both panels share one frame. Sector 10 has no area: its four ports are marked ▲.</div>
<div class="row"><div>${cap('NCTB «বাংলাদেশ ও বিশ্বপরিচয়», অষ্টম শ্রেণি, পৃ. ২৬ (scan — not in git)')}<img src="data:image/png;base64,${scan.toString('base64')}" width="${W}" height="${H}" style="display:block;border:1px solid #bbb"></div>
<div>${cap('Traced: data-sources/liberation-war-1971/sectors.geojson on COD-AB districts')}<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="display:block;border:1px solid #bbb;background:#eef3f8">${sectorPaths}${districtPaths}${numbers}${ports}</svg></div></div></body></html>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-review-'));
const page = path.join(tmp, 'review.html');
fs.writeFileSync(page, html);
const exe = BROWSERS.find((b) => fs.existsSync(b));
if (!exe) throw new Error('no Edge or Chrome found; set CHECK_BROWSER');
const shot = path.join(tmp, 'review.png'); // the browser writes into its own temp folder; copied out below
execFileSync(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${path.join(tmp, 'profile')}`, `--window-size=${W * 2 + 28 + 48 + 4},${H + 150}`, `--screenshot=${shot}`, 'file:///' + page.split('\\').join('/')], { stdio: 'ignore' });
// Edge's launcher can return before its browser process has written the file: wait for it to settle.
const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
for (let t = 0, last = -1; t < 120; t++, nap(500)) {
  const size = fs.existsSync(shot) ? fs.statSync(shot).size : -1;
  if (size > 0 && size === last) break;
  last = size;
}
if (!fs.existsSync(shot)) throw new Error(`${exe} wrote no screenshot`);
fs.copyFileSync(shot, OUT);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${path.relative(ROOT, OUT)}  ${fs.statSync(OUT).size} bytes`);
