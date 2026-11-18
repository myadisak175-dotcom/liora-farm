/* ==========================================================================
   shockwave-fx.js  —  the shockwaves the plant boss's ultimate sends out of the thicket's ring as its vines burst up
   (plant-boss-moves.js: play('ultimate'), its ripples), drawn as in the user's clip: a flash at the thicket's middle as
   one is warned; a wide band of red light breaking out of it across the ground, a white-hot line at its front, white
   lightning crackling inside it, a fainter second white line and a red haze behind; a low wall of red light standing on
   its front (the line to jump); and sparks flung up off it in long pink streaks. It runs out through the thicket's ring
   while warned and crosses its rim as the move says it sets off, then on across the field. One job: draw that. It
   decides nothing: the moves say when, and whoever plays them says whether it struck.

     const fx = createShockwaveFx({ heightAt, lift })         heightAt(x, z): the ground's height (world); null: the
                                                              shockwaves' own height. lift: metres its light lies over
                                                              the ground (over the grass's tips)
     scene.add(fx.object)
     moves.onEvent = e => fx.event(e)          the ultimate's ripples: 'warn' and 'hit' with a ripple (and its shape, kind
                                               'wave'); 'cancel' (they go at once)
     every frame: fx.update(dt, camera)        (the same dt the moves get)
     fx.front(k)                               metres shockwave k's front has run out to now, as the moves have it (from
                                               the ring's rim, once it has set off), or -1 (not running): where it strikes
     fx.shake, fx.setSun(vec3), fx.busy, fx.dispose()

   Where it is drawn and where it strikes are one line: from 'hit' on its front is at shape.from + shape.speed * the time
   since, as the moves (and the page) count it. Before that, while it is warned, it is drawn running out from the middle
   to the rim, at the pace that brings it there on the beat.

   How it is drawn: light, laid over the ground, in two layers worked out in their shaders (what is red is laid over the
   ground, what glows is added onto it, so the red stays red on bright grass): the ring on the ground for every
   shockwave (one draw call), the wall on their fronts (one), the sparks (one, thicket-fx.js's), the flash (one).
   ========================================================================== */
import * as THREE from 'three';
import { _fx } from './thicket-fx.js';
import { _internal as natureInternal } from './stylized-nature.js';

const { NOISE } = natureInternal;
const { SPARK_VS, SPARK_FS, makePool, col } = _fx;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sstep = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };

const SLOTS = 3;                  // shockwaves drawn at once
const AROUND = 160;               // points round one
// across the ring on the ground, metres from its front: behind it (the haze, the red body, its second line) .. ahead (its glow)
const ACROSS = [-3.4, -2.5, -1.85, -1.6, -1.4, -1.1, -0.65, -0.32, -0.12, -0.03, 0.04, 0.16, 0.42, 0.85];

// the look: the clip's red
export const SHOCK_LOOK = {
  red: '#ff2b3a', deep: '#b8102a', glow: '#ff5468', hot: '#fff1ec',            // the ring: its body, behind it, the light round it, its white-hot line
  wall: '#ff3346', wallHot: '#ffd6cf',                                          // the wall on its front
  spark: '#ff6d8e', flash: '#ffd7cf',
};

// ---- the ring on the ground
const RING_VS = /* glsl */`
attribute vec4 aRing;        // x: metres from its front (+ ahead), y: how far round (radians), z: how strongly it shows, w: its front (metres out)
varying vec4 vR;
void main() {
  vR = aRing;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RING_FS = /* glsl */`
