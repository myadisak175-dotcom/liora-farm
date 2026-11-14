// land-water.js  —  a level's water, laid on its land
//
// One job: to put a level's water where the land itself can hold it, and nowhere else. A level says only where each stretch
// of water runs and how high it stands (rows along its line: x, z, level, half-width); everything seen is then worked out
// from the ground as it is drawn (heightAt), so the water, the falls and the foam cannot disagree with the land or with each
// other:
//
//   the surface   a sheet at the stretch's height, cut out to its real shore: out from the stretch's line it goes as far as the
//                 ground first comes up through it (the bank) and no further, even if the ground dips again beyond; and never
//                 over air: where the ground under it has dropped away (past a cliff's edge) the sheet stops at that edge
//   the lip       where a stretch runs off an edge, the edge is found lane by lane across the water: each lane is walked
//                 downstream until the ground falls away. The points found are the lip
//   the fall      hangs from that very line (stylized-waterfall.js, lip), so sheet and fall are one water with no gap, and
//                 lands on whatever water lies below it there: its foam, spray and mist are put at that spot, at that height.
//                 A stretch the level names in `deep` ends over a pit instead: its fall is made by the level's own deepFall
//                 (a long one into the mist), from the lip found here. A stretch the level names in `split` has rocks standing
//                 in its lip: there the water goes over in strands, one fall hung from each run of the lip the water
//                 reaches, and the sheet lies round the rocks (they stand up through it) instead of ending at the first
//                 of them
//   the check     report: anything still hanging over air, a stretch that ends at a drop with no lip, a fall whose foot is not
//                 on water, fewer or more falls than the level expected; and, to know of, how many metres of the sheet's edge
//                 stand open over a side drop (open) or stop short of a shore (short: the basin is wider than the stretch
//                 was said to be). A level prints it; a map is not right until it is clean
//
//   const lookup = waterLookup(stretches, { x0, z0, x1, z1 });        // lookup.at(x, z): the water there ({ d: metres past its edge, level }) or null
//   const water = createLandWater({ stretches, heightAt, lookup, material, foamTexture, cells, expect, deep, deepFall, split });
//   scene.add(water.group);      every frame: water.update(renderer, frustum, cameraPosition)
//   water.surfaces (to hide while the water's own pictures are taken), water.small (the spray, billows and mist at the falls' feet:
//   left out of the mirror picture too), water.stretches (level, sphere, near(point)), water.report
//
// (Before this each level laid a strip or a sheet from the line alone, ended it on a straight line, and stood a ready-made
// fall at a spot given in numbers: where a cliff's edge was not square to the stream the sheet hung out over it, the fall
// stood apart from it, and the foam was somewhere else.)

import * as THREE from 'three';
import { createWaterfall } from './stylized-waterfall.js';

const PAST = 0.6;             // ground this far under a stretch's deepest bed is past an edge: no water there
const LANE = 0.4;             // metres between the lanes a lip is looked for in
const UP = 8, DOWN = 5;       // each lane is walked from UP metres above the stretch's end to DOWN below it

