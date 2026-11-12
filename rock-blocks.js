/* ==========================================================================
   rock-blocks.js  —  cliffs built of big broken blocks of stone (the depths of the abyss first)

   A wall of land on a height grid is one stretched sheet: however it is painted it reads as bands (a layered cake). This
   builds the rock as solid blocks instead, stood in front of the wall so they hide it:
     - each block is a chunk of a few big flat faces (the hull of a jittered, chamfered box), so the sun picks out its top,
       its sides and its shadowed under-faces as separate planes: it reads as a solid lump of stone
     - blocks are stacked up a face, each set its own way forward or back, a little turned, of its own size, so the skyline
       is broken and no ledge runs level
     - the top of each block is grass, and the grass hangs down over its lip in tongues; moss sits on faces turned to the sky
     - the stone is a cool grey, warm where the sun is on it, blue-grey in its shadows

     const geo = rockBlock({ w, h, d, seed })                 one block (local: centred on x/z, standing on y = 0)
     const mesh = createRockBlocks(list, { material })        list: [{ x, y, z, rotY, w, h, d, seed }] -> ONE mesh
     rockBlockMaterial()                                      the paint (shared)
     faceBlocks({ x0, z0, nx, nz, step, h, seed, keep })    blocks over every rock face of a height grid: see below
   ========================================================================== */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { _internal } from './stylized-nature.js';
import { _strata } from './stylized-terrain.js';

const { NOISE, HAZEF, rgb, shared, mulberry32 } = _internal;
const { colors: TC } = _strata;

export const ROCK_BLOCK_COLORS = {
  lit: '#e6dfcd', mid: '#c4bfb2', shade: '#9ea6aa', deep: '#7f8b95', under: '#66727e',
  moss: '#7b9a42', mossDark: '#5a7a37',
};

// one block: the hull of a box with its corners cut, every point pushed about, the top a little narrower and leaning
export function rockBlock({ w = 5, h = 6, d = 4, seed = 1 } = {}) {
  const r = mulberry32(seed * 7919 + 1), J = (s) => (r() - 0.5) * s;
  const pts = [], cut = 0.22;
  const lean = J(0.3), topIn = 0.78 + r() * 0.16;
  for (const sy of [0, 1]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const k = sy ? topIn : 1, y = sy ? h * (0.9 + r() * 0.1) + J(h * 0.12) : J(0.3);
    const x = sx * w / 2 * k + (sy ? lean * w : 0), z = sz * d / 2 * k;
    // a cut corner: three points near the corner instead of one
    pts.push(new THREE.Vector3(x - sx * w * cut * r(), y, z), new THREE.Vector3(x, y - (sy ? 1 : -1) * h * cut * 0.6 * r(), z), new THREE.Vector3(x, y, z - sz * d * cut * r()));
  }
  for (let i = 0; i < 4; i++) {                                            // a few points bulging on the faces
    const f = Math.floor(r() * 4), u = r() - 0.5, v = 0.15 + r() * 0.7;
    const out = 1 + r() * 0.12;
    if (f < 2) pts.push(new THREE.Vector3(u * w * 0.8, v * h, (f ? 1 : -1) * d / 2 * out));
    else pts.push(new THREE.Vector3((f === 2 ? 1 : -1) * w / 2 * out, v * h, u * d * 0.8));
  }
  const g = new ConvexGeometry(pts);
  const flat = g.index ? g.toNonIndexed() : g;
  flat.deleteAttribute('uv');
  flat.computeVertexNormals();
  return flat;
}

// every block merged into one mesh (one draw call). aTop: the height of the top of the block a point belongs to
export function createRockBlocks(list = [], { material = null } = {}) {
  const parts = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), t = new THREE.Vector3(), e = new THREE.Euler();
  for (const b of list) {
    const g = rockBlock(b);
    const rr = mulberry32((b.seed || 1) * 31 + 7);
    m.compose(t.set(b.x, b.y, b.z), q.setFromEuler(e.set((rr() - 0.5) * 0.22, b.rotY || 0, (rr() - 0.5) * 0.22, 'YXZ')), s);      // each leans a little its own way
    g.applyMatrix4(m);
    const p = g.attributes.position;
    let top = -1e9;
    for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
    g.setAttribute('aTop', new THREE.Float32BufferAttribute(new Float32Array(p.count).fill(top), 1));
    g.setAttribute('aBlock', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2).map((_, i) => i % 2 ? b.h : rr()), 2));      // which block (0..1), how tall
    parts.push(g);
  }
  const mesh = new THREE.Mesh(parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry(), material || rockBlockMaterial());
  parts.forEach(p => p.dispose());
  mesh.name = 'rockBlocks';
  mesh.userData = { kind: 'rockBlocks', count: list.length, dispose() { mesh.geometry.dispose(); } };
  return mesh;
}

