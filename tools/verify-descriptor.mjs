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
//   ancient-janapadas  checked against data-sources/ancient-janapadas/
//                      janapadas.seed.json and photos.seed.json
//   environment-treaties  checked against data-sources/environment-treaties/
//                         treaties.seed.json, cities.seed.json and additions.seed.json
//   latitude-longitude  checked against data-sources/latitude-longitude/
//                       latitude-longitude.seed.json, the imagery's pin and credit in
//                       tools/sources.json and the geometry pins
//   atmosphere-layers (a diagram)  checked against data-sources/atmosphere-layers/
//                                  atmosphere.seed.json and the approved art
//   earth-interior (a diagram)  checked against data-sources/earth-interior/
//                               earth-interior.seed.json and the approved master
//   seasons (a diagram)  checked against data-sources/seasons/seasons.seed.json
//                        and the approved paintings
//   bangladesh-rivers (a diagram)  checked against data-sources/bangladesh-rivers/
//                                  bangladesh-rivers.seed.json; its geometry, against the
//                                  pinned sources, by tools/verify.mjs
//
// A map under docs/maps/ or a diagram under docs/diagrams/ with no section
// here fails, by its id: a new one is written into this file with its own
// section, not left unchecked.
//
// Run:  node tools/verify-descriptor.mjs   (from the repo root or from tools/)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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
// The janapada map: the editor's seed, never written, and the photos found for it.
const JANAPADA_SEEDS = path.join(ROOT, 'data-sources/ancient-janapadas');
// The environment-treaties map: the editor's seed, the cities found for it, and
// the values found for its nulls.
const TREATY_SEEDS = path.join(ROOT, 'data-sources/environment-treaties');
// The liberation-war-1971 map: the editor's seed and the traced sectors.
const LIBERATION_SEEDS = path.join(ROOT, 'data-sources/liberation-war-1971');
// Every authored diagram lives under here, one folder per diagram id, and the
// diagram shell that opens them.
const DIAGRAMS_DIR = path.join(ROOT, 'docs/diagrams');
const VISUAL_DIR = path.join(ROOT, 'docs/visual');
// The atmosphere-layers diagram: the editor's seed and the approved art.
const ATMOSPHERE_SEEDS = path.join(ROOT, 'data-sources/atmosphere-layers');
// The earth-interior diagram: the editor's seed and the approved master.
const EARTH_SEEDS = path.join(ROOT, 'data-sources/earth-interior');
// The approved seed's SHA-256: the user's own edits come with the new value, and it is re-pinned then.
const EARTH_SEED_SHA256 = '990b45a50ad3ccf8baffefcfa82a4cb1a4d8e5e2be02665be9b328fbc46a0b43';
// The seasons diagram: the editor's seed, pinned, and the approved paintings.
const SEASONS_SEEDS = path.join(ROOT, 'data-sources/seasons');
const SEASONS_SEED_SHA256 = '59f4b3fee5aa65ea8b616d3c0a9ba9f4bb2b0ada089e764b5fa32509b451efb2';
// The bangladesh-rivers diagram: the editor's seed, pinned. Its geometry is pinned in tools/bangladesh-rivers-pins.json.
const BANGLADESH_RIVERS_SEEDS = path.join(ROOT, 'data-sources/bangladesh-rivers');
const BANGLADESH_RIVERS_SEED_SHA256 = '355c69af65452c8fe39f093c97efd963e5fd0480468a3b7f1b5f4782924346ad';
// The latitude-longitude globe: the editor's seed, the pinned sources (its
// imagery's credit among them) and the geometry pins.
const LATLON_SEED = path.join(ROOT, 'data-sources/latitude-longitude/latitude-longitude.seed.json');
const SOURCES_JSON = path.join(HERE, 'sources.json');
const LATLON_PINS = path.join(HERE, 'latitude-longitude-pins.json');

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
// Every map a section below has checked, for the guard at the end.
const CHECKED = new Set();
function checkMap({ id, expectedPending }) {
  CHECKED.add(id);
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
  // The table the sheet and the picker read — or, on a map with a timeline,
  // which has no picker, the timeline.
  const primary = descriptor.controls.find((c) => c.type === 'picker')?.from ?? descriptor.timeline?.records;

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
    // By zoom: a dot up to zooms.dot, the photo from zooms.photo, full size at
    // zooms.full; a name beside it is offset at the same zooms.
    const z = spec.photoMarker.zooms;
    check(Boolean(z) && [z.dot, z.photo, z.full].every(Number.isFinite) && z.dot < z.photo && z.photo < z.full, `source "${name}": photoMarker.zooms dot ${z?.dot} < photo ${z?.photo} < full ${z?.full}`);
    for (const layer of descriptor.layers.filter((l) => l.source === name && l.layout?.['text-radial-offset'] !== undefined)) {
      const off = layer.layout['text-radial-offset'];
      const stops = Array.isArray(off) && off[0] === 'interpolate' && JSON.stringify(off[2]) === '["zoom"]' ? off.filter((_, i) => i >= 3 && i % 2 === 1) : null;
      check(Boolean(z) && JSON.stringify(stops) === JSON.stringify([z.dot, z.photo, z.full]), `layer "${layer.id}": its names' offset follows the marker, at zooms ${stops ? stops.join(', ') : '(none)'}`);
    }
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
    noteSpec(table, sheet.chip);
    check(!(sheet.kicker && sheet.chip), `sheet "${table}": a chip takes the kicker's line, so a card declares one or the other`);
    noteSpec(table, sheet.title);
    noteSpec(table, sheet.subtitle);
    // `columns`: the rows as cells of a grid; `short` belongs to a cell of one.
    if (sheet.columns !== undefined) check(Number.isInteger(sheet.columns) && sheet.columns >= 1, `sheet "${table}": columns is a whole number of columns (${sheet.columns})`);
    for (const row of sheet.rows ?? []) {
      // `when` keeps a row to the records whose field holds one of its values.
      for (const [field, values] of Object.entries(row.when ?? {})) {
        note(table, field);
        const allowed = Array.isArray(values) ? values : [values];
        const held = new Set(Object.values(tables[table] ?? {}).map((r) => r[field]));
        check(allowed.length > 0 && allowed.every((v) => held.has(v)), `sheet "${table}": a row's when ${field} ∈ [${allowed.join(', ')}] names values its records hold`);
      }
      if (row.short) {
        check(Boolean(sheet.columns), `sheet "${table}": a short form belongs to a cell of a card in columns`);
        noteSpec(table, row.short);
      }
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
  // The picker row is baseline chrome, with one exception, the user's
  // (2026-09-27): a map with a timeline has none — the timeline is its
  // selector. A globe map keeps it, as every other map does (the user's
  // decision, 2026-09-28).
  const selectors = [picker && 'a picker', descriptor.timeline && 'a timeline'].filter(Boolean);
  check(
    selectors.length === 1,
    `${descriptor.timeline ? 'a map with a timeline declares no picker: the timeline is its selector' : 'the map declares its picker, the baseline row'}${selectors.length > 1 ? ` — it declares ${selectors.join(' and ')}` : ''}`,
  );
  if (picker)
    check(
      Boolean(picker.labelField || picker.label),
      'the picker says how to label a record, by labelField or by label',
    );
  for (const [what, name] of [
    ['picker groupBy', picker?.groupBy?.lookup],
    ...sheets.map(([table, sheet]) => [`sheet "${table}" kicker`, sheet.kicker?.lookup]),
  ]) {
    if (name === undefined) continue;
    check(name in descriptor.lookups, `${what} reads lookup "${name}", which the descriptor defines`);
  }
  // Grouping is optional: a map with few records lists them flat.
  if (picker?.groupBy) {
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
      picker?.from === c.records && picker?.groupBy?.field === c.field,
      `recordFilter "${c.id}" filters ${c.records}.${c.field}, the field the picker groups on`,
    );
    check(Boolean(c.label && c.allLabel), `recordFilter "${c.id}" has its button label and its select-all label`);
    check(
      !descriptor.controls.some((x) => x.type === 'layerToggle'),
      `recordFilter "${c.id}" is not beside a layerToggle — they share one corner`,
    );
  }

  // ---- shell modules: tabs and timeline ------------------------------------
  // Each is its own term, loaded only where a descriptor uses it; what it
  // reads is checked here like anything else a descriptor names.
  if (descriptor.tabs) {
    const t = descriptor.tabs;
    note(t.records, t.field);
    noteSpec(t.from, t.label);
    // The picker's prompt and a note on the map, as the active tab's row gives them.
    noteSpec(t.from, t.placeholder);
    noteSpec(t.from, t.note);
    check(Object.keys(t).every((k) => ['records', 'field', 'from', 'label', 'placeholder', 'note'].includes(k)), `tabs declares only records, field, from, label, placeholder and note (${Object.keys(t).join(', ')})`);
    if (t.placeholder) {
      const unprompted = Object.keys(tables[t.from] ?? {}).filter((k) => !tables[t.from][k][t.placeholder.field]);
      check(Boolean(picker) && unprompted.length === 0, `tabs: every tab has its picker prompt (${t.placeholder.field})${unprompted.length ? ` — not ${unprompted.join(', ')}` : ''}`);
    }
    const values = new Set(Object.values(tables[t.records] ?? {}).map((r) => r[t.field]));
    const tabKeys = Object.keys(tables[t.from] ?? {});
    const untabbed = [...values].filter((v) => !tabKeys.includes(v));
    const empty = tabKeys.filter((k) => !values.has(k));
    check(untabbed.length === 0 && empty.length === 0, `tabs: every value of ${t.records}.${t.field} has a tab in "${t.from}", and every tab has records${untabbed.length || empty.length ? ` — untabbed ${untabbed.join(', ') || '-'}, empty ${empty.join(', ') || '-'}` : ''}`);
    check(!descriptor.controls.some((c) => c.type === 'recordFilter'), 'tabs: not beside a recordFilter — both decide what is shown');
  }
  if (descriptor.timeline) {
    const t = descriptor.timeline;
    note(t.records, t.at);
    note(t.records, t.rowBy);
    noteSpec(t.records, t.label);
    noteSpec(t.records, t.rowLabel);
    for (const f of t.state ?? []) if (typeof f !== 'string') note(f.fromSelection?.records, f.fromSelection?.listField);
    for (const a of t.do ?? []) note(t.records, a.field);
    check(!t.span, 'timeline: points only — spans are not built');
    const noYear = Object.keys(tables[t.records] ?? {}).filter((k) => !Number.isInteger(tables[t.records][k][t.at]));
    check(noYear.length === 0, `timeline: every ${t.records} record has a whole year in "${t.at}"${noYear.length ? ` — not ${noYear.join(', ')}` : ''}`);
    // The dots take the markers' colour by reading the same expression, in the
    // two forms the timeline evaluates: a literal, and match on get.
    const reads = (e) => !Array.isArray(e) || (e[0] === 'get' && e.length === 2) || (e[0] === 'match' && reads(e[1]) && e.slice(2).every((x, i, all) => (i % 2 === 0 && i < all.length - 1) || reads(x)));
    const colour = t.colour ? descriptor.styles?.[t.colour.style]?.paint?.[t.colour.paint] : '#0b3d91';
    check(colour !== undefined && reads(colour), `timeline: its colour is style "${t.colour?.style}" paint "${t.colour?.paint}", in a form it reads`);
    check(Array.isArray(t.do) && t.do.length > 0, 'timeline: says what a tap does');
  }

  // ---- language ---------------------------------------------------------------
  // Every map is in Bengali but one: environment-treaties is in English, by the
  // user's decision (2026-09-27). An English map shows no Bengali field — its
  // cards, tab titles, timeline labels and map text all read English fields.
  const language = descriptor.language ?? 'bn';
  check(['bn', 'en'].includes(language), `the map's language is bn or en (${language})`);
  if (language === 'en') {
    const fieldsOf = (spec) => {
      if (spec === undefined || spec === null) return [];
      if (typeof spec === 'string') return [...spec.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]);
      return [spec.field, spec.of, ...(spec.compose ?? []).flatMap((t) => [...String(t).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]))].filter(Boolean);
    };
    const shown = [];
    for (const [table, sheet] of sheets) {
      for (const spec of [sheet.kicker, sheet.chip, sheet.title, sheet.subtitle]) for (const f of fieldsOf(spec)) shown.push(`${table}.${f}`);
      for (const row of sheet.rows ?? []) {
        if (row.referencedBy) for (const f of fieldsOf(row.item)) shown.push(`${row.referencedBy.records}.${f}`);
        else for (const f of [...fieldsOf(row), ...fieldsOf(row.short)]) shown.push(`${table}.${f}`);
      }
    }
    if (descriptor.tabs) for (const f of fieldsOf(descriptor.tabs.label)) shown.push(`${descriptor.tabs.from}.${f}`);
    if (descriptor.timeline) for (const f of [...fieldsOf(descriptor.timeline.label), ...fieldsOf(descriptor.timeline.rowLabel)]) shown.push(`${descriptor.timeline.records}.${f}`);
    for (const layer of descriptor.layers ?? []) {
      const text = JSON.stringify(layer.layout?.['text-field'] ?? null);
      for (const m of text.matchAll(/\["get","([^"]+)"\]/g)) shown.push(`${descriptor.sources[layer.source]?.records ?? layer.source}.${m[1]}`);
    }
    const bengali = [...new Set(shown)].filter((f) => /Bn$/.test(f));
    check(bengali.length === 0, `an English map shows no Bengali field (${new Set(shown).size} fields shown)${bengali.length ? ` — not ${bengali.join(', ')}` : ''}`);
  }

  // ---- images -----------------------------------------------------------------
  // `images`: pictures symbol layers draw by name through icon-image, each an
  // SVG in the map's folder with its own width and height, drawn at
  // `pixelRatio`. Every icon-image a layer names is declared, and every
  // declared image is drawn by some layer.
  const images = descriptor.images ?? {};
  const named = new Set();
  for (const layer of descriptor.layers ?? []) {
    const icon = layer.layout?.['icon-image'];
    if (icon === undefined) continue;
    check(typeof icon === 'string' && icon in images, `layer "${layer.id}": icon-image "${icon}" names a declared image`);
    named.add(icon);
  }
  for (const [name, img] of Object.entries(images)) {
    const file = path.join(dir, path.basename(img.file ?? ''));
    const svg = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    check(/\.svg$/.test(img.file ?? '') && /<svg[^>]*\swidth="\d+(\.\d+)?"[^>]*\sheight="\d+(\.\d+)?"/.test(svg) && (img.pixelRatio === undefined || img.pixelRatio > 0), `image "${name}": ${img.file} is an SVG in the map's folder with its own width and height${img.pixelRatio ? `, drawn at pixelRatio ${img.pixelRatio}` : ''}`);
    check(named.has(name), `image "${name}" is drawn by a layer`);
  }

  // ---- credits the shell adds to ⓘ ------------------------------------------
  // `attribution.extra`: whole credits, each a link that opens outside the
  // WebView, as every credit in ⓘ does.
  const CREDIT_LINK = /^<a href="https:\/\/[^"<>]+" target="_blank" rel="noopener noreferrer">[^<>]+<\/a>$/;
  const extra = descriptor.attribution?.extra ?? [];
  if (descriptor.attribution) {
    check(Object.keys(descriptor.attribution).every((k) => k === 'extra') && Array.isArray(extra), 'attribution declares only extra, a list');
    check(extra.every((c) => CREDIT_LINK.test(c)), `every extra credit is a link that opens outside the WebView (${extra.length})`);
  }

  // ---- a globe ----------------------------------------------------------------
  // `globe` draws the map on a globe, by the shell's globe module: its size and
  // the record it opens on; each line's name at the globe's edge; the latitude
  // and longitude beside some places; the antipode button; and its imagery, a
  // raster archive in the map's own folder faded out over the vector
  // basemap, whose own credit must be in ⓘ. Its selector is the picker row,
  // as on every map, and its table is the picker's.
  if (descriptor.globe) {
    console.log('\n---- globe ----');
    const g = descriptor.globe;
    const TERMS = ['size', 'open', 'imagery', 'edgeLabels', 'coordinates', 'antipode'];
    check(Object.keys(g).every((k) => TERMS.includes(k)), `globe declares only ${TERMS.join(', ')} (${Object.keys(g).join(', ')})`);
    check(['size', 'open', 'edgeLabels'].every((k) => k in g), "globe declares its size, the record it opens on and its lines' names");
    check(!descriptor.timeline && !descriptor.tabs, 'a globe map has no timeline and no tabs');
    check(typeof g.size === 'number' && g.size > 0 && g.size <= 1, `globe.size ${g.size} is a share of the map's shorter side`);
    const table = picker?.from;
    const rowsOf = tables[table] ?? {};
    check(Boolean(declarations[table]), `the globe's table is the picker's, "${table}", a records table`);
    check(g.open?.record in rowsOf, `globe.open.record "${g.open?.record}" is a record of "${table}"`);
    // Each line's name at the edge: a source of the picker's table with geometry
    // of its own, and a colour in a form the module reads — a literal, get, or
    // match on get, as the timeline reads one.
    const e = g.edgeLabels ?? {};
    check(Object.keys(e).every((k) => ['source', 'text', 'colour'].includes(k)), 'globe.edgeLabels declares only source, text and colour');
    const edgeSource = descriptor.sources[e.source];
    check(Boolean(edgeSource?.geometry) && edgeSource.records === table, `globe.edgeLabels.source "${e.source}" is a source of "${table}" with a geometry file`);
    noteSpec(table, e.text);
    const readsColour = (x) => !Array.isArray(x) || (x[0] === 'get' && x.length === 2) || (x[0] === 'match' && readsColour(x[1]) && x.slice(2).every((y, i, all) => (i % 2 === 0 && i < all.length - 1) || readsColour(y)));
    const colour = descriptor.styles?.[e.colour?.style]?.paint?.[e.colour?.paint];
    check(colour !== undefined && readsColour(colour), `globe.edgeLabels.colour is style "${e.colour?.style}" paint "${e.colour?.paint}", in a form the module reads`);
    // Latitude and longitude beside a place: a point field, lines the place
    // has every one of, and a zoom within the map's.
    if (g.coordinates) {
      const c = g.coordinates;
      check(Object.keys(c).every((k) => ['at', 'lines', 'minZoom'].includes(k)), 'globe.coordinates declares only at, lines and minZoom');
      check(declarations[table]?.fields?.[c.at]?.type === 'point', `globe.coordinates.at "${c.at}" is a point field of "${table}"`);
      note(table, c.at);
      for (const line of c.lines ?? []) noteSpec(table, line);
      const { minZoom = 0, maxZoom = 22 } = descriptor.constraints ?? {};
      check(Number.isFinite(c.minZoom) && c.minZoom >= minZoom && c.minZoom <= maxZoom, `globe.coordinates.minZoom ${c.minZoom} lies within the map's zooms (${minZoom}–${maxZoom})`);
      const places = Object.entries(rowsOf).filter(([, r]) => r[c.at]);
      const half = places.filter(([, r]) => !(c.lines ?? []).every((l) => typeof r[l.field] === 'string' && r[l.field].length > 0));
      check(Array.isArray(c.lines) && c.lines.length > 0 && c.lines.every((l) => l.field) && half.length === 0, `every place with ${c.at} has every line of its callout (${places.length} places)${half.length ? ` — not: ${half.map(([k]) => k).join(', ')}` : ''}`);
    }
    // The antipode button: two records of the table, the button's words on
    // each card, and the time the turn takes.
    if (g.antipode) {
      const a = g.antipode;
      const [x, y] = a.between ?? [];
      check(Object.keys(a).every((k) => ['between', 'labels', 'duration'].includes(k)), 'globe.antipode declares only between, labels and duration');
      check(Array.isArray(a.between) && a.between.length === 2 && x !== y && x in rowsOf && y in rowsOf, `globe.antipode.between names two records of "${table}" (${(a.between ?? []).join(', ')})`);
      check(Object.keys(a.labels ?? {}).sort().join() === [x, y].sort().join() && [x, y].every((k) => typeof a.labels[k] === 'string' && a.labels[k].trim().length > 0), "globe.antipode.labels gives the button's words on each of the two cards");
      check(Number.isFinite(a.duration) && a.duration > 0, `globe.antipode.duration ${a.duration} ms`);
    }
    if (g.imagery) {
      const img = g.imagery;
      check(Object.keys(img).every((k) => ['file', 'fadeOut'].includes(k)), `globe.imagery declares only file and fadeOut (${Object.keys(img).join(', ')})`);
      const file = path.join(dir, String(img.file ?? '').replace(/^\.\//, ''));
      const exists = /^\.\/[a-z0-9-]+\.pmtiles$/.test(img.file ?? '') && fs.existsSync(file);
      check(exists, `globe.imagery.file ${img.file} is a PMTiles archive in the map's folder`);
      const [from, to] = img.fadeOut ?? [];
      const { minZoom = 0, maxZoom = 22 } = descriptor.constraints ?? {};
      check(Number.isFinite(from) && Number.isFinite(to) && minZoom <= from && from < to && to <= maxZoom, `globe.imagery.fadeOut ${from}–${to} is a rising pair within the map's zooms (${minZoom}–${maxZoom})`);
      if (exists) {
        const buf = fs.readFileSync(file);
        const u64 = (at) => Number(buf.readBigUInt64LE(at));
        const TILE_TYPES = { 2: 'png', 3: 'jpeg', 4: 'webp' };
        check(buf.toString('ascii', 0, 7) === 'PMTiles' && buf[7] === 3 && buf[99] in TILE_TYPES, `the imagery is PMTiles v3 of raster tiles (${TILE_TYPES[buf[99]] ?? `tile type ${buf[99]}`}, z${buf[100]}–${buf[101]})`);
        check(buf[100] === 0 && buf[101] <= from, `the imagery starts at z0 and stops by the fade (z${buf[101]} ≤ ${from})`);
        const meta = JSON.parse(zlib.gunzipSync(buf.subarray(u64(24), u64(24) + u64(32))).toString('utf8'));
        const credited = extra.some((c) => CREDIT_LINK.test(c) && c.replace(/<[^>]+>/g, '') === meta.attribution);
        check(Boolean(meta.attribution) && credited, `the imagery's own credit, "${meta.attribution}", is in ⓘ as a link`);
      }
    }
  }

  // `flyTo` is the globe module's action: only a globe map may run one.
  const actions = [
    ...(descriptor.interactions ?? []).flatMap((i) => i.do ?? []),
    ...(descriptor.controls ?? []).flatMap((c) => c.do ?? []),
    ...(descriptor.timeline?.do ?? []),
    ...sheets.flatMap(([, sheet]) => (sheet?.rows ?? []).flatMap((r) => r.do ?? [])),
  ];
  const flights = actions.filter((a) => a.action === 'flyTo').length;
  check(!flights || Boolean(descriptor.globe), `flyTo runs only on a globe map, whose module provides it (${flights})`);

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

/*
|--------------------------------------------------------------------------
| ANCIENT JANAPADAS — faithful to the editor's seed, of which it ships a sample
|--------------------------------------------------------------------------
*/
console.log('\n\n============ ancient-janapadas ============');
{
  const dir = path.join(MAPS_DIR, 'ancient-janapadas');
  const seed = readJson(path.join(JANAPADA_SEEDS, 'janapadas.seed.json'));
  const photoSeed = readJson(path.join(JANAPADA_SEEDS, 'photos.seed.json'));
  const recs = readJson(path.join(dir, 'records.json'));
  // The build ships the records under review; the rest are built, not shipped.
  const order = Object.keys(seed).sort((a, b) => seed[a].order - seed[b].order);
  const shipped = Object.keys(recs);
  check(
    shipped.every((k) => k in seed) && shipped.every((k, i) => i === 0 || order.indexOf(k) > order.indexOf(shipped[i - 1])),
    `records.json ships ${shipped.length} of the seed's ${order.length} records, in the seed's order (${shipped.join(', ')})`,
  );
  console.log('\n---- records.json against janapadas.seed.json ----');
  compareTables({
    source: Object.fromEntries(shipped.map((k) => [k, seed[k]])),
    file: recs,
    label: 'records.json',
    ignore: ['id', 'order', 'sources', 'review', 'geometry', 'photo', 'photoSite', 'labelAt', 'frame', 'siteAt'],
  });
  // null in the seed wants a photo: the photo seed's, with its own credit, or
  // still null — absent where the photo seed records that there can be none.
  // Absent in the seed stays absent.
  let badPhoto = 0;
  for (const k of shipped) {
    const p = photoSeed[k]?.photo;
    const wasCropped = p && Object.values(p.crop).some(([x, y, w, h]) => x || y || w !== p.size[0] || h !== p.size[1]);
    const want = !('photo' in seed[k]) || photoSeed[k]?.absent
      ? undefined
      : p
        ? { marker: `photos/${k}-marker.webp`, card: `photos/${k}-card.webp`, author: p.author, licence: p.licence, ...(p.licenceUrl ? { licenceUrl: p.licenceUrl } : {}), page: p.page, ...(wasCropped ? { cropped: true } : {}) }
        : seed[k].photo;
    if (JSON.stringify(recs[k].photo) !== JSON.stringify(want)) {
      fail(`ancient-janapadas/${k}: the shipped photo is not the one the photo seed credits`);
      badPhoto++;
    }
  }
  check(badPhoto === 0, `every shipped photo is the photo seed's, with its credit, "cropped" where it was (${shipped.filter((k) => recs[k].photo).length})`);
  // A photo's marker stands on the site the photo shows — the photo seed's
  // point, from the site's Wikidata item, cited there, or where that point is
  // wrong from its Wikipedia article, cited to the revision — and only a record
  // with a photo has one.
  const citesPoint = (site, c) => c.states && (
    (site.pointFrom ?? 'wikidata') === 'wikidata'
      ? new URL(c.url).host === 'www.wikidata.org' && c.url.includes(site.wikidata)
      : site.pointFrom === 'wikipedia' && new URL(c.url).host.endsWith('.wikipedia.org') && /[?&]oldid=\d+/.test(c.url));
  const badSite = shipped.filter((k) => {
    const site = photoSeed[k]?.site;
    const want = recs[k].photo ? site?.at.map((n) => Number(n.toFixed(5))) : undefined;
    const cited = !recs[k].photo || (photoSeed[k]?.sources?.siteAt ?? []).some((c) => citesPoint(site, c));
    return JSON.stringify(recs[k].siteAt) !== JSON.stringify(want) || !cited;
  });
  const byWikipedia = shipped.filter((k) => recs[k].siteAt && photoSeed[k].site.pointFrom === 'wikipedia');
  check(badSite.length === 0, `every record with a photo has its site's point from the photo seed, cited (${shipped.filter((k) => recs[k].siteAt).length}; from its Wikipedia article: ${byWikipedia.join(', ') || 'none'}), and no other record has one${badSite.length ? ` — not: ${badSite.join(', ')}` : ''}`);
  const strays = Object.keys(photoSeed).filter((k) => seed[k]?.photo !== null);
  check(strays.length === 0, `the photo seed holds photos only for records whose seed photo is null${strays.length ? ` — not: ${strays.join(', ')}` : ''}`);
  const absent = Object.keys(photoSeed).filter((k) => photoSeed[k].absent);
  check(absent.every((k) => photoSeed[k].absent.reason && !('photo' in recs[k])), `a photo the photo seed makes absent ships absent, with its reason in the seed (${absent.join(', ') || 'none'})`);
  // Nothing is pending: every photo the seed wants is found, or the photo seed
  // records why there can be none (tamralipta).
  checkMap({ id: 'ancient-janapadas', expectedPending: 0 });
}

/*
|--------------------------------------------------------------------------
| ENVIRONMENT TREATIES — faithful to the editor's seed, with its cities
|--------------------------------------------------------------------------
*/
console.log('\n\n============ environment-treaties ============');
{
  const dir = path.join(MAPS_DIR, 'environment-treaties');
  const seed = readJson(path.join(TREATY_SEEDS, 'treaties.seed.json'));
  const cities = readJson(path.join(TREATY_SEEDS, 'cities.seed.json'));
  const additions = readJson(path.join(TREATY_SEEDS, 'additions.seed.json'));
  const recs = readJson(path.join(dir, 'records.json'));
  const places = readJson(path.join(dir, 'places.json'));
  const tabs = readJson(path.join(dir, 'tabs.json'));
  const TABLES = ['conventions', 'treaties', 'summits', 'cops'];

  // One table, the seed's four in tab order, each record with its tab.
  const source = {};
  for (const table of TABLES)
    for (const [key, row] of Object.entries(seed[table])) {
      const want = { tab: table };
      for (const [f, v] of Object.entries(row)) if (!['id', 'cityQuery', 'sources', 'review'].includes(f)) want[f] = v;
      // A value the seed leaves null takes the one found for it, cited, only there.
      for (const [f, v] of Object.entries(additions[key] ?? {})) if (!['sources', 'review'].includes(f) && row[f] === null) want[f] = v;
      source[key] = want;
    }
  console.log('\n---- records.json against treaties.seed.json ----');
  check(TABLES.map((t) => Object.keys(seed[t]).length).join('/') === '12/7/4/31', `the seed holds conventions 12, treaties 7, summits 4, cops 31 (${TABLES.map((t) => Object.keys(seed[t]).length).join('/')})`);
  compareTables({ source, file: recs, label: 'records.json', ignore: ['tabBn', 'tabEn', 'inForceYear', 'parentShortEn', 'at', 'soloAt', 'place', 'children', 'frame'] });
  // A row with no theme is named by its tab: the tab's own title, from the seed.
  const tabOf = Object.fromEntries(seed.tabs.map((t) => [t.id, t]));
  const badTab = Object.keys(recs).filter((k) => recs[k].tabBn !== tabOf[recs[k].tab].titleBn || recs[k].tabEn !== tabOf[recs[k].tab].titleEn);
  check(badTab.length === 0, `every record's tabBn and tabEn are its tab's titles in the seed${badTab.length ? ` — not ${badTab.join(', ')}` : ''}`);

  // The map is in English (the user's decision, 2026-09-27): every English
  // display field is there wherever its Bengali one is, null where it is null
  // and absent where it is absent — the same fact, translated.
  const TWINS = { nameEn: 'nameBn', shortEn: 'shortBn', themeEn: 'themeBn', cityEn: 'cityBn', countryEn: 'countryBn', signedEn: 'signedBn', inForceEn: 'inForceBn', noteEn: 'noteBn', parentTextEn: 'parentTextBn', tabEn: 'tabBn' };
  const state = (v) => (v === undefined ? 'absent' : v === null ? 'null' : 'value');
  const badTwins = Object.entries(recs).flatMap(([k, r]) => Object.entries(TWINS).filter(([en, bn]) => state(r[en]) !== state(r[bn])).map(([en]) => `${k}.${en}`));
  check(badTwins.length === 0, `every English field is present where its Bengali one is, null and absent alike (${Object.keys(TWINS).length} fields, ${Object.keys(recs).length} records)${badTwins.length ? ` — not ${badTwins.join(', ')}` : ''}`);
  // The card's two derived values: the one year inForceEn names, and the
  // abbreviation closing parentTextEn.
  const badYear = Object.entries(recs).filter(([, r]) => ('inForceEn' in r) !== ('inForceYear' in r) || (typeof r.inForceEn === 'string' && !(r.inForceEn.match(/\b(1[5-9]\d\d|20\d\d)\b/g)?.length === 1 && Number(r.inForceEn.match(/\b(1[5-9]\d\d|20\d\d)\b/)[1]) === r.inForceYear)));
  check(badYear.length === 0, `every inForceYear is the one year its inForceEn names (${Object.values(recs).filter((r) => Number.isInteger(r.inForceYear)).length})${badYear.length ? ` — not ${badYear.map(([k]) => k).join(', ')}` : ''}`);
  const badShort = Object.entries(recs).filter(([, r]) => ('parentTextEn' in r) !== ('parentShortEn' in r) || (typeof r.parentTextEn === 'string' && r.parentTextEn.match(/\(([A-Z][A-Za-z0-9-]*)\)\s*$/)?.[1] !== r.parentShortEn));
  check(badShort.length === 0, `every parentShortEn is the abbreviation closing its parentTextEn (${Object.entries(recs).filter(([, r]) => r.parentShortEn).map(([k, r]) => `${k} ${r.parentShortEn}`).join(', ')})${badShort.length ? ` — not ${badShort.map(([k]) => k).join(', ')}` : ''}`);
  const added =Object.entries(additions).filter(([k]) => k !== '_about');
  check(
    added.every(([key, entry]) => Object.keys(entry).filter((f) => !['sources', 'review'].includes(f)).every((f) => TABLES.some((t) => seed[t][key]?.[f] === null) && entry.sources?.[f]?.every((c) => c.url && c.states))),
    `every addition fills a value the seed leaves null, cited with what its source states (${added.map(([k, e]) => Object.keys(e).filter((f) => !['sources', 'review'].includes(f)).map((f) => `${k}.${f}`).join(', ')).join(', ')})`,
  );
  check(JSON.stringify(tabs) === JSON.stringify(Object.fromEntries(seed.tabs.map((t) => [t.id, { titleBn: t.titleBn, titleEn: t.titleEn }]))), `tabs.json is the seed's tabs, in order, with both titles (${Object.keys(tabs).join(', ')})`);

  // Every city a record names stands at its Wikidata item's point, cited to a revision.
  let badCity = 0;
  const cityOf = {};
  for (const table of TABLES)
    for (const [key, row] of Object.entries(seed[table])) {
      if (!row.cityQuery) {
        if (recs[key].at || recs[key].frame) (fail(`${key}: no city in the seed, yet a point or frame`), badCity++);
        continue;
      }
      const c = cities[row.cityQuery];
      cityOf[key] = row.cityQuery;
      const cited = c?.sources?.at?.some((s) => s.url === `https://www.wikidata.org/w/index.php?title=${c.wikidata}&oldid=${s.url.split('oldid=')[1]}` && s.states);
      if (!c || JSON.stringify(recs[key].at) !== JSON.stringify(c.at.map((n) => Number(n.toFixed(5)))) || !cited) (fail(`${key}: its point is not its city's, cited to a revision of the city's item`), badCity++);
    }
  check(badCity === 0, `every record with a city stands at its city's Wikidata point, cited to the revision read (${Object.keys(cityOf).length} records, ${new Set(Object.values(cityOf)).size} cities)`);

  // A city that holds two or more records in one tab is one place, listing them all.
  const groups = new Map();
  for (const [key, q] of Object.entries(cityOf)) groups.set(`${recs[key].tab}|${q}`, [...(groups.get(`${recs[key].tab}|${q}`) ?? []), key]);
  const shared = [...groups.values()].filter((keys) => keys.length > 1);
  const placeKeys = new Set(Object.keys(places));
  let badPlace = 0;
  for (const keys of shared) {
    const p = recs[keys[0]].place?.[0];
    const place = places[p];
    if (!place || JSON.stringify(place.records) !== JSON.stringify(keys) || place.count !== keys.length || !keys.every((k) => recs[k].place?.[0] === p && !recs[k].soloAt)) (fail(`${keys.join(', ')}: not one place listing them all`), badPlace++);
    else if (!keys.every((k) => recs[k].cityEn === place.nameEn && recs[k].countryEn === place.countryEn && recs[k].cityBn === place.nameBn && recs[k].countryBn === place.countryBn)) (fail(`${p}: not named as its records name their city`), badPlace++);
    placeKeys.delete(p);
  }
  const alone = [...groups.values()].filter((keys) => keys.length === 1).flat();
  for (const k of alone) if (recs[k].place || JSON.stringify(recs[k].soloAt) !== JSON.stringify(recs[k].at)) (fail(`${k}: alone in its city, yet not its own marker`), badPlace++);
  check(badPlace === 0 && placeKeys.size === 0, `records alone in their city in their tab are their own marker (${alone.length}); the rest are ${shared.length} places holding ${shared.flat().length}${placeKeys.size ? ` — stray places ${[...placeKeys].join(', ')}` : ''}`);

  // The parent link is the reverse of parentId, so a card shows its parent.
  const want = {};
  for (const [key, r] of Object.entries(recs)) if (r.parentId) (want[r.parentId] ??= []).push(key);
  const badChildren = Object.keys(recs).filter((k) => JSON.stringify(recs[k].children) !== JSON.stringify(want[k]));
  check(badChildren.length === 0, `children is the reverse of parentId (${Object.keys(want).length} parents)${badChildren.length ? ` — not ${badChildren.join(', ')}` : ''}`);

  // Every theme has its colour, or its markers and dots would fall to the tab's.
  const colour = readJson(path.join(dir, 'descriptor.json')).styles.marker.paint['circle-color'];
  const coloured = colour.slice(2, -1).filter((_, i) => i % 2 === 0);
  const themes = [...new Set(Object.values(recs).map((r) => r.themeBn).filter(Boolean))];
  check(themes.every((t) => coloured.includes(t)), `every theme has its colour (${themes.length} themes)`);

  // Every marker carries its city's English name beside it: a record's own,
  // or a shared marker's, once.
  const descriptorEt = readJson(path.join(dir, 'descriptor.json'));
  const labelOf = (id) => JSON.stringify(descriptorEt.layers.find((l) => l.id === id)?.layout?.['text-field']);
  check(
    labelOf('solo-label') === '["get","cityEn"]' && labelOf('place-label') === '["get","nameEn"]',
    'a marker of one record carries its city, a shared marker its city once, in English',
  );

  // Pending: the country's ratification, where no source was found yet (19),
  // the cities the seed leaves to the user's book (CITES, UNCCD) with their
  // countries, WSSD's city, the High Seas Treaty's parent (its parent, UNCLOS,
  // is not on this map; the seed gives it as text) — and the five unknown
  // places again in English, which the card shows.
  checkMap({ id: 'environment-treaties', expectedPending: 30 });
}

/*
|--------------------------------------------------------------------------
| LATITUDE-LONGITUDE — the globe, drawn by the shell's globe module, held to
| its seed, its pins and the words the user approved.
|--------------------------------------------------------------------------
*/
console.log('\n\n============ latitude-longitude ============');
{
  const id = 'latitude-longitude';
  const dir = path.join(MAPS_DIR, id);
  const seed = readJson(LATLON_SEED);
  const pins = readJson(LATLON_PINS);
  const marble = readJson(SOURCES_JSON).nasaBlueMarble;
  const descriptor = readJson(path.join(dir, 'descriptor.json'));
  const recs = readJson(path.join(dir, 'records.json'));
  const lines = readJson(path.join(dir, 'lines.geojson'));
  const grat = readJson(path.join(dir, 'graticule.geojson'));
  const areas = readJson(path.join(dir, 'areas.geojson'));
  const { lostPieces, clipEdgeVertices } = await import(pathToFileURL(path.join(HERE, 'tile-clip.mjs')).href);
  const hash = (g) => crypto.createHash('sha256').update(JSON.stringify(g.coordinates)).digest('hex').slice(0, 16);

  const FILES = ['areas.geojson', 'descriptor.json', 'graticule.geojson', 'imagery.pmtiles', 'lines.geojson', 'records.json'];
  check(fs.readdirSync(dir).sort().join() === FILES.join(), `the map's folder holds its ${FILES.length} files and nothing else — no logo, no stray file`);

  // The seed's one pending value is the date line's geometry, which the build
  // takes from Natural Earth; nothing else in it may be null.
  const nulls = [];
  const walk = (node, trail) => {
    if (node === null) nulls.push(trail);
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${trail}.${k}`);
  };
  walk(seed, 'seed');
  check(nulls.join() === 'seed.lines.date-line.geometry', `the seed's only pending value is the date line's geometry, which the build fills${nulls.length ? ` (${nulls.join(', ')})` : ''}`);

  // One record per line, point and place, in the seed's order; the graticule
  // is drawn, never a record.
  const groupOf = (e) => (e.id in seed.lines ? 'line' : e.id in seed.points ? 'point' : 'place');
  const ordered = [...Object.values(seed.lines), ...Object.values(seed.points), ...Object.values(seed.places)].sort((a, b) => a.order - b.order);
  const selectable = Object.fromEntries(ordered.filter((e) => e.kind !== 'graticule').map((e) => [e.id, e]));
  console.log('\n---- records.json against latitude-longitude.seed.json ----');
  compareTables({ source: selectable, file: recs, label: 'records.json', ignore: ['id', 'order', 'sources', 'review', 'geometry', 'point', 'dhakaPoint', 'group', 'at', 'hasLine', 'hasArea', 'frame', 'coordAt'] });
  check(Object.keys(recs).join() === Object.keys(selectable).join(), `records.json is in the seed's order, the picker's order (${Object.keys(recs).length} records)`);
  const atOf = (e) => (groupOf(e) === 'point' ? [e.lon, e.lat] : e.point ? [e.point.lon, e.point.lat] : e.dhakaPoint ? [e.dhakaPoint.lon, e.dhakaPoint.lat] : undefined);
  const badDerived = Object.values(selectable).filter((e) => {
    const r = recs[e.id];
    return r.group !== groupOf(e) || JSON.stringify(r.at) !== JSON.stringify(atOf(e)) || r.hasLine !== (groupOf(e) === 'line') || r.hasArea !== (e.geometry?.source === 'COD-AB bgd_admin0' || e.geometry?.from === 'bangladesh');
  });
  check(badDerived.length === 0, `every record's group, point, line and area follow from the seed — Dhaka's point, its antipode's, the poles', Greenwich's${badDerived.length ? ` — not: ${badDerived.map((e) => e.id).join(', ')}` : ''}`);

  // The lines, each at the seed's value; the date line Natural Earth's, pinned.
  const lineIds = Object.values(selectable).filter((e) => groupOf(e) === 'line').map((e) => e.id);
  const byId = Object.fromEntries(lines.features.map((f) => [f.properties.id, f]));
  check(lines.features.map((f) => f.properties.id).join() === lineIds.join(), `lines.geojson has the seed's ${lineIds.length} lines, in its order`);
  const offValue = lineIds.filter((lid) => {
    const e = selectable[lid];
    const c = byId[lid]?.geometry.coordinates ?? [];
    if (e.kind === 'parallel') return !c.every(([, lat]) => lat === e.lat) || c[0]?.[0] !== -180 || c.at(-1)?.[0] !== 180;
    if (e.kind === 'meridian') return !c.every(([lon]) => lon === e.lon) || c[0]?.[1] !== -90 || c.at(-1)?.[1] !== 90;
    return e.kind !== 'dateLine';
  });
  check(offValue.length === 0, `every parallel runs round the world and every meridian pole to pole, at the seed's value${offValue.length ? ` — not: ${offValue.join(', ')}` : ''}`);
  check(hash(byId['date-line'].geometry) === pins['date-line'], `the date line is Natural Earth's, as pinned (${pins['date-line']})`);

  // The graticule: every stepDeg° but where a line of its own is drawn.
  const step = seed.lines.graticule.stepDeg;
  const ownLats = new Set(lineIds.filter((l) => selectable[l].kind === 'parallel').map((l) => selectable[l].lat));
  const ownLons = new Set(lineIds.filter((l) => selectable[l].kind === 'meridian').map((l) => selectable[l].lon));
  const wantLats = [];
  for (let lat = -90 + step; lat < 90; lat += step) if (!ownLats.has(lat)) wantLats.push(lat);
  const wantLons = [];
  for (let lon = -180; lon < 180; lon += step) if (!ownLons.has(lon)) wantLons.push(lon);
  const gotLats = grat.features.filter((f) => f.properties.kind === 'parallel').map((f) => f.properties.deg);
  const gotLons = grat.features.filter((f) => f.properties.kind === 'meridian').map((f) => f.properties.deg);
  check(gotLats.join() === wantLats.join() && gotLons.join() === wantLons.join() && gotLats.length + gotLons.length === grat.features.length, `the graticule is every ${step}° but the lines drawn on their own (${gotLats.length} parallels, ${gotLons.length} meridians)`);
  const offGrat = grat.features.filter((f) => !f.geometry.coordinates.every((v) => v[f.properties.kind === 'parallel' ? 1 : 0] === f.properties.deg));
  check(offGrat.length === 0, 'every graticule line lies at its own degree');
  check(!descriptor.sources.graticule?.records && !descriptor.interactions.some((i) => i.target === 'source:graticule'), 'the graticule is drawn, never selected — no records, no tap (the seed: tappable false)');

  // No line loses a piece where MapLibre tiles it, and no parallel carries a
  // vertex on a tile's clip edge, where that loss begins.
  const named = { type: 'FeatureCollection', features: [...lines.features, ...grat.features.map((f) => ({ ...f, properties: { id: `graticule ${f.properties.kind} ${f.properties.deg}°` } }))] };
  const proof = lostPieces(named, 6);
  check(proof.lost.length === 0, `no line loses a piece in MapLibre's tiling at z0–6 (${proof.checked} line-tile pairs)${proof.lost.length ? ` — ${proof.lost.slice(0, 6).join('; ')}` : ''}`);
  const parallels = { type: 'FeatureCollection', features: [...lines.features.filter((f) => selectable[f.properties.id].kind === 'parallel'), ...grat.features.filter((f) => f.properties.kind === 'parallel')] };
  const onEdge = clipEdgeVertices(parallels, 6, (f) => f.properties.id ?? `graticule ${f.properties.deg}°`);
  check(onEdge.length === 0, `no parallel has a vertex on a tile's clip edge at z0–6 (${parallels.features.length} parallels)${onEdge.length ? ` — ${onEdge.slice(0, 4).join('; ')}` : ''}`);

  // Bangladesh is COD-AB's outline, pinned; its antipode is that outline
  // flipped, vertex for vertex.
  const bd = areas.features.find((f) => f.properties.id === 'bangladesh');
  const ap = areas.features.find((f) => f.properties.id === 'antipode');
  check(areas.features.length === 2 && Boolean(bd && ap), 'areas.geojson holds Bangladesh and its antipode');
  check(hash(bd.geometry) === pins.bangladesh, `Bangladesh is COD-AB's outline, simplified, as pinned (${pins.bangladesh})`);
  const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  const flipRing = (r) => JSON.stringify(r.map(([lon, lat]) => [Number((lon - 180).toFixed(4)), Number((-lat).toFixed(4))]));
  const bdPolys = polys(bd.geometry);
  const apPolys = polys(ap.geometry);
  const mirrored = bdPolys.length === apPolys.length && bdPolys.every((p, i) => p.length === apPolys[i].length && p.every((ring, j) => [JSON.stringify(apPolys[i][j]), JSON.stringify([...apPolys[i][j]].reverse())].includes(flipRing(ring))));
  check(mirrored, `the antipode is Bangladesh's outline with every vertex at (lon − 180°, −lat) (${bdPolys.length} polygons)`);

  // Where the latitude and longitude callouts point: Bangladesh's inner point,
  // inside its outline, and Dhaka's own point — the two places the user asked for.
  const inRing = ([x, y], ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const inside = (pt, g) => polys(g).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((hole) => inRing(pt, hole)));
  const withCallout = Object.keys(recs).filter((k) => recs[k].coordAt);
  check(withCallout.join() === 'bangladesh,dhaka', `the latitude and longitude callouts are Bangladesh's and Dhaka's (${withCallout.join(', ')})`);
  check(Boolean(recs.bangladesh.coordAt) && inside(recs.bangladesh.coordAt, bd.geometry), `Bangladesh's callout points inside its outline (${recs.bangladesh.coordAt})`);
  check(JSON.stringify(recs.dhaka.coordAt) === JSON.stringify(recs.dhaka.at), "Dhaka's callout points at Dhaka's own point");

  // ---- the globe, and the words on it ----
  console.log('\n---- the globe and its words ----');
  const g = descriptor.globe;
  const sheet = descriptor.sheet;
  check(g.open?.record === 'bangladesh', 'the globe opens with Bangladesh facing the viewer');
  // The user's decision (2026-09-28): the globe's selector is the picker row,
  // as on every map — every record, in the seed's order, each by its name
  // (chipBn is a category several records share, never a selector's label),
  // choosing flying the globe to it and opening its card.
  const picker = descriptor.controls.find((c) => c.type === 'picker');
  check(Boolean(picker) && picker.from === 'items' && !picker.groupBy && JSON.stringify(picker.label) === '{"field":"nameBn"}', `the picker lists every one of the ${Object.keys(recs).length} records, in the seed's order, each by its nameBn`);
  check(JSON.stringify((picker?.do ?? []).map((a) => a.action)) === '["select","flyTo"]', "choosing a record in the picker, or by ‹ ›, selects it and flies the globe to it");
  check(sheet.title?.field === 'nameBn' && sheet.chip?.field === 'chipBn', "the card's title is the record's nameBn, its chip the record's chipBn");
  // The card shows every Bengali field a record has, in the seed's order.
  const applies = (row, r) => Object.entries(row.when ?? {}).every(([f, v]) => (Array.isArray(v) ? v : [v]).includes(r[f]));
  const shownOf = (key) => sheet.rows.filter((row) => applies(row, recs[key]) && recs[key][row.field] !== undefined).map((row) => row.field);
  const seedOf = (entry) => Object.keys(entry).filter((f) => /Bn$/.test(f) && !['nameBn', 'chipBn'].includes(f));
  const unshown = Object.values(selectable).filter((entry) => shownOf(entry.id).join() !== seedOf(entry).join());
  check(unshown.length === 0, `every card shows every Bengali field its record has, once, in the seed's order (${Object.keys(selectable).length} cards)${unshown.length ? ` — not: ${unshown.map((x) => `${x.id} [${shownOf(x.id).join(', ')}] ≠ [${seedOf(x).join(', ')}]`).join('; ')}` : ''}`);
  // The words the user approved: the card's row labels and the antipode
  // button's two labels (2026-09-27), and the picker's placeholder
  // (2026-09-28), which ends in the ellipsis every map's placeholder ends in.
  // factBn and ruleBn read on their own; so does any value no label was
  // approved for (the date line's, a point's).
  const WORDS = { placeholder: 'একটি রেখা বা স্থান বেছে নিন…', latitude: 'অক্ষাংশ', longitude: 'দ্রাঘিমাংশ', time: 'সময়', nearestLand: 'নিকটতম স্থলভাগ', where: 'অবস্থান', toAntipode: 'প্রতিপাদে যান', toBangladesh: 'বাংলাদেশে ফিরুন' };
  check(picker?.placeholder === WORDS.placeholder, `the picker's placeholder is the approved «${WORDS.placeholder}»`);
  const labelFor = (row) =>
    row.field === 'valueBn'
      ? { parallel: WORDS.latitude, meridian: WORDS.longitude }[row.when?.kind]
      : { latBn: WORDS.latitude, lonBn: WORDS.longitude, timeBn: WORDS.time, nearestBn: WORDS.nearestLand, whereBn: WORDS.where }[row.field];
  const misLabelled = sheet.rows.filter((row) => row.label !== labelFor(row));
  check(misLabelled.length === 0, `every row label is the approved word for its field, and a row with none approved has no label (${sheet.rows.filter((r) => r.label).length} labelled of ${sheet.rows.length})${misLabelled.length ? ` — not: ${misLabelled.map((r) => `${r.field} «${r.label ?? ''}»`).join(', ')}` : ''}`);
  check(JSON.stringify(g.antipode?.labels) === JSON.stringify({ bangladesh: WORDS.toAntipode, antipode: WORDS.toBangladesh }), `the antipode button reads «${WORDS.toAntipode}» on Bangladesh's card and «${WORDS.toBangladesh}» on the antipode's`);
  const bare = JSON.parse(JSON.stringify(descriptor));
  delete bare.title.bn;
  for (const row of bare.sheet.rows) delete row.label;
  delete bare.globe.antipode.labels;
  for (const control of bare.controls) delete control.placeholder;
  const stray = [...new Set(JSON.stringify(bare).match(/[\u0980-\u09FF][\u0980-\u09FF\s]*/g) ?? [])];
  check(stray.length === 0, `no other Bengali in the descriptor but its title${stray.length ? ` — ${stray.join(', ')}` : ''}`);
  console.log(`     the latitude and longitude show from z${g.coordinates?.minZoom}; the antipode turn takes ${g.antipode?.duration} ms`);

  // Frames need basemap context: none past z6 on a 390 px phone, whose map is
  // 368 × 728 px.
  const mercY = (lat) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return 0.5 - (0.25 * Math.log((1 + s) / (1 - s))) / Math.PI;
  };
  const zoomOf = ([w, s, e, n]) => Math.min(Math.log2(368 / (((e - w) / 360) * 512)), Math.log2(728 / ((mercY(s) - mercY(n)) * 512)));
  const deepest = Math.max(...Object.values(recs).map((r) => zoomOf(r.frame)));
  check(deepest <= 6, `every frame lands at z6 or below on a 390 px phone (deepest z${deepest.toFixed(2)})`);

  // Credits: NASA's, as its page asks and nowhere else; COD-AB's on the areas.
  const nasa = `<a href="${marble.page}" target="_blank" rel="noopener noreferrer">${marble.credit}</a>`;
  check(marble.credit === 'NASA Earth Observatory' && marble.terms.credit.states.includes(`“${marble.credit}.”`), `the imagery's credit is the one NASA's page asks for, "${marble.credit}"`);
  check((descriptor.attribution?.extra ?? []).includes(nasa), 'ⓘ credits NASA Earth Observatory, linked to the imagery\'s own page');
  const mentions = JSON.stringify(descriptor).split('NASA').length - 1 + (JSON.stringify(recs).split('NASA').length - 1);
  check(mentions === 1, `NASA is named once, in the credit, and nowhere else — no logo, no wording that suggests endorsement (${mentions})`);
  const codab = descriptor.sources.areas?.attribution ?? '';
  check(codab.includes('https://data.humdata.org/dataset/cod-ab-bgd') && codab.includes('CC BY-IGO'), 'the areas credit COD-AB (BBS / OCHA, CC BY-IGO), as its licence requires');
  const imageryMeta = JSON.parse(zlib.gunzipSync((() => {
    const buf = fs.readFileSync(path.join(dir, 'imagery.pmtiles'));
    return buf.subarray(Number(buf.readBigUInt64LE(24)), Number(buf.readBigUInt64LE(24)) + Number(buf.readBigUInt64LE(32)));
  })()).toString('utf8'));
  check(imageryMeta.source === marble.product && imageryMeta.attribution === marble.credit, `the imagery archive says it is the pinned product, "${marble.product}"`);

  checkMap({ id, expectedPending: 0 });
}

/*
|--------------------------------------------------------------------------
| ATMOSPHERE-LAYERS — a diagram, faithful to the editor's seed and to the
| approved art. A diagram is not a map: it has no records tables for the
| generic checks, so its section reads its own files.
|--------------------------------------------------------------------------
*/
// Every diagram a section below has checked, for the guard at the end.
const CHECKED_DIAGRAMS = new Set();

console.log('\n\n============ atmosphere-layers (diagram) ============');
{
  const id = 'atmosphere-layers';
  CHECKED_DIAGRAMS.add(id);
  const dir = path.join(DIAGRAMS_DIR, id);
  const seed = readJson(path.join(ATMOSPHERE_SEEDS, 'atmosphere.seed.json'));
  const descriptor = readJson(path.join(dir, 'descriptor.json'));
  const data = readJson(path.join(dir, descriptor.data));
  const view = descriptor.views.find((v) => v.type === 'exploded');
  const manifest = readJson(path.join(dir, view.art));
  const layers = Object.values(seed.layers).sort((a, b) => a.order - b.order);
  const bn = (n) => String(n).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

  // ---- the descriptor ---------------------------------------------------------
  console.log('\n---- descriptor ----');
  check(descriptor.id === id && descriptor.language === 'bn' && descriptor.section === 'misc', `descriptor: id ${descriptor.id}, language ${descriptor.language}, section ${descriptor.section}`);
  check(Boolean(descriptor.title?.en && descriptor.title?.bn), `title in both languages: «${descriptor.title?.bn}» / ${descriptor.title?.en}`);
  // A view with a type has a module in the shell; one without is not built.
  const modules = [...(fs.readFileSync(path.join(VISUAL_DIR, 'app.js'), 'utf8').match(/const VIEW_MODULES = \{([^}]*)\}/)?.[1] ?? '').matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1]);
  const unknown = descriptor.views.filter((v) => v.type && !modules.includes(v.type));
  check(unknown.length === 0, `every view's type has a module in docs/visual/app.js (${descriptor.views.map((v) => v.type ?? '(not built)').join(', ')}; the shell has ${modules.join(', ')})`);
  check(descriptor.views.length === 1, `one view, so the shell hides the tab bar (${descriptor.views.length})`);
  // Every word the page reads is there: the words its code asks for, read from the code.
  const asked = new Set();
  for (const file of ['app.js', 'exploded.js']) {
    for (const m of fs.readFileSync(path.join(VISUAL_DIR, file), 'utf8').matchAll(/\bwords\??\.(\w+)/g)) asked.add(m[1]);
  }
  const missingWords = [...asked].filter((w) => typeof descriptor.words[w] !== 'string' || !descriptor.words[w]);
  const unusedWords = Object.keys(descriptor.words).filter((w) => !asked.has(w));
  check(missingWords.length === 0 && unusedWords.length === 0, `the descriptor has every word the page reads, and none it does not (${asked.size})${missingWords.length ? ` — missing ${missingWords.join(', ')}` : ''}${unusedWords.length ? ` — unused ${unusedWords.join(', ')}` : ''}`);
  // The page's own copy of the load notice, for a descriptor that never arrives, says the same.
  const page = fs.readFileSync(path.join(VISUAL_DIR, 'index.html'), 'utf8');
  const ownCopy = (elementId) => page.match(new RegExp(`id="${elementId}">([^<]*)<`))?.[1];
  check(
    ownCopy('loadNoticeHeadline') === descriptor.words.loadFailed && ownCopy('loadNoticeAdvice') === descriptor.words.loadAdvice,
    'docs/visual/index.html carries the descriptor\'s load notice word for word',
  );
  const badChips = layers.filter((l) => descriptor.words.chip.replace('{n}', bn(l.order)) !== l.orderBn || !descriptor.colours.chips[l.id]);
  check(badChips.length === 0, `every layer's chip is the descriptor's «${descriptor.words.chip}» with its number, as the seed writes it, in its own colour${badChips.length ? ` — not: ${badChips.map((l) => l.id).join(', ')}` : ''}`);

  // ---- the art -----------------------------------------------------------------
  console.log('\n---- art ----');
  const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const inputs = Object.entries(seed.art.files);
  const badInputs = inputs.filter(([file, want]) => manifest.inputs[file] !== want || sha(path.join(ATMOSPHERE_SEEDS, 'art', file)) !== want);
  check(
    badInputs.length === 0 && Object.keys(manifest.inputs).length === inputs.length,
    `the art is built from the ${inputs.length} inputs the seed approves, each file's SHA-256 the seed's${badInputs.length ? ` — not: ${badInputs.map(([f]) => f).join(', ')}` : ''}`,
  );
  const named = [
    ...Object.values(manifest.view.files),
    ...manifest.slabs.flatMap((s) => Object.values(s.files)),
    ...manifest.icons.flatMap((i) => Object.values(i.files)),
  ];
  const onDisk = (function list(sub) {
    return fs.readdirSync(path.join(dir, sub), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(path.join(sub, e.name)) : [path.join(sub, e.name).replaceAll('\\', '/')]));
  })('');
  const expected = ['descriptor.json', descriptor.data, view.art, ...named].sort();
  check(JSON.stringify(onDisk.sort()) === JSON.stringify(expected), `the folder holds the descriptor, the data, the manifest and the ${named.length} files it names, nothing else (${onDisk.length})`);
  check(
    manifest.slabs.map((s) => s.id).join() === layers.map((l) => l.id).join() && [...manifest.icons.map((i) => i.id)].sort().join() === Object.keys(seed.features).sort().join(),
    `the art has a slab for each of the seed's ${layers.length} layers, in order, and an icon for each of its ${Object.keys(seed.features).length} features`,
  );

  // ---- data.json against the seed ---------------------------------------------
  console.log('\n---- data.json against atmosphere.seed.json ----');
  // A height as the seed gives it: km in `name`, or [least, greatest] in `nameRange`.
  const height = (record, name) => (`${name}Range` in record ? record[`${name}Range`] : record[name]);
  const pick = (record, fields) => Object.fromEntries(fields.filter((f) => f in record).map((f) => [f, record[f]]));
  compareTables({
    source: Object.fromEntries(layers.map((l) => [l.id, { ...pick(l, ['id', 'order', 'nameBn', 'trendBn', 'rateBn', 'noteBn', 'featureIds']), fromKm: height(l, 'fromKm'), toKm: height(l, 'toKm') }])),
    file: Object.fromEntries(data.layers.map((l) => [l.id, l])),
    label: 'data.json layers',
  });
  const seedBoundaries = Object.values(seed.boundaries);
  const wantBoundaries = manifest.boundaries.map((b) => {
    const [under, over] = b.between;
    const own = seedBoundaries.find((s) => JSON.stringify(s.between) === JSON.stringify(b.between));
    const atKm = under === 'earth' ? height(layers[0], 'fromKm') : !over ? height(layers.at(-1), 'toKm') : height(own, 'atKm');
    return { id: b.id, between: b.between, atKm };
  });
  const boundaryDiffs = diffValue(wantBoundaries, data.boundaries, 'boundaries');
  for (const d of boundaryDiffs) fail(`data.json: ${d}`);
  check(boundaryDiffs.length === 0, `data.json has the art's ${wantBoundaries.length} boundaries, in its order, each at the seed's height`);
  compareTables({
    source: Object.fromEntries(layers.flatMap((l) => l.featureIds).map((f) => [f, { nameBn: seed.features[f].nameBn, ...pick({ fromKm: height(seed.features[f], 'fromKm'), toKm: height(seed.features[f], 'toKm') }, ['fromKm', 'toKm'].filter((k) => height(seed.features[f], k) !== undefined)) }])),
    file: data.features,
    label: 'data.json features',
  });
  const atBoundary = (p) => manifest.boundaries.findIndex((b) => (p.at === 'surface' ? b.between[0] === 'earth' : p.at === 'thermosphere top' ? b.between[0] === 'thermosphere' : b.id === p.at));
  const wantProfile = seed.profile.points.map((p) => ({ boundary: atBoundary(p), tempC: p.tempC, ...(p.upTo ? { upTo: true } : {}) }));
  const profileDiffs = diffValue(wantProfile, data.profile, 'profile');
  for (const d of profileDiffs) fail(`data.json: ${d}`);
  check(profileDiffs.length === 0, `the temperature profile is the seed's ${wantProfile.length} points, each at its boundary`);
  const cited = new Set();
  const cite = (record) => Object.values(record.sources ?? {}).flat().forEach((c) => cited.add(c.url));
  [...layers, ...seedBoundaries, ...Object.values(seed.features), seed.profile].forEach(cite);
  const credited = data.credits.map((c) => c.url);
  check(
    credited.length === new Set(credited).size && credited.length === cited.size && credited.every((u) => cited.has(u)),
    `ⓘ credits every source the seed cites, each once (${credited.length})`,
  );
  const provenance = JSON.stringify(data).match(/"(review|sources)":/g);
  check(!provenance, 'no provenance ships: no review, no sources in data.json');

  // ---- THE PENDING LIST -------------------------------------------------------
  console.log('\n---- PENDING: values that exist but are unverified ----');
  const pending = [];
  const walk = (where, v) => {
    if (v === null) pending.push(where);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(`${where}.${k}`, x);
  };
  // Content only: a boundary's id and `between` are the art's structure — the
  // Earth's boundary and the one above the stack have no id, and nothing lies
  // above the top — never unverified.
  walk('descriptor.title', descriptor.title);
  walk('descriptor.words', descriptor.words);
  walk('data.layers', data.layers);
  walk('data.features', data.features);
  data.boundaries.forEach((b, n) => walk(`data.boundaries[${n}].atKm`, b.atKm));
  walk('data.profile', data.profile);
  pending.forEach((p) => console.log(`     ${p}`));
  console.log(`\n     total pending: ${pending.length}`);
  // Nothing is pending: the tropopause's height is NOAA's range, 6–20 km,
  // and the seed gives the rest (the user's decision to use NOAA's figures).
  const expectedPending = 0;
  if (pending.length !== expectedPending) fail(`pending count is ${pending.length}, expected ${expectedPending} — reporting, not adjusting the expectation`);
  else ok(`pending count is ${pending.length}, as expected`);
}

