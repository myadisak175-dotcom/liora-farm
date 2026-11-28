// cave-level.js
// A cave room as a level for the game's player (player-moves.js: her run, climbing, the magic jump, wading) and her
// camera: one job, to say what the room is like where she is. Made for the forest hall on 28 Nov 2026 ("จะเล่นยังไง ...
// ไม่มีให้ไต่ กระโดดสี่ชั้น วิ่ง"); every room that is baked as a floor map is read by it (the forest hall, the fang hall, the
// boss hall), and since the same day a room may have SEVERAL FLOORS OVER ONE SPOT ("มาปรับระบบถ้ำของเรา ให้สามารถออกแบบได้
// หลากหลาย และนำไปขยายต่อยอดแมพได้ในอนาคต"): a stair winding down over itself, a bridge over a way, a tunnel under a floor.
//
//   const level = createCaveLevel(hall)          hall: a room's (floorMap, layout, crowns, trunks, colliders; inward and
//                                                curtainAt where falling water closes its mouth)
//   createPlayer({ level, ... })
//
// THE FLOOR MAP (hall.floorMap; a room's tool bakes it, tools/make-*.py):
//   { nx, nz, x0, z0, cell }      columns of rock and air, cell metres apart: column (i, j) stands at x0 + i * cell,
//                                 z0 + j * cell, and is number k = i * nz + j
//   layers                        how many spans a column may have (left out: 1, as every room had until now)
//   fl, ce (Int16, cm)            a SPAN is a stretch of air in a column: its floor and the roof over it. Span s of column
//                                 k is at s * nx * nz + k; a column's spans go from the lowest up, with none left out
//                                 between (-32768: no such span, and none above it). Bake a span only where she could at
//                                 least crouch (a metre of air or more), and keep two floors of one column 1.4 m apart or
//                                 more (rock and air between them): then a floor 0.6 m over her feet is always her own
//   paint (Uint8 x 4, a span)     what lies on that floor: r earth, g sand (over 128: yes), else moss; a 200 or more:
//                                 nowhere to stand (a wall's foot, a rock, a way closed); 128 or more: stone underfoot
//   One floor under every spot is the same map with layers 1: such a room is read exactly as it was (checked, figure for
//   figure, against the three rooms: tools/check-cave-level.mjs).
//
// WHAT IS ASKED OF IT. Everything is asked at a height, hers (y: her feet; the player asks all of it so). The span of a
// column that counts at a height is the highest whose floor is no more than 0.6 m over it (she stands on it, or is in the
// air over it); under them all, the lowest (the top of the rock she faces). Asked without a height: at the height last
// asked (hers, a moment ago), and before anything was asked at the layout's spawn.y (the top floor, without one).
//     level.heightAt(x, z)           the floor's height; inside the rock, far up
//     level.standAt(x, z, y)         where her feet are: the floor of her span, the rock's edge taken as the floor beside it
//                                    (so a wall is no face to climb: the walls lean in over the hall)
//     level.footing(x, z, y)         'ground' she stands on; 'cliff' a face she climbs, falls past or slides down (a slope of
//                                    0.9 or more, as in the hill village); 'water' too deep to wade; 'wall' the room's rock
//                                    (the walls' feet, the columns, boulders, stalagmites, the ways closed), a roof lower
//                                    than she stands, or (a room of several floors) a face whose top is under a roof too
//                                    low to come up under: a tunnel's end under the floor above it; 'out' past the room
//     level.waterDepthAt(x, z, y)    a pool's depth there (0 elsewhere, and on a floor over or under the pool's own). A room
//                                    of the kit says its water in the floor map instead (floorMap.water: the water's
//                                    surface over each span, cm; -32768 none): a stream's slopes, a pool has its hollow's
//                                    shape, and each is on its own span
//     level.ripple(x, z, size, life, kind)   only where the room draws rings on its water (hall.ripple: cave-room.js): the
//                                    player's own call (a step in the water, a splash), handed on with the water's height there
//     level.ceilAt(x, z, y)          the roof over her: the lowest of her span's roof round where she is (in the air her
//                                    head stops under it: player-moves.js). Under a bridge: the bridge's underside
//     level.surfaceAt(x, z, y)       what is underfoot, for her steps (step-sounds.js): 'grass' (moss, fallen leaves: soft),
//                                    'earth', 'sand', 'stone' (the faces, their edges, the stones' tops). Where no paint
//                                    lies: floorMap.bare ('stone' in the kit's rooms, cave-room.js), else 'grass'
//     level.confine(p, from)         a step onto a face or into a wall: along its edge, or stopped (the hill village's own)
//     level.cameraReach(ox, oy, oz, dx, dy, dz, far)
//                                    her camera (player-camera.js): how far it may go from (ox, oy, oz), over her shoulders,
//                                    along (dx, dy, dz), up to far, and still be in the room's air. See HER CAMERA, below
//     level.colliders, cameraTrunks, crowns, spawn, radius, layers
//   level.places                     where the page's buttons put her: [{ name, x, z, heading, y }], the first where she begins
//   A collider is [x, z, r] or, standing only between two heights, [x, z, r, low, high] (player-moves.js): in a room of
//   several floors give a pillar its heights, or it stops her on the floor above it too. A place and the spawn carry y:
//   the page hands it to player.teleport(x, z, yaw, y), or she is put on whichever floor is at the height last asked.
//
// HER CAMERA. The room is cut in level slices 0.4 m apart, each made the first time the camera comes to its height: in a
// slice a column is air where some span has that height, rock elsewhere; rock narrower than ~2.4 m in that slice is taken
// away (a fang hanging from the roof or rising from the floor, a column, a boulder, a thin bridge: the camera goes past
// them, and the room draws them thin where they would hide her: fang-hall.js, hall.seeThrough); what is left are the
// walls, and each column's distance from them. The camera keeps 0.35 m from a wall (read between the slices over and
// under it, a slice past its span's own floor or roof left out: a wall that leans in is kept from all the way up), 0.3 m
// over its span's floor and 0.4 m under its roof, each where the rock beyond is a wall and not a thin thing (a fang's tip
// is no roof to it), and less of all three right beside her (she herself stands by walls and under low roofs). So it
// stays on its own side of a floor between two storeys. Where the hall has falling water in its mouth it keeps this side
// of it. (Until 28 Nov 2026 each page did this itself after the camera had moved, with heightAt and ceilAt, and brought it
// to 0.35 m from her shoulders at once: in her head, jumping metres from one frame to the next. Then, for a few hours,
// from one flat picture of the walls and the roof: a room with one floor only.)

