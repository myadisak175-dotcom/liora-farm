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
   5. ROCK PROPS    (catalog only, for now: rock-catalog.html) — loose rocks and cliff pieces in a hand-painted stylized
                    look: big flat chiselled faces with soft rounded edges, warm light tops, cool blue-grey sides, a pale
                    rim on the edges, moss on what faces the sky. Big shapes are assembled from pieces sunk into each other.
        PROP_ROCK_TYPES ({ key, name, group: 'rock' | 'cliff' }), createPropRock({ type, seed, world }), propRockMaterial({ moss, world })
   6. FUSING        (rock-builder.html) — pieces set into each other melted into one rock, the joins filled out into curves
        fuseRocks(meshes, { blend })
   7. GROUND + WATER (rock-builder.html, rocks-level.js) — what the rocks know of the world round them: the ground's height
                    and colour, drawn once from straight above (like Unreal's runtime virtual texture), and the water's level
        bakeGroundForRocks(renderer, grounds, { center, size, res }), GROUND_BLEND (its settings), setRockWater({ texture, ... })
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
  { key: 'boulder', name: 'ก้อนใหญ่', group: 'rock' }, { key: 'stone', name: 'ก้อนกลาง', group: 'rock' }, { key: 'pillar', name: 'เสาหินตั้ง', group: 'rock' },
  { key: 'ledge', name: 'แผ่นหินซ้อนชั้น', group: 'rock' }, { key: 'pebbles', name: 'หินกรวด', group: 'rock' }, { key: 'paving', name: 'หินปูทาง', group: 'rock' },
  { key: 'wall', name: 'ผาตรง', group: 'cliff' }, { key: 'corner', name: 'ผามุม', group: 'cliff' }, { key: 'overhang', name: 'ผายื่น', group: 'cliff' },
  { key: 'steps', name: 'ผาขั้นบันได', group: 'cliff' }, { key: 'spire', name: 'ยอดผา', group: 'cliff' }, { key: 'range', name: 'ผาประกอบ (ตัวอย่าง)', group: 'cliff' },
];
const PROP_TONES = { lit: '#cec7b4', mid: '#9e9d95', shade: '#717d8a', deep: '#4f5a69', rim: '#e9e3d2', sky: '#b9d3ea',
  moss: ['#9cba45', '#6f9a3a', '#4b7a31'] };
const PROP_SUN = new THREE.Vector3(-0.62, 0.62, 0.48).normalize();        // painted with a lowish sun, so the sides read light and dark

