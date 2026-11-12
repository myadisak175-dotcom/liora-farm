// farm-shape.js
// The farmland round the village above the falls. The village itself is left exactly as it is; round it the map grows:
// to the east and the west, fields laid out on the same two levels as the village's terraces (so one walks straight out of
// the village onto them), and behind it, where the ridge stood, rice terraces stepping up the hill with the upper river
// running down between them in a channel. Ramps lead from one level to the next.
//
// This file only knows where things are and how the land bends (pure height math, no meshes); valley-level.js builds the
// farmsteads, fences, crops and paddy water on it:
//
//   createValley({ reshape: (x, z, h) => FS.reshape(x, z, AB.reshape(x, z, h)), trails: [...AB.trails, ...FS.trails] })
//   FS.walkable(x, z)   on the farmland and somewhere one may stand (not in a paddy, a crop bed or the river)
//   FS.inFarm(x, z)     anywhere on the farmland (what grew there before does not grow there now)
//   FS.paddies          the flooded rice fields: { x0, x1, z0, z1, y (water level) }
//   FS.levelAt(x, z)    the farmland's own level there (null: not farmland)
import { _internal } from './stylized-nature.js';

const { fbm3 } = _internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// the village's own levels: the lower terrace, the upper one, and the strip at the back (stylized-terrain.js: PLAT + rises)
const LOW = 14.65, UP = 20.15, BACK = 24.65;
// where the upper river runs through the rice terraces (the plateau river's line north of the village, from
// stylized-terrain.js for this map's seed: lipX + 3 sin((z - zLip) 0.08))
const riverX = z => -4.914 + 3 * Math.sin((z + 46.23) * 0.08);
const RIVER_HALF = 2.3 + 1.5;

export const FARM = {
  // level ground (x0, x1, z0, z1, y): the east and west fields, the strip behind the village carried on round, and the rice
  // terraces stepping up to the north
  terraces: [
    { x0: 49, x1: 101, z0: -65, z1: -44, y: LOW + 0.5 }, { x0: 49, x1: 101, z0: -90, z1: -67, y: UP + 0.5 },
    { x0: -101, x1: -49, z0: -65, z1: -44, y: LOW + 0.5 }, { x0: -101, x1: -49, z0: -90, z1: -67, y: UP + 0.5 },
    { x0: -47, x1: 47, z0: -90, z1: -86.6, y: BACK },
    { x0: -101, x1: 101, z0: -110, z1: -92, y: BACK + 2.2, rice: true },
    { x0: -101, x1: 101, z0: -126, z1: -112, y: BACK + 4.6, rice: true },
    { x0: -101, x1: 101, z0: -146, z1: -128, y: BACK + 7.0, rice: true },
  ],
  // ramps from one level to the next: x, from z (and its level) to z (and its level), half width. The one at x 44 starts
  // on the village's upper terrace (core: it is cut into the village's own ground, at its empty east end)
  ramps: [
    { x: 74, za: -57, zb: -75, half: 2.0 }, { x: -74, za: -57, zb: -75, half: 2.0 },
    { x: 86, za: -80, zb: -101, half: 2.0 }, { x: -79, za: -80, zb: -101, half: 2.0 },
    { x: 44, za: -76, zb: -100, half: 2.0, core: true, ya: UP },
    { x: 40, za: -104, zb: -118, half: 1.8 }, { x: -44, za: -104, zb: -118, half: 1.8 },
    { x: 18, za: -120, zb: -134, half: 1.8 }, { x: -26, za: -120, zb: -134, half: 1.8 },
  ],
  // dry patches left on the rice terraces (a hut, a threshing floor) and bridges over the river between them (at z)
  dry: [{ x0: 28, x1: 42, z0: -108.5, z1: -96 }, { x0: -60, x1: -48, z0: -124.5, z1: -114 }],
  bridges: [-109.2, -125.2],
  // where one walks from the village's terraces out onto the fields (the land between is the village's own edge)
  links: [{ x0: 41, x1: 50, z0: -65, z1: -46 }, { x0: 41, x1: 50, z0: -84, z1: -67 }, { x0: -50, x1: -41, z0: -65, z1: -46 }, { x0: -50, x1: -45, z0: -84, z1: -67 }],
  // farmsteads: houses (door on the side the yaw turns +z to), each in a fenced yard (x0, x1, z0, z1, the side its gate
  // is on: 'w' | 'e' | 'n' | 's', and where along that side); barns; the pasture; the orchard; the small things
  houses: [
    { x: 62.5, z: -54, yaw: -Math.PI / 2, w: 6.4, d: 5, floors: 1, seed: 31, yard: [56, 70, -61, -47, 'w', -54] },
    { x: 63, z: -78.5, yaw: -Math.PI / 2, w: 6, d: 5, floors: 2, seed: 32, yard: [56.5, 70, -85, -71.5, 'w', -77] },
    { x: -62.5, z: -54, yaw: Math.PI / 2, w: 6.4, d: 5, floors: 1, seed: 33, yard: [-70, -56, -61, -47, 'e', -54] },
    { x: -63, z: -77.5, yaw: Math.PI / 2, w: 6, d: 5, floors: 2, seed: 34, yard: [-70, -56.5, -84.5, -70.5, 'e', -77] },
    { x: 35, z: -102.5, yaw: 0, w: 4.6, d: 4, floors: 1, seed: 35 },
  ],
  barns: [{ x: 92, z: -80.5, yaw: -Math.PI / 2, seed: 36 }, { x: -93.5, z: -50.5, yaw: Math.PI / 2, seed: 37 }],
  pasture: [[-100, -64], [-78, -64], [-78, -46], [-100, -46]],
  orchard: { x0: 72, x1: 84, z0: -88, z1: -68, step: 4.4 },
  wells: [[77, -52], [-77, -79]],
  props: [
    ['hay', 96, -73, 0.4], ['hay', 98.5, -76, 1.2], ['cart', 86, -73.5, 2.4], ['woodpile', 68.5, -49, 0], ['barrels', 69, -84, 0.6],
    ['hay', -97, -58, 0.8], ['woodpile', -68.5, -84, 0], ['crates', -68.5, -49, 1], ['cart', -72, -68.5, -0.6],
    ['sheep', -90, -56, 0.3], ['sheep', -86, -59, 2.1], ['sheep', -83, -52, 4], ['sheep', -88, -50.5, 1], ['sheep', -95, -59, 5.2], ['sheep', -82, -61, 3.3],
    ['hay', 38.5, -98.5, 0.2], ['bench', 31, -98.5, 0], ['crates', 39.5, -106, 1.2],
  ],
  // crop beds on the east and west fields: x0, x1, z0, z1, what grows (they come out as fields in valley-level.js)
  plots: [
    { x0: 80, x1: 88, z0: -62, z1: -47, crop: 'cabbage' }, { x0: 90, x1: 98, z0: -62, z1: -47, crop: 'wheat' },
    { x0: -100, x1: -92, z0: -87, z1: -70, crop: 'wheat' }, { x0: -90.5, x1: -84, z0: -87, z1: -70, crop: 'carrot' },
  ],
};

