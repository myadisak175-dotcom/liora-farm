// tools/check-cave-level.mjs  —  cave-level.js checked without a browser:  node tools/check-cave-level.mjs
//
//   1. The three baked rooms (one floor under every spot) are read exactly as they were before a room could have several
//      floors: every answer of the level against the single-floor reading kept below (the level's own code until 28 Nov
//      2026), on a fine grid of spots, figure for figure.
//   2. Three made-up rooms with floors over one another, walked: a bridge over a hall, a stair winding down two turns over
//      itself, a tunnel under a floor (with a pit down into it, a dead end, a pool on each floor).
//   3. Her camera in all of them: never through a floor, a roof or a wall.
//   4. The kit's rooms (tools/make-cave-room.py): every place of a room stands on ground at its own height, every way of
//      stone in its description is walked from end to end with her feet on its line, her camera at every place's height;
//      every piece of its land and every waterway does what its kind promises (PIECES, below: a new kind gets its line
//      there), and she stands level at every mouth; its ground: every kind on its floors has a picture and a sound for
//      her steps, and every thing painted by hand lies on top where it was drawn (and sounds as its kind does); its
//      grass: every tuft stands on a floor, on ground that grows grass, out of the water and off laid stone, about as
//      thick as the tool means it to.
// Run it after changing cave-level.js, and after baking a room (one of the first three: its name is in ROOMS; a room of
// the kit: add its name to KIT).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCaveLevel } from '../cave-level.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOMS = ['fang-hall', 'cave-hall', 'boss-hall'];
const NONE = -32768;
let failed = 0;
const check = (what, ok, more = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${more ? '  ' + more : ''}`); };

// ---------------------------------------------------------------- 1. the baked rooms, against the single-floor reading
function loadRoom(name) {
  const L = JSON.parse(readFileSync(join(ROOT, 'assets/caves', name + '.json'), 'utf8'));
  const buf = readFileSync(join(ROOT, 'assets/caves', name + '.bin'));
  const bin = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), F = L.bin.floor, n = F.nx * F.nz * (F.layers || 1);
  const floorMap = { nx: F.nx, nz: F.nz, x0: F.x0, z0: F.z0, cell: F.cell, layers: F.layers,
    fl: new Int16Array(bin, F.floor, n), ce: new Int16Array(bin, F.ceil, n), paint: new Uint8Array(bin, F.paint, n * 4),
    kinds: F.kinds || [], ...(F.paint2 !== undefined ? { paint2: new Uint8Array(bin, F.paint2, n * 4) } : {}),
    ...(F.step !== undefined ? { step: new Uint8Array(bin, F.step, n), steps: F.steps } : {}),
    ...(F.water !== undefined ? { water: new Int16Array(bin, F.water, n) } : {}) };
  const G = L.bin.grass, grass = G ? { tufts: G.tufts, root: new Float32Array(bin, G.root, G.tufts * 3) } : null;
  return { floorMap, layout: L, colliders: [], trunks: [], crowns: [], grass };
}
// the level as it read a room with one floor under every spot (cave-level.js until 28 Nov 2026, its own lines)
function singleFloor(hall) {
  const M = hall.floorMap, L = hall.layout, { nx, nz, x0, z0, cell } = M, n = nx * nz;
  const ROCK = 60, ROOM = 2.0, CLIFF = 0.9, E = 0.35, SWIM = 1.05, HEAD = 0.3;
  const fl = new Float32Array(n), ce = new Float32Array(n), ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const f = M.fl[i], c = M.ce[i];
    fl[i] = f === NONE ? NaN : f / 100; ce[i] = c === NONE ? NaN : c / 100;
    ok[i] = f !== NONE && ce[i] - fl[i] >= ROOM && M.paint[i * 4 + 3] < 200 ? 1 : 0;
  }
  const near = new Uint8Array(n);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (ok[i * nz + j]) continue;
    for (let a = Math.max(0, i - 2); a <= Math.min(nx - 1, i + 2); a++) for (let b = Math.max(0, j - 2); b <= Math.min(nz - 1, j + 2); b++) near[a * nz + b] = 1;
  }
  const pool = L.pool, poolR = pool.r + 2.0;
  const blend = (A, x, z, none) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return none;
    const u = fx - i, v = fz - j, k = i * nz + j, a = A[k], b = A[k + nz], c = A[k + 1], d = A[k + nz + 1];
    let s = 0, w = 0, q;
    if (a === a) { q = (1 - u) * (1 - v); s += a * q; w += q; }
    if (b === b) { q = u * (1 - v); s += b * q; w += q; }
    if (c === c) { q = (1 - u) * v; s += c * q; w += q; }
    if (d === d) { q = u * v; s += d * q; w += q; }
    return w > 1e-6 ? s / w : none;
  };
  const floorOnly = (x, z, none) => blend(fl, x, z, none);
  const heightAt = (x, z) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return ROCK;
    const u = fx - i, v = fz - j, k = i * nz + j, a = fl[k], b = fl[k + nz], c = fl[k + 1], d = fl[k + nz + 1];
    const A = a === a ? a : ROCK, B = b === b ? b : ROCK, C = c === c ? c : ROCK, D = d === d ? d : ROCK;
    return (A * (1 - u) + B * u) * (1 - v) + (C * (1 - u) + D * u) * v;
  };
  const standAt = (x, z) => floorOnly(x, z, ROCK);
  const slope = (x, z) => {
    const h = standAt(x, z);
    return Math.hypot((floorOnly(x + E, z, h) - floorOnly(x - E, z, h)) / (2 * E), (floorOnly(x, z + E, h) - floorOnly(x, z - E, h)) / (2 * E));
  };
  const waterDepthAt = (x, z) => {
    const dx = x - pool.c[0], dz = z - pool.c[1];
    if (dx * dx + dz * dz > poolR * poolR) return 0;
    return Math.max(0, pool.level - floorOnly(x, z, pool.level));
  };
  const footing = (x, z) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return 'out';
    const k = i * nz + j;
    if (!ok[k] || !ok[k + nz] || !ok[k + 1] || !ok[k + nz + 1]) return 'wall';
    if (waterDepthAt(x, z) >= SWIM) return 'water';
    if (slope(x, z) < CLIFF) return 'ground';
    return near[k] || near[k + nz] || near[k + 1] || near[k + nz + 1] ? 'wall' : 'cliff';
  };
  const roofAt = (x, z) => blend(ce, x, z, Infinity);
  const ceilAt = (x, z) => Math.min(roofAt(x, z), roofAt(x + HEAD, z), roofAt(x - HEAD, z), roofAt(x, z + HEAD), roofAt(x, z - HEAD));
  const surfaceAt = (x, z) => {
    const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return 'stone';
    const k = (i * nz + j) * 4, p = M.paint;
    return p[k + 3] >= 128 ? 'stone' : p[k + 1] > 128 ? 'sand' : p[k] > 128 ? 'earth' : 'grass';
  };
  return { heightAt, standAt, footing, waterDepthAt, ceilAt, surfaceAt, slope };
}
const same = (a, b) => a === b || (a !== a && b !== b);
for (const name of ROOMS) {
  const hall = loadRoom(name), was = singleFloor(hall), now = createCaveLevel(hall), M = hall.floorMap;
  const t0 = performance.now();
  let spots = 0, off = 0, first = '', ground = 0;
  const step = M.cell * 0.37;
  for (let x = M.x0 - 1; x < M.x0 + M.nx * M.cell + 1; x += step) for (let z = M.z0 - 1; z < M.z0 + M.nz * M.cell + 1; z += step) {
    spots++;
    for (const y of [undefined, -5, 3, 40]) {                        // (a room with one floor answers the same at any height)
      const f = now.footing(x, z, y);
      const bad = !same(now.standAt(x, z, y), was.standAt(x, z)) ? 'standAt' : f !== was.footing(x, z) ? 'footing'
        : !same(now.waterDepthAt(x, z, y), was.waterDepthAt(x, z)) ? 'waterDepthAt' : !same(now.ceilAt(x, z, y), was.ceilAt(x, z)) ? 'ceilAt'
        : now.surfaceAt(x, z, y) !== was.surfaceAt(x, z) ? 'surfaceAt' : !same(now.heightAt(x, z), was.heightAt(x, z)) ? 'heightAt'
        : !same(now.slope(x, z, y), was.slope(x, z)) ? 'slope' : '';
      if (bad) { off++; if (!first) first = `${bad} at ${x.toFixed(2)}, ${z.toFixed(2)} (y ${y})`; }
      if (y === undefined && f === 'ground') ground++;
    }
  }
  check(`${name}: read as before`, off === 0, `${spots} spots x 4 heights, ${ground} on walkable ground, ${Math.round(performance.now() - t0)} ms${first ? '; first: ' + first : ''}`);
  // a step she may not take, put right the same way
  let moved = 0, diff = 0;
  for (let q = 0; q < 4000; q++) {
    const x = M.x0 + ((q * 7919) % 1000) / 1000 * M.nx * M.cell, z = M.z0 + ((q * 104729) % 1000) / 1000 * M.nz * M.cell;
    if (was.footing(x, z) !== 'ground') continue;
    for (let a = 0; a < 8; a++) {
      const p = { x: x + Math.sin(a * Math.PI / 4) * 0.5, y: 0, z: z + Math.cos(a * Math.PI / 4) * 0.5 }, from = { x, y: now.standAt(x, z), z };
      now.confine(p, from);
      moved++;
      if (was.footing(p.x, p.z) !== 'ground') diff++;
    }
  }
  check(`${name}: confine leaves her on ground`, diff === 0, `${moved} steps`);
  cameraCheck(name, hall, now);
}

// ---------------------------------------------------------------- 3. her camera: wherever it may go there is air
// from every walkable spot (2 m apart), over her shoulders, 32 ways: every point of the line out to where it may reach
// has the room's air at its height within 1.3 m (thin rock is no wall to it, by design: a fang, a column; but it is never
// deep in the rock, under a floor or over a roof, nor through a floor into the storey over or under)
function cameraCheck(name, hall, level, heights = [undefined]) {
  const M = hall.floorMap, K = M.layers || 1, n = M.nx * M.nz, R = Math.ceil(1.3 / M.cell);
  const airIn = (i, j, y) => {
    if (i < 0 || j < 0 || i >= M.nx || j >= M.nz) return false;
    for (let s = 0; s < K; s++) { const q = s * n + i * M.nz + j, f = M.fl[q]; if (f === NONE) break; if (y >= f / 100 + 0.05 && y <= M.ce[q] / 100 - 0.05) return true; }
    return false;
  };
  const inAir = (x, y, z) => {
    const i = Math.round((x - M.x0) / M.cell), j = Math.round((z - M.z0) / M.cell);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) if (a * a + b * b <= R * R && airIn(i + a, j + b, y)) return true;
    return false;
  };
  const dirs = [];
  for (let a = 0; a < 8; a++) for (const p of [-0.2, 0.17, 0.6, 1.05]) dirs.push([Math.sin(a * Math.PI / 4) * Math.cos(p), Math.sin(p), Math.cos(a * Math.PI / 4) * Math.cos(p)]);
  const t0 = performance.now();
  let rays = 0, inRock = 0, short = 0, clear = 0, worst = '';
  for (const y0 of heights) for (let x = M.x0 + 1; x < M.x0 + M.nx * M.cell - 1; x += 2) for (let z = M.z0 + 1; z < M.z0 + M.nz * M.cell - 1; z += 2) {
    if (level.footing(x, z, y0) !== 'ground') continue;
    const y = level.standAt(x, z, y0) + 1.75 * 0.82 + 0.25;
    for (const [dx, dy, dz] of dirs) {
      const r = level.cameraReach(x, y, z, dx, dy, dz, 4.3);
      rays++;
      if (r >= 4.3) clear++;
      if (r < 0.19) short++;
      for (let t = 0.3; t <= r; t += 0.1) {                             // (all the way out: never through a floor to the storey over or under)
        if (inAir(x + dx * t, y + dy * t, z + dz * t)) continue;
        inRock++; if (!worst) worst = `from ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)} toward ${dx.toFixed(2)}, ${dy.toFixed(2)}, ${dz.toFixed(2)}: ${r.toFixed(2)} m, in rock at ${t.toFixed(1)} m`;
        break;
      }
    }
  }
  check(`${name}: her camera stays in the room's air`, inRock === 0 && rays > 0, `${rays} lines, ${clear} to the full 4.3 m, ${short} with no room at all, ${Math.round(performance.now() - t0)} ms${worst ? '; first in rock: ' + worst : ''}`);
}

