/* ==========================================================================
   stylized-nature.js  —  vector-art nature kit for three.js (r170+)
   Ghibli-style meadow assets that share ONE look: flat leaf patches with
   vertical gradient fills, jagged leafy edges, toon-banded light.

   Assets
     createTree({ type, seed, detail })   type: 'broadleaf' | 'oak' | 'pine' | 'birch' | 'sapling'
                                          | 'sakura' | 'maple' | 'apple' | 'orange' | 'giant'
                                          | 'willow' | 'bamboo' | 'cypress' | 'umbrella'
                                          (giant is built at a normal size and stood up spec.scale times bigger)
     createForest([{ kind:'tree'|'bush', type, seed, x, y, z, rotY, scale }, ...])
                                          many plants in ~10 draw calls (use this for dense worlds)
     createBush({ type, seed })           type: 'round' | 'flowering'
     createFlowers({ count, radius, seed, heightAt, colors })
     createRock({ type, seed, moss })     type: 'boulder' | 'stones' | 'slab' | 'standing' | 'river' | 'pebbles' | 'crag'
     createCardCluster({ points, top, bot })  loose leaf-style patches (foam, leafy lips ...)
     createGrass({ count, radius, seed, heightAt, patchiness, clusters })
     createGround({ radius, seed, flat })  -> mesh.userData.heightAt(x, z)

   setHaze({ color, near, far, max })    aerial perspective: far things fade toward the haze colour
   Setup (once per scene)
     renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
     scene.add(createAlphaFix())          // keeps soft leaf edges from showing the page through
     every frame: update(dt)              // wind + time.  setWind(0..1) to calm / blow

   Import map needs "three" and "three/addons/".
   Mobile note: no uniform arrays / indexed loops in any shader (some phone
   GPUs read those wrong) — all per-card colours are baked into attributes.
   ========================================================================== */
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// --------------------------------------------------------------------------
// small helpers
// --------------------------------------------------------------------------
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// raw sRGB triplet: the shaders output these values untouched
const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const lerp = (a, b, t) => a + (b - a) * t;
const range = (rng, a, b) => a + rng() * (b - a);

function hashI(x, y, z, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683) ^ Math.imul(s | 0, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const c = (dx, dy, dz) => hashI(ix + dx, iy + dy, iz + dz, s);
  return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
              lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
function fbm3(x, y, z, s, oct = 3) {
  let a = 0.5, f = 1, sum = 0, n = 0;
  for (let o = 0; o < oct; o++) { sum += a * vnoise3(x * f, y * f, z * f, s + o * 17); n += a; a *= 0.5; f *= 2.03; }
  return sum / n;
}

// --------------------------------------------------------------------------
// shared time / wind
// --------------------------------------------------------------------------
const shared = {
  uTime: { value: 0 }, uWind: { value: 1 }, uDebug: { value: 0 },
  // aerial perspective: far things fade toward the haze colour (off by default: uHazeMax = 0)
  uHaze: { value: rgb('#cde6f2') }, uHazeNear: { value: 60 }, uHazeFar: { value: 240 }, uHazeMax: { value: 0 },
};
let windTarget = 1;
export const uniforms = shared;
export function setWind(v) { windTarget = typeof v === 'number' ? v : (v ? 1 : 0); }
export function setHaze({ color, near, far, max } = {}) {
  if (color) shared.uHaze.value.copy(rgb(color));
  if (near !== undefined) shared.uHazeNear.value = near;
  if (far !== undefined) shared.uHazeFar.value = far;
  if (max !== undefined) shared.uHazeMax.value = max;
}
export function update(dt) {
  dt = Math.min(dt, 0.05);
  shared.uTime.value += dt;
  shared.uWind.value += (windTarget - shared.uWind.value) * Math.min(1, dt * 3);
}

const VCOMMON = /* glsl */`
uniform float uTime;
uniform float uWind;
uniform float uDebug;
uniform float uHazeNear, uHazeFar, uHazeMax;
varying float vHaze;
float hazeAt(vec3 viewPos) { return uHazeMax * smoothstep(uHazeNear, uHazeFar, length(viewPos)); }
float objPhase() { return modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.23; }
float objScale() { return length(modelMatrix[0].xyz); }
vec3 windOffset(vec3 p, float ph) {
  float k = max(p.y - 1.2, 0.0);
  k = k * k * 0.0035 * uWind;
  float s = sin(uTime * 0.85 + p.y * 0.25 + ph) * 0.65 + sin(uTime * 1.9 + p.x * 0.6 + p.z * 0.4 + ph * 1.7) * 0.22;
  float c = cos(uTime * 0.63 + p.y * 0.21 + ph) * 0.45;
  return vec3(s, 0.0, c) * k;
}`;
const HAZEF = /* glsl */`
uniform vec3 uHaze;
varying float vHaze;`;
// The shaders' noise. Its random numbers come from whole-number arithmetic that a 32-bit float does exactly (nothing over
// 83 000), so they are the same numbers on every graphics chip, however it rounds. (They used to be fract(sin(x) * 43758.5): a
// phone's chip may round x differently in two places of one shader, the sine blows that up into a different number, and two
// neighbouring squares of the noise no longer agree on the corner they share: straight seams where a tone made of noise
// jumps, seen on Android on the dirt paths. A computer drew it smooth.)
//   noise2(p)   smooth noise 0..1, one square to a unit of p
//   hash2(p)    a random number 0..1 for a square: p is a whole number, or one plus a fixed offset (told apart to 1/16)
// m289, perm289: the arithmetic under them, for a shader's own noise (the bark's noise3 below).
const NOISE = /* glsl */`
float m289(float x) { return x - floor((x + 0.5) * (1.0 / 289.0)) * 289.0; }      // a whole number's remainder by 289 (the half keeps the floor clear of a whole number)
vec4 m289(vec4 x) { return x - floor((x + 0.5) * (1.0 / 289.0)) * 289.0; }
float perm289(float x) { return m289(m289(x * 34.0 + 1.0) * x); }                  // 0..288 shuffled
vec4 perm289(vec4 x) { return m289(m289(x * 34.0 + 1.0) * x); }
float hash2(vec2 p) { p = floor(p * 16.0 + 0.5); return perm289(m289(perm289(m289(p.x)) + m289(p.y))) * (1.0 / 289.0); }
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec4 c = m289(vec4(i.x, i.x + 1.0, i.y, i.y + 1.0));                             // the square's two columns and two rows
  vec4 h = perm289(m289(perm289(c.xyxy) + c.zzww)) * (1.0 / 289.0);                // its four corners, all at once
  return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}`;

// --------------------------------------------------------------------------
// palettes (sampled from the reference illustration, then extended)
// each tone = gradient inside one patch: top colour -> bottom colour, dark -> bright
// --------------------------------------------------------------------------
export const PALETTES = {
  broad: {
    top: ['#273a1b', '#466533', '#728e3e', '#a6b822', '#c4d126', '#dde43a'],
    bot: ['#1f2e15', '#385427', '#5f7c35', '#879d1c', '#9cb01d', '#bccb24'],
  },
  pine: {
    top: ['#1b2d1e', '#2e4d2f', '#4b7339', '#7b9b39', '#9fba3b', '#c3d447'],
    bot: ['#14231a', '#254128', '#3d6331', '#5f8434', '#80a236', '#a3bf3b'],
  },
  birch: {
    top: ['#2e431e', '#4f6f33', '#7f9b3e', '#b4c42b', '#d1db37', '#e9ed5c'],
    bot: ['#243819', '#41602b', '#6a8737', '#94aa24', '#abbe26', '#cad630'],
  },
  // accent crowns: same six-step gradient idea, other hues
  sakura: {
    top: ['#7a3f58', '#b0607d', '#d9879f', '#efa9bd', '#f8c9d5', '#fde6ec'],
    bot: ['#5f3047', '#94506a', '#c47189', '#e294aa', '#f0b5c4', '#f9d6df'],
  },
  maple: {
    top: ['#6a1f1c', '#a2321f', '#d1502a', '#ec7a2c', '#f5a63a', '#f9cf5a'],
    bot: ['#521716', '#83281b', '#b14223', '#d26326', '#e38e30', '#efb847'],
  },
  willow: {
    top: ['#2f4420', '#557434', '#86a043', '#b3c54f', '#cfdb6a', '#e6eea0'],
    bot: ['#253719', '#46622b', '#708c37', '#99ad3d', '#b5c652', '#d0dc82'],
  },
  bamboo: {
    top: ['#26401f', '#3f6a2c', '#6c9a36', '#9fc23e', '#c3db4f', '#e0ee7a'],
    bot: ['#1d3319', '#335826', '#57822e', '#82a632', '#a4c23d', '#c4d85e'],
  },
  cypress: {
    top: ['#16261d', '#24402d', '#3a5f36', '#5c8040', '#86a347', '#adc35a'],
    bot: ['#101d17', '#1c3324', '#2e4d2c', '#486836', '#6b8a3b', '#8fa948'],
  },
};
// fraction of cards that end up darker than each tone step (tuned on the reference tree)
const TONE_QUANTILES = [0.102, 0.271, 0.537, 0.624, 0.812];
const BUSH_QUANTILES = [0.17, 0.42, 0.68, 0.79, 0.93];      // bushes are seen from above -> keep them deeper green
const SUN = new THREE.Vector3(-0.12, 1, 0.3).normalize();
const SHADE_WEIGHTS = [0.58, 0.32, 0.12]; // height in crown, top of lump, sun

// --------------------------------------------------------------------------
// procedural masks (canvas -> texture), cached
// --------------------------------------------------------------------------
const cache = {};
function canvasTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}
const LEAF_STYLES = {
  // body radius, lobes [count, dist a-b, radius a-b], fringe [count, length a-b, width ratio a-b]
  broad:  { body: 0.68, lobes: [7, 0.30, 0.56, 0.36, 0.56], fringe: [48, 0.13, 0.25, 0.50, 0.75], seed: 92 },
  needle: { body: 0.60, lobes: [6, 0.28, 0.50, 0.30, 0.46], fringe: [110, 0.16, 0.34, 0.20, 0.32], seed: 99 },
  soft:   { body: 0.62, lobes: [8, 0.30, 0.56, 0.30, 0.48], fringe: [70, 0.10, 0.19, 0.55, 0.80], seed: 57 },
  // round petal-like fringe: a puff of blossom
  blossom: { body: 0.66, lobes: [9, 0.30, 0.56, 0.30, 0.46], fringe: [80, 0.07, 0.13, 0.80, 1.00], seed: 41 },
  // fewer, sharper points
  maple:  { body: 0.62, lobes: [7, 0.30, 0.56, 0.32, 0.50], fringe: [44, 0.16, 0.30, 0.30, 0.42], seed: 23 },
  // not a patch: hanging strings of narrow leaves (willow curtains), and fans of long drooping blades (bamboo)
  willow: { draw: 'tassel', seed: 64 },
  bamboo: { draw: 'spray', seed: 18 },
};
// one leaf blade along +x: from the stalk (0, 0) to the tip (L, 0), W wide
function bladePath(g, L, W, bend = 0) {
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(L * 0.4, W + bend, L, bend);
  g.quadraticCurveTo(L * 0.4, -W + bend, 0, 0);
  g.fill();
}
function drawTassel(g, rng, ox, oy, C) {
  const strings = 3 + Math.floor(rng() * 2);
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (let s = 0; s < strings; s++) {
    const x0 = ox + C * (0.5 + (s - (strings - 1) / 2) * 0.14 + (rng() - 0.5) * 0.05);
    const y0 = oy + C * 0.05, y1 = oy + C * range(rng, 0.84, 0.95), sway = (rng() - 0.5) * C * 0.1;
    const at = u => [x0 + sway * u * u, lerp(y0, y1, u)];
    g.lineWidth = C * 0.012;
    g.beginPath();
    for (let k = 0; k <= 10; k++) { const [x, y] = at(k / 10); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    const n = 9 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const u = (i + rng() * 0.6) / n, [x, y] = at(u), side = i % 2 ? 1 : -1;
      const L = C * range(rng, 0.12, 0.18) * (1 - u * 0.3);
      g.save(); g.translate(x, y); g.rotate(Math.PI / 2 + side * range(rng, 0.4, 0.75));   // canvas y is down: point down and out
      bladePath(g, L, L * range(rng, 0.26, 0.36));
      g.restore();
    }
  }
}
function drawSpray(g, rng, ox, oy, C) {
  const twigs = 2 + Math.floor(rng() * 2);
  for (let s = 0; s < twigs; s++) {
    const bx = ox + C * range(rng, 0.32, 0.68), by = oy + C * range(rng, 0.2, 0.4);
    const k = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < k; i++) {
      const a = Math.PI * lerp(0.08, 0.92, (i + rng() * 0.7) / k);       // a fan hanging down from the twig
      const L = C * range(rng, 0.26, 0.38);
      g.save(); g.translate(bx, by); g.rotate(a);
      bladePath(g, L, L * range(rng, 0.11, 0.15), L * 0.08 * (a < Math.PI / 2 ? 1 : -1));
      g.restore();
    }
  }
}
function leafMask(style) {
  const key = 'leaf_' + style;
  if (cache[key]) return cache[key];
  const P = LEAF_STYLES[style];
  const S = 512, C = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#fff';
  const rng = mulberry32(P.seed);
  const circ = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  if (P.draw) {
    for (let v = 0; v < 4; v++) {
      const ox = (v % 2) * C, oy = Math.floor(v / 2) * C;
      g.save(); g.beginPath(); g.rect(ox + 6, oy + 6, C - 12, C - 12); g.clip();     // never bleed into the next atlas cell
      (P.draw === 'tassel' ? drawTassel : drawSpray)(g, rng, ox, oy, C);
      g.restore();
    }
    return (cache[key] = canvasTex(cv));
  }
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * C, oy = Math.floor(v / 2) * C, cx = ox + C / 2, cy = oy + C / 2, R = C * 0.28;
    circ(cx, cy, R * P.body);
    const k = P.lobes[0] + Math.floor(rng() * 4);
    for (let i = 0; i < k; i++) {
      const a = i / k * Math.PI * 2 + rng() * 0.7;
      const d = R * range(rng, P.lobes[1], P.lobes[2]);
      circ(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * range(rng, P.lobes[3], P.lobes[4]));
    }
    // fringe leaves anchored on the outline (never floating)
    const img = g.getImageData(ox, oy, C, C).data;
    const edgeAt = a => {
      for (let rr = C * 0.49; rr > 0; rr -= 1) {
        const x = Math.round(C / 2 + Math.cos(a) * rr), y = Math.round(C / 2 + Math.sin(a) * rr);
        if (img[(y * C + x) * 4] > 127) return rr;
      }
      return 0;
    };
    for (let i = 0; i < P.fringe[0]; i++) {
      const a = rng() * Math.PI * 2;
      const d = edgeAt(a) - R * 0.05;
      const L = R * range(rng, P.fringe[1], P.fringe[2]), W = L * range(rng, P.fringe[3], P.fringe[4]);
      g.save();
      g.translate(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      g.rotate(a + (rng() - 0.5) * 1.8);
      g.beginPath();
      g.moveTo(-L * 0.3, 0);
      g.quadraticCurveTo(L * 0.35, W, L, 0);
      g.quadraticCurveTo(L * 0.35, -W, -L * 0.3, 0);
      g.fill();
      g.restore();
    }
  }
  return (cache[key] = canvasTex(cv));
}

