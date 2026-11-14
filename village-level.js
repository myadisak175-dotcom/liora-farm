// village-level.js  —  the terraced village island, shaped by a heightmap  (?map=village)
//
// One job: a trial of the village above the falls rebuilt on terraces, as in the concept art: plateaus in hard-edged steps,
// a ravine across the island, a river coming down the steps in falls. The land is a picture (assets/heightmaps/
// village-terrace.png, 16-bit grey, white high), made by tools/make-village-heightmap.py; the game reads its .bin (the same
// picture as raw 16-bit numbers, 513 x 513) and lays the meadow's own things over it: the land's paint, the ground picture
// and the fluffy grass, trees, the valley's clear water on the reaches and its falls between them, and the village's
// stand-in buildings (stylized-buildings.js) where the concept art has them: the keep on the knoll, the manor and the great
// tree on the high plateau with the pasture beside them, the windmill on the east shelf, the water mill by the knoll's
// stream, the market on the middle shelf, houses round a well in the lower village, a stone bridge over the river.
// For now she walks each level on its own: there are no ways up and down the cliffs yet (📍 ไปที่… takes her from one to the next).
//
//   const level = await buildVillageLevel({ far, sun, grassCount, onStep });     // the same shape as the other levels

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as N from './stylized-nature.js';
import * as T from './stylized-terrain.js';
import * as G from './stylized-grassfield.js';
import * as W from './stylized-water.js';
import * as BD from './stylized-buildings.js';
import { loadProp, propMaterial } from './stylized-props.js';
import { loadLegacyWoodProps } from './legacy-wood-props.js';
import { createAnimeCells } from './anime-cells.js';
import { createWaterDroplets } from './water-droplets.js';
import { createWaterfall } from './stylized-waterfall.js';
import { createAbyssFalls } from './abyss-scene.js';

const { mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const VILLAGE_MAP = {
  file: './assets/heightmaps/village-terrace.bin', cells: 513, water: './assets/heightmaps/village-terrace-brooks.json',
  size: 165,          // metres the picture covers (the island is about 150 m across)
  levels: 9, step: 3.5, base: 3,      // the picture's white is level 9; a level is 3.5 m; level 3 (the island's floor) is y = 0
  void: -60,          // off the island's edge: a sheer drop into the haze
  spawn: { x: -14, z: 36, yaw: Math.PI },
};

// where everything stands (metres; -z is north, up the island). The heights are the plateaus': 17.5 high plateau, 14 knoll,
// 10.5 middle and east shelves, 7 west shelf and lower village, 0 the low ground, -5 the ravine's water.
const VILLAGE = {
  houses: [                                                                // x, z, which way the door faces (yaw), size
    { x: -5, z: -50, yaw: 0, w: 7.5, d: 5.5, floors: 2, seed: 41 },       // the manor, on the high plateau
    { x: 3, z: -57, yaw: 0, w: 5.6, d: 4.6, floors: 1, seed: 42 },
    { x: -24, z: -14, yaw: 0, w: 6, d: 4.6, floors: 2, seed: 43 },         // the market, on the middle shelf
    { x: -12, z: -18, yaw: 0, w: 5.6, d: 4.6, floors: 1, seed: 44 },
    { x: -1, z: -12, yaw: -Math.PI / 2, w: 5.6, d: 4.6, floors: 2, seed: 45 },
    { x: -60, z: 8, yaw: Math.PI / 2, w: 5.6, d: 4.6, floors: 1, seed: 47 },   // the west shelf
    { x: -58, z: 20, yaw: Math.PI / 2, w: 6, d: 5, floors: 2, seed: 48 },
    { x: -30, z: 38, yaw: Math.PI / 2, w: 6, d: 4.8, floors: 2, seed: 49 },    // the lower village, round the well
    { x: -20, z: 52, yaw: Math.PI, w: 5.6, d: 4.6, floors: 1, seed: 50 },
    { x: -5, z: 50, yaw: Math.PI, w: 6.4, d: 5, floors: 2, seed: 51 },
    { x: 2, z: 40, yaw: -Math.PI / 2, w: 5.6, d: 4.6, floors: 1, seed: 52 },
    { x: -29, z: 48.5, yaw: Math.PI / 2, w: 5.2, d: 4.4, floors: 1, seed: 53 },
  ],
  keep: { x: -45, z: -42, s: 5.5, h: 12 },                                 // on the knoll
  waterMill: { house: { x: -39.5, z: -35.5, yaw: Math.PI / 2, w: 5.2, d: 4.4, wall: 3.3, seed: 54 }, wheel: [-34.3, -35] },
  mill: [46, 0], millYaw: -2.4,                                            // the windmill, its sails turned toward the village
  tree: [9, -50],                                                          // the great tree, by the river's spring
  well: [-14, 43],
  bridge: { x: 19.4, z: 11, len: 11 },                                     // the stone bridge, along x, over the river on the low ground
  pasture: [[26, -49], [36.5, -49], [36.5, -39.5], [26, -39.5]],
  // trodden ways on each level (drawn as bare earth)
  paths: [
    [[-5, -46.5], [2, -46], [9, -46.5]], [[3, -54.4], [3, -50], [-1, -46.5]], [[9, -46.5], [20, -44.5], [25.5, -44.5]],
    [[-24, -11.5], [-18, -9], [-10, -8], [-3.5, -12]], [[-12, -15.5], [-12, -9]],
    [[-42, -42], [-39.8, -39], [-39.5, -37.8]], [[47.5, 3], [42, 8]],
    [[-57.5, 8], [-55.5, 14], [-55.5, 20]],
    [[-27, 38], [-19, 41], [-14, 43]], [[-14, 43], [-9, 41], [-0.5, 40]], [[-14, 43], [-17, 48], [-20, 49.5]], [[-14, 43], [-8, 46], [-5, 47.3]],
    [[-26.4, 48.5], [-19, 46]], [[-14, 43], [-14, 34]],
  ],
  yards: [[-14, 43, 3.6], [-10, -8.5, 3.2], [7, -47.5, 3], [-41, -38.5, 2.2]],     // trodden yards: round the well, the market, under the great tree, by the water mill
  props: [                                                                 // kind, x, z, which way it faces
    ['stall', -15, -6.5, Math.PI], ['stall', -9, -5.5, Math.PI], ['stall', -4, -6.8, Math.PI + 0.4], ['barrels', -19.5, -6, 0], ['crates', -2, -5.5, 1],
    ['lamp', -17.5, -11, 0], ['lamp', -6, -11, 0], ['signpost', -26, -6, 0.4], ['cart', -28.5, -9, 0.8], ['bench', -10, -3, 0],
    ['bench', 5.5, -44, 0.3], ['table', 1, -45, 0], ['barrels', -10, -52, 0], ['woodpile', 8, -59, 0], ['lamp', -1, -46.2, 0], ['lamp', 12, -45.5, 0],
    ['hay', 34.5, -47.5, 0.4], ['hay', 27.5, -41, 1.3], ['sheep', 29, -46, 0.6], ['sheep', 32, -43.5, 2.4], ['sheep', 34, -41.5, 4], ['sheep', 30.5, -42, 5.2], ['sheep', 33.5, -45.8, 1.6],
    ['barrels', -42, -46.5, 0], ['crates', -48, -38.5, 1], ['lamp', -41.5, -39.5, 0],
    ['crates', -36.5, -38.5, 0.3], ['woodpile', -40, -32, 1.57],
    ['hay', 50, 6, 0.5], ['cart', 42, -4, 2.2], ['crates', 44, 11.5, 0],
    ['woodpile', -63, 11.5, 0], ['hay', -54, 4, 0.4], ['barrels', -61, 24, 1],
    ['stall', -21, 41.5, Math.PI / 2], ['stall', -7, 38.5, -Math.PI / 2], ['bench', -17.5, 45.5, 1.2], ['bench', -10.6, 46.8, 2.4], ['lamp', -18, 39, 0], ['lamp', -9, 44.5, 0],
    ['barrels', -24.5, 35, 0], ['crates', -1, 46, 1], ['signpost', -17.5, 32.5, 0.3], ['cart', 5, 44.5, 1.2], ['woodpile', -24.5, 55, 0], ['table', -8.5, 41, 0.4],
    ['signpost', 12.5, 15.5, 2.6], ['lamp', 13.2, 9.2, 0], ['lamp', 25.8, 12.8, 0],
  ],
  // by hand: bushes at the houses' corners and flower beds
  shrubs: [[-9.5, -53], [0, -53.5], [6.5, -54], [-28, -16.5], [-15.5, -20.5], [2.5, -15], [-62.5, 4.5], [-61, 24.5], [-33, 35], [38, 12], [-33, 41.5],
    [-23.5, 55], [-9.5, 53], [0, 53], [5, 37], [-32, 51], [-43, -46], [-36, -33]],
  flowers: [[-17, 40, 1.4], [-11, 46, 1.3], [-6.5, -9, 1.3], [-1, -44, 1.3], [-56, 16, 1.4], [44, 4, 1.3]],
};
const TRUNK = { broadleaf: 0.6, oak: 0.7, pine: 0.38, birch: 0.26, sapling: 0.2 }, TREE_H = { broadleaf: 7.5, oak: 7.4, pine: 7.9, birch: 8.4, sapling: 4 };

export async function buildVillageLevel({ seed = 7, far = '#cde6f2', grassCount = 150000, sun = [-0.45, 0.62, 0.64], windmill = './assets/models/windmill.glb', onStep = async () => {} } = {}) {
  const M = VILLAGE_MAP, half = M.size / 2, FR = half, n = M.cells;
  const group = new THREE.Group(); group.name = 'village';

  // ------------------------------------------------------------------ the land: read from the picture
  await onStep('อ่านแผนที่ความสูง');
  const raw = new Uint16Array(await (await fetch(M.file)).arrayBuffer());
  const WD = await (await fetch(M.water)).json();                         // { reaches: [[[x, z, level, half], ...], ...], falls: [{ x, z, top, bottom, width, dir }] }
  const metres = v => v < 0.5 / M.levels ? M.void : (v * M.levels - M.base) * M.step;
  const px = (i, j) => metres(raw[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))] / 65535);
  const heightFn = (x, z) => {                                             // bilinear between the picture's points
    const fx = (x + half) / M.size * (n - 1), fz = (z + half) / M.size * (n - 1), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (px(i, j) * (1 - u) + px(i + 1, j) * u) * (1 - v) + (px(i, j + 1) * (1 - u) + px(i + 1, j + 1) * u) * v;
  };
  const field = G.createHeightField({ radius: FR, cells: 440, heightFn });
  const HG = field.heightAt;                                               // the ground
  const slope = (x, z) => Math.hypot(HG(x + 0.5, z) - HG(x - 0.5, z), HG(x, z + 0.5) - HG(x, z - 0.5));
  const onIsland = (x, z) => HG(x, z) > -8;
  // the bridge's deck: walked on above the ground
  const B = VILLAGE.bridge, bridgeY = Math.min(heightFn(B.x - B.len / 2 + 0.4, B.z), heightFn(B.x + B.len / 2 - 0.4, B.z)) - 0.12;
  const onDeck = (x, z) => Math.abs(x - B.x) < B.len / 2 && Math.abs(z - B.z) < 1.0;
  const H = (x, z) => onDeck(x, z) ? Math.max(HG(x, z), bridgeY + BD.stoneBridgeDeck(x - B.x, { length: B.len })) : HG(x, z);
  // the water: how deep it is here (the nearest point of the nearest reach says how high its water stands)
  const rows = WD.reaches.flat();
  const brookAt = (x, z) => {
    let best = null, bd = 9;
    for (const q of rows) { if (Math.abs(q[0] - x) > 6 || Math.abs(q[1] - z) > 6) continue; const d = Math.hypot(x - q[0], z - q[1]) - q[3]; if (d < bd) { bd = d; best = q; } }
    return best && bd < 1.6 ? { level: best[2], d: bd } : null;
  };
  const waterDepthAt = (x, z) => { if (onDeck(x, z)) return 0; const b = brookAt(x, z); return b ? Math.max(0, b.level - HG(x, z)) : 0; };
  const colliders = [], cameraTrunks = [], shade = [], bare = [], press = [], casters = [], plants = [], placed = [];
  const castBall = (x, z, h, r, st = 0.8) => casters.push([x, z, h, r, st]);
  const clear = (x, z, d) => placed.every(([qx, qz, qd]) => Math.hypot(x - qx, z - qz) > d + qd);
  const flatAt = (x, z, k) => Math.max(slope(x, z), slope(x + k, z), slope(x - k, z), slope(x, z + k), slope(x, z - k)) < 0.3;

  // where 📍 ไปที่… takes her: stand at (x, z), facing (tx, tz)
  const view = (x, z, tx, tz) => ({ x, z, yaw: Math.atan2(tx - x, tz - z) });
  const views = {
    start: M.spawn,
    'vt-plaza': view(-14, 35, -14, 43), 'vt-market': view(-12, -1, -12, -12), 'vt-manor': view(5, -40, -2, -52),
    'vt-pasture': view(22, -44, 32, -44), 'vt-keep': view(-44, -35.5, -45, -43), 'vt-mill': view(38, -2, 46, 0),
    'vt-west': view(-50, 14, -60, 14), 'vt-bridge': view(15, 11, 26, 11),
  };
  // room round everything built, round the ways, and round where she arrives (and where the camera hangs behind her)
  for (const v of Object.values(views)) placed.push([v.x, v.z, 2.5], [v.x - Math.sin(v.yaw) * 4, v.z - Math.cos(v.yaw) * 4, 2.5]);
  for (const h of VILLAGE.houses) placed.push([h.x, h.z, Math.max(h.w, h.d) * 0.62 + 1]);
  placed.push([VILLAGE.keep.x, VILLAGE.keep.z, 5.5], [VILLAGE.waterMill.house.x, VILLAGE.waterMill.house.z, 4], [VILLAGE.mill[0], VILLAGE.mill[1], 7]);
  placed.push([VILLAGE.well[0], VILLAGE.well[1], 3.5], [M.spawn.x, M.spawn.z, 3], [B.x, B.z, B.len / 2 + 2]);
  for (const [x, z, r] of VILLAGE.yards) placed.push([x, z, r]);
  { const p = VILLAGE.pasture; placed.push([(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, 6.5]); }
  for (const kind of VILLAGE.props) placed.push([kind[1], kind[2], 0.9]);
  const pathPts = [];
  for (const line of VILLAGE.paths) for (let k = 0; k < line.length - 1; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1], L = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= L; t += 0.7) pathPts.push([ax + (bx - ax) * t / L, az + (bz - az) * t / L]);
  }
  for (let i = 0; i < pathPts.length; i += 3) placed.push([pathPts[i][0], pathPts[i][1], 1.2]);

  // ------------------------------------------------------------------ trees
  await onStep('ปลูกต้นไม้');
  const r = mulberry32(seed * 31);
  const tree = (x, z, type, scale, detail = 0.8) => {
    const y = HG(x, z), rad = TRUNK[type] * scale;
    plants.push({ kind: 'tree', type, seed: 100 + plants.length, detail, x, y: y - 0.05, z, rotY: r() * 6.28, scale });
    placed.push([x, z, rad * 4]);
    colliders.push([x, z, rad + 0.22]); cameraTrunks.push([x, z, rad + 0.12, y, y + TREE_H[type] * scale]);
    shade.push([x, z, 4 * scale, 0.4]); bare.push([x, z, rad * 1.5]); castBall(x, z, TREE_H[type] * scale, 2.4 * scale, 0.7);
  };
  const bush = (x, z, scale) => { placed.push([x, z, 1]); plants.push({ kind: 'bush', type: r() < 0.35 ? 'flowering' : 'round', seed: 100 + plants.length, x, y: HG(x, z), z, rotY: r() * 6.28, scale }); colliders.push([x, z, 0.7 * scale]); };
  tree(VILLAGE.tree[0], VILLAGE.tree[1], 'oak', 2.3, 1.0);                 // the great tree first (nothing else may crowd it)
  for (const [x, z] of VILLAGE.shrubs) if (flatAt(x, z, 0.8) && !brookAt(x, z)) bush(x, z, 0.75 + r() * 0.3);
  for (const [x, z, rad] of VILLAGE.flowers) for (let k = 0; k < 4; k++) { const a = r() * 6.28, d = r() * rad; const fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d; if (flatAt(fx, fz, 0.6)) bush(fx, fz, 0.55 + r() * 0.2); }
  // the rest: thick on the low ground and round the island's edge, a few on each plateau, pines on the knoll and the knobs
  for (let i = 0; i < 2600 && plants.length < 170; i++) {
    const x = (r() - 0.5) * 2 * (half - 4), z = (r() - 0.5) * 2 * (half - 4), y = HG(x, z);
    if (y < -1 || !flatAt(x, z, 1.6) || !clear(x, z, 1.4) || brookAt(x, z) || Math.hypot(x - B.x, z - B.z) < 9) continue;
    const low = y < 2, edge = HG(x + 7, z) < y - 2 || HG(x - 7, z) < y - 2 || HG(x, z + 7) < y - 2 || HG(x, z - 7) < y - 2;
    if (!low && !edge && r() < 0.8) continue;                              // plateaus stay mostly open: room for the village
    const pick = r(), knoll = y > 12 && y < 16;
    const type = knoll || pick < 0.3 ? 'pine' : pick < 0.6 ? 'broadleaf' : pick < 0.85 ? 'oak' : 'birch';
    if (r() < 0.25) bush(x, z, 0.8 + r() * 0.5); else tree(x, z, type, 0.8 + r() * 0.5);
  }

  // ------------------------------------------------------------------ the village: stand-in buildings built in code
  await onStep('สร้างหมู่บ้าน');
  const builds = [];
  const groundUnder = (x, z, w, d, yaw) => {                               // where a building's floor sits: a little above the lowest corner
    const c = Math.cos(yaw), s = Math.sin(yaw); let lo = Infinity, hi = -Infinity;
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const h = HG(x + lx * w / 2 * c + lz * d / 2 * s, z - lx * w / 2 * s + lz * d / 2 * c); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    return lo + (hi - lo) * 0.3;
  };
  const solid = (x, z, w, d, yaw, h) => {                                  // solid to walk into, bare ground under it, and its shadow
    for (const c of BD.rectCircles(x, z, w, d, yaw)) colliders.push(c);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let lx = -w / 2 + 0.5; lx <= w / 2 - 0.4; lx += 1) for (let lz = -d / 2 + 0.5; lz <= d / 2 - 0.4; lz += 1) bare.push([x + lx * c + lz * s, z - lx * s + lz * c, 1.0]);
    castBall(x, z, h * 0.6, Math.max(w, d) * 0.6, 0.85);
  };
  for (const hd of VILLAGE.houses) {
    const g = BD.houseGeometry(hd), { w, d, height } = g.userData;
    builds.push(BD.place(g, hd.x, groundUnder(hd.x, hd.z, w, d, hd.yaw), hd.z, hd.yaw));
    solid(hd.x, hd.z, w, d, hd.yaw, height);
  }
  {                                                                        // the keep on the knoll
    const K = VILLAGE.keep;
    builds.push(BD.place(BD.towerGeometry({ s: K.s, h: K.h, seed: 55 }), K.x, groundUnder(K.x, K.z, K.s, K.s, 0) - 0.1, K.z, Math.PI / 2));
    solid(K.x, K.z, K.s, K.s, 0, K.h);
  }
  let wheel = null;
  {                                                                        // the water mill: its house on the knoll, its wheel in the stream
    const hd = VILLAGE.waterMill.house, g = BD.houseGeometry({ ...hd, floors: 1, doorX: -1.2 }), { w, d, height } = g.userData;
    builds.push(BD.place(g, hd.x, groundUnder(hd.x, hd.z, w, d, hd.yaw), hd.z, hd.yaw));
    solid(hd.x, hd.z, w, d, hd.yaw, height);
    const [wx, wz] = VILLAGE.waterMill.wheel, b = brookAt(wx + 1, wz);
    wheel = new THREE.Mesh(BD.wheelGeometry({ radius: 2.0, width: 1.0, axle: 3.2, seed: 56 }), propMaterial());
    wheel.name = 'waterWheel';
    wheel.position.set(wx, (b ? b.level : HG(wx, wz)) + 1.3, wz);
    wheel.userData.dispose = () => wheel.geometry.dispose();
    group.add(wheel);
    colliders.push([wx, wz, 1.3]);
  }
  {                                                                        // the well in the lower village
    const [x, z] = VILLAGE.well;
    builds.push(BD.place(BD.wellGeometry({ seed: 57 }), x, HG(x, z), z, 0.4));
    colliders.push([x, z, 1.15]); bare.push([x, z, 2.2]); castBall(x, z, 1.4, 1.3, 0.8);
  }
  {                                                                        // the stone bridge over the river
    builds.push(BD.place(BD.stoneBridgeGeometry({ length: B.len, seed: 58 }), B.x, bridgeY, B.z, 0));
    for (let u = -B.len / 2; u <= B.len / 2; u += 1) for (const dz of [-0.8, 0.8]) bare.push([B.x + u, B.z + dz, 1.3]);
    castBall(B.x, B.z, 0.3, 4.2, 0.7);
  }
  {                                                                        // the pasture: a fence with a gate toward the great tree
    const g = BD.fenceGeometry({ points: VILLAGE.pasture, heightAt: HG, gap: [3, 3], seed: 59 });
    for (const c of g.userData.circles) colliders.push(c);
    builds.push(g);
  }
  const woodProps = await loadLegacyWoodProps();
  let propSeed = 60;
  for (const [kind, x, z, yaw] of VILLAGE.props) {                         // the small things
    const sd = propSeed++;
    let rad = 0.7;
    if (!woodProps.place(kind, x, z, yaw, HG, sd)) {
      const g = BD.propGeometry(kind, { seed: sd });
      rad = g.userData.solid;
      builds.push(BD.place(g, x, HG(x, z) - 0.03, z, yaw));
    }
    if (rad > 0.3) { colliders.push([x, z, rad * 0.8]); press.push([x, z, rad * 1.5]); castBall(x, z, 0.5, rad * 0.9, 0.75); }
    else colliders.push([x, z, 0.22]);
  }
  group.add(woodProps.finish());
  const village = new THREE.Mesh(mergeGeometries(builds), propMaterial());
  builds.forEach(g => g.dispose());
  village.name = 'villageBuildings';
  village.userData.dispose = () => village.geometry.dispose();
  group.add(village);
  let mill = null;
  if (windmill) {                                                          // the windmill on the east shelf
    await onStep('สร้างกังหันลม');
    try {
      const [mx, mz] = VILLAGE.mill;
      mill = await loadProp(windmill, { height: 11.5, yaw: VILLAGE.millYaw, spin: { part: /^polySurface142_/, speed: 0.12 } });
      mill.object.position.set(mx, HG(mx, mz) - 0.2, mz);
      mill.object.name = 'windmill';
      group.add(mill.object);
      for (const [x, z] of mill.footprint(1)) { colliders.push([x, z, 0.62]); bare.push([x, z, 0.85]); }
      castBall(mx, mz, 8.2, 2.6, 0.85);
    } catch (e) { console.warn('windmill', e); mill = null; }
  }

  // ------------------------------------------------------------------ the ground picture, the land, the grass
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    if (Math.abs(x) > FR - 0.5 || Math.abs(z) > FR - 0.5) return [0, 0, 0];
    const earth = ss(0.7, 1.1, slope(x, z));                                // the cliffs: bare (no grass grows on them)
    const b = brookAt(x, z), sand = b ? (1 - ss(0.2, 1.4, b.d)) * (1 - ss(0.5, 0.9, slope(x, z))) : 0;      // the beds and flat banks: sand, no grass (the cliffs keep their rock)
    return [earth, sand, 0];
  };
  for (const [x, z] of pathPts) bare.push([x, z, 0.95]);
  for (const [x, z, rad] of VILLAGE.yards) for (let a = 0; a < 6.28; a += 0.9) for (let d = 0; d < rad; d += 1.2) bare.push([x + Math.cos(a) * d, z + Math.sin(a) * d, 1.1]);
  const L = new THREE.Vector3(...sun).normalize();
  const sunShadows = dir => {
    L.copy(dir).normalize();
    const dxz = Math.hypot(L.x, L.z) || 1, ly = Math.max(0.3, L.y), ux = -L.x / dxz, uz = -L.z / dxz, len = dxz / ly;
    return casters.map(([x, z, h, rr, st]) => [x + ux * len * h / 2, z + uz * len * h / 2, len * h / 2 + rr, rr * 1.1, ux, uz, st, 0]);
  };
  const map = G.createGroundMap({ radius: FR, size: 1024, seed, heightAt: HG, dirt: 0, shade, bare, press, paint, cast: sunShadows(L.clone()) });
  const fade = { far, fadeA: FR * 0.92, fadeB: FR * 1.0 };
  const terrain = G.createTerrain(field, map, fade);
  terrain.material.dispose();
  {
    const g = terrain.geometry, count = g.attributes.position.count;
    const bank = new Float32Array(count).fill(10), P = g.attributes.position;      // (how high above the water: a beach of sand along the reaches)
    for (let i = 0; i < count; i++) { const b = brookAt(P.getX(i), P.getZ(i)); if (b) bank[i] = P.getY(i) - b.level + b.d * 0.25; }
    g.setAttribute('aBank', new THREE.BufferAttribute(bank, 1));
    g.setAttribute('aPath', new THREE.BufferAttribute(new Float32Array(count), 1));
    g.computeVertexNormals();
    terrain.material = T._terrain.terrainMaterial(far, [FR, FR], 0);
    terrain.material.uniforms.uDeepOn.value = 1;                            // (the island's sides fade into the haze below it)
  }
  group.add(terrain);
  await onStep('ปลูกหญ้า');
  const grass = G.createFollowGrass({ map, field, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade });
  group.add(grass);
  if (plants.length) group.add(N.createForest(plants));

  // ------------------------------------------------------------------ the water: the valley's clear water on each reach, falls between them
  await onStep('เติมน้ำ');
  const foamTexture = await W.loadFoamTexture(), animeCells = createAnimeCells();
  const droplets = createWaterDroplets({ time: N._internal.shared.uTime });
  droplets.points.userData.dispose = droplets.dispose;
  group.add(droplets.points);
  const WL = 0 - 0.5;                                                      // (the waves are worked out on one level: the low ground's river)
  const sim = W.createWaterSim({ rect: [M.spawn.x - 24, M.spawn.z - 24, 48], size: 512, field, foamTexture, level: WL, follow: true });
  const optics = W.createWaterOptics({ level: WL });
  const waterMat = W.waterMaterial({ field, animeCells, sim, optics, foamTexture, far, ...fade });
  const ribbon = rws => {                                                  // a strip of water down a reach, each row at its own height
    const pos = [], flow = [], dir = [], idx = [], across = 8;
    let F = 0;
    rws.forEach((s, k) => {
      const a = rws[Math.max(0, k - 1)], b = rws[Math.min(rws.length - 1, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (k > 0) F += Math.hypot(s[0] - a[0], s[1] - a[1]);
      for (let i = 0; i <= across; i++) { const u = -1 + 2 * i / across, hw = s[3] + 0.5; pos.push(s[0] - tz * u * hw, s[2], s[1] + tx * u * hw); flow.push(F, u * hw, 1); dir.push(tx, tz); }
    });
    for (let k = 0; k < rws.length - 1; k++) for (let i = 0; i < across; i++) { const a = k * (across + 1) + i, b = a + across + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3)); g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, waterMat); m.renderOrder = 1; m.name = 'water';
    m.userData = { kind: 'water', dispose() { g.dispose(); } };
    group.add(m);
    return m;
  };
  const waters = WD.reaches.map(ribbon);
  // the falls: down each step, the clear water of the valley's cascades; off the island's edge, the abyss's long fall into the haze
  const cascades = [];
  for (const f of WD.falls) {
    const holder = new THREE.Group();
    holder.position.set(f.x, 0, f.z);
    holder.rotation.y = Math.atan2(f.dir[0], f.dir[1]);                     // (a fall pours along its local +z)
    if (f.bottom <= M.void + 1) {
      const fl = createAbyssFalls({ falls: [{ x: 0, z: 0, top: f.top, width: f.width + 1 }], centre: [0, 10], bottom: f.top - 45, optics: null, foamTexture });
      fl.group.userData = { kind: 'waterfall', dispose: fl.dispose };
      holder.add(fl.group);
    } else {
      const drop = f.top - f.bottom;
      const c = createWaterfall({ x: 0, z: 0, top: f.top, bottom: f.bottom - 0.2, width: f.width + 0.6, forward: Math.min(2.1, 0.8 + drop * 0.12), scale: drop > 6 ? 0.7 : 0.4, foamTexture, cells: animeCells });
      c.group.userData = { kind: 'waterfall', dispose: c.dispose };
      holder.add(c.group);
      cascades.push(c);
    }
    group.add(holder);
  }
  const ripple = (x, z, strength = 1, radius = 0.26, mode = null) => {      // something touches the water (as on the other maps)
    const kk = W.WATER_TUNE.ripple.value, foam = W.WATER_TUNE.splashFoam.value, drop = W.WATER_TUNE.drops.value;
    if (mode === 'plain') sim.impulse(x, z, radius, -0.03 * strength * kk);
    else if (mode === 'splash' || (mode === null && strength >= 1.5)) {
      if (sim.inside(x, z)) W.WATER_RINGS.add(x, z, Math.min(2, 0.7 * strength));
      sim.impulse(x, z, radius, 0.012 * strength * kk * W.WATER_TUNE.splashBump.value, Math.min(1, 0.4 * strength) * foam);
      if (drop > 0 && sim.inside(x, z)) droplets.emit(x, HG(x, z) + waterDepthAt(x, z), z, strength / 2.4 * drop, Math.round(14 * Math.min(1.5, drop)));
    } else {
      const st = mode === 'step';
      if (st) W.WATER_WAKE.add(x, z, Math.min(1.3, 0.9 * strength));
      sim.impulse(x, z, radius, (st ? -0.042 : -0.03) * strength * kk, -Math.min(st ? 0.15 : 0.55, (st ? 0.18 : 0.75) * strength) * foam);
      if (st && drop > 0 && sim.inside(x, z)) droplets.emit(x, HG(x, z) + waterDepthAt(x, z), z, 0.16 * drop * strength, strength > 1.2 ? 3 : 2);      // a footstep flicks up two or three drops
    }
  };
  const hidden = [...waters, grass, droplets.points];
  const waterSpheres = WD.reaches.map(rws => { const b = new THREE.Box3(); for (const q of rws) b.expandByPoint(new THREE.Vector3(q[0], q[2], q[1])); return b.getBoundingSphere(new THREE.Sphere()); });
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), camWorld = new THREE.Vector3();
  let frameNo = 0;
  terrain.layers.enable(W.UNDERWATER);

  // ------------------------------------------------------------------ the sun: the shadows on the ground follow it (drawn in the background)
  let castSun = L.clone(), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false;
  const cast = { dir: castSun.clone(), k: 1 };
  const inMap = (x, z) => Math.abs(x) < FR - 3 && Math.abs(z) < FR - 3;
  const walkable = (x, z) => inMap(x, z) && onIsland(x, z) && (onDeck(x, z) || slope(x, z) < 0.85) && waterDepthAt(x, z) < 0.9;
  console.info('[village] trees and bushes', plants.length);
  group.userData = { kind: 'village', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); waterMat.dispose(); sim.dispose(); optics.dispose(); map.dispose(); field.texture.dispose(); } };
  const deckOrGround = H;
  return {
    group, map, field, grass, terrain, heightAt: HG, standAt: deckOrGround, waterDepthAt, colliders, crowns: [], cameraTrunks, spawn: M.spawn, radius: FR - 3, walkable, views,
    keepClear: (x, z) => slope(x, z) > 0.6,
    name: 'หมู่บ้านขั้นบันได (heightmap)', stats: { trees: plants.length },
    optics, sim, ripple, waterLevelAt: () => WL,
    addUnderwater(obj) { obj.traverse(o => o.layers.enable(W.UNDERWATER)); },
    tapWater(origin, dir) {
      for (let t = 1; t < 70; t += 0.25) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t, ground = HG(x, z), depth = waterDepthAt(x, z);
        if (depth > 0.03 && y <= ground + depth) { ripple(x, z, 2.4, 0.36); return true; }
        if (y <= ground) return false;
      }
      return false;
    },
    confine(p) {                                                           // on her own level, off the cliffs
      if (walkable(p.x, p.z)) return;
      for (let rr = 0.15; rr <= 3; rr += 0.15) for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos(a * Math.PI / 6) * rr, z = p.z + Math.sin(a * Math.PI / 6) * rr;
        if (walkable(x, z)) { p.x = x; p.z = z; return; }
      }
    },
    update(renderer, dt, scene = null, camera = null) {
      sim.step(renderer, dt);
      droplets.update(renderer);
      if (wheel) wheel.rotation.x -= dt * 0.6;
      if (mill && mill.update) mill.update(dt);
      for (const c of cascades) c.update(renderer);
      if (scene && camera) {                                               // (the water's two pictures: only when a reach is on screen and near)
        frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        camWorld.setFromMatrixPosition(camera.matrixWorld);
        let near = Infinity;
        for (const sp of waterSpheres) if (frustum.intersectsSphere(sp)) near = Math.min(near, camWorld.distanceTo(sp.center) - sp.radius);
        frameNo++;
        const q = optics.quality, doThrough = near < 42, doMirror = q > 0 && near < 65 && frameNo % (q === 2 ? 2 : 4) === 0;
        if (doThrough || doMirror) optics.render(renderer, scene, camera, hidden, doThrough, doMirror);
      }
      const nowT = N._internal.shared.uTime.value;
      if (castBusy) { if (map.stepCast(2.5)) { castBusy = false; lastCast = nowT; cast.dir.copy(castSun); } }
      else if (nowT - lastCast > 4 && (castSun.angleTo(wantSun) > 0.075 || Math.abs(castK - wantK) > 0.12)) { castSun.copy(wantSun); castK = wantK; castBusy = true; map.beginCast(sunShadows(castSun), castK); }
    },
    setSun(dir, k = 1) { wantSun.copy(dir); wantK = k; cast.k = Math.min(1, k * 1.2); },
    get sunCast() { return cast; },
    follow(pos, lookDir) { grass.userData.follow(pos, lookDir); W.WATER_WAKE.track(pos.x, pos.z, waterDepthAt(pos.x, pos.z)); sim.focus(pos.x, pos.z); },
  };
}
