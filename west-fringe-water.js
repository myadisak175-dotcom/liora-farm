/* ==========================================================================
   west-fringe-water.js  —  the west fringe's water come back (?green=1: the fringe as it will be when it is healed)

     const back = fringeWaterBack({ raw, land, plan, dry, seam });      // as the two lands are joined (west-fringe.js), before anything is made
     back.still       the stretches that are standing water, laid by flooding their hollow (the pond): for land-water.js
     back.outflows    the stretches that begin where another water at their own height ends (the pond, at the gully's end; the
                      brook, at the pond's): for land-water.js
     back.ponds       where the flooded water lies ([{ x0, x1, z0, z1, level }]): beside it the level paints its beach by how
                      high the ground stands over the water, since its line's widths are no shore

   One job: the fringe's dry water (its plan's dry_water: tools/make-west-fringe-heightmap.py) said as water, in the plan's
   own words (brooks, waters, falls), so the level lays it with what it lays every water with (land-water.js) and knows
   nothing more of it. The land was made for this ("so the water can come back one day and flow on"): every bed point says
   how high the water stood there, and half how wide it lay.

     the gully      a stream down from the west hills to the pond: a RUN (its rows at the heights the land gives them), level
                    over its last 33 m, where it stands at the pond's own height; a channel cut through the fan it left at
                    the pond's west end, so the two are one water
     the pond       full to its sill (5.6 m): its shore, its shallows and its islet are the land's (a still water: flooded)
     the brook      out over the sill by a run (5.6 down to 5.2, no step), level to the west scarp, a fall (1.3 m), level to
                    the east scarp, a fall (1.5 m), and on as part of the village's own brook
     the last reach was made 0.36 m higher than the village's brook it runs into (2.76 against 2.4), with a low ridge
                    between the two where the old margin ended. Two waters at two heights cannot be one: its bed is taken
                    down by that much here, as the land is read, and cut through the ridge, and its rows are put before
                    the village brook's own, at that brook's height (as the plan's inflows are: one stretch, one sheet)
   Nothing here is drawn, and the land's picture on disk is not changed: without ?green=1 none of this runs.
   ========================================================================== */
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const EDGE = 0.2;             // metres a water's half width is said over its bed's (its shore is the land's: found from the ground)
const HEAD = [0.15, 0.3, 0.5, 0.7, 0.85];      // the gully's first rows: this much of its bed's width
const FAN = { long: 7.5, half: 0.9, deep: 0.13, more: 0.09, bank: 1.4, over: 0.06 };      // the channel through the gully's fan: metres on from the bed's end, half its width, how deep at its edge and how much more in its middle; its banks come down over this many metres, to this much over the water
const BED = { deep: 0.12, more: 0.22, bank: 2.0, over: 0.2, ramp: 1.5 };      // the last reach's bed, cut: at least this deep at its edge, and this much more in its middle; its banks come down over this many metres, to this much over the water; the cut begins over this many metres below the fall

