// valley-level.js
// The waterfall valley as a walkable map: a river runs down a cliff-walled valley from a waterfall at its head.
// The land itself (cliffs, sand banks, waterfall, upper river, bridge) comes from stylized-terrain.js; this file
// dresses it and plugs in the game's systems: the clear water, the fluffy grass, the forest batches.
//
//   const level = await buildValleyLevel({ far, deer, onStep });      // same result object as the other maps
//   level.confine(p)   keeps a walker on the valley floor (the cliffs are walls)

import * as THREE from 'three';
import * as N from './stylized-nature.js';
import * as T from './stylized-terrain.js';
import * as A from './stylized-animals.js';
import * as G from './stylized-grassfield.js';
import * as W from './stylized-water.js';
import { createAnimeCells } from './anime-cells.js';
import { createWaterDroplets } from './water-droplets.js';
import { createWaterfall } from './stylized-waterfall.js';

const { mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export async function buildValleyLevel({ seed = 1, far = '#cde6f2', deer = null, grassCount = 150000, sun = [-0.4, 0.9, 0.5], onStep = async () => {} } = {}) {
  const group = new THREE.Group();
  group.name = 'valleyLevel';
  const rng = mulberry32(seed * 977 + 3);
  const R = (a, b) => a + rng() * (b - a);

  // ------------------------------------------------------------------ the land
  await onStep('ปั้นหุบเขาและหน้าผา');
  const V = T.createValley({ seed, far, path: false, bridge: true, skirt: true });
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
  const H = V.surfaceAt;                                                  // ground, or the bridge deck
  const waterDepthAt = (x, z) => (!lower(x, z) || H(x, z) > HV(x, z) + 0.01) ? 0 : Math.max(0, WL - HV(x, z));
  await onStep('วัดความสูงพื้น');
  const field = G.createHeightField({ radius: FR, center: [CX, CZ], cells: 340, heightFn: HV });
  const Hf = field.heightAt;                                             // cheap copy of the height, for painting
  const slopeF = (x, z) => { const e = 0.6, hx = (Hf(x + e, z) - Hf(x - e, z)) / (2 * e), hz = (Hf(x, z + e) - Hf(x, z - e)) / (2 * e); return 1 - 1 / Math.sqrt(1 + hx * hx + hz * hz); };

  // where a walker may be: the valley floor between the two cliff feet, below the head wall, short of the map's end
  const Z_HEAD = fall.z + 2.5, Z_END = B.z1 - 7;
  const confine = p => {
    p.z = Math.min(Z_END, Math.max(Z_HEAD, p.z));
    for (let i = 0; i < 2; i++) {
      const cx = rx(p.z), lim = V.cliffLine(p.x, p.z) - 1.0, dx = p.x - cx;
      if (Math.abs(dx) > lim) p.x = cx + Math.sign(dx) * lim;
    }
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
  // dense forest on the heights (seen from below, so light on leaf cards), bushes only at tree feet
  for (let i = 0; i < 2600; i++) {
    const x = R(B.x0 + 2, B.x1 - 2), z = R(B.z0 + 2, B.z1 - 2);
    const kind = V.kindAt(x, z);
    if (kind === 'plateau') {
      if (Math.abs(x - V.plateauRiverX(z)) < 5 && !lower(x, z)) continue;         // keep the upper river open
      const pick = rng(), type = pick < 0.4 ? 'pine' : pick < 0.75 ? 'oak' : 'broadleaf', sc = R(1.0, 1.55);
      if (clear(x, z, CROWN[type] * sc * 0.36)) tree(type, x, z, sc, type === 'pine' ? 0.22 : 0.28, rng() < 0.12);
    } else if (kind === 'floor' && onFloor(x, z, 1.5)) {
      const adx = Math.abs(x - rx(z)), foot = V.cliffLine(x, z) - adx;                // metres to the cliff foot
      if (rng() > (foot < 7 ? 0.75 : 0.1)) continue;
      const pick = rng(), type = pick < 0.4 ? 'broadleaf' : pick < 0.65 ? 'oak' : pick < 0.85 ? 'birch' : 'sapling', sc = R(0.85, 1.2);
      if (clear(x, z, CROWN[type] * sc * 0.55)) tree(type, x, z, sc, 0.85, rng() < 0.6);
    }
  }

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

  // ------------------------------------------------------------------ ground colour map: where grass grows
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    const h = Hf(x, z), low = lower(x, z);
    const sand = low ? 1 - ss(0.35, 0.8, h - WL) : 1 - ss(-0.2, 0.25, h - V.levels.plateauWater);
    const earth = ss(0.14, 0.24, slopeF(x, z));                           // cliffs and steep ledges: rock, no grass
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
    const PLW = V.levels.plateauWater, upRows = [];
    for (let z = B.z0; z <= fall.z - 1.25; z += 0.6) upRows.push([V.plateauRiverX(z), z, PLW, 2.3]);
    const ug = flowRibbon(upRows, 14, 1.6);
    upperWater = new THREE.Mesh(ug, W.waterMaterial({ field, animeCells, foamTexture, far, fadeA: FR * 0.9, fadeB: FR * 1.2 }));
    upperWater.name = 'clearWaterUpper';
    upperWater.renderOrder = 1;
    upperWater.userData = { kind: 'water', dispose() { ug.dispose(); upperWater.material.dispose(); } };
    group.add(upperWater);
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
  let frameNo = 0, nextSplash = 0, lastRenderer = null;
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
  const aimWalkerShadow = () => { cast.dir.copy(castSun); walkerShadow.rotation.y = Math.atan2(-SU[1], SU[0]); walkerShadow.scale.set(1.35 + 0.55 / LY, 1, 0.8); };
  walkerShadow.name = 'walkerShadow'; walkerShadow.renderOrder = 3; walkerShadow.visible = false;
  aimWalkerShadow();                                                                       // long side along the shadow direction
  group.add(walkerShadow);
  group.userData = { kind: 'valleyLevel', dispose() { group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); }); map.dispose(); field.texture.dispose(); } };
  console.info('[valley] trees', plants.filter(p => p.kind === 'tree').length, 'rocks', rocks.children.length, 'leaf cards', cards);
  return {
    group, map, field, grass, terrain, heightAt: H, waterDepthAt, colliders, crowns, cameraTrunks, spawn, radius: 1e4, confine,
    stats: { trees: plants.filter(p => p.kind === 'tree').length, bushes: plants.filter(p => p.kind === 'bush').length, cards, forestDraws: draws, rocks: rocks.children.length },
    ripple, sim, optics, waterLevelAt: (x, z) => WL,
    addUnderwater(obj) { obj.traverse(o => o.layers.enable(W.UNDERWATER)); },
    update(renderer, dt, scene = null, camera = null) {
      lastRenderer = renderer;
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
    useRealShadow(on) { realShadow = !!on; },
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
      // with the real shadow on the ground, the soft patch is only a stand-in over grass: the blades cover the ground there
      const run = Math.min(SLEN, 2.5) * 0.8, px = pos.x + SU[0] * run, pz = pos.z + SU[1] * run;
      const lawn = realShadow ? Math.min(1, Math.max(0, (map.grassAt(px, pz) - 0.1) / 0.4)) : 1;
      walkerShadow.material.opacity = cast.k * lawn;
      walkerShadow.visible = dry && cast.k * lawn > 0.02;
      if (walkerShadow.visible) walkerShadow.position.set(px, wy + 0.3, pz);
      waterfall.update(lastRenderer);
      // the falls keep the plunge pool restless: rings run out from where the sheet lands
      const now = N._internal.shared.uTime.value;
      if (now > nextSplash) {
        ripple(fall.x + (Math.random() - 0.5) * 3.2, fall.z + 1.7 + Math.random() * 0.8, 1.6, 0.4, 'plain');
        nextSplash = now + 0.16;
      }
    },
  };
}


