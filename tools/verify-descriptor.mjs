// Proves that docs/maps/straits/ is a faithful extraction of the built map's
// data.js, and that the descriptor only references fields the records have.
//
// "Proves" rather than "asserts": every check re-reads data.js and compares,
// so the files cannot drift from the map they were extracted from without this
// failing and naming the record and the key.
//
// Run:  node tools/verify-descriptor.mjs   (from the repo root or from tools/)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ---- where things are -------------------------------------------------------
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// The descriptor and its authored records. Change here if the map moves.
const MAP_DIR = path.join(ROOT, 'docs/maps/straits');
// The built map this extraction is checked against. Change here if it moves.
const BUILT_DIR = path.join(ROOT, 'docs/international/straits');
// TEMPORARY OFFSET: the descriptor names its geometry files as if they sat
// beside it, which is where they will live. They are still in the built map's
// folder because the live page fetches them from there. Resolve both.
const GEOMETRY_DIR = MAP_DIR;

let failures = 0;
const fail = (msg) => {
  console.log(`FAIL ${msg}`);
  failures++;
};
const ok = (msg) => console.log(`ok   ${msg}`);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const descriptor = readJson(path.join(MAP_DIR, 'descriptor.json'));
const records = readJson(path.join(MAP_DIR, 'records.json'));
const seas = readJson(path.join(MAP_DIR, 'seas.json'));
const { PASSAGES, SEAS } = await import(pathToFileURL(path.join(BUILT_DIR, 'data.js')).href);

// ---- deep equality that distinguishes null from absent ----------------------
function diffValue(a, b, trail) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return [`${trail}: array vs non-array`];
    if (a.length !== b.length) return [`${trail}: length ${a.length} vs ${b.length}`];
    return a.flatMap((v, i) => diffValue(v, b[i], `${trail}[${i}]`));
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.flatMap((k) => {
      const inA = k in a;
      const inB = k in b;
      if (inA !== inB) return [`${trail}.${k}: ${inA ? 'present in source, ABSENT in file' : 'ABSENT in source, present in file'}`];
      return diffValue(a[k], b[k], `${trail}.${k}`);
    });
  }
  // null vs undefined must not compare equal — that is the whole distinction.
  if (a === null || b === null) return a === b ? [] : [`${trail}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
  return Object.is(a, b) ? [] : [`${trail}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
}

// ---- 1. records match data.js, in order, key for key ------------------------
console.log('\n---- records.json against data.js ----');
const srcKeys = Object.keys(PASSAGES);
const fileKeys = Object.keys(records);
check(
  srcKeys.length === fileKeys.length && srcKeys.every((k, i) => k === fileKeys[i]),
  `records.json has all ${srcKeys.length} passages in author order`,
);
if (srcKeys.join() !== fileKeys.join()) {
  fail(`  source order: ${srcKeys.join(', ')}`);
  fail(`  file order:   ${fileKeys.join(', ')}`);
}
let recordDiffs = 0;
for (const key of srcKeys) {
  const diffs = diffValue(PASSAGES[key], records[key], key);
  // Per-record key order is what the picker and the card read in; check it too.
  const sk = Object.keys(PASSAGES[key] ?? {});
  const fk = Object.keys(records[key] ?? {});
  if (sk.join() !== fk.join()) diffs.push(`${key}: key order ${sk.join(',')} vs ${fk.join(',')}`);
  if (diffs.length) {
    recordDiffs += diffs.length;
    diffs.forEach((d) => fail(d));
  }
}
check(recordDiffs === 0, `every passage is deep-equal to data.js (${srcKeys.length} records)`);

console.log('\n---- seas.json against data.js ----');
const seaSrcKeys = Object.keys(SEAS);
const seaFileKeys = Object.keys(seas);
check(
  seaSrcKeys.length === seaFileKeys.length && seaSrcKeys.every((k, i) => k === seaFileKeys[i]),
  `seas.json has all ${seaSrcKeys.length} seas in author order`,
);
let seaDiffs = 0;
for (const key of seaSrcKeys) {
  const diffs = diffValue(SEAS[key], seas[key], key);
  if (diffs.length) {
    seaDiffs += diffs.length;
    diffs.forEach((d) => fail(d));
  }
}
check(seaDiffs === 0, `every sea is deep-equal to data.js (${seaSrcKeys.length} records)`);
// Six seas share a nameBn with another at a different position. Identity is the
// key, so a duplicate name must never be treated as a duplicate record.
const byName = {};
for (const [k, s] of Object.entries(seas)) (byName[s.nameBn] ??= []).push(k);
const shared = Object.entries(byName).filter(([, ks]) => ks.length > 1);
ok(`${shared.length} nameBn values are shared by more than one sea key — identity is the key, not the name`);
shared.forEach(([n, ks]) => console.log(`       ${n}: ${ks.join(', ')}`));

