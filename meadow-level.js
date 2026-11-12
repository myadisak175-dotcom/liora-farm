// meadow-level.js
// The one map of the game: a compact, hand-planned meadow (about 150 m across) ringed by forest.
//
//   home clearing (south)  : flat lawn for the future house + a soil plot for the future farm, under a big oak
//   stone-circle hill (NW) : the landmark you see from the spawn point and walk towards
//   pond + stream (E)      : stream comes down from the NE woods, widens into a pond, leaves to the SE
//   flower meadow (W), birch grove by the pond, deer glade across the stream (E)
//   faint trodden trails link home -> hill and home -> pond
//
//   const level = await buildMeadowLevel({ far: '#cde6f2', deer: glbArrayBuffer, onStep: async text => {} });
//   scene.add(level.group);
//   level.heightAt(x, z)  level.waterDepthAt(x, z)  level.colliders [[x, z, r]]  level.spawn { x, z, yaw }  level.radius
//   every frame: level.follow(playerPosition, cameraDirection)

import * as THREE from 'three';
import * as N from './stylized-nature.js';
import * as T from './stylized-terrain.js';
import * as A from './stylized-animals.js';
import * as G from './stylized-grassfield.js';
import * as Cliffs from './rocks.js';
import * as W from './stylized-water.js';
import { createAnimeCells } from './anime-cells.js';
import { createWaterDroplets } from './water-droplets.js';

