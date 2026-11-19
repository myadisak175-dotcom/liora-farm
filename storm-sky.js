/* ==========================================================================
   storm-sky.js  —  the sky over the plant boss's sky beam (plant-boss-moves.js: play('skybeam')): the day's sky goes
   dark, storm cloud gathers into a ceiling over the whole field and winds round an eye right over the plant; lightning
   comes down out of it, green and gold; shafts of light fall through the eye. When the light has come down on the
   plant the cloud is blown open from the eye outwards, and for a while the sky is gold, before it is the day's again.
   One job: the sky and its light. It decides nothing: the move's time says where it is.

     const sky = createStormSky({ far, seed })     far: the land's haze colour (the sky at the horizon is that colour, lit
                                                   as the land is, so the land goes into it with no line)
     sky.object        the sky itself: its dome, the storm's cloud, the lightning. Draw it FIRST, on a cleared picture:
                       it writes nothing to the depth, and the land is drawn over it
     sky.rays          the shafts of light through the eye: light, to be drawn after the land (and after the land is dimmed)
     every frame: sky.update(dt, camera, foot, t)  foot: the plant's foot (world); t: seconds into the sky beam (moves.time
                                                   while moves.state is 'skybeam'), or < 0 when there is none
     sky.light         Vector3: what the land's picture is to be multiplied by now (1, 1, 1: the day's light): the storm's
                       dark, a flash of lightning, the gold after
     sky.storm         0..1: how much of a storm it is now         sky.shake   0..1: thunder, for the camera
     sky.busy          true while it is anything but the day's sky
     STORM_SKY         its numbers: how high the cloud lies, how wide its eye is
     sky.dispose()

   The beats are BOSS_MOVES.skybeam's. Drawn the kit's way: cloud in four flat tones with hard edges, wound round the eye
   in the shader (one disc, one draw call); the dome one more; lightning a handful of camera-facing strips (one); the
   shafts one.
   ========================================================================== */
import * as THREE from 'three';
import { BOSS_MOVES } from './plant-boss-moves.js';
import { mulberry32, _internal as natureInternal } from './stylized-nature.js';

const { NOISE } = natureInternal;
const col = h => new THREE.Color().setHex(parseInt(h.slice(1), 16), THREE.LinearSRGBColorSpace);      // (as written: the kit paints in the picture's own tones)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sstep = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };
const pulse = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t));

export const STORM_SKY = { height: 44, eye: 17, reach: 320 };       // metres: the cloud over the plant's foot, its eye's radius, how far out it lies
export const STORM_LOOK = {
  day: { zenith: '#2f72c4', mid: '#7fb4e6' },                        // (the other pages' sky)
  storm: { zenith: '#0b161f', mid: '#17303a' },
  gold: { zenith: '#6f8ab8', mid: '#efc998' }, wisp: '#fff3d6',
  light: { storm: [0.45, 0.57, 0.62], blaze: [0.72, 0.72, 0.56], gold: [1.0, 0.92, 0.78], bolt: [0.1, 0.15, 0.12] },    // what the land is multiplied by
  cloud: ['#122029', '#1f3a45', '#33606a', '#5a9d93'],               // deep -> lit
  eye: '#2fc49a', hot: '#f4ffd8',                                     // the light in the eye and on its rim; cloud lit by lightning
  bolt: '#c8ff7a', boltHot: '#fffbe6',
  ray: '#46dcb4',
};

