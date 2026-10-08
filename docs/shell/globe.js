/*
|--------------------------------------------------------------------------
| GLOBE — a shell module: the map drawn on a globe
|
|   globe: {
|     size,                                    the globe's diameter, a share of the map's shorter side
|     open: { record },                        the record that faces the viewer when the map opens
|     imagery: { file, fadeOut: [from, to] },  a raster archive in the map's folder, faded out over
|                                              the vector basemap between the two zooms
|     edgeLabels: { source, text, colour: { style, paint } },
|     coordinates?: { at, lines, minZoom },    latitude and longitude beside some places
|     antipode?: { between: [a, b], labels: { a, b }, duration },
|   }
|
| MapLibre's own globe projection, held north-up and upright: a drag turns
| it, a pinch zooms it, and no tilt button or compass is drawn (the shell
| draws those only where a map can tilt or turn). It opens with `open`
| facing the viewer, the globe `size` of the map's shorter side; the camera
| is sized from MapLibre's own globe geometry, so it fits before the first
| frame. When the map's area changes — the card docks, or closes — a globe
| seen whole is fitted again.
|
| The map's selector is the shell's own picker row, as on every map (the
| user's decision, 2026-09-28): its table is the globe's, its options the
| records in their order, and its `do` a flight to the record, `flyTo`, and
| its card. A line is turned to the least way into the globe's middle, seen
| whole from no further toward a pole than LINE_LAT; a pole comes to the
| middle's top or foot; a place is fitted to its frame. A flight cut short,
| by another or by a drag, runs nothing after it.
|
| On the globe, drawn as HTML over it, by this module's own projection of
| MapLibre's globe:
|   - each line of `edgeLabels.source` named where it leaves the visible
|     globe — at its edge, or the map's — with a short leader to a dot on it
|     just inside: a parallel's name on the left first, any other line's at
|     the bottom, in its colour. The names on one side stand in the order of
|     their lines, moved apart as little as they can, so none overlap and no
|     leaders cross; one blocked by a control, a pole's name, a callout or a
|     place's dot or name slides along its side, then tries its line's next
|     crossing, and is hidden when it has none, or when its line is out of
|     sight;
|   - each record carrying `coordinates.at` given its `coordinates.lines`,
|     beside it, from `minZoom`, while it faces the viewer, the selected
|     place's first;
|   - each record whose point lies beyond Web Mercator's ±85.05° — the
|     poles — as a marker at its true place, named, hidden on the far side.
|     Such a record is taken off the map's own point layers, which cannot
|     draw it where it is, by a filter on its key: it stays in the picker
|     and in ‹ ›.
|
| Taps are the module's (the user's order, 2026-09-28): the nearest dot
| within TAP px, else the nearest line within TAP px — lines within TIE px of
| each other, as at a crossing, go by the picker's order — else the smallest
| area under the finger. Nothing on the far side is ever hit. A tap on no
| record closes the card.
|
| The card docks at the page's foot with a × that clears the selection; on
| a record of `antipode.between` it carries a button, kept at the card's
| foot, that turns the globe to the other place over `duration` ms, then
| opens its card. From the tap until the map is idle again the pair's
| outlines and points are drawn here, as the descriptor's layers draw them:
| the map's own tiles for the far side load only as it turns into view.
| With reduced motion every flight is a jump.
|
| Loaded only for a map whose descriptor declares `globe`.
|--------------------------------------------------------------------------
*/

import * as maplibregl from '../shared/vendor/maplibre-gl-6.9.0/maplibre-gl.mjs?v=061f15ed08';

/*
 * MapLibre 6.9.0's globe seen flat-on (pitch 0): a sphere of radius
 * R = 512·2^zoom / (2π·cos lat) px, lat the view centre's, looked at from a
 * camera 1.5·H px above the point under it — H the canvas height, 1.5 its
 * default vertical field of view, 2·atan(1/3). A point is in front when its
 * direction from the centre, dotted with the view centre's, is at least 1/D,
 * D = 1 + 1.5·H/R: the plane MapLibre itself clips the globe at.
 */
const TILE = 512;
const CAMERA = 1.5;
const MERCATOR_LAT = 85.0511287798066;
const CENTRE_LAT = 85; // the furthest a view's centre goes toward a pole
const LINE_LAT = 40; // the furthest toward a pole a line is seen from: a polar circle whole, a meridian upright
const MIN_SHARE = 0.45; // the least a pinch may shrink the globe to, as a share of the map's shorter side
const REFIT = 0.25; // zoom: a globe within this of its fitted size counts as seen whole
const SAMPLE = 1; // degrees between the points a line is followed by
const TAP = 14; // px: a finger's reach round the tap
const TIE = 1.5; // px: two lines nearer than this to each other tie, and the picker's order decides
const LEADER = 14; // px: from the edge to a name
const INSET = 18; // px: how far inside the edge a leader meets its line
const PATH = 160; // px: how far along a line from the edge its leader may meet it
const STEP = 4; // px: the spacing a line is followed at, on the screen
const GAP = 12; // px: from a place to its callout
const DOT = 9; // px: round a place's dot, kept clear of names
const SLIDE = 160; // px: how far a name may slide along its side to clear what is in its way — as far as it must, which beats hiding it
const FRAME_PADDING = 24; // px: round a place's frame when it is flown to
const MARGIN = 4; // px: between a name and the map's edge, a control or another name
const TINT = 0.55; // a chip's colour: its record's, this far toward white
const SVG = 'http://www.w3.org/2000/svg';

let api;
let spec;
let table;
let rows;
let map;
let container;
let overlay;
let leaders;
let pickerLabel; // a record's name, as the picker lists it
let close;
let turnBar;
let turnButton;
const poles = new Map(); // key -> { element, marker }
const edges = []; // one per line: { key, parts, parallel, element, line, dot, size }
const callouts = []; // one per place with coordinates: { key, v, ll, element, line, size }
let order = []; // the table's keys, in its own order: the picker's order and the lines' tie order
let lastSize = [0, 0];
let flying = false;
let flights = 0; // counts flights started, so an interrupted one knows it was
const keep = { svg: null, items: [], on: false }; // the antipode pair, drawn here through its flight

