/* ==========================================================================
   skybeam-fx.js  —  all the plant boss's sky beam draws near it (plant-boss-moves.js: play('skybeam')), after the clip it
   was asked from: a circle of runes opening on the ground round the plant; a flash across each head's eyes; flames at
   the corners of their eyes, green wind winding round it, roots breaking out of the ground with stones and dust, the
   ground cracking; circles of runes opening in the sky over it, one over another, turning against each other; light
   winding up to them; a glow gathering in each mouth; three beams going up into the circles; then the light coming down
   on the plant as a column, bursting out over the ground in spikes of light, the earth heaved up in plates round it,
   stones flung up; the circles breaking into sparks; and what is left drifting down, bright petals on the air.
   One job: draw that. It decides nothing: the move's time says where it is. (The sky itself is storm-sky.js's; the
   shockwave that runs out over the field, shockwave-fx.js's; the plant's own acting, plant-boss-moves.js's.)

     const fx = createSkybeamFx({ heightAt, lift, seed })   heightAt(x, z): the ground's height (world); null: the plant's
                                                   foot's. lift: metres its marks on the ground lie over it (over the
                                                   grass's tips)
     fx.solid        what of it is solid (roots, stones, the broken earth, dust, torn leaves): lit by the sun as the land
                     is. Add it to the land's scene
     fx.object       what of it is light: to be drawn after the land (and after the land is dimmed to the storm's light)
     every frame: fx.update(dt, camera, boss, t)   t: seconds into the move (moves.time while moves.state is 'skybeam'),
                                                   or < 0 when there is none
     fx.shake        0..1: how hard the ground jolts now (the camera's to shake, if it likes)
     fx.flash        0..1: the whole picture washed with light for a moment, as it lands (the page's to draw, if it likes)
     fx.busy         true while anything of it is still to be seen
     fx.setSun(vec3), fx.dispose()
     fx.pictures     the circles' pictures (textures): a page may send them to the card before the move begins
                     (renderer.initTexture), so nothing waits for them as the circles open
     SKYBEAM         its own numbers: how high each circle lies in the sky and how wide it is
     SKYBEAM_SHOCK_LOOK   the colours for the shockwave it sends out (shockwave-fx.js's createShockwaveFx({ look }))

   The beats are BOSS_MOVES.skybeam's. Drawn the kit's way: flat tones and hard edges for what is solid, light laid over
   the picture for what glows. Each piece is hidden while it has nothing to show; at its fullest (as the light lands)
   some twenty-five draw calls.
   ========================================================================== */
import * as THREE from 'three';
import { BOSS_MOVES } from './plant-boss-moves.js';
import { BOSS_LOOK } from './plant-boss.js';
import { _fx } from './thicket-fx.js';
import { brokenEarth, earthUniforms, BROKEN_EARTH_GLSL } from './broken-earth.js';
import { runeCirclePicture, createRuneCircle, RUNE_LOOKS, RUNE_SPLITS } from './rune-circle.js';
import { STORM_SKY } from './storm-sky.js';
import { mulberry32, _internal as natureInternal } from './stylized-nature.js';

const { NOISE } = natureInternal;
const { SPARK_VS, SPARK_FS, PUFF_VS, PUFF_FS, ROCK_VS, ROCK_FS, makePool, col } = _fx;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sstep = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };
const pulse = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t));
const outBack = x => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const rnd = (a, b) => a + Math.random() * (b - a);

// the circles in the sky: metres over the plant's foot, and their radius. The beams go up into the middle one
export const SKYBEAM = { main: { y: 24, r: 8 }, halo: { y: 28.5, r: 11.5 }, low: { y: 20.5, r: 4.6 } };
export const SKYBEAM_LOOK = {
  light: '#ffd24a', lightHot: '#fff6c8',                                   // the light it throws on the ground
  wind: '#9aee4a', windDeep: '#3fbf3a', windHot: '#f4ffd0',                // the green wind, and the light winding up
  breeze: '#fff2c4', breezeDeep: '#ffd98a',                                // the air after, drifting
  beam: '#f6ff9a', beamEdge: '#7dff5a', beamHot: '#ffffff',                // the three beams
  pillar: ['#fffef4', '#fff0a0', '#b6ff6a'],                               // the column: its heart, its body, its edge
  spike: ['#fffbe0', '#ffd24a', '#ff8a2a'],                                // the burst's spikes: middle, body, edge
  flame: ['#fff6e2', '#ffc64a', '#ff8a70'],                                // the flames at their eyes: heart, body, tip
  glint: '#fff0b0', charge: '#f2ff8a', flare: '#fff4b8',
  spark: '#d8ff6a', ember: '#ffc04a', mote: '#fff2a8',
  leaf: ['#4f7a26', '#86b23a', '#b2d24c'], petal: ['#fff3a0', '#dcff7a', '#ffd95a'],
  wood: BOSS_LOOK.wood,
  rock: ['#585048', '#6c6258', '#7c7165', '#4a433d'], dust: ['#8f8574', '#ada28d', '#cbc1aa'],
  plateSide: '#4d453c', seam: '#3a3027', crackHot: '#ffd070', seamHot: '#ff9a2e',
};
// the shockwave its landing sends out over the field: shockwave-fx.js's, in the sky beam's gold and green (createShockwaveFx({ look }))
export const SKYBEAM_SHOCK_LOOK = {
  red: '#ffe14a', deep: '#8fd23a', glow: '#d8ff6a', hot: '#fffbe6',          // the ring: its body, behind it, the light round it, its white-hot line
  wall: '#f2ff7a', wallHot: '#fffbe6', spark: '#e2ff7a', flash: '#fff6c8',
};

const additive = extra => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, ...extra });
// (laid over what is behind, the light in it added: premultiplied)
const over = extra => ({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true, ...extra });

// --------------------------------------------------------------------------
// glows: camera-facing cut-outs of light. kind 0: a round glow; 1: a four-pointed twinkle; 2: a streak (a thin line of
// light, brightest in its middle); 3: a tongue of flame, from its foot to its tip
// --------------------------------------------------------------------------
const GLOW_VS = /* glsl */`
attribute vec3 aPos;
attribute vec3 aSize;        // width, height (metres), turned (radians)
attribute vec4 aCol;         // its colour times how bright it is; w: its kind
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vUv = uv; vCol = aCol;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float c = cos(aSize.z), s = sin(aSize.z);
  vec2 p = position.xy * aSize.xy;
  mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FS = /* glsl */`
