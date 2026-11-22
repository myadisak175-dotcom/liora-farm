/* ==========================================================================
   west-fringe.js  —  the west fringe joined onto the hill village's land

     const west = await joinWestFringe({ raw, plan, url, alive });      // as the level reads its land, before it makes anything from it
     west.raw            the land's numbers with the fringe's columns added on the west (plan.land says how wide it is now)
     west.dryAt(x, z)    0..1: how much a spot is the bed of the fringe's dry water (bare and sandy: no grass grows in it; the
                         brook's bed runs on over the seam into the village's own brook)
     west.beds           the same beds as a picture for the land's paint: { map, rect, levels } (stylized-terrain.js, beds)
     west.deadAt(x, z)   0..1: how dead the land is there (the curse's picture, as it is set here)
     west.water          null, or with alive: which of the plan's stretches are the fringe's standing water and its outflow
                         ({ still, outflows }: west-fringe-water.js, for land-water.js)

   One job: make the two lands one as they are read. The fringe (assets/heightmaps/west-fringe.bin + .json, written by
   tools/make-west-fringe-heightmap.py) is the neglected countryside west of the village: the old road, a lost hamlet, a dry
   pond and brook, land sunk in steps, sinkholes, a dead hill. It lies on the village's own grid and IS the village's land
   from the seam (x = -80) east, so nothing is fitted here: its columns west of the seam are put in beside the village's.
   The village's old west margin (wooded hills nobody walked on) is what they replace.

   The plan is changed too, so the level builds the fringe with what it already has and knows nothing more of it:
     land      wider (x0, nx), and land.more: a second part she may walk in
     paths     the village's road now begins at the seam; the fringe's ways are added (painted and trodden like any other)
     inflows   the brook that came in through the old margin's hill comes in no more: its bed out there is dry
     views     the fringe's places (teleport-menu.js lists them)
   Its plants are not added here: the dead trees are in the map's own foliage (put in once by the fringe's tool, --into-map),
   so they are arranged by hand like any other plant. What is done here is to make the land dead: the dryness picture
   (stylized-nature's setDryness) takes the leaves off every tree west of the seam and thins those just east of it
   (anime-tree.js), and turns the meadow there to dry earth with dry grass in patches (stylized-grassfield.js, the land's
   paint, and the woods past the land's edge: map-rim.js).

   ALIVE (?green=1, a trial: the level asks for it): the fringe as it will be when it is healed. The same land and the same
   plants, but nothing here is dead: the dryness picture is not set (the trees keep their leaves, the meadow is green, and
   so are the woods past the land's edge), no bed is dry (dryAt 0 everywhere, the beds' picture empty), and the dry water
   is water again: west-fringe-water.js says it in the plan's own words, and the level lays it as it lays every water.
   Its places are named for what they are then (a view's fourth: its name, which teleport-menu.js shows in place of its own).
   ========================================================================== */
import * as THREE from 'three';
import { setDryness } from './stylized-nature.js';
import { fringeWaterBack } from './west-fringe-water.js';

export const WEST_FRINGE = { land: './assets/heightmaps/west-fringe.bin', plan: './assets/heightmaps/west-fringe.json' };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ALIVE_NAMES = { 'wf-fall': '💦 น้ำตกชายขอบ', 'wf-pond': '🏞 บึงชายขอบ', 'wf-hill': '🌳 ยอดเนินป่า', 'wf-hamlet': '🏡 หมู่บ้านเก่า' };      // (alive: no fall is dry, no wood dead)

