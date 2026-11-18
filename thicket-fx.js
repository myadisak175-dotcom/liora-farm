/* ==========================================================================
   thicket-fx.js  —  everything the plant boss's thicket draws (plant-boss-moves.js: play('thicket')), as in the clip:
   a warm glow on the ground under the shut bud; the warning, a ring of orange light all round it that opens out to the
   blow's edge and fills; the ground cracking from the roots outward, the cracks glowing red-hot, pebbles hopping; then
   thorned vines bursting up all over the ring with dust and flying rock, writhing, a few low thorn spears stabbing out;
   green sparks; then the vines sink, the ground spits green (a splash of green light, green flames, a few green bolts,
   dark smoke) and the bud bursts open; the cracked, scorched ground fades back to grass. One job: draw that. It decides
   nothing: the moves say when (their events), this follows.

     const fx = createThicketFx({ heightAt, seed, lift })   heightAt(x, z): the ground's height (world); null: flat at
                                                            the boss's foot. lift: metres the ground's light is laid over
                                                            the ground (over the grass's tips)
     scene.add(fx.object)
     moves.onEvent = e => fx.event(e)          it starts at the thicket's 'warn' (its shape: where and how wide), and
                                               follows 'cancel' (all of it goes, quickly)
     every frame: fx.update(dt, camera)        (the same dt the moves get, so it keeps time with them, slowed or not)
     fx.shake                                  0..1: how hard the ground jolts now (the camera's to shake, if it likes)
     fx.setSun(vec3)                           world direction toward the sun
     fx.busy                                   true while anything of it is still to be seen

   The times are BOSS_MOVES.thicket's (the warning, the burst of the vines, their sinking, the bud's bursting open); the
   rest of its beats are counted from those here. Sizes are in metres for the blow's radius as it is written (6 m); a
   wider or narrower ring scales everything with it.

   How it is drawn, the kit's way: flat tones, hard edges.
     - the ground (one disc laid over it): the glow, the warning's fill, its bright rim and the line that fills, the
       cracks (a pattern baked once: broken plates, with long cracks running out from the roots), the broken earth the
       vines came up through, the green splash, the scorch. One draw call
     - the vines: thick tapering stems along a curve that rises, leans and hooks over at its end, set with thorns, in
       three bark tones and a dark outline; built on the processor every frame (they grow along their own curve, and
       draw back along it). Two draw calls
     - rock: little flat-shaded stones that fly, fall, bounce once and lie (rubble round each vine's foot stays till it
       sinks). One draw call
     - dust, smoke and green flame: puffs drawn as hard-edged cut-outs, two tones, eaten away as they go. One draw call
     - sparks: green (and, while it cracks, red-hot) streaks that glow. One draw call
     - swirls of orange light round the bud while it gathers; green bolts as it bursts. A few draw calls
   ========================================================================== */
import * as THREE from 'three';
import { BOSS_MOVES } from './plant-boss-moves.js';
import { mulberry32, _internal as natureInternal } from './stylized-nature.js';

const { NOISE } = natureInternal;
const M = BOSS_MOVES.thicket;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sstep = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };
const pulse = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t));
const outBack = x => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);
const col = h => new THREE.Color().setHex(parseInt(h.slice(1), 16), THREE.LinearSRGBColorSpace);      // (as written: the kit's shaders paint in the picture's own tones)

// the look: every colour it is drawn with
export const THICKET_LOOK = {
  warn: '#f2774a', warnHot: '#ffb07c', rim: '#fff4ea', rimGlow: '#ff7e52',         // the warning: its fill, its light toward the rim, its rim
  wall: '#ff6a3c', wallHot: '#ffe2cf', haze: ['#d93d2a', '#ff8a66'],                // ...and the faint red smoke that drifts up off it                                            // the wall of light that stands up round its rim
  plate: ['#c46f48', '#de8d60', '#f2ab80'], plateGrass: ['#8a9e3e', '#a7b84c'], plateSide: '#7e4630', seamHot: '#ff5226',      // the plates the ground breaks into
  crack: '#ff3418', crackHot: '#ffd48c', halo: '#ff5a26',                         // the cracks: their edge, their hot middle, the light round them
  earth: ['#6a5d4f', '#827462', '#9a8b76'], seam: '#3a3027',                      // the broken ground: its plates (deep -> lit), the seams between
  scorch: '#55503d',
  splash: ['#3f8f24', '#8fdc3a', '#d8ff86'],                                      // the green splash on the ground (deep -> hot)
  wood: ['#3a2a1f', '#5c4331', '#83623f', '#a98458'], line: '#21170f',            // the vines: shade, body, light, dry-brush light; their outline
  thorn: ['#3f1a14', '#6f2e22', '#a14b34'],
  rock: ['#585048', '#6c6258', '#7c7165', '#4a433d'],
  dust: ['#8f8574', '#ada28d', '#cbc1aa'], smoke: ['#56604c', '#6f7a62', '#8c977c'],
  flame: ['#4caf2c', '#a8ee48', '#f2ffc2'],
  spark: '#b6ff4a', ember: '#ffae5a', arc: '#ff5a2c', bolt: '#d8ff9a',
};
const L = THICKET_LOOK;

// --------------------------------------------------------------------------
// the crack pattern, baked once (in units of the radius: the disc is -1.15 .. 1.15)
//   r: the seams between broken plates   g: each plate's own number   b: the long cracks out from the roots   a: the glow round both
// --------------------------------------------------------------------------
const SPAN = 1.15;
function bakeCracks(seed, S = 384) {
  const rng = mulberry32(seed * 977 + 13);
  // plates: small near the roots, larger out toward the rim
  const pts = [];
  for (const [r, n] of [[0.36, 9], [0.5, 13], [0.66, 17], [0.82, 21], [0.98, 24], [1.14, 27]]) {
    const a0 = rng() * 6.28;
    for (let i = 0; i < n; i++) { const a = a0 + (i + (rng() - 0.5) * 0.6) / n * Math.PI * 2, rr = r + (rng() - 0.5) * 0.1; pts.push([Math.sin(a) * rr, Math.cos(a) * rr, rng()]); }
  }
  // a little warp, so the seams wander
  const wob = (x, y) => [0.025 * Math.sin(y * 23 + x * 7) + 0.015 * Math.sin(y * 51 - x * 13), 0.025 * Math.sin(x * 21 - y * 5) + 0.015 * Math.sin(x * 47 + y * 17)];
  const data = new Uint8Array(S * S * 4), seam = new Float32Array(S * S), cross = new Float32Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    let x = ((i + 0.5) / S * 2 - 1) * SPAN, y = ((j + 0.5) / S * 2 - 1) * SPAN;
    const [wx, wy] = wob(x, y); x += wx; y += wy;
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (const p of pts) { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < d1) { d2 = d1; d1 = d; id = p[2]; } else if (d < d2) d2 = d; }
    const edge = Math.sqrt(d2) - Math.sqrt(d1), r = Math.hypot(x, y);
    const k = j * S + i;
    seam[k] = r < 0.27 ? 0 : clamp(1 - (edge - 0.007) / 0.011, 0, 1);
    data[k * 4 + 1] = Math.round(id * 255);
  }
  // the long cracks: from the roots outward, jagged, now and then forking
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  const toPx = v => (v / SPAN * 0.5 + 0.5) * S;
  const crack = (x, y, a, len, w) => {
    let px = x, py = y;
    const steps = Math.ceil(len / 0.045);
    for (let s = 0; s < steps; s++) {
      a += (rng() - 0.5) * 0.9;
      const nx = px + Math.sin(a) * 0.045, ny = py + Math.cos(a) * 0.045, ww = w * (1 - s / steps * 0.7);
      g.lineWidth = Math.max(1, ww * S / 384); g.beginPath(); g.moveTo(toPx(px), toPx(py)); g.lineTo(toPx(nx), toPx(ny)); g.stroke();
      px = nx; py = ny;
      if (rng() < 0.05 && w > 1.6) crack(px, py, a + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.5), len * (0.25 + rng() * 0.3), w * 0.6);
    }
  };
  const NC = 11, c0 = rng() * 6.28;
  for (let i = 0; i < NC; i++) { const a = c0 + (i + (rng() - 0.5) * 0.5) / NC * Math.PI * 2; crack(Math.sin(a) * 0.27, Math.cos(a) * 0.27, a, 0.7 + rng() * 0.45, 5.2); }
  const img = g.getImageData(0, 0, S, S).data;
  for (let k = 0; k < S * S; k++) cross[k] = img[k * 4] / 255;
  // the glow round them: both blurred (a box blur, twice, each way)
  let a = new Float32Array(S * S), b = new Float32Array(S * S);
  for (let k = 0; k < S * S; k++) a[k] = Math.max(seam[k] * 0.55, cross[k]);
  const R = 6;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < S; j++) { let s = 0; for (let i = -R; i <= R; i++) s += a[j * S + clamp(i, 0, S - 1)]; for (let i = 0; i < S; i++) { b[j * S + i] = s / (2 * R + 1); s += a[j * S + Math.min(S - 1, i + R + 1)] - a[j * S + Math.max(0, i - R)]; } }
    for (let i = 0; i < S; i++) { let s = 0; for (let j = -R; j <= R; j++) s += b[clamp(j, 0, S - 1) * S + i]; for (let j = 0; j < S; j++) { a[j * S + i] = s / (2 * R + 1); s += b[Math.min(S - 1, j + R + 1) * S + i] - b[Math.max(0, j - R) * S + i]; } }
  }
  for (let k = 0; k < S * S; k++) {
    data[k * 4] = Math.round(seam[k] * 255);
    data[k * 4 + 2] = Math.round(cross[k] * 255);
    data[k * 4 + 3] = Math.round(clamp(a[k] * 2.2, 0, 1) * 255);
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return { tex, pts };
}

