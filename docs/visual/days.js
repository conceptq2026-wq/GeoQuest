/*
|--------------------------------------------------------------------------
| THE YEAR WHEEL — «বছরের চাকা», the days Bangladesh observes, month by month.
|--------------------------------------------------------------------------
|
| Loaded only for a view of type `days` (important-days; WHEEL-2, revised by the user's review of 2026-10-08).
| Everything is drawn here, in SVG and HTML: no picture. Two parts, one column under 900 px (centred, at most
| 560 px, from 600 px) and two from 900 px (at most about 1,100 px), the first sticky on the left:
|   - the wheel card: the shared picker row of the twelve months, which goes round (‹ on জানুয়ারি is ডিসেম্বর);
|     ⓘ under it (the shell places it after `data-info-after`); twelve 30° wedges, জানুয়ারি at the top and
|     clockwise, each with its month's name and one marker per kind of day it holds; the chosen month popped out a
|     little, in the one accent; a small «আজ» pill on the outer edge of today's month, at today's place in it (or,
|     where the month's name cannot clear it, stacked with the name and markers — WHEEL-8); the
|     centre a white disc with the chosen month and its count. Static: a choice never turns it. Under it the
|     legend, one quiet line: ● জাতীয় ○ আন্তর্জাতিক.
|   - the list card «<মাস> মাসের দিবসসমূহ»: a row per day, hairlines between — the date (the day's number, or a
|     rule's short form, over its month or weekday), the name, the full rule or the circular's wording where the
|     date is not a plain one, a one-line purpose and the kind's marker; the next day after today lit, with
|     «x দিন পর»; today's day with «আজ». A row with a card (a name, a first year or a purpose) opens it as a
|     sheet and carries a chevron; a row with none is not a button. ✕ (44 px) or Escape closes the sheet.
|
| No year is ever shown. «আজ» is the device's local date, read when the view opens; a rule-based day's date this
| year or next, and a day on another calendar's date where the data gives one, are worked out silently, so the next
| day after 30 December is found in January. Every word shown is the descriptor's or the data's; numbers are
| written in Bengali digits. Markers: জাতীয় a filled dot, আন্তর্জাতিক a hollow ring, the same size everywhere.
*/

import { el, pickerBar, stylesheet, svgEl } from './parts.js?v=3ba9413e94';

// CSS px: the wheel's bounds, the chosen wedge's pop, the gap between wedges, the room kept outside the ring for the
// pop and the «আজ» pill, the inner radius's share of the outer, the markers' size.
const WHEEL = { min: 300, max: 460, pop: 4, gap: 2, margin: 8, inner: 0.47, mark: 9 };
const KIND_ORDER = ['national', 'international'];
const DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (n) => String(n).replace(/\d/g, (d) => DIGITS[d]);
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y, m) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
const dayNo = (y, m, d) => Math.round(Date.UTC(y, m, d) / 86400000);
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