const { fbm3, mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const MEADOW = {
  radius: 70,                    // how far the player can walk from the centre
  fieldRadius: 120,              // terrain extends past the forest so the map has no visible edge
  spawn: { x: 3, z: 37, yaw: Math.PI + 0.33 },      // looking north-north-west, at the hill
  home: { x: 0, z: 23, r: 15 },
  plot: { x: -9, z: 19, w: 13, d: 8.5, rot: 0.12 },  // soil for the future farm
  lawn: { x: 10, z: 15, r: 7.5 },                    // where the house will stand
  hill: { x: -27, z: -37, h: 9.5, top: 7, r: 27 },
  flowers: { x: -38, z: 6, r: 17 },
  glade: { x: 56, z: -18 },
  // stream: x, z, water level, half width, depth
  stream: [
    [92, -104, 4.6, 1.5, 0.35], [76, -80, 3.4, 1.5, 0.35], [61, -59, 2.4, 1.6, 0.36], [49, -41, 1.4, 1.7, 0.4], [39, -27, 0.4, 2.1, 0.45],
    [33.5, -17.5, -0.45, 4.5, 0.8], [31, -7, -0.6, 12.5, 1.8], [30.5, 3, -0.6, 9.5, 1.5], [32.5, 12, -0.68, 3.2, 0.55],
    [41, 26, -1.2, 1.8, 0.4], [55, 44, -2.0, 1.7, 0.38], [72, 66, -3.0, 1.6, 0.35], [92, 94, -4.2, 1.6, 0.35],
  ],
  trails: [
    [[1, 31], [-2, 14], [-7, 2], [-10, -10], [-16, -21], [-22, -29], [-26, -35]],          // home -> stone circle
    [[-4, 8], [6, 3], [14, -1], [20.5, -3]],                                               // -> pond beach
  ],
};

// Catmull-Rom through the control points, sampled about every metre
function densify(pts, step = 1) {
  const out = [];
  const P = i => pts[Math.min(pts.length - 1, Math.max(0, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    const n = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push(b.map((_, j) => 0.5 * ((2 * b[j]) + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
const distToPolyline = (pts, x, z) => {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz)));
    const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
    if (d < best) best = d;
  }
  return best;
};

export async function buildMeadowLevel({ seed = 4, far = '#cde6f2', deer = null, grassCount = 200000, onStep = async () => {} } = {}) {
  const M = MEADOW, FR = M.fieldRadius, CELLS = 320, STEP = FR * 2 / CELLS, NV = CELLS + 1;
  const group = new THREE.Group();
  group.name = 'meadow';
  const rng = mulberry32(seed * 977 + 3);
  const R = (a, b) => a + rng() * (b - a);

  // ------------------------------------------------------------------ water: nearest point on the stream for every grid vertex
  await onStep('ขุดลำธารและบ่อน้ำ');
  const stream = densify(M.stream, 0.5);
  const wEdge = new Float32Array(NV * NV), wLevel = new Float32Array(NV * NV), wDepth = new Float32Array(NV * NV);
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const x = -FR + i * STEP, z = -FR + j * STEP;
    let best = 1e9, bi = 0;
    for (let k = 0; k < stream.length; k++) {
      const s = stream[k], d = Math.hypot(x - s[0], z - s[1]) - s[3];
      if (d < best) { best = d; bi = k; }
    }
    const o = j * NV + i;
    // a wobbly shoreline instead of a ruler-drawn one
    wEdge[o] = best + (fbm3(x * 0.16, 5.5, z * 0.16, seed + 41, 2) - 0.5) * Math.min(3.2, stream[bi][3] * 0.5);
    wLevel[o] = stream[bi][2]; wDepth[o] = stream[bi][4];
  }
  const gridAt = (arr, x, z) => {
    const fx = Math.min(CELLS - 1e-4, Math.max(0, (x + FR) / STEP)), fz = Math.min(CELLS - 1e-4, Math.max(0, (z + FR) / STEP));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * NV + i;
    return (arr[o] * (1 - u) + arr[o + 1] * u) * (1 - v) + (arr[o + NV] * (1 - u) + arr[o + NV + 1] * u) * v;
  };

  // ------------------------------------------------------------------ terrain
  await onStep('ปั้นเนินและพื้นดิน');
  const heightFn = (x, z) => {
    const r = Math.hypot(x, z);
    let h = (fbm3(x * 0.03, 0.5, z * 0.03, seed, 3) - 0.5) * 3.2 + (fbm3(x * 0.1, 1.7, z * 0.1, seed + 5, 2) - 0.5) * 0.7;
    // the stone-circle hill: broad shoulders, a flat crown
    const dh = Math.hypot(x - M.hill.x, z - M.hill.z);
    h += M.hill.h * Math.pow(ss(M.hill.r, M.hill.top, dh), 1.25);
    // home clearing: level ground to build on
    const wh = 1 - ss(M.home.r, M.home.r + 13, Math.hypot(x - M.home.x, z - M.home.z));
    h = lerp(h, 0.35, wh);
    // the land rises under the forest wall
    h += Math.pow(ss(60, 116, r), 1.3) * 15 + ss(58, 105, r) * (fbm3(x * 0.022, 3.1, z * 0.022, seed + 9, 3) - 0.42) * 11;
    // stream bed and pond basin
    const o = Math.round((z + FR) / STEP) * NV + Math.round((x + FR) / STEP);
    const e = wEdge[o], lv = wLevel[o];
    if (e < 9) {
      const bank = Math.max(h, lv + 0.3 + Math.max(0, e) * 0.1);        // banks always stand above the water
      h = lerp(h, bank, 1 - ss(5, 9, e));
      h = lerp(h, lv - wDepth[o], ss(1.5, -0.9 - wDepth[o] * 2.6, e));  // slide down into the bed: a long shallow shelf round the pond
    }
    return h;
  };
  const field = G.createHeightField({ radius: FR, cells: CELLS, heightFn });
  const H = field.heightAt;
  const waterDepthAt = (x, z) => gridAt(wEdge, x, z) < 1.5 ? Math.max(0, gridAt(wLevel, x, z) - H(x, z)) : 0;

  // ------------------------------------------------------------------ where things may stand
  const trails = M.trails.map(t => densify(t.map(p => [p[0], p[1]]), 1.5));
  const trailDist = (x, z) => Math.min(...trails.map(t => distToPolyline(t, x, z)));
  const inPlot = (x, z, pad = 0) => {
    const c = Math.cos(-M.plot.rot), s = Math.sin(-M.plot.rot), dx = x - M.plot.x, dz = z - M.plot.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.max(Math.abs(lx) - M.plot.w / 2, Math.abs(lz) - M.plot.d / 2) - pad;       // < 0 inside
  };
  const placed = [];              // [x, z, r] of everything solid
  const free = (x, z, r) => gridAt(wEdge, x, z) > r + 1.2 && trailDist(x, z) > r + 1.3 && inPlot(x, z) > r + 1
    && Math.hypot(x - M.lawn.x, z - M.lawn.z) > M.lawn.r + r && Math.hypot(x - M.spawn.x, z - M.spawn.z) > 5 + r
    && Math.hypot(x - M.hill.x, z - M.hill.z) > 7 + r && placed.every(p => Math.hypot(p[0] - x, p[1] - z) > p[2] + r);

  // ------------------------------------------------------------------ plants
  await onStep('ปลูกป่าและดงไม้');
  const plants = [];              // for createForest, cut into sectors so off-screen forest is skipped
  const colliders = [];
  const shade = [], bare = [], press = [];
  const crowns = [];              // [x, y, z, r] rough leaf masses: the camera keeps out of them
  const CROWN_Y = { broadleaf: 5.7, oak: 5.2, pine: 5.6, birch: 6.6, sapling: 3.4 }, CROWN_R = { broadleaf: 2.9, oak: 3.5, pine: 2.3, birch: 2.0, sapling: 1.3 };
  const TRUNK = { broadleaf: 0.42, oak: 0.55, pine: 0.38, birch: 0.24, sapling: 0.2 };
  const CROWN = { broadleaf: 4.2, oak: 5.2, pine: 3.0, birch: 2.6, sapling: 2.0 };
  let ps = seed * 100;
  const cameraTrunks = [];
  const tree = (type, x, z, scale = 1, detail = 0.8, bush = false) => {
    const y = H(x, z);
    plants.push({ kind: 'tree', type, seed: ++ps, detail, x, y, z, rotY: rng() * 6.28, scale });
    placed.push([x, z, CROWN[type] * scale * 0.42]);
    colliders.push([x, z, TRUNK[type] * scale + 0.22]);
    cameraTrunks.push([x, z, TRUNK[type] * scale + 0.12, y, y + CROWN_Y[type] * scale]);
    crowns.push([x, y + CROWN_Y[type] * scale, z, CROWN_R[type] * scale]);
    shade.push([x, z, CROWN[type] * scale * 1.05, 1]); bare.push([x, z, TRUNK[type] * scale * 1.5]);
    if (bush) {
      const a = rng() * 6.28, d = (TRUNK[type] + 1.1) * scale, bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
      shrub(bx, bz, R(0.75, 1.05));
    }
  };
  const shrub = (x, z, scale = 1, type = null) => {
    if (gridAt(wEdge, x, z) < 1.5) return;
    plants.push({ kind: 'bush', type: type || (rng() < 0.35 ? 'flowering' : 'round'), seed: ++ps, x, y: H(x, z), z, rotY: rng() * 6.28, scale });
    colliders.push([x, z, 0.75 * scale]);
    shade.push([x, z, 1.7 * scale, 0.7]);
    placed.push([x, z, 1.0 * scale]);
  };
  // -- hand-placed: each one frames a view or marks a place
  tree('oak', 17.5, 26, 1.38, 1, true);                       // the home oak: shade for the future porch
  tree('broadleaf', -21, 30, 1.1, 0.9, true);
  tree('broadleaf', -20, 11, 0.95, 0.9);
  tree('sapling', 22, 34, 1.1);
  tree('broadleaf', 14, 41, 1.0, 0.8, true);
  // copse left of the hill trail: you walk past it, the hill appears behind it
  tree('oak', -21, -3, 1.1, 0.9, true); tree('broadleaf', -25.5, 3.5, 1.0, 0.85); tree('broadleaf', -17.5, 2.5, 0.85, 0.85); tree('sapling', -27, -8, 1.0);
  // hill flanks (the crown stays open for the stones)
  tree('pine', -40, -47, 1.15, 0.45); tree('pine', -34, -53, 1.3, 0.45); tree('pine', -44, -40, 0.95, 0.45); tree('pine', -19, -53, 1.1, 0.45);
  tree('broadleaf', -11, -33, 1.05, 0.9, true);
  // birch grove on the pond's north-west shore
  for (const [x, z, s] of [[15, -23, 1], [18.5, -26.5, 0.9], [12, -27, 1.05], [16, -31, 0.85], [21.5, -30, 0.95], [10.5, -20.5, 0.8], [19, -20.5, 0.75]]) tree('birch', x, z, s, 0.9);
  // pond: one leaning broadleaf on the south shore, saplings by the beach
  tree('broadleaf', 19.5, 12.5, 1.0, 0.9, true); tree('sapling', 15.5, -7, 0.95); tree('sapling', 43.5, 2, 1.0);
  // flower meadow and deer glade
  tree('sapling', -45, 12, 1.1); tree('broadleaf', -49, -6, 1.0, 0.85, true);
  tree('oak', 55, -6, 1.15, 0.9, true); tree('broadleaf', 60, 8, 1.0, 0.85); tree('oak', 49, 20, 1.0, 0.85); tree('birch', 46, -12, 0.9, 0.9);
  // between pond and hill: keep it open, two accents only
  tree('broadleaf', 4, -30, 1.0, 0.9, true); tree('sapling', -2, -47, 1.0);
  // -- the forest wall: an uneven ring, lighter trees in front, tall dark pines behind
  for (let a = 0; a < 360; a += 1) {
    const ar = a / 180 * Math.PI;
    const rin = 63 + (fbm3(Math.cos(ar) * 1.6, 7.7, Math.sin(ar) * 1.6, seed + 60, 2) - 0.5) * 16;
    for (let row = 0; row < 4; row++) {
      if (rng() > [0.26, 0.2, 0.17, 0.15][row]) continue;
      const rr = rin + row * 7 + R(-2.5, 2.5), aa = ar + R(-0.5, 0.5) / 57.3;
      const x = Math.cos(aa) * rr, z = Math.sin(aa) * rr;
      if (gridAt(wEdge, x, z) < 3.2) continue;
      const front = row < 2;
      const pick = rng();
      const type = front ? (pick < 0.42 ? 'broadleaf' : pick < 0.72 ? 'oak' : pick < 0.92 ? 'birch' : 'pine') : (pick < 0.36 ? 'pine' : pick < 0.8 ? 'oak' : 'broadleaf');
      const sc = front ? R(0.85, 1.15) : R(1.15, 1.6);
      if (!placed.every(p => Math.hypot(p[0] - x, p[1] - z) > p[2] + CROWN[type] * sc * 0.3)) continue;
      // leaf cards are the expensive part: full detail only where the player can walk up to a tree
      tree(type, x, z, sc, type === 'pine' ? (front ? 0.3 : 0.2) : (front ? 0.45 : 0.25), front && rng() < 0.16);
    }
  }
  // a few low bushes where the meadow meets the water and the trails
  for (const [x, z, s] of [[24.5, 13, 0.9], [14, 4.5, 0.8], [40, -19, 0.9], [-13, 30, 0.85], [22, 22, 0.8], [-32, -22, 0.9]]) shrub(x, z, s);

  // ------------------------------------------------------------------ rocks
  await onStep('วางหินและวงหินตั้ง');
  const rocks = new THREE.Group();
  rocks.name = 'rocks';
  let rs = seed * 31;
  const rock = (type, x, z, scale = 1, sink = 0, solid = null) => {
    const m = N.createRock({ type, seed: ++rs });
    m.position.set(x, H(x, z) - sink, z); m.rotation.y = rng() * 6.28; m.scale.setScalar(scale);
    rocks.add(m);
    const r = solid ?? ({ boulder: 1.0, slab: 1.3, standing: 0.5, crag: 1.5, stones: 0.8, river: 0.7, pebbles: 0 }[type] * scale);
    if (r > 0) { colliders.push([x, z, r]); press.push([x, z, r * 1.6]); shade.push([x, z, r * 2.0, 0.55]); }
    placed.push([x, z, Math.max(r, 0.6)]);
    return m;
  };
  // the stone circle: seven standing stones with a gap facing the trail, one fallen
  for (let i = 0; i < 8; i++) {
    if (i === 3) continue;                                  // the way in
    const a = i / 8 * Math.PI * 2 + 0.45, x = M.hill.x + Math.cos(a) * 4.7, z = M.hill.z + Math.sin(a) * 4.7;
    rock('standing', x, z, R(1.05, 1.4), 0.12);
  }
  rock('slab', M.hill.x + 0.6, M.hill.z - 0.4, 0.9, 0.05);                      // altar stone in the middle
  rock('crag', -40, -30, 1.1, 0.2); rock('boulder', -16, -45, 1.2, 0.15); rock('stones', -31, -24, 1.0);
  // pond and stream
  rock('boulder', 20.5, -13, 1.25, 0.2); rock('stones', 42.5, -11, 1.1); rock('boulder', 43, 8, 1.0, 0.2); rock('stones', 21, 5.5, 0.9);
  rock('river', 34.5, 15.5, 1.1, 0.1, 0.5); rock('river', 36.5, 18.5, 0.95, 0.1, 0.45); rock('river', 38.6, 21.8, 1.05, 0.1, 0.5);   // stepping stones
  rock('river', 45.5, -35, 1.1, 0.1); rock('boulder', 52, -47, 1.1, 0.2); rock('river', 49, 36, 1.0, 0.1);
  rock('pebbles', 19.5, -3, 1.2, 0, 0); rock('pebbles', 20, 1.5, 1.0, 0, 0); rock('pebbles', 41.5, -3, 1.0, 0, 0);
  // meadow
  rock('boulder', -30, 20, 1.1, 0.2); rock('slab', 26, 31, 1.0, 0.1); rock('stones', -8, -22, 0.9); rock('boulder', 8, -40, 1.0, 0.2);
  rock('stones', -52, 22, 1.0); rock('boulder', 62, -28, 1.2, 0.2);

  // ------------------------------------------------------------------ cliffs, big boulders and shore stones
  // Everything here is tried from a candidate list: a spot that is taken (tree, trail, water, another rock) is simply
  // skipped. A failure in this block never stops the meadow from loading.
  await onStep('ตั้งหน้าผาและก้อนหินใหญ่');
  try {
    const clearAt = (x, z, r) => gridAt(wEdge, x, z) > r + 1.2 && trailDist(x, z) > r + 1.3 && inPlot(x, z) > r + 1
      && Math.hypot(x - M.lawn.x, z - M.lawn.z) > M.lawn.r + r && Math.hypot(x - M.spawn.x, z - M.spawn.z) > 5 + r
      && placed.every(p => Math.hypot(p[0] - x, p[1] - z) > p[2] + r);
    const cliffList = [];
    let cs = seed * 53;
    // a piece standing at (x, z) with its face towards (fx, fz); its feet follow the lowest ground under it
    const cliff = (type, x, z, fx, fz, opts = {}) => {
      const rotY = Math.atan2(fx - x, fz - z), c = Math.cos(rotY), s = Math.sin(rotY);
      const fp = Cliffs.cliffFootprint(type, opts).map(([u, v, r]) => [x + u * c + v * s, z - u * s + v * c, r]);
      if (!fp.every(([px, pz, r]) => clearAt(px, pz, r))) return false;
      const y = Math.min(...fp.map(([px, pz]) => H(px, pz))) - 0.2;
      cliffList.push({ type, x, y, z, rotY, seed: ++cs, opts });
      for (const [px, pz, r] of fp) { colliders.push([px, pz, r]); placed.push([px, pz, r]); shade.push([px, pz, r * 2, 0.5]); }
      return true;
    };
    // the stone-circle hill: a broken ring of cliff on its flanks, the trail left open
    for (let a = 0; a < 360; a += 30) {
      if (rng() < 0.25) continue;
      const ang = a * Math.PI / 180, x = M.hill.x + Math.cos(ang) * 13.5, z = M.hill.z + Math.sin(ang) * 13.5;
      cliff(rng() < 0.3 ? 'corner' : 'wall', x, z, x + Math.cos(ang) * 10, z + Math.sin(ang) * 10, { width: 5.5 + rng() * 2.5 });
    }
    // the far bank of the pond and the stream's inflow
    for (const [x, z] of [[47, -9], [47.5, 0], [46, 7]]) cliff('ledge', x, z, 31, -3, { width: 6 + rng() * 2 });
    for (const [x, z] of [[34, -26], [27, -24]]) cliff('wall', x, z, 31, -8, { width: 5.5 });
    // the rim of the map, where the land already rises under the forest
    for (let a = 0; a < 360; a += 11) {
      if (rng() < 0.35) continue;
      const ang = a * Math.PI / 180, x = Math.cos(ang) * 64, z = Math.sin(ang) * 64;
      cliff(rng() < 0.2 ? 'spire' : 'wall', x, z, 0, 10, { width: 6 + rng() * 3, height: 4.2 + rng() * 1.6 });
    }
    if (cliffList.length) rocks.add(Cliffs.createCliffSet(cliffList));
    // big mossy boulders
    let bigBoulders = 0;
    for (const [x, z, sc] of [[-14, -48, 2.4], [-46, -40, 2.6], [-44, -16, 2.2], [14, -30, 2.4], [50, -24, 2.6], [56, 10, 2.3], [-60, -5, 2.5], [40, 40, 2.4], [-20, 50, 2.3], [-38, -52, 2.8]]) {
      if (clearAt(x, z, 1.15 * sc)) { rock('boulder', x, z, sc, 0.35); bigBoulders++; }
    }
    // round stones in the shallows along the pond's edge
    const shore = [];
    for (let x = 14; x <= 48; x += 1.5) for (let z = -24; z <= 24; z += 1.5) {
      const e = gridAt(wEdge, x, z);
      if (e > 0.3 && e < 1.5 && trailDist(x, z) > 2.5) shore.push([x, z]);
    }
    let shoreStones = 0;
    for (let i = shore.length - 1; i > 0 && shoreStones < 18; i--) {
      const j = Math.floor(rng() * (i + 1)); [shore[i], shore[j]] = [shore[j], shore[i]];
      const [x, z] = shore[i], sc = 0.8 + rng() * 0.7;
      if (placed.every(p => Math.hypot(p[0] - x, p[1] - z) > p[2] + 0.7 * sc + 1.8)) { rock('river', x, z, sc, 0.15); shoreStones++; }
    }
    console.info('[meadow] cliffs', cliffList.length, 'big boulders', bigBoulders, 'shore stones', shoreStones);
  } catch (err) { console.warn('[meadow] cliffs skipped:', err); }

  // ------------------------------------------------------------------ ground colour map (reads the plan above)
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    const r = Math.hypot(x, z);
    if (r > 118) return [0, 0, 0];
    let earth = 0, sand = 0, mow = 0;
    const e = gridAt(wEdge, x, z);
    if (e < 4) {                                             // beaches: wide round the pond, a thin lip along the stream
      const wide = ss(0.5, 1.4, gridAt(wDepth, x, z));
      sand = 1 - ss(0.0 + wide * 1.7, 0.55 + wide * 3.2, e);
    }
    const td = trailDist(x, z);
    if (td < 3) {                                            // trodden trail: short grass, a thread of earth down the middle
      const wob = (fbm3(x * 0.5, 2.9, z * 0.5, seed + 77, 2) - 0.5) * 0.7;
      mow = Math.max(mow, 1 - ss(0.7, 2.2, td + wob));
      earth = Math.max(earth, (1 - ss(0.15, 0.75, td + wob)) * 0.62);
    }
    const pd = inPlot(x, z);
    if (pd < 1.5) { earth = Math.max(earth, 1 - ss(-0.5, 0.6, pd + (fbm3(x * 0.8, 1.9, z * 0.8, seed + 88, 2) - 0.5) * 0.8)); mow = Math.max(mow, 1 - ss(0.5, 1.5, pd)); }
    mow = Math.max(mow, (1 - ss(M.lawn.r - 2.5, M.lawn.r, Math.hypot(x - M.lawn.x, z - M.lawn.z))) * 0.9);
    mow = Math.max(mow, (1 - ss(2.5, 5.2, Math.hypot(x - M.hill.x, z - M.hill.z))) * 0.8);      // worn ground inside the stone circle
    return [earth, sand, mow];
  };
  // four greens, cool and deep to warm and sunny, so the meadow reads as painted drifts rather than one flat colour
  const colors = { ...G.GROUND_COLORS, deep: '#55924a', mid: '#7cae40', sunny: '#9fc84a', shade: '#447a3c', lawn: '#96bb49' };
  const map = G.createGroundMap({ radius: FR, size: 768, seed, heightAt: H, dirt: 0, shade, bare, press, paint, colors });
  const fade = { far, fadeA: FR * 0.8, fadeB: FR * 0.985 };
  const terrain = G.createTerrain(field, map, fade);
  group.add(terrain);

  // ------------------------------------------------------------------ water: a ribbon along the stream, wide over the pond
  await onStep('วาดริ้วฟองน้ำ');
  const foamTexture = await W.loadFoamTexture();
  await onStep('เติมน้ำ');
  const animeCells = createAnimeCells();
  const droplets = createWaterDroplets({ time: N._internal.shared.uTime });
  droplets.points.userData.dispose = droplets.dispose;
  group.add(droplets.points);
  let water, sim, optics, pads3d = null;
  const flowRows = [];            // [x, z, downstream x, downstream z, F] for every row of the water ribbon
  {
    const ACROSS = 56, pos = [], flow = [], dir = [], idx = [];   // fine enough for waves to show as real bumps
    let F = 0;
    for (let k = 0; k < stream.length; k++) {
      const s = stream[k], a = stream[Math.max(0, k - 1)], b = stream[Math.min(stream.length - 1, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const half = s[3] + 2.6 + Math.min(3.2, s[3] * 0.5) * 0.6;
      const streaminess = 1 - ss(2.6, 6.5, s[3]);            // 1 in the stream, 0 over the pond
      // F: distance along the stream in "flow time" (see FLOW in stylized-water.js): slow water counts for more
      if (k > 0) F += Math.hypot(s[0] - a[0], s[1] - a[1]) * W.FLOW.pond / lerp(W.FLOW.pond, W.FLOW.stream, streaminess);
      flowRows.push([s[0], s[1], tx, tz, F]);
      for (let i = 0; i <= ACROSS; i++) {
        const u = -1 + 2 * i / ACROSS, x = s[0] - tz * u * half, z = s[1] + tx * u * half;
        pos.push(x, s[2], z); flow.push(F, u * half, streaminess); dir.push(tx, tz);
      }
    }
    const row = ACROSS + 1;
    for (let k = 0; k < stream.length - 1; k++) for (let i = 0; i < ACROSS; i++) {
      const a = k * row + i, b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setIndex(idx);
    // the wave simulation covers the pond and the first stretch of the outlet
    const foamObstacles = colliders.filter(([x, z]) => x > 5 && x < 63 && z > -28 && z < 30 && waterDepthAt(x, z) > 0.01);
    const foamWet = (x, z) => waterDepthAt(x, z) > 0.03 && !foamObstacles.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < (r * 0.75) ** 2);
    sim = W.createWaterSim({ rect: [6, -27, 56], size: 512, field, foamTexture, level: -0.6, mask: foamWet });
    optics = W.createWaterOptics({ level: -0.6 });
    water = new THREE.Mesh(g, W.waterMaterial({ field, animeCells, sim, optics, foamTexture, far, fadeA: FR * 0.8, fadeB: FR * 0.985 }));
    water.name = 'water';
    water.renderOrder = 1;
    water.userData = { kind: 'water', dispose() { g.dispose(); water.material.dispose(); sim.dispose(); optics.dispose(); } };
    group.add(water);
  }
  // something touches the water, and the wave simulation does the rest. A splash (a tap, a jump) makes the water swell up a little,
  // throws a patch of foam with a broken rim and a handful of drops; a footstep ('step') presses a dip that rings outward, leaves a
  // wisp of foam and flicks a drop or two; mode 'plain' is a dip with nothing else (the falls, a fish, standing still).
  const ripple = (x, z, strength = 1, radius = 0.26, mode = null) => {
    const k = W.WATER_TUNE.ripple.value, foam = W.WATER_TUNE.splashFoam.value, drop = W.WATER_TUNE.drops.value;
    if (mode === 'plain') sim.impulse(x, z, radius, -0.03 * strength * k);
    else if (mode === 'splash' || (mode === null && strength >= 1.5)) {
      if (sim.inside(x, z)) W.WATER_RINGS.add(x, z, Math.min(2, 0.7 * strength));
      sim.impulse(x, z, radius, 0.012 * strength * k * W.WATER_TUNE.splashBump.value, Math.min(1, 0.4 * strength) * foam);
      if (drop > 0 && sim.inside(x, z)) droplets.emit(x, gridAt(wLevel, x, z), z, strength / 2.4 * drop, Math.round(14 * Math.min(1.5, drop)));
    } else {
      // a footstep: one clear ring of waves, and a puff of foam into her wake where the foot came down (the wake itself is laid
      // down by WATER_WAKE.track in follow); only a faint wisp of simulated foam, so the lace of the wake stays readable
      const st = mode === 'step';
      if (st) W.WATER_WAKE.add(x, z, Math.min(1.3, 0.9 * strength));
      sim.impulse(x, z, radius, (st ? -0.042 : -0.03) * strength * k, -Math.min(st ? 0.15 : 0.55, (st ? 0.18 : 0.75) * strength) * foam);
      if (mode === 'step' && drop > 0 && sim.inside(x, z)) droplets.emit(x, gridAt(wLevel, x, z), z, 0.16 * drop * strength, strength > 1.2 ? 3 : 2);
    }
  };
  // lily pads: a few rafts in the pond's quiet shallows, some in flower
  const pondSpots = [];           // open water of the pond, for the odd ripple from a fish
  {
    const prng = mulberry32(seed * 71 + 13), pads = [];
    const still = (x, z) => Math.abs(gridAt(wLevel, x, z) + 0.6) < 0.03;
    for (let tries = 0, rafts = 0; tries < 400 && rafts < 7; tries++) {
      const x = 31 + (prng() - 0.5) * 30, z = -3 + (prng() - 0.5) * 30, d = waterDepthAt(x, z);
      if (d > 0.9 && still(x, z) && pondSpots.length < 24) pondSpots.push([x, z]);
      if (d < 0.3 || d > 0.75 || !still(x, z) || pads.some(p => Math.hypot(p[0] - x, p[1] - z) < 5)) continue;
      rafts++;
      const n = 4 + Math.floor(prng() * 4);
      for (let i = 0; i < n; i++) {
        const a = prng() * 6.28, r = 0.3 + prng() * 0.34, dd = i ? 0.5 + prng() * 1.7 : 0;
        const px = x + Math.cos(a) * dd, pz = z + Math.sin(a) * dd, pd = waterDepthAt(px, pz);
        if (pd < 0.16 || !still(px, pz) || pads.some(p => Math.hypot(p[0] - px, p[1] - pz) < p[2] + r + 0.06) || placed.some(p => Math.hypot(p[0] - px, p[1] - pz) < p[2] + r + 0.5)) continue;
        // where the leaf sits in flow coordinates, so it rides the same waves as the water around it
        let row = flowRows[0], best = 1e9;
        for (const fr of flowRows) { const d = Math.hypot(px - fr[0], pz - fr[1]); if (d < best) { best = d; row = fr; } }
        const acrossPad = (px - row[0]) * -row[3] + (pz - row[1]) * row[2];
        pads.push([px, pz, r, r > 0.44 && prng() < 0.55 ? 1 : 0, -0.6, acrossPad, row[4]]);
      }
    }
    if (pads.length) { pads3d = W.createLilyPads({ pads, seed, sim }); group.add(pads3d); }
  }

  // ------------------------------------------------------------------ forest batches (one per sector -> the camera skips what is behind it)
  await onStep('แตกใบ');
  const SECT = 6, sectors = Array.from({ length: SECT + 1 }, () => []);
  for (const p of plants) {
    const r = Math.hypot(p.x, p.z);
    sectors[r < 52 ? SECT : Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * SECT) % SECT].push(p);
  }
  let cards = 0, draws = 0;
  for (const list of sectors) {
    if (!list.length) continue;
    const f = N.createForest(list);
    const box = new THREE.Box3();
    for (const p of list) { box.expandByPoint(new THREE.Vector3(p.x - 7, p.y - 1, p.z - 7)); box.expandByPoint(new THREE.Vector3(p.x + 7, p.y + 17, p.z + 7)); }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    f.children.forEach(m => { m.geometry.boundingSphere = sphere.clone(); m.frustumCulled = true; });
    cards += f.userData.cards; draws += f.userData.drawCalls;
    group.add(f);
    await onStep('แตกใบ');
  }
  group.add(rocks);

  // ------------------------------------------------------------------ flowers
  await onStep('โปรยดอกไม้');
  const PALS = [['#f4a6bc', '#f6f2e6'], ['#f7d84a', '#f6f2e6'], ['#b9a3e8', '#93b8ee'], ['#f6f2e6', '#f7d84a'], ['#93b8ee', '#f6f2e6']];
  let fs = seed * 53, fi = 0;
  const flowers = (x, z, radius, count) => {
    if (map.grassAt(x, z) < 0.5 || gridAt(wEdge, x, z) < radius + 1) return;
    group.add(N.createFlowers({ count, radius, seed: ++fs, heightAt: H, center: [x, z], colors: PALS[fi++ % PALS.length] }));
  };
  for (let i = 0; i < 16; i++) {                           // the flower meadow: drifts that overlap
    const a = rng() * 6.28, d = Math.sqrt(rng()) * M.flowers.r;
    flowers(M.flowers.x + Math.cos(a) * d, M.flowers.z + Math.sin(a) * d * 0.8, R(1.6, 3.2), Math.round(R(60, 120)));
  }
  for (const [x, z] of [[13.5, 21], [5, 9.5], [-17, 26], [20, 30], [-4, 33.5], [-13, -16], [-20, -27], [-33, -30], [2, -22], [10, -12], [24, 16], [46, 14], [52, -24], [60, -10], [-6, -40]]) flowers(x, z, R(1.1, 2.2), Math.round(R(35, 70)));

  // ------------------------------------------------------------------ fluffy grass that follows the player
  await onStep('ปลูกหญ้า');
  const grass = G.createFollowGrass({ map, field, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade });
  group.add(grass);

  // ------------------------------------------------------------------ deer in the glade across the stream
  const animals = [];
  if (deer) {
    try {
      const asset = await A.loadAnimal(deer, { height: 1.9 });
      for (const [x, z, rot, s] of [[57, -21, 2.2, 1], [61.5, -16, 4.0, 0.92], [53.5, -14.5, 0.7, 0.86]]) {
        const d = A.createAnimal(asset, { action: 'idle' });
        d.object.position.set(x, H(x, z), z); d.object.rotation.y = rot; d.object.scale.setScalar(s);
        group.add(d.object); animals.push(d); colliders.push([x, z, 0.8]);
      }
      const walker = A.createAnimal(asset, { action: 'walk' });
      A.walkAlong(walker, { points: densify([[50, 2], [57, -8], [63, -22], [58, -36], [50, -30]], 2), groundAt: H, speed: 1.42 });
      group.add(walker.object); animals.push(walker);
    } catch (e) { console.warn('deer', e); }
  }

  let nextStir = 3;
  terrain.layers.enable(W.UNDERWATER);
  rocks.traverse(o => o.layers.enable(W.UNDERWATER));
  const hidden = [water, grass, pads3d, droplets.points].filter(Boolean);
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), camWorld = new THREE.Vector3();
  let frameNo = 0;
  const waterSpheres = [];
  for (let k = 0; k < stream.length; k += 20) { const sp = stream[k]; if (Math.hypot(sp[0], sp[1]) < 100) waterSpheres.push(new THREE.Sphere(new THREE.Vector3(sp[0], sp[2], sp[1]), sp[3] + 7)); }
  group.userData = { kind: 'meadow', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); map.dispose(); field.texture.dispose(); } };
  return {
    group, map, field, grass, terrain, heightAt: H, waterDepthAt, colliders, crowns, cameraTrunks, spawn: M.spawn, radius: M.radius,
    stats: { trees: plants.filter(p => p.kind === 'tree').length, bushes: plants.filter(p => p.kind === 'bush').length, cards, forestDraws: draws, rocks: rocks.children.length },
    ripple, sim, optics, waterLevelAt: (x, z) => gridAt(wLevel, x, z),
    // things that can be seen under the water go on their own layer, so the see-through picture is cheap to draw
    addUnderwater(obj) { obj.traverse(o => o.layers.enable(W.UNDERWATER)); },
    update(renderer, dt, scene = null, camera = null) {
      sim.step(renderer, dt);
      droplets.update(renderer);
      if (!scene || !camera) return;
      // the two water pictures cost a redraw of the scene each, so they are only refreshed when water is on screen
      // and close enough to matter: the see-through picture every frame, the mirror every 2nd (or 4th) frame
      frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      camWorld.setFromMatrixPosition(camera.matrixWorld);
      let near = Infinity;
      for (const sp of waterSpheres) if (frustum.intersectsSphere(sp)) near = Math.min(near, camWorld.distanceTo(sp.center) - sp.radius);
      frameNo++;
      const q = optics.quality;
      const doThrough = near < 42, doMirror = q > 0 && near < 65 && frameNo % (q === 2 ? 2 : 4) === 0;
      if (doThrough || doMirror) optics.render(renderer, scene, camera, hidden, doThrough, doMirror);
    },
    // a tap on the screen: follow the ray until it meets water (a splash) or land (nothing)
    tapWater(origin, dir) {
      for (let t = 1; t < 70; t += 0.25) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
        const ground = H(x, z), depth = waterDepthAt(x, z);
        if (depth > 0.03 && y <= ground + depth) { ripple(x, z, 2.4, 0.36); return true; }
        if (y <= ground) return false;
      }
      return false;
    },
    follow(pos, lookDir) {
      grass.userData.follow(pos, lookDir);
      W.WATER_WAKE.track(pos.x, pos.z, waterDepthAt(pos.x, pos.z));
      // now and then something stirs in the pond
      const now = N._internal.shared.uTime.value;
      if (pondSpots.length && now > nextStir) {
        const [x, z] = pondSpots[Math.floor(Math.random() * pondSpots.length)];
        ripple(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2, 0.9, 0.26, 'plain');
        nextStir = now + 2.2 + Math.random() * 3.5;
      }
    },
  };
}


