// player-spells.js
// Her spells in the game (since 22 Nov 2026: "เอาท่าโจมตีพื้นฐานที่เคยทำ ไว้กับท่ากางบาเรียลงเมนหลักด้วยค่ะ ท่าโจมตีกลาง
// อากาศยังไม่ต้อง"): the magic combo's moves on the ground (magic-combo.js; her moves magic-combo-game-anim.js, its light
// magic-combo-fx.js) and the water barrier (her move: the clip 'barrier', barrier-anim.js; its water: barrier-fx.js).
// And since 23 Nov 2026 ("ขึ้นเมนเกมหลักค่ะ", of the trial on spear-rain.html) the spear rain, ฝนหอก: the lance she holds
// thrown up into the sky instead of straight (spear-rain.js is the move, spear-rain-fx.js what is seen, spear-rain-anim.js
// her throw; spear-rain-sounds.js and charge-hum.js what is heard).
// What she casts and when, and the camera over her shoulder while she holds the lance; nothing else. Where she may go
// while a move takes her is player-moves.js' (her body in the world); the buttons are index.html's. Every character.
//
//   const spells = createPlayerSpells({ character, comboFx, barrierFx, renderer, camera, cam, sounds, spearRain, rainFx, rainSounds, hum })
//   (spearRain: spear-rain.js' createSpearRain, and rainFx: spear-rain-fx.js' createSpearRainFx(),
//   or neither: no spear rain, and nothing of it need be loaded; rainSounds: spear-rain-sounds.js', hum: charge-hum.js',
//   or none: it is not heard. They are kept as loud as `sounds` is)
//   (sounds: her sounds, step-sounds.js, or none: the four casts heard, each timed to leave her hand with its sound's blow,
//   and the lance: its circle as it opens, its blast as it is let go)
//   spells.attack(), spells.release()   the attack button down, up: tapped, the four casts; held, the lance; on the run,
//                                       the leap. (Keyboard: J, player-input.js)
//   spells.skyward()                    the attack button, held, is flicked up (or its badge tapped; R): the lance she holds
//                                       is thrown into the sky and comes down as a rain of spears before her. Remembered a
//                                       moment, so flicked just before the lance is in her hand it goes up as soon as it is.
//                                       spells.skyReady: she holds the lance and the sky is free (for the page's badge)
//   spells.roll()                       the roll button: the roll, and the attack button in it the rising cast (K)
//   spells.barrier()                    the barrier button: she casts the dome of water round her where she stands (B)
//   every frame, before her clips are played:
//     spells.step(dt, me, world)  -> true while she is in a spell (a move of the combo, or casting the barrier): her
//        clips are its, she does not walk. me: { pos, vel, heading }: it turns her and moves her where a move takes her
//        (the caller keeps her out of things). world: { grounded, stick: { x, z, amount }, ground(x, z) }. Not grounded
//        (in the air, climbing, swimming, deep in water) nothing begins; the casts in the air are not in the game yet
//   every frame, once she is placed (her bones where they will be drawn): spells.after(dt, me)
//   every frame, after her camera: spells.look(dt, me, k)   holding the lance it comes in over her right shoulder, as
//                                       on the trial page; the finisher, the leap's ring and the barrier jolt it; the
//                                       lance thrown up, it turns up to the seal and comes down with the spears. And the
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
// the held cast's camera, as on the trial page (magic-combo.html): behind her on the line from what she aims at through
// her, above, a little to her right, and LOOKING AT WHAT SHE AIMS AT, so that it is in the middle of the picture, she low
// and to the left of it, the lance going off up the picture to it. (It looked at her, from further to her right and turned
// away from her aim, after a picture: on an upright phone what she aimed at was then out of the picture or at its edge:
// "ไม่ชอบมุมกล้องนี้เลย ไม่เห็นมอน", 22 Nov 2026.)
// dist, pitch: where it goes (m at 1.75 m, radians); side: how far to her right (m at most; across: of the picture's
// half width at her, so on an upright phone she stays in it); far: with nothing to aim at, she aims so far ahead of her
// (m); look, most: where it looks: on the line from her shoulders to what she aims at, so much of the way, and no
// further from her than `most` m (so that she is in the picture however far it is); fov: how much narrower the picture
// (degrees, more the more the lance has grown); in, out: how fast it goes there and back (1/s)
const AIM_CAM = { dist: 4.8, pitch: 0.38, side: 1.6, across: 0.5, far: 9, look: 0.7, most: 4.6, fov: 6, in: 5, out: 3.5 };
// the spear rain's camera, as on its trial page (spear-rain.html): as the lance goes up and the seal opens the picture
// turns up to it (look: how far of the way, the most; under: it looks so far under the seal, m; back: and draws so far
// back, m), and comes down again with the spears; a long rain keeps it a little up for as long. in, out: how fast (1/s)
const SKY_CAM = { look: 0.72, back: 1.5, under: 1.6, in: 3.4, out: 2.2 };