// atlas cell c (0..3) drawn so that uv offset = (c%2, floor(c/2)) * 0.5 (canvas is flipped on upload)
const cellOrigin = (c, S, C) => [(c % 2) * C, S - C - Math.floor(c / 2) * C];

// grass tufts drawn like the leaf patches: a low mound with a crown of pointed blades
function grassMask() {
  if (cache.grass) return cache.grass;
  const S = 512, C = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#fff';
  const rng = mulberry32(31);
  for (let c = 0; c < 4; c++) {
    const [ox, oy] = cellOrigin(c, S, C);
    const cx = ox + C / 2, by = oy + C - 10;      // 10px margin: no bleeding between atlas cells
    const rx = C * range(rng, 0.3, 0.38), ry = C * range(rng, 0.2, 0.28);
    // mound body (upper half of an ellipse, sitting on the cell bottom)
    g.beginPath(); g.ellipse(cx, by, rx, ry, 0, Math.PI, Math.PI * 2); g.fill();
    // a few bumps so the body is not a perfect dome
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * range(rng, 1.15, 1.85);
      g.beginPath();
      g.arc(cx + Math.cos(a) * rx * 0.7, by + Math.sin(a) * ry * 0.7, ry * range(rng, 0.45, 0.65), 0, Math.PI * 2);
      g.fill();
    }
    // crown of blades growing out of the outline, tallest in the middle, fanning outward
    const n = 13 + Math.floor(rng() * 6);
    for (let i = 0; i < n; i++) {
      const u = (i + rng() * 0.8) / n;                       // 0 = left, 1 = right
      const a = Math.PI * (1.05 + 0.9 * u);
      const bx = cx + Math.cos(a) * rx * 0.9, byy = by + Math.sin(a) * ry * 0.9;
      const mid = 1 - Math.abs(u - 0.5) * 2;                   // 1 in the middle
      const L = C * (0.16 + 0.3 * mid) * range(rng, 0.7, 1.15);
      const lean = (u - 0.5) * 1.5 + (rng() - 0.5) * 0.5;      // fan out
      const tx = bx + Math.sin(lean) * L, ty = byy - Math.cos(lean) * L;
      const w = C * range(rng, 0.035, 0.06);
      const bend = (rng() - 0.5) * L * 0.25;
      g.beginPath();
      g.moveTo(bx - w, byy + w * 0.6);
      g.quadraticCurveTo((bx + tx) / 2 - w * 0.4 + bend, (byy + ty) / 2, tx, ty);
      g.quadraticCurveTo((bx + tx) / 2 + w * 0.4 + bend, (byy + ty) / 2, bx + w, byy + w * 0.6);
      g.closePath();
      g.fill();
    }
  }
  return (cache.grass = canvasTex(cv));
}

// flower atlas: R = stems/leaves, G = petals, B = flower centres
// cells: 0,1 = flower tufts (stems + heads), 2 = single blossom, 3 = cluster of 3 blossoms
function flowerMask() {
  if (cache.flower) return cache.flower;
  const S = 512, C = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const rng = mulberry32(77);
  const blossom = (x, y, r, petals, rot) => {
    g.fillStyle = '#00ff00';
    for (let i = 0; i < petals; i++) {
      const a = rot + i / petals * Math.PI * 2;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.52, r * 0.3, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#0000ff';
    g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill();
  };
  for (let c = 0; c < 2; c++) {
    const [ox, oy] = cellOrigin(c, S, C);
    const heads = [];
    const n = c === 0 ? 5 : 7;
    g.strokeStyle = '#ff0000'; g.fillStyle = '#ff0000'; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const bx = ox + C * (0.5 + (rng() - 0.5) * 0.2), by = oy + C - 2;
      const tx = ox + C * (0.5 + (rng() - 0.5) * 0.66), ty = oy + C * range(rng, 0.12, 0.5);
      g.lineWidth = C * 0.022;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx, (by + ty) / 2, tx, ty); g.stroke();
      // a leaf on the stem
      const lx = lerp(bx, tx, 0.35), ly = lerp(by, ty, 0.35), side = rng() < 0.5 ? -1 : 1;
      g.beginPath(); g.ellipse(lx + side * C * 0.05, ly, C * 0.06, C * 0.022, side * 0.6, 0, Math.PI * 2); g.fill();
      heads.push([tx, ty]);
    }
    for (const [x, y] of heads) blossom(x, y, C * range(rng, 0.07, 0.1), c === 0 ? 5 : 8, rng() * 6);
  }
  {
    const [ox, oy] = cellOrigin(2, S, C);
    blossom(ox + C / 2, oy + C / 2, C * 0.36, 5, 0.3);
  }
  {
    const [ox, oy] = cellOrigin(3, S, C);
    blossom(ox + C * 0.36, oy + C * 0.4, C * 0.2, 5, 0.1);
    blossom(ox + C * 0.66, oy + C * 0.45, C * 0.18, 5, 0.9);
    blossom(ox + C * 0.5, oy + C * 0.68, C * 0.19, 5, 0.5);
  }
  return (cache.flower = canvasTex(cv));
}

// --------------------------------------------------------------------------
// materials
// --------------------------------------------------------------------------
function leafMaterial(style) {
  const key = 'leafMat_' + style;
  if (cache[key]) return cache[key];
  return (cache[key] = new THREE.ShaderMaterial({
    uniforms: { ...shared, uMask: { value: leafMask(style) } },
    vertexShader: /* glsl */`
      ${VCOMMON}
      attribute vec3 iCenter;
      attribute vec4 iParam;    // x: height in crown 0..1, y: lump tint, z: card tint, w: atlas cell
      attribute vec3 iCard;     // x: rotation, y: size, z: up-ness inside its lump
      attribute float iAspect;
      attribute vec3 iTop;      // baked gradient colours of this card
      attribute vec3 iBot;
      attribute float iS;       // shade value (debug)
      attribute vec4 iBase;     // foot of the plant (mesh space) + its scale; (0,0,0,1) for a single plant
      varying vec2 vUv;
      varying vec3 vTop;
      varying vec3 vBot;
      varying float vG;
      void main() {
        float ph = objPhase() + iBase.x * 0.37 + iBase.z * 0.23;
        float sc = objScale();
        vec3 c = iCenter + windOffset((iCenter - iBase.xyz) / iBase.w, ph) * iBase.w;
        float fl = uWind * (0.25 + iParam.x) * 0.026 * iBase.w;
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        // flutter slides the card across the screen but never changes its depth: if it did, two overlapping cards of
        // different tones would keep swapping which one is in front, and the crown would blink in the wind
        mv.xy += vec2(sin(uTime * 2.1 + iParam.z * 140.0 + ph), sin(uTime * 2.7 + iParam.y * 90.0) * 0.5) * fl * sc;
        float cs = cos(iCard.x), sn = sin(iCard.x);
        vec2 q = position.xy * iCard.y * sc * vec2(iAspect, 1.0 / iAspect);
        vec2 off = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);
        mv.xy += off;                                   // camera-facing card
        vHaze = hazeAt(mv.xyz);
        gl_Position = projectionMatrix * mv;
        // Keep the card's actual depth so leaves cannot cut through nearby wood as the view rotates.
        vG = off.y / (iCard.y * sc * 0.8) + 0.42;       // 0 = bottom of patch, 1 = top
        vUv = uv * 0.5 + vec2(mod(iParam.w, 2.0), floor(iParam.w / 2.0)) * 0.5;
        vTop = iTop;
        vBot = iBot;
        if (uDebug > 0.5) { vTop = vec3(clamp(iS / 1.4, 0.0, 0.97)); vBot = vTop; }
      }`,
    fragmentShader: /* glsl */`
      ${HAZEF}
      uniform sampler2D uMask;
      varying vec2 vUv;
      varying vec3 vTop;
      varying vec3 vBot;
      varying float vG;
      void main() {
        float a = texture2D(uMask, vUv).r;
        float w = max(fwidth(a), 1e-3) * 0.75;
        float alpha = smoothstep(0.5 - w, 0.5 + w, a);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(mix(mix(vBot, vTop, clamp(vG, 0.0, 1.0)), uHaze, vHaze), alpha);
      }`,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  }));
}

function coreMaterial(pal) {
  const key = 'core_' + pal;
  if (cache[key]) return cache[key];
  return (cache[key] = new THREE.ShaderMaterial({
    uniforms: { ...shared, uA: { value: rgb(PALETTES[pal].top[1]) }, uB: { value: rgb(PALETTES[pal].top[0]) } },
    vertexShader: /* glsl */`
      ${VCOMMON}
      attribute float aH;
      attribute vec4 aBase;     // plant foot + scale (batched forests); (0,0,0,1) for a single plant
      varying float vH;
      void main() {
        float ph = objPhase() + aBase.x * 0.37 + aBase.z * 0.23;
        vec3 p = position + windOffset((position - aBase.xyz) / aBase.w, ph) * aBase.w;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vH = aH;
        vHaze = hazeAt(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${HAZEF}
      uniform vec3 uA, uB;
      uniform float uDebug;
      varying float vH;
      void main() { gl_FragColor = vec4(uDebug > 0.5 ? vec3(1.0, 0.0, 0.0) : mix(vH > 0.6 ? uA : uB, uHaze, vHaze), 1.0); }`,
  }));
}

function barkMaterial(spec) {
  const b = spec.bark || ['#7d4c3d', '#5e3832', '#432831'];     // a warm edge of light, the maroon body, a cool plum shade
  const hi = rgb(b[0]).lerp(rgb(spec.barkHi || '#f0c9a0'), 0.4);  // dry-brush highlight laid over the light tone
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uLight: { value: new THREE.Vector3(-0.4, 0.9, 0.5).normalize() },  // the same sun as rocks and clouds (world space)
      uA: { value: rgb(b[0]) }, uB: { value: rgb(b[1]) }, uC: { value: rgb(b[2]) }, uH: { value: hi },
      uMarkCol: { value: rgb(spec.markCol || '#2e2a26') },
      uMarks: { value: spec.marks ? 1 : 0 },
      uShadeY: { value: spec.shadeY ?? 99 },
      uRings: { value: spec.rings || 0 }, uRingCol: { value: rgb(spec.ringCol || '#4a5a28') },    // bamboo nodes (0 = none)
      uMoss: { value: spec.moss || 0 }, uMossA: { value: rgb('#a9bd3c') }, uMossB: { value: rgb('#6c8a35') },  // old wood (0 = none)
    },
    vertexShader: /* glsl */`
      ${VCOMMON}
      attribute vec4 aBase;     // tree foot + scale (batched forests); (0,0,0,1) for a single tree
      attribute vec3 aCtr;      // centre-line the paint strokes are measured from (the trunk's, then each limb's own)
      attribute float aJoin;    // 0..1 how much this spot is still the trunk's wood (the foot of a limb)
      attribute vec3 aAx;       // the trunk's centre-line there (only x and z are used)
      attribute float aCrev;    // 0..1 shadowed hollow: root valleys and the crotch where a limb leaves the trunk
      varying vec3 vN;
      varying vec3 vOP;
      varying vec3 vON;
      varying vec3 vCtr;
      varying vec3 vAx;
      varying float vJoin;
      varying float vCrev;
      void main() {
        vec3 local = (position - aBase.xyz) / aBase.w;
        vec3 p = position + windOffset(local, objPhase() + aBase.x * 0.37 + aBase.z * 0.23) * aBase.w;
        vN = normalize(mat3(modelMatrix) * normal);
        vOP = local;
        vON = normal;
        vCtr = (aCtr - aBase.xyz) / aBase.w;
        vAx = (aAx - aBase.xyz) / aBase.w;
        vJoin = aJoin;
        vCrev = aCrev;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vec4 mv = viewMatrix * wp;
        // Wood writes its real depth, matching the closed geometry from every viewing direction.
        vHaze = hazeAt(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      uniform vec3 uLight, uA, uB, uC, uH, uMarkCol, uRingCol, uMossA, uMossB;
      uniform float uShadeY, uMarks, uDebug, uRings, uMoss;
      varying vec3 vN;
      varying vec3 vOP;
      varying vec3 vON;
      varying vec3 vCtr;
      varying vec3 vAx;
      varying float vJoin;
      varying float vCrev;
      float noise3(vec3 x) {                                              // noise2 with a third number (NOISE's exact arithmetic: the same on every chip)
        vec3 i = floor(x), f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        vec4 c = m289(vec4(i.x, i.x + 1.0, i.y, i.y + 1.0));
        vec4 h = perm289(m289(perm289(c.xyxy) + c.zzww));                 // the cube's four upright edges
        vec4 lo = perm289(m289(h + m289(i.z))), hi = perm289(m289(h + m289(i.z + 1.0)));      // their lower and upper ends
        vec4 v = mix(lo, hi, f.z) * (1.0 / 289.0);
        return mix(mix(v.x, v.y, f.x), mix(v.z, v.w, f.x), f.y);
      }
      // brush strokes at a point: x = tone, y = groove. 'across' = offset from the wood's centre-line, 'c' = centre-line position
      vec2 strokes(vec3 across, vec3 c) {
        float big  = noise3(across * 4.2 + c * 0.38);
        float mid  = noise3(across * 10.0 + c * 1.1 + 7.3);
        float fine = noise3(across * 24.0 + c * 2.5 + 3.1);
        return vec2(big * 0.46 + mid * 0.38 + fine * 0.16, noise3(across * 17.0 + c * 2.8 + 9.0));
      }
      void main() {
        // hand-painted bark: long brush strokes laid along the wood. A 3D field is read from the ring around the wood's own
        // centre-line (fine across) plus the centre-line position itself (slow along), so strokes run lengthways, follow every
        // bend, and a limb's strokes begin exactly where the trunk's are: no seam where the wood forks. The sun only nudges
        // which tone wins, so the trunk never splits into a light and a dark half.
        vec2 st = strokes(vOP - vCtr, vCtr);
        if (vJoin > 0.001) {                       // foot of a limb: paint it as the trunk is painted, then ease into its own strokes
          vec3 ct = vec3(vAx.x, vOP.y, vAx.z);
          st = mix(st, strokes(vOP - ct, ct), vJoin);
        }
        float lit = dot(normalize(vN), uLight);
        float t = 0.52 + (st.x - 0.5) * 1.9 + (lit - 0.3) * 0.08;
        t -= smoothstep(uShadeY - 0.3, uShadeY + 0.6, vOP.y) * 0.3;    // crown shades the branches
        vec3 col = mix(uC, uB, smoothstep(0.37, 0.43, t));
        col = mix(col, uA, smoothstep(0.58, 0.64, t));
        col = mix(col, uH, smoothstep(0.72, 0.77, t) * smoothstep(0.0, 0.5, lit) * 0.85);   // dry-brush light on the sunny side
        float crack = smoothstep(0.78, 0.86, st.y);
        col = mix(col, uC * 0.75, crack * 0.4);                                                  // thin dark strokes in the grooves
        col = mix(col, uC * 0.85, clamp(vCrev, 0.0, 1.0) * 0.4);                                 // hollows and crotches sit in soft shade (smooth, never blotchy)
        if (uMarks > 0.5) {                                           // birch bark dashes
          float ang = atan(vON.z, vON.x);
          vec2 cell = floor(vec2(vOP.y * 4.0, ang * 1.4));
          float h = hash2(cell);
          float fy = fract(vOP.y * 4.0);
          if (h > 0.55 && fy > 0.3 && fy < 0.42 + h * 0.25) col = uMarkCol;
        }
        if (uRings > 0.0) {                                           // bamboo: a dark node ring, a pale band just above it
          float fr = fract(vOP.y / uRings + sin(vCtr.x * 2.3 + vCtr.z * 1.7) * 1.3);
          col = mix(col, uH, smoothstep(0.06, 0.09, fr) * (1.0 - smoothstep(0.13, 0.2, fr)) * 0.45);
          col = mix(col, uRingCol, 1.0 - smoothstep(0.025, 0.06, fr));
        }
        if (uMoss > 0.0) {                                            // moss on what faces up (roots, limb tops) and low on the trunk
          float m = (normalize(vN).y * 0.75 + (noise3(vOP * 3.4) - 0.5) * 1.2 + (noise3(vOP * 9.0) - 0.5) * 0.25 - 0.66) * uMoss;   // tops of roots and limbs, rarely the upright bark
          col = mix(col, mix(uMossB, uMossA, smoothstep(0.1, 0.45, lit)), smoothstep(0.0, 0.06, m));   // patches, lit like the wood
        }
        gl_FragColor = vec4(uDebug > 0.5 ? vec3(0.0, 0.0, 1.0) : mix(col, uHaze, vHaze), 1.0);
      }`,
  });
}

