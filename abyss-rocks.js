// abyss-rocks.js  —  the rock kit's big pieces in and round the abyss (a trial, behind ?rocks=new)
//
// One job: where the pieces go (a list for rock-world.js, which puts them in the world). Nothing here draws anything.
//   - pillars: great columns of rock standing up out of the clouds in the pit, their heads below the rim, so from the walk
//     round it she looks down on them (the kit's mountains, made slimmer and drawn up taller)
//
//   const list = abyssRockList({ heightAt, seed });      // [{ type, seed, x, y, z, ry, s, sy, fit }]
// Then moved by hand in the map itself (🪨 แก้หิน), kept as abyss-rocks-layout.js.

import { mulberry32 } from './stylized-nature.js';
import { propRockGeometry } from './rocks.js';
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
};

export function abyssRockList({ heightAt: H, seed = 1 } = {}) {
  const rng = mulberry32(seed * 977 + 5), R = (a, b) => a + rng() * (b - a), out = [];
  const { x: X, z: Z } = ABYSS;

  // ---- the pillars
  for (const p of ABYSS_ROCKS.pillars) {
    const bb = propRockGeometry(p.type, p.seed).boundingBox, a = p.a * D;
    const s = p.width / Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z), sy = p.tall;
    out.push({ type: p.type, seed: p.seed, x: X + Math.cos(a) * p.d, z: Z + Math.sin(a) * p.d, y: p.top - bb.max.y * s * sy, ry: R(0, 360), s, sy });
  }

  return out;
}
