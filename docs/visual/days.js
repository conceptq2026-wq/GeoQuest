/*
|--------------------------------------------------------------------------
| THE YEAR WHEEL — «বছরের চাকা», the days Bangladesh observes, month by month.
|--------------------------------------------------------------------------
|
| Loaded only for a view of type `days` (important-days, 2026-10-08). Everything is drawn here, in SVG and HTML: no
| picture. Top to bottom, after the shared picker row (the shell puts ⓘ under it):
|   - the wheel card: twelve 30° wedges, জানুয়ারি at the top and clockwise, each with its month's name and one
|     marker per kind of day it holds; the chosen month popped out, solid blue, its name white and its markers
|     white outlines; a vermillion ring «আজ» on the outer edge of today's month, at today's place in it; the centre
|     a white disc with the chosen month and its count. Static: a choice never turns it.
|   - the legend: the kinds by colour and shape, one row where it fits at 14 px, else 2 × 2.
|   - the list card «<মাস> মাসের দিবসসমূহ»: a row per day — a date tile, the name, a one-line purpose and the
|     kind's marker; the next day after today lit, with «x দিন পর»; today's day with «আজ».
| A row opens a bottom sheet with the day's card; ✕ (44 px) or Escape closes it.
|
| «আজ» is the device's local date, read when the view opens: nothing is rebuilt for it. The picker lists this year's
| and next year's months, from January to December, opening on today's month (so December rolls over into January);
| a wedge chooses its month in the year shown. A day on
| 29 February appears only in a leap year; a day on another calendar appears only in a year the data dates it.
| Every word shown is the descriptor's or the data's; numbers are written in Bengali digits.
*/

import { el, pickerBar, stylesheet, svgEl } from './parts.js?v=3195e519c0';

// CSS px: the wheel's share of the card's width, the chosen wedge's pop, the gap between wedges.
const WHEEL = { share: 0.86, pop: 6, gap: 3, ringShare: 0.48 };
const KIND_ORDER = ['national', 'international', 'other'];
const DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (n) => String(n).replace(/\d/g, (d) => DIGITS[d]);
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y, m) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
const dayNo = (y, m, d) => Math.round(Date.UTC(y, m, d) / 86400000);
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

/** A day's date in a year, or null where it has none that year: { m (0–11), d }. */
function occurrence(day, y) {
  const t = day.date;
  if (t.type === 'fixed') return t.d <= daysIn(y, t.m - 1) ? { m: t.m - 1, d: t.d } : null;
  if (t.type === 'rule') {
    // The nth (1–5) or the last (-1) given weekday (0 = Sunday) of the month.
    const m = t.m - 1, first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    let d = 1 + ((t.weekday - first + 7) % 7) + 7 * ((t.nth > 0 ? t.nth : 1) - 1);
    if (t.nth < 0) while (d + 7 <= daysIn(y, m)) d += 7;
    return d <= daysIn(y, m) ? { m, d } : null;
  }
  if (t.type === 'dated') {
    const iso = t.dates?.[String(y)];
    if (!iso) return null;
    const [, mm, dd] = iso.split('-').map(Number);
    return { m: mm - 1, d: dd };
  }
  throw new Error(`day ${day.id}: date type "${t.type}"`);
}

/** One kind's marker in SVG, centred on 0,0: a circle, a square, a triangle or the «আজ» ring. */
function marker(kind, size, { hollow = false, colour } = {}) {
  const c = colour ?? `var(--days-${kind})`;
  const h = size / 2, sw = hollow ? 1.8 : 0;
  const style = hollow ? { fill: 'none', stroke: c, 'stroke-width': sw } : { fill: c };
  if (kind === 'national') return svgEl('circle', { r: h - sw / 2, ...style });
  if (kind === 'international') return svgEl('rect', { x: -h + sw / 2, y: -h + sw / 2, width: size - sw, height: size - sw, rx: 1.5, ...style });
  if (kind === 'other') return svgEl('path', { d: `M0 ${-h} L${h} ${h * 0.85} L${-h} ${h * 0.85} Z`, 'stroke-linejoin': 'round', ...style });
  return svgEl('circle', { r: h - 1.8, fill: '#fff', stroke: 'var(--days-today)', 'stroke-width': 3 });
}
const icon = (kinds, size) => {
  const svg = svgEl('svg', { class: 'days-icon', width: size * kinds.length + 4 * (kinds.length - 1), height: size, 'aria-hidden': 'true' });
  kinds.forEach((k, i) => { const g = svgEl('g', { transform: `translate(${size / 2 + i * (size + 4)} ${size / 2})` }); g.append(marker(k, size)); svg.append(g); });
  return svg;
};

