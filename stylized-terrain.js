/* ==========================================================================
   stylized-terrain.js  —  valley terrain, river, waterfall, dirt path, bridge
   Same vector-art look as stylized-nature.js (needs it next to this file).

     const V = createValley({ seed: 1 });
     scene.add(V.group);
     V.heightAt(x, z)      ground height          V.surfaceAt(x, z)  same, but on top of the bridge deck
     V.route               [[x, z], ...] the dirt path over the bridge (for walkers)
     V.kindAt(x, z)        'water' | 'bank' (sand beach) | 'path' | 'cliff' | 'plateau' | 'floor'
     createValley({ path: false, bridge: false })   leave out the dirt path / the bridge
     createValley({ skirt: true })   land continues past the map edge to the far hills (use with haze)
     V.bankRoute(side)     [[x, z], ...] a walk along one sandy bank
     V.slopeAt(x, z)       0 = flat .. 1 = vertical
     V.riverX(z), V.riverHalfWidth(z), V.cliffLine(x, z), V.pathDist(x, z)
     V.bridge, V.waterfall, V.bounds
   createBridge({ length, width, arch, seed })   wooden plank bridge (spans the x axis)

   Mobile-safe shaders: no uniform arrays, no indexed loops.
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { _internal, createCardCluster } from './stylized-nature.js';

const { NOISE, HAZEF, rgb, fbm3, mulberry32, range, shared } = _internal;
const HAZE_U = () => ({ uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax });
const HAZEV = /* glsl */`
uniform float uHazeNear, uHazeFar, uHazeMax;
varying float vHaze;`;
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// --------------------------------------------------------------------------
// palettes
// --------------------------------------------------------------------------
const TERRAIN_COLORS = {
  grass: ['#7a9b3c', '#86a640', '#93b145', '#a5c04b'],
  rock: ['#e2d6b4', '#c2b38f', '#9a8b6c', '#6b604c'],      // sunlit top .. deep seams
  sand: ['#efe1b6', '#e4cf9a', '#cbb07c'],               // dry light, dry, wet (at the water)
  path: ['#e3cc98', '#c4a76f'],
};
const WATER_COLORS = { deep: '#2f86b2', mid: '#41a2c6', shallow: '#69bfd2', edge: '#a3dcd2', line1: '#d9f3f3', line2: '#ffffff', foam: '#f4fbf8' };