console.log('\n\n============ earth-interior (diagram) ============');
{
  const id = 'earth-interior';
  CHECKED_DIAGRAMS.add(id);
  const dir = path.join(DIAGRAMS_DIR, id);
  const seedFile = path.join(EARTH_SEEDS, 'earth-interior.seed.json');
  const seed = readJson(seedFile);
  const seedHash = crypto.createHash('sha256').update(fs.readFileSync(seedFile)).digest('hex');
  check(seedHash === EARTH_SEED_SHA256, `the seed is the approved one: SHA-256 ${seedHash.slice(0, 12)}… (pinned ${EARTH_SEED_SHA256.slice(0, 12)}…)`);
  const descriptor = readJson(path.join(dir, 'descriptor.json'));
  const data = readJson(path.join(dir, descriptor.data));
  const view = descriptor.views.find((v) => v.type === 'cutaway');
  const manifest = view ? readJson(path.join(dir, view.art)) : { layers: [], circles: {}, edges: {}, view: { files: {} } };
  const layers = Object.values(seed.layers).sort((a, b) => a.order - b.order);
  const ui = seed.ui;

  // ---- the descriptor ---------------------------------------------------------
  console.log('\n---- descriptor ----');
  check(descriptor.id === id && descriptor.language === 'bn' && descriptor.section === 'misc', `descriptor: id ${descriptor.id}, language ${descriptor.language}, section ${descriptor.section}`);
  check(descriptor.title?.bn === seed.titleBn && descriptor.title?.en === seed.titleEn, `title is the seed's: «${descriptor.title?.bn}» / ${descriptor.title?.en}`);
  const modules = [...(fs.readFileSync(path.join(VISUAL_DIR, 'app.js'), 'utf8').match(/const VIEW_MODULES = \{([^}]*)\}/)?.[1] ?? '').matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1]);
  check(descriptor.views.length === 1 && Boolean(view) && modules.includes('cutaway'), `one view, of type cutaway, which docs/visual/app.js has a module for (${descriptor.views.map((v) => v.type).join(', ')})`);
  check(descriptor.words?.picker === ui.pickerPlaceholderBn, `the picker's placeholder is the seed's: «${descriptor.words?.picker}»`);
  check(descriptor.words?.scale === ui.scaleNoteBn, `the scale note is the seed's: «${descriptor.words?.scale}»`);
  check(descriptor.words?.close === ui.closeBn, `the ×'s accessible name is the seed's: «${descriptor.words?.close}»`);
  const rowsWanted = ui.rowOrder.map((key) => ({ key, label: ui.rowLabelsBn[key] }));
  check(JSON.stringify(descriptor.words?.rows) === JSON.stringify(rowsWanted), `the card's rows are ui.rowOrder, labelled by ui.rowLabelsBn (${rowsWanted.map((r) => r.label).join(', ')})`);
  // The words the view's code reads are exactly the descriptor's.
  const asked = new Set([...fs.readFileSync(path.join(VISUAL_DIR, 'cutaway.js'), 'utf8').matchAll(/\bwords\??\.(\w+)/g)].map((m) => m[1]));
  const given = new Set(Object.keys(descriptor.words ?? {}));
  check([...asked].every((w) => given.has(w)) && [...given].every((w) => asked.has(w)), `the descriptor's words are exactly those cutaway.js reads (${[...asked].sort().join(', ')})`);

  // ---- the data ---------------------------------------------------------------
  console.log('\n---- data.json against earth-interior.seed.json ----');
  check(JSON.stringify(data.layers.map((l) => l.id)) === JSON.stringify(layers.map((l) => l.id)), `the ${layers.length} layers, in the seed's order: ${data.layers.map((l) => l.id).join(', ')}`);
  for (const l of layers) {
    const got = data.layers.find((d) => d.id === l.id);
    // A row missing from a layer's rows is not shown: it is not shipped either.
    const want = Object.fromEntries(ui.rowOrder.filter((k) => l.rows[k] !== undefined).map((k) => [k, l.rows[k]]));
    const same = Boolean(got) && got.nameBn === l.nameBn && JSON.stringify(got.rows) === JSON.stringify(want) && Object.keys(got).sort().join() === 'id,nameBn,rows';
    check(same, `${l.id}: «${l.nameBn}», rows ${Object.keys(want).join(', ') || '(none)'} as the seed has them, nothing else shipped`);
    for (const k of Object.keys(l.rows)) check(ui.rowOrder.includes(k), `${l.id}: its row ${k} is one ui.rowOrder places`);
  }
  // Every Bengali string shown is the seed's; the NCTB credit is its title and page.
  const seedStrings = new Set();
  const gather = (v, into) => (typeof v === 'string' ? into.push(v) : v && typeof v === 'object' ? Object.values(v).forEach((x) => gather(x, into)) : null);
  const fromSeed = [];
  gather(seed, fromSeed);
  for (const v of fromSeed) seedStrings.add(v);
  const shown = [];
  gather(descriptor, shown);
  gather(data, shown);
  const nctb = seed.sources.nctb;
  const usgs = seed.sources.usgs;
  const nctbCredit = `${nctb.title}, ${ui.pageBn} ${nctb.page}`;
  const foreign = shown.filter((v) => /[ঀ-৿]/.test(v) && !seedStrings.has(v) && v !== nctbCredit);
  check(foreign.length === 0, `every Bengali string shown is the seed's${foreign.length ? `, not: ${foreign.join(' | ')}` : ''}`);
  const wantCredits = [
    { title: nctbCredit, by: nctb.publisher, url: nctb.url, lang: 'bn' },
    { title: usgs.title, by: usgs.publisher, url: usgs.url },
  ];
  check(JSON.stringify(data.credits ?? []) === JSON.stringify(wantCredits), `ⓘ lists the NCTB book («${ui.pageBn} ${nctb.page}») and USGS, and nothing for the art (${(data.credits ?? []).map((c) => c.by).join('; ')})`);

  // ---- the art and its geometry -----------------------------------------------
  console.log('\n---- the art and its geometry ----');
  const pin = seed.art.files['earth-master.png'];
  const master = fs.readFileSync(path.join(EARTH_SEEDS, 'art', 'earth-master.png'));
  check(crypto.createHash('sha256').update(master).digest('hex') === pin.sha256, `the committed master is the one the seed pins (${pin.sha256.slice(0, 12)}…)`);
  const caps = { '1x': 40 * 1024, '2x': 112 * 1024 };
  for (const [k, f] of Object.entries(manifest.view.files)) {
    const file = path.join(dir, f);
    const bytes = fs.existsSync(file) ? fs.statSync(file).size : -1;
    check(bytes > 0 && bytes <= caps[k], `${f}: ${bytes} bytes, cap ${caps[k]}`);
  }
  const shape = manifest.layers;
  check(JSON.stringify(shape.map((l) => l.id)) === JSON.stringify(layers.map((l) => l.id)), "the manifest has a sector for each layer, in the seed's order");
  const inside = (p, c) => Math.hypot(p[0] - c.cx, p[1] - c.cy) < c.r;
  const { left, bottom, split } = manifest.edges;
  check(bottom < split && split < left, `the cut's edges at ${bottom}° and ${left}°, the crusts split at ${split}°`);
  for (const l of shape) {
    const face = seed.layers[l.id].face;
    const stretch = face === 'top' ? [split, left] : face === 'right' ? [bottom, split] : [bottom, left];
    const outer = manifest.circles[l.outer];
    const inner = l.inner ? manifest.circles[l.inner] : null;
    check(Boolean(outer) && l.outer === l.id && (l.inner === null) === (l.id === 'inner-core'), `${l.id}: its own outer circle${inner ? `, outside ${l.inner}'s` : ', nothing inside it'}`);
    check(l.from === stretch[0] && l.to === stretch[1], `${l.id}: ${l.from}° to ${l.to}°, ${face ? `the ${face} face` : 'the whole cut'}`);
    check(Boolean(outer) && inside(l.anchor, outer) && (!inner || !inside(l.anchor, inner)), `${l.id}: its leader's anchor (${l.anchor.join(', ')}) lies in its band`);
  }
  for (let k = 1; k < shape.length; k++) check(shape[k].anchor[1] > shape[k - 1].anchor[1], `${shape[k].id}'s anchor lies below ${shape[k - 1].id}'s, so the leaders do not cross`);
}


