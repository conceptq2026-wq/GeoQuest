// The end-of-prompt check, in text: one command, and everything it starts it
// closes on exit.
//
//   node tools/check.mjs <id>              the item, used as a student would
//   node tools/check.mjs <id> --sizes=320,390,768,1280   … at these widths instead of 390 and 320
//   node tools/check.mjs --fixture=<dir>   a test map outside docs/, served as a map of its own
//   node tools/check.mjs --baseline        every registry entry, stored
//   node tools/check.mjs --all             every registry entry, against the stored baseline
//   node tools/check.mjs <id> --live       the live site against the pushed files
//   node tools/check.mjs <id> --live --since=<rev>   … from <rev> rather than the last push
//
// <id> serves the local preview's copy of docs/ (tools/preview.mjs, so work
// in progress is on its home page) and, at 390×844 and 320×640 (or --sizes) in headless
// Edge with reduced motion: opens the home page and checks the item's card
// is in its section; opens the item from that card; steps through every
// picker item (‹ › and the dropdown's options) — on a map whose tabs divide
// its records, in every tab — or every timeline dot, or a
// diagram's every slab, or its picker items and tap zones (a thin zone's
// depth checked against 44 px), and checks each card opens; taps every record drawn
// on the map at a point where it alone is under the finger, and checks a card
// opens; and reports console messages and any request to a host but ours.
// On a map with view tabs (views) it also frames each picker group's first
// record in every tab past the first and taps a tab a selection disables; a
// tab's taps skip what its `hide` takes off the map, and a record whose
// selection disables the tab (the other tab taps it); on a map with a
// `tapFilter` source each record counts once per tab, reached by any source;
// on a map with chips it presses each chip of each tab and checks that only its
// members stay drawn, then releases it; a cards-only tab's card is the
// selected card of its list;
// with minTextSize it scans the page and the style for smaller text; the zoom
// each picker step's frame settles at goes to <size>-frames.txt.
// Screenshots go to tools/.check/<id>/ as contact sheets, never to stdout. A
// work-in-progress item with nothing built yet opens the preview's «কাজ চলছে»
// page, and only its card and that page are checked.
//
// --fixture=<dir> proves a shell capability on a test map kept outside docs/
// (tools/fixtures/<name>/: a descriptor and its files, never published): the
// preview copies it in as maps/<name>/ with a registry entry of its own, and
// it is checked as an <id> is, with its sheets in tools/.check/<name>/.
//
// --baseline and --all open every registry entry at both sizes and keep, or
// compare, its requests (with their Range headers), its console and its
// camera once settled — a shell change's proof, as text; no pixels.
//
// --live makes no browser: it polls the live site, every 30 s for at most
// 10 minutes, until it serves the pushed registry.json, then compares the
// SHA-256 of EVERY file under docs/ that the push changed — the range from the
// old origin/main to the new, read from the remote-tracking ref's reflog
// (origin/main@{1}..origin/main), or from --since=<rev> — and of
// registry.json, with the live files; a file the range deleted must be gone
// (404). The live address is DEPLOYMENT.md's, the one place it is written.
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSite, serveSite } from './preview.mjs';
import { UA } from './net.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// The served tree, the work in progress, where output goes, and where the live address is written.
const DOCS = path.join(ROOT, 'docs');
const WIP = path.join(HERE, 'wip.json');
const OUT = path.join(HERE, '.check');
const BASELINE = path.join(OUT, 'baseline.json');
const DEPLOYMENT = path.join(ROOT, 'DEPLOYMENT.md');
const SITE_COPY = path.join(os.tmpdir(), 'geoquest-check', 'site');