// ---------------------------------------------------------------- 2. made-up rooms with floors over one another
// a room from a function: spans(x, z) -> [[floor, roof], ...] from the lowest up (metres), on a 0.4 m grid 32 m square
function madeUp(spans, layout = {}) {
  const nx = 80, nz = 80, cell = 0.4, n = nx * nz, K = 2;
  const fl = new Int16Array(K * n).fill(NONE), ce = new Int16Array(K * n).fill(NONE), paint = new Uint8Array(K * n * 4);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const edge = i < 5 || j < 5 || i >= nx - 5 || j >= nz - 5;
    (edge ? [] : spans(i * cell, j * cell, i, j)).forEach(([f, c], s) => { fl[s * n + i * nz + j] = Math.round(f * 100); ce[s * n + i * nz + j] = Math.round(c * 100); });
  }
  const hall = { floorMap: { nx, nz, x0: 0, z0: 0, cell, layers: K, fl, ce, paint }, layout: { spawn: { x: 16, z: 16, yaw: 0, y: 0 }, pool: { c: [999, 999], r: 0, level: -99 }, ...layout }, colliders: [], trunks: [], crowns: [] };
  return { hall, level: createCaveLevel(hall) };
}
const about = (a, b, e = 0.02) => Math.abs(a - b) <= e;

