/*
|--------------------------------------------------------------------------
| TIMELINE — a shell module: records on a year axis under the map, and the
| map's selector
|
|   timeline: { records, at, label?, rowBy?, rowLabel?, colour?, state?, do }
|
| `at` names a year field: each record is a dot at its year, labelled above
| it — `label` (a value spec; the card's title if there is none) over the
| year, in the map's own digits. `rowBy` names a field: one row per value, in
| the order the values first occur, each opening with a chip — `rowLabel`,
| read off the row's first record — in a tint of the row's colour, in a
| column that stays put while the rows scroll sideways. `colour` names a
| style token and one of its paint properties: the colour the map's markers
| take, read from the same expression. Year ticks run along the top and the
| bottom of the rows, both pinned while the rows scroll up and down.
|
| One lane per row, and nothing overlaps. Every dot keeps a TARGET px target
| of its own, drawn or not: dots closer than that — two records of one year —
| move apart sideways, each as little as it can. A label that would touch a
| neighbour's goes below its dot; where labels still touch, the plot widens —
| px-per-year raised to the least at which every label fits — and scrolls
| sideways. Short of that the rows fill the panel's width.
|
| `state` is a source's state vocabulary; a dot in any state is lit. The
| selected dot is larger, ringed in white with a soft glow, its label bold,
| and a dashed line in its colour runs from it down to the bottom axis;
| whatever selected it, it is scrolled into view. A tap runs `do`.
|
| The timeline is the map's selector: a map with one declares no picker, and
| its dots are buttons in time order, so the keyboard walks the years. It
| lays the page out too (timeline.css): the card docks under the map rather
| than floating over it, with a × that clears the selection, and collapses
| while nothing is selected; the panel fits its rows, giving way before the
| map drops under 35% of the screen.
|
| Only the records the shell shows are on it — a tab's, where the map has
| tabs — and it follows every change in what is shown or selected.
|
| Spans, for a later map — a bar from one year to another — take
| `span: { from, to }` in place of `at`. Not built.
|
| Loaded only for a map whose descriptor declares `timeline`.
|--------------------------------------------------------------------------
*/

const TARGET = 24; // px: a dot's tap target, each way, and so the least distance between two dots of a row
const LABEL_H = 28; // px: a dot's label, two lines
const GAP = 3; // px: between a label and its dot's target
const ROW_GAP = 4; // px: between one row and the next
const PAD = 6; // px: above the first row and under the last
const LABEL_SPACE = 6; // px: the least room between two labels side by side
const EDGE = 6; // px: from the plot's edge to the outermost label
const GUTTER_PAD = 8; // px: either side of a chip in its column
const TICK_ROOM = 30; // px: the least room between two year ticks
const TICK_HALF = 14; // px: half a year's label on the axis — none is drawn nearer the plot's edge
const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
const MAX_PER_YEAR = 400; // px: where labels still collide at this, the overlap is reported, not hidden
const TINT = 0.3; // a chip's colour: its row's, this far toward white
const INK = '#16233d'; // a chip's text, dark on its tint
const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';

let spec;
let shell;
let language;
let digits; // a year as the map writes it
let panel;
let scroller; // both ways: the axes, stuck to its top and foot, and the rows between them
let chipsColumn;
let plot;
let guide;
let topTicks;
let bottomTicks;
const corners = [];
let measureName;
let measureYear;
const dots = new Map(); // record key -> { button, label, name, year, colour }
const widths = new Map(); // label text -> its bold width, px
let placed = new Map(); // record key -> where it stands now, in the plot
let gutter = 0;