// --------------------------------------------------------------------------
// the ground's light: one disc laid over the ground
// --------------------------------------------------------------------------
const DISC_VS = /* glsl */`
varying vec2 vP;
void main() {
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DISC_FS = /* glsl */`
${NOISE}
uniform sampler2D uMap;
uniform float uR, uTime;
uniform float uGlow;                 // the warm glow under the bud
uniform vec3 uWarn;                  // x: how far the ring has opened (of its radius), y: how far it has filled, z: how strongly it shows
uniform vec2 uCrack;                 // x: how far out the cracks have run (of the radius), y: how hot they glow
uniform vec2 uEarth;                 // x: the broken earth showing, y: how far it is scorched
uniform vec3 uSplash;                // x: how far out the green has spread, y: how strongly it shows, z: the green ring that runs out
uniform vec3 uWarnC, uWarnHot, uRim, uRimGlow, uCrackC, uCrackHot, uHalo, uE0, uE1, uE2, uSeam, uScorch, uS0, uS1, uS2;
varying vec2 vP;
vec4 acc;
void over(vec3 c, float a) { a = clamp(a, 0.0, 1.0); acc = vec4(c * a, a) + acc * (1.0 - a); }
void main() {
  vec2 q = vP / uR;
  float r = length(q);
  vec4 m = texture2D(uMap, q / ${(SPAN * 2).toFixed(2)} + 0.5);
  float n = noise2(q * 5.0), n2 = noise2(q * 13.0 + 7.0);
  acc = vec4(0.0);
  // the broken earth the vines came up through (and, after, scorched)
  float earthR = 0.42 + (n - 0.5) * 0.18 + (n2 - 0.5) * 0.06;
  float earth = uEarth.x * (1.0 - smoothstep(earthR - 0.04, earthR, r)) * smoothstep(0.12, 0.2, r);
  vec3 plate = m.g < 0.33 ? uE0 : (m.g < 0.7 ? uE1 : uE2);
  plate = mix(plate, uE0, step(0.62, n2) * 0.6);
  plate = mix(plate, uScorch, uEarth.y * 0.55);
  float seams = max(m.r, m.b);
  plate = mix(plate, uSeam, smoothstep(0.35, 0.7, seams));
  over(plate, earth * 0.88);
  // the warm glow under the bud
  over(uWarnHot, uGlow * exp(-r * r * 9.0) * 0.75);
  // the warning: its fill (stronger toward the rim), the part filled so far, the filling front, the rim
  float open = uWarn.x, fill = uWarn.y * open, w = uWarn.z;
  if (w > 0.001 && open > 0.001) {
    float inside = 1.0 - smoothstep(open - 0.004, open + 0.004, r);
    float rr = r / max(open, 0.001);
    // waves of light running out from the bud to the rim, quicker as it fills
    float wv = fract(rr * 2.4 - uTime * (0.5 + 1.1 * uWarn.y));
    float wave = smoothstep(0.0, 0.1, wv) * (1.0 - smoothstep(0.1, 0.45, wv)) * smoothstep(0.22, 0.45, rr);
    float filled = 1.0 - smoothstep(fill - 0.01, fill, r);
    float band = smoothstep(0.6, 0.98, rr);
    vec3 fc = mix(uWarnC, uWarnHot, band * 0.55 + wave * 0.45);
    over(fc, w * inside * (0.74 + 0.14 * band + 0.06 * filled + 0.08 * wave + (n - 0.5) * 0.06));
    // the line that fills it
    float front = exp(-pow((r - fill) / 0.013, 2.0)) * (1.0 - step(0.985, uWarn.y));
    over(uRim, w * front * 0.6);
    // the rim: a thick white-hot band, a glow on both sides of it, beating; a thinner echo of it inside
    float beat = 0.8 + 0.2 * sin(uTime * (6.0 + 10.0 * uWarn.y));
    float d = r - open;
    over(uRimGlow, w * (exp(-max(d, 0.0) / 0.055) * step(0.0, d) * 0.8 + exp(min(d, 0.0) / 0.075) * step(d, 0.0) * 0.55) * beat);
    over(uRim, w * (1.0 - smoothstep(0.011, 0.019, abs(d + 0.017))));
    over(uRim, w * (1.0 - smoothstep(0.003, 0.008, abs(d + 0.072))) * 0.55 * beat);
  }
  // the cracks: running out from the roots, glowing; then cooling to dark seams in the scorch
  float run = uCrack.x + (n - 0.5) * 0.08;
  float shownCross = m.b * (1.0 - smoothstep(run - 0.03, run, r));
  float shownSeam = m.r * (1.0 - smoothstep(run * 0.95 - 0.06, run * 0.95 - 0.02, r));
  float c = max(shownCross, shownSeam * 0.8);
  float heat = uCrack.y * (0.85 + 0.15 * sin(uTime * 23.0 + n * 9.0));
  float halo = m.a * (1.0 - smoothstep(run - 0.08, run, r));
  over(uHalo, halo * heat * 0.7);
  over(mix(uCrackC, uCrackHot, c * c), smoothstep(0.25, 0.6, c) * heat);
  // the green splash: blots spreading out, then breaking up and going; a green ring running out ahead
  if (uSplash.y > 0.001) {
    float sn = noise2(q * 3.2 + 3.0) * 0.6 + noise2(q * 8.0 - 5.0) * 0.4;
    float reach = uSplash.x * (0.65 + 0.55 * sn);
    float blot = (1.0 - smoothstep(reach - 0.05, reach, r)) * step(0.36 + 0.25 * (1.0 - uSplash.y), sn);
    vec3 g = sn > 0.66 ? uS2 : (sn > 0.5 ? uS1 : uS0);
    over(g, blot * uSplash.y);
  }
  if (uSplash.z > 0.0 && uSplash.z < 1.4) {
    float ring = 1.0 - smoothstep(0.0, 0.03 + 0.03 * uSplash.z, abs(r - uSplash.z));
    over(uS2, ring * (1.0 - smoothstep(0.7, 1.4, uSplash.z)) * 0.85);
  }
  if (acc.a < 0.003) discard;
  gl_FragColor = acc;
}`;

// --------------------------------------------------------------------------
// the wall of light round the rim: tongues licking up, two taller swells running round it. Seen through on the side
// toward the camera, so the bud is not lost behind it
// --------------------------------------------------------------------------
const WALL_VS = /* glsl */`
attribute vec2 aWall;        // x: round it 0..1, y: up it 0..1
uniform float uOpen, uH;
varying vec2 vW;
varying float vFace;
void main() {
  vW = aWall;
  vec3 p = position;
  p.xz *= uOpen;
  p.y += aWall.y * uH;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vec3 out3 = normalize(vec3(position.x, 0.0, position.z) + 1e-4);
  vFace = dot(out3, normalize(cameraPosition - w.xyz));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WALL_FS = /* glsl */`
${NOISE}
uniform float uTime, uA, uFlare;
uniform vec3 uC, uHot;
varying vec2 vW;
varying float vFace;
void main() {
  float u = vW.x, v = vW.y;
  float s1 = fract(u - uTime * 0.16), s2 = fract(u + uTime * 0.11 + 0.5);
  float sweep = max(exp(-pow((s1 - 0.5) * 6.0, 2.0)), exp(-pow((s2 - 0.5) * 8.0, 2.0)));
  float h = v / (0.5 + 0.5 * sweep + 0.4 * uFlare);
  if (h > 1.0) discard;
  float n = noise2(vec2(u * 46.0, h * 2.2 - uTime * 2.6)) * 0.65 + noise2(vec2(u * 112.0, h * 4.0 - uTime * 4.1)) * 0.35;
  float body = 1.0 - h;
  float tongue = step(h * 0.95 + 0.12, n * (0.6 + 0.6 * body) + body * 0.45);
  float foot = 1.0 - smoothstep(0.0, 0.2, h);
  float s = max(tongue * (0.58 + 0.36 * sweep), foot * 0.92) * uA * mix(1.0, 0.25, smoothstep(0.05, 0.6, vFace));
  if (s < 0.01) discard;
  gl_FragColor = vec4(mix(uC, uHot, foot * 0.8 + tongue * sweep * 0.45) * s, s);
}`;

// --------------------------------------------------------------------------
// the plates the ground breaks into as the vines burst up: the same cells as the cracks, each a slab that comes up out
// of the ground, tipped, rocks while the vines writhe and sinks with them. Their seams glow from below
// --------------------------------------------------------------------------
const PLATE_VS = /* glsl */`
attribute vec4 aPlate;       // xy: its middle (metres, x and z), z: when it comes up (seconds into the move), w: its own dice
attribute vec4 aKind;        // x: 1 grass on top, y: 1 a side, z: the height it turns about, w: how far down its side 0..1
uniform float uT, uSink, uWob, uDown;
varying vec3 vN;
varying vec4 vKind;
vec3 turn(vec3 v, vec3 k, float a) { return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
void main() {
  float x = clamp((uT - aPlate.z) / 0.2, 0.0, 1.0);
  float e = (1.0 + 2.4 * pow(x - 1.0, 3.0) + 1.4 * pow(x - 1.0, 2.0)) * (1.0 - uSink);
  vec3 c = vec3(aPlate.x, aKind.z, aPlate.y);
  vec3 k = normalize(vec3(aPlate.y, 0.0, -aPlate.x) + vec3(1e-4, 0.0, 0.0));
  float tip = (aPlate.w - 0.5) * 0.36 * e + sin(uT * 13.0 + aPlate.w * 40.0) * 0.035 * uWob;
  vec3 p = turn(position - c, k, tip) + c;
  p.y -= uDown * (1.0 - e);
  vN = normalize(mat3(modelMatrix) * turn(normal, k, tip));
  vKind = aKind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const PLATE_FS = /* glsl */`
uniform vec3 uSun, uP0, uP1, uP2, uG0, uG1, uSide, uSeam, uTint;
uniform float uGlow, uHeat;
varying vec3 vN;
varying vec4 vKind;
void main() {
  vec3 n = normalize(vN);
  float l = dot(n, uSun);
  vec3 c;
  if (vKind.y > 0.5) c = mix(l > 0.25 ? uSide * 1.3 : uSide, uSeam, smoothstep(0.4, 0.9, vKind.w) * uHeat);
  else if (vKind.x > 0.5) c = l > 0.72 ? uG1 : uG0;
  else c = l > 0.8 ? uP2 : (l > 0.55 ? uP1 : uP0);
  c = mix(c, uTint, uGlow * (vKind.x > 0.5 ? 0.35 : 0.18));
  gl_FragColor = vec4(c, 1.0);
}`;

// --------------------------------------------------------------------------
// the vines (and the low thorn spears): built here, every frame
// --------------------------------------------------------------------------
const RINGS = 34, SIDES = 7;
const VINE_VS = /* glsl */`
attribute vec3 aInfo;        // x: how far along 0..1, y: 1 on a thorn, z: the vine's own dice
varying vec3 vN;
varying vec3 vInfo;
varying vec3 vV;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vInfo = aInfo;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const VINE_FS = /* glsl */`
${NOISE}
uniform vec3 uSun, uW0, uW1, uW2, uW3, uT0, uT1, uT2, uBurn;
uniform float uHeat;
varying vec3 vN;
varying vec3 vInfo;
varying vec3 vV;
void main() {
  vec3 n = normalize(vN);
  float stroke = noise2(vec2(vInfo.x * 46.0, vInfo.z * 40.0 + n.x * 2.5 + n.z * 2.5)) - 0.5;
  float l = dot(n, uSun) + stroke * 0.42;
  vec3 c;
  if (vInfo.y > 0.5) c = l > 0.35 ? uT2 : (l > -0.1 ? uT1 : uT0);
  else {
    c = l > 0.42 ? uW2 : (l > -0.05 ? uW1 : uW0);
    if (l > 0.62 && n.y > 0.35) c = uW3;
    // a rim of light along its outline
    float rim = 1.0 - abs(dot(n, normalize(vV)));
    c = mix(c, uW2, step(0.82, rim) * step(0.0, l) * 0.6);
  }
  // fresh out of the hot ground: its foot glows a moment
  c = mix(c, uBurn, uHeat * (1.0 - smoothstep(0.0, 0.14, vInfo.x)) * (0.6 + 0.4 * step(0.5, vInfo.y)));
  gl_FragColor = vec4(c, 1.0);
}`;
const LINE_VS = /* glsl */`
attribute float aRad;
uniform float uWidth;
void main() {
  vec3 p = position + normal * clamp(aRad * 0.22, 0.008, uWidth);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const LINE_FS = /* glsl */`
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;

function makeVines(count, rng, look) {
  const ringV = (RINGS + 1) * SIDES;
  const THORNS = 11, thornV = 5;
  const perVine = ringV + THORNS * thornV;
  const n = count * perVine;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), info = new Float32Array(n * 3), rad = new Float32Array(n);
  const idx = [];
  const vines = [];
  for (let v = 0; v < count; v++) {
    const base = v * perVine, dice = rng();
    for (let j = 0; j < RINGS; j++) for (let s = 0; s < SIDES; s++) {
      const a = base + j * SIDES + s, b = base + j * SIDES + (s + 1) % SIDES, c = a + SIDES, d = b + SIDES;
      idx.push(a, b, c, b, d, c);
    }
    for (let j = 0; j <= RINGS; j++) for (let s = 0; s < SIDES; s++) { const k = base + j * SIDES + s; info[k * 3] = j / RINGS; info[k * 3 + 2] = dice; }
    const thorns = [];
    for (let k = 0; k < THORNS; k++) {
      const t0 = base + ringV + k * thornV;
      for (let q = 0; q < thornV; q++) { info[(t0 + q) * 3 + 1] = 1; info[(t0 + q) * 3 + 2] = dice; }
      // four faces from the foot's square to the point, and the foot closed under
      idx.push(t0, t0 + 1, t0 + 4, t0 + 1, t0 + 2, t0 + 4, t0 + 2, t0 + 3, t0 + 4, t0 + 3, t0, t0 + 4);
      thorns.push({ u: 0.08 + (k + rng() * 0.6) / THORNS * 0.84, a: k * 2.39996 + rng() * 0.8, long: 0.75 + rng() * 0.5 });
      for (let q = 0; q < thornV; q++) info[(t0 + q) * 3] = thorns[k].u;
    }
    vines.push({ base, dice, thorns });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
  g.setAttribute('aRad', new THREE.BufferAttribute(rad, 1).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 14);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VINE_VS, fragmentShader: VINE_FS,
    uniforms: {
      uSun: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() }, uHeat: { value: 0 }, uBurn: { value: col(L.crack) },
      uW0: { value: col(look.wood[0]) }, uW1: { value: col(look.wood[1]) }, uW2: { value: col(look.wood[2]) }, uW3: { value: col(look.wood[3]) },
      uT0: { value: col(look.thorn[0]) }, uT1: { value: col(look.thorn[1]) }, uT2: { value: col(look.thorn[2]) },
    },
  });
  const line = new THREE.ShaderMaterial({ vertexShader: LINE_VS, fragmentShader: LINE_FS, side: THREE.BackSide, uniforms: { uColor: { value: col(look.line) }, uWidth: { value: 0.05 } } });
  const mesh = new THREE.Mesh(g, mat), outline = new THREE.Mesh(g, line);
  mesh.frustumCulled = outline.frustumCulled = false;
  return { mesh, outline, vines, pos, nor, rad, geometry: g, perVine, ringV, thornV, material: mat, line };
}

