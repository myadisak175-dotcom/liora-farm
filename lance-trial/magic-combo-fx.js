/* ==========================================================================
   magic-combo-fx.js  —  the light of Vivi's magic combo (magic-combo.js): an orb of light gathered in her hand and
   thrown, the ribbon it leaves, the wave a cut sends out, the burst where one lands, a few gold sparks. Sky blue with
   gold; made for this, not taken from her other spells. And the held cast's: a spear of ice and water thrown through
   a magic circle, in its own cyan (below). One job: draw them. It decides nothing: the combo says where.

     const fx = createMagicComboFx()
     scene.add(fx.object)             (a page that dims its land by night draws this after the dimming, as the circles)
     fx.glow(key, at, size)           light gathered at a hand: call it every frame it is there (key: any name, one glow
                                      each); a frame it is not called, it goes out
     fx.trail(key, at)                a ribbon through where a hand has been: call it every frame of a swing; it fades
                                      away behind by itself
     const shot = fx.shot(kind)       something thrown. kind 'orb' | 'big': an orb with a ribbon behind it, shedding a
                                      gold spark now and then; 'wave' | 'rise': the wave of a cut, a curved band of
                                      light seen from behind as a crescent (wave: leaning, as her cut came down; rise:
                                      standing, off an upward sweep); 'lance': a spear of ice and water, held in her
                                      hand while it grows and then thrown (the same one: far 0 while she holds it)
       shot.place(at, dir, far)       every frame: where it is (a lance: its point), the way it goes (unit), how far
                                      it has come (m)
       shot.size(level)               a lance: how grown it is (0..3); shot.long: its length now (m)
       shot.end(hit)                  it is over: it landed (the combo then asks for a burst) or ran out (it fades)
     const gate = fx.gate()           the magic circle a lance is thrown through: standing in the air, facing the way
                                      she aims
       gate.place(at, dir, radius)    every frame: its middle, the way it faces (unit), its outer ring's radius (m)
       gate.size(level)               how grown (0..3): each time more of it is drawn, and it beats once
       gate.fire()                    the lance goes through it: it flares, and all that is let go with the lance
                                      (THE LANCE, below); and it breaks up
       gate.end()                     nothing is thrown after all: it breaks up
     fx.burst(at, size, sea)          where one lands: a flash, a ring going out, gold sparks (sea: the lance's
                                      sparkles instead)
     fx.ring(at, radius)              a ring of light going out over the ground from `at` to `radius` (she lands a leap)
     fx.motes(at, n, from, sea)       n gold sparks (sea: the lance's sparkles) drawn in to `at` from `from` m away
                                      (light being gathered)
     fx.update(dt, camera)            every frame
     fx.setNight(on)                  by night its light is let shine more
     fx.dispose()

   THE LANCE, as in the clip it was asked after (22 Nov 2026: ten seconds made with Gemini, a spear of water shot out of
   a magic circle; asked which of her spells: "ใส่แทนอันเดิม", in place of what the lance had, and its light "แบบในคลิป
   เลย", as the clip's. What it had, a picture's thick beam, crescents of wind and petals of light, an hour old, is in
   the history). The clip takes ten seconds over it; here it is a move in a fight, so all of it is over in about one:
     - the circle (the gate): a thick rim with a thin ring inside it, a band of marks, a ring; inside that a diamond and
       a square across it, turning; the circle in the square and a small star turning the other way; a ring in the
       middle, which the lance goes through; two small seals standing on its rim and a comet of light running round
       outside it. Its face is washed blue, its lines glow, sparkles drift off it while it stands
     - the lance: an ornate spear of ice (a pommel, a thin shaft with a bead on it, a guard that is a tall thin spike
       across, and a barbed head), white down its middle; thrown, white hot, a blue flame along its shaft
     - let go: the circle's middle flares into a four-pointed star; slivers of ice are thrown out round its rim; a hoop
       of water goes out round the lance's line a little way on, spray torn off its rim, and thin hoops further on as
       it flies; a white-hot beam is left standing from the circle on for a moment
     - the wake: ribbons of water wound round the lance's way from the circle on, a double helix (two broad ones, two
       thin blue ones between them), turning; each place on one, once the lance has passed it, thins to a line and
       loosens until it is gone
     - sparkles: beads of light shed along its way, which drift and twinkle on a second after it has gone
   The clip's glow is laid over its whole picture (bloom), which a phone would pay for every frame; here each thing
   carries its own glow in its shader, so it is not as soft as the clip's.

   How it is drawn: light laid over the picture with one blend (what a thing covers hides what is behind it, its glow
   only adds), every material marked userData.noGrade (the light of the hour and the curse leave it alone). An orb, a
   glow, a burst: one square turned to the camera, all of it worked out by its shader. A ribbon: a strip through up to
   20 places, turned to the camera on the way (a lance: a strip of its own, its whole shape drawn on it by its shader;
   a ribbon of its wake: a strip laid along a helix worked out anew each frame). Sparks, sparkles and slivers: one
   instanced square each, moved by its shader. The gate and a hoop: one square each, all of it drawn by its shader (as
   magic-circle-fx.js draws the jump's circles, and by its rules for a phone's GPU: every line always drawn and then
   masked, nothing that can be NaN, the result kept between 0 and 1). Few of anything: 8 orbs, 4 waves, 3 lances (4
   ribbons of wake and a beam each), 4 hoops, 2 gates, 3 rings, 6 bursts, 10 ribbons, 192 sparks, 64 slivers at most.
   Phone-safe shaders: no arrays, no loops.
   ========================================================================== */
import * as THREE from 'three';

const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// the light: an orb's heart (near white), its body, the glow round it; the sparks
export const COMBO_LOOK = { core: '#f6fdff', main: '#74cfff', deep: '#2f8fe6', gold: '#ffd66e' };

const SHOTS = {
  orb: { size: 0.34, ribbon: 0.13, shed: 1.1 },          // the orb's own radius is about a third of its square's (m)
  big: { size: 0.95, ribbon: 0.3, shed: 0.7 },
  wave: { wide: 0.95, tall: 0.26, lean: -0.6 },         // half its width, half its height in the middle (m); radians it leans
  rise: { wide: 0.85, tall: 0.2, lean: Math.PI / 2 },
  lance: { long: [0.75, 1.05, 1.4, 1.8], wide: [0.12, 0.15, 0.19, 0.23] },      // by how grown it is: its length; half its strip's width (m: its guard's points reach 0.66 of that, its head's barbs 0.4)
};
// the held cast's own light (THE LANCE, above): white at its heart, the clip's cyan, a blue under it
export const LANCE_LOOK = { core: '#f6fffe', main: '#62ebf5', deep: '#1f86d8' };
const LANCE = 10;                                       // places along a lance
const RIBBON = 20, SPARKS = 192, SHARDS = 64;
// thrown, the lance is so much longer (and white hot); streak: s the streak of light behind it lasts
const FLIGHT = { long: 1.25, streak: 0.2 };
// the wake: ribbons of water wound round the lance's way from the circle on. places: along each; long: m of its way
// they lie along, from the circle on (nearer the far end they thin away); pitch: m to a turn; r: m from the way; near:
// m behind the lance's point over which they close in on it; wide: half a broad one's width (m); spin: rad/s the whole
// turns; life: s a place on one lasts once the lance has passed it, thinning to a line, further from the way by
// `swell` of its distance and wavering as it goes. strands: each one's place round the way (rad), and its distance,
// width and blue against a broad one's
const WAKE = { places: 96, long: 10, pitch: 2.4, r: 0.3, near: 1.6, wide: 0.085, spin: 7, life: 0.6, swell: 0.3,
  strands: [{ phase: 0, r: 1, wide: 1, blue: 0 }, { phase: Math.PI, r: 1, wide: 1, blue: 0 }, { phase: 1.9, r: 1.3, wide: 0.4, blue: 1 }, { phase: 1.9 + Math.PI, r: 1.3, wide: 0.4, blue: 1 }] };
// what a lance sheds on its way: a sparkle every so many m (and as many again at random)
const SHED = { sparkle: 0.3 };
// as it is let go:
//   beam: left standing from the circle on: places along it, m long at most, half its width (m), s it lasts
//   hoop: of water round the lance's line, spray torn off its rim: m past the circle, its radius at its widest (m), s
//   hoops: thin ones as it flies: one every so many m, so many at most, each so wide (m) and lasting so long (s)
//   shards, sparkles: slivers of ice thrown out round the circle's rim, sparkles thrown out of it
const LAUNCH = { beam: { places: 14, long: 9, wide: 0.1, life: 0.42 }, hoop: { ahead: 1.1, r: 0.8, life: 0.42 },
  hoops: { every: 5, most: 3, r: 0.55, life: 0.34 }, shards: 22, sparkles: 26 };