{ // ---- a bridge 4 m wide over a hall: banks 5 m up at either end, the hall's floor at 0 between them
  const { hall, level: B } = madeUp((x, z, i, j) => (i < 15 || i > 65 ? [[5, 20]] : j >= 35 && j <= 44 ? [[0, 4.2], [5, 20]] : [[0, 20]]));
  const mid = [16, 16];
  check('bridge: under it she stands on the hall floor, the bridge her roof', about(B.standAt(...mid, 0), 0) && about(B.ceilAt(...mid, 0), 4.2) && B.footing(...mid, 0) === 'ground');
  check('bridge: on it she stands on the deck, the hall\'s roof over her', about(B.standAt(...mid, 5), 5) && about(B.ceilAt(...mid, 5), 20) && B.footing(...mid, 5) === 'ground');
  check('bridge: jumping under it (feet 2.4 m up) she is still under it', about(B.standAt(...mid, 2.4), 0) && about(B.ceilAt(...mid, 2.4), 4.2));
  let y = 5, smooth = true, grounded = true;
  for (let x = 3; x <= 29; x += 0.1) { const h = B.standAt(x, 16, y); if (Math.abs(h - y) > 0.05) smooth = false; if (B.footing(x, 16, y) !== 'ground') grounded = false; y = h; }
  check('bridge: walked across from bank to bank, level all the way', smooth && grounded && about(y, 5));
  y = 0; smooth = true; grounded = true;
  for (let z = 6; z <= 26; z += 0.1) { const h = B.standAt(16, z, y); if (Math.abs(h - y) > 0.05) smooth = false; if (B.footing(16, z, y) !== 'ground') grounded = false; y = h; }
  check('bridge: walked under it across the hall, level all the way', smooth && grounded && about(y, 0));
  check('bridge: its side is an edge to step off (a face), not a wall', B.footing(16, 17.75, 5) === 'cliff' && B.standAt(16, 18.4, 5) < 0.05);
  check('bridge: off its side she falls to the hall floor', about(B.standAt(16, 19, 4.9), 0) && about(B.standAt(16, 19, 1), 0));
  check('bridge: a bank\'s face from the hall is a face to climb', B.footing(5.85, 10, 0) === 'cliff' && about(B.standAt(5.2, 10, 3), 5));
  check('bridge: asked without a height, the floor she was last on', (B.standAt(...mid, 5), about(B.standAt(...mid), 5)) && (B.standAt(...mid, 0), about(B.standAt(...mid), 0)));
  const up = B.cameraReach(16, 1.7, 16, 0, 1, 0, 6), upOnDeck = B.cameraReach(16, 6.7, 16, 0, 1, 0, 6), across = B.cameraReach(16, 1.7, 16, 0, 0.1, 0.995, 4.3);
  check('bridge: her camera under it stops under the deck; on it and out from under it, free', up > 1.6 && up < 2.4 && upOnDeck === 6 && across === 4.3, `up ${up.toFixed(2)} m of 2.5`);
  cameraCheck('bridge', hall, B, [0, 5]);
}

