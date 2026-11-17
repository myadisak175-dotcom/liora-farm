/* ==========================================================================
   meadow-flowers.js  —  the meadow's low flowers: small flowers standing in the grass, in drifts.
   One job: build a drift of them. (The leafy flowering clumps that stand among them are small flowering bushes of
   anime-tree.js, kind 'bush' type 'clump': the level plants those.)

   What a flower is here
     a stem   a ribbon from its foot to its tip, turned to the eye, in the grass's own greens (so it is lost among the
              blades: what shows is the flower), with a leaf or two; it sways with the wind, and leans away from
              whoever walks through (stylized-nature's setWalker), as the grass does
     a head   a small disc on the stem's tip, turned its own way (mostly up) and half toward the eye: seen from the side
              a flower is an ellipse, from above a round, and no two lie alike (they were all flat to the screen: stickers).
              Painted in three flat tones (shade at the petals' feet and where one lies under the next, the petal's own
              colour, light at the tips), a tone darker when it is turned from the sun
     a spire  (lavender, lupin) stands upright on its stem instead
   Flowers grow a few stems to a plant, plants of a kind gather, and a drift's outline is ragged and thins toward its edge.

   createFlowerDrift({ center: [x, z], radius, seed, heightAt, bed: 'pink' | 'yellow' | 'blue', allow, avoid }) -> Mesh
        allow(x, z) -> false where nothing may grow (a way, water); avoid: [[x, z, r], ...] round spots kept clear
        (one draw call: stems, heads and spires are instances of one quad)
   setFlowerSun(vec3)      world direction toward the sun: the heads' light follows it live
   In dying land (stylized-nature's setDryness) they fade brown and hang their heads, one by one gone; in dead land, none.
   every frame: stylized-nature's update(dt) (time + wind are shared with the other plants)
   ========================================================================== */
import * as THREE from 'three';
import { mulberry32, uniforms as natureUniforms, NATURE_VCOMMON, NATURE_HAZEF } from './stylized-nature.js';

const range = (rng, a, b) => a + rng() * (b - a);
const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a slow noise over the ground, 0..1 (which kind grows where, and how far a drift reaches)
const hash = (i, j, s) => { let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 1013904223); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const noise = (x, z, s) => {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (hash(i, j, s) * (1 - u) + hash(i + 1, j, s) * u) * (1 - v) + (hash(i, j + 1, s) * (1 - u) + hash(i + 1, j + 1, s) * u) * v;
};

const SUN = { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() };
export function setFlowerSun(v) {
  SUN.value.copy(v);
  if (SUN.value.y < 0.12) SUN.value.y = 0.12;                       // (at night the flowers keep a low light)
  SUN.value.normalize();
}

