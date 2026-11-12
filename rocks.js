/* ==========================================================================
   rocks.js  —  every rock and cliff in the game, in one place

   Before, rock was built four ways in four files (stylized-cliffs, valley-cliffs, rock-blocks, stylized-rockface), each
   with its own colours. They all live here now, so a change to the rock is made once. Nothing looks different yet: each
   way below is the old code as it was, only moved.

     ROCK_PALETTE                                   every rock colour in the game (blocks: the abyss blocks; face: the
                                                    abyss land behind them). Meadow/hills cliffs use stylized-nature's rock
                                                    material; the valley's carved faces use the land's own paint.

   1. CLIFF PIECES  (meadow, hills)  — modular cliff pieces, flat-shaded, mossy tops
        CLIFF_TYPES, cliffFootprint(type, opts), createCliffSet(list)
   2. CARVED FACES  (valley)         — the land's own cliff faces carved into blocks
        carveValleyRock(V, { z0, z1, keep, seed })
   3. ROCK BLOCKS   (abyss depths)   — big broken blocks of stone stood in front of a wall
        rockBlock(opts), createRockBlocks(list, { material }), rockBlockMaterial(), faceBlocks(opts)
   4. ROCK LAND     (abyss depths)   — paint for the land behind the blocks: plain deep stone, so gaps read as cracks
        rockLandMaterial({ far })
   5. ROCK PROPS    (catalog only, for now: rock-catalog.html) — loose rocks in a hand-painted stylized look: big flat
                    chiselled faces with soft rounded edges, warm light tops, cool blue-grey sides, a pale rim on the
                    edges, moss on what faces the sky
        PROP_ROCK_TYPES, createPropRock({ type, seed }), propRockMaterial({ moss })
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import * as N from './stylized-nature.js';
import { _strata } from './stylized-terrain.js';

const { fbm3, mulberry32, NOISE, HAZEF, rgb, shared } = N._internal;
const { HAZEV, colors: TC } = _strata;

// ---------------------------------------------------------------------------------------------------- the rock's colours
export const ROCK_PALETTE = {
  // the abyss's blocks (3)
  blocks: {
    lit: '#e6dfcd', mid: '#c4bfb2', shade: '#9ea6aa', deep: '#7f8b95', under: '#66727e',
    moss: '#7b9a42', mossDark: '#5a7a37',
  },
  // the abyss's land behind the blocks (4): a cool grey stone, warm in the sun
  face: {
    lit: '#e0d9c8', mid: '#b2ada1', shade: '#7d868c', deep: '#5d6973', crack: '#46515b',
    moss: '#6f9440', mossDark: '#4f7134', damp: '#5f7d36', earth: '#9b8462',
  },
};


/* ======================================================================== 1. CLIFF PIECES (meadow, hills) */

const range = (r, a, b) => a + r() * (b - a);

export const CLIFF_TYPES = ['wall', 'ledge', 'corner', 'spire'];

const DEFAULTS = {
  wall: { width: 7, height: 3.6 },
  ledge: { width: 8, height: 1.8 },
  corner: { width: 5, height: 3.4 },      // width = length of each of the two arms
  spire: { width: 1.6, height: 5.2 },
};

// One faceted rock column: nearly vertical faces, each stratum juts out or in a little, lumpy top, foot buried.
// Every vertex is a pure function of its own position, so the seams between box faces stay closed.
function column(seed, w, h, d, lean = 0) {
  let g = new THREE.BoxGeometry(w, h, d, 3, 7, 2);
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ty = (y + h / 2) / h;                                            // 0 at the foot .. 1 at the top
    const tier = Math.floor(ty * 5);
    const step = (fbm3(tier * 1.7 + seed, 0.5, seed * 0.3, seed, 1) - 0.5) * 0.5;
    const k = (1 + step) * (1 - 0.22 * ty);                                // ledges, and a slight taper upwards
    x *= k; z *= k;
    const n1 = fbm3(x * 1.1 + seed * 2.1, y * 0.8, z * 1.1, seed, 2) - 0.5;
    const n2 = fbm3(x * 1.1, y * 0.8 + 4.0, z * 1.1 + seed, seed + 3, 2) - 0.5;
    x += n1 * w * 0.35; z += n2 * d * 0.4;
    if (ty > 0.97) y += (fbm3(x * 1.6 + seed, 2.0, z * 1.6, seed + 7, 2) - 0.5) * 0.7;      // lumpy top
    x += lean * ty * h;
    p.setXYZ(i, x, y + h / 2 - 0.9, z);                                    // foot 0.9 m below the origin
  }
  g = g.toNonIndexed();                                                    // flat facets
  g.computeVertexNormals();
  return g;
}

