// hill-village-level.js  —  the hill village and the valley below it, on land drawn as a heightmap  (?map=hillvillage)
//
// One job: to lay a village out on the land of assets/heightmaps/hill-village.bin as its plan (hill-village.json beside it)
// says. Both come from tools/make-hill-village-heightmap.py, which is where the land and every place on it are decided: plateaus stepping
// down to a river, ramps where the ways climb, level ground under each building, the water's beds; and under the village's
// terrace the valley, into which the river falls, with the way down its west cliff. This file reads them and puts the game's own
// things on top: the valley's land paint (rock painted with a brush on the cliffs), the ground picture and the fluffy grass,
// trodden dirt ways (ground-paths.js), the woods, the valley's clear water lying in each stretch's bed and a fall where a
// terrace ends, and the village: houses put together from the building kit (village-kit.js), the windmill, a water mill with a
// turning wheel, a stone bridge, a keep, a market, fenced fields and a pasture (stylized-buildings.js, village-fields.js); in
// the valley a plank bridge and the river's stones.
//
// The land picture is raw 16-bit numbers (little-endian), plan.land.nx across by plan.land.nz down, one every plan.land.cell
// metres from (x0, z0): 0 is plan.land.base metres, 65535 base + range. Places in the plan are metres from the middle of the
// village, x east and z south. To change the land or move anything: edit the tool, run it, reload. ?look=flat draws the kit's
// houses in flat colour patches instead of the kit's own painted pictures; ?cliff=strata the cliffs as they were before the brush.
//
// The land is longer than it is wide, and big: the ground is drawn in pieces and the woods in groves, so what lies behind her
// is not drawn at all.
//
// (Not the terraced village island of village-level.js, ?map=village: that is another trial of the same idea.)
//
//   const level = await buildHillVillageLevel({ far, sun, grassCount, onStep });     // the same shape as the other levels

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as N from './stylized-nature.js';
import * as T from './stylized-terrain.js';
import * as G from './stylized-grassfield.js';
import * as W from './stylized-water.js';
import * as BD from './stylized-buildings.js';
import { createAnimeCells } from './anime-cells.js';
import { createWaterDroplets } from './water-droplets.js';
import { createWaterfall } from './stylized-waterfall.js';
import { createPaths, loadPathTextures } from './ground-paths.js';
import { loadProp, propMaterial } from './stylized-props.js';
import { loadVillageKit } from './village-kit.js';
import { fieldGeometry } from './village-fields.js';

const { mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const HILL_VILLAGE_MAP = {
  land: './assets/heightmaps/hill-village.bin', plan: './assets/heightmaps/hill-village.json', windmill: './assets/models/windmill.glb',
  cliff: './assets/ground/cliff-paint.webp',      // the cliffs' painted rock (tools/make-cliff-paint.py)
  cells: 700,                     // the ground's own grid (0.5 m)
  pieces: [3, 5],                 // the ground is drawn in this many pieces across and down, the woods in groves GROVE metres square
  grove: 80,
  sails: /^polySurface142_/,      // the part of the windmill that turns
};
const TRUNK = { broadleaf: 0.42, oak: 0.55, pine: 0.38, birch: 0.24, sapling: 0.2 }, TREE_H = { broadleaf: 7.5, oak: 7.5, pine: 7.5, birch: 8, sapling: 4 };
const ROCK_R = { boulder: 1.0, stones: 0.8, river: 0.7, pebbles: 0 }, ROCK_SINK = { boulder: 0.18, stones: 0.05, river: 0.12, pebbles: 0 };

export async function buildHillVillageLevel({ seed = 7, far = '#cde6f2', grassCount = 150000, sun = [-0.45, 0.62, 0.64], onStep = async () => {} } = {}) {
  const M = HILL_VILLAGE_MAP, look = new URLSearchParams(location.search).get('look') === 'flat' ? 'flat' : 'kit';
  const group = new THREE.Group(); group.name = 'hill-village';
  const url = p => new URL(p, import.meta.url).href;

  // ------------------------------------------------------------------ the land: read from the picture
  await onStep('อ่านแผนที่ความสูง');
  const fresh = { cache: 'no-cache' };                                    // (the land and the plan change together: never one from the browser's cache and one new)
  const [raw, P] = await Promise.all([fetch(url(M.land), fresh).then(r => r.arrayBuffer()).then(b => new Uint16Array(b)), fetch(url(M.plan), fresh).then(r => r.json())]);
  const { x0: X0, z0: Z0, cell, nx, nz, base, range, play } = P.land;     // (she walks inside play: x0, x1, z0, z1; the rest is wooded hills to look at)
  const X1 = X0 + (nx - 1) * cell, Z1 = Z0 + (nz - 1) * cell, CZ = (Z0 + Z1) / 2, FR = (Z1 - Z0) / 2, HX = (X1 - X0) / 2;      // FR: half its length (the longer way)
  const onLand = (x, z, in_ = 0) => x > X0 + in_ && x < X1 - in_ && z > Z0 + in_ && z < Z1 - in_;
  const paths = createPaths({ paths: [...P.paths.map(p => ({ points: p.points, half: p.half })), ...P.yards.map(([x, z, r]) => ({ points: [[x - 0.3, z], [x + 0.3, z]], half: r }))], seed });      // (a yard: a short way as wide as the yard)
  const px = (i, j) => base + raw[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))] / 65535 * range;
  const heightFn = (x, z) => {                                             // bilinear between the picture's points; the ways lie a little below the grass
    const fx = (x - X0) / cell, fz = (z - Z0) / cell, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (px(i, j) * (1 - u) + px(i + 1, j) * u) * (1 - v) + (px(i, j + 1) * (1 - u) + px(i + 1, j + 1) * u) * v + (Math.abs(x) < HX + 2 ? paths.sink(x, z) : 0);
  };
  const field = G.createHeightField({ radius: FR, center: [0, CZ], cells: M.cells, heightFn });      // (a square as long as the land: wider than it, and only the land's part is drawn)
  const H = field.heightAt;
  const slope = (x, z) => Math.hypot(H(x + 0.5, z) - H(x - 0.5, z), H(x, z + 0.5) - H(x, z - 0.5));
  const colliders = [], cameraTrunks = [], shade = [], bare = [], press = [], casters = [], plants = [];

  // the water: for every half metre of the land, how far the nearest water's edge is and how high that water stands
  const WS = 0.5, wnx = Math.round((X1 - X0) / WS) + 1, wnz = Math.round((Z1 - Z0) / WS) + 1, wEdge = new Float32Array(wnx * wnz).fill(99), wLevel = new Float32Array(wnx * wnz);
  for (const rows of P.brooks) for (const [bx, bz, lv, hw] of rows) {
    const reach = hw + 4, i0 = Math.max(0, Math.floor((bx - reach - X0) / WS)), i1 = Math.min(wnx - 1, Math.ceil((bx + reach - X0) / WS));
    for (let j = Math.max(0, Math.floor((bz - reach - Z0) / WS)); j <= Math.min(wnz - 1, Math.ceil((bz + reach - Z0) / WS)); j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(X0 + i * WS - bx, Z0 + j * WS - bz) - hw, o = j * wnx + i;
      if (d < wEdge[o]) { wEdge[o] = d; wLevel[o] = lv; }
    }
  }
  const brookAt = (x, z) => {
    const fx = Math.min(wnx - 1.001, Math.max(0, (x - X0) / WS)), fz = Math.min(wnz - 1.001, Math.max(0, (z - Z0) / WS)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * wnx + i;
    const d = (wEdge[o] * (1 - u) + wEdge[o + 1] * u) * (1 - v) + (wEdge[o + wnx] * (1 - u) + wEdge[o + wnx + 1] * u) * v;
    return d < 1.6 ? { d, level: wLevel[Math.round(fz) * wnx + Math.round(fx)] } : null;      // (the level is never blended: two waters lie metres apart in height)
  };
  // the bridges' decks: where each lies (u along it, v across) and how high its boards are. On one she is over the water, not in it
  const decks = [];
  const deckUV = (d, x, z) => { const c = Math.cos(d.yaw), s = Math.sin(d.yaw); return [(x - d.x) * c - (z - d.z) * s, (x - d.x) * s + (z - d.z) * c]; };
  const deckAt = (x, z) => { for (const d of decks) { const [u, v] = deckUV(d, x, z); if (Math.abs(u) < d.len / 2 && Math.abs(v) < d.halfW) return d; } return null; };
  const waterDepthAt = (x, z) => { if (deckAt(x, z)) return 0; const b = brookAt(x, z); return b ? Math.max(0, b.level - H(x, z)) : 0; };      // (the player will not walk into water deeper than half a metre: without the decks the river under a bridge stopped her on it)
  const inRect = (f, x, z, pad = 0) => { const c = Math.cos(f.yaw), s = Math.sin(f.yaw), lx = (x - f.x) * c - (z - f.z) * s, lz = (x - f.x) * s + (z - f.z) * c; return Math.abs(lx) < f.w / 2 + pad && Math.abs(lz) < f.d / 2 + pad; };
  const inField = (x, z, pad = 0) => P.fields.some(f => inRect(f, x, z, pad));

  // ------------------------------------------------------------------ the woods, bushes and flowers, where the plan has them
  await onStep('ปลูกต้นไม้');
  const r = mulberry32(seed * 31);
  const tree = (x, z, type, scale, detail = 0.8) => {                      // (detail under 0.8: a tree out in the margin, never come near: fewer leaves, nothing to walk into)
    const y = H(x, z), rad = TRUNK[type] * scale;
    plants.push({ kind: 'tree', type, seed: 100 + plants.length, detail, x, y: y - 0.05, z, rotY: r() * 6.28, scale });
    if (detail >= 0.8) { colliders.push([x, z, rad + 0.22]); cameraTrunks.push([x, z, rad + 0.12, y, y + TREE_H[type] * scale]); bare.push([x, z, rad * 1.5]); }
    shade.push([x, z, 4 * scale, 0.4]); casters.push([x, z, TREE_H[type] * scale, 2.4 * scale, 0.7]);
  };
  const flowerBeds = [];
  for (const [kind, x, z, scale, detail] of P.plants) {
    if (kind === 'bush') { plants.push({ kind: 'bush', type: r() < 0.35 ? 'flowering' : 'round', seed: 100 + plants.length, x, y: H(x, z), z, rotY: r() * 6.28, scale }); colliders.push([x, z, 0.7 * scale]); }
    else if (kind === 'flower') flowerBeds.push([x, z, scale]);
    else tree(x, z, kind, scale, detail);
  }
  for (const b of P.buildings) if (b.kind === 'tree') tree(b.x, b.z, b.type, b.scale);      // the great tree

  // ------------------------------------------------------------------ the village
  await onStep('สร้างหมู่บ้าน');
  const builds = [];                                                       // everything built in code, merged into one mesh at the end
  const C = BD.BUILD_COLORS;
  // something built: solid to walk into, bare ground under it, and its shadow
  const solid = (x, z, w, d, yaw, h) => {
    for (const c of BD.rectCircles(x, z, w, d, yaw)) colliders.push(c);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let lx = -w / 2 + 0.5; lx <= w / 2 - 0.4; lx += 1) for (let lz = -d / 2 + 0.5; lz <= d / 2 - 0.4; lz += 1) bare.push([x + lx * c + lz * s, z - lx * s + lz * c, 1.0]);
    casters.push([x, z, h * 0.8, Math.max(w, d) * 0.5, 0.85]);
  };
  const corners = (x, z, w, d, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => H(x + a * w / 2 * c + b * d / 2 * s, z - a * w / 2 * s + b * d / 2 * c)); };
  const kit = await loadVillageKit();
  const kb = kit.builder();
  for (const b of P.buildings) {
    if (b.kind !== 'house') continue;
    const { w, l, floors = 1 } = b.spec, hs = corners(b.x, b.z, w, l, b.yaw), hi = Math.max(...hs), lo = Math.min(...hs), y = hi + 0.03;
    kb.house(b.spec, b.x, y, b.z, b.yaw);
    const K = BD.kit(b.spec.seed || 1);                                    // a stone footing down into the ground, so a slope never shows a gap
    K.box(0, -(hi - lo) - 1.2, 0, w + 0.5, hi - lo + 1.26, l + 0.5, C.stoneDark);
    builds.push(BD.place(K.done(), b.x, y, b.z, b.yaw));
    solid(b.x, b.z, w + 0.5, l + 0.5, b.yaw, floors * 3 + (b.spec.tower ? 6 : w * 0.45 + 1));
  }
  // the windmill: the model supplied for the game, its sails turning
  let mill = null;
  const wm = P.buildings.find(b => b.kind === 'windmill');
  if (wm) try {
    mill = await loadProp(url(M.windmill), { height: wm.height, yaw: wm.yaw, spin: { part: M.sails, speed: 0.12 } });
    mill.object.position.set(wm.x, H(wm.x, wm.z) - 0.2, wm.z); mill.object.name = 'windmill';
    group.add(mill.object);
    for (const [x, z] of mill.footprint(1)) { colliders.push([x, z, 0.62]); bare.push([x, z, 0.85]); }
    casters.push([wm.x, wm.z, wm.height * 0.75, 2.4, 0.85]);
  } catch (e) { console.warn('[hill-village] windmill', e); mill = null; }
  for (const b of P.buildings) if (b.kind === 'well') {                    // the fountain's stand-in: a well in the middle of the market
    builds.push(BD.place(BD.wellGeometry({ seed: 22 }), b.x, H(b.x, b.z), b.z, b.yaw));
    colliders.push([b.x, b.z, 1.15]); bare.push([b.x, b.z, 2.2]); casters.push([b.x, b.z, 2.4, 1.3, 0.8]);
  }
  // the water mill's wheel, in the stream beside its house
  const wheel = new THREE.Mesh(BD.wheelGeometry({ radius: 2.0, width: 1.0, axle: 3.2, seed: 24 }), propMaterial());
  wheel.name = 'waterWheel'; wheel.rotation.order = 'YXZ'; wheel.rotation.y = P.wheel.yaw;
  wheel.position.set(P.wheel.x, P.wheel.level + 1.35, P.wheel.z);
  wheel.userData.dispose = () => wheel.geometry.dispose();
  group.add(wheel); colliders.push([P.wheel.x, P.wheel.z, 1.3]);
  // the stone bridge: built along its own x, turned to lie across the river
  {
    const br = P.bridge, bc = Math.cos(br.yaw), bs = Math.sin(br.yaw), bL = br.length;
    const bEnd = s => [br.x + s * (bL / 2 - 0.4) * bc, br.z - s * (bL / 2 - 0.4) * bs];
    const by = Math.min(H(...bEnd(-1)), H(...bEnd(1))) - 0.12;
    builds.push(BD.place(BD.stoneBridgeGeometry({ length: bL, seed: 25 }), br.x, by, br.z, br.yaw));
    decks.push({ x: br.x, z: br.z, yaw: br.yaw, len: bL, halfW: 1.0, y: u => by + BD.stoneBridgeDeck(u, { length: bL }) });
    for (let u = -bL / 2; u <= bL / 2; u += 1) for (const v of [-0.8, 0.8]) bare.push([br.x + u * bc + v * bs, br.z - u * bs + v * bc, 1.3]);
    for (const s of [-1, 1]) for (const v of [-1.45, 1.45]) for (let u = 1; u <= bL / 2 + 0.6; u += 0.8) colliders.push([br.x + s * u * bc + v * bs, br.z - s * u * bs + v * bc, 0.42]);      // its parapets (and no stepping off its side)
    casters.push([br.x, br.z, 0.6, 4.2, 0.7]);
  }
  // the plank bridge over the valley's river (the first valley's: stylized-terrain.js)
  if (P.plank) {
    const pl = P.plank, pc = Math.cos(pl.yaw), ps = Math.sin(pl.yaw), pL = pl.length;
    const pby = (H(pl.x - pL / 2 * pc, pl.z + pL / 2 * ps) + H(pl.x + pL / 2 * pc, pl.z - pL / 2 * ps)) / 2 - 0.15;
    const planks = T.createBridge({ length: pL, seed: seed + 5 });
    planks.position.set(pl.x, pby, pl.z); planks.rotation.y = pl.yaw; planks.name = 'plankBridge';
    group.add(planks);
    decks.push({ x: pl.x, z: pl.z, yaw: pl.yaw, len: pL, halfW: 0.95, y: u => pby + 0.41 + 0.7 * (1 - Math.pow(2 * u / pL, 2)) });
    for (let u = -pL / 2; u <= pL / 2; u += 1) bare.push([pl.x + u * pc, pl.z - u * ps, 1.5]);
    casters.push([pl.x, pl.z, 0.4, 3.6, 0.65]);
  }
  // fences: round the pasture and the fields, a gate in each
  for (const [k, f] of P.fences.entries()) {
    const side = f.gate, a = f.points[side], b = f.points[(side + 1) % f.points.length], segs = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.7));
    const g = BD.fenceGeometry({ points: f.points, heightAt: H, gap: [side, Math.floor(segs / 2)], seed: 26 + k });
    for (const c of g.userData.circles) colliders.push(c);
    builds.push(g);
  }
  // the fields: ridges of turned earth and what grows on them
  for (const [k, f] of P.fields.entries()) builds.push(fieldGeometry({ ...f, heightAt: H, seed: 40 + k }));
  // the small things: the market's stalls, barrels, carts, sheep
  let propSeed = 60;
  for (const [kind, x, z, yaw] of P.props) {
    let rad = 0.7;
    if (kind.startsWith('kit:')) { kb.piece(kind.slice(4), x, H(x, z) - 0.02, z, yaw); rad = 1.3; }
    else { const g = BD.propGeometry(kind, { seed: propSeed++ }); rad = g.userData.solid; builds.push(BD.place(g, x, H(x, z) - 0.03, z, yaw)); }
    if (rad > 0.3) { colliders.push([x, z, rad * 0.8]); press.push([x, z, rad * 1.5]); casters.push([x, z, 1.0, rad * 0.9, 0.75]); }
    else colliders.push([x, z, 0.22]);
  }
  const houses = kb.build({ look });
  group.add(houses);
  const built = new THREE.Mesh(mergeGeometries(builds), propMaterial());
  builds.forEach(g => g.dispose());
  built.name = 'hillVillageBuilt'; built.userData.dispose = () => built.geometry.dispose();
  group.add(built);
  // the valley's rocks: water-worn stones and pebbles along the river, boulders round the plunge pool and under the cliffs
  const rocks = new THREE.Group(); rocks.name = 'rocks';
  for (const [k, [type, x, z, scale, rot]] of (P.rocks || []).entries()) {
    const m = N.createRock({ type, seed: seed * 31 + k });
    m.position.set(x, H(x, z) - ROCK_SINK[type] * scale, z); m.rotation.y = rot; m.scale.setScalar(scale);
    rocks.add(m);
    const rad = ROCK_R[type] * scale;
    if (rad > 0) { colliders.push([x, z, rad]); press.push([x, z, rad * 1.6]); shade.push([x, z, rad * 2.0, 0.3]); casters.push([x, z, rad, rad * 0.95, 0.85]); }
  }
  group.add(rocks);

  // ------------------------------------------------------------------ the ground picture, the land, the grass
  await onStep('ระบายสีพื้น');
  // the land fades into the haze toward its edges (the land's own paint does that): the grass stops before it does
  for (let z = Z0; z <= Z1; z += 5) for (const s of [-1, 1]) bare.push([s * (HX - 4), z, 10]);
  for (let x = X0; x <= X1; x += 5) for (const z of [Z0 + 3, Z0 + 15, Z1 - 15, Z1 - 4]) bare.push([x, z, 10]);
  const paint = (x, z) => {
    if (!onLand(x, z, 0.5)) return [1, 0, 0];                              // off the land: nothing grows
    let earth = ss(0.7, 1.1, slope(x, z)), mow = 0;                        // the cliffs: bare (no grass grows on them)
    const b = brookAt(x, z), sand = b ? 1 - ss(0.2, 1.4, b.d) : 0;        // the water's beds and banks: sand, no grass
    const pp = paths.paint(x, z);
    if (pp) { earth = Math.max(earth, pp[0]); mow = pp[2]; }               // the ways: trodden earth, short grass beside them
    if (inField(x, z, 0.5)) earth = 1; else if (inField(x, z, 1.6)) mow = Math.max(mow, 0.7);
    return [earth, sand, mow];
  };
  const L = new THREE.Vector3(...sun).normalize();
  const sunShadows = dir => {
    L.copy(dir).normalize();
    const dxz = Math.hypot(L.x, L.z) || 1, ly = Math.max(0.3, L.y), ux = -L.x / dxz, uz = -L.z / dxz, len = dxz / ly;
    return casters.map(([x, z, h, rr, st]) => [x + ux * len * h / 2, z + uz * len * h / 2, len * h / 2 + rr, rr * 1.1, ux, uz, st, 0]);
  };
  const map = G.createGroundMap({ radius: FR, center: [0, CZ], size: 1280, seed, heightAt: H, dirt: 0, shade, bare, press, paint, cast: sunShadows(L.clone()) });
  const fade = { far, fadeA: FR * 0.93, fadeB: FR };
  // the land itself: only the columns of the ground's grid that lie on the land, in pieces (each drawn only when it is in view),
  // in the valley's land paint: grass on the flat, rock on the cliffs, sand by the water, earth in the fields
  const terrain = new THREE.Group(); terrain.name = 'terrain';
  {
    const { n, step, heights } = field, cA = Math.max(0, Math.floor((X0 + FR) / step)), cB = Math.min(n - 1, Math.ceil((X1 + FR) / step)), cols = cB - cA + 1;
    const pos = new Float32Array(cols * n * 3), bank = new Float32Array(cols * n).fill(10), soil = new Float32Array(cols * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < cols; i++) {
      const o = j * cols + i, x = -FR + (cA + i) * step, z = CZ - FR + j * step, y = heights[j * n + cA + i], b = brookAt(x, z);
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
      if (b) bank[o] = y - b.level + b.d * 0.25;
      if (inField(x, z, 0.4)) soil[o] = 1;
    }
    const whole = new THREE.BufferGeometry(), all = new Uint32Array((cols - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < cols - 1; i++) { const a = j * cols + i, b = a + cols; all[q++] = a; all[q++] = b; all[q++] = a + 1; all[q++] = b; all[q++] = b + 1; all[q++] = a + 1; }
    whole.setAttribute('position', new THREE.BufferAttribute(pos, 3)); whole.setIndex(new THREE.BufferAttribute(all, 1));
    whole.setAttribute('aBank', new THREE.BufferAttribute(bank, 1)); whole.setAttribute('aPath', new THREE.BufferAttribute(soil, 1));
    whole.computeVertexNormals(); whole.setIndex(null);
    // the cliffs: rock painted with a brush (tools/make-cliff-paint.py), in place of the valley's strata. ?cliff=strata: as before
    let cliffPaint = null;
    if (new URLSearchParams(location.search).get('cliff') !== 'strata') try {
      cliffPaint = await new THREE.TextureLoader().loadAsync(url(M.cliff));
      cliffPaint.wrapS = cliffPaint.wrapT = THREE.RepeatWrapping; cliffPaint.anisotropy = 4; cliffPaint.colorSpace = THREE.NoColorSpace;      // (the kit shades display colours)
    } catch (err) { console.warn('[hill-village] cliff paint', err); }
    const mat = T._terrain.terrainMaterial(far, [HX + 1, FR], CZ, { cliffPaint });
    const [pa, pd] = M.pieces, own = [whole, mat];
    for (let pj = 0; pj < pd; pj++) for (let pi = 0; pi < pa; pi++) {
      const i0 = Math.round(pi * (cols - 1) / pa), i1 = Math.round((pi + 1) * (cols - 1) / pa), j0 = Math.round(pj * (n - 1) / pd), j1 = Math.round((pj + 1) * (n - 1) / pd);
      const idx = new Uint32Array((i1 - i0) * (j1 - j0) * 6), box = new THREE.Box3(), v = new THREE.Vector3();
      let k = 0;
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const a = j * cols + i, b = a + cols; idx[k++] = a; idx[k++] = b; idx[k++] = a + 1; idx[k++] = b; idx[k++] = b + 1; idx[k++] = a + 1; }
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const o = (j * cols + i) * 3; box.expandByPoint(v.set(pos[o], pos[o + 1], pos[o + 2])); }
      const g = new THREE.BufferGeometry();                                // (every piece reads the one set of points: only its list of triangles is its own)
      for (const name of ['position', 'normal', 'aBank', 'aPath']) g.setAttribute(name, whole.attributes[name]);
      g.setIndex(new THREE.BufferAttribute(idx, 1)); g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(g, mat); m.name = 'terrain-' + pi + '-' + pj; m.layers.enable(W.UNDERWATER);
      terrain.add(m); own.push(g);
    }
    if (cliffPaint) own.push(cliffPaint);
    terrain.userData = { kind: 'terrain', dispose() { own.forEach(o => o.dispose()); } };
  }
  group.add(terrain);
  let pathTex = null;
  try { pathTex = await loadPathTextures(); } catch (err) { console.warn('[hill-village] path textures', err); }      // without them: the painted look
  const ways = paths.ribbon(H, map, pathTex);
  if (pathTex) ways.userData.dispose = (d => () => { d(); pathTex.dispose(); })(ways.userData.dispose);
  group.add(ways);
  await onStep('ปลูกหญ้า');
  const grass = G.createFollowGrass({ map, field, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade });
  group.add(grass);
  // the woods, in groves, and the beds of flowers: each is drawn only when it is in view (see update)
  const groves = [], inView = [];
  {
    const by = new Map(), v = new THREE.Vector3(), grove = +new URLSearchParams(location.search).get('grove') || M.grove;
    for (const p of plants) { const k = Math.floor((p.x - X0) / grove) + ',' + Math.floor((p.z - Z0) / grove); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
    for (const list of by.values()) {
      const box = new THREE.Box3();
      for (const p of list) { const sc = p.scale || 1, w = (p.kind === 'bush' ? 1.6 : 5.5) * sc; box.expandByPoint(v.set(p.x - w, p.y - 1, p.z - w)); box.expandByPoint(v.set(p.x + w, p.y + (p.kind === 'bush' ? 2.2 : 11.5) * sc, p.z + w)); }
      const obj = N.createForest(list);
      group.add(obj); groves.push({ obj, box }); inView.push({ obj, box });
    }
    let fs = seed * 71; const pal = [['#f4a6bc', '#f6f2e6'], ['#f7d84a', '#f6f2e6'], ['#b9a3e8', '#93b8ee']];
    for (const [x, z, rad] of flowerBeds) {
      const obj = N.createFlowers({ count: Math.round(26 * rad), radius: rad, seed: ++fs, heightAt: H, center: [x, z], colors: pal[fs % 3] }), y = H(x, z);
      group.add(obj); inView.push({ obj, far: 110, box: new THREE.Box3(v.set(x - rad - 0.5, y - 1.5, z - rad - 0.5).clone(), v.set(x + rad + 0.5, y + 2.5, z + rad + 0.5).clone()) });      // (from further off than that a bed of flowers is too small to see)
    }
  }

  // ------------------------------------------------------------------ the water: the valley's clear water lying in each stretch's bed, a fall where a terrace ends
  await onStep('เติมน้ำ');
  const foamTexture = await W.loadFoamTexture(), animeCells = createAnimeCells();
  const droplets = createWaterDroplets({ time: N._internal.shared.uTime });
  droplets.points.userData.dispose = droplets.dispose;
  group.add(droplets.points);
  const WL = (P.waters.find(w => w.id === 'river') || P.waters[0]).level;      // (the waves are worked out on one level: the river's, by the bridge)
  const sim = W.createWaterSim({ rect: [P.spawn.x - 24, P.spawn.z - 24, 48], size: 512, field, foamTexture, level: WL, follow: true });
  const optics = W.createWaterOptics({ level: WL });
  const waterMat = W.waterMaterial({ field, animeCells, sim, optics, foamTexture, far, fadeA: Z1 - 30, fadeB: Z1 - 2 });      // (it fades with the land where the valley's river runs out of the map to the south)
  // A stretch of water: a sheet at the stretch's height, cut out to within its half-width of its line (rows: x, z, level,
  // half-width), its rim drawn in to that outline. A strip laid row by row along the line folded over itself wherever a wide
  // pool turned; a sheet cannot. Every point still carries what the water's paint reads: how far down the stretch it is, how
  // far off its middle, and which way the water runs there.
  const sheet = rows => {
    const n = rows.length, lv = rows[0][2], F = [0], tan = [];
    for (let k = 1; k < n; k++) F.push(F[k - 1] + Math.hypot(rows[k][0] - rows[k - 1][0], rows[k][1] - rows[k - 1][1]));
    for (let k = 0; k < n; k++) { const a = rows[Math.max(0, k - 1)], b = rows[Math.min(n - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; tan.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l]); }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, wide = 0;
    for (const [x, z, , hw] of rows) { x0 = Math.min(x0, x - hw - 1.5); x1 = Math.max(x1, x + hw + 1.5); z0 = Math.min(z0, z - hw - 1.5); z1 = Math.max(z1, z + hw + 1.5); wide = Math.max(wide, hw); }
    const cs = wide > 6 ? 1.0 : wide > 3 ? 0.7 : 0.5, gx = Math.ceil((x1 - x0) / cs) + 1, gz = Math.ceil((z1 - z0) / cs) + 1;
    const A = rows[0], B = rows[n - 1], tA = tan[0], tB = tan[n - 1];
    const pts = new Array(gx * gz);
    for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) {
      let x = x0 + i * cs, z = z0 + j * cs, best = Infinity, bk = 0, bt = 0;
      for (let k = 0; k < n - 1; k++) {                                    // the nearest spot on the stretch's line
        const ax = rows[k][0], az = rows[k][1], dx = rows[k + 1][0] - ax, dz = rows[k + 1][1] - az, t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d < best) { best = d; bk = k; bt = t; }
      }
      const a = rows[bk], b = rows[bk + 1], qx = a[0] + (b[0] - a[0]) * bt, qz = a[1] + (b[1] - a[1]) * bt, hw = a[3] + (b[3] - a[3]) * bt + 0.5;
      let tx = tan[bk][0] + (tan[bk + 1][0] - tan[bk][0]) * bt, tz = tan[bk][1] + (tan[bk + 1][1] - tan[bk][1]) * bt; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const before = bk === 0 ? (x - A[0]) * tA[0] + (z - A[1]) * tA[1] : 1, after = bk === n - 2 ? (x - B[0]) * tB[0] + (z - B[1]) * tB[1] : -1;      // (metres short of its first row, metres past its last)
      let inside = best <= hw && before >= 0 && after <= 0;
      // behind its first row (under the fall that feeds it) the water lies on as far as the cliff's foot
      if (!inside && before < 0 && before > -3.5 && Math.abs((x - A[0]) * -tA[1] + (z - A[1]) * tA[0]) <= A[3] + 0.5 && H(x, z) < lv - 0.03) inside = true;
      if (!inside && !(before < 0 && H(x, z) >= lv - 0.03)) {              // outside: drawn in to the outline (unless it lies inside the cliff behind the fall, where it is never seen)
        const end = after > 0 ? [B, tB, after] : before < 0 ? [A, tA, before] : null;
        if (end) {                                                         // past an end: back onto the line across that end, no wider than the water is there
          const [E, tE, al] = end; x -= al * tE[0]; z -= al * tE[1];
          const lat = (x - E[0]) * -tE[1] + (z - E[1]) * tE[0], lim = E[3] + 0.5;
          if (Math.abs(lat) > lim) { x = E[0] - tE[1] * Math.sign(lat) * lim; z = E[1] + tE[0] * Math.sign(lat) * lim; }
        } else { x = qx + (x - qx) * hw / best; z = qz + (z - qz) * hw / best; }
      }
      pts[j * gx + i] = { x, z, inside, F: F[bk] + (F[bk + 1] - F[bk]) * bt, lat: (x - qx) * -tz + (z - qz) * tx, tx, tz, at: -1 };
    }
    const pos = [], flow = [], dir = [], idx = [];
    const use = p => { if (p.at < 0) { p.at = pos.length / 3; pos.push(p.x, lv, p.z); flow.push(p.F, p.lat, 1); dir.push(p.tx, p.tz); } return p.at; };
    for (let j = 0; j < gz - 1; j++) for (let i = 0; i < gx - 1; i++) {
      const a = pts[j * gx + i], b = pts[(j + 1) * gx + i], c = pts[j * gx + i + 1], d = pts[(j + 1) * gx + i + 1];
      if (a.inside || b.inside || c.inside || d.inside) idx.push(use(a), use(b), use(c), use(b), use(d), use(c));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3)); g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, waterMat); m.renderOrder = 1; m.name = 'water';
    m.userData = { kind: 'water', dispose() { g.dispose(); } };
    group.add(m);
    return m;
  };
  const waters = P.brooks.map(sheet);
  const falls = [];
  for (const f of P.falls) {
    const c = createWaterfall({ x: 0, z: 0, top: f.top, bottom: f.bottom, width: f.width, forward: Math.min(2.2, 0.6 + (f.top - f.bottom) * 0.12), scale: Math.min(1, Math.max(0.6, f.width / 9)), foamTexture, cells: animeCells });
    c.group.position.set(f.x, 0, f.z); c.group.rotation.y = f.yaw;
    c.group.userData = { kind: 'waterfall', dispose: c.dispose };
    group.add(c.group);
    falls.push({ fall: c, ball: new THREE.Sphere(new THREE.Vector3(f.x, (f.top + f.bottom) / 2, f.z), (f.top - f.bottom) / 2 + f.width + 3) });
  }
  const ripple = (x, z, strength = 1, radius = 0.26, mode = null) => {      // something touches the water (as on the other maps)
    const kk = W.WATER_TUNE.ripple.value, foam = W.WATER_TUNE.splashFoam.value, drop = W.WATER_TUNE.drops.value;
    if (mode === 'plain') sim.impulse(x, z, radius, -0.03 * strength * kk);
    else if (mode === 'splash' || (mode === null && strength >= 1.5)) {
      if (sim.inside(x, z)) W.WATER_RINGS.add(x, z, Math.min(2, 0.7 * strength));
      sim.impulse(x, z, radius, 0.012 * strength * kk * W.WATER_TUNE.splashBump.value, Math.min(1, 0.4 * strength) * foam);
      if (drop > 0 && sim.inside(x, z)) droplets.emit(x, H(x, z) + waterDepthAt(x, z), z, strength / 2.4 * drop, Math.round(14 * Math.min(1.5, drop)));
    } else {
      const st = mode === 'step';
      if (st) W.WATER_WAKE.add(x, z, Math.min(1.3, 0.9 * strength));
      sim.impulse(x, z, radius, (st ? -0.042 : -0.03) * strength * kk, -Math.min(st ? 0.15 : 0.55, (st ? 0.18 : 0.75) * strength) * foam);
    }
  };
  const hidden = [...waters, grass, droplets.points];
  // each stretch of water: a ball round it (is it in view?), and how near she is to it
  const stretches = P.brooks.map(rows => {
    const b = new THREE.Box3(); for (const q of rows) b.expandByPoint(new THREE.Vector3(q[0], q[2], q[1]));
    const level = rows[0][2];
    return { level, sphere: b.getBoundingSphere(new THREE.Sphere()), near: c => { let d = Infinity; for (let k = 0; k < rows.length; k += 2) d = Math.min(d, Math.hypot(c.x - rows[k][0], c.y - level, c.z - rows[k][1]) - rows[k][3]); return d; } };
  });
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), camWorld = new THREE.Vector3();
  let frameNo = 0;

  // ------------------------------------------------------------------ where she may walk; the sun; what the game asks of a level
  let castSun = L.clone(), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false;
  const cast = { dir: castSun.clone(), k: 1 };
  const inMap = (x, z) => x > play[0] + 1 && x < play[1] - 1 && z > play[2] + 1 && z < play[3] - 1;
  const walkable = (x, z) => inMap(x, z) && (!!deckAt(x, z) || (slope(x, z) < 0.9 && waterDepthAt(x, z) < 1.05));      // off the cliffs, out of deep water
  const standAt = (x, z) => { const d = deckAt(x, z); return d ? d.y(deckUV(d, x, z)[0]) : H(x, z); };
  console.info('[hill-village] look', look, '· kit triangles', houses.userData.triangles, '· trees and bushes', plants.length, 'in', groves.length, 'groves · rocks', rocks.children.length);
  group.userData = { kind: 'hill-village', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); kit.dispose(); waterMat.dispose(); sim.dispose(); optics.dispose(); map.dispose(); field.texture.dispose(); } };
  const views = {};
  for (const [name, [x, z, yaw]] of Object.entries(P.views)) views[name] = { x, z, yaw };
  return {
    group, map, field, grass, terrain, heightAt: H, standAt, waterDepthAt, colliders, crowns: [], cameraTrunks, spawn: P.spawn, radius: 1e4, walkable, views,
    keepClear: (x, z) => slope(x, z) > 0.6 || paths.near(x, z).d < 2.5 || inField(x, z, 1),
    name: 'หมู่บ้านบนเขาและหุบเขา (heightmap)', stats: { trees: plants.length, groves: groves.length, look },
    horizon: { center: [0, CZ], scale: Math.hypot(HX, FR) / 170 * 1.08 },      // the far hills (stylized-sky.js: the nearest ring is 170 m out): moved out past this land's corners
    optics, sim, ripple, waterLevelAt: (x, z) => { const b = x === undefined ? null : brookAt(x, z); return b ? b.level : WL; },
    addUnderwater(obj) { obj.traverse(o => o.layers.enable(W.UNDERWATER)); },
    tapWater(origin, dir) {
      for (let t = 1; t < 70; t += 0.25) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t, ground = H(x, z), depth = waterDepthAt(x, z);
        if (depth > 0.03 && y <= ground + depth) { ripple(x, z, 2.4, 0.36); return true; }
        if (y <= ground) return false;
      }
      return false;
    },
    confine(p) {                                                           // off the cliffs: back to the nearest ground she may stand on
      if (walkable(p.x, p.z)) return;
      for (let rr = 0.15; rr <= 3; rr += 0.15) for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos(a * Math.PI / 6) * rr, z = p.z + Math.sin(a * Math.PI / 6) * rr;
        if (walkable(x, z)) { p.x = x; p.z = z; return; }
      }
    },
    update(renderer, dt, scene = null, camera = null) {
      sim.step(renderer, dt);
      droplets.update(renderer);
      if (mill) mill.update(dt);
      wheel.rotation.x += dt * 0.5;
      if (scene && camera) {
        frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        camWorld.setFromMatrixPosition(camera.matrixWorld);
        // what is out of view is not drawn: a grove, a bed of flowers (nor one too far off to see), a fall (nor one far away)
        for (const g of inView) g.obj.visible = frustum.intersectsBox(g.box) && (!g.far || g.box.distanceToPoint(camWorld) < g.far);
        for (const f of falls) f.fall.group.visible = frustum.intersectsSphere(f.ball) && f.ball.distanceToPoint(camWorld) < 170;
        // the water's two pictures (what lies under it, what is mirrored on it): only when water is on screen and near, made
        // for the height of the stretch she is nearest (the waters lie at several heights), and without the far groves
        let near = Infinity, level = WL;
        for (const s of stretches) if (frustum.intersectsSphere(s.sphere)) { const d = s.near(camWorld); if (d < near) { near = d; level = s.level; } }
        frameNo++;
        const q = optics.quality, doThrough = near < 45, doMirror = q > 0 && near < 75 && frameNo % (q === 2 ? 2 : 4) === 0;
        if (doThrough || doMirror) {
          if (optics.setLevel) optics.setLevel(level);
          const out = hidden.slice();
          for (const g of groves) if (g.obj.visible && g.box.distanceToPoint(camWorld) > 70) out.push(g.obj);
          optics.render(renderer, scene, camera, out, doThrough, doMirror);
        }
      }
      for (const f of falls) if (f.fall.group.visible) f.fall.update(renderer);
      const nowT = N._internal.shared.uTime.value;
      if (castBusy) { if (map.stepCast(2.5)) { castBusy = false; lastCast = nowT; cast.dir.copy(castSun); } }
      else if (nowT - lastCast > 4 && (castSun.angleTo(wantSun) > 0.075 || Math.abs(castK - wantK) > 0.12)) { castSun.copy(wantSun); castK = wantK; castBusy = true; map.beginCast(sunShadows(castSun), castK); }
    },
    setSun(dir, k = 1) { wantSun.copy(dir); wantK = k; cast.k = Math.min(1, k * 1.2); },
    get sunCast() { return cast; },
    follow(pos, lookDir) { grass.userData.follow(pos, lookDir); W.WATER_WAKE.track(pos.x, pos.z, waterDepthAt(pos.x, pos.z)); sim.focus(pos.x, pos.z); },
  };
}
