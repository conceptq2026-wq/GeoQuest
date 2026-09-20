// Proves that the authored maps under docs/maps/ are faithful to the sources
// they were taken from, and that each descriptor only references fields its
// records actually have.
//
// "Proves" rather than "asserts": every check re-reads the source of truth and
// compares, so the files cannot drift from what they were extracted from
// without this failing and naming the record and the key.
//
//   straits       checked against the built map's data.js
//   border-lines  checked against data-sources/border-lines/*.seed.json
//
// Run:  node tools/verify-descriptor.mjs   (from the repo root or from tools/)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ---- where things are -------------------------------------------------------
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..');
// Every authored map lives under here, one folder per map id.
const MAPS_DIR = path.join(ROOT, 'docs/maps');
// Data every map gets whether it declares it or not.
const SHARED_DIR = path.join(ROOT, 'docs/shared');

/*
 * BASELINE RECORDS — the shell loads these on every map, so no descriptor
 * declares them and every descriptor may still reference them. Their fields
 * are stated here because there is no declaration to read them from.
 */
const BASELINE_TABLES = {
  seas: {
    file: path.join(SHARED_DIR, 'seas.json'),
    fields: { nameBn: { type: 'text', required: true }, at: { type: 'point', required: true } },
  },
};
// The built straits map this extraction is checked against. Change here if it moves.
const BUILT_STRAITS = path.join(ROOT, 'docs/international/straits');
// The border-lines build output the records were taken from.
const BORDER_SEEDS = path.join(ROOT, 'data-sources/border-lines');

let failures = 0;
const fail = (msg) => {
  console.log(`FAIL ${msg}`);
  failures++;
};
const ok = (msg) => console.log(`ok   ${msg}`);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

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

/** Compare two keyed tables key for key, in order, reporting every difference. */
function compareTables({ source, file, label, ignore = [] }) {
  const srcKeys = Object.keys(source);
  const fileKeys = Object.keys(file);
  check(
    srcKeys.length === fileKeys.length && srcKeys.every((k, i) => k === fileKeys[i]),
    `${label} has all ${srcKeys.length} records in author order`,
  );
  let bad = 0;
  for (const key of srcKeys) {
    const want = { ...source[key] };
    const got = { ...file[key] };
    for (const f of ignore) {
      delete want[f];
      delete got[f];
    }
    const diffs = diffValue(want, got, key);
    for (const d of diffs) fail(`${label}: ${d}`);
    if (diffs.length) bad++;
  }
  check(bad === 0, `every record in ${label} is deep-equal to its source (${srcKeys.length} records)`);
}

// ---- ["get", x] harvesting --------------------------------------------------
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

