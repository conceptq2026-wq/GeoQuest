/*
|--------------------------------------------------------------------------
| THE CUTAWAY VIEW — a picture cut open, each layer of its cut face tappable.
|--------------------------------------------------------------------------
|
| Loaded only for a view of type `cutaway` (earth-interior). The picture is
| the approved master, cut out; nothing is drawn over it but a layer's
| outline, the leaders and the words. Its manifest (built by
| tools/build-diagram-earth-interior.mjs) gives, in the master's px, the cut's
| corner, its two straight edges and each band boundary's own circle — the
| painting's bands are not concentric — and each layer's stretch of the cut
| and the anchor of its leader, at the band's middle.
|
| A tap on a layer, its name or the picker row lights it: a white outline
| with a soft glow along that layer's sector only — no scaling, no dimming —
| and its card docks under the picture: the rows the descriptor lists, each
| label left and value right, a row the layer has no value for left out.
| A tap on the lit layer again, on the picture away from every layer, on ×
| or Escape closes it. The picker row, [ ‹ ] [ the select ] [ › ], is the
| map shell's own (../shared/picker.js), at the top as in every shell; it
| stays with the selection. The picture fits whole between the row and the
| card, open or closed, and no name or leader reaches under either.
|
| The thin crusts are a few px deep on a phone: their tap zones reach out
| past the picture's cut edge until each is at least TAP_MIN deep.
|
| Every word shown is the descriptor's or the data's.
*/

import { dockedCard, el, pickerBar, stylesheet, svgEl } from './parts.js?v=8164f80c4b';
const deg = Math.PI / 180;
// CSS px: how deep, at least, a layer's tap zone reaches out from its inner edge.
const TAP_MIN = 44;
// The picture's width, at most, as a share of the stage's.
const ART_SHARE = 0.8;
// The stage never drops under this share of the screen's height, and the
// picture is sized to fit it there, so a card opening never shrinks it.
const STAGE_MIN = 0.45;
// The words round the picture, in CSS px.
// The names, in CSS px: in a column at the right, beside the picture, which
// shrinks to make room rather than the names ever growing smaller (the
// user's rule: at least 15 px at 390 px wide, 14 px at 320, in cutaway.css).
// A name wraps past SHARE of the stage's width, never under MIN_WIDTH; the
// column may reach RIM px over the picture — the painted globe's own rim,
// right of its crust — and no further.
const LABEL = { margin: 8, gap: 4, share: 0.3, minWidth: 96, toArt: 4, rim: 8, leaderGap: 3, dot: 2.5 };
// ⓘ's tap zone hangs this far into the stage at its top right (docs/visual/style.css).
const INFO_CLEAR = 26;
const NOTE = { gap: 6, height: 18 };
// The glow's softness, in CSS px.
const GLOW = 4;

