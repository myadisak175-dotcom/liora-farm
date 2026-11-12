// rocks-level.js  —  a small test map for the stylized rocks and the cliff kit (rocks.js, sections 5–7), with the game's own
// grass, ground, water and light  (?map=rocks)
//
// One job: to see the rocks in the world they will live in, before they go into the real maps.
//   - a clearing in the middle (the rocks put together in rock-builder.html stand here, if this browser has any)
//   - a cliff along the north, built the way a studio builds one: the land is its bones (a step up to a plateau, with a hollow
//     where the falls come over and a ramp at the west end), the cliff kit's pieces stand along its face sunk into it and into
//     each other, tops lie on its edge, fallen rocks and rubble lie at its foot and cover the joins
//   - a stream on the plateau that falls over the cliff into a pool, which runs on into a pond with stones standing in it
//   - trodden dirt paths (ground-paths.js): to the pond's beach, to the foot of the cliff and the pool, and up the ramp and
//     along the top to a lookout by the falls
//
//   const level = await buildRocksLevel({ far, sun, grassCount, onStep });     // the same shape as the other levels
//   ?layout=demo   leaves the builder's rocks out (only this map's own)
//
// All the rocks are drawn as a few instanced groups (createRockKit): the same few shapes, many times over.
// How a rock takes part in the world (the footprint below, the same for every rock): the ground under it is cut into one-metre
// cells. Each cell it stands on is solid (she walks round it), grows no grass, has the grass round it pressed down and its
// ground shaded (the dark at the foot that sets a rock on the ground), throws a shadow with the sun, and keeps the water's waves
// out (so the water swells round it); tall ones keep the camera from passing through them. The rocks also know the ground's
// height (their foot shading and moss go by it), the water's level (a wet band at the waterline, greener under the water) and
// where the sun is.

import * as THREE from 'three';
import * as N from './stylized-nature.js';
import * as G from './stylized-grassfield.js';
import * as W from './stylized-water.js';
import * as RK from './rocks.js';
import { createPaths, loadPathTextures } from './ground-paths.js';
import { createAnimeCells } from './anime-cells.js';
import { createWaterDroplets } from './water-droplets.js';
import { createWaterfall } from './stylized-waterfall.js';

const { fbm3, mulberry32 } = N._internal;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

const UP = 7.5, POND = -0.5;                                               // the water's level on the plateau, and in the pool and the pond
export const ROCKS_MAP = {
  radius: 49, fieldRadius: 76,
  spawn: { x: 2, z: 17, yaw: Math.PI + 0.25 },
  clearing: { x: 0, z: 4, r: 11 },                                         // the builder's rocks stand here
  // the cliff: its line (z, wandering), how high the plateau stands, where the falls come over (in a hollow of the line), and
  // between which x its face lies back into a ramp she can walk up
  cliff: { z: -21, top: 7.6, falls: 27, hollow: 5.5, ramp: [-19, -33] },
  // the stream on the plateau (it ends at the lip of the falls) and the water below (the pool under the falls, the pond, the
  // way out): x, z, water level, half width, depth. The first z of `lower` and the last of `upper` are set from the cliff's line.
  upper: [[47, -75, UP, 1.5, 0.35], [37, -58, UP, 1.5, 0.35], [30, -45, UP, 1.6, 0.35], [27.5, -36, UP, 1.6, 0.35], [27, -31, UP, 1.6, 0.35], [27, 0, UP, 1.6, 0.35]],
  lower: [[27, 0, POND, 3.3, 1.0], [26.5, -19.5, POND, 4.2, 1.1], [25, -11, POND, 4.5, 1.0], [22.5, -3, POND, 6.5, 1.2], [22, 4, POND, 8, 1.4], [22, 10, POND, 6, 1.2],
    [26, 18, -0.62, 2.4, 0.5], [34, 31, -1.1, 1.5, 0.35], [44, 45, -1.8, 1.5, 0.35]],
  paths: [{ points: [[2, 24], [3, 16], [5, 10], [8.5, 5], [12.5, 2.5], [15.5, 2]], half: 1.25 },                    // the start -> the pond's beach
    { points: [[5, 10], [0.5, 7.5], [-3.5, 2], [-6, -4.5], [-5.5, -10.5]], half: 1.0 },                            // -> the foot of the cliff
    { points: [[-5.5, -10.5], [2, -13], [10, -14.5], [17, -15.5], [20.5, -17]], half: 0.95 },                      // along the foot -> the pool under the falls
    { points: [[-5.5, -10.5], [-13, -11.5], [-22, -13.5], [-29.5, -19], [-31, -26], [-26, -31.5], [-16, -31], [-4, -29.5], [8, -30], [16, -31], [21.5, -30]], half: 0.95 }],      // up the ramp, along the top -> the lookout
};
// loose rocks of the map's own: type, seed, x, z, turn (degrees), size, how deep the foot is sunk (m)
const LOOSE = [
  ['boulder', 1, -9, -13.5, 40, 0.9, 0.3], ['stone', 2, -1.5, -15.5, 10, 1.2, 0.15],
  ['boulder', 2, -12, 8, 70, 1.0, 0.3], ['stone', 1, -10.5, 11, 15, 1.3, 0.15], ['pillar', 1, 11, 12, 0, 0.9, 0.3],
  ['pebbles', 1, 13.5, 1.5, 0, 1.3, 0.05], ['pebbles', 2, 15, 10, 40, 1.0, 0.05],
];
// rocks standing in the pond: found by walking out from its middle (22, 2) along a bearing (degrees) until the water is this
// shallow, so they stand on the bed and break the surface
const IN_WATER = [['boulder', 3, 200, 0.55, 20, 1.2, 0.25], ['stone', 3, 70, 0.4, 80, 1.5, 0.15], ['stone', 2, 135, 0.35, 10, 1.1, 0.1],
  ['ledge', 1, -20, 0.5, -30, 0.85, 0.2], ['boulder', 1, 250, 0.9, 50, 1.4, 0.3]];