// ---- 2. null versus absent, per key, with counts ----------------------------
console.log('\n---- null versus absent ----');
const fieldDecls = descriptor.records.passages.fields;
const tally = {};
for (const f of Object.keys(fieldDecls)) tally[f] = { present: 0, null: 0, absent: 0 };
for (const key of srcKeys) {
  for (const f of Object.keys(fieldDecls)) {
    if (!(f in records[key])) tally[f].absent++;
    else if (records[key][f] === null) tally[f].null++;
    else tally[f].present++;
  }
}
for (const [f, t] of Object.entries(tally)) {
  const srcT = { present: 0, null: 0, absent: 0 };
  for (const key of srcKeys) {
    if (!(f in PASSAGES[key])) srcT.absent++;
    else if (PASSAGES[key][f] === null) srcT.null++;
    else srcT.present++;
  }
  check(
    t.present === srcT.present && t.null === srcT.null && t.absent === srcT.absent,
    `${f}: value ${t.present}, null ${t.null}, absent ${t.absent}`,
  );
}

// ---- 3. references resolve --------------------------------------------------
console.log('\n---- references ----');
let badSeaRefs = 0;
for (const key of srcKeys) {
  for (const ref of records[key].seas ?? []) {
    if (!(ref in seas)) {
      fail(`${key}.seas: "${ref}" is not a key in seas.json`);
      badSeaRefs++;
    }
  }
}
check(badSeaRefs === 0, `every key in every passage's "seas" array resolves (${srcKeys.reduce((n, k) => n + records[k].seas.length, 0)} references)`);

const canalFile = path.join(GEOMETRY_DIR, path.basename(descriptor.sources.canals.geometry));
const canalFc = readJson(canalFile);
const canalJoin = descriptor.sources.canals.joinField;
const canalValues = new Set(canalFc.features.map((f) => f.properties[canalJoin]));
const canalRecords = srcKeys.filter((k) => records[k].kind === 'canal');
let badCanals = 0;
for (const key of canalRecords) {
  if (!canalValues.has(key)) {
    fail(`canal "${key}" has no feature in canals.geojson with ${canalJoin}="${key}"`);
    badCanals++;
  }
}
check(badCanals === 0, `every canal's join key resolves in canals.geojson (${canalRecords.length} canals, ${canalFc.features.length} features)`);
const orphanGeometry = [...canalValues].filter((v) => !(v in records));
check(orphanGeometry.length === 0, `no canal geometry without a record${orphanGeometry.length ? ` — ${orphanGeometry.join(', ')}` : ''}`);

// ---- 4. the descriptor only references fields the records have --------------
console.log('\n---- descriptor field references ----');
const referenced = new Set();
const noteField = (f) => f && referenced.add(f);
// A source that takes its geometry from a record field references that field.
// A source that takes its geometry from a record field is checked against ITS
// OWN table, rather than being lumped in with the passage fields below.
let badGeometryFrom = 0;
for (const [name, spec] of Object.entries(descriptor.sources)) {
  if (!spec.geometryFrom) continue;
  const table = descriptor.records[spec.records];
  if (!table || !(spec.geometryFrom in table.fields)) {
    fail(`source "${name}": geometryFrom "${spec.geometryFrom}" is not a field on records "${spec.records}"`);
    badGeometryFrom++;
  }
}
check(badGeometryFrom === 0, "every source's geometryFrom is a declared field on its own records table");
noteField(descriptor.sheet.kicker.of);
// compose holds ordered templates; the fields are the {tokens} inside them.
for (const template of descriptor.sheet.title.compose ?? [])
  for (const m of String(template).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) noteField(m[1]);
for (const row of descriptor.sheet.rows) noteField(row.field ?? row.of);
for (const c of descriptor.controls) {
  if (c.type !== 'picker') continue;
  noteField(c.labelField);
  noteField(c.groupBy?.field);
  for (const a of c.do ?? []) noteField(a.field);
}
for (const i of descriptor.interactions) for (const a of i.do ?? []) noteField(a.field);
noteField(descriptor.sources.seas.state[0].fromSelection.listField);

let unknownRef = 0;
for (const f of referenced) {
  if (!(f in fieldDecls)) {
    fail(`descriptor references "${f}", which no passage field declares`);
    unknownRef++;
  }
}
check(unknownRef === 0, `every field the descriptor references is declared (${referenced.size} fields)`);

// A referenced field must actually exist on the records that should carry it.
let missingOnRecord = 0;
for (const f of referenced) {
  const decl = fieldDecls[f];
  if (!decl) continue;
  for (const key of srcKeys) {
    const applies = decl.required || !decl.appliesWhen || Object.entries(decl.appliesWhen).every(([k, v]) => records[key][k] === v);
    if (applies && decl.required && !(f in records[key])) {
      fail(`${key}: required field "${f}" is missing`);
      missingOnRecord++;
    }
  }
}
check(missingOnRecord === 0, 'every required referenced field is present on every record');

// ---- 4b. every ["get", x] in a layer resolves to a property its source carries
// This is the check that would have caught the labels rendering empty: the
// descriptor declared layers reading "nameBn" while no source put it on a
// feature, and nothing said so until the map was drawn.
console.log('\n---- layer property references ----');
const CLUSTER_PROPS = ['cluster', 'cluster_id', 'point_count', 'point_count_abbreviated'];
const gets = (node, out = []) => {
  if (Array.isArray(node)) {
    if (node[0] === 'get' && typeof node[1] === 'string') out.push(node[1]);
    for (const child of node) gets(child, out);
  } else if (node && typeof node === 'object') {
    for (const child of Object.values(node)) gets(child, out);
  }
  return out;
};

