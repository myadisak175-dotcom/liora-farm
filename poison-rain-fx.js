/* ==========================================================================
   poison-rain-fx.js  —  everything the plant boss's poison rain draws (plant-boss-moves.js: play('poison')), as in the
   poison clips: green light burning in the three mouths as they gather themselves (the rest of the gathering, the
   motes, the column of light out of the middle crown and the green wind, is howl-fx.js's, fed the same time); balls of
   poison spat up into the sky, each with a puff of green breath at the mouth; a whirl of poison cloud turning over it in
   the sky, swelling as the balls go in; then the rain: balls of poison falling out of it on long glowing trails, and
   under each the warning on the ground (its shadow filling, a ring closing in on it); each lands with a splash (a burst
   of green spikes, drops thrown out, a flash, a star and a ring running out over the ground) and leaves a pool of
   poison that bubbles and steams, glowing rings running out over it, and dries away after a while. One job: draw that.
   It decides nothing: the moves say when (their events), this follows.

     const fx = createPoisonRainFx({ heightAt, seed, lift })   heightAt(x, z): the ground's height (world); null: as the
                                                               moves' shapes have it. lift: metres the ground's marks are
                                                               laid over the ground (over the grass's tips)
     scene.add(fx.object)
     moves.onEvent = e => fx.event(e)          the poison rain's (and the ultimate's) 'spit', and 'warn' and 'hit' of its
                                               drops; 'cancel' (the rain still to come goes; pools already down stay)
     every frame: fx.update(dt, camera, boss, t, move)   t: seconds into the move (moves.time while moves.state is move),
                                               or < 0; move: 'poison' (as it starts) or 'ultimate' (the same rain, at its
                                               beats). The same dt the moves get, so it keeps time with them
     fx.afflict(at, k)                         she stands in poison: green bubbles and motes rise off her (at: her feet,
                                               world; k 0..1: how strongly, 0: not at all). Every frame, before update
     fx.shake                                  0..1: how hard the ground jolts now (the camera's to shake, if it likes)
     fx.setSun(vec3), fx.busy (anything of it still to be seen), fx.dispose()
   poolStrength(age, lasts)                    how strongly a pool still lies, seconds after it landed (0 .. 1 .. 0 as it
                                               dries away): what is drawn, and how hard it should slow her

   The times are BOSS_MOVES.poison's (or .ultimate's); FLIGHT, SKY and WHIRL (below) are this file's own.

   How it is drawn, the kit's way: flat tones and hard edges for what is solid (the balls, the pools), soft light added
   for what glows.
     - the ground's marks (warnings, splashes, pools): a small patch of mesh laid over the ground where each lands, all
       of them in one mesh, each drawn by the shader from how old it is (nothing is sent to it frame by frame). One draw call
     - balls, drops, bubbles, glows: camera-facing cut-outs (a ball of poison: lime, dark spots that roll, a bright rim,
       a halo). One draw call. Their trails: streaks stretched out behind them along the way they go. One draw call
     - the whirl in the sky: one disc, its arms turning. One draw call
     - green breath and steam: soft puffs (thicket-fx.js's haze). One draw call. Sparks: one draw call
   ========================================================================== */
import * as THREE from 'three';
import { BOSS_MOVES } from './plant-boss-moves.js';
import { _fx } from './thicket-fx.js';
import { mulberry32, _internal as natureInternal } from './stylized-nature.js';

const { NOISE } = natureInternal;
const { SPARK_VS, SPARK_FS, PUFF_VS, HAZE_FS, makePool, col } = _fx;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sstep = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };
const pulse = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t));

export const FLIGHT = 0.8;       // seconds a ball of the rain takes to come down out of the whirl
const UP_SPEED = 19;             // metres a second a spat ball goes up
export const SKY = 15.5;         // metres over its foot the whirl turns
const WHIRL = 6.5;               // the whirl's radius, metres
const DRY = 2.4;                 // seconds a pool takes to dry away, at the end of its time

// how strongly a pool still lies: it splashes out, lies, then dries away over its last DRY seconds
export function poolStrength(age, lasts) { return age < 0 || age > lasts ? 0 : sstep(0, 0.25, age) * (1 - sstep(lasts - DRY, lasts, age)); }

// the look: every colour it is drawn with
export const POISON_LOOK = {
  ball: ['#2a6e16', '#4fa824', '#93e03a', '#dcff86'],          // a ball of poison: its spots, its shade, its body, its light
  rim: '#f0ffbe', halo: '#86f236', hot: '#f2ffd6',
  trail: ['#3a8f1c', '#a2f246', '#efffcf'],                    // a falling ball's trail: its edge, its body, its core
  cloud: ['#163a10', '#2c6f1a', '#5bb82a', '#b8ff4c'],         // the whirl in the sky: deep, body, light, the streaks
  warn: '#c2ff3c', shadow: '#16300c',                          // the warning: its rim; the shadow that fills it
  pool: ['#2a6c16', '#46a020', '#78d034', '#b8f252'], poolRim: '#e0ff6a',       // a pool: deep .. shallow; its rim
  gas: ['#2a6a18', '#8ad83c'],                                 // green breath and steam
  spark: '#b2ff48',
};

