/* ==========================================================================
   barrier-reflect.js  —  the barrier that throws a blow back: the rules (barrier-reflect-fx.js draws it,
   barrier-reflect-sounds.js is heard). Made after the clip of 24 Nov 2026 (barrier-reflect-fx.js tells what is in it):
   "เหมือนเป็นโล่อะ เคลื่อนที่ได้ แล้วก็มี reflection ตอนบาเรียโดนโจมตี แล้วก็แตกด้วย".

     const barrier = createReflectBarrier({ fx, heard, heightAt })
     barrier.raise(feet, size)      the button: a dome stands up round her (if it may: barrier.ready)
     every frame: barrier.update(dt, feet, size)      it keeps up with her (feet: where her feet are now)
     barrier.meet(p0, p1)           where a blow going from p0 to p1 this frame first meets it (or null)
     barrier.strike(point, from, source)              the blow lands on it there: true if it took it. `source`: who
                                    threw it (anything; given back as it is thrown back)
     barrier.onStrike = ({ point, first }) => ...     a blow landed on it (first: the one that set it off), for the page's
                                    shake and stop
     barrier.onReflect = ({ at, blows }) => ...       it bursts, throwing the blows back: `at` where it was struck (the
                                    blows leave from there), blows: [{ from, source }] as they were taken
     barrier.state                  'off' | 'forming' | 'up' | 'struck' | 'broken' | 'fading'
     barrier.ready                  it may be raised now;  barrier.guarding: it takes a blow now
     barrier.center, barrier.radius where its ball is (for a test, or the console)
     barrier.drop()                 gone at once (another character, a teleport)
     barrier.pace                   how fast the page runs (1; ×½: 0.5), for the sounds

   How it goes (REFLECT_BARRIER), at an action game's pace ("อนิเมชั่นมันช้าไปอะ อยากได้แบบเกม action rpg", of the first
   try, which went at the clip's):
     - raised, it pops up round her in `form` s, and takes blows from `takes` s on. It goes where she goes: its middle
       is kept over her feet by a spring (`keep`: it lags a little as she sets off and catches her up as she stops), up
       with her as she jumps (it is a whole ball then, she in it)
     - unstruck, it stands `hold` s, then goes (`fade` s, the fx's)
     - struck: the blow is stopped where it meets it. It turns deep blue, the lightning runs through it, and `charge` s
       after the blow it bursts and throws it back (the clip takes 1.81 s; the first try did). Blows that land on it
       meanwhile are taken in too, and each is thrown back at whoever threw it
     - `again` s after it bursts or has gone it may be raised again
   Her body does nothing for it (none of the clip's moves: "ไม่ต้องทำแบบนั้นค่ะ").
   ========================================================================== */
import * as THREE from 'three';
import { REFLECT_FX } from './barrier-reflect-fx.js?v=4';

export const REFLECT_BARRIER = {
  form: 0.34,        // s it takes to pop up (the fx's)
  takes: 0.06,       // s after it is raised that it takes blows
  hold: 12,          // s it stands if nothing strikes it
  charge: 0.4,       // s from the blow to its bursting (the clip's 2.46 s to its 4.27 was 1.81: too slow)
  again: 0.7,        // s after it bursts, or has gone, before it can be raised again
  keep: 16,          // its spring (1/s): how quickly it keeps up with her
};