const NONE = -32768;          // (the floor map's: no span here)
const ROCK = 60;              // m: the rock's height where heightAt is asked inside it
const ROOM = 2.0;             // m between the floor and the roof she needs to stand there (she is 1.75 m)
const CLIFF = 0.9;            // a slope this steep is a face (the hill village's)
const E = 0.35;               // m either side the slope is measured over
const SWIM = 1.05;            // water this deep she swims (player-moves.js' own, at 1.75 m)
const HEAD = 0.3;             // m round her the roof is looked for (the lowest of it)
const UP = 0.6;               // m: a floor this much over her feet is still hers (a step, a slope's next column)
const UNDER = 1.5;            // m of air she needs over a face's top to come up onto it (several floors: else a wall)
// her camera's picture of the room (cameraReach)
const CAM_H = 0.4;            // m between its slices
const CAM_THIN = 3;           // columns (1.2 m): rock narrower than twice this is no wall to it
const CAM_WALL = 0.35;        // m it keeps from a wall,
const CAM_FLOOR = 0.3;        // over a floor,
const CAM_ROOF = 0.4;         // and under a roof
const CAM_IN = 0.02;          // m from a wall, in a slice: in it
const CAM_STEP = 0.2;         // m: how finely its line is walked (then halved four times where it first meets rock)
const FAR = 60000;            // (a column's distance before it is worked out: thirds of a column, in 16 bits)