let shared_mat = null;
export function rockBlockMaterial() {
  if (shared_mat) return shared_mat;
  const C = TC, R = ROCK_BLOCK_COLORS;
  return (shared_mat = new THREE.ShaderMaterial({
    uniforms: {
      uG0: { value: rgb(C.grass[0]) }, uG1: { value: rgb(C.grass[1]) }, uG2: { value: rgb(C.grass[2]) }, uG3: { value: rgb(C.grass[3]) },
      uK0: { value: rgb(R.lit) }, uK1: { value: rgb(R.mid) }, uK2: { value: rgb(R.shade) }, uK3: { value: rgb(R.deep) }, uK4: { value: rgb(R.under) },
      uM0: { value: rgb(R.moss) }, uM1: { value: rgb(R.mossDark) },
      uSun: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      attribute float aTop;
      attribute vec2 aBlock;
      varying vec3 vWP;
      varying vec3 vN;
      varying float vTop, vHaze;
      varying vec2 vBlock;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz; vTop = aTop; vBlock = aBlock;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      uniform vec3 uG0, uG1, uG2, uG3, uK0, uK1, uK2, uK3, uK4, uM0, uM1, uSun;
      varying vec3 vWP;
      varying vec3 vN;
      varying float vTop;
      varying vec2 vBlock;
      void main() {
        vec3 n = normalize(vN);
        // each face its own flat tone by how it is turned to the sun (a face a little off its neighbours: hashed by its normal)
        float L = dot(n, uSun) * 0.75 + 0.1 + (fract(sin(dot(floor(n * 9.0), vec3(12.9, 78.2, 37.7))) * 43758.5) - 0.5) * 0.2;
        L += (vBlock.x - 0.5) * 0.34;                                       // each block a shade of its own
        L += (noise2(vWP.xz * 0.11 + vWP.y * 0.07) - 0.5) * 0.4 + (noise2(vec2(dot(vWP.xz, vec2(0.6, 0.8)), vWP.y) * 0.45) - 0.5) * 0.3;      // big soft patches and smaller strokes across them, like brushwork
        float low = clamp((vTop - vWP.y) / max(vBlock.y, 1.0), 0.0, 1.0);
        L -= smoothstep(0.55, 1.0, low) * 0.35;                             // the foot of each block in the shadow of the one below's lip
        vec3 col = L > 0.52 ? uK0 : (L > 0.22 ? uK1 : (L > -0.08 ? uK2 : uK3));

        if (n.y < -0.35) col = uK4;                                         // the undersides, in deep shade
        // damp green stains low down on a block
        float st = noise2(vWP.xz * 0.35 + vWP.y * 0.25 + vBlock.x * 7.0);
        if (n.y > -0.35 && low > 0.45 && st > 0.6 - low * 0.15) col = mix(col, uM1, 0.55);
        // moss on faces turned to the sky
        float mn = noise2(vWP.xz * 0.5 + vWP.y * 0.21);
        if (n.y > 0.25 && mn > 0.52) col = mn > 0.66 ? uM0 : uM1;
        // grass on the top, hanging down over the lip in tongues
        float d = vTop - vWP.y;
        float streak = noise2(vec2(dot(vWP.xz, vec2(0.71, 0.7)) * 0.85, vWP.y * 0.05)) * 0.7 + noise2(vWP.xz * 2.1) * 0.3;
        float hang = 0.2 + 2.2 * smoothstep(0.55, 0.9, streak);
        if (n.y > -0.2 && d < hang) col = d < hang * 0.55 ? (L > 0.25 ? uM0 : uM1) : uM1;
        if (n.y > 0.45 || (n.y > -0.2 && d < 0.18 + 0.35 * streak)) {
          float s = noise2(vWP.xz * 0.3) * 0.7 + noise2(vWP.xz * 1.6) * 0.3;
          float g = s * 0.6 + (dot(n, normalize(vec3(-0.3, 1.0, 0.35))) - 0.9) * 2.6 + 0.2;
          col = g > 0.6 ? uG3 : (g > 0.45 ? uG2 : (g > 0.3 ? uG1 : uG0));
        }
        col = mix(col, uHaze, vHaze);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
}

// Blocks over every rock face of a height grid (h: nx * nz heights, `step` metres apart, from x0, z0). The grid is read in
// squares of 4 m: where the ground in a square drops by more than 2.5 m, a face runs through it. A stack of blocks is stood
// along it, from the foot of the drop to its top, each pushed a little out of the face (so the blocks hide it), turned to
// face out, of its own size. keep(x, z) can leave a spot bare. Returns { list, colliders } (colliders: blocks at a foot).
export function faceBlocks({ x0, z0, nx, nz, step, h, seed = 1, keep = () => true, cell = 6 }) {
  const r = mulberry32(seed * 977 + 5), list = [], colliders = [];
  const at = (i, j) => h[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  const C = Math.round(cell / step);
  for (let cj = 0; cj < nz; cj += C) for (let ci = 0; ci < nx; ci += C) {
    // the steepest drop in this square, and which way it faces
    let best = 0, bi = 0, bj = 0, lo = 0, hi = 0, gx = 0, gz = 0;
    for (let j = cj; j < Math.min(nz, cj + C); j++) for (let i = ci; i < Math.min(nx, ci + C); i++) {
      const dx = at(i + 2, j) - at(i - 2, j), dz = at(i, j + 2) - at(i, j - 2), g = Math.hypot(dx, dz);
      if (g > best) { best = g; bi = i; bj = j; gx = dx; gz = dz; }
    }
    if (best < 2.5) continue;
    // walk down the slope and up it to find the foot and the top of this face
    const ux = -gx / best, uz = -gz / best;                                // out of the rock (downhill)
    let fi = bi, fj = bj; lo = at(bi, bj); hi = lo;
    for (let k = 1; k <= 14; k++) { const v = at(Math.round(bi + ux * k), Math.round(bj + uz * k)); if (v < lo - 0.05) { lo = v; fi = Math.round(bi + ux * k); fj = Math.round(bj + uz * k); } else break; }
    for (let k = 1; k <= 14; k++) { const v = at(Math.round(bi - ux * k), Math.round(bj - uz * k)); if (v > hi + 0.05) hi = v; else break; }
    if (hi - lo < 2.5) continue;
    const fx = x0 + fi * step, fz = z0 + fj * step, fx2 = x0 + bi * step, fz2 = z0 + bj * step;
    if (!keep(fx2, fz2)) continue;
    const yaw = Math.atan2(ux, uz);
    // the stack: blocks from the foot up to the top, each sat a little out from the face at its own height
    let y = lo - 1.2 - r() * 0.8;
    const run = Math.hypot(fx - fx2, fz - fz2) + 0.01;
    while (y < hi - 1.2) {
      const hgt = Math.min(hi - 0.35 - r() * 0.5 - y, 6 + r() * 9), w = cell * (0.95 + r() * 0.6), d = 3.5 + r() * 3.5;      // the top block stops just under the lip: the ledge's grass shows above it
      const f = Math.min(1, Math.max(0, (y + hgt * 0.5 - lo) / (hi - lo)));       // how far up the face: the face lies further back higher up
      const back = run * (1 - f), out = d * (0.18 + r() * 0.22);
      const x = fx2 + ux * (back - d / 2 + out) + (r() - 0.5) * 1.2, z = fz2 + uz * (back - d / 2 + out) + (r() - 0.5) * 1.2;
      list.push({ x, y, z, rotY: yaw + (r() - 0.5) * 0.6, w, h: hgt, d, seed: Math.floor(r() * 1e6) });
      if (y < lo + 1.5) colliders.push([x + ux * d * 0.15, z + uz * d * 0.15, Math.min(w, d) * 0.48]);
      y += hgt * (0.72 + r() * 0.18);
      if (hgt < 2) break;
    }
  }
  return { list, colliders };
}
