// player-footsteps.js
// Her feet in the water, for the player with the moves (player-moves.js): each foot is followed bone by bone, so the water
// is touched exactly when and where a foot comes down. (The same way player.js does it, in a place of its own.)
//
//   const steps = createFootsteps(level);
//   steps.find(character)                         once, and again when another character takes her place
//   every frame, after her pose and her place are set:
//   steps.update(dt, { root, pos, speed, walk, run, still })      still: true in a jump, a fall or a landing (no steps then)
//
// Each foot swings between a low and a high point of its own; the moment it comes back down to the low point is the step.
// The range is learnt as she moves, so walk and run (and any other clip) need no numbers of their own.

import * as THREE from 'three';

export function createFootsteps(level) {
  const feet = [], footPos = new THREE.Vector3();
  return {
    get count() { return feet.length; },
    find(character) {
      feet.length = 0;
      character.object.traverse(o => { if (o.isBone && /_(L|R)_Foot$/.test(o.name)) feet.push({ bone: o, lo: 0, hi: 0, up: false, seen: false, since: 1 }); });
    },
    update(dt, { root, pos, speed, walk, run, still }) {
      if (!feet.length || !level.ripple) return;
      root.updateMatrixWorld(true);
      for (const f of feet) {
        if (still) { f.up = false; continue; }      // a jump's tucked legs are not steps (and must not stretch the learnt range)
        f.bone.getWorldPosition(footPos);
        const y = footPos.y - pos.y;
        if (!f.seen) { f.lo = f.hi = y; f.seen = true; }
        f.lo = y < f.lo ? y : f.lo + (y - f.lo) * Math.min(1, dt * 0.25);
        f.hi = y > f.hi ? y : f.hi + (y - f.hi) * Math.min(1, dt * 0.25);
        f.since += dt;
        const range = f.hi - f.lo;
        if (range < 0.03 || speed < 0.3) { f.up = false; continue; }          // standing: feet stay planted
        if (y > f.lo + range * 0.55) f.up = true;
        else if (f.up && y < f.lo + range * 0.28) {
          f.up = false;
          const d = level.waterDepthAt(footPos.x, footPos.z);
          if (d > 0.04 && f.since > 0.18) {
            f.since = 0;
            // harder the faster she goes and the deeper the water; a run kicks up a wider ring than a walk
            const pace = Math.min(1, Math.max(0, (speed - walk) / (run - walk)));
            level.ripple(footPos.x, footPos.z, (0.75 + 0.35 * Math.min(1, d / 0.4)) * (1 + 0.45 * pace), 0.3 + 0.08 * pace, 'step');
          }
        }
      }
    },
  };
}