// ---- the dome: the sky's colours by how high one looks; thin gold cloud low in it, after
const DOME_VS = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DOME_FS = /* glsl */`
${NOISE}
uniform vec3 uZenith, uMid, uHorizon, uWisp;
uniform float uGold, uT;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.24, e));
  c = mix(c, uZenith, smoothstep(0.2, 0.75, e));
  if (uGold > 0.003 && e > 0.0) {
    vec2 w = d.xz / (e + 0.16) * 1.1 + vec2(uT * 0.02, 0.0);
    float n = noise2(w * vec2(0.6, 1.4)) * 0.6 + noise2(w * vec2(1.5, 3.2) + 7.0) * 0.4;
    float wisp = smoothstep(0.56, 0.6, n) * smoothstep(0.03, 0.14, e) * (1.0 - smoothstep(0.3, 0.62, e));
    c = mix(c, uWisp, wisp * 0.55 * uGold);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// ---- the storm's cloud: one disc over the field, wound round its eye
const CLOUD_VS = /* glsl */`
varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CLOUD_FS = /* glsl */`
${NOISE}
uniform float uStorm, uEye, uEye0, uSpin, uBlaze, uReach;
uniform vec3 uC0, uC1, uC2, uC3, uGlow, uHot;
uniform vec3 uFlashA, uFlashB;                     // lightning in it: where (x, z, metres from the eye) and how bright
varying vec2 vP;
vec2 turn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main() {
  float r = length(vP);
  // wound round the eye: what is nearer it has gone further round
  float wound = uSpin * (0.3 + 26.0 / (r + 20.0)) - log(r + 12.0) * 2.4;
  vec2 q = turn(vP, wound);
  float n = noise2(q * 0.02 + 3.0) * 0.5 + noise2(q * 0.052 - 5.0) * 0.32 + noise2(q * 0.14 + 9.0) * 0.18;
  float arms = 0.5 + 0.5 * sin(atan(vP.y, vP.x) * 3.0 + log(r + 12.0) * 6.0 + uSpin * 1.6);
  float dens = n * 0.7 + arms * 0.3;
  // (the same a few metres nearer the eye: where it thins toward the eye, that side of it catches the eye's light)
  vec2 q2 = turn(vP * (1.0 - 9.0 / max(r, 9.0)), wound);
  float dens2 = (noise2(q2 * 0.02 + 3.0) * 0.5 + noise2(q2 * 0.052 - 5.0) * 0.32 + noise2(q2 * 0.14 + 9.0) * 0.18) * 0.7 + arms * 0.3;
  float facing = clamp((dens - dens2) * 7.0, -1.0, 1.0);
  // it gathers: wisps first, then a whole ceiling
  float cover = smoothstep(0.8 - 0.62 * uStorm, 0.86 - 0.58 * uStorm, dens);
  float edge = uEye * (0.85 + 0.5 * n);
  float alpha = cover * smoothstep(edge, edge * 1.12 + 2.0, r) * smoothstep(0.0, 0.25, uStorm) * (1.0 - smoothstep(uReach * 0.6, uReach * 0.97, r));
  // lit from the eye, and by lightning: four flat tones
  float near = 1.0 - smoothstep(edge, edge + 55.0, r);
  vec2 da = vP - uFlashA.xy, db = vP - uFlashB.xy;
  float fl = uFlashA.z * exp(-dot(da, da) / 900.0) + uFlashB.z * exp(-dot(db, db) / 900.0);
  float lit = dens * 0.7 + facing * 0.22 + near * (0.3 + 0.45 * uBlaze) + fl * 0.6;
  vec3 c = lit > 0.86 ? uC3 : (lit > 0.6 ? uC2 : (lit > 0.4 ? uC1 : uC0));
  c = mix(c, uHot, clamp(fl - 0.4, 0.0, 1.0) * 0.3);
  // the eye: light in it, and on its rim
  float rimW = 3.0 + 0.1 * uEye, rim = exp(-(r - edge) * (r - edge) / (rimW * rimW)) * cover;
  vec3 light = uGlow * (rim * 0.45 + exp(-r * r / (uEye0 * uEye0 * 1.6)) * 0.13 * (uEye0 / max(uEye, uEye0))) * uStorm * (0.6 + 1.3 * uBlaze);
  vec4 o = vec4(c * alpha + light, alpha);
  if (o.a < 0.003 && max(o.r, max(o.g, o.b)) < 0.003) discard;
  gl_FragColor = o;
}`;

// ---- lightning: strips from point to point, turned to the camera
const BOLT_VS = /* glsl */`
attribute vec3 aA, aB;
attribute vec2 aInfo;        // x: how wide (metres), y: how bright
varying vec2 vB;
void main() {
  vec3 along = aB - aA;
  float len = max(length(along), 1e-4);
  along /= len;
  vec3 mid = mix(aA, aB, uv.y);
  vec3 side = normalize(cross(along, cameraPosition - mid) + vec3(1e-5));
  vec3 p = mid + side * position.x * aInfo.x + along * (uv.y * 2.0 - 1.0) * aInfo.x * 0.2;      // (a little past each end: the pieces join)
  vB = vec2(position.x * 2.0, aInfo.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const BOLT_FS = /* glsl */`