export function createReflectBarrier({ fx, heard = null, heightAt = null } = {}) {
  let state = 'off', since = 0, readyAt = 0, clock = 0, size = 1, pace = 1;
  const center = new THREE.Vector3(), vel = new THREE.Vector3(), want = new THREE.Vector3();
  let blows = [];
  const R = () => REFLECT_FX.dome.r * size;
  const lift = () => REFLECT_FX.dome.lift * R();

  function raise(feet, sz = 1) {
    if (state !== 'off' || clock < readyAt) return false;
    size = sz;
    center.set(feet.x, feet.y + lift(), feet.z); vel.set(0, 0, 0);
    state = 'forming'; since = 0; blows = [];
    fx.raise(center, size, feet);
    if (heard) heard.raise(pace);
    return true;
  }
  // the spring: each part of its middle a critically damped spring to where it should be (exact at any frame rate)
  function follow(dt) {
    const w = REFLECT_BARRIER.keep, e = Math.exp(-w * dt);
    for (const k of ['x', 'y', 'z']) {
      const x0 = center[k] - want[k], v0 = vel[k], c = v0 + w * x0;
      center[k] = want[k] + (x0 + c * dt) * e;
      vel[k] = (v0 - w * c * dt) * e;
    }
  }
  function update(dt, feet, sz = size) {
    clock += dt;
    if (state === 'off') return;
    since += dt;
    if (state !== 'broken') {
      size = sz;
      want.set(feet.x, feet.y + lift(), feet.z);
      follow(dt);
      const ground = heightAt ? heightAt(center.x, center.z) : feet.y;
      fx.place(center, size, Math.min(ground, center.y - lift() * 0.2));
    }
    if (state === 'forming' && since >= REFLECT_BARRIER.form) state = 'up';
    if (state === 'up' && since >= REFLECT_BARRIER.form + REFLECT_BARRIER.hold) { state = 'fading'; since = 0; fx.fade(); }
    if (state === 'fading' && since >= REFLECT_FX.fade) { state = 'off'; readyAt = clock + REFLECT_BARRIER.again; }
    if (state === 'struck' && since >= REFLECT_BARRIER.charge) {
      const at = fx.reflect(blows.map(b => (b.source && b.source.position ? b.source.position : b.from)));
      state = 'broken'; since = 0;
      if (heard) heard.burst(pace);
      if (api.onReflect && at) api.onReflect({ at, blows });
    }
    if (state === 'broken' && since >= REFLECT_BARRIER.again) { state = 'off'; readyAt = clock; }
  }
  const guarding = () => (state === 'forming' && since >= REFLECT_BARRIER.takes) || state === 'up' || state === 'struck';
  // where the way from p0 to p1 first comes into its ball from outside (above the ground under it), or null
  const d = new THREE.Vector3(), f = new THREE.Vector3();
  function meet(p0, p1) {
    if (!guarding()) return null;
    d.subVectors(p1, p0); f.subVectors(p0, center);
    const r = R(), a = d.dot(d), b = 2 * f.dot(d), c = f.dot(f) - r * r;
    if (a < 1e-9 || c < 0) return null;                    // (not moving, or already in it)
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1) return null;
    const p = p0.clone().addScaledVector(d, t);
    const ground = heightAt ? heightAt(p.x, p.z) : center.y - lift();
    if (p.y < ground - 0.05) return null;                   // (under the ground: none of it there)
    return p;
  }
  function strike(point, from, source = null) {
    if (!guarding()) return false;
    const first = state !== 'struck';
    if (first) { state = 'struck'; since = 0; blows = []; if (heard) heard.strike(pace); }
    else if (heard) heard.absorb(pace);
    blows.push({ from: from.clone(), source });
    fx.strike(point, from);
    if (api.onStrike) api.onStrike({ point, first });
    return true;
  }
  function drop() { if (state !== 'off' && state !== 'broken') { fx.drop(); state = 'off'; readyAt = clock + REFLECT_BARRIER.again; } }

  const api = {
    raise, update, meet, strike, drop, onStrike: null, onReflect: null,
    get state() { return state; },
    get ready() { return state === 'off' && clock >= readyAt; },
    get guarding() { return guarding(); },
    get center() { return center; },
    get radius() { return R(); },
    get pace() { return pace; }, set pace(v) { pace = v; },
    get cooldown() { return state === 'off' ? Math.max(0, readyAt - clock) : 0; },
  };
  return api;
}
