/*
|--------------------------------------------------------------------------
| INDICES — a shell module: a country ranking map and Bangladesh's place in
| every ranking (global-indices, IDX-2, 2026-10-08)
|
|   indices: { records, countries, tabs: { map, bangladesh }, words: { … } }
|
| The descriptor shades the countries itself, through the chosen ranking's
| state lists (one per shade class, and top, bottom, bd), as any map does.
| This module adds what the shell has no term for:
|   - the map in a card of its own, the ranking's card docked under it (beside
|     it from 900 px), and a শীর্ষ → নিম্ন gradient strip under the map while a
|     fully shaded ranking is chosen;
|   - three pills on the map: «১» on the top country, «নিম্ন» on the bottom one
|     and a vermillion «বাংলাদেশ · rank» on Bangladesh, each at its country's
|     label point;
|   - three stat blocks under the card's title (Bangladesh's rank of N, the
|     top, the bottom — or, for a ranking given as values only, Bangladesh's
|     value), and a foot with «সর্বশেষ যাচাই» and «সূত্র ↗»; a ranking whose
|     full list may not be shown says so in one line;
|   - the «বাংলাদেশ» tab: one row per ranking — its name, «publisher ·
|     edition», Bangladesh's rank of N, a position bar from শীর্ষ to নিম্ন, and a
|     chip for the change since the previous edition (▲/▼ x ধাপ, — অপরিবর্তিত).
|     A row opens its ranking on the map. The map, its card and the picker row
|     are hidden while the tab is open; ⓘ stays, under the tabs.
| Loaded only for a map whose descriptor declares `indices`.
|--------------------------------------------------------------------------
*/

let shell;
let spec;
let W;
let page;
let strip;
let list;
let stats;
let foot;
let note;
const pills = new Map(); // kind -> { marker, el }
const DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (v) => String(v).replace(/[0-9]/g, (d) => DIGITS[d]);
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

export async function mount(api) {
  shell = api;
  spec = api.descriptor.indices;
  W = spec.words ?? {};
  for (const t of [spec.records, spec.countries]) if (!api.records[t]) throw new Error(`indices: "${t}" is not a records table`);
  if (!spec.tabs?.map || !spec.tabs?.bangladesh) throw new Error('indices: tabs.map and tabs.bangladesh name the two view tabs');
  for (const k of ['bdStat', 'topStat', 'bottomStat', 'valueStat', 'pillTop', 'pillBottom', 'bd', 'legendTop', 'legendBottom', 'verified', 'source', 'factsNote', 'bdCaption', 'unchanged', 'better', 'worse', 'upNeutral', 'downNeutral', 'basisEdition', 'basisYear']) if (typeof W[k] !== 'string') throw new Error(`indices: words.${k} is missing`);
  await stylesheet(api, './indices.css?v=7786978f35');
  page = api.dom.mapShell.parentElement;
  page.classList.add('has-indices');
  api.own.undo('the indices page', () => page.classList.remove('has-indices', 'indices-bd'));
  // A row that belongs to the «বাংলাদেশ» tab alone (Dhaka's city ranking) is in no picker and on no map.
  api.hide((table, key) => table === spec.records && Boolean(api.records[table][key]?.bdOnly));

  strip = api.own.node(document.createElement('div'), 'indices legend');
  strip.className = 'ix-strip';
  strip.lang = api.language ?? 'bn';
  strip.innerHTML = '<span class="ix-ramp" aria-hidden="true"></span><span class="ix-ends"><span></span><span></span></span>';
  strip.querySelector('.ix-ends').children[0].textContent = W.legendTop;
  strip.querySelector('.ix-ends').children[1].textContent = W.legendBottom;
  api.dom.mapShell.querySelector('#map').after(strip);

  list = api.own.node(document.createElement('section'), 'indices bangladesh list');
  list.className = 'ix-list';
  list.lang = api.language ?? 'bn';
  list.hidden = true;
  api.dom.mapShell.after(list);
}

