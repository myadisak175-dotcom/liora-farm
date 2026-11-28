// tools/check-cave-level.mjs  —  cave-level.js checked without a browser:  node tools/check-cave-level.mjs
//
//   1. The three baked rooms (one floor under every spot) are read exactly as they were before a room could have several
//      floors: every answer of the level against the single-floor reading kept below (the level's own code until 28 Nov
//      2026), on a fine grid of spots, figure for figure.
//   2. Three made-up rooms with floors over one another, walked: a bridge over a hall, a stair winding down two turns over
//      itself, a tunnel under a floor (with a pit down into it, a dead end, a pool on each floor).
//   3. Her camera in all of them: never through a floor, a roof or a wall.
// Run it after changing cave-level.js, and after baking a room (add the room's name to ROOMS).

import { readFileSync } from 'node:fs';
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
    fl: new Int16Array(bin, F.floor, n), ce: new Int16Array(bin, F.ceil, n), paint: new Uint8Array(bin, F.paint, n * 4) };
  return { floorMap, layout: L, colliders: [], trunks: [], crowns: [] };
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

console.log(failed ? `\n${failed} FAILED` : '\nall as it should be');
process.exit(failed ? 1 : 0);