export async function joinWestFringe({ raw, plan: P, url, alive = false }) {
  const fresh = { cache: 'no-cache' };
  const [w16, F] = await Promise.all([fetch(url(WEST_FRINGE.land), fresh).then(r => r.arrayBuffer()).then(b => new Uint16Array(b)), fetch(url(WEST_FRINGE.plan), fresh).then(r => r.json())]);
  const L = P.land, W = F.land, cell = L.cell, seam = F.joins.seam_x;
  const add = Math.round((L.x0 - W.x0) / cell);                           // columns added on the west
  const j0 = Math.round((W.z0 - L.z0) / cell);                            // the village's row of the fringe's first
  const iSeam = Math.round((seam - W.x0) / cell);                         // the fringe's column of the seam
  if (Math.abs(W.cell - cell) > 1e-9 || Math.abs(W.x0 + add * cell - L.x0) > 1e-6 || Math.abs(L.z0 + j0 * cell - W.z0) > 1e-3 || j0 + W.nz !== L.nz) throw new Error('[west-fringe] not on the village\'s grid');

  // ---- the land: the village's numbers as they are; west of the seam the fringe's, said in the village's scale
  const nx = L.nx + add, out = new Uint16Array(nx * L.nz);
  const asVillage = v => Math.max(0, Math.min(65535, Math.round((W.base + v / 65535 * W.range - L.base) / L.range * 65535)));
  const top = new Float64Array(add + 1);                                  // the fringe's first row, west of the village's first column (and at it)
  for (let i = 0; i <= add; i++) top[i] = asVillage(w16[i]);
  for (let j = 0; j < L.nz; j++) {
    out.set(raw.subarray(j * L.nx, (j + 1) * L.nx), j * nx + add);
    const jw = j - j0;
    if (jw >= 0) for (let i = 0; i < iSeam; i++) out[j * nx + i] = asVillage(w16[jw * W.nx + i]);
    else {                                                                // north of the fringe (high ground nobody walks on): the village's edge carried west, shaped as the fringe's north end is
      const edge = raw[j * L.nx];
      for (let i = 0; i < add; i++) out[j * nx + i] = Math.max(0, Math.min(65535, Math.round(edge + top[i] - top[add])));
    }
  }
  L.x0 = W.x0; L.nx = nx;
  L.more = [[W.play[0], seam + 3, W.play[2], W.play[3]]];                // (it laps 3 m over the village's part: no line between them she cannot cross)

  // ---- the plan
  const gone = (x, z) => x < seam - 0.5 && z > W.z0;                      // in the old margin the fringe replaces
  const road = (P.paths || []).find(p => p.id === 'road_in');
  if (road) road.points = road.points.filter(q => q[0] >= seam - 1e-6);
  for (const w of F.ways) P.paths.push({ id: 'wf_' + w.id, half: w.half, points: w.points.filter(q => q[0] > W.x0 + 0.5) });
  P.inflows = (P.inflows || []).filter(f => !gone(f.rows[0][0], f.rows[0][1]));
  for (const [k, v] of Object.entries(F.go)) P.views[k] = v;

  // ---- alive: the water back in its beds (the plan given the fringe's stretches and falls, the last reach's bed taken down
  // to the village brook's height: west-fringe-water.js), nothing dead, no bed dry
  if (alive) {
    const water = fringeWaterBack({ raw: out, land: L, plan: P, dry: F.dry_water, seam });
    for (const [k, name] of Object.entries(ALIVE_NAMES)) if (P.views[k]) P.views[k] = [...P.views[k].slice(0, 3), name];
    const map = new THREE.DataTexture(new Uint8Array(4), 1, 1); map.needsUpdate = true;      // (the beds' picture: no bed anywhere)
    return { raw: out, dryAt: () => 0, beds: { map, rect: [0, 0, 1, 1], levels: [0, 1] }, deadAt: () => 0, plan: F, water };
  }

  // ---- the land's dryness (the curse's picture: stylized-nature's setDryness): dead west of the seam, dying in the
  // village's last metres beside it, alive from there east. The trees die by it (anime-tree.js), and the grass and the
  // ground under it (stylized-grassfield.js, and the land's paint)
  // Its edge is no ruled line: it wanders a few metres either way as it runs south, and north of the fringe it swings
  // away west, so the village's own wooded margin up there (its pines: they do not die) is left alive. Past the land's
  // edges the picture's last row and column go on: the country west and south-west of the fringe is dead too
  const edgeX = z => seam - 15 - Math.max(0, W.z0 + 20 - z) * 1.2 + 5 * Math.sin(z * 0.045 + 1.3) + 3 * Math.sin(z * 0.11 + 0.4) - 4;
  const deadAt = (x, z) => { const e = edgeX(z); return ss(e + 20, e, x); };
  {
    const n = 128, data = new Uint8Array(n * n * 4), width = (nx - 1) * cell, depth = (L.nz - 1) * cell;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o = (j * n + i) * 4;
      data[o] = Math.round(255 * deadAt(L.x0 + (i + 0.5) / n * width, L.z0 + (j + 0.5) / n * depth)); data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, n, n); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    setDryness(tex, [L.x0, L.z0, width, depth]);
  }

  // ---- the dry water's bed: the gully and the brook (each a line with half its bed's width at every point, as the land
  // was worn: wide on a riffle, narrow in a pool) and the pond inside its shore. Worked out once, on a grid of half
  // metres over the box they lie in; dryAt reads that
  // Where a bed comes to the seam beside the village's own water (the brook: the village's brook goes on from there), the bed
  // is carried on into that water's first rows, so the two are one way: dry bed, then the brook (and under the curse, the
  // brook's own bed dry too: drought.js)
  const D = F.dry_water, beds = D.beds.map(b => b.points.slice()), shore = D.pond.shore;
  for (const pts of beds) {
    const [ex, ez, eh, el] = pts[pts.length - 1];
    let best = null, gap = 8;
    for (const rows of P.brooks || []) { const d = Math.hypot(rows[0][0] - ex, rows[0][1] - ez); if (d < gap) { gap = d; best = rows; } }
    if (best) for (const q of best.slice(0, 4)) pts.push([q[0], q[1], Math.max(eh, q[3] * 0.9), el]);
  }
  const box = [Infinity, -Infinity, Infinity, -Infinity];
  const grow = (x, z, r) => { box[0] = Math.min(box[0], x - r); box[1] = Math.max(box[1], x + r); box[2] = Math.min(box[2], z - r); box[3] = Math.max(box[3], z + r); };
  for (const pts of beds) for (const [x, z, half] of pts) grow(x, z, half + 2);
  for (const [x, z] of shore) grow(x, z, 2);
  const G = 0.5, gw = Math.ceil((box[1] - box[0]) / G) + 1, gh = Math.ceil((box[3] - box[2]) / G) + 1, grid = new Float32Array(gw * gh), level = new Float32Array(gw * gh);
  const inShore = (x, z) => {                                             // metres inside the pond's shore (+), outside it (-)
    let d = Infinity, inside = false;
    for (let k = 0, n = shore.length; k < n; k++) {
      const [ax, az] = shore[k], [bx, bz] = shore[(k + 1) % n], ex = bx - ax, ez = bz - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
      d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t));
      if ((az > z) !== (bz > z) && x < ax + (z - az) / (bz - az) * ex) inside = !inside;
    }
    return inside ? d : -d;
  };
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const x = box[0] + i * G, z = box[2] + j * G;
    let dry = Math.abs(x - D.pond.x) < D.pond.rx + 2 && Math.abs(z - D.pond.z) < D.pond.rz + 2 ? ss(-0.7, 0.7, inShore(x, z)) : 0, lev = D.pond.sill;
    for (const pts of beds) for (let k = 0; k < pts.length - 1 && dry < 1; k++) {
      const ax = pts[k][0], az = pts[k][1], bx = pts[k + 1][0] - ax, bz = pts[k + 1][1] - az;
      if (Math.abs(x - ax) > 8 || Math.abs(z - az) > 8) continue;
      const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1))), half = pts[k][2] + (pts[k + 1][2] - pts[k][2]) * t;
      const here = 1 - ss(half - 0.2, half + 0.9, Math.hypot(x - ax - bx * t, z - az - bz * t));
      if (here > dry) { dry = here; lev = pts[k][3] + (pts[k + 1][3] - pts[k][3]) * t; }
    }
    grid[j * gw + i] = dry; level[j * gw + i] = lev;
  }
  const dryAt = (x, z) => {
    if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) return 0;
    const u = (x - box[0]) / G, v = (z - box[2]) / G, i = Math.min(gw - 2, Math.floor(u)), j = Math.min(gh - 2, Math.floor(v)), fu = u - i, fv = v - j, o = j * gw + i;
    return (grid[o] * (1 - fu) + grid[o + 1] * fu) * (1 - fv) + (grid[o + gw] * (1 - fu) + grid[o + gw + 1] * fu) * fv;
  };
  // the same as a picture, for the land's paint (stylized-terrain.js, beds): red: how much a spot is a bed, green: the bed's
  // own level there (what lies under it is a pool, the pond's basin: darker mud). The paint reads it a pixel at a time
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < level.length; k++) { lo = Math.min(lo, level[k]); hi = Math.max(hi, level[k]); }
  const px = new Uint8Array(gw * gh * 4);
  for (let k = 0; k < gw * gh; k++) {
    px[k * 4] = Math.round(255 * grid[k]);
    px[k * 4 + 1] = Math.round(255 * (level[k] - lo) / (hi - lo || 1)); px[k * 4 + 3] = 255;
  }
  const map = new THREE.DataTexture(px, gw, gh); map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true;
  const bedsPaint = { map, rect: [box[0] - G / 2, box[2] - G / 2, 1 / (gw * G), 1 / (gh * G)], levels: [lo, hi - lo] };
  return { raw: out, dryAt, beds: bedsPaint, deadAt, plan: F, water: null };
}
