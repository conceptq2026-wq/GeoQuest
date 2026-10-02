/*
|--------------------------------------------------------------------------
| THE ZONES VIEW — the sea's zones in a block of land and sea, drawn in code.
|--------------------------------------------------------------------------
|
| Loaded only for a view of type `zones` (maritime-zones). The view's file
| (built by tools/build-diagram-maritime-zones.mjs) holds one 3D model — u,
| the distance from the land toward the open sea; v, 0 to 1 along the coast;
| z, the depth — and two projections of it, chosen by a two-button switch in
| a row of its own under ⓘ's: «পাশ থেকে», the block from the side, its
| profile cut in front, and «সমুদ্র থেকে», from the open sea toward the
| baseline, raised, the profile its right face. Not to scale.
|
| Drawn back to front: the seabed's surface, shaded by depth and steepness
| with faint depth lines, under a water surface whose opacity follows the
| depth — clear over the shallows, opaque over the deep sea; the zones' fills
| blended into the water; the land with its hills and a bay (the internal
| waters); the cut face, sediment layers under the seabed and the water
| column; the open sea's end face; ships and a platform; nodules on the
| Area's floor. Textures — ripples, glints, terrain, grain — are SVG filters;
| nothing is an image. The contiguous zone keeps its hatch, the baseline its
| dashed line. Each zone carries its number, ১–৭ coast to sea, in a disc.
| The distances are nested arrows, every one from the baseline (০): ০→১২ (২),
| ০→২৪ (৩), ০→২০০ (৪) and the shelf's past ২০০, dashed (৫) — under the block
| from the side, left of it from the sea.
|
| The picker row at the top is the main way in; its items, the card's title
| and each disc read «<number>. <name>». Each disc is its zone's tap target,
| at least 44 px across on any screen (an invisible circle round the number);
| the zone's own surface and faces take a tap too. Every zone keeps its full
| colour: choosing outlines the chosen one, strengthens its discs' rings and
| docks the card with its sentences; ×, Escape or a second tap closes it, and
| focus returns to the zone's disc. The picture is
| drawn again only when the view changes; choosing changes classes only, and
| a new screen width only the discs' reach. Switching keeps the choice and
| the card.
|
| Every word shown is the descriptor's or the data's.
*/

import { dockedCard, el, pickerBar, stylesheet, svgEl } from './parts.js?v=628d4ffd04';

// CSS px: the picture's side margins, and its widest.
const GUTTER = 16;
const MAX_WIDTH = 540;

// The filters, gradients and patterns, all generated here (no image is fetched).
const DEFS = `
<linearGradient id="mz-deep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2D7C9C"/><stop offset=".35" stop-color="#1B5679"/><stop offset="1" stop-color="#0B2D47"/></linearGradient>
<linearGradient id="mz-ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DFF4FF" stop-opacity=".55"/><stop offset="1" stop-color="#DFF4FF" stop-opacity="0"/></linearGradient>
<linearGradient id="mz-land" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#55703A"/><stop offset=".6" stop-color="#6E8A45"/><stop offset="1" stop-color="#8A9A5B"/></linearGradient>
<linearGradient id="mz-hill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#93A563"/><stop offset=".5" stop-color="#5E7A3C"/><stop offset="1" stop-color="#34502A"/></linearGradient>
<linearGradient id="mz-haze" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#EEF3F8" stop-opacity="0"/><stop offset="1" stop-color="#EEF3F8" stop-opacity=".32"/></linearGradient>
<linearGradient id="mz-hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3D4A52"/><stop offset=".6" stop-color="#26323A"/><stop offset="1" stop-color="#6B2E26"/></linearGradient>
<linearGradient id="mz-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8B969E"/><stop offset=".5" stop-color="#C9D0D5"/><stop offset="1" stop-color="#6B767E"/></linearGradient>
<radialGradient id="mz-shadow"><stop offset="0" stop-color="#13252D" stop-opacity=".35"/><stop offset="1" stop-color="#13252D" stop-opacity="0"/></radialGradient>
<filter id="mz-ripple" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.13" numOctaves="3" seed="7"/><feDiffuseLighting lighting-color="#ffffff" surfaceScale="1.4"><feDistantLight azimuth="230" elevation="52"/></feDiffuseLighting></filter>
<filter id="mz-glint" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.16" numOctaves="2" seed="11"/><feSpecularLighting lighting-color="#ffffff" surfaceScale="2" specularConstant=".9" specularExponent="22"><feDistantLight azimuth="235" elevation="38"/></feSpecularLighting><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="mz-terrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" seed="3"/><feDiffuseLighting lighting-color="#ffffff" surfaceScale="3.2"><feDistantLight azimuth="230" elevation="40"/></feDiffuseLighting></filter>
<filter id="mz-terrain-in" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" seed="3"/><feDiffuseLighting lighting-color="#ffffff" surfaceScale="3.2"><feDistantLight azimuth="230" elevation="40"/></feDiffuseLighting><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="mz-bed" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.09 0.05" numOctaves="3" seed="13"/><feDiffuseLighting lighting-color="#ffffff" surfaceScale="2.2"><feDistantLight azimuth="220" elevation="45"/></feDiffuseLighting></filter>
<filter id="mz-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="5"/><feColorMatrix type="saturate" values="0"/></filter>
<filter id="mz-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2"/></filter>
<filter id="mz-drop" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#0B1E26" flood-opacity=".45"/></filter>
<filter id="mz-grade"><feColorMatrix type="saturate" values=".9"/></filter>
<pattern id="mz-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#FFE2CC" stroke-opacity=".75" stroke-width="2.2"/></pattern>`;

