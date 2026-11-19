// player-vault.js
// Her vault over a fence, a parapet, a barrel: a motion capture (vault-anim.js, made by tools/make-vault-anim.py from
// Mixamo's "Vault Over Box" and "Jumping Down"), fitted to the thing she goes over. She runs at it, plants her left hand on
// its top, springs up with her right foot on it and her left knee drawn up, pushes off it forward and drops down past it,
// and runs on (or, the stick let go, rises from the landing).
//
// The clip is made over a flat ground with a top VAULT.top hips heights high, and in place: VAULT.along is how far she
// goes along her way, per frame. Fitted to a real thing (player-hurdle.js finds it: its near and far sides along her way,
// its top), three things are moved, as studios do it ("motion warping"):
//   - when it begins: as many of the clip's run-up steps are left out as put her hand on the near side of the top; begun
//     nearer than the run-up allows, her steps to it are drawn in (a little);
//   - how high she goes: from the moment her left foot leaves the ground until she pushes off the top, her body is raised
//     (or lowered) by how much higher the real top is than the clip's; in the air after, it goes back;
//   - how far: over something deep she goes further in the air after pushing off, enough to come down clear past it.
// Then her hand and her right foot are put on the top (two-bone IK on her arm and leg, after the clip's pose: limbs
// differ from one character to the next and from the capture's).
//
//   findHurdle (player-hurdle.js) finds the thing before her; vaultLead(h, hh) -> metres: how near to it (as h.from) she
//      begins, running (the clip's run-up from its first frame)
//   planVault(h, { speed, hh, k, y0, y1 }, out) -> out, or null (no room past it to come down)
//      hh: her hips' height (m); y0: the ground she is on; y1: the ground past it, where she comes down
//   vaultAt(plan, c, out) -> out: c seconds into the clip: out.along (m along her way from where it began), out.y (her
//      feet's height: the ground's, and how much she is raised), out.rate (how fast the clip plays here)
//   const ik = createVaultIK(character); every frame after her pose and place are set: ik.apply(plan, c, start, dx, dz)
//
// The clip's times (VAULT): her hand on the top from hand.from to hand.to, her right foot from foot.from to foot.to, her
// left foot off the ground at offGround, off the top at push, down at touch.

import * as THREE from 'three';
import { VAULT } from './vault-anim.js';

const FPS = 30;
const BODY0 = 0.28;            // her own half-width (player-hurdle.js), at Vivi's modelled size
const INSET = 0.18;            // her hand and foot this far in from the top's near and far sides (m), or in its middle if thinner
const CLEAR = 0.3;             // her feet come down at least this far past the far side (m)
const LATE = 0.32;             // begun nearer than her run-up allows: at most this much of the clip left out (s: up to her take-off step)
const PACE = [0.85, 1.35];     // the run-up played at her pace: no slower, no faster than this
const RATE = 1.1;              // the vault itself, from her hand on the top on
const FLY = 0.6;               // over something deep, each FLY metres she must go further in the air after the top make the
                               // flight that much longer (a higher arc, under the same gravity), down to FLY_MIN of its pace
const FLY_MIN = 0.55;
const G = 9.8, CLIP_HIPS = 0.917;   // the gravity the clip's flight was made under, on a skeleton with its hips this high (m)
const smooth = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };

// the clip's travel at c seconds (hips heights)
function alongAt(c) {
  const f = Math.min(VAULT.along.length - 1, Math.max(0, c * FPS)), i = Math.min(VAULT.along.length - 2, Math.floor(f)), u = f - i;
  return VAULT.along[i] + (VAULT.along[i + 1] - VAULT.along[i]) * u;
}
// the clip's run-up pace (hips heights a second), before her hand goes down
const RUNUP = alongAt(VAULT.hand.from) / VAULT.hand.from;

export const VAULT_CLIP = 'vault';
export const VAULT_TIMES = VAULT;

// how near the thing's collider she is (h.from) when a running vault from the clip's first frame begins
export function vaultLead(h, hh, k) {
  const body = BODY0 * k, near = h.from + body, far = h.to - body, inset = Math.min(INSET, (far - near) / 2);
  return VAULT.hand.along * hh - body - inset;
}

