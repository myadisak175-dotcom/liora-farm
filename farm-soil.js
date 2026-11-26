// farm-soil.js  —  the farm's tilled ground: squares of a metre, dug one at a time (as in Stardew Valley), each tilled or not,
// wet or dry, given magic, or under the curse. One job: the ground of the beds, as data and as a picture on the land.
// No tools, no crops, no gameplay: what is done to a square is asked of it here (soil.html does it with buttons for now).
//
// How it looks, the game's way (26 Nov 2026, chosen: "ขุดทีละช่องแบบ Stardew", "วาดบนพื้นลายพู่กัน", every state):
//   - BEDS: squares tilled side by side are one bed. There is no grid to be seen: each square is a box with its corners worn
//     round, the boxes are joined with a soft minimum (so an inside corner fills in), and the edge wanders a little, as a
//     bed dug by hand does. A square comes up from its middle as it is dug. Round a bed the meadow's blades come up short
//     and thin (the ground map is told where the beds are: the grass stands back from them)
//   - FURROWS: painted, not modelled. Two ridges to a square, along the farm's x, bending a little: in four flat tones laid
//     by the light (the trough dark, the side away from the sun in shade, the side toward it lit, the top between), their
//     edges broken with the ways' own brush (assets/ground/path-paint.webp), clods here and there. They end softly at a
//     bed's edge. Far off they are one tone, so nothing shimmers
//   - WET: darker and richer, drying in patches (not square by square); water glints in the troughs. Watered, it spreads
//     from the middle of the square; rained on, out from where the rain falls
//   - MAGIC: deeper, cooler soil with specks in her water's aqua twinkling in it (painted, no light of their own)
//   - CURSE: the furrows gone under a grey crust, cracked (the dead land's own earth, assets/ground/dry-paint.webp), with
//     dark stains; a cursed square shows as such whether it was dug or not, and has to be lifted before anything grows
//
//   const soil = createFarmSoil({ x0, z0, cols, rows, heightAt, map, paint, crack });   // map: the ground map the grass grows by
//   scene.add(soil.mesh);
//   soil.at(x, z) -> [i, j] or null            which square a point is in
//   soil.get(i, j) -> { tilled, wet, magic, cursed }   (0..1 each, as they are now)
//   soil.till(i, j)    soil.untill(i, j)       dig it / back to grass (everything on it goes)
//   soil.water(i, j, delay)                    wet through, spreading from its middle (after delay seconds)
//   soil.rain(x, z, r)                         every dug or cursed square within r: wet, the wet running out from (x, z)
//   soil.enrich(i, j)  soil.curse(i, j)  soil.lift(i, j)    magic in it / the curse on it / the curse off it
//   soil.update(dt)                            each frame: drying, the squares coming and going; the picture sent when changed
//   soil.setSun(dir)                           which side of a ridge is lit
//   soil.dryTime                               seconds a wet square takes to dry (a day, in the game: 120 here to see it)

import * as THREE from 'three';
import { _internal } from './stylized-nature.js';

const { NOISE, HAZEF, rgb, shared } = _internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the soil's tones (raw display colours, as the kit's shaders work): dry tilled earth, deep to lit; what wet earth is
// multiplied by; a glint of water; magic's specks; the curse's stains and cracks
export const SOIL_COLORS = {
  trough: '#6b4b33', shade: '#83603f', base: '#9b7451', lit: '#b88d60', clodLight: '#c79d6d', clodDark: '#5c402c',
  wet: '#9c9aa2', glint: '#d3e3ea', magicTint: '#d2deef', speck: '#7fe9e6', speckCore: '#e9fffd',
  stain: '#57465f', crack: '#3d3442', crust: '#a39788',
};