// the gate: its square reaches so many radii (its flare's rays and its comet stand out past its rim); it opens in `open`
// s, beats `beat` s as it grows, and after the lance has gone through flares and is gone in `fire` s (nothing thrown:
// in `end` s); dust: s between the sparkles that drift off it while it stands
const GATE = { reach: 1.7, open: 0.3, beat: 0.22, fire: 0.5, end: 0.2, dust: 0.06 };
const BLEND = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation };

const FACING = /* glsl */`
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }`;

export function createMagicComboFx({ seed = 7 } = {}) {
  const object = new THREE.Group();
  object.name = 'magicComboFx';
  let s0 = seed >>> 0;
  const rand = () => { s0 = (s0 + 0x6d2b79f5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const colours = { uCore: { value: rgb(COMBO_LOOK.core) }, uMain: { value: rgb(COMBO_LOOK.main) }, uDeep: { value: rgb(COMBO_LOOK.deep) },
    uGold: { value: rgb(COMBO_LOOK.gold) }, uShine: { value: 1 } };          // shared by every material
  // the held cast's: the same names, its own light (the hour's shine is the one shared)
  const water = { uCore: { value: rgb(LANCE_LOOK.core) }, uMain: { value: rgb(LANCE_LOOK.main) }, uDeep: { value: rgb(LANCE_LOOK.deep) }, uShine: colours.uShine };
  const square = new THREE.PlaneGeometry(2, 2);
  const made = [];
  const material = o => { const m = new THREE.ShaderMaterial({ depthWrite: false, ...BLEND, ...o }); m.userData.noGrade = true; made.push(m); return m; };
  const put = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.visible = false; object.add(m); return m; };

  // ---- an orb (thrown, or gathering at her hand): its heart covers what is behind it, its glow only adds
  const orbMat = () => material({
    uniforms: { ...colours, uSize: { value: 1 }, uK: { value: 1 }, uBeat: { value: 0 } },
    vertexShader: FACING,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uK, uShine, uBeat;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float body = 1.0 - smoothstep(0.24, 0.34, r);                      // the orb itself
        float rim = smoothstep(0.08, 0.32, r);                             // bluer toward its edge
        float glow = pow(max(0.0, 1.0 - r), 2.4) * (0.85 + 0.15 * uBeat);
        // four soft rays, the way a bright light looks
        float rays = pow(max(0.0, 1.0 - r), 3.0) * (pow(max(0.0, 1.0 - abs(vP.x) * 9.0), 2.0) + pow(max(0.0, 1.0 - abs(vP.y) * 9.0), 2.0)) * 0.5;
        // (its glow covers a little too: over bright grass it stays blue, not the grass's green lit up)
        vec3 col = mix(uCore, uMain, rim * 0.8) * body + (uMain * 0.8 + uDeep * 0.35) * (glow + rays) * (1.0 - body) * uShine;
        gl_FragColor = vec4(col * uK, (body * 0.95 + (1.0 - body) * min(1.0, glow * 1.6) * 0.5) * uK);
      }`,
  });
  const orbs = Array.from({ length: 8 }, () => ({ mesh: put(square, orbMat()), live: false, k: 0, kind: null, shed: 0, ribbon: null }));
  const glows = new Map();                                                 // key -> { mesh, seen, k, size }

  // ---- a ribbon: where something has been, newest first
  function makeRibbon() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(RIBBON * 2 * 3), uv = new Float32Array(RIBBON * 2 * 2), idx = [];
    for (let i = 0; i < RIBBON; i++) { uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < RIBBON - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...colours, uK: { value: 1 } },
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain;
        uniform float uK, uShine;
        varying vec2 vUv;
        void main() {
          float along = 1.0 - vUv.x;                                       // 1 at its head, 0 where it ends
          float across = 1.0 - vUv.y * vUv.y;
          float a = along * along * across;
          vec3 col = mix(uMain, uCore, across * across * along);
          gl_FragColor = vec4(col * a * uK * (0.7 + 0.3 * uShine), a * 0.6 * uK);
        }`,
    });
    return { mesh: put(geo, mat), pts: [], width: 0.1, life: 0.14, used: false, key: null };
  }
  const ribbons = Array.from({ length: 10 }, makeRibbon);
  // (look: whose light it is: the combo's, or the lance's)
  function takeRibbon(width, life, key = null, look = colours) {
    const r = ribbons.find(o => !o.used && !o.pts.length) || ribbons.find(o => !o.used) || ribbons[0];
    r.pts.length = 0; r.width = width; r.life = life; r.used = true; r.key = key; r.seen = true;
    const u = r.mesh.material.uniforms;
    u.uCore = look.uCore; u.uMain = look.uMain;
    return r;
  }
  function feed(r, at) {
    const p = r.pts[0];
    if (p && p.age < 0.012 && p.at.distanceToSquared(at) < 0.0009) { p.at.copy(at); return; }
    r.pts.unshift({ at: at.clone(), age: 0 });
    if (r.pts.length > RIBBON) r.pts.length = RIBBON;
  }

  // ---- the wave of a cut: a piece of a round wall, bowed forward, tallest in the middle and gone to nothing at its ends
  const waveGeo = (() => {
    const N = 24, A = 1.05, pos = [], uv = [], idx = [];                   // (half its angle: 60 degrees)
    for (let i = 0; i <= N; i++) {
      const u = i / N * 2 - 1, th = u * A, h = Math.pow(Math.cos(u * Math.PI / 2), 0.7);
      for (const v of [-1, 1]) { pos.push(Math.sin(th) / Math.sin(A), v * h, (Math.cos(th) - 1) / Math.sin(A)); uv.push(u, v); }
    }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  })();
  const waveMat = () => material({
    uniforms: { ...colours, uK: { value: 1 }, uAge: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uK, uShine, uAge;
      varying vec2 vUv;
      void main() {
        float ends = 1.0 - pow(abs(vUv.x), 2.5);
        float v = abs(vUv.y);
        float heart = 1.0 - smoothstep(0.0, 0.42, v);                      // the bright line along its middle
        float body = 1.0 - smoothstep(0.35, 1.0, v);
        // light running along it, so that it is not a still shape
        float run = 0.82 + 0.18 * sin(vUv.x * 9.0 - uAge * 30.0);
        vec3 col = mix(uMain, uCore, heart) * body + uDeep * (1.0 - body) * 0.3;
        float a = body * ends * run;
        gl_FragColor = vec4(col * a * uK * (0.75 + 0.35 * uShine), a * (0.45 + 0.5 * heart) * uK);
      }`,
  });
  const waves = Array.from({ length: 4 }, () => ({ mesh: put(waveGeo, waveMat()), live: false, k: 0, kind: null, age: 0 }));

  // ---- a burst: a flash, and a ring going out
  const burstMat = () => material({
    uniforms: { ...colours, uSize: { value: 1 }, uT: { value: 0 } },
    depthTest: false,
    vertexShader: FACING,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uT, uShine;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float out_ = 1.0 - pow(1.0 - uT, 3.0);                             // fast at first
        float R = 0.18 + 0.72 * out_;
        float w = 0.05 + 0.07 * (1.0 - uT);
        float ring = (1.0 - smoothstep(0.0, w, abs(r - R))) * (1.0 - uT) * (1.0 - uT);
        float flash = pow(max(0.0, 1.0 - r / (0.3 + 0.5 * out_)), 1.6) * pow(1.0 - uT, 3.0);
        // eight short rays out of the middle, gone at once
        float ang = atan(vP.y, vP.x);
        float rays = pow(abs(cos(ang * 4.0)), 24.0) * (1.0 - smoothstep(0.1, 0.25 + 0.7 * out_, r)) * pow(1.0 - uT, 2.0);
        vec3 col = uCore * (flash * 1.2 + rays * 0.8) + mix(uMain, uCore, 0.35) * ring + uDeep * flash * 0.4;
        gl_FragColor = vec4(col * (0.75 + 0.45 * uShine), clamp(flash * 0.7 + ring * 0.4, 0.0, 1.0));
      }`,
  });
  const bursts = Array.from({ length: 6 }, () => ({ mesh: put(square, burstMat()), t: 1, life: 0.3 }));

  // ---- a lance: a spear of ice and water, its whole shape drawn by its shader on a strip from its tail to its point,
  // turned to the camera. Along it (0 its tail .. 1 its point), by how far from its middle line it reaches (1: the
  // strip's edge): a pommel, a thin shaft with a bead on it, a guard (a tall thin spike across), and its head, barbed.
  // White down its middle, pale cyan to its edges, a glow round it. uHot: thrown (white hot, a blue flame along it)
  function makeLance() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(LANCE * 2 * 3), uv = new Float32Array(LANCE * 2 * 2), idx = [];
    for (let i = 0; i < LANCE; i++) { uv[i * 4] = uv[i * 4 + 2] = i / (LANCE - 1); uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < LANCE - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...water, uK: { value: 1 }, uHot: { value: 0 }, uAge: { value: 0 } },
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain, uDeep;
        uniform float uK, uShine, uHot, uAge;
        varying vec2 vUv;
        // a part of its outline: so tall at x0, narrowing in a straight line to nothing at x1 (before x0 or after it)
        float part(float x, float y, float x0, float x1, float tall, float aa) {
          float u = clamp((x - x0) / (x1 - x0), 0.0, 1.0);
          float within = step(min(x0, x1), x) * step(x, max(x0, x1));
          return within * (1.0 - smoothstep(-aa, aa, y - tall * (1.0 - u)));
        }
        // ... and one that narrows fast at first (a spike)
        float spike(float x, float y, float x0, float x1, float tall, float aa) {
          float u = clamp((x - x0) / (x1 - x0), 0.0, 1.0);
          float within = step(min(x0, x1), x) * step(x, max(x0, x1));
          return within * (1.0 - smoothstep(-aa, aa, y - tall * (1.0 - u) * (1.0 - u)));
        }
        void main() {
          float x = vUv.x, y = abs(vUv.y);
          float aa = fwidth(vUv.y) * 1.2 + 0.008;
          float m = (1.0 - smoothstep(-aa, aa, y - 0.03)) * step(0.04, x) * step(x, 0.82);                 // its shaft
          m = max(m, max(part(x, y, 0.045, 0.0, 0.1, aa), part(x, y, 0.045, 0.1, 0.1, aa)));               // its pommel
          m = max(m, max(part(x, y, 0.6, 0.565, 0.12, aa), part(x, y, 0.6, 0.635, 0.12, aa)));             // the bead
          m = max(m, max(spike(x, y, 0.69, 0.65, 0.66, aa), spike(x, y, 0.69, 0.73, 0.66, aa)));           // its guard
          // its head: from its barbs' tips (0.745 along, 0.4 out) straight to its point, less what lies between the
          // barbs and the shaft
          m = max(m, part(x, y, 0.745, 1.0, 0.4, aa) * (1.0 - part(x, y, 0.745, 0.81, 0.4, aa)));
          float heart = 1.0 - smoothstep(0.0, 0.14, y);                    // white down its middle
          float ends = smoothstep(0.0, 0.05, x) * smoothstep(0.0, 0.03, 1.0 - x);
          float glow = exp(-y * 6.5) * (0.3 + 0.7 * smoothstep(0.4, 0.8, x)) * ends;
          // thrown: a blue flame licking back along its shaft
          float lick = exp(-y * 4.2) * (0.5 + 0.5 * sin(x * 34.0 - uAge * 28.0 + y * 7.0)) * (1.0 - smoothstep(0.55, 0.8, x)) * smoothstep(0.0, 0.12, x) * uHot;
          vec3 ice = mix(uMain, uCore, clamp(0.45 + 0.55 * heart + uHot, 0.0, 1.0));
          vec3 col = ice * m + ((uMain * 0.55 + uDeep * 0.6) * glow * (0.8 + 0.7 * uHot) + uDeep * lick * 1.3) * (1.0 - m);
          float a = m * 0.92 + (1.0 - m) * min(1.0, glow * 0.6 + lick * 0.35);
          gl_FragColor = clamp(vec4(col * uK * (0.8 + 0.3 * uShine), a * uK), 0.0, 1.0);
        }`,
    });
    return { mesh: put(geo, mat), live: false, k: 0, level: 0, long: 0, grown: 0, hot: 0, ribbon: null, head: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1),
      // in flight: where it was thrown from, how far it has come (m), two ways across its own (for the wake round it),
      // how long ago it was thrown and how long it has been over (s), its pace (m/s), whether its wake is still there,
      // where along its way it sheds its next sparkle and leaves its next hoop (m), how many hoops it has left
      from: new THREE.Vector3(), far: 0, X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), flown: 0, gone: 0, pace: 30, wakeOn: false, sparkAt: 0, hoopAt: 0, hoopN: 0,
      wake: WAKE.strands.map(makeStrand), beam: makeBeam() };
  }
  // ---- a ribbon of the wake: a strip along a helix round the lance's way, turned to the camera, laid anew each frame.
  // Across it a wash, a bright line near each edge; where it is on the far side of the way from the camera its blue
  // inside shows (aTone: how far it is turned to the camera, -1..1). uv.x: how far gone a place on it is (0 new, 1 gone)
  function makeStrand(d) {
    const N = WAKE.places, geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), tone = new Float32Array(N * 2), idx = [];
    for (let i = 0; i < N; i++) { uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTone', new THREE.BufferAttribute(tone, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...water, uK: { value: 1 }, uBlue: { value: d.blue } },
      side: THREE.DoubleSide,
      vertexShader: 'attribute float aTone; varying vec2 vUv; varying float vTone; void main() { vUv = uv; vTone = aTone; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain, uDeep;
        uniform float uK, uShine, uBlue;
        varying vec2 vUv;
        varying float vTone;
        void main() {
          float across = max(0.0, 1.0 - vUv.y * vUv.y);
          float edge = clamp(1.0 - abs(abs(vUv.y) - 0.72) * 4.5, 0.0, 1.0);
          float front = smoothstep(-0.25, 0.35, vTone);
          vec3 body = mix(uDeep, uMain, (0.2 + 0.8 * front) * (1.0 - 0.75 * uBlue));
          vec3 col = mix(body, uCore, edge * edge * (0.3 + 0.6 * front));
          float a = smoothstep(0.0, 0.3, across) * pow(clamp(1.0 - vUv.x, 0.0, 1.0), 1.25);
          gl_FragColor = clamp(vec4(col * a * uK * (0.8 + 0.3 * uShine), a * uK * (0.4 + 0.3 * front)), 0.0, 1.0);
        }`,
    });
    return { mesh: put(geo, mat), d };
  }
  // ---- the beam left standing as a lance is let go: a strip from where it was thrown, thin there and thick further
  // on; white hot down its middle, a blue flame flickering along it
  function makeBeam() {
    const N = LAUNCH.beam.places, geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), idx = [];
    for (let i = 0; i < N; i++) { uv[i * 4] = uv[i * 4 + 2] = i / (N - 1); uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...water, uK: { value: 1 }, uAge: { value: 0 } },
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain, uDeep;
        uniform float uK, uShine, uAge;
        varying vec2 vUv;
        void main() {
          float y = abs(vUv.y);
          float heart = 1.0 - smoothstep(0.08, 0.3, y);                     // white hot down its middle
          float glow = exp(-y * 3.4) * (1.0 - smoothstep(0.8, 1.0, y));
          float lick = 0.6 + 0.4 * sin(vUv.x * 46.0 - uAge * 30.0 + y * 6.0);
          float ends = smoothstep(0.0, 0.05, vUv.x) * smoothstep(0.0, 0.25, 1.0 - vUv.x);
          vec3 col = uCore * heart + mix(uDeep, uMain, glow * 0.6) * glow * lick * (1.0 - heart);
          gl_FragColor = clamp(vec4(col * ends * uK * (0.85 + 0.3 * uShine), min(1.0, heart * 0.9 + glow * 0.3 * lick) * ends * uK), 0.0, 1.0);
        }`,
    });
    return { mesh: put(geo, mat) };
  }
  const lances = Array.from({ length: 3 }, makeLance);
  const wakeAt = new Float32Array(WAKE.places * 3), wakeR = new Float32Array(WAKE.places * 3);      // a ribbon's places; the way out from the lance's line at each

  // ---- a hoop of water round the lance's line: one square across it; a ring going out, a bright line with a wash
  // inside it. uFeather: spray torn off its rim outward (the one at the circle as the lance is let go)
  const hoopMat = () => material({
    uniforms: { ...water, uT: { value: 0 }, uFeather: { value: 0 }, uSeed: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uT, uShine, uFeather, uSeed;
      varying vec2 vP;
      void main() {
        float r = length(vP), a = atan(vP.y, abs(vP.x) < 1e-6 ? 1e-6 : vP.x);
        float out_ = 1.0 - pow(clamp(1.0 - uT, 0.0, 1.0), 2.6);             // fast at first
        float R = 0.3 + 0.42 * out_;                                        // (its spray stands out past it, to the square's edge)
        float w = 0.012 + 0.02 * (1.0 - uT);
        float line = 1.0 - smoothstep(w, w + 0.02, abs(r - R));
        float band = smoothstep(R - 0.16, R, r) * (1.0 - step(R, r)) * 0.35;
        // the spray: tongues of it off the rim, each as long as its place round the rim has it
        float n = 0.5 + 0.25 * sin(a * 9.0 + uSeed) + 0.25 * sin(a * 23.0 - uSeed * 1.7);
        float spray = (1.0 - smoothstep(R, R + 0.02 + 0.24 * n, r)) * step(R, r) * uFeather * 0.7;
        float k = (1.0 - uT) * (1.0 - uT * uT);
        vec3 col = mix(uMain, uCore, line * 0.8) * (line + band) + mix(uDeep, uMain, 0.55) * spray;
        gl_FragColor = clamp(vec4(col * k * (0.8 + 0.3 * uShine), clamp(line + band + spray, 0.0, 1.0) * k * 0.5), 0.0, 1.0);
      }`,
  });
  const hoops = Array.from({ length: 4 }, () => ({ mesh: put(square, hoopMat()), t: 1, life: 0.4 }));

  // ---- the gate: a magic circle standing in the air, which a lance is thrown through, as the clip's. One square; all
  // of it is drawn by its shader from where on it a pixel is (in radii: its outer ring at 1)
  const gateMat = () => material({
    uniforms: { ...water, uOpen: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 }, uFlash: { value: 0 }, uWave: { value: 0 }, uFade: { value: 0 }, uAge: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vP; void main() { vP = position.xy * ${GATE.reach.toFixed(2)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      #define PI 3.14159265
      #define TAU 6.2831853
      uniform vec3 uCore, uMain, uDeep;
      uniform float uOpen, uLevel, uBeat, uFlash, uWave, uFade, uAge, uShine;
      varying vec2 vP;
      // a line's edge is softened by how fast its distance changes on the screen (see magic-circle-fx.js: every line is
      // drawn for every pixel and then masked, never inside an if that differs from one pixel to the next)
      float line(float d, float w) { float f = fwidth(d) * 1.2 + 0.002; return 1.0 - smoothstep(w * 0.5, w * 0.5 + f, abs(d)); }
      vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
      float hash(float n) { return fract(sin(n * 78.233 + 4.7) * 43758.5453); }
      // how much of a ring is drawn yet: each draws itself round from its own starting point as the gate opens
      float drawn(float a, float at, float from) {
        float s = fract((a + PI) / TAU + from);
        return step(s, clamp((uOpen - at) * 2.6, 0.0, 1.0));
      }
      // the marks round a band (r0..r1): n cells, each a little glyph of strokes picked by a hash
      float runes(float r, float a, float r0, float r1, float n) {
        float v = (r - r0) / (r1 - r0);
        float s = (a / TAU + 0.5) * n, id = floor(s), u = fract(s);
        float h = hash(id), h2 = hash(id + 17.0);
        vec2 q = vec2((u - 0.5) * r * TAU / n / (r1 - r0), v - 0.5);
        float w = 0.13, g = line(q.x, w) * step(abs(q.y), 0.3);
        g = max(g, line(q.y - 0.2, w) * step(abs(q.x), 0.24) * step(0.45, h));
        g = max(g, line(length(q - vec2(0.0, -0.14)) - 0.12, w) * step(0.5, h2));
        g = max(g, line(q.y + q.x * 1.3, w) * step(abs(q.x), 0.2) * (1.0 - step(0.3, h)));
        g = max(g, line(q.y + 0.24, w) * step(abs(q.x), 0.24) * (1.0 - step(0.2, h2)));
        return g * step(0.0, v) * step(v, 1.0);
      }
      float sq(vec2 p, float s) { vec2 q = abs(p); return max(q.x, q.y) - s; }
      // a small seal standing on the rim, at angle a0: two rings and a dot
      float seal(vec2 p, float a0) {
        float d = length(p - vec2(cos(a0), sin(a0)) * 0.94);
        return max(max(line(d - 0.16, 0.018), line(d - 0.105, 0.012)), 1.0 - smoothstep(0.02, 0.04, d));
      }
      void main() {
        vec2 p = vP;
        float r = length(p), a = atan(p.y, abs(p.x) < 1e-6 ? 1e-6 : p.x);  // (no angle at the very middle)
        float t = uAge, spinA = t * 0.9, spinB = -t * 1.3;                 // the band of marks and the figures inside turn opposite ways
        float L = 0.0;
        // its rim, thick, and a thin ring just inside it; the band of marks, a ring inside that; a small ring in the
        // middle (the lance goes through it)
        L = max(L, line(r - 1.0, 0.042) * drawn(a, 0.0, 0.0));
        L = max(L, line(r - 0.935, 0.016) * drawn(a, 0.06, 0.5));
        L = max(L, line(r - 0.73, 0.022) * drawn(a, 0.16, 0.25));
        L = max(L, line(r - 0.17, 0.02) * drawn(a, 0.3, 0.6));
        L = max(L, runes(r, a + spinA, 0.765, 0.905, 26.0) * step(0.3, uOpen));
        // grown once: a diamond in the inner ring and a square across it, turning (how near a pixel is to either: fig)
        vec2 q = rot(p, spinB * 0.5);
        float fig = min(abs(sq(rot(q, PI * 0.25), 0.516)), abs(sq(q, 0.47)));
        float one = step(0.5, uLevel), two = step(1.5, uLevel), three = step(2.5, uLevel);
        L = max(L, line(fig, 0.022) * one);
        // twice: the circle in the square, and a small star (two squares) turning the other way round the middle
        vec2 q2 = rot(p, -spinB * 1.1);
        L = max(L, line(r - 0.47, 0.016) * two);
        L = max(L, line(min(abs(sq(q2, 0.235)), abs(sq(rot(q2, PI * 0.25), 0.235))), 0.016) * two);
        // full grown: two small seals standing on its rim, going round with the marks
        L = max(L, max(seal(p, 2.5 - spinA), seal(p, 3.75 - spinA)) * three);
        // a comet of light running round outside its rim: as it opens, each time it grows, and all the while once full grown
        float tail = clamp((fract((a - t * 3.4) / TAU + 0.5) - 0.68) / 0.32, 0.0, 1.0);
        float comet = line(r - 1.1, 0.012 + 0.06 * tail) * tail * tail * max(max(1.0 - uOpen, uBeat), three * 0.75);
        // the lance has gone through: a wave going out round the rim, and its middle flares into a four-pointed star
        float out_ = 1.0 - pow(clamp(1.0 - uWave, 0.0, 1.0), 3.0);
        float W = line(r - (1.0 + 0.5 * out_), 0.03 + 0.05 * (1.0 - uWave)) * (1.0 - uWave) * (1.0 - uWave) * step(0.0005, uWave);
        float star = (exp(-abs(p.y) * 42.0) * exp(-abs(p.x) * 1.7) + exp(-abs(p.x) * 42.0) * exp(-abs(p.y) * 2.6) + exp(-r * 6.0)) * uFlash;
        // glow: round the rim and the inner ring, along the figure, over its whole face (a wash of blue), in its middle
        float G = exp(-abs(r - 0.97) * 9.0) * 0.6 + exp(-abs(r - 0.73) * 16.0) * 0.25 + exp(-fig * 16.0) * 0.3 * one
          + (1.0 - smoothstep(0.1, 0.98, r)) * 0.22 + exp(-r * 5.0) * 0.35;
        G *= smoothstep(0.0, 0.25, uOpen) * (1.0 - smoothstep(1.3, 1.6, r)) * (1.0 + 0.5 * uBeat + 0.6 * uFlash);
        // going: it breaks into bits (by angle and by ring), from the middle out
        float bit = hash(floor((a / TAU + 0.5) * 40.0) + floor(r * 14.0) * 41.0);
        float keep = step(uFade * 1.25 - r * 0.25, bit * 0.9 + 0.08);
        float pulse = 0.9 + 0.1 * sin(t * 21.0);
        L = max(L, comet) * keep * pulse;
        G *= (1.0 - uFade) * pulse;
        float A = clamp(L + W, 0.0, 1.0);
        vec3 lineCol = mix(uMain, uCore, clamp(0.45 + 0.3 * smoothstep(0.55, 1.0, L) + 0.5 * uBeat + uFlash + W, 0.0, 1.0));
        vec3 col = lineCol * A + mix(uDeep, uMain, 0.35) * G + uCore * star;
        gl_FragColor = clamp(vec4(col * (0.75 + 0.35 * uShine), A * 0.85 + min(1.0, G) * 0.4 + min(1.0, star) * 0.5), 0.0, 1.0);
      }`,
  });
  const gates = Array.from({ length: 2 }, () => ({ mesh: put(square, gateMat()), live: false, open: 0, level: 0, beat: 0, fired: -1, fade: 1, age: 0, radius: 0, want: 0, fresh: true, dust: 0, dir: new THREE.Vector3(0, 0, 1) }));

  // ---- a ring over the ground: going out from the middle, thinning as it goes
  const flat = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const ringMat = () => material({
    uniforms: { ...colours, uT: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uT, uShine;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float out_ = 1.0 - pow(1.0 - uT, 2.5);
        float R = 0.12 + 0.84 * out_;
        float w = 0.035 + 0.1 * (1.0 - uT);
        float edge = 1.0 - smoothstep(0.0, w, abs(r - R));
        float wash = (1.0 - smoothstep(0.0, R, r)) * 0.22 * (1.0 - uT);      // a little light inside it, at first
        float a = (edge + wash) * (1.0 - uT * uT);
        vec3 col = mix(uMain, uCore, edge * 0.7) + uDeep * wash;
        gl_FragColor = vec4(col * a * (0.75 + 0.4 * uShine), a * 0.5);
      }`,
  });
  const rings = Array.from({ length: 3 }, () => ({ mesh: put(flat, ringMat()), t: 1, life: 0.4 }));

  // ---- sparks: gold, four-pointed; thrown out, slowing, falling a little, going out (all in the shader). And the
  // lance's sparkles (aTint 1): a round bead of light with a soft glow, which hardly falls, and twinkles as it drifts
  const sGeo = new THREE.InstancedBufferGeometry();
  sGeo.index = square.index;
  sGeo.setAttribute('position', square.attributes.position);
  const sAt = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sVel = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sData = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 4), 4).setUsage(THREE.DynamicDrawUsage);      // born, life, size, turn
  const sTint = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS), 1).setUsage(THREE.DynamicDrawUsage);         // 0: a gold spark; 1: a sparkle of the lance's
  for (let j = 0; j < SPARKS; j++) sData.setXYZW(j, -1000, 1, 0, 0);                                                      // (none yet)
  sGeo.setAttribute('aAt', sAt); sGeo.setAttribute('aVel', sVel); sGeo.setAttribute('aData', sData); sGeo.setAttribute('aTint', sTint);
  sGeo.instanceCount = SPARKS;
  const sMat = material({
    uniforms: { ...colours, uSea: water.uMain, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aAt, aVel;
      attribute vec4 aData;
      attribute float aTint;
      uniform float uTime;
      varying vec2 vP;
      varying float vU, vTint;
      void main() {
        float age = uTime - aData.x, u = age / aData.y;
        float on = step(0.0, age) * step(u, 1.0);
        float slow = (1.0 - exp(-3.0 * age)) / 3.0;                        // (how far it has come, slowing as it goes)
        vec3 p = aAt + aVel * slow - vec3(0.0, 0.7 * age * age * (1.0 - 0.9 * aTint), 0.0);
        float twinkle = mix(0.7 + 0.3 * sin(uTime * 26.0 + aData.w * 50.0), 0.55 + 0.45 * sin(uTime * 15.0 + aData.w * 50.0), aTint);
        float s = aData.z * on * smoothstep(0.0, 0.12, u) * pow(max(0.0, 1.0 - u), 0.6) * twinkle;
        float c = cos(aData.w), sn = sin(aData.w);
        vP = position.xy; vU = u; vTint = aTint;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        mv.xy += mat2(c, -sn, sn, c) * position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uGold, uSea;
      uniform float uShine;
      varying vec2 vP;
      varying float vU, vTint;
      void main() {
        vec2 q = abs(vP);
        float r = length(vP);
        float star = max(0.0, 1.0 - (q.x * q.y * 30.0 + (q.x + q.y) * 0.95));
        float heart = 1.0 - smoothstep(0.0, 0.2, r);
        float bead = 1.0 - smoothstep(0.14, 0.3, r);
        float halo = pow(max(0.0, 1.0 - r), 2.2) * 0.6 + star * 0.3;
        float a = mix(clamp(star + heart, 0.0, 1.0), clamp(bead + halo, 0.0, 1.0), vTint);
        vec3 col = mix(mix(uGold, uCore, heart * 0.8), mix(uSea, uCore, bead * 0.85), vTint);
        gl_FragColor = vec4(col * a * (0.8 + 0.4 * uShine), a * mix(0.55, 0.4, vTint));
      }`,
  });
  const sparks = put(sGeo, sMat);
  sparks.visible = true;
  let sNext = 0, time = 0;
  function spark(at, vx, vy, vz, life, size, tint = 0) {
    const j = sNext; sNext = (sNext + 1) % SPARKS;
    sAt.setXYZ(j, at.x, at.y, at.z); sVel.setXYZ(j, vx, vy, vz); sData.setXYZW(j, time, life, size, rand() * 6.283); sTint.setX(j, tint);
    sAt.needsUpdate = sVel.needsUpdate = sData.needsUpdate = sTint.needsUpdate = true;
  }
  // ---- slivers of ice: thin, pointed at both ends, lying along the way they fly; thrown out, slowing, going out
  const hGeo = new THREE.InstancedBufferGeometry();
  hGeo.index = square.index;
  hGeo.setAttribute('position', square.attributes.position);
  const hAt = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const hVel = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const hData = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 4), 4).setUsage(THREE.DynamicDrawUsage);      // born, life, size (half its length, m), how thin (its width of its length)
  for (let j = 0; j < SHARDS; j++) hData.setXYZW(j, -1000, 1, 0, 0);
  hGeo.setAttribute('aAt', hAt); hGeo.setAttribute('aVel', hVel); hGeo.setAttribute('aData', hData);
  hGeo.instanceCount = SHARDS;
  const hMat = material({
    uniforms: { ...water, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aAt, aVel;
      attribute vec4 aData;
      uniform float uTime;
      varying vec2 vP;
      void main() {
        float age = uTime - aData.x, u = age / aData.y;
        float on = step(0.0, age) * step(u, 1.0);
        float slow = (1.0 - exp(-4.0 * age)) / 4.0;
        vec3 p = aAt + aVel * slow;
        float s = aData.z * on * smoothstep(0.0, 0.08, u) * pow(max(0.0, 1.0 - u), 0.5);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        // it lies along the way it flies, as the camera sees that (straight at the camera: level)
        vec2 d = (viewMatrix * vec4(aVel, 0.0)).xy;
        float len = length(d);
        d = len > 1e-4 ? d / len : vec2(1.0, 0.0);
        vP = position.xy;
        mv.xy += (d * position.x + vec2(-d.y, d.x) * position.y * aData.w) * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain;
      uniform float uShine;
      varying vec2 vP;
      void main() {
        float y = abs(vP.y);
        float w = max(0.0, 1.0 - abs(vP.x));                               // pointed at both ends
        float body = 1.0 - smoothstep(w * 0.6, w + 0.02, y);
        float heart = 1.0 - smoothstep(0.0, 0.4, y);
        vec3 col = mix(uMain, uCore, 0.45 + 0.55 * heart);
        gl_FragColor = clamp(vec4(col * body * (0.8 + 0.35 * uShine), body * 0.6), 0.0, 1.0);
      }`,
  });
  const shards = put(hGeo, hMat);
  shards.visible = true;
  let hNext = 0;
  function shard(at, vx, vy, vz, life, size, thin) {
    const j = hNext; hNext = (hNext + 1) % SHARDS;
    hAt.setXYZ(j, at.x, at.y, at.z); hVel.setXYZ(j, vx, vy, vz); hData.setXYZW(j, time, life, size, thin);
    hAt.needsUpdate = hVel.needsUpdate = hData.needsUpdate = true;
  }
  // n sparks thrown out from a place, every way (up a little more than down); sea: the lance's sparkles
  function scatter(at, n, speed, size, sea = false) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.283, z = rand() * 1.6 - 0.6, r = Math.sqrt(Math.max(0, 1 - Math.min(1, z * z))), v = speed * (0.55 + 0.6 * rand());
      spark(at, Math.cos(a) * r * v, z * v + 0.6, Math.sin(a) * r * v, (sea ? 0.5 : 0.35) + 0.3 * rand(), size * (0.7 + 0.6 * rand()), sea ? 1 : 0);
    }
  }

  const tmp = new THREE.Vector3(), side = new THREE.Vector3(), tan = new THREE.Vector3(), toCam = new THREE.Vector3();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), basis = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);

  // two ways across `way` (unit), into X and Y: level, and up
  function across(way) {
    X.crossVectors(UP, way);
    if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
    X.normalize(); Y.crossVectors(way, X);
  }
  // a hoop of water begins: round the line through `at` along `way`, so wide at its widest, lasting so long
  function hoop(at, way, radius, life, feather) {
    const h = hoops.find(o => o.t >= 1) || hoops.reduce((m, o) => (o.t > m.t ? o : m));
    Z.copy(way).normalize(); across(Z);
    basis.makeBasis(X, Y, Z);
    h.mesh.quaternion.setFromRotationMatrix(basis);
    h.mesh.position.copy(at); h.mesh.scale.setScalar(radius / 0.72); h.mesh.visible = true;      // (its ring ends 0.72 of the way to the square's edge)
    h.t = 0; h.life = life;
    const u = h.mesh.material.uniforms;
    u.uT.value = 0; u.uFeather.value = feather ? 1 : 0; u.uSeed.value = rand() * 6.283;
  }
  // what a lance sheds `at` m along its way: a sparkle, from beside it, drifting out and on a little
  function shed(l, at) {
    const a = rand() * 6.283, c = Math.cos(a), sn = Math.sin(a), out = 0.1 + 0.4 * rand();
    side.copy(l.X).multiplyScalar(c).addScaledVector(l.Y, sn);
    tmp.copy(l.from).addScaledVector(l.dir, at).addScaledVector(side, out);
    const v = 0.5 + 1.4 * rand(), f = 1 + 2.5 * rand(), d = l.dir;
    spark(tmp, side.x * v + d.x * f, side.y * v + d.y * f + 0.3, side.z * v + d.z * f, 0.7 + 0.6 * rand(), 0.06 + 0.07 * rand(), 1);
  }
  // a lance's way since it was let go: the beam left standing from the circle on, and the wake wound round it
  function leaves(l, dt, camera) {
    const thrown = l.far > 0;
    if (thrown) { l.flown += dt; if (l.live) l.pace = Math.max(1, l.far / Math.max(l.flown, 1e-3)); else l.gone += dt; }
    // the beam: thin at the circle, thick further on, thinner as it goes out
    const bm = LAUNCH.beam, left = thrown ? 1 - l.flown / bm.life : 0;
    l.beam.mesh.visible = left > 0;
    if (left > 0) {
      const N = bm.places, pos = l.beam.mesh.geometry.attributes.position, long = Math.min(l.far, bm.long), W = bm.wide * (0.8 + 0.12 * l.level) * Math.pow(left, 0.6);
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        tan.copy(l.from).addScaledVector(l.dir, u * long);
        toCam.subVectors(camera.position, tan);
        side.crossVectors(l.dir, toCam).normalize();
        const w = W * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.5)), 0.7);
        pos.setXYZ(i * 2, tan.x - side.x * w, tan.y - side.y * w, tan.z - side.z * w);
        pos.setXYZ(i * 2 + 1, tan.x + side.x * w, tan.y + side.y * w, tan.z + side.z * w);
      }
      pos.needsUpdate = true;
      const u = l.beam.mesh.material.uniforms;
      u.uK.value = Math.min(1, left * 2.2); u.uAge.value = time;
    }
    // the wake: each ribbon's strip laid along its helix, from the circle to the lance's point (the first `long` m of
    // its way). A place the lance passed some while ago is so far gone: thinner, further out, wavering. All of it is
    // gone `life` s after the lance is over (or has left the last of it behind)
    if (l.wakeOn && l.flown - Math.min(l.far, WAKE.long) / l.pace >= WAKE.life) l.wakeOn = false;
    if (!thrown || !l.wakeOn) { for (const w of l.wake) w.mesh.visible = false; return; }
    const N = WAKE.places, long = Math.min(l.far, WAKE.long), big = 1 + 0.12 * l.level, within = l.far <= WAKE.long + WAKE.near;
    for (const w of l.wake) {
      const d = w.d, pos = w.mesh.geometry.attributes.position, uv = w.mesh.geometry.attributes.uv, tone = w.mesh.geometry.attributes.aTone;
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1) * long, back = l.far - s, gone = clamp((l.flown - s / l.pace) / WAKE.life, 0, 1);
        const close = within ? 0.4 + 0.6 * Math.min(1, back / WAKE.near) : 1;      // it closes in on the lance behind its point
        const r = WAKE.r * d.r * big * close * (1 + WAKE.swell * gone + 0.14 * gone * Math.sin(s * 2.1 + l.flown * 9 + d.phase));
        const th = d.phase + s * 6.2832 / WAKE.pitch - l.flown * WAKE.spin, c = Math.cos(th), sn = Math.sin(th), j = i * 3;
        wakeR[j] = l.X.x * c + l.Y.x * sn; wakeR[j + 1] = l.X.y * c + l.Y.y * sn; wakeR[j + 2] = l.X.z * c + l.Y.z * sn;
        wakeAt[j] = l.from.x + l.dir.x * s + wakeR[j] * r;
        wakeAt[j + 1] = l.from.y + l.dir.y * s + wakeR[j + 1] * r;
        wakeAt[j + 2] = l.from.z + l.dir.z * s + wakeR[j + 2] * r;
      }
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1) * long, back = l.far - s, gone = clamp((l.flown - s / l.pace) / WAKE.life, 0, 1);
        const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(N - 1, i + 1) * 3, j = i * 3;
        tan.set(wakeAt[i0] - wakeAt[i1], wakeAt[i0 + 1] - wakeAt[i1 + 1], wakeAt[i0 + 2] - wakeAt[i1 + 2]);
        toCam.set(camera.position.x - wakeAt[j], camera.position.y - wakeAt[j + 1], camera.position.z - wakeAt[j + 2]);
        side.crossVectors(tan, toCam);
        const len = side.length(), far = toCam.length() || 1;
        // a ribbon seen flat on is broad, seen edge on narrow: as it winds round, as the camera sees it (from behind
        // the lance, looking along its way, all of it is broad)
        const facing = (wakeR[j] * toCam.x + wakeR[j + 1] * toCam.y + wakeR[j + 2] * toCam.z) / far;
        const along = Math.abs(l.dir.x * toCam.x + l.dir.y * toCam.y + l.dir.z * toCam.z) / far;
        const turn = 0.3 + 0.7 * Math.max(Math.abs(facing), along);
        // it thins away: out of the circle, to the lance's point, at the far end of what there is of it, and as it goes
        const ends = Math.min(1, s / 0.5) * (within ? Math.min(1, back / 0.7) : 1) * clamp((WAKE.long - s) / (0.3 * WAKE.long), 0, 1);
        const wide = len > 1e-6 ? WAKE.wide * d.wide * big * turn * ends * (1 - 0.75 * gone) / len : 0;
        pos.setXYZ(i * 2, wakeAt[j] - side.x * wide, wakeAt[j + 1] - side.y * wide, wakeAt[j + 2] - side.z * wide);
        pos.setXYZ(i * 2 + 1, wakeAt[j] + side.x * wide, wakeAt[j + 1] + side.y * wide, wakeAt[j + 2] + side.z * wide);
        uv.setX(i * 2, gone); uv.setX(i * 2 + 1, gone);
        tone.setX(i * 2, facing); tone.setX(i * 2 + 1, facing);
      }
      pos.needsUpdate = true; uv.needsUpdate = true; tone.needsUpdate = true;
      w.mesh.visible = true;
      w.mesh.material.uniforms.uK.value = Math.min(1, l.far / 1.0);
    }
  }

  const fx = {
    object,
    glow(key, at, size) {
      let g = glows.get(key);
      if (!g) { g = { mesh: put(square, orbMat()), seen: false, k: 0, size: 0 }; glows.set(key, g); }
      g.mesh.position.copy(at); g.seen = true; g.size = size;
    },
    trail(key, at) {
      let r = ribbons.find(o => o.used && o.key === key);
      if (!r) r = takeRibbon(0.07, 0.16, key);
      r.seen = true;
      feed(r, at);
    },
    shot(kind) {
      const def = SHOTS[kind] || SHOTS.orb;
      if (def.long) {
        const l = lances.find(o => !o.mesh.visible && !o.wakeOn) || lances.find(o => !o.mesh.visible) || lances[0];
        l.live = true; l.k = 1; l.level = 0; l.grown = 0; l.hot = 0; l.long = def.long[0]; l.mesh.visible = true;
        if (l.ribbon) l.ribbon.used = false;
        l.ribbon = null;
        l.far = 0; l.flown = 0; l.gone = 0; l.wakeOn = false; l.beam.mesh.visible = false;
        return {
          get long() { return l.long; },
          size(level) { l.level = Math.max(0, Math.min(3, level)); },
          place(at, dir, far = 0) {
            l.head.copy(at); l.dir.copy(dir).normalize();
            if (far <= 0) return;
            // in flight: a streak behind it; its wake; sparkles shed from beside it as it goes, a thin hoop now and then
            if (!l.ribbon) l.ribbon = takeRibbon(0.1 + 0.03 * l.level, FLIGHT.streak, null, water);
            feed(l.ribbon, at);
            if (l.far <= 0) {
              l.from.copy(at).addScaledVector(l.dir, -far);
              across(l.dir); l.X.copy(X); l.Y.copy(Y);
              l.wakeOn = true; l.sparkAt = 0.3; l.hoopAt = LAUNCH.hoops.every; l.hoopN = LAUNCH.hoops.most;
            }
            l.far = far;
            while (far >= l.sparkAt) { shed(l, l.sparkAt); l.sparkAt += SHED.sparkle * (1 + rand()); }
            if (l.hoopN > 0 && far >= l.hoopAt) {
              hoop(tmp.copy(l.from).addScaledVector(l.dir, l.hoopAt), l.dir, LAUNCH.hoops.r * (1 + 0.1 * l.level), LAUNCH.hoops.life, false);
              l.hoopAt += LAUNCH.hoops.every; l.hoopN--;
            }
          },
          end() { l.live = false; if (l.ribbon) l.ribbon.used = false; },
        };
      }
      if (def.wide) {
        const w = waves.find(o => !o.mesh.visible) || waves[0];
        w.live = true; w.k = 1; w.kind = def; w.age = 0; w.mesh.visible = true;
        return {
          place(at, dir, far = 0) {
            // ahead: the way it goes; across: level, leaning as her cut did; it widens a little as it flies
            Z.copy(dir).normalize();
            X.crossVectors(UP, Z).normalize();
            Y.crossVectors(Z, X);
            const c = Math.cos(def.lean), s = Math.sin(def.lean);
            tmp.copy(X).multiplyScalar(c).addScaledVector(Y, s);
            side.copy(Y).multiplyScalar(c).addScaledVector(X, -s);
            basis.makeBasis(tmp, side, Z);
            w.mesh.quaternion.setFromRotationMatrix(basis);
            w.mesh.position.copy(at);
            const grow = 0.55 + 0.45 * Math.min(1, far / 1.2) + 0.03 * far;
            w.mesh.scale.set(def.wide * grow, def.tall * (0.8 + 0.2 * grow), def.wide * grow);
          },
          end(hit) { w.live = false; if (hit) w.k = Math.min(w.k, 0.5); },
        };
      }
      const o = orbs.find(v => !v.mesh.visible) || orbs[0];
      o.live = true; o.k = 1; o.kind = def; o.shed = def.shed * 0.5; o.mesh.visible = true;
      o.mesh.material.uniforms.uSize.value = def.size;
      o.ribbon = takeRibbon(def.ribbon, 0.13);
      let last = -1;
      return {
        place(at, dir, far = 0) {
          o.mesh.position.copy(at);
          feed(o.ribbon, at);
          if (last >= 0) {
            o.shed -= far - last;
            if (o.shed <= 0) { o.shed = def.shed; spark(at, (rand() - 0.5) * 1.6, 0.4 + rand() * 0.8, (rand() - 0.5) * 1.6, 0.4 + 0.2 * rand(), def.size * 0.3); }
          }
          last = far;
        },
        end(hit) { o.live = false; o.ribbon.used = false; if (hit) { o.k = 0; o.mesh.visible = false; } },
      };
    },
    burst(at, size = 0.7, sea = false) {
      const b = bursts.find(o => o.t >= 1) || bursts.reduce((m, o) => (o.t > m.t ? o : m));
      b.t = 0; b.life = 0.24 + 0.1 * Math.min(1.5, size);
      b.mesh.position.copy(at); b.mesh.visible = true;
      b.mesh.material.uniforms.uSize.value = size;
      scatter(at, Math.round(5 + 5 * Math.min(2, size)), 2.2 + 1.6 * size, 0.07 + 0.05 * Math.min(2, size), sea);
    },
    ring(at, radius = 2) {
      const r = rings.find(o => o.t >= 1) || rings[0];
      r.t = 0; r.life = 0.32 + 0.05 * radius;
      r.mesh.position.copy(at); r.mesh.scale.setScalar(radius); r.mesh.visible = true;
      scatter(at, 8, 3.2, 0.09);
    },
    gate() {
      const g = gates.find(o => !o.mesh.visible) || gates[0];
      g.live = true; g.open = 0; g.level = 0; g.beat = 0; g.fired = -1; g.fade = 0; g.age = rand() * 10; g.fresh = true; g.dust = 0;
      return {
        place(at, dir, radius) {
          g.mesh.position.copy(at);
          g.dir.copy(dir).normalize();
          across(g.dir);
          basis.makeBasis(X, Y, g.dir);
          g.mesh.quaternion.setFromRotationMatrix(basis);
          g.want = radius;
          if (g.fresh) { g.fresh = false; g.radius = radius; g.mesh.scale.setScalar(1e-4); g.mesh.visible = true; }
        },
        size(level) {
          const to = Math.max(0, Math.min(3, level));
          if (to > g.level) g.beat = 1;
          g.level = to;
        },
        fire() {
          if (g.fired >= 0 || !g.mesh.visible) return;
          g.fired = 0; g.live = false;
          // let go with the lance, the bigger the more it has grown: a hoop of water round its line a little way on,
          // spray off its rim; slivers of ice thrown out round the circle's rim; sparkles thrown out of it and on
          const big = 0.7 + 0.1 * g.level, R = g.radius, d = g.dir, at = g.mesh.position;
          hoop(tmp.copy(at).addScaledVector(d, LAUNCH.hoop.ahead * big), d, LAUNCH.hoop.r * big, LAUNCH.hoop.life, true);
          across(d);
          const nh = Math.round(LAUNCH.shards * big), ns = Math.round(LAUNCH.sparkles * big);
          for (let i = 0; i < nh + ns; i++) {
            const a = rand() * 6.283, c = Math.cos(a), sn = Math.sin(a);
            side.copy(X).multiplyScalar(c).addScaledVector(Y, sn);
            if (i < nh) {
              const v = 5 + 6 * rand(), f = 0.5 + 2 * rand();
              tmp.copy(at).addScaledVector(side, R * (0.95 + 0.3 * rand()));
              shard(tmp, side.x * v + d.x * f, side.y * v + d.y * f, side.z * v + d.z * f, 0.28 + 0.2 * rand(), (0.1 + 0.12 * rand()) * big, 0.1 + 0.08 * rand());
            } else {
              const v = 1.2 + 3 * rand(), f = 1 + 5 * rand();
              tmp.copy(at).addScaledVector(side, R * (0.3 + 1.0 * rand())).addScaledVector(d, rand() * 0.6);
              spark(tmp, side.x * v + d.x * f, side.y * v + d.y * f + 0.4, side.z * v + d.z * f, 0.6 + 0.6 * rand(), 0.06 + 0.07 * rand(), 1);
            }
          }
        },
        end() { g.live = false; },
      };
    },
    motes(at, n = 1, from = 0.6, sea = false) {
      for (let i = 0; i < n; i++) {
        const a = rand() * 6.283, z = rand() * 1.4 - 0.4, r = Math.sqrt(Math.max(0, 1 - Math.min(1, z * z)));
        tmp.set(at.x + Math.cos(a) * r * from, at.y + z * from, at.z + Math.sin(a) * r * from);
        // (a spark slows to a third of its first pace's reach: sent three times as fast as the way is long, it ends at `at`)
        spark(tmp, (at.x - tmp.x) * 3, (at.y - tmp.y) * 3 + 0.5, (at.z - tmp.z) * 3, 0.42, 0.06 + 0.03 * rand(), sea ? 1 : 0);
      }
    },
    setNight(on) { colours.uShine.value = on ? 1.35 : 0.8; },
    update(dt, camera) {
      time += dt;
      sMat.uniforms.uTime.value = time; hMat.uniforms.uTime.value = time;
      const beat = 0.5 + 0.5 * Math.sin(time * 34);
      // orbs: one that ran out goes out quickly
      for (const o of orbs) {
        if (!o.mesh.visible) continue;
        if (!o.live) { o.k -= dt / 0.1; if (o.k <= 0) { o.mesh.visible = false; continue; } }
        const u = o.mesh.material.uniforms;
        u.uK.value = Math.max(0, o.k); u.uBeat.value = beat;
        u.uSize.value = o.kind.size * (0.94 + 0.06 * beat) * (o.live ? 1 : 0.6 + 0.4 * o.k);
      }
      // the light at her hand: there while it is asked for
      for (const g of glows.values()) {
        g.k = clamp(g.k + (g.seen ? dt / 0.05 : -dt / 0.07), 0, 1);
        g.seen = false;
        g.mesh.visible = g.k > 0;
        if (!g.mesh.visible) continue;
        const u = g.mesh.material.uniforms;
        u.uK.value = g.k; u.uBeat.value = beat; u.uSize.value = g.size * (0.9 + 0.1 * beat);
      }
      // waves
      for (const w of waves) {
        if (!w.mesh.visible) continue;
        w.age += dt;
        if (!w.live) { w.k -= dt / 0.12; if (w.k <= 0) { w.mesh.visible = false; continue; } }
        const u = w.mesh.material.uniforms;
        u.uK.value = Math.max(0, w.k) * Math.min(1, w.age / 0.04); u.uAge.value = w.age;
      }
      // bursts
      for (const b of bursts) {
        if (b.t >= 1) continue;
        b.t = Math.min(1, b.t + dt / b.life);
        b.mesh.visible = b.t < 1;
        b.mesh.material.uniforms.uT.value = b.t;
      }
      // rings over the ground
      for (const r of rings) {
        if (r.t >= 1) continue;
        r.t = Math.min(1, r.t + dt / r.life);
        r.mesh.visible = r.t < 1;
        r.mesh.material.uniforms.uT.value = r.t;
      }
      // gates: opening, beating as they grow, a sparkle drifting off now and then; the lance through, a flare and gone
      // (nothing thrown: gone)
      for (const g of gates) {
        if (!g.mesh.visible) continue;
        g.age += dt;
        g.open = Math.min(1, g.open + dt / GATE.open);
        g.beat = Math.max(0, g.beat - dt / GATE.beat);
        g.radius += (g.want - g.radius) * Math.min(1, dt * 16);
        let flash = 0, wave = 0, grow = 1;
        if (g.fired >= 0) {
          g.fired += dt;
          const f = Math.min(1, g.fired / GATE.fire);
          flash = (1 - f) * (1 - f); wave = Math.max(0.001, f); grow = 1 + 0.15 * (1 - Math.pow(1 - f, 3));
          g.fade = clamp((f - 0.35) / 0.65, 0, 1);
        } else if (!g.live) g.fade = Math.min(1, g.fade + dt / GATE.end);
        if (g.fade >= 1) { g.mesh.visible = false; continue; }
        if (g.live && g.open > 0.4) {
          g.dust -= dt;
          if (g.dust <= 0) {
            g.dust = GATE.dust * (0.6 + 0.8 * rand());
            const a = rand() * 6.283, c = Math.cos(a), sn = Math.sin(a), v = 0.25 + 0.5 * rand();
            across(g.dir);
            side.copy(X).multiplyScalar(c).addScaledVector(Y, sn);
            tmp.copy(g.mesh.position).addScaledVector(side, g.radius * (0.7 + 0.6 * rand()));
            spark(tmp, side.x * v, side.y * v + 0.25, side.z * v, 0.6 + 0.5 * rand(), 0.035 + 0.035 * rand(), 1);
          }
        }
        const opened = 0.5 + 0.5 * (1 - Math.pow(1 - g.open, 3));
        g.mesh.scale.setScalar(Math.max(1e-4, g.radius * GATE.reach * opened * (1 + 0.14 * g.beat * g.beat) * grow));
        const u = g.mesh.material.uniforms;
        u.uOpen.value = g.open; u.uLevel.value = g.level; u.uBeat.value = g.beat; u.uFlash.value = flash; u.uWave.value = wave; u.uFade.value = g.fade; u.uAge.value = g.age;
      }
      // hoops of water
      for (const h of hoops) {
        if (h.t >= 1) continue;
        h.t = Math.min(1, h.t + dt / h.life);
        h.mesh.visible = h.t < 1;
        h.mesh.material.uniforms.uT.value = h.t;
      }
      // lances: each grows toward how grown it should be; its strip is laid from its tail to its point, facing the camera
      for (const l of lances) {
        leaves(l, dt, camera);
        if (!l.mesh.visible) continue;
        if (!l.live) { l.k -= dt / 0.1; if (l.k <= 0) { l.mesh.visible = false; continue; } }
        l.grown += (l.level - l.grown) * Math.min(1, dt * 14);
        const def = SHOTS.lance, i0 = Math.min(2, Math.floor(l.grown)), f = l.grown - i0;
        const mix = a => a[i0] + (a[i0 + 1] - a[i0]) * f;
        l.long = mix(def.long);
        l.hot += ((l.far > 0 ? 1 : 0) - l.hot) * Math.min(1, dt * 30);      // (thrown: white hot, and longer)
        const long = l.long * (1 + (FLIGHT.long - 1) * l.hot), wide = mix(def.wide) * (0.97 + 0.03 * beat);
        const pos = l.mesh.geometry.attributes.position;
        for (let i = 0; i < LANCE; i++) {
          const u = i / (LANCE - 1);
          tan.copy(l.head).addScaledVector(l.dir, -long * (1 - u));
          toCam.subVectors(camera.position, tan);
          side.crossVectors(l.dir, toCam).normalize();
          pos.setXYZ(i * 2, tan.x - side.x * wide, tan.y - side.y * wide, tan.z - side.z * wide);
          pos.setXYZ(i * 2 + 1, tan.x + side.x * wide, tan.y + side.y * wide, tan.z + side.z * wide);
        }
        pos.needsUpdate = true;
        const u = l.mesh.material.uniforms;
        u.uK.value = Math.max(0, l.k); u.uHot.value = l.hot; u.uAge.value = time;
      }
      // ribbons: every place on one grows older and is dropped; the strip is laid through what is left, facing the camera
      for (const r of ribbons) {
        if (r.key !== null && r.used && !r.seen) r.used = false;          // (a hand's ribbon nobody fed this frame: let go)
        r.seen = false;
        for (const p of r.pts) p.age += dt;
        while (r.pts.length && r.pts[r.pts.length - 1].age > r.life) r.pts.pop();
        const n = r.pts.length;
        r.mesh.visible = n > 1;
        if (n < 2) { if (!r.used) r.key = null; continue; }
        const pos = r.mesh.geometry.attributes.position, uv = r.mesh.geometry.attributes.uv;
        for (let i = 0; i < RIBBON; i++) {
          const j = Math.min(i, n - 1), p = r.pts[j].at;
          tan.subVectors(r.pts[Math.max(0, j - 1)].at, r.pts[Math.min(n - 1, j + 1)].at);
          toCam.subVectors(camera.position, p);
          side.crossVectors(tan, toCam);
          const l = side.length();
          const u = Math.min(1, r.pts[j].age / r.life);
          const w = l > 1e-6 && i < n ? r.width * (1 - 0.7 * u) / l : 0;
          pos.setXYZ(i * 2, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
          pos.setXYZ(i * 2 + 1, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
          uv.setX(i * 2, u); uv.setX(i * 2 + 1, u);
        }
        pos.needsUpdate = true; uv.needsUpdate = true;
      }
    },
    dispose() {
      square.dispose(); waveGeo.dispose(); sGeo.dispose(); hGeo.dispose(); flat.dispose();
      for (const r of ribbons) r.mesh.geometry.dispose();
      for (const l of lances) { l.mesh.geometry.dispose(); l.beam.mesh.geometry.dispose(); for (const w of l.wake) w.mesh.geometry.dispose(); }
      for (const m of made) m.dispose();
    },
  };
  fx.setNight(false);
  return fx;
}
