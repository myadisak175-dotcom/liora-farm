/* ==========================================================================
   drought.js  —  the hill village under the curse: how low its water stands, where the pools are left, how dead its land is

     const { lower, report } = droughtWater({ stretches, heightAt, names });   // metres each stretch stands under its plan
     const pools = droughtPools(water.surfaces, heightAt);                     // the water left: [{ x, z, y, area, deepest, tris }]
     const dead = cursedLand({ plan, rect, west });     // dead.at(x, z): 0 alive .. 1 dead; the picture is set (setDryness)

   One job: the land as the curse has left it, worked out as the level is read (?curse=1 asks for it; nothing is baked, so
   the same plan can be brought back to life a stretch and a place at a time: a fall at a time, the game's quests to come).

   The water. No fall runs: every stretch stands below the lowest point of its lip, so it goes over nowhere, and what is left
   of it lies in pools in the deepest parts of its bed (a pool under each old fall, where the water dug deepest; pools along
   the streams and the rivers' deep reaches; the rest dry). How low at least, by the kind of water (KIND); lower still where
   its lip lies deep. The sheet, its shore, wading and the wet sand all follow from that one number (land-water.js, lower).

   The land. Dead all round: the hills, the woods, the valley, the pit's rim, the fringe. The village itself (its houses,
   yards, fields, pasture, stalls) is not dead yet but nearly (NEAR: a little life left in it, in patches), and the edge
   between the two wanders. The picture is the kit's (stylized-nature's setDryness): the trees, the grass, the ground, the
   ferns, the flowers and the pines all die by it.
   ========================================================================== */
import * as THREE from 'three';
import { lipLanes } from './land-water.js';
import { setDryness } from './stylized-nature.js';

export const KIND = {
  stream: { least: 0.3 },        // the upper and mill streams, the meadow brooks, the bowls
  river: { least: 0.6 },         // the river and the valley's river
  step: { least: 0.15 },         // a step of a cascade, a shelf of the pit
};
const kindOf = name => /^(river|valley_river)$/.test(name) ? 'river' : /(step|shelf)/.test(name) ? 'step' : 'stream';
const UNDER_LIP = 0.05;           // metres a stretch stands under the lowest point of its lip
export const NEAR = 0.55;         // how dead the village itself is (0 alive .. 1 dead)

export function droughtWater({ stretches, heightAt: H, names = [] }) {
  const report = [];
  const lower = stretches.map((rows, k) => {
    const lv = rows[0][2], { lanes } = lipLanes(rows, H), sills = lanes.filter(l => l.sill !== null).map(l => l.sill);
    const under = sills.length ? lv - Math.min(...sills) + UNDER_LIP : 0;          // (how far down it must stand to go over nowhere)
    const drop = Math.max(KIND[kindOf(names[k] || '')].least, under);
    report.push({ k, name: names[k], drop: +drop.toFixed(2) });
    return drop;
  });
  console.info('[drought] water', JSON.stringify(report));
  return { lower, report };
}

// the water that is left, pool by pool: the triangles of each sheet that lie over the ground (a sheet runs on under a dry
// riffle, hidden by it: those are not water), joined where they touch. Each pool: its middle, its level, its area (m2), its
// deepest spot [x, z, depth] and its triangles (x, z, three to a triangle: what the map paints)
export function droughtPools(surfaces, H) {
  const pools = [];
  for (const mesh of surfaces) {
    const pos = mesh.geometry.attributes.position.array, idx = mesh.geometry.index.array, n = pos.length / 3;
    const up = Array.from({ length: n }, (_, i) => i), root = i => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
    const wet = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2], cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
      if (H(cx, cz) > pos[a * 3 + 1] - 0.02) continue;                   // (ground above the water here: dry)
      wet.push(t); up[root(b)] = root(a); up[root(c)] = root(a);
    }
    const byRoot = new Map();
    for (const t of wet) {
      const r = root(idx[t]); let p = byRoot.get(r);
      if (!p) byRoot.set(r, p = { x: 0, z: 0, y: pos[idx[t] * 3 + 1], area: 0, deepest: [0, 0, 0], tris: [] });
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map(i => [pos[i * 3], pos[i * 3 + 2]]);
      const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, cx = (a[0] + b[0] + c[0]) / 3, cz = (a[1] + b[1] + c[1]) / 3;
      p.area += area; p.x += cx * area; p.z += cz * area; p.tris.push(...a, ...b, ...c);
      const depth = p.y - H(cx, cz); if (depth > p.deepest[2]) p.deepest = [cx, cz, depth];
    }
    for (const p of byRoot.values()) { p.x /= p.area || 1; p.z /= p.area || 1; pools.push(p); }
  }
  return pools;
}

