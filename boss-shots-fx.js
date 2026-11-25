/* ==========================================================================
   boss-shots-fx.js  —  what the plant boss's straight shots look like (boss-shots.js says where they are): the right
   head's thorned dart, the middle head's ball of pollen, the left head's balls of venom; each gathering in its head's
   mouth first, the moment she should parry it, thrown back at its head wrapped in her magic, and where it bursts. One
   job: draw them. It decides nothing.

     const fx = createBossShotsFx({ seed })
     scene.add(fx.solid)        the darts (solid, lit as the boss's thicket is): in the land's scene
     fxScene.add(fx.object)     the light: balls, streaks, motes, flashes (drawn after the land, as her spells are)
     fx.charge(head, kind, lead, mouth)   a shot gathers in a head's mouth for `lead` seconds; mouth(): where that mouth is now
                                          (lead 0: it stops: the head went down)
     fx.launch(shot), fx.place(shot)      it leaves the mouth; every frame it flies (shot: boss-shots.js': pos, way, kind,
                                          back, now, spin)
     fx.reflect(shot, at)                 the parry has thrown it back from `at`
     fx.burst(shot, at, where)            it is over: where 'her' (it struck her), 'head' (thrown back, it struck its head),
                                          'ground' (it missed), 'gone' (taken away)
     fx.update(dt, camera)                every frame
     fx.setNight(on)                      by night its light is let shine more
     fx.shake                             0..1: how hard a burst on a head jolts (the page's camera)

   The look (SHOTS_LOOK):
     - the dart: a piece of the thicket's own thorned vine (thicket-fx.js' vines, laid with its vineBuilder: one design for
       every thorn in the game, 25 Nov 2026), its point ahead, turning about its length as it flies; a green streak
       behind it and bits of leaf shed
     - the pollen: a big soft golden ball, its rim ragged as fur, darker grains turning in it, a warm haze round it, and
       pollen shed behind it in a drifting trail
     - the venom: the poison rain's colours (poison-rain-fx.js' POISON_LOOK): a ball of lime and deep green with a dark
       rim, a green streak behind it, drops shed
     - the moment to parry (`now`, boss-shots.js: it will reach her within the parry's window): a white rim flares round
       it and a four-pointed glint beats on it, quick, so it reads at a glance from behind her
     - thrown back: wrapped in her magic's cyan (the lance's circle's, magic-combo-fx.js' LANCE_LOOK): a white heart, a
       cyan rim and streak, cyan sparkles shed; faster
     - bursts: the shot's own stuff thrown out (thorn bits, a cloud of pollen, a splash of venom), with a flash; on a
       head, her cyan with it
   How it is drawn: balls, glints and flashes are one instanced square each (all of them one draw call), worked out by
   its shader; streaks, motes and sparks one more; the darts two (the thicket's mesh and its outline). Phone-safe
   shaders: no arrays, no loops.
   ========================================================================== */
import * as THREE from 'three';
import { _fx, THICKET_LOOK } from './thicket-fx.js';
import { POISON_LOOK } from './poison-rain-fx.js';
import { mulberry32 } from './stylized-nature.js';

const { makeVines, vineBuilder, makePool, SPARK_VS, SPARK_FS } = _fx;
const rgb = h => new THREE.Color().setHex(parseInt(h.slice(1), 16), THREE.LinearSRGBColorSpace);
const vec = h => { const c = rgb(h); return new THREE.Vector3(c.r, c.g, c.b); };

export const SHOTS_LOOK = {
  seed: { heart: '#f1ffd6', body: '#7fc23a', deep: '#2f5d1c', streak: '#a6e05a' },
  pollen: { heart: '#fff8cf', body: '#ffcf45', deep: '#c9851a', grain: '#a86412', streak: '#ffe07a' },
  venom: { heart: POISON_LOOK.ball[3], body: POISON_LOOK.ball[2], deep: POISON_LOOK.ball[0], streak: POISON_LOOK.trail[1] },      // the poison rain's
  her: { heart: '#f6fffe', body: '#62ebf5', deep: '#1f86d8' },        // her magic (the lance's circle's cyan)
};
const KIND = { venom: 0, pollen: 1, seed: 2 };
const SIZE = { seed: 0.3, pollen: 0.58, venom: 0.36 };             // a ball's radius (m); the seed's is its glow