// --------------------------------------------------------------------------
// materials
// --------------------------------------------------------------------------
function terrainMaterial(far, half, zc) {
  const C = TERRAIN_COLORS;
  return new THREE.ShaderMaterial({
    uniforms: {
      uG0: { value: rgb(C.grass[0]) }, uG1: { value: rgb(C.grass[1]) }, uG2: { value: rgb(C.grass[2]) }, uG3: { value: rgb(C.grass[3]) },
      uR0: { value: rgb(C.rock[0]) }, uR1: { value: rgb(C.rock[1]) }, uR2: { value: rgb(C.rock[2]) }, uR3: { value: rgb(C.rock[3]) },
      uB0: { value: rgb(C.sand[0]) }, uB1: { value: rgb(C.sand[1]) }, uB2: { value: rgb(C.sand[2]) },
      uP0: { value: rgb(C.path[0]) }, uP1: { value: rgb(C.path[1]) },
      uFar: { value: rgb(far) }, uHalf: { value: new THREE.Vector2(half[0], half[1]) }, uZc: { value: zc },
      ...HAZE_U(),
    },
    vertexShader: /* glsl */`
      ${HAZEV}
      attribute float aBank;   // height above the local water level
      attribute float aPath;   // 1 on the dirt path
      varying vec3 vWP;
      varying vec3 vN;
      varying float vBank;
      varying float vPath;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vBank = aBank;
        vPath = aPath;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      uniform vec3 uG0, uG1, uG2, uG3, uR0, uR1, uR2, uR3, uB0, uB1, uB2, uP0, uP1, uFar;
      uniform vec2 uHalf;
      uniform float uZc;
      varying vec3 vWP;
      varying vec3 vN;
      varying float vBank;
      varying float vPath;
      void main() {
        vec3 n = normalize(vN);
        float j = noise2(vWP.xz * 0.9) * 0.5 + noise2(vWP.xz * 3.0) * 0.25;   // jagged borders
        vec3 col;
        if (n.y + (j - 0.37) * 0.3 < 0.7) {
          // cliff face: horizontal rock strata, lit faces lighter, dark seams between layers
          float along = vWP.x * 0.7 + vWP.z * 0.7;
          float st = vWP.y * 0.85 + (noise2(vec2(along * 0.11, vWP.y * 0.2)) - 0.5) * 1.8;
          float band = fract(st / 2.6);                                     // 0 bottom .. 1 top of a layer
          float alt = mod(floor(st / 2.6), 2.0);                            // alternating layers
          float lit = dot(n, normalize(vec3(-0.55, 0.5, 0.65))) * 0.5 + 0.5;
          float v = 0.36 + lit * 0.34 + alt * 0.1 + (band - 0.5) * 0.2;     // each layer lighter on top, like the leaves
          v += (noise2(vec2(along * 0.5, vWP.y * 2.2)) - 0.5) * 0.12;
          if (band < 0.12) v -= 0.24;                                       // dark seam between layers
          col = v > 0.72 ? uR0 : (v > 0.56 ? uR1 : (v > 0.4 ? uR2 : uR3));
        } else {
          float s = noise2(vWP.xz * 0.08) * 0.6 + noise2(vWP.xz * 0.3) * 0.3 + noise2(vWP.xz * 1.6) * 0.1;
          float lit = dot(n, normalize(vec3(-0.3, 1.0, 0.35)));
          float g = s * 0.6 + (lit - 0.9) * 2.6 + 0.2;
          col = g > 0.6 ? uG3 : (g > 0.45 ? uG2 : (g > 0.3 ? uG1 : uG0));
          float b = vBank + (j - 0.37) * 0.5;
          if (b < 0.62) col = b < 0.16 ? uB2 : (noise2(vWP.xz * 0.35) > 0.55 ? uB0 : uB1);   // sand beach, wet at the water
          float p = vPath + (j - 0.37) * 0.45;
          if (p > 0.5) col = p > 0.72 ? uP0 : uP1;                          // dirt path, darker rim
        }
        col = mix(col, uHaze, vHaze);
        vec2 q = abs(vec2(vWP.x, vWP.z - uZc)) / uHalf;
        col = mix(col, uFar, smoothstep(0.8, 0.99, max(q.x, q.y)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function waterMaterial(far, half, zc) {
  const W = WATER_COLORS;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uW0: { value: rgb(W.deep) }, uW1: { value: rgb(W.mid) }, uW2: { value: rgb(W.shallow) }, uW3: { value: rgb(W.edge) },
      uL1: { value: rgb(W.line1) }, uL2: { value: rgb(W.line2) }, uFoam: { value: rgb(W.foam) },
      uFar: { value: rgb(far) }, uHalf: { value: new THREE.Vector2(half[0], half[1]) }, uZc: { value: zc },
      ...HAZE_U(),
    },
    vertexShader: /* glsl */`
      ${HAZEV}
      attribute float aDepth;
      attribute vec2 aFlow;    // x: distance downstream, y: across (-1..1)
      varying float vDepth;
      varying vec2 vFlow;
      varying vec3 vWP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vDepth = aDepth;
        vFlow = aFlow;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      uniform float uTime;
      uniform vec3 uW0, uW1, uW2, uW3, uL1, uL2, uFoam, uFar;
      uniform vec2 uHalf;
      uniform float uZc;
      varying float vDepth;
      varying vec2 vFlow;
      varying vec3 vWP;
      void main() {
        float n = noise2(vec2(vFlow.y * 2.0, vFlow.x * 0.2 - uTime * 0.4));
        float t = vDepth + (n - 0.5) * 0.3;
        if (t < -0.02) discard;                                             // under the beach
        vec3 col = t > 1.05 ? uW0 : (t > 0.6 ? uW1 : (t > 0.28 ? uW2 : uW3));
        // Ghibli-style current lines: long curved strokes that taper at both ends and drift downstream
        float along = vFlow.x, across = vFlow.y;
        float u1 = across * 3.2 + sin(along * 0.22 + across * 1.7) * 0.55 + sin(along * 0.07) * 0.8;
        float v1 = along * 0.09 - uTime * 0.16;
        float id1 = floor(u1);
        float w1 = max(noise2(vec2(id1 * 7.3, v1 * 3.0 + id1 * 1.3)) - 0.52, 0.0) * 0.22;
        float d1 = abs(fract(u1) - 0.5), a1 = fwidth(u1);
        col = mix(col, uL1, clamp((w1 - d1) / a1, 0.0, 1.0) * step(0.2, t));      // zero width -> no hairline
        float u2 = across * 6.5 + sin(along * 0.4 + across * 3.0 + 1.3) * 0.45;
        float v2 = along * 0.16 - uTime * 0.32;
        float id2 = floor(u2);
        float w2 = max(noise2(vec2(id2 * 5.1 + 3.0, v2 * 3.0 - id2 * 0.7)) - 0.6, 0.0) * 0.28;
        float d2 = abs(fract(u2) - 0.5), a2 = fwidth(u2);
        col = mix(col, uL2, clamp((w2 - d2) / a2, 0.0, 1.0) * step(0.15, t));
        // foam line along the shore
        float f = noise2(vec2(vFlow.x * 1.3 - uTime * 0.5, vFlow.y * 3.0));
        if (t < 0.1 + f * 0.1) col = uFoam;
        col = mix(col, uHaze, vHaze);
        vec2 q = abs(vec2(vWP.x, vWP.z - uZc)) / uHalf;
        col = mix(col, uFar, smoothstep(0.8, 0.99, max(q.x, q.y)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function waterfallMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uDark: { value: rgb('#4f9fc0') }, uMid: { value: rgb('#7cc3d6') }, uLight: { value: rgb('#b3e2e8') }, uFoam: { value: rgb('#f2fbf8') },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform float uTime;
      uniform vec3 uDark, uMid, uLight, uFoam;
      varying vec2 vUv;          // x: across 0..1, y: 0 top .. 1 bottom
      void main() {
        float edge = abs(vUv.x - 0.5) * 2.0;
        float wob = (noise2(vec2(vUv.y * 9.0 - uTime * 3.0, 2.0)) - 0.5) * 0.2;
        if (edge > 0.92 + wob) discard;
        float n = noise2(vec2(vUv.x * 11.0, vUv.y * 5.0 - uTime * 3.2));
        float n2 = noise2(vec2(vUv.x * 23.0 + 5.0, vUv.y * 9.0 - uTime * 4.5));
        vec3 col = uMid;
        if (n > 0.62) col = uLight;
        if (n < 0.28) col = uDark;
        if (n2 > 0.78 || n > 0.82) col = uFoam;
        if (edge > 0.8 + wob) col = uFoam;
        if (vUv.y > 0.85 + (n2 - 0.5) * 0.12) col = uFoam;                   // churn at the foot
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

function woodMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uA: { value: rgb('#c9925a') }, uB: { value: rgb('#a8743f') }, uC: { value: rgb('#7f5530') }, uD: { value: rgb('#563820') },
    },
    vertexShader: /* glsl */`
      attribute float aTint;
      varying float vT;
      varying vec3 vWN;
      void main() {
        vT = aTint;
        vWN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uA, uB, uC, uD;
      varying float vT;
      varying vec3 vWN;
      void main() {
        float d = dot(normalize(vWN), normalize(vec3(-0.35, 1.0, 0.4))) * 0.5 + 0.5;
        vec3 col = d > 0.8 ? uA : (d > 0.58 ? uB : (d > 0.38 ? uC : uD));
        gl_FragColor = vec4(col * vT, 1.0);
      }`,
  });
}

// --------------------------------------------------------------------------
// bridge
// --------------------------------------------------------------------------
export function createBridge({ length = 10, width = 2.3, arch = 0.7, seed = 1 } = {}) {
  const rng = mulberry32(seed * 3907 + 5);
  const parts = [];
  const deckY = x => 0.35 + arch * (1 - Math.pow(2 * x / length, 2));
  const box = (w, h, d, x, y, z, rz, ry, tint) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.deleteAttribute('uv');
    g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z);
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(tint), 1));
    parts.push(g);
  };
  // planks
  const pw = 0.34, gap = 0.05, n = Math.floor(length / (pw + gap));
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i + 0.5) * (pw + gap);
    const slope = Math.atan(-arch * 8 * x / (length * length));
    box(pw, 0.12, width * range(rng, 0.92, 1.06), x, deckY(x), range(rng, -0.06, 0.06), slope, range(rng, -0.04, 0.04), range(rng, 0.85, 1.12));
  }
  // stringers under the deck and rails, as short straight pieces following the arch
  const seg = 12;
  const beam = (y0, z, h, d, tint, inset = 0) => {
    for (let i = 0; i < seg; i++) {
      const xa = -length / 2 + inset + i * (length - 2 * inset) / seg, xb = xa + (length - 2 * inset) / seg;
      const ya = deckY(xa) + y0, yb = deckY(xb) + y0;
      box(Math.hypot(xb - xa, yb - ya) + 0.03, h, d, (xa + xb) / 2, (ya + yb) / 2, z, Math.atan2(yb - ya, xb - xa), 0, tint);
    }
  };
  beam(-0.17, -width * 0.32, 0.18, 0.16, 0.78);
  beam(-0.17, width * 0.32, 0.18, 0.16, 0.78);
  const postN = Math.max(3, Math.round(length / 1.6));
  for (const zs of [-width / 2 + 0.07, width / 2 - 0.07]) {
    for (let i = 0; i <= postN; i++) {
      const x = -length / 2 + 0.15 + i * (length - 0.3) / postN;
      const end = i === 0 || i === postN;
      box(end ? 0.2 : 0.13, end ? 1.15 : 0.95, end ? 0.2 : 0.13, x, deckY(x) + (end ? 0.5 : 0.45), zs, 0, 0, range(rng, 0.88, 1.02));
    }
    beam(0.92, zs, 0.1, 0.12, 1.1, 0.1);          // top rail
    beam(0.5, zs, 0.07, 0.08, 0.95, 0.1);         // middle rail
  }
  const geo = mergeGeometries(parts);
  parts.forEach(g => g.dispose());
  const mesh = new THREE.Mesh(geo, woodMaterial());
  mesh.name = 'bridge';
  mesh.userData = { kind: 'bridge', height: 0.35 + arch + 1.0, length, dispose() { geo.dispose(); mesh.material.dispose(); } };
  return mesh;
}