/*
|--------------------------------------------------------------------------
| THE GENERIC CHECKS — everything that reads only a descriptor and its own
| records, so they apply to any map authored against the vocabulary.
|--------------------------------------------------------------------------
*/
function checkMap({ id, expectedPending }) {
  const dir = path.join(MAPS_DIR, id);
  const descriptor = readJson(path.join(dir, 'descriptor.json'));
  const tables = {};
  // Baseline first, so a descriptor that tries to redeclare one collides.
  const declarations = {};
  for (const [name, baseline] of Object.entries(BASELINE_TABLES)) {
    tables[name] = readJson(baseline.file);
    declarations[name] = { fields: baseline.fields };
  }
  for (const [name, decl] of Object.entries(descriptor.records)) {
    if (name in BASELINE_TABLES) fail(`${id}: declares records table "${name}", which the shell provides`);
    tables[name] = readJson(path.join(dir, path.basename(decl.file)));
    declarations[name] = decl;
  }
  // The table the sheet and the picker read.
  const primary = descriptor.controls.find((c) => c.type === 'picker')?.from;

  // ---- null versus absent, per field, with counts ---------------------------
  console.log('\n---- null versus absent ----');
  for (const [table, decl] of Object.entries(declarations)) {
    const keys = Object.keys(tables[table]);
    for (const f of Object.keys(decl.fields)) {
      let value = 0;
      let nul = 0;
      let absent = 0;
      for (const key of keys) {
        if (!(f in tables[table][key])) absent++;
        else if (tables[table][key][f] === null) nul++;
        else value++;
      }
      ok(`${table}.${f}: value ${value}, null ${nul}, absent ${absent}`);
    }
  }

  // ---- references resolve ---------------------------------------------------
  console.log('\n---- references ----');
  for (const [table, decl] of Object.entries(declarations)) {
    for (const [f, fd] of Object.entries(decl.fields)) {
      if (fd.type !== 'refs') continue;
      const target = tables[fd.to];
      const unresolved = new Set();
      let total = 0;
      for (const key of Object.keys(tables[table])) {
        for (const ref of tables[table][key][f] ?? []) {
          total++;
          if (!(ref in target)) unresolved.add(ref);
        }
      }
      // A gap is allowed only where the descriptor names it, so a NEW dangling
      // reference still fails instead of hiding behind a known one.
      const known = new Set(fd.knownUnresolved ?? []);
      const surprises = [...unresolved].filter((r) => !known.has(r));
      check(
        surprises.length === 0,
        `every ${table}.${f} reference resolves in "${fd.to}" (${total} references)${surprises.length ? ` — ${surprises.join(', ')}` : ''}`,
      );
      const stale = [...known].filter((r) => !unresolved.has(r));
      check(
        stale.length === 0,
        `every declared knownUnresolved value is still unresolved${stale.length ? ` — ${stale.join(', ')} now resolves; drop it` : ''}`,
      );
      if (unresolved.size) console.log(`     KNOWN GAP: ${table}.${f} references ${[...unresolved].join(', ')}, which "${fd.to}" has no record for`);
    }
  }

  // Geometry joined to records, checked in BOTH directions against the
  // descriptor's own statement of which records carry geometry in this source.
  // Without expectGeometry a record with no trace looks like a broken join;
  // with it, having no geometry becomes a declared fact that is verified too —
  // which is what lets one record have geometry in one source and none in
  // another without a special case anywhere.
  for (const [name, spec] of Object.entries(descriptor.sources)) {
    if (!spec.records || !spec.geometry) continue;
    const table = tables[spec.records];
    const fc = readJson(path.join(dir, path.basename(spec.geometry)));
    const present = new Set(fc.features.map((f) => f.properties?.[spec.joinField]));
    const carries = (key) =>
      !spec.expectGeometry || Object.entries(spec.expectGeometry).every(([f, v]) => table[key][f] === v);
    const expected = Object.keys(table).filter(carries);
    const notExpected = Object.keys(table).filter((k) => !carries(k));

    const missing = expected.filter((k) => !present.has(k));
    check(
      missing.length === 0,
      `source "${name}": every record that should carry geometry has some (${expected.length} of ${Object.keys(table).length} records, ${fc.features.length} features)${missing.length ? ` — missing ${missing.join(', ')}` : ''}`,
    );
    const unexpected = notExpected.filter((k) => present.has(k));
    check(
      unexpected.length === 0,
      `source "${name}": no record carries geometry it is declared not to have (${notExpected.length} declared without)${unexpected.length ? ` — ${unexpected.join(', ')}` : ''}`,
    );
    const orphans = [...present].filter((v) => !(v in table));
    check(orphans.length === 0, `source "${name}": no geometry without a record${orphans.length ? ` — ${orphans.join(', ')}` : ''}`);
  }

  // ---- the descriptor only references fields the records have ---------------
  console.log('\n---- descriptor field references ----');
  const referenced = {};
  const note = (table, f) => {
    if (!table || !f) return;
    (referenced[table] ??= new Set()).add(f);
  };

  let badGeometryFrom = 0;
  for (const [name, spec] of Object.entries(descriptor.sources)) {
    // A source that takes its geometry from a record field references that
    // field, and it is checked against ITS OWN table.
    if (spec.geometryFrom) {
      const decl = declarations[spec.records];
      if (!decl || !(spec.geometryFrom in decl.fields)) {
        fail(`source "${name}": geometryFrom "${spec.geometryFrom}" is not a field on records "${spec.records}"`);
        badGeometryFrom++;
      }
      note(spec.records, spec.geometryFrom);
    }
    for (const p of spec.properties ?? []) note(spec.records, p);
    for (const f of spec.state ?? []) {
      if (typeof f === 'string') continue;
      note(f.fromSelection?.records, f.fromSelection?.listField);
    }
    for (const f of Object.keys(spec.expectGeometry ?? {})) note(spec.records, f);
  }
  check(badGeometryFrom === 0, "every source's geometryFrom is a declared field on its own records table");

  note(primary, descriptor.sheet.kicker.of);
  // compose holds ordered templates; the fields are the {tokens} inside them.
  for (const template of descriptor.sheet.title.compose ?? [])
    for (const m of String(template).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) note(primary, m[1]);
  for (const row of descriptor.sheet.rows) note(primary, row.field ?? row.of);
  for (const c of descriptor.controls) {
    if (c.type !== 'picker') continue;
    note(c.from, c.labelField);
    // `label` takes the same field/lookup/compose spec the sheet uses.
    note(c.from, c.label?.field ?? c.label?.of);
    for (const template of c.label?.compose ?? [])
      for (const m of String(template).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) note(c.from, m[1]);
    note(c.from, c.groupBy?.field);
    for (const a of c.do ?? []) note(c.from, a.field);
  }
  for (const i of descriptor.interactions) {
    const source = descriptor.sources[String(i.target).replace(/^source:/, '')];
    for (const a of i.do ?? []) note(source?.records, a.field);
  }
  // appliesWhen makes one field depend on another; that is a reference too.
  for (const [table, decl] of Object.entries(declarations))
    for (const fd of Object.values(decl.fields)) for (const f of Object.keys(fd.appliesWhen ?? {})) note(table, f);

  let unknownRef = 0;
  let refCount = 0;
  for (const [table, fields] of Object.entries(referenced)) {
    const decls = declarations[table]?.fields ?? {};
    for (const f of fields) {
      refCount++;
      if (!(f in decls)) {
        fail(`descriptor references ${table}.${f}, which no field declares`);
        unknownRef++;
      }
    }
  }
  check(unknownRef === 0, `every field the descriptor references is declared (${refCount} fields)`);

  // A referenced field must actually exist on the records that should carry it.
  let missingOnRecord = 0;
  for (const [table, fields] of Object.entries(referenced)) {
    const decls = declarations[table]?.fields ?? {};
    for (const f of fields) {
      if (!decls[f]?.required) continue;
      for (const key of Object.keys(tables[table])) {
        if (!(f in tables[table][key])) {
          fail(`${table}.${key}: required field "${f}" is missing`);
          missingOnRecord++;
        }
      }
    }
  }
  check(missingOnRecord === 0, 'every required referenced field is present on every record');

  // ---- every ["get", x] in a layer resolves to a property its source carries
  // This is the check that would have caught the labels rendering empty: the
  // descriptor declared layers reading "nameBn" while no source put it on a
  // feature, and nothing said so until the map was drawn.
  console.log('\n---- layer property references ----');
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
      const fc = readJson(path.join(dir, path.basename(spec.geometry)));
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

  // ---- required fields are never null ---------------------------------------
  console.log('\n---- required fields ----');
  let nullRequired = 0;
  let requiredCount = 0;
  for (const [table, decl] of Object.entries(declarations)) {
    for (const [f, fd] of Object.entries(decl.fields)) {
      if (!fd.required) continue;
      requiredCount++;
      for (const key of Object.keys(tables[table])) {
        if (tables[table][key][f] === null) {
          fail(`${table}.${key}.${f} is null but the descriptor marks it required`);
          nullRequired++;
        }
      }
    }
  }
  check(nullRequired === 0, `no required field is null (${requiredCount} required fields)`);

  // Only a verifiable field may be null.
  let nullNotVerifiable = 0;
  for (const [table, decl] of Object.entries(declarations)) {
    for (const key of Object.keys(tables[table])) {
      for (const [f, v] of Object.entries(tables[table][key])) {
        if (v === null && !decl.fields[f]?.verifiable) {
          fail(`${table}.${key}.${f} is null but the descriptor does not mark it verifiable`);
          nullNotVerifiable++;
        }
      }
    }
  }
  check(nullNotVerifiable === 0, 'null appears only on fields declared verifiable');

  // ---- enum values used by records exist in their lookup --------------------
  console.log('\n---- lookups ----');
  let badEnum = 0;
  for (const [table, decl] of Object.entries(declarations)) {
    for (const [f, fd] of Object.entries(decl.fields)) {
      if (fd.type !== 'enum') continue;
      const lookup = descriptor.lookups[fd.lookup];
      if (!lookup) {
        fail(`${table}.${f} declares lookup "${fd.lookup}", which the descriptor does not define`);
        badEnum++;
        continue;
      }
      for (const key of Object.keys(tables[table])) {
        const v = tables[table][key][f];
        if (v != null && !(v in lookup)) {
          fail(`${table}.${key}.${f} = "${v}" is not in lookup "${fd.lookup}"`);
          badEnum++;
        }
      }
    }
  }
  check(badEnum === 0, 'every enum value used by a record exists in its lookup table');
  // The picker and the sheet kicker may read DIFFERENT lookups: a map can
  // group by one property and caption by another, which border-lines does —
  // it groups by kind and captions by status. What must hold is that each
  // lookup exists and that the picker's order covers its own lookup
  // completely, so no record lands in a group the picker never renders.
  const picker = descriptor.controls.find((c) => c.type === 'picker');
  check(
    Boolean(picker.labelField || picker.label),
    'the picker says how to label a record, by labelField or by label',
  );
  for (const [what, name] of [
    ['picker groupBy', picker.groupBy.lookup],
    ['sheet kicker', descriptor.sheet.kicker.lookup],
  ]) {
    check(name in descriptor.lookups, `${what} reads lookup "${name}", which the descriptor defines`);
  }
  const groupLookup = descriptor.lookups[picker.groupBy.lookup] ?? {};
  check(
    picker.groupBy.order.every((k) => k in groupLookup),
    `every group in the picker's order exists in "${picker.groupBy.lookup}"`,
  );
  const ungrouped = Object.keys(groupLookup).filter((k) => !picker.groupBy.order.includes(k));
  check(
    ungrouped.length === 0,
    `the picker's order covers every value in "${picker.groupBy.lookup}"${ungrouped.length ? ` — ${ungrouped.join(', ')} would never be shown` : ''}`,
  );

  // ---- fields the descriptor never references -------------------------------
  console.log('\n---- unreferenced record fields (not an error) ----');
  let any = false;
  for (const [table, decl] of Object.entries(declarations)) {
    for (const f of Object.keys(decl.fields)) {
      if (referenced[table]?.has(f)) continue;
      any = true;
      console.log(`     ${table}.${f}${decl.fields[f].display === false ? '  (declared display:false)' : ''}`);
    }
  }
  if (!any) console.log('     (none)');

  // ---- THE PENDING LIST -----------------------------------------------------
  console.log('\n---- PENDING: values that exist but are unverified ----');
  const pending = {};
  for (const [table, rows] of Object.entries(tables)) {
    for (const [key, row] of Object.entries(rows)) {
      for (const [f, v] of Object.entries(row)) {
        if (v === null) (pending[`${table}.${f}`] ??= []).push(key);
      }
    }
  }
  let pendingTotal = 0;
  for (const [f, keys] of Object.entries(pending)) {
    console.log(`     ${f} (${keys.length}):`);
    keys.forEach((k) => console.log(`       ${k}`));
    pendingTotal += keys.length;
  }
  console.log(`\n     total pending: ${pendingTotal}`);
  if (pendingTotal !== expectedPending) {
    fail(`pending count is ${pendingTotal}, expected ${expectedPending} — reporting, not adjusting the expectation`);
  } else {
    ok(`pending count is ${pendingTotal}, as expected`);
  }
}

