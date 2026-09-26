// One-off: makes each record's photo files from its Wikimedia Commons
// original, as the seed describes it, and writes them into the map's served
// folder. The build reads the committed WebP files and never Commons, so a
// rebuild cannot change silently when a Commons file is replaced.
//
// Re-run only on purpose (a new record, a new crop), then look at the output.
//
//   node tools/extract-commons-photos.mjs <map> [record ...]
//
// Needs ffmpeg with libwebp on the PATH. The shipped files are crops of the
// original and are shared under its licence, which the seed records and the
// card shows.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Per map: its seed, and the folder its photos are served from. Change here if either moves.
const MAPS = {
  ...Object.fromEntries(
    ['deserts', 'lakes', 'forests', 'mountains', 'waterfalls'].map((m) => [m, { seed: path.join(ROOT, `data-sources/${m}/${m}.seed.json`), out: path.join(ROOT, `docs/maps/${m}/photos`) }]),
  ),
  // The janapada seed is the editor's and is never written; the photos found
  // for it live in a seed of their own, keyed by record like the others.
  'ancient-janapadas': { seed: path.join(ROOT, 'data-sources/ancient-janapadas/photos.seed.json'), out: path.join(ROOT, 'docs/maps/ancient-janapadas/photos') },
};
// Originals wider than this are fetched as Commons' own rendition at this
// width — the shipped files are 640 px at most — and the crop boxes, which
// the seed gives in the original's pixels, are scaled to it. It must be one
// of Wikimedia's standard thumbnail widths; others are refused.
const FETCH_WIDTH = 1280;
// Originals are cached here, by their Commons SHA-1, so a re-run reuses them.
const CACHE = path.join(HERE, '.cache', 'commons');
// The two files every photo ships as: a square for the marker, a 16:10 band for the card.
export const PHOTO_SIZES = { marker: [128, 128], card: [640, 400] };
const QUALITY = { marker: 82, card: 78 };
// A busy picture — a satellite scene — encodes large; quality steps down until
// the file fits a phone's data budget, never below the floor.
const MAX_BYTES = { marker: 8 * 1024, card: 40 * 1024 };
const QUALITY_FLOOR = 12;
// Wikimedia asks a tool to name itself and a way to reach its maintainers.
const UA = 'GeoQuest-map-build/1.0 (https://github.com/conceptq2026-wq/GeoQuest)';

const [map, ...onlyIds] = process.argv.slice(2);
if (!MAPS[map]) throw new Error(`usage: node tools/extract-commons-photos.mjs <${Object.keys(MAPS).join('|')}>`);
const { seed: seedFile, out } = MAPS[map];
const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Commons answers a burst with "too many requests"; a pause clears it.
async function politeFetch(url, what) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) throw new Error(`${what}: HTTP ${res.status}`);
    await sleep(attempt * 15_000);
  }
  throw new Error(`${what}: still refused after six tries`);
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

for (const [id, rec] of Object.entries(seed)) {
  const photo = rec.photo;
  if (!photo || (onlyIds.length && !onlyIds.includes(id))) continue;
  const scaled = photo.size[0] > FETCH_WIDTH;
  const cached = path.join(CACHE, scaled ? `${photo.sha1}-${FETCH_WIDTH}` : photo.sha1);
  if (!fs.existsSync(cached) || (!scaled && sha1(fs.readFileSync(cached)) !== photo.sha1)) {
    // Ask Commons where the file is, and refuse it unless it is the very file
    // the seed was written against. An original is checked byte for byte; a
    // rendition is checked through the file it was rendered from.
    const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Csha1&iiurlwidth=${FETCH_WIDTH}&titles=${encodeURIComponent(photo.commonsFile)}`;
    const info = Object.values((await (await politeFetch(api, `${id} file info`)).json()).query.pages)[0].imageinfo[0];
    if (info.sha1 !== photo.sha1) throw new Error(`${id}: Commons now serves a different file (sha1 ${info.sha1}, seed has ${photo.sha1})`);
    const res = await politeFetch(scaled ? info.thumburl : info.url, `${id} image`);
    if (!/^image\//.test(res.headers.get('content-type') ?? '')) throw new Error(`${id}: Commons answered ${res.status} ${res.headers.get('content-type')} — not an image`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!scaled && sha1(buf) !== photo.sha1) throw new Error(`${id}: downloaded bytes do not match sha1 ${photo.sha1}`);
    fs.writeFileSync(cached, buf);
    await sleep(1500);
  }
  const k = scaled ? FETCH_WIDTH / photo.size[0] : 1;
  for (const [kind, [w, h]] of Object.entries(PHOTO_SIZES)) {
    const [cx, cy, cw, ch] = photo.crop[kind].map((n) => Math.floor(n * k));
    const [ow, oh] = photo.crop[kind].slice(2);
    if (Math.abs(ow / oh - w / h) > 0.01) throw new Error(`${id}: ${kind} crop is ${ow}x${oh}, not the ${w}:${h} shape it ships at`);
    const [ox, oy] = photo.crop[kind];
    if (ox < 0 || oy < 0 || ox + ow > photo.size[0] || oy + oh > photo.size[1]) throw new Error(`${id}: ${kind} crop leaves the image`);
    const file = path.join(out, `${id}-${kind}.webp`);
    let bytes;
    for (let q = QUALITY[kind]; ; q -= 6) {
      execFileSync('ffmpeg', [
        '-v', 'error', '-y', '-i', cached,
        '-vf', `crop=${cw}:${ch}:${cx}:${cy},scale=${w}:${h}:flags=lanczos`,
        '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', String(q), '-compression_level', '6',
        file,
      ]);
      bytes = fs.readFileSync(file);
      if (bytes.length <= MAX_BYTES[kind] || q - 6 < QUALITY_FLOOR) break;
    }
    console.log(`  ${path.relative(ROOT, file).replace(/\\/g, '/')}  ${w}x${h}  ${(bytes.length / 1024).toFixed(1)} KB  sha256 ${sha256(bytes).slice(0, 16)}…`);
  }
}