export function createPlayerSpells({ character: first, comboFx, barrierFx = null, renderer = null, camera, cam, sounds = null, spearRain = null, rainFx = null, rainSounds = null, hum = null }) {
  let character = first;
  const combo = createMagicCombo({ character, marks: MAGIC_COMBO, fx: comboFx });
  const none = [];
  let world = { grounded: false, stick: { x: 0, z: 1, amount: 0 }, ground: () => -1e5, targets: none };
  let castT = -1, waterT = -1, wantBarrier = 0;      // s into her barrier cast (-1: none); into its water (it outlasts her move)
  const at = new THREE.Vector3(), hand = new THREE.Vector3(), side = new THREE.Vector3();
  const aimTo = new THREE.Vector3(), aimAt = new THREE.Vector3(), aimLook = new THREE.Vector3();      // what she aims at; the same, followed softly; where the camera looks
  let hold = null;                                   // the hand the barrier is cast from
  const handOf = () => character.model.getObjectByName('J_Bip_L_Middle1') || character.model.getObjectByName('J_Bip_L_Hand');
  hold = handOf();
  // the camera: how far in over her shoulder (0..1), where it was before, the picture's width before; the jolt
  let aimK = 0, aimWas = null, fov0 = camera.fov, shake = 0, clock = 0;
  combo.onLand = kind => { if (kind === 'big' || kind === 'ring') shake = 1; };
  // the four casts heard ("เสียงนี้ ท่าคอมโบปกติ"): each as it begins, timed so its blow comes as the cast leaves her hand
  combo.onBegin = (i, hit) => { if (i >= 0 && sounds && sounds.cast) sounds.cast(i + 1, hit); };
  // ... and the lance: its circle as it opens, its blast as it is let go (the clip's own sound, step-sounds.js)
  // (and, held long, the low hum of its circle turning, until it is let go: charge-hum.js)
  combo.onLance = (what, hit) => { if (sounds && sounds.lance) sounds.lance(what, hit); if (hum) hum.lance(what, hit); };
  // ---- the spear rain (spear-rain.js; none without spearRain and rainFx): the lance she holds, thrown up. It stands beside the combo
  // and takes the lance out of its hand; her move is its own. Made anew for each character (it holds her bones)
  let sky = null, skyK = 0, rainFall = 0, rainLast = 0, loud = -1;      // (skyK: how far the picture is turned up; rainFall, rainLast: s into the rain that its first spear is let go, its last lands)
  const skyFocus = new THREE.Vector3(), skyFrom = new THREE.Quaternion(), skyTo = new THREE.Quaternion();
  function skyFor(who) {
    if (!spearRain || !rainFx) return null;
    const s = spearRain({ character: who, combo, marks: MAGIC_COMBO, rain: rainFx });
    s.onThrow = lead => { if (rainSounds) rainSounds.begin(lead); };
    s.onLaunch = info => { rainFall = info.when.fall; rainLast = info.when.last; if (rainSounds) rainSounds.rain(info.when, 1); };
    s.onCancel = () => { if (rainSounds) rainSounds.stop(); };
    s.onLand = kind => { if (kind === 'great') shake = 1.2; };
    return s;
  }
  sky = skyFor(character);

  const casting = () => castT >= 0;
  const spells = {
    get active() { return combo.active || casting() || (!!sky && sky.active); },
    get aiming() { return combo.aiming; },
    get held() { return Math.max(combo.held, 0.75 * barrierHeld()); },
    get upside() { return combo.upside; },
    get beat() { return casting() ? 'บาเรียน้ำ' : sky && sky.active ? sky.name : combo.beat; },
    get combo() { return combo; },                   // (for a test, or the console)
    get barrierT() { return waterT; },
    get sky() { return sky; },                       // (the spear rain, for a test or the console; none without rainFx)
    get skyReady() { return !!sky && !casting() && sky.ready; },
    attack() { if (!casting() && (!sky || sky.press())) combo.attack(); },      // (a press while the lance she is throwing up is still in her hand is swallowed)
    skyward() { if (sky && !casting()) sky.flick(); },
    release() { combo.release(); },
    roll() { if (!casting()) combo.dodge(); },
    barrier() { if (character.actions[BARRIER_CLIP]) wantBarrier = PRESS; },
    stop() { combo.stop(); if (sky) sky.stop(); castT = -1; wantBarrier = 0; },      // (a rain already thrown up comes down all the same)
    setCharacter(next) {
      spells.stop();
      character = next;
      combo.setCharacter(next);
      sky = skyFor(next);
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
      if (wantBarrier > 0 && world.grounded && !combo.active && !(sky && sky.active) && waterT < 0) {
        wantBarrier = 0;
        combo.stop();                                // (a press of the others just before is let go)
        if (character.state === BARRIER_CLIP) character.play('idle', 0);
        character.play(BARRIER_CLIP, 0.1, false);
        castT = 0; waterT = 0;
        // where it stands: her feet, or wading, the water's surface over them (on the riverbed its sheet over the ground
        // and the foot of its dome were under the water, and the water hid them)
        at.copy(me.pos);
        at.y = Math.max(at.y, world.ground(at.x, at.z));
        me.vel.set(0, 0, 0);
        return true;
      }
      // (the spear rain first: it takes the lance out of the combo's hand, and the combo is stepped all the same, for
      // what it has in flight)
      const skying = sky ? sky.step(dt, me, world) : false;
      return combo.step(dt, me, world) || skying;
    },
    after(dt, me) {
      combo.after(dt, me, world);
      if (sky) sky.after(dt, me, world);             // (the lance in her hand as she winds up, and let go)
      if (hold) hold.getWorldPosition(hand);         // (her bones were brought up to date by combo.after)
    },
    look(dt, me, k) {
      clock += dt;
      // ---- holding the lance: in behind her on the line from what she aims at, above, a little to her right, looking
      // at what she aims at; thrown, back to where it was
      const aiming = combo.aiming, ease = Math.min(1, dt * (aiming ? AIM_CAM.in : AIM_CAM.out));
      if (aimK === 0 && !aiming) fov0 = camera.fov;  // (the page's own: 55, or 70 on an upright phone)
      aimK += ((aiming ? 1 : 0) - aimK) * ease;
      if (aiming) {
        // what she aims at: the middle of the thing she holds the lance at; with none, so far ahead of her the way she faces
        const t = combo.target;
        if (t) aimTo.set(t.pos.x, t.pos.y + t.height * 0.62, t.pos.z);
        else aimTo.set(me.pos.x + Math.sin(me.heading) * AIM_CAM.far * k, me.pos.y + 1.1 * k, me.pos.z + Math.cos(me.heading) * AIM_CAM.far * k);
        if (!aimWas) { aimWas = { pitch: cam.pitch, dist: cam.dist }; aimAt.copy(aimTo); } else aimAt.lerp(aimTo, Math.min(1, dt * 8));
        const behind = Math.atan2(me.pos.x - aimAt.x, me.pos.z - aimAt.z);
        cam.turn(Math.atan2(Math.sin(behind - cam.yaw), Math.cos(behind - cam.yaw)) * ease, (AIM_CAM.pitch - cam.pitch) * ease);
        cam.zoom((AIM_CAM.dist - cam.dist) * ease);
      } else if (aimWas) {
        cam.turn(0, (aimWas.pitch - cam.pitch) * ease); cam.zoom((aimWas.dist - cam.dist) * ease);
        if (aimK < 0.02) { cam.turn(0, aimWas.pitch - cam.pitch); cam.zoom(aimWas.dist - cam.dist); aimWas = null; aimK = 0; }
      }
      if (aimK > 0) {
        camera.fov = fov0 - AIM_CAM.fov * aimK * (0.55 + 0.15 * Math.max(0, combo.charge));
        camera.updateProjectionMatrix();
        const half = cam.dist * k * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;      // half the picture's width, at her
        // to her right (the follow camera, player-camera.js, closes so much of the way to its own place each frame and
        // carries the rest on: added by that much each frame, it comes to this far in all, at any pace)
        const step = Math.min(AIM_CAM.side * k, AIM_CAM.across * half) * aimK * Math.min(1, dt * 14);
        camera.position.addScaledVector(side.set(1, 0, 0).applyQuaternion(camera.quaternion), step);
        // ... and from there it looks at what she aims at (not at her, as the follow camera does)
        aimLook.set(me.pos.x, me.pos.y + character.height * 0.82, me.pos.z);
        const away = aimLook.distanceTo(aimAt);
        camera.lookAt(aimLook.lerp(aimAt, away > 1e-3 ? aimK * Math.min(AIM_CAM.look, AIM_CAM.most * k / away) : 0));
      } else if (camera.fov !== fov0) { camera.fov = fov0; camera.updateProjectionMatrix(); }
      // ---- the lance thrown up: up to the seal as it goes up and the seal opens, down again with the spears
      if (sky) {
        const rt = rainFx.time;
        const want = rt < 0 ? (sky.active ? 0.3 : 0) : rt < rainFall ? 1 : Math.max(0, 0.42 * (1 - Math.max(0, rt - Math.max(rainFall + 0.9, rainLast - 0.7)) / 0.8));
        skyK += (want - skyK) * Math.min(1, dt * (want > skyK ? SKY_CAM.in : SKY_CAM.out));
        if (skyK > 0.002) {
          if (rainFx.busy) skyFocus.copy(rainFx.portal).y -= SKY_CAM.under * k;
          else skyFocus.set(me.pos.x + Math.sin(me.heading) * 4.6 * k, me.pos.y + 6 * k, me.pos.z + Math.cos(me.heading) * 4.6 * k);
          camera.position.addScaledVector(side.set(0, 0, 1).applyQuaternion(camera.quaternion), SKY_CAM.back * k * skyK * Math.min(1, dt * 14));
          skyFrom.copy(camera.quaternion);
          camera.lookAt(skyFocus);
          skyTo.copy(camera.quaternion);
          camera.quaternion.slerpQuaternions(skyFrom, skyTo, skyK * SKY_CAM.look);
        } else skyK = 0;
      }
      // ---- the jolt: the finisher's burst and a leap's ring, briefly; the barrier's water breaking out and landing; the
      // great spear's
      shake = Math.max(0, shake - dt / 0.22);
      const a = 0.06 * shake * shake, b = barrierFx ? barrierFx.shake * 0.045 : 0;
      if (a > 0 || b > 0) {
        camera.position.x += Math.sin(clock * 91) * a + (Math.sin(clock * 91) + Math.sin(clock * 57)) * b;
        camera.position.y += Math.sin(clock * 123 + 1) * a + (Math.sin(clock * 73) + Math.cos(clock * 41)) * b;
      }
      // ---- drawn from where the camera now is
      comboFx.update(dt, camera);
      if (rainFx) rainFx.update(dt, camera);
      // (and the spear rain and the lance's hum as loud as her other sounds are set: sound-settings.js sets those)
      if (sounds && sounds.volume !== loud) { loud = sounds.volume; if (rainSounds) rainSounds.volume = loud; if (hum) hum.volume = loud; }
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
