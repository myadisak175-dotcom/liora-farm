// rocks-level.js  —  a small test map for the stylized rocks (rocks.js, sections 5–7), with the game's own grass, ground, water
// and light  (?map=rocks)
//
// One job: to see the rocks in the world they will live in, before they go into the real maps. A clearing in the middle (the
// rocks put together in rock-builder.html stand here, if this browser has any), a bank to the north with cliff pieces sunk into
// it, a pond to the east with stones standing in the water, a stream coming down into it with stepping stones across, and two
// trodden dirt paths (ground-paths.js): from the start down to the pond's beach, and from there up to the foot of the cliffs.
//
//   const level = await buildRocksLevel({ far, sun, grassCount, onStep });     // the same shape as the other levels
//   ?layout=demo   leaves the builder's rocks out (only this map's own)
//
// How a rock takes part in the world (rockFootprint below, the same for every rock): the ground under it is cut into one-metre
// cells. Each cell it stands on is solid (she walks round it), grows no grass, has the grass round it pressed down and its
// ground shaded (the dark at the foot that sets a rock on the ground), throws a shadow with the sun, and keeps the water's waves
// out (so the water swells and foams round it). The rocks also know the ground's height (their foot shading and moss go by it)
// and the water's level (a wet band at the waterline, greener under the water).

import * as THREE from 'three';
import * as N from './stylized-nature.js';
import * as G from './stylized-grassfield.js';
import * as W from './stylized-water.js';
import * as RK from './rocks.js';
import { createPaths } from './ground-paths.js';
import { createAnimeCells } from './anime-cells.js';
import { createWaterDroplets } from './water-droplets.js';

