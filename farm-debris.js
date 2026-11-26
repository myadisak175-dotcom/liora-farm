// farm-debris.js  —  what lies on the farm before it can be dug: weeds, rocks, branches and stumps, one to a square. One job:
// build them, keep which square each is on, and take one away when the clearing magic reaches it. (26 Nov 2026: "ของรกให้
// เคลียร์", cleared with magic, "ใช้เวทเคลียร์", nothing got for them yet.) What casts the magic, and its splash: the page
// (soil.html: the water's own splash, magic-combo-fx.js). The curse's thorns are not here: they go with the curse, lifted.
//
//   const debris = createFarmDebris({ heightAt, rockPaint });      // rockPaint: { texture, tile }: the cliffs' painted stone
//   scene.add(debris.object);
//   debris.put(key, kind, x, z, seed)   on a square (key: any name for it, e.g. 'i,j'): 'weed' | 'pebbles' | 'stone' |
//                                      'boulder' | 'branch' | 'stump'
//   debris.on(key) -> { kind, casts, x, z, top } or null      what lies on that square (casts: how many it still takes)
//   debris.cast(key) -> { kind, gone, x, y, z, size } or null  the clearing magic reaches it: a shake, or (its last) it goes
//                                      its own way: weeds wither down into the ground, a rock or a boulder breaks into
//                                      pieces that fall and sink, a branch sinks, a stump is drawn down into the earth
//   debris.clear()                      everything taken away at once (no show)
//   debris.update(dt)                   each frame
//   setDebrisSun(dir)                   the wood's light (the rocks and the weeds have their own: rocks.js, ground-cover.js)
//
// How they are made, the kit's way: the weeds are the ground cover's tall tufts (ground-cover.js), a fern among them now and
// then; the rocks are the rock kit's (rocks.js), painted with the map's cliff stone, as the village's are; branches and stumps
// are built here, low poly, in four flat tones of wood stepped by the light (bark; the cut face of a stump pale, with its rings).
// Big things take more than one cast: a boulder and a stump three, a stone two.

import * as THREE from 'three';
import { _internal } from './stylized-nature.js';
import { createGroundCover } from './ground-cover.js';
import { propRockGeometry, propRockMaterial } from './rocks.js';

const { rgb, shared, mulberry32 } = _internal;
const SUN = { value: new THREE.Vector3(-0.62, 0.62, 0.48).normalize() };
export function setDebrisSun(dir) { SUN.value.copy(dir); if (SUN.value.y < 0.15) SUN.value.y = 0.15; SUN.value.normalize(); }
const CASTS = { weed: 1, pebbles: 1, stone: 2, boulder: 3, branch: 1, stump: 3 };
const WOOD = { bark: '#6f5341', barkDark: '#4f3a2e', cut: '#dcbd8f', rings: '#b88d5f' };

// ---- the wood's look: its own colour (per point) in four steps of the light, the haze over it
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
        vN = normalize(mat3(modelMatrix) * normal); vCol = color;
        vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
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
  out.computeBoundingSphere();
  return out;
};

