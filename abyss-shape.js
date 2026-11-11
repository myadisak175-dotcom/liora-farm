// abyss-shape.js
// The abyss at the foot of the valley: a round pit 80 m across, cut into the plateau, whose floor nobody has ever seen.
// The river reaches it at floor level through the valley's mouth, spreads out among rock islands and pours over the brink
// in four falls; three brooks run in across the plateau and drop in from the rim. The walls step down in ragged ledges
// into the mist that hangs in the pit, and below the mist there is only blue, then dark. Under each fall the ledges are
// worn away into a sheer chute, so the water drops clear.
//
// This file only knows where things are and how the land bends (pure height math, no meshes); abyss-scene.js draws the
// falls and the clouds, valley-level.js plugs both into the valley:
//
//   createValley({ reshape: AB.reshape, widen: AB.widen, waterAt: AB.waterAt, trails: AB.trails, climbs: [ABYSS.climb] })
//   AB.rimDist(x, z)   metres outside the brink (negative: over the pit)        AB.inPit(x, z, pad)
//   AB.onRim(x, z)     on the walk round the rim (between the rail and the forest)   AB.onSpur(x, z)   on the lookout
//   AB.islandAt(x, z)  0..1 how far up one of the river's rock islands
//   AB.falls           every fall: { x, z, a (radians, round the centre), width, top, kind: 'lip' | 'brook' }
//   AB.brooks          the brooks with their lines smoothed: { pts: [[x, z], ...], half, level }
//   AB.bridges         where the rim walk crosses a brook: { x, z, yaw (the way the deck runs), len }
//   AB.ledge(k)        the k-th ledge down: { y, u0, u1 } (u: metres in from the brink)
//   AB.span            the rope bridge across the pit: { a, b, mid: [x, z], len, yaw, sag }; AB.spanDist(x, z) metres from its line
import { _internal } from './stylized-nature.js';

const { fbm3 } = _internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const D = Math.PI / 180;

// ---- where everything is (metres; z grows down the valley, angles are atan2(z - Z, x - X) in degrees: north, up the
// valley, is -90, east 0, south 90)
export const ABYSS = {
  x: -5, z: 106, r: 40,                 // the centre and the brink's radius
  rimH: 15,                             // the plateau round it is levelled to this
  // the river's falls over the brink, west to east: angle, width of the water
  lips: [{ a: -112, w: 4.2 }, { a: -100.5, w: 5.0 }, { a: -89, w: 5.4 }, { a: -77.5, w: 4.2 }],
  // rock islands in the river where it spreads out: x, z, radius, height above the bed, what grows on top
  // (the five along the brink stand between the falls, half cut away by the pit)
  islands: [
    { at: [-118.5, 2.0], r: 2.6, h: 2.6, grow: 'pine' }, { at: [-106.3, 1.5], r: 2.3, h: 2.2, grow: 'bush' },
    { at: [-94.7, 1.6], r: 2.2, h: 2.9, grow: 'sapling' }, { at: [-83.2, 1.5], r: 2.1, h: 2.0, grow: 'bush' },
    { at: [-71.2, 2.0], r: 2.6, h: 2.4, grow: 'pine' },
    { x: -15, z: 58.5, r: 3.4, h: 2.2, grow: 'birch' }, { x: -1, z: 56.5, r: 2.4, h: 1.4, grow: 'bush' },
    { x: -9, z: 62, r: 3.6, h: 0.25 }, { x: 5.5, z: 61.5, r: 2.8, h: 0.2 }, { x: -19.5, z: 64, r: 2.0, h: 0.35 },   // low sandbars
  ],
  // brooks that run in across the plateau from the map's edge and fall in from the rim: their lines, half width
  brooks: [
    { pts: [[67, 87], [57, 90.5], [47, 94.5], [37, 96.6], [29, 97.6]], half: 1.8 },           // from the east
    { pts: [[-67, 109.5], [-58, 104.8], [-50, 102], [-42, 100.7], [-35, 100.6]], half: 1.9 },  // from the west
    { pts: [[26, 173], [22.5, 161], [18, 150], [13.5, 141.5], [10.5, 136]], half: 1.6 },       // from the south
  ],
  spur: { a: 95, out: 3, in: 6, half: 2.7 },          // the lookout: a tongue of rock out over the pit, facing the river's falls
  walk: { from: -62, to: 238, off: 4.6 },             // the trodden way round the rim: from the top of the climb, round by the south
  // a rope bridge across the pit's north end, just past the brink the river falls over: from the clifftop by the top of the
  // path up (east) to the far end of the rim walk (west), each end a step back from where the cliff drops away
  span: { a: [14.9, 67.8], b: [-29.8, 68.6], sag: 3.2 },
  climb: { side: 1, z0: 26, z1: 66 },                 // the way up from the valley floor: cut into the east cliff, coming out by the rim
  // the ledges the walls step down in: how deep, and how far in from the brink each one starts
  ledges: [{ y: -9, u: 0 }, { y: -21, u: 5.2 }, { y: -34, u: 10.2 }, { y: -48, u: 14.4 }],
};