export async function mount(panel, { descriptor, data }) {
  const W = descriptor.words;
  await Promise.all([stylesheet('../shared/picker.css?v=3195e519c0'), stylesheet('./days.css?v=3195e519c0')]);
  panel.classList.add('days');
  const MONTHS = W.months;

  // ---- today and the window of twelve months -------------------------------------------------------------------
  const now = new Date();
  const today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  const todayNo = dayNo(today.y, today.m, today.d);
  const months24 = [...Array(24)].map((_, k) => ({ y: today.y + Math.floor(k / 12), m: k % 12 }));
  const keyOf = (w) => `${w.y}-${w.m + 1}`;
  let chosen = months24[today.m];

  const daysOf = (y, m) => data.days.map((day) => ({ day, at: occurrence(day, y) })).filter((x) => x.at && x.at.m === m).sort((a, b) => a.at.d - b.at.d);
  // The next day strictly after today, over this year and the next; and the days that fall today.
  const upcoming = (() => {
    for (const y of [today.y, today.y + 1]) {
      const list = data.days.map((day) => ({ day, at: occurrence(day, y) })).filter((x) => x.at).map((x) => ({ ...x, y, no: dayNo(y, x.at.m, x.at.d) })).filter((x) => x.no > todayNo).sort((a, b) => a.no - b.no);
      if (list.length) return { y, m: list[0].at.m, d: list[0].at.d, inDays: list[0].no - todayNo };
    }
    return null;
  })();
  const kindsInMonth = (y, m) => KIND_ORDER.filter((k) => daysOf(y, m).some((x) => x.day.kinds.includes(k)));

  // ---- the page ------------------------------------------------------------------------------------------------
  const { bar, row } = pickerBar({
    placeholder: null,
    items: months24.map((w) => ({ key: keyOf(w), label: `${MONTHS[w.m]} ${bn(w.y)}` })),
    current: () => keyOf(chosen),
    choose: (key) => { chosen = months24.find((w) => keyOf(w) === key); render(); },
  });
  const wheelCard = el('section', 'days-card days-wheel-card');
  const wheel = svgEl('svg', { class: 'days-wheel', role: 'group', 'aria-label': W.wheelLabel });
  const legend = el('div', 'days-legend');
  wheelCard.append(wheel, legend);
  const listCard = el('section', 'days-card days-list-card');
  const listTitle = el('h2', 'days-list-title', 'bn');
  const list = el('div', 'days-list');
  listCard.append(listTitle, list);
  panel.append(bar, wheelCard, listCard);

  for (const k of [...KIND_ORDER, 'today']) {
    const pill = el('span', 'days-pill', 'bn');
    pill.append(icon([k], 14), document.createTextNode(W.kinds[k]));
    legend.append(pill);
  }

  // ---- the sheet -------------------------------------------------------------------------------------------------
  const backdrop = el('div', 'days-backdrop');
  const sheet = el('section', 'days-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  backdrop.hidden = true;
  sheet.hidden = true;
  document.body.append(backdrop, sheet);
  let opener = null;
  const closeSheet = () => {
    if (sheet.hidden) return;
    sheet.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove('days-sheet-open');
    opener?.focus();
  };
  backdrop.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) { e.stopPropagation(); closeSheet(); } }, true);
  function openSheet(x, y, from) {
    opener = from;
    sheet.replaceChildren();
    const head = el('div', 'days-sheet-head');
    head.append(tile(x.at.d, x.at.m));
    const titles = el('div', 'days-sheet-titles');
    const name = el('h2', 'days-sheet-title', 'bn');
    name.id = 'days-sheet-title';
    name.textContent = x.day.nameBn;
    sheet.setAttribute('aria-labelledby', name.id);
    const kind = el('p', 'days-sheet-kind', 'bn');
    kind.append(icon(x.day.kinds, 14), document.createTextNode(x.day.kinds.map((k) => W.kinds[k]).join(' / ')));
    titles.append(name, kind);
    const close = el('button', 'days-close');
    close.type = 'button';
    close.setAttribute('aria-label', W.close);
    close.textContent = '✕';
    close.addEventListener('click', closeSheet);
    head.append(titles, close);
    const facts = el('dl', 'days-facts');
    const card = x.day.card ?? {};
    for (const r of W.cardRows) {
      const value = r.key === 'theme' ? card.themes?.[String(y)] : card[r.key];
      if (value === undefined || value === null) continue;
      const item = el('div');
      const dt = el('dt', null, 'bn');
      dt.textContent = fill(r.label, { year: bn(y) });
      const dd = el('dd', null, r.key === 'englishName' ? 'en' : 'bn');
      dd.textContent = value;
      item.append(dt, dd);
      facts.append(item);
    }
    sheet.append(el('div', 'days-handle'), head, facts);
    sheet.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add('days-sheet-open');
    close.focus();
  }
  function tile(d, m) {
    const t = el('div', 'days-tile');
    const num = el('b', null, 'bn');
    num.textContent = bn(d);
    const mon = el('span', null, 'bn');
    mon.textContent = MONTHS[m];
    t.append(num, mon);
    return t;
  }

  // ---- the wheel -------------------------------------------------------------------------------------------------
  function drawWheel() {
    const width = wheelCard.clientWidth;
    const size = Math.round(width * WHEEL.share);
    // The ring fills the box; the chosen wedge's pop and the «আজ» ring reach into the card's padding.
    const R = Math.floor(size / 2 - 2), r = Math.round(R * (1 - WHEEL.ringShare)), c = size / 2;
    wheel.setAttribute('width', size);
    wheel.setAttribute('height', size);
    wheel.setAttribute('viewBox', `0 0 ${size} ${size}`);
    wheel.replaceChildren();
    wheel.dataset.r = r;
    wheel.dataset.ring = R;
    const defs = svgEl('defs');
    defs.innerHTML = '<filter id="days-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0f2a4a" flood-opacity=".18"/></filter>';
    wheel.append(defs);
    const P = (rad, deg) => [c + rad * Math.cos((deg * Math.PI) / 180), c + rad * Math.sin((deg * Math.PI) / 180)];
    const wedges = [];
    for (let m = 0; m < 12; m++) {
      const mid = -90 + 30 * m, on = m === chosen.m, Ro = R;
      const [x0, y0] = P(r, mid - 15), [x1, y1] = P(Ro, mid - 15), [x2, y2] = P(Ro, mid + 15), [x3, y3] = P(r, mid + 15);
      const g = svgEl('g', { class: `days-seg${on ? ' chosen' : ''}`, 'data-month': m + 1, tabindex: 0, role: 'button', 'aria-pressed': on, 'aria-label': `${MONTHS[m]}, ${fill(W.count, { n: bn(daysOf(chosen.y, m).length) })}` });
      if (on) { const [dx, dy] = P(WHEEL.pop, mid).map((v) => v - c); g.setAttribute('transform', `translate(${dx} ${dy})`); g.setAttribute('filter', 'url(#days-shadow)'); }
      g.append(svgEl('path', { d: `M${x0} ${y0} L${x1} ${y1} A${Ro} ${Ro} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 0 0 ${x0} ${y0} Z` }));
      const label = svgEl('text', { class: 'days-seg-label', lang: 'bn' });
      label.textContent = MONTHS[m];
      g.append(label);
      const marks = svgEl('g', { class: 'days-seg-marks' });
      const kinds = kindsInMonth(chosen.y, m);
      kinds.forEach((k, i) => { const one = svgEl('g', { transform: `translate(${(i - (kinds.length - 1) / 2) * 18} 0)` }); one.append(marker(k, 11, on ? { hollow: true, colour: '#fff' } : {})); marks.append(one); });
      g.append(marks);
      wedges.push({ g, m, mid, label, marks });
    }
    // Each name centred in its wedge, as far out as it needs for its width to fit between the wedge's sides.
    for (const w of wedges) wheel.append(w.g);
    for (const w of wedges) {
      const width = w.label.getBBox().width;
      let rad = (r + R) / 2;
      while (rad < R - 14 && 2 * rad * Math.sin(Math.PI / 12) - WHEEL.gap - 4 < width) rad += 1;
      const [lx, ly] = P(rad, w.mid);
      w.label.setAttribute('x', lx);
      w.label.setAttribute('y', ly - 7);
      w.marks.setAttribute('transform', `translate(${lx} ${ly + 11})`);
      w.label.dataset.room = (2 * rad * Math.sin(Math.PI / 12) - WHEEL.gap).toFixed(1);
    }
    // The chosen wedge drawn last again, so its pop and shadow lie over its neighbours; the copy takes no tap.
    const on = wedges.find((w) => w.m === chosen.m).g.cloneNode(true);
    for (const a of ['tabindex', 'role', 'aria-pressed', 'aria-label', 'data-month']) on.removeAttribute(a);
    on.setAttribute('aria-hidden', 'true');
    on.classList.add('days-seg-top');
    wheel.append(on);
    const disc = svgEl('circle', { class: 'days-centre', cx: c, cy: c, r: r - 6, filter: 'url(#days-shadow)' });
    const month = svgEl('text', { class: 'days-centre-month', x: c, y: c - 4, lang: 'bn' });
    month.textContent = MONTHS[chosen.m];
    const count = svgEl('text', { class: 'days-centre-count', x: c, y: c + 24, lang: 'bn' });
    count.textContent = fill(W.count, { n: bn(daysOf(chosen.y, chosen.m).length) });
    wheel.append(disc, month, count);
    // The month's name 32 px, down to 28 where the disc is narrow.
    for (let fs = 32; fs >= 28; fs--) { month.style.fontSize = `${fs}px`; if (month.getBBox().width <= 2 * (r - 6) - 8) break; }
    month.dataset.room = 2 * (r - 6) - 8;
    // «আজ»: the ring on today's month's outer edge, at today's place in the month.
    const ang = -105 + 30 * today.m + (30 * (today.d - 0.5)) / daysIn(today.y, today.m);
    const [tx, ty] = P(R + (today.m === chosen.m ? WHEEL.pop : 0), ang);
    const ring = svgEl('g', { class: 'days-today-ring', transform: `translate(${tx} ${ty})`, 'aria-hidden': 'true' });
    ring.append(marker('today', 16));
    wheel.append(ring);
    for (const w of wedges) {
      const pick = () => { chosen = { y: chosen.y, m: w.m }; render(); wheel.querySelector(`.days-seg[data-month="${w.m + 1}"]`)?.focus(); };
      w.g.addEventListener('click', pick);
      w.g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    }
  }

  // ---- the list --------------------------------------------------------------------------------------------------
  function drawList() {
    const { y, m } = chosen;
    listTitle.replaceChildren();
    listTitle.append(svgCalendar(), document.createTextNode(fill(W.listTitle, { month: MONTHS[m] })));
    list.replaceChildren();
    const rows = daysOf(y, m);
    for (const x of rows) {
      const isToday = y === today.y && m === today.m && x.at.d === today.d;
      const isNext = upcoming && upcoming.y === y && upcoming.m === m && upcoming.d === x.at.d;
      const rowEl = el('div', `days-row${isNext ? ' next' : ''}`);
      rowEl.tabIndex = 0;
      rowEl.setAttribute('role', 'button');
      rowEl.dataset.day = x.day.id;
      rowEl.setAttribute('aria-label', `${bn(x.at.d)} ${MONTHS[m]}, ${x.day.nameBn}`);
      const text = el('div', 'days-row-text');
      const name = el('div', 'days-row-name', 'bn');
      name.textContent = x.day.nameBn;
      text.append(name);
      if (x.day.purposeBn) { const p = el('div', 'days-row-purpose', 'bn'); p.textContent = x.day.purposeBn; text.append(p); }
      if (isToday) { const chip = el('span', 'days-chip today', 'bn'); chip.append(icon(['today'], 14), document.createTextNode(W.kinds.today)); text.append(chip); }
      if (isNext) { const chip = el('span', 'days-chip', 'bn'); chip.append(svgClock(), document.createTextNode(fill(W.inDays, { n: bn(upcoming.inDays) }))); text.append(chip); }
      rowEl.append(tile(x.at.d, m), text, icon(x.day.kinds, 16));
      const openIt = () => openSheet(x, y, rowEl);
      rowEl.addEventListener('click', openIt);
      rowEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(); } });
      list.append(rowEl);
    }
    if (!rows.length) { const empty = el('p', 'days-empty', 'bn'); empty.textContent = W.empty; list.append(empty); }
  }
  const svgCalendar = () => { const s = svgEl('svg', { class: 'days-title-icon', width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': 'true' }); s.innerHTML = '<rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10 H21 M8 3 V7 M16 3 V7 M7.5 14 H16.5 M7.5 17.5 H12.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'; return s; };
  const svgClock = () => { const s = svgEl('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true' }); s.innerHTML = '<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.5 V8 L10.5 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'; return s; };

  // The legend: one row where all four pills fit at their size, else 2 × 2.
  function layoutLegend() {
    legend.classList.remove('two');
    const pills = [...legend.children];
    const oneRow = legend.scrollWidth <= legend.clientWidth + 0.5 && pills.every((p) => p.offsetTop === pills[0].offsetTop);
    legend.classList.toggle('two', !oneRow);
  }

  function render() {
    drawWheel();
    drawList();
    row.render();
    row.sync();
  }
  render();
  layoutLegend();
  new ResizeObserver(() => { drawWheel(); layoutLegend(); }).observe(wheelCard);
  return { ready: document.fonts.ready };
}