/** Before the map is built: the page's layout, the camera and the map's own options. */
export async function mount(shellApi) {
  api = shellApi;
  spec = api.descriptor.globe;
  const picker = (api.descriptor.controls ?? []).find((c) => c.type === 'picker');
  if (!picker) throw new Error('globe: a globe map selects through the picker row, as every map does');
  if (api.descriptor.timeline) throw new Error('globe: a globe map has no timeline');
  table = picker.from;
  pickerLabel = picker.label ?? { field: picker.labelField };
  rows = api.records[table];
  if (!rows) throw new Error(`globe: "${table}" is not a records table`);
  order = Object.keys(rows);

  await stylesheet('./globe.css?v=061f15ed08');
  const page = api.dom.mapShell.parentElement;
  page.classList.add('has-globe');
  api.own.undo('the globe page layout', () => page.classList.remove('has-globe'));

  // A place beyond ±85.05° cannot be drawn by the map's point layers — they
  // would put it at 85.05° — so it is theirs no more, and a marker's here.
  for (const key of order) if (Math.abs(rows[key].at?.[1] ?? 0) > MERCATOR_LAT) poles.set(key, null);

  container = document.getElementById('map');
  const { clientWidth: width, clientHeight: height } = container;
  lastSize = [width, height];
  const open = rows[spec.open?.record];
  if (!open) throw new Error(`globe: open.record "${spec.open?.record}" is not a record of "${table}"`);
  const [lng, lat] = pointOf(open);
  Object.assign(api.build.style, {
    projection: { type: 'globe' },
    sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
  });
  Object.assign(api.build.options, {
    center: [lng, lat],
    zoom: fitZoom(lat, width, height),
    minZoom: fitZoom(0, width, height, MIN_SHARE),
    maxPitch: 0,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
  });
  api.tapsOwned = true;
  api.actions.flyTo = (action, context) => flyTo(context.key, reduced() ? 0 : action.duration ?? 1800);
}

/** Once the map is built: the imagery, the poles, the names, the card, taps, and every change. */
export function install(shellApi) {
  api = shellApi;
  map = api.map;
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  imagery();

  overlay = api.own.node(document.createElement('div'), 'globe overlay');
  overlay.className = 'globe-overlay';
  leaders = api.own.node(document.createElementNS(SVG, 'svg'), 'globe leaders');
  leaders.setAttribute('class', 'globe-leaders');
  leaders.setAttribute('aria-hidden', 'true');
  buildKeep();
  map.getCanvasContainer().after(...(keep.svg ? [keep.svg] : []), leaders, overlay);

  polesOffTheLayers();
  buildPoles();
  buildEdges();
  buildCallouts();
  buildCard();

  api.own.mapHandler(map, 'click', (event) => {
    const hit = resolveTap(event.point);
    if (hit) api.runActions(hit.do, { table: hit.table, key: hit.key });
    else api.deselect();
  });
  api.own.mapHandler(map, 'move', place);
  api.own.mapHandler(map, 'resize', place);
  api.onChange((what) => {
    if (what !== 'select') return;
    const key = api.selection.get(table);
    for (const [k, pole] of poles) pole.element.classList.toggle('selected', k === key);
    const kicker = api.dom.kicker;
    if (key !== undefined) kicker.style.setProperty('--chip', tint(colourOf(key)));
    const other = partnerOf(key);
    turnBar.hidden = other === undefined;
    if (other !== undefined) turnButton.textContent = spec.antipode.labels[key];
    // The card has docked, changed or gone: the map's own height with it,
    // told now so a flight in the same tap is sized to it.
    map.resize();
    place();
  });
  api.own.observer(new ResizeObserver(refit), container);
  document.fonts?.ready.then(() => {
    for (const item of [...edges, ...callouts]) item.size = null;
    nameWidths.clear();
    place();
  });
  place();
}

/* ---- the camera --------------------------------------------------------------------- */

const globeRadius = (zoom, lat) => (TILE * 2 ** zoom) / (2 * Math.PI * Math.cos((lat * Math.PI) / 180));

/** The zoom at which the globe, centred at `lat`, is `share` of the map's shorter side across. */
function fitZoom(lat, width, height, share = spec.size) {
  const f = CAMERA * height;
  const r = (share * Math.min(width, height)) / 2;
  const d = Math.sqrt((f / r) ** 2 + 1);
  const radius = f / (d - 1);
  return Math.log2((radius * 2 * Math.PI * Math.cos((Math.min(Math.abs(lat), CENTRE_LAT) * Math.PI) / 180)) / TILE);
}

/** The map's area changed — the card docked or closed: a globe seen whole is fitted to it again. */
function refit() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height || (width === lastSize[0] && height === lastSize[1])) return;
  const lat = map.getCenter().lat;
  const was = fitZoom(lat, lastSize[0], lastSize[1]);
  lastSize = [width, height];
  map.setMinZoom(fitZoom(0, width, height, MIN_SHARE));
  if (!flying && !map.isMoving() && map.getZoom() <= was + REFIT) map.jumpTo({ zoom: map.getZoom() + fitZoom(lat, width, height) - was });
  place();
}

/**
 * Where a record is seen from: a line through the globe's middle, turned to
 * it the least way; a pole at the middle's top or foot; anything else fitted
 * to its frame.
 */
function cameraFor(key) {
  const row = rows[key];
  const edge = edges.find((e) => e.key === key);
  if (!edge && !poles.has(key) && row.frame) {
    const [w, s, e, n] = row.frame;
    const camera = map.cameraForBounds([[w, s], [e, n]], { padding: FRAME_PADDING, bearing: 0 });
    if (camera) return { center: [camera.center.lng, camera.center.lat], zoom: camera.zoom };
  }
  const now = map.getCenter();
  const [lng, lat] = edge ? leastTurn(edge, now) : pointOf(row);
  const reach = edge ? LINE_LAT : CENTRE_LAT;
  const centre = [Math.abs(lat) >= 89.999 ? now.lng : lng, clamp(lat, -reach, reach)];
  return { center: centre, zoom: fitZoom(centre[1], container.clientWidth, container.clientHeight) };
}

/** The line's point the globe turns least to bring to the middle: the least change of longitude and latitude together. */
function leastTurn(edge, now) {
  let best = null;
  for (const part of edge.parts)
    for (const s of part) {
      const turn = Math.abs(((s.lng - now.lng + 540) % 360) - 180) + Math.abs(s.lat - now.lat);
      if (!best || turn < best.turn) best = { turn, s };
    }
  return [best.s.lng, best.s.lat];
}

/**
 * To a record's camera over `duration` ms, or at once; `then` once it has
 * arrived. A flight cut short, by another flight or by a drag, runs nothing:
 * what it was for did not happen.
 */
function flyTo(key, duration, then) {
  const camera = cameraFor(key);
  if (!camera) return;
  const target = { ...camera, bearing: 0, pitch: 0 };
  const id = ++flights;
  if (!duration) {
    map.jumpTo(target);
    then?.();
    return;
  }
  flying = true;
  map.flyTo({ ...target, duration, essential: true });
  // Registered after the flight starts, so a flight it cut short cannot end it.
  map.once('moveend', () => {
    if (id !== flights) return;
    flying = false;
    const c = map.getCenter();
    const arrived = Math.abs(map.getZoom() - target.zoom) < 0.01 && Math.abs(((c.lng - target.center[0] + 540) % 360) - 180) < 0.01 && Math.abs(c.lat - target.center[1]) < 0.01;
    if (arrived) then?.();
    refit();
  });
}