export function fringeWaterBack({ raw, land: L, plan: P, dry: D, seam }) {
  const { nx, nz, cell } = L;
  const yOf = v => L.base + v / 65535 * L.range, vOf = y => Math.max(0, Math.min(65535, Math.round((y - L.base) / L.range * 65535)));
  const gully = D.beds.find(b => b.id === 'gully').points, brook = D.beds.find(b => b.id === 'brook').points;      // [x, z, half, level]
  const sill = D.pond.sill, beds = D.reaches.map(r => r.bed), drops = D.falls;      // each level reach's height; where reach k ends in a fall

  // ---- the brook's points, reach by reach. The run down from the sill is the first reach's head; a point on a dry fall's
  // face (its height between two reaches') or already out over the fall is no reach's
  const reach = beds.map(() => []);
  for (const [x, z, half, lev] of brook) {
    let r = beds.findIndex(b => Math.abs(lev - b) < 0.005);
    if (r < 0 && lev > beds[0]) r = 0;
    if (r < 0 || (drops[r] && Math.hypot(x - drops[r][0], z - drops[r][1]) < 1.0)) continue;
    reach[r].push([x, z, lev, half + EDGE]);
  }
  const last = reach.length - 1;

  // ---- the last reach: into the village's brook, at that brook's height
  const end = brook[brook.length - 1];
  let join = -1, gap = 8;
  P.brooks.forEach((rows, k) => { const d = Math.hypot(rows[0][0] - end[0], rows[0][1] - end[1]); if (d < gap) { gap = d; join = k; } });
  if (join < 0) throw new Error('[west-fringe-water] the brook meets no water of the village');
  const head = P.brooks[join][0], level = head[2], down = beds[last] - level;
  {
    // its bed taken down, and cut: along its line from below the fall to the village brook's first row
    const line = [...reach[last].map(([x, z, , hw]) => [x, z, hw - EDGE]), [head[0], head[1], head[3]]];
    const xs = line.map(q => q[0]), zs = line.map(q => q[1]), pad = 6;
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - pad - L.x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) + pad - L.x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - pad - L.z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((Math.max(...zs) + pad - L.z0) / cell));
    const run = [0]; for (let q = 1; q < line.length; q++) run.push(run[q - 1] + Math.hypot(line[q][0] - line[q - 1][0], line[q][1] - line[q - 1][1]));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = L.x0 + i * cell, z = L.z0 + j * cell;
      let best = Infinity, bq = 0, bt = 0;
      for (let q = 0; q < line.length - 1; q++) {
        const ax = line[q][0], az = line[q][1], dx = line[q + 1][0] - ax, dz = line[q + 1][1] - az, t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d < best) { best = d; bq = q; bt = t; }
      }
      const half = line[bq][2] + (line[bq + 1][2] - line[bq][2]) * bt, along = run[bq] + (run[bq + 1] - run[bq]) * bt;
      if (best > half + BED.bank || along <= 0 || along >= run[run.length - 1]) continue;      // (not behind its first row: the fall's face is left as it is; not past the village brook's first: that bed is the village's)
      const o = j * nx + i, y0 = yOf(raw[o]);
      let y = y0;
      // its bed: down by what the reach stood over the village's brook (east of the seam the bed is the village's, made for
      // that brook's height already), and nowhere shallower than a bed is. Its banks: the land's own, which stood over the
      // water as it was to be and stand higher over it now, brought down to the water's edge over their first metres
      if (best < half) y = Math.min(y0 - down * ss(seam + 0.5, seam - 1.5, x), level - BED.deep - BED.more * (1 - (best / half) ** 2));
      else { const k = ss(0, 1, (best - half) / BED.bank); y = Math.min(y, (level + BED.over) * (1 - k) + y * k); }
      raw[o] = vOf(y0 + (y - y0) * ss(0, BED.ramp, along));
    }
  }
  P.brooks[join] = [...reach[last].map(([x, z, , hw]) => [x, z, level, hw + 0.3]), ...P.brooks[join]];      // (a little wider: the cut bed's edge lies a hand's breadth out)

  // ---- the gully: a run from the land's west edge to the pond, level with the pond where the land lays it level. Where it
  // comes onto the land, out in the margin's hills, it is a trickle that widens to its bed over its first rows (HEAD), not
  // a full stream beginning on a line
  const over = gully[gully.length - 1][3] - sill;                         // (its last metres were laid a few centimetres over the sill)
  const stream = gully.filter(q => q[0] > L.x0 + 1).map(([x, z, half, lev], k) => [x, z, Math.max(sill, lev - over), (half + EDGE) * (HEAD[k] ?? 1)]);
  // It came into the pond over a fan of what it carried, laid a hand's breadth over the sill: dry, with the pond full, and the
  // stream ending on it metres short of the water. The water that is back has worn its way through: a shallow channel from
  // the bed's end on into the pond, the way the pond lies
  {
    const e = stream[stream.length - 1], l = Math.hypot(D.pond.x - e[0], D.pond.z - e[1]), ux = (D.pond.x - e[0]) / l, uz = (D.pond.z - e[1]) / l;
    const i0 = Math.max(0, Math.floor((e[0] - 4 - L.x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((e[0] + FAN.long + 4 - L.x0) / cell));
    const j0 = Math.max(0, Math.floor((e[1] - FAN.long - 4 - L.z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((e[1] + FAN.long + 4 - L.z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = L.x0 + i * cell, z = L.z0 + j * cell, t = Math.min(FAN.long, Math.max(0, (x - e[0]) * ux + (z - e[1]) * uz)), d = Math.hypot(x - e[0] - ux * t, z - e[1] - uz * t);
      if (d > FAN.half + FAN.bank) continue;
      const o = j * nx + i, y = yOf(raw[o]), k = ss(0, 1, (d - FAN.half) / FAN.bank);
      raw[o] = vOf(Math.min(y, d < FAN.half ? sill - FAN.deep - FAN.more * (1 - (d / FAN.half) ** 2) : (sill + FAN.over) * (1 - k) + y * k));
    }
  }

  // ---- the pond: a line through it, west to east, from the gully's end to the notch in its rim. Its basin first: the land
  // under its sill joined to its middle, on the land's own grid, between those two ends (the islet stands out of it; the
  // fan and the rain's runnels that come down into it are part of it: looked for a finger's breadth over the sill and
  // corner to corner, so nothing the level's own ground would flood is left out). Then a row every 1.2 m: the middle of
  // the basin's two sides there (eased along the line, so it does not jump where a runnel comes in), and how far the
  // further side is. (The water itself is flooded from the ground by land-water.js: these rows say only where it may
  // lie, and, for the land's paint and her wading, how near its edge a spot is)
  const G = stream[stream.length - 1], [B0, B1] = reach[0], pond = [];
  {
    const ci = x => Math.round((x - L.x0) / cell), iA = ci(G[0]), iB = ci(B1[0]), span = new Map(), seen = new Set();
    const stack = [Math.round((D.pond.z - L.z0) / cell) * nx + ci(D.pond.x)];
    while (stack.length) {
      const o = stack.pop(), i = o % nx, j = (o - i) / nx;
      if (seen.has(o) || i < iA || i > iB || j < 0 || j >= nz || yOf(raw[o]) >= sill + 0.02) continue;
      seen.add(o);
      const q = span.get(i); if (q) { q[0] = Math.min(q[0], j); q[1] = Math.max(q[1], j); } else span.set(i, [j, j]);
      stack.push(o + 1, o - 1, o + nx, o - nx, o + nx + 1, o + nx - 1, o - nx + 1, o - nx - 1);
    }
    const sides = x => {                                                   // the basin's two sides at x (z), or null
      let lo = Infinity, hi = -Infinity;
      for (let i = ci(x) - 1; i <= ci(x) + 1; i++) { const q = span.get(i); if (q) { lo = Math.min(lo, q[0]); hi = Math.max(hi, q[1]); } }
      return lo <= hi ? [L.z0 + lo * cell, L.z0 + hi * cell] : null;
    };
    const cuts = [];                                                       // [x, its two sides]
    for (let x = G[0]; x < B0[0] - 1.0; x += 1.2) { const q = sides(x); if (q) cuts.push([x, q]); }
    if (cuts.length < 8) throw new Error('[west-fringe-water] the pond holds no water');
    cuts.forEach(([x, q], k) => {
      let z = 0, n = 0;
      for (let m = Math.max(0, k - 3); m <= Math.min(cuts.length - 1, k + 3); m++) { z += (cuts[m][1][0] + cuts[m][1][1]) / 2; n++; }
      z /= n;
      pond.push([x, z, sill, Math.max(z - q[0], q[1] - z) + 0.6]);
    });
    const q = sides(B0[0]);                                                // (the notch's mouth is a funnel: wider than the bed that leaves it)
    pond.push([B0[0], B0[1], sill, Math.max(B0[3], q ? Math.max(B0[1] - q[0], q[1] - B0[1]) + 0.6 : 0)], [B1[0], B1[1], sill, B1[3]]);
    // land-water.js asks the spot of the line NEAREST a place how wide the water is there, and at the pond's blunt ends that
    // spot can lie on a row narrower than the place needs: so every place of the basin is looked at, and the two rows
    // either side of its nearest spot are made to reach it
    const tA = (() => { const l = Math.hypot(pond[1][0] - pond[0][0], pond[1][1] - pond[0][1]) || 1; return [(pond[1][0] - pond[0][0]) / l, (pond[1][1] - pond[0][1]) / l]; })();
    for (const o of seen) {
      const i = o % nx, x = L.x0 + i * cell, z = L.z0 + (o - i) / nx * cell;
      if ((x - pond[0][0]) * tA[0] + (z - pond[0][1]) * tA[1] < 0) continue;      // (behind its first row: the gully's)
      let best = Infinity, bq = 0, bt = 0;
      for (let k = 0; k < pond.length - 1; k++) {
        const ax = pond[k][0], az = pond[k][1], dx = pond[k + 1][0] - ax, dz = pond[k + 1][1] - az, t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d < best) { best = d; bq = k; bt = t; }
      }
      if (pond[bq][3] + (pond[bq + 1][3] - pond[bq][3]) * bt >= best + 0.1) continue;
      if (bt < 1) pond[bq][3] = Math.max(pond[bq][3], best + 0.1);
      if (bt > 0) pond[bq + 1][3] = Math.max(pond[bq + 1][3], best + 0.1);
    }
  }

  // ---- into the plan: four stretches, two falls
  const at = P.brooks.length, kPond = at + 1, kOut = at + 2;
  P.brooks.push(stream, pond, reach[0].slice(1), ...reach.slice(1, last));      // (the outflow begins on the pond's last row)
  P.waters.push({ id: 'wf_gully', level: sill }, { id: 'wf_pond', level: sill }, ...beds.slice(0, last).map((b, r) => ({ id: 'wf_brook_' + (r + 1), level: b })));
  for (let r = 0; r < last; r++) {
    const a = reach[r][reach[r].length - 1], b = reach[r + 1][0];
    P.falls.push({ x: drops[r][0], z: drops[r][1], top: beds[r], bottom: r + 1 < last ? beds[r + 1] : level, width: +(2 * (a[3] - EDGE)).toFixed(2), yaw: +Math.atan2(b[0] - a[0], b[1] - a[1]).toFixed(3), deep: 0, from: kOut + r, out: 0.8 });
  }
  console.info('[west-fringe-water] back:', stream.length, 'rows of gully,', pond.length, 'of pond,', reach.map(r => r.length).join(' + '), 'of brook; the last reach', down.toFixed(2), 'm down, into stretch', join);
  // (the pond begins where the gully ends, at its own height; the brook where the pond ends. ponds: the box each flooded
  // water's line lies in, with its widths, and its level)
  const box = pond.reduce((q, [x, z, , hw]) => [Math.min(q[0], x - hw - 2), Math.max(q[1], x + hw + 2), Math.min(q[2], z - hw - 2), Math.max(q[3], z + hw + 2)], [Infinity, -Infinity, Infinity, -Infinity]);
  return { still: [kPond], outflows: [kPond, kOut], joined: join, ponds: [{ x0: box[0], x1: box[1], z0: box[2], z1: box[3], level: sill }] };
}
