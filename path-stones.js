// path-stones.js  —  small stones along the ways, placed by rules (as the trees are, in the map's tool)
//
// One job: to say where stones lie along the ways. The rock kit (rocks.js) draws them, painted like the map's other rocks.
// Every way is walked a little at a time, and at each step the land beside it decides what, if anything, lies there:
//   the edges      most of them: a scatter of loose pebbles kicked toward the sides, on the earth just inside where the grass
//                  begins (out in the grass they would be hidden), where feet do not wear them away
//   the middle     only now and then a flat stone worn level with the earth (never loose pebbles: feet keep the middle bare)
//   bends          more on the outside of a bend (thrown out by every turn), and more where two ways meet
//   slopes         a steep way sheds bigger stones too: a middling one at its edge now and then
//   water          near the water the stones are worn smooth and flat, and there are more of them
//   scatters       they lie in loose patches along the way, with bare stretches between (a slow noise), never evenly spaced;
//                  each patch a few pebbles of different sizes, one or two bigger than the rest
//   never          in the water, on a bridge, on another way's trodden middle, or anywhere the level says (inside a
//                  building's ground, a field ...)
// Each pebble is the kit's flat stone made small and a little taller: a few dozen triangles from a few metres off (the kit's
// heap of pebbles is a thousand), so a whole map's worth stays light.
//
//   const list = pathStones({ ways: [{ points: [[x, z], ...], half }], near, slopeAt, nearWater, skip, seed })
//     near(x, z) -> { d, half }    the nearest way's middle: how far, and how wide that way is (ground-paths.js P.near)
//     nearWater(x, z) -> metres    how far the water is (or a big number with none near)
//     skip(x, z) -> true           where nothing may lie (water, bridges, buildings, fields)
//   -> [{ type: 'flagstone' | 'stone', seed, x, z, ry, s, sy }]   (ry in degrees, as the rock kit takes it)

import { _internal } from './stylized-nature.js';

const { fbm3, mulberry32 } = _internal;
const STEP = 0.6;                 // metres walked along a way between two looks at it
const SHAPES = 4;                 // shapes of each kind of stone (the rock kit's seeds 1..4)

function densify(points, step) {   // points every `step` metres along the way
  const out = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  return out;
}

export function pathStones({ ways, near, slopeAt, nearWater = () => 1e9, skip = () => false, seed = 1 }) {
  const rng = mulberry32(seed * 7331 + 17), out = [];
  const grid = new Map(), CELL = 1.0;
  const crowded = (x, z, r) => {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    for (let i = gx - 1; i <= gx + 1; i++) for (let j = gz - 1; j <= gz + 1; j++) for (const q of grid.get(i + ',' + j) || []) if (Math.hypot(q[0] - x, q[1] - z) < r + q[2]) return true;
    return false;
  };
  const put = (type, x, z, s, r, sy = 1) => {
    if (skip(x, z) || crowded(x, z, r)) return false;
    const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([x, z, r]);
    out.push({ type, seed: 1 + Math.floor(rng() * SHAPES), x, z, ry: rng() * 360, s, sy });
    return true;
  };
  // a loose patch of pebbles round (x, z): a few small ones and one or two bigger; wet: worn flatter and rounder
  const scatter = (x, z, n, wet) => {
    for (let k = 0; k < n; k++) {
      const a = rng() * 6.283, d = Math.sqrt(rng()) * 0.55, big = k < (n > 4 ? 2 : 1);
      const s = big ? 0.5 + rng() * 0.25 : 0.24 + rng() * 0.2;
      put('flagstone', x + Math.cos(a) * d, z + Math.sin(a) * d, s, s * 0.22, wet ? 1.3 + rng() * 0.4 : 1.8 + rng() * 1.0);
    }
  };
  for (const w of ways) {
    if (!w.points || w.points.length < 2) continue;
    const pts = densify(w.points, STEP), half = w.half || 1.1;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, z] = pts[i];
      // which way the way runs here, and how hard it turns (over a couple of metres either side): + to the left
      const a = pts[Math.max(0, i - 4)], b = pts[Math.min(pts.length - 1, i + 4)];
      const tx0 = x - a[0], tz0 = z - a[1], tx1 = b[0] - x, tz1 = b[1] - z, l0 = Math.hypot(tx0, tz0) || 1, l1 = Math.hypot(tx1, tz1) || 1;
      const turn = (tx0 * tz1 - tz0 * tx1) / (l0 * l1);                  // the sine of the angle it turns through
      const tx = (tx0 / l0 + tx1 / l1), tz = (tz0 / l0 + tz1 / l1), tl = Math.hypot(tx, tz) || 1, dx = tx / tl, dz = tz / tl;
      const patch = fbm3(x * 0.16, 7.7, z * 0.16, seed + 41, 2);           // where the stones lie in patches (slow), and bare stretches
      if (patch < 0.36) continue;
      const lots = (patch - 0.36) / 0.64;                                  // 0 at a patch's edge, 1 in its thick
      const water = nearWater(x, z), wet = water < 4 ? 1 - water / 4 : 0;
      const steep = Math.min(1, Math.max(0, (slopeAt(x, z) - 0.12) / 0.25));
      let meet = 0;                                                        // another way close by: where two meet
      for (const sd of [-1, 1]) { const q = near(x - dz * sd * (half + 1.2), z + dx * sd * (half + 1.2)); if (q.d < q.half * 0.9) meet = 1; }
      for (const side of [-1, 1]) {
        const outer = side * turn < 0 ? Math.min(1, Math.abs(turn) * 4) : 0;      // the outside of a bend
        const p = 0.38 * (0.35 + lots) * (1 + 1.6 * outer + 1.2 * meet + 0.8 * wet + 0.5 * steep);
        if (rng() > p) continue;
        const o = side * half * (0.55 + rng() * 0.45), f = (rng() - 0.5) * STEP;      // on the earth, just inside where the grass begins
        const sx = x - dz * o + dx * f, sz = z + dx * o + dz * f;
        const own = near(sx, sz);
        if (own.d < own.half * 0.45) continue;                               // (on another way's trodden middle)
        if (steep > 0.5 && rng() < 0.2) put('stone', sx, sz, 0.38 + rng() * 0.3, 0.45);           // a bigger one shed by a steep way
        else if (wet > 0.3 && rng() < 0.4) put('stone', sx, sz, 0.26 + rng() * 0.22, 0.32, 0.5);  // one worn smooth and flat by the water
        scatter(sx, sz, 3 + Math.floor(rng() * (3 + 4 * lots)), wet > 0.3);
      }
      // now and then a flat stone worn level into the middle (not on a steep way: there the earth runs off it)
      if (steep < 0.4 && rng() < 0.03 * (0.5 + lots)) {
        const o = (rng() - 0.5) * half * 0.9;
        put('flagstone', x - dz * o, z + dx * o, 0.65 + rng() * 0.45, 0.45);
      }
    }
  }
  return out;
}