const { x: X, z: Z, r: R0, rimH: RIM } = ABYSS;
const polar = (a, d) => [X + d * Math.cos(a), Z + d * Math.sin(a)];
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
// noise round the circle (seamless all the way round)
const ring = (a, f, k, seed) => fbm3(Math.cos(a) * f + k * 3.1, Math.sin(a) * f, k * 1.7, seed, 2);

// ---- brooks: their lines, smoothed and walked in 0.5 m steps; distance to a brook
const brooks = ABYSS.brooks.map(b => {
  const pts = [];
  for (let i = 0; i < b.pts.length - 1; i++) {
    const p0 = b.pts[Math.max(0, i - 1)], p1 = b.pts[i], p2 = b.pts[i + 1], p3 = b.pts[Math.min(b.pts.length - 1, i + 2)];
    const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5);
    for (let k = 0; k < n; k++) {                 // Catmull-Rom
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(b.pts[b.pts.length - 1]);
  const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
  return { pts, half: b.half, level: RIM - 1.0, bed: RIM - 1.85, box: [Math.min(...xs) - 6, Math.max(...xs) + 6, Math.min(...zs) - 6, Math.max(...zs) + 6] };
});
const brookDist = (x, z) => {
  let best = 99, which = null;
  for (const b of brooks) {
    if (x < b.box[0] || x > b.box[1] || z < b.box[2] || z > b.box[3]) continue;
    const p = b.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i][0], az = p[i][1], dx = p[i + 1][0] - ax, dz = p[i + 1][1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - b.half;
      if (d < best) { best = d; which = b; }
    }
  }
  return { d: best, brook: which };                 // d: metres from the brook's edge (negative: in it)
};
// where a line first comes within radius rad of the centre (walking along it)
const crossing = (pts, rad) => {
  for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - X, pts[i][1] - Z) < rad(pts[i])) return i;
  return pts.length - 1;
};

// ---- the falls and the brink. Where water goes over, the brink is a smooth arc; elsewhere it wanders a couple of metres.
const lipFalls = ABYSS.lips.map(l => ({ a: l.a * D, width: l.w, kind: 'lip', top: -0.02 }));
const brookFalls = brooks.map(b => {
  const i = crossing(b.pts, () => R0);
  const [x, z] = b.pts[i];
  return { a: Math.atan2(z - Z, x - X), width: b.half * 2 + 0.6, kind: 'brook', top: b.level - 0.02 };
});
const FALLS = [...lipFalls, ...brookFalls];
const chuteAt = a => {                              // 0..1: how much the wall below is a sheer chute (under a fall)
  let c = 0;
  for (const f of FALLS) {
    const half = (f.width / 2 + 1.2) / R0, d = Math.abs(angDiff(a, f.a));
    c = Math.max(c, ss(half + 3.5 * D, half, d));
  }
  return c;
};
const smoothAt = a => {                              // 0..1: how much the brink keeps to a true arc here (at the falls)
  let c = 0;
  for (const f of FALLS) c = Math.max(c, ss((f.width / 2 + 4) / R0 + 6 * D, (f.width / 2) / R0, Math.abs(angDiff(a, f.a))));
  return c;
};
export const rimR = a => R0 + (ring(a, 1.7, 0, 91) - 0.5) * 5.5 * (1 - smoothAt(a));
for (const f of FALLS) { [f.x, f.z] = polar(f.a, rimR(f.a)); }