// one chiselled piece (detail: how finely the ball is cut before the planes slice it; edges per side of each of its 20 faces). size: half widths [x, y, z]; cuts: how many planes slice it; up: share of the cuts that make tops;
// planes: extra cuts [nx, ny, nz, keep] (keep: how far out the plane stands, of the piece's reach that way); round: how soft
// the edges are; lean, taper: for pillars; warp(x, y, z, h): bends the shape before it is cut (h: 0 at its foot, 1 at its top). The piece stands on y = 0 with a little of it under the ground.
function chiselPiece({ seed = 1, size = [1, 1, 1], cuts = 20, up = 0.3, deep = [0.58, 0.82], planes = [], chips = null, detail = 14, round = 2, blob = 0.1, box = 0.55, lean = 0, taper = 0, sink = 0.08, warp = null } = {}) {
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
    if (warp) { const q = warp(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], (y + 1) / 2); P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2]; }
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
  const hgt = new Float32Array(n), top = y1 - foot - sink * (y1 - y0), bot = -sink * (y1 - y0);
  for (let i = 0; i < n; i++) hgt[i] = Math.max(0, Math.min(1, (P[i * 3 + 1] - bot) / (top - bot)));
  g.setAttribute('aCurv', new THREE.BufferAttribute(bendOf(P, g.attributes.normal.array, NB), 1));
  g.setAttribute('aHgt', new THREE.BufferAttribute(hgt, 1));
  g.setAttribute('aFacet', new THREE.BufferAttribute(facet, 1));
  return g;
}
// how the surface bends at each point: the mean slope from it to its neighbours along its normal (< 0: an edge, > 0: a crease)
function bendOf(P, N, NB) {
  const curv = new Float32Array(NB.length);
  for (let i = 0; i < NB.length; i++) {
    let c = 0;
    for (const j of NB[i]) {
      const dx = P[j * 3] - P[i * 3], dy = P[j * 3 + 1] - P[i * 3 + 1], dz = P[j * 3 + 2] - P[i * 3 + 2], l = Math.hypot(dx, dy, dz) || 1;
      c += (N[i * 3] * dx + N[i * 3 + 1] * dy + N[i * 3 + 2] * dz) / l;
    }
    curv[i] = NB[i].length ? c / NB[i].length : 0;
  }
  return curv;
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
// ---- cliff pieces: big, so cut from a finer ball; each shows its face to +z (the side it is looked at from) and is made to
// be set in a row with its neighbours sunk into it
const cliffBlock = (seed, size, o = {}) => chiselPiece({ seed, size, cuts: 24, up: 0.22, deep: [0.78, 0.93], detail: 20, box: 0.7, blob: 0.08, sink: 0.05, ...o });
const topOf = g => { g.computeBoundingBox(); return g.boundingBox.max.y; };      // pieces are stacked by where the one below really ends
Object.assign(PROP_BUILD, {
  wall: (rng, seed) => {                                                   // a stretch of cliff: a tall block, a lower one stepping out at its foot, a cap
    const h = 2.8 + rng() * 0.6, main = cliffBlock(seed, [3.3, h, 1.3]), cap = cliffBlock(seed + 5, [1.7, 0.75, 1.0], { detail: 12 });
    return [main,
      place(cliffBlock(seed + 3, [2.4, 1.3, 1.0], { detail: 14 }), { x: (rng() - 0.5) * 2.2, z: 1.0, ry: (rng() - 0.5) * 0.4 }),
      place(cap, { x: (rng() - 0.5) * 2.4, y: topOf(main) - topOf(cap) * 0.55, z: -0.35, ry: (rng() - 0.5) * 0.5 })];
  },
  corner: (rng, seed) => {                                                 // two stretches meeting at a right angle, a block filling the corner
    const h = 2.9 + rng() * 0.4;
    return [place(cliffBlock(seed, [2.8, h, 1.2]), { x: 1.9 }),
      place(cliffBlock(seed + 2, [2.8, h * 0.92, 1.2]), { x: -1.0, z: -2.7, ry: Math.PI / 2 }),
      place(cliffBlock(seed + 4, [1.5, h * 1.08, 1.5], { detail: 14 }), { x: -0.6, z: -0.4, ry: 0.7 })];
  },
  overhang: (rng, seed) => {                                               // one piece: its foot sunk in the ground, its top leaning out over a hollow
    const out = 2.6 + rng() * 0.6;
    return [cliffBlock(seed, [2.6, 2.6, 1.7], { up: 0.15, sink: 0.03,
      warp: (x, y, z, h) => [x, y, z + out * h * h * h - (z > 0 ? z * 0.7 * Math.sin(Math.PI * Math.min(1, h * 1.4)) : 0)] }),
    place(cliffBlock(seed + 6, [1.1, 0.7, 0.9], { detail: 10 }), { x: 1.9, z: 1.3, ry: rng() * 6 })];      // a block fallen from it
  },
  steps: (rng, seed) => {                                                  // three tiers, each set back and higher, sunk into the one below
    const out = []; let y = 0, z = 0;
    for (let i = 0; i < 3; i++) {
      const g = cliffBlock(seed + i * 7, [3.2 - i * 0.5, 1.1 + rng() * 0.3, 1.5], { detail: 16 }), top = topOf(g);
      out.push(place(g, { x: (rng() - 0.5) * 0.8, y, z, ry: (rng() - 0.5) * 0.25 }));
      y += top * 0.72; z -= 1.3;
    }
    return out;
  },
  spire: (rng, seed) => [cliffBlock(seed, [1.5, 4.4 + rng(), 1.3], { up: 0.12, taper: 0.35, lean: (rng() - 0.5) * 0.1 }),
    place(cliffBlock(seed + 2, [1.3, 1.4, 1.1], { detail: 12 }), { x: 1.2, z: 0.6, ry: rng() * 6 })],
  range: (rng, seed) => {                                                  // what the pieces make together: a stretch of cliff with a corner and a lean
    const parts = [], add = (type, s, o, k = 1) => { for (const g of PROP_BUILD[type](mulberry32(s * 31), s)) { g.scale(k, k, k); parts.push(place(g, o)); } };
    add('wall', seed, { x: -7.5, ry: 0.08 }, 1.5);
    add('wall', seed + 11, { x: 0.3, z: 0.6, ry: -0.1 }, 1.75);
    add('spire', seed + 13, { x: -3.6, z: -1.6, ry: 0.4 }, 1.6);
    add('overhang', seed + 23, { x: 8.2, z: 0.8, ry: -0.25 }, 1.4);
    add('corner', seed + 37, { x: -14.5, z: -1.5, ry: 0.2 }, 1.35);
    add('stone', seed + 41, { x: -3.0, z: 4.6 }, 1.6);
    add('boulder', seed + 43, { x: 3.8, z: 4.4, ry: 0.6 }, 0.9);
    add('stone', seed + 47, { x: 12, z: 4.2, ry: 1.2 }, 1.2);
    add('pebbles', seed + 53, { x: -8.5, z: 5.2 }, 1.2);
    return parts;
  },
});
const PROP_MOSS = { boulder: 1, stone: 0.6, pillar: 1, ledge: 1, pebbles: 0, paving: 0.35, wall: 1, corner: 1, overhang: 1, steps: 1, spire: 0.8, range: 1 };


// world: paint the foot's dark and the moss by height above the ground (y = 0) instead of by each piece's own foot, so pieces
// stacked into one rock share one shading (rock-builder.html)
export function createPropRock({ type = 'boulder', seed = 1, world = false } = {}) {
  const rng = mulberry32(seed * 7919 + type.length * 31);
  const geo = mergeGeometries(PROP_BUILD[type](rng, seed));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, propRockMaterial({ moss: PROP_MOSS[type], world }));
  mesh.name = 'propRock-' + type;
  mesh.userData = { kind: 'propRock', type, seed, dispose: () => geo.dispose() };
  return mesh;
}

