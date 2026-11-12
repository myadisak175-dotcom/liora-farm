// hill-village-level.js  —  the hill village, on land drawn as a heightmap  (?map=hillvillage)
//
// One job: to lay a village out on the land of assets/heightmaps/hill-village.bin as its plan (hill-village.json beside it)
// says. Both come from tools/make-hill-village-heightmap.py, which is where the land and every place on it are decided: plateaus stepping
// down to a river, ramps where the ways climb, level ground under each building, the water's beds. This file reads them and
// puts the game's own things on top: the valley's land paint (strata on the cliffs), the ground picture and the fluffy grass,
// trodden dirt ways (ground-paths.js), the woods, the valley's clear water on a ribbon down each stretch and a fall where a
// terrace ends, and the village: houses put together from the building kit (village-kit.js), the windmill, a water mill with a
// turning wheel, a stone bridge, a keep, a market, fenced fields and a pasture (stylized-buildings.js, village-fields.js).
//
// The land picture is 641 x 641 raw 16-bit numbers (little-endian): 0 is plan.land.base metres, 65535 base + range. Places in
// the plan are metres from the middle of the map, x east and z south. To change the land or move anything: edit the tool, run
// it, reload. ?look=flat draws the kit's houses in flat colour patches instead of the kit's own painted pictures.
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
  cells: 500,                     // the ground's own grid (0.44 m)
  sails: /^polySurface142_/,      // the part of the windmill that turns
};
const TRUNK = { broadleaf: 0.42, oak: 0.55, pine: 0.38, birch: 0.24, sapling: 0.2 }, TREE_H = { broadleaf: 7.5, oak: 7.5, pine: 7.5, birch: 8, sapling: 4 };