export async function mount(panel, { descriptor, data, art, file }) {
  const words = descriptor.words ?? {};
  const manifest = await art;
  await Promise.all([stylesheet('../shared/picker.css?v=8164f80c4b'), stylesheet('./cutaway.css?v=8164f80c4b')]);

  const layers = data.layers;
  const byId = new Map(layers.map((l) => [l.id, l]));
  const shape = new Map(manifest.layers.map((l) => [l.id, l]));
  for (const l of layers) if (!shape.has(l.id)) throw new Error(`the manifest has no geometry for ${l.id}`);
  const { corner, circles } = manifest;
  // The outermost layers — no layer lies outside them — are the thin crusts.
  const outermost = new Set(manifest.layers.filter((l) => !manifest.layers.some((o) => o.inner === l.id)).map((l) => l.id));
  const view = manifest.view;

  // ---- the geometry, in the master's px ----------------------------------------------

  const dir = (a) => [Math.cos(a * deg), -Math.sin(a * deg)];
  /** Where the ray from the corner at angle a meets a circle grown by `grow`: its distance along the ray. */
  function reach(c, a, grow = 0) {
    const [dx, dy] = dir(a);
    const ox = corner[0] - c.cx;
    const oy = corner[1] - c.cy;
    const b = ox * dx + oy * dy;
    const q = ox * ox + oy * oy - (c.r + grow) ** 2;
    return -b + Math.sqrt(Math.max(0, b * b - q));
  }
  const pointAt = (t, a) => {
    const [dx, dy] = dir(a);
    return [corner[0] + t * dx, corner[1] + t * dy];
  };
  const f = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  /** An arc on circle c from p to q, clockwise on the screen or not. */
  function arc(c, r, p, q, clockwise) {
    const a1 = Math.atan2(p[1] - c.cy, p[0] - c.cx);
    const a2 = Math.atan2(q[1] - c.cy, q[0] - c.cx);
    let sweep = clockwise ? a2 - a1 : a1 - a2;
    while (sweep < 0) sweep += 2 * Math.PI;
    return `A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${sweep > Math.PI ? 1 : 0} ${clockwise ? 1 : 0} ${f(q)}`;
  }
  /** A layer's annular sector, its outer circle grown by `grow`: from its top edge clockwise to its bottom, and back inside. */
  function sector(id, grow = 0) {
    const s = shape.get(id);
    const outer = circles[s.outer];
    const top = pointAt(reach(outer, s.to, grow), s.to);
    const foot = pointAt(reach(outer, s.from, grow), s.from);
    let d = `M ${f(top)} ${arc(outer, outer.r + grow, top, foot, true)}`;
    if (s.inner) {
      const inner = circles[s.inner];
      const innerFoot = pointAt(reach(inner, s.from), s.from);
      const innerTop = pointAt(reach(inner, s.to), s.to);
      d += ` L ${f(innerFoot)} ${arc(inner, inner.r, innerFoot, innerTop, false)} Z`;
    } else d += ` L ${f(corner)} Z`;
    return d;
  }

  // ---- the page ------------------------------------------------------------------------

  panel.classList.add('cutaway');
  const stage = el('div', 'stage');
  const content = el('div', 'stage-content loading');
  stage.append(content);

  const img = el('img', 'cutaway-art');
  img.dataset.fit = 'the globe';
  img.alt = '';
  img.decoding = 'async';
  img.srcset = `${file(view.files['1x'])} 1x, ${file(view.files['2x'])} 2x`;
  img.src = file(view.files['1x']);
  content.append(img);

  const overlay = svgEl('svg', { class: 'cutaway-overlay', viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`, 'aria-hidden': 'true' });
  const defs = svgEl('defs');
  const filter = svgEl('filter', { id: 'cutaway-glow', x: '-25%', y: '-25%', width: '150%', height: '150%' });
  const blur = svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '8' });
  filter.append(blur);
  defs.append(filter);
  const zones = svgEl('g', { class: 'zones' });
  const lit = svgEl('g', { class: 'lit' });
  lit.style.display = 'none';
  const litGlow = svgEl('path', { class: 'lit-glow', filter: 'url(#cutaway-glow)' });
  const litLine = svgEl('path', { class: 'lit-line' });
  lit.append(litGlow, litLine);
  const leaders = svgEl('g', { class: 'leaders' });
  overlay.append(defs, zones, lit, leaders);
  content.append(overlay);

  const zoneOf = new Map();
  for (const l of layers) {
    const path = svgEl('path', { class: 'zone', 'data-key': l.id, 'data-title': l.nameBn });
    zones.append(path);
    zoneOf.set(l.id, path);
  }

  const labels = new Map();
  const lines = new Map();
  for (const l of layers) {
    const button = el('button', 'layer-label', 'bn');
    button.type = 'button';
    button.dataset.key = l.id;
    button.textContent = l.nameBn;
    button.setAttribute('aria-pressed', 'false');
    button.dataset.fit = l.id;
    content.append(button);
    labels.set(l.id, button);
    const line = svgEl('line', { class: 'leader', 'data-fit': `leader ${l.id}` });
    const dot = svgEl('circle', { class: 'anchor' });
    leaders.append(line, dot);
    lines.set(l.id, { line, dot });
  }

  const note = el('p', 'scale-note fit-text', 'bn');
  note.dataset.fit = 'the scale note';
  note.textContent = words.scale ?? '';
  note.hidden = !words.scale;
  content.append(note);

  // The card docked under the picture, and the picker row at the top (./parts.js).
  const { card, close, fill } = dockedCard({ close: words.close, id: 'cutaway' });

  // ---- choosing ---------------------------------------------------------------------------

  let selected = null;
  let scale = 1; // CSS px per master px

  const { bar, select, row } = pickerBar({
    placeholder: words.picker,
    items: layers.map((l) => ({ key: l.id, label: l.nameBn })),
    current: () => selected ?? undefined,
    choose: (key) => choose(key),
  });
  panel.append(bar, stage, card);

  function choose(key) {
    const layer = byId.get(key);
    if (!layer) return;
    selected = key;
    litLine.setAttribute('d', sector(key));
    litGlow.setAttribute('d', sector(key));
    lit.style.display = '';
    for (const [id, b] of labels) b.setAttribute('aria-pressed', String(id === key));
    fill(layer.nameBn, words.rows, layer.rows);
    card.hidden = false;
    select.value = key;
    row.sync();
    layout();
  }

  function clear(returnFocus) {
    if (selected === null) return;
    const was = selected;
    selected = null;
    lit.style.display = 'none';
    for (const b of labels.values()) b.setAttribute('aria-pressed', 'false');
    card.hidden = true;
    select.value = '';
    row.sync();
    layout();
    if (returnFocus) labels.get(was)?.focus();
  }

  stage.addEventListener('click', (event) => {
    const key = event.target.closest?.('[data-key]')?.dataset.key;
    if (key && key !== selected) choose(key);
    else clear(false);
  });
  close.addEventListener('click', () => clear(true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selected !== null && !panel.hidden) clear(true);
  });

  // ---- layout, in CSS px ----------------------------------------------------------------

  function layout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H) return;
    // The names first: their column's width sets the picture's room.
    const maxWidth = Math.max(LABEL.minWidth, W * LABEL.share);
    let widest = 0;
    for (const b of labels.values()) {
      b.style.maxWidth = `${maxWidth}px`;
      b.style.left = '0px';
      widest = Math.max(widest, b.offsetWidth);
    }
    const column = W - LABEL.margin - widest;
    const left = LABEL.margin;
    // The picture's right edge is its box's; the globe's rim may lie under the column.
    const room = column - LABEL.toArt + LABEL.rim - left;
    const floor = Math.min(H, window.innerHeight * STAGE_MIN);
    scale = Math.min((W * ART_SHARE) / view.width, room / view.width, (floor - NOTE.gap - NOTE.height - 8) / view.height);
    const artW = view.width * scale;
    const artH = view.height * scale;
    const top = Math.max(4, (H - artH - NOTE.gap - NOTE.height) / 2);
    const toCss = ([x, y]) => [left + (x - view.x) * scale, top + (y - view.y) * scale];

    for (const node of [img, overlay]) Object.assign(node.style, { left: `${left}px`, top: `${top}px`, width: `${artW}px`, height: `${artH}px` });
    blur.setAttribute('stdDeviation', String(GLOW / scale));
    Object.assign(note.style, { left: `${left + artW / 2}px`, top: `${top + artH + NOTE.gap}px` });

    // Tap zones: each layer's sector, a thin crust's grown outward to TAP_MIN.
    for (const l of layers) {
      const s = shape.get(l.id);
      const grow = Math.max(0, TAP_MIN / scale - s.thinnest);
      const zone = zoneOf.get(l.id);
      zone.setAttribute('d', sector(l.id, outermost.has(l.id) ? grow : 0));
      // How deep the zone is where its band is thinnest, in CSS px.
      zone.dataset.depth = ((s.thinnest + (outermost.has(l.id) ? grow : 0)) * scale).toFixed(1);
    }

    // Names in the column, in the layers' order, each at its anchor's height
    // as far as they fit, pushed apart as little as they can.
    const placed = layers.map((l) => {
      const b = labels.get(l.id);
      const [, ay] = toCss(shape.get(l.id).anchor);
      return { id: l.id, b, h: b.offsetHeight, y: ay - b.offsetHeight / 2 };
    });
    for (let k = 1; k < placed.length; k++) placed[k].y = Math.max(placed[k].y, placed[k - 1].y + placed[k - 1].h + LABEL.gap);
    const overflow = placed.at(-1).y + placed.at(-1).h - (H - 4);
    if (overflow > 0) for (const p of placed) p.y -= overflow;
    for (let k = placed.length - 2; k >= 0; k--) placed[k].y = Math.min(placed[k].y, placed[k + 1].y - placed[k].h - LABEL.gap);
    for (const p of placed) {
      // Clear of ⓘ's tap zone, which hangs over the stage's top right (INFO_CLEAR px).
      p.y = Math.max(INFO_CLEAR, p.y);
      Object.assign(p.b.style, { left: `${column}px`, top: `${p.y}px` });
      // The leader: from the band's middle to the name, in the master's px.
      const [ax, ay] = shape.get(p.id).anchor;
      const ex = view.x + (column - LABEL.leaderGap - left) / scale;
      const ey = view.y + (p.y + p.h / 2 - top) / scale;
      const { line, dot } = lines.get(p.id);
      for (const [k, v] of Object.entries({ x1: ax, y1: ay, x2: ex, y2: ey })) line.setAttribute(k, v.toFixed(2));
      for (const [k, v] of Object.entries({ cx: ax, cy: ay, r: LABEL.dot / scale })) dot.setAttribute(k, v.toFixed(2));
    }
  }

  window.addEventListener('resize', () => layout());

  const ready = img.decode().then(async () => {
    await document.fonts?.ready;
    content.classList.remove('loading');
    layout();
  });

  return {
    ready,
    shown() {
      layout();
    },
  };
}
