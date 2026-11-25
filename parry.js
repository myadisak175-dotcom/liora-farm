/* ==========================================================================
   parry.js  —  her parry, ปัด: the rules, and her body while it has her. Asked for on 26 Nov 2026 in the barrier's
   place: "จะเอา บาเรีย ออก แต่ ทำ เป็น pary แบบ doctor strang แทน", "เป็นแบบปัดสกิลระยะไกล กดให้ตรงจังหวะ": a blow thrown
   at her from afar is thrown back at whoever threw it, if she presses in time. Settled in the same talk: a short window
   from the press (about a quarter of a second, wide enough for a phone's screen); taken in time, the blow goes back at
   the head that spat it; pressed wrong, she takes the whole of it (nothing half kept off: this is a parry, not a shield);
   what is thrown at her glows as it comes into the window, so she can see when.

     const guard = createParry({ character, fx, heard, aim })
       fx: parry-fx.js' (the circle at her palm). heard: barrier-reflect-sounds.js' (or none). aim(me): what she should
       turn to as she presses: a point (world: the shot that will reach her first, or whoever throws), or null (she
       parries the way she faces)
     guard.press()                      the parry button (on the page, P or K on a keyboard): kept PARRY.buffer s, so a
                                        press as she lands still counts
     every frame, before her clips are played (as player-spells.js' step; player-moves.js calls it, createPlayer({ guard })):
       guard.step(dt, me, world) -> true while it has her: her clips are its, it turns her to what comes and lets her run
       die away under her (me: { pos, vel, heading }; world: { grounded, stick: { amount } }); the caller keeps her out of
       things. Not grounded (in the air, climbing, swimming, in deep water, in a blink) nothing begins
     every frame, once she is posed: guard.after(dt, me)   the circle at her palm
     guard.meet(p0, p1, r)              where something r metres round going from p0 to p1 this frame meets the circle
                                        while it is hot (or null): boss-shots.js asks it for every shot
     guard.take(point, shot)            it took that blow there (true): it flares, she is knocked back a hand's width
                                        and drives her palm out after it; the thrower throws it back. Taken within
                                        PARRY.perfect s of the press (pressed at the last moment) it is perfect:
                                        guard.onTake(point, shot, perfect), guard.stats.perfects
     guard.struck(from)                 a blow got through: she flinches back from it (on her feet; in the air, nothing
                                        more is done to her)
     guard.window (s), guard.reach(r)   how long it is hot from the press; how far before her chest a blow r round is
                                        taken (for the thrower's glint: boss-shots.js' `now`)
     guard.hot, guard.active, guard.state ('off' | 'guard' | 'hit' | 'hurt'), guard.ready, guard.wait (s before a press
     is taken), guard.stats ({ presses, takes, whiffs, hurts }), guard.onPress, guard.onTake, guard.onWhiff (the page's)
     guard.stop(), guard.setCharacter(next)

   How it goes (PARRY):
     - pressed on her feet: she turns to what comes (`turn`) as her left palm is thrown out at it (her move, the clip
       'parry': parry-anim.js, tools/make-parry-anim.py), her run dying away under her (`brake`); the circle snaps open
       at her palm at once. It is hot for `window` s from the press: whatever reaches it in that time is taken (two at
       once, both), each a flare, and she plays 'parry_hit' (knocked back, then driving her palm out after it). From
       `hitAgain` s after a take another press raises it again at once (the venom's three come a little over a third of a
       second apart: each must be pressed for)
     - nothing came while it was hot: it breaks up, and she lowers her hand. Another press is not taken until `again` s
       after the first: pressed too soon, the blow comes after the window and she has no time to raise it again. The
       stick pushed walks her out of it from `free` s
     - struck (the blow came outside the window, or no press): she flinches back from it (the clip 'hurt'), and may
       parry again from `hurtAgain` s
   ========================================================================== */
import * as THREE from 'three';

