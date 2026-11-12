// blockout-level.js  —  a Mondstadt-like landscape put together from blocks of land (?map=blockout)
//
// One job: to try the land-in-blocks way of building a place (terrain-blocks.js) and the rock kit's big cliff pieces on it.
// The land: a rolling meadow with a lake; on it, blocks of land (a few shapes, used again and again, turned and overlapping):
//   - table A, 8 m: a big block, a long one and a small one joined into one table with a lobed outline; a ramp up from the meadow;
//     a spring on it whose stream falls over its edge and runs to the lake
//   - table B, 16 m: three more blocks, partly standing on A; a ramp up from A
//   - the top C, 26 m: one small block standing on B; a ramp up from B; one great tree on it, to be seen from everywhere
//   - a knoll by the lake
// The blocks are land, so grass grows on them and she walks on them. Their sides are dressed with the big cliff pieces, in the
// pale stone, and take part in the world the way every map's rocks do (rock-world.js): she stands on their heads and on the low
// ones, the meadow's grass grows on the flat tops of the mossy ones, and they can be moved by hand (the 🪨 button). The water is
// still plain (a blockout). The whole layout is the few lines of BLOCKOUT_MAP.
//
//   const level = await buildBlockoutLevel({ far, sun, grassCount, onStep });     // the same shape as the other levels

import * as THREE from 'three';
import * as N from './stylized-nature.js';
import * as G from './stylized-grassfield.js';
import * as RK from './rocks.js';
import { createTerrainBlocks } from './terrain-blocks.js';
import { createRockWorld } from './rock-world.js';
import { BLOCKOUT_MAP_LAYOUT } from './blockout-layout.js';

