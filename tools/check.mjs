// The end-of-prompt check, in text: one command, and everything it starts it
// closes on exit.
//
//   node tools/check.mjs <id>              the item, used as a student would
//   node tools/check.mjs --baseline        every registry entry, stored
//   node tools/check.mjs --all             every registry entry, against the stored baseline
//   node tools/check.mjs <id> --live       the live site against the committed files
//
// <id> serves the local preview's copy of docs/ (tools/preview.mjs, so work
// in progress is on its home page) and, at 390×844 and 320×640 in headless
// Edge with reduced motion: opens the home page and checks the item's card
// is in its section; opens the item from that card; steps through every
// picker item (‹ › and the dropdown's options) or every timeline dot, or a
// diagram's every slab, or its picker items and tap zones (a thin zone's
// depth checked against 44 px), and checks each card opens; taps every record drawn
// on the map at a point where it alone is under the finger, and checks a card
// opens; and reports console messages and any request to a host but ours.
// Screenshots go to tools/.check/<id>/ as contact sheets, never to stdout. A
// work-in-progress item with nothing built yet opens the preview's «কাজ চলছে»
// page, and only its card and that page are checked.
//
// --baseline and --all open every registry entry at both sizes and keep, or
// compare, its requests (with their Range headers), its console and its
// camera once settled — a shell change's proof, as text; no pixels.
//
// --live makes no browser: it polls the live site, every 30 s for at most
// 10 minutes, until it serves the committed registry.json, then compares the
// SHA-256 of every committed file of the item, and of registry.json, with
// the live files. The live address is DEPLOYMENT.md's, the one place it is
// written.
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSite, serveSite } from './preview.mjs';

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
const flags = new Set(args.filter((a) => a.startsWith('--')));
const ids = args.filter((a) => !a.startsWith('--'));
const usage = () => {
  console.error('usage: node tools/check.mjs <id> | <id> --live | --baseline | --all');
  process.exit(2);
};
for (const f of flags) if (!['--baseline', '--all', '--live'].includes(f)) usage();
if (flags.has('--baseline') || flags.has('--all')) {
  if (ids.length || flags.size > 1) usage();
} else if (ids.length !== 1 || !ID.test(ids[0])) usage();