export function install(api) {
  for (const kind of ['top', 'bottom', 'bd']) {
    const el = document.createElement('div');
    el.className = `ix-pill ix-pill-${kind}`;
    el.lang = api.language ?? 'bn';
    el.innerHTML = '<span class="ix-pill-text"></span><span class="ix-pill-stem"></span><span class="ix-pill-dot"></span>';
    el.setAttribute('aria-hidden', 'true');
    const marker = api.own.marker(new api.maplibregl.Marker({ element: el, anchor: 'bottom' }), `indices pill ${kind}`);
    pills.set(kind, { marker, el, on: false });
  }
  // The tab bar is the tabs module's; the open tab is read after its own handler has run.
  const bar = document.querySelector('.map-tabs');
  if (bar) api.own.domHandler(bar, 'click', () => queueMicrotask(syncTab));
  api.onChange(render);
  api.own.mapHandler(api.map, 'move', keepInside);
  render();
  syncTab();
}

const row = () => {
  const key = shell.selection.get(spec.records);
  return key === undefined ? null : { key, ...shell.records[spec.records][key] };
};
const country = (code) => shell.records[spec.countries][code] ?? null;
const rankText = (r) => (r.bdRank ? `${bn(r.bdRank)}/${bn(r.bdOf)}` : '');

/** The chosen ranking: its pills, its strip, and the card's stat blocks and foot. */
function render() {
  const r = row();
  strip.hidden = !r || r.kind !== 'open';
  for (const [kind, p] of pills) {
    const code = r ? { top: r.topCode, bottom: r.bottomCode, bd: 'BGD' }[kind] : null;
    const at = code ? country(code)?.labelAt : null;
    const show = Boolean(r && at && !(kind === 'bd' && !r.bdRank && !r.bdValue));
    if (!show) {
      if (p.on) p.marker.remove();
      p.on = false;
      continue;
    }
    p.el.querySelector('.ix-pill-text').textContent = kind === 'bd' ? `${W.bd} · ${r.bdRank ? bn(r.bdRank) : r.bdValue}` : kind === 'top' ? (r.pillTop ?? W.pillTop) : (r.pillBottom ?? W.pillBottom);
    p.marker.setLngLat(at);
    if (!p.on) p.marker.addTo(shell.map);
    p.on = true;
  }
  requestAnimationFrame(keepInside);
  card(r);
}

/** A pill's words stay inside the map: the bubble slides sideways, its stem and dot stay on the country. */
function keepInside() {
  const box = shell.map.getContainer().getBoundingClientRect();
  for (const p of pills.values()) {
    const text = p.el.querySelector('.ix-pill-text');
    text.style.transform = '';
    if (!p.on) continue;
    const r = text.getBoundingClientRect();
    const dx = r.left < box.left + 6 ? box.left + 6 - r.left : r.right > box.right - 6 ? box.right - 6 - r.right : 0;
    if (dx) text.style.transform = `translateX(${Math.round(dx)}px)`;
  }
}

function card(r) {
  stats?.remove();
  foot?.remove();
  note?.remove();
  if (!r || shell.dom.sheet.hidden) return;
  stats = document.createElement('div');
  stats.className = 'ix-stats';
  stats.lang = shell.language ?? 'bn';
  const block = (value, label, cls) => {
    const b = document.createElement('div');
    b.className = `ix-stat ${cls}`;
    const v = document.createElement('strong');
    v.textContent = value ?? '—';
    const l = document.createElement('span');
    l.textContent = label;
    b.append(v, l);
    return b;
  };
  stats.append(
    r.bdRank ? block(rankText(r), W.bdStat, 'ix-stat-bd') : block(r.bdValue, W.valueStat, 'ix-stat-bd'),
    block(r.topName, r.topLabel ?? W.topStat, 'ix-stat-top'),
    block(r.bottomName, r.bottomLabel ?? W.bottomStat, 'ix-stat-bottom'),
  );
  const sub = shell.dom.sheetSubtitle;
  sub.after(stats);
  if (r.kind === 'facts') {
    note = document.createElement('p');
    note.className = 'ix-note';
    note.lang = shell.language ?? 'bn';
    note.textContent = W.factsNote;
    stats.after(note);
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
    a.textContent = `${W.source} ↗`;
    foot.append(a);
  }
  shell.dom.rows.after(foot);
}