export function planVault(h, { speed, hh, k, y0, y1 = y0 }, out) {
  const body = BODY0 * k, near = h.from + body, far = Math.max(near, h.to - body), inset = Math.min(INSET, (far - near) / 2);
  const hand = near + inset;
  // where in the clip it begins: as much of the run-up left out as puts her hand at `hand` (no more than LATE of it);
  // what is still to make up, her steps to it are drawn in or out by (warp, m)
  const want = VAULT.hand.along * hh - hand;                          // the clip's travel to leave out (m)
  let c0 = 0;
  if (want > 0) {
    const n = Math.floor(LATE * FPS);
    let i = 0;
    while (i < n && VAULT.along[i + 1] * hh < want) i++;
    const a0 = VAULT.along[i] * hh, a1 = VAULT.along[i + 1] * hh;
    c0 = Math.min(LATE, (i + Math.min(1, Math.max(0, (want - a0) / Math.max(1e-6, a1 - a0)))) / FPS);
  }
  const lead = alongAt(c0) * hh, warp = lead - want;
  // how far she goes: her feet down clear past the far side
  const landAt = VAULT.landAlong * hh - lead + warp;                 // where her leading foot comes down, from where she is (m)
  const hips0 = alongAt(VAULT.touch) * hh - lead + warp;              // where she is as she comes down, as the clip has it
  const more = Math.max(0, far + CLEAR - landAt, h.to + 0.03 - hips0); // (and all of her clear of it: walking on, she would be pushed out)
  const hipsLand = hips0 + more;
  if (hipsLand + body > h.to + h.room - 0.05) return null;           // no room past it
  out.c0 = c0; out.warp = warp; out.more = more; out.lead = lead; out.hh = hh;
  out.near = near; out.far = far; out.hand = hand;
  out.foot = Math.min(Math.max(VAULT.foot.along * hh - lead + warp, near + inset), far - inset);
  out.top = h.top; out.y0 = y0; out.y1 = y1;
  out.raise = h.top - (y0 + VAULT.top * hh);                          // how much higher the real top is than the clip's
  out.pace = Math.min(PACE[1], Math.max(PACE[0], speed / (RUNUP * hh)));
  // the flight off the top: longer over something deep (the clip played slower through it, and a higher arc added: the
  // same gravity, more time in the air), as long as the clip's over a fence
  out.fly = Math.max(FLY_MIN, 1 / (1 + more / FLY));
  out.flight = (VAULT.touch - VAULT.push) / (RATE * out.fly);         // s in the air, off the top
  out.g = G * hh / CLIP_HIPS * RATE * RATE;                           // the clip's gravity, played at RATE (m/s²)
  out.end = VAULT.touch;                                              // (the game decides when she runs on)
  return out;
}

// how fast the clip plays at c: the run-up at her pace, easing to RATE as her hand goes down; the flight slower over
// something deep
export function rateAt(p, c) {
  const u = smooth((c - (VAULT.hand.from - 0.12)) / 0.2), f = c > VAULT.push && c < VAULT.touch ? p.fly : 1;
  return (p.pace + (RATE - p.pace) * u) * f;
}

export function vaultAt(p, c, out) {
  const warpU = p.c0 >= VAULT.hand.from ? 1 : smooth((c - p.c0) / (VAULT.hand.from - p.c0));
  const u = Math.min(1, Math.max(0, (c - VAULT.push) / (VAULT.touch - VAULT.push)));       // how far through the flight
  out.along = (alongAt(c) - alongAt(p.c0)) * p.hh + p.warp * warpU + p.more * u;          // (further at one pace: it is a flight)
  // raised by how much higher the top is from her take-off, held through the first half of the flight; and over
  // something deep, the higher arc of a longer flight
  const up = smooth((c - VAULT.offGround + 0.02) / 0.18) * (1 - smooth((u - 0.45) / 0.55));
  const t = u * p.flight, arc = 0.5 * p.g * (1 - p.fly * p.fly) * t * (p.flight - t);
  out.y = p.y0 + (p.y1 - p.y0) * smooth(u) + p.raise * up + arc;
  out.rate = rateAt(p, c);
  out.down = c >= VAULT.touch;
  return out;
}

// ---- her hand and foot on the top: two-bone IK on the posed model, in the world
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _keep = new THREE.Quaternion();

// turn bone (in the world) so that the direction from -> to
function turnBone(bone, from, to) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(_v.copy(from).normalize(), _w.copy(to).normalize());
  bone.getWorldQuaternion(_qw);
  _qw.premultiply(_q);
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}

