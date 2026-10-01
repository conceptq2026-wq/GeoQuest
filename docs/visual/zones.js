/*
|--------------------------------------------------------------------------
| THE ZONES VIEW — a cross-section of the sea's zones, drawn in code.
|--------------------------------------------------------------------------
|
| Loaded only for a view of type `zones` (maritime-zones). One <svg> fills
| the stage, laid out in CSS px from the view's file (built by
| tools/build-diagram-maritime-zones.mjs): land on the left, the open sea to
| the right, not to scale. Two rows: the water — internal waters, the
| territorial sea, the EEZ with the contiguous zone as a hatched strip over
| its inner part, the high seas — and the seabed under it — the territorial
| sea's own bed, the continental shelf from the 12 mark, fading past 200 with
| no end tick, then the Area, dotted. The baseline is a line with its name;
| the ticks are 0, 12, 24 and 200, measured from it.
|
| Each column keeps the least width the file gives at 320 px, so every tap
| zone is at least 44 px either way; the room past that is shared by weight.
| A zone's name is drawn on it, across or up, in lines, wherever it fits
| whole, in the label colour the file chose for that fill; the hatched strip,
| the shelf's fade and the dotted Area are named in a legend under the axis.
|
| The picker row at the top is the main way in: choosing a name, or tapping a
| zone — the water and the seabed are separate zones — outlines that zone,
| dims the rest and docks the card under the picture with its sentences. A tap
| on the lit zone again, on the picture away from every zone, on × or Escape
| closes it, and focus returns to the zone.
|
| Every word shown is the descriptor's or the data's.
*/

import { dockedCard, el, pickerBar, stylesheet, svgEl } from './parts.js?v=68edd3c554';

// ⓘ's tap zone hangs over the stage's top right: words in the top row stay this far left of the edge.
const INFO_CLEAR_X = 56;