// ---- what the item is -----------------------------------------------------------------

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function entryOf(id) {
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
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
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
  if (visual) return !!document.querySelector('.layer-name, .layer-label') && !document.querySelector('.loading');
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
  const sheet = document.getElementById('infoSheet');
  if (sheet) {
    const open = !sheet.hidden && !sheet.inert && getComputedStyle(sheet).display !== 'none' && sheet.getBoundingClientRect().height > 0;
    return { open, title: open ? document.getElementById('infoTitle').textContent.trim() : null };
  }
  const card = document.querySelector('.card');
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
  window.__check = { sources, features, find, bring, reset, selected, pickerTable, namesOf: async (s, k) => namesOf(await featureOf(s, k)) };
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

  const made = makeSite({ site: SITE_COPY, quiet: true });
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
  const shots = { steps: [], taps: [] };
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
    shots[group].push({ file, caption, at });
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
  const placeholder = !opened && (await page.evaluate(`!!document.querySelector('p.wip')`));
  if (placeholder) summary.push('the «কাজ চলছে» page, nothing built yet');
  else if (!opened) {
    if (entry.kind === 'diagram') {
      const picker = await page.evaluate(`(() => { const p = document.getElementById('recordPicker'); return !!p && !p.hidden; })()`);
      if (picker) {
        await fitCheck(page, 'no card');
        await pickerSteps(page, shoot, summary, fail);
        await zoneTaps(page, shoot, summary, fail);
        if (page.fit) {
          summary.push(`layout clear in ${page.fit.views - page.fit.bad.length}/${page.fit.views} views`);
          for (const b of page.fit.bad) fail(`layout — ${b}`);
        }
      } else await slabs(page, shoot, summary, fail);
    }
    else {
      const sources = await page.evaluate(`(${tapFinder})()`);
      const camera = await page.evaluate(CAMERA);
      const selector = await page.evaluate(`(() => { const p = document.getElementById('recordPicker'); return p && !p.hidden ? 'picker' : document.querySelector('.timeline-dot') ? 'timeline' : null; })()`);
      const tabs = await page.evaluate(`document.querySelectorAll('.map-tab').length`);
      if (selector === 'picker') await pickerSteps(page, shoot, summary, fail);
      else if (selector === 'timeline') await timelineSteps(page, shoot, summary, fail, tabs);
      else fail('no picker and no timeline');
      await taps(page, shoot, summary, fail, sources, tabs, camera);
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
  const blocks = [document.querySelector('.picker-row'), document.querySelector('.card:not([hidden])')].filter(Boolean).map((e) => e.getBoundingClientRect());
  // Every element a view marks with data-fit stays on the stage, clear of the picker row and the card.
  const items = [...document.querySelectorAll('[data-fit]')].map((e) => [e.getAttribute('data-fit'), e]);
  const bad = items.filter(([, e]) => e.getClientRects().length).filter(([, e]) => { const r = e.getBoundingClientRect(); return !within(r) || blocks.some((b) => under(r, b)); }).map(([name]) => name);
  // No words on each other, and names never under the user's minimum: 15 px at 390 px wide, 14 px at 320.
  const words = [...document.querySelectorAll('.layer-label, .fit-text')].filter((e) => e.getClientRects().length);
  const nameOf = (e) => e.getAttribute('data-fit') || e.dataset.key || e.textContent;
  for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) if (under(words[i].getBoundingClientRect(), words[j].getBoundingClientRect())) bad.push(nameOf(words[i]) + ' on ' + nameOf(words[j]));
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

/** ‹ › and the dropdown: › from the placeholder through every option, then the ends. */
async function pickerSteps(page, shoot, summary, fail) {
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
  summary.push(`picker ${good}/${options.length} cards`);
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
    await shoot('steps', name.text);
    const close = await page.evaluate(box('.card-close'));
    if (close) await page.click(...close);
    const after = await waitCard(page);
    if (card.open && card.title === name.text && !after.open) good++;
    else fail(`slab ${name.text}: card ${card.open ? `«${card.title}»` : 'closed'}, after × ${after.open ? 'open' : 'closed'}`);
  }
  summary.push(`slabs ${good}/${count} cards`);
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

/** Every record drawn by a tapped source: brought into view, tapped where it alone is, a card. */
async function taps(page, shoot, summary, fail, sources, tabs, camera) {
  let good = 0;
  let own = 0;
  let total = 0;
  const unreachable = [];
  const others = [];
  for (let t = 0; t < Math.max(1, tabs); t++) {
    if (tabs) {
      const at = await page.evaluate(`(() => { const b = document.querySelectorAll('.map-tab')[${t}]; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      await page.click(...at);
      await settle(page, 10000);
    }
    for (const source of sources) {
      const keys = await page.evaluate(`window.__check.features(${JSON.stringify(source)})`);
      for (const key of keys) {
        total++;
        // A card with a × is closed first, so the tap has something to open.
        const close = (await page.evaluate(box('.globe-card-close'))) ?? (await page.evaluate(box('.timeline-card-close')));
        if (close) {
          await page.click(...close);
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
          unreachable.push(`${source}:${key}`);
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
          if (!mine && hit.alone) fail(`tap ${source}:${key} alone under the finger at (${Math.round(hit.x)}, ${Math.round(hit.y)}), camera ${JSON.stringify(view)}, opened «${card.title}»`);
        } else fail(`tap ${source}:${key} at (${Math.round(hit.x)}, ${Math.round(hit.y)}): no card`);
        await shoot('taps', `${key}${mine ? '' : card.open ? ` → ${card.title}` : ' → nothing'}`, [hit.x, hit.y]);
      }
    }
  }
  if (unreachable.length) fail(`no tap point for ${unreachable.length}: ${unreachable.slice(0, 6).join(', ')}`);
  summary.push(`taps ${good}/${total} cards (${own} its own${others.length ? `; ${others.length > 2 ? `${others.length} another's` : others.join(', ')}` : ''})`);
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
      const html = `<!doctype html><meta charset="utf-8"><style>body{margin:12px;font:12px system-ui,'Noto Sans Bengali',sans-serif;background:#fff;color:#222}h1{font-size:14px;margin:0 0 8px}main{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;width:${w * scale}px}.img{position:relative;outline:1px solid #ccc}img{display:block}i{position:absolute;width:10px;height:10px;border:2px solid #e0245e;border-radius:50%;background:rgba(224,36,94,.25)}figcaption{margin-top:3px;line-height:1.3;word-break:break-word}</style><h1>${path.basename(dir)} · ${r.size} · ${group === 'taps' ? 'taps' : 'home, open, and each step'} (${list.length})</h1><main>${tiles}</main>`;
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
  }
  fs.writeFileSync(path.join(OUT, 'all.txt'), diffs.join('\n') + '\n');
  console.log(`${diffs.length ? 'FAIL' : 'PASS'} --all: ${registry.maps.length} entries × ${SIZES.length} sizes against the baseline of ${before.head} (${before.made.slice(0, 16)}): ${diffs.length} differences in ${seconds(t0)}`);
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
  const folder = ['maps', 'diagrams'].map((f) => `docs/${f}/${id}/`).find((f) => git('ls-tree', '-r', '--name-only', 'HEAD', f).toString().trim());
  if (!folder) {
    console.log(`FAIL live ${id}: no committed folder docs/maps/${id}/ or docs/diagrams/${id}/`);
    process.exitCode = 1;
    return;
  }
  const files = ['docs/registry.json', ...git('ls-tree', '-r', '--name-only', 'HEAD', folder).toString().trim().split('\n')];
  const want = new Map(files.map((f) => [f, sha256(git('show', `HEAD:${f}`))]));
  const fetchSha = async (f) => {
    try {
      const res = await fetch(`${hub}${f.slice('docs/'.length)}?check=${Date.now()}`, { cache: 'no-store', headers: { 'accept-encoding': 'identity' } });
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
      const got = await Promise.all(files.map(async (f) => [f, await fetchSha(f)]));
      mismatches = got.filter(([f, sha]) => sha !== want.get(f)).map(([f, sha]) => `${f} (${sha.length === 64 ? sha.slice(0, 12) : sha})`);
      if (!mismatches.length) break;
    }
    if (Date.now() + 30000 > deadline) break;
    await sleep(30000);
  }
  const head = git('rev-parse', '--short', 'HEAD').toString().trim();
  if (!mismatches.length) console.log(`PASS live matches: ${files.length}/${files.length} (${folder} and registry.json at ${head}; ${polls} poll${polls > 1 ? 's' : ''}, ${seconds(t0)})`);
  else {
    console.log(`FAIL live: ${registryLive ? `${mismatches.length} of ${files.length} differ` : 'registry.json still not the committed one'} after ${polls} polls, ${seconds(t0)}`);
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
