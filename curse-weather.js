/* ==========================================================================
   curse-weather.js  —  the cursed world's weather: a hard wind, thin mist drifting through the village, dry leaves blown along

     const weather = createCurseWeather({ homes, heightAt, sky });   // homes: [[x, z], ...] the village's houses and stalls
     scene.add(weather.group);                                        // before the curse is laid on (curse.apply): it greys it too
     shadows.apply(weather.leaves);                                   // the leaves take the hour's light (the mist is the haze's own colour)
     weather.update(player.position);                                 // every frame: the leaves blow round where she is

   One job: make the village feel nearly abandoned in the wind (?curse=1).
     WIND    the kit's wind (stylized-nature's setWind) blows hard: the grass lies over and its gusts roll by fast
             (stylized-grassfield.js), the trees' limbs sway, and the clouds race (the sky's own drift)
     MIST    thin banks of mist stand about the village, among its houses (MIST.n of them, a few metres off the houses and
             stalls the level names), each a wide soft veil, lying low, whose wisps stream past in the wind; it is the haze's
             own colour a shade paler, so it is what the far land fades into, come down among the houses. Faint
             (MIST.opacity), gone close to her (nothing fills the screen) and far off (the haze is there already)
     LEAVES  dry leaves blown past her low over the ground, tumbling, LEAVES.n of them in a box that goes with her
   Mobile: the mist is a few dozen soft cards and a little noise; the leaves a hundred tiny cards; all of it moved in the
   shader by the kit's own time, nothing worked out on the CPU each frame but where she is.
   ========================================================================== */
import * as THREE from 'three';
import { mulberry32, setWind, uniforms as natureUniforms, NATURE_VCOMMON, NATURE_HAZEF, _internal } from './stylized-nature.js';

export const WIND = { strength: 2.3, clouds: 1.8, way: [0.86, 0.5] };      // the kit's wind (1: a breeze), the clouds' drift (times), which way it blows (the grass's own)
export const MIST = { n: 88, near: [3, 9], far: [70, 110], opacity: 0.5, width: [11, 19], height: [1.8, 3.0], off: [2, 12], sway: 3.5 };
export const LEAVES = { n: 140, box: 32, speed: [4.5, 8], size: [0.12, 0.2], high: [0.15, 2.4] };
const LEAF_TONES = ['#5a4636', '#7a6046', '#9c8260'];      // dry leaves: shade, body, light

