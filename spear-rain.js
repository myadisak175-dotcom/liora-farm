/* ==========================================================================
   spear-rain.js  —  the held cast thrown up into the sky: the spear rain (ฝนหอก). The move itself: when it begins,
   what her body does, where it rains and what a landing spear does to what stands there. All that is seen of it is
   spear-rain-fx.js. A trial's for now (spear-rain.html): the game does not have it.

   Asked for on 23 Nov 2026: "ตั้งใจจะทำเป็นโจมตีแบบกดค้างแล้วเลื่อนขึ้นบน (เป็นปุ่มพิเศษ) แล้วมันก็จะปาหอกขึ้นฟ้าเป็น aoe ส่วน
   ปาหอกธรรมดาเป็นทะลวง ใช้หอกอันเดิมได้นะ". So: the attack button held is the lance, as ever (magic-combo.js: let go, it
   is thrown straight and goes through everything); held and flicked up, the lance she holds is thrown into the sky
   instead, and comes down as a rain of spears on what she was aiming at.

   It stands beside the combo and changes nothing in it (the combo was being worked on by another hand the same
   night): it watches for the lance in her hand (combo.charge), takes it out of the combo's hand (combo.stop: the
   circle before her breaks up) and is a move of its own from there.

     const sky = createSpearRain({ character, combo, marks: MAGIC_COMBO, rain })      rain: createSpearRainFx()
     sky.flick()                     the attack button, held, is flicked up (remembered a moment: flicked before the
                                     lance is in her hand, it goes up as soon as it is)
     sky.press()                     the attack button goes down (the lance gone, a press is her first cast: the move
                                     ends there). Returns false while the press is the move's own to swallow (the
                                     lance not yet thrown): the page then does not pass it on to the combo
     every frame, before combo.step:  sky.step(dt, me, world) -> true while she is in the move (the page leaves her
                                     walking alone; the combo is still stepped, for what it has in flight)
     every frame, after combo.after:  sky.after(dt, me, world)      the lance twirled in her hand, and let go
     sky.active, sky.fired           she is in the move; the lance has left her hand
     sky.ready                       she holds the lance and the sky is free: a flick would throw it up (for a page's
                                     special button)
     sky.hits                        spears landed on something, of the rain that is coming down (0 a while after)
     sky.onThrow = hit => …          she begins it (hit: s from now that the lance leaves her hand), for a sound
     sky.onLand = (kind, at) => …    'rain': a spear has landed; 'great': the great spear has
     me, world: as magic-combo.js' (world.targets, world.ground, world.stick)

   The move: she drops and sweeps her arm up (the rising cast's clip), the lance going round her hand with a band of
   water after it, coming upright, and leaves her hand straight up `let` s in. She is free again `again` s in (a press
   is her first cast, the stick walks her on). Where it rains: on what she was aiming at when she flicked (not further
   than `far`), with nothing to aim at a little way before her. More spears and wider the more the lance had grown.
   Each spear hits what stands where it lands; the great spear, last, all under the seal, and throws it up. Not again
   until the last of the rain is down (rain.busy).
   ========================================================================== */
import * as THREE from 'three';

// clip: her move; let: s into it that the lance leaves her hand (her arm straight up); again: from then on a press or
// the stick ends it; free: s more before the stick does; turns: times the lance goes round her hand first; up: from so
// far into the twirl it comes upright; tilt: how far up the lance pointed as she held it (magic-combo.js' CHARGE.tilt);
// grip: her hand holds it so far behind its point, of its length (CHARGE.grip); long: its length by how grown it is
// (m at 1.75 m: magic-combo-fx.js' SHOTS.lance.long); far: a target further than this (m), it rains before her instead;
// ahead: with none, so far before her (m); power: a spear's blow by how grown the lance was; great: the great spear's;
// fade: s her clip is blended in; remember: s a flick is remembered; count: s the count of spears landed stays up
export const SKY = { clip: 'mc_rise', let: 0.3, again: 0.46, free: 0.12, turns: 1.2, up: 0.5, tilt: 0.7, grip: 0.6, long: [0.75, 1.05, 1.4, 1.8],
  far: 12, ahead: 4.6, power: [0.6, 0.8, 1, 1.3], great: [3, 4, 5, 7], fade: 0.06, remember: 1.2, count: 1.6, name: 'ฝนหอก' };

