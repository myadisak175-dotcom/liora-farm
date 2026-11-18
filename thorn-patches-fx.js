/* ==========================================================================
   thorn-patches-fx.js  —  the thorns of the plant boss's ultimate that burst up out of the ground all over the field
   (plant-boss-moves.js: play('ultimate'), its patches): in each patch, the thicket's own thorned vines (thicket-fx.js's,
   laid with its vineBuilder, so they look and move as the thicket's do), a handful of them, smaller than the thicket's.
   Before they come, the warning: a ring of orange light on the ground that fills from its middle, its rim beating, cracks
   glowing in it and pebbles hopping. Then they burst up through the broken ground with dust, flying stones and sparks,
   writhe a moment, and sink back; the broken earth fades. One job: draw that. It decides nothing: the moves say when.

     const fx = createThornPatchesFx({ heightAt, seed, lift })   heightAt(x, z): the ground's height (world); null: the
                                                                 patches' own height. lift: metres the ground's light is
                                                                 laid over the ground (over the grass's tips)
     scene.add(fx.object)
     moves.onEvent = e => fx.event(e)          the ultimate's patches: 'warn' and 'hit' with a patch (and its shape, a
                                               ring); 'cancel' (the warnings go, quickly)
     every frame: fx.update(dt, camera)        (the same dt the moves get)
     fx.shake                                  0..1: how hard the ground jolts now (the camera's to shake, if it likes)
     fx.setSun(vec3), fx.busy, fx.dispose()

   PATCH holds how many vines a patch throws up, how big they are (K: 1 as the thicket's are), and their times after the
   'hit' (they stand, then sink).

   How it is drawn, the kit's way: the vines as the thicket's (one mesh and its dark outline, all patches' vines in it:
   two draw calls); the ground's light, the warning and the broken earth of every patch in one mesh, worked out in its
   shader from the clock (one draw call); stones (one), dust (one), sparks (one).
   ========================================================================== */
import * as THREE from 'three';
import { _fx, THICKET_LOOK } from './thicket-fx.js';
import { mulberry32, _internal as natureInternal } from './stylized-nature.js';

const { NOISE } = natureInternal;
const { SPARK_VS, SPARK_FS, PUFF_VS, PUFF_FS, ROCK_VS, ROCK_FS, makePool, col, makeVines, vineBuilder } = _fx;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sstep = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };
const outBack = x => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);

// a patch: vines it throws up; K: how big they are (1: as the thicket's); after the hit they stand (stand seconds) and sink
export const PATCH = { vines: 5, K: 0.62, stand: 0.75, fade: 1.4 };
const MAX_VINES = 40;

// --------------------------------------------------------------------------
// the ground's light of every patch: a small square of mesh laid over the ground at each
//   aLocal: where on it (in its radii); aTimes: when it was warned, when it bursts, when it is gone (the effect's clock;
//   x less than 0: none); aDice
// --------------------------------------------------------------------------
const MARK_VS = /* glsl */`
uniform float uTime;
attribute vec2 aLocal;
attribute vec3 aTimes;
attribute float aDice;
varying vec2 vL;
varying vec3 vT;
varying float vDice;
void main() {
  vL = aLocal; vT = aTimes; vDice = aDice;
  if (aTimes.x < 0.0 || uTime < aTimes.x || uTime > aTimes.z) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const MARK_FS = /* glsl */`
