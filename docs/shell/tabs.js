/*
|--------------------------------------------------------------------------
| TABS — a shell module: one records table divided by a field, one part at a
| time
|
|   tabs: { records, field, from, label, placeholder?, note?, frame?, cardsOnly? }
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
| Two words may change with the tab, each a value spec on its row: the
| picker's prompt (`placeholder`), since what it offers changes, and a short
| note in the map's top-left corner (`note`) — a word about what that tab
| draws, shown only while it is open and only where its row has one.
|
| Why a term of its own: recordFilter hides records by a field value too, but
| any number of values at once, from a corner menu. Tabs show exactly one
| value, never none and never all, and are how the map is read, so they sit
| above it. The hiding itself is the shell's, the record filter's mechanism.
|
| Views, not parts (2026-09-30): a `tabs` with no `records` divides nothing —
| every record stays on the map in every tab — and each tab is a view of the
| one map: `frame`, a value spec on the tab's row (a bbox field), is where the
| tab opens, in place of the map's own view. A tab the student picks goes to
| its frame; nothing else changes. The rivers map's «বাংলাদেশে» and «পুরো পথ».
|
| A view tab may say more, by its key in `views` (2026-09-30):
|
|   views: { <tab>: { selectionFrame?, enabledBy?, disabledNote? } }
|
| `selectionFrame` names a bbox field of the selected record: while that tab
| is open, the `fitTab` action (a descriptor's picker and taps run it after
| `select`) frames the record there, and picking the tab with a record
| selected frames it there too — the selection stays. `enabledBy` names a
| boolean field: a selected record holding false disables the tab — greyed,
| still in the bar with its tap zone, aria-disabled; a tap on it does nothing
| — and the tab's `disabledNote` (a value spec on its row) says why, in ⓘ's
| row. A selection that disables the open tab opens the first one left.
| With nothing selected every tab is enabled. The tabs module tells other
| modules the open tab (`activeTab()`): focus rests on a set per tab.
|
| A view tab may also hide part of the map while it is open (2026-10-05):
|
|   views: { <tab>: { hide?: { sources?: [<source>], records?: [{ records, field, value }] } } }
|
| `sources` takes those sources off the map — every layer drawing them, their
| tap zones too — and `records` takes off the map the records whose `field`
| holds `value`, from every source derived from their table (the shell's
| map-only hiding: the picker and ‹ › still list them). Another tab shows them
| again. The rivers map's «বাংলাদেশে» draws only what lies in Bangladesh.
|
| A `records` entry with `picker: true` (2026-10-05) takes its records out of
| the picker and ‹ › too, while that tab is open. Such a record is not chosen
| there: picking the tab with one selected clears the selection and opens the
| tab's own view, and selecting one from anywhere while the tab is open opens
| the first tab that lists it. The rivers map's Bhagirathi and Barak, with no
| piece inside Bangladesh, leave «বাংলাদেশে»'s list.
|
| A view tab may pan within bounds of its own (2026-10-05):
|
|   views: { <tab>: { maxBounds?: [w, s, e, n] } }
|
| While that tab is open the map pans within them, in place of the map's own
| `constraints.maxBounds`, which every other tab keeps; the bounds under the
| card follow. The rivers map's «পুরো পথ» rests on courses to Tibet, wider and
| taller than a phone held upright shows inside the map's own bounds.
|
| Cards only (2026-10-01): `cardsOnly` names tabs whose records have no place
| on the map. While one is open the map, its legend, chips and corner
| controls give way — hidden, not torn down — to a list of the tab's cards in
| the map's own space, each drawn as the sheet draws it (the shell's `card`),
| in the table's order; a tap on one selects it as the picker would, and the
| selected card is marked and scrolled into view. The floating card stays
| away there: the list is the card. world-revolutions' «অ-রাজনৈতিক বিপ্লব»,
| the one exception to "never silently absent" (notes/descriptor.md).
|
| Loaded only for a map whose descriptor declares `tabs`.
|--------------------------------------------------------------------------
*/

