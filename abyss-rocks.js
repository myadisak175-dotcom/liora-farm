// abyss-rocks.js  —  the rock kit's big pieces in and round the abyss (a trial, behind ?rocks=new)
//
// One job: where the pieces go (a list for rock-world.js, which puts them in the world). Nothing here draws anything.
//   - pillars: great columns of rock standing up out of the clouds in the pit, their heads below the rim, so from the walk
//     round it she looks down on them (the kit's mountains, made slimmer and drawn up taller)
//   - one stretch of the wall, dressed in tiers: on each drop (the brink down to the first ledge, each ledge down to the next)
//     the big cliff pieces side by side, each fitted to its drop (rock-world.js, fitToEdge): its head at the edge above, its
//     foot on the ledge below. Not under a fall, not over one of the ribs that run down the walls (they part the pieces), not at
//     the lookout.
//
//   const list = abyssRockList({ heightAt, seed });      // [{ type, seed, x, y, z, ry, s, sy, fit }]
// Then moved by hand in the map itself (🪨 แก้หิน), kept as abyss-rocks-layout.js.

import { mulberry32 } from './stylized-nature.js';
import { propRockGeometry } from './rocks.js';
import { fitToEdge } from './rock-world.js';
import { ABYSS, AB } from './abyss-shape.js';

const D = Math.PI / 180;
export const ABYSS_ROCKS = {
  // a: where round the centre (degrees, as abyss-shape.js counts them), d: metres out from it, top: the height of its head,
  // width: how wide it stands (m); it is drawn up (sy, at most `tall` times) to reach down into the clouds
  pillars: [
    { type: 'peakSpire', seed: 1, a: -140, d: 9, top: 4, width: 15, tall: 2.0 },
    { type: 'peakSpire', seed: 2, a: 32, d: 12, top: -6, width: 13, tall: 2.0 },
    { type: 'mesaMount', seed: 1, a: 148, d: 13, top: -15, width: 17, tall: 2.0 },
  ],
  // the wall dressed in tiers: from, to (degrees, round by the south and west), which drops (0: the brink to the first ledge)
  wall: { from: 106, to: 178, tiers: [0, 1, 2] },
};
const TALL = ['bluffTall', 'bluffWide', 'bluffSplit', 'bluffWide'], LOW = ['bluffLow', 'bluffLowSplit'];

export function abyssRockList({ heightAt: H, seed = 1 } = {}) {
  const rng = mulberry32(seed * 977 + 5), R = (a, b) => a + rng() * (b - a), out = [];
  const { x: X, z: Z } = ABYSS;

  // ---- the pillars
  for (const p of ABYSS_ROCKS.pillars) {
    const bb = propRockGeometry(p.type, p.seed).boundingBox, a = p.a * D;
    const s = p.width / Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z), sy = p.tall;
    out.push({ type: p.type, seed: p.seed, x: X + Math.cos(a) * p.d, z: Z + Math.sin(a) * p.d, y: p.top - bb.max.y * s * sy, ry: R(0, 360), s, sy });
  }

  // ---- the wall, tier by tier
  const W = ABYSS_ROCKS.wall, ribs = AB.ribs, spur = AB.spur.a;
  for (const k of W.tiers) {
    let n = k, a = W.from * D;
    while (a < W.to * D) {
      const u = k ? AB.ledgeStart(k, a) : 0, top = k ? AB.ledgeY(k - 1, a) : ABYSS.rimH, drop = top - AB.ledgeY(k, a);
      const type = drop > 14 ? TALL[n % TALL.length] : LOW[n % LOW.length], sd = 1 + Math.floor(rng() * 3);
      const bb = propRockGeometry(type, sd).boundingBox, ft = type.startsWith('bluffLow') ? 9 : 16;
      const s = Math.min(1.6, Math.max(0.9, drop / (ft * 1.12))), w = (bb.max.x - bb.min.x) * s;
      const r = AB.rimR(a) - u, half = (w / 2 + 0.6) / r;
      // (nothing under a fall, over a rib or at the lookout: a step on round and try again)
      const blocked = [-1, -0.5, 0, 0.5, 1].some(q => AB.chuteAt(a + q * half) > 0.01) || Math.abs(a - spur) < 14 * D + half
        || ribs.some(rb => Math.abs(a - rb.a) * r < rb.w + 1.2 + w / 2);
      if (blocked) { a += 1 * D; continue; }
      // the piece: its face looking in over the pit, its middle on the arc, its front (its furthest lump) three to four metres
      // out from the wall's face, so its face stands clear of the wall and not only the lump that juts furthest; its back in the
      // wall; its foot on the ledge below
      const ry = Math.atan2(-Math.cos(a), -Math.sin(a)) / D + R(-7, 7), t = ry * D, lx = Math.cos(t), lz = -Math.sin(t);
      const mid = (bb.max.x + bb.min.x) / 2 * s, face = r - (k ? 0.6 : 0.45), back = bb.max.z * s - R(3.0, 3.8);
      const cx = X + Math.cos(a) * (face + back), cz = Z + Math.sin(a) * (face + back);
      const it = { type, seed: sd, x: cx - lx * mid, z: cz - lz * mid, y: H(cx, cz), ry, s, sy: 1 };
      if (fitToEdge(it, H, { head: -R(0.05, 0.3), foot: AB.ledgeY(k, a) - 0.3 })) { out.push(it); n++; }
      a += (w * 0.8) / r;                                                  // the next only just overlaps this one
    }
  }
  return out;
}