console.log('\n\n============ seasons (diagram) ============');
{
  const id = 'seasons';
  CHECKED_DIAGRAMS.add(id);
  const dir = path.join(DIAGRAMS_DIR, id);
  const seedFile = path.join(SEASONS_SEEDS, 'seasons.seed.json');
  const seed = readJson(seedFile);
  const seedHash = crypto.createHash('sha256').update(fs.readFileSync(seedFile)).digest('hex');
  check(seedHash === SEASONS_SEED_SHA256, `the seed is the approved one: SHA-256 ${seedHash.slice(0, 12)}… (pinned ${SEASONS_SEED_SHA256.slice(0, 12)}…)`);
  const descriptor = readJson(path.join(dir, 'descriptor.json'));
  const data = readJson(path.join(dir, descriptor.data));
  const view = descriptor.views.find((v) => v.type === 'orbit');
  const manifest = view ? readJson(path.join(dir, view.art)) : { sun: { files: {} }, earth: { files: {} } };
  const ui = seed.ui;
  const positions = Object.values(seed.positions).sort((a, b) => a.order - b.order);

  // ---- the descriptor ---------------------------------------------------------
  console.log('\n---- descriptor ----');
  check(descriptor.id === id && descriptor.language === 'bn' && descriptor.section === 'misc', `descriptor: id ${descriptor.id}, language ${descriptor.language}, section ${descriptor.section}`);
  check(descriptor.title?.bn === seed.titleBn && descriptor.title?.en === seed.titleEn, `title is the seed's: «${descriptor.title?.bn}» / ${descriptor.title?.en}`);
  const modules = [...(fs.readFileSync(path.join(VISUAL_DIR, 'app.js'), 'utf8').match(/const VIEW_MODULES = \{([^}]*)\}/)?.[1] ?? '').matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1]);
  check(descriptor.views.length === 1 && Boolean(view) && modules.includes('orbit'), `one view, of type orbit, which docs/visual/app.js has a module for (${descriptor.views.map((v) => v.type).join(', ')})`);
  const wantWords = { picker: ui.pickerPlaceholderBn, close: ui.closeBn, sun: ui.sunLabelBn, tilt: seed.geometry.axisAngleLabelBn, rows: ui.rowOrder.map((key) => ({ key, label: ui.rowLabelsBn[key] })) };
  check(JSON.stringify(descriptor.words) === JSON.stringify(wantWords), `the words are the seed's: «${ui.pickerPlaceholderBn}», «${ui.closeBn}», «${ui.sunLabelBn}», «${seed.geometry.axisAngleLabelBn}», and the rows ${wantWords.rows.map((r) => r.label).join(', ')}`);
  const asked = new Set([...fs.readFileSync(path.join(VISUAL_DIR, 'orbit.js'), 'utf8').matchAll(/\bwords\??\.(\w+)/g)].map((m) => m[1]));
  const given = new Set(Object.keys(descriptor.words ?? {}));
  check([...asked].every((w) => given.has(w)) && [...given].every((w) => asked.has(w)), `the descriptor's words are exactly those orbit.js reads (${[...asked].sort().join(', ')})`);

  // ---- the data ---------------------------------------------------------------
  console.log('\n---- data.json against seasons.seed.json ----');
  const fillIn = (t, p) => t.replace(/\{(\w+)\}/g, (_, k) => p[k]);
  check(JSON.stringify(data.positions.map((p) => p.id)) === JSON.stringify(positions.map((p) => p.id)), `the ${positions.length} positions, in the seed's order: ${data.positions.map((p) => p.id).join(', ')}`);
  const book = { 'june-solstice': 'right', 'september-equinox': 'top', 'december-solstice': 'left', 'march-equinox': 'bottom' };
  for (const p of positions) {
    const got = data.positions.find((d) => d.id === p.id) ?? {};
    const rows = Object.fromEntries(ui.rowOrder.filter((k) => p.rows[k] !== undefined).map((k) => [k, p.rows[k]]));
    const want = { id: p.id, order: p.order, placement: p.placement, dateBn: p.dateBn, nameBn: p.nameBn, title: fillIn(ui.cardTitle, p), item: fillIn(ui.pickerItem, p), rows };
    check(JSON.stringify(got) === JSON.stringify(want), `${p.id}: «${want.title}», rows ${Object.keys(rows).join(', ')}, as the seed has them, nothing else shipped`);
    check(p.placement === book[p.id], `${p.id}: drawn ${p.placement}, where the book's fig. ২.১৯ has it`);
    for (const [k, v] of Object.entries(p.rows)) check(typeof v === 'string' && ui.rowOrder.includes(k) && (p.sources?.[k]?.length ?? 0) > 0, `${p.id}.${k}: filled, placed by ui.rowOrder, and cited`);
  }
  check(data.geometry?.tiltDeg === seed.geometry.axisTiltFromVerticalDeg && data.geometry?.orbitDirection === seed.geometry.orbitDirection, `the axis tilted ${data.geometry?.tiltDeg}°, the orbit ${data.geometry?.orbitDirection}`);
  const wantCredits = ui.creditsBn.map((line, i) => {
    const source = seed.sources[['nctb', 'nasa', 'computed'][i]];
    return { title: line, ...(source?.url ? { url: source.url } : {}), ...(/[ঀ-৿]/.test(line) ? { lang: 'bn' } : {}) };
  });
  check(JSON.stringify(data.credits) === JSON.stringify(wantCredits), `ⓘ shows ui.creditsBn (${ui.creditsBn.length} lines), NCTB and NASA linked, nothing for the art`);
  // Every Bengali string shown is the seed's, or a template of its filled with its own words.
  const gather = (v, into) => (typeof v === 'string' ? into.push(v) : v && typeof v === 'object' ? Object.values(v).forEach((x) => gather(x, into)) : null);
  const fromSeed = [];
  gather(seed, fromSeed);
  const seedStrings = new Set(fromSeed);
  for (const p of positions) seedStrings.add(fillIn(ui.cardTitle, p)).add(fillIn(ui.pickerItem, p));
  const shown = [];
  gather(descriptor, shown);
  gather(data, shown);
  const foreign = shown.filter((v) => /[ঀ-৿]/.test(v) && !seedStrings.has(v));
  check(foreign.length === 0, `every Bengali string shown is the seed's${foreign.length ? `, not: ${foreign.join(' | ')}` : ''}`);

  // ---- the art ------------------------------------------------------------------
  console.log('\n---- the art ----');
  for (const [name, pin] of Object.entries(seed.art.files)) {
    const bytes = fs.readFileSync(path.join(SEASONS_SEEDS, 'art', name));
    check(crypto.createHash('sha256').update(bytes).digest('hex') === pin.sha256, `${name}: the committed file is the one the seed pins (${pin.sha256.slice(0, 12)}…)`);
  }
  const caps = { sun: { '1x': 20 * 1024, '2x': 56 * 1024 }, earth: { '1x': 12 * 1024, '2x': 32 * 1024 } };
  for (const part of ['sun', 'earth']) {
    for (const [k, f] of Object.entries(manifest[part].files)) {
      const file = path.join(dir, f);
      const bytes = fs.existsSync(file) ? fs.statSync(file).size : -1;
      check(bytes > 0 && bytes <= caps[part][k], `${f}: ${bytes} bytes, cap ${caps[part][k]}`);
    }
    const d = manifest[part].disc;
    check(Boolean(d) && d.r > 0 && d.cx > 0 && d.cy > 0 && d.cx < manifest[part].width && d.cy < manifest[part].height, `${part}: its painted disc measured, r ${d?.r} px at (${d?.cx}, ${d?.cy}) in its ${manifest[part].width}×${manifest[part].height} file`);
  }
}