let badGets = 0;
for (const layer of descriptor.layers) {
  // Layers reading the basemap read tile fields, which live in the archive
  // rather than the descriptor; those are pinned in build-world.mjs instead.
  if (layer.source === 'basemap') continue;
  const spec = descriptor.sources[layer.source];
  if (!spec) {
    fail(`layer "${layer.id}": source "${layer.source}" is not declared`);
    badGets++;
    continue;
  }
  const allowed = new Set();
  if (spec.records) {
    allowed.add('key');
    for (const p of spec.properties ?? []) allowed.add(p);
    for (const f of spec.state ?? []) allowed.add(typeof f === 'string' ? f : f.name);
    if (spec.cluster) for (const p of CLUSTER_PROPS) allowed.add(p);
  } else {
    // Geometry alone: whatever the generated file actually carries.
    const fc = readJson(path.join(GEOMETRY_DIR, path.basename(spec.geometry)));
    for (const f of fc.features) for (const k of Object.keys(f.properties ?? {})) allowed.add(k);
  }
  for (const name of new Set(gets({ f: layer.filter, l: layer.layout, p: layer.paint }))) {
    if (!allowed.has(name)) {
      fail(`layer "${layer.id}" reads ["get","${name}"], which source "${layer.source}" does not carry`);
      badGets++;
    }
  }
}
check(badGets === 0, `every ["get", x] in every layer resolves on its source (${descriptor.layers.length} layers)`);

// ---- 5. required fields are never null --------------------------------------
console.log('\n---- required fields ----');
let nullRequired = 0;
for (const [f, decl] of Object.entries(fieldDecls)) {
  if (!decl.required) continue;
  for (const key of srcKeys) {
    if (records[key][f] === null) {
      fail(`${key}.${f} is null but the descriptor marks it required`);
      nullRequired++;
    }
  }
}
check(nullRequired === 0, `no required field is null (${Object.values(fieldDecls).filter((d) => d.required).length} required fields)`);

// Only a verifiable field may be null.
let nullNotVerifiable = 0;
for (const key of srcKeys) {
  for (const [f, v] of Object.entries(records[key])) {
    if (v === null && !fieldDecls[f]?.verifiable) {
      fail(`${key}.${f} is null but the descriptor does not mark it verifiable`);
      nullNotVerifiable++;
    }
  }
}
check(nullNotVerifiable === 0, 'null appears only on fields declared verifiable');

// ---- 6. enum values used by records exist in their lookup -------------------
console.log('\n---- lookups ----');
let badEnum = 0;
for (const [f, decl] of Object.entries(fieldDecls)) {
  if (decl.type !== 'enum') continue;
  const table = descriptor.lookups[decl.lookup];
  for (const key of srcKeys) {
    const v = records[key][f];
    if (v != null && !(v in table)) {
      fail(`${key}.${f} = "${v}" is not in lookup "${decl.lookup}"`);
      badEnum++;
    }
  }
}
check(badEnum === 0, 'every enum value used by a record exists in its lookup table');
// The kicker and the picker's group labels must read the same table.
const picker = descriptor.controls.find((c) => c.type === 'picker');
check(
  picker.groupBy.lookup === descriptor.sheet.kicker.lookup,
  `picker groups and the sheet kicker read the same lookup ("${picker.groupBy.lookup}")`,
);
check(
  picker.groupBy.order.every((k) => k in descriptor.lookups[picker.groupBy.lookup]),
  `every group in the picker's order exists in "${picker.groupBy.lookup}"`,
);

// ---- 7. fields the descriptor never references ------------------------------
console.log('\n---- unreferenced record fields (not an error) ----');
const unreferenced = Object.keys(fieldDecls).filter((f) => !referenced.has(f));
if (unreferenced.length === 0) console.log('     (none)');
for (const f of unreferenced) {
  const decl = fieldDecls[f];
  console.log(`     ${f}${decl.display === false ? '  (declared display:false)' : ''}`);
}

// ---- 8. THE PENDING LIST ----------------------------------------------------
console.log('\n---- PENDING: values that exist but are unverified ----');
const pending = {};
for (const key of srcKeys) {
  for (const [f, v] of Object.entries(records[key])) {
    if (v === null) (pending[f] ??= []).push(key);
  }
}
let pendingTotal = 0;
for (const [f, keys] of Object.entries(pending)) {
  console.log(`     ${f} (${keys.length}):`);
  keys.forEach((k) => console.log(`       ${k}`));
  pendingTotal += keys.length;
}
console.log(`\n     total pending: ${pendingTotal}`);
const EXPECTED_PENDING = 20;
if (pendingTotal !== EXPECTED_PENDING) {
  fail(`pending count is ${pendingTotal}, expected ${EXPECTED_PENDING} — reporting, not adjusting the expectation`);
} else {
  ok(`pending count is ${pendingTotal}, as expected`);
}

// ---- done -------------------------------------------------------------------
if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