const MIST_VS = /* glsl */`
uniform float uTime;
uniform vec2 uWay;
uniform vec4 uFade;           // fade in from x..y metres off, out from z..w
attribute vec4 iBank;         // the foot of the bank (x, y, z), its width
attribute vec4 iShape;        // its height, its own number, how thick, how far it sways
varying vec2 vUv;
varying float vA;
varying vec2 vDrift;
void main() {
  vec3 foot = iBank.xyz + vec3(uWay.x, 0.0, uWay.y) * sin(uTime * 0.045 + iShape.y * 6.283) * iShape.w;      // (it sways a little to and fro along the wind)
  vec3 toCam = cameraPosition - foot; toCam.y = 0.0;
  float d = length(toCam);
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
  vec3 p = foot + right * position.x * iBank.w * 0.5 + vec3(0.0, position.y * iShape.x, 0.0);
  vUv = vec2(position.x, position.y);
  vA = iShape.z * smoothstep(uFade.x, uFade.y, d) * (1.0 - smoothstep(uFade.z, uFade.w, d));
  vDrift = uWay * uTime * 0.9 + iShape.y * 37.0;      // (its wisps stream past with the wind, each bank its own)
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const MIST_FS = /* glsl */`
${_internal.NOISE}
uniform vec3 uHaze;
varying vec2 vUv;
varying float vA;
varying vec2 vDrift;
void main() {
  // a soft veil: thin at its foot (where it meets the ground: no hard line), thickest a quarter of the way up, thinning out
  // above and at its sides; all of it there, thicker and thinner in wisps that stream through it
  float body = (1.0 - smoothstep(0.25, 1.0, abs(vUv.x))) * smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.3, 1.0, vUv.y));
  vec2 q = vec2(vUv.x * 2.2, vUv.y * 1.3) * 1.6 - vDrift * vec2(0.22, 0.05);
  float n = noise2(q) * 0.62 + noise2(q * 2.3 + 11.0) * 0.38;
  float a = body * (0.3 + 0.7 * smoothstep(0.25, 0.75, n)) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(uHaze, vec3(1.0), 0.18) * (0.96 + 0.1 * vUv.y), a);      // (a shade paler than the haze: mist, not smoke)
}`;

const LEAF_VS = /* glsl */`
${NATURE_VCOMMON}
uniform vec3 uCenter;         // where she is
uniform vec2 uWay;
uniform vec3 uBox;            // the box the leaves blow through: its size, how high they fly from .. to
attribute vec4 iLeaf;         // its own numbers: where across the wind, where along it, how high, its speed
attribute vec2 iLook;         // its size, its tone
varying vec2 vUv;
varying float vA;
varying float vTone;
varying float vSide;
void main() {
  vec2 across = vec2(-uWay.y, uWay.x);
  float L = uBox.x, run = iLeaf.y * L + uTime * iLeaf.w;
  float f = fract(run / L);                                                    // where along the box it is now: 0 at the upwind side
  // (the box goes with her: a leaf is laid along the wind from the box's upwind side, and blown down it)
  vec2 xz = uCenter.xz + uWay * (f - 0.5) * L + across * (iLeaf.x - 0.5) * L;
  float t = uTime * (1.3 + iLeaf.w * 0.12) + iLeaf.x * 40.0;
  float hop = abs(sin(t * 0.7 + iLeaf.y * 9.0));                                // (skipping along, now high, now low)
  vec3 p = vec3(xz.x, uCenter.y + mix(uBox.y, uBox.z, iLeaf.z) * (0.45 + 0.55 * hop), xz.y);
  p.xz += across * sin(t * 1.1) * 0.35;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float a = t * 2.6, tumble = cos(t * 3.1);
  vec2 q = position.xy * iLook.x;
  q.x *= abs(tumble) * 0.85 + 0.15;
  mv.xy += vec2(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
  vHaze = hazeAt(mv.xyz);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vA = smoothstep(0.0, 0.1, f) * (1.0 - smoothstep(0.88, 1.0, f));             // (coming in and going out of the box: faded, never popping)
  vA *= smoothstep(1.6, 3.2, -mv.z);                                            // (and not right in front of the eye, where one would fill the screen)
  vTone = iLook.y;
  vSide = step(0.0, tumble);
}`;
const LEAF_FS = /* glsl */`
${NATURE_HAZEF}
uniform vec3 uL0, uL1, uL2;
varying vec2 vUv;
varying float vA;
varying float vTone;
varying float vSide;
void main() {
  // one pointed leaf (as the trees' falling leaves are drawn): stalk at the bottom, tip at the top
  float y = vUv.y, x = abs(vUv.x - 0.5) * 2.0;
  float e = 0.62 * pow(sin(3.14159 * clamp(y, 0.0, 1.0)), 0.8) * (1.0 - 0.35 * y) - x;
  float w = max(fwidth(e), 1e-3);
  float a = smoothstep(-w, w, e) * vA;
  if (a < 0.02) discard;
  vec3 col = mix(uL1, uL2, vTone);
  col = mix(uL0, col, 0.35 + 0.65 * vSide);                                     // (its back, as it turns, a tone darker)
  gl_FragColor = vec4(mix(col, uHaze, vHaze), a);
}`;

export function createCurseWeather({ homes = [], heightAt, sky = null, seed = 7 } = {}) {
  const group = new THREE.Group(); group.name = 'curseWeather';
  const rng = mulberry32(seed), range = (a, b) => a + rng() * (b - a), way = new THREE.Vector2(...WIND.way).normalize();

  // ---- the wind: hard (set at once: no slow rise at the start), the clouds racing
  setWind(WIND.strength); natureUniforms.uWind.value = WIND.strength;
  if (sky && sky.userData.tune && sky.userData.tune.speed) sky.userData.tune.speed.value *= WIND.clouds;

  // ---- the mist: banks among the houses
  const bank = [], shape = [];
  for (let i = 0; i < MIST.n && homes.length; i++) {
    const [hx, hz] = homes[i % homes.length], a = rng() * Math.PI * 2, r = range(...MIST.off);
    const x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r;
    bank.push(x, heightAt(x, z) - 0.25, z, range(...MIST.width));
    shape.push(range(...MIST.height), rng(), MIST.opacity * range(0.6, 1), MIST.sway * range(0.4, 1));
  }
  let mist = null;
  if (bank.length) {
    const quad = new THREE.PlaneGeometry(2, 1); quad.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    g.setAttribute('iBank', new THREE.InstancedBufferAttribute(new Float32Array(bank), 4));
    g.setAttribute('iShape', new THREE.InstancedBufferAttribute(new Float32Array(shape), 4));
    g.instanceCount = bank.length / 4;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: natureUniforms.uTime, uHaze: _internal.shared.uHaze, uWay: { value: way }, uFade: { value: new THREE.Vector4(...MIST.near, ...MIST.far) } },
      vertexShader: MIST_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    mist = new THREE.Mesh(g, m); mist.frustumCulled = false; mist.renderOrder = 3; mist.name = 'curseMist';
    group.add(mist);
  }

  // ---- the leaves
  const leaf = [], look = [];
  for (let i = 0; i < LEAVES.n; i++) { leaf.push(rng(), rng(), rng(), range(...LEAVES.speed)); look.push(range(...LEAVES.size), rng()); }
  const quad = new THREE.PlaneGeometry(1, 1);
  const lg = new THREE.InstancedBufferGeometry();
  lg.index = quad.index; lg.setAttribute('position', quad.attributes.position); lg.setAttribute('uv', quad.attributes.uv);
  lg.setAttribute('iLeaf', new THREE.InstancedBufferAttribute(new Float32Array(leaf), 4));
  lg.setAttribute('iLook', new THREE.InstancedBufferAttribute(new Float32Array(look), 2));
  lg.instanceCount = LEAVES.n;
  const center = new THREE.Vector3();
  const rgb = _internal.rgb;
  const lm = new THREE.ShaderMaterial({
    uniforms: { ..._internal.shared, uCenter: { value: center }, uWay: { value: way }, uBox: { value: new THREE.Vector3(LEAVES.box, ...LEAVES.high) },
      uL0: { value: rgb(LEAF_TONES[0]) }, uL1: { value: rgb(LEAF_TONES[1]) }, uL2: { value: rgb(LEAF_TONES[2]) } },
    vertexShader: LEAF_VS, fragmentShader: LEAF_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const leaves = new THREE.Mesh(lg, lm); leaves.frustumCulled = false; leaves.renderOrder = 3; leaves.name = 'curseLeaves';
  group.add(leaves);

  return {
    group, mist, leaves,
    update(at) { center.copy(at); },
    dispose() { if (mist) { mist.geometry.dispose(); mist.material.dispose(); } lg.dispose(); lm.dispose(); },
  };
}