// ---- balls, glints, flashes: a square turned to the camera, all of it in its shader
const ORB_VS = /* glsl */`
attribute vec3 aPos;
attribute vec4 aSize;        // x: radius (m), y: how much shows 0..1, z: 'now' (the glint) 0..1, w: thrown back 0..1
attribute vec4 aInfo;        // x: kind (0 venom, 1 pollen, 2 seed's glow, 3 a flash), y: dice, z: age (s), w: turned
varying vec2 vP;
varying vec4 vS, vI;
void main() {
  vS = aSize; vI = aInfo;
  vP = position.xy * 3.2;                                   // (the square reaches 1.6 radii each way: the glint's rays, the haze)
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float c = cos(aInfo.w), s = sin(aInfo.w);
  vec2 q = position.xy * 3.2 * aSize.x;
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  mv.z += aSize.x * 0.6;                                     // (a little toward the camera: not cut by what it passes)
  gl_Position = projectionMatrix * mv;
}`;
const ORB_FS = /* glsl */`
uniform float uTime, uNight;
uniform vec3 uV0, uV1, uV2, uP0, uP1, uP2, uP3, uS0, uS1, uS2, uH0, uH1, uH2;
varying vec2 vP;
varying vec4 vS, vI;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 p = vP;
  float d = length(p), a = atan(p.y, p.x), kind = vI.x, dice = vI.y, age = vI.z;
  float show = vS.y, now = vS.z, back = vS.w;
  vec3 col = vec3(0.0); float al = 0.0, glow = 0.0;
  vec3 h0 = uV0, h1 = uV1, h2 = uV2;
  if (kind > 0.5 && kind < 1.5) { h0 = uP0; h1 = uP1; h2 = uP2; }
  if (kind > 1.5 && kind < 2.5) { h0 = uS0; h1 = uS1; h2 = uS2; }
  // thrown back: her cyan
  h0 = mix(h0, uH0, back); h1 = mix(h1, uH1, back); h2 = mix(h2, uH2, back);
  float fw = max(fwidth(d), 0.002);
  if (kind < 1.5) {
    // a ball: its rim wobbles (venom) or is ragged as fur (pollen); lit from above-left as the kit is
    // (pollen: fur, strands of it standing out all round, no two alike, stirring; soft at their tips)
    float fur = 0.1 * (noise(vec2(a * 9.0 + dice * 9.0, age * 1.7)) - 0.5) + 0.07 * (noise(vec2(a * 23.0 - dice * 5.0, age * 2.3)) - 0.5) + 0.045 * (noise(vec2(a * 51.0, dice * 3.0)) - 0.5);
    float rim = 1.0 + (kind < 0.5 ? 0.05 * sin(a * 3.0 + age * 9.0 + dice * 6.0) : fur);
    float soft = kind < 0.5 ? fw * 1.5 : 0.07;
    float inside = 1.0 - smoothstep(rim - soft, rim + soft, d);
    vec2 lp = p - vec2(-0.32, 0.36);
    float lit = smoothstep(1.25, 0.2, length(lp));
    vec3 body = mix(h2, h1, smoothstep(0.98, 0.45, d));
    body = mix(body, h0, smoothstep(0.55, 0.0, length(lp * 1.25)) * 0.9);
    if (kind > 0.5) {                                        // pollen: darker grains turning in it
      float g = noise(vec2(a * 2.2 + age * 1.6, d * 5.0 - age * 0.8) + dice * 7.0);
      body = mix(body, uP3, smoothstep(0.62, 0.75, g) * 0.55 * smoothstep(0.95, 0.4, d));
    } else {                                                 // venom: bubbles in it
      float b = noise(p * 4.0 + vec2(0.0, -age * 2.0) + dice * 5.0);
      body = mix(body, h0, smoothstep(0.7, 0.78, b) * 0.5 * smoothstep(0.95, 0.3, d));
    }
    body = mix(body, h2 * 0.55, smoothstep(rim - 0.16, rim - 0.02, d) * (1.0 - back * 0.6) * (kind > 0.5 ? 0.45 : 1.0));      // its dark rim (pollen: faint; her cyan: a light one)
    body = mix(body, vec3(1.0), back * smoothstep(0.5, 0.0, d) * 0.8);
    col = body * (0.82 + 0.25 * lit);
    al = inside;
    // a haze round it (adds), gone well inside the square's edge
    glow = (1.0 - inside) * exp(-max(d - rim, 0.0) * (kind > 0.5 ? 3.0 : 4.0)) * (kind > 0.5 ? 0.5 : 0.42) * (1.0 - smoothstep(1.15, 1.5, d));
  } else if (kind < 2.5) {
    // the seed's glow: a hot point the dart flies behind
    glow = exp(-d * 2.6) * 0.8 * (1.0 - smoothstep(1.2, 1.55, d)); al = 0.0;
  } else {
    // a flash: a white heart, a ring going out
    float k = clamp(age / max(dice, 0.01), 0.0, 1.0);
    float ring = smoothstep(0.07, 0.0, abs(d - mix(0.35, 1.45, sqrt(k)))) * (1.0 - k) * (1.0 - k);
    glow = (exp(-d * 3.0) * (1.0 - k) * 1.3 + ring * 0.8) * (1.0 - smoothstep(1.4, 1.58, d));
    al = 0.0;
  }
  vec3 gc = mix(h1, h0, 0.4);
  // the moment to parry: a white rim flares round it and a four-pointed glint beats on it
  if (now > 0.0) {
    float beat = 0.55 + 0.45 * sin(uTime * 34.0);
    float ring = smoothstep(0.09, 0.0, abs(d - 1.22)) * now * beat;
    float star = (smoothstep(0.07, 0.0, abs(p.x)) + smoothstep(0.07, 0.0, abs(p.y))) * smoothstep(1.6, 0.4, d) * now * beat;
    glow += ring * 1.3 + star * 0.9;
    gc = mix(gc, vec3(1.0), clamp(ring + star, 0.0, 1.0));
  }
  float g = glow * show * (1.0 + 0.6 * uNight);
  al *= show;
  gl_FragColor = vec4(col * al + gc * g, al);
  if (gl_FragColor.a <= 0.002 && g <= 0.002) discard;
}`;
const BLEND = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation };

export function createBossShotsFx({ seed = 9 } = {}) {
  const rng = mulberry32(seed * 977 + 3);
  const object = new THREE.Group(); object.name = 'boss_shots_fx'; object.renderOrder = 100;
  const solid = new THREE.Group(); solid.name = 'boss_shots_darts';
  const L = SHOTS_LOOK;
  const T = { value: 0 }, night = { value: 0 };

  // ---- balls, glints and flashes: one pool
  const orbMat = new THREE.ShaderMaterial({
    vertexShader: ORB_VS, fragmentShader: ORB_FS, transparent: true, depthWrite: false, depthTest: true, forceSinglePass: true, ...BLEND,
    uniforms: { uTime: T, uNight: night,
      uV0: { value: vec(L.venom.heart) }, uV1: { value: vec(L.venom.body) }, uV2: { value: vec(L.venom.deep) },
      uP0: { value: vec(L.pollen.heart) }, uP1: { value: vec(L.pollen.body) }, uP2: { value: vec(L.pollen.deep) }, uP3: { value: vec(L.pollen.grain) },
      uS0: { value: vec(L.seed.heart) }, uS1: { value: vec(L.seed.body) }, uS2: { value: vec(L.seed.deep) },
      uH0: { value: vec(L.her.heart) }, uH1: { value: vec(L.her.body) }, uH2: { value: vec(L.her.deep) } },
  });
  orbMat.userData.noGrade = true;
  const orbs = makePool(64, { aPos: 3, aSize: 4, aInfo: 4 }, orbMat);
  orbs.mesh.renderOrder = 3;
  // ---- streaks, motes, sparks: the thicket's sparks (added on)
  const sparkMat = new THREE.ShaderMaterial({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, transparent: true, depthWrite: false, forceSinglePass: true,
    blending: THREE.AdditiveBlending });
  sparkMat.userData.noGrade = true;
  const sparks = makePool(700, { aPos: 3, aVel: 3, aInfo: 4 }, sparkMat);
  sparks.mesh.renderOrder = 2;
  object.add(sparks.mesh, orbs.mesh);

  // ---- the darts: the thicket's own thorned vines
  const MAX_DARTS = 6;
  const V = makeVines(MAX_DARTS, rng, THICKET_LOOK);
  const build = vineBuilder(V);
  V.line.uniforms.uWidth.value = 0.02;
  solid.add(V.outline, V.mesh);
  const darts = new Array(MAX_DARTS).fill(null);
  const under = { foot: new THREE.Vector3(0, -60, 0) };
  for (let i = 0; i < MAX_DARTS; i++) build(i, under, 0, 0, 0, 1);
  V.geometry.attributes.position.needsUpdate = true;
  const DART = { len: 1.3, thick: 0.075, K: 0.34 };

  const col3 = h => { const c = rgb(h); return [c.r, c.g, c.b]; };
  const C = {
    seed: col3(L.seed.streak), pollen: col3(L.pollen.streak), venom: col3(L.venom.streak), her: col3(L.her.body), herHeart: col3(L.her.heart),
    seedDeep: col3(L.seed.deep), pollenDeep: col3(L.pollen.deep), venomDeep: col3(L.venom.deep), white: [1, 1, 0.92],
  };
  // things that live a while: { p, v, size, life, age, col, drag, fall }
  const loose = [];
  function spark(p, v, size, life, c, drag = 1.5, fall = 3) {
    if (loose.length >= 640) loose.shift();
    loose.push({ p: p.clone(), v: v.clone(), size, life, age: 0, col: c, drag, fall });
  }
  const flashes = [];
  function flash(p, size, life, kind, back = 0) { if (flashes.length >= 12) flashes.shift(); flashes.push({ p: p.clone(), size, life, age: 0, kind, back }); }
  const charges = new Map();                 // head -> { kind, lead, t, mouth }
  const live = new Map();                    // shot id -> { shot, dart (index) }
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), side = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const rnd = (a = 1) => (rng() - 0.5) * 2 * a;
  let shake = 0;

  function charge(head, kind, lead, mouth) {
    if (!lead || !mouth) { charges.delete(head); return; }
    charges.set(head, { kind, lead, t: 0, mouth });
  }
  function launch(s) {
    charges.delete(s.head);
    const e = { shot: s, dart: -1 };
    if (s.kind === 'seed') { const i = darts.indexOf(null); if (i >= 0) { darts[i] = s; e.dart = i; } }
    live.set(s.id, e);
    // a puff out of the mouth: its stuff thrown after it, a flash
    const c = C[s.kind];
    for (let k = 0; k < 10; k++) spark(s.pos, tmp.copy(s.way).multiplyScalar(4 + rng() * 6).add(tmp2.set(rnd(2.5), rnd(2) + 0.5, rnd(2.5))), 0.05 + rng() * 0.05, 0.25 + rng() * 0.25, c);
    flash(s.pos, SIZE[s.kind] * 1.6, 0.18, s.kind);
  }
  function reflect(s, at) {
    // a burst of her cyan where it was taken (the circle draws its own flare), its own stuff knocked off it
    for (let k = 0; k < 16; k++) spark(at, tmp.copy(s.way).multiplyScalar(3 + rng() * 5).add(tmp2.set(rnd(4), rnd(3) + 1, rnd(4))), 0.05 + rng() * 0.06, 0.3 + rng() * 0.3, k % 2 ? C.her : C[s.kind]);
    flash(at, 0.45, 0.16, s.kind, 1);                                  // (small: the circle's own flare is the big one)
  }
  function burst(s, at, where) {
    const e = live.get(s.id);
    if (e && e.dart >= 0) { build(e.dart, under, 0, 0, 0, 1); darts[e.dart] = null; V.geometry.attributes.position.needsUpdate = true; }
    live.delete(s.id);
    if (where === 'gone') return;
    const back = s.back ? 1 : 0, big = s.kind === 'pollen' ? 1.6 : 1, c = back ? C.her : C[s.kind], deep = C[s.kind + 'Deep'];
    const n = where === 'head' ? 34 : where === 'her' ? 22 : 16;
    for (let k = 0; k < n; k++) {
      const v = tmp.set(rnd(1), rnd(1) * 0.6 + 0.6, rnd(1)).normalize().multiplyScalar((3 + rng() * 6) * big);
      spark(at, v, (0.05 + rng() * 0.07) * big, 0.35 + rng() * 0.5, k % 3 === 0 ? deep : c, 2.0, 6);
    }
    if (where === 'head') { for (let k = 0; k < 18; k++) spark(at, tmp.set(rnd(1), rnd(1), rnd(1)).normalize().multiplyScalar(5 + rng() * 7), 0.06 + rng() * 0.05, 0.4 + rng() * 0.3, k % 2 ? C.her : C.herHeart, 2.2, 2); shake = Math.max(shake, 0.6); }
    if (s.kind === 'pollen') for (let k = 0; k < 26; k++) spark(at, tmp.set(rnd(1), rnd(1) * 0.5 + 0.3, rnd(1)).normalize().multiplyScalar(1 + rng() * 3), 0.07 + rng() * 0.07, 0.9 + rng() * 0.8, C.pollen, 3.5, -0.4);
    flash(at, (where === 'head' ? 1.2 : where === 'her' ? 0.45 : 0.7) * big, where === 'head' ? 0.32 : 0.2, s.kind, back);
  }

  // ---- every frame: what is in flight, gathering, loose
  const dartSpec = { foot: new THREE.Vector3(), plane: new THREE.Vector3(), side: new THREE.Vector3(), len: 1, thick: 0.07, lean: 0, curl: 0.18, wig: 0, sway: 0, swayW: 0, ph: 0, spear: true };
  function update(dt, camera) {
    T.value += dt;
    shake = Math.max(0, shake - dt * 3);
    const o = orbs.arrays, sp = sparks.arrays;
    let no = 0, ns = 0;
    const orb = (p, r, show, now, back, kind, dice, age, turn = 0) => {
      if (no >= orbs.max) return;
      o.aPos.set([p.x, p.y, p.z], no * 3); o.aSize.set([r, show, now, back], no * 4); o.aInfo.set([kind, dice, age, turn], no * 4); no++;
    };
    const streak = (p, v, w, c, k = 1) => {
      if (ns >= sparks.max) return;
      sp.aPos.set([p.x, p.y, p.z], ns * 3); sp.aVel.set([v.x, v.y, v.z], ns * 3); sp.aInfo.set([c[0] * k, c[1] * k, c[2] * k, w], ns * 4); ns++;
    };
    // gathering in the mouths
    for (const [head, g] of charges) {
      g.t += dt;
      const m = g.mouth(), k = Math.min(1, g.t / g.lead);
      if (g.kind === 'pollen') {
        orb(m, SIZE.pollen * (0.15 + 0.85 * k * k), Math.min(1, g.t / 0.15), 0, 0, KIND.pollen, head * 0.3, T.value);
        if (rng() < dt * 40) { const a = rng() * 6.28, r = 1.2 + rng() * 0.8; spark(tmp.set(m.x + Math.cos(a) * r, m.y + rnd(0.8), m.z + Math.sin(a) * r), tmp2.set(-Math.cos(a) * r * 2.4, 0, -Math.sin(a) * r * 2.4), 0.05, 0.42, C.pollen, 0, 0); }
      } else {
        orb(m, (g.kind === 'seed' ? 0.45 : 0.4) * (0.3 + 0.7 * k), Math.min(1, g.t / 0.1), 0, 0, g.kind === 'seed' ? KIND.seed : KIND.venom, head * 0.3, T.value);
        if (rng() < dt * 30) { const a = rng() * 6.28, r = 0.7 + rng() * 0.4; spark(tmp.set(m.x + Math.cos(a) * r, m.y + rnd(0.5), m.z + Math.sin(a) * r), tmp2.set(-Math.cos(a) * r * 3, 0, -Math.sin(a) * r * 3), 0.04, 0.25, C[g.kind], 0, 0); }
      }
      if (g.t > g.lead + 0.3) charges.delete(head);
    }
    // in flight
    for (const { shot: s, dart } of live.values()) {
      const back = s.back ? 1 : 0, now = s.back ? 0 : s.now || 0, c = back ? C.her : C[s.kind];
      const v = tmp.copy(s.way).multiplyScalar(s.speed);
      if (s.kind === 'seed') {
        // the dart: its point at the shot, its tail behind, turning about its length
        if (dart >= 0) {
          const L = DART.len, w = s.way;
          dartSpec.foot.copy(s.pos).addScaledVector(w, -L);
          const h = Math.hypot(w.x, w.z);
          if (h > 1e-4) dartSpec.plane.set(w.x / h, 0, w.z / h); else dartSpec.plane.set(1, 0, 0);
          dartSpec.lean = Math.atan2(h, w.y);
          side.set(dartSpec.plane.z, 0, -dartSpec.plane.x).applyAxisAngle(w, s.spin);
          dartSpec.side.copy(side);
          dartSpec.len = L; dartSpec.thick = DART.thick; dartSpec.ph = s.dice * 6;
          build(dart, dartSpec, 1, 0, T.value, DART.K);
        }
        orb(s.pos, 0.32, 1, now, back, KIND.seed, s.dice, s.age);
        streak(tmp2.copy(s.pos).addScaledVector(s.way, -1.0), v, 0.09, c, 0.9);
        if (rng() < dt * 22) spark(tmp2.copy(s.pos).addScaledVector(s.way, -0.6 - rng() * 0.6), tmp2.set(rnd(0.6), rnd(0.6), rnd(0.6)), 0.04, 0.3, back ? C.her : C.seedDeep, 2, 1);
      } else {
        const r = SIZE[s.kind] * (s.kind === 'pollen' ? 1 + 0.04 * Math.sin(s.age * 9) : 1);
        orb(s.pos, r, Math.min(1, s.age / 0.06 + 0.2), now, back, KIND[s.kind], s.dice, s.age, s.spin * 0.1);
        streak(tmp2.copy(s.pos).addScaledVector(s.way, -r * 1.6), v, r * (s.kind === 'pollen' ? 0.7 : 0.55), c, s.kind === 'pollen' ? 0.55 : 0.8);
        const shed = s.kind === 'pollen' ? 34 : 18;
        if (rng() < dt * shed) spark(tmp2.copy(s.pos).add(side.set(rnd(r), rnd(r), rnd(r))), side.set(rnd(0.5), rnd(0.5) + (s.kind === 'pollen' ? 0.2 : -0.5), rnd(0.5)), s.kind === 'pollen' ? 0.07 : 0.05, s.kind === 'pollen' ? 1.1 : 0.4, back ? C.her : c, s.kind === 'pollen' ? 2.5 : 1.5, s.kind === 'pollen' ? -0.2 : 4);
      }
      if (back && rng() < dt * 40) spark(tmp2.copy(s.pos).add(side.set(rnd(0.3), rnd(0.3), rnd(0.3))), side.set(rnd(1), rnd(1), rnd(1)), 0.05, 0.35, C.herHeart, 2, 0);
    }
    if (V.geometry.attributes.position) V.geometry.attributes.position.needsUpdate = true;
    // flashes
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.age += dt;
      if (f.age >= f.life) { flashes.splice(i, 1); continue; }
      orb(f.p, f.size, 1, 0, f.back, 3, f.life, f.age);
    }
    // loose: sparks, motes, pollen
    for (let i = loose.length - 1; i >= 0; i--) {
      const q = loose[i]; q.age += dt;
      if (q.age >= q.life) { loose.splice(i, 1); continue; }
      q.v.multiplyScalar(Math.exp(-q.drag * dt)); q.v.y -= q.fall * dt;
      q.p.addScaledVector(q.v, dt);
      const k = 1 - q.age / q.life;
      streak(q.p, q.v, q.size * (0.4 + 0.6 * k), q.col, Math.min(1, k * 1.6));
    }
    orbs.g.instanceCount = no; sparks.g.instanceCount = ns;
    for (const n of ['aPos', 'aSize', 'aInfo']) orbs.g.attributes[n].needsUpdate = true;
    for (const n of ['aPos', 'aVel', 'aInfo']) sparks.g.attributes[n].needsUpdate = true;
    object.visible = no + ns > 0;
  }

  return {
    object, solid, charge, launch, place() {}, reflect, burst, update,
    setNight(on) { night.value = on ? 1 : 0; },
    setSun(v) { V.material.uniforms.uSun.value.copy(v); },
    get shake() { return shake; },
    get busy() { return live.size + loose.length + flashes.length + charges.size > 0; },
    dispose() { orbMat.dispose(); sparkMat.dispose(); V.material.dispose(); V.line.dispose(); V.geometry.dispose(); orbs.g.dispose(); sparks.g.dispose(); },
  };
}