{ // ---- a stair winding down two turns over itself round a well: 5 m a turn, 4 m wide, 0.8 m of rock under each flight
  const C = 16, turn = (x, z) => { const a = Math.atan2(z - C, x - C); return (a < 0 ? a + 2 * Math.PI : a) / (2 * Math.PI); };
  const { hall, level: S } = madeUp((x, z) => {
    const r = Math.hypot(x - C, z - C);
    if (r < 6) return [[0, 30]];                                       // the well
    if (r > 10) return [];
    const h1 = 10 - 5 * turn(x, z);                                    // the upper flight there; the lower one 5 m under it
    return [[h1 - 5, h1 - 0.8], [h1, 30]];
  });
  let y = S.standAt(C + Math.cos(0.15) * 8, C + Math.sin(0.15) * 8, 10), worst = 0, grounded = 0, steps = 0, roofLow = true;
  for (let a = 0.15; a < 4 * Math.PI - 0.15; a += 0.01) {              // down both turns along the middle of the way (from a step in from its head: behind her there the way drops onto the turn below)
    const x = C + Math.cos(a) * 8, z = C + Math.sin(a) * 8, h = S.standAt(x, z, y);
    worst = Math.max(worst, Math.abs(h - y)); steps++;
    if (S.footing(x, z, y) === 'ground') grounded++;
    if (a > 2 * Math.PI + 0.2 && !(S.ceilAt(x, z, y) - h > 3.9 && S.ceilAt(x, z, y) - h < 4.5)) roofLow = false;
    y = h;
  }
  check('winding stair: walked down both turns without a jolt, to the bottom', worst < 0.06 && about(y, 0, 0.15) && grounded === steps, `${steps} steps, the biggest ${worst.toFixed(3)} m, ends at ${y.toFixed(2)} m`);
  check('winding stair: on the lower turn the upper flight is her roof (4.2 m)', roofLow);
  y = 0.05; worst = 0;
  for (let a = 4 * Math.PI - 0.05; a > 0.05; a -= 0.01) { const h = S.standAt(C + Math.cos(a) * 8, C + Math.sin(a) * 8, y); worst = Math.max(worst, Math.abs(h - y)); y = h; }
  check('winding stair: and back up both turns', worst < 0.06 && about(y, 10, 0.15), `ends at ${y.toFixed(2)} m`);
  check('winding stair: its foot runs into the rock under its own first flight: a wall', S.footing(C + 8, C - 0.1, 0.02) === 'wall' && S.footing(C + 8, C - 0.35, 0.02) === 'wall');
  { const p = { x: C + 8, y: 0.03, z: C + 0.3 }, from = { x: C + 8, y: 0.03, z: C - 0.6 }; S.confine(p, from);
    check('winding stair: a step into that rock is stopped (she is not put on the floor 5 m over her)', p.z < C - 0.05 && about(S.standAt(p.x, p.z, 0.03), 0.03, 0.1)); }
  check('winding stair: the way\'s inner edge is a drop into the well', S.footing(C + 6.0, C + 0.6, S.standAt(C + 6.8, C + 0.6, 10)) === 'cliff' && about(S.standAt(C + 4, C, 3), 0));
  cameraCheck('winding stair', hall, S, [0.3, 2.5, 5.2, 7.5, 9.8]);
}