// --------------------------------------------------------------------------
// the ground's marks: warnings, splashes, pools. Each a small patch of mesh laid over the ground where it lies
//   aLocal: where on it, in its own radii; aInfo: what it is (0 a warning, 1 a pool, 2 a splash; less than 0: gone),
//   its dice, when it began (on the effect's own clock), how long it lasts; aSize: its radius (metres)
// --------------------------------------------------------------------------
const MARK_VS = /* glsl */`
uniform float uTime;
attribute vec2 aLocal;
attribute vec4 aInfo;
attribute float aSize;
varying vec2 vL;
varying vec4 vI;
void main() {
  vL = aLocal; vI = aInfo;
  float age = uTime - aInfo.z;
  if (aInfo.x < -0.5 || age < 0.0 || age > aInfo.w) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }      // (not there: off the picture)
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const MARK_FS = /* glsl */`
${NOISE}
uniform float uTime, uDry;
uniform vec3 uWarn, uShadow, uP0, uP1, uP2, uP3, uRim, uHot, uSpark;
varying vec2 vL;
varying vec4 vI;
vec4 acc;
void over(vec3 c, float a) { a = clamp(a, 0.0, 1.0); acc = vec4(c * a, a) + acc * (1.0 - a); }
void glow(vec3 c, float a) { acc.rgb += c * clamp(a, 0.0, 1.0); }          // light, added onto what is under it
vec2 turn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main() {
  float kind = vI.x, dice = vI.y, age = uTime - vI.z, life = vI.w, k = clamp(age / life, 0.0, 1.0);
  vec2 q = vL;
  float r = length(q), a = atan(q.y, q.x);
  acc = vec4(0.0);
  if (kind < 0.5) {
    // the warning: the shadow of what is coming fills it from the middle, darker as it nears; a lime rim beating
    // quicker as it nears; a ring closing in on it from outside
    float show = smoothstep(0.0, 0.12, age);
    float inside = 1.0 - smoothstep(0.96, 1.0, r);
    float filled = 1.0 - smoothstep(k - 0.04, k, r);
    over(uShadow, show * inside * (0.2 + 0.22 * k + 0.25 * filled * (0.4 + 0.6 * k)));
    float beat = 0.7 + 0.3 * sin(uTime * (9.0 + 20.0 * k));
    float d = r - 1.0;
    over(uWarn, show * (1.0 - smoothstep(0.03, 0.055, abs(d + 0.025))) * (0.75 + 0.25 * beat));
    glow(uWarn, show * exp(-abs(d) / 0.09) * 0.32 * beat);
    float cr = mix(1.85, 1.0, k);
    over(uWarn, show * (1.0 - smoothstep(0.018, 0.034, abs(r - cr))) * smoothstep(0.0, 0.25, k) * (0.55 + 0.4 * k));
    // four ticks on the rim, turning: it reads as a sight
    float tick = step(0.82, abs(cos(2.0 * (a - uTime * 1.5)))) * (1.0 - smoothstep(0.0, 0.05, abs(r - 1.12)));
    over(uWarn, show * tick * 0.7);
  } else if (kind < 1.5) {
    // a pool of poison: splashed out (with a wobble), lying; then drying away, its edge drawn in and eaten through
    float st = smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(life - uDry, life, age));
    float dry = 1.0 - smoothstep(life - uDry, life, age);
    float spread = 0.55 + 0.45 * smoothstep(0.0, 0.2, age) + 0.08 * sin(min(age, 0.7) * 14.0) * (1.0 - smoothstep(0.0, 0.7, age));
    float n1 = noise2(q * 2.2 + dice * 31.0), n2 = noise2(q * 5.5 - dice * 17.0);
    float edge = spread * (0.86 + 0.05 * sin(a * 3.0 + dice * 40.0) + 0.035 * sin(a * 7.0 - dice * 23.0) + (n1 - 0.5) * 0.26) * (0.6 + 0.4 * dry);
    float rr = r + (n2 - 0.5) * 0.55 * (1.0 - dry);
    float body = 1.0 - smoothstep(edge - 0.02, edge, rr);
    // drops thrown out round it
    vec2 cs = q * 2.6 + dice * 13.0, ci = floor(cs), cf = fract(cs) - 0.5;
    float h1 = hash2(ci / 16.0), h2 = hash2((ci + 7.0) / 16.0);
    float spot = (1.0 - smoothstep(0.08 + 0.1 * h2, 0.11 + 0.1 * h2, length(cf - (vec2(h1, h2) - 0.5) * 0.4)))
               * step(0.68, h1) * step(edge + 0.06, r) * (1.0 - smoothstep(1.2, 1.38, r)) * dry * smoothstep(0.05, 0.2, age);
    float m = max(body, spot);
    // its colour in flat tones: deep in the middle, shallow to the edge, light swirling slowly through it
    float depth = 1.0 - smoothstep(edge * 0.15, edge, r);
    float sw = noise2(turn(q, age * 0.35 + dice * 6.0) * 2.4 + vec2(0.0, age * 0.3));
    float tone = (1.0 - depth) * 0.55 + sw * 0.55;
    vec3 c = tone > 0.72 ? uP3 : (tone > 0.5 ? uP2 : (tone > 0.3 ? uP1 : uP0));
    c = mix(c, uRim, (1.0 - smoothstep(0.05, 0.09, edge - rr)) * body);          // its rim, a bright lip
    // bubbles: each swells, then pops in a ring of light
    vec2 bs = q * 3.4 + dice * 5.0, bi = floor(bs), bf = fract(bs) - 0.5;
    float bh = hash2(bi / 16.0), bh2 = hash2((bi + 3.0) / 16.0);
    float ph = fract(age * (0.45 + 0.4 * bh) + bh2), br = 0.06 + 0.24 * ph;
    vec2 bo = (vec2(bh, bh2) - 0.5) * 0.3;
    float bd = length(bf - bo);
    float alive = step(0.35, bh) * step(0.15, depth) * body;
    float bubble = (1.0 - smoothstep(br - 0.03, br, bd)) * step(ph, 0.86) * alive;
    float shine = (1.0 - smoothstep(0.02, 0.05, length(bf - bo - vec2(-0.35, 0.35) * br))) * bubble;
    float pop = (1.0 - smoothstep(0.015, 0.04, abs(bd - (0.3 + (ph - 0.86) * 2.0)))) * step(0.86, ph) * (1.0 - ph) * 7.0 * alive;
    c = mix(c, uP2, bubble * 0.8);
    c = mix(c, uRim, smoothstep(br - 0.06, br - 0.02, bd) * bubble);
    c = mix(c, uHot, shine);
    over(c, m * st);
    glow(uRim, pop * st * 0.7);
    // rings of light running out over it from the middle, now and then
    float ringR = fract(age * 0.55 + dice) * edge;
    glow(uRim, exp(-pow((r - ringR) / 0.04, 2.0)) * (1.0 - fract(age * 0.55 + dice)) * body * st * 0.8);
    // a glow round it, on the grass
    glow(uP3, exp(-max(rr - edge, 0.0) / 0.16) * (1.0 - body) * st * 0.42 * step(edge, rr));
  } else {
    // a splash: a star of green thrown out over the ground, a ring running out, a flash in the middle
    float spk = max(pow(abs(sin(a * 4.0 + dice * 9.0)), 10.0), 0.75 * pow(abs(sin(a * 7.0 + dice * 21.0)), 14.0));
    float starR = (0.35 + 1.1 * spk) * (0.3 + 0.9 * smoothstep(0.0, 0.14, age));
    float fade = 1.0 - smoothstep(0.12, 1.0, k);
    float star = 1.0 - smoothstep(starR - 0.05, starR, r);
    over(mix(uP3, uHot, 1.0 - smoothstep(0.0, starR, r)), star * fade * 0.9);
    float ringR = 0.25 + 1.55 * sqrt(k);
    float ring = 1.0 - smoothstep(0.03, 0.08, abs(r - ringR));
    over(uRim, ring * (1.0 - k) * 0.8);
    glow(uSpark, exp(-abs(r - ringR) / 0.12) * (1.0 - k) * 0.5);
    glow(uHot, exp(-r * r * 5.0) * (1.0 - smoothstep(0.0, 0.3, age)) * 1.2);
  }
  if (acc.a < 0.003 && max(acc.r, max(acc.g, acc.b)) < 0.003) discard;
  gl_FragColor = acc;
}`;

// --------------------------------------------------------------------------
// orbs: camera-facing cut-outs. aInfo: x what (0 a ball of poison, 1 a bubble, 2 a glow, 3 a drop), y its radius
// (metres, its halo too), z how strongly it shows, w its dice
// --------------------------------------------------------------------------
const ORB_VS = /* glsl */`
attribute vec3 aPos;
attribute vec4 aInfo;
varying vec2 vUv;
varying vec4 vInfo;
void main() {
  vUv = uv; vInfo = aInfo;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  mv.xy += position.xy * aInfo.y * 2.0;
  gl_Position = projectionMatrix * mv;
}`;
const ORB_FS = /* glsl */`
${NOISE}
uniform float uTime;
uniform vec3 uB0, uB1, uB2, uB3, uRim, uHalo, uHot;
varying vec2 vUv;
varying vec4 vInfo;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p), kind = vInfo.x, dice = vInfo.w;
  vec4 o = vec4(0.0);
  if (kind < 0.5 || kind > 2.5) {
    // a ball of poison (a drop: smaller in its halo, no spots): lit in flat tones, a bright rim, a glint
    float R = kind < 0.5 ? 0.58 : 0.72;
    if (d < R) {
      vec2 s = p / R;
      vec3 n = vec3(s, sqrt(max(0.0, 1.0 - dot(s, s))));
      float l = dot(n, normalize(vec3(-0.45, 0.6, 0.66)));
      vec3 c = l > 0.55 ? uB3 : (l > 0.12 ? uB2 : uB1);
      if (kind < 0.5) {                                            // dark spots, rolling as it flies
        vec2 sp = n.xy / (n.z + 0.7) * 2.2 + vec2(uTime * 1.4 + dice * 17.0, dice * 9.0);
        if (noise2(sp * 1.7) > 0.63) c = mix(uB0, uB1, step(0.55, l) * 0.5);
      }
      c = mix(c, uRim, smoothstep(0.72, 0.97, length(s)) * 0.85);
      c = mix(c, uHot, smoothstep(0.88, 0.97, l) * 0.9);
      o = vec4(c, 1.0);
    } else {
      float h = 1.0 - smoothstep(R, 1.0, d);
      h = h * h * (kind < 0.5 ? 0.75 : 0.4);
      o = vec4(uHalo * h, h * 0.4);
    }
  } else if (kind < 1.5) {
    // a bubble: seen through, a lime rim, a glint
    float R = 0.85;
    float ring = smoothstep(R - 0.22, R - 0.05, d) * (1.0 - smoothstep(R - 0.05, R, d));
    float fill = (1.0 - smoothstep(R - 0.05, R, d)) * 0.22;
    float glint = 1.0 - smoothstep(0.1, 0.18, length(p - vec2(-0.3, 0.32)));
    float a = max(max(ring, fill), glint);
    vec3 c = mix(mix(uB2, uRim, ring), uHot, glint);
    o = vec4(c * a, a);
  } else {
    // a glow: soft round light, hot in the middle
    float g = exp(-d * d * 4.5), core = exp(-d * d * 18.0);
    o = vec4(mix(uHalo, uHot, core) * (g + core), g * 0.45);
  }
  o *= vInfo.z;
  if (o.a < 0.003 && max(o.r, max(o.g, o.b)) < 0.003) discard;
  gl_FragColor = o;
}`;

// --------------------------------------------------------------------------
// trails: streaks behind a ball, along the way it goes. aInfo: x how long (metres), y how wide, z how strongly, w dice
// --------------------------------------------------------------------------
const TRAIL_VS = /* glsl */`
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec4 aInfo;
varying vec2 vT;
varying vec4 vInfo;
void main() {
  vT = vec2(uv.x * 2.0 - 1.0, uv.y); vInfo = aInfo;              // across -1..1; along: 1 at the ball .. 0 at the trail's end
  vec3 back = length(aVel) > 1e-4 ? normalize(aVel) : vec3(0.0, -1.0, 0.0);
  vec4 head = viewMatrix * vec4(aPos, 1.0), tail = viewMatrix * vec4(aPos - back * aInfo.x, 1.0);
  vec2 dir = head.xy - tail.xy;
  float L = length(dir);
  dir = L > 1e-4 ? dir / L : vec2(0.0, 1.0);
  vec4 p = mix(tail, head, uv.y);
  p.xy += vec2(-dir.y, dir.x) * position.x * aInfo.y * mix(0.2, 1.0, uv.y) + dir * uv.y * aInfo.y * 0.35;
  gl_Position = projectionMatrix * p;
}`;
const TRAIL_FS = /* glsl */`
${NOISE}
uniform float uTime;
uniform vec3 uT0, uT1, uT2;
varying vec2 vT;
varying vec4 vInfo;
void main() {
  float x = abs(vT.x), y = vT.y;
  float n = noise2(vec2(vT.x * 2.0 + vInfo.w * 30.0, y * 7.0 - uTime * 9.0));
  float body = 1.0 - smoothstep(0.5, 1.0, x + (n - 0.5) * 0.6 * (1.0 - y));
  float core = 1.0 - smoothstep(0.0, 0.38, x);
  float s = body * pow(y, 1.3) * vInfo.z;
  if (s < 0.004) discard;
  vec3 c = mix(uT0, uT1, smoothstep(0.15, 0.7, y + (1.0 - x) * 0.3));
  c = mix(c, uT2, core * y * y);
  gl_FragColor = vec4(c * s, s * 0.65);
}`;

// --------------------------------------------------------------------------
// the whirl in the sky: one disc, its cloud wound round and turning, faster toward the middle; streaks of light
// along its arms; a light in its eye
// --------------------------------------------------------------------------
const WHIRL_VS = /* glsl */`
varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WHIRL_FS = /* glsl */`
${NOISE}
uniform float uA, uT, uSwell;
uniform vec3 uC0, uC1, uC2, uC3, uHot;
varying vec2 vP;
vec2 turn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main() {
  float r = length(vP), a = atan(vP.y, vP.x);
  vec2 q = turn(vP, uT * (1.0 + 1.8 * (1.0 - r)) + log(r + 0.08) * 2.6);
  float n = noise2(q * 2.6 + 3.0) * 0.6 + noise2(q * 6.0 - 5.0) * 0.4;
  float arms = 0.5 + 0.5 * sin(a * 3.0 + log(r + 0.05) * 7.0 - uT * 4.0);
  float rimR = 0.8 + 0.18 * uSwell + (n - 0.5) * 0.32;
  float dens = (1.0 - smoothstep(rimR - 0.22, rimR, r)) * smoothstep(0.04, 0.22, r + (n - 0.5) * 0.2);
  float tone = n * 0.6 + arms * 0.4;
  vec3 c = tone > 0.62 ? uC2 : (tone > 0.42 ? uC1 : uC0);
  float streak = smoothstep(0.8, 0.96, arms) * smoothstep(0.12, 0.4, r) * (1.0 - smoothstep(rimR - 0.25, rimR, r));
  c = mix(c, uC3, streak);
  float alpha = dens * uA * 0.82;
  float eye = exp(-r * r * 20.0) * uA * (0.55 + 0.45 * uSwell);
  vec4 o = vec4(c * alpha, alpha);
  o.rgb += uHot * eye + uC3 * streak * alpha * 0.45;
  if (o.a < 0.004 && eye < 0.004) discard;
  gl_FragColor = o;
}`;

