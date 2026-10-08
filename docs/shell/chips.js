/*
|--------------------------------------------------------------------------
| CHIPS — a shell module: one tap shows one group of records on the map
|
|   chips: { records, field, from, label, frame? }
|
| The groups are the rows of `from`, in its order, each a chip titled by
| `label` (a value spec on the group's row); a record belongs to the group
| its `field` names. On a map with tabs, a group's row names its tab
| (`tab`), and only the open tab's chips show. A tap on a chip keeps its
| members on the map and takes every other record off it — off the map only:
| the picker and ‹ › still list them (the shell's `hideOnMap`) — so a tap on
| the map can only land on a member; a table the records point at (a shared
| place) stays while a member points at it. The camera goes to the members,
| the union of their `frame` fields. A second tap on the pressed chip, a
| selection outside the group, or another tab clears it. Nothing is kept.
|
| Drawn as one line of pills in the map's top-left corner, clear of the ⓘ
| zone and of the corner controls on the right; each chip a 44 px tap zone,
| 14 px text; the line scrolls sideways when it is longer than the map is
| wide. world-revolutions: the Arab Spring and the Revolutions of 1848.
|
| Loaded only for a map whose descriptor declares `chips`.
|--------------------------------------------------------------------------
*/

let spec;
let shell;
let row;
let active = null; // the pressed group, or null
const buttons = new Map(); // group key -> its chip
let reached = null; // table -> the keys a member points at, for the pressed group

/** Before the map is built: the chips take their corner, and hide what the pressed chip leaves out. */
export async function mount(api) {
  shell = api;
  spec = api.descriptor.chips;
  const groups = api.records[spec.from];
  const table = api.records[spec.records];
  if (!groups || !table) throw new Error(`chips: "${spec.records}" and "${spec.from}" must both be records tables`);
  const counts = {};
  for (const r of Object.values(table)) if (r[spec.field] != null) counts[r[spec.field]] = (counts[r[spec.field]] ?? 0) + 1;
  for (const g of Object.keys(counts)) if (!(g in groups)) throw new Error(`chips: ${spec.records}.${spec.field} takes "${g}", which "${spec.from}" has no row for`);
  for (const g of Object.keys(groups)) if ((counts[g] ?? 0) < 2) throw new Error(`chips: group "${g}" has fewer than two members`);

  await stylesheet(api, './chips.css?v=061f15ed08');
  row = api.own.node(document.createElement('div'), 'chips');
  row.className = 'map-chips';
  row.setAttribute('role', 'toolbar');
  row.lang = api.language ?? 'bn';
  for (const [key, group] of Object.entries(groups)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-chip';
    button.dataset.group = key;
    button.setAttribute('aria-pressed', 'false');
    const pill = document.createElement('span');
    pill.className = 'map-chip-pill';
    pill.textContent = api.valueOf(spec.label, group) ?? key;
    button.append(pill);
    row.append(button);
    buttons.set(key, button);
  }
  api.dom.mapShell.append(row);
  api.hideOnMap(hidden);
  sync();
}

/** Once the map is built: taps on the chips; a selection outside the group, or another tab, clears it. */
export function install(api) {
  api.own.domHandler(row, 'click', (event) => {
    const button = event.target.closest('.map-chip');
    if (!button) return;
    press(button.dataset.group === active ? null : button.dataset.group);
  });
  api.onChange((what) => {
    if (what === 'filter') {
      // Another tab: its own chips, and a pressed chip of the tab left behind released.
      if (active && !visible(active)) press(null);
      else sync();
      return;
    }
    if (what === 'select' && active && !selectionIn(active)) press(null);
  });
}

/** A group pressed, or none: the map redrawn, and the camera on the members. */
function press(group) {
  active = group;
  reached = null;
  sync();
  if (group && !selectionIn(group)) shell.deselect();
  shell.refilter();
  if (group) toMembers(group);
}

/** Only the open tab's chips; the row gone when the tab has none. */
function sync() {
  let any = false;
  for (const [key, button] of buttons) {
    const show = visible(key);
    button.hidden = !show;
    any ||= show;
    button.classList.toggle('active', key === active);
    button.setAttribute('aria-pressed', String(key === active));
  }
  row.hidden = !any;
}

function visible(group) {
  const tab = shell.records[spec.from][group]?.tab;
  return tab === undefined || typeof shell.activeTab !== 'function' || shell.activeTab() === tab;
}

/** The one selection, if any, is a member — or a record a member points at (a shared place). */
function selectionIn(group) {
  for (const [table, key] of shell.selection) {
    if (key === undefined) continue;
    if (table === spec.records) return shell.records[table][key]?.[spec.field] === group;
    return (referenced(group).get(table) ?? new Set()).has(key);
  }
  return true;
}

/** Hidden on the map: with a chip pressed, every record outside its group, and every place no member points at. */
function hidden(table, key) {
  if (!active) return false;
  if (table === spec.records) return shell.records[table][key]?.[spec.field] !== active;
  reached ??= referenced(active);
  const keys = reached.get(table);
  return keys ? !keys.has(key) : false;
}

function referenced(group) {
  const out = new Map();
  const rows = Object.values(shell.records[spec.records]);
  for (const [field, decl] of Object.entries(shell.descriptor.records[spec.records]?.fields ?? {})) {
    if (decl.type !== 'refs' || decl.to === spec.records) continue;
    const keys = out.get(decl.to) ?? new Set();
    for (const r of rows) if (r[spec.field] === group) for (const ref of r[field] ?? []) keys.add(ref);
    out.set(decl.to, keys);
  }
  return out;
}

/** The camera on the members: the union of their frames, keeping the student's bearing. */
function toMembers(group) {
  if (!spec.frame || !shell.map) return;
  const frames = Object.values(shell.records[spec.records])
    .filter((r) => r[spec.field] === group && Array.isArray(r[spec.frame]))
    .map((r) => r[spec.frame]);
  if (!frames.length) return;
  const box = frames.reduce((b, f) => [Math.min(b[0], f[0]), Math.min(b[1], f[1]), Math.max(b[2], f[2]), Math.max(b[3], f[3])]);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  shell.map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { bearing: shell.map.getBearing(), duration: still ? 0 : 900, essential: true });
}

/** The module's own styles, beside it in the shell's folder; resolves once they apply. */
function stylesheet(api, href) {
  return new Promise((resolve, reject) => {
    const link = api.own.node(document.createElement('link'), `stylesheet ${href}`);
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = () => reject(new Error(`${href} did not load`));
    document.head.appendChild(link);
  });
}
