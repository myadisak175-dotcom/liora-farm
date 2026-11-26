// ground-paths.js  —  trodden dirt paths: warm sandy earth worn into the meadow, grass breaking into it in clumps at the edges,
// flat stones set into it and pebbles by its sides
//
// The way a studio lays a road over a landscape: the path is a ribbon that follows a line over the ground (a spline decal), with
// its own painted look, sitting a hair above the land. The ground's own colour map (stylized-grassfield.js) is told where the
// path is too, so the grass stops at it and the shadows fall on it, and the ribbon reads that map back: wherever the map says
// grass grows, the ribbon is not drawn, so the grass and the path meet along one ragged edge.
//
// Two looks (style):
//   'grit' (as it was): the two old earth pictures with their grit, a ragged edge where the grass begins, and a dark rim there;
//   'soft': smooth earth laid in with a brush (tools/make-path-paint.py), paler down the worn middle, and no line at the edge:
//           the earth goes to dry grass and fades into the meadow, while the grass beside it comes up short and thin, then
//           taller. The ribbon is then see-through at its edges (drawn after the land and the grass, before the water).
//
//   const P = createPaths({ paths: [{ points: [[x, z], ...], half: 1.2 }], seed, style: 'soft' });
//   heightFn: h += P.sink(x, z)                    the path lies a few centimetres below the grass
//   paint:    [earth, sand, mow] from P.paint(x, z)  bare earth on the path, clumps of grass at its edges, short grass beside it
//   const tex = await loadPathTextures(style)       the earth pictures for that look (grit: sand and dirt; soft: the paint), once
//   group.add(P.ribbon(heightAt, map, tex, bankAt))  the painted path itself (after the ground map is made; bankAt, if given:
//                                                  how high a spot stands above the water, so the soft look is wet toward it)
//   terrainMaterial(..., { ways: P.onLand(map, tex) })  or, in the soft look, the land draws the ways itself: no ribbon at all
//                                                  (see onLand). The land's own aBank does what bankAt does for a ribbon.
//   P.stones(heightAt)                             [{ type, seed, x, z, ry, s, y }] flat stones and pebbles to set into it
//   const h = P.add({ points, half })              after ribbon(): one more path, drawn at once (a way painted by hand)
//   P.remove(h)                                    and taken away again
//   P.flowers                                      [x, z, radius] places beside the path for a few flowers

import * as THREE from 'three';
import { _internal } from './stylized-nature.js';

const { fbm3, mulberry32, NOISE, HAZEF, rgb, shared } = _internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const COLORS = { light: '#e9d4a3', mid: '#d7ba82', dark: '#bb9a63', damp: '#a98b57', rim: '#94824f', speckLight: '#f4e8c8', speckDark: '#9b8253', cream: '#ead7a6' };
// the soft look's: the pale worn middle, the deeper tone of its broad patches (a tint over the earth), the browner earth toward
// its sides, and the dry grass it goes to where the meadow begins
const SOFT = { earth: '#dcc07c', cream: '#f5e3ac', deep: '#c9a45e', side: '#c6a25c', hay: '#b9b25a',
  wet: '#cdbda8' };      // what the earth is multiplied by where it is wet, toward the water (the banks' wet sand too: stylized-terrain.js sandWet)

// the two pictures of earth the path is painted with (seamless, from the old Liora Farm ground set): warm sand for the worn
// middle, browner dirt with grit for the edges and damp spots
// (the soft look has one picture of its own: earth laid in with a brush, tools/make-path-paint.py)
export async function loadPathTextures(style = 'grit') {
  const loader = new THREE.TextureLoader();
  const load = async name => {
    const t = await loader.loadAsync(new URL('./assets/ground/' + name, import.meta.url).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace;
    return t;
  };
  if (style === 'soft') { const paint = await load('path-paint.webp'); return { paint, dispose() { paint.dispose(); } }; }
  const [sand, dirt] = await Promise.all([load('path-sand.webp'), load('path-dirt.webp')]);
  return { sand, dirt, dispose() { sand.dispose(); dirt.dispose(); } };
}

// THE SLABS in JavaScript: the same sums as SLAB_GLSL below (and as NOISE's hash2 and noise2, stylized-nature.js: whole-number
// arithmetic, so they come out the same here as on any graphics chip), for what is placed by them: a flower may grow in a joint
// between the slabs or where a slab is gone, not on one (slabAt, made by createPaths once the ways' picture is made)
const m289 = x => x - Math.floor((x + 0.5) * (1 / 289)) * 289;
const perm289 = x => m289(m289(x * 34 + 1) * x);
const hash2 = (x, y) => perm289(m289(perm289(m289(Math.floor(x * 16 + 0.5))) + m289(Math.floor(y * 16 + 0.5)))) * (1 / 289);
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = m289(ix), b = m289(ix + 1), c = m289(iy), d = m289(iy + 1), h = (u, v) => perm289(m289(perm289(u) + v)) * (1 / 289);
  const h0 = h(a, c), h1 = h(b, c), h2 = h(a, d), h3 = h(b, d), lo = h0 + (h1 - h0) * fx;
  return lo + (h2 + (h3 - h2) * fx - lo) * fy;
}
const PAVE_S = 0.6;                                                        // (SLAB_GLSL's own)
// read: (x, z) -> [how paved, how much grass] at a point, as the shader reads its two pictures there
function slabAt(x, z, read) {
  const px = x / PAVE_S, pz = z / PAVE_S, ix = Math.floor(px), iz = Math.floor(pz), fx = px - ix, fz = pz - iz;
  const mid = (cx, cz) => [cx - ix + 0.5 + (hash2(cx + 0.3125, cz) - 0.5) * 0.8 - fx, cz - iz + 0.5 + (hash2(cx, cz + 0.6875) - 0.5) * 0.8 - fz];
  let mx = ix, mz = iz, rx = 0, rz = 0, md = 8;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const [ax, az] = mid(ix + i, iz + j), d = ax * ax + az * az;
    if (d < md) { md = d; rx = ax; rz = az; mx = ix + i; mz = iz + j; }
  }
  let e = 8;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    if (!i && !j) continue;
    const [ax, az] = mid(mx + i, mz + j), dx = ax - rx, dz = az - rz, L = Math.max(Math.hypot(dx, dz), 1e-4);
    const d = (0.5 * (rx + ax) * dx + 0.5 * (rz + az) * dz) / L, h = Math.max(0.12 - Math.abs(e - d), 0) / 0.12;
    e = Math.min(e, d) - h * h * 0.03;
  }
  const h0 = hash2(mx + 0.125, mz + 0.25), h1 = hash2(mx + 0.4375, mz + 0.0625), h2 = hash2(mx + 0.8125, mz + 0.5625), h3 = hash2(mx + 0.1875, mz + 0.9375);
  const sx = x + rx * PAVE_S, sz = z + rz * PAVE_S, [pv, gr] = read(sx, sz);
  const pc = pv + (noise2(sx * 0.42 + 3, sz * 0.42 + 3) - 0.5) * 0.45;
  const ss_ = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  let show = (ss_(0.3, 0.85, pc) * 1.12 + 0.12 * (pc >= 0.06 ? 1 : 0) * (1 - ss_(0.3, 0.6, pc))) >= h1 ? 1 : 0;
  if (gr + (h0 - 0.5) * 0.2 > 0.42) show = 0;
  const jw = 0.035 + 0.015 * h3 + (1 - ss_(0.45, 0.95, pc)) * 0.09;
  const em = e * PAVE_S + (noise2(x * 5 + h2 * 16, z * 5 + h2 * 16) - 0.5) * 0.035 + (noise2(x * 13 + 2, z * 13 + 2) - 0.5) * 0.01;
  return { em, jw, show };
}

