// Generates docs/registry.json from every descriptor under docs/maps/.
//
// The home index reads this file and nothing else, so adding a map is exactly
// one action — write its descriptor — and it appears. A hand-maintained list
// is a list that eventually disagrees with the maps it lists.
//
// Run:  node tools/build-registry.mjs   (from the repo root or from tools/)
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Every authored map lives under here, one folder per map id. Change here if it moves.
const MAPS_DIR = path.join(ROOT, 'docs/maps');
// The generated file, inside the served tree so the index page can fetch it.
const OUT = path.join(ROOT, 'docs/registry.json');

/*
 * The three BCS Preliminary subject divisions, in syllabus order. This order
 * is the index's order; it is fixed here rather than sorted, because it is a
 * property of the exam and not of the data.
 *
 * GeoQuest's own organisation: the app opens each map directly by URL and
 * never sees these sections.
 */
export const SECTIONS = ['bangladesh', 'international', 'geography'];

const mapIds = fs
  .readdirSync(MAPS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const problems = [];
const entries = [];
for (const id of mapIds) {
  const file = path.join(MAPS_DIR, id, 'descriptor.json');
  if (!fs.existsSync(file)) {
    problems.push(`${id}/ has no descriptor.json`);
    continue;
  }
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (d.id !== id) problems.push(`${id}: descriptor says id "${d.id}", which is not its folder name`);
  if (!SECTIONS.includes(d.section)) problems.push(`${id}: section "${d.section}" is not one of ${SECTIONS.join(', ')}`);
  if (!d.title?.en || !d.title?.bn) problems.push(`${id}: title needs both en and bn`);
  entries.push({ id: d.id, section: d.section, title: { en: d.title?.en, bn: d.title?.bn } });
}

if (problems.length) {
  console.error(`the registry cannot be generated:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// Section order first, then the order the folders were read in, so the file is
// stable across runs and reviewable as a diff.
entries.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || (a.id < b.id ? -1 : 1));

const registry = { generatedBy: 'tools/build-registry.mjs', sections: SECTIONS, maps: entries };
fs.writeFileSync(OUT, JSON.stringify(registry, null, 2) + '\n');

console.log(`wrote docs/registry.json — ${entries.length} map(s)`);
for (const section of SECTIONS) {
  const inSection = entries.filter((e) => e.section === section);
  console.log(`  ${section.padEnd(14)} ${inSection.length ? inSection.map((e) => e.id).join(', ') : '(none yet)'}`);
}
