// pit-level.js  —  the abyss drawn by hand as a heightmap  (?map=pit)
//
// One job: to try shaping land by hand instead of by formulas. The land is a picture (assets/heightmaps/abyss-pit.png,
// 16-bit grey: white high, black low), painted and then given hard-edged terraces; the game reads it and lays the meadow's
// own things over it: the land's paint (the valley's strata on the walls, fading into the pit's mist), the ground picture and
// the fluffy grass, trees on the rim and on the shelves, the abyss's clouds. No water yet, no rocks.
//
// The picture covers SIZE metres square; black is DEPTH metres under white. The .bin beside it is the same picture as raw
// 16-bit numbers (513 x 513, little-endian), because a browser reads a PNG only to 8 bits: too coarse for gentle ground.
// To change the land: paint a new PNG, then make its .bin (see README, "The pit drawn by hand").
//
//   const level = await buildPitLevel({ far, sun, grassCount, onStep });     // the same shape as the other levels

import * as THREE from 'three';
import * as N from './stylized-nature.js';
import * as T from './stylized-terrain.js';
import * as G from './stylized-grassfield.js';
import { createAbyssClouds } from './abyss-scene.js';

const { mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const PIT_MAP = {
  file: './assets/heightmaps/abyss-pit.bin', cells: 513,
  size: 110,          // metres the picture covers (the pit itself is then about 80 m across, as the valley's is)
  depth: 60,          // metres from black to white
  rim: 15,            // the height the rim (the white round the pit, about 0.93) comes to, as in the valley
  eye: { below: 0.02, y: -140 },      // the black in the middle: a shaft, not a floor
  // the pit, as the picture has it: its middle, the brink, and the shelves (metres in from the brink, and their height)
  centre: [1.4, -0.5], brink: 39.2,
  shelves: [{ u0: 0.6, u1: 7.0 }, { u0: 7.6, u1: 14.0 }, { u0: 14.6, u1: 20.8 }, { u0: 21.4, u1: 27.2 }],
  spawn: { x: 0, z: 47, yaw: Math.PI },
};
const TRUNK = { broadleaf: 0.42, oak: 0.55, pine: 0.38, birch: 0.24, sapling: 0.2 }, TREE_H = { broadleaf: 7.5, oak: 7.5, pine: 7.5, birch: 8, sapling: 4 };

export async function buildPitLevel({ seed = 5, far = '#cde6f2', grassCount = 150000, sun = [-0.45, 0.62, 0.64], onStep = async () => {} } = {}) {
  const M = PIT_MAP, half = M.size / 2, FR = half, n = M.cells;
  const group = new THREE.Group(); group.name = 'pit';

  // ------------------------------------------------------------------ the land: read from the picture
  await onStep('อ่านแผนที่ความสูง');
  const raw = new Uint16Array(await (await fetch(M.file)).arrayBuffer());
  const level = v => v < M.eye.below ? M.eye.y : M.rim + (v - 0.93) * M.depth;      // (the eye's black: straight down)
  const px = (i, j) => level(raw[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))] / 65535);
  const heightFn = (x, z) => {                                             // bilinear between the picture's points
    const fx = (x + half) / M.size * (n - 1), fz = (z + half) / M.size * (n - 1), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (px(i, j) * (1 - u) + px(i + 1, j) * u) * (1 - v) + (px(i, j + 1) * (1 - u) + px(i + 1, j + 1) * u) * v;
  };
  const field = G.createHeightField({ radius: FR, cells: 440, heightFn });
  const H = field.heightAt;
  const slope = (x, z) => Math.hypot(H(x + 0.5, z) - H(x - 0.5, z), H(x, z + 0.5) - H(x, z - 0.5));
  const [CX, CZ] = M.centre, fromMid = (x, z) => Math.hypot(x - CX, z - CZ);
  const colliders = [], cameraTrunks = [], shade = [], bare = [], press = [], casters = [], plants = [];

  // ------------------------------------------------------------------ trees: a forest round the rim, saplings and pines on the shelves
  await onStep('ปลูกต้นไม้');
  {
    const r = mulberry32(seed * 31), placed = [];
    const flat = (x, z, k) => Math.max(slope(x, z), slope(x + k, z), slope(x - k, z), slope(x, z + k), slope(x, z - k)) < 0.35;
    const clear = (x, z, d) => placed.every(([px, pz, pd]) => Math.hypot(x - px, z - pz) > d + pd);
    const tree = (x, z, type, scale) => {
      const y = H(x, z), rad = TRUNK[type] * scale;
      plants.push({ kind: 'tree', type, seed: 100 + plants.length, detail: 0.8, x, y: y - 0.05, z, rotY: r() * 6.28, scale });
      placed.push([x, z, rad * 4]);
      colliders.push([x, z, rad + 0.22]); cameraTrunks.push([x, z, rad + 0.12, y, y + TREE_H[type] * scale]);
      shade.push([x, z, 4 * scale, 0.4]); bare.push([x, z, rad * 1.5]); casters.push([x, z, TREE_H[type] * scale, 2.4 * scale, 0.7]);
    };
    const bush = (x, z, scale) => { placed.push([x, z, 1]); plants.push({ kind: 'bush', type: r() < 0.35 ? 'flowering' : 'round', seed: 100 + plants.length, x, y: H(x, z), z, rotY: r() * 6.28, scale }); colliders.push([x, z, 0.7 * scale]); };
    // the rim: thick towards the map's edge, kept back from the brink (a walk round it) and from where she starts
    for (let i = 0; i < 900 && plants.length < 90; i++) {
      const x = (r() - 0.5) * 2 * (half - 4), z = (r() - 0.5) * 2 * (half - 4), d = fromMid(x, z) - M.brink;
      if (d < 7 + r() * 4 || Math.hypot(x - M.spawn.x, z - M.spawn.z) < 7 || !flat(x, z, 2) || !clear(x, z, 1.5)) continue;
      const pick = r(), type = pick < 0.42 ? 'pine' : pick < 0.72 ? 'oak' : pick < 0.9 ? 'broadleaf' : 'birch';
      tree(x, z, type, 0.9 + r() * 0.5);
    }
    // the shelves: small trees and bushes, set back from the drop in front
    for (let k = 0; k < M.shelves.length; k++) for (let i = 0; i < 70; i++) {
      const S = M.shelves[k], a = r() * Math.PI * 2, u = S.u0 + 1.4 + r() * (S.u1 - S.u0 - 3.2), d = M.brink - u;
      const x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d;
      if (!flat(x, z, 1.4) || !clear(x, z, 1.2)) continue;
      const pick = r();
      if (pick < 0.45) bush(x, z, 0.8 + r() * 0.5); else tree(x, z, pick < 0.7 ? 'sapling' : 'pine', 0.75 + r() * 0.4);
    }
  }

  // ------------------------------------------------------------------ the ground picture, the land, the grass
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    if (Math.abs(x) > FR - 0.5 || Math.abs(z) > FR - 0.5) return [0, 0, 0];
    const earth = ss(0.7, 1.1, slope(x, z));                                // the walls: bare (no grass grows on them)
    return [earth, 0, 0];
  };
  const L = new THREE.Vector3(...sun).normalize();
  const sunShadows = dir => {
    L.copy(dir).normalize();
    const dxz = Math.hypot(L.x, L.z) || 1, ly = Math.max(0.3, L.y), ux = -L.x / dxz, uz = -L.z / dxz, len = dxz / ly;
    return casters.map(([x, z, h, r, st]) => [x + ux * len * h / 2, z + uz * len * h / 2, len * h / 2 + r, r * 1.1, ux, uz, st, 0]);
  };
  const map = G.createGroundMap({ radius: FR, size: 1024, seed, heightAt: H, dirt: 0, shade, bare, press, paint, cast: sunShadows(L.clone()) });
  const fade = { far, fadeA: FR * 0.86, fadeB: FR * 0.99 };
  // the land itself, in the valley's paint: grass on the flat, the strata on the walls, and down the pit into its mist and dark
  const terrain = G.createTerrain(field, map, fade);
  terrain.material.dispose();
  {
    const g = terrain.geometry, count = g.attributes.position.count;
    g.setAttribute('aBank', new THREE.BufferAttribute(new Float32Array(count).fill(10), 1));      // (no water: no beach anywhere)
    g.setAttribute('aPath', new THREE.BufferAttribute(new Float32Array(count), 1));
    g.computeVertexNormals();
    terrain.material = T._terrain.terrainMaterial(far, [FR, FR], 0);
    terrain.material.uniforms.uDeepOn.value = 1;
  }
  group.add(terrain);
  await onStep('ปลูกหญ้า');
  const grass = G.createFollowGrass({ map, field, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade });
  group.add(grass);
  if (plants.length) group.add(N.createForest(plants));

  // ------------------------------------------------------------------ the abyss's clouds, on the shelves and over the eye
  {
    const ledges = M.shelves.map((S, k) => ({ y: H(CX + M.brink - (S.u0 + S.u1) / 2, CZ), u0: S.u0, u1: S.u1 }));
    const clouds = createAbyssClouds({ centre: [CX, CZ], rimR: () => M.brink, ledges, falls: [], count: 120 });
    clouds.group.userData = { dispose: clouds.dispose };
    group.add(clouds.group);
  }

  // ------------------------------------------------------------------ the sun: the shadows on the ground follow it (drawn in the background)
  let castSun = L.clone(), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false;
  const cast = { dir: castSun.clone(), k: 1 };
  const inMap = (x, z) => Math.abs(x) < FR - 3 && Math.abs(z) < FR - 3;
  const walkable = (x, z) => inMap(x, z) && slope(x, z) < 0.85 && H(x, z) > M.rim - 3;      // (the rim only: the shelves are seen, not walked, for now)
  console.info('[pit] trees and bushes', plants.length);
  group.userData = { kind: 'pit', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); map.dispose(); field.texture.dispose(); } };
  const brinkView = (deg, back = 4) => { const a = deg * Math.PI / 180, d = M.brink + back; return { x: CX + Math.cos(a) * d, z: CZ + Math.sin(a) * d, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) }; };
  const views = { start: M.spawn, 'pit-north': brinkView(-90), 'pit-east': brinkView(0), 'pit-west': brinkView(180) };
  const optics = { quality: 0, setQuality() {} };                          // (no water yet)
  return {
    group, map, field, grass, terrain, heightAt: H, standAt: H, waterDepthAt: () => 0, colliders, crowns: [], cameraTrunks, spawn: M.spawn, radius: FR - 3, walkable, views,
    keepClear: (x, z) => slope(x, z) > 0.6,
    name: 'หลุม (heightmap)', stats: { trees: plants.length },
    optics, waterLevelAt: () => -1e4, ripple() {}, tapWater() { return false; }, addUnderwater() {},
    confine(p) {                                                           // on the rim, off the walls
      if (walkable(p.x, p.z)) return;
      for (let r = 0.15; r <= 3; r += 0.15) for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos(a * Math.PI / 6) * r, z = p.z + Math.sin(a * Math.PI / 6) * r;
        if (walkable(x, z)) { p.x = x; p.z = z; return; }
      }
    },
    update() {
      const nowT = N._internal.shared.uTime.value;
      if (castBusy) { if (map.stepCast(2.5)) { castBusy = false; lastCast = nowT; cast.dir.copy(castSun); } }
      else if (nowT - lastCast > 4 && (castSun.angleTo(wantSun) > 0.075 || Math.abs(castK - wantK) > 0.12)) { castSun.copy(wantSun); castK = wantK; castBusy = true; map.beginCast(sunShadows(castSun), castK); }
    },
    setSun(dir, k = 1) { wantSun.copy(dir); wantK = k; cast.k = Math.min(1, k * 1.2); },
    get sunCast() { return cast; },
    follow(pos, lookDir) { grass.userData.follow(pos, lookDir); },
  };
}
