// player-climb-top.js
// Her way over a cliff's top, climbing (player-moves.js): Mixamo's "Climbing To Top", posed again for her
// (climb-top-anim.js, made by tools/make-climb-top-anim.py), fitted to the real cliff. Her right hand takes the edge,
// she walks her feet up the rock, her left hand goes onto the top, she pushes up off a high foot, her right knee comes
// up, she steps onto her right foot and stands up on it, her left comes up beside it: 1.2 s, then into her standing pose
// (or, the stick held, on into her run once both feet are down).
//
// The clip is in place: CLIMB_TOP.up and .along are her root's way (hips heights, per frame) from where it begins, WALL
// off a flat wall, to the top, edge.in in from its edge. Fitted to the real cliff (a heightmap: a steep slope, never a
// flat wall, its top rounded), as studios do it ("motion warping"):
//   - where it begins: her root where she climbs. Under a lower top (a ledge taken from the ground) further into the
//     clip: where the clip's top is as high over her root as the real one is (no further than her knee coming up);
//   - how far up and in: the clip's way, from there, scaled to end on the real top edge.in in from its real edge;
//   - her hands and feet (two-bone IK after the clip's pose, every frame): her right hand on the real edge, her left on
//     the real top, a foot that holds the rock on it (not in it, not off it), her feet down where the top really is, and
//     never through the land.
//
//   planClimbTop({ root, dx, dz, edge, hh, standAt, footing, mirror }, out) -> out (out.clip: the clip to play)
//      root: where her root is, climbing (a THREE.Vector3); dx, dz: the way into the rock over the ground (unit);
//      edge: { x, z }, the first ground over the face (player-climb.js, face.top); hh: her hips' height (m);
//      mirror: her left hand goes to the edge (it was the one up as she climbed), the clip's mirror
//   climbTopAt(plan, c, out) -> out: c s into the clip: out.x, out.y, out.z (her root), out.tilt (0..1: how much of her
//      lean to the rock she still has: none by the time she stands on the top)
//   const ik = createClimbTopIK(character); every frame after her pose and place are set: ik.apply(plan, c, fade) -> how
//      far (m) her knees, elbows or hips are in the rock's face (a sheer one: its corner), for her to be held off it by

import * as THREE from 'three';
import { CLIMB_TOP } from './climb-top-anim.js';
import { reach } from './player-vault.js';

export const CLIMB_TOP_CLIP = 'climb_top', CLIMB_TOP_MIRROR = 'climb_top_m';      // (the mirror: her left hand to the edge)
export const CLIMB_TOP_TIMES = CLIMB_TOP;

const FPS = CLIMB_TOP.fps;
const N = CLIMB_TOP.up.length;
const FADE = 0.08;              // s a hold is taken or let go of over
const TAIL = 0.15;              // s her hands and feet are let go of once she is off (her run or her standing pose blending in)
const START = 0.15;             // s her hands and feet are taken over as she begins (the clip blending in over as long)
const smooth = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const at = (arr, c) => {
  const f = Math.min(N - 1, Math.max(0, c * FPS)), i = Math.min(N - 2, Math.floor(f)), u = f - i;
  return arr[i] + (arr[i + 1] - arr[i]) * u;
};
const window = (c, [a, b], fade = FADE) => smooth((c - a) / fade + 1) * (1 - smooth((c - b) / fade));
// the latest the clip begins (a low ledge: her right knee coming up onto it)
const LATEST = CLIMB_TOP.kneeUp;