${NOISE}
uniform float uT;
uniform vec3 uF0, uF1, uF2;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float kind = vCol.a, s = 0.0, d = length(p);
  vec3 c = vCol.rgb;
  if (kind < 0.5) {
    s = exp(-d * d * 5.0) * (1.0 - smoothstep(0.8, 1.0, d));
    c = mix(c, vec3(max(c.r, max(c.g, c.b))), exp(-d * d * 22.0) * 0.85);              // (a white-hot heart)
  } else if (kind < 1.5) {
    vec2 a = abs(p);
    float star = max(0.0, 1.0 - (a.x * a.y * 38.0 + d * 1.1));
    s = (star * star + exp(-d * d * 26.0)) * (1.0 - smoothstep(0.85, 1.0, max(a.x, a.y)));
  } else if (kind < 2.5) {
    vec2 q = p * vec2(3.0, 1.0);
    s = exp(-p.y * p.y * 18.0) * pow(max(0.0, 1.0 - abs(p.x)), 1.6) + exp(-dot(q, q) * 6.0) * 0.6;
  } else {
    float y = p.y * 0.5 + 0.5, bright = c.r, dice = c.g;
    float wob = (noise2(vec2(y * 3.0 - uT * 4.0, dice * 7.0)) - 0.5) * 0.5 * y;
    float w = pow(max(1.0 - y, 0.0), 0.75) * 0.62 + 0.03, x = abs(p.x + wob);
    float lick = noise2(vec2(p.x * 3.0 + dice * 5.0, y * 5.0 - uT * 6.0));
    s = (1.0 - smoothstep(w * 0.55, w, x)) * smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.5 + 0.45 * lick, 1.0, y));
    c = mix(mix(uF0, uF1, smoothstep(0.1, 0.55, y + x)), uF2, smoothstep(0.5, 0.95, y)) * bright;
  }
  if (s < 0.004) discard;
  gl_FragColor = vec4(c * s, s);
}`;

// --------------------------------------------------------------------------
// ribbons: the green wind round the plant, the light winding up to the sky, the air drifting after. Built once
// --------------------------------------------------------------------------
const RIBBON_VS = /* glsl */`
attribute vec4 aW;           // x: along 0..1, y: across -1..1, z: its own phase, w: how quick its streaks run
varying vec4 vW;
void main() { vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIBBON_FS = /* glsl */`
uniform vec3 uC, uDeep, uHot;
uniform float uA, uT, uGrow, uRun, uCover;
varying vec4 vW;
void main() {
  float u = vW.x, v = vW.y;
  // streaks running along it: a bright head, a long tail
  float f = fract(u * uRun - uT * vW.w + vW.z);
  float streak = (1.0 - smoothstep(0.94, 1.0, f)) * smoothstep(0.1, 0.94, f);
  float across = 1.0 - abs(v), body = across * across;
  float line = exp(-(v - 0.42) * (v - 0.42) / 0.029);                // its bright upper edge
  float ends = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.88, 1.0, u));
  float grown = 1.0 - smoothstep(uGrow - 0.05, uGrow, u);            // it grows from its foot
  float tip = exp(-(u - uGrow + 0.03) * (u - uGrow + 0.03) / 0.0012) * step(uGrow, 0.999) * step(0.001, uGrow);
  float s = ((body * (0.3 + 0.7 * streak) + line * (0.25 + 0.75 * streak)) * ends * grown + tip * across * 1.2) * uA;
  if (s < 0.004) discard;
  s = min(s, 1.0);
  vec3 c = mix(mix(uDeep, uC, body), uHot, clamp(line * streak * 0.8 + tip, 0.0, 1.0));
  gl_FragColor = vec4(c * s, s * uCover);                           // (uCover: how much of what is behind it hides: 0, it only adds)
}`;

// --------------------------------------------------------------------------
// strips: the three beams, and the threads of light wound round the column. Laid every frame, turned to the camera
// --------------------------------------------------------------------------
const STRIP_VS = /* glsl */`
attribute vec3 aS;           // x: along 0..1, y: across -1..1, z: how strongly this point shows
varying vec3 vS;
void main() { vS = aS; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const STRIP_FS = /* glsl */`
${NOISE}
uniform vec3 uC, uEdge, uHot;
uniform float uT;
varying vec3 vS;
void main() {
  float across = 1.0 - abs(vS.y), core = smoothstep(0.62, 0.92, across);
  float flow = 0.7 + 0.3 * noise2(vec2(vS.x * 16.0 - uT * 10.0, vS.y * 2.0));
  float s = min((across * across * 0.75 * flow + core) * vS.z, 1.0);
  if (s < 0.004) discard;
  gl_FragColor = vec4(mix(mix(uEdge, uC, across), uHot, core) * s, s);
}`;

// --------------------------------------------------------------------------
// the column of light: one strip standing on the ground, turned to the camera
// --------------------------------------------------------------------------
const PILLAR_VS = /* glsl */`
uniform vec3 uBase;
uniform float uH, uW;
varying vec2 vB;
void main() {
  vB = vec2(position.x * 2.0, position.y);
  vec3 up = vec3(0.0, 1.0, 0.0), view = normalize(cameraPosition - uBase);
  vec3 right = normalize(cross(up, view) + vec3(1e-4, 0.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(uBase + right * position.x * uW + up * position.y * uH, 1.0);
}`;
const PILLAR_FS = /* glsl */`
${NOISE}
uniform vec3 uHeart, uBody, uEdge;
uniform float uA, uT, uDrop, uThin;
varying vec2 vB;
void main() {
  float y = vB.y;
  // its edges waver (its heart stays straight); light streams down it
  float wav = (noise2(vec2(y * 9.0 + uT * 5.0, 1.0)) - 0.5) * 0.24 + (noise2(vec2(y * 31.0 + uT * 11.0, 5.0)) - 0.5) * 0.09;
  float x = vB.x + wav * (1.0 - exp(-abs(vB.x) * 3.0)), x2 = x * x;
  float stream = noise2(vec2(vB.x * 6.0, y * 26.0 + uT * 16.0)) * 0.6 + noise2(vec2(vB.x * 15.0 + 3.0, y * 60.0 + uT * 30.0)) * 0.4;
  float heart = exp(-x2 * 130.0), body = exp(-x2 * 11.0 / max(uThin * uThin, 0.01)), edge = exp(-x2 * 2.8 / max(uThin * uThin, 0.01));
  float come = step(1.0 - uDrop, y);                               // it comes down out of the sky
  float inside = (1.0 - vB.x * vB.x) * (1.0 - vB.x * vB.x);        // (nothing of it at the strip's own edge, however wide it swells)
  float s = clamp(heart + body * (0.55 + 0.45 * stream) + edge * 0.32 * (0.55 + 0.45 * stream) * inside, 0.0, 1.0) * come * uA;
  if (s < 0.004) discard;
  vec3 c = mix(mix(uEdge, uBody, clamp(body * 1.3, 0.0, 1.0)), uHeart, clamp(heart * 1.2 + body * body * 0.3, 0.0, 1.0));
  gl_FragColor = vec4(c * s, s * 0.8);
}`;

// --------------------------------------------------------------------------
// the burst's spikes: flat pointed cut-outs of light shot out from where it lands, turned to the camera
// --------------------------------------------------------------------------
const SPIKE_VS = /* glsl */`
attribute vec4 aSpike;       // xyz: the way it points, w: how long (metres)
attribute vec4 aAt;          // x: across its foot (-1, 1; 0: its tip), y: 0 its foot .. 1 its tip, z: when it shoots (seconds after the light lands), w: how wide its foot (metres)
uniform float uT;
uniform vec3 uBase;
varying vec2 vSp;
void main() {
  float x = clamp((uT - aAt.z) / 0.09, 0.0, 1.0), gone = clamp((uT - aAt.z - 0.17) / 0.36, 0.0, 1.0);
  float shot = (1.0 - (1.0 - x) * (1.0 - x)) * step(0.0, uT - aAt.z);
  vec3 dir = normalize(aSpike.xyz);
  // it shoots out; then its foot runs out after its tip, and it is gone
  float tipAt = (0.7 + aSpike.w) * shot + 2.2 * gone, footAt = 0.7 * shot + (aSpike.w + 1.8) * gone * gone;
  vec3 side = normalize(cross(dir, cameraPosition - (uBase + dir * 3.0)) + vec3(1e-5));
  vec3 p = uBase + dir * mix(footAt, tipAt, aAt.y) + side * aAt.x * aAt.w * (1.0 - gone) * shot;
  vSp = vec2(aAt.x, aAt.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const SPIKE_FS = /* glsl */`
uniform vec3 uS0, uS1, uS2;
uniform float uA;
varying vec2 vSp;
void main() {
  float e = abs(vSp.x) / max(1.0 - vSp.y, 0.001);                  // how far across it, whatever its width here
  vec3 c = e > 0.7 ? uS2 : (e > 0.36 ? uS1 : uS0);
  gl_FragColor = vec4(c * uA, uA);
}`;

// --------------------------------------------------------------------------
// flat light on the ground and in the air: the light the spell throws on the ground; a ring running out through the air
// --------------------------------------------------------------------------
const FLAT_VS = /* glsl */`
varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LIGHT_FS = /* glsl */`
uniform vec3 uC, uHot;
uniform float uA;
varying vec2 vP;
void main() {
  float r = length(vP), s = (1.0 - smoothstep(0.0, 1.0, r));
  s = s * s * uA;
  if (s < 0.004) discard;
  gl_FragColor = vec4(mix(uC, uHot, s * 0.6) * s, s);
}`;
const AIRRING_FS = /* glsl */`
uniform vec3 uC;
uniform float uA;
varying vec2 vP;
void main() {
  float v = (length(vP) - 0.93) / 0.07, s = (1.0 - abs(v * 2.0 - 1.0));
  s = pow(clamp(s, 0.0, 1.0), 1.5) * uA;
  if (s < 0.004) discard;
  gl_FragColor = vec4(uC * s, s);
}`;

// --------------------------------------------------------------------------
// the earth under it: its cracks running out from the plant, then all of it broken (the game's own dry earth)
// --------------------------------------------------------------------------
const EARTH_VS = /* glsl */`
varying vec2 vL, vWd;
void main() {
  vL = position.xz;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWd = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const EARTH_FS = /* glsl */`
${NOISE}
${BROKEN_EARTH_GLSL}
uniform float uR, uCrack, uBroken, uHeat, uFade;
uniform vec3 uSeam, uHot;
varying vec2 vL, vWd;
void main() {
  float r = length(vL) / uR;
  vec4 e = earthAt(vWd);
  float ragged = noise2(vWd * 0.9) * 0.55 + noise2(vWd * 2.3) * 0.45;
  // its cracks, run out from the middle so far
  float run = 1.0 - smoothstep(uCrack - 0.14, uCrack, r + (ragged - 0.5) * 0.3);
  float crack = smoothstep(0.2, 0.55, e.a) * run * (1.0 - uBroken);
  // all of it broken, out to a ragged edge
  float lobes = noise2(vWd * 0.45 + 11.0);
  float broken = uBroken * (1.0 - smoothstep(0.9, 0.93, r + (lobes - 0.5) * 0.36 + (ragged - 0.5) * 0.16));
  vec3 c = mix(uSeam, e.rgb * (0.86 - 0.34 * e.a), broken);
  float a = max(crack, broken) * uFade;
  vec3 light = uHot * crackGlowAt(vWd) * uHeat * run * uFade * (1.0 - 0.5 * broken);
  if (a < 0.003 && max(light.r, light.g) < 0.003) discard;
  gl_FragColor = vec4(c * a + light, a);
}`;
// the plates it is heaved up in: each turned about its own middle, its inner edge up, as a crater's rim
const PLATE_VS = /* glsl */`
attribute vec4 aPlate;       // xy: its middle (x, z, metres from the plant's foot), z: when it comes up (seconds after the light lands), w: its own dice
attribute vec4 aKind;        // x: another dice, y: 1 a side, z: the height it turns about, w: how far down its side 0..1
attribute vec2 aEarth;       // where on the world this point of it lay (x, z): the earth on its top is read there
uniform float uT, uSettle, uSink, uDown;
varying vec3 vN;
varying vec4 vKind;
varying vec2 vEarth;
vec3 turn(vec3 v, vec3 k, float a) { return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
void main() {
  float x = clamp((uT - aPlate.z) / 0.22, 0.0, 1.0) - 1.0;
  float e = (1.0 + 2.4 * x * x * x + 1.4 * x * x) * (1.0 - uSink);                  // it comes up, a little past, and settles
  vec3 c = vec3(aPlate.x, aKind.z, aPlate.y);
  vec3 k = normalize(vec3(aPlate.y, 0.0, -aPlate.x) + vec3(1e-4, 0.0, 0.0));
  float tip = (0.14 + 0.4 * aPlate.w) * e * (1.0 - 0.22 * uSettle);
  vec3 p = turn(position - c, k, tip) + c;
  p.y += e * (0.1 + 0.42 * aKind.x) * (1.0 - 0.3 * uSettle) - uDown * (1.0 - e);
  vN = normalize(mat3(modelMatrix) * turn(normal, k, tip));
  vKind = aKind; vEarth = aEarth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const PLATE_FS = /* glsl */`
${BROKEN_EARTH_GLSL}
uniform vec3 uSun, uSide, uSeamHot, uTint;
uniform float uGlow, uHeat;
varying vec3 vN;
varying vec4 vKind;
varying vec2 vEarth;
void main() {
  vec3 n = normalize(vN);
  float l = dot(n, uSun);
  vec3 c;
  if (vKind.y > 0.5) c = mix(l > 0.25 ? uSide * 1.3 : uSide, uSeamHot, smoothstep(0.4, 0.9, vKind.w) * uHeat);
  else {
    // its top: the earth it was cut from, in three tones of light as it tips
    vec3 e = earthAt(vEarth).rgb;
    c = e * (l > 0.8 ? 1.12 : (l > 0.55 ? 1.0 : 0.8));
  }
  gl_FragColor = vec4(mix(c, uTint, uGlow * 0.16), 1.0);
}`;

// --------------------------------------------------------------------------
// the roots that break out of the ground round it: twisted wood, in the plant's own bark tones
// --------------------------------------------------------------------------
const ROOT_VS = /* glsl */`
attribute vec4 aRoot;        // x, z: where it comes up (metres from the plant's foot), z: when (seconds after they begin), w: how tall
attribute vec2 aAlong;       // x: how far along it 0..1, y: its own dice
uniform float uT, uSink;
varying vec3 vN;
varying vec2 vAlong;
void main() {
  float x = clamp((uT - aRoot.z) / 0.42, 0.0, 1.0) - 1.0;
  float up = (1.0 + 2.70158 * x * x * x + 1.70158 * x * x) * (1.0 - uSink);          // it comes up, a little past, and settles
  vec3 p = position;
  // it writhes, more toward its end
  float t = aAlong.x, ph = aAlong.y * 6.2831;
  p.x += sin(uT * 4.3 + ph + t * 3.0) * 0.16 * t * t * up;
  p.z += cos(uT * 3.7 + ph * 1.3 + t * 2.4) * 0.16 * t * t * up;
  p.y -= (1.0 - up) * (aRoot.w + 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vAlong = aAlong;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const ROOT_FS = /* glsl */`
${NOISE}
uniform vec3 uSun, uW0, uW1, uW2, uW3, uTint;
uniform float uGlow;
varying vec3 vN;
varying vec2 vAlong;
void main() {
  vec3 n = normalize(vN);
  // long strokes along the wood ragged its tones' edges
  float st = noise2(vec2(vAlong.x * 5.0 + vAlong.y * 9.0, atan(n.z, n.x) * 2.2 + vAlong.x * 7.0));
  float l = dot(n, uSun) + (st - 0.5) * 0.5;
  vec3 c = l > 0.62 ? uW3 : (l > 0.22 ? uW2 : (l > -0.25 ? uW1 : uW0));
  gl_FragColor = vec4(mix(c, uTint, uGlow * 0.35 * smoothstep(-0.2, 0.6, n.y + 0.3)), 1.0);
}`;

// --------------------------------------------------------------------------
// leaves torn off and flung, and the bright petals that drift down after (instanced)
// --------------------------------------------------------------------------
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
uniform float uLit;          // 1: a leaf, lit by the sun; 0: a petal of light
varying vec2 vU;
varying vec3 vC;
varying vec3 vN;
void main() {
  float x = vU.x * 2.0 - 1.0, y = vU.y;
  float hw = pow(max(sin(3.1416 * y), 0.0), 0.75) * 0.95;
  if (abs(x) > hw) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float rib = (1.0 - smoothstep(0.03, 0.07, abs(x))) * step(0.08, y) * step(y, 0.92);
  if (uLit > 0.5) {
    vec3 c = dot(n, uSun) > 0.2 ? vC * 1.25 : vC;
    gl_FragColor = vec4(mix(c, vC * 1.5, rib * 0.6), 1.0);
  } else {
    float s = 0.75 + 0.25 * (1.0 - abs(x) / max(hw, 0.001));
    gl_FragColor = vec4(mix(vC, vec3(1.0), rib * 0.6 + 0.25 * (1.0 - abs(x) / max(hw, 0.001))) * s, s * 0.92);
  }
}`;

export function createSkybeamFx({ heightAt = null, lift = 0.3, seed = 1, look = SKYBEAM_LOOK } = {}) {
  const rng = mulberry32(seed * 523 + 11);
  const B = BOSS_MOVES.skybeam, R = B.radius;
  const object = new THREE.Group(); object.name = 'skybeam_fx';
  const solid = new THREE.Group(); solid.name = 'skybeam_fx_solid';
  object.visible = solid.visible = false;
  const sun = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  const T = { value: 0 };                                      // its own clock
  const origin = new THREE.Vector3();                          // the plant's foot (world)
  const groundAt = (x, z) => (heightAt ? heightAt(x, z) : origin.y);      // (world)
  // what lies on the plant's foot goes with it: circles, ribbons, the broken earth, the roots
  const at = new THREE.Group(), atSolid = new THREE.Group();
  object.add(at); solid.add(atSolid);

  // ---- the circles of runes: on the ground, and three in the sky
  const picGround = runeCirclePicture('ground', { size: 1024, seed }), picSky = runeCirclePicture('sky', { size: 1024, seed }), picHalo = runeCirclePicture('halo', { size: 768, seed });
  const circle = createRuneCircle({ picture: picGround, look: RUNE_LOOKS.ground, radius: R, split: RUNE_SPLITS.ground });
  circle.renderOrder = 2; circle.position.y = lift;
  const skyMain = createRuneCircle({ picture: picSky, look: RUNE_LOOKS.sky, radius: SKYBEAM.main.r, split: RUNE_SPLITS.sky, cover: 0.6 });
  const skyHalo = createRuneCircle({ picture: picHalo, look: RUNE_LOOKS.halo, radius: SKYBEAM.halo.r, split: RUNE_SPLITS.halo, cover: 0.5 });
  const skyLow = createRuneCircle({ picture: picGround, look: RUNE_LOOKS.sky, radius: SKYBEAM.low.r, split: RUNE_SPLITS.ground, cover: 0.6 });
  skyHalo.position.y = SKYBEAM.halo.y; skyMain.position.y = SKYBEAM.main.y; skyLow.position.y = SKYBEAM.low.y;
  skyHalo.renderOrder = 3; skyMain.renderOrder = 3.1; skyLow.renderOrder = 3.2;
  at.add(circle, skyHalo, skyMain, skyLow);

  // ---- the light it throws on the ground, and the ring that runs out through the air as it lands
  const lightMat = new THREE.ShaderMaterial({ vertexShader: FLAT_VS, fragmentShader: LIGHT_FS, ...additive(), uniforms: { uC: { value: col(look.light) }, uHot: { value: col(look.lightHot) }, uA: { value: 0 } } });
  const light = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), lightMat);
  light.renderOrder = 1; light.frustumCulled = false; light.visible = false; light.position.y = lift + 0.02;
  const ringGeo = new THREE.RingGeometry(0.93, 1, 96, 1).rotateX(-Math.PI / 2);
  const airRings = [0, 1].map(i => {
    const m = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({ vertexShader: FLAT_VS, fragmentShader: AIRRING_FS, ...additive({ side: THREE.DoubleSide }), uniforms: { uC: { value: col(i ? look.light : look.lightHot) }, uA: { value: 0 } } }));
    m.renderOrder = 5; m.frustumCulled = false; m.visible = false;
    return m;
  });
  at.add(light, ...airRings);

  // ---- ribbons: built once. The green wind (four, round the plant); the light winding up (two, a double helix);
  // the drifting air after (three wide arcs)
  function ribbonGeometry(list) {
    const p = [], w = [], idx = [];
    for (const { N, at: curve, width, phase, quick } of list) {
      const b0 = p.length / 3;
      for (let i = 0; i <= N; i++) {
        const u = i / N, [x, y, z] = curve(u), h = width(u);
        p.push(x, y - h, z, x, y + h, z); w.push(u, -1, phase, quick, u, 1, phase, quick);
        if (i < N) { const b = b0 + i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 4));
    g.setIndex(idx);
    return g;
  }
  const ribbonMat = (c, deep, hot, run, cover) => new THREE.ShaderMaterial({ vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, ...over({ side: THREE.DoubleSide }),
    uniforms: { uC: { value: col(c) }, uDeep: { value: col(deep) }, uHot: { value: col(hot) }, uA: { value: 0 }, uT: T, uGrow: { value: 1 }, uRun: { value: run }, uCover: { value: cover } } });
  const windList = [];
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * Math.PI * 2 + rng(), turns = 1.15 + rng() * 0.3, r0 = 3.3 + k * 0.45 + rng() * 0.4, y0 = 0.9 + k * 0.95, climb = 1.1 + rng() * 0.8, tilt = (rng() - 0.5) * 0.5, wd = 0.2 + rng() * 0.14;
    windList.push({ N: 96, phase: rng(), quick: 1.3 + rng() * 0.6, width: u => wd * (0.35 + 0.65 * Math.sin(u * Math.PI)),
      at: u => { const a = a0 + u * turns * Math.PI * 2, r = r0 + 0.9 * Math.sin(u * Math.PI); return [Math.sin(a) * r, y0 + climb * u + Math.sin(a) * r * tilt * 0.35, Math.cos(a) * r]; } });
  }
  const wind = new THREE.Mesh(ribbonGeometry(windList), ribbonMat(look.wind, look.windDeep, look.windHot, 1.6, 0.7));
  const helixList = [0, 1].map(k => ({ N: 150, phase: k * 0.5, quick: 1.7, width: u => 0.28 + 0.3 * Math.sin(u * Math.PI),
    at: u => { const a = k * Math.PI + u * 2.3 * Math.PI * 2, r = 5.0 - 6.4 * u * (1 - u) + 1.2 * u * u; return [Math.sin(a) * r, 0.9 + (SKYBEAM.main.y - 1.2) * u, Math.cos(a) * r]; } }));
  const helix = new THREE.Mesh(ribbonGeometry(helixList), ribbonMat(look.wind, look.windDeep, look.windHot, 3.2, 0.35));
  const breezeList = [];
  for (let k = 0; k < 5; k++) {
    const a0 = rng() * Math.PI * 2, r0 = 8 + k * 3 + rng() * 2, y0 = 4 + k * 2.6 + rng() * 2, tilt = (rng() - 0.5) * 0.7;
    breezeList.push({ N: 80, phase: rng(), quick: 0.5 + rng() * 0.2, width: u => (0.14 + 0.07 * k) * Math.sin(u * Math.PI),
      at: u => { const a = a0 + u * Math.PI * (0.55 + 0.12 * k), r = r0 + 5 * u; return [Math.sin(a) * r, y0 + Math.sin(a * 1.7) * r * tilt * 0.35 + 3.5 * u * u, Math.cos(a) * r]; } });
  }
  const breeze = new THREE.Mesh(ribbonGeometry(breezeList), ribbonMat(look.breeze, look.breezeDeep, '#ffffff', 1.0, 0.1));
  for (const m of [wind, helix, breeze]) { m.frustumCulled = false; m.renderOrder = 5; m.visible = false; }
  at.add(wind, helix, breeze);

  // ---- the earth under it: a disc on the ground (its cracks, then all of it broken), and the plates it heaves up in
  const earth = brokenEarth();
  const SPAN = 1.14;
  const earthMat = new THREE.ShaderMaterial({ vertexShader: EARTH_VS, fragmentShader: EARTH_FS, ...over({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    uniforms: { ...earthUniforms(earth), uR: { value: R }, uCrack: { value: 0 }, uBroken: { value: 0 }, uHeat: { value: 0 }, uFade: { value: 1 }, uSeam: { value: col(look.seam) }, uHot: { value: col(look.crackHot) } } });
  const earthGeo = new THREE.BufferGeometry();
  const ER = 12, ES = 56;
  {
    const idx = [];
    for (let i = 0; i < ER; i++) for (let j = 0; j < ES; j++) { const a = i * ES + j, b = i * ES + (j + 1) % ES, c = a + ES, d = b + ES; idx.push(a, c, b, b, c, d); }
    earthGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ER + 1) * ES * 3), 3));
    earthGeo.setIndex(idx);
  }
  const earthDisc = new THREE.Mesh(earthGeo, earthMat);
  earthDisc.frustumCulled = false; earthDisc.renderOrder = 1; earthDisc.visible = false;
  const plateMat = new THREE.ShaderMaterial({ vertexShader: PLATE_VS, fragmentShader: PLATE_FS,
    uniforms: { ...earthUniforms(earth), uT: { value: -1 }, uSettle: { value: 0 }, uSink: { value: 0 }, uDown: { value: 0.7 }, uSun: { value: sun }, uSide: { value: col(look.plateSide) },
      uSeamHot: { value: col(look.seamHot) }, uTint: { value: col(look.lightHot) }, uGlow: { value: 0 }, uHeat: { value: 0 } } });
  const plates = new THREE.Mesh(new THREE.BufferGeometry(), plateMat);
  plates.frustumCulled = false; plates.visible = false;
  atSolid.add(earthDisc, plates);
  let laidAt = null, platesLaid = false;
  // the disc, on the ground where the plant stands now
  function layEarth() {
    const p = earthGeo.attributes.position.array;
    for (let i = 0; i <= ER; i++) for (let j = 0; j < ES; j++) {
      const r = (i / ER) * R * SPAN, a = (j / ES) * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r, k = (i * ES + j) * 3;
      p[k] = x; p[k + 2] = z; p[k + 1] = groundAt(origin.x + x, origin.z + z) - origin.y + lift - 0.04;
    }
    earthGeo.attributes.position.needsUpdate = true;
  }
  // the plates: those of the earth's own whose middles lie in the circle, clear of the plant's foot
  function layPlates() {
    const r2 = mulberry32(seed * 61 + 7);
    const pos = [], nor = [], pl = [], kind = [], ea = [], idx = [];
    const add = (x, y, z, nx, ny, nz, cx, cz, when, dice, dice2, side, py, down, ex, ez) => { pos.push(x, y, z); nor.push(nx, ny, nz); pl.push(cx, cz, when, dice); kind.push(dice2, side, py, down); ea.push(ex, ez); return pos.length / 3 - 1; };
    for (const cell of earth.platesAround(origin.x, origin.z, 2.9, 0.9 * R)) {
      const cx = cell.cx - origin.x, cz = cell.cz - origin.z, rc = Math.hypot(cx, cz) / R, gap = 0.035;
      const pts = cell.pts.map(([x, z]) => { const lx = x - origin.x, lz = z - origin.z, dx = lx - cx, dz = lz - cz, d = Math.hypot(dx, dz) || 1, k = Math.max(0, d - gap) / d; return [cx + dx * k, cz + dz * k, x, z]; });
      const gy = groundAt(origin.x + cx, origin.z + cz) - origin.y + lift;
      const th = 0.1 + r2() * 0.14, top = gy + th, foot = gy - 0.5;
      const when = 0.02 + rc * 0.16 + r2() * 0.05, dice = r2(), dice2 = r2();
      const t0 = pos.length / 3;
      add(cx, top, cz, 0, 1, 0, cx, cz, when, dice, dice2, 0, gy, 0, cell.cx, cell.cz);
      pts.forEach(([x, z, ex, ez]) => add(x, top, z, 0, 1, 0, cx, cz, when, dice, dice2, 0, gy, 0, ex, ez));
      for (let k = 0; k < pts.length; k++) idx.push(t0, t0 + 1 + (k + 1) % pts.length, t0 + 1 + k);
      for (let k = 0; k < pts.length; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length];
        let nx = bz - az, nz = -(bx - ax);
        const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        if (nx * (ax - cx) + nz * (az - cz) < 0) { nx = -nx; nz = -nz; }
        const a = add(ax, top, az, nx, 0, nz, cx, cz, when, dice, dice2, 1, gy, 0, 0, 0), b = add(bx, top, bz, nx, 0, nz, cx, cz, when, dice, dice2, 1, gy, 0, 0, 0);
        const c = add(ax, foot, az, nx, 0, nz, cx, cz, when, dice, dice2, 1, gy, 1, 0, 0), d = add(bx, foot, bz, nx, 0, nz, cx, cz, when, dice, dice2, 1, gy, 1, 0, 0);
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aPlate', new THREE.Float32BufferAttribute(pl, 4));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 4));
    g.setAttribute('aEarth', new THREE.Float32BufferAttribute(ea, 2));
    g.setIndex(idx);
    plates.geometry.dispose(); plates.geometry = g;
    platesLaid = idx.length > 0;
  }
  // (the earth's plates come with its picture: lay them once they are here)
  earth.ready.then(() => { if (laidAt) layPlates(); });
  function layGround() {
    if (laidAt && laidAt.distanceToSquared(origin) < 1e-4) return;
    laidAt = (laidAt || new THREE.Vector3()).copy(origin);
    layEarth(); layPlates();
    rootSpots.forEach(s => { s.y = groundAt(origin.x + s.x, origin.z + s.z) - origin.y; });
  }

  // ---- the roots: five, round its sides and its back (not before its faces), each a twisted tube hooked in over the circle
  const ROOTS = 5, rootSpots = [];
  let roots = null;
  const rootMat = new THREE.ShaderMaterial({ vertexShader: ROOT_VS, fragmentShader: ROOT_FS,
    uniforms: { uT: { value: -1 }, uSink: { value: 0 }, uSun: { value: sun }, uGlow: { value: 0 }, uTint: { value: col(look.lightHot) },
      uW0: { value: col(look.wood[0]) }, uW1: { value: col(look.wood[1]) }, uW2: { value: col(look.wood[2]) }, uW3: { value: col(look.wood[3]) } } });
  {
    const pos = [], nor = [], ro = [], al = [], idx = [];
    const SIDES = 8;
    const P = new THREE.Vector3(), Tn = new THREE.Vector3(), Nn = new THREE.Vector3(), Bn = new THREE.Vector3(), Up = new THREE.Vector3(0, 1, 0), q = new THREE.Vector3();
    // a tube along a curve: fat at its foot, a point at its end, ridged and twisted
    function tube(curve, r0, r1, rings, spot, dice) {
      const b0 = pos.length / 3;
      for (let i = 0; i <= rings; i++) {
        const u = i / rings;
        curve.getPoint(u, P); curve.getTangent(u, Tn);
        Nn.crossVectors(Tn, Up); if (Nn.lengthSq() < 1e-4) Nn.set(1, 0, 0); Nn.normalize(); Bn.crossVectors(Tn, Nn).normalize();
        const r = lerp(r0, r1, Math.pow(u, 0.8)) * (1 + 0.12 * Math.sin(u * 17 + dice * 9));
        for (let j = 0; j < SIDES; j++) {
          const a = (j / SIDES) * Math.PI * 2 + u * 4.2, ridge = 1 + 0.2 * Math.sin(a * 3 - u * 4.2 * 3);      // (ridges that wind round it)
          q.copy(Nn).multiplyScalar(Math.cos(a)).addScaledVector(Bn, Math.sin(a));
          pos.push(P.x + q.x * r * ridge, P.y + q.y * r * ridge, P.z + q.z * r * ridge); nor.push(q.x, q.y, q.z);
          ro.push(spot.x, spot.z, spot.delay, spot.height); al.push(u, dice);
          if (i < rings) { const a0 = b0 + i * SIDES + j, a1 = b0 + i * SIDES + (j + 1) % SIDES; idx.push(a0, a1, a0 + SIDES, a1, a1 + SIDES, a0 + SIDES); }
        }
      }
    }
    const AZ = [0.86, -0.86, 2.15, -2.15, Math.PI];                  // radians from its front (+z) toward +x
    for (let k = 0; k < ROOTS; k++) {
      const a = AZ[k] + (rng() - 0.5) * 0.3, far = (k < 2 ? 4.7 : 4.2) + rng() * 0.6, x = Math.sin(a) * far, z = Math.cos(a) * far;
      const height = (k < 2 ? 4.0 : 3.0) + rng() * 0.7, spot = { x, z, y: 0, delay: [0.08, 0.32, 0.6, 0.95, 0.75][k], height };
      rootSpots.push(spot);
      const out = new THREE.Vector3(x, 0, z).normalize(), sideways = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar((rng() - 0.5) * 1.2);
      const v = (o, s, y) => new THREE.Vector3(x, 0, z).addScaledVector(out, o).addScaledVector(sideways, s).setY(y);
      const main = new THREE.CubicBezierCurve3(v(0, 0, -0.9), v(0.7, 0.2, height * 0.45), v(0.45, 0.7, height * 0.95), v(-1.3, 1.0, height * 0.98));
      tube(main, (k < 2 ? 0.46 : 0.36) + rng() * 0.08, 0.035, 20, spot, rng());
      // a fork off it, half way up, turned the other way
      const from = main.getPoint(0.45), tan = main.getTangent(0.45);
      const f1 = from.clone().addScaledVector(tan, 0.5).addScaledVector(out, 0.5).addScaledVector(sideways, -0.7), f2 = f1.clone().addScaledVector(out, -0.3).addScaledVector(sideways, -0.5).setY(f1.y + 0.9);
      tube(new THREE.QuadraticBezierCurve3(from, f1, f2), 0.16, 0.025, 9, spot, rng());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aRoot', new THREE.Float32BufferAttribute(ro, 4));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(al, 2));
    g.setIndex(idx);
    roots = new THREE.Mesh(g, rootMat);
    roots.frustumCulled = false; roots.visible = false;
    atSolid.add(roots);
  }

  // ---- stones (instanced), dust (puffs), torn leaves and bright petals (instanced)
  const ROCKS = 140;
  const rockGeo = new THREE.IcosahedronGeometry(1, 0); rockGeo.computeVertexNormals();
  const rockMat = new THREE.ShaderMaterial({ vertexShader: ROCK_VS, fragmentShader: ROCK_FS, uniforms: { uSun: { value: sun } } });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < ROCKS; i++) rockMesh.setColorAt(i, col(look.rock[i % look.rock.length]));
  rockMesh.count = 0; rockMesh.frustumCulled = false;
  const rocks = [];
  function stone(x, y, z, vx, vy, vz, size) {
    if (rocks.length >= ROCKS) rocks.shift();
    rocks.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), size, age: 0, life: 1.7 + Math.random() * 1.0, bounced: false, lying: false,
      rot: new THREE.Vector3(rnd(0, 6), rnd(0, 6), rnd(0, 6)), spin: new THREE.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)), squash: new THREE.Vector3(rnd(0.8, 1.3), rnd(0.5, 1.0), rnd(0.8, 1.3)) });
  }
  const dustC = look.dust.map(col);
  const puffMat = new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: PUFF_FS, uniforms: {
    uD0: { value: dustC[0] }, uD1: { value: dustC[1] }, uD2: { value: dustC[2] }, uK0: { value: dustC[0] }, uK1: { value: dustC[1] }, uK2: { value: dustC[2] },
    uF0: { value: dustC[0] }, uF1: { value: dustC[1] }, uF2: { value: dustC[2] }, uAlpha: { value: 1 } } });
  const puffs = makePool(110, { aPos: 3, aSize: 2, aInfo: 4 }, puffMat);
  function puff(x, y, z, vx, vy, vz, size, grow, life) {
    if (puffs.list.length >= puffs.max) puffs.list.shift();
    puffs.list.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), size, grow, life, age: 0, dice: Math.random(), turn: rnd(-0.6, 0.6), spin: rnd(-0.75, 0.75) });
  }
  const LEAVES = 60, PETALS = 110;
  const leafGeo = new THREE.PlaneGeometry(0.34, 0.56);
  const leafMesh = new THREE.InstancedMesh(leafGeo, new THREE.ShaderMaterial({ vertexShader: LEAF_VS, fragmentShader: LEAF_FS, side: THREE.DoubleSide, uniforms: { uSun: { value: sun }, uLit: { value: 1 } } }), LEAVES);
  const petalMesh = new THREE.InstancedMesh(leafGeo, new THREE.ShaderMaterial({ vertexShader: LEAF_VS, fragmentShader: LEAF_FS, ...over({ side: THREE.DoubleSide }), uniforms: { uSun: { value: sun }, uLit: { value: 0 } } }), PETALS);
  for (const [m, n, cols] of [[leafMesh, LEAVES, look.leaf], [petalMesh, PETALS, look.petal]]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) m.setColorAt(i, col(cols[i % cols.length]));
    m.count = 0; m.frustumCulled = false;
  }
  petalMesh.renderOrder = 9;
  const leaves = [], petals = [];
  // a leaf on the wind: it is carried round the plant, up or down, tumbling
  function leaf(list, max, x, y, z, vx, vy, vz, life, size, swirl, fall) {
    if (list.length >= max) list.shift();
    list.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), life, age: 0, size, swirl, fall, ph: rnd(0, 6.28),
      rot: new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6)), spin: new THREE.Vector3(rnd(-5, 5), rnd(-5, 5), rnd(-5, 5)) });
  }
  solid.add(rockMesh, puffs.mesh, leafMesh);

  // ---- sparks (streaks along the way they fly) and glows (round, twinkles, streaks, flames)
  const sparks = makePool(900, { aPos: 3, aVel: 3, aInfo: 4 }, new THREE.ShaderMaterial({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, ...additive() }));
  sparks.mesh.renderOrder = 9;
  const cSpark = col(look.spark), cEmber = col(look.ember), cMote = col(look.mote);
  // kind 0: a mote (it rises, drifting); 1: an ember (it falls); 2: drawn in to a point (to: where)
  function spark(x, y, z, vx, vy, vz, size, life, c = cMote, kind = 0, to = null) {
    if (sparks.list.length >= sparks.max) sparks.list.shift();
    sparks.list.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), size, life, age: 0, c, kind, to, ph: rnd(0, 6.28) });
  }
  const flameC = look.flame.map(col);
  const glows = makePool(700, { aPos: 3, aSize: 3, aCol: 4 }, new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, ...additive({ depthTest: true }),
    uniforms: { uT: T, uF0: { value: flameC[0] }, uF1: { value: flameC[1] }, uF2: { value: flameC[2] } } }));
  glows.mesh.renderOrder = 10;
  const now = [];              // glows laid this frame only: [x, y, z, w, h, turned, r, g, b, kind]
  const glow = (p, w, h, c, bright, kind = 0, turned = 0) => { if (bright > 0.004) now.push([p.x, p.y, p.z, w, h, turned, c.r * bright, c.g * bright, c.b * bright, kind]); };
  // a twinkle that lives a while: it drifts, falls a little, and winks
  function twinkle(x, y, z, vx, vy, vz, size, life, c) {
    if (glows.list.length >= 420) glows.list.shift();
    glows.list.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), size, life, age: 0, c, ph: rnd(0, 6.28), turned: rnd(0, 1.5) });
  }
  object.add(sparks.mesh, glows.mesh, petalMesh);
  const cGlint = col(look.glint), cCharge = col(look.charge), cFlare = col(look.flare), cGold = col(look.light), cHot = col(look.lightHot), cPetal = look.petal.map(col);

  // ---- the three beams and the threads round the column: strips laid every frame
  const SEGS = 30, BEAMS = 3, THREADS = 3, STRIPS = BEAMS + THREADS;
  const sPos = new Float32Array(STRIPS * (SEGS + 1) * 2 * 3), sInfo = new Float32Array(STRIPS * (SEGS + 1) * 2 * 3), sIdx = [];
  for (let s = 0; s < STRIPS; s++) for (let i = 0; i < SEGS; i++) { const b = (s * (SEGS + 1) + i) * 2; sIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  const stripGeo = new THREE.BufferGeometry();
  stripGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  stripGeo.setAttribute('aS', new THREE.BufferAttribute(sInfo, 3).setUsage(THREE.DynamicDrawUsage));
  stripGeo.setIndex(sIdx);
  const strips = new THREE.Mesh(stripGeo, new THREE.ShaderMaterial({ vertexShader: STRIP_VS, fragmentShader: STRIP_FS, ...additive({ side: THREE.DoubleSide }),
    uniforms: { uC: { value: col(look.beam) }, uEdge: { value: col(look.beamEdge) }, uHot: { value: col(look.beamHot) }, uT: T } }));
  strips.frustumCulled = false; strips.renderOrder = 7; strips.visible = false;
  const sp = new THREE.Vector3(), sn = new THREE.Vector3(), sd = new THREE.Vector3(), sside = new THREE.Vector3();
  // lay strip s along curve(u, out), width(u) wide, each point showing as show(u) says
  function layStrip(s, camera, curve, width, show) {
    const b0 = s * (SEGS + 1) * 2;
    for (let i = 0; i <= SEGS; i++) {
      const u = i / SEGS;
      curve(u, sp); curve(Math.min(1, u + 0.02), sn);
      sd.subVectors(sn, sp); if (sd.lengthSq() < 1e-8) { curve(Math.max(0, u - 0.02), sn); sd.subVectors(sp, sn); }
      sside.crossVectors(sd, sn.subVectors(camera.position, sp)).normalize();
      const w = width(u), k = show(u), a = (b0 + i * 2) * 3;
      sPos[a] = sp.x - sside.x * w; sPos[a + 1] = sp.y - sside.y * w; sPos[a + 2] = sp.z - sside.z * w;
      sPos[a + 3] = sp.x + sside.x * w; sPos[a + 4] = sp.y + sside.y * w; sPos[a + 5] = sp.z + sside.z * w;
      sInfo[a] = u; sInfo[a + 1] = -1; sInfo[a + 2] = k; sInfo[a + 3] = u; sInfo[a + 4] = 1; sInfo[a + 5] = k;
    }
  }
  const hideStrip = s => { const b0 = s * (SEGS + 1) * 2 * 3; for (let i = 0; i < (SEGS + 1) * 2; i++) sInfo[b0 + i * 3 + 2] = 0; };

  // ---- the column of light, and the spikes of its burst
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
  const pillarC = look.pillar.map(col);
  const pillarMat = new THREE.ShaderMaterial({ vertexShader: PILLAR_VS, fragmentShader: PILLAR_FS, ...over({ side: THREE.DoubleSide }),
    uniforms: { uBase: { value: new THREE.Vector3() }, uH: { value: STORM_SKY.height + 14 }, uW: { value: 9 }, uA: { value: 0 }, uT: T, uDrop: { value: 0 }, uThin: { value: 1 },
      uHeart: { value: pillarC[0] }, uBody: { value: pillarC[1] }, uEdge: { value: pillarC[2] } } });
  const pillar = new THREE.Mesh(quad, pillarMat);
  pillar.frustumCulled = false; pillar.renderOrder = 6; pillar.visible = false;
  const SPIKES = 44;
  const spikeC = look.spike.map(col);
  const spikeMat = new THREE.ShaderMaterial({ vertexShader: SPIKE_VS, fragmentShader: SPIKE_FS, ...over({ side: THREE.DoubleSide }),
    uniforms: { uT: { value: -1 }, uBase: { value: new THREE.Vector3() }, uA: { value: 1 }, uS0: { value: spikeC[0] }, uS1: { value: spikeC[1] }, uS2: { value: spikeC[2] } } });
  const spikeGeo = new THREE.BufferGeometry();
  {
    const sk = [], sa = [];
    for (let i = 0; i < SPIKES; i++) {
      // most of them low over the ground, all round; a few steep. A second, smaller burst a moment after the first
      const second = i >= 28, a = rng() * Math.PI * 2, el = (i % 5 === 0 ? 0.75 + rng() * 0.5 : 0.08 + rng() * 0.5);
      const d = [Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)], len = (second ? 3.2 : 5.5) + rng() * (second ? 3 : 5), wide = (0.3 + rng() * 0.38) * (second ? 0.7 : 1), when = (second ? 0.3 : 0) + rng() * 0.07;
      for (const [x, y] of [[-1, 0], [1, 0], [0, 1]]) { sk.push(d[0], d[1], d[2], len); sa.push(x, y, when, wide); }
    }
    spikeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPIKES * 9), 3));
    spikeGeo.setAttribute('aSpike', new THREE.Float32BufferAttribute(sk, 4));
    spikeGeo.setAttribute('aAt', new THREE.Float32BufferAttribute(sa, 4));
  }
  const spikes = new THREE.Mesh(spikeGeo, spikeMat);
  spikes.frustumCulled = false; spikes.renderOrder = 8; spikes.visible = false;
  object.add(pillar, strips, spikes);

  // ---- where its heads are now: each one's middle, the way it faces, its mouth, its two eyes (world)
  const foot = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
  const V = () => [0, 1, 2].map(() => new THREE.Vector3());
  const headAt = V(), faceDir = V(), faceRight = V(), faceUp = V(), mouthAt = V(), eyes = [V(), V()], headR = [1, 1, 1];
  function findHeads(boss) {
    const { heads, mesh } = boss.userData;
    mesh.updateWorldMatrix(true, false);
    boss.getWorldPosition(foot);
    heads.forEach((h, i) => {
      const az = h.faces + h.yaw, tip = h.tipped + h.nod, r = h.radius * (h.scale || 1);
      const f = faceDir[i].set(Math.sin(az) * Math.cos(tip), -Math.sin(tip), Math.cos(az) * Math.cos(tip));
      const rt = faceRight[i].set(Math.cos(az), 0, -Math.sin(az)), up = faceUp[i].crossVectors(f, rt);
      tmp.copy(h.centre).add(h.lean);
      mesh.localToWorld(headAt[i].copy(tmp));
      mesh.localToWorld(mouthAt[i].copy(tmp).addScaledVector(f, r * 0.95));
      for (const s of [0, 1]) mesh.localToWorld(eyes[s][i].copy(tmp).addScaledVector(rt, (s ? 0.385 : -0.385) * r * 0.9).addScaledVector(up, 0.149 * r * 0.9).addScaledVector(f, 0.911 * r * 0.9));
      f.transformDirection(mesh.matrixWorld); rt.transformDirection(mesh.matrixWorld); up.transformDirection(mesh.matrixWorld);
      headR[i] = r * mesh.scale.x;
    });
  }

  // ---- the run of it
  const me = { object, solid, shake: 0, flash: 0, busy: false, pictures: [picGround, picSky, picHalo], update, setSun, dispose };
  const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), eul = new THREE.Euler(), W = new THREE.Vector3();
  let last = -1, fired = {}, spins = [0, 0, 0], kept = 99, reached = 99;      // (reached: how far into the move it last was)
  function once(key, t, when, fn) { if (t >= when && !fired[key]) { fired[key] = true; fn(); } }
  function setSun(v) { sun.copy(v).normalize(); }
  const skyAt = (y, out) => out.set(origin.x, origin.y + y, origin.z);

  function update(dt, camera, boss, t) {
    T.value += dt;
    const on = t >= 0;
    if (on && (last < 0 || t < last)) { fired = {}; spins = [0, 0, 0]; }                    // a new one
    last = on ? t : -1;
    if (on) { kept = 0; reached = t; } else kept += dt;
    if (!on && !me.busy) { object.visible = solid.visible = false; me.shake = me.flash = 0; return; }
    object.visible = solid.visible = true;
    if (boss) { findHeads(boss); origin.copy(foot); origin.y = groundAt(foot.x, foot.z); layGround(); }
    at.position.copy(origin); atSolid.position.copy(origin);
    const tt = on ? t : 99, sinceHit = tt - B.hit;
    now.length = 0;

    // how far into each of it
    const opened = sstep(B.warn, B.warn + 0.75, tt);                                                   // the circle on the ground, drawn round
    const power = on ? Math.max(0.2 * sstep(B.warn, B.glint, tt), 0.45 * sstep(B.rouse, B.rouse + 0.4, tt), 0.6 * sstep(B.sky, B.up, tt), sstep(B.up, B.fire + 0.1, tt)) * (tt < B.hit ? 1 : 0) : 0;
    const roused = pulse(tt, B.rouse, B.rouse + 0.35, B.helix + 0.3, B.helix + 1.1);                   // the green wind round it
    const rootsUp = on ? (1 - sstep(B.sky + 0.1, B.sky + 0.85, tt)) : 0;                               // (they go back down as the sky opens)
    const skyOpen = [sstep(B.sky, B.sky + 0.75, tt), sstep(B.sky + 0.3, B.sky + 1.0, tt), sstep(B.sky + 0.55, B.sky + 1.1, tt)];      // the main circle, the halo, the low one
    const wound = seg(tt, B.helix, B.up + 0.1), helixA = pulse(tt, B.helix, B.helix + 0.2, B.fire + 0.05, B.fire + 0.5);
    const charge = pulse(tt, B.up - 0.1, B.fire - 0.02, B.fire, B.fire + 0.12);                        // a glow gathering in each mouth
    const beamHead = seg(tt, B.fire, B.fire + 0.2), beamA = on ? sstep(B.fire - 0.01, B.fire + 0.04, tt) * (1 - sstep(B.hit + 0.02, B.hit + 0.22, tt)) : 0;
    const merge = pulse(tt, B.fire + 0.2, B.hit, B.hit + 0.04, B.hit + 0.3);                           // the light gathering in the circle
    const stand = on ? sstep(-0.01, 0.03, sinceHit) * (1 - sstep(B.fade - B.hit - 0.1, B.fade - B.hit + 0.45, sinceHit)) : 0;       // the column
    const thin = on ? 1 - 0.82 * sstep(B.fade - B.hit - 0.35, B.fade - B.hit + 0.35, sinceHit) : 1;
    const burst = on ? pulse(sinceHit, -0.01, 0.03, 0.12, 0.6) : 0;
    const broke = on ? sstep(0.5, 1.5, sinceHit) : 0;                                                  // the circles in the sky breaking up
    const after = pulse(tt, B.fade, B.calm + 0.3, B.length - 1.3, B.length - 0.3);                     // what is left, drifting
    // the ground closing again: at the move's end; or at once, if the move was stopped short (its ground stays as it had got to)
    const heal = on ? sstep(B.length - 0.95, B.length - 0.1, tt) : (reached > B.length - 0.3 ? 1 : sstep(0, 0.6, kept));
    const tg = on ? tt : reached, sinceHitG = tg - B.hit;

    // ---- the circle on the ground: drawn round, turning, quicker and brighter as the power gathers; burnt away as it lands
    const turnRate = 0.25 + 1.6 * power + 2.2 * merge;
    spins[0] += dt * turnRate; spins[1] -= dt * turnRate * 1.5; spins[2] += dt * turnRate * 2.4;
    const glintK = pulse(tt, B.glint - 0.02, B.glint + 0.05, B.glint + 0.2, B.glint + 0.6);
    circle.userData.set({ open: opened, spin: spins, alpha: on ? sstep(B.warn, B.warn + 0.1, tt) * (1 - sstep(0.02, 0.4, sinceHit)) : 0,
      pulse: 0.35 * glintK + 0.5 * power + 0.25 * Math.sin(tt * 6) * power + 1.2 * merge, broken: sstep(0.0, 0.4, sinceHit), fill: 0.3 * opened + 0.7 * power + merge });
    // the circles in the sky: one after another, turning against each other; they flare as the beams reach them, and break up after
    const skySpin = k => [spins[0] * 1.3 * k, spins[1] * 1.1 * k, spins[2] * k];
    const skyA = on ? 1 - sstep(1.35, 1.6, sinceHit) : 0, flare = Math.min(1.2, merge + burst + 0.4 * stand);
    skyMain.userData.set({ open: skyOpen[0], spin: skySpin(1), alpha: skyA * sstep(B.sky, B.sky + 0.1, tt), pulse: 0.3 * power + flare, broken: broke, fill: 0.2 + 0.45 * flare });
    skyHalo.userData.set({ open: skyOpen[1], spin: skySpin(-0.7), alpha: skyA * sstep(B.sky + 0.3, B.sky + 0.4, tt) * 0.9, pulse: 0.2 * power + 0.7 * flare, broken: broke * 1.05, fill: 0.1 + 0.3 * flare });
    skyLow.userData.set({ open: skyOpen[2], spin: skySpin(-1.6), alpha: skyA * sstep(B.sky + 0.55, B.sky + 0.65, tt), pulse: 0.3 * power + flare, broken: sstep(0.35, 1.2, sinceHit), fill: 0.25 + 0.5 * flare });

    // ---- the light it throws on the ground
    const lit = on ? Math.max(0.16 * opened * (tt < B.hit ? 1 : 0), 0.3 * roused, 0.5 * power, 0.7 * merge, stand * (0.75 + 0.1 * Math.sin(tt * 31)), 1.2 * burst) : 0;
    light.visible = lit > 0.004; lightMat.uniforms.uA.value = Math.min(1, lit) * 0.55; light.scale.setScalar(R * (1.5 + 1.6 * Math.min(1, stand + burst)));

    // ---- a flash across each head's eyes; flames at the corners of their eyes while it is roused
    if (on && glintK > 0.003) for (let i = 0; i < 3; i++) {
      const k = seg(tt, B.glint, B.glint + 0.55), mid = tmp.addVectors(eyes[0][i], eyes[1][i]).multiplyScalar(0.5).addScaledVector(faceDir[i], 0.12);
      glow(mid, headR[i] * (1.6 + 5.2 * (1 - Math.pow(1 - k, 3))), headR[i] * (0.5 - 0.3 * k), cGlint, 1.5 * glintK, 2);
      for (const s of [0, 1]) glow(eyes[s][i], headR[i] * 0.9, headR[i] * 0.9, cGlint, 0.9 * glintK * (1 - k), 0);
    }
    const aflame = on ? pulse(tt, B.rouse - 0.05, B.rouse + 0.25, B.hit + 0.6, B.fade) : 0;
    if (aflame > 0.003) for (let i = 0; i < 3; i++) for (const s of [0, 1]) {
      const big = (i === 0 ? 1.25 : 0.95) * headR[i], side = s ? 1 : -1;
      // from the eye's outer corner, up and out
      const dir = tmp2.copy(faceUp[i]).multiplyScalar(0.8).addScaledVector(faceRight[i], side * 0.75).normalize();
      const cornerAt = tmp.copy(eyes[s][i]).addScaledVector(faceRight[i], side * 0.1 * headR[i]).addScaledVector(faceDir[i], 0.06);
      // (its turn on the screen: which way that is as the camera sees it)
      tmp3.copy(dir).transformDirection(camera.matrixWorldInverse);
      const turned = Math.atan2(-tmp3.x, tmp3.y), len = big * (0.95 + 0.15 * Math.sin(tt * 13 + i * 2 + s));
      glow(cornerAt.addScaledVector(dir, len * 0.42), big * 0.5, len, { r: 1, g: 0.31 * i + 0.17 * s, b: 0 }, aflame, 3, turned);
      glow(eyes[s][i], big * 0.75, big * 0.75, cGlint, 0.45 * aflame, 0);
    }

    // ---- the green wind round it; the light winding up to the sky; the air drifting after
    wind.visible = roused > 0.004; wind.material.uniforms.uA.value = roused * 0.95; wind.rotation.y = -tt * 2.4;
    helix.visible = helixA > 0.004; helix.material.uniforms.uA.value = helixA; helix.material.uniforms.uGrow.value = wound * 1.05; helix.rotation.y = -(tt - B.helix) * 1.1;
    breeze.visible = after > 0.004; breeze.material.uniforms.uA.value = after * 0.5; breeze.rotation.y = -(tt - B.fade) * 0.35;

    // ---- the ground: cracks running out as it rouses itself, glowing hotter; all of it broken as the light lands
    const cracked = sstep(B.rouse, B.rouse + 1.3, tg), brokenK = sstep(0.0, 0.14, sinceHitG);
    earthDisc.visible = tg > B.rouse && heal < 0.999;
    const EU = earthMat.uniforms;
    EU.uCrack.value = cracked * 0.98; EU.uBroken.value = brokenK; EU.uFade.value = 1 - heal;
    EU.uHeat.value = on ? Math.max(0.35 * cracked + 0.65 * power, 0.5 * merge) * (1 - sstep(0.3, 1.6, sinceHit)) + 0.9 * burst : 0;
    plates.visible = platesLaid && sinceHitG > 0 && heal < 0.999;
    const PU = plateMat.uniforms;
    PU.uT.value = sinceHitG; PU.uSettle.value = sstep(0.5, 1.6, sinceHitG); PU.uSink.value = heal; PU.uHeat.value = 1 - sstep(0.2, 1.8, sinceHitG); PU.uGlow.value = Math.min(1, stand + burst);
    // the roots: up one after another, writhing; back down as the sky opens
    roots.visible = on && tt > B.rouse && rootsUp > 0.002;
    rootMat.uniforms.uT.value = tt - B.rouse; rootMat.uniforms.uSink.value = 1 - rootsUp; rootMat.uniforms.uGlow.value = power;
    if (on) rootSpots.forEach((s, k) => once('root' + k, tt, B.rouse + s.delay, () => {
      // as each breaks out: stones thrown up, dust
      const x = origin.x + s.x, z = origin.z + s.z, y = origin.y + s.y;
      for (let i = 0; i < 9; i++) { const a = rnd(0, 6.28), sp2 = rnd(0.8, 3); stone(x + Math.cos(a) * 0.3, y + 0.1, z + Math.sin(a) * 0.3, Math.cos(a) * sp2, rnd(3, 7.5), Math.sin(a) * sp2, rnd(0.07, 0.2)); }
      for (let i = 0; i < 5; i++) { const a = rnd(0, 6.28); puff(x + Math.cos(a) * 0.4, y + 0.3, z + Math.sin(a) * 0.4, Math.cos(a) * 1.6, rnd(0.6, 1.6), Math.sin(a) * 1.6, rnd(0.8, 1.3), 1.9, rnd(0.7, 1.1)); }
    }));

    // ---- motes rising off the circle while the power gathers; thin lights going up; leaves torn off by the wind
    if (on && tt > B.warn + 0.3 && tt < B.hit) {
      const n = Math.floor(dt * (14 + 60 * power) + Math.random());
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.28), r = R * Math.sqrt(Math.random()) * 0.98, x = origin.x + Math.sin(a) * r, z = origin.z + Math.cos(a) * r;
        if (Math.random() < 0.22) spark(x, groundAt(x, z) + lift, z, 0, rnd(9, 16), 0, rnd(0.03, 0.05), rnd(0.35, 0.6), cHot, 0);           // (a thin light going straight up)
        else spark(x, groundAt(x, z) + lift, z, rnd(-0.4, 0.4), rnd(1.2, 3.4), rnd(-0.4, 0.4), rnd(0.05, 0.09), rnd(0.7, 1.4), Math.random() < 0.3 ? cSpark : cMote, 0);
      }
    }
    if (on && (roused > 0.2 || helixA > 0.3)) {
      const n = Math.floor(dt * (roused > 0.2 ? 14 : 8) + Math.random());
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.28), r = rnd(2.2, 4.6), y = rnd(0.5, 3.5);
        leaf(leaves, LEAVES, origin.x + Math.sin(a) * r, origin.y + y, origin.z + Math.cos(a) * r, 0, rnd(1.5, 4.5), 0, rnd(1.1, 1.9), rnd(0.8, 1.4), rnd(4.5, 7), helixA > 0.3 ? -2.5 : 0.6);
      }
    }

    // ---- a glow gathering in each mouth, light drawn in to it
    if (charge > 0.003) for (let i = 0; i < 3; i++) {
      const s = headR[i] * (0.5 + 1.5 * charge) * (1 + 0.08 * Math.sin(tt * 37 + i));
      glow(mouthAt[i], s * 1.5, s * 1.5, cCharge, 0.9 * charge, 0);
      glow(mouthAt[i], s * 2.6, s * 2.6, cCharge, 0.55 * charge, 1, tt * 2 + i);
      if (Math.random() < dt * 60) { const d = tmp.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(1.2, 2.2)); spark(mouthAt[i].x + d.x, mouthAt[i].y + d.y, mouthAt[i].z + d.z, 0, 0, 0, rnd(0.04, 0.07), 0.3, cSpark, 2, mouthAt[i]); }
    }

    // ---- the three beams: out of the mouths, up into the middle of the great circle
    const target = skyAt(SKYBEAM.main.y, tmp3);
    strips.visible = beamA > 0.004 || stand > 0.004;
    for (let i = 0; i < BEAMS; i++) {
      if (beamA <= 0.004) { hideStrip(i); continue; }
      const m = mouthAt[i], f = faceDir[i], ph = i * 2.1;
      // from the mouth the way it faces, bending up to the circle; it wavers as lightning does
      const c1 = tmp.copy(m).addScaledVector(f, 5).setY(m.y + 7), c2 = tmp2.copy(target).setY(target.y - 6).lerp(m, 0.18);
      layStrip(i, camera, (u, out) => {
        const a = 1 - u, w = Math.sin(u * Math.PI) * (0.32 + 0.12 * Math.sin(tt * 23 + ph));
        out.set(a * a * a * m.x + 3 * a * a * u * c1.x + 3 * a * u * u * c2.x + u * u * u * target.x, a * a * a * m.y + 3 * a * a * u * c1.y + 3 * a * u * u * c2.y + u * u * u * target.y, a * a * a * m.z + 3 * a * a * u * c1.z + 3 * a * u * u * c2.z + u * u * u * target.z);
        out.x += Math.sin(u * 13 - tt * 17 + ph) * w; out.z += Math.cos(u * 11 - tt * 15 + ph * 1.7) * w;
      }, u => (0.3 + 0.3 * Math.sin(Math.min(1, u * 1.15) * Math.PI)) * (1 + 0.22 * Math.sin(tt * 41 + ph)) * (0.8 + 0.45 * merge),
      u => beamA * (1 - sstep(beamHead * 1.04 - 0.06, beamHead * 1.04, u)));
    }
    // threads of light wound round the column, running down it
    for (let k = 0; k < THREADS; k++) {
      const s = BEAMS + k;
      if (stand <= 0.004) { hideStrip(s); continue; }
      const ph = k * 2.094, top = SKYBEAM.main.y + 2;
      layStrip(s, camera, (u, out) => {
        const a = ph + u * 9 + tt * (5 + k), r = (1.1 + 0.9 * Math.sin(u * 5 + tt * 3 + ph)) * (0.5 + 0.5 * thin);
        out.set(origin.x + Math.sin(a) * r, origin.y + 0.3 + (top - 0.3) * u, origin.z + Math.cos(a) * r);
      }, () => 0.16 + 0.05 * Math.sin(tt * 29 + ph), u => stand * 0.85 * Math.sin(Math.min(1, u * 1.02) * Math.PI) ** 0.4);
    }
    if (strips.visible) { stripGeo.attributes.position.needsUpdate = true; stripGeo.attributes.aS.needsUpdate = true; }

    // ---- the light gathering in the great circle; then it comes down
    if (on && (merge > 0.003 || stand > 0.003 || burst > 0.003)) {
      const k = Math.max(merge * 0.8, 0.55 * stand, 0.85 * burst), s = SKYBEAM.main.r * (0.3 + 0.45 * merge + 0.15 * burst + 0.2 * stand) * (1 + 0.06 * Math.sin(tt * 43));
      glow(target, s, s, cFlare, Math.min(1.2, k), 0);
      glow(target, s * 2.6, s * 2.6, cFlare, 0.7 * k, 1, 0.3 * Math.sin(tt * 3));
      glow(target, s * 3.4, s * 0.3, cFlare, 0.5 * k, 2);
    }
    pillar.visible = stand > 0.004;
    const PM = pillarMat.uniforms;
    PM.uBase.value.set(origin.x, origin.y - 0.2, origin.z);
    PM.uA.value = stand; PM.uDrop.value = seg(sinceHit, -0.01, 0.06); PM.uThin.value = thin * (1 + 0.3 * burst + 0.07 * Math.sin(tt * 27));
    // its burst: spikes of light shot out over the ground, a flash, a streak right across the picture, rings through the air
    spikes.visible = sinceHit > -0.01 && sinceHit < 1.1;
    spikeMat.uniforms.uT.value = sinceHit; spikeMat.uniforms.uBase.value.set(origin.x, origin.y + 0.5, origin.z);
    if (on && sinceHit > -0.01 && sinceHit < 1.0) {
      const k = 1 - seg(sinceHit, 0.02, 0.9), base = tmp.set(origin.x, origin.y + 1.1, origin.z);
      glow(base, 15 * (0.45 + 0.55 * seg(sinceHit, 0, 0.12)), 10 * (0.45 + 0.55 * seg(sinceHit, 0, 0.12)), cHot, 1.1 * k * k, 0);
      glow(base, 46 + 26 * seg(sinceHit, 0, 0.5), 1.7 * k + 0.3, cHot, 1.0 * k * k, 2);
      glow(base, 22, 22, cGold, 0.55 * k * k, 1, 0.4);
    }
    airRings.forEach((m, i) => {
      const u = seg(sinceHit - i * 0.16, 0, 0.9 + 0.3 * i);
      m.visible = on && u > 0 && u < 1;
      m.material.uniforms.uA.value = (1 - u) * (1 - u) * (i ? 0.7 : 1);
      m.scale.setScalar(2.5 + (i ? 22 : 30) * (1 - Math.pow(1 - u, 2.2))); m.position.y = i ? lift + 0.25 : 1.7 + 1.5 * u;
    });
    if (on) once('burst', tt, B.hit, () => {
      // stones flung up out of the circle, dust rolling out of it, embers
      for (let i = 0; i < 54; i++) {
        const a = rnd(0, 6.28), r = rnd(1.8, R * 0.9), x = origin.x + Math.sin(a) * r, z = origin.z + Math.cos(a) * r, big = Math.random() < 0.3, out = rnd(1.5, 7);
        stone(x, groundAt(x, z) + 0.2, z, Math.sin(a) * out, rnd(7, 15) * (big ? 0.85 : 1), Math.cos(a) * out, big ? rnd(0.3, 0.62) : rnd(0.1, 0.26));
      }
      for (let i = 0; i < 26; i++) { const a = (i / 26) * 6.28 + rnd(0, 0.2), r = R * rnd(0.55, 0.95), x = origin.x + Math.sin(a) * r, z = origin.z + Math.cos(a) * r; puff(x, groundAt(x, z) + 0.5, z, Math.sin(a) * rnd(5, 9), rnd(0.4, 1.8), Math.cos(a) * rnd(5, 9), rnd(1.4, 2.4), 2.1, rnd(0.9, 1.5)); }
      for (let i = 0; i < 150; i++) { const a = rnd(0, 6.28), el = rnd(0.1, 1.3), v = rnd(6, 22); spark(origin.x, origin.y + 0.8, origin.z, Math.sin(a) * Math.cos(el) * v, Math.sin(el) * v, Math.cos(a) * Math.cos(el) * v, rnd(0.06, 0.12), rnd(0.6, 1.5), Math.random() < 0.5 ? cEmber : cHot, 1); }
      for (let i = 0; i < 22; i++) { const a = rnd(0, 6.28), r = rnd(1.5, 4); leaf(leaves, LEAVES, origin.x + Math.sin(a) * r, origin.y + rnd(1, 4), origin.z + Math.cos(a) * r, Math.sin(a) * rnd(4, 9), rnd(3, 8), Math.cos(a) * rnd(4, 9), rnd(1.4, 2.2), rnd(0.9, 1.5), 1.5, 3.5); }
    });
    // embers going up in the column while it stands
    if (stand > 0.3) { const n = Math.floor(dt * 70 + Math.random()); for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), r = rnd(0.3, 3.2); spark(origin.x + Math.sin(a) * r, origin.y + rnd(0.2, 2), origin.z + Math.cos(a) * r, Math.sin(a) * rnd(0, 2), rnd(5, 14), Math.cos(a) * rnd(0, 2), rnd(0.05, 0.1), rnd(0.5, 1.2), Math.random() < 0.6 ? cEmber : cHot, 0); } }

    // ---- the circles break up: twinkles shed from them, and bright petals that drift down on the air
    if (on && sinceHit > 0.45 && sinceHit < 1.75) {
      const n = Math.floor(dt * 190 + Math.random());
      for (let i = 0; i < n; i++) {
        const which = Math.random(), C = which < 0.5 ? SKYBEAM.main : (which < 0.8 ? SKYBEAM.halo : SKYBEAM.low);
        const a = rnd(0, 6.28), r = C.r * Math.sqrt(rnd(0.15, 1)), x = origin.x + Math.sin(a) * r, z = origin.z + Math.cos(a) * r, y = origin.y + C.y;
        if (Math.random() < 0.26) leaf(petals, PETALS, x, y, z, Math.sin(a) * rnd(1, 5), rnd(-1, 2), Math.cos(a) * rnd(1, 5), rnd(2.2, 3.4), rnd(0.9, 1.7), rnd(1.5, 3.2), 1.9);
        else twinkle(x, y, z, Math.sin(a) * rnd(0.5, 5), rnd(-2.5, 2), Math.cos(a) * rnd(0.5, 5), rnd(0.25, 0.7), rnd(0.9, 2.4), cPetal[i % 3]);
      }
    }

    // ...and more of them lower, all round where the column stood, as it thins
    if (on && tt > B.fade - 0.4 && tt < B.calm + 0.7) {
      const n = Math.floor(dt * 42 + Math.random());
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.28), r = rnd(1.5, 15), x = origin.x + Math.sin(a) * r, z = origin.z + Math.cos(a) * r, y = origin.y + rnd(2.5, 20);
        if (Math.random() < 0.45) leaf(petals, PETALS, x, y, z, Math.sin(a) * rnd(0, 2), rnd(-0.5, 1.5), Math.cos(a) * rnd(0, 2), rnd(1.8, 2.8), rnd(0.9, 1.6), rnd(1.5, 3.2), 1.3);
        else twinkle(x, y, z, Math.sin(a) * rnd(0, 2), rnd(-1, 1), Math.cos(a) * rnd(0, 2), rnd(0.2, 0.55), rnd(0.9, 2.0), cPetal[i % 3]);
      }
    }

    // ---- stones: thrown, falling, one bounce, lying a moment, gone
    {
      let n = 0;
      for (let i = rocks.length - 1; i >= 0; i--) { const s = rocks[i]; s.age += dt; if (s.age >= s.life) rocks.splice(i, 1); }
      for (const s of rocks) {
        if (!s.lying) {
          s.v.y -= 24 * dt; s.p.addScaledVector(s.v, dt);
          s.rot.addScaledVector(s.spin, dt);
          const gy = groundAt(s.p.x, s.p.z) + s.size * 0.4;
          if (s.p.y < gy && s.v.y < 0) {
            s.p.y = gy;
            if (!s.bounced && s.v.y < -3) { s.v.y *= -0.32; s.v.x *= 0.5; s.v.z *= 0.5; s.spin.multiplyScalar(0.5); s.bounced = true; }
            else { s.lying = true; s.life = Math.min(s.life, s.age + 0.9); }
          }
        }
        const k = Math.min(1, s.age * 12) * (1 - sstep(s.life - 0.35, s.life, s.age));
        qt.setFromEuler(eul.set(s.rot.x, s.rot.y, s.rot.z));
        mtx.compose(s.p, qt, sc.copy(s.squash).multiplyScalar(s.size * k));
        rockMesh.setMatrixAt(n++, mtx);
      }
      rockMesh.count = n; rockMesh.instanceMatrix.needsUpdate = true;
    }
    // ---- dust
    {
      const A = puffs.arrays;
      let n = 0;
      for (let i = puffs.list.length - 1; i >= 0; i--) { const p = puffs.list[i]; p.age += dt; if (p.age >= p.life) puffs.list.splice(i, 1); }
      for (const p of puffs.list) {
        const k = p.age / p.life;
        p.v.multiplyScalar(Math.exp(-2.6 * dt)); p.p.addScaledVector(p.v, dt);
        const s = p.size * (1 + (p.grow - 1) * (1 - Math.pow(1 - k, 2.2))) * Math.min(1, p.age * 9);
        A.aPos.set([p.p.x, p.p.y, p.p.z], n * 3); A.aSize.set([s, s * 0.92], n * 2); A.aInfo.set([0, p.dice, Math.min(0.999, k), p.turn + p.spin * p.age], n * 4);
        n++;
      }
      puffs.g.instanceCount = n;
      for (const name in A) puffs.g.attributes[name].needsUpdate = true;
    }
    // ---- leaves and petals: carried round the plant on the wind, tumbling
    for (const [list, mesh] of [[leaves, leafMesh], [petals, petalMesh]]) {
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) { const p = list[i]; p.age += dt; if (p.age >= p.life) list.splice(i, 1); }
      for (const p of list) {
        const k = p.age / p.life, dx = p.p.x - origin.x, dz = p.p.z - origin.z, far = Math.hypot(dx, dz) || 1;
        // round it (the wind's way), a little out, falling (or rising: fall < 0), fluttering
        const want = tmp.set(-dz / far * p.swirl + dx / far * 0.6, -p.fall + Math.sin(p.age * 4 + p.ph) * 0.8, dx / far * p.swirl + dz / far * 0.6);
        p.v.lerp(want, Math.min(1, dt * 1.6)); p.p.addScaledVector(p.v, dt);
        p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt; p.rot.z += p.spin.z * dt;
        const s = p.size * Math.min(1, p.age * 6) * (1 - sstep(0.7, 1, k));
        mtx.compose(p.p, qt.setFromEuler(p.rot), sc.setScalar(s));
        mesh.setMatrixAt(n++, mtx);
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
    }
    // ---- sparks
    {
      const A = sparks.arrays;
      let n = 0;
      for (let i = sparks.list.length - 1; i >= 0; i--) { const p = sparks.list[i]; p.age += dt; if (p.age >= p.life) sparks.list.splice(i, 1); }
      for (const p of sparks.list) {
        const k = p.age / p.life;
        if (p.kind === 2) { p.v.subVectors(p.to, p.p).multiplyScalar(5 + 12 * k); }
        else {
          p.v.multiplyScalar(Math.exp(-(p.kind === 1 ? 1.6 : 0.8) * dt));
          p.v.y += (p.kind === 1 ? -9 : 0.6) * dt;
          if (p.kind === 0) { p.v.x += Math.sin(p.age * 5 + p.ph) * 1.2 * dt; p.v.z += Math.cos(p.age * 4 + p.ph) * 1.2 * dt; }
        }
        p.p.addScaledVector(p.v, dt);
        const tw = (0.65 + 0.35 * Math.sin(p.age * 30 + p.ph)) * (1 - k * k) * Math.min(1, p.age * 20);
        A.aPos.set([p.p.x, p.p.y, p.p.z], n * 3); A.aVel.set([p.v.x, p.v.y, p.v.z], n * 3); A.aInfo.set([p.c.r * tw, p.c.g * tw, p.c.b * tw, p.size], n * 4);
        n++;
      }
      sparks.g.instanceCount = n;
      for (const name in A) sparks.g.attributes[name].needsUpdate = true;
    }
    // ---- glows: the twinkles that live a while, then those laid this frame
    {
      const A = glows.arrays;
      let n = 0;
      for (let i = glows.list.length - 1; i >= 0; i--) { const p = glows.list[i]; p.age += dt; if (p.age >= p.life) glows.list.splice(i, 1); }
      for (const p of glows.list) {
        const k = p.age / p.life;
        p.v.multiplyScalar(Math.exp(-1.1 * dt)); p.v.y -= 1.4 * dt; p.p.addScaledVector(p.v, dt);
        const wink = (0.55 + 0.45 * Math.sin(p.age * 11 + p.ph)) * Math.min(1, p.age * 10) * (1 - k * k), s = p.size * (0.7 + 0.3 * wink);
        A.aPos.set([p.p.x, p.p.y, p.p.z], n * 3); A.aSize.set([s, s, p.turned], n * 3); A.aCol.set([p.c.r * wink, p.c.g * wink, p.c.b * wink, 1], n * 4);
        n++;
      }
      for (const g of now) {
        if (n >= glows.max) break;
        A.aPos.set([g[0], g[1], g[2]], n * 3); A.aSize.set([g[3], g[4], g[5]], n * 3); A.aCol.set([g[6], g[7], g[8], g[9]], n * 4);
        n++;
      }
      glows.g.instanceCount = n;
      for (const name in A) glows.g.attributes[name].needsUpdate = true;
    }

    // ---- the ground's jolts, and the wash of light as it lands
    const breaks = on ? rootSpots.reduce((a, s) => Math.max(a, pulse(tt - B.rouse - s.delay, -0.02, 0.03, 0.08, 0.35)), 0) : 0;
    me.shake = on ? Math.max(0.1 * roused, 0.4 * breaks, 0.22 * sstep(B.fire, B.fire + 0.1, tt) * (tt < B.hit ? 1 : 0), pulse(sinceHit, -0.02, 0.02, 0.15, 0.9), 0.28 * stand) : 0;
    me.flash = on ? Math.max(0.75 * pulse(sinceHit, -0.02, 0.02, 0.05, 0.3), 0.08 * glintK) : 0;

    // all over: everything gone
    if (!on && kept > 0.7 && !rocks.length && !puffs.list.length && !sparks.list.length && !glows.list.length && !leaves.length && !petals.length) { me.busy = false; object.visible = solid.visible = false; me.shake = me.flash = 0; }
    else me.busy = true;
  }
  function dispose() {
    for (const c of [circle, skyMain, skyHalo, skyLow]) c.userData.dispose();
    for (const t of [picGround, picSky, picHalo]) t.dispose();
    for (const m of [light, ...airRings, wind, helix, breeze, earthDisc, plates, roots, rockMesh, leafMesh, petalMesh, strips, pillar, spikes, puffs.mesh, sparks.mesh, glows.mesh]) { m.geometry.dispose(); m.material.dispose(); }
  }
  return me;
}
