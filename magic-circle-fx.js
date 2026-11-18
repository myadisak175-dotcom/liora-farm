/* ==========================================================================
   magic-circle-fx.js  —  the magic circles of Vivi's magic jump (magic-jump.js), as in the clip it was asked after (a girl
   running with a glowing circle opening under each step: rings, marks round a band, a crystal standing in the middle,
   light going up off it, sparks. The clip's ribbon of light curling round her legs was tried and taken out: too busy).
   One job: draw them. It decides nothing: the jump says where a circle opens and how grand.

     const fx = createMagicCircles({ lift })   lift: how far over the ground a circle on the ground lies (m): over the
                                     grass, its blades' tips coming through it
     scene.add(fx.object)
     fx.open(at, tier, { ground })   a circle opens at `at` (world; flat, facing up). tier 1..4: each a little grander than
                                     the one before (1: rings; 2: + marks round a band, the cross, the crystal; 3: + two
                                     squares turning, light off it; 4: + a star and points round its rim, the most sparks).
                                     tier 'land': the circle that catches a long fall. ground: on the ground (its light goes
                                     up) or in the air (she pushes off it: its light goes down, it breaks up sooner)
     every frame: fx.update(dt, camera)
     fx.setLook('rose' | 'water')   the clip's rose light, or the cold blue of her water barrier (barrier-fx.js)
     fx.setNight(on)                by night the light is let shine more (the page dims the land, not this)
     fx.dispose()

   How it is drawn, all of it light laid over the picture (one blend: a line covers what is under it, its glow adds to it):
     - a circle: one flat square, everything on it worked out by the shader from where it is on it. Its light: an open tube
       standing on it (up off the ground, down under her in the air). The crystal: a small stretched octahedron. 3 draws
       each, 8 circles at most
     - sparks: one cloud of points shared by every circle
   ========================================================================== */
import * as THREE from 'three';

const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

// the light: the line's heart (near white), the line, the glow round it
export const CIRCLE_LOOKS = {
  rose: { core: '#fff2f5', main: '#ff76a0', deep: '#ea3a6e' },            // the clip's
  water: { core: '#f0fbff', main: '#6fcbff', deep: '#2b86dc' },           // the barrier's cold blue (BARRIER_LOOK.spark)
};

// each kind of circle: radius (m, for a 1.75 m caster), how long it lasts (s), sparks, its light's height (m; 0: none)
const KINDS = {
  1: { radius: 0.5, life: 0.62, sparks: 10, pillar: 0, petals: 0 },
  2: { radius: 0.62, life: 0.7, sparks: 16, pillar: 0, petals: 0 },
  3: { radius: 0.74, life: 0.8, sparks: 24, pillar: 0.9, petals: 0 },
  4: { radius: 0.95, life: 1.05, sparks: 40, pillar: 1.3, petals: 1 },
  land: { radius: 0.9, life: 1.0, sparks: 30, pillar: 1.5, petals: 1 },
};
const SLOTS = 8;
// one blend for all of it: what the shader gives is already multiplied by its own cover; a line's cover (alpha) hides what
// is under it, glow comes with no cover and only adds
const BLEND = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation };

/* ---------------------------------------------------------------- the circle: a flat square, drawn by its shader */
const DISC_V = /* glsl */`
  varying vec2 vP;
  void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DISC_F = /* glsl */`
  #define PI 3.14159265
  #define TAU 6.2831853
  uniform vec3 uCore, uMain, uDeep;
  uniform float uTier, uOpen, uFade, uAge, uSeed, uPetals, uGlow, uCover, uDay;
  varying vec2 vP;                                    // in radii: the outer ring at 1
  float line(float d, float w) { float f = fwidth(d) * 1.2 + 0.002; return 1.0 - smoothstep(w * 0.5, w * 0.5 + f, abs(d)); }
  vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
  float hash(float n) { return fract(sin(n * 78.233 + uSeed * 9.1) * 43758.5453); }
  // how much of a ring is drawn yet: each draws itself round from its own starting point, 'at' into the opening
  float drawn(float a, float at, float from) {
    float s = fract((a + PI) / TAU + from);
    return step(s, clamp((uOpen - at) * 2.6, 0.0, 1.0));
  }
  // the marks round a band (r0..r1): n cells, each a little glyph of strokes picked by a hash
  float runes(vec2 p, float r, float a, float r0, float r1, float n) {
    float v = (r - r0) / (r1 - r0);
    if (v < 0.0 || v > 1.0) return 0.0;
    float s = (a / TAU + 0.5) * n, id = floor(s), u = fract(s);
    float h = hash(id), h2 = hash(id + 17.0);
    vec2 q = vec2((u - 0.5) * r * TAU / n / (r1 - r0), v - 0.5);          // in the band's height
    float w = 0.13, g = line(q.x, w) * step(abs(q.y), 0.3);                // a stem
    if (h > 0.45) g = max(g, line(q.y - 0.2, w) * step(abs(q.x), 0.24));  // a bar over it
    if (h2 > 0.5) g = max(g, line(length(q - vec2(0.0, -0.14)) - 0.12, w));   // a ring at its foot
    if (h < 0.3) g = max(g, line(q.y + q.x * 1.3, w) * step(abs(q.x), 0.2));  // a slash
    if (h2 < 0.2) g = max(g, line(q.y + 0.24, w) * step(abs(q.x), 0.24));    // a bar under it
    return g;
  }
  float sq(vec2 p, float s) { vec2 q = abs(p); return max(q.x, q.y) - s; }
  float tri(vec2 p, float r) {                        // an equilateral triangle (iq's)
    const float k = 1.7320508;
    p.x = abs(p.x) - r; p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
  }
  void main() {
    vec2 p = vP;
    float r = length(p), a = atan(p.y, p.x);
    float t = uAge;
    float spinA = t * 0.9, spinB = -t * 1.4;          // the outer band and the inner figures turn opposite ways
    float L = 0.0;                                    // lines (0..1)
    // the two rings round the rim, and a thin one inside them
    L = max(L, line(r - 1.0, 0.035) * drawn(a, 0.0, 0.0));
    L = max(L, line(r - 0.9, 0.018) * drawn(a, 0.08, 0.5));
    L = max(L, line(r - 0.64, 0.022) * drawn(a, 0.18, 0.25));
    // the band of marks between them (2+)
    if (uTier > 1.5) L = max(L, runes(p, r, a + spinA, 0.69, 0.86, uTier > 2.5 ? 30.0 : 22.0) * step(0.3, uOpen) * 0.95);
    // the cross through the middle (2+), turning
    if (uTier > 1.5) {
      float f = mod(a + spinB + PI * 0.25, PI * 0.5) - PI * 0.25;
      L = max(L, line(f * r, 0.014) * step(0.13, r) * step(r, 0.64) * step(0.35, uOpen) * 0.8);
    }
    // two squares (3+): an eight-pointed star
    if (uTier > 2.5) {
      vec2 q = rot(p, spinB * 0.6);
      float s = 0.64 * 0.7071;
      L = max(L, line(sq(q, s), 0.02) * step(0.45, uOpen));
      L = max(L, line(sq(rot(q, PI * 0.25), s), 0.02) * step(0.5, uOpen));
    }
    // a six-pointed star turning the other way, and a ring at its heart (4)
    if (uTier > 3.5) {
      vec2 q = rot(p, -spinB * 0.8);
      L = max(L, line(tri(q, 0.36), 0.016) * step(0.55, uOpen));
      L = max(L, line(tri(rot(q, PI), 0.36), 0.016) * step(0.55, uOpen));
      L = max(L, line(r - 0.24, 0.014) * drawn(a, 0.5, 0.75));
    }
    // points round the rim, like a flower's (the grandest circles)
    if (uPetals > 0.5) {
      float n = 8.0, sec = TAU / n;
      float f = mod(a + spinA * 0.5 + sec * 0.5, sec) - sec * 0.5;
      float x = r - 1.0, len = 0.26;
      float half_ = (len - x) * 0.42;
      L = max(L, line(abs(f) * r - half_, 0.022) * step(0.0, x) * step(x, len) * step(0.4, uOpen));
      L = max(L, line(r - 1.06, 0.012) * step(0.4, uOpen));
    }
    // the mark in the middle: a diamond, and a dot
    {
      vec2 q = rot(p, spinB);
      L = max(L, line(abs(q.x) + abs(q.y) * 1.5 - 0.1, 0.02));
    }
    // glow: round the rim, over the whole face a little, strongest in the middle
    float G = exp(-abs(r - 1.0) * 16.0) * 0.55 + exp(-abs(r - 0.64) * 22.0) * 0.25 + smoothstep(1.05, 0.2, r) * 0.16 + exp(-r * 7.0) * 0.6;
    if (uPetals > 0.5) G += exp(-abs(r - 1.12) * 10.0) * 0.18;
    G *= uGlow * smoothstep(0.0, 0.25, uOpen) * step(r, 1.4);
    // going: breaks into bits (the bits by angle and ring), the outer ones first
    float bit = hash(floor((a / TAU + 0.5) * 40.0) + floor(r * 14.0) * 41.0);
    float keep = step(uFade * 1.25 - r * 0.25, bit * 0.9 + 0.08);
    float pulse = 0.88 + 0.12 * sin(t * 21.0 + uSeed);
    L *= keep * pulse;
    G *= (1.0 - uFade) * pulse;
    vec3 lineCol = mix(uMain, uCore, smoothstep(0.55, 1.0, L) * mix(0.65, 0.3, uDay));
    float A = clamp(L, 0.0, 1.0);
    vec3 col = lineCol * A + uDeep * G;
    // by day the glow covers a little of what is under it too: light added to green grass would only turn it yellow
    gl_FragColor = vec4(col, A * uCover + min(1.0, G) * uDay * 0.6);
  }`;

/* ---------------------------------------------------------------- its light: an open tube of streaks */
const PILLAR_V = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PILLAR_F = /* glsl */`
  uniform vec3 uMain, uDeep, uCore;
  uniform float uK, uAge, uSeed, uDay;
  varying vec2 vUv;                                   // x round the tube, y up it from the circle (0) to its end (1)
  float hash(float n) { return fract(sin(n * 91.7 + uSeed * 3.3) * 43758.5453); }
  void main() {
    float n = 26.0, s = vUv.x * n, id = floor(s), u = fract(s);
    float h = hash(id);
    float streak = smoothstep(0.45, 0.95, h) * (1.0 - smoothstep(0.0, 0.42, abs(u - 0.5)));
    float len = 0.45 + 0.55 * hash(id + 7.0);         // each streak its own length
    float y = vUv.y / len;
    float along = (1.0 - smoothstep(0.0, 1.0, y)) * smoothstep(0.0, 0.06, vUv.y);
    float sheen = pow(1.0 - vUv.y, 2.5) * 0.22;       // a faint wall of light low down
    vec3 col = mix(uMain, uCore, streak * along * 0.5) * streak * along + uDeep * sheen;
    gl_FragColor = vec4(col * uK, min(1.0, (streak * along + sheen) * uK) * uDay * 0.6);
  }`;

/* ---------------------------------------------------------------- the crystal standing in the middle */
const GEM_V = /* glsl */`
  varying vec3 vN, vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const GEM_F = /* glsl */`
  uniform vec3 uMain, uCore, uDeep;
  uniform float uK;
  varying vec3 vN, vV;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    vec3 col = mix(uCore, uMain, smoothstep(0.35, 0.9, f));
    gl_FragColor = vec4(col * uK, 0.55 * uK);
  }`;