// for every half metre of the land: how far the nearest water's edge is, and how high that water stands
export function waterLookup(stretches, { x0, z0, x1, z1 }, step = 0.5) {
  const nx = Math.round((x1 - x0) / step) + 1, nz = Math.round((z1 - z0) / step) + 1, edge = new Float32Array(nx * nz).fill(99), level = new Float32Array(nx * nz);
  for (const rows of stretches) for (const [bx, bz, lv, hw] of rows) {
    const reach = hw + 4, i0 = Math.max(0, Math.floor((bx - reach - x0) / step)), i1 = Math.min(nx - 1, Math.ceil((bx + reach - x0) / step));
    for (let j = Math.max(0, Math.floor((bz - reach - z0) / step)); j <= Math.min(nz - 1, Math.ceil((bz + reach - z0) / step)); j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(x0 + i * step - bx, z0 + j * step - bz) - hw, o = j * nx + i;
      if (d < edge[o]) { edge[o] = d; level[o] = lv; }
    }
  }
  return {
    at(x, z) {
      const fx = Math.min(nx - 1.001, Math.max(0, (x - x0) / step)), fz = Math.min(nz - 1.001, Math.max(0, (z - z0) / step)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * nx + i;
      const d = (edge[o] * (1 - u) + edge[o + 1] * u) * (1 - v) + (edge[o + nx] * (1 - u) + edge[o + nx + 1] * u) * v;
      return d < 1.6 ? { d, level: level[Math.round(fz) * nx + Math.round(fx)] } : null;      // (the level is never blended: two waters lie metres apart in height)
    },
  };
}

export function createLandWater({ stretches, heightAt: H, lookup, material, foamTexture = null, cells = null, expect = null, deep = [], deepFall = null, split = [] }) {
  const group = new THREE.Group(); group.name = 'landWater';
  const surfaces = [], falls = [], info = [], owned = [], small = [];
  const report = { falls: [], hanging: 0, open: 0, short: 0, where: [], noLip: [], ok: true };      // (where: which stretches the open and short edges are on)

  for (const [k, rows] of stretches.entries()) {
    const n = rows.length, lv = rows[0][2], F = [0], tan = [];
    for (let i = 1; i < n; i++) F.push(F[i - 1] + Math.hypot(rows[i][0] - rows[i - 1][0], rows[i][1] - rows[i - 1][1]));
    for (let i = 0; i < n; i++) { const a = rows[Math.max(0, i - 1)], b = rows[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; tan.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l]); }
    // how deep its bed is (nine rows in ten are no deeper), and so how low the ground must be to count as past an edge
    const depths = rows.map(r => lv - H(r[0], r[1])).sort((a, b) => a - b), bed = Math.max(0.3, depths[Math.floor(depths.length * 0.9)]), past = lv - bed - PAST;
    const A = rows[0], B = rows[n - 1], tA = tan[0], tB = tan[n - 1], nB = [-tB[1], tB[0]];

    // ---- the lip: lane by lane across its end, how far down the lane the ground holds (lim), and whether water reaches it there
    const lanes = [];
    for (let u = -(B[3] + 0.5); u <= B[3] + 0.5 + 1e-6; u += LANE) {
      let lim = Infinity;
      for (let s = -UP; s <= DOWN; s += 0.1) if (H(B[0] + nB[0] * u + tB[0] * s, B[1] + nB[1] * u + tB[1] * s) < past) { lim = s - 0.3; break; }      // (a step back from where it falls away: the sheet ends on the sill, not over the cliff's face)
      if (lim <= -UP + 0.05) lim = Infinity;                               // (air all the way up this lane: not an edge across the water's end; the sheet is drawn in from the side instead)
      const wet = lim < Infinity && H(B[0] + nB[0] * u + tB[0] * (lim - 0.1), B[1] + nB[1] * u + tB[1] * (lim - 0.1)) < lv + 0.02;
      lanes.push({ u, lim, wet });
    }
    // the lip: the run of lanes water reaches the edge in, about the middle (and, where rocks part the water, every other
    // such run: lips)
    let lip = null; const parted = split.includes(k), lips = [];
    {
      let mid = -1, bestU = Infinity;
      lanes.forEach((l, i) => { if (l.wet && Math.abs(l.u) < bestU) { bestU = Math.abs(l.u); mid = i; } });
      if (mid >= 0) {
        let a = mid, b = mid;
        while (a > 0 && lanes[a - 1].wet) a--;
        while (b < lanes.length - 1 && lanes[b + 1].wet) b++;
        if ((b - a) * LANE >= 0.8) {
          const lim = lanes.map(l => l.lim);
          for (let i = a; i <= b; i++) lanes[i].lim = (lim[Math.max(a, i - 1)] + lim[i] * 2 + lim[Math.min(b, i + 1)]) / 4;      // (its line eased: the ground is a grid of half metres)
          lip = { a, b }; lips.push(lip);
          if (parted) for (let i = 0; i < lanes.length; i++) {             // the other strands: each run of wet lanes either side of the rocks
            if (!lanes[i].wet || (i >= a && i <= b)) continue;
            let j = i; while (j < lanes.length - 1 && lanes[j + 1].wet) j++;
            if ((j - i) * LANE >= 0.8) { for (let q = i; q <= j; q++) lanes[q].lim = (lim[Math.max(i, q - 1)] + lim[q] * 2 + lim[Math.min(j, q + 1)]) / 4; lips.push({ a: i, b: j }); }
            i = j;
          }
          lips.sort((p, q) => p.a - q.a);
        }
      }
      const drop = lanes.some(l => l.lim < Infinity);
      if (!lip && (deep.includes(k) || (drop && lookup.at(B[0] + tB[0] * 4, B[1] + tB[1] * 4)))) report.noLip.push(k);      // (it should fall here: into the deep, or onto the water just ahead)
      if (!drop) for (const l of lanes) l.lim = 0;                         // no edge here (the water runs out of the map, or into more water): it ends on a line across its last row
      else for (const l of lanes) if (l.lim === Infinity) l.lim = 0.6;
    }
    const limitAt = u => { const f = Math.min(lanes.length - 1, Math.max(0, (u - lanes[0].u) / LANE)), i = Math.min(lanes.length - 2, Math.floor(f)); return lanes[i].lim + (lanes[i + 1].lim - lanes[i].lim) * (f - i); };

    // ---- the surface: a grid over the stretch; each point: the nearest spot on the stretch's line, and whether water lies there
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, wide = 0;
    for (const [x, z, , hw] of rows) { x0 = Math.min(x0, x - hw - 1.5); x1 = Math.max(x1, x + hw + 1.5); z0 = Math.min(z0, z - hw - 1.5); z1 = Math.max(z1, z + hw + 1.5); wide = Math.max(wide, hw); }
    const cs = wide > 6 ? 1.0 : wide > 3 ? 0.7 : 0.5, gx = Math.ceil((x1 - x0) / cs) + 1, gz = Math.ceil((z1 - z0) / cs) + 1;
    const pts = new Array(gx * gz);
    for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) {
      let x = x0 + i * cs, z = z0 + j * cs, best = Infinity, bk = 0, bt = 0, snap = 0;
      for (let q = 0; q < n - 1; q++) {
        const ax = rows[q][0], az = rows[q][1], dx = rows[q + 1][0] - ax, dz = rows[q + 1][1] - az, t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d < best) { best = d; bk = q; bt = t; }
      }
      const a = rows[bk], b = rows[bk + 1], qx = a[0] + (b[0] - a[0]) * bt, qz = a[1] + (b[1] - a[1]) * bt, hw = a[3] + (b[3] - a[3]) * bt + 0.5;
      let tx = tan[bk][0] + (tan[bk + 1][0] - tan[bk][0]) * bt, tz = tan[bk][1] + (tan[bk + 1][1] - tan[bk][1]) * bt; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const before = bk === 0 ? (x - A[0]) * tA[0] + (z - A[1]) * tA[1] : 1;      // (metres short of its first row)
      const al = (x - B[0]) * tB[0] + (z - B[1]) * tB[1], la = (x - B[0]) * nB[0] + (z - B[1]) * nB[1];      // along and across, from the middle of its end
      const atEnd = bk >= n - 12 && al > -UP && Math.abs(la) <= B[3] + 0.5 + LANE, lim = atEnd ? limitAt(la) : Infinity;
      let inside = best <= hw && before >= 0 && al <= lim;
      // behind its first row (under the fall that feeds it) the water lies on as far as the cliff's foot
      if (!inside && before < 0 && before > -3.5 && Math.abs((x - A[0]) * -tA[1] + (z - A[1]) * tA[0]) <= A[3] + 0.5 && H(x, z) < lv - 0.03) inside = true;
      if (!inside && !(before < 0 && H(x, z) >= lv - 0.03)) {               // not water: drawn in to the water's outline (unless it lies inside the cliff behind the fall, where it is never seen)
        if (al > lim) { x = B[0] + nB[0] * la + tB[0] * lim; z = B[1] + nB[1] * la + tB[1] * lim; snap = 1; }      // past the edge: back onto the edge, in its own lane
        else if (before < 0) {                                              // short of its first row: onto the line across that row, no wider than the water is there
          x -= before * tA[0]; z -= before * tA[1];
          const lat = (x - A[0]) * -tA[1] + (z - A[1]) * tA[0], w = A[3] + 0.5;
          if (Math.abs(lat) > w) { x = A[0] - tA[1] * Math.sign(lat) * w; z = A[1] + tA[0] * Math.sign(lat) * w; }
          snap = 1;
        }
      }
      if (snap === 0 && before >= 0 && best > 0.2) {
        // out from the stretch's line toward this point: where does the water stop? At the first bank (the ground comes up
        // through it), or at a side edge (the ground falls away). A point beyond that is not water: it is drawn in to there
        const dx = (x - qx) / best, dz = (z - qz) / best, reach = Math.min(best, hw);
        let stop = -1;
        for (let r = 0.15; r <= reach + 1e-6; r += 0.15) {
          const g = H(qx + dx * r, qz + dz * r);
          if (g >= lv - 0.02) {
            // a rock standing in a parted lip is not the shore: if there is water again past it, on the way to this point,
            // the sheet goes on round it (the rock itself stands up through the sheet)
            if (parted && atEnd) { let r2 = r + 0.15; while (r2 <= reach + 1e-6 && H(qx + dx * r2, qz + dz * r2) >= lv - 0.05) r2 += 0.15; if (r2 <= reach + 1e-6) { r = r2; continue; } }
            stop = r + 0.12; snap = 3; break;                                // the shore (and a hand's breadth into the bank, where its edge is hidden)
          }
          if (g < past) { stop = r - 0.05; snap = 2; break; }                // a side edge over air
        }
        if (stop < 0 && best > hw) { stop = hw; snap = 4; }                 // no shore within its width: it stops where the stretch was said to
        if (stop >= 0 && stop < best) { x = qx + dx * stop; z = qz + dz * stop; inside = false; } else snap = 0;
      }
      pts[j * gx + i] = { x, z, inside, snap, F: F[bk] + (F[bk + 1] - F[bk]) * bt, lat: (x - qx) * -tz + (z - qz) * tx, tx, tz, at: -1 };
    }
    const pos = [], flow = [], dir = [], idx = [], was = [report.open, report.short];
    const use = p => {
      if (p.at < 0) {
        p.at = pos.length / 3; pos.push(p.x, lv, p.z); flow.push(p.F, p.lat, 1); dir.push(p.tx, p.tz);
        if (p.snap === 2) report.open += cs;
        else if (p.snap === 4) report.short += cs;
        else if (p.snap === 0 && H(p.x, p.z) < past - 0.6) report.hanging++;      // (the check: a point of the sheet with nothing under it)
      }
      return p.at;
    };
    for (let j = 0; j < gz - 1; j++) for (let i = 0; i < gx - 1; i++) {
      const a = pts[j * gx + i], b = pts[(j + 1) * gx + i], c = pts[j * gx + i + 1], d = pts[(j + 1) * gx + i + 1];
      if (a.inside || b.inside || c.inside || d.inside) idx.push(use(a), use(b), use(c), use(b), use(d), use(c));
    }
    if (report.open > was[0] || report.short > was[1]) report.where.push({ stretch: k, open: +(report.open - was[0]).toFixed(1), short: +(report.short - was[1]).toFixed(1) });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3)); g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, material); m.renderOrder = 1; m.name = 'water';
    group.add(m); surfaces.push(m); owned.push(g);
    const box = new THREE.Box3(); for (const q of rows) box.expandByPoint(new THREE.Vector3(q[0], q[2], q[1]));
    info.push({ level: lv, sphere: box.getBoundingSphere(new THREE.Sphere()), near: c => { let d = Infinity; for (let i = 0; i < n; i += 2) d = Math.min(d, Math.hypot(c.x - rows[i][0], c.y - lv, c.z - rows[i][1]) - rows[i][3]); return d; } });

    // ---- the fall: hung from the lip, landing on the water below (a parted lip: one from each of its runs, told of as one fall)
    let told = null;
    for (const lip of lips) {
      const line = [];
      for (let i = lip.a; i <= lip.b; i++) line.push([B[0] + nB[0] * lanes[i].u + tB[0] * lanes[i].lim, B[1] + nB[1] * lanes[i].u + tB[1] * lanes[i].lim]);
      const p0 = line[0], p1 = line[line.length - 1], O = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      let ox = -(p1[1] - p0[1]), oz = p1[0] - p0[0]; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;      // out from the lip: square to it, the way the water runs
      if (ox * tB[0] + oz * tB[1] < 0) { ox = -ox; oz = -oz; }
      const yaw = Math.atan2(ox, oz), c = Math.cos(yaw), s = Math.sin(yaw);
      const local = line.map(([x, z]) => [(x - O[0]) * c - (z - O[1]) * s, (x - O[0]) * s + (z - O[1]) * c]).sort((p, q) => p[0] - q[0]);
      let width = 0; for (let i = 1; i < local.length; i++) width += Math.hypot(local[i][0] - local[i - 1][0], local[i][1] - local[i - 1][1]);
      if (deep.includes(k)) {                                              // over a pit: the level's own long fall, from the middle of the lip
        if (deepFall) { const far = deepFall({ x: O[0], z: O[1], top: lv, width, yaw }); group.add(far.group); falls.push({ fall: far, deep: true, ball: new THREE.Sphere(new THREE.Vector3(O[0], lv - 20, O[1]), 26 + width) }); }
        report.falls.push({ from: k, x: +O[0].toFixed(1), z: +O[1].toFixed(1), top: lv, width: +width.toFixed(1), deep: true });
        continue;
      }
      // the water below: where the fall will land, or a little further out
      let low = null, guess = stretches[k + 1] ? stretches[k + 1][0][2] : lv - 6;
      for (let out = 1.0; out <= 9 && low === null; out += 0.5) { const w = lookup.at(O[0] + ox * out, O[1] + oz * out); if (w && w.level < lv - 0.5 && w.d < 0) low = w.level; }
      const bottom = low === null ? guess : low, forward = Math.min(2.2, 0.6 + (lv - bottom) * 0.12), foot = [O[0] + ox * (forward + 0.35), O[1] + oz * (forward + 0.35)];
      const under = lookup.at(foot[0], foot[1]), onWater = !!under && Math.abs(under.level - bottom) < 0.05 && H(foot[0], foot[1]) < bottom;
      // how wide the water it lands on is there: the foam at its foot reaches no further than that water's edge
      let lowHalf = width * 1.5, nearRow = Infinity;
      for (const rows2 of stretches) if (Math.abs(rows2[0][2] - bottom) < 0.05) for (const q of rows2) { const d = Math.hypot(q[0] - foot[0], q[1] - foot[1]); if (d < nearRow) { nearRow = d; lowHalf = q[3]; } }
      const fall = createWaterfall({ x: 0, z: 0, lip: local, top: lv, bottom: bottom - 0.21, forward, churn: Math.min(width * 1.5, Math.max(1.4, lowHalf * 0.95)),      // (its sheet of foam lies 0.27 m over the bottom it is given: just on the water)
        scale: Math.min(1, Math.max(0.6, width / 9)), foamTexture, cells });
      fall.group.position.set(O[0], 0, O[1]); fall.group.rotation.y = yaw;
      fall.group.userData = { kind: 'waterfall' };
      group.add(fall.group);
      // a low fall (one step of a cascade) raises no mist, and from far off is drawn without its veil; the small things at any
      // fall's foot (spray, flecks, billows, splash cones, bubbles, mist) are too small to see from far off
      const step = lv - bottom < 5.5, parts = fall.group.children;
      if (step) for (const o of parts) if (o.isSprite) o.visible = false;
      const spray = parts.filter(o => o.isPoints || o.name === 'waterfallBillows' || o.name === 'waterfallCones' || (o.isSprite && !step));
      falls.push({ fall, foot, spray, veil: step ? parts[1] : null, ball: new THREE.Sphere(new THREE.Vector3(O[0], (lv + bottom) / 2, O[1]), (lv - bottom) / 2 + width + 3) });
      small.push(...spray);
      if (told) { told.strands = (told.strands || 1) + 1; told.width = +(told.width + width).toFixed(1); told.onWater = told.onWater && onWater; }
      else report.falls.push(told = { from: k, x: +O[0].toFixed(1), z: +O[1].toFixed(1), top: lv, bottom, width: +width.toFixed(1), onWater });
    }
  }
  report.open = +report.open.toFixed(1); report.short = +report.short.toFixed(1);
  report.ok = report.hanging === 0 && report.noLip.length === 0 && report.falls.every(f => f.deep || f.onWater) && (expect === null || report.falls.length === expect);
  (report.ok ? console.info : console.warn)('[land-water]', report.ok ? 'clean' : 'NOT CLEAN', JSON.stringify(report));

  return {
    group, surfaces, falls, stretches: info, report,
    small,                    // the small things at the falls' feet: a level leaves them out of the water's mirror picture
    // every frame: a fall out of view (or far away) is not drawn, and one more than 60 m off is drawn without its spray, mist
    // and billows (too small to see from there); a low one without its veil too
    update(renderer, frustum = null, cam = null) {
      for (const f of falls) {
        const far = cam ? f.ball.distanceToPoint(cam) : 0;
        f.fall.group.visible = !frustum || (frustum.intersectsSphere(f.ball) && far < 170);
        if (!f.fall.group.visible || f.deep) continue;
        for (const o of f.spray) o.visible = far < 60;
        if (f.veil) f.veil.visible = far < 60;
        f.fall.update(renderer);
      }
    },
    dispose() { for (const g of owned) g.dispose(); for (const f of falls) f.fall.dispose(); },
  };
}
