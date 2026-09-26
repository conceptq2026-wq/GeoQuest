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

/*
 * The other features drawn as ecoregion unions. An ecoregion is included only
 * if its name matches the feature or a cited description places it inside it;
 * the seed of each record carries those citations.
 */
export const UNIONS = {
  // Named "Arabian … desert". Left out: "Red Sea-Arabian Desert shrublands"
  // (Egypt's Eastern Desert, which Egypt calls the Arabian Desert — another
  // feature) and the South/Southwest Arabian woodlands and escarpments.
  arabian: ['Arabian desert', 'Arabian sand desert', 'Arabian-Persian Gulf coastal plain desert', 'North Arabian desert', 'East Arabian fog shrublands and sand desert', 'South Arabian plains and plateau desert'],
  mojave: ['Mojave desert'],
  // "Largely overlaps the Great Basin shrub steppe" (Great Basin Desert,
  // Wikipedia rev. 1369608835). The Great Basin montane forests are forest.
  greatbasin: ['Great Basin shrub steppe'],
  // "Patagonian Desert, also known as the Patagonian Steppe" (Wikipedia rev. 1361380627).
  patagonian: ['Patagonian steppe'],
  // Each placed in the Amazon biome, basin or rainforest by its own Wikipedia
  // article. Tocantins/Pindaré is too, but its article calls it the most
  // developed, most severely deforested part: it would count farmland as forest.
  amazon: [
    'Caqueta moist forests', 'Guianan Highlands moist forests', 'Guianan lowland moist forests', 'Guianan piedmont moist forests',
    'Gurupa várzea', 'Iquitos várzea', 'Japurá-Solimões-Negro moist forests', 'Juruá-Purus moist forests', 'Madeira-Tapajós moist forests',
    'Marajó várzea', 'Monte Alegre várzea', 'Napo moist forests', 'Negro-Branco moist forests', 'Purus-Madeira moist forests', 'Purus várzea',
    'Rio Negro campinarana', 'Solimões-Japurá moist forests', 'Southwest Amazon moist forests', 'Tapajós-Xingu moist forests',
    'Uatumã-Trombetas moist forests', 'Ucayali moist forests', 'Xingu-Tocantins-Araguaia moist forests',
  ],
  // The six ecoregions of the Congolian forests (Congolian rainforests,
  // Wikipedia rev. 1375427369). The forest-savanna mosaics are left out.
  congo: ['Congolian coastal forests', 'Central Congolian lowland forests', 'Eastern Congolian swamp forests', 'Northeast Congolian lowland forests', 'Northwest Congolian lowland forests', 'Western Congolian swamp forests'],
  // Named Borneo. Sundaland heath forests also reach other islands.
  borneo: ['Borneo lowland rain forests', 'Borneo montane rain forests', 'Borneo peat swamp forests', 'Southwest Borneo freshwater swamp forests'],
};
const union = (names, simplifyMetres) => ({ where: `[${names.map((n) => `'${n}'`).join(',')}].includes(ECO_NAME)`, dissolve: true, simplifyMetres, expect: names.length });

export const TAKE = {
  sahara: { where: `[${SAHARA.map((n) => `'${n}'`).join(',')}].includes(ECO_NAME)`, dissolve: true, simplifyMetres: 3000, expect: SAHARA.length },
  arabian: union(UNIONS.arabian, 3000),
  mojave: union(UNIONS.mojave, 1500),
  greatbasin: union(UNIONS.greatbasin, 2000),
  // The steppe ecoregion also takes in the Falkland Islands, beyond the
  // desert's Atlantic bound. Only the parts on the same landmass as its main
  // body are kept: a detached component is left out, never redrawn.
  patagonian: { ...union(UNIONS.patagonian, 2000), mainlandOnly: true },
  amazon: union(UNIONS.amazon, 4000),
  congo: union(UNIONS.congo, 3000),
  borneo: union(UNIONS.borneo, 1500),
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

/*
 * Keep only the parts of a union that lie on the same landmass as its largest
 * part, the landmass taken from Natural Earth's 10m land (pinned in
 * sources.json). A part is kept whole or dropped whole: this selects
 * components, it never cuts one.
 */
const LAND = JSON.parse(fs.readFileSync(path.join(CACHE, 'ne_10m_land.geojson'), 'utf8'));
const inRing = ([x, y], ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const landPolygons = LAND.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
const landmassOf = (pt) => landPolygons.findIndex((poly) => inRing(pt, poly[0]));
async function sameLandmass(id, feature) {
  const out = await mapshaper.applyCommands('-i a.json -explode -each "km2=this.area/1e6" -points inner -o parts.json format=geojson', { 'a.json': { type: 'FeatureCollection', features: [feature] } });
  const points = JSON.parse(out['parts.json'].toString()).features;
  const parts = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  if (points.length !== parts.length) throw new Error(`${id}: ${points.length} inner points for ${parts.length} parts`);
  const largest = points.reduce((a, b, i) => (b.properties.km2 > points[a].properties.km2 ? i : a), 0);
  const home = landmassOf(points[largest].geometry.coordinates);
  if (home < 0) throw new Error(`${id}: its largest part is on no Natural Earth land polygon`);
  const keep = parts.filter((_, i) => landmassOf(points[i].geometry.coordinates) === home);
  const dropped = points.filter((p, i) => landmassOf(p.geometry.coordinates) !== home);
  console.log(`  ${id}: kept ${keep.length} of ${parts.length} parts; dropped ${dropped.length} (${dropped.map((p) => `${Math.round(p.properties.km2)} km² at ${p.geometry.coordinates.map((n) => n.toFixed(1))}`).join('; ')})`);
  return { ...feature, geometry: keep.length === 1 ? { type: 'Polygon', coordinates: keep[0] } : { type: 'MultiPolygon', coordinates: keep } };
}

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
  features.push(t.mainlandOnly ? await sameLandmass(id, fc.features[0]) : fc.features[0]);
  console.log(`  ${id}: ${t.where}${t.dissolve ? ' (merged)' : ''}`);
}

const text = JSON.stringify({ type: 'FeatureCollection', properties: { licence: 'CC BY 4.0 — RESOLVE Ecoregions 2017', source: pin.url }, features }) + '\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text);
console.log(`\nwrote ${path.relative(ROOT, OUT).replace(/\\/g, '/')} — ${(text.length / 1024).toFixed(1)} KB`);
console.log(`sha256: ${crypto.createHash('sha256').update(text).digest('hex')}`);
