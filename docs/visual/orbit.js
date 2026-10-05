/*
|--------------------------------------------------------------------------
| THE ORBIT VIEW — the Earth round the Sun, at the positions the data gives.
|--------------------------------------------------------------------------
|
| Loaded only for a view of type `orbit` (seasons). Two paintings, the Sun
| and one Earth, cut out (the Earth never clipped to a circle); everything
| else is drawn here: the orbit, an ellipse with its arrows running
| anticlockwise; the Earth at each position (June right, September top,
| December left, March bottom, as the book draws it); each Earth's axis,
| all parallel, tilted by the data's angle with the North Pole leaning
| toward the Sun at June, and the angle marked; a faint equator; the night
| half, facing away from the Sun, masked by the Earth cut-out's own alpha;
| each position's date under its Earth, and the Sun's name.
|
| A tap on an Earth, its date or the picker row selects the position: that
| Earth drawn SELECTED times larger — its axis, angle mark, equator and night
| half with it — in a ring of the app's dark blue with a soft blue glow, its
| date darker and bold (the user's decision), and its card docked under the
| picture,
| the descriptor's rows in two columns, a row the position has no value for
| left out. A tap on the selected Earth again, on the picture away from the
| Earths, on × or Escape closes it. Every Earth's tap zone is at least
| TAP_MIN across. The picture fits whole between the picker row and the
| card, open or closed, and no word lies under either.
|
| Every word shown is the descriptor's or the data's.
*/

import { dockedCard, el, pickerBar, stylesheet, svgEl } from './parts.js?v=c63cfbb211';

const deg = Math.PI / 180;
// CSS px: an Earth's tap zone is at least this across.
const TAP_MIN = 44;
// The stage never drops under this share of the screen's height, and the
// picture is sized to fit it there, so a card opening never shrinks it.
const STAGE_MIN = 0.45;
// Where each placement sits on the orbit, as its angle anticlockwise from the right.
const ANGLE = { right: 0, top: 90, left: 180, bottom: 270 };
// Sizes, in CSS px or as shares: the Earth's radius as a share of the stage's
// width (never under MIN_R), the orbit's height against its width at most,
// the room a date takes under its Earth, the angle mark's reach above it.
const EARTH = { share: 0.08, minR: 22 };
const ORBIT = { flat: 0.8, margin: 8 };
const LABEL = { gap: 4, height: 24, half: 48 };
const MARK = { reach: 1.3, text: 16 };
// The night half: from this far across the disc, into this dark.
const NIGHT = { from: 44, to: 58, colour: 'rgba(4, 14, 40, 0.62)' };
// The selected Earth, and all drawn with it, scaled by this; its ring this far
// outside the disc (before the scale).
const SELECTED = 1.2;
const RING = 5;