const WAY_SQUARE = 4;                                                      // metres: the squares near() goes by (see createPaths)
// the noise a way's paint takes at a point (its edge's wander, its tufts), kept for the last point asked: the ground picture
// asks every way that reaches a point in turn, at that point, and all of them (of one seed) take the same noise there
const NOISE_AT = { x: NaN, z: NaN, seed: NaN, a: 0, b: 0, c: 0 };
function wayNoise(x, z, seed) {
  const q = NOISE_AT;
  if (q.x !== x || q.z !== z || q.seed !== seed) {
    q.x = x; q.z = z; q.seed = seed;
    q.a = (fbm3(x * 0.45, 1.3, z * 0.45, seed + 3, 2) - 0.5) * 0.7; q.b = (fbm3(x * 1.8, 2.7, z * 1.8, seed + 5, 2) - 0.5) * 0.22;
    q.c = fbm3(x * 0.95, 4.1, z * 0.95, seed + 9, 2);
  }
  return q;
}
export function createPaths({ paths = [], seed = 1, style = 'grit' } = {}) {
  const soft = style === 'soft';
  const makeLine = p => {
    const l = { pts: densify(p.points, 0.5), half: p.half || 1.1 };
    l.box = [Math.min(...l.pts.map(q => q[0])) - l.half * 2 - 1, Math.max(...l.pts.map(q => q[0])) + l.half * 2 + 1, Math.min(...l.pts.map(q => q[1])) - l.half * 2 - 1, Math.max(...l.pts.map(q => q[1])) + l.half * 2 + 1];
    l.len = [0]; for (let i = 1; i < l.pts.length; i++) l.len.push(l.len[i - 1] + Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]));
    // its pieces sixteen at a time, each run with the box round it (near(): a run whose box is further off than the nearest
    // piece found so far has nothing nearer in it)
    l.runs = [];
    for (let i = 0; i < l.pts.length - 1; i += 16) {
      const e = Math.min(l.pts.length - 1, i + 16), xs = l.pts.slice(i, e + 1).map(q => q[0]), zs = l.pts.slice(i, e + 1).map(q => q[1]);
      l.runs.push([i, e, Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]);
    }
    return l;
  };
  const lines = paths.map(makeLine);
  let rib = null;                                                           // the ribbons, once made: what add() draws one more into
  // the paths by squares of the land (WAY_SQUARE metres): each square knows the paths whose box takes it in, in the order they
  // were made, and near() asks only the point's square's. It finds what it always found (the same paths, asked in the same
  // order), without going through every path for every point: with hundreds of ways painted by hand that was most of the
  // time the map took to load (the land's heights, the ground picture and the ways' picture ask it at every point)
  const squares = new Map(), squareOf = (i, j) => (i + 32768) * 65536 + (j + 32768);
  const enroll = (l, on) => {
    const [x0, x1, z0, z1] = l.box;
    for (let i = Math.floor(x0 / WAY_SQUARE); i <= Math.floor(x1 / WAY_SQUARE); i++) for (let j = Math.floor(z0 / WAY_SQUARE); j <= Math.floor(z1 / WAY_SQUARE); j++) {
      const k = squareOf(i, j); let a = squares.get(k);
      if (on) { if (!a) squares.set(k, a = []); a.push(l); } else if (a) { const p = a.indexOf(l); if (p >= 0) a.splice(p, 1); }
    }
  };
  // and each square knows the pieces of path (a path's line is in pieces of half a metre) that pass within SEG_REACH of it, in
  // the same order: a long way's box takes in many squares, but only a few of its pieces come near any one of them. Asked
  // first; a piece not known to a square is further than SEG_REACH from any point of it, so if one known is nearer than that,
  // it is the nearest of all (else every path whose box takes the point in is asked, as before)
  const SEG_REACH = 6, pieces = new Map();
  const enrollPieces = (l, on) => {
    for (let i = 0; i < l.pts.length - 1; i++) {
      const [ax, az] = l.pts[i], [bx, bz] = l.pts[i + 1];
      for (let si = Math.floor((Math.min(ax, bx) - SEG_REACH) / WAY_SQUARE); si <= Math.floor((Math.max(ax, bx) + SEG_REACH) / WAY_SQUARE); si++)
        for (let sj = Math.floor((Math.min(az, bz) - SEG_REACH) / WAY_SQUARE); sj <= Math.floor((Math.max(az, bz) + SEG_REACH) / WAY_SQUARE); sj++) {
          const k = squareOf(si, sj); let a = pieces.get(k);
          if (on) { if (!a) pieces.set(k, a = []); a.push(l, i); } else if (a) { for (let q = a.length - 2; q >= 0; q -= 2) if (a[q] === l) a.splice(q, 2); }
        }
    }
  };
  for (const l of lines) { enroll(l, true); enrollPieces(l, true); }
  // the nearest path: how far from its middle, and how wide it is there
  const near = (x, z) => {
    let best = 1e9, half = 1;
    const few = lines.length <= 8;                                           // (a few ways, as a stroke painted by hand has one: all of them, as before)
    const k = few ? 0 : squareOf(Math.floor(x / WAY_SQUARE), Math.floor(z / WAY_SQUARE)), here = few ? lines : squares.get(k);
    if (!here) return { d: best, half };
    const some = few ? null : pieces.get(k);
    if (some) for (let q = 0; q < some.length; q += 2) {
      const l = some[q], i = some[q + 1], [x0, x1, z0, z1] = l.box;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const ax = l.pts[i][0], az = l.pts[i][1], bx = l.pts[i + 1][0] - ax, bz = l.pts[i + 1][1] - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz))), d = Math.hypot(x - ax - bx * t, z - az - bz * t);
      if (d < best) { best = d; half = l.half; }
    }
    if (best <= SEG_REACH) return { d: best, half };
    best = 1e9; half = 1;
    for (const l of here) {
      const [x0, x1, z0, z1] = l.box;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      for (const [r0, r1, rx0, rx1, rz0, rz1] of l.runs) {
        if (Math.hypot(Math.max(rx0 - x, 0, x - rx1), Math.max(rz0 - z, 0, z - rz1)) > best) continue;
        for (let i = r0; i < r1; i++) {
          const ax = l.pts[i][0], az = l.pts[i][1], bx = l.pts[i + 1][0] - ax, bz = l.pts[i + 1][1] - az;
          const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz))), d = Math.hypot(x - ax - bx * t, z - az - bz * t);
          if (d < best) { best = d; half = l.half; }
        }
      }
    }
    return { d: best, half };
  };
  // the path's edge wanders: broad bends and small bites
  const edge = (x, z, d) => { const q = wayNoise(x, z, seed); return d + q.a + q.b; };
  // how far each point of the map is from the middle of the nearest path (in path widths): one picture for all the ways, so
  // where two paths meet they agree on what is middle and what is edge (the soft look also wants to know how many metres
  // outside the path's edge a point is: a second number, -2 .. 2 m; and how many soft ribbons lie over it: a third, see cover).
  // Made once, for whichever draws the ways
  // (and a fourth, in the soft look: how much of the point is laid with flat stones, 0..1: PAVING below, set by pave())
  let dist = null, paveAt = null;
  const distances = map => {
    if (dist) return dist;
    const S = map.size, R = map.radius, [mx, mz] = map.center, C = soft ? 4 : 1, dd = new Uint8Array(S * S * C).fill(255);
    const at = (i, j, fresh) => {                                            // one point of the picture (fresh: worked out again, not only lowered)
      const x = mx - R + (i + 0.5) / S * 2 * R, z = mz - R + (j + 0.5) / S * 2 * R, q = near(x, z);
      const o = (j * S + i) * C;
      if (fresh) { dd[o] = 255; if (soft) dd[o + 1] = 255; }
      if (soft) dd[o + 3] = paveAt ? Math.round(Math.min(1, Math.max(0, paveAt(x, z))) * 255) : 0;
      if (q.d > 1e8) return;
      dd[o] = Math.min(dd[o], Math.round(Math.min(1, q.d / q.half / 4) * 255));
      if (soft) dd[o + 1] = Math.min(dd[o + 1], Math.round(Math.min(1, Math.max(0, (q.d - q.half + 2) / 4)) * 255));
    };
    const span = ([x0, x1, z0, z1]) => [Math.max(0, Math.floor((x0 - mx + R) / (2 * R) * S)), Math.min(S - 1, Math.ceil((x1 - mx + R) / (2 * R) * S)), Math.max(0, Math.floor((z0 - mz + R) / (2 * R) * S)), Math.min(S - 1, Math.ceil((z1 - mz + R) / (2 * R) * S))];
    const fill = (box, fresh = false) => { const [i0, i1, j0, j1] = span(box); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) at(i, j, fresh); };
    // how many soft ribbons lie over each point: a ribbon reaches its way's half width and a metre and a half more round its line,
    // and where several lay over one spot each was drawn there, see-through, one over the other (ways painted close together
    // were laid on thick). The land lays a way there as many times over (onLand), so the ways look as they did
    const layers = soft ? new Uint16Array(S * S) : null, mark = soft ? new Int32Array(S * S).fill(-1) : null;
    let stamp = 0;
    const cover = (l, by) => {
      if (!soft) return;
      const W = l.half + 1.5, id = stamp++, P = l.pts;
      for (let s = 0; s < Math.max(1, P.length - 1); s++) {
        const [ax, az] = P[s], [bx, bz] = P[Math.min(s + 1, P.length - 1)], ux = bx - ax, uz = bz - az, L2 = ux * ux + uz * uz || 1e-9;
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - W - mx + R) / (2 * R) * S)), i1 = Math.min(S - 1, Math.ceil((Math.max(ax, bx) + W - mx + R) / (2 * R) * S));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz) - W - mz + R) / (2 * R) * S)), j1 = Math.min(S - 1, Math.ceil((Math.max(az, bz) + W - mz + R) / (2 * R) * S));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const o = j * S + i;
          if (mark[o] === id) continue;
          const x = mx - R + (i + 0.5) / S * 2 * R - ax, z = mz - R + (j + 0.5) / S * 2 * R - az, t = Math.min(1, Math.max(0, (x * ux + z * uz) / L2));
          if (Math.hypot(x - ux * t, z - uz * t) > W) continue;
          mark[o] = id; layers[o] = Math.max(0, layers[o] + by); dd[o * 4 + 2] = Math.min(255, layers[o]);
        }
      }
    };
    if (soft) for (let o = 0; o < S * S; o++) { dd[o * 4] = 255; dd[o * 4 + 1] = 255; dd[o * 4 + 2] = 0; dd[o * 4 + 3] = 0; }
    // every point any path's box takes in, worked out once (each box in turn asked again every point that boxes before it had
    // asked: where ways lie close together, many times over, for the same answer)
    const todo = new Uint8Array(S * S);
    for (const l of lines) {
      const [i0, i1, j0, j1] = span(l.box);
      for (let j = j0; j <= j1; j++) todo.fill(1, j * S + i0, j * S + i1 + 1);
      cover(l, 1);
    }
    for (let o = 0; o < S * S; o++) if (todo[o]) { const i = o % S; at(i, (o - i) / S, false); }
    const tex = new THREE.DataTexture(dd, S, S, soft ? THREE.RGBAFormat : THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.unpackAlignment = 1; tex.needsUpdate = true;
    // only the stones worked out again, over a box (a stroke of grass painted over them, or taken back: no way changes)
    const repave = box => {
      if (!soft) return;
      const [i0, i1, j0, j1] = span(box);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = mx - R + (i + 0.5) / S * 2 * R, z = mz - R + (j + 0.5) / S * 2 * R;
        dd[(j * S + i) * 4 + 3] = paveAt ? Math.round(Math.min(1, Math.max(0, paveAt(x, z))) * 255) : 0;
      }
      tex.needsUpdate = true;
    };
    // the two pictures read at a point as the shader reads them (linear between texel middles, clamped at the edge): how paved
    // (this picture's fourth number) and how much grass grows (the ground map's)
    const read = (x, z) => {
      const u = ((x - mx) / (2 * R) + 0.5) * S - 0.5, v = ((z - mz) / (2 * R) + 0.5) * S - 0.5;
      const i0 = Math.min(S - 1, Math.max(0, Math.floor(u))), j0 = Math.min(S - 1, Math.max(0, Math.floor(v))), i1 = Math.min(S - 1, i0 + 1), j1 = Math.min(S - 1, j0 + 1);
      const a = Math.min(1, Math.max(0, u - i0)), b = Math.min(1, Math.max(0, v - j0)), md = map.data;
      const at = (arr, i, j) => arr[(j * S + i) * 4 + 3] / 255;
      const lerp2 = arr => (at(arr, i0, j0) * (1 - a) + at(arr, i1, j0) * a) * (1 - b) + (at(arr, i0, j1) * (1 - a) + at(arr, i1, j1) * a) * b;
      return [lerp2(dd), md ? lerp2(md) : 0];
    };
    return (dist = { tex, fill, cover, repave, read });
  };
  return {
    near,
    sink(x, z) { const { d, half } = near(x, z); return d > half * 2 ? 0 : -0.07 * (1 - ss(half * 0.55, half * 1.15, d)); },
    paint(x, z) {
      const { d, half } = near(x, z);
      if (soft) {
        // no line where the path ends: from a little inside its edge to a metre outside, less and less bare earth, so the
        // grass comes up thin and short at first; and the grass beside it is short a good way out
        if (d > half + 2.4) return null;
        const s = edge(x, z, d) - half;                                       // metres outside the path's edge (inside: less than 0)
        let earth = 1 - ss(-0.45, 0.9, s);
        // tufts that have pushed in from the edges (soft-edged; none in the middle, where feet keep it bare)
        earth *= 1 - 0.8 * ss(0.57, 0.7, wayNoise(x, z, seed).c) * ss(half * 0.45, half * 0.85, d);
        return [earth, 0, 0.7 * (1 - ss(0.2, 1.8, s))];
      }
      if (d > half * 2.2) return null;
      const e = edge(x, z, d);
      let earth = 1 - ss(half * 0.72, half * 1.02, e);
      // clumps of grass that have pushed in from the edges (none in the middle, where feet keep it bare)
      const clump = ss(0.6, 0.66, wayNoise(x, z, seed).c) * ss(half * 0.3, half * 0.75, d);
      earth *= 1 - clump;
      const mow = (1 - ss(half * 1.0, half * 1.7, e)) * 0.85;                // the grass right beside it is short, trodden
      return [earth, 0, mow];
    },
    // the painted path: a ribbon over the ground, as wide as the path and a little more (the ground map decides where it shows).
    // bankAt(x, z): how high a spot stands above the water beside it (10: no water near), for the soft look to be wet toward
    // the water; without it no way is ever wet
    ribbon(heightAt, map, tex = null, bankAt = null) {
      const group = new THREE.Group(); group.name = 'paths';
      const distTex = distances(map).tex;
      const mat = soft ? softPathMaterial(map, tex, distTex) : pathMaterial(map, tex, distTex);
      const meshOf = l => {
        // Its points are never more than about half a metre apart, along it and across it, so it lies on the ground everywhere.
        // (A long piece takes its height only at its corners and is flat between them: by a cliff it stood off the land as a
        // slanted sheet through the air, in front of her. The ends past the line and a wide yard were made of such pieces.)
        const W = soft ? l.half + 1.5 : l.half * 1.45, ACROSS = Math.max(12, Math.ceil(2 * W / 0.5)), pos = [], acr = [], bank = [], idx = [];
        // (the ribbon runs on a little past both ends of the line: the worn earth there is round, not cut square)
        const P = l.pts, n = P.length, steps = Math.ceil(W / 0.5);
        const ext = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], dl = Math.hypot(dx, dz) || 1; return Array.from({ length: steps }, (_, k) => [b[0] + dx / dl * W * (k + 1) / steps, b[1] + dz / dl * W * (k + 1) / steps]); };
        const rows = [...ext(P[1], P[0]).reverse(), ...P, ...ext(P[n - 2], P[n - 1])];
        for (let k = 0; k < rows.length; k++) {
          const a = rows[Math.max(0, k - 1)], b = rows[Math.min(rows.length - 1, k + 1)], p = rows[k];
          let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          for (let i = 0; i <= ACROSS; i++) {
            const u = -1 + 2 * i / ACROSS, x = p[0] - tz * u * W, z = p[1] + tx * u * W;
            pos.push(x, heightAt(x, z) + 0.03, z); acr.push(u * W / l.half); bank.push(bankAt ? bankAt(x, z) : 10);
          }
        }
        for (let k = 0; k < rows.length - 1; k++) for (let i = 0; i < ACROSS; i++) { const a = k * (ACROSS + 1) + i, b = a + ACROSS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('aAcross', new THREE.Float32BufferAttribute(acr, 1));
        g.setAttribute('aBank', new THREE.Float32BufferAttribute(bank, 1));
        g.setIndex(idx); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat); m.renderOrder = soft ? -10 : 0; m.name = 'path';      // (soft: see-through, so drawn after the land and grass, and before the water and all else that is)
        m.userData = { kind: 'path', dispose: () => g.dispose() };
        return m;
      };
      for (const l of lines) group.add(meshOf(l));
      group.userData.dispose = () => { mat.dispose(); distTex.dispose(); };
      rib = { group, meshOf };
      return group;
    },
    // THE WAYS DRAWN BY THE LAND (the soft look): in place of ribbons the land's own paint lays them (stylized-terrain.js,
    // terrainMaterial's ways), by the same lines of shader as a soft ribbon (SOFT_WAY_GLSL), from the same picture of distances.
    // There is nothing to draw for them: a ribbon was a mesh of its own (a draw call each) lying see-through over the land, so
    // where ways were painted close together the same spot was drawn again for every ribbon over it. Now ways added by hand,
    // however many, add nothing: the land is drawn anyway, and only its points near a way have more to work out.
    // Returns { glsl, defines, uniforms } for terrainMaterial's ways, and dispose().
    // stone: the map's painted stone (its cliffs' own picture, that its rocks are painted with) for PAVING: flat stones laid in the
    // ways wherever pave() says (with no stone given, the land has no paving to draw and the shader has none of its lines)
    onLand(map, tex = null, { stone = null, stoneTile = [2.6, 1.3] } = {}) {
      const d = distances(map), paint = tex && tex.paint ? tex.paint : null;
      const defines = { ...(paint ? { WAY_TEX: 1 } : {}), ...(stone ? { WAY_PAVE: 1 } : {}) };
      const uniforms = { ...softWayUniforms(map, paint, d.tex), ...(stone ? paveUniforms(stone, stoneTile) : {}) };
      // grass: what the grass needs to come up between the slabs (createFollowGrass's paving: { glsl, uniforms }), or null
      const grass = stone ? { glsl: PAVE_GRASS_GLSL, uniforms: { uWayD: uniforms.uWayD, uWayMap: uniforms.uWayMap, uWayMapRect: uniforms.uWayMapRect, uPaveGrass: uniforms.uPaveGrass, uPaveDirt: { value: rgb(PAVE.dirt) } } } : null;
      return { glsl: SOFT_WAY_GLSL, defines, uniforms, grass, dispose: () => d.tex.dispose() };
    },
    // PAVING: fn(x, z) -> 0..1, how much of a spot is laid with flat stones (path-edits.js, createPaveField). Set before the
    // ways are drawn (onLand); repave(box): worked out again there (a stroke that changed it without changing a way: grass)
    pave(fn) { paveAt = fn; },
    repave(box) { if (dist) dist.repave(box); },
    // is (x, z) in the paving's cracks: on paving, in a joint between the slabs or where a slab is gone (not on one). A flower
    // may grow there (the slabs as the shader lays them: slabAt). False where there is no paving, or before the ways are drawn
    inCrack(x, z, margin = 0.012) {
      if (!soft || !dist) return false;
      if (dist.read(x, z)[0] < 0.02) return false;
      const s = slabAt(x, z, dist.read);
      return !s.show || s.em < s.jw - margin;
    },
    // one more path, after the ribbons are made: it is in near() and paint() from now on, and drawn at once
    add(path) {
      const l = makeLine(path);
      if (l.pts.length < 2) return null;
      lines.push(l); enroll(l, true); enrollPieces(l, true);
      if (dist) { dist.fill(l.box); dist.cover(l, 1); dist.tex.needsUpdate = true; }
      if (rib) { l.mesh = rib.meshOf(l); rib.group.add(l.mesh); }
      return l;
    },
    remove(l) {
      const k = lines.indexOf(l);
      if (k < 0) return;
      lines.splice(k, 1); enroll(l, false); enrollPieces(l, false);
      if (rib && l.mesh) { rib.group.remove(l.mesh); l.mesh.userData.dispose(); }
      if (dist) { dist.fill(l.box, true); dist.cover(l, -1); dist.tex.needsUpdate = true; }
    },
    // flat stones worn into the path (alone or in twos and threes) and pebbles at its sides
    stones() {
      const rng = mulberry32(seed * 97 + 5), out = [];
      for (const l of lines) {
        const total = l.len[l.len.length - 1];
        for (let s = 1 + rng() * 2; s < total - 0.5; s += 1.8 + rng() * 2.8) {
          const [x, z, tx, tz] = along(l, s), n = rng() < 0.3 ? 2 + Math.floor(rng() * 2) : 1;
          const off = (rng() - 0.5) * l.half * 1.1;
          for (let k = 0; k < n; k++) {
            const o = off + (k ? (rng() - 0.5) * 0.9 : 0), f = k * (0.55 + rng() * 0.2);
            out.push({ type: 'flagstone', seed: 1 + Math.floor(rng() * 9999), x: x - tz * o + tx * f, z: z + tx * o + tz * f, ry: rng() * 360, s: 0.55 + rng() * 0.45, sink: -0.03 });      // (lifted a little: the path's paint lies over the land)
          }
        }
        for (let s = 2 + rng() * 3; s < total - 1; s += 3.5 + rng() * 4) {
          const [x, z, tx, tz] = along(l, s), side = rng() < 0.5 ? -1 : 1, o = side * l.half * (0.95 + rng() * 0.4);
          out.push({ type: 'pebbles', seed: 1 + Math.floor(rng() * 9999), x: x - tz * o, z: z + tx * o, ry: rng() * 360, s: 0.45 + rng() * 0.35, sink: -0.01 });
        }
      }
      return out;
    },
    // a few places beside the path for flowers
    get flowers() {
      const rng = mulberry32(seed * 53 + 11), out = [];
      for (const l of lines) {
        const total = l.len[l.len.length - 1];
        for (let s = 3 + rng() * 4; s < total - 1; s += 6 + rng() * 6) {
          const [x, z, tx, tz] = along(l, s), o = (rng() < 0.5 ? -1 : 1) * l.half * (1.7 + rng() * 0.8);
          out.push([x - tz * o, z + tx * o, 0.8 + rng() * 0.8]);
        }
      }
      return out;
    },
  };
}