function flowerMaterial() {
  if (cache.flowerMat) return cache.flowerMat;
  return (cache.flowerMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uMask: { value: flowerMask() }, uStemA: { value: rgb('#8fae3a') }, uStemB: { value: rgb('#3e5d2b') } },
    vertexShader: /* glsl */`
      ${VCOMMON}
      attribute vec3 iPos;
      attribute vec4 iPar;      // x: size, y: atlas cell, z: phase, w: 0 = upright tuft, 1 = camera-facing blossom
      attribute vec3 iPetal;
      attribute vec3 iCen;
      varying vec2 vUv;
      varying vec3 vPetal;
      varying vec3 vCen;
      varying float vV;
      void main() {
        float sc = objScale();
        vec4 wc = modelMatrix * vec4(iPos, 1.0);
        if (iPar.w < 0.5) {
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          float h = position.y + 0.5;
          vec3 wp = wc.xyz + right * position.x * iPar.x * sc + vec3(0.0, h * iPar.x * sc, 0.0);
          float ph = iPar.z + wc.x * 0.3 + wc.z * 0.2;
          wp.x += sin(uTime * 1.7 + ph) * 0.07 * h * h * uWind * iPar.x * sc;
          wp.z += cos(uTime * 1.3 + ph) * 0.05 * h * h * uWind * iPar.x * sc;
          vHaze = hazeAt((viewMatrix * vec4(wp, 1.0)).xyz);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        } else {
          vec4 mv = viewMatrix * wc;
          mv.xy += position.xy * iPar.x * sc;
          mv.xyz *= max(length(mv.xyz) - 0.15 * sc, 0.1) / length(mv.xyz);  // sit on top of the bush leaves
          vHaze = hazeAt(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
        vUv = uv * 0.5 + vec2(mod(iPar.y, 2.0), floor(iPar.y / 2.0)) * 0.5;
        vV = uv.y;
        vPetal = iPetal;
        vCen = iCen;
      }`,
    fragmentShader: /* glsl */`
      ${HAZEF}
      uniform sampler2D uMask;
      uniform vec3 uStemA, uStemB;
      varying vec2 vUv;
      varying vec3 vPetal;
      varying vec3 vCen;
      varying float vV;
      void main() {
        vec4 m = texture2D(uMask, vUv);
        float a = max(m.r, max(m.g, m.b));
        float w = max(fwidth(a), 1e-3) * 0.75;
        float alpha = smoothstep(0.5 - w, 0.5 + w, a);
        if (alpha < 0.02) discard;
        vec3 col = mix(uStemB, uStemA, vV);
        if (m.g >= m.r && m.g >= m.b) col = vPetal * (0.86 + 0.14 * vV);
        if (m.b > m.r && m.b > m.g) col = vCen;
        gl_FragColor = vec4(mix(col, uHaze, vHaze), alpha);
      }`,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  }));
}

