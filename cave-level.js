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
//     level.cameraReach(ox, oy, oz, dx, dy, dz, far)
//                                    her camera (player-camera.js): how far it may go from (ox, oy, oz), over her shoulders,
//                                    along (dx, dy, dz), up to far, and still be in the room's air: over the floor, under the
//                                    roof, clear of the walls (and, where the hall has one, this side of the falling water:
//                                    hall.inward, hall.curtainAt). Thin things are no wall and no roof to it: a fang hanging
//                                    from the roof or rising from the floor, a column, a boulder (narrower than ~2.4 m); the
//                                    camera goes past them, and the room draws them thin where they would hide her
//                                    (fang-hall.js: hall.seeThrough). Until 28 Nov 2026 each page did this itself after the
//                                    camera had moved, with heightAt and ceilAt (every fang's tip a low roof, the rock's
//                                    60 m bleeding a column out from every wall), and brought the camera to 0.35 m from her
//                                    shoulders at once: in her head, and jumping metres from one frame to the next
//     level.colliders, cameraTrunks, crowns, spawn, radius
//   level.places                     where the page's buttons put her: [{ name, x, z, heading, y }], the first where she begins

const NONE = -32768;          // (the floor map's: rock all the way up there)
const ROCK = 60;              // m: the rock's height to her camera (a wall, it comes in close before it)
const ROOM = 2.0;             // m between the floor and the roof she needs to stand there (she is 1.75 m)
const CLIFF = 0.9;            // a slope this steep is a face (the hill village's)
const E = 0.35;               // m either side the slope is measured over
const SWIM = 1.05;            // water this deep she swims (player-moves.js' own, at 1.75 m)
const HEAD = 0.3;             // m round her the roof is looked for (the lowest of it)
// her camera's own picture of the room (cameraReach)
const CAM_SLIT = 0.8;         // m between floor and roof: lower than this, no room for a camera (rock, to it)
const CAM_THIN = 3;           // columns (1.2 m): rock narrower than twice this is no wall to her camera
const CAM_HANG = 4;           // columns (1.6 m): what hangs from the roof narrower than twice this is no roof to it
const CAM_WALL = 0.35;        // m it keeps from a wall,
const CAM_FLOOR = 0.3;        // over the floor,
const CAM_ROOF = 0.4;         // and under the roof
const CAM_STEP = 0.2;         // m: how finely its line is walked (then halved four times where it first meets rock)

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

  // ---- her camera's picture of the room: walls without the thin rock standing in the hall, a roof without what hangs
  // thin from it, and a floor under both (made once)
  // how far (columns) each column is from the nearest one marked (two sweeps: straight 1, diagonal root 2)
  const farFrom = (mark) => {
    const d = new Float32Array(n).fill(1e9), D = Math.SQRT2;
    for (let k = 0; k < n; k++) if (mark[k]) d[k] = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const k = i * nz + j; let v = d[k];
      if (i > 0) { v = Math.min(v, d[k - nz] + 1); if (j > 0) v = Math.min(v, d[k - nz - 1] + D); if (j < nz - 1) v = Math.min(v, d[k - nz + 1] + D); }
      if (j > 0) v = Math.min(v, d[k - 1] + 1);
      d[k] = v;
    }
    for (let i = nx - 1; i >= 0; i--) for (let j = nz - 1; j >= 0; j--) {
      const k = i * nz + j; let v = d[k];
      if (i < nx - 1) { v = Math.min(v, d[k + nz] + 1); if (j > 0) v = Math.min(v, d[k + nz - 1] + D); if (j < nz - 1) v = Math.min(v, d[k + nz + 1] + D); }
      if (j < nz - 1) v = Math.min(v, d[k + 1] + 1);
      d[k] = v;
    }
    return d;
  };
  // the walls: rock (or a slit too low for a camera) thicker than a fang, a column, a boulder; the map's own edge always
  const solid = new Uint8Array(n), open = new Uint8Array(n), core = new Uint8Array(n), wall = new Uint8Array(n);
  for (let k = 0; k < n; k++) { solid[k] = fl[k] !== fl[k] || !(ce[k] - fl[k] >= CAM_SLIT) ? 1 : 0; open[k] = 1 - solid[k]; }
  const toAir = farFrom(open);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const k = i * nz + j, edge = i <= CAM_THIN || j <= CAM_THIN || i >= nx - 1 - CAM_THIN || j >= nz - 1 - CAM_THIN;
    core[k] = solid[k] && (toAir[k] > CAM_THIN || edge) ? 1 : 0;
  }
  const toCore = farFrom(core);
  for (let k = 0; k < n; k++) wall[k] = solid[k] && toCore[k] <= CAM_THIN + 0.5 ? 1 : 0;
  const toWall = farFrom(wall);
  for (let k = 0; k < n; k++) toWall[k] *= cell;                       // (m)
  // the floor and the roof for it: the room's own; under the thin rock taken away, what is round it
  const camFl = new Float32Array(n), camCe = new Float32Array(n);
  for (let k = 0; k < n; k++) { const has = fl[k] === fl[k] && ce[k] === ce[k] && !wall[k]; camFl[k] = has ? fl[k] : NaN; camCe[k] = has ? ce[k] : NaN; }
  const fillIn = (a) => {                                              // (a hole in it that is no wall: the mean of what is round it, ring by ring)
    for (let pass = 0; pass < 12; pass++) {
      const got = [];
      for (let i = 1; i < nx - 1; i++) for (let j = 1; j < nz - 1; j++) {
        const k = i * nz + j;
        if (a[k] === a[k] || wall[k]) continue;
        let s = 0, w = 0;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const v = a[k + di * nz + dj]; if (v === v) { s += v; w++; } }
        if (w) got.push(k, s / w);
      }
      if (!got.length) break;
      for (let q = 0; q < got.length; q += 2) a[got[q]] = got[q + 1];
    }
  };
  // the roof without what hangs thin from it: over every column the highest roof within CAM_HANG, then of that the lowest
  // within CAM_HANG (a dip narrower than twice that is gone; a wide one stays); by a wall (rock: as low as can be) the
  // room's own roof, fangs and all. Then smoothed a little, so the camera's reach does not step as she walks
  {
    const R = CAM_HANG, offs = [];
    for (let di = -R; di <= R; di++) for (let dj = -R; dj <= R; dj++) if (di * di + dj * dj <= R * R + 1) offs.push(di, dj);
    const hi = new Float32Array(n).fill(NaN), lo = new Float32Array(n).fill(NaN);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const k = i * nz + j; if (camCe[k] !== camCe[k]) continue;
      let m = -Infinity;
      for (let q = 0; q < offs.length; q += 2) { const a = i + offs[q], b = j + offs[q + 1]; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const v = camCe[a * nz + b]; if (v === v && v > m) m = v; }
      hi[k] = m;
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const k = i * nz + j; if (hi[k] !== hi[k]) continue;
      let m = Infinity;
      for (let q = 0; q < offs.length; q += 2) {
        const a = i + offs[q], b = j + offs[q + 1];
        if (a < 0 || b < 0 || a >= nx || b >= nz || wall[a * nz + b]) { m = -Infinity; break; }
        const v = hi[a * nz + b]; if (v === v && v < m) m = v;
      }
      lo[k] = Math.max(camCe[k], m);
    }
    for (let k = 0; k < n; k++) camCe[k] = lo[k];
    fillIn(camFl); fillIn(camCe);
    const sm = camCe.slice();
    for (let i = 1; i < nx - 1; i++) for (let j = 1; j < nz - 1; j++) {
      const k = i * nz + j; if (camCe[k] !== camCe[k]) continue;
      let s = 0, w = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const v = camCe[k + di * nz + dj]; if (v === v) { s += v; w++; } }
      sm[k] = s / w;
    }
    camCe.set(sm);
  }
  const curtain = hall.inward && hall.curtainAt ? (x, y, z) => hall.inward(x, z) < hall.curtainAt(y) + 0.45 : null;      // (the falling water in the mouth: beyond it nothing is made)
  // no place for a camera: in a wall or by it, under the floor, in the roof, past the falling water. m (0..1): how much of
  // the room it keeps from each (little right by her, where she herself stands by a wall or under a low roof; all of it
  // from a metre out)
  const noAir = (x, y, z, m) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return true;
    const u = fx - i, v = fz - j, k = i * nz + j;
    const qa = (1 - u) * (1 - v), qb = u * (1 - v), qc = (1 - u) * v, qd = u * v;
    if (toWall[k] * qa + toWall[k + nz] * qb + toWall[k + 1] * qc + toWall[k + nz + 1] * qd < CAM_WALL * m) return true;
    let f = 0, c = 0, w = 0;
    if (camFl[k] === camFl[k]) { f += camFl[k] * qa; c += camCe[k] * qa; w += qa; }
    if (camFl[k + nz] === camFl[k + nz]) { f += camFl[k + nz] * qb; c += camCe[k + nz] * qb; w += qb; }
    if (camFl[k + 1] === camFl[k + 1]) { f += camFl[k + 1] * qc; c += camCe[k + 1] * qc; w += qc; }
    if (camFl[k + nz + 1] === camFl[k + nz + 1]) { f += camFl[k + nz + 1] * qd; c += camCe[k + nz + 1] * qd; w += qd; }
    if (w < 1e-6) return true;
    return y < f / w + CAM_FLOOR * m || y > c / w - CAM_ROOF * m || (curtain !== null && curtain(x, y, z));
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
    heightAt, standAt, footing, waterDepthAt, ceilAt, surfaceAt, confine, cameraReach,
    colliders, cameraTrunks: hall.trunks, crowns: hall.crowns,
    spawn: { x: L.spawn.x, z: L.spawn.z, yaw: L.spawn.yaw },
    radius: 1e4,
    places: L.places || [],
    slope,
  };
}
