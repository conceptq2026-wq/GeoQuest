// Downloads every pinned source into tools/.cache/ and refuses to continue
// if any byte differs from the hash recorded in sources.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { UA } from './net.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const cache = path.join(here, '.cache');
const sources = JSON.parse(fs.readFileSync(path.join(here, 'sources.json'), 'utf8'));
fs.mkdirSync(cache, { recursive: true });

// Git's object id for a file: sha1("blob <size>\0" + bytes).
const gitBlobSha1 = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchVerified(url, dest, check) {
  if (fs.existsSync(dest) && check(fs.readFileSync(dest))) {
    console.log(`ok (cached)  ${path.basename(dest)}`);
    return;
  }
  const buf = await download(url);
  if (!check(buf)) throw new Error(`Checksum mismatch for ${url} — refusing to use it.`);
  fs.writeFileSync(dest, buf);
  console.log(`ok (fetched) ${path.basename(dest)}  ${(buf.length / 1e6).toFixed(1)} MB`);
}

// A source pinned by SHA-256 where nobody publishes one is pinned by its first
// download: until the hash is recorded, its size is checked and its SHA-256
// printed for sources.json, and nothing reaches the cache — so no build ever
// reads a file that is not pinned.
async function fetchPinned(entry, dest, check) {
  if (!entry.sha256) {
    const buf = await download(entry.url);
    if (!check(buf)) throw new Error(`${entry.file}: ${buf.length} bytes, not the recorded size — refusing it`);
    throw new Error(`${entry.file}: no sha256 recorded — this download is ${sha256(buf)} (${buf.length} bytes); record it in tools/sources.json and run again`);
  }
  await fetchVerified(entry.url, dest, (buf) => check(buf) && sha256(buf) === entry.sha256);
}

// Natural Earth: each file by its git blob hash in the pinned commit's tree,
// and by SHA-256 as well where one is recorded.
const ne = sources.naturalEarth;
for (const [name, want] of Object.entries(ne.files)) {
  await fetchVerified(ne.baseUrl + name, path.join(cache, name),
    (buf) => buf.length === want.size && gitBlobSha1(buf) === want.gitBlobSha1 && (want.sha256 === undefined || sha256(buf) === want.sha256));
}

const font = sources.notoSansBengali;
await fetchVerified(font.url, path.join(cache, font.file),
  (buf) => buf.length === font.size && sha256(buf) === font.sha256);

// The Bangladesh basemap's administrative boundaries, one file per country.
for (const entry of [sources.codAbBangladesh, sources.geoBoundariesIndia]) {
  await fetchVerified(entry.url, path.join(cache, entry.file),
    (buf) => buf.length === entry.size && sha256(buf) === entry.sha256);
}

const lic = sources.pmtilesLicence;
await fetchVerified(lic.url, path.join(cache, lic.file),
  (buf) => buf.length === lic.size && gitBlobSha1(buf) === lic.gitBlobSha1);

// The latitude-longitude globe's imagery, NASA's Blue Marble: Next Generation.
const marble = sources.nasaBlueMarble;
await fetchPinned(marble, path.join(cache, marble.file), (buf) => buf.length === marble.size);

// The maritime-zones diagram's two sources (UN DOALOS): the overview page, and the
// Convention's parts its seed cites — each by size and SHA-256, into unclos/. The site
// names the parts .htm; the cache keeps them as .html.
const overview = sources.unclosOverview;
fs.mkdirSync(path.join(cache, path.dirname(overview.file)), { recursive: true });
await fetchVerified(overview.url, path.join(cache, overview.file),
  (buf) => buf.length === overview.size && sha256(buf) === overview.sha256);
const convention = sources.unclosConvention;
fs.mkdirSync(path.join(cache, convention.dir), { recursive: true });
for (const [name, want] of Object.entries(convention.files)) {
  await fetchVerified(convention.baseUrl + name.replace(/\.html$/, '.htm'), path.join(cache, convention.dir, name),
    (buf) => buf.length === want.size && sha256(buf) === want.sha256);
}

// Three.js r128, the maritime-zones 3D view's library: the npm tarball, by size and SHA-256. Its two
// vendored files are held to their own SHA-256s by tools/verify.mjs.
const three128 = sources.threeR128;
await fetchVerified(three128.url, path.join(cache, three128.file),
  (buf) => buf.length === three128.size && sha256(buf) === three128.sha256);
