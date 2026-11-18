// player-climb.js
// A cliff's face, for the player with the moves (player-moves.js): which way it rises and how steeply, where a step over
// the rock leads, and where its top is.
//
// The land is a heightmap: a cliff is a steep slope and never an overhang, so a face is the ground itself, and she climbs
// laid against it (player-moves.js lays her on the flat face.lie measures). A face is never flat: its foot is hollow and its
// top bulges, so that flat is taken from the rock under her whole body, never from under her feet alone (laid by the rock's
// angle at her feet, her chest and head were inside the rock at one climbable spot in ten).
//
//   const face = createFace(standAt, footing);     standAt(x, z): the land's height; footing(x, z): 'ground' | 'cliff' | ...
//   face.at(x, z)                                  -> { ux, uz, slope }: the way the land rises there (a unit step over the
//                                                     ground) and how steeply (m up per m along). The same object each time
//   face.step(x, z, up, side, dist, out)           a step of dist metres over the rock: up the face (1) or down it (-1), to her
//                                                     right (1) or left (-1) along it (she faces the rock). Writes out.x, out.z
//   face.top(x, z, reach, out)                     up the face from (x, z): the first ground above it, if it is within reach
//                                                     metres over the rock. Writes out.x, out.z, returns how far; -1: none
//   face.lie(x, z, dx, dz, span, half, out)        the flat to lay her on, her feet at (x, z), facing the way (dx, dz) over the
//                                                     ground, her body span metres long and half metres to each side. Writes
//                                                     out.angle (how steep the flat is, radians from level) and out.off (metres
//                                                     the flat stands out of the rock at her feet). The flat is a plank stood on
//                                                     the rock at her feet and leant on the rock above: the steepest line from
//                                                     her feet to any of the rock under her, so none of it reaches over the
//                                                     flat. Over a hollow (a face's foot) she bridges it, hands and feet on the
//                                                     rock; where the rock falls away above (a bulge, a top within reach) her
//                                                     feet stay on it and her hands are over the edge. Rock beside her that
//                                                     stands higher than under her middle holds the flat out by as much (off),
//                                                     MOST_OFF at most

const MOST_OFF = 0.4;         // m: the furthest the rock beside her holds her off the face

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
    lie(x, z, dx, dz, span, half, out) {
      const y0 = standAt(x, z), N = 8;
      let angle = Math.atan(face.at(x, z).slope);
      for (let pass = 0; pass < 3; pass++) {                             // the steepest line from her feet to the rock under her (each time with the last one's angle)
        const c = Math.cos(angle);
        let steep = 0.3;
        for (let i = 2; i <= N; i++) { const a = span * c * i / N; steep = Math.max(steep, Math.atan2(standAt(x + dx * a, z + dz * a) - y0, a)); }
        angle = Math.min(1.52, steep);
      }
      const c = Math.cos(angle), s = Math.sin(angle);
      let off = 0;
      for (let j = -1; j <= 1; j++) {                                    // under her middle, and under each side of her
        const sx = x - dz * half * j, sz = z + dx * half * j;
        for (let i = j ? 0 : 1; i <= N; i++) {
          const a = span * c * i / N;
          off = Math.max(off, (standAt(sx + dx * a, sz + dz * a) - y0) * c - a * s);      // how far the rock stands out of the flat there
        }
      }
      out.angle = angle; out.off = Math.min(off, MOST_OFF);
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
