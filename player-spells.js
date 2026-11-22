// player-spells.js
// Her spells in the game (since 22 Nov 2026: "เอาท่าโจมตีพื้นฐานที่เคยทำ ไว้กับท่ากางบาเรียลงเมนหลักด้วยค่ะ ท่าโจมตีกลาง
// อากาศยังไม่ต้อง"): the magic combo's moves on the ground (magic-combo.js; her moves magic-combo-game-anim.js, its light
// magic-combo-fx.js) and the water barrier (her move: the clip 'barrier', barrier-anim.js; its water: barrier-fx.js).
// What she casts and when, and the camera over her shoulder while she holds the lance; nothing else. Where she may go
// while a move takes her is player-moves.js' (her body in the world); the buttons are index.html's. Every character.
//
//   const spells = createPlayerSpells({ character, comboFx, barrierFx, renderer, camera, cam, sounds })
//   (sounds: her sounds, step-sounds.js, or none: the four casts heard, each timed to leave her hand with its sound's blow)
//   spells.attack(), spells.release()   the attack button down, up: tapped, the four casts; held, the lance; on the run,
//                                       the leap. (Keyboard: J, player-input.js)
//   spells.roll()                       the roll button: the roll, and the attack button in it the rising cast (K)
//   spells.barrier()                    the barrier button: she casts the dome of water round her where she stands (B)
//   every frame, before her clips are played:
//     spells.step(dt, me, world)  -> true while she is in a spell (a move of the combo, or casting the barrier): her
//        clips are its, she does not walk. me: { pos, vel, heading }: it turns her and moves her where a move takes her
//        (the caller keeps her out of things). world: { grounded, stick: { x, z, amount }, ground(x, z) }. Not grounded
//        (in the air, climbing, swimming, deep in water) nothing begins; the casts in the air are not in the game yet
//   every frame, once she is placed (her bones where they will be drawn): spells.after(dt, me)
//   every frame, after her camera: spells.look(dt, me, k)   holding the lance it comes in over her right shoulder, as
//                                       on the trial page; the finisher, the leap's ring and the barrier jolt it. And the
//                                       light and the water are drawn from where the camera now is
//   spells.active (in a spell), spells.aiming (the lance: the look is not the player's to drag), spells.held, spells.upside
//   (her hair and skirt held harder; how far she is upside down: for character.holdSprings), spells.beat (what she is
//   doing, for a label), spells.stop() (she is taken out of it), spells.setCharacter(next)
//
// The barrier: she stands while she casts it (BARRIER.end, 3.3 s, the clip's length: lifted 29 cm by the clip, arms
// wide); the water goes on to BARRIER.gone (4.1 s) where she cast it, whatever she does then; not again until it has
// gone. Not in the middle of a move of the combo; while she casts it, the attack and roll buttons do nothing.
// The combo's rules are magic-combo.js'; there is nothing to hit in the game yet (world.targets: none), so what she
// casts goes the way she faces and bursts where it meets the ground or runs out.

import * as THREE from 'three';
import { createMagicCombo } from './magic-combo.js';
import { MAGIC_COMBO } from './magic-combo-game-anim.js';
import { BARRIER } from './barrier-fx.js';

const BARRIER_CLIP = 'barrier';
const PRESS = 0.15;           // s a press of the barrier button is remembered (as the jump's)
// the held cast's camera, as on the trial page (magic-combo.html): in over her right shoulder and along the lance.
// dist, pitch: where it goes (m at 1.75 m, radians); side: how far to her right (m at most; across: of the picture's
// half width at her, so on an upright phone she stays in it); fov: how much narrower the picture (degrees, more the more
// the lance has grown); in, out: how fast it goes there and back (1/s)
const AIM_CAM = { dist: 3.3, pitch: 0.1, side: 0.55, across: 0.4, fov: 6, in: 5, out: 3.5 };
const EASED = 14 / 60;        // what the follow camera (player-camera.js) closes of the gap in a frame at 60 a second: the
                              // trial page added the side step every frame on top of it, so it was carried; added here as
                              // much as that comes to at any pace

