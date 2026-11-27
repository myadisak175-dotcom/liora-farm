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
// West of the village lies the west fringe, the neglected countryside where the game begins: its own heightmap, joined on at
// the land's west edge as it is read (west-fringe.js). Here it is only one wider land with a second part she may walk in.
//
// ?curse=1: the land as the curse leaves it (drought.js): dead all round and the village nearly so, and the water drawn down
// below every lip: no fall runs, only murky pools are left, dark mist rising off them now and then (dark-mist.js). The same
// land and plan: only how dead it is and how high the water stands.
//
// ?green=1 (a trial): the west fringe healed (west-fringe.js, alive; west-fringe-water.js): nothing dead there, and its dry
// water is water again, said in the plan's own words before anything is made from it. Not under the curse.
//
// ?farm=1 (a trial): her farm, south of the road in, a step from where she starts: its ground (farm-soil.js) and what lies
// on it before it is dug (farm-debris.js), as level.farm; what she does there is farm-tools.js's (index.html).
//
// The east lake and its ruins (in the game since 28 Nov 2026, the user: "Ok ขึ้นเมน หลัก"; a trial behind ?east=1 before):
// joined on past the land's east edge (east-ruins.js): a lake with cliffs and ledges of rock round it, four falls into it,
// the ruins' and the temple's floors. The land is then wider than it is long: the ground's grid and picture (a square) grow
// with it, so they are as fine as before. ?east=0: the land without it, as it was (to compare).

// A wood's floor under trees that stand close together, and wherever it was painted by hand (the path painter's 🍂): the
// ways' own earth with dry leaves and moss in patches, the grass there thinner and shorter, kept off cliffs and steep slopes
// (forest-floor.js: where; stylized-terrain.js, floor: its paint). ?forest=damp: the first set, dark damp earth, kept for a
// zone of ancient ruins; ?forest=0: none.
//
// FAR, LIGHTER (27 Nov 2026: the user's iPhone heats in play and drops its frames after a few minutes; offered to have what
// is far off drawn less and what is near her as it was, she said "ทำค่ะ"). What is far off and too small to tell is drawn
// less, round her nothing changes:
//   - the ferns and tufts (ground cover): thinner from 32 m (a half), from 55 m (a quarter), none past 85 m; the beds of
//     flowers none past 85 m (they were 110)
//   - a far crown's leaf cards fewer from nearer: the share drawn falls from 12 m (for the tree's size) to 36 m, where it
//     fell from 16 m to 48 m; falling leaves only from a grove within some 30 m (anime-tree.js, FAR_ON, FALL_NEAR)
//   - in the water's mirror no ferns, tufts or flowers further off than 20 m
//   - the water's ripples (the simulation round her) only worked out when some water is within 45 m of her: further off
//     there is none in its square to show them
// The land's paint and the grass skip what is never seen (stylized-terrain.js, stylized-grassfield.js: the same picture),
// what never moves has its place worked out once (STILL, below), and the clouds' picture is made anew half as often
// (index.html, applyPicture). ?far=full: all that is drawn as it was, to compare.
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
import { createAnimeForest, setAnimeSun, BUSH_SIZE } from './anime-tree.js';
import { createFrondPineForest, setFrondPineSun } from './frond-pine.js';
import { createFlowerDrift, setFlowerSun } from './meadow-flowers.js';
import { createGroundCover, setGroundCoverSun } from './ground-cover.js';
import { createWaterDroplets } from './water-droplets.js';
import { waterLookup, createLandWater } from './land-water.js';
import { createAbyssClouds, createAbyssFalls } from './abyss-scene.js';
import { createPaths, loadPathTextures } from './ground-paths.js';
import { loadSpinner, propMaterial } from './stylized-props.js';
import { loadVillageKit } from './village-kit.js';
import { fieldGeometry } from './village-fields.js';
import { createRockKit, sampleKitSurface } from './rocks.js';
import { placeKey, placeables, applyPlaceEdits, itemsFrom } from './place-edits.js';
import { foliageKey, applyFoliage } from './foliage-edits.js';
import { pathKey, loadPathOps, settlePathOps, foldPathOps, foldFloorOps, opBox, grassOver, floorOver, isWay, createPaveField } from './path-edits.js';
import { createMapRim } from './map-rim.js';
import { joinWestFringe } from './west-fringe.js';
import { joinEastRuins } from './east-ruins.js';
import { droughtWater, droughtPools, cursedLand } from './drought.js';
import { createDarkMist } from './dark-mist.js';

const { mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const FAR_FULL = typeof location !== 'undefined' && new URLSearchParams(location.search).get('far') === 'full';      // FAR, LIGHTER (above): ?far=full, all as it was

export const HILL_VILLAGE_MAP = {
  land: './assets/heightmaps/hill-village.bin', plan: './assets/heightmaps/hill-village.json', windmill: './assets/models/windmill.glb',
  cliff: './assets/ground/cliff-paint.webp',      // the cliffs' painted rock (tools/make-cliff-paint.py)
  sand: './assets/ground/sand-paint.webp',        // the banks' painted sand (tools/make-path-paint.py sand: the ways' own brush)
  dry: './assets/ground/dry-paint.webp',          // the dead land's painted dry earth, its cracks in its alpha (tools/make-path-paint.py dry)
  forest: {                                       // a wood's floor, two sets (tools/make-forest-paint.py): in the ways' own earth (the game's), and dark
    path: './assets/ground/forest-path-paint.webp', // and damp, a jungle's, kept for the ancient ruins (?forest=damp)
    damp: './assets/ground/forest-damp-paint.webp',
  },
  bare: './assets/heightmaps/hill-village-bare.png',      // where the rain's runnels have worn the grass away, on the land's own grid (the heightmap tool, 7b)
  map: './assets/maps/hill-village-map.json',      // the map's picture and what it covers (tools/make-hill-village-map.py; game-map.js shows it)
  mapGreen: './assets/maps/hill-village-map-green.json',      // (the same with the west fringe healed, ?green=1: its land green, its trees in leaf, its water back)
  mapCursed: './assets/maps/hill-village-map-cursed.json',      // (the same under the curse: the land dead, the water's beds dry; the pools are painted on it as the level loads)
  mapEast: './assets/maps/hill-village-map-east.json',          // (the same with the east lake joined on, as the game has it; and under the curse, and with the west fringe healed)
  mapEastCursed: './assets/maps/hill-village-map-east-cursed.json',
  mapEastGreen: './assets/maps/hill-village-map-east-green.json',
  paths: 'soft',                  // the ways' look (ground-paths.js): smooth painted earth with no line at its edge. ?paths=grit: as before
  cells: 852,                     // the ground's own grid (0.5 m)
  pieces: [3, 6],                 // the ground is drawn in this many pieces across and down, the woods in groves GROVE metres square
  grove: 80,
  valley: { floor: 0.45, flat: 3, side: 0.42, reach: 48 },      // the valley a water comes in by (the plan's inflows): its floor above the water, half the floor's width, how its sides rise, how far they can reach
  rim: 120,                       // past the land's edge it runs on into meadow hills with woods on them (map-rim.js): the far hills stand at least this many metres past the land's corners
  // the far hills of this map (stylized-sky.js, in place of its own; near -> far, sizes as there, before they are moved out):
  // green foothills with pasture and wood, wooded mountain sides, then two ranges of bare rock with snow on their peaks
  alps: [
    { r: 170, h: [8, 30], top: '#7ba463', lit: '#9cc078', base: '#c2ddc6', trees: 1.4, seg: 900, f: 3.4 },
    { r: 232, h: [22, 64], top: '#5d9079', lit: '#7fae8c', base: '#bcd9e0', trees: 0.9, seg: 700, f: 2.9, sharp: 0.25 },
    { r: 315, h: [40, 128], top: '#7c9bbd', lit: '#9cb7d2', base: '#c9e1ee', trees: 0, seg: 620, f: 2.4, sharp: 0.6, snow: [84, 100, 26] },
    { r: 410, h: [55, 190], top: '#9ab5d3', lit: '#b6cce3', base: '#d3e8f2', trees: 0, seg: 560, f: 2.0, sharp: 0.7, snow: [100, 120, 34] },
  ],
  sails: /^polySurface142_/,      // the part of the windmill model that is used: its sails (the rest of the mill is of the kit)
};
const TRUNK = { broadleaf: 0.45, oak: 0.7, pine: 0.38, birch: 0.22, sapling: 0.2 }, TREE_H = { broadleaf: 8.6, oak: 7.1, pine: 10.8, birch: 9.3, sapling: 4.5 };
// a tree's leaves as balls the camera keeps out of (player.js: it comes in under the canopy instead of diving into the leaves): [height of the middle, radius], at size 1 (measured off anime-tree.js's trees)
const CROWN = { oak: [[3.9, 3.2]], broadleaf: [[6.2, 2.4], [4.4, 1.9]], birch: [[7.8, 1.5], [5.6, 1.3]], pine: [[6.5, 1.6]], sapling: [[3.4, 1.05]] };      // (the anime trees of anime-tree.js; the pines are frond-pine.js's)
const ROCK_R = { boulder: 1.0, stones: 0.8, river: 0.7, pebbles: 0 };      // (how far round a rock of the plan she cannot walk, times its size)

export async function buildHillVillageLevel({ seed = 7, far = '#cde6f2', grassCount = 150000, sun = [-0.45, 0.62, 0.64], onStep = async () => {} } = {}) {
  const M = HILL_VILLAGE_MAP, look = new URLSearchParams(location.search).get('look') === 'flat' ? 'flat' : 'kit';
  const group = new THREE.Group(); group.name = 'hill-village';
  // STILL: what never moves once it is built has its place worked out once, not again every frame (three.js does so for
  // every thing in the scene that does not say otherwise, some 2700 here: a fifth of the page's own work for a frame, for
  // nothing). The level's own group, and the woods, the beds of flowers, the ferns and tufts and the land; what moves (the
  // falls' spray, the wheel, the sails ...) still is, each by itself (index.html: the scene does not move either)
  group.matrixAutoUpdate = false;
  const still = o => {
    o.traverse(c => { c.updateMatrix(); c.matrixAutoUpdate = false; });
    const own = o.updateMatrixWorld;                                       // (nor gone through each frame: only while it is new, or once moved by hand)
    o.updateMatrixWorld = function (force) { if (force || this.matrixWorldNeedsUpdate) own.call(this, true); };
    return o;
  };
  const url = p => new URL(p, import.meta.url).href;

  // ------------------------------------------------------------------ the land: read from the picture
  await onStep('อ่านแผนที่ความสูง');
  const fresh = { cache: 'no-cache' };                                    // (the land and the plan change together: never one from the browser's cache and one new)
  let [raw, P, bareImg] = await Promise.all([fetch(url(M.land), fresh).then(r => r.arrayBuffer()).then(b => new Uint16Array(b)), fetch(url(M.plan), fresh).then(r => r.json()),
    fetch(url(M.bare), fresh).then(r => r.ok ? r.blob() : null).then(b => b && createImageBitmap(b)).catch(() => null)]);
  // where the rain's runnels have left the earth bare: read once into bytes, on the land's own grid as the heightmap tool wrote it
  const worn = (() => {
    if (!bareImg) return null;
    const c = document.createElement('canvas'); c.width = bareImg.width; c.height = bareImg.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bareImg, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data, out = new Uint8Array(c.width * c.height);
    for (let k = 0; k < out.length; k++) out[k] = px[k * 4];
    return { nx: c.width, nz: c.height, x0: P.land.x0, z0: P.land.z0, cell: P.land.cell, v: out };
  })();
  let eastSeam = Infinity;                                                 // (with the east lake: past the seam the land is the east land's, and the old margin's runnels are not on it)
  const bareAt = (x, z) => {
    if (!worn || x > eastSeam) return 0;
    const u = (x - worn.x0) / worn.cell, v = (z - worn.z0) / worn.cell;
    if (u < 0 || v < 0 || u >= worn.nx - 1 || v >= worn.nz - 1) return 0;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, o = j * worn.nx + i, b = worn.v;
    return ((b[o] * (1 - fu) + b[o + 1] * fu) * (1 - fv) + (b[o + worn.nx] * (1 - fu) + b[o + worn.nx + 1] * fu) * fv) / 255;
  };
  // ?green=1 (a trial): the west fringe as it will be when it is healed: green, in leaf, its water back (west-fringe.js,
  // alive). The curse's world is the curse's: ?curse=1 has the fringe dead whatever else is asked
  const green = (q => q.has('green') && !q.has('curse'))(new URLSearchParams(location.search));
  const west = await joinWestFringe({ raw, plan: P, url, alive: green });  // the west fringe: the land wider to the west, the plan with its ways and places
  raw = west.raw;
  // the east lake and its ruins, past the land's east edge (east-ruins.js): the land wider to the east, the plan with its ways,
  // its water and its places (?east=0: without it, as the land was before it went in)
  const east = new URLSearchParams(location.search).get('east') !== '0' ? await joinEastRuins({ raw, plan: P, url }) : null;
  if (east) { raw = east.raw; eastSeam = east.seam; }
  const placeBase = placeables(P), placed = applyPlaceEdits(P, placeKey('hillvillage'));      // the things moved by hand, kept in this browser
  const foliage = applyFoliage(P, foliageKey('hillvillage'));              // and the plants arranged by hand (the foliage editor): while kept here they are the map's, all of them
  const { x0: X0, z0: Z0, cell, nx, nz, base, range, play } = P.land;     // (she walks inside play: x0, x1, z0, z1; the rest is wooded hills to look at)
  const X1 = X0 + (nx - 1) * cell, Z1 = Z0 + (nz - 1) * cell, CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2, FR = Math.max(Z1 - Z0, X1 - X0) / 2, HX = (X1 - X0) / 2;      // FR: half its length (the longer way); CX: its middle across (0, but for a land made wider on one side)
  const plays = [play, ...(P.land.more || [])];                           // every part she may walk in (one, but for a land joined to another)
  const inPlay = (x, z, inset = 0) => plays.some(q => x > q[0] + inset && x < q[1] - inset && z > q[2] + inset && z < q[3] - inset);
  // The ground made even under what was moved by hand in this browser, as the map's tool makes it when the move goes into the
  // map for everyone (level_ground there: the middle height of the ground in a circle, feathered out into the land round it).
  // So a moved house or market stall stands on a floor of its own, and is not half sunk in a slope. (The land's heights
  // themselves are changed, before anything is made from them: the ground, the grass, her feet all follow.)
  const PADS = { stall: 2.2, 'kit:Prop_Wagon': 2.2, cart: 2.0, hay: 1.3, table: 1.3, woodpile: 1.2, bench: 1.1, barrels: 1.0, crates: 1.0 };      // metres round a small thing (the tool's own; a lamp, a signpost, a sheep stand on the ground as it is)
  const levelGround = (x, z, r, feather = 0.6) => {
    const out = r * (1 + feather), i0 = Math.max(0, Math.floor((x - out - X0) / cell)), i1 = Math.min(nx - 1, Math.ceil((x + out - X0) / cell)), j0 = Math.max(0, Math.floor((z - out - Z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((z + out - Z0) / cell));
    const far = (i, j) => Math.hypot(X0 + i * cell - x, Z0 + j * cell - z), inside = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (far(i, j) < r) inside.push(raw[j * nx + i]);
    if (!inside.length) return;
    const level = inside.sort((a, b) => a - b)[inside.length >> 1];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let w = Math.min(1, Math.max(0, 1 - (far(i, j) - r) / (r * feather))); w = w * w * (3 - 2 * w);
      if (w > 0) raw[j * nx + i] = Math.round(raw[j * nx + i] * (1 - w) + level * w);
    }
  };
  for (const m of placed.used) {
    const b = P.buildings.find(q => q.id === m.id), r = b ? (b.pad > 1.5 ? b.pad : 0) : PADS[m.id.split('@')[0]] || 0;
    if (r) levelGround(m.to[0], m.to[1], r);
  }
  const pathStyle = new URLSearchParams(location.search).get('paths') === 'grit' ? 'grit' : M.paths;
  const px = (i, j) => base + raw[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))] / 65535 * range;
  const landAt = (x, z) => {                                               // the picture's own height: bilinear between its points
    const fx = (x - X0) / cell, fz = (z - Z0) / cell, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (px(i, j) * (1 - u) + px(i + 1, j) * u) * (1 - v) + (px(i, j + 1) * (1 - u) + px(i + 1, j + 1) * u) * v;
  };
  // where the waters come from (the plan's inflows: the map's tool, 10). No water rises at a spot she can look at: the upper
  // stream and the two meadow brooks each come in from the margin, out of a small valley through its hills and round the foot
  // of a knoll that hides where the water begins. The land is cut for each here, as it is read (the picture itself is left as
  // it was, so the tool's plants stand where they stood): the knoll, a valley with a floor a little above the water and sides
  // of grass that lie back at about 40%, and the water's bed with its banks. The water is laid on as part of the stretch it
  // flows into (its rows put before that stretch's own), so sheet, shore, sand and wading are worked out as for any water
  const inflows = (P.inflows || []).map(f => {
    const head = P.brooks[f.stretch][0], rows = [...f.rows, [head[0], head[1], head[3]]], xs = rows.map(q => q[0]), zs = rows.map(q => q[1]);
    P.brooks[f.stretch] = [...f.rows.map(([x, z, hw]) => [x, z, f.level, hw]), ...P.brooks[f.stretch]];
    return { ...f, rows, box: [Math.min(...xs) - M.valley.reach, Math.max(...xs) + M.valley.reach, Math.min(...zs) - M.valley.reach, Math.max(...zs) + M.valley.reach] };
  });
  const nearInflow = (f, x, z) => {                                        // metres from its line, and half the water's width there
    let best = 1e9, hw = 1;
    for (let i = 0, q = f.rows; i < q.length - 1; i++) {
      const ax = q[i][0], az = q[i][1], bx = q[i + 1][0] - ax, bz = q[i + 1][1] - az, t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1))), d = Math.hypot(x - ax - bx * t, z - az - bz * t);
      if (d < best) { best = d; hw = q[i][2] + (q[i + 1][2] - q[i][2]) * t; }
    }
    return [best, hw];
  };
  const inflowCut = (x, z, y) => {
    for (const f of inflows) {
      if (x < f.box[0] || x > f.box[1] || z < f.box[2] || z > f.box[3]) continue;
      const [kx, kz, kh, kr] = f.knoll, V = M.valley, [d, hw] = nearInflow(f, x, z);
      y += kh * Math.exp(-((x - kx) ** 2 + (z - kz) ** 2) / (2 * kr * kr));
      y = Math.min(y, f.level + V.floor + V.side * (1 + 0.22 * Math.sin(x * 0.21 + z * 0.13)) * Math.pow(Math.max(0, d - V.flat), 1.06));      // (no two metres of its sides alike)
      if (d < hw) y = Math.min(y, f.level - 0.12 - 0.3 * (1 - (d / hw) ** 2));                                    // the bed
      else if (d < hw + 2.2) { const k = ss(0, 1, (d - hw) / 2.2); y = Math.min(y, (f.level + 0.22) * (1 - k) + y * k); }      // its banks come down to the water's edge
    }
    return y;
  };
  const toolWays = [...P.paths.map(p => ({ points: p.points.slice(), half: p.half })), ...P.yards.map(([x, z, r]) => ({ points: [[x - 0.3, z], [x + 0.3, z]], half: r }))];      // (a yard: a short way as wide as the yard)
  const pathOps = [...(P.pathOps || []), ...settlePathOps(pathKey('hillvillage'), P.pathOps, 'hillvillage')].filter(o => !isWay(o) || o.pts.length >= 2);      // (those the map has are let go from this browser)
  // a way that ends out in the margin (the road in) does not stop there: it runs on to the land's edge, and from there the
  // rim takes it into its wood (map-rim.js)
  const waysOut = [];
  for (const w of toolWays) for (const last of [false, true]) {
    const pts = w.points, a = last ? pts[pts.length - 1] : pts[0], b = last ? pts[pts.length - 2] : pts[1];
    if (inPlay(a[0], a[1])) continue;
    if (pathOps.some(o => o.k === 'grass' && grassOver(o, a[0], a[1]) > 0.5)) continue;      // (grass painted over its end by hand: that way is gone)
    const len = Math.hypot(a[0] - b[0], a[1] - b[1]), dx = (a[0] - b[0]) / len, dz = (a[1] - b[1]) / len;
    const t = Math.min(dx > 0 ? (X1 - a[0]) / dx : dx < 0 ? (X0 - a[0]) / dx : 1e9, dz > 0 ? (Z1 - a[1]) / dz : dz < 0 ? (Z0 - a[1]) / dz : 1e9);      // metres on to the edge, the way it is going
    if (t > 45) continue;                                                // (it is not on its way out)
    const e = [a[0] + dx * t, a[1] + dz * t];
    if (last) pts.push(e); else pts.unshift(e);
    waysOut.push({ x: e[0], z: e[1], dx, dz, half: w.half, run: t, y0: inflowCut(a[0], a[1], landAt(a[0], a[1])) });
  }
  // the land under those last metres is laid for the way: the tool's way ends against the margin's hill, so from there on it
  // climbs gently (16%) through a cutting with soft banks of earth and grass, and goes out over a dip in the hill's crest
  const cutting = (x, z, y) => {
    for (const w of waysOut) {
      const rx = x - w.x, rz = z - w.z, u = rx * w.dx + rz * w.dz + w.run, v = Math.abs(rx * w.dz - rz * w.dx);      // u: metres past the tool's end of the way
      if (u < -5 || v > w.half + 11) continue;
      y = Math.min(y, y + (w.y0 + 0.16 * Math.max(0, u) - y) * ss(-5, 0, u) * (1 - ss(w.half + 0.8, w.half + 11, v)));
    }
    return y;
  };
  // the ways painted by hand (path-brush.js): those the map's tool has taken in (P.pathOps), then those kept in this browser,
  // in the order they were painted (path-edits.js). Each painted way is a way like the others; grass painted over a way hides it
  const paths = createPaths({ paths: [...toolWays, ...pathOps.filter(isWay).map(o => ({ points: o.pts, half: o.half }))], seed, style: pathStyle });
  // PAVING (path-edits.js, createPaveField; drawn by the land with the ways: ground-paths.js): flat stones laid in the ways where a
  // paving stroke was painted, by the strokes in the order they were painted. ?pave=demo lays stones in the yards the plan marks
  // as paved (the market round the well, the keep's and the manor's), under all that was painted by hand, to see them by
  // (over the map's own strokes, which ran ways all over the market, and under this browser's, so that new ones still go over them)
  const paveDemo = new URLSearchParams(location.search).get('pave') === 'demo'
    ? P.yards.filter(y => y[3]).map(([x, z, r]) => ({ k: 'pave', half: r - 0.4, pts: [[x - 0.3, z], [x + 0.3, z]] })) : [];
  const nBaked = pathOps.length - pathOps.filter(o => !(P.pathOps || []).includes(o)).length;      // (the map's strokes come first in pathOps)
  const paved = createPaveField([...pathOps.slice(0, nBaked), ...paveDemo, ...pathOps.slice(nBaked)]);
  paths.pave(paved.at);
  const wayPaint = o => o.paint || (o.paint = createPaths({ paths: [{ points: o.pts, half: o.half }], seed, style: pathStyle }).paint);
  const pathPaint = foldPathOps(pathOps.length ? createPaths({ paths: toolWays, seed, style: pathStyle }).paint : paths.paint, pathOps, wayPaint);      // (a yard: a short way as wide as the yard)
  const heightFn = (x, z) => cutting(x, z, inflowCut(x, z, landAt(x, z))) + (Math.abs(x - CX) < HX + 2 ? paths.sink(x, z) : 0);      // (the ways lie a little below the grass)
  const wider = FR / ((Z1 - Z0) / 2);                                     // 1, but for a land made wider than it is long (the east lake's): the grid and the ground's picture grow with it, as fine as before
  const field = G.createHeightField({ radius: FR, center: [CX, CZ], cells: Math.round(M.cells * wider), heightFn });      // (a square as long as the land: wider than it, and only the land's part is drawn)
  const H = field.heightAt;
  const slope = (x, z) => Math.hypot(H(x + 0.5, z) - H(x - 0.5, z), H(x, z + 0.5) - H(x, z - 0.5));
  const colliders = [], cameraTrunks = [], crowns = [], shade = [], bare = [], press = [], casters = [], plants = [];

  // under the curse (?curse=1) the land is dead all round and the village nearly so, and the water is drawn down: every
  // stretch stands lower (drought.js), the falls thin. Its beds and banks are the land's: only how high the water stands changes
  const cursed = new URLSearchParams(location.search).has('curse');
  const drought = cursed ? droughtWater({ stretches: P.brooks, heightAt: H, names: (P.waters || []).map(w => w.id) }) : null;
  const lower = drought ? drought.lower : [];
  const standing = P.brooks.map((rows, k) => lower[k] ? rows.map(([x, z, l, hw]) => [x, z, l - lower[k], hw]) : rows);
  const deadAt = cursed ? cursedLand({ plan: P, rect: [X0, Z0, X1 - X0, Z1 - Z0], west }).at : west.deadAt;

  // the water: where it lies and how high it stands (land-water.js)
  const brookAt = waterLookup(standing, { x0: X0, z0: Z0, x1: X1, z1: Z1 }).at;
  // how high a spot stands above the water beside it (and a quarter of how far out from the water's edge it is), or 10 with no
  // water near: the land's sand and the ways' wet earth both go by it, so they agree on where the ground is wet
  // (A flooded pond, the healed fringe's: west-fringe-water.js. Its line's widths say only where it MAY lie, wider than it
  // is, so beside it a spot is as near the water as it stands low over it, and no nearer for lying inside those widths)
  const ponds = [...(west.water ? west.water.ponds : []), ...(east ? east.water.ponds : [])];
  const pondAt = (x, z, b) => ponds.some(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && Math.abs(b.level - q.level) < 1e-3);
  const bankAt = (x, z, y = H(x, z)) => { const b = brookAt(x, z); return b ? y - b.level + (ponds.length && pondAt(x, z, b) ? Math.max(0, b.d) : b.d) * 0.25 : 10; };
  // the bridges' decks: where each lies (u along it, v across) and how high its boards are. On one she is over the water, not in it.
  // UNDER A BRIDGE: asked with her height (y), a deck is hers only while she is no more than UNDER below its boards: further
  // down she is on the ground under it (the bed under the stone bridge's arch, where the curse has drawn the river down to
  // pools), and walks there as anywhere else. A deck with an arch (arch: how high its underside is, u metres from its middle,
  // over its base) lets her through only where there is HEADROOM under it; elsewhere its piers are solid (walkable). Asked
  // without a height, a deck is hers wherever it lies, as before
  const decks = [], UNDER = 1.0, HEADROOM = 1.9;
  const deckUV = (d, x, z) => { const c = Math.cos(d.yaw), s = Math.sin(d.yaw); return [(x - d.x) * c - (z - d.z) * s, (x - d.x) * s + (z - d.z) * c]; };
  // (a deck's way is halfW either side of its line; its body, over her when she is under it, is wide either side)
  const deckIn = (x, z, body = false) => { for (const d of decks) { const [u, v] = deckUV(d, x, z); if (Math.abs(u) < d.len / 2 && Math.abs(v) < (body ? d.wide || d.halfW : d.halfW)) return [d, u]; } return null; };
  const deckAt = (x, z, y) => { const f = deckIn(x, z); return f && (y === undefined || y > f[0].y(f[1]) - UNDER) ? f[0] : null; };
  // under a deck (at height y): how high its arch is over the ground there (-Infinity: its solid pier; null: not under a deck)
  const archOver = (x, z, y) => { const f = deckIn(x, z, true); if (!f || y === undefined || y > f[0].y(f[1]) - UNDER) return null; const [d, u] = f; return d.arch ? d.arch(u) - H(x, z) : -Infinity; };
  const waterDepthAt = (x, z, y) => { if (deckAt(x, z, y)) return 0; const b = brookAt(x, z); return b ? Math.max(0, b.level - H(x, z)) : 0; };      // (the player will not walk into water deeper than half a metre: without the decks the river under a bridge stopped her on it)
  const inRect = (f, x, z, pad = 0) => { const c = Math.cos(f.yaw), s = Math.sin(f.yaw), lx = (x - f.x) * c - (z - f.z) * s, lz = (x - f.x) * s + (z - f.z) * c; return Math.abs(lx) < f.w / 2 + pad && Math.abs(lz) < f.d / 2 + pad; };
  const inField = (x, z, pad = 0) => P.fields.some(f => inRect(f, x, z, pad));
  // HER FARM (a trial, ?farm=1): the ground she will farm, a step from where she starts, south of the road in (A on the map,
  // 26 Nov 2026: "A ข้างถนนเข้าหมู่บ้าน"; she still starts on the road): 22 squares by 14, a metre each. Its meadow is cut
  // short (mow, below), nothing of the plan's grows on it (no flowers, ferns or tufts) and nothing else is put on it. The
  // level lays its ground and the things lying on it (farm-soil.js, farm-debris.js: level.farm); what she does there, and
  // what lay on it to begin with, is farm-tools.js's (index.html). (Its place is said here, for now: not yet in the plan)
  // THE HERO'S OLD FARM (a trial, ?oldfarm=1, which brings her farm with it): what he left round it, a hundred years on
  // (old-farm.js: his cottage, its roof fallen in, a broken fence, two old beds, his well and shed, a scarecrow, the last
  // seed's mound); she starts by the seed. Built with the houses below; its farm begins as old-farm.js says (index.html)
  const OLD_FARM = (q => q.has('oldfarm') && q.get('oldfarm') !== '0')(new URLSearchParams(location.search));
  const FARM = new URLSearchParams(location.search).has('farm') || OLD_FARM ? { x0: -73, z0: 78, cols: 22, rows: 14 } : null;
  const oldFarm = OLD_FARM ? (await import('./old-farm.js')).createOldFarm({ farm: FARM, heightAt: H }) : null;
  if (oldFarm) { P.spawn = oldFarm.spawn; P.views.start = [oldFarm.spawn.x, oldFarm.spawn.z, oldFarm.spawn.yaw]; }
  const inFarm = (x, z, pad = 0) => !!FARM && x > FARM.x0 - pad && x < FARM.x0 + FARM.cols + pad && z > FARM.z0 - pad && z < FARM.z0 + FARM.rows + pad;
  const farmMow = (x, z) => {                                              // cut short over the farm, its edge wandering a little (not ruled)
    const out = Math.max(Math.abs(x - FARM.x0 - FARM.cols / 2) - FARM.cols / 2, Math.abs(z - FARM.z0 - FARM.rows / 2) - FARM.rows / 2) + Math.sin(x * 0.83 + z * 0.21) * 0.35 + Math.sin(z * 1.27 - x * 0.4) * 0.25;
    return 0.9 * (1 - Math.min(1, Math.max(0, (out + 0.3) / 2)));
  };

  // ------------------------------------------------------------------ the woods, bushes and flowers, where the plan has them
  await onStep('ปลูกต้นไม้');
  const r = mulberry32(seed * 31);
  // a tree where she walks: solid, its trunk kept out of the camera's way, bare ground at its foot, its shade and its shadow
  const stands = e => {
    const rad = TRUNK[e.type] * e.scale, y = e.y + 0.05;
    if (e.detail >= 0.8) {
      colliders.push([e.x, e.z, rad + 0.22]); cameraTrunks.push([e.x, e.z, rad + 0.12, y, y + TREE_H[e.type] * e.scale]); bare.push([e.x, e.z, rad * 1.5]);
      for (const [cy, cr] of CROWN[e.type] || []) crowns.push([e.x, y + cy * e.scale, e.z, cr * e.scale]);
    }
    const dead = deadAt(e.x, e.z);                                             // (a dead tree's bare crown: no pool of shade under it, and a thin shadow)
    shade.push([e.x, e.z, 4 * e.scale, 0.4 * (1 - dead)]); casters.push([e.x, e.z, TREE_H[e.type] * e.scale, 2.4 * e.scale, 0.7 * (1 - 0.5 * dead)]);
  };
  // The foliage: the plan's rows made into what the forests are given. Used as the level is built, and again by the foliage
  // editor, which has the groves a plant was taken from or put in built anew.
  //   plants   kind, x, z, scale, a fifth by its kind (a tree: how many leaves, 0.5 for one she never comes near; a bush:
  //            'green'; a bed of flowers: its colour), its group, its turn in degrees, which of its kind's shapes
  //   clumps   (flowering clumps: walked through, nothing solid)  x, z, scale, colour, group, turn, shape
  //   cover    (ferns and tall tufts of grass: ground-cover.js)  kind, x, z, scale, which colony
  const BEDS = ['pink', 'yellow', 'blue'];
  const turnOf = d => d * Math.PI / 180, dice = (i, k) => mulberry32(seed * 131 + i * 977 + k)();      // (a row from an older plan has no turn or shape: the dice give it one, the same every time)
  // A tree on a slope stands on the lowest ground under its foot (r: its stem's radius where it meets the ground), so no part
  // of the foot hangs in the air: the side toward the hill goes into the hill, as a tree's does. Never deeper than 0.6 of r:
  // beside a cliff's edge it stays as it is.
  const footY = (x, z, r, y) => { let low = y; for (let k = 0; k < 8; k++) low = Math.min(low, H(x + Math.cos(k * 0.7854) * r, z + Math.sin(k * 0.7854) * r)); return Math.max(low, y - 0.6 * r); };
  const plantOf = ([kind, x, z, scale, fifth, , turn, shape], i) => {
    const rotY = turn == null ? dice(i, 1) * 6.28 : turnOf(turn), sd = shape == null ? 100 + i : shape, y = H(x, z);
    if (kind === 'flower') return { kind: 'flower', x, y, z, rad: scale, bed: BEDS.includes(fifth) ? fifth : BEDS[i % 3], seed: sd };
    if (kind === 'bush') return { kind: 'bush', type: 'round', seed: sd, x, y, z, rotY, scale };      // (plain green: the flowers are the beds' and the clumps')
    return { kind: 'tree', type: kind, seed: sd, detail: typeof fifth === 'number' ? fifth : 0.8, x, y: footY(x, z, (TRUNK[kind] || 0.4) * 1.35 * scale, y) - 0.05, z, rotY, scale };
  };
  const clumpOf = ([x, z, scale, bloom, , turn, shape], i) => ({ kind: 'bush', type: 'clump', bloom, seed: shape == null ? 300 + i : shape, x, y: H(x, z), z, rotY: turn == null ? dice(i, 3) * 6.28 : turnOf(turn), scale });
  const entriesOf = (rows, own = true) => {                                // -> { plants: trees, bushes and clumps; beds; cover }   (own: the map's own rows)
    const gone = own && east ? east.gone : () => false;                    // (with the east lake: those of the map's that stood in the old east margin are not grown)
    const out = { plants: [], beds: [], cover: [] }, nth = new Map();
    (rows.plants || []).forEach((row, i) => { if (gone(row[1], row[2])) return; const e = plantOf(row, i); (e.kind === 'flower' ? out.beds : out.plants).push(e); });
    (rows.clumps || []).forEach((row, i) => { if (!gone(row[0], row[1])) out.plants.push(clumpOf(row, i)); });
    for (const [kind, x, z, scale, colony = 0] of rows.cover || []) {       // (a fern's or a tuft's own shape: by its colony and its place in it, so it keeps it when another colony is moved)
      const k = nth.get(colony) || 0; nth.set(colony, k + 1);
      if (gone(x, z)) continue;
      out.cover.push({ kind, x, y: H(x, z), z, seed: colony * 37 + k + 1, scale });
    }
    return out;
  };
  // (with the east lake: the map's plants that stood in the old east margin are not grown; the east land's own are, with the rest)
  const eastRows = east ? east.plants : null;
  const withEast = F => { if (eastRows) { const e = entriesOf(eastRows, false); F.plants.push(...e.plants); F.beds.push(...e.beds); F.cover.push(...e.cover); } return F; };
  const grown = withEast(entriesOf(P));
  for (const e of grown.plants) {
    plants.push(e);
    if (e.kind === 'tree') stands(e); else if (e.type !== 'clump') colliders.push([e.x, e.z, 0.7 * BUSH_SIZE * e.scale]);
  }
  const bigTrees = [];                                                     // the great tree: a forest of its own, so it can be moved by hand
  const leafLods = [];                                                     // forests that are always drawn: each frame, how many of their leaf cards (anime-tree.js: lod)
  for (const b of P.buildings) if (b.kind === 'tree') {
    const e = { kind: 'tree', type: b.type, seed: b.shape ?? 100, detail: 0.8, x: b.x, y: footY(b.x, b.z, (TRUNK[b.type] || 0.4) * 1.35 * b.scale, H(b.x, b.z)) - 0.05, z: b.z, rotY: b.turn ?? r() * 6.28, scale: b.scale };      // (its shape and its turn: the plan's)
    stands(e); bigTrees.push({ b, plant: e });
  }
  const offWay = (x, z, pad) => { const n = paths.near(x, z); return n.d > n.half + pad; };
  // a plant standing on the paving grows out of a gap in it: its stones are gone round its foot (path-edits.js, GAPS). The
  // gaps of the plants as the map has them now; the foliage editor's moves change them (foliageEdit.plant)
  const gapsOf = F => [
    ...F.plants.map(p => [p.x, p.z, p.kind === 'tree' ? (TRUNK[p.type] || 0.4) * 1.35 * p.scale + 0.3 : p.type === 'clump' ? 0.38 * p.scale + 0.1 : 0.55 * BUSH_SIZE * p.scale]),
    ...F.cover.map(c => [c.x, c.z, 0.3 * c.scale + 0.1]),
    ...bigTrees.map(({ plant: p }) => [p.x, p.z, (TRUNK[p.type] || 0.4) * 1.35 * p.scale + 0.3]),
  ].filter(([x, z]) => paved.laid(x, z) > 0.02).map(g => g.map(v => Math.round(v * 100) / 100));
  paved.gaps(gapsOf(grown));

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
  const SAILS_TURN = 0.12, WHEEL_TURN = 0.5, WHEEL_TURN_CURSED = 0.08;      // the windmill's sails: turns a second; the water wheel: radians a second (living, cursed)
  const wm = P.buildings.find(b => b.kind === 'sails');
  if (wm) try {
    const foot = Math.max(...corners(wm.x, wm.z, 4, 4, wm.yaw)) + 0.03, fx = Math.sin(wm.yaw), fz = Math.cos(wm.yaw);
    const WOOD = [0.545, 0.369, 0.212], LINEN = [0.87, 0.82, 0.69];        // (the kit's wood trim; the kit's plaster, a shade paler)
    mill = await loadSpinner(url(M.windmill), { part: M.sails, span: wm.span, speed: SAILS_TURN, recolor: (r, g, b) => (r - b > 0.23 ? WOOD : LINEN) });
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
  const wheel = new THREE.Mesh(BD.wheelGeometry({ radius: 2.0, width: 1.0, axle: 3.7, seed: 24 }), propMaterial());
  wheel.name = 'waterWheel'; wheel.rotation.order = 'YXZ'; wheel.rotation.y = P.wheel.yaw;
  wheel.position.set(P.wheel.x, P.wheel.level + 1.35, P.wheel.z);
  wheel.userData.dispose = () => wheel.geometry.dispose();
  group.add(wheel); colliders.push([P.wheel.x, P.wheel.z, 1.3]);
  // the stone bridge: built along its own x, turned to lie across the river
  {
    const br = P.bridge, bc = Math.cos(br.yaw), bs = Math.sin(br.yaw), bL = br.length;
    const bEnd = s => [br.x + s * (bL / 2 - 0.4) * bc, br.z - s * (bL / 2 - 0.4) * bs];
    const by = Math.min(H(...bEnd(-1)), H(...bEnd(1))) - 0.12;
    kb.bridge({ length: bL, width: 2.9, deck: u => BD.stoneBridgeDeck(u, { length: bL }) }, br.x, by, br.z, br.yaw);      // (in the houses' own stone: village-kit.js)
    // its arch (village-kit.js's bridge: an arch 2.7 m either side of its middle, springing 1 m under its base and rising 1.75 m)
    const SPAN = 2.7, SPRING = -1.0, CROWN = 1.75, deckY = u => by + BD.stoneBridgeDeck(u, { length: bL });
    const arch = u => Math.abs(u) < SPAN ? by + SPRING + CROWN * Math.sqrt(1 - (u / SPAN) * (u / SPAN)) : -Infinity;
    // (halfW: the way between its parapets, 1.13 m either side; wide: under it, the whole of its width is over her)
    decks.push({ x: br.x, z: br.z, yaw: br.yaw, len: bL, halfW: 1.1, wide: 1.45, y: deckY, arch, of: 'stone' });
    for (let u = -bL / 2; u <= bL / 2; u += 1) for (const v of [-0.8, 0.8]) bare.push([br.x + u * bc + v * bs, br.z - u * bs + v * bc, 1.3]);
    // its parapets (and no stepping off its side): only for her up on it, not for her down under its arch
    // (each with its top, the coping's, 0.74 m over the deck: she may vault it, and fall into the river: player-hurdle.js)
    for (const v of [-1.45, 1.45]) for (let u = -(bL / 2 + 0.6); u <= bL / 2 + 0.6 + 1e-6; u += 0.8) { const dy = deckY(Math.max(-bL / 2, Math.min(bL / 2, u))); colliders.push([br.x + u * bc + v * bs, br.z - u * bs + v * bc, 0.42, dy - UNDER, undefined, dy + 0.74]); }
    // the camera does not go into its stone, from under the arch: its body, as short posts from the arch's underside (or the
    // ground, at its piers) up to under its deck, three across and every 0.6 m along
    for (let u = -bL / 2 + 0.3; u <= bL / 2 - 0.3 + 1e-6; u += 0.6) for (const v of [-0.95, 0, 0.95]) {
      const x = br.x + u * bc + v * bs, z = br.z - u * bs + v * bc, low = Math.abs(u) < SPAN - 0.4 ? arch(u) : H(x, z) - 0.5;
      if (deckY(u) - 0.35 > low) cameraTrunks.push([x, z, 0.5, low, deckY(u) - 0.35]);
    }      // its parapets (and no stepping off its side). (They began 1 m either side of its middle: there, at its highest, she could walk through the parapet, off the deck, and down into the river under it)
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
    const plankY = u => pby + 0.41 + 0.7 * (1 - Math.pow(2 * u / pL, 2));
    decks.push({ x: pl.x, z: pl.z, yaw: pl.yaw, len: pL, halfW: 0.95, wide: 1.05, y: plankY, arch: u => plankY(u) - 0.3, of: 'wood' });      // (under its boards, where they are high enough over the bed, she may pass)
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
  // the small things: the market's stalls, barrels, carts, sheep. The low ones she may go over (player-hurdle.js: their
  // colliders carry their tops); not a stall (its awning), a cart, a lamp, a signpost, nor a sheep
  const OVER = new Set(['barrels', 'crates', 'hay', 'bench', 'table', 'woodpile']);
  let propSeed = 60;
  for (const [i, [kind, x, z, yaw]] of P.props.entries()) {
    let rad = 0.7, top;                                                    // top: how high it stands, if she may go over it
    const at = { x, z, yaw }, b = placeBase.filter(t => t.kind === 'prop')[i];
    if (kind.startsWith('kit:')) { addThing(b.id, at, (x, z) => ({ y: H(x, z) - 0.02, deep: 0 }), (k, out, x, y, z, yaw) => k.piece(kind.slice(4), x, y, z, yaw)); rad = 1.3; }
    else {
      const ps = propSeed++;
      const g0 = BD.propGeometry(kind, { seed: ps }); rad = g0.userData.solid;
      if (OVER.has(kind)) { g0.computeBoundingBox(); top = H(x, z) - 0.03 + g0.boundingBox.max.y; }
      g0.dispose();
      addThing(b.id, at, (x, z) => ({ y: H(x, z) - 0.03, deep: 0 }), (k, out, x, y, z, yaw) => out.push(BD.place(BD.propGeometry(kind, { seed: ps }), x, y, z, yaw)));
    }
    if (rad > 0.3) { colliders.push([x, z, rad * 0.8, undefined, undefined, top]); press.push([x, z, rad * 1.5]); casters.push([x, z, 1.0, rad * 0.9, 0.75]); }
    else colliders.push([x, z, 0.22]);
  }
  // the great tree: a forest of one
  for (const { b, plant } of bigTrees) {
    const obj = createAnimeForest([plant]); obj.name = 'greatTree';
    group.add(obj); leafLods.push(obj.userData.lod);
    addThing(b.id, b, (x, z) => ({ y: H(x, z) - 0.05, deep: 0 }), null, { obj, y0: plant.y + 0.05 });
  }
  // the hero's old farm (?oldfarm=1): his cottage, a kit house as the village's are (its roof fallen in, its footing, and
  // what old-farm.js puts with it), and the rest of what he left, merged with what is built
  if (oldFarm) {
    const c = oldFarm.cottage, { w, l } = c.spec, hs = corners(c.x, c.z, w, l, c.yaw), hi = Math.max(...hs), deep = hi - Math.min(...hs), y = hi + 0.03;
    kb.house(c.spec, c.x, y, c.z, c.yaw);
    const K = BD.kit(c.spec.seed || 1);
    K.box(0, -deep - 1.2, 0, w + 0.5, deep + 1.26, l + 0.5, C.stoneDark);
    builds.push(BD.place(K.done(), c.x, y, c.z, c.yaw));
    c.extras(kb, builds, c.x, y, c.z, c.yaw);
    solid(c.x, c.z, w + 0.5, l + 0.5, c.yaw, 3 + w * 0.45 + 1);
    builds.push(...oldFarm.geometries);
    colliders.push(...oldFarm.colliders); bare.push(...oldFarm.bare); casters.push(...oldFarm.casters);
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
  // (the grass grows to the land's very edge, and on past it: the land runs on there, see the rim below)
  // (the grid's rows on the land: all of them, but for a land wider than it is long (the east lake's), where the square runs on past its north and south)
  const rA = Math.max(0, Math.floor((Z0 - CZ + FR) / field.step)), rB = Math.min(field.n - 1, Math.ceil((Z1 - CZ + FR) / field.step));
  const landRect = [CX - FR + Math.max(0, Math.floor((X0 - CX + FR) / field.step)) * field.step, rA === 0 ? CZ - FR : CZ - FR + rA * field.step, CX - FR + Math.min(field.n - 1, Math.ceil((X1 - CX + FR) / field.step)) * field.step, rB === field.n - 1 ? CZ + FR : CZ - FR + rB * field.step];      // the land as it is drawn
  const paint = (x, z) => {
    if (x < landRect[0] - 1 || x > landRect[2] + 1) return [1, 0, 0];      // off the land (the map is a square, wider than it): not the map's to say, the rim paints itself
    let earth = ss(0.7, 1.1, slope(x, z)), mow = 0;                        // the cliffs: bare (no grass grows on them)
    const b = brookAt(x, z);
    let sand = b ? 1 - ss(0.2, 1.4, b.d) : 0;                              // the water's beds and banks: sand, no grass
    if (sand && ponds.length && pondAt(x, z, b)) sand *= 1 - ss(0.3, 0.75, H(x, z) - b.level);      // (a flooded pond's beach: only the ground that lies low beside it)
    earth = Math.max(earth, west.dryAt(x, z));                             // the beds the fringe's water has left: bare earth
    earth = Math.max(earth, bareAt(x, z));                                 // the rain's runnels where they run deep and fast: bare earth
    const pp = pathPaint(x, z);
    if (pp) { earth = Math.max(earth, pp[0]); mow = pp[2]; }               // the ways: trodden earth, short grass beside them
    if (inField(x, z, 0.5)) earth = 1; else if (inField(x, z, 1.6)) mow = Math.max(mow, 0.7);
    if (inFarm(x, z, 2.5)) mow = Math.max(mow, farmMow(x, z));            // (her farm's grass: short, so what lies on it is seen)
    return [earth, sand, mow];
  };
  const L = new THREE.Vector3(...sun).normalize();
  setAnimeSun(L); setFrondPineSun(L); setFlowerSun(L); setGroundCoverSun(L);                     // (until the time of day says otherwise)
  const sunShadows = dir => {
    L.copy(dir).normalize();
    const dxz = Math.hypot(L.x, L.z) || 1, ly = Math.max(0.3, L.y), ux = -L.x / dxz, uz = -L.z / dxz, len = dxz / ly;
    return casters.map(([x, z, h, rr, st]) => [x + ux * len * h / 2, z + uz * len * h / 2, len * h / 2 + rr, rr * 1.1, ux, uz, st, 0]);
  };
  // (the blades by the beach are rooted in the land's dry grass, not in pale sand: they meet the painted sand's dry-grass edge)
  const map = G.createGroundMap({ radius: FR, center: [CX, CZ], size: Math.round(1280 * wider / 8) * 8, seed, heightAt: H, dirt: 0, shade, bare, press, grow, paint, cast: sunShadows(L.clone()), colors: { sand: T._strata.colors.hay } });
  // THE FOREST FLOOR (26 Nov 2026): under trees that stand close together the ground is a wood's, earth, dry leaves, moss in
  // patches, and wherever the path painter's 🍂 laid it (forest-floor.js says where, off cliffs and steep slopes; the land
  // paints it, stylized-terrain.js floor; its picture made by tools/make-forest-paint.py: in the ways' own earth; ?forest=damp:
  // the first set, dark and damp, kept for the ruins; ?forest=0: none), and the grass there thinner and shorter (laid into the
  // ground map once the land is built, below, so the land's triangles are as they were). A tree standing on its own keeps its meadow
  let floor = null, forestPaint = null;
  const forestSet = new URLSearchParams(location.search).get('forest');
  if (forestSet !== '0') try {
    const { createForestFloor } = await import('./forest-floor.js');
    const crownOf = p => Math.max(...(CROWN[p.type] || [[0, 2.5]]).map(c => c[1])) * p.scale;      // (its widest tier)
    floor = createForestFloor({ trees: [...plants.filter(p => p.kind === 'tree'), ...bigTrees.map(b => b.plant)].map(p => [p.x, p.z, crownOf(p)]), rect: landRect, heightAt: H, painted: foldFloorOps(pathOps) });
    forestPaint = await new THREE.TextureLoader().loadAsync(url(M.forest[forestSet === 'damp' ? 'damp' : 'path']));
    forestPaint.wrapS = forestPaint.wrapT = THREE.RepeatWrapping; forestPaint.anisotropy = 4; forestPaint.colorSpace = THREE.NoColorSpace;      // (the kit shades display colours)
    console.info('[hill-village] the forest floor:', floor.groves, 'trees stand in groves');
  } catch (err) { console.warn('[hill-village] forest floor', err); floor = null; forestPaint = null; }
  // the far meadow is laid in as the grass paints it (the land's own paint, and the rim's: stylized-terrain.js, grassLook)
  const grassLook = { glsl: G.GRASS_LOOK_GLSL, uniforms: G.GRASS_DRY, tip: G.GRASS_TIP, area: map.area, paint: map.paint };
  const fade = { far, fadeA: 1e5, fadeB: 2e5 };      // (the blades do not fade into the far colour toward the land's edge either: the land runs on past it, see the rim below)
  // the banks' sand: painted with the ways' own brush, so the beach and the ways read as one ground (?sand=flat: as it was)
  let sandPaint = null;
  if (new URLSearchParams(location.search).get('sand') !== 'flat') try {
    sandPaint = await new THREE.TextureLoader().loadAsync(url(M.sand));
    sandPaint.wrapS = sandPaint.wrapT = THREE.RepeatWrapping; sandPaint.anisotropy = 4; sandPaint.colorSpace = THREE.NoColorSpace;      // (the kit shades display colours)
  } catch (err) { console.warn('[hill-village] sand paint', err); }
  // the dead land's dry earth (the west fringe, under the curse): painted with the same brush, laid by the land where no
  // grass is left (stylized-terrain.js, dryPaint)
  let dryPaint = null;
  try {
    dryPaint = await new THREE.TextureLoader().loadAsync(url(M.dry));
    dryPaint.wrapS = dryPaint.wrapT = THREE.RepeatWrapping; dryPaint.anisotropy = 4; dryPaint.colorSpace = THREE.NoColorSpace;
  } catch (err) { console.warn('[hill-village] dry paint', err); }
  // the ways' paint, and in the soft look the ways laid by the land itself (ground-paths.js, onLand: no ribbons, so the ways
  // painted by hand cost nothing to draw, however many); ?paths=grit: ribbons, as before
  let pathTex = null;
  try { pathTex = await loadPathTextures(pathStyle); } catch (err) { console.warn('[hill-village] path textures', err); }      // without them: the painted look
  const landWays = pathStyle === 'soft' ? paths.onLand(map, pathTex, { stone: cliffPaint }) : null;      // (paving: in the cliffs' own painted stone)
  // the land itself: only the columns of the ground's grid that lie on the land, in pieces (each drawn only when it is in view),
  // in the valley's land paint: grass on the flat, rock on the cliffs, sand by the water (painted, wet toward the water, and
  // going through dry grass into the meadow where the blades stand thick), earth in the fields
  const terrain = new THREE.Group(); terrain.name = 'terrain';
  {
    const { n, step, heights } = field, cA = Math.max(0, Math.floor((X0 - CX + FR) / step)), cB = Math.min(n - 1, Math.ceil((X1 - CX + FR) / step)), cols = cB - cA + 1, nr = rB - rA + 1;
    const pos = new Float32Array(cols * nr * 3), bank = new Float32Array(cols * nr).fill(10), soil = new Float32Array(cols * nr);
    for (let j = 0; j < nr; j++) for (let i = 0; i < cols; i++) {
      const o = j * cols + i, x = CX - FR + (cA + i) * step, z = CZ - FR + (rA + j) * step, y = heights[(rA + j) * n + cA + i];
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
      bank[o] = bankAt(x, z, y);
      if (inField(x, z, 0.4)) soil[o] = 1;
    }
    const whole = new THREE.BufferGeometry(), all = new Uint32Array((cols - 1) * (nr - 1) * 6);
    let q = 0;
    for (let j = 0; j < nr - 1; j++) for (let i = 0; i < cols - 1; i++) { const a = j * cols + i, b = a + cols; all[q++] = a; all[q++] = b; all[q++] = a + 1; all[q++] = b; all[q++] = b + 1; all[q++] = a + 1; }
    whole.setAttribute('position', new THREE.BufferAttribute(pos, 3)); whole.setIndex(new THREE.BufferAttribute(all, 1));
    whole.setAttribute('aBank', new THREE.BufferAttribute(bank, 1)); whole.setAttribute('aPath', new THREE.BufferAttribute(soil, 1));
    whole.computeVertexNormals(); whole.setIndex(null);
    // the cliffs: rock painted with a brush (tools/make-cliff-paint.py, loaded with the rocks above), in place of the valley's strata
    // (the fringe's dry beds are sand too: handed over as a picture, west.beds, so their edges are the beds' own)
    const mat = T._terrain.terrainMaterial(far, [1e5, 1e5], CZ, { cliffPaint, sandPaint, dryPaint, beds: west.beds, ground: map, grassLook, ways: landWays, floor: floor && { map: floor.texture, rect: floor.rect, paint: forestPaint } });      // (no fade into the far colour at the land's edge: the land runs on past it, see the rim below)
    if (P.pit) { mat.uniforms.uDeepOn.value = 1; mat.uniforms.uDeepTop.value = P.pit.shift; }      // down the pit the walls go pale into its mist, then dark (its heights as ?map=pit has them, moved by shift)
    // Its triangles. A cell of the grid is half a metre, and the land was two triangles to every cell, 753 000 in all,
    // meadow and cliff alike. Now a square of cells is drawn whole where the land inside it is flat to 3 cm (coarseGrid,
    // stylized-terrain.js) and nothing shows the ground itself from near: only where grass grows thick (the ways, sand and
    // earth are bare ground), away from water (a shore is where the land meets the water's
    // level) and all field or none. ?landlod=0: two triangles to every cell, as it was.
    const [pa, pd] = [Math.round(M.pieces[0] * (X1 - X0) / 220), M.pieces[1]], own = [whole, mat];      // (pieces across: as many as the land is wide, by the 220 m the village's own is)
    const grassAt = o => { const s = map.size, mi = Math.min(s - 1, Math.max(0, Math.floor((pos[o * 3] - map.center[0] + map.radius) / (2 * map.radius) * s))), mj = Math.min(s - 1, Math.max(0, Math.floor((pos[o * 3 + 2] - map.center[1] + map.radius) / (2 * map.radius) * s))); return map.data[(mj * s + mi) * 4 + 3]; };
    const cells = new URLSearchParams(location.search).get('landlod') === '0'
      ? T._terrain.coarseGrid({ cols, rows: nr, pos, nor: whole.attributes.normal.array, top: 1 })
      : T._terrain.coarseGrid({ cols, rows: nr, pos, nor: whole.attributes.normal.array, tol: 0.03, angle: 4, top: 8, may: o => bank[o] > 9.999 && (o % cols === 0 || soil[o] === soil[o - 1]) && (o < cols || soil[o] === soil[o - cols]) && grassAt(o) > 250 });
    const lists = Array.from({ length: pa * pd }, () => []);
    for (const c of cells) {                                             // each square goes to the piece its middle lies in
      const pi = Math.min(pa - 1, Math.floor((c.i + c.k / 2) * pa / (cols - 1))), pj = Math.min(pd - 1, Math.floor((c.j + c.k / 2) * pd / (nr - 1)));
      lists[pj * pa + pi].push(c.tris);
    }
    let drawn = 0;
    for (let pj = 0; pj < pd; pj++) for (let pi = 0; pi < pa; pi++) {
      const idx = Uint32Array.from(lists[pj * pa + pi].flat()), box = new THREE.Box3(), v = new THREE.Vector3();
      if (!idx.length) continue;
      for (const o of idx) box.expandByPoint(v.set(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]));
      const g = new THREE.BufferGeometry();                                // (every piece reads the one set of points: only its list of triangles is its own)
      for (const name of ['position', 'normal', 'aBank', 'aPath']) g.setAttribute(name, whole.attributes[name]);
      g.setIndex(new THREE.BufferAttribute(idx, 1)); g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(g, mat); m.name = 'terrain-' + pi + '-' + pj; m.layers.enable(W.UNDERWATER);
      terrain.add(m); own.push(g); drawn += idx.length / 3;
    }
    console.info('[hill-village] the land:', drawn, 'triangles of', (cols - 1) * (nr - 1) * 2);
    if (cliffPaint) own.push(cliffPaint);
    if (sandPaint) own.push(sandPaint);
    if (dryPaint) own.push(dryPaint);
    if (floor) own.push(floor.texture, forestPaint);
    own.push(west.beds.map);
    terrain.userData = { kind: 'terrain', dispose() { own.forEach(o => o.dispose()); } };
  }
  group.add(still(terrain));
  if (floor) floor.thin(map);                                              // (the wood's floor: its grass thinner and shorter, now the land is built)
  // past the land's edge nothing ends: the land runs on into wooded hills, out to the foot of the far hills (map-rim.js). In
  // the land's own last metres, where she never comes, crowns of that wood stand among its trees: not on a way, in the water,
  // on a cliff or in another tree
  await onStep('ปลูกป่ารอบแผนที่');
  const horizonR = Math.hypot(HX, FR) + M.rim;                              // where the nearest ring of far hills stands (see horizon below)
  const rim = createMapRim({
    rect: landRect,
    heightAt: H, terrainMaterial: T._terrain.terrainMaterial, far, zc: CZ, cliffPaint, horizon: { center: [CX, CZ], radius: horizonR }, ways: waysOut, seed,
    paint: { ground: map, dryPaint, grassLook: { ...grassLook, land: landRect, greens: [G.GROUND_COLORS.deep, G.GROUND_COLORS.mid, G.GROUND_COLORS.sunny], lean: 2.2 } },      // (its meadow is the land's, run on past the edge)
    clear: (x, z) => { const w = paths.near(x, z); return slope(x, z) < 0.6 && !brookAt(x, z) && w.d > w.half + 2.5 && !plants.some(p => Math.hypot(p.x - x, p.z - z) < 3.4); },
  });
  rim.userData.setSun(L);
  group.add(rim);
  // the rim's trees that stand in the land's own last metres throw their shadows as the land's trees do: on its ground map,
  // so the ground and the blades both have them
  if (rim.userData.inLand.length) {
    for (const [x, z, h, r] of rim.userData.inLand) casters.push([x, z, h, r, 0.7]);
    map.beginCast(sunShadows(L.clone()), 1);
    while (!map.stepCast(1e9)) { /* all of it now: the map is not on screen yet */ }
  }
  console.info('[hill-village] the rim:', rim.userData.crowns, 'crowns,', rim.userData.triangles, 'triangles');
  const ways = landWays ? new THREE.Group() : paths.ribbon(H, map, pathTex, bankAt);      // (bankAt: the ways are wet toward the water, as the sand beside them is)
  if (landWays) { ways.name = 'paths'; ways.userData.dispose = () => landWays.dispose(); }
  if (pathTex) ways.userData.dispose = (d => () => { d(); pathTex.dispose(); })(ways.userData.dispose);
  group.add(ways);
  // her farm's ground (?farm=1): its beds, painted with the ways' own brush, the curse's crust with the dead land's earth
  // (farm-soil.js: the grass of the ground map stands back from them); and what lies on it before it is dug, its rocks in the
  // cliffs' stone as the village's are (farm-debris.js). Laid on it, and kept, by farm-tools.js
  let farm = null;
  if (FARM) {
    const [{ createFarmSoil }, { createFarmDebris, setDebrisSun }] = await Promise.all([import('./farm-soil.js'), import('./farm-debris.js')]);
    const soil = createFarmSoil({ ...FARM, heightAt: H, map, paint: pathTex && pathTex.paint, crack: dryPaint });
    const debris = createFarmDebris({ heightAt: H, rockPaint });
    soil.setSun(L); setDebrisSun(L);
    group.add(soil.mesh, debris.object);
    farm = { soil, debris, setSun: dir => { soil.setSun(dir); setDebrisSun(dir); }, rect: [FARM.x0, FARM.z0, FARM.x0 + FARM.cols, FARM.z0 + FARM.rows] };
  }
  await onStep('ปลูกหญ้า');
  let grassField = field;                                                  // the land's heights as the grass has them: the boulders' grassy tops raised into them
  if (grassTop.size) {
    const half = new Uint16Array(field.texture.image.data);
    for (const [k, y] of grassTop) half[k] = THREE.DataUtils.toHalfFloat(y);
    const texture = new THREE.DataTexture(half, field.n, field.n, THREE.RedFormat, THREE.HalfFloatType);
    texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
    grassField = { ...field, texture };
  }
  // past the tile the meadow goes on in a ring of few, coarse tufts, out to a hundred metres; and past the land's edge the
  // blades stand on the rim's ground, in its colours (stylized-grassfield.js: THE RING, PAST THE LAND)
  const grass = G.createFollowGrass({
    map, field: grassField, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade,
    ring: { tile: 215, count: Math.round(grassCount * 0.3), width: 1.9, spread: 3.5, height: 1.1, lead: 0.1 },
    beyond: { ...rim.userData.grass, land: landRect, greens: [G.GROUND_COLORS.deep, G.GROUND_COLORS.mid, G.GROUND_COLORS.sunny], lean: 2.2 },
    paving: landWays ? landWays.grass : null,                              // (the blades come up between the paving's slabs, not on them)
  });
  if (grassField !== field) grass.userData.dispose = (d => () => { if (d) d(); grassField.texture.dispose(); })(grass.userData.dispose);
  console.info('[hill-village] grass on the boulders\' tops:', grow.length, 'spots,', grassTop.size, 'points of the land raised for it');
  group.add(grass);
  // the woods (anime-tree.js, and the pines of frond-pine.js), in groves, with the beds of flowers that lie in each; and the
  // ferns and tufts in squares of their own (smaller: they are only seen from near; from further off a square is drawn
  // thinner, then not at all). Each is drawn only when it is in view (see update). plantGroves and plantCover build what
  // they are told to and take away what stood there before: all of it as the level is built, a few when the foliage editor
  // has moved a plant.
  const groves = [], inView = [], grovesAt = new Map(), squaresAt = new Map();
  const leafLodOff = new URLSearchParams(location.search).get('leaflod') === '0';      // ?leaflod=0: every leaf card sent, as it was (to compare)
  const LEAF_CELL = leafLodOff ? 0 : 30;                                    // a grove's leaf cards are kept by squares this wide: each is drawn, or not, and thinned, for itself
  const GROVE = +new URLSearchParams(location.search).get('grove') || M.grove, SQUARE = 40, v3g = new THREE.Vector3();
  const groveOf = (x, z) => Math.floor((x - X0) / GROVE) + ',' + Math.floor((z - Z0) / GROVE), squareOf = (x, z) => Math.floor((x - X0) / SQUARE) + ',' + Math.floor((z - Z0) / SQUARE);
  const uproot = (at, key) => {
    for (const rec of at.get(key) || []) {
      group.remove(rec.obj); rec.obj.traverse(m => { if (m.geometry) m.geometry.dispose(); });
      inView.splice(inView.indexOf(rec), 1); if (groves.includes(rec)) groves.splice(groves.indexOf(rec), 1);
    }
    at.delete(key);
  };
  const sorted = (list, keyOf, only) => { const by = new Map(); for (const e of list) { const k = keyOf(e.x, e.z); if (only && !only.has(k)) continue; if (!by.has(k)) by.set(k, []); by.get(k).push(e); } return by; };
  const isPine = p => p.kind === 'tree' && p.type === 'pine';
  const woodOf = list => {                                                 // a grove's trees and bushes: its pines drawn by frond-pine.js, the rest by anime-tree.js
    const obj = new THREE.Group(), pines = list.filter(isPine), rest = list.filter(p => !isPine(p)); obj.name = 'grove';
    if (rest.length) { const forest = createAnimeForest(rest, { cell: LEAF_CELL }); obj.add(forest); obj.userData.lod = forest.userData.lod; }      // (its leaves in cells: see lod in update)
    if (pines.length) obj.add(createFrondPineForest(pines));
    return obj;
  };
  const bedOf = (b, clumps, heightAt = H, allow = null) => {                // a bed's low flowers: none on a way (on the paving only in its cracks), in the water, in anything solid (a wall, a trunk, a rock, a bush), or inside a clump
    const reach = b.rad * 1.2, solid = allow ? [] : colliders.filter(([cx, cz, cr]) => Math.hypot(cx - b.x, cz - b.z) < reach * 1.15 + cr + 0.2);
    const grows = allow || ((fx, fz) => (offWay(fx, fz, 0.12) || paths.inCrack(fx, fz)) && waterDepthAt(fx, fz) === 0 && !inFarm(fx, fz, 0.3) && !solid.some(([cx, cz, cr]) => Math.hypot(cx - fx, cz - fz) < cr + 0.08));      // (on the paving: in its cracks, between the slabs; none on her farm)
    const avoid = clumps.filter(c => Math.hypot(c.x - b.x, c.z - b.z) < reach + 1).map(c => [c.x, c.z, 0.75 * c.scale + 0.1]);
    return createFlowerDrift({ center: [b.x, b.z], radius: reach, seed: b.seed, heightAt, bed: b.bed, allow: grows, avoid });
  };
  const plantGroves = (F, only = null) => {
    const trees = sorted(F.plants, groveOf, only), beds = sorted(F.beds, groveOf, only), clumps = F.plants.filter(p => p.type === 'clump');
    for (const key of only || new Set([...trees.keys(), ...beds.keys()])) {
      uproot(grovesAt, key);
      const recs = [], list = trees.get(key) || [];
      if (list.length) {
        const box = new THREE.Box3();
        for (const p of list) { const sc = p.scale || 1, w = (p.kind === 'bush' ? 1.6 * BUSH_SIZE : 5.5) * sc; box.expandByPoint(v3g.set(p.x - w, p.y - 1, p.z - w)); box.expandByPoint(v3g.set(p.x + w, p.y + (p.kind === 'bush' ? 2.2 * BUSH_SIZE : 12.2) * sc, p.z + w)); }
        const wood = woodOf(list), rec = { obj: wood, box, lod: wood.userData.lod }; groves.push(rec); recs.push(rec);
      }
      for (const b of beds.get(key) || []) {
        const far = b.rad * 1.38 + 0.5;                                    // (from further off than 85 m a bed of flowers is too small to see: FAR, LIGHTER; it was 110)
        recs.push({ obj: bedOf(b, clumps), far: FAR_FULL ? 110 : 85, small: true, box: new THREE.Box3(v3g.set(b.x - far, b.y - 2, b.z - far).clone(), v3g.set(b.x + far, b.y + 3, b.z + far).clone()) });
      }
      for (const rec of recs) { group.add(still(rec.obj)); inView.push(rec); }
      if (recs.length) grovesAt.set(key, recs);
    }
  };
  const plantCover = (list, only = null) => {
    const offOld = (x, z) => !oldFarm || !oldFarm.keepOff.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr);      // (nor through the hero's cottage, well and shed: ?oldfarm=1)
    const by = sorted(list.filter(c => waterDepthAt(c.x, c.z) === 0 && (offWay(c.x, c.z, 0.1) || paved.laid(c.x, c.z) > 0.3) && !inFarm(c.x, c.z, 0.5) && offOld(c.x, c.z)), squareOf, only);      // (none in the water or on a way; on the paving it grows out of its gap; none on her farm)
    for (const key of only || by.keys()) {
      uproot(squaresAt, key);
      const here = by.get(key);
      if (!here) continue;
      const box = new THREE.Box3(), obj = createGroundCover(here);
      for (const c of here) { box.expandByPoint(v3g.set(c.x - 1.6, c.y - 0.5, c.z - 1.6)); box.expandByPoint(v3g.set(c.x + 1.6, c.y + 2, c.z + 1.6)); }
      const rec = { obj, box, far: FAR_FULL ? 95 : 85, thin: obj.userData.thin, small: true };
      group.add(still(obj)); inView.push(rec); squaresAt.set(key, [rec]);
    }
  };
  plantGroves(grown); plantCover(grown.cover);

  // ------------------------------------------------------------------ the water: the valley's clear water lying in each stretch's bed, a fall where a terrace ends
  await onStep('เติมน้ำ');
  const foamTexture = await W.loadFoamTexture(), animeCells = createAnimeCells();
  const droplets = createWaterDroplets({ time: N._internal.shared.uTime });
  droplets.points.userData.dispose = droplets.dispose;
  group.add(droplets.points);
  const WL = (P.waters.find(w => w.id === 'river') || P.waters[0]).level;      // (the waves are worked out on one level: the river's, by the bridge)
  const sim = W.createWaterSim({ rect: [P.spawn.x - 24, P.spawn.z - 24, 48], size: 512, field, foamTexture, level: WL, follow: true });
  const optics = W.createWaterOptics({ level: WL });
  const waterMat = W.waterMaterial({ field, animeCells, sim, optics, foamTexture, far, fadeA: 1e4, fadeB: 2e4, murk: cursed ? 1 : 0 });      // (no water runs out to the land's edge: none of it fades; under the curse: stagnant, murky)
  // each stretch's surface, and a fall wherever one runs off an edge, are worked out from the land itself (land-water.js): the
  // sheet lies only where the ground holds it, the fall hangs from the sheet's own edge and its foam is where it lands
  // (from its third shelf each stream goes into the pit's mist: the abyss's long fall, abyss-scene.js)
  const deepFall = f => createAbyssFalls({ falls: [f], centre: [f.x + Math.sin(f.yaw), f.z + Math.cos(f.yaw)], bottom: f.top - 42, optics: null, foamTexture });
  const water = createLandWater({ stretches: P.brooks, heightAt: H, lookup: { at: brookAt }, material: waterMat, foamTexture, cells: animeCells, expect: cursed ? 0 : P.falls.length,
    deep: P.deep || [], deepFall, split: P.split || [], lower, still: cursed ? P.brooks.map((r, k) => k) : [...(west.water ? west.water.still : []), ...(east ? east.water.still : [])],      // (under the curse no fall runs: pools only; the healed fringe's pond: standing water)
    outflows: [...(west.water ? west.water.outflows : []), ...(east ? east.water.outflows : [])] });
  water.group.userData.dispose = water.dispose;
  group.add(water.group);
  // under the curse: the pools the water has left, dark mist rising off the bigger ones now and then (dark-mist.js), and the
  // map shows them: its cursed picture (dry beds, dead land: tools/make-hill-village-map.py) with each pool painted on it
  const pools = cursed ? droughtPools(water.surfaces, H) : [];
  const darkMist = cursed ? createDarkMist(pools) : null;
  if (darkMist) group.add(darkMist.group);
  const mapOverlay = cursed ? (g, at) => {
    g.beginPath();
    for (const p of pools) for (let i = 0; i < p.tris.length; i += 6) {
      const [ax, ay] = at(p.tris[i], p.tris[i + 1]), [bx, by] = at(p.tris[i + 2], p.tris[i + 3]), [cx, cy] = at(p.tris[i + 4], p.tris[i + 5]);
      g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.closePath();
    }
    g.lineJoin = 'round'; g.lineWidth = 2.5; g.strokeStyle = '#4b5649'; g.stroke();      // (the edge first: the water laid over it covers all but its outside)
    g.fillStyle = '#7d8b78'; g.fill();
  } : null;
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
      if (st && drop > 0 && sim.inside(x, z)) droplets.emit(x, H(x, z) + waterDepthAt(x, z), z, 0.16 * drop * strength, strength > 1.2 ? 3 : 2);      // a footstep flicks up two or three drops
    }
  };
  const hidden = [...water.surfaces, grass, droplets.points, rim], stretches = water.stretches;      // (not drawn into the water's own pictures: the rim is too far off to be mirrored)
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), camWorld = new THREE.Vector3();
  const herAt = new THREE.Vector3(P.spawn.x, H(P.spawn.x, P.spawn.z), P.spawn.z);      // (where she was last followed: the water's ripples are worked out round her)
  let frameNo = 0;

  // ------------------------------------------------------------------ where she may walk; the sun; what the game asks of a level
  let castSun = L.clone(), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false;
  const cast = { dir: castSun.clone(), k: 1 };
  const inMap = (x, z) => inPlay(x, z, 1);
  const walkable = (x, z, y) => {                                         // off the cliffs, out of deep water; under a bridge, only where its arch is high enough over her
    if (!inMap(x, z)) return false;
    if (deckAt(x, z, y)) return true;
    const over = archOver(x, z, y);
    return (over === null || over >= HEADROOM) && slope(x, z) < 0.9 && waterDepthAt(x, z, y) < 1.05;
  };
  const standAt = (x, z, y) => { const d = deckAt(x, z, y); return d ? d.y(deckUV(d, x, z)[0]) : H(x, z); };
  const walkableAt = walkable;
  // what is under her feet at a spot, for the moves (player-moves.js): 'ground' she may stand on (the same answer as walkable),
  // 'cliff' too steep to stand on (she may fall past it or slide down it), 'water' too deep to wade, 'wall' a solid thing
  // she may not go into (under a bridge, where its arch comes down lower than her head, and its piers), 'out' off the map
  // (the pit's shaft, below its lowest shelf, is not a place: 114 m down to a floor that is only there to close the land. It is 'out')
  // (y, as for walkable: about how high she stands, which tells a bridge's deck from the bed under it; none: the deck)
  const shaftTop = P.pit ? Math.min(...P.pit.shelves.map(sh => sh.y)) + P.pit.shift - 3 : -Infinity;
  const footing = (x, z, y) => {
    if (!inMap(x, z) || H(x, z) < shaftTop) return 'out';
    if (deckAt(x, z, y)) return 'ground';
    const over = archOver(x, z, y);
    if (over !== null && over < HEADROOM) return 'wall';
    return waterDepthAt(x, z, y) >= 1.05 ? 'water' : slope(x, z) >= 0.9 ? 'cliff' : 'ground';
  };
  console.info('[hill-village] look', look, '· kit triangles', houses.userData.triangles, '· trees and bushes', plants.length, 'in', groves.length, 'groves · rocks', rocks.userData.instances.length + wet.userData.instances.length);
  group.userData = { kind: 'hill-village', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); kit.dispose(); waterMat.dispose(); sim.dispose(); optics.dispose(); map.dispose(); field.texture.dispose(); } };
  const views = {};
  for (const [name, [x, z, yaw, label]] of Object.entries(P.views)) views[name] = label ? { x, z, yaw, label } : { x, z, yaw };      // (label: a place named by the land itself, not by the menu: the healed fringe's)

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

  // ------------------------------------------------------------------ painting ways by hand (path-brush.js asks; path-edits.js keeps the strokes)
  // A stroke shows at once: a way is one more of the ways the land lays (ground-paths.js) and the grass under it is laid low in the
  // ground picture; grass is let back up over whatever way is there (and a wood's floor painted there goes); a wood's floor (🍂)
  // goes into the floor's picture (forest-floor.js) and the grass there is let down to what the floor leaves. Only the grass's
  // amount is changed now (the ground picture's colour, the paths' little dip in the land and the map are made again when the
  // scene loads with the strokes saved). Grass and a wood's floor are laid in the ground picture as caps (the grass up to so
  // much, or down to so much), so they can be laid again over themselves, as they are when the sun's shadows are drawn anew
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
    if (isWay(o)) { const pp = wayPaint(o); eachTexel(opBox(o), (a, x, z) => { const q = pp(x, z); if (q) mapData[a] = Math.round(mapData[a] * (1 - q[0]) * (1 - 0.5 * q[2])); }); }
    else if (o.k === 'forest') { if (floor) eachTexel(opBox(o), (a, x, z) => { const g = floor.grass(x, z); if (g < 1) mapData[a] = Math.min(mapData[a], Math.round(255 * g)); }); }
    else eachTexel(opBox(o), (a, x, z) => { const f = grassOver(o, x, z); if (f > 0) mapData[a] = Math.max(mapData[a], Math.round(255 * f * (floor ? floor.grass(x, z) : 1))); });      // (in a wood: as thin as its grass)
  };
  const liveOps = [];                                                      // this visit's strokes (laid again after the sun's shadows are drawn anew)
  const pathEdit = {
    key: pathKey('hillvillage'), heightAt: H, inMap, baked: (P.pathOps || []).length, grassAt: map.grassAt,      // (how much grass grows at a spot, 0..1: for tests)
    ops: () => loadPathOps(pathKey('hillvillage')),                       // the strokes kept in this browser (already drawn)
    apply(op) {                                                            // one stroke, drawn now; gives back its undoing
      const box = opBox(op), [i0, i1, j0, j1] = texels(box), w = i1 - i0 + 1, before = new Uint8Array(w * (j1 - j0 + 1));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) before[(j - j0) * w + (i - i0)] = mapData[(j * MS + i) * 4 + 3];
      const forest = op.k === 'forest';
      if (!forest) paved.add(op);                                          // (first: a way's picture is worked out again with it, stones and all)
      const line = isWay(op) ? paths.add({ points: op.pts, half: op.half }) : null;
      if (!line && !forest) paths.repave(paved.box(op));                  // (grass: no way changes, only the stones under it go)
      const unfloor = !floor || isWay(op) ? null                           // (the wood's floor: laid, or grass takes it away; first, so the grass is let to what it leaves)
        : floor.paint(box, forest ? (x, z, v) => Math.max(v, floorOver(op, x, z)) : (x, z, v) => v * (1 - grassOver(op, x, z)));
      stampOp(op); liveOps.push(op);
      map.texture.needsUpdate = true;
      return () => {
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) mapData[(j * MS + i) * 4 + 3] = before[(j - j0) * w + (i - i0)];
        if (unfloor) unfloor();
        if (!forest) paved.remove(op);
        if (line) paths.remove(line); else if (!forest) paths.repave(paved.box(op));
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
      if (t.foot) { const { deep } = t.lift(it.x, it.z, it.yaw); if (deep > 1.2) return 'ตั้งคร่อมผา ฐานสูง ' + deep.toFixed(1) + ' ม.'; }
      else if (spots.some(([x, z]) => slope(x, z) > 0.9)) return 'อยู่บนหน้าผา';
      return '';
    },
  };
  // ---- the foliage arranged by hand (foliage-editor.js; the arrangement itself, as data: foliage-edits.js). The editor holds
  // the rows; here they are made into the scene again where they changed, and what is picked up gets a small scene of its
  // own to be carried about in. (Her way round a moved tree, the bare ground at its foot and its shadow are worked out when
  // the map loads again.)
  const foliageEdit = {
    key: foliageKey('hillvillage'), map: 'hillvillage', report: foliage, heightAt: H, groveOf, squareOf,
    rows: () => ({ plants: P.plants.map(r => r.slice()), clumps: (P.clumps || []).map(r => r.slice()), cover: (P.cover || []).map(r => r.slice()) }),
    plant(rows, dirty = null) {                                            // the scene from these rows: all of it, or only the groves and squares named ({ groves, squares }: sets of groveOf's and squareOf's keys)
      const F = withEast(entriesOf(rows));
      for (const box of paved.gaps(gapsOf(F))) paths.repave(box);          // (the paving's gaps where plants now stand)
      plantGroves(F, dirty && dirty.groves); plantCover(F.cover, dirty && dirty.squares);
    },
    sprig(rows, cx, cz) {                                                  // a few rows as a small scene of their own: an Object3D standing at (cx, 0, cz), to be moved and turned
      const F = entriesOf(rows), holder = new THREE.Group(), near = e => ({ ...e, x: e.x - cx, z: e.z - cz });
      holder.name = 'sprig'; holder.position.set(cx, 0, cz);
      if (F.plants.length) holder.add(woodOf(F.plants.map(near)));
      const clumps = F.plants.filter(e => e.type === 'clump').map(near);
      for (const b of F.beds) holder.add(bedOf(near(b), clumps, (x, z) => H(x + cx, z + cz), () => true));
      if (F.cover.length) holder.add(createGroundCover(F.cover.map(near)));
      holder.traverse(o => { o.frustumCulled = false; });
      group.add(holder);
      return holder;
    },
    drop(holder) { group.remove(holder); holder.traverse(m => { if (m.geometry) m.geometry.dispose(); }); },
  };
  // what is under her feet (her steps heard: step-sounds.js), asked with her height as standAt is: a bridge's deck ('stone',
  // 'wood'), 'water', and on the land what it is painted as: a bank's 'sand', 'earth' (a way, a field, dry or bare land),
  // bare 'stone' where it is steep, else 'grass'
  const surfaceAt = (x, z, y) => {
    const d = deckAt(x, z, y);
    if (d) return d.of;
    if (waterDepthAt(x, z, y) > 0.04) return 'water';
    if (farm && farm.soil.bedAt(x, z) > 0.5) return 'earth';                // (a bed dug on her farm)
    const [earth, sand] = paint(x, z);
    return sand > 0.5 ? 'sand' : earth > 0.5 ? (slope(x, z) > 0.75 ? 'stone' : 'earth') : 'grass';
  };
  return {
    group, map, field, grass, terrain, heightAt: H, standAt, waterDepthAt, surfaceAt, colliders, crowns, cameraTrunks, spawn: P.spawn, radius: 1e4, walkable, footing, views, placeEdit, pathEdit, foliageEdit, forestFloor: floor,
    homes: [...P.buildings.filter(b => b.kind === 'house' || b.kind === 'well').map(b => [b.x, b.z]), ...(P.props || []).filter(p => p[0] === 'stall').map(p => [p[1], p[2]])],      // (the village's houses and stalls: where the curse's mist stands, curse-weather.js)
    keepClear: (x, z) => slope(x, z) > 0.6 || paths.near(x, z).d < 2.5 || inField(x, z, 1) || inFarm(x, z, 1),
    farm,                                                                  // her farm (?farm=1): { soil, debris, setSun, rect }, or null
    oldFarm,                                                               // the hero's old farm round it (?oldfarm=1: old-farm.js; .tools for farm-tools.js), or null
    name: 'หมู่บ้านบนเขา หุบเขา และชายขอบตะวันตก (heightmap)', stats: { trees: plants.length, groves: groves.length, look, green, water: water.report, drought: drought && drought.report, pools: pools.length, mist: darkMist ? darkMist.sources : 0 },
    map: url(east ? (cursed ? M.mapEastCursed : green ? M.mapEastGreen : M.mapEast) : cursed ? M.mapCursed : green ? M.mapGreen : M.map), mapOverlay,
    horizon: { center: [CX, CZ], scale: horizonR / 170, layers: M.alps },      // the far hills (stylized-sky.js: the nearest ring is 170 m out): moved out to where the rim's wooded hills end
    optics, sim, ripple, waterLevelAt: (x, z) => { const b = x === undefined ? null : brookAt(x, z); return b ? b.level : WL; },
    // what of the land is heard (ambience-places.js; the trees' crowns it has above): the water's ways (each a line of
    // [x, z, level, width]) and which of them are the river (its name says: the rest are brooks and streams), every fall, and
    // the pit's shaft, out of which the wind comes (its middle, and how wide it is under its last shelf). Under the curse no
    // water runs: none of it is heard
    heard: { cursed, ways: cursed ? [] : P.brooks, rivers: cursed ? [] : P.brooks.map((w, k) => /river/.test((P.waters && P.waters[k] && P.waters[k].id) || '')), falls: cursed ? [] : P.falls.map(f => ({ x: f.x, z: f.z, top: f.top, bottom: f.bottom, width: f.width })),
      pit: P.pit ? { x: P.pit.x, z: P.pit.z, r: P.pit.brink - Math.max(...P.pit.shelves.map(sh => sh.u1)) } : null,
      // the windmill's sails (their hub, how far they reach, how fast they turn and how many there are) and the water wheel
      // (its axle, its radius, its turning, its paddles): both turn, and are heard, their wood as they go round. Under the curse
      // the wheel all but stands, out of a stream that does not run (water: false): its wood only, slowly
      windmill: mill ? { x: mill.object.position.x, y: mill.object.position.y, z: mill.object.position.z, r: P.buildings.find(b => b.kind === 'sails').span / 2, turns: SAILS_TURN, blades: 4 } : null,
      wheel: { x: P.wheel.x, y: P.wheel.level + 1.35, z: P.wheel.z, r: 2.0, turns: (cursed ? WHEEL_TURN_CURSED : WHEEL_TURN) / (2 * Math.PI), blades: 12, water: !cursed } },
    addUnderwater(obj) { obj.traverse(o => o.layers.enable(W.UNDERWATER)); },
    tapWater(origin, dir) {
      for (let t = 1; t < 70; t += 0.25) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t, ground = H(x, z), depth = waterDepthAt(x, z);
        if (depth > 0.03 && y <= ground + depth) { ripple(x, z, 2.4, 0.36); return true; }
        if (y <= ground) return false;
      }
      return false;
    },
    confine(p, from = null) {                                              // off the cliffs and out of deep water (and under a bridge, out of its piers: at her height, from's)
      const y = from ? from.y : undefined, walkable = (x, z) => walkableAt(x, z, y);
      if (walkable(p.x, p.z)) return;
      // walking into a cliff's edge (from: where she was, where she may be): she goes along the edge with the part of her step that
      // runs along it, or stops at it if she walks (nearly) straight in. (She was put back on the nearest ground she may stand on,
      // found by looking round in rings, the first ring 0.15 m out: every frame she pushed on she was thrown 0.15 m or more, three
      // times as far as a run's step, and not always the way she was going: she raced along the edge, or shook on the spot
      // running. Then her step was turned along the edge until it found ground: at a low cliff, whose edge is ragged, that kept
      // her creeping along it with her legs going even when she walked straight at it)
      if (from && walkable(from.x, from.z)) {
        const vx = p.x - from.x, vz = p.z - from.z, len = Math.hypot(vx, vz);
        let nx = 0, nz = 0;                                                // which way the edge faces her: the ground round her she may not stand on
        for (let i = 0; i < 16; i++) { const a = i / 8 * Math.PI, sx = Math.sin(a), sz = Math.cos(a); if (!walkable(from.x + sx * 0.4, from.z + sz * 0.4)) { nx += sx; nz += sz; } }
        const nl = Math.hypot(nx, nz);
        if (nl > 1e-6 && len > 1e-6) {
          nx /= nl; nz /= nl;
          const into = Math.max(0, vx * nx + vz * nz), ax = vx - nx * into, az = vz - nz * into, along = Math.hypot(ax, az);
          if (along > len * 0.4) for (const [k, off] of [[1, 0], [1, 0.4], [0.6, 0.6]]) {      // (walking within some 24 degrees of straight at it: she stops)
            let dx = ax * k - nx * along * off, dz = az * k - nz * along * off;      // (off: a little away from it, round a bump in a ragged edge)
            const dl = Math.hypot(dx, dz); if (dl > len) { dx *= len / dl; dz *= len / dl; }      // (never further than her step)
            if (walkable(from.x + dx, from.z + dz)) { p.x = from.x + dx; p.z = from.z + dz; return; }
          }
        }
        p.x = from.x; p.z = from.z; return;
      }
      // standing where she may not (put there): back to the nearest ground she may stand on
      for (let rr = 0.15; rr <= 3; rr += 0.15) for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos(a * Math.PI / 6) * rr, z = p.z + Math.sin(a * Math.PI / 6) * rr;
        if (walkable(x, z)) { p.x = x; p.z = z; return; }
      }
    },
    update(renderer, dt, scene = null, camera = null) {
      // the water's ripples: only when some water lies within 45 m of her (FAR, LIGHTER: they are worked out in a square of
      // 48 m round her, and further off there is none in it to show them)
      if (FAR_FULL || !camera || stretches.some(s => s.near(herAt) < 45)) sim.step(renderer, dt);
      droplets.update(renderer);
      if (mill) mill.update(dt);
      if (camera) { rocks.userData.update(camera); wet.userData.update(camera); }      // (each rock as finely as its distance calls for)
      wheel.rotation.x += dt * (cursed ? WHEEL_TURN_CURSED : WHEEL_TURN);     // (in the drought it barely turns)
      if (scene && camera) {
        frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        camWorld.setFromMatrixPosition(camera.matrixWorld);
        // what is out of view is not drawn: a grove, a bed of flowers (nor one too far off to see)
        // the water in view: how near the nearest of it is, and at what height it lies (the waters lie at several heights)
        let near = Infinity, level = WL;
        for (const s of stretches) if (frustum.intersectsSphere(s.sphere)) { const d = s.near(camWorld); if (d < near) { near = d; level = s.level; } }
        const mirrorY = optics.quality > 0 && near < 75 ? level : null;      // (where the water mirrors the trees: a tree out of view may stand in it)
        for (const g of inView) {
          const d = g.far ? g.box.distanceToPoint(camWorld) : 0;
          g.obj.visible = frustum.intersectsBox(g.box) && (!g.far || d < g.far);
          if (g.thin && g.obj.visible) g.thin(FAR_FULL ? (d < 38 ? 1 : d < 65 ? 0.6 : 0.35) : d < 32 ? 1 : d < 55 ? 0.5 : 0.25);      // (FAR, LIGHTER)
          if (g.lod && g.obj.visible) { if (leafLodOff) g.lod(null); else g.lod(camWorld, frustum, mirrorY); }      // a grove's leaves: only the cells in view, only the cards that still show from here
        }
        for (const lod of leafLods) { if (leafLodOff) lod(null); else lod(camWorld, frustum, mirrorY); }
        water.update(renderer, frustum, camWorld);                           // (a fall out of view or far away is not drawn either)
        // the water's two pictures (what lies under it, what is mirrored on it): only when water is on screen and near, made
        // for the height of the stretch she is nearest (found above), and without the far groves
        frameNo++;
        const q = optics.quality, doThrough = near < 45, doMirror = q > 0 && near < 75 && frameNo % (q === 2 ? 2 : 4) === 0;
        if (doThrough || doMirror) {
          if (optics.setLevel) optics.setLevel(level);
          const out = hidden.slice();
          for (const g of groves) if (g.obj.visible && g.box.distanceToPoint(camWorld) > 70) out.push(g.obj);
          if (!FAR_FULL) for (const g of inView) if (g.small && g.obj.visible && g.box.distanceToPoint(camWorld) > 20) out.push(g.obj);      // (nor ferns, tufts or flowers further off than 20 m: FAR, LIGHTER)
          for (const o of water.small) out.push(o);                           // (nor the spray and billows at the falls' feet: too small to tell in a mirror)
          optics.render(renderer, scene, camera, out, doThrough, doMirror);
        }
      }
      else water.update(renderer);
      if (farm) { farm.soil.update(dt); farm.debris.update(dt); }
      const nowT = N._internal.shared.uTime.value;
      map.send(renderer);                                                  // (the sun's new shadows, a strip a frame: stylized-grassfield.js, SENT A STRIP AT A TIME)
      if (castBusy) { if (map.stepCast(2.5)) { castBusy = false; lastCast = nowT; cast.dir.copy(castSun); if (liveOps.length) { liveOps.forEach(stampOp); if (!map.sending) map.texture.needsUpdate = true; } if (farm) farm.soil.restamp(); } }      // (the map's grass laid back as it was when the shadows began: the strokes and her farm's beds laid again, before the strips that carry them go)
      // (the sun moved: its shadows cast anew. Not while it is down: there are none to see then (k 0), and they were cast
      // over and over all night long, from below the ground, each a long one; at dawn the light coming back casts them)
      else if (nowT - lastCast > 4 && ((castSun.angleTo(wantSun) > 0.075 && Math.max(castK, wantK) > 0.02) || Math.abs(castK - wantK) > 0.12)) { castSun.copy(wantSun); castK = wantK; castBusy = true; map.beginCast(sunShadows(castSun), castK); }
    },
    setSun(dir, k = 1) {
      wantSun.copy(dir); wantK = k; cast.k = Math.min(1, k * 1.2); setAnimeSun(dir); setFrondPineSun(dir); setFlowerSun(dir); setGroundCoverSun(dir); rim.userData.setSun(dir, cast.k);      // (the trees' crowns are lit by it live)
      if (landWays && landWays.uniforms.uWaySun && Math.hypot(dir.x, dir.z) > 1e-3) landWays.uniforms.uWaySun.value.set(dir.x, dir.z).normalize();      // (the paving's lit edges)
      if (farm) farm.setSun(dir);                                          // (her farm's ridges, and its wood)
    },
    get sunCast() { return cast; },
    follow(pos, lookDir) { herAt.copy(pos); grass.userData.follow(pos, lookDir); N.setWalker(pos); W.WATER_WAKE.track(pos.x, pos.z, waterDepthAt(pos.x, pos.z)); sim.focus(pos.x, pos.z); },
  };
}