export function planClimbTop({ root, dx, dz, edge, hh, standAt, footing, mirror = false }, out) {
  // where she ends: edge.in in from the edge, on the ground (nearer the edge if that is not ground)
  const inward = CLIMB_TOP.edge.in * hh;
  let ex = edge.x + dx * inward, ez = edge.z + dz * inward;
  for (const f of [0.75, 0.5, 0.3, 0.12]) {
    if (!footing || footing(ex, ez) === 'ground') break;
    ex = edge.x + dx * inward * f; ez = edge.z + dz * inward * f;
  }
  const ey = standAt(ex, ez);
  // where in the clip she begins: the clip's top as high over her root as the real one (a low ledge: further in)
  const high = (ey - root.y) / hh, rise = CLIMB_TOP.rise;
  let c0 = 0;
  if (high < rise) {
    let i = 0;
    const last = Math.floor(LATEST * FPS);
    while (i < last && rise - CLIMB_TOP.up[i + 1] > high) i++;
    const a = rise - CLIMB_TOP.up[i], b = rise - CLIMB_TOP.up[i + 1];
    c0 = Math.min(LATEST, (i + Math.min(1, Math.max(0, (a - high) / Math.max(1e-6, a - b)))) / FPS);
  }
  out.c0 = c0; out.hh = hh; out.dx = dx; out.dz = dz;
  out.x0 = root.x; out.y0 = root.y; out.z0 = root.z;
  out.x1 = ex; out.y1 = ey; out.z1 = ez;
  out.up0 = at(CLIMB_TOP.up, c0); out.along0 = at(CLIMB_TOP.along, c0);
  out.upAll = Math.max(1e-3, rise - out.up0); out.alongAll = Math.max(1e-3, CLIMB_TOP.ahead - out.along0);
  out.edgeX = edge.x; out.edgeZ = edge.z; out.top = standAt(edge.x, edge.z);
  out.end = CLIMB_TOP.duration;
  out.down = Math.max(CLIMB_TOP.down.left[1], CLIMB_TOP.down.right[1]);      // both feet down on the top
  out.standAt = standAt;
  out.tilt0 = leanLeft(c0);
  out.mirror = mirror; out.clip = mirror ? CLIMB_TOP_MIRROR : CLIMB_TOP_CLIP;
  out.ok = true;
  return out;
}

export function climbTopAt(p, c, out) {
  const py = (at(CLIMB_TOP.up, c) - p.up0) / p.upAll, pz = (at(CLIMB_TOP.along, c) - p.along0) / p.alongAll;
  out.x = p.x0 + (p.x1 - p.x0) * pz;
  out.z = p.z0 + (p.z1 - p.z0) * pz;
  out.y = p.y0 + (p.y1 - p.y0) * py;
  // her lean to the rock (on a face less than sheer) goes as she comes up over the top: none once she kneels on it
  out.tilt = p.tilt0 > 0.05 ? Math.min(1, leanLeft(c) / p.tilt0) : 1 - smooth((c - p.c0) / 0.2);
  return out;
}
function leanLeft(c) { return 1 - smooth((c - CLIMB_TOP.kneeUp + 0.25) / 0.3); }

// ---- her hands and feet on the real rock
const _p = new THREE.Vector3(), _t = new THREE.Vector3();

// The rock's face at height y on the line through (x, z) the way (dx, dz): how far along it (m) the land first stands as
// high as y going into the rock (from inside it: going out, < 0). null: none within reach
function faceAlong(standAt, x, z, y, dx, dz, reach) {
  const inside = standAt(x, z) > y, dir = inside ? -1 : 1, crossed = t => (standAt(x + dx * t, z + dz * t) > y) !== inside;
  let a = 0, b = null;
  for (let s = 0.03; s <= reach + 1e-9; s += 0.03) { if (crossed(s * dir)) { b = s * dir; break; } a = s * dir; }
  if (b === null) return null;
  for (let i = 0; i < 10; i++) { const m = (a + b) / 2; if (crossed(m)) b = m; else a = m; }
  return (a + b) / 2;
}

