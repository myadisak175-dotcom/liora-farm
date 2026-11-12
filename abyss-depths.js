/* ==========================================================================
   abyss-depths.js  —  three places down in the abyss, reached by warp stones (no path joins them to the rim)

     1  the shelf    a grassy shelf on the pit's wall above a sea of cloud: a tarn, a stream that runs off the brink
     2  the gorge    a winding gorge in the mist: tall thin falls in side chambers, pools, a stream, rock pillars
     3  the meadow   a broad meadow under floating rocks: a pond with lilies, paths, a window in the wall onto the clouds

   Each is a scene of its own (depths-level.js builds one layer into a level; the valley holds only the warp stone on the
   rim): a phone cannot hold the valley and what lies under it at once.

   This file knows where things are and how the land lies (pure height maths on a 0.5 m grid), and builds the few meshes
   that are the depths' own: the land of each layer, the cloud sea, floating rocks, shafts of light, the warp stones.

     const D = createDepths({ WL, seed });
     D.layers[k]            { key, name, box: [x0, x1, z0, z1], warp: [x, z], yaw, haze, trees, bushes, rocks, flowers, pads,
                              falls, ribbons, spheres, islands, clouds, shafts, mist }
     D.layerAt(x, z)        which layer this spot is in (-1: none)        D.covers(x, z)
     D.heightAt(x, z)       the land there        D.wetAt(x, z)  true where there may be water (ponds, streams)
     D.walkable(x, z)       she may stand there   D.paint(x, z)  [earth, sand, mow] for the ground picture
     layerGeometry(L)       the land of a layer, for the valley's terrain material (aBank, aPath)
     cloudPuffs(items, material)      a field of cloud puffs: items [x, z, y, size]
     createCloudSea({ x, z, y, radius, ... })   a flat sea of mist       createShafts(list)   shafts of light
     floatingRock({ r, depth, seed })           a rock that hangs in the air: flat grassy top, ragged underside
     createWarpStone()      { group, update(t) }
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';
import { kit, BUILD_COLORS } from './stylized-buildings.js';
import { propMaterial } from './stylized-props.js';

const { fbm3, shared } = _internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const STEP = 0.5;
const n1 = (t, f, s) => fbm3(t * f, s * 1.37, 0.5, s, 2);                 // noise along a line, 0..1
const n2 = (x, z, f, s) => fbm3(x * f, s * 1.31, z * f, s, 2);            // noise over the ground, 0..1
const rngOf = s => { let a = s * 2654435761 % 2147483647 | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
// distance to a polyline, and how far along it the nearest point is
const lineDist = (pts, x, z) => {
  let best = 1e9, along = 0, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az, len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (len * len))), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; along = acc + t * len; }
    acc += len;
  }
  return { d: best, s: along };
};
const smooth = (pts, step = 1.2) => {                                      // Catmull-Rom through the points
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};
// a wall that goes up in steps: o metres into the rock from its foot -> how high it stands there
const wallUp = (o, total, rag = 0) => o <= 0 ? 0 : total * (0.26 * ss(0, 2.6, o) + 0.3 * ss(4.2, 7.6, o + rag) + 0.44 * ss(9.5, 15.5, o + rag * 1.6));
// a pond dug into the land h: e = 1 at its shore; the banks slope down to the water, the bed lies `deep` below it
const dig = (h, e, WL, deep = 0.95) => {
  h = lerp(h, WL + 0.28, ss(2.6, 1.25, e) * 0.92);
  return lerp(h, WL - deep, ss(1.12, 0.5, e));
};
// a pillar of rock standing up out of the land
const stand = (h, x, z, p, s) => {
  const d = Math.hypot(x - p.x, z - p.z) + (n2(x, z, 0.35, s) - 0.5) * 1.3;
  if (d > p.r + 2) return h;
  return Math.max(h, lerp(h, p.top - 0.1 * d * d / p.r + (n2(x, z, 0.5, s + 3) - 0.5) * 0.7, ss(p.r + 1.1, p.r - 0.5, d)));
};

// ------------------------------------------------------------------ 1: the shelf above the cloud sea
const SHELF = {
  box: [78, 141, -102, 36],
  tarn: { x: 98.5, z: -58, a: 10, b: 6.4 },
  stacks: [{ x: 135.5, z: -78, r: 3.4, top: 5.5 }, { x: 137.5, z: -3, r: 4.2, top: 8 }, { x: 131, z: 22, r: 2.6, top: 3.5 }],
  paths: [smooth([[105, 15], [102, -4], [108, -20], [121, -29], [110, -38], [108, -48]]), smooth([[100, -67], [100, -78], [103, -88]])],
};
const shelfFoot = z => 89 + (n1(z, 0.06, 11) - 0.5) * 6;
const shelfBrink = z => 113 + 7 * Math.sin(z * 0.05 + 0.8) + (n1(z, 0.11, 13) - 0.5) * 7 + 14 * Math.exp(-(((z + 30) / 10) ** 2));
const shelfStream = x => -58 + 1.6 * Math.sin((x - 108) * 0.32);
function shelfLand(x, z, WL) {
  const S = SHELF, end = Math.max(ss(-84, -97, z), ss(19, 31, z)), brink = shelfBrink(z);
  const foot = lerp(shelfFoot(z), brink + 4, end);                         // at its ends the wall swings round to the brink
  let h = 1.7 + (fbm3(x * 0.05, 3.3, z * 0.05, 17, 3) - 0.5) * 2.8 + 4.4 * ss(foot + 15, foot + 1, x);
  // the tarn, and the stream that runs from it to the brink
  const T = S.tarn, e = Math.hypot((x - T.x) / T.a, (z - T.z) / T.b) + (n2(x, z, 0.2, 23) - 0.5) * 0.3;
  h = dig(h, e, WL);
  if (x > T.x + 4) {
    const d = Math.abs(z - shelfStream(x)) + (n2(x, z, 0.4, 29) - 0.5) * 0.5;
    h = lerp(h, WL + 0.3, ss(5.5, 2.4, d) * 0.9);
    h = lerp(h, WL - 0.42, ss(2.1, 0.9, d));
  }
  h += wallUp(foot - x, 86, (n2(x, z, 0.13, 31) - 0.5) * 5);
  // the brink: a lip, then straight down into the clouds
  const de = x - brink + (n2(x, z, 0.3, 19) - 0.5) * 1.3;
  if (de > -1.4) h = lerp(h + 0.22 * ss(-1.4, -0.4, de) * (1 - ss(3.2, 1.2, Math.abs(z - shelfStream(x)))), -48 + (n2(x, z, 0.1, 37) - 0.5) * 6, ss(-0.2, 2.3, de));
  for (let i = 0; i < S.stacks.length; i++) h = stand(h, x, z, S.stacks[i], 41 + i * 5);
  return h;
}

// ------------------------------------------------------------------ 2: the gorge in the mist
const GORGE = {
  box: [78, 141, 40, 178],
  line: smooth([[110, 172], [105, 152], [117, 130], [101, 106], [115, 84], [108, 61]], 1.5),
  chambers: [{ x: 126.5, z: 151, r: 8.5, fall: [1, 0] }, { x: 89.5, z: 119, r: 9.5, fall: [-1, 0] }, { x: 128.5, z: 95, r: 8.5, fall: [1, 0] }, { x: 108, z: 55.5, r: 11, fall: [0, -1] }],
  pillars: [{ x: 112.5, z: 160, r: 1.7, top: 9 }, { x: 104, z: 141, r: 2.2, top: 13 }, { x: 119.5, z: 121, r: 1.6, top: 7 }, { x: 106, z: 117, r: 2.0, top: 16 },
    { x: 97, z: 98, r: 1.5, top: 6 }, { x: 118, z: 90, r: 2.3, top: 12 }, { x: 103.5, z: 71, r: 1.8, top: 10 }, { x: 114.5, z: 66, r: 1.4, top: 5.5 }],
};
for (const c of GORGE.chambers) {                                         // each chamber: its pool lies against the back wall, a run joins it to the stream
  let best = null, bd = 1e9;
  for (const p of GORGE.line) { const d = Math.hypot(p[0] - c.x, p[1] - c.z); if (d < bd) { bd = d; best = p; } }
  c.run = [[c.x, c.z], best];
  c.pool = { x: c.x + c.fall[0] * c.r * 0.38, z: c.z + c.fall[1] * c.r * 0.38, a: c.r * 0.55, b: c.r * 0.55 };
}
const gorgeOpen = (x, z) => {                                              // metres into the rock (negative: on the gorge's floor)
  const q = lineDist(GORGE.line, x, z), rag = (n2(x, z, 0.16, 53) - 0.5) * 3.4;
  let o = q.d - (7.6 + 2.4 * Math.sin(q.s * 0.09)) + rag;
  for (const c of GORGE.chambers) o = Math.min(o, Math.hypot(x - c.x, z - c.z) - c.r + rag * 0.6, lineDist(c.run, x, z).d - 4.2 + rag * 0.5);
  return { o, q };
};
function gorgeLand(x, z, WL) {
  const { o, q } = gorgeOpen(x, z);
  let h = 0.75 + (fbm3(x * 0.09, 6.1, z * 0.09, 59, 2) - 0.5) * 1.3 + 2.4 * ss(-4.5, 0, o);
  // the stream down the middle, the pools in the chambers and the runs that join them
  let d = q.d;
  for (const c of GORGE.chambers) d = Math.min(d, lineDist(c.run, x, z).d);
  d += (n2(x, z, 0.4, 61) - 0.5) * 0.6;
  h = lerp(h, WL + 0.26, ss(5.2, 2.3, d) * 0.9);
  h = lerp(h, WL - 0.4, ss(2.0, 0.9, d));
  for (const c of GORGE.chambers) h = dig(h, Math.hypot(x - c.pool.x, z - c.pool.z) / c.pool.a + (n2(x, z, 0.25, 67) - 0.5) * 0.25, WL, 1.05);
  h += wallUp(o, 92, (n2(x, z, 0.12, 71) - 0.5) * 5);
  if (o < 0) for (let i = 0; i < GORGE.pillars.length; i++) h = stand(h, x, z, GORGE.pillars[i], 73 + i * 3);
  return h;
}

// ------------------------------------------------------------------ 3: the meadow under the floating rocks
const MEADOW = {
  box: [-141, -78, -40, 150],
  ponds: [{ x: -111, z: 96, a: 12.5, b: 8.5 }, { x: -99, z: 17, a: 5.5, b: 4.6 }],
  window: [44, 82],                                                        // along the west wall: open onto the clouds between these z
  pillars: [{ x: -93, z: -8, r: 3.2, top: 19 }, { x: -122, z: 6, r: 2.4, top: 11 }, { x: -91.5, z: 47, r: 4.0, top: 28 }, { x: -121.5, z: 122, r: 3.0, top: 15 }, { x: -95, z: 128, r: 2.2, top: 9 }],
  paths: [smooth([[-108, -26], [-105, -6], [-110, 14], [-112, 34], [-119, 52], [-127.5, 62]]), smooth([[-112, 34], [-104, 52], [-101, 72], [-106, 84]])],
  hill: { x: -98, z: 62, r: 15, h: 4.2 },
};
const meadowOpen = (x, z) => {
  const [x0, x1, z0, z1] = MEADOW.box, rag = (n2(x, z, 0.07, 83) - 0.5) * 9 + (n2(x, z, 0.21, 89) - 0.5) * 2.5;
  const west = x - x0, o = 9.5 + rag - Math.min(west, x1 - x, z - z0, z1 - z);
  const win = ss(MEADOW.window[0], MEADOW.window[0] + 6, z) * ss(MEADOW.window[1], MEADOW.window[1] - 6, z);
  return { o, win, west, rag };
};
function meadowLand(x, z, WL) {
  const M = MEADOW, { o, win, west, rag } = meadowOpen(x, z);
  let h = 1.7 + (fbm3(x * 0.03, 7.7, z * 0.03, 91, 3) - 0.5) * 4.6 + (n2(x, z, 0.11, 93) - 0.5) * 0.8;
  h += M.hill.h * ss(M.hill.r, M.hill.r * 0.25, Math.hypot(x - M.hill.x, z - M.hill.z));
  h = Math.max(h, 0.55);
  for (let i = 0; i < M.ponds.length; i++) { const p = M.ponds[i]; h = dig(h, Math.hypot((x - p.x) / p.a, (z - p.z) / p.b) + (n2(x, z, 0.18, 97 + i) - 0.5) * 0.3, WL, i ? 0.7 : 1.1); }
  // the walls; in the window the west wall is gone and the meadow ends at a brink over the clouds
  const westWall = west < 20 ? win : 0;
  h += wallUp(o, 78, (n2(x, z, 0.12, 101) - 0.5) * 5) * (1 - westWall);
  if (westWall > 0) { const de = 9.5 + rag * 0.35 - west; h = lerp(h, lerp(h + 0.2 * ss(-1.4, -0.4, de), -46, ss(-0.2, 2.3, de)), westWall); }
  if (o < 0) for (let i = 0; i < M.pillars.length; i++) h = stand(h, x, z, M.pillars[i], 103 + i * 3);
  return h;
}

const DEFS = [
  { key: 'shelf', name: 'หิ้งหญ้าริมทะเลเมฆ', box: SHELF.box, land: shelfLand, top: 9.5, warp: [105, 17], yaw: Math.PI, haze: { near: 34, far: 210, max: 0.56 }, paths: SHELF.paths },
  { key: 'gorge', name: 'หุบน้ำตกในหมอก', box: GORGE.box, land: gorgeLand, top: 4.6, warp: [111.5, 168.5], yaw: Math.PI, haze: { near: 9, far: 82, max: 0.74 }, paths: [] },
  { key: 'meadow', name: 'ทุ่งใต้เสาหินลอย', box: MEADOW.box, land: meadowLand, top: 9.5, warp: [-108, -28], yaw: 0, haze: { near: 38, far: 220, max: 0.5 }, paths: MEADOW.paths },
];

export const DEPTH_NAMES = DEFS.map(d => ({ key: d.key, name: d.name }));      // the layers, from the top down
// only: the key of the one layer wanted ('shelf' | 'gorge' | 'meadow'); left out, all three are worked out
export function createDepths({ WL = 0, seed = 3, only = null } = {}) {
  const layers = DEFS.map((def, k) => {
    if (only && def.key !== only) return null;
    const [x0, x1, z0, z1] = def.box, nx = Math.round((x1 - x0) / STEP) + 1, nz = Math.round((z1 - z0) / STEP) + 1;
    const h = new Float32Array(nx * nz), path = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * STEP, z = z0 + j * STEP;
      h[j * nx + i] = def.land(x, z, WL);
      for (const pl of def.paths) path[j * nx + i] = Math.max(path[j * nx + i], ss(1.7, 0.7, lineDist(pl, x, z).d + (n2(x, z, 0.5, 7) - 0.5) * 0.7));
    }
    const at = (arr, x, z) => {
      const fx = Math.min(nx - 1.001, Math.max(0, (x - x0) / STEP)), fz = Math.min(nz - 1.001, Math.max(0, (z - z0) / STEP));
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * nx + i;
      return (arr[o] * (1 - u) + arr[o + 1] * u) * (1 - v) + (arr[o + nx] * (1 - u) + arr[o + nx + 1] * u) * v;
    };
    return { ...def, k, nx, nz, h, pathW: path, heightAt: (x, z) => at(h, x, z), pathAt: (x, z) => at(path, x, z) };
  });
  const layerAt = (x, z) => { for (const L of layers) if (L && x >= L.box[0] && x <= L.box[1] && z >= L.box[2] && z <= L.box[3]) return L.k; return -1; };
  const covers = (x, z) => layerAt(x, z) >= 0;
  const heightAt = (x, z) => { const k = layerAt(x, z); return k < 0 ? 0 : layers[k].heightAt(x, z); };
  const grade = (L, x, z) => { const e = 0.5, hx = (L.heightAt(x + e, z) - L.heightAt(x - e, z)) / (2 * e), hz = (L.heightAt(x, z + e) - L.heightAt(x, z - e)) / (2 * e); return Math.hypot(hx, hz); };
  // where there may be water: the ponds and the streams (the brink and the wall feet are far below the water's level too,
  // but dry)
  const wetAt = (x, z) => {
    const k = layerAt(x, z);
    if (k === 0) { const T = SHELF.tarn; return Math.hypot((x - T.x) / T.a, (z - T.z) / T.b) < 1.5 || (x > T.x && x < shelfBrink(z) + 0.6 && Math.abs(z - shelfStream(x)) < 3.2); }
    if (k === 1) { const { o, q } = gorgeOpen(x, z); if (o > 0.5) return false; if (q.d < 3.4) return true; return GORGE.chambers.some(c => Math.hypot(x - c.pool.x, z - c.pool.z) < c.pool.a * 1.5 || lineDist(c.run, x, z).d < 3.4); }
    if (k === 2) return MEADOW.ponds.some(p => Math.hypot((x - p.x) / p.a, (z - p.z) / p.b) < 1.5);
    return false;
  };
  const walkable = (x, z) => {
    const k = layerAt(x, z);
    if (k < 0) return false;
    const L = layers[k], y = L.heightAt(x, z);
    if (y > L.top || y < WL - 1.6) return false;
    if (y < WL - 0.02 && !wetAt(x, z)) return false;
    return grade(L, x, z) < 0.85;
  };
  // the ground picture: bare rock where it is steep or wall, sand at the water's edge, trodden earth along the paths, the
  // gorge's floor short and mossy
  const paint = (x, z) => {
    const k = layerAt(x, z);
    if (k < 0) return null;
    const L = layers[k], y = L.heightAt(x, z), g = grade(L, x, z);
    let earth = Math.max(ss(0.75, 1.15, g), ss(L.top - 0.6, L.top + 0.4, y), ss(WL - 1.7, WL - 2.6, y));
    const wet = wetAt(x, z), sand = wet ? ss(WL + 0.55, WL + 0.22, y + (n2(x, z, 0.6, 5) - 0.5) * 0.2) : 0;
    const p = L.pathAt(x, z);
    earth = Math.max(earth, p * 0.92);
    return [earth, sand, Math.max(k === 1 ? 0.75 : 0, ss(0.05, 0.6, p) * 0.8)];
  };

  // ---- what grows and lies about (thrown with dice of its own)
  const rng = rngOf(seed * 7919 + 13), R = (a, b) => a + rng() * (b - a);
  const scatter = (L, n, min, ok, out, make) => {
    const [x0, x1, z0, z1] = L.box;
    for (let i = 0, tries = 0; i < n && tries < n * 60; tries++) {
      const x = R(x0 + 3, x1 - 3), z = R(z0 + 3, z1 - 3);
      if (!walkable(x, z) || wetAt(x, z) || L.pathAt(x, z) > 0.05 || L.heightAt(x, z) < WL + 0.32 || !ok(x, z)) continue;
      if (Math.hypot(x - L.warp[0], z - L.warp[1]) < 5) continue;
      if (out.some(p => Math.hypot(p.x - x, p.z - z) < min + (p.r || 0))) continue;
      out.push(make(x, z)); i++;
    }
  };
  const any = () => true;
  if (layers[0]) {                                                         // the shelf: a few wind-bent trees, boulders under the wall
    const L = layers[0], all = [];
    L.trees = []; L.bushes = []; L.rocks = []; L.flowers = [];
    scatter(L, 9, 7, (x, z) => x - shelfFoot(z) > 5 && shelfBrink(z) - x > 4, all, (x, z) => { const t = { type: rng() < 0.45 ? 'birch' : rng() < 0.6 ? 'pine' : 'sapling', x, z, scale: R(0.8, 1.15), r: 2 }; L.trees.push(t); return t; });
    scatter(L, 16, 3, any, all, (x, z) => { const b = { x, z, scale: R(0.7, 1.2), r: 1 }; L.bushes.push(b); return b; });
    scatter(L, 13, 4, (x, z) => x - shelfFoot(z) < 9 || rng() < 0.3, all, (x, z) => { const r = { type: rng() < 0.5 ? 'boulder' : rng() < 0.6 ? 'crag' : 'stones', x, z, scale: R(0.8, 1.7), r: 1.5 }; L.rocks.push(r); return r; });
    scatter(L, 12, 5, any, all, (x, z) => { const f = { x, z, rad: R(1.6, 3.2), r: 1 }; L.flowers.push(f); return f; });
    for (const s of SHELF.stacks.slice(0, 2)) L.trees.push({ type: 'pine', x: s.x + 0.3, z: s.z - 0.2, scale: 0.8, r: 2, loose: true });      // one on each of the far stacks
  }
  if (layers[1]) {                                                         // the gorge: mossy boulders everywhere, ferny bushes, a few saplings
    const L = layers[1], all = [];
    L.trees = []; L.bushes = []; L.rocks = []; L.flowers = [];
    scatter(L, 30, 2.6, any, all, (x, z) => { const r = { type: rng() < 0.55 ? 'boulder' : rng() < 0.5 ? 'stones' : rng() < 0.6 ? 'crag' : 'standing', x, z, scale: R(0.7, 1.9), r: 1.4 }; L.rocks.push(r); return r; });
    scatter(L, 22, 2.4, any, all, (x, z) => { const b = { x, z, scale: R(0.6, 1.1), r: 0.9 }; L.bushes.push(b); return b; });
    scatter(L, 6, 6, any, all, (x, z) => { const t = { type: 'sapling', x, z, scale: R(0.8, 1.1), r: 1.5 }; L.trees.push(t); return t; });
    scatter(L, 6, 5, any, all, (x, z) => { const f = { x, z, rad: R(1.2, 2.2), r: 1 }; L.flowers.push(f); return f; });
  }
  if (layers[2]) {                                                         // the meadow: broad trees in ones and twos, drifts of flowers, big stones
    const L = layers[2], all = [];
    L.trees = []; L.bushes = []; L.rocks = []; L.flowers = [];
    scatter(L, 13, 9, any, all, (x, z) => { const t = { type: rng() < 0.5 ? 'broadleaf' : rng() < 0.6 ? 'birch' : 'oak', x, z, scale: R(0.85, 1.25), r: 2.5 }; L.trees.push(t); return t; });
    scatter(L, 20, 3.5, any, all, (x, z) => { const b = { x, z, scale: R(0.7, 1.3), r: 1 }; L.bushes.push(b); return b; });
    scatter(L, 15, 5, any, all, (x, z) => { const r = { type: rng() < 0.4 ? 'boulder' : rng() < 0.5 ? 'slab' : rng() < 0.6 ? 'standing' : 'stones', x, z, scale: R(0.9, 2.1), r: 1.6 }; L.rocks.push(r); return r; });
    scatter(L, 30, 4.5, any, all, (x, z) => { const f = { x, z, rad: R(1.8, 3.6), r: 1 }; L.flowers.push(f); return f; });
  }

  // ---- water: the ribbons the clear water is drawn on (rows of [x, z, level, half width]), the falls, lily pads
  const rowsAlong = (pts, half) => pts.map(p => [p[0], p[1], WL, half]);
  const disc = (p, pad = 1.6) => { const rows = []; for (let z = p.z - p.b - pad; z <= p.z + p.b + pad + 0.01; z += 1.0) rows.push([p.x, z, WL, p.a + pad]); return rows; };
  if (layers[0]) {
    const L = layers[0], T = SHELF.tarn, run = [];
    for (let x = T.x + 4; x <= shelfBrink(-58) + 1.2; x += 1.0) run.push([x, shelfStream(x)]);
    const lip = run[run.length - 1];
    L.ribbons = [{ rows: disc(T), along: 'z' }, { rows: rowsAlong(run, 3.2), along: 'line' }];
    const foot = shelfFoot(T.z);
    L.falls = [{ x: foot - 2.5, z: T.z, yaw: Math.PI / 2, top: 22.6, bottom: WL, width: 3.0, forward: 3.6 },             // off the wall's first ledge into the tarn
      { x: foot - 8.4, z: T.z, yaw: Math.PI / 2, top: 48.5, bottom: 22.6, width: 2.4, forward: 4.8, scale: 0.5 },         // and down onto that ledge from the one above
      { x: lip[0] - 0.9, z: lip[1], yaw: Math.PI / 2, top: WL, bottom: -30, width: 2.6, forward: 1.6, quiet: true }];       // off the brink into the clouds
    L.spheres = [[T.x, T.z, 13], [T.x + 12, T.z, 9]];
    L.pads = [];
  }
  if (layers[1]) {
    const L = layers[1];
    L.ribbons = [{ rows: rowsAlong(GORGE.line, 3.2), along: 'line' }];
    L.falls = []; L.spheres = [];
    for (const c of GORGE.chambers) {
      L.ribbons.push({ rows: disc(c.pool), along: 'z' }, { rows: rowsAlong(smooth(c.run, 1.2), 3.2), along: 'line' });
      const yaw = Math.atan2(-c.fall[0], -c.fall[1]), w = 2.3 + rng() * 0.9, at = d => [c.x + c.fall[0] * (c.r + d), c.z + c.fall[1] * (c.r + d)];
      L.falls.push({ x: at(2.5)[0], z: at(2.5)[1], yaw, top: 24.4, bottom: WL, width: w, forward: 3.5 },                    // off the wall's first ledge into the pool
        { x: at(8.6)[0], z: at(8.6)[1], yaw, top: 52, bottom: 24.4, width: w * 0.8, forward: 4.9, scale: 0.5 });            // and down onto it from high above
      L.spheres.push([c.pool.x, c.pool.z, c.r + 2]);
    }
    for (let i = 0; i < GORGE.line.length; i += 14) L.spheres.push([GORGE.line[i][0], GORGE.line[i][1], 9]);
    L.pads = [];
  }
  if (layers[2]) {
    const L = layers[2], P = MEADOW.ponds;
    L.ribbons = P.map(p => ({ rows: disc(p), along: 'z' }));
    L.falls = [{ x: P[0].x + 2.5, z: P[0].z - 2.5, yaw: 0.4, top: 30, bottom: WL, width: 1.9, forward: 1.5 }];                // from the floating rock over the pond
    L.spheres = P.map(p => [p.x, p.z, p.a + 4]);
    L.pads = [];
    for (let i = 0; i < 46; i++) {
      const p = P[rng() < 0.82 ? 0 : 1], a = R(0, 6.28), q = Math.sqrt(rng()) * 0.86, x = p.x + Math.cos(a) * p.a * q, z = p.z + Math.sin(a) * p.b * q, r = R(0.26, 0.46);
      if (heightAtRaw(2, x, z) > WL - 0.25 || Math.hypot(x - L.falls[0].x, z - L.falls[0].z) < 4 || L.pads.some(o => Math.hypot(o[0] - x, o[1] - z) < o[2] + r + 0.12)) continue;
      L.pads.push([x, z, r, rng() < 0.16, WL]);
    }
  }
  function heightAtRaw(k, x, z) { return layers[k].heightAt(x, z); }

  // ---- the depths' own sights
  // floating rocks over the meadow (one pours into the pond), and rocks that stand in the cloud sea off the shelf
  if (layers[0]) layers[0].islands = [{ x: 164, z: -52, y: 16, r: 9, depth: 22, seed: 3, tree: 'pine' }, { x: 176, z: 6, y: 30, r: 13, depth: 30, seed: 5 }, { x: 158, z: -108, y: 42, r: 7, depth: 16, seed: 9 }];
  if (layers[1]) layers[1].islands = [];
  if (layers[2]) layers[2].islands = [{ x: MEADOW.ponds[0].x + 3, z: MEADOW.ponds[0].z - 6.5, y: 31, r: 7.5, depth: 15, seed: 11, tree: 'birch' }, { x: -100, z: 34, y: 44, r: 11, depth: 24, seed: 13, tree: 'broadleaf' },
    { x: -124, z: -12, y: 36, r: 6, depth: 13, seed: 17 }, { x: -158, z: 70, y: 22, r: 12, depth: 28, seed: 19, tree: 'pine' }, { x: -172, z: 28, y: 52, r: 8, depth: 18, seed: 23 }, { x: -92, z: 104, y: 58, r: 6.5, depth: 15, seed: 29 }];
  // cloud: a sea below the shelf's brink and outside the meadow's window, banks of mist on the gorge's floor
  const puffs = (n, fn) => { const out = []; for (let i = 0; i < n; i++) { const p = fn(i); if (p) out.push(p); } return out; };
  if (layers[0]) layers[0].sea = { x: 205, z: -33, y: -6.5, radius: 190 };
  if (layers[0]) layers[0].clouds = puffs(230, () => { const z = R(-150, 86), x = shelfBrink(Math.max(-100, Math.min(34, z))) + 4 + Math.pow(rng(), 1.7) * 150; if (SHELF.stacks.some(s => Math.hypot(x - s.x, z - s.z) < s.r + 3)) return null; return [x, z, R(-6.5, -3.4), R(5, 9) + (x - 110) * 0.05]; })
    .concat(puffs(26, () => [R(80, 138), R(-100, 34), R(46, 70), R(7, 13)]));          // and wisps high on the wall
  if (layers[1]) layers[1].sea = { x: 109.5, z: 109, y: 47, radius: 80, veil: 0.6 };                  // a lid of mist over the gorge
  if (layers[1]) layers[1].clouds = puffs(34, () => { const c = GORGE.chambers[Math.floor(rng() * 4)].pool, near = rng() < 0.6; const x = near ? c.x + R(-1, 1) * c.a * 1.3 : R(84, 136), z = near ? c.z + R(-1, 1) * c.a * 1.3 : R(46, 172); if (gorgeOpen(x, z).o > -0.5) return null; return [x, z, R(0.3, 1.1), R(1.1, 2.1)]; })
    .concat(puffs(40, () => [R(84, 136), R(46, 172), R(30, 46), R(7, 12)]));
  if (layers[2]) layers[2].sea = { x: -230, z: 60, y: -6.5, radius: 150 };
  if (layers[2]) layers[2].clouds = puffs(110, () => { const z = R(-30, 150), x = -146 - Math.pow(rng(), 1.5) * 120; return [x, z, R(-6.5, -3.2), R(6, 11)]; })
    .concat(puffs(34, () => [R(-140, -80), R(-36, 146), R(52, 74), R(8, 14)]));
  // shafts of light: [x, z of the foot, yaw, length, width]
  if (layers[0]) layers[0].shafts = [];
  if (layers[1]) layers[1].shafts = [[110, 150, 0.5, 46, 5], [103, 121, 0.9, 52, 6.5], [116, 97, 0.3, 48, 5], [108, 66, 0.7, 50, 7]];
  if (layers[2]) layers[2].shafts = [[-118, 60, -1.2, 70, 10], [-104, 92, -0.9, 64, 8]];

  return { layers, layerAt, covers, heightAt, wetAt, walkable, paint, WL };
}

// ------------------------------------------------------------------ meshes
// the land of one layer: positions on its grid, with what the valley's terrain material asks for
export function layerGeometry(L, D) {
  const { nx, nz, h } = L, [x0, , z0] = L.box, WL = D.WL;
  const pos = new Float32Array(nx * nz * 3), bank = new Float32Array(nx * nz), path = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const o = j * nx + i, x = x0 + i * STEP, z = z0 + j * STEP;
    pos[o * 3] = x; pos[o * 3 + 1] = h[o]; pos[o * 3 + 2] = z;
    bank[o] = D.wetAt(x, z) ? h[o] - WL : 5;                                // sand only round the water
    path[o] = L.pathW[o];
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + nx; idx[k++] = a; idx[k++] = b; idx[k++] = a + 1; idx[k++] = b; idx[k++] = b + 1; idx[k++] = a + 1; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBank', new THREE.BufferAttribute(bank, 1));
  g.setAttribute('aPath', new THREE.BufferAttribute(path, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// a rock that hangs in the air: a flat top (grass, by the terrain material) and a ragged underside that tapers away
export function floatingRock({ r = 8, depth = 18, seed = 1 } = {}) {
  const SEG = 22, RINGS = 8, pos = [], idx = [];
  const out = a => 0.7 + 0.55 * fbm3(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3, seed * 0.7, seed, 2);
  // it hangs in two or three roots, not one point: the underside is deeper under some bearings than others
  const root = a => 0.45 + 0.75 * Math.pow(fbm3(Math.cos(a) * 1.9 + seed * 2, Math.sin(a) * 1.9, seed, seed + 9, 2), 1.4);
  pos.push(0, 0.5, 0);                                                     // the top's middle (a little domed)
  for (let k = 0; k <= RINGS; k++) {
    const t = k / RINGS, rr = k === 0 ? 0.86 : k === 1 ? 1.06 : (1 - 0.82 * Math.pow(t, 1.6)) * (0.9 + 0.16 * Math.sin(t * 11 + seed));
    for (let i = 0; i < SEG; i++) {
      const a = i / SEG * Math.PI * 2, q = r * rr * out(a) * (k < 2 ? 1 : 0.82 + 0.36 * fbm3(a * 2 + seed, t * 4, seed, seed + 5, 2));
      const y = k === 0 ? 0.25 : k === 1 ? -0.5 : -depth * Math.pow(t, 1.15) * root(a) - 0.6;
      pos.push(Math.cos(a) * q, y, Math.sin(a) * q);
    }
  }
  for (let i = 0; i < SEG; i++) idx.push(0, 1 + (i + 1) % SEG, 1 + i);
  for (let k = 0; k < RINGS; k++) for (let i = 0; i < SEG; i++) { const a = 1 + k * SEG + i, b = 1 + k * SEG + (i + 1) % SEG; idx.push(a, b, a + SEG, b, b + SEG, a + SEG); }
  const tip = pos.length / 3; pos.push(0, -depth * 0.55, 0);
  for (let i = 0; i < SEG; i++) idx.push(tip, 1 + RINGS * SEG + i, 1 + RINGS * SEG + (i + 1) % SEG);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBank', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(5), 1));
  g.setAttribute('aPath', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a field of cloud puffs (the abyss's own puff material: they are placed round a centre and drift round it very slowly)
export function cloudPuffs(items, material, centre) {
  const n = items.length, quad = new THREE.PlaneGeometry(2, 2), geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  const A = new Float32Array(n * 4), B = new Float32Array(n * 4);
  let s = 12345;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  items.forEach(([x, z, y, size], i) => {
    const d = Math.hypot(x - centre[0], z - centre[1]);
    A.set([Math.atan2(z - centre[1], x - centre[0]), d, y, size], i * 4);
    B.set([(rnd() - 0.4) * 0.05 / Math.max(20, d), rnd(), Math.floor(rnd() * 97), 0], i * 4);
  });
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4));
  geo.instanceCount = n;
  const m = new THREE.Mesh(geo, material);
  material.uniforms.uCentre = { value: new THREE.Vector3(centre[0], 0, centre[1]) };
  m.frustumCulled = false; m.renderOrder = 6; m.name = 'depthsPuffs';
  m.userData.dispose = () => { geo.dispose(); quad.dispose(); material.dispose(); };
  return m;
}

// a flat sea of mist, painted in flat pale tones that drift; veil: thin, with gaps (a lid of mist seen from below)
export function createCloudSea({ x, z, y, radius, veil = 0, tint = '#dbe9f1', light = '#f6fbfd' }) {
  const g = new THREE.CircleGeometry(radius, 48);
  g.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uR: { value: radius }, uTint: { value: new THREE.Color(tint) }, uLight: { value: new THREE.Color(light) }, uVeil: { value: veil },
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec2 vP; varying vec2 vW; varying float vHaze;
      void main() {
        vP = position.xz; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xz;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uR, uVeil;
      uniform vec3 uTint, uLight, uHaze;
      varying vec2 vP; varying vec2 vW; varying float vHaze;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        float r = length(vP) / uR;
        vec2 q = vW + vec2(uTime * 0.35, uTime * 0.12);
        float n = noise(q * 0.045) * 0.55 + noise(q * 0.11 + 7.0) * 0.3 + noise(q * 0.31 - uTime * 0.03) * 0.15;
        float a = 1.0 - smoothstep(0.86, 1.0, r);
        if (uVeil > 0.0) a *= smoothstep(0.42, 0.5, n) * uVeil;             // a lid with gaps
        if (a < 0.01) discard;
        vec3 col = n > 0.62 ? uLight : (n > 0.44 ? mix(uTint, uLight, 0.5) : uTint);
        col = mix(col, uHaze, vHaze * 0.8);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.renderOrder = 5; m.name = 'depthsSea';
  m.userData.dispose = () => { g.dispose(); mat.dispose(); };
  return m;
}

// shafts of light slanting down through the mist: list of [x, z of the foot, yaw, length, width]
export function createShafts(list, { color = '#fff6d8', strength = 0.16, y0 = -0.5 } = {}) {
  const pos = [], uv = [], idx = [], tilt = 0.42;
  for (const [x, z, yaw, len, w] of list) {
    const dx = Math.sin(yaw), dz = Math.cos(yaw), ax = Math.cos(yaw), az = -Math.sin(yaw);       // the way it leans, and across
    const tx = x + dx * len * Math.sin(tilt), tz = z + dz * len * Math.sin(tilt), ty = y0 + len * Math.cos(tilt);
    for (const plane of [0, 1]) {                                          // two crossed sheets, so it has body from any side
      const px = plane ? dx * 0.6 + ax * 0.5 : ax, pz = plane ? dz * 0.6 + az * 0.5 : az, o = pos.length / 3;
      pos.push(x - px * w / 2, y0, z - pz * w / 2, x + px * w / 2, y0, z + pz * w / 2, tx + px * w * 0.32, ty, tz + pz * w * 0.32, tx - px * w * 0.32, ty, tz - pz * w * 0.32);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uCol: { value: new THREE.Color(color) }, uK: { value: strength } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: /* glsl */`
      uniform float uTime, uK; uniform vec3 uCol; varying vec2 vUv; varying vec3 vW;
      void main() {
        float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float a = smoothstep(0.0, 0.75, across) * smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        a *= 0.75 + 0.25 * sin(vW.x * 0.9 + vW.z * 0.7 + uTime * 0.35);     // dust drifting through it
        gl_FragColor = vec4(uCol * a * uK, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 7; m.name = 'depthsShafts'; m.frustumCulled = false;
  m.userData.dispose = () => { g.dispose(); mat.dispose(); };
  return m;
}

// a warp stone: a ring of standing stones on a round step, and a crystal that turns above it
export function createWarpStone() {
  const group = new THREE.Group(), K = kit(77), C = BUILD_COLORS;
  group.name = 'warpStone';
  K.cyl(0, -0.5, 0, 1.75, 1.9, 0.62, 14, C.stoneDark); K.cyl(0, 0.12, 0, 1.45, 1.55, 0.1, 14, C.stone);
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.2832 + 0.3; K.box(Math.cos(a) * 1.5, -0.3, Math.sin(a) * 1.5, 0.4, 1.1 + (i % 2) * 0.35, 0.3, i % 2 ? C.stone : C.stoneDark, { ry: -a + Math.PI / 2, rz: 0.06 * (i % 2 ? 1 : -1), vary: 0.04 }); }
  const base = new THREE.Mesh(K.done(), propMaterial());
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: '#9fe8ff' }));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const ringG = new THREE.RingGeometry(0.75, 1.2, 40); ringG.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: '#8fe6ff', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.position.y = 0.24; ring.renderOrder = 3;
  gem.scale.y = 1.5; core.scale.y = 1.5;
  group.add(base, gem, core, ring);
  group.userData.dispose = () => { base.geometry.dispose(); gem.geometry.dispose(); gem.material.dispose(); core.geometry.dispose(); core.material.dispose(); ringG.dispose(); ring.material.dispose(); };
  return {
    group,
    update(t) { gem.position.y = core.position.y = 1.25 + Math.sin(t * 1.3) * 0.1; gem.rotation.y = t * 0.9; core.rotation.y = -t * 1.4; ring.material.opacity = 0.32 + 0.2 * Math.sin(t * 2.1); ring.rotation.y = t * 0.2; },
  };
}