/* ---------------------------------------------------------------- sparks */
const SPARK_V = /* glsl */`
  attribute float aLife, aSize;
  varying float vLife;
  uniform float uScale;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale * (0.4 + 0.6 * aLife) / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const SPARK_F = /* glsl */`
  uniform vec3 uMain, uCore;
  uniform float uDay;
  varying float vLife;
  void main() {
    if (vLife <= 0.0) discard;
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q);
    float dot_ = smoothstep(0.5, 0.0, d);
    float glint = (1.0 - smoothstep(0.0, 0.07, abs(q.x))) * (1.0 - smoothstep(0.0, 0.5, abs(q.y))) + (1.0 - smoothstep(0.0, 0.07, abs(q.y))) * (1.0 - smoothstep(0.0, 0.5, abs(q.x)));
    float k = dot_ * dot_ + glint * 0.5;
    vec3 col = mix(uMain, uCore, dot_ * dot_);
    float f = k * smoothstep(0.0, 0.25, vLife);
    gl_FragColor = vec4(col * f, min(1.0, f) * uDay * 0.6);
  }`;

export function createMagicCircles({ seed = 1, lift = 0.14 } = {}) {
  const object = new THREE.Group();
  object.name = 'magicCircles';
  let look = CIRCLE_LOOKS.rose, night = false;
  const colours = { uCore: { value: rgb(look.core) }, uMain: { value: rgb(look.main) }, uDeep: { value: rgb(look.deep) }, uDay: { value: 1 } };   // shared by every material

  // ---- the circles' slots
  const flat = new THREE.PlaneGeometry(2.8, 2.8);     // in radii: the points round the rim reach 1.26 (laid flat by its mesh)
  const pillarGeo = new THREE.CylinderGeometry(0.92, 0.92, 1, 36, 1, true);
  pillarGeo.translate(0, 0.5, 0);
  const gemGeo = new THREE.OctahedronGeometry(0.075, 0);
  gemGeo.scale(1, 1.9, 1);
  const slots = [];
  for (let i = 0; i < SLOTS; i++) {
    const disc = new THREE.Mesh(flat, new THREE.ShaderMaterial({
      uniforms: { ...colours, uTier: { value: 1 }, uOpen: { value: 0 }, uFade: { value: 0 }, uAge: { value: 0 }, uSeed: { value: i * 1.37 + seed },
        uPetals: { value: 0 }, uGlow: { value: 1 }, uCover: { value: 0.9 } },
      vertexShader: DISC_V, fragmentShader: DISC_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...BLEND,
    }));
    disc.rotation.x = -Math.PI / 2;
    disc.renderOrder = 20;
    const pillar = new THREE.Mesh(pillarGeo, new THREE.ShaderMaterial({
      uniforms: { ...colours, uK: { value: 0 }, uAge: { value: 0 }, uSeed: { value: i * 2.1 + seed } },
      vertexShader: PILLAR_V, fragmentShader: PILLAR_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...BLEND,
    }));
    pillar.renderOrder = 21;
    const gem = new THREE.Mesh(gemGeo, new THREE.ShaderMaterial({
      uniforms: { ...colours, uK: { value: 0 } },
      vertexShader: GEM_V, fragmentShader: GEM_F, transparent: true, depthWrite: false, ...BLEND,
    }));
    gem.renderOrder = 22;
    const g = new THREE.Group();
    g.add(disc, pillar, gem);
    g.visible = false;
    object.add(g);
    slots.push({ g, disc, pillar, gem, age: 0, life: 1, kind: KINDS[1], tier: 1, ground: true, radius: 1, used: 0 });
  }
  let used = 0;

  // ---- sparks
  const SPARKS = 420;
  const sPos = new Float32Array(SPARKS * 3), sVel = new Float32Array(SPARKS * 3), sLife = new Float32Array(SPARKS), sLen = new Float32Array(SPARKS), sSize = new Float32Array(SPARKS);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute('aLife', new THREE.BufferAttribute(sLife, 1).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  const sMat = new THREE.ShaderMaterial({
    uniforms: { ...colours, uScale: { value: 300 } },
    vertexShader: SPARK_V, fragmentShader: SPARK_F, transparent: true, depthWrite: false, ...BLEND,
  });
  const sparks = new THREE.Points(sGeo, sMat);
  sparks.frustumCulled = false;
  sparks.renderOrder = 23;
  object.add(sparks);
  let sNext = 0;
  let rnd = (seed * 9301 + 49297) % 233280;
  const rand = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };

  function burst(s, at) {
    const k = s.kind, R = s.radius;
    for (let i = 0; i < k.sparks; i++) {
      const j = sNext; sNext = (sNext + 1) % SPARKS;
      const a = rand() * Math.PI * 2, rr = R * (0.55 + rand() * 0.5);
      sPos[j * 3] = at.x + Math.cos(a) * rr; sPos[j * 3 + 1] = at.y + 0.03; sPos[j * 3 + 2] = at.z + Math.sin(a) * rr;
      // out from the rim and round it, up off the ground (down under her in the air: thrown off by her kick)
      const out = 0.6 + rand() * 1.4, round = (rand() - 0.5) * 1.6, up = (s.ground ? 1.2 + rand() * 2.2 : -(0.4 + rand() * 1.4)) * (s.ground ? 1 : 1);
      sVel[j * 3] = Math.cos(a) * out - Math.sin(a) * round; sVel[j * 3 + 1] = up; sVel[j * 3 + 2] = Math.sin(a) * out + Math.cos(a) * round;
      sLen[j] = 0.45 + rand() * 0.6; sLife[j] = 1;
      sSize[j] = (0.05 + rand() * 0.07) * (s.tier === 4 || s.tier === 'land' ? 1.3 : 1);
    }
    sGeo.attributes.aSize.needsUpdate = true;
  }

  const fx = {
    object,
    open(at, tier, { ground = true, size = 1 } = {}) {
      // the oldest slot (one still showing only if all are)
      let s = slots.find(o => !o.g.visible);
      if (!s) s = slots.reduce((m, o) => (o.used < m.used ? o : m));
      s.used = ++used;
      s.kind = KINDS[tier] || KINDS[1];
      s.tier = tier; s.ground = ground; s.age = 0;
      s.life = s.kind.life * (ground ? 1 : 0.85);
      s.radius = s.kind.radius * size;
      s.g.position.copy(at);
      if (ground) s.g.position.y += lift;
      s.g.rotation.y = rand() * Math.PI * 2;
      s.g.visible = true;
      const u = s.disc.material.uniforms;
      u.uTier.value = tier === 'land' ? 4 : tier;
      u.uPetals.value = s.kind.petals;
      u.uSeed.value = rand() * 10;
      s.pillar.visible = s.kind.pillar > 0;
      s.pillar.material.uniforms.uSeed.value = rand() * 10;
      s.gem.visible = tier !== 1;
      burst(s, at);
    },
    setLook(name) {
      look = CIRCLE_LOOKS[name] || CIRCLE_LOOKS.rose;
      colours.uCore.value.copy(rgb(look.core)); colours.uMain.value.copy(rgb(look.main)); colours.uDeep.value.copy(rgb(look.deep));
    },
    setNight(on) { night = on; colours.uDay.value = on ? 0 : 1; },
    get busy() { return slots.some(s => s.g.visible); },
    update(dt, camera) {
      const glow = night ? 1.25 : 0.85, cover = night ? 0.7 : 0.92;
      for (const s of slots) {
        if (!s.g.visible) continue;
        s.age += dt;
        const t = s.age, L = s.life, R = s.radius;
        if (t > L) { s.g.visible = false; continue; }
        const open = clamp(t / 0.2, 0, 1);
        const fade = sstep(L * 0.55, L, t);
        // it opens out past its size and settles; going, it swells a little as it breaks up
        const grow = (0.35 + 0.65 * (1 - Math.pow(1 - open, 3))) * (1 + 0.08 * Math.sin(Math.min(1, t / 0.32) * Math.PI)) * (1 + 0.12 * fade);
        s.disc.scale.setScalar(R * grow);
        const u = s.disc.material.uniforms;
        u.uOpen.value = open; u.uFade.value = fade; u.uAge.value = t; u.uGlow.value = glow * (1 + 0.6 * (1 - sstep(0, 0.18, t))); u.uCover.value = cover;
        // its light: shoots out of it at the start, and dies away
        if (s.pillar.visible) {
          const H = s.kind.pillar * (R / s.kind.radius);
          const up = 1 - Math.pow(1 - clamp(t / 0.22, 0, 1), 2);
          s.pillar.scale.set(R * grow, H * (0.25 + 0.75 * up) * (s.ground ? 1 : -0.7), R * grow);
          s.pillar.material.uniforms.uK.value = (1 - sstep(0.2, L * 0.85, t)) * glow * 1.1;
        }
        // the crystal: rises out of the middle, turns, and goes before the circle does
        if (s.gem.visible) {
          const g = sstep(0.04, 0.2, t) * (1 - sstep(L * 0.4, L * 0.8, t));
          s.gem.position.set(0, (s.ground ? 0.12 : 0.05) + 0.12 * sstep(0, 0.4, t), 0);
          s.gem.rotation.y = t * 5;
          s.gem.scale.setScalar(Math.max(0.001, g) * (R / 0.7));
          s.gem.material.uniforms.uK.value = g * glow * 1.2;
        }
      }
      // sparks: fly out, slow, fall a little, go out
      let any = false;
      for (let j = 0; j < SPARKS; j++) {
        if (sLife[j] <= 0) continue;
        any = true;
        sLife[j] -= dt / sLen[j];
        const drag = Math.exp(-2.6 * dt);
        sVel[j * 3] *= drag; sVel[j * 3 + 2] *= drag; sVel[j * 3 + 1] = sVel[j * 3 + 1] * drag - 1.6 * dt;
        sPos[j * 3] += sVel[j * 3] * dt; sPos[j * 3 + 1] += sVel[j * 3 + 1] * dt; sPos[j * 3 + 2] += sVel[j * 3 + 2] * dt;
        if (sLife[j] < 0) sLife[j] = 0;
      }
      if (any) { sGeo.attributes.position.needsUpdate = true; sGeo.attributes.aLife.needsUpdate = true; }
      sMat.uniforms.uScale.value = (camera.isPerspectiveCamera ? innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) : 300) * (night ? 1.1 : 1);
    },
    dispose() {
      flat.dispose(); pillarGeo.dispose(); gemGeo.dispose(); sGeo.dispose();
      for (const s of slots) { s.disc.material.dispose(); s.pillar.material.dispose(); s.gem.material.dispose(); }
      sMat.dispose();
    },
  };
  return fx;
}
