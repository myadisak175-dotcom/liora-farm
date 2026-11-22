/* ==========================================================================
   magic-combo-fx.js  —  the light of Vivi's magic combo (magic-combo.js): an orb of light gathered in her hand and
   thrown, the ribbon it leaves, the wave a cut sends out, the burst where one lands, a few gold sparks. Sky blue with
   gold; made for this, not taken from her other spells. One job: draw them. It decides nothing: the combo says where.

     const fx = createMagicComboFx()
     scene.add(fx.object)             (a page that dims its land by night draws this after the dimming, as the circles)
     fx.glow(key, at, size)           light gathered at a hand: call it every frame it is there (key: any name, one glow
                                      each); a frame it is not called, it goes out
     fx.trail(key, at)                a ribbon through where a hand has been: call it every frame of a swing; it fades
                                      away behind by itself
     const shot = fx.shot(kind)       something thrown. kind 'orb' | 'big': an orb with a ribbon behind it, shedding a
                                      gold spark now and then; 'wave' | 'rise': the wave of a cut, a curved band of
                                      light seen from behind as a crescent (wave: leaning, as her cut came down; rise:
                                      standing, off an upward sweep); 'lance': a spear of light, held in her hand
                                      while it grows and then thrown (the same one: far 0 while she holds it)
       shot.place(at, dir, far)       every frame: where it is (a lance: its point), the way it goes (unit), how far
                                      it has come (m)
       shot.size(level)               a lance: how grown it is (0..3); shot.long: its length now (m)
       shot.end(hit)                  it is over: it landed (the combo then asks for a burst) or ran out (it fades)
                                      A lance in flight leaves a long streak, two bands of wind winding round its way,
                                      petals of light and blue stars shed along it (as in the picture it was asked
                                      after: "ถ้าปาหอกเวท ขอเอฟเฟกต์คล้ายๆ มีวงแหวนเวท", 22 Nov 2026)
     const gate = fx.gate()           the magic circle a lance is thrown through: standing in the air, facing the way
                                      she aims (rings, marks round a band; grown: two squares turning, points round
                                      its rim, a cross)
       gate.place(at, dir, radius)    every frame: its middle, the way it faces (unit), its outer ring's radius (m)
       gate.size(level)               how grown (0..3): each time more of it is drawn, and it beats once
       gate.fire()                    the lance goes through it: it flares, a wave goes out round it, petals and stars
                                      are thrown out of it, and it breaks up
       gate.end()                     nothing is thrown after all: it breaks up
     fx.burst(at, size)               where one lands: a flash, a ring going out, gold sparks
     fx.ring(at, radius)              a ring of light going out over the ground from `at` to `radius` (she lands a leap)
     fx.motes(at, n, from)            n gold sparks drawn in to `at` from `from` m away (light being gathered)
     fx.update(dt, camera)            every frame
     fx.setNight(on)                  by night its light is let shine more
     fx.dispose()

   How it is drawn: light laid over the picture with one blend (what a thing covers hides what is behind it, its glow
   only adds), every material marked userData.noGrade (the light of the hour and the curse leave it alone). An orb, a
   glow, a burst: one square turned to the camera, all of it worked out by its shader. A ribbon: a strip through up to
   20 places, turned to the camera on the way (a lance: the same, pointed at both ends; the wind round a lance's way: the
   same, laid along a helix worked out anew each frame). Sparks and petals: one instanced square each, moved by its
   shader. The gate: one square, all of it drawn by its shader (as magic-circle-fx.js draws the jump's circles, and by
   its rules for a phone's GPU: every line always drawn and then masked, nothing that can be NaN, the result kept
   between 0 and 1). Few of anything: 8 orbs, 4 waves, 3 lances (2 bands of wind each), 2 gates, 3 rings, 6 bursts,
   10 ribbons, 96 sparks, 48 petals at most. Phone-safe shaders: no arrays, no loops.
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
  lance: { long: [0.75, 1.05, 1.4, 1.8], thick: [0.05, 0.065, 0.085, 0.11], tip: [0.16, 0.2, 0.26, 0.34], ribbon: 0.14 },      // by how grown it is
};
const LANCE = 10;                                       // places along a lance
const RIBBON = 20, SPARKS = 96, PETALS = 48;
// the wind round a lance's way: two bands winding round it behind its point. long: m of its way they lie along; pitch: m
// to a turn; r0, grow, widest: how far from the way (m: at its point, and more the further behind, by grow * m^0.75, up
// to `widest` m behind); wide: half a band's width (m); spin: how fast the whole turns (rad/s); after: s it takes to go
// once the lance is over, spreading `spread` m/s; streak: s the streak of light behind the lance lasts
const WIND = { places: 44, long: 12, pitch: 4.4, r0: 0.12, grow: 0.11, widest: 6, wide: 0.24, spin: 5, after: 0.34, spread: 0.7, streak: 0.22 };
// what a lance sheds on its way: a petal, a star every so many m (and as many again at random)
const SHED = { petal: 0.7, star: 0.5 };
// the gate: its square reaches so many radii (its points stand out past its rim); it opens in `open` s, beats `beat` s as
// it grows, and after the lance has gone through flares and is gone in `fire` s (nothing thrown: in `end` s)
const GATE = { reach: 1.5, open: 0.28, beat: 0.22, fire: 0.45, end: 0.2, petals: 10, stars: 8 };
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
  function takeRibbon(width, life, key = null) {
    const r = ribbons.find(o => !o.used && !o.pts.length) || ribbons.find(o => !o.used) || ribbons[0];
    r.pts.length = 0; r.width = width; r.life = life; r.used = true; r.key = key; r.seen = true;
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

  // ---- a lance: a strip from its tail to its point, widest two thirds of the way along, turned to the camera
  function makeLance() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(LANCE * 2 * 3), uv = new Float32Array(LANCE * 2 * 2), idx = [];
    for (let i = 0; i < LANCE; i++) { uv[i * 4] = uv[i * 4 + 2] = i / (LANCE - 1); uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < LANCE - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...colours, uK: { value: 1 } },
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain, uDeep;
        uniform float uK, uShine;
        varying vec2 vUv;
        void main() {
          float across = 1.0 - vUv.y * vUv.y;
          float heart = smoothstep(0.45, 0.95, across);                     // the white line down its middle
          float a = pow(across, 0.6) * (0.4 + 0.6 * vUv.x);                 // brighter toward its point
          vec3 col = mix(mix(uDeep, uMain, across), uCore, heart);
          gl_FragColor = vec4(col * a * uK * (0.8 + 0.3 * uShine), a * (0.4 + 0.55 * heart) * uK);
        }`,
    });
    return { mesh: put(geo, mat), live: false, k: 0, level: 0, long: 0, grown: 0, tip: null, ribbon: null, head: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1),
      // in flight: where it was thrown from, how far it has come (m), two ways across its own (for the wind round it),
      // how long it has flown and how long it has been over (s), how much of its wind is left, what it sheds next (m)
      from: new THREE.Vector3(), far: 0, X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), flown: 0, gone: 0, windK: 0, petalAt: 0, starAt: 0,
      wind: [makeWind(), makeWind()] };
  }
  // ---- a band of wind round a lance's way: a strip along a helix, turned to the camera
  function makeWind() {
    const N = WIND.places, geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), idx = [];
    for (let i = 0; i < N; i++) { uv[i * 4] = uv[i * 4 + 2] = i / (N - 1); uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...colours, uK: { value: 1 } },
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain;
        uniform float uK, uShine;
        varying vec2 vUv;                                                  // x: 0 at the lance's point .. 1 where it ends; y: across
        void main() {
          float across = max(0.0, 1.0 - vUv.y * vUv.y);
          float along = smoothstep(0.0, 0.08, vUv.x) * pow(clamp(1.0 - vUv.x, 0.0, 1.0), 1.2);
          // a band of wind: a thin bright line along one edge, the rest of it a wash of blue thinning to the other
          float rim = clamp(1.0 - abs(vUv.y - 0.55) * 4.0, 0.0, 1.0);
          float wash = across * (0.5 + 0.35 * clamp(vUv.y * 0.5 + 0.5, 0.0, 1.0));
          float a = min(1.0, wash + rim * rim) * along * across;
          vec3 col = mix(uMain, uCore, clamp(rim * rim, 0.0, 1.0));
          gl_FragColor = clamp(vec4(col * a * uK * (0.75 + 0.3 * uShine), a * 0.5 * uK), 0.0, 1.0);
        }`,
    });
    return { mesh: put(geo, mat) };
  }
  const lances = Array.from({ length: 3 }, makeLance);
  const windAt = new Float32Array(WIND.places * 3);

  // ---- the gate: a magic circle standing in the air, which a lance is thrown through. One square; all of it is drawn
  // by its shader from where on it a pixel is (in radii: its outer ring at 1)
  const gateMat = () => material({
    uniforms: { ...colours, uOpen: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 }, uFlash: { value: 0 }, uWave: { value: 0 }, uFade: { value: 0 }, uAge: { value: 0 } },
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
      // n points standing on the rim, each a thin spike len long
      float points(float r, float a, float n, float len) {
        float sec = TAU / n, f = mod(a + sec * 0.5, sec) - sec * 0.5, x = r - 1.0;
        return line(abs(f) * r - (len - x) * 0.3, 0.024) * step(0.0, x) * step(x, len);
      }
      void main() {
        vec2 p = vP;
        float r = length(p), a = atan(p.y, abs(p.x) < 1e-6 ? 1e-6 : p.x);  // (no angle at the very middle)
        float t = uAge, spinA = t * 1.1, spinB = -t * 1.7;                 // the band of marks and the figures inside turn opposite ways
        float L = 0.0;
        // two rings round the rim, one inside them, a small one in the middle (the lance goes through it)
        L = max(L, line(r - 1.0, 0.04) * drawn(a, 0.0, 0.0));
        L = max(L, line(r - 0.9, 0.02) * drawn(a, 0.08, 0.5));
        L = max(L, line(r - 0.64, 0.024) * drawn(a, 0.18, 0.25));
        L = max(L, line(r - 0.2, 0.022) * drawn(a, 0.3, 0.6));
        // the band of marks between them
        L = max(L, runes(r, a + spinA, 0.69, 0.86, 22.0) * step(0.3, uOpen) * 0.95);
        // grown once: two squares turning, an eight-pointed star
        if (uLevel > 0.5) {
          vec2 q = rot(p, spinB * 0.6);
          L = max(L, line(sq(q, 0.4525), 0.022));
          L = max(L, line(sq(rot(q, PI * 0.25), 0.4525), 0.022));
        }
        // twice: four long points round its rim and four short between them, a thin ring outside
        if (uLevel > 1.5) {
          L = max(L, points(r, a, 4.0, 0.42));
          L = max(L, points(r, a + PI * 0.25, 4.0, 0.2));
          L = max(L, line(r - 1.07, 0.014));
        }
        // full grown: a cross turning through the middle, a ring round it
        if (uLevel > 2.5) {
          float f = mod(a + spinB + PI * 0.25, PI * 0.5) - PI * 0.25;
          L = max(L, line(f * r, 0.016) * step(0.2, r) * step(r, 0.64) * 0.85);
          L = max(L, line(r - 0.42, 0.016));
        }
        // the lance has gone through: a wave going out round the rim
        float out_ = 1.0 - pow(clamp(1.0 - uWave, 0.0, 1.0), 3.0);
        float W = line(r - (1.0 + 0.42 * out_), 0.03 + 0.05 * (1.0 - uWave)) * (1.0 - uWave) * (1.0 - uWave) * step(0.0005, uWave);
        // glow: round the rim, over its whole face a little, most in the middle
        float G = exp(-abs(r - 1.0) * 14.0) * 0.5 + exp(-abs(r - 0.64) * 20.0) * 0.22 + (1.0 - smoothstep(0.2, 1.05, r)) * 0.14 + exp(-r * 5.0) * (0.5 + 1.1 * uFlash);
        G *= smoothstep(0.0, 0.25, uOpen) * step(r, 1.45) * (1.0 + 0.5 * uBeat + 0.5 * uFlash);
        // going: it breaks into bits (by angle and by ring), from the middle out
        float bit = hash(floor((a / TAU + 0.5) * 40.0) + floor(r * 14.0) * 41.0);
        float keep = step(uFade * 1.25 - r * 0.25, bit * 0.9 + 0.08);
        float pulse = 0.9 + 0.1 * sin(t * 21.0);
        L *= keep * pulse;
        G *= (1.0 - uFade) * pulse;
        float A = clamp(L + W, 0.0, 1.0);
        vec3 lineCol = mix(uMain, uCore, clamp(smoothstep(0.55, 1.0, L) * 0.5 + 0.5 * uBeat + uFlash + W, 0.0, 1.0));
        vec3 col = lineCol * A + uDeep * G + uCore * exp(-r * 5.0) * uFlash * 0.6;
        gl_FragColor = clamp(vec4(col * (0.75 + 0.35 * uShine), A * 0.85 + min(1.0, G) * 0.45), 0.0, 1.0);
      }`,
  });
  const gates = Array.from({ length: 2 }, () => ({ mesh: put(square, gateMat()), live: false, open: 0, level: 0, beat: 0, fired: -1, fade: 1, age: 0, radius: 0, want: 0, fresh: true, dir: new THREE.Vector3(0, 0, 1) }));

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

  // ---- sparks: gold, four-pointed; thrown out, slowing, falling a little, going out (all in the shader)
  const sGeo = new THREE.InstancedBufferGeometry();
  sGeo.index = square.index;
  sGeo.setAttribute('position', square.attributes.position);
  const sAt = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sVel = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sData = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 4), 4).setUsage(THREE.DynamicDrawUsage);      // born, life, size, turn
  const sTint = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS), 1).setUsage(THREE.DynamicDrawUsage);         // 0: gold; 1: blue (a star off a lance)
  for (let j = 0; j < SPARKS; j++) sData.setXYZW(j, -1000, 1, 0, 0);                                                      // (none yet)
  sGeo.setAttribute('aAt', sAt); sGeo.setAttribute('aVel', sVel); sGeo.setAttribute('aData', sData); sGeo.setAttribute('aTint', sTint);
  sGeo.instanceCount = SPARKS;
  const sMat = material({
    uniforms: { ...colours, uTime: { value: 0 } },
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
        vec3 p = aAt + aVel * slow - vec3(0.0, 0.7 * age * age, 0.0);
        float twinkle = 0.7 + 0.3 * sin(uTime * 26.0 + aData.w * 50.0);
        float s = aData.z * on * smoothstep(0.0, 0.12, u) * pow(max(0.0, 1.0 - u), 0.6) * twinkle;
        float c = cos(aData.w), sn = sin(aData.w);
        vP = position.xy; vU = u; vTint = aTint;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        mv.xy += mat2(c, -sn, sn, c) * position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uGold, uMain;
      uniform float uShine;
      varying vec2 vP;
      varying float vU, vTint;
      void main() {
        vec2 q = abs(vP);
        float star = max(0.0, 1.0 - (q.x * q.y * 30.0 + (q.x + q.y) * 0.95));
        float heart = 1.0 - smoothstep(0.0, 0.2, length(vP));
        float a = clamp(star + heart, 0.0, 1.0);
        vec3 col = mix(mix(uGold, uMain, vTint), uCore, heart * 0.8);
        gl_FragColor = vec4(col * a * (0.8 + 0.4 * uShine), a * 0.55);
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
  // ---- petals of light: a leaf shape, thrown out, slowing, tumbling and turning over as it drifts, going out
  const pGeo = new THREE.InstancedBufferGeometry();
  pGeo.index = square.index;
  pGeo.setAttribute('position', square.attributes.position);
  const pAt = new THREE.InstancedBufferAttribute(new Float32Array(PETALS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const pVel = new THREE.InstancedBufferAttribute(new Float32Array(PETALS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const pData = new THREE.InstancedBufferAttribute(new Float32Array(PETALS * 4), 4).setUsage(THREE.DynamicDrawUsage);      // born, life, size (half its length, m), turn
  for (let j = 0; j < PETALS; j++) pData.setXYZW(j, -1000, 1, 0, 0);
  pGeo.setAttribute('aAt', pAt); pGeo.setAttribute('aVel', pVel); pGeo.setAttribute('aData', pData);
  pGeo.instanceCount = PETALS;
  const pMat = material({
    uniforms: { ...colours, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aAt, aVel;
      attribute vec4 aData;
      uniform float uTime;
      varying vec2 vP;
      void main() {
        float age = uTime - aData.x, u = age / aData.y;
        float on = step(0.0, age) * step(u, 1.0);
        float slow = (1.0 - exp(-2.6 * age)) / 2.6;
        vec3 p = aAt + aVel * slow - vec3(0.0, 0.3 * age * age, 0.0);
        float s = aData.z * on * smoothstep(0.0, 0.1, u) * pow(max(0.0, 1.0 - u), 0.5);
        float ang = aData.w + age * (fract(aData.w * 3.7) - 0.5) * 14.0;   // it tumbles
        float c = cos(ang), sn = sin(ang);
        float flip = 0.4 + 0.6 * abs(cos(age * 8.0 + aData.w * 5.0));      // and turns over: now broad, now nearly edge on
        vP = position.xy;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        mv.xy += mat2(c, -sn, sn, c) * (position.xy * vec2(1.0, 0.4 * flip)) * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain;
      uniform float uShine;
      varying vec2 vP;
      void main() {
        float y = abs(vP.y);
        float w = max(0.0, 1.0 - vP.x * vP.x) * (0.78 + 0.22 * vP.x);      // a leaf: pointed at both ends, broader toward one
        float body = 1.0 - smoothstep(w - 0.2, w, y);
        float vein = 1.0 - smoothstep(0.0, 0.2, y);
        float a = body * (0.5 + 0.5 * vein);
        vec3 col = mix(uMain, uCore, 0.3 + 0.7 * vein * body);
        gl_FragColor = clamp(vec4(col * a * (0.8 + 0.35 * uShine), a * 0.6), 0.0, 1.0);
      }`,
  });
  const petals = put(pGeo, pMat);
  petals.visible = true;
  let pNext = 0;
  function petal(at, vx, vy, vz, life, size) {
    const j = pNext; pNext = (pNext + 1) % PETALS;
    pAt.setXYZ(j, at.x, at.y, at.z); pVel.setXYZ(j, vx, vy, vz); pData.setXYZW(j, time, life, size, rand() * 6.283);
    pAt.needsUpdate = pVel.needsUpdate = pData.needsUpdate = true;
  }
  // n sparks thrown out from a place, every way (up a little more than down)
  function scatter(at, n, speed, size) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.283, z = rand() * 1.6 - 0.6, r = Math.sqrt(Math.max(0, 1 - Math.min(1, z * z))), v = speed * (0.55 + 0.6 * rand());
      spark(at, Math.cos(a) * r * v, z * v + 0.6, Math.sin(a) * r * v, 0.35 + 0.3 * rand(), size * (0.7 + 0.6 * rand()));
    }
  }

  const tmp = new THREE.Vector3(), side = new THREE.Vector3(), tan = new THREE.Vector3(), toCam = new THREE.Vector3();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), basis = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);

  // what a lance sheds `at` m along its way: a petal of light (or a blue star), from beside it, thrown out and on
  function shed(l, at, leaf) {
    const a = rand() * 6.283, c = Math.cos(a), sn = Math.sin(a), out = 0.12 + 0.28 * rand();
    side.copy(l.X).multiplyScalar(c).addScaledVector(l.Y, sn);
    tmp.copy(l.from).addScaledVector(l.dir, at).addScaledVector(side, out);
    const v = 1 + 1.8 * rand(), f = 3 + 3 * rand(), d = l.dir;
    if (leaf) petal(tmp, side.x * v + d.x * f, side.y * v + d.y * f + 0.5, side.z * v + d.z * f, 0.5 + 0.35 * rand(), 0.09 + 0.07 * rand() + 0.02 * l.level);
    else spark(tmp, side.x * v + d.x * f * 0.6, side.y * v + d.y * f * 0.6 + 0.6, side.z * v + d.z * f * 0.6, 0.35 + 0.3 * rand(), 0.07 + 0.05 * rand(), 1);
  }
  // the wind round a lance's way: each band's strip laid along its helix, from the lance's point back
  function blow(l, dt, camera) {
    const on = l.far > 0 && l.windK > 0;
    if (!on) { for (const w of l.wind) w.mesh.visible = false; return; }
    l.flown += dt;
    if (!l.live) { l.gone += dt; l.windK = Math.max(0, l.windK - dt / WIND.after); }
    const N = WIND.places, long = Math.min(l.far, WIND.long), big = 1 + 0.1 * l.level;
    for (let b = 0; b < 2; b++) {
      const w = l.wind[b], pos = w.mesh.geometry.attributes.position;
      const pitch = WIND.pitch * (b ? 1.3 : 1), phase = b * Math.PI + (b ? 0.7 : 0);
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1), back = u * long, at = l.far - back;
        const r = (WIND.r0 + WIND.grow * Math.pow(Math.min(back, WIND.widest), 0.75)) * big * (b ? 1.25 : 1) + WIND.spread * l.gone * (0.4 + u);
        const th = phase + at * 6.2832 / pitch + l.flown * WIND.spin, c = Math.cos(th) * r, sn = Math.sin(th) * r;
        windAt[i * 3] = l.from.x + l.dir.x * at + l.X.x * c + l.Y.x * sn;
        windAt[i * 3 + 1] = l.from.y + l.dir.y * at + l.X.y * c + l.Y.y * sn;
        windAt[i * 3 + 2] = l.from.z + l.dir.z * at + l.X.z * c + l.Y.z * sn;
      }
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1), i0 = Math.max(0, i - 1) * 3, i1 = Math.min(N - 1, i + 1) * 3, j = i * 3;
        tan.set(windAt[i0] - windAt[i1], windAt[i0 + 1] - windAt[i1 + 1], windAt[i0 + 2] - windAt[i1 + 2]);
        toCam.set(camera.position.x - windAt[j], camera.position.y - windAt[j + 1], camera.position.z - windAt[j + 2]);
        side.crossVectors(tan, toCam);
        const len = side.length();
        const wide = len > 1e-6 ? WIND.wide * big * Math.sin(Math.PI * Math.pow(u, 0.6)) / len : 0;
        pos.setXYZ(i * 2, windAt[j] - side.x * wide, windAt[j + 1] - side.y * wide, windAt[j + 2] - side.z * wide);
        pos.setXYZ(i * 2 + 1, windAt[j] + side.x * wide, windAt[j + 1] + side.y * wide, windAt[j + 2] + side.z * wide);
      }
      pos.needsUpdate = true;
      w.mesh.visible = true;
      w.mesh.material.uniforms.uK.value = l.windK * Math.min(1, l.far / 1.2);
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
        const l = lances.find(o => !o.mesh.visible && o.windK <= 0) || lances.find(o => !o.mesh.visible) || lances[0];
        l.live = true; l.k = 1; l.level = 0; l.grown = 0; l.long = def.long[0]; l.mesh.visible = true;
        l.tip = orbs.find(v => !v.mesh.visible) || orbs[0];
        l.tip.live = true; l.tip.k = 1; l.tip.kind = { size: def.tip[0] }; l.tip.mesh.visible = true; l.tip.ribbon = null;
        l.ribbon = null;
        l.far = 0; l.flown = 0; l.gone = 0; l.windK = 0;
        return {
          get long() { return l.long; },
          size(level) { l.level = Math.max(0, Math.min(3, level)); },
          place(at, dir, far = 0) {
            l.head.copy(at); l.dir.copy(dir).normalize();
            l.tip.mesh.position.copy(at);
            if (far <= 0) return;
            // in flight: a streak behind it; the wind round its way; petals and stars shed from beside it as it goes
            if (!l.ribbon) l.ribbon = takeRibbon(def.ribbon + 0.05 * l.level, WIND.streak);
            feed(l.ribbon, at);
            if (l.far <= 0) {
              l.from.copy(at).addScaledVector(l.dir, -far);
              l.X.crossVectors(UP, l.dir);
              if (l.X.lengthSq() < 1e-6) l.X.set(1, 0, 0);
              l.X.normalize(); l.Y.crossVectors(l.dir, l.X);
              l.windK = 1; l.petalAt = 0.5; l.starAt = 0.25;
            }
            l.far = far;
            while (far >= l.petalAt) { shed(l, l.petalAt, true); l.petalAt += SHED.petal * (1 + rand()); }
            while (far >= l.starAt) { shed(l, l.starAt, false); l.starAt += SHED.star * (1 + rand()); }
          },
          end() { l.live = false; l.tip.live = false; if (l.ribbon) l.ribbon.used = false; },
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
    burst(at, size = 0.7) {
      const b = bursts.find(o => o.t >= 1) || bursts.reduce((m, o) => (o.t > m.t ? o : m));
      b.t = 0; b.life = 0.24 + 0.1 * Math.min(1.5, size);
      b.mesh.position.copy(at); b.mesh.visible = true;
      b.mesh.material.uniforms.uSize.value = size;
      scatter(at, Math.round(5 + 5 * Math.min(2, size)), 2.2 + 1.6 * size, 0.07 + 0.05 * Math.min(2, size));
    },
    ring(at, radius = 2) {
      const r = rings.find(o => o.t >= 1) || rings[0];
      r.t = 0; r.life = 0.32 + 0.05 * radius;
      r.mesh.position.copy(at); r.mesh.scale.setScalar(radius); r.mesh.visible = true;
      scatter(at, 8, 3.2, 0.09);
    },
    gate() {
      const g = gates.find(o => !o.mesh.visible) || gates[0];
      g.live = true; g.open = 0; g.level = 0; g.beat = 0; g.fired = -1; g.fade = 0; g.age = rand() * 10; g.fresh = true;
      return {
        place(at, dir, radius) {
          g.mesh.position.copy(at);
          g.dir.copy(dir).normalize();
          X.crossVectors(UP, g.dir);
          if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
          X.normalize(); Y.crossVectors(g.dir, X);
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
          // petals and stars thrown out of it, round its rim and on the way the lance goes
          X.crossVectors(UP, g.dir);
          if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
          X.normalize(); Y.crossVectors(g.dir, X);
          const R = g.radius, d = g.dir;
          for (let i = 0; i < GATE.petals + GATE.stars; i++) {
            const a = rand() * 6.283, c = Math.cos(a), sn = Math.sin(a), out = R * (0.45 + 0.6 * rand());
            side.copy(X).multiplyScalar(c).addScaledVector(Y, sn);
            tmp.copy(g.mesh.position).addScaledVector(side, out);
            const v = 2.4 + 2.2 * rand(), f = 1 + 2.5 * rand();
            if (i < GATE.petals) petal(tmp, side.x * v + d.x * f, side.y * v + d.y * f + 0.4, side.z * v + d.z * f, 0.5 + 0.35 * rand(), R * (0.22 + 0.16 * rand()));
            else spark(tmp, side.x * v * 1.3 + d.x * f, side.y * v * 1.3 + d.y * f + 0.5, side.z * v * 1.3 + d.z * f, 0.4 + 0.3 * rand(), R * (0.14 + 0.1 * rand()), 1);
          }
        },
        end() { g.live = false; },
      };
    },
    motes(at, n = 1, from = 0.6) {
      for (let i = 0; i < n; i++) {
        const a = rand() * 6.283, z = rand() * 1.4 - 0.4, r = Math.sqrt(Math.max(0, 1 - Math.min(1, z * z)));
        tmp.set(at.x + Math.cos(a) * r * from, at.y + z * from, at.z + Math.sin(a) * r * from);
        // (a spark slows to a third of its first pace's reach: sent three times as fast as the way is long, it ends at `at`)
        spark(tmp, (at.x - tmp.x) * 3, (at.y - tmp.y) * 3 + 0.5, (at.z - tmp.z) * 3, 0.42, 0.06 + 0.03 * rand());
      }
    },
    setNight(on) { colours.uShine.value = on ? 1.35 : 0.8; },
    update(dt, camera) {
      time += dt;
      sMat.uniforms.uTime.value = time; pMat.uniforms.uTime.value = time;
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
      // gates: opening, beating as they grow; the lance through, a flare and gone (nothing thrown: gone)
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
          flash = (1 - f) * (1 - f); wave = Math.max(0.001, f); grow = 1 + 0.25 * (1 - Math.pow(1 - f, 3));
          g.fade = clamp((f - 0.3) / 0.7, 0, 1);
        } else if (!g.live) g.fade = Math.min(1, g.fade + dt / GATE.end);
        if (g.fade >= 1) { g.mesh.visible = false; continue; }
        const opened = 0.5 + 0.5 * (1 - Math.pow(1 - g.open, 3));
        g.mesh.scale.setScalar(Math.max(1e-4, g.radius * GATE.reach * opened * (1 + 0.14 * g.beat * g.beat) * grow));
        const u = g.mesh.material.uniforms;
        u.uOpen.value = g.open; u.uLevel.value = g.level; u.uBeat.value = g.beat; u.uFlash.value = flash; u.uWave.value = wave; u.uFade.value = g.fade; u.uAge.value = g.age;
      }
      // lances: each grows toward how grown it should be; its strip is laid from its tail to its point, facing the camera
      for (const l of lances) {
        blow(l, dt, camera);
        if (!l.mesh.visible) continue;
        if (!l.live) { l.k -= dt / 0.1; if (l.k <= 0) { l.mesh.visible = false; continue; } }
        l.grown += (l.level - l.grown) * Math.min(1, dt * 14);
        const def = SHOTS.lance, i0 = Math.min(2, Math.floor(l.grown)), f = l.grown - i0;
        const mix = a => a[i0] + (a[i0 + 1] - a[i0]) * f;
        l.long = mix(def.long);
        const thick = mix(def.thick) * (0.94 + 0.06 * beat);
        l.tip.kind.size = mix(def.tip);
        const pos = l.mesh.geometry.attributes.position;
        for (let i = 0; i < LANCE; i++) {
          const u = i / (LANCE - 1);
          tan.copy(l.head).addScaledVector(l.dir, -l.long * (1 - u));
          toCam.subVectors(camera.position, tan);
          side.crossVectors(l.dir, toCam).normalize();
          const w = thick * Math.sin(Math.PI * Math.pow(u, 1.7));
          pos.setXYZ(i * 2, tan.x - side.x * w, tan.y - side.y * w, tan.z - side.z * w);
          pos.setXYZ(i * 2 + 1, tan.x + side.x * w, tan.y + side.y * w, tan.z + side.z * w);
        }
        pos.needsUpdate = true;
        l.mesh.material.uniforms.uK.value = Math.max(0, l.k);
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
      square.dispose(); waveGeo.dispose(); sGeo.dispose(); pGeo.dispose(); flat.dispose();
      for (const r of ribbons) r.mesh.geometry.dispose();
      for (const l of lances) { l.mesh.geometry.dispose(); for (const w of l.wind) w.mesh.geometry.dispose(); }
      for (const m of made) m.dispose();
    },
  };
  fx.setNight(false);
  return fx;
}
