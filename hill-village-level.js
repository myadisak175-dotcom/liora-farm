// hill-village-level.js  —  the hill village, the valley below it and the pit at the valley's end, on land drawn as a heightmap  (?map=hillvillage)
//
// One job: to lay a village out on the land of assets/heightmaps/hill-village.bin as its plan (hill-village.json beside it)
// says. Both come from tools/make-hill-village-heightmap.py, which is where the land and every place on it are decided: plateaus stepping
// down to a river, ramps where the ways climb, level ground under each building, the water's beds; and under the village's
// terrace the valley, into which the river falls, with the way down its west cliff. This file reads them and puts the game's own
// things on top: the valley's land paint (rock painted with a brush on the cliffs), the ground picture and the fluffy grass,
// trodden dirt ways (ground-paths.js), the woods, the valley's clear water lying in each stretch's bed and a fall where a
// terrace ends (land-water.js: both are worked out from the land as it is drawn), and the village: houses put together from the building kit (village-kit.js), the windmill, a water mill with a
// turning wheel, a stone bridge, a keep, a market, fenced fields and a pasture (stylized-buildings.js, village-fields.js); in
// the valley a plank bridge and the river's stones, and three more plank bridges on the way round the pit.
//
// The land picture is raw 16-bit numbers (little-endian), plan.land.nx across by plan.land.nz down, one every plan.land.cell
// metres from (x0, z0): 0 is plan.land.base metres, 65535 base + range. Places in the plan are metres from the middle of the
// village, x east and z south. To change the land or move anything: edit the tool, run it, reload. The houses and the small
// things can also be moved by hand in the game (place-editor.js): the moves are kept in the browser and put onto the plan as
// it loads (place-edits.js), until they go into the tool. ?look=flat draws the kit's
// houses in flat colour patches instead of the kit's own painted pictures; ?cliff=strata the cliffs as they were before the brush;
// ?sand=flat the banks' sand in the valley's flat patches, as it was before it was painted with the ways' brush.
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
import { waterLookup, createLandWater } from './land-water.js';
import { createAbyssClouds, createAbyssFalls } from './abyss-scene.js';
import { createPaths, loadPathTextures } from './ground-paths.js';
import { loadSpinner, propMaterial } from './stylized-props.js';
import { loadVillageKit } from './village-kit.js';
import { fieldGeometry } from './village-fields.js';
import { createRockKit, sampleKitSurface } from './rocks.js';
import { placeKey, placeables, applyPlaceEdits, itemsFrom } from './place-edits.js';
import { pathKey, loadPathOps, foldPathOps, opBox, grassOver } from './path-edits.js';

const { mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const HILL_VILLAGE_MAP = {
  land: './assets/heightmaps/hill-village.bin', plan: './assets/heightmaps/hill-village.json', windmill: './assets/models/windmill.glb',
  cliff: './assets/ground/cliff-paint.webp',      // the cliffs' painted rock (tools/make-cliff-paint.py)
  sand: './assets/ground/sand-paint.webp',        // the banks' painted sand (tools/make-path-paint.py sand: the ways' own brush)
  map: './assets/maps/hill-village-map.json',      // the map's picture and what it covers (tools/make-hill-village-map.py; game-map.js shows it)
  paths: 'soft',                  // the ways' look (ground-paths.js): smooth painted earth with no line at its edge. ?paths=grit: as before
  cells: 852,                     // the ground's own grid (0.5 m)
  pieces: [3, 6],                 // the ground is drawn in this many pieces across and down, the woods in groves GROVE metres square
  grove: 80,
  sails: /^polySurface142_/,      // the part of the windmill model that is used: its sails (the rest of the mill is of the kit)
};
const TRUNK = { broadleaf: 0.6, oak: 0.7, pine: 0.38, birch: 0.26, sapling: 0.2 }, TREE_H = { broadleaf: 7.5, oak: 7.8, pine: 7.9, birch: 8.4, sapling: 4 };
const ROCK_R = { boulder: 1.0, stones: 0.8, river: 0.7, pebbles: 0 };      // (how far round a rock of the plan she cannot walk, times its size)

export async function buildHillVillageLevel({ seed = 7, far = '#cde6f2', grassCount = 150000, sun = [-0.45, 0.62, 0.64], onStep = async () => {} } = {}) {
  const M = HILL_VILLAGE_MAP, look = new URLSearchParams(location.search).get('look') === 'flat' ? 'flat' : 'kit';
  const group = new THREE.Group(); group.name = 'hill-village';
  const url = p => new URL(p, import.meta.url).href;

  // ------------------------------------------------------------------ the land: read from the picture
  await onStep('อ่านแผนที่ความสูง');
  const fresh = { cache: 'no-cache' };                                    // (the land and the plan change together: never one from the browser's cache and one new)
  const [raw, P] = await Promise.all([fetch(url(M.land), fresh).then(r => r.arrayBuffer()).then(b => new Uint16Array(b)), fetch(url(M.plan), fresh).then(r => r.json())]);
  const placeBase = placeables(P), placed = applyPlaceEdits(P, placeKey('hillvillage'));      // the things moved by hand, kept in this browser
  const { x0: X0, z0: Z0, cell, nx, nz, base, range, play } = P.land;     // (she walks inside play: x0, x1, z0, z1; the rest is wooded hills to look at)
  const X1 = X0 + (nx - 1) * cell, Z1 = Z0 + (nz - 1) * cell, CZ = (Z0 + Z1) / 2, FR = (Z1 - Z0) / 2, HX = (X1 - X0) / 2;      // FR: half its length (the longer way)
  const onLand = (x, z, in_ = 0) => x > X0 + in_ && x < X1 - in_ && z > Z0 + in_ && z < Z1 - in_;
  const pathStyle = new URLSearchParams(location.search).get('paths') === 'grit' ? 'grit' : M.paths;
  const toolWays = [...P.paths.map(p => ({ points: p.points, half: p.half })), ...P.yards.map(([x, z, r]) => ({ points: [[x - 0.3, z], [x + 0.3, z]], half: r }))];      // (a yard: a short way as wide as the yard)
  // the ways painted by hand (path-brush.js): those the map's tool has taken in (P.pathOps), then those kept in this browser,
  // in the order they were painted (path-edits.js). Each painted way is a way like the others; grass painted over a way hides it
  const pathOps = [...(P.pathOps || []), ...loadPathOps(pathKey('hillvillage'))].filter(o => o.k === 'grass' || o.pts.length >= 2);
  const paths = createPaths({ paths: [...toolWays, ...pathOps.filter(o => o.k === 'way').map(o => ({ points: o.pts, half: o.half }))], seed, style: pathStyle });
  const wayPaint = o => o.paint || (o.paint = createPaths({ paths: [{ points: o.pts, half: o.half }], seed, style: pathStyle }).paint);
  const pathPaint = foldPathOps(pathOps.length ? createPaths({ paths: toolWays, seed, style: pathStyle }).paint : paths.paint, pathOps, wayPaint);      // (a yard: a short way as wide as the yard)
  const px = (i, j) => base + raw[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))] / 65535 * range;
  const heightFn = (x, z) => {                                             // bilinear between the picture's points; the ways lie a little below the grass
    const fx = (x - X0) / cell, fz = (z - Z0) / cell, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (px(i, j) * (1 - u) + px(i + 1, j) * u) * (1 - v) + (px(i, j + 1) * (1 - u) + px(i + 1, j + 1) * u) * v + (Math.abs(x) < HX + 2 ? paths.sink(x, z) : 0);
  };
  const field = G.createHeightField({ radius: FR, center: [0, CZ], cells: M.cells, heightFn });      // (a square as long as the land: wider than it, and only the land's part is drawn)
  const H = field.heightAt;
  const slope = (x, z) => Math.hypot(H(x + 0.5, z) - H(x - 0.5, z), H(x, z + 0.5) - H(x, z - 0.5));
  const colliders = [], cameraTrunks = [], shade = [], bare = [], press = [], casters = [], plants = [];

  // the water: where it lies and how high it stands (land-water.js)
  const brookAt = waterLookup(P.brooks, { x0: X0, z0: Z0, x1: X1, z1: Z1 }).at;
  // how high a spot stands above the water beside it (and a quarter of how far out from the water's edge it is), or 10 with no
  // water near: the land's sand and the ways' wet earth both go by it, so they agree on where the ground is wet
  const bankAt = (x, z, y = H(x, z)) => { const b = brookAt(x, z); return b ? y - b.level + b.d * 0.25 : 10; };
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
  const bigTrees = [];                                                     // the great tree: a forest of its own, so it can be moved by hand
  for (const b of P.buildings) if (b.kind === 'tree') { const n = plants.length; tree(b.x, b.z, b.type, b.scale); bigTrees.push({ b, plant: plants.splice(n, 1)[0] }); }

  // ------------------------------------------------------------------ the village
  await onStep('สร้างหมู่บ้าน');
  const builds = [];                                                       // what is built in code and stays where it is, merged into one mesh at the end
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
  // the things that may be moved by hand (place-edits.js says which): each knows how high it stands wherever it is put (lift:
  // { y, deep }) and builds itself there (make), into the village's merged meshes - or, while the place editor is open, into an
  // object of its own (placeEdit, below)
  const things = [], baseOf = new Map(placeBase.map(t => [t.id, t]));
  const addThing = (id, at, lift, make, extra = {}) => { const t = { ...baseOf.get(id), x: at.x, z: at.z, yaw: at.yaw || 0, lift, make, ...extra }; things.push(t); return t; };
  for (const b of P.buildings) {
    if (b.kind !== 'house') continue;
    const { w, l, floors = 1 } = b.spec;
    const lift = (x, z, yaw) => { const hs = corners(x, z, w, l, yaw), hi = Math.max(...hs), lo = Math.min(...hs); return { y: hi + 0.03, deep: hi - lo }; };
    addThing(b.id, b, lift, (k, out, x, y, z, yaw, deep) => {
      k.house(b.spec, x, y, z, yaw);
      const K = BD.kit(b.spec.seed || 1);                                  // a stone footing down into the ground, so a slope never shows a gap
      K.box(0, -deep - 1.2, 0, w + 0.5, deep + 1.26, l + 0.5, C.stoneDark);
      out.push(BD.place(K.done(), x, y, z, yaw));
    }, { foot: [w + 0.5, l + 0.5], top: floors * 3 + (b.spec.tower ? 6 : w * 0.45 + 1) + 0.8 });
    solid(b.x, b.z, w + 0.5, l + 0.5, b.yaw, floors * 3 + (b.spec.tower ? 6 : w * 0.45 + 1));
  }
  // the windmill: its tower and the miller's house are two of the plan's kit houses (above). Its sails are the supplied
  // model's (stylized-props.js takes them out of the file), in the kit's own wood and a linen that sits with its plaster, on
  // an axle out of the tower's wall
  let mill = null;
  const wm = P.buildings.find(b => b.kind === 'sails');
  if (wm) try {
    const foot = Math.max(...corners(wm.x, wm.z, 4, 4, wm.yaw)) + 0.03, fx = Math.sin(wm.yaw), fz = Math.cos(wm.yaw);
    const WOOD = [0.545, 0.369, 0.212], LINEN = [0.87, 0.82, 0.69];        // (the kit's wood trim; the kit's plaster, a shade paler)
    mill = await loadSpinner(url(M.windmill), { part: M.sails, span: wm.span, speed: 0.12, recolor: (r, g, b) => (r - b > 0.23 ? WOOD : LINEN) });
    mill.object.position.set(wm.x + fx * wm.out, foot + wm.hub, wm.z + fz * wm.out); mill.object.rotation.y = wm.yaw; mill.object.name = 'windmillSails';
    group.add(mill.object);
    const tower = things.find(t => t.id === 'mill_tower'), turn = tower ? wm.yaw - tower.yaw : 0;      // (the sails stand on the tower's front: they go where it goes)
    const axle = (out, x, y, z, yaw) => {
      const K = BD.kit(31);
      K.box(0, wm.hub - 0.2, (2 + wm.out) / 2 + 0.1, 0.4, 0.4, wm.out - 2 + 0.6, C.timberDark);      // the axle
      K.box(0, wm.hub - 0.45, 2.12, 0.9, 0.9, 0.24, C.timber);                                       // and the block it comes out of
      out.push(BD.place(K.done(), x, y, z, yaw + turn));
    };
    if (tower) {
      const make = tower.make;
      tower.make = (k, out, x, y, z, yaw, deep) => { make(k, out, x, y, z, yaw, deep); axle(out, x, y, z, yaw); };
      tower.follow = (x, y, z, yaw) => { const a = yaw + turn; mill.object.position.set(x + Math.sin(a) * wm.out, y + wm.hub, z + Math.cos(a) * wm.out); mill.object.rotation.y = a; };
    } else axle(builds, wm.x, foot, wm.z, wm.yaw);
    casters.push([wm.x + fx * wm.out, wm.z + fz * wm.out, wm.hub, wm.span * 0.3, 0.5]);
  } catch (e) { console.warn('[hill-village] windmill sails', e); mill = null; }
  for (const b of P.buildings) if (b.kind === 'well') {                    // the fountain's stand-in: a well in the middle of the market
    addThing(b.id, b, (x, z) => ({ y: H(x, z), deep: 0 }), (k, out, x, y, z, yaw) => out.push(BD.place(BD.wellGeometry({ seed: 22 }), x, y, z, yaw)));
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
  // the plank bridges (the first valley's: stylized-terrain.js): one over the valley's river, and one over each of the three
  // waters where the way round the pit crosses them. Each lies along its own x, turned by its yaw
  for (const [i, pl] of [P.plank, ...(P.planks || [])].filter(Boolean).entries()) {
    const pc = Math.cos(pl.yaw), ps = Math.sin(pl.yaw), pL = pl.length;
    const pby = (H(pl.x - pL / 2 * pc, pl.z + pL / 2 * ps) + H(pl.x + pL / 2 * pc, pl.z - pL / 2 * ps)) / 2 - 0.15;
    const planks = T.createBridge({ length: pL, seed: seed + 5 + i });
    planks.position.set(pl.x, pby, pl.z); planks.rotation.y = pl.yaw; planks.name = 'plankBridge';
    group.add(planks);
    decks.push({ x: pl.x, z: pl.z, yaw: pl.yaw, len: pL, halfW: 0.95, y: u => pby + 0.41 + 0.7 * (1 - Math.pow(2 * u / pL, 2)) });
    for (let u = -pL / 2; u <= pL / 2; u += 1) bare.push([pl.x + u * pc, pl.z - u * ps, 1.5]);
    casters.push([pl.x, pl.z, 0.4, Math.min(3.6, pL * 0.36), 0.65]);
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
  for (const [i, [kind, x, z, yaw]] of P.props.entries()) {
    let rad = 0.7;
    const at = { x, z, yaw }, b = placeBase.filter(t => t.kind === 'prop')[i];
    if (kind.startsWith('kit:')) { addThing(b.id, at, (x, z) => ({ y: H(x, z) - 0.02, deep: 0 }), (k, out, x, y, z, yaw) => k.piece(kind.slice(4), x, y, z, yaw)); rad = 1.3; }
    else {
      const ps = propSeed++;
      const g0 = BD.propGeometry(kind, { seed: ps }); rad = g0.userData.solid; g0.dispose();
      addThing(b.id, at, (x, z) => ({ y: H(x, z) - 0.03, deep: 0 }), (k, out, x, y, z, yaw) => out.push(BD.place(BD.propGeometry(kind, { seed: ps }), x, y, z, yaw)));
    }
    if (rad > 0.3) { colliders.push([x, z, rad * 0.8]); press.push([x, z, rad * 1.5]); casters.push([x, z, 1.0, rad * 0.9, 0.75]); }
    else colliders.push([x, z, 0.22]);
  }
  // the great tree: a forest of one
  for (const { b, plant } of bigTrees) {
    const obj = N.createForest([plant]); obj.name = 'greatTree';
    group.add(obj);
    addThing(b.id, b, (x, z) => ({ y: H(x, z) - 0.05, deep: 0 }), null, { obj, y0: plant.y + 0.05 });
  }
  // the things, each where it stands, merged with the rest
  const thingBuilds = [];
  for (const t of things) if (t.make) { const { y, deep } = t.lift(t.x, t.z, t.yaw); t.make(kb, thingBuilds, t.x, y, t.z, t.yaw, deep); }
  const houses = kb.build({ look });
  group.add(houses);
  const merged = (list, name) => {
    const m = new THREE.Mesh(mergeGeometries(list), propMaterial());
    list.forEach(g => g.dispose());
    m.name = name; m.userData.dispose = () => m.geometry.dispose();
    group.add(m); return m;
  };
  merged(builds, 'hillVillageBuilt');
  const builtThings = thingBuilds.length ? merged(thingBuilds, 'hillVillageThings') : null;
  // the valley's rocks: water-worn stones and pebbles along the river, boulders round the plunge pool and under the cliffs. They
  // are the rock kit's (rocks.js: big, middling and small, chiselled), painted with the cliffs' own brush-painted stone, so they
  // read as fallen from the cliffs (?cliff=strata: the kit's own pale stone)
  let cliffPaint = null;
  if (new URLSearchParams(location.search).get('cliff') !== 'strata') try {
    cliffPaint = await new THREE.TextureLoader().loadAsync(url(M.cliff));
    cliffPaint.wrapS = cliffPaint.wrapT = THREE.RepeatWrapping; cliffPaint.anisotropy = 4; cliffPaint.colorSpace = THREE.NoColorSpace;      // (the kit shades display colours)
  } catch (err) { console.warn('[hill-village] cliff paint', err); }
  const kitRocks = [], rr = mulberry32(seed * 977);
  const wetRocks = [];                                                     // (those in the water: no moss on them)
  const sitRock = (type, x, z, s, ry, rad, sy = 1) => {                  // on the lowest ground under it, sunk a little
    let low = H(x, z); for (let a = 0; a < 6; a++) low = Math.min(low, H(x + Math.cos(a) * rad, z + Math.sin(a) * rad));
    (waterDepthAt(x, z) > 0.05 ? wetRocks : kitRocks).push({ type, seed: 1 + Math.floor(rr() * 4), x, y: low - 0.06 * s, z, ry, s, sy });
  };
  for (const [type, x, z, scale, rot] of P.rocks || []) {
    const ry = rot * 180 / Math.PI, rad = ROCK_R[type] * scale;
    if (type === 'boulder') sitRock('boulder', x, z, scale * 1.2, ry, rad);                       // a big one
    else if (type === 'river') sitRock('stone', x, z, scale * 1.9, ry, rad, 0.75);                 // a middling one, worn flatter by the water
    else if (type === 'stones') for (let k = 0; k < 3; k++) {                                    // a few middling ones together
      const a = rot + k * 2.1, d = k ? 0.55 * scale : 0;
      sitRock('stone', x + Math.cos(a) * d, z + Math.sin(a) * d, scale * (k ? 0.95 + rr() * 0.35 : 1.45), ry + k * 70, 0.5 * scale);
    }
    else sitRock('pebbles', x, z, scale * 1.05, ry, 0.6 * scale);                                  // small ones
    if (rad > 0) { colliders.push([x, z, rad]); press.push([x, z, rad * 1.6]); shade.push([x, z, rad * 2.0, 0.3]); casters.push([x, z, rad, rad * 0.95, 0.85]); }
  }
  const rockPaint = cliffPaint ? { texture: cliffPaint, tile: [8, 4] } : null;
  const rocks = createRockKit(kitRocks, { world: false, paint: rockPaint, moss: { boulder: 0.45, stone: 0.25 } });      // (a little moss on what faces up: not a cap of it)
  const wet = createRockKit(wetRocks, { world: false, paint: rockPaint, moss: { boulder: 0, stone: 0, pebbles: 0 } });
  rocks.name = 'rocks'; wet.name = 'wetRocks';
  group.add(rocks, wet);
  // the meadow's grass on the boulders' tops (as on the other maps: rock-world.js), so a mossy top is not bald. Worked out from
  // the rocks' real shapes, on the land's own grid: a point of the grid that lies on a top that faces up is given the top's
  // height (in a copy of the land's heights kept for the grass alone: the water reads the land's own), and a cell with all four
  // corners on one top, or three, grows grass (grow). The cells round those are bare: between a top and the ground the grass's
  // height is a slope through the air beside the rock, and no blade may stand on it
  const grow = [], grassTop = new Map();
  {
    const st = field.step, n = field.n, gx0 = field.center[0] - field.radius, gz0 = field.center[1] - field.radius, near = new Map();
    const pts = sampleKitSurface(rocks, { step: 0.1, seed, filter: it => it.type === 'boulder' });
    for (let q = 0; q < pts.length; q += 4) {
      if (pts[q + 3] < 0.5) continue;                                       // (only a face that looks up: where the moss is)
      const fi = (pts[q] - gx0) / st, fj = (pts[q + 2] - gz0) / st, i = Math.round(fi), j = Math.round(fj);
      if (i < 2 || j < 2 || i > n - 3 || j > n - 3 || Math.hypot(fi - i, fj - j) * st > 0.2) continue;      // (close by the grid's point: the top's height just there)
      const k = j * n + i, e = near.get(k);
      if (e) { e[0] = Math.max(e[0], pts[q + 1]); e[1]++; } else near.set(k, [pts[q + 1], 1]);
    }
    const top = new Map();
    for (const [k, [y, c]] of near) if (c >= 2 && y > field.heights[k] + 0.3) top.set(k, y - 0.05);
    const at = k => [gx0 + (k % n) * st, gz0 + Math.floor(k / n) * st], rim = new Set(), grassy = new Set(), CORN = [0, 1, n, n + 1], OPP = [n + 1, n, 1, 0];
    const raise = (k, y) => { if (!(grassTop.get(k) >= y)) grassTop.set(k, y); };
    for (const k of new Set([...top.keys()].flatMap(q => OPP.map(o => q - o)))) {      // every cell with a corner on a top
      const c = CORN.map(q => top.get(k + q)), on = c.filter(v => v !== undefined);
      if (on.length < 3 || Math.max(...on) - Math.min(...on) > 0.75) continue;
      const [x, z] = at(k);
      if (on.length === 4) grow.push([x + st / 2, z + st / 2, 0.38]);
      else {
        // three corners on the top: the top's edge runs through this cell. The grass comes to it: on the three corners' side,
        // and the fourth corner's height is the top's own slope carried on (so the blades by the edge stand at the top's height)
        const m = c.indexOf(undefined), o = 3 - m;
        raise(k + CORN[m], c[m === 0 || m === 3 ? 1 : 0] + c[m === 0 || m === 3 ? 2 : 3] - c[o]);
        grow.push([x + st / 2 + (m % 2 ? -1 : 1) * st * 0.24, z + st / 2 + (m > 1 ? -1 : 1) * st * 0.24, 0.3]);
      }
      CORN.forEach((q, i) => { if (c[i] !== undefined) raise(k + q, c[i]); });
      grassy.add(k);
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) if (a || b) rim.add(k + a + b * n);
    }
    for (const k of grassy) if (grassy.has(k - 1) && grassy.has(k - n) && grassy.has(k - n - 1)) grow.push([...at(k), 0.38]);      // (and where four such cells meet)
    for (const k of rim) if (!grassy.has(k)) { const [x, z] = at(k); bare.push([x + st / 2, z + st / 2, 0.5]); }
  }

  // ------------------------------------------------------------------ the ground picture, the land, the grass
  await onStep('ระบายสีพื้น');
  // the land fades into the haze toward its edges (the land's own paint does that): the grass stops before it does
  for (let z = Z0; z <= Z1; z += 5) for (const s of [-1, 1]) bare.push([s * (HX - 4), z, 10]);
  for (let x = X0; x <= X1; x += 5) for (const z of [Z0 + 3, Z0 + 15, Z1 - 15, Z1 - 4]) bare.push([x, z, 10]);
  const paint = (x, z) => {
    if (!onLand(x, z, 0.5)) return [1, 0, 0];                              // off the land: nothing grows
    let earth = ss(0.7, 1.1, slope(x, z)), mow = 0;                        // the cliffs: bare (no grass grows on them)
    const b = brookAt(x, z), sand = b ? 1 - ss(0.2, 1.4, b.d) : 0;        // the water's beds and banks: sand, no grass
    const pp = pathPaint(x, z);
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
  // (the blades by the beach are rooted in the land's dry grass, not in pale sand: they meet the painted sand's dry-grass edge)
  const map = G.createGroundMap({ radius: FR, center: [0, CZ], size: 1280, seed, heightAt: H, dirt: 0, shade, bare, press, grow, paint, cast: sunShadows(L.clone()), colors: { sand: T._strata.colors.hay } });
  const fade = { far, fadeA: FR * 0.93, fadeB: FR };
  // the banks' sand: painted with the ways' own brush, so the beach and the ways read as one ground (?sand=flat: as it was)
  let sandPaint = null;
  if (new URLSearchParams(location.search).get('sand') !== 'flat') try {
    sandPaint = await new THREE.TextureLoader().loadAsync(url(M.sand));
    sandPaint.wrapS = sandPaint.wrapT = THREE.RepeatWrapping; sandPaint.anisotropy = 4; sandPaint.colorSpace = THREE.NoColorSpace;      // (the kit shades display colours)
  } catch (err) { console.warn('[hill-village] sand paint', err); }
  // the land itself: only the columns of the ground's grid that lie on the land, in pieces (each drawn only when it is in view),
  // in the valley's land paint: grass on the flat, rock on the cliffs, sand by the water (painted, wet toward the water, and
  // going through dry grass into the meadow where the blades stand thick), earth in the fields
  const terrain = new THREE.Group(); terrain.name = 'terrain';
  {
    const { n, step, heights } = field, cA = Math.max(0, Math.floor((X0 + FR) / step)), cB = Math.min(n - 1, Math.ceil((X1 + FR) / step)), cols = cB - cA + 1;
    const pos = new Float32Array(cols * n * 3), bank = new Float32Array(cols * n).fill(10), soil = new Float32Array(cols * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < cols; i++) {
      const o = j * cols + i, x = -FR + (cA + i) * step, z = CZ - FR + j * step, y = heights[j * n + cA + i];
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
      bank[o] = bankAt(x, z, y);
      if (inField(x, z, 0.4)) soil[o] = 1;
    }
    const whole = new THREE.BufferGeometry(), all = new Uint32Array((cols - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < cols - 1; i++) { const a = j * cols + i, b = a + cols; all[q++] = a; all[q++] = b; all[q++] = a + 1; all[q++] = b; all[q++] = b + 1; all[q++] = a + 1; }
    whole.setAttribute('position', new THREE.BufferAttribute(pos, 3)); whole.setIndex(new THREE.BufferAttribute(all, 1));
    whole.setAttribute('aBank', new THREE.BufferAttribute(bank, 1)); whole.setAttribute('aPath', new THREE.BufferAttribute(soil, 1));
    whole.computeVertexNormals(); whole.setIndex(null);
    // the cliffs: rock painted with a brush (tools/make-cliff-paint.py, loaded with the rocks above), in place of the valley's strata
    const mat = T._terrain.terrainMaterial(far, [HX + 1, FR], CZ, { cliffPaint, sandPaint, ground: map });
    if (P.pit) { mat.uniforms.uDeepOn.value = 1; mat.uniforms.uDeepTop.value = P.pit.shift; }      // down the pit the walls go pale into its mist, then dark (its heights as ?map=pit has them, moved by shift)
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
    if (sandPaint) own.push(sandPaint);
    terrain.userData = { kind: 'terrain', dispose() { own.forEach(o => o.dispose()); } };
  }
  group.add(terrain);
  let pathTex = null;
  try { pathTex = await loadPathTextures(pathStyle); } catch (err) { console.warn('[hill-village] path textures', err); }      // without them: the painted look
  const ways = paths.ribbon(H, map, pathTex, bankAt);      // (bankAt: the ways are wet toward the water, as the sand beside them is)
  if (pathTex) ways.userData.dispose = (d => () => { d(); pathTex.dispose(); })(ways.userData.dispose);
  group.add(ways);
  await onStep('ปลูกหญ้า');
  let grassField = field;                                                  // the land's heights as the grass has them: the boulders' grassy tops raised into them
  if (grassTop.size) {
    const half = new Uint16Array(field.texture.image.data);
    for (const [k, y] of grassTop) half[k] = THREE.DataUtils.toHalfFloat(y);
    const texture = new THREE.DataTexture(half, field.n, field.n, THREE.RedFormat, THREE.HalfFloatType);
    texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
    grassField = { ...field, texture };
  }
  const grass = G.createFollowGrass({ map, field: grassField, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade });
  if (grassField !== field) grass.userData.dispose = (d => () => { if (d) d(); grassField.texture.dispose(); })(grass.userData.dispose);
  console.info('[hill-village] grass on the boulders\' tops:', grow.length, 'spots,', grassTop.size, 'points of the land raised for it');
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
  const waterMat = W.waterMaterial({ field, animeCells, sim, optics, foamTexture, far, fadeA: 1e4, fadeB: 2e4 });      // (no water runs out to the land's edge: none of it fades)
  // each stretch's surface, and a fall wherever one runs off an edge, are worked out from the land itself (land-water.js): the
  // sheet lies only where the ground holds it, the fall hangs from the sheet's own edge and its foam is where it lands
  // (from its third shelf each stream goes into the pit's mist: the abyss's long fall, abyss-scene.js)
  const deepFall = f => createAbyssFalls({ falls: [f], centre: [f.x + Math.sin(f.yaw), f.z + Math.cos(f.yaw)], bottom: f.top - 42, optics: null, foamTexture });
  const water = createLandWater({ stretches: P.brooks, heightAt: H, lookup: { at: brookAt }, material: waterMat, foamTexture, cells: animeCells, expect: P.falls.length, deep: P.deep || [], deepFall, split: P.split || [] });
  water.group.userData.dispose = water.dispose;
  group.add(water.group);
  // the pit's clouds, on its shelves and over its eye (the abyss's: their heights are the first pit's, so all are moved by shift)
  if (P.pit) {
    const clouds = createAbyssClouds({ centre: [P.pit.x, P.pit.z], rimR: () => P.pit.brink, ledges: P.pit.shelves, falls: [], count: 120 });
    clouds.group.traverse(o => { if (o.material && o.material.uniforms && o.material.uniforms.uCentre) { o.material.uniforms.uCentre.value.y = P.pit.shift; if (o.geometry.boundingSphere) o.geometry.boundingSphere.center.y += P.pit.shift; } });
    clouds.group.userData = { dispose: clouds.dispose };
    group.add(clouds.group);
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
  const hidden = [...water.surfaces, grass, droplets.points], stretches = water.stretches;
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), camWorld = new THREE.Vector3();
  let frameNo = 0;

  // ------------------------------------------------------------------ where she may walk; the sun; what the game asks of a level
  let castSun = L.clone(), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false;
  const cast = { dir: castSun.clone(), k: 1 };
  const inMap = (x, z) => x > play[0] + 1 && x < play[1] - 1 && z > play[2] + 1 && z < play[3] - 1;
  const walkable = (x, z) => inMap(x, z) && (!!deckAt(x, z) || (slope(x, z) < 0.9 && waterDepthAt(x, z) < 1.05));      // off the cliffs, out of deep water
  const standAt = (x, z) => { const d = deckAt(x, z); return d ? d.y(deckUV(d, x, z)[0]) : H(x, z); };
  console.info('[hill-village] look', look, '· kit triangles', houses.userData.triangles, '· trees and bushes', plants.length, 'in', groves.length, 'groves · rocks', rocks.userData.instances.length + wet.userData.instances.length);
  group.userData = { kind: 'hill-village', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); kit.dispose(); waterMat.dispose(); sim.dispose(); optics.dispose(); map.dispose(); field.texture.dispose(); } };
  const views = {};
  for (const [name, [x, z, yaw]] of Object.entries(P.views)) views[name] = { x, z, yaw };

  // ------------------------------------------------------------------ moving things by hand (place-editor.js asks; place-edits.js keeps the moves)
  // While the editor is open each thing is an object of its own, built where it stands at its own origin and set where it is
  // put; the village's merged meshes of them are hidden. Only the thing moves until the moves are saved and the map loads
  // again: then her way round it, the bare ground, the grass and the shadows are worked out for where it now stands.
  let split = null;
  const viewOf = t => {                                                    // the thing as an object of its own, built at its origin
    if (t.obj) return t.obj;
    const k = kit.builder(), out = [], { deep } = t.lift(t.x, t.z, t.yaw);
    t.make(k, out, 0, 0, 0, 0, deep);
    const o = new THREE.Group(), kg = k.build({ look });
    if (kg.children.length) o.add(kg); else kg.userData.dispose();
    if (out.length) { const g = mergeGeometries(out); out.forEach(q => q.dispose()); const m = new THREE.Mesh(g, propMaterial()); m.userData.dispose = () => g.dispose(); o.add(m); }
    o.userData.dispose = () => o.traverse(c => { if (c !== o && c.userData.dispose && !c.isGroup) c.userData.dispose(); });
    return o;
  };
  const setView = (i, it) => {
    const t = things[i], o = t.view, { y } = t.lift(it.x, it.z, it.yaw);
    if (t.obj) o.position.set(it.x - t.x, y - t.y0, it.z - t.z);          // (the great tree's forest stands where it was made: it is moved by the difference)
    else { o.position.set(it.x, y, it.z); o.rotation.y = it.yaw; }
    o.updateMatrixWorld(true);
    if (t.follow) t.follow(it.x, y, it.z, it.yaw);
  };
  const unsplit = () => {
    if (!split) return;
    for (const t of things) {
      if (t.obj) t.obj.position.set(0, 0, 0);
      else if (t.view) { split.remove(t.view); t.view.userData.dispose(); }
      if (t.follow) { const { y } = t.lift(t.x, t.z, t.yaw); t.follow(t.x, y, t.z, t.yaw); }
      t.view = null;
    }
    group.remove(split); split = null;
    houses.visible = true; if (builtThings) builtThings.visible = true;
  };
  const wayAt = (x, z) => { const n = paths.near(x, z); return n.d < n.half - 0.2; };

  // ------------------------------------------------------------------ painting ways by hand (path-brush.js asks; path-edits.js keeps the strokes)
  // A stroke shows at once: a way is one more ribbon of the ways' own (ground-paths.js) and the grass under it is laid low in the
  // ground picture; grass is let back up over whatever way is there. Only the grass's amount is changed now (the ground picture's
  // colour, the paths' little dip in the land and the map are made again when the scene loads with the strokes saved)
  const { data: mapData, size: MS, radius: MR, center: [MCX, MCZ] } = map;
  const texels = ([x0, x1, z0, z1]) => {
    const s = MS / (2 * MR);
    return [Math.max(0, Math.floor((x0 - MCX + MR) * s)), Math.min(MS - 1, Math.ceil((x1 - MCX + MR) * s)), Math.max(0, Math.floor((z0 - MCZ + MR) * s)), Math.min(MS - 1, Math.ceil((z1 - MCZ + MR) * s))];
  };
  const eachTexel = (box, fn) => {
    const [i0, i1, j0, j1] = texels(box), span = 2 * MR;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn((j * MS + i) * 4 + 3, MCX - MR + (i + 0.5) / MS * span, MCZ - MR + (j + 0.5) / MS * span);
  };
  const stampOp = o => {
    if (o.k === 'way') { const pp = wayPaint(o); eachTexel(opBox(o), (a, x, z) => { const q = pp(x, z); if (q) mapData[a] = Math.round(mapData[a] * (1 - q[0]) * (1 - 0.5 * q[2])); }); }
    else eachTexel(opBox(o), (a, x, z) => { const f = grassOver(o, x, z); if (f > 0) mapData[a] = Math.max(mapData[a], Math.round(255 * f)); });
  };
  const liveOps = [];                                                      // this visit's strokes (laid again after the sun's shadows are drawn anew)
  const pathEdit = {
    key: pathKey('hillvillage'), heightAt: H, inMap, baked: (P.pathOps || []).length, grassAt: map.grassAt,      // (how much grass grows at a spot, 0..1: for tests)
    ops: () => loadPathOps(pathKey('hillvillage')),                       // the strokes kept in this browser (already drawn)
    apply(op) {                                                            // one stroke, drawn now; gives back its undoing
      const box = opBox(op), [i0, i1, j0, j1] = texels(box), w = i1 - i0 + 1, before = new Uint8Array(w * (j1 - j0 + 1));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) before[(j - j0) * w + (i - i0)] = mapData[(j * MS + i) * 4 + 3];
      const line = op.k === 'way' ? paths.add({ points: op.pts, half: op.half }) : null;
      stampOp(op); liveOps.push(op);
      map.texture.needsUpdate = true;
      return () => {
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) mapData[(j * MS + i) * 4 + 3] = before[(j - j0) * w + (i - i0)];
        if (line) paths.remove(line);
        const k = liveOps.lastIndexOf(op); if (k >= 0) liveOps.splice(k, 1);
        map.texture.needsUpdate = true;
      };
    },
  };
  const placeEdit = {
    key: placeKey('hillvillage'), report: placed,
    heightAt: H,
    base: () => things.map(t => ({ ...baseOf.get(t.id) })),               // where the map's tool put them (in the order of things)
    items: () => { const now = new Map(itemsFrom(placeBase, placed.used).map(it => [it.id, it])); return things.map(t => ({ ...now.get(t.id) })); },      // where they stand now (with the moves kept in this browser)
    show(items) {                                                          // each thing on its own, where the editor has it
      if (!split) {
        split = new THREE.Group(); split.name = 'placeEdit'; group.add(split);
        houses.visible = false; if (builtThings) builtThings.visible = false;
        for (const [i, t] of things.entries()) { t.view = viewOf(t); t.view.userData.place = i; if (!t.obj) split.add(t.view); }
      }
      for (const [i, it] of items.entries()) setView(i, it);
    },
    move: setView,                                                         // one thing moved (while a finger drags it)
    settle(i, it) {                                                        // it is down: built again for the ground where it now stands (its footing)
      const t = things[i];
      if (!split || t.obj) return;
      split.remove(t.view); t.view.userData.dispose();
      const at = { x: t.x, z: t.z, yaw: t.yaw };
      Object.assign(t, { x: it.x, z: it.z, yaw: it.yaw }); t.view = viewOf(t); Object.assign(t, at);
      t.view.userData.place = i; split.add(t.view); setView(i, it);
    },
    hide: unsplit,                                                         // back to the village as it was built
    pick(ray) {                                                            // which thing a ray from the camera meets first
      if (!split) return -1;
      const hits = ray.intersectObjects([split, ...things.filter(t => t.obj).map(t => t.obj)], true);
      for (const h of hits) { let o = h.object; while (o && o.userData.place === undefined) o = o.parent; if (o) return o.userData.place; }
      return -1;
    },
    size: i => { const t = things[i]; return t.foot ? Math.hypot(...t.foot) / 2 : t.kind === 'tree' ? 2.2 : t.kind === 'well' ? 1.6 : 0.9; },
    top: i => { const t = things[i]; return t.top || (t.kind === 'tree' ? 13 : 2.2); },      // (how high over the ground its name is shown)
    clash(i, it) {                                                         // what is wrong with where it is put: words, or ''
      const t = things[i], c = Math.cos(it.yaw), sn = Math.sin(it.yaw);
      const [w, l] = t.foot || [1.2, 1.2], spots = [];
      for (let a = -0.5; a <= 0.501; a += 0.25) for (let b = -0.5; b <= 0.501; b += 0.25) spots.push([it.x + a * (w - 1.2) * c + b * (l - 1.2) * sn, it.z - a * (w - 1.2) * sn + b * (l - 1.2) * c]);
      if (spots.some(([x, z]) => !inMap(x, z))) return 'อยู่นอกแมพ';
      if (spots.some(([x, z]) => waterDepthAt(x, z) > 0.05)) return 'ลงไปในน้ำ';
      if (t.foot && spots.some(([x, z]) => wayAt(x, z))) return 'ทับทางเดิน';
      if (t.foot) { const { deep } = t.lift(it.x, it.z, it.yaw); if (deep > 1.2) return 'ตั้งคร่อมผา ฐานสูง ' + deep.toFixed(1) + ' ม.'; }
      else if (spots.some(([x, z]) => slope(x, z) > 0.9)) return 'อยู่บนหน้าผา';
      return '';
    },
  };
  return {
    group, map, field, grass, terrain, heightAt: H, standAt, waterDepthAt, colliders, crowns: [], cameraTrunks, spawn: P.spawn, radius: 1e4, walkable, views, placeEdit, pathEdit,
    keepClear: (x, z) => slope(x, z) > 0.6 || paths.near(x, z).d < 2.5 || inField(x, z, 1),
    name: 'หมู่บ้านบนเขาและหุบเขา (heightmap)', stats: { trees: plants.length, groves: groves.length, look, water: water.report },
    map: url(M.map),
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
      if (camera) { rocks.userData.update(camera); wet.userData.update(camera); }      // (each rock as finely as its distance calls for)
      wheel.rotation.x += dt * 0.5;
      if (scene && camera) {
        frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        camWorld.setFromMatrixPosition(camera.matrixWorld);
        // what is out of view is not drawn: a grove, a bed of flowers (nor one too far off to see)
        for (const g of inView) g.obj.visible = frustum.intersectsBox(g.box) && (!g.far || g.box.distanceToPoint(camWorld) < g.far);
        water.update(renderer, frustum, camWorld);                           // (a fall out of view or far away is not drawn either)
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
          for (const o of water.small) out.push(o);                           // (nor the spray and billows at the falls' feet: too small to tell in a mirror)
          optics.render(renderer, scene, camera, out, doThrough, doMirror);
        }
      }
      else water.update(renderer);
      const nowT = N._internal.shared.uTime.value;
      if (castBusy) { if (map.stepCast(2.5)) { castBusy = false; lastCast = nowT; cast.dir.copy(castSun); if (liveOps.length) { liveOps.forEach(stampOp); map.texture.needsUpdate = true; } } }
      else if (nowT - lastCast > 4 && (castSun.angleTo(wantSun) > 0.075 || Math.abs(castK - wantK) > 0.12)) { castSun.copy(wantSun); castK = wantK; castBusy = true; map.beginCast(sunShadows(castSun), castK); }
    },
    setSun(dir, k = 1) { wantSun.copy(dir); wantK = k; cast.k = Math.min(1, k * 1.2); },
    get sunCast() { return cast; },
    follow(pos, lookDir) { grass.userData.follow(pos, lookDir); W.WATER_WAKE.track(pos.x, pos.z, waterDepthAt(pos.x, pos.z)); sim.focus(pos.x, pos.z); },
  };
}
