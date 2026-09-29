// Serves a local preview of the site, on this machine only, with the work in
// progress on its home page.
//
//   node tools/preview.mjs [--build <diagram-id>]... [port]
//   (tools/check.mjs --fixture=<dir> mounts a test map from outside docs/ into the copy: makeSite's `fixtures`)
//
// Copies docs/ into a temporary folder outside the repo and serves the copy at
// http://127.0.0.1:<port>/ (8765 by default) until stopped. Nothing is written
// inside the repo. On the copy only:
//
//   - Every item in tools/wip.json is on the home page, in its section, as the
//     live site will show it once finished (the user's standing rule: a new map
//     or diagram goes on the home page first, before any work, and reaches the
//     live home page only when finished). Its card opens whatever exists so
//     far — what the item's own build tool writes into the copy, where it has
//     one: tools/build-<id>.mjs for a map, tools/build-diagram-<id>.mjs for a
//     diagram, each given the copy's folder for it and writing all of it, its
//     descriptor too — or, while nothing exists yet, a «কাজ চলছে» page.
//   - --build <id> builds a finished diagram into the copy afresh with
//     tools/build-diagram-<id>.mjs, to see a change to its seed, art or page
//     before it is built into docs/.
//
// Re-run it to pick up a change. tools/check.mjs makes and serves the same
// copy through makeSite() and serveSite().
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The served tree, copied; the work in progress; and where the copy is made.
const DOCS = path.join(ROOT, 'docs');
const WIP = path.join(HERE, 'wip.json');
const PREVIEW = path.join(os.tmpdir(), 'geoquest-preview', 'site');

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const TOOL_OUTPUT = { stdio: 'inherit' };

/**
 * The copy of docs/ with the work in progress on its home page, made afresh
 * in `site`: returns the folder and the ids that answer «কাজ চলছে».
 */
export function makeSite({ site = PREVIEW, rebuild = [], quiet = false, fixtures = [] } = {}) {
  fs.rmSync(site, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.cpSync(DOCS, site, { recursive: true });

  const build = (tool, out) => execFileSync(process.execPath, [tool, out], quiet ? { stdio: 'pipe' } : TOOL_OUTPUT);

  for (const id of rebuild) {
    const tool = path.join(HERE, `build-diagram-${id}.mjs`);
    if (!fs.existsSync(tool) || !fs.existsSync(path.join(site, 'diagrams', id))) throw new Error(`--build ${id}: no finished diagram with a build tool by that id`);
    build(tool, path.join(site, 'diagrams', id));
  }

  // ---- the work in progress, on the copy's home page -----------------------------------

  const registryFile = path.join(site, 'registry.json');
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  const placeholders = new Map(); // "maps/<id>" or "diagrams/<id>" -> the item, while nothing exists
  for (const item of JSON.parse(fs.readFileSync(WIP, 'utf8')).items ?? []) {
    const folder = item.kind === 'diagram' ? 'diagrams' : 'maps';
    const out = path.join(site, folder, item.id);
    const tool = path.join(HERE, item.kind === 'diagram' ? `build-diagram-${item.id}.mjs` : `build-${item.id}.mjs`);
    if (fs.existsSync(tool)) {
      fs.mkdirSync(out, { recursive: true });
      build(tool, out);
    }
    if (!fs.existsSync(path.join(out, 'descriptor.json'))) placeholders.set(`${folder}/${item.id}`, item);
    registry.maps.push({ id: item.id, ...(item.kind === 'diagram' ? { kind: 'diagram' } : {}), section: item.section, title: { en: item.title.en, bn: item.title.bn } });
    if (!quiet) console.log(`work in progress: ${item.kind} ${item.id} (${item.section}) — ${placeholders.has(`${folder}/${item.id}`) ? 'nothing yet, «কাজ চলছে»' : 'built into the copy'}`);
  }
  // A test map kept outside docs/ (tools/check.mjs --fixture=<dir>): copied into the copy only, as a map
  // of its folder's name, listed on the copy's home page from its own descriptor. Never published.
  for (const dir of fixtures) {
    const id = path.basename(dir);
    if (!ID.test(id)) throw new Error(`fixture ${dir}: "${id}" is not an id`);
    const out = path.join(site, 'maps', id);
    if (fs.existsSync(out)) throw new Error(`fixture ${id}: docs/ has a map by that name`);
    fs.cpSync(dir, out, { recursive: true });
    const d = JSON.parse(fs.readFileSync(path.join(out, 'descriptor.json'), 'utf8'));
    registry.maps.push({ id, section: d.section, title: { en: d.title.en, bn: d.title.bn } });
  }
  // The generator's order: the syllabus sections, then id.
  registry.maps.sort((a, b) => registry.sections.indexOf(a.section) - registry.sections.indexOf(b.section) || (a.id < b.id ? -1 : 1));
  fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2) + '\n');
  return { site, placeholders };
}

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const placeholderPage = (item) => `<!doctype html>
<html lang="bn">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escape(item.title.bn)}</title>
    <link rel="icon" href="data:," />
    <style>
      @font-face {
        font-family: 'Noto Sans Bengali';
        src: url('../shared/fonts/noto-sans-bengali/NotoSansBengali-Regular.woff2') format('woff2');
      }
      body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
        padding: 24px;
        box-sizing: border-box;
        background: #eef3f8;
        color: #13233a;
        font-family: 'Noto Sans Bengali', system-ui, sans-serif;
        text-align: center;
      }
      h1 { margin: 0; font-size: 22px; line-height: 1.3; }
      p { margin: 0; color: #4f5d6e; font-size: 15px; }
      .wip { margin-top: 12px; padding: 6px 16px; border: 1px dashed #c9d6e3; border-radius: 999px; color: #5b6878; }
    </style>
  </head>
  <body>
    <h1>${escape(item.title.bn)}</h1>
    <p lang="en">${escape(item.title.en)}</p>
    <p class="wip">কাজ চলছে</p>
  </body>
</html>
`;

