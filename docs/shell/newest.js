/*
|--------------------------------------------------------------------------
| NEWEST — a shell module: each organisation's newest member
| (org-newest-members, ORGN-3, 2026-10-09)
|
|   newest: { records, tabs: { map, list }, groups: [...], words: { … } }
|
| The descriptor shades the chosen organisation's newest member(s) and
| Bangladesh itself (state lists), frames them (the picker's fitBounds) and
| fills the card's rows, as any map does. This module adds what the shell has
| no term for:
|   - the map in a card of its own, the organisation's card docked under it
|     (beside it from 900 px) — global-indices' page (indices.css), reused —
|     and a legend inside the map's card;
|   - the pins: global-indices' pins (indices.js: makePins, placePins) — a dot
|     on each newest member (up to three) with its name, a halo round a tiny
|     one, and Bangladesh's vermillion dot and «বাংলাদেশ», which opens the card;
|   - three stat tiles: the member count, the newest member(s) — a long name
|     wraps to two lines, then shrinks, never under 14 px — and the order where
|     the data gives one; the marks (a tie, a rejoin, a suspension, a pending
|     withdrawal) under them; a foot with «সর্বশেষ যাচাই» and «সূত্র ↗»;
|   - the list tab: a search field, the group chips (scrolling sideways where
|     they must), one row per organisation — its name, the newest member with a
|     blue dot, the order and the group — and «মোট n টি সংস্থা»; a row opens its
|     organisation on the map tab.
| Loaded only for a map whose descriptor declares `newest`.
|--------------------------------------------------------------------------
*/
import { makePins, placePins } from './indices.js?v=79742f19c4';

let shell;
let spec;
let W;
let page;
let legend;
let list;
let stats;
let marks;
let foot;
let pins = [];
let query = '';
let group = 'all';
const DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (v) => String(v).replace(/[0-9]/g, (d) => DIGITS[d]);
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

export async function mount(api) {
  shell = api;
  spec = api.descriptor.newest;
  W = spec.words ?? {};
  if (!api.records[spec.records]) throw new Error(`newest: "${spec.records}" is not a records table`);
  if (!spec.tabs?.map || !spec.tabs?.list) throw new Error('newest: tabs.map and tabs.list name the two view tabs');
  if (!Array.isArray(spec.groups) || !spec.groups.length) throw new Error('newest: groups lists the groups, in order');
  for (const k of ['count', 'newest', 'order', 'legendNewest', 'legendBangladesh', 'search', 'total', 'verified', 'source']) if (typeof W[k] !== 'string') throw new Error(`newest: words.${k} is missing`);
  for (const g of ['all', ...spec.groups]) if (typeof W.chips?.[g] !== 'string') throw new Error(`newest: words.chips.${g} is missing`);
  await Promise.all([stylesheet(api, './indices.css?v=79742f19c4'), stylesheet(api, './newest.css?v=79742f19c4')]);
  page = api.dom.mapShell.parentElement;
  page.classList.add('has-indices', 'has-newest');
  api.own.undo('the newest page', () => page.classList.remove('has-indices', 'has-newest', 'indices-bd'));

  // The legend, inside the map's card, under the map.
  legend = api.own.node(document.createElement('div'), 'newest legend');
  legend.className = 'on-legend';
  legend.lang = api.language ?? 'bn';
  for (const [cls, label] of [['on-key-newest', W.legendNewest], ['on-key-bd', W.legendBangladesh]]) {
    const item = document.createElement('span');
    item.className = `on-key ${cls}`;
    const swatch = document.createElement('span');
    swatch.className = 'on-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label;
    item.append(swatch, text);
    legend.append(item);
  }
  api.dom.mapShell.querySelector('#map').after(legend);

  list = api.own.node(document.createElement('section'), 'newest list');
  list.className = 'on-list';
  list.lang = api.language ?? 'bn';
  list.hidden = true;
  api.dom.mapShell.after(list);
  buildList();
}

export function install(api) {
  const bar = document.querySelector('.map-tabs');
  if (bar) api.own.domHandler(bar, 'click', () => queueMicrotask(syncTab));
  api.onChange(render);
  api.own.mapHandler(api.map, 'move', place);
  // Labels are measured when placed: once the fonts are in, they are placed again (ORGN-3b).
  if (document.fonts) { api.own.domHandler(document.fonts, 'loadingdone', place); document.fonts.ready.then(() => place()); }
  api.own.undo('the newest pins', () => { for (const p of pins) p.marker.remove(); pins = []; });
  render();
  syncTab();
}

const row = () => {
  const key = shell.selection.get(spec.records);
  return key === undefined ? null : { key, ...shell.records[spec.records][key] };
};
const place = () => placePins(shell, pins, ['bd', 'newest']);

/** The chosen organisation: its pins and the card's tiles, marks and foot. */
function render() {
  const r = row();
  for (const p of pins) p.marker.remove();
  pins = makePins(shell, r?.pins ? JSON.parse(r.pins) : []);
  requestAnimationFrame(place);
  card(r);
}