const { fbm3, mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const ROCKS_MAP = {
  radius: 44, fieldRadius: 70,
  spawn: { x: 2, z: 17, yaw: Math.PI + 0.25 },
  clearing: { x: 0, z: 4, r: 11 },                                         // the builder's rocks stand here
  paths: [{ points: [[2, 24], [3, 16], [5, 10], [8.5, 5], [12.5, 2.5], [15.5, 2]], half: 1.25 },
    { points: [[5, 10], [0.5, 7.5], [-3.5, 2], [-6, -4.5], [-5.5, -10.5]], half: 1.0 }],
  bank: { z: -16, top: 6.5 },                                              // the land rises north of here into a bank
  // the stream and the pond: x, z, water level, half width, depth
  stream: [[46, -46, 1.7, 1.3, 0.35], [38, -32, 1.1, 1.4, 0.35], [31, -19, 0.35, 1.7, 0.4], [26, -9, -0.4, 4.2, 0.9], [22, 1, -0.5, 8, 1.4],
    [22, 9, -0.5, 6, 1.2], [26, 18, -0.62, 2.4, 0.5], [34, 31, -1.1, 1.5, 0.35], [44, 45, -1.8, 1.5, 0.35]],
};
// the map's own rocks: type, seed, x, z, turn (degrees), size, how deep the foot is sunk (m)
const DEMO = [
  // cliff pieces along the bank, faces to the south
  ['wall', 3, -14, -19.5, 4, 1.5, 1.4], ['wall', 8, -5.5, -20.5, -6, 1.7, 1.6], ['spire', 4, 0.5, -22, 20, 1.5, 1.2], ['corner', 6, -22, -17.5, 30, 1.4, 1.4],
  ['overhang', 2, 7.5, -19, -10, 1.4, 0.8], ['steps', 5, 14, -17, -25, 1.2, 0.9],
  ['boulder', 11, -9, -14, 40, 0.9, 0.3], ['stone', 12, -2, -15, 10, 1.2, 0.15], ['pebbles', 13, -11.5, -13.5, 0, 1.1, 0.05],
  // round the clearing
  ['boulder', 21, -12, 8, 70, 1.0, 0.3], ['stone', 22, -10.5, 11, 15, 1.3, 0.15], ['pillar', 23, 11, 12, 0, 0.9, 0.3],
  // the pebbles on the pond's beach
  ['pebbles', 35, 13.5, 1.5, 0, 1.3, 0.05], ['pebbles', 36, 15, 10, 40, 1.0, 0.05],
];
// rocks standing in the water: found by walking out from the pond's middle (22, 2) along a bearing (degrees) until the water is
// this shallow, so they stand on the bed and break the surface
const IN_WATER = [['boulder', 31, 200, 0.55, 20, 1.2, 0.25], ['stone', 32, 70, 0.4, 80, 1.5, 0.15], ['stone', 33, 135, 0.35, 10, 1.1, 0.1],
  ['ledge', 34, -20, 0.5, -30, 0.85, 0.2], ['boulder', 37, 250, 0.9, 50, 1.4, 0.3]];

export async function buildRocksLevel({ seed = 6, far = '#cde6f2', grassCount = 160000, sun = [-0.45, 0.62, 0.64], onStep = async () => {} } = {}) {
  const M = ROCKS_MAP, FR = M.fieldRadius, CELLS = 280, STEP = FR * 2 / CELLS, NV = CELLS + 1;
  const group = new THREE.Group(); group.name = 'rocksTest';

  // ------------------------------------------------------------------ water: the nearest point of the stream for every grid point
  await onStep('ขุดลำธารและบ่อน้ำ');
  const stream = densify(M.stream, 0.5);
  const wEdge = new Float32Array(NV * NV), wLevel = new Float32Array(NV * NV), wDepth = new Float32Array(NV * NV);
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const x = -FR + i * STEP, z = -FR + j * STEP;
    let best = 1e9, bi = 0;
    for (let k = 0; k < stream.length; k++) { const s = stream[k], d = Math.hypot(x - s[0], z - s[1]) - s[3]; if (d < best) { best = d; bi = k; } }
    const o = j * NV + i;
    wEdge[o] = best + (fbm3(x * 0.16, 5.5, z * 0.16, seed + 41, 2) - 0.5) * Math.min(2.6, stream[bi][3] * 0.5);
    wLevel[o] = stream[bi][2]; wDepth[o] = stream[bi][4];
  }
  const gridAt = (arr, x, z) => {
    const fx = Math.min(CELLS - 1e-4, Math.max(0, (x + FR) / STEP)), fz = Math.min(CELLS - 1e-4, Math.max(0, (z + FR) / STEP));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * NV + i;
    return (arr[o] * (1 - u) + arr[o + 1] * u) * (1 - v) + (arr[o + NV] * (1 - u) + arr[o + NV + 1] * u) * v;
  };

  // ------------------------------------------------------------------ the land: a level clearing, a bank to the north, banks round the water
  await onStep('ปั้นพื้นดิน');
  const paths = createPaths({ paths: M.paths, seed });
  const heightFn = (x, z) => {
    const r = Math.hypot(x, z);
    let h = (fbm3(x * 0.04, 0.5, z * 0.04, seed, 3) - 0.5) * 2.2 + (fbm3(x * 0.12, 1.7, z * 0.12, seed + 5, 2) - 0.5) * 0.5;
    h += M.bank.top * ss(M.bank.z + 3, M.bank.z - 7, z + (fbm3(x * 0.07, 2.2, 0, seed + 3, 2) - 0.5) * 6);    // the bank the cliffs stand in
    h = lerp(h, 0.3, 1 - ss(M.clearing.r, M.clearing.r + 9, Math.hypot(x - M.clearing.x, z - M.clearing.z)));
    h += Math.pow(ss(44, 68, r), 1.3) * 9;                                   // the land rises at the map's edge
    const o = Math.round((z + FR) / STEP) * NV + Math.round((x + FR) / STEP), e = wEdge[o], lv = wLevel[o];
    if (e < 8) {
      h = lerp(h, Math.max(h, lv + 0.3 + Math.max(0, e) * 0.1), 1 - ss(4.5, 8, e));
      h = lerp(h, lv - wDepth[o], ss(1.5, -0.9 - wDepth[o] * 2.6, e));
    }
    return h + paths.sink(x, z);
  };
  const field = G.createHeightField({ radius: FR, cells: CELLS, heightFn });
  const H = field.heightAt;
  const waterDepthAt = (x, z) => gridAt(wEdge, x, z) < 1.5 ? Math.max(0, gridAt(wLevel, x, z) - H(x, z)) : 0;

  // ------------------------------------------------------------------ the rocks
  await onStep('วางหิน');
  const colliders = [], shade = [], bare = [], press = [], casters = [], solid = new Set();
  const rocks = new THREE.Group(); rocks.name = 'rocks';
  const placeRock = ({ type, seed: sd, x, z, ry = 0, rx = 0, rz = 0, s = 1, y = null, sink = 0 }) => {
    const m = RK.createPropRock({ type, seed: sd, world: true });
    m.position.set(x, y ?? H(x, z) - sink, z);
    m.rotation.set(rx * Math.PI / 180, ry * Math.PI / 180, rz * Math.PI / 180, 'YXZ');
    m.scale.setScalar(s);
    m.updateMatrixWorld(true);
    rocks.add(m);
    rockFootprint(m);
    return m;
  };
  // the cells a rock stands on (a cell is taken if a point of its surface comes down to within half a metre of the ground there),
  // and how tall it is over each
  const rockFootprint = m => {
    const pos = m.geometry.attributes.position, v = new THREE.Vector3(), cells = new Map();
    for (let i = 0; i < pos.count; i += 2) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const cx = Math.floor(v.x), cz = Math.floor(v.z), key = cx + ',' + cz, g = H(cx + 0.5, cz + 0.5);
      const c = cells.get(key) || { cx, cz, low: Infinity, top: -Infinity };
      c.low = Math.min(c.low, v.y - g); c.top = Math.max(c.top, v.y - g);
      cells.set(key, c);
    }
    for (const c of cells.values()) {
      if (c.low > 0.5 || c.top < 0.08) continue;                            // an overhang above the ground, or a sliver at its foot
      const x = c.cx + 0.5, z = c.cz + 0.5;
      if (c.top > 0.35) { colliders.push([x, z, 0.62]); solid.add(c.cx + ',' + c.cz); }
      bare.push([x, z, 0.55]); press.push([x, z, 1.25]); shade.push([x, z, 1.3, Math.min(0.55, 0.2 + c.top * 0.12)]);
      casters.push([x, z, c.top * 0.5, 0.62, 0.85]);
    }
  };
  for (const [type, sd, x, z, ry, s, sink] of DEMO) placeRock({ type, seed: sd, x, z, ry, s, sink });
  for (const [type, sd, bearing, depth, ry, s, sink] of IN_WATER) {
    const a = bearing * Math.PI / 180;
    let x = 22, z = 2;
    for (let r = 0; r < 14 && waterDepthAt(x, z) > depth; r += 0.25) { x = 22 + Math.cos(a) * r; z = 2 + Math.sin(a) * r; }
    placeRock({ type, seed: sd, x, z, ry, s, sink });
  }
  // stepping stones across the stream, their tops just out of the water
  {
    const x = 31.2, z = -18.6;
    placeRock({ type: 'paving', seed: 41, x, z, ry: 58, s: 1.35, y: gridAt(wLevel, x, z) - 0.12 });
  }
  // the rocks put together in the builder (this browser's last layout), set in the clearing
  let fromBuilder = 0;
  if (!new URLSearchParams(location.search).has('layout')) {
    try {
      const d = JSON.parse(localStorage.getItem('rockBuilder.v1') || 'null');
      for (const p of (d && d.pieces) || []) {
        if (!RK.PROP_ROCK_TYPES.some(t => t.key === p.type)) continue;
        const x = M.clearing.x + (+p.x || 0), z = M.clearing.z + (+p.z || 0);
        placeRock({ type: p.type, seed: p.seed | 0 || 1, x, z, ry: +p.ry || 0, rx: +p.rx || 0, rz: +p.rz || 0, s: +p.s || 1, y: H(x, z) + (+p.y || 0) });
        fromBuilder++;
      }
    } catch { /* no builder layout in this browser */ }
  }
  for (const st of paths.stones()) placeRock(st);                         // flat stones set into the paths, pebbles by their sides
  group.add(rocks);

  // ------------------------------------------------------------------ the ground's colour (sand by the water, earth under the bank), shadows
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    if (Math.hypot(x, z) > 68) return [0, 0, 0];
    const e = gridAt(wEdge, x, z), wide = ss(0.5, 1.4, gridAt(wDepth, x, z));
    const sand = e < 4 ? 1 - ss(wide * 1.5, 0.5 + wide * 3, e) : 0;
    let earth = ss(0.95, 1.4, slope(x, z)) * 0.7, mow = 0;                 // where the bank is steepest the grass gives up
    const pp = paths.paint(x, z);
    if (pp) { earth = Math.max(earth, pp[0]); mow = pp[2]; }
    return [earth, sand, mow];
  };
  const slope = (x, z) => Math.hypot(H(x + 0.5, z) - H(x - 0.5, z), H(x, z + 0.5) - H(x, z - 0.5));
  const L = new THREE.Vector3(...sun).normalize();
  const sunShadows = dir => {
    L.copy(dir).normalize();
    const dxz = Math.hypot(L.x, L.z) || 1, ly = Math.max(0.3, L.y), ux = -L.x / dxz, uz = -L.z / dxz, len = dxz / ly;
    return casters.map(([x, z, h, r, st]) => [x + ux * len * h, z + uz * len * h, r / ly * 1.02 + len * h * 0.5, r, ux, uz, st, 0]);
  };
  const map = G.createGroundMap({ radius: FR, size: 1024, seed, heightAt: H, dirt: 0, shade, bare, press, paint, cast: sunShadows(L.clone()),
    colors: { ...G.GROUND_COLORS, deep: '#55924a', mid: '#7cae40', sunny: '#9fc84a', shade: '#447a3c' } });
  const fade = { far, fadeA: FR * 0.8, fadeB: FR * 0.985 };
  const terrain = G.createTerrain(field, map, fade);
  group.add(terrain);
  group.add(paths.ribbon(H, map));
  { let fs = seed * 71; const pal = [['#f4a6bc', '#f6f2e6'], ['#f7d84a', '#f6f2e6'], ['#b9a3e8', '#93b8ee']];
    for (const [x, z, r] of paths.flowers) group.add(N.createFlowers({ count: Math.round(30 * r), radius: r, seed: ++fs, heightAt: H, center: [x, z], colors: pal[fs % 3] })); }

  // ------------------------------------------------------------------ the water: a ribbon along the stream, wide over the pond
  await onStep('เติมน้ำ');
  const foamTexture = await W.loadFoamTexture();
  const animeCells = createAnimeCells();
  const droplets = createWaterDroplets({ time: N._internal.shared.uTime });
  droplets.points.userData.dispose = droplets.dispose;
  group.add(droplets.points);
  const ACROSS = 48, wpos = [], wflow = [], wdir = [], widx = [];
  let F = 0;
  for (let k = 0; k < stream.length; k++) {
    const s = stream[k], a = stream[Math.max(0, k - 1)], b = stream[Math.min(stream.length - 1, k + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const half = s[3] + 2.4 + Math.min(2.6, s[3] * 0.5) * 0.6, streaminess = 1 - ss(2.6, 6.5, s[3]);
    if (k > 0) F += Math.hypot(s[0] - a[0], s[1] - a[1]) * W.FLOW.pond / lerp(W.FLOW.pond, W.FLOW.stream, streaminess);
    for (let i = 0; i <= ACROSS; i++) { const u = -1 + 2 * i / ACROSS; wpos.push(s[0] - tz * u * half, s[2], s[1] + tx * u * half); wflow.push(F, u * half, streaminess); wdir.push(tx, tz); }
  }
  for (let k = 0; k < stream.length - 1; k++) for (let i = 0; i < ACROSS; i++) { const a = k * (ACROSS + 1) + i, b = a + ACROSS + 1; widx.push(a, b, a + 1, b, b + 1, a + 1); }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wg.setAttribute('aFlow', new THREE.Float32BufferAttribute(wflow, 3));
  wg.setAttribute('aDir', new THREE.Float32BufferAttribute(wdir, 2));
  wg.setIndex(widx);
  // the waves run round the rocks that stand in the water (and swell and foam against them)
  const inRock = (x, z) => solid.has(Math.floor(x) + ',' + Math.floor(z));
  const sim = W.createWaterSim({ rect: [4, -24, 44], size: 512, field, foamTexture, level: -0.5, mask: (x, z) => waterDepthAt(x, z) > 0.03 && !inRock(x, z) });
  const optics = W.createWaterOptics({ level: -0.5 });
  const water = new THREE.Mesh(wg, W.waterMaterial({ field, animeCells, sim, optics, foamTexture, ...fade }));
  water.name = 'water'; water.renderOrder = 1;
  water.userData = { kind: 'water', dispose() { wg.dispose(); water.material.dispose(); sim.dispose(); optics.dispose(); } };
  group.add(water);
  // the water's level for the rocks' paint (rocks.js section 7): a small picture over the map, no water = -10000
  {
    const S = 256, data = new Uint16Array(S * S), x0 = -FR, z1 = FR, step = FR * 2 / S;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = x0 + (i + 0.5) * step, z = z1 - (j + 0.5) * step;
      data[j * S + i] = THREE.DataUtils.toHalfFloat(gridAt(wEdge, x, z) < 3 ? gridAt(wLevel, x, z) : -1e4);
    }
    const tex = new THREE.DataTexture(data, S, S, THREE.RedFormat, THREE.HalfFloatType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    RK.setRockWater({ texture: tex, x0, z1, size: FR * 2 });
    water.userData.levelTex = tex;
  }
  const ripple = (x, z, strength = 1, radius = 0.26, mode = null) => {
    const k = W.WATER_TUNE.ripple.value, foam = W.WATER_TUNE.splashFoam.value, drop = W.WATER_TUNE.drops.value;
    if (mode === 'plain') sim.impulse(x, z, radius, -0.03 * strength * k);
    else if (mode === 'splash' || (mode === null && strength >= 1.5)) {
      if (sim.inside(x, z)) W.WATER_RINGS.add(x, z, Math.min(2, 0.7 * strength));
      sim.impulse(x, z, radius, 0.012 * strength * k * W.WATER_TUNE.splashBump.value, Math.min(1, 0.4 * strength) * foam);
      if (drop > 0 && sim.inside(x, z)) droplets.emit(x, gridAt(wLevel, x, z), z, strength / 2.4 * drop, Math.round(14 * Math.min(1.5, drop)));
    } else {
      const st = mode === 'step';
      if (st) W.WATER_WAKE.add(x, z, Math.min(1.3, 0.9 * strength));
      sim.impulse(x, z, radius, (st ? -0.042 : -0.03) * strength * k, -Math.min(st ? 0.15 : 0.55, (st ? 0.18 : 0.75) * strength) * foam);
      if (st && drop > 0 && sim.inside(x, z)) droplets.emit(x, gridAt(wLevel, x, z), z, 0.16 * drop * strength, strength > 1.2 ? 3 : 2);
    }
  };

  // ------------------------------------------------------------------ grass, and a few trees beyond
  await onStep('ปลูกหญ้า');
  const grass = G.createFollowGrass({ map, field, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade });
  group.add(grass);
  const plants = [];
  { const r = mulberry32(seed * 31); for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = 38 + r() * 18, x = Math.cos(a) * d, z = Math.sin(a) * d; if (gridAt(wEdge, x, z) < 4) continue; plants.push({ kind: 'tree', type: ['broadleaf', 'oak', 'pine', 'birch'][i % 4], seed: 100 + i, detail: 0.8, x, y: H(x, z) - 0.05, z, rotY: r() * 6.28, scale: 0.9 + r() * 0.3 }); } }
  if (plants.length) group.add(N.createForest(plants));

  // ------------------------------------------------------------------ the sun: shadows on the ground follow it (drawn in the background)
  let castSun = L.clone(), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false;
  const cast = { dir: castSun.clone(), k: 1 };
  terrain.layers.enable(W.UNDERWATER);
  rocks.traverse(o => o.layers.enable(W.UNDERWATER));
  const hidden = [water, grass, droplets.points];
  const waterSpheres = [new THREE.Sphere(new THREE.Vector3(22, -0.5, 4), 14), new THREE.Sphere(new THREE.Vector3(34, 0.5, -26), 12), new THREE.Sphere(new THREE.Vector3(34, -1, 30), 10)];
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), camWorld = new THREE.Vector3();
  let frameNo = 0, baked = false;
  const walkable = (x, z) => Math.hypot(x, z) < M.radius && waterDepthAt(x, z) < 0.9 && !inRock(x, z) && slope(x, z) < 0.85;
  const views = {
    start: M.spawn,
    'rk-clearing': { x: 0, z: 13, yaw: Math.PI }, 'rk-cliff': { x: -4, z: -8, yaw: Math.PI }, 'rk-pond': { x: 11, z: 3, yaw: Math.PI / 2 },
    'rk-stream': { x: 28, z: -13, yaw: Math.PI * 0.85 }, 'rk-path': { x: 3.5, z: 19, yaw: Math.PI + 0.3 },
  };
  console.info('[rocks] map rocks', DEMO.length, 'from the builder', fromBuilder, 'solid cells', solid.size, 'shadow casters', casters.length);
  group.userData = { kind: 'rocksTest', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); map.dispose(); field.texture.dispose(); if (water.userData.levelTex) water.userData.levelTex.dispose(); RK.setRockWater({}); } };
  return {
    group, map, field, grass, terrain, heightAt: H, waterDepthAt, colliders, crowns: [], cameraTrunks: [], spawn: M.spawn, radius: M.radius, walkable, views,
    keepClear: (x, z, r = 0) => { const q = paths.near(x, z); return q.d < q.half * 1.3 + r; },      // nothing grows on the paths
    name: 'ทดสอบหิน', stats: { rocks: rocks.children.length, fromBuilder },
    ripple, sim, optics, waterLevelAt: (x, z) => gridAt(wLevel, x, z),
    addUnderwater(obj) { obj.traverse(o => o.layers.enable(W.UNDERWATER)); },
    confine(p) {                                                           // a step back off a rock, out of deep water, off the steep bank
      if (walkable(p.x, p.z)) return;
      for (let r = 0.15; r <= 3; r += 0.15) for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos(a * Math.PI / 6) * r, z = p.z + Math.sin(a * Math.PI / 6) * r;
        if (walkable(x, z)) { p.x = x; p.z = z; return; }
      }
    },
    update(renderer, dt, scene = null, camera = null) {
      // the ground's height for the rocks' paint, drawn once (the terrain from straight above)
      if (!baked) { baked = true; RK.bakeGroundForRocks(renderer, [terrain], { center: [0, 0], size: FR * 2, res: 1024 }); }
      sim.step(renderer, dt);
      droplets.update(renderer);
      const nowT = N._internal.shared.uTime.value;
      if (castBusy) { if (map.stepCast(2.5)) { castBusy = false; lastCast = nowT; cast.dir.copy(castSun); } }
      else if (nowT - lastCast > 4 && (castSun.angleTo(wantSun) > 0.075 || Math.abs(castK - wantK) > 0.12)) { castSun.copy(wantSun); castK = wantK; castBusy = true; map.beginCast(sunShadows(castSun), castK); }
      if (!scene || !camera) return;
      frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      camWorld.setFromMatrixPosition(camera.matrixWorld);
      let near = Infinity;
      for (const sp of waterSpheres) if (frustum.intersectsSphere(sp)) near = Math.min(near, camWorld.distanceTo(sp.center) - sp.radius);
      frameNo++;
      const q = optics.quality, doThrough = near < 42, doMirror = q > 0 && near < 65 && frameNo % (q === 2 ? 2 : 4) === 0;
      if (doThrough || doMirror) optics.render(renderer, scene, camera, hidden, doThrough, doMirror);
    },
    setSun(dir, k = 1) { wantSun.copy(dir); wantK = k; cast.k = Math.min(1, k * 1.2); },
    get sunCast() { return cast; },
    tapWater(origin, dir) {
      for (let t = 1; t < 70; t += 0.25) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t, ground = H(x, z), depth = waterDepthAt(x, z);
        if (depth > 0.03 && y <= ground + depth) { ripple(x, z, 2.4, 0.36); return true; }
        if (y <= ground) return false;
      }
      return false;
    },
    follow(pos, lookDir) { grass.userData.follow(pos, lookDir); W.WATER_WAKE.track(pos.x, pos.z, waterDepthAt(pos.x, pos.z)); },
  };
}

// Catmull-Rom through the control points, about every `step` metres
function densify(pts, step = 1) {
  const out = [], P = i => pts[Math.min(pts.length - 1, Math.max(0, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2), n = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push(b.map((_, j) => 0.5 * ((2 * b[j]) + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