// ---- the terraces' heights: each level is flat (a few centimetres of unevenness), with a bank a couple of metres wide
// between two of them; it fades back into the land as it was at the farmland's outer edges
const sdRect = (t, x, z) => { const dx = Math.max(t.x0 - x, 0, x - t.x1), dz = Math.max(t.z0 - z, 0, z - t.z1); const out = Math.hypot(dx, dz); return out > 0 ? out : -Math.min(x - t.x0, t.x1 - x, z - t.z0, t.z1 - z); };
const T = FARM.terraces;
const rampLevels = FARM.ramps.map(r => {
  const lv = z => { let best = null, bd = 1e9; for (const t of T) { const d = sdRect(t, r.x, z); if (d < bd) { bd = d; best = t; } } return best.y; };
  return { ...r, ya: r.ya ?? lv(r.za), yb: r.yb ?? lv(r.zb) };
});
const rampAt = (r, x, z) => {                          // the ramp's height here and how much it holds (0..1)
  const dx = Math.abs(x - r.x), zlo = Math.min(r.za, r.zb), zhi = Math.max(r.za, r.zb);
  if (dx > r.half + 1.5 || z < zlo - 1 || z > zhi + 1) return null;
  return { y: lerp(r.ya, r.yb, Math.min(1, Math.max(0, (z - r.za) / (r.zb - r.za)))), w: ss(r.half + 1.5, r.half - 0.2, dx) * ss(zlo - 1, zlo, z) * ss(zhi + 1, zhi, z) };
};
// the village core is never touched (and nor is the guild's ground, at its back corner)
const core = (x, z) => ss(49, 46.5, Math.abs(x)) * ss(-87.2, -86.4, z);
// the rice terraces: paddies with low dikes, laid out in cells either side of the river, short of the ramps and dry patches
const PAD = [];
for (const t of T) if (t.rice) {
  const cells = [];
  for (let x = t.x0 + 2; x < t.x1 - 2; x += 15.5) cells.push([x, Math.min(t.x1 - 2, x + 14)]);
  for (const [x0, x1] of cells) {
    const p = { x0, x1, z0: t.z0 + 1.6, z1: t.z1 - 1.6, y: t.y - 0.12 };
    // cut away from the river, the ramps and the dry patches
    const rx = riverX((p.z0 + p.z1) / 2), gap = RIVER_HALF + 2.6;
    if (p.x0 < rx + gap && p.x1 > rx - gap) { if (rx - gap - p.x0 > 5) PAD.push({ ...p, x1: rx - gap }); if (p.x1 - (rx + gap) > 5) PAD.push({ ...p, x0: rx + gap }); continue; }
    let q = [p];
    for (const r of FARM.ramps) q = q.flatMap(c => (r.x + r.half + 1.4 > c.x0 && r.x - r.half - 1.4 < c.x1 && Math.min(r.za, r.zb) < c.z1 && Math.max(r.za, r.zb) > c.z0)
      ? [{ ...c, x1: r.x - r.half - 1.4 }, { ...c, x0: r.x + r.half + 1.4 }].filter(k => k.x1 - k.x0 > 5) : [c]);
    for (const d of FARM.dry) q = q.flatMap(c => (d.x1 + 1 > c.x0 && d.x0 - 1 < c.x1 && d.z1 > c.z0 && d.z0 < c.z1)
      ? [{ ...c, x1: d.x0 - 1 }, { ...c, x0: d.x1 + 1 }].filter(k => k.x1 - k.x0 > 5) : [c]);
    PAD.push(...q);
  }
}
const inPaddy = (x, z, pad = 0) => PAD.some(p => x > p.x0 - pad && x < p.x1 + pad && z > p.z0 - pad && z < p.z1 + pad);
const inPlot = (x, z, pad = 0) => FARM.plots.some(p => x > p.x0 - pad && x < p.x1 + pad && z > p.z0 - pad && z < p.z1 + pad);