export const PARRY = {
  window: 0.28,      // s it is hot from the press
  perfect: 0.12,     // a blow taken within this of the press (pressed at the last moment) is a perfect parry
  buffer: 0.15,      // s a press is kept (as her jump's): she was not on her feet yet, or not free yet
  again: 0.44,       // s after a press that took nothing before another is taken
  free: 0.4,         // s into it the stick pushed walks her out of it (nothing taken)
  hitAgain: 0.06,    // s after a take another press raises it again
  hitFree: 0.24,     // s after a take the stick walks her out of it
  hurtAgain: 0.22,   // s into a flinch she may parry again
  hurtFree: 0.3,     // s into a flinch the stick walks her out of it
  reach: 0.62,       // m before her chest the circle's middle stands (at 1.75 m)
  radius: 0.58,      // its radius (m at 1.75 m); a blow is taken within this and its own radius of its middle
  body: 0.5,         // m round her chest a blow is taken too while it is hot (one coming from where she does not face)
  turn: 26,          // 1/s she turns to what comes
  brake: 18,         // 1/s her run dies away under her (from a run: a skid of some 0.23 m)
  fade: { parry: 0.05, hit: 0.04, hurt: 0.06, out: 0.18 },   // s her clips blend in (out: back into her walk)
};
const CLIPS = { guard: 'parry', hit: 'parry_hit', hurt: 'hurt' };