/** A day's date in a year, or null where it has none that year: { m (0–11), d }. Never shown with its year. */
function occurrence(day, y) {
  const t = day.when;
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

/** A kind's marker in SVG, centred on 0,0: জাতীয় a filled dot, আন্তর্জাতিক a ring with a 2 px stroke. */
function marker(kind, size, colour) {
  const c = colour ?? `var(--days-${kind})`;
  if (kind === 'national') return svgEl('circle', { r: size / 2, fill: c });
  return svgEl('circle', { r: size / 2 - 1, fill: 'none', stroke: c, 'stroke-width': 2 });
}
const icon = (kinds, size = WHEEL.mark) => {
  const svg = svgEl('svg', { class: 'days-icon', width: size * kinds.length + 4 * (kinds.length - 1), height: size, 'aria-hidden': 'true' });
  kinds.forEach((k, i) => { const g = svgEl('g', { transform: `translate(${size / 2 + i * (size + 4)} ${size / 2})` }); g.append(marker(k, size)); svg.append(g); });
  return svg;
};

export async function mount(panel, { descriptor, data }) {
  const W = descriptor.words;
  await Promise.all([stylesheet('../shared/picker.css?v=3ba9413e94'), stylesheet('./days.css?v=3ba9413e94')]);
  panel.classList.add('days');
  const MONTHS = W.months;

  // ---- today, and the next day after it ----------------------------------------------------------------------
  const now = new Date();
  const today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  const todayNo = dayNo(today.y, today.m, today.d);
  let chosen = today.m;

  // A month's days, in the order of their dates (this year's, or the month's own order where a day has none).
  const at = (day) => occurrence(day, today.y) ?? occurrence(day, today.y + 1);
  const daysOf = (m) => data.days.filter((day) => day.month === m + 1).map((day) => ({ day, at: at(day) })).sort((a, b) => (a.at?.d ?? 99) - (b.at?.d ?? 99));
  const isToday = (day) => { const o = occurrence(day, today.y); return Boolean(o && o.m === today.m && o.d === today.d); };
  // The next day strictly after today, over this year and the next: its days (more than one may share the date).
  const upcoming = (() => {
    for (const y of [today.y, today.y + 1]) {
      const list = data.days.map((day) => ({ day, o: occurrence(day, y) })).filter((x) => x.o).map((x) => ({ ...x, no: dayNo(y, x.o.m, x.o.d) })).filter((x) => x.no > todayNo);
      if (!list.length) continue;
      const no = Math.min(...list.map((x) => x.no));
      return { ids: new Set(list.filter((x) => x.no === no).map((x) => x.day.id)), inDays: no - todayNo };
    }
    return null;
  })();
  const kindsInMonth = (m) => KIND_ORDER.filter((k) => daysOf(m).some((x) => x.day.kinds.includes(k)));

  // ---- the page ------------------------------------------------------------------------------------------------
  const { bar, row } = pickerBar({
    placeholder: null,
    wrap: true,
    items: MONTHS.map((label, m) => ({ key: String(m + 1), label })),
    current: () => String(chosen + 1),
    choose: (key) => { chosen = Number(key) - 1; render(); },
  });
  bar.querySelector('select').setAttribute('aria-label', W.picker);
  bar.dataset.infoAfter = '';
  const layout = el('div', 'days-layout');
  const side = el('div', 'days-side');
  const wheelCard = el('section', 'days-card days-wheel-card');
  const wheelBox = el('div', 'days-wheel-box');
  const wheel = svgEl('svg', { class: 'days-wheel', role: 'group', 'aria-label': W.wheelLabel });
  wheelBox.append(wheel);
  const legend = el('p', 'days-legend', 'bn');
  for (const k of KIND_ORDER) {
    const item = el('span', 'days-legend-item');
    item.append(icon([k]), document.createTextNode(W.legend[k]));
    legend.append(item);
  }
  wheelCard.append(bar, wheelBox, legend);
  side.append(wheelCard);
  const main = el('div', 'days-main');
  const listCard = el('section', 'days-card days-list-card');
  const listTitle = el('h2', 'days-list-title', 'bn');
  const list = el('div', 'days-list');
  listCard.append(listTitle, list);
  main.append(listCard);
  layout.append(side, main);
  panel.append(layout);

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
  function openSheet(x, from) {
    opener = from;
    sheet.replaceChildren();
    const head = el('div', 'days-sheet-head');
    head.append(tile(x.day));
    const titles = el('div', 'days-sheet-titles');
    const name = el('h2', 'days-sheet-title', 'bn');
    name.id = 'days-sheet-title';
    name.textContent = x.day.nameBn;
    sheet.setAttribute('aria-labelledby', name.id);
    titles.append(name);
    if (x.day.dateText) { const when = el('p', 'days-sheet-when', 'bn'); when.textContent = x.day.dateText; titles.append(when); }
    const kind = el('p', 'days-sheet-kind', 'bn');
    kind.append(icon(x.day.kinds), document.createTextNode(x.day.kinds.map((k) => W.kinds[k]).join(' / ')));
    titles.append(kind);
    const close = el('button', 'days-close');
    close.type = 'button';
    close.setAttribute('aria-label', W.close);
    close.textContent = '✕';
    close.addEventListener('click', closeSheet);
    head.append(titles, close);
    const facts = el('dl', 'days-facts');
    const card = x.day.card ?? {};
    for (const r of W.cardRows) {
      const value = card[r.key];
      if (value === undefined || value === null) continue;
      const item = el('div', r.key === 'source' ? 'days-source' : null);
      const dt = el('dt', null, 'bn');
      dt.textContent = r.label;
      const dd = el('dd', null, r.key === 'englishName' || r.key === 'source' ? 'en' : 'bn');
      if (r.key === 'source') {
        const a = el('a');
        a.href = value.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = value.host;
        dd.append(a);
      } else dd.textContent = r.key === 'firstObserved' ? bn(value) : value;
      item.append(dt, dd);
      facts.append(item);
    }
    sheet.append(el('div', 'days-handle'), head, facts);
    sheet.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add('days-sheet-open');
    close.focus();
  }
  // The date: the day's number over its month; a rule's short form («১ম» over «সোম»); the circular's («১» over «বৈশাখ»).
  function tile(day) {
    const t = el('div', 'days-tile');
    const top = el('b', null, 'bn');
    const bottom = el('span', null, 'bn');
    if (day.tile) [top.textContent, bottom.textContent] = day.tile;
    else { top.textContent = bn(day.when.d); bottom.textContent = MONTHS[day.when.m - 1]; }
    t.append(top, bottom);
    return t;
  }
  const todayPill = () => { const p = el('span', 'days-today', 'bn'); p.textContent = W.today; return p; };

  // ---- the wheel -------------------------------------------------------------------------------------------------
  function drawWheel() {
    // As wide as the card, inside its padding where that leaves less than the minimum.
    const size = Math.round(Math.min(WHEEL.max, Math.max(Math.min(WHEEL.min, wheelCard.clientWidth), wheelBox.clientWidth)));
    const R = Math.floor(size / 2 - WHEEL.margin), r = Math.round(R * WHEEL.inner), c = size / 2;
    wheel.setAttribute('width', size);
    wheel.setAttribute('height', size);
    wheel.setAttribute('viewBox', `0 0 ${size} ${size}`);
    wheel.replaceChildren();
    wheel.dataset.r = r;
    wheel.dataset.ring = R;
    const defs = svgEl('defs');
    defs.innerHTML = '<filter id="days-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="2.5" flood-color="#111827" flood-opacity=".12"/></filter>';
    wheel.append(defs);
    const P = (rad, deg) => [c + rad * Math.cos((deg * Math.PI) / 180), c + rad * Math.sin((deg * Math.PI) / 180)];
    // «আজ»: where its pill sits — today's place in its month, on the outer edge — and how far in from the edge it reaches.
    const todayAng = -105 + 30 * today.m + (30 * (today.d - 0.5)) / daysIn(today.y, today.m);
    // On the smallest wheel (under 340 px, a 320 px screen) the pill is smaller, its text still 14 px, and sits out in
    // the wheel's margin, so a long month's name still finds room beside it (WHEEL-8).
    const small = size < 340;
    const pill = small ? { w: 30, h: 18 } : { w: 34, h: 22 };
    const reach = (deg, w, h) => Math.abs(Math.cos((deg * Math.PI) / 180)) * (w / 2) + Math.abs(Math.sin((deg * Math.PI) / 180)) * (h / 2);
    const wedges = [];
    for (let m = 0; m < 12; m++) {
      const mid = -90 + 30 * m, on = m === chosen;
      const [x0, y0] = P(r, mid - 15), [x1, y1] = P(R, mid - 15), [x2, y2] = P(R, mid + 15), [x3, y3] = P(r, mid + 15);
      const g = svgEl('g', { class: `days-seg${on ? ' chosen' : ''}`, 'data-month': m + 1, tabindex: 0, role: 'button', 'aria-pressed': on, 'aria-label': `${MONTHS[m]}, ${fill(W.count, { n: bn(daysOf(m).length) })}` });
      if (on) { const [dx, dy] = P(WHEEL.pop, mid).map((v) => v - c); g.setAttribute('transform', `translate(${dx} ${dy})`); g.setAttribute('filter', 'url(#days-shadow)'); }
      g.append(svgEl('path', { d: `M${x0} ${y0} L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 0 0 ${x0} ${y0} Z` }));
      const label = svgEl('text', { class: 'days-seg-label', lang: 'bn' });
      label.textContent = MONTHS[m];
      g.append(label);
      const marks = svgEl('g', { class: 'days-seg-marks' });
      const kinds = kindsInMonth(m);
      kinds.forEach((k, i) => { const one = svgEl('g', { transform: `translate(${(i - (kinds.length - 1) / 2) * (WHEEL.mark + 6)} 0)` }); one.append(marker(k, WHEEL.mark, on ? '#fff' : undefined)); marks.append(one); });
      g.append(marks);
      wedges.push({ g, m, mid, label, marks });
    }
    for (const w of wedges) wheel.append(w.g);
    // Each name and its markers, the markers under the name or, where only that fits, over it, at the radius nearest
    // mid-ring, and the least step sideways off the wedge's middle, where both boxes lie wholly inside the wedge (clear
    // of its sides and arcs) and clear of the «আজ» pill — every month's, since near a month's edge the pill reaches into
    // its neighbour. `data-fit` says whether one did. Where some name finds no place with the pill at today's spot (a
    // long name in a narrow wedge, 320 px), the pill moves the least way along today's month's outer edge until every
    // name fits; failing that, it joins today's name and markers, under them or over the name (WHEEL-8).
    const pillAt = (deg) => P(small ? R + WHEEL.margin - reach(deg, pill.w, pill.h) - 1 : R - reach(deg, pill.w, pill.h) + 4 + (today.m === chosen ? WHEEL.pop : 0), deg);
    const inside = (x, y, mid) => {
      const rho = Math.hypot(x - c, y - c);
      const off = Math.abs(((((Math.atan2(y - c, x - c) * 180) / Math.PI - mid) % 360) + 540) % 360 - 180);
      return rho >= r + 2 && rho <= R - 2 && off < 15 && rho * Math.sin(((15 - off) * Math.PI) / 180) >= WHEEL.gap / 2;
    };
    const within = (boxes, mid) => boxes.every(([a, b, d, e]) => inside(a, b, mid) && inside(d, b, mid) && inside(a, e, mid) && inside(d, e, mid));
    // [the name's centre, the markers' centre], from the point placed: under, then over; with the pill, [name, markers,
    // pill]: the pill under the markers, or over the name.
    const ORDERS = [[-6, 11], [6, -11]];
    const STACKS = [[-22.5, -6, 11.5], [6.5, 23, -16.5]];
    const sizes = wedges.map((w) => [w.label.getBBox().width, w.marks.getBBox().width]);
    const midR = (r + R) / 2;
    // Every name's place for one place of the pill ([x, y]), or with the pill stacked in today's month (stack).
    const placeAll = ([qx, qy], stack) => {
      const pillBox = [qx - pill.w / 2 - 2, qy - pill.h / 2 - 2, qx + pill.w / 2 + 2, qy + pill.h / 2 + 2];
      return wedges.map((w, i) => {
        const [lw, mw] = sizes[i];
        const sx = -Math.sin((w.mid * Math.PI) / 180), sy = Math.cos((w.mid * Math.PI) / 180);
        const at = (rad, side) => { const [x, y] = P(rad, w.mid); return [x + side * sx, y + side * sy]; };
        const [ox, oy] = w.m === chosen ? P(WHEEL.pop, w.mid).map((v) => v - c) : [0, 0];
        const three = stack && w.m === today.m;
        const fits = (rad, o, side) => {
          const [x, y] = at(rad, side);
          const boxes = [[x - lw / 2, y + o[0] - 10, x + lw / 2, y + o[0] + 10], [x - mw / 2, y + o[1] - 4.5, x + mw / 2, y + o[1] + 4.5]];
          if (three) boxes.push([x - pill.w / 2, y + o[2] - pill.h / 2, x + pill.w / 2, y + o[2] + pill.h / 2]);
          if (!within(boxes, w.mid)) return false;
          // A popped wedge's boxes are compared where they are drawn.
          return stack || boxes.every(([a, b, d, e]) => a + ox > pillBox[2] || d + ox < pillBox[0] || b + oy > pillBox[3] || e + oy < pillBox[1]);
        };
        let place = [midR, ORDERS[0], 0], fit = false;
        for (let side = 0; side <= 12 && !fit; side += 2) for (let k = 0; k <= R - r && !fit; k++) for (const o of three ? STACKS : ORDERS) for (const t of [midR + k, midR - k]) for (const sd of side ? [side, -side] : [0]) if (!fit && fits(t, o, sd)) { place = [t, o, sd]; fit = true; }
        const [lx, ly] = at(place[0], place[2]);
        return { lx, ly, o: place[1], fit, ...(three && fit ? { pill: [lx + ox, ly + place[1][2] + oy] } : {}) };
      });
    };
    let pillXY = pillAt(todayAng), placed = placeAll(pillXY, false), pillStacked = false;
    if (!placed.every((q) => q.fit)) {
      const lo = -105 + 30 * today.m, hi = lo + 30;
      const edge = (Math.asin(Math.min(1, (pill.w / 2 + 2) / R)) * 180) / Math.PI;
      let found = null;
      for (let step = 1; step <= 30 && !found; step++) for (const s of [1, -1]) {
        const a = todayAng + s * step;
        if (found || a < lo + edge || a > hi - edge) continue;
        const xy = pillAt(a), p = placeAll(xy, false);
        if (p.every((q) => q.fit)) found = [xy, p];
      }
      if (found) [pillXY, placed] = found;
      else { const p = placeAll(pillXY, true); if (p.every((q) => q.fit)) { placed = p; pillXY = p[today.m].pill; pillStacked = true; } }
    }
    const [px, py] = pillXY;
    for (const [i, w] of wedges.entries()) {
      const q = placed[i];
      w.label.setAttribute('x', q.lx);
      w.label.setAttribute('y', q.ly + q.o[0]);
      w.marks.setAttribute('transform', `translate(${q.lx} ${q.ly + q.o[1]})`);
      w.label.dataset.fit = q.fit ? '1' : '0';
    }
    // The chosen wedge drawn last again, so its pop and shadow lie over its neighbours; the copy takes no tap.
    const top = wedges[chosen].g.cloneNode(true);
    for (const a of ['tabindex', 'role', 'aria-pressed', 'aria-label', 'data-month']) top.removeAttribute(a);
    top.setAttribute('aria-hidden', 'true');
    top.classList.add('days-seg-top');
    wheel.append(top);
    const disc = svgEl('circle', { class: 'days-centre', cx: c, cy: c, r: r - 6, filter: 'url(#days-shadow)' });
    const month = svgEl('text', { class: 'days-centre-month', x: c, y: c - 2, lang: 'bn' });
    month.textContent = MONTHS[chosen];
    const count = svgEl('text', { class: 'days-centre-count', x: c, y: c + 24, lang: 'bn' });
    count.textContent = fill(W.count, { n: bn(daysOf(chosen).length) });
    wheel.append(disc, month, count);
    // The month's name 30 px, down to 24 where the disc is narrow.
    for (let fs = 30; fs >= 24; fs--) { month.style.fontSize = `${fs}px`; if (month.getBBox().width <= 2 * (r - 6) - 12) break; }
    month.dataset.room = 2 * (r - 6) - 12;
    // «আজ»: a small pill on today's month's outer edge, at today's place in it — or, where the month's name cannot clear
    // it there, with the name and the markers (`data-stacked`); not a marker.
    const tg = svgEl('g', { class: 'days-today-pill', transform: `translate(${px} ${py})`, 'aria-hidden': 'true', 'data-stacked': pillStacked ? '1' : '0' });
    tg.append(svgEl('rect', { x: -pill.w / 2, y: -pill.h / 2, width: pill.w, height: pill.h, rx: pill.h / 2 }));
    const tt = svgEl('text', { lang: 'bn', y: 1 });
    tt.textContent = W.today;
    tg.append(tt);
    wheel.append(tg);
    for (const w of wedges) {
      const pick = () => { chosen = w.m; render(); wheel.querySelector(`.days-seg[data-month="${w.m + 1}"]`)?.focus(); };
      w.g.addEventListener('click', pick);
      w.g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    }
  }

  // ---- the list --------------------------------------------------------------------------------------------------
  function drawList() {
    listTitle.textContent = fill(W.listTitle, { month: MONTHS[chosen] });
    list.replaceChildren();
    const rows = daysOf(chosen);
    for (const x of rows) {
      const next = upcoming?.ids.has(x.day.id);
      const rowEl = el('div', `days-row${next ? ' next' : ''}${x.day.tappable ? ' tappable' : ''}`);
      rowEl.dataset.day = x.day.id;
      const text = el('div', 'days-row-text');
      const name = el('div', 'days-row-name', 'bn');
      name.textContent = x.day.nameBn;
      text.append(name);
      if (x.day.dateText) { const p = el('div', 'days-row-when', 'bn'); p.textContent = x.day.dateText; text.append(p); }
      if (x.day.purposeBn) { const p = el('div', 'days-row-purpose', 'bn'); p.textContent = x.day.purposeBn; text.append(p); }
      const chips = el('div', 'days-chips');
      if (isToday(x.day)) chips.append(todayPill());
      if (next) { const chip = el('span', 'days-chip', 'bn'); chip.textContent = fill(W.inDays, { n: bn(upcoming.inDays) }); chips.append(chip); }
      if (chips.children.length) text.append(chips);
      rowEl.append(tile(x.day), text, icon(x.day.kinds));
      if (x.day.tappable) {
        rowEl.tabIndex = 0;
        rowEl.setAttribute('role', 'button');
        rowEl.setAttribute('aria-label', `${x.day.dateText ?? `${bn(x.day.when.d)} ${MONTHS[chosen]}`}, ${x.day.nameBn}`);
        rowEl.append(chevron());
        const openIt = () => openSheet(x, rowEl);
        rowEl.addEventListener('click', openIt);
        rowEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(); } });
      }
      list.append(rowEl);
    }
    if (!rows.length) { const empty = el('p', 'days-empty', 'bn'); empty.textContent = W.empty; list.append(empty); }
  }
  const chevron = () => { const s = svgEl('svg', { class: 'days-chevron', width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true' }); s.innerHTML = '<path d="M6 3.5 L10.5 8 L6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'; return s; };

  function render() {
    drawWheel();
    drawList();
    row.render();
    row.sync();
  }
  render();
  // The names are measured to place them: drawn again once both weights of the font are in.
  const fonts = Promise.all(['400', '700'].map((w) => document.fonts.load(`${w} 14px "Noto Sans Bengali"`, W.months.join('')))).then(() => drawWheel());
  let width = wheelCard.clientWidth;
  new ResizeObserver(() => { if (wheelCard.clientWidth !== width) { width = wheelCard.clientWidth; drawWheel(); } }).observe(wheelCard);
  return { ready: fonts.then(() => document.fonts.ready) };
}