// --------------------------------------------------------------------------
// the kinds of flower. cell: its picture in the atlas; size: across its head (m); tall: its stem (m); stems: to a plant;
// lean: how far a stem leans out (of its height); bud: how many heads are still buds; spire: upright, high: its length (m)
// --------------------------------------------------------------------------
const KINDS = {
  daisy: { cell: 2, size: [0.064, 0.086], tall: [0.34, 0.47], stems: [1, 3], lean: 0.32, bud: 0.12 },
  butter: { cell: 3, size: [0.05, 0.066], tall: [0.31, 0.43], stems: [2, 4], lean: 0.4, bud: 0.1 },
  cosmos: { cell: 4, size: [0.078, 0.1], tall: [0.42, 0.57], stems: [1, 3], lean: 0.36, bud: 0.15 },
  cluster: { cell: 5, size: [0.095, 0.12], tall: [0.28, 0.39], stems: [2, 4], lean: 0.45, bud: 0 },
  spire: { cell: 6, size: [0.05, 0.064], high: [0.16, 0.23], tall: [0.27, 0.38], stems: [2, 4], lean: 0.22, bud: 0, spire: true },
};
// a petal's own colour and its shade
const TONES = {
  white: ['#fbf8ee', '#cdd2e6'], yellow: ['#f9da4c', '#e2a52c'], gold: ['#f5c03a', '#d68a22'],
  pink: ['#f7aec6', '#dc7aa0'], rose: ['#ee8fb0', '#cd5f8c'], blush: ['#fbd5e0', '#e7a3bd'],
  lilac: ['#bca6ea', '#8f77d2'], violet: ['#a58ce0', '#7962c2'], blue: ['#9fc3f3', '#6c95da'],
};
const CENTRES = { gold: '#f2c230', brown: '#8a5a2a', pale: '#f7e9a0' };
// a bed: the kinds that grow in it, each [kind, its colours, its middle, how much of the bed is that kind]
export const FLOWER_BEDS = {
  pink: [['cosmos', ['pink', 'rose', 'blush'], 'gold', 0.6], ['daisy', ['white'], 'gold', 0.3], ['spire', ['rose'], 'gold', 0.1]],
  yellow: [['butter', ['yellow', 'gold'], 'gold', 0.6], ['daisy', ['white'], 'gold', 0.3], ['cosmos', ['gold'], 'brown', 0.1]],
  blue: [['spire', ['lilac', 'violet'], 'pale', 0.45], ['cluster', ['blue', 'lilac'], 'pale', 0.4], ['daisy', ['white'], 'gold', 0.15]],
};
const PLANTS_PER_M2 = 12, GAP = 0.12;       // plants to a square metre of a drift's heart; no two feet nearer than GAP