// --------------------------------------------------------------------------
// puffs: dust, smoke, green flame. Camera-facing cut-outs
// --------------------------------------------------------------------------
const PUFF_VS = /* glsl */`
attribute vec3 aPos;
attribute vec2 aSize;        // width, height (metres)
attribute vec4 aInfo;        // x: kind (0 dust, 1 smoke, 2 green flame), y: its own dice, z: how far through its life 0..1, w: turned (radians)
varying vec2 vUv;
varying vec4 vInfo;
void main() {
  vUv = uv; vInfo = aInfo;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float c = cos(aInfo.w), s = sin(aInfo.w);
  vec2 p = position.xy * aSize;
  mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  gl_Position = projectionMatrix * mv;
}`;
const PUFF_FS = /* glsl */`
${NOISE}
uniform vec3 uD0, uD1, uD2, uK0, uK1, uK2, uF0, uF1, uF2;
uniform float uAlpha;
varying vec2 vUv;
varying vec4 vInfo;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float kind = vInfo.x, dice = vInfo.y, k = vInfo.z;
  float a = atan(p.y, p.x), d = length(p);
  float edge = 0.8 + 0.11 * sin(a * 5.0 + dice * 6.28) + 0.06 * sin(a * 9.0 - dice * 11.0);
  if (kind > 1.5) {                                   // a flame: a tongue, narrow toward its tip, its edge licking
    vec2 f = vec2(p.x * (1.0 + max(p.y + 0.2, 0.0) * 1.9), p.y * 0.92 + 0.06);
    d = length(f);
    edge = 0.78 + 0.1 * sin(p.y * 7.0 + dice * 30.0 + k * 9.0) + 0.06 * sin(a * 6.0 + dice * 5.0);
  }
  float n = noise2(p * 2.4 + dice * 17.0);
  float cut = edge * (1.0 - 0.35 * k * k) - (n - 0.5) * 0.3 * k;
  if (d > cut) discard;
  if (n < k * 1.25 - 0.4) discard;                   // eaten away as it goes
  vec3 c;
  if (kind > 1.5) {
    float rel = d / max(cut, 0.001);
    c = rel < 0.45 ? uF2 : (rel < 0.78 ? uF1 : uF0);
  } else {
    vec3 sph = vec3(p, sqrt(max(0.0, 1.0 - d * d)));
    float l = dot(normalize(sph), normalize(vec3(-0.35, 0.8, 0.5))) + (n - 0.5) * 0.35;
    if (kind > 0.5) c = l > 0.45 ? uK2 : (l > 0.0 ? uK1 : uK0);
    else c = l > 0.45 ? uD2 : (l > 0.0 ? uD1 : uD0);
  }
  gl_FragColor = vec4(c * uAlpha, uAlpha);
}`;

// the faint red smoke over the ring: soft, swirling, seen through
const HAZE_FS = /* glsl */`
${NOISE}
uniform vec3 uC0, uC1;
uniform float uTime, uA;
varying vec2 vUv;
varying vec4 vInfo;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float k = vInfo.z, dice = vInfo.y;
  vec2 q = p + (vec2(noise2(p * 1.6 + dice * 13.0 + uTime * 0.4), noise2(p * 1.6 - dice * 7.0 - uTime * 0.35)) - 0.5) * 0.6;
  float d = length(q);
  float n = noise2(q * 2.8 + dice * 29.0) * 0.6 + noise2(q * 6.0 - dice * 5.0 + uTime * 0.3) * 0.4;
  float a = 1.0 - smoothstep(0.3, 0.95, d + (n - 0.5) * 0.55);
  a *= smoothstep(0.0, 0.25, k) * (1.0 - smoothstep(0.5, 1.0, k)) * vInfo.w * uA * 0.34;
  if (a < 0.004) discard;
  vec3 c = mix(uC0, uC1, smoothstep(-0.7, 0.5, -p.y) * 0.7 + n * 0.3);
  gl_FragColor = vec4(c * a, a);
}`;

function makePool(max, attrs, mat) {
  const g = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  g.setIndex(quad.index); g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
  const arrays = {};
  for (const [name, size] of Object.entries(attrs)) {
    arrays[name] = new Float32Array(max * size);
    g.setAttribute(name, new THREE.InstancedBufferAttribute(arrays[name], size).setUsage(THREE.DynamicDrawUsage));
  }
  g.instanceCount = 0;
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return { mesh, g, arrays, list: [], max };
}

// --------------------------------------------------------------------------
// sparks: streaks along the way they fly, glowing (added onto what is behind)
// --------------------------------------------------------------------------
const SPARK_VS = /* glsl */`
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec4 aInfo;        // xyz: colour, w: size (metres) times how bright (sign: < 0 orange)
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = uv; vCol = aInfo.xyz;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  vec2 v = (viewMatrix * vec4(aVel, 0.0)).xy;
  float sp = length(v);
  vec2 dir = sp > 0.001 ? v / sp : vec2(0.0, 1.0);
  float w = aInfo.w, len = w * 1.6 + sp * 0.05;
  mv.xy += dir * position.y * len + vec2(-dir.y, dir.x) * position.x * w;
  gl_Position = projectionMatrix * mv;
}`;
const SPARK_FS = /* glsl */`
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vec2 p = abs(vUv * 2.0 - 1.0);
  float s = (1.0 - p.x) * (1.0 - p.y * p.y);
  if (s <= 0.0) discard;
  s = pow(s, 1.4);
  gl_FragColor = vec4(mix(vCol, vec3(1.0, 1.0, 0.9), s * s * 0.7) * s, s);
}`;