${NOISE}
uniform float uTime;
uniform vec3 uWarn, uWarnHot, uRim, uRimGlow, uCrack, uCrackHot, uE0, uE1, uE2, uSeam;
varying vec2 vL;
varying vec3 vT;
varying float vDice;
vec4 acc;
void over(vec3 c, float a) { a = clamp(a, 0.0, 1.0); acc = vec4(c * a, a) + acc * (1.0 - a); }
void glow(vec3 c, float a) { acc.rgb += c * clamp(a, 0.0, 1.0); }
void main() {
  float r = length(vL), a = atan(vL.y, vL.x);
  float warned = vT.x, hit = vT.y, gone = vT.z, t = uTime;
  acc = vec4(0.0);
  float n = noise2(vL * 3.0 + vDice * 30.0);
  // the broken plates and the cracks between them (cells of the ground, a little warped)
  vec2 q = vL * 3.2 + (vec2(noise2(vL * 2.0 + vDice * 7.0), noise2(vL * 2.0 - vDice * 5.0)) - 0.5) * 0.8;
  vec2 ci = floor(q), cf = fract(q);
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = ci + vec2(float(i), float(j));
    vec2 p = vec2(hash2(c / 16.0), hash2((c + 5.0) / 16.0)) + vec2(float(i), float(j)) - cf;
    float d = dot(p, p);
    if (d < d1) { d2 = d1; d1 = d; id = hash2((c + 9.0) / 16.0); } else if (d < d2) d2 = d;
  }
  float seam = 1.0 - smoothstep(0.02, 0.08, sqrt(d2) - sqrt(d1));
  float lead = hit - warned, fill = clamp((t - warned) / max(lead, 0.01), 0.0, 1.0);
  if (t < hit) {
    // the warning: a ring of orange light filling from its middle, its rim beating; cracks glowing in it
    float show = smoothstep(0.0, 0.12, t - warned);
    float inside = 1.0 - smoothstep(0.97, 1.0, r);
    float wv = fract(r * 2.0 - t * (0.6 + 1.4 * fill));
    float wave = smoothstep(0.0, 0.1, wv) * (1.0 - smoothstep(0.1, 0.45, wv)) * smoothstep(0.2, 0.45, r);
    over(mix(uWarn, uWarnHot, smoothstep(0.55, 0.98, r) * 0.55 + wave * 0.45), show * inside * (0.68 + 0.12 * wave + 0.1 * (1.0 - smoothstep(fill - 0.02, fill, r))));
    over(uRim, show * inside * exp(-pow((r - fill) / 0.025, 2.0)) * 0.6);
    float beat = 0.8 + 0.2 * sin(t * (7.0 + 14.0 * fill));
    float d = r - 1.0;
    glow(uRimGlow, show * (exp(-max(d, 0.0) / 0.08) * step(0.0, d) * 0.8 + exp(min(d, 0.0) / 0.1) * step(d, 0.0) * 0.5) * beat);
    over(uRim, show * (1.0 - smoothstep(0.02, 0.04, abs(d + 0.03))));
    float cracks = seam * (1.0 - smoothstep(fill * 1.05 - 0.05, fill * 1.05, r)) * inside;
    over(mix(uCrack, uCrackHot, 0.5 + 0.5 * sin(t * 18.0 + id * 9.0)), cracks * smoothstep(0.3, 0.9, fill) * show);
  } else {
    // broken ground where they came up: plates of earth, their seams glowing, then cooling; it fades once they have sunk
    float since = t - hit, fade = 1.0 - smoothstep(gone - hit - 1.0, gone - hit, since);
    float edge = 0.85 + 0.1 * sin(a * 5.0 + vDice * 30.0) + (n - 0.5) * 0.2;
    float earth = (1.0 - smoothstep(edge - 0.05, edge, r)) * smoothstep(0.0, 0.08, since);
    vec3 e = id < 0.33 ? uE0 : (id < 0.7 ? uE1 : uE2);
    e = mix(e, uSeam, seam);
    over(e, earth * fade * 0.9);
    glow(uCrackHot, seam * earth * fade * (1.0 - smoothstep(0.0, 1.2, since)) * 0.7);
    glow(uRimGlow, exp(-max(r - edge, 0.0) / 0.1) * step(edge, r) * (1.0 - smoothstep(0.0, 0.6, since)) * 0.5);
  }
  if (acc.a < 0.003 && max(acc.r, max(acc.g, acc.b)) < 0.003) discard;
  gl_FragColor = acc;
}`;

const over = extra => ({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true, ...extra });
const additive = extra => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, ...extra });

export function createThornPatchesFx({ heightAt = null, seed = 1, lift = 0.08, look = THICKET_LOOK } = {}) {
  const rng = mulberry32(seed * 541 + 17);
  const object = new THREE.Group();
  object.name = 'thorn_patches_fx';
  object.visible = false;
  const sun = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  const T = { value: 0 };
  const groundAt = (x, z, y) => (heightAt ? heightAt(x, z) : y);

  // ---- the ground's light: MARKS squares of G x G points
  const MARKS = 32, G = 10, PER = G * G, EXT = 1.15;
  const mg = new THREE.BufferGeometry();
  const mPos = new Float32Array(MARKS * PER * 3), mLoc = new Float32Array(MARKS * PER * 2), mTimes = new Float32Array(MARKS * PER * 3).fill(-1), mDice = new Float32Array(MARKS * PER);
  const idx = [];
  for (let s = 0; s < MARKS; s++) for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) { const b = s * PER + j * G + i; idx.push(b, b + G, b + 1, b + 1, b + G, b + G + 1); }
  mg.setIndex(idx);
  const aPos = new THREE.BufferAttribute(mPos, 3).setUsage(THREE.DynamicDrawUsage), aLoc = new THREE.BufferAttribute(mLoc, 2).setUsage(THREE.DynamicDrawUsage);
  const aTimes = new THREE.BufferAttribute(mTimes, 3).setUsage(THREE.DynamicDrawUsage), aDice = new THREE.BufferAttribute(mDice, 1).setUsage(THREE.DynamicDrawUsage);
  mg.setAttribute('position', aPos); mg.setAttribute('aLocal', aLoc); mg.setAttribute('aTimes', aTimes); mg.setAttribute('aDice', aDice);
  const markMat = new THREE.ShaderMaterial({ vertexShader: MARK_VS, fragmentShader: MARK_FS, ...over({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 }),
    uniforms: { uTime: T, uWarn: { value: col(look.warn) }, uWarnHot: { value: col(look.warnHot) }, uRim: { value: col(look.rim) }, uRimGlow: { value: col(look.rimGlow) },
      uCrack: { value: col(look.crack) }, uCrackHot: { value: col(look.crackHot) }, uE0: { value: col(look.earth[0]) }, uE1: { value: col(look.earth[1]) },
      uE2: { value: col(look.earth[2]) }, uSeam: { value: col(look.seam) } } });
  const marks = new THREE.Mesh(mg, markMat);
  marks.frustumCulled = false; marks.renderOrder = 2;
  object.add(marks);
  let nextMark = 0;
  function mark(p) {
    const s = nextMark; nextMark = (nextMark + 1) % MARKS;
    const dice = rng();
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const u = (i / (G - 1) * 2 - 1) * EXT, v = (j / (G - 1) * 2 - 1) * EXT, k = s * PER + j * G + i, x = p.x + u * p.r, z = p.z + v * p.r;
      mPos.set([x, groundAt(x, z, p.y) + lift, z], k * 3); mLoc.set([u, v], k * 2); mDice[k] = dice;
    }
    p.mark = s; times(p);
    aPos.needsUpdate = aLoc.needsUpdate = aDice.needsUpdate = true;
  }
  function times(p) {
    for (let k = p.mark * PER; k < (p.mark + 1) * PER; k++) mTimes.set([p.warnAt, p.hitAt, p.goneAt], k * 3);
    aTimes.needsUpdate = true;
  }

  // ---- the vines: the thicket's, all patches' in one mesh (at the world's origin: their feet are world points)
  const V = makeVines(MAX_VINES, rng, look);
  const build = vineBuilder(V);
  V.line.uniforms.uWidth.value = 0.05 * PATCH.K;
  object.add(V.outline, V.mesh);
  const slots = new Array(MAX_VINES).fill(null);           // which vine each slot is drawing now (its spec), or null
  const freeSlot = () => { const i = slots.indexOf(null); return i; };
  const under = { foot: new THREE.Vector3(0, -50, 0) };
  for (let i = 0; i < MAX_VINES; i++) build(i, under, 0, 0, 0, 1);            // (all under the ground as they start)
  V.geometry.attributes.position.needsUpdate = true;

  // ---- stones, dust, sparks
  const ROCKS = 160;
  const rockGeo = new THREE.IcosahedronGeometry(1, 0); rockGeo.computeVertexNormals();
  const rockMat = new THREE.ShaderMaterial({ vertexShader: ROCK_VS, fragmentShader: ROCK_FS, uniforms: { uSun: { value: sun } } });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < ROCKS; i++) rockMesh.setColorAt(i, col(look.rock[i % look.rock.length]));
  rockMesh.count = 0; rockMesh.frustumCulled = false;
  const rocks = [];
  function stone(p, v, size, kind = 'fly', until = 0) {
    if (rocks.length >= ROCKS) rocks.shift();
    rocks.push({ p: p.clone(), v: v.clone(), size, kind, until, age: 0, life: kind === 'fly' ? 1.4 + Math.random() * 0.6 : 99, floor: groundAt(p.x, p.z, p.y),
      rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      squash: new THREE.Vector3(0.8 + Math.random() * 0.5, 0.6 + Math.random() * 0.4, 0.8 + Math.random() * 0.5), bounced: false, lying: false });
  }
  const dustMat = new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: PUFF_FS, uniforms: {
    uD0: { value: col(look.dust[0]) }, uD1: { value: col(look.dust[1]) }, uD2: { value: col(look.dust[2]) },
    uK0: { value: col(look.smoke[0]) }, uK1: { value: col(look.smoke[1]) }, uK2: { value: col(look.smoke[2]) },
    uF0: { value: col(look.flame[0]) }, uF1: { value: col(look.flame[1]) }, uF2: { value: col(look.flame[2]) }, uAlpha: { value: 1 } } });
  const dust = makePool(140, { aPos: 3, aSize: 2, aInfo: 4 }, dustMat);
  const sparks = makePool(400, { aPos: 3, aVel: 3, aInfo: 4 }, new THREE.ShaderMaterial({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, ...additive() }));
  sparks.mesh.renderOrder = 4;
  object.add(rockMesh, dust.mesh, sparks.mesh);
  const cEmber = col(look.ember), cSpark = col(look.spark);
  function puff(p, v, size, grow, life) {
    if (dust.list.length >= dust.max) dust.list.shift();
    dust.list.push({ p: p.clone(), v: v.clone(), size, grow, life, age: 0, dice: Math.random(), turn: (Math.random() - 0.5) * 1.2, spin: (Math.random() - 0.5) * 1.5 });
  }
  function spark(p, v, size, life, ember = false) {
    if (sparks.list.length >= sparks.max) sparks.list.shift();
    sparks.list.push({ p: p.clone(), v: v.clone(), size, life, age: 0, ember, ph: Math.random() * 6.28 });
  }

  // ---- the patches, as the moves tell them: { x, y, z, r, warnAt, hitAt, goneAt, vines: [specs], mark }
  const patches = new Map();
  const tmp = new THREE.Vector3(), at = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let jolt = 0;
  function lay(p) {
    // its vines: round its middle, out to most of its radius; hooking outward mostly, some inward, some sideways
    const K = PATCH.K, n = PATCH.vines, a0 = rng() * 6.28;
    p.vines = [];
    for (let i = 0; i < n; i++) {
      const slot = freeSlot();
      if (slot < 0) break;
      const az = a0 + (i + (rng() - 0.5) * 0.6) / n * Math.PI * 2, near = rng() < 0.4, rf = (near ? 0.15 + rng() * 0.25 : 0.4 + rng() * 0.4) * p.r;
      const out = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
      const inward = rng() < 0.3, twist = (rng() - 0.5) * 1.3;
      const plane = out.clone().multiplyScalar(inward ? -1 : 1).applyAxisAngle(UP, twist), side = new THREE.Vector3(plane.z, 0, -plane.x);
      const fx = p.x + Math.sin(az) * rf, fz = p.z + Math.cos(az) * rf;
      const s = {
        slot, spear: false, foot: new THREE.Vector3(fx, groundAt(fx, fz, p.y) - 0.3 * K, fz), plane, side,
        len: (near ? 5.6 + rng() * 2.2 : 4.2 + rng() * 2.0) * K, thick: (0.27 + rng() * 0.14) * K,
        lean: (inward ? 0.12 : 0.05) + rng() * 0.3, curl: 1.9 + rng() * 1.3, wig: (0.15 + rng() * 0.3) * K,
        sway: 0.18 + rng() * 0.16, swayW: 3.2 + rng() * 2.6, ph: rng() * 6.28,
        rise: 0.02 + rng() * 0.2, grow: 0.24 + rng() * 0.1, sinkAt: PATCH.stand + rng() * 0.15, burst: false,      // (seconds after the hit)
      };
      slots[slot] = s; p.vines.push(s);
    }
  }
  function event(e) {
    if (e.type === 'cancel') { for (const p of patches.values()) if (T.value < p.hitAt) { p.goneAt = T.value + 0.2; p.hitAt = 1e9; times(p); p.vines.forEach(s => { slots[s.slot] = null; }); p.vines = []; } return; }
    if (e.move !== 'ultimate' || e.patch === undefined || !e.shape) return;
    if (e.type === 'warn') {
      const s = e.shape, p = { x: s.x, y: s.y, z: s.z, r: s.radius, warnAt: T.value, hitAt: T.value + (e.lead || 1.2), goneAt: 0, vines: [], mark: -1 };
      p.goneAt = p.hitAt + PATCH.stand + 0.5 + PATCH.fade;
      patches.set(e.patch, p);
      lay(p); mark(p);
      object.visible = true;
    } else if (e.type === 'hit') {
      const p = patches.get(e.patch);
      if (!p) return;
      p.hitAt = T.value; p.goneAt = p.hitAt + PATCH.stand + 0.5 + PATCH.fade; times(p);
      jolt = Math.max(jolt, 0.35);
    }
  }

  // ---- the run of it
  const me = { object, shake: 0, busy: false, event, update, setSun, dispose };
  const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), eul = new THREE.Euler();
  function setSun(v) { sun.copy(v).normalize(); V.material.uniforms.uSun.value.copy(sun); }

  function update(dt, camera) {
    T.value += dt;
    const t = T.value, K = PATCH.K;
    let anyVine = false, heat = 0;
    for (const [key, p] of patches) {
      if (t > p.goneAt) { patches.delete(key); continue; }
      // while the warning fills: pebbles hopping, embers in the cracks
      if (t < p.hitAt) {
        const k = seg(t, p.warnAt, p.hitAt);
        if (Math.random() < dt * (4 + 14 * k)) { const a = Math.random() * 6.28, r = Math.random() * 0.8 * p.r * k, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r; stone(at.set(x, groundAt(x, z, p.y) + 0.05, z), tmp.set((Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 2 * k, (Math.random() - 0.5) * 0.6), (0.04 + Math.random() * 0.05) * K * 1.5); }
        if (Math.random() < dt * (6 + 20 * k)) { const a = Math.random() * 6.28, r = Math.random() * 0.8 * p.r * k, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r; spark(at.set(x, groundAt(x, z, p.y) + lift + 0.05, z), tmp.set((Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 2, (Math.random() - 0.5) * 0.8), 0.04 + Math.random() * 0.03, 0.5 + Math.random() * 0.4, true); }
      }
      // its vines: bursting up through the broken ground (dust, stones, sparks), writhing, sinking back
      const since = t - p.hitAt;
      for (const s of p.vines) {
        const rise = outBack(seg(since, s.rise, s.rise + s.grow)), sink = sstep(s.sinkAt, s.sinkAt + 0.3, since);
        const g = since < s.rise ? 0 : rise * (1 - sink * sink);
        const writhe = sstep(s.rise + s.grow, s.rise + s.grow + 0.4, since) * (1 - sink);
        if (g > 0.002) anyVine = true;
        build(s.slot, s, g, writhe, t, K);
        if (!s.burst && since >= s.rise) {
          s.burst = true;
          const gy = groundAt(s.foot.x, s.foot.z, p.y);
          for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28, sp = (1 + Math.random() * 2) * K; puff(at.set(s.foot.x + Math.sin(a) * 0.3, gy + 0.3, s.foot.z + Math.cos(a) * 0.3), tmp.set(Math.sin(a) * sp + s.plane.x, 1.2 + Math.random() * 2, Math.cos(a) * sp + s.plane.z), (0.45 + Math.random() * 0.4) * K, 1.9, 0.7 + Math.random() * 0.5); }
          for (let k = 0; k < 6; k++) { const a = Math.random() * 6.28, sp = (1 + Math.random() * 3.5) * K; stone(at.set(s.foot.x, gy + 0.2, s.foot.z), tmp.set(Math.sin(a) * sp, (4.5 + Math.random() * 5.5) * Math.sqrt(K), Math.cos(a) * sp), (0.07 + Math.random() * 0.14) * K); }
          for (let k = 0; k < 4; k++) { const a = (k / 4) * 6.28 + Math.random(), rr = s.thick * (1.6 + Math.random() * 1.4); stone(at.set(s.foot.x + Math.sin(a) * rr, gy, s.foot.z + Math.cos(a) * rr), tmp.set(Math.sin(a) * 0.6, 2 + Math.random() * 1.5, Math.cos(a) * 0.6), (0.14 + Math.random() * 0.2) * K, 'stay', p.hitAt + s.sinkAt + 0.25); }
          for (let k = 0; k < 8; k++) spark(at.set(s.foot.x, gy + 0.3, s.foot.z), tmp.set((Math.random() - 0.5) * 5, 3 + Math.random() * 6, (Math.random() - 0.5) * 5), 0.05 + Math.random() * 0.04, 0.5 + Math.random() * 0.5, Math.random() < 0.4);
        }
        heat = Math.max(heat, since >= 0 ? 1 - seg(since, s.rise, s.rise + 0.9) : 0);
        if (since > s.sinkAt + 0.35) { build(s.slot, s, 0, 0, t, K); slots[s.slot] = null; s.done = true; }
      }
      p.vines = p.vines.filter(s => !s.done);
    }
    V.material.uniforms.uHeat.value = heat;
    V.mesh.visible = V.outline.visible = anyVine;
    V.geometry.attributes.position.needsUpdate = true; V.geometry.attributes.normal.needsUpdate = true; V.geometry.attributes.aRad.needsUpdate = true;

    // stones: thrown, falling, bouncing once and lying; the rubble round a vine's foot lies till it sinks
    let ri = 0;
    for (let i = rocks.length - 1; i >= 0; i--) {
      const s = rocks[i];
      s.age += dt;
      const gy = groundAt(s.p.x, s.p.z, s.floor) + (s.kind === 'stay' ? 0.02 : 0);
      if (!s.lying) {
        s.v.y -= 22 * dt; s.p.addScaledVector(s.v, dt); s.rot.addScaledVector(s.spin, dt);
        if (s.p.y < gy + s.size * 0.4 && s.v.y < 0) {
          s.p.y = gy + s.size * 0.4;
          if (!s.bounced && s.kind === 'fly' && s.v.y < -2.5) { s.bounced = true; s.v.y *= -0.32; s.v.x *= 0.5; s.v.z *= 0.5; s.spin.multiplyScalar(0.5); }
          else { s.lying = true; s.v.set(0, 0, 0); }
        }
      }
      if (s.kind === 'stay' && t > s.until) s.p.y -= dt * 0.8;
      const k = s.kind === 'fly' ? 1 - seg(s.age, s.life - 0.35, s.life) : 1 - sstep(s.until, s.until + 0.35, t);
      if (k <= 0.001 || (s.kind === 'fly' && s.age > s.life)) rocks.splice(i, 1);
    }
    for (const s of rocks) {
      const k = (s.kind === 'fly' ? 1 - seg(s.age, s.life - 0.35, s.life) : 1 - sstep(s.until, s.until + 0.35, t)) * Math.min(1, s.age * 12);
      qt.setFromEuler(eul.set(s.rot.x, s.rot.y, s.rot.z)); sc.copy(s.squash).multiplyScalar(s.size * k);
      mtx.compose(s.p, qt, sc); rockMesh.setMatrixAt(ri++, mtx);
    }
    rockMesh.count = ri; rockMesh.instanceMatrix.needsUpdate = true;
    // dust
    {
      const A = dust.arrays;
      let n = 0;
      for (let i = dust.list.length - 1; i >= 0; i--) { const p = dust.list[i]; p.age += dt; if (p.age >= p.life) dust.list.splice(i, 1); }
      for (const p of dust.list) {
        const k = p.age / p.life;
        p.v.multiplyScalar(Math.exp(-2.6 * dt)); p.p.addScaledVector(p.v, dt);
        const s = p.size * (1 + (p.grow - 1) * (1 - Math.pow(1 - k, 2.2))) * Math.min(1, p.age * 9);
        A.aPos.set([p.p.x, p.p.y, p.p.z], n * 3); A.aSize.set([s, s * 0.92], n * 2); A.aInfo.set([0, p.dice, Math.min(0.999, k), p.turn + p.spin * p.age], n * 4);
        n++;
      }
      dust.g.instanceCount = n;
      for (const name in A) dust.g.attributes[name].needsUpdate = true;
    }
    // sparks
    {
      const A = sparks.arrays;
      let n = 0;
      for (let i = sparks.list.length - 1; i >= 0; i--) { const p = sparks.list[i]; p.age += dt; if (p.age >= p.life) sparks.list.splice(i, 1); }
      for (const p of sparks.list) {
        const k = p.age / p.life;
        p.v.multiplyScalar(Math.exp(-1.5 * dt)); p.v.y -= (p.ember ? 2 : 6) * dt;
        p.p.addScaledVector(p.v, dt);
        const tw = (0.7 + 0.3 * Math.sin(p.age * 34 + p.ph)) * (1 - k * k) * Math.min(1, p.age * 25), c = p.ember ? cEmber : cSpark;
        A.aPos.set([p.p.x, p.p.y, p.p.z], n * 3); A.aVel.set([p.v.x, p.v.y, p.v.z], n * 3); A.aInfo.set([c.r * tw, c.g * tw, c.b * tw, p.size], n * 4);
        n++;
      }
      sparks.g.instanceCount = n;
      for (const name in A) sparks.g.attributes[name].needsUpdate = true;
    }

    jolt = Math.max(0, jolt - dt * 2);
    me.shake = jolt;
    me.busy = patches.size > 0 || rocks.length > 0 || dust.list.length > 0 || sparks.list.length > 0;
    object.visible = me.busy;
  }
  function dispose() {
    mg.dispose(); markMat.dispose(); V.geometry.dispose(); V.material.dispose(); V.line.dispose();
    rockGeo.dispose(); rockMat.dispose(); dust.g.dispose(); dustMat.dispose(); sparks.g.dispose(); sparks.mesh.material.dispose();
  }
  return me;
}