/*
|--------------------------------------------------------------------------
| STRAITS — faithful to the built map's data.js
|--------------------------------------------------------------------------
*/
console.log('\n============ straits ============');
{
  const dir = path.join(MAPS_DIR, 'straits');
  const { PASSAGES, SEAS } = await import(pathToFileURL(path.join(BUILT_STRAITS, 'data.js')).href);

  console.log('\n---- records.json against data.js ----');
  compareTables({ source: PASSAGES, file: readJson(path.join(dir, 'records.json')), label: 'records.json' });

  // Shared now, not the straits map's: the shell labels these seas on every
  // map. Still checked against data.js, because that is where they came from.
  console.log('\n---- shared/seas.json against data.js ----');
  const seas = readJson(path.join(SHARED_DIR, 'seas.json'));
  compareTables({ source: SEAS, file: seas, label: 'shared/seas.json' });

  const byName = {};
  for (const [k, v] of Object.entries(seas)) (byName[v.nameBn] ??= []).push(k);
  const shared = Object.entries(byName).filter(([, ks]) => ks.length > 1);
  ok(`${shared.length} nameBn values are shared by more than one sea key — identity is the key, not the name`);
  for (const [name, ks] of shared) console.log(`       ${name}: ${ks.join(', ')}`);

  checkMap({ id: 'straits', expectedPending: 20 });
}