// --------------------------------------------------------------------------
// stones: little flat-shaded rocks (instanced)
// --------------------------------------------------------------------------
const ROCK_VS = /* glsl */`
varying vec3 vN;
varying vec3 vC;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vN = normalize(mat3(m) * normal);
  vC = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
}`;
const ROCK_FS = /* glsl */`
uniform vec3 uSun;
varying vec3 vN;
varying vec3 vC;
void main() {
  float l = dot(normalize(vN), uSun);
  vec3 c = l > 0.5 ? vC * 1.28 : (l > 0.0 ? vC : vC * 0.62);
  gl_FragColor = vec4(c, 1.0);
}`;

// --------------------------------------------------------------------------
// ribbons of light: the orange swirls round the bud, the green bolts
// --------------------------------------------------------------------------
const GLOW_VS = /* glsl */`
attribute vec2 aGlow;        // x: how far along 0..1, y: across -1..1
varying vec2 vG;
void main() { vG = aGlow; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ARC_FS = /* glsl */`
uniform vec3 uColor, uHot;
uniform float uA;
varying vec2 vG;
void main() {
  float head = smoothstep(0.0, 0.85, vG.x) * (1.0 - smoothstep(0.88, 1.0, vG.x));
  float across = 1.0 - abs(vG.y);
  float s = head * across * across * uA;
  if (s <= 0.002) discard;
  gl_FragColor = vec4(mix(uColor, uHot, s * s) * s, s);
}`;
const BOLT_FS = /* glsl */`
uniform vec3 uColor;
uniform float uA;
varying vec2 vG;
void main() {
  float across = 1.0 - abs(vG.y);
  float s = across * uA;
  if (s <= 0.002) discard;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), smoothstep(0.55, 1.0, across)) * s, s);
}`;
function arcGeometry(span, rho, segs = 28) {
  const p = [], gl = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, a = u * span, w = 0.09 + 0.15 * Math.sin(u * Math.PI);
    const x = Math.cos(a) * rho, z = Math.sin(a) * rho, ox = Math.cos(a), oz = Math.sin(a);
    // two ribbons across each other: one lying flat, one standing
    p.push(x - ox * w, 0, z - oz * w, x + ox * w, 0, z + oz * w, x, -w, z, x, w, z);
    gl.push(u, -1, u, 1, u, -1, u, 1);
    if (i < segs) { const b = i * 4; for (const o of [0, 2]) idx.push(b + o, b + o + 1, b + o + 4, b + o + 1, b + o + 5, b + o + 4); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(gl, 2));
  g.setIndex(idx);
  return g;
}

// shared pieces for the boss's other effects (howl-fx.js)
export const _fx = { SPARK_VS, SPARK_FS, PUFF_VS, HAZE_FS, GLOW_VS, makePool, col };

// ==========================================================================
export function createThicketFx({ heightAt = null, seed = 1, lift = 0.08, vines: vineCount = 18, look = THICKET_LOOK } = {}) {
  const rng = mulberry32(seed * 313 + 5);
  const object = new THREE.Group();
  object.name = 'thicket_fx';
  object.visible = false;
  const sun = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  const origin = new THREE.Vector3();
  let R = M.radius, K = 1;                         // the ring's radius, and how much bigger than as written
  const groundAt = (x, z) => heightAt ? heightAt(x, z) : origin.y;     // (world)

  // ---- the ground's light
  const { tex: crackMap, pts: plateSeeds } = bakeCracks(seed);
  const DU = {
    uMap: { value: crackMap }, uR: { value: R }, uTime: { value: 0 }, uGlow: { value: 0 },
    uWarn: { value: new THREE.Vector3() }, uCrack: { value: new THREE.Vector2() }, uEarth: { value: new THREE.Vector2() }, uSplash: { value: new THREE.Vector3() },
    uWarnC: { value: col(look.warn) }, uWarnHot: { value: col(look.warnHot) }, uRim: { value: col(look.rim) }, uRimGlow: { value: col(look.rimGlow) },
    uCrackC: { value: col(look.crack) }, uCrackHot: { value: col(look.crackHot) }, uHalo: { value: col(look.halo) },
    uE0: { value: col(look.earth[0]) }, uE1: { value: col(look.earth[1]) }, uE2: { value: col(look.earth[2]) }, uSeam: { value: col(look.seam) }, uScorch: { value: col(look.scorch) },
    uS0: { value: col(look.splash[0]) }, uS1: { value: col(look.splash[1]) }, uS2: { value: col(look.splash[2]) },
  };
  const discMat = new THREE.ShaderMaterial({ vertexShader: DISC_VS, fragmentShader: DISC_FS, uniforms: DU, transparent: true, depthWrite: false, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const NR = 30, NS = 96;
  const discGeo = (() => {
    const p = [], idx = [];
    p.push(0, 0, 0);
    for (let i = 1; i <= NR; i++) for (let j = 0; j < NS; j++) { const r = (i / NR) * SPAN, a = (j / NS) * Math.PI * 2; p.push(Math.sin(a) * r, 0, Math.cos(a) * r); }
    for (let j = 0; j < NS; j++) idx.push(0, 1 + j, 1 + (j + 1) % NS);
    for (let i = 1; i < NR; i++) for (let j = 0; j < NS; j++) {
      const a = 1 + (i - 1) * NS + j, b = 1 + (i - 1) * NS + (j + 1) % NS, c = a + NS, d = b + NS;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(idx);
    return g;
  })();
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.renderOrder = 2; disc.frustumCulled = false;
  object.add(disc);
  // the disc's corners stay where they were made: R units. Laid on the ground at the start (heights follow the land)
  const discBase = discGeo.attributes.position.array.slice();
  function layDisc() {
    const p = discGeo.attributes.position.array;
    for (let k = 0; k < p.length; k += 3) {
      const x = discBase[k] * R, z = discBase[k + 2] * R;
      p[k] = x; p[k + 2] = z; p[k + 1] = groundAt(origin.x + x, origin.z + z) - origin.y + lift;
    }
    discGeo.attributes.position.needsUpdate = true;
    discGeo.computeBoundingSphere();
    DU.uR.value = R;
  }

  // ---- the wall of light round the rim
  const WS = 128;
  const wallGeo = (() => {
    const p = new Float32Array((WS + 1) * 2 * 3), a = new Float32Array((WS + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= WS; i++) for (let j = 0; j < 2; j++) { a.set([i / WS, j], (i * 2 + j) * 2); }
    for (let i = 0; i < WS; i++) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aWall', new THREE.BufferAttribute(a, 2));
    g.setIndex(idx);
    return g;
  })();
  const wallMat = new THREE.ShaderMaterial({ vertexShader: WALL_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uTime: DU.uTime, uOpen: { value: 0 }, uH: { value: 1.9 }, uA: { value: 0 }, uFlare: { value: 0 }, uC: { value: col(look.wall) }, uHot: { value: col(look.wallHot) } } });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.renderOrder = 5; wall.frustumCulled = false; wall.visible = false;
  object.add(wall);
  function layWall() {
    const p = wallGeo.attributes.position.array;
    for (let i = 0; i <= WS; i++) {
      const a = (i / WS) * Math.PI * 2, x = Math.sin(a) * R, z = Math.cos(a) * R, y = groundAt(origin.x + x, origin.z + z) - origin.y + lift - 0.05;
      for (let j = 0; j < 2; j++) p.set([x, y, z], (i * 2 + j) * 3);
    }
    wallGeo.attributes.position.needsUpdate = true;
    wallMat.uniforms.uH.value = 2.6 * K;
  }

  // ---- the plates (cells of the crack pattern, cut to the ring)
  const plateMat = new THREE.ShaderMaterial({ vertexShader: PLATE_VS, fragmentShader: PLATE_FS, uniforms: {
    uT: { value: 0 }, uSink: { value: 0 }, uWob: { value: 0 }, uDown: { value: 1 }, uSun: { value: sun }, uGlow: { value: 0 }, uHeat: { value: 0 },
    uP0: { value: col(look.plate[0]) }, uP1: { value: col(look.plate[1]) }, uP2: { value: col(look.plate[2]) },
    uG0: { value: col(look.plateGrass[0]) }, uG1: { value: col(look.plateGrass[1]) },
    uSide: { value: col(look.plateSide) }, uSeam: { value: col(look.seamHot) }, uTint: { value: col(look.warn) },
  } });
  const plates = new THREE.Mesh(new THREE.BufferGeometry(), plateMat);
  plates.frustumCulled = false; plates.visible = false;
  object.add(plates);
  // a cell: the square cut down by every neighbour's half of the way between them, then by the ring's edge, and kept
  // clear of the roots. Corners in units of the radius
  function cellOf(i) {
    const clip = (poly, nx, ny, d) => {                      // keep what has nx x + ny z <= d
      const out = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length], da = nx * a[0] + ny * a[1] - d, db = nx * b[0] + ny * b[1] - d;
        if (da <= 0) out.push(a);
        if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      return out;
    };
    const [xi, zi] = plateSeeds[i];
    let poly = [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]];
    plateSeeds.forEach(([xj, zj], j) => { if (j !== i && poly.length) poly = clip(poly, xj - xi, zj - zi, (xj * xj + zj * zj - xi * xi - zi * zi) / 2); });
    for (let k = 0; k < 40 && poly.length; k++) { const a = (k / 40) * Math.PI * 2; poly = clip(poly, Math.sin(a), Math.cos(a), 0.975); }
    const l = Math.hypot(xi, zi) || 1;
    if (poly.length) poly = clip(poly, -xi / l, -zi / l, -0.29);
    return poly;
  }
  const cells = plateSeeds.map((_, i) => cellOf(i));
  function layPlates() {
    const r2 = mulberry32(seed * 61 + 7);
    const pos = [], nor = [], pl = [], kind = [], idx = [];
    const add = (x, y, z, nx, ny, nz, cx, cz, when, dice, grass, side, py, down) => {
      pos.push(x, y, z); nor.push(nx, ny, nz); pl.push(cx, cz, when, dice); kind.push(grass, side, py, down);
      return pos.length / 3 - 1;
    };
    cells.forEach(poly => {
      if (poly.length < 3) return;
      // its middle, and the cell drawn in toward it a little: the seam
      let cx = 0, cz = 0;
      for (const [x, z] of poly) { cx += x; cz += z; }
      cx /= poly.length; cz /= poly.length;
      const gap = 0.022, rc = Math.hypot(cx, cz);
      const pts = poly.map(([x, z]) => { const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1, k = Math.max(0, d - gap) / d; return [(cx + dx * k) * R, (cz + dz * k) * R]; });
      const mx = cx * R, mz = cz * R, gy = groundAt(origin.x + mx, origin.z + mz) - origin.y + lift;
      const th = (0.1 + r2() * 0.12) * K, top = gy + th, foot = gy - 0.25 * K;
      const when = M.hit - 0.06 + rc * 0.1 + r2() * 0.05, dice = r2(), grass = r2() < 0.32 ? 1 : 0;
      // top
      const t0 = pos.length / 3;
      add(mx, top, mz, 0, 1, 0, mx, mz, when, dice, grass, 0, gy, 0);
      pts.forEach(([x, z]) => add(x, top, z, 0, 1, 0, mx, mz, when, dice, grass, 0, gy, 0));
      for (let k = 0; k < pts.length; k++) idx.push(t0, t0 + 1 + (k + 1) % pts.length, t0 + 1 + k);
      // sides: down into the ground, glowing toward their foot
      for (let k = 0; k < pts.length; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length];
        let nx = bz - az, nz = -(bx - ax);
        const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        if (nx * (ax - mx) + nz * (az - mz) < 0) { nx = -nx; nz = -nz; }
        const a = add(ax, top, az, nx, 0, nz, mx, mz, when, dice, grass, 1, gy, 0), b = add(bx, top, bz, nx, 0, nz, mx, mz, when, dice, grass, 1, gy, 0);
        const c = add(ax, foot, az, nx, 0, nz, mx, mz, when, dice, grass, 1, gy, 1), d = add(bx, foot, bz, nx, 0, nz, mx, mz, when, dice, grass, 1, gy, 1);
        idx.push(a, b, c, b, d, c);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aPlate', new THREE.Float32BufferAttribute(pl, 4));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 4));
    g.setIndex(idx);
    plates.geometry.dispose();
    plates.geometry = g;
    plateMat.uniforms.uDown.value = 0.45 * K;
  }

  // ---- the vines
  const V = makeVines(vineCount, rng, look);
  object.add(V.outline, V.mesh);
  const vineSpecs = [];
  function layVines() {
    vineSpecs.length = 0;
    const r2 = mulberry32((seed * 7919 + Math.floor(rng() * 1e6)) | 0);
    const spears = 3, a0 = r2() * 6.28;
    for (let i = 0; i < vineCount; i++) {
      const spear = i >= vineCount - spears;
      const az = spear ? a0 + (i - vineCount + spears + 0.5 + (r2() - 0.5) * 0.4) / spears * Math.PI * 2 + 0.6
                       : a0 + (i + (r2() - 0.5) * 0.6) / (vineCount - spears) * Math.PI * 2;
      const near = r2() < 0.45;
      const rf = (spear ? 0.38 + r2() * 0.08 : near ? 0.36 + r2() * 0.14 : 0.55 + r2() * 0.3) * R;
      const out = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
      // the way it leans and hooks over: mostly outward, some inward over the bud, some sideways
      const inward = !spear && r2() < 0.35, twist = (r2() - 0.5) * (spear ? 0.3 : 1.3);
      const plane = out.clone().multiplyScalar(inward ? -1 : 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), twist);
      const side = new THREE.Vector3(plane.z, 0, -plane.x);
      const fx = Math.sin(az) * rf, fz = Math.cos(az) * rf;
      vineSpecs.push({
        spear, foot: new THREE.Vector3(fx, groundAt(origin.x + fx, origin.z + fz) - origin.y - 0.3 * K, fz), plane, side,
        len: (spear ? 0.62 * R / 0.92 : (near ? 5.6 + r2() * 2.2 : 4.2 + r2() * 2.0) * K),
        thick: (spear ? 0.16 + r2() * 0.04 : 0.27 + r2() * 0.14) * K,
        lean: spear ? 1.12 + r2() * 0.18 : (inward ? 0.12 : 0.05) + r2() * 0.3,
        curl: spear ? 0.12 + r2() * 0.15 : 1.9 + r2() * 1.3,
        wig: (spear ? 0.05 : 0.15 + r2() * 0.3) * K,
        sway: spear ? 0.05 : 0.18 + r2() * 0.16, swayW: 3.2 + r2() * 2.6, ph: r2() * 6.28,
        rise: M.hit + (spear ? 0.85 + r2() * 0.25 : 0.02 + r2() * 0.28), grow: spear ? 0.16 : 0.26 + r2() * 0.12,
        sinkAt: M.sink + (spear ? -0.25 : r2() * 0.22), burst: false,
      });
    }
  }
  const pts = [], tan = [], nrm = [];
  for (let j = 0; j <= RINGS; j++) { pts.push(new THREE.Vector3()); tan.push(new THREE.Vector3()); nrm.push(new THREE.Vector3()); }
  const tv = new THREE.Vector3(), tb = new THREE.Vector3(), tn = new THREE.Vector3(), tq = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function buildVine(i, s, g, writhe, T) {
    const v = V.vines[i], P = V.pos, Nn = V.nor, Rd = V.rad, b = v.base;
    if (g <= 0.002) {                              // under the ground: drawn to nothing
      for (let k = b; k < b + V.perVine; k++) { P[k * 3] = s.foot.x; P[k * 3 + 1] = s.foot.y - 1; P[k * 3 + 2] = s.foot.z; Rd[k] = 0; }
      return;
    }
    const len = s.len, ds = (len * g) / RINGS;
    let x = 0, y = 0;
    for (let j = 0; j <= RINGS; j++) {
      const u = (j / RINGS) * g;
      const wave = s.sway * Math.sin(T * s.swayW - u * 4.5 + s.ph) * u * writhe;
      const curl = s.curl * (1 + 0.18 * Math.sin(T * 1.9 + s.ph) * writhe);                 // (its hook clenches and loosens)
      const th = s.lean + curl * Math.pow(Math.min(u, 1.15), s.spear ? 2 : 3.2) + wave;
      const sideOff = s.wig * Math.sin(u * 5 + s.ph) * u + 0.5 * K * Math.sin(T * s.swayW * 0.7 + s.ph - u * 3) * u * u * writhe * (s.spear ? 0 : 1);
      pts[j].copy(s.foot).addScaledVector(s.plane, x).addScaledVector(up, y).addScaledVector(s.side, sideOff);
      x += Math.sin(th) * ds; y += Math.cos(th) * ds;
    }
    for (let j = 0; j <= RINGS; j++) tan[j].subVectors(pts[Math.min(RINGS, j + 1)], pts[Math.max(0, j - 1)]).normalize();
    // a frame carried along it (it does not twist)
    nrm[0].copy(s.side).addScaledVector(tan[0], -s.side.dot(tan[0])).normalize();
    for (let j = 1; j <= RINGS; j++) nrm[j].copy(nrm[j - 1]).addScaledVector(tan[j], -nrm[j - 1].dot(tan[j])).normalize();
    const thickNow = s.thick * (0.55 + 0.45 * Math.min(1, g));
    const radius = j => { const w = j / RINGS; return thickNow * (Math.pow(1 - w, 0.72) * 0.94 + 0.06 * (1 - w)) * (1 + 0.3 * (1 - sstep(0, 0.1, w))) * (1 + 0.06 * Math.sin(w * 29 + s.ph)); };
    for (let j = 0; j <= RINGS; j++) {
      tb.crossVectors(tan[j], nrm[j]);
      const r = radius(j);
      for (let q = 0; q < SIDES; q++) {
        const a = (q / SIDES) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), k = b + j * SIDES + q;
        tn.copy(nrm[j]).multiplyScalar(c).addScaledVector(tb, sn);
        P[k * 3] = pts[j].x + tn.x * r; P[k * 3 + 1] = pts[j].y + tn.y * r; P[k * 3 + 2] = pts[j].z + tn.z * r;
        Nn[k * 3] = tn.x; Nn[k * 3 + 1] = tn.y; Nn[k * 3 + 2] = tn.z; Rd[k] = r;
      }
    }
    // its thorns: each where it sits along the vine, once that much of it is out of the ground
    v.thorns.forEach((th, ti) => {
      const k0 = b + V.ringV + ti * V.thornV, f = th.u / Math.max(g, 0.001), j = Math.round(clamp(f, 0, 1) * RINGS);
      const shown = sstep(th.u, th.u + 0.08, g) * (f < 0.97 ? 1 : 0);
      tb.crossVectors(tan[j], nrm[j]);
      const out = tn.copy(nrm[j]).multiplyScalar(Math.cos(th.a)).addScaledVector(tb, Math.sin(th.a));
      const r = radius(j), longT = (r * 2.5 + 0.2 * K) * th.long * shown, wide = (r * 0.62 + 0.045 * K) * shown;
      const c = tq.copy(pts[j]).addScaledVector(out, r * 0.7);
      const e2 = tv.crossVectors(out, tan[j]).normalize();
      const corners = [[tan[j], 1], [e2, 1], [tan[j], -1], [e2, -1]];
      corners.forEach(([e, sg], q) => {
        const k = k0 + q;
        P[k * 3] = c.x + e.x * wide * sg; P[k * 3 + 1] = c.y + e.y * wide * sg; P[k * 3 + 2] = c.z + e.z * wide * sg;
        Nn[k * 3] = e.x * sg * 0.6 + out.x * 0.4; Nn[k * 3 + 1] = e.y * sg * 0.6 + out.y * 0.4; Nn[k * 3 + 2] = e.z * sg * 0.6 + out.z * 0.4; Rd[k] = wide * 0.5;
      });
      // its point: out, bent a little toward the vine's end
      const k = k0 + 4;
      P[k * 3] = c.x + (out.x * 0.85 + tan[j].x * 0.5) * longT; P[k * 3 + 1] = c.y + (out.y * 0.85 + tan[j].y * 0.5) * longT; P[k * 3 + 2] = c.z + (out.z * 0.85 + tan[j].z * 0.5) * longT;
      Nn[k * 3] = out.x; Nn[k * 3 + 1] = out.y; Nn[k * 3 + 2] = out.z; Rd[k] = 0.004;
    });
  }

  // ---- stones
  const ROCKS = 200;
  const rockGeo = new THREE.IcosahedronGeometry(1, 0); rockGeo.computeVertexNormals();      // (made unshared: flat faces)
  const rockMat = new THREE.ShaderMaterial({ vertexShader: ROCK_VS, fragmentShader: ROCK_FS, uniforms: { uSun: { value: sun } } });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < ROCKS; i++) rockMesh.setColorAt(i, col(look.rock[i % look.rock.length]));
  rockMesh.count = 0; rockMesh.frustumCulled = false;
  object.add(rockMesh);
  const rocks = [];
  const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), eul = new THREE.Euler();
  // kind: 'fly' (thrown, falls, bounces once, lies a moment and goes), 'stay' (heaved up round a vine's foot: lies there
  // till `until`, then sinks)
  function stone(x, y, z, vx, vy, vz, size, kind = 'fly', until = 0) {
    if (rocks.length >= ROCKS) rocks.shift();
    rocks.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), size, kind, until, age: 0, life: kind === 'fly' ? 1.6 + Math.random() * 0.8 : 99,
      rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      squash: new THREE.Vector3(0.8 + Math.random() * 0.5, 0.6 + Math.random() * 0.4, 0.8 + Math.random() * 0.5), bounced: false, lying: false });
  }

  // ---- puffs and sparks
  const puffUniforms = {
    uD0: { value: col(look.dust[0]) }, uD1: { value: col(look.dust[1]) }, uD2: { value: col(look.dust[2]) },
    uK0: { value: col(look.smoke[0]) }, uK1: { value: col(look.smoke[1]) }, uK2: { value: col(look.smoke[2]) },
    uF0: { value: col(look.flame[0]) }, uF1: { value: col(look.flame[1]) }, uF2: { value: col(look.flame[2]) },
  };
  const puffMat = new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: PUFF_FS, uniforms: { ...puffUniforms, uAlpha: { value: 1 } } });
  const puffs = makePool(150, { aPos: 3, aSize: 2, aInfo: 4 }, puffMat);
  // smoke is seen through
  const smokeMat = new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: PUFF_FS, uniforms: { ...puffUniforms, uAlpha: { value: 0.62 } },
    transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  const smokes = makePool(40, { aPos: 3, aSize: 2, aInfo: 4 }, smokeMat);
  smokes.mesh.renderOrder = 3;
  object.add(puffs.mesh, smokes.mesh);
  // the faint red smoke: its own pool (aInfo.w: how thick this wisp is, not turned)
  const hazeMat = new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: HAZE_FS, transparent: true, depthWrite: false,
    premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uC0: { value: col(look.haze[0]) }, uC1: { value: col(look.haze[1]) }, uTime: DU.uTime, uA: { value: 1 } } });
  const hazes = makePool(70, { aPos: 3, aSize: 2, aInfo: 4 }, hazeMat);
  hazes.mesh.renderOrder = 3;
  object.add(hazes.mesh);
  function wisp(x, y, z, size, life, thick) {
    if (hazes.list.length >= hazes.max) hazes.list.shift();
    hazes.list.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.35 + Math.random() * 0.45, (Math.random() - 0.5) * 0.3), size, life, age: 0, dice: Math.random(), thick, ph: Math.random() * 6.28 });
  }
  // kind 0 dust, 1 smoke, 2 green flame
  function puff(x, y, z, vx, vy, vz, size, grow, life, kind) {
    const pool = kind === 1 ? smokes : puffs;
    if (pool.list.length >= pool.max) pool.list.shift();
    pool.list.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), size, grow, life, age: 0, kind, dice: Math.random(), turn: (Math.random() - 0.5) * 1.2, spin: (Math.random() - 0.5) * 1.5 });
  }
  const sparkMat = new THREE.ShaderMaterial({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true });
  const sparks = makePool(420, { aPos: 3, aVel: 3, aInfo: 4 }, sparkMat);
  sparks.mesh.renderOrder = 4;
  object.add(sparks.mesh);
  const green = col(look.spark), ember = col(look.ember);
  function spark(x, y, z, vx, vy, vz, size, life, hot = false) {
    if (sparks.list.length >= sparks.max) sparks.list.shift();
    sparks.list.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), size, life, age: 0, hot, ph: Math.random() * 6.28 });
  }

  // ---- swirls of light round the bud, and the green bolts
  const arcs = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide,
      uniforms: { uColor: { value: col(look.arc) }, uHot: { value: col(look.rim) }, uA: { value: 0 } } });
    const mesh = new THREE.Mesh(arcGeometry(1.1 + rng() * 0.6, 1.9 + rng() * 0.5), m);
    mesh.renderOrder = 5; mesh.frustumCulled = false;
    const pivot = new THREE.Group(); pivot.add(mesh);
    object.add(pivot);
    arcs.push({ pivot, mesh, m, speed: (i % 2 ? -1 : 1) * (2.6 + rng() * 1.6), y: 0.9 + i * 0.45 + rng() * 0.2, tilt: (rng() - 0.5) * 0.5, ph: rng() * 6.28 });
  }
  const BOLTS = 4, BP = 12;
  const boltPos = new Float32Array(BOLTS * BP * 2 * 3), boltGlow = new Float32Array(BOLTS * BP * 2 * 2), boltIdx = [];
  for (let b = 0; b < BOLTS; b++) for (let i = 0; i < BP - 1; i++) { const a = (b * BP + i) * 2; boltIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3).setUsage(THREE.DynamicDrawUsage));
  boltGeo.setAttribute('aGlow', new THREE.BufferAttribute(boltGlow, 2));
  boltGeo.setIndex(boltIdx);
  for (let k = 0; k < BOLTS * BP; k++) { boltGlow[k * 4] = (k % BP) / (BP - 1); boltGlow[k * 4 + 1] = -1; boltGlow[k * 4 + 2] = (k % BP) / (BP - 1); boltGlow[k * 4 + 3] = 1; }
  const boltMat = new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: BOLT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide,
    uniforms: { uColor: { value: col(look.bolt) }, uA: { value: 0 } } });
  const boltMesh = new THREE.Mesh(boltGeo, boltMat);
  boltMesh.renderOrder = 6; boltMesh.frustumCulled = false; boltMesh.visible = false;
  object.add(boltMesh);
  const bolts = [];
  function layBolts() {
    bolts.length = 0;
    for (let b = 0; b < BOLTS; b++) {
      const a = Math.random() * 6.28, r0 = (0.25 + Math.random() * 0.5) * R;
      bolts.push({ from: new THREE.Vector3(Math.sin(a) * r0, 0.1, Math.cos(a) * r0), dir: new THREE.Vector3(Math.sin(a) * (0.4 + Math.random() * 0.5), 1, Math.cos(a) * (0.4 + Math.random() * 0.5)).normalize(), len: (2.2 + Math.random() * 2.4) * K, at: M.burst - 0.05 + b * 0.07 + Math.random() * 0.05 });
    }
  }
  const camLocal = new THREE.Vector3();
  function drawBolts(T, camera) {
    let any = false;
    camLocal.copy(camera.position).sub(origin);
    bolts.forEach((bo, b) => {
      const age = T - bo.at, on = age > 0 && age < 0.32;
      const flick = Math.floor(T * 22 + b * 3);
      const r3 = mulberry32(flick * 31 + b * 7);
      for (let i = 0; i < BP; i++) {
        const u = i / (BP - 1), p = tq.copy(bo.from).addScaledVector(bo.dir, u * bo.len);
        if (i > 0 && i < BP - 1) { p.x += (r3() - 0.5) * 0.7 * K; p.y += (r3() - 0.5) * 0.3 * K; p.z += (r3() - 0.5) * 0.7 * K; }
        const view = tv.copy(camLocal).sub(p).normalize(), w = (on ? 0.09 * (1 - u * 0.6) : 0) * K;
        const across = tn.crossVectors(bo.dir, view).normalize().multiplyScalar(w);
        const k = (b * BP + i) * 2;
        boltPos.set([p.x - across.x, p.y - across.y, p.z - across.z, p.x + across.x, p.y + across.y, p.z + across.z], k * 3);
      }
      if (on) any = true;
    });
    boltGeo.attributes.position.needsUpdate = true;
    boltMesh.visible = any;
    boltMat.uniforms.uA.value = any ? 0.85 + 0.15 * Math.sin(T * 90) : 0;
  }

  // ---- the run of it
  const me = { object, shake: 0, busy: false, event, update, setSun, dispose };
  let T = 0, running = false, cancelled = -1, fired = {};
  function once(key, when, fn) { if (T >= when && !fired[key]) { fired[key] = true; fn(); } }
  function setSun(v) { sun.copy(v).normalize(); V.material.uniforms.uSun.value.copy(sun); }
  function event(e) {
    if (e.move !== 'thicket') return;
    if (e.type === 'warn' && e.shape) {
      origin.set(e.shape.x, e.shape.y, e.shape.z);
      R = e.shape.radius; K = R / M.radius;
      object.position.copy(origin);
      layDisc(); layVines(); layBolts(); layWall(); layPlates();
      T = M.warn; running = true; cancelled = -1; fired = {};
      object.visible = true; me.busy = true;
    } else if (e.type === 'cancel' && running) cancelled = T;
  }
  const W = new THREE.Vector3();       // (scratch: a world point)
  function update(dt, camera) {
    if (!me.busy) return;
    T += dt;
    const t = T, gone = cancelled >= 0 ? sstep(cancelled, cancelled + 0.35, t) : 0, keep = 1 - gone;
    DU.uTime.value += dt;

    // the ground's light: the warm glow; the ring opening and filling; it fades once the vines are up and gone
    const open = outBack(seg(t, M.warn + 0.35, M.warn + 0.85)), fillK = seg(t, M.warn + 0.35, M.hit);
    const warnA = sstep(M.warn + 0.3, M.warn + 0.45, t) * (1 - 0.2 * sstep(M.hit, M.hit + 0.4, t)) * (1 - sstep(M.sink + 0.1, M.burst + 0.2, t)) * keep;
    DU.uGlow.value = sstep(M.warn, M.warn + 0.4, t) * (1 - sstep(M.burst, M.burst + 0.4, t)) * keep;
    DU.uWarn.value.set(Math.min(open, 1.06), fillK, warnA);
    // the cracks run out from the roots while it gathers, glowing; cooling once the vines have sunk
    const crackRun = 0.3 + 0.82 * sstep(M.warn + 1.0, M.hit - 0.1, t);
    const heat = sstep(M.warn + 1.0, M.warn + 1.3, t) * (1 - 0.35 * sstep(M.hit + 0.5, M.sink, t)) * (1 - sstep(M.sink + 0.2, M.burst + 0.6, t)) * keep;
    DU.uCrack.value.set(t > M.warn + 1.0 ? crackRun : 0, heat + 0.5 * pulse(t, M.hit - 0.05, M.hit, M.hit + 0.05, M.hit + 0.4) * keep);
    // the broken earth, as the vines come up; scorched after; then the grass comes back
    DU.uEarth.value.set(sstep(M.hit - 0.05, M.hit + 0.15, t) * (1 - sstep(M.burst + 0.5, M.burst + 2.1, t)) * keep, sstep(M.burst - 0.2, M.burst + 0.4, t));
    // the green: spreading from under the bud as the vines sink, a ring running out as it bursts
    const splash = sstep(M.sink + 0.15, M.burst + 0.15, t), splashA = sstep(M.sink + 0.15, M.sink + 0.3, t) * (1 - sstep(M.burst + 0.3, M.burst + 1.3, t)) * keep;
    DU.uSplash.value.set(splash * 0.95, splashA, t > M.burst ? (t - M.burst) * 2.6 : -1);

    // the wall of light round the rim: up as the ring fills, a flare as the vines burst, down as they sink
    const wallA = sstep(M.warn + 0.9, M.hit - 0.4, t) * (0.55 + 0.45 * fillK) * (1 - 0.35 * sstep(M.hit + 0.3, M.hit + 1.0, t)) * (1 - sstep(M.sink - 0.2, M.sink + 0.4, t)) * keep;
    wall.visible = wallA > 0.002;
    wallMat.uniforms.uA.value = wallA;
    wallMat.uniforms.uOpen.value = Math.min(open, 1.06);
    wallMat.uniforms.uFlare.value = pulse(t, M.hit - 0.05, M.hit, M.hit + 0.1, M.hit + 0.6);
    // the plates: up as the vines burst, rocking while they writhe, down with them
    const PU = plateMat.uniforms;
    PU.uT.value = t; PU.uSink.value = Math.max(sstep(M.sink, M.burst, t), gone); PU.uWob.value = sstep(M.hit + 0.3, M.hit + 0.6, t) * (1 - sstep(M.sink - 0.3, M.sink, t));
    PU.uGlow.value = warnA; PU.uHeat.value = Math.max(heat, 0.4 * warnA);
    plates.visible = t > M.hit - 0.1 && PU.uSink.value < 0.999;

    // the vines
    let anyVine = false, heatV = 0;
    vineSpecs.forEach((s, i) => {
      const rise = outBack(seg(t, s.rise, s.rise + s.grow)), sink = sstep(s.sinkAt, s.sinkAt + 0.3, t);
      let g = t < s.rise ? 0 : rise * (1 - sink * sink);
      g *= keep;
      const writhe = sstep(s.rise + s.grow, s.rise + s.grow + 0.4, t) * (1 - sink);
      if (g > 0.002) anyVine = true;
      buildVine(i, s, g, writhe, t);
      // bursting up: dust, flying rock, rubble heaved up round its foot, sparks
      if (!s.burst && t >= s.rise && keep > 0.5) {
        s.burst = true;
        const fx0 = origin.x + s.foot.x, fz0 = origin.z + s.foot.z, gy = groundAt(fx0, fz0) - origin.y;
        const out = s.plane;
        for (let k = 0; k < (s.spear ? 2 : 3); k++) {
          const a = Math.random() * 6.28, sp = 1 + Math.random() * 2;
          puff(s.foot.x + Math.sin(a) * 0.3, gy + 0.3, s.foot.z + Math.cos(a) * 0.3, Math.sin(a) * sp * K + out.x, 1.2 + Math.random() * 2, Math.cos(a) * sp * K + out.z, (0.45 + Math.random() * 0.4) * K, 1.9, 0.7 + Math.random() * 0.5, 0);
        }
        for (let k = 0; k < (s.spear ? 4 : 8); k++) {
          const a = Math.random() * 6.28, sp = (1 + Math.random() * 3.5) * K;
          stone(s.foot.x, gy + 0.2, s.foot.z, Math.sin(a) * sp, (4.5 + Math.random() * 5.5) * Math.sqrt(K), Math.cos(a) * sp, (0.07 + Math.random() * 0.14) * K);
        }
        for (let k = 0; k < (s.spear ? 3 : 6); k++) {
          const a = (k / 6) * 6.28 + Math.random(), rr = s.thick * (1.6 + Math.random() * 1.4);
          stone(s.foot.x + Math.sin(a) * rr, gy, s.foot.z + Math.cos(a) * rr, Math.sin(a) * 0.6, 2 + Math.random() * 1.5, Math.cos(a) * 0.6, (0.14 + Math.random() * 0.2) * K, 'stay', s.sinkAt + 0.25);
        }
        for (let k = 0; k < 10; k++) spark(s.foot.x, gy + 0.3, s.foot.z, (Math.random() - 0.5) * 5, 3 + Math.random() * 6, (Math.random() - 0.5) * 5, 0.05 + Math.random() * 0.04, 0.5 + Math.random() * 0.5, Math.random() < 0.4);
      }
      heatV = Math.max(heatV, 1 - seg(t, s.rise, s.rise + 0.9));
    });
    V.material.uniforms.uHeat.value = t > M.hit ? heatV : 0;
    V.mesh.visible = V.outline.visible = anyVine;
    V.line.uniforms.uWidth.value = 0.05 * K;
    V.geometry.attributes.position.needsUpdate = true; V.geometry.attributes.normal.needsUpdate = true; V.geometry.attributes.aRad.needsUpdate = true;

    // pebbles hopping and red-hot embers while the ground cracks; green sparks while the vines are up
    if (keep > 0.5 && t > M.warn + 1.0 && t < M.hit) {
      const k = sstep(M.warn + 1.0, M.hit, t);
      if (Math.random() < dt * (10 + 30 * k)) { const a = Math.random() * 6.28, r = (0.3 + Math.random() * 0.8 * crackRun) * R; stone(Math.sin(a) * r, groundAt(origin.x + Math.sin(a) * r, origin.z + Math.cos(a) * r) - origin.y + 0.05, Math.cos(a) * r, (Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 2.2 * k, (Math.random() - 0.5) * 0.6, (0.04 + Math.random() * 0.06) * K); }
      if (Math.random() < dt * (8 + 26 * k)) { const a = Math.random() * 6.28, r = (0.14 + Math.random() * 0.22) * R; spark(Math.sin(a) * r, lift + 0.2 + Math.random() * 1.2, Math.cos(a) * r, Math.sin(a) * 0.5, 2.5 + Math.random() * 2.5, Math.cos(a) * 0.5, 0.08 + Math.random() * 0.06, 0.35 + Math.random() * 0.35, true); }
      if (Math.random() < dt * (12 + 40 * k)) { const a = Math.random() * 6.28, r = (0.3 + Math.random() * 0.7 * crackRun) * R; spark(Math.sin(a) * r, lift + 0.05, Math.cos(a) * r, (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 2, (Math.random() - 0.5) * 0.8, 0.04 + Math.random() * 0.03, 0.5 + Math.random() * 0.4, true); }
    }
    if (keep > 0.5 && t > M.hit && t < M.sink + 0.3) {
      if (Math.random() < dt * 45) {
        const s = vineSpecs[Math.floor(Math.random() * vineSpecs.length)], u = Math.random() * 0.8;
        const j = Math.floor(u * RINGS), base = V.vines[vineSpecs.indexOf(s)].base + j * SIDES;
        if (V.rad[base] > 0) spark(V.pos[base * 3], V.pos[base * 3 + 1], V.pos[base * 3 + 2], (Math.random() - 0.5) * 1.5, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 1.5, 0.06 + Math.random() * 0.04, 0.7 + Math.random() * 0.7);
      }
      if (Math.random() < dt * 4) { const a = Math.random() * 6.28, r = (0.4 + Math.random() * 0.4) * R; puff(Math.sin(a) * r, lift + 0.25, Math.cos(a) * r, Math.sin(a) * 0.6, 0.8, Math.cos(a) * 0.6, (0.4 + Math.random() * 0.35) * K, 1.6, 1.0, 0); }
    }
    // the faint red smoke drifting up off the ring
    {
      const k = sstep(M.warn + 0.4, M.warn + 1.0, t) * (1 - sstep(M.sink - 0.4, M.sink + 0.1, t)) * keep;
      const rate = k * (5 + 9 * fillK) * (t > M.hit ? 0.7 : 1);
      if (Math.random() < dt * rate) {
        const a = Math.random() * 6.28, r = Math.sqrt(0.04 + Math.random() * 0.9) * R * Math.min(open, 1), x = Math.sin(a) * r, z = Math.cos(a) * r;
        wisp(x, groundAt(origin.x + x, origin.z + z) - origin.y + lift + 0.3 * K, z, (1.3 + Math.random() * 1.2) * K, 1.8 + Math.random() * 1.2, (0.6 + 0.4 * fillK) * (t > M.hit ? 0.7 : 1));
      }
      hazeMat.uniforms.uA.value = keep;
    }
    // a ring of dust as they all burst up together
    once('dust', M.hit + 0.05, () => {
      if (keep < 0.5) return;
      for (let k = 0; k < 11; k++) { const a = (k / 11) * 6.28 + Math.random() * 0.4, r = (0.6 + Math.random() * 0.3) * R; puff(Math.sin(a) * r, lift + 0.3, Math.cos(a) * r, Math.sin(a) * 2.2 * K, 0.7 + Math.random(), Math.cos(a) * 2.2 * K, (0.5 + Math.random() * 0.45) * K, 1.8, 0.7 + Math.random() * 0.4, 0); }
    });
    // the burst of green: flames, smoke, rock, a spray of sparks, bolts
    once('green', M.burst - 0.06, () => {
      if (keep < 0.5) return;
      for (let k = 0; k < 22; k++) {
        const a = Math.random() * 6.28, r = (0.2 + Math.random() * 0.65) * R, x = Math.sin(a) * r, z = Math.cos(a) * r;
        puff(x, lift + 0.4 * K, z, Math.sin(a) * 1.2, 4 + Math.random() * 3.5, Math.cos(a) * 1.2, (0.8 + Math.random() * 0.8) * K, 1.35, 0.4 + Math.random() * 0.3, 2);
      }
      for (let k = 0; k < 9; k++) { const a = Math.random() * 6.28, r = (0.3 + Math.random() * 0.5) * R; puff(Math.sin(a) * r, lift + 0.5, Math.cos(a) * r, Math.sin(a) * 1.4, 0.7 + Math.random() * 0.8, Math.cos(a) * 1.4, (0.7 + Math.random() * 0.6) * K, 1.9, 1.1 + Math.random() * 0.7, 1); }
      for (let k = 0; k < 16; k++) { const a = Math.random() * 6.28, r = (0.2 + Math.random() * 0.6) * R; stone(Math.sin(a) * r, lift + 0.2, Math.cos(a) * r, Math.sin(a) * (2 + Math.random() * 3) * K, (6 + Math.random() * 5) * Math.sqrt(K), Math.cos(a) * (2 + Math.random() * 3) * K, (0.08 + Math.random() * 0.15) * K); }
      for (let k = 0; k < 90; k++) { const a = Math.random() * 6.28, r = Math.random() * 0.8 * R, sp = 1 + Math.random() * 5; spark(Math.sin(a) * r, lift + 0.3 + Math.random(), Math.cos(a) * r, Math.sin(a) * sp, 2 + Math.random() * 7, Math.cos(a) * sp, 0.05 + Math.random() * 0.05, 0.8 + Math.random() * 1.2); }
    });
    // green motes drifting up a while after
    if (keep > 0.5 && t > M.burst && t < M.burst + 2.2 && Math.random() < dt * 30 * (1 - seg(t, M.burst, M.burst + 2.2))) {
      const a = Math.random() * 6.28, r = Math.random() * 0.75 * R;
      spark(Math.sin(a) * r, lift + 0.2 + Math.random() * 1.5, Math.cos(a) * r, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6, 0.04 + Math.random() * 0.03, 1.2 + Math.random());
    }

    // the swirls round the bud: while it gathers and the vines writhe
    const arcA = sstep(M.warn + 1.0, M.warn + 1.5, t) * (1 - sstep(M.sink, M.burst, t)) * keep;
    arcs.forEach((a, i) => {
      a.pivot.rotation.set(a.tilt, a.ph + t * a.speed, a.tilt * 0.6);
      a.pivot.position.y = a.y * K + 0.15 * Math.sin(t * 3 + i);
      a.pivot.scale.setScalar(K * (1 + 0.08 * Math.sin(t * 5 + i)));
      const flick = 0.55 + 0.45 * Math.max(0, Math.sin(t * (4 + i) + a.ph));
      a.m.uniforms.uA.value = arcA * flick * (1 + 0.6 * pulse(t, M.hit - 0.05, M.hit, M.hit + 0.05, M.hit + 0.4));
      a.mesh.visible = arcA > 0.001;
    });
    drawBolts(t, camera);

    // stones
    let ri = 0;
    for (let i = rocks.length - 1; i >= 0; i--) {
      const s = rocks[i];
      s.age += dt;
      const gy = groundAt(origin.x + s.p.x, origin.z + s.p.z) - origin.y + (s.kind === 'stay' ? 0.02 : 0);
      if (!s.lying) {
        s.v.y -= 22 * dt; s.p.addScaledVector(s.v, dt); s.rot.addScaledVector(s.spin, dt);
        if (s.p.y < gy + s.size * 0.4 && s.v.y < 0) {
          s.p.y = gy + s.size * 0.4;
          if (!s.bounced && s.kind === 'fly' && s.v.y < -2.5) { s.bounced = true; s.v.y *= -0.32; s.v.x *= 0.5; s.v.z *= 0.5; s.spin.multiplyScalar(0.5); }
          else { s.lying = true; s.v.set(0, 0, 0); }
        }
      }
      let k = 1;
      if (s.kind === 'fly') k = 1 - seg(s.age, s.life - 0.35, s.life);
      else { k = 1 - sstep(s.until, s.until + 0.35, t); if (t > s.until) s.p.y -= dt * 0.8; }
      k *= keep;
      if (k <= 0.001 || (s.kind === 'fly' && s.age > s.life)) { rocks.splice(i, 1); continue; }
    }
    for (const s of rocks) {
      let k = s.kind === 'fly' ? 1 - seg(s.age, s.life - 0.35, s.life) : 1 - sstep(s.until, s.until + 0.35, t);
      k *= keep * Math.min(1, s.age * 12);
      qt.setFromEuler(eul.set(s.rot.x, s.rot.y, s.rot.z));
      sc.copy(s.squash).multiplyScalar(s.size * k);
      mtx.compose(s.p, qt, sc);
      rockMesh.setMatrixAt(ri++, mtx);
    }
    rockMesh.count = ri; rockMesh.instanceMatrix.needsUpdate = true;

    // puffs (and smoke)
    for (const pool of [puffs, smokes]) {
      const A = pool.arrays;
      let n = 0;
      for (let i = pool.list.length - 1; i >= 0; i--) { const p = pool.list[i]; p.age += dt; if (p.age >= p.life) pool.list.splice(i, 1); }
      for (const p of pool.list) {
        const k = p.age / p.life, drag = p.kind === 2 ? 1.5 : 2.6;
        p.v.multiplyScalar(Math.exp(-drag * dt));
        if (p.kind === 2) p.v.y += 3 * dt; else if (p.kind === 1) p.v.y += 0.8 * dt;
        p.p.addScaledVector(p.v, dt);
        const s = p.size * (1 + (p.grow - 1) * (1 - Math.pow(1 - k, 2.2))) * Math.min(1, p.age * 9) * keep;
        W.copy(p.p).add(origin);
        A.aPos.set([W.x, W.y, W.z], n * 3);
        A.aSize.set(p.kind === 2 ? [s * 0.55, s * 1.45] : [s, s * 0.92], n * 2);
        A.aInfo.set([p.kind, p.dice, Math.min(0.999, k * (1 + gone)), p.turn + p.spin * p.age], n * 4);
        n++;
      }
      pool.g.instanceCount = n;
      for (const name in A) pool.g.attributes[name].needsUpdate = true;
    }
    // the faint red smoke: rising slowly, swirling, spreading
    {
      const A = hazes.arrays;
      let n = 0;
      for (let i = hazes.list.length - 1; i >= 0; i--) { const p = hazes.list[i]; p.age += dt; if (p.age >= p.life) hazes.list.splice(i, 1); }
      for (const p of hazes.list) {
        const k = p.age / p.life;
        p.v.x += Math.sin(p.age * 1.3 + p.ph) * 0.25 * dt; p.v.z += Math.cos(p.age * 1.1 + p.ph) * 0.25 * dt;
        p.p.addScaledVector(p.v, dt);
        const s = p.size * (1 + 0.9 * k);
        W.copy(p.p).add(origin);
        A.aPos.set([W.x, W.y, W.z], n * 3);
        A.aSize.set([s, s * 0.85], n * 2);
        A.aInfo.set([0, p.dice, k, p.thick], n * 4);
        n++;
      }
      hazes.g.instanceCount = n;
      for (const name in A) hazes.g.attributes[name].needsUpdate = true;
    }
    // sparks
    {
      const A = sparks.arrays;
      let n = 0;
      for (let i = sparks.list.length - 1; i >= 0; i--) { const p = sparks.list[i]; p.age += dt; if (p.age >= p.life) sparks.list.splice(i, 1); }
      for (const p of sparks.list) {
        const k = p.age / p.life;
        p.v.multiplyScalar(Math.exp(-2.2 * dt));
        p.v.y += (p.hot ? -2.5 : 1.2) * dt;
        p.v.x += Math.sin(p.age * 5 + p.ph) * 1.5 * dt; p.v.z += Math.cos(p.age * 4 + p.ph) * 1.5 * dt;
        p.p.addScaledVector(p.v, dt);
        const tw = (0.65 + 0.35 * Math.sin(p.age * 30 + p.ph)) * (1 - k * k) * Math.min(1, p.age * 20) * keep;
        const c = p.hot ? ember : green;
        W.copy(p.p).add(origin);
        A.aPos.set([W.x, W.y, W.z], n * 3);
        A.aVel.set([p.v.x, p.v.y, p.v.z], n * 3);
        A.aInfo.set([c.r * tw, c.g * tw, c.b * tw, p.size * K], n * 4);
        n++;
      }
      sparks.g.instanceCount = n;
      for (const name in A) sparks.g.attributes[name].needsUpdate = true;
    }

    // the ground's jolts, for the camera
    me.shake = Math.max(0.12 * sstep(M.warn + 1.0, M.hit, t) * (t < M.hit ? 1 : 0), pulse(t, M.hit - 0.02, M.hit + 0.02, M.hit + 0.1, M.hit + 0.6), 0.1 * (t > M.hit && t < M.sink ? 1 : 0),
      0.55 * pulse(t, M.hit + 0.85, M.hit + 0.9, M.hit + 0.95, M.hit + 1.3), 0.8 * pulse(t, M.burst - 0.05, M.burst, M.burst + 0.05, M.burst + 0.5)) * keep;

    // all over: everything gone
    const end = cancelled >= 0 ? cancelled + 0.4 : M.burst + 3.2;
    if (t > end && !rocks.length && !puffs.list.length && !smokes.list.length && !hazes.list.length && !sparks.list.length) { me.busy = false; running = false; object.visible = false; me.shake = 0; }
  }
  function dispose() {
    crackMap.dispose(); discGeo.dispose(); discMat.dispose(); V.geometry.dispose(); V.material.dispose(); V.line.dispose();
    rockGeo.dispose(); rockMat.dispose(); puffs.g.dispose(); puffMat.dispose(); smokes.g.dispose(); smokeMat.dispose(); hazes.g.dispose(); hazeMat.dispose(); sparks.g.dispose(); sparkMat.dispose();
    for (const a of arcs) { a.mesh.geometry.dispose(); a.m.dispose(); }
    boltGeo.dispose(); boltMat.dispose(); wallGeo.dispose(); wallMat.dispose(); plates.geometry.dispose(); plateMat.dispose();
  }
  setSun(sun);
  return me;
}