export async function mount(panel, { descriptor, data, art }) {
  const words = descriptor.words ?? {};
  const spec = await art;
  await Promise.all([stylesheet('../shared/picker.css?v=68edd3c554'), stylesheet('./zones.css?v=68edd3c554')]);

  const zones = data.zones;
  const byId = new Map(zones.map((z) => [z.id, z]));
  const colour = (id) => spec.colours[id];
  const R = spec.rows;
  const L = spec.label;

  // ---- the page ------------------------------------------------------------------------

  panel.classList.add('zones');
  const stage = el('div', 'stage');
  const content = el('div', 'stage-content loading');
  stage.append(content);
  const svg = svgEl('svg', { class: 'zones-svg', role: 'group' });
  if (descriptor.title?.bn) svg.setAttribute('aria-label', descriptor.title.bn);
  content.append(svg);

  // The patterns: the contiguous zone's hatch over the EEZ, the Area's dots, the shelf's fade.
  const defs = svgEl('defs');
  const hatch = svgEl('pattern', { id: 'mz-hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  hatch.append(svgEl('rect', { width: 8, height: 8, fill: colour('eez').fill }), svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: colour('contiguous-zone').fill, 'stroke-width': 4 }));
  const dots = svgEl('pattern', { id: 'mz-dots', width: 8, height: 8, patternUnits: 'userSpaceOnUse' });
  dots.append(svgEl('rect', { width: 8, height: 8, fill: colour('the-area').fill }), svgEl('circle', { cx: 4, cy: 4, r: 1.7, fill: '#5A1F44' }));
  const fadeDots = svgEl('pattern', { id: 'mz-fade-dots', width: 6, height: 6, patternUnits: 'userSpaceOnUse' });
  fadeDots.append(svgEl('circle', { cx: 3, cy: 3, r: 1.1, fill: '#6E6400' }));
  const stop = (offset, color) => svgEl('stop', { offset, 'stop-color': color });
  const shelfGradient = svgEl('linearGradient', { id: 'mz-shelf', gradientUnits: 'userSpaceOnUse' });
  const shelfSolidStop = stop(0.8, colour('continental-shelf').fill);
  shelfGradient.append(stop(0, colour('continental-shelf').fill), shelfSolidStop, stop(1, colour('seabed').fill));
  const swatchGradient = svgEl('linearGradient', { id: 'mz-fade-swatch' });
  swatchGradient.append(stop(0, colour('continental-shelf').fill), stop(1, colour('seabed').fill));
  defs.append(hatch, dots, fadeDots, shelfGradient, swatchGradient);
  svg.append(defs);

  const layer = (cls) => svg.appendChild(svgEl('g', { class: cls }));
  const ground = layer('ground');
  const zoneLayer = layer('zone-layer');
  const marks = layer('marks');
  const labelLayer = layer('labels');
  const outline = layer('lit-outline');

  // The ground no one taps: the land, and the plain seabed under the internal waters.
  const land = ground.appendChild(svgEl('rect', { class: 'land', fill: colour('land').fill }));
  const plainSeabed = ground.appendChild(svgEl('rect', { class: 'plain-seabed', fill: colour('seabed').fill }));

  // The zones, each a button: the water row, then the seabed row. The territorial sea has both.
  const zoneEls = [];
  function zone(id, fill, row) {
    const z = byId.get(id);
    if (!z) throw new Error(`the data has no zone ${id}`);
    const node = svgEl('rect', { class: `zone ${row}`, fill, 'data-key': id, 'data-title': z.nameBn, role: 'button', tabindex: zoneEls.some((e) => e.dataset.key === id) ? -1 : 0, 'aria-label': z.nameBn });
    zoneLayer.append(node);
    zoneEls.push(node);
    return node;
  }
  const water = {
    'internal-waters': zone('internal-waters', colour('internal-waters').fill, 'water'),
    'territorial-sea': zone('territorial-sea', colour('territorial-sea').fill, 'water'),
    eez: zone('eez', colour('eez').fill, 'water'),
    'contiguous-zone': zone('contiguous-zone', 'url(#mz-hatch)', 'water strip'),
    'high-seas': zone('high-seas', colour('high-seas').fill, 'water'),
  };
  const seabed = {
    'territorial-sea': zone('territorial-sea', colour('territorial-sea').fill, 'seabed'),
    'continental-shelf': zone('continental-shelf', 'url(#mz-shelf)', 'seabed'),
    'the-area': zone('the-area', 'url(#mz-dots)', 'seabed'),
  };
  const fadeOver = marks.appendChild(svgEl('rect', { class: 'fade-dots', fill: 'url(#mz-fade-dots)', 'data-key': 'continental-shelf' }));
  const areaEdge = marks.appendChild(svgEl('line', { class: 'area-edge' }));
  const surface = marks.appendChild(svgEl('line', { class: 'surface' }));
  const seabedTop = marks.appendChild(svgEl('line', { class: 'seabed-top' }));
  const stripEdge = marks.appendChild(svgEl('rect', { class: 'strip-edge', 'data-key': 'contiguous-zone' }));
  const baseline = marks.appendChild(svgEl('line', { class: 'baseline', stroke: colour('baseline').fill }));

  // Words on the picture: each zone's name on its fill, the land's, the baseline's, the ticks, the notes.
  function text(cls, fit, lang = 'bn') {
    const node = svgEl('text', { class: `${cls} fit-text`, 'data-fit': fit });
    if (lang) node.setAttribute('lang', lang);
    labelLayer.append(node);
    return node;
  }
  const zoneLabels = new Map();
  for (const id of ['internal-waters', 'territorial-sea', 'eez', 'high-seas', 'continental-shelf']) {
    const node = text('zone-label layer-label', `the name of ${id}`);
    node.dataset.key = id;
    node.setAttribute('fill', colour(id).text);
    zoneLabels.set(id, node);
  }
  const landLabel = text('zone-label layer-label land-label', 'the land');
  landLabel.setAttribute('fill', colour('land').text);
  const baselineLabel = text('baseline-label layer-label', 'the baseline\'s name');
  const scaleNote = text('scale-note', 'the scale note');
  const ticks = spec.ticks.map((t) => ({ ...t, mark: marks.appendChild(svgEl('line', { class: 'tick' })), node: text('tick-label', `the tick ${t.nm}`) }));
  const axisNote = text('axis-note', 'the axis note');
  const legend = spec.legend.map((item) => {
    const fill = { hatch: 'url(#mz-hatch)', dots: 'url(#mz-dots)', fade: 'url(#mz-fade-swatch)' }[item.pattern];
    const swatch = marks.appendChild(svgEl('rect', { class: 'swatch', fill, 'data-key': item.zone }));
    const over = item.pattern === 'fade' ? marks.appendChild(svgEl('rect', { class: 'swatch-dots', fill: 'url(#mz-fade-dots)' })) : null;
    const node = text('legend-label layer-label', `the legend ${item.pattern}`);
    node.dataset.key = item.zone;
    return { ...item, swatch, over, node };
  });
  const measurer = svgEl('text', { class: 'zone-label measurer', 'aria-hidden': 'true' });
  svg.append(measurer);

  // The card docked under the picture, and the picker row at the top (./parts.js).
  const { card, close, fill } = dockedCard({ close: words.close, id: 'zones' });
  const sentences = el('ul', 'zones-sentences', 'bn');
  card.querySelector('.card-body').append(sentences);

  // ---- choosing ---------------------------------------------------------------------------

  let selected = null;
  let boxes = new Map(); // zone element -> its rect, from the last layout

  const { bar, select, row } = pickerBar({
    placeholder: words.picker,
    items: zones.map((z) => ({ key: z.id, label: z.nameBn })),
    current: () => selected ?? undefined,
    choose: (key) => choose(key),
  });
  panel.append(bar, stage, card);

  function light() {
    svg.classList.toggle('has-lit', selected !== null);
    for (const node of svg.querySelectorAll('[data-key]')) node.classList.toggle('lit', node.dataset.key === selected);
    outline.replaceChildren();
    for (const node of zoneEls) {
      if (node.dataset.key !== selected) continue;
      const b = boxes.get(node);
      if (b) outline.append(svgEl('rect', { x: b.x + 1, y: b.y + 1, width: Math.max(0, b.w - 2), height: Math.max(0, b.h - 2) }));
    }
  }

  function choose(key) {
    const z = byId.get(key);
    if (!z) return;
    selected = key;
    fill(z.nameBn, [], {});
    sentences.replaceChildren(
      ...z.sentences.map((s) => {
        const li = el('li', null, 'bn');
        li.textContent = s;
        return li;
      }),
    );
    card.hidden = false;
    select.value = key;
    row.sync();
    layout();
  }

  function clear(returnFocus) {
    if (selected === null) return;
    const was = selected;
    selected = null;
    card.hidden = true;
    select.value = '';
    row.sync();
    layout();
    if (returnFocus) zoneEls.find((n) => n.dataset.key === was && n.getAttribute('tabindex') === '0')?.focus();
  }

  stage.addEventListener('click', (event) => {
    const key = event.target.closest?.('.zone')?.dataset.key;
    if (key && key !== selected) choose(key);
    else clear(false);
  });
  svg.addEventListener('keydown', (event) => {
    const key = event.target.closest?.('.zone')?.dataset.key;
    if (!key || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    if (key !== selected) choose(key);
    else clear(true);
  });
  close.addEventListener('click', () => clear(true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selected !== null && !panel.hidden) clear(true);
  });

  // ---- layout, in CSS px ----------------------------------------------------------------

  const measure = (s) => {
    measurer.textContent = s;
    return measurer.getComputedTextLength();
  };
  /** Greedy lines of at most `room` px, a word never split. */
  function linesOf(s, room) {
    const out = [];
    let line = '';
    for (const word of s.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > room) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
    return out;
  }
  /** A name on its fill, whole: across in lines where they fit, else up the box, else across (marked). */
  function placeLabel(node, s, b) {
    const pad = L.pad;
    // A line as tall as the names' size makes it: 15 px from 390 px wide, 14 under (zones.css).
    const lineH = Math.ceil(parseFloat(getComputedStyle(measurer).fontSize) * 1.2);
    const fits = (lines, long, deep) => lines.every((l) => measure(l) <= long - 2 * pad) && lines.length * lineH <= deep - 2 * pad;
    let lines = linesOf(s, b.w - 2 * pad);
    let up = false;
    if (!fits(lines, b.w, b.h)) {
      const tall = linesOf(s, b.h - 2 * pad);
      if (fits(tall, b.h, b.w)) {
        lines = tall;
        up = true;
      }
    }
    node.dataset.overflow = String(!fits(lines, up ? b.h : b.w, up ? b.w : b.h));
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    node.replaceChildren();
    // Lines stack across the reading direction, centred on the box.
    lines.forEach((l, i) => {
      const off = (i - (lines.length - 1) / 2) * lineH;
      node.appendChild(svgEl('tspan', { x: cx, y: cy + off })).textContent = l;
    });
    if (up) node.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    else node.removeAttribute('transform');
  }
  function setRect(node, b) {
    for (const [k, v] of Object.entries({ x: b.x, y: b.y, width: Math.max(0, b.w), height: Math.max(0, b.h) })) node.setAttribute(k, v.toFixed(2));
    boxes.set(node, b);
  }
  function setLine(node, x1, y1, x2, y2) {
    for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) node.setAttribute(k, v.toFixed(2));
  }

  function layout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H) return;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    boxes = new Map();

    // Columns: each its least width, the room past that by weight (shrunk alike below 320 px).
    const g = spec.gutter;
    const inner = Math.max(0, W - 2 * g);
    const least = spec.columns.reduce((s, c) => s + c.min, 0);
    const weights = spec.columns.reduce((s, c) => s + c.weight, 0);
    const shrink = Math.min(1, inner / least);
    const extra = Math.max(0, inner - least);
    const col = {};
    let x = g;
    for (const c of spec.columns) {
      const w = c.min * shrink + (extra * c.weight) / weights;
      col[c.id] = [x, x + w];
      x += w;
    }
    const x0 = col['internal-waters'][1];
    const x12 = col.eez[0];
    const x200 = col.eez[1];
    const x24 = x12 + Math.max(spec.strip.min * shrink, (x200 - x12) * spec.strip.share);
    const xEnd = col['high-seas'][1];
    const hs = xEnd - x200;
    const xFade = x200 + Math.max(spec.fade.min * shrink, Math.min(hs - spec.area.min * shrink, hs * spec.fade.share));

    // Rows, from the top: the air (as deep as ⓘ's zone hangs), the water, the seabed, the ticks, the axis note, the legend.
    // A legend line is as tall as its name renders (15 px from 390 px wide), never less than the file's row.
    legend[0].node.textContent = legend[0].text;
    const legendRow = Math.max(R.legend, Math.ceil(legend[0].node.getBBox().height) + 1);
    const fixed = R.air + R.seabed + R.ticks + R.note + spec.legend.length * legendRow + 4 * R.gap;
    const waterH = Math.max(R.waterMin, Math.min(R.waterMax, H - fixed));
    // Centred in the stage's spare height; the air row keeps its depth below ⓘ's zone either way.
    const yTop = Math.max(0, Math.floor((H - fixed - waterH) / 2));
    const yWater = yTop + R.air;
    const ySeabed = yWater + waterH;
    const yBottom = ySeabed + R.seabed;
    const yTicks = yBottom + R.gap;
    const yAxis = yTicks + R.ticks + R.gap;
    const yLegend = yAxis + R.note + R.gap;

    const box = (x1, y1, x2, y2) => ({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    setRect(land, box(col.land[0], yWater, col.land[1], yBottom));
    setRect(plainSeabed, box(col['internal-waters'][0], ySeabed, x0, yBottom));
    setRect(water['internal-waters'], box(col['internal-waters'][0], yWater, x0, ySeabed));
    setRect(water['territorial-sea'], box(x0, yWater, x12, ySeabed));
    setRect(water.eez, box(x12, yWater, x200, ySeabed));
    setRect(water['contiguous-zone'], box(x12, yWater, x24, yWater + Math.min(spec.strip.height, waterH / 2)));
    setRect(stripEdge, box(x12, yWater, x24, yWater + Math.min(spec.strip.height, waterH / 2)));
    setRect(water['high-seas'], box(x200, yWater, xEnd, ySeabed));
    setRect(seabed['territorial-sea'], box(x0, ySeabed, x12, yBottom));
    setRect(seabed['continental-shelf'], box(x12, ySeabed, xFade, yBottom));
    setRect(seabed['the-area'], box(xFade, ySeabed, xEnd, yBottom));
    setRect(fadeOver, box(x200, ySeabed, xFade, yBottom));
    // The shelf is solid to the 200 mark, then fades: no end tick.
    shelfGradient.setAttribute('x1', x12.toFixed(2));
    shelfGradient.setAttribute('x2', xFade.toFixed(2));
    shelfSolidStop.setAttribute('offset', ((x200 - x12) / (xFade - x12)).toFixed(4));
    setLine(areaEdge, xFade, ySeabed, xFade, yBottom);
    setLine(surface, col['internal-waters'][0], yWater, xEnd, yWater);
    setLine(seabedTop, col['internal-waters'][0], ySeabed, xEnd, ySeabed);
    setLine(baseline, x0, yWater - 6, x0, yBottom + 4);

    // Names on the fills.
    const strip = boxes.get(water['contiguous-zone']);
    placeLabel(zoneLabels.get('internal-waters'), byId.get('internal-waters').labelBn, boxes.get(water['internal-waters']));
    placeLabel(zoneLabels.get('territorial-sea'), byId.get('territorial-sea').labelBn, boxes.get(water['territorial-sea']));
    placeLabel(zoneLabels.get('eez'), byId.get('eez').labelBn, box(x12, strip.y + strip.h, x200, ySeabed));
    placeLabel(zoneLabels.get('high-seas'), byId.get('high-seas').labelBn, boxes.get(water['high-seas']));
    placeLabel(zoneLabels.get('continental-shelf'), byId.get('continental-shelf').labelBn, box(x12, ySeabed, x200, yBottom));
    placeLabel(landLabel, words.land ?? '', boxes.get(land));

    // The baseline's name above it, the scale note at the top's right, clear of ⓘ's zone.
    const yAir = yTop + R.air / 2;
    baselineLabel.textContent = words.baseline ?? '';
    const bw = baselineLabel.getComputedTextLength();
    const bx = Math.max(g + bw / 2, x0);
    for (const [k, v] of Object.entries({ x: bx, y: yAir })) baselineLabel.setAttribute(k, v.toFixed(2));
    scaleNote.textContent = words.scale ?? '';
    const sw = scaleNote.getComputedTextLength();
    const sRight = W - INFO_CLEAR_X;
    const sLeft = sRight - sw;
    const clashes = sLeft < bx + bw / 2 + 8;
    // Where the top row is too short for both, the scale note takes the bottom line.
    const yScale = clashes ? yLegend + spec.legend.length * legendRow + R.gap + R.note / 2 : yAir;
    for (const [k, v] of Object.entries({ x: clashes ? g : sLeft, y: yScale })) scaleNote.setAttribute(k, v.toFixed(2));

    // Ticks at 0, 12, 24 and 200, measured from the baseline; nothing past 200.
    const at = { 0: x0, 12: x12, 24: x24, 200: x200 };
    for (const t of ticks) {
      setLine(t.mark, at[t.nm], yBottom, at[t.nm], yBottom + 5);
      t.node.textContent = t.label;
      for (const [k, v] of Object.entries({ x: at[t.nm], y: yTicks + R.ticks / 2 + 3 })) t.node.setAttribute(k, v.toFixed(2));
    }
    axisNote.textContent = words.axis ?? '';
    const aw = axisNote.getComputedTextLength();
    for (const [k, v] of Object.entries({ x: Math.max(g, Math.min(x0, W - g - aw)), y: yAxis + R.note / 2 })) axisNote.setAttribute(k, v.toFixed(2));

    // The legend: the hatched strip, the shelf's fade and the dotted Area.
    legend.forEach((item, i) => {
      const y = yLegend + i * legendRow;
      setRect(item.swatch, box(g, y + 3, g + 24, y + legendRow - 3));
      if (item.over) setRect(item.over, box(g, y + 3, g + 24, y + legendRow - 3));
      item.node.textContent = item.text;
      for (const [k, v] of Object.entries({ x: g + 32, y: y + legendRow / 2 })) item.node.setAttribute(k, v.toFixed(2));
    });

    measurer.textContent = '';
    light();
  }

  window.addEventListener('resize', () => layout());

  const ready = (async () => {
    await document.fonts?.ready;
    content.classList.remove('loading');
    layout();
  })();

  return {
    ready,
    shown() {
      layout();
    },
  };
}
