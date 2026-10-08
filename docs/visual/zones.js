/*
|--------------------------------------------------------------------------
| THE ZONES VIEW — the sea's zones in a block of land and sea, drawn in code.
|--------------------------------------------------------------------------
|
| Loaded only for a view of type `zones` (maritime-zones). The view's file
| (built by tools/build-diagram-maritime-zones.mjs) holds one 3D model — u,
| the distance from the land toward the open sea; v, 0 to 1 along the coast;
| z, the depth — drawn in one projection, from the side, its profile cut in
| front (step 3d: the sea view and its switch are gone; this view is now the
| 3D view's fallback without WebGL). Not to scale.
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
| The distances are coloured bars on the sea surface, each in its zone's
| colour and every one from the baseline (০): ০→১২ (২), ০→২৪ (৩, hatched),
| ০→২০০ (৪) and the shelf's ০→২০০ then dashed beyond (৫) — along the front
| edge. The zones' own areas stay
| where the Convention puts them; only the bars start at the baseline.
|
| The picker row at the top is the main way in; its items, the card's title
| and each disc read «<number>. <name>». Each disc is its zone's tap target,
| at least 44 px across on any screen (an invisible circle round the number);
| the zone's own surface and faces take a tap too. Every zone keeps its full
| colour: choosing outlines the chosen one, strengthens its discs' rings and
| docks the card with its sentences; ×, Escape or a second tap closes it, and
| focus returns to the zone's disc. The Area is drawn in the seed's purple, as
| the 3D view draws it: its faces in its band colour, its floor and the
| legend's swatch in its nodule ground (step 3d).
|
| The picture is as wide as the stage and about half a phone's screen tall
| (step 2d), at the stage's top: its frame is cropped to the drawing,
| the legend inside it, and at 1× its width is the stage's; a two-finger pinch
| zooms 1×–3× and a drag pans, a double tap goes back to 1×, the wheel zooms
| on a desktop. With the card open the stage is shorter and the picture keeps
| its 1× size, centred on the chosen zone's number. The picture is drawn
| once; choosing changes classes only, and zooming the frame and the discs'
| reach.
|
| Every word shown is the descriptor's or the data's.
*/

import { dockedCard, el, pickerBar, stylesheet, svgEl } from './parts.js?v=d75c4ba2ef';

// Picture units of margin round the drawing, and of space under it before the legend.
const PAD = 6;
const LEGEND_GAP = 18;
// A tap that moves less than this (CSS px) is a tap; two taps on one zone within DOUBLE ms are a double tap.
const TAP_SLOP = 8;
const DOUBLE = 300;

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
  area: '<rect width="26" height="16" fill="AREA_GROUND"/><g fill="#2B2522"><ellipse cx="5" cy="5" rx="2" ry="1.4"/><ellipse cx="13" cy="10" rx="2" ry="1.4"/><ellipse cx="21" cy="5" rx="2" ry="1.4"/><ellipse cx="8" cy="12" rx="1.6" ry="1.1"/><ellipse cx="18" cy="12" rx="1.6" ry="1.1"/></g>',
};

