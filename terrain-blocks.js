// terrain-blocks.js  —  land in blocks: tables of land with cliff sides, put together like building blocks
//
// One job: a "block" is a piece of land that can be played on. It has an outline (one of a few shapes, turned and sized), and a
// top at some height. Blocks are put down overlapping: where they overlap they join into one table with a lobed outline; a block
// with a higher top standing on a lower one makes a step. Because a block IS land (it raises the level's height field), all that
// the land does works on it with nothing more: grass grows on it, she walks on it, things are placed on it.
// Its sides are cliffs: createTerrainBlocks(...).dress() stands the rock kit's big cliff pieces (rocks.js: bluffTall, bluffWide,
// bluffSplit for faces about 16 m high, bluffLow, bluffLowSplit for about 8 m) all the way round each block's outline, wherever
// the land really drops there (not where another block covers the outline, not where a ramp comes up). A piece is chosen and
// sized by the height of the drop where it stands, set with its head just under the block's edge (nothing of it stands above the
// land) and its foot in the ground below. The same few shapes of land and of rock are used again and again.
//
//   const blocks = createTerrainBlocks([{ shape: 'plateau', seed: 1, x, z, ry: 20, s: 1, top: 8 }, ...], { seed });
//   height = blocks.stamp(landHeight, x, z);          // in the level's height function
//   const rocks = blocks.dress(heightAt, { skip });   // -> [{ type, seed, x, y, z, ry, s }] for createRockKit

import * as N from './stylized-nature.js';
import { propRockGeometry } from './rocks.js';

