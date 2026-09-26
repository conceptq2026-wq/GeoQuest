// Downloads every pinned source into tools/.cache/ and refuses to continue
// if any byte differs from the hash recorded in sources.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const cache = path.join(here, '.cache');
const sources = JSON.parse(fs.readFileSync(path.join(here, 'sources.json'), 'utf8'));
fs.mkdirSync(cache, { recursive: true });

// Git's object id for a file: sha1("blob <size>\0" + bytes).
const gitBlobSha1 = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function fetchVerified(url, dest, check) {
  if (fs.existsSync(dest) && check(fs.readFileSync(dest))) {
    console.log(`ok (cached)  ${path.basename(dest)}`);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!check(buf)) throw new Error(`Checksum mismatch for ${url} — refusing to use it.`);
  fs.writeFileSync(dest, buf);
  console.log(`ok (fetched) ${path.basename(dest)}  ${(buf.length / 1e6).toFixed(1)} MB`);
}

const ne = sources.naturalEarth;
for (const [name, want] of Object.entries(ne.files)) {
  await fetchVerified(ne.baseUrl + name, path.join(cache, name),
    (buf) => buf.length === want.size && gitBlobSha1(buf) === want.gitBlobSha1);
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
