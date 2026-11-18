// player-climb.js
// A cliff's face, for the player with the moves (player-moves.js): which way it rises and how steeply, where a step over
// the rock leads, and where its top is.
//
// The land is a heightmap: a cliff is a steep slope and never an overhang, so a face is the ground itself, and she climbs
// with her feet on it (player-moves.js tilts her to it).
//
//   const face = createFace(standAt, footing);     standAt(x, z): the land's height; footing(x, z): 'ground' | 'cliff' | ...
//   face.at(x, z)                                  -> { ux, uz, slope }: the way the land rises there (a unit step over the
//                                                     ground) and how steeply (m up per m along). The same object each time
//   face.step(x, z, up, side, dist, out)           a step of dist metres over the rock: up the face (1) or down it (-1), to her
//                                                     right (1) or left (-1) along it (she faces the rock). Writes out.x, out.z
//   face.top(x, z, reach, out)                     up the face from (x, z): the first ground above it, if it is within reach
//                                                     metres over the rock. Writes out.x, out.z, returns how far; -1: none

export function createFace(standAt, footing) {
  const E = 0.35, at = { ux: 0, uz: 1, slope: 0 };
  const face = {
    at(x, z) {
      const gx = (standAt(x + E, z) - standAt(x - E, z)) / (2 * E), gz = (standAt(x, z + E) - standAt(x, z - E)) / (2 * E), s = Math.hypot(gx, gz);
      at.slope = s;
      if (s > 1e-5) { at.ux = gx / s; at.uz = gz / s; }
      return at;
    },
    step(x, z, up, side, dist, out) {
      const f = face.at(x, z), flat = 1 / Math.hypot(1, f.slope);      // (the steeper the rock, the less of a step up it is a step over the ground)
      out.x = x + (f.ux * up * flat - f.uz * side) * dist;
      out.z = z + (f.uz * up * flat + f.ux * side) * dist;
    },
    top(x, z, reach, out) {
      const y0 = standAt(x, z);
      let far = 0, px = x, pz = z, py = y0, onRock = footing(x, z) === 'cliff';
      for (let i = 0; i < 70 && far <= reach; i++) {
        const f = face.at(px, pz);
        if (f.slope < 1e-4) return -1;
        const h = 0.12 / Math.hypot(1, f.slope) + 0.02;                 // (short steps over the ground on a steep face)
        const qx = px + f.ux * h, qz = pz + f.uz * h, qy = standAt(qx, qz), kind = footing(qx, qz);
        far += Math.hypot(h, qy - py);
        if (kind === 'cliff') onRock = true;
        else if (kind !== 'ground') return -1;
        else if (onRock && qy > y0 + 0.05) { out.x = qx; out.z = qz; return far; }
        px = qx; pz = qz; py = qy;
      }
      return -1;
    },
  };
  return face;
}
