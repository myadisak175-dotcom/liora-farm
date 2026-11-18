/* ==========================================================================
   magic-jump.js  —  Vivi's magic jump: up to four jumps in one flight, each off a magic circle that opens under her feet
   (magic-circle-fx.js). The others fly; she jumps. Her body in the air, and the jump's own rules; nothing else.

     const air = createMagicJump({ character, circles })
     air.takeOff(me)                 the jump button on the ground: the first jump (a small circle on the ground)
     air.drop(me)                    she walked off an edge: falling, three jumps left
     air.press(me, stick)            the jump button in the air: the next one, if she has one left (false: none)
     every frame she is in the air (air.active), after she has been moved across the ground:
       air.step(dt, me, stick, ground)  -> 'landed' on the frame she comes down (her clip is the landing's then)
     every frame, after character.update(dt) and once she is placed (her object at her feet, turned to her heading):
       air.pose(dt, me)              turns her body (the flip, the spin) and her arms (the flick, the tuck, the spread)
     air.held                        0..1: how hard her hair and skirt should be held now: a little all through a flight (a
                                     long fall would blow her skirt up), hard through the flip and the spin
     air.upside                      0..1: how far she is upside down (her hair and skirt should not hang by their weight then)
     air.tier, air.beat              how many jumps this flight; what she is doing now (for a label)

   me: { pos (her feet, world), vel (her speed over the ground: x, z), heading }, the page's, changed here.
   stick: { x, z, amount }: where the stick points over the ground (unit) and how far it is pushed (0..1).
   ground: the height of what is under her now.

   The four jumps (numbers for a girl 1.75 m tall; a smaller or bigger one gets them in her own size):
     1  off the ground: the game's take-off clip                                  rises HEIGHTS[0]
     2  her knee driven up, her hand flicked down at the circle she kicks off      rises HEIGHTS[1] more
     3  a front flip, tucked, her hands at her shins                              rises HEIGHTS[2] more
     4  a full turn with her arms spread wide, hanging longest at the top          rises HEIGHTS[3] more
   Each a little less than the one before: it is a jump, not flying. Each in the air waits WINDUP s first (her knees come
   up, she stops falling), then she kicks and the circle opens under her.
   Where she goes: with the stick pushed, each jump sends her the way it points at a run's pace (PUSH: no faster than she
   runs, or four jumps would carry her over any gap), and she turns to face it. With the stick let go she goes straight up,
   keeping only a little of the way she was going (KEEP), so she can come down on a ledge's top and not overshoot it.
   Between jumps the stick only steers a little (AIR).
   A long fall (more than CUSHION m) is caught: a circle opens on the ground under her before she reaches it and slows her.
   ========================================================================== */
import * as THREE from 'three';

export const MAGIC_JUMP = {
  heights: [1.4, 1.19, 0.98, 0.84],   // m each jump rises (100%, 85%, 70%, 60%): 4.4 m up in all, at the top of each
  grav: 17,                           // m/s²: a little floatier than the game's walk-off jump (24.8 at 1.75 m)
  hang: 0.45, hangTop: 0.25, hangV: 1.8,   // near the top of a jump (slower than hangV m/s up or down) gravity is cut to this (the 4th: hangTop)
  fall: 14,                           // m/s: the fastest she falls
  push: 4.2,                          // m/s over the ground that a jump with the stick pushed sends her (her run)
  keep: 0.35,                         // of her speed over the ground kept by a jump with the stick let go
  air: 1.4,                           // how quickly the stick steers her between jumps (1/s)
  windup: 0.07,                       // s before an air jump's kick: her knees come up, she stops falling
  gap: 0.12,                          // s after a kick before the next press counts
  flip: 0.5,                          // s the 3rd jump's flip takes
  spin: 0.62,                         // s the 4th jump's turn takes
  cushion: 2.6,                       // m: a fall from higher than this is caught by a circle on the ground
  catchV: 4.0,                        // m/s: how fast she comes down onto it
};
const M = MAGIC_JUMP;
const REF = 1.75;
const START_RATE = 1.8, START_AT = 0.06;             // the take-off clip, as the game plays it (player-moves.js)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const smoother = u => { u = clamp(u, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
const outCubic = u => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// where her arms go, in her own frame (she faces +Z, her left is +X, up is +Y): [upper arm, forearm] for her left arm;
// the right arm is the mirror (x the other way)
const ARMS = {
  flickR: [[0.42, -0.82, 0.38], [0.3, -0.86, 0.42]],       // (for her right) her hand flung down at the circle, the arm straight
  flickL: [[0.62, 0.32, -0.42], [0.45, 0.62, -0.25]],      // her left thrown up and back, to balance it
  tuck: [[0.2, -0.55, 0.8], [0.05, -0.9, 0.35]],           // hands at her shins
  spread: [[1, 0.18, -0.08], [1, 0.3, -0.04]],             // straight out, a little up
  fall: [[0.68, -0.62, 0.2], [0.5, -0.38, 0.5]],           // falling: held out a little, low
};
// and her legs falling: [thigh, shin] for her left leg, hanging under her, a little bent (the clip's falling pose has a knee
// up, which with a long fall lifts her skirt)
const LEGS = { fall: [[0.07, -0.96, 0.22], [0.02, -0.93, -0.3]] };