// ---- the islands (some given by angle and distance out from the brink)
const islands = ABYSS.islands.map(i => {
  if (i.at) { const a = i.at[0] * D, [x, z] = polar(a, rimR(a) + i.at[1]); return { ...i, x, z }; }
  return { ...i };
});
const islandAt = (x, z) => {
  let m = 0;
  for (const i of islands) {
    const d = Math.hypot(x - i.x, z - i.z);
    if (d > i.r + 1.5 || i.h <= 1) continue;
    const dd = d + (fbm3(x * 0.6, 2.3, z * 0.6, 57, 2) - 0.5) * 1.1;
    if (i.h > 1) m = Math.max(m, ss(i.r, i.r - 0.9, dd));          // (the low sandbars can be walked over)
  }
  return m;
};

// ---- the lookout
const SP = ABYSS.spur, spA = SP.a * D;
const spurA = polar(spA, rimR(spA) + SP.out), spurB = polar(spA, rimR(spA) - SP.in);
const spurDist = (x, z) => {
  const [ax, az] = spurA, dx = spurB[0] - ax, dz = spurB[1] - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};

// ---- the ledges, as a profile going in from the brink. u: metres in from the brink, top: the land at the brink.
const LEDGES = ABYSS.ledges;
// each ledge wanders in and out (broad swings and smaller bites), so in places one runs wide and in others it is nearly
// gone and two drops run together into one tall wall; its height wanders too
const ledgeStart = (k, a) => LEDGES[k].u + (k ? (ring(a, 2.3, k, 133) - 0.5) * 6.5 + (ring(a, 7.5, k + 3, 137) - 0.5) * 2.2 : 0);
const pitProfile = (u, a, top) => {
  let p = top;
  for (let k = 0; k < LEDGES.length; k++) {
    const s0 = ledgeStart(k, a), s1 = s0 + (k ? 1.2 : 0.9);
    const y = LEDGES[k].y + (ring(a, 3.1, k + 7, 151) - 0.5) * 5 + (ring(a, 9, k + 9, 157) - 0.5) * 1.6 - 0.12 * Math.max(0, u - s1);      // ledges lean in a little
    p = lerp(p, Math.min(p, y), ss(s0, s1, u));
  }
  const fu = 18.5 + (ring(a, 2.0, 11, 171) - 0.5) * 3;
  p = lerp(p, -80, ss(fu, fu + 7, u));                 // the funnel ...
  p = lerp(p, -235, ss(fu + 7, fu + 13, u));          // ... and the eye of the abyss
  // under a fall: a sheer chute instead of ledges
  const c = chuteAt(a);
  if (c > 0) {
    let q = lerp(top, -68, ss(0, 0.8, u));
    q = Math.min(q, lerp(-68, -235, ss(fu + 4, fu + 13, u)));
    p = lerp(p, q, c);
  }
  return p;
};

