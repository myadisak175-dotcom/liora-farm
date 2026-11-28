/* ==========================================================================
   old-farm.js  —  the hero's old farm round her farm (in the game for good since 28 Nov 2026; ?oldfarm=0: none; a trial
   behind ?oldfarm=1 before): what he left there, a hundred years on

   The user, 27 Nov 2026: "ไม่มีแปลงผัก ไม่มีบ้าน ไม่มีรั้ว ไม่มีอะไรเลยเหรอ เริ่มเกมตัวเปล่า" - so the farm she finds is
   his, run down, not an empty field: his cottage west of it (its roof fallen in on the side toward the farm, the rafters
   showing), a fence round the farm (rails gone, posts leaning, a gap where the old cart track comes in, a gate toward his
   door), two old beds in the corner by the road still dug and ready to sow, his well (its roof gone, a post snapped), a
   lean-to shed by the track (wood and crates in it), a scarecrow in the field and, in its middle, a little mound with a
   ring of stones and a dry sprout: the last seed (the story's; nothing grows from it yet).

   One job: what stands round her farm and how it is built. The level lays it (hill-village-level.js): the cottage is a kit
   house (village-kit.js, roofHole), the rest is merged into the village's built mesh (stylized-buildings.js' flat-coloured
   kit, as the village's fences, well and props are: nothing more to draw). farm-tools.js takes the farm as it begins from
   it (the beds dug, a few squares kept clear, two squares no tool is used on, a save of its own).

     const old = createOldFarm({ farm: { x0, z0, cols, rows }, heightAt });
     old.cottage                    { id, spec, x, z, yaw, extras(k, out, x, y, z, yaw) }: the level builds the house
                                    (k.house) and its footing, then extras puts what goes with it (a chimney as a kit piece
                                    into k, the rafters showing through the hole and the tiles fallen below it into out)
     old.geometries                 the fence, the beds' frames, the well, the shed, the scarecrow, the mound: in the world
     old.colliders, old.bare, old.casters   for the level's lists (as its own things give them)
     old.keepOff                    [x, z, r]: where the land's ferns and tufts are not to come up (through his walls)
     old.spawn                      { x, z, yaw }: she starts by the last seed, facing the cottage across the farm
     old.tools                      { saveKey, fresh, beds, clear, blocked } for createFarmTools (farm-tools.js)

   Facing: yaw 0 is +z (south on the map), PI/2 is +x (east).
   ========================================================================== */
import * as BD from './stylized-buildings.js';

const C = BD.BUILD_COLORS;
// a hundred years of weather: the village's wood gone grey, a burlap head, straw, a faded shirt
const OLD = {
  wood: '#86735d', woodDark: '#5e4f41', woodGrey: '#958877', burlap: '#c7ae80', straw: '#d6bc68', shirt: '#7690a3',
  patch: '#b0623f', patch2: '#d3bf7c', soil: '#6d5139', sprout: '#8e9663', water: '#2d5662', tile: '#b8643f', ink: '#3b3026',
};
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// a box from point a to point b ([x, y, z]), its middle on the line between them: a rail, a rafter, a beam fallen
const beam = (K, a, b, thick, wide, col, vary) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], flat = Math.hypot(dx, dz), len = Math.hypot(flat, dy);
  K.box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - thick / 2, (a[2] + b[2]) / 2, len, thick, wide, col, { rz: Math.atan2(dy, flat), ry: Math.atan2(-dz, dx), vary });
};
// a stick lying on the ground from (x, z) along the way `turn`, len long, its middle y over the ground
const lying = (K, x, y, z, turn, len, thick, col) => K.box(x, y - thick / 2, z, len, thick, thick, col, { rz: 0, ry: turn });