const TRUNK = { broadleaf: 0.42, oak: 0.55, pine: 0.38, birch: 0.24 }, TREE_H = { broadleaf: 7.5, oak: 7.5, pine: 7.5, birch: 8 };

export async function buildRocksLevel({ seed = 6, far = '#cde6f2', grassCount = 160000, sun = [-0.45, 0.62, 0.64], onStep = async () => {} } = {}) {
  const M = ROCKS_MAP, C = M.cliff, FR = M.fieldRadius, CELLS = 304, STEP = FR * 2 / CELLS, NV = CELLS + 1;
  const group = new THREE.Group(); group.name = 'rocksTest';

  // ------------------------------------------------------------------ the cliff's line
  // z of the middle of its face at x: it wanders, lies back into a hollow round the falls, and has a notch where the water comes over
  const cliffZ = x => C.z + (fbm3(x * 0.07, 2.2, 0.4, seed + 3, 2) - 0.5) * 5 - C.hollow * Math.exp(-(((x - C.falls) / 6.5) ** 2)) - 1.2 * Math.exp(-(((x - C.falls) / 1.9) ** 2));
  // half the width of the face: steep along the cliff, nearly upright at the falls, a long ramp at the west end
  const faceHalf = x => lerp(lerp(1.25, 12, ss(C.ramp[0], C.ramp[1], x)), 0.7, Math.exp(-(((x - C.falls) / 2.4) ** 2)));
  const normalAt = x => { const d = cliffZ(x + 0.5) - cliffZ(x - 0.5), l = Math.hypot(d, 1); return [-d / l, 1 / l]; };      // out of the face, towards the low ground
  const lipZ = cliffZ(C.falls) - 0.4;                                      // where the stream leaves the plateau

  // ------------------------------------------------------------------ water: the nearest point of each water for every grid point
  await onStep('ขุดลำธารและบ่อน้ำ');
  const upperPts = M.upper.map(p => p.slice()), lowerPts = M.lower.map(p => p.slice());
  upperPts[upperPts.length - 1][1] = lipZ; lowerPts[0][1] = cliffZ(C.falls) + 3.0;
  const upper = densify(upperPts, 0.5), lower = densify(lowerPts, 0.5);
  const wEdge = new Float32Array(NV * NV), wLevel = new Float32Array(NV * NV), wDepth = new Float32Array(NV * NV), lowEdge = new Float32Array(NV * NV), upEdge = new Float32Array(NV * NV);
  const nearest = (line, x, z) => { let best = 1e9, bi = 0; for (let k = 0; k < line.length; k++) { const s = line[k], d = Math.hypot(x - s[0], z - s[1]) - s[3]; if (d < best) { best = d; bi = k; } } return [best, line[bi]]; };
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const x = -FR + i * STEP, z = -FR + j * STEP, o = j * NV + i;
    const wob = fbm3(x * 0.16, 5.5, z * 0.16, seed + 41, 2) - 0.5;
    const [dl, sl] = nearest(lower, x, z), el = dl + wob * Math.min(2.6, sl[3] * 0.5);
    let eu = 1e9, su = null;
    if (z < lipZ + 0.6 && x > 14) { const q = nearest(upper, x, z); eu = q[0] + wob * 0.7; su = q[1]; }      // the plateau's stream: only up there
    lowEdge[o] = el; upEdge[o] = eu;
    const s = eu < el ? su : sl;
    wEdge[o] = Math.min(el, eu); wLevel[o] = s[2]; wDepth[o] = s[4];
  }
  const gridAt = (arr, x, z) => {
    const fx = Math.min(CELLS - 1e-4, Math.max(0, (x + FR) / STEP)), fz = Math.min(CELLS - 1e-4, Math.max(0, (z + FR) / STEP));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * NV + i;
    return (arr[o] * (1 - u) + arr[o + 1] * u) * (1 - v) + (arr[o + NV] * (1 - u) + arr[o + NV + 1] * u) * v;
  };
  // (the water's level is never blended between grid points: the two waters lie 8 m apart)
  const levelAt = (x, z) => wLevel[Math.round(Math.min(CELLS, Math.max(0, (z + FR) / STEP))) * NV + Math.round(Math.min(CELLS, Math.max(0, (x + FR) / STEP)))];

  // ------------------------------------------------------------------ the land: a level clearing, the cliff and its plateau, banks round the water
  await onStep('ปั้นพื้นดิน');
  const paths = createPaths({ paths: M.paths, seed });
  const heightFn = (x, z) => {
    const r = Math.hypot(x, z);
    let h = (fbm3(x * 0.04, 0.5, z * 0.04, seed, 3) - 0.5) * 2.2 + (fbm3(x * 0.12, 1.7, z * 0.12, seed + 5, 2) - 0.5) * 0.5;
    h = lerp(h, 0.3, 1 - ss(M.clearing.r, M.clearing.r + 9, Math.hypot(x - M.clearing.x, z - M.clearing.z)));
    const cz = cliffZ(x), w = faceHalf(x), up = ss(cz + w, cz - w, z);     // the step up to the plateau (which rolls less than the low ground)
    h = lerp(h, h * 0.45 + C.top, up);
    h += Math.pow(ss(50, 74, r), 1.3) * 9;                                   // the land rises at the map's edge
    const o = Math.round((z + FR) / STEP) * NV + Math.round((x + FR) / STEP), e = wEdge[o], lv = wLevel[o];
    if (e < 8) {
      h = lerp(h, Math.max(h, lv + 0.3 + Math.max(0, e) * 0.1), 1 - ss(4.5, 8, e));
      h = lerp(h, lv - wDepth[o], ss(1.5, -0.9 - wDepth[o] * 2.6, e));
    }
    return h + paths.sink(x, z);
  };
  const field = G.createHeightField({ radius: FR, cells: CELLS, heightFn });
  const H = field.heightAt;
  const waterDepthAt = (x, z) => gridAt(wEdge, x, z) < 1.5 ? Math.max(0, levelAt(x, z) - H(x, z)) : 0;
  const slope = (x, z) => Math.hypot(H(x + 0.5, z) - H(x - 0.5, z), H(x, z + 0.5) - H(x, z - 0.5));
  const onPath = (x, z, pad = 0) => { const q = paths.near(x, z); return q.d < q.half * 1.3 + pad; };

  // ------------------------------------------------------------------ the rocks: listed first (what, where), drawn together at the end
  await onStep('วางหินและหน้าผา');
  const rockList = [];
  const put = (type, sd, x, z, { ry = 0, rx = 0, rz = 0, s = 1, sink = 0, y = null } = {}) => rockList.push({ type, seed: sd, x, z, y: y ?? H(x, z) - sink, ry, rx, rz, s });
  for (const [type, sd, x, z, ry, s, sink] of LOOSE) put(type, sd, x, z, { ry, s, sink });
  for (const [type, sd, bearing, depth, ry, s, sink] of IN_WATER) {
    const a = bearing * Math.PI / 180;
    let x = 22, z = 2;
    for (let r = 0; r < 14 && waterDepthAt(x, z) > depth; r += 0.25) { x = 22 + Math.cos(a) * r; z = 2 + Math.sin(a) * r; }
    put(type, sd, x, z, { ry, s, sink });
  }
  put('paving', 1, 30, 24.6, { ry: 31, s: 1.35, y: levelAt(30, 24.6) - 0.12 });      // stepping stones across the way out of the pond
  for (const st of paths.stones()) put(st.type, 1 + st.seed % 4, st.x, st.z, { ry: st.ry, s: st.s, sink: st.sink });      // flat stones set into the paths, pebbles by them (four shapes of each)

  // ---- the cliff, dressed with the kit. Along its line, wherever the land's own face is high: a big piece (faces, tall
  // columns, ribs in turn), sunk into the ground and into the face, as tall as the face there, overlapping the one before; here
  // and there a top slab on the edge above. Where the face runs out into the ramp: wedges, then fallen rocks. At the foot, on
  // the joins between the big pieces: rubble, fallen blocks, huddles of rock. Nothing where the water comes over.
  {
    const rng = mulberry32(seed * 613 + 1), R = (a, b) => a + rng() * (b - a), DEG = 180 / Math.PI;
    const TURN = ['cliffFace', 'cliffTall', 'buttress', 'cliffFace', 'cliffTall', 'cliffFace', 'buttress', 'cliffTall'], joins = [];
    const landing = [C.falls, lipZ + 2.7];                                 // where the falls come down
    const clear = (x, z, r) => !onPath(x, z, r) && Math.hypot(x - landing[0], z - landing[1]) > 2.6 + r && Math.hypot(x, z) < 60;
    const probe = xx => { const cz = cliffZ(xx), [nx, nz] = normalAt(xx); return { cz, nx, nz, low: H(xx + nx * 3.2, cz + nz * 3.2), top: H(xx - nx * 2.6, cz - nz * 2.6), steep: slope(xx, cz) }; };
    const GAP = 2.9;                                                       // either side of the falls: left open
    let x = -36, n = 0;
    while (x < 56) {
      if (Math.abs(x - C.falls) < GAP) { x = C.falls + GAP; continue; }
      const p0 = probe(x), fh = p0.top - p0.low, big = fh > 3.2;
      if (p0.steep < 0.8 || fh < 0.9) { x += 2.5; continue; }               // no face here (the ramp): left to the grass
      const type = big ? TURN[n++ % TURN.length] : fh > 2.0 ? 'slopeRock' : rng() < 0.5 ? 'footRock' : 'cluster', sd = 1 + Math.floor(rng() * 3);
      const bb = RK.propRockGeometry(type, sd).boundingBox, sink = type === 'cluster' ? 0.15 : R(0.5, 0.9);
      const s = big ? Math.min(1.6, Math.max(0.5, (fh + sink + R(-0.1, 0.8)) / bb.max.y)) : fh > 2.0 ? Math.min(1.3, Math.max(0.55, (fh + sink + 0.4) / bb.max.y)) : R(0.8, 1.2);
      const w = (bb.max.x - bb.min.x) * s;
      let xc = x + w * 0.4;
      if (xc < C.falls && xc + w * 0.5 > C.falls - GAP + 0.3) xc = C.falls - GAP + 0.3 - w * 0.5;      // up to the falls, not over them
      if (x >= C.falls && x < C.falls + GAP + 0.1) xc = C.falls + GAP - 0.3 + w * 0.5;
      const p = probe(xc), back = big ? R(0.5, 1.1) : R(0.2, 0.6), mid = (bb.max.x + bb.min.x) / 2 * s;
      const ox = xc - p.nx * back - p.nz * mid, oz = p.cz - p.nz * back + p.nx * mid;      // (the piece's own x runs along the face)
      if (big || clear(ox + p.nx * 2, oz + p.nz * 2, 0.5)) {
        put(type, sd, ox, oz, { ry: Math.atan2(p.nx, p.nz) * DEG + R(-9, 9), s, y: Math.min(p.low, H(ox + p.nx * 2, oz + p.nz * 2)) - sink });
        if (big && rng() < 0.5 && Math.abs(xc - C.falls) > 6) {             // a top slab on the plateau's edge above
          const tx = xc - p.nx * 2.8 + R(-1, 1), tz = p.cz - p.nz * 2.8;
          put('cliffTop', 1 + Math.floor(rng() * 3), tx, tz, { ry: Math.atan2(p.nx, p.nz) * DEG + R(-25, 25), s: R(0.42, 0.62), y: H(tx, tz) - R(0.25, 0.4) });
        }
      }
      x = xc + w * (big ? 0.27 : 0.45);
      if (fh > 2.0) joins.push(x);
      if (big && Math.abs(x - C.falls) > GAP + 1.5) {                       // behind the join to the next piece: another, set deeper into the face, so the gap shows rock
        const q = probe(x), t2 = n % 2 ? 'cliffFace' : 'cliffTall', sd2 = 1 + Math.floor(rng() * 3), b2 = RK.propRockGeometry(t2, sd2).boundingBox;
        const s2 = Math.min(1.6, Math.max(0.5, (q.top - q.low + 1.2 + R(0.2, 0.9)) / b2.max.y)), back2 = R(1.5, 2.0), mid2 = (b2.max.x + b2.min.x) / 2 * s2;
        put(t2, sd2, x - q.nx * back2 - q.nz * mid2, q.cz - q.nz * back2 + q.nx * mid2, { ry: Math.atan2(q.nx, q.nz) * DEG + R(-12, 12), s: s2, y: q.low - 1.2 });
      }
    }
    for (const jx of joins) {
      const cz = cliffZ(jx), [nx, nz] = normalAt(jx), at = (out, side) => [jx + nx * out + nz * side, cz + nz * out - nx * side];
      const a = at(R(1.7, 2.5), R(-1, 1));
      if (clear(a[0], a[1], 0.3)) put('rubble', 1 + Math.floor(rng() * 3), a[0], a[1], { ry: R(0, 360), s: R(1.1, 1.7), sink: 0.03 });
      const b = at(R(2.6, 3.6), R(-1.5, 1.5));
      if (rng() < 0.6 && clear(b[0], b[1], 1.2)) put('footRock', 1 + Math.floor(rng() * 3), b[0], b[1], { ry: R(0, 360), rz: R(-8, 8), s: R(0.75, 1.35), sink: R(0.25, 0.45) });
      const c = at(R(3.8, 5.4), R(-2.5, 2.5));
      if (rng() < 0.35 && clear(c[0], c[1], 1.2)) put('cluster', 1 + Math.floor(rng() * 3), c[0], c[1], { ry: R(0, 360), s: R(0.8, 1.25), sink: 0.12 });
      const d = at(R(3.2, 6), R(-3, 3));
      if (rng() < 0.5 && clear(d[0], d[1], 0.3)) put('rubble', 1 + Math.floor(rng() * 3), d[0], d[1], { ry: R(0, 360), s: R(0.8, 1.3), sink: 0.03 });
    }
    // on the brink either side of the falls, and in the pool beside where they land
    for (const sgn of [-1, 1]) {
      const bx = C.falls + sgn * 3.3;
      put('cluster', sgn > 0 ? 1 : 2, bx, cliffZ(bx) - 2.2, { ry: R(0, 360), s: 1.0, sink: 0.15 });
      put('footRock', sgn > 0 ? 2 : 3, C.falls + sgn * 3.6, lipZ + 4.6, { ry: R(0, 360), s: 1.15, sink: 0.5 });
    }
  }
  // the rocks put together in the builder (this browser's last layout), set in the clearing
  let fromBuilder = 0;
  if (!new URLSearchParams(location.search).has('layout')) {
    try {
      const d = JSON.parse(localStorage.getItem('rockBuilder.v1') || 'null');
      for (const q of (d && d.pieces) || []) {
        if (!RK.PROP_ROCK_TYPES.some(t => t.key === q.type)) continue;
        const x = M.clearing.x + (+q.x || 0), z = M.clearing.z + (+q.z || 0);
        put(q.type, q.seed | 0 || 1, x, z, { ry: +q.ry || 0, rx: +q.rx || 0, rz: +q.rz || 0, s: +q.s || 1, y: H(x, z) + (+q.y || 0) });
        fromBuilder++;
      }
    } catch { /* no builder layout in this browser */ }
  }
  const rocks = RK.createRockKit(rockList);
  rocks.name = 'rocks';
  group.add(rocks);
  // each rock's footprint: the cells it stands on (a cell is taken if a point of its surface comes down to within half a metre
  // of the ground there) and how tall it is over each
  const colliders = [], shade = [], bare = [], press = [], casters = [], cameraTrunks = [], solid = new Set();
  {
    const v = new THREE.Vector3(), cells = new Map();
    for (const { geometry, matrix } of rocks.userData.instances) {
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 2) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        const cx = Math.floor(v.x), cz = Math.floor(v.z), key = cx + ',' + cz;
        let c = cells.get(key);
        if (!c) cells.set(key, c = { cx, cz, g: H(cx + 0.5, cz + 0.5), low: Infinity, top: -Infinity });
        c.low = Math.min(c.low, v.y - c.g); c.top = Math.max(c.top, v.y - c.g);
      }
    }
    for (const c of cells.values()) {
      if (c.low > 0.5 || c.top < 0.08) continue;                            // an overhang above the ground, or a sliver at its foot
      const x = c.cx + 0.5, z = c.cz + 0.5;
      if (c.top > 0.35) { colliders.push([x, z, 0.62]); solid.add(c.cx + ',' + c.cz); }
      bare.push([x, z, 0.55]); press.push([x, z, 1.25]);
      if (c.top < 0.25) continue;                                            // a flat stone or pebbles: no pool of shade, no shadow worth drawing
      shade.push([x, z, 1.3, Math.min(0.55, 0.2 + c.top * 0.12)]);
      const above = c.g + c.top - Math.max(H(x + 3, z), H(x - 3, z), H(x, z + 3), H(x, z - 3));      // (a rock on the cliff's face casts only as high as it stands above the land beside it)
      if (above > 0.3) casters.push([x, z, Math.min(c.top, above), 0.62, 0.85]);
      if (c.top > 1.8) cameraTrunks.push([x, z, 0.7, c.g, c.g + c.top]);
    }
  }
  const inRock = (x, z) => solid.has(Math.floor(x) + ',' + Math.floor(z));

  // ------------------------------------------------------------------ trees: a ring far off, and a few on the plateau above the cliff
  const plants = [];
  {
    const r = mulberry32(seed * 31), types = ['broadleaf', 'oak', 'pine', 'birch'];
    const tree = (x, z, type, scale) => {
      const y = H(x, z), rad = TRUNK[type] * scale;
      plants.push({ kind: 'tree', type, seed: 100 + plants.length, detail: 0.8, x, y: y - 0.05, z, rotY: r() * 6.28, scale });
      colliders.push([x, z, rad + 0.22]); cameraTrunks.push([x, z, rad + 0.12, y, y + TREE_H[type] * scale]);
      shade.push([x, z, 4 * scale, 0.4]); bare.push([x, z, rad * 1.5]); casters.push([x, z, TREE_H[type] * scale, 2.4 * scale, 0.7]);
    };
    for (let i = 0; i < 30; i++) { const a = r() * 6.28, d = 44 + r() * 20, x = Math.cos(a) * d, z = Math.sin(a) * d; if (gridAt(wEdge, x, z) > 4 && !onPath(x, z, 2) && slope(x, z) < 0.6) tree(x, z, types[i % 4], 0.9 + r() * 0.3); }
    for (let x = -22; x < 50; x += 6 + r() * 5) {
      const z = cliffZ(x) - 4.5 - r() * 9;
      if (gridAt(wEdge, x, z) > 3.5 && !onPath(x, z, 2.2) && !inRock(x, z) && slope(x, z) < 0.5) tree(x, z, types[Math.floor(r() * 4)], 0.85 + r() * 0.35);
    }
  }

  // ------------------------------------------------------------------ the ground's colour (sand by the water, bare rock where it is steep), shadows
  await onStep('ระบายสีพื้น');
  const paint = (x, z) => {
    if (Math.hypot(x, z) > FR - 2) return [0, 0, 0];
    const e = gridAt(wEdge, x, z), wide = ss(0.5, 1.4, gridAt(wDepth, x, z));
    const sand = e < 4 ? 1 - ss(wide * 1.5, 0.5 + wide * 3, e) : 0;
    let earth = ss(0.9, 1.3, slope(x, z)), mow = 0;                        // where the land is steep the grass gives up: the cliff's own rock
    const pp = paths.paint(x, z);
    if (pp) { earth = Math.max(earth, pp[0]); mow = pp[2]; }
    return [earth, sand, mow];
  };
  const L = new THREE.Vector3(...sun).normalize();
  const sunShadows = dir => {                                              // each caster: a shadow from its foot out to where its top's shadow falls
    L.copy(dir).normalize();
    const dxz = Math.hypot(L.x, L.z) || 1, ly = Math.max(0.3, L.y), ux = -L.x / dxz, uz = -L.z / dxz, len = dxz / ly;
    return casters.map(([x, z, h, r, st]) => [x + ux * len * h / 2, z + uz * len * h / 2, len * h / 2 + r, r * 1.1, ux, uz, st, 0]);
  };
  // (bare earth on this map is the cliff's rock showing between the pieces: grey, like their shaded sides; the paths have a paint of their own)
  const map = G.createGroundMap({ radius: FR, size: 1024, seed, heightAt: H, dirt: 0, shade, bare, press, paint, cast: sunShadows(L.clone()),
    colors: { ...G.GROUND_COLORS, deep: '#55924a', mid: '#7cae40', sunny: '#9fc84a', shade: '#447a3c', dirt: '#8b8f93' } });
  const fade = { far, fadeA: FR * 0.8, fadeB: FR * 0.985 };
  const terrain = G.createTerrain(field, map, fade);
  group.add(terrain);
  let pathTex = null;
  try { pathTex = await loadPathTextures(); } catch (err) { console.warn('[rocks] path textures', err); }      // without them: the painted look
  const pathRibbon = paths.ribbon(H, map, pathTex);
  if (pathTex) pathRibbon.userData.dispose = (d => () => { d(); pathTex.dispose(); })(pathRibbon.userData.dispose);
  group.add(pathRibbon);
  { let fs = seed * 71; const pal = [['#f4a6bc', '#f6f2e6'], ['#f7d84a', '#f6f2e6'], ['#b9a3e8', '#93b8ee']];
    for (const [x, z, r] of paths.flowers) if (!inRock(x, z) && slope(x, z) < 0.5) group.add(N.createFlowers({ count: Math.round(30 * r), radius: r, seed: ++fs, heightAt: H, center: [x, z], colors: pal[fs % 3] })); }

  // ------------------------------------------------------------------ the water: a ribbon along each stream, the falls between them
  await onStep('เติมน้ำ');
  const foamTexture = await W.loadFoamTexture();
  const animeCells = createAnimeCells();
  const droplets = createWaterDroplets({ time: N._internal.shared.uTime });
  droplets.points.userData.dispose = droplets.dispose;
  group.add(droplets.points);
  const ribbonOf = line => {
    const ACROSS = 48, pos = [], flow = [], dir = [], idx = [];
    let F = 0;
    for (let k = 0; k < line.length; k++) {
      const s = line[k], a = line[Math.max(0, k - 1)], b = line[Math.min(line.length - 1, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const half = s[3] + 2.4 + Math.min(2.6, s[3] * 0.5) * 0.6, streaminess = 1 - ss(2.6, 6.5, s[3]);
      if (k > 0) F += Math.hypot(s[0] - a[0], s[1] - a[1]) * W.FLOW.pond / lerp(W.FLOW.pond, W.FLOW.stream, streaminess);
      for (let i = 0; i <= ACROSS; i++) { const u = -1 + 2 * i / ACROSS; pos.push(s[0] - tz * u * half, s[2], s[1] + tx * u * half); flow.push(F, u * half, streaminess); dir.push(tx, tz); }
    }
    for (let k = 0; k < line.length - 1; k++) for (let i = 0; i < ACROSS; i++) { const a = k * (ACROSS + 1) + i, b = a + ACROSS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setIndex(idx);
    return g;
  };
  // the waves run round the rocks that stand in the water (and swell against them); they cover the pool and the pond
  const sim = W.createWaterSim({ rect: [0, -32, 51], size: 512, field, foamTexture, level: POND, mask: (x, z) => z > lipZ + 0.6 && waterDepthAt(x, z) > 0.03 && !inRock(x, z) });
  const optics = W.createWaterOptics({ level: POND });
  const waterMat = W.waterMaterial({ field, animeCells, sim, optics, foamTexture, ...fade });
  const waters = [lower, upper].map(line => {
    const m = new THREE.Mesh(ribbonOf(line), waterMat);
    m.name = 'water'; m.renderOrder = 1;
    m.userData = { kind: 'water', dispose() { m.geometry.dispose(); } };
    group.add(m);
    return m;
  });
  const falls = createWaterfall({ x: C.falls, z: lipZ, top: UP, bottom: POND - 0.25, width: 3.1, forward: 2.3, optics, foamTexture, cells: animeCells, surfaceChurn: W.WATER_CHURN });
  falls.group.userData = { kind: 'waterfall', dispose: falls.dispose };
  group.add(falls.group);
  // the water's level for the rocks' paint (rocks.js section 7): a small picture over the map, no water = -10000
  let levelTex;
  {
    const S = 256, data = new Uint16Array(S * S), x0 = -FR, z1 = FR, step = FR * 2 / S;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = x0 + (i + 0.5) * step, z = z1 - (j + 0.5) * step, lv = levelAt(x, z);
      data[j * S + i] = THREE.DataUtils.toHalfFloat(gridAt(lowEdge, x, z) < 3 ? (lv < 2 ? lv : POND) : gridAt(upEdge, x, z) < 1.2 ? UP : -1e4);
    }
    levelTex = new THREE.DataTexture(data, S, S, THREE.RedFormat, THREE.HalfFloatType);
    levelTex.magFilter = levelTex.minFilter = THREE.NearestFilter; levelTex.needsUpdate = true;      // (not blended: a blend between "none" and a level is no level at all)
    RK.setRockWater({ texture: levelTex, x0, z1, size: FR * 2 });
  }
  const ripple = (x, z, strength = 1, radius = 0.26, mode = null) => {
    const k = W.WATER_TUNE.ripple.value, foam = W.WATER_TUNE.splashFoam.value, drop = W.WATER_TUNE.drops.value;
    if (mode === 'plain') sim.impulse(x, z, radius, -0.03 * strength * k);
    else if (mode === 'splash' || (mode === null && strength >= 1.5)) {
      if (sim.inside(x, z)) W.WATER_RINGS.add(x, z, Math.min(2, 0.7 * strength));
      sim.impulse(x, z, radius, 0.012 * strength * k * W.WATER_TUNE.splashBump.value, Math.min(1, 0.4 * strength) * foam);
      if (drop > 0 && sim.inside(x, z)) droplets.emit(x, levelAt(x, z), z, strength / 2.4 * drop, Math.round(14 * Math.min(1.5, drop)));
    } else {
      const st = mode === 'step';
      if (st) W.WATER_WAKE.add(x, z, Math.min(1.3, 0.9 * strength));
      sim.impulse(x, z, radius, (st ? -0.042 : -0.03) * strength * k, -Math.min(st ? 0.15 : 0.55, (st ? 0.18 : 0.75) * strength) * foam);
      if (st && drop > 0 && sim.inside(x, z)) droplets.emit(x, levelAt(x, z), z, 0.16 * drop * strength, strength > 1.2 ? 3 : 2);
    }
  };

  // ------------------------------------------------------------------ grass, leaves
  await onStep('ปลูกหญ้า');
  const grass = G.createFollowGrass({ map, field, count: grassCount, tile: 62, seed, thin: Math.sqrt(200000 / grassCount), ...fade });
  group.add(grass);
  if (plants.length) group.add(N.createForest(plants));

  // ------------------------------------------------------------------ the sun: shadows on the ground follow it (drawn in the background), the rocks' light too
  let castSun = L.clone(), castK = 1, wantSun = castSun.clone(), wantK = 1, lastCast = -99, castBusy = false, nextSplash = 0;
  const cast = { dir: castSun.clone(), k: 1 };
  RK.setRockSun(L);
  terrain.layers.enable(W.UNDERWATER);
  rocks.traverse(o => o.layers.enable(W.UNDERWATER));
  const hidden = [...waters, grass, droplets.points];
  const waterSpheres = [new THREE.Sphere(new THREE.Vector3(22, POND, 4), 14), new THREE.Sphere(new THREE.Vector3(26, POND, -17), 10), new THREE.Sphere(new THREE.Vector3(34, -1, 30), 10),
    new THREE.Sphere(new THREE.Vector3(C.falls, UP / 2, lipZ), UP / 2 + 3)];
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), camWorld = new THREE.Vector3();
  let frameNo = 0, baked = false;
  const walkable = (x, z) => Math.hypot(x, z) < M.radius && waterDepthAt(x, z) < 0.9 && !inRock(x, z) && slope(x, z) < 0.85;
  const views = {
    start: M.spawn,
    'rk-clearing': { x: 0, z: 13, yaw: Math.PI }, 'rk-cliff': { x: -4, z: -8.5, yaw: Math.PI + 0.2 }, 'rk-falls': { x: 19.5, z: -15.5, yaw: 2.5 },
    'rk-top': { x: 21.5, z: -29.5, yaw: 0.5 }, 'rk-pond': { x: 11, z: 3, yaw: Math.PI / 2 }, 'rk-stream': { x: 26.5, z: 26.8, yaw: 2.1 }, 'rk-path': { x: 3.5, z: 19, yaw: Math.PI + 0.3 },
  };
  console.info('[rocks] rocks', rockList.length, 'in', rocks.userData.shapes, 'shapes,', Math.round(rocks.userData.triangles / 1000) + 'k triangles; from the builder', fromBuilder, '; solid cells', solid.size, 'shadow casters', casters.length);
  group.userData = { kind: 'rocksTest', dispose() {
    group.traverse(o => { if (o !== group && o.userData && o.userData.dispose) o.userData.dispose(); });
    waterMat.dispose(); sim.dispose(); optics.dispose(); map.dispose(); field.texture.dispose(); levelTex.dispose(); RK.setRockWater({}); W.WATER_CHURN.value.w = 0;
  } };
  return {
    group, map, field, grass, terrain, heightAt: H, waterDepthAt, colliders, crowns: [], cameraTrunks, spawn: M.spawn, radius: M.radius, walkable, views,
    keepClear: (x, z, r = 0) => onPath(x, z, r) || slope(x, z) > 0.6,       // nothing grows on the paths or on the cliff's face
    name: 'ทดสอบหิน', stats: { rocks: rockList.length, shapes: rocks.userData.shapes, triangles: rocks.userData.triangles, fromBuilder },
    ripple, sim, optics, waterLevelAt: levelAt,
    addUnderwater(obj) { obj.traverse(o => o.layers.enable(W.UNDERWATER)); },
    confine(p) {                                                           // a step back off a rock, out of deep water, off the cliff's face
      if (walkable(p.x, p.z)) return;
      for (let r = 0.15; r <= 3; r += 0.15) for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos(a * Math.PI / 6) * r, z = p.z + Math.sin(a * Math.PI / 6) * r;
        if (walkable(x, z)) { p.x = x; p.z = z; return; }
      }
    },
    update(renderer, dt, scene = null, camera = null) {
      // the ground's height for the rocks' paint, drawn once (the terrain from straight above)
      if (!baked) { baked = true; RK.bakeGroundForRocks(renderer, [terrain], { center: [0, 0], size: FR * 2, res: 1024 }); }
      sim.step(renderer, dt);
      droplets.update(renderer);
      falls.update(renderer);
      const nowT = N._internal.shared.uTime.value;
      if (nowT > nextSplash) { ripple(C.falls + (Math.random() - 0.5) * 2.4, lipZ + 2.5 + Math.random() * 0.7, 1.3, 0.4, 'plain'); nextSplash = nowT + 0.18; }      // the falls keep the pool restless
      if (castBusy) { if (map.stepCast(2.5)) { castBusy = false; lastCast = nowT; cast.dir.copy(castSun); } }
      else if (nowT - lastCast > 4 && (castSun.angleTo(wantSun) > 0.075 || Math.abs(castK - wantK) > 0.12)) { castSun.copy(wantSun); castK = wantK; castBusy = true; map.beginCast(sunShadows(castSun), castK); }
      if (!scene || !camera) return;
      frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      camWorld.setFromMatrixPosition(camera.matrixWorld);
      let near = Infinity;
      for (const sp of waterSpheres) if (frustum.intersectsSphere(sp)) near = Math.min(near, camWorld.distanceTo(sp.center) - sp.radius);
      frameNo++;
      const q = optics.quality, doThrough = near < 42, doMirror = q > 0 && near < 65 && frameNo % (q === 2 ? 2 : 4) === 0;
      if (doThrough || doMirror) optics.render(renderer, scene, camera, hidden, doThrough, doMirror);
    },
    setSun(dir, k = 1) { wantSun.copy(dir); wantK = k; cast.k = Math.min(1, k * 1.2); RK.setRockSun(dir); },
    get sunCast() { return cast; },
    tapWater(origin, dir) {
      for (let t = 1; t < 70; t += 0.25) {
        const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t, ground = H(x, z), depth = waterDepthAt(x, z);
        if (depth > 0.03 && y <= ground + depth) { ripple(x, z, 2.4, 0.36); return true; }
        if (y <= ground) return false;
      }
      return false;
    },
    follow(pos, lookDir) { grass.userData.follow(pos, lookDir); W.WATER_WAKE.track(pos.x, pos.z, waterDepthAt(pos.x, pos.z)); },
  };
}

// Catmull-Rom through the control points, about every `step` metres
function densify(pts, step = 1) {
  const out = [], P = i => pts[Math.min(pts.length - 1, Math.max(0, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2), n = Math.max(2, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push(b.map((_, j) => 0.5 * ((2 * b[j]) + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
