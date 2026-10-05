/*
|--------------------------------------------------------------------------
| THE 3D ZONES VIEW — the sea's zones in a solid block of land and sea, in
| real-time 3D (WebGL).
|--------------------------------------------------------------------------
|
| Loaded only for a view of type `zones3d` (maritime-zones, step 3). It draws
| the user's approved mockup (tools/.cache/unclos/maritime-zones-mockup-3d-v7
| .html) with Three.js r128, vendored beside this file and loaded only here,
| from the `scene` model in the view's file (built by
| tools/build-diagram-maritime-zones.mjs): u, the distance from the land
| toward the open sea; v, 0 to 1 along the coast; the depth below the surface.
| Not to scale. Without WebGL, or if Three.js does not load, it hands the
| panel to the 2D zones view (./zones.js) with the same file.
|
| The block: a low, gently rolling coastal plain with field patches and a few
| tree clumps; the bay, the internal waters; earth strata on its four cut
| faces, the terrain's underside filled; a translucent water surface whose
| opacity follows the depth, and translucent water walls on the near, far and
| open-sea faces. The zones' areas lie where the Convention puts them: the
| contiguous zone hatched over the EEZ's inner part, the shelf and the Area
| on the seabed and as thick bands on the cut faces, nodules on the Area's
| floor. The baseline is a white dashed line on a dark edge, with a light
| curtain down to the seabed. Under the near face, four arrows in the zones'
| colours, every one from the baseline, each with its label above it, and
| dashed witness lines down from the marks: drawn in screen space over the
| picture (step 3b), so their widths stay put whatever the stage or the view.
|
| One side view: a drag turns the block — no further than the near face
| still faces the viewer (step 3c) — a pinch or the wheel zooms it
| (× 0.35 to × 1.5 of the distance), and ⟲ («পাশ থেকে») goes back to the side
| view — at once with reduced motion. A frame is drawn only when something
| changes; there is no animation loop.
|
| The picker row at the top is the main way in; its items, the card's title
| and each disc read «<number>. <name>». Each number is a 44 px button on its
| zone; a tap on the zone's own surface or band chooses it too, and a tap on
| nothing, × or Escape closes the card, focus going back to the zone's
| number. Choosing outlines the zone's own area and, for ২–৫, washes the span
| from the baseline and thickens its arrow. The stage keeps the upper part of
| the screen; under it the tip and the legend, or the card in their place.
|
| Every word shown is the descriptor's or the data's.
*/

import { dockedCard, el, pickerBar, stylesheet } from './parts.js?v=c63cfbb211';

// A pointer that moves less than this (CSS px) between down and up is a tap.
const TAP_SLOP = 8;
// The reset's turn back to the side view, in ms (none with reduced motion).
const RESET_MS = 600;

// The drawing's own colours: the land's field patches and trees, the earth's strata by depth under the
// surface, the water from the shallows to the deep, the seabed's sediment.
const FIELDS = ['#6F8E45', '#7E9A4F', '#8BA25A', '#5F803C', '#9CA867', '#748F48'];
const STRATA = [[0, '#A79A80'], [8, '#B6A788'], [26, '#978873'], [52, '#7F7468'], [84, '#69635E'], [118, '#524D4B']];
const INK = '#13252D';

/** Three.js, or null where WebGL is not to be had. */
async function loadThree() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl') ?? probe.getContext('experimental-webgl');
    if (!gl) return null;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    await import('./vendor/three-0.128.0/three.min.js?v=c63cfbb211');
    return globalThis.THREE ?? null;
  } catch {
    return null;
  }
}