// the farmland's level at (x, z) and how much of it is farmland (0..1)
function farm(x, z) {
  let wsum = 0, ysum = 0, wmax = 0;
  for (const t of T) {
    const d = sdRect(t, x, z);
    if (d > 2.5) continue;
    const w = ss(1.4, -1.0, d);
    wsum += w; ysum += w * t.y; wmax = Math.max(wmax, ss(2.5, 0.2, d));
  }
  if (wmax <= 0 || wsum <= 0) return null;
  let y = ysum / wsum;
  for (const r of rampLevels) {                        // ramps: an even slope across the bank between two levels
    if (r.core) continue;
    const q = rampAt(r, x, z);
    if (q) y = lerp(y, q.y, q.w);
  }
  return { y, w: wmax };
}

export function reshape(x, z, h) {
  if (z > -40 || Math.abs(x) > 108) return h;
  const f = farm(x, z);
  if (!f) {
    for (const r of rampLevels) if (r.core) { const q = rampAt(r, x, z); if (q) h = lerp(h, q.y, q.w); }
    return h;
  }
  const keep = core(x, z);
  if (keep >= 1) return h;
  let y = f.y + (fbm3(x * 0.11, 3.7, z * 0.11, 91, 2) - 0.5) * 0.18;
  if (inPaddy(x, z)) {                                  // a paddy: sunk a little below its dikes, under water
    const p = PAD.find(q => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
    const e = Math.min(x - p.x0, p.x1 - x, z - p.z0, p.z1 - z);
    y = lerp(y, p.y - 0.3, ss(0.1, 0.7, e));
  }
  let out = lerp(h, y, f.w * (1 - keep));
  for (const r of rampLevels) if (r.core) { const q = rampAt(r, x, z); if (q) out = lerp(out, q.y, q.w); }      // (cut into the village's own ground too)
  // the upper river keeps its channel through the rice terraces
  if (z < -86) { const d = Math.abs(x - riverX(z)); out = lerp(out, Math.min(out, h), ss(RIVER_HALF + 1.2, RIVER_HALF - 0.2, d)); }
  return out;
}

// ---- dirt paths between things (drawn on the ground, not cut into it)
const trails = [
  [[42, -55], [52, -55], [60, -54]], [[52, -55], [62, -63.5], [70, -61.5], [74, -57]], [[74, -75], [82, -76], [86, -80]],
  [[-42, -55], [-52, -55], [-60, -54]], [[-52, -55], [-62, -63.5], [-70, -61.5], [-74, -57]], [[-74, -75], [-79, -77.5], [-79, -80]],
  [[40, -75], [52, -76], [60, -77]], [[-46, -78], [-56, -77], [-60, -77]],
  [[-95, -109.2], [95, -109.2]], [[-95, -125.2], [95, -125.2]],
  [[36, -74.5], [40, -75.5], [44, -76]], [[44, -100], [40, -101.5], [36, -100]],
];

// ---- queries
const onRamp = (x, z) => rampLevels.some(r => Math.abs(x - r.x) < r.half - 0.2 && z > Math.min(r.za, r.zb) - 0.5 && z < Math.max(r.za, r.zb) + 0.5);
const inFarm = (x, z) => z < -40 && core(x, z) < 0.5 && T.some(t => sdRect(t, x, z) < 0.3);
const onLink = (x, z) => FARM.links.some(l => x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1);
const onBridge = (x, z) => FARM.bridges.some(bz => Math.abs(z - bz) < 0.9 && Math.abs(x - riverX(bz)) < RIVER_HALF + 2.5);
const walkable = (x, z) => {
  if (!inFarm(x, z) && !onRamp(x, z) && !onLink(x, z)) return false;
  if (onBridge(x, z)) return true;
  if (z < -86 && Math.abs(x - riverX(z)) < RIVER_HALF + 0.6) return false;
  return !inPaddy(x, z, -0.25) && !inPlot(x, z, 0.1);
};
const levelAt = (x, z) => { const f = farm(x, z); return f && f.w > 0.5 ? f.y : null; };

export const FS = { reshape, trails, walkable, inFarm, onRamp, onLink, inPaddy, inPlot, levelAt, paddies: PAD, riverX, riverHalf: RIVER_HALF, ramps: rampLevels, rice: T.filter(t => t.rice) };