export function createFarmDebris({ heightAt = () => 0, rockPaint = null } = {}) {
  const object = new THREE.Group(); object.name = 'farmDebris';
  const items = new Map(), going = new Set(), bits = [];
  const rockMat = propRockMaterial({ moss: 0.35, world: false, tone: 'pale', paint: rockPaint });
  const ROCK_SIZE = { pebbles: 0.9, stone: 0.95, boulder: 0.6 };          // (times the kit's own: so each lies within its square)

  const build = (kind, seed) => {
    if (kind === 'weed') {
      const rng = mulberry32(seed * 131 + 5), list = [];
      for (let k = 0, n = 1 + Math.floor(rng() * 2); k < n; k++) list.push({ kind: rng() < 0.18 ? 'fern' : 'tuft', x: (rng() - 0.5) * 0.45, y: 0, z: (rng() - 0.5) * 0.45, seed: seed * 7 + k, scale: 0.75 + rng() * 0.35 });
      const m = createGroundCover(list); m.frustumCulled = false;
      return { obj: m, top: 0.6 };
    }
    if (kind === 'pebbles' || kind === 'stone' || kind === 'boulder') {
      const m = new THREE.Mesh(propRockGeometry(kind, seed), rockMat), s = ROCK_SIZE[kind];
      m.scale.setScalar(s); m.rotation.y = (seed * 2.399) % 6.283;
      const box = m.geometry.boundingBox;
      return { obj: m, top: box ? box.max.y * s : 0.4, rock: true };
    }
    const g = merge(kind === 'branch' ? branchGeometry(seed) : stumpGeometry(seed));
    const m = new THREE.Mesh(g, woodMaterial()); m.rotation.y = (seed * 2.399) % 6.283;
    return { obj: m, top: kind === 'stump' ? 0.42 : 0.12 };
  };
  const api = {
    object,
    put(key, kind, x, z, seed = 1) {
      api.take(key);
      const { obj, top, rock } = build(kind, seed), y = heightAt(x, z);
      const holder = new THREE.Group(); holder.position.set(x, y - (rock ? 0.06 : 0.01), z); holder.add(obj);
      object.add(holder);
      items.set(key, { kind, casts: CASTS[kind], x, z, y, top, holder, obj, shake: 0, base: holder.position.clone() });
    },
    on(key) { const it = items.get(key); return it ? { kind: it.kind, casts: it.casts, x: it.x, z: it.z, top: it.y + it.top } : null; },
    take(key) { const it = items.get(key); if (!it) return; object.remove(it.holder); items.delete(key); },
    clear() { for (const k of [...items.keys()]) api.take(k); for (const g of going) object.remove(g.holder); going.clear(); for (const b of bits) object.remove(b.m); bits.length = 0; },
    keys: () => [...items.keys()],
    cast(key) {
      const it = items.get(key);
      if (!it) return null;
      it.casts--;
      const at = { kind: it.kind, gone: it.casts <= 0, x: it.x, y: it.y + it.top * 0.5, z: it.z, size: it.kind === 'boulder' || it.kind === 'stump' ? 1.4 : 0.95 };
      if (it.casts > 0) { it.shake = 0.3; it.holder.scale.multiplyScalar(0.94); return at; }
      items.delete(key);
      it.t = 0; going.add(it);
      if (it.kind === 'pebbles' || it.kind === 'stone' || it.kind === 'boulder') {      // it breaks: its pieces are thrown a little way and sink
        it.holder.visible = false;
        const rng = mulberry32(Math.round(it.x * 97 + it.z * 31) + 7), n = it.kind === 'boulder' ? 7 : it.kind === 'stone' ? 5 : 3;
        for (let k = 0; k < n; k++) {
          const m = new THREE.Mesh(propRockGeometry('stone', 1 + k + Math.floor(rng() * 40)), rockMat), a = rng() * 6.28, sp = 0.8 + rng() * 1.4;
          m.scale.setScalar((it.kind === 'boulder' ? 0.42 : 0.3) * (0.6 + rng() * 0.6)); m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
          m.position.set(it.x + Math.cos(a) * 0.1, it.y + it.top * 0.5, it.z + Math.sin(a) * 0.1);
          object.add(m);
          bits.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 1.6 + rng() * 1.4, Math.sin(a) * sp), spin: (rng() - 0.5) * 9, t: 0, landed: false });
        }
      }
      return at;
    },
    update(dt) {
      for (const it of items.values()) if (it.shake > 0) {                  // a cast that did not finish it: a shake
        it.shake = Math.max(0, it.shake - dt);
        const k = it.shake / 0.3, w = Math.sin(it.shake * 70) * 0.05 * k;
        it.holder.position.set(it.base.x + w, it.base.y, it.base.z + w * 0.6);
      }
      for (const it of going) {                                            // its last: each goes its own way
        it.t += dt;
        const k = Math.min(1, it.t / (it.kind === 'stump' ? 0.7 : 0.4)), e = k * k * (3 - 2 * k);
        if (it.kind === 'weed') { if (it.obj.userData.thin) it.obj.userData.thin(1 - e); it.holder.position.y = it.base.y - e * 0.25; }
        else if (it.kind === 'branch') { it.holder.position.y = it.base.y - e * 0.12; it.holder.scale.setScalar(1 - 0.5 * e); }
        else if (it.kind === 'stump') { it.holder.position.y = it.base.y - e * 0.75; it.holder.rotation.y += dt * 4 * (1 - k); }
        if (k >= 1) { object.remove(it.holder); going.delete(it); }
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
  };
  return api;
}