// the point s metres along a path, and its direction there
function along(l, s) {
  let i = 1; while (i < l.len.length - 1 && l.len[i] < s) i++;
  const a = l.pts[i - 1], b = l.pts[i], t = (s - l.len[i - 1]) / Math.max(1e-6, l.len[i] - l.len[i - 1]);
  const dx = b[0] - a[0], dz = b[1] - a[1], dl = Math.hypot(dx, dz) || 1;
  return [a[0] + dx * t, a[1] + dz * t, dx / dl, dz / dl];
}

// the path's paint: warm and light down the middle, darker towards the edges, damp darker spots, and a dark rim where it meets
// the grass. With the two earth pictures: sand down the middle and dirt towards the edges and in the damp spots, each laid twice
// at two sizes and turned, so the repeat does not show; without them, broad flat dabs of tone and fine grains of sand. Where
// the ground map says grass grows, nothing is drawn; the grass and its roots carry on from there.
function pathMaterial(map, tex, distTex) {
  const C = COLORS;
  return new THREE.ShaderMaterial({
    defines: tex ? { TEX: 1 } : {},
    uniforms: {
      uSand: { value: tex ? tex.sand : null }, uDirt: { value: tex ? tex.dirt : null }, uCream: { value: rgb(C.cream) }, uPathD: { value: distTex },
      uMap: { value: map.texture }, uMapRect: { value: map.rect }, uCast: { value: map.cast || null }, uCastTint: { value: new THREE.Vector3(...(map.castTint || [0.5, 0.6, 0.76])) },
      uLight: { value: rgb(C.light) }, uMid: { value: rgb(C.mid) }, uDark: { value: rgb(C.dark) }, uDamp: { value: rgb(C.damp) }, uRim: { value: rgb(C.rim) },
      uSpL: { value: rgb(C.speckLight) }, uSpD: { value: rgb(C.speckDark) },
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      attribute float aAcross;
      varying vec3 vWP;
      varying float vAcross, vHaze;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vAcross = aAcross;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        mv.xyz *= 0.996;                       // drawn a hair nearer than the land, which bulges above the ribbon here and there
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      uniform sampler2D uMap, uCast, uSand, uDirt, uPathD;
      uniform vec3 uMapRect, uCastTint, uLight, uMid, uDark, uDamp, uRim, uSpL, uSpD, uCream;
      varying vec3 vWP;
      varying float vAcross;
      void main() {
        vec2 uv = (vWP.xz - uMapRect.xy) * uMapRect.z + 0.5;
        vec4 m = texture2D(uMap, uv);
        float grass = m.a + (noise2(vWP.xz * 6.0) - 0.5) * 0.22 + (noise2(vWP.xz * 17.0) - 0.5) * 0.08;
        if (grass > 0.5) discard;                                                // the grass's ground, not the path's
        if (texture2D(uPathD, uv).r * 4.0 > 1.04 + (noise2(vWP.xz * 1.8) - 0.5) * 0.3) discard;      // nor bare ground beside it (a beach, a cliff's foot)
        float t = texture2D(uPathD, uv).r * 4.0;                                  // 0 down the middle, 1 at the edge (all paths agree)
        float dab = noise2(vWP.xz * 0.9) * 0.55 + noise2(vWP.xz * 2.6 + 3.0) * 0.3 + noise2(vWP.xz * 7.0) * 0.15 - t * 0.35;
        float damp = smoothstep(0.62, 0.72, noise2(vWP.xz * 0.55 + 11.0));
      #ifdef TEX
        // each picture twice, at two sizes and turned against each other, mixed by a slow noise: the repeat does not show
        vec2 a = vWP.xz / 2.3, b = mat2(0.8, -0.6, 0.6, 0.8) * vWP.xz / 3.7;
        float w = noise2(vWP.xz * 0.35);
        vec3 sand = mix(texture2D(uSand, a).rgb, texture2D(uSand, b).rgb, w);
        vec3 dirt = mix(texture2D(uDirt, a * 0.9).rgb, texture2D(uDirt, b * 1.1).rgb, w);
        // the grit (each picture less its own blur), made a little stronger so it reads on a phone, over the smooth colour
        vec3 grit = (texture2D(uSand, a).rgb - texture2D(uSand, a, 5.0).rgb) * 1.6;
        sand = mix(sand, uCream * (0.85 + 0.3 * dot(sand, vec3(0.33))), 0.3) + grit;  // towards the pale cream of a well-trodden path
        dirt += (texture2D(uDirt, a * 0.9).rgb - texture2D(uDirt, a * 0.9, 5.0).rgb) * 1.4;
        float edgeK = smoothstep(0.35, 1.0, t + (dab - 0.5) * 0.5);                   // dirt creeps in from the edges, in patches
        vec3 col = mix(sand, dirt, max(edgeK * 0.55, damp * 0.3));
        col *= 0.94 + 0.12 * step(0.45, dab);                                          // a broad painted tone over it
      #else
        // broad flat dabs of tone (three steps, wobbly edges), lighter down the middle
        vec3 col = dab > 0.46 ? uLight : (dab > 0.3 ? uMid : uDark);
        col = mix(col, uDamp, damp * 0.6);                                              // damp, darker spots
        // grains of sand: a few light and dark specks
        vec2 cell = floor(vWP.xz * 16.0);
        float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        col = h > 0.965 ? mix(col, uSpL, 0.7) : (h < 0.035 ? mix(col, uSpD, 0.6) : col);
      #endif
        // where the grass begins: a dark rim of roots and damp earth
        col = mix(col, uRim, smoothstep(0.18, 0.48, grass) * 0.75);
        col *= mix(vec3(1.0), uCastTint, texture2D(uCast, uv).r);                // the sun's shadows
        gl_FragColor = vec4(mix(col, uHaze, vHaze), 1.0);
      }`,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,      // (the ribbon is seen from above whichever way it was wound)
  });
}

// THE SLABS of PAVING, as lines of shader of their own: where each slab lies, how far a point is inside it, whether it is there
// at all. The land's paint lays them (SOFT_WAY_GLSL, PAVING) and the grass comes up between them (pavingForGrass, below): both
// by these lines, so the blades stand just where the land has its joints. Needs NOISE, and uWayD, uWayMap, uWayMapRect.
const SLAB_GLSL = /* glsl */`
const float PAVE_S = 0.6;                                                  // metres: a slab's cell, so a slab is about this across
vec2 paveJit(vec2 c) { return vec2(hash2(c + vec2(0.3125, 0.0)), hash2(c + vec2(0.0, 0.6875))); }
struct Slab {
  vec2 mr;       // from the point to the slab's middle, in cells
  float em;      // metres from the slab's edge (inside the cell), its edge cut by hand
  float jw;      // half the joint there, metres: the slab begins this far in
  float show;    // 1: the slab is there
  float pc;      // how paved the slab's middle is (its edge wandering)
  vec4 h;        // the slab's own dice: its tone, whether it is there, its turn, its joint
};
Slab paveSlab(vec2 xz) {
  Slab s;
  vec2 p = xz / PAVE_S, ip = floor(p), fp = p - ip;
  // the nearest slab's middle (a jittered grid of cells, one slab in each)
  vec2 mc = ip, mr = vec2(0.0); float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), r = g + 0.5 + (paveJit(ip + g) - 0.5) * 0.8 - fp;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mc = ip + g; }
  }
  // how far it is to the slab's edge (the line halfway to each neighbour's middle), its corners a little worn (a soft minimum)
  float e = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    if (i == 0 && j == 0) continue;
    vec2 c = mc + vec2(float(i), float(j)), r = c - ip + 0.5 + (paveJit(c) - 0.5) * 0.8 - fp, dv = r - mr;
    float L = length(dv), d = dot(0.5 * (mr + r), dv / max(L, 1e-4));
    float h = max(0.12 - abs(e - d), 0.0) / 0.12;
    e = min(e, d) - h * h * 0.03;
  }
  s.mr = mr;
  s.h = vec4(hash2(mc + vec2(0.125, 0.25)), hash2(mc + vec2(0.4375, 0.0625)), hash2(mc + vec2(0.8125, 0.5625)), hash2(mc + vec2(0.1875, 0.9375)));
  // is the slab there: all of them where the way is paved through; toward the paving's edge fewer (the edge wanders), and
  // smaller and sunk in the earth; a few alone past it. None where the grass has come over the way: a slab is whole or not there
  vec2 sc = xz + mr * PAVE_S, suv = (sc - uWayMapRect.xy) * uWayMapRect.z + 0.5;
  s.pc = texture2D(uWayD, suv).a + (noise2(sc * 0.42 + 3.0) - 0.5) * 0.45;
  s.show = step(s.h.y, smoothstep(0.3, 0.85, s.pc) * 1.12 + 0.12 * step(0.06, s.pc) * (1.0 - smoothstep(0.3, 0.6, s.pc)));
  s.show *= step(texture2D(uWayMap, suv).a + (s.h.x - 0.5) * 0.2, 0.42);
  s.jw = 0.035 + 0.015 * s.h.w + (1.0 - smoothstep(0.45, 0.95, s.pc)) * 0.09;
  s.em = e * PAVE_S + (noise2(xz * 5.0 + s.h.z * 16.0) - 0.5) * 0.035 + (noise2(xz * 13.0 + 2.0) - 0.5) * 0.01;
  return s;
}
// how much grass comes up at a point of the paving (0..1): in the joints and where a slab is gone, in patches (more toward the
// paving's edge), none on a slab. here: how paved the point is
float paveGrassAt(vec2 xz, Slab s, float here) {
  float onSlab = s.show * smoothstep(s.jw - 0.006, s.jw + 0.012, s.em);
  float n = noise2(xz * 1.6 + 3.0) * 0.6 + noise2(xz * 4.7) * 0.4, want = mix(0.6, 0.44, 1.0 - smoothstep(0.5, 1.0, here));      // (feet keep the middle of a paving barer)
  return (1.0 - onSlab) * smoothstep(want - 0.07, want + 0.07, n);
}`;
// the meadow's blades between the slabs (pavingForGrass: stylized-grassfield.js takes it as createFollowGrass's paving). m: the
// ground map at the tuft, at: where the blade stands. On a slab no blade; between the slabs short grass comes up, in patches,
// in the trodden green of the grass beside the ways, with the map's shadow on it (what the map's bare earth has of it)
const PAVE_GRASS_GLSL = /* glsl */`
uniform sampler2D uWayD, uWayMap;
uniform vec3 uWayMapRect, uPaveGrass, uPaveDirt;
${SLAB_GLSL}
vec4 paveGrass(vec4 m, vec2 at) {
  if (m.a > 0.6) return m;                                                 // (thick meadow: there is no paving under it)
  float here = texture2D(uWayD, (at - uWayMapRect.xy) * uWayMapRect.z + 0.5).a;
  if (here < 0.02) return m;
  Slab s = paveSlab(at);
  float g = paveGrassAt(at, s, here), onSlab = s.show * smoothstep(s.jw - 0.006, s.jw + 0.012, s.em);
  vec3 lit = clamp(m.rgb / uPaveDirt, vec3(0.35), vec3(1.2));
  m.rgb = mix(m.rgb, uPaveGrass * lit, smoothstep(0.0, 0.25, g) * (1.0 - smoothstep(0.35, 0.6, m.a)));
  m.a = max(m.a, g * 0.36) * (1.0 - onSlab);                              // (short: grass in the cracks, not a meadow)
  return m;
}`;

// The soft look's paint: earth laid in with a brush (one picture, laid twice at two sizes and turned, so the repeat does not
// show), paler and creamier down the worn middle, with broad soft patches of deeper tone, browner toward the sides. There is
// no line at the edge: as the ground map says more grass grows, the earth goes to the colour of dry grass and fades out, so
// the meadow's own green shows through it and the short grass stands on it. Beside bare ground (a cliff's foot, a beach) it
// fades out in under a metre. Without the picture: the same, over one flat earth colour. Toward the water it is wet: darker,
// by how high each point of the ribbon stands above the water (aBank: the level's bankAt, the same measure the banks' sand is
// wet by, so a way running down onto the beach is wet just where the sand beside it is).
// THE SOFT LOOK, as one function that both a soft ribbon (softPathMaterial) and the land's own paint (onLand) call: at a point
// wp of the ground (up: how much the ground there faces up; bank: how high it stands above the water beside it, 10 with none
// near), the way's colour and how much of it shows (0: none). Needs NOISE before it; WAY_TEX defined when there is a paint.
const SOFT_WAY_GLSL = /* glsl */`
uniform sampler2D uWayMap, uWayCast, uWayPaint, uWayD;
uniform vec3 uWayMapRect, uWayCastTint, uWayEarth, uWayCream, uWayDeep, uWaySide, uWayHay, uWayWet;
#ifdef WAY_PAVE
// PAVING: flat stones laid in a way, in the stone the map's cliffs and rocks are painted with (uWayStone: the cliffs' own
// picture), each slab a flat painted tone of its own, as the rocks' faces are. Irregular slabs about 0.55 m across (THE SLABS,
// above), the light catching the edge that faces the sun and the far edge in shade; earth in the joints, and the meadow's own
// blades coming up through them in patches (the grass: stylized-grassfield.js, PAVING there), the joints under them painted
// the green of the blades' feet, so from afar too the joints are grassy. Where the paving ends the stones go one by one, the
// last ones small and sunk in the earth, then a few lying alone in the way, so there is no line: the way's earth, the meadow.
uniform sampler2D uWayStone;
uniform vec2 uWayStoneTile, uWaySun;      // uWaySun: toward the sun, flat on the ground (the stones' lit edge follows the day)
uniform vec3 uPaveJoint, uPaveGrass, uPaveFar;
${SLAB_GLSL}
// xz: the point; earth: the way's colour there; foot: metres a pixel covers; here: how paved the point is (0..1)
vec3 paveStones(vec2 xz, vec3 earth, float foot, float here) {
  Slab s = paveSlab(xz);
  float aa = max(foot * 0.85, 0.003);
  float stone = smoothstep(s.jw - aa, s.jw + aa, s.em) * s.show;
  float near_ = 1.0 - smoothstep(0.025, 0.08, foot);                        // the small things, only near enough to be seen
  // the slab: the painted stone laid on it turned its own way (its brush's patches softened: a slab reads as one flat tone), each
  // slab a tone of its own, a few warmer and a few cooler
  vec2 sc = xz + s.mr * PAVE_S;
  float ang = s.h.z * 6.2832, cs = cos(ang), sn = sin(ang);
  vec2 q = mat2(cs, sn, -sn, cs) * (xz - sc);
  float lod = log2(max(foot * 790.0, 1.0));                               // (its own mip: the picture's texels are about a millimetre here)
  vec3 st = mix(textureLod(uWayStone, q * uWayStoneTile + vec2(s.h.z * 5.0, s.h.x * 3.0), lod).rgb, uPaveFar, 0.4);
  st *= mix(1.1, 1.28, s.h.x);                                             // (as pale in the sun as the cliffs' lit faces)
  st *= s.h.w > 0.8 ? vec3(1.03, 1.0, 0.94) : (s.h.w < 0.2 ? vec3(0.96, 0.98, 1.02) : vec3(1.0));
  // its edge: a thin lit line where it faces the sun, a thin shaded one where it faces away (painted, in one step each)
  vec2 outw = normalize(-s.mr + vec2(1e-5));
  float bevel = (1.0 - smoothstep(s.jw + 0.018, s.jw + 0.026 + aa, s.em)) * near_, face = dot(outw, uWaySun);
  st = mix(st, min(st * 1.1 + 0.03, vec3(1.0)), bevel * smoothstep(0.2, 0.5, face));
  st = mix(st, st * 0.84, bevel * smoothstep(-0.2, -0.5, face));
  // the joints: earth a little darker, and the green of the grass's feet where the blades come up through them; toward the
  // paving's edge, where the slabs go, the way's own earth
  vec3 joint = mix(earth * uPaveJoint, uPaveGrass * 0.72, smoothstep(0.0, 0.3, paveGrassAt(xz, s, here)));
  vec3 under = mix(earth, joint, smoothstep(0.55, 0.95, here));            // (by how paved the point is, not by its slab: no slab's outline shows where it is gone)
  vec3 col = mix(under, st, stone);
  // far off: the slabs and their joints as one tone (no shimmer)
  return mix(col, mix(under, uPaveFar * mix(1.0, 1.08, s.h.x), smoothstep(0.1, 0.6, here)), smoothstep(0.12, 0.4, foot));
}
#endif
vec4 softWay(vec3 wp, float up, float bank) {
#ifdef WAY_PAVE
  float foot = length(fwidth(wp.xz));                                      // (before anything returns: every pixel takes it)
#endif
  vec2 uv = (wp.xz - uWayMapRect.xy) * uWayMapRect.z + 0.5;
  vec4 pd = texture2D(uWayD, uv);
  if (pd.g > 0.995) return vec4(0.0);                                      // (no way within two metres of here)
  vec4 m = texture2D(uWayMap, uv);
  float mid = pd.r * 4.0;                                                  // 0 down the middle, 1 at the edge (all paths agree)
  float out_ = pd.g * 4.0 - 2.0;                                           // metres outside the edge (inside: less than 0)
  float n1 = noise2(wp.xz * 0.9), n2 = noise2(wp.xz * 2.4 + 3.0);
  // how much of the path is left here: less as the grass comes in (a soft, slightly ragged fade), and none a little way
  // out over bare ground
  float grass = m.a + (noise2(wp.xz * 5.0) - 0.5) * 0.22 + (noise2(wp.xz * 13.0) - 0.5) * 0.10;
  float a = (1.0 - smoothstep(0.10, 0.70, grass)) * (1.0 - smoothstep(0.15, 0.95, out_ + (n2 - 0.5) * 0.5));
  // a way is trodden ground: none of it on a cliff's face (a way that ends at a cliff's foot, or is painted across one,
  // does not colour the rock). Full on a slope of 45 degrees, gone by 65
  a *= smoothstep(0.42, 0.68, up);
  if (a < 0.01) return vec4(0.0);
#ifdef WAY_TEX
  vec2 p = wp.xz / 4.1, q = mat2(0.8, -0.6, 0.6, 0.8) * wp.xz / 6.3;
  vec3 col = mix(texture2D(uWayPaint, p).rgb, texture2D(uWayPaint, q).rgb, 0.35 + 0.3 * noise2(wp.xz * 0.3));
#else
  vec3 col = uWayEarth * (0.96 + 0.08 * n2);
#endif
  float worn = 1.0 - smoothstep(0.1, 0.95, mid + (n1 - 0.5) * 0.6);         // the middle, where feet have worn it pale
  col = mix(col, uWayCream, worn * 0.30);
  float broad = noise2(wp.xz * 0.36 + 7.0);                                 // broad soft patches: of deeper tone, and of paler
  col = mix(col, col * uWayDeep / uWayEarth, smoothstep(0.50, 0.74, broad) * (0.55 + 0.45 * n2));
  col = mix(col, uWayCream, smoothstep(0.42, 0.20, broad) * 0.22);
  col = mix(col, uWaySide, smoothstep(-0.55, 0.15, out_ + (n1 - 0.5) * 0.5) * 0.5);      // browner toward its sides
  col = mix(col, uWayHay, smoothstep(0.08, 0.5, grass) * 0.8);                  // and to dry grass where the meadow begins
#ifdef WAY_PAVE
  if (pd.a > 0.004) col = paveStones(wp.xz, col, foot, pd.a);               // flat stones laid in it (see PAVING above)
#endif
  // wet toward the water: the banks' sand is wet by the same measure, with the same ragged edge (stylized-terrain.js)
  float sb = bank + (noise2(wp.xz * 0.9) - 0.5) * 0.24 + (noise2(wp.xz * 3.1 + 5.0) - 0.5) * 0.08;
  col = mix(col, col * uWayWet, 1.0 - smoothstep(0.02, 0.40, sb + (noise2(wp.xz * 1.7 + 9.0) - 0.5) * 0.14));
  col *= mix(vec3(1.0), uWayCastTint, texture2D(uWayCast, uv).r);          // the sun's shadows
  return vec4(col, a);
}
// how many soft ribbons lie over this point (see cover): the land lays the way as many times over, so a = 1 - (1 - a)^layers
float wayLayers(vec3 wp) { return texture2D(uWayD, (wp.xz - uWayMapRect.xy) * uWayMapRect.z + 0.5).b * 255.0; }`;
const softWayUniforms = (map, paint, distTex) => ({
  uWayPaint: { value: paint }, uWayD: { value: distTex },
  uWayMap: { value: map.texture }, uWayMapRect: { value: map.rect }, uWayCast: { value: map.cast || null }, uWayCastTint: { value: new THREE.Vector3(...(map.castTint || [0.5, 0.6, 0.76])) },
  uWayEarth: { value: rgb(SOFT.earth) }, uWayCream: { value: rgb(SOFT.cream) }, uWayDeep: { value: rgb(SOFT.deep) }, uWaySide: { value: rgb(SOFT.side) }, uWayHay: { value: rgb(SOFT.hay) },
  uWayWet: { value: rgb(SOFT.wet) },
});
// the paving's: the map's painted stone and how big a picture of it is laid on a slab (metres across, along), the sun's way flat
// on the ground (setSun: the stones' lit edge follows the day), what the earth in the joints is multiplied by, the moss (the
// rocks' own: rocks.js), and the slabs' one tone from afar (the stone picture's own mean, a little lit)
// the paving's: the map's painted stone and how big a picture of it is laid on a slab (metres across, along), the sun's way flat
// on the ground (setSun: the stones' lit edge follows the day), what the earth in the joints is multiplied by, the green of the
// grass between the slabs (the ground map's trodden grass, stylized-grassfield.js GROUND_COLORS.lawn) and the map's bare earth
// (its dirt: what the grass's shadow is read from), the slabs' one tone from afar (the stone picture's own mean, a little lit)
const PAVE = { joint: [0.8, 0.75, 0.68], grass: '#93b848', dirt: '#cdb079', far: '#d2bd9b' };
const paveUniforms = (stone, tile) => ({
  uWayStone: { value: stone }, uWayStoneTile: { value: new THREE.Vector2(1 / tile[0], 1 / tile[1]) },
  uWaySun: { value: new THREE.Vector2(-0.62, 0.48).normalize() },
  uPaveJoint: { value: new THREE.Vector3(...PAVE.joint) }, uPaveGrass: { value: rgb(PAVE.grass) }, uPaveFar: { value: rgb(PAVE.far) },
});

function softPathMaterial(map, tex, distTex) {
  const paint = tex && tex.paint ? tex.paint : null;
  return new THREE.ShaderMaterial({
    defines: paint ? { WAY_TEX: 1 } : {},
    uniforms: {
      ...softWayUniforms(map, paint, distTex),
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      attribute float aBank;   // how high it stands above the water beside it (10: no water near)
      varying vec3 vWP;
      varying float vHaze;
      varying float vBank;
      void main() {
        vBank = aBank;
        vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        mv.xyz *= 0.996;                       // drawn a hair nearer than the land, which bulges above the ribbon here and there
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${HAZEF}
      ${SOFT_WAY_GLSL}
      varying vec3 vWP;
      varying float vBank;
      void main() {
        vec4 w = softWay(vWP, abs(normalize(cross(dFdx(vWP), dFdy(vWP))).y), vBank);
        if (w.a < 0.01) discard;
        gl_FragColor = vec4(mix(w.rgb, uHaze, vHaze), w.a);
      }`,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
  });
}

// Catmull-Rom through the control points, about every `step` metres
function densify(pts, step = 1) {
  const out = [], P = i => pts[Math.min(pts.length - 1, Math.max(0, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2), n = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * ((2 * b[j]) + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