// fruit hanging in a crown: a round ball that turns softly from shade to light, a small glint, a stalk and one leaf;
// each fruit sways with the leaves round it and is turned its own way
function fruitMaterial() {
  if (cache.fruitMat) return cache.fruitMat;
  return (cache.fruitMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uLight: { value: new THREE.Vector3(-0.4, 0.9, 0.5).normalize() } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      ${VCOMMON}
      attribute vec3 iCenter;
      attribute vec4 iFruit;    // xyz: colour, w: radius (already scaled)
      attribute vec4 iBase;     // plant foot + scale; (0,0,0,1) for a single tree
      attribute float aPart;    // 0 fruit, 1 stalk, 2 leaf
      varying vec3 vN;
      varying vec3 vCol;
      varying float vPart;
      void main() {
        float ph = objPhase() + iBase.x * 0.37 + iBase.z * 0.23;
        vec3 c = iCenter + windOffset((iCenter - iBase.xyz) / iBase.w, ph) * iBase.w;
        float a = fract(sin(dot(iCenter.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
        mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
        vec3 p = position, nn = normal;
        p.xz = R * p.xz; nn.xz = R * nn.xz;
        vec4 mv = modelViewMatrix * vec4(c + p * iFruit.w, 1.0);
        vN = normalize(mat3(modelMatrix) * nn);
        vCol = iFruit.xyz;
        vPart = aPart;
        vHaze = hazeAt(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${HAZEF}
      uniform vec3 uLight;
      varying vec3 vN;
      varying vec3 vCol;
      varying float vPart;
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        float d = dot(n, uLight);
        vec3 col;
        if (vPart < 0.5) {
          col = mix(vCol * vec3(0.62, 0.5, 0.62), vCol * 1.08 + 0.02, smoothstep(-0.35, 0.55, d));
          col = mix(col, vec3(1.0, 0.97, 0.9), smoothstep(0.88, 0.93, d) * 0.7);
        } else if (vPart < 1.5) col = vec3(0.34, 0.23, 0.15);
        else col = d > 0.0 ? vec3(0.42, 0.6, 0.2) : vec3(0.22, 0.38, 0.15);
        gl_FragColor = vec4(mix(col, uHaze, vHaze), 1.0);
      }`,
  }));
}
function fruitGeometry() {
  if (cache.fruitGeo) return cache.fruitGeo;
  const tag = (g, part) => {
    g.deleteAttribute('uv');
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(part), 1));
    return g;
  };
  const ball = new THREE.IcosahedronGeometry(1, 1);      // 80 faces: the soft shading hides the facets, an orchard stays light
  ball.scale(1, 0.92, 1);
  const stalk = new THREE.CylinderGeometry(0.06, 0.08, 0.42, 5, 1, true).toNonIndexed();
  stalk.rotateZ(0.25); stalk.translate(0.04, 1.02, 0);
  const pos = [], nor = [];                              // one leaf: a fan from the stalk top, tipped up a little
  const L = 0.8, W = 0.3, base = new THREE.Vector3(0.08, 1.16, 0);
  const at = u => new THREE.Vector3(base.x + u * L, base.y + u * 0.22 - u * u * 0.12, 0);
  const steps = 6;
  for (let i = 0; i < steps; i++) for (const side of [1, -1]) {
    const u0 = i / steps, u1 = (i + 1) / steps;
    const w0 = Math.sin(u0 * Math.PI) * W * side, w1 = Math.sin(u1 * Math.PI) * W * side;
    const a = at(u0), b = at(u0).setZ(w0), c2 = at(u1).setZ(w1), d = at(u1);
    for (const q of side > 0 ? [a, b, c2, a, c2, d] : [a, c2, b, a, d, c2]) { pos.push(q.x, q.y, q.z); nor.push(0, 1, 0); }
  }
  const leaf = new THREE.BufferGeometry();
  leaf.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  leaf.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  leaf.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
  return (cache.fruitGeo = mergeGeometries([tag(ball, 0), tag(stalk, 1), tag(leaf, 2)]));
}
function fruitMesh({ pos, col, base = null }) {
  const src = fruitGeometry();
  const g = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'aPart']) g.setAttribute(k, src.attributes[k]);
  const n = pos.length / 3;
  if (!base) { base = new Float32Array(n * 4); for (let i = 3; i < base.length; i += 4) base[i] = 1; }
  g.setAttribute('iCenter', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('iFruit', new THREE.InstancedBufferAttribute(new Float32Array(col), 4));
  g.setAttribute('iBase', new THREE.InstancedBufferAttribute(base instanceof Float32Array ? base : new Float32Array(base), 4));
  g.instanceCount = n;
  const m = new THREE.Mesh(g, fruitMaterial());
  m.frustumCulled = false;
  m.name = 'fruit';
  return m;
}

function grassMaterial() {
  if (cache.grassMat) return cache.grassMat;
  return (cache.grassMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uMask: { value: grassMask() } },
    vertexShader: /* glsl */`
      ${VCOMMON}
      attribute vec3 iPos;
      attribute vec4 iPar;      // x: height, y: atlas cell, z: phase, w: width
      attribute vec3 iBase;
      attribute vec3 iTip;
      varying vec2 vUv;
      varying vec3 vBase;
      varying vec3 vTip;
      varying float vV;
      void main() {
        float sc = objScale();
        vec4 wp = modelMatrix * vec4(iPos, 1.0);
        vec4 mv = viewMatrix * wp;
        // camera-facing tuft anchored at its foot -> never turns into a thin line from above
        float h = position.y + 0.5;
        vec2 off = vec2(position.x * iPar.w, (h - 0.04) * iPar.x) * sc;   // mound foot sits on the ground
        float ph = iPar.z + wp.x * 0.35 + wp.z * 0.25;
        off.x += (sin(uTime * 1.5 + ph) * 0.09 + sin(uTime * 2.9 + ph * 2.0) * 0.025) * h * h * iPar.x * sc * uWind;
        mv.xy += off;
        float len = length(mv.xyz);
        mv.xyz *= max(len - 0.12 * sc, 0.1) / len;   // never sinks into the ground
        vHaze = hazeAt(mv.xyz);
        gl_Position = projectionMatrix * mv;
        vUv = uv * 0.5 + vec2(mod(iPar.y, 2.0), floor(iPar.y / 2.0)) * 0.5;
        vV = uv.y;
        vBase = iBase;
        vTip = iTip;
      }`,
    fragmentShader: /* glsl */`
      ${HAZEF}
      uniform sampler2D uMask;
      varying vec2 vUv;
      varying vec3 vBase;
      varying vec3 vTip;
      varying float vV;
      void main() {
        float a = texture2D(uMask, vUv).r;
        float w = max(fwidth(a), 1e-3) * 0.75;
        float alpha = smoothstep(0.5 - w, 0.5 + w, a);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(mix(mix(vBase, vTip, smoothstep(0.05, 0.85, vV)), uHaze, vHaze), alpha);   // gradient like the leaves
      }`,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  }));
}

const ROCK_TONES = {
  warm: ['#d9d3bd', '#b0aa94', '#837e6d', '#5a574d'],   // meadow stones
  cool: ['#d3d6cc', '#a6aba0', '#777d74', '#4f554f'],   // river stones / pebbles
  cliff: ['#e2d6b4', '#c2b38f', '#9a8b6c', '#6b604c'],  // same family as the valley cliffs
};
function rockMaterial(moss, tone = 'warm') {
  const key = 'rock_' + (moss ? 1 : 0) + tone;
  if (cache[key]) return cache[key];
  const T = ROCK_TONES[tone];
  return (cache[key] = new THREE.ShaderMaterial({
    uniforms: {
      uR0: { value: rgb(T[0]) }, uR1: { value: rgb(T[1]) }, uR2: { value: rgb(T[2]) }, uR3: { value: rgb(T[3]) },
      uM0: { value: rgb('#b9c83a') }, uM1: { value: rgb('#7f9b3c') }, uM2: { value: rgb('#5b7a33') },
      uMoss: { value: moss ? 1 : 0 },
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vWN;
      varying vec3 vOP;
      varying float vHaze;
      void main() {
        vWN = normalize(mat3(modelMatrix) * normal);
        vOP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      uniform vec3 uR0, uR1, uR2, uR3, uM0, uM1, uM2;
      uniform float uMoss;
      varying vec3 vWN;
      varying vec3 vOP;
      void main() {
        vec3 n = normalize(vWN);
        float d = dot(n, normalize(vec3(-0.35, 1.0, 0.4))) * 0.5 + 0.5;
        d += (noise2(vOP.xz * 4.0 + vOP.y * 2.0) - 0.5) * 0.12;            // jagged band edges
        vec3 col = d > 0.80 ? uR0 : (d > 0.62 ? uR1 : (d > 0.42 ? uR2 : uR3));
        if (uMoss > 0.5) {
          float m = n.y * 0.7 + (noise2(vOP.xz * 2.2 + 3.1) - 0.5) * 0.9 + (noise2(vOP.xz * 9.0) - 0.5) * 0.2;
          if (m > 0.55) {
            float t = n.y + (noise2(vOP.xz * 6.0) - 0.5) * 0.3;
            col = t > 0.9 ? uM0 : (t > 0.78 ? uM1 : uM2);
          }
        }
        col *= mix(0.8, 1.0, smoothstep(0.0, 0.22, vOP.y));                 // contact shade
        gl_FragColor = vec4(mix(col, uHaze, vHaze), 1.0);
      }`,
  }));
}

// --------------------------------------------------------------------------
// geometry builders
// --------------------------------------------------------------------------
// How finely wood and the leaf core are cut. A forest of hundreds of trees is drawn twice a frame (once more in the water's mirror),
// so every triangle here is paid hundreds of times. Smooth-shaded tubes hide the lower counts well.
const TREE_LOD = { trunkRadial: 10, trunkLength: 24, branchRadial: 7, branchLength: 8, coreDetail: 2 };

function taperedTube(points, radiusAt, radialSeg = 10, lenSeg = 40, shape = null, opt = {}) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(lenSeg, false);
  const pos = [], nor = [], ctr = [], crev = [], jn = [], ax = [], idx = [];
  const P = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Vector3(), nt = new THREE.Vector3();
  const axis = opt.axis || null, blendLen = opt.blend || 0.25;
  for (let i = 0; i <= lenSeg; i++) {
    const t = i / lenSeg;
    curve.getPointAt(t, P);
    const r0 = radiusAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    // a limb grows OUT of the wood it leaves: near its foot the shading, paint and shadow all belong to the
    // trunk and only turn into the limb's own further along (so no seam shows where the two surfaces cross)
    const wt = axis ? 1 - Math.min(1, t / blendLen) : 0, w = wt * wt * (3 - 2 * wt);
    for (let j = 0; j <= radialSeg; j++) {
      const a = j / radialSeg * Math.PI * 2;
      const r = shape ? r0 * shape(t, a) : r0;
      n.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
      q.set(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r);
      pos.push(q.x, q.y, q.z);
      if (w > 0) {
        nt.set(q.x - axis.x, 0, q.z - axis.z);
        if (nt.lengthSq() > 1e-6) n.lerp(nt.normalize(), w * 0.8).normalize();
      }
      nor.push(n.x, n.y, n.z);
      ctr.push(P.x, P.y, P.z);      // the paint is measured from this wood's own centre-line
      jn.push(w);                   // ...and near a limb's foot it is also painted the way the trunk is, the two mixed by this weight
      if (w > 0) ax.push(axis.x, P.y, axis.z); else ax.push(P.x, P.y, P.z);
      crev.push(opt.crev ? opt.crev(t, a, w) : 0);
    }
  }
  const row = radialSeg + 1;
  for (let i = 0; i < lenSeg; i++) for (let j = 0; j < radialSeg; j++) {
    const a = i * row + j, b = a + row;
    // N cos(a) + B sin(a), with B = tangent x N: this order faces OUT.
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  // Close each end. Duplicate the rim so cap normals do not flatten the bark.
  for (const end of [0, lenSeg]) {
    const offset = end * row, centre = pos.length / 3;
    const c = ctr.slice(offset * 3, offset * 3 + 3);
    const capN = frames.tangents[end].clone().multiplyScalar(end === 0 ? -1 : 1);
    const appendCap = source => {
      pos.push(...source);
      nor.push(capN.x, capN.y, capN.z);
      ctr.push(...c);
      jn.push(jn[offset]);
      ax.push(...ax.slice(offset * 3, offset * 3 + 3));
      crev.push(crev[offset]);
    };
    appendCap(c);
    for (let j = 0; j <= radialSeg; j++) {
      appendCap(pos.slice((offset + j) * 3, (offset + j) * 3 + 3));
    }
    for (let j = 0; j < radialSeg; j++) {
      const a = centre + 1 + j, b = a + 1;
      if (end === 0) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aCtr', new THREE.Float32BufferAttribute(ctr, 3));
  g.setAttribute('aJoin', new THREE.Float32BufferAttribute(jn, 1));
  g.setAttribute('aAx', new THREE.Float32BufferAttribute(ax, 3));
  g.setAttribute('aCrev', new THREE.Float32BufferAttribute(crev, 1));
  g.setIndex(idx);
  return { geo: g, curve };
}

// trunk + roots + branches, grown as one piece of wood. spec.trunk: { pts:[[x,y,z]..], radius:t=>r, lean, roots },
// spec.branches: [{ t:[a,b], n, rise:[a,b], out:[a,b], r, twig }]
function buildTrunk(rng, spec, grow = null) {
  const parts = [];
  const lean = (rng() - 0.5) * (spec.trunk.lean ?? 0.14);
  const sway = (rng() - 0.5) * 2, lph = rng() * 6.28;        // slow S-bend of the stem, and where the root lobes sit
  const pts = spec.trunk.pts.map(([x, y, z], i, arr) => {
    const k = Math.sin(i / (arr.length - 1) * Math.PI);  // lean most in the middle
    const w = Math.sin(i * 1.7 + lph) * 0.5 * (spec.trunk.sway ?? 0.1);
    return new THREE.Vector3(x + lean * k + w * sway, y, z + Math.cos(i * 1.3 + lph) * 0.5 * (spec.trunk.sway ?? 0.1));
  });
  const height = pts[pts.length - 1].y - pts[0].y;
  // a stout trunk that swells into its roots at the foot, slightly oval and irregular all the way up
  const trunkR = t => spec.trunk.radius(t) * 1.2 * (1 + 0.1 * Math.exp(-t * height / 0.5));
  const rootsOn = spec.trunk.roots ?? 5;
  const foot = spec.trunk.radius(0.15) * 1.2;      // the stem's own girth just above the swelling
  const trunkShape = (t, a) => 1 + 0.1 * Math.exp(-t * height / 0.8) * Math.cos(a * Math.max(rootsOn, 3) + lph * 3)
    + 0.05 * Math.cos(a * 2 + lph) + 0.035 * Math.sin(a * 3 + t * 9 + lph * 2);
  const trunk = taperedTube(pts, trunkR, TREE_LOD.trunkRadial, TREE_LOD.trunkLength, trunkShape,
    { crev: (t, a) => 0.45 * Math.exp(-t * height / 0.7) * (0.5 - 0.5 * Math.cos(a * Math.max(rootsOn, 3) + lph * 3)) });
  parts.push(trunk.geo);
  const up = new THREE.Vector3(0, 1, 0);
  const hollow = (t, a, w) => 0.2 * w * w;              // shadow in the crotch, fading out along the limb
  // a limb leaves the trunk heading out and mostly up, then reaches for the light: it starts nearly as thick as the wood
  // it leaves and narrows to its own size
  const addBranch = (start, az, rise, out, r0, rParent = r0, axisPt = null, blend = 0.26) => {
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const bp = [
      start.clone(),
      start.clone().addScaledVector(d, out * 0.36).addScaledVector(up, rise * 0.2),
      start.clone().addScaledVector(d, out * 0.74).addScaledVector(up, rise * 0.58),
      start.clone().addScaledVector(d, out).addScaledVector(up, rise),
    ];
    return addTube(bp, r0, rParent, axisPt, blend);
  };
  // any limb by its own control points (grown crowns use this directly)
  const addTube = (bp, r0, rParent = r0, axisPt = null, blend = 0.26) => {
    const collar = Math.max(r0, rParent * 0.7);
    const tube = taperedTube(bp, t => {
      const k = Math.min(1, t / 0.3), e = k * k * (3 - 2 * k);
      return (collar + (r0 - collar) * e) * (1 - 0.72 * t) * (1 + 0.14 * (1 - Math.min(1, t / 0.2)));   // a little flare where it joins
    }, TREE_LOD.branchRadial, TREE_LOD.branchLength, null, { axis: axisPt, blend, crev: axisPt ? hollow : null });
    parts.push(tube.geo);
    return tube.curve;
  };
  // buttress roots: short thick limbs that leave the trunk low down and dive into the ground
  const rN = rootsOn, rph = rng() * 6.28;
  for (let i = 0; i < rN; i++) {
    const az = rph + i / rN * Math.PI * 2 + (rng() - 0.5) * 0.6;
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const base = pts[0].clone(); base.y = 0.1 + foot * 1.5;
    const len = foot * range(rng, 1.7, 2.5);
    const rp = [base, base.clone().addScaledVector(d, len * 0.4).setY(base.y * 0.55), base.clone().addScaledVector(d, len * 0.75).setY(0.02), base.clone().addScaledVector(d, len).setY(-0.16)];
    const axisPt = pts[0].clone();
    const tube = taperedTube(rp, t => foot * 0.7 * (1 - 0.62 * t) + 0.02, 5, 5, null,
      { axis: axisPt, blend: 0.5, crev: (t, a, w) => 0.12 + 0.25 * w * w });
    parts.push(tube.geo);
  }
  for (const B of spec.branches || []) {
    for (let i = 0; i < B.n; i++) {
      const az = i / B.n * Math.PI * 2 + rng() * 0.8;
      const tj = range(rng, B.t[0], B.t[1]);
      const s = trunk.curve.getPointAt(tj);
      const curve = addBranch(s, az, range(rng, B.rise[0], B.rise[1]), range(rng, B.out[0], B.out[1]), B.r * 1.3, trunkR(tj), s);
      if (rng() < (B.twig || 0)) {
        const tt = range(rng, 0.42, 0.62);
        const ts = curve.getPointAt(tt);
        addBranch(ts, az + (rng() < 0.5 ? -1 : 1) * range(rng, 0.5, 1.0),
          range(rng, B.rise[0], B.rise[1]) * 0.5, range(rng, B.out[0], B.out[1]) * 0.45, B.r * 0.7, B.r * 1.3 * (1 - 0.72 * tt), ts, 0.4);
      }
    }
  }
  if (grow) grow({ curve: trunk.curve, trunkR, addTube });
  const g = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return g;
}

// per-vertex plant foot + scale (batched forests); single plants use (0,0,0,1)
function withBase(geo, x = 0, y = 0, z = 0, s = 1) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = x; a[i * 4 + 1] = y; a[i * 4 + 2] = z; a[i * 4 + 3] = s; }
  geo.setAttribute('aBase', new THREE.BufferAttribute(a, 4));
  return geo;
}

function buildCore(tiers) {
  const pos = [], hh = [];
  for (const T of tiers) {
    const g = new THREE.IcosahedronGeometry(1, T.coreDetail ?? TREE_LOD.coreDetail);
    const p = g.attributes.position;
    const cs = T.coreScale ?? 0.68, cb = T.coreBottom ?? 0.75;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      let y = p.getY(i);
      const wob = 1 + 0.06 * Math.sin(x * 5 + z * 3) * Math.cos(y * 4);
      const h = y * 0.5 + 0.5;
      if (y < 0) y *= cb;
      pos.push(T.c[0] + x * T.r[0] * cs * wob, T.c[1] + y * T.r[1] * cs * wob, T.c[2] + z * T.r[2] * cs * wob);
      hh.push(h);
    }
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
  return g;
}

// crown = lumps spread over ellipsoid "tiers", each lump = a ball of camera-facing leaf cards
function buildCanopy(rng, tiers, palName, detail = 1, blossomOut = null, quantiles = null) {
  const C = [], P = [], K = [], A = [], SS = [], TC = [], BC = [];
  const v = new THREE.Vector3(), e = new THREE.Vector3(), nT = new THREE.Vector3(), q = new THREE.Vector3();
  const W = SHADE_WEIGHTS;
  const qe = new THREE.Vector3(), nE = new THREE.Vector3();
  for (const T of tiers) {
    const c = new THREE.Vector3(...T.c), r = new THREE.Vector3(...T.r);
    const openBelow = T.openBelow ?? -0.8, taper = T.taper ?? 0, taperLow = T.taperLow ?? 0, egg = T.egg ?? 0;
    const E = T.env || null;      // grown crowns: every clump is lit as part of the one whole crown, not as its own ball
    for (let i = 0; i < T.n; i++) {
      const y0 = 1 - 2 * (i + 0.5) / T.n;
      if (y0 < openBelow) continue;
      const rr = Math.sqrt(1 - y0 * y0), phi = i * 2.39996 + rng() * 0.7;
      const d = new THREE.Vector3(Math.cos(phi) * rr + (rng() - 0.5) * 0.2, y0 + (rng() - 0.5) * 0.18,
                                  Math.sin(phi) * rr + (rng() - 0.5) * 0.2).normalize();
      const cr = T.clumpR * (0.65 + rng() * 0.7) * (1 - 0.3 * Math.max(d.y, 0));
      const out = 0.84 + rng() * 0.28;
      const S = d.clone().multiply(r).multiplyScalar(out);
      const tp = 1 - taper * Math.max(d.y, 0) - taperLow * Math.max(-d.y, 0);
      S.x *= tp; S.z *= tp; S.y *= 1 + egg * Math.max(d.y, 0);
      const nS = S.clone().divide(r).divide(r).normalize();
      const surf = S.clone().add(c);
      const cc = S.addScaledVector(nS, -cr * 1.15).add(c);
      const clumpTint = (rng() - 0.5) * 0.16 + (T.bright || 0);
      if (blossomOut && d.y > -0.15 && (!E || qe.copy(surf).sub(E.c).divide(E.r).length() > 0.8)) blossomOut.push({ p: surf, n: nS.clone(), r: cr });
      const m = Math.max(4, Math.round(30 * detail * Math.pow(cr / T.clumpR, 2)));
      for (let j = 0; j < m; j++) {
        const yy = 1 - 2 * (j + 0.5) / m, r2 = Math.sqrt(1 - yy * yy), ph = j * 2.39996 + rng();
        e.set(Math.cos(ph) * r2, yy, Math.sin(ph) * r2);
        v.copy(cc).addScaledVector(e, cr * (0.5 + rng() * 0.45));
        q.copy(v).sub(c).divide(r);
        const ql = q.length();
        if (ql < 0.55) continue;
        let ao = -(1 - THREE.MathUtils.smoothstep(ql, 0.6, 0.95)) * 0.12;
        nT.copy(v).sub(c).divide(r).divide(r).normalize();
        let hT = THREE.MathUtils.clamp((v.y - (T.c[1] - T.r[1] * 0.8)) / (T.r[1] * 1.8), 0, 1);
        if (E) {
          const qel = qe.copy(v).sub(E.c).divide(E.r).length();
          if (qel < 0.45) continue;                                                    // buried in the crown: never seen
          ao = ao * 0.4 - (1 - THREE.MathUtils.smoothstep(qel, 0.6, 0.98)) * 0.16;    // deep in the crown is darker
          nT.lerp(nE.copy(v).sub(E.c).divide(E.r).divide(E.r).normalize(), 0.65).normalize();
          hT = THREE.MathUtils.clamp((v.y - (E.c.y - E.r.y * 0.8)) / (E.r.y * 1.8), 0, 1);
        }
        const cardTint = (rng() - 0.5) * 0.035 + ao;
        const lam = nT.dot(SUN) * 0.5 + 0.5;
        SS.push(W[0] * hT + W[1] * (e.y * 0.5 + 0.5) + W[2] * lam + clumpTint + cardTint);
        C.push(v.x, v.y, v.z);
        P.push(hT, clumpTint, cardTint, Math.floor(rng() * 4));
        const spin = rng();
        K.push(T.upright ? (spin - 0.5) * T.upright : spin * Math.PI * 2, cr * (1.7 + rng() * 0.45) * (T.cardScale ?? 1), e.y);   // upright: hanging sprays keep hanging
        A.push(1 + rng() * 0.32);
      }
    }
  }
  toneCards(SS, palName, quantiles, TC, BC);
  return { C, P, K, A, TC, BC, SS };
}

// tone steps from this crown's own distribution -> every shape gets the same look
function toneCards(SS, palName, quantiles, TC, BC) {
  const sorted = SS.slice().sort((a, b) => a - b);
  const steps = (quantiles || TONE_QUANTILES).map(qq => sorted[Math.min(sorted.length - 1, Math.floor(qq * sorted.length))]);
  const pal = PALETTES[palName];
  const TOP = pal.top.map(rgb), BOT = pal.bot.map(rgb);
  for (const s of SS) {
    let b = 0;
    for (const t of steps) if (s > t) b++;
    TC.push(TOP[b].x, TOP[b].y, TOP[b].z);
    BC.push(BOT[b].x, BOT[b].y, BOT[b].z);
  }
}

// willow curtains: strings of cards hanging from the rim of one crown tier down toward the ground
function buildStrands(rng, S, tier, palName) {
  const C = [], P = [], K = [], A = [], SS = [], TC = [], BC = [];
  const c = new THREE.Vector3(...tier.c), r = new THREE.Vector3(...tier.r);
  for (let i = 0; i < S.count; i++) {
    const az = i * 2.39996 + rng() * 0.6;
    const el = range(rng, S.from, S.to);                       // where on the crown the string leaves it
    const rr = Math.sqrt(1 - el * el);
    const outw = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const p0 = new THREE.Vector3(outw.x * rr, el, outw.z * rr).multiply(r).multiplyScalar(range(rng, 0.82, 0.98)).add(c);
    const L = Math.max(1, p0.y - range(rng, S.bottom[0], S.bottom[1]));
    const k = Math.ceil(L / S.step);
    const lam = outw.dot(SUN) * 0.5 + 0.5;
    const tintS = (rng() - 0.5) * 0.12;
    for (let j = 0; j <= k; j++) {
      const t = j / k;
      const bow = S.bow * (1 - Math.pow(1 - Math.min(1, t * 1.6), 2));   // eases out over the rim, then hangs straight
      C.push(p0.x + outw.x * bow + (rng() - 0.5) * 0.08, p0.y - L * t, p0.z + outw.z * bow + (rng() - 0.5) * 0.08);
      const tint = tintS + (rng() - 0.5) * 0.04;
      P.push(0.5 + 2.2 * t, tint, (rng() - 0.5) * 0.04, Math.floor(rng() * 4));     // x: the tips flutter most
      K.push((rng() - 0.5) * 0.3, lerp(S.card[0], S.card[1], t) * range(rng, 0.85, 1.1), 0);
      A.push(range(rng, 0.8, 0.95));
      SS.push(0.55 * (1 - t * 0.8) + 0.3 * lam + 0.15 * (el * 0.5 + 0.5) + tint);
    }
  }
  toneCards(SS, palName, S.quantiles, TC, BC);
  return { C, P, K, A, TC, BC, SS };
}

// fruit on the outside of the crown: spots = leaf-clump surfaces (as blossoms use)
function placeFruit(rng, F, spots) {
  const pos = [], col = [];
  const cols = F.colors.map(rgb), placed = [];
  for (let tries = 0; tries < F.count * 4 && placed.length < F.count; tries++) {
    const s = spots[Math.floor(rng() * spots.length)];
    const rad = range(rng, F.r[0], F.r[1]);
    const t = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).projectOnPlane(s.n).normalize().multiplyScalar(s.r * range(rng, 0, 0.5));
    const p = s.p.clone().add(t).addScaledVector(s.n, rad * 0.15);
    if (s.n.y < 0.4) p.y -= rad * 1.2;                          // on the sides they hang a little below the leaves
    if (placed.some(q => q.distanceTo(p) < rad * 2.6)) continue;
    placed.push(p);
    const cc = cols[Math.floor(rng() * cols.length)], sh = range(rng, 0.94, 1.04);
    pos.push(p.x, p.y, p.z);
    col.push(cc.x * sh, cc.y * sh, cc.z * sh, rad);
  }
  return { pos, col };
}

// grown crowns: the wood is grown first (trunk -> limbs -> side branches), then a leaf clump on every branch tip,
// so each leaf mass sits on wood and no limb ends in the air or stops short of the leaves. spec.grow:
//   crown: { c, r, taper, taperLow, egg }        the envelope the branch tips reach to (the crown's silhouette)
//   limbs: { n, t, elev | lift, reach, r, bend }  t along the trunk; elev = where on the crown the tip lands, or
//                                                  lift = how far above its own start (tall crowns)
//   subs:  { n, t, elev, reach, r }               side branches off each limb (optional)
//   clump: { r, flat, push, lift, clump, n, openBelow }   the leaf clump on each tip; top: clump size on the leader
function buildGrown(rng, spec) {
  const G = spec.grow, tiers = [];
  const env = { c: new THREE.Vector3(...G.crown.c), r: new THREE.Vector3(...G.crown.r) };
  const tp = G.crown.taper ?? 0, tpl = G.crown.taperLow ?? 0, egg = G.crown.egg ?? 0;
  const up = new THREE.Vector3(0, 1, 0);
  const dirAt = (az, el) => { const rr = Math.sqrt(Math.max(0, 1 - el * el)); return new THREE.Vector3(Math.cos(az) * rr, el, Math.sin(az) * rr); };
  const onCrown = (d, reach) => {                           // a point on the envelope, the same shape the leaves make
    const S = d.clone().multiply(env.r).multiplyScalar(reach);
    const k = 1 - tp * Math.max(d.y, 0) - tpl * Math.max(-d.y, 0);
    S.x *= k; S.z *= k; S.y *= 1 + egg * Math.max(d.y, 0);
    return S.add(env.c);
  };
  const K = G.clump;
  const clump = (p, scale) => {
    const cr = K.r * scale, out = p.clone().sub(env.c).setY(0);
    if (out.lengthSq() > 1e-4) out.normalize();
    const c = p.clone().addScaledVector(out, cr * (K.push ?? 0.2));
    c.y += cr * (K.lift ?? 0.1);
    tiers.push({ c: [c.x, c.y, c.z], r: [cr, cr * (K.flat ?? 0.8), cr], clumpR: cr * (K.clump ?? 0.5), n: K.n ?? 8,
      openBelow: K.openBelow ?? -0.7, coreScale: K.core ?? 0.5, coreBottom: 0.7, coreDetail: 1, env });
  };
  // a branch from start to tip: leaves at its own angle, bends up toward the light, a little crooked
  const bend = (start, tip, B) => {
    const D = tip.clone().sub(start), Dh = D.clone().setY(0), len = D.length();
    const side = Dh.lengthSq() > 1e-6 ? new THREE.Vector3(-Dh.z, 0, Dh.x).normalize() : new THREE.Vector3(1, 0, 0);
    const [a1, b1, a2, b2] = B.bend ?? [0.33, 0.26, 0.7, 0.66];      // how far out vs up the two middle points sit
    const crook = B.crook ?? 0.1;
    return [start.clone(),
      start.clone().addScaledVector(Dh, a1).addScaledVector(up, D.y * b1 + 0.04 * len).addScaledVector(side, (rng() - 0.5) * crook * len),
      start.clone().addScaledVector(Dh, a2).addScaledVector(up, D.y * b2).addScaledVector(side, (rng() - 0.5) * crook * len),
      tip.clone()];
  };
  const trunk = buildTrunk(rng, spec, ({ curve, trunkR, addTube }) => {
    const L = G.limbs, S = G.subs;
    const nL = Math.round(range(rng, L.n[0], L.n[1])), ph = rng() * 6.28;
    for (let i = 0; i < nL; i++) {
      const az = ph + i * 2.39996 + (rng() - 0.5) * 0.5;
      const t0 = lerp(L.t[0], L.t[1], (i + rng()) / nL);                 // spiral up the trunk
      const start = curve.getPointAt(t0);
      const el = L.lift ? THREE.MathUtils.clamp((start.y - env.c.y) / env.r.y + range(rng, L.lift[0], L.lift[1]), -0.85, 0.92)
                        : range(rng, L.elev[0], L.elev[1]);
      const tip = onCrown(dirAt(az, el), range(rng, L.reach[0], L.reach[1]));
      const r0 = L.r * range(rng, 0.85, 1.15) * 1.3;
      const limb = addTube(bend(start, tip, L), r0, trunkR(t0), start, 0.26);
      clump(tip, range(rng, 0.9, 1.15));
      if (!S) continue;
      const nS = Math.round(range(rng, S.n[0], S.n[1]));
      for (let k = 0; k < nS; k++) {
        const tt = lerp(S.t[0], S.t[1], (k + rng()) / nS);
        const s0 = limb.getPointAt(tt), rAt = r0 * (1 - 0.72 * tt);
        const el2 = THREE.MathUtils.clamp(el + range(rng, S.elev[0], S.elev[1]), -0.85, 0.95);
        const tip2 = onCrown(dirAt(az + (k % 2 ? 1 : -1) * range(rng, 0.5, 1.05), el2), range(rng, S.reach[0], S.reach[1]));
        addTube(bend(s0, tip2, S), Math.max(rAt * (S.r ?? 0.7), 0.02), rAt, s0, 0.4);
        clump(tip2, range(rng, 0.75, 1.0));
      }
    }
    clump(curve.getPointAt(1), G.top ?? 1);                               // the leader ends inside the top of the crown
  });
  return { trunk, tiers };
}

// bamboo: a clump of thin culms leaning out from one foot, leaf sprays on their upper half
function buildBamboo(rng, spec) {
  const parts = [], tiers = [];
  const n = Math.round(range(rng, spec.culms[0], spec.culms[1]));
  const ph = rng() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = ph + i * 2.39996 + (rng() - 0.5) * 0.5;
    const d0 = Math.sqrt((i + 0.5) / n);                         // 0 = middle of the clump, 1 = its rim
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const base = out.clone().multiplyScalar(d0 * 0.8);
    const H = range(rng, 7.5, 10.5) * (1.1 - 0.3 * d0);         // the middle culms tallest
    const lean = (0.1 + 0.32 * d0 + rng() * 0.08) * H;           // the outer ones bow out further: a vase
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push(base.clone().addScaledVector(out, lean * Math.pow(t, 1.7)).setY(-0.05 + H * t - H * 0.08 * t * t * t));   // the tip nods
    }
    const r0 = range(rng, 0.06, 0.085) * H / 9;
    const tube = taperedTube(pts, t => r0 * (1 - 0.5 * t), 6, 16);
    parts.push(tube.geo);
    const L = 4 + (rng() < 0.5 ? 1 : 0);
    for (let k = 0; k < L; k++) {
      const t = Math.min(0.99, 0.42 + 0.58 * (k + rng() * 0.6) / L);
      const p = tube.curve.getPointAt(t);
      const sa = a + (rng() - 0.5) * 1.8, s = 0.55 + 0.5 * t;
      p.x += Math.cos(sa) * 0.4 * s; p.z += Math.sin(sa) * 0.4 * s; p.y -= 0.15 * s;      // sprays hang off the culm
      tiers.push({ c: [p.x, p.y, p.z], r: [0.9 * s, 0.5 * s, 0.9 * s], clumpR: 0.42 * s, n: 2, openBelow: -0.95, cardScale: 1.2, upright: 1.4 });
    }
  }
  const trunk = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return { trunk, tiers };
}