{ // ---- a tunnel under a floor: the floor 6 m up, a pit down through it, the tunnel from the pit to a dead end; a pool on each
  const pools = [{ c: [14, 16], r: 2, level: 0.5 }, { c: [24, 24], r: 2, level: 6.4 }];
  const { hall, level: T } = madeUp((x, z, i, j) => (j >= 36 && j <= 44 && i >= 10 && i <= 50 ? (i < 16 ? [[0, 20]] : [[0, 3.5], [6, 20]]) : [[6, 20]]), { pools, pool: undefined });
  check('tunnel: over it she walks the upper floor', about(T.standAt(14, 16, 6), 6) && T.footing(14, 16, 6) === 'ground' && about(T.ceilAt(14, 16, 6), 20));
  check('tunnel: in it she walks under that floor, its rock her roof', about(T.standAt(14, 16, 0), 0) && T.footing(14, 16, 0) === 'ground' && about(T.ceilAt(14, 16, 0), 3.5));
  check('tunnel: its sides and its dead end are walls, not faces to climb', T.footing(14, 14.25, 0) === 'wall' && T.footing(14, 17.75, 0) === 'wall' && T.footing(20.2, 16, 0) === 'wall');
  check('tunnel: the pit\'s side is a face (down from the floor, up from the bottom)', T.footing(5.0, 13.9, 6) === 'cliff' && T.footing(5.0, 14.3, 0) === 'cliff' && about(T.standAt(5, 16, 5.9), 0));
  check('tunnel: the pool in it wets her there, not on the floor above', about(T.waterDepthAt(14, 16, 0), 0.5) && T.waterDepthAt(14, 16, 6) === 0);
  check('tunnel: the pool on the upper floor wets her there, not under it', about(T.waterDepthAt(24, 24, 6), 0.4) && T.waterDepthAt(14, 16, 0) === 0.5 && T.waterDepthAt(24, 24, 0) === 0.4 === false);
  const up = T.cameraReach(14, 1.7, 16, 0, 1, 0, 6), along = T.cameraReach(14, 1.7, 16, -1, 0, 0, 4.3);
  check('tunnel: her camera in it keeps under its roof, and runs free along it', up > 0.9 && up < 1.5 && along === 4.3, `up ${up.toFixed(2)} m of 1.8`);
  cameraCheck('tunnel', hall, T, [0, 6]);
}