uniform vec3 uC, uHot;
varying vec2 vB;
void main() {
  float across = 1.0 - abs(vB.x);
  float s = across * across * vB.y;
  if (s < 0.004) discard;
  gl_FragColor = vec4(mix(uC, uHot, smoothstep(0.55, 0.85, across)) * s, s);
}`;

// ---- the shafts of light through the eye: each a strip from the eye's rim to the ground, turned to the camera
const RAY_VS = /* glsl */`
attribute vec3 aTop, aFoot;
attribute vec4 aRay;         // x: how wide at its top, y: at its foot (metres), z: its own dice, w: how strong
varying vec3 vR;
void main() {
  vec3 along = normalize(aFoot - aTop);
  vec3 mid = mix(aTop, aFoot, uv.y);
  vec4 w = modelMatrix * vec4(mid, 1.0);
  vec3 side = normalize(cross(along, cameraPosition - w.xyz) + vec3(1e-5));
  w.xyz += side * position.x * mix(aRay.x, aRay.y, uv.y);
  vR = vec3(position.x * 2.0, uv.y, aRay.z + aRay.w * 10.0);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RAY_FS = /* glsl */`
${NOISE}
uniform vec3 uC;
uniform float uA, uT;
varying vec3 vR;
void main() {
  float dice = fract(vR.z), strong = floor(vR.z) / 10.0 + 0.0;
  float across = 1.0 - abs(vR.x);
  float shimmer = 0.72 + 0.28 * noise2(vec2(vR.x * 2.5 + dice * 9.0, vR.y * 3.0 - uT * 0.35 + dice * 5.0));
  float s = across * across * smoothstep(0.0, 0.12, vR.y) * (1.0 - smoothstep(0.7, 1.0, vR.y)) * shimmer * uA * (0.5 + 0.5 * strong);
  if (s < 0.003) discard;
  gl_FragColor = vec4(uC * s, s);
}`;

const additive = extra => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, ...extra });
// (laid over what is behind, the light in it added: premultiplied)
const over = extra => ({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true, ...extra });

