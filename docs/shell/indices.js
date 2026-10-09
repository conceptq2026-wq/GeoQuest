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
|   - three pins on the map, each a dot on the country's own point, a thin leader and a label placed clear of the
|     others and inside the map: «১ · name» on the top country, «rank · name» on the bottom one (both pinned where
|     two share it; one «rank · যৌথভাবে n টি দেশ» where more do), «rank · বাংলাদেশ» in vermillion — for a ranking of
|     values only «সর্বনিম্ন/সর্বোচ্চ · name» and «value · বাংলাদেশ»: number first on every pin (IDX-FIX).
|     Bangladesh's label opens the card;
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
let pins = []; // the chosen ranking's pins: { marker, el, kind }
const DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (v) => String(v).replace(/[0-9]/g, (d) => DIGITS[d]);
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

export async function mount(api) {
  shell = api;
  spec = api.descriptor.indices;
  W = spec.words ?? {};
  for (const t of [spec.records, spec.countries]) if (!api.records[t]) throw new Error(`indices: "${t}" is not a records table`);
  if (!spec.tabs?.map || !spec.tabs?.bangladesh) throw new Error('indices: tabs.map and tabs.bangladesh name the two view tabs');
  for (const k of ['bdStat', 'topStat', 'bottomStat', 'valueStat', 'legendTop', 'legendBottom', 'verified', 'source', 'factsNote', 'bdCaption', 'unchanged', 'better', 'worse', 'upNeutral', 'downNeutral', 'basisEdition', 'basisYear']) if (typeof W[k] !== 'string') throw new Error(`indices: words.${k} is missing`);
  await stylesheet(api, './indices.css?v=81f68cbb6a');
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
  // The tab bar is the tabs module's; the open tab is read after its own handler has run.
  const bar = document.querySelector('.map-tabs');
  if (bar) api.own.domHandler(bar, 'click', () => queueMicrotask(syncTab));
  api.onChange(render);
  api.own.mapHandler(api.map, 'move', place);
  // Labels are measured when placed: once the fonts are in, they are placed again (ORGN-3b).
  if (document.fonts) { api.own.domHandler(document.fonts, 'loadingdone', place); document.fonts.ready.then(() => place()); }
  api.own.undo('the indices pins', () => { for (const p of pins) p.marker.remove(); pins = []; });
  render();
  syncTab();
}

const row = () => {
  const key = shell.selection.get(spec.records);
  return key === undefined ? null : { key, ...shell.records[spec.records][key] };
};
const rankText = (r) => (r.bdRank ? `${bn(r.bdRank)}/${bn(r.bdOf)}` : '');

/** The chosen ranking: its pins, its strip, and the card's stat blocks and foot. */
function render() {
  const r = row();
  strip.hidden = !r || r.kind !== 'open';
  for (const p of pins) p.marker.remove();
  pins = makePins(shell, r?.pins ? JSON.parse(r.pins) : []);
  requestAnimationFrame(place);
  card(r);
}

/**
 * A pin per entry ({ kind, text, at, halo? }): a zero-size anchor on the point, its dot, a thin leader and the label,
 * which `placePins` moves. Bangladesh's label ('bd') opens the card. Shared with the org-newest-members module.
 */
export function makePins(shell, list) {
  const pins = [];
  for (const pin of list) {
    // A zero-size anchor on the country's own point: its dot, a thin leader, and the label, which `place` moves.
    const el = document.createElement('div');
    el.className = `ix-pin ix-pin-${pin.kind}${pin.halo ? ' ix-pin-halo' : ''}`;
    el.lang = shell.language ?? 'bn';
    el.innerHTML = '<span class="ix-pin-line"></span><span class="ix-pin-dot"></span><span class="ix-pin-text"></span>';
    const text = el.querySelector('.ix-pin-text');
    text.textContent = pin.text;
    if (pin.kind === 'bd') {
      // Bangladesh's pin opens the card (brings it into view); the top's and the bottom's are labels.
      text.setAttribute('role', 'button');
      text.tabIndex = 0;
      const open = () => {
        if (shell.dom.sheet.hidden) return;
        shell.dom.sheet.scrollIntoView({ block: 'nearest' });
      };
      text.addEventListener('click', open);
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    } else el.setAttribute('aria-hidden', 'true');
    const marker = new shell.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(pin.at).addTo(shell.map);
    pins.push({ marker, el, kind: pin.kind });
  }
  return pins;
}

/*
 * Each label is placed where it lies wholly inside the map and clear of every label placed before it, of every
 * pin's dot and of the map's own controls (ORGN-3b) — above its point, else lower or higher, else beside — and a thin leader joins it to the point. The point
 * itself never moves. Bangladesh's goes first, then the top's, then the bottom's.
 */
function place() {
  placePins(shell, pins, ['bd', 'top', 'bottom']);
}