export async function mount(panel, { descriptor, data, art, file }) {
  const words = descriptor.words ?? {};
  const manifest = await art;
  await Promise.all([stylesheet('../shared/picker.css?v=c63cfbb211'), stylesheet('./orbit.css?v=c63cfbb211')]);

  const positions = [...data.positions].sort((a, b) => a.order - b.order);
  const byId = new Map(positions.map((p) => [p.id, p]));
  const tilt = data.geometry.tiltDeg;
  const ccw = data.geometry.orbitDirection === 'anticlockwise';
  for (const p of positions) if (!(p.placement in ANGLE)) throw new Error(`position ${p.id}: no placement "${p.placement}"`);

  // ---- the page ------------------------------------------------------------------------

  panel.classList.add('orbit');
  const stage = el('div', 'stage');
  const content = el('div', 'stage-content loading');
  stage.append(content);

  const orbit = svgEl('svg', { class: 'orbit-path', 'aria-hidden': 'true' });
  const ellipse = svgEl('ellipse', { class: 'orbit-line', 'data-fit': 'the orbit' });
  const arrows = svgEl('g', { class: 'orbit-arrows' });
  orbit.append(ellipse, arrows);
  content.append(orbit);

  const srcset = (f) => `${file(f['1x'])} 1x, ${file(f['2x'])} 2x`;
  const sun = el('img', 'orbit-sun');
  sun.alt = '';
  sun.decoding = 'async';
  sun.srcset = srcset(manifest.sun.files);
  sun.src = file(manifest.sun.files['1x']);
  sun.dataset.fit = 'the Sun';
  content.append(sun);
  const sunName = el('p', 'orbit-sun-name fit-text', 'bn');
  sunName.textContent = words.sun ?? '';
  sunName.dataset.fit = 'the Sun\'s name';
  content.append(sunName);

  // The Sun's painted disc, as a box other things keep clear of (tools/check.mjs reads it).
  const sunDisc = el('span', 'orbit-sun-disc');
  sunDisc.dataset.solid = 'the Sun';
  content.append(sunDisc);

  // One Earth per position: a group — the picture, its night half, its drawn
  // lines, its angle mark and its ring — scaled about the disc's centre when
  // selected; then its tap zone and its date.
  const earthMask = `url("${file(manifest.earth.files['2x'])}")`;
  const earths = new Map();
  for (const p of positions) {
    const body = el('div', 'orbit-body');
    const img = el('img', 'orbit-earth');
    img.alt = '';
    img.decoding = 'async';
    img.srcset = srcset(manifest.earth.files);
    img.src = file(manifest.earth.files['1x']);
    img.dataset.fit = `the Earth at ${p.id}`;
    const night = el('div', 'orbit-night');
    night.style.webkitMaskImage = earthMask;
    night.style.maskImage = earthMask;
    const lines = svgEl('svg', { class: 'orbit-lines', 'aria-hidden': 'true' });
    const equator = svgEl('ellipse', { class: 'orbit-equator' });
    const vertical = svgEl('line', { class: 'orbit-vertical' });
    const arc = svgEl('path', { class: 'orbit-arc' });
    const axis = svgEl('line', { class: 'orbit-axis' });
    lines.append(equator, vertical, arc, axis);
    const mark = el('span', 'orbit-mark fit-text', 'bn');
    mark.textContent = words.tilt ?? '';
    mark.dataset.fit = `the angle at ${p.id}`;
    const ring = el('div', 'orbit-ring');
    ring.hidden = true;
    ring.dataset.fit = `the ring at ${p.id}`;
    ring.dataset.clear = p.id;
    body.append(img, night, lines, mark, ring);
    const zone = el('span', 'zone');
    zone.dataset.key = p.id;
    zone.dataset.title = p.title;
    const label = el('button', 'layer-label', 'bn');
    label.type = 'button';
    label.dataset.key = p.id;
    label.dataset.fit = p.id;
    label.textContent = p.dateBn;
    label.setAttribute('aria-pressed', 'false');
    content.append(body, zone, label);
    earths.set(p.id, { body, img, night, lines, equator, vertical, arc, axis, mark, ring, zone, label });
  }

  const { card, close, fill } = dockedCard({ close: words.close, id: 'orbit' });

  // ---- choosing ---------------------------------------------------------------------------

  let selected = null;
  const { bar, select, row } = pickerBar({
    placeholder: words.picker,
    items: positions.map((p) => ({ key: p.id, label: p.item })),
    current: () => selected ?? undefined,
    choose: (key) => choose(key),
  });
  panel.append(bar, stage, card);

  function choose(key) {
    const p = byId.get(key);
    if (!p) return;
    selected = key;
    for (const [id, e] of earths) {
      e.ring.hidden = id !== key;
      e.body.classList.toggle('selected', id === key);
      e.label.setAttribute('aria-pressed', String(id === key));
    }
    fill(p.title, words.rows, p.rows);
    card.hidden = false;
    select.value = key;
    row.sync();
    layout();
  }

  function clear(returnFocus) {
    if (selected === null) return;
    const was = selected;
    selected = null;
    for (const e of earths.values()) {
      e.ring.hidden = true;
      e.body.classList.remove('selected');
      e.label.setAttribute('aria-pressed', 'false');
    }
    card.hidden = true;
    select.value = '';
    row.sync();
    layout();
    if (returnFocus) earths.get(was)?.label.focus();
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

  const place = (node, x, y, w, h) => Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });

  function layout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H) return;
    const floor = Math.min(H, window.innerHeight * STAGE_MIN);

    // The Earth, the orbit's width, then its height from what the stage leaves.
    const r = Math.max(EARTH.minR, W * EARTH.share);
    const rx = W / 2 - ORBIT.margin - Math.max(r, LABEL.half);
    // Room for any Earth selected: its angle mark over the top one, its ring and date under the bottom one.
    const big = r * SELECTED;
    const ringOut = (r + RING) * SELECTED;
    const above = (MARK.reach * r + MARK.text) * SELECTED; // the upright line and the angle's figure over it
    const below = ringOut + LABEL.gap + LABEL.height;
    const ry = Math.max(r * 2, Math.min(rx * ORBIT.flat, (floor - 2 * ORBIT.margin - above - below) / 2));
    const cx = W / 2;
    const cy = Math.max(ORBIT.margin + above + ry, (H - above - below - 2 * ry) / 2 + above + ry);

    // The orbit and its arrows, half way between the positions, running the data's way round.
    place(orbit, 0, 0, W, H);
    orbit.setAttribute('viewBox', `0 0 ${W} ${H}`);
    for (const [k, v] of Object.entries({ cx, cy, rx, ry })) ellipse.setAttribute(k, v.toFixed(2));
    arrows.replaceChildren();
    for (const a of [45, 135, 225, 315]) {
      const x = cx + rx * Math.cos(a * deg);
      const y = cy - ry * Math.sin(a * deg);
      // The tangent, anticlockwise on the screen (y runs down), or the other way.
      let tx = -rx * Math.sin(a * deg);
      let ty = -ry * Math.cos(a * deg);
      if (!ccw) (tx = -tx), (ty = -ty);
      const n = Math.hypot(tx, ty);
      const [ux, uy] = [tx / n, ty / n];
      const s = 6;
      const tip = [x + ux * s, y + uy * s];
      const l = [x - ux * s - uy * s * 0.8, y - uy * s + ux * s * 0.8];
      const rr = [x - ux * s + uy * s * 0.8, y - uy * s - ux * s * 0.8];
      arrows.append(svgEl('path', { class: 'orbit-arrow', d: `M ${l[0].toFixed(1)} ${l[1].toFixed(1)} L ${tip[0].toFixed(1)} ${tip[1].toFixed(1)} L ${rr[0].toFixed(1)} ${rr[1].toFixed(1)}` }));
    }

    // The Sun, its painted disc on the centre, as large as the orbit leaves room for.
    // The Sun between the Earths, clear of any selected one: the top Earth's ring
    // (its date stands beside it), the bottom Earth's angle mark, the side Earths' rings.
    // Its name is on its disc.
    const sunHalf = Math.min(ry - ringOut - 6, ry - above - 4, rx - ringOut - 8);
    const sunScale = (sunHalf * 2) / manifest.sun.width;
    const sw = manifest.sun.width * sunScale;
    const sh = manifest.sun.height * sunScale;
    place(sun, cx - manifest.sun.disc.cx * sunScale, cy - manifest.sun.disc.cy * sunScale, sw, sh);
    Object.assign(sunName.style, { left: `${cx}px`, top: `${cy}px` }); // on the Sun's disc
    const discR = manifest.sun.disc.r * sunScale * 0.8; // the bright disc, inside the glow
    place(sunDisc, cx - discR, cy - discR, discR * 2, discR * 2);

    // Each Earth: its disc's centre on the orbit.
    const e1 = r / manifest.earth.disc.r; // CSS px per 1× px of the Earth's file
    const ew = manifest.earth.width * e1;
    const eh = manifest.earth.height * e1;
    for (const p of positions) {
      const e = earths.get(p.id);
      const a = ANGLE[p.placement];
      const x = cx + rx * Math.cos(a * deg);
      const y = cy - ry * Math.sin(a * deg);
      const on = p.id === selected;
      // The group: the picture's box, its disc's centre on the orbit; scaled about that centre when selected.
      const dx = manifest.earth.disc.cx * e1;
      const dy = manifest.earth.disc.cy * e1;
      place(e.body, x - dx, y - dy, ew, eh);
      e.body.style.transformOrigin = `${dx.toFixed(2)}px ${dy.toFixed(2)}px`;
      place(e.img, 0, 0, ew, eh);
      place(e.night, 0, 0, ew, eh);
      // The night half faces away from the Sun: its gradient runs from the Sun's side.
      const away = Math.atan2(x - cx, -(y - cy)) / deg;
      e.night.style.background = `linear-gradient(${away.toFixed(1)}deg, transparent ${NIGHT.from}%, ${NIGHT.colour} ${NIGHT.to}%)`;

      // The lines, in the group's px: the axis, tilted with its North Pole toward the Sun at June.
      place(e.lines, 0, 0, ew, eh);
      e.lines.setAttribute('viewBox', `0 0 ${ew.toFixed(2)} ${eh.toFixed(2)}`);
      const [nx, ny] = [-Math.sin(tilt * deg), -Math.cos(tilt * deg)]; // north: up, leaning left (the Sun lies left of June)
      const reach = r * MARK.reach;
      for (const [k, v] of Object.entries({ x1: dx - nx * reach, y1: dy - ny * reach, x2: dx + nx * reach, y2: dy + ny * reach })) e.axis.setAttribute(k, v.toFixed(2));
      for (const [k, v] of Object.entries({ x1: dx, y1: dy, x2: dx, y2: dy - reach })) e.vertical.setAttribute(k, v.toFixed(2));
      const arcR = r * 1.12;
      const a1 = [dx, dy - arcR];
      const a2 = [dx + nx * arcR, dy + ny * arcR];
      e.arc.setAttribute('d', `M ${a1[0].toFixed(2)} ${a1[1].toFixed(2)} A ${arcR.toFixed(2)} ${arcR.toFixed(2)} 0 0 0 ${a2[0].toFixed(2)} ${a2[1].toFixed(2)}`);
      // The equator: a thin ellipse across the disc, square to the axis.
      for (const [k, v] of Object.entries({ cx: dx, cy: dy, rx: r * 0.98, ry: r * 0.16 })) e.equator.setAttribute(k, v.toFixed(2));
      e.equator.setAttribute('transform', `rotate(${(-tilt).toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)})`);
      // The angle's figure beside the top of the upright line.
      Object.assign(e.mark.style, { left: `${dx + 4}px`, top: `${dy - reach - MARK.text + 2}px` });
      place(e.ring, dx - r - RING, dy - r - RING, (r + RING) * 2, (r + RING) * 2);

      // The tap zone and the date, outside the group: the date moves down under the larger Earth's ring.
      const shown = on ? SELECTED : 1;
      const tapR = Math.max(r * shown + 4, TAP_MIN / 2);
      place(e.zone, x - tapR, y - tapR, tapR * 2, tapR * 2);
      // The date under its Earth — beside it, right, for the Earth over the Sun.
      const out = on ? ringOut : r;
      if (p.placement === 'top') Object.assign(e.label.style, { left: `${x + out + LABEL.gap}px`, top: `${y - LABEL.height / 2}px`, transform: 'none' });
      else Object.assign(e.label.style, { left: `${x}px`, top: `${y + out + LABEL.gap}px` });
    }
  }

  window.addEventListener('resize', () => layout());

  const ready = Promise.all([sun.decode(), ...[...earths.values()].map((e) => e.img.decode())]).then(async () => {
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