// --------------------------------------------------------------------------
// the atlas: 4 x 2 cells. red = where there is paint, green = its tone (0 shade .. 1 light), blue = a flower's middle
//   0, 1  a stem with its leaves (the cell is as wide as STEM_W of the stem's height)
//   2 daisy   3 buttercup   4 cosmos   5 a cluster of small flowers   6 a spire (as wide as SPIRE_W of its height)   7 a bud
// --------------------------------------------------------------------------
const STEM_W = 0.4, SPIRE_W = 0.34;
let atlas = null;
function flowerAtlas() {
  if (atlas) return atlas;
  const C = 256, cv = document.createElement('canvas');
  cv.width = C * 4; cv.height = C * 2;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const rng = mulberry32(4107);
  const paint = (t, b = 0) => `rgb(255,${Math.round(Math.min(1, Math.max(0, t)) * 255)},${b})`;
  const grad = (x0, y0, x1, y1, t0, t1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, paint(t0)); gr.addColorStop(1, paint(t1)); return gr; };
  const cell = (k, w, draw) => {                                   // draw in a cell w wide and 1 high (y down), clipped to it
    g.save();
    g.beginPath(); g.rect((k % 4) * C + 1, Math.floor(k / 4) * C + 1, C - 2, C - 2); g.clip();
    g.setTransform(C / w, 0, 0, C, (k % 4) * C, Math.floor(k / 4) * C);
    draw(w);
    g.restore();
  };
  // a petal from (cx, cy) out at ang: shade at its foot, light at its tip
  const petal = (cx, cy, ang, len, wid, t0, t1) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    g.fillStyle = grad(cx + c * len * 0.15, cy + s * len * 0.15, cx + c * len, cy + s * len, t0, t1);
    g.beginPath(); g.ellipse(cx + c * len * 0.56, cy + s * len * 0.56, len * 0.5, wid * 0.5, ang, 0, Math.PI * 2); g.fill();
  };
  // the middle: shade, with light over its upper left
  const middle = (cx, cy, r) => {
    g.fillStyle = paint(0.25, 255); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = paint(0.9, 255); g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.4, r * 0.95, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  // a flower of n petals in two rings: the ring beneath a tone darker
  const flower = (cx, cy, R, n, wid, mid, turn = 0) => {
    for (let k = 0; k < n; k++) if (k % 2) petal(cx, cy, turn + k / n * Math.PI * 2, R * 0.94, R * wid, 0.2, 0.62);
    for (let k = 0; k < n; k++) if (!(k % 2)) petal(cx, cy, turn + k / n * Math.PI * 2, R, R * wid, 0.42, 1.0);
    if (mid) middle(cx, cy, R * mid);
  };
  // a leaf from (x, y) out at ang: a lance, darker along one side
  const leaf = (x, y, ang, len, wid, t) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    g.fillStyle = grad(x, y, x + c * len, y + s * len, t * 0.55, t);
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + c * len * 0.45 - s * wid, y + s * len * 0.45 + c * wid, x + c * len, y + s * len);
    g.quadraticCurveTo(x + c * len * 0.45 + s * wid * 0.55, y + s * len * 0.45 - c * wid * 0.55, x, y);
    g.fill();
  };
  // the stems: foot at the bottom's middle, tip at the top's middle, a slow bend between
  const stem = (w, bend, leaves) => {
    const m = w / 2;
    g.lineCap = 'round'; g.lineWidth = 0.034;
    g.strokeStyle = grad(m, 1, m, 0, 0.35, 0.9);
    g.beginPath(); g.moveTo(m, 0.99); g.quadraticCurveTo(m + bend, 0.5, m, 0.03); g.stroke();
    for (const [h, side, len, t] of leaves) leaf(m + bend * (1 - (2 * h - 1) ** 2) * 0.5, 1 - h, -Math.PI / 2 + side * 0.7, len, 0.035, t);
  };
  cell(0, STEM_W, w => stem(w, 0.03, [[0.16, -1, 0.3, 0.75], [0.34, 1, 0.27, 0.95], [0.55, -1, 0.2, 0.85]]));
  cell(1, STEM_W, w => stem(w, -0.035, [[0.22, 1, 0.31, 0.9], [0.45, -1, 0.24, 0.7]]));
  cell(2, 1, () => flower(0.5, 0.5, 0.46, 14, 0.24, 0.25, 0.2));               // daisy: many thin petals
  cell(3, 1, () => flower(0.5, 0.5, 0.45, 5, 0.86, 0.2, -0.3));                // buttercup: five round ones
  cell(4, 1, () => flower(0.5, 0.5, 0.47, 8, 0.5, 0.17, 0.1));                 // cosmos: eight broad ones
  cell(5, 1, () => {                                                             // a cluster of small flowers, some in the shade of the rest
    const at = [[0.3, 0.3, 0.19], [0.68, 0.27, 0.17], [0.5, 0.52, 0.2], [0.22, 0.66, 0.16], [0.75, 0.62, 0.18], [0.5, 0.82, 0.15]];
    at.forEach(([x, y, r], i) => {
      for (let k = 0; k < 5; k++) petal(x, y, i + k / 5 * Math.PI * 2, r, r * 0.8, i % 3 === 1 ? 0.15 : 0.4, i % 3 === 1 ? 0.6 : 1.0);
      middle(x, y, r * 0.24);
    });
  });
  cell(6, SPIRE_W, w => {                                                        // a spire: small flowers up a stalk, smaller toward its top
    const m = w / 2;
    g.lineCap = 'round'; g.lineWidth = 0.022; g.strokeStyle = paint(0.3);
    g.beginPath(); g.moveTo(m, 0.99); g.lineTo(m, 0.06); g.stroke();
    for (let y = 0.93, row = 0; y > 0.04; row++) {
      const k = sstep(0.0, 0.9, y), r = 0.022 + 0.05 * k, half = (w * 0.5 - r) * (0.25 + 0.75 * k);
      for (const sx of row % 2 ? [-0.55, 0.55] : [-1, 0, 1]) {
        const x = m + sx * half + (rng() - 0.5) * 0.015, yy = y + (rng() - 0.5) * 0.02;
        g.fillStyle = grad(x - r, yy - r, x + r, yy + r, sx < 0 ? 1.0 : 0.75, sx < 0 ? 0.5 : 0.2);      // light from the upper left
        g.beginPath(); g.ellipse(x, yy, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
      }
      y -= r * 1.25;
    }
  });
  cell(7, 1, () => {                                                             // a bud: closed petals, a tone darker down one side
    g.fillStyle = grad(0.3, 0.2, 0.75, 0.8, 1.0, 0.3);
    g.beginPath(); g.moveTo(0.5, 0.1); g.bezierCurveTo(0.86, 0.3, 0.84, 0.74, 0.5, 0.9); g.bezierCurveTo(0.16, 0.74, 0.14, 0.3, 0.5, 0.1); g.fill();
    g.fillStyle = paint(0.25);
    g.beginPath(); g.moveTo(0.5, 0.14); g.bezierCurveTo(0.6, 0.4, 0.6, 0.7, 0.5, 0.88); g.bezierCurveTo(0.72, 0.72, 0.76, 0.38, 0.5, 0.14); g.fill();
  });
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  return (atlas = t);
}

