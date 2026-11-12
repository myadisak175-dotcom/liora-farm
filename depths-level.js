/* ==========================================================================
   depths-level.js  —  one layer of the abyss's depths, as a scene of its own  (?map=depths&layer=1|2|3)

   The valley is too much for a phone to hold along with what lies under it, so each layer down the abyss is loaded on its
   own: a warp stone up on the rim (and one in each layer) leads from scene to scene. Where things are and how the land lies
   comes from abyss-depths.js; this file builds the one layer asked for into a level index.html can run, the same way the
   other maps are: its land (the valley's terrain paint), a ground picture and the fluffy grass, the clear water with its
   waves, the falls, clouds, floating rocks, what grows there, and the layer's warp stone.

     const level = await buildDepthsLevel({ layer: 2, far, grassCount, onStep });
     scene.add(level.group);  level.update(renderer, dt, scene, camera);  level.follow(player.position, lookDir);
     level.warps        where the warp stone leads (see warp-ui.js)       level.zone   which layer this is (0, 1, 2)
   ========================================================================== */
import * as THREE from 'three';
import * as N from './stylized-nature.js';
import * as T from './stylized-terrain.js';
import * as G from './stylized-grassfield.js';
import * as W from './stylized-water.js';
import { createAnimeCells } from './anime-cells.js';
import { createWaterDroplets } from './water-droplets.js';
import { createWaterfall } from './stylized-waterfall.js';
import { _abyss } from './abyss-scene.js';
import * as DP from './abyss-depths.js';
import { rockLandMaterial } from './stylized-rockface.js';
import * as RB from './rock-blocks.js';

const { mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const CROWN_Y = { broadleaf: 5.7, oak: 5.2, pine: 5.6, birch: 6.6, sapling: 3.4 }, CROWN_R = { broadleaf: 2.9, oak: 3.5, pine: 2.3, birch: 2.0, sapling: 1.3 };
const TRUNK = { broadleaf: 0.42, oak: 0.55, pine: 0.38, birch: 0.24, sapling: 0.2 }, CROWN = { broadleaf: 4.2, oak: 5.2, pine: 3.0, birch: 2.6, sapling: 2.0 };
const ROCK_R = { boulder: 1.0, slab: 1.3, standing: 0.5, crag: 1.5, stones: 0.8, river: 0.7, pebbles: 0 };
const PALS = [['#f4a6bc', '#f6f2e6'], ['#f7d84a', '#f6f2e6'], ['#b9a3e8', '#93b8ee'], ['#f6f2e6', '#f7d84a'], ['#93b8ee', '#f6f2e6']];

export async function buildDepthsLevel({ layer = 1, seed = 1, far = '#cde6f2', grassCount = 150000, onStep = async () => {} } = {}) {
  const WL = 0, k = Math.min(DP.DEPTH_NAMES.length, Math.max(1, Math.round(layer) || 1)) - 1;
  await onStep('วัดความสูงพื้น');
  const D = DP.createDepths({ WL, seed, only: DP.DEPTH_NAMES[k].key }), L = D.layers[k];
  const [x0, x1, z0, z1] = L.box, CX = (x0 + x1) / 2, CZ = (z0 + z1) / 2, FR = Math.max(x1 - x0, z1 - z0) / 2 + 8;
  const H = L.heightAt;                                                    // (past the layer's edge: the height at the edge)
  const group = new THREE.Group();
  group.name = 'depths-' + L.key;
  const field = G.createHeightField({ radius: FR, center: [CX, CZ], cells: Math.round(FR * 4), heightFn: H });
  const colliders = [], crowns = [], cameraTrunks = [], shade = [], bare = [], press = [], plants = [];
  const rocks = new THREE.Group();
  const waterDepthAt = (x, z) => D.wetAt(x, z) ? Math.max(0, WL - H(x, z)) : 0;
  const walkable = D.walkable;
  const [wx, wz] = L.warp, spawn = { x: wx + Math.sin(L.yaw) * 2.4, z: wz + Math.cos(L.yaw) * 2.4, yaw: L.yaw };

  // ------------------------------------------------------------------ what grows and lies about
  await onStep('วางต้นไม้และก้อนหิน');
  {
    let ds = seed * 53;
    const drng = mulberry32(seed * 131 + 7);
    for (const t of L.trees) {
      const y = H(t.x, t.z), sc = t.scale, ty = t.type;
      plants.push({ kind: 'tree', type: ty, seed: ++ds, detail: 0.8, x: t.x, y: y - 0.05, z: t.z, rotY: drng() * 6.28, scale: sc });
      if (t.loose) continue;                                               // (out on a stack in the clouds: nobody gets there)
      colliders.push([t.x, t.z, TRUNK[ty] * sc + 0.22]);
      cameraTrunks.push([t.x, t.z, TRUNK[ty] * sc + 0.12, y, y + CROWN_Y[ty] * sc]);
      crowns.push([t.x, y + CROWN_Y[ty] * sc, t.z, CROWN_R[ty] * sc]);
      shade.push([t.x, t.z, CROWN[ty] * sc * 1.05, 0.55]); bare.push([t.x, t.z, TRUNK[ty] * sc * 1.5]);
    }
    for (const b of L.bushes) {
      plants.push({ kind: 'bush', type: drng() < 0.35 ? 'flowering' : 'round', seed: ++ds, x: b.x, y: H(b.x, b.z), z: b.z, rotY: drng() * 6.28, scale: b.scale });
      colliders.push([b.x, b.z, 0.75 * b.scale]); shade.push([b.x, b.z, 1.7 * b.scale, 0.45]);
    }
    for (const r of L.rocks) {
      const m = N.createRock({ type: r.type, seed: ++ds }), rad = ROCK_R[r.type] * r.scale;
      m.position.set(r.x, H(r.x, r.z) - 0.2 * r.scale, r.z); m.rotation.y = drng() * 6.28; m.scale.setScalar(r.scale);
      rocks.add(m);
      if (rad > 0) { colliders.push([r.x, r.z, rad]); press.push([r.x, r.z, rad * 1.6]); shade.push([r.x, r.z, rad * 2.0, 0.35]); }
    }
    for (const i of L.islands) if (i.tree) plants.push({ kind: 'tree', type: i.tree, seed: ++ds, detail: 0.7, x: i.x + 0.4, y: i.y + 0.25, z: i.z - 0.3, rotY: drng() * 6.28, scale: 0.9 });
    if (L.key === 'gorge') for (let n = 0; n < L.ribbons[0].rows.length; n += 5) { const q = L.ribbons[0].rows[n]; shade.push([q[0], q[1], 11, 0.5]); }      // the gorge lies in shadow
    colliders.push([wx, wz, 0.5]); bare.push([wx, wz, 2.0]); press.push([wx, wz, 3.2]);
  }

  // ------------------------------------------------------------------ the ground picture, the land, the grass
  await onStep('ระบายสีพื้น');
  const inBox = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  const map = G.createGroundMap({ radius: FR, center: [CX, CZ], size: 768, seed, heightAt: field.heightAt, dirt: 0, shade, bare, press, paint: (x, z) => (inBox(x, z) && D.paint(x, z)) || [1, 0, 0] });
  const landMat = new URLSearchParams(location.search).get('rock') === 'old' ? T._terrain.terrainMaterial(far, [1e5, 1e5], 0) : rockLandMaterial({ far });      // ?rock=old: the land's old banded paint, to compare
  const terrain = new THREE.Mesh(DP.layerGeometry(L, D), landMat);
  terrain.name = 'depthsLand';
  terrain.userData.dispose = () => { terrain.geometry.dispose(); landMat.dispose(); };
  group.add(terrain);
  // the rock faces: built of broken blocks stood in front of the land's walls (rock-blocks.js); ?rock=old: the walls bare
  if (new URLSearchParams(location.search).get('rock') !== 'old') {
    const nearWarp = (x, z) => Math.hypot(x - wx, z - wz) > 4;
    const { list, colliders: bc } = RB.faceBlocks({ x0, z0, nx: L.nx, nz: L.nz, step: 0.5, h: L.h, seed: seed + k * 7, keep: nearWarp });
    const blocks = RB.createRockBlocks(list);
    group.add(blocks);
    for (const c of bc) colliders.push(c);
    console.info('[depths] rock blocks', list.length, 'triangles', blocks.geometry.attributes.position.count / 3);
  }
  for (const i of L.islands) { const m = new THREE.Mesh(DP.floatingRock(i), landMat); m.position.set(i.x, i.y, i.z); m.userData.dispose = () => m.geometry.dispose(); group.add(m); }

  // ------------------------------------------------------------------ water: the same clear water as the valley's, on ribbons over the ponds and streams
  await onStep('วาดริ้วฟองน้ำ');
  const foamTexture = await W.loadFoamTexture();
  await onStep('เติมน้ำ');
  const animeCells = createAnimeCells();
  const droplets = createWaterDroplets({ time: N._internal.shared.uTime });
  droplets.points.userData.dispose = droplets.dispose;
  group.add(droplets.points);
  const flowRibbon = (rows, across) => {
    const pos = [], flow = [], dir = [], idx = [];
    let F = 0;
    for (let n = 0; n < rows.length; n++) {
      const s = rows[n], a = rows[Math.max(0, n - 1)], b = rows[Math.min(rows.length - 1, n + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const half = s[3], streaminess = 1 - ss(3.6, 6.2, s[3]);
      if (n > 0) F += Math.hypot(s[0] - a[0], s[1] - a[1]) * W.FLOW.pond / lerp(W.FLOW.pond, W.FLOW.stream, streaminess);
      for (let i = 0; i <= across; i++) { const u = -1 + 2 * i / across, x = s[0] - tz * u * half, z = s[1] + tx * u * half; pos.push(x, s[2], z); flow.push(F, u * half, streaminess); dir.push(tx, tz); }
    }
    const row = across + 1;
    for (let n = 0; n < rows.length - 1; n++) for (let i = 0; i < across; i++) { const a = n * row + i, b = a + row; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setIndex(idx);
    return g;
  };
  const sim = W.createWaterSim({ rect: [spawn.x - 24, spawn.z - 24, 48], size: 512, field, foamTexture, level: WL, follow: true });
  const optics = W.createWaterOptics({ level: WL });
  const waterMat = W.waterMaterial({ field, animeCells, sim, optics, foamTexture, far, fadeA: 1e5, fadeB: 2e5 });
  const waters = L.ribbons.map(r => {
    const m = new THREE.Mesh(flowRibbon(r.rows, r.along === 'line' ? 10 : 18), waterMat);
    m.renderOrder = 1; m.name = 'water';
    m.userData = { kind: 'water', dispose() { m.geometry.dispose(); } };
    group.add(m);
    return m;
  });
  group.userData.disposeWater = () => { waterMat.dispose(); sim.dispose(); optics.dispose(); };
  const falls = L.falls.map(f => {
    const c = createWaterfall({ x: 0, z: 0, top: f.top, bottom: f.bottom - 0.25, width: f.width, forward: f.forward, scale: f.scale ?? 0.6, foamTexture, cells: animeCells });
    c.group.position.set(f.x, 0, f.z); c.group.rotation.y = f.yaw;
    c.group.userData = { kind: 'waterfall', dispose: c.dispose };
    group.add(c.group);
    return c;
  });
  let pads3d = null;
  if (L.pads.length) { pads3d = W.createLilyPads({ pads: L.pads, seed, sim }); group.add(pads3d); }
  // something touches the water: a splash (a tap, a jump), a footstep ('step'), or a plain dip ('plain')
  const ripple = (x, z, strength = 1, radius = 0.26, mode = null) => {
    const kk = W.WATER_TUNE.ripple.value, foam = W.WATER_TUNE.splashFoam.value, drop = W.WATER_TUNE.drops.value;
    if (mode === 'plain') sim.impulse(x, z, radius, -0.03 * strength * kk);
    else if (mode === 'splash' || (mode === null && strength >= 1.5)) {
      if (sim.inside(x, z)) W.WATER_RINGS.add(x, z, Math.min(2, 0.7 * strength));
      sim.impulse(x, z, radius, 0.012 * strength * kk * W.WATER_TUNE.splashBump.value, Math.min(1, 0.4 * strength) * foam);
      if (drop > 0 && sim.inside(x, z)) droplets.emit(x, WL, z, strength / 2.4 * drop, Math.round(14 * Math.min(1.5, drop)));
    } else {
      const st = mode === 'step';
      if (st) W.WATER_WAKE.add(x, z, Math.min(1.3, 0.9 * strength));
      sim.impulse(x, z, radius, (st ? -0.042 : -0.03) * strength * kk, -Math.min(st ? 0.15 : 0.55, (st ? 0.18 : 0.75) * strength) * foam);
      if (st && drop > 0 && sim.inside(x, z)) droplets.emit(x, WL, z, 0.16 * drop * strength, strength > 1.2 ? 3 : 2);
    }
  };

  // ------------------------------------------------------------------ cloud, light, leaves, flowers, grass, the warp stone
  await onStep('ปล่อยเมฆลงก้นเหว');
  const sights = [];
  if (L.sea) sights.push(DP.createCloudSea(L.sea));
  if (L.clouds.length) sights.push(DP.cloudPuffs(L.clouds, _abyss.puffMaterial(), [L.sea.x, L.sea.z]));
  if (L.shafts.length) sights.push(DP.createShafts(L.shafts));
  for (const s of sights) group.add(s);
  await onStep('แตกใบ');
  let cards = 0, draws = 0;
  if (plants.length) {
    const f = N.createForest(plants), box = new THREE.Box3();
    for (const q of plants) { box.expandByPoint(new THREE.Vector3(q.x - 7, q.y - 1, q.z - 7)); box.expandByPoint(new THREE.Vector3(q.x + 7, q.y + 17, q.z + 7)); }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    f.children.forEach(m => { m.geometry.boundingSphere = sphere.clone(); m.frustumCulled = true; });
    cards = f.userData.cards; draws = f.userData.drawCalls;
    group.add(f);
  }
  group.add(rocks);
  await onStep('โปรยดอกไม้');
  { let fs = seed * 71; for (const fl of L.flowers) group.add(N.createFlowers({ count: Math.round(42 * fl.rad), radius: fl.rad, seed: ++fs, heightAt: H, center: [fl.x, fl.z], colors: PALS[fs % PALS.length] })); }
  await onStep('ปลูกหญ้า');
  const grass = G.createFollowGrass({ map, field, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), far, fadeA: 1e5, fadeB: 2e5 });
  group.add(grass);
  const warpStone = DP.createWarpStone();
  warpStone.group.position.set(wx, H(wx, wz), wz);
  group.add(warpStone.group);
  // where the stone leads: up to the rim (the valley's scene), or to another layer (its own scene)
  const warps = [{ key: 'rim', name: 'ขอบห้วงลึก', scene: { view: 'warp-rim' } },
    ...DP.DEPTH_NAMES.map((d, i) => i === k ? { key: d.key, name: d.name, x: wx, z: wz, yaw: L.yaw, stand: [spawn.x, spawn.z] } : { key: d.key, name: d.name, scene: { map: 'depths', layer: i + 1 } })];

  terrain.layers.enable(W.UNDERWATER);
  rocks.traverse(o => o.layers.enable(W.UNDERWATER));
  const hidden = [...waters, grass, pads3d, droplets.points].filter(Boolean);
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), camWorld = new THREE.Vector3();
  const waterSpheres = L.spheres.map(([x, z, r]) => new THREE.Sphere(new THREE.Vector3(x, WL, z), r));
  let frameNo = 0, lastRenderer = null, hazed = false;
  group.userData = { ...group.userData, kind: 'depthsLevel', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); group.userData.disposeWater(); map.dispose(); field.texture.dispose(); } };
  console.info('[depths]', L.key, 'trees', plants.filter(p => p.kind === 'tree').length, 'rocks', rocks.children.length, 'leaf cards', cards);
  return {
    group, map, field, grass, terrain, heightAt: H, waterDepthAt, colliders, crowns, cameraTrunks, spawn, radius: 1e4, walkable, warps,
    zone: k, name: L.name,
    stats: { trees: plants.filter(p => p.kind === 'tree').length, bushes: plants.filter(p => p.kind === 'bush').length, cards, forestDraws: draws, rocks: rocks.children.length },
    views: { start: spawn },
    ripple, sim, optics, waterLevelAt: () => WL,
    addUnderwater(obj) { obj.traverse(o => o.layers.enable(W.UNDERWATER)); },
    // keeps her on ground she can stand on: a step back from a wall, the brink or deep rock
    confine(p) {
      if (walkable(p.x, p.z)) return;
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
      p.x = spawn.x; p.z = spawn.z;                                        // lost: back beside the warp stone
    },
    update(renderer, dt, scene = null, camera = null) {
      lastRenderer = renderer;
      sim.step(renderer, dt);
      droplets.update(renderer);
      warpStone.update(N._internal.shared.uTime.value);
      for (const c of falls) c.update(renderer);
      if (!scene || !camera) return;
      // the two water pictures cost a redraw of the scene each: only when water is on screen and close enough to matter
      frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      camWorld.setFromMatrixPosition(camera.matrixWorld);
      let near = Infinity;
      for (const sp of waterSpheres) if (frustum.intersectsSphere(sp)) near = Math.min(near, camWorld.distanceTo(sp.center) - sp.radius);
      frameNo++;
      const q = optics.quality;
      const doThrough = near < 42, doMirror = q > 0 && near < 65 && frameNo % (q === 2 ? 2 : 4) === 0;
      if (doThrough || doMirror) optics.render(renderer, scene, camera, hidden, doThrough, doMirror);
    },
    tapWater(origin, dir) {
      for (let t = 1; t < 70; t += 0.25) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
        const ground = H(x, z), depth = waterDepthAt(x, z);
        if (depth > 0.03 && y <= ground + depth) { ripple(x, z, 2.4, 0.36); return true; }
        if (y <= ground) return false;
      }
      return false;
    },
    follow(pos, lookDir) {
      if (!hazed) { hazed = true; N.setHaze(L.haze); }                     // the layer's own air
      grass.userData.follow(pos, lookDir);
      W.WATER_WAKE.track(pos.x, pos.z, waterDepthAt(pos.x, pos.z));
      sim.focus(pos.x, pos.z);
      void lastRenderer;
    },
  };
}
