// One-off: makes each record's photo files from its Wikimedia Commons
// original, as the seed describes it, and writes them into the map's served
// folder. The build reads the committed WebP files and never Commons, so a
// rebuild cannot change silently when a Commons file is replaced.
//
// Re-run only on purpose (a new record, a new crop), then look at the output.
//
//   node tools/extract-commons-photos.mjs deserts
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
  deserts: { seed: path.join(ROOT, 'data-sources/deserts/deserts.seed.json'), out: path.join(ROOT, 'docs/maps/deserts/photos') },
};
// Originals are cached here, by their Commons SHA-1, so a re-run reuses them.
const CACHE = path.join(HERE, '.cache', 'commons');
// The two files every photo ships as: a square for the marker, a 16:10 band for the card.
export const PHOTO_SIZES = { marker: [128, 128], card: [640, 400] };
const QUALITY = { marker: 82, card: 78 };
const UA = 'GeoQuest map build (educational maps)';

const map = process.argv[2];
if (!MAPS[map]) throw new Error(`usage: node tools/extract-commons-photos.mjs <${Object.keys(MAPS).join('|')}>`);
const { seed: seedFile, out } = MAPS[map];
const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

for (const [id, rec] of Object.entries(seed)) {
  const photo = rec.photo;
  if (!photo) continue;
  const cached = path.join(CACHE, `${photo.sha1}.jpg`);
  if (!fs.existsSync(cached) || sha1(fs.readFileSync(cached)) !== photo.sha1) {
    // Ask Commons where the original is, and refuse it unless it is the very
    // file the seed was written against.
    const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Csha1&titles=${encodeURIComponent(photo.commonsFile)}`;
    const info = Object.values((await (await fetch(api, { headers: { 'User-Agent': UA } })).json()).query.pages)[0].imageinfo[0];
    if (info.sha1 !== photo.sha1) throw new Error(`${id}: Commons now serves a different file (sha1 ${info.sha1}, seed has ${photo.sha1})`);
    const buf = Buffer.from(await (await fetch(info.url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    if (sha1(buf) !== photo.sha1) throw new Error(`${id}: downloaded bytes do not match sha1 ${photo.sha1}`);
    fs.writeFileSync(cached, buf);
  }
  for (const [kind, [w, h]] of Object.entries(PHOTO_SIZES)) {
    const [cx, cy, cw, ch] = photo.crop[kind];
    if (Math.abs(cw / ch - w / h) > 0.01) throw new Error(`${id}: ${kind} crop is ${cw}x${ch}, not the ${w}:${h} shape it ships at`);
    if (cx < 0 || cy < 0 || cx + cw > photo.size[0] || cy + ch > photo.size[1]) throw new Error(`${id}: ${kind} crop leaves the image`);
    const file = path.join(out, `${id}-${kind}.webp`);
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-i', cached,
      '-vf', `crop=${cw}:${ch}:${cx}:${cy},scale=${w}:${h}:flags=lanczos`,
      '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', String(QUALITY[kind]), '-compression_level', '6',
      file,
    ]);
    const bytes = fs.readFileSync(file);
    console.log(`  ${path.relative(ROOT, file).replace(/\\/g, '/')}  ${w}x${h}  ${(bytes.length / 1024).toFixed(1)} KB  sha256 ${sha256(bytes).slice(0, 16)}…`);
  }
}