export async function mount(panel, { descriptor, data, art }) {
  const words = descriptor.words ?? {};
  const M = await art;
  await Promise.all([stylesheet('../shared/picker.css?v=d75c4ba2ef'), stylesheet('./zones.css?v=d75c4ba2ef')]);

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

  const V = M.views.side;
  const P = (u, v, z) => [V.x[0] * u + V.x[1] * v + V.x[2] * z + V.x[3], V.y[0] * u + V.y[1] * v + V.y[2] * z + V.y[3]];
  let box = null; // the drawing's extent, [x0, y0, x1, y1], grown as it is drawn
  const grow = (x, y, r = 0) => {
    if (!box) box = [x - r, y - r, x + r, y + r];
    else box = [Math.min(box[0], x - r), Math.min(box[1], y - r), Math.max(box[2], x + r), Math.max(box[3], y + r)];
  };
  const pts = (a) =>
    a
      .map((p) => {
        grow(p[0], p[1]);
        return `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      })
      .join(' ');
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
    return [...q.map((u) => P(u, vc, dep(u))), ...q.slice().reverse().map((u) => P(u, vc, Math.min(dep(u) + th, ZB)))];
  };

  // ---- the page ------------------------------------------------------------------------

  panel.classList.add('zones');

  const stage = el('div', 'stage');
  const content = el('div', 'stage-content loading');
  const svg = svgEl('svg', { class: 'zones-svg', role: 'group', preserveAspectRatio: 'xMidYMid meet' });
  if (descriptor.title?.bn) svg.setAttribute('aria-label', descriptor.title.bn);
  const L = words.legend ?? {};
  content.append(svg);
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
  panel.append(bar, stage, card);

  // ---- drawing ------------------------------------------------------------------------------

  const S = (tag, attrs, parent) => parent.appendChild(svgEl(tag, attrs));
  let hits = null; // the zones' discs: their buttons
  let scale = 0; // CSS px per picture unit, as the discs were last sized
  let frame = null; // the drawing's frame, [x, y, width, height], cropped to it
  let at = {}; // each zone's number, in picture units
  let zoom = 1; // 1× to 3×
  let centre = null; // the frame's point at the stage's middle, or null for the frame's own middle
  const covers = []; // the textures' rects, as large as the frame
  const cover = (attrs, parent) => {
    const r = S('rect', attrs, parent);
    covers.push(r);
    return r;
  };

  /** A zone's part of the picture: its fills dim and light with the choice. */
  const part = (id, parent) => S('g', { class: 'mz-part', 'data-key': id }, parent);
  const fillOf = (id) => byId.get(id).fill;
  // The Area as the 3D view draws it, the seed's purple: its faces in its band, its floor in its nodule ground.
  const AREA = byId.get('the-area');
  const areaFace = AREA.band ?? AREA.fill;
  const areaGround = AREA.texture ?? AREA.fill;
  /** A face's outline: faint, and clear — a light halo under a dark line — once its zone is chosen. */
  const outline = (p, poly) => {
    S('polygon', { class: 'halo', points: pts(poly), fill: 'none' }, p);
    S('polygon', { class: 'edge', points: pts(poly), fill: 'none' }, p);
  };

  function render() {
    svg.replaceChildren();
    box = null;
    covers.length = 0;
    const defs = S('defs', {}, svg);
    defs.innerHTML = DEFS;
    const clip = (id, poly) => S('polygon', { points: pts(poly) }, S('clipPath', { id }, defs));
    const scene = S('g', { filter: 'url(#mz-grade)' }, svg);
    const vc = V.cut;
    const dE = dep(U.end);

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
    cover({ filter: 'url(#mz-bed)', opacity: 0.45, style: 'mix-blend-mode:soft-light', 'clip-path': 'url(#mz-c-bed)' }, bed);
    for (const u of [U.base, U.u12, U.u24, 312, 338, U.u200, U.fade]) {
      const [a, b] = [P(u, 0, dep(u)), P(u, 1, dep(u))];
      S('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#F3EEDC', 'stroke-opacity': 0.3, 'stroke-width': 0.8 }, bed);
    }
    let g = part('continental-shelf', scene);
    S('polygon', { class: 'sea', points: pts(bedStrip(U.u12, U.u200, 8)), fill: fillOf('continental-shelf'), 'fill-opacity': 0.5 }, g);
    for (const [a, b, o] of [[U.u200, 370, 0.4], [370, 381, 0.28], [381, 390, 0.16], [390, U.fade, 0.07]]) S('polygon', { class: 'sea', points: pts(bedStrip(a, b, 4)), fill: fillOf('continental-shelf'), 'fill-opacity': o }, g);
    g = part('the-area', scene);
    S('polygon', { class: 'sea', points: pts(bedStrip(U.fade, U.end, 4)), fill: areaGround, 'fill-opacity': 0.5 }, g);
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
    cover({ filter: 'url(#mz-ripple)', opacity: 0.32, style: 'mix-blend-mode:soft-light', 'clip-path': 'url(#mz-c-surf)' }, surf);
    cover({ filter: 'url(#mz-glint)', opacity: 0.25, style: 'mix-blend-mode:screen', 'clip-path': 'url(#mz-c-surf)' }, surf);
    cover({ fill: 'url(#mz-haze)', 'clip-path': 'url(#mz-c-surf)' }, surf);
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
    cover({ filter: 'url(#mz-terrain)', opacity: 0.55, style: 'mix-blend-mode:soft-light', 'clip-path': 'url(#mz-c-land)' }, land);
    for (const [u, v, w, h] of M.decor.side.hills) {
      const c = P(u, v, 0);
      const d = `M${c[0] - w},${c[1] + 2} C${c[0] - w * 0.5},${c[1] - h} ${c[0] + w * 0.3},${c[1] - h * 1.05} ${c[0] + w},${c[1] + 2} Z`;
      grow(c[0] - w, c[1] - h);
      grow(c[0] + w, c[1] + 2);
      S('path', { d, fill: 'url(#mz-hill)' }, land);
      S('path', { d, fill: '#000', filter: 'url(#mz-terrain-in)', opacity: 0.55, style: 'mix-blend-mode:soft-light' }, land);
    }
    S('polyline', { points: pts(coastLine()), fill: 'none', stroke: '#D9C89E', 'stroke-width': 4, 'stroke-linecap': 'round' }, land);

    // 5) The profile's cut face: sediment layers under the seabed, and the water column.
    const face = S('g', {}, scene);
    for (const [d, c] of [[0, '#A39478'], [9, '#B3A283'], [30, '#958670'], [58, '#7E7366'], [92, '#68625D'], [128, '#514C4A']]) S('polygon', { points: pts(profileLayer(vc, d)), fill: c }, face);
    for (const d of [18, 44, 75, 110]) S('polyline', { points: pts(profileLayer(vc, d).slice(0, -2)), fill: 'none', stroke: '#F2EBDD', 'stroke-opacity': 0.12, 'stroke-width': 1 }, face);
    clip('mz-c-face', profileLayer(vc, 0));
    cover({ filter: 'url(#mz-grain)', opacity: 0.2, style: 'mix-blend-mode:multiply', 'clip-path': 'url(#mz-c-face)' }, face);
    const [lA, lB, lC, lD] = [P(U.land0, vc, 0), P(U.coast, vc, 0), P(U.coast, vc, 5), P(U.land0, vc, 5)];
    S('polygon', { points: pts([lA, lB, lC, lD]), fill: '#4E6534' }, face);
    S('polygon', { points: pts([lD, lC, P(U.coast, vc, 13), P(U.land0, vc, 13)]), fill: '#4A3D31', 'fill-opacity': 0.85 }, face);
    const water = profileWater(vc, U.coast, U.end);
    clip('mz-c-water', water);
    S('polygon', { points: pts(water), fill: 'url(#mz-deep)' }, face);
    for (const [u, w, d] of M.decor.side.rays) S('polygon', { points: pts([P(u, 0, 0), P(u + w, 0, 0), P(u + w + d, 0, ZB), P(u + d - 10, 0, ZB)]), fill: 'url(#mz-ray)', opacity: 0.35, style: 'mix-blend-mode:screen', 'clip-path': 'url(#mz-c-water)' }, face);
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
    S('polygon', { class: 'sea', points: pts(bandOnProfile(vc, U.fade, U.end, 10)), fill: areaFace }, g);
    outline(g, bandOnProfile(vc, U.fade, U.end, 10));
    for (let i = 0; i < 16; i++) {
      const u = U.fade + 2 + i * 3.1;
      const p = P(u, vc, dep(u) - 1.2);
      S('ellipse', { class: 'band', cx: p[0], cy: p[1], rx: 1.8, ry: 1.2, fill: '#2B2522' }, g);
    }

    // 6) The open sea's end face, on the right.
    const endFace = S('g', {}, scene);
    const eq = (z0, z1) => [P(U.end, 0, z0), P(U.end, 1, z0), P(U.end, 1, z1), P(U.end, 0, z1)];
    for (const [d, c] of [[0, '#A39478'], [9, '#B3A283'], [30, '#958670']]) S('polygon', { points: pts(eq(Math.min(dE + d, ZB), ZB)), fill: c }, endFace);
    S('polygon', { points: pts(eq(0, dE)), fill: 'url(#mz-deep)' }, endFace);
    S('polygon', { points: pts(eq(0, ZB)), fill: '#0B1E26', 'fill-opacity': 0.3 }, endFace);
    const hsEnd = part('high-seas', endFace);
    S('polygon', { class: 'front', points: pts(eq(0, dE)), fill: fillOf('high-seas') }, hsEnd);
    outline(hsEnd, eq(0, dE));
    S('polygon', { class: 'sea', points: pts(eq(dE, dE + 10)), fill: areaFace }, part('the-area', endFace));
    const [e0, e1] = [P(U.end, 0, 0), P(U.end, 1, 0)];
    S('line', { x1: e0[0], y1: e0[1], x2: e1[0], y2: e1[1], stroke: '#E9F7FB', 'stroke-width': 1, 'stroke-opacity': 0.6 }, endFace);

    // 7) Ships, and a platform standing on the shelf: simple shapes of our own.
    const deco = S('g', { 'aria-hidden': 'true' }, scene);
    for (const [u, v, s] of M.decor.side.ships) {
      const p = P(u, v, 0);
      const ship = S('g', { transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) scale(${s})` }, deco);
      grow(p[0] - 64 * s, p[1] - 12 * s);
      grow(p[0] + 25 * s, p[1] + 7 * s);
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
    grow(dk[0] - 12, dk[1] - 23);
    S('rect', { x: dk[0] - 12, y: dk[1], width: 24, height: 6, fill: '#56616A' }, deco);
    S('rect', { x: dk[0] - 12, y: dk[1], width: 24, height: 1.5, fill: '#A9B3BA' }, deco);
    S('path', { d: `M${dk[0] + 1},${dk[1]} L${dk[0] + 4.5},${dk[1] - 23} L${dk[0] + 8},${dk[1]} M${dk[0] + 2},${dk[1] - 7} L${dk[0] + 7},${dk[1] - 7} M${dk[0] + 3},${dk[1] - 14} L${dk[0] + 6},${dk[1] - 14}`, fill: 'none', stroke: '#C2CAD0', 'stroke-width': 1 }, deco);
    S('rect', { x: dk[0] - 10, y: dk[1] - 6, width: 8, height: 6, fill: '#D5DADD' }, deco);

    // A number in a disc of its zone's colour: on the zone, and at its distance bar's tip.
    const size = T.size;
    const disc = (z, p, parent, cls) => {
      grow(p[0], p[1], T.disc + 2);
      const badge = S('g', { class: cls, filter: 'url(#mz-drop)' }, part(z.id, parent));
      S('circle', { cx: p[0], cy: p[1], r: T.disc, fill: M.disc, 'fill-opacity': 0.92, stroke: z.fill, 'stroke-width': 2.5 }, badge);
      S('text', { class: `badge-number fit-text${cls === 'badge' ? ' layer-label' : ''}`, x: p[0], y: p[1] + size * 0.33, 'text-anchor': 'middle', 'font-size': size, fill: M.ink, lang: 'bn' }, badge).textContent = z.numberBn;
    };

    // 8) The distances, in colour (step 2d): thin strips on the sea surface along its v = 0 edge — the
    //    front edge — each in its zone's colour and every one
    //    starting at the baseline (০): ০→১২, ০→২৪ (hatched), ০→২০০, and the shelf's ০→২০০ then dashed
    //    beyond. Each zone's number stands just past its bar's tip; the tick labels stand off the edge.
    //    The zones' own areas stay where the Convention puts them; only the bars start at the baseline.
    const B2 = M.bars.side;
    const uOf = { u12: U.u12, u24: U.u24, u200: U.u200, beyond: M.bars.beyond };
    // Picture units per unit of v, and per unit of u, along the v = 0 edge.
    const vLen = Math.hypot(P(U.base, 1, 0)[0] - P(U.base, 0, 0)[0], P(U.base, 1, 0)[1] - P(U.base, 0, 0)[1]);
    const uLen = Math.hypot(P(U.end, 0, 0)[0] - P(U.base, 0, 0)[0], P(U.end, 0, 0)[1] - P(U.base, 0, 0)[1]) / (U.end - U.base);
    const bars = S('g', { class: 'bars', 'aria-hidden': 'true' }, svg);
    M.bars.order.forEach(([id, to], i) => {
      const v0 = (B2.gap + i * (B2.thick + B2.gap)) / vLen;
      const v1 = v0 + B2.thick / vLen;
      const p = part(id, bars);
      const end = uOf[to];
      const solidEnd = to === 'beyond' ? U.u200 : end;
      const strip = quad(U.base, solidEnd, v0, v1, flat);
      S('polygon', { class: 'bar', points: pts(strip), fill: fillOf(id) }, p);
      if (id === 'contiguous-zone') S('polygon', { class: 'bar-hatch', points: pts(strip), fill: 'url(#mz-hatch)' }, p);
      if (to === 'beyond') {
        // Past ২০০, dashed: at least 200, more on conditions.
        for (let u = U.u200 + 4; u < end - 2; u += 10) S('polygon', { class: 'bar', points: pts(quad(u, Math.min(u + 6, end), v0, v1, flat)), fill: fillOf(id) }, p);
      }
      outline(p, quad(U.base, end, v0, v1, flat));
      // The number, just past the tip.
      disc(byId.get(id), P(end + (T.disc + 4) / uLen, (v0 + v1) / 2, 0), p, 'bar-badge');
    });
    // The baseline over the bars' starts, so each is seen to start there.
    const vTop = (B2.gap + M.bars.order.length * (B2.thick + B2.gap)) / vLen;
    const [s0b, s1b] = [P(U.base, 0, 0), P(U.base, vTop, 0)];
    S('line', { x1: s0b[0], y1: s0b[1], x2: s1b[0], y2: s1b[1], stroke: '#0B1E26', 'stroke-opacity': 0.55, 'stroke-width': 3.2 }, bars);
    S('line', { x1: s0b[0], y1: s0b[1], x2: s1b[0], y2: s1b[1], stroke: '#F4F8F9', 'stroke-width': 1.6, 'stroke-dasharray': '6 4' }, bars);
    // The tick labels, off the edge, away from the surface, on a light halo.
    const off = [P(U.base, 0, 0)[0] - P(U.base, 1, 0)[0], P(U.base, 0, 0)[1] - P(U.base, 1, 0)[1]].map((c) => c / vLen);
    // Where two labels stand close, the later one steps out.
    const placed = [];
    const m = 4; // units of room between two labels
    const meets = (a, b) => a.x < b.x + b.width + m && b.x < a.x + a.width + m && a.y < b.y + b.height + m && b.y < a.y + a.height + m;
    for (const t of M.ticks) {
      const q = P(t.u, 0, 0);
      let out = B2.labels;
      // Beside a left edge a label stands to the edge's left, its end toward it; under a front edge, centred.
      const label = S('text', { class: 'tick-label fit-text', 'text-anchor': off[0] < -0.5 ? 'end' : 'middle', 'dominant-baseline': 'central', 'font-size': size, lang: 'bn' }, bars);
      label.textContent = t.label;
      for (let tries = 0; tries < 4; tries++) {
        label.setAttribute('x', (q[0] + off[0] * out).toFixed(1));
        label.setAttribute('y', (q[1] + off[1] * out).toFixed(1));
        if (!placed.some((b) => meets(b, label.getBBox()))) break;
        out += size * 0.6;
      }
      const bb = label.getBBox();
      placed.push(bb);
      grow(bb.x, bb.y);
      grow(bb.x + bb.width, bb.y + bb.height);
    }

    // 9) The numbers, coast to sea, each in a disc of its zone's colour.
    at = {};
    for (const z of zones) {
      const [u, v, zz] = M.badges.side[z.id];
      const p = P(u, v, typeof zz === 'string' ? dep(u) + Number(zz.slice(3)) : zz);
      at[z.id] = p;
      disc(z, p, svg, 'badge');
    }

    // 9b) The legend, under the drawing, in lines as wide as it: the baseline's dashed line, the
    //     contiguous zone's hatch, the Area's nodules, the scale and what the tick numbers count.
    const legend = S('g', { class: 'legend' }, svg);
    const [lx0, , lx1, ly1] = box;
    const line = T.legend * 1.5;
    let lx = lx0;
    let ly = ly1 + LEGEND_GAP + line / 2;
    for (const [key, text] of [['baseline', L.baseline], ['contiguous', L.contiguous], ['area', L.area], [null, L.scale], [null, L.ticks]]) {
      if (!text) continue;
      const t = S('text', { class: 'legend-label fit-text', 'font-size': T.legend, 'dominant-baseline': 'central', lang: 'bn' }, legend);
      t.textContent = text;
      const mark = key ? T.legend * 1.25 + 8 : 0;
      const w = mark + t.getComputedTextLength();
      if (lx > lx0 && lx + w > lx1) {
        lx = lx0;
        ly += line;
      }
      if (key) {
        const sw = S('svg', { x: lx, y: ly - T.legend * 0.38, width: T.legend * 1.25, height: T.legend * 0.76, viewBox: '0 0 26 16', 'aria-hidden': 'true' }, legend);
        sw.innerHTML = SWATCH[key].replace('AREA_GROUND', areaGround);
      }
      t.setAttribute('x', (lx + mark).toFixed(1));
      t.setAttribute('y', ly.toFixed(1));
      grow(lx + w, ly + line / 2);
      lx += w + T.legend;
    }

    // The frame: the drawing and its legend, with a small margin; the textures fill it.
    frame = [box[0] - PAD, box[1] - PAD, box[2] - box[0] + 2 * PAD, box[3] - box[1] + 2 * PAD];
    for (const r of covers) for (const [k2, v2] of Object.entries({ x: frame[0], y: frame[1], width: frame[2], height: frame[3] })) r.setAttribute(k2, v2.toFixed(1));

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
    centre = at[key] ? [...at[key]] : centre;
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

  // A tap chooses (a drag or a pinch is not a tap). A second tap at the same place soon after is a
  // double tap: it takes back what the first one chose — the card may have moved the picture under the
  // finger — and goes back to 1×.
  let last = { t: 0, x: 0, y: 0, before: null };
  stage.addEventListener('click', (event) => {
    if (moved) {
      moved = false;
      return;
    }
    const t = performance.now();
    if (t - last.t < DOUBLE && Math.hypot(event.clientX - last.x, event.clientY - last.y) < TAP_SLOP * 4) {
      const before = last.before;
      last = { t: 0, x: 0, y: 0, before: null };
      if (before !== selected) {
        if (before) choose(before);
        else clear(false);
      }
      zoom = 1;
      centre = selected && at[selected] ? [...at[selected]] : null;
      layout();
      return;
    }
    last = { t, x: event.clientX, y: event.clientY, before: selected };
    const key = event.target.closest?.('.zone, .zone-area')?.dataset.key;
    if (key && key !== selected) choose(key);
    else clear(false);
  });
  // A number brought into view when it takes the keyboard's focus.
  svg.addEventListener('focusin', (event) => {
    const key = event.target.closest?.('.zone')?.dataset.key;
    if (key && at[key]) {
      centre = [...at[key]];
      layout();
    }
  });

  // ---- zooming and panning, inside the stage -------------------------------------------------

  const pointers = new Map(); // pointer id -> [x, y], CSS px
  let moved = false;
  let downAt = null;
  let pinch = null; // { dist, zoom }
  const units = (x, y) => {
    const r = stage.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return [vb.x + ((x - r.left) * vb.width) / r.width, vb.y + ((y - r.top) * vb.height) / r.height];
  };
  /** Zoom to z with the stage point (x, y) staying under the same place of the picture. */
  function zoomAbout(z, x, y) {
    const [ux, uy] = units(x, y);
    zoom = Math.min(3, Math.max(1, z));
    const r = stage.getBoundingClientRect();
    const sNew = (r.width / frame[2]) * zoom;
    centre = [ux - (x - r.left - r.width / 2) / sNew, uy - (y - r.top - r.height / 2) / sNew];
    layout();
  }
  stage.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (pointers.size === 1) {
      moved = false;
      downAt = [event.clientX, event.clientY];
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom };
    }
  });
  window.addEventListener('pointermove', (event) => {
    const was = pointers.get(event.pointerId);
    if (!was || !frame) return;
    const now = [event.clientX, event.clientY];
    pointers.set(event.pointerId, now);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      moved = true;
      zoomAbout((pinch.zoom * Math.hypot(a[0] - b[0], a[1] - b[1])) / pinch.dist, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    } else if (pointers.size === 1) {
      if (!moved && Math.hypot(now[0] - downAt[0], now[1] - downAt[1]) < TAP_SLOP) return;
      moved = true;
      const s = (stage.clientWidth / frame[2]) * zoom;
      const [cx, cy] = centre ?? [frame[0] + frame[2] / 2, frame[1] + frame[3] / 2];
      centre = [cx - (now[0] - was[0]) / s, cy - (now[1] - was[1]) / s];
      layout();
    }
  });
  const lift = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
  };
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);
  stage.addEventListener(
    'wheel',
    (event) => {
      if (!frame) return;
      event.preventDefault();
      zoomAbout(zoom * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    },
    { passive: false },
  );
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

  function layout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!W || !H || !frame) return;
    // 1×: the frame as wide as the stage. The window is the stage's size at the zoom, kept on the frame.
    const s = (W / frame[2]) * zoom;
    const vw = W / s;
    const vh = H / s;
    let [cx, cy] = centre ?? [frame[0] + frame[2] / 2, frame[1] + frame[3] / 2];
    cx = vw >= frame[2] ? frame[0] + frame[2] / 2 : Math.min(Math.max(cx, frame[0] + vw / 2), frame[0] + frame[2] - vw / 2);
    // Shorter than the stage, the picture stands at its top; the room under it is the card's.
    cy = vh >= frame[3] ? frame[1] + vh / 2 : Math.min(Math.max(cy, frame[1] + vh / 2), frame[1] + frame[3] - vh / 2);
    centre = [cx, cy];
    svg.setAttribute('viewBox', `${(cx - vw / 2).toFixed(2)} ${(cy - vh / 2).toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`);
    // Each disc's tap target: T.hitPx CSS px in radius at any zoom.
    if (s !== scale && hits) {
      scale = s;
      for (const c of hits.children) c.setAttribute('r', Math.max(T.disc, T.hitPx / s).toFixed(2));
    }
  }

  window.addEventListener('resize', () => layout());

  const ready = (async () => {
    await document.fonts?.ready;
    render();
    light();
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
