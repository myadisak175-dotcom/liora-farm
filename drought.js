/* ==========================================================================
   drought.js  —  the hill village under the curse: how low its water stands, and how dead its land is

     const { lower, report } = droughtWater({ stretches, heightAt, names, split, falls });   // metres each stretch stands under its plan
     const dead = cursedLand({ plan, rect, west });     // dead.at(x, z): 0 alive .. 1 dead; the picture is set (setDryness)

   One job: the land as the curse has left it, worked out as the level is read (?curse=1 asks for it; nothing is baked, so
   the same plan can be brought back to life a stretch and a place at a time).

   The water. Every stretch stands lower than its plan says: the streams down to what is left in their pools, the rivers
   lower, and every fall a thin one. A fall's width is not drawn: how low each stretch stands is chosen so that it still goes
   over its lip, but only in a narrow run (land-water.js finds the lip as it always does: lipLanes, lipRuns). So the sheet,
   its shore and the fall agree, as the water and the land always do. A stretch a fall lands in keeps water under its foot.
   What each kind of water aims at (KIND): how low it stands at least and at most (metres), and how wide its fall is to be.

   The land. Dead all round: the hills, the woods, the valley, the pit's rim, the fringe. The village itself (its houses,
   yards, fields, pasture, stalls) is not dead yet but nearly (NEAR: a little life left in it, in patches), and the edge
   between the two wanders. The picture is the kit's (stylized-nature's setDryness): the trees, the grass, the ground, the
   ferns, the flowers and the pines all die by it.
   ========================================================================== */
import * as THREE from 'three';
import { lipLanes, lipRuns, lipLine, fallFoot } from './land-water.js';
import { setDryness } from './stylized-nature.js';

const LANE = 0.4;                 // (land-water.js's lanes: a run of lanes a to b is (b - a) * LANE wide)
export const KIND = {
  stream: { least: 0.3, most: 0.6, fall: 1.2 },      // the upper and mill streams, the meadow brooks, the bowls: down to their pools
  river: { least: 0.5, most: 1.3, fall: 2.6 },       // the river and the valley's river: lower, over its lip in a few strands
  step: { least: 0.15, most: 0.45, fall: 1.0 },      // a step of a cascade, a shelf of the pit: shallow pools to begin with
};
const kindOf = name => /^(river|valley_river)$/.test(name) ? 'river' : /(step|shelf)/.test(name) ? 'step' : 'stream';
const UNDER_FOOT = 0.2;           // metres of water a fall still lands in, at least, where its foot is
export const NEAR = 0.55;         // how dead the village itself is (0 alive .. 1 dead)

// How low each stretch stands. Taken from the highest water down, so that a fall's foot is known before the water it lands
// in is chosen: a stretch stands no lower than leaves UNDER_FOOT of water under every foot that lands in it, and a stretch
// above prefers a narrow run of its lip whose fall lands where that water will be
export function droughtWater({ stretches, heightAt: H, names, split = [], falls = [] }) {
  const levels = stretches.map(rows => rows[0][2]), lower = levels.map(() => 0), report = [];
  const into = k => { const f = falls.find(q => q.from === k && !q.deep); return f ? levels.findIndex(l => Math.abs(l - f.bottom) < 0.05) : -1; };
  const feet = levels.map(() => []);                                     // the feet landing in each stretch, as they are chosen
  const order = levels.map((l, k) => k).sort((a, b) => levels[b] - levels[a]);
  for (const k of order) {
    const K = KIND[kindOf(names[k] || '')], { lanes } = lipLanes(stretches[k], H), parted = split.includes(k), to = into(k);
    let most = K.most;
    for (const f of feet[k]) most = Math.min(most, levels[k] - H(f[0], f[1]) - UNDER_FOOT);
    most = Math.max(0, most);
    const below = to >= 0 ? KIND[kindOf(names[to] || '')] : null;
    let best = Infinity, drop = 0, width = 0, chosen = [];
    for (let d = 0; d <= most + 1e-6; d += 0.01) {
      const runs = lipRuns(lanes, levels[k] - d, parted);
      if (!runs.length) continue;                                        // (it must still go over: every stretch here ends in a fall)
      const w = runs.reduce((s, r) => s + (r.b - r.a) * LANE, 0);
      const lands = to >= 0 ? runs.map(r => fallFoot(lipLine(stretches[k], lanes, r), levels[k] - d, levels[to]).foot) : [];
      let dry = 0;                                                        // (how far short of the water below its feet would be, were that water as low as it is to go)
      for (const f of lands) dry += Math.max(0, below.least + UNDER_FOOT - (levels[to] - H(f[0], f[1])));
      const score = Math.abs(w - K.fall) + Math.max(0, K.least - d) * 3 + dry * 4 - d * 0.01;      // (a fall as wide as it is to be; low enough; landing in water; and the lower the better)
      if (score < best) { best = score; drop = d; width = w; chosen = lands; }
    }
    lower[k] = drop;
    if (to >= 0) feet[to].push(...chosen);
    report.push({ k, name: names[k], drop: +drop.toFixed(2), fall: +width.toFixed(1), most: +most.toFixed(2) });
  }
  report.sort((a, b) => a.k - b.k);
  console.info('[drought] water', JSON.stringify(report));
  return { lower, report };
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