/* ---- the imagery ------------------------------------------------------------------------ */

async function imagery() {
  if (!spec.imagery) return;
  const [from, to] = spec.imagery.fadeOut;
  const archive = api.archive(`${api.descriptor.id}/${spec.imagery.file.replace(/^\.\//, '')}`, 'maps');
  const header = await archive.header();
  api.own.source(map, 'globe-imagery', { type: 'raster', tiles: [archive.tiles], tileSize: TILE, minzoom: header.minZoom, maxzoom: header.maxZoom });
  // Over the basemap, under everything the map draws.
  const own = new Set((api.descriptor.layers ?? []).map((l) => l.id));
  const before = map.getStyle().layers.find((l) => own.has(l.id))?.id;
  api.own.layer(map, { id: 'globe-imagery', type: 'raster', source: 'globe-imagery', paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], from, 1, to, 0], 'raster-fade-duration': 0 } }, before);
}

/* ---- the poles ------------------------------------------------------------------------ */

/*
 * Every layer the map draws from a point source of the table, its tap layer
 * too, leaves the poles out, by their keys: not the shell's `hide`, which
 * would take them off the picker and ‹ › as well.
 */
function polesOffTheLayers() {
  if (!poles.size) return;
  const off = ['!', ['in', ['get', 'key'], ['literal', [...poles.keys()]]]];
  const points = new Set(Object.entries(api.descriptor.sources ?? {}).filter(([, s]) => s.records === table && s.geometryFrom).map(([name]) => name));
  for (const layer of map.getStyle().layers) {
    if (!points.has(layer.source)) continue;
    const was = map.getFilter(layer.id);
    map.setFilter(layer.id, was ? ['all', was, off] : off);
    api.own.undo(`the poles off ${layer.id}`, () => {
      if (map.getLayer(layer.id)) map.setFilter(layer.id, was ?? null);
    });
  }
}

function buildPoles() {
  const tapDo = tapTarget('point')?.do ?? [{ action: 'select' }];
  for (const key of poles.keys()) {
    const row = rows[key];
    const name = api.valueOf(pickerLabel, row) ?? key;
    const element = api.own.node(document.createElement('button'), `pole ${key}`);
    element.type = 'button';
    element.className = 'globe-pole';
    element.lang = api.language;
    element.setAttribute('aria-label', name);
    const label = document.createElement('span');
    label.className = `globe-pole-name ${row.at[1] > 0 ? 'above' : 'below'}`;
    label.textContent = name;
    element.appendChild(label);
    api.own.domHandler(element, 'click', (event) => {
      event.stopPropagation();
      api.runActions(tapDo, { table, key });
    });
    // Hidden, and untappable, on the far side: MapLibre marks it covered there.
    const marker = api.own.marker(new maplibregl.Marker({ element, opacityWhenCovered: 0 }), `pole ${key}`);
    marker.setLngLat(row.at).addTo(map);
    poles.set(key, { element, marker });
  }
}

/* ---- names at the edge -------------------------------------------------------------------- */

function buildEdges() {
  const { source, text } = spec.edgeLabels;
  const sourceSpec = api.descriptor.sources[source];
  const lines = api.geometry(source);
  if (!sourceSpec || !lines) throw new Error(`globe: edgeLabels.source "${source}" is not a source with a geometry file`);
  const byKey = new Map();
  for (const feature of lines.features) {
    const key = feature.properties[sourceSpec.joinField];
    const parts = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [];
    byKey.set(key, [...(byKey.get(key) ?? []), ...parts.map(densify)]);
  }
  for (const key of order) {
    const parts = byKey.get(key);
    if (!parts) continue;
    const lats = parts.flat().map((s) => s.lat);
    const element = document.createElement('div');
    element.className = 'globe-edge-label';
    element.lang = api.language;
    element.textContent = api.valueOf(text, rows[key]) ?? key;
    element.style.setProperty('--line', colourOf(key));
    overlay.appendChild(element);
    const line = document.createElementNS(SVG, 'line');
    line.setAttribute('stroke', colourOf(key));
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('r', '2.5');
    dot.setAttribute('fill', colourOf(key));
    leaders.append(line, dot);
    // A parallel keeps one latitude: its name goes to the left edge; any
    // other line's to the bottom — the other end where that has no room.
    edges.push({ key, parts, parallel: Math.max(...lats) - Math.min(...lats) < 0.5, element, line, dot, size: null });
  }
}

/** A line's points no more than SAMPLE degrees apart, each with its direction from the globe's centre. */
function densify(coordinates) {
  const out = [];
  for (let i = 0; i < coordinates.length; i++) {
    const [lng, lat] = coordinates[i];
    if (i > 0) {
      const [lng0, lat0] = coordinates[i - 1];
      const steps = Math.ceil(Math.max(Math.abs(lng - lng0), Math.abs(lat - lat0)) / SAMPLE);
      for (let s = 1; s < steps; s++) out.push(sample(lng0 + ((lng - lng0) * s) / steps, lat0 + ((lat - lat0) * s) / steps));
    }
    out.push(sample(lng, lat));
  }
  return out;
}