// a row of columns along local x, centred on (cx, cz), turned by rotY
function row(parts, seed, r, { cx = 0, cz = 0, rotY = 0, length, height, depth, tip = 0.35 }) {
  const n = Math.max(2, Math.round(length / 1.7));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n - 0.5;                                         // -0.5 .. 0.5 along the row
    const fall = 1 - tip * Math.pow(Math.abs(u) * 2, 2);                  // the ends step down
    const c = column(seed * 31 + parts.length, length / n * range(r, 1.15, 1.5), height * range(r, 0.7, 1.15) * fall,
      depth * range(r, 0.85, 1.15), range(r, -0.04, 0.04));
    c.rotateY(range(r, -0.15, 0.15));
    c.translate(u * length, 0, range(r, -0.25, 0.25));
    c.rotateY(rotY);
    c.translate(cx, 0, cz);
    parts.push(c);
  }
}

function buildGeometry(type, seed, opts = {}) {
  const D = { ...DEFAULTS[type], ...opts };
  const r = mulberry32(seed * 977 + 13);
  const parts = [];
  if (type === 'wall') row(parts, seed, r, { length: D.width, height: D.height, depth: 2.0 });
  else if (type === 'ledge') row(parts, seed, r, { length: D.width, height: D.height, depth: 2.8, tip: 0.5 });
  else if (type === 'corner') {
    row(parts, seed, r, { cx: D.width / 2, length: D.width, height: D.height, depth: 2.0 });
    row(parts, seed + 5, r, { cz: -D.width / 2, rotY: Math.PI / 2, length: D.width, height: D.height * 0.9, depth: 2.0 });
  } else {                                                                 // spire: two or three tall slender columns
    const n = 2 + (r() > 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const c = column(seed * 31 + i, D.width * range(r, 0.7, 1.1), D.height * range(r, 0.6, 1.0), D.width * range(r, 0.7, 1.0), range(r, -0.06, 0.06));
      c.translate((i - (n - 1) / 2) * D.width * 0.8, 0, range(r, -0.3, 0.3));
      parts.push(c);
    }
  }
  const g = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return g;
}

// circles that stop the player: u along the face, v out of it (+z)
export function cliffFootprint(type, opts = {}) {
  const D = { ...DEFAULTS[type], ...opts };
  const out = [];
  const along = (len, cu, cv, vertical) => {
    const n = Math.max(2, Math.ceil(len / 1.5));
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n - 0.5) * len;
      out.push(vertical ? [cu, cv + t, 1.25] : [cu + t, cv, 1.25]);
    }
  };
  if (type === 'spire') out.push([0, 0, D.width * 0.9]);
  else if (type === 'corner') { along(D.width, D.width / 2, 0, false); along(D.width, 0, -D.width / 2, true); }
  else along(D.width, 0, 0, false);
  return out;
}

// every piece merged into one mesh: pieces are placed by the matrix, so the whole set costs a single draw call
export function createCliffSet(list = []) {
  const parts = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const c of list) {
    const g = buildGeometry(c.type, c.seed ?? 1, c.opts);
    const sc = c.scale ?? 1;
    m.compose(t.set(c.x, c.y, c.z), q.setFromAxisAngle(up, c.rotY ?? 0), s.set(sc, sc, sc));
    g.applyMatrix4(m);
    parts.push(g);
  }
  const mesh = new THREE.Mesh(parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry(), N.rockMaterial(true, 'cliff'));
  parts.forEach(p => p.dispose());
  mesh.name = 'cliffs';
  mesh.userData = { kind: 'cliffs', count: list.length, dispose() { mesh.geometry.dispose(); } };
  return mesh;
}

/* ======================================================================== 2. CARVED FACES (valley) */

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (a, b, c) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
// value noise 0..1, the same kind the paint uses
const noise = (x, y) => {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, 0), b = hash(ix + 1, iy, 0), c = hash(ix, iy + 1, 0), d = hash(ix + 1, iy + 1, 0);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
// which layer of rock: the same sum as strataSt in the paint (stylized-terrain.js)
const layerSt = (x, y, z) => y * 0.85 + (noise((x * 0.7 + z * 0.7) * 0.11, y * 0.2) - 0.5) * 1.8;
// the nearest cell's heart over the ground: its id (0..1)
const cellId = (x, z, size, k) => {
  const gx = x / size, gz = z / size, ix = Math.floor(gx), iz = Math.floor(gz);
  let f1 = 9, id = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const cx = ix + di, cz = iz + dj, d = Math.hypot(gx - cx - 0.1 - 0.8 * hash(cx, cz, k), gz - cz - 0.1 - 0.8 * hash(cx, cz, k + 1));
    if (d < f1) { f1 = d; id = hash(cx, cz, k + 2); }
  }
  return id;
};