// ---- the rim walk: arcs round the brink, broken where a brook crosses (a bridge goes there)
const walkR = a => rimR(a) + ABYSS.walk.off;
const bridges = [];
for (const b of brooks) {
  const i = crossing(b.pts, ([x, z]) => walkR(Math.atan2(z - Z, x - X)));
  const [x, z] = b.pts[i], p = b.pts[Math.max(0, i - 2)], q = b.pts[Math.min(b.pts.length - 1, i + 2)];
  const flow = Math.atan2(q[1] - p[1], q[0] - p[0]);
  // the deck runs across the flow; its yaw is the turn that lays a bridge built along x across the brook
  bridges.push({ x, z, yaw: -(flow + Math.PI / 2), len: b.half * 2 + 5.2, a: Math.atan2(z - Z, x - X), brook: b });
}
const trails = [];
{
  let cur = [];
  for (let deg = ABYSS.walk.from; deg <= ABYSS.walk.to + 0.01; deg += 1.5) {
    const a = deg * D, [x, z] = polar(a, walkR(a));
    const gap = bridges.some(br => Math.hypot(x - br.x, z - br.z) < br.len / 2 - 0.6) || spurDist(x, z) < SP.half - 0.5;
    if (gap) { if (cur.length > 1) trails.push(cur); cur = []; } else cur.push([x, z]);
  }
  if (cur.length > 1) trails.push(cur);
  // and out along the lookout to its tip
  trails.push([polar(spA, walkR(spA)), polar(spA, rimR(spA) - SP.in + 1.2)]);
}

// ---- the rope bridge across the pit: from just outside the brink on one side to the other, straight across
const SPN = ABYSS.span;
const span = (() => {
  const { a, b } = SPN;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], len, yaw: -Math.atan2(b[1] - a[1], b[0] - a[0]), sag: SPN.sag };
})();
const spanDist = (x, z) => {                          // metres from the bridge's line (99 beyond its ends)
  const [ax, az] = span.a, dx = span.b[0] - ax, dz = span.b[1] - az;
  const t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
  if (t < -0.08 || t > 1.08) return 99;
  return Math.abs((x - ax) * dz - (z - az) * dx) / span.len;
};