const unit = (lng, lat) => {
  const l = (lng * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
};
const sample = (lng, lat) => ({ lng, lat, v: unit(lng, lat) });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** The point a share t of the way from a to b, the short way round across the antimeridian. */
const between = (a, b, t) => sample(a.lng + ((((b.lng - a.lng + 540) % 360) - 180) * t), a.lat + (b.lat - a.lat) * t);

/* ---- latitude and longitude beside a place ------------------------------------------------ */

function buildCallouts() {
  if (!spec.coordinates) return;
  for (const key of order) {
    const at = rows[key][spec.coordinates.at];
    if (!at) continue;
    const element = document.createElement('div');
    element.className = 'globe-coords';
    element.lang = api.language;
    for (const line of spec.coordinates.lines) {
      const value = api.valueOf(line, rows[key]);
      if (value === null || value === undefined || value === '') continue;
      const div = document.createElement('div');
      div.textContent = value;
      element.appendChild(div);
    }
    overlay.appendChild(element);
    const line = document.createElementNS(SVG, 'line');
    line.setAttribute('stroke', '#0d5c2e');
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('r', '2.5');
    dot.setAttribute('fill', '#0d5c2e');
    leaders.append(line, dot);
    // A place the map draws as a dot has its own mark; any other gets this one.
    const marked = Boolean(rows[key].at) && !poles.has(key);
    callouts.push({ key, v: unit(at[0], at[1]), element, line, dot, marked, size: null });
  }
}

/* ---- placing everything drawn over the globe ---------------------------------------------- */

/**
 * The view as this module draws over it: MapLibre's globe at pitch 0 and
 * bearing 0, worked out here rather than asked of the map point by point. A
 * point at unit direction v is in front when v·c ≥ 1/D, c the view centre's
 * direction, and on the screen at the view's middle plus
 * f·(v·east, −v·north) / (D − v·c).
 */
function viewOf() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const centre = map.getCenter();
  const f = CAMERA * height;
  const d = 1 + f / globeRadius(map.getZoom(), centre.lat);
  const c = unit(centre.lng, centre.lat);
  const lng = (centre.lng * Math.PI) / 180;
  const lat = (centre.lat * Math.PI) / 180;
  const east = [-Math.sin(lng), Math.cos(lng), 0];
  const north = [-Math.sin(lat) * Math.cos(lng), -Math.sin(lat) * Math.sin(lng), Math.cos(lat)];
  const middle = map.project(centre);
  const inFront = (v) => dot(v, c) >= 1 / d;
  const screen = (v) => {
    const k = f / (d - dot(v, c));
    return { x: middle.x + k * dot(v, east), y: middle.y - k * dot(v, north) };
  };
  const visible = (v) => {
    if (!inFront(v)) return false;
    const p = screen(v);
    return p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;
  };
  // A point on the screen, back onto the globe: where the ray through it
  // first meets the sphere, on the face turned to the viewer; null off it.
  const unproject = (q) => {
    const x = (q.x - middle.x) / f;
    const y = (middle.y - q.y) / f;
    const ray = [0, 1, 2].map((i) => x * east[i] + y * north[i] - c[i]);
    const len = Math.hypot(...ray);
    const r = ray.map((v) => v / len);
    const b = d * dot(c, r);
    const disc = b * b - (d * d - 1);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    const hit = [0, 1, 2].map((i) => d * c[i] + t * r[i]);
    return [(Math.atan2(hit[1], hit[0]) * 180) / Math.PI, (Math.asin(clamp(hit[2], -1, 1)) * 180) / Math.PI];
  };
  return { width, height, middle, inFront, screen, visible, unproject };
}

function place() {
  if (!map || !overlay) return;
  const view = viewOf();
  if (keep.on) drawKeep(view);
  const taken = reserved();
  // Nothing drawn here covers a place's own dot, the map's name for it, or a pole's name.
  for (const key of order) {
    const at = rows[key].at;
    if (!at || poles.has(key)) continue;
    const v = unit(at[0], at[1]);
    if (!view.inFront(v)) continue;
    const p = view.screen(v);
    taken.push({ x: p.x - DOT, y: p.y - DOT, w: 2 * DOT, h: 2 * DOT });
    const name = nameBox(key, p);
    if (name) taken.push(name);
  }
  for (const [key, pole] of poles) {
    if (!pole) continue;
    const [lng, lat] = rows[key].at;
    const v = unit(lng, lat);
    if (!view.inFront(v)) continue;
    const p = view.screen(v);
    const name = pole.element.firstChild;
    const half = pole.element.offsetHeight / 2;
    const w = name.offsetWidth;
    const h = name.offsetHeight;
    taken.push({ x: p.x - half, y: p.y - half, w: 2 * half, h: 2 * half });
    taken.push({ x: p.x - w / 2, y: lat > 0 ? p.y - half - h : p.y + half, w, h });
  }
  placeCallouts(view, taken);
  placeEdges(view, taken);
}

/**
 * Latitude and longitude beside each place that has them: the selected
 * place's first, then from the west; each in the first box round its place,
 * nearest first, that covers nothing else here and no place's point.
 */
function placeCallouts(view, taken) {
  const zoomed = spec.coordinates && map.getZoom() >= spec.coordinates.minZoom;
  const showing = zoomed ? callouts.filter((c) => view.visible(c.v)) : [];
  const at = new Map(showing.map((c) => [c, view.screen(c.v)]));
  const points = [...at.values()];
  const west = Math.min(...points.map((q) => q.x));
  const selected = api.selection.get(table);
  showing.sort((a, b) => (b.key === selected) - (a.key === selected) || at.get(a).x - at.get(b).x);
  for (const c of callouts) if (!at.has(c)) hide(c);
  const placed = [];
  for (const c of showing) {
    const p = at.get(c);
    let found = null;
    for (const box of around(p, sizeOf(c), view, p.x === west)) {
      if (taken.some((t) => overlaps(t, box)) || points.some((q) => contains(grow(box, DOT), q))) continue;
      const from = c.marked ? toward(p, nearestOnBox(box, p), DOT) : p;
      const leader = [from, nearestOnBox(box, from)];
      if (placed.some((q) => crossesBox(leader, q.box) || crossesBox(q.leader, box))) continue;
      found = { box, from, leader };
      break;
    }
    if (!found) {
      hide(c);
      continue;
    }
    show(c, found.box, found.from);
    // A place the map draws as a dot is marked already.
    if (c.marked) c.dot.style.visibility = 'hidden';
    taken.push(found.box);
    placed.push(found);
  }
}

/** A callout's boxes round its place, nearest first, each kept inside the map; the westernmost place's leftward first. */
function around(p, { w, h }, view, west) {
  const place = {
    right: (d) => [p.x + d, p.y - h / 2],
    left: (d) => [p.x - d - w, p.y - h / 2],
    above: (d) => [p.x - w / 2, p.y - d - h],
    below: (d) => [p.x - w / 2, p.y + d],
    'above-right': (d) => [p.x + d * 0.7, p.y - d * 0.7 - h],
    'above-left': (d) => [p.x - d * 0.7 - w, p.y - d * 0.7 - h],
    'below-right': (d) => [p.x + d * 0.7, p.y + d * 0.7],
    'below-left': (d) => [p.x - d * 0.7 - w, p.y + d * 0.7],
  };
  const sides = west ? ['left', 'above-left', 'below-left', 'above', 'below', 'right', 'above-right', 'below-right'] : ['right', 'above-right', 'below-right', 'above', 'below', 'left', 'above-left', 'below-left'];
  const out = [];
  for (let d = GAP; d <= GAP * 4; d += GAP * 0.75)
    for (const side of sides) {
      const [x, y] = place[side](d);
      const box = { x: clamp(x, MARGIN, view.width - MARGIN - w), y: clamp(y, MARGIN, view.height - MARGIN - h), w, h };
      if (fits(box, view.width, view.height)) out.push(box);
    }
  return out;
}