function cardGeometry({ C, P, K, A, TC, BC, SS, B = null }) {
  if (!B) { B = new Float32Array(C.length / 3 * 4); for (let i = 3; i < B.length; i += 4) B[i] = 1; }
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  g.setAttribute('iCenter', new THREE.InstancedBufferAttribute(new Float32Array(C), 3));
  g.setAttribute('iParam', new THREE.InstancedBufferAttribute(new Float32Array(P), 4));
  g.setAttribute('iCard', new THREE.InstancedBufferAttribute(new Float32Array(K), 3));
  g.setAttribute('iAspect', new THREE.InstancedBufferAttribute(new Float32Array(A), 1));
  g.setAttribute('iTop', new THREE.InstancedBufferAttribute(new Float32Array(TC), 3));
  g.setAttribute('iBot', new THREE.InstancedBufferAttribute(new Float32Array(BC), 3));
  g.setAttribute('iS', new THREE.InstancedBufferAttribute(new Float32Array(SS), 1));
  g.setAttribute('iBase', new THREE.InstancedBufferAttribute(B instanceof Float32Array ? B : new Float32Array(B), 4));
  g.instanceCount = C.length / 3;
  return g;
}

// Loose camera-facing patches in the same style (foam puffs, leafy lips, mist ...).
// points: [[x, y, z, size], ...]; colours: one gradient (top -> bottom) or several picked at random
export function createCardCluster({ points, top = '#ffffff', bot = '#d8eef2', colors = null, mask = 'broad', seed = 1, flutter = 0.5 } = {}) {
  const rng = mulberry32(seed * 977 + points.length);
  const pairs = (colors || [[top, bot]]).map(([a, b]) => [rgb(a), rgb(b)]);
  const C = [], P = [], K = [], A = [], TC = [], BC = [], SS = [];
  for (const [x, y, z, sz] of points) {
    const [T, B] = pairs[Math.floor(rng() * pairs.length)];
    C.push(x, y, z);
    P.push(flutter, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1, Math.floor(rng() * 4));
    K.push(rng() * Math.PI * 2, sz, 0);
    A.push(1 + rng() * 0.3);
    TC.push(T.x, T.y, T.z); BC.push(B.x, B.y, B.z); SS.push(0.5);
  }
  const m = new THREE.Mesh(cardGeometry({ C, P, K, A, TC, BC, SS }), leafMaterial(mask));
  m.frustumCulled = false;
  m.name = 'cards';
  m.userData = { kind: 'cards', dispose() { m.geometry.dispose(); } };
  return m;
}

