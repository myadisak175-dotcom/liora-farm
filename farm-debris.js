// farm-debris.js  —  what lies on the farm before it can be dug: weeds, rocks, branches and stumps, one to a square. One job:
// build them, keep which square each is on, and take one away when the clearing magic reaches it. (26 Nov 2026: "ของรกให้
// เคลียร์", cleared with magic, "ใช้เวทเคลียร์", nothing got for them yet.) What casts the magic, and its splash: the page
// (soil.html) or the game's farm tools (farm-tools.js: the water's own splash, magic-combo-fx.js). The curse's thorns are
// not here: they go with the curse, lifted.
//
//   const debris = createFarmDebris({ heightAt, rockPaint });      // rockPaint: { texture, tile }: the cliffs' painted stone
//   scene.add(debris.object);
//   debris.put(key, kind, x, z, seed, casts)   on a square (key: any name for it, e.g. 'i,j'): 'weed' | 'pebbles' | 'stone' |
//                                      'boulder' | 'branch' | 'stump' (casts: how many it still takes, if not all: a thing
//                                      half broken when the farm was left, a little smaller for each)
//   debris.on(key) -> { kind, casts, x, z, top } or null      what lies on that square (casts: how many it still takes)
//   debris.cast(key) -> { kind, gone, x, y, z, size } or null  the clearing magic reaches it: a shake, or (its last) it goes
//                                      its own way: weeds wither down into the ground, a rock or a boulder breaks into
//                                      pieces that fall and sink, a branch sinks, a stump is drawn down into the earth
//   debris.keys()                       the squares something lies on
//   debris.pick(ray) -> { key, t } or null   the nearest thing a ray (THREE.Ray, as from a tap) meets, t metres along it: a rock
//                                      or wood by its own shape, a weed as a tuft half a metre high
//   debris.clear()                      everything taken away at once (no show)
//   debris.update(dt)                   each frame
//   setDebrisSun(dir)                   the wood's light (the rocks and the weeds have their own: rocks.js, ground-cover.js)
//
// How they are made, the kit's way: the weeds are the ground cover's tall tufts (ground-cover.js), a fern among them now and
// then; the rocks are the rock kit's (rocks.js), painted with the map's cliff stone, as the village's are; branches and stumps
// are built here, low poly, in four flat tones of wood stepped by the light (bark; the cut face of a stump pale, with its rings).
// Big things take more than one cast: a boulder and a stump three, a stone two.
//
// How they are drawn: a farm overgrown has some two hundred of them, and a draw for each would cost the phone dearly. Those
// lying still are drawn together: every weed in one go (one ground cover), and each kind of rock and wood in a few shapes,
// each shape one instanced mesh, every one of them turned and sized its own way. Only what is going (withering, breaking,
// sinking) is drawn by itself, for the moment it takes.

import * as THREE from 'three';
import { _internal } from './stylized-nature.js';
import { createGroundCover } from './ground-cover.js';
import { propRockGeometry, propRockMaterial } from './rocks.js';

const { rgb, shared, mulberry32 } = _internal;
const SUN = { value: new THREE.Vector3(-0.62, 0.62, 0.48).normalize() };
export function setDebrisSun(dir) { SUN.value.copy(dir); if (SUN.value.y < 0.15) SUN.value.y = 0.15; SUN.value.normalize(); }
const CASTS = { weed: 1, pebbles: 1, stone: 2, boulder: 3, branch: 1, stump: 3 };
const SHAPES = { pebbles: 4, stone: 4, boulder: 3, branch: 4, stump: 3 };     // how many shapes of each (a shape: one draw, however many lie)
const ROCK_SIZE = { pebbles: 0.9, stone: 0.95, boulder: 0.6 };            // (times the kit's own: so each lies within its square)
const WOOD = { bark: '#6f5341', barkDark: '#4f3a2e', cut: '#dcbd8f', rings: '#b88d5f' };