/** The point `by` px from p toward q. */
function toward(p, q, by) {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: p.x + ((q.x - p.x) / len) * by, y: p.y + ((q.y - p.y) / len) * by };
}

/**
 * Each line's name where the line leaves the globe's visible part — at the
 * globe's edge, or the map's when the globe is larger than it. The names on
 * one side of the globe stand in the order of their lines there, moved apart
 * as little as they can, so no two overlap and no leaders cross. The
 * selected line's name keeps its place first, then the picker's order; a name
 * with no room tries its line's next crossing, and is hidden when it has none.
 */
function placeEdges(view, taken) {
  const selected = api.selection.get(table);
  const labels = [];
  for (const edge of edges) {
    edge.element.classList.toggle('selected', edge.key === selected);
    const candidates = crossings(edge, view);
    if (candidates.length) labels.push({ edge, candidates, choice: 0, size: sizeOf(edge) });
  }
  labels.sort((a, b) => (b.edge.key === selected) - (a.edge.key === selected));
  let live = labels;
  let accepted = [];
  const rounds = labels.reduce((n, label) => n + label.candidates.length, 0);
  for (let round = 0; round <= rounds; round++) {
    const boxes = layout(live, view);
    accepted = [];
    let moved = null;
    for (const label of live) {
      const placed = settle(label, boxes.get(label), view, taken, accepted);
      if (placed) {
        accepted.push(placed);
        continue;
      }
      moved = label;
      break;
    }
    if (!moved) break;
    moved.choice += 1;
    if (moved.choice >= moved.candidates.length) live = live.filter((label) => label !== moved);
  }
  const shown = new Set();
  for (const { label, box, anchor } of accepted) {
    show(label.edge, box, anchor);
    shown.add(label.edge);
  }
  for (const edge of edges) if (!shown.has(edge)) hide(edge);
}

/** Where a line leaves the visible part of the globe, each with the way in along it, best first. */
function crossings(edge, view) {
  const out = [];
  let seen = false;
  for (const part of edge.parts) {
    const visible = part.map((s) => view.visible(s.v));
    for (let i = 0; i < part.length; i++) {
      if (!visible[i]) continue;
      seen = true;
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= part.length || visible[j]) continue;
        const crossing = boundary(part[i], part[j], view);
        out.push({ edge: crossing.p, side: sideOf(crossing.p, view), path: pathFrom(crossing, part, i, i - j, view) });
      }
    }
  }
  if (!seen) return [];
  if (!out.length) {
    // Wholly in view, as a small circle round a pole is: its point nearest the globe's edge.
    let best = null;
    for (const part of edge.parts)
      for (const s of part) {
        const p = view.screen(s.v);
        const r = Math.hypot(p.x - view.middle.x, p.y - view.middle.y);
        if (!best || r > best.r) best = { r, p };
      }
    return [{ edge: best.p, side: sideOf(best.p, view), path: [{ ...best.p, along: 0 }], fixed: true }];
  }
  // A parallel's name on the left, any other line's at the bottom, first.
  return edge.parallel ? out.sort((a, b) => a.edge.x - b.edge.x) : out.sort((a, b) => b.edge.y - a.edge.y);
}

/** The last visible point between a (visible) and b (not). */
function boundary(a, b, view) {
  let lo = a;
  let hi = b;
  for (let i = 0; i < 14; i++) {
    const mid = between(lo, hi, 0.5);
    if (view.visible(mid.v)) lo = mid;
    else hi = mid;
  }
  return { ...lo, p: view.screen(lo.v) };
}

/** A line's own points on the screen from its crossing inward, no more than STEP px apart, to PATH px along it. */
function pathFrom(crossing, part, i, step, view) {
  const path = [{ x: crossing.p.x, y: crossing.p.y, along: 0 }];
  let from = crossing;
  let along = 0;
  for (let k = i; k >= 0 && k < part.length && along < PATH; k += step) {
    const to = part[k];
    if (!view.visible(to.v)) break;
    const a = view.screen(from.v);
    const b = view.screen(to.v);
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / STEP));
    for (let t = 1; t <= n && along < PATH; t++) {
      const q = t === n ? b : view.screen(between(from, to, t / n).v);
      const last = path.at(-1);
      along += Math.hypot(q.x - last.x, q.y - last.y);
      path.push({ x: q.x, y: q.y, along });
    }
    from = to;
  }
  return path;
}

/** Which side of the globe a crossing lies on: the map's edge it touches, else the way out from the globe's middle. */
function sideOf(p, view) {
  if (p.x <= 1) return 'left';
  if (p.x >= view.width - 1) return 'right';
  if (p.y <= 1) return 'top';
  if (p.y >= view.height - 1) return 'bottom';
  const dx = p.x - view.middle.x;
  const dy = p.y - view.middle.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}

/** Each name beyond its crossing, out from the globe, kept inside the map; then moved apart along its side. */
function layout(live, view) {
  const boxes = new Map();
  const sides = { left: [], right: [], top: [], bottom: [] };
  for (const label of live) sides[label.candidates[label.choice].side].push(label);
  for (const [side, group] of Object.entries(sides)) {
    if (!group.length) continue;
    const stacked = side === 'left' || side === 'right';
    const items = group.map((label) => {
      const { edge } = label.candidates[label.choice];
      const { w, h } = label.size;
      const x = side === 'left' ? edge.x - LEADER - w : side === 'right' ? edge.x + LEADER : edge.x - w / 2;
      const y = side === 'top' ? edge.y - LEADER - h : side === 'bottom' ? edge.y + LEADER : edge.y - h / 2;
      return { label, x: clamp(x, MARGIN, view.width - MARGIN - w), y: clamp(y, MARGIN, view.height - MARGIN - h), w, h };
    });
    spread(items, stacked ? 'y' : 'x', stacked ? 'h' : 'w', stacked ? view.height : view.width);
    for (const { label, x, y, w, h } of items) boxes.set(label, { x, y, w, h });
  }
  return boxes;
}

/**
 * Boxes along one axis, kept in the order of their own places and moved
 * apart as little as they can: boxes that would overlap become one run,
 * centred where its members' own places average, kept inside the map.
 */
function spread(items, at, size, limit) {
  items.sort((a, b) => a[at] - b[at]);
  const runs = [];
  for (const item of items) {
    runs.push({ members: [item], length: item[size], sum: item[at], start: item[at] });
    for (;;) {
      const b = runs.at(-1);
      b.start = clamp(b.sum / b.members.length, MARGIN, limit - MARGIN - b.length);
      const a = runs.at(-2);
      if (!a || a.start + a.length + MARGIN <= b.start) break;
      a.sum += b.sum - b.members.length * (a.length + MARGIN);
      a.length += MARGIN + b.length;
      a.members.push(...b.members);
      runs.pop();
    }
  }
  for (const run of runs) {
    let offset = 0;
    for (const m of run.members) {
      m[at] = run.start + offset;
      offset += m[size] + MARGIN;
    }
  }
}

