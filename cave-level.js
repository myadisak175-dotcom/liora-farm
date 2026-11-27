// cave-level.js
// The dungeon's forest hall as a level for the game's player (player-moves.js: her run, climbing, the magic jump, wading):
// one job, to say what the hall is like where she is. Made for cave-hall.html on 28 Nov 2026 ("จะเล่นยังไง ... ไม่มีให้ไต่
// กระโดดสี่ชั้น วิ่ง"); the hall's shape is tools/make-cave-hall.py's, drawn by cave-hall.js, which hands this its floor map.
//
//   const level = createCaveLevel(hall)          hall: cave-hall.js' (floorMap, layout, crowns, trunks, colliders)
//   createPlayer({ level, ... })                 what the player (and her steps, her camera) ask of it:
//     level.heightAt(x, z)           the floor's height; inside the rock, far up (her camera comes in close before a wall)
//     level.standAt(x, z, y)         where her feet are: the floor (one floor under every spot: the levels stand side by side,
//                                    never one over another), the rock's edge taken as the floor beside it (so a wall is
//                                    no face to climb: the walls lean in over the hall, she would climb into the roof)
//     level.footing(x, z, y)         'ground' she stands on; 'cliff' a face she climbs, falls past or slides down (a slope of
//                                    0.9 or more, as in the hill village); 'water' too deep to wade (there is none: the pool
//                                    is waded); 'wall' the hall's rock (the walls' feet too, which lean in over the hall: she
//                                    would climb into the roof; the columns, boulders, stalagmites; the ways in and on past
//                                    their crystals), or a roof lower than she stands; 'out' past the hall
//     level.waterDepthAt(x, z, y)    the pool's depth there (0 elsewhere)
//     level.ceilAt(x, z, y)          the roof over her: the lowest of the rock's underside round where she is (in the air her
//                                    head stops under it: player-moves.js)
//     level.surfaceAt(x, z, y)       what is underfoot, for her steps (step-sounds.js): 'grass' (moss, fallen leaves: soft),
//                                    'earth', 'sand', 'stone' (the faces, their edges, the stones' tops)
//     level.confine(p, from)         a step onto a face or into a wall: along its edge, or stopped (the hill village's own)
//     level.colliders, cameraTrunks, crowns, spawn, radius
//   level.places                     where the page's buttons put her: [{ name, x, z, heading, y }], the first where she begins

const NONE = -32768;          // (the floor map's: rock all the way up there)
const ROCK = 60;              // m: the rock's height to her camera (a wall, it comes in close before it)
const ROOM = 2.0;             // m between the floor and the roof she needs to stand there (she is 1.75 m)
const CLIFF = 0.9;            // a slope this steep is a face (the hill village's)
const E = 0.35;               // m either side the slope is measured over
const SWIM = 1.05;            // water this deep she swims (player-moves.js' own, at 1.75 m)
const HEAD = 0.3;             // m round her the roof is looked for (the lowest of it)