export function createOldFarm({ farm, heightAt: H }) {
  const { x0, z0, cols, rows } = farm, x1 = x0 + cols, z1 = z0 + rows;
  const mid = (i, j) => [x0 + i + 0.5, z0 + j + 0.5];
  const geometries = [], colliders = [], bare = [], casters = [];
  const r = mulberry(2711);

  // ---- where everything is (the farm: x0..x1 west to east, z0..z1 north to south; the road and its bank are north of it,
  // the dead west fringe west of the cottage, its cart track coming in at the farm's south-west corner)
  const COTTAGE = { x: x0 - 6, z: z0 + 5, yaw: 0 };                       // west of the farm, its door facing it
  const WELL = { x: x0 - 4.5, z: z0 + 11 };                               // south of the cottage
  const SHED = { x: x0 - 5.5, z: z0 + 19, yaw: Math.PI };                 // south of the cart track, open toward it
  const BEDS = [[0, 1, 0, 2], [3, 4, 0, 2]];                              // squares: i from..to, j from..to (in the corner by the road)
  const SCARE = [6, 4], SEED = [11, 7];                                   // squares: the scarecrow, the last seed
  const spawn = { x: x0 + 13.4, z: z0 + 8.2, yaw: -1.75 };                // by the seed, looking west over the farm to the cottage

  // ---- the fence: posts and two rails round the farm as the village's are, 0.6 m out from it, a hundred years on
  {
    const K = BD.kit(91), m = 0.6, X0 = x0 - m, X1 = x1 + m, Z0 = z0 - m, Z1 = z1 + m;
    // each side: from, to, and its gaps (metres along it): 'open' no posts or rails between, 'down' the posts stand, the rails lie
    const sides = [
      [[X0, Z0], [X1, Z0], [[10.2, 13.0, 'down']]],                       // north (the road's side)
      [[X1, Z0], [X1, Z1], [[6.8, 8.6, 'down']]],                         // east
      [[X1, Z1], [X0, Z1], [[X1 - X0 - 2.3, 99, 'open']]],                // south: open at its west end, where the cart track comes in
      [[X0, Z1], [X0, Z0], [[-1, 2.1, 'open'], [8.0, 10.6, 'open']]],     // west: the track's corner, and a gate toward his door
    ];
    for (const [a, b, gaps] of sides) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 1.7)), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
      const gapAt = s => gaps.find(([g0, g1]) => s > g0 + 0.01 && s < g1 - 0.01);
      const post = s => { const x = a[0] + ux * s, z = a[1] + uz * s; return { s, x, z, y: H(x, z) }; };
      // the posts: every 1.7 m or so, and one at each end of a gap (a gate's posts), none inside an open gap nor crowding a
      // gap's post; the side's last one (its corner) is drawn as the next side's first
      const ends = gaps.flatMap(([g0, g1]) => [g0, g1]).filter(s => s > 0.3 && s < len - 0.3);
      const marks = [...Array.from({ length: n + 1 }, (_, k) => len * k / n).filter(s => !ends.some(e => Math.abs(s - e) < 0.6)), ...ends].sort((p, q) => p - q);
      const posts = marks.filter(s => { const g = gapAt(s); return !g || g[2] === 'down'; }).map(post);
      for (const p of posts) {
        if (p.s > len - 0.01) continue;
        const edge = ends.some(e => Math.abs(p.s - e) < 0.01);
        const lean = edge ? 0.12 + r() * 0.16 : r() < 0.3 ? r() * 0.09 : 0, dir = r() * Math.PI * 2;
        K.box(p.x, p.y - 0.3, p.z, 0.16, (edge ? 1.5 : 1.38) + r() * 0.12, 0.16, r() < 0.4 ? OLD.woodGrey : OLD.wood, { rx: lean * Math.cos(dir), rz: lean * Math.sin(dir), ry: r() * 0.3 });
        colliders.push([p.x, p.z, 0.16]);
      }
      for (let k = 0; k + 1 < posts.length; k++) {
        const p = posts[k], q = posts[k + 1], g = gapAt((p.s + q.s) / 2);
        if (g && g[2] === 'open') continue;                               // (across an open gap: nothing)
        if (g) {                                                           // the rails down in the grass
          if (r() < 0.75) lying(K, (p.x + q.x) / 2 + (r() - 0.5) * 0.4, H((p.x + q.x) / 2, (p.z + q.z) / 2) + 0.03, (p.z + q.z) / 2 + (r() - 0.5) * 0.4, Math.atan2(-uz, ux) + (r() - 0.5) * 0.7, 1.6, 0.08, OLD.woodGrey);
          continue;
        }
        let top = 0;
        for (const h of [0.42, 0.85]) {
          const u = r();
          if (u < 0.17) continue;                                          // a rail gone
          if (u < 0.27 && h > 0.5) {                                       // a rail come away at one end, its other end in the grass
            const f = r() < 0.5, A = f ? p : q, B = f ? q : p, bx = B.x - (B.x - A.x) * 0.12, bz = B.z - (B.z - A.z) * 0.12;
            beam(K, [A.x, A.y + h, A.z], [bx, H(bx, bz) + 0.04, bz], 0.09, 0.07, OLD.wood);
            continue;
          }
          beam(K, [p.x, p.y + h, p.z], [q.x, q.y + h, q.z], 0.09, 0.07, r() < 0.3 ? OLD.woodGrey : OLD.wood, 0.08);
          top = Math.max(top, h + 0.09);
        }
        if (top) for (let t = 0.25; t < q.s - p.s; t += 0.5) {             // (she may go over it, as over the village's fences)
          const f = t / (q.s - p.s), x = p.x + (q.x - p.x) * f, z = p.z + (q.z - p.z) * f;
          colliders.push([x, z, 0.22, undefined, undefined, p.y + (q.y - p.y) * f + top]);
        }
      }
    }
    // a post fallen across the north gap, and the gate's posts a little taller (the west gap: toward his door)
    const fx = X0 + 11.4, fz = Z0 + 0.3;
    lying(K, fx, H(fx, fz) + 0.07, fz, 0.35, 1.45, 0.15, OLD.woodDark);
    geometries.push(K.done());
  }

  // ---- the old beds: frames of boards round two beds in the corner by the road (their squares begin dug: farm-tools.js)
  const beds = [];
  {
    const K = BD.kit(92);
    for (const [bi, [i0, i1, j0, j1]] of BEDS.entries()) {
      const bx0 = x0 + i0, bx1 = x0 + i1 + 1, bz0 = z0 + j0, bz1 = z0 + j1 + 1;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) beds.push(i + ',' + j);
      const board = (x, z, w, d, broken) => {
        const y = H(x, z) - 0.06;
        if (broken) {                                                      // a board come loose, one end down
          const a = [x - w / 2 + 0.05, y + 0.2, z - d / 2 + 0.03], b = [x + w / 2 - 0.05, H(x + w / 2, z + d / 2) + 0.02, z + d / 2 - 0.03];
          return beam(K, a, b, 0.18, 0.06, OLD.woodGrey);
        }
        K.box(x, y, z, w, 0.2 + r() * 0.03, d, r() < 0.5 ? OLD.wood : OLD.woodGrey, { vary: 0.08 });
      };
      board((bx0 + bx1) / 2, bz0, bx1 - bx0 - 0.02, 0.06);
      board((bx0 + bx1) / 2, bz1, bx1 - bx0 - 0.02, 0.06);
      board(bx0, (bz0 + bz1) / 2, 0.06, bz1 - bz0 - 0.02);
      board(bx1, (bz0 + bz1) / 2, 0.06, bz1 - bz0 - 0.02, bi === 1);
      for (const [cx, cz] of [[bx0, bz0], [bx1, bz0], [bx1, bz1], [bx0, bz1]]) K.box(cx, H(cx, cz) - 0.1, cz, 0.08, 0.36, 0.08, OLD.woodDark);
    }
    geometries.push(K.done());
  }

  // ---- the scarecrow: a pole and its cross-stick, a faded patched shirt, straw at its cuffs and hem, a burlap head with a
  // stitched face, a straw hat; turned toward where she starts, leaning a little
  {
    const K = BD.kit(93), [sx, sz] = mid(...SCARE);
    K.cyl(0, -0.3, 0, 0.055, 0.045, 2.2, 6, OLD.woodDark);
    K.box(0, 1.36, 0, 1.5, 0.07, 0.07, OLD.wood);
    K.box(0, 0.92, 0, 0.52, 0.64, 0.26, OLD.shirt, { vary: 0.06 });
    for (const s of [-1, 1]) {
      K.box(s * 0.42, 1.26, 0, 0.36, 0.21, 0.22, OLD.shirt);
      K.cyl(s * 0.66, 1.36 - 0.08, 0, 0.03, 0.1, 0.16, 5, OLD.straw, { rz: -s * Math.PI / 2 });
    }
    K.cyl(0, 0.78, 0, 0.27, 0.2, 0.16, 7, OLD.straw);                     // straw out of the hem
    K.box(0, 0.98, 0, 0.55, 0.05, 0.28, C.rope);                          // a rope for a belt
    K.box(0.13, 1.06, 0.131, 0.15, 0.15, 0.012, OLD.patch);              // patches
    K.box(-0.15, 1.24, 0.131, 0.11, 0.12, 0.012, OLD.patch2);
    K.cyl(0, 1.55, 0, 0.1, 0.1, 0.05, 8, C.rope);                         // tied at the neck
    K.cyl(0, 1.58, 0, 0.17, 0.15, 0.34, 8, OLD.burlap);                   // the head
    for (const s of [-1, 1]) K.box(s * 0.06, 1.75, 0.166, 0.045, 0.045, 0.012, OLD.ink);
    K.box(0, 1.65, 0.168, 0.12, 0.02, 0.012, OLD.ink);
    K.cyl(0, 1.89, 0, 0.36, 0.34, 0.03, 12, OLD.straw);                   // the hat
    K.cyl(0, 1.91, 0, 0.19, 0.08, 0.21, 10, OLD.straw);
    K.cyl(0, 1.91, 0, 0.2, 0.19, 0.05, 10, '#9a6b3f');
    const g = K.done(); g.rotateZ(0.05);
    geometries.push(BD.place(g, sx, H(sx, sz), sz, Math.atan2(spawn.x - sx, spawn.z - sz)));
    colliders.push([sx, sz, 0.28]);
  }

  // ---- the last seed: a low mound, a ring of stones round it, a dry sprout
  {
    const K = BD.kit(94), [mx, mz] = mid(...SEED);
    K.cyl(0, -0.06, 0, 0.46, 0.2, 0.18, 10, OLD.soil, { vary: 0.03 });
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2 + r() * 0.3, d = 0.6 + r() * 0.08; K.box(Math.cos(a) * d, -0.05, Math.sin(a) * d, 0.13 + r() * 0.05, 0.1 + r() * 0.05, 0.1, C.stoneDark, { ry: a }); }
    K.cyl(0.01, 0.1, 0, 0.012, 0.009, 0.17, 4, OLD.sprout, { rz: 0.25 });
    K.box(0.05, 0.22, 0, 0.09, 0.012, 0.04, OLD.sprout, { rz: -0.5 });
    K.box(-0.03, 0.2, 0.01, 0.08, 0.012, 0.035, OLD.sprout, { rz: 0.7, ry: 1.2 });
    geometries.push(BD.place(K.done(), mx, H(mx, mz), mz, 0.4));
    bare.push([mx, mz, 1.1]);                                             // (bare earth round it: a spot set apart in the field)
  }

  // ---- his well: the ring and its coping, a stone gone; dark water low in it; a post standing and one snapped, the beam
  // fallen from the one into the grass beyond the other, the roof's planks down beside it; a bucket on the rim
  {
    const K = BD.kit(95), { x, z } = WELL, y = H(x, z);
    K.cyl(0, -0.6, 0, 0.98, 0.94, 1.36, 10, C.stone);
    for (let k = 0; k < 10; k++) {
      if (k === 3) continue;
      const a = k / 10 * Math.PI * 2;
      K.box(Math.cos(a) * 0.9, 0.72, Math.sin(a) * 0.9, 0.56, 0.13, 0.26, C.stoneDark, { ry: Math.atan2(-Math.cos(a), -Math.sin(a)), vary: 0.06 });      // (along the ring)
    }
    K.cyl(0, 0.18, 0, 0.74, 0.74, 0.04, 10, OLD.water, { vary: 0 });
    K.box(-0.92, 0.7, 0, 0.15, 1.6, 0.15, OLD.woodDark);                 // the post standing
    K.box(0.92, 0.7, 0, 0.15, 0.6, 0.15, OLD.woodDark, { rz: -0.06 });   // the other snapped
    K.box(0.95, 1.22, 0.03, 0.06, 0.18, 0.06, OLD.woodDark, { rz: 0.45 });
    beam(K, [-0.92, 2.25, 0], [1.9, 0.06 + H(x + 1.9, z + 0.4) - y, 0.4], 0.12, 0.12, OLD.woodDark);
    for (let k = 0; k < 3; k++) lying(K, 1.45 + k * 0.28, 0.04 + H(x + 1.45, z - 0.7) - y, -0.75 + k * 0.32, 0.25 * k - 0.4, 1.15, 0.05, k === 1 ? C.roofDark : OLD.tile);
    K.cyl(-0.5, 0.78, 0.55, 0.15, 0.18, 0.26, 8, OLD.wood);               // a bucket on the rim
    K.cyl(-0.5, 0.86, 0.55, 0.185, 0.185, 0.04, 8, OLD.woodDark);
    geometries.push(BD.place(K.done(), x, y, z, 0.3));
    colliders.push([x, z, 1.15]); bare.push([x, z, 2.0]); casters.push([x, z, 2.3, 1.2, 0.8]);
  }

  // ---- his shed: a lean-to of boards, open at its front, its roof higher there; a plank or two gone; wood and crates in it,
  // hay outside. Built facing +z, turned to face the track
  {
    const K = BD.kit(96), { x, z, yaw } = SHED, y = H(x, z), hB = 1.75, hF = 2.3, W = 3.2, D = 2.2;
    for (const sx of [-W / 2 + 0.07, W / 2 - 0.07]) { K.box(sx, -0.25, D / 2 - 0.07, 0.15, hF + 0.25, 0.15, OLD.woodDark); K.box(sx, -0.25, -D / 2 + 0.07, 0.15, hB + 0.25, 0.15, OLD.woodDark); }
    for (let k = 0; k < 8; k++) if (k !== 5) K.box(-W / 2 + 0.22 + k * 0.394, -0.05, -D / 2 + 0.04, 0.38, hB + (r() - 0.5) * 0.08, 0.05, r() < 0.5 ? OLD.wood : OLD.woodGrey, { vary: 0.06 });
    for (const s of [-1, 1]) for (let q = 0; q < 4; q++) if (!(s > 0 && q === 2)) K.box(s * (W / 2 - 0.02), 0.12 + q * 0.34, 0, 0.05, 0.28, D - 0.1, r() < 0.5 ? OLD.wood : OLD.woodGrey, { vary: 0.06 });
    K.box(0, hF - 0.14, D / 2 - 0.07, W + 0.1, 0.13, 0.15, OLD.woodDark);
    K.box(0, hB - 0.14, -D / 2 + 0.07, W + 0.1, 0.13, 0.15, OLD.woodDark);
    const slope = Math.atan2(hF - hB, D), len = Math.hypot(D, hF - hB) + 0.45;
    for (let k = 0; k < 9; k++) if (k !== 2 && k !== 6) K.box(-W / 2 - 0.1 + k * 0.42, (hB + hF) / 2 + 0.02, 0, 0.4, 0.05, len, k % 2 ? OLD.wood : OLD.woodGrey, { rx: -slope, vary: 0.05 });
    const parts = [K.done()];
    const prop = (kind, lx, lz, turn, seed) => { const g = BD.propGeometry(kind, { seed }); g.rotateY(turn); g.translate(lx, 0, lz); parts.push(g); };
    prop('woodpile', -0.75, -0.45, 0.1, 71);
    prop('crates', 0.55, -0.5, 0.4, 72);
    prop('hay', 1.0, 1.75, 0.3, 73);
    for (const g of parts) geometries.push(BD.place(g, x, y, z, yaw));
    for (const c of BD.rectCircles(x, z, W + 0.2, D + 0.2, yaw)) colliders.push(c);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let lx = -W / 2 + 0.5; lx < W / 2; lx += 1) for (let lz = -D / 2 + 0.5; lz < D / 2; lz += 1) bare.push([x + lx * cy + lz * sy, z - lx * sy + lz * cy, 1.0]);
    const hx = 1.0 * cy + 1.75 * sy, hz = -1.0 * sy + 1.75 * cy;            // (the hay outside)
    colliders.push([x + hx, z + hz, 0.75, undefined, undefined, H(x + hx, z + hz) + 1.0]);
    casters.push([x, z, 2.2, 1.8, 0.85]);
  }

  // ---- his cottage: a small kit house, its door toward the farm (east), its roof fallen in on that side, no chimney of the
  // kit's own (one put on the far side, where the hole is not); the rafters seen through the hole and the tiles fallen under
  // it are extras, put where the house stands
  const spec = { w: 4, l: 6, floors: 1, wall: 'plaster', door: 'right', seed: 61, chimney: false, shutters: true, windows: 0.7, roofHole: { x: 1.3, z: 0.8, rx: 0.85, rz: 1.1 } };
  const ROOF = { ridge: 3.73, eave: -0.52, out: 2.76 }, top = 3;            // (village-kit.js' 4 m roof: how high its tiles lie over the walls' top)
  const roofY = ax => top + ROOF.ridge - (ROOF.ridge - ROOF.eave) * Math.min(1, Math.abs(ax) / ROOF.out);
  const extras = (k, out, x, y, z, yaw) => {
    const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    // (no vines: the kit's Prop_Vine pieces are see-through leaves on a picture, and the props' material draws them as black
    // patches, 27 Nov 2026)
    const [cx, cz] = at(-0.9, -1.4);                                      // the chimney, on the far slope
    k.piece('Prop_Chimney', cx, y + roofY(0.9) - 1.9, cz, yaw + Math.PI);
    // rafters and two battens under the tiles, seen through the hole; one rafter broken, its end hanging
    const K = BD.kit(97);
    for (const [lz, to] of [[-0.15, 2.5], [0.55, 1.2], [1.25, 2.5]]) beam(K, [0.12, roofY(0.12) - 0.14, lz], [to, roofY(to) - 0.14, lz], 0.12, 0.1, OLD.woodDark);
    beam(K, [1.2, roofY(1.2) - 0.14, 0.55], [1.55, roofY(1.2) - 0.75, 0.62], 0.1, 0.09, OLD.woodDark);
    for (const ax of [0.9, 1.75]) K.box(ax, roofY(ax) - 0.12, 0.8, 0.07, 0.05, 2.5, OLD.wood);
    // tiles fallen under the hole, on the ground by the east wall
    for (let n = 0; n < 9; n++) {
      const lx = 2.45 + r() * 0.9, lz = -0.3 + r() * 2.2, [wx, wz] = at(lx, lz);
      K.box(lx, H(wx, wz) - y - 0.01, lz, 0.3, 0.045, 0.22, n % 3 ? OLD.tile : C.roofDark, { ry: r() * 3, rz: (r() - 0.5) * 0.3 });
    }
    out.push(BD.place(K.done(), x, y, z, yaw));
  };
  const cottage = { id: 'old_farm_cottage', spec, ...COTTAGE, extras };

  // ---- what farm-tools.js begins the farm with
  const key = ([i, j]) => i + ',' + j;
  const clear = [[12, 7], [13, 7], [12, 8], [13, 8], [14, 8]].map(key);    // round where she starts
  const blocked = { [key(SEED)]: 'มีอะไรบางอย่างฝังอยู่ตรงนี้… ยังไม่ต้องขุด', [key(SCARE)]: 'หุ่นไล่กาตัวเก่ายืนอยู่ตรงนี้' };
  const q = new URLSearchParams(location.search), fresh = q.get('oldfarm') === 'new' || q.get('farm') === 'new';      // (the farm from the start again)
  const tools = { saveKey: 'liora.oldfarm.v1', fresh, beds, clear, blocked };

  // where the land's ferns and tufts should not come up through what he built: [x, z, radius]
  const keepOff = [[COTTAGE.x, COTTAGE.z, 4.0], [WELL.x, WELL.z, 1.5], [SHED.x, SHED.z, 2.3]];

  return { cottage, geometries, colliders, bare, casters, keepOff, spawn, tools };
}
