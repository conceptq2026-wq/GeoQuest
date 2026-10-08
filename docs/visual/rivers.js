/*
|--------------------------------------------------------------------------
| THE RIVERS VIEW — a river system drawn in code, on a picture that pans and
| zooms, its lines and markers tappable.
|--------------------------------------------------------------------------
|
| Loaded only for a view of type `rivers` (bangladesh-rivers). Nothing here
| is a tile map and nothing is fetched but the diagram's own JSON and, for a
| frame that asks, one shared file: the view's `art` file (built by
| tools/build-diagram-bangladesh-rivers.mjs) holds the land, Bangladesh, the
| boundaries, every line as SVG path data in the frame's own units, the
| markers and the anchors of the names; the diagram's data holds every word. A
| frame with `districts` also reads the shared district file (sharedData,
| tools/build-bangladesh-districts.mjs): thin grey boundaries behind the
| rivers, and grey names at the frame's anchors — a marker's district from the
| opening view, the rest from zoomAll× — each dropped rather than overlapping.
|
| One <svg> fills the stage. The art sits in one group, moved and scaled as a
| whole (1× is the whole frame fitting the stage; up to 6× from there — the
| user's decision, 2026-09-29, for this module only), every stroke a constant
| width in CSS px. A frame with a `view` opens otherwise: 1× fits the stage's
| width to view.x0–x1, centred on view.cy; it zooms to view.zoomMax, pans in
| every direction as long as view.keep of the picture stays on the stage, and a
| reset control in the stage's bottom-right corner returns to that opening. The markers and the names are laid out over it in CSS px,
| at least 15 px at 390 px wide and 14 px at 320, semi-bold, each put beside
| its anchor where no other name, marker, the legend or ⓘ's tap zone is.
|
| A tap on a line or a marker lights it and docks its card under the picture:
| the rows the descriptor lists, a row with no value left out. The
| continuations (the Padma and the Meghna to the sea) are thin, grey and not
| tappable. A tap on the lit one again, on the picture away from every line,
| on × or Escape closes it. The picker row, [ ‹ ] [ the select ] [ › ], is
| the shell's own (../shared/picker.js) at the top; it lists the rivers the
| data names and follows the selection. A tap is a press that moves under 8
| px; a drag pans, two fingers pinch, the wheel and a double tap zoom.
|
| Several river systems share one picture (data.systems). One is current:
| the first the frame draws, until a card of another is chosen. Its lines are
| drawn in full with their markers and names; every other system's lines are
| thin and grey, without markers, named only by their main river. Choosing a
| main river lights its basin (line.basin: the lines that drain to it — the
| whole system where the system has one main river, that river and its
| branches in a group of rivers that each reach the sea); choosing a branch
| lights that branch.
| The picker lists the cards the frame draws, grouped by system.
|
| Every word shown is the descriptor's or the data's.
*/

import { dockedCard, el, pickerBar, stylesheet, svgEl } from './parts.js?v=061f15ed08';

const ZOOM_MAX = 6;
// CSS px: a press that moves less than this is a tap; two taps within DOUBLE_MS and DOUBLE_PX are a double tap.
const SLOP = 8;
const DOUBLE_MS = 320;
const DOUBLE_PX = 30;
const DOUBLE_ZOOM = 2.5;
// The stage's edge, and ⓘ's tap zone hanging over its top right (docs/visual/style.css), in CSS px.
const EDGE = 4;
// Room kept round the frame at 1×, and the furthest it may be dragged off the stage's edge, in CSS px.
const PAD = 10;
const INFO_ZONE = { w: 44, h: 26 };
// A name sits this far from its anchor; a name wider than WRAP_AT breaks at a space; a marker keeps this half-size clear.
const GAP = 7;
const WRAP_AT = 120;
const MARK_CLEAR = 11;
const NAME_PAD = 1.5;
// Names are placed a marker's district first (it must show from the opening view; a river's name has many places to go), then the main river, its tributaries, its branches, the continuations, the countries, the other districts last.
const RANK = { markerDistrict: -1, main: 0, tributary: 1, disputed: 1.5, distributary: 2, continuation: 3, country: 4, district: 5 };

// One picker row per tab, one standard set of ids: the tab in view holds them (tools/check.mjs and the shell read them).
const instances = new Set();

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/** The points of path data written as `M x y l dx dy …`, one array per subpath. */
function pieces(d) {
  const out = [];
  for (const sub of d.split(/(?=M)/)) {
    const n = sub.match(/-?\d*\.?\d+/g)?.map(Number);
    if (!n || n.length < 4) continue;
    let x = n[0];
    let y = n[1];
    const pts = [[x, y]];
    for (let i = 2; i + 1 < n.length; i += 2) {
      x += n[i];
      y += n[i + 1];
      pts.push([x, y]);
    }
    out.push(pts);
  }
  return out;
}