const propMats = {};
export function propRockMaterial({ moss = 1, world = false } = {}) {
  const key = 'm' + moss + (world ? 'w' : '');
  if (propMats[key]) return propMats[key];
  const T = PROP_TONES;
  return (propMats[key] = new THREE.ShaderMaterial({
    uniforms: {
      uLit: { value: rgb(T.lit) }, uMid: { value: rgb(T.mid) }, uShade: { value: rgb(T.shade) }, uDeep: { value: rgb(T.deep) }, uRim: { value: rgb(T.rim) }, uSky: { value: rgb(T.sky) },
      uM0: { value: rgb(T.moss[0]) }, uM1: { value: rgb(T.moss[1]) }, uM2: { value: rgb(T.moss[2]) }, uMoss: { value: moss }, uSun: { value: PROP_SUN }, uWorld: { value: world ? 2.6 : 0 }, ...GROUND_U,
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
      uniform float uMoss, uWorld, uGOn, uGHas, uGBlend, uWOn;
      uniform sampler2D uGCol, uGH, uWLev;
      uniform vec4 uGRect, uWRect;
      varying vec3 vWN, vWP;
      varying float vCurv, vHgt, vFacet;
      void main() {
        vec3 n = normalize(vWN);
        // the ground under this point, when the ground's height is known (section 7); otherwise the ground is taken to be at y = 0
        vec2 guv = vec2((vWP.x - uGRect.x) * uGRect.z, (uGRect.y - vWP.z) * uGRect.w);
        bool onG = uGHas > 0.5 && guv.x > 0.0 && guv.x < 1.0 && guv.y > 0.0 && guv.y < 1.0;
        float groundY = onG ? texture2D(uGH, guv).r : 0.0;
        float hg = uWorld > 0.0 ? clamp((vWP.y - groundY) / uWorld, 0.0, 1.0) : vHgt;     // how high up: on its own foot, or above the ground
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
        col *= mix(0.6, 1.0, smoothstep(0.0, 0.3, hg));                                 // dark where it meets the ground
        if (uMoss > 0.0) {
          float m = n.y + (noise2(vWP.xz * 1.3 + vWP.y) - 0.5) * 0.9 + (noise2(vWP.xz * 6.0) - 0.5) * 0.2 - (1.0 - hg) * 0.8 - (1.0 - uMoss) * 0.3 - 0.03;
          vec3 mc = mix(uM2, mix(uM1, uM0, smoothstep(0.86, 1.0, n.y + (noise2(vWP.xz * 3.0) - 0.5) * 0.2)), smoothstep(0.35, 0.7, t));
          col *= 1.0 - 0.22 * smoothstep(0.5, 0.64, m) * (1.0 - smoothstep(0.64, 0.7, m));   // a shadow just under the moss's edge
          col = mix(col, mc, smoothstep(0.64, 0.7, m));
        }
        if (uGOn > 0.5 && onG) {                                                          // the foot takes the ground's colour: only what faces
          // up and lies right at the ground (more and the rock seems to float: the eye loses where it meets the ground)
          float above = vWP.y - groundY + (noise2(vWP.xz * 1.9 + vWP.y * 0.7) - 0.5) * uGBlend * 0.9 + (noise2(vWP.xz * 6.5 + vWP.y * 2.0) - 0.5) * uGBlend * 0.35;
          float b = (1.0 - smoothstep(uGBlend * 0.82, uGBlend * 0.95, above)) * smoothstep(0.35, 0.65, n.y);
          col = mix(col, texture2D(uGCol, guv).rgb * 0.9, b);
        }
        if (uWOn > 0.5) {                                                                 // water: wet and dark at the waterline, tinted below it
          vec2 wuv = vec2((vWP.x - uWRect.x) * uWRect.z, (uWRect.y - vWP.z) * uWRect.w);
          float lv = (wuv.x > 0.0 && wuv.x < 1.0 && wuv.y > 0.0 && wuv.y < 1.0) ? texture2D(uWLev, wuv).r : -1e4;
          if (lv > -1e3) {
            float d = vWP.y - lv + (noise2(vWP.xz * 3.1 + vWP.y * 1.3) - 0.5) * 0.08;
            float wet = 1.0 - smoothstep(0.1, 0.24, d);                                   // the splash line: a band of wet stone above the water
            col = mix(col, col * vec3(0.62, 0.66, 0.66), wet * 0.85);
            col = mix(col, col * vec3(0.62, 0.86, 0.8) + vec3(0.0, 0.03, 0.02), (1.0 - smoothstep(-0.02, 0.0, d)) * 0.6);      // under the water: greener, mossy
          }
        }
        gl_FragColor = vec4(mix(col, uHaze, vHaze), 1.0);
      }`,
  }));
}

// ==================================================================================================== 7. GROUND BLEND
// The ground under the rocks, drawn once from straight above into two pictures: its colour, and its height. Every prop rock's
// paint reads them (they share these settings): the height, so the dark at a rock's foot and the moss go by how high it stands
// above the ground there; the colour, if GROUND_BLEND.on, for a thin painted edge of ground colour on what faces up at the foot.
// (Painting the whole foot in the ground's colour was tried and dropped: with no line where rock meets ground, rocks seemed to
// float. What anchors a rock is the shadow round its foot on the ground and the grass against it, which the levels do.)
//   bakeGroundForRocks(renderer, [groundMesh], { center: [x, z], size: 60, res: 1024 });   GROUND_BLEND.height = 0.2
const GROUND_U = {
  uGOn: { value: 0 }, uGHas: { value: 0 }, uGBlend: { value: 0.2 }, uGRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uGCol: { value: null }, uGH: { value: null },
  uWOn: { value: 0 }, uWLev: { value: null }, uWRect: { value: new THREE.Vector4(0, 0, 1, 1) },
};
export const GROUND_BLEND = {
  get on() { return GROUND_U.uGOn.value > 0.5; }, set on(v) { GROUND_U.uGOn.value = v && GROUND_U.uGCol.value ? 1 : 0; },      // off unless asked for
  get known() { return GROUND_U.uGHas.value > 0.5; },
  get height() { return GROUND_U.uGBlend.value; }, set height(v) { GROUND_U.uGBlend.value = v; },
};
let groundRT = null;
export function bakeGroundForRocks(renderer, grounds, { center = [0, 0], size = 60, res = 1024 } = {}) {
  const [cx, cz] = center, h = size / 2;
  if (!groundRT) groundRT = {
    col: new THREE.WebGLRenderTarget(res, res, { depthBuffer: true }),
    hgt: new THREE.WebGLRenderTarget(res, res, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }),
    heightMat: new THREE.ShaderMaterial({
      vertexShader: 'varying float vY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'varying float vY; void main() { gl_FragColor = vec4(vY, 0.0, 0.0, 1.0); }',
    }),
  };
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-h, h, h, -h, 1, 1000);
  cam.position.set(cx, 500, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz);
  const parents = grounds.map(g => g.parent);
  for (const g of grounds) scene.add(g);
  const haze = shared.uHazeMax.value, oldTarget = renderer.getRenderTarget(), oldClear = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha();
  shared.uHazeMax.value = 0;                                               // the ground's own colour, not as seen through air
  renderer.setRenderTarget(groundRT.col); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, cam);
  scene.overrideMaterial = groundRT.heightMat;
  renderer.setRenderTarget(groundRT.hgt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, cam);
  renderer.setRenderTarget(oldTarget); renderer.setClearColor(oldClear, oldAlpha);
  shared.uHazeMax.value = haze;
  grounds.forEach((g, i) => { if (parents[i]) parents[i].add(g); });
  GROUND_U.uGCol.value = groundRT.col.texture; GROUND_U.uGH.value = groundRT.hgt.texture;
  GROUND_U.uGRect.value.set(cx - h, cz + h, 1 / size, 1 / size);
  GROUND_U.uGHas.value = 1;
}
// ---- the water the rocks stand in: a picture of the water's level over the map (-10000 where there is none), laid out like
// the ground's pictures (x0 at the left edge, z1 at the top edge, 1 / size). Rocks get a wet band at the waterline and a
// greener tint under the water.
export function setRockWater({ texture, x0, z1, size } = {}) {
  GROUND_U.uWLev.value = texture || null;
  GROUND_U.uWOn.value = texture ? 1 : 0;
  if (texture) GROUND_U.uWRect.value.set(x0, z1, 1 / size, 1 / size);
}

// ==================================================================================================== 6. FUSING
// Pieces set into each other in the builder melt into one rock. Each piece's shape is measured on a grid of points (how far each
// point is from its surface, below zero inside it); the pieces are joined with a soft minimum, so where two meet the join fills
// out into a curve of rock instead of a crease; a new surface is drawn through the grid (surface nets). Faces away from the joins
// keep their flat chiselled planes; the faces' tones are carried over from the nearest point of the pieces.
//   const geo = fuseRocks(meshes, { blend: 0.6 });     // geometry in world space, for propRockMaterial({ world: true })
// blend: how soft the joins are (a join swells out about a quarter of this, in metres); the grid is cut off just under the
// ground, where nothing shows.
export function fuseRocks(meshes, { blend = 0.6, maxCells = 1.6e6, floor = -0.3 } = {}) {
  const pieces = [], box = new THREE.Box3(), v = new THREE.Vector3();
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const g = m.geometry, pos = g.attributes.position, nor = g.attributes.normal, W = new Float32Array(pos.count * 3), NW = new Float32Array(pos.count * 3);
    const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); W[i * 3] = v.x; W[i * 3 + 1] = v.y; W[i * 3 + 2] = v.z;
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); NW[i * 3] = v.x; NW[i * 3 + 1] = v.y; NW[i * 3 + 2] = v.z;
    }
    // a rock may be several chiselled pieces in one mesh (each closed on itself, sunk into the others): each is taken on its own,
    // so the surfaces inside the rock are not mistaken for its outside, and the joins between them fill out too
    const I = g.index.array, F = g.attributes.aFacet ? g.attributes.aFacet.array : null, up = new Int32Array(pos.count).map((_, i) => i);
    const root = x => { while (up[x] !== x) x = up[x] = up[up[x]]; return x; };
    for (let t = 0; t < I.length; t += 3) { const a = root(I[t]), b = root(I[t + 1]), c = root(I[t + 2]); up[b] = a; up[root(c)] = a; }
    const parts = new Map();
    for (let t = 0; t < I.length; t += 3) { const r = root(I[t]); let l = parts.get(r); if (!l) parts.set(r, l = []); l.push(I[t], I[t + 1], I[t + 2]); }
    for (const l of parts.values()) {
      const idx = Uint32Array.from(l), pb = new THREE.Box3();
      for (const q of idx) pb.expandByPoint(v.set(W[q * 3], W[q * 3 + 1], W[q * 3 + 2]));
      box.union(pb);
      pieces.push({ W, NW, idx, F, box: pb });
    }
  }
  if (!pieces.length) return null;
  box.min.y = Math.max(box.min.y, floor);
  const pad = blend * 1.5 + 0.3, sz = box.getSize(new THREE.Vector3()).addScalar(pad * 2);
  const cell = Math.max(0.05, Math.cbrt(sz.x * sz.y * sz.z / maxCells));
  const O = box.min.clone().subScalar(pad); O.y = Math.max(O.y, floor);
  const nx = Math.ceil(sz.x / cell) + 1, ny = Math.ceil((box.max.y + pad - O.y) / cell) + 1, nz = Math.ceil(sz.z / cell) + 1;
  const band = blend * 1.6 + 2 * cell, D = new Float32Array(nx * ny * nz).fill(band);
  const at = (i, j, k) => (k * ny + j) * nx + i;
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

  for (const pc of pieces) {
    const { W, NW, idx } = pc, T = idx.length / 3;
    // the piece's own part of the grid
    const i0 = Math.max(0, Math.floor((pc.box.min.x - band - O.x) / cell)), i1 = Math.min(nx - 1, Math.ceil((pc.box.max.x + band - O.x) / cell));
    const j0 = Math.max(0, Math.floor((pc.box.min.y - band - O.y) / cell)), j1 = Math.min(ny - 1, Math.ceil((pc.box.max.y + band - O.y) / cell));
    const k0 = Math.max(0, Math.floor((pc.box.min.z - band - O.z) / cell)), k1 = Math.min(nz - 1, Math.ceil((pc.box.max.z + band - O.z) / cell));
    const lx = i1 - i0 + 1, ly = j1 - j0 + 1, lz = k1 - k0 + 1, L = lx * ly * lz, li = (i, j, k) => (k * ly + j) * lx + i;
    const X = i => O.x + (i0 + i) * cell, Y = j => O.y + (j0 + j) * cell, Z = k => O.z + (k0 + k) * cell;
    // the triangles over each column of the grid
    const cols = Array.from({ length: lx * lz }, () => []);
    for (let t = 0; t < T; t++) {
      const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const ia = Math.max(0, Math.ceil((Math.min(W[a], W[b], W[c]) - O.x) / cell) - i0), ib = Math.min(lx - 1, Math.floor((Math.max(W[a], W[b], W[c]) - O.x) / cell) - i0);
      const ka = Math.max(0, Math.ceil((Math.min(W[a + 2], W[b + 2], W[c + 2]) - O.z) / cell) - k0), kb = Math.min(lz - 1, Math.floor((Math.max(W[a + 2], W[b + 2], W[c + 2]) - O.z) / cell) - k0);
      for (let k = ka; k <= kb; k++) for (let i = ia; i <= ib; i++) cols[k * lx + i].push(t);
    }
    // inside or out: a ray up each column, counting where it crosses the surface by which way the surface faces there (going out
    // +1, coming in -1), so where the cuts folded the surface over itself the layers cancel out. Three rays a little apart in each
    // column, and a point is inside if two of them say so.
    const occ = new Uint8Array(L), votes = new Uint8Array(L), hits = [], JIT = [[0.0013, 0.0007], [0.21, -0.17], [-0.19, 0.23]];
    for (const [jx, jz] of JIT) for (let k = 0; k < lz; k++) for (let i = 0; i < lx; i++) {
      const px = X(i) + cell * jx, pz = Z(k) + cell * jz; hits.length = 0;
      for (const t of cols[k * lx + i]) {
        const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
        const x1 = W[a], z1 = W[a + 2], x2 = W[b], z2 = W[b + 2], x3 = W[c], z3 = W[c + 2];
        const d = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3);
        if (Math.abs(d) < 1e-14) continue;
        const u = ((z2 - z3) * (px - x3) + (x3 - x2) * (pz - z3)) / d, w = ((z3 - z1) * (px - x3) + (x1 - x3) * (pz - z3)) / d, q = 1 - u - w;
        if (u < 0 || w < 0 || q < 0) continue;
        const ny = (z2 - z1) * (x3 - x1) - (x2 - x1) * (z3 - z1);              // which way it faces, up or down
        hits.push(u * W[a + 1] + w * W[b + 1] + q * W[c + 1], ny > 0 ? 1 : -1);
      }
      if (hits.length < 4) continue;
      const order = []; for (let n = 0; n < hits.length; n += 2) order.push(n);
      order.sort((p, q) => hits[q] - hits[p]);                               // from the top down
      let wind = 0, above = Infinity;
      for (const n of order) {
        const y = hits[n];
        if (wind > 0) {                                                      // inside between this crossing and the one above
          const ja = Math.max(0, Math.ceil((y - O.y) / cell) - j0), jb = Math.min(ly - 1, Math.floor((above - O.y) / cell) - j0);
          for (let j = ja; j <= jb; j++) votes[li(i, j, k)]++;
        }
        wind += hits[n + 1]; above = y;
      }
    }
    for (let o = 0; o < L; o++) occ[o] = votes[o] >= 2 ? 1 : 0;
    // exact distances where the surface passes, from the triangles near each point
    const hb = cell * 2, hk = (a, b, c) => (Math.floor(a / hb) * 73856093) ^ (Math.floor(b / hb) * 19349663) ^ (Math.floor(c / hb) * 83492791), hash = new Map();
    for (let t = 0; t < T; t++) {
      const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3, e = cell * 1.6;
      const xa = Math.floor((Math.min(W[a], W[b], W[c]) - e) / hb), xb = Math.floor((Math.max(W[a], W[b], W[c]) + e) / hb);
      const ya = Math.floor((Math.min(W[a + 1], W[b + 1], W[c + 1]) - e) / hb), yb = Math.floor((Math.max(W[a + 1], W[b + 1], W[c + 1]) + e) / hb);
      const za = Math.floor((Math.min(W[a + 2], W[b + 2], W[c + 2]) - e) / hb), zb = Math.floor((Math.max(W[a + 2], W[b + 2], W[c + 2]) + e) / hb);
      for (let z = za; z <= zb; z++) for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const key = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
        let list = hash.get(key); if (!list) hash.set(key, list = []); list.push(t);
      }
    }
    // near the surface (where inside and out change over, and one point either side of that) the exact distance to the nearest
    // triangle, and which side of it the point is on, from the surface's own facing there (more to be trusted than the rays)
    const A = new Float32Array(L).fill(Infinity), C = new Float32Array(L * 3), side = new Int8Array(L), near = new Uint8Array(L);
    for (let k = 0; k < lz; k++) for (let j = 0; j < ly; j++) for (let i = 0; i < lx; i++) {
      const o = li(i, j, k), s = occ[o];
      if ((i > 0 && occ[o - 1] !== s) || (i < lx - 1 && occ[o + 1] !== s) || (j > 0 && occ[o - lx] !== s) || (j < ly - 1 && occ[o + lx] !== s) ||
        (k > 0 && occ[o - lx * ly] !== s) || (k < lz - 1 && occ[o + lx * ly] !== s)) {
        for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj, kk = k + dk;
          if (ii >= 0 && jj >= 0 && kk >= 0 && ii < lx && jj < ly && kk < lz) near[li(ii, jj, kk)] = 1;
        }
      }
    }
    for (let k = 0; k < lz; k++) for (let j = 0; j < ly; j++) for (let i = 0; i < lx; i++) {
      const o = li(i, j, k);
      if (!near[o]) continue;
      const px = X(i), py = Y(j), pz = Z(k), list = hash.get(hk(px, py, pz));
      let best = Infinity, bt = -1;
      if (list) for (const t of list) { const d = triDist2(W, idx[t * 3] * 3, idx[t * 3 + 1] * 3, idx[t * 3 + 2] * 3, px, py, pz); if (d < best) { best = d; bt = t; C[o * 3] = TQ[0]; C[o * 3 + 1] = TQ[1]; C[o * 3 + 2] = TQ[2]; } }
      if (bt < 0) continue;                                                // no surface near: left for the sweep to reach
      A[o] = Math.sqrt(best);
      // the surface's facing at the nearest point: its corners' normals, the nearer corners counting for more
      let nx = 0, ny = 0, nz = 0;
      for (let e = 0; e < 3; e++) {
        const vtx = idx[bt * 3 + e] * 3, wgt = 1 / (Math.hypot(W[vtx] - C[o * 3], W[vtx + 1] - C[o * 3 + 1], W[vtx + 2] - C[o * 3 + 2]) + 1e-4);
        nx += NW[vtx] * wgt; ny += NW[vtx + 1] * wgt; nz += NW[vtx + 2] * wgt;
      }
      const dot = (px - C[o * 3]) * nx + (py - C[o * 3 + 1]) * ny + (pz - C[o * 3 + 2]) * nz;
      side[o] = A[o] < cell * 0.05 ? (occ[o] ? -1 : 1) : (dot >= 0 ? 1 : -1);
    }
    // out from there across the grid, each point taking the nearest surface point of its neighbours (forward, then back):
    // near-exact distances, so the joins swell out smoothly
    const NBR = [];
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj || dk) NBR.push([di, dj, dk, dk * lx * ly + dj * lx + di]);
    const before = NBR.filter(q => q[3] < 0), after = NBR.filter(q => q[3] > 0);
    const sweep = (list, from, to, st) => {
      for (let k = from[2]; k !== to[2]; k += st) for (let j = from[1]; j !== to[1]; j += st) for (let i = from[0]; i !== to[0]; i += st) {
        const o = li(i, j, k), px = X(i), py = Y(j), pz = Z(k); let a = A[o];
        for (const [di, dj, dk, d] of list) {
          const ii = i + di, jj = j + dj, kk = k + dk, q = o + d;
          if (ii < 0 || jj < 0 || kk < 0 || ii >= lx || jj >= ly || kk >= lz || A[q] === Infinity || occ[q] !== occ[o]) continue;
          const b = Math.hypot(px - C[q * 3], py - C[q * 3 + 1], pz - C[q * 3 + 2]);
          if (b < a) { a = b; C[o * 3] = C[q * 3]; C[o * 3 + 1] = C[q * 3 + 1]; C[o * 3 + 2] = C[q * 3 + 2]; }
        }
        A[o] = a;
      }
    };
    sweep(before, [0, 0, 0], [lx, ly, lz], 1);
    sweep(after, [lx - 1, ly - 1, lz - 1], [-1, -1, -1], -1);
    sweep(before, [0, 0, 0], [lx, ly, lz], 1);
    // into the whole: a soft minimum with what is there already
    for (let k = 0; k < lz; k++) for (let j = 0; j < ly; j++) for (let i = 0; i < lx; i++) {
      const o = li(i, j, k), d = Math.min(A[o], band) * (side[o] || (occ[o] ? -1 : 1)), g = at(i0 + i, j0 + j, k0 + k);
      D[g] = smin(D[g], d, blend);
    }
  }

  // a point whose side disagrees with all six around it is a mistake (a pit or a pimple): it takes its neighbours' mean
  for (let pass = 0; pass < 2; pass++) for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const o = at(i, j, k), d = D[o], nb = [D[o - 1], D[o + 1], D[o - nx], D[o + nx], D[o - nx * ny], D[o + nx * ny]];
    if (nb.every(q => (q < 0) !== (d < 0))) D[o] = nb.reduce((a, q) => a + q, 0) / 6;
  }
  // the new surface: one point in every cube of the grid the surface passes through, joined across every edge it crosses
  const cubeV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cv = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
  const pos = [], CORN = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDG = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]], val = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) { val[c] = D[at(i + CORN[c][0], j + CORN[c][1], k + CORN[c][2])]; if (val[c] < 0) inside++; }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz2 = 0, m = 0;
    for (const [a, b] of EDG) {
      if ((val[a] < 0) === (val[b] < 0)) continue;
      const t = val[a] / (val[a] - val[b]);
      sx += CORN[a][0] + (CORN[b][0] - CORN[a][0]) * t; sy += CORN[a][1] + (CORN[b][1] - CORN[a][1]) * t; sz2 += CORN[a][2] + (CORN[b][2] - CORN[a][2]) * t; m++;
    }
    cubeV[cv(i, j, k)] = pos.length / 3;
    pos.push(O.x + (i + sx / m) * cell, O.y + (j + sy / m) * cell, O.z + (k + sz2 / m) * cell);
  }
  // a quad of four points, turned to face out, split along whichever diagonal keeps both halves facing out (a quad folded across
  // a crease split the other way leaves a sliver facing in)
  const P = pos, facing = (a, b, c, out) => {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
    return (nx * out[0] + ny * out[1] + nz * out[2]) / l;
  };
  const index = [], quad = (a, b, c, d, out) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (facing(a, b, c, out) + facing(a, c, d, out) < 0) { const t = b; b = d; d = t; }          // wound the other way round
    const s1 = Math.min(facing(a, b, c, out), facing(a, c, d, out)), s2 = Math.min(facing(a, b, d, out), facing(b, c, d, out));
    if (s1 >= s2) index.push(a, b, c, a, c, d); else index.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const d0 = D[at(i, j, k)], in0 = d0 < 0;
    if (in0 !== (D[at(i + 1, j, k)] < 0)) quad(cubeV[cv(i, j - 1, k - 1)], cubeV[cv(i, j, k - 1)], cubeV[cv(i, j, k)], cubeV[cv(i, j - 1, k)], [in0 ? 1 : -1, 0, 0]);
    if (in0 !== (D[at(i, j + 1, k)] < 0)) quad(cubeV[cv(i - 1, j, k - 1)], cubeV[cv(i, j, k - 1)], cubeV[cv(i, j, k)], cubeV[cv(i - 1, j, k)], [0, in0 ? 1 : -1, 0]);
    if (in0 !== (D[at(i, j, k + 1)] < 0)) quad(cubeV[cv(i - 1, j - 1, k)], cubeV[cv(i, j - 1, k)], cubeV[cv(i, j, k)], cubeV[cv(i - 1, j, k)], [0, 0, in0 ? 1 : -1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // the paint's attributes: bends from the new surface, heights from the ground, face tones from the pieces' nearest points
  const n = pos.length / 3, NB = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < index.length; t += 3) { const a = index[t], b = index[t + 1], c = index[t + 2]; NB[a].add(b).add(c); NB[b].add(a).add(c); NB[c].add(a).add(b); }
  g.setAttribute('aCurv', new THREE.BufferAttribute(bendOf(pos, g.attributes.normal.array, NB.map(q => [...q])), 1));
  const hgt = new Float32Array(n), top = Math.max(0.5, box.max.y);
  for (let i = 0; i < n; i++) hgt[i] = Math.max(0, Math.min(1, pos[i * 3 + 1] / top));
  g.setAttribute('aHgt', new THREE.BufferAttribute(hgt, 1));
  const fb = 0.3, fk = (x, y, z) => (Math.floor(x / fb) * 73856093) ^ (Math.floor(y / fb) * 19349663) ^ (Math.floor(z / fb) * 83492791), fh = new Map();
  for (const pc of new Set(pieces.filter(q => q.F).map(q => q))) if (pc === pieces.find(q => q.W === pc.W)) for (let i = 0; i < pc.F.length; i++) { const key = fk(pc.W[i * 3], pc.W[i * 3 + 1], pc.W[i * 3 + 2]); let l = fh.get(key); if (!l) fh.set(key, l = []); l.push(pc.W[i * 3], pc.W[i * 3 + 1], pc.W[i * 3 + 2], pc.F[i]); }
  const facet = new Float32Array(n).fill(0.5);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; let best = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const l = fh.get(fk(x + dx * fb, y + dy * fb, z + dz * fb)); if (!l) continue;
      for (let q = 0; q < l.length; q += 4) { const d = (l[q] - x) ** 2 + (l[q + 1] - y) ** 2 + (l[q + 2] - z) ** 2; if (d < best) { best = d; facet[i] = l[q + 3]; } }
    }
  }
  g.setAttribute('aFacet', new THREE.BufferAttribute(facet, 1));
  g.computeBoundingSphere();
  g.userData = { cell, cells: nx * ny * nz };
  return g;
}
// the squared distance from a point to a triangle (corners at offsets a, b, c in W); the nearest point is left in TQ
const TQ = [0, 0, 0];
function triDist2(W, a, b, c, px, py, pz) {
  const ax = W[a], ay = W[a + 1], az = W[a + 2];
  const abx = W[b] - ax, aby = W[b + 1] - ay, abz = W[b + 2] - az, acx = W[c] - ax, acy = W[c + 1] - ay, acz = W[c + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let qx, qy, qz;
  if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
  else {
    const bpx = px - W[b], bpy = py - W[b + 1], bpz = pz - W[b + 2];
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { qx = W[b]; qy = W[b + 1]; qz = W[b + 2]; }
    else {
      const cpx = px - W[c], cpy = py - W[c + 1], cpz = pz - W[c + 2];
      const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
      const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
      if (d6 >= 0 && d5 <= d6) { qx = W[c]; qy = W[c + 1]; qz = W[c + 2]; }
      else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v; }
      else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w; }
      else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); qx = W[b] + (W[c] - W[b]) * w; qy = W[b + 1] + (W[c + 1] - W[b + 1]) * w; qz = W[b + 2] + (W[c + 2] - W[b + 2]) * w; }
      else { const dn = 1 / (va + vb + vc), v = vb * dn, w = vc * dn; qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w; }
    }
  }
  TQ[0] = qx; TQ[1] = qy; TQ[2] = qz;
  return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
}