// (laid over what is behind, the light in it added: premultiplied)
const over = extra => ({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true, ...extra });
const additive = extra => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, ...extra });

export function createPoisonRainFx({ heightAt = null, seed = 1, lift = 0.08, look = POISON_LOOK } = {}) {
  const rng = mulberry32(seed * 733 + 5);
  const object = new THREE.Group();
  object.name = 'poison_rain_fx';
  const sun = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  const T = { value: 0 };                                                       // its own clock (the marks are drawn from it)

  // ---- the ground's marks: one mesh, MARKS patches of G x G points
  const MARKS = 56, G = 12, PER = G * G;
  const mg = new THREE.BufferGeometry();
  const mPos = new Float32Array(MARKS * PER * 3), mLoc = new Float32Array(MARKS * PER * 2), mInfo = new Float32Array(MARKS * PER * 4), mSize = new Float32Array(MARKS * PER);
  for (let s = 0; s < MARKS; s++) for (let i = 0; i < PER; i++) mInfo[(s * PER + i) * 4] = -1;
  const idx = [];
  for (let s = 0; s < MARKS; s++) for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) {
    const b = s * PER + j * G + i;
    idx.push(b, b + G, b + 1, b + 1, b + G, b + G + 1);
  }
  mg.setIndex(idx);
  const aMPos = new THREE.BufferAttribute(mPos, 3).setUsage(THREE.DynamicDrawUsage), aMLoc = new THREE.BufferAttribute(mLoc, 2).setUsage(THREE.DynamicDrawUsage);
  const aMInfo = new THREE.BufferAttribute(mInfo, 4).setUsage(THREE.DynamicDrawUsage), aMSize = new THREE.BufferAttribute(mSize, 1).setUsage(THREE.DynamicDrawUsage);
  mg.setAttribute('position', aMPos); mg.setAttribute('aLocal', aMLoc); mg.setAttribute('aInfo', aMInfo); mg.setAttribute('aSize', aMSize);
  const markMat = new THREE.ShaderMaterial({ vertexShader: MARK_VS, fragmentShader: MARK_FS, ...over({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    uniforms: { uTime: T, uDry: { value: DRY }, uWarn: { value: col(look.warn) }, uShadow: { value: col(look.shadow) },
      uP0: { value: col(look.pool[0]) }, uP1: { value: col(look.pool[1]) }, uP2: { value: col(look.pool[2]) }, uP3: { value: col(look.pool[3]) },
      uRim: { value: col(look.poolRim) }, uHot: { value: col(look.hot) }, uSpark: { value: col(look.spark) } } });
  const marks = new THREE.Mesh(mg, markMat);
  marks.frustumCulled = false; marks.renderOrder = 2;
  object.add(marks);
  const markSlots = [];                                                         // what each patch holds now: { kind, ends, drop }
  let nextMark = 0;
  const groundAt = (x, z, y) => (heightAt ? heightAt(x, z) : y);
  // lay a mark down: kind 0 a warning, 1 a pool, 2 a splash; radius metres; for life seconds from now
  function mark(kind, x, y, z, radius, life, drop = -1) {
    // the oldest patch, unless one is free (a pool still lying is kept if it can be)
    let s = -1;
    for (let k = 0; k < MARKS; k++) { const c = (nextMark + k) % MARKS; if (!markSlots[c] || markSlots[c].ends <= T.value) { s = c; break; } }
    if (s < 0) s = nextMark % MARKS;
    nextMark = s + 1;
    const ext = kind === 0 ? 2.0 : kind === 1 ? 1.45 : 1.9, up = kind === 0 ? 0.02 : kind === 2 ? 0.04 : 0, dice = rng();
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const u = (i / (G - 1) * 2 - 1) * ext, v = (j / (G - 1) * 2 - 1) * ext, k = s * PER + j * G + i;
      const px = x + u * radius, pz = z + v * radius;
      mPos[k * 3] = px; mPos[k * 3 + 1] = groundAt(px, pz, y) + lift + up; mPos[k * 3 + 2] = pz;
      mLoc[k * 2] = u; mLoc[k * 2 + 1] = v;
      mInfo[k * 4] = kind; mInfo[k * 4 + 1] = dice; mInfo[k * 4 + 2] = T.value; mInfo[k * 4 + 3] = life;
      mSize[k] = radius;
    }
    aMPos.needsUpdate = aMLoc.needsUpdate = aMInfo.needsUpdate = aMSize.needsUpdate = true;
    markSlots[s] = { kind, ends: T.value + life, drop };
  }
  function unmark(test) {
    let any = false;
    markSlots.forEach((m, s) => {
      if (!m || !test(m)) return;
      for (let i = 0; i < PER; i++) mInfo[(s * PER + i) * 4] = -1;
      markSlots[s] = null; any = true;
    });
    if (any) aMInfo.needsUpdate = true;
  }

  // ---- orbs (balls, bubbles, glows, drops) and their trails
  const orbMat = new THREE.ShaderMaterial({ vertexShader: ORB_VS, fragmentShader: ORB_FS, ...over(),
    uniforms: { uTime: T, uB0: { value: col(look.ball[0]) }, uB1: { value: col(look.ball[1]) }, uB2: { value: col(look.ball[2]) }, uB3: { value: col(look.ball[3]) },
      uRim: { value: col(look.rim) }, uHalo: { value: col(look.halo) }, uHot: { value: col(look.hot) } } });
  const orbs = makePool(420, { aPos: 3, aInfo: 4 }, orbMat);
  orbs.mesh.renderOrder = 7;
  const trailMat = new THREE.ShaderMaterial({ vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, ...over({ side: THREE.DoubleSide }),
    uniforms: { uTime: T, uT0: { value: col(look.trail[0]) }, uT1: { value: col(look.trail[1]) }, uT2: { value: col(look.trail[2]) } } });
  const trails = makePool(48, { aPos: 3, aVel: 3, aInfo: 4 }, trailMat);
  trails.mesh.renderOrder = 6;
  // ---- sparks, and green breath and steam
  const sparks = makePool(900, { aPos: 3, aVel: 3, aInfo: 4 }, new THREE.ShaderMaterial({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, ...additive() }));
  sparks.mesh.renderOrder = 8;
  const gasMat = new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: HAZE_FS, ...over(),
    uniforms: { uC0: { value: col(look.gas[0]) }, uC1: { value: col(look.gas[1]) }, uTime: T, uA: { value: 1 } } });
  const gas = makePool(170, { aPos: 3, aSize: 2, aInfo: 4 }, gasMat);
  gas.mesh.renderOrder = 5;
  // ---- the whirl in the sky
  const whirlMat = new THREE.ShaderMaterial({ vertexShader: WHIRL_VS, fragmentShader: WHIRL_FS, ...over({ side: THREE.DoubleSide }),
    uniforms: { uA: { value: 0 }, uT: { value: 0 }, uSwell: { value: 0 }, uC0: { value: col(look.cloud[0]) }, uC1: { value: col(look.cloud[1]) },
      uC2: { value: col(look.cloud[2]) }, uC3: { value: col(look.cloud[3]) }, uHot: { value: col(look.hot) } } });
  const whirl = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2), whirlMat);
  whirl.frustumCulled = false; whirl.renderOrder = 4; whirl.visible = false;
  object.add(whirl, gas.mesh, trails.mesh, orbs.mesh, sparks.mesh);

  const cSpark = col(look.spark), cHot = col(look.hot);
  const balls = [];          // spat up, or falling: { p, v, up, age, life, size, trail, dice, to, from, start, dur, drop }
  const pending = [];        // the rain still to come out of the whirl: { at, to, drop }
  const loose = [];          // orbs that live on their own: drops, bubbles, flashes: { p, v, kind, size, life, age, a, fall, grow, dice }
  const pools = [];          // pools lying: { x, y, z, r, born, life }
  function spark(p, v, size, life, hot = 0) {
    if (sparks.list.length >= sparks.max) sparks.list.shift();
    sparks.list.push({ p: p.clone(), v: v.clone(), size, life, age: 0, hot, ph: Math.random() * 6.28, fall: 0 });
    return sparks.list[sparks.list.length - 1];
  }
  function puff(p, v, size, life, thick = 1) {
    if (gas.list.length >= gas.max) gas.list.shift();
    gas.list.push({ p: p.clone(), v: v.clone(), size, life, age: 0, dice: Math.random(), thick });
  }
  function orb(p, v, kind, size, life, extra = {}) {
    if (loose.length >= 300) loose.shift();
    loose.push({ p: p.clone(), v: v.clone(), kind, size, life, age: 0, a: 1, fall: 0, grow: 0, dice: Math.random(), ...extra });
  }

  // ---- where the heads' mouths are now, and which way they face (world)
  const foot = new THREE.Vector3(), eye = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), at = new THREE.Vector3();
  const mouthAt = [0, 1, 2].map(() => new THREE.Vector3()), facing = [0, 1, 2].map(() => new THREE.Vector3(0, 1, 0));
  let haveBoss = false;
  function findMouths(boss) {
    const { heads, mesh } = boss.userData;
    mesh.updateWorldMatrix(true, false);
    boss.getWorldPosition(foot);
    heads.forEach((h, i) => {
      const az = h.faces + h.yaw, tip = h.tipped + h.nod, r = h.radius * (h.scale || 1);
      tmp.set(Math.sin(az) * Math.cos(tip), -Math.sin(tip), Math.cos(az) * Math.cos(tip));
      mouthAt[i].copy(h.centre).add(h.lean).addScaledVector(tmp, r * 0.95);
      mesh.localToWorld(mouthAt[i]);
      facing[i].copy(tmp).transformDirection(mesh.matrixWorld);
    });
    haveBoss = true;
  }
  const whirlAt = () => tmp2.set(foot.x, foot.y + SKY, foot.z);

  // ---- what the moves say
  let swell = 0, gone = 0, jolt = 0, kick = 0;
  function event(e) {
    if (e.move !== 'poison' && e.move !== 'ultimate' && e.type !== 'cancel') return;
    if (e.type === 'spit' && haveBoss) {
      const i = e.head, m = mouthAt[i];
      // the ball, up toward the whirl (a little apart from the others)
      const aim = whirlAt().add(tmp.set((Math.random() - 0.5) * WHIRL * 0.7, 0, (Math.random() - 0.5) * WHIRL * 0.7));
      const v = new THREE.Vector3().subVectors(aim, m).normalize().multiplyScalar(UP_SPEED);
      balls.push({ p: m.clone(), v, up: true, age: 0, life: 1.6, size: 0.42, trail: 2.4, dice: Math.random() });
      // a puff of green breath out of its mouth, a flash, a spray of sparks
      const f = facing[i];
      for (let k = 0; k < 4; k++) puff(m, tmp.copy(f).multiplyScalar(2 + Math.random() * 2).add(tmp2.set((Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5)), 0.7 + Math.random() * 0.5, 0.7 + Math.random() * 0.4, 1);
      for (let k = 0; k < 12; k++) spark(m, tmp.copy(v).normalize().multiplyScalar(6 + Math.random() * 8).add(tmp2.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5)), 0.06 + Math.random() * 0.05, 0.25 + Math.random() * 0.3, Math.random() < 0.4 ? 1 : 0);
      orb(m, tmp.set(0, 0, 0), 2, 1.1, 0.2);
      kick = Math.max(kick, 0.18);
    } else if (e.type === 'warn' && e.shape && e.drop !== undefined) {
      const s = e.shape, y = groundAt(s.x, s.z, s.y);
      mark(0, s.x, s.y, s.z, s.radius, e.lead, e.drop);
      pending.push({ at: T.value + Math.max(0, e.lead - FLIGHT), dur: Math.min(FLIGHT, e.lead), to: new THREE.Vector3(s.x, y + lift, s.z), drop: e.drop });
    } else if (e.type === 'hit' && e.shape && e.drop !== undefined) {
      const s = e.shape, y = groundAt(s.x, s.z, s.y) + lift, p = at.set(s.x, y, s.z);
      for (let i = balls.length - 1; i >= 0; i--) if (balls[i].drop === e.drop) balls.splice(i, 1);
      unmark(m => m.kind === 0 && m.drop === e.drop);
      const pr = e.pool ? e.pool.radius : s.radius * 1.2, life = e.pool ? e.pool.lasts : 8;
      mark(1, s.x, s.y, s.z, pr, life);
      mark(2, s.x, s.y, s.z, s.radius * 1.3, 0.7);
      pools.push({ x: s.x, y, z: s.z, r: pr, born: T.value, life });
      // the burst: green spikes thrown up and out, drops flung, a flash, green breath
      for (let k = 0; k < 30; k++) {
        const a = Math.random() * 6.28, out = 2 + Math.random() * 6, upv = 4 + Math.random() * 8;
        spark(p, tmp.set(Math.sin(a) * out, upv, Math.cos(a) * out), 0.1 + Math.random() * 0.14, 0.3 + Math.random() * 0.35, Math.random() < 0.35 ? 1 : 0).fall = 1;
      }
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * 6.28, out = 2 + Math.random() * 4;
        orb(tmp2.copy(p).add(tmp.set(0, 0.2, 0)), tmp.set(Math.sin(a) * out, 3 + Math.random() * 4, Math.cos(a) * out), 3, 0.11 + Math.random() * 0.1, 1.2, { fall: 1, floor: y });
      }
      orb(tmp2.copy(p).add(tmp.set(0, 0.5, 0)), tmp.set(0, 0, 0), 2, 2.4, 0.3);
      for (let k = 0; k < 4; k++) puff(tmp2.copy(p).add(tmp.set((Math.random() - 0.5) * 1.2, 0.3, (Math.random() - 0.5) * 1.2)), tmp.set((Math.random() - 0.5) * 1.2, 1 + Math.random(), (Math.random() - 0.5) * 1.2), 1.0 + Math.random() * 0.6, 1.0 + Math.random() * 0.6, 1);
      jolt = Math.max(jolt, 0.4);
    } else if (e.type === 'cancel') {
      pending.length = 0;
      for (const b of balls) if (!b.up) b.life = Math.min(b.life, b.age + 0.15);
      unmark(m => m.kind === 0);
      gone = 1;
    }
  }

  // ---- she stands in poison
  const her = new THREE.Vector3();
  let afflicted = 0;
  function afflict(p, k) { if (p) her.copy(p); afflicted = k; }

  // ---- the run of it
  const me = { object, shake: 0, busy: false, event, update, afflict, setSun, dispose };
  let last = -1;
  function setSun(v) { sun.copy(v).normalize(); }

  function update(dt, camera, boss, t, move = 'poison') {
    const B = BOSS_MOVES[move] || BOSS_MOVES.poison;
    T.value += dt;
    const on = t >= 0;
    if (on && (last < 0 || t < last)) { swell = 0; gone = 0; }                     // a new rain
    last = on ? t : -1;
    if (boss) findMouths(boss);
    const tt = on ? t : 99;

    // green light burning in the mouths as they gather themselves, brighter as they spit
    const burn = on ? Math.max(0.55 * pulse(tt, B.gather, B.gather + 0.5, B.up - 0.1, B.up + 0.2), pulse(tt, B.up, B.up + 0.25, B.volley[1], B.volley[1] + 0.35)) * (1 - gone) : 0;
    if (burn > 0.01 && haveBoss) for (let i = 0; i < 3; i++) {
      orb(mouthAt[i], tmp.set(0, 0, 0), 2, 0.42 + 0.2 * burn, dt * 1.01 + 1e-4, { a: burn * (0.75 + 0.25 * Math.sin(T.value * 23 + i * 2)) });
      if (Math.random() < dt * 14 * burn) spark(tmp2.copy(mouthAt[i]).add(tmp.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6)), tmp.set((Math.random() - 0.5) * 1.5, 1 + Math.random() * 2, (Math.random() - 0.5) * 1.5), 0.05 + Math.random() * 0.03, 0.4 + Math.random() * 0.3);
    }

    // the whirl in the sky: wound up as the light goes up out of the middle head, swelling as the balls go in, gone once
    // the last of the rain has come out of it
    const lastOut = B.rain[1] + B.lead - FLIGHT;
    gone = gone > 0 ? Math.min(1, gone + dt * 2.5) : 0;
    const whirlK = on ? pulse(tt, B.beam, B.beam + 0.9, lastOut + 0.15, lastOut + 1.2) * (1 - gone) : 0;
    whirl.visible = whirlK > 0.003;
    whirl.position.copy(whirlAt());
    whirl.scale.setScalar(WHIRL * (0.45 + 0.55 * sstep(0, 1, whirlK)) * (1 + 0.12 * swell));
    whirlMat.uniforms.uA.value = whirlK;
    whirlMat.uniforms.uT.value += dt * (0.9 + 1.6 * swell);
    whirlMat.uniforms.uSwell.value = swell;
    swell = Math.max(0, swell - dt * 0.12);
    // balls of poison going round in it
    if (whirlK > 0.02) for (let k = 0; k < 8; k++) {
      const a = whirlMat.uniforms.uT.value * 1.2 + k * 0.785, rr = WHIRL * (0.32 + 0.4 * ((k * 0.37) % 1)) * (0.6 + 0.4 * whirlK);
      orb(tmp.set(foot.x + Math.cos(a) * rr, foot.y + SKY - 0.35 + 0.2 * Math.sin(a * 2 + k), foot.z + Math.sin(a) * rr), tmp2.set(0, 0, 0), 0, 0.42, dt * 1.01 + 1e-4, { a: sstep(0.2, 0.8, whirlK), dice: k * 0.13 });
    }
    if (whirlK > 0.2 && Math.random() < dt * 25 * whirlK) {
      const a = Math.random() * 6.28, rr = WHIRL * (0.3 + Math.random() * 0.6);
      spark(tmp.set(foot.x + Math.cos(a) * rr, foot.y + SKY - 0.3, foot.z + Math.sin(a) * rr), tmp2.set(-Math.sin(a) * 6, -0.5 - Math.random(), Math.cos(a) * 6), 0.07 + Math.random() * 0.05, 0.35 + Math.random() * 0.3);
    }

    // the rain coming out of the whirl
    for (let i = pending.length - 1; i >= 0; i--) {
      const q = pending[i];
      if (T.value < q.at) continue;
      pending.splice(i, 1);
      const a = Math.random() * 6.28, rr = Math.random() * WHIRL * 0.7;
      const from = new THREE.Vector3(foot.x + Math.cos(a) * rr, foot.y + SKY - 0.4, foot.z + Math.sin(a) * rr);
      balls.push({ p: from.clone(), v: new THREE.Vector3().subVectors(q.to, from).divideScalar(q.dur), up: false, age: T.value - q.at, life: q.dur + 0.05, size: 0.62, trail: 6, dice: Math.random(), from, to: q.to, dur: q.dur, drop: q.drop });
      orb(from, tmp.set(0, 0, 0), 2, 1.3, 0.22);
    }

    // the rain that falls wide of her: smaller balls out of the whirl all round, splashing far off. No warning, no pool:
    // they are only the rain (the moves' drops are what strike)
    const wide = on ? pulse(tt, B.rain[0] + B.lead - FLIGHT - 0.1, B.rain[0] + B.lead - FLIGHT + 0.3, lastOut - 0.2, lastOut + 0.1) * (1 - gone) : 0;
    if (wide > 0 && Math.random() < dt * 7 * wide) {
      let x = 0, z = 0;
      for (let k = 0; k < 5; k++) {
        const a = Math.random() * 6.28, rr = 11 + Math.random() * 13;
        x = foot.x + Math.cos(a) * rr; z = foot.z + Math.sin(a) * rr;
        if (Math.hypot(x - her.x, z - her.z) > 8) break;
      }
      const a = Math.random() * 6.28, rr = Math.random() * WHIRL * 0.7, dur = 0.75 + Math.random() * 0.3;
      const from = new THREE.Vector3(foot.x + Math.cos(a) * rr, foot.y + SKY - 0.4, foot.z + Math.sin(a) * rr), to = new THREE.Vector3(x, groundAt(x, z, foot.y) + lift, z);
      balls.push({ p: from.clone(), v: new THREE.Vector3(), up: false, wide: true, age: 0, life: dur, size: 0.36, trail: 4, dice: Math.random(), from, to, dur });
    }

    // the balls: spat up (into the whirl), or falling (along the way to where they land, quicker as they come)
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.age += dt;
      if (b.up) {
        b.v.y -= 2 * dt;
        b.p.addScaledVector(b.v, dt);
        if (b.p.y >= foot.y + SKY - 0.4 || b.age > b.life) {                    // into the whirl: it swells, a flash and sparks
          swell = Math.min(1, swell + 0.12);
          orb(b.p, tmp.set(0, 0, 0), 2, 1.2, 0.25);
          for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28; spark(b.p, tmp.set(Math.cos(a) * 5, (Math.random() - 0.3) * 3, Math.sin(a) * 5), 0.06 + Math.random() * 0.04, 0.3 + Math.random() * 0.25, 1); }
          balls.splice(i, 1);
        }
      } else {
        const u = clamp(b.age / b.dur, 0, 1), e = Math.pow(u, 1.35);
        b.p.lerpVectors(b.from, b.to, e);
        b.v.subVectors(b.to, b.from).multiplyScalar(1.35 * Math.pow(Math.max(u, 0.05), 0.35) / b.dur);
        if (Math.random() < dt * 40) spark(b.p, tmp.copy(b.v).multiplyScalar(-0.08).add(tmp2.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2)), 0.06 + Math.random() * 0.05, 0.3 + Math.random() * 0.25, Math.random() < 0.3 ? 1 : 0);
        if (Math.random() < dt * 9) orb(b.p, tmp.copy(b.v).multiplyScalar(0.25), 3, 0.08 + Math.random() * 0.06, 0.6, { fall: 1 });
        if (b.age >= b.life) {
          if (b.wide) {                                                          // a drop of the wide rain lands: a small splash
            mark(2, b.to.x, b.to.y - lift, b.to.z, 0.9, 0.6);
            for (let k = 0; k < 12; k++) { const a = Math.random() * 6.28, o = 1.5 + Math.random() * 3; spark(b.to, tmp.set(Math.sin(a) * o, 3 + Math.random() * 5, Math.cos(a) * o), 0.07 + Math.random() * 0.08, 0.3 + Math.random() * 0.25, Math.random() < 0.3 ? 1 : 0).fall = 1; }
            orb(tmp2.copy(b.to).add(tmp.set(0, 0.4, 0)), tmp.set(0, 0, 0), 2, 1.4, 0.25);
            puff(tmp2.copy(b.to).add(tmp.set(0, 0.3, 0)), tmp.set(0, 0.8, 0), 0.9, 0.9, 0.8);
          }
          balls.splice(i, 1);
        }
      }
    }

    // the pools: steam rising off them, bubbles welling up and popping, motes
    for (let i = pools.length - 1; i >= 0; i--) {
      const q = pools[i], age = T.value - q.born, st = poolStrength(age, q.life);
      if (age > q.life) { pools.splice(i, 1); continue; }
      const anywhere = () => { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * q.r * 0.7; return tmp2.set(q.x + Math.cos(a) * rr, q.y, q.z + Math.sin(a) * rr); };
      if (Math.random() < dt * 1.8 * st) puff(anywhere().add(tmp.set(0, 0.25, 0)), tmp.set((Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3), 0.9 + Math.random() * 0.7, 1.6 + Math.random() * 0.9, 0.8);
      if (Math.random() < dt * 3.2 * st) orb(anywhere().add(tmp.set(0, 0.05, 0)), tmp.set(0, 0.45 + Math.random() * 0.4, 0), 1, 0.05, 0.55 + Math.random() * 0.4, { grow: 0.14 + Math.random() * 0.1, pops: 1 });
      if (Math.random() < dt * 2.5 * st) spark(anywhere().add(tmp.set(0, 0.1, 0)), tmp.set((Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4), 0.04 + Math.random() * 0.03, 0.8 + Math.random() * 0.5);
    }
    // her, standing in it: bubbles and motes rising off her, a green light at her feet
    if (afflicted > 0.01) {
      if (Math.random() < dt * 12 * afflicted) { const a = Math.random() * 6.28; orb(tmp2.set(her.x + Math.cos(a) * 0.35, her.y + 0.2 + Math.random() * 1.3, her.z + Math.sin(a) * 0.35), tmp.set(0, 0.5 + Math.random() * 0.5, 0), 1, 0.04, 0.6 + Math.random() * 0.3, { grow: 0.08 + Math.random() * 0.06, pops: 1 }); }
      if (Math.random() < dt * 16 * afflicted) { const a = Math.random() * 6.28; spark(tmp2.set(her.x + Math.cos(a) * 0.4, her.y + Math.random() * 1.5, her.z + Math.sin(a) * 0.4), tmp.set(0, 0.9 + Math.random(), 0), 0.04 + Math.random() * 0.03, 0.6 + Math.random() * 0.4); }
      orb(tmp2.set(her.x, her.y + 0.12, her.z), tmp.set(0, 0, 0), 2, 0.75, dt * 1.01 + 1e-4, { a: afflicted * (0.3 + 0.1 * Math.sin(T.value * 9)) });
    }

    // ---- write the pools out for drawing
    // orbs: the balls, then the loose ones
    {
      const A = orbs.arrays;
      let n = 0;
      const put = (p, kind, size, a, dice) => { if (n >= orbs.max) return; A.aPos.set([p.x, p.y, p.z], n * 3); A.aInfo.set([kind, size, a, dice], n * 4); n++; };
      for (const b of balls) put(b.p, 0, b.size, Math.min(1, b.age * 12), b.dice);
      for (let i = loose.length - 1; i >= 0; i--) { const o = loose[i]; o.age += dt; if (o.age >= o.life) { if (o.pops) spark(o.p, tmp.set(0, 1, 0), 0.05, 0.2, 1); loose.splice(i, 1); } }
      for (const o of loose) {
        if (o.fall) { o.v.y -= 14 * dt; if (o.floor !== undefined && o.p.y < o.floor) { o.life = Math.min(o.life, o.age + 0.05); } }
        o.p.addScaledVector(o.v, dt);
        const k = o.age / o.life;
        let size = o.size, a = o.a;
        if (o.kind === 1) size = o.size + o.grow * Math.min(1, k * 1.4);                             // a bubble swells
        else if (o.kind === 2 && o.life > 0.1) { size = o.size * (0.6 + 0.6 * k); a *= 1 - k * k; }  // a flash spreads and fades
        else if (o.kind === 3) a *= 1 - sstep(0.7, 1, k);
        put(o.p, o.kind, size, a, o.dice);
      }
      orbs.g.instanceCount = n;
      for (const name in A) orbs.g.attributes[name].needsUpdate = true;
    }
    // trails: behind each ball
    {
      const A = trails.arrays;
      let n = 0;
      for (const b of balls) {
        if (n >= trails.max) break;
        const grow = Math.min(1, b.age / 0.25);
        A.aPos.set([b.p.x, b.p.y, b.p.z], n * 3);
        A.aVel.set([b.v.x, b.v.y, b.v.z], n * 3);
        A.aInfo.set([b.trail * grow, b.size * 1.6, 0.9, b.dice], n * 4);
        n++;
      }
      trails.g.instanceCount = n;
      for (const name in A) trails.g.attributes[name].needsUpdate = true;
    }
    // sparks
    {
      const A = sparks.arrays;
      let n = 0;
      for (let i = sparks.list.length - 1; i >= 0; i--) { const p = sparks.list[i]; p.age += dt; if (p.age >= p.life) sparks.list.splice(i, 1); }
      for (const p of sparks.list) {
        const k = p.age / p.life;
        if (p.fall) { p.v.multiplyScalar(Math.exp(-1.2 * dt)); p.v.y -= 16 * dt; }
        else { p.v.multiplyScalar(Math.exp(-1.6 * dt)); p.v.y += 0.4 * dt; }
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
    // green breath and steam
    {
      const A = gas.arrays;
      let n = 0;
      for (let i = gas.list.length - 1; i >= 0; i--) { const p = gas.list[i]; p.age += dt; if (p.age >= p.life) gas.list.splice(i, 1); }
      for (const p of gas.list) {
        const k = p.age / p.life;
        p.v.multiplyScalar(Math.exp(-1.6 * dt)); p.v.y += 0.35 * dt;
        p.p.addScaledVector(p.v, dt);
        const s = p.size * (1 + 1.3 * k);
        A.aPos.set([p.p.x, p.p.y, p.p.z], n * 3);
        A.aSize.set([s, s * 0.9], n * 2);
        A.aInfo.set([0, p.dice, k, p.thick * 1.4], n * 4);
        n++;
      }
      gas.g.instanceCount = n;
      for (const name in A) gas.g.attributes[name].needsUpdate = true;
    }

    jolt = Math.max(0, jolt - dt * 2.2); kick = Math.max(0, kick - dt * 2.5);
    me.shake = Math.max(jolt, kick, 0.1 * whirlK);
    me.busy = on || balls.length > 0 || pending.length > 0 || pools.length > 0 || loose.length > 0 || sparks.list.length > 0 || gas.list.length > 0
      || markSlots.some(m => m && m.ends > T.value);
    object.visible = me.busy;
  }
  function dispose() {
    mg.dispose(); markMat.dispose(); orbs.g.dispose(); orbMat.dispose(); trails.g.dispose(); trailMat.dispose();
    sparks.g.dispose(); sparks.mesh.material.dispose(); gas.g.dispose(); gasMat.dispose(); whirl.geometry.dispose(); whirlMat.dispose();
  }
  return me;
}
