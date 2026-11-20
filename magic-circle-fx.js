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
                                     up) or in the air (she pushes off it: its light goes down, it breaks up sooner).
                                     -> the circle (for step's press and kick, below)
     fx.open(at, tier, { ground: false, step: true })   a circle she lands on and stands on for a moment before she
                                     kicks off it (magic-jump.js, step): it opens and waits, a few sparks only; then
       fx.press(c)                   her feet on it: it gives under her weight (down a little, brighter, a ripple out);
                                     fx.level(c): how high it is now (world), for her feet to go down with it
       fx.kick(c)                    she kicks off it: it springs back, its light shoots down, a wave goes out round it, the
                                     sparks are thrown down; and it stays a while (STEP_AFTER s) before it breaks up, so the
                                     circles she climbed stand under her like steps.
                                     { snap: true, after: s } (the Air Hike, magic-jump.js step 'dmc'): it flashes open at
                                     once, a little too big, and goes `after` s after the kick (a flash, not a step)
                                     { facing: v } (the dash in the air, magic-jump.js air.dash): stood upright, facing v
                                     (unit, over the ground: the way she goes off it); what goes "down" off a circle in the
                                     air (its light, the kick's sparks, the crystal dropping away) goes back, away from her
     every frame: fx.update(dt, camera)
     fx.setLook('rose' | 'water' | 'red')   the clip's rose light, the cold blue of her water barrier (barrier-fx.js), or
                                     the red of Devil May Cry's Air Hike (a trial: magic-jump.html)
     fx.setNight(on)                by night the light is let shine more (the page dims the land, not this)
     fx.dispose()

   How it is drawn, all of it light laid over the picture (one blend: a line covers what is under it, its glow adds to it),
   its own light at any hour: every material is marked userData.noGrade, which the game's light of the hour
   (cloud-shadows.js) and its curse (curse.js) leave alone:
     - a circle: one flat square, everything on it worked out by the shader from where it is on it. Its light: an open tube
       standing on it (up off the ground, down under her in the air). The crystal: a small stretched octahedron. 3 draws
       each, 8 circles at most
     - sparks: one cloud of points shared by every circle
     - a circle stood on (step) has a wave too: one flat square, a ring of light that goes out from under her feet
     - safe on a phone's GPU (thin black lines like hairs were seen on the user's phone, 20 Nov 2026, not on a desktop's):
       a line's edge is softened by how fast its distance changes on the screen (fwidth), which a GPU can only tell where
       every pixel round it takes the same way through the shader, so no line is drawn inside an if that goes one way
       for one pixel and the other for the next, or after such a return (each is drawn always and masked; an if on what
       the whole circle shares, its tier, is safe); nothing can be NaN (a power of a negative number, the angle of the very
       middle, a smoothstep with its edges the wrong way round), and what is drawn is kept between 0 and 1
   ========================================================================== */
import * as THREE from 'three';

const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

// the light: the line's heart (near white), the line, the glow round it
export const CIRCLE_LOOKS = {
  rose: { core: '#fff2f5', main: '#ff76a0', deep: '#ea3a6e' },            // the clip's
  water: { core: '#f0fbff', main: '#6fcbff', deep: '#2b86dc' },           // the barrier's cold blue (BARRIER_LOOK.spark)
  red: { core: '#fff1e6', main: '#ff4a3a', deep: '#c8141e' },             // Devil May Cry's Air Hike: a demon's red (a trial)
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
// a circle stood on (step): how far it gives under her (of its radius), how long it stays after her kick (s), its light's
// height (m) whatever its tier (the kick's light shoots down off every one of them), the sparks when it opens (of its
// tier's) and at the kick (of its tier's)
// one stood upright (facing): its light that long, of a stood-on one's (it shoots back at the camera behind her)
const FACING_LIGHT = 0.55;
const STEP_DIP = 0.07, STEP_AFTER = 1.25, STEP_PILLAR = 0.75, STEP_OPEN_SPARKS = 0.3, STEP_KICK_SPARKS = 1.2;
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
  // (called only where every pixel round takes the same way: fwidth anywhere else is undefined, and a phone's GPU may
  // draw it as black hairs)
  float line(float d, float w) { float f = fwidth(d) * 1.2 + 0.002; return 1.0 - smoothstep(w * 0.5, w * 0.5 + f, abs(d)); }
  vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
  float hash(float n) { return fract(sin(n * 78.233 + uSeed * 9.1) * 43758.5453); }
  // how much of a ring is drawn yet: each draws itself round from its own starting point, 'at' into the opening
  float drawn(float a, float at, float from) {
    float s = fract((a + PI) / TAU + from);
    return step(s, clamp((uOpen - at) * 2.6, 0.0, 1.0));
  }
  // the marks round a band (r0..r1): n cells, each a little glyph of strokes picked by a hash (every stroke drawn, and
  // the hash keeps or hides it: see line)
  float runes(vec2 p, float r, float a, float r0, float r1, float n) {
    float v = (r - r0) / (r1 - r0);
    float s = (a / TAU + 0.5) * n, id = floor(s), u = fract(s);
    float h = hash(id), h2 = hash(id + 17.0);
    vec2 q = vec2((u - 0.5) * r * TAU / n / (r1 - r0), v - 0.5);          // in the band's height
    float w = 0.13, g = line(q.x, w) * step(abs(q.y), 0.3);                // a stem
    g = max(g, line(q.y - 0.2, w) * step(abs(q.x), 0.24) * step(0.45, h));                // a bar over it
    g = max(g, line(length(q - vec2(0.0, -0.14)) - 0.12, w) * step(0.5, h2));             // a ring at its foot
    g = max(g, line(q.y + q.x * 1.3, w) * step(abs(q.x), 0.2) * (1.0 - step(0.3, h)));   // a slash
    g = max(g, line(q.y + 0.24, w) * step(abs(q.x), 0.24) * (1.0 - step(0.2, h2)));      // a bar under it
    return g * step(0.0, v) * step(v, 1.0);
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
    float r = length(p), a = atan(p.y, abs(p.x) < 1e-6 ? 1e-6 : p.x);      // (no angle at the very middle)
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
    float G = exp(-abs(r - 1.0) * 16.0) * 0.55 + exp(-abs(r - 0.64) * 22.0) * 0.25 + (1.0 - smoothstep(0.2, 1.05, r)) * 0.16 + exp(-r * 7.0) * 0.6;
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
    gl_FragColor = clamp(vec4(col, A * uCover + min(1.0, G) * uDay * 0.6), 0.0, 1.0);
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
    float sheen = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.5) * 0.22;       // a faint wall of light low down (vUv a hair past its end at the
                                                      // tube's rim, on a phone's GPU: a power of a negative number is NaN, black)
    vec3 col = mix(uMain, uCore, streak * along * 0.5) * streak * along + uDeep * sheen;
    gl_FragColor = clamp(vec4(col * uK, min(1.0, (streak * along + sheen) * uK) * uDay * 0.6), 0.0, 1.0);
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
    gl_FragColor = clamp(vec4(col * uK, 0.55 * uK), 0.0, 1.0);
  }`;

/* ---------------------------------------------------------------- a stood-on circle's wave: a ring of light going out */
const WAVE_F = /* glsl */`
  uniform vec3 uMain, uCore, uDeep;
  uniform float uK, uSharp, uDay;
  varying vec2 vP;                                    // in the square's half widths: the ring at 0.86
  void main() {
    float r = length(vP);
    float ring = exp(-abs(r - 0.86) * uSharp);
    float trail = smoothstep(0.3, 0.86, r) * (1.0 - step(0.86, r)) * 0.22;     // a faint sheet behind the ring
    float f = (ring + trail) * (1.0 - smoothstep(0.93, 1.0, r)) * uK;
    vec3 col = mix(uDeep, mix(uMain, uCore, ring * 0.7), clamp(ring * 1.5, 0.0, 1.0)) * f;
    gl_FragColor = clamp(vec4(col, min(1.0, f) * uDay * 0.5), 0.0, 1.0);
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
    float dot_ = 1.0 - smoothstep(0.0, 0.5, d);
    float glint = (1.0 - smoothstep(0.0, 0.07, abs(q.x))) * (1.0 - smoothstep(0.0, 0.5, abs(q.y))) + (1.0 - smoothstep(0.0, 0.07, abs(q.y))) * (1.0 - smoothstep(0.0, 0.5, abs(q.x)));
    float k = dot_ * dot_ + glint * 0.5;
    vec3 col = mix(uMain, uCore, dot_ * dot_);
    float f = k * smoothstep(0.0, 0.25, vLife);
    gl_FragColor = clamp(vec4(col * f, min(1.0, f) * uDay * 0.6), 0.0, 1.0);
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
  const waveGeo = new THREE.PlaneGeometry(2, 2);
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
    const wave = new THREE.Mesh(waveGeo, new THREE.ShaderMaterial({
      uniforms: { ...colours, uK: { value: 0 }, uSharp: { value: 20 } },
      vertexShader: DISC_V, fragmentShader: WAVE_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...BLEND,
    }));
    wave.rotation.x = -Math.PI / 2;
    wave.renderOrder = 20;
    wave.visible = false;
    const g = new THREE.Group();
    g.add(disc, pillar, gem, wave);
    g.visible = false;
    object.add(g);
    slots.push({ g, disc, pillar, gem, wave, age: 0, life: 1, kind: KINDS[1], tier: 1, ground: true, radius: 1, used: 0,
      step: false, at: new THREE.Vector3(), pressAt: -1, kickAt: -1, waveAt: -1, waveBig: false,
      // its up (the way it faces: up, or `facing`), and two ways across it; where it stood when it opened
      up: new THREE.Vector3(0, 1, 0), across: new THREE.Vector3(1, 0, 0), along: new THREE.Vector3(0, 0, 1), base: new THREE.Vector3() });
  }
  let used = 0;
  const UP = new THREE.Vector3(0, 1, 0), spun = new THREE.Quaternion();

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

  // sparks off a circle: `many` times its kind's. kick: thrown down hard (a stood-on circle kicked off); a stood-on circle
  // opening or pressed (step, not kick): only out round its rim, hardly up or down
  function burst(s, at, many = 1, kick = false) {
    const k = s.kind, R = s.radius, n = Math.round(k.sparks * many);
    const U = s.up, A = s.across, B = s.along;      // (a circle lying flat: up, x and z)
    for (let i = 0; i < n; i++) {
      const j = sNext; sNext = (sNext + 1) % SPARKS;
      const a = rand() * Math.PI * 2, rr = R * (0.55 + rand() * 0.5), ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
      sPos[j * 3] = at.x + A.x * ca + B.x * sa + U.x * 0.03; sPos[j * 3 + 1] = at.y + A.y * ca + B.y * sa + U.y * 0.03; sPos[j * 3 + 2] = at.z + A.z * ca + B.z * sa + U.z * 0.03;
      // out from the rim and round it, up off the ground (down under her in the air: thrown off by her kick)
      const out = (kick ? 0.9 + rand() * 1.8 : 0.6 + rand() * 1.4), round = (rand() - 0.5) * 1.6;
      const up = kick ? -(1.4 + rand() * 2.6) : s.step ? (rand() - 0.5) * 0.6 : s.ground ? 1.2 + rand() * 2.2 : -(0.4 + rand() * 1.4);
      const p = Math.cos(a) * out - Math.sin(a) * round, r = Math.sin(a) * out + Math.cos(a) * round;
      sVel[j * 3] = A.x * p + B.x * r + U.x * up; sVel[j * 3 + 1] = A.y * p + B.y * r + U.y * up; sVel[j * 3 + 2] = A.z * p + B.z * r + U.z * up;
      sLen[j] = 0.45 + rand() * 0.6; sLife[j] = 1;
      sSize[j] = (0.05 + rand() * 0.07) * (s.tier === 4 || s.tier === 'land' ? 1.3 : 1);
    }
    sGeo.attributes.aSize.needsUpdate = true;
  }

  // a circle she stands on (open's step), each frame: it opens and waits; her weight comes on it (press) and it gives, down
  // a little and a little wider, brighter while she stands; her kick drives it down harder for an instant and it springs
  // back up past where it was and settles; its light shoots down, a wave goes out round it, the crystal under it drops away;
  // a while after (STEP_AFTER) it breaks up as the others do
  function stood(s, glow, cover) {
    const t = s.age, R = s.radius;
    const p = s.pressAt >= 0 ? t - s.pressAt : -1, kk = s.kickAt >= 0 ? t - s.kickAt : -1;
    const open = clamp(t / (s.snap ? 0.06 : 0.2), 0, 1);
    const fade = kk >= 0 ? sstep(s.after * 0.45, s.after, kk) : sstep(s.life * 0.55, s.life, t);
    let give = 0;
    if (kk >= 0) give = 1.4 * Math.exp(-kk * 14) * Math.cos(kk * 26);
    else if (p >= 0) give = sstep(0, 0.07, p);
    s.g.position.copy(s.base).addScaledVector(s.up, -STEP_DIP * R * give);      // (down: the way it faces away from)
    // (snap: there at once, a little too big, settling; a flash of white as it comes)
    const grow = (s.snap ? 1 + 0.22 * Math.pow(1 - clamp(t / 0.12, 0, 1), 2) : (0.35 + 0.65 * (1 - Math.pow(1 - open, 3))) * (1 + 0.08 * Math.sin(Math.min(1, t / 0.32) * Math.PI)))
      * (1 + 0.12 * fade) * (1 + 0.05 * Math.max(0, give));
    s.disc.scale.setScalar(R * grow);
    const u = s.disc.material.uniforms;
    let flash = 1 + (s.snap ? 1.4 : 0.6) * (1 - sstep(0, 0.18, t));
    if (p >= 0) flash += 0.8 * (1 - sstep(0, 0.16, p)) + (kk < 0 ? 0.3 : 0);
    if (kk >= 0) flash += 1.6 * (1 - sstep(0, 0.25, kk));
    u.uOpen.value = open; u.uFade.value = fade; u.uAge.value = t; u.uGlow.value = glow * flash; u.uCover.value = cover;
    // its light, down off it from the kick
    if (kk >= 0) {
      const H = Math.max(s.kind.pillar, STEP_PILLAR) * (R / s.kind.radius) * (s.up.y ? 1 : FACING_LIGHT), up = 1 - Math.pow(1 - clamp(kk / 0.16, 0, 1), 2);
      s.pillar.scale.set(R * grow, -H * (0.25 + 0.75 * up), R * grow);
      s.pillar.material.uniforms.uK.value = (1 - sstep(0.12, 0.7, kk)) * glow * 1.3;
    }
    // the crystal: hangs under it (her feet are on it), and drops away at the kick
    if (s.gem.visible) {
      const g = sstep(0.04, 0.2, t) * (1 - fade) * (kk >= 0 ? 1 - sstep(0.15, 0.55, kk) : 1);
      s.gem.position.set(0, -(0.06 + 0.1 * sstep(0, 0.4, t)) - (kk >= 0 ? 2.5 * kk * kk : 0), 0);
      s.gem.rotation.y = t * 5;
      s.gem.scale.setScalar(Math.max(0.001, g) * (R / 0.7));
      s.gem.material.uniforms.uK.value = g * glow * 1.2;
    }
    // the wave: a small quick ripple as she lands on it, a wide one at the kick
    if (s.waveAt >= 0) {
      const w = t - s.waveAt, dur = s.waveBig ? 0.42 : 0.2, f = w / dur;
      if (f >= 1) { s.wave.visible = false; s.waveAt = -1; }
      else {
        const e = 1 - Math.pow(1 - f, 3);
        s.wave.visible = true;
        s.wave.scale.setScalar(R * (s.waveBig ? 1 + 1.5 * e : 0.85 + 0.35 * e) / 0.86);
        s.wave.material.uniforms.uK.value = (s.waveBig ? 1.2 : 0.7) * Math.pow(1 - f, 1.5) * glow;
        s.wave.material.uniforms.uSharp.value = s.waveBig ? 14 + 20 * f : 26;
      }
    }
  }

  const fx = {
    object,
    open(at, tier, { ground = true, size = 1, step = false, snap = false, after = STEP_AFTER, facing = null } = {}) {
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
      s.g.rotation.set(0, rand() * Math.PI * 2, 0);
      if (facing) {
        // stood upright facing `facing`: its up turned to it (and turned round it as it was round its up)
        s.up.set(facing.x, 0, facing.z).normalize();
        s.across.set(0, 1, 0); s.along.crossVectors(s.up, s.across);
        s.g.quaternion.premultiply(spun.setFromUnitVectors(UP, s.up));
      } else { s.up.set(0, 1, 0); s.across.set(1, 0, 0); s.along.set(0, 0, 1); }
      s.base.copy(s.g.position);
      s.g.visible = true;
      const u = s.disc.material.uniforms;
      u.uTier.value = tier === 'land' ? 4 : tier;
      u.uPetals.value = s.kind.petals;
      u.uSeed.value = rand() * 10;
      s.pillar.visible = s.kind.pillar > 0;
      s.pillar.material.uniforms.uSeed.value = rand() * 10;
      s.gem.visible = tier !== 1;
      // stood on: it waits for her kick (its life is set then; this one only if she never kicks), its light only then
      s.step = step; s.snap = snap; s.after = after; s.pressAt = s.kickAt = s.waveAt = -1; s.wave.visible = false;
      s.at.copy(at);
      if (step) { s.life = 2; s.pillar.visible = false; }
      burst(s, at, step ? STEP_OPEN_SPARKS : 1);
      return s;
    },
    // a stood-on circle: her feet on it, then her kick off it (open's step)
    press(s) {
      if (!s || !s.step || !s.g.visible || s.pressAt >= 0) return;
      s.pressAt = s.age;
      s.waveAt = s.age; s.waveBig = false;
    },
    // how high a stood-on circle is now (world): it gives under her, and her feet go down with it
    level(s) { return s && s.g ? s.g.position.y : 0; },
    kick(s) {
      if (!s || !s.step || !s.g.visible || s.kickAt >= 0) return;
      if (s.pressAt < 0) s.pressAt = s.age;
      s.kickAt = s.age;
      s.life = s.age + s.after;
      s.waveAt = s.age; s.waveBig = !!s.up.y;      // (one stood upright: a small ripple, not the wide wave: it is in the camera's face)
      s.pillar.visible = true;
      burst(s, s.at, STEP_KICK_SPARKS, true);
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
        if (s.step) { stood(s, glow, cover); continue; }
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
      flat.dispose(); pillarGeo.dispose(); gemGeo.dispose(); waveGeo.dispose(); sGeo.dispose();
      for (const s of slots) { s.disc.material.dispose(); s.pillar.material.dispose(); s.gem.material.dispose(); s.wave.material.dispose(); }
      sMat.dispose();
    },
  };
  object.traverse(o => { if (o.material) o.material.userData.noGrade = true; });
  return fx;
}
