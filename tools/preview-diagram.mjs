// Serves a diagram freshly built from its seed, on this machine only — to see
// a change to the seed, the art or the page before it is built into docs/.
//
//   node tools/preview-diagram.mjs <diagram-id> [port]
//
// Copies docs/ into a temporary folder outside the repo, builds the diagram
// into that copy's diagrams/<id>/ with tools/build-diagram-<id>.mjs, and
// serves the copy at http://127.0.0.1:<port>/ (8765 by default) until stopped.
// Nothing is written inside the repo. Re-run it to pick up a change.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The served tree, copied; and where the copy is made.
const DOCS = path.join(ROOT, 'docs');
const PREVIEW = path.join(os.tmpdir(), 'geoquest-preview');

const [id, portArg = '8765'] = process.argv.slice(2);
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id ?? '')) {
  console.error('usage: node tools/preview-diagram.mjs <diagram-id> [port]');
  process.exit(2);
}
const build = path.join(HERE, `build-diagram-${id}.mjs`);
if (!fs.existsSync(build)) {
  console.error(`no build for "${id}": ${build}`);
  process.exit(2);
}

const site = path.join(PREVIEW, id);
fs.rmSync(site, { recursive: true, force: true });
fs.cpSync(DOCS, site, { recursive: true });
execFileSync(process.execPath, [build, path.join(site, 'diagrams', id)], { stdio: 'inherit' });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.pmtiles': 'application/octet-stream',
};

http
  .createServer((req, res) => {
    const file = path.join(site, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(site + path.sep)) return res.writeHead(403).end();
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
  })
  .listen(Number(portArg), '127.0.0.1', () => {
    console.log(`serving a copy of docs/ from ${site}`);
    console.log(`open http://127.0.0.1:${portArg}/visual/index.html?v=${id}`);
  });