export function createParry({ character: first, fx, heard = null, aim = null }) {
  let character = first;
  let state = 'off', t = 0, pressT = 0, hotUntil = -1, clock = 0, hurtWanted = false, took = false, size = 1, pressedAt = -9;
  const stats = { presses: 0, takes: 0, perfects: 0, whiffs: 0, hurts: 0 };
  const chest = new THREE.Vector3(), centre = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, 1), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let want = null;                      // the heading she turns to (radians), or null
  let palm = null, mid = null;          // her left hand's bones (the circle stands before her palm)
  const findHand = () => {
    palm = character.model ? character.model.getObjectByName('J_Bip_L_Hand') : null;
    mid = character.model ? character.model.getObjectByName('J_Bip_L_Middle1') : null;
  };
  findHand();
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const hot = () => clock < hotUntil && (state === 'guard' || state === 'hit');

  function play(name, fade) {
    if (!character.actions[name]) return;
    character.play(name, fade, false);
    character.setRate(1);
  }
  // where she turns to: what comes, as the page says; and the way the circle faces (level: it faces her chest's height)
  function aimFrom(me) {
    const p = aim ? aim(me) : null;
    if (p) {
      tmp.set(p.x - me.pos.x, 0, p.z - me.pos.z);
      if (tmp.lengthSq() > 0.04) {
        want = Math.atan2(tmp.x, tmp.z);
        dir.set(p.x - chest.x, p.y - chest.y, p.z - chest.z).normalize();
        dir.y = THREE.MathUtils.clamp(dir.y, -0.5, 0.5); dir.normalize();
        return;
      }
    }
    want = null;
    dir.set(Math.sin(me.heading), 0, Math.cos(me.heading));
  }
  function begin(me) {
    state = 'guard'; t = 0; pressT = 0; took = false;
    hotUntil = clock + PARRY.window; pressedAt = clock;
    stats.presses++;
    chest.set(me.pos.x, me.pos.y + 1.12 * size, me.pos.z);
    aimFrom(me);
    play(CLIPS.guard, PARRY.fade.parry);
    fx.raise(size);
    if (heard) heard.raise();
    if (api.onPress) api.onPress();
  }
  // may a press be taken now?
  function free() {
    if (state === 'off') return true;
    if (state === 'guard') return t >= PARRY.again || (took && t >= PARRY.hitAgain);
    if (state === 'hit') return t >= PARRY.hitAgain;
    if (state === 'hurt') return t >= PARRY.hurtAgain;
    return false;
  }

  function step(dt, me, world) {
    clock += dt;
    pressT = Math.max(0, pressT - dt);
    size = (character.height || 1.75) / 1.75;
    if (!world.grounded) {
      if (state !== 'off') stop();
      hurtWanted = false;
      return false;
    }
    if (pressT > 0 && free()) begin(me);
    else if (hurtWanted && state !== 'hurt') {
      hurtWanted = false;
      if (!hot()) { state = 'hurt'; t = 0; play(CLIPS.hurt, PARRY.fade.hurt); if (fx.up) fx.whiff(); stats.hurts++; }
    }
    hurtWanted = false;
    if (state === 'off') return false;
    t += dt;
    // it was hot and nothing came: it breaks up
    if (state === 'guard' && !took && clock >= hotUntil && fx.up) { fx.whiff(); stats.whiffs++; if (api.onWhiff) api.onWhiff(); }
    // she turns to what comes while it is hot (it may be curving after her), her run dying away under her
    chest.set(me.pos.x, me.pos.y + 1.12 * size, me.pos.z);
    if (hot()) aimFrom(me);
    if (want !== null && state !== 'hurt') me.heading += wrap(want - me.heading) * Math.min(1, dt * PARRY.turn);
    const k = Math.exp(-PARRY.brake * dt);
    me.vel.multiplyScalar(k);
    me.pos.x += me.vel.x * dt; me.pos.z += me.vel.z * dt;
    // over, or walked out of
    const clip = character.actions[state === 'guard' ? CLIPS.guard : state === 'hit' ? CLIPS.hit : CLIPS.hurt];
    const len = clip ? clip.getClip().duration : 0.5;
    const walk = world.stick && world.stick.amount > 0.12;
    const out = state === 'guard' ? (took ? t >= PARRY.hitFree : t >= PARRY.free) : state === 'hit' ? t >= PARRY.hitFree : t >= PARRY.hurtFree;
    if (t >= len - 0.02 || (walk && out && !hot())) { state = 'off'; t = 0; if (fx.up) fx.whiff(); return false; }
    return true;
  }
  // the circle before her palm, facing what comes
  function after(dt) {
    if (!fx.up) return;
    if (palm) {
      palm.getWorldPosition(tmp);
      if (mid) { mid.getWorldPosition(tmp2); tmp.lerp(tmp2, 0.6); }
    } else tmp.copy(chest).addScaledVector(dir, 0.45 * size);
    centre.copy(tmp).addScaledVector(dir, 0.16 * size);
    fx.place(centre, dir, PARRY.radius * size);
  }

  // ---- what comes at her
  const d = new THREE.Vector3(), f = new THREE.Vector3(), on = new THREE.Vector3();
  function through(p0, p1, c, r) {
    // where the way p0 -> p1 first comes within r of c (or the nearest point of it, if it starts inside), else null
    d.subVectors(p1, p0); f.subVectors(p0, c);
    const a = d.dot(d), b = 2 * f.dot(d), cc = f.dot(f) - r * r;
    if (cc <= 0) return p0.clone();
    if (a < 1e-9) return null;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return null;
    const u = (-b - Math.sqrt(disc)) / (2 * a);
    if (u < 0 || u > 1) return null;
    return on.copy(p0).addScaledVector(d, u).clone();
  }
  function meet(p0, p1, r = 0) {
    if (!hot()) return null;
    const c = tmp2.copy(chest).addScaledVector(dir, PARRY.reach * size);
    return through(p0, p1, c, PARRY.radius * size + r) || through(p0, p1, chest, PARRY.body * size + r);
  }
  function take(point, shot) {
    if (!hot()) return false;
    took = true;
    state = 'hit'; t = 0;
    play(CLIPS.hit, PARRY.fade.hit);
    tmp.copy(point).sub(chest); if (tmp.lengthSq() > 1e-6) dir.copy(tmp.normalize());
    fx.take(point, dir, size);
    if (heard) { heard.absorb(); heard.burst(); }
    const perfect = clock - pressedAt <= PARRY.perfect;
    stats.takes++; if (perfect) stats.perfects++;
    if (api.onTake) api.onTake(point, shot, perfect);
    return true;
  }
  function struck() { if (!hot()) hurtWanted = true; }
  function stop() { if (fx.up) fx.whiff(); state = 'off'; t = 0; hotUntil = -1; }

  const api = {
    press() { pressT = PARRY.buffer; },
    step, after, meet, take, struck, stop,
    setCharacter(next) { character = next; findHand(); if (state !== 'off') stop(); },
    get window() { return PARRY.window; },
    reach(r = 0) { return (PARRY.reach + PARRY.radius * 0.5) * size + r; },
    get hot() { return hot(); },
    get active() { return state !== 'off'; },
    get state() { return state; },
    get ready() { return free(); },
    get wait() { return state === 'guard' && !took ? Math.max(0, PARRY.again - t) : state === 'hurt' ? Math.max(0, PARRY.hurtAgain - t) : 0; },
    get held() { return state === 'off' ? 0 : 0.35; },
    stats, onPress: null, onTake: null, onWhiff: null,
  };
  return api;
}