/*
|--------------------------------------------------------------------------
| BORDER LINES — faithful to the build's seed files
|--------------------------------------------------------------------------
*/
console.log('\n\n============ border-lines ============');
{
  const dir = path.join(MAPS_DIR, 'border-lines');

  // Fields the seed carries that are deliberately not record fields:
  //   id      — the key is the identity, as in straits
  //   review  — build-time notes about undecided spellings, not display content
  //   sectors — the verbatim originals behind the Radcliffe merge; the
  //             vocabulary has no term for a nested record
  //   geometrySource — build input only: it is what gives bdPov its
  //             definition, and nothing on a student's device reads it
  // and one record field the seed does not carry:
  //   countriesBn — composed for approval, so it is null until approved
  const NOT_RECORD_FIELDS = ['id', 'review', 'sectors', 'geometrySource', 'sources', 'countriesBn'];

  console.log('\n---- records.json against lines.seed.json ----');
  compareTables({
    source: readJson(path.join(BORDER_SEEDS, 'lines.seed.json')),
    file: readJson(path.join(dir, 'records.json')),
    label: 'records.json',
    ignore: NOT_RECORD_FIELDS,
  });

  console.log('\n---- countries.json against countries.seed.json ----');
  compareTables({
    source: readJson(path.join(BORDER_SEEDS, 'countries.seed.json')),
    file: readJson(path.join(dir, 'countries.json')),
    label: 'countries.json',
    ignore: ['id'],
  });

  // The geometry files are copies of the build output; prove they are copies.
  for (const f of ['lines.geojson', 'countries.geojson']) {
    const same = fs.readFileSync(path.join(BORDER_SEEDS, f), 'utf8') === fs.readFileSync(path.join(dir, f), 'utf8');
    check(same, `${f} is byte-identical to the build output in data-sources/border-lines/`);
  }

  // 33: 12 countriesBn and 6 nameBn awaiting approval, 8 noteBn (two notes
  // falsified by a line gaining geometry plus six lines with no note yet),
  // 6 establishedBn with no year in any source here, and tordesillas.labelAt,
  // which has nowhere to sit until its longitude is settled.
  checkMap({ id: 'border-lines', expectedPending: 61 });
}

// ---- done -------------------------------------------------------------------
if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
