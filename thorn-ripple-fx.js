/* ==========================================================================
   thorn-ripple-fx.js  —  the ripples the plant boss's ultimate sends out of the thicket's ring as its vines burst up
   (plant-boss-moves.js: play('ultimate'), its ripples): a ridge of heaved earth racing out across the whole field, low
   enough to jump, the turf torn up on its outer face, raw clay on its inner, set along its crest with short thorns; it
   throws up dust and clods; behind it a furrow of broken earth that crumbles away. Warned first by a flare of embers round
   the ring's rim. One job: draw that. It decides nothing: the moves say when.

     const fx = createThornRippleFx({ heightAt, seed, lift })   heightAt(x, z): the ground's height (world); null: the
                                                                ripples' own height. lift: metres it stands over the ground
     scene.add(fx.object)
     moves.onEvent = e => fx.event(e)          the ultimate's ripples: 'warn' and 'hit' with a ripple (and its shape, kind
                                               'wave'); 'cancel' (they sink at once)
     every frame: fx.update(dt, camera)        (the same dt the moves get)
     fx.front(k)                               metres ripple k's crest has run out to now, or -1 (not running)
     fx.shake, fx.setSun(vec3), fx.busy, fx.dispose()

   How it is drawn, the kit's way, flat tones: every ripple's ridge, furrow and thorns in one mesh, laid on the ground by
   the processor every frame (one draw call); dust (one), clods (one), embers (one).
   ========================================================================== */
import * as THREE from 'three';
import { _fx, THICKET_LOOK } from './thicket-fx.js';
import { mulberry32, _internal as natureInternal } from './stylized-nature.js';

const { NOISE } = natureInternal;
const { SPARK_VS, SPARK_FS, PUFF_VS, PUFF_FS, ROCK_VS, ROCK_FS, makePool, col } = _fx;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sstep = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };

const SLOTS = 3;                  // ripples drawn at once
const AROUND = 200;               // points round a ripple
const ACROSS = [-2.6, -1.7, -0.9, -0.3, 0, 0.18, 0.34, 0.5, 0.66, 0.82, 1];      // across it, in its widths: behind (the furrow) .. 0 .. 1 (its outer foot)
const THORNS = 96;                // thorns along a ripple's crest

// the look (the thicket's clay and bone)
export const RIPPLE_LOOK = {
  clay: ['#7e4630', '#c46f48', '#de8d60', '#f2ab80'], turf: ['#5f7a2c', '#8a9e3e', '#a7b84c'], furrow: ['#4a3a2c', '#6a5440'],
  hot: '#ff6a2e', thorn: THICKET_LOOK.thorn, wood: THICKET_LOOK.wood,
};

const RIDGE_VS = /* glsl */`
attribute vec3 aInfo;            // x: what (0 ridge, 1 thorn), y: across (in widths) or along a thorn 0..1, z: dice
varying vec3 vInfo;
varying vec3 vN;
varying vec2 vW;
void main() {
  vInfo = aInfo; vN = normal; vW = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RIDGE_FS = /* glsl */`