// upper -> lower -> end: end's tip (a joint under end, the palm or the toes) brought to target by w (0..1), end keeping
// its turn in the world; bent the way it already bends
function reach(upper, lower, end, tip, target, w) {
  if (w <= 0) return;
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c);
  tip.getWorldPosition(_p);
  end.getWorldQuaternion(_keep);
  // where the end joint must go for the tip to be on the target (the hand, the foot held as they are)
  _t.copy(target).sub(_p).multiplyScalar(w).add(_c);
  const la = _a.distanceTo(_b), lb = _b.distanceTo(_c);
  _v.copy(_t).sub(_a);
  const d = Math.min(Math.max(_v.length(), Math.abs(la - lb) + 1e-4), la + lb - 1e-4);
  const dir = _v.normalize().clone();
  // the bend: where the middle joint is now, off the line to the target
  _n.copy(_b).sub(_a);
  _n.addScaledVector(dir, -_n.dot(dir));
  if (_n.lengthSq() < 1e-8) return;
  _n.normalize();
  const cos = (la * la + d * d - lb * lb) / (2 * la * d), sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  const mid = _w.copy(_a).addScaledVector(dir, la * cos).addScaledVector(_n, la * sin).clone();
  turnBone(upper, _v.copy(_b).sub(_a), mid.clone().sub(_a));
  lower.getWorldPosition(_b); end.getWorldPosition(_c);
  turnBone(lower, _v.copy(_c).sub(_b), _t.clone().sub(_b));
  end.parent.getWorldQuaternion(_qp);
  end.quaternion.copy(_qp.invert().multiply(_keep));
  end.updateMatrixWorld(true);
}

export function createVaultIK(character) {
  const bone = n => character.model.getObjectByName(n);
  const arm = [bone('J_Bip_L_UpperArm'), bone('J_Bip_L_LowerArm'), bone('J_Bip_L_Hand'), bone('J_Bip_L_Middle1')];
  const leg = [bone('J_Bip_R_UpperLeg'), bone('J_Bip_R_LowerLeg'), bone('J_Bip_R_Foot'), bone('J_Bip_R_ToeBase')];
  const legL = [bone('J_Bip_L_UpperLeg'), bone('J_Bip_L_LowerLeg'), bone('J_Bip_L_Foot'), bone('J_Bip_L_ToeBase')];
  const ok = arm.every(Boolean) && leg.every(Boolean) && legL.every(Boolean);
  const handAt = new THREE.Vector3(), footAt = new THREE.Vector3();
  let handSet = false, footSet = false, plan = null;
  const sole = () => VAULT.sole * (character.hipsHeight || 1) * (character.size || 1);
  const sideOf = (o, start, dx, dz) => { o.getWorldPosition(_p); return (_p.x - start.x) * dz - (_p.z - start.z) * dx; };      // her left of her way (m)
  return {
    // weights at c: her hand on the top, her foot on the top (0..1)
    weights(c) {
      const H = VAULT.hand, F = VAULT.foot;
      return [smooth((c - H.from + 0.03) / 0.1) * (1 - smooth((c - H.to + 0.1) / 0.1)),
        smooth((c - F.from + 0.02) / 0.08) * (1 - smooth((c - F.to + 0.08) / 0.08))];
    },
    apply(p, c, start, dx, dz) {
      if (!ok) return;
      if (p !== plan) { plan = p; handSet = footSet = false; }
      const [wh, wf] = this.weights(c);
      character.object.updateMatrixWorld(true);
      // where they go: across her way, where the clip has them as they first touch; along it, the plan's; up, the top
      if (wh > 0) {
        if (!handSet) {
          const s = sideOf(arm[3], start, dx, dz);
          handAt.set(start.x + dx * p.hand + dz * s, p.top + 0.02, start.z + dz * p.hand - dx * s);
          handSet = true;
        }
        reach(arm[0], arm[1], arm[2], arm[3], handAt, wh);
      }
      if (wf > 0) {
        if (!footSet) {
          const s = sideOf(leg[3], start, dx, dz);
          footAt.set(start.x + dx * p.foot + dz * s, p.top + sole(), start.z + dz * p.foot - dx * s);
          footSet = true;
        }
        reach(leg[0], leg[1], leg[2], leg[3], footAt, wf);
      }
      // her feet over the top, not through it: a foot (its toes, its heel) under the top while over it is drawn up, the
      // knee bending more (the clip's top is flat and its own height; a real one may be deeper, or not)
      if (c > VAULT.hand.from) {
        for (const [i, chain] of [legL, leg].entries()) {
          if (i === 1 && wf >= 1) continue;
          let lift = 0;
          for (const [joint, clear] of [[chain[3], sole() + 0.012], [chain[2], 0.075]]) {
            joint.getWorldPosition(_p);
            const a = (_p.x - start.x) * dx + (_p.z - start.z) * dz;
            if (a > p.near - 0.12 && a < p.far + 0.12) lift = Math.max(lift, p.top + clear - _p.y);
          }
          if (lift > 0.002) {
            chain[3].getWorldPosition(_t2).y += lift;
            reach(chain[0], chain[1], chain[2], chain[3], _t2, 1);
          }
        }
      }
    },
  };
}
