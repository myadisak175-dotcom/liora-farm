/* ==========================================================================
   west-fringe.js  —  the west fringe joined onto the hill village's land

     const west = await joinWestFringe({ raw, plan, url });      // as the level reads its land, before it makes anything from it
     west.raw            the land's numbers with the fringe's columns added on the west (plan.land says how wide it is now)
     west.dryAt(x, z)    0..1: how much a spot is the bed of the fringe's dry water (bare and sandy: no grass grows in it)

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
   so they are arranged by hand like any other plant. What is done here is to make them dead: dryness (anime-tree.js) takes
   the leaves off every tree west of the seam, and thins those just east of it.
   ========================================================================== */
import * as THREE from 'three';
import { setAnimeDryness } from './anime-tree.js';

export const WEST_FRINGE = { land: './assets/heightmaps/west-fringe.bin', plan: './assets/heightmaps/west-fringe.json' };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export async function joinWestFringe({ raw, plan: P, url }) {
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

  // ---- the trees' dryness: dead west of the seam, dying in the village's last metres beside it, alive from there east
  {
    const n = 128, data = new Uint8Array(n * 4), width = (nx - 1) * cell;
    for (let i = 0; i < n; i++) { data[i * 4] = Math.round(255 * ss(seam + 5, seam - 15, L.x0 + (i + 0.5) / n * width)); data[i * 4 + 3] = 255; }
    const tex = new THREE.DataTexture(data, n, 1); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    setAnimeDryness(tex, [L.x0, L.z0, width, (L.nz - 1) * cell]);
  }

  // ---- the dry water's bed: the gully, the pond's floor, the brook's reaches
  const D = F.dry_water, lines = [[D.gully, D.gully_half], ...D.reaches.map(r => [r.points, r.half])];
  const box = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [pts] of lines) for (const [x, z] of pts) { box[0] = Math.min(box[0], x - 4); box[1] = Math.max(box[1], x + 4); box[2] = Math.min(box[2], z - 4); box[3] = Math.max(box[3], z + 4); }
  box[2] = Math.min(box[2], D.pond.z - D.pond.rz - 2); box[3] = Math.max(box[3], D.pond.z + D.pond.rz + 2);
  const dryAt = (x, z) => {
    if (x < box[0] || x > box[1] || z < box[2] || z > box[3] || x > seam) return 0;
    let dry = 1 - ss(0.78, 0.98, Math.hypot((x - D.pond.x) / D.pond.rx, (z - D.pond.z) / D.pond.rz));
    for (const [pts, half] of lines) for (let i = 0; i < pts.length - 1 && dry < 1; i++) {
      const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1)));
      dry = Math.max(dry, 1 - ss(half - 0.2, half + 0.9, Math.hypot(x - ax - bx * t, z - az - bz * t)));
    }
    return dry * ss(seam, seam - 3, x);                                   // (at the seam the village's own brook takes over)
  };
  return { raw: out, dryAt, plan: F };
}