/** Before the map is built: the panel, laid out for what is shown, takes its room. */
export async function mount(api) {
  shell = api;
  spec = api.descriptor.timeline;
  language = api.language ?? 'bn';
  digits = language === 'bn' ? (n) => String(n).replace(/\d/g, (d) => BENGALI_DIGITS[d]) : String;
  if (spec.span) throw new Error('timeline: spans (`span: { from, to }`) are not built yet');
  if (!spec.at) throw new Error('timeline: `at` names the year field');
  const table = api.records[spec.records];
  if (!table) throw new Error(`timeline: "${spec.records}" is not a records table`);
  // The timeline is the selector: a picker beside it would be a second one.
  if ((api.descriptor.controls ?? []).some((c) => c.type === 'picker'))
    throw new Error('timeline: a map with a timeline declares no picker — the timeline is its selector');

  await stylesheet(api, './timeline.css?v=0c6723562a');
  panel = api.own.node(document.createElement('section'), 'timeline');
  panel.className = 'timeline';
  panel.setAttribute('aria-label', 'Timeline');
  scroller = element('div', 'timeline-scroll');
  const inner = element('div', 'timeline-inner');
  const body = element('div', 'timeline-body');
  chipsColumn = element('div', 'timeline-chips');
  plot = element('div', 'timeline-plot');
  guide = element('div', 'timeline-guide');
  guide.hidden = true;
  const [top, topRow] = axis('top');
  const [bottom, bottomRow] = axis('bottom');
  topTicks = topRow;
  bottomTicks = bottomRow;
  measureName = element('span', 'timeline-measure timeline-dot-name');
  measureYear = element('span', 'timeline-measure timeline-dot-year');
  for (const m of [measureName, measureYear]) m.lang = language;
  plot.appendChild(guide);
  body.append(chipsColumn, plot);
  inner.append(top, body, bottom);
  scroller.appendChild(inner);
  panel.append(scroller, measureName, measureYear);

  // In time order, so the keyboard walks the years: a tab's dots are a run of these.
  const title = (api.descriptor.sheets?.[spec.records] ?? api.descriptor.sheet)?.title;
  const keys = Object.keys(table).filter((key) => Number.isFinite(table[key][spec.at]));
  const seedIndex = new Map(keys.map((key, i) => [key, i]));
  keys.sort((a, b) => table[a][spec.at] - table[b][spec.at] || seedIndex.get(a) - seedIndex.get(b));
  for (const key of keys) {
    const row = table[key];
    const name = api.valueOf(spec.label ?? title, row) ?? key;
    const year = digits(row[spec.at]);
    const colour = colourOf(row);
    const button = element('button', 'timeline-dot');
    button.type = 'button';
    button.dataset.key = key;
    button.lang = language;
    button.setAttribute('aria-label', `${api.valueOf(title, row) ?? name}, ${year}`);
    button.style.setProperty('--glow', glowOf(colour));
    const mark = element('span', 'timeline-dot-mark');
    mark.style.background = colour;
    const label = element('span', 'timeline-dot-label');
    label.setAttribute('aria-hidden', 'true');
    const line1 = element('span', 'timeline-dot-name');
    line1.textContent = name;
    const line2 = element('span', 'timeline-dot-year');
    line2.textContent = year;
    label.append(line1, line2);
    button.append(mark, label);
    plot.appendChild(button);
    dots.set(key, { button, label, name, year, colour });
  }

  api.dom.mapShell.after(panel);
  const page = api.dom.mapShell.parentElement;
  page.classList.add('has-timeline');
  api.own.undo('the timeline page layout', () => page.classList.remove('has-timeline'));
  render();
  // Widths are measured in the page's font; once it has arrived, again.
  document.fonts?.ready.then(() => {
    widths.clear();
    render();
  });
}