console.log('\n\n============ bangladesh-rivers (diagram) ============');
{
  const id = 'bangladesh-rivers';
  CHECKED_DIAGRAMS.add(id);
  const dir = path.join(DIAGRAMS_DIR, id);
  const seedFile = path.join(BANGLADESH_RIVERS_SEEDS, 'bangladesh-rivers.seed.json');
  const seed = readJson(seedFile);
  const seedHash = crypto.createHash('sha256').update(fs.readFileSync(seedFile)).digest('hex');
  check(seedHash === BANGLADESH_RIVERS_SEED_SHA256, `the seed is the approved one: SHA-256 ${seedHash.slice(0, 12)}… (pinned ${BANGLADESH_RIVERS_SEED_SHA256.slice(0, 12)}…)`);
  const descriptor = readJson(path.join(dir, 'descriptor.json'));
  const data = readJson(path.join(dir, descriptor.data));
  const ui = seed.ui;
  const gather = (v, into) => (typeof v === 'string' ? into.push(v) : v && typeof v === 'object' ? Object.values(v).forEach((x) => gather(x, into)) : null);

  // ---- the descriptor ---------------------------------------------------------
  console.log('\n---- descriptor ----');
  check(descriptor.id === id && descriptor.language === 'bn' && descriptor.section === 'bangladesh', `descriptor: id ${descriptor.id}, language ${descriptor.language}, section ${descriptor.section}`);
  check(descriptor.title?.bn === seed.titleBn && descriptor.title?.en === seed.titleEn, `title is the seed's: «${descriptor.title?.bn}» / ${descriptor.title?.en}`);
  const modules = [...(fs.readFileSync(path.join(VISUAL_DIR, 'app.js'), 'utf8').match(/const VIEW_MODULES = \{([\s\S]*?)\n\};?/)?.[1] ?? '').matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1]);
  const wantViews = [['whole', ui.tabsBn.whole, 'frame-whole.json'], ['bangladesh', ui.tabsBn.bangladesh, 'frame-bangladesh.json']];
  check(
    descriptor.views.length === 2 && wantViews.every(([vid, tab, art], i) => descriptor.views[i].id === vid && descriptor.views[i].tab === tab && descriptor.views[i].art === art && descriptor.views[i].type === 'rivers' && fs.existsSync(path.join(dir, art))) && modules.includes('rivers'),
    `two views of type rivers, tabs «${ui.tabsBn.whole}» and «${ui.tabsBn.bangladesh}», their frames present, and docs/visual/app.js has a module for rivers`,
  );
  const wantWords = { picker: ui.pickerPlaceholderBn, close: ui.closeBn, reset: ui.resetBn, rows: ui.rowOrder.map((key) => ({ key, label: ui.rowLabelsBn[key] })), legend: ui.legendBn };
  check(JSON.stringify(descriptor.words) === JSON.stringify(wantWords), `the words are the seed's: «${ui.pickerPlaceholderBn}», «${ui.closeBn}», the rows ${wantWords.rows.map((r) => r.label).join(', ')}, and the legend`);
  const asked = new Set([...fs.readFileSync(path.join(VISUAL_DIR, 'rivers.js'), 'utf8').matchAll(/\bwords\??\.(\w+)/g)].map((m) => m[1]));
  const given = new Set(Object.keys(descriptor.words ?? {}));
  check([...asked].every((w) => given.has(w)) && [...given].every((w) => asked.has(w)), `the descriptor's words are exactly those rivers.js reads (${[...asked].sort().join(', ')})`);

  // ---- the data ---------------------------------------------------------------
  console.log('\n---- data.json against bangladesh-rivers.seed.json ----');
  const entities = Object.fromEntries(seed.entities.map((e) => [e.id, e]));
  check(JSON.stringify(Object.keys(data.entities)) === JSON.stringify(seed.entities.map((e) => e.id)), `the ${seed.entities.length} lines, in the seed's order: ${Object.keys(data.entities).join(', ')}`);
  const pendingFields = [];
  for (const e of seed.entities) {
    const rows = Object.fromEntries(ui.rowOrder.filter((k) => e.values[k] !== undefined && e.values[k] !== null).map((k) => [k, e.values[k]]));
    const want = { role: e.role, name: e.nameBn, values: rows };
    check(JSON.stringify(data.entities[e.id]) === JSON.stringify(want), `${e.id}: «${e.nameBn}», rows ${Object.keys(rows).join(', ')}, as the seed has them in ui.rowOrder, nothing else shipped`);
    for (const [k, v] of Object.entries(e.values)) {
      if (v === null) pendingFields.push(`${e.id}.values.${k}`);
      else check(typeof v === 'string' && ui.rowOrder.includes(k) && (e.sources?.[k]?.length ?? 0) > 0, `${e.id}.${k}: filled, placed by ui.rowOrder, and cited`);
    }
  }
  check(Object.keys(data.markers).join() === seed.markers.map((m) => m.id).join(), `the ${seed.markers.length} markers, in the seed's order: ${Object.keys(data.markers).join(', ')}`);
  for (const m of seed.markers) {
    const want = { kind: m.kind, entity: m.entity, name: m.nameBn, row: m.row, value: m.valueBn };
    check(JSON.stringify(data.markers[m.id]) === JSON.stringify(want) && m.kind in ui.legendBn && m.row in ui.rowLabelsBn && m.entity in entities && (m.sources?.valueBn?.length ?? 0) > 0 && (m.sources?.nameBn?.length ?? 0) > 0, `${m.id}: «${m.nameBn}» — ${ui.legendBn[m.kind]}, its value the seed's and cited`);
  }
  check(JSON.stringify(data.picker) === JSON.stringify(seed.entities.filter((e) => e.picker).map((e) => ({ key: e.id, label: e.nameBn }))) && data.picker.length === 1, `the picker holds the one entry the pilot has: ${data.picker.map((p) => `${p.key} «${p.label}»`).join(', ')}`);
  const labels = Object.fromEntries(Object.entries(seed.labelsBn).filter(([k]) => !k.startsWith('_')));
  const countries = Object.fromEntries(Object.entries(seed.countries).filter(([k]) => !k.startsWith('_')));
  check(JSON.stringify(data.labels) === JSON.stringify(labels) && JSON.stringify(data.countries) === JSON.stringify(countries), `the ${Object.keys(labels).length} names on the lines and the ${Object.keys(countries).length} countries' are the seed's`);
  const cardNames = new Set([...seed.entities.map((e) => e.nameBn), ...seed.markers.map((m) => m.nameBn), ...seed.continuations.map((c) => c.nameBn), ...String(entities.main.values.alias).split('; ').map((s) => s.replace(/ \(.*\)$/, ''))]);
  const strayLabels = Object.entries(labels).filter(([, t]) => !cardNames.has(t));
  check(strayLabels.length === 0, `every name drawn on a line is a name a card gives${strayLabels.length ? ` — not ${strayLabels.map(([k]) => k).join(', ')}` : ''}`);
  const nullsInData = [];
  const seek = (v, p) => (v === null ? nullsInData.push(p) : v && typeof v === 'object' ? Object.entries(v).forEach(([k, x]) => seek(x, `${p}.${k}`)) : null);
  seek({ descriptor, data }, 'file');
  check(nullsInData.length === 0, `no null is shipped: an unverified value is left out, never shown (${nullsInData.length})`);

  const cited = new Set(['naturalEarth', 'codab', 'osm']);
  const collect = (v) => (Array.isArray(v) ? v.forEach(collect) : v && typeof v === 'object' ? Object.entries(v).forEach(([k, x]) => (k === 'source' && typeof x === 'string' ? cited.add(x) : collect(x))) : null);
  collect([seed.entities, seed.markers, seed.continuations, seed.infoBn.lines]);
  const wantCredits = Object.entries(seed.sources)
    .filter(([key]) => key !== 'user' && cited.has(key))
    .map(([, s]) => ({ title: s.title + (s.creditExtra ?? '') + (s.page ? `, ${ui.pageBn} ${s.page}` : ''), by: s.publisher, url: s.url, ...(/[ঀ-৿]/.test(s.title) ? { lang: 'bn' } : {}) }));
  const notes = [...seed.markers.filter((m) => m.infoBn).map((m) => ({ title: m.infoBn, lang: 'bn', group: 'notes' })), ...seed.infoBn.lines.map((l) => ({ title: l.textBn, lang: 'bn', group: l.group }))];
  const groupsOk = JSON.stringify(data.creditGroups) === JSON.stringify(ui.creditGroupsBn) && Object.keys(ui.creditGroupsBn).join() === 'sources,notes,conflicts' && seed.infoBn.lines.every((l) => l.group === 'notes' || l.group === 'conflicts');
  const firstConflict = seed.infoBn.lines.findIndex((l) => l.group === 'conflicts');
  check(groupsOk && seed.infoBn.lines.slice(firstConflict).every((l) => l.group === 'conflicts'), `ⓘ's three headed blocks: «${ui.creditGroupsBn.sources}» (the sources and the font), «${ui.creditGroupsBn.notes}» (${notes.filter((n) => n.group === 'notes').length} lines), «${ui.creditGroupsBn.conflicts}» (${notes.filter((n) => n.group === 'conflicts').length} lines), each in the seed's order`);
  const unsourced = seed.infoBn.lines.filter((l) => !l.sources?.length || l.sources.some((s) => !(s.source in seed.sources)));
  check(unsourced.length === 0 && seed.infoBn.lines.length > 0, `ⓘ's ${seed.infoBn.lines.length} plain lines each cite a listed source${unsourced.length ? ` — not: ${unsourced.map((l) => l.textBn.slice(0, 20)).join(' | ')}` : ''}`);
  wantCredits.push(...notes);
  check(JSON.stringify(data.credits) === JSON.stringify(wantCredits) && wantCredits.length >= 2, `ⓘ shows every source the data cites, plus Natural Earth, COD-AB and OpenStreetMap, and ${notes.length} note(s) the seed gives a marker, as plain text (${wantCredits.length}); the editor's own verification is not a credit`);
  const entrySeed = seed.markers.find((m) => m.id === 'entry');
  const entryCards = [entrySeed.valueBn, entities.main.values.entry, data.markers.entry.value, data.entities.main.values.entry];
  const infoCites = new Set((entrySeed.sources.infoBn ?? []).map((s) => s.source));
  check(
    entryCards.every((v) => v === 'কুড়িগ্রাম জেলা') && /নাগেশ্বরী/.test(entrySeed.infoBn ?? '') && /উলিপুর/.test(entrySeed.infoBn ?? '') && entrySeed.coordSource.upazila?.adm3 === 'Ulipur' && ['jrcbG13', 'bwdbNW76', 'codab'].every((s) => infoCites.has(s)),
    `the entry row, on the main river's card and the marker's, is the book's «${entrySeed.valueBn}» alone; ⓘ gives JRCB's and BWDB's Nageshwari and the upazila COD-AB gives for the drawn crossing, ${entrySeed.coordSource.upazila?.adm3}, cited`,
  );
  const osm = data.credits.find((c) => /OpenStreetMap/.test(c.title));
  check(Boolean(osm) && /^https:\/\/www\.openstreetmap\.org\/copyright$/.test(osm.url) && /ODbL/.test(osm.by), `ⓘ carries the OpenStreetMap credit as a plain link (${osm?.url}), with its licence (${osm?.by})`);
  const missingSources = [...cited].filter((k) => !(k in seed.sources));
  check(missingSources.length === 0, `every source the data cites is listed in the seed${missingSources.length ? ` — not ${missingSources.join(', ')}` : ''}`);
  // Every Bengali string shown is the seed's, or a heading the picture composes from two of its own.
  const seedStrings = new Set();
  const fromSeed = [];
  gather(seed, fromSeed);
  fromSeed.forEach((s) => seedStrings.add(s));
  for (const m of seed.markers) seedStrings.add(`${m.nameBn} — ${ui.legendBn[m.kind]}`);
  const shown = [];
  gather(descriptor, shown);
  gather({ ...data, credits: [] }, shown);
  const foreign = shown.filter((v) => /[ঀ-৿]/.test(v) && !seedStrings.has(v));
  check(foreign.length === 0, `every Bengali string shown is the seed's${foreign.length ? `, not: ${foreign.join(' | ')}` : ''}`);
  console.log(`pending: ${pendingFields.length} — ${pendingFields.join(', ')}`);
  check(pendingFields.length === 1, `the pending list is the one field the seed holds as null, the main river's length (${pendingFields.length})`);
  // Every branch's card: «সম্পর্ক», «উৎপত্তি», «গতিপথ», and «মিলনস্থল» or «পতিত স্থল» (Prompt 40, 2026-09-29); the main river's gains «গতিপথ».
  const shape = seed.entities.filter((e) => e.role !== 'main').filter((e) => !['relation', 'origin', 'course'].every((k) => k in e.values) || ('confluence' in e.values) === ('mouth' in e.values) || 'parent' in e.values);
  check(shape.length === 0 && 'course' in entities.main.values, `every branch card has «${ui.rowLabelsBn.relation}», «${ui.rowLabelsBn.origin}», «${ui.rowLabelsBn.course}» and one of «${ui.rowLabelsBn.confluence}» / «${ui.rowLabelsBn.mouth}»; the main river's has «${ui.rowLabelsBn.course}»${shape.length ? ` — not: ${shape.map((e) => e.id).join(', ')}` : ''}`);

  // ---- the frames -------------------------------------------------------------
  console.log('\n---- the frames ----');
  const lineIds = ['main', ...Object.keys(seed.geometry.lines)];
  const legendKinds = new Set(Object.keys(ui.legendBn));
  for (const view of descriptor.views) {
    const frame = readJson(path.join(dir, view.art));
    const want = seed.geometry.frames[view.id];
    const drawn = frame.lines.map((l) => l.id);
    const wantLines = want.lines ?? want.fit?.lines;
    check(drawn.length > 0 && drawn.every((l) => lineIds.includes(l)) && wantLines.every((l) => drawn.includes(l)), `${view.id}: draws the lines the seed names for it (${drawn.length}): ${drawn.join(', ')}`);
    check(frame.markers.map((m) => m.id).join() === want.markers.join() && frame.markers.every((m) => m.id in data.markers), `${view.id}: draws the markers the seed names for it (${frame.markers.length}): ${want.markers.join(', ')}`);
    check(frame.labels.every((l) => l.id in data.labels && lineIds.includes(l.line)) && frame.countries.every((c) => c.id in data.countries), `${view.id}: every name it places has its text in data.json (${frame.labels.length} on lines, ${frame.countries.length} countries)`);
    const kinds = new Set([...frame.lines.map((l) => (l.role === 'continuation' ? null : l.role)).filter(Boolean), ...frame.markers.map((m) => data.markers[m.id].kind)]);
    check([...kinds].every((k) => legendKinds.has(k)), `${view.id}: its legend words exist for every kind it draws (${[...kinds].join(', ')})`);
    const cons = frame.connectors ?? [];
    check(cons.every((c) => drawn.includes(c.id) && drawn.includes(c.parent) && ['tributary', 'distributary'].includes(frame.lines.find((l) => l.id === c.id).role) && Number.isInteger(c.m)), `${view.id}: its ${cons.length} connector(s) join a drawn branch to a drawn parent, and carry their length (${cons.map((c) => `${c.id} ${c.m} m`).join(', ') || 'none'})`);
    if (frame.districts) {
      const shared = readJson(path.join(ROOT, 'docs/shared', frame.districts.file));
      const known = new Map(shared.districts.map((d) => [d.pcode, d]));
      const bad = frame.districts.labels.filter((d) => !known.has(d.pcode) || !(d.x >= 0 && d.x <= frame.projection.width && d.y >= 0 && d.y <= frame.projection.height));
      check(bad.length === 0 && frame.districts.labels.length > 0 && shared.districts.length === 64 && shared.districts.every((d) => /[ঀ-৿]/.test(d.bn)), `${view.id}: ${frame.districts.labels.length} district names (${frame.districts.labels.filter((d) => d.always).length} from the opening view), each a district of the shared ${frame.districts.file} (64, every one with its Bengali name), anchored inside the frame`);
    }
    console.log(`     ${view.id}: viewBox 0 0 ${frame.projection.width} ${frame.projection.height}`);
  }
  const sizes = ['descriptor.json', descriptor.data, ...descriptor.views.map((v) => v.art)].map((f) => fs.statSync(path.join(dir, f)).size);
  console.log(`payload: ${sizes.reduce((a, b) => a + b, 0)} bytes (descriptor ${sizes[0]}, data ${sizes[1]}, frames ${sizes[2]} + ${sizes[3]})`);
}