function card(r) {
  stats?.remove();
  marks?.remove();
  foot?.remove();
  if (!r || shell.dom.sheet.hidden) return;
  stats = document.createElement('div');
  stats.className = 'ix-stats on-stats';
  stats.lang = shell.language ?? 'bn';
  const tile = (value, label, cls) => {
    const b = document.createElement('div');
    b.className = `ix-stat ${cls}`;
    const v = document.createElement('strong');
    v.textContent = value ?? '—';
    const l = document.createElement('span');
    l.textContent = label;
    b.append(v, l);
    return b;
  };
  const name = tile(r.newestText, W.newest, 'on-stat-newest');
  stats.append(tile(r.countText, W.count, 'on-stat-count'), name, tile(r.orderText, W.order, 'on-stat-order'));
  shell.dom.sheetSubtitle.after(stats);
  fitName(name.querySelector('strong'));
  const lines = r.marks ? JSON.parse(r.marks) : [];
  if (lines.length) {
    marks = document.createElement('div');
    marks.className = 'on-marks';
    marks.lang = shell.language ?? 'bn';
    for (const line of lines) {
      const m = document.createElement('span');
      m.className = 'on-mark';
      m.textContent = line;
      marks.append(m);
    }
    stats.after(marks);
  }
  foot = document.createElement('div');
  foot.className = 'ix-foot';
  foot.lang = shell.language ?? 'bn';
  const when = document.createElement('span');
  when.textContent = `${W.verified}: ${r.verified ?? ''}`;
  foot.append(when);
  if (r.url) {
    const a = document.createElement('a');
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `${r.sourceLabel ?? W.source} ↗`;
    foot.append(a);
  }
  shell.dom.rows.after(foot);
}

/** A long name: wrapped onto two lines, then made smaller, a pixel at a time, never under 14 px. */
function fitName(el) {
  el.style.fontSize = '';
  const start = parseFloat(getComputedStyle(el).fontSize);
  for (let size = start; size >= 14; size--) {
    el.style.fontSize = `${size}px`;
    const line = parseFloat(getComputedStyle(el).lineHeight) || size * 1.3;
    if (el.scrollHeight <= line * 2 + 1) break;
  }
}

/** The list tab: the search field, the group chips, one row per organisation, the count. */
function buildList() {
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'on-search';
  search.placeholder = W.search;
  search.setAttribute('aria-label', W.search);
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); filterList(); });
  const chips = document.createElement('div');
  chips.className = 'on-chips';
  chips.setAttribute('role', 'group');
  for (const g of ['all', ...spec.groups]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'on-chip';
    chip.dataset.group = g;
    chip.textContent = W.chips[g];
    chip.setAttribute('aria-pressed', String(g === group));
    chip.addEventListener('click', () => {
      group = g;
      for (const c of chips.children) c.setAttribute('aria-pressed', String(c.dataset.group === g));
      filterList();
    });
    chips.append(chip);
  }
  const rows = document.createElement('div');
  rows.className = 'on-rows';
  for (const [key, r] of Object.entries(shell.records[spec.records])) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'on-row';
    item.dataset.key = key;
    item.dataset.group = r.group;
    item.dataset.find = [r.nameBn, r.nameEn, r.newestText].join(' ').toLowerCase();
    const text = document.createElement('span');
    text.className = 'on-row-text';
    const nm = document.createElement('span');
    nm.className = 'on-row-name';
    nm.textContent = r.nameBn;
    const who = document.createElement('span');
    who.className = 'on-row-newest';
    const dot = document.createElement('span');
    dot.className = 'on-dot';
    dot.setAttribute('aria-hidden', 'true');
    const whoText = document.createElement('span');
    whoText.textContent = r.newestText;
    who.append(dot, whoText);
    text.append(nm, who);
    const side = document.createElement('span');
    side.className = 'on-row-side';
    const order = document.createElement('strong');
    order.className = 'on-row-order';
    order.textContent = r.orderText ?? '';
    const grp = document.createElement('span');
    grp.className = 'on-row-group';
    grp.textContent = r.groupBn;
    side.append(order, grp);
    item.append(text, side);
    item.addEventListener('click', () => {
      document.querySelector(`.map-tab[data-tab="${spec.tabs.map}"]`)?.click();
      const picker = shell.dom.picker;
      picker.value = key;
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    rows.append(item);
  }
  const total = document.createElement('p');
  total.className = 'on-total';
  list.replaceChildren(search, chips, rows, total);
  filterList();
}

function filterList() {
  let n = 0;
  for (const item of list.querySelectorAll('.on-row')) {
    const show = (group === 'all' || item.dataset.group === group) && (!query || item.dataset.find.includes(query));
    item.hidden = !show;
    if (show) n++;
  }
  list.querySelector('.on-total').textContent = fill(W.total, { n: bn(n) });
}

/** The list tab hides the map, its card and the picker row (global-indices' page class), and shows the list. */
function syncTab() {
  const isList = shell.activeTab?.() === spec.tabs.list;
  page.classList.toggle('indices-bd', isList);
  list.hidden = !isList;
  if (!isList) {
    if (!row()) {
      const first = Object.keys(shell.records[spec.records]).find((k) => shell.shown(spec.records, k));
      if (first) {
        shell.dom.picker.value = first;
        shell.dom.picker.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    requestAnimationFrame(() => { shell.map.resize(); place(); });
  }
}

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