const { fbm3, mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const BLOCKOUT_MAP = {
  radius: 98, fieldRadius: 128,
  spawn: { x: 44, z: 54, yaw: Math.PI + 0.3 },
  // the blocks of land: shape, which of its outlines (seed), where, turned (degrees), sized, the height of its top
  blocks: [
    { shape: 'plateau', seed: 1, x: 30, z: -6, ry: 15, top: 8 },           // A
    { shape: 'spur', seed: 1, x: 52, z: -22, ry: 55, top: 8 },
    { shape: 'knob', seed: 1, x: 11, z: 6, ry: 0, s: 1.1, top: 8 },
    { shape: 'plateau', seed: 2, x: 4, z: -44, ry: -20, s: 0.95, top: 16 },      // B
    { shape: 'spur', seed: 2, x: -17, z: -35, ry: 25, top: 16 },
    { shape: 'knob', seed: 2, x: 25, z: -53, ry: 40, top: 16 },
    { shape: 'knob', seed: 3, x: -37, z: -47, ry: 10, s: 1.15, top: 26 },        // C
    { shape: 'knob', seed: 3, x: -46, z: 12, ry: 70, s: 0.8, top: 4.5 },         // the knoll
  ],
  lake: { x: -20, z: 24, r: 15, depth: 1.8, level: -0.45 },
  // ramps: a way up, through the points given, from the height of the land at its foot to the height named at its head
  ramps: [
    { pts: [[64, 22], [55, 12], [45, 2]], top: 8, half: 2.2 },             // meadow -> A
    { pts: [[22, -14], [24, -26], [12, -37]], top: 16, half: 2.0 },        // A -> B
    { pts: [[-11, -37], [-22, -32], [-31, -41]], top: 26, half: 1.9 },     // B -> C
  ],
  stream: [[27, -5], [19, 0], [10, 5], [2, 10], [-6, 16], [-12, 19]],      // the spring on A, over the edge, to the lake
};
export const BLOCKOUT_EDIT_KEY = 'liora.blockout.layout.v1';            // where this browser keeps the rocks as placed by hand
const TRUNK = { broadleaf: 0.42, oak: 0.55, pine: 0.38, birch: 0.24 }, TREE_H = { broadleaf: 7.5, oak: 7.5, pine: 7.5, birch: 8 };

export async function buildBlockoutLevel({ seed = 11, far = '#cde6f2', grassCount = 160000, sun = [-0.45, 0.62, 0.64], onStep = async () => {} } = {}) {
  const M = BLOCKOUT_MAP, FR = M.fieldRadius, CELLS = 448;
  const group = new THREE.Group(); group.name = 'blockout';

  // ------------------------------------------------------------------ the land: meadow, blocks, ramps, lake
  await onStep('ปั้นพื้นดิน');
  const blocks = createTerrainBlocks(M.blocks, { seed });
  const meadow = (x, z) => (fbm3(x * 0.03, 0.5, z * 0.03, seed, 3) - 0.5) * 3.2 + (fbm3(x * 0.11, 1.7, z * 0.11, seed + 5, 2) - 0.5) * 0.6 + Math.pow(ss(80, 125, Math.hypot(x, z)), 1.3) * 14;
  const ramps = M.ramps.map(r => {
    const segs = [];
    let L = 0;
    for (let i = 0; i < r.pts.length - 1; i++) { const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], l = Math.hypot(bx - ax, bz - az); segs.push({ ax, az, bx, bz, l, at: L }); L += l; }
    return { ...r, segs, L, foot: 0 };
  });
  const nearLine = (segs, L, x, z) => {                                    // [distance from the line, how far along it (0..1)]
    let best = 1e9, t = 0;
    for (const s of segs) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, u = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (s.l * s.l)));
      const d = Math.hypot(x - s.ax - dx * u, z - s.az - dz * u);
      if (d < best) { best = d; t = (s.at + u * s.l) / L; }
    }
    return [best, t];
  };
  const streamSegs = M.stream.slice(0, -1).map(([ax, az], i) => { const [bx, bz] = M.stream[i + 1]; return { ax, az, bx, bz, l: Math.hypot(bx - ax, bz - az), at: 0 }; });
  const nearStream = (x, z) => nearLine(streamSegs, 1, x, z)[0];
  const lakeIn = (x, z) => {                                               // how far inside the lake's outline, metres
    const a = Math.atan2(z - M.lake.z, x - M.lake.x);
    return M.lake.r * (1 + 0.35 * (fbm3(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 4.2, seed + 77, 3) - 0.5)) - Math.hypot(x - M.lake.x, z - M.lake.z);
  };
  const landNoRamps = (x, z) => {
    let h = blocks.stamp(meadow(x, z), x, z);
    const li = lakeIn(x, z);
    if (li > -3) h = lerp(h, Math.min(h, M.lake.level - M.lake.depth * ss(0, 6, li)), ss(-3, 0.5, li));
    return h;
  };
  for (const r of ramps) r.foot = landNoRamps(r.pts[0][0], r.pts[0][1]);
  const heightFn = (x, z) => {
    let h = landNoRamps(x, z);
    for (const r of ramps) {
      const [d, t] = nearLine(r.segs, r.L, x, z);
      if (d > r.half + 7) continue;
      const hr = lerp(r.foot, r.top, ss(0, 1, t) * 0.25 + t * 0.75);      // (eases off at its foot)
      h = lerp(h, hr, 1 - ss(r.half, r.half + 6.5, d));                    // the way up, and the land sloping away either side of it
    }
    return h;
  };
  const field = G.createHeightField({ radius: FR, cells: CELLS, heightFn });
  const H = field.heightAt;
  const slope = (x, z) => Math.hypot(H(x + 0.5, z) - H(x - 0.5, z), H(x, z + 0.5) - H(x, z - 0.5));
  const onRamp = (x, z, pad = 0) => ramps.some(r => nearLine(r.segs, r.L, x, z)[0] < r.half + pad);
  const waterDepthAt = (x, z) => lakeIn(x, z) > -3 ? Math.max(0, M.lake.level - H(x, z)) : 0;

  // ------------------------------------------------------------------ the cliffs: the big pieces round every block, in the pale stone
  await onStep('ตั้งหน้าผา');
  const rockList = blocks.dress(H, { skip: (x, z) => nearStream(x, z) < 3.2 || onRamp(x, z, 3.5) });
  // in the world (rock-world.js, the same on every map): placed by hand over what the blocks put down, drawn, each one's footprint
  // on the land, where she stands on them, the meadow's grass on their tops; a piece moved by hand to a block's edge can be fitted to it
  const walkLand = (x, z) => Math.hypot(x, z) < M.radius && waterDepthAt(x, z) < 0.9 && slope(x, z) < 0.85;
  const rw = createRockWorld({ group, list: rockList, heightAt: H, walkLand, waterDepthAt, waterLevelAt: () => M.lake.level, seed,
    key: BLOCKOUT_EDIT_KEY, committed: BLOCKOUT_MAP_LAYOUT, tone: 'pale' });
  const { colliders, shade, bare, press, casters, cameraTrunks, inRock, onRockTop, standAt } = rw;

  const top = M.blocks[6];      // (the places 📍 offers: no tree right in front of them)
  const views = {
    start: M.spawn,
    'bo-meadow': M.spawn, 'bo-lake': { x: -2, z: 34, yaw: -2.2 }, 'bo-falls': { x: -1, z: 25, yaw: 2.6 }, 'bo-a': { x: 36, z: -2, yaw: Math.PI + 0.5 },
    'bo-b': { x: 6, z: -42, yaw: -1.75 }, 'bo-ridge': { x: -22, z: -32, yaw: -2.2 }, 'bo-peak': { x: top.x + 5, z: top.z + 5, yaw: 0.75 },
    'bo-foot': { x: 22, z: 30, yaw: Math.PI + 0.1 },
  };

  // ------------------------------------------------------------------ trees: copses on the meadow and on the tables, one great one on the top
  await onStep('ปลูกต้นไม้');
  const plants = [];
  {
    const r = mulberry32(seed * 31), types = ['broadleaf', 'oak', 'pine', 'birch'];
    const tree = (x, z, type, scale) => {
      const y = H(x, z), rad = TRUNK[type] * scale;
      plants.push({ kind: 'tree', type, seed: 100 + plants.length, detail: 0.8, x, y: y - 0.05, z, rotY: r() * 6.28, scale });
      colliders.push([x, z, rad + 0.22]); cameraTrunks.push([x, z, rad + 0.12, y, y + TREE_H[type] * scale]);
      shade.push([x, z, 4 * scale, 0.4]); bare.push([x, z, rad * 1.5]); casters.push([x, z, TREE_H[type] * scale, 2.4 * scale, 0.7]);
    };
    const flat = (x, z) => Math.max(slope(x, z), slope(x + 2.5, z), slope(x - 2.5, z), slope(x, z + 2.5), slope(x, z - 2.5)) < 0.45;      // (not at a brink, not at a foot)
    const ok = (x, z, pad = 2) => Math.hypot(x, z) < M.radius - 4 && flat(x, z) && !inRock(x, z) && !onRockTop(x, z) && waterDepthAt(x, z) === 0 && lakeIn(x, z) < -3 && !onRamp(x, z, pad) && nearStream(x, z) > 3
      && Object.values(views).every(v => Math.hypot(x - v.x - Math.sin(v.yaw) * 5, z - v.z - Math.cos(v.yaw) * 5) > 8);
    for (let i = 0; i < 400 && plants.length < 70; i++) {
      const x = (r() - 0.5) * 2 * (M.radius - 6), z = (r() - 0.5) * 2 * (M.radius - 6);
      if (fbm3(x * 0.035, 3.3, z * 0.035, seed + 9, 2) < 0.55 || !ok(x, z)) continue;
      tree(x, z, types[Math.floor(r() * 4)], 0.85 + r() * 0.4);
    }
    tree(top.x - 1, top.z - 1.5, 'oak', 1.9);                               // the landmark
  }

  // ------------------------------------------------------------------ the ground's colour, the grass
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    if (Math.hypot(x, z) > FR - 2) return [0, 0, 0];
    let earth = ss(0.9, 1.3, slope(x, z));                                  // the blocks' own sides: bare (what shows between the rocks reads as a deep crack)
    if (earth > 0) earth *= ss(0.5, 1.7, Math.max(H(x + 1.2, z), H(x - 1.2, z), H(x, z + 1.2), H(x, z - 1.2)) - H(x, z));      // (the grass hangs a little way down over the brink)
    const li = lakeIn(x, z), sand = li > -3.5 ? ss(-3.5, -0.5, li) : 0;
    let mow = 0;
    for (const r of ramps) { const [d] = nearLine(r.segs, r.L, x, z); mow = Math.max(mow, 1 - ss(r.half * 0.5, r.half + 0.6, d)); }      // the ramps: trodden grass
    return [earth, sand, mow];
  };
  const L = new THREE.Vector3(...sun).normalize();
  const sunShadows = dir => {
    L.copy(dir).normalize();
    const dxz = Math.hypot(L.x, L.z) || 1, ly = Math.max(0.3, L.y), ux = -L.x / dxz, uz = -L.z / dxz, len = dxz / ly;
    return casters.map(([x, z, h, r, st]) => [x + ux * len * h / 2, z + uz * len * h / 2, len * h / 2 + r, r * 1.1, ux, uz, st, 0]);
  };
  const map = G.createGroundMap({ radius: FR, size: 1024, seed, heightAt: H, dirt: 0, lawn: true, grow: rw.grow, shade, bare, press, paint, cast: sunShadows(L.clone()),
    colors: { ...G.GROUND_COLORS, deep: '#55924a', mid: '#7cae40', sunny: '#9fc84a', shade: '#447a3c', dirt: '#73829f', dirtRim: '#7d8f7e' } });
  const fade = { far, fadeA: FR * 0.8, fadeB: FR * 0.985 };
  const terrain = G.createTerrain(field, map, fade);
  group.add(terrain);
  await onStep('ปลูกหญ้า');
  rw.useLawn(map);
  const grass = G.createFollowGrass({ map, field: rw.grassField(field), count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade });
  group.add(grass);
  if (plants.length) group.add(N.createForest(plants));

  // ------------------------------------------------------------------ the water, plain (a blockout): the lake, and the stream draped over the land
  {
    const blue = new THREE.MeshBasicMaterial({ color: '#4fa8d8', transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide });
    const lake = new THREE.Mesh(new THREE.CircleGeometry(M.lake.r * 1.5, 64).rotateX(-Math.PI / 2), blue);
    lake.position.set(M.lake.x, M.lake.level, M.lake.z); lake.renderOrder = 1;
    lake.userData = { dispose() { lake.geometry.dispose(); } };
    group.add(lake);
    const pos = [], idx = [], line = [];
    for (let i = 0; i < M.stream.length - 1; i++) {
      const [ax, az] = M.stream[i], [bx, bz] = M.stream[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
      for (let k = 0; k < n; k++) line.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
    }
    line.push(M.stream[M.stream.length - 1]);
    line.forEach(([x, z], k) => {
      const [nx, nz] = line[Math.min(line.length - 1, k + 1)], [px, pz] = line[Math.max(0, k - 1)], dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1, w = 1.1;
      for (const s of [-1, 1]) { const x2 = x - dz / l * w * s, z2 = z + dx / l * w * s; pos.push(x2, H(x2, z2) + 0.12, z2); }
      if (k) idx.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, k * 2, k * 2 + 1, (k - 1) * 2 + 1);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const stream = new THREE.Mesh(g, blue); stream.renderOrder = 1;
    stream.userData = { dispose() { g.dispose(); blue.dispose(); } };
    group.add(stream);
  }

  // ------------------------------------------------------------------ the sun: the shadows on the ground follow it (drawn in the background), the rocks' light too
  let castSun = L.clone(), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false;
  const cast = { dir: castSun.clone(), k: 1 };
  RK.setRockSun(L);
  const walkable = (x, z) => Math.hypot(x, z) < M.radius && (onRockTop(x, z) || (waterDepthAt(x, z) < 0.9 && slope(x, z) < 0.85 && !inRock(x, z)));
  const st = rw.stats;
  console.info('[blockout] blocks', M.blocks.length, '; rocks', st.rocks, 'in', st.shapes, 'shapes,', Math.round(st.triangles / 1000) + 'k triangles in full; rock tops she can stand on', st.standM2, 'm2, grass on', st.grassM2, 'm2; trees', plants.length);
  group.userData = { kind: 'blockout', dispose() {
    group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); });
    map.dispose(); field.texture.dispose(); rw.dispose();
  } };
  const optics = { quality: 0, setQuality() {} };                          // (no water optics in a blockout)
  return {
    group, map, field, grass, terrain, heightAt: H, standAt, waterDepthAt, colliders, crowns: [], cameraTrunks, spawn: M.spawn, radius: M.radius, walkable, views,
    keepClear: (x, z, r = 0) => onRamp(x, z, r) || slope(x, z) > 0.6 || inRock(x, z) || onRockTop(x, z),
    name: 'Blockout มอนด์', stats: { blocks: M.blocks.length, rocks: st.rocks, shapes: st.shapes, triangles: st.triangles, trees: plants.length },
    get rocks() { return rw.kit; }, rockEdit: rw.edit, optics, waterLevelAt: () => M.lake.level, ripple() {}, tapWater() { return false; },
    addUnderwater() {},
    confine(p) {                                                           // off the cliffs' faces, off the rocks, out of deep water
      if (walkable(p.x, p.z)) return;
      for (let r = 0.15; r <= 3; r += 0.15) for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos(a * Math.PI / 6) * r, z = p.z + Math.sin(a * Math.PI / 6) * r;
        if (walkable(x, z)) { p.x = x; p.z = z; return; }
      }
    },
    update(renderer, dt, scene = null, camera = null) {
      rw.update(renderer, camera, { terrain, size: FR * 2 });                 // (the ground's height for the rocks' paint, drawn once; each rock as finely as its distance calls for)
      const nowT = N._internal.shared.uTime.value;
      if (castBusy) { if (map.stepCast(2.5)) { castBusy = false; lastCast = nowT; cast.dir.copy(castSun); } }
      else if (nowT - lastCast > 4 && (castSun.angleTo(wantSun) > 0.075 || Math.abs(castK - wantK) > 0.12)) { castSun.copy(wantSun); castK = wantK; castBusy = true; map.beginCast(sunShadows(castSun), castK); }
    },
    setSun(dir, k = 1) { wantSun.copy(dir); wantK = k; cast.k = Math.min(1, k * 1.2); RK.setRockSun(dir); },
    get sunCast() { return cast; },
    follow(pos, lookDir) { grass.userData.follow(pos, lookDir); },
  };
}
