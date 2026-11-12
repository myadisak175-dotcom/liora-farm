// valley-cliffs.js
// Carves the valley's cliff faces into blocks of rock, out of the land itself. The land's own mesh is too coarse on a cliff
// (half a metre between points, so a 10 m face is three or four points from foot to top and comes out as one stretched
// sheet), so each face gets a fine skin of its own: a sheet that follows the very same heights, joined to the land along
// the foot and the top edge, and painted with the land's own material. Between foot and top the skin stands out of the face
// block by block. Nothing is placed and nothing changes for walking: heightAt, paths and everything on the land stay as
// they are; only the picture of the face changes.
//
//   carveValleyRock(V, { z0, z1, keep, seed })     V from createValley; keep(x, z) -> 0..1 (0 = leave this spot smooth)
//                                                  adds the skin to V.group; returns how many columns of skin were made
//
// How a block is made: the face is cut into cells a few metres across (where the joints run up the cliff) and into the
// rock's layers (the strata the land is painted with, 2.6 m each). Every cell of every layer stands its own distance out of
// the face, so each layer has ledges and corners of its own and the joins read as cracks. The paint is told which layer
// each spot belongs to (aRock), on the land and on the skin alike, so the dark seams lie on the ledges and the two meet.
import * as THREE from 'three';

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