/*
|--------------------------------------------------------------------------
| LIBERATION-WAR-1971 — held to its seed and its traced sectors: the words
| the user approved, the user's decisions, and what the map draws
|--------------------------------------------------------------------------
*/
console.log('\n\n============ liberation-war-1971 ============');
{
  const dir = path.join(MAPS_DIR, 'liberation-war-1971');
  const seed = readJson(path.join(LIBERATION_SEEDS, 'liberation-war-1971.seed.json'));
  const traced = readJson(path.join(LIBERATION_SEEDS, 'sectors.geojson'));
  const descriptor = readJson(path.join(dir, 'descriptor.json'));
  const recs = readJson(path.join(dir, 'records.json'));
  const tabs = readJson(path.join(dir, 'tabs.json'));
  const areas = readJson(path.join(dir, 'sectors.geojson'));
  const ui = seed.ui;
  const TABS = ['sectors', 'forces', 'places', 'birSreshtho'];
  const byTab = (t) => Object.entries(recs).filter(([, r]) => r.tab === t);

  console.log('\n---- the seed ----');
  const nulls = [];
  const walk = (v, p) => {
    if (v === null) nulls.push(p);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!['sources', 'review', 'refs'].includes(k)) walk(x, `${p}.${k}`);
  };
  walk({ ui, sectors: seed.sectors, forces: seed.forces, places: seed.places, birSreshtho: seed.birSreshtho }, 'seed');
  check(nulls.length === 0, `nothing in the seed is pending (${nulls.length})${nulls.length ? ` — ${nulls.join(', ')}` : ''}`);
  // Every value a card shows keeps its source: each field in words, each date.
  const cited = (v) => Array.isArray(v) && v.length > 0 && v.every((c) => c.ref in seed.refs);
  const uncited = [];
  for (const table of TABS)
    for (const [k, r] of Object.entries(seed[table]))
      for (const f of Object.keys(r).filter((f) => (/Bn$/.test(f) && f !== 'commandersNoteBn') || ['dates', 'sectors', 'formed'].includes(f)))
        if (!cited(r.sources?.[f])) uncited.push(`${table}.${k}.${f}`);
  check(uncited.length === 0, `every value the seed shows keeps its source (${uncited.length} without)${uncited.length ? ` — ${uncited.slice(0, 8).join(', ')}` : ''}`);
  const specials = Object.entries(seed.sectors).flatMap(([n, s]) => (s.special ?? []).filter((i) => ['troops', 'guerrillas'].includes(i.key)).map((i) => [n, i]));
  const lone = specials.filter(([, i]) => i.sources.length < 2);
  check(lone.length === 0, `a troop or guerrilla number stands only where two sources give it (the user's decision): ${specials.map(([n, i]) => `${n} ${i.key} ${i.value}`).join(', ')}${lone.length ? ` — alone: ${lone.map(([n, i]) => `${n} ${i.key}`).join(', ')}` : ''}`);

  console.log("\n---- the user's decisions ----");
  const s9 = traced.features.find((f) => f.properties.sector === 9);
  check(Boolean(s9?.properties.reassigned?.includes('Bhola')), 'Bhola is wholly in sector 9 (the book’s «সমগ্র বরিশাল»)');
  const km2 = traced.features.reduce((t, f) => t + f.properties.areaKm2, 0);
  check(traced.features.length === 10 && Math.abs(km2 - 145750) < 150, `the ten traced sectors cover COD-AB's land (${km2} km²; the sectors build measures their overlap and gap)`);
  const THAKURGAON = 'বইয়ের লেখায় ঠাকুরগাঁও ৬ নং সেক্টরের বাইরে; মানচিত্রে বইয়ের মানচিত্র অনুসারে দেখানো।';
  check(['6', '7'].every((n) => recs[`sector-${n}`]?.noteBn === THAKURGAON) && byTab('sectors').filter(([, r]) => r.noteBn).length === 2, 'sectors 6 and 7, and only they, carry the Thakurgaon note');
  const k = seed.places.kalurghat;
  check(recs.kalurghat?.statementBn === `${k.statementBn} (${k.statementCiteBn})` && k.sources.statementBn?.[0]?.ref === 'B8' && k.sources.statementBn[0].page === '২৪', 'Kalurghat: the book’s statement, B8 p. ২৪, with its page on the card');
  check(seed.sectors['4'].hqPoints.length === 1 && recs['sector-4'].hqBn.includes('নাসিমপুর'), 'Nasimpur: in the HQ’s words, with no point');
  const s11 = seed.sectors['11'].commanders;
  check(s11.slice(1).every((c) => !('from' in c) && !('to' in c)) && seed.sectors['11'].special.some((i) => i.value === 'মেজর আবু তাহের ১৪ নভেম্বর আহত হন'), 'sector 11: no dates for Taher and Hamidullah; «মেজর আবু তাহের ১৪ নভেম্বর আহত হন»');
  check(!('formed' in seed.forces.k) && !/[০-৯]{4}/.test(recs['force-k'].formedUnitsBn), 'K Force: no formation date');
  const pointFields = Object.values(descriptor.sources).map((src) => src.geometryFrom).filter(Boolean);
  check(byTab('forces').every(([, r]) => !r.frame && pointFields.every((f) => !(f in r))), 'the forces are cards only: no point, no frame; their battles are card text');

  console.log('\n---- words ----');
  const L = ui.labelsBn;
  const rows = Object.fromEntries(descriptor.sheet.rows.filter((r) => r.label).map((r) => [r.field, r.label]));
  const want = { areaBn: L.sector.area, hqBn: L.sector.hq, commandersBn: L.sector.commanders, specialBn: L.sector.special, commanderBn: L.force.commander, formedUnitsBn: L.force.formedUnits, foughtBn: L.force.fought, dateTextBn: L.place.date, placeBn: L.place.place, rankServiceBn: L.birSreshtho.rankService, sectorBn: L.birSreshtho.sector, martyrdomBn: L.birSreshtho.martyrdom, burialBn: L.birSreshtho.burial };
  const badRows = Object.entries(want).filter(([f, l]) => rows[f] !== l);
  check(badRows.length === 0 && Object.keys(rows).length === Object.keys(want).length, `every card label is the approved draft's (${Object.keys(want).length})${badRows.length ? ` — not ${badRows.map(([f]) => f).join(', ')}` : ''}`);
  check(JSON.stringify(Object.keys(tabs)) === JSON.stringify(TABS) && TABS.every((t) => tabs[t].titleBn === ui.tabsBn[t] && tabs[t].placeholderBn === ui.pickerPlaceholderBn[t]), `tabs.json: the four tabs, their titles and picker prompts the approved draft's (${TABS.map((t) => tabs[t].titleBn).join(' · ')})`);
  check(tabs.sectors.noteBn === ui.sectorNoteBn && TABS.slice(1).every((t) => !('noteBn' in tabs[t])), `the sectors tab's note, «${ui.sectorNoteBn}», on that tab only`);
  check(descriptor.title.bn === ui.titleBn && descriptor.title.en === ui.titleEn, `the title is the approved draft's (${descriptor.title.bn} / ${descriptor.title.en})`);
  const credits = ui.infoCreditsBn.map((c) => `<a href="${c.url}" target="_blank" rel="noopener noreferrer">${c.text}</a>`);
  check(JSON.stringify(descriptor.attribution?.extra) === JSON.stringify(credits), `ⓘ lists the seed's sources (${ui.infoCreditsBn.map((c) => c.text).join('; ')})`);
  const names = byTab('places').filter(([key, r]) => r.nameBn !== seed.places[key].nameBn);
  check(names.length === 0 && byTab('places').length === 16, `the 16 places and events carry the seed's names — the NCTB's where it names one, else the approved draft's${names.length ? ` — not ${names.map(([key]) => key).join(', ')}` : ''}`);

  console.log('\n---- the map ----');
  check(TABS.map((t) => byTab(t).length).join('/') === '11/3/16/7', `records: sectors 11, forces 3, places 16, Bir Sreshtho 7 (${TABS.map((t) => byTab(t).length).join('/')})`);
  const same =
    areas.features.length === 10 &&
    areas.features.every((f) => {
      const t = traced.features.find((x) => `sector-${x.properties.sector}` === f.properties.id);
      return t && JSON.stringify(t.geometry) === JSON.stringify(f.geometry);
    });
  check(same, "the map's ten sector areas are the traced outlines, unchanged");
  const flags = byTab('sectors').filter(([, r]) => r.hqAt).map(([key]) => key);
  check(flags.length === 10 && !flags.includes('sector-10'), `every sector but 10 has its HQ flag (${flags.length}), those in India included`);
  const ports = readJson(path.join(dir, 'ports.geojson')).features;
  check(ports.length === 4 && ports.every((f) => f.properties.id === 'sector-10') && !areas.features.some((f) => f.properties.id === 'sector-10'), 'sector 10: no area, and its four ports anchored');
  check(byTab('birSreshtho').every(([, r]) => Array.isArray(r.burialAt)), 'every Bir Sreshtho has a star at the current burial place (7)');
  const placeIds = new Set(readJson(path.join(dir, 'places.geojson')).features.map((f) => f.properties.id));
  check(byTab('places').every(([key]) => placeIds.has(key)), 'every place and event has its red dot');
  checkMap({ id: 'liberation-war-1971', expectedPending: 0 });
}

/*
|--------------------------------------------------------------------------
| EVERY MAP AND DIAGRAM HAS ITS OWN SECTION — each is held to its sources
| only by a section above, so a folder with none would pass without being
| read.
|--------------------------------------------------------------------------
*/
console.log('\n============ every map and diagram has its own section ============');
{
  const authored = (dir) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'descriptor.json')))
          .map((e) => e.name)
          .sort()
      : [];
  const maps = authored(MAPS_DIR);
  const missing = maps.filter((id) => !CHECKED.has(id));
  for (const id of missing) fail(`${id}: docs/maps/${id}/descriptor.json has no section in tools/verify-descriptor.mjs — write one`);
  if (!missing.length) ok(`all ${maps.length} maps under docs/maps/ have their own section`);
  const diagrams = authored(DIAGRAMS_DIR);
  const missingDiagrams = diagrams.filter((id) => !CHECKED_DIAGRAMS.has(id));
  for (const id of missingDiagrams) fail(`${id}: docs/diagrams/${id}/descriptor.json has no section in tools/verify-descriptor.mjs — write one`);
  if (!missingDiagrams.length) ok(`all ${diagrams.length} diagrams under docs/diagrams/ have their own section`);
}

// ---- done -------------------------------------------------------------------
if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