const CELL = 3.4;          // metres between the joints that run up a cliff
const OUT = 1.4;           // how far the boldest block stands out of the face (on top of BASE)
const LEAN = 0.55;         // how much a block's face leans: most stand out more at the top than at the foot, so each has a lip
const BASE = 0.18;         // every block stands at least this far out, so the land's coarse face stays behind the skin
const DZ = 0.35;           // metres along the valley between columns of skin
const ROWS = 34;           // points from foot to top of a face

// out from the river at z on one side: every stretch where the land climbs steeply, with its foot and its top
function facesAt(V, z, side) {
  const H = V.heightAt, cx = V.riverX(z), out = [];
  let start = null, prev = H(cx + side * 6, z);
  for (let a = 6.25; a < 48; a += 0.25) {
    const h = H(cx + side * a, z), steep = (h - prev) / 0.25 > 0.9;
    if (steep && start === null) start = { a: a - 0.25, h: prev };
    if (!steep && start !== null) {
      if (h - start.h > 3.2) out.push({ a0: start.a - 0.5, a1: a + 0.5, h0: start.h, h1: h });
      start = null;
    }
    prev = h;
  }
  return out;
}

// one column of skin: ROWS points up the profile of the face, evenly spaced along it (a sheer face gets as many as a gentle one)
function profile(V, z, side, f) {
  const H = V.heightAt, cx = V.riverX(z), pts = [[cx + side * f.a0, H(cx + side * f.a0, z)]], len = [0];
  for (let a = f.a0 + 0.04; a <= f.a1 + 1e-6; a += 0.04) {
    const x = cx + side * a, y = H(x, z), q = pts[pts.length - 1];
    pts.push([x, y]); len.push(len[len.length - 1] + Math.hypot(x - q[0], y - q[1]));
  }
  const L = len[len.length - 1], col = [];
  for (let r = 0, k = 0; r < ROWS; r++) {
    const s = L * r / (ROWS - 1);
    while (k < len.length - 2 && len[k + 1] < s) k++;
    const t = Math.min(1, (s - len[k]) / Math.max(1e-6, len[k + 1] - len[k]));
    col.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]);
  }
  return col;
}

export function carveValleyRock(V, { z0 = -1e9, z1 = 1e9, keep = () => 1, seed = 1 } = {}) {
  const land = V.group.getObjectByName('terrain');
  if (!land) return 0;
  // the land is told its layers too, so its strata and the skin's are one and the same
  {
    const g = land.geometry, p = g.attributes.position, rock = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) rock[i * 4 + 2] = layerSt(p.getX(i), p.getY(i), p.getZ(i));
    g.setAttribute('aRock', new THREE.BufferAttribute(rock, 4));
    land.material.uniforms.uRockOn.value = 1;
  }
  // strips of skin: the same face from one column to the next is the one whose foot lies nearest
  const strips = [];
  for (const side of [-1, 1]) {
    let open = [];
    for (let z = z0; z <= z1; z += DZ) {
      const next = [];
      for (const f of facesAt(V, z, side)) {
        // a face beside a path is left alone; a face that changes shape too fast to follow starts a new strip
        const cx = V.riverX(z);
        if (Math.min(keep(cx + side * f.a0, z), keep(cx + side * (f.a0 + f.a1) / 2, z), keep(cx + side * f.a1, z)) < 0.98) continue;
        const like = s => Math.abs(s.last.a0 - f.a0) < 1.2 && Math.abs(s.last.a1 - f.a1) < 1.2 && Math.abs(s.last.h0 - f.h0) < 1.2 && Math.abs(s.last.h1 - f.h1) < 1.2;
        let best = null;
        for (const s of open) if (!s.taken && like(s) && (!best || Math.abs(s.last.a0 - f.a0) < Math.abs(best.last.a0 - f.a0))) best = s;
        const s = best || { side, cols: [] };
        if (!best) strips.push(s);
        s.taken = true; s.last = f;
        s.cols.push({ z, col: profile(V, z, side, f) });
        next.push(s);
      }
      for (const s of next) s.taken = false;
      open = next;
    }
  }
  // each strip a grid of points, pushed out of the face block by block
  const pos = [], rock = [], idx = [];
  let columns = 0;
  for (const s of strips) {
    const n = s.cols.length;
    if (n < 10) continue;                                                   // scraps of face are left as they are
    const first = pos.length / 3;
    s.cols.forEach(({ z, col }, c) => {
      const ends = Math.min(1, c / 3, (n - 1 - c) / 3);                     // the strip's two ends lie on the land
      for (let r = 0; r < ROWS; r++) {
        const [x, y] = col[r], t = r / (ROWS - 1), st = layerSt(x, y, z);
        const w = ends * Math.min(1, t / 0.12, (1 - t) / 0.1) * keep(x, z) * Math.min(1, (z - z0) / 5, (z1 - z) / 5);
        const layer = Math.floor(st / 2.6), cell = cellId(x, z, CELL, seed * 7 + 3);
        const lean = (hash(cell * 33.1, layer, seed + 2) * 1.3 - 0.35) * LEAN * (st / 2.6 - layer);      // 0 at a layer's foot
        const out = w * (BASE + OUT * (0.4 * hash(cell * 91.3, 0, seed) + 0.6 * hash(cell * 91.3, layer, seed + 5)) + lean);
        // the land's own mesh cuts the corners of a face (its points are half a metre apart), so the skin's edges are
        // tucked under it: down at the foot and the top edge, back into the hill at the two ends of a strip
        const tuck = 0.35 * Math.max(1 - ends, 1 - Math.min(1, t / 0.08, (1 - t) / 0.08));
        pos.push(x - s.side * (out - tuck), y - tuck, z);
        rock.push(w, w * (hash(cell * 17.7, layer, seed + 9) - 0.5) * 0.2, st, 0);
      }
    });
    for (let c = 0; c < n - 1; c++) for (let r = 0; r < ROWS - 1; r++) {
      const a = first + c * ROWS + r, b = a + ROWS;
      if (s.side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);               // wound to face the river
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    columns += n;
  }
  if (!columns) return 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRock', new THREE.Float32BufferAttribute(rock, 4));
  g.setAttribute('aBank', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(9), 1));
  g.setAttribute('aPath', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const skin = new THREE.Mesh(g, land.material);
  skin.name = 'cliffSkin';
  V.group.add(skin);
  return columns;
}

