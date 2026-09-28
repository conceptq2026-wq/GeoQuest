/*
|--------------------------------------------------------------------------
| THE EXPLODED VIEW — a diagram's layers as a painted stack, lit by a tap.
|--------------------------------------------------------------------------
|
| The default view is one picture: the art's master, cut to the stack. A tap
| lights one slab — its own cut-out drawn over the master at its box, scaled
| about the box's centre and lifted, with a white outline and a soft glow —
| highlights that layer's stretch of the temperature curve and opens its card.
| Nothing else changes: the other slabs are not dimmed. A second tap on the
| lit slab, the card's × or Escape closes it. With reduced motion nothing
| animates.
|
| Every position comes from the art's manifest, in its layout px (the master's
| width makes manifest.layout.width); the content — names, heights, the
| curve's points, the card — from the diagram's data; every word from the
| descriptor. All text is HTML over the art, never baked into it.
*/

const SVG = 'http://www.w3.org/2000/svg';
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

// The stage, in CSS px.
const PAD = 8; // the stage's inner margin
const AXIS_INSET = 12; // the km axis, in from the left column's outer edge
const TICK = 4; // a tick's reach either side of the axis
const LABEL_GAP = 5; // tick to label
const STACK_GAP = 10; // the widest label to the stack; the stack to the curve's column
const CURVE_WIDTH = 36; // the temperature curve, from − to +
const FINITE_SHARE = 0.78; // of that width, what the known temperatures span; an "up to" point stands at +
const ARROW = 7; // the up-arrow's head
const CAPTION_GAP = 5; // the curve's caption to the arrow's tip
// ⓘ's tap zone hangs this far into the stage at its top right (style.css):
// the curve's caption, in the right column, starts below it.
const INFO_CLEAR = 26;
const HINT_GAP = 8; // the stack's foot to the hint
// A slab's name, per unit of the art's scale, never under MIN px nor over MAX.
const NAME = { size: 15.5, min: 11, max: 16, pad: 4 };

const bnNumber = (n) => n.toLocaleString('en-US').replace(/[0-9]/g, (d) => BN_DIGITS[d]);
// An en dash between two numbers, which a line never breaks at (word joiners).
const DASH = '\u2060–\u2060';
/** A height: km, or [least, greatest] where it varies — «৬–২০». */
const kmText = (v) => (Array.isArray(v) ? `${bnNumber(v[0])}${DASH}${bnNumber(v[1])}` : bnNumber(v));
const known = (v) => v !== null && v !== undefined;
/**
 * From one height to another: «৫০–৮৫ কিমি», or, where an end is itself a
 * range, joined by the descriptor's word — «০ থেকে ৬–২০ কিমি». A line breaks
 * only at the spaces round that word: never inside a range, nor between a
 * number and its unit.
 */
const spanText = (from, to, words) =>
  Array.isArray(from) || Array.isArray(to) ? `${kmText(from)} ${words.spanJoin} ${kmText(to)}\u00a0${words.unit}` : `${kmText(from)}${DASH}${kmText(to)}\u00a0${words.unit}`;

function el(tag, className, lang) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (lang) node.lang = lang;
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// The card's two small line glyphs, drawn here: a mountain for height, a thermometer.
const GLYPHS = {
  altitude: '<path d="M2.5 19.5h19"/><path d="M3.5 19.5 9.5 8.5l6 11"/><path d="M12.7 13.6l2.8-4.1 5.5 10"/>',
  temperature: '<path d="M10 13.7V5a2 2 0 1 1 4 0v8.7a4 4 0 1 1-4 0Z"/><path d="M12 9.5v6.3"/>',
};
function glyph(name) {
  const span = el('span', 'fact-glyph');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" focusable="false">${GLYPHS[name]}</svg>`;
  return span;
}