// ---------------------------------------------------------------- 4. the kit's rooms (tools/make-cave-room.py): what their descriptions promise
// every place stands on ground at its own height; every way of stone in the description can be walked from end to end
// (a bridge, a stair winding over itself), her feet on its line; her camera at every place's height
const KIT = ['test'];
// what each kind of piece of the land promises (tools/make-cave-room.py, TERRAIN): (its description, the level) -> [kept, in words]
const walked = (L, path, ends = 0.6) => {
  const runs = [0]; for (let i = 1; i < path.length; i++) runs.push(runs[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]));
  let n = 0, off = 0, worst = 0;
  for (let u = ends, i = 1; u <= runs[runs.length - 1] - ends; u += 0.2) {
    while (runs[i] < u) i++;
    const t = (u - runs[i - 1]) / Math.max(runs[i] - runs[i - 1], 1e-6), x = path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, y = path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t, z = path[i - 1][2] + (path[i][2] - path[i - 1][2]) * t;
    const h = L.standAt(x, z, y); n++; worst = Math.max(worst, Math.abs(h - y));
    if (L.footing(x, z, y) !== 'ground' || Math.abs(h - y) > 0.4) off++;
  }
  return [n > 0 && off === 0, `${n} spots along it, her feet within ${worst.toFixed(2)} m of its line`];
};
const inOutline = (o, x, z) => { let c = false; for (let i = 0, j = o.length - 1; i < o.length; j = i++) if ((o[i][1] > z) !== (o[j][1] > z) && x < (o[j][0] - o[i][0]) * (z - o[i][1]) / (o[j][1] - o[i][1]) + o[i][0]) c = !c; return c; };
const PIECES = {
  mound: (s, L) => { const y = s.floor + s.high, h = L.standAt(s.at[0], s.at[1], y); return [L.footing(s.at[0], s.at[1], y) === 'ground' && Math.abs(h - y) < 0.35, `its top at ${h.toFixed(2)} (drawn ${y.toFixed(2)}), walked over`]; },
  hollow: (s, L) => { const y = s.floor - s.deep, h = L.standAt(s.at[0], s.at[1], y), f = L.footing(s.at[0], s.at[1], y); return [(f === 'ground' || f === 'water') && Math.abs(h - y) < 0.35, `its bed at ${h.toFixed(2)} (drawn ${y.toFixed(2)}), ${f === 'water' ? 'under water too deep to wade' : 'walked into'}`]; },
  slope: (s, L) => walked(L, s.path),
  ledge: (s, L) => {
    if (!s.outline) return [true, 'drawn as a picture: not walked here'];
    const xs = s.outline.map((p) => p[0]), zs = s.outline.map((p) => p[1]);
    let top = 0, face = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.4) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.4) {
      if (inOutline(s.outline, x, z) && L.footing(x, z, s.top) === 'ground' && Math.abs(L.standAt(x, z, s.top) - s.top) < 0.35) top++;
    }
    for (let i = 0; i < s.outline.length; i++) {
      const a = s.outline[i], b = s.outline[(i + 1) % s.outline.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let u = 0; u < len; u += 0.3) if (L.footing(a[0] + (b[0] - a[0]) * u / len, a[1] + (b[1] - a[1]) * u / len, s.floor + 0.1) === 'cliff') face++;
    }
    return [top >= 6 && face >= 3, `${(top * 0.16).toFixed(0)} m2 of top to stand on at ${s.top}, a face she may climb along ${(face * 0.3).toFixed(0)} m of its edge`];
  },
  boulder: (s, L) => {
    const [rx, ry, rz] = Array.isArray(s.r) ? s.r : [s.r, s.r, s.r], h = L.standAt(s.at[0], s.at[1], s.floor + 2 * ry + 1);
    let stops = 0;                                                       // (round its flank, at the floor's height: a face or a wall, not ground)
    for (let k = 0; k < 12; k++) if (L.footing(s.at[0] + 0.85 * rx * Math.cos(k * Math.PI / 6), s.at[1] + 0.85 * rz * Math.sin(k * Math.PI / 6), s.floor) !== 'ground') stops++;
    return [h > s.floor + 0.6 * ry && stops >= 8, `it stands ${(Math.min(h, s.floor + 2 * ry) - s.floor).toFixed(1)} m over the floor, its flank stops her on ${stops} sides of 12`];
  },
  pool: (s, L) => {
    const d = L.waterDepthAt(s.at[0], s.at[1], s.level), top = L.standAt(s.at[0], s.at[1], s.level) + d;
    let deepest = 0, area = 0;                                           // (round its spot: how deep it gets, how much of it there is)
    for (let x = s.at[0] - 8; x <= s.at[0] + 8; x += 0.4) for (let z = s.at[1] - 8; z <= s.at[1] + 8; z += 0.4) {
      const e = L.waterDepthAt(x, z, s.level); if (e > 0.02 && Math.abs(L.standAt(x, z, s.level) + e - s.level) < 0.06) { area += 0.16; deepest = Math.max(deepest, e); }
    }
    return [d > 0.1 && Math.abs(top - s.level) < 0.06, `${area.toFixed(0)} m2 of water at ${top.toFixed(2)} (drawn ${s.level}), up to ${deepest.toFixed(2)} m deep: she ${deepest >= 1.05 ? 'swims in its middle' : 'wades it'}`];
  },
  stream: (s, L) => {
    const falls = (a, b) => a[1] - b[1] > Math.max(0.5, Math.hypot(b[0] - a[0], b[2] - a[2]));
    let n = 0, dry = 0, off = 0, most = 0, fell = 0, missed = 0;
    for (let i = 1; i < s.path.length; i++) {
      const a = s.path[i - 1], b = s.path[i], run = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (falls(a, b)) { fell++; if (!(L.waterDepthAt(b[0], b[2], b[1]) > 0.05)) missed++; continue; }
      for (let u = 0.4; u <= run - 0.4; u += 0.3) {
        const t = u / run, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t, d = L.waterDepthAt(x, z, y);
        n++; most = Math.max(most, d); if (!(d > 0.03)) dry++; else if (Math.abs(L.standAt(x, z, y) + d - y) > 0.1) off++;
      }
    }
    return [n > 0 && dry === 0 && off === 0 && missed === 0, `water all along its line (${n} spots, up to ${most.toFixed(2)} m deep, its surface on the line)${fell ? `, ${fell} fall${fell > 1 ? 's' : ''} landing on water` : ''}${dry ? `; ${dry} spots dry` : ''}${off ? `; ${off} off its line` : ''}${missed ? `; ${missed} falls landing on no water` : ''}`];
  },
  heights: (s, L) => {
    const lo = s.low || 0, hi = s.high === undefined ? 1 : s.high; let most = -9, least = 9;
    for (let x = s.at[0]; x <= s.at[0] + s.size[0]; x += 0.4) for (let z = s.at[1]; z <= s.at[1] + s.size[1]; z += 0.4) {
      const h = L.standAt(x, z, s.floor + Math.max(hi, 0) + 0.3) - s.floor; if (h < 30) { most = Math.max(most, h); least = Math.min(least, h); }
    }
    return [(hi <= 0 || most > 0.6 * hi) && (lo >= 0 || least < 0.6 * lo), `the ground under its picture from ${least.toFixed(2)} to ${most.toFixed(2)} m over the floor (drawn ${lo} to ${hi})`];
  },
};
// what lies on top at a spot of a kit room's floor (tools/make-cave-room.py, GROUNDS): the last of the room's kinds with
// more than half there; 'stone': none (the bare floor, or laid stone)
const groundAt = (M, x, z, y) => {
  const i = Math.round((x - M.x0) / M.cell), j = Math.round((z - M.z0) / M.cell), n = M.nx * M.nz;
  if (i < 0 || j < 0 || i >= M.nx || j >= M.nz) return 'stone';
  let q = i * M.nz + j;
  if (M.fl[q] === NONE) return 'stone';
  for (let r = q + n; r < n * (M.layers || 1) && M.fl[r] !== NONE && M.fl[r] / 100 <= y + 0.6; r += n) q = r;
  let top = 'stone';
  for (const k of M.kinds) if ((k.at < 3 ? M.paint[q * 4 + k.at] : M.paint2[q * 4 + k.at - 3]) > 128) top = k.name;
  return top;
};
// the spots a thing painted by hand should lie on (tools/make-cave-room.py, "paint"): [x, y, z], well inside its edge
const paintedSpots = (s) => {
  const out = [];
  if (s.path) {
    for (let i = 1; i < s.path.length; i++) {
      const a = s.path[i - 1], b = s.path[i], run = Math.hypot(b[0] - a[0], b[2] - a[2]);
      for (let u = 0.3; u <= run - 0.3; u += 0.3) { const t = u / run; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
    }
  } else if (s.outline) {
    const o = s.outline, xs = o.map((p) => p[0]), zs = o.map((p) => p[1]);
    const toEdge = (x, z) => o.reduce((m, a, i) => {                      // (how far from the outline's nearest side)
      const b = o[(i + 1) % o.length], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      return Math.min(m, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    }, 1e9);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.4) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.4) {
      if (inOutline(o, x, z) && toEdge(x, z) >= 0.45) out.push([x, s.floor, z]);
    }
  } else if (s.picture) {
    for (let x = s.at[0]; x <= s.at[0] + s.size[0]; x += 0.4) for (let z = s.at[1]; z <= s.at[1] + s.size[1]; z += 0.4) out.push([x, s.floor, z]);
  } else if (s.at) {
    const [rx, rz] = Array.isArray(s.r) ? s.r : [s.r, s.r];
    for (let x = s.at[0] - rx; x <= s.at[0] + rx; x += 0.4) for (let z = s.at[1] - rz; z <= s.at[1] + rz; z += 0.4) if (Math.hypot((x - s.at[0]) / rx, (z - s.at[1]) / rz) < 0.7) out.push([x, s.floor, z]);
  }
  return out;
};
const SOUNDS = ['stone', 'earth', 'grass', 'sand', 'wood', 'water'];       // (step-sounds.js' grounds)
for (const name of KIT) {
  const hall = loadRoom(name), level = createCaveLevel(hall), L = hall.layout;
  const D = JSON.parse(readFileSync(join(ROOT, 'tools/cave-rooms', name + '.json'), 'utf8'));
  const lost = L.places.filter((p) => level.footing(p.x, p.z, p.y) !== 'ground' || Math.abs(level.standAt(p.x, p.z, p.y) - p.y) > 0.3).map((p) => p.name);
  check(`${name}: every place stands on ground at its height`, lost.length === 0, `${L.places.length} places, up to ${hall.floorMap.layers} floors over one spot${lost.length ? '; not: ' + lost.join(', ') : ''}`);
  (D.stone || []).forEach((piece, n) => {
    const w = piece.way; if (!w) return;
    let path = w.path;
    if (w.helix) { const h = w.helix, [a0, ya] = h.from, [a1, yb] = h.to, m = Math.max(2, Math.floor(Math.abs(a1 - a0) / 2) + 1); path = [];
      for (let i = 0; i < m; i++) { const a = (a0 + (a1 - a0) * i / (m - 1)) * Math.PI / 180; path.push([h.at[0] + h.r * Math.cos(a), ya + (yb - ya) * i / (m - 1), h.at[1] + h.r * Math.sin(a)]); } }
    const runs = [0]; for (let i = 1; i < path.length; i++) runs.push(runs[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]));
    const len = runs[runs.length - 1];
    let steps = 0, off = 0, worst = 0, first = '';
    for (let u = 1.5, i = 1; u <= len - 1.5; u += 0.2) {                // (its ends run into the rock or the floor they meet)
      while (runs[i] < u) i++;
      const t = (u - runs[i - 1]) / Math.max(runs[i] - runs[i - 1], 1e-6);
      const x = path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, y = path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t, z = path[i - 1][2] + (path[i][2] - path[i - 1][2]) * t;
      steps++;
      const f = level.footing(x, z, y), h = level.standAt(x, z, y);
      worst = Math.max(worst, Math.abs(h - y));
      if (f !== 'ground' || Math.abs(h - y) > 0.3) { off++; if (!first) first = `${f} at ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)} (floor ${h.toFixed(2)})`; }
    }
    check(`${name}: way ${n + 1} (${w.helix ? 'winding' : 'straight'}, ${len.toFixed(0)} m) is walked end to end`, off === 0 && steps > 0, `${steps} spots, her feet within ${worst.toFixed(2)} m of its line${first ? '; first off: ' + first : ''}`);
  });
  (D.terrain || []).forEach((piece, n) => {
    const [kind, d] = Object.entries(piece)[0];
    if (!PIECES[kind]) { check(`${name}: land ${n + 1} (${kind})`, false, 'no line for this kind in PIECES'); return; }
    const [kept, words] = PIECES[kind](d, level);
    check(`${name}: land ${n + 1}, a ${kind}`, kept, words);
  });
  (D.waterways || []).forEach((piece, n) => {
    const [kind, d] = Object.entries(piece)[0];
    if (!PIECES[kind]) { check(`${name}: water ${n + 1} (${kind})`, false, 'no line for this kind in PIECES'); return; }
    const [kept, words] = PIECES[kind](d, level);
    check(`${name}: water ${n + 1}, a ${kind}`, kept, words);
  });
  // the ground: the room's kinds each have a picture and a sound; every thing painted by hand lies where it was drawn
  {
    const M = hall.floorMap, noPic = M.kinds.filter((k) => !existsSync(join(ROOT, 'assets/ground', k.picture))).map((k) => k.name);
    const noStep = M.kinds.filter((k) => !SOUNDS.includes(k.step) || !(M.steps || []).includes(k.step)).map((k) => k.name);
    check(`${name}: ground "${L.ground}", ${M.kinds.length} kinds on its floors`, M.kinds.length <= 7 && noPic.length === 0 && noStep.length === 0 && !!M.step,
      M.kinds.map((k) => `${k.name} (${k.step})`).join(', ') + (noPic.length ? '; no picture: ' + noPic.join(', ') : '') + (noStep.length ? '; no sound: ' + noStep.join(', ') : ''));
    (D.paint || []).forEach((piece, n) => {
      const [kind, d] = Object.entries(piece)[0], step = kind === 'stone' ? 'stone' : (M.kinds.find((k) => k.name === kind) || {}).step;
      // (looked for on dry natural ground it reaches: a water's bed and shore are the water's own, laid stone is stone)
      let on = 0, sound = 0, natural = 0;
      for (const [x, y, z] of paintedSpots(d)) {
        if (level.footing(x, z, y) !== 'ground' || level.waterDepthAt(x, z, y) > 0) continue;
        const h = level.standAt(x, z, y);
        if (Math.abs(h - y) >= (d.reach || 1.5)) continue;
        const top = groundAt(M, x, z, h);
        if (top === 'sand' && kind !== 'sand') continue;                 // (a shore)
        natural++;
        if (top === kind) { on++; if (level.surfaceAt(x, z, h) === step) sound++; }
      }
      const where = d.path ? 'along a line' : d.outline ? 'in an outline' : d.picture ? 'from a picture' : 'a patch';
      const kept = sound === on && (d.picture ? on >= 6 : natural >= 3 && on >= 0.6 * natural);      // (a picture: wherever it is white; 6 spots: a square metre)
      check(`${name}: paint ${n + 1}, ${kind} ${where}`, kept, `${kind} on top at ${on} of ${natural} spots ${d.picture ? 'under its picture' : 'inside it'}, her steps there: ${step || '?'}`);
    });
  }
  // the grass: every tuft on a floor, on ground that grows it, dry, not on laid stone; about as thick as it is meant to be
  {
    const M = hall.floorMap, n2 = M.nx * M.nz, grows = M.kinds.filter((k) => k.grows), want = (D.grass && D.grass.kind) || D.grass || 'green';
    const amount = (k, q) => (k.at < 3 ? M.paint[q * 4 + k.at] : M.paint2[q * 4 + k.at - 3]);
    const spanAt = (x, z, y) => {                                         // the span of the nearest column whose floor is at that height
      const i = Math.round((x - M.x0) / M.cell), j = Math.round((z - M.z0) / M.cell);
      if (i < 0 || j < 0 || i >= M.nx || j >= M.nz) return -1;
      for (let q = i * M.nz + j; q < n2 * (M.layers || 1) && M.fl[q] !== NONE; q += n2) if (Math.abs(M.fl[q] / 100 - y) < 0.35) return q;
      return -1;
    };
    if (want === 'none') check(`${name}: grass: none asked, none baked`, !hall.grass);
    else if (!grows.length) check(`${name}: grass: no ground here grows it, none baked`, !hall.grass);
    else {
      const R = hall.grass ? hall.grass.root : [], T = hall.grass ? hall.grass.tufts : 0;
      let off = 0, bare = 0, wet = 0, laid = 0;
      for (let t = 0; t < T; t++) {
        const x = R[t * 3], y = R[t * 3 + 1], z = R[t * 3 + 2], q = spanAt(x, z, y);
        if (q < 0) { off++; continue; }
        if (M.paint[q * 4 + 3] > 100) laid++;
        if (M.water && M.water[q] !== NONE && M.water[q] / 100 > y + 0.03) wet++;
        if (!grows.some((k) => amount(k, q) > 60)) bare++;
      }
      let area = 0;                                                       // (the floor where a growing kind lies thick)
      for (let q = 0; q < n2 * (M.layers || 1); q++) if (M.fl[q] !== NONE && M.paint[q * 4 + 3] < 100 && grows.some((k) => amount(k, q) > 160)) area += M.cell * M.cell;
      const per = area ? T / area : 0;
      check(`${name}: grass "${want}", ${T} tufts`, T > 0 && off === 0 && laid === 0 && wet === 0 && bare <= 0.03 * T && per > 12 && per < 70,
        `every one on a floor${off ? ' (NOT ' + off + ')' : ''}, ${T - bare} on ground that grows it (${grows.map((k) => k.name).join(', ')}), ${wet} in water, ${laid} on laid stone; about ${per.toFixed(0)} a m2 of the ${area.toFixed(0)} m2 where it lies thick`);
    }
  }
  (D.mouths || []).forEach((m) => {
    const a = (m.toward || 0) * Math.PI / 180, x = m.at[0] - 1.2 * Math.cos(a), z = m.at[2] - 1.2 * Math.sin(a), h = level.standAt(x, z, m.at[1]);
    check(`${name}: mouth "${m.name}"`, level.footing(x, z, m.at[1]) === 'ground' && Math.abs(h - m.at[1]) < 0.1, `she stands level in it, at ${h.toFixed(2)} (drawn ${m.at[1]})`);
  });
  cameraCheck(name, hall, level, [...new Set(L.places.map((p) => p.y))]);
}

console.log(failed ? `\n${failed} FAILED` : '\nall as it should be');
process.exit(failed ? 1 : 0);
