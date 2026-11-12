// valley-level.js
// The waterfall valley as a walkable map: a river runs down a cliff-walled valley from a waterfall at its head.
// The land itself (cliffs, sand banks, waterfall, upper river, bridge) comes from stylized-terrain.js; this file
// dresses it and plugs in the game's systems: the clear water, the fluffy grass, the forest batches.
// A path cut into the east cliff's shoulder climbs from near the bridge to the plateau beside the falls. Up there the land
// is built up in terraces round the upper river, which comes down them in cascades: a windmill on the meadow by the lip, a
// stone bridge, a few houses round a well, a water mill, and on the terrace above a great tree, more houses, a pasture and
// the adventurers' guild on its own rock (stylized-guild.js: a hall she can walk into, a duelling ring, a training yard).
// Down in the abyss are three more places, reached by warp stones (abyss-depths.js): a shelf over a sea of cloud, a gorge of
// falls in the mist, a meadow under floating rocks. They are part of this same map (nothing loads), drawn only while she is there.
// The buildings are stand-ins built in code (stylized-buildings.js) until real models take their place.
// Down the valley the river runs out over the brink of the abyss (abyss-shape.js: where it is and how it bends the land;
// abyss-scene.js: its falls and clouds): it spreads out among rock islands and pours in in four falls, and three brooks drop
// in from the plateau round it. A second path cut into the east cliff climbs to the walk round the rim and its lookout.
//
//   const level = await buildValleyLevel({ far, deer, onStep });      // same result object as the other maps
//   level.confine(p)   keeps a walker where she can walk: the valley floor, the cliff path, the meadow (the cliffs are walls)
//   level.warps        the warp stones [{ key, name, x, z, yaw, stand }]; level.zone: the layer of the abyss she is in (-1: up in the valley)
//   level.guild        the guild (level.guild.storey: -1 out of doors, 0 hall, 1 gallery, 2 attic; level.guild.spots: places for people later)

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
import { loadLegacyWoodProps } from './legacy-wood-props.js';
import * as BD from './stylized-buildings.js';
import { createCliffSet } from './stylized-cliffs.js';
import { valleyCliffPieces, valleyCliffMaterial } from './valley-cliffs.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VALLEY_EDITS } from './valley-edits.js';
import { ABYSS, AB } from './abyss-shape.js';
import { createAbyssFalls, createAbyssClouds, _abyss } from './abyss-scene.js';
import * as DP from './abyss-depths.js';
import { createGuild, GUILD_SITE } from './stylized-guild.js';

// ---- edits made by hand in the scene editor (scene-editor.js). They are laid over what this file generates, and never change
// what it generates: a plant taken out still takes its turn in the dice and still keeps its neighbours at their distance, so
// everything else stays exactly where it was. A thing is known by what it is and where it was first put (to the decimetre).
export const VALLEY_EDIT_KEY = 'liora.valley.edits.v1';
function loadEdits() {
  let e = null;
  try {
    if (new URLSearchParams(location.search).get('edits') === 'off') return { paths: null, yards: null, dabs: [], removed: new Set(), moved: new Map(), added: [] };
    const saved = localStorage.getItem(VALLEY_EDIT_KEY);
    if (saved) e = JSON.parse(saved);
  } catch (err) { e = null; }
  e = e || VALLEY_EDITS || {};
  return {
    paths: Array.isArray(e.paths) ? e.paths : null, yards: Array.isArray(e.yards) ? e.yards : null, dabs: Array.isArray(e.dabs) ? e.dabs : [],
    removed: new Set(e.removed || []), moved: new Map(Object.entries(e.moved || {})), added: Array.isArray(e.added) ? e.added : [],
  };
}

const { mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---- the village above the falls: where everything stands (metres; z grows down the valley, so "north" is -z, upstream)
const VILLAGE = {
  steps: [{ z: -66, rise: 5.5 }, { z: -84, rise: 4.5 }],                  // the terraces: at each z the land and the river step up
  knoll: { x: -32, z: -76.5, r: 13.5, top: 5.5, h: 3.0 },                 // the knoll the guild stands on (its top levelled out wide: GUILD_SITE.pad)
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
  keep: { x: -33.5, z: -76.5, yaw: Math.PI / 2 },                          // where the keep stood before the guild (the plants still keep their distance from it)
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
  // trodden yards: round the well, under the great tree, before the keep's door (x, z, radius, paved with cobbles?)
  yards: [[-24.5, -59.8, 3.2, true], [8.5, -72.6, 3.8, false], [-27.6, -76.5, 2.2, true]],
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
  // the map runs on past the old valley mouth to take in the abyss (and a stretch of plateau beyond it)
  const V = T.createValley({ seed, far, path: false, bridge: true, skirt: true, climb: { side: 1 },      // the cliff path is on the +x side
    depth: 265, zCenter: 37.5, climbs: [ABYSS.climb], reshape: AB.reshape, widen: AB.widen, waterAt: AB.waterAt, trails: AB.trails,
    tiers: { steps: VILLAGE.steps, flat: villageLevel, mounds: [VILLAGE.knoll, ...VILLAGE.tors], rise: villageHills, ramps: VILLAGE.ramps, pads: [GUILD_SITE.pad] } });
  group.add(V.group);
  const terrain = V.group.children.find(o => o.name !== 'water' && o.isMesh);
  if (terrain.material.uniforms.uDeepOn) terrain.material.uniforms.uDeepOn.value = 1;      // the abyss's walls fade into mist and dark
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
  // The depths of the abyss (abyss-depths.js): three places far down it, reached by warp stones. They lie out past the
  // valley's edges, inside the square its height field, ground picture, grass and water already cover, so all of those
  // work down there as they do up here. Only the one she is in is drawn (and the valley is put away meanwhile).
  const DPT = DP.createDepths({ WL, seed });
  const HVD = (x, z) => DPT.covers(x, z) ? DPT.heightAt(x, z) : HV(x, z);    // the land, down there too
  const deepMat = T._terrain.terrainMaterial(far, [1e5, 1e5], 0);          // the same paint as the valley's land
  const HV = V.heightAt;
  // The guild (stylized-guild.js) stands on ground levelled for it where the keep's knoll was. Everything that grows or lies
  // about the valley is still thrown with the same dice as before it was built, on the land as it was (HV0, Hf0,
  // onPlateau0 below, V.legacyKindAt), and whatever lands on the guild's ground is simply left out: so not a tree moves anywhere else.
  const HV0 = V.legacyHeightAt, PAD = V.pads[0];
  const guild = createGuild({ heightAt: HV, padY: PAD.y });
  const onPad = (x, z) => Math.abs(x - PAD.x) < PAD.hx && Math.abs(z - PAD.z) < PAD.hz;
  const nearPad = (x, z) => Math.abs(x - PAD.x) < PAD.hx + PAD.skirt + 2 && Math.abs(z - PAD.z) < PAD.hz + PAD.skirt + 2;
  const lower = (x, z) => V.waterLevelAt(x, z) === WL;                   // not up on the plateau behind the falls
  const MILL_YAW = -1.54;                                                  // turns the windmill so its sails face down the valley, toward the falls
  // bridges up on the plateau (both lie along x): where each is, and the height of its deck u metres from its middle
  const decks = [];
  // (a deck with a yaw runs along (cos yaw, -sin yaw): the way a bridge built along x points once it is turned by that yaw)
  const deckU = (d, x, z) => { const c = Math.cos(d.yaw || 0), s = Math.sin(d.yaw || 0), dx = x - d.x, dz = z - d.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const deckAt = (x, z) => { for (const d of decks) { const [u, v] = deckU(d, x, z); if (Math.abs(u) < d.len / 2 && Math.abs(v) < (d.halfWAt ? d.halfWAt(u) : d.halfW)) return d; } return null; };
  const H = (x, z) => { const d = deckAt(x, z); return d ? d.y(deckU(d, x, z)[0]) : V.surfaceAt(x, z); };      // ground, or a bridge deck
  const waterDepthAt = (x, z) => DPT.covers(x, z) ? (DPT.wetAt(x, z) ? Math.max(0, WL - DPT.heightAt(x, z)) : 0)
    : (!lower(x, z) || H(x, z) > HV(x, z) + 0.01 || AB.inPit(x, z, 0.2)) ? 0 : Math.max(0, WL - HV(x, z));
  await onStep('วัดความสูงพื้น');
  // half-metre cells, on the same grid as before the map grew, so every height read off it in the old valley is as it was
  const field = G.createHeightField({ radius: FR, center: [CX, CZ], cells: Math.round(FR * 4), heightFn: HVD });
  const Hf = field.heightAt;                                             // cheap copy of the height, for painting
  const Hf0 = (x, z) => {                                                  // the same copy as it was before the guild's ground was levelled
    if (!nearPad(x, z)) return Hf(x, z);
    const { cells, step, radius, center: [cx, cz] } = field;
    const fx = Math.min(cells - 1e-4, Math.max(0, (x - cx + radius) / step)), fz = Math.min(cells - 1e-4, Math.max(0, (z - cz + radius) / step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, at = (a, b) => Math.fround(HV0(cx - radius + a * step, cz - radius + b * step));
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
  const slopeF = (x, z) => { const e = 0.6, hx = (Hf(x + e, z) - Hf(x - e, z)) / (2 * e), hz = (Hf(x, z + e) - Hf(x, z - e)) / (2 * e); return 1 - 1 / Math.sqrt(1 + hx * hx + hz * hz); };

  // where a walker may be: the valley floor between the two cliff feet, below the head wall, short of the map's end;
  // the path cut into the cliff; and up on the plateau, the meadow where the path comes out and the village terraces
  // (even ground only: the risers between terraces are walls, the ramps and the bridges are the ways across)
  const Z_HEAD = fall.z + 2.5, Z_END = ABYSS.z - 15;                     // the valley floor ends at the abyss (the brink is checked below)
  const CL = V.climb, CLS = [V.climb, ...V.climbs], PW = V.plateauRiverHalfWidth, PLW = V.levels.plateauWater, PX = V.plateauRiverX;
  const MILL = VILLAGE.mill;                                               // the windmill: back from the lip, east of the upper river
  const MEADOW_R = 13;                                                     // the meadow: this far either side of the line from the path's top to the mill
  const meadowDist = (x, z) => {                                           // metres from the meadow's middle line
    const [ax, az] = CL.top, dx = MILL[0] - ax, dz = MILL[1] - az;
    const t = Math.max(0, Math.min(1.25, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  };
  const inVillage = (x, z) => Math.abs(x) < 43 && z > -83.5 && z < V.headZ(x);
  const upTop = (x, z) => inVillage(x, z) || meadowDist(x, z) < MEADOW_R || onPad(x, z);
  const evenOn = Hf => (x, z) => {                                         // up on the plateau and not too steep to stand on
    if (Hf(x, z) < PLW + 0.5) return false;
    const e = 0.5, hx = (Hf(x + e, z) - Hf(x - e, z)) / (2 * e), hz = (Hf(x, z + e) - Hf(x, z - e)) / (2 * e);
    return hx * hx + hz * hz < 0.36;                                       // a grade of 0.6
  };
  const evenGround = evenOn(Hf), evenGround0 = evenOn(Hf0);
  const inStream = (x, z) => Math.abs(x - PX(z)) < PW + 0.9;
  const onRamp = (x, z) => { for (const r of V.ramps) if (r.at(x, z).d < r.half - 0.3) return true; return false; };
  const onPlateau = (x, z) => upTop(x, z) && (deckAt(x, z) ? true : !inStream(x, z) && (evenGround(x, z) || onRamp(x, z)));
  const onPlateau0 = (x, z) => (inVillage(x, z) || meadowDist(x, z) < MEADOW_R) && (deckAt(x, z) ? true : !inStream(x, z) && (evenGround0(x, z) || onRamp(x, z)));      // as it was (for the dice)
  const onPath = (x, z) => CLS.some(c => c.at(x, z).d < c.half - 0.15);
  // the floor stops short of the cliff foot under a raised stretch of the path, so stepping off the shelf never drops her down to it
  const underPath = (x, z) => CLS.some(cl => { const c = cl.at(x, z); return c.d < cl.half + 1.6 && c.y - HV(x, z) > 0.5; });
  // the valley floor: between the cliff feet, and short of the abyss's brink and off the rock islands at its edge
  const floorOK = (x, z) => z > Z_HEAD && z < Z_END && Math.abs(x - rx(z)) < V.cliffLine(x, z) - 1.0 && !AB.inPit(x, z, 1.4) && AB.islandAt(x, z) < 0.35;
  // the shelf's shoulders, where the ground is within half a metre of the path's height, belong to the path (no slivers beside it)
  const pathShoulder = (x, z) => CLS.some(cl => { const c = cl.at(x, z); return c.d < cl.half + 1.6 && Math.abs(c.y - HV(x, z)) <= 0.5; });
  // round the abyss: the walk along the rim (inside the rail, short of the forest), the lookout, the brooks' bridges
  const steepAt = (x, z) => { const e = 0.5, hx = (Hf(x + e, z) - Hf(x - e, z)) / (2 * e), hz = (Hf(x, z + e) - Hf(x, z - e)) / (2 * e); return hx * hx + hz * hz; };
  const onAbyssRim = (x, z) => AB.onSpur(x, z) || (AB.onRim(x, z) && Hf(x, z) > ABYSS.rimH - 2.5 && steepAt(x, z) < 0.36);
  const walkable = (x, z) => DPT.covers(x, z) ? DPT.walkable(x, z) : onPath(x, z) || pathShoulder(x, z) || (!upTop(x, z) && !!deckAt(x, z)) || ((floorOK(x, z) || onPlateau(x, z) || onAbyssRim(x, z)) && !underPath(x, z));
  const confine = p => {
    if (walkable(p.x, p.z)) return;
    if (DPT.covers(p.x, p.z)) {                                            // down in the depths: a step back onto ground she can stand on
      for (let r = 0.12; r <= 3.4; r += 0.16) {
        let best = null, bd = Infinity;
        for (let a = 0; a < 12; a++) {
          const q = { x: p.x + Math.cos(a * Math.PI / 6) * r, z: p.z + Math.sin(a * Math.PI / 6) * r };
          if (!walkable(q.x, q.z)) continue;
          let inside = 0; for (let b = 0; b < 6; b++) if (walkable(q.x + Math.cos(b * Math.PI / 3) * 0.3, q.z + Math.sin(b * Math.PI / 3) * 0.3)) inside++;
          if (-inside < bd) { bd = -inside; best = q; }
        }
        if (best) { p.x = best.x; p.z = best.z; return; }
      }
      const L = DPT.layers[DPT.layerAt(p.x, p.z)];                         // lost: back to the layer's warp stone
      p.x = L.warp[0] + 2.2; p.z = L.warp[1];
      return;
    }
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
    for (const cl of CLS) for (const o of [p, f]) {                        // from where she is, or from the cliff foot under the path:
      const c = cl.at(o.x, o.z);                                           // step back toward the path's line until on it
      if (c.d >= 4) continue;
      for (let k = 1; k <= 8; k++) {
        const e = 0.05 * k, q = { x: o.x, z: o.z };
        const gx = cl.at(o.x + e, o.z).d - cl.at(o.x - e, o.z).d, gz = cl.at(o.x, o.z + e).d - cl.at(o.x, o.z - e).d, gl = Math.hypot(gx, gz) || 1;
        const back = c.d - (cl.half - 0.2);
        q.x -= gx / gl * back; q.z -= gz / gl * back;
        if (onPath(q.x, q.z)) { cands.push(q); break; }
      }
    }
    let best = null, bd = Infinity;
    for (const q of cands) { if (!walkable(q.x, q.z)) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
    if (!best) best = f;
    p.x = best.x; p.z = best.z;
  };
  const onFloor = (x, z, pad = 0) => z > Z_HEAD + pad && z < Z_END && Math.abs(x - rx(z)) < V.cliffLine(x, z) - 1.0 - pad && !AB.inPit(x, z, 1.5 + pad) && AB.islandAt(x, z) < 0.2;
  const side = V.bridge ? Math.sign(V.bridge.ends[1][0] - V.bridge.x) || 1 : 1;
  const spawn = { x: rx(44) + side * 8, z: 44, yaw: Math.PI };            // at the valley mouth, looking up at the falls

  // ------------------------------------------------------------------ plants
  await onStep('ปลูกป่าบนผาและตีนผา');
  const placed = [], plants = [], colliders = [], crowns = [], shade = [], bare = [], press = [];
  // The dice are thrown over the valley as it was before the abyss was added (its old end, and the land as it lay then:
  // V.legacyKindAt, legacyHeightAt, legacyRiverHalfWidth), so every throw falls as it always did and nothing placed or
  // taken out by hand in the scene editor loses its place. What now lands somewhere it cannot be (in the widened river, on
  // the new path, in the pit) is simply not put down. The abyss's own trees and rocks come after, with dice of their own.
  const OLD_Z1 = 55, rw0 = V.legacyRiverHalfWidth;                         // (HV0, the land as it lay, is up by the guild's ground)
  const CL2 = V.climbs[0];
  const stillFine = (x, z, r = 0.6) => {                                  // not in the water, the pit, on the new path or a brook
    if (CL2.at(x, z).d < CL2.half + 1.0 + r) return false;
    if (AB.inPit(x, z, 2 + r) || AB.brookDist(x, z).d < 1.5 + r || AB.islandAt(x, z) > 0.2) return false;
    if (nearPad(x, z)) return true;                                        // the bank round the guild's ground: lower than it was, but still land (the guild clears its own)
    if (HV(x, z) < HV0(x, z) - 0.3 || (lower(x, z) && HV(x, z) < WL + 0.5 && HV0(x, z) >= WL + 0.5)) return false;
    return AB.rimDist(x, z) > 11 || HV(x, z) < 6;
  };
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
  // ---- hand edits: every plant, rock and flower bed is listed here as it is generated (for the editor to show), and placeOf says
  // where it really goes: where it was generated, where it was moved to by hand, or nowhere (taken out)
  const EDITS = loadEdits(), editItems = [];
  const editKey = (kind, x, z) => kind + ':' + Math.round(x * 10) + ':' + Math.round(z * 10);
  const placeOf = (kind, type, x, z, r) => {
    if (guild.cleared(x, z)) return null;                                  // the guild's ground: nothing grows or lies there
    const key = editKey(kind, x, z);
    editItems.push({ key, kind, type, x, z, r });
    if (EDITS.removed.has(key)) return null;
    const m = EDITS.moved.get(key);
    return m ? [m[0], m[1]] : [x, z];
  };
  const putShrub = (type, sd, x, z, rot, scale) => {
    if (!stillFine(x, z, 0.3)) return;
    plants.push({ kind: 'bush', type, seed: sd, x, y: HV(x, z), z, rotY: rot, scale });
    colliders.push([x, z, 0.75 * scale]); shade.push([x, z, 1.7 * scale, 0.45]); castBall(x, z, 0.55 * scale, 0.95 * scale, 0.8, 0.2);
  };
  const shrub = (x, z, scale = 1) => {
    if (HV0(x, z) < WL + 0.6) return;
    const type = rng() < 0.35 ? 'flowering' : 'round', sd = ++ps, rot = rng() * 6.28;
    placed.push([x, z, 1.0 * scale]);
    const at = placeOf('bush', type, x, z, 0.9 * scale);
    if (at) putShrub(type, sd, at[0], at[1], rot, scale);
  };
  const cameraTrunks = [];
  const putTree = (type, sd, x, z, rot, scale, detail) => {
    if (!stillFine(x, z, TRUNK[type] * scale)) return;
    const y = HV(x, z);
    plants.push({ kind: 'tree', type, seed: sd, detail, x, y, z, rotY: rot, scale });
    colliders.push([x, z, TRUNK[type] * scale + 0.22]);
    cameraTrunks.push([x, z, TRUNK[type] * scale + 0.12, y, y + CROWN_Y[type] * scale]);
    crowns.push([x, y + CROWN_Y[type] * scale, z, CROWN_R[type] * scale]);
    shade.push([x, z, CROWN[type] * scale * 1.05, 0.4]); bare.push([x, z, TRUNK[type] * scale * 1.5]);
    castBall(x, z, CROWN_Y[type] * scale, CROWN_R[type] * scale, 0.88, 0.3);
    castStick(x, z, CROWN_Y[type] * scale * 0.85, Math.max(0.22, TRUNK[type] * scale * 0.7));
  };
  const tree = (type, x, z, scale = 1, detail = 0.8, bush = false) => {
    const sd = ++ps, rot = rng() * 6.28;
    placed.push([x, z, CROWN[type] * scale * 0.42]);
    const at = placeOf('tree', type, x, z, CROWN_R[type] * scale);
    if (at) putTree(type, sd, at[0], at[1], rot, scale, detail);
    if (bush) { const a = rng() * 6.28, d = (TRUNK[type] + 1.1) * scale; shrub(x + Math.cos(a) * d, z + Math.sin(a) * d, R(0.75, 1.05)); }
  };
  placed.push([spawn.x, spawn.z, 5]);
  if (V.bridge) for (const e of V.bridge.ends) placed.push([e[0], e[1], 4.5]);
  for (const cl of CLS) for (let i = 0; i < cl.line.length; i += 3) placed.push([cl.line[i][0], cl.line[i][1], cl.half + 0.6]);     // the cliff paths stay clear
  placed.push([MILL[0], MILL[1], 9]);                                      // room round the windmill
  // room round everything in the village, and its ways kept clear
  for (const h of VILLAGE.houses) placed.push([h.x, h.z, 6.5]);
  placed.push([VILLAGE.keep.x, VILLAGE.keep.z, 8], [VILLAGE.well[0], VILLAGE.well[1], 4], [PX(VILLAGE.waterMillZ) - 5, VILLAGE.waterMillZ, 7]);
  placed.push([PX(VILLAGE.stoneBridgeZ), VILLAGE.stoneBridgeZ, 8], [PX(VILLAGE.woodBridgeZ), VILLAGE.woodBridgeZ, 8]);
  { const q = VILLAGE.pasture; placed.push([(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2, 9]); }
  const vsegs = [];                                                        // the village's ways, as segments
  for (const line of [...VILLAGE.paths, ...V.ramps.map(r => r.line)]) for (let i = 0; i < line.length - 1; i++) vsegs.push([line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]]);
  // the ways as they are drawn: the village's own, or the ones edited by hand. A way is { pts: [[x, z], ...], wide }: the long
  // ways between places are worn broad, the short spurs to a door narrow; the ramps are broadest. A yard is { x, z, r, paved }.
  const DEF_PATHS = VILLAGE.paths.map(pts => ({ pts, wide: pts.length >= 3 }));
  const DEF_YARDS = VILLAGE.yards.map(([x, z, r, paved]) => ({ x, z, r, paved: !!paved }));
  const WAYS_BOX = { x0: -46, x1: 46, z0: -92, z1: -40 };                    // the ground the ways are drawn on (and may be edited on)
  // metres to the nearest way, measured so that every way's edge is 0.7 away whatever its width (0 = well inside one)
  const makeWayDist = (paths, yards) => {
    const segs = [];
    for (const w of paths) for (let i = 0; i < w.pts.length - 1; i++) segs.push([w.pts[i][0], w.pts[i][1], w.pts[i + 1][0], w.pts[i + 1][1], w.wide ? 0.9 : 0.6]);
    for (const r of V.ramps) for (let i = 0; i < r.line.length - 1; i++) segs.push([r.line[i][0], r.line[i][1], r.line[i + 1][0], r.line[i + 1][1], 1.0]);
    return (x, z) => {
      if (z > WAYS_BOX.z1 || z < WAYS_BOX.z0 - 4 || Math.abs(x) > WAYS_BOX.x1) return 99;
      let best = 99;
      for (const [ax, az, bx, bz, half] of segs) {
        const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - half + 0.7);
      }
      for (const y of yards) best = Math.min(best, Math.hypot(x - y.x, z - y.z) - y.r + 0.6);
      return Math.max(0, best);
    };
  };
  // how paved a spot is: the yards marked as paved are laid with cobbles, thinning out toward their edge
  const makePaved = yards => (x, z) => {
    let g = 0;
    for (const y of yards) if (y.paved) g = Math.max(g, 1 - ss(y.r - 1.6, y.r + 0.3, Math.hypot(x - y.x, z - y.z)));
    return g;
  };
  const wayDist0 = makeWayDist(DEF_PATHS, DEF_YARDS);                        // as generated: what the rocks and trees keep clear of
  let wayDist = null;                                                        // as drawn: set below, once the picture of the ways is made
  // the picture of the ways that the ground is drawn from (stylized-terrain.js, WAYS): a quarter of a metre to the texel.
  // drawWays paints it again from any set of ways (the editor calls it while a way is being dragged about).
  const waysN = [368, 208], waysPx = new Uint8Array(waysN[0] * waysN[1] * 4), waysTex = new THREE.DataTexture(waysPx, waysN[0], waysN[1], THREE.RGBAFormat);
  waysTex.magFilter = waysTex.minFilter = THREE.LinearFilter;
  // A dab of the brush, [x, z, radius, what]: 0 = trodden earth, 1 = cobbles (laid on earth), 2 = grass (takes a way away).
  // It is stamped straight into the picture, over whatever is there, so painting shows at once and later dabs win.
  const stampDab = ([bx, bz, br, what]) => {
    const { x0, x1, z0, z1 } = WAYS_BOX, [wN, hN] = waysN, reach = br + 3.4;
    const i0 = Math.max(0, Math.floor((bx - reach - x0) / (x1 - x0) * wN)), i1 = Math.min(wN - 1, Math.ceil((bx + reach - x0) / (x1 - x0) * wN));
    const j0 = Math.max(0, Math.floor((bz - reach - z0) / (z1 - z0) * hN)), j1 = Math.min(hN - 1, Math.ceil((bz + reach - z0) / (z1 - z0) * hN));
    for (let jz = j0; jz <= j1; jz++) for (let ix = i0; ix <= i1; ix++) {
      const x = x0 + (ix + 0.5) / wN * (x1 - x0), z = z0 + (jz + 0.5) / hN * (z1 - z0), o = (jz * wN + ix) * 4, d = Math.hypot(x - bx, z - bz);
      if (what === 2) {
        waysPx[o] = Math.max(waysPx[o], Math.round(255 * 2.6 / 4 * (1 - ss(br - 0.5, br + 0.9, d))));
        waysPx[o + 1] = Math.min(waysPx[o + 1], Math.round(255 * ss(br - 0.5, br + 0.6, d)));
      } else {
        waysPx[o] = Math.min(waysPx[o], Math.round(255 * Math.min(1, Math.max(0, d - br + 0.7) / 4)));
        if (what === 1) waysPx[o + 1] = Math.max(waysPx[o + 1], Math.round(255 * (1 - ss(br - 0.9, br + 0.3, d))));
      }
    }
    waysTex.needsUpdate = true;
  };
  const drawWays = (paths, yards, dabs = []) => {
    const dist = makeWayDist(paths, yards), paved = makePaved(yards), { x0, x1, z0, z1 } = WAYS_BOX, [wN, hN] = waysN;
    for (let jz = 0; jz < hN; jz++) for (let ix = 0; ix < wN; ix++) {
      const x = x0 + (ix + 0.5) / wN * (x1 - x0), z = z0 + (jz + 0.5) / hN * (z1 - z0), o = (jz * wN + ix) * 4;
      waysPx[o] = Math.round(255 * Math.min(1, dist(x, z) / 4)); waysPx[o + 1] = Math.round(255 * paved(x, z)); waysPx[o + 3] = 255;
    }
    const P = GUILD_SITE.pad;                                              // the guild's own ground: its paved court, the earth of its ring and yard
    const i0 = Math.max(0, Math.floor((P.x - P.hx - 8 - x0) / (x1 - x0) * wN)), i1 = Math.min(wN - 1, Math.ceil((P.x + P.hx + 8 - x0) / (x1 - x0) * wN));
    const j0 = Math.max(0, Math.floor((P.z - P.hz - 6 - z0) / (z1 - z0) * hN)), j1 = Math.min(hN - 1, Math.ceil((P.z + P.hz + 6 - z0) / (z1 - z0) * hN));
    for (let jz = j0; jz <= j1; jz++) for (let ix = i0; ix <= i1; ix++) {
      const g = guild.ground(x0 + (ix + 0.5) / wN * (x1 - x0), z0 + (jz + 0.5) / hN * (z1 - z0)), o = (jz * wN + ix) * 4;
      if (g) { waysPx[o] = Math.min(waysPx[o], Math.round(255 * Math.min(1, g.d / 4))); waysPx[o + 1] = Math.max(waysPx[o + 1], Math.round(255 * g.paved)); }
    }
    for (const d of dabs) stampDab(d);
    waysTex.needsUpdate = true;
  };
  drawWays(EDITS.paths || DEF_PATHS, EDITS.yards || DEF_YARDS, EDITS.dabs);
  // metres to the nearest way as it is drawn (ways, yards and brush work together): read back from the picture
  wayDist = (x, z) => {
    const { x0, x1, z0, z1 } = WAYS_BOX, [wN, hN] = waysN;
    const fx = (x - x0) / (x1 - x0) * wN - 0.5, fz = (z - z0) / (z1 - z0) * hN - 0.5;
    if (fx < 0 || fz < 0 || fx > wN - 1 || fz > hN - 1) return 99;
    const i = Math.min(wN - 2, Math.floor(fx)), j = Math.min(hN - 2, Math.floor(fz)), u = fx - i, v = fz - j, at = (a, b) => waysPx[(b * wN + a) * 4];
    return ((at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v) / 255 * 4;
  };
  {
    const u = terrain.material.uniforms, { x0, x1, z0, z1 } = WAYS_BOX;
    if (u && u.uWays) { u.uWays.value = waysTex; u.uWaysRect.value.set((x0 + x1) / 2, (z0 + z1) / 2, 1 / (x1 - x0), 1 / (z1 - z0)); u.uWaysOn.value = 1; }
    terrain.userData.disposeWays = () => waysTex.dispose();
  }
  for (const p of VILLAGE.props) placed.push([p[1], p[2], 1.4]);
  for (const [ax, az, bx, bz] of vsegs) { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2.5); for (let i = 0; i <= n; i++) placed.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n, 2.2]); }
  // dense forest on the heights (seen from below, so light on leaf cards), bushes only at tree feet
  for (let i = 0; i < 2600; i++) {
    const x = R(B.x0 + 2, B.x1 - 2), z = R(B.z0 + 2, OLD_Z1 - 2);
    const kind = V.legacyKindAt(x, z);
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
  {                                                                        // the guild, where the keep stood: its hall, ring and yard
    group.add(guild.group);
    for (const c of guild.colliders) colliders.push(c);
    for (const b of guild.bare) bare.push(b);
    for (const [x, z, h, r] of guild.casts) { castBall(x, z, h * 0.4, r, 0.85); castStick(x, z, h * 0.75, r * 0.65, 0.8); }
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
  const woodProps = await loadLegacyWoodProps();
  let propSeed = builds.length + 32;                                       // (numbered as when the keep was one of the things built)
  for (const [kind, x, z, yaw] of VILLAGE.props) {                         // the small things
    const seed = propSeed++;
    if (guild.cleared(x, z)) continue;                                     // the keep's barrels and lamp made way for the guild
    let r = 0.7;
    if (!woodProps.place(kind, x, z, yaw, HV, seed)) {
      const g = BD.propGeometry(kind, { seed });
      r = g.userData.solid;
      builds.push(BD.place(g, x, HV(x, z) - 0.03, z, yaw));
    }
    if (r > 0.3) { colliders.push([x, z, r * 0.8]); press.push([x, z, r * 1.5]); castBall(x, z, 0.5, r * 0.9, 0.75); }
    else colliders.push([x, z, 0.22]);
  }
  group.add(woodProps.finish());
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
  const ROCK_R = { boulder: 1.0, slab: 1.3, standing: 0.5, crag: 1.5, stones: 0.8, river: 0.7, pebbles: 0 };
  const putRock = (type, sd, x, z, rot, scale, sink, r) => {
    const m = N.createRock({ type, seed: sd });
    m.position.set(x, HV(x, z) - sink, z); m.rotation.y = rot; m.scale.setScalar(scale);
    rocks.add(m);
    if (r > 0) { colliders.push([x, z, r]); press.push([x, z, r * 1.6]); shade.push([x, z, r * 2.0, 0.3]); castBall(x, z, r * 0.5, r * 0.95, 0.85); }
  };
  const rock = (type, x, z, scale = 1, sink = 0, solid = null) => {
    const sd = ++rs, rot = rng() * 6.28, r = solid ?? (ROCK_R[type] * scale);
    placed.push([x, z, Math.max(r, 0.6)]);
    const at = placeOf('rock', type, x, z, Math.max(r, 0.5));
    if (at) putRock(type, sd, at[0], at[1], rot, scale, sink, r);
  };
  for (let z = Z_HEAD + 6; z < OLD_Z1 - 4; z += R(5, 9)) {                  // water-worn stones along both banks
    for (const s of [-1, 1]) {
      if (rng() < 0.35) continue;
      const x = rx(z) + s * (rw0(z) + R(-0.4, 1.4)), sc = R(0.7, 1.35);
      if (clear(x, z, 0.7 * sc + 0.5)) rock('river', x, z, sc, 0.12);
      if (rng() < 0.5) rock('pebbles', rx(z) + s * (rw0(z) + R(1.5, 3)), z + R(-2, 2), R(0.9, 1.3), 0, 0);
    }
  }
  for (const [dx, dz, sc] of [[-7.5, 5, 1.7], [7, 4.5, 1.5], [-9.5, 9, 1.1], [9.5, 8.5, 1.2]]) {      // boulders flanking the plunge pool
    const x = fall.x + dx, z = fall.z + dz;
    if (clear(x, z, sc)) rock('boulder', x, z, sc, 0.3);
  }
  for (let i = 0; i < 60; i++) {                                           // scree and boulders at the cliff feet
    const z = R(Z_HEAD + 4, OLD_Z1 - 5), s = rng() < 0.5 ? -1 : 1, x0 = rx(z) + s * 12;
    const x = rx(z) + s * (V.cliffLine(x0, z) - R(1.6, 3.2)), sc = R(0.9, 1.6);
    if (onFloor(x, z, 0.3) && clear(x, z, 1.4 * sc)) rock(rng() < 0.45 ? 'boulder' : rng() < 0.6 ? 'stones' : 'crag', x, z, sc, 0.2);
  }
  // rocks in the village: crags and boulders at the foot of each riser, beside the cascades, round the keep's knoll and on the
  // brink by the falls. Many small rocks, so they are baked into one mesh for each kind of stone instead of one mesh apiece.
  const vrocks = [];
  const vrock = (type, x, z, scale, sink = 0.25) => {
    if (wayDist0(x, z) < 2.6 + scale * 0.6 || inStream(x, z) || !clear(x, z, scale)) return;
    const sd = ++rs, rot = rng() * 6.28, r = ({ boulder: 1.0, slab: 1.3, standing: 0.5, crag: 1.5, stones: 0.8 }[type] || 0.8) * scale;
    placed.push([x, z, r]);
    const at = placeOf('rock', type, x, z, r);
    if (!at) return;
    [x, z] = at;
    const m = N.createRock({ type, seed: sd });
    m.position.set(x, HV(x, z) - sink * scale, z); m.rotation.y = rot; m.scale.setScalar(scale);
    m.updateMatrix();
    vrocks.push(m);
    colliders.push([x, z, r * 0.85]); press.push([x, z, r * 1.6]); shade.push([x, z, r * 2.0, 0.3]); castBall(x, z, r * 0.5, r * 0.95, 0.85);
  };
  for (const st of VILLAGE.steps) {
    for (let x = -42; x <= 41; x += R(2.4, 4.4)) {                         // along the foot of the riser
      if (Math.abs(x - PX(st.z)) < 4.6) continue;
      let zf = null;
      for (let z = st.z + 4.5; z > st.z - 4.5; z -= 0.25) if (HV0(x, z - 0.7) - HV0(x, z) > 0.8) { zf = z; break; }
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
    if (!onPlateau0(x, z) || deckAt(x, z)) continue;
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

  // the valley's cliff faces dressed in stacked plates of rock (valley-cliffs.js), from the foot of the falls to the valley's
  // mouth for now; the paths cut into the cliffs are left bare. No dice: where the pieces go comes from the land alone.
  {
    const skipFace = (x, z) => CLS.some(cl => cl.at(x, z).d < cl.half + 1.6) || AB.inPit(x, z, 6);
    const { list, colliders: cc } = valleyCliffPieces({ V, heightAt: HV, z0: fall.z + 9, z1: 50, skip: skipFace, seed });
    if (list.length) {
      const cliffs = createCliffSet(list, { material: valleyCliffMaterial() });
      cliffs.name = 'valleyCliffs';
      group.add(cliffs);
      for (const c of cc) colliders.push(c);
      console.info('[valley] cliff pieces', list.length);
    }
  }

  // things added by hand in the editor (their turn and tilt come from where they stand, not from the dice)
  for (const a of EDITS.added) {
    const rot = (Math.abs(Math.sin(a.x * 12.9898 + a.z * 78.233) * 43758.5453) % 1) * 6.28, sc = a.scale || 1;
    if (a.kind === 'tree' && CROWN[a.type]) putTree(a.type, ++ps, a.x, a.z, rot, sc, 0.7);
    else if (a.kind === 'bush') putShrub(a.type === 'flowering' ? 'flowering' : 'round', ++ps, a.x, a.z, rot, sc);
    else if (a.kind === 'rock' && ROCK_R[a.type] !== undefined) putRock(a.type, ++rs, a.x, a.z, rot, sc, 0.2, ROCK_R[a.type] * sc);
  }

  // ------------------------------------------------------------------ round the abyss (its own dice, after everything above)
  await onStep('ขุดห้วงลึก');
  const arng = mulberry32(seed * 7919 + 11), AR = (a, b) => a + arng() * (b - a);
  let aps = seed * 7000, ars = seed * 9000;
  const abyssBuilt = [], abyssRocks = [];
  const RIM = ABYSS.rimH;
  // the forest round the rim: thick on the plateau, kept back from the walk, the brooks and the top of the path up
  for (let i = 0; i < 2200; i++) {
    const x = AR(B.x0 + 2, B.x1 - 2), z = AR(OLD_Z1 - 12, B.z1 - 2), pick = arng(), sc = AR(0.95, 1.5), rot = arng() * 6.28;
    const rd = AB.rimDist(x, z);
    if (rd < 11.5 || HV(x, z) < RIM - 3 || steepAt(x, z) > 0.3 || AB.brookDist(x, z).d < 3) continue;
    if (CL2.at(x, z).d < CL2.half + 3 || Math.hypot(x - CL2.top[0], z - CL2.top[1]) < 7) continue;
    const type = pick < 0.42 ? 'pine' : pick < 0.72 ? 'oak' : pick < 0.9 ? 'broadleaf' : 'birch';
    if (!clear(x, z, CROWN[type] * sc * (rd < 20 ? 0.5 : 0.36))) continue;
    placed.push([x, z, CROWN[type] * sc * 0.42]);
    const at = placeOf('tree', type, x, z, CROWN_R[type] * sc);
    if (at) putTree(type, ++aps, at[0], at[1], rot, sc, type === 'pine' ? 0.25 : 0.3);
    if (arng() < 0.18) { const a = arng() * 6.28, d = (TRUNK[type] + 1.1) * sc, bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d, bt = arng() < 0.35 ? 'flowering' : 'round';
      placed.push([bx, bz, 1]); const bat = placeOf('bush', bt, bx, bz, 0.9); if (bat) putShrub(bt, ++aps, bat[0], bat[1], arng() * 6.28, AR(0.8, 1.1)); }
  }
  // what grows on the river's rock islands
  for (const isl of AB.islands) {
    if (!isl.grow) continue;
    const x = isl.x + AR(-0.4, 0.4), z = isl.z + AR(-0.4, 0.4), y = HV(x, z), rot = arng() * 6.28;
    if (isl.grow === 'bush') plants.push({ kind: 'bush', type: arng() < 0.5 ? 'flowering' : 'round', seed: ++aps, x, y, z, rotY: rot, scale: AR(0.8, 1.0) });
    else { const sc = isl.grow === 'pine' ? AR(0.8, 0.95) : AR(0.75, 0.9); plants.push({ kind: 'tree', type: isl.grow, seed: ++aps, detail: 0.8, x, y, z, rotY: rot, scale: sc });
      crowns.push([x, y + CROWN_Y[isl.grow] * sc, z, CROWN_R[isl.grow] * sc]); castBall(x, z, CROWN_Y[isl.grow] * sc, CROWN_R[isl.grow] * sc, 0.88, 0.3); }
  }
  // tufts of green on the first two ledges down (no one walks there: nothing solid, no shadows)
  for (let k = 0; k < 2; k++) {
    const L = AB.ledge(k);
    for (let i = 0; i < 26; i++) {
      const a = arng() * Math.PI * 2, u = AR(L.u0 + 1.6, L.u1 - 0.8), d = AB.rimR(a) - u, x = ABYSS.x + Math.cos(a) * d, z = ABYSS.z + Math.sin(a) * d;
      const y = HV(x, z), rot = arng() * 6.28, kind = arng();
      if (AB.chuteAt(a) > 0.05 || Math.abs(y - L.y) > 3 || steepAt(x, z) > 0.5) continue;
      if (kind < 0.55) plants.push({ kind: 'bush', type: arng() < 0.3 ? 'flowering' : 'round', seed: ++aps, x, y, z, rotY: rot, scale: AR(0.7, 1.2) });
      else plants.push({ kind: 'tree', type: kind < 0.8 ? 'sapling' : 'pine', seed: ++aps, detail: 0.6, x, y: y - 0.1, z, rotY: rot, scale: AR(0.7, 1.05) });
    }
  }
  // rocks: boulders on the islands' shoulders and along the brink, crags where the walls break
  const arock = (type, x, z, scale, sink = 0.25, solid = true) => {
    const r = ({ boulder: 1.0, crag: 1.5, stones: 0.8, slab: 1.3, river: 0.7 }[type] || 0.8) * scale;
    placed.push([x, z, r]);
    const at = placeOf('rock', type, x, z, r);
    if (!at) return;
    const m = N.createRock({ type, seed: ++ars });
    m.position.set(at[0], HV(at[0], at[1]) - sink * scale, at[1]); m.rotation.y = arng() * 6.28; m.scale.setScalar(scale);
    m.updateMatrix();
    abyssRocks.push(m);
    if (solid) { colliders.push([at[0], at[1], r * 0.85]); press.push([at[0], at[1], r * 1.6]); castBall(at[0], at[1], r * 0.5, r * 0.95, 0.85); }
  };
  for (let deg = -60; deg < 236; deg += AR(5, 11)) {                       // along the brink, outside the rail
    const a = deg * Math.PI / 180, d = AB.rimR(a) + AR(9.5, 12.5), x = ABYSS.x + Math.cos(a) * d, z = ABYSS.z + Math.sin(a) * d;
    if (AB.brookDist(x, z).d < 2 || AB.spurDist(x, z) < 4 || !clear(x, z, 1.2) || HV(x, z) < RIM - 3) continue;
    arock(arng() < 0.5 ? 'boulder' : 'crag', x, z, AR(0.9, 1.6));
  }
  for (const isl of AB.islands) if (isl.h > 1) for (let k = 0; k < 2; k++) {                   // stones round the islands' feet
    const a = arng() * 6.28, d = isl.r + AR(0.2, 0.9);
    arock(arng() < 0.6 ? 'river' : 'boulder', isl.x + Math.cos(a) * d, isl.z + Math.sin(a) * d, AR(0.6, 1.0), 0.3, false);
  }
  // a fall's way into the pit, as a point u metres in from where it goes over
  const inward = (f, u) => { const dx = ABYSS.x - f.x, dz = ABYSS.z - f.z, l = Math.hypot(dx, dz); return [f.x + dx / l * u, f.z + dz / l * u]; };
  const freeRock = (type, x, y, z, scale, ry = arng() * 6.28) => {                              // a rock set by hand, not on the ground
    const m = N.createRock({ type, seed: ++ars });
    m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(scale); m.updateMatrix();
    abyssRocks.push(m);
  };
  for (const f of AB.falls) if (f.rock) { const [x, z] = inward(f, f.rock.u); freeRock('crag', x, f.rock.y - 0.9, z, 1.25); }   // the rock that splits a fall
  for (const f of AB.falls) for (const st of f.steps) for (const s of [-1, 1]) {                // stones at the corners of each pool's lip
    const [cx, cz] = inward(f, st.u1 - 0.3), dx = ABYSS.x - f.x, dz = ABYSS.z - f.z, l = Math.hypot(dx, dz), side = f.width / 2 + 0.5 + AR(0, 0.4);
    freeRock(arng() < 0.5 ? 'boulder' : 'stones', cx - dz / l * side * s, st.y - 0.25, cz + dx / l * side * s, AR(0.8, 1.15));
  }
  // slabs of rock jutting out over the brink, each on a crag (outside the rail: no one stands on them)
  for (const deg of [-22, 24, 54, 128, 172, 214]) {
    const a = deg * Math.PI / 180;
    if (AB.chuteAt(a) > 0.01 || AB.spurDist(...AB.polar(a, AB.rimR(a))) < 9 || AB.brookDist(...AB.polar(a, AB.rimR(a))).d < 4) continue;
    const [x, z] = AB.polar(a, AB.rimR(a) - 0.6), [x2, z2] = AB.polar(a, AB.rimR(a) - 0.1);
    freeRock('slab', x, RIM - 0.85, z, AR(2.2, 3.0), -a + AR(-0.4, 0.4));
    freeRock('crag', x2, RIM - 4.2, z2, AR(1.6, 2.1));
  }
  for (const f of AB.falls) if (f.kind === 'brook') for (const s of [-1, 1]) {                  // boulders flanking where each brook goes over
    const t = f.a + s * (f.width / 2 + 1.6) / ABYSS.r, x = ABYSS.x + Math.cos(t) * (AB.rimR(t) + 1.6), z = ABYSS.z + Math.sin(t) * (AB.rimR(t) + 1.6);
    arock('boulder', x, z, AR(1.0, 1.4), 0.3);
  }
  // a rail along the brink (gaps where the brooks go over and where the lookout runs out), and round the lookout
  {
    const railR = a => AB.rimR(a) + 1.0;
    const gapAt = (x, z) => AB.brookDist(x, z).d < 1.2 || AB.spurDist(x, z) < AB.spur.half + 0.3 || AB.spanDist(x, z) < 1.7;
    let cur = [];
    const flush = () => {
      if (cur.length > 1) { const g = BD.fenceGeometry({ points: cur, heightAt: HV, closed: false, spacing: 1.7, seed: 41 + abyssBuilt.length }); for (const c of g.userData.circles) colliders.push(c); abyssBuilt.push(g); }
      cur = [];
    };
    for (let deg = ABYSS.walk.from + 1; deg <= ABYSS.walk.to - 3; deg += 2.4) {
      const a = deg * Math.PI / 180, x = ABYSS.x + Math.cos(a) * railR(a), z = ABYSS.z + Math.sin(a) * railR(a);
      if (gapAt(x, z)) flush(); else cur.push([x, z]);
    }
    flush();
    // round the lookout's tip: along its two sides and across its end, 0.5 m in from the edge
    const { base, tip, half } = AB.spur, ux = tip[0] - base[0], uz = tip[1] - base[1], L = Math.hypot(ux, uz), dx = ux / L, dz = uz / L, w = half - 0.5;
    const along = t => [base[0] + dx * t, base[1] + dz * t];
    const side = (t, s) => { const [x, z] = along(t); return [x - dz * w * s, z + dx * w * s]; };
    const t0 = ABYSS.spur.out - 0.8;                     // from the brink rail out to the tip, round it and back
    const pts = [side(t0, 1), side((t0 + L) / 2, 1), side(L, 1)];
    for (let k = 1; k < 6; k++) { const q = Math.PI / 2 - k * Math.PI / 6; pts.push([tip[0] + (dx * Math.cos(q) - dz * Math.sin(q)) * w, tip[1] + (dz * Math.cos(q) + dx * Math.sin(q)) * w]); }
    pts.push(side(L, -1), side((t0 + L) / 2, -1), side(t0, -1));
    const g = BD.fenceGeometry({ points: pts, heightAt: HV, closed: false, spacing: 1.4, seed: 47 });
    for (const c of g.userData.circles) colliders.push(c);
    abyssBuilt.push(g);
    const [bx, bz] = side(L - 1.6, 1).map((v, i) => v - (i ? dx : -dz) * 1.0);       // a bench by the side rail, facing out over the pit
    abyssBuilt.push(BD.place(BD.propGeometry('bench', { seed: 48 }), bx, HV(bx, bz) - 0.03, bz, Math.atan2(dx, dz)));
    for (const k of [-0.5, 0.5]) colliders.push([bx - dz * k, bz + dx * k, 0.45]);
    bare.push([bx, bz, 1.4]);
  }
  // plank bridges where the walk crosses the brooks
  for (const br of AB.bridges) {
    const b = T.createBridge({ length: br.len, seed: seed + 9 + abyssBuilt.length });
    const c = Math.cos(br.yaw), s = Math.sin(br.yaw), e0 = [br.x - c * br.len / 2, br.z + s * br.len / 2], e1 = [br.x + c * br.len / 2, br.z - s * br.len / 2];
    const by = (HV(e0[0], e0[1]) + HV(e1[0], e1[1])) / 2 - 0.15;
    b.position.set(br.x, by, br.z);
    b.rotation.y = br.yaw;
    group.add(b);
    decks.push({ x: br.x, z: br.z, len: br.len, halfW: 0.95, yaw: br.yaw, y: u => by + 0.41 + 0.7 * (1 - Math.pow(2 * u / br.len, 2)) });
    for (let u = -br.len / 2; u <= br.len / 2; u += 1) bare.push([br.x + c * u, br.z - s * u, 1.4]);
    castBall(br.x, br.z, 0.4, br.len / 2.4, 0.65);
  }
  // the rope bridge across the pit. It hangs from its two ends and sways a little (more when someone is on it): the whole
  // bridge turns about the line between its ends, a few centimetres at the middle, too little to matter to where she stands.
  let span = null;
  {
    const S = AB.span, yA = HV(S.a[0], S.a[1]), yB = HV(S.b[0], S.b[1]);
    const opts = { length: S.len, sag: S.sag, rise: yB - yA };
    const holder = new THREE.Group(), swing = new THREE.Group();
    holder.position.set(S.a[0], yA, S.a[1]);
    holder.rotation.y = S.yaw;
    const mesh = new THREE.Mesh(BD.ropeBridgeGeometry({ ...opts, seed: 61 }), propMaterial());
    mesh.name = 'ropeBridge';
    mesh.userData.dispose = () => mesh.geometry.dispose();
    swing.add(mesh); holder.add(swing); group.add(holder);
    const deck = { x: S.mid[0], z: S.mid[1], len: S.len, halfW: 1.4, yaw: S.yaw,
      halfWAt: u => BD.ropeBridgeHalfWidth(u + S.len / 2, opts) - 0.2, y: u => yA + BD.ropeBridgeDeck(u + S.len / 2, opts) };
    decks.push(deck);
    const c = Math.cos(S.yaw), s = Math.sin(S.yaw);
    for (const [lx, w] of [[-0.45, BD.ropeBridgeHalfWidth(0, opts)], [S.len + 0.45, BD.ropeBridgeHalfWidth(S.len, opts)]]) {
      for (const sz of [-1, 1]) { const lz = sz * (w + 0.2); colliders.push([S.a[0] + lx * c + lz * s, S.a[1] - lx * s + lz * c, 0.3]); }
    }
    for (const [x, z] of [S.a, S.b]) bare.push([x, z, 2.2]);
    span = { swing, deck, k: 0 };
  }
  if (abyssBuilt.length) {
    const m = new THREE.Mesh(mergeGeometries(abyssBuilt), propMaterial());
    abyssBuilt.forEach(g => g.dispose());
    m.name = 'abyssRails';
    m.userData.dispose = () => m.geometry.dispose();
    group.add(m);
  }
  {
    const byMat = new Map();
    for (const m of abyssRocks) {
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
      mesh.name = 'abyssRocks';
      mesh.userData.dispose = () => mesh.geometry.dispose();
      group.add(mesh);
    }
  }

  // ------------------------------------------------------------------ ground colour map: where grass grows
  // ------------------------------------------------------------------ the depths: what grows and lies about down there
  await onStep('ลงสู่ก้นห้วงลึก');
  const deepGroups = DPT.layers.map(L => { const g = new THREE.Group(); g.name = 'depths-' + L.key; g.visible = false; group.add(g); return g; });
  const deepPlants = DPT.layers.map(() => []);
  {
    let ds = seed * 53;
    const drng = mulberry32(seed * 131 + 7);
    DPT.layers.forEach((L, k) => {
      const g = deepGroups[k], list = deepPlants[k];
      for (const t of L.trees) {
        const y = DPT.heightAt(t.x, t.z), sc = t.scale, ty = t.type;
        list.push({ kind: 'tree', type: ty, seed: ++ds, detail: 0.8, x: t.x, y: y - 0.05, z: t.z, rotY: drng() * 6.28, scale: sc });
        if (t.loose) continue;                                             // (out on a stack in the clouds: nobody gets there)
        colliders.push([t.x, t.z, TRUNK[ty] * sc + 0.22]);
        cameraTrunks.push([t.x, t.z, TRUNK[ty] * sc + 0.12, y, y + CROWN_Y[ty] * sc]);
        crowns.push([t.x, y + CROWN_Y[ty] * sc, t.z, CROWN_R[ty] * sc]);
        shade.push([t.x, t.z, CROWN[ty] * sc * 1.05, 0.4]); bare.push([t.x, t.z, TRUNK[ty] * sc * 1.5]);
        castBall(t.x, t.z, CROWN_Y[ty] * sc, CROWN_R[ty] * sc, 0.88, 0.3);
        castStick(t.x, t.z, CROWN_Y[ty] * sc * 0.85, Math.max(0.22, TRUNK[ty] * sc * 0.7));
      }
      for (const b of L.bushes) {
        list.push({ kind: 'bush', type: drng() < 0.35 ? 'flowering' : 'round', seed: ++ds, x: b.x, y: DPT.heightAt(b.x, b.z), z: b.z, rotY: drng() * 6.28, scale: b.scale });
        colliders.push([b.x, b.z, 0.75 * b.scale]); shade.push([b.x, b.z, 1.7 * b.scale, 0.45]); castBall(b.x, b.z, 0.55 * b.scale, 0.95 * b.scale, 0.8, 0.2);
      }
      for (const r of L.rocks) {
        const m = N.createRock({ type: r.type, seed: ++ds }), rad = ROCK_R[r.type] * r.scale;
        m.position.set(r.x, DPT.heightAt(r.x, r.z) - 0.2 * r.scale, r.z); m.rotation.y = drng() * 6.28; m.scale.setScalar(r.scale);
        g.add(m);
        if (rad > 0) { colliders.push([r.x, r.z, rad]); press.push([r.x, r.z, rad * 1.6]); shade.push([r.x, r.z, rad * 2.0, 0.3]); castBall(r.x, r.z, rad * 0.5, rad * 0.95, 0.85); }
      }
      for (const i of L.islands) if (i.tree) list.push({ kind: 'tree', type: i.tree, seed: ++ds, detail: 0.7, x: i.x + 0.4, y: i.y + 0.25, z: i.z - 0.3, rotY: drng() * 6.28, scale: 0.9 });
      if (L.key === 'gorge') for (let n = 0; n < L.ribbons[0].rows.length; n += 5) { const q = L.ribbons[0].rows[n]; shade.push([q[0], q[1], 11, 0.5]); }      // the gorge lies in shadow
      const [wx, wz] = L.warp;
      colliders.push([wx, wz, 0.5]); bare.push([wx, wz, 2.0]); press.push([wx, wz, 3.2]);
    });
  }
  // the warp stone up on the rim: on the grass beside the walk, a few steps from the way out onto the lookout
  const rimWarp = (() => { const a = AB.spur.a + 0.1, [x, z] = AB.polar(a, AB.rimR(a) + ABYSS.walk.off + 3.3), [bx, bz] = AB.polar(a, AB.rimR(a) + ABYSS.walk.off); return { x, z, yaw: Math.atan2(bx - x, bz - z) }; })();
  colliders.push([rimWarp.x, rimWarp.z, 0.5]); bare.push([rimWarp.x, rimWarp.z, 2.1]); press.push([rimWarp.x, rimWarp.z, 3.2]);
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    const deep = DPT.paint(x, z);
    if (deep) return deep;
    const h = Hf(x, z), low = lower(x, z);
    const sand = low ? 1 - ss(0.35, 0.8, h - WL) : 1 - ss(-0.2, 0.25, h - V.plateauWaterAt(z));
    // the village's ways: no grass on the trodden earth; beside it a verge where the grass is worn thin and short. The edge of
    // each is pushed about by two sizes of noise, so the grass comes into the way in tongues and tufts, not along a ruled line
    const wd = wayDist(x, z);
    let trod = 0, verge = 0;
    if (wd < 4) {
      const rag = (N._internal.fbm3(x * 0.3, 5.1, z * 0.3, 41, 2) - 0.5) * 0.9 + (N._internal.fbm3(x * 1.1, 8.3, z * 1.1, 43, 2) - 0.5) * 0.5;
      trod = 1 - ss(0.4, 1.5, wd + rag);              // thinning over a metre: bare, then sparse yellowed blades, then grass
      verge = 1 - ss(1.0, 2.8, wd + rag * 1.4);
      trod = Math.max(trod, 0.28 * verge);            // and on the verge the blades stand about half as tall
    }
    let earth = Math.max(ss(0.14, 0.24, slopeF(x, z)), 1 - ss(0.55, 1.3, CL.at(x, z).d), 1 - ss(0.55, 1.3, CL2.at(x, z).d), trod);      // cliffs and steep ledges: rock; the cliff paths and the village's ways: trodden earth
    let s2 = sand;
    if (z > OLD_Z1 - 20) {
      // round the abyss: nothing grows over the brink (the ledges are drawn green by the ground itself); the brooks run between
      // sandy banks; the walk round the rim and out onto the lookout is trodden earth
      const rd = AB.rimDist(x, z);
      if (rd < 0.6 && AB.spurDist(x, z) > AB.spur.half - 0.6) earth = 1;
      const bd = AB.brookDist(x, z).d;
      if (bd < 1.4) { s2 = Math.max(s2, 1 - ss(0.4, 1.4, bd)); earth = Math.max(earth, 1 - ss(-0.2, 0.4, bd)); }
      if (Hf(x, z) > ABYSS.rimH - 2.5) {
        const rag = (N._internal.fbm3(x * 0.4, 7.7, z * 0.4, 47, 2) - 0.5) * 0.8;
        const sp = AB.spurDist(x, z), along = Math.hypot(x - AB.spur.tip[0], z - AB.spur.tip[1]);
        const deg = Math.atan2(z - ABYSS.z, x - ABYSS.x) * 180 / Math.PI, walkHere = !(deg > ABYSS.walk.to - 360 && deg < ABYSS.walk.from);
        const onWalk = walkHere ? Math.abs(rd - ABYSS.walk.off) + rag : 99, onSpur = sp < AB.spur.half ? Math.abs(sp) * 0.9 + rag + (along < 1.2 ? 9 : 0) : 99;
        earth = Math.max(earth, 1 - ss(0.5, 1.4, Math.min(onWalk, onSpur)) * (rd > 1.2 || sp < AB.spur.half ? 1 : 0));
      }
    }
    return [earth, s2, verge * 0.85];
  };
  const colors = { ...G.GROUND_COLORS, deep: '#7a9b3c', mid: '#86a640', sunny: '#a5c04b', shade: '#6d8d38', lawn: '#93b145' };
  const map = G.createGroundMap({ radius: FR, center: [CX, CZ], size: 1024, seed, heightAt: Hf, dirt: 0, shade, cast: sunShadows(new THREE.Vector3(...sun)), bare, press, paint, colors });
  // the bare ground (sand, banks, cliff feet) is drawn by the terrain's own shader: it reads the same shadow picture
  {
    const tm = terrain.material, key = 'col = mix(col, uHaze, vHaze);';
    if (tm && tm.isShaderMaterial && tm.fragmentShader.includes(key)) {
      Object.assign(tm.uniforms, { uCast: { value: map.cast }, uCastRect: { value: map.rect }, uCastTint: { value: new THREE.Vector3(...map.castTint) }, uCastK: { value: 1 } });
      tm.fragmentShader = 'uniform sampler2D uCast;\nuniform vec3 uCastRect;\nuniform vec3 uCastTint;\nuniform float uCastK;\n' + tm.fragmentShader.replace(key, 'col *= mix(vec3(1.0), uCastTint, texture2D(uCast, (vWP.xz - uCastRect.xy) * uCastRect.z + 0.5).r * uCastK);\n        ' + key);
      tm.needsUpdate = true;
      const u = tm.uniforms;                                               // the depths' land reads the same shadow picture
      Object.assign(deepMat.uniforms, { uCast: u.uCast, uCastRect: u.uCastRect, uCastTint: u.uCastTint, uCastK: u.uCastK });
      deepMat.fragmentShader = 'uniform sampler2D uCast;\nuniform vec3 uCastRect;\nuniform vec3 uCastTint;\nuniform float uCastK;\n' + deepMat.fragmentShader.replace(key, 'col *= mix(vec3(1.0), uCastTint, texture2D(uCast, (vWP.xz - uCastRect.xy) * uCastRect.z + 0.5).r * uCastK);\n        ' + key);
      deepMat.needsUpdate = true;
    }
  }
  const fade = { far, fadeA: FR * 0.9, fadeB: FR * 1.2 };

  // ------------------------------------------------------------------ water: the lower river, from under the falls to the valley mouth
  await onStep('วาดริ้วฟองน้ำ');
  const foamTexture = await W.loadFoamTexture();
  await onStep('เติมน้ำ');
  // the river runs to the brink of the abyss, spreading out as it nears it (the sixth number: how much of its width is that
  // spreading, which does not slow it down the way the pool under the falls does)
  const BRINK_Z = ABYSS.z - ABYSS.r * Math.cos(32 * Math.PI / 180);
  const stream = [];
  for (let z = fall.z - 0.6; z <= BRINK_Z; z += 0.5) stream.push([rx(z), z, WL, rw(z), 1.3, AB.widen(z)]);
  // the water stops at the brink: a point beyond it is drawn back up the valley onto it (the falls take over from there)
  const toBrink = (x, z) => {
    for (let k = 0; k < 3; k++) {
      const a = Math.atan2(z - ABYSS.z, x - ABYSS.x), R = AB.rimR(a) + 0.05, dx = x - ABYSS.x;
      if (Math.hypot(dx, z - ABYSS.z) >= R || Math.abs(dx) >= R) break;
      z = Math.min(z, ABYSS.z - Math.sqrt(R * R - dx * dx));
    }
    return z;
  };
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
      const streaminess = 1 - ss(3.6, 6.2, s[3] - (s[5] || 0));      // 1 in the river, 0 over the plunge pool
      if (k > 0) F += Math.hypot(s[0] - a[0], s[1] - a[1]) * W.FLOW.pond / lerp(W.FLOW.pond, W.FLOW.stream, streaminess);
      for (let i = 0; i <= ACROSS; i++) {
        const u = -1 + 2 * i / ACROSS, x = s[0] - tz * u * half, z = toBrink(x, s[1] + tx * u * half);
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
      // as wide as the water that reaches the brink (the stream's channel plus its shallow edges), so none of it stops short in the
      // air beside the fall; thrown out a little further, so the sheet clears the face of the riser instead of running into it
      const c = createWaterfall({ x: PX(st.z), z: st.z - 0.95, top: V.plateauWaterAt(st.z - 1), bottom: V.plateauWaterAt(st.z + 1) - 0.2, width: 2 * (PW + 1.3), forward: 2.1, scale: 0.4, foamTexture, cells: animeCells });
      c.group.userData = { kind: 'waterfall', dispose: c.dispose };
      group.add(c.group);
      cascades.push(c);
    }
    // the waterfall, in the same palette
    waterfall = createWaterfall({ x: fall.x, z: fall.z - 1.25, top: fall.top, bottom: WL - 0.25, width: 4.6, optics, foamTexture, cells: animeCells, surfaceChurn: W.WATER_CHURN });
    waterfall.group.userData = { kind: 'waterfall', dispose: waterfall.dispose };
    group.add(waterfall.group);
    // the pools the falls in the abyss land in on their way down
    for (const f of AB.falls) for (const st of f.steps) {
      const rows = [], dx = ABYSS.x - f.x, dz = ABYSS.z - f.z, l = Math.hypot(dx, dz);
      for (let u = st.u0 + 0.75; u <= st.u1 + 0.01; u += 0.5) rows.push([f.x + dx / l * u, f.z + dz / l * u, st.y, f.width / 2 + 0.2]);
      const pg = flowRibbon(rows, 10, 1.0), m = new THREE.Mesh(pg, upMat);
      m.renderOrder = 1;
      m.userData = { kind: 'water', dispose() { pg.dispose(); } };
      upperWater.add(m);
    }
    // the brooks on the plateau round the abyss: the same clear water as the upper river, running to the brink
    for (const b of AB.brooks) {
      const rows = [];
      for (const [x, z] of b.pts) { if (AB.rimDist(x, z) < 0.1) break; rows.push([x, z, b.level, b.half]); }
      if (rows.length < 2) continue;
      const bg = flowRibbon(rows, 10, 1.3), m = new THREE.Mesh(bg, upMat);
      m.renderOrder = 1;
      m.userData = { kind: 'water', dispose() { bg.dispose(); } };
      upperWater.add(m);
    }
  }
  // the falls going over the brink of the abyss, and the clouds hanging in it
  await onStep('ม่านน้ำตกลงห้วงลึก');
  // (without the see-through picture: it would mean drawing the whole scene a second time every frame anywhere near the
  // abyss, for a bend in the cliff behind a sheet that is mostly white water anyway)
  const abyssFalls = createAbyssFalls({ falls: AB.falls, centre: [ABYSS.x, ABYSS.z], optics: null, foamTexture });
  abyssFalls.group.userData = { kind: 'waterfall', dispose: abyssFalls.dispose };
  group.add(abyssFalls.group);
  const abyssClouds = createAbyssClouds({ centre: [ABYSS.x, ABYSS.z], rimR: AB.rimR, ledges: [0, 1, 2, 3].map(AB.ledge), falls: AB.falls });
  abyssClouds.group.userData = { dispose: abyssClouds.dispose };
  group.add(abyssClouds.group);
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
  const SECT = 6, sectors = Array.from({ length: SECT }, () => []);
  for (const p of plants) sectors[Math.min(SECT - 1, Math.floor((p.z - B.z0) / (B.z1 - B.z0) * SECT))].push(p);
  let cards = 0, draws = 0;
  for (const list of sectors) {
    if (!list.length) continue;
    const f = N.createForest(list);
    f.userData.forest = true;
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
    const z = R(Z_HEAD + 8, OLD_Z1 - 6), x = rx(z) + (rng() < 0.5 ? -1 : 1) * R(rw0(z) + 5, 17), rad = R(1.2, 2.8);
    if (!onFloor(x, z, rad + 1) || map.grassAt(x, z) < 0.5 || !clear(x, z, rad)) continue;
    const count = Math.round(R(40, 100)), sd = ++fs, colors = PALS[fi++ % PALS.length], at = placeOf('flower', 'bed', x, z, rad);
    if (at) group.add(N.createFlowers({ count, radius: rad, seed: sd, heightAt: HV, center: at, colors }));
  }
  for (const [x, z, rad] of VILLAGE.flowers) {                              // flower beds in the village
    const sd = ++fs, colors = PALS[fi++ % PALS.length], at = placeOf('flower', 'bed', x, z, rad);
    if (at) group.add(N.createFlowers({ count: Math.round(45 * rad), radius: rad, seed: sd, heightAt: HV, center: at, colors }));
  }
  for (const a of EDITS.added) if (a.kind === 'flower') group.add(N.createFlowers({ count: 90, radius: 1.8, seed: ++fs, heightAt: HV, center: [a.x, a.z], colors: PALS[(a.type | 0) % PALS.length] }));

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
  let grassDirty = false;
  let frameNo = 0, nextSplash = 0, nextHeave = 0, lastRenderer = null, walker = null;
  const waterSpheres = [];
  for (let k = 0; k < stream.length; k += 20) { const sp = stream[k]; waterSpheres.push(new THREE.Sphere(new THREE.Vector3(sp[0], sp[2], sp[1]), sp[3] + 7)); }
  waterSpheres.push(new THREE.Sphere(new THREE.Vector3(fall.x, (fall.top + WL) / 2, fall.z), (fall.top - WL) / 2 + 3));      // the falls see through too
  // ------------------------------------------------------------------ the depths: their land, water, clouds and warp stones
  await onStep('ลงสู่ก้นห้วงลึก');
  const warpStones = [], warps = [];
  const putWarp = (key, name, x, z, y, yaw, parent) => {
    const w = DP.createWarpStone();
    w.group.position.set(x, y, z);
    parent.add(w.group); warpStones.push(w);
    warps.push({ key, name, x, z, yaw, stand: [x + Math.sin(yaw) * 2.4, z + Math.cos(yaw) * 2.4] });      // stand: where she arrives, a step off the stone
  };
  {
    let fs2 = seed * 71;
    DPT.layers.forEach((L, k) => {
      const g = deepGroups[k];
      const land = new THREE.Mesh(DP.layerGeometry(L, DPT), deepMat);
      land.name = 'depthsLand'; land.layers.enable(W.UNDERWATER);
      land.userData.dispose = () => land.geometry.dispose();
      g.add(land);
      g.traverse(o => o.layers.enable(W.UNDERWATER));                      // (the rocks put there earlier)
      for (const r of L.ribbons) {                                         // the clear water: the same water as the river's
        const m = new THREE.Mesh(flowRibbon(r.rows, r.along === 'line' ? 10 : 18, 0), water.material);
        m.renderOrder = 1; m.name = 'depthsWater';
        m.userData = { kind: 'water', dispose() { m.geometry.dispose(); } };
        g.add(m); hidden.push(m);
      }
      if (L.pads.length) { const pads = W.createLilyPads({ pads: L.pads, seed: seed + k, sim }); g.add(pads); }
      for (const f of L.falls) {
        const c = createWaterfall({ x: 0, z: 0, top: f.top, bottom: f.bottom - 0.25, width: f.width, forward: f.forward, scale: f.scale ?? 0.6, foamTexture, cells: animeCells });
        c.group.position.set(f.x, 0, f.z); c.group.rotation.y = f.yaw;
        c.group.userData = { kind: 'waterfall', dispose: c.dispose };
        g.add(c.group); cascades.push(c);
      }
      for (const [x, z, r] of L.spheres) waterSpheres.push(new THREE.Sphere(new THREE.Vector3(x, WL, z), r));
      // cloud: a sea of it (or a lid of mist), puffs, shafts of light; rocks that hang in the air
      if (L.sea) g.add(DP.createCloudSea(L.sea));
      if (L.clouds.length) g.add(DP.cloudPuffs(L.clouds, _abyss.puffMaterial(), [L.sea.x, L.sea.z]));
      if (L.shafts.length) g.add(DP.createShafts(L.shafts));
      for (const i of L.islands) { const m = new THREE.Mesh(DP.floatingRock(i), deepMat); m.position.set(i.x, i.y, i.z); m.userData.dispose = () => m.geometry.dispose(); g.add(m); }
      if (deepPlants[k].length) {
        const f = N.createForest(deepPlants[k]), box = new THREE.Box3();
        for (const q of deepPlants[k]) { box.expandByPoint(new THREE.Vector3(q.x - 7, q.y - 1, q.z - 7)); box.expandByPoint(new THREE.Vector3(q.x + 7, q.y + 17, q.z + 7)); }
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        f.children.forEach(m => { m.geometry.boundingSphere = sphere.clone(); m.frustumCulled = true; });
        g.add(f);
      }
      for (const fl of L.flowers) g.add(N.createFlowers({ count: Math.round(42 * fl.rad), radius: fl.rad, seed: ++fs2, heightAt: DPT.heightAt, center: [fl.x, fl.z], colors: PALS[fs2 % PALS.length] }));
      putWarp(L.key, L.name, L.warp[0], L.warp[1], DPT.heightAt(L.warp[0], L.warp[1]), L.yaw, g);
    });
    putWarp('rim', 'ขอบห้วงลึก', rimWarp.x, rimWarp.z, HV(rimWarp.x, rimWarp.z) + 0.08, rimWarp.yaw, group);
  }
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
  // ---- up in the valley, or down in one of the depths: only where she is gets drawn
  const surface = new THREE.Group();
  surface.name = 'valleySurface';
  { const keep = new Set([grass, droplets.points, walkerShadow, ...deepGroups]); for (const c of [...group.children]) if (!keep.has(c)) surface.add(c); }
  group.add(surface);
  let zone = -1;
  const hz = N._internal.shared, haze0 = { near: hz.uHazeNear.value, far: hz.uHazeFar.value, max: hz.uHazeMax.value };
  const fades = [grass.material.uniforms, water.material.uniforms].filter(u => u && u.uFadeA && u.uFadeB).map(u => ({ u, a: u.uFadeA.value, b: u.uFadeB.value }));
  const setZone = k => {
    if (zone < 0) { haze0.near = hz.uHazeNear.value; haze0.far = hz.uHazeFar.value; haze0.max = hz.uHazeMax.value; }
    zone = k;
    surface.visible = k < 0;
    deepGroups.forEach((g, i) => { g.visible = i === k; });
    for (const f of fades) { f.u.uFadeA.value = k < 0 ? f.a : 1e5; f.u.uFadeB.value = k < 0 ? f.b : 2e5; }      // (the map's edge is not an edge down there)
    N.setHaze(k < 0 ? haze0 : DPT.layers[k].haze);
  };
  group.userData = { kind: 'valleyLevel', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); map.dispose(); field.texture.dispose(); } };
  console.info('[valley] trees', plants.filter(p => p.kind === 'tree').length, 'rocks', rocks.children.length, 'leaf cards', cards);
  return {
    group, map, field, grass, terrain, waterDepthAt, colliders, crowns, cameraTrunks, spawn, radius: 1e4, walkable, guild,
    heightAt: (x, z) => DPT.covers(x, z) ? DPT.heightAt(x, z) : guild.heightAt(x, z, H(x, z)),      // the land, a bridge's deck, a floor of the guild's hall, or the depths
    warps, get zone() { return zone; },                                    // the warp stones ({ key, name, x, z, yaw, stand }); which layer she is in (-1: up in the valley)
    confine(p) { confine(p); guild.collide(p); },                          // and the hall's walls, rails and furniture
    // places worth a look: the foot of the cliff path, and the meadow by the windmill (x, z, the way to face)
    views: {
      climb: { x: CL.bottom[0] - 2.5, z: CL.bottom[1] + 2, yaw: Math.PI }, mill: { x: MILL[0] + 6, z: MILL[1] + 9, yaw: Math.atan2(-6, -9) },
      village: { x: 4, z: -55.5, yaw: -Math.PI / 2 }, tree: { x: 11, z: -68.5, yaw: Math.PI }, keep: { x: -15, z: -75.5, yaw: -Math.PI / 2 }, guild: GUILD_SITE.view,
      // the abyss: out on the lookout facing the river's falls; at the brink among the falls; at the foot of the path up to its rim
      abyss: (() => { const t = AB.spur.tip, b = AB.spur.base, k = 0.55; return { x: b[0] + (t[0] - b[0]) * k, z: b[1] + (t[1] - b[1]) * k, yaw: Math.atan2(t[0] - b[0], t[1] - b[1]) }; })(),
      brink: { x: 5, z: 60.5, yaw: -0.35 },
      rim: { x: CL2.bottom[0] - 2.5, z: CL2.bottom[1] - 2, yaw: 0 },
      // on the walk round the rim, facing across the pit: east, west, and at the top of the path up (north-east)
      ...Object.fromEntries([['abyssEast', -35], ['abyssWest', 160], ['abyssNorth', -58]].map(([k, deg]) => {
        const a = deg * Math.PI / 180, r = AB.walkR(a), x = ABYSS.x + Math.cos(a) * r, z = ABYSS.z + Math.sin(a) * r;
        return [k, { x, z, yaw: Math.atan2(ABYSS.x - x, ABYSS.z - z) }];
      })),
      start: { x: spawn.x, z: spawn.z, yaw: spawn.yaw },
      ...Object.fromEntries(warps.map(w => ['warp-' + w.key, { x: w.stand[0], z: w.stand[1], yaw: w.yaw }])),      // beside each warp stone
      bridge: { x: AB.span.mid[0], z: AB.span.mid[1], yaw: 0 },              // the middle of the rope bridge, looking out over the pit
      falls: { x: fall.x + 5, z: fall.z + 13, yaw: Math.atan2(-5, -13) },
    },
    stats: { trees: plants.filter(p => p.kind === 'tree').length, bushes: plants.filter(p => p.kind === 'bush').length, cards, forestDraws: draws, rocks: rocks.children.length },
    ripple, sim, optics, waterLevelAt: (x, z) => WL,
    // what the scene editor (scene-editor.js) works with
    editor: {
      key: VALLEY_EDIT_KEY, box: WAYS_BOX, heightAt: HV, items: editItems, ramps: V.ramps.map(r => r.line.map(c => [c[0], c[1]])),
      paths: () => JSON.parse(JSON.stringify(EDITS.paths || DEF_PATHS)), yards: () => JSON.parse(JSON.stringify(EDITS.yards || DEF_YARDS)),
      defaults: { paths: () => JSON.parse(JSON.stringify(DEF_PATHS)), yards: () => JSON.parse(JSON.stringify(DEF_YARDS)) },
      removed: [...EDITS.removed], moved: Object.fromEntries(EDITS.moved), added: JSON.parse(JSON.stringify(EDITS.added)), dabs: EDITS.dabs.map(d => [...d]),
      drawWays,
      // one dab of the brush, shown at once: the ground is repainted, and the grass there is laid low or let back up (the grass
      // itself, its colour and the shade on it are made again in full when the scene loads with the edits saved)
      stamp(x, z, r, what) {
        stampDab([x, z, r, what]);
        const { data, size, radius, center } = map, span = radius * 2, reach = r + 1.2;
        const i0 = Math.max(0, Math.floor((x - reach - center[0] + radius) / span * size)), i1 = Math.min(size - 1, Math.ceil((x + reach - center[0] + radius) / span * size));
        const j0 = Math.max(0, Math.floor((z - reach - center[1] + radius) / span * size)), j1 = Math.min(size - 1, Math.ceil((z + reach - center[1] + radius) / span * size));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const px = center[0] - radius + (i + 0.5) / size * span, pz = center[1] - radius + (j + 0.5) / size * span, o = (j * size + i) * 4 + 3;
          const f = 1 - ss(r - 0.2, r + 1.0, Math.hypot(px - x, pz - z));
          data[o] = what === 2 ? Math.max(data[o], Math.round(230 * f)) : Math.min(data[o], Math.round(255 * (1 - f)));
        }
        grassDirty = true;
      },
      // the grass picture is big: it is sent to the graphics card a few times a second at most, not once a dab
      flush() { if (grassDirty) { grassDirty = false; map.texture.needsUpdate = true; } },
      walkable,
      // while editing: the grass is put away (the ground shows), and the trees too when it is the ways being worked on
      show({ grass: g = true, trees = true } = {}) { grass.visible = g; group.traverse(o => { if (o.userData.forest) o.visible = trees; }); },
    },
    addUnderwater(obj) { obj.traverse(o => o.layers.enable(W.UNDERWATER)); },
    update(renderer, dt, scene = null, camera = null) {
      lastRenderer = renderer;
      if (mill) mill.update(dt);
      if (wheel) wheel.rotation.x -= dt * 0.9;
      if (span) {                                                          // the rope bridge sways, more while she is on it
        span.k += ((walker && deckAt(walker.x, walker.z) === span.deck ? 1 : 0) - span.k) * Math.min(1, dt * 1.5);
        const t = N._internal.shared.uTime.value;
        span.swing.rotation.x = 0.0016 * Math.sin(t * 0.7) + span.k * (0.0035 * Math.sin(t * 1.9) + 0.0015 * Math.sin(t * 3.1));
      }                             // the stream turns the wheel: its lowest paddles go with the water
      guild.update(dt, camera);                                            // the hall opens up while she is inside it
      for (const w of warpStones) w.update(N._internal.shared.uTime.value);
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
        const ground = HVD(x, z), depth = waterDepthAt(x, z);
        if (depth > 0.03 && y <= ground + depth) { ripple(x, z, 2.4, 0.36); return true; }
        if (y <= ground) return false;
      }
      return false;
    },
    follow(pos, lookDir) {
      walker = pos;
      const zk = DPT.layerAt(pos.x, pos.z);
      if (zk !== zone) setZone(zk);
      guild.follow(pos);
      grass.userData.follow(pos, lookDir);
      W.WATER_WAKE.track(pos.x, pos.z, waterDepthAt(pos.x, pos.z));
      sim.focus(pos.x, pos.z);
      const wy = HVD(pos.x, pos.z), dry = waterDepthAt(pos.x, pos.z) < 0.05;
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


