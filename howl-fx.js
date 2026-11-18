/* ==========================================================================
   howl-fx.js  —  the green light of the plant boss's howl (plant-boss-talk.js's move 'howl', all three heads at once,
   as at the end of the talking clip): green motes drawn in to the heads as they gather themselves; a column of green
   light shot up out of the middle head's crown, with a flash and a spray of sparks; green wind going round the plant,
   tearing leaves off and flinging them; then, as they bellow, green breath streaming out of all three mouths at her.
   One job: draw that. It decides nothing: the talking says when (talk.howl / banter.howl), this follows.

     const fx = createHowlFx({ seed })
     scene.add(fx.object)
     every frame: fx.update(dt, camera, boss, t, her)   t: seconds into the howl (banter.howl), or < 0 when there is none;
                                                       her: where she stands (her feet, world): the breath goes at her
     fx.shake                                          0..1: how hard the ground jolts now (the camera's to shake, if it likes)
     fx.busy                                           true while anything of it is still to be seen

   The beats are plant-boss-talk.js's HOWL. Drawn the kit's way: glowing streaks and soft green smoke added onto what
   is behind, hard-edged two-tone leaves. A handful of draw calls.
   ========================================================================== */
import * as THREE from 'three';
import { HOWL } from './plant-boss-talk.js';
import { _fx } from './thicket-fx.js';
import { mulberry32, _internal as natureInternal } from './stylized-nature.js';

const { NOISE } = natureInternal;
const { SPARK_VS, SPARK_FS, PUFF_VS, HAZE_FS, makePool, col } = _fx;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sstep = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };
const pulse = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t));

// the look
export const HOWL_LOOK = {
  spark: '#a8ff48', hot: '#eaffc8', beam: '#7dff3a', smoke: ['#174f16', '#3f8f28'],
  wind: '#4fc82e', leaf: ['#4f7a26', '#86b23a', '#b2d24c'], glow: '#5edc2e',
};
const L = HOWL_LOOK;

// a column of light standing on the ground of its own, always turned to face the camera
const BEAM_VS = /* glsl */`
uniform vec3 uBase;
uniform float uH, uW;
varying vec2 vB;
void main() {
  vB = vec2(position.x * 2.0, position.y);
  vec3 up = vec3(0.0, 1.0, 0.0), view = normalize(cameraPosition - uBase);
  vec3 right = normalize(cross(up, view) + vec3(1e-4, 0.0, 0.0));
  vec3 p = uBase + right * position.x * uW + up * position.y * uH;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const BEAM_FS = /* glsl */`