const SIZES = [
  [390, 844],
  [320, 640],
];
// --sizes=<w,…> (an <id> only): the widths to use, each at the height a screen of that width has.
const HEIGHT = { 320: 640, 360: 780, 390: 844, 412: 915, 768: 1024, 1024: 768, 1280: 800, 1920: 1080 };
// The site is served under a subpath, as the live site is, so a path that
// assumes the host's root fails here too.
const PREFIX = '/geoquest/';
const SHEETS = '/__check/';
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BROWSERS = [
  process.env.CHECK_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const seconds = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
const tag = ([w, h]) => `${w}x${h}`;

// ---- arguments ------------------------------------------------------------------------

const args = process.argv.slice(2);
const since = args.find((a) => a.startsWith('--since='))?.slice('--since='.length);
// --fixture=<dir>: a test map kept outside docs/ (tools/fixtures/), mounted into the served copy only.
const fixture = args.find((a) => a.startsWith('--fixture='))?.slice('--fixture='.length);
const sizesArg = args.find((a) => a.startsWith('--sizes='))?.slice('--sizes='.length);
if (sizesArg) SIZES.splice(0, SIZES.length, ...sizesArg.split(',').map((w) => [Number(w), HEIGHT[w] ?? Math.round(Number(w) * 2.16)]));
const flags = new Set(args.filter((a) => a.startsWith('--') && !a.startsWith('--since=') && !a.startsWith('--fixture=') && !a.startsWith('--sizes=')));
const ids = fixture ? [path.basename(fixture)] : args.filter((a) => !a.startsWith('--'));
const usage = () => {
  console.error('usage: node tools/check.mjs <id> [--sizes=<w,…>] | --fixture=<dir> | <id> --live [--since=<rev>] | --baseline | --all');
  process.exit(2);
};
for (const f of flags) if (!['--baseline', '--all', '--live'].includes(f)) usage();
if (since && !flags.has('--live')) usage();
if (sizesArg && (flags.size || !SIZES.every(([w]) => w >= 320 && w <= 1920))) usage();
if (flags.has('--baseline') || flags.has('--all')) {
  if (ids.length || flags.size > 1) usage();
} else if (ids.length !== 1 || !ID.test(ids[0])) usage();

// ---- what the item is -----------------------------------------------------------------

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function entryOf(id) {
  if (fixture) {
    const d = readJson(path.join(fixture, 'descriptor.json'));
    return { id, kind: 'map', section: d.section, title: d.title, wip: true, fixture: true };
  }
  const listed = readJson(path.join(DOCS, 'registry.json')).maps.find((m) => m.id === id);
  if (listed) return { ...listed, kind: listed.kind ?? 'map', wip: false };
  const wip = (readJson(WIP).items ?? []).find((m) => m.id === id);
  if (wip) return { ...wip, wip: true };
  return null;
}
const pageOf = (entry) => (entry.kind === 'diagram' ? `visual/index.html?v=${entry.id}` : `shell/index.html?map=${entry.id}`);

// ---- the browser ----------------------------------------------------------------------

async function launch() {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('no Edge or Chrome found; set CHECK_BROWSER');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'geoquest-check-browser-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let line;
  for (let i = 0; i < 100 && !line; i++) {
    try {
      line = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n');
    } catch {
      await sleep(100);
    }
  }
  if (!line) throw new Error('the browser did not start');
  const ws = new WebSocket(`ws://127.0.0.1:${line[0].trim()}${line[1].trim()}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let n = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, method } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method) listeners.get(msg.sessionId ?? '')?.(msg.method, msg.params);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++n;
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  async function open([width, height], origin) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const page = { size: [width, height], logs: [], requests: new Map(), inflight: new Set(), netAt: Date.now() };
    listeners.set(sessionId, (method, p) => {
      if (method === 'Runtime.consoleAPICalled') {
        if (p.type !== 'debug') page.logs.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
      } else if (method === 'Runtime.exceptionThrown') page.logs.push(`exception: ${p.exceptionDetails.exception?.description?.split('\n')[0] ?? p.exceptionDetails.text}`);
      else if (method === 'Log.entryAdded') {
        if (p.entry.level !== 'verbose') page.logs.push(`${p.entry.source} ${p.entry.level}: ${p.entry.text}${p.entry.url ? ` ${p.entry.url.replace(origin, '')}` : ''}`);
      } else if (method === 'Network.requestWillBeSent') {
        if (/^(data|blob):/.test(p.request.url)) return;
        const headers = p.request.headers ?? {};
        page.requests.set(p.requestId, { url: p.request.url, method: p.request.method, range: headers.Range ?? headers.range ?? '', status: null, at: Date.now() });
        page.inflight.add(p.requestId);
        page.netAt = Date.now();
      } else if (method === 'Network.responseReceived') {
        const r = page.requests.get(p.requestId);
        if (r) r.status = p.response.status;
      } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
        const r = page.requests.get(p.requestId);
        if (r && method === 'Network.loadingFailed') r.status = `failed ${p.errorText}`;
        page.inflight.delete(p.requestId);
        page.netAt = Date.now();
      }
    });
    const call = (method, params) => send(method, params, sessionId);
    await call('Runtime.enable');
    await call('Log.enable');
    await call('Network.enable');
    await call('Network.setCacheDisabled', { cacheDisabled: true });
    await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await call('Emulation.setFocusEmulationEnabled', { enabled: true });
    Object.assign(page, {
      call,
      async evaluate(expression) {
        const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text);
        return r.result.value;
      },
      async click(x, y) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      },
      async shoot(file) {
        const { data } = await call('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
      },
      goto: (url) => call('Page.navigate', { url }),
      /**
       * Until nothing is in flight, and nothing has started for `quiet` ms. A
       * request with no response after 3 s is one this session cannot see
       * finish — a worker's own script, which the worker loads — and is not waited for.
       */
      async netIdle(quiet = 150, max = 15000) {
        const t0 = Date.now();
        const busy = () => [...page.inflight].some((id) => { const r = page.requests.get(id); return !r || r.status !== null || Date.now() - r.at < 3000; });
        while (Date.now() - t0 < max && (busy() || Date.now() - page.netAt < quiet)) await sleep(50);
      },
      close: () => send('Target.closeTarget', { targetId }),
    });
    return page;
  }

  async function close() {
    try {
      await Promise.race([send('Browser.close'), sleep(3000)]);
    } catch {}
    ws.close();
    proc.kill();
    await sleep(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {}
  }
  return { open, close };
}

// ---- in the page ----------------------------------------------------------------------

/** True once the page's item is drawn and still: the map idle with its tiles in, or the diagram's picture decoded. */
const SETTLED = `(() => {
  if (document.fonts.status !== 'loaded') return false;
  // Work in progress with nothing built yet: the local preview's «কাজ চলছে» page.
  if (document.querySelector('p.wip')) return 'wip';
  const visual = location.pathname.endsWith('/visual/index.html');
  const notice = document.getElementById('loadNotice');
  if (notice && (visual ? !notice.hidden : notice.classList.contains('visible'))) return 'load-notice';
  if (visual) return !!document.querySelector('.layer-name, .layer-label, .days-wheel .days-seg') && !document.querySelector('.loading');
  const m = window.__shell && window.__shell.map;
  return !!(m && m.loaded() && !m.isMoving() && m.areTilesLoaded());
})()`;

async function settle(page, max = 30000) {
  const t0 = Date.now();
  let quiet = 0;
  while (Date.now() - t0 < max) {
    let ok = false;
    try {
      ok = await page.evaluate(SETTLED);
    } catch {}
    if (ok === 'load-notice') return 'load notice shown';
    quiet = ok ? quiet + 1 : 0;
    if (quiet >= 2) {
      await page.netIdle();
      if (await page.evaluate(SETTLED).catch(() => false)) return null;
      quiet = 0;
    }
    await sleep(60);
  }
  return 'did not settle in 30 s';
}

/** The camera once settled: a map's, or the diagram's picture box. */
const CAMERA = `(() => {
  const r = (v) => +v.toFixed(6);
  const m = window.__shell && window.__shell.map;
  if (m) { const c = m.getCenter(); return { center: [r(c.lng), r(c.lat)], zoom: r(m.getZoom()), bearing: r(m.getBearing()), pitch: r(m.getPitch()) }; }
  const view = document.querySelector('.view-panel:not([hidden]) img');
  if (!view) return null;
  const b = view.getBoundingClientRect();
  return { view: [r(b.left), r(b.top), r(b.width), r(b.height)] };
})()`;

/** The card: open, and its title. */
const CARD = `(() => {
  // A cards-only tab (tabs.cardsOnly): the card is the list's selected one.
  const list = document.querySelector('.map-shell.cards-only .tab-card-list');
  if (list) {
    const c = list.querySelector('.tab-card.selected');
    return { open: !!c, title: c ? c.querySelector('.tab-card-title').textContent.trim() : null };
  }
  const sheet = document.getElementById('infoSheet');
  if (sheet) {
    const open = !sheet.hidden && !sheet.inert && getComputedStyle(sheet).display !== 'none' && sheet.getBoundingClientRect().height > 0;
    return { open, title: open ? document.getElementById('infoTitle').textContent.trim() : null };
  }
  const card = document.querySelector('.view-panel:not([hidden]) .card') ?? document.querySelector('.card');
  const open = !!card && !card.hidden;
  return { open, title: open ? card.querySelector('.card-title').textContent.trim() : null };
})()`;

const box = (selector) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.hidden || e.disabled) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; })()`;

/*
 * The tap finder, installed once in a map's page. For a record drawn by a
 * tapped source it looks for a point where a tap reaches the map (or the
 * record's own marker) and the record is under the finger — alone there if
 * any such point exists — and it can bring the record into view.
 */
function tapFinder() {
  const map = window.__shell.map;
  const descriptor = window.__shell.descriptor;
  const container = map.getContainer();
  const canvas = map.getCanvas();
  const sources = [...new Set((descriptor.interactions ?? []).filter((i) => i.on === 'click' && i.target?.startsWith('source:')).map((i) => i.target.slice(7)))];
  const hitLayers = () => sources.map((s) => `${s}--hit`).filter((l) => map.getLayer(l));
  const picker = document.getElementById('recordPicker');
  const pickerTable = picker && !picker.hidden ? (descriptor.controls ?? []).find((c) => c.type === 'picker')?.from : null;
  const optionText = (key) => (pickerTable ? [...picker.options].find((o) => o.value === key)?.textContent : null);

  const rad = Math.PI / 180;
  const unit = (lng, lat) => [Math.cos(lat * rad) * Math.cos(lng * rad), Math.cos(lat * rad) * Math.sin(lng * rad), Math.sin(lat * rad)];
  const isGlobe = () => map.getProjection?.()?.type === 'globe';
  function front(lng, lat) {
    if (!isGlobe()) return true;
    const c = map.getCenter();
    const R = (512 * 2 ** map.getZoom()) / (2 * Math.PI * Math.cos(c.lat * rad));
    const D = 1 + (1.5 * container.clientHeight) / R;
    const [a, b] = [unit(lng, lat), unit(c.lng, c.lat)];
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= 1 / D;
  }

  const namesOf = (feature) => [optionText(feature.properties.key), ...Object.values(feature.properties).filter((v) => typeof v === 'string')].filter(Boolean);
  const cache = new Map();
  async function featureOf(source, key) {
    if (!cache.has(source)) cache.set(source, await map.getSource(source).getData());
    return cache.get(source).features.find((f) => f.properties?.key === key);
  }
  async function features(source) {
    cache.delete(source);
    await featureOf(source, null);
    return cache.get(source).features.filter((f) => f.properties?.key !== undefined).map((f) => f.properties.key);
  }

  function ringsOf(geometry) {
    const t = geometry.type;
    if (t === 'Point') return [[geometry.coordinates]];
    if (t === 'MultiPoint' || t === 'LineString') return [geometry.coordinates];
    if (t === 'MultiLineString' || t === 'Polygon') return geometry.coordinates;
    if (t === 'MultiPolygon') return geometry.coordinates.flat();
    if (t === 'GeometryCollection') return geometry.geometries.flatMap(ringsOf);
    return [];
  }
  /** Points along the geometry, at most 1° apart, drawn, and in front on a globe. */
  function samples(geometry) {
    const out = [];
    for (const ring of ringsOf(geometry)) {
      for (let i = 0; i < ring.length; i++) {
        const [x0, y0] = ring[i];
        const [x1, y1] = ring[i + 1] ?? ring[i];
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
      }
    }
    // No map draws a line or an area past Web Mercator's ±85.05°; a point there (a pole) is a marker.
    const drawn = geometry.type.includes('Point') ? () => true : (lat) => Math.abs(lat) <= 85.05;
    return out.filter(([lng, lat]) => drawn(lat) && front(lng, lat));
  }

  /** Where a tap at container point p lands: ok, alone, and how. */
  function judge(p, source, key, names) {
    const r = container.getBoundingClientRect();
    const x = r.left + p[0];
    const y = r.top + p[1];
    if (x < 2 || y < 2 || x > innerWidth - 2 || y > innerHeight - 2) return null;
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const marker = el.closest('[aria-label]');
    const own = marker && container.contains(marker) && names.includes(marker.getAttribute('aria-label'));
    if (el !== canvas && !own) return null;
    const at = (q) => [...new Set(map.queryRenderedFeatures(q, { layers: hitLayers() }).map((f) => `${f.source}:${f.properties.key}`))];
    const keys = at(p);
    const me = `${source}:${key}`;
    if (!own && !keys.includes(me)) return null;
    // A spot where the renderer's answer flickers within a pixel or two (all meridians meeting at a pole) is no fair test.
    if (!own && [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([dx, dy]) => !at([p[0] + dx, p[1] + dy]).includes(me))) return null;
    // Alone: nothing else within 14 px, the reach of the globe's taps (the shell's own reach, 11 px, is less).
    const near = at([[p[0] - 14, p[1] - 14], [p[0] + 14, p[1] + 14]]);
    return { x, y, alone: [...keys, ...near].every((k) => k === me), how: own ? 'marker' : 'map' };
  }

  async function find(source, key) {
    const feature = await featureOf(source, key);
    if (!feature) return null;
    const names = namesOf(feature);
    const w = container.clientWidth;
    const h = container.clientHeight;
    let first = null;
    const consider = (p) => {
      const j = judge(p, source, key, names);
      if (j && j.alone) return j;
      if (j && !first) first = j;
      return null;
    };
    const type = feature.geometry.type;
    if (type.includes('Polygon')) {
      const projected = samples(feature.geometry).map((c) => map.project(c));
      if (!projected.length) return null;
      const xs = projected.map((q) => q.x);
      const ys = projected.map((q) => q.y);
      const [x0, x1] = [Math.max(0, Math.min(...xs)), Math.min(w, Math.max(...xs))];
      const [y0, y1] = [Math.max(0, Math.min(...ys)), Math.min(h, Math.max(...ys))];
      const step = Math.max(6, Math.min(x1 - x0, y1 - y0) / 24);
      for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
        const hit = consider([x, y]);
        if (hit) return hit;
      }
    } else {
      // Nearest the middle of the map first, so a line is tapped where it is plainly in view.
      const pts = samples(feature.geometry).map((c) => map.project(c)).map((q) => [q.x, q.y]).filter(([x, y]) => x >= 0 && y >= 0 && x <= w && y <= h);
      pts.sort((a, b) => Math.hypot(a[0] - w / 2, a[1] - h / 2) - Math.hypot(b[0] - w / 2, b[1] - h / 2));
      for (const p of pts.slice(0, 400)) {
        const hit = consider(p);
        if (hit) return hit;
      }
    }
    return first;
  }

  /** Turns or moves the camera to the record, keeping the zoom (or `closer` levels in) unless a cluster hides it. */
  async function bring(source, key, closer = 0) {
    const feature = await featureOf(source, key);
    if (!feature) return false;
    const pts = ringsOf(feature.geometry).flat();
    const mid = feature.geometry.type.includes('Polygon')
      ? [(Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2, (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2]
      : pts[Math.floor(pts.length / 2)];
    const cluster = descriptor.sources?.[source]?.cluster;
    const zoom = (cluster ? Math.max(map.getZoom(), (cluster.maxZoom ?? 14) + 1) : map.getZoom()) + closer;
    map.jumpTo({ center: mid, zoom: Math.min(zoom, map.getMaxZoom()) });
    // Into the middle of what the card leaves of the map, not under the card.
    const r = container.getBoundingClientRect();
    const card = sheet.hidden ? null : sheet.getBoundingClientRect();
    const bottom = card && card.height && card.top < r.bottom ? card.top - r.top : r.height;
    const dy = r.height / 2 - bottom / 2;
    if (dy > 1) map.panBy([0, dy], { duration: 0 });
    return true;
  }

  // Counts every change to the card, so a tap that re-opens the shown card still counts.
  const sheet = document.getElementById('infoSheet');
  window.__checkChanges = 0;
  new MutationObserver(() => window.__checkChanges++).observe(sheet, { subtree: true, childList: true, characterData: true, attributes: true });

  const reset = (camera) => void map.jumpTo(camera);
  /** What the shell has selected, as its sources' features carry it. */
  async function selected() {
    const out = [];
    for (const s of sources) for (const f of (await map.getSource(s).getData()).features) if (f.properties?.selected === true) out.push(`${s}:${f.properties.key}`);
    return out;
  }
  // A focus map's sources change with the selection: `forget` drops what was read of them.
  window.__check = { sources, features, find, bring, reset, selected, pickerTable, namesOf: async (s, k) => namesOf(await featureOf(s, k)), forget: () => cache.clear() };
  return sources;
}

// ---- one item, used ---------------------------------------------------------------------

async function checkItem(id) {
  const t0 = Date.now();
  const entry = entryOf(id);
  if (!entry) {
    console.log(`FAIL ${id}: not in docs/registry.json nor tools/wip.json`);
    process.exit(1);
  }
  const dir = path.join(OUT, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });

  const made = makeSite({ site: SITE_COPY, quiet: true, fixtures: fixture ? [path.resolve(fixture)] : [] });
  const server = await serveSite({ ...made, prefix: PREFIX, extra: { [SHEETS]: OUT } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = origin + PREFIX;
  const browser = await launch();
  const lines = [];
  const problems = [];
  let failed = false;
  try {
    const results = await Promise.all(SIZES.map((size) => useItem(browser, size, entry, base, origin, dir)));
    for (const r of results) {
      failed ||= r.failed;
      problems.push(...r.problems.map((p) => `${r.size} ${p}`));
    }
    const home = results.map((r) => r.home);
    lines.push(`${home.every((h) => h.ok) ? 'PASS' : 'FAIL'} home: card in ${entry.section}${entry.wip ? ' (local preview, work in progress)' : ''} — ${home.map((h) => h.text).join('; ')}`);
    for (const r of results) lines.push(`${r.failed ? 'FAIL' : 'PASS'} ${r.size}: ${r.summary.join(' · ')}`);
    const sheets = await contactSheets(browser, dir, results, origin);
    lines.push(`sheets: ${sheets.length} in tools/.check/${id}/ (${sheets.map((s) => path.basename(s)).join(', ')})`);
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
  failed ||= lines.some((l) => l.startsWith('FAIL'));
  console.log(`check ${id} (${entry.kind}, ${entry.section}): ${failed ? 'FAIL' : 'PASS'} in ${seconds(t0)}`);
  for (const l of lines) console.log(l);
  for (const p of problems.slice(0, Math.max(0, 9 - lines.length))) console.log(`  ${p}`);
  if (problems.length > 9 - lines.length) console.log(`  … ${problems.length - (9 - lines.length)} more in tools/.check/${id}/problems.txt`);
  fs.writeFileSync(path.join(dir, 'problems.txt'), problems.join('\n') + '\n');
  process.exitCode = failed ? 1 : 0;
}

async function useItem(browser, size, entry, base, origin, dir) {
  const page = await browser.open(size, origin);
  const t = tag(size);
  const shots = { steps: [], taps: [], views: [] };
  const problems = [];
  const summary = [];
  let failed = false;
  const fail = (p) => {
    failed = true;
    problems.push(p);
  };
  let n = 0;
  const shoot = async (group, caption, at) => {
    const file = path.join(dir, 'shots', `${t}-${String(++n).padStart(3, '0')}.png`);
    await page.shoot(file);
    (shots[group] ??= []).push({ file, caption, at });
  };

  // The home page: the card, in its section; then the item, opened from it.
  await page.goto(base + 'index.html');
  const home = { ok: false, text: 'no card' };
  for (let i = 0; i < 100; i++) {
    const found = await page
      .evaluate(`(() => { const cards = [...document.querySelectorAll('a.card')]; if (!cards.length) return null; const a = cards.find((c) => /[?&](map|v)=${entry.id}$/.test(c.getAttribute('href'))); if (!a) return { none: true }; a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); return { section: a.closest('section')?.querySelector('h2')?.id, at: [r.left + r.width / 2, r.top + r.height / 2] }; })()`)
      .catch(() => null);
    if (found?.none) break;
    if (found) {
      home.ok = found.section === entry.section;
      home.text = `${t} in ${found.section}`;
      home.at = found.at;
      break;
    }
    await sleep(100);
  }
  await page.netIdle();
  await shoot('steps', 'home');
  if (home.at) await page.click(...home.at);
  else await page.goto(base + pageOf(entry));
  const opened = await settle(page);
  const url = await page.evaluate('location.pathname + location.search').catch(() => '');
  if (opened || !url.endsWith(pageOf(entry))) fail(`opening: ${opened ?? `at ${url}`}`);
  await shoot('steps', 'open');

  // Photo markers by zoom: at the opening zoom every unselected one is a dot, its photo not shown.
  const markers = await page.evaluate(`(() => { const all = [...document.querySelectorAll('.photo-marker:not(.plain):not(.selected)')]; if (!all.length) return null; const dot = (m) => m.querySelector('.photo-disc').getBoundingClientRect().width <= 11 && getComputedStyle(m.querySelector('img')).opacity === '0'; return { dots: all.filter(dot).length, all: all.length, tap: Math.min(...all.map((m) => m.getBoundingClientRect().width)) }; })()`).catch(() => null);
  if (markers) {
    summary.push(`opening view: ${markers.dots}/${markers.all} photo markers dots, tap zones ≥ ${Math.round(markers.tap)} px`);
    if (markers.dots !== markers.all) fail(`opening view: ${markers.all - markers.dots} photo markers are not dots`);
    if (markers.tap < 44) fail(`a photo marker's tap zone is ${markers.tap} px, under 44`);
  }
  // ⓘ: in its row under the picker row, its tap zone clear of ‹ › and of the map's corner controls.
  const info = await page.evaluate(`(() => { const z = document.querySelector('.info-row .attrib-button, .info-credits .maplibregl-ctrl-attrib-button'); if (!z || !z.getClientRects().length) return null; const r = z.getBoundingClientRect(); const under = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; const hit = [document.getElementById('prevRecord'), document.getElementById('nextRecord'), ...document.querySelectorAll('.maplibregl-ctrl-top-right .maplibregl-ctrl')].filter((e) => e && e.getClientRects().length && under(r, e.getBoundingClientRect())).map((e) => e.id || e.className.split(' ').pop()); return { at: [Math.round(r.left), Math.round(r.top), Math.round(r.width)], hit, opacity: getComputedStyle(z).opacity }; })()`).catch(() => null);
  if (info) {
    summary.push(`ⓘ at (${info.at[0]}, ${info.at[1]}), ${info.at[2]} px zone, opacity ${info.opacity}`);
    if (info.hit.length) fail(`ⓘ's tap zone on ${info.hit.join(', ')}`);
  }
  const placeholder = !opened && (await page.evaluate(`!!document.querySelector('p.wip')`));
  if (placeholder) summary.push('the «কাজ চলছে» page, nothing built yet');
  else if (!opened) {
    if (entry.kind === 'diagram') {
      const picker = await page.evaluate(`(() => { const p = document.getElementById('recordPicker'); return !!p && !p.hidden; })()`);
      const rivers = await page.evaluate(`!!document.querySelector('.rivers .rivers-svg')`);
      const wheel = await page.evaluate(`!!document.querySelector('.days .days-wheel')`);
      if (picker && rivers) await riverSteps(page, shoot, summary, fail);
      else if (picker && wheel) await daysSteps(page, shoot, summary, fail);
      else if (picker) {
        await fitCheck(page, 'no card');
        await pickerSteps(page, shoot, summary, fail);
        await zoneTaps(page, shoot, summary, fail);
        if (page.fit) {
          summary.push(`layout clear in ${page.fit.views - page.fit.bad.length}/${page.fit.views} views`);
          for (const b of page.fit.bad) fail(`layout — ${b}`);
        }
      } else await slabs(page, shoot, summary, fail);
      if (picker && rivers && page.fit) {
        summary.push(`layout clear in ${page.fit.views - page.fit.bad.length}/${page.fit.views} views`);
        for (const b of page.fit.bad) fail(`layout — ${b}`);
      }
    }
    else {
      const sources = await page.evaluate(`(${tapFinder})()`);
      const camera = await page.evaluate(CAMERA);
      const selector = await page.evaluate(`(() => { const p = document.getElementById('recordPicker'); return p && !p.hidden ? 'picker' : document.querySelector('.timeline-dot') ? 'timeline' : null; })()`);
      const tabs = await page.evaluate(`document.querySelectorAll('.map-tab').length`);
      // Names at the opening: which of each symbol layer's point names MapLibre places, and of the rest which lie
      // off screen and which it dropped in a collision — as text, never a failure: at a wide zoom that is MapLibre's call.
      const named = await page.evaluate(`(() => { const s = window.__shell; if (!s) return []; const m = s.map; const b = m.getBounds(); const out = [];
        for (const l of s.descriptor.layers ?? []) {
          const tf = l.layout?.['text-field'];
          if (l.type !== 'symbol' || !Array.isArray(tf) || tf[0] !== 'get' || !m.getLayer(l.id)) continue;
          const all = new Map();
          for (const f of m.querySourceFeatures(l.source)) if (f.geometry.type === 'Point') all.set(f.properties.key, { name: f.properties[tf[1]], at: f.geometry.coordinates });
          const placed = new Set(m.queryRenderedFeatures({ layers: [l.id] }).map((f) => f.properties.key));
          const missing = [...all].filter(([k]) => !placed.has(k)).map(([, v]) => '«' + v.name + '» (' + (b.contains(v.at) ? 'collision' : 'off screen') + ')');
          out.push({ id: l.id, placed: [...all.keys()].filter((k) => placed.has(k)).length, all: all.size, missing });
        }
        return out; })()`).catch(() => []);
      for (const n of named) summary.push(`names at the opening, ${n.id}: ${n.placed}/${n.all} placed${n.missing.length ? ` — not ${n.missing.join(', ')}` : ''}`);
      if (selector === 'picker') await pickerSteps(page, shoot, summary, fail, tabs);
      else if (selector === 'timeline') await timelineSteps(page, shoot, summary, fail, tabs);
      else fail('no picker and no timeline');
      if (page.zooms?.length) {
        fs.writeFileSync(path.join(dir, `${t}-frames.txt`), `record\tzoom its frame settles at\tname\n${page.zooms.join('\n')}\n`);
        const zs = page.zooms.map((l) => Number(l.split('\t')[1]));
        summary.push(`frames at zoom ${Math.min(...zs)}–${Math.max(...zs)} (${t}-frames.txt)`);
      }
      await taps(page, shoot, summary, fail, sources, tabs, camera);
      await edgeTaps(page, summary, fail, sources, tabs);
      if (await page.evaluate(`Boolean(window.__shell?.descriptor?.tabs?.views)`)) await viewTabs(page, shoot, summary, fail);
      if (await page.evaluate(`Boolean(window.__shell?.descriptor?.minTextSize)`)) await textFloor(page, summary, fail);
      if (await page.evaluate(`Boolean(window.__shell?.descriptor?.indices)`)) await indicesSteps(page, shoot, summary, fail);
    }
  }

  // The console and the hosts, over the whole visit.
  const foreign = [...new Set([...page.requests.values()].map((r) => r.url).filter((u) => /^(https?|wss?):/.test(u) && !u.startsWith(origin)).map((u) => new URL(u).host))];
  const failedReqs = [...page.requests.values()].filter((r) => (typeof r.status === 'string' && !/ERR_ABORTED/.test(r.status)) || r.status >= 400);
  summary.unshift(`console ${page.logs.length}, foreign hosts ${foreign.length}, failed requests ${failedReqs.length}`);
  if (page.logs.length) fail(`console: ${page.logs.slice(0, 3).join(' | ')}`);
  if (foreign.length) fail(`requests to ${foreign.join(', ')}`);
  if (failedReqs.length) fail(`failed: ${failedReqs.slice(0, 3).map((r) => `${r.url.replace(origin, '')} ${r.status}`).join(', ')}`);
  await page.close();
  return { size: t, failed, problems, summary, home, shots };
}

/*
 * A cutaway diagram's layout: the globe, its scale note, every name and
 * leader on the stage, none of them under the picker row or the card, no
 * name on another, and none under 15 px at 390 px wide or 14 px at 320.
 * Null on any other page.
 */
const FIT = `(() => {
  const stage = document.querySelector('.view-panel:not([hidden]) .stage');
  if (!stage || !document.querySelector('[data-fit]')) return null;
  const s = stage.getBoundingClientRect();
  const within = (r) => r.left >= s.left - 0.5 && r.right <= s.right + 0.5 && r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5;
  const under = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const blocks = [document.querySelector('.picker-row'), document.querySelector('.view-panel:not([hidden]) .card:not([hidden])') ?? document.querySelector('.card:not([hidden])')].filter(Boolean).map((e) => e.getBoundingClientRect());
  // Every element a view marks with data-fit stays on the stage, clear of the picker row and the card.
  const items = [...document.querySelectorAll('[data-fit]')].map((e) => [e.getAttribute('data-fit'), e]);
  const bad = items.filter(([, e]) => e.getClientRects().length).filter(([, e]) => { const r = e.getBoundingClientRect(); return !within(r) || blocks.some((b) => under(r, b)); }).map(([name]) => name);
  // No words on each other, and names never under the user's minimum: 15 px at 390 px wide, 14 px at 320.
  const words = [...document.querySelectorAll('.layer-label, .fit-text')].filter((e) => e.getClientRects().length);
  const nameOf = (e) => e.getAttribute('data-fit') || e.dataset.key || e.textContent;
  for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) if (under(words[i].getBoundingClientRect(), words[j].getBoundingClientRect())) bad.push(nameOf(words[i]) + ' on ' + nameOf(words[j]));
  // An element marked data-clear (a selected ring) keeps off every data-solid one (the Sun) and every word.
  for (const c of [...document.querySelectorAll('[data-clear]')].filter((e) => e.getClientRects().length)) {
    const r = c.getBoundingClientRect();
    for (const o of [...document.querySelectorAll('[data-solid]'), ...words]) if (o !== c && under(r, o.getBoundingClientRect())) bad.push(c.getAttribute('data-fit') + ' on ' + (o.getAttribute('data-solid') || nameOf(o)));
  }
  // ⓘ's tap zone keeps off ‹ › and off everything the view marks to keep clear.
  const info = document.querySelector('.info-row .attrib-button, .info-credits .maplibregl-ctrl-attrib-button');
  if (info && info.getClientRects().length) {
    const z = info.getBoundingClientRect();
    for (const o of [document.getElementById('prevRecord'), document.getElementById('nextRecord'), ...items.map(([, e]) => e)]) if (o && o.getClientRects().length && under(z, o.getBoundingClientRect())) bad.push('ⓘ on ' + (o.getAttribute('data-fit') || o.id));
  }
  const least = innerWidth >= 390 ? 15 : 14;
  for (const n of document.querySelectorAll('.layer-label')) { const size = parseFloat(getComputedStyle(n).fontSize); if (size < least) bad.push(n.dataset.key + ' at ' + size + ' px'); }
  return bad;
})()`;

async function fitCheck(page, where) {
  const bad = await page.evaluate(FIT);
  if (!bad) return;
  page.fit ??= { views: 0, bad: [] };
  page.fit.views++;
  if (bad.length) page.fit.bad.push(`${where}: ${bad.join(', ')}`);
}

async function waitCard(page) {
  await sleep(60);
  await settle(page, 10000);
  return page.evaluate(CARD);
}

/*
 * View tabs (the rivers map, M3): each picker group's first record in every tab past the first — framed there,
 * the selection kept — and, where a view declares enabledBy, a tap on a tab a selection disables: nothing
 * changes, and ⓘ's row says why. Every tab a 44 px tap zone.
 */
async function viewTabs(page, shoot, summary, fail) {
  const tabs = await page.evaluate(`[...document.querySelectorAll('.map-tab')].map((b) => [b.dataset.tab, b.textContent.trim()])`);
  const firsts = await page.evaluate(`[...document.getElementById('recordPicker').querySelectorAll('optgroup')].map((g) => [g.querySelector('option').value, g.querySelector('option').textContent])`);
  const options = await page.evaluate(`[...document.getElementById('recordPicker').options].filter((o) => o.value).map((o) => [o.value, o.textContent])`);
  const choose = async (value) => {
    await page.evaluate(`(() => { const s = document.getElementById('recordPicker'); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitCard(page);
  };
  const tapTab = async (key) => {
    const at = await page.evaluate(`(() => { const b = document.querySelector('.map-tab[data-tab="${key}"]'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.height]; })()`);
    await page.click(at[0], at[1]);
    await sleep(60);
    await settle(page, 10000);
    return at[2];
  };
  const state = () => page.evaluate(`({ active: document.querySelector('.map-tab.active')?.dataset.tab, disabled: [...document.querySelectorAll('.map-tab[aria-disabled="true"]')].map((b) => b.dataset.tab), note: (() => { const n = document.querySelector('.tab-disabled-note'); return n && !n.hidden && n.getClientRects().length ? n.textContent : null; })(), selected: document.getElementById('recordPicker').value, zoom: Math.round(window.__shell.map.getZoom() * 100) / 100 })`);
  const heights = await page.evaluate(`[...document.querySelectorAll('.map-tab')].map((b) => Math.round(b.getBoundingClientRect().height))`);
  if (Math.min(...heights) < 44) fail(`view tabs: a tab is ${Math.min(...heights)} px tall, under 44`);
  let framed = 0;
  const zooms = [];
  for (const [tab, name] of tabs.slice(1)) {
    for (const [value, label] of firsts) {
      await choose(value);
      const before = await state();
      if (before.disabled.includes(tab)) {
        await shoot('views', `«${name}» disabled — ${label}`);
        continue;
      }
      await tapTab(tab);
      const after = await state();
      if (after.active !== tab || after.selected !== value) fail(`view tabs: «${name}» with ${label} — tab ${after.active}, selection ${after.selected || '(none)'}`);
      else framed++;
      zooms.push(`${label} z${after.zoom}`);
      await shoot('views', `«${name}» — ${label}, z${after.zoom}`);
      await tapTab(tabs[0][0]);
    }
  }
  // A selection that disables a tab: the first; a tap on it changes nothing, and ⓘ's row says why.
  let tapped = null;
  for (const [value, label] of options) {
    await choose(value);
    const st = await state();
    if (!st.disabled.length) continue;
    const key = st.disabled[0];
    await tapTab(key);
    const after = await state();
    if (after.active !== st.active || after.selected !== value || !after.disabled.includes(key) || !after.note) fail(`view tabs: a tap on the disabled «${key}» with ${label} — tab ${after.active}, selection ${after.selected}, note ${after.note ?? 'none'}`);
    await shoot('views', `«${tabs.find((t) => t[0] === key)[1]}» disabled, tapped — ${label}: ${after.note}`);
    tapped = `${label}: tapped, nothing changed, «${after.note}»`;
    break;
  }
  // Only a map whose views declare enabledBy (the rivers map) has a tab a selection disables; views that only hide
  // or bound (bangladesh-ethnic-groups) have none to tap.
  const canDisable = await page.evaluate(`Object.values(window.__shell.descriptor.tabs.views ?? {}).some((v) => v.enabledBy)`);
  if (!tapped && canDisable) fail('view tabs: no selection disables a tab, so none was tapped');
  await page.evaluate(`window.__shell.deselect()`);
  summary.push(`view tabs ${heights.join('/')} px: ${framed}/${firsts.length * (tabs.length - 1)} framed (${zooms.join(', ')}); disabled ${tapped ?? 'none'}`);
}

/* With minTextSize: no visible text on the page under it (a card open), and no label in the map's style drawn under it. */
async function textFloor(page, summary, fail) {
  const first = await page.evaluate(`[...document.getElementById('recordPicker').options].find((o) => o.value)?.value`);
  await page.evaluate(`(() => { const s = document.getElementById('recordPicker'); s.value = ${JSON.stringify(first)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitCard(page);
  const got = await page.evaluate(`(() => {
    const min = window.__shell.descriptor.minTextSize;
    const small = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (!el.getClientRects().length || !([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      // A size of 0 hides a glyph drawn another way (‹ ›): no text is shown.
      if (size > 0 && size < min) small.add((el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName.toLowerCase()) + ' ' + size);
    }
    const outs = (v) => (typeof v === 'number' ? [v] : !Array.isArray(v) ? [] : v[0] === 'interpolate' ? v.slice(3).filter((_, i) => i % 2 === 1).flatMap(outs) : v[0] === 'step' ? [v[2], ...v.slice(3).filter((_, i) => i % 2 === 1)].flatMap(outs) : v[0] === 'match' ? [...v.slice(2, -1).filter((_, i) => i % 2 === 1), v.at(-1)].flatMap(outs) : v[0] === 'case' ? [...v.slice(1, -1).filter((_, i) => i % 2 === 1), v.at(-1)].flatMap(outs) : []);
    const layers = window.__shell.map.getStyle().layers.filter((l) => l.type === 'symbol' && l.layout?.['text-field'] !== undefined);
    const labels = layers.filter((l) => Math.min(...outs(l.layout['text-size'] ?? 16)) < min).map((l) => l.id);
    return { min, page: [...small], layers: layers.length, labels };
  })()`);
  await page.evaluate(`window.__shell.deselect()`);
  if (got.page.length || got.labels.length) fail(`text under ${got.min} px: ${[...got.page, ...got.labels].join(', ')}`);
  summary.push(`text ≥ ${got.min} px: page and ${got.layers} label layers`);
}

/** ‹ › and the dropdown: › from the placeholder through every option, then the ends. */
/*
 * The year wheel (important-days, docs/visual/days.js; WHEEL-3, 2026-10-08): the twelve months of the picker by ›,
 * its centre and its list agreeing, then › past ডিসেম্বর to জানুয়ারি and ‹ from জানুয়ারি to ডিসেম্বর (the picker goes
 * round); in each month the page held at this width — no sideways scroll, no text under 14 px, every tap target
 * 44 px or more, every wedge's name inside its wedge; each of the twelve wedges tapped at mid-ring, where a finger
 * lands, choosing its month, the tap zone measured there (the arc and the ring's width, each at least 44 px); every
 * row with a card opened, its card titled as the row, closed by ✕ (Escape the first); every row without one tapped
 * and opening nothing, with no chevron and no button role.
 */
async function daysSteps(page, shoot, summary, fail) {
  const bnNum = (s) => Number(String(s).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)).replace(/\D/g, ''));
  const options = await page.evaluate(`[...document.getElementById('recordPicker').options].filter((o) => o.value).map((o) => [o.value, o.textContent])`);
  if (options.length !== 12) fail(`wheel: the picker lists ${options.length} months, not 12`);
  const choose = async (value) => {
    await page.evaluate(`(() => { const s = document.getElementById('recordPicker'); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await settle(page, 10000);
  };
  const state = () => page.evaluate(`({ value: document.getElementById('recordPicker').value, centre: document.querySelector('.days-centre-month')?.textContent, count: document.querySelector('.days-centre-count')?.textContent, rows: document.querySelectorAll('.days-row').length })`);
  const LAYOUT = `(() => {
    const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const small = [...document.querySelectorAll('.days *')].filter((e) => vis(e) && !e.closest('.attrib, select, .step-btn') && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => '«' + e.textContent.trim().slice(0, 16) + '» ' + getComputedStyle(e).fontSize);
    const taps = [...document.querySelectorAll('#prevRecord, #nextRecord, #recordPicker, .info-row .attrib-button, .days-row.tappable')].filter(vis).map((e) => [e.id || e.className, Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)]).filter(([, d]) => d < 44).map(([k, d]) => k + ' ' + Math.round(d));
    const d = document.querySelector('.days'), doc = document.scrollingElement;
    const sideways = Math.max(doc.scrollWidth - doc.clientWidth, d.scrollWidth - d.clientWidth);
    const unfit = [...document.querySelectorAll('.days-seg:not(.days-seg-top) .days-seg-label')].filter((t) => t.dataset.fit !== '1').map((t) => t.textContent);
    const a = document.querySelector('.days-side').getBoundingClientRect(), b = document.querySelector('.days-main').getBoundingClientRect();
    return { small, taps, sideways, unfit, cols: Math.abs(a.top - b.top) < 2 && b.left >= a.right ? 2 : 1 };
  })()`;
  const bad = { small: new Set(), taps: new Set(), sideways: 0, unfit: new Set() };
  let cols = 0;
  // Every month by ›, from the first; then round past the last, and back by ‹.
  await choose(options[0][0]);
  let months = 0;
  for (let i = 0; i < options.length; i++) {
    if (i > 0) {
      const next = await page.evaluate(box('#nextRecord'));
      if (!next) {
        fail(`wheel: › missing or disabled before ${options[i][1]}`);
        break;
      }
      await page.click(...next);
      await settle(page, 10000);
    }
    const s = await state();
    if (s.value === options[i][0] && s.centre === options[i][1] && bnNum(s.count) === s.rows) months++;
    else fail(`wheel: › to ${options[i][1]} — picker ${s.value}, centre «${s.centre}», «${s.count}» for ${s.rows} rows`);
    const l = await page.evaluate(LAYOUT);
    l.small.forEach((x) => bad.small.add(x));
    l.taps.forEach((x) => bad.taps.add(x));
    l.unfit.forEach((x) => bad.unfit.add(x));
    bad.sideways = Math.max(bad.sideways, l.sideways);
    cols = l.cols;
  }
  await shoot('steps', `› ${options.at(-1)[1]}`);
  const wrap = [];
  for (const [id, from, to] of [['#nextRecord', options.at(-1), options[0]], ['#prevRecord', options[0], options.at(-1)]]) {
    const arrow = id === '#nextRecord' ? '›' : '‹';
    await choose(from[0]);
    const at = await page.evaluate(box(id));
    if (!at) {
      fail(`wheel: ${arrow} disabled on ${from[1]}`);
      continue;
    }
    await page.click(...at);
    await settle(page, 10000);
    const s = await state();
    if (s.value === to[0] && s.centre === to[1]) wrap.push(`${from[1]} ${arrow} ${to[1]}`);
    else fail(`wheel: ${arrow} on ${from[1]} went to ${s.value}, not ${to[1]}`);
  }
  if (bad.small.size) fail(`wheel: text under 14 px — ${[...bad.small].slice(0, 4).join(', ')}`);
  if (bad.taps.size) fail(`wheel: tap targets under 44 px — ${[...bad.taps].slice(0, 4).join(', ')}`);
  if (bad.sideways > 0) fail(`wheel: the page scrolls sideways by ${bad.sideways} px`);
  if (bad.unfit.size) fail(`wheel: names outside their wedge — ${[...bad.unfit].join(', ')}`);
  // The twelve wedges, each tapped at mid-ring; the zone measured there.
  const top = `(() => { document.querySelector('.days')?.scrollTo(0, 0); window.scrollTo(0, 0); })()`;
  await page.evaluate(top);
  const geo = await page.evaluate(`(() => { const w = document.querySelector('.days-wheel'); return { r: +w.dataset.r, R: +w.dataset.ring }; })()`);
  const midArc = (((geo.R + geo.r) / 2) * Math.PI) / 6;
  if (midArc < 44 || geo.R - geo.r < 44) fail(`wheel: a wedge's tap zone at mid-ring is ${midArc.toFixed(1)} × ${geo.R - geo.r} px, under 44`);
  let wedges = 0;
  for (let m = 1; m <= 12; m++) {
    await page.evaluate(top);
    const a = ((-90 + 30 * (m - 1)) * Math.PI) / 180;
    const at = await page.evaluate(`(() => { const w = document.querySelector('.days-wheel'); const rad = (+w.dataset.r + +w.dataset.ring) / 2; const b = w.getBoundingClientRect(); return [b.left + b.width / 2 + rad * Math.cos(${a}), b.top + b.height / 2 + rad * Math.sin(${a})]; })()`);
    await page.click(...at);
    await settle(page, 10000);
    const centre = await page.evaluate(`document.querySelector('.days-centre-month')?.textContent`);
    const want = await page.evaluate(`document.querySelectorAll('.days-seg:not(.days-seg-top) .days-seg-label')[${m - 1}].textContent`);
    if (centre === want) wedges++;
    else fail(`wheel: a tap at mid-ring of wedge ${m} chose «${centre}», not «${want}»`);
  }
  await shoot('steps', 'wedges tapped');
  // Every row: a card opened and closed where it has one; nothing where it has none.
  let cards = 0, tappable = 0, plain = 0, plainOk = 0;
  for (const [value] of options) {
    await choose(value);
    const n = await page.evaluate(`document.querySelectorAll('.days-row').length`);
    for (let i = 0; i < n; i++) {
      const target = await page.evaluate(`(() => { const r = document.querySelectorAll('.days-row')[${i}]; r.scrollIntoView({ block: 'center' }); const q = r.getBoundingClientRect(); return { at: [q.left + q.width / 2, q.top + q.height / 2], name: r.querySelector('.days-row-name').textContent, h: Math.round(q.height), card: r.classList.contains('tappable'), chevron: !!r.querySelector('.days-chevron'), role: r.getAttribute('role'), tab: r.tabIndex }; })()`);
      if (target.h < 44) fail(`wheel: the row «${target.name}» is ${target.h} px tall`);
      await page.click(...target.at);
      await settle(page, 10000);
      const open = await page.evaluate(`(() => { const s = document.querySelector('.days-sheet'); return s && !s.hidden ? document.getElementById('days-sheet-title')?.textContent : null; })()`);
      if (!target.card) {
        plain++;
        if (open === null && !target.chevron && !target.role && target.tab < 0) plainOk++;
        else fail(`wheel: the row «${target.name}», with no card, ${open !== null ? 'opened one' : 'looks like a button'}`);
        continue;
      }
      tappable++;
      if (open === target.name && target.chevron) cards++;
      else fail(`wheel: the row «${target.name}» opened ${open === null ? 'no card' : `«${open}»`}${target.chevron ? '' : ', with no chevron'}`);
      if (tappable === 1) await shoot('taps', `card «${target.name}»`);
      // ✕, except the very first card, which Escape closes.
      if (tappable === 1) await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      else {
        const x = await page.evaluate(box('.days-close'));
        if (x) await page.click(...x);
      }
      await settle(page, 10000);
      if (await page.evaluate(`!document.querySelector('.days-sheet').hidden`)) fail(`wheel: the card «${target.name}» did not close by ${tappable === 1 ? 'Escape' : '✕'}`);
    }
  }
  await page.evaluate(top);
  summary.push(`wheel: ${cols} column(s); months ${months}/${options.length} by ›, round: ${wrap.join(', ')}; wedges ${wedges}/12 at mid-ring (${midArc.toFixed(1)} × ${geo.R - geo.r} px); cards ${cards}/${tappable} (✕, Escape), ${plainOk}/${plain} rows without a card inert; text ≥ 14 px, taps ≥ 44 px, sideways ${bad.sideways} px, names fit ${12 - bad.unfit.size}/12`);
}

/*
 * The indices module (global-indices, docs/shell/indices.js; IDX-2, 2026-10-08): every ranking of the picker chosen,
 * its card titled as the option, its three stat blocks, its pills on the map — Bangladesh's always (it carries the
 * rank or the value), the top's and the bottom's wherever the country has a shape — its shading as its kind says (an
 * open ranking in the seven classes, a facts-only one with only the top, the bottom and Bangladesh, and its one-line
 * note), and the gradient strip only for an open one; the page held at this width (no sideways scroll, no text under
 * 14 px, every tap 44 px or more, the map left of the card from 900 px); then the «বাংলাদেশ» tab: the map, its card
 * and the picker row hidden, one row per ranking with data, each row opening its ranking on the map.
 */
async function indicesSteps(page, shoot, summary, fail) {
  const LAYOUT = `(() => {
    const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]');
    const small = [...document.querySelectorAll('body *')].filter((e) => vis(e) && !e.closest('.maplibregl-ctrl-attrib, select, .step-btn, .maplibregl-canvas-container') && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => '«' + e.textContent.trim().slice(0, 16) + '» ' + getComputedStyle(e).fontSize);
    const taps = [...document.querySelectorAll('#prevRecord, #nextRecord, #recordPicker, .map-tab, .ix-row[type=button], .ix-foot a, .ix-pin-bd .ix-pin-text, .maplibregl-ctrl-attrib-button')].filter(vis).map((e) => [e.id || e.className, Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height + (e.matches('.ix-pin-text') ? 16 : 0))]).filter(([, d]) => d < 44).map(([k, d]) => k + ' ' + Math.round(d));
    const doc = document.scrollingElement;
    // Whether the page, or a box in it, actually scrolls sideways: try it, read where it went, put it back.
    const tryScroll = (e) => { const was = e.scrollLeft; e.scrollLeft = 60; const moved = e.scrollLeft; e.scrollLeft = was; return moved; };
    const sideways = Math.max(tryScroll(doc), ...[...document.querySelectorAll('.map-page, .map-shell, .ix-list, .info-sheet-body')].map(tryScroll));
    const m = document.getElementById('map').getBoundingClientRect(), c = document.getElementById('infoSheet').getBoundingClientRect();
    return { small, taps, sideways, cols: !document.getElementById('infoSheet').hidden && m.width > 0 && c.left >= m.right - 1 && Math.abs(c.top - m.top) < 40 ? 2 : 1 };
  })()`;
  // Start on the map's own tab, whatever an earlier step left open.
  const mapTab = await page.evaluate(box('.map-tab[data-tab="countries"]'));
  if (mapTab) { await page.click(...mapTab); await settle(page, 10000); }
  const bad = { small: new Set(), taps: new Set(), sideways: 0 };
  const note = (l) => { l.small.forEach((x) => bad.small.add(x)); l.taps.forEach((x) => bad.taps.add(x)); bad.sideways = Math.max(bad.sideways, l.sideways); };
  const options = await page.evaluate(`[...document.getElementById('recordPicker').options].filter((o) => o.value).map((o) => [o.value, o.textContent])`);
  let good = 0, cols = 0, pinsSeen = 0, clearRankings = 0;
  for (const [key, label] of options) {
    await page.evaluate(`(() => { const s = document.getElementById('recordPicker'); s.value = ${JSON.stringify(key)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await settle(page, 10000);
    const s = await page.evaluate(`(() => {
      const r = window.__shell.records.indices[${JSON.stringify(key)}];
      const pins = [...document.querySelectorAll('.ix-pin')].filter((p) => p.closest('.maplibregl-marker'));
      const want = JSON.parse(r.pins ?? '[]');
      const map = document.getElementById('map').getBoundingClientRect();
      const boxes = pins.map((p) => p.querySelector('.ix-pin-text').getBoundingClientRect());
      const outside = boxes.filter((b) => b.left < map.left || b.right > map.right || b.top < map.top || b.bottom > map.bottom).length;
      let overlaps = 0;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++; }
      const shaded = ['s1','s2','s3','s4','s5','s6','s7'].reduce((n, k) => n + (r[k] ?? []).length, 0);
      return { title: document.getElementById('infoTitle').textContent, stats: document.querySelectorAll('.ix-stats .ix-stat').length, kind: r.kind, shaded, hi: (r.hiTop ?? []).length + (r.hiBottom ?? []).length,
        pins: pins.length, wantPins: want.length, texts: pins.map((p) => p.querySelector('.ix-pin-text').textContent).join(' | '), want: want.map((p) => p.text).join(' | '), bdPins: pins.filter((p) => p.classList.contains('ix-pin-bd')).length, ends: pins.filter((p) => !p.classList.contains('ix-pin-bd')).length,
        outside, overlaps, strip: !document.querySelector('.ix-strip').hidden, note: Boolean(document.querySelector('.ix-note')), ownNote: Boolean(r.note), foot: Boolean(document.querySelector('.ix-foot a')) };
    })()`);
    const problems = [];
    if (s.title !== label) problems.push(`card «${s.title}»`);
    if (s.stats !== 3) problems.push(`${s.stats} stat blocks`);
    if (s.pins !== s.wantPins || s.texts !== s.want || s.bdPins !== 1 || s.ends < 2) problems.push(`pins «${s.texts}», not «${s.want}»`);
    if (s.outside || s.overlaps) problems.push(`${s.outside} pin label(s) outside the map, ${s.overlaps} overlapping`);
    if (s.kind === 'open' && (!s.shaded || s.hi || !s.strip || s.note !== s.ownNote)) problems.push(`open: shaded ${s.shaded}, highlights ${s.hi}, strip ${s.strip}, note ${s.note}`);
    if (s.kind === 'facts' && (s.shaded || !s.hi || s.strip || !s.note)) problems.push(`facts: shaded ${s.shaded}, highlights ${s.hi}, strip ${s.strip}, note ${s.note}`);
    if (!s.foot) problems.push('no «সূত্র» link');
    if (problems.length) fail(`indices: ${label} — ${problems.join('; ')}`);
    else good++;
    const l = await page.evaluate(LAYOUT);
    note(l);
    cols = Math.max(cols, l.cols);
    pinsSeen += s.pins;
    if (s.overlaps === 0 && s.outside === 0) clearRankings++;
  }
  await shoot('steps', `${options.at(-1)[1]}`);
  // Bangladesh's pin opens the card: tapped, the card is shown and in view.
  const bdAt = await page.evaluate(`(() => { const t = document.querySelector('.ix-pin-bd .ix-pin-text'); if (!t) return null; const q = t.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; })()`);
  let bdOpens = false;
  if (bdAt) {
    await page.click(...bdAt);
    await settle(page, 10000);
    bdOpens = await page.evaluate(`(() => { const c = document.getElementById('infoSheet'); const q = c.getBoundingClientRect(); return !c.hidden && q.top < innerHeight && q.bottom > 0; })()`);
  }
  if (!bdOpens) fail("indices: Bangladesh's pin does not open the card");
  // The «বাংলাদেশ» tab.
  const tabAt = await page.evaluate(box('.map-tab[data-tab="bangladesh"]'));
  if (!tabAt) { fail('indices: no «বাংলাদেশ» tab'); return; }
  await page.click(...tabAt);
  await settle(page, 10000);
  const bd = await page.evaluate(`({ rows: [...document.querySelectorAll('.ix-row')].map((r) => [r.dataset.key, r.tagName, r.querySelector('.ix-row-rank')?.textContent, r.querySelector('.ix-chip')?.textContent ?? null]), mapHidden: !document.getElementById('map').getClientRects().length, pickerHidden: !document.getElementById('recordPicker').getClientRects().length, list: !document.querySelector('.ix-list').hidden })`);
  note(await page.evaluate(LAYOUT));
  await shoot('steps', 'বাংলাদেশ tab');
  if (!bd.list || !bd.mapHidden || !bd.pickerHidden) fail(`indices: the «বাংলাদেশ» tab — list ${bd.list}, map hidden ${bd.mapHidden}, picker hidden ${bd.pickerHidden}`);
  const cityRows = Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/maps/global-indices/indices.json'), 'utf8'))).filter((r) => r.bdOnly).length;
  if (bd.rows.length !== options.length + cityRows) fail(`indices: the «বাংলাদেশ» tab lists ${bd.rows.length} rows for ${options.length} rankings and ${cityRows} city row(s)`);
  const chips = bd.rows.filter((r) => r[3]).length;
  let opened = 0;
  for (const [key] of bd.rows.filter((r) => r[1] === 'BUTTON')) {
    const at = await page.evaluate(`(() => { const r = document.querySelector('.ix-row[data-key="${key}"]'); if (!r) return null; r.scrollIntoView({ block: 'center' }); const q = r.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; })()`);
    if (!at) { fail(`indices: row ${key} gone`); continue; }
    await page.click(...at);
    await settle(page, 10000);
    const now = await page.evaluate(`[document.getElementById('recordPicker').value, Boolean(document.getElementById('map').getClientRects().length)]`);
    if (now[0] === key && now[1]) opened++;
    else fail(`indices: the row ${key} opened ${now[0]} (map shown ${now[1]})`);
    const back = await page.evaluate(box('.map-tab[data-tab="bangladesh"]'));
    if (back) { await page.click(...back); await settle(page, 10000); }
  }
  const home = await page.evaluate(box('.map-tab[data-tab="countries"]'));
  if (home) { await page.click(...home); await settle(page, 10000); }
  if (bad.small.size) fail(`indices: text under 14 px — ${[...bad.small].slice(0, 4).join(', ')}`);
  if (bad.taps.size) fail(`indices: tap targets under 44 px — ${[...bad.taps].slice(0, 4).join(', ')}`);
  if (bad.sideways > 0) fail(`indices: sideways scroll ${bad.sideways} px`);
  summary.push(`indices: ${good}/${options.length} rankings (card, stats, pins, shading); ${pinsSeen} pins, ${clearRankings}/${options.length} rankings with no pin overlapping or outside the map; Bangladesh's pin opens the card: ${bdOpens}; ${cols} column(s); «বাংলাদেশ» ${bd.rows.length} rows, ${chips} chips, ${opened} open their ranking; text ≥ 14 px, taps ≥ 44 px, sideways ${bad.sideways} px`);
}

async function pickerSteps(page, shoot, summary, fail, tabs = 0) {
  // Tabs that divide the records each list their own: every tab's picker, tab by tab. View tabs list them all — unless
  // the picker lists a table of its own per tab (`byTab`), when every tab's picker is stepped too.
  const divided = tabs > 0 && (await page.evaluate('(() => { const d = window.__shell?.descriptor; return Boolean(d?.tabs?.records || (d?.controls ?? []).find((c) => c.type === "picker")?.byTab); })()'));
  let good = 0;
  let total = 0;
  for (let t = 0; t < (divided ? tabs : 1); t++) {
    if (divided) {
      const at = await page.evaluate(`(() => { const b = document.querySelectorAll('.map-tab')[${t}]; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(...at);
      await settle(page, 10000);
    }
    const r = await pickerTab(page, shoot, fail);
    good += r.good;
    total += r.total;
  }
  summary.push(`picker ${good}/${total} cards${divided ? ` over ${tabs} tabs` : ''}`);
  if (divided) {
    const at = await page.evaluate(`(() => { const b = document.querySelectorAll('.map-tab')[0]; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await page.click(...at);
    await settle(page, 10000);
  }
}

/** One picker's items, as the open tab lists them: ›, each card, then the dropdown and ‹. */
async function pickerTab(page, shoot, fail) {
  const options = await page.evaluate(`[...document.getElementById('recordPicker').options].filter((o) => o.value).map((o) => [o.value, o.textContent])`);
  const start = await page.evaluate(`document.getElementById('recordPicker').value`);
  if (start) {
    await page.evaluate(`(() => { const s = document.getElementById('recordPicker'); s.value = ${JSON.stringify(options[0][0])}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  let good = 0;
  for (let i = 0; i < options.length; i++) {
    if (i > 0 || !start) {
      const next = await page.evaluate(box('#nextRecord'));
      if (!next) {
        fail(`picker: › missing or disabled before ${options[i][1]}`);
        break;
      }
      await page.click(...next);
    }
    const card = await waitCard(page);
    await fitCheck(page, `› ${options[i][1]}`);
    const value = await page.evaluate(`document.getElementById('recordPicker').value`);
    // On a map, the zoom its frame settles at: written to <size>-frames.txt, as text.
    const zoom = await page.evaluate(`(async () => { const m = window.__shell?.map; if (!m) return null; for (let k = 0; k < 50 && m.isMoving(); k++) await new Promise((r) => setTimeout(r, 50)); return Math.round(m.getZoom() * 100) / 100; })()`).catch(() => null);
    if (zoom !== null) (page.zooms ??= []).push(`${options[i][0]}\t${zoom}\t${options[i][1]}`);
    if (value === options[i][0] && card.open && card.title) good++;
    else fail(`picker ${options[i][1]}: value ${value || '(placeholder)'}, card ${card.open ? `«${card.title}»` : 'closed'}`);
    await shoot('steps', `› ${options[i][1]}`);
  }
  const ends = await page.evaluate(`[document.getElementById('nextRecord').disabled, document.getElementById('prevRecord').disabled]`);
  if (!ends[0]) fail('picker: › not disabled at the last item');
  // The dropdown itself, and ‹: the first option chosen, then ‹ stays put.
  await page.evaluate(`(() => { const s = document.getElementById('recordPicker'); s.value = ${JSON.stringify(options[0][0])}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const card = await waitCard(page);
  const prev = await page.evaluate(`document.getElementById('prevRecord').disabled`);
  if (!card.open || !prev) fail(`picker: the dropdown's first option → card ${card.open ? 'open' : 'closed'}, ‹ ${prev ? 'disabled' : 'enabled'}`);
  return { good, total: options.length };
}

/** Every timeline dot, tab by tab. */
async function timelineSteps(page, shoot, summary, fail, tabs) {
  let good = 0;
  let total = 0;
  for (let t = 0; t < Math.max(1, tabs); t++) {
    if (tabs) {
      const at = await page.evaluate(`(() => { const b = document.querySelectorAll('.map-tab')[${t}]; b.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(...at);
      await settle(page, 10000);
    }
    const DOTS = `[...document.querySelectorAll('.timeline-dot')].filter((b) => b.getClientRects().length)`;
    const count = await page.evaluate(`${DOTS}.length`);
    for (let i = 0; i < count; i++) {
      total++;
      const dot = await page.evaluate(`(() => { const b = ${DOTS}[${i}]; b.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = b.getBoundingClientRect(); return { at: [r.left + r.width / 2, r.top + r.height / 2], name: b.textContent.trim() }; })()`);
      await sleep(30);
      await page.click(...dot.at);
      const card = await waitCard(page);
      if (card.open && card.title) good++;
      else fail(`timeline ${dot.name}: no card`);
      await shoot('steps', `dot ${card.title ?? dot.name}`);
    }
  }
  summary.push(`timeline ${good}/${total} cards${tabs ? ` over ${tabs} tabs` : ''}`);
}

/** A diagram's slabs: each name tapped, its card, then ×. */
async function slabs(page, shoot, summary, fail) {
  const count = await page.evaluate(`document.querySelectorAll('.layer-name').length`);
  let good = 0;
  for (let i = 0; i < count; i++) {
    const name = await page.evaluate(`(() => { const b = document.querySelectorAll('.layer-name')[${i}]; const r = b.getBoundingClientRect(); return { at: [r.left + r.width / 2, r.top + r.height / 2], text: b.textContent.trim() }; })()`);
    await page.click(...name.at);
    const card = await waitCard(page);
    await fitCheck(page, name.text);
    await shoot('steps', name.text);
    const close = await page.evaluate(box('.card-close'));
    if (close) await page.click(...close);
    const after = await waitCard(page);
    if (card.open && card.title === name.text && !after.open) good++;
    else fail(`slab ${name.text}: card ${card.open ? `«${card.title}»` : 'closed'}, after × ${after.open ? 'open' : 'closed'}`);
  }
  summary.push(`slabs ${good}/${count} cards`);
  if (page.fit) {
    summary.push(`layout clear in ${page.fit.views - page.fit.bad.length}/${page.fit.views} views`);
    for (const b of page.fit.bad) fail(`layout — ${b}`);
  }
}

/**
 * A diagram's tap zones (`.zone[data-key]`): each tapped at a point where it
 * alone takes the tap, the card closed first; its card must open, titled as
 * its name, with the picker on it. A zone's `data-depth` is how deep it is
 * where its band is thinnest, in CSS px.
 */
async function zoneTaps(page, shoot, summary, fail) {
  const keys = await page.evaluate(`[...document.querySelectorAll('.zone[data-key]')].map((z) => z.dataset.key)`);
  let good = 0;
  const depths = [];
  const sizes = [];
  for (const key of keys) {
    const close = await page.evaluate(box('.card-close'));
    if (close) {
      await page.click(...close);
      await waitCard(page);
    }
    const hit = await page.evaluate(`(() => {
      const z = document.querySelector('.zone[data-key="${key}"]');
      const r = z.getBoundingClientRect();
      const hits = [];
      for (let y = r.top + 2; y < r.bottom; y += 5) for (let x = r.left + 2; x < r.right; x += 5) if (document.elementFromPoint(x, y) === z) hits.push([x, y]);
      if (!hits.length) return null;
      const mx = hits.reduce((s, p) => s + p[0], 0) / hits.length;
      const my = hits.reduce((s, p) => s + p[1], 0) / hits.length;
      hits.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
      return { at: hits[0], depth: z.dataset.depth ? Number(z.dataset.depth) : null, size: Math.min(r.width, r.height), name: z.dataset.title || document.querySelector('.layer-label[data-key="${key}"]')?.textContent.trim() };
    })()`);
    if (!hit) {
      fail(`zone ${key}: no point where it takes the tap`);
      continue;
    }
    depths.push([key, hit.depth]);
    if (hit.depth === null && hit.size < 44) fail(`zone ${key}: ${Math.round(hit.size)} px across, under 44`);
    if (hit.depth === null) sizes.push(Math.round(hit.size));
    await page.click(...hit.at);
    const card = await waitCard(page);
    await fitCheck(page, `tap ${hit.name}`);
    const value = await page.evaluate(`document.getElementById('recordPicker').value`);
    if (card.open && card.title === hit.name && value === key) good++;
    else fail(`zone ${key}: card ${card.open ? `«${card.title}»` : 'closed'}, picker ${value || '(placeholder)'}`);
    await shoot('taps', `${hit.name}`, hit.at);
  }
  const shallow = depths.filter(([, d]) => d < 44);
  const outer = depths.filter(([k]) => /crust/.test(k));
  summary.push(`taps ${good}/${keys.length} cards; ${outer.length ? `crust zones ${outer.map(([, d]) => d).join(' and ')} px deep` : `tap zones ≥ ${Math.min(...sizes)} px`}`);
  for (const [k, d] of shallow.filter(([k]) => /crust/.test(k))) fail(`zone ${k}: ${d} px deep, under 44`);
}

/*
 * The rivers picture (docs/visual/rivers.js), tab by tab: the tab shown, the
 * picker's one entry, then every line and every marker tapped where its zone
 * alone takes the tap — each must open its own card, its heading the zone's —
 * with the layout checked (names on the stage, clear of each other, the picker
 * row and the card; none under 15 px, 14 at 320) with no card and with each.
 * A marker's zone must be 44 px across; a line's is a stroke, not measured.
 */
async function riverSteps(page, shoot, summary, fail) {
  const tabs = await page.evaluate(`[...document.querySelectorAll('.view-tab')].map((t) => t.textContent.trim())`);
  const view = '.view-panel:not([hidden])';
  const parts = [];
  for (let i = 0; i < tabs.length; i++) {
    if (i > 0) {
      const at = await page.evaluate(`(() => { const r = document.querySelectorAll('.view-tab')[${i}].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(...at);
      const problem = await settle(page);
      if (problem) fail(`tab «${tabs[i]}»: ${problem}`);
    }
    await fitCheck(page, `«${tabs[i]}» no card`);
    await shoot('steps', `tab «${tabs[i]}»`);
    // One system at a time, its lines before its markers: a line's tap makes its system current, and only the current system's markers show. A card drawn as two lines is tapped once.
    const zones = await page.evaluate(`(() => { const all = [...document.querySelectorAll('${view} .zone[data-key]')].map((z) => [z.dataset.key, z.dataset.title, z.dataset.system || '']); const seen = new Set(); const uniq = all.filter(([k]) => !seen.has(k) && seen.add(k)); const order = [...new Set(uniq.map((z) => z[2]))]; return uniq.sort((a, b) => order.indexOf(a[2]) - order.indexOf(b[2]) || Number(a[0].startsWith('marker:')) - Number(b[0].startsWith('marker:'))); })()`);
    let good = 0;
    let least = Infinity;
    for (const [key, title, system] of zones) {
      const close = await page.evaluate(box(`${view} .card:not([hidden]) .card-close`));
      if (close) {
        await page.click(...close);
        await waitCard(page);
      }
      await sleep(400); // a second tap within 320 ms and 30 px is a double tap: a zoom
      const findHit = () => page.evaluate(`(() => {
        const z = document.querySelector('${view} .zone[data-key="${key}"]');
        const r = z.getBoundingClientRect();
        const zonesAt = (x, y) => document.elementsFromPoint(x, y).filter((e) => e.classList.contains('zone')).length;
        const hits = [];
        for (let y = r.top + 2; y < r.bottom; y += 4) for (let x = r.left + 2; x < r.right; x += 4) if (document.elementFromPoint(x, y) === z) hits.push([x, y, zonesAt(x, y)]);
        if (!hits.length) return null;
        const alone = hits.filter((h) => h[2] === 1);
        const pool = alone.length ? alone : hits;
        const mx = pool.reduce((s, p) => s + p[0], 0) / pool.length;
        const my = pool.reduce((s, p) => s + p[1], 0) / pool.length;
        pool.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
        return { at: pool[0].slice(0, 2), alone: alone.length > 0, size: Math.min(r.width, r.height) };
      })()`);
      let hit = await findHit();
      if (!hit || (!hit.alone && !key.startsWith('marker:'))) {
        // Frame its river first: the picker's entry for a line's card, or, for a marker, the card named in its heading.
        const river = key.startsWith('line:') ? key.slice(5) : null;
        const name = title.split(' — ')[0];
        const framed = await page.evaluate(`(() => {
          const s = document.getElementById('recordPicker');
          const opts = [...s.options].filter((o) => o.value);
          const o = ${JSON.stringify(river)} ? opts.find((x) => x.value === ${JSON.stringify(river)}) : opts.find((x) => x.textContent === ${JSON.stringify(name)}) ?? opts.find((x) => x.textContent.includes(${JSON.stringify(name)}));
          if (!o) return false;
          s.value = o.value;
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`);
        if (framed) {
          await waitCard(page);
          const shut = await page.evaluate(box(`${view} .card:not([hidden]) .card-close`));
          if (shut) {
            await page.click(...shut);
            await waitCard(page);
          }
          await sleep(400);
          hit = await findHit();
        }
        // Still covered by its neighbours: zoom in about 2× on the zone's middle (the wheel), up to three times.
        for (let zoomed = 0; zoomed < 3 && (!hit || (!hit.alone && !key.startsWith('marker:'))); zoomed++) {
          await page.evaluate(`(() => {
            const z = document.querySelector('${view} .zone[data-key="${key}"]');
            const stage = document.querySelector('${view} .stage');
            const r = z.getBoundingClientRect();
            const s = stage.getBoundingClientRect();
            const x = Math.min(Math.max(r.left + r.width / 2, s.left + 10), s.right - 10);
            const y = Math.min(Math.max(r.top + r.height / 2, s.top + 10), s.bottom - 10);
            stage.dispatchEvent(new WheelEvent('wheel', { clientX: x, clientY: y, deltaY: -385, bubbles: true, cancelable: true }));
          })()`);
          await sleep(500);
          hit = await findHit();
        }
      }
      if (!hit) {
        fail(`«${tabs[i]}» zone ${key}: no point where it takes the tap`);
        continue;
      }
      if (!hit.alone && !key.startsWith('marker:')) fail(`«${tabs[i]}» zone ${key}: no point where it is the only zone under the finger`);
      if (key.startsWith('marker:')) {
        least = Math.min(least, hit.size);
        if (hit.size < 43.5) fail(`zone ${key}: ${Math.round(hit.size)} px across, under 44`);
      }
      await page.click(...hit.at);
      const card = await waitCard(page);
      await fitCheck(page, `tap ${title}`);
      if (card.open && card.title === title) good++;
      else fail(`«${tabs[i]}» zone ${key}: card ${card.open ? `«${card.title}»` : 'closed'}, wanted «${title}»`);
      // A picture of several river systems: one taps sheet per system (taps-<system>).
      await shoot(system ? `taps-${system}` : 'taps', title, hit.at);
    }
    const close = await page.evaluate(box(`${view} .card:not([hidden]) .card-close`));
    if (close) {
      await page.click(...close);
      await waitCard(page);
    }
    const sub = [];
    await pickerSteps(page, shoot, sub, fail);
    const marks = zones.filter(([k]) => k.startsWith('marker:')).length;
    parts.push(`«${tabs[i]}» ${sub[0] ?? 'picker ?'}, taps ${good}/${zones.length} (${zones.length - marks} lines, ${marks} markers${marks ? `, zones ≥ ${Math.round(least)} px` : ''})`);
  }
  // A frame with an opening view (its reset control shows it): the opening, about 2×, and dragged south —
  // each laid out clear and shot to the views sheet — then back to the opening with the reset control.
  const resetAt = await page.evaluate(box('.view-panel:not([hidden]) .reset-view'));
  if (resetAt) {
    const closeAt = await page.evaluate(box('.view-panel:not([hidden]) .card:not([hidden]) .card-close'));
    if (closeAt) {
      await page.click(...closeAt);
      await waitCard(page);
    }
    const STAGE = "document.querySelector('.view-panel:not([hidden]) .stage')";
    const camera = `(() => { const g = document.querySelector('.view-panel:not([hidden]) .world').getAttribute('transform'); return g; })()`;
    await sleep(400);
    await page.click(...(await page.evaluate(box('.view-panel:not([hidden]) .reset-view'))));
    await sleep(700);
    const opening = await page.evaluate(camera);
    await fitCheck(page, 'the opening view');
    await shoot('views', 'the opening view');
    await page.evaluate(`(() => { const s = ${STAGE}; const r = s.getBoundingClientRect(); s.dispatchEvent(new WheelEvent('wheel', { deltaY: ${-Math.log(2) / 0.0018}, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true })); })()`);
    await sleep(300);
    await fitCheck(page, 'about 2×');
    await shoot('views', 'about 2×');
    await page.click(...(await page.evaluate(box('.view-panel:not([hidden]) .reset-view'))));
    await sleep(300);
    await page.evaluate(`(async () => { const s = ${STAGE}; const r = s.getBoundingClientRect(); const x = r.left + r.width / 2; let y = r.top + r.height * 0.85; const ev = (type) => s.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 })); ev('pointerdown'); for (let k = 0; k < 14; k++) { y -= r.height * 0.05; ev('pointermove'); await new Promise((q) => setTimeout(q, 16)); } ev('pointerup'); })()`);
    await sleep(300);
    const south = await page.evaluate(camera);
    await fitCheck(page, 'panned south');
    await shoot('views', 'panned south');
    await page.click(...(await page.evaluate(box('.view-panel:not([hidden]) .reset-view'))));
    await sleep(700);
    const back = await page.evaluate(camera);
    if (south === opening) fail('views — a drag did not pan the picture');
    if (back !== opening) fail(`views — the reset control did not return to the opening view (${opening} → ${back})`);
    parts.push('views: opening, about 2×, panned south, reset');
  }
  // ⓘ open: on the screen, scrolled to its last line, and closed again by a second tap on ⓘ.
  const info = await page.evaluate(box('.info-row .attrib-button'));
  if (info) {
    await page.click(...info);
    await sleep(300);
    await shoot('steps', 'ⓘ open');
    const got = await page.evaluate(`(() => { const p = document.querySelector('.attrib-inner'); const r = p.getBoundingClientRect(); p.scrollTop = p.scrollHeight; const l = p.lastElementChild.getBoundingClientRect(); return { fits: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, scrolls: p.scrollHeight > p.clientHeight, last: l.bottom <= r.bottom + 1 }; })()`);
    await page.click(...info);
    await sleep(200);
    const closed = await page.evaluate(`!document.querySelector('.attrib').classList.contains('open')`);
    if (!got.fits || !got.last || !closed) fail(`ⓘ panel — on screen ${got.fits}, last line reachable ${got.last}, closes ${closed}`);
    parts.push(`ⓘ on screen, ${got.scrolls ? 'scrolls' : 'fits'} to its last line, closes`);
  }
  summary.push(...parts);
}

/** Every record drawn by a tapped source: brought into view, tapped where it alone is, a card. */
/*
 * Edge taps (2026-10-08): where two points' tap targets overlap at a tab's opening view, a tap opens the record whose
 * centre is nearest the finger, within the target's radius (the shell's `nearest`, every map). For each such pair, each
 * point is tapped 12 px from its centre towards the other — on its own disc, inside the overlap — and the card that
 * opens must be the nearest centre's. Only where the picker lists the source's table, whose value names the record.
 */
async function edgeTaps(page, summary, fail, sources, tabs) {
  const results = [];
  for (let t = 0; t < Math.max(1, tabs); t++) {
    // This tab at its opening view: another tab first, then this one, nothing chosen.
    const open = async () => {
      await page.evaluate(`(() => { window.__shell.deselect(); const bs = document.querySelectorAll('.map-tab'); if (bs.length > 1) bs[${t === 0 ? 1 : 0}].click(); })()`);
      await settle(page, 10000);
      if (tabs) await page.evaluate(`document.querySelectorAll('.map-tab')[${t}].click()`);
      await settle(page, 10000);
    };
    await open();
    for (const source of sources) {
      const discs = await page.evaluate(`(() => {
        const s = window.__shell; const m = s.map; const spec = s.descriptor.sources[${JSON.stringify(source)}];
        const layer = ${JSON.stringify(source)} + '--hit';
        if (!m.getLayer(layer) || spec.geometryFrom === undefined) return null;
        const picker = document.getElementById('recordPicker');
        if (!picker || picker.hidden || ![...picker.options].some((o) => o.value && s.records[spec.records]?.[o.value])) return null;
        const r = m.getCanvas().getBoundingClientRect(); const seen = new Map();
        for (const f of m.queryRenderedFeatures({ layers: [layer] })) if (f.geometry.type === 'Point' && !seen.has(f.properties.key)) { const p = m.project(f.geometry.coordinates); seen.set(f.properties.key, { key: f.properties.key, x: r.left + p.x, y: r.top + p.y }); }
        return { radius: (spec.tapWidth ?? 44) / 2, discs: [...seen.values()] };
      })()`);
      if (!discs) continue;
      const pairs = [];
      for (let a = 0; a < discs.discs.length; a++) for (let b = a + 1; b < discs.discs.length; b++) {
        const A = discs.discs[a], B = discs.discs[b];
        if (Math.hypot(A.x - B.x, A.y - B.y) < 2 * discs.radius) pairs.push([A, B]);
      }
      for (const [A, B] of pairs) for (const [S, T] of [[A, B], [B, A]]) {
        const d = Math.hypot(T.x - S.x, T.y - S.y);
        const at = [S.x + ((T.x - S.x) * 12) / d, S.y + ((T.y - S.y) * 12) / d];
        const within = discs.discs.map((D) => [D.key, Math.hypot(D.x - at[0], D.y - at[1])]).filter(([, r]) => r <= discs.radius).sort((p, q) => p[1] - q[1]);
        const want = within[0]?.[0] ?? null;
        await open();
        await page.click(at[0], at[1]);
        await settle(page, 10000);
        const got = await page.evaluate(`document.getElementById('recordPicker').value || null`);
        const label = await page.evaluate(`(() => { const o = [...document.getElementById('recordPicker').options]; const n = (k) => o.find((x) => x.value === k)?.textContent.split('.')[0] ?? k; return [n(${JSON.stringify(S.key)}), n(${JSON.stringify(T.key)}), n(${JSON.stringify(want)}), n(document.getElementById('recordPicker').value)]; })()`);
        results.push(`${label[0]}→${label[1]}: ${label[3]}`);
        if (got !== want) fail(`edge tap on ${S.key} towards ${T.key}: opened ${got ?? 'nothing'}, the nearest centre is ${want}`);
      }
    }
  }
  await page.evaluate('window.__shell.deselect()');
  if (results.length) summary.push(`edge taps ${results.length} (nearest centre): ${results.join(', ')}`);
}

async function taps(page, shoot, summary, fail, sources, tabs, camera) {
  let good = 0;
  let own = 0;
  let total = 0;
  const unreachable = [];
  const others = [];
  // A map whose tap targets change with the zoom (a source with `tapFilter`, org-members: a country's dot while it
  // is small, its fill once it is large) counts each record once per tab, reached by any of its sources.
  const byRecord = await page.evaluate('Object.values(window.__shell.descriptor.sources ?? {}).some((s) => s.tapFilter)');
  const sourceRecords = byRecord ? await page.evaluate('Object.fromEntries(Object.entries(window.__shell.descriptor.sources).map(([k, s]) => [k, s.records]))') : {};
  const seenRec = new Set();
  const goodRec = new Set();
  const ownRec = new Set();
  const missed = [];
  for (let t = 0; t < Math.max(1, tabs); t++) {
    if (tabs) {
      const at = await page.evaluate(`(() => { const b = document.querySelectorAll('.map-tab')[${t}]; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(...at);
      await settle(page, 10000);
      // Each tab as it opens, on its own frame (a view tab's, or the map's own).
      const name = await page.evaluate(`document.querySelectorAll('.map-tab')[${t}].textContent.trim()`);
      await shoot('views', `tab «${name}»`);
      await chips(page, shoot, fail, name, camera);
    }
    // A tab that takes sources or records off the map (`views.<tab>.hide`) has no taps on them: the tab
    // that shows them taps them. Each record from this tab, chosen afresh, since a selection may disable it.
    const tabKey = tabs ? await page.evaluate(`document.querySelectorAll('.map-tab')[${t}].dataset.tab`) : null;
    const hides = tabKey && (await page.evaluate(`!!window.__shell.descriptor.tabs?.views?.[${JSON.stringify(tabKey)}]?.hide`));
    for (const source of sources) {
      if (hides && (await page.evaluate(`window.__shell.descriptor.tabs.views[${JSON.stringify(tabKey)}].hide.sources ?? []`)).includes(source)) continue;
      // A focus map draws only what the selection is about: every key the source can draw is tapped, each
      // after the picker has put its river (a branch's parent, a marker's owner) in view, or with nothing
      // selected for a record drawn at rest — as a student reaches it.
      const focus = await page.evaluate('!!window.__shell.descriptor.focus');
      const keys = await page.evaluate(focus ? `window.__shell.keysOf(${JSON.stringify(source)})` : `window.__check.features(${JSON.stringify(source)})`);
      for (const key of keys) {
        const rec = `${t}|${sourceRecords[source]}:${key}`;
        if (byRecord) {
          seenRec.add(rec);
          if (goodRec.has(rec)) continue;
        }
        total++;
        // A card with a × is closed first, so the tap has something to open.
        const close = (await page.evaluate(box('.globe-card-close'))) ?? (await page.evaluate(box('.timeline-card-close')));
        if (close) {
          await page.click(...close);
          await settle(page, 10000);
        }
        // This tab open, with nothing chosen, before the record is put in view: what it draws at rest is this tab's.
        if (hides && (await page.evaluate(`(() => { window.__shell.deselect(); const b = document.querySelectorAll('.map-tab')[${t}]; if (b.classList.contains('active')) return false; b.click(); return true; })()`))) await settle(page, 10000);
        if (focus) {
          await page.evaluate(`(() => {
            const s = window.__shell; const f = s.descriptor.focus; const table = s.descriptor.sources[${JSON.stringify(source)}].records;
            const also = (f.also ?? []).find((a) => a.records === table);
            const via = table === f.records ? s.records[table][${JSON.stringify(key)}]?.[f.parent] : also ? s.records[table][${JSON.stringify(key)}]?.[also.field] : null;
            s.deselect();
            const picker = document.getElementById('recordPicker');
            if (via != null && picker && !picker.hidden) { picker.value = via; picker.dispatchEvent(new Event('change', { bubbles: true })); }
            // A record with no parent that this view does not draw at rest (a tab resting on a set of its own): chosen itself.
            else if (table === f.records && !s.drawn(table, ${JSON.stringify(key)}) && picker && !picker.hidden) { picker.value = ${JSON.stringify(key)}; picker.dispatchEvent(new Event('change', { bubbles: true })); }
            window.__check.forget();
          })()`);
          await settle(page, 10000);
        }
        if (hides) {
          // Back on this tab when the record's selection leaves it open; else the record is the other tab's.
          const off = await page.evaluate(`(() => {
            const s = window.__shell; const b = document.querySelectorAll('.map-tab')[${t}];
            if (!b.classList.contains('active') && b.getAttribute('aria-disabled') !== 'true') b.click();
            const a = document.querySelector('.map-tab.active')?.dataset.tab; const h = s.descriptor.tabs.views[a]?.hide;
            if (a !== ${JSON.stringify(tabKey)}) return true;
            if (!h) return false;
            const table = s.descriptor.sources[${JSON.stringify(source)}].records;
            return (h.records ?? []).some((r) => r.records === table && s.records[table][${JSON.stringify(key)}]?.[r.field] === r.value);
          })()`);
          if (off) {
            total--;
            continue;
          }
          await settle(page, 10000);
        }
        // Each record from the map's opening camera, so no record's view carries over to the next.
        await page.evaluate(`window.__check.reset(${JSON.stringify(camera)})`);
        await settle(page, 10000);
        const find = () => page.evaluate(`window.__check.find(${JSON.stringify(source)}, ${JSON.stringify(key)})`);
        const bring = async (closer) => {
          await page.evaluate(`window.__check.bring(${JSON.stringify(source)}, ${JSON.stringify(key)}, ${closer})`);
          await settle(page, 10000);
        };
        let hit = await find();
        if (!hit) {
          await bring(0);
          hit = await find();
        }
        // Nowhere it is alone under the finger: two levels closer, then four; else back where it was found.
        if (!hit || !hit.alone) {
          const was = await page.evaluate(CAMERA);
          let closer = null;
          for (const levels of [2, 4]) {
            await bring(levels);
            closer = await find();
            if (closer?.alone) break;
          }
          if (closer && (closer.alone || !hit)) hit = closer;
          else if (hit) {
            await page.evaluate(`window.__check.reset(${JSON.stringify(was)})`);
            await settle(page, 10000);
            hit = await find();
          }
        }
        // Under the selection's pulse — its own, or its organisation's at its city — whose tap only
        // reopens the card: another record is chosen in the picker, up to three, and it is sought again.
        for (let option = 0; option < 3 && !hit && (await page.evaluate(`(() => { const m = document.querySelector('.selection-marker'); return !!m && m.getClientRects().length > 0; })()`)); option++) {
          const chose = await page.evaluate(`(() => { const s = document.getElementById('recordPicker'); const o = s && !s.hidden && [...s.options].filter((o) => o.value && o.value !== ${JSON.stringify(key)} && o.value !== s.value)[${option}]; if (!o) return false; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
          if (!chose) break;
          await settle(page, 10000);
          await page.evaluate(`window.__check.reset(${JSON.stringify(camera)})`);
          await settle(page, 10000);
          hit = (await find()) ?? (await bring(0), await find());
        }
        if (!hit) {
          if (byRecord) missed.push({ rec, label: `${source}:${key}` });
          else unreachable.push(`${source}:${key}`);
          continue;
        }
        const view = await page.evaluate(CAMERA);
        await page.evaluate('window.__checkChanges = 0');
        await page.click(hit.x, hit.y);
        const card = await waitCard(page);
        const changed = await page.evaluate('window.__checkChanges');
        const names = await page.evaluate(`window.__check.namesOf(${JSON.stringify(source)}, ${JSON.stringify(key)})`);
        const chosen = await page.evaluate('window.__check.selected()');
        const mine = card.open && (chosen.length ? chosen.includes(`${source}:${key}`) : names.includes(card.title));
        if (card.open && changed) {
          good++;
          if (mine) own++;
          else others.push(`${key} → «${card.title}»`);
          if (byRecord) (goodRec.add(rec), mine && ownRec.add(rec));
          if (!mine && hit.alone) fail(`tap ${source}:${key} alone under the finger at (${Math.round(hit.x)}, ${Math.round(hit.y)}), camera ${JSON.stringify(view)}, opened «${card.title}»`);
        } else fail(`tap ${source}:${key} at (${Math.round(hit.x)}, ${Math.round(hit.y)}): no card`);
        await shoot('taps', `${key}${mine ? '' : card.open ? ` → ${card.title}` : ' → nothing'}`, [hit.x, hit.y]);
      }
    }
  }
  if (byRecord) {
    unreachable.push(...missed.filter((m) => !goodRec.has(m.rec)).map((m) => m.label));
    [total, good, own] = [seenRec.size, goodRec.size, ownRec.size];
  }
  if (unreachable.length) fail(`no tap point for ${unreachable.length}: ${unreachable.slice(0, 6).join(', ')}`);
  summary.push(`taps ${good}/${total} cards (${own} its own${others.length ? `; ${others.length > 2 ? `${others.length} another's` : others.join(', ')}` : ''})`);
  if (page.chips) summary.push(`chips ${page.chips.good}/${page.chips.total}: only the members drawn, and all back when released`);
}

/** Each chip the open tab shows: pressed, only its members (and the places they point at) drawn; released, all back. */
async function chips(page, shoot, fail, tab, camera) {
  const shown = await page.evaluate(`[...document.querySelectorAll('.map-chip')].filter((b) => !b.hidden && b.getClientRects().length).map((b) => b.dataset.group)`);
  if (!shown.length) return;
  page.chips ??= { good: 0, total: 0 };
  const STATE = `(() => { const s = window.__shell; const c = s.descriptor.chips; const t = s.records[c.records];
    const drawn = Object.keys(t).filter((k) => s.drawn(c.records, k) && t[k].soloAt);
    const places = Object.entries(s.records.places ?? {}).filter(([k]) => s.drawn('places', k)).map(([k, p]) => p.records);
    return { drawn, places, groups: Object.fromEntries(Object.entries(t).map(([k, r]) => [k, r[c.field] ?? null])), tabOf: Object.fromEntries(Object.entries(t).map(([k, r]) => [k, r[s.descriptor.tabs?.field]])) }; })()`;
  const before = await page.evaluate(STATE);
  for (const group of shown) {
    page.chips.total++;
    const at = await page.evaluate(`(() => { const b = document.querySelector('.map-chip[data-group="${group}"]'); b.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.height, getComputedStyle(b.querySelector('.map-chip-pill')).fontSize]; })()`);
    if (at[2] < 44) fail(`chip ${group}: ${Math.round(at[2])} px tall, under 44`);
    if (parseFloat(at[3]) < 14) fail(`chip ${group}: text ${at[3]}, under 14 px`);
    await page.click(at[0], at[1]);
    await settle(page, 10000);
    const on = await page.evaluate(STATE);
    const pressed = await page.evaluate(`document.querySelector('.map-chip[data-group="${group}"]').getAttribute('aria-pressed')`);
    const strays = on.drawn.filter((k) => on.groups[k] !== group);
    const placeStrays = on.places.filter((keys) => !keys.some((k) => on.groups[k] === group));
    const members = Object.keys(on.groups).filter((k) => on.groups[k] === group);
    const label = await page.evaluate(`document.querySelector('.map-chip[data-group="${group}"]').textContent.trim()`);
    await shoot('views', `tab «${tab}», chip «${label}» (${members.length} members)`);
    await page.click(at[0], at[1]);
    await settle(page, 10000);
    const off = await page.evaluate(STATE);
    const back = JSON.stringify(off.drawn) === JSON.stringify(before.drawn) && off.places.length === before.places.length;
    if (pressed === 'true' && !strays.length && !placeStrays.length && back) page.chips.good++;
    else fail(`chip ${group}: pressed ${pressed}, drawn outside the group ${[...strays, ...placeStrays.map((p) => p.join('+'))].join(', ') || 'none'}, ${back ? 'all back' : 'not all back'} when released`);
    await page.evaluate(`window.__check.reset(${JSON.stringify(camera)})`);
    await settle(page, 10000);
  }
}

// ---- contact sheets -------------------------------------------------------------------

async function contactSheets(browser, dir, results, origin) {
  const made = [];
  const page = await browser.open([1240, 800], origin);
  for (const r of results) {
    for (const [group, list] of Object.entries(r.shots)) {
      if (!list.length) continue;
      const [w, h] = r.size.split('x').map(Number);
      const scale = 0.5;
      const tiles = list
        .map(({ file, caption, at }) => {
          const dot = at ? `<i style="left:${at[0] * scale - 7}px;top:${at[1] * scale - 7}px"></i>` : '';
          return `<figure><div class="img" style="width:${w * scale}px;height:${h * scale}px"><img src="${SHEETS}${path.relative(OUT, file).replaceAll('\\', '/')}" width="${w * scale}" height="${h * scale}">${dot}</div><figcaption>${caption.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</figcaption></figure>`;
        })
        .join('');
      const html = `<!doctype html><meta charset="utf-8"><style>body{margin:12px;font:12px system-ui,'Noto Sans Bengali',sans-serif;background:#fff;color:#222}h1{font-size:14px;margin:0 0 8px}main{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;width:${w * scale}px}.img{position:relative;outline:1px solid #ccc}img{display:block}i{position:absolute;width:10px;height:10px;border:2px solid #e0245e;border-radius:50%;background:rgba(224,36,94,.25)}figcaption{margin-top:3px;line-height:1.3;word-break:break-word}</style><h1>${path.basename(dir)} · ${r.size} · ${group.startsWith('taps-') ? `taps, the ${group.slice(5)} system` : { taps: 'taps', views: 'views: the opening, about 2×, panned south' }[group] ?? 'home, open, and each step'} (${list.length})</h1><main>${tiles}</main>`;
      const name = `${r.size}-${group}`;
      fs.writeFileSync(path.join(dir, `${name}.html`), html);
      await page.goto(`${origin}${SHEETS}${path.basename(dir)}/${name}.html`);
      for (let i = 0; i < 100 && !(await page.evaluate(`document.readyState === 'complete' && location.pathname.endsWith('/${name}.html')`).catch(() => false)); i++) await sleep(50);
      await page.evaluate(`Promise.all([...document.images].map((i) => i.decode().catch(() => {})))`);
      const height = await page.evaluate('Math.ceil(document.documentElement.scrollHeight)');
      await page.call('Emulation.setDeviceMetricsOverride', { width: 1240, height: Math.min(height, 16000), deviceScaleFactor: 1, mobile: false });
      await sleep(100);
      const file = path.join(dir, `${name}.png`);
      await page.shoot(file);
      fs.rmSync(path.join(dir, `${name}.html`));
      made.push(file);
    }
  }
  await page.close();
  return made;
}

// ---- every entry: the baseline, and against it ----------------------------------------

async function everyEntry(store) {
  const t0 = Date.now();
  const registry = readJson(path.join(DOCS, 'registry.json'));
  const server = await serveSite({ site: DOCS, prefix: PREFIX });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch();
  const jobs = registry.maps.flatMap((m) => SIZES.map((size) => ({ entry: { ...m, kind: m.kind ?? 'map' }, size })));
  const got = {};
  try {
    const queue = [...jobs];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const page = await browser.open(job.size, origin);
          await page.goto(origin + PREFIX + pageOf(job.entry));
          const problem = await settle(page);
          const camera = await page.evaluate(CAMERA).catch(() => null);
          const requests = [...new Set([...page.requests.values()].filter((r) => !/ERR_ABORTED/.test(String(r.status))).map((r) => `${r.method} ${r.url.replace(origin, '')}${r.range ? ` ${r.range}` : ''} ${r.status}`))].sort();
          got[`${job.entry.id}@${tag(job.size)}`] = { requests, console: [...page.logs, ...(problem ? [`check: ${problem}`] : [])], camera };
          await page.close();
        }
      }),
    );
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
  const keys = Object.keys(got).sort();
  if (store) {
    fs.mkdirSync(OUT, { recursive: true });
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    fs.writeFileSync(BASELINE, JSON.stringify({ made: new Date().toISOString(), head, entries: Object.fromEntries(keys.map((k) => [k, got[k]])) }, null, 1) + '\n');
    const noisy = keys.filter((k) => got[k].console.length);
    console.log(`baseline: ${registry.maps.length} entries × ${SIZES.length} sizes stored in tools/.check/baseline.json in ${seconds(t0)}; console clean on ${keys.length - noisy.length}/${keys.length}${noisy.length ? ` (not on ${noisy.join(', ')})` : ''}`);
    return;
  }
  if (!fs.existsSync(BASELINE)) {
    console.log('FAIL --all: no baseline; run node tools/check.mjs --baseline first');
    process.exitCode = 1;
    return;
  }
  const before = readJson(BASELINE);
  const diffs = [];
  let stampOnly = 0;
  const allKeys = [...new Set([...keys, ...Object.keys(before.entries)])].sort();
  for (const k of allKeys) {
    const a = before.entries[k];
    const b = got[k];
    if (!a || !b) {
      diffs.push(`${k}: ${a ? 'gone' : 'new'}`);
      continue;
    }
    const parts = [];
    const plus = b.requests.filter((r) => !a.requests.includes(r));
    const minus = a.requests.filter((r) => !b.requests.includes(r));
    if (plus.length || minus.length) parts.push(`requests +${plus.length} −${minus.length}${[...plus.map((r) => ` +${r}`), ...minus.map((r) => ` −${r}`)].slice(0, 2).join('')}`);
    const cPlus = b.console.filter((r) => !a.console.includes(r));
    const cMinus = a.console.filter((r) => !b.console.includes(r));
    if (cPlus.length || cMinus.length) parts.push(`console +${cPlus.length} −${cMinus.length}${cPlus.length ? ` (${cPlus[0]})` : ''}`);
    if (JSON.stringify(a.camera) !== JSON.stringify(b.camera)) parts.push(`camera ${JSON.stringify(a.camera)} → ${JSON.stringify(b.camera)}`);
    if (parts.length) diffs.push(`${k}: ${parts.join('; ')}`);
    // A difference that is the shells' version stamp alone (?v=, after a change under docs/shell, visual or shared).
    const unstamp = (list) => list.map((r) => r.replace(/\?v=[0-9a-f]+/, '?v=*')).sort().join('\n');
    if (parts.length === 1 && (plus.length || minus.length) && unstamp(plus) === unstamp(minus)) stampOnly++;
    else if (plus.length || minus.length) {
      // What changed beyond the stamp, in full.
      const a = new Set(minus.map((r) => r.replace(/\?v=[0-9a-f]+/, '?v=*'))), b = new Set(plus.map((r) => r.replace(/\?v=[0-9a-f]+/, '?v=*')));
      const more = [...b].filter((r) => !a.has(r)), less = [...a].filter((r) => !b.has(r));
      if (more.length || less.length) diffs[diffs.length - 1] += ` | beyond the stamp: ${[...more.map((r) => `+${r}`), ...less.map((r) => `−${r}`)].join(' ')}`;
    }
  }
  fs.writeFileSync(path.join(OUT, 'all.txt'), diffs.join('\n') + '\n');
  console.log(`${diffs.length ? 'FAIL' : 'PASS'} --all: ${registry.maps.length} entries × ${SIZES.length} sizes against the baseline of ${before.head} (${before.made.slice(0, 16)}): ${diffs.length} differences in ${seconds(t0)}${diffs.length ? `, ${stampOnly} of them the ?v= stamp alone` : ''}`);
  for (const d of diffs.slice(0, 8)) console.log(`  ${d.length > 220 ? d.slice(0, 217) + '…' : d}`);
  if (diffs.length > 8) console.log(`  … ${diffs.length - 8} more in tools/.check/all.txt`);
  process.exitCode = diffs.length ? 1 : 0;
}

// ---- the live site --------------------------------------------------------------------

async function live(id) {
  const t0 = Date.now();
  const hub = /Hub: `(https:\/\/[^`]+\/)`/.exec(fs.readFileSync(DEPLOYMENT, 'utf8'))?.[1];
  if (!hub) throw new Error('DEPLOYMENT.md names no hub URL');
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 30 });
  const rev = (r) => git('rev-parse', '--verify', r).toString().trim();
  // The pushed range: the old origin/main and the new, from the ref's reflog, or from --since.
  let from;
  try {
    from = rev(since ?? 'origin/main@{1}');
  } catch {
    console.log(`FAIL live: no ${since ? `revision ${since}` : 'previous origin/main in the reflog'}; name the range's start with --since=<rev>`);
    process.exitCode = 1;
    return;
  }
  const to = rev('origin/main');
  const changed = git('diff', '--name-only', '--no-renames', from, to, '--', 'docs/').toString().trim().split('\n').filter(Boolean);
  const files = [...new Set(['docs/registry.json', ...changed])];
  const present = (f) => {
    try {
      git('cat-file', '-e', `${to}:${f}`);
      return true;
    } catch {
      return false;
    }
  };
  // The pushed contents; a file the range deleted is to be gone.
  const want = new Map(files.map((f) => [f, present(f) ? sha256(git('show', `${to}:${f}`)) : 'HTTP 404']));
  const fetchSha = async (f) => {
    try {
      const res = await fetch(`${hub}${f.slice('docs/'.length)}?check=${Date.now()}`, { cache: 'no-store', headers: { 'accept-encoding': 'identity', 'User-Agent': UA } });
      if (!res.ok) return `HTTP ${res.status}`;
      return sha256(Buffer.from(await res.arrayBuffer()));
    } catch (error) {
      return `error ${error.cause?.code ?? error.message}`;
    }
  };
  const deadline = t0 + 10 * 60 * 1000;
  let polls = 0;
  let registryLive = false;
  let mismatches = files;
  for (;;) {
    polls++;
    registryLive = (await fetchSha('docs/registry.json')) === want.get('docs/registry.json');
    if (registryLive) {
      const got = [];
      // A few at a time, so a large push does not open hundreds of requests at once.
      for (let i = 0; i < files.length; i += 8) got.push(...(await Promise.all(files.slice(i, i + 8).map(async (f) => [f, await fetchSha(f)]))));
      mismatches = got.filter(([f, sha]) => sha !== want.get(f)).map(([f, sha]) => `${f} (${sha.length === 64 ? sha.slice(0, 12) : sha})`);
      if (!mismatches.length) break;
    }
    if (Date.now() + 30000 > deadline) break;
    await sleep(30000);
  }
  const range = `${from.slice(0, 7)}..${to.slice(0, 7)}`;
  const mine = changed.filter((f) => f.startsWith(`docs/maps/${id}/`) || f.startsWith(`docs/diagrams/${id}/`)).length;
  if (!mismatches.length) console.log(`PASS live matches: ${files.length}/${files.length} (the push ${range}: ${changed.length} files under docs/, ${mine} of them ${id}'s, and registry.json; ${polls} poll${polls > 1 ? 's' : ''}, ${seconds(t0)})`);
  else {
    console.log(`FAIL live: ${registryLive ? `${mismatches.length} of ${files.length} differ` : 'registry.json still not the pushed one'} (the push ${range}) after ${polls} polls, ${seconds(t0)}`);
    for (const m of (registryLive ? mismatches : []).slice(0, 8)) console.log(`  ${m}`);
  }
  process.exitCode = mismatches.length ? 1 : 0;
}

// ---- run ------------------------------------------------------------------------------

try {
  if (flags.has('--live')) await live(ids[0]);
  else if (flags.has('--baseline')) await everyEntry(true);
  else if (flags.has('--all')) await everyEntry(false);
  else await checkItem(ids[0]);
} catch (error) {
  console.log(`FAIL check: ${error.message}`);
  process.exitCode = 1;
}