${NOISE}
uniform vec3 uSun, uC0, uC1, uC2, uC3, uG0, uG1, uG2, uF0, uF1, uHot, uT0, uT1, uT2, uW0, uW1;
uniform float uHeat;
varying vec3 vInfo;
varying vec3 vN;
varying vec2 vW;
void main() {
  vec3 n = normalize(vN);
  float l = dot(n, uSun);
  float s = vInfo.y, nz = noise2(vW * 1.7 + vInfo.z * 13.0);
  vec3 c;
  if (vInfo.x > 0.5) {                                           // a thorn: bark at its foot, bone toward its point
    c = s > 0.45 ? (l > 0.3 ? uT2 : (l > -0.1 ? uT1 : uT0)) : (l > 0.3 ? uW1 : uW0);
  } else if (s < 0.0) {                                          // the furrow behind it: broken earth crumbling away
    if (nz < (1.0 - smoothstep(-2.6, -0.2, s)) * 1.1 - 0.05) discard;
    c = nz > 0.55 ? uF1 : uF0;
  } else {
    float lt = l + (nz - 0.5) * 0.35;
    if (s > 0.56) c = lt > 0.45 ? uG2 : (lt > 0.05 ? uG1 : uG0);                                // the turf torn up on its outer face
    else c = lt > 0.55 ? uC3 : (lt > 0.2 ? uC2 : (lt > -0.15 ? uC1 : uC0));                    // raw clay on its inner
    c = mix(c, uHot, uHeat * (1.0 - smoothstep(0.0, 0.09, abs(s - 0.5))) * step(0.42, nz + 0.2));      // its crest cracked, glowing
  }
  gl_FragColor = vec4(c, 1.0);
}`;
const additive = extra => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, ...extra });

export function createThornRippleFx({ heightAt = null, seed = 1, lift = 0.04, look = RIPPLE_LOOK } = {}) {
  const rng = mulberry32(seed * 271 + 23);
  const object = new THREE.Group();
  object.name = 'thorn_ripple_fx';
  object.visible = false;
  const sun = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  let T = 0;
  const groundAt = (x, z, y) => (heightAt ? heightAt(x, z) : y);

  // ---- every ripple's ridge, furrow and thorns: one mesh
  const RV = AROUND * ACROSS.length, TV = THORNS * 5, PER = RV + TV;
  const pos = new Float32Array(SLOTS * PER * 3), nor = new Float32Array(SLOTS * PER * 3), info = new Float32Array(SLOTS * PER * 3);
  const idx = [];
  const thornAt = [];                                             // each slot's thorns: where round, how tall, how they lean
  for (let k = 0; k < SLOTS; k++) {
    const base = k * PER, A = ACROSS.length;
    for (let i = 0; i < AROUND; i++) for (let j = 0; j < A; j++) {
      const v = base + i * A + j;
      info[v * 3] = 0; info[v * 3 + 1] = ACROSS[j]; info[v * 3 + 2] = rng();
      if (j < A - 1) { const a = v, b = base + ((i + 1) % AROUND) * A + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    const list = [];
    for (let q = 0; q < THORNS; q++) {
      const t0 = base + RV + q * 5;
      for (let m = 0; m < 5; m++) { info[(t0 + m) * 3] = 1; info[(t0 + m) * 3 + 1] = m === 4 ? 1 : 0; info[(t0 + m) * 3 + 2] = rng(); }
      idx.push(t0, t0 + 1, t0 + 4, t0 + 1, t0 + 2, t0 + 4, t0 + 2, t0 + 3, t0 + 4, t0 + 3, t0, t0 + 4);
      list.push({ a: (q + (rng() - 0.5) * 0.7) / THORNS * Math.PI * 2, tall: 0.55 + rng() * 0.6, lean: 0.25 + rng() * 0.5, side: (rng() - 0.5) * 0.6, off: (rng() - 0.5) * 0.25 });
    }
    thornAt.push(list);
  }
  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), aNor = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos); g.setAttribute('normal', aNor); g.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
  g.setIndex(idx);
  const U = { uSun: { value: sun }, uHeat: { value: 0 },
    uC0: { value: col(look.clay[0]) }, uC1: { value: col(look.clay[1]) }, uC2: { value: col(look.clay[2]) }, uC3: { value: col(look.clay[3]) },
    uG0: { value: col(look.turf[0]) }, uG1: { value: col(look.turf[1]) }, uG2: { value: col(look.turf[2]) },
    uF0: { value: col(look.furrow[0]) }, uF1: { value: col(look.furrow[1]) }, uHot: { value: col(look.hot) },
    uT0: { value: col(look.thorn[0]) }, uT1: { value: col(look.thorn[1]) }, uT2: { value: col(look.thorn[2]) }, uW0: { value: col(look.wood[0]) }, uW1: { value: col(look.wood[1]) } };
  const mat = new THREE.ShaderMaterial({ vertexShader: RIDGE_VS, fragmentShader: RIDGE_FS, uniforms: U, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  object.add(mesh);
  function hide(k) { const b = k * PER; for (let v = b; v < b + PER; v++) { pos[v * 3] = 0; pos[v * 3 + 1] = -100; pos[v * 3 + 2] = 0; } }
  for (let k = 0; k < SLOTS; k++) hide(k);

  // ---- dust, clods, embers
  const dustMat = new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: PUFF_FS, uniforms: {
    uD0: { value: col(THICKET_LOOK.dust[0]) }, uD1: { value: col(THICKET_LOOK.dust[1]) }, uD2: { value: col(THICKET_LOOK.dust[2]) },
    uK0: { value: col(THICKET_LOOK.smoke[0]) }, uK1: { value: col(THICKET_LOOK.smoke[1]) }, uK2: { value: col(THICKET_LOOK.smoke[2]) },
    uF0: { value: col(THICKET_LOOK.flame[0]) }, uF1: { value: col(THICKET_LOOK.flame[1]) }, uF2: { value: col(THICKET_LOOK.flame[2]) }, uAlpha: { value: 1 } } });
  const dust = makePool(220, { aPos: 3, aSize: 2, aInfo: 4 }, dustMat);
  const CLODS = 140;
  const clodGeo = new THREE.IcosahedronGeometry(1, 0); clodGeo.computeVertexNormals();
  const clodMat = new THREE.ShaderMaterial({ vertexShader: ROCK_VS, fragmentShader: ROCK_FS, uniforms: { uSun: { value: sun } } });
  const clodMesh = new THREE.InstancedMesh(clodGeo, clodMat, CLODS);
  clodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < CLODS; i++) clodMesh.setColorAt(i, col(i % 3 ? look.clay[1 + (i % 2)] : look.turf[1]));
  clodMesh.count = 0; clodMesh.frustumCulled = false;
  const embers = makePool(500, { aPos: 3, aVel: 3, aInfo: 4 }, new THREE.ShaderMaterial({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, ...additive() }));
  embers.mesh.renderOrder = 4;
  object.add(dust.mesh, clodMesh, embers.mesh);
  const cEmber = col(THICKET_LOOK.ember);
  const clods = [];
  function puff(p, v, size, life) { if (dust.list.length >= dust.max) dust.list.shift(); dust.list.push({ p: p.clone(), v: v.clone(), size, life, age: 0, dice: Math.random(), turn: (Math.random() - 0.5) * 1.2, spin: (Math.random() - 0.5) * 1.5 }); }
  function clod(p, v, size) { if (clods.length >= CLODS) clods.shift(); clods.push({ p: p.clone(), v: v.clone(), size, age: 0, life: 0.9 + Math.random() * 0.5, rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), spin: (Math.random() - 0.5) * 12 }); }
  function ember(p, v, size, life) { if (embers.list.length >= embers.max) embers.list.shift(); embers.list.push({ p: p.clone(), v: v.clone(), size, life, age: 0, ph: Math.random() * 6.28 }); }

  // ---- the ripples, as the moves tell them: { shape, warnAt, goAt, slot, done }
  const ripples = [];
  let jolt = 0;
  const at = new THREE.Vector3(), tmp = new THREE.Vector3();
  function event(e) {
    if (e.type === 'cancel') { for (const r of ripples) if (r) { r.done = true; hide(r.slot); } aPos.needsUpdate = true; return; }
    if (e.move !== 'ultimate' || e.ripple === undefined || !e.shape) return;
    const k = e.ripple;
    if (e.type === 'warn') ripples[k] = { shape: e.shape, warnAt: T, goAt: T + (e.lead || 0.6), slot: k % SLOTS, done: false };
    else if (e.type === 'hit') { const r = ripples[k] || (ripples[k] = { shape: e.shape, warnAt: T, slot: k % SLOTS, done: false }); r.goAt = T; r.shape = e.shape; jolt = Math.max(jolt, 0.45); }
    object.visible = true;
  }
  const front = k => { const r = ripples[k]; if (!r || r.done || T < r.goAt) return -1; return r.shape.from + r.shape.speed * (T - r.goAt); };

  // ---- lay a ripple's ridge, furrow and thorns where its crest is now
  const hs = new Float32Array(ACROSS.length), rs = new Float32Array(ACROSS.length);
  function lay(r, f) {
    const s = r.shape, b = r.slot * PER, A = ACROSS.length;
    const grow = sstep(0, 0.15, T - r.goAt), sinkK = 1 - sstep(s.to - 3, s.to, f), H = s.height * grow * sinkK, W = s.width;
    for (let j = 0; j < A; j++) {
      const u = ACROSS[j];
      rs[j] = Math.max(s.from - 0.3, f + (u - 0.5) * W);
      hs[j] = u <= 0 || u >= 1 ? 0 : H * Math.pow(Math.sin(Math.PI * u), 0.85);
    }
    for (let i = 0; i < AROUND; i++) {
      const a = i / AROUND * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const rag = 1 + 0.18 * Math.sin(a * 7 + r.slot * 2) + 0.12 * Math.sin(a * 17 + T * 0.5);           // (its top not ruler-even)
      for (let j = 0; j < A; j++) {
        const v = b + i * A + j, x = s.x + ca * rs[j], z = s.z + sa * rs[j], h = hs[j] * rag;
        pos[v * 3] = x; pos[v * 3 + 1] = groundAt(x, z, s.y) + lift + h; pos[v * 3 + 2] = z;
        // its slope: up its inner face, down its outer
        const jm = Math.max(0, j - 1), jp = Math.min(A - 1, j + 1), dr = rs[jp] - rs[jm] || 1, slope = (hs[jp] - hs[jm]) * rag / dr;
        tmp.set(-ca * slope, 1, -sa * slope).normalize();
        nor[v * 3] = tmp.x; nor[v * 3 + 1] = tmp.y; nor[v * 3 + 2] = tmp.z;
      }
    }
    // its thorns, along its crest, leaning out the way it runs
    const tb = b + RV;
    thornAt[r.slot].forEach((q, n) => {
      const ca = Math.cos(q.a), sa = Math.sin(q.a), rr = f + q.off * W, x = s.x + ca * rr, z = s.z + sa * rr;
      const rag = 1 + 0.18 * Math.sin(q.a * 7 + r.slot * 2) + 0.12 * Math.sin(q.a * 17 + T * 0.5);
      const y = groundAt(x, z, s.y) + lift + H * rag * 0.92, tall = q.tall * (H / Math.max(s.height, 0.01)), wide = 0.09 + 0.05 * q.tall;
      const out = tmp.set(ca, 0, sa), side = at.set(-sa, 0, ca);
      const corners = [[out, 1], [side, 1], [out, -1], [side, -1]];
      corners.forEach(([e, sg], m) => {
        const v = tb + n * 5 + m;
        pos[v * 3] = x + e.x * wide * sg; pos[v * 3 + 1] = y - 0.05; pos[v * 3 + 2] = z + e.z * wide * sg;
        nor[v * 3] = e.x * sg * 0.6 + ca * 0.3; nor[v * 3 + 1] = 0.3; nor[v * 3 + 2] = e.z * sg * 0.6 + sa * 0.3;
      });
      const v = tb + n * 5 + 4, lx = ca * Math.sin(q.lean) + (-sa) * q.side * 0.4, lz = sa * Math.sin(q.lean) + ca * q.side * 0.4;
      pos[v * 3] = x + lx * tall; pos[v * 3 + 1] = y + Math.cos(q.lean) * tall; pos[v * 3 + 2] = z + lz * tall;
      nor[v * 3] = ca * 0.5; nor[v * 3 + 1] = 0.85; nor[v * 3 + 2] = sa * 0.5;
    });
  }

  // ---- the run of it
  const me = { object, shake: 0, busy: false, event, update, front, setSun, dispose };
  const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3();
  function setSun(v) { sun.copy(v).normalize(); }

  function update(dt, camera) {
    T += dt;
    let running = 0, heat = 0;
    ripples.forEach((r, k) => {
      if (!r || r.done) return;
      const s = r.shape;
      // warned: embers flaring up round the ring's rim
      if (T < r.goAt) {
        const n = Math.floor(dt * 60 + Math.random());
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, x = s.x + Math.cos(a) * s.from, z = s.z + Math.sin(a) * s.from; ember(at.set(x, groundAt(x, z, s.y) + 0.2, z), tmp.set(Math.cos(a) * 1.5, 2 + Math.random() * 3, Math.sin(a) * 1.5), 0.06 + Math.random() * 0.05, 0.4 + Math.random() * 0.3); }
        return;
      }
      const f = front(k);
      if (f > s.to + 0.5) { r.done = true; hide(r.slot); return; }
      running++;
      heat = Math.max(heat, 0.55 + 0.45 * (1 - seg(T - r.goAt, 0, 1.4)));      // (its crest glows all the way: the line to jump)
      lay(r, f);
      // dust and clods thrown up along its crest
      const along = Math.PI * 2 * f, nd = Math.floor(dt * along * 0.22 + Math.random()), nc = Math.floor(dt * along * 0.12 + Math.random());
      for (let i = 0; i < nd; i++) { const a = Math.random() * 6.28, x = s.x + Math.cos(a) * f, z = s.z + Math.sin(a) * f; puff(at.set(x, groundAt(x, z, s.y) + 0.35, z), tmp.set(Math.cos(a) * 1.8, 0.8 + Math.random(), Math.sin(a) * 1.8), 0.45 + Math.random() * 0.4, 0.6 + Math.random() * 0.4); }
      for (let i = 0; i < nc; i++) { const a = Math.random() * 6.28, x = s.x + Math.cos(a) * f, z = s.z + Math.sin(a) * f; clod(at.set(x, groundAt(x, z, s.y) + 0.4, z), tmp.set(Math.cos(a) * (2 + Math.random() * 3), 3 + Math.random() * 3, Math.sin(a) * (2 + Math.random() * 3)), 0.07 + Math.random() * 0.08); }
    });
    U.uHeat.value = heat;
    aPos.needsUpdate = aNor.needsUpdate = true;
    mesh.visible = running > 0;

    // clods
    let ci = 0;
    for (let i = clods.length - 1; i >= 0; i--) { const c = clods[i]; c.age += dt; if (c.age > c.life) clods.splice(i, 1); }
    for (const c of clods) {
      c.v.y -= 20 * dt; c.p.addScaledVector(c.v, dt); c.rot.x += c.spin * dt; c.rot.y += c.spin * 0.7 * dt;
      const floor = groundAt(c.p.x, c.p.z, c.p.y) + c.size * 0.4;
      if (c.p.y < floor) { c.p.y = floor; c.v.set(0, 0, 0); }
      const k = 1 - seg(c.age, c.life - 0.3, c.life);
      qt.setFromEuler(c.rot); sc.setScalar(c.size * k);
      mtx.compose(c.p, qt, sc); clodMesh.setMatrixAt(ci++, mtx);
    }
    clodMesh.count = ci; clodMesh.instanceMatrix.needsUpdate = true;
    // dust
    {
      const A = dust.arrays;
      let n = 0;
      for (let i = dust.list.length - 1; i >= 0; i--) { const p = dust.list[i]; p.age += dt; if (p.age >= p.life) dust.list.splice(i, 1); }
      for (const p of dust.list) {
        const k = p.age / p.life;
        p.v.multiplyScalar(Math.exp(-2.6 * dt)); p.p.addScaledVector(p.v, dt);
        const s = p.size * (1 + 0.9 * (1 - Math.pow(1 - k, 2.2))) * Math.min(1, p.age * 9);
        A.aPos.set([p.p.x, p.p.y, p.p.z], n * 3); A.aSize.set([s, s * 0.92], n * 2); A.aInfo.set([0, p.dice, Math.min(0.999, k), p.turn + p.spin * p.age], n * 4);
        n++;
      }
      dust.g.instanceCount = n;
      for (const name in A) dust.g.attributes[name].needsUpdate = true;
    }
    // embers
    {
      const A = embers.arrays;
      let n = 0;
      for (let i = embers.list.length - 1; i >= 0; i--) { const p = embers.list[i]; p.age += dt; if (p.age >= p.life) embers.list.splice(i, 1); }
      for (const p of embers.list) {
        const k = p.age / p.life;
        p.v.multiplyScalar(Math.exp(-1.5 * dt)); p.v.y -= 3 * dt; p.p.addScaledVector(p.v, dt);
        const tw = (0.7 + 0.3 * Math.sin(p.age * 34 + p.ph)) * (1 - k * k) * Math.min(1, p.age * 25);
        A.aPos.set([p.p.x, p.p.y, p.p.z], n * 3); A.aVel.set([p.v.x, p.v.y, p.v.z], n * 3); A.aInfo.set([cEmber.r * tw, cEmber.g * tw, cEmber.b * tw, p.size], n * 4);
        n++;
      }
      embers.g.instanceCount = n;
      for (const name in A) embers.g.attributes[name].needsUpdate = true;
    }

    jolt = Math.max(0, jolt - dt * 2);
    me.shake = Math.max(jolt, 0.18 * Math.min(1, running));
    me.busy = ripples.some(r => r && !r.done) || clods.length > 0 || dust.list.length > 0 || embers.list.length > 0;
    object.visible = me.busy;
  }
  function dispose() { g.dispose(); mat.dispose(); dust.g.dispose(); dustMat.dispose(); clodGeo.dispose(); clodMat.dispose(); embers.g.dispose(); embers.mesh.material.dispose(); }
  return me;
}