// --------------------------------------------------------------------------
// water ribbon that follows a centre line along z
// --------------------------------------------------------------------------
function waterRibbon({ z0, z1, cx, hw, level, H, step = 0.55, across = 18, extra = 2.4 }) {
  const pos = [], depth = [], flow = [], idx = [];
  const rows = Math.ceil((z1 - z0) / step) + 1;
  let along = 0, prevX = cx(z0);
  for (let r = 0; r < rows; r++) {
    const z = Math.min(z1, z0 + r * step);
    const c = cx(z);
    if (r > 0) along += Math.hypot(step, c - prevX);
    prevX = c;
    const half = hw(z) + extra;
    for (let i = 0; i <= across; i++) {
      const u = -1 + 2 * i / across;
      const x = c + u * half;
      pos.push(x, level, z);
      depth.push(level - H(x, z));
      flow.push(along, u);
    }
  }
  const row = across + 1;
  for (let r = 0; r < rows - 1; r++) for (let i = 0; i < across; i++) {
    const a = r * row + i, b = a + row;
    idx.push(a, b, a + 1, b, b + 1, a + 1);      // faces up
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setIndex(idx);
  return g;
}

// --------------------------------------------------------------------------
// the valley
// --------------------------------------------------------------------------
export function createValley({ seed = 1, width = 130, depth = 150, zCenter = -20, res = 0.55, far = '#eef5e4', path = true, bridge: withBridge = true, skirt = false } = {}) {
  const S = seed;
  const X0 = -width / 2, X1 = width / 2, Z0 = zCenter - depth / 2, Z1 = zCenter + depth / 2;

  // ---- layout curves
  const rx = z => 5.5 * Math.sin(z * 0.045 + 0.6 + S) + 2.5 * Math.sin(z * 0.12 + 2.0 + S * 1.7);    // river centre
  const lipX = rx(-46);
  const headZ = x => -47 + 2.5 * Math.sin(x * 0.13 + S) + (fbm3(x * 0.08, 3.3, 0.5, S + 21, 2) - 0.5) * 4;
  const zLip = headZ(lipX);                                                     // waterfall lip (cliff foot)
  const rw = z => 2.9 + 0.5 * Math.sin(z * 0.09 + 0.4) + 3.2 * ss(zLip + 13, zLip + 3, z);    // + pool under the falls
  const vw = z => 18 + 4 * Math.sin(z * 0.06 + 1.3 + S) + 2 * Math.sin(z * 0.15);
  const cliffLine = (x, z) => vw(z) + (fbm3(x * 0.11, 5.1, z * 0.11, S + 3, 3) - 0.5) * 4.5;   // distance from river to cliff foot
  const px = z => lipX + 3 * Math.sin((z - zLip) * 0.08) * ss(zLip, zLip - 12, z);           // plateau river centre
  const pw = 2.3;
  const PLAT = 14.5, PL = PLAT - 0.65, WL = 0;

  // ---- height
  const plateauT = (x, z) => { const zh = headZ(x); return ss(zh, zh - 1.4, z); };
  const H = (x, z) => {
    const cx = rx(z), adx = Math.abs(x - cx), w = rw(z);
    let h = 0.85 + (fbm3(x * 0.07, 0.2, z * 0.07, S, 3) - 0.5) * 1.3;
    const e = cliffLine(x, z);
    h += ss(w + 2, e, adx) * 1.6;                                               // floor rises toward the cliffs
    // sand beach: a low shelf beside the water, wide on the inside of bends (point bars) and around the pool
    const curv = rx(z + 2) + rx(z - 2) - 2 * cx;
    const inner = curv * (x - cx) > 0 ? Math.min(1, Math.abs(curv) * 6) : 0;
    const beach = 1.4 + inner * 5 + (fbm3(x * 0.15, 4.4, z * 0.15, S + 13, 2) - 0.5) * 1.6 + ss(zLip + 16, zLip + 4, z) * 2.5;
    const shelf = 0.18 + Math.max(0, adx - w) * 0.07;
    h = lerp(h, Math.min(h, shelf), ss(w + beach + 1.0, w + beach - 0.4, adx));
    const bed = -1.3 + (fbm3(x * 0.3, 2.2, z * 0.3, S + 7, 1) - 0.5) * 0.5;
    h = lerp(h, bed, ss(w + 1.6, w - 0.4, adx));                                // river channel
    const jag = fbm3(x * 0.09, 7.7, z * 0.09, S + 5, 2);
    const t1 = ss(e, e + 1.3, adx);                                             // lower cliff tier
    const e2 = e + 4.5 + (jag - 0.5) * 4;
    const t2 = ss(e2, e2 + 1.4, adx);                                           // upper cliff tier
    const top1 = 6.5 + (jag - 0.5) * 2.2;
    const top2 = PLAT + (fbm3(x * 0.05, 9.1, z * 0.05, S + 11, 2) - 0.5) * 2.5 + ss(e2 + 4, e2 + 30, adx) * 5;
    h = lerp(h, Math.max(h, top1), t1);
    h = lerp(h, Math.max(h, top2), t2);
    const th = plateauT(x, z);                                                  // valley head + plateau river
    if (th > 0) {
      const zh = headZ(x);
      const padx = Math.abs(x - px(z));
      const flatNear = ss(pw + 9, pw + 3, padx);
      let plat = PLAT + ((fbm3(x * 0.05, 9.1, z * 0.05, S + 11, 2) - 0.5) * 2.5 + ss(zh - 6, zh - 40, z) * 5) * (1 - flatNear);
      plat = lerp(plat, PLAT + 0.15, flatNear);
      plat = lerp(plat, PL - 1.0, ss(pw + 1.2, pw - 0.3, padx));
      h = lerp(h, Math.max(h, plat), th);
    }
    return h;
  };
  const waterLevelAt = (x, z) => (plateauT(x, z) > 0.5 ? PL : WL);

  // ---- bridge across the river
  const zb = 4;
  const k = (rx(zb + 0.5) - rx(zb - 0.5));                                      // dx/dz of the river
  const across = new THREE.Vector2(1, -k).normalize();
  const bLen = 2 * rw(zb) + 5.5;
  const bc = new THREE.Vector2(rx(zb), zb);
  const E1 = bc.clone().addScaledVector(across, bLen / 2), E0 = bc.clone().addScaledVector(across, -bLen / 2);
  const side = Math.sign(E1.x - bc.x) || 1;

  // ---- dirt path: camera side -> bridge -> up the valley to the falls
  const wp = [
    [rx(52) + side * 7, 52], [rx(38) + side * 8, 38], [rx(24) + side * 6.5, 24], [rx(13) + side * 5.5, 13],
    [E1.x + across.x * 1.8, E1.y + across.y * 1.8], [E1.x, E1.y],
    null,
    [E0.x, E0.y], [E0.x - across.x * 1.8, E0.y - across.y * 1.8],
    [rx(-6) - side * 6.5, -6], [rx(-18) - side * 7.5, -18], [rx(-30) - side * 7, -30], [rx(zLip + 11) - side * 8.5, zLip + 11],
  ];
  const segs = [], route = [];          // route: the walkable line, camera side -> over the bridge -> the falls
  for (const part of [wp.slice(0, 6), wp.slice(7)]) {
    const curve = new THREE.CatmullRomCurve3(part.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const pts = curve.getSpacedPoints(Math.round(curve.getLength()));
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z]);
    pts.forEach(q => route.push([q.x, q.z]));
  }
  if (!path) segs.length = 0;            // no dirt path drawn (route below follows the bank instead)
  const CELL = 4, grid = new Map();
  const key = (i, j) => i * 10007 + j;
  segs.forEach((sg, n) => {
    const i0 = Math.floor(Math.min(sg[0], sg[2]) / CELL) - 1, i1 = Math.floor(Math.max(sg[0], sg[2]) / CELL) + 1;
    const j0 = Math.floor(Math.min(sg[1], sg[3]) / CELL) - 1, j1 = Math.floor(Math.max(sg[1], sg[3]) / CELL) + 1;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const kk = key(i, j);
      if (!grid.has(kk)) grid.set(kk, []);
      grid.get(kk).push(n);
    }
  });
  const pathDist = (x, z) => {
    const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return 99;
    let best = 99;
    for (const n of list) {
      const [ax, az, bx, bz] = segs[n];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };

  // ---- terrain mesh
  const segX = Math.round(width / res), segZ = Math.round(depth / res);
  const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, zCenter);
  geo.deleteAttribute('uv');
  const p = geo.attributes.position;
  const bankA = new Float32Array(p.count), pathA = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = H(x, z);
    p.setY(i, h);
    bankA[i] = h - waterLevelAt(x, z);
    pathA[i] = 1 - ss(0.7, 1.55, pathDist(x, z));
  }
  geo.setAttribute('aBank', new THREE.BufferAttribute(bankA, 1));
  geo.setAttribute('aPath', new THREE.BufferAttribute(pathA, 1));
  geo.computeVertexNormals();
  // with a skirt the land runs on to the far hills, so no fade at the map edge (haze does the job)
  const half = skirt ? [1e5, 1e5] : [width / 2, depth / 2];
  const terrain = new THREE.Mesh(geo, terrainMaterial(far, half, zCenter));
  terrain.name = 'terrain';
  // ---- outer skirt: coarse rolling land from the map edge out to the far hills
  let skirtMesh = null;
  if (skirt) {
    const SW = typeof skirt === 'number' ? skirt : 440, SEG = 96;
    const sg = new THREE.PlaneGeometry(SW, SW, SEG, SEG);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, 0, zCenter);
    sg.deleteAttribute('uv');
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), z = sp.getZ(i);
      const cx = Math.min(X1 - 0.3, Math.max(X0 + 0.3, x)), cz = Math.min(Z1 - 0.3, Math.max(Z0 + 0.3, z));
      const out = Math.hypot(x - cx, z - cz);
      let h = H(cx, cz);
      if (out > 0) h += (fbm3(x * 0.02, 1.3, z * 0.02, S + 31, 3) - 0.35) * 14 * ss(0, 60, out) + ss(10, 160, out) * 6;
      else h -= 2.5 * ss(0, 8, Math.min(x - X0, X1 - x, z - Z0, Z1 - z));      // tucked under the detailed map
      sp.setY(i, h);
    }
    sg.setAttribute('aBank', new THREE.BufferAttribute(new Float32Array(sp.count).fill(9), 1));
    sg.setAttribute('aPath', new THREE.BufferAttribute(new Float32Array(sp.count), 1));
    sg.computeVertexNormals();
    skirtMesh = new THREE.Mesh(sg, terrainMaterial(far, [1e5, 1e5], zCenter));
    skirtMesh.name = 'terrainSkirt';
  }

  // ---- water
  const wMat = waterMaterial(far, half, zCenter);
  const river = new THREE.Mesh(waterRibbon({ z0: zLip - 0.6, z1: Z1, cx: rx, hw: rw, level: WL, H }), wMat);
  const upper = new THREE.Mesh(waterRibbon({ z0: Z0, z1: zLip - 1.25, cx: px, hw: () => pw, level: PL, H, extra: 1.6, across: 12 }), wMat);
  river.name = upper.name = 'water';

  // ---- waterfall sheet + foam
  const fallTop = PL, fallBot = WL - 0.25, fallH = fallTop - fallBot;
  const fg = new THREE.PlaneGeometry(1, 1, 12, 32);
  {
    const a = fg.attributes.position, uv = fg.attributes.uv;
    for (let i = 0; i < a.count; i++) {
      const u = a.getX(i) * 2;                 // -1..1
      const t = 0.5 - a.getY(i);               // 0 top .. 1 bottom
      a.setXYZ(i, lipX + u * pw * (1.0 + 0.3 * t), fallTop - t * fallH, zLip - 1.25 + 2.9 * Math.sqrt(t));
      uv.setXY(i, u * 0.5 + 0.5, t);
    }
    fg.computeVertexNormals();
  }
  const fall = new THREE.Mesh(fg, waterfallMaterial());
  fall.name = 'waterfall';
  const foamPts = [];
  const frng = mulberry32(S * 131 + 7);
  const foot = new THREE.Vector3(lipX, 0, zLip + 2.0);
  for (let i = 0; i < 26; i++) {
    const a = frng() * Math.PI * 2, d = range(frng, 0.2, 3.2);
    foamPts.push([foot.x + Math.cos(a) * d * 1.2, range(frng, 0.15, 1.4) * (1.2 - d / 4), foot.z + Math.sin(a) * d * 0.8, range(frng, 1.0, 2.0)]);
  }
  for (let i = 0; i < 6; i++) foamPts.push([lipX + range(frng, -1, 1) * pw, PL + range(frng, 0.05, 0.3), zLip - 1.3, range(frng, 0.5, 0.85)]);
  const foam = createCardCluster({ points: foamPts, colors: [['#ffffff', '#dcecef'], ['#f2fbf8', '#c3e4ea']], seed: S, flutter: 0.9 });
  foam.name = 'foam';

  // ---- bridge (optional)
  const by = (H(E0.x, E0.y) + H(E1.x, E1.y)) / 2 - 0.15;
  const bridge = withBridge ? createBridge({ length: bLen, seed: S }) : null;
  if (bridge) {
    bridge.position.set(bc.x, by, bc.y);
    bridge.rotation.y = -Math.atan2(across.y, across.x);
  }

  // ground height that knows about the bridge deck (for walkers)
  const deckHalfW = 1.1, arch = 0.7;
  const surfaceAt = (x, z) => {
    const dx = x - bc.x, dz = z - bc.y;
    const u = dx * across.x + dz * across.y, v = -dx * across.y + dz * across.x;
    if (bridge && Math.abs(u) < bLen / 2 && Math.abs(v) < deckHalfW) return by + 0.41 + arch * (1 - Math.pow(2 * u / bLen, 2));
    return H(x, z);
  };

  const group = new THREE.Group();
  group.add(terrain, river, upper, fall, foam);
  if (skirtMesh) group.add(skirtMesh);
  if (bridge) group.add(bridge);
  group.name = 'valley';

  // ---- queries for placing things
  const slopeAt = (x, z) => {
    const e = 0.45;
    const hx = (H(x + e, z) - H(x - e, z)) / (2 * e), hz = (H(x, z + e) - H(x, z - e)) / (2 * e);
    return 1 - 1 / Math.sqrt(1 + hx * hx + hz * hz);
  };
  const kindAt = (x, z) => {
    const h = H(x, z), wl = waterLevelAt(x, z);
    if (h < wl + 0.05 && (Math.abs(x - rx(z)) < rw(z) + 1.5 || Math.abs(x - px(z)) < pw + 1.5)) return 'water';
    if (h - wl < 0.55) return 'bank';
    if (pathDist(x, z) < 1.6) return 'path';
    if (slopeAt(x, z) > 0.25) return 'cliff';
    if (h > 5) return 'plateau';
    return 'floor';
  };
  // a walk along one bank (on the sand), from near the falls down the valley
  const bankRoute = (side = 1, z0 = zLip + 9, z1 = Z1 - 8, off = 1.7) => {
    const pts = [];
    for (let z = z0; z <= z1; z += 1.5) pts.push([rx(z) + side * (rw(z) + off), z]);
    return pts;
  };
  group.userData = {
    kind: 'valley',
    dispose() { group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); terrain.material.dispose(); wMat.dispose(); fall.material.dispose(); },
  };
  return {
    group, heightAt: H, surfaceAt, route: path ? route : bankRoute(1), bankRoute, waterLevelAt, kindAt, slopeAt, pathDist,
    riverX: rx, riverHalfWidth: rw, cliffLine, plateauRiverX: px,
    bridge: bridge ? { x: bc.x, z: bc.y, length: bLen, ends: [[E0.x, E0.y], [E1.x, E1.y]] } : null,
    waterfall: { x: lipX, z: zLip, top: fallTop },
    bounds: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
    levels: { water: WL, plateau: PLAT, plateauWater: PL },
  };
}

// water shader for sibling modules: needs geometry attributes aDepth (water depth, >1 = deep) and aFlow (along, across -1..1)
export const _water = { waterMaterial, WATER_COLORS };