// --------------------------------------------------------------------------
// tree species
// --------------------------------------------------------------------------
const TREE_TYPES = {
  // the reference tree: two-tier crown, slim maroon trunk, fork shown under the crown
  broadleaf: {
    palette: 'broad', mask: 'broad', height: 10,
    trunk: {
      pts: [[0, -0.05, 0], [0.01, 1.2, 0], [-0.03, 2.4, 0.02], [0, 3.4, 0], [0.05, 4.8, 0.02], [0.12, 6.3, 0], [0.2, 7.9, 0]],
      radius: t => 0.155 - 0.1 * t + 0.13 * Math.exp(-t * 50),
    },
    branches: [
      { t: [0.33, 0.38], n: 5, rise: [1.7, 2.3], out: [1.3, 2.1], r: 0.072, twig: 0.7 },
      { t: [0.78, 0.88], n: 4, rise: [1.0, 1.6], out: [0.9, 1.6], r: 0.05 },
    ],
    tiers: [
      { c: [0, 4.95, 0], r: [2.75, 1.66, 2.6], clumpR: 1.2, n: 30, openBelow: -0.86, coreBottom: 0.75, taper: 0.4, taperLow: 0.3, egg: -0.08 },
      { c: [0.18, 8.42, 0], r: [2.15, 1.55, 2.0], clumpR: 0.88, n: 32, bright: 0.12, openBelow: -0.8, taper: 0.42, taperLow: 0.08, egg: 0.16 },
    ],
    shadeY: 3.3,
  },
  // big, wide, irregular single crown on a stout trunk
  oak: {
    palette: 'broad', mask: 'broad', height: 8.6,
    trunk: {
      pts: [[0, -0.05, 0], [0.02, 0.8, 0], [0, 1.7, 0], [0.05, 2.6, 0], [0.1, 3.6, 0], [0.1, 4.8, 0]],
      radius: t => 0.3 - 0.17 * t + 0.24 * Math.exp(-t * 28), lean: 0.1,
    },
    branches: [
      { t: [0.4, 0.52], n: 6, rise: [1.8, 2.5], out: [1.9, 2.8], r: 0.13, twig: 0.9 },
      { t: [0.8, 0.95], n: 3, rise: [1.2, 1.6], out: [1.0, 1.5], r: 0.08 },
    ],
    tiers: [
      { c: [0, 5.3, 0], r: [3.4, 1.95, 3.2], clumpR: 1.3, n: 40, openBelow: -0.84, taper: 0.32, taperLow: 0.3, egg: -0.05 },
      { c: [-2.3, 4.7, 0.6], r: [1.5, 1.15, 1.5], clumpR: 0.9, n: 14, openBelow: -0.7, taper: 0.3, taperLow: 0.2 },
      { c: [2.2, 4.9, -0.7], r: [1.45, 1.1, 1.45], clumpR: 0.9, n: 14, openBelow: -0.7, taper: 0.3, taperLow: 0.2 },
      { c: [0.4, 6.75, 0.2], r: [1.9, 1.15, 1.8], clumpR: 1.0, n: 16, bright: 0.05, openBelow: -0.6, taper: 0.35 },
    ],
    shadeY: 3.2,
  },
  // stacked skirts of needle tufts
  pine: {
    palette: 'pine', mask: 'needle', height: 10.5,
    trunk: {
      pts: [[0, -0.05, 0], [0, 2.5, 0], [0.02, 5, 0], [0, 7.5, 0], [0.02, 10, 0]],
      radius: t => 0.2 - 0.17 * t + 0.12 * Math.exp(-t * 40), lean: 0.05, roots: 3,
    },
    branches: [],
    tiers: (() => {
      // skirts: wide & flat at the bottom, small at the top; each one a jagged cone
      const out = [];
      const K = 7;
      for (let k = 0; k < K; k++) {
        const R = 3.0 * (1 - k / 7.6) + 0.3;
        out.push({ c: [0, 1.9 + k * 1.16, 0], r: [R, 0.62 + R * 0.12, R], clumpR: 0.3 + R * 0.13, n: Math.round(14 + R * 10),
          openBelow: -0.25, coreBottom: 0.35, coreScale: 0.55, taper: 0.78, egg: 0.9, cardScale: 0.9 });
      }
      out.push({ c: [0, 10.0, 0], r: [0.42, 0.7, 0.42], clumpR: 0.28, n: 8, openBelow: -0.5, taper: 0.6, egg: 1.0, bright: 0.04 });
      return out;
    })(),
    quantiles: [0.17, 0.4, 0.66, 0.76, 0.9],     // darker conifer
    shadeY: 1.7,
  },
  // slender white trunk, airy clusters of small leaves
  birch: {
    palette: 'birch', mask: 'soft', height: 9.2,
    trunk: {
      pts: [[0, -0.05, 0], [0.05, 1.5, 0], [-0.08, 3, 0.05], [0.05, 4.5, 0], [0.15, 6, 0], [0.1, 7.5, 0], [0.15, 8.6, 0]],
      radius: t => 0.12 - 0.075 * t + 0.06 * Math.exp(-t * 40), lean: 0.2, roots: 3,
    },
    branches: [{ t: [0.5, 0.85], n: 5, rise: [0.9, 1.4], out: [0.7, 1.2], r: 0.04, twig: 0.5 }],
    tiers: [
      { c: [0.15, 8.15, 0], r: [1.4, 1.05, 1.3], clumpR: 0.62, n: 18, bright: 0.05, taper: 0.35, egg: 0.15 },
      { c: [-0.75, 6.85, 0.3], r: [1.6, 1.1, 1.45], clumpR: 0.66, n: 20, taper: 0.25, taperLow: 0.2 },
      { c: [0.8, 6.3, -0.3], r: [1.35, 1.0, 1.25], clumpR: 0.6, n: 16, taper: 0.25, taperLow: 0.2 },
      { c: [0.3, 5.2, 0.2], r: [1.35, 0.9, 1.25], clumpR: 0.58, n: 15, taper: 0.25, taperLow: 0.2 },
      { c: [-0.6, 4.45, -0.1], r: [0.95, 0.65, 0.9], clumpR: 0.48, n: 10, taperLow: 0.2 },
    ],
    bark: ['#ece8dc', '#cfc8b4', '#9e9886'], marks: true, markCol: '#2e2a26', shadeY: 4.4,
  },
  // young tree: thin stem, one small round crown
  sapling: {
    palette: 'broad', mask: 'broad', height: 4.6,
    trunk: {
      pts: [[0, -0.05, 0], [0.02, 1.0, 0], [0, 2.0, 0], [0.05, 3.0, 0], [0.08, 3.8, 0]],
      radius: t => 0.075 - 0.04 * t + 0.04 * Math.exp(-t * 40), lean: 0.12, roots: 3,
    },
    branches: [{ t: [0.55, 0.66], n: 3, rise: [0.6, 0.9], out: [0.5, 0.8], r: 0.035 }],
    tiers: [{ c: [0.05, 3.4, 0], r: [1.35, 1.05, 1.25], clumpR: 0.62, n: 18, taper: 0.3, taperLow: 0.25, openBelow: -0.8 }],
    shadeY: 2.4,
  },

  // ---- accent crowns -----------------------------------------------------------------------
  // cherry in bloom: short leaning trunk, limbs spreading wide and low, a puffy pink crown on their tips
  sakura: {
    palette: 'sakura', mask: 'blossom', height: 7.2, custom: buildGrown, detailMul: 0.5,
    trunk: {
      pts: [[0, -0.05, 0], [0.05, 0.9, 0], [0.2, 1.8, 0.05], [0.3, 2.7, 0], [0.3, 3.9, 0], [0.25, 5.3, 0]],
      radius: t => 0.25 * (1 - t) + 0.025 + 0.16 * Math.exp(-t * 30), lean: 0.3, sway: 0.2, roots: 4,
    },
    grow: {
      crown: { c: [0.3, 4.6, 0], r: [3.6, 1.7, 3.4], taper: 0.3, taperLow: 0.2, egg: -0.05 },
      limbs: { n: [5, 6], t: [0.35, 0.6], elev: [-0.45, 0.4], reach: [0.6, 0.85], r: 0.085, bend: [0.42, 0.18, 0.78, 0.55] },
      subs: { n: [2, 3], t: [0.35, 0.85], elev: [-0.4, 0.35], reach: [0.82, 1.0], r: 0.7 },
      clump: { r: 1.2, flat: 0.75, n: 8 },
      top: 1.1,
    },
    quantiles: [0.08, 0.22, 0.45, 0.62, 0.82],       // a lighter crown than the greens
    bark: ['#6b4a48', '#4b3336', '#33252c'], barkHi: '#d9b8a8', marks: true, markCol: '#664845', shadeY: 3.2,
  },
  // autumn maple: a round crown in reds, oranges and gold. Grown: limbs and side branches each end in a clump
  maple: {
    palette: 'maple', mask: 'maple', height: 8, custom: buildGrown, detailMul: 0.5,
    trunk: {
      pts: [[0, -0.05, 0], [0.02, 1.0, 0], [0.05, 2.0, 0], [0.1, 2.9, 0], [0.08, 4.2, 0], [0.02, 5.6, 0], [0, 6.9, 0]],
      radius: t => 0.21 * Math.pow(1 - t, 1.1) + 0.025 + 0.14 * Math.exp(-t * 30), lean: 0.14, roots: 4,
    },
    grow: {
      crown: { c: [0, 4.9, 0], r: [3.2, 2.4, 3.1], taper: 0.2, taperLow: 0.3 },
      limbs: { n: [5, 6], t: [0.3, 0.55], elev: [-0.5, 0.5], reach: [0.6, 0.85], r: 0.075 },
      subs: { n: [2, 3], t: [0.4, 0.85], elev: [-0.4, 0.4], reach: [0.82, 1.0], r: 0.7 },
      clump: { r: 1.25, flat: 0.8, n: 8 },
      top: 1.2,
    },
    quantiles: [0.1, 0.25, 0.48, 0.64, 0.84],
    bark: ['#6f5a52', '#4d3f3b', '#342b2c'], shadeY: 3.4,
  },
  // orchard trees: low limbs spreading into a round crown, fruit hung on the outside of it
  apple: {
    palette: 'broad', mask: 'broad', height: 5.4, custom: buildGrown, detailMul: 0.5,
    trunk: {
      pts: [[0, -0.05, 0], [0.03, 0.7, 0], [0.07, 1.4, 0], [0.06, 2.4, 0], [0.02, 3.5, 0], [0, 4.5, 0]],
      radius: t => 0.15 * Math.pow(1 - t, 1.2) + 0.02 + 0.1 * Math.exp(-t * 35), lean: 0.2, roots: 3,
    },
    grow: {
      crown: { c: [0, 3.3, 0], r: [2.3, 1.75, 2.2], taper: 0.2, taperLow: 0.25 },
      limbs: { n: [4, 5], t: [0.24, 0.42], elev: [-0.6, 0.35], reach: [0.6, 0.85], r: 0.065, bend: [0.4, 0.2, 0.75, 0.6] },
      subs: { n: [2, 3], t: [0.35, 0.85], elev: [-0.45, 0.4], reach: [0.85, 1.0], r: 0.7 },
      clump: { r: 1.0, flat: 0.9, n: 8, openBelow: -0.85 },
      top: 1.0,
    },
    quantiles: [0.16, 0.4, 0.64, 0.78, 0.92],        // deeper green so the fruit stands out
    fruit: { colors: ['#d63a2f', '#c4302c', '#e0552e'], r: [0.1, 0.13], count: 44 },
    shadeY: 2.2,
  },
  orange: {
    palette: 'pine', mask: 'broad', height: 5.2, custom: buildGrown, detailMul: 0.5,
    trunk: {
      pts: [[0, -0.05, 0], [0.02, 0.7, 0], [0.04, 1.3, 0], [0.03, 2.3, 0], [0, 3.4, 0], [0, 4.5, 0]],
      radius: t => 0.14 * Math.pow(1 - t, 1.2) + 0.02 + 0.1 * Math.exp(-t * 35), lean: 0.12, roots: 3,
    },
    grow: {
      crown: { c: [0, 3.3, 0], r: [2.05, 1.85, 2.0], taper: 0.18, taperLow: 0.3, egg: 0.08 },
      limbs: { n: [5, 6], t: [0.25, 0.45], elev: [-0.45, 0.6], reach: [0.6, 0.85], r: 0.06 },
      subs: { n: [2, 3], t: [0.35, 0.85], elev: [-0.25, 0.45], reach: [0.85, 1.0], r: 0.7 },
      clump: { r: 0.9, flat: 0.9, n: 8 },
      top: 0.95,
    },
    quantiles: [0.12, 0.34, 0.6, 0.74, 0.9],
    fruit: { colors: ['#f39a1e', '#f7ad2b', '#ec8a17'], r: [0.1, 0.12], count: 40 },
    shadeY: 2.1,
  },
  // the old giant at the heart of a village: massive limbs spreading wide, built at a normal size, stood up spec.scale times bigger
  giant: {
    palette: 'broad', mask: 'broad', height: 10, scale: 2.2, custom: buildGrown, detailMul: 0.5,
    trunk: {
      pts: [[0, -0.05, 0], [0.05, 1.0, 0], [0.15, 2.0, 0.05], [0.1, 3.0, 0], [0.2, 3.9, 0.05], [0.25, 5.4, 0], [0.2, 7.2, 0], [0.1, 8.6, 0]],
      radius: t => 0.72 * Math.pow(1 - t, 1.1) + 0.04 + 0.5 * Math.exp(-t * 12), lean: 0.1, sway: 0.25, roots: 7,
    },
    grow: {
      crown: { c: [0, 6.6, 0], r: [5.6, 2.4, 5.4], taper: 0.3, taperLow: 0.2 },
      limbs: { n: [6, 7], t: [0.4, 0.62], elev: [-0.45, 0.35], reach: [0.55, 0.8], r: 0.26, bend: [0.45, 0.15, 0.8, 0.5] },
      subs: { n: [2, 3], t: [0.35, 0.85], elev: [-0.35, 0.4], reach: [0.8, 1.0], r: 0.6 },
      clump: { r: 1.9, flat: 0.75, n: 9 },
      top: 1.6,
    },
    quantiles: [0.18, 0.42, 0.68, 0.82, 0.95],       // an old, deep green: little of the bright top tone
    bark: ['#6e5146', '#4a3632', '#30242a'], moss: 1, shadeY: 4.4,
  },

  // ---- new silhouettes ---------------------------------------------------------------------
  // weeping willow: a leaning trunk, a dome, and curtains of leaves hanging almost to the ground
  willow: {
    palette: 'willow', mask: 'soft', height: 8.4,
    trunk: {
      pts: [[0, -0.05, 0], [0.1, 1.0, 0], [0.3, 2.0, 0.05], [0.4, 3.0, 0], [0.45, 4.2, 0]],
      radius: t => 0.28 - 0.15 * t + 0.18 * Math.exp(-t * 30), lean: 0.35, sway: 0.2, roots: 5,
    },
    branches: [{ t: [0.6, 0.9], n: 6, rise: [1.5, 2.3], out: [1.4, 2.4], r: 0.09, twig: 0.8 }],
    tiers: [
      { c: [0.4, 6.4, 0], r: [3.0, 1.6, 2.9], clumpR: 0.85, n: 26, openBelow: -0.15, coreBottom: 0.45, taper: 0.2, egg: 0.1 },
      { c: [0.5, 7.6, 0], r: [1.8, 0.9, 1.7], clumpR: 0.7, n: 10, bright: 0.06, openBelow: -0.3 },
    ],
    strands: { tier: 0, count: 72, from: -0.3, to: 0.35, bottom: [0.4, 1.9], step: 0.26, bow: 0.5, card: [0.85, 0.58],
      mask: 'willow', quantiles: [0.12, 0.32, 0.58, 0.74, 0.9] },
    bark: ['#6f5f4f', '#4c4038', '#332b2a'], shadeY: 4.8,
  },
  // a clump of bamboo: many thin culms from one foot (built by buildBamboo)
  bamboo: {
    palette: 'bamboo', mask: 'bamboo', height: 10, custom: buildBamboo, culms: [12, 16], detailMul: 0.4, core: false,
    quantiles: [0.12, 0.32, 0.56, 0.72, 0.88],
    bark: ['#b9c65c', '#86a03c', '#5a7230'], barkHi: '#f4f3b8', rings: 0.42, ringCol: '#4a5a28',
  },
  // a tall dark flame of a tree, for ridges and lining a path: a leader to the top, short limbs climbing it steeply
  cypress: {
    palette: 'cypress', mask: 'soft', height: 12, custom: buildGrown, detailMul: 0.4,
    trunk: {
      pts: [[0, -0.05, 0], [0, 1.5, 0], [0.02, 3.5, 0], [0, 6, 0], [0.02, 9, 0], [0, 11.6, 0]],
      radius: t => 0.2 * Math.pow(1 - t, 1.1) + 0.02 + 0.1 * Math.exp(-t * 40), lean: 0.03, roots: 3,
    },
    grow: {
      crown: { c: [0, 6.4, 0], r: [1.4, 5.6, 1.4], taper: 0.55, taperLow: 0.15, egg: 0.05 },
      limbs: { n: [28, 32], t: [0.08, 0.92], lift: [0.1, 0.28], reach: [0.45, 0.8], r: 0.035, bend: [0.5, 0.3, 0.85, 0.75] },
      clump: { r: 0.9, flat: 1.35, push: 0.05, lift: 0.15, clump: 0.48, n: 8, openBelow: -0.85, core: 0.62 },
      top: 0.65,
    },
    quantiles: [0.2, 0.44, 0.68, 0.8, 0.93],
    shadeY: 1.4,
  },
  // umbrella pine: a long bare leaning trunk; limbs rise from its top and splay out under a flat crown of pads
  umbrella: {
    palette: 'pine', mask: 'needle', height: 10.2, custom: buildGrown, detailMul: 0.5,
    trunk: {
      pts: [[0, -0.05, 0], [0.1, 1.8, 0], [0.35, 3.6, 0], [0.55, 5.2, 0], [0.55, 6.6, 0], [0.5, 7.8, 0]],
      radius: t => 0.2 * Math.pow(1 - t, 0.9) + 0.025 + 0.15 * Math.exp(-t * 35), lean: 0.25, sway: 0.15, roots: 4,
    },
    grow: {
      crown: { c: [0.5, 8.3, 0], r: [4.0, 1.0, 3.8], taper: 0.1 },
      limbs: { n: [5, 6], t: [0.6, 0.86], elev: [-0.35, 0.15], reach: [0.7, 0.95], r: 0.085, bend: [0.15, 0.45, 0.55, 0.88] },
      subs: { n: [1, 2], t: [0.5, 0.85], elev: [-0.2, 0.2], reach: [0.85, 1.0], r: 0.7 },
      clump: { r: 1.45, flat: 0.42, push: 0.1, lift: 0.35, n: 9, openBelow: -0.4 },
      top: 1.05,
    },
    quantiles: [0.17, 0.4, 0.66, 0.76, 0.9],
    shadeY: 7.0,
  },
};
export const TREE_TYPE_NAMES = Object.keys(TREE_TYPES);
export const treeSpecScale = type => TREE_TYPES[type]?.scale ?? 1;

