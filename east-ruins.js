/* ==========================================================================
   east-ruins.js  —  the east lake and its ruins joined onto the hill village's land (in the game since 28 Nov 2026; ?east=0:
   the land without it)

     const east = await joinEastRuins({ raw, plan, url });      // as the level reads its land, after the west fringe (west-fringe.js)
     east.raw            the land's numbers with the east land's columns put in past the seam (plan.land says how wide it is now)
     east.seam           x of the seam (80): east of it the land is the east land's
     east.gone(x, z)     a plant of the map's own foliage that stood in the village's old east margin, which this land replaces:
                         not grown (the map's lists themselves are not touched, so the foliage editor's rows stay the map's)
     east.plants         the east land's own plants, as rows of the plan ({ plants, cover }): the level grows them with the rest
     east.water          { still, outflows, ponds }: which of the plan's stretches is the lake (standing water: flooded, its shore
                         its hollow's own), which begins at the lake's end (the village's east brook, at the lake's height), and
                         where the lake lies (the level's banks: its beach goes by how high the ground stands over the water)

   One job: make the two lands one as they are read. The east land (assets/heightmaps/east-ruins.bin + .json, written by
   tools/make-east-ruins-heightmap.py) is a lake past the village's east edge, cliffs and ledges of rock round it, four
   streams going over into it from four heights (one out of a gorge, three from springs on the ledges and the shelf), ruins'
   floors on the shelf over it, a temple's bluff over its south end. It lies on the
   village's own grid and IS the village's land up to the seam (x = 80), so nothing is fitted here: its columns east of the
   seam are put in in place of the village's old east margin (wooded hills nobody walked on), and run on past it to x = 200.

   The plan is changed too, so the level builds the east land with what it already has and knows nothing more of it:
     land      wider (nx), and land.more: another part she may walk in
     paths     the east land's ways are added (painted and trodden like any other)
     water     a stretch more for each stream and one for the lake, a fall for each stream (into the lake), and the
               village's east brook now begins at the lake's end: the outflow's rows go before its own. The brook came in
               through the old margin's hill (an inflow): it comes from the lake now, so that inflow is taken out
     views     the east land's places (teleport-menu.js lists them)
   Its plants are not added to the plan: they are handed over as rows for the level to grow (east.plants), and the
   village's plants that stood in the old margin are not grown (east.gone). When the east land goes into the game for good,
   its plants go into the map's own foliage, as the west fringe's did.
   ========================================================================== */

export const EAST_RUINS = { land: './assets/heightmaps/east-ruins.bin', plan: './assets/heightmaps/east-ruins.json' };

export async function joinEastRuins({ raw, plan: P, url }) {
  const fresh = { cache: 'no-cache' };
  const [e16, F] = await Promise.all([fetch(url(EAST_RUINS.land), fresh).then(r => r.arrayBuffer()).then(b => new Uint16Array(b)), fetch(url(EAST_RUINS.plan), fresh).then(r => r.json())]);
  const L = P.land, E = F.land, cell = L.cell, seam = F.joins.seam_x;
  const iSeam = Math.round((seam - L.x0) / cell);                         // the land's column of the seam
  const eSeam = Math.round((seam - E.x0) / cell);                         // the east land's
  if (Math.abs(E.cell - cell) > 1e-9 || Math.abs(L.x0 + iSeam * cell - seam) > 1e-6 || Math.abs(E.x0 + eSeam * cell - seam) > 1e-6 || Math.abs(E.z0 - L.z0) > 1e-3 || E.nz !== L.nz) throw new Error('[east-ruins] not on the village\'s grid');

  // ---- the land: the village's numbers to the seam; past it the east land's, said in the village's scale
  const add = E.nx - eSeam - 1, nx = iSeam + 1 + add, out = new Uint16Array(nx * L.nz);
  const asVillage = v => Math.max(0, Math.min(65535, Math.round((E.base + v / 65535 * E.range - L.base) / L.range * 65535)));
  for (let j = 0; j < L.nz; j++) {
    out.set(raw.subarray(j * L.nx, j * L.nx + iSeam + 1), j * nx);
    for (let i = 0; i < add; i++) out[j * nx + iSeam + 1 + i] = asVillage(e16[j * E.nx + eSeam + 1 + i]);
  }
  L.nx = nx;
  L.more = [...(L.more || []), [seam - 3, E.play[1], E.play[2], E.play[3]]];      // (it laps 3 m over the village's part: no line between them she cannot cross)

  // ---- the plan: its ways, its places
  for (const w of F.ways) P.paths.push({ id: 'ea_' + w.id, half: w.half, points: w.points });
  for (const [k, v] of Object.entries(F.go)) P.views[k] = v;

  // ---- the water: the streams and their falls, the lake, and the village's east brook beginning at the lake's end
  const W = F.water, ids = (P.waters || []).map(w => w.id), kBrook = ids.indexOf(W.outflow.into);
  if (kBrook < 0) throw new Error('[east-ruins] the village has no ' + W.outflow.into);
  P.inflows = (P.inflows || []).filter(f => !(f.stretch === kBrook && f.rows[0][0] > seam));      // (it came in through the old margin's hill)
  const streams = W.streams || [W.stream], falls = W.falls || [{ ...W.fall, stream: 0 }];      // (an east land made before it had four falls: one)
  const k0 = P.brooks.length, kLake = k0 + streams.length;
  for (const s of streams) { P.brooks.push(s.rows); P.waters.push({ id: s.id, level: s.level }); }
  P.brooks.push(W.lake.rows); P.waters.push({ id: W.lake.id, level: W.lake.level });
  for (const { stream, ...f } of falls) P.falls.push({ ...f, from: k0 + stream });
  const level = P.brooks[kBrook][0][2];
  P.brooks[kBrook] = [...W.outflow.rows.map(([x, z, , hw]) => [x, z, level, hw]), ...P.brooks[kBrook]];
  // (where the lake's line lies, with its widths: its rows say only where it MAY lie, wider than it is, so beside it the level
  // paints the beach by how high the ground stands over the water there, and not by being inside those widths)
  const [x0, x1, z0, z1] = W.lake.rows.reduce((q, [x, z, , hw]) => [Math.min(q[0], x - hw - 2), Math.max(q[1], x + hw + 2), Math.min(q[2], z - hw - 2), Math.max(q[3], z + hw + 2)], [Infinity, -Infinity, Infinity, -Infinity]);
  console.info('[east-ruins] joined:', add, 'columns past the seam; the lake', W.lake.rows.length, 'rows,', streams.length, 'streams', streams.map(s => s.rows.length).join('/'), 'rows, the brook from the lake', W.outflow.rows.length, 'rows more');

  return {
    raw: out, seam, plan: F,
    gone: (x, z) => x > seam,
    plants: { plants: F.plants || [], cover: F.cover || [] },
    water: { still: [kLake], outflows: [kBrook], ponds: [{ x0, x1, z0, z1, level: W.lake.level }] },
  };
}