${NOISE}
uniform vec3 uC, uHot;
uniform float uA, uT;
varying vec2 vB;
void main() {
  float x = vB.x, y = vB.y;
  float core = exp(-x * x * 40.0), glow = exp(-x * x * 3.5);
  float streak = noise2(vec2(x * 4.0, y * 9.0 - uT * 7.0)) * 0.7 + noise2(vec2(x * 9.0 + 3.0, y * 20.0 - uT * 11.0)) * 0.3;
  float along = smoothstep(0.0, 0.04, y) * (1.0 - smoothstep(0.45, 1.0, y));
  float s = clamp(core * 1.3 + glow * 0.55 * (0.55 + 0.6 * streak), 0.0, 1.0) * along * uA;
  if (s < 0.004) discard;
  gl_FragColor = vec4(mix(uC, uHot, clamp(core * 1.4, 0.0, 1.0)) * s, s);
}`;
// a flash: a round glow, turned to the camera
const FLASH_VS = /* glsl */`
uniform vec3 uBase;
uniform float uR;
varying vec2 vF;
void main() {
  vF = position.xy * 2.0;
  vec4 mv = viewMatrix * vec4(uBase, 1.0);
  mv.xy += position.xy * uR * 2.0;
  gl_Position = projectionMatrix * mv;
}`;
const FLASH_FS = /* glsl */`
uniform vec3 uC, uHot;
uniform float uA;
varying vec2 vF;
void main() {
  float d = length(vF);
  float s = (exp(-d * d * 6.0) + 0.35 * (1.0 - smoothstep(0.75, 1.0, d)) * smoothstep(0.55, 0.8, d)) * uA;
  if (s < 0.004) discard;
  gl_FragColor = vec4(mix(uC, uHot, exp(-d * d * 14.0)) * s, s);
}`;
// the green wind: ribbons wound round the plant, streaks running up them
const WIND_VS = /* glsl */`
attribute vec2 aW;           // x: along 0..1, y: across -1..1
varying vec2 vW;
void main() { vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WIND_FS = /* glsl */`
uniform vec3 uC, uHot;
uniform float uA, uT, uPh;
varying vec2 vW;
void main() {
  float f = fract(vW.x * 2.2 - uT * 1.5 + uPh);
  float streak = smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.08, 0.6, f));
  float across = 1.0 - abs(vW.y);
  float s = streak * across * across * smoothstep(0.0, 0.1, vW.x) * (1.0 - smoothstep(0.85, 1.0, vW.x)) * uA;
  if (s < 0.004) discard;
  gl_FragColor = vec4(mix(uC, uHot, streak * across) * s, s);
}`;
// the glow on the ground under it
const GLOW_FS = /* glsl */`
uniform vec3 uC;
uniform float uA, uT;
varying vec2 vG;
void main() {
  float r = length(vG);
  float ring = exp(-pow((r - fract(uT * 0.9)) / 0.06, 2.0)) * (1.0 - fract(uT * 0.9));
  float s = ((1.0 - smoothstep(0.2, 1.0, r)) * 0.55 + ring * 0.6) * uA;
  if (s < 0.004) discard;
  gl_FragColor = vec4(uC * s, s);
}`;
const GLOWDISC_VS = /* glsl */`
varying vec2 vG;
void main() { vG = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// a leaf torn off: a pointed oval, a midrib, two tones (instanced)
const LEAF_VS = /* glsl */`
varying vec2 vU;
varying vec3 vC;
varying vec3 vN;
void main() {
  vU = uv; vC = instanceColor;
  mat4 m = modelMatrix * instanceMatrix;
  vN = normalize(mat3(m) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
}`;
const LEAF_FS = /* glsl */`
uniform vec3 uSun;
varying vec2 vU;
varying vec3 vC;
varying vec3 vN;
void main() {
  float x = vU.x * 2.0 - 1.0, y = vU.y;
  float hw = pow(max(sin(3.1416 * y), 0.0), 0.75) * 0.95;
  if (abs(x) > hw) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float l = dot(n, uSun);
  vec3 c = l > 0.2 ? vC * 1.25 : vC;
  c = mix(c, vC * 1.5, (1.0 - smoothstep(0.03, 0.07, abs(x))) * step(0.08, y) * step(y, 0.92) * 0.6);
  gl_FragColor = vec4(c, 1.0);
}`;

const additive = extra => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, ...extra });
// (laid over what is behind, not added onto it: green on the blue sky stays green)
const over = extra => ({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true, ...extra });

export function createHowlFx({ seed = 1, look = HOWL_LOOK } = {}) {
  const rng = mulberry32(seed * 911 + 3);
  const object = new THREE.Group();
  object.name = 'howl_fx';
  const sun = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  const T = { value: 0 };

  // ---- sparks and green smoke
  const sparks = makePool(800, { aPos: 3, aVel: 3, aInfo: 4 }, new THREE.ShaderMaterial({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, ...additive() }));
  sparks.mesh.renderOrder = 6;
  const smokeMat = new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: HAZE_FS, ...additive(),
    uniforms: { uC0: { value: col(look.smoke[0]) }, uC1: { value: col(look.smoke[1]) }, uTime: T, uA: { value: 1 } } });
  const smoke = makePool(120, { aPos: 3, aSize: 2, aInfo: 4 }, smokeMat);
  smoke.mesh.renderOrder = 5;
  object.add(smoke.mesh, sparks.mesh);
  const cSpark = col(look.spark), cHot = col(look.hot);
  function spark(p, v, size, life, hot = 0) {
    if (sparks.list.length >= sparks.max) sparks.list.shift();
    sparks.list.push({ p: p.clone(), v: v.clone(), size, life, age: 0, hot, ph: Math.random() * 6.28, drift: 0 });
    return sparks.list[sparks.list.length - 1];
  }
  function puff(p, v, size, life, thick = 1) {
    if (smoke.list.length >= smoke.max) smoke.list.shift();
    smoke.list.push({ p: p.clone(), v: v.clone(), size, life, age: 0, dice: Math.random(), thick });
  }

  // ---- the column of light, its flash, the ground's glow
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
  const beamMat = new THREE.ShaderMaterial({ vertexShader: BEAM_VS, fragmentShader: BEAM_FS, ...over({ side: THREE.DoubleSide }),
    uniforms: { uBase: { value: new THREE.Vector3() }, uH: { value: 16 }, uW: { value: 1.3 }, uA: { value: 0 }, uT: T, uC: { value: col(look.beam) }, uHot: { value: col(look.hot) } } });
  const beam = new THREE.Mesh(quad, beamMat);
  beam.frustumCulled = false; beam.renderOrder = 7;
  const flashMat = new THREE.ShaderMaterial({ vertexShader: FLASH_VS, fragmentShader: FLASH_FS, ...over(),
    uniforms: { uBase: { value: new THREE.Vector3() }, uR: { value: 1 }, uA: { value: 0 }, uC: { value: col(look.beam) }, uHot: { value: col(look.hot) } } });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flashMat);
  flash.frustumCulled = false; flash.renderOrder = 8;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: GLOWDISC_VS, fragmentShader: GLOW_FS, ...additive(),
    uniforms: { uC: { value: col(look.glow) }, uA: { value: 0 }, uT: T } }));
  disc.renderOrder = 2; disc.frustumCulled = false;
  object.add(disc, beam, flash);

  // ---- the green wind: three ribbons wound round the plant
  const wind = new THREE.Group();
  const winds = [];
  for (let k = 0; k < 3; k++) {
    const N = 90, p = [], a = [], idx = [], a0 = (k / 3) * Math.PI * 2, turns = 1.25 + rng() * 0.3, r0 = 2.9 + rng() * 0.5, y0 = 0.3 + k * 0.5;
    for (let i = 0; i <= N; i++) {
      const u = i / N, ang = a0 + u * turns * Math.PI * 2, r = r0 + 1.0 * u, y = y0 + 4.6 * u, w = 0.28 + 0.2 * Math.sin(u * Math.PI);
      const x = Math.sin(ang) * r, z = Math.cos(ang) * r;
      p.push(x, y - w, z, x, y + w, z); a.push(u, -1, u, 1);
      if (i < N) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(a, 2));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({ vertexShader: WIND_VS, fragmentShader: WIND_FS, ...additive({ side: THREE.DoubleSide }),
      uniforms: { uC: { value: col(look.wind) }, uHot: { value: col(look.hot) }, uA: { value: 0 }, uT: T, uPh: { value: rng() } } });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false; mesh.renderOrder = 6;
    wind.add(mesh); winds.push(m);
  }
  object.add(wind);

  // ---- leaves torn off and flung
  const LEAVES = 48;
  const leafGeo = new THREE.PlaneGeometry(0.34, 0.56);
  const leafMat = new THREE.ShaderMaterial({ vertexShader: LEAF_VS, fragmentShader: LEAF_FS, side: THREE.DoubleSide, uniforms: { uSun: { value: sun } } });
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, LEAVES);
  leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < LEAVES; i++) leafMesh.setColorAt(i, col(look.leaf[i % look.leaf.length]));
  leafMesh.count = 0; leafMesh.frustumCulled = false;
  object.add(leafMesh);
  const leaves = [];
  function leaf(p, v, life) {
    if (leaves.length >= LEAVES) leaves.shift();
    leaves.push({ p: p.clone(), v: v.clone(), life, age: 0, rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9), ph: Math.random() * 6.28, s: 0.8 + Math.random() * 0.6 });
  }

  // ---- the run of it
  const me = { object, shake: 0, busy: false, update, setSun, dispose };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dir = new THREE.Vector3(), foot = new THREE.Vector3(), chest = new THREE.Vector3(), crown = new THREE.Vector3(), at = new THREE.Vector3();
  const headAt = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], mouthAt = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3();
  let last = -1, fired = {}, boss0 = null;
  function once(key, t, when, fn) { if (t >= when && !fired[key]) { fired[key] = true; fn(); } }
  function setSun(v) { sun.copy(v).normalize(); }

  function update(dt, camera, boss, t, her) {
    T.value += dt;
    const on = t >= 0;
    if (on && (last < 0 || t < last)) fired = {};                                // a new howl
    last = on ? t : -1;
    if (!on && !me.busy) { object.visible = false; me.shake = 0; return; }
    object.visible = true;
    // where the heads are now, their mouths (turned to her), the plant's foot, her chest
    if (boss) {
      boss0 = boss;
      const { heads, mesh } = boss.userData;
      boss.getWorldPosition(foot);
      if (her) chest.set(her.x, her.y + 1.2, her.z); else chest.copy(foot).add(tmp.set(0, 1.2, 10));
      heads.forEach((h, i) => {
        mesh.localToWorld(headAt[i].copy(h.centre).add(h.lean));
        const r = h.radius * (h.scale || 1) * mesh.scale.x;
        dir.subVectors(chest, headAt[i]); dir.y *= 0.4; dir.normalize();
        mouthAt[i].copy(headAt[i]).addScaledVector(dir, r * 0.95).add(tmp.set(0, -r * 0.15, 0));
      });
    }
    const H = HOWL, tt = on ? t : 99;

    // gathering: green motes drawn in to each head, and in off the ground round it
    const gather = on ? pulse(tt, H.gather, H.gather + 0.3, H.pull - 0.1, H.pull + 0.2) : 0;
    if (gather > 0) {
      for (let i = 0; i < 3; i++) {
        if (Math.random() < dt * 50 * gather) {
          const d = tmp.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize(), far = 1.8 + Math.random() * 1.6, life = 0.45 + Math.random() * 0.3;
          const p = tmp2.copy(headAt[i]).addScaledVector(d, far);
          spark(p, d.multiplyScalar(-far / life), 0.07 + Math.random() * 0.04, life, Math.random() < 0.3 ? 1 : 0);
        }
      }
      if (Math.random() < dt * 30 * gather) {
        const a = Math.random() * 6.28, r = 3.5 + Math.random() * 1.8, life = 0.8 + Math.random() * 0.5;
        const p = tmp2.set(foot.x + Math.sin(a) * r, foot.y + 0.3, foot.z + Math.cos(a) * r);
        const v = tmp.subVectors(headAt[0], p).multiplyScalar(1 / life);
        spark(p, v, 0.05 + Math.random() * 0.03, life).drift = 1;
      }
    }
    // the column of light out of the middle head's crown; its flash, and a spray of sparks round it
    const beamA = on ? pulse(tt, H.beam - 0.06, H.beam + 0.05, H.swirl + 0.15, H.pull + 0.35) : 0;
    crown.copy(headAt[0]).add(tmp.set(0, boss0 ? boss0.userData.heads[0].radius * boss0.userData.mesh.scale.x * 0.9 : 0.8, 0));
    beam.visible = beamA > 0.002;
    beamMat.uniforms.uA.value = beamA * (0.85 + 0.15 * Math.sin(T.value * 40));
    beamMat.uniforms.uBase.value.copy(crown);
    beamMat.uniforms.uW.value = 1.0 + 0.6 * pulse(tt, H.beam - 0.05, H.beam, H.beam + 0.05, H.beam + 0.35);
    const flashA = on ? pulse(tt, H.beam - 0.05, H.beam, H.beam + 0.04, H.beam + 0.45) : 0;
    flash.visible = flashA > 0.002;
    flashMat.uniforms.uA.value = flashA; flashMat.uniforms.uBase.value.copy(crown); flashMat.uniforms.uR.value = 1.2 + 1.6 * seg(tt, H.beam - 0.05, H.beam + 0.45);
    if (on) once('burst', tt, H.beam, () => {
      for (let k = 0; k < 46; k++) { const a = Math.random() * 6.28, sp = 4 + Math.random() * 6; spark(crown, tmp.set(Math.sin(a) * sp, (Math.random() - 0.2) * 4, Math.cos(a) * sp), 0.06 + Math.random() * 0.04, 0.5 + Math.random() * 0.5, Math.random() < 0.4 ? 1 : 0); }
    });
    if (beamA > 0.3 && Math.random() < dt * 60) spark(at.copy(crown).add(tmp.set((Math.random() - 0.5) * 0.6, Math.random() * 3, (Math.random() - 0.5) * 0.6)), tmp2.set(0, 12 + Math.random() * 10, 0), 0.05 + Math.random() * 0.04, 0.5 + Math.random() * 0.4, 1);
    // the green wind going round; it tears leaves off and flings them
    const windA = on ? pulse(tt, H.swirl - 0.1, H.swirl + 0.25, H.roarEnd - 0.6, H.roarEnd) : 0;
    wind.visible = windA > 0.002;
    wind.position.copy(foot); wind.rotation.y = -T.value * 2.4;
    for (const m of winds) m.uniforms.uA.value = windA * 0.6;
    if (on) once('leaves', tt, H.swirl, () => {
      for (let k = 0; k < 26; k++) {
        const a = Math.random() * 6.28, r = 1.4 + Math.random() * 1.8;
        at.set(foot.x + Math.sin(a) * r, foot.y + 0.8 + Math.random() * 2.2, foot.z + Math.cos(a) * r);
        leaf(at, tmp.set(Math.cos(a) * 5 + Math.sin(a) * 2.5, 3.5 + Math.random() * 4, -Math.sin(a) * 5 + Math.cos(a) * 2.5), 2.8 + Math.random() * 1.2);
      }
    });
    if (windA > 0.3 && Math.random() < dt * 40) {
      const a = Math.random() * 6.28, r = 3 + Math.random() * 1.4;
      spark(at.set(foot.x + Math.sin(a) * r, foot.y + 0.3 + Math.random() * 4, foot.z + Math.cos(a) * r), tmp.set(-Math.cos(a) * 6, 1.5, Math.sin(a) * 6), 0.05 + Math.random() * 0.03, 0.4 + Math.random() * 0.3);
    }
    // the ground's glow under it
    const glowA = on ? pulse(tt, H.gather, H.gather + 0.5, H.roarEnd - 0.3, H.roarEnd + 0.4) : 0;
    disc.visible = glowA > 0.002;
    disc.position.set(foot.x, foot.y + 0.28, foot.z); disc.scale.setScalar(4.8);
    disc.material.uniforms.uA.value = glowA * 0.55;
    // bellowing: green breath streaming out of all three mouths at her; leaves blown off at her
    const roarK = on ? pulse(tt, H.roar - 0.05, H.roar + 0.1, H.roarEnd - 0.25, H.roarEnd + 0.1) : 0;
    if (roarK > 0.05) {
      for (let i = 0; i < 3; i++) {
        dir.subVectors(chest, mouthAt[i]); dir.y = dir.y * 0.5 + 0.4; dir.normalize();
        if (i > 0 && boss0) { tmp.set(i === 1 ? 1 : -1, 0, 0).transformDirection(boss0.matrixWorld); dir.addScaledVector(tmp, 0.75).normalize(); }      // (out to its own side)
        if (Math.random() < dt * 40 * roarK) spark(at.copy(mouthAt[i]).add(tmp2.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.0, (Math.random() - 0.5) * 1.2)), tmp.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), 0.08 + Math.random() * 0.05, 0.4 + Math.random() * 0.4, 1);
        const n = Math.floor(dt * 80 * roarK + Math.random());
        for (let k = 0; k < n; k++) {
          const v = tmp.copy(dir).add(tmp2.set((Math.random() - 0.5) * 0.55, (Math.random() - 0.5) * 0.45, (Math.random() - 0.5) * 0.55)).normalize().multiplyScalar(9 + Math.random() * 7);
          spark(mouthAt[i], v, 0.08 + Math.random() * 0.05, 0.35 + Math.random() * 0.3, Math.random() < 0.35 ? 1 : 0);
        }
        if (Math.random() < dt * 7 * roarK) puff(mouthAt[i], tmp.copy(dir).multiplyScalar(4 + Math.random() * 2), 0.8 + Math.random() * 0.4, 0.6 + Math.random() * 0.3, 0.9);
      }
    }
    if (on) once('blow', tt, H.roar + 0.05, () => {
      for (let k = 0; k < 18; k++) {
        const i = k % 3;
        at.copy(headAt[i]).add(tmp.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.0, (Math.random() - 0.5) * 1.6));
        dir.subVectors(chest, at).normalize();
        leaf(at, tmp.copy(dir).multiplyScalar(6 + Math.random() * 5).add(tmp2.set((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3)), 2.2 + Math.random());
      }
    });

    // move and draw the sparks
    {
      const A = sparks.arrays;
      let n = 0;
      for (let i = sparks.list.length - 1; i >= 0; i--) { const p = sparks.list[i]; p.age += dt; if (p.age >= p.life) sparks.list.splice(i, 1); }
      for (const p of sparks.list) {
        const k = p.age / p.life;
        if (!p.drift) p.v.multiplyScalar(Math.exp(-1.6 * dt));
        p.v.y += 0.6 * dt;
        p.p.addScaledVector(p.v, dt);
        const tw = (0.7 + 0.3 * Math.sin(p.age * 34 + p.ph)) * (1 - k * k) * Math.min(1, p.age * 25);
        const c = p.hot ? cHot : cSpark;
        A.aPos.set([p.p.x, p.p.y, p.p.z], n * 3);
        A.aVel.set([p.v.x, p.v.y, p.v.z], n * 3);
        A.aInfo.set([c.r * tw, c.g * tw, c.b * tw, p.size], n * 4);
        n++;
      }
      sparks.g.instanceCount = n;
      for (const name in A) sparks.g.attributes[name].needsUpdate = true;
    }
    // the green smoke
    {
      const A = smoke.arrays;
      let n = 0;
      for (let i = smoke.list.length - 1; i >= 0; i--) { const p = smoke.list[i]; p.age += dt; if (p.age >= p.life) smoke.list.splice(i, 1); }
      for (const p of smoke.list) {
        const k = p.age / p.life;
        p.v.multiplyScalar(Math.exp(-1.8 * dt)); p.v.y += 0.5 * dt;
        p.p.addScaledVector(p.v, dt);
        const s = p.size * (1 + 1.4 * k);
        A.aPos.set([p.p.x, p.p.y, p.p.z], n * 3);
        A.aSize.set([s, s * 0.85], n * 2);
        A.aInfo.set([0, p.dice, k, p.thick * 1.2], n * 4);
        n++;
      }
      smoke.g.instanceCount = n;
      for (const name in A) smoke.g.attributes[name].needsUpdate = true;
    }
    // the leaves: flung, then fluttering down, tumbling
    let li = 0;
    for (let i = leaves.length - 1; i >= 0; i--) { const f = leaves[i]; f.age += dt; if (f.age >= f.life) leaves.splice(i, 1); }
    for (const f of leaves) {
      f.v.multiplyScalar(Math.exp(-1.4 * dt)); f.v.y -= 3.2 * dt;
      f.v.x += Math.sin(f.age * 4 + f.ph) * 2.2 * dt; f.v.z += Math.cos(f.age * 3.3 + f.ph) * 2.2 * dt;
      f.p.addScaledVector(f.v, dt);
      if (f.p.y < foot.y + 0.1) { f.p.y = foot.y + 0.1; f.v.set(0, 0, 0); f.spin.multiplyScalar(0.9); }
      f.rot.x += f.spin.x * dt; f.rot.y += f.spin.y * dt; f.rot.z += f.spin.z * dt;
      const k = 1 - seg(f.age, f.life - 0.5, f.life);
      qt.setFromEuler(f.rot); sc.setScalar(f.s * k * Math.min(1, f.age * 10));
      mtx.compose(f.p, qt, sc);
      leafMesh.setMatrixAt(li++, mtx);
    }
    leafMesh.count = li; leafMesh.instanceMatrix.needsUpdate = true;

    me.shake = on ? Math.max(0.1 * gather, 0.7 * pulse(tt, H.beam - 0.05, H.beam, H.beam + 0.05, H.beam + 0.5), 0.45 * roarK, 0.15 * windA) : 0;
    me.busy = on || sparks.list.length > 0 || smoke.list.length > 0 || leaves.length > 0;
  }
  function dispose() {
    sparks.g.dispose(); sparks.mesh.material.dispose(); smoke.g.dispose(); smokeMat.dispose(); quad.dispose(); beamMat.dispose();
    flash.geometry.dispose(); flashMat.dispose(); disc.geometry.dispose(); disc.material.dispose();
    wind.children.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); leafGeo.dispose(); leafMat.dispose();
  }
  return me;
}