// ---- the land: one number for every spot, and the picture of it
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function toSegment(x, z, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
  return Math.hypot(x - ax - ex * t, z - az - ez * t);
}
function toPolygon(x, z, pts) {                                         // metres outside it (inside: below 0)
  let d = Infinity, inside = false;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    d = Math.min(d, toSegment(x, z, ax, az, bx, bz));
    if ((az > z) !== (bz > z) && x < ax + (z - az) / (bz - az) * (bx - ax)) inside = !inside;
  }
  return inside ? -d : d;
}

// what the village is: its houses and yards, fields and pasture, stalls and props; each with the ground round it that
// it keeps alive (metres). The lookouts' yards out by the pit and the falls are not the village
const VILLAGE = { house: 6, yard: 5, field: 4, fence: 4, prop: 4, inside: [-80, 75, -75, 56], edge: 16 };

export function cursedLand({ plan: P, rect: [x0, z0, w, d], west = null, near = NEAR, size = 256 }) {
  const V = VILLAGE, inVillage = (x, z) => x > V.inside[0] && x < V.inside[1] && z > V.inside[2] && z < V.inside[3];
  const parts = [];                                                      // each: (x, z) -> metres outside it
  for (const b of P.buildings || []) if (inVillage(b.x, b.z)) { const r = (b.pad > 1.5 ? b.pad : 3) + V.house; parts.push([b.x, b.z, r + 12, (x, z) => Math.hypot(x - b.x, z - b.z) - r]); }
  for (const [x, z, r] of P.yards || []) if (inVillage(x, z)) parts.push([x, z, r + V.yard + 12, (px, pz) => Math.hypot(px - x, pz - z) - r - V.yard]);
  for (const f of P.fields || []) {
    const c = Math.cos(f.yaw || 0), s = Math.sin(f.yaw || 0), hw = f.w / 2 + V.field, hd = f.d / 2 + V.field;
    parts.push([f.x, f.z, Math.hypot(hw, hd) + 12, (x, z) => { const lx = Math.abs((x - f.x) * c - (z - f.z) * s) - hw, lz = Math.abs((x - f.x) * s + (z - f.z) * c) - hd; return Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) + Math.min(Math.max(lx, lz), 0); }]);
  }
  for (const f of P.fences || []) {
    const xs = f.points.map(p => p[0]), zs = f.points.map(p => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    parts.push([cx, cz, Math.hypot(Math.max(...xs) - cx, Math.max(...zs) - cz) + V.fence + 12, (x, z) => toPolygon(x, z, f.points) - V.fence]);
  }
  for (const p of P.props || []) if (inVillage(p[1], p[2])) parts.push([p[1], p[2], V.prop + 12, (x, z) => Math.hypot(x - p[1], z - p[2]) - V.prop]);
  const outside = (x, z) => {
    let m = 99;
    for (const [px, pz, reach, f] of parts) if (Math.abs(x - px) < reach + m && Math.abs(z - pz) < reach + m) m = Math.min(m, f(x, z));
    return m;
  };
  const at = (x, z) => {
    const wander = 4 * Math.sin(x * 0.07 + z * 0.031 + 1.7) + 3 * Math.sin(z * 0.11 - x * 0.05 + 0.4) + 2 * Math.sin(x * 0.23 + z * 0.19);
    const life = 1 - ss(0, V.edge, outside(x, z) + wander);              // 1 in the village, 0 out in the dead land
    const patches = 0.09 * Math.sin(x * 0.19 + 2.1) * Math.sin(z * 0.17 + 0.6) + 0.05 * Math.sin(x * 0.53 - z * 0.41);      // (the village not all alike: some of it a little more alive)
    const v = 1 - life * (1 - Math.min(1, Math.max(0, near + patches)));
    return west ? Math.max(v, west.deadAt(x, z)) : v;
  };
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const o = (j * size + i) * 4;
    data[o] = Math.round(255 * at(x0 + (i + 0.5) / size * w, z0 + (j + 0.5) / size * d)); data[o + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size); texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
  setDryness(texture, [x0, z0, w, d]);
  return { at, texture };
}