const GLSL = /* glsl */`
uniform sampler2D uSoil, uSoilPaint, uSoilCrack;
uniform vec4 uSoilRect;          // x0, z0, metres a square, 1 / metres a square
uniform vec2 uSoilSize;          // squares across (x), along (z)
uniform vec2 uSoilSun;           // toward the sun, flat on the ground
uniform float uSoilHasPaint, uSoilHasCrack;
uniform vec3 uTrough, uShade, uBase, uLit, uClodL, uClodD, uWet, uGlint, uMagicTint, uSpeck, uSpeckCore, uStain, uCrack, uCrust;
float sdRBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sminP(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
// x: metres from the bed's edge (less than 0 inside), y: how dug the square under the point is. Outside a bed and at its edge:
// the dug squares' boxes, corners worn round, joined with a soft minimum (an inside corner fills in). Inside: how far it is to
// the nearest square that is not dug (two dug squares side by side share an edge that is no edge of the bed)
vec2 bedAt(vec2 lp) {
  vec2 c = floor(lp);
  float sd = 9.0, inner = 9.0, here = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 q = c + vec2(float(i), float(j));
    float t = 0.0;
    if (q.x >= 0.0 && q.y >= 0.0 && q.x < uSoilSize.x && q.y < uSoilSize.y) { vec4 s = texelFetch(uSoil, ivec2(q), 0); t = max(s.r, s.a); }      // dug, or under the curse
    if (i == 0 && j == 0) here = t;
    if (t < 0.5) { vec2 d = abs(lp - q - 0.5) - 0.5; inner = min(inner, length(max(d, 0.0)) * uSoilRect.z); }      // (a square not dug: how far to it)
    if (t < 0.02) continue;
    float d = sdRBox(lp - q - 0.5, vec2(0.5 * min(1.0, t * 1.25)), 0.2 + 0.25 * (1.0 - t)) * uSoilRect.z;   // (a square being dug grows from its middle)
    sd = sminP(sd, d, 0.18);
  }
  if (here >= 0.5 && sd <= 0.0) sd = min(sd, -inner);
  return vec2(sd, here);
}
`;

