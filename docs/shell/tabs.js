/*
|--------------------------------------------------------------------------
| TABS — a shell module: one records table divided by a field, one part at a
| time
|
|   tabs: { records, field, from, label }
|
| The tabs are the rows of `from`, in its order, each titled by `label` (a
| value spec, as a card's title is); a row's key is a value of
| `records.field`. Only the active tab's records are on the map, in the picker
| and ‹ ›, and in any module that asks the shell what is shown (the timeline).
| A table `records` refers to through a refs field — a city marker — stays
| only while an active record points at it. Card lists are not divided: a
| link on a card to a record in another tab stays, and following it —
| selecting that record, from anywhere — opens its tab. A tab the student
| picks opens on the map's own view, its whole world, rather than on the last
| record's frame; one opened by a selection keeps that selection's frame. The
| first tab is active on every load; nothing is kept.
|
| Why a term of its own: recordFilter hides records by a field value too, but
| any number of values at once, from a corner menu. Tabs show exactly one
| value, never none and never all, and are how the map is read, so they sit
| above it. The hiding itself is the shell's, the record filter's mechanism.
|
| Loaded only for a map whose descriptor declares `tabs`.
|--------------------------------------------------------------------------
*/

let spec;
let shell;
let active;
let bar;
const buttons = new Map(); // tab key -> its button
let reached = null; // table -> the keys an active record refers to; rebuilt on a change of tab

/** Before the map is built: the bar takes its room, and the first tab hides the rest. */
export async function mount(api) {
  shell = api;
  spec = api.descriptor.tabs;
  const tabs = api.records[spec.from];
  const table = api.records[spec.records];
  if (!tabs || !table) throw new Error(`tabs: "${spec.records}" and "${spec.from}" must both be records tables`);
  const keys = Object.keys(tabs);
  const untabbed = [...new Set(Object.values(table).map((row) => row[spec.field]))].filter((v) => !keys.includes(v));
  if (untabbed.length) throw new Error(`tabs: ${spec.records}.${spec.field} takes ${untabbed.join(', ')}, which "${spec.from}" has no tab for`);
  active = keys[0];

  await stylesheet(api, './tabs.css');
  bar = api.own.node(document.createElement('div'), 'tabs');
  bar.className = 'map-tabs';
  bar.setAttribute('role', 'tablist');
  for (const key of keys) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-tab';
    button.lang = api.language ?? 'bn';
    button.setAttribute('role', 'tab');
    button.dataset.tab = key;
    button.textContent = api.valueOf(spec.label, tabs[key]) ?? key;
    bar.appendChild(button);
    buttons.set(key, button);
  }
  api.dom.mapShell.before(bar);
  sync();
  api.hide(hidden);
}

/** Once the map is built: taps on the bar, and a selection in another tab opening it. */
export function install(api) {
  api.own.domHandler(bar, 'click', (event) => {
    const button = event.target.closest('.map-tab');
    if (!button || button.dataset.tab === active) return;
    open(button.dataset.tab);
    toWorld();
  });
  // Arrow keys move along the bar, as a tab list's should.
  api.own.domHandler(bar, 'keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const keys = [...buttons.keys()];
    const next = keys[(keys.indexOf(active) + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
    open(next);
    toWorld();
    buttons.get(next).focus();
  });
  api.onChange((what) => {
    if (what !== 'select') return;
    const key = api.selection.get(spec.records);
    const tab = key === undefined ? undefined : api.records[spec.records][key]?.[spec.field];
    if (tab !== undefined && tab !== active) open(tab);
  });
}

function open(tab) {
  active = tab;
  reached = null;
  sync();
  shell.refilter();
}

/*
 * Back to the map's own view — the frame it opens on — keeping the student's
 * bearing, as a selection does. Called after the tab has changed, so the map
 * is fitted as it now stands, its card gone with the selection.
 */
function toWorld() {
  const view = shell.descriptor.view?.fitBounds;
  if (!view || !shell.map) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  shell.map.fitBounds([[view[0], view[1]], [view[2], view[3]]], { bearing: shell.map.getBearing(), duration: still ? 0 : 900, essential: true });
}

function sync() {
  for (const [key, button] of buttons) {
    const on = key === active;
    button.classList.toggle('active', on);
    button.setAttribute('aria-selected', String(on));
    button.tabIndex = on ? 0 : -1;
  }
}

/** Hidden: a record of another tab, or a record of a referred-to table no active record points at. */
function hidden(table, key) {
  if (table === spec.records) return shell.records[table][key]?.[spec.field] !== active;
  reached ??= referenced();
  const keys = reached.get(table);
  return keys ? !keys.has(key) : false;
}

function referenced() {
  const out = new Map();
  const rows = Object.values(shell.records[spec.records]);
  for (const [field, decl] of Object.entries(shell.descriptor.records[spec.records]?.fields ?? {})) {
    if (decl.type !== 'refs' || decl.to === spec.records) continue;
    const keys = out.get(decl.to) ?? new Set();
    for (const row of rows) if (row[spec.field] === active) for (const ref of row[field] ?? []) keys.add(ref);
    out.set(decl.to, keys);
  }
  return out;
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