export function createPlayerSpells({ character: first, comboFx, barrierFx = null, renderer = null, camera, cam, sounds = null }) {
  let character = first;
  const combo = createMagicCombo({ character, marks: MAGIC_COMBO, fx: comboFx });
  const none = [];
  let world = { grounded: false, stick: { x: 0, z: 1, amount: 0 }, ground: () => -1e5, targets: none };
  let castT = -1, waterT = -1, wantBarrier = 0;      // s into her barrier cast (-1: none); into its water (it outlasts her move)
  const at = new THREE.Vector3(), hand = new THREE.Vector3(), side = new THREE.Vector3();
  let hold = null;                                   // the hand the barrier is cast from
  const handOf = () => character.model.getObjectByName('J_Bip_L_Middle1') || character.model.getObjectByName('J_Bip_L_Hand');
  hold = handOf();
  // the camera: how far in over her shoulder (0..1), where it was before, the picture's width before; the jolt
  let aimK = 0, aimWas = null, fov0 = camera.fov, shake = 0, clock = 0;
  combo.onLand = kind => { if (kind === 'big' || kind === 'ring') shake = 1; };
  // the four casts heard ("เสียงนี้ ท่าคอมโบปกติ"): each as it begins, timed so its blow comes as the cast leaves her hand
  combo.onBegin = (i, hit) => { if (i >= 0 && sounds && sounds.cast) sounds.cast(i + 1, hit); };

  const casting = () => castT >= 0;
  const spells = {
    get active() { return combo.active || casting(); },
    get aiming() { return combo.aiming; },
    get held() { return Math.max(combo.held, 0.75 * barrierHeld()); },
    get upside() { return combo.upside; },
    get beat() { return casting() ? 'บาเรียน้ำ' : combo.beat; },
    get combo() { return combo; },                   // (for a test, or the console)
    get barrierT() { return waterT; },
    attack() { if (!casting()) combo.attack(); },
    release() { combo.release(); },
    roll() { if (!casting()) combo.dodge(); },
    barrier() { if (character.actions[BARRIER_CLIP]) wantBarrier = PRESS; },
    stop() { combo.stop(); castT = -1; wantBarrier = 0; },
    setCharacter(next) {
      spells.stop();
      character = next;
      combo.setCharacter(next);
      hold = handOf();
    },
    step(dt, me, w) {
      world = { ...w, targets: none };
      wantBarrier = Math.max(0, wantBarrier - dt);
      if (waterT >= 0) { waterT += dt; if (waterT > BARRIER.gone) waterT = -1; }
      if (casting()) {
        // casting the barrier: she stands where she is until the clip is over
        castT += dt;
        if (castT >= BARRIER.end || !world.grounded) { castT = -1; return false; }
        return true;
      }
      if (wantBarrier > 0 && world.grounded && !combo.active && waterT < 0) {
        wantBarrier = 0;
        combo.stop();                                // (a press of the others just before is let go)
        if (character.state === BARRIER_CLIP) character.play('idle', 0);
        character.play(BARRIER_CLIP, 0.1, false);
        castT = 0; waterT = 0;
        at.copy(me.pos);
        me.vel.set(0, 0, 0);
        return true;
      }
      return combo.step(dt, me, world);
    },
    after(dt, me) {
      combo.after(dt, me, world);
      if (hold) hold.getWorldPosition(hand);         // (her bones were brought up to date by combo.after)
    },
    look(dt, me, k) {
      clock += dt;
      // ---- holding the lance: in behind her the way she aims, low, over her right shoulder; thrown, back to where it was
      const aiming = combo.aiming, ease = Math.min(1, dt * (aiming ? AIM_CAM.in : AIM_CAM.out));
      if (aimK === 0 && !aiming) fov0 = camera.fov;  // (the page's own: 55, or 70 on an upright phone)
      aimK += ((aiming ? 1 : 0) - aimK) * ease;
      if (aiming) {
        if (!aimWas) aimWas = { pitch: cam.pitch, dist: cam.dist };
        const behind = me.heading + Math.PI;
        cam.turn(Math.atan2(Math.sin(behind - cam.yaw), Math.cos(behind - cam.yaw)) * ease, (AIM_CAM.pitch - cam.pitch) * ease);
        cam.zoom((AIM_CAM.dist - cam.dist) * ease);
      } else if (aimWas) {
        cam.turn(0, (aimWas.pitch - cam.pitch) * ease); cam.zoom((aimWas.dist - cam.dist) * ease);
        if (aimK < 0.02) { cam.turn(0, aimWas.pitch - cam.pitch); cam.zoom(aimWas.dist - cam.dist); aimWas = null; aimK = 0; }
      }
      if (aimK > 0) {
        camera.fov = fov0 - AIM_CAM.fov * aimK * (0.55 + 0.15 * Math.max(0, combo.charge));
        camera.updateProjectionMatrix();
        const half = camera.position.distanceTo(me.pos) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;      // half the picture's width, at her
        const step = Math.min(AIM_CAM.side * k, AIM_CAM.across * half) * aimK * Math.min(1, dt * 14) / EASED;
        camera.position.addScaledVector(side.set(1, 0, 0).applyQuaternion(camera.quaternion), step);
      } else if (camera.fov !== fov0) { camera.fov = fov0; camera.updateProjectionMatrix(); }
      // ---- the jolt: the finisher's burst and a leap's ring, briefly; the barrier's water breaking out and landing
      shake = Math.max(0, shake - dt / 0.22);
      const a = 0.06 * shake * shake, b = barrierFx ? barrierFx.shake * 0.045 : 0;
      if (a > 0 || b > 0) {
        camera.position.x += Math.sin(clock * 91) * a + (Math.sin(clock * 91) + Math.sin(clock * 57)) * b;
        camera.position.y += Math.sin(clock * 123 + 1) * a + (Math.sin(clock * 73) + Math.cos(clock * 41)) * b;
      }
      // ---- drawn from where the camera now is
      comboFx.update(dt, camera);
      if (barrierFx) barrierFx.update(dt, renderer, camera, waterT, at, hand);
    },
  };
  // her hair held stiffer while she is lifted and let down (left loose it flew up into two horns as she came down)
  function barrierHeld() {
    if (castT < 0) return 0;
    return THREE.MathUtils.smoothstep(castT, BARRIER.burst - 0.1, BARRIER.burst + 0.1) * (1 - THREE.MathUtils.smoothstep(castT, BARRIER.end - 0.4, BARRIER.end));
  }
  return spells;
}
