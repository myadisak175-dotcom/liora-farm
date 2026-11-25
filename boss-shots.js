/* ==========================================================================
   boss-shots.js  —  the plant boss's straight shots, as they fly: what each head spits straight at her
   (plant-boss-moves.js: play('seed' | 'pollen' | 'venom'), its 'shot' events) and what becomes of it: it meets her
   parry and is thrown back at the head that spat it, it strikes her, or it misses and bursts on the ground. Asked for
   on 26 Nov 2026, with the parry ("เพิ่มท่ายิงให้บอส ... เอาสามหัวทำเป็นท่ายิงตรงๆ ให้แพรี่ด้วย"): something for the
   parry to parry. One job: the rules of the shots in flight. What they look like is boss-shots-fx.js'; the parry is
   parry.js' (here only asked whether it takes a shot); how much a head can take is the page's (onBack says how much).

     const shots = createBossShots({ boss, moves, fx, guard, her, heightAt, heard })
       boss: plant-boss.js' Group (its heads' mouths are read off it). moves: its createBossMoves (a head struck: play('hit')).
       fx: boss-shots-fx.js'. guard: the parry (parry.js): guard.meet(p0, p1, r) -> where a shot going from p0 to p1 this
       frame, r metres round, meets it (or null); guard.take(point, shot) -> true if it took it there (it is thrown back
       at once). None: nothing parries. her(): { feet (Vector3), size (1 at 1.75 m), vel (Vector3, m/s over the ground) }.
       heightAt(x, z): the ground. heard: barrier-reflect-sounds.js' (shot, thud) or none
     moves.onEvent = e => shots.event(e)        its 'charge' and 'shot' (the rest is ignored)
     every frame: shots.update(dt)
     shots.list                                  [{ kind, head, pos, way, speed, back, age, now, ... }] in flight
     shots.soonest()                             the shot that will reach her first, and in how many seconds: { shot, eta }
                                                 (or null): what the parry turns to; eta counts to where the parry takes it
     shots.clear()                               none in flight (the page starts again)
     shots.onHit(shot, at), shots.onTaken(shot, at), shots.onBack(shot, head, damage), shots.onMiss(shot, at)
                                                 for the page: she is struck; the parry took it; thrown back, it struck its
                                                 head; it burst on the ground

   How each flies (BOSS_SHOTS): spat from the head's mouth straight at her chest, led a little by how she goes (so a step
   to one side is not enough at a run: lead), steering after her by at most `steer` radians a second while she is still
   `close` metres off or more (so it can be dodged at the last moment: a blink, a jump, a dash aside). Thrown back it goes
   `back` times as fast (at least BACK_MIN m/s) and finds its head whatever it does. A shot meets her as a rod from her shins
   to her head, 0.3 m round it (at 1.75 m), as the practice towers' bolts do; anything flying more than `range` metres or
   meeting the ground bursts there.
   ========================================================================== */
import * as THREE from 'three';

export const BOSS_SHOTS = {
  //       m/s   rad/s     m        m     of how she goes   times as fast back   what it does to a head thrown back
  seed:   { speed: 22, steer: 1.1, radius: 0.2, close: 3.5, lead: 0.5, back: 1.55, damage: 1 },      // the right head's thorned dart: fast, straight
  pollen: { speed: 9, steer: 2.3, radius: 0.55, close: 2.6, lead: 0.2, back: 2.4, damage: 2 },      // the middle head's ball: slow, big, follows her
  venom:  { speed: 14.5, steer: 1.5, radius: 0.3, close: 3.0, lead: 0.4, back: 1.8, damage: 1 },   // the left head's three: between
};
export const BACK_MIN = 26;       // m/s a shot thrown back goes at the least
const RANGE = 40;                 // m a shot flies before it bursts of itself
const HEAD_HIT = 0.75;            // m from a head's pod that a shot thrown back strikes it