// ---- how the land bends
const near = (x, z) => Math.hypot(x - X, z - Z);
function reshape(x, z, h) {
  const dx = x - X, dz = z - Z, d = Math.hypot(dx, dz);
  if (d > 130) return h;
  const a = Math.atan2(dz, dx);
  // the valley is not carried on past the pit: south of it the land is plateau
  if (z > Z + 4) h = lerp(h, Math.max(h, RIM + (fbm3(x * 0.05, 1.7, z * 0.05, 61, 2) - 0.5) * 2), ss(Z + 4, Z + 28, z));
  // round the pit the plateau is levelled into a broad rim (the valley floor and the cliffs' lower ledge are left alone)
  const lev = ss(10.5, 13, h) * ss(R0 + 27, R0 + 14, d);
  if (lev > 0) h = lerp(h, RIM + (fbm3(x * 0.08, 4.2, z * 0.08, 67, 2) - 0.5) * 0.9, lev);
  // where the river spreads out before the brink its bed is shallow, with deeper runs down to each fall
  if (z > 48 && z < Z && h < -0.45) {
    const k = ss(48, 57, z);
    h = lerp(h, -0.42 + (fbm3(x * 0.25, 6.1, z * 0.25, 71, 2) - 0.5) * 0.3, k);
    for (const f of lipFalls) {
      const [lx, lz] = [f.x, f.z], ux = Math.cos(f.a), uz = Math.sin(f.a);            // outwards from the centre = upstream
      const t = Math.max(0, Math.min(7, (x - lx) * ux + (z - lz) * uz)), q = Math.hypot(x - lx - ux * t, z - lz - uz * t);
      if (q < f.width / 2 + 1.4) h = Math.min(h, lerp(-0.85, h, Math.min(1, ss(f.width / 2 - 0.6, f.width / 2 + 1.4, q) + ss(2, 7, t))));
    }
  }
  // brooks: a channel cut into the plateau, its bed level all the way (it is carved deeper where the land stands higher)
  const bd = brookDist(x, z);
  if (bd.d < 2.2 && near(x, z) > R0 - 2) {
    const b = bd.brook;
    h = Math.min(h, lerp(b.bed + (fbm3(x * 0.4, 3.3, z * 0.4, 73, 2) - 0.5) * 0.3, h, ss(-0.4, 2.2, bd.d)));
  }
  // rock islands in the river (and low sandbars)
  if (z > 50 && z < 80) for (const i of islands) {
    const di = Math.hypot(x - i.x, z - i.z);
    if (di > i.r + 1.6) continue;
    const dd = di + (fbm3(x * 0.6, 2.3, z * 0.6, 57, 2) - 0.5) * 1.1;
    const steep = i.h > 1 ? 0.9 : 2.2;
    const top = -0.45 + i.h + (fbm3(x * 0.9, 5.5, z * 0.9, 59, 2) - 0.5) * (i.h > 1 ? 0.5 : 0.1) - (i.h > 1 ? 0.25 * ss(i.r - 1.6, i.r - 0.6, dd) : 0);
    h = Math.max(h, lerp(h, top, ss(i.r, i.r - steep, dd)));
  }
  // the pit
  const u = rimR(a) - d;
  if (u > -0.5) h = Math.min(h, pitProfile(Math.max(0, u), a, h));
  // the lookout: a tongue of rock out over the pit, level with the rim, and under its tip a rib of rock that runs on down
  // into the pit, narrowing, so it reads as a spur of the wall and not a pillar standing on nothing
  const sd = spurDist(x, z);
  if (sd < SP.half + 1) h = Math.max(h, lerp(h, RIM + 0.05, ss(SP.half + 0.7, SP.half - 0.15, sd)));
  {
    const ux = Math.cos(spA), uz = Math.sin(spA), t = -((x - spurB[0]) * ux + (z - spurB[1]) * uz);      // metres on past the tip, inwards
    if (t > -1 && t < 16) {
      const off = Math.abs(-(x - spurB[0]) * uz + (z - spurB[1]) * ux), w = SP.half * (1 - t / 22) + 0.6;
      const rib = RIM - 3 - Math.max(0, t) * 3.4 - (fbm3(x * 0.5, 8.8, z * 0.5, 79, 2) - 0.5) * 2;
      if (off < w + 1.2) h = Math.max(h, lerp(h, Math.min(rib, RIM - 0.6), ss(w + 1.2, w - 0.6, off)));
    }
  }
  return h;
}

// ---- queries
const rimDist = (x, z) => near(x, z) - rimR(Math.atan2(z - Z, x - X));
const inPit = (x, z, pad = 0) => rimDist(x, z) < pad && spurDist(x, z) > SP.half - 0.2;
const onSpur = (x, z) => spurDist(x, z) < SP.half - 0.45;
const onRim = (x, z) => {                             // the walk round the rim, inside the rail, short of the forest
  const rd = rimDist(x, z);
  return rd > 1.75 && rd < 10.5 && brookDist(x, z).d > 0.7;
};
const waterAt = (x, z) => {
  if (rimDist(x, z) < -0.3 && spurDist(x, z) > SP.half + 0.5) return -1000;      // over the pit: no water, no beach
  const bd = brookDist(x, z);
  if (bd.d < 2.4) return bd.brook.level;
  return null;
};
const widen = z => 12 * ss(47, 61, z);
const ledge = k => { const L = LEDGES[k]; return { y: L.y, u0: L.u, u1: k + 1 < LEDGES.length ? LEDGES[k + 1].u : 18 }; };

export const AB = {
  reshape, widen, waterAt, trails, rimR, rimDist, inPit, onRim, onSpur, islandAt, brookDist, spurDist,
  falls: FALLS, brooks, bridges, islands, ledge, chuteAt, polar, span, spanDist,
  spur: { a: spA, base: spurA, tip: spurB, half: SP.half },
  walkR,
};
