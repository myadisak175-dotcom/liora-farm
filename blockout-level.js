// blockout-level.js  —  a blockout of a Mondstadt-like landscape (?map=blockout)
//
// One job: the shape of the land, to walk round and judge before anything is dressed. The way a studio starts a place: the land
// in rough (tables of land at different heights with cliffs for sides, ramps between them, a lake, a stream that falls from one
// level to the next), grass and a few trees so the scale reads, the cliffs left as bare grey land and the water as plain blue.
// The rock kit comes after, once the shapes are liked.
//
//   - the meadow, low, rolling, with a lake in its west and a knoll by the lake
//   - table A (8 m): broad, east of the meadow; a ramp up its south-east side; a spring on it whose stream runs west and falls
//     over its edge into the meadow and on into the lake
//   - table B (17 m): north of A, partly standing on it; a ramp up from A
//   - the peak C (32 m): narrow, north-west; a ridge climbs to it from B; one big tree on its top, to be seen from everywhere
//
//   const level = await buildBlockoutLevel({ far, sun, grassCount, onStep });     // the same shape as the other levels

import * as THREE from 'three';
import * as N from './stylized-nature.js';
import * as G from './stylized-grassfield.js';

const { fbm3, mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const BLOCKOUT_MAP = {
  radius: 98, fieldRadius: 128,
  spawn: { x: 40, z: 52, yaw: Math.PI + 0.25 },
  // tables of land: centre, radius (the outline wanders by `wob` of it), height of the top
  mesas: [
    { x: 30, z: -5, r: 30, h: 8, wob: 0.2 },                               // A
    { x: 2, z: -42, r: 26, h: 17, wob: 0.22 },                             // B
    { x: -38, z: -52, r: 12, h: 32, wob: 0.14 },                           // C, the peak
    { x: -46, z: 12, r: 9, h: 4.5, wob: 0.25 },                            // the knoll by the lake
  ],
  face: 0.9,                                                               // half the width of a cliff's face (m): all but upright
  lake: { x: -18, z: 22, r: 15, depth: 1.8, level: -0.45 },
  // ramps: a way up, through the points given, from the height of the land at its foot to the height named at its head
  ramps: [
    { pts: [[60, 24], [52, 15], [44, 6]], top: 8, half: 2.2 },             // meadow -> A
    { pts: [[24, -16], [27, -25], [14, -33]], top: 17, half: 2.0 },        // A -> B
    { pts: [[-10, -38], [-24, -30], [-33, -43]], top: 32, half: 2.0 },     // B -> C, along a ridge
  ],
  stream: [[24, -6], [15, -3], [7, -1], [0.5, 1], [-5, 8], [-11, 15]],     // the spring on A, over the edge, to the lake
};
const TRUNK = { broadleaf: 0.42, oak: 0.55, pine: 0.38, birch: 0.24 }, TREE_H = { broadleaf: 7.5, oak: 7.5, pine: 7.5, birch: 8 };

export async function buildBlockoutLevel({ seed = 11, far = '#cde6f2', grassCount = 160000, sun = [-0.45, 0.62, 0.64], onStep = async () => {} } = {}) {
  const M = BLOCKOUT_MAP, FR = M.fieldRadius, CELLS = 410, STEP = FR * 2 / CELLS;
  const group = new THREE.Group(); group.name = 'blockout';

  // ------------------------------------------------------------------ the land
  await onStep('ปั้นพื้นดิน');
  const meadow = (x, z) => (fbm3(x * 0.03, 0.5, z * 0.03, seed, 3) - 0.5) * 3.2 + (fbm3(x * 0.11, 1.7, z * 0.11, seed + 5, 2) - 0.5) * 0.6 + Math.pow(ss(80, 125, Math.hypot(x, z)), 1.3) * 14;
  const outline = (m, k, x, z) => {                                        // how far inside the table's outline: > 0 inside, metres
    const a = Math.atan2(z - m.z, x - m.x);
    const R = m.r * (1 + m.wob * 2 * (fbm3(Math.cos(a) * 1.3 + k * 3, Math.sin(a) * 1.3, 0.5, seed + 31 + k, 3) - 0.5));
    return R - Math.hypot(x - m.x, z - m.z);
  };
  const mesaAt = (m, k, x, z) => {
    const inside = outline(m, k, x, z);
    const top = ss(-M.face, M.face, inside), apron = ss(-7, 0, inside) * 0.9;      // the cliff, and a little scree at its foot
    return { h: m.h * top + (fbm3(x * 0.06, 2.9, z * 0.06, seed + k, 2) - 0.5) * 1.4 * top, apron, inside };
  };
  // the ramps, as lines with a length along them
  const ramps = M.ramps.map(r => {
    const pts = r.pts, segs = [];
    let L = 0;
    for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az); segs.push({ ax, az, bx, bz, l, at: L }); L += l; }
    return { ...r, segs, L, foot: 0 };
  });
  const nearRamp = (r, x, z) => {                                          // [distance from its line, how far along it (0..1)]
    let best = 1e9, t = 0;
    for (const s of r.segs) {
      const dx = s.bx - s.ax, dz = s.bz - s.az, u = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (s.l * s.l)));
      const d = Math.hypot(x - s.ax - dx * u, z - s.az - dz * u);
      if (d < best) { best = d; t = (s.at + u * s.l) / r.L; }
    }
    return [best, t];
  };
  const lakeIn = (x, z) => {                                               // how far inside the lake's outline, metres
    const a = Math.atan2(z - M.lake.z, x - M.lake.x);
    return M.lake.r * (1 + 0.35 * (fbm3(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 4.2, seed + 77, 3) - 0.5)) - Math.hypot(x - M.lake.x, z - M.lake.z);
  };
  const landNoRamps = (x, z) => {
    let h = meadow(x, z), apron = 0;
    M.mesas.forEach((m, k) => { const q = mesaAt(m, k, x, z); if (q.h > h) h = q.h; apron = Math.max(apron, q.apron); });
    h += apron * ss(-0.5, 0.5, 1.5 - h + meadow(x, z));                   // (the scree only at the foot, on the meadow)
    const li = lakeIn(x, z);
    if (li > -3) h = lerp(h, Math.min(h, M.lake.level - M.lake.depth * ss(0, 6, li)), ss(-3, 0.5, li));
    return h;
  };
  for (const r of ramps) r.foot = landNoRamps(r.pts[0][0], r.pts[0][1]);
  const heightFn = (x, z) => {
    let h = landNoRamps(x, z);
    for (const r of ramps) {
      const [d, t] = nearRamp(r, x, z);
      if (d > r.half + 7) continue;
      const hr = lerp(r.foot, r.top, ss(0, 1, t) * 0.25 + t * 0.75);      // (eases off at its foot)
      h = lerp(h, hr, 1 - ss(r.half, r.half + 6.5, d));                    // the way up, and the land sloping away either side of it
    }
    return h;
  };
  const field = G.createHeightField({ radius: FR, cells: CELLS, heightFn });
  const H = field.heightAt;
  const slope = (x, z) => Math.hypot(H(x + 0.5, z) - H(x - 0.5, z), H(x, z + 0.5) - H(x, z - 0.5));
  const onRamp = (x, z, pad = 0) => ramps.some(r => nearRamp(r, x, z)[0] < r.half + pad);
  const waterDepthAt = (x, z) => lakeIn(x, z) > -3 ? Math.max(0, M.lake.level - H(x, z)) : 0;
  const nearStream = (x, z) => { let b = 1e9; for (let i = 0; i < M.stream.length - 1; i++) { const [ax, az] = M.stream[i], [bx, bz] = M.stream[i + 1], dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); b = Math.min(b, Math.hypot(x - ax - dx * u, z - az - dz * u)); } return b; };

  const peak = M.mesas[2];      // (the places 📍 offers: no tree right in front of them)
  const views = {
    start: M.spawn,
    'bo-meadow': M.spawn, 'bo-lake': { x: 2, z: 30, yaw: -2.1 }, 'bo-a': { x: 36, z: 0, yaw: Math.PI + 0.35 }, 'bo-falls': { x: -6, z: 12, yaw: 2.6 },
    'bo-b': { x: 4, z: -40, yaw: -1.75 }, 'bo-ridge': { x: -24, z: -31, yaw: -2.2 }, 'bo-peak': { x: peak.x + 4, z: peak.z + 4, yaw: 0.75 },
  };

  // ------------------------------------------------------------------ trees: on the meadow, on the tables, one great one on the peak
  await onStep('ปลูกต้นไม้');
  const plants = [], colliders = [], cameraTrunks = [], shade = [], bare = [], casters = [];
  {
    const r = mulberry32(seed * 31), types = ['broadleaf', 'oak', 'pine', 'birch'];
    const tree = (x, z, type, scale) => {
      const y = H(x, z), rad = TRUNK[type] * scale;
      plants.push({ kind: 'tree', type, seed: 100 + plants.length, detail: 0.8, x, y: y - 0.05, z, rotY: r() * 6.28, scale });
      colliders.push([x, z, rad + 0.22]); cameraTrunks.push([x, z, rad + 0.12, y, y + TREE_H[type] * scale]);
      shade.push([x, z, 4 * scale, 0.4]); bare.push([x, z, rad * 1.5]); casters.push([x, z, TREE_H[type] * scale, 2.4 * scale, 0.7]);
    };
    const ok = (x, z, pad = 2) => Math.hypot(x, z) < M.radius - 4 && slope(x, z) < 0.45 && waterDepthAt(x, z) === 0 && lakeIn(x, z) < -3 && !onRamp(x, z, pad) && nearStream(x, z) > 3 && Object.values(views).every(v => Math.hypot(x - v.x - Math.sin(v.yaw) * 5, z - v.z - Math.cos(v.yaw) * 5) > 8);
    for (let i = 0; i < 340 && plants.length < 70; i++) {                   // copses: a few trees together, open meadow between
      const x = (r() - 0.5) * 2 * (M.radius - 6), z = (r() - 0.5) * 2 * (M.radius - 6);
      if (fbm3(x * 0.035, 3.3, z * 0.035, seed + 9, 2) < 0.55 || !ok(x, z)) continue;
      tree(x, z, types[Math.floor(r() * 4)], 0.85 + r() * 0.4);
    }
    tree(peak.x + 1, peak.z + 1.5, 'oak', 1.9);                             // the landmark
  }

  // ------------------------------------------------------------------ the ground's colour, the grass
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    if (Math.hypot(x, z) > FR - 2) return [0, 0, 0];
    let earth = ss(0.9, 1.3, slope(x, z));                                  // the cliffs' faces: bare (grey, like rock)
    if (earth > 0) earth *= ss(0.35, 1.3, H(x, z) - Math.min(H(x + 1.2, z), H(x - 1.2, z), H(x, z + 1.2), H(x, z - 1.2)) - 0.0) * ss(0.4, 1.4, Math.max(H(x + 1.2, z), H(x - 1.2, z), H(x, z + 1.2), H(x, z - 1.2)) - H(x, z));      // (grass hangs over the brinks a little)
    const li = lakeIn(x, z), sand = li > -3.5 ? ss(-3.5, -0.5, li) : 0;
    let mow = 0;
    for (const r of ramps) { const [d] = nearRamp(r, x, z); mow = Math.max(mow, 1 - ss(r.half * 0.5, r.half + 0.6, d)); }      // the ramps: trodden grass
    return [earth, sand, mow];
  };
  const L = new THREE.Vector3(...sun).normalize();
  const sunShadows = dir => {
    L.copy(dir).normalize();
    const dxz = Math.hypot(L.x, L.z) || 1, ly = Math.max(0.3, L.y), ux = -L.x / dxz, uz = -L.z / dxz, len = dxz / ly;
    return casters.map(([x, z, h, r, st]) => [x + ux * len * h / 2, z + uz * len * h / 2, len * h / 2 + r, r * 1.1, ux, uz, st, 0]);
  };
  const map = G.createGroundMap({ radius: FR, size: 1024, seed, heightAt: H, dirt: 0, shade, bare, press: [], paint, cast: sunShadows(L.clone()),
    colors: { ...G.GROUND_COLORS, deep: '#55924a', mid: '#7cae40', sunny: '#9fc84a', shade: '#447a3c', dirt: '#8a919b', dirtRim: '#7d8a6a' } });
  const fade = { far, fadeA: FR * 0.8, fadeB: FR * 0.985 };
  const terrain = G.createTerrain(field, map, fade);
  group.add(terrain);
  await onStep('ปลูกหญ้า');
  const grass = G.createFollowGrass({ map, field, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade });
  group.add(grass);
  if (plants.length) group.add(N.createForest(plants));

  // ------------------------------------------------------------------ the water, plain (a blockout): the lake, and the stream draped over the land
  {
    const blue = new THREE.MeshBasicMaterial({ color: '#4fa8d8', transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide });
    blue.userData = {};
    const lake = new THREE.Mesh(new THREE.CircleGeometry(M.lake.r * 1.5, 64).rotateX(-Math.PI / 2), blue);
    lake.position.set(M.lake.x, M.lake.level, M.lake.z); lake.renderOrder = 1;
    lake.userData = { dispose() { lake.geometry.dispose(); } };
    group.add(lake);
    const pos = [], idx = [], line = [];
    for (let i = 0; i < M.stream.length - 1; i++) {
      const [ax, az] = M.stream[i], [bx, bz] = M.stream[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
      for (let k = 0; k < n; k++) line.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
    }
    line.push(M.stream[M.stream.length - 1]);
    line.forEach(([x, z], k) => {
      const [nx, nz] = line[Math.min(line.length - 1, k + 1)], [px, pz] = line[Math.max(0, k - 1)], dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1, w = 1.1;
      for (const s of [-1, 1]) { const x2 = x - dz / l * w * s, z2 = z + dx / l * w * s; pos.push(x2, H(x2, z2) + 0.12, z2); }
      if (k) idx.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, k * 2, k * 2 + 1, (k - 1) * 2 + 1);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const stream = new THREE.Mesh(g, blue); stream.renderOrder = 1;
    stream.userData = { dispose() { g.dispose(); blue.dispose(); } };
    group.add(stream);
  }

  // ------------------------------------------------------------------ the sun: the shadows on the ground follow it (drawn in the background)
  let castSun = L.clone(), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false;
  const cast = { dir: castSun.clone(), k: 1 };
  const walkable = (x, z) => Math.hypot(x, z) < M.radius && waterDepthAt(x, z) < 0.9 && slope(x, z) < 0.85;
  console.info('[blockout] trees', plants.length);
  group.userData = { kind: 'blockout', dispose() {
    group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); });
    map.dispose(); field.texture.dispose();
  } };
  const optics = { quality: 0, setQuality() {} };                          // (no water optics in a blockout)
  return {
    group, map, field, grass, terrain, heightAt: H, waterDepthAt, colliders, crowns: [], cameraTrunks, spawn: M.spawn, radius: M.radius, walkable, views,
    keepClear: (x, z, r = 0) => onRamp(x, z, r) || slope(x, z) > 0.6,
    name: 'Blockout มอนด์', stats: { trees: plants.length },
    optics, waterLevelAt: () => M.lake.level, ripple() {}, tapWater() { return false; },
    addUnderwater() {},
    confine(p) {                                                           // off the cliffs' faces and out of deep water
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