function treeParts(type, seed, detail) {
  const spec = TREE_TYPES[type];
  if (!spec) throw new Error('unknown tree type: ' + type);
  const rng = mulberry32(seed * 7919 + type.length);
  let trunk, tiers = spec.tiers;
  if (spec.custom) ({ trunk, tiers } = spec.custom(rng, spec));
  else trunk = buildTrunk(rng, spec);
  const core = buildCore(spec.core === false ? [] : tiers);
  const spots = spec.fruit ? [] : null;
  const cards = buildCanopy(rng, tiers, spec.palette, detail * (spec.detailMul ?? 1), spots, spec.quantiles);
  const strands = spec.strands ? buildStrands(rng, spec.strands, tiers[spec.strands.tier], spec.palette) : null;
  const fruit = spec.fruit ? placeFruit(rng, spec.fruit, spots) : null;
  return { spec, trunk, core, cards, strands, fruit };
}

export function createTree({ type = 'broadleaf', seed = 7, detail = 1 } = {}) {
  const { spec, trunk: tg, core: cg, cards, strands, fruit } = treeParts(type, seed, detail);
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(withBase(tg), barkMaterial(spec));
  const core = new THREE.Mesh(withBase(cg), coreMaterial(spec.palette));
  const leaves = new THREE.Mesh(cardGeometry(cards), leafMaterial(spec.mask));
  const parts = [trunk, core, leaves];
  if (strands) parts.push(new THREE.Mesh(cardGeometry(strands), leafMaterial(spec.strands.mask)));
  if (fruit) parts.push(fruitMesh(fruit));
  for (const m of parts) m.frustumCulled = false;
  group.add(...parts);
  if (spec.scale) group.scale.setScalar(spec.scale);
  group.name = 'tree_' + type;
  group.userData = {
    kind: 'tree', type, height: spec.height * (spec.scale ?? 1),
    cards: leaves.geometry.instanceCount + (strands ? strands.C.length / 3 : 0), fruit: fruit ? fruit.pos.length / 3 : 0,
    dispose() { trunk.material.dispose(); for (const m of parts) m.geometry.dispose(); },
  };
  return group;
}

// --------------------------------------------------------------------------
// bushes
// --------------------------------------------------------------------------
const BLOSSOM_COLORS = ['#f6f2e6', '#f4b8c8', '#c8b4ec', '#f39aae'];

function bushParts(type, seed, blossom) {
  const rng = mulberry32(seed * 104729 + 11);
  const sx = range(rng, 0.85, 1.2);
  const tiers = [{ c: [0, 0.72, 0], r: [1.3 * sx, 0.85, 1.2 * sx], clumpR: 0.55, n: 20, openBelow: -0.55, coreBottom: 0.4, taper: 0.25 }];
  if (rng() < 0.6) tiers.push({ c: [range(rng, -1, 1) * 0.9, 0.5, range(rng, -1, 1) * 0.6], r: [0.75, 0.55, 0.7], clumpR: 0.4, n: 10, openBelow: -0.4, coreBottom: 0.4 });
  const spots = (type === 'flowering' || type === 'berry') ? [] : null;
  const core = buildCore(tiers);
  const cards = buildCanopy(rng, tiers, 'broad', 1, spots, BUSH_QUANTILES);
  let flowers = null;
  if (spots && type === 'flowering') {
    const col = rgb(blossom || BLOSSOM_COLORS[Math.floor(rng() * BLOSSOM_COLORS.length)]);
    const cen = rgb('#f0c430');
    const pos = [], par = [], pet = [], cn = [];
    for (const s of spots) {
      const k = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < k; i++) {
        const p = s.p.clone().add(new THREE.Vector3(range(rng, -1, 1), range(rng, -0.6, 0.6), range(rng, -1, 1)).multiplyScalar(s.r * 0.6));
        pos.push(p.x, p.y, p.z);
        par.push(range(rng, 0.2, 0.3), rng() < 0.5 ? 2 : 3, rng() * 6, 1);
        const sh = range(rng, 0.9, 1.0);
        pet.push(col.x * sh, col.y * sh, col.z * sh);
        cn.push(cen.x, cen.y, cen.z);
      }
    }
    flowers = { pos, par, pet, cen: cn };
  }
  return { core, cards, flowers, spots };
}

// The same canopy surface anchors used for flowering bushes, without a texture or material allocation.
export function sampleBushSurface({ seed = 3 } = {}) {
  const { core, spots } = bushParts('berry', seed, null);
  core.dispose();
  return spots;
}

export function createBush({ type = 'round', seed = 3, blossom = null } = {}) {
  const { core: cg, cards, flowers } = bushParts(type, seed, blossom);
  const group = new THREE.Group();
  const core = new THREE.Mesh(withBase(cg), coreMaterial('broad'));
  const leaves = new THREE.Mesh(cardGeometry(cards), leafMaterial('broad'));
  core.frustumCulled = leaves.frustumCulled = false;
  group.add(core, leaves);
  if (flowers) group.add(flowerCards(flowers.pos, flowers.par, flowers.pet, flowers.cen));
  group.name = 'bush_' + type;
  group.userData = { kind: 'bush', type, height: 1.6, dispose() { core.geometry.dispose(); leaves.geometry.dispose(); } };
  return group;
}

// --------------------------------------------------------------------------
// forest: many trees and bushes merged into a handful of draw calls
// list: [{ kind: 'tree' | 'bush', type, seed, detail, x, y, z, rotY, scale }]
// (dense worlds on phones: ~10 draw calls instead of 3 per tree)
// --------------------------------------------------------------------------
export function createForest(list) {
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), T = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const leafB = {}, barkB = {}, coreB = {}, flowersB = { pos: [], par: [], pet: [], cen: [] }, fruitB = { pos: [], col: [], base: [] };
  const addCards = (mask, cards, e, s) => {
    const b = leafB[mask] || (leafB[mask] = { C: [], P: [], K: [], A: [], TC: [], BC: [], SS: [], B: [] });
    for (let i = 0; i < cards.C.length / 3; i++) {
      V.set(cards.C[i * 3], cards.C[i * 3 + 1], cards.C[i * 3 + 2]).applyMatrix4(M);
      b.C.push(V.x, V.y, V.z);
      b.P.push(cards.P[i * 4], cards.P[i * 4 + 1], cards.P[i * 4 + 2], cards.P[i * 4 + 3]);
      b.K.push(cards.K[i * 3], cards.K[i * 3 + 1] * s, cards.K[i * 3 + 2]);
      b.A.push(cards.A[i]);
      b.TC.push(cards.TC[i * 3], cards.TC[i * 3 + 1], cards.TC[i * 3 + 2]);
      b.BC.push(cards.BC[i * 3], cards.BC[i * 3 + 1], cards.BC[i * 3 + 2]);
      b.SS.push(cards.SS[i]);
      b.B.push(e.x, e.y, e.z, s);
    }
  };
  for (const e of list) {
    const s = (e.scale ?? 1) * (e.kind === 'bush' ? 1 : treeSpecScale(e.type || 'broadleaf'));   // a giant is stood up at its own size
    M.compose(T.set(e.x, e.y, e.z), Q.setFromAxisAngle(UP, e.rotY ?? 0), S.set(s, s, s));
    if (e.kind === 'bush') {
      const { core, cards, flowers } = bushParts(e.type || 'round', e.seed ?? 1, e.blossom || null);
      (coreB.broad || (coreB.broad = [])).push(withBase(core.applyMatrix4(M), e.x, e.y, e.z, s));
      addCards('broad', cards, e, s);
      if (flowers) for (let i = 0; i < flowers.pos.length / 3; i++) {
        V.set(flowers.pos[i * 3], flowers.pos[i * 3 + 1], flowers.pos[i * 3 + 2]).applyMatrix4(M);
        flowersB.pos.push(V.x, V.y, V.z);
        flowersB.par.push(flowers.par[i * 4] * s, flowers.par[i * 4 + 1], flowers.par[i * 4 + 2], flowers.par[i * 4 + 3]);
        flowersB.pet.push(flowers.pet[i * 3], flowers.pet[i * 3 + 1], flowers.pet[i * 3 + 2]);
        flowersB.cen.push(flowers.cen[i * 3], flowers.cen[i * 3 + 1], flowers.cen[i * 3 + 2]);
      }
    } else {
      const { spec, trunk, core, cards, strands, fruit } = treeParts(e.type || 'broadleaf', e.seed ?? 1, e.detail ?? 1);
      trunk.applyMatrix4(M); trunk.attributes.aCtr.applyMatrix4(M); trunk.attributes.aAx.applyMatrix4(M);
      (barkB[e.type] || (barkB[e.type] = { spec, geos: [] })).geos.push(withBase(trunk, e.x, e.y, e.z, s));
      if (core.attributes.position.count) (coreB[spec.palette] || (coreB[spec.palette] = [])).push(withBase(core.applyMatrix4(M), e.x, e.y, e.z, s));
      else core.dispose();
      addCards(spec.mask, cards, e, s);
      if (strands) addCards(spec.strands.mask, strands, e, s);
      if (fruit) for (let i = 0; i < fruit.pos.length / 3; i++) {
        V.set(fruit.pos[i * 3], fruit.pos[i * 3 + 1], fruit.pos[i * 3 + 2]).applyMatrix4(M);
        fruitB.pos.push(V.x, V.y, V.z);
        fruitB.col.push(fruit.col[i * 4], fruit.col[i * 4 + 1], fruit.col[i * 4 + 2], fruit.col[i * 4 + 3] * s);
        fruitB.base.push(e.x, e.y, e.z, s);
      }
    }
  }
  const group = new THREE.Group();
  const owned = [];
  const add = (geo, mat, ownMat = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    group.add(m);
    owned.push(geo);
    if (ownMat) owned.push(mat);
  };
  for (const { spec, geos } of Object.values(barkB)) { add(mergeGeometries(geos), barkMaterial(spec), true); geos.forEach(g => g.dispose()); }
  for (const [pal, geos] of Object.entries(coreB)) { add(mergeGeometries(geos), coreMaterial(pal)); geos.forEach(g => g.dispose()); }
  for (const [mask, b] of Object.entries(leafB)) add(cardGeometry({ ...b, B: new Float32Array(b.B) }), leafMaterial(mask));
  if (flowersB.pos.length) { const f = flowerCards(flowersB.pos, flowersB.par, flowersB.pet, flowersB.cen); group.add(f); owned.push(f.geometry); }
  if (fruitB.pos.length) { const f = fruitMesh(fruitB); group.add(f); owned.push(f.geometry); }
  let cards = 0;
  for (const b of Object.values(leafB)) cards += b.C.length / 3;
  group.name = 'forest';
  group.userData = { kind: 'forest', plants: list.length, cards, drawCalls: group.children.length, dispose() { owned.forEach(o => o.dispose()); } };
  return group;
}