let spec;
let shell;
let active;
let bar;
let note; // the active tab's note on the map, where the descriptor asks for one
const buttons = new Map(); // tab key -> its button
let reached = null; // table -> the keys an active record refers to; rebuilt on a change of tab
const disabled = new Set(); // view tabs a selection has disabled
let disabledNote = null; // why, in ⓘ's row
let list = null; // a cards-only tab's list of cards, in the map's space

/** Before the map is built: the bar takes its room, and the first tab hides the rest. */
export async function mount(api) {
  shell = api;
  spec = api.descriptor.tabs;
  const tabs = api.records[spec.from];
  const table = spec.records === undefined ? null : api.records[spec.records];
  if (!tabs || (spec.records !== undefined && !table)) throw new Error(`tabs: "${spec.records}" and "${spec.from}" must both be records tables`);
  const keys = Object.keys(tabs);
  const untabbed = table ? [...new Set(Object.values(table).map((row) => row[spec.field]))].filter((v) => !keys.includes(v)) : [];
  if (untabbed.length) throw new Error(`tabs: ${spec.records}.${spec.field} takes ${untabbed.join(', ')}, which "${spec.from}" has no tab for`);
  active = keys[0];
  for (const k of Object.keys(spec.views ?? {})) if (!keys.includes(k)) throw new Error(`tabs: views names "${k}", which "${spec.from}" has no tab for`);
  if (spec.views && table) throw new Error('tabs: views are for view tabs, which divide no records table');
  for (const [k, view] of Object.entries(spec.views ?? {})) {
    for (const s of view.hide?.sources ?? []) if (!api.descriptor.sources?.[s]) throw new Error(`tabs: views.${k}.hide names source "${s}", which the map does not declare`);
    for (const r of view.hide?.records ?? []) if (!api.records[r.records] || !r.field || (r.picker !== undefined && typeof r.picker !== 'boolean')) throw new Error(`tabs: views.${k}.hide.records needs a records table and a field, and picker, if given, true or false`);
    const b = view.maxBounds;
    if (b !== undefined && !(Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3] && b[1] >= -85 && b[3] <= 85)) throw new Error(`tabs: views.${k}.maxBounds must be [w, s, e, n] within ±85°`);
    if (b !== undefined && !api.descriptor.constraints?.maxBounds) throw new Error(`tabs: views.${k}.maxBounds needs the map's own constraints.maxBounds, which the other tabs keep`);
  }
  // What the open view tab takes off the map: its records here, its sources once the map is built.
  if (Object.values(spec.views ?? {}).some((v) => v.hide?.records?.length)) api.hideOnMap((t, key) => (spec.views[active]?.hide?.records ?? []).some((r) => r.records === t && api.records[t][key]?.[r.field] === r.value));
  // …and, where an entry says `picker`, out of the picker and ‹ › as well.
  if (Object.values(spec.views ?? {}).some((v) => v.hide?.records?.some((r) => r.picker))) api.hide((t, key) => unlisted(active, t, key));
  for (const k of spec.cardsOnly ?? []) if (!keys.includes(k)) throw new Error(`tabs: cardsOnly names "${k}", which "${spec.from}" has no tab for`);
  if (spec.cardsOnly && !table) throw new Error('tabs: cardsOnly is for tabs that divide a records table');
  // Other modules read the open tab; the descriptor's picker and taps frame a selection by it.
  api.activeTab = () => active;
  api.actions.fitTab = (action, context) => fitSelection(action, context);

  await stylesheet(api, './tabs.css?v=80f0f2e223');
  bar = api.own.node(document.createElement('div'), 'tabs');
  bar.className = table ? 'map-tabs' : 'map-tabs view-tabs';
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
  // The tab row on top, the navigation row (‹ picker ›) directly under it, ⓘ's row under that (the
  // user's rule, 2026-10-07; until then the tabs sat between the navigation row and ⓘ). Every map with
  // tabs follows it; a page without tabs is unchanged.
  const navRow = api.dom.picker?.closest('.picker-row');
  if (navRow) navRow.before(bar);
  else api.dom.mapShell.before(bar);
  if (spec.note) {
    note = api.own.node(document.createElement('p'), 'tab note');
    note.className = 'map-tab-note';
    note.hidden = true; // until the map is built and its words are set
    note.lang = api.language ?? 'bn';
    api.dom.mapShell.append(note);
  }
  if (spec.cardsOnly?.length) {
    list = api.own.node(document.createElement('div'), 'card list');
    list.className = 'tab-card-list';
    list.lang = api.language ?? 'bn';
    list.hidden = true;
    api.dom.mapShell.append(list);
  }
  sync();
  if (table) api.hide(hidden);
}