export function createFarmSoil({ x0 = 0, z0 = 0, cols = 16, rows = 12, tile = 1, heightAt = () => 0, map = null, paint = null, crack = null, colors = SOIL_COLORS } = {}) {
  const n = cols * rows;
  // what each square is, and what it is becoming: tilled, wet, magic, cursed (0..1 now; targets; how fast)
  const now = { tilled: new Float32Array(n), wet: new Float32Array(n), magic: new Float32Array(n), cursed: new Float32Array(n) };
  const want = { tilled: new Float32Array(n), magic: new Float32Array(n), cursed: new Float32Array(n) };
  const wetStart = new Float32Array(n).fill(-1);                         // seconds until a square's water reaches it (-1: none coming)
  const pix = new Uint8Array(n * 4);
  const tex = new THREE.DataTexture(pix, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  let dirty = false;
  const api = { dryTime: 120 };
  const id = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? -1 : j * cols + i);

  // ---- the picture on the land: a sheet over the farm, a hair above the ground, a point every quarter metre so it lies on it
  const W = cols * tile, D = rows * tile, M = 0.5, STEP = 0.25;
  const nx = Math.ceil((W + 2 * M) / STEP) + 1, nz = Math.ceil((D + 2 * M) / STEP) + 1, pos = new Float32Array(nx * nz * 3), idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 - M + i * STEP, z = z0 - M + j * STEP, o = (j * nx + i) * 3;
    pos[o] = x; pos[o + 1] = heightAt(x, z) + 0.02; pos[o + 2] = z;
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + nx; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeBoundingSphere();
  const C = {};
  for (const k in SOIL_COLORS) C[k] = rgb(colors[k] || SOIL_COLORS[k]);
  const sun = new THREE.Vector2(-0.62, 0.48).normalize();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSoil: { value: tex }, uSoilPaint: { value: paint }, uSoilCrack: { value: crack },
      uSoilHasPaint: { value: paint ? 1 : 0 }, uSoilHasCrack: { value: crack ? 1 : 0 },
      uSoilRect: { value: new THREE.Vector4(x0, z0, tile, 1 / tile) }, uSoilSize: { value: new THREE.Vector2(cols, rows) }, uSoilSun: { value: sun },
      uTrough: { value: C.trough }, uShade: { value: C.shade }, uBase: { value: C.base }, uLit: { value: C.lit }, uClodL: { value: C.clodLight }, uClodD: { value: C.clodDark },
      uWet: { value: C.wet }, uGlint: { value: C.glint }, uMagicTint: { value: C.magicTint }, uSpeck: { value: C.speck }, uSpeckCore: { value: C.speckCore },
      uStain: { value: C.stain }, uCrack: { value: C.crack }, uCrust: { value: C.crust },
      uTime: shared.uTime, uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vWP;
      varying float vHaze;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      ${GLSL}
      uniform float uTime;
      varying vec3 vWP;
      void main() {
        vec2 xz = vWP.xz, lp = (xz - uSoilRect.xy) * uSoilRect.w;
        float foot = length(fwidth(xz));                                     // metres a pixel covers
        vec2 bed = bedAt(lp);
        // the edge wanders, as a bed dug by hand
        float sd = bed.x + (noise2(xz * 2.3) - 0.5) * 0.07 + (noise2(xz * 7.0 + 3.0) - 0.5) * 0.025;
        if (sd > 0.08) discard;
        vec4 s = texture2D(uSoil, lp / uSoilSize);                         // the squares' states, eased from one to the next
        float n1 = noise2(xz * 1.3), n2 = noise2(xz * 4.1 + 5.0), brush = 1.0;
        if (uSoilHasPaint > 0.5) {
          vec3 pp = mix(texture2D(uSoilPaint, xz / 3.4).rgb, texture2D(uSoilPaint, mat2(0.8, -0.6, 0.6, 0.8) * xz / 5.1).rgb, 0.4);
          brush = dot(pp, vec3(0.3, 0.6, 0.1)) / 0.75;                       // the brush's strokes, as light and dark (the picture's mean is 0.75)
        }
        // FURROWS: two ridges to a square, along x, bending a little; flat tones laid by the light
        float v = lp.y * 2.0 + (noise2(xz * 0.55 + 11.0) - 0.5) * 0.35 + (noise2(xz * 2.2) - 0.5) * 0.06;
        float f = fract(v), ridge = 0.5 - 0.5 * cos(f * 6.2832), side = -sin(f * 6.2832) * uSoilSun.y;      // (side > 0: this side of the ridge faces the sun)
        float rows_ = smoothstep(0.05, 0.2, -sd) * (1.0 - smoothstep(0.05, 0.16, foot));      // furrows end softly at the edge, and are gone far off
        float tone = mix(0.5, ridge * 0.62 + side * 0.3 + 0.12, rows_) + (brush - 1.0) * 0.5 + (n2 - 0.5) * 0.1;
        float w = 0.03 + foot * 2.0;
        vec3 col = mix(uTrough, uShade, smoothstep(0.2 - w, 0.2 + w, tone));
        col = mix(col, uBase, smoothstep(0.4 - w, 0.4 + w, tone));
        col = mix(col, uLit, smoothstep(0.66 - w, 0.66 + w, tone));
        col *= mix(1.0, brush, 0.35);
        // clods, here and there on the ridges
        vec2 cq = xz / 0.11, ci = floor(cq), cf = fract(cq) - 0.5 - (vec2(hash2(ci + 0.3125), hash2(ci + 0.5625)) - 0.5) * 0.5;
        float ch = hash2(ci);
        if (ch < 0.16 && ridge > 0.35) col = mix(col, ch < 0.07 ? uClodD : uClodL, (1.0 - smoothstep(0.17, 0.24, length(cf))) * rows_);
        // the bed's edge: the turned earth darker where it meets the grass
        col *= 1.0 - 0.14 * smoothstep(-0.12, 0.0, sd);
        // WET: darker and richer, drying in patches; water glinting in the troughs
        float wn = n1 * 0.6 + n2 * 0.4;
        float wet = smoothstep(0.42, 0.58, s.g - (wn - 0.5) * 0.3);          // (its edge near the square's own: which squares are watered still reads)
        col = mix(col, col * uWet * mix(1.0, 0.86, 1.0 - ridge), wet);
        float pool = (1.0 - smoothstep(0.08, 0.22, ridge)) * rows_ * smoothstep(0.75, 0.95, s.g);
        float gl = smoothstep(0.66, 0.72, noise2(vec2(xz.x * 3.4 + uTime * 0.03, v * 6.0)) * 0.7 + noise2(xz * 11.0) * 0.3);
        col = mix(col, uGlint, pool * gl * 0.32);
        // MAGIC: deeper, cooler earth with specks in her water's aqua, twinkling
        float mg = smoothstep(0.3, 0.7, s.b + (n1 - 0.5) * 0.3);
        col = mix(col, col * uMagicTint * 0.86, mg * 0.8);
        vec2 sq = xz / 0.16, si = floor(sq), sf = fract(sq) - 0.5 - (vec2(hash2(si + 0.1875), hash2(si + 0.8125)) - 0.5) * 0.5;
        float sh = hash2(si + 0.4375);
        if (sh < 0.13 * mg) {
          float tw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.2 + sh * 97.0)), k = max(1.0, foot / 0.012);     // (never smaller than a couple of pixels)
          vec2 a = abs(sf) / k;
          float star = max(0.0, 1.0 - (a.x * 2.6 + a.y * 0.42) * 6.0) + max(0.0, 1.0 - (a.y * 2.6 + a.x * 0.42) * 6.0);
          float core = 1.0 - smoothstep(0.025, 0.055, length(a));
          col = mix(col, uSpeck, clamp(star, 0.0, 1.0) * tw);
          col = mix(col, uSpeckCore, core * tw * 0.9);
        }
        // CURSE: the furrows gone under a grey crust, cracked, stained
        float cu = smoothstep(0.3, 0.7, s.a + (n1 - 0.5) * 0.3);
        if (cu > 0.0) {
          vec3 crust = uCrust * (0.92 + 0.12 * n2);
          float cr = 0.0;
          if (uSoilHasCrack > 0.5) {
            vec4 dp = texture2D(uSoilCrack, xz / 2.6);
            crust = mix(crust, dp.rgb * vec3(0.86, 0.84, 0.86), 0.55);
            cr = 1.0 - dp.a;
          }
          crust = mix(crust, uStain, smoothstep(0.6, 0.68, noise2(xz * 0.7 + 9.0)) * 0.55);
          crust = mix(crust, uCrack, cr * 0.9 * (1.0 - smoothstep(0.03, 0.08, foot)));
          col = mix(col, crust, cu);
        }
        col = mix(col, uHaze, vHaze);
        gl_FragColor = vec4(col, 1.0 - smoothstep(-0.03, 0.08, sd));
      }`,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'farmSoil'; mesh.renderOrder = -5;                          // (after the land, before the grass's see-through and the water)
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); tex.dispose(); };

  // ---- the grass stands back from the beds: the ground map is told where they are (its grass, its fourth number, laid low
  // over a bed and coming back up over a hand's breadth round it), and keeps what it had to give it back
  const MS = map ? map.size : 0, MR = map ? map.radius : 1, [MCX, MCZ] = map ? map.center : [0, 0];
  const keep = map ? new Map() : null;                                    // texel -> the grass it had
  const occ = (x, z) => {                                                // the bed's edge, as the shader has it (without its wander)
    const lx = (x - x0) / tile, lz = (z - z0) / tile, ci = Math.floor(lx), cj = Math.floor(lz);
    let sd = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const k = id(ci + i, cj + j);
      if (k < 0) continue;
      const t = Math.max(now.tilled[k], now.cursed[k]);
      if (t < 0.02) continue;
      const hb = 0.5 * Math.min(1, t * 1.25), r = 0.2 + 0.25 * (1 - t), px = Math.abs(lx - (ci + i) - 0.5) - hb + r, pz = Math.abs(lz - (cj + j) - 0.5) - hb + r;
      const d = (Math.hypot(Math.max(px, 0), Math.max(pz, 0)) + Math.min(Math.max(px, pz), 0) - r) * tile;
      const h = Math.max(0.18 - Math.abs(sd - d), 0) / 0.18; sd = Math.min(sd, d) - h * h * 0.18 * 0.25;
    }
    return sd;
  };
  const stampGrass = (i, j) => {
    if (!map) return;
    const s = MS / (2 * MR), bx0 = x0 + (i - 1) * tile, bz0 = z0 + (j - 1) * tile;
    const i0 = Math.max(0, Math.floor((bx0 - MCX + MR) * s)), i1 = Math.min(MS - 1, Math.ceil((bx0 + 3 * tile - MCX + MR) * s));
    const j0 = Math.max(0, Math.floor((bz0 - MCZ + MR) * s)), j1 = Math.min(MS - 1, Math.ceil((bz0 + 3 * tile - MCZ + MR) * s));
    for (let b = j0; b <= j1; b++) for (let a = i0; a <= i1; a++) {
      const o = (b * MS + a) * 4 + 3, x = MCX - MR + (a + 0.5) / s, z = MCZ - MR + (b + 0.5) / s;
      if (!keep.has(o)) keep.set(o, map.data[o]);
      const k = ss(-0.04, 0.22, occ(x, z));                              // 0 on the bed .. 1 a hand's breadth off it
      map.data[o] = Math.round(keep.get(o) * k * (0.55 + 0.45 * ss(0.22, 0.5, occ(x, z))));      // (short and thin first)
    }
    map.texture.needsUpdate = true;
  };

  // ---- what is done to a square
  const mark = k => { dirty = true; return k; };
  api.at = (x, z) => { const i = Math.floor((x - x0) / tile), j = Math.floor((z - z0) / tile); return id(i, j) < 0 ? null : [i, j]; };
  api.middle = (i, j) => [x0 + (i + 0.5) * tile, z0 + (j + 0.5) * tile];
  api.get = (i, j) => { const k = id(i, j); return k < 0 ? null : { tilled: now.tilled[k], wet: now.wet[k], magic: now.magic[k], cursed: now.cursed[k] }; };
  api.till = (i, j) => { const k = id(i, j); if (k >= 0) mark(want.tilled[k] = 1); };
  api.untill = (i, j) => { const k = id(i, j); if (k < 0) return; want.tilled[k] = 0; want.magic[k] = 0; want.cursed[k] = 0; wetStart[k] = -1; now.wet[k] = 0; mark(k); };
  api.water = (i, j, delay = 0) => { const k = id(i, j); if (k >= 0 && (want.tilled[k] > 0 || want.cursed[k] > 0)) { wetStart[k] = delay; mark(k); } };
  api.rain = (x, z, r) => {
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const [mx, mz] = api.middle(i, j), d = Math.hypot(mx - x, mz - z);
      if (d <= r + tile * 0.5) api.water(i, j, d / 3.2);                 // (the wet runs out from where it falls, 3 m a second)
    }
  };
  api.enrich = (i, j) => { const k = id(i, j); if (k >= 0 && want.tilled[k] > 0) mark(want.magic[k] = 1); };
  api.curse = (i, j) => { const k = id(i, j); if (k >= 0) { want.cursed[k] = 1; want.magic[k] = 0; mark(k); } };
  api.lift = (i, j) => { const k = id(i, j); if (k >= 0) mark(want.cursed[k] = 0); };
  api.setSun = dir => { const l = Math.hypot(dir.x, dir.z); if (l > 1e-3) sun.set(dir.x / l, dir.z / l); };

  // ---- each frame: the squares come and go, the water arrives and dries; the picture is sent when anything changed
  api.update = dt => {
    let changed = dirty; dirty = false;
    const grassAgain = new Set();
    for (let k = 0; k < n; k++) {
      const ease = (a, target, rate) => { const v = a + Math.sign(target - a) * Math.min(Math.abs(target - a), rate * dt); if (v !== a) changed = true; return v; };
      const t0 = Math.max(now.tilled[k], now.cursed[k]);
      now.tilled[k] = ease(now.tilled[k], want.tilled[k], 4);              // (dug in a quarter of a second)
      now.cursed[k] = ease(now.cursed[k], want.cursed[k], 2);
      now.magic[k] = ease(now.magic[k], want.magic[k], 1.25);
      if (wetStart[k] >= 0) {                                              // the water on its way: then it soaks in over half a second
        wetStart[k] -= dt;
        if (wetStart[k] < 0) { now.wet[k] = Math.min(1, now.wet[k] + dt / 0.5); changed = true; if (now.wet[k] < 1) wetStart[k] = 0; else wetStart[k] = -1; }
      } else if (now.wet[k] > 0) { now.wet[k] = Math.max(0, now.wet[k] - dt / api.dryTime); changed = true; }
      if (Math.max(now.tilled[k], now.cursed[k]) !== t0) grassAgain.add(k);
    }
    if (!changed) return;
    for (let k = 0; k < n; k++) {
      pix[k * 4] = Math.round(now.tilled[k] * 255); pix[k * 4 + 1] = Math.round(now.wet[k] * 255);
      pix[k * 4 + 2] = Math.round(now.magic[k] * 255); pix[k * 4 + 3] = Math.round(now.cursed[k] * 255);
    }
    tex.needsUpdate = true;
    for (const k of grassAgain) stampGrass(k % cols, Math.floor(k / cols));
  };
  api.mesh = mesh;
  api.texture = tex;
  api.cols = cols; api.rows = rows; api.tile = tile; api.x0 = x0; api.z0 = z0;
  return api;
}
