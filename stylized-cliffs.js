/* ==========================================================================
   stylized-cliffs.js  —  modular cliff pieces for the meadow (flat-shaded, mossy tops)

   One job: build cliff geometry and say where each piece is solid. Placing them is meadow-level.js's business.

     CLIFF_TYPES                      'wall' | 'ledge' | 'corner' | 'spire'
     cliffFootprint(type, opts)       [[u, v, r], ...] circles in the piece's own space (u = along the face, v = out of it)
     createCliffSet(list)             list: [{ type, x, y, z, rotY, scale, seed, opts }, ...]  ->  ONE mesh, one draw call

   A piece stands with its face towards local +z, its feet buried about a metre, so it can be sunk into a slope.
   Material and light are the rock material of stylized-nature.js, so the cliffs match the stones and the haze.
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as N from './stylized-nature.js';

const { fbm3, mulberry32 } = N._internal;
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