// --------------------------------------------------------------------------
// flowers
// --------------------------------------------------------------------------
function flowerCards(pos, par, pet, cen) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('iPar', new THREE.InstancedBufferAttribute(new Float32Array(par), 4));
  g.setAttribute('iPetal', new THREE.InstancedBufferAttribute(new Float32Array(pet), 3));
  g.setAttribute('iCen', new THREE.InstancedBufferAttribute(new Float32Array(cen), 3));
  g.instanceCount = pos.length / 3;
  const m = new THREE.Mesh(g, flowerMaterial());
  m.frustumCulled = false;
  return m;
}

export const FLOWER_COLORS = ['#f6f2e6', '#f7d84a', '#f4a6bc', '#b9a3e8', '#93b8ee'];

export function createFlowers({ count = 40, radius = 1.2, seed = 5, heightAt = null, colors = null, center = [0, 0] } = {}) {
  const rng = mulberry32(seed * 3301 + 7);
  const palette = (colors || [FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)], FLOWER_COLORS[0]]).map(rgb);
  const pos = [], par = [], pet = [], cen = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * radius;
    const x = center[0] + Math.cos(a) * d, z = center[1] + Math.sin(a) * d;
    pos.push(x, heightAt ? heightAt(x, z) : 0, z);
    par.push(range(rng, 0.45, 0.75), rng() < 0.5 ? 0 : 1, rng() * 6, 0);
    const c = palette[rng() < 0.8 ? 0 : Math.floor(rng() * palette.length)];
    const sh = range(rng, 0.9, 1.0);
    pet.push(c.x * sh, c.y * sh, c.z * sh);
    const cc = rgb(rng() < 0.85 ? '#f0c430' : '#7a5530');
    cen.push(cc.x, cc.y, cc.z);
  }
  const m = flowerCards(pos, par, pet, cen);
  m.name = 'flowers';
  m.userData = { kind: 'flowers', height: 0.8 };
  return m;
}

// --------------------------------------------------------------------------
// rocks
// --------------------------------------------------------------------------
function rockGeo(seed, sx, sy, sz, rough, base = -0.35, detail = 3) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = fbm3(x * 1.3 + seed * 3.1, y * 1.3, z * 1.3, seed, 3);
    const ch = fbm3(x * 3.2, y * 3.2 + seed, z * 3.2, seed + 9, 2);
    const r = 1 + (n - 0.5) * 2 * rough + (ch - 0.5) * rough * 0.5;
    x *= r * sx; y *= r * sy; z *= r * sz;
    const b = base * sy;
    if (y < b) y = b + (y - b) * 0.12;
    p.setXYZ(i, x, y - b, z);
  }
  g.computeVertexNormals();
  return g;
}

// angular, faceted rock (flat-shaded low-poly) for cliff feet and scree
function cragGeo(seed, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(1, 1);             // non-indexed -> flat facets
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = fbm3(x * 1.1 + seed * 2.3, y * 1.1, z * 1.1, seed, 2);
    const r = 1 + (n - 0.5) * 0.8;
    x *= r * sx; y *= r * sy; z *= r * sz;
    x += y * 0.18;                                              // a little lean
    const b = -0.4 * sy;
    if (y < b) y = b;
    p.setXYZ(i, x, y - b, z);
  }
  g.computeVertexNormals();
  return g;
}

export const ROCK_TYPES = ['boulder', 'stones', 'slab', 'standing', 'river', 'pebbles', 'crag'];
export function createRock({ type = 'boulder', seed = 1, moss } = {}) {
  const rng = mulberry32(seed * 7907 + type.length);
  let geo, tone = 'warm';
  if (moss === undefined) moss = ['boulder', 'stones', 'slab', 'standing'].includes(type);
  if (type === 'river') {                                       // smooth, flattened, water-worn
    geo = rockGeo(seed, range(rng, 1.0, 1.35), range(rng, 0.6, 0.8), range(rng, 0.8, 1.05), 0.17, -0.25, 3);
    tone = 'cool';
  } else if (type === 'pebbles') {                              // a scatter of small round pebbles
    const parts = [];
    const n = 14 + Math.floor(rng() * 9);
    for (let i = 0; i < n; i++) {
      const s = range(rng, 0.1, 0.26) * (i < 3 ? 1.5 : 1);
      const g = rockGeo(seed * 17 + i, s * range(rng, 1, 1.4), s * range(rng, 0.45, 0.65), s, 0.08, -0.25, 2);
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 1.3;
      g.rotateY(rng() * Math.PI * 2);
      g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
      parts.push(g);
    }
    geo = mergeGeometries(parts);
    parts.forEach(q => q.dispose());
    tone = 'cool';
  } else if (type === 'crag') {
    geo = cragGeo(seed, range(rng, 0.8, 1.1), range(rng, 1.2, 1.7), range(rng, 0.75, 0.95));
    tone = 'cliff';
  } else if (type === 'boulder') geo = rockGeo(seed, range(rng, 1.1, 1.4), range(rng, 0.85, 1.05), range(rng, 0.95, 1.15), 0.3);
  else if (type === 'slab') geo = rockGeo(seed, range(rng, 1.5, 1.9), range(rng, 0.38, 0.5), range(rng, 1.1, 1.4), 0.22, -0.2);
  else if (type === 'standing') geo = rockGeo(seed, range(rng, 0.5, 0.62), range(rng, 1.5, 1.85), range(rng, 0.45, 0.55), 0.24, -0.6);
  else {
    const parts = [];
    const n = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const s = range(rng, 0.22, 0.5);
      const g = rockGeo(seed * 13 + i, s * range(rng, 1, 1.4), s * range(rng, 0.7, 1.0), s * range(rng, 0.9, 1.2), 0.3, -0.35, 3);
      const a = rng() * Math.PI * 2, d = i === 0 ? 0 : range(rng, 0.45, 1.1);
      g.rotateY(rng() * Math.PI * 2);
      g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
      parts.push(g);
    }
    geo = mergeGeometries(parts);
    parts.forEach(p => p.dispose());
  }
  const mesh = new THREE.Mesh(geo, rockMaterial(moss, tone));
  mesh.name = 'rock_' + type;
  geo.computeBoundingBox();
  mesh.userData = { kind: 'rock', type, height: geo.boundingBox.max.y, dispose() { geo.dispose(); } };
  return mesh;
}

// --------------------------------------------------------------------------
// grass
// --------------------------------------------------------------------------
// tuft gradients (foot -> tips), from the same families as the leaves; weights sum to 1
const GRASS_RAMPS = [
  ['#5f7f34', '#a8bd34', 0.36], ['#6a8a37', '#bfcb36', 0.3], ['#557532', '#94b03a', 0.22], ['#7a9a3c', '#d2db45', 0.12],
];
// createGrass: tidy tufts in patches (not a carpet).
//   count      tufts scattered over the disc (radius, center); kept only where the patch noise allows
//   patchiness 0 = spread evenly, 1 = only in clear clumps
//   clusters   extra rings of tufts, e.g. around tree feet: [[x, z, radius, count], ...]
export function createGrass({ count = 400, radius = 10, seed = 9, heightAt = null, center = [0, 0], avoid = null,
  patchiness = 0.55, clusters = null } = {}) {
  const rng = mulberry32(seed * 6151 + 3);
  const ramps = GRASS_RAMPS.map(([a, b, w]) => [rgb(a), rgb(b), w]);
  const pos = [], par = [], base = [], tip = [];
  const add = (x, z, scale) => {
    if (avoid && avoid(x, z)) return;
    pos.push(x, (heightAt ? heightAt(x, z) : 0) - 0.02, z);
    const h = range(rng, 0.42, 0.72) * scale;
    par.push(h, Math.floor(rng() * 4), rng() * 6.28, h * range(rng, 1.5, 1.9));
    let u = rng(), k = 0;
    while (k < ramps.length - 1 && u > ramps[k][2]) { u -= ramps[k][2]; k++; }
    base.push(ramps[k][0].x, ramps[k][0].y, ramps[k][0].z);
    tip.push(ramps[k][1].x, ramps[k][1].y, ramps[k][1].z);
  };
  // tufts come in clumps of 4-9 (big one in the middle), clumps sit where the patch noise is high
  for (let i = 0; i < count * 2 && pos.length / 3 < count; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * radius;
    const x = center[0] + Math.cos(a) * d, z = center[1] + Math.sin(a) * d;
    const patch = fbm3(x * 0.16, 0.3, z * 0.16, seed, 2);              // 0..1
    if (patch < 0.35 + patchiness * 0.25) continue;                     // open meadow between clumps
    const n = 4 + Math.floor(rng() * 6), big = range(rng, 0.95, 1.25);
    add(x, z, big);
    for (let j = 1; j < n; j++) {
      const aa = j / n * Math.PI * 2 + rng() * 0.8, dd = range(rng, 0.3, 0.75) * big;
      add(x + Math.cos(aa) * dd, z + Math.sin(aa) * dd, big * range(rng, 0.6, 0.9));
    }
  }
  for (const [cx, cz, r, n] of clusters || []) {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + rng() * 0.6, d = r * range(rng, 0.75, 1.15);
      add(cx + Math.cos(a) * d, cz + Math.sin(a) * d, range(rng, 0.85, 1.15));
    }
  }
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('iPar', new THREE.InstancedBufferAttribute(new Float32Array(par), 4));
  g.setAttribute('iBase', new THREE.InstancedBufferAttribute(new Float32Array(base), 3));
  g.setAttribute('iTip', new THREE.InstancedBufferAttribute(new Float32Array(tip), 3));
  g.instanceCount = pos.length / 3;
  const m = new THREE.Mesh(g, grassMaterial());
  m.frustumCulled = false;
  m.name = 'grass';
  m.userData = { kind: 'grass', height: 0.6, count: g.instanceCount };
  return m;
}

// --------------------------------------------------------------------------
// ground: rolling meadow, flat-ish in the middle, hills toward the edge
// --------------------------------------------------------------------------
export function createGround({ radius = 45, seed = 3, flat = 10, hills = 1, segments = 150, far = '#eef5e4' } = {}) {
  const heightAt = (x, z) => {
    const d = Math.hypot(x, z);
    const m = THREE.MathUtils.smoothstep(d, flat, flat + 16);
    const n = (fbm3(x * 0.045, 0.5, z * 0.045, seed, 3) - 0.5) * 7.0 + (fbm3(x * 0.12, 1.7, z * 0.12, seed + 5, 2) - 0.5) * 1.0;
    return hills * (n * (0.12 + 0.88 * m) + m * m * 2.0);
  };
  const g = new THREE.PlaneGeometry(radius * 2, radius * 2, segments, segments);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uG0: { value: rgb('#7a9b3c') }, uG1: { value: rgb('#86a640') }, uG2: { value: rgb('#93b145') }, uG3: { value: rgb('#a5c04b') },
      uFar: { value: rgb(far) }, uFadeA: { value: radius * 0.55 }, uFadeB: { value: radius * 0.97 },
    },
    vertexShader: /* glsl */`
      varying vec3 vWP;
      varying vec3 vN;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform vec3 uG0, uG1, uG2, uG3, uFar;
      uniform float uFadeA, uFadeB;
      varying vec3 vWP;
      varying vec3 vN;
      void main() {
        float n = noise2(vWP.xz * 0.08) * 0.6 + noise2(vWP.xz * 0.3) * 0.3 + noise2(vWP.xz * 1.6) * 0.1;
        float lit = dot(normalize(vN), normalize(vec3(-0.3, 1.0, 0.35)));
        float s = n * 0.6 + (lit - 0.9) * 2.6 + 0.2;
        vec3 col = s > 0.6 ? uG3 : (s > 0.45 ? uG2 : (s > 0.3 ? uG1 : uG0));
        col = mix(col, uFar, smoothstep(uFadeA, uFadeB, length(vWP.xz)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'ground';
  mesh.userData = { kind: 'ground', heightAt, radius };
  return mesh;
}

// --------------------------------------------------------------------------
// final pass: force framebuffer alpha to 1 (keeps RGB). Add once per scene.
// --------------------------------------------------------------------------
export function createAlphaFix() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const m = new THREE.ShaderMaterial({
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }',
    depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor,
  });
  const fix = new THREE.Mesh(g, m);
  fix.frustumCulled = false;
  fix.renderOrder = 1e6;
  fix.name = 'alphaFix';
  return fix;
}

// shared pieces for sibling modules (stylized-terrain.js)
export const _internal = { NOISE, VCOMMON, HAZEF, rgb, fbm3, mulberry32, range, shared, canvasTex };
export { rockMaterial };