const { fbm3, mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the shapes: half sizes along the block's own x and z (m), how square its corners are (2: an ellipse; more: squarer), how much
// its outline wanders
export const BLOCK_SHAPES = {
  plateau: { rx: 24, rz: 18, p: 2.8, wob: 0.2, name: 'ลานใหญ่' },
  spur: { rx: 22, rz: 9.5, p: 2.6, wob: 0.18, name: 'แหลมยาว' },
  knob: { rx: 10.5, rz: 9, p: 2.4, wob: 0.2, name: 'เนินเล็ก' },
};
const TALL = ['bluffTall', 'bluffWide', 'bluffSplit', 'bluffWide', 'bluffTall', 'bluffSplit'], LOW = ['bluffLow', 'bluffLowSplit', 'bluffLow'];

export function createTerrainBlocks(list, { seed = 1, face = 0.3 } = {}) {
  const blocks = list.map((b, i) => {
    const sh = BLOCK_SHAPES[b.shape] || BLOCK_SHAPES.plateau, a = (b.ry || 0) * Math.PI / 180;
    return { ...b, i, sh, s: b.s || 1, seed: b.seed || 1, ca: Math.cos(a), sa: Math.sin(a) };
  });
  // how far inside the block's outline a point is (m; > 0 inside)
  const inside = (b, x, z) => {
    const dx = (x - b.x) / b.s, dz = (z - b.z) / b.s, lx = (dx * b.ca - dz * b.sa) / b.sh.rx, lz = (dx * b.sa + dz * b.ca) / b.sh.rz;
    const r = Math.pow(Math.pow(Math.abs(lx), b.sh.p) + Math.pow(Math.abs(lz), b.sh.p), 1 / b.sh.p), a = Math.atan2(lz, lx), k = b.seed * 7.3 + b.sh.rx;
    // the outline wanders: broad bays and headlands, and a few sharper notches
    const R = 1 + b.sh.wob * ((fbm3(Math.cos(a) * 1.5 + k, Math.sin(a) * 1.5, 0.5, seed + b.seed, 3) - 0.5) * 2 - Math.abs(fbm3(Math.cos(a) * 2.6, Math.sin(a) * 2.6 + k, 3.3, seed + 9 + b.seed, 2) - 0.5) * 0.9);
    return (R - r) * Math.min(b.sh.rx, b.sh.rz) * b.s;
  };
  // the land with the blocks on it: each raises it to its top inside its outline (all but upright at the edge); the top rolls a
  // little, away from the edge
  const stamp = (h, x, z) => {
    for (const b of blocks) {
      const ext = Math.max(b.sh.rx, b.sh.rz) * b.s * 1.5;
      if (Math.abs(x - b.x) > ext || Math.abs(z - b.z) > ext) continue;
      const d = inside(b, x, z);
      if (d < -face) continue;
      const top = b.top + fbm3(x * 0.07, 2.9 + b.i, z * 0.07, seed + b.i, 2) * 0.7 * ss(4, 13, d);
      if (top > h) h += (top - h) * ss(-face, face, d);
    }
    return h;
  };
  // each block's outline as points about 0.4 m apart: [x, z, nx, nz (out of the block), how far along]
  const outlineOf = b => {
    const pts = [], N0 = 720, ext = Math.max(b.sh.rx, b.sh.rz) * b.s * 1.6;
    for (let k = 0; k < N0; k++) {
      const th = k / N0 * Math.PI * 2, cx = Math.cos(th), cz = Math.sin(th);
      let lo = 0, hi = ext;
      for (let q = 0; q < 22; q++) { const m = (lo + hi) / 2; if (inside(b, b.x + cx * m, b.z + cz * m) > 0) lo = m; else hi = m; }
      pts.push([b.x + cx * lo, b.z + cz * lo]);
    }
    let L = 0;
    return pts.map((p, k) => {
      const a = pts[(k + N0 - 2) % N0], c = pts[(k + 2) % N0], tx = c[0] - a[0], tz = c[1] - a[1], l = Math.hypot(tx, tz) || 1;
      let nx = tz / l, nz = -tx / l;
      if (nx * (p[0] - b.x) + nz * (p[1] - b.z) < 0) { nx = -nx; nz = -nz; }
      if (k) L += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]);
      return [p[0], p[1], nx, nz, L];
    });
  };
  // the rock kit's big pieces round every block, where the land drops. skip(x, z): nothing here (a waterfall, a gate).
  const dress = (H, { skip = null, overlap = 0.4, feet = 0.5 } = {}) => {
    const rng = mulberry32(seed * 733 + 5), R = (a, b) => a + rng() * (b - a), out = [], DEG = 180 / Math.PI;
    let turn = 0;
    for (const b of blocks) {
      const line = outlineOf(b), total = line[line.length - 1][4];
      const at = d => { let k = Math.min(line.length - 1, Math.floor(d / total * line.length)); while (k < line.length - 1 && line[k][4] < d) k++; while (k > 0 && line[k][4] > d) k--; return line[k]; };
      const drop = ([x, z, nx, nz]) => {                                    // how far the land drops outside the outline here (0: it does not)
        const back = H(x - nx * 1.6, z - nz * 1.6);
        if (Math.abs(back - b.top) > 1.2) return 0;                         // (another block lies over the outline here)
        if (H(x + nx * 1.3, z + nz * 1.3) > b.top - 2.2) return 0;         // (no drop right here: a ramp, a neighbour of the same height)
        return b.top - Math.min(H(x + nx * 3.5, z + nz * 3.5), H(x + nx * 5.5, z + nz * 5.5));
      };
      let d = R(0, 3);
      while (d < total - 1) {
        const p0 = at(d), fh0 = drop(p0);
        if (fh0 < 3.2 || (skip && skip(p0[0], p0[1]))) { d += 1.5; continue; }
        const tall = fh0 > 11.5, type = tall ? TALL[turn % TALL.length] : LOW[turn % LOW.length], sd = 1 + Math.floor(rng() * 3);
        turn++;
        const bb = propRockGeometry(type, sd).boundingBox, sink = R(0.7, 1.5);
        let s = Math.min(1.45, Math.max(0.5, (fh0 + sink) / bb.max.y));
        const w = (bb.max.x - bb.min.x) * s, p = at(Math.min(total - 0.01, d + w * 0.45)), fh = drop(p) || fh0;
        if (skip && skip(p[0], p[1])) { d += w * 0.5; continue; }
        s = Math.min(1.45, Math.max(0.5, (Math.max(fh, fh0) + sink) / bb.max.y));
        const out0 = R(0.5, 1.2), mid = (bb.max.x + bb.min.x) / 2 * s;       // its middle a little out past the edge, its back in the land
        out.push({ type, seed: sd, x: p[0] + p[2] * out0 - p[3] * mid, z: p[1] + p[3] * out0 + p[2] * mid, y: b.top - R(0.08, 0.3) - bb.max.y * s, ry: Math.atan2(p[2], p[3]) * DEG + R(-7, 7), s, block: b.i });
        d += w * (1 - overlap);
        if (rng() < feet) {                                                  // fallen rock at the foot, by the join to the next piece
          const q = at(Math.min(total - 0.01, d)), o = (bb.max.z * s) + R(0.8, 2.6), fx = q[0] + q[2] * o + R(-1.5, 1.5), fz = q[1] + q[3] * o + R(-1.5, 1.5), big = rng() < 0.45;
          if (H(fx, fz) < b.top - 3 && !(skip && skip(fx, fz))) out.push({ type: big ? 'footRock' : rng() < 0.5 ? 'cluster' : 'rubble', seed: 1 + Math.floor(rng() * 3), x: fx, z: fz, y: H(fx, fz) - (big ? R(0.3, 0.6) : 0.1), ry: R(0, 360), s: big ? R(0.9, 1.6) : R(0.9, 1.4), block: b.i });
        }
      }
    }
    return out;
  };
  return { blocks, inside, stamp, dress, outlineOf };
}