export function createClimbTopIK(character) {
  const bone = n => character.model.getObjectByName(n);
  const chain = (s, kind) => kind === 'arm'
    ? [bone(`J_Bip_${s}_UpperArm`), bone(`J_Bip_${s}_LowerArm`), bone(`J_Bip_${s}_Hand`), bone(`J_Bip_${s}_Middle1`)]
    : [bone(`J_Bip_${s}_UpperLeg`), bone(`J_Bip_${s}_LowerLeg`), bone(`J_Bip_${s}_Foot`), bone(`J_Bip_${s}_ToeBase`)];
  const arms = { right: chain('R', 'arm'), left: chain('L', 'arm') }, legs = { right: chain('R', 'leg'), left: chain('L', 'leg') };
  const ok = [...Object.values(arms), ...Object.values(legs)].every(c => c.every(Boolean));
  const middles = [arms.right[1], arms.left[1], legs.right[1], legs.left[1], bone('J_Bip_C_Hips')].filter(Boolean);
  const held = new Map();        // where a hold was taken: name -> THREE.Vector3
  let plan = null, lastC = -1;
  // the land's way out (unit normal) at x, z; and how far p is inside it, along that (m; < 0: outside)
  const n = new THREE.Vector3();
  const normalAt = (standAt, x, z) => {
    const e = 0.08, gx = (standAt(x + e, z) - standAt(x - e, z)) / (2 * e), gz = (standAt(x, z + e) - standAt(x, z - e)) / (2 * e);
    return n.set(-gx, 1, -gz).normalize();
  };
  const depth = (standAt, q) => (standAt(q.x, q.z) - q.y) * normalAt(standAt, q.x, q.z).y;
  return {
    apply(p, c, fade = 1) {
      if (!ok || !p) return 0;
      fade *= smooth((c - p.c0) / START);      // (as she begins, from where she was: her climbing, her run at a ledge)
      if (p !== plan || c < lastC) { plan = p; held.clear(); }
      lastC = c;
      const hh = p.hh, standAt = p.standAt, T = CLIMB_TOP;
      const as = side => (p.mirror ? (side === 'right' ? 'left' : 'right') : side);      // (the clip's times are climb_top's)
      const edgeHand = as(T.edgeHand);
      character.object.updateMatrixWorld(true);
      // ---- her hands: the right on the edge, the left on the top. Where it is as it takes hold, brought in over the
      // edge (a hand ahead of a rounded top would hold air) and put on the land
      for (const side of ['right', 'left']) {
        const w = window(c, T.hand[as(side)]) * fade, key = side + 'Hand';
        if (w <= 0) { held.delete(key); continue; }
        const [up, lo, en, tip] = arms[side];
        if (!held.has(key)) {
          tip.getWorldPosition(_p);
          const over = (_p.x - p.edgeX) * p.dx + (_p.z - p.edgeZ) * p.dz, want = (side === edgeHand ? T.palm : 0.15) * hh;
          if (over < want) _p.addScaledVector(_t.set(p.dx, 0, p.dz), want - over);
          _p.y = standAt(_p.x, _p.z) + T.palm * hh;
          held.set(key, _p.clone());
        }
        reach(up, lo, en, tip, held.get(key), w);
      }
      // ---- her feet
      for (const side of ['right', 'left']) {
        const [up, lo, en, tip] = legs[side];
        let onRock = 0;
        // holding the rock: where it took hold, put on the rock's face at that height (its toes' joint toeTip off it,
        // her way into the rock); no face near enough: it holds nothing
        T.wall[as(side)].forEach((win, i) => {
          const w = window(c, win) * fade, key = side + 'Wall' + i;
          if (w <= 0 || win[0] < p.c0 + 0.05) { held.delete(key); return; }      // (a hold taken before she began: her foot is where her climbing put it)
          if (!held.has(key)) {
            tip.getWorldPosition(_p);
            const t = faceAlong(standAt, _p.x, _p.z, _p.y, p.dx, p.dz, 0.6 * hh);
            held.set(key, t === null ? null : _p.clone().add(_t.set(p.dx, 0, p.dz).multiplyScalar(t - T.toeTip * hh)));
          }
          if (!held.get(key)) return;
          reach(up, lo, en, tip, held.get(key), w);
          onRock = Math.max(onRock, w);
        });
        // down on the top: from where the clip puts it, on the land under it (the clip's top is flat; the real one is not)
        const d1 = T.down[as(side)][1], key = side + 'Down';
        const w = smooth((c - d1 + 0.12) / 0.12) * fade;
        if (w > 0) {
          if (!held.has(key) || c < d1) {
            tip.getWorldPosition(_p);
            _p.y += standAt(_p.x, _p.z) - p.y1;
            held.set(key, _p.clone());
          }
          reach(up, lo, en, tip, held.get(key), w);
        } else held.delete(key);
        // never through the land: her toes and her ankle drawn out of it (her knee bending more)
        if (onRock < 1) {
          for (const [joint, clear] of [[tip, T.sole + 0.01], [en, 0.07]]) {
            joint.getWorldPosition(_p);
            const d = depth(standAt, _p) + clear * hh;
            if (d > 0.002) {
              tip.getWorldPosition(_t).addScaledVector(normalAt(standAt, _p.x, _p.z), d * (1 - onRock));
              reach(up, lo, en, tip, _t, 1);
            }
          }
        }
      }
      // ---- her knees, elbows and hips in the rock's face (below its top: a knee on the top is where it should be): how
      // far, out of it her way back from the rock
      let inside = 0;
      for (const j of middles) {
        j.getWorldPosition(_p);
        if (_p.y > p.top - 0.08 * hh || standAt(_p.x, _p.z) <= _p.y) continue;
        const t = faceAlong(standAt, _p.x, _p.z, _p.y, p.dx, p.dz, 0.3);
        if (t !== null) inside = Math.max(inside, -t);
      }
      return inside * fade;
    },
    TAIL,
  };
}