// ---- the wood's look: its own colour (per point) in four steps of the light, the haze over it (drawn one by one or many at once)
let woodMat = null;
function woodMaterial() {
  if (woodMat) return woodMat;
  woodMat = new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: { uSun: SUN, uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vN, vCol;
      varying float vHaze;
      void main() {
        vec4 lp = vec4(position, 1.0);
        vec3 ln = normal;
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp; ln = mat3(instanceMatrix) * ln;
        #endif
        vN = normalize(mat3(modelMatrix) * ln); vCol = color;
        vec4 mv = viewMatrix * modelMatrix * lp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun, uHaze;
      varying vec3 vN, vCol;
      varying float vHaze;
      void main() {
        float t = dot(normalize(vN), uSun) * 0.5 + 0.5;
        float k = mix(0.58, 0.76, smoothstep(0.3, 0.38, t));
        k = mix(k, 0.92, smoothstep(0.5, 0.58, t));
        k = mix(k, 1.06, smoothstep(0.72, 0.8, t));
        gl_FragColor = vec4(mix(vCol * k, uHaze, vHaze), 1.0);
      }`,
  });
  return woodMat;
}
const paint = (g, hex, jitter = 0.06, rng = Math.random) => {
  const c = rgb(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = 1 + (rng() - 0.5) * jitter; col[i * 3] = c.x * k; col[i * 3 + 1] = c.y * k; col[i * 3 + 2] = c.z * k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};
// a tube along a curve, thinner toward its end
function limb(points, r0, r1, rng, hex = WOOD.bark) {
  const curve = new THREE.CatmullRomCurve3(points), seg = 10, rad = 5;
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false), p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let s = 0; s <= seg; s++) {
    curve.getPointAt(s / seg, c);
    const r = r0 + (r1 - r0) * (s / seg);
    for (let k = 0; k <= rad; k++) { const i = s * (rad + 1) + k; v.fromBufferAttribute(p, i).sub(c).multiplyScalar(r).add(c); p.setXYZ(i, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return paint(g, hex, 0.12, rng);
}
function branchGeometry(seed) {
  const rng = mulberry32(seed * 911 + 7), L = 1.0 + rng() * 0.45, bend = (rng() - 0.5) * 0.3, parts = [];
  const pts = [0, 0.33, 0.66, 1].map(t => new THREE.Vector3((t - 0.5) * L, 0.06 + Math.sin(t * 3.1) * 0.05, Math.sin(t * 3.1) * bend));      // (its middle off the ground: it lies on its twigs)
  parts.push(limb(pts, 0.065, 0.025, rng));
  for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) {                   // a twig or two off it
    const t = 0.3 + rng() * 0.4, a = new THREE.Vector3((t - 0.5) * L, 0.04, Math.sin(t * 3.1) * bend), side = rng() < 0.5 ? -1 : 1;
    const d = new THREE.Vector3(0.12 + rng() * 0.1, 0.02, side * (0.16 + rng() * 0.12));
    parts.push(limb([a, a.clone().addScaledVector(d, 0.5).add(new THREE.Vector3(0, 0.02, 0)), a.clone().add(d).setY(0.02)], 0.03, 0.012, rng, WOOD.barkDark));
  }
  return parts;
}
function stumpGeometry(seed) {
  const rng = mulberry32(seed * 613 + 3), r = 0.3 + rng() * 0.07, h = 0.34 + rng() * 0.14, parts = [];
  const trunk = new THREE.CylinderGeometry(r * 0.92, r * 1.12, h, 10, 2, true);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + Math.sin(a * 3 + seed) * 0.07 + (rng() - 0.5) * 0.05; p.setXYZ(i, p.getX(i) * k, p.getY(i) + h / 2, p.getZ(i) * k); }
  trunk.computeVertexNormals(); parts.push(paint(trunk, WOOD.bark, 0.14, rng));
  const top = new THREE.CircleGeometry(r * 0.93, 10); top.rotateX(-Math.PI / 2); top.translate(0, h + 0.002, 0); parts.push(paint(top, WOOD.cut, 0.05, rng));
  const ring = new THREE.RingGeometry(r * 0.42, r * 0.5, 12); ring.rotateX(-Math.PI / 2); ring.translate(0.01, h + 0.004, -0.01); parts.push(paint(ring, WOOD.rings, 0.04, rng));
  const core = new THREE.CircleGeometry(r * 0.12, 8); core.rotateX(-Math.PI / 2); core.translate(0.01, h + 0.005, -0.01); parts.push(paint(core, WOOD.rings, 0.04, rng));
  for (let k = 0, n = 4 + Math.floor(rng() * 2); k < n; k++) {              // roots going out and down into the ground
    const a = k / n * 6.28 + rng() * 0.5, out = r * (1.9 + rng() * 0.5), dx = Math.cos(a), dz = Math.sin(a);
    parts.push(limb([new THREE.Vector3(dx * r * 0.7, h * 0.45, dz * r * 0.7), new THREE.Vector3(dx * r * 1.3, h * 0.12, dz * r * 1.3), new THREE.Vector3(dx * out, -0.04, dz * out)], 0.07, 0.02, rng, WOOD.barkDark));
  }
  return parts;
}
const merge = parts => {                                                  // (only what the wood needs: position, normal, colour)
  let n = 0; for (const g of parts) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g0 of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    for (let i = 0; i < P.count; i++, o++) {
      pos.set([P.getX(i), P.getY(i), P.getZ(i)], o * 3); nor.set([N.getX(i), N.getY(i), N.getZ(i)], o * 3); col.set([C.getX(i), C.getY(i), C.getZ(i)], o * 3);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
};
const woodGeos = new Map();                                               // 'branch:2' -> its geometry (made once, shared)
const woodGeometry = (kind, shape) => {
  const k = kind + ':' + shape;
  if (!woodGeos.has(k)) woodGeos.set(k, merge(kind === 'branch' ? branchGeometry(shape) : stumpGeometry(shape)));
  return woodGeos.get(k);
};

export function createFarmDebris({ heightAt = () => 0, rockPaint = null } = {}) {
  const object = new THREE.Group(); object.name = 'farmDebris';
  const items = new Map(), going = new Set(), bits = [], shaking = new Set();
  const rockMat = propRockMaterial({ moss: 0.35, world: false, tone: 'pale', paint: rockPaint });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), caster = new THREE.Raycaster();

  // ---- the still ones, drawn together: a shape of rock or wood is one instanced mesh; every weed is in one ground cover
  const sets = new Map();                                                 // 'kind:shape' -> { kind, geo, mat, mesh, items, dirty }
  const setOf = (kind, shape) => {
    const key = kind + ':' + shape;
    if (!sets.has(key)) {
      const rock = kind in ROCK_SIZE;
      // (a rock in the kit's second detail: as small as these lie, the finest is never seen, and a farm has a hundred of them)
      sets.set(key, { kind, geo: rock ? propRockGeometry(kind, shape, 1) : woodGeometry(kind, shape), mat: rock ? rockMat : woodMaterial(), mesh: null, items: [], dirty: true });
    }
    return sets.get(key);
  };
  const matrixOf = it => m4.compose(v.set(it.x + it.dx, it.y0, it.z + it.dz), q.setFromAxisAngle(UP, it.rotY), sc.setScalar(it.scale));
  const draw = s => {
    s.dirty = false;
    if (!s.mesh || s.mesh.instanceMatrix.count < s.items.length) {        // (room for a few more than lie there: a mesh is made again only when it overflows)
      if (s.mesh) { object.remove(s.mesh); s.mesh.dispose(); }
      s.mesh = new THREE.InstancedMesh(s.geo, s.mat, s.items.length + 8);
      s.mesh.name = 'farmDebris-' + s.kind;
      object.add(s.mesh);
    }
    s.items.forEach((it, i) => s.mesh.setMatrixAt(i, matrixOf(it)));
    s.mesh.count = s.items.length;
    s.mesh.instanceMatrix.needsUpdate = true;
    s.mesh.visible = s.items.length > 0;
    if (s.items.length) s.mesh.computeBoundingSphere();
  };
  const weeds = { items: [], mesh: null, dirty: false };
  const drawWeeds = () => {
    weeds.dirty = false;
    if (weeds.mesh) { object.remove(weeds.mesh); weeds.mesh.userData.dispose(); weeds.mesh = null; }
    const list = weeds.items.flatMap(it => it.tufts);
    if (!list.length) return;
    const m = createGroundCover(list), box = new THREE.Box3();
    // (ground-cover.js has it drawn wherever the camera looks, its ribbons being placed by the shader: these are given their
    // bounds, so the farm's weeds are not drawn when the farm is out of view)
    for (const t of list) box.expandByPoint(v.set(t.x, t.y, t.z));
    m.geometry.boundingSphere = box.expandByScalar(1.4).getBoundingSphere(new THREE.Sphere());
    m.frustumCulled = true; m.name = 'farmDebris-weeds';
    weeds.mesh = m; object.add(m);
  };
  const tuftsOf = it => {                                                 // a weed: a tuft or two (a fern now and then), each on its own ground
    const rng = mulberry32(it.seed * 131 + 5), list = [];
    for (let k = 0, n = 1 + Math.floor(rng() * 2); k < n; k++) {
      const kind = rng() < 0.18 ? 'fern' : 'tuft', x = it.x + (rng() - 0.5) * 0.45, z = it.z + (rng() - 0.5) * 0.45;
      list.push({ kind, x, y: heightAt(x, z) - 0.01, z, seed: it.seed * 7 + k, scale: 0.75 + rng() * 0.35 });
    }
    return list;
  };

  const api = {
    object,
    put(key, kind, x, z, seed = 1, casts = CASTS[kind]) {
      api.take(key);
      const y = heightAt(x, z), it = { key, kind, casts: Math.max(1, Math.min(CASTS[kind], Math.round(casts))), x, z, y, seed, dx: 0, dz: 0, shake: 0 };
      if (kind === 'weed') { it.tufts = tuftsOf(it); it.top = 0.6; weeds.items.push(it); weeds.dirty = true; }
      else {
        const rock = kind in ROCK_SIZE, s = setOf(kind, 1 + (Math.abs(Math.round(seed)) % SHAPES[kind]));
        it.set = s; it.rotY = (seed * 2.399) % 6.283; it.y0 = y - (rock ? 0.06 : 0.01);
        it.scale = (rock ? ROCK_SIZE[kind] : 1) * Math.pow(0.94, CASTS[kind] - it.casts);      // (a little smaller for each cast it has taken)
        it.top = rock ? s.geo.boundingBox.max.y * it.scale : kind === 'stump' ? 0.42 : 0.12;
        s.items.push(it); s.dirty = true;
      }
      items.set(key, it);
    },
    on(key) { const it = items.get(key); return it ? { kind: it.kind, casts: it.casts, x: it.x, z: it.z, top: it.y + it.top } : null; },
    take(key) {
      const it = items.get(key);
      if (!it) return;
      items.delete(key); shaking.delete(it);
      const list = it.kind === 'weed' ? weeds.items : it.set.items;
      list.splice(list.indexOf(it), 1);
      if (it.kind === 'weed') weeds.dirty = true; else it.set.dirty = true;
    },
    clear() {
      for (const k of [...items.keys()]) api.take(k);
      for (const g of going) { object.remove(g.holder); if (g.dispose) g.dispose(); }
      going.clear();
      for (const b of bits) object.remove(b.m);
      bits.length = 0;
    },
    keys: () => [...items.keys()],
    pick(ray) {
      let best = null;
      caster.ray.copy(ray); caster.far = 200;
      for (const s of sets.values()) {
        if (!s.mesh || !s.mesh.visible || s.dirty) continue;
        const h = caster.intersectObject(s.mesh, false)[0];
        if (h && h.instanceId !== undefined && s.items[h.instanceId] && (!best || h.distance < best.t)) best = { key: s.items[h.instanceId].key, t: h.distance };
      }
      for (const it of weeds.items) {                                      // (a weed: where the ray passes within a quarter metre of its foot, below 45 cm)
        v.set(it.x, it.y + 0.22, it.z).sub(ray.origin);
        const t = v.dot(ray.direction);
        if (t <= 0 || (best && t >= best.t)) continue;
        const dx = v.x - ray.direction.x * t, dy = v.y - ray.direction.y * t, dz = v.z - ray.direction.z * t;
        if (Math.hypot(dx, dz) < 0.25 && Math.abs(dy) < 0.23) best = { key: it.key, t };
      }
      return best;
    },
    cast(key) {
      const it = items.get(key);
      if (!it) return null;
      it.casts--;
      const at = { kind: it.kind, gone: it.casts <= 0, x: it.x, y: it.y + it.top * 0.5, z: it.z, size: it.kind === 'boulder' || it.kind === 'stump' ? 1.4 : 0.95 };
      if (it.casts > 0) { it.shake = 0.3; it.scale *= 0.94; it.set.dirty = true; shaking.add(it); return at; }
      api.take(key);                                                       // out of the still ones: it goes its own way, by itself
      if (it.kind === 'weed') {                                            // it withers down into the ground
        const m = createGroundCover(it.tufts), holder = new THREE.Group();
        holder.add(m); object.add(holder);
        going.add({ kind: 'weed', t: 0, holder, y: 0, m, dispose: () => m.userData.dispose() });
      } else if (it.kind === 'branch' || it.kind === 'stump') {            // it sinks, or is drawn down, turning
        const m = new THREE.Mesh(it.set.geo, woodMaterial());
        m.position.set(it.x, it.y0, it.z); m.rotation.y = it.rotY; m.scale.setScalar(it.scale);
        object.add(m);
        going.add({ kind: it.kind, t: 0, holder: m, y: it.y0, s: it.scale });
      } else {                                                             // it breaks: its pieces are thrown a little way and sink
        const rng = mulberry32(Math.round(it.x * 97 + it.z * 31) + 7), n = it.kind === 'boulder' ? 7 : it.kind === 'stone' ? 5 : 3;
        for (let k = 0; k < n; k++) {
          const m = new THREE.Mesh(propRockGeometry('stone', 1 + k + Math.floor(rng() * 40), 2), rockMat), a = rng() * 6.28, sp = 0.8 + rng() * 1.4;
          m.scale.setScalar((it.kind === 'boulder' ? 0.42 : 0.3) * (0.6 + rng() * 0.6)); m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
          m.position.set(it.x + Math.cos(a) * 0.1, it.y + it.top * 0.5, it.z + Math.sin(a) * 0.1);
          object.add(m);
          bits.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 1.6 + rng() * 1.4, Math.sin(a) * sp), spin: (rng() - 0.5) * 9, t: 0, landed: false });
        }
      }
      return at;
    },
    update(dt) {
      for (const it of shaking) {                                          // a cast that did not finish it: a shake
        it.shake = Math.max(0, it.shake - dt);
        const k = it.shake / 0.3, w = Math.sin(it.shake * 70) * 0.05 * k;
        it.dx = w; it.dz = w * 0.6; it.set.dirty = true;
        if (it.shake <= 0) shaking.delete(it);
      }
      if (weeds.dirty) drawWeeds();
      for (const s of sets.values()) if (s.dirty) draw(s);
      for (const g of going) {                                             // its last: each goes its own way
        g.t += dt;
        const k = Math.min(1, g.t / (g.kind === 'stump' ? 0.7 : 0.4)), e = k * k * (3 - 2 * k);
        if (g.kind === 'weed') { g.m.userData.thin(1 - e); g.holder.position.y = -e * 0.25; }
        else if (g.kind === 'branch') { g.holder.position.y = g.y - e * 0.12; g.holder.scale.setScalar(g.s * (1 - 0.5 * e)); }
        else if (g.kind === 'stump') { g.holder.position.y = g.y - e * 0.75; g.holder.rotation.y += dt * 4 * (1 - k); }
        if (k >= 1) { object.remove(g.holder); if (g.dispose) g.dispose(); going.delete(g); }
      }
      for (let i = bits.length - 1; i >= 0; i--) {                         // the broken rock's pieces: thrown, then sinking
        const b = bits[i];
        b.t += dt;
        if (!b.landed) {
          b.v.y -= 9.8 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += b.spin * dt; b.m.rotation.z += b.spin * 0.7 * dt;
          const g = heightAt(b.m.position.x, b.m.position.z);
          if (b.m.position.y < g + 0.04 && b.v.y < 0) { b.landed = true; b.m.position.y = g + 0.04; b.t = 0; }
        } else {
          b.m.position.y -= dt * 0.35;
          if (b.t > 0.7) { object.remove(b.m); bits.splice(i, 1); }
        }
      }
    },
    dispose() {
      api.clear();
      for (const s of sets.values()) if (s.mesh) { object.remove(s.mesh); s.mesh.dispose(); }
      sets.clear();
      if (weeds.mesh) { object.remove(weeds.mesh); weeds.mesh.userData.dispose(); weeds.mesh = null; }
    },
  };
  object.userData.dispose = () => api.dispose();
  return api;
}