export function createStormSky({ far = '#d6e8ef', seed = 1, look = STORM_LOOK } = {}) {
  const rng = mulberry32(seed * 331 + 17);
  const B = BOSS_MOVES.skybeam, K = STORM_SKY;
  const object = new THREE.Group(); object.name = 'storm_sky';
  const rays = new THREE.Group(); rays.name = 'storm_sky_rays';
  const T = { value: 0 };
  const FAR = col(far);

  // ---- the dome
  const domeMat = new THREE.ShaderMaterial({ vertexShader: DOME_VS, fragmentShader: DOME_FS, side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uZenith: { value: col(look.day.zenith) }, uMid: { value: col(look.day.mid) }, uHorizon: { value: FAR.clone() }, uWisp: { value: col(look.wisp) }, uGold: { value: 0 }, uT: T } });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), domeMat);
  dome.frustumCulled = false; dome.renderOrder = -10;
  const sky = { day: [col(look.day.zenith), col(look.day.mid)], storm: [col(look.storm.zenith), col(look.storm.mid)], gold: [col(look.gold.zenith), col(look.gold.mid)] };

  // ---- the cloud
  const cloudMat = new THREE.ShaderMaterial({ vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, ...over({ side: THREE.DoubleSide, depthTest: false }),
    uniforms: { uStorm: { value: 0 }, uEye: { value: K.eye }, uEye0: { value: K.eye }, uSpin: { value: 0 }, uBlaze: { value: 0 }, uReach: { value: K.reach },
      uC0: { value: col(look.cloud[0]) }, uC1: { value: col(look.cloud[1]) }, uC2: { value: col(look.cloud[2]) }, uC3: { value: col(look.cloud[3]) },
      uGlow: { value: col(look.eye) }, uHot: { value: col(look.hot) }, uFlashA: { value: new THREE.Vector3() }, uFlashB: { value: new THREE.Vector3() } } });
  const cloud = new THREE.Mesh(new THREE.CircleGeometry(K.reach, 96).rotateX(-Math.PI / 2), cloudMat);
  cloud.frustumCulled = false; cloud.renderOrder = -9; cloud.visible = false;

  // ---- lightning: up to SLOTS bolts at once, each PIECES strips
  const SLOTS = 4, PIECES = 22, MAXB = SLOTS * PIECES;
  const bg = new THREE.InstancedBufferGeometry();
  { const quad = new THREE.PlaneGeometry(1, 1); bg.setIndex(quad.index); bg.setAttribute('position', quad.attributes.position); bg.setAttribute('uv', quad.attributes.uv); }
  const bA = new Float32Array(MAXB * 3), bB = new Float32Array(MAXB * 3), bInfo = new Float32Array(MAXB * 2);
  bg.setAttribute('aA', new THREE.InstancedBufferAttribute(bA, 3).setUsage(THREE.DynamicDrawUsage));
  bg.setAttribute('aB', new THREE.InstancedBufferAttribute(bB, 3).setUsage(THREE.DynamicDrawUsage));
  bg.setAttribute('aInfo', new THREE.InstancedBufferAttribute(bInfo, 2).setUsage(THREE.DynamicDrawUsage));
  bg.instanceCount = 0;
  const boltMat = new THREE.ShaderMaterial({ vertexShader: BOLT_VS, fragmentShader: BOLT_FS, ...additive({ depthTest: false, side: THREE.DoubleSide }),
    uniforms: { uC: { value: col(look.bolt) }, uHot: { value: col(look.boltHot) } } });
  const boltMesh = new THREE.Mesh(bg, boltMat);
  boltMesh.frustumCulled = false; boltMesh.renderOrder = -8; boltMesh.visible = false;
  object.add(dome, cloud, boltMesh);
  const bolts = [];                 // { pieces: [[ax, ay, az, bx, by, bz, width]], age, life, at: [x, z] }

  // ---- the shafts of light: fixed round the eye, more of them behind the plant than before it
  const RAYS = 8;
  const rg = new THREE.InstancedBufferGeometry();
  { const quad = new THREE.PlaneGeometry(1, 1); rg.setIndex(quad.index); rg.setAttribute('position', quad.attributes.position); rg.setAttribute('uv', quad.attributes.uv); }
  {
    const top = [], foot = [], info = [];
    for (let i = 0; i < RAYS; i++) {
      // round the back and the sides of it (it faces +z): from the eye's rim down and out
      const a = Math.PI * (0.62 + (i + 0.5 * rng()) / RAYS * 1.76), ar = K.eye * (0.45 + 0.4 * rng()), fr = 20 + rng() * 22;
      top.push(Math.sin(a) * ar, K.height + 4, Math.cos(a) * ar); foot.push(Math.sin(a) * fr, -1, Math.cos(a) * fr);
      info.push(2.2 + rng() * 1.6, 5 + rng() * 5, rng() * 0.99, 0.5 + 0.5 * rng());
    }
    rg.setAttribute('aTop', new THREE.InstancedBufferAttribute(new Float32Array(top), 3));
    rg.setAttribute('aFoot', new THREE.InstancedBufferAttribute(new Float32Array(foot), 3));
    rg.setAttribute('aRay', new THREE.InstancedBufferAttribute(new Float32Array(info), 4));
    rg.instanceCount = RAYS;
  }
  const rayMat = new THREE.ShaderMaterial({ vertexShader: RAY_VS, fragmentShader: RAY_FS, ...additive({ side: THREE.DoubleSide }), uniforms: { uC: { value: col(look.ray) }, uA: { value: 0 }, uT: T } });
  const rayMesh = new THREE.Mesh(rg, rayMat);
  rayMesh.frustumCulled = false; rayMesh.renderOrder = 2; rayMesh.visible = false;
  rays.add(rayMesh);

  // ---- when the lightning comes down (seconds into the move), how many bolts at once
  const STRIKES = [[B.dusk + 0.5, 1], [B.sky + 0.15, 1], [B.sky + 0.62, 1], [B.helix + 0.75, 2], [B.up + 0.08, 1], [B.up + 0.38, 1], [B.fire + 0.12, 2], [B.fire + 0.46, 1], [B.hit, 3], [B.hit + 0.32, 2], [B.hit + 0.72, 1]];
  const me = { object, rays, light: new THREE.Vector3(1, 1, 1), storm: 0, shake: 0, busy: false, update, dispose };
  const foot0 = new THREE.Vector3(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  const flashes = [{ x: 0, z: 0, k: 0 }, { x: 0, z: 0, k: 0 }];
  let last = -1, fired = {}, spin = 0, thunder = 0, flash = 0, flashSlot = 0;

  // a bolt: from the cloud down, in jagged pieces, one arm off it; beyond the plant as the camera sees it, so it is in the picture
  function strike(camera) {
    camera.getWorldDirection(fwd); fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const a = Math.atan2(fwd.x, fwd.z) + (rng() - 0.5) * 2.3, far = 34 + rng() * 80;
    const x0 = Math.sin(a) * far, z0 = Math.cos(a) * far;
    const toGround = rng() < 0.6, y1 = toGround ? 0 : K.height * (0.3 + 0.3 * rng());
    const drift = [(rng() - 0.5) * 16, (rng() - 0.5) * 16], N = 13, pieces = [];
    let px = x0, py = K.height, pz = z0;
    let branchAt = 3 + Math.floor(rng() * 5);
    for (let i = 1; i <= N; i++) {
      const u = i / N, jag = (1 - 0.5 * u) * 5;
      const nx = x0 + drift[0] * u + (rng() - 0.5) * jag, ny = K.height + (y1 - K.height) * u, nz = z0 + drift[1] * u + (rng() - 0.5) * jag;
      pieces.push([px, py, pz, nx, ny, nz, 1.5 - 0.7 * u]);
      if (i === branchAt) {
        // an arm: off to one side, shorter and thinner
        let bx = nx, by = ny, bz = nz;
        const dir = [(rng() - 0.5) * 2, (rng() - 0.5) * 2];
        for (let j = 1; j <= 5; j++) {
          const ex = bx + dir[0] * 3.5 + (rng() - 0.5) * 3, ey = by - 2.2 - rng() * 2, ez = bz + dir[1] * 3.5 + (rng() - 0.5) * 3;
          pieces.push([bx, by, bz, ex, ey, ez, 0.8 - 0.1 * j]);
          bx = ex; by = ey; bz = ez;
        }
      }
      px = nx; py = ny; pz = nz;
    }
    if (bolts.length >= SLOTS) bolts.shift();
    bolts.push({ pieces, age: 0, life: 0.3 + rng() * 0.12 });
    const f = flashes[flashSlot++ % 2]; f.x = x0; f.z = z0; f.k = 1;
    thunder = Math.max(thunder, 0.35 + 0.25 * rng()); flash = 1;
  }
  // a bolt's light over its life: it comes, flickers twice, and goes
  const flicker = k => (k < 0.12 ? 1 : k < 0.22 ? 0.25 : k < 0.5 ? 0.9 : k < 0.6 ? 0.4 : Math.max(0, 1 - (k - 0.6) / 0.4) * 0.8);

  function update(dt, camera, foot, t) {
    T.value += dt;
    if (foot) foot0.copy(foot);
    const on = t >= 0;
    if (on && (last < 0 || t < last)) { fired = {}; spin = 0; }                    // a new one
    last = on ? t : -1;
    const tt = on ? t : 99;
    // how far into each of it
    const storm = on ? pulse(tt, B.dusk, B.sky + 0.6, B.fade + 0.3, B.calm + 0.75) : 0;
    const blaze = on ? Math.max(0.5 * sstep(B.up, B.hit, tt) * (tt < B.hit ? 1 : 0), pulse(tt, B.hit - 0.02, B.hit + 0.05, B.fade - 0.1, B.fade + 0.5)) : 0;
    const open = on ? sstep(B.hit + 0.45, B.calm + 0.35, tt) : 0;
    const gold = on ? pulse(tt, B.fade - 0.2, B.calm + 0.5, B.length - 1.5, B.length - 0.05) : 0;
    me.storm = storm;
    spin += dt * (0.25 + 0.55 * storm + 1.1 * sstep(B.up, B.hit, tt) * (1 - open) + 2.5 * open * (1 - open));

    // lightning: as its times come; each bolt lives a moment
    if (on) for (const [when, n] of STRIKES) if (tt >= when && !fired[when]) { fired[when] = true; for (let i = 0; i < n; i++) strike(camera); }
    let nb = 0, any = 0;
    for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].age += dt; if (bolts[i].age >= bolts[i].life) bolts.splice(i, 1); }
    for (const b of bolts) {
      const k = flicker(b.age / b.life); any = Math.max(any, k);
      for (const [ax, ay, az, bx, by, bz, w] of b.pieces) {
        if (nb >= MAXB) break;
        bA.set([foot0.x + ax, foot0.y + ay, foot0.z + az], nb * 3); bB.set([foot0.x + bx, foot0.y + by, foot0.z + bz], nb * 3);
        bInfo[nb * 2] = w; bInfo[nb * 2 + 1] = k; nb++;
      }
    }
    bg.instanceCount = nb; boltMesh.visible = nb > 0;
    if (nb) for (const name of ['aA', 'aB', 'aInfo']) bg.attributes[name].needsUpdate = true;
    for (const f of flashes) f.k = Math.max(0, f.k - dt * 3.2);
    flash = Math.max(0, flash - dt * 5); thunder = Math.max(0, thunder - dt * 1.8);
    const lit = Math.max(flash * 0.7, any * 0.6);

    // the land's light: the storm's dark; warmer and lighter while the light stands on the plant; lightning; the gold after
    const L = look.light, l = me.light.set(1, 1, 1);
    l.lerp(tmp.set(...L.storm), storm).lerp(tmp.set(...L.blaze), blaze * storm * 0.75).lerp(tmp.set(...L.gold), gold * (1 - storm));
    l.x += L.bolt[0] * lit * storm; l.y += L.bolt[1] * lit * storm; l.z += L.bolt[2] * lit * storm;

    // the dome: the day's, the storm's, the gold's; its horizon the land's haze, lit as the land is
    const U = domeMat.uniforms, g = gold * (1 - storm);
    U.uZenith.value.copy(sky.day[0]).lerp(sky.storm[0], storm).lerp(sky.gold[0], g);
    U.uMid.value.copy(sky.day[1]).lerp(sky.storm[1], storm).lerp(sky.gold[1], g);
    U.uHorizon.value.set(FAR.r * l.x, FAR.g * l.y, FAR.b * l.z);
    U.uGold.value = g;
    dome.position.copy(camera.position);

    // the cloud: gathering, winding, its eye blown open at the end
    const C = cloudMat.uniforms;
    cloud.visible = storm > 0.003;
    cloud.position.set(foot0.x, foot0.y + K.height, foot0.z);
    C.uStorm.value = storm; C.uSpin.value = spin; C.uBlaze.value = blaze;
    C.uEye.value = K.eye * (1 + 0.12 * Math.sin(T.value * 2.3) * storm) + open * open * K.reach * 1.15;
    C.uFlashA.value.set(flashes[0].x, flashes[0].z, flashes[0].k); C.uFlashB.value.set(flashes[1].x, flashes[1].z, flashes[1].k);

    // the shafts: once the circles are open in the sky, until the cloud is blown open
    const shafts = on ? pulse(tt, B.sky + 0.2, B.sky + 1.0, B.hit + 0.5, B.fade + 0.2) : 0;
    rayMesh.visible = shafts > 0.003;
    rayMat.uniforms.uA.value = shafts * (0.2 + 0.16 * blaze);
    rays.position.copy(foot0);

    me.shake = thunder * storm;
    me.busy = on && (storm > 0.003 || gold > 0.003 || bolts.length > 0);
  }
  function dispose() { dome.geometry.dispose(); domeMat.dispose(); cloud.geometry.dispose(); cloudMat.dispose(); bg.dispose(); boltMat.dispose(); rg.dispose(); rayMat.dispose(); }
  return me;
}