/** Places the labels of `pins` (from `makePins`), in the order of their kinds. Shared with org-newest-members. */
export function placePins(shell, pins, kinds) {
  if (!pins.length) return;
  const map = shell.map.getContainer().getBoundingClientRect();
  const M = 4, GAP = 4, DOT = 12;
  const placed = [];
  const dots = pins.map((p) => { const c = shell.map.project(p.marker.getLngLat()); return { x: c.x, y: c.y }; });
  // The map's own controls (the zoom and compass column, the tilt button): no label under them (ORGN-3b).
  const controls = [...shell.map.getContainer().querySelectorAll('.maplibregl-ctrl')].map((e) => e.getBoundingClientRect()).filter((q) => q.width && q.height).map((q) => ({ x: q.left - map.left, y: q.top - map.top, w: q.width, h: q.height }));
  const order = [...pins.keys()].sort((a, b) => kinds.indexOf(pins[a].kind) - kinds.indexOf(pins[b].kind));
  const hits = (r, q) => r.x < q.x + q.w + GAP && q.x < r.x + r.w + GAP && r.y < q.y + q.h + GAP && q.y < r.y + r.h + GAP;
  for (const i of order) {
    const p = pins[i];
    const text = p.el.querySelector('.ix-pin-text');
    const w = text.offsetWidth, h = text.offsetHeight;
    const at = dots[i];
    const tries = [];
    for (const dy of [-(h + 14), -(h + 40), 14, 40, -(h + 66), 66, -(h + 92), 92]) for (const dx of [-w / 2, -w / 2 - 50, -w / 2 + 50, -w / 2 - 100, -w / 2 + 100]) tries.push([dx, dy]);
    // Further out, where the near places are all taken (a small map, ORGN-3b).
    for (const dy of [-(h + 118), 118, -(h + 144), 144]) for (const dx of [-w / 2, -w / 2 - 50, -w / 2 + 50, -w / 2 - 100, -w / 2 + 100, -w / 2 - 150, -w / 2 + 150]) tries.push([dx, dy]);
    let best = null;
    // First clear of every label, control and dot; then, if none is, clear of labels and controls but over a dot.
    for (const strict of [true, false]) {
      for (const [dx, dy] of tries) {
        let r = { x: at.x + dx, y: at.y + dy, w, h };
        // Slid back inside the map where it would cross an edge.
        r.x = Math.min(Math.max(r.x, M), map.width - M - w);
        if (r.y < M || r.y + h > map.height - M) continue;
        if (placed.some((q) => hits(r, q)) || controls.some((q) => hits(r, q))) continue;
        if (strict && dots.some((d, j) => j !== i && hits(r, { x: d.x - DOT / 2, y: d.y - DOT / 2, w: DOT, h: DOT }))) continue;
        best = r;
        break;
      }
      if (best) break;
    }
    // Still none (a point off a small map): the clear place anywhere in the map nearest the point (ORGN-3b).
    if (!best) {
      let near = Infinity;
      for (let y = M; y <= map.height - M - h; y += 6) for (let x = M; x <= map.width - M - w; x += 6) {
        const r = { x, y, w, h };
        if (placed.some((q) => hits(r, q)) || controls.some((q) => hits(r, q))) continue;
        const d = Math.hypot(x + w / 2 - at.x, y + h / 2 - at.y);
        if (d < near) { near = d; best = r; }
      }
    }
    best ??= { x: Math.min(Math.max(at.x - w / 2, M), map.width - M - w), y: Math.min(Math.max(at.y - h - 14, M), map.height - M - h), w, h };
    placed.push(best);
    p.el.dataset.placed = JSON.stringify([Math.round(best.x), Math.round(best.y), w, h]);
    text.style.left = `${Math.round(best.x - at.x)}px`;
    text.style.top = `${Math.round(best.y - at.y)}px`;
    // The leader: from the point to the nearest point of the label's edge.
    const tx = Math.min(Math.max(at.x, best.x), best.x + w) - at.x, ty = Math.min(Math.max(at.y, best.y), best.y + h) - at.y;
    const line = p.el.querySelector('.ix-pin-line');
    line.style.width = `${Math.hypot(tx, ty)}px`;
    line.style.transform = `rotate(${Math.atan2(ty, tx)}rad)`;
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
    r.bdRank ? block(rankText(r), r.bdLabel ?? W.bdStat, 'ix-stat-bd') : block(r.bdValue, W.valueStat, 'ix-stat-bd'),
    block(r.topName, r.topLabel ?? W.topStat, 'ix-stat-top'),
    block(r.bottomName, r.bottomLabel ?? W.bottomStat, 'ix-stat-bottom'),
  );
  const sub = shell.dom.sheetSubtitle;
  sub.after(stats);
  // A ranking's own note (IDX-ALL), and a facts-only ranking's: its full list is not shown.
  const lines = [r.note, r.kind === 'facts' ? W.factsNote : null].filter(Boolean);
  if (lines.length) {
    note = document.createElement('div');
    note.lang = shell.language ?? 'bn';
    for (const line of lines) {
      const p = document.createElement('p');
      p.className = 'ix-note';
      p.textContent = line;
      note.append(p);
    }
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
    // Read from secondary sources (IDX-ALL): «সূত্র: outlet (মূল: publisher)».
    a.textContent = `${r.sourceLabel ?? W.source} ↗`;
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