export async function mount(panel, context) {
  const T = await loadThree();
  let renderer = null;
  try {
    if (T) renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    renderer = null;
  }
  // No WebGL: the 2D zones view, from the same file.
  if (!renderer) return (await import('./zones.js?v=c63cfbb211')).mount(panel, context);

  const { descriptor, data, art } = context;
  const words = descriptor.words ?? {};
  const M = await art;
  await Promise.all([stylesheet('../shared/picker.css?v=c63cfbb211'), stylesheet('./zones3d.css?v=c63cfbb211')]);

  const zones = data.zones;
  const byId = new Map(zones.map((z) => [z.id, z]));
  const titleOf = (z) => `${z.numberBn}. ${z.nameBn}`;
  const fillOf = (id) => byId.get(id).fill;
  const SH = byId.get('continental-shelf');
  const AR = byId.get('the-area');

  // ---- the model ------------------------------------------------------------------------

  const S = M.scene;
  const U = S.u;
  const PROF = S.profile;
  const s = S.scale;
  const L = S.length;
  const ZB = S.floor * s;
  const X = (u) => u * s;
  const Zc = (v) => -v * L;
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
  const B = S.bay;
  const coastU = (v) => (v > B.from && v < B.to ? U.coast - B.depth * Math.sin((Math.PI * (v - B.from)) / (B.to - B.from)) : U.coast);
  // Value noise, the same on every load: the land's roll, the fields, the sediment's grain.
  const hash = (x, y) => {
    const t = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return t - Math.floor(t);
  };
  function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const f = (t) => t * t * (3 - 2 * t);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * f(xf) + (c - a) * f(yf) + (a - b - c + d) * f(xf) * f(yf);
  }
  function fbm(x, y) {
    let v = 0;
    let a = 0.5;
    let f = 1;
    for (let i = 0; i < 4; i++) {
      v += a * noise(x * f, y * f);
      f *= 2.1;
      a *= 0.5;
    }
    return v;
  }
  /** The land's height: a low coastal plain, rising gently inland and softly rolling — no hills. */
  function landH(u, v) {
    const inland = Math.min(1, Math.max(0, (coastU(v) - 8 - u) / 30));
    return 0.055 + inland * (0.07 + 0.05 * fbm(u * 0.05, v * 4)) + 0.012 * fbm(u * 0.5, v * 40);
  }
  /** The surface's height in world units: the land, the beach, the seabed. */
  function height(u, v) {
    const c = coastU(v);
    const sea = () => -dep(u) * s - 0.025 * fbm(u * 0.05, v * 6);
    if (u < c - 8) return landH(u, v);
    if (u > c + 10) return sea();
    const t = (u - (c - 8)) / 18;
    return landH(c - 8, v) * (1 - t) + sea() * t;
  }
  const NX = 240;
  const NV = 70;
  // Denser samples over the land.
  const uAt = (i) => (i <= 110 ? (i / 110) * 85 : 85 + ((i - 110) / 130) * (U.end - 85));
  const edge = (fn, n) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
  const V3 = (u, v, y) => new T.Vector3(X(u), y, Zc(v));

  // ---- the page ------------------------------------------------------------------------

  panel.classList.add('zones3d');
  const stage = el('div', 'stage loading');
  stage.setAttribute('role', 'group');
  if (descriptor.title?.bn) stage.setAttribute('aria-label', descriptor.title.bn);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.append(renderer.domElement);

  const reset = el('button', 'zones3d-reset', 'bn');
  reset.type = 'button';
  reset.setAttribute('aria-label', words.viewSide);
  reset.title = words.viewSide;
  reset.textContent = '⟲';
  const scaleNote = el('div', 'zones3d-scale fit-text', 'bn');
  scaleNote.dataset.fit = 'scale';
  scaleNote.textContent = words.legend?.scale ?? '';
  stage.append(reset, scaleNote);

  // Under the stage: the tip and the legend; the card takes their place.
  const below = el('div', 'zones3d-below');
  const tip = el('p', 'zones3d-tip', 'bn');
  tip.textContent = words.tip ?? '';
  const legend = el('div', 'zones3d-legend', 'bn');
  const swatch = (svg, text) => {
    const item = el('span', 'zones3d-key');
    item.innerHTML = `<svg viewBox="0 0 26 16" aria-hidden="true">${svg}</svg>`;
    item.append(text);
    legend.append(item);
  };
  const LG = words.legend ?? {};
  swatch(`<line x1="2" y1="8" x2="24" y2="8" stroke="${INK}" stroke-width="2" stroke-dasharray="4 3"/>`, LG.baseline);
  swatch('<defs><pattern id="mz3-hatch-key" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#E7B79A"/><line x1="0" y1="0" x2="0" y2="6" stroke="#B4521A" stroke-width="2.5"/></pattern></defs><rect width="26" height="16" fill="url(#mz3-hatch-key)"/>', LG.contiguous);
  swatch(`<rect width="26" height="16" fill="${SH.band ?? SH.fill}"/>`, LG.shelf);
  swatch(`<rect width="26" height="16" fill="${AR.texture ?? AR.fill}"/>`, LG.area);
  below.append(tip, legend);

  const { card, close, fill } = dockedCard({ close: words.close, id: 'zones3d' });
  const sentences = el('ul', 'zones3d-sentences', 'bn');
  card.querySelector('.card-body').append(sentences);

  let selected = null;
  const { bar, select, row } = pickerBar({
    placeholder: words.picker,
    items: zones.map((z) => ({ key: z.id, label: titleOf(z) })),
    current: () => selected ?? undefined,
    choose: (key) => choose(key),
  });
  panel.append(bar, stage, below, card);

  // ---- the scene ------------------------------------------------------------------------

  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(S.camera.fov, 1, 0.1, 100);
  scene.add(new T.HemisphereLight(0xeaf4ff, 0x6b5a48, 0.95));
  const sun = new T.DirectionalLight(0xfff1dc, 1.5);
  sun.position.set(-3, 6, 5);
  sun.target.position.set(4.5, 0, -2.3);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 30 });
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  /** A mesh from flat arrays. */
  function mesh(p, idx, mat, extra = {}) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    for (const [k, [a, n]] of Object.entries(extra)) g.setAttribute(k, new T.Float32BufferAttribute(a, n));
    g.setIndex(idx);
    const m = new T.Mesh(g, mat);
    scene.add(m);
    return m;
  }
  /** Two rows of points joined as a strip: each pair [top, bottom]. */
  function strip(pairs, mat, extra) {
    const p = [];
    const idx = [];
    pairs.forEach(([a, b]) => p.push(...a, ...b));
    for (let i = 0; i < pairs.length - 1; i++) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    return mesh(p, idx, mat, extra);
  }

  // The terrain: the land's fields, the beach, the seabed shaded by depth.
  const tg = new T.BufferGeometry();
  {
    const tp = [];
    const ti = [];
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NX; i++) tp.push(X(uAt(i)), height(uAt(i), j / NV), Zc(j / NV));
    for (let j = 0; j < NV; j++)
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i;
        const c = a + NX + 1;
        ti.push(a, c, a + 1, a + 1, c, c + 1);
      }
    tg.setAttribute('position', new T.Float32BufferAttribute(tp, 3));
    tg.setIndex(ti);
    tg.computeVertexNormals();
    const tc = [];
    const col = new T.Color();
    const shore = new T.Color('#5C7A3A');
    const sand = new T.Color('#D3C49A');
    const bedA = new T.Color('#CDBF99');
    const bedB = new T.Color('#5F5B55');
    for (let k = 0; k < tp.length / 3; k++) {
      const y = tp[k * 3 + 1];
      const u = tp[k * 3] / s;
      const v = -tp[k * 3 + 2] / L;
      if (y > 0.03) {
        const fid = hash(Math.floor((u + 7 * Math.floor(v * 13)) / 9), Math.floor(v * 13));
        col.set(FIELDS[Math.floor(fid * FIELDS.length)]);
        col.lerp(shore, Math.max(0, 1 - Math.min(1, (coastU(v) - u) / 14)) * 0.4);
        col.multiplyScalar(0.92 + 0.12 * fbm(u * 1.2, v * 80));
      } else if (y > -0.06) col.copy(sand);
      else {
        col.copy(bedA).lerp(bedB, Math.min(1, (-y / (PROF.at(-1)[1] * s)) * 1.1));
        col.multiplyScalar(0.92 + 0.16 * fbm(u * 0.3, v * 30));
      }
      tc.push(col.r, col.g, col.b);
    }
    tg.setAttribute('color', new T.Float32BufferAttribute(tc, 3));
    const terrain = new T.Mesh(tg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }));
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    scene.add(terrain);
    // The terrain's underside, filled.
    scene.add(new T.Mesh(tg, new T.MeshBasicMaterial({ color: '#5B4E42', side: T.BackSide })));
  }

  // Tree clumps: rounded crowns in a few patches on the plain.
  {
    const spots = [];
    for (let k = 0; k < 4000 && spots.length < 140; k++) {
      const u = hash(k, 7) * 72;
      const v = hash(k, 9);
      if (u > coastU(v) - 11) continue;
      const y = height(u, v);
      if (y < 0.05 || fbm(u * 0.12, v * 10) < 0.58) continue;
      if (Math.abs(height(u + 0.4, v) - height(u - 0.4, v)) / (0.8 * s) > 0.8) continue;
      spots.push([u, v, y]);
    }
    const tree = new T.InstancedMesh(new T.IcosahedronGeometry(0.05, 1), new T.MeshStandardMaterial({ roughness: 1, metalness: 0 }), spots.length);
    const m4 = new T.Matrix4();
    const q = new T.Quaternion();
    const sc = new T.Vector3();
    const ps = new T.Vector3();
    const c = new T.Color();
    const light = new T.Color('#4E7A35');
    spots.forEach(([u, v, y], i) => {
      const k = 0.75 + hash(i, 3) * 0.7;
      sc.set(k, k * 1.25, k);
      ps.set(X(u), y + 0.045 * k, Zc(v));
      m4.compose(ps, q, sc);
      tree.setMatrixAt(i, m4);
      c.set('#2F5A2C').lerp(light, hash(i, 5)).multiplyScalar(0.85 + hash(i, 8) * 0.25);
      tree.setColorAt(i, c);
    });
    tree.castShadow = true;
    tree.receiveShadow = true;
    scene.add(tree);
  }

  // The four cut faces: earth strata draped under the surface's edge, down to the floor.
  const strataColor = (d) => STRATA.reduce((c, [k, cc]) => (d >= k ? cc : c), STRATA[0][1]);
  function skirt(points, normal) {
    const p = [];
    const c = [];
    const idx = [];
    const R = 40;
    for (const pt of points) {
      const top = Math.min(pt.y, 0);
      for (let k = 0; k <= R; k++) {
        const yy = k === 0 ? pt.y : top + ((-ZB - top) * k) / R;
        p.push(pt.x, yy, pt.z);
        const cc = new T.Color(pt.y > 0.02 && k === 0 ? '#4F6635' : strataColor((top - yy) / s + (pt.y > 0 ? -8 : 0)));
        cc.multiplyScalar(0.9 + 0.12 * hash(pt.x * 9.1, yy * 7.3));
        c.push(cc.r, cc.g, cc.b);
      }
    }
    for (let i = 0; i < points.length - 1; i++)
      for (let k = 0; k < R; k++) {
        const a = i * (R + 1) + k;
        const b = a + R + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const n = [];
    for (let i = 0; i < p.length / 3; i++) n.push(...normal);
    mesh(p, idx, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), { color: [c, 3], normal: [n, 3] });
  }
  skirt(edge((t) => ({ x: X(uAt(t * NX)), y: height(uAt(t * NX), 0), z: Zc(0) }), NX), [0, 0, 1]);
  skirt(edge((t) => ({ x: X(uAt(t * NX)), y: height(uAt(t * NX), 1), z: Zc(1) }), NX), [0, 0, -1]);
  skirt(edge((t) => ({ x: X(U.end), y: height(U.end, t), z: Zc(t) }), NV), [1, 0, 0]);
  skirt(edge((t) => ({ x: 0, y: height(0, t), z: Zc(t) }), NV), [-1, 0, 0]);
  {
    const floor = new T.Mesh(new T.PlaneGeometry(X(U.end), L), new T.MeshLambertMaterial({ color: '#46413E', side: T.DoubleSide }));
    floor.rotation.x = Math.PI / 2;
    floor.position.set(X(U.end) / 2, -ZB, -L / 2);
    scene.add(floor);
  }
  // A solid core: earth slices across the block, so it reads as filled from every angle.
  {
    const mat = new T.MeshLambertMaterial({ color: '#7A6A58', side: T.DoubleSide });
    for (let j = 1; j < NV; j += 3) {
      const v = j / NV;
      strip(edge((t) => [[X(t * U.end), height(t * U.end, v) - 0.01, Zc(v)], [X(t * U.end), -ZB, Zc(v)]], 90), mat).geometry.computeVertexNormals();
    }
  }

  // The water: a surface clear over the shallows and opaque offshore, and the three outer walls.
  {
    const vertexShader = 'attribute float aDepth;varying float vD;varying vec3 vW;void main(){vD=aDepth;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
    const fragmentShader = `uniform vec3 uSun;varying float vD;varying vec3 vW;
      void main(){float t=clamp(vD/2.4,0.,1.);vec3 sh=vec3(.47,.78,.74),md=vec3(.18,.50,.63),dp=vec3(.06,.22,.36);
      vec3 c=mix(sh,md,smoothstep(0.,.35,t));c=mix(c,dp,smoothstep(.3,1.,t));
      vec3 n=normalize(vec3(sin(vW.x*9.+vW.z*3.)*.06+sin(vW.x*23.-vW.z*5.)*.03,1.,cos(vW.z*11.+vW.x*2.)*.06));
      vec3 V=normalize(cameraPosition-vW);vec3 Lr=normalize(uSun);float sp=pow(max(dot(reflect(-Lr,n),V),0.),70.)*.9;
      float fr=pow(1.-max(dot(n,V),0.),3.)*.35;
      float a=clamp(.16+pow(t,.9)*.9,.16,.93);gl_FragColor=vec4(c+sp+fr*vec3(.8,.9,1.),min(1.,a+sp));}`;
    const p = [];
    const d = [];
    const idx = [];
    const nx = 150;
    const nv = 40;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nx; i++) {
        const v = j / nv;
        const u = coastU(v) - 6 + ((U.end - (coastU(v) - 6)) * i) / nx;
        p.push(X(u), 0, Zc(v));
        d.push(Math.max(0, -height(u, v)));
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const c = a + nx + 1;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    const water = mesh(p, idx, new T.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false, uniforms: { uSun: { value: new T.Vector3(-4, 9, 6) } } }), { aDepth: [d, 1] });
    water.renderOrder = 2;
  }
  function waterWall(pts) {
    const top = new T.Color('#3B8EAA');
    const deep = new T.Color('#0B2C46');
    const c = [];
    const pairs = pts.map((pt) => {
      const bot = Math.min(0, pt.y);
      const low = deep.clone().lerp(top, 1 - Math.min(1, -bot / 2.4));
      c.push(top.r, top.g, top.b, low.r, low.g, low.b);
      return [[pt.x, 0, pt.z], [pt.x, bot, pt.z]];
    });
    strip(pairs, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, side: T.DoubleSide, depthWrite: false }), { color: [c, 3] }).renderOrder = 3;
  }
  waterWall(edge((t) => ({ x: X(U.coast + t * (U.end - U.coast)), y: height(U.coast + t * (U.end - U.coast), 0), z: Zc(0) + 0.001 }), 120));
  waterWall(edge((t) => ({ x: X(U.end) + 0.001, y: height(U.end, t), z: Zc(t) }), 40));
  waterWall(edge((t) => ({ x: X(U.coast + t * (U.end - U.coast)), y: height(U.coast + t * (U.end - U.coast), 1), z: Zc(1) - 0.001 }), 120));

  // ---- the zones' areas, where the Convention places them --------------------------------

  const ZM = {}; // each zone's meshes, which take a tap and brighten when it is chosen
  const reg = (id, m) => {
    m.userData.z = id;
    (ZM[id] ??= []).push(m);
    return m;
  };
  function surfQuad(u0, u1, y, mat) {
    const m = new T.Mesh(new T.PlaneGeometry(X(u1) - X(u0), L), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((X(u0) + X(u1)) / 2, y, -L / 2);
    m.renderOrder = 4;
    scene.add(m);
    return m;
  }
  const overlay = (c) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.34, depthWrite: false });
  {
    const sh = new T.Shape();
    for (let i = 0; i <= 30; i++) sh[i ? 'lineTo' : 'moveTo'](X(coastU(i / 30)), (i / 30) * L);
    sh.lineTo(X(U.base), L);
    sh.lineTo(X(U.base), 0);
    const m = new T.Mesh(new T.ShapeGeometry(sh), overlay(fillOf('internal-waters')));
    m.rotation.x = Math.PI / 2;
    m.position.y = 0.004;
    m.renderOrder = 4;
    scene.add(m);
    reg('internal-waters', m);
  }
  for (const [id, a, b] of [['territorial-sea', U.base, U.u12], ['eez', U.u12, U.u200], ['high-seas', U.u200, U.end]]) reg(id, surfQuad(a, b, 0.004, overlay(fillOf(id))));
  /** A small canvas texture, repeated. */
  function texture(draw) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    draw(cv.getContext('2d'));
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }
  const rgba = (hex, a) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;
  {
    const hatch = texture((x) => {
      x.fillStyle = rgba(fillOf('contiguous-zone'), 0.45);
      x.fillRect(0, 0, 64, 64);
      x.strokeStyle = 'rgba(255,226,204,.95)';
      x.lineWidth = 6;
      for (let k = -64; k < 128; k += 16) {
        x.beginPath();
        x.moveTo(k, 0);
        x.lineTo(k + 64, 64);
        x.stroke();
      }
    });
    hatch.repeat.set(4, 6);
    reg('contiguous-zone', surfQuad(U.u12, U.u24, 0.008, new T.MeshBasicMaterial({ map: hatch, transparent: true, opacity: 0.8, depthWrite: false })));
  }
  /** A strip draped on the seabed from u0 to u1, across the block. */
  function bedStrip(u0, u1, color, opacity, map) {
    const p = [];
    const uv = [];
    const idx = [];
    const nx = Math.max(4, Math.round((u1 - u0) / 4));
    const nv = 30;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nx; i++) {
        const u = u0 + ((u1 - u0) * i) / nx;
        p.push(X(u), height(u, j / nv) + 0.012, Zc(j / nv));
        uv.push((i / nx) * 6, (j / nv) * 6);
      }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const c = a + nx + 1;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    const m = mesh(p, idx, new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, map: map ?? null }), { uv: [uv, 2] });
    m.renderOrder = 5;
    return m;
  }
  const shelfBand = SH.band ?? SH.fill;
  const areaBand = AR.band ?? AR.fill;
  // Past 200 the shelf fades: at least 200, more on conditions; no end.
  const FADE = [[U.u200, 364], [364, 378], [378, U.fade]];
  reg('continental-shelf', bedStrip(U.u12, U.u200, shelfBand, 0.72));
  FADE.forEach(([a, b], i) => reg('continental-shelf', bedStrip(a, b, shelfBand, [0.4, 0.24, 0.1][i])));
  const nodules = texture((x) => {
    x.fillStyle = AR.texture ?? AR.fill;
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#1E1A24';
    for (let k = 0; k < 14; k++) {
      x.beginPath();
      x.ellipse(hash(k, 1) * 64, hash(k, 2) * 64, 3, 2, 0, 0, 7);
      x.fill();
    }
  });
  reg('the-area', bedStrip(U.fade, U.end, '#ffffff', 0.95, nodules));

  // The shelf and the Area as thick bands on the near and far cut faces, the Area's on the open-sea face.
  const BAND = 0.34;
  function faceBand(u0, u1, color, opacity, v) {
    const n = Math.max(6, Math.round((u1 - u0) / 3));
    const off = v === 0 ? 0.006 : -0.006;
    const at = (i) => u0 + ((u1 - u0) * i) / n;
    const m = strip(
      edge((t) => {
        const u = u0 + (u1 - u0) * t;
        return [[X(u), height(u, v) + 0.004, Zc(v) + off], [X(u), height(u, v) - BAND, Zc(v) + off]];
      }, n),
      new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: T.DoubleSide, depthWrite: opacity >= 1 }),
    );
    m.renderOrder = 6;
    if (opacity >= 1) {
      const line = new T.Line(new T.BufferGeometry().setFromPoints(Array.from({ length: n + 1 }, (_, i) => new T.Vector3(X(at(i)), height(at(i), v) - BAND, Zc(v) + off * 1.5))), new T.LineBasicMaterial({ color: INK }));
      line.renderOrder = 7;
      scene.add(line);
    }
    return m;
  }
  for (const v of [0, 1]) {
    reg('continental-shelf', faceBand(U.u12, U.u200, shelfBand, 1, v));
    FADE.forEach(([a, b], i) => reg('continental-shelf', faceBand(a, b, shelfBand, [0.7, 0.45, 0.2][i], v)));
    reg('the-area', faceBand(U.fade, U.end, areaBand, 1, v));
  }
  {
    const m = strip(
      edge((t) => [[X(U.end) + 0.006, height(U.end, t) + 0.004, Zc(t)], [X(U.end) + 0.006, height(U.end, t) - BAND, Zc(t)]], 30),
      new T.MeshLambertMaterial({ color: areaBand, side: T.DoubleSide }),
    );
    m.renderOrder = 6;
    reg('the-area', m);
  }
  {
    const N = 160;
    const nod = new T.InstancedMesh(new T.SphereGeometry(0.028, 8, 6), new T.MeshLambertMaterial({ color: '#2B2522' }), N);
    const m4 = new T.Matrix4();
    for (let i = 0; i < N; i++) {
      const u = U.fade + 4 + hash(i, 11) * (U.end - U.fade - 6);
      const v = 0.02 + hash(i, 13) * 0.96;
      const sc = 0.7 + hash(i, 17) * 0.8;
      m4.makeScale(sc, sc * 0.6, sc);
      m4.setPosition(X(u), height(u, v) + 0.02, Zc(v));
      nod.setMatrixAt(i, m4);
    }
    nod.renderOrder = 6;
    scene.add(nod);
  }

  // ---- lines: outlines, spans, the baseline -------------------------------------------------

  /**
   * A ribbon of flat boxes along points, drawn over everything; dashed if asked — long dashes, about
   * twice their gaps — and drawn after `order`'s lower numbers (an under-stroke goes first).
   */
  const DASH = 0.16;
  const GAP = 0.08;
  function ribbon(points, color, width, dashed, shown = false, order = 9) {
    const grp = new T.Group();
    const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false });
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = a.distanceTo(b);
      const step = dashed ? DASH + GAP : len;
      for (let t = 0; t < len - 1e-6; t += step) {
        const p1 = a.clone().lerp(b, t / len);
        const p2 = a.clone().lerp(b, Math.min(len, t + (dashed ? DASH : len)) / len);
        const m = new T.Mesh(new T.BoxGeometry(p1.distanceTo(p2), 0.004, width), mat);
        m.position.copy(p1).lerp(p2, 0.5);
        m.lookAt(p2);
        m.rotateY(Math.PI / 2);
        m.renderOrder = order;
        grp.add(m);
      }
    }
    grp.visible = shown;
    scene.add(grp);
    return grp;
  }
  const rect = (u0, u1, y) => [V3(u0, 0, y), V3(u1, 0, y), V3(u1, 1, y), V3(u0, 1, y), V3(u0, 0, y)];
  const nearEdge = (u0, u1, n, lift) => edge((t) => V3(u0 + t * (u1 - u0), 0, height(u0 + t * (u1 - u0), 0) + lift), n);
  // The chosen zone, outlined. ২–৫ in one continuous solid line from the baseline to the zone's outer
  // limit, with no line inside it at 12 or 24 nm (step 3c); ৫'s, on the seabed, goes on dashed beyond 200,
  // on a thin dark under-stroke. ১, ৬ and ৭ outline their own areas.
  const OUT = {
    'internal-waters': ribbon([...edge((v) => V3(coastU(v), v, 0.02), 30), V3(U.base, 1, 0.02), V3(U.base, 0, 0.02), V3(coastU(0), 0, 0.02)], '#ffffff', 0.035),
    'territorial-sea': ribbon(rect(U.base, U.u12, 0.02), '#ffffff', 0.035),
    'contiguous-zone': ribbon(rect(U.base, U.u24, 0.02), '#ffffff', 0.035),
    eez: ribbon(rect(U.base, U.u200, 0.02), '#ffffff', 0.035),
    'high-seas': ribbon(rect(U.u200, U.end, 0.02), '#ffffff', 0.035),
    'continental-shelf': (() => {
      const g = ribbon(nearEdge(U.base, U.u200, 40, 0.02), '#ffffff', 0.045);
      const beyond = [ribbon(nearEdge(U.u200, U.fade, 12, 0.02), INK, 0.061, true, true, 8), ribbon(nearEdge(U.u200, U.fade, 12, 0.02), '#ffffff', 0.045, true, true)];
      scene.remove(...beyond);
      g.add(...beyond);
      return g;
    })(),
    'the-area': ribbon(nearEdge(U.fade, U.end, 20, 0.02), '#ffffff', 0.04),
  };
  // For ২–৫, the span from the baseline washed in light: on the surface, or on the seabed for ৫.
  const SPAN = {};
  const spanMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false });
  for (const [id, b] of [['territorial-sea', U.u12], ['contiguous-zone', U.u24], ['eez', U.u200]]) {
    const q = surfQuad(U.base, b, 0.012, spanMat);
    q.visible = false;
    SPAN[id] = q;
  }
  {
    const wash = bedStrip(U.base, U.fade, '#FFF6B0', 0.28);
    wash.visible = false;
    SPAN['continental-shelf'] = wash;
  }
  // The baseline: a white dashed line on a dark edge, and a light curtain down to the seabed.
  {
    const a = [V3(U.base, 0, 0.03), V3(U.base, 1, 0.03)];
    ribbon(a, INK, 0.075, false, true, 8);
    ribbon(a, '#ffffff', 0.045, true, true);
    strip(edge((v) => [[X(U.base), 0, Zc(v)], [X(U.base), height(U.base, v), Zc(v)]], 40), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false })).renderOrder = 7;
  }

  // The distance arrows under the near face, every one from the baseline, and the witness lines down
  // from the marks, drawn in screen space by the overlay (place(), below), so no width changes with the
  // stage, the orbit or a pinch. Each witness line is a vertical in the scene at its mark, projected;
  // each arrow is level on the screen, ending where its row crosses those lines. The first row is where
  // the first bar stood, or the nearest clear place where a word is in the way (place()); the rest
  // follow ROW_PX apart: room for a 14 px label, its 6 px gap, and clear of the arrowhead of the row above.
  const ROW_PX = 29;
  const HEAD = [9, 4]; // an arrowhead's length, and its half-width
  const ROW_Z = 0.03;
  const FIRST_ROW = -ZB - 0.42;
  const uOf = { u12: U.u12, u24: U.u24, u200: U.u200, beyond: S.beyond };

  // Two ships and a platform on the shelf: simple shapes of our own.
  function ship(u, v, k) {
    const g = new T.Group();
    const hull = new T.Mesh(new T.BoxGeometry(0.9, 0.12, 0.2), new T.MeshLambertMaterial({ color: '#2A353C' }));
    hull.position.y = 0.06;
    g.add(hull);
    ['#7A5C48', '#4F6D7A', '#8C7B5A', '#5D6B57'].forEach((c, i) => {
      const b = new T.Mesh(new T.BoxGeometry(0.16, 0.1, 0.17), new T.MeshLambertMaterial({ color: c }));
      b.position.set(-0.3 + i * 0.18, 0.17, 0);
      g.add(b);
    });
    const bridge = new T.Mesh(new T.BoxGeometry(0.12, 0.2, 0.16), new T.MeshLambertMaterial({ color: '#E6EAEC' }));
    bridge.position.set(0.36, 0.2, 0);
    g.add(bridge);
    g.scale.setScalar(k);
    g.position.set(X(u), 0, Zc(v));
    scene.add(g);
  }
  ship(420, 0.7, 0.9);
  ship(300, 0.45, 0.75);
  {
    const g = new T.Group();
    const steel = new T.MeshLambertMaterial({ color: '#9AA4AC' });
    const foot = height(292, 0.12);
    for (const [dx, dz] of [[-0.12, -0.08], [0.12, -0.08], [-0.12, 0.08], [0.12, 0.08]]) {
      const h = -foot + 0.25;
      const leg = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, h, 8), steel);
      leg.position.set(dx, foot + h / 2, dz);
      g.add(leg);
    }
    const deck = new T.Mesh(new T.BoxGeometry(0.36, 0.06, 0.26), new T.MeshLambertMaterial({ color: '#56616A' }));
    deck.position.y = 0.27;
    const derrick = new T.Mesh(new T.ConeGeometry(0.06, 0.4, 4), new T.MeshLambertMaterial({ color: '#C2CAD0' }));
    derrick.position.set(0.06, 0.5, 0);
    g.add(deck, derrick);
    g.position.set(X(292), 0, Zc(0.12));
    scene.add(g);
  }

  // ---- the arrows and witness lines over the picture, in screen space -------------------------

  // Under the numbers and words; hidden with the picture if WebGL goes. Every line is CSS px wide.
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = (name, cls, parent) => {
    const node = document.createElementNS(SVG, name);
    if (cls) node.setAttribute('class', cls);
    parent.append(node);
    return node;
  };
  const arrowLayer = document.createElementNS(SVG, 'svg');
  arrowLayer.setAttribute('class', 'zones3d-overlay');
  arrowLayer.setAttribute('aria-hidden', 'true');
  stage.append(arrowLayer);
  const witness = [U.base, U.u12, U.u24, U.u200].map((u) => ({
    u,
    halo: svg('line', 'zones3d-witness-halo', arrowLayer),
    line: svg('line', `zones3d-witness${u === U.base ? ' base' : ''}`, arrowLayer),
  }));
  const ARROWS = {};
  S.bars.forEach(([id, to], i) => {
    const g = svg('g', 'zones3d-arrow', arrowLayer);
    g.style.color = fillOf(id);
    ARROWS[id] = {
      g,
      row: i,
      end: uOf[to],
      solidEnd: to === 'beyond' ? U.u200 : uOf[to],
      shaft: svg('line', 'shaft', g),
      dashed: to === 'beyond' ? svg('line', 'shaft dashed', g) : null,
      head: svg('polyline', 'head', g),
      tick: svg('line', 'tick', g),
    };
  });
  renderer.domElement.addEventListener('webglcontextlost', () => {
    arrowLayer.style.display = 'none';
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    arrowLayer.style.display = '';
    req();
  });

  // ---- the words and numbers over the picture ------------------------------------------------

  const discs = {};
  for (const z of zones) {
    const b = el('button', 'zone zones3d-disc', 'bn');
    b.type = 'button';
    b.dataset.key = z.id;
    b.dataset.title = titleOf(z);
    b.setAttribute('aria-label', titleOf(z));
    b.style.color = z.fill;
    // A layer label, as zones.js's numbers are: what tools/check.mjs waits for and measures.
    const n = el('span', 'layer-label', 'bn');
    n.dataset.key = z.id;
    n.textContent = z.numberBn;
    b.append(n);
    stage.append(b);
    discs[z.id] = b;
  }
  const label = (text, cls, fit) => {
    const d = el('div', `zones3d-label fit-text${cls ? ` ${cls}` : ''}`, 'bn');
    d.dataset.fit = fit;
    d.textContent = text;
    stage.append(d);
    return d;
  };
  const barLabels = Object.fromEntries(S.bars.map(([id]) => [id, label(words.distances?.[id] ?? '', 'up', `bar ${id}`)]));
  const nameLabels = { 'continental-shelf': label(LG.shelf, null, 'name shelf'), 'the-area': label(LG.area, null, 'name area') };
  const baseLabel = label(LG.baseline, null, 'baseline');

  function anchorOf(id) {
    const [u, v, y] = S.anchors[id];
    return y === null ? new T.Vector3(X(u), height(u, 0) - 0.17, Zc(v) + 0.02) : new T.Vector3(X(u), y, Zc(v));
  }
  function place() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const pr = (p) => {
      const q = p.clone().project(cam);
      return [((q.x + 1) / 2) * w, ((1 - q.y) / 2) * h, q.z];
    };
    const at = (node, [x, y], dx = 0) => {
      node.style.left = `${(x + dx).toFixed(1)}px`;
      node.style.top = `${y.toFixed(1)}px`;
    };
    for (const z of zones) {
      const [x, y, zz] = pr(anchorOf(z.id));
      at(discs[z.id], [x, y]);
      discs[z.id].hidden = zz > 1 || x < 0 || x > w || y < 0 || y > h;
    }
    // A name stands right of its number, or left of it where the stage ends first.
    for (const id of Object.keys(nameLabels)) {
      const p = pr(anchorOf(id));
      const wide = nameLabels[id].offsetWidth;
      at(nameLabels[id], p, p[0] + 20 + wide + 4 > w ? -20 - wide - 8 : 20);
    }
    // The witness lines, from the surface down to their arrows; then each arrow, a tick on the
    // baseline's line, and its label 6 px above its line.
    const P = (u, y) => pr(new T.Vector3(X(u), y, ROW_Z));
    /** The point at screen height y on the vertical through mark u, projected. */
    const onMark = (u, y) => {
      const a = P(u, 0);
      const b = P(u, FIRST_ROW);
      const k = (y - a[1]) / (b[1] - a[1] || 1);
      return [a[0] + (b[0] - a[0]) * k, y, Math.max(a[2], b[2])];
    };
    const lineHalf = (id) => (id === selected ? 4 : 2.5) / 2;
    // The rows sit where the first bar stood, clear of the scale note and the names on the picture: a
    // row takes its label and its line, tick to head.
    const sb = stage.getBoundingClientRect();
    const boxOf = (n) => {
      const r = n.getBoundingClientRect();
      return [r.left - sb.left, r.top - sb.top, r.right - sb.left, r.bottom - sb.top];
    };
    // …and of the numbers' discs, as drawn (30 px; their tap zones may overlap the arrows).
    const blockers = [
      ...[scaleNote, ...Object.values(nameLabels)].filter((n) => !n.hidden && n.offsetWidth).map(boxOf),
      ...Object.values(discs).filter((d) => !d.hidden).map((d) => boxOf(d.firstElementChild)),
    ];
    const takenBy = (y0) =>
      S.bars.flatMap(([id], i) => {
        const y = y0 + ROW_PX * i;
        const x0 = onMark(U.base, y)[0];
        const x1 = onMark(ARROWS[id].end, y)[0];
        const lb = y - 6.05 - lineHalf(id);
        return [
          [x0 + 4, lb - barLabels[id].offsetHeight, x0 + 4 + barLabels[id].offsetWidth, lb],
          [x0 - 5, y - HEAD[1] - lineHalf(id), x1 + lineHalf(id), y + HEAD[1] + lineHalf(id)],
        ];
      });
    const MARGIN = 3;
    const clashes = (y0) => {
      const boxes = takenBy(y0);
      const inside = boxes.every(([, t0, , b0]) => t0 >= MARGIN && b0 <= h - MARGIN);
      return !inside || boxes.some(([l, t0, r, b0]) => blockers.some(([bl, bt, br, bb]) => l < br + MARGIN && r > bl - MARGIN && t0 < bb + MARGIN && b0 > bt - MARGIN));
    };
    // The first bar's place if it is clear; else the clear place nearest it, just below or just above a
    // word in the way; else the first bar's place after all.
    const first = P(U.base, FIRST_ROW)[1];
    const span = takenBy(0);
    const top0 = Math.min(...span.map((x) => x[1]));
    const bottom0 = Math.max(...span.map((x) => x[3]));
    const candidates = [first, ...blockers.flatMap(([, bt, , bb]) => [bb + MARGIN + 0.5 - top0, bt - MARGIN - 0.5 - bottom0])].sort((p, q) => Math.abs(p - first) - Math.abs(q - first));
    const Y0 = candidates.find((y0) => !clashes(y0)) ?? first;
    const rowAt = (i) => Y0 + ROW_PX * i;
    // A witness line goes down to the last arrow that starts or ends on it, and 8 px past it.
    const bottomOf = (u) => rowAt(Math.max(...Object.values(ARROWS).filter((A) => u === U.base || A.end === u || A.solidEnd === u).map((A) => A.row))) + 8;
    const xy = (node, a, b) => {
      node.setAttribute('x1', a[0].toFixed(2));
      node.setAttribute('y1', a[1].toFixed(2));
      node.setAttribute('x2', b[0].toFixed(2));
      node.setAttribute('y2', b[1].toFixed(2));
    };
    const unit = (a, b) => {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
    };
    let down = [0, 1];
    for (const wl of witness) {
      const a = P(wl.u, 0);
      const b = onMark(wl.u, bottomOf(wl.u));
      xy(wl.halo, a, b);
      xy(wl.line, a, b);
      if (wl.u === U.base) down = unit(a, b);
    }
    for (const [id, A] of Object.entries(ARROWS)) {
      const y = rowAt(A.row);
      const p0 = onMark(U.base, y);
      const pS = onMark(A.solidEnd, y);
      const pE = onMark(A.end, y);
      A.g.style.display = [p0, pE].some((p) => p[2] > 1) ? 'none' : '';
      xy(A.shaft, p0, pS);
      if (A.dashed) xy(A.dashed, pS, pE);
      const [dx, dy] = unit(A.dashed ? pS : p0, pE);
      const bx = pE[0] - dx * HEAD[0];
      const by = pE[1] - dy * HEAD[0];
      const hw = HEAD[1];
      A.head.setAttribute('points', `${(bx - dy * hw).toFixed(2)},${(by + dx * hw).toFixed(2)} ${pE[0].toFixed(2)},${pE[1].toFixed(2)} ${(bx + dy * hw).toFixed(2)},${(by - dx * hw).toFixed(2)}`);
      xy(A.tick, [p0[0] - down[0] * 5, p0[1] - down[1] * 5], [p0[0] + down[0] * 5, p0[1] + down[1] * 5]);
      at(barLabels[id], [p0[0] + 4, y - 6.05 - lineHalf(id)]); // 6 px clear, after rounding to 0.1 px
    }
    // The labels never overlap: the rows keep them ROW_PX apart; should two still come within 6 px, they
    // are stacked in one column, ROW_PX apart, at the leftmost label's place.
    const boxes = S.bars.map(([id]) => boxOf(barLabels[id]));
    if (boxes.some((a, i) => boxes.some((b, j) => j > i && a[0] < b[2] + 6 && b[0] < a[2] + 6 && a[1] < b[3] + 6 && b[1] < a[3] + 6))) {
      const x = Math.min(...boxes.map((b) => b[0]));
      S.bars.forEach(([id], i) => at(barLabels[id], [x, rowAt(i) - 6.05 - lineHalf(id)]));
    }
    const b = pr(new T.Vector3(X(U.base), 0.5, Zc(0.98)));
    at(baseLabel, b, -30);
    baseLabel.hidden = b[2] > 1;
  }

  // ---- the camera: one side view, a drag turns it, a pinch or the wheel zooms -----------------

  const C = S.camera;
  const target = new T.Vector3(...C.target);
  const orb = { az: C.azimuth, el: C.elevation, k: 1 };
  // How far a drag may turn the block (step 3c): only so far that the near face still faces the viewer
  // and the arrows under it stay readable — the azimuth within ORBIT_AZ of the side view's, the
  // elevation between the two ORBIT_EL bounds, in radians.
  const ORBIT_AZ = 0.4;
  const ORBIT_EL = [0.12, 0.7];
  const [kMin, kMax] = C.zoom;
  const fitR = () => {
    const t = Math.tan(T.MathUtils.degToRad(cam.fov / 2));
    return Math.max(C.fit[0] / (t * cam.aspect), C.fit[1] / t);
  };
  function applyCam() {
    const r = fitR() * orb.k;
    cam.position.set(target.x + r * Math.cos(orb.el) * Math.sin(orb.az), target.y + r * Math.sin(orb.el), target.z + r * Math.cos(orb.el) * Math.cos(orb.az));
    cam.lookAt(target);
  }
  // A frame only when something changed.
  let pending = 0;
  function req() {
    pending ||= requestAnimationFrame(() => {
      pending = 0;
      applyCam();
      renderer.render(scene, cam);
      place();
      stage.classList.remove('loading');
    });
  }
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    req();
  }
  window.addEventListener('resize', resize);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  function toSide() {
    const goal = { az: C.azimuth, el: C.elevation, k: 1 };
    if (reduced?.matches) {
      Object.assign(orb, goal);
      req();
      return;
    }
    const from = { ...orb };
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / RESET_MS);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      for (const key of ['az', 'el', 'k']) orb[key] = from[key] + (goal[key] - from[key]) * e;
      req();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  reset.addEventListener('click', toSide);

  const pointers = new Map();
  let pinch = 0;
  let moved = 0;
  let down = false;
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.zones3d-disc, .zones3d-reset')) return;
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    moved = 0;
    down = true;
  });
  stage.addEventListener('pointermove', (event) => {
    const was = pointers.get(event.pointerId);
    if (!was) return;
    const dx = event.clientX - was[0];
    const dy = event.clientY - was[1];
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (pointers.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      orb.az = Math.min(C.azimuth + ORBIT_AZ, Math.max(C.azimuth - ORBIT_AZ, orb.az - dx * 0.008));
      orb.el = Math.min(ORBIT_EL[1], Math.max(ORBIT_EL[0], orb.el + dy * 0.006));
      req();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) {
        orb.k = Math.min(kMax, Math.max(kMin, (orb.k * pinch) / d));
        req();
      }
      pinch = d;
      moved += TAP_SLOP + 2;
    }
  });
  const lift = (event) => {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size < 2) pinch = 0;
    if (pointers.size === 0 && down) {
      down = false;
      if (moved < TAP_SLOP && event.type === 'pointerup') tap(event.clientX, event.clientY);
    }
  };
  stage.addEventListener('pointerup', lift);
  stage.addEventListener('pointercancel', lift);
  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      orb.k = Math.min(kMax, Math.max(kMin, orb.k * (1 + Math.sign(event.deltaY) * 0.08)));
      req();
    },
    { passive: false },
  );

  // A tap on the picture: the zone under it, a surface zone before a seabed one; on nothing, the card closes.
  const ray = new T.Raycaster();
  const tappable = Object.values(ZM).flat();
  function tap(cx, cy) {
    const r = stage.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), cam);
    const hits = ray.intersectObjects(tappable, false);
    if (!hits.length) return clear(false);
    const bed = (h) => h.object.userData.z === 'continental-shelf' || h.object.userData.z === 'the-area';
    const top = hits.find((h) => !bed(h));
    let key = (top && top.distance < hits[0].distance + 0.5 ? top : hits[0]).object.userData.z;
    if (key === 'eez' && hits.some((h) => h.object.userData.z === 'contiguous-zone')) key = 'contiguous-zone';
    if (key === selected) clear(false);
    else choose(key);
  }

  // ---- choosing -----------------------------------------------------------------------------

  function light() {
    for (const [k, g] of Object.entries(OUT)) g.visible = k === selected;
    for (const [k, g] of Object.entries(SPAN)) g.visible = k === selected;
    for (const [k, list] of Object.entries(ZM))
      for (const m of list) {
        m.userData.base ??= m.material.opacity;
        m.material.opacity = k === selected ? Math.min(0.95, m.userData.base + 0.25) : m.userData.base;
      }
    for (const [k, { g }] of Object.entries(ARROWS)) g.classList.toggle('on', k === selected);
    for (const [k, b] of Object.entries(discs)) b.classList.toggle('on', k === selected);
    req();
  }

  function choose(key) {
    const z = byId.get(key);
    if (!z) return;
    selected = key;
    fill(titleOf(z), [], {});
    sentences.replaceChildren(
      ...z.sentences.map((text) => {
        const li = el('li', null, 'bn');
        li.textContent = text;
        return li;
      }),
    );
    below.hidden = true;
    card.hidden = false;
    select.value = key;
    row.sync();
    light();
  }

  function clear(returnFocus) {
    if (selected === null) return;
    const was = selected;
    selected = null;
    card.hidden = true;
    below.hidden = false;
    select.value = '';
    row.sync();
    light();
    if (returnFocus) (discs[was].hidden ? select : discs[was]).focus();
  }

  for (const [key, b] of Object.entries(discs))
    b.addEventListener('click', () => {
      if (key === selected) clear(false);
      else choose(key);
    });
  close.addEventListener('click', () => clear(true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selected !== null && !panel.hidden) clear(true);
  });

  const ready = (async () => {
    await document.fonts?.ready;
    resize();
    // Settled once the first frame is drawn and the numbers placed on it.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })();

  return {
    ready,
    shown() {
      resize();
    },
  };
}