/** The «বাংলাদেশ» tab: one row per ranking, in the picker's order, then the rows of that tab alone. */
function fillList() {
  const table = shell.records[spec.records];
  const head = document.createElement('p');
  head.className = 'ix-caption';
  head.textContent = W.bdCaption;
  const box = document.createElement('div');
  box.className = 'ix-rows';
  for (const [key, r] of Object.entries(table)) {
    if (!r.bdRank && !r.bdValue) continue; // nothing verified to show yet
    const item = document.createElement(r.bdOnly ? 'div' : 'button');
    item.className = 'ix-row';
    item.dataset.key = key;
    if (!r.bdOnly) item.type = 'button';
    const name = document.createElement('span');
    name.className = 'ix-row-name';
    name.textContent = r.nameBn;
    const meta = document.createElement('span');
    meta.className = 'ix-row-meta';
    meta.textContent = [r.publisher, r.edition].filter(Boolean).join(' · ');
    const text = document.createElement('span');
    text.className = 'ix-row-text';
    text.append(name, meta);
    const where = document.createElement('span');
    where.className = 'ix-row-where';
    const rank = document.createElement('strong');
    rank.className = 'ix-row-rank';
    rank.textContent = r.bdRank ? rankText(r) : r.bdValue;
    where.append(rank);
    if (r.bdRank && r.bdOf > 1) {
      const bar = document.createElement('span');
      bar.className = 'ix-bar';
      bar.innerHTML = '<span class="ix-bar-track"><span class="ix-bar-fill"></span><span class="ix-bar-dot"></span></span><span class="ix-bar-ends"><span></span><span></span></span>';
      const share = (r.bdRank - 1) / (r.bdOf - 1);
      bar.style.setProperty('--at', `${(share * 100).toFixed(1)}%`);
      bar.querySelector('.ix-bar-ends').children[0].textContent = W.legendTop;
      bar.querySelector('.ix-bar-ends').children[1].textContent = W.legendBottom;
      where.append(bar);
    }
    item.append(text, where);
    if (typeof r.change === 'number') {
      // Better or worse by the ranking's own direction (IDX-3): a move toward rank 1 is «উন্নতি» where rank 1 is the
      // best, «অবনতি» where it is the most affected (CRI); a ranking with neither (population) says which way it moved.
      const n = bn(Math.abs(r.change));
      const better = r.change === 0 ? null : r.goodIs === 'up' ? r.change > 0 : r.goodIs === 'down' ? r.change < 0 : null;
      const chip = document.createElement('span');
      if (r.change === 0) {
        chip.className = 'ix-chip ix-chip-same';
        chip.textContent = `— ${W.unchanged}`;
      } else if (better === null) {
        chip.className = 'ix-chip ix-chip-same';
        chip.textContent = `${r.change > 0 ? '▲' : '▼'} ${fill(r.change > 0 ? W.upNeutral : W.downNeutral, { n })}`;
      } else {
        chip.className = `ix-chip ${better ? 'ix-chip-better' : 'ix-chip-worse'}`;
        chip.textContent = `${better ? '▲' : '▼'} ${fill(better ? W.better : W.worse, { n })}`;
      }
      const basis = document.createElement('span');
      basis.className = 'ix-basis';
      basis.textContent = r.basis === 'year' ? W.basisYear : W.basisEdition;
      const box = document.createElement('span');
      box.className = 'ix-change';
      box.append(chip, basis);
      item.append(box);
    }
    if (!r.bdOnly) {
      item.addEventListener('click', () => {
        document.querySelector(`.map-tab[data-tab="${spec.tabs.map}"]`)?.click();
        const picker = shell.dom.picker;
        picker.value = key;
        picker.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    box.append(item);
  }
  list.replaceChildren(head, box);
}

/** The «বাংলাদেশ» tab hides the map, its card and the picker row, and shows the list. */
function syncTab() {
  const bd = shell.activeTab?.() === spec.tabs.bangladesh;
  page.classList.toggle('indices-bd', bd);
  list.hidden = !bd;
  if (bd) fillList();
  else {
    // Back on the map, a ranking is always chosen and the map fills its card.
    if (!row()) {
      const first = Object.keys(shell.records[spec.records]).find((k) => shell.shown(spec.records, k));
      if (first) {
        shell.dom.picker.value = first;
        shell.dom.picker.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    requestAnimationFrame(() => shell.map.resize());
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