/** A name where it was laid out or, with something in its way, slid along its side as little as clears it. */
function settle(label, box, view, taken, accepted) {
  const candidate = label.candidates[label.choice];
  const along = candidate.side === 'left' || candidate.side === 'right' ? 'y' : 'x';
  const blocked = [...taken, ...accepted.map((a) => a.box)];
  for (let shift = 0; shift <= SLIDE; shift += STEP) {
    for (const sign of shift ? [-1, 1] : [1]) {
      const tried = { ...box, [along]: box[along] + sign * shift };
      if (!fits(tried, view.width, view.height) || taken.some((t) => overlaps(t, tried))) continue;
      const anchor = anchorOf(candidate, tried, blocked);
      if (anchor && accepted.every((a) => apart(a, { box: tried, anchor }))) return { label, box: tried, anchor };
    }
  }
  return null;
}

/**
 * Where a name's leader meets its line: INSET px in from the crossing, or
 * further along where the line there is under the name itself, another
 * name, a control or a place's dot.
 */
function anchorOf(candidate, box, blocked) {
  const clear = (p) => !contains(grow(box, 3), p) && !blocked.some((b) => contains(grow(b, 3), p));
  if (candidate.fixed) return clear(candidate.path[0]) ? candidate.path[0] : null;
  return candidate.path.find((p) => p.along >= INSET && clear(p)) ?? null;
}

/** Two placed names keep apart: neither box over the other, nor over the other's leader or the point it meets. */
function apart(a, b) {
  const leaderA = [a.anchor, nearestOnBox(a.box, a.anchor)];
  const leaderB = [b.anchor, nearestOnBox(b.box, b.anchor)];
  return (
    !overlaps(a.box, b.box) &&
    !contains(grow(a.box, 3), b.anchor) &&
    !contains(grow(b.box, 3), a.anchor) &&
    !crossesBox(leaderA, b.box) &&
    !crossesBox(leaderB, a.box) &&
    !segmentsCross(leaderA, leaderB)
  );
}

function beside(p, size, side) {
  if (side === 'left') return { x: p.x - GAP - size.w, y: p.y - size.h / 2, w: size.w, h: size.h };
  if (side === 'right') return { x: p.x + GAP, y: p.y - size.h / 2, w: size.w, h: size.h };
  if (side === 'above') return { x: p.x - size.w / 2, y: p.y - GAP - size.h, w: size.w, h: size.h };
  return { x: p.x - size.w / 2, y: p.y + GAP, w: size.w, h: size.h };
}

/*
 * The map's own names for its places, drawn by a symbol layer on a point
 * source: read from the descriptor — text, size, offset, font — and measured
 * here, each taken where MapLibre first puts it, under its place.
 */
let pointLabel;
const measure = document.createElement('canvas').getContext('2d');
const nameWidths = new Map(); // key -> px, measured again once the fonts are in

function pointLabelOf() {
  if (pointLabel !== undefined) return pointLabel;
  const layer = (api.descriptor.layers ?? []).find((l) => l.type === 'symbol' && api.descriptor.sources?.[l.source]?.geometryFrom);
  const layout = layer ? { ...api.descriptor.styles?.[layer.style]?.layout, ...layer.layout } : null;
  pointLabel = layout?.['text-field']
    ? {
        text: layout['text-field'],
        size: typeof layout['text-size'] === 'number' ? layout['text-size'] : 16,
        offset: typeof layout['text-radial-offset'] === 'number' ? layout['text-radial-offset'] : 0,
        font: layout['text-font']?.[0] ?? 'sans-serif',
      }
    : null;
  return pointLabel;
}

function nameBox(key, p) {
  const label = pointLabelOf();
  if (!label) return null;
  if (!nameWidths.has(key)) {
    measure.font = `${label.size}px "${label.font}"`;
    const text = evaluate(label.text, { ...rows[key], key });
    nameWidths.set(key, typeof text === 'string' ? measure.measureText(text).width : 0);
  }
  const w = nameWidths.get(key) + 4;
  return { x: p.x - w / 2, y: p.y + label.offset * label.size, w, h: label.size * 1.35 };
}

function show(item, box, from) {
  item.element.style.transform = `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`;
  item.element.style.visibility = 'visible';
  const to = nearestOnBox(box, from);
  item.line.setAttribute('x1', from.x.toFixed(1));
  item.line.setAttribute('y1', from.y.toFixed(1));
  item.line.setAttribute('x2', to.x.toFixed(1));
  item.line.setAttribute('y2', to.y.toFixed(1));
  item.line.style.visibility = 'visible';
  if (item.dot) {
    item.dot.setAttribute('cx', from.x.toFixed(1));
    item.dot.setAttribute('cy', from.y.toFixed(1));
    item.dot.style.visibility = 'visible';
  }
}

function hide(item) {
  item.element.style.visibility = 'hidden';
  item.line.style.visibility = 'hidden';
  if (item.dot) item.dot.style.visibility = 'hidden';
}

/** What no name may cover: the map's controls, where they are. */
function reserved() {
  const origin = container.getBoundingClientRect();
  return [...container.querySelectorAll('.maplibregl-ctrl')].map((el) => rectOf(el, origin));
}

function rectOf(el, origin = container.getBoundingClientRect()) {
  const r = el.getBoundingClientRect();
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
}