export function createMagicJump({ character, circles }) {
  let ch = character;
  let active = false, tier = 0, t = 0, wind = -1, nextDir = null, nextAmount = 0, vy = 0, peak = 0, caught = false, fell = 0, turnT = 0;
  let queued = null;                          // a press made mid-flip: kept until she is round, then jumped
  let beat = '';
  const w = { flick: 0, tuck: 0, spread: 0, fall: 0 };            // how far each arm pose is laid over her clip now
  let held = 0, upside = 0, flipA = 0, spinA = 0;
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), cur = new THREE.Vector3(), want = new THREE.Vector3();
  const q = new THREE.Quaternion(), qt = new THREE.Quaternion(), qy = new THREE.Quaternion(), qf = new THREE.Quaternion(), P = new THREE.Quaternion(), Pi = new THREE.Quaternion(), objQ = new THREE.Quaternion();
  const ONE = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
  let bones = null;
  const findBones = () => {
    const g = n => ch.model.getObjectByName(n);
    bones = { hips: g('J_Bip_C_Hips') };
    for (const s of ['L', 'R']) {
      bones[s] = [g(`J_Bip_${s}_UpperArm`), g(`J_Bip_${s}_LowerArm`), g(`J_Bip_${s}_Hand`)];
      bones[s + 'leg'] = [g(`J_Bip_${s}_UpperLeg`), g(`J_Bip_${s}_LowerLeg`), g(`J_Bip_${s}_Foot`)];
    }
  };
  // the clips her air jumps use, as copies of their own: a jump can then blend into the same moves the one before it was
  // still in (the 2nd's kick is the take-off clip again; the 3rd and 4th both start tucked)
  const COPIES = { mj_kick: 'jump_start', mj_tuck: 'hop', mj_tuck4: 'hop' };
  const addCopies = () => {
    for (const [name, from] of Object.entries(COPIES)) {
      if (ch.actions[name] || !ch.actions[from]) continue;
      const c = ch.mixer.clipAction(ch.actions[from].getClip().clone());
      c.setLoop(THREE.LoopOnce, 1); c.clampWhenFinished = true;
      ch.actions[name] = c;
    }
  };
  findBones(); addCopies();
  const size = () => (ch.height || REF) / REF;
  const speedFor = h => Math.sqrt(2 * M.grav * size() * h * size());

  function aim(bone, child, dir, mirror, k) {
    if (k <= 0.001 || !bone || !child) return;
    bone.getWorldPosition(a); child.getWorldPosition(b);
    cur.subVectors(b, a).normalize();
    want.set(dir[0] * mirror, dir[1], dir[2]).normalize().applyQuaternion(objQ);
    qt.setFromUnitVectors(cur, want);
    q.slerpQuaternions(ONE, qt, k);
    bone.parent.getWorldQuaternion(P);
    Pi.copy(P).invert();
    bone.quaternion.premultiply(P).premultiply(q).premultiply(Pi);
    bone.updateMatrixWorld(true);
  }
  function arms(pose, k, side = 'both', limb = '') {
    for (const s of side === 'both' ? ['L', 'R'] : [side]) {
      const [u, l, h] = bones[s + limb], m = s === 'L' ? 1 : -1;
      aim(u, l, pose[0], m, k);
      aim(l, h, pose[1], m, k);
    }
  }

  const air = {
    get active() { return active; }, get tier() { return tier; }, get held() { return held; }, get upside() { return upside; }, get beat() { return beat; },
    setCharacter(next) { ch = next; findBones(); addCopies(); },
    takeOff(me) {
      active = true; tier = 1; t = 0; wind = -1; caught = false; fell = 0; queued = null;
      vy = speedFor(M.heights[0]); peak = me.pos.y;
      ch.play('jump_start', 0.08, false);
      if (ch.actions.jump_start) ch.actions.jump_start.time = START_AT;
      ch.setRate(START_RATE);
      circles.open(v.set(me.pos.x, me.pos.y + 0.02, me.pos.z), 1, { ground: true, size: size() });
      beat = 'ชั้น 1';
    },
    // walking off a rock's top: falling, with the first jump as good as used (three are left)
    drop(me) {
      active = true; tier = 1; t = 1; wind = -1; caught = false; fell = 0; queued = null;
      vy = 0; peak = me.pos.y;
      ch.play('jump_air', 0.2, false);
      beat = '';
    },
    press(me, stick) {
      if (!active || tier >= 4 || wind >= 0 || t < M.gap) return false;
      // mid-flip she cannot kick: the press waits until she is the right way up
      if (tier === 3 && t < M.flip - M.windup) { queued = { x: stick.x, z: stick.z, amount: stick.amount }; return true; }
      queued = null;
      wind = M.windup;
      nextAmount = stick.amount;
      nextDir = stick.amount > 0.12 ? [stick.x, stick.z] : null;
      // her knees come up for the kick: the next jump's clip starts now
      const n = tier + 1;
      if (n === 2) { ch.play('mj_kick', 0.06, false); ch.actions.mj_kick.time = 0.2; ch.setRate(1.5); }
      else { const c = n === 3 ? 'mj_tuck' : 'mj_tuck4'; ch.play(c, 0.06, false); ch.actions[c].time = n === 3 ? 0.14 : 0.2; ch.setRate(1.3); }
      return true;
    },
    step(dt, me, stick, ground) {
      const k = size();
      t += dt;
      if (queued && t >= M.flip - M.windup) air.press(me, queued);
      // ---- the kick: after the wind-up, off the circle that opens under her
      if (wind >= 0) {
        wind -= dt;
        vy = Math.max(vy, -0.5 * k);
        if (wind < 0) {
          tier++; t = 0; fell = 0;
          vy = speedFor(M.heights[tier - 1]);
          if (nextDir) {
            const s = M.push * k * Math.max(0.6, Math.min(1, nextAmount / 0.72));
            me.vel.set(nextDir[0] * s, 0, nextDir[1] * s);
            turnT = 0.18;
          } else me.vel.multiplyScalar(M.keep);
          circles.open(v.set(me.pos.x, me.pos.y - 0.02, me.pos.z), tier, { ground: false, size: k });
          if (tier === 4) { ch.play('jump_air', 0.18, false); ch.actions.jump_air.time = 0.35; ch.setRate(1); }
          beat = ['', 'ชั้น 1', 'ชั้น 2 · สะบัดมือ', 'ชั้น 3 · ตีลังกา', 'ชั้น 4 · หมุนตัว'][tier];
        }
      }
      // ---- steering: at a kick she turns at once to where it sends her (even if the stick has been let go since the press);
      // between kicks the stick only nudges her
      if (turnT > 0 && nextDir) me.heading += wrap(Math.atan2(nextDir[0], nextDir[1]) - me.heading) * Math.min(1, dt * 16);
      else if (stick.amount > 0.12) {
        const want = Math.atan2(stick.x, stick.z);
        me.heading += wrap(want - me.heading) * Math.min(1, dt * 4);
        if (turnT <= 0) {
          const s = M.push * k * Math.min(1, stick.amount / 0.72);
          me.vel.x += (stick.x * s - me.vel.x) * Math.min(1, dt * M.air);
          me.vel.z += (stick.z * s - me.vel.z) * Math.min(1, dt * M.air);
        }
      } else if (turnT <= 0) me.vel.multiplyScalar(Math.exp(-0.5 * dt));
      turnT -= dt;
      // ---- up and down: a slower pull near the top of each jump, so she hangs there a moment
      const g = M.grav * k, slow = Math.abs(vy) < M.hangV * k ? THREE.MathUtils.lerp(tier === 4 ? M.hangTop : M.hang, 1, Math.abs(vy) / (M.hangV * k)) : 1;
      if (wind < 0) vy -= g * slow * dt;
      vy = Math.max(vy, -M.fall * k);
      // a long fall: a circle opens on the ground under her, and she comes down onto it slowly
      if (!caught && vy < 0 && peak - ground > M.cushion * k && me.pos.y - ground < 1.0 * k - vy * 0.12) {
        caught = true;
        circles.open(v.set(me.pos.x, ground + 0.02, me.pos.z), 'land', { ground: true, size: k });
      }
      if (caught && vy < -M.catchV * k) vy += (-M.catchV * k - vy) * Math.min(1, dt * 14);
      me.pos.y += vy * dt;
      peak = Math.max(peak, me.pos.y);
      if (vy < 0) fell += dt;
      // ---- her clips
      const st = ch.state;
      if (st === 'jump_start' || st === 'mj_kick') {
        const c = ch.actions[st];
        if (c.time >= c.getClip().duration - 0.02) ch.play('jump_air', 0.2, false);
        else ch.setRate(st === 'jump_start' ? START_RATE : 1.5);
      } else if (st === 'mj_tuck4') ch.setRate(1.3);
      else if (st === 'mj_tuck') {
        const c = ch.actions.mj_tuck;
        // the 3rd: held tucked through the flip, then let out of it; the 4th's wind-up only borrows its knees
        const flipping = tier === 3 && wind < 0 && t < M.flip;
        if (flipping && c.time >= 0.42) ch.setRate(0);
        else ch.setRate(1.3);
        if (tier === 3 && wind < 0 && t >= M.flip && (c.time >= 0.78 || vy < -1.5 * k)) ch.play('jump_air', 0.25, false);
      } else if (st === 'jump_air') ch.setRate(1);
      if (vy < 0 && t > 0.25) beat = fell > 0.4 ? 'ลง' : beat;
      // ---- down
      if (me.pos.y <= ground) {
        if (vy > 0) { me.pos.y = ground; return null; }      // rising past a higher step: carried up with it
        me.pos.y = ground;
        active = false; tier = 0; wind = -1; vy = 0; queued = null; beat = caught ? 'วงเวทรับ' : '';
        ch.play('jump_land', 0.06, false);
        return 'landed';
      }
      return null;
    },
    pose(dt, me) {
      const obj = ch.object;
      // ---- which pose her arms are in, and how far: each eased in and out so nothing jumps
      const ease = (key, to, rate) => { w[key] += (to - w[key]) * Math.min(1, dt * rate); };
      // (each jump's count goes up at its kick: so these run on through the next jump's wind-up)
      const flick = active && tier === 2 && t < 0.3 ? (t < 0.08 ? 1.15 : 1) : 0;
      const tuck = active && tier === 3 && t < M.flip - 0.06 ? 1 : 0;
      const spread = active && tier === 4 && t < M.spin + 0.18 ? 1 : 0;
      const fall = active && vy < -1.5 && !flick && !tuck && !spread ? 0.6 : 0;
      ease('flick', flick, flick ? 30 : 7);
      ease('tuck', tuck, tuck ? 18 : 14);
      ease('spread', spread, spread ? 14 : 6);
      ease('fall', fall, 4);
      // ---- her body turned: the flip (about her hips, head over heels forward), the spin (about her up)
      const flipTo = active && tier === 3 ? Math.PI * 2 * smoother((t - 0.02) / M.flip) : 0;
      const spinTo = active && tier === 4 ? Math.PI * 2 * outCubic(t / M.spin) : 0;
      flipA = flipTo >= Math.PI * 2 - 1e-3 || (!active) ? 0 : flipTo;
      spinA = spinTo >= Math.PI * 2 - 1e-3 || (!active) ? 0 : spinTo;
      held += ((flipA > 0 ? 1 : spinA > 0 ? 0.8 : active ? 0.6 : 0) - held) * Math.min(1, dt * 12);
      upside += ((flipA > 0 ? 1 : 0) - upside) * Math.min(1, dt * 14);
      if (flipA > 0 || spinA > 0) {
        obj.updateMatrixWorld(true);
        bones.hips.getWorldPosition(a);
        obj.parent.worldToLocal(a);                        // her hips, where the page stands her (not yet turned)
        qy.copy(obj.quaternion);
        qf.setFromAxisAngle(X, flipA);
        q.setFromAxisAngle(Y, spinA);
        qf.premultiply(q);                                 // the spin about her up, then the flip about her side
        obj.quaternion.copy(qy).multiply(qf);
        b.copy(a).applyQuaternion(Pi.copy(qy).invert()).applyQuaternion(obj.quaternion);
        obj.position.add(a).sub(b);                        // turned about her hips, not her feet
      }
      obj.updateMatrixWorld(true);
      obj.getWorldQuaternion(objQ);
      // ---- her arms over the clip
      if (w.flick > 0.001) { arms(ARMS.flickR, Math.min(1, w.flick), 'R'); arms(ARMS.flickL, Math.min(1, w.flick) * 0.8, 'L'); }
      if (w.tuck > 0.001) arms(ARMS.tuck, w.tuck);
      if (w.spread > 0.001) arms(ARMS.spread, w.spread);
      if (w.fall > 0.001) { arms(ARMS.fall, w.fall); arms(LEGS.fall, w.fall * 0.9, 'both', 'leg'); }
      // ---- the ribbon round her legs: from the 2nd jump until she has been falling a while
      circles.trail(active && tier >= 2 && fell < 0.35, me.pos, size());
    },
    // for a test: the state of the jump now
    get debug() { return { tier, t, wind, vy, peak, caught, flipA, spinA, w: { ...w } }; },
  };
  return air;
}