// The legend's small pictures, the same marks as on the block.
const SWATCH = {
  baseline: '<line x1="2" y1="8" x2="24" y2="8" stroke="#13252D" stroke-width="2" stroke-dasharray="4 3"/>',
  contiguous: '<defs><pattern id="mz-hatch-key" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#E7B79A"/><line x1="0" y1="0" x2="0" y2="6" stroke="#B4521A" stroke-width="2.5"/></pattern></defs><rect width="26" height="16" fill="url(#mz-hatch-key)"/>',
  area: '<rect width="26" height="16" fill="#C98FAE"/><g fill="#2B2522"><ellipse cx="5" cy="5" rx="2" ry="1.4"/><ellipse cx="13" cy="10" rx="2" ry="1.4"/><ellipse cx="21" cy="5" rx="2" ry="1.4"/><ellipse cx="8" cy="12" rx="1.6" ry="1.1"/><ellipse cx="18" cy="12" rx="1.6" ry="1.1"/></g>',
};

export async function mount(panel, { descriptor, data, art }) {
  const words = descriptor.words ?? {};
  const M = await art;
  await Promise.all([stylesheet('../shared/picker.css?v=628d4ffd04'), stylesheet('./zones.css?v=628d4ffd04')]);

  const zones = data.zones;
  const byId = new Map(zones.map((z) => [z.id, z]));
  const titleOf = (z) => `${z.numberBn}. ${z.nameBn}`;
  const U = M.u;
  const PROF = M.profile;
  const ZB = M.floor;
  const T = M.text;

  // ---- the model ------------------------------------------------------------------------

  /** The seabed's depth at u. */
  function dep(u) {
    if (u <= U.coast) return 0;
    for (let i = 1; i < PROF.length; i++) {
      const [a, ya] = PROF[i - 1];
      const [b, yb] = PROF[i];
      if (u <= b) return ya + ((yb - ya) * (u - a)) / (b - a);
    }
    return PROF.at(-1)[1];
  }
  const topZ = (u) => (u <= U.coast ? 0 : dep(u));
  const coastU = (v) => (v > M.bay.from && v < M.bay.to ? U.coast - M.bay.depth * Math.sin((Math.PI * (v - M.bay.from)) / (M.bay.to - M.bay.from)) : U.coast);
  /** The u values from a to b: every profile point between, and every `step`. */
  function useq(a, b, step) {
    const r = [a];
    for (const p of PROF) if (p[0] > a && p[0] < b) r.push(p[0]);
    for (let x = a + step; x < b; x += step) r.push(x);
    r.push(b);
    return [...new Set(r)].sort((x, y) => x - y);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  function mix(c1, c2, t) {
    const h = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    const A = h(c1);
    const B = h(c2);
    return `#${A.map((x, i) => Math.round(lerp(x, B[i], t)).toString(16).padStart(2, '0')).join('')}`;
  }

  let view = 'side';
  let V = M.views.side;
  const P = (u, v, z) => [V.x[0] * u + V.x[1] * v + V.x[2] * z + V.x[3], V.y[0] * u + V.y[1] * v + V.y[2] * z + V.y[3]];
  const pts = (a) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const quad = (u0, u1, v0, v1, zf) => [P(u0, v0, zf(u0)), P(u1, v0, zf(u1)), P(u1, v1, zf(u1)), P(u0, v1, zf(u0))];
  const flat = () => 0;
  const coastLine = () => Array.from({ length: 21 }, (_, i) => P(coastU(i / 20), i / 20, 0));
  const surfPoly = () => [...coastLine(), P(U.end, 1, 0), P(U.end, 0, 0)];
  const bedStrip = (a, b, s) => {
    const q = useq(a, b, s);
    return [...q.map((u) => P(u, 0, dep(u))), ...q.slice().reverse().map((u) => P(u, 1, dep(u)))];
  };
  const profileWater = (vc, u0, u1) => {
    const q = useq(u0, u1, 6);
    return [...q.map((u) => P(u, vc, 0)), ...q.slice().reverse().map((u) => P(u, vc, dep(u)))];
  };
  const profileLayer = (vc, d) => {
    const q = useq(U.land0, U.end, 6);
    return [...q.map((u) => P(u, vc, Math.min(Math.max(topZ(u) + d, 0), ZB))), P(U.end, vc, ZB), P(U.land0, vc, ZB)];
  };
  const bandOnProfile = (vc, u0, u1, th) => {
    const q = useq(u0, u1, 6);
    return [...q.map((u) => P(u, vc, dep(u))), ...q.slice().reverse().map((u) => P(u, vc, dep(u) + th))];
  };

  // ---- the page ------------------------------------------------------------------------

  panel.classList.add('zones');

  // The view switch: two buttons, in a row of their own under ⓘ's.
  const switchRow = el('div', 'zones-switch');
  switchRow.setAttribute('role', 'group');
  const switches = {};
  for (const [key, word] of [['side', words.viewSide], ['sea', words.viewSea]]) {
    const b = el('button', 'zones-view', 'bn');
    b.type = 'button';
    b.dataset.view = key;
    b.textContent = word ?? key;
    b.setAttribute('aria-pressed', String(key === view));
    switchRow.append(b);
    switches[key] = b;
  }

  const stage = el('div', 'stage');
  const content = el('div', 'stage-content loading');
  const inner = el('div', 'zones-inner');
  const svg = svgEl('svg', { class: 'zones-svg', role: 'group' });
  if (descriptor.title?.bn) svg.setAttribute('aria-label', descriptor.title.bn);
  const legend = el('div', 'zones-legend', 'bn');
  const L = words.legend ?? {};
  for (const [key, text] of [['baseline', L.baseline], ['contiguous', L.contiguous], ['area', L.area], [null, L.scale], [null, L.ticks]]) {
    if (!text) continue;
    const item = el('span', 'legend-item fit-text', 'bn');
    item.dataset.fit = `the legend: ${key ?? text}`;
    if (key) {
      const mark = svgEl('svg', { viewBox: '0 0 26 16', 'aria-hidden': 'true' });
      mark.innerHTML = SWATCH[key];
      item.append(mark);
    }
    item.append(text);
    legend.append(item);
  }
  inner.append(svg, legend);
  content.append(inner);
  stage.append(content);

  // The card docked under the picture, and the picker row at the top (./parts.js).
  const { card, close, fill } = dockedCard({ close: words.close, id: 'zones' });
  const sentences = el('ul', 'zones-sentences', 'bn');
  card.querySelector('.card-body').append(sentences);

  let selected = null;
  const { bar, select, row } = pickerBar({
    placeholder: words.picker,
    items: zones.map((z) => ({ key: z.id, label: titleOf(z) })),
    current: () => selected ?? undefined,
    choose: (key) => choose(key),
  });
  panel.append(bar, switchRow, stage, card);

  // ---- drawing ------------------------------------------------------------------------------

  const S = (tag, attrs, parent) => parent.appendChild(svgEl(tag, attrs));
  let hits = null; // the zones' discs: their buttons
  let scale = 0; // CSS px per picture unit, as the discs were last sized

  /** A zone's part of the picture: its fills dim and light with the choice. */
  const part = (id, parent) => S('g', { class: 'mz-part', 'data-key': id }, parent);
  const fillOf = (id) => byId.get(id).fill;
  /** A face's outline: faint, and clear — a light halo under a dark line — once its zone is chosen. */
  const outline = (p, poly) => {
    S('polygon', { class: 'halo', points: pts(poly), fill: 'none' }, p);
    S('polygon', { class: 'edge', points: pts(poly), fill: 'none' }, p);
  };

  function render() {
    V = M.views[view];
    svg.replaceChildren();
    const [bx, by, bw, bh] = V.box;
    svg.setAttribute('viewBox', `${bx} ${by} ${bw} ${bh}`);
    const defs = S('defs', {}, svg);
    defs.innerHTML = DEFS;
    const clip = (id, poly) => S('polygon', { points: pts(poly) }, S('clipPath', { id }, defs));
    const scene = S('g', { filter: 'url(#mz-grade)' }, svg);
    const vc = V.cut;
    const dE = dep(U.end);
    const cover = { x: bx, y: by, width: bw, height: bh };

    // The block's shadow on the ground.
    const corners = [P(U.land0, 0, ZB), P(U.land0, 1, ZB), P(U.end, 0, ZB), P(U.end, 1, ZB)];
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    S('ellipse', { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: Math.max(...ys) + 4, rx: (Math.max(...xs) - Math.min(...xs)) / 2 + 10, ry: 14, fill: 'url(#mz-shadow)' }, scene);

    // 1) The seabed's surface, seen through the water: sediment by depth, darker where steep, depth lines.
    const bed = S('g', {}, scene);
    const us = useq(U.coast, U.end, 8);
    clip('mz-c-bed', bedStrip(U.coast, U.end, 8));
    for (let i = 0; i < us.length - 1; i++) {
      const u0 = us[i];
      const u1 = us[i + 1];
      const d = (dep(u0) + dep(u1)) / 2;
      const slope = Math.min(1, Math.abs(dep(u1) - dep(u0)) / (u1 - u0) / 1.2);
      const c = mix(mix('#CBBE98', '#6F6A62', Math.min(1, d / 132)), '#3E3A36', slope * 0.45);
      S('polygon', { points: pts(quad(u0, u1, 0, 1, dep)), fill: c, stroke: c, 'stroke-width': 0.6 }, bed);
    }
    S('rect', { ...cover, filter: 'url(#mz-bed)', opacity: 0.45, style: 'mix-blend-mode:soft-light', 'clip-path': 'url(#mz-c-bed)' }, bed);
    for (const u of [U.base, U.u12, U.u24, 312, 338, U.u200, U.fade]) {
      const [a, b] = [P(u, 0, dep(u)), P(u, 1, dep(u))];
      S('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#F3EEDC', 'stroke-opacity': 0.3, 'stroke-width': 0.8 }, bed);
    }
    let g = part('continental-shelf', scene);
    S('polygon', { class: 'sea', points: pts(bedStrip(U.u12, U.u200, 8)), fill: fillOf('continental-shelf'), 'fill-opacity': 0.5 }, g);
    for (const [a, b, o] of [[U.u200, 370, 0.4], [370, 381, 0.28], [381, 390, 0.16], [390, U.fade, 0.07]]) S('polygon', { class: 'sea', points: pts(bedStrip(a, b, 4)), fill: fillOf('continental-shelf'), 'fill-opacity': o }, g);
    g = part('the-area', scene);
    S('polygon', { class: 'sea', points: pts(bedStrip(U.fade, U.end, 4)), fill: fillOf('the-area'), 'fill-opacity': 0.5 }, g);
    for (let i = 0; i < 60; i++) {
      const u = U.fade + 4 + ((i * 37) % 48);
      const p = P(u, ((i * 53) % 100) / 100, dep(u) - 0.5);
      S('ellipse', { class: 'band', cx: p[0], cy: p[1], rx: 1.5, ry: 1, fill: '#2B2522' }, g);
    }

    // 2) The water's surface: clear over the shallows, opaque over the deep sea.
    const surf = S('g', {}, scene);
    clip('mz-c-surf', surfPoly());
    S('polygon', { points: pts([...coastLine(), P(78, 1, 0), P(78, 0, 0)]), fill: '#7CC6BC', 'fill-opacity': 0.22 }, surf);
    const su = useq(78, U.end, 6);
    for (let i = 0; i < su.length - 1; i++) {
      const u0 = su[i];
      const u1 = su[i + 1];
      const t = Math.min(1, (dep(u0) + dep(u1)) / 2 / 120);
      const c = mix(mix('#7CC6BC', '#2E7F9E', Math.min(1, t * 2)), '#103B5E', Math.max(0, t * 1.4 - 0.4));
      const o = Math.min(0.96, 0.2 + Math.pow(t, 1.15) * 0.95);
      S('polygon', { points: pts(quad(u0, u1, 0, 1, flat)), fill: c, 'fill-opacity': o, stroke: c, 'stroke-opacity': o, 'stroke-width': 0.5 }, surf);
    }
    S('rect', { ...cover, filter: 'url(#mz-ripple)', opacity: 0.32, style: 'mix-blend-mode:soft-light', 'clip-path': 'url(#mz-c-surf)' }, surf);
    S('rect', { ...cover, filter: 'url(#mz-glint)', opacity: 0.25, style: 'mix-blend-mode:screen', 'clip-path': 'url(#mz-c-surf)' }, surf);
    S('rect', { ...cover, fill: 'url(#mz-haze)', 'clip-path': 'url(#mz-c-surf)' }, surf);
    S('polyline', { points: pts(coastLine()), fill: 'none', stroke: '#E8F6F2', 'stroke-width': 3, 'stroke-opacity': 0.55, filter: 'url(#mz-soft)' }, surf);

    // 3) The water zones' fills on the surface; the contiguous zone hatched over the EEZ's inner part.
    const tops = {
      'internal-waters': [...coastLine(), P(U.base, 1, 0), P(U.base, 0, 0)],
      'territorial-sea': quad(U.base, U.u12, 0, 1, flat),
      eez: quad(U.u12, U.u200, 0, 1, flat),
      'high-seas': quad(U.u200, U.end, 0, 1, flat),
      'contiguous-zone': quad(U.u12, U.u24, 0, 1, flat),
    };
    for (const [id, poly] of Object.entries(tops)) {
      const p = part(id, scene);
      S('polygon', { class: 'top', points: pts(poly), fill: fillOf(id) }, p);
      outline(p, poly);
      if (id === 'contiguous-zone') S('polygon', { class: 'band', points: pts(poly), fill: 'url(#mz-hatch)' }, p);
    }
    // The baseline: a dashed line across the bay's mouth.
    const [b0, b1] = [P(U.base, 0, 0), P(U.base, 1, 0)];
    S('line', { x1: b0[0], y1: b0[1], x2: b1[0], y2: b1[1], stroke: '#0B1E26', 'stroke-opacity': 0.55, 'stroke-width': 3.2 }, scene);
    S('line', { x1: b0[0], y1: b0[1], x2: b1[0], y2: b1[1], stroke: '#F4F8F9', 'stroke-width': 1.6, 'stroke-dasharray': '6 4' }, scene);

    // 4) The land: terrain, hills, the beach.
    const land = S('g', {}, scene);
    const landPoly = [P(U.land0, 0, 0), ...coastLine(), P(U.land0, 1, 0)];
    clip('mz-c-land', landPoly);
    S('polygon', { points: pts(landPoly), fill: 'url(#mz-land)' }, land);
    S('rect', { ...cover, filter: 'url(#mz-terrain)', opacity: 0.55, style: 'mix-blend-mode:soft-light', 'clip-path': 'url(#mz-c-land)' }, land);
    for (const [u, v, w, h] of M.decor[view].hills) {
      const c = P(u, v, 0);
      const d = `M${c[0] - w},${c[1] + 2} C${c[0] - w * 0.5},${c[1] - h} ${c[0] + w * 0.3},${c[1] - h * 1.05} ${c[0] + w},${c[1] + 2} Z`;
      S('path', { d, fill: 'url(#mz-hill)' }, land);
      S('path', { d, fill: '#000', filter: 'url(#mz-terrain-in)', opacity: 0.55, style: 'mix-blend-mode:soft-light' }, land);
    }
    S('polyline', { points: pts(coastLine()), fill: 'none', stroke: '#D9C89E', 'stroke-width': 4, 'stroke-linecap': 'round' }, land);

    // 5) The profile's cut face: sediment layers under the seabed, and the water column.
    const face = S('g', {}, scene);
    for (const [d, c] of [[0, '#A39478'], [9, '#B3A283'], [30, '#958670'], [58, '#7E7366'], [92, '#68625D'], [128, '#514C4A']]) S('polygon', { points: pts(profileLayer(vc, d)), fill: c }, face);
    for (const d of [18, 44, 75, 110]) S('polyline', { points: pts(profileLayer(vc, d).slice(0, -2)), fill: 'none', stroke: '#F2EBDD', 'stroke-opacity': 0.12, 'stroke-width': 1 }, face);
    clip('mz-c-face', profileLayer(vc, 0));
    S('rect', { ...cover, filter: 'url(#mz-grain)', opacity: 0.2, style: 'mix-blend-mode:multiply', 'clip-path': 'url(#mz-c-face)' }, face);
    const [lA, lB, lC, lD] = [P(U.land0, vc, 0), P(U.coast, vc, 0), P(U.coast, vc, 5), P(U.land0, vc, 5)];
    S('polygon', { points: pts([lA, lB, lC, lD]), fill: '#4E6534' }, face);
    S('polygon', { points: pts([lD, lC, P(U.coast, vc, 13), P(U.land0, vc, 13)]), fill: '#4A3D31', 'fill-opacity': 0.85 }, face);
    const water = profileWater(vc, U.coast, U.end);
    clip('mz-c-water', water);
    S('polygon', { points: pts(water), fill: 'url(#mz-deep)' }, face);
    if (view === 'side') {
      for (const [x, w, s] of [[150, 18, 40], [232, 14, 52], [318, 22, 70], [400, 16, 60]]) S('polygon', { points: pts([[x, 180], [x + w, 180], [x + w + s, 350], [x + s - 10, 350]]), fill: 'url(#mz-ray)', opacity: 0.35, style: 'mix-blend-mode:screen', 'clip-path': 'url(#mz-c-water)' }, face);
    } else S('polygon', { points: pts(profileLayer(vc, -200)), fill: '#0B1E26', 'fill-opacity': 0.2 }, face);
    S('polyline', { points: pts(useq(U.coast, U.end, 6).map((u) => P(u, vc, dep(u)))), fill: 'none', stroke: '#C2B597', 'stroke-width': 3, 'stroke-opacity': 0.9 }, face);
    const [r0, r1] = [P(U.coast, vc, 0), P(U.end, vc, 0)];
    S('line', { x1: r0[0], y1: r0[1], x2: r1[0], y2: r1[1], stroke: '#E9F7FB', 'stroke-width': 1.4, 'stroke-opacity': 0.8 }, face);
    const fronts = { 'internal-waters': [U.coast, U.base], 'territorial-sea': [U.base, U.u12], eez: [U.u12, U.u200], 'high-seas': [U.u200, U.end] };
    for (const [id, [u0, u1]] of Object.entries(fronts)) {
      const p = part(id, face);
      S('polygon', { class: 'front', points: pts(profileWater(vc, u0, u1)), fill: fillOf(id) }, p);
      outline(p, profileWater(vc, u0, u1));
    }
    const cq = useq(U.u12, U.u24, 6);
    const czFront = [...cq.map((u) => P(u, vc, 0)), ...cq.slice().reverse().map((u) => P(u, vc, Math.min(22, dep(u))))];
    const czPart = part('contiguous-zone', face);
    S('polygon', { class: 'band', points: pts(czFront), fill: 'url(#mz-hatch)' }, czPart);
    outline(czPart, czFront);
    for (const u of [U.base, U.u12, U.u24, U.u200]) {
      const [a, b] = [P(u, vc, 0), P(u, vc, dep(u))];
      S('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#E3F2F7', 'stroke-opacity': 0.55, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, face);
    }
    g = part('continental-shelf', face);
    S('polygon', { class: 'sea', points: pts(bandOnProfile(vc, U.u12, U.u200, 10)), fill: fillOf('continental-shelf') }, g);
    for (const [a, b, o] of [[U.u200, 370, 0.75], [370, 381, 0.5], [381, 390, 0.3], [390, U.fade, 0.14]]) S('polygon', { class: 'sea', points: pts(bandOnProfile(vc, a, b, 10)), fill: fillOf('continental-shelf'), 'fill-opacity': o }, g);
    outline(g, bandOnProfile(vc, U.u12, U.fade, 10));
    g = part('the-area', face);
    S('polygon', { class: 'sea', points: pts(bandOnProfile(vc, U.fade, U.end, 10)), fill: fillOf('the-area') }, g);
    outline(g, bandOnProfile(vc, U.fade, U.end, 10));
    for (let i = 0; i < 16; i++) {
      const u = U.fade + 2 + i * 3.1;
      const p = P(u, vc, dep(u) - 1.2);
      S('ellipse', { class: 'band', cx: p[0], cy: p[1], rx: 1.8, ry: 1.2, fill: '#2B2522' }, g);
    }

    // 6) The open sea's end face: the right side from the side, the near face from the sea.
    const endFace = S('g', {}, scene);
    const eq = (z0, z1) => [P(U.end, 0, z0), P(U.end, 1, z0), P(U.end, 1, z1), P(U.end, 0, z1)];
    for (const [d, c] of [[0, '#A39478'], [9, '#B3A283'], [30, '#958670']]) S('polygon', { points: pts(eq(Math.min(dE + d, ZB), ZB)), fill: c }, endFace);
    S('polygon', { points: pts(eq(0, dE)), fill: 'url(#mz-deep)' }, endFace);
    if (view === 'side') S('polygon', { points: pts(eq(0, ZB)), fill: '#0B1E26', 'fill-opacity': 0.3 }, endFace);
    const hsEnd = part('high-seas', endFace);
    S('polygon', { class: 'front', points: pts(eq(0, dE)), fill: fillOf('high-seas') }, hsEnd);
    outline(hsEnd, eq(0, dE));
    S('polygon', { class: 'sea', points: pts(eq(dE, dE + 10)), fill: fillOf('the-area') }, part('the-area', endFace));
    const [e0, e1] = [P(U.end, 0, 0), P(U.end, 1, 0)];
    S('line', { x1: e0[0], y1: e0[1], x2: e1[0], y2: e1[1], stroke: '#E9F7FB', 'stroke-width': 1, 'stroke-opacity': 0.6 }, endFace);

    // 7) Ships, and a platform standing on the shelf: simple shapes of our own.
    const deco = S('g', { 'aria-hidden': 'true' }, scene);
    for (const [u, v, s] of M.decor[view].ships) {
      const p = P(u, v, 0);
      const ship = S('g', { transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) scale(${s})` }, deco);
      S('path', { d: 'M-34,1 L-62,-3 M-34,3 L-64,7', stroke: '#F2FBFF', 'stroke-opacity': 0.55, 'stroke-width': 1.2, fill: 'none' }, ship);
      S('ellipse', { cx: 0, cy: 3, rx: 24, ry: 2.6, fill: '#06212F', opacity: 0.35 }, ship);
      S('path', { d: 'M-22,-2 L20,-2 L24,-6 L25,-1 L19,4 L-20,4 Z', fill: 'url(#mz-hull)' }, ship);
      for (const [c, cx] of [['#7A5C48', -17], ['#4F6D7A', -11], ['#8C7B5A', -5], ['#5D6B57', 1], ['#7A4E45', 7]]) S('rect', { x: cx, y: -7, width: 5.6, height: 5, fill: c }, ship);
      S('rect', { x: 13, y: -12, width: 6, height: 10, fill: '#E6EAEC' }, ship);
      S('rect', { x: 13, y: -12, width: 6, height: 2, fill: '#9AA5AC' }, ship);
    }
    const ru = M.decor.platform;
    const [s0, t0] = [P(ru, vc, dep(ru)), P(ru, vc, -5)];
    S('path', { d: `M${s0[0] - 8},${s0[1]} L${t0[0] - 6},${t0[1]} M${s0[0] + 8},${s0[1]} L${t0[0] + 6},${t0[1]}`, stroke: 'url(#mz-steel)', 'stroke-width': 2.6, fill: 'none' }, deco);
    S('path', { d: `M${s0[0] - 7},${s0[1] - 5} L${t0[0] + 5},${t0[1] + 8} M${s0[0] + 7},${s0[1] - 5} L${t0[0] - 5},${t0[1] + 8}`, stroke: '#7D888F', 'stroke-width': 0.9, fill: 'none' }, deco);
    const dk = [t0[0], t0[1] - 6];
    S('rect', { x: dk[0] - 12, y: dk[1], width: 24, height: 6, fill: '#56616A' }, deco);
    S('rect', { x: dk[0] - 12, y: dk[1], width: 24, height: 1.5, fill: '#A9B3BA' }, deco);
    S('path', { d: `M${dk[0] + 1},${dk[1]} L${dk[0] + 4.5},${dk[1] - 23} L${dk[0] + 8},${dk[1]} M${dk[0] + 2},${dk[1] - 7} L${dk[0] + 7},${dk[1] - 7} M${dk[0] + 3},${dk[1] - 14} L${dk[0] + 6},${dk[1] - 14}`, fill: 'none', stroke: '#C2CAD0', 'stroke-width': 1 }, deco);
    S('rect', { x: dk[0] - 10, y: dk[1] - 6, width: 8, height: 6, fill: '#D5DADD' }, deco);

    // A number in a disc of its zone's colour: on the zone, and on its distance arrow.
    const k = V.k;
    const size = T.size * k;
    const disc = (z, p, parent, cls, fit) => {
      const badge = S('g', { class: cls, filter: 'url(#mz-drop)' }, part(z.id, parent));
      S('circle', { cx: p[0], cy: p[1], r: T.disc * k, fill: M.disc, 'fill-opacity': 0.92, stroke: z.fill, 'stroke-width': 2.5 * k }, badge);
      S('text', { class: `badge-number fit-text${cls === 'badge' ? ' layer-label' : ''}`, x: p[0], y: p[1] + size * 0.33, 'text-anchor': 'middle', 'font-size': size, fill: M.ink, 'data-fit': fit, lang: 'bn' }, badge).textContent = z.numberBn;
    };

    // 8) The distances: nested arrows, every one from the baseline (০), along the block's v = 0 edge —
    //    under the block from the side, left of it from the sea — with the tick labels between the block
    //    and the arrows. The longest is nearest; each arrow's number stands just past its tip, where no
    //    shorter arrow reaches. The shelf's runs on past ২০০, dashed: at least 200, more on conditions.
    const A = M.arrows[view];
    const zEdge = A.z === 'floor' ? ZB : A.z;
    const p0 = P(U.base, 0, zEdge);
    const p1 = P(U.end, 0, zEdge);
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const dir = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
    const away = [p0[0] - P(U.base, 1, zEdge)[0], p0[1] - P(U.base, 1, zEdge)[1]];
    const nrm = -dir[1] * away[0] + dir[0] * away[1] >= 0 ? [-dir[1], dir[0]] : [dir[1], -dir[0]];
    const along = (u, off) => {
      const p = P(u, 0, zEdge);
      return [p[0] + nrm[0] * off * k, p[1] + nrm[1] * off * k];
    };
    const arrows = S('g', { class: 'arrows', 'aria-hidden': 'true' }, svg);
    const seg = (a, b, cls) => S('line', { class: cls, x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, arrows);
    const uOf = { u12: U.u12, u24: U.u24, u200: U.u200, beyond: M.arrows.beyond };
    const last = A.rows.at(-1);
    // The tick labels, each with its extension line out to the arrows that start or end there.
    for (const t of M.ticks) {
      const reach = t.u === U.base ? last : A.rows[M.arrows.order.findIndex(([, to]) => uOf[to] === t.u)];
      seg(along(t.u, A.labels + 9), along(t.u, reach + 4), 'extension');
      const p = along(t.u, A.labels);
      S('text', { class: 'tick-label fit-text', x: p[0], y: p[1], 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': size, 'data-fit': `the tick ${t.label}`, lang: 'bn' }, arrows).textContent = t.label;
    }
    M.arrows.order.forEach(([id, to], i) => {
      const off = A.rows[i];
      const tip = along(uOf[to], off);
      const from = along(U.base, off);
      if (to === 'beyond') {
        seg(from, along(U.u200, off), 'arrow');
        seg(along(U.u200, off), tip, 'arrow beyond');
      } else seg(from, tip, 'arrow');
      // The arrowhead at the tip.
      const h = 7 * k;
      const w = 3.5 * k;
      const back = [tip[0] - dir[0] * h, tip[1] - dir[1] * h];
      S('path', { class: 'head', d: `M${tip[0]},${tip[1]} L${back[0] + nrm[0] * w},${back[1] + nrm[1] * w} L${back[0] - nrm[0] * w},${back[1] - nrm[1] * w} Z` }, arrows);
      const r = (T.disc + 3) * k;
      disc(byId.get(id), [tip[0] + nrm[0] * r, tip[1] + nrm[1] * r], arrows, 'arrow-badge', `the arrow ${byId.get(id).numberBn}`);
    });

    // 9) The numbers, coast to sea, each in a disc of its zone's colour.
    const at = {};
    for (const z of zones) {
      const [u, v, zz] = M.badges[view][z.id];
      const p = P(u, v, typeof zz === 'string' ? dep(u) + Number(zz.slice(4)) : zz);
      at[z.id] = p;
      disc(z, p, svg, 'badge', `the number ${z.numberBn}`);
    }

    // 10) What takes a tap: each zone's surface and faces, then over everything each zone's disc —
    //     its button, at least 2 × T.hitPx CSS px across, sized by layout().
    const areas = S('g', { class: 'zone-areas' }, svg);
    const areaOf = {
      'internal-waters': [tops['internal-waters'], profileWater(vc, U.coast, U.base)],
      'territorial-sea': [tops['territorial-sea'], profileWater(vc, U.base, U.u12)],
      eez: [tops.eez, profileWater(vc, U.u12, U.u200)],
      'high-seas': [tops['high-seas'], profileWater(vc, U.u200, U.end), eq(0, dE)],
      'contiguous-zone': [tops['contiguous-zone'], czFront],
      'continental-shelf': [bandOnProfile(vc, U.u12, U.fade, 44)],
      'the-area': [bandOnProfile(vc, U.fade, U.end, 44), eq(dE, ZB)],
    };
    const path = (poly) => `M${poly.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')} Z`;
    for (const [id, polys] of Object.entries(areaOf)) S('path', { class: 'zone-area', 'data-key': id, d: polys.map(path).join(' ') }, areas);
    hits = S('g', { class: 'zone-hits' }, svg);
    for (const z of zones) S('circle', { class: 'zone', cx: at[z.id][0], cy: at[z.id][1], r: T.disc, 'data-key': z.id, 'data-title': titleOf(z), role: 'button', tabindex: 0, 'aria-label': titleOf(z) }, hits);
    scale = 0;
    layout();
  }

  // ---- choosing -----------------------------------------------------------------------------

  function light() {
    svg.classList.toggle('has-lit', selected !== null);
    for (const node of svg.querySelectorAll('[data-key]')) node.classList.toggle('lit', node.dataset.key === selected);
  }

  function choose(key) {
    const z = byId.get(key);
    if (!z) return;
    selected = key;
    fill(titleOf(z), [], {});
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
    light();
    layout();
  }

  function clear(returnFocus) {
    if (selected === null) return;
    const was = selected;
    selected = null;
    card.hidden = true;
    select.value = '';
    row.sync();
    light();
    layout();
    if (returnFocus) svg.querySelector(`.zone[data-key="${was}"]`)?.focus();
  }

  stage.addEventListener('click', (event) => {
    const key = event.target.closest?.('.zone, .zone-area')?.dataset.key;
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
  switchRow.addEventListener('click', (event) => {
    const next = event.target.closest?.('.zones-view')?.dataset.view;
    if (!next || next === view) return;
    view = next;
    for (const [key, b] of Object.entries(switches)) b.setAttribute('aria-pressed', String(key === view));
    render();
    light();
  });

  // ---- layout, in CSS px ----------------------------------------------------------------

  function layout() {
    const W = stage.clientWidth;
    if (!W) return;
    const [, , bw, bh] = V.box;
    const width = Math.min(MAX_WIDTH, W - 2 * GUTTER);
    svg.setAttribute('width', width.toFixed(0));
    svg.setAttribute('height', ((width * bh) / bw).toFixed(0));
    // Each disc's tap target: at least T.hitPx CSS px in radius, whatever the picture's scale.
    const next = width / bw;
    if (next !== scale && hits) {
      scale = next;
      for (const c of hits.children) c.setAttribute('r', Math.max(T.disc, T.hitPx / scale).toFixed(2));
    }
  }

  window.addEventListener('resize', () => layout());

  render();
  light();
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