function sizeOf(item) {
  if (!item.size) {
    const was = item.element.style.visibility;
    item.element.style.visibility = 'hidden';
    item.size = { w: item.element.offsetWidth, h: item.element.offsetHeight };
    item.element.style.visibility = was;
  }
  return item.size;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fits = (box, width, height) => box.x >= MARGIN - 0.5 && box.y >= MARGIN - 0.5 && box.x + box.w <= width - MARGIN + 0.5 && box.y + box.h <= height - MARGIN + 0.5;
const overlaps = (a, b) => a.x < b.x + b.w + MARGIN && b.x < a.x + a.w + MARGIN && a.y < b.y + b.h + MARGIN && b.y < a.y + a.h + MARGIN;
const contains = (box, p) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
const nearestOnBox = (box, p) => ({ x: clamp(p.x, box.x, box.x + box.w), y: clamp(p.y, box.y, box.y + box.h) });
const grow = (box, by) => ({ x: box.x - by, y: box.y - by, w: box.w + 2 * by, h: box.h + 2 * by });

/** Whether a leader, from its point to its name, passes over a box (Liang–Barsky). */
function crossesBox([a, b], box) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, a.x - box.x], [dx, box.x + box.w - a.x], [-dy, a.y - box.y], [dy, box.y + box.h - a.y]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** Whether two leaders cross. */
function segmentsCross([a, b], [c, d]) {
  const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/* ---- taps ------------------------------------------------------------------------------ */

const tapTarget = (kind) => api.tapTargets.find((t) => t.kind === kind && t.table === table);

/**
 * The user's order (2026-09-28): the nearest dot within TAP px of the finger;
 * else the nearest line within TAP px, lines within TIE px of each other (as
 * at a crossing) going by the picker's order; else the smallest area under the
 * finger. The renderer lists features on the globe's far side too, so each
 * counts only where it faces the viewer: a dot in front, a line's run in
 * front, an area holding the tap's own point on the front of the globe.
 */
function resolveTap(p) {
  const view = viewOf();
  const box = [[p.x - TAP, p.y - TAP], [p.x + TAP, p.y + TAP]];
  const found = (target, where = box) => map.queryRenderedFeatures(where, { layers: [target.layer] });

  let best = null;
  for (const target of api.tapTargets.filter((t) => t.kind === 'point'))
    for (const feature of found(target)) {
      const v = unit(...feature.geometry.coordinates);
      if (!view.inFront(v)) continue;
      const at = view.screen(v);
      const d = Math.hypot(at.x - p.x, at.y - p.y);
      if (d <= TAP && (!best || d < best.d)) best = { ...target, key: feature.properties.key, d };
    }
  if (best) return best;

  for (const target of api.tapTargets.filter((t) => t.kind === 'line'))
    for (const feature of found(target)) {
      const d = distanceTo(feature.geometry, p, view);
      const rank = order.indexOf(feature.properties.key);
      if (d > TAP) continue;
      if (!best || d < best.d - TIE || (Math.abs(d - best.d) <= TIE && rank < best.rank)) best = { ...target, key: feature.properties.key, d, rank };
    }
  if (best) return best;

  const here = view.unproject(p);
  if (!here) return null;
  for (const target of api.tapTargets.filter((t) => t.kind === 'fill'))
    for (const feature of found(target, [p.x, p.y])) {
      const key = feature.properties.key;
      const shape = areaOf(target.source, key);
      if (!shape || !shape.rings.some((polygon) => holds(polygon, here))) continue;
      if (!best || shape.size < best.size) best = { ...target, key, size: shape.size };
    }
  return best;
}

/** How far a drawn line passes from the finger, over its runs in front, in px. */
function distanceTo(geometry, p, view) {
  const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
  let best = Infinity;
  for (const part of parts) {
    let last = null;
    for (const s of densify(part)) {
      if (!view.inFront(s.v)) {
        last = null;
        continue;
      }
      const q = view.screen(s.v);
      best = Math.min(best, last ? toSegment(p, last, q) : Math.hypot(q.x - p.x, q.y - p.y));
      last = q;
    }
  }
  return best;
}

/*
 * A record's whole area, from its source's geometry file rather than the
 * tile-clipped piece the renderer hands back: its polygons, and its size for
 * the smallest-wins rule, in square degrees scaled to the ground.
 */
const areas = new Map();
function areaOf(source, key) {
  const id = `${source} ${key}`;
  if (!areas.has(id)) {
    const joinField = api.descriptor.sources[source]?.joinField;
    const polygons = [];
    for (const feature of api.geometry(source)?.features ?? []) {
      if (feature.properties?.[joinField] !== key) continue;
      const g = feature.geometry;
      polygons.push(...(g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []));
    }
    let size = 0;
    for (const [outer, ...holes] of polygons) size += Math.abs(ringArea(outer)) - holes.reduce((n, h) => n + Math.abs(ringArea(h)), 0);
    areas.set(id, polygons.length ? { rings: polygons, size } : null);
  }
  return areas.get(id);
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const k = Math.cos((((ring[i][1] + ring[j][1]) / 2) * Math.PI) / 180);
    sum += (ring[j][0] * k - ring[i][0] * k) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/** Whether a polygon — its outer ring, less its holes — holds a point. */
function holds([outer, ...holes], point) {
  const inRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return inRing(outer) && !holes.some(inRing);
}

function toSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

/* ---- the card ----------------------------------------------------------------------------- */

function buildCard() {
  close = api.own.node(document.createElement('button'), 'globe card close');
  close.type = 'button';
  close.className = 'globe-card-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  api.dom.sheetBody.prepend(close);
  api.own.domHandler(close, 'click', () => api.deselect());
  const kicker = api.dom.kicker;
  api.own.undo('the card chip colour', () => kicker.style.removeProperty('--chip'));

  // At the card's foot, and kept there while a long card scrolls under it.
  turnBar = api.own.node(document.createElement('div'), 'globe antipode bar');
  turnBar.className = 'globe-antipode-bar';
  turnBar.hidden = true;
  turnButton = document.createElement('button');
  turnButton.type = 'button';
  turnButton.className = 'globe-antipode';
  turnButton.lang = api.language;
  turnBar.appendChild(turnButton);
  api.dom.sheetBody.appendChild(turnBar);
  api.own.domHandler(turnButton, 'click', () => {
    const key = api.selection.get(table);
    const other = partnerOf(key);
    if (other === undefined) return;
    // The pair drawn here from the tap until the map has drawn the camera's
    // end whole: registered with the flight, so it waits for the flight too.
    keep.on = true;
    keep.svg?.classList.add('keeping');
    map.once('idle', endKeep);
    // The other place's card opens once the globe has turned to it.
    flyTo(other, reduced() ? 0 : spec.antipode.duration ?? 2600, () => api.runActions([{ action: 'select' }], { table, key: other }));
    place();
  });
}

/* ---- the antipode pair through its flight ------------------------------------------------ */

/*
 * The map's own tiles for the far side of the globe load only as it turns
 * into view, a few hundred ms late, so a place flown to would be undrawn for
 * part of the way. From the tap until the map is idle again, the pair's
 * outlines and points are drawn here instead, over the map's own: each as
 * the descriptor's layers draw it (every line layer on an area source
 * derived from the table, every circle layer on a point source, their paint
 * and filter read for the record as it is selected now) at the same place,
 * by the same projection as everything else here.
 */
function buildKeep() {
  const pair = spec.antipode?.between ?? [];
  if (!pair.length) return;
  keep.svg = api.own.node(document.createElementNS(SVG, 'svg'), 'globe antipode flight');
  keep.svg.setAttribute('class', 'globe-flight');
  keep.svg.setAttribute('aria-hidden', 'true');
  for (const key of pair)
    for (const [name, source] of Object.entries(api.descriptor.sources ?? {})) {
      if (source.records !== table) continue;
      if (source.geometry) {
        const rings = [];
        for (const feature of api.geometry(name)?.features ?? []) {
          if (feature.properties?.[source.joinField] !== key) continue;
          const g = feature.geometry;
          const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
          for (const polygon of polygons) for (const ring of polygon) rings.push(ring.map(([lng, lat]) => unit(lng, lat)));
        }
        if (rings.length) for (const layer of layersOn(name, 'line')) keep.items.push({ key, layer, rings, element: keepElement('path', key) });
      } else if (source.geometryFrom && rows[key][source.geometryFrom]) {
        const [lng, lat] = rows[key][source.geometryFrom];
        for (const layer of layersOn(name, 'circle')) keep.items.push({ key, layer, v: unit(lng, lat), element: keepElement('circle', key) });
      }
    }
}

function keepElement(tag, key) {
  const element = document.createElementNS(SVG, tag);
  element.dataset.key = key;
  element.style.visibility = 'hidden';
  if (tag === 'path') {
    element.setAttribute('fill', 'none');
    element.setAttribute('stroke-linejoin', 'round');
  }
  keep.svg.appendChild(element);
  return element;
}

/** The descriptor's layers of one type on one source, each with its style token's paint under its own. */
const layersOn = (source, type) =>
  (api.descriptor.layers ?? []).filter((l) => l.source === source && l.type === type).map((l) => ({ filter: l.filter, paint: { ...api.descriptor.styles?.[l.style]?.paint, ...l.paint } }));

function drawKeep(view) {
  const selected = api.selection.get(table);
  for (const item of keep.items) {
    const row = { ...rows[item.key], key: item.key, selected: item.key === selected };
    const paint = (name, fallback) => evaluate(item.layer.paint[name] ?? fallback, row);
    let shown = item.layer.filter === undefined || evaluate(item.layer.filter, row) === true;
    if (shown && item.rings) {
      // Each ring's run in front of the globe's edge, broken where it goes behind.
      let d = '';
      for (const ring of item.rings) {
        let pen = false;
        for (const v of ring) {
          if (!view.inFront(v)) {
            pen = false;
            continue;
          }
          const p = view.screen(v);
          d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
          pen = true;
        }
      }
      item.element.setAttribute('d', d);
      item.element.setAttribute('stroke', paint('line-color', '#000000'));
      item.element.setAttribute('stroke-width', paint('line-width', 1));
      item.element.setAttribute('stroke-opacity', paint('line-opacity', 1));
      shown = d !== '';
    } else if (shown) {
      shown = view.inFront(item.v);
      if (shown) {
        // MapLibre strokes a circle outside its radius; an svg circle, across it.
        const p = view.screen(item.v);
        const stroke = paint('circle-stroke-width', 0);
        item.element.setAttribute('cx', p.x.toFixed(1));
        item.element.setAttribute('cy', p.y.toFixed(1));
        item.element.setAttribute('r', String(paint('circle-radius', 5) + stroke / 2));
        item.element.setAttribute('fill', paint('circle-color', '#000000'));
        item.element.setAttribute('stroke', paint('circle-stroke-color', '#000000'));
        item.element.setAttribute('stroke-width', String(stroke));
      }
    }
    item.element.style.visibility = shown ? 'visible' : 'hidden';
  }
}

/** Handed back to the map's own layers, which have now drawn the camera's end whole. */
function endKeep() {
  if (flying) {
    map.once('idle', endKeep);
    return;
  }
  keep.on = false;
  keep.svg.classList.remove('keeping');
  for (const item of keep.items) item.element.style.visibility = 'hidden';
}

function partnerOf(key) {
  const pair = spec.antipode?.between ?? [];
  if (key === undefined || !pair.includes(key)) return undefined;
  return pair[pair.indexOf(key) === 0 ? 1 : 0];
}

/* ---- helpers ------------------------------------------------------------------------------ */

/** A record's point: the one it is drawn at, else where its callout points, else its frame's middle. */
function pointOf(row) {
  if (row.at) return row.at;
  if (spec.coordinates && row[spec.coordinates.at]) return row[spec.coordinates.at];
  const [w, s, e, n] = row.frame;
  return [(w + e) / 2, (s + n) / 2];
}

/*
 * A record's colour: the style token's paint expression, evaluated against
 * the record with its key — the two forms a category colour takes, a
 * literal and `match` on `get`, as the timeline reads them.
 */
function colourOf(key) {
  const colour = spec.edgeLabels?.colour;
  const expression = colour ? api.descriptor.styles?.[colour.style]?.paint?.[colour.paint] : '#0b3d91';
  if (expression === undefined) throw new Error(`globe: style "${colour.style}" has no paint "${colour.paint}"`);
  return evaluate(expression, { ...rows[key], key });
}

/** A style expression read for one record: the few forms the descriptor's paint and filters take. */
function evaluate(expression, row) {
  if (!Array.isArray(expression)) return expression;
  const [op, ...args] = expression;
  if (op === 'literal') return args[0];
  if (op === 'get') return row[args[0]] ?? null;
  if (op === '!') return !evaluate(args[0], row);
  if (op === '==') return evaluate(args[0], row) === evaluate(args[1], row);
  if (op === '!=') return evaluate(args[0], row) !== evaluate(args[1], row);
  if (op === 'in') return (evaluate(args[1], row) ?? []).includes(evaluate(args[0], row));
  if (op === 'coalesce') return args.map((a) => evaluate(a, row)).find((v) => v !== null && v !== undefined) ?? null;
  if (op === 'case') {
    for (let i = 0; i + 1 < args.length; i += 2) if (evaluate(args[i], row)) return evaluate(args[i + 1], row);
    return evaluate(args.at(-1), row);
  }
  if (op === 'match') {
    const input = evaluate(args[0], row);
    for (let i = 1; i + 1 < args.length; i += 2) {
      const labels = Array.isArray(args[i]) ? args[i] : [args[i]];
      if (labels.includes(input)) return evaluate(args[i + 1], row);
    }
    return evaluate(args.at(-1), row);
  }
  throw new Error(`globe: an expression the globe does not read: "${op}"`);
}

/** A colour lightened toward white by TINT: a chip's, under dark text. */
function tint(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#e3e9f1';
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${c.map((v) => Math.round(v + (255 - v) * TINT).toString(16).padStart(2, '0')).join('')}`;
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => reducedMotion.matches;

/** The module's own styles, beside it in the shell's folder; resolves once they apply. */
function stylesheet(href) {
  return new Promise((resolve, reject) => {
    const link = api.own.node(document.createElement('link'), `stylesheet ${href}`);
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = () => reject(new Error(`${href} did not load`));
    document.head.appendChild(link);
  });
}
