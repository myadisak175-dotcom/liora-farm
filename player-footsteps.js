// player-footsteps.js
// Her feet on the ground and in the water, for the player with the moves (player-moves.js): each foot is followed bone by
// bone, so the water is touched, and her step is heard, exactly when and where a foot comes down, at whatever pace she
// goes (a walk, a run, a sprint, a dash's burst). (The same way player.js does it for the water, in a place of its own.)
//
//   const steps = createFootsteps(level, sounds);  sounds: her steps heard (step-sounds.js), or none
//   steps.find(character)                         once, and again when another character takes her place
//   every frame, after her pose and her place are set:
//   steps.update(dt, { root, pos, speed, walk, run, still, size })      still: true in a jump, a fall or a landing (no steps then); size: hers (1 as modelled)
//
// THE WATER. Each foot swings between a low and a high point of its own; the moment it comes back down to the low point is
// the step. The range is learnt as she moves, so walk and run (and any other clip) need no numbers of their own.
//
// HER STEPS HEARD (only with sounds: without them none of this is done, and the water's rings are as they were). A foot is
// followed stride by stride: lifted (MIN_LIFT over its low point), up to that stride's own top, and seen coming down when
// it is back under DOWN of the way. That is some time before it is down (a tenth of a second at her run, more at a slow
// walk), so the sound is told how long it has:
//   sounds.step(x, z, y, { side, pace, depth, in })
//     side: 'L' | 'R'    pace: 0 at her walk, 1 at her run, more in a sprint and a dash    depth: the water there
//     in: seconds until the foot is down. Learnt, not given: every stride it is measured (the foot has all but stopped
//     going down), for her walk and for her run apart, as seconds times her speed, since her legs go as fast as she does.
//     So a sound can be made to be heard as the foot lands on a phone that plays it late, and it keeps to her feet from
//     a slow walk to a dash, whose strides are not the same length in time.
// A stride's own top, not a range learnt over many: with that, coming out of a run her walk's lower strides went unseen
// for a second (the water's rings still go by the learnt range, untouched).

import * as THREE from 'three';

const MIN_LIFT = 0.1;          // m (as modelled): a foot this far over its low point has left the ground
const DOWN = 0.35;             // seen coming down: back under this much of its stride's height
const STOPPED = 0.35;          // down: going down at less than this much of the fastest it fell this stride
const LEAD = { walk: 0.083, run: 0.09 };      // how long that takes, before it has been measured: seconds at her walk's pace, at her run's
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createFootsteps(level, sounds = null) {
  const feet = [], footPos = new THREE.Vector3();

  // her step heard: one foot, this frame (footPos is where it is)
  function heard(f, y, dt, speed, walk, run, size) {
    const vy = (y - f.y) / Math.max(dt, 1e-4);
    f.y = y;
    if (speed < 0.3) { f.lifted = false; f.fall = -1; return; }               // standing: feet stay planted
    if (f.fall >= 0) {
      // coming down: once it has all but stopped, how long that took is learnt (for this gait, against her speed)
      f.fall += dt; f.drop = Math.max(f.drop, -vy);
      if (-vy < STOPPED * f.drop) {
        const took = Math.max(0, f.fall - dt / 2) * f.at;                     // (it stopped some time in this frame: half of it, on the whole)
        f.lead[f.gait] += (took - f.lead[f.gait]) * 0.35;
        f.fall = -1;
      } else if (f.fall > 0.25) f.fall = -1;                                  // (never seen to stop: nothing learnt from it)
    } else if (!f.lifted) {
      if (y > f.lo + MIN_LIFT * size) { f.lifted = true; f.top = y; }
    } else if (y > f.top) f.top = y;
    else if (vy < 0 && y < f.lo + DOWN * (f.top - f.lo)) {
      f.lifted = false; f.fall = 0; f.drop = -vy;
      // her legs go at her pace (between what her walk's clip and her run's can be played at: player-moves.js, pose)
      f.gait = speed < (walk + run) / 2 ? 'walk' : 'run';
      f.at = f.gait === 'walk' ? clamp(speed, 0.5 * walk, 1.3 * walk) : clamp(speed, 0.68 * run, 1.85 * run);
      if (!f.lead[f.gait]) f.lead[f.gait] = LEAD[f.gait] * (f.gait === 'walk' ? walk : run);
      sounds.step(footPos.x, footPos.z, footPos.y, {
        side: f.side, pace: clamp((speed - walk) / (run - walk), 0, 1.6), depth: level.waterDepthAt(footPos.x, footPos.z, footPos.y), in: f.lead[f.gait] / f.at,
      });
    }
  }

  return {
    get count() { return feet.length; },
    find(character) {
      feet.length = 0;
      character.object.traverse(o => {
        const m = o.isBone && /_(L|R)_Foot$/.exec(o.name);
        if (m) feet.push({ bone: o, side: m[1], lo: 0, hi: 0, up: false, seen: false, since: 1, y: 0, top: 0, lifted: false, fall: -1, drop: 0, gait: 'walk', at: 1, lead: { walk: 0, run: 0 } });
      });
    },
    update(dt, { root, pos, speed, walk, run, still, size = 1 }) {
      if (!feet.length || !(level.ripple || sounds)) return;
      root.updateMatrixWorld(true);
      for (const f of feet) {
        if (still) { f.up = false; f.lifted = false; f.fall = -1; continue; }      // a jump's tucked legs are not steps (and must not stretch the learnt range)
        f.bone.getWorldPosition(footPos);
        const y = footPos.y - pos.y;
        if (!f.seen) { f.lo = f.hi = f.y = y; f.seen = true; }
        f.lo = y < f.lo ? y : f.lo + (y - f.lo) * Math.min(1, dt * 0.25);
        f.hi = y > f.hi ? y : f.hi + (y - f.hi) * Math.min(1, dt * 0.25);
        f.since += dt;
        if (sounds) heard(f, y, dt, speed, walk, run, size);
        const range = f.hi - f.lo;
        if (range < 0.03 || speed < 0.3) { f.up = false; continue; }          // standing: feet stay planted
        if (y > f.lo + range * 0.55) f.up = true;
        else if (f.up && y < f.lo + range * 0.28) {
          f.up = false;
          const d = level.waterDepthAt(footPos.x, footPos.z, footPos.y);      // (at the foot's height: under a bridge, the water there, not its deck's none)
          if (d > 0.04 && f.since > 0.18 && level.ripple) {
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
