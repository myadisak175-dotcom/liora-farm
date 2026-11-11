// valley-level.js
// The waterfall valley as a walkable map: a river runs down a cliff-walled valley from a waterfall at its head.
// The land itself (cliffs, sand banks, waterfall, upper river, bridge) comes from stylized-terrain.js; this file
// dresses it and plugs in the game's systems: the clear water, the fluffy grass, the forest batches.
// A path cut into the east cliff's shoulder climbs from near the bridge to the plateau beside the falls. Up there the land
// is built up in terraces round the upper river, which comes down them in cascades: a windmill on the meadow by the lip, a
// stone bridge, a few houses round a well, a water mill, and on the terrace above a great tree, more houses, a pasture and a
// keep on a knoll. The buildings are stand-ins built in code (stylized-buildings.js) until real models take their place.
//
//   const level = await buildValleyLevel({ far, deer, onStep });      // same result object as the other maps
//   level.confine(p)   keeps a walker where she can walk: the valley floor, the cliff path, the meadow (the cliffs are walls)

import * as THREE from 'three';
import * as N from './stylized-nature.js';
import * as T from './stylized-terrain.js';
import * as A from './stylized-animals.js';
import * as G from './stylized-grassfield.js';
import * as W from './stylized-water.js';
import { createAnimeCells } from './anime-cells.js';
import { createWaterDroplets } from './water-droplets.js';
import { createWaterfall, FALL_TUNE } from './stylized-waterfall.js';
import { loadProp, propMaterial } from './stylized-props.js';
import * as BD from './stylized-buildings.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const { mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---- the village above the falls: where everything stands (metres; z grows down the valley, so "north" is -z, upstream)
const VILLAGE = {
  steps: [{ z: -66, rise: 5.5 }, { z: -84, rise: 4.5 }],                  // the terraces: at each z the land and the river step up
  knoll: { x: -32, z: -76.5, r: 13.5, top: 5.5, h: 3.0 },                 // the keep's knoll, on the upper terrace
  // rocky tors standing up out of the terraces (the last one joins the knoll into a ridge behind the keep)
  tors: [{ x: -40.5, z: -66.5, r: 5.5, top: 1.2, h: 4.2 }, { x: 33, z: -65.3, r: 5.2, top: 1.0, h: 3.8 }, { x: -23, z: -81.8, r: 4.4, top: 0.8, h: 3.4 }],
  ramps: [                                                                // ways from one terrace to the next
    [[30, -59], [24, -63.5], [18, -67], [12, -70.5]],                     // east: from the windmill's meadow up to the great tree
    [[-38, -58], [-33, -63], [-27, -66.5], [-20, -70]],                   // west: from the lower houses up toward the keep
    [[-16, -76.4], [-21, -76.8], [-26.6, -76.5]],                         // up the knoll to the keep's door
  ],
  mill: [13, -55],                                                         // the windmill
  stoneBridgeZ: -56.5, woodBridgeZ: -71.5, waterMillZ: -61.5,
  houses: [                                                                // x, z, which way the door faces (yaw), size
    { x: -19, z: -54.3, yaw: Math.PI, w: 6, d: 4.4, floors: 1, seed: 11 }, // lower terrace, between the lip and the way: doors to the way
    { x: -30.5, z: -53.6, yaw: Math.PI, w: 6.4, d: 5, floors: 2, seed: 12 },
    { x: 22.5, z: -79.4, yaw: 0, w: 6, d: 5, floors: 2, seed: 13 },        // upper terrace, behind the great tree: doors toward it
    { x: 2, z: -79.5, yaw: 0, w: 5.6, d: 4.6, floors: 1, seed: 14 },
    { x: 13.5, z: -80, yaw: 0, w: 5.6, d: 5, floors: 1, seed: 15 },
    { x: 4, z: -60.3, yaw: 0, w: 5.2, d: 4.4, floors: 1, seed: 16 },       // lower terrace, between the windmill and the river
    { x: 35, z: -53.5, yaw: -Math.PI / 2, w: 6, d: 5, floors: 2, seed: 17 },   // lower terrace, at the meadow's east end
    { x: -14, z: -79.6, yaw: 0, w: 5.6, d: 4.6, floors: 1, seed: 18 },     // upper terrace, west of the river
  ],
  well: [-24.5, -61],
  keep: { x: -33.5, z: -76.5, yaw: Math.PI / 2 },
  tree: [10, -74.5],
  pasture: [[29.5, -69.5], [40, -69.5], [40, -80.5], [29.5, -80.5]],
  // trodden ways between things (drawn as bare earth)
  paths: [
    [[24, -46], [17, -49.3], [7, -50.3], [1.5, -53.5], [-1.3, -56.5]], [[24, -46], [27.5, -52], [30, -59]],      // round the windmill to the stone bridge; to the east ramp
    [[-12.9, -56.5], [-18, -58], [-31, -58], [-38, -58]], [[-16, -58], [-14.6, -58.9]], [[-24, -58], [-24.4, -59.6]],
    [[12, -70.5], [10.5, -71.8], [0, -71.7], [-2.4, -71.5]], [[-12.8, -71.5], [-16, -76.4]], [[-12.8, -71.5], [-20, -70]],
    [[10.5, -71.8], [19.5, -73.5], [29.5, -75]], [[6, -72.5], [3, -76.8]], [[14.5, -72.6], [14, -77]], [[22.5, -74], [22.5, -76.2]],
    [[1.2, -55], [3.4, -57.7]], [[27.5, -52], [31.7, -53.2]], [[-13.6, -72.6], [-13.4, -76.9]],
  ],
  // trodden yards: round the well, under the great tree, before the keep's door
  yards: [[-24.5, -59.8, 3.2], [8.5, -72.6, 3.8], [-27.6, -76.5, 2.2]],
  // small things that make it look lived in: kind, x, z, which way it faces
  props: [
    ['stall', 3.6, -69.5, Math.PI], ['stall', -0.6, -69.3, Math.PI], ['table', 6.6, -76.8, 0.3], ['barrels', 5.4, -77.2, 0], ['crates', 10.3, -77.5, 1],
    ['woodpile', 18.6, -77.2, 0], ['barrels', 26.4, -77.3, 2], ['lamp', -1.2, -70.4, 0], ['lamp', 16.5, -72, 3.1], ['lamp', -11.6, -70.1, 0],
    ['signpost', -15.6, -73.6, 0.5], ['hay', 37.4, -71.6, 0.4], ['hay', 38.2, -78.4, 2], ['sheep', 33, -73, 0.6], ['sheep', 35.4, -76.6, 2.4], ['sheep', 37, -74.6, 4],
    ['sheep', 32.2, -78.3, 5.2], ['sheep', 36.2, -71.3, 1.6], ['barrels', -27.3, -78.7, 0], ['lamp', -27.6, -74.5, 1.6], ['crates', -17.6, -77.3, 2],
    ['stall', -29.6, -60.6, 0], ['barrels', -16.6, -58.9, 1], ['crates', -15, -56.3, 0], ['bench', -22.2, -62, -0.9], ['woodpile', -34.9, -55.6, 1.57],
    ['lamp', 0.4, -58, 3.1], ['lamp', -14.2, -55.2, 0], ['lamp', -26.2, -56.9, 0], ['signpost', -36.3, -56.5, 2], ['signpost', 22.6, -45, 1],
    ['cart', 17.6, -58.6, 0.7], ['hay', 9.2, -59.4, 1], ['sheep', 20.5, -58.2, 3.3], ['sheep', 22.6, -56.6, 0.4], ['barrels', 7.6, -58.2, 0], ['crates', 31.6, -56.6, 1],
    ['bench', 8.8, -47.6, 0], ['woodpile', -9.9, -81.2, 0],
  ],
  // by hand: bushes at the houses' corners, flower beds, a few pines for a change from the round trees
  shrubs: [[-22.6, -51.9], [-15.2, -52.3], [-34.8, -51.2], [-26.4, -51.4], [-17, -63.6], [5.6, -82.4], [-1.6, -77.4], [17, -77.3], [26.6, -81.8], [18.6, -82],
    [7.4, -62.3], [0.6, -62.2], [38.6, -56], [31.5, -50.6], [-17.6, -81.6], [-10.2, -78], [-29, -71.6], [-37.6, -73.2]],
  flowers: [[-21.5, -60.5, 1.6], [6.5, -69, 1.5], [12.5, -77.2, 1.3], [-0.5, -57.8, 1.4], [26, -71, 1.8], [-30, -63.5, 1.5], [30, -62.5, 1.6]],
  pines: [[-40.5, -61.5, 1.15], [-41, -66.5, 1.3], [39.5, -65, 1.25], [36, -66.6, 1.05], [-6.5, -82.4, 1.1], [27, -83, 1.2], [-21, -83, 1.25], [40.5, -58.5, 1.1], [-41.5, -50, 1.2]],
};
const villageLevel = (x, z) => ss(47, 41, Math.abs(x)) * ss(-92, -87, z);      // where the terraces are kept even
// the hills that stand round the village: a craggy ridge behind it, and shoulders climbing away on either side
const villageHills = (x, z, headZ) => (12 * ss(-86.5, -95, z) + 10 * ss(45, 61, Math.abs(x)) * ss(headZ - 2, headZ - 16, z))
  * (0.7 + 0.6 * N._internal.fbm3(x * 0.07, 2.2, z * 0.07, 77, 3));