/* ======================================================================== 3. ROCK BLOCKS (abyss depths) */

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
  const C = TC, R = ROCK_PALETTE.blocks;
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

/* ======================================================================== 4. ROCK LAND (abyss depths) */

export function rockLandMaterial({ far = '#cde6f2' } = {}) {
  const C = TC, R = ROCK_PALETTE.face;
  return new THREE.ShaderMaterial({
    uniforms: {
      uG0: { value: rgb(C.grass[0]) }, uG1: { value: rgb(C.grass[1]) }, uG2: { value: rgb(C.grass[2]) }, uG3: { value: rgb(C.grass[3]) },
      uB0: { value: rgb(C.sand[0]) }, uB1: { value: rgb(C.sand[1]) }, uB2: { value: rgb(C.sand[2]) },
      uP0: { value: rgb(C.path[0]) }, uP1: { value: rgb(C.path[1]) },
      uK0: { value: rgb(R.lit) }, uK1: { value: rgb(R.mid) }, uK2: { value: rgb(R.shade) }, uK3: { value: rgb(R.deep) }, uK4: { value: rgb(R.crack) },
      uM0: { value: rgb(R.moss) }, uM1: { value: rgb(R.mossDark) }, uDamp: { value: rgb(R.damp) }, uEarth: { value: rgb(R.earth) },
      uSun: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
      uFar: { value: rgb(far) },
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexShader: /* glsl */`
      ${HAZEV}
      attribute float aBank;
      attribute float aPath;
      attribute float aTop;
      varying vec3 vWP;
      varying vec3 vN;
      varying float vBank, vPath, vTop;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vBank = aBank; vPath = aPath; vTop = aTop;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      uniform vec3 uG0, uG1, uG2, uG3, uB0, uB1, uB2, uP0, uP1, uK0, uK1, uK2, uK3, uK4, uM0, uM1, uDamp, uEarth, uFar, uSun;
      varying vec3 vWP;
      varying vec3 vN;
      varying float vBank, vPath, vTop;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // cells: x = distance to the nearest cell's heart, y = how far from the border between two cells, z = which cell
      vec3 cells(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float f1 = 9.0, f2 = 9.0, id = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)), o = vec2(h1(i + g), h1(i + g + 17.3)) * 0.8 + 0.1;
          float d = length(g + o - f);
          if (d < f1) { f2 = f1; f1 = d; id = h1(i + g + 5.1); } else if (d < f2) f2 = d;
        }
        return vec3(f1, f2 - f1, id);
      }
      vec3 grassAt(vec3 n, float j) {
        float s = noise2(vWP.xz * 0.08) * 0.6 + noise2(vWP.xz * 0.3) * 0.3 + noise2(vWP.xz * 1.6) * 0.1;
        float lit = dot(n, normalize(vec3(-0.3, 1.0, 0.35)));
        float g = s * 0.6 + (lit - 0.9) * 2.6 + 0.2;
        return g > 0.6 ? uG3 : (g > 0.45 ? uG2 : (g > 0.3 ? uG1 : uG0));
      }
      void main() {
        vec3 n = normalize(vN);
        float j = noise2(vWP.xz * 0.9) * 0.5 + noise2(vWP.xz * 3.0) * 0.25;
        vec3 col;
        float steep = n.y + (j - 0.37) * 0.25;
        if (steep < 0.66) {
          // ---- the wall behind the blocks (section 3 above): plain deep stone, so a gap between two blocks reads as a crack
          float v = noise2(vWP.xz * 0.2 + vWP.y * 0.1);
          col = v > 0.6 ? uK2 : (v > 0.3 ? uK3 : uK4);
          // grass and moss hanging over the lip of a ledge of the land itself
          float streak = noise2(vec2(dot(vWP.xz, vec2(0.71, 0.7)) * 0.75, vWP.y * 0.05));
          float hang = 0.3 + 2.4 * smoothstep(0.45, 0.85, streak);
          if (vTop < hang) col = vTop < hang * 0.5 ? uM0 : uM1;
          if (vTop < 0.22 + 0.4 * streak) col = grassAt(vec3(0.0, 1.0, 0.0), j);
        } else {
          col = grassAt(n, j);
          // the foot of a wall: dark damp grass, patches of earth and fallen stones
          float foot = smoothstep(2.0, 4.0, vTop) * smoothstep(0.85, 0.7, n.y + 0.2) + smoothstep(2.5, 5.0, vTop) * 0.6;
          if (foot > 0.35 + (noise2(vWP.xz * 0.7) - 0.5) * 0.5) {
            col = noise2(vWP.xz * 0.45 + 3.0) > 0.62 ? uEarth : uDamp;
            vec2 pc = vWP.xz * 2.2, pi = floor(pc);
            vec2 pd = fract(pc) - 0.5 - (vec2(h1(pi + 1.3), h1(pi + 7.1)) - 0.5) * 0.5;
            float pr = 0.12 + 0.18 * h1(pi + 3.7);
            if (h1(pi) < 0.32 && length(pd) < pr) col = dot(pd, vec2(0.6, -0.8)) > 0.3 * pr ? uK2 : uK1;
          }
          float b = vBank + (j - 0.37) * 0.5;
          if (b < 0.62) col = b < 0.16 ? uB2 : (noise2(vWP.xz * 0.35) > 0.55 ? uB0 : uB1);
          float p = vPath + (j - 0.37) * 0.45;
          if (p > 0.5) col = p > 0.72 ? uP0 : uP1;
        }
        col = mix(col, uHaze, vHaze);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ==================================================================================================== 5. ROCK PROPS
// Loose rocks in the look of a hand-made stylized kit: a rough ball is cut by a dozen or so planes (the big flat faces), the
// creases between them are rounded off a little (soft edges), and the paint goes by the faces: warm and light where the sun
// is, cool blue-grey away from it, a pale rim along the edges, darker in the creases and at the foot, moss on the tops.
export const PROP_ROCK_TYPES = [
  { key: 'boulder', name: 'ก้อนใหญ่' }, { key: 'stone', name: 'ก้อนกลาง' }, { key: 'pillar', name: 'เสาหินตั้ง' },
  { key: 'ledge', name: 'แผ่นหินซ้อนชั้น' }, { key: 'overhang', name: 'ผาหินยื่น' }, { key: 'pebbles', name: 'หินกรวด' },
  { key: 'paving', name: 'หินปูทาง' },
];
const PROP_TONES = { lit: '#e2dccb', mid: '#b3b2a9', shade: '#808c98', deep: '#5c6877', rim: '#f7f4ea', sky: '#b9d3ea',
  moss: ['#9cba45', '#6f9a3a', '#4b7a31'] };
const PROP_SUN = new THREE.Vector3(-0.62, 0.62, 0.48).normalize();        // painted with a lowish sun, so the sides read light and dark

// one chiselled piece (detail: how finely the ball is cut before the planes slice it; edges per side of each of its 20 faces). size: half widths [x, y, z]; cuts: how many planes slice it; up: share of the cuts that make tops;
// planes: extra cuts [nx, ny, nz, keep] (keep: how far out the plane stands, of the piece's reach that way); round: how soft
// the edges are; lean, taper: for pillars. The piece stands on y = 0 with a little of it under the ground.
function chiselPiece({ seed = 1, size = [1, 1, 1], cuts = 20, up = 0.3, deep = [0.58, 0.82], planes = [], chips = null, detail = 14, round = 2, blob = 0.1, box = 0.55, lean = 0, taper = 0, sink = 0.08 } = {}) {
  const rng = mulberry32(seed * 977 + 13), R = (a, b) => a + rng() * (b - a);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const P = g.attributes.position.array, n = g.attributes.position.count, [sx, sy, sz] = size;
  for (let i = 0; i < n; i++) {
    let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const c = 1 / Math.max(Math.abs(x), Math.abs(y), Math.abs(z));      // towards a block: rocks stand on upright sides and flat-ish tops
    x += (x * c - x) * box * 0.6; y += (y * c - y) * box * 0.6; z += (z * c - z) * box * 0.6;
    const r = 1 + (fbm3(x * 0.9 + seed * 1.7, y * 0.9, z * 0.9, seed, 2) - 0.5) * 2 * blob;
    const t = 1 - taper * (y + 1) / 2;
    P[i * 3] = x * r * sx * t + (y + 1) * lean * sy; P[i * 3 + 1] = y * r * sy; P[i * 3 + 2] = z * r * sz * t;
  }
  // the cuts: each plane takes off whatever stands out past it, leaving a flat face
  const list = planes.map(([x, y, z, k]) => [new THREE.Vector3(x, y, z).normalize(), k]);
  for (let c = 0; c < cuts; c++) {
    const a = R(0, Math.PI * 2), el = rng() < up ? R(1.0, 1.5) : R(-0.28, 0.3);      // tops tip only a little; sides stand nearly upright
    list.push([new THREE.Vector3(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a)), R(deep[0], deep[1])]);
  }
  // then small chips off the corners and edges: little faces between the big ones
  for (let c = 0, k = chips ?? Math.round(cuts * 1.3); c < k; c++) {
    const a = R(0, Math.PI * 2), el = R(-0.5, 1.3);
    list.push([new THREE.Vector3(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a)), R(0.9, 0.97)]);
  }
  const facet = new Float32Array(n).fill(0.5);                            // which face each point ended up on: each face gets a tone of its own
  for (const [nv, k] of list) {
    const tone = rng();
    let m = -1e9;
    for (let i = 0; i < n; i++) m = Math.max(m, P[i * 3] * nv.x + P[i * 3 + 1] * nv.y + P[i * 3 + 2] * nv.z);
    const d = m * k;
    for (let i = 0; i < n; i++) {
      const t = P[i * 3] * nv.x + P[i * 3 + 1] * nv.y + P[i * 3 + 2] * nv.z - d;
      if (t > 0) { P[i * 3] -= t * nv.x; P[i * 3 + 1] -= t * nv.y; P[i * 3 + 2] -= t * nv.z; facet[i] = tone; }
    }
  }
  // soften the creases (Taubin: smooth, then push back out, so the piece keeps its size)
  const idx = g.index.array, nb = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) { const a = idx[i], b = idx[i + 1], c = idx[i + 2]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const NB = nb.map(q => [...q]), tmp = new Float32Array(n * 3);
  const pass = f => {
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, z = 0; const q = NB[i];
      for (const j of q) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; }
      const k = 1 / q.length;
      tmp[i * 3] = P[i * 3] + (x * k - P[i * 3]) * f; tmp[i * 3 + 1] = P[i * 3 + 1] + (y * k - P[i * 3 + 1]) * f; tmp[i * 3 + 2] = P[i * 3 + 2] + (z * k - P[i * 3 + 2]) * f;
    }
    P.set(tmp);
  };
  for (let r = 0; r < round; r++) { pass(0.55); pass(-0.58); }
  // the foot: flattened where it meets the ground, a little of it below
  let y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) { y0 = Math.min(y0, P[i * 3 + 1]); y1 = Math.max(y1, P[i * 3 + 1]); }
  const foot = y0 + (y1 - y0) * 0.12;
  for (let i = 0; i < n; i++) { let y = P[i * 3 + 1]; if (y < foot) y = foot + (y - foot) * 0.15; P[i * 3 + 1] = y - foot - sink * (y1 - y0); }
  g.computeVertexNormals();
  // what the paint needs: how sharply the surface bends at each point (out: an edge, in: a crease), how high up it is
  const N = g.attributes.normal.array, curv = new Float32Array(n), hgt = new Float32Array(n), top = y1 - foot - sink * (y1 - y0), bot = -sink * (y1 - y0);
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (const j of NB[i]) {
      const dx = P[j * 3] - P[i * 3], dy = P[j * 3 + 1] - P[i * 3 + 1], dz = P[j * 3 + 2] - P[i * 3 + 2], l = Math.hypot(dx, dy, dz) || 1;
      c += (N[i * 3] * dx + N[i * 3 + 1] * dy + N[i * 3 + 2] * dz) / l;
    }
    curv[i] = c / NB[i].length;
    hgt[i] = Math.max(0, Math.min(1, (P[i * 3 + 1] - bot) / (top - bot)));
  }
  g.setAttribute('aCurv', new THREE.BufferAttribute(curv, 1));
  g.setAttribute('aHgt', new THREE.BufferAttribute(hgt, 1));
  g.setAttribute('aFacet', new THREE.BufferAttribute(facet, 1));
  return g;
}
// a piece set somewhere in the rock: turned, tipped, moved; its height-from-foot stays its own
const place = (g, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0 } = {}) => {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(x, y, z);
  return g.applyMatrix4(m);
};

const PROP_BUILD = {
  boulder: (rng, seed) => [chiselPiece({ seed, size: [1.45 * (0.9 + rng() * 0.2), 1.0 * (0.85 + rng() * 0.3), 1.2], cuts: 22, up: 0.3 })],
  stone: (rng, seed) => [chiselPiece({ seed, size: [0.62, 0.42 + rng() * 0.12, 0.5], cuts: 16, detail: 9, up: 0.35 })],
  pillar: (rng, seed) => {
    const h = 2.4 + rng() * 0.9;
    return [chiselPiece({ seed, size: [0.62, h, 0.55], cuts: 22, up: 0.15, deep: [0.7, 0.9], lean: (rng() - 0.5) * 0.12, taper: 0.22, sink: 0.04, blob: 0.12 }),
      place(chiselPiece({ seed: seed + 5, size: [0.55, 0.35, 0.45], cuts: 10, detail: 7 }), { x: 0.75, z: 0.35, ry: rng() * 6 })];      // a chunk fallen at its foot
  },
  ledge: (rng, seed) => {                                                  // slabs stacked in steps, each a little smaller and set back
    const out = [], k = 3 + Math.floor(rng() * 2);
    let y = 0, x = 0, z = 0;
    for (let i = 0; i < k; i++) {
      const w = 2.5 - i * 0.42 + rng() * 0.3, d = 1.8 - i * 0.25 + rng() * 0.25, t = 0.32 + rng() * 0.12;
      out.push(place(chiselPiece({ seed: seed + i * 11, size: [w, t, d], cuts: 14, up: 0.15, planes: [[0, 1, 0, 0.82], [0.12, 1, -0.1, 0.86]], sink: i ? 0.25 : 0.1, blob: 0.1 }), { x, y, z, ry: (rng() - 0.5) * 0.5 }));
      y += t * 1.45; x += (rng() - 0.5) * 0.6 - 0.25; z += (rng() - 0.5) * 0.4;
    }
    return out;
  },
  overhang: (rng, seed) => [                                               // a big slab tipped up over a mass of rock, jutting out
    chiselPiece({ seed, size: [2.0, 1.4, 1.9], cuts: 20, up: 0.25 }),
    place(chiselPiece({ seed: seed + 3, size: [3.2, 0.62, 1.75], cuts: 16, up: 0.15, planes: [[0, 1, 0, 0.85]], sink: 0, blob: 0.1 }), { x: 1.6, y: 1.55, z: 0.1, rz: 0.2, ry: (rng() - 0.5) * 0.3 }),
    place(chiselPiece({ seed: seed + 7, size: [0.8, 0.55, 0.7], cuts: 10, detail: 8 }), { x: 3.3, z: -0.6, ry: rng() * 6 }),
  ],
  pebbles: (rng, seed) => {
    const out = [];
    for (let i = 0; i < 12 + Math.floor(rng() * 5); i++) {
      const s = 0.09 + rng() * 0.16 * (i < 3 ? 1.6 : 1), a = rng() * 6.28, r = Math.sqrt(rng()) * 0.95;
      out.push(place(chiselPiece({ seed: seed * 31 + i, size: [s * (1 + rng() * 0.4), s * 0.5, s], cuts: 5, detail: 4, round: 2, blob: 0.1, sink: 0.15 }), { x: Math.cos(a) * r, z: Math.sin(a) * r, ry: rng() * 6 }));
    }
    return out;
  },
  paving: (rng, seed) => {                                                 // stepping stones along a gentle curve
    const out = [];
    for (let i = 0; i < 5; i++) {
      const t = i - 2, s = 0.34 + rng() * 0.08;
      out.push(place(chiselPiece({ seed: seed * 17 + i, size: [s * 1.15, 0.11, s], cuts: 4, detail: 7, round: 2, blob: 0.06, sink: 0.35,
        planes: [[1, 0, 0, 0.8], [-1, 0, 0, 0.8], [0, 0, 1, 0.82], [0, 0, -1, 0.82], [0, 1, 0, 0.7]] }), { x: t * 0.82, z: Math.sin(t * 0.7) * 0.35, ry: (rng() - 0.5) * 0.5 }));
    }
    return out;
  },
};
const PROP_MOSS = { boulder: 1, stone: 0.6, pillar: 1, ledge: 1, overhang: 1, pebbles: 0, paving: 0.35 };

export function createPropRock({ type = 'boulder', seed = 1 } = {}) {
  const rng = mulberry32(seed * 7919 + type.length * 31);
  const geo = mergeGeometries(PROP_BUILD[type](rng, seed));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, propRockMaterial({ moss: PROP_MOSS[type] }));
  mesh.name = 'propRock-' + type;
  mesh.userData = { kind: 'propRock', type, seed, dispose: () => geo.dispose() };
  return mesh;
}

const propMats = {};
export function propRockMaterial({ moss = 1 } = {}) {
  const key = 'm' + moss;
  if (propMats[key]) return propMats[key];
  const T = PROP_TONES;
  return (propMats[key] = new THREE.ShaderMaterial({
    uniforms: {
      uLit: { value: rgb(T.lit) }, uMid: { value: rgb(T.mid) }, uShade: { value: rgb(T.shade) }, uDeep: { value: rgb(T.deep) }, uRim: { value: rgb(T.rim) }, uSky: { value: rgb(T.sky) },
      uM0: { value: rgb(T.moss[0]) }, uM1: { value: rgb(T.moss[1]) }, uM2: { value: rgb(T.moss[2]) }, uMoss: { value: moss }, uSun: { value: PROP_SUN },
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      attribute float aCurv, aHgt, aFacet;
      varying vec3 vWN, vWP;
      varying float vCurv, vHgt, vFacet, vHaze;
      void main() {
        vWN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
        vCurv = aCurv; vHgt = aHgt; vFacet = aFacet;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      uniform vec3 uLit, uMid, uShade, uDeep, uRim, uSky, uM0, uM1, uM2, uSun;
      uniform float uMoss;
      varying vec3 vWN, vWP;
      varying float vCurv, vHgt, vFacet;
      void main() {
        vec3 n = normalize(vWN);
        // the light, painted in a few soft steps; the brush wobbles a little
        float t = dot(n, uSun) * 0.5 + 0.5 + (noise2(vWP.xz * 1.4 + vWP.y * 0.9) - 0.5) * 0.07 + (vFacet - 0.5) * 0.16;   // each face its own tone
        vec3 col = mix(uDeep, uShade, smoothstep(0.28, 0.38, t));
        col = mix(col, uMid, smoothstep(0.5, 0.6, t));
        col = mix(col, uLit, smoothstep(0.7, 0.78, t));
        col = mix(col, col * uSky * 1.25, (1.0 - smoothstep(0.4, 0.65, t)) * clamp(n.y * 0.5 + 0.5, 0.0, 1.0) * 0.35);   // sky in the shade
        // edges catch the light, creases hold the dark
        float edge = clamp(-vCurv * 5.0 - 0.08, 0.0, 1.0), crease = clamp(vCurv * 5.0 - 0.05, 0.0, 1.0);
        col = mix(col, uRim, edge * mix(0.25, 0.65, smoothstep(0.35, 0.75, t)));
        col *= 1.0 - crease * 0.38;
        col *= 0.93 + 0.14 * noise2(vWP.xz * 0.45 + vWP.y * 0.3);                       // broad changes of tone across the rock
        float side = 1.0 - abs(n.y);                                                      // faint weathering streaks down the sides
        col *= 1.0 - side * 0.1 * smoothstep(0.55, 0.85, noise2(vec2((vWP.x + vWP.z) * 2.6, vWP.y * 0.35)));
        col *= mix(0.6, 1.0, smoothstep(0.0, 0.3, vHgt));                               // dark where it meets the ground
        if (uMoss > 0.0) {
          float m = n.y + (noise2(vWP.xz * 1.3 + vWP.y) - 0.5) * 0.9 + (noise2(vWP.xz * 6.0) - 0.5) * 0.2 - (1.0 - vHgt) * 0.8 - (1.0 - uMoss) * 0.3 - 0.03;
          vec3 mc = mix(uM2, mix(uM1, uM0, smoothstep(0.86, 1.0, n.y + (noise2(vWP.xz * 3.0) - 0.5) * 0.2)), smoothstep(0.35, 0.7, t));
          col *= 1.0 - 0.22 * smoothstep(0.5, 0.64, m) * (1.0 - smoothstep(0.64, 0.7, m));   // a shadow just under the moss's edge
          col = mix(col, mc, smoothstep(0.64, 0.7, m));
        }
        gl_FragColor = vec4(mix(col, uHaze, vHaze), 1.0);
      }`,
  }));
}