// --------------------------------------------------------------------------
// shader: one quad, three ways of standing (iTip.w: 0 stem, 1 head, 2 spire)
// --------------------------------------------------------------------------
const VS = /* glsl */`
${NATURE_VCOMMON}
uniform vec3 uSun;
uniform vec4 uWalker;     // her feet (world) + how far round her the flowers part
uniform float uTurn;      // how far a head turns toward the eye (0: it keeps its own way, lying flat seen from the side)
attribute vec3 iBase;     // the stem's foot
attribute vec4 iTip;      // xyz: from the foot to the tip; w: 0 stem, 1 head, 2 spire
attribute vec4 iPar;      // x: stem's width / head's size / spire's width, y: atlas cell, z: phase, w: spire's length
attribute vec3 iColA;     // the petals' own colour
attribute vec3 iColB;     // their shade
attribute vec3 iCen;      // the middle
attribute vec3 iTilt;     // the way the head faces (mostly up)
varying vec2 vUv;
varying vec3 vA;
varying vec3 vB;
varying vec3 vC;
varying vec3 vK;          // x: kind, y: height along (0 foot .. 1 tip), z: light
uniform sampler2D uDryMap;  // DRYNESS: how dead the land is here (red), over the rect uDryRect (stylized-nature's setDryness)
uniform vec4 uDryRect;
varying float vDry;
void main() {
  vec3 base = (modelMatrix * vec4(iBase, 1.0)).xyz;
  // DRYNESS: in dying land a flower fades to a dry brown and hangs its head; each is gone at a dryness of its own, and in
  // dead land none is left (its stem and head share one phase, so they go together)
  float dry = texture2D(uDryMap, clamp((base.xz - uDryRect.xy) * uDryRect.zw, 0.0, 1.0)).r;
  vDry = dry;
  if (dry > mix(0.15, 0.8, fract(iPar.z * 7.31 + 0.19))) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 axis = iTip.xyz * vec3(1.0 + 0.3 * dry, 1.0 - 0.35 * dry, 1.0 + 0.3 * dry);
  float len = length(axis);
  float ph = iPar.z + base.x * 0.3 + base.z * 0.2;
  vec3 sway = vec3(sin(uTime * 1.7 + ph), 0.0, cos(uTime * 1.3 + ph)) * 0.08 * len * uWind;
  // someone walking through: the flowers at her feet lean away and dip a little, as the grass does
  vec2 away = base.xz - uWalker.xz;
  float wd = length(away);
  float push = (1.0 - smoothstep(0.08, uWalker.w, wd)) * (1.0 - smoothstep(1.0, 2.5, abs(base.y - uWalker.y)));
  sway += (vec3(away.x, 0.0, away.y) / max(wd, 0.05) * 0.5 - vec3(0.0, 0.16, 0.0)) * push * len;
  vec3 tip = base + axis + sway;
  float u = position.x, v = position.y + 0.5;
  vec3 wp;
  float lit = 0.7;
  if (iTip.w < 0.5) {                                                // a stem: a ribbon from foot to tip, turned to the eye
    vec3 c = base + axis * v + sway * v * v;
    wp = c + normalize(cross(axis, cameraPosition - c)) * u * iPar.x;
  } else if (iTip.w < 1.5) {                                         // a head: a disc turned its own way, half toward the eye
    vec3 n = normalize(iTilt + normalize(cameraPosition - tip) * uTurn);
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-4, 0.0, 0.0));
    wp = tip + (r * u + cross(n, r) * position.y) * iPar.x;
    lit = dot(n, uSun) * 0.5 + 0.5;
  } else {                                                           // a spire: upright on the tip, turned to the eye about its length
    // (seen from above it would lie foreshortened to a sliver: it leans a little toward the top of the screen instead)
    vec3 a = normalize(normalize(axis + sway * 2.0) + vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]) * 0.75);
    vec3 side = normalize(cross(a, cameraPosition - tip));
    wp = tip + side * u * iPar.x + a * v * iPar.w + sway * v * 0.6;
    lit = 0.6 + 0.25 * dot(cross(side, a), uSun);
  }
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vHaze = hazeAt(mv.xyz);
  gl_Position = projectionMatrix * mv;
  vUv = vec2((uv.x + mod(iPar.y, 4.0)) * 0.25, (uv.y + 1.0 - floor(iPar.y / 4.0)) * 0.5);
  vA = iColA; vB = iColB; vC = iCen;
  vK = vec3(iTip.w, v, lit);
}`;
const FS = /* glsl */`
${NATURE_HAZEF}
uniform sampler2D uMask;
uniform vec3 uStemA, uStemB;
varying vec2 vUv;
varying vec3 vA;
varying vec3 vB;
varying vec3 vC;
varying vec3 vK;
varying float vDry;
void main() {
  vec4 m = texture2D(uMask, vUv);
  float w = max(fwidth(m.r), 1e-3) * 0.75;
  float alpha = smoothstep(0.5 - w, 0.5 + w, m.r);
  if (alpha < 0.02) discard;
  float tone = m.g / max(m.r, 0.05);
  vec3 col;
  if (vK.x < 0.5) col = mix(uStemB, uStemA, clamp(vK.y * 0.7 + tone * 0.4, 0.0, 1.0));      // the grass's greens, lighter toward the tip
  else {
    float t = tone + (vK.z - 0.62) * 0.55;                           // three flat tones; turned from the sun, a tone darker
    col = mix(vB, vA, step(0.4, t));
    col = mix(col, mix(vA, vec3(1.0), 0.45), step(0.88, t));
    if (m.b > m.r * 0.5) col = vC * (0.8 + 0.2 * step(0.5, tone));
  }
  if (vDry > 0.002) col = mix(col, dot(col, vec3(0.3, 0.6, 0.1)) * vec3(1.08, 0.96, 0.78) * 0.85, smoothstep(0.02, 0.5, vDry));      // DRYNESS: faded to a dry brown
  gl_FragColor = vec4(mix(col, uHaze, vHaze), alpha);
}`;
let material = null;
function flowerMaterial() {
  return material || (material = new THREE.ShaderMaterial({
    uniforms: { ...natureUniforms, uSun: SUN, uTurn: { value: 0.85 }, uMask: { value: flowerAtlas() },
      uStemA: { value: rgb('#a8cc52') }, uStemB: { value: rgb('#5f8f38') } },      // (the grass: its everyday green up to near its tips' colour)
    vertexShader: VS, fragmentShader: FS, alphaToCoverage: true, side: THREE.DoubleSide,
  }));
}