export function createSpearRain({ character, combo, marks, rain }) {
  const bone = n => character.model.getObjectByName(n);
  const hand = bone('J_Bip_R_Middle1') || bone('J_Bip_R_Hand');
  const size = () => character.height / 1.75;
  const can = () => !!character.actions[SKY.clip] && !!marks.clips[SKY.clip];
  const at = new THREE.Vector3(), aim = new THREE.Vector3(), v = new THREE.Vector3(), want = new THREE.Vector3();
  let move = null, flicked = 0, pressed = false, seen = null, level = 0, hits = 0, hitsT = 0;
  const handAt = out => { character.object.updateWorldMatrix(true, true); return hand.getWorldPosition(out); };

  // the rain: where a spear lands, what stands there is hit (the great spear: all under the seal, and thrown up)
  rain.onStrike = s => {
    for (const t of (seen && seen.targets) || []) {
      const dx = t.pos.x - s.at.x, dz = t.pos.z - s.at.z, d = Math.hypot(dx, dz);
      if (d > s.radius + t.radius || Math.abs(t.pos.y - s.at.y) > 3 * size()) continue;
      t.hit({ power: s.great ? SKY.great[level] : SKY.power[level], x: dx / (d || 1), z: dz / (d || 1), launch: s.great, kind: s.great ? 'great' : 'rain' });
      hits++; hitsT = SKY.count;
    }
    if (sky.onLand) sky.onLand(s.great ? 'great' : 'rain', s.at);
  };

  const sky = {
    onThrow: null, onLand: null,
    get active() { return !!move; },
    get fired() { return !!move && move.fired; },
    get ready() { return combo.charge >= 0 && !rain.busy && can(); },
    get hits() { return hits; },
    get name() { return SKY.name; },
    flick() { flicked = SKY.remember; },
    press() { if (move && !move.fired) return false; pressed = true; return true; },
    stop() { move = null; flicked = 0; pressed = false; },
    step(dt, me, world) {
      seen = world;
      flicked = Math.max(0, flicked - dt);
      if (hitsT > 0) { hitsT -= dt; if (hitsT <= 0) hits = 0; }
      if (!move) {
        pressed = false;
        if (!(flicked > 0 && sky.ready)) return false;
        // the lance is taken out of the combo's hand (its circle breaks up, its light there goes), and she sweeps it up
        const t = combo.target, grown = combo.charge;
        handAt(at);
        aim.set(Math.sin(me.heading), 0, Math.cos(me.heading));
        if (t) aim.set(t.pos.x - at.x, 0, t.pos.z - at.z).normalize();
        combo.stop();
        if (character.state === SKY.clip) character.play('idle', 0);
        character.play(SKY.clip, SKY.fade, false);
        move = { t: 0, m: marks.clips[SKY.clip], level: grown, target: t, fired: false, from: Math.atan2(aim.x, aim.z) };
        flicked = 0; hits = 0;
        me.vel.set(0, 0, 0);
        if (sky.onThrow) sky.onThrow(SKY.let);
        return true;
      }
      move.t += dt;
      // a roll, or anything else the combo has begun: the move is over (the lance not yet thrown is lost)
      if (combo.active) { move = null; return false; }
      const walked = world.stick && world.stick.amount > 0.5 && move.t >= SKY.again + SKY.free;
      if (move.t >= move.m.dur || (move.fired && move.t >= SKY.again && (pressed || walked))) { move = null; return false; }
      return true;
    },
    after(dt, me, world) {
      if (!move || move.fired) return;
      const k = size(), long = SKY.long[move.level] * k;
      handAt(at);
      // round her hand, fast at first; then upright
      const u = Math.min(1, move.t / SKY.let), turn = move.from + SKY.turns * 6.2832 * (1 - (1 - u) * (1 - u));
      const up = Math.min(1, Math.max(0, (u - SKY.up) / (1 - SKY.up))), e = up * up * (3 - 2 * up);
      aim.set(Math.sin(turn) * (1 - e), SKY.tilt * (1 - Math.min(1, u * 3)) * (1 - e) + 1.6 * e, Math.cos(turn) * (1 - e)).normalize();
      rain.hold(v.copy(at).addScaledVector(aim, long * SKY.grip), aim, long, Math.min(1, move.t / 0.08));
      rain.twirl(v.copy(at).addScaledVector(aim, long * 0.3), aim, long * 0.34);
      if (move.t < SKY.let) return;
      // let go: over what she aimed at (not too far off), or a little way before her
      const t = move.target, near = t && Math.hypot(t.pos.x - me.pos.x, t.pos.z - me.pos.z) < SKY.far * k;
      if (near) want.set(t.pos.x, 0, t.pos.z);
      else want.set(me.pos.x + Math.sin(me.heading) * SKY.ahead * k, 0, me.pos.z + Math.cos(me.heading) * SKY.ahead * k);
      level = move.level;
      rain.launch({ from: v.copy(at).addScaledVector(aim, long * SKY.grip), centre: want, ground: world.ground || (() => me.pos.y), k, level, heading: me.heading, long });
      move.fired = true;
    },
  };
  return sky;
}