export function createBossShots({ boss, moves, fx, guard = null, her, heightAt, heard = null }) {
  const list = [];
  const { heads, mesh } = boss.userData;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), want = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), q = new THREE.Vector3();
  const axisA = new THREE.Vector3(), axisB = new THREE.Vector3(), ab = new THREE.Vector3(), on = new THREE.Vector3();
  let made = 0;

  // ---- where a head's mouth is now, and its pod (world): as poison-rain-fx.js finds them
  function mouthOf(i, out = new THREE.Vector3()) {
    const h = heads[i];
    mesh.updateWorldMatrix(true, false);
    const az = h.faces + h.yaw, tip = h.tipped + h.nod, r = h.radius * (h.scale || 1);
    tmp.set(Math.sin(az) * Math.cos(tip), -Math.sin(tip), Math.cos(az) * Math.cos(tip));
    out.copy(h.centre).add(h.lean).addScaledVector(tmp, r * 0.95);
    return mesh.localToWorld(out);
  }
  function podOf(i, out = new THREE.Vector3()) {
    const h = heads[i];
    mesh.updateWorldMatrix(true, false);
    return mesh.localToWorld(out.copy(h.centre).add(h.lean));
  }
  const chest = (out = new THREE.Vector3()) => { const h = her(); return out.copy(h.feet).add(tmp2.set(0, 1.12 * h.size, 0)); };

  function event(e) {
    if (e.move !== 'seed' && e.move !== 'pollen' && e.move !== 'venom') return;
    if (e.type === 'charge') fx.charge(e.head, e.move, e.lead, () => mouthOf(e.head));
    else if (e.type === 'shot') launch(e.move, e.head, e.shot);
    else if (e.type === 'cancel') fx.charge(e.head, e.move, 0, null);
  }
  function launch(kind, head, k = 0) {
    const K = BOSS_SHOTS[kind], from = mouthOf(head), h = her();
    // at her chest, led by how she goes over the time it would take to get there
    const to = chest(), eta = from.distanceTo(to) / K.speed;
    to.addScaledVector(tmp.set(h.vel.x, 0, h.vel.z), eta * K.lead);
    const s = { id: made++, kind, head, k, pos: from.clone(), from: from.clone(), way: to.sub(from).normalize(), speed: K.speed, radius: K.radius,
      back: false, age: 0, went: 0, now: 0, spin: Math.random() * 6.28, dice: Math.random() };
    list.push(s);
    fx.launch(s);
    if (heard) heard.shot(Math.min(1, 9 / Math.max(4, from.distanceTo(h.feet))));
  }
  function throwBack(s, at) {
    s.back = true; s.pos.copy(at); s.from.copy(at); s.went = 0;
    s.speed = Math.max(BACK_MIN, BOSS_SHOTS[s.kind].speed * BOSS_SHOTS[s.kind].back);
    s.way.copy(podOf(s.head, tmp)).sub(at).normalize();
    fx.reflect(s, at);
  }
  // turned toward `to` by at most `most` radians
  function steer(way, to, most) {
    const c = THREE.MathUtils.clamp(way.dot(to), -1, 1), a = Math.acos(c);
    if (a <= most || a < 1e-5) { way.copy(to); return; }
    tmp.crossVectors(way, to);
    if (tmp.lengthSq() < 1e-10) tmp.set(0, 1, 0);
    way.applyAxisAngle(tmp.normalize(), most).normalize();
  }
  function burst(s, i, at, where) {
    fx.burst(s, at, where);
    list.splice(i, 1);
  }

  function update(dt) {
    if (dt <= 0) { for (const s of list) fx.place(s); return; }
    const h = her();
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i], K = BOSS_SHOTS[s.kind];
      s.age += dt; s.spin += dt * (s.kind === 'seed' ? 24 : 5);
      if (s.back) {
        // thrown back: it finds its head, whatever that head does
        const pod = podOf(s.head, want);
        s.way.copy(pod).sub(s.pos).normalize();
        const step = s.speed * dt;
        if (s.pos.distanceTo(pod) < HEAD_HIT + step) {
          const down = moves.isDown(s.head);
          if (!down) moves.play('hit', s.head);
          if (heard) heard.thud(Math.min(1, 9 / Math.max(4, pod.distanceTo(h.feet))));
          if (api.onBack) api.onBack(s, s.head, down ? 0 : K.damage);
          burst(s, i, pod.clone().addScaledVector(s.way, -0.3), 'head');
          continue;
        }
        s.pos.addScaledVector(s.way, step); s.went += step;
        fx.place(s);
        continue;
      }
      // coming at her: steered after her while she is still far enough off
      const c = chest(want);
      const far = s.pos.distanceTo(c);
      if (far > K.close * h.size) steer(s.way, tmp2.copy(c).sub(s.pos).normalize(), K.steer * dt);
      p0.copy(s.pos); p1.copy(s.pos).addScaledVector(s.way, s.speed * dt);
      // the parry first: it takes it where they meet
      const at = guard ? guard.meet(p0, p1, s.radius) : null;
      if (at && guard.take(at, s)) {
        if (api.onTaken) api.onTaken(s, at);
        throwBack(s, at);
        fx.place(s);
        continue;
      }
      // then her: a rod from her shins to her head
      axisA.copy(h.feet); axisA.y += 0.3 * h.size; axisB.copy(h.feet); axisB.y += 1.55 * h.size; ab.subVectors(axisB, axisA);
      let struck = null;
      for (let k = 1; k <= 6 && !struck; k++) {
        q.lerpVectors(p0, p1, k / 6);
        const t = THREE.MathUtils.clamp(on.subVectors(q, axisA).dot(ab) / ab.lengthSq(), 0, 1);
        if (q.distanceTo(on.copy(axisA).addScaledVector(ab, t)) < 0.3 * h.size + s.radius * 0.6) struck = q.clone();
      }
      if (struck) {
        if (heard) heard.thud(1);
        if (api.onHit) api.onHit(s, struck);
        burst(s, i, struck, 'her');
        continue;
      }
      s.went += s.speed * dt;
      const ground = heightAt(p1.x, p1.z);
      if (s.went > RANGE || p1.y < ground + s.radius * 0.3) {
        const where = tmp.copy(p1); where.y = Math.max(where.y, ground);
        if (api.onMiss) api.onMiss(s, where.clone());
        burst(s, i, where.clone(), 'ground');
        continue;
      }
      s.pos.copy(p1);
      // how soon it will reach her (where the parry would take it), for its glint and the parry's turn
      s.eta = Math.max(0, (s.pos.distanceTo(c) - (guard && guard.reach ? guard.reach(s.radius) : 0.9)) / s.speed);
      s.now = guard && guard.window ? (s.eta <= guard.window ? 1 : 0) : 0;
      fx.place(s);
    }
  }

  function soonest() {
    let best = null;
    for (const s of list) if (!s.back && s.eta !== undefined && (!best || s.eta < best.eta)) best = s;
    return best ? { shot: best, eta: best.eta } : null;
  }

  const api = {
    list, event, update, soonest, mouthOf, podOf,
    clear() { for (const s of list) fx.burst(s, s.pos, 'gone'); list.length = 0; },
    onHit: null, onTaken: null, onBack: null, onMiss: null,
  };
  return api;
}