// --------------------------------------------------------------------------
export function createFlowerDrift({ center = [0, 0], radius = 1.4, seed = 1, heightAt = null, bed = 'pink', allow = null, avoid = [] } = {}) {
  const rng = mulberry32(seed * 3301 + 7);
  const mix = FLOWER_BEDS[bed] || FLOWER_BEDS.pink, total = mix.reduce((a, k) => a + k[3], 0);
  const B = [], T = [], P = [], CA = [], CB = [], CC = [], TL = [];
  const feet = [];
  const want = Math.round(Math.PI * radius * radius * PLANTS_PER_M2);
  let stems = 0, heads = 0;
  for (let tries = 0; tries < want * 16 && feet.length < want; tries++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * radius * 1.15;
    const x = center[0] + Math.cos(a) * d, z = center[1] + Math.sin(a) * d;
    const reach = radius * (0.62 + 0.53 * noise(x * 0.85, z * 0.85, seed));        // a ragged outline, never past 1.15 of the radius
    if (rng() < sstep(0.45, 1.0, d / reach)) continue;                              // thinning toward it
    if (allow && !allow(x, z)) continue;
    if (avoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < ar)) continue;
    if (feet.some(f => Math.hypot(f[0] - x, f[1] - z) < GAP)) continue;
    feet.push([x, z]);
    // which kind: plants of a kind gather (a slow noise picks, with a little chance in it)
    let pick = (noise(x * 1.5 + 31, z * 1.5 + 17, seed + 3) * 0.75 + rng() * 0.25) * total, kind = mix[0];
    for (const k of mix) { pick -= k[3]; if (pick <= 0) { kind = k; break; } }
    const K = KINDS[kind[0]], tone = TONES[kind[1][Math.floor(rng() * kind[1].length)]], cen = rgb(CENTRES[kind[2]] || CENTRES.gold);
    const cA = rgb(tone[0]), cB = rgb(tone[1]), y0 = heightAt ? heightAt(x, z) : 0;
    const n = Math.round(range(rng, K.stems[0], K.stems[1])), tall = range(rng, K.tall[0], K.tall[1]), a0 = rng() * 6.28;
    for (let i = 0; i < n; i++) {
      const az = a0 + i * 2.4 + (rng() - 0.5) * 0.9, h = tall * (i ? range(rng, 0.68, 0.95) : 1), off = h * K.lean * range(rng, 0.25, 1) * (n > 1 ? 1 : 0.5);
      const bx = x + (rng() - 0.5) * 0.04, bz = z + (rng() - 0.5) * 0.04, ph = rng() * 6.28;
      const tx = Math.cos(az) * off, tz = Math.sin(az) * off;
      const sh = range(rng, 0.94, 1.0);
      const push = (kindW, size, cellI, len = 0) => {
        B.push(bx, y0 - 0.02, bz); T.push(tx, h, tz, kindW); P.push(size, cellI, ph, len);
        CA.push(cA.x * sh, cA.y * sh, cA.z * sh); CB.push(cB.x * sh, cB.y * sh, cB.z * sh); CC.push(cen.x, cen.y, cen.z);
      };
      push(0, h * STEM_W, rng() < 0.5 ? 0 : 1); TL.push(0, 1, 0); stems++;
      if (K.spire) {
        const high = range(rng, K.high[0], K.high[1]) * (i ? 0.85 : 1);
        push(2, high * SPIRE_W, K.cell, high); TL.push(0, 1, 0);
      } else {
        const bud = rng() < K.bud, size = range(rng, K.size[0], K.size[1]) * (bud ? 0.5 : 1);
        push(1, size, bud ? 7 : K.cell);
        // its own way: up, leaning out with its stem and a little at random
        const ta = rng() * 6.28, tk = range(rng, 0.1, 0.55);
        const v = new THREE.Vector3(Math.cos(ta) * tk + Math.cos(az) * 0.3, 1, Math.sin(ta) * tk + Math.sin(az) * 0.3).normalize();
        TL.push(v.x, v.y, v.z);
      }
      heads++;
    }
  }
  const quad = new THREE.PlaneGeometry(1, 1, 1, 3);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  const attr = (name, arr, n) => g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(arr), n));
  attr('iBase', B, 3); attr('iTip', T, 4); attr('iPar', P, 4); attr('iColA', CA, 3); attr('iColB', CB, 3); attr('iCen', CC, 3); attr('iTilt', TL, 3);
  g.instanceCount = B.length / 3;
  const mesh = new THREE.Mesh(g, flowerMaterial());
  mesh.frustumCulled = false;
  mesh.name = 'flowers';
  mesh.userData = { kind: 'flowers', bed, plants: feet.length, stems, heads, height: 0.6, dispose() { g.dispose(); } };
  return mesh;
}