export function createCaveLevel(hall) {
  const M = hall.floorMap, L = hall.layout;
  const { nx, nz, x0, z0, cell } = M;
  const n = nx * nz, K = M.layers || 1, N = K * n;
  const fl = new Float32Array(N), ce = new Float32Array(N), ok = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const f = M.fl[i], c = M.ce[i];
    fl[i] = f === NONE ? NaN : f / 100;
    ce[i] = c === NONE ? NaN : c / 100;
    ok[i] = f !== NONE && ce[i] - fl[i] >= ROOM && M.paint[i * 4 + 3] < 200 ? 1 : 0;      // (255: a wall's foot, a rock, a way closed)
  }
  // the height a thing is asked at when none is given: the one last asked (hers)
  let here = L.spawn && typeof L.spawn.y === 'number' ? L.spawn.y : Infinity;
  const at = (y) => (y === undefined || y !== y ? here : (here = y));
  // the span of column k that counts at a height (its place in fl and ce; -1: rock all the way): the highest whose floor
  // is no more than UP over it; under them all, the lowest
  const spanAt = K === 1
    ? (k) => (fl[k] === fl[k] ? k : -1)
    : (k, y) => {
      if (fl[k] !== fl[k]) return -1;
      let q = k;
      for (let i = k + n; i < N; i += n) { if (!(fl[i] <= y + UP)) break; q = i; }
      return q;
    };
  // a face this near the rock (two columns: 0.9 m) leads into it: no face of hers, a wall (a boulder's skirt, a wall's foot)
  const near = new Uint8Array(N);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    for (let q = i * nz + j; q < N; q += n) {
      if (fl[q] !== fl[q]) break;
      let by = 0;
      for (let a = Math.max(0, i - 2); a <= Math.min(nx - 1, i + 2) && !by; a++) for (let b = Math.max(0, j - 2); b <= Math.min(nz - 1, j + 2); b++) {
        const r = spanAt(a * nz + b, fl[q]);
        if (r < 0 || !ok[r]) { by = 1; break; }
      }
      near[q] = by;
    }
  }
  const BARE = M.bare || 'grass';       // what is underfoot where no paint lies (the kit's rooms: 'stone'; the first three rooms' floors are moss)
  const pools = (L.pools || (L.pool ? [L.pool] : [])).map((p) => ({ x: p.c[0], z: p.c[1], r2: (p.r + 2.0) * (p.r + 2.0), level: p.level }));
  // the kit's water: its surface over each span (NaN: none)
  let wl = null;
  if (M.water) { wl = new Float32Array(N); for (let i = 0; i < N; i++) wl[i] = M.water[i] === NONE ? NaN : M.water[i] / 100; }

  // the floor at a spot, from the four columns round it: those in the rock left out (the rest weighed as they are near)
  // (none of them in the air: `none`)
  const floorOnly = (x, z, y, none) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return none;
    const u = fx - i, v = fz - j, k = i * nz + j;
    const a = spanAt(k, y), b = spanAt(k + nz, y), c = spanAt(k + 1, y), d = spanAt(k + nz + 1, y);
    let s = 0, w = 0, q;
    if (a >= 0) { q = (1 - u) * (1 - v); s += fl[a] * q; w += q; }
    if (b >= 0) { q = u * (1 - v); s += fl[b] * q; w += q; }
    if (c >= 0) { q = (1 - u) * v; s += fl[c] * q; w += q; }
    if (d >= 0) { q = u * v; s += fl[d] * q; w += q; }
    return w > 1e-6 ? s / w : none;
  };
  // ... and with the rock counted as far up
  const heightAt = (x, z) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return ROCK;
    const u = fx - i, v = fz - j, k = i * nz + j;
    const a = spanAt(k, here), b = spanAt(k + nz, here), c = spanAt(k + 1, here), d = spanAt(k + nz + 1, here);
    const A = a >= 0 ? fl[a] : ROCK, B = b >= 0 ? fl[b] : ROCK, C = c >= 0 ? fl[c] : ROCK, D = d >= 0 ? fl[d] : ROCK;
    return (A * (1 - u) + B * u) * (1 - v) + (C * (1 - u) + D * u) * v;
  };
  const standAt = (x, z, y) => floorOnly(x, z, at(y), ROCK);
  const slopeAt = (x, z, y) => {
    const h = floorOnly(x, z, y, ROCK);
    const gx = (floorOnly(x + E, z, y, h) - floorOnly(x - E, z, y, h)) / (2 * E), gz = (floorOnly(x, z + E, y, h) - floorOnly(x, z - E, y, h)) / (2 * E);
    return Math.hypot(gx, gz);
  };
  const slope = (x, z, y) => slopeAt(x, z, at(y));
  // the roof of her span: the rock's underside at a spot (columns in the rock left out)
  const roofAt = (x, z, y) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return Infinity;
    const u = fx - i, v = fz - j, k = i * nz + j;
    const a = spanAt(k, y), b = spanAt(k + nz, y), c = spanAt(k + 1, y), d = spanAt(k + nz + 1, y);
    let s = 0, w = 0, q;
    if (a >= 0 && ce[a] === ce[a]) { q = (1 - u) * (1 - v); s += ce[a] * q; w += q; }
    if (b >= 0 && ce[b] === ce[b]) { q = u * (1 - v); s += ce[b] * q; w += q; }
    if (c >= 0 && ce[c] === ce[c]) { q = (1 - u) * v; s += ce[c] * q; w += q; }
    if (d >= 0 && ce[d] === ce[d]) { q = u * v; s += ce[d] * q; w += q; }
    return w > 1e-6 ? s / w : Infinity;
  };
  const ceilAt = (x, z, y) => { const h = at(y); return Math.min(roofAt(x, z, h), roofAt(x + HEAD, z, h), roofAt(x - HEAD, z, h), roofAt(x, z + HEAD, h), roofAt(x, z - HEAD, h)); };
  // the kit's water at a spot: its surface from the columns round it that have any (NaN: none there)
  const waterAt = (x, z, y) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return NaN;
    const u = fx - i, v = fz - j, k = i * nz + j;
    const a = spanAt(k, y), b = spanAt(k + nz, y), c = spanAt(k + 1, y), d = spanAt(k + nz + 1, y);
    let s = 0, w = 0, q;
    if (a >= 0 && wl[a] === wl[a]) { q = (1 - u) * (1 - v); s += wl[a] * q; w += q; }
    if (b >= 0 && wl[b] === wl[b]) { q = u * (1 - v); s += wl[b] * q; w += q; }
    if (c >= 0 && wl[c] === wl[c]) { q = (1 - u) * v; s += wl[c] * q; w += q; }
    if (d >= 0 && wl[d] === wl[d]) { q = u * v; s += wl[d] * q; w += q; }
    return w > 1e-6 ? s / w : NaN;
  };
  // a pool is on one floor: on a floor over it or under it there is no water
  const depthAt = wl ? (x, z, y) => { const w = waterAt(x, z, y); return w === w ? Math.max(0, w - floorOnly(x, z, y, w)) : 0; } : (x, z, y) => {
    for (let i = 0; i < pools.length; i++) {
      const p = pools[i], dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz > p.r2) continue;
      if (K > 1 && !(roofAt(x, z, y) > p.level)) continue;
      return Math.max(0, p.level - floorOnly(x, z, y, p.level));
    }
    return 0;
  };
  const waterDepthAt = (x, z, y) => depthAt(x, z, at(y));
  const footingAt = (x, z, y) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return 'out';
    const k = i * nz + j;
    const a = spanAt(k, y), b = spanAt(k + nz, y), c = spanAt(k + 1, y), d = spanAt(k + nz + 1, y);
    if (a < 0 || b < 0 || c < 0 || d < 0 || !ok[a] || !ok[b] || !ok[c] || !ok[d]) return 'wall';
    // (several floors) the highest of the four floors under the lowest of the four roofs with no room to come up: the
    // top of rock she cannot come up onto from here (a tunnel's end, the floor above it over the rock)
    if (K > 1 && Math.max(fl[a], fl[b], fl[c], fl[d]) > Math.min(ce[a], ce[b], ce[c], ce[d]) - UNDER) return 'wall';
    if (depthAt(x, z, y) >= SWIM) return 'water';
    if (slopeAt(x, z, y) < CLIFF) return 'ground';
    return near[a] || near[b] || near[c] || near[d] ? 'wall' : 'cliff';
  };
  const footing = (x, z, y) => footingAt(x, z, at(y));
  const surfaceAt = (x, z, y) => {
    const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return 'stone';
    const col = i * nz + j, q = K === 1 ? col : spanAt(col, at(y));
    const k = (q < 0 ? col : q) * 4, p = M.paint;
    if (p[k + 3] >= 128) return 'stone';
    if (p[k + 1] > 128) return 'sand';
    if (p[k] > 128) return 'earth';
    if (p[k + 2] <= 128) return BARE;                   // (nothing lying on it: the room says what its floor is)
    return 'grass';                                     // (moss and fallen leaves: soft underfoot)
  };
  // a step she may not take (a face, a wall: player-moves.js asks once the land has had its say): along the edge with the
  // part of her step that runs along it, or stopped walking (nearly) straight in; put somewhere she may not stand, back to
  // the nearest spot she may (the hill village's own confine, line for line; at the height she comes from)
  const confine = (p, from = null) => {
    const y = at(from && typeof from.y === 'number' ? from.y : typeof p.y === 'number' ? p.y : undefined);
    // (several floors: and no floor far over her or under her: the top of the rock she faces is ground too, asked from
    // its foot, and she is not to be put up on it through the rock)
    const walkable = K === 1 ? (x, z) => footingAt(x, z, y) === 'ground' : (x, z) => footingAt(x, z, y) === 'ground' && Math.abs(floorOnly(x, z, y, y) - y) < 1.2;
    if (walkable(p.x, p.z)) return;
    if (from && walkable(from.x, from.z)) {
      const vx = p.x - from.x, vz = p.z - from.z, len = Math.hypot(vx, vz);
      let nx = 0, nz = 0;                                                // which way the edge faces her
      for (let i = 0; i < 16; i++) { const a = i / 8 * Math.PI, sx = Math.sin(a), sz = Math.cos(a); if (!walkable(from.x + sx * 0.4, from.z + sz * 0.4)) { nx += sx; nz += sz; } }
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-6 && len > 1e-6) {
        nx /= nl; nz /= nl;
        const into = Math.max(0, vx * nx + vz * nz), ax = vx - nx * into, az = vz - nz * into, along = Math.hypot(ax, az);
        if (along > len * 0.4) for (const [k, off] of [[1, 0], [1, 0.4], [0.6, 0.6]]) {
          let dx = ax * k - nx * along * off, dz = az * k - nz * along * off;
          const dl = Math.hypot(dx, dz); if (dl > len) { dx *= len / dl; dz *= len / dl; }
          if (walkable(from.x + dx, from.z + dz)) { p.x = from.x + dx; p.z = from.z + dz; return; }
        }
      }
      p.x = from.x; p.z = from.z; return;
    }
    for (let rr = 0.15; rr <= 3; rr += 0.15) for (let a = 0; a < 12; a++) {
      const x = p.x + Math.cos(a * Math.PI / 6) * rr, z = p.z + Math.sin(a * Math.PI / 6) * rr;
      if (walkable(x, z)) { p.x = x; p.z = z; return; }
    }
  };

  // ---- her camera's picture of the room: level slices, each made when the camera first comes to its height
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < N; i++) if (fl[i] === fl[i]) { if (fl[i] < low) low = fl[i]; if (ce[i] > high) high = ce[i]; }
  if (!(high > low)) { low = 0; high = 1; }
  const slicesN = Math.ceil((high - low) / CAM_H) + 2, slices = new Array(slicesN).fill(null);
  const dA = new Uint16Array(n), dB = new Uint16Array(n), solid = new Uint8Array(n);
  // how far each column is from the nearest one at 0 (two sweeps: 3 to the next column, 4 askew; the rest begin at FAR)
  const spread = (d) => {
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const k = i * nz + j; let v = d[k], t;
      if (v === 0) continue;
      if (i > 0) { t = d[k - nz] + 3; if (t < v) v = t; if (j > 0) { t = d[k - nz - 1] + 4; if (t < v) v = t; } if (j < nz - 1) { t = d[k - nz + 1] + 4; if (t < v) v = t; } }
      if (j > 0) { t = d[k - 1] + 3; if (t < v) v = t; }
      d[k] = v;
    }
    for (let i = nx - 1; i >= 0; i--) for (let j = nz - 1; j >= 0; j--) {
      const k = i * nz + j; let v = d[k], t;
      if (v === 0) continue;
      if (i < nx - 1) { t = d[k + nz] + 3; if (t < v) v = t; if (j > 0) { t = d[k + nz - 1] + 4; if (t < v) v = t; } if (j < nz - 1) { t = d[k + nz + 1] + 4; if (t < v) v = t; } }
      if (j < nz - 1) { t = d[k + 1] + 3; if (t < v) v = t; }
      d[k] = v;
    }
  };
  // slice l, at low + l * CAM_H: every column's distance from a wall there (cm, 255 and more as 255)
  const sliceAt = (l) => {
    if (slices[l]) return slices[l];
    const y = low + l * CAM_H;
    for (let k = 0; k < n; k++) {                                       // air: some span's
      let air = 0;
      for (let q = k; q < N; q += n) { const f = fl[q]; if (f !== f) break; if (f <= y && y <= ce[q]) { air = 1; break; } }
      solid[k] = 1 - air; dA[k] = air ? 0 : FAR;
    }
    spread(dA);                                                         // (from the air)
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {         // the thick of the rock: deep in it, and the map's own edge
      const k = i * nz + j, edge = i <= CAM_THIN || j <= CAM_THIN || i >= nx - 1 - CAM_THIN || j >= nz - 1 - CAM_THIN;
      dB[k] = solid[k] && (dA[k] > CAM_THIN * 3 || edge) ? 0 : FAR;
    }
    spread(dB);                                                         // (from the thick of it)
    for (let k = 0; k < n; k++) dA[k] = solid[k] && dB[k] <= CAM_THIN * 3 + 1 ? 0 : FAR;      // the walls: rock within reach of its thick
    spread(dA);                                                         // (from a wall)
    const S = new Uint8Array(n), cm = cell * 100 / 3;
    for (let k = 0; k < n; k++) S[k] = Math.min(255, Math.round(dA[k] * cm));
    return (slices[l] = S);
  };
  const curtain = hall.inward && hall.curtainAt ? (x, y, z) => hall.inward(x, z) < hall.curtainAt(y) + 0.45 : null;      // (the falling water in the mouth: beyond it nothing is made)
  // how far from a wall a spot is in slice l (m)
  const wallIn = (l, k, qa, qb, qc, qd) => {
    if (l < 0 || l >= slicesN) return 0;
    const S = sliceAt(l);
    return (S[k] * qa + S[k + nz] * qb + S[k + 1] * qc + S[k + nz + 1] * qd) / 100;
  };
  // no place for a camera: by a wall or in it, too near its span's floor or roof (where the rock beyond is a wall: a thin
  // thing is none), past the falling water. m (0..1): how much of each distance it keeps (little right beside her; all
  // of it from a metre out)
  const noAir = (x, y, z, m) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return true;
    const fy = (y - low) / CAM_H, l = Math.floor(fy);
    if (l < 0 || l >= slicesN - 1) return true;
    const u = fx - i, v = fz - j, t = fy - l, k = i * nz + j;
    const qa = (1 - u) * (1 - v), qb = u * (1 - v), qc = (1 - u) * v, qd = u * v;
    const f = floorOnly(x, z, y, NaN), c = roofAt(x, z, y);            // (its span's: the floor under it, the roof over that)
    let a = wallIn(l, k, qa, qb, qc, qd), b = wallIn(l + 1, k, qa, qb, qc, qd);
    if (f === f) {
      // a slice past the span's floor or roof says nothing of the walls at its own height: the other one alone
      const under = low + l * CAM_H < f, over = low + (l + 1) * CAM_H > c;
      if (under && !over) a = b; else if (over && !under) b = a; else if (under && over) a = b = Math.max(a, b);
      // (the rock beyond a floor or a roof is a wall when a slice just past it, or 0.3 m or 0.6 m further, is all wall
      // there: on a slope the nearest slice still has air at the lower columns; under a thin floor the furthest is past it)
      if (y < f + CAM_FLOOR * m) for (let e = 0; e < 0.7; e += 0.3) if (wallIn(Math.floor((f - e - low) / CAM_H), k, qa, qb, qc, qd) <= CAM_IN) return true;
      if (y > c - CAM_ROOF * m) for (let e = 0; e < 0.7; e += 0.3) if (wallIn(Math.ceil((c + e - low) / CAM_H), k, qa, qb, qc, qd) <= CAM_IN) return true;
    }
    return a * (1 - t) + b * t < Math.max(CAM_IN, CAM_WALL * m) || (curtain !== null && curtain(x, y, z));
  };
  const rockAt = (ox, oy, oz, dx, dy, dz, t) => noAir(ox + dx * t, oy + dy * t, oz + dz * t, Math.min(1, t));
  const cameraReach = (ox, oy, oz, dx, dy, dz, far) => {
    let t = CAM_STEP;
    for (; t < far; t += CAM_STEP) if (rockAt(ox, oy, oz, dx, dy, dz, t)) break;
    if (t >= far) { if (!rockAt(ox, oy, oz, dx, dy, dz, far)) return far; t = far; }
    let a = Math.max(0, t - CAM_STEP), b = t;                          // (clear at a, rock at b)
    for (let q = 0; q < 4; q++) { const h = (a + b) / 2; if (rockAt(ox, oy, oz, dx, dy, dz, h)) b = h; else a = h; }
    return a;
  };

  const colliders = hall.colliders.slice();
  for (const g of L.gates || []) colliders.push(g.slice());            // (the crystals across the ways in and on)

  return {
    heightAt, standAt, footing, waterDepthAt, ceilAt, surfaceAt, confine, cameraReach,
    colliders, cameraTrunks: hall.trunks, crowns: hall.crowns,
    spawn: { x: L.spawn.x, z: L.spawn.z, yaw: L.spawn.yaw, y: L.spawn.y },
    radius: 1e4,
    places: L.places || [],
    layers: K,
    slope,
    ...(hall.ripple ? { ripple: (x, z, size, life, kind) => { const w = wl ? waterAt(x, z, here) : NaN; if (w === w) hall.ripple(x, w, z, size, life, kind); } } : {}),
  };
}