/** Is (x, y) inside the polygon? */
function inside(polygon, x, y) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export async function mount(panel, { descriptor, data, art, file }) {
  const manifest = await art;
  const words = descriptor.words;
  const slabs = manifest.slabs;
  const layers = data.layers;

  // The art and the data describe the same layers and boundaries, bottom to top.
  if (slabs.map((s) => s.id).join() !== layers.map((l) => l.id).join()) throw new Error('the art\'s slabs and the data\'s layers differ');
  if (manifest.boundaries.map((b) => b.between.join('/')).join() !== data.boundaries.map((b) => b.between.join('/')).join()) throw new Error('the art\'s boundaries and the data\'s differ');

  // The page takes the art's own background — as the view's file shows it at
  // its edges once decoded, a level or two off the colour painted — so the
  // picture has no edge; the card takes the icons' white the same way.
  document.documentElement.style.setProperty('--page', manifest.view.edge ?? manifest.layout.background);
  if (manifest.iconEdge) document.documentElement.style.setProperty('--card', manifest.iconEdge);

  const srcset = (files) => `${file(files['1x'])} 1x, ${file(files['2x'])} 2x`;
  const place = (node, box) => Object.assign(node.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` });

  /*
  | THE STAGE — the art in its own layout px, scaled as a whole; over it, in
  | CSS px, the names, the km axis, the curve and the captions.
  */
  const stage = el('div', 'stage');
  const content = el('div', 'stage-content');
  const frame = el('div', 'art');
  Object.assign(frame.style, { width: `${manifest.layout.width}px`, height: `${manifest.layout.height}px` });

  const view = el('img', 'art-view');
  view.dataset.fit = 'the stack';
  view.alt = '';
  view.decoding = 'async';
  view.fetchPriority = 'high';
  view.width = manifest.view.width;
  view.height = manifest.view.height;
  view.srcset = srcset(manifest.view.files);
  view.src = file(manifest.view.files['1x']);
  place(view, manifest.view);
  frame.append(view);
  // Names, axis and curve mean nothing without the picture, so all show with
  // it; the view is ready once the picture is, and a picture that fails fails
  // the view.
  content.classList.add('loading');
  const ready = view.decode().then(() => content.classList.remove('loading'));

  // A lit slab's cut-out, made the first time it is lit and kept.
  const litImages = new Map();
  function litImage(n) {
    if (litImages.has(n)) return litImages.get(n);
    const slab = slabs[n];
    const img = el('img', 'lit-slab');
    img.alt = '';
    img.decoding = 'async';
    img.width = slab.width;
    img.height = slab.height;
    img.srcset = srcset(slab.files);
    img.src = file(slab.files['1x']);
    place(img, slab);
    img.style.setProperty('--k', slab.litScale);
    img.style.setProperty('--lift', `${manifest.lit.lift}px`);
    img.style.setProperty('--outline', `${manifest.lit.outline}px`);
    img.style.setProperty('--glow', `${manifest.lit.glow}px`);
    frame.append(img);
    litImages.set(n, img);
    return img;
  }

  const overlay = el('div', 'overlay');

  // ---- the temperature curve, and its caption and marks
  const curve = svgEl('svg', { class: 'curve', 'aria-hidden': 'true', focusable: 'false' });
  const gradient = svgEl('linearGradient', { id: 'curve-colours', gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0 });
  descriptor.colours.curve.forEach((colour, n, all) => gradient.append(svgEl('stop', { offset: n / (all.length - 1), 'stop-color': colour })));
  const defs = svgEl('defs');
  defs.append(gradient);
  const colours = 'url(#curve-colours)';
  const line = svgEl('path', { class: 'curve-line', stroke: colours });
  const arrow = svgEl('path', { class: 'curve-arrow', stroke: colours });
  // One stretch per layer the profile reaches: the lit layer's is highlighted.
  const stretches = layers.map(() => {
    const g = svgEl('g', { class: 'curve-stretch' });
    g.append(svgEl('path', { class: 'curve-halo', stroke: colours }), svgEl('path', { class: 'curve-bright', stroke: colours }));
    return g;
  });
  curve.append(defs, line, ...stretches, arrow);

  const caption = el('p', 'curve-caption', 'bn');
  caption.dataset.fit = 'the curve caption';
  caption.textContent = words.curve;
  const minus = el('span', 'curve-mark');
  minus.textContent = '−';
  const plus = el('span', 'curve-mark');
  plus.textContent = '+';

  // ---- the km axis: a tick at every boundary the art has, with its height
  const axisLine = el('div', 'axis-line');
  const ticks = data.boundaries.map((b) => {
    if (!known(b.atKm)) return null;
    const tick = el('div', 'axis-tick');
    const label = el('span', 'axis-label', 'bn');
    label.dataset.fit = `the axis at ${b.atKm}`;
    label.textContent = `${kmText(b.atKm)} ${words.unit}`;
    return { tick, label };
  });
  const scale = el('p', 'scale-caption', 'bn');
  scale.dataset.fit = 'the scale caption';
  scale.textContent = words.scale;

  // ---- the names, real buttons, bottom to top
  const names = slabs.map((slab, n) => {
    const button = el('button', 'layer-name', 'bn');
    button.dataset.fit = layers[n].id ?? `layer ${n}`;
    button.type = 'button';
    button.textContent = layers[n].nameBn;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => toggle(n));
    return button;
  });

  const hint = el('p', 'stage-hint', 'bn');
  hint.textContent = words.hint;

  overlay.append(curve, caption, minus, plus, axisLine, ...ticks.filter(Boolean).flatMap((t) => [t.tick, t.label]), scale, ...names, hint);
  content.append(frame, overlay);
  stage.append(content);

  /*
  | THE CARD — docked under the stage, shown while a slab is lit. It takes
  | the room its content needs, the stage never less than 45% of the screen,
  | and scrolls inside itself when short of room.
  */
  const card = el('section', 'card');
  card.hidden = true;
  const closeButton = el('button', 'card-close', 'bn');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', words.close);
  closeButton.textContent = '×';
  const body = el('div', 'card-body');
  body.setAttribute('aria-live', 'polite');
  const chip = el('span', 'card-chip', 'bn');
  const title = el('h2', 'card-title', 'bn');
  title.id = 'card-title';
  card.setAttribute('aria-labelledby', title.id);

  function fact(name, label) {
    const cell = el('div', 'fact');
    const text = el('div', 'fact-text');
    const head = el('span', 'fact-label', 'bn');
    head.textContent = label;
    const value = el('span', 'fact-value', 'bn');
    const note = el('span', 'fact-note', 'bn');
    text.append(head, value, note);
    cell.append(glyph(name), text);
    return { cell, value, note };
  }
  const altitude = fact('altitude', words.altitude);
  const temperature = fact('temperature', words.temperature);
  const facts = el('div', 'card-facts');
  facts.append(altitude.cell, el('span', 'fact-rule'), temperature.cell);

  const happens = el('div', 'card-happens');
  const happensLabel = el('span', 'fact-label', 'bn');
  happensLabel.textContent = words.happens;
  const featureList = el('ul', 'feature-list');
  happens.append(happensLabel, featureList);

  body.append(chip, title, facts, happens);
  card.append(closeButton, body);
  panel.append(stage, card);

  function fillCard(n) {
    const layer = layers[n];
    chip.textContent = words.chip.replace('{n}', bnNumber(layer.order));
    chip.style.background = descriptor.colours.chips[layer.id];
    title.textContent = layer.nameBn;

    // A height with a pending end is not shown, nor a pending line; a layer
    // with no trend at all — the exosphere — has no temperature column.
    const span = known(layer.fromKm) && known(layer.toKm) ? spanText(layer.fromKm, layer.toKm, words) : null;
    altitude.value.textContent = span ?? '';
    altitude.cell.hidden = !span;
    temperature.value.textContent = layer.trendBn ?? '';
    temperature.note.textContent = layer.rateBn ?? '';
    temperature.note.hidden = !layer.rateBn;
    temperature.cell.hidden = !layer.trendBn;
    facts.hidden = !span && !layer.trendBn;
    facts.classList.toggle('single', !span || !layer.trendBn);

    featureList.replaceChildren(
      ...layer.featureIds.map((id) => {
        const feature = data.features[id];
        const icon = manifest.icons.find((i) => i.id === id);
        const item = el('li', 'feature');
        const img = el('img', 'feature-icon');
        img.alt = '';
        img.width = img.height = icon.size;
        img.decoding = 'async';
        img.srcset = srcset(icon.files);
        img.src = file(icon.files['1x']);
        const name = el('span', 'feature-name', 'bn');
        name.textContent = feature.nameBn;
        item.append(img, name);
        // Its own reach, where the seed gives one: the aurora and the ionosphere run past their slab.
        if (known(feature.fromKm) && known(feature.toKm)) {
          const reach = el('span', 'feature-reach', 'bn');
          reach.textContent = spanText(feature.fromKm, feature.toKm, words);
          item.append(reach);
        }
        return item;
      }),
    );
    happens.hidden = !layer.featureIds.length;
    body.scrollTop = 0;
  }

  /*
  | LIGHTING
  */
  let lit = null;

  function toggle(n) {
    if (lit === n) close(false);
    else light(n);
  }

  function light(n) {
    if (lit !== null) litImages.get(lit)?.classList.remove('on');
    lit = n;
    const img = litImage(n);
    const show = () => {
      if (lit === n) img.classList.add('on');
    };
    img.decode().then(show, show);
    names.forEach((b, i) => b.setAttribute('aria-pressed', String(i === n)));
    stretches.forEach((g, i) => g.classList.toggle('lit', i === n));
    fillCard(n);
    card.hidden = false;
    hint.hidden = true;
    placeNames();
  }

  function close(returnFocus) {
    const n = lit;
    if (n === null) return;
    lit = null;
    litImages.get(n)?.classList.remove('on');
    names[n].setAttribute('aria-pressed', 'false');
    stretches.forEach((g) => g.classList.remove('lit'));
    card.hidden = true;
    hint.hidden = false;
    placeNames();
    if (returnFocus) names[n].focus();
  }

  closeButton.addEventListener('click', () => close(true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && lit !== null && !panel.hidden) close(true);
  });

  // A tap on the art: the lit slab first, which stands larger than its place,
  // then every slab from the top down — each outline takes in its slab's top
  // face, hidden behind the slab above. The Earth is never lit.
  stage.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    const box = content.getBoundingClientRect();
    const x = (event.clientX - box.left - geo.ox) / geo.s;
    const y = (event.clientY - box.top - geo.oy) / geo.s;
    const hit = lit !== null && inside(litOutline(lit), x, y) ? lit : slabs.findLastIndex((s) => inside(s.outline, x, y));
    if (hit >= 0) toggle(hit);
  });

  /** Where a point of a slab stands once it is lit, in layout px. */
  function litPoint(n, [x, y]) {
    const slab = slabs[n];
    const [cx, cy] = [slab.x + slab.width / 2, slab.y + slab.height / 2];
    return [cx + (x - cx) * slab.litScale, cy + (y - cy) * slab.litScale - manifest.lit.lift];
  }
  const litOutline = (n) => slabs[n].outline.map((p) => litPoint(n, p));

  /*
  | LAYOUT — the art as large as the stage allows, never past its own size:
  | its width leaves the km axis's column on the left and the curve's on the
  | right; its height fits the stage at its least, 45% of the screen,
  | with room for the curve's caption above the arrow — so a card opening
  | never shrinks it. The stage's spare height centres it, the hint under the
  | stack while nothing is lit; a card opening takes that room, and the art
  | glides up into what is left.
  */
  let geo = { s: 1, ox: 0, oy: 0 };
  const X = (x) => geo.ox + x * geo.s;
  const Y = (y) => geo.oy + y * geo.s;
  const left = (b) => b.left;
  const right = (b) => b.right;
  const slabsLeft = Math.min(...slabs.flatMap((s) => s.outline.map(([x]) => x)));
  const slabsRight = Math.max(...slabs.flatMap((s) => s.outline.map(([x]) => x)));
  const artTop = manifest.view.y;
  const artFoot = manifest.view.y + manifest.view.height;
  const profile = data.profile.map((p) => ({ ...p, y: right(manifest.boundaries[p.boundary])[1] }));
  const curveTop = Math.min(...profile.map((p) => p.y));

  function layout(force) {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H) return;
    const least = Math.min(H, parseFloat(getComputedStyle(stage).minHeight) || H);
    // The axis's column as wide as its widest label; the curve's as its caption's widest word.
    const labelWidth = Math.max(0, ...ticks.filter(Boolean).map((t) => t.label.offsetWidth));
    const column = AXIS_INSET + TICK + LABEL_GAP + labelWidth + STACK_GAP;
    caption.style.maxWidth = 'min-content';
    const curveColumn = Math.max(CURVE_WIDTH, caption.offsetWidth) + 2 * STACK_GAP;
    caption.style.maxWidth = `${curveColumn}px`;
    const captionRoom = caption.offsetHeight + CAPTION_GAP + ARROW;
    const span = slabsRight - slabsLeft;
    let s = Math.min(1, (W - column - curveColumn) / span, (least - 2 * PAD) / (artFoot - artTop));
    // Short of room above the arrow for its caption: the top gives way to it.
    const oyFor = (k) => Math.max(PAD - artTop * k, INFO_CLEAR + captionRoom - curveTop * k);
    if (oyFor(s) + artFoot * s + PAD > least) s = Math.min(s, (least - PAD - INFO_CLEAR - captionRoom) / (artFoot - curveTop));
    // The stack centred between the two columns.
    const stackLeft = column + (W - column - curveColumn - span * s) / 2;
    const next = { s, ox: stackLeft - slabsLeft * s, oy: oyFor(s), columns: `${column} ${curveColumn}` };

    // Centred in the stage's spare height, the hint with it while it shows; it
    // glides when a card comes or goes, and is placed outright on a new layout.
    if (force) stage.classList.add('instant');
    const foot = next.oy + artFoot * next.s + (hint.hidden ? 0 : HINT_GAP + hint.offsetHeight) + PAD;
    content.style.transform = `translateY(${Math.max(0, (H - foot) / 2)}px)`;

    if (!force && next.s === geo.s && next.ox === geo.ox && next.oy === geo.oy && next.columns === geo.columns) return;
    geo = next;

    stage.classList.add('instant');
    frame.style.transform = `translate(${geo.ox}px, ${geo.oy}px) scale(${geo.s})`;

    // The axis, a column's width left of the stack.
    const axisX = X(slabsLeft) - column + AXIS_INSET;
    const levels = manifest.boundaries.map((b) => Y(left(b)[1]));
    const ticked = ticks.map((t, n) => (t ? levels[n] : null)).filter((y) => y !== null);
    Object.assign(axisLine.style, { left: `${axisX}px`, top: `${Math.min(...ticked)}px`, height: `${Math.max(...ticked) - Math.min(...ticked)}px` });
    ticks.forEach((t, n) => {
      if (!t) return;
      Object.assign(t.tick.style, { left: `${axisX - TICK}px`, top: `${levels[n]}px`, width: `${2 * TICK}px` });
      Object.assign(t.label.style, { left: `${axisX + TICK + LABEL_GAP}px`, top: `${levels[n] - t.label.offsetHeight / 2}px` });
    });
    // "Not to scale" low in the left column, beside the Earth's receding foot.
    const axisFoot = Math.max(...ticked);
    Object.assign(scale.style, { left: `${axisX - TICK}px`, top: `${Math.max(axisFoot + 14, Y(artFoot) - scale.offsetHeight - 2 * PAD)}px` });

    // The curve, centred in its column, each point at its boundary's level.
    curve.setAttribute('width', W);
    curve.setAttribute('height', H);
    curve.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const x0 = X(slabsRight) + (curveColumn - CURVE_WIDTH) / 2;
    const finite = profile.filter((p) => !p.upTo).map((p) => p.tempC);
    const [cold, warm] = [Math.min(...finite), Math.max(...finite)];
    const pts = profile.map((p) => [p.upTo ? x0 + CURVE_WIDTH : x0 + ((p.tempC - cold) / (warm - cold || 1)) * CURVE_WIDTH * FINITE_SHARE, Y(p.y)]);
    gradient.setAttribute('y1', pts[0][1]);
    gradient.setAttribute('y2', pts.at(-1)[1]);
    // Between two points, an S with upright ends: it never leaves the span of
    // the two, so the curve shows no turn the data does not have.
    const segment = ([ax, ay], [bx, by]) => `C${ax},${ay + (by - ay) / 3} ${bx},${by - (by - ay) / 3} ${bx},${by}`;
    line.setAttribute('d', `M${pts[0]}` + pts.slice(1).map((p, n) => segment(pts[n], p)).join(''));
    stretches.forEach((g, n) => {
      const from = profile.findIndex((p) => p.boundary === n);
      const d = from >= 0 && from + 1 < pts.length && profile[from + 1].boundary === n + 1 ? `M${pts[from]}${segment(pts[from], pts[from + 1])}` : '';
      for (const path of g.children) path.setAttribute('d', d);
    });
    const [tx, ty] = pts.at(-1);
    arrow.setAttribute('d', profile.at(-1).upTo ? `M${tx - ARROW * 0.7},${ty - ARROW * 0.1}L${tx},${ty - ARROW}L${tx + ARROW * 0.7},${ty - ARROW * 0.1}M${tx},${ty}V${ty - ARROW}` : '');
    const mid = x0 + CURVE_WIDTH / 2;
    Object.assign(caption.style, { left: `${mid}px`, top: `${ty - ARROW - CAPTION_GAP - caption.offsetHeight}px` });
    const markTop = pts[0][1] + 5;
    Object.assign(minus.style, { left: `${x0}px`, top: `${markTop}px` });
    Object.assign(plus.style, { left: `${x0 + CURVE_WIDTH}px`, top: `${markTop}px` });

    Object.assign(hint.style, { left: `${X((slabsLeft + slabsRight) / 2)}px`, top: `${Y(artFoot) + HINT_GAP}px` });

    placeNames();
    void stage.offsetHeight;
    requestAnimationFrame(() => stage.classList.remove('instant'));
  }

  // Each name along its slab's front face, from its line's start at its
  // angle; a lit slab's with it, scaled and lifted as its cut-out is.
  function placeNames() {
    const size = Math.min(NAME.max, Math.max(NAME.min, NAME.size * geo.s));
    names.forEach((button, n) => {
      const slab = slabs[n];
      const on = n === lit;
      const [x, y] = on ? litPoint(n, slab.nameLine.from) : slab.nameLine.from;
      button.style.fontSize = `${size}px`;
      const h = button.offsetHeight;
      button.style.transformOrigin = `${NAME.pad}px ${h / 2}px`;
      button.style.transform = `translate(${X(x) - NAME.pad}px, ${Y(y) - h / 2}px) rotate(${slab.nameLine.angle}deg) scale(${on ? slab.litScale : 1})`;
    });
  }

  new ResizeObserver(() => layout()).observe(stage);
  // Names and labels are measured: again once the Bengali font is in.
  document.fonts?.ready.then(() => layout(true));
  layout(true);

  return {
    ready,
    shown: () => layout(true),
  };
}
