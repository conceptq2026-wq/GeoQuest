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
//   org-headquarters  checked against data-sources/org-headquarters/*.seed.json
//                     and data-sources/tech-headquarters/companies.seed.json
//   deserts, lakes, forests, mountains, waterfalls
//                 checked against data-sources/<map>/<map>.seed.json
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
    // atByBasemap: an optional better place for the label on one basemap, keyed by basemap name.
    fields: { nameBn: { type: 'text', required: true }, at: { type: 'point', required: true }, atByBasemap: { type: 'anchors' } },
  },
};
// The built straits map this extraction is checked against. Change here if it moves.
const BUILT_STRAITS = path.join(ROOT, 'docs/international/straits');
// The border-lines build output the records were taken from.
const BORDER_SEEDS = path.join(ROOT, 'data-sources/border-lines');
// The org-headquarters seed, approved content, and the cities derived from it.
const ORG_SEEDS = path.join(ROOT, 'data-sources/org-headquarters');
// The technology companies on the same map, and the picker group they form.
const TECH_SEED = path.join(ROOT, 'data-sources/tech-headquarters/companies.seed.json');
// The Geography seeds, one folder per map, and each map's expected pending
// count: deserts 2 (Nubian and Sinai areas, no source found).
const GEO_SEEDS = path.join(ROOT, 'data-sources');
const GEOGRAPHY = { deserts: 2, lakes: 0, forests: 0, mountains: 0, waterfalls: 0 };
const TECH_CATEGORY = 'প্রযুক্তি প্রতিষ্ঠান';

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

  // A value spec — field | lookup | compose, or a bare template — names
  // fields on the table it is read against.
  const noteSpec = (table, spec) => {
    if (spec === undefined || spec === null) return;
    const templates = typeof spec === 'string' ? [spec] : spec.compose ?? [];
    // compose holds ordered templates; the fields are the {tokens} inside them.
    for (const template of templates)
      for (const m of String(template).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) note(table, m[1]);
    if (typeof spec === 'object') note(table, spec.field ?? spec.of);
  };

  // `sheet` is the card for the picker's table; `sheets` is one card per
  // records table, for a map where more than one table can be selected.
  const sheets = descriptor.sheets ? Object.entries(descriptor.sheets) : [[primary, descriptor.sheet]];
  // A photo value carries both files and the whole credit; the card cannot
  // show one without the other, so a photo missing any part fails here.
  const isPhotoField = (table, f) => declarations[table]?.fields?.[f]?.type === 'photo';
  // A CC BY or CC BY-SA credit links its licence; public domain has none to link.
  const CREDIT = ['author', 'licence', 'page'];
  const FREE = /^(Public domain|CC0( 1\.0)?|CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0))$/;
  for (const [table, decl] of Object.entries(declarations)) {
    for (const [f, fd] of Object.entries(decl.fields)) {
      if (fd.type !== 'photo') continue;
      let bad = 0;
      let n = 0;
      for (const [key, row] of Object.entries(tables[table])) {
        const p = row[f];
        if (p === undefined || p === null) continue;
        n++;
        const missing = [...CREDIT, 'marker', 'card', ...(/^CC BY/.test(p.licence ?? '') ? ['licenceUrl'] : [])].filter((k) => !p[k]);
        const files = ['marker', 'card'].filter((k) => p[k] && !fs.existsSync(path.join(dir, p[k])));
        if (missing.length || files.length || !FREE.test(p.licence ?? '')) {
          fail(`${table}.${key}.${f}: ${[...missing.map((m) => `no ${m}`), ...files.map((k) => `${k} file ${p[k]} missing`), FREE.test(p.licence ?? '') ? null : `licence "${p.licence}" not free`].filter(Boolean).join(', ')}`);
          bad++;
        }
      }
      check(bad === 0, `${table}.${f}: every photo has both files, a free licence and its full credit (${n})`);
    }
  }
  for (const [name, spec] of Object.entries(descriptor.sources)) {
    if (!spec.photoMarker) continue;
    note(spec.records, spec.photoMarker.field);
    check(Boolean(spec.geometryFrom), `source "${name}": its photoMarker sits on a point taken from a record field`);
    check(isPhotoField(spec.records, spec.photoMarker.field), `source "${name}": photoMarker.field ${spec.records}.${spec.photoMarker.field} is a photo field`);
    check(
      descriptor.interactions.some((i) => i.on === 'click' && i.target === `source:${name}`),
      `source "${name}": a tap on its photo marker has a click interaction to run`,
    );
  }

  for (const [table, sheet] of sheets) {
    if (!declarations[table]) fail(`sheets: "${table}" is not a declared records table`);
    if (sheet.photo) {
      note(table, sheet.photo.field);
      check(isPhotoField(table, sheet.photo.field), `sheet "${table}": photo.field ${sheet.photo.field} is a photo field`);
    }
    noteSpec(table, sheet.kicker);
    noteSpec(table, sheet.title);
    noteSpec(table, sheet.subtitle);
    for (const row of sheet.rows ?? []) {
      if (!row.referencedBy) {
        noteSpec(table, row);
        continue;
      }
      // The reverse of a refs field: the named field must BE a refs field,
      // pointing at this sheet's table, or the list could never fill.
      const { records: from, listField } = row.referencedBy;
      const decl = declarations[from]?.fields?.[listField];
      check(
        decl?.type === 'refs' && decl.to === table,
        `sheet "${table}": referencedBy ${from}.${listField} is a refs field pointing at "${table}"`,
      );
      check(Array.isArray(row.do) && row.do.length > 0, `sheet "${table}": the referencedBy row says what a tap does`);
      note(from, listField);
      noteSpec(from, row.item);
      for (const a of row.do ?? []) note(from, a.field);
    }
  }
  // Every table a student can select has a card to show.
  if (descriptor.sheets) {
    const selectable = new Set([primary]);
    for (const i of descriptor.interactions) selectable.add(descriptor.sources[String(i.target).replace(/^source:/, '')]?.records);
    for (const [, sheet] of sheets) for (const row of sheet.rows ?? []) if (row.referencedBy) selectable.add(row.referencedBy.records);
    const cardless = [...selectable].filter((t) => t && !descriptor.sheets[t]);
    check(cardless.length === 0, `every selectable table has a sheet${cardless.length ? ` — none for ${cardless.join(', ')}` : ''}`);
  }
  // The pulsing marker is one marker; each source that asks for it must say
  // where its records sit, and no table may ask twice.
  const markerTables = Object.values(descriptor.sources).filter((s) => s.selectionMarker).map((s) => s.records);
  check(
    Object.values(descriptor.sources).filter((s) => s.selectionMarker).every((s) => s.geometryFrom),
    'every selectionMarker source takes its point from a record field',
  );
  check(new Set(markerTables).size === markerTables.length, `no records table has two selectionMarker sources (${markerTables.join(', ') || 'none'})`);
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
    ['picker groupBy', picker.groupBy?.lookup],
    ...sheets.map(([table, sheet]) => [`sheet "${table}" kicker`, sheet.kicker?.lookup]),
  ]) {
    if (name === undefined) continue;
    check(name in descriptor.lookups, `${what} reads lookup "${name}", which the descriptor defines`);
  }
  // Grouping is optional: a map with few records lists them flat.
  if (picker.groupBy) {
    // A group is a lookup key, or — with no lookup — the field's value itself,
    // shown as it stands. Either way the order must name every group that
    // occurs, or a record lands in a group the picker never renders.
    const groupValues = picker.groupBy.lookup
      ? Object.keys(descriptor.lookups[picker.groupBy.lookup] ?? {})
      : [...new Set(Object.values(tables[primary]).map((r) => r[picker.groupBy.field]))];
    const groupSource = picker.groupBy.lookup ? `"${picker.groupBy.lookup}"` : `${primary}.${picker.groupBy.field}`;
    check(
      picker.groupBy.order.every((k) => groupValues.includes(k)),
      `every group in the picker's order exists in ${groupSource}`,
    );
    const ungrouped = groupValues.filter((k) => !picker.groupBy.order.includes(k));
    check(
      ungrouped.length === 0,
      `the picker's order covers every value in ${groupSource}${ungrouped.length ? ` — ${ungrouped.join(', ')} would never be shown` : ''}`,
    );
  }

  // ---- record filter ----------------------------------------------------------
  // Its values, order and labels are the picker's groups on the same field, so
  // it must filter the picker's table by the field the picker groups on.
  for (const c of descriptor.controls.filter((x) => x.type === 'recordFilter')) {
    note(c.records, c.field);
    check(
      picker.from === c.records && picker.groupBy?.field === c.field,
      `recordFilter "${c.id}" filters ${c.records}.${c.field}, the field the picker groups on`,
    );
    check(Boolean(c.label && c.allLabel), `recordFilter "${c.id}" has its button label and its select-all label`);
    check(
      !descriptor.controls.some((x) => x.type === 'layerToggle'),
      `recordFilter "${c.id}" is not beside a layerToggle — they share one corner`,
    );
  }

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
  // data.js knows one place per sea; the per-basemap anchors are the shared table's own.
  compareTables({ source: SEAS, file: seas, label: 'shared/seas.json', ignore: ['atByBasemap'] });

  // A per-basemap anchor names a basemap that exists, sits inside the frame a
  // map on that basemap opens on — so the name is on screen — and sits on
  // open water well clear of every coast, so it reads as the sea's.
  const { FRAME: BANGLADESH_FRAME } = await import(pathToFileURL(path.join(HERE, 'bangladesh.config.mjs')).href);
  const FRAMES = { bangladesh: BANGLADESH_FRAME };
  const LAND = { bangladesh: readJson(path.join(HERE, 'sources/osm-bangladesh-land.geojson')).features.filter((f) => f.properties.set === 'overview') };
  const inRing = ([x, y], ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  const nearestLandKm = (land, [px, py]) => {
    const k = Math.cos((py * Math.PI) / 180);
    let best = Infinity;
    for (const f of land)
      for (const poly of polysOf(f.geometry))
        for (const r of poly)
          for (let i = 1; i < r.length; i++) {
            const [ax, ay] = r[i - 1];
            const [bx, by] = r[i];
            const dx = (bx - ax) * k;
            const dy = by - ay;
            const t = Math.max(0, Math.min(1, ((px - ax) * k * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
            best = Math.min(best, Math.hypot((px - ax) * k - t * dx, py - ay - t * dy) * 111.32);
          }
    return best;
  };
  let anchors = 0;
  for (const [key, row] of Object.entries(seas))
    for (const [basemap, at] of Object.entries(row.atByBasemap ?? {})) {
      anchors++;
      const [w, s, e, n] = FRAMES[basemap] ?? [];
      check(fs.existsSync(path.join(SHARED_DIR, 'tiles', `${basemap}.pmtiles`)) && FRAMES[basemap], `seas.${key}: its ${basemap} anchor names a basemap with a frame`);
      check(at[0] >= w && at[0] <= e && at[1] >= s && at[1] <= n, `seas.${key}: its ${basemap} anchor ${at.join(', ')} lies inside that basemap's frame`);
      const onLand = LAND[basemap].some((f) => polysOf(f.geometry).some((poly) => inRing(at, poly[0]) && !poly.slice(1).some((h) => inRing(at, h))));
      const clear = nearestLandKm(LAND[basemap], at);
      check(!onLand && clear >= 50, `seas.${key}: its ${basemap} anchor is on open water, ${clear.toFixed(0)} km from the nearest coast`);
    }
  ok(`${anchors} per-basemap sea anchor(s) checked`);

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
  checkMap({ id: 'border-lines', expectedPending: 49 });
}

/*
|--------------------------------------------------------------------------
| ORG HEADQUARTERS — faithful to the two approved seeds
|--------------------------------------------------------------------------
*/
console.log('\n\n============ org-headquarters ============');
{
  const dir = path.join(MAPS_DIR, 'org-headquarters');
  // The map's one table is the organisations, then the companies, each in its
  // own seed's order; a company gets its picker group from the build.
  const orgSeed = readJson(path.join(ORG_SEEDS, 'organisations.seed.json'));
  const techSeed = readJson(TECH_SEED);
  const seed = { ...orgSeed };
  for (const [id, r] of Object.entries(techSeed)) seed[id] = { ...r, category: TECH_CATEGORY };
  const clash = Object.keys(techSeed).filter((k) => k in orgSeed);
  check(clash.length === 0, `no record key is in both seeds${clash.length ? ` — ${clash.join(', ')}` : ''}`);
  // A company's `country` repeats its countryBn and is not shipped.
  const drift = Object.keys(techSeed).filter((k) => techSeed[k].country !== techSeed[k].countryBn);
  check(drift.length === 0, `every company's unshipped country equals its countryBn${drift.length ? ` — ${drift.join(', ')}` : ''}`);
  const citySeed = readJson(path.join(ORG_SEEDS, 'cities.seed.json'));
  const orgs = readJson(path.join(dir, 'records.json'));
  const cities = readJson(path.join(dir, 'cities.json'));
  const countries = readJson(path.join(dir, 'countries.json'));

  // Every seed field ships exactly as approved, except the seed's identity
  // and provenance. The four joins the build adds are checked below instead.
  console.log('\n---- records.json against both seeds ----');
  const DERIVED = ['cities', 'countries', 'at', 'frame', 'regionBn'];
  compareTables({ source: seed, file: orgs, label: 'records.json', ignore: ['id', 'sources', 'review', 'country', ...DERIVED] });

  // The marker table is the seed's towns that are in no hub, plus the hubs,
  // each where its first town would have been.
  const hubSeed = readJson(path.join(ORG_SEEDS, 'hubs.seed.json'));
  const expectedMarkers = {};
  for (const [key, c] of Object.entries(citySeed)) {
    if (c.geometrySource === 'generated') continue;
    const place = c.hub ?? key;
    if (!(place in expectedMarkers)) expectedMarkers[place] = citySeed[place];
  }
  console.log('\n---- cities.json against cities.seed.json ----');
  compareTables({ source: expectedMarkers, file: cities, label: 'cities.json', ignore: ['geometrySource', 'sources', 'members'] });

  // Provenance: every record is editor-verified or cited, and the six that
  // were under review — three organisations, three companies — are cited now.
  const unsourced = Object.keys(seed).filter((k) => !seed[k].sources);
  check(unsourced.length === 0, `every record's city is editor-verified or cited${unsourced.length ? ` — not: ${unsourced.join(', ')}` : ''}`);
  const inReview = Object.keys(seed).filter((k) => 'review' in seed[k]);
  check(inReview.length === 0, `no record is still under review${inReview.length ? ` — ${inReview.join(', ')}` : ''}`);
  const cited = Object.keys(seed).filter((k) => Array.isArray(seed[k].sources?.cityBn));
  ok(`${cited.length} record(s) cited from the body's own statement: ${cited.join(', ')}`);

  // One town per (cityEn, iso3), each named once, each placed by one source.
  const towns = Object.fromEntries(Object.entries(citySeed).filter(([, c]) => c.geometrySource !== 'generated'));
  const townOf = (r) => Object.keys(towns).find((k) => towns[k].nameEn === r.cityEn && towns[k].iso3 === r.iso3);
  const wantTowns = new Set(Object.values(seed).map((r) => `${r.cityEn}|${r.iso3}`));
  check(wantTowns.size === Object.keys(towns).length, `one town per distinct (cityEn, iso3) in the seeds (${wantTowns.size})`);
  let badJoin = 0;
  for (const [id, r] of Object.entries(seed)) {
    const town = townOf(r);
    const place = town && (towns[town].hub ?? town);
    const o = orgs[id];
    const hub = town && towns[town].hub ? hubSeed[towns[town].hub] : null;
    const good =
      town &&
      towns[town].nameBn === r.cityBn &&
      towns[town].countryBn === r.countryBn &&
      (hub ? o.regionBn === hub.nameBn : !('regionBn' in o)) &&
      JSON.stringify(o.cities) === JSON.stringify([place]) &&
      JSON.stringify(o.countries) === JSON.stringify([r.iso3]) &&
      JSON.stringify(o.at) === JSON.stringify(cities[place].at) &&
      JSON.stringify(o.frame) === JSON.stringify(cities[place].frame);
    if (!good) {
      fail(`${id}: its town, hub, country, point or frame does not match`);
      badJoin++;
    }
  }
  check(badJoin === 0, `every record joins to its own town, and to its hub's marker where it has one (${Object.keys(seed).length})`);
  const bySource = {};
  for (const [key, c] of Object.entries(towns)) {
    (bySource[c.geometrySource] ??= []).push(key);
    if (!['naturalEarth', 'osm'].includes(c.geometrySource) || c.sources?.at?.length !== 1) fail(`${key}: not exactly one point source`);
  }
  // Pinned: which source placed each town is displayed-position-bearing.
  check(
    bySource.naturalEarth?.length === 65 && bySource.osm?.length === 16,
    `town points: Natural Earth ${bySource.naturalEarth?.length}, OSM ${bySource.osm?.length} (pinned 65 / 16)`,
  );

  // Each hub is exactly the towns its seed names, and its point is theirs.
  for (const [hubKey, h] of Object.entries(hubSeed)) {
    const members = Object.keys(towns).filter((k) => towns[k].hub === hubKey);
    const named = h.towns.map((t) => townOf({ cityEn: t.split('|')[0], iso3: t.split('|')[1] }));
    check(
      members.length === h.towns.length && named.every((k) => members.includes(k)),
      `hub "${hubKey}": exactly the ${h.towns.length} towns its seed names`,
    );
    const mean = (i) => Number((members.reduce((a, k) => a + towns[k].at[i], 0) / members.length).toFixed(5));
    const c = cities[hubKey];
    check(
      c && c.nameBn === h.nameBn && JSON.stringify(c.at) === JSON.stringify([mean(0), mean(1)]),
      `hub "${hubKey}": one marker named "${h.nameBn}", at the mean of its towns`,
    );
    const listed = Object.keys(orgs).filter((k) => orgs[k].cities.includes(hubKey));
    ok(`hub "${hubKey}": its card lists ${listed.length} — ${listed.join(', ')}`);
  }

  // A host country's Bengali name is the seed's, never Natural Earth's.
  const countryBn = new Map(Object.values(seed).map((r) => [r.iso3, r.countryBn]));
  const wrongName = Object.keys(countries).filter((k) => countries[k].nameBn !== countryBn.get(k));
  check(wrongName.length === 0, `every host country is named as the seed names it (${Object.keys(countries).length})${wrongName.length ? ` — ${wrongName.join(', ')}` : ''}`);

  checkMap({ id: 'org-headquarters', expectedPending: 0 });
}

/*
|--------------------------------------------------------------------------
| GEOGRAPHY — five maps, each faithful to its own seed
|--------------------------------------------------------------------------
*/
for (const [map, expectedPending] of Object.entries(GEOGRAPHY)) {
  console.log(`\n\n============ ${map} ============`);
  const dir = path.join(MAPS_DIR, map);
  const seed = readJson(path.join(GEO_SEEDS, map, `${map}.seed.json`));
  const recs = readJson(path.join(dir, 'records.json'));
  console.log(`\n---- records.json against ${map}.seed.json ----`);
  // Content fields ship as the seed has them; identity, provenance and the
  // build's inputs stay behind; what the build derives is checked below.
  compareTables({ source: seed, file: recs, label: 'records.json', ignore: ['id', 'sources', 'review', 'geometry', 'photo', 'labelAt', 'hasArea', 'frame'] });
  let badPhoto = 0;
  let badArea = 0;
  for (const [id, r] of Object.entries(seed)) {
    const p = recs[id].photo;
    const [W, H] = r.photo?.size ?? [];
    const wasCropped = r.photo && Object.values(r.photo.crop).some(([x, y, w, h]) => x || y || w !== W || h !== H);
    const want = r.photo && {
      marker: `photos/${id}-marker.webp`, card: `photos/${id}-card.webp`, author: r.photo.author, licence: r.photo.licence,
      ...(r.photo.licenceUrl ? { licenceUrl: r.photo.licenceUrl } : {}), page: r.photo.page, ...(wasCropped ? { cropped: true } : {}),
    };
    if (JSON.stringify(p) !== JSON.stringify(want)) {
      fail(`${map}/${id}: the shipped photo credit is not the seed's`);
      badPhoto++;
    }
    if (recs[id].hasArea !== Boolean(r.geometry?.area)) {
      fail(`${map}/${id}: hasArea ${recs[id].hasArea}, but the seed ${r.geometry?.area ? 'names' : 'names no'} area`);
      badArea++;
    }
  }
  check(badPhoto === 0, `every shipped photo carries the seed's own credit, "cropped" where it was (${Object.values(recs).filter((r) => r.photo).length})`);
  check(badArea === 0, `every record draws an area exactly when its seed names one (${Object.values(recs).filter((r) => r.hasArea).length} areas)`);
  const withheld = Object.keys(seed).filter((id) => seed[id].geometry?.withheld);
  if (withheld.length) ok(`areas withheld, with their reason in the seed: ${withheld.join(', ')}`);
  checkMap({ id: map, expectedPending });
}

// ---- done -------------------------------------------------------------------
if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
