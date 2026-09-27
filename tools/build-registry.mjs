// Generates docs/registry.json from every descriptor under docs/maps/ and
// docs/diagrams/.
//
// The home index reads this file and nothing else, so adding a map or a
// diagram is exactly one action — write its descriptor — and it appears. A
// hand-maintained list is a list that eventually disagrees with what it lists.
//
// Run:  node tools/build-registry.mjs   (from the repo root or from tools/)
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Every authored map lives under here, one folder per map id. Change here if it moves.
const MAPS_DIR = path.join(ROOT, 'docs/maps');
// Every interactive diagram lives under here, one folder per diagram id, and
// opens in the diagram shell (docs/visual/), not the map shell. The folder
// comes with the first diagram. Change here if it moves.
const DIAGRAMS_DIR = path.join(ROOT, 'docs/diagrams');
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

const folders = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

/*
 * Maps and diagrams share one list, told apart by the folder their descriptor
 * sits in. A diagram's entry says "kind": "diagram", which is how the index
 * knows to open it in the diagram shell; a map's carries no kind, so it is
 * exactly the entry it was before diagrams existed.
 */
const KINDS = [
  { kind: null, prefix: '', ids: folders(MAPS_DIR) },
  { kind: 'diagram', prefix: 'diagrams/', ids: fs.existsSync(DIAGRAMS_DIR) ? folders(DIAGRAMS_DIR) : [] },
];

const problems = [];
const entries = [];
for (const { kind, prefix, ids } of KINDS) {
  for (const id of ids) {
    const name = prefix + id;
    const file = path.join(kind ? DIAGRAMS_DIR : MAPS_DIR, id, 'descriptor.json');
    if (!fs.existsSync(file)) {
      problems.push(`${name}/ has no descriptor.json`);
      continue;
    }
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (d.id !== id) problems.push(`${name}: descriptor says id "${d.id}", which is not its folder name`);
    if (!SECTIONS.includes(d.section)) problems.push(`${name}: section "${d.section}" is not one of ${SECTIONS.join(', ')}`);
    if (!d.title?.en || !d.title?.bn) problems.push(`${name}: title needs both en and bn`);
    entries.push({ id: d.id, ...(kind ? { kind } : {}), section: d.section, title: { en: d.title?.en, bn: d.title?.bn } });
  }
}

// An id names one thing: the index, the app and both shells find a map or a
// diagram by its id alone.
const [maps, diagrams] = KINDS;
for (const id of diagrams.ids.filter((id) => maps.ids.includes(id))) {
  problems.push(`${id}: is both a map and a diagram (docs/maps/${id}/, docs/diagrams/${id}/) — an id is unique across both`);
}

if (problems.length) {
  console.error(`the registry cannot be generated:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// Section order first, then id, so the file is stable across runs and
// reviewable as a diff.
entries.sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || (a.id < b.id ? -1 : 1));

const registry = { generatedBy: 'tools/build-registry.mjs', sections: SECTIONS, maps: entries };
fs.writeFileSync(OUT, JSON.stringify(registry, null, 2) + '\n');

const count = (kind) => entries.filter((e) => (e.kind ?? null) === kind).length;
console.log(`wrote docs/registry.json — ${count(null)} map(s), ${count('diagram')} diagram(s)`);
for (const section of SECTIONS) {
  const inSection = entries.filter((e) => e.section === section);
  console.log(`  ${section.padEnd(14)} ${inSection.length ? inSection.map((e) => (e.kind ? `${e.id} (${e.kind})` : e.id)).join(', ') : '(none yet)'}`);
}
