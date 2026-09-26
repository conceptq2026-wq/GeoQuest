// One-off: takes the few RESOLVE Ecoregions 2017 polygons the Geography maps
// use out of the 150 MB release, simplified, into
// tools/sources/resolve-extract.geojson. The build reads that committed file
// and never the release, so a rebuild cannot change silently.
//
// Re-run only on purpose, then review the diff and update the checksum in
// sources.json. Needs the release zip, which is pinned in sources.json and
// fetched here if it is not cached.
//
// RESOLVE Ecoregions 2017, © RESOLVE, CC BY 4.0 — the extract stays under it,
// and every map that draws one of these credits it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mapshaper from 'mapshaper';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Where the release is cached, and where the extract goes. Change here if either moves.
const CACHE = path.join(HERE, '.cache');
const OUT = path.join(ROOT, 'tools', 'sources', 'resolve-extract.geojson');
const pin = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8')).resolveEcoregions;

/*
 * What is taken, per record: an ecoregion matched by its exact name, or a
 * biome matched by its exact name and merged into one shape. Nothing is
 * matched loosely, and nothing is drawn.
 */
// The Sahara is several ecoregions: the eight RESOLVE names "Sahara" or
// "Saharan", and the Tibesti–Jebel Uweinat montane xeric woodlands, which
// Wikipedia (revision 1333931716) calls "an ecoregion in the eastern Sahara".
export const SAHARA = [
  'East Sahara Desert',
  'West Sahara desert',
  'South Sahara desert',
  'Saharan Atlantic coastal desert',
  'East Saharan montane xeric woodlands',
  'West Saharan montane xeric woodlands',
  'North Saharan Xeric Steppe and Woodland',
  'Saharan halophytics',
  'Tibesti-Jebel Uweinat montane xeric woodlands',
];

export const TAKE = {
  sahara: { where: `[${SAHARA.map((n) => `'${n}'`).join(',')}].includes(ECO_NAME)`, dissolve: true, simplifyMetres: 3000, expect: SAHARA.length },
  sundarbans: { where: "ECO_NAME == 'Sundarbans mangroves'", simplifyMetres: 300 },
  taiga: { where: "BIOME_NAME == 'Boreal Forests/Taiga'", dissolve: true, simplifyMetres: 8000 },
};

const zip = path.join(CACHE, pin.file);
if (!fs.existsSync(zip)) {
  const buf = Buffer.from(await (await fetch(pin.url)).arrayBuffer());
  fs.writeFileSync(zip, buf);
}
const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
if (sha !== pin.sha256) throw new Error(`${pin.file}: sha256 ${sha}, pinned ${pin.sha256} — refusing it`);
const shp = path.join(CACHE, 'resolve', 'Ecoregions2017.shp');
if (!fs.existsSync(shp)) throw new Error(`unzip ${pin.file} into ${path.dirname(shp)} first`);

const features = [];
for (const [id, t] of Object.entries(TAKE)) {
  // A list of names must find every one of them, or the union is not the whole.
  if (t.expect) {
    const res = await mapshaper.applyCommands(`-i "${shp.replace(/\\/g, '/')}" -filter "${t.where}" -filter-fields ECO_NAME -o names.json format=json`);
    const found = [...new Set(JSON.parse(res['names.json'].toString()).map((r) => r.ECO_NAME))];
    if (found.length !== t.expect) throw new Error(`${id}: ${found.length} of ${t.expect} named ecoregions found — ${found.join(', ')}`);
  }
  const cmd = [
    `-i "${shp.replace(/\\/g, '/')}"`,
    `-filter "${t.where}"`,
    t.dissolve ? '-dissolve' : '',
    `-each "id='${id}'" -filter-fields id`,
    `-simplify dp interval=${t.simplifyMetres} keep-shapes`,
    '-filter-islands min-area=20km2',
    '-o out.json format=geojson geojson-type=FeatureCollection precision=0.001',
  ].join(' ');
  const out = await mapshaper.applyCommands(cmd);
  const fc = JSON.parse(out['out.json'].toString());
  if (fc.features.length !== 1) throw new Error(`${id}: ${fc.features.length} features for ${t.where} — expected exactly one`);
  features.push(fc.features[0]);
  console.log(`  ${id}: ${t.where}${t.dissolve ? ' (merged)' : ''}`);
}

const text = JSON.stringify({ type: 'FeatureCollection', properties: { licence: 'CC BY 4.0 — RESOLVE Ecoregions 2017', source: pin.url }, features }) + '\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text);
console.log(`\nwrote ${path.relative(ROOT, OUT).replace(/\\/g, '/')} — ${(text.length / 1024).toFixed(1)} KB`);
console.log(`sha256: ${crypto.createHash('sha256').update(text).digest('hex')}`);