export async function buildValleyLevel({ seed = 1, far = '#cde6f2', deer = null, grassCount = 150000, sun = [-0.4, 0.9, 0.5], windmill = './assets/models/windmill.glb', onStep = async () => {} } = {}) {
  const group = new THREE.Group();
  group.name = 'valleyLevel';
  const rng = mulberry32(seed * 977 + 3);
  const R = (a, b) => a + rng() * (b - a);

  // ------------------------------------------------------------------ the land
  await onStep('ปั้นหุบเขาและหน้าผา');
  const V = T.createValley({ seed, far, path: false, bridge: true, skirt: true, climb: { side: 1 },      // the cliff path is on the +x side
    tiers: { steps: VILLAGE.steps, flat: villageLevel, mounds: [VILLAGE.knoll, ...VILLAGE.tors], rise: villageHills, ramps: VILLAGE.ramps } });
  group.add(V.group);
  const terrain = V.group.children.find(o => o.name !== 'water' && o.isMesh);
  // the valley's own water (flat-colour river, upper river, waterfall, foam clumps) is replaced by the clear water below
  for (const o of V.group.children) if (['water', 'waterfall', 'foam'].includes(o.name)) o.visible = false;
  const B = V.bounds, CX = (B.x0 + B.x1) / 2, CZ = (B.z0 + B.z1) / 2, FR = Math.max(B.x1 - B.x0, B.z1 - B.z0) / 2 + 10;
  // the coarse land beyond the map edge is only meant to be seen outside it: inside, its big cells can poke up
  // through the detailed ground (a green slab beside the waterfall), so sink it well out of sight there
  const skirt = V.group.getObjectByName('terrainSkirt');
  if (skirt) {
    const sp = skirt.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), z = sp.getZ(i);
      if (x > B.x0 + 6 && x < B.x1 - 6 && z > B.z0 + 6 && z < B.z1 - 6) sp.setY(i, sp.getY(i) - 40);
    }
    sp.needsUpdate = true;
    skirt.geometry.computeBoundingSphere();
  }
  const rx = V.riverX, rw = V.riverHalfWidth, fall = V.waterfall, WL = V.levels.water;
  const HV = V.heightAt;
  const lower = (x, z) => V.waterLevelAt(x, z) === WL;                   // not up on the plateau behind the falls
  const MILL_YAW = -1.54;                                                  // turns the windmill so its sails face down the valley, toward the falls
  // bridges up on the plateau (both lie along x): where each is, and the height of its deck u metres from its middle
  const decks = [];
  const deckAt = (x, z) => { for (const d of decks) if (Math.abs(x - d.x) < d.len / 2 && Math.abs(z - d.z) < d.halfW) return d; return null; };
  const H = (x, z) => { const d = deckAt(x, z); return d ? d.y(x - d.x) : V.surfaceAt(x, z); };      // ground, or a bridge deck
  const waterDepthAt = (x, z) => (!lower(x, z) || H(x, z) > HV(x, z) + 0.01) ? 0 : Math.max(0, WL - HV(x, z));
  await onStep('วัดความสูงพื้น');
  const field = G.createHeightField({ radius: FR, center: [CX, CZ], cells: 340, heightFn: HV });
  const Hf = field.heightAt;                                             // cheap copy of the height, for painting
  const slopeF = (x, z) => { const e = 0.6, hx = (Hf(x + e, z) - Hf(x - e, z)) / (2 * e), hz = (Hf(x, z + e) - Hf(x, z - e)) / (2 * e); return 1 - 1 / Math.sqrt(1 + hx * hx + hz * hz); };

  // where a walker may be: the valley floor between the two cliff feet, below the head wall, short of the map's end;
  // the path cut into the cliff; and up on the plateau, the meadow where the path comes out and the village terraces
  // (even ground only: the risers between terraces are walls, the ramps and the bridges are the ways across)
  const Z_HEAD = fall.z + 2.5, Z_END = B.z1 - 7;
  const CL = V.climb, PW = V.plateauRiverHalfWidth, PLW = V.levels.plateauWater, PX = V.plateauRiverX;
  const MILL = VILLAGE.mill;                                               // the windmill: back from the lip, east of the upper river
  const MEADOW_R = 13;                                                     // the meadow: this far either side of the line from the path's top to the mill
  const meadowDist = (x, z) => {                                           // metres from the meadow's middle line
    const [ax, az] = CL.top, dx = MILL[0] - ax, dz = MILL[1] - az;
    const t = Math.max(0, Math.min(1.25, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  };
  const inVillage = (x, z) => Math.abs(x) < 43 && z > -83.5 && z < V.headZ(x);
  const upTop = (x, z) => inVillage(x, z) || meadowDist(x, z) < MEADOW_R;
  const evenGround = (x, z) => {                                           // up on the plateau and not too steep to stand on
    if (Hf(x, z) < PLW + 0.5) return false;
    const e = 0.5, hx = (Hf(x + e, z) - Hf(x - e, z)) / (2 * e), hz = (Hf(x, z + e) - Hf(x, z - e)) / (2 * e);
    return hx * hx + hz * hz < 0.36;                                       // a grade of 0.6
  };
  const inStream = (x, z) => Math.abs(x - PX(z)) < PW + 0.9;
  const onRamp = (x, z) => { for (const r of V.ramps) if (r.at(x, z).d < r.half - 0.3) return true; return false; };
  const onPlateau = (x, z) => upTop(x, z) && (deckAt(x, z) ? true : !inStream(x, z) && (evenGround(x, z) || onRamp(x, z)));
  const onPath = (x, z) => CL.at(x, z).d < CL.half - 0.15;
  // the floor stops short of the cliff foot under a raised stretch of the path, so stepping off the shelf never drops her down to it
  const underPath = (x, z) => { const c = CL.at(x, z); return c.d < CL.half + 1.6 && c.y - HV(x, z) > 0.5; };
  const floorOK = (x, z) => z > Z_HEAD && z < Z_END && Math.abs(x - rx(z)) < V.cliffLine(x, z) - 1.0;
  // the shelf's shoulders, where the ground is within half a metre of the path's height, belong to the path (no slivers beside it)
  const pathShoulder = (x, z) => { const c = CL.at(x, z); return c.d < CL.half + 1.6 && Math.abs(c.y - HV(x, z)) <= 0.5; };
  const walkable = (x, z) => onPath(x, z) || pathShoulder(x, z) || ((floorOK(x, z) || onPlateau(x, z)) && !underPath(x, z));
  const confine = p => {
    if (walkable(p.x, p.z)) return;
    // the nearest place she may stand: a step back the way she came (a small ring round her), or back onto the floor or the path's line
    const cands = [];
    ring: for (let r = 0.12; r <= 2.6; r += 0.16) {
      let best = null, bd = Infinity;
      for (let a = 0; a < 12; a++) {
        const q = { x: p.x + Math.cos(a * Math.PI / 6) * r, z: p.z + Math.sin(a * Math.PI / 6) * r };
        if (!walkable(q.x, q.z)) continue;
        // of the points on this ring, the one deepest inside (so she slides along an edge instead of catching on it)
        let inside = 0; for (let b = 0; b < 6; b++) if (walkable(q.x + Math.cos(b * Math.PI / 3) * 0.3, q.z + Math.sin(b * Math.PI / 3) * 0.3)) inside++;
        if (-inside < bd) { bd = -inside; best = q; }
      }
      if (best) { cands.push(best); break ring; }
    }
    const f = { x: p.x, z: Math.min(Z_END - 0.02, Math.max(Z_HEAD + 0.02, p.z)) };
    for (let i = 0; i < 3; i++) { const cx = rx(f.z), lim = V.cliffLine(f.x, f.z) - 1.05, dx = f.x - cx; if (Math.abs(dx) > lim) f.x = cx + Math.sign(dx) * lim; }
    cands.push(f);
    for (const o of [p, f]) {                                              // from where she is, or from the cliff foot under the path:
      const c = CL.at(o.x, o.z);                                           // step back toward the path's line until on it
      if (c.d >= 4) continue;
      for (let k = 1; k <= 8; k++) {
        const e = 0.05 * k, q = { x: o.x, z: o.z };
        const gx = CL.at(o.x + e, o.z).d - CL.at(o.x - e, o.z).d, gz = CL.at(o.x, o.z + e).d - CL.at(o.x, o.z - e).d, gl = Math.hypot(gx, gz) || 1;
        const back = c.d - (CL.half - 0.2);
        q.x -= gx / gl * back; q.z -= gz / gl * back;
        if (onPath(q.x, q.z)) { cands.push(q); break; }
      }
    }
    let best = null, bd = Infinity;
    for (const q of cands) { if (!walkable(q.x, q.z)) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
    if (!best) best = f;
    p.x = best.x; p.z = best.z;
  };
  const onFloor = (x, z, pad = 0) => z > Z_HEAD + pad && z < B.z1 - 2 && Math.abs(x - rx(z)) < V.cliffLine(x, z) - 1.0 - pad;
  const side = V.bridge ? Math.sign(V.bridge.ends[1][0] - V.bridge.x) || 1 : 1;
  const spawn = { x: rx(44) + side * 8, z: 44, yaw: Math.PI };            // at the valley mouth, looking up at the falls

  // ------------------------------------------------------------------ plants
  await onStep('ปลูกป่าบนผาและตีนผา');
  const placed = [], plants = [], colliders = [], crowns = [], shade = [], bare = [], press = [];
  // shadows thrown along the sun's direction. L points at the sun; a point h above the ground throws its shadow h * SLEN further out the other way.
  // The casters are only remembered here (what, where, how high); sunShadows() turns them into shapes for the sun of the moment.
  const L = new THREE.Vector3(...sun).normalize();
  let SU = [0, 1], SLEN = 1, LY = 1;
  const sunShadows = dir => {
    L.copy(dir).normalize();
    const dxz = Math.hypot(L.x, L.z) || 1, ly = Math.max(0.3, L.y);                // a sun on the horizon would throw endless shadows
    SU = [-L.x / dxz, -L.z / dxz]; SLEN = dxz / ly; LY = ly;
    return casters.map(([kind, x, z, h, r, st, dap]) => kind === 0
      ? [x + SU[0] * SLEN * h, z + SU[1] * SLEN * h, r / ly * 1.02, r, SU[0], SU[1], st, dap]                          // a ball: its middle is h up
      : [x + SU[0] * SLEN * h / 2, z + SU[1] * SLEN * h / 2, SLEN * h / 2 + r, r, SU[0], SU[1], st, 0]);               // a stick: from the foot up to h
  };
  const casters = [];
  const castBall = (x, z, h, r, st = 0.9, dap = 0) => casters.push([0, x, z, h, r, st, dap]);
  const castStick = (x, z, h, w, st = 0.75) => casters.push([1, x, z, h, w, st, 0]);
  const CROWN_Y = { broadleaf: 5.7, oak: 5.2, pine: 5.6, birch: 6.6, sapling: 3.4 }, CROWN_R = { broadleaf: 2.9, oak: 3.5, pine: 2.3, birch: 2.0, sapling: 1.3 };
  const TRUNK = { broadleaf: 0.42, oak: 0.55, pine: 0.38, birch: 0.24, sapling: 0.2 };
  const CROWN = { broadleaf: 4.2, oak: 5.2, pine: 3.0, birch: 2.6, sapling: 2.0 };
  const clear = (x, z, r) => placed.every(p => Math.hypot(p[0] - x, p[1] - z) > p[2] + r);
  let ps = seed * 100;
  const shrub = (x, z, scale = 1) => {
    if (HV(x, z) < WL + 0.6) return;
    plants.push({ kind: 'bush', type: rng() < 0.35 ? 'flowering' : 'round', seed: ++ps, x, y: HV(x, z), z, rotY: rng() * 6.28, scale });
    colliders.push([x, z, 0.75 * scale]); shade.push([x, z, 1.7 * scale, 0.45]); placed.push([x, z, 1.0 * scale]); castBall(x, z, 0.55 * scale, 0.95 * scale, 0.8, 0.2);
  };
  const cameraTrunks = [];
  const tree = (type, x, z, scale = 1, detail = 0.8, bush = false) => {
    const y = HV(x, z);
    plants.push({ kind: 'tree', type, seed: ++ps, detail, x, y, z, rotY: rng() * 6.28, scale });
    placed.push([x, z, CROWN[type] * scale * 0.42]);
    colliders.push([x, z, TRUNK[type] * scale + 0.22]);
    cameraTrunks.push([x, z, TRUNK[type] * scale + 0.12, y, y + CROWN_Y[type] * scale]);
    crowns.push([x, y + CROWN_Y[type] * scale, z, CROWN_R[type] * scale]);
    shade.push([x, z, CROWN[type] * scale * 1.05, 0.4]); bare.push([x, z, TRUNK[type] * scale * 1.5]);
    castBall(x, z, CROWN_Y[type] * scale, CROWN_R[type] * scale, 0.88, 0.3);
    castStick(x, z, CROWN_Y[type] * scale * 0.85, Math.max(0.22, TRUNK[type] * scale * 0.7));
    if (bush) { const a = rng() * 6.28, d = (TRUNK[type] + 1.1) * scale; shrub(x + Math.cos(a) * d, z + Math.sin(a) * d, R(0.75, 1.05)); }
  };
  placed.push([spawn.x, spawn.z, 5]);
  if (V.bridge) for (const e of V.bridge.ends) placed.push([e[0], e[1], 4.5]);
  for (let i = 0; i < CL.line.length; i += 3) placed.push([CL.line[i][0], CL.line[i][1], CL.half + 0.6]);     // the cliff path stays clear
  placed.push([MILL[0], MILL[1], 9]);                                      // room round the windmill
  // room round everything in the village, and its ways kept clear
  for (const h of VILLAGE.houses) placed.push([h.x, h.z, 6.5]);
  placed.push([VILLAGE.keep.x, VILLAGE.keep.z, 8], [VILLAGE.well[0], VILLAGE.well[1], 4], [PX(VILLAGE.waterMillZ) - 5, VILLAGE.waterMillZ, 7]);
  placed.push([PX(VILLAGE.stoneBridgeZ), VILLAGE.stoneBridgeZ, 8], [PX(VILLAGE.woodBridgeZ), VILLAGE.woodBridgeZ, 8]);
  { const q = VILLAGE.pasture; placed.push([(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2, 9]); }
  const vsegs = [];                                                        // the village's ways, as segments
  for (const line of [...VILLAGE.paths, ...V.ramps.map(r => r.line)]) for (let i = 0; i < line.length - 1; i++) vsegs.push([line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]]);
  const wayDist = (x, z) => {
    if (z > -40 || Math.abs(x) > 46) return 99;
    let best = 99;
    for (const [ax, az, bx, bz] of vsegs) {
      const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    for (const [yx, yz, yr] of VILLAGE.yards) best = Math.min(best, Math.max(0, Math.hypot(x - yx, z - yz) - yr + 0.6));
    return best;
  };
  for (const p of VILLAGE.props) placed.push([p[1], p[2], 1.4]);
  for (const [ax, az, bx, bz] of vsegs) { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2.5); for (let i = 0; i <= n; i++) placed.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n, 2.2]); }
  // dense forest on the heights (seen from below, so light on leaf cards), bushes only at tree feet
  for (let i = 0; i < 2600; i++) {
    const x = R(B.x0 + 2, B.x1 - 2), z = R(B.z0 + 2, B.z1 - 2);
    const kind = V.kindAt(x, z);
    if (kind === 'plateau') {
      if (Math.abs(x - V.plateauRiverX(z)) < 5 && !lower(x, z)) continue;         // keep the upper river open
      if ((meadowDist(x, z) < MEADOW_R + 1 || (Math.abs(x) < 45 && z > -85.5)) && rng() > 0.05) continue;      // the meadow and the village: open grass, a lone tree here and there
      if (inStream(x, z) || Math.abs(x - PX(z)) < PW + 3.5) continue;
      const pick = rng(), type = pick < 0.4 ? 'pine' : pick < 0.75 ? 'oak' : 'broadleaf', sc = R(1.0, 1.55);
      if (clear(x, z, CROWN[type] * sc * 0.36)) tree(type, x, z, sc, type === 'pine' ? 0.22 : 0.28, rng() < 0.12);
    } else if (kind === 'floor' && onFloor(x, z, 1.5)) {
      const adx = Math.abs(x - rx(z)), foot = V.cliffLine(x, z) - adx;                // metres to the cliff foot
      if (rng() > (foot < 7 ? 0.75 : 0.1)) continue;
      const pick = rng(), type = pick < 0.4 ? 'broadleaf' : pick < 0.65 ? 'oak' : pick < 0.85 ? 'birch' : 'sapling', sc = R(0.85, 1.2);
      if (clear(x, z, CROWN[type] * sc * 0.55)) tree(type, x, z, sc, 0.85, rng() < 0.6);
    }
  }

  // the great tree in the middle of the upper terrace, and a few trees picked by hand among the houses
  tree('oak', VILLAGE.tree[0], VILLAGE.tree[1], 2.3, 1.0);
  for (const [type, x, z, sc] of [['birch', -26.5, -61.5, 1.0], ['broadleaf', -37, -51.5, 1.0], ['sapling', -14.5, -52.5, 1.1], ['birch', 27, -68, 1.05], ['broadleaf', -3, -67.5, 0.9],
    ['sapling', 8, -81.5, 1.2], ['birch', -15, -80, 1.0], ['broadleaf', 36, -62, 1.1], ['sapling', 5, -62, 1.1]]) if (clear(x, z, 1.5)) tree(type, x, z, sc, 0.9, true);
  for (const [x, z, sc] of VILLAGE.pines) if (clear(x, z, 1.3)) tree('pine', x, z, sc, 0.6);
  for (const [x, z] of VILLAGE.shrubs) if (clear(x, z, 0.5) && !inStream(x, z)) shrub(x, z, R(0.7, 1.0));

  // ------------------------------------------------------------------ the windmill on the meadow
  let mill = null;
  if (windmill) {
    await onStep('สร้างกังหันลม');
    try {
      mill = await loadProp(windmill, { height: 11.5, yaw: MILL_YAW, spin: { part: /^polySurface142_/, speed: 0.12 } });      // the sails turn slowly
      const my = HV(MILL[0], MILL[1]) - 0.2;
      mill.object.position.set(MILL[0], my, MILL[1]);
      mill.object.name = 'windmill';
      group.add(mill.object);
      // its base: solid to walk into, bare ground under it, a short shadow all round, and tall shadows for the tower and its cap
      for (const [x, z] of mill.footprint(1)) { colliders.push([x, z, 0.62]); bare.push([x, z, 0.85]); castBall(x, z, 1.6, 0.85, 0.7); }
      castStick(MILL[0], MILL[1], 7.5, 1.6);
      castBall(MILL[0], MILL[1], 8.2, 2.4, 0.85);
      for (const [dx, dz] of [[5, 4], [-4.5, 5.5], [6, -2]]) shrub(MILL[0] + dx, MILL[1] + dz, R(0.8, 1.05));
    } catch (e) { console.warn('windmill', e); mill = null; }
  }

  // ------------------------------------------------------------------ the village: stand-in buildings built in code
  await onStep('สร้างหมู่บ้าน');
  const builds = [];
  const groundUnder = (x, z, w, d, yaw) => {                               // where a building's floor sits: a little above the lowest corner
    const c = Math.cos(yaw), s = Math.sin(yaw); let lo = Infinity, hi = -Infinity;
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) { const h = HV(x + lx * w / 2 * c + lz * d / 2 * s, z - lx * w / 2 * s + lz * d / 2 * c); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    return lo + (hi - lo) * 0.3;
  };
  // something built: solid to walk into, bare ground under it, and its shadow
  const solid = (x, z, w, d, yaw, h) => {
    for (const c of BD.rectCircles(x, z, w, d, yaw)) colliders.push(c);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let lx = -w / 2 + 0.5; lx <= w / 2 - 0.4; lx += 1) for (let lz = -d / 2 + 0.5; lz <= d / 2 - 0.4; lz += 1) bare.push([x + lx * c + lz * s, z - lx * s + lz * c, 1.0]);
    castBall(x, z, h * 0.4, Math.max(w, d) * 0.55, 0.85);
    castStick(x, z, h * 0.75, Math.min(w, d) * 0.42, 0.8);
  };
  for (const hd of VILLAGE.houses) {
    const g = BD.houseGeometry(hd), { w, d, height } = g.userData;
    builds.push(BD.place(g, hd.x, groundUnder(hd.x, hd.z, w, d, hd.yaw), hd.z, hd.yaw));
    solid(hd.x, hd.z, w, d, hd.yaw, height);
  }
  {                                                                        // the keep on its knoll
    const k = VILLAGE.keep, g = BD.towerGeometry({ seed: 21 }), { w, d, height } = g.userData;
    builds.push(BD.place(g, k.x, HV(k.x, k.z) - 0.15, k.z, k.yaw));
    solid(k.x, k.z, w, d, k.yaw, height);
    colliders.push([k.x - 2.75, k.z - 2.75, 1.6]);                         // its corner turret (after the turn it stands on this corner)
  }
  {                                                                        // the well in the lower houses' yard
    const [x, z] = VILLAGE.well;
    builds.push(BD.place(BD.wellGeometry({ seed: 22 }), x, HV(x, z), z, 0.4));
    colliders.push([x, z, 1.15]); bare.push([x, z, 2.2]); castBall(x, z, 1.4, 1.3, 0.8);
  }
  // the water mill on the lower terrace, just below the first cascade: its house on the west bank, its wheel in the stream
  let wheel = null;
  {
    const z = VILLAGE.waterMillZ, sx = PX(z), hx = sx - 5.75, def = { x: hx, z, yaw: 0, w: 5.5, d: 4.6, floors: 1, wall: 3.3, doorX: -1.2, seed: 23 };
    const g = BD.houseGeometry(def), { w, d, height } = g.userData;
    builds.push(BD.place(g, hx, groundUnder(hx, z, w, d, 0), z, 0));
    solid(hx, z, w, d, 0, height);
    wheel = new THREE.Mesh(BD.wheelGeometry({ radius: 2.0, width: 1.0, axle: 3.2, seed: 24 }), propMaterial());
    wheel.name = 'waterWheel';
    wheel.position.set(sx - 1.7, V.plateauWaterAt(z) + 1.3, z);
    wheel.userData.dispose = () => wheel.geometry.dispose();
    group.add(wheel);
    colliders.push([sx - 1.7, z, 1.3]);
  }
  {                                                                        // the stone bridge on the lower terrace
    const z = VILLAGE.stoneBridgeZ, x = PX(z), L = 11, by = Math.min(HV(x - L / 2 + 0.4, z), HV(x + L / 2 - 0.4, z)) - 0.12;
    builds.push(BD.place(BD.stoneBridgeGeometry({ length: L, seed: 25 }), x, by, z, 0));
    decks.push({ x, z, len: L, halfW: 1.0, y: u => by + BD.stoneBridgeDeck(u, { length: L }) });
    for (let u = -L / 2; u <= L / 2; u += 1) for (const dz of [-0.8, 0.8]) bare.push([x + u, z + dz, 1.3]);
    castBall(x, z, 0.3, 4.2, 0.7);
  }
  {                                                                        // a plank bridge on the upper terrace
    const z = VILLAGE.woodBridgeZ, x = PX(z), L = 2 * PW + 5.5, by = (HV(x - L / 2, z) + HV(x + L / 2, z)) / 2 - 0.15;
    const b = T.createBridge({ length: L, seed: seed + 5 });
    b.position.set(x, by, z);
    group.add(b);
    decks.push({ x, z, len: L, halfW: 0.95, y: u => by + 0.41 + 0.7 * (1 - Math.pow(2 * u / L, 2)) });
    for (let u = -L / 2; u <= L / 2; u += 1) bare.push([x + u, z, 1.5]);
    castBall(x, z, 0.4, 3.6, 0.65);
  }
  {                                                                        // the pasture: a fence with a gate toward the great tree
    const g = BD.fenceGeometry({ points: VILLAGE.pasture, heightAt: HV, gap: [3, 3], seed: 26 });
    for (const c of g.userData.circles) colliders.push(c);
    builds.push(g);
  }
  for (const [kind, x, z, yaw] of VILLAGE.props) {                         // the small things
    const g = BD.propGeometry(kind, { seed: builds.length + 31 }), r = g.userData.solid;
    builds.push(BD.place(g, x, HV(x, z) - 0.03, z, yaw));
    if (r > 0.3) { colliders.push([x, z, r * 0.8]); press.push([x, z, r * 1.5]); castBall(x, z, 0.5, r * 0.9, 0.75); }
    else colliders.push([x, z, 0.22]);
  }
  {                                                                        // a rail along the brink where the meadow looks down the falls
    const brink = (x0, x1) => { const pts = []; for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 1.7))) pts.push([x, V.headZ(x) - 1.75]); return pts; };
    for (const [x0, x1] of [[0.6, 14.2], [-15.3, -10.6], [-26.3, -22.9]]) {
      const g = BD.fenceGeometry({ points: brink(x0, x1), heightAt: HV, closed: false, spacing: 1.7, seed: 27 + Math.round(x0) });
      for (const c of g.userData.circles) colliders.push(c);
      builds.push(g);
    }
  }
  const village = new THREE.Mesh(mergeGeometries(builds), propMaterial());
  builds.forEach(g => g.dispose());
  village.name = 'village';
  village.userData.dispose = () => village.geometry.dispose();
  group.add(village);

  // ------------------------------------------------------------------ rocks
  await onStep('วางหินริมน้ำ');
  const rocks = new THREE.Group();
  rocks.name = 'rocks';
  let rs = seed * 31;
  const rock = (type, x, z, scale = 1, sink = 0, solid = null) => {
    const m = N.createRock({ type, seed: ++rs });
    m.position.set(x, HV(x, z) - sink, z); m.rotation.y = rng() * 6.28; m.scale.setScalar(scale);
    rocks.add(m);
    const r = solid ?? ({ boulder: 1.0, slab: 1.3, standing: 0.5, crag: 1.5, stones: 0.8, river: 0.7, pebbles: 0 }[type] * scale);
    if (r > 0) { colliders.push([x, z, r]); press.push([x, z, r * 1.6]); shade.push([x, z, r * 2.0, 0.3]); castBall(x, z, r * 0.5, r * 0.95, 0.85); }
    placed.push([x, z, Math.max(r, 0.6)]);
  };
  for (let z = Z_HEAD + 6; z < B.z1 - 4; z += R(5, 9)) {                    // water-worn stones along both banks
    for (const s of [-1, 1]) {
      if (rng() < 0.35) continue;
      const x = rx(z) + s * (rw(z) + R(-0.4, 1.4)), sc = R(0.7, 1.35);
      if (clear(x, z, 0.7 * sc + 0.5)) rock('river', x, z, sc, 0.12);
      if (rng() < 0.5) rock('pebbles', rx(z) + s * (rw(z) + R(1.5, 3)), z + R(-2, 2), R(0.9, 1.3), 0, 0);
    }
  }
  for (const [dx, dz, sc] of [[-7.5, 5, 1.7], [7, 4.5, 1.5], [-9.5, 9, 1.1], [9.5, 8.5, 1.2]]) {      // boulders flanking the plunge pool
    const x = fall.x + dx, z = fall.z + dz;
    if (clear(x, z, sc)) rock('boulder', x, z, sc, 0.3);
  }
  for (let i = 0; i < 60; i++) {                                           // scree and boulders at the cliff feet
    const z = R(Z_HEAD + 4, B.z1 - 5), s = rng() < 0.5 ? -1 : 1, x0 = rx(z) + s * 12;
    const x = rx(z) + s * (V.cliffLine(x0, z) - R(1.6, 3.2)), sc = R(0.9, 1.6);
    if (onFloor(x, z, 0.3) && clear(x, z, 1.4 * sc)) rock(rng() < 0.45 ? 'boulder' : rng() < 0.6 ? 'stones' : 'crag', x, z, sc, 0.2);
  }
  // rocks in the village: crags and boulders at the foot of each riser, beside the cascades, round the keep's knoll and on the
  // brink by the falls. Many small rocks, so they are baked into one mesh for each kind of stone instead of one mesh apiece.
  const vrocks = [];
  const vrock = (type, x, z, scale, sink = 0.25) => {
    if (wayDist(x, z) < 2.6 + scale * 0.6 || inStream(x, z) || !clear(x, z, scale)) return;
    const m = N.createRock({ type, seed: ++rs });
    m.position.set(x, HV(x, z) - sink * scale, z); m.rotation.y = rng() * 6.28; m.scale.setScalar(scale);
    m.updateMatrix();
    vrocks.push(m);
    const r = ({ boulder: 1.0, slab: 1.3, standing: 0.5, crag: 1.5, stones: 0.8 }[type] || 0.8) * scale;
    colliders.push([x, z, r * 0.85]); press.push([x, z, r * 1.6]); shade.push([x, z, r * 2.0, 0.3]); castBall(x, z, r * 0.5, r * 0.95, 0.85);
    placed.push([x, z, r]);
  };
  for (const st of VILLAGE.steps) {
    for (let x = -42; x <= 41; x += R(2.4, 4.4)) {                         // along the foot of the riser
      if (Math.abs(x - PX(st.z)) < 4.6) continue;
      let zf = null;
      for (let z = st.z + 4.5; z > st.z - 4.5; z -= 0.25) if (HV(x, z - 0.7) - HV(x, z) > 0.8) { zf = z; break; }
      if (zf === null) continue;
      const k = rng();
      vrock(k < 0.5 ? 'crag' : k < 0.8 ? 'boulder' : 'stones', x, zf + R(0.1, 0.9), R(0.8, 1.6));
    }
    for (const s of [-1, 1]) {                                             // boulders flanking the cascade, stones down its banks
      vrock('boulder', PX(st.z) + s * 4.3, st.z + 0.6, R(1.2, 1.6), 0.3);
      vrock('stones', PX(st.z + 3) + s * 4.1, st.z + 3.4, R(0.9, 1.2));
      vrock('crag', PX(st.z) + s * 4.6, st.z - 2.6, R(1.0, 1.4));
    }
  }
  for (let a = 0.3; a < 6.28; a += R(0.5, 0.85)) {                         // round the knoll
    const k = VILLAGE.knoll, d = k.r * R(0.6, 0.8);
    vrock(rng() < 0.6 ? 'crag' : 'boulder', k.x + Math.cos(a) * d, k.z + Math.sin(a) * d, R(0.9, 1.5));
  }
  for (const s of [-1, 1]) vrock('boulder', fall.x + s * 5.6, V.headZ(fall.x + s * 5.6) - 2.6, R(1.2, 1.5), 0.3);      // on the brink, either side of the falls
  for (let i = 0; i < 40; i++) {                                           // a few stones lying about the terraces
    const x = R(-41, 40), z = R(-82, -50);
    if (!onPlateau(x, z) || deckAt(x, z)) continue;
    const k = rng();
    vrock(k < 0.4 ? 'stones' : k < 0.7 ? 'slab' : k < 0.9 ? 'boulder' : 'standing', x, z, R(0.6, 1.1), 0.2);
  }
  {
    const byMat = new Map();
    for (const m of vrocks) {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      g.applyMatrix4(m.matrix);
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      byMat.get(m.material).push(g);
      m.geometry.dispose();
    }
    for (const [mat, list] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      list.forEach(g => g.dispose());
      mesh.name = 'villageRocks';
      mesh.userData.dispose = () => mesh.geometry.dispose();
      group.add(mesh);
    }
  }

  // ------------------------------------------------------------------ ground colour map: where grass grows
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    const h = Hf(x, z), low = lower(x, z);
    const sand = low ? 1 - ss(0.35, 0.8, h - WL) : 1 - ss(-0.2, 0.25, h - V.plateauWaterAt(z));
    const earth = Math.max(ss(0.14, 0.24, slopeF(x, z)), 1 - ss(0.55, 1.3, CL.at(x, z).d), 0.9 * (1 - ss(0.6, 1.5, wayDist(x, z))));      // cliffs and steep ledges: rock; the cliff path and the village's ways: trodden earth
    return [earth, sand, 0];
  };
  const colors = { ...G.GROUND_COLORS, deep: '#7a9b3c', mid: '#86a640', sunny: '#a5c04b', shade: '#6d8d38', lawn: '#93b145' };
  const map = G.createGroundMap({ radius: FR, center: [CX, CZ], size: 768, seed, heightAt: Hf, dirt: 0, shade, cast: sunShadows(new THREE.Vector3(...sun)), bare, press, paint, colors });
  // the bare ground (sand, banks, cliff feet) is drawn by the terrain's own shader: it reads the same shadow picture
  {
    const tm = terrain.material, key = 'col = mix(col, uHaze, vHaze);';
    if (tm && tm.isShaderMaterial && tm.fragmentShader.includes(key)) {
      Object.assign(tm.uniforms, { uCast: { value: map.cast }, uCastRect: { value: map.rect }, uCastTint: { value: new THREE.Vector3(...map.castTint) }, uCastK: { value: 1 } });
      tm.fragmentShader = 'uniform sampler2D uCast;\nuniform vec3 uCastRect;\nuniform vec3 uCastTint;\nuniform float uCastK;\n' + tm.fragmentShader.replace(key, 'col *= mix(vec3(1.0), uCastTint, texture2D(uCast, (vWP.xz - uCastRect.xy) * uCastRect.z + 0.5).r * uCastK);\n        ' + key);
      tm.needsUpdate = true;
    }
  }
  const fade = { far, fadeA: FR * 0.9, fadeB: FR * 1.2 };

  // ------------------------------------------------------------------ water: the lower river, from under the falls to the valley mouth
  await onStep('วาดริ้วฟองน้ำ');
  const foamTexture = await W.loadFoamTexture();
  await onStep('เติมน้ำ');
  const stream = [];
  for (let z = fall.z - 0.6; z <= B.z1; z += 0.5) stream.push([rx(z), z, WL, rw(z), 1.3]);
  const animeCells = createAnimeCells();
  const droplets = createWaterDroplets({ time: N._internal.shared.uTime });
  droplets.points.userData.dispose = droplets.dispose;
  group.add(droplets.points);
  let water, sim, optics, upperWater, waterfall;
  const cascades = [];                                                     // the small falls between the terraces
  // a ribbon of water along a list of [x, z, level, half width] rows, carrying the flow coordinates the water shader needs
  const flowRibbon = (rows, across, extra) => {
    const pos = [], flow = [], dir = [], idx = [];
    let F = 0;
    for (let k = 0; k < rows.length; k++) {
      const s = rows[k], a = rows[Math.max(0, k - 1)], b = rows[Math.min(rows.length - 1, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const half = s[3] + extra;
      const streaminess = 1 - ss(3.6, 6.2, s[3]);            // 1 in the river, 0 over the plunge pool
      if (k > 0) F += Math.hypot(s[0] - a[0], s[1] - a[1]) * W.FLOW.pond / lerp(W.FLOW.pond, W.FLOW.stream, streaminess);
      for (let i = 0; i <= across; i++) {
        const u = -1 + 2 * i / across, x = s[0] - tz * u * half, z = s[1] + tx * u * half;
        pos.push(x, s[2], z); flow.push(F, u * half, streaminess); dir.push(tx, tz);
      }
    }
    const row = across + 1;
    for (let k = 0; k < rows.length - 1; k++) for (let i = 0; i < across; i++) {
      const a = k * row + i, b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setIndex(idx);
    return g;
  };
  {
    const ACROSS = 40, pos = [], flow = [], dir = [], idx = [];
    let F = 0;
    for (let k = 0; k < stream.length; k++) {
      const s = stream[k], a = stream[Math.max(0, k - 1)], b = stream[Math.min(stream.length - 1, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const half = s[3] + 2.4;
      const streaminess = 1 - ss(3.6, 6.2, s[3]);            // 1 in the river, 0 over the plunge pool
      if (k > 0) F += Math.hypot(s[0] - a[0], s[1] - a[1]) * W.FLOW.pond / lerp(W.FLOW.pond, W.FLOW.stream, streaminess);
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
    // the wave simulation is a 48 m square of water that travels with the player
    sim = W.createWaterSim({ rect: [spawn.x - 24, spawn.z - 24, 48], size: 512, field, foamTexture, level: WL, follow: true });
    optics = W.createWaterOptics({ level: WL });
    water = new THREE.Mesh(g, W.waterMaterial({ field, animeCells, sim, optics, foamTexture, far, fadeA: FR * 0.9, fadeB: FR * 1.2 }));
    water.name = 'clearWater';
    water.renderOrder = 1;
    water.userData = { kind: 'water', dispose() { g.dispose(); water.material.dispose(); sim.dispose(); optics.dispose(); } };
    group.add(water);
    // the river up on the plateau, running to the lip: same clear water (no wave simulation, no mirror up there)
    // It comes down the terraces in steps: one level ribbon for each terrace, and a small waterfall at each riser.
    const upMat = W.waterMaterial({ field, animeCells, foamTexture, far, fadeA: FR * 0.9, fadeB: FR * 1.2 });
    const cuts = [B.z0, ...V.steps.map(st => st.z).sort((a, b) => a - b), fall.z - 1.25];      // from the back of the map to the lip
    upperWater = new THREE.Group();
    upperWater.name = 'clearWaterUpper';
    for (let i = 0; i < cuts.length - 1; i++) {
      const top = i > 0, last = i === cuts.length - 2, level = V.plateauWaterAt((cuts[i] + cuts[i + 1]) / 2), upRows = [];
      // each ribbon starts under the cascade that feeds it and stops at the brink of the next one
      for (let z = cuts[i] - (top ? 0.3 : 0); z <= cuts[i + 1] - (last ? 0 : 0.85); z += 0.6) upRows.push([PX(z), z, level, 2.3]);
      const ug = flowRibbon(upRows, 14, 1.6), m = new THREE.Mesh(ug, upMat);
      m.renderOrder = 1;
      m.userData = { kind: 'water', dispose() { ug.dispose(); } };
      upperWater.add(m);
    }
    upperWater.userData = { kind: 'water', dispose() { upMat.dispose(); } };
    group.add(upperWater);
    for (const st of V.steps) {
      const c = createWaterfall({ x: PX(st.z), z: st.z - 0.95, top: V.plateauWaterAt(st.z - 1), bottom: V.plateauWaterAt(st.z + 1) - 0.2, width: 3.9, forward: 1.5, scale: 0.4, foamTexture, cells: animeCells });
      c.group.userData = { kind: 'waterfall', dispose: c.dispose };
      group.add(c.group);
      cascades.push(c);
    }
    // the waterfall, in the same palette
    waterfall = createWaterfall({ x: fall.x, z: fall.z - 1.25, top: fall.top, bottom: WL - 0.25, width: 4.6, optics, foamTexture, cells: animeCells, surfaceChurn: W.WATER_CHURN });
    waterfall.group.userData = { kind: 'waterfall', dispose: waterfall.dispose };
    group.add(waterfall.group);
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
      if (drop > 0 && sim.inside(x, z)) droplets.emit(x, WL, z, strength / 2.4 * drop, Math.round(14 * Math.min(1.5, drop)));
    } else {
      // a footstep: one clear ring of waves, and a puff of foam into her wake where the foot came down (the wake itself is laid
      // down by WATER_WAKE.track in follow); only a faint wisp of simulated foam, so the lace of the wake stays readable
      const st = mode === 'step';
      if (st) W.WATER_WAKE.add(x, z, Math.min(1.3, 0.9 * strength));
      sim.impulse(x, z, radius, (st ? -0.042 : -0.03) * strength * k, -Math.min(st ? 0.15 : 0.55, (st ? 0.18 : 0.75) * strength) * foam);
      if (mode === 'step' && drop > 0 && sim.inside(x, z)) droplets.emit(x, WL, z, 0.16 * drop * strength, strength > 1.2 ? 3 : 2);
    }
  };

  // ------------------------------------------------------------------ forest batches
  await onStep('แตกใบ');
  const SECT = 4, sectors = Array.from({ length: SECT }, () => []);
  for (const p of plants) sectors[Math.min(SECT - 1, Math.floor((p.z - B.z0) / (B.z1 - B.z0) * SECT))].push(p);
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

  // ------------------------------------------------------------------ flowers on the valley floor
  await onStep('โปรยดอกไม้');
  const PALS = [['#f4a6bc', '#f6f2e6'], ['#f7d84a', '#f6f2e6'], ['#b9a3e8', '#93b8ee'], ['#f6f2e6', '#f7d84a'], ['#93b8ee', '#f6f2e6']];
  let fs = seed * 53, fi = 0;
  for (let i = 0; i < 70 && fi < 26; i++) {
    const z = R(Z_HEAD + 8, B.z1 - 6), x = rx(z) + (rng() < 0.5 ? -1 : 1) * R(rw(z) + 5, 17), rad = R(1.2, 2.8);
    if (!onFloor(x, z, rad + 1) || map.grassAt(x, z) < 0.5 || !clear(x, z, rad)) continue;
    group.add(N.createFlowers({ count: Math.round(R(40, 100)), radius: rad, seed: ++fs, heightAt: HV, center: [x, z], colors: PALS[fi++ % PALS.length] }));
  }
  for (const [x, z, rad] of VILLAGE.flowers) group.add(N.createFlowers({ count: Math.round(45 * rad), radius: rad, seed: ++fs, heightAt: HV, center: [x, z], colors: PALS[fi++ % PALS.length] }));      // flower beds in the village

  // ------------------------------------------------------------------ fluffy grass that follows the player
  await onStep('ปลูกหญ้า');
  const grass = G.createFollowGrass({ map, field, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade });
  group.add(grass);

  // ------------------------------------------------------------------ deer grazing across the river from the spawn
  const animals = [];
  if (deer) {
    try {
      const asset = await A.loadAnimal(deer, { height: 1.9 });
      for (const [z, off, rot, s] of [[8, 9, 2.2, 1], [13, 11.5, 4.0, 0.92], [4, 12, 0.7, 0.86]]) {
        const x = rx(z) - side * (rw(z) + off);
        if (!onFloor(x, z, 1) || !clear(x, z, 1)) continue;
        const d = A.createAnimal(asset, { action: 'idle' });
        d.object.position.set(x, HV(x, z), z); d.object.rotation.y = rot; d.object.scale.setScalar(s);
        group.add(d.object); animals.push(d); colliders.push([x, z, 0.8]);
      }
    } catch (e) { console.warn('deer', e); }
  }

  terrain.layers.enable(W.UNDERWATER);
  rocks.traverse(o => o.layers.enable(W.UNDERWATER));
  const hidden = [water, grass, droplets.points];
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), camWorld = new THREE.Vector3();
  let frameNo = 0, nextSplash = 0, nextHeave = 0, lastRenderer = null;
  const waterSpheres = [];
  for (let k = 0; k < stream.length; k += 20) { const sp = stream[k]; waterSpheres.push(new THREE.Sphere(new THREE.Vector3(sp[0], sp[2], sp[1]), sp[3] + 7)); }
  waterSpheres.push(new THREE.Sphere(new THREE.Vector3(fall.x, (fall.top + WL) / 2, fall.z), (fall.top - WL) / 2 + 3));      // the falls see through too
  // the walker's own shadow: a soft dark patch thrown along the sun's direction (the baked ones above cannot move)
  const blob = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(36,52,80,0.55)'); grd.addColorStop(0.55, 'rgba(36,52,80,0.4)'); grd.addColorStop(1, 'rgba(36,52,80,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const walkerShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false }));
  const castUniforms = terrain.material.uniforms;
  let castSun = new THREE.Vector3(...sun), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false;
  // the sun the shadows on the ground are drawn for right now (it trails the real sun by a few seconds), and how strongly it casts
  const cast = { dir: castSun.clone(), k: 1 };
  let realShadow = false;                    // true: the walker's real outline is drawn on the ground (character-shadow.js)
  let realOnGrass = false;                   // true: and on the grass blades too, so the soft patch is not needed anywhere
  const aimWalkerShadow = () => { cast.dir.copy(castSun); walkerShadow.rotation.y = Math.atan2(-SU[1], SU[0]); walkerShadow.scale.set(1.35 + 0.55 / LY, 1, 0.8); };
  walkerShadow.name = 'walkerShadow'; walkerShadow.renderOrder = 3; walkerShadow.visible = false;
  aimWalkerShadow();                                                                       // long side along the shadow direction
  group.add(walkerShadow);
  group.userData = { kind: 'valleyLevel', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); map.dispose(); field.texture.dispose(); } };
  console.info('[valley] trees', plants.filter(p => p.kind === 'tree').length, 'rocks', rocks.children.length, 'leaf cards', cards);
  return {
    group, map, field, grass, terrain, heightAt: H, waterDepthAt, colliders, crowns, cameraTrunks, spawn, radius: 1e4, confine, walkable,
    // places worth a look: the foot of the cliff path, and the meadow by the windmill (x, z, the way to face)
    views: {
      climb: { x: CL.bottom[0] - 2.5, z: CL.bottom[1] + 2, yaw: Math.PI }, mill: { x: MILL[0] + 6, z: MILL[1] + 9, yaw: Math.atan2(-6, -9) },
      village: { x: 4, z: -55.5, yaw: -Math.PI / 2 }, tree: { x: 11, z: -68.5, yaw: Math.PI }, keep: { x: -15, z: -75.5, yaw: -Math.PI / 2 },
    },
    stats: { trees: plants.filter(p => p.kind === 'tree').length, bushes: plants.filter(p => p.kind === 'bush').length, cards, forestDraws: draws, rocks: rocks.children.length },
    ripple, sim, optics, waterLevelAt: (x, z) => WL,
    addUnderwater(obj) { obj.traverse(o => o.layers.enable(W.UNDERWATER)); },
    update(renderer, dt, scene = null, camera = null) {
      lastRenderer = renderer;
      if (mill) mill.update(dt);
      if (wheel) wheel.rotation.x -= dt * 0.9;                             // the stream turns the wheel: its lowest paddles go with the water
      sim.step(renderer, dt);
      droplets.update(renderer);
      // the sun moved: new shadows are drawn in the background a few milliseconds a frame, and swapped in when whole
      const nowT = N._internal.shared.uTime.value;
      if (castBusy) {
        if (map.stepCast(2.5)) { castBusy = false; lastCast = nowT; if (castUniforms.uCastK) castUniforms.uCastK.value = castK; aimWalkerShadow(); }
      } else if (nowT - lastCast > 4 && (castSun.angleTo(wantSun) > 0.075 || Math.abs(castK - wantK) > 0.12)) {
        castSun.copy(wantSun); castK = wantK; castBusy = true;
        map.beginCast(sunShadows(castSun), castK);
      }
      if (!scene || !camera) return;
      frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      camWorld.setFromMatrixPosition(camera.matrixWorld);
      let near = Infinity;
      for (const sp of waterSpheres) if (frustum.intersectsSphere(sp)) near = Math.min(near, camWorld.distanceTo(sp.center) - sp.radius);
      frameNo++;
      const q = optics.quality;
      const doThrough = near < 42, doMirror = q > 0 && near < 65 && frameNo % (q === 2 ? 2 : 4) === 0;
      if (doThrough || doMirror) optics.render(renderer, scene, camera, hidden, doThrough, doMirror);
    },
    // where the sun is (a direction) and how strongly it casts (0 at night); the shadows follow in the background
    setSun(dir, k = 1) { wantSun.copy(dir); wantK = k; cast.k = Math.min(1, k * 1.2); },
    get sunCast() { return cast; },
    useRealShadow(on, onGrass = false) { realShadow = !!on; realOnGrass = realShadow && !!onGrass; },
    tapWater(origin, dir) {
      for (let t = 1; t < 70; t += 0.25) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
        const ground = HV(x, z), depth = waterDepthAt(x, z);
        if (depth > 0.03 && y <= ground + depth) { ripple(x, z, 2.4, 0.36); return true; }
        if (y <= ground) return false;
      }
      return false;
    },
    follow(pos, lookDir) {
      grass.userData.follow(pos, lookDir);
      W.WATER_WAKE.track(pos.x, pos.z, waterDepthAt(pos.x, pos.z));
      sim.focus(pos.x, pos.z);
      const wy = HV(pos.x, pos.z), dry = waterDepthAt(pos.x, pos.z) < 0.05;
      // with the real shadow on the ground only, the soft patch is a stand-in over grass (the blades cover the ground there);
      // with the real shadow on the blades as well, it is not needed at all
      const run = Math.min(SLEN, 2.5) * 0.8, px = pos.x + SU[0] * run, pz = pos.z + SU[1] * run;
      const lawn = realOnGrass ? 0 : realShadow ? Math.min(1, Math.max(0, (map.grassAt(px, pz) - 0.1) / 0.4)) : 1;
      walkerShadow.material.opacity = cast.k * lawn;
      walkerShadow.visible = dry && cast.k * lawn > 0.02;
      if (walkerShadow.visible) walkerShadow.position.set(px, wy + 0.3, pz);
      waterfall.update(lastRenderer);
      for (const c of cascades) c.update(lastRenderer);
      // the falls keep the plunge pool restless: small pokes all along where the sheet lands, and every so often a heave,
      // where the water wells up for a moment and a broad wave rolls out across the pool (FALL_TUNE.fallWave*)
      const now = N._internal.shared.uTime.value, heave = FALL_TUNE.fallWaves.value;
      if (heave > 0 && now > nextSplash) {
        ripple(fall.x + (Math.random() - 0.5) * 3.2, fall.z + 1.7 + Math.random() * 0.8, 1.6 * Math.min(1, heave), 0.4, 'plain');
        nextSplash = now + 0.16;
      }
      if (heave > 0 && now > nextHeave) {
        const r = 1.05 * FALL_TUNE.fallWaveSize.value, off = (Math.random() - 0.5) * 0.8;
        // the water wells up where it lands, with a shallow trough round it holding the same amount of water: the heave sends
        // waves out without piling the pool up into a standing mound at the foot of the falls
        const k = W.WATER_TUNE.ripple.value * 0.1 * heave;
        for (let i = -1; i <= 1; i++) {
          const hx = fall.x + i * 1.35 + off, hz = fall.z + 1.9 + Math.random() * 0.3;
          sim.impulse(hx, hz, r, k);
          sim.impulse(hx, hz, r * 1.6, -k / 2.56);
        }
        nextHeave = now + (0.6 + Math.random() * 0.5) / Math.max(0.1, FALL_TUNE.fallWaveRate.value);
      }
    },
  };
}