export async function buildHillVillageLevel({ seed = 7, far = '#cde6f2', grassCount = 150000, sun = [-0.45, 0.62, 0.64], onStep = async () => {} } = {}) {
  const M = HILL_VILLAGE_MAP, look = new URLSearchParams(location.search).get('look') === 'flat' ? 'flat' : 'kit';
  const group = new THREE.Group(); group.name = 'hill-village';
  const url = p => new URL(p, import.meta.url).href;

  // ------------------------------------------------------------------ the land: read from the picture
  await onStep('อ่านแผนที่ความสูง');
  const fresh = { cache: 'no-cache' };                                    // (the land and the plan change together: never one from the browser's cache and one new)
  const [raw, P] = await Promise.all([fetch(url(M.land), fresh).then(r => r.arrayBuffer()).then(b => new Uint16Array(b)), fetch(url(M.plan), fresh).then(r => r.json())]);
  const { size: SIZE, play: PLAY, cells: n, base, range } = P.land, half = SIZE / 2, FR = half;      // (she walks on the middle PLAY metres each way; the rest is wooded hills to look at)
  const paths = createPaths({ paths: [...P.paths.map(p => ({ points: p.points, half: p.half })), ...P.yards.map(([x, z, r]) => ({ points: [[x - 0.3, z], [x + 0.3, z]], half: r }))], seed });      // (a yard: a short way as wide as the yard)
  const px = (i, j) => base + raw[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))] / 65535 * range;
  const heightFn = (x, z) => {                                             // bilinear between the picture's points; the ways lie a little below the grass
    const fx = (x + half) / SIZE * (n - 1), fz = (z + half) / SIZE * (n - 1), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (px(i, j) * (1 - u) + px(i + 1, j) * u) * (1 - v) + (px(i, j + 1) * (1 - u) + px(i + 1, j + 1) * u) * v + paths.sink(x, z);
  };
  const field = G.createHeightField({ radius: FR, cells: M.cells, heightFn });
  const H = field.heightAt;
  const slope = (x, z) => Math.hypot(H(x + 0.5, z) - H(x - 0.5, z), H(x, z + 0.5) - H(x, z - 0.5));
  const colliders = [], cameraTrunks = [], shade = [], bare = [], press = [], casters = [], plants = [];

  // the water: for every half metre of the map, how far the nearest water's edge is and how high that water stands
  const WS = 0.5, wn = Math.round(SIZE / WS) + 1, wEdge = new Float32Array(wn * wn).fill(99), wLevel = new Float32Array(wn * wn);
  for (const rows of P.brooks) for (const [bx, bz, lv, hw] of rows) {
    const reach = hw + 4, i0 = Math.max(0, Math.floor((bx - reach + half) / WS)), i1 = Math.min(wn - 1, Math.ceil((bx + reach + half) / WS));
    for (let j = Math.max(0, Math.floor((bz - reach + half) / WS)); j <= Math.min(wn - 1, Math.ceil((bz + reach + half) / WS)); j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * WS - half - bx, j * WS - half - bz) - hw, o = j * wn + i;
      if (d < wEdge[o]) { wEdge[o] = d; wLevel[o] = lv; }
    }
  }
  const brookAt = (x, z) => {
    const fx = Math.min(wn - 1.001, Math.max(0, (x + half) / WS)), fz = Math.min(wn - 1.001, Math.max(0, (z + half) / WS)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * wn + i;
    const d = (wEdge[o] * (1 - u) + wEdge[o + 1] * u) * (1 - v) + (wEdge[o + wn] * (1 - u) + wEdge[o + wn + 1] * u) * v;
    return d < 1.6 ? { d, level: wLevel[Math.round(fz) * wn + Math.round(fx)] } : null;      // (the level is never blended: two waters lie metres apart in height)
  };
  // the stone bridge's deck: where it lies (u along it, v across). On it she is over the water, not in it
  const br = P.bridge, bc = Math.cos(br.yaw), bs = Math.sin(br.yaw), bL = br.length;
  const deckUV = (x, z) => [(x - br.x) * bc - (z - br.z) * bs, (x - br.x) * bs + (z - br.z) * bc];
  const onDeck = (x, z) => { const [u, v] = deckUV(x, z); return Math.abs(u) < bL / 2 && Math.abs(v) < 1.0; };
  const waterDepthAt = (x, z) => { if (onDeck(x, z)) return 0; const b = brookAt(x, z); return b ? Math.max(0, b.level - H(x, z)) : 0; };      // (the player will not walk into water deeper than half a metre: without this the river under the bridge stopped her on it)
  const inRect = (f, x, z, pad = 0) => { const c = Math.cos(f.yaw), s = Math.sin(f.yaw), lx = (x - f.x) * c - (z - f.z) * s, lz = (x - f.x) * s + (z - f.z) * c; return Math.abs(lx) < f.w / 2 + pad && Math.abs(lz) < f.d / 2 + pad; };
  const inField = (x, z, pad = 0) => P.fields.some(f => inRect(f, x, z, pad));

  // ------------------------------------------------------------------ the woods, bushes and flowers, where the plan has them
  await onStep('ปลูกต้นไม้');
  const r = mulberry32(seed * 31);
  const tree = (x, z, type, scale) => {
    const y = H(x, z), rad = TRUNK[type] * scale;
    plants.push({ kind: 'tree', type, seed: 100 + plants.length, detail: 0.8, x, y: y - 0.05, z, rotY: r() * 6.28, scale });
    colliders.push([x, z, rad + 0.22]); cameraTrunks.push([x, z, rad + 0.12, y, y + TREE_H[type] * scale]);
    shade.push([x, z, 4 * scale, 0.4]); bare.push([x, z, rad * 1.5]); casters.push([x, z, TREE_H[type] * scale, 2.4 * scale, 0.7]);
  };
  const flowerBeds = [];
  for (const [kind, x, z, scale] of P.plants) {
    if (kind === 'bush') { plants.push({ kind: 'bush', type: r() < 0.35 ? 'flowering' : 'round', seed: 100 + plants.length, x, y: H(x, z), z, rotY: r() * 6.28, scale }); colliders.push([x, z, 0.7 * scale]); }
    else if (kind === 'flower') flowerBeds.push([x, z, scale]);
    else tree(x, z, kind, scale);
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
  const bEnd = s => [br.x + s * (bL / 2 - 0.4) * bc, br.z - s * (bL / 2 - 0.4) * bs];
  const by = Math.min(H(...bEnd(-1)), H(...bEnd(1))) - 0.12;
  builds.push(BD.place(BD.stoneBridgeGeometry({ length: bL, seed: 25 }), br.x, by, br.z, br.yaw));
  for (let u = -bL / 2; u <= bL / 2; u += 1) for (const v of [-0.8, 0.8]) bare.push([br.x + u * bc + v * bs, br.z - u * bs + v * bc, 1.3]);
  for (const s of [-1, 1]) for (const v of [-1.45, 1.45]) for (let u = 1; u <= bL / 2 + 0.6; u += 0.8) colliders.push([br.x + s * u * bc + v * bs, br.z - s * u * bs + v * bc, 0.42]);      // its parapets (and no stepping off its side)
  casters.push([br.x, br.z, 0.6, 4.2, 0.7]);
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

  // ------------------------------------------------------------------ the ground picture, the land, the grass
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    if (Math.abs(x) > FR - 0.5 || Math.abs(z) > FR - 0.5) return [0, 0, 0];
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
  const map = G.createGroundMap({ radius: FR, size: 1024, seed, heightAt: H, dirt: 0, shade, bare, press, paint, cast: sunShadows(L.clone()) });
  const fade = { far, fadeA: FR * 0.9, fadeB: FR * 0.995 };
  const terrain = G.createTerrain(field, map, fade);
  terrain.material.dispose();
  {                                                                        // the valley's land paint: grass on the flat, strata on the cliffs, sand by the water, earth in the fields
    const g = terrain.geometry, count = g.attributes.position.count, Pp = g.attributes.position;
    const bank = new Float32Array(count).fill(10), soil = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = Pp.getX(i), z = Pp.getZ(i), b = brookAt(x, z);
      if (b) bank[i] = Pp.getY(i) - b.level + b.d * 0.25;
      if (inField(x, z, 0.4)) soil[i] = 1;
    }
    g.setAttribute('aBank', new THREE.BufferAttribute(bank, 1));
    g.setAttribute('aPath', new THREE.BufferAttribute(soil, 1));
    g.computeVertexNormals();
    // the cliffs: rock painted with a brush (tools/make-cliff-paint.py), in place of the valley's strata. ?cliff=strata: as before
    let cliffPaint = null;
    if (new URLSearchParams(location.search).get('cliff') !== 'strata') try {
      cliffPaint = await new THREE.TextureLoader().loadAsync(url(M.cliff));
      cliffPaint.wrapS = cliffPaint.wrapT = THREE.RepeatWrapping; cliffPaint.anisotropy = 4; cliffPaint.colorSpace = THREE.NoColorSpace;      // (the kit shades display colours)
    } catch (err) { console.warn('[hill-village] cliff paint', err); }
    terrain.material = T._terrain.terrainMaterial(far, [FR, FR], 0, { cliffPaint });
    if (cliffPaint) terrain.userData.dispose = (d => () => { d(); cliffPaint.dispose(); })(terrain.userData.dispose);
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
  if (plants.length) group.add(N.createForest(plants));
  { let fs = seed * 71; const pal = [['#f4a6bc', '#f6f2e6'], ['#f7d84a', '#f6f2e6'], ['#b9a3e8', '#93b8ee']];
    for (const [x, z, rad] of flowerBeds) group.add(N.createFlowers({ count: Math.round(26 * rad), radius: rad, seed: ++fs, heightAt: H, center: [x, z], colors: pal[fs % 3] })); }

  // ------------------------------------------------------------------ the water: the valley's clear water on a ribbon down each stretch, a fall where a terrace ends
  await onStep('เติมน้ำ');
  const foamTexture = await W.loadFoamTexture(), animeCells = createAnimeCells();
  const droplets = createWaterDroplets({ time: N._internal.shared.uTime });
  droplets.points.userData.dispose = droplets.dispose;
  group.add(droplets.points);
  const WL = (P.waters.find(w => w.id === 'river') || P.waters[0]).level;      // (the waves and the mirror are worked out on one level: the river's, by the bridge)
  const sim = W.createWaterSim({ rect: [P.spawn.x - 24, P.spawn.z - 24, 48], size: 512, field, foamTexture, level: WL, follow: true });
  const optics = W.createWaterOptics({ level: WL });
  const waterMat = W.waterMaterial({ field, animeCells, sim, optics, foamTexture, far, ...fade });
  const ribbon = rows => {                                                 // a strip of water down a stretch, each row at its own height and width
    const pos = [], flow = [], dir = [], idx = [], across = 10;
    let F = 0;
    rows.forEach((s, k) => {
      const a = rows[Math.max(0, k - 1)], b = rows[Math.min(rows.length - 1, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (k > 0) F += Math.hypot(s[0] - a[0], s[1] - a[1]);
      for (let i = 0; i <= across; i++) { const u = -1 + 2 * i / across, hw = s[3] + 0.5; pos.push(s[0] - tz * u * hw, s[2], s[1] + tx * u * hw); flow.push(F, u * hw, 1); dir.push(tx, tz); }
    });
    for (let k = 0; k < rows.length - 1; k++) for (let i = 0; i < across; i++) { const a = k * (across + 1) + i, b = a + across + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3)); g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, waterMat); m.renderOrder = 1; m.name = 'water';
    m.userData = { kind: 'water', dispose() { g.dispose(); } };
    group.add(m);
    return m;
  };
  const waters = P.brooks.map(ribbon);
  const fallUpdates = [];
  for (const f of P.falls) {
    const c = createWaterfall({ x: 0, z: 0, top: f.top, bottom: f.bottom, width: f.width, forward: Math.min(2.2, 0.6 + (f.top - f.bottom) * 0.12), scale: Math.min(1, Math.max(0.6, f.width / 9)), foamTexture, cells: animeCells });
    c.group.position.set(f.x, 0, f.z); c.group.rotation.y = f.yaw;
    c.group.userData = { kind: 'waterfall', dispose: c.dispose };
    group.add(c.group);
    fallUpdates.push(c);
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
  const waterSpheres = P.brooks.map(rows => { const b = new THREE.Box3(); for (const q of rows) b.expandByPoint(new THREE.Vector3(q[0], q[2], q[1])); return b.getBoundingSphere(new THREE.Sphere()); });
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), camWorld = new THREE.Vector3();
  let frameNo = 0;
  terrain.layers.enable(W.UNDERWATER);

  // ------------------------------------------------------------------ where she may walk; the sun; what the game asks of a level
  let castSun = L.clone(), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false;
  const cast = { dir: castSun.clone(), k: 1 };
  const inMap = (x, z) => Math.abs(x) < PLAY - 1 && Math.abs(z) < PLAY - 1;
  const walkable = (x, z) => inMap(x, z) && (onDeck(x, z) || (slope(x, z) < 0.9 && waterDepthAt(x, z) < 1.05));      // off the cliffs, out of deep water
  const standAt = (x, z) => onDeck(x, z) ? by + BD.stoneBridgeDeck(deckUV(x, z)[0], { length: bL }) : H(x, z);
  console.info('[hill-village] look', look, '· kit triangles', houses.userData.triangles, '· trees and bushes', plants.length);
  group.userData = { kind: 'hill-village', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); kit.dispose(); waterMat.dispose(); sim.dispose(); optics.dispose(); map.dispose(); field.texture.dispose(); } };
  const views = {};
  for (const [name, [x, z, yaw]] of Object.entries(P.views)) views[name] = { x, z, yaw };
  return {
    group, map, field, grass, terrain, heightAt: H, standAt, waterDepthAt, colliders, crowns: [], cameraTrunks, spawn: P.spawn, radius: FR * 0.9 - 3, walkable, views,
    keepClear: (x, z) => slope(x, z) > 0.6 || paths.near(x, z).d < 2.5 || inField(x, z, 1),
    name: 'หมู่บ้านบนเขา (heightmap)', stats: { trees: plants.length, look },
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
      for (const c of fallUpdates) c.update(renderer);
      if (mill) mill.update(dt);
      wheel.rotation.x += dt * 0.5;
      if (scene && camera) {                                               // (the water's two pictures: only when water is on screen and near)
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