/** A marker's shape, centred on 0,0. */
function glyph(kind) {
  if (kind === 'origin') return svgEl('path', { class: 'glyph glyph-origin', d: 'M0-7.5L7 5.5H-7Z' });
  if (kind === 'entry') return svgEl('path', { class: 'glyph glyph-entry', d: 'M0-8.5L8.5 0 0 8.5-8.5 0Z' });
  if (kind === 'confluence') return svgEl('circle', { class: 'glyph glyph-confluence', r: 6 });
  return svgEl('rect', { class: 'glyph glyph-mouth', x: -6, y: -6, width: 12, height: 12 });
}

export async function mount(panel, { view, descriptor, data, art, shared }) {
  const words = descriptor.words;
  const frame = await art;
  const districts = frame.districts ? await shared(frame.districts.file) : null;
  const systemsHere = new Set([...frame.lines.map((l) => l.system), ...frame.markers.map((m) => m.system)]);
  let current = (data.systems ?? []).map((s) => s.id).find((s) => systemsHere.has(s)) ?? null;
  const markerSystem = new Map(frame.markers.map((m) => [m.id, m.system]));
  await Promise.all([stylesheet('../shared/picker.css?v=061f15ed08'), stylesheet('./rivers.css?v=061f15ed08')]);

  const fw = frame.projection.width;
  const fh = frame.projection.height;
  const open = frame.view ?? null;
  const zoomMax = open?.zoomMax ?? ZOOM_MAX;
  const uid = view.id;
  const cardTitle = (marker) => `${marker.name} — ${words.legend[marker.kind]}`;

  /** Every district's rings in the frame's units, with a box, for keeping its name inside it. */
  const shapes = new Map();
  if (districts) {
    const { lonMin, latMax, cosLat, scale } = frame.projection;
    const arcPts = districts.arcs.map((arc) => {
      let x = 0;
      let y = 0;
      const pts = [];
      for (let k = 0; k < arc.length; k += 2) {
        x += arc[k];
        y += arc[k + 1];
        pts.push([(x * districts.quantum - lonMin) * cosLat * scale, (latMax - y * districts.quantum) * scale]);
      }
      return pts;
    });
    for (const d of districts.districts) {
      const rings = d.rings.map((ring) => ring.flatMap((r, j) => {
        const pts = r < 0 ? arcPts[~r].slice().reverse() : arcPts[r];
        return j ? pts.slice(1) : pts;
      }));
      const all = rings.flat();
      shapes.set(d.pcode, { rings, box: [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))] });
    }
  }
  const inShape = (pcode, x, y) => {
    const s = shapes.get(pcode);
    if (!s || x < s.box[0] || x > s.box[2] || y < s.box[1] || y > s.box[3]) return false;
    let hit = false;
    for (const ring of s.rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
    return hit;
  };

  /** Every arc two districts share, as path data in the frame's units (Bangladesh's own outline is the frame's). */
  function districtLines() {
    const { lonMin, latMax, cosLat, scale } = frame.projection;
    const uses = new Map();
    for (const d of districts.districts) for (const ring of d.rings) for (const r of ring) {
      const i = r < 0 ? ~r : r;
      uses.set(i, (uses.get(i) ?? 0) + 1);
    }
    const parts = [];
    districts.arcs.forEach((arc, i) => {
      if (uses.get(i) !== 2) return;
      let x = 0;
      let y = 0;
      const pts = [];
      for (let k = 0; k < arc.length; k += 2) {
        x += arc[k];
        y += arc[k + 1];
        pts.push([((x * districts.quantum - lonMin) * cosLat * scale).toFixed(1), ((latMax - y * districts.quantum) * scale).toFixed(1)]);
      }
      parts.push('M' + pts.map((p) => p.join(' ')).join('L'));
    });
    return parts.join('');
  }

  // ---- the page ------------------------------------------------------------------------

  panel.classList.add('rivers');
  const stage = el('div', 'stage');
  const content = el('div', 'stage-content loading');
  stage.append(content);

  const svg = svgEl('svg', { class: 'rivers-svg', role: 'group', 'aria-label': descriptor.title.bn });
  const clipId = `rivers-clip-${uid}`;
  const defs = svgEl('defs');
  const clip = svgEl('clipPath', { id: clipId });
  clip.append(svgEl('rect', { width: fw, height: fh }));
  defs.append(clip);

  const world = svgEl('g', { class: 'world' });
  const ground = svgEl('g', { 'clip-path': `url(#${clipId})` });
  ground.append(
    svgEl('rect', { class: 'sea', width: fw, height: fh }),
    svgEl('path', { class: 'land', d: frame.land }),
    svgEl('path', { class: 'bd-fill', d: frame.bangladesh.fill }),
    ...(districts ? [svgEl('path', { class: 'district-lines', d: districtLines() })] : []),
    svgEl('path', { class: 'borders', d: frame.borders }),
    svgEl('path', { class: 'bd-border', d: frame.bangladesh.border }),
  );
  const linesG = svgEl('g', { class: 'lines' });
  const zonesG = svgEl('g', { class: 'zones' });
  world.append(ground, linesG, zonesG, svgEl('rect', { class: 'frame-edge', width: fw, height: fh }));

  const overlay = svgEl('g', { class: 'overlay' });
  const markersG = svgEl('g', { class: 'markers' });
  const namesG = svgEl('g', { class: 'names', 'aria-hidden': 'true' });
  overlay.append(markersG, namesG);
  svg.append(defs, world, overlay);
  content.append(svg);

  // ---- the lines -------------------------------------------------------------------------

  const roleOf = new Map(frame.lines.map((l) => [l.id, l.role]));
  const polyOf = new Map();
  const riverG = new Map();
  const drawOrder = [];
  for (const line of frame.lines) {
    const g = svgEl('g', { class: `river river-${line.role}`, 'data-system': line.system ?? '' });
    for (const piece of line.pieces) {
      g.append(svgEl('path', { class: 'river-halo', d: piece.d }), svgEl('path', { class: piece.dash ? 'river-line dash' : 'river-line', d: piece.d }));
    }
    // A connector joins a branch's end to its parent: the river's own colour and width, but no tap zone.
    for (const c of (frame.connectors ?? []).filter((x) => x.id === line.id)) {
      g.append(svgEl('path', { class: 'river-halo', d: c.d }), svgEl('path', { class: 'river-line connector', d: c.d }));
    }
    linesG.append(g);
    riverG.set(line.id, g);
    drawOrder.push(g);
    polyOf.set(line.id, line.pieces.flatMap((p) => pieces(p.d)));
  }

  // Tap zones: a line's own name, a marker's own card; a continuation has neither.
  const zoneOf = new Map();
  const titleOf = new Map();
  const zoneFor = (node, key, title) => {
    node.dataset.key = key;
    node.dataset.title = title;
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', title);
    zoneOf.set(key, node);
    titleOf.set(key, title);
  };
  // The main river's zone lies lowest, so a branch beside it takes its own taps.
  for (const line of [...frame.lines].reverse()) {
    const entity = line.entity ? data.entities[line.entity] : null;
    if (!entity || line.role === 'continuation') continue;
    const zone = svgEl('path', { class: 'zone', d: line.pieces.map((p) => p.d).join('') });
    zoneFor(zone, `line:${line.entity}`, entity.name);
    zone.dataset.system = line.system ?? '';
    zonesG.append(zone);
  }

  const markerG = new Map();
  const markerPos = new Map(frame.markers.map((m) => [m.id, [m.x, m.y]]));
  for (const m of frame.markers) {
    const info = data.markers[m.id];
    const g = svgEl('g', { class: `marker marker-${m.kind}`, 'data-system': m.system ?? '' });
    const zone = svgEl('circle', { class: 'zone', r: 22 });
    zoneFor(zone, `marker:${m.id}`, cardTitle(info));
    zone.dataset.system = m.system ?? '';
    g.append(svgEl('circle', { class: 'mark-halo', r: 15 }), svgEl('circle', { class: 'mark-ring', r: 15 }), glyph(m.kind), zone);
    markersG.append(g);
    markerG.set(m.id, g);
  }

  // ---- the names ---------------------------------------------------------------------------

  const labels = [
    ...frame.labels.map((l) => ({ id: l.id, text: data.labels[l.id], x: l.x, y: l.y, line: l.line, role: roleOf.get(l.line), lineRole: roleOf.get(l.line), system: frame.lines.find((q) => q.id === l.line)?.system, card: frame.lines.find((q) => q.id === l.line)?.entity ?? l.line })),
    ...frame.countries.map((c) => ({ id: c.id, text: data.countries[c.id], x: c.x, y: c.y, line: null, role: 'country' })),
    ...(districts
      ? frame.districts.labels.map((d) => ({ id: d.pcode, text: districts.districts.find((q) => q.pcode === d.pcode).bn, x: d.x, y: d.y, line: null, role: 'district', standing: d.systems }))
      : []),
  ];
  const perLine = new Map();
  for (const l of labels) if (l.line) perLine.set(l.line, (perLine.get(l.line) ?? 0) + 1);
  for (const l of labels) {
    l.node = svgEl('text', { class: `layer-label ${l.role.endsWith('istrict') && l.line === null ? 'district-label' : 'river-label'} label-${l.role}`, 'data-fit': `name ${l.id}` });
    l.node.style.display = 'none';
    namesG.append(l.node);
    // A line with a single name may carry it on any stretch in view; a line with several keeps each where it was placed.
    l.moves = l.line !== null && perLine.get(l.line) === 1;
    if (l.line) {
      const flat = polyOf.get(l.line).flatMap((pts, p) => pts.map(([x, y], i) => ({ x, y, p, i })));
      l.flat = flat;
      let best = 0;
      let bestD = Infinity;
      flat.forEach((q, k) => {
        const dd = Math.hypot(q.x - l.x, q.y - l.y);
        if (dd < bestD) {
          bestD = dd;
          best = k;
        }
      });
      l.at = best;
    }
  }
  /**
   * The names in placing order, for the current system: a district's role is its standing in it;
   * another system's river name is placed and drawn like a continuation's, grey; a lit branch's
   * names come straight after the main river's.
   */
  function ordered(lit) {
    for (const l of labels) {
      if (l.standing) l.role = l.standing[current] === 'always' ? 'markerDistrict' : 'district';
      else if (l.lineRole) {
        const role = l.system && l.system !== current ? 'continuation' : l.lineRole;
        if (role !== l.role) l.node.setAttribute('class', `layer-label river-label label-${role}`);
        l.role = role;
      }
    }
    const rank = (l) => (lit?.has(l.line) && l.role !== 'main' ? 0.5 : RANK[l.role]);
    return [...labels].sort((a, b) => rank(a) - rank(b));
  }

  // ---- the legend, at the stage's bottom left ------------------------------------------------

  const lineRoles = new Set(frame.lines.filter((l) => l.role !== 'continuation').map((l) => l.role));
  const markerKinds = new Set(frame.markers.map((m) => m.kind));
  const legend = el('ul', 'legend fit-text');
  legend.dataset.fit = 'the legend';
  for (const [kind, word] of Object.entries(words.legend)) {
    if (!lineRoles.has(kind) && !markerKinds.has(kind)) continue;
    const item = el('li', 'legend-item');
    item.dataset.kind = kind;
    const icon = svgEl('svg', { class: 'legend-icon', viewBox: '-14 -8 28 16', width: 28, height: 16, 'aria-hidden': 'true' });
    if (lineRoles.has(kind)) icon.append(svgEl('line', { class: `legend-line legend-${kind}`, x1: -12, y1: 0, x2: 12, y2: 0 }));
    else icon.append(glyph(kind));
    const text = el('span', 'legend-text', 'bn');
    text.textContent = word;
    item.append(icon, text);
    legend.append(item);
  }
  content.append(legend);

  let reset = null;
  if (open) {
    reset = el('button', 'reset-view');
    reset.type = 'button';
    reset.dataset.fit = 'the reset control';
    reset.setAttribute('aria-label', words.reset);
    reset.title = words.reset;
    const icon = svgEl('svg', { viewBox: '-12 -12 24 24', width: 22, height: 22, 'aria-hidden': 'true' });
    icon.append(svgEl('path', { d: 'M-8-3V-8H-3M3-8H8V-3M8 3V8H3M-3 8H-8V3', class: 'reset-corners' }), svgEl('circle', { r: 2.2, class: 'reset-dot' }));
    reset.append(icon);
    reset.addEventListener('click', () => goHome());
    content.append(reset);
  }

  // ---- the card and the picker row --------------------------------------------------------------

  const { card, close, fill } = dockedCard({ close: words.close, id: `rivers-${uid}` });
  let sel = null;
  const drawnCards = new Set(frame.lines.map((l) => l.entity).filter(Boolean));
  // Copies: a tab with one group drops it from its own items, never from the data another tab reads.
  const pickerItems = data.picker.filter((p) => drawnCards.has(p.key)).map((p) => ({ ...p }));
  const groupsHere = (data.pickerGroups ?? []).filter((g) => pickerItems.some((p) => p.group === g.value));
  const pickerGroups = groupsHere.length > 1 ? groupsHere : [];
  if (!pickerGroups.length) for (const p of pickerItems) delete p.group;
  const pickerKeys = new Set(pickerItems.map((p) => p.key));
  const pickerKey = () => (sel?.kind === 'line' && pickerKeys.has(sel.id) ? sel.id : undefined);
  const { bar, select, row } = pickerBar({
    placeholder: words.picker,
    items: pickerItems.map((p) => ({ key: p.key, label: p.label, group: p.group })),
    groups: pickerGroups,
    current: pickerKey,
    choose: (key) => choose(key, true),
  });
  const self = {
    ids(standard) {
      const [prev, sel2, next] = bar.children;
      prev.id = standard ? 'prevRecord' : `prevRecord-${uid}`;
      sel2.id = standard ? 'recordPicker' : `recordPicker-${uid}`;
      next.id = standard ? 'nextRecord' : `nextRecord-${uid}`;
    },
  };
  instances.add(self);
  const claimIds = () => {
    for (const inst of instances) inst.ids(inst === self);
  };
  claimIds();
  panel.append(bar, stage, card);

  // ---- choosing --------------------------------------------------------------------------------

  function boundsOf(kind, id) {
    if (kind === 'marker') {
      const [x, y] = markerPos.get(id);
      return { x0: x, y0: y, x1: x, y1: y };
    }
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const pts of frame.lines.filter((l) => l.entity === id).flatMap((l) => polyOf.get(l.id))) {
      for (const [x, y] of pts) {
        b.x0 = Math.min(b.x0, x);
        b.y0 = Math.min(b.y0, y);
        b.x1 = Math.max(b.x1, x);
        b.y1 = Math.max(b.y1, y);
      }
    }
    return b;
  }

  function paint() {
    const card = sel?.kind === 'line' ? data.entities[sel.id] : null;
    // A main river lights its basin (the lines that drain to it); a branch lights itself.
    const lit = card ? frame.lines.filter((l) => (card.role === 'main' ? l.basin === sel.id : l.entity === sel.id)).map((l) => l.id) : [];
    svg.classList.toggle('has-lit', lit.length > 0);
    for (const [id, g] of riverG) {
      g.classList.toggle('lit', lit.includes(id));
      const line = frame.lines.find((l) => l.id === id);
      g.classList.toggle('other', line.role !== 'continuation' && line.system !== current);
    }
    for (const [id, g] of markerG) {
      g.classList.toggle('lit', sel?.kind === 'marker' && sel.id === id);
      g.style.display = markerSystem.get(id) === current ? '' : 'none';
    }
    for (const [key, z] of zoneOf) z.setAttribute('aria-pressed', String(sel !== null && key === `${sel.kind}:${sel.id}`));
    // The legend lists the kinds the current system draws: another system's lines are grey, its markers hidden.
    const kindsHere = new Set([...frame.lines.filter((l) => l.system === current && l.role !== 'continuation').map((l) => l.role), ...frame.markers.filter((q) => q.system === current).map((q) => q.kind)]);
    for (const item of legend.children) item.style.display = kindsHere.has(item.dataset.kind) ? '' : 'none';
    // Another system's lines lie beneath the current one's.
    for (const g of drawOrder) if (g.classList.contains('other')) linesG.append(g);
    for (const g of drawOrder) if (!g.classList.contains('other')) linesG.append(g);
    for (const id of lit) linesG.append(riverG.get(id));
  }

  function choose(key, reveal = false) {
    const [kind, id] = key.includes(':') ? key.split(':') : ['line', key];
    if (kind === 'line' ? !data.entities[id] : !data.markers[id]) return;
    sel = { kind, id };
    current = (kind === 'line' ? data.entities[id].system : markerSystem.get(id)) ?? current;
    if (kind === 'line') fill(data.entities[id].name, words.rows, data.entities[id].values);
    else {
      const marker = data.markers[id];
      fill(cardTitle(marker), words.rows, { [marker.row]: marker.value });
    }
    card.hidden = false;
    select.value = pickerKey() ?? '';
    row.sync();
    paint();
    layout();
    if (reveal) show(boundsOf(kind, id));
  }

  function clear(returnFocus) {
    if (sel === null) return;
    const was = `${sel.kind}:${sel.id}`;
    sel = null;
    card.hidden = true;
    select.value = '';
    row.sync();
    paint();
    layout();
    if (returnFocus) zoneOf.get(was)?.focus();
  }

  const activate = (key) => {
    if (!key) return clear(false);
    if (sel !== null && key === `${sel.kind}:${sel.id}`) return clear(false);
    const [kind, id] = key.split(':');
    return choose(`${kind}:${id}`);
  };

  close.addEventListener('click', () => clear(true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sel !== null && !panel.hidden) clear(true);
  });
  stage.addEventListener('keydown', (event) => {
    const zone = event.target.closest?.('.zone');
    if (zone && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      activate(zone.dataset.key);
    }
  });

  // ---- the view: where the frame lies in the stage, in CSS px -----------------------------------

  let W = 0;
  let H = 0;
  let s0 = 1; // CSS px per frame unit with the whole frame in view
  let zoom = 1;
  let m = 1;
  let tx = 0;
  let ty = 0;
  // The frame point at the stage's centre: the opening view's, or the frame's middle.
  const home = () => (open ? [(open.x0 + open.x1) / 2, open.cy] : [fw / 2, fh / 2]);
  let [cx, cy] = home();
  let ready = false;
  let measuredFor = null;
  let frameQueued = 0;

  function clampView() {
    const ew = fw * m;
    const eh = fh * m;
    if (open) {
      // Free in every direction, but a quarter of the picture (or of the stage, when the picture is bigger) stays on it.
      const kx = open.keep * Math.min(W, ew);
      const ky = open.keep * Math.min(H, eh);
      tx = clamp(tx, kx - ew, W - kx);
      ty = clamp(ty, ky - eh, H - ky);
    } else {
      tx = ew <= W - 2 * PAD + 0.5 ? (W - ew) / 2 : clamp(tx, W - ew - PAD, PAD);
      ty = eh <= H - 2 * PAD + 0.5 ? (H - eh) / 2 : clamp(ty, H - eh - PAD, PAD);
    }
    cx = (W / 2 - tx) / m;
    cy = (H / 2 - ty) / m;
  }

  function layout() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!ready || !w || !h) return;
    W = w;
    H = h;
    s0 = open ? W / (open.x1 - open.x0) : Math.min((W - 2 * PAD) / fw, (H - 2 * PAD) / fh);
    m = s0 * zoom;
    tx = W / 2 - cx * m;
    ty = H / 2 - cy * m;
    clampView();
    apply();
  }

  /** The opening view: 1×, centred on the frame's view, moved only so the picture covers the stage where it can. */
  function goHome() {
    zoom = 1;
    [cx, cy] = home();
    layout();
    if (!W || !H) return;
    const ew = fw * m;
    const eh = fh * m;
    if (ew >= W) tx = clamp(tx, W - ew, 0);
    if (eh >= H) ty = clamp(ty, H - eh, 0);
    cx = (W / 2 - tx) / m;
    cy = (H / 2 - ty) / m;
    apply();
  }

  const queue = () => {
    if (!frameQueued) frameQueued = requestAnimationFrame(() => {
      frameQueued = 0;
      apply();
    });
  };

  /** Fits the box (frame units) in view when it is not: as close as fits, at most zoomMax. */
  function show(b) {
    const margin = 16;
    const inside = [[b.x0, b.y0], [b.x1, b.y1]].every(([x, y]) => x * m + tx >= margin && x * m + tx <= W - margin && y * m + ty >= margin && y * m + ty <= H - margin);
    if (inside) return;
    const need = Math.min((W - 4 * margin) / (Math.max(b.x1 - b.x0, 60) * s0), (H - 4 * margin) / (Math.max(b.y1 - b.y0, 60) * s0));
    // Bigger than the stage at 1×: a frame with an opening view shows that, as it was drawn to be read.
    if (open && need <= 1) return goHome();
    zoom = clamp(need, 1, zoomMax);
    cx = (b.x0 + b.x1) / 2;
    cy = (b.y0 + b.y1) / 2;
    layout();
  }

  // ---- drawing at the current view ------------------------------------------------------------------

  const fixed = (v) => v.toFixed(2);

  function apply() {
    world.setAttribute('transform', `matrix(${m.toFixed(5)} 0 0 ${m.toFixed(5)} ${fixed(tx)} ${fixed(ty)})`);
    for (const [id, g] of markerG) {
      const [x, y] = markerPos.get(id);
      g.setAttribute('transform', `translate(${fixed(tx + m * x)} ${fixed(ty + m * y)})`);
    }
    placeNames();
  }

  const fontKey = () => getComputedStyle(labels[0].node).fontSize;

  function measure() {
    const size = parseFloat(fontKey());
    for (const l of labels) {
      l.node.style.display = '';
      l.node.replaceChildren();
      l.node.setAttribute('transform', 'translate(0 0)');
      const one = svgEl('tspan', { x: 0 });
      one.textContent = l.text;
      l.node.append(one);
      let lines = [l.text];
      if (l.node.getComputedTextLength() > WRAP_AT && l.text.includes(' ')) {
        const spaces = [...l.text].map((ch, i) => (ch === ' ' ? i : -1)).filter((i) => i >= 0);
        const at = spaces.reduce((a, b) => (Math.abs(b - l.text.length / 2) < Math.abs(a - l.text.length / 2) ? b : a));
        lines = [l.text.slice(0, at), l.text.slice(at + 1)];
      }
      l.node.replaceChildren(...lines.map((t, i) => {
        const span = svgEl('tspan', { x: 0, dy: i === 0 ? 0 : size * 1.3 });
        span.textContent = t;
        return span;
      }));
      const box = l.node.getBBox();
      l.w = box.width;
      l.h = box.height;
      l.bx = box.x;
      l.by = box.y;
      l.spans = [...l.node.children];
      l.lineW = l.spans.map((s) => s.getComputedTextLength());
      l.align = null;
      l.node.style.display = 'none';
    }
    measuredFor = size;
  }

  const inView = (x, y, inset) => x >= inset && x <= W - inset && y >= inset && y <= H - inset;

  /** The anchor of a name on the screen and the way its line runs there, or null when it is not in view. */
  function anchorOf(l) {
    const ax = tx + m * l.x;
    const ay = ty + m * l.y;
    let at = l.at;
    if (!inView(ax, ay, EDGE + 6)) {
      if (!l.moves) return null;
      let bestD = Infinity;
      at = -1;
      l.flat.forEach((q, k) => {
        const sx = tx + m * q.x;
        const sy = ty + m * q.y;
        if (!inView(sx, sy, EDGE + 12)) return;
        const dd = Math.hypot(sx - ax, sy - ay);
        if (dd < bestD) {
          bestD = dd;
          at = k;
        }
      });
      if (at < 0) return null;
    }
    if (!l.line) return { x: ax, y: ay, dir: [1, 0] };
    const q = l.flat[at];
    const pts = polyOf.get(l.line)[q.p];
    const a = pts[Math.max(0, q.i - 3)];
    const b = pts[Math.min(pts.length - 1, q.i + 3)];
    return { x: tx + m * q.x, y: ty + m * q.y, dir: [b[0] - a[0], b[1] - a[1]] };
  }

  function candidates(P, dir, l) {
    const { w, h } = l;
    const g = GAP;
    if (l.role === 'country') return [{ l: P.x - w / 2, t: P.y - h / 2, align: 'center' }];
    if (l.role === 'district' || l.role === 'markerDistrict') {
      const out = [{ l: P.x - w / 2, t: P.y - h / 2, align: 'center' }];
      for (const r of [14, 28, 42, 58, 76])
        for (let a = 0; a < 8; a++) {
          const dx = Math.cos((a * Math.PI) / 4) * r * 1.4;
          const dy = Math.sin((a * Math.PI) / 4) * r * 0.8;
          out.push({ l: P.x + dx - w / 2, t: P.y + dy - h / 2, align: 'center' });
        }
      return out.filter((c) => inShape(l.id, (c.l + w / 2 - tx) / m, (c.t + h / 2 - ty) / m));
    }
    const right = (dy = 0, gap = g) => ({ l: P.x + gap, t: P.y - h / 2 + dy, align: 'left' });
    const left = (dy = 0, gap = g) => ({ l: P.x - gap - w, t: P.y - h / 2 + dy, align: 'right' });
    const above = (dx = 0, gap = g) => ({ l: P.x - w / 2 + dx, t: P.y - gap - h, align: 'center' });
    const below = (dx = 0, gap = g) => ({ l: P.x - w / 2 + dx, t: P.y + gap, align: 'center' });
    const upright = Math.abs(dir[1]) > Math.abs(dir[0]);
    const near = upright ? [right(), left(), above(), below()] : [above(), below(), right(), left()];
    const corners = [
      { l: P.x + g, t: P.y - g - h, align: 'left' },
      { l: P.x - g - w, t: P.y - g - h, align: 'right' },
      { l: P.x + g, t: P.y + g, align: 'left' },
      { l: P.x - g - w, t: P.y + g, align: 'right' },
    ];
    const slid = upright ? [right(-h * 0.7), right(h * 0.7), left(-h * 0.7), left(h * 0.7)] : [above(-w * 0.6), above(w * 0.6), below(-w * 0.6), below(w * 0.6)];
    const far = upright
      ? [right(0, g * 3), left(0, g * 3), right(-h * 1.3), right(h * 1.3), left(-h * 1.3), left(h * 1.3)]
      : [above(0, g * 3), below(0, g * 3), above(-w * 1.1), above(w * 1.1), below(-w * 1.1), below(w * 1.1)];
    // A short, narrow picture leaves room at the stage's sides: further out, level with the anchor or a line above or below.
    const wide = [];
    for (const gap of [g * 3, g * 6, g * 10, g * 14]) for (const dy of [0, -h * 0.9, h * 0.9, -h * 1.8, h * 1.8]) wide.push(right(dy, gap), left(dy, gap));
    return [...near, ...corners, ...slid, ...far, ...wide, { l: P.x - w / 2, t: P.y - h / 2, align: 'center' }];
  }

  function placeNames() {
    if (measuredFor === null || measuredFor !== parseFloat(fontKey())) measure();
    const blocks = [{ l: W - INFO_ZONE.w, t: 0, r: W, b: INFO_ZONE.h }];
    blocks.push({ l: legend.offsetLeft, t: legend.offsetTop, r: legend.offsetLeft + legend.offsetWidth, b: legend.offsetTop + legend.offsetHeight });
    if (reset) blocks.push({ l: reset.offsetLeft, t: reset.offsetTop, r: reset.offsetLeft + reset.offsetWidth, b: reset.offsetTop + reset.offsetHeight });
    for (const [id, [x, y]] of markerPos) {
      if (markerSystem.get(id) !== current) continue; // another system's marker is hidden
      const sx = tx + m * x;
      const sy = ty + m * y;
      if (sx > -MARK_CLEAR && sx < W + MARK_CLEAR && sy > -MARK_CLEAR && sy < H + MARK_CLEAR) blocks.push({ l: sx - MARK_CLEAR, t: sy - MARK_CLEAR, r: sx + MARK_CLEAR, b: sy + MARK_CLEAR });
    }
    const placed = [];
    // Every river name gives way: one that finds no spot clear of the other names and the controls is
    // not drawn at that view (names never overlap and never shrink; zooming in brings it back). The
    // current system's main river's names are placed first, then, with a branch's card open, that
    // branch's, then the other branches, then the other systems' grey names.
    const litCard = sel?.kind === 'line' && data.entities[sel.id]?.role !== 'main' ? sel.id : null;
    const lit = litCard ? new Set(frame.lines.filter((q) => q.entity === litCard).map((q) => q.id)) : null;
    for (const l of ordered(lit)) {
      const hiddenHere =
        (l.standing && !l.standing[current]) || (l.role === 'district' && zoom < frame.districts.zoomAll - 0.05) || (l.line && l.system && l.system !== current && l.lineRole !== 'main' && l.lineRole !== 'continuation');
      const anchor = hiddenHere ? null : anchorOf(l);
      if (!anchor) {
        l.node.style.display = 'none';
        continue;
      }
      let best = null;
      const yields = l.role === 'country' || l.role === 'district' || l.role === 'markerDistrict';
      if (yields) {
        for (const c of candidates(anchor, anchor.dir, l)) {
          if (c.l < EDGE || c.t < EDGE || c.l + l.w > W - EDGE || c.t + l.h > H - EDGE) continue;
          const rect = { l: c.l, t: c.t, r: c.l + l.w, b: c.t + l.h };
          const padded = { l: rect.l - NAME_PAD, t: rect.t - NAME_PAD, r: rect.r + NAME_PAD, b: rect.b + NAME_PAD };
          if (blocks.some((o) => overlap(rect, o) > 0) || placed.some((o) => overlap(padded, o) > 0)) continue;
          best = { cost: 0, rect, align: c.align };
          break;
        }
        if (!best) {
          l.node.style.display = 'none';
          continue;
        }
      } else candidates(anchor, anchor.dir, l).forEach((c, k) => {
        const left = clamp(c.l, EDGE, Math.max(EDGE, W - EDGE - l.w));
        const top = clamp(c.t, EDGE, Math.max(EDGE, H - EDGE - l.h));
        const rect = { l: left, t: top, r: left + l.w, b: top + l.h };
        let cost = Math.abs(left - c.l) * 4 + Math.abs(top - c.t) * 4 + k * 0.5;
        for (const o of blocks) {
          const hit = overlap(rect, o);
          if (hit > 0) cost += 100 + hit;
        }
        for (const o of placed) {
          const hit = overlap({ l: rect.l - NAME_PAD, t: rect.t - NAME_PAD, r: rect.r + NAME_PAD, b: rect.b + NAME_PAD }, o);
          if (hit > 0) cost += 100 + hit;
        }
        if (!best || cost < best.cost) best = { cost, rect, align: c.align };
      });
      if (l.line) {
        const r = best.rect;
        const padded = { l: r.l - NAME_PAD, t: r.t - NAME_PAD, r: r.r + NAME_PAD, b: r.b + NAME_PAD };
        if (blocks.some((o) => overlap(r, o) > 0) || placed.some((o) => overlap(padded, o) > 0)) {
          l.node.style.display = 'none';
          continue;
        }
      }
      l.node.style.display = '';
      if (l.align !== best.align) {
        l.align = best.align;
        l.spans.forEach((s, i) => s.setAttribute('x', fixed(best.align === 'center' ? (l.w - l.lineW[i]) / 2 : best.align === 'right' ? l.w - l.lineW[i] : 0)));
      }
      // Placed by its box as drawn: aligning the spans can shift it by the gap between a line's box and its advance.
      const bb = l.node.getBBox();
      l.node.setAttribute('transform', `translate(${fixed(best.rect.l - bb.x)} ${fixed(best.rect.t - bb.y)})`);
      placed.push(best.rect);
    }
  }

  // ---- panning and zooming: one finger or the mouse pans, two fingers pinch, the wheel and a double tap zoom ----

  const pointers = new Map();
  let press = null;
  let pinch = null;
  let lastTap = null;
  const local = (event) => {
    const r = stage.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };

  function zoomAt(x, y, factor) {
    const next = clamp(m * factor, s0, s0 * zoomMax);
    const fx = (x - tx) / m;
    const fy = (y - ty) / m;
    m = next;
    zoom = m / s0;
    tx = x - fx * m;
    ty = y - fy * m;
    clampView();
    queue();
  }

  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest?.('.reset-view')) return;
    const p = local(event);
    pointers.set(event.pointerId, p);
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {}
    if (pointers.size === 1) press = { id: event.pointerId, x: p.x, y: p.y, moved: false, key: event.target.closest?.('[data-key]')?.dataset.key ?? null };
    else {
      press = null;
      const [a, b] = [...pointers.values()];
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), m, fx: (c.x - tx) / m, fy: (c.y - ty) / m };
    }
  });

  stage.addEventListener('pointermove', (event) => {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    const n = local(event);
    if (pointers.size >= 2 && pinch) {
      p.x = n.x;
      p.y = n.y;
      const [a, b] = [...pointers.values()];
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      m = clamp((pinch.m * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, s0, s0 * zoomMax);
      zoom = m / s0;
      tx = c.x - pinch.fx * m;
      ty = c.y - pinch.fy * m;
      clampView();
      queue();
      return;
    }
    if (press?.id === event.pointerId && !press.moved) {
      if (Math.hypot(n.x - press.x, n.y - press.y) < SLOP) {
        p.x = n.x;
        p.y = n.y;
        return;
      }
      press.moved = true;
    }
    tx += n.x - p.x;
    ty += n.y - p.y;
    p.x = n.x;
    p.y = n.y;
    clampView();
    queue();
  });

  function release(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (press?.id === event.pointerId) {
      const tap = event.type === 'pointerup' && !press.moved ? press : null;
      press = null;
      if (tap) {
        if (lastTap && event.timeStamp - lastTap.t < DOUBLE_MS && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < DOUBLE_PX) {
          lastTap = null;
          zoomAt(tap.x, tap.y, zoom >= zoomMax * 0.6 ? 1 / zoom : DOUBLE_ZOOM);
        } else {
          lastTap = { t: event.timeStamp, x: tap.x, y: tap.y };
          activate(tap.key);
        }
      }
    }
    if (pointers.size < 2) pinch = null;
  }
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const p = local(event);
      zoomAt(p.x, p.y, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0018)));
    },
    { passive: false },
  );

  new ResizeObserver(() => layout()).observe(stage);

  // ---- ready: once the names' font is in, so their widths are true -------------------------------------------

  const sample = labels.map((l) => l.text).join('');
  const done = (async () => {
    try {
      await Promise.all([document.fonts.load("600 15px 'Noto Sans Bengali'", sample), document.fonts.load("600 14px 'Noto Sans Bengali'", sample)]);
    } catch {}
    await document.fonts?.ready;
    ready = true;
    content.classList.remove('loading');
    paint();
    if (open) goHome();
    else layout();
  })();

  return {
    ready: done,
    shown() {
      claimIds();
      layout();
    },
  };
}
