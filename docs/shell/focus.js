/*
|--------------------------------------------------------------------------
| FOCUS — a shell module: the map draws only what the selection is about
|
|   focus: { records, idle: { field, value }, parent, also?: [{ records, field }] }
|
| With nothing selected, the map draws only the records of `records` whose
| `idle.field` holds `idle.value` (the main rivers). With a record selected,
| it draws that record, its descendants — every record whose chain of
| `parent` fields leads to it (its branches, theirs, and so on) — and the
| chain of its own parents up to the one with none (its main river, as
| context; a map styles them through its own state) — nothing else, no
| sibling; everything else is hidden, not greyed.
| A table in `also` follows the records its `field` names (a river's markers
| and labels go with their river); a selected record of such a table puts
| the view on the record it names (a marker's card keeps its river drawn).
|
| Hidden on the map only: the picker and ‹ › still list every record, so any
| river can be chosen from any view. The hiding is the shell's own mechanism
| (a source re-derived with setData); a selection re-derives every source.
|
| Loaded only for a map whose descriptor declares `focus`.
|--------------------------------------------------------------------------
*/

let spec;
let shell;
const also = new Map(); // table -> the field naming a record of spec.records

/** Before the map is built: the opening view already draws only the idle records. */
export function mount(api) {
  shell = api;
  spec = api.descriptor.focus;
  const table = api.records[spec.records];
  if (!table) throw new Error(`focus: "${spec.records}" is not a records table`);
  if (!spec.idle?.field || !spec.parent) throw new Error('focus: idle.field and parent are required');
  for (const [key, row] of Object.entries(table)) {
    const parent = row[spec.parent];
    if (parent != null && !table[parent]) throw new Error(`focus: ${spec.records}.${key}.${spec.parent} names "${parent}", which is not a record`);
  }
  for (const a of spec.also ?? []) {
    if (!api.records[a.records]) throw new Error(`focus: also "${a.records}" is not a records table`);
    also.set(a.records, a.field);
  }
  api.hideOnMap(hidden);
}

/** Once the map is built: every selection redraws what the map shows. */
export function install(api) {
  api.onChange((what) => {
    if (what === 'select') api.refilter();
  });
}

/** The record the view is about: the selected one, or the one a selected mark belongs to (a river's marker). */
function focusKey() {
  const own = shell.selection.get(spec.records);
  if (own !== undefined) return own;
  for (const [table, field] of also) {
    const key = shell.selection.get(table);
    if (key !== undefined) return shell.records[table][key]?.[field];
  }
  return undefined;
}

/** The records drawn now: the idle set, or the focus, its branches and its parents. */
function drawnKeys() {
  const table = shell.records[spec.records];
  const selected = focusKey();
  if (selected === undefined || !table[selected]) {
    return new Set(Object.keys(table).filter((key) => table[key][spec.idle.field] === spec.idle.value));
  }
  // Its descendants, every generation: a record joins once its parent has.
  const keys = new Set([selected]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [key, row] of Object.entries(table)) if (!keys.has(key) && keys.has(row[spec.parent])) (keys.add(key), (grew = true));
  }
  for (let at = table[selected][spec.parent], guard = 0; at != null && guard < 64; at = table[at]?.[spec.parent], guard++) keys.add(at);
  return keys;
}

let cache = null; // the drawn keys, for one selection
let cachedFor;

function hidden(table, key) {
  const selected = focusKey();
  if (!cache || cachedFor !== selected) {
    cache = drawnKeys();
    cachedFor = selected;
  }
  if (table === spec.records) return !cache.has(key);
  const field = also.get(table);
  if (!field) return false;
  const owner = shell.records[table][key]?.[field];
  return owner == null ? false : !cache.has(owner);
}