/** Once the map is built: taps on the bar, and a selection in another tab opening it. */
export function install(api) {
  api.own.domHandler(bar, 'click', (event) => {
    const button = event.target.closest('.map-tab');
    if (!button || button.dataset.tab === active || disabled.has(button.dataset.tab)) return;
    leave(button.dataset.tab);
    open(button.dataset.tab);
    frame();
  });
  // Arrow keys move along the bar, as a tab list's should.
  api.own.domHandler(bar, 'keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const keys = [...buttons.keys()].filter((k) => k === active || !disabled.has(k));
    const next = keys[(keys.indexOf(active) + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
    if (next === active) return;
    leave(next);
    open(next);
    frame();
    buttons.get(next).focus();
  });
  words();
  hideSources();
  bound();
  if (list) {
    // A card in the list chooses its record, as the picker would.
    api.own.domHandler(list, 'click', (event) => {
      const card = event.target.closest('.tab-card');
      if (!card) return;
      const picker = (api.descriptor.controls ?? []).find((c) => c.type === 'picker');
      api.runActions(picker?.do ?? [{ action: 'select' }], { table: spec.records, key: card.dataset.key });
    });
    fillList();
  }
  if (spec.views) {
    const row = document.querySelector('.info-credits');
    if (row) {
      disabledNote = api.own.node(document.createElement('p'), 'disabled tab note');
      disabledNote.className = 'tab-disabled-note';
      disabledNote.lang = api.language ?? 'bn';
      disabledNote.hidden = true;
      row.prepend(disabledNote);
    }
  }
  api.onChange((what) => {
    if (what !== 'select') return;
    if (spec.views) {
      enable();
      // The open tab disabled by this selection: the first tab left takes it, framed there.
      if (disabled.has(active)) {
        open([...buttons.keys()].find((k) => !disabled.has(k)));
        queueMicrotask(frame);
        return;
      }
      // A record this tab does not list, chosen from anywhere: the first tab that lists it opens.
      const sel = selected();
      if (sel && unlisted(active, sel.table, sel.key)) {
        const to = [...buttons.keys()].find((k) => !disabled.has(k) && !unlisted(k, sel.table, sel.key));
        if (to) {
          open(to);
          queueMicrotask(frame);
        }
      }
      return;
    }
    if (spec.records === undefined) return;
    const key = api.selection.get(spec.records);
    const tab = key === undefined ? undefined : api.records[spec.records][key]?.[spec.field];
    if (tab !== undefined && tab !== active) open(tab);
    markList();
  });
}

/** A record a tab takes out of its picker and ‹ › (`hide.records[].picker`). */
function unlisted(tab, table, key) {
  return (spec.views?.[tab]?.hide?.records ?? []).some((r) => r.picker && r.records === table && shell.records[table][key]?.[r.field] === r.value);
}

/** Before a tab the student picks opens: a selection it does not list is cleared, so it opens on its own view. */
function leave(tab) {
  const sel = selected();
  if (sel && unlisted(tab, sel.table, sel.key)) shell.deselect();
}

/** The open tab's own pan limit, or the map's. */
function bound() {
  if (!shell.map || !Object.values(spec.views ?? {}).some((v) => v.maxBounds)) return;
  shell.bound(spec.views[active]?.maxBounds ?? null);
}

/** The selected record, from whichever table holds the one selection. */
function selected() {
  for (const [table, key] of shell.selection) if (key !== undefined) return { table, key, row: shell.records[table]?.[key] };
  return null;
}

/** Each view tab enabled or not by the selected record; the note says why where one is not. */
function enable() {
  const sel = selected();
  disabled.clear();
  for (const [key, view] of Object.entries(spec.views ?? {})) if (view.enabledBy && sel?.row?.[view.enabledBy] === false) disabled.add(key);
  sync();
  if (disabledNote) {
    const first = [...disabled][0];
    const text = first ? shell.valueOf(spec.views[first].disabledNote, shell.records[spec.from][first]) : null;
    disabledNote.textContent = text ?? '';
    disabledNote.hidden = !text;
  }
}

/** The open tab's view of the selection, or of its world with nothing selected. */
function frame() {
  const sel = selected();
  if (sel && spec.views) fitSelection({ action: 'fitTab', clear: ['sheet'], duration: 900 }, { table: sel.table, key: sel.key });
  else toWorld();
}

/** fitTab: the selected record framed by the open tab's field for it, else by its own geometry. */
function fitSelection(action, context) {
  const field = spec.views?.[active]?.selectionFrame;
  const row = context.table ? shell.records[context.table]?.[context.key] : null;
  shell.runActions([{ action: 'fitBounds', ...(field && row?.[field] ? { field } : {}), clear: action.clear, duration: action.duration }], context);
}

function open(tab) {
  active = tab;
  reached = null;
  sync();
  shell.refilter();
  words();
  fillList();
  hideSources();
  bound();
}

/** The sources some view tab hides: off the map while that tab is open — their tap zones too — on in any other. */
function hideSources() {
  if (!shell.map || !spec.views) return;
  const named = new Set(Object.values(spec.views).flatMap((v) => v.hide?.sources ?? []));
  if (!named.size) return;
  const off = new Set(spec.views[active]?.hide?.sources ?? []);
  for (const layer of shell.map.getStyle().layers) if (named.has(layer.source)) shell.map.setLayoutProperty(layer.id, 'visibility', off.has(layer.source) ? 'none' : 'visible');
}

/** On a cards-only tab: every card of the tab that is shown, in the table's order, the selected one marked. */
function fillList() {
  if (!list || !spec.cardsOnly?.includes(active)) return;
  const table = shell.records[spec.records];
  list.replaceChildren(...Object.keys(table).filter((key) => shell.shown(spec.records, key)).map((key) => shell.card(spec.records, key)));
  markList();
}

function markList() {
  if (!list || list.hidden) return;
  const key = shell.selection.get(spec.records);
  for (const card of list.children) {
    const on = card.dataset.key === key;
    card.classList.toggle('selected', on);
    if (on) card.setAttribute('aria-current', 'true');
    else card.removeAttribute('aria-current');
    if (on) card.scrollIntoView({ block: 'nearest' });
  }
}

/** The picker's prompt and the note on the map, as the active tab's row gives them. */
function words() {
  if (shell.pickerForTab) shell.pickerForTab(active);
  const row = shell.records[spec.from][active];
  const prompt = spec.placeholder ? shell.dom.picker.querySelector('option[value=""]') : null;
  if (prompt) prompt.textContent = shell.valueOf(spec.placeholder, row) ?? '';
  if (note) {
    const text = shell.valueOf(spec.note, row);
    note.textContent = text ?? '';
    note.hidden = !text;
  }
}

/*
 * Back to the map's own view — the frame it opens on — keeping the student's
 * bearing, as a selection does. Called after the tab has changed, so the map
 * is fitted as it now stands, its card gone with the selection.
 */
function toWorld() {
  const frame = spec.frame ? shell.valueOf(spec.frame, shell.records[spec.from][active]) : null;
  const view = frame ?? shell.descriptor.view?.fitBounds;
  if (!view || !shell.map) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  shell.map.fitBounds([[view[0], view[1]], [view[2], view[3]]], { bearing: shell.map.getBearing(), duration: still ? 0 : 900, essential: true });
}

function sync() {
  const cards = Boolean(spec.cardsOnly?.includes(active));
  shell.dom.mapShell.classList.toggle('cards-only', cards);
  if (list) list.hidden = !cards;
  for (const [key, button] of buttons) {
    const on = key === active;
    button.classList.toggle('active', on);
    button.setAttribute('aria-selected', String(on));
    button.tabIndex = on ? 0 : -1;
    const off = disabled.has(key);
    button.classList.toggle('disabled', off);
    if (off) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
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