export function createCaveLevel(hall) {
  const M = hall.floorMap, L = hall.layout;
  const { nx, nz, x0, z0, cell } = M;
  const n = nx * nz;
  const fl = new Float32Array(n), ce = new Float32Array(n), ok = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const f = M.fl[i], c = M.ce[i];
    fl[i] = f === NONE ? NaN : f / 100;
    ce[i] = c === NONE ? NaN : c / 100;
    ok[i] = f !== NONE && ce[i] - fl[i] >= ROOM && M.paint[i * 4 + 3] < 200 ? 1 : 0;      // (255: a wall's foot, a rock, a way closed)
  }
  // a face this near the rock (two columns: 0.9 m) leads into it: no face of hers, a wall (a boulder's skirt, a wall's foot)
  const near = new Uint8Array(n);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (ok[i * nz + j]) continue;
    for (let a = Math.max(0, i - 2); a <= Math.min(nx - 1, i + 2); a++) for (let b = Math.max(0, j - 2); b <= Math.min(nz - 1, j + 2); b++) near[a * nz + b] = 1;
  }
  const pool = L.pool, poolR = pool.r + 2.0;

  // the floor at a spot, from the four columns round it: those in the rock left out (the rest weighed as they are near)
  // (none of them in the air: `none`)
  const floorOnly = (x, z, none) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return none;
    const u = fx - i, v = fz - j, k = i * nz + j;
    const a = fl[k], b = fl[k + nz], c = fl[k + 1], d = fl[k + nz + 1];
    let s = 0, w = 0, q;
    if (a === a) { q = (1 - u) * (1 - v); s += a * q; w += q; }
    if (b === b) { q = u * (1 - v); s += b * q; w += q; }
    if (c === c) { q = (1 - u) * v; s += c * q; w += q; }
    if (d === d) { q = u * v; s += d * q; w += q; }
    return w > 1e-6 ? s / w : none;
  };
  // ... and for her camera, the rock counted as far up
  const heightAt = (x, z) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return ROCK;
    const u = fx - i, v = fz - j, k = i * nz + j;
    const a = fl[k], b = fl[k + nz], c = fl[k + 1], d = fl[k + nz + 1];
    const A = a === a ? a : ROCK, B = b === b ? b : ROCK, C = c === c ? c : ROCK, D = d === d ? d : ROCK;
    return (A * (1 - u) + B * u) * (1 - v) + (C * (1 - u) + D * u) * v;
  };
  const standAt = (x, z) => floorOnly(x, z, ROCK);
  const slope = (x, z) => {
    const h = standAt(x, z);
    const gx = (floorOnly(x + E, z, h) - floorOnly(x - E, z, h)) / (2 * E), gz = (floorOnly(x, z + E, h) - floorOnly(x, z - E, h)) / (2 * E);
    return Math.hypot(gx, gz);
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
  // the roof: the lowest of the rock's underside at her and round her (columns in the rock left out)
  const roofAt = (x, z) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return Infinity;
    const u = fx - i, v = fz - j, k = i * nz + j;
    const a = ce[k], b = ce[k + nz], c = ce[k + 1], d = ce[k + nz + 1];
    let s = 0, w = 0, q;
    if (a === a) { q = (1 - u) * (1 - v); s += a * q; w += q; }
    if (b === b) { q = u * (1 - v); s += b * q; w += q; }
    if (c === c) { q = (1 - u) * v; s += c * q; w += q; }
    if (d === d) { q = u * v; s += d * q; w += q; }
    return w > 1e-6 ? s / w : Infinity;
  };
  const ceilAt = (x, z) => Math.min(roofAt(x, z), roofAt(x + HEAD, z), roofAt(x - HEAD, z), roofAt(x, z + HEAD), roofAt(x, z - HEAD));
  const surfaceAt = (x, z) => {
    const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return 'stone';
    const k = (i * nz + j) * 4, p = M.paint;
    if (p[k + 3] >= 128) return 'stone';
    if (p[k + 1] > 128) return 'sand';
    if (p[k] > 128) return 'earth';
    return 'grass';                                     // (moss and fallen leaves: soft underfoot)
  };
  // a step she may not take (a face, a wall: player-moves.js asks once the land has had its say): along the edge with the
  // part of her step that runs along it, or stopped walking (nearly) straight in; put somewhere she may not stand, back to
  // the nearest spot she may (the hill village's own confine, line for line)
  const walkable = (x, z) => footing(x, z) === 'ground';
  const confine = (p, from = null) => {
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
  const colliders = hall.colliders.slice();
  for (const [x, z, r] of L.gates || []) colliders.push([x, z, r]);      // (the crystals across the ways in and on)

  return {
    heightAt, standAt, footing, waterDepthAt, ceilAt, surfaceAt, confine,
    colliders, cameraTrunks: hall.trunks, crowns: hall.crowns,
    spawn: { x: L.spawn.x, z: L.spawn.z, yaw: L.spawn.yaw },
    radius: 1e4,
    places: L.places || [],
    slope,
  };
}