${NOISE}
uniform float uTime;
uniform vec3 uRed, uDeep, uGlow, uHot;
varying vec4 vR;
vec4 acc;
void over(vec3 c, float a) { a = clamp(a, 0.0, 1.0); acc = vec4(c * a, a) + acc * (1.0 - a); }
void glow(vec3 c, float a) { acc.rgb += c * clamp(a, 0.0, 1.0); }
// a crack of white lightning along it, at about 'mid' metres behind its front: jagged, in long pieces that jump about
void bolt(vec2 p, float d, float A, float fk, float mid) {
  float flick = floor(uTime * 12.0);
  float at = mid + (noise2(p * (1.6 + fk * 0.7) + vec2(flick * 0.37, fk * 5.0)) - 0.5) * 0.9
                 + (noise2(p * 7.0 + vec2(fk * 3.1, flick * 0.21)) - 0.5) * 0.16;
  float on = smoothstep(0.42, 0.5, noise2(p * 0.42 + vec2(uTime * 2.0 + fk * 3.0, flick * 0.11)));
  float e = abs(d - at);
  over(uHot, (1.0 - smoothstep(0.02, 0.055, e)) * on * 0.95 * A);
  glow(uGlow, exp(-e / 0.11) * on * 0.5 * A);
}
void main() {
  float o = vR.x, A = vR.z, t = uTime;
  if (A < 0.003) discard;
  // a point round the ring as it lies on the ground (so nothing about it has a seam, and it keeps its marks as it grows)
  vec2 p = vec2(cos(vR.y), sin(vR.y)) * max(vR.w, 0.5);
  float d = o - (noise2(p * 0.9 + vec2(t * 1.3, 0.0)) - 0.5) * 0.14;      // (its front wavers a little)
  acc = vec4(0.0);
  // the haze it leaves
  glow(uGlow, smoothstep(-3.4, -2.4, d) * (1.0 - smoothstep(-2.2, -1.2, d)) * 0.25 * A);
  // its body: a wide band of red light, deep and thin at its back, full and bright to its front
  float body = smoothstep(-2.9, -1.6, d) * (1.0 - smoothstep(-0.01, 0.05, d));
  float rise = smoothstep(-2.4, -0.2, d);
  float mott = noise2(p * 1.8 + vec2(t * 0.8, -t * 1.1));                  // (it stirs as it goes)
  over(mix(uDeep, uRed, rise), body * (0.4 + 0.42 * rise) * (0.85 + 0.3 * mott) * A);
  glow(uGlow, body * (0.12 + 0.3 * rise) * A);
  // a second, fainter white line inside it
  float d2 = d + 1.25 + (noise2(p * 1.3 - vec2(0.0, t)) - 0.5) * 0.3;
  over(uHot, (1.0 - smoothstep(0.015, 0.05, abs(d2))) * 0.55 * A);
  glow(uGlow, exp(-abs(d2) / 0.14) * 0.4 * A);
  // the light round it: ahead of its front, soft, and the white-hot line itself
  glow(uGlow, exp(-max(d, 0.0) / 0.3) * step(0.0, d) * 0.8 * A);
  float line = 1.0 - smoothstep(0.035, 0.09, abs(d + 0.04));
  over(uHot, line * A);
  glow(uHot, exp(-abs(d + 0.04) / 0.08) * 0.55 * A);
  // white lightning crackling inside it: jagged lines along it that jump from place to place
  bolt(p, d, A, 0.0, -0.55); bolt(p, d, A, 1.0, -0.95); bolt(p, d, A, 2.0, -1.7);
  if (acc.a < 0.003 && max(acc.r, max(acc.g, acc.b)) < 0.003) discard;
  gl_FragColor = acc;
}`;

// ---- the wall of light on its front
const WALL_VS = /* glsl */`
attribute vec4 aWall;        // x: how far round (radians), y: up it 0..1, z: how strongly it shows, w: its front (metres out)
varying vec4 vW;
varying float vFace;
void main() {
  vW = aWall;
  vec3 out3 = vec3(cos(aWall.x), 0.0, sin(aWall.x));
  vec4 w = modelMatrix * vec4(position, 1.0);
  vFace = dot(out3, normalize(cameraPosition - w.xyz));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WALL_FS = /* glsl */`
${NOISE}
uniform float uTime;
uniform vec3 uC, uHot;
varying vec4 vW;
varying float vFace;
vec4 acc;
void main() {
  float v = vW.y, A = vW.z, t = uTime;
  vec2 p = vec2(cos(vW.x), sin(vW.x)) * max(vW.w, 0.5);
  // tongues of light licking up off it, flickering
  float n = noise2(p * 2.6 + vec2(0.0, -t * 3.0)) * 0.65 + noise2(p * 6.5 + vec2(t * 2.0, -t * 5.0)) * 0.35;
  float top = 0.45 + 0.55 * n;
  float s = (1.0 - smoothstep(top * 0.6, top, v)) * (1.0 - v * 0.55);
  float foot = 1.0 - smoothstep(0.0, 0.18, v);
  // seen through on the near side (what is behind it is still seen), fuller seen edge-on and on the far side
  s = max(s * 0.6, foot * 0.9) * A * mix(1.0, 0.45, smoothstep(0.1, 0.7, vFace));
  if (s < 0.004) discard;
  vec3 c = mix(uC, uHot, foot * 0.75 + (1.0 - v) * 0.2);
  gl_FragColor = vec4(c * s, s * 0.75);
}`;

// ---- the flash at the middle as it is warned
const FLASH_VS = /* glsl */`
uniform vec3 uAt;
uniform float uSize;
varying vec2 vP;
void main() {
  vP = position.xy;
  vec4 mv = viewMatrix * vec4(uAt, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}`;
const FLASH_FS = /* glsl */`
uniform vec3 uC, uHot;
uniform float uA;
varying vec2 vP;
void main() {
  float d = length(vP);
  float star = (1.0 - smoothstep(0.0, 0.07, abs(vP.x) * abs(vP.y) * 4.0)) * (1.0 - smoothstep(0.2, 1.0, d));
  float s = (exp(-d * d * 7.0) + star * 0.7) * uA;
  if (s < 0.004) discard;
  gl_FragColor = vec4(mix(uC, uHot, clamp(exp(-d * d * 22.0) + star * 0.5, 0.0, 1.0)) * s, 0.0);
}`;

const overBlend = extra => ({ transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, ...extra });

export function createShockwaveFx({ heightAt = null, lift = 0.04, look = SHOCK_LOOK } = {}) {
  const object = new THREE.Group();
  object.name = 'shockwave_fx';
  object.visible = false;
  let T = 0;
  const time = { value: 0 };
  const groundAt = (x, z, y) => (heightAt ? heightAt(x, z) : y);

  // ---- the ring on the ground, every shockwave's in one mesh
  const A = ACROSS.length, RP = AROUND * A;
  const rPos = new Float32Array(SLOTS * RP * 3), rInfo = new Float32Array(SLOTS * RP * 4), rIdx = [];
  for (let k = 0; k < SLOTS; k++) for (let i = 0; i < AROUND; i++) for (let j = 0; j < A - 1; j++) {
    const a = k * RP + i * A + j, b = k * RP + ((i + 1) % AROUND) * A + j;
    rIdx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const rg = new THREE.BufferGeometry();
  const aRPos = new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage), aRInfo = new THREE.BufferAttribute(rInfo, 4).setUsage(THREE.DynamicDrawUsage);
  rg.setAttribute('position', aRPos); rg.setAttribute('aRing', aRInfo); rg.setIndex(rIdx);
  const ringMat = new THREE.ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, ...overBlend({ polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -5 }),
    uniforms: { uTime: time, uRed: { value: col(look.red) }, uDeep: { value: col(look.deep) }, uGlow: { value: col(look.glow) }, uHot: { value: col(look.hot) } } });
  const ring = new THREE.Mesh(rg, ringMat);
  ring.frustumCulled = false; ring.renderOrder = 3;

  // ---- the wall on their fronts
  const WP = (AROUND + 1) * 2;
  const wPos = new Float32Array(SLOTS * WP * 3), wInfo = new Float32Array(SLOTS * WP * 4), wIdx = [];
  for (let k = 0; k < SLOTS; k++) for (let i = 0; i < AROUND; i++) { const b = k * WP + i * 2; wIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  const wg = new THREE.BufferGeometry();
  const aWPos = new THREE.BufferAttribute(wPos, 3).setUsage(THREE.DynamicDrawUsage), aWInfo = new THREE.BufferAttribute(wInfo, 4).setUsage(THREE.DynamicDrawUsage);
  wg.setAttribute('position', aWPos); wg.setAttribute('aWall', aWInfo); wg.setIndex(wIdx);
  const wallMat = new THREE.ShaderMaterial({ vertexShader: WALL_VS, fragmentShader: WALL_FS, ...overBlend({ side: THREE.DoubleSide }),
    uniforms: { uTime: time, uC: { value: col(look.wall) }, uHot: { value: col(look.wallHot) } } });
  const wall = new THREE.Mesh(wg, wallMat);
  wall.frustumCulled = false; wall.renderOrder = 5;

  // ---- the flash, and the sparks
  const flashMat = new THREE.ShaderMaterial({ vertexShader: FLASH_VS, fragmentShader: FLASH_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
    uniforms: { uAt: { value: new THREE.Vector3() }, uSize: { value: 1 }, uA: { value: 0 }, uC: { value: col(look.glow) }, uHot: { value: col(look.flash) } } });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flashMat);
  flash.frustumCulled = false; flash.renderOrder = 7; flash.visible = false;
  const sparks = makePool(420, { aPos: 3, aVel: 3, aInfo: 4 }, new THREE.ShaderMaterial({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true }));
  sparks.mesh.renderOrder = 6;
  object.add(ring, wall, flash, sparks.mesh);
  const cSpark = col(look.spark), cHot = col(look.hot);
  function spark(x, y, z, vx, vy, vz, size, life, hot) {
    if (sparks.list.length >= sparks.max) sparks.list.shift();
    sparks.list.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), size, life, age: 0, hot, ph: Math.random() * 6.28 });
  }

  function hide(k) {
    for (let v = k * RP; v < (k + 1) * RP; v++) { rPos[v * 3 + 1] = -100; rInfo[v * 4 + 2] = 0; }
    for (let v = k * WP; v < (k + 1) * WP; v++) { wPos[v * 3 + 1] = -100; wInfo[v * 4 + 2] = 0; }
  }
  for (let k = 0; k < SLOTS; k++) hide(k);

  // ---- the shockwaves, as the moves tell them: { shape, warnAt, goAt, slot, done }
  const waves = [];
  let jolt = 0;
  function event(e) {
    if (e.type === 'cancel') { for (const w of waves) if (w) { w.done = true; hide(w.slot); } aRPos.needsUpdate = aRInfo.needsUpdate = aWPos.needsUpdate = aWInfo.needsUpdate = true; return; }
    if (e.move !== 'ultimate' || e.ripple === undefined || !e.shape) return;
    const k = e.ripple;
    if (e.type === 'warn') {
      waves[k] = { shape: e.shape, warnAt: T, goAt: T + (e.lead || 0.6), slot: k % SLOTS, done: false };
      jolt = Math.max(jolt, 0.25);
      // the flash at the middle, and a burst of sparks up out of it
      const s = e.shape, y = groundAt(s.x, s.z, s.y) + lift;
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, sp = 1 + Math.random() * 3; spark(s.x + Math.cos(a) * 0.3, y + 0.3, s.z + Math.sin(a) * 0.3, Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp, 0.07 + Math.random() * 0.06, 0.5 + Math.random() * 0.5, Math.random() < 0.35); }
    } else if (e.type === 'hit') {
      const w = waves[k] || (waves[k] = { shape: e.shape, warnAt: T, slot: k % SLOTS, done: false });
      w.goAt = T; w.shape = e.shape; jolt = Math.max(jolt, 0.45);
    }
    object.visible = true;
  }
  // where it strikes: as the moves count it, from 'hit' on
  const front = k => { const w = waves[k]; if (!w || w.done || T < w.goAt) return -1; return w.shape.from + w.shape.speed * (T - w.goAt); };
  // where it is drawn: out from the middle while warned (to the rim on the beat), then the same line
  const drawnAt = w => (T < w.goAt ? w.shape.from * seg(T, w.warnAt, w.goAt) : w.shape.from + w.shape.speed * (T - w.goAt));

  // ---- lay a shockwave's ring and wall where its front is now
  function lay(w, f, show) {
    const s = w.shape, rb = w.slot * RP, wb = w.slot * WP, H = s.height * 1.25;
    for (let i = 0; i <= AROUND; i++) {
      const a = (i % AROUND) / AROUND * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      if (i < AROUND) for (let j = 0; j < A; j++) {
        const o = ACROSS[j], r = f + o, v = rb + i * A + j;
        const rr = Math.max(0, r), x = s.x + ca * rr, z = s.z + sa * rr;
        rPos[v * 3] = x; rPos[v * 3 + 1] = groundAt(x, z, s.y) + lift; rPos[v * 3 + 2] = z;
        rInfo[v * 4] = o; rInfo[v * 4 + 1] = a; rInfo[v * 4 + 2] = show * (r > 0 ? 1 : 0); rInfo[v * 4 + 3] = f;
      }
      const x = s.x + ca * f, z = s.z + sa * f, y = groundAt(x, z, s.y) + lift - 0.05;
      for (let j = 0; j < 2; j++) {
        const v = wb + i * 2 + j;
        wPos[v * 3] = x; wPos[v * 3 + 1] = y + j * H; wPos[v * 3 + 2] = z;
        wInfo[v * 4] = a; wInfo[v * 4 + 1] = j; wInfo[v * 4 + 2] = show; wInfo[v * 4 + 3] = f;
      }
    }
  }

  // ---- the run of it
  const me = { object, shake: 0, busy: false, event, update, front, setSun, dispose };
  function setSun() {}                                            // (light, not lit: the sun changes nothing of it)

  function update(dt, camera) {
    T += dt; time.value += dt;
    let running = 0, flashA = 0;
    waves.forEach((w, k) => {
      if (!w || w.done) return;
      const s = w.shape, f = drawnAt(w);
      if (f > s.to + 1) { w.done = true; hide(w.slot); return; }
      running++;
      // how strongly it shows: on at once, going over its last few metres
      const show = sstep(0, 0.1, T - w.warnAt) * (1 - sstep(s.to - 4, s.to + 0.5, f));
      lay(w, f, show);
      // the flash at the middle, while it breaks out
      if (T - w.warnAt < 0.5) {
        flashA = Math.max(flashA, (1 - seg(T - w.warnAt, 0.05, 0.5)) * sstep(0, 0.05, T - w.warnAt));
        flashMat.uniforms.uAt.value.set(s.x, groundAt(s.x, s.z, s.y) + lift + 0.4, s.z);
        flashMat.uniforms.uSize.value = 1.2 + 4 * seg(T - w.warnAt, 0, 0.4);
      }
      // sparks flung up off its front, more of them the longer it is
      const n = Math.floor(dt * (8 + f * 2.2) * show + Math.random());
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, ca = Math.cos(a), sa = Math.sin(a), x = s.x + ca * f, z = s.z + sa * f, out = 2 + Math.random() * 4;
        spark(x, groundAt(x, z, s.y) + lift + 0.1, z, ca * out, 3 + Math.random() * 7, sa * out, 0.06 + Math.random() * 0.06, 0.5 + Math.random() * 0.6, Math.random() < 0.25);
      }
    });
    aRPos.needsUpdate = aRInfo.needsUpdate = aWPos.needsUpdate = aWInfo.needsUpdate = true;
    ring.visible = wall.visible = running > 0;
    flash.visible = flashA > 0.01;
    flashMat.uniforms.uA.value = flashA;

    // sparks: long pink streaks, slowing, falling a little
    {
      const S = sparks.arrays;
      let n = 0;
      for (let i = sparks.list.length - 1; i >= 0; i--) { const p = sparks.list[i]; p.age += dt; if (p.age >= p.life) sparks.list.splice(i, 1); }
      for (const p of sparks.list) {
        const k = p.age / p.life;
        p.v.multiplyScalar(Math.exp(-1.2 * dt)); p.v.y -= 4 * dt; p.p.addScaledVector(p.v, dt);
        const tw = (0.7 + 0.3 * Math.sin(p.age * 30 + p.ph)) * (1 - k * k) * Math.min(1, p.age * 25), c = p.hot ? cHot : cSpark;
        S.aPos.set([p.p.x, p.p.y, p.p.z], n * 3); S.aVel.set([p.v.x * 2.2, p.v.y * 2.2, p.v.z * 2.2], n * 3); S.aInfo.set([c.r * tw, c.g * tw, c.b * tw, p.size], n * 4);
        n++;
      }
      sparks.g.instanceCount = n;
      for (const name in S) sparks.g.attributes[name].needsUpdate = true;
    }

    jolt = Math.max(0, jolt - dt * 2);
    me.shake = Math.max(jolt, 0.18 * Math.min(1, running));
    me.busy = waves.some(w => w && !w.done) || sparks.list.length > 0;
    object.visible = me.busy;
  }
  function dispose() { rg.dispose(); ringMat.dispose(); wg.dispose(); wallMat.dispose(); flash.geometry.dispose(); flashMat.dispose(); sparks.g.dispose(); sparks.mesh.material.dispose(); }
  return me;
}