// ---- the server ------------------------------------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // The vendored MapLibre is ES modules named .mjs; a browser refuses a
  // module served as anything but JavaScript, so without this no map opens.
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.geojson': 'application/json; charset=utf-8',
  '.pmtiles': 'application/octet-stream',
};

/**
 * A server for a site folder, as production serves it: no directory index,
 * Range requests, and nothing cached. `prefix` is the path the site sits
 * under, "/" or a subpath like the live site's; `extra` maps a further path
 * prefix to a folder served beside it.
 */
export function serveSite({ site, placeholders = new Map(), port = 0, prefix = '/', extra = {} }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let pathname = decodeURIComponent(url.pathname);
    let root = site;
    const more = Object.keys(extra).find((p) => pathname.startsWith(p));
    if (more) {
      root = extra[more];
      pathname = '/' + pathname.slice(more.length);
    } else {
      if (!pathname.startsWith(prefix)) return res.writeHead(404).end('not found');
      pathname = '/' + pathname.slice(prefix.length);
    }
    // A work-in-progress card opens its shell; while nothing exists, the shell's URL answers «কাজ চলছে».
    const wanted = pathname === '/shell/index.html' ? `maps/${url.searchParams.get('map')}` : pathname === '/visual/index.html' ? `diagrams/${url.searchParams.get('v')}` : null;
    if (!more && wanted && placeholders.has(wanted)) {
      const body = placeholderPage(placeholders.get(wanted));
      res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) });
      return res.end(body);
    }
    const file = path.join(root, pathname);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return res.writeHead(404).end('not found');
    }
    // Like production, no directory index: every URL names its file.
    if (!stat.isFile()) return res.writeHead(404).end('not found');
    const head = { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : stat.size - 1, stat.size - 1);
      res.writeHead(206, { ...head, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${stat.size}` });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'content-length': stat.size });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

// ---- run as a command ------------------------------------------------------------------

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rebuild = [];
  let port = 8765;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--build' && ID.test(args[i + 1] ?? '')) rebuild.push(args[++i]);
    else if (/^\d+$/.test(args[i])) port = Number(args[i]);
    else {
      console.error('usage: node tools/preview.mjs [--build <diagram-id>]... [port]');
      process.exit(2);
    }
  }
  let made;
  try {
    made = makeSite({ rebuild });
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  await serveSite({ ...made, port });
  console.log(`serving a copy of docs/ from ${made.site}`);
  console.log(`open http://127.0.0.1:${port}/index.html`);
}