/** Once the map is built: taps, the card's close, and every change in what is shown, selected or wide. */
export function install(api) {
  api.own.domHandler(plot, 'click', (event) => {
    const button = event.target.closest('.timeline-dot');
    if (button) api.runActions(spec.do, { table: spec.records, key: button.dataset.key });
  });
  // The docked card's ×: nothing selected, and the map takes the room back.
  const close = api.own.node(element('button', 'timeline-card-close'), 'card close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  api.dom.sheetBody.prepend(close);
  api.own.domHandler(close, 'click', () => api.deselect());
  const kicker = api.dom.kicker;
  api.own.undo('the card chip colour', () => kicker.style.removeProperty('--chip'));
  api.onChange((what) => {
    if (what === 'select') {
      light();
      tintCardChip();
      // The card has just docked, closed or changed: the map's own height with
      // it, told now so the frame that follows in the same tap is fitted to it.
      shell.map?.resize();
    } else render();
    reveal();
  });
  let width = panel.clientWidth;
  api.own.observer(
    new ResizeObserver(() => {
      if (panel.clientWidth === width) return;
      width = panel.clientWidth;
      render();
    }),
    panel,
  );
}

/** Lays out every shown record — chips, rows, dots, labels, both axes — then lights the selection. */
function render() {
  const table = shell.records[spec.records];
  const shown = [...dots.keys()].filter((key) => shell.shown(spec.records, key));
  for (const [key, dot] of dots) dot.button.hidden = !shown.includes(key);
  for (const old of plot.querySelectorAll('.timeline-track')) old.remove();
  chipsColumn.replaceChildren();
  placed = new Map();
  panel.dataset.perYear = '0';
  panel.dataset.overlaps = '';
  panel.dataset.below = '';
  panel.dataset.moved = '';
  if (!shown.length) {
    for (const el of [plot, chipsColumn]) el.style.height = '0';
    for (const ticks of [topTicks, bottomTicks]) ticks.replaceChildren();
    light();
    return;
  }

  // Rows in the order their values first occur among the records, by author;
  // a row's dots by year, and a year's in author order.
  const yearOf = (key) => table[key][spec.at];
  const authorOrder = Object.keys(table);
  const rows = [];
  for (const key of authorOrder) {
    if (!shown.includes(key)) continue;
    const value = spec.rowBy ? (table[key][spec.rowBy] ?? null) : null;
    let row = rows.find((r) => r.value === value);
    if (!row) rows.push((row = { value, keys: [] }));
    row.keys.push(key);
  }
  for (const row of rows) row.keys.sort((a, b) => yearOf(a) - yearOf(b) || authorOrder.indexOf(a) - authorOrder.indexOf(b));

  // The chips first: their column's width is what the rows are left.
  const rowLabel = spec.rowLabel ?? (spec.rowBy ? { field: spec.rowBy } : null);
  for (const row of rows) {
    const first = table[row.keys[0]];
    row.chip = element('span', 'timeline-chip');
    row.chip.lang = language;
    row.chip.textContent = shell.valueOf(rowLabel, first) ?? '';
    row.chip.style.background = tint(dots.get(row.keys[0]).colour);
    row.chip.style.color = INK;
    row.chip.hidden = row.chip.textContent === '';
    chipsColumn.appendChild(row.chip);
    shrinkWrap(row.chip);
  }
  gutter = Math.ceil(Math.max(0, ...rows.map((row) => (row.chip.hidden ? 0 : row.chip.offsetWidth + 2 * GUTTER_PAD))));
  const width = Math.max(0, scroller.clientWidth - gutter);

  const widthOf = new Map(shown.map((key) => [key, labelWidth(key)]));
  const years = shown.map(yearOf);
  const first = Math.min(...years);
  const span = Math.max(...years) - first;
  const layout = (perYear) => arrange(rows, perYear, (key) => (yearOf(key) - first) * perYear, widthOf);

  // The widest scale at which the rows fit the panel's width...
  let perYear = 1;
  if (span > 0) {
    let low = 0;
    let high = Math.max(width, 1) / span;
    while (high - low > 0.05) {
      const mid = (low + high) / 2;
      if (layout(mid).right <= width) low = mid;
      else high = mid;
    }
    perYear = Math.max(low, 0.05);
  }
  let laid = layout(perYear);
  // ...and, where labels touch at it, the least wider one at which none do.
  if (laid.collisions.length && span > 0) {
    let low = perYear;
    let high = Math.min(MAX_PER_YEAR, perYear * 2);
    while (layout(high).collisions.length && high < MAX_PER_YEAR) [low, high] = [high, Math.min(MAX_PER_YEAR, high * 2)];
    if (!layout(high).collisions.length)
      while (high - low > 0.05) {
        const mid = (low + high) / 2;
        if (layout(mid).collisions.length) low = mid;
        else high = mid;
      }
    perYear = high;
    laid = layout(perYear);
  }
  // Short of fitting by less than its margins, the plot spends them rather
  // than scroll a few pixels: moved left by half the overshoot, the outermost
  // labels keep a pixel of margin each side.
  const over = laid.right - width;
  const squeeze = over > 0 && over <= 2 * (EDGE - 1) ? over / 2 : 0;
  const plotWidth = Math.max(width, Math.ceil(laid.right - 2 * squeeze));

  // Down the rows: labels above, the dots, and labels below where a row has any.
  let top = PAD;
  const below = [];
  const moved = [];
  for (const [index, row] of rows.entries()) {
    const { at, hasBelow } = laid.rows[index];
    const dotTop = top + LABEL_H + GAP;
    const centre = dotTop + TARGET / 2;
    row.chip.style.top = `${centre}px`;
    const track = element('div', 'timeline-track');
    track.style.top = `${centre}px`;
    plot.insertBefore(track, guide);
    for (const key of row.keys) {
      const { side } = at.get(key);
      const x = at.get(key).x - squeeze;
      const dot = dots.get(key);
      dot.button.style.left = `${x - TARGET / 2}px`;
      dot.button.style.top = `${dotTop}px`;
      dot.label.style.top = side === 'above' ? `${-(LABEL_H + GAP)}px` : `${TARGET + GAP}px`;
      placed.set(key, { x, y: centre, rowTop: top, labelTop: side === 'above' ? top : dotTop + TARGET + GAP, colour: dot.colour });
      if (side === 'below') below.push(key);
      const off = x + squeeze - (laid.left + (yearOf(key) - first) * perYear);
      if (Math.abs(off) >= 0.5) moved.push(`${key}:${off.toFixed(1)}`);
    }
    const chipHalf = row.chip.hidden ? 0 : row.chip.offsetHeight / 2;
    top = Math.max(hasBelow ? dotTop + TARGET + GAP + LABEL_H : dotTop + TARGET, centre + chipHalf) + ROW_GAP;
  }
  const rowsHeight = top - ROW_GAP + PAD;
  plot.style.width = `${plotWidth}px`;
  for (const el of [plot, chipsColumn]) el.style.height = `${rowsHeight}px`;
  for (const el of [chipsColumn, ...corners]) el.style.width = `${gutter}px`;
  for (const ticks of [topTicks, bottomTicks]) ticks.style.width = `${plotWidth}px`;
  // Focus scrolling keeps a dot clear of the chips and the axes, as reveal() does.
  scroller.style.scrollPaddingLeft = `${gutter}px`;

  // Ticks on both axes, at the years' own places — a dot moved apart for its
  // target sits a few px off its tick, never on another year's.
  const step = TICK_STEPS.find((s) => s * perYear >= TICK_ROOM) ?? TICK_STEPS.at(-1);
  const origin = laid.left - squeeze;
  const from = first - origin / perYear;
  const to = first + (plotWidth - origin) / perYear;
  for (const ticks of [topTicks, bottomTicks]) {
    ticks.replaceChildren();
    for (let year = Math.ceil(from / step) * step; year <= to; year += step) {
      const x = origin + (year - first) * perYear;
      if (x < TICK_HALF || x > plotWidth - TICK_HALF) continue;
      const tick = element('span', 'timeline-tick');
      tick.lang = language;
      tick.style.left = `${x}px`;
      tick.textContent = digits(year);
      ticks.appendChild(tick);
    }
  }
  // Read by the harness and the report.
  panel.dataset.perYear = perYear.toFixed(1);
  panel.dataset.overlaps = laid.collisions.join(' ');
  panel.dataset.below = below.join(' ');
  panel.dataset.moved = moved.join(' ');
  panel.dataset.scrolls = String(plotWidth > width + 0.5);
  light();
  // The panel's height gives the map its own. Told now, not a frame later, so a
  // record selected in the same tap — a link into another tab — is framed on
  // the map as it will stand, not as it stood.
  shell.map?.resize();
}

/*
 * All rows at one scale, in the plot's own frame. Dots: each at its year,
 * then — where two of a row are closer than a target — moved apart, each as
 * little as it can. Labels, by year: above the dot, or, where that would touch
 * the label of a neighbour already placed, below it. A label that fits neither
 * is a collision, and the caller widens the scale. The whole is shifted right
 * until its leftmost label clears the plot's edge; `right` is the width it then
 * needs.
 */
function arrange(rows, perYear, xOf, widthOf) {
  const out = { rows: [], collisions: [], left: 0, right: 0 };
  const xs = new Map();
  for (const row of rows) {
    const spread = apart(row.keys.map(xOf), TARGET);
    row.keys.forEach((key, i) => xs.set(key, spread[i]));
  }
  let left = -Infinity;
  for (const [key, x] of xs) left = Math.max(left, EDGE + widthOf.get(key) / 2 - x);
  out.left = left;
  const clear = (list, [l, r]) => list.every(([a, b]) => l >= b + LABEL_SPACE || r <= a - LABEL_SPACE);
  for (const row of rows) {
    const at = new Map();
    const above = [];
    const below = [];
    for (const key of row.keys) {
      const x = xs.get(key) + left;
      const half = widthOf.get(key) / 2;
      const span = [x - half, x + half];
      let side = 'above';
      if (!clear(above, span)) {
        if (clear(below, span)) side = 'below';
        else out.collisions.push(key);
      }
      (side === 'above' ? above : below).push(span);
      at.set(key, { x, side });
      out.right = Math.max(out.right, span[1] + EDGE);
    }
    out.rows.push({ at, hasBelow: below.length > 0 });
  }
  return out;
}

/*
 * Positions as near the ideal ones (ascending) as they can be with at least `d`
 * between neighbours, by least squares. Taking away i·d from the i-th turns the
 * spacing into plain order, which pooling adjacent values that break it solves
 * exactly; two of one year end up d/2 either side of it.
 */
function apart(ideal, d) {
  const blocks = [];
  for (const [i, x] of ideal.entries()) {
    blocks.push({ sum: x - i * d, n: 1 });
    while (blocks.length > 1 && blocks.at(-2).sum / blocks.at(-2).n > blocks.at(-1).sum / blocks.at(-1).n) {
      const last = blocks.pop();
      blocks.at(-1).sum += last.sum;
      blocks.at(-1).n += last.n;
    }
  }
  const out = [];
  for (const block of blocks) for (let k = 0; k < block.n; k++) out.push(block.sum / block.n + out.length * d);
  return out;
}

/** Lights the dots the selection reaches; the selected one gets its guide, down to the bottom axis. */
function light() {
  let selected = null;
  for (const [key, dot] of dots) {
    const isSelected = !dot.button.hidden && shell.selection.get(spec.records) === key;
    const active = !dot.button.hidden && !isSelected && (spec.state ?? []).some((field) => typeof field === 'object' && related(field.fromSelection, key));
    dot.button.classList.toggle('selected', isSelected);
    dot.button.classList.toggle('active', active);
    dot.button.setAttribute('aria-pressed', String(isSelected));
    if (isSelected) selected = key;
  }
  guide.hidden = selected === null || !placed.has(selected);
  if (guide.hidden) return;
  const { x, y, colour } = placed.get(selected);
  guide.style.left = `${x - 1}px`;
  guide.style.top = `${y}px`;
  guide.style.borderColor = colour;
}

/** The card's chip in its record's row colour, as the row's own chip; plain for anything else. */
function tintCardChip() {
  const key = shell.selection.get(spec.records);
  const dot = key === undefined ? null : dots.get(key);
  if (dot) shell.dom.kicker.style.setProperty('--chip', tint(dot.colour));
  else shell.dom.kicker.style.removeProperty('--chip');
}

/** Scrolls the selected dot, with its label, into view — or the first lit one, for a place. */
function reveal() {
  const selected = shell.selection.get(spec.records);
  const key = placed.has(selected) ? selected : [...placed.keys()].find((k) => dots.get(k).button.classList.contains('active'));
  if (key === undefined) return;
  const { x, y, labelTop } = placed.get(key);
  // What of the plot shows: right of the chips, between the axes.
  const viewWidth = scroller.clientWidth - gutter;
  const viewHeight = scroller.clientHeight - topTicks.parentElement.offsetHeight - bottomTicks.parentElement.offsetHeight;
  const half = Math.max(labelWidth(key), TARGET) / 2;
  const to = {};
  if (x - half < scroller.scrollLeft || x + half > scroller.scrollLeft + viewWidth) to.left = Math.max(0, x - viewWidth / 2);
  const blockTop = Math.min(labelTop, y - TARGET / 2);
  const blockBottom = Math.max(labelTop + LABEL_H, y + TARGET / 2);
  if (blockTop - GAP < scroller.scrollTop) to.top = Math.max(0, blockTop - GAP);
  else if (blockBottom + GAP > scroller.scrollTop + viewHeight) to.top = blockBottom + GAP - viewHeight;
  if (to.left === undefined && to.top === undefined) return;
  scroller.scrollTo({ ...to, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/** A label's width in bold — what a selected label takes — so selecting never makes one touch another. */
function labelWidth(key) {
  const { name, year } = dots.get(key);
  const id = `${name}\n${year}`;
  if (!widths.has(id)) {
    measureName.textContent = name;
    measureYear.textContent = year;
    widths.set(id, Math.ceil(Math.max(measureName.getBoundingClientRect().width, measureYear.getBoundingClientRect().width)) + 8);
  }
  return widths.get(id);
}

/** A fromSelection relation: the selected record of `records` lists this key in `listField`. */
function related(relation, key) {
  const selected = shell.selection.get(relation.records);
  if (selected === undefined) return false;
  return (shell.records[relation.records]?.[selected]?.[relation.listField] ?? []).includes(key);
}

/*
 * A chip that wraps keeps the width it wrapped at, wider than its longest
 * line; narrowed to that line, it leaves the rows the room it does not use.
 */
function shrinkWrap(chip) {
  chip.style.width = '';
  if (chip.hidden) return;
  const range = document.createRange();
  range.selectNodeContents(chip);
  // The text's boxes, a line each or more; a line is as wide as its boxes reach.
  const lines = new Map();
  for (const r of range.getClientRects()) {
    const top = Math.round(r.top);
    const line = lines.get(top) ?? { left: Infinity, right: -Infinity };
    lines.set(top, { left: Math.min(line.left, r.left), right: Math.max(line.right, r.right) });
  }
  if (lines.size < 2) return;
  const style = getComputedStyle(chip);
  const inner = Math.max(...[...lines.values()].map((l) => l.right - l.left));
  chip.style.width = `${Math.ceil(inner + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight))}px`;
}

/** An axis: a corner that stays over the chips' column, and the ticks. */
function axis(which) {
  const bar = element('div', `timeline-axis timeline-axis-${which}`);
  bar.setAttribute('aria-hidden', 'true');
  const corner = element('div', 'timeline-corner');
  corners.push(corner);
  const ticks = element('div', 'timeline-ticks');
  bar.append(corner, ticks);
  return [bar, ticks];
}

function element(tag, className) {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

/*
 * A dot's colour: the style token's paint expression, evaluated against the
 * record. The timeline reads the two forms a category colour takes — a
 * literal, and `match` on `get` — and names anything else rather than guess.
 */
function colourOf(row) {
  if (!spec.colour) return '#0b3d91';
  const expression = shell.descriptor.styles?.[spec.colour.style]?.paint?.[spec.colour.paint];
  if (expression === undefined) throw new Error(`timeline: style "${spec.colour.style}" has no paint "${spec.colour.paint}"`);
  return evaluate(expression, row);
}

function evaluate(expression, row) {
  if (!Array.isArray(expression)) return expression;
  const [op, ...args] = expression;
  if (op === 'get') return row[args[0]] ?? null;
  if (op === 'match') {
    const input = evaluate(args[0], row);
    for (let i = 1; i + 1 < args.length; i += 2) {
      const labels = Array.isArray(args[i]) ? args[i] : [args[i]];
      if (labels.includes(input)) return evaluate(args[i + 1], row);
    }
    return evaluate(args.at(-1), row);
  }
  throw new Error(`timeline: a colour expression the timeline does not read: "${op}"`);
}

/** A colour lightened toward white by TINT: a chip's, under dark text. */
function tint(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#e3e9f1';
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${c.map((v) => Math.round(v + (255 - v) * TINT).toString(16).padStart(2, '0')).join('')}`;
}

/** The selected dot's soft glow: its colour, faint. */
function glowOf(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}73` : 'rgba(11, 61, 145, 0.45)';
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
