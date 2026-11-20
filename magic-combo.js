/* ==========================================================================
   magic-combo.js  —  Vivi's magic combo: the attack button pressed again and again is four casts, each a different move
   that goes straight into the next (a swipe, the swipe back, a whole turn into a cut, and both hands thrust out); and a
   roll that gets her out of the way, with a rising cast out of it if the attack button is pressed as it ends. The
   moves' own rules and what they throw; nothing else. Her moves: magic-combo-anim.js (tools/make-magic-combo-anim.py),
   the roll the game's own clip. What is thrown is drawn by magic-combo-fx.js.

     const combo = createMagicCombo({ character, marks: MAGIC_COMBO, fx })
     combo.attack()                  the attack button (remembered for a moment: pressed a little early, it still counts)
     combo.dodge()                   the roll button
     every frame, before character.update(dt):
       combo.step(dt, me, world)     -> true while she is in one of its moves (the page then leaves her walking alone).
                                     me: { pos, vel, heading }; it turns her to what she casts at and moves her where
                                     a move takes her (the page keeps her out of things afterwards).
                                     world: { stick: { x, z, amount }, targets, ground(x, z) }
                                     a target: { pos (its foot), radius, height, hit({ power, x, z, launch, kind }) }
     every frame, after character.update(dt) and once she is placed (her bones are where they will be drawn):
       combo.after(dt, me, world)    the light at her hand, the cast leaving it, what is in flight and what it hits
     combo.active                    she is in a move
     combo.beat                      what she is doing now (for a label); combo.index: which of the four casts (0..3, -1:
                                     none of them); combo.rising: the rising cast
     combo.hits                      how many casts have landed one after another (0 again 2.5 s after the last)
     combo.held, combo.upside        0..1: how hard her hair and skirt should be held now (the roll, the turn), and how far
                                     she is upside down (for character.holdSprings, as magic-jump.js')
     combo.stop()                    she is taken out of it some other way (falls, is thrown)
     combo.onLand = (kind, at) => …  something landed (a page may shake its camera)

   The rules:
     - A cast leaves her hand at its move's `hit`; from its `cancel` on the next press is the next move (pressed before:
       remembered, and it begins on the dot). Not pressed, the move ends in her standing pose; the stick pushed after
       the cancel moment walks her out of it sooner. After the fourth it is the first again, once the fourth is nearly
       over (its `again`: the finisher leaves her open for half a second); after a pause, the first.
     - She turns to what she casts at as a move begins: the nearest target, more so one the stick points at.
     - The orbs of the first two find their target (they leave her hand the way it was going, and curve in); the wave of
       the third goes straight and through everything; the fourth is a big orb that bursts on all near where it lands.
     - The roll goes the way the stick points (the way she faces, let go). The attack button during it, or just as her
       feet are under her again, is the rising cast: a standing wave along the ground that throws what it hits up.
     - The roll cuts any move short (what was not yet cast is lost).
   Lengths are for a 1.75 m character and go with her size.
   ========================================================================== */
import * as THREE from 'three';

const HITS = [
  { clip: 'mc_1', shot: 'orb', power: 1, glow: 0.3, name: 'ปัด' },
  { clip: 'mc_2', shot: 'orb', power: 1, glow: 0.3, name: 'ปัดกลับ' },
  { clip: 'mc_3', shot: 'wave', power: 2, glow: 0.34, name: 'หมุนฟัน' },
  { clip: 'mc_4', shot: 'big', power: 4, glow: 0.8, name: 'ปล่อยพลัง' },
];
const RISE = { clip: 'mc_rise', shot: 'rise', power: 2, glow: 0.34, name: 'เสยขึ้น' };
// what is thrown: its pace (m/s), how near a target it lands (m, added to the target's own), how far it goes, how fast it
// turns to its target (1/s; 0: straight), the burst where it lands; through: it goes on through what it hits; blast: all
// within so far of where it lands are hit too; launch: what it hits is thrown up
const SHOTS = {
  orb: { speed: 18, radius: 0.2, range: 15, steer: 9, burst: 0.75 },
  big: { speed: 13, radius: 0.45, range: 17, steer: 4, burst: 2.0, blast: 2.4 },
  wave: { speed: 14, radius: 0.85, range: 9, steer: 0, burst: 0.8, through: true, height: 0.95 },
  rise: { speed: 12, radius: 0.4, range: 7, steer: 0, burst: 0.9, through: true, launch: true, height: 0.85 },
};
const REMEMBER = 0.35;        // s a press of the attack button is remembered
const AIM_FAR = 13;           // m: she turns to a target no further than this
const AIM_TURN = 20;          // how fast she turns to it (1/s)
const FREE = 0.16;            // s after a move's cancel moment before the stick walks her out of it
const COUNT = 2.5;            // s the count of casts landed stays up
const FADE = { first: 0.09, next: 0.06, roll: 0.06, rise: 0.07 };

export function createMagicCombo({ character, marks, fx }) {
  const bone = n => character.model.getObjectByName(n);
  const hands = { R: bone('J_Bip_R_Middle1') || bone('J_Bip_R_Hand'), L: bone('J_Bip_L_Middle1') || bone('J_Bip_L_Hand') };
  const size = () => character.height / 1.75;
  const hh = () => (character.hipsHeight || 1) * (character.size || 1);      // a hips height of hers, in the world (m)
  let move = null;            // { kind: 'hit' | 'roll', def, m, t, fired, target, at: [x, z] of its path so far, dx, dz }
  let wantHit = 0, wantRoll = 0, hits = 0, hitsT = 0;
  const shots = [];
  const hand = new THREE.Vector3(), handWas = new THREE.Vector3(), handVel = new THREE.Vector3();
  const v = new THREE.Vector3(), aim = new THREE.Vector3(), want = new THREE.Vector3();
  let handKnown = false;

  function handAt(which, out) {
    character.object.updateWorldMatrix(true, true);
    if (which === 'B') { hands.R.getWorldPosition(out); hands.L.getWorldPosition(v); return out.add(v).multiplyScalar(0.5); }
    return hands[which].getWorldPosition(out);
  }
  // where along a path (per frame at marks.fps) she is at time t: stride numbers a frame
  function pathAt(path, stride, t, k) {
    const n = path.length / stride, f = Math.min(n - 1, Math.max(0, t * marks.fps)), i = Math.min(n - 2, Math.floor(f)), u = f - i;
    return path[i * stride + k] + (path[(i + 1) * stride + k] - path[i * stride + k]) * u;
  }
  // the target she casts at: the nearest, one the stick points at (or she faces) more so
  function pick(me, world) {
    const s = world.stick, pushed = s && s.amount > 0.3;
    const fx_ = pushed ? s.x : Math.sin(me.heading), fz_ = pushed ? s.z : Math.cos(me.heading);
    let best = null, bestScore = 1e9;
    for (const t of world.targets || []) {
      const dx = t.pos.x - me.pos.x, dz = t.pos.z - me.pos.z, d = Math.hypot(dx, dz);
      if (d > AIM_FAR * size() || d < 1e-3) continue;
      const off = Math.acos(Math.min(1, Math.max(-1, (dx * fx_ + dz * fz_) / d)));
      if (off > 1.9 && d > 3 * size()) continue;                            // behind her and not near: not that one
      const score = d * (1 + 1.6 * off / Math.PI);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }
  function begin(def, me, world, fade) {
    if (character.state === def.clip) character.play('idle', 0);          // (the same move again: from its beginning)
    character.play(def.clip, fade, false);
    move = { kind: 'hit', def, m: marks.clips[def.clip], t: 0, fired: false, target: pick(me, world), at: [0, 0] };
    wantHit = 0; handKnown = false;
    me.vel.set(0, 0, 0);
  }
  function roll(me, world) {
    const s = world.stick, pushed = s && s.amount > 0.2;
    const dx = pushed ? s.x : Math.sin(me.heading), dz = pushed ? s.z : Math.cos(me.heading);
    if (character.state === marks.roll.clip) character.play('idle', 0);
    character.play(marks.roll.clip, FADE.roll, false);
    character.setRate(marks.roll.rate);
    move = { kind: 'roll', m: marks.roll, t: 0, at: [0], dx, dz };
    wantRoll = 0;
    me.vel.set(0, 0, 0);
  }
  function fire(me, world) {
    const { def, target } = move, kind = SHOTS[def.shot], k = size();
    handAt(move.m.hand, hand);
    const from = hand.clone();
    aim.set(Math.sin(me.heading), 0, Math.cos(me.heading));
    if (target) {
      want.set(target.pos.x, target.pos.y + target.height * 0.62, target.pos.z);
      if (kind.height) want.y = from.y;
      aim.subVectors(want, from);
      if (kind.height) aim.y = 0;
      aim.normalize();
    }
    const dir = aim.clone();
    if (kind.height) {
      // a wave: from in front of her, at its own height over the ground, level
      from.set(me.pos.x + aim.x * 0.5 * k, me.pos.y + kind.height * k, me.pos.z + aim.z * 0.5 * k);
    } else if (kind.steer && handKnown && handVel.lengthSq() > 4) {
      // an orb leaves her hand the way her hand was going, and curves in
      dir.addScaledVector(v.copy(handVel).normalize(), 0.55).normalize();
    }
    shots.push({ kind, def, pos: from, dir, aim: aim.clone(), target: kind.steer ? target : null, far: 0, done: new Set(), draw: fx.shot(def.shot) });
    move.fired = true;
  }
  function land(shot, target, world, at) {
    const k = size();
    target.hit({ power: shot.def.power, x: shot.dir.x, z: shot.dir.z, launch: !!shot.kind.launch, kind: shot.def.shot });
    shot.done.add(target);
    hits++; hitsT = COUNT;
    fx.burst(at, shot.kind.burst * k);
    if (shot.kind.blast) {
      for (const t of world.targets || []) {
        if (shot.done.has(t)) continue;
        const dx = t.pos.x - at.x, dz = t.pos.z - at.z, d = Math.hypot(dx, dz);
        if (d > shot.kind.blast * k) continue;
        t.hit({ power: shot.def.power * 0.5, x: dx / (d || 1), z: dz / (d || 1), launch: false, kind: 'blast' });
        shot.done.add(t); hits++;
      }
    }
    if (combo.onLand) combo.onLand(shot.def.shot, at);
  }

  const combo = {
    onLand: null,
    get active() { return !!move; },
    get hits() { return hits; },
    get beat() { return !move ? '' : move.kind === 'roll' ? 'กลิ้งหลบ' : `${HITS.indexOf(move.def) >= 0 ? HITS.indexOf(move.def) + 1 + ' · ' : ''}${move.def.name}`; },
    get index() { return move && move.kind === 'hit' ? HITS.indexOf(move.def) : -1; },
    get rising() { return !!move && move.def === RISE; },
    // how hard her hair and skirt should be held (0..1), and how far she is upside down (they should not hang by their weight then)
    get held() {
      if (!move) return 0;
      if (move.kind === 'roll') return Math.min(1, Math.max(0, 1 - (move.t - move.m.land) / 0.15));
      return move.def.clip === 'mc_3' ? 0.5 : 0.15;
    },
    get upside() {
      if (!move || move.kind !== 'roll') return 0;
      const u = move.t / move.m.land;
      return Math.min(1, Math.max(0, (u - 0.2) / 0.1)) * Math.min(1, Math.max(0, (0.9 - u) / 0.1));
    },
    attack() { wantHit = REMEMBER; },
    dodge() { wantRoll = 0.25; },
    stop() { move = null; wantHit = wantRoll = 0; },
    step(dt, me, world) {
      wantHit = Math.max(0, wantHit - dt); wantRoll = Math.max(0, wantRoll - dt);
      if (hitsT > 0) { hitsT -= dt; if (hitsT <= 0) hits = 0; }
      const stick = world.stick || { x: 0, z: 0, amount: 0 };
      if (move) move.t += dt;
      // ---- the roll: at any time but in a roll's own flight
      if (wantRoll > 0 && (!move || move.kind === 'hit' || move.t >= move.m.dur)) roll(me, world);
      if (!move) {
        if (wantHit > 0) begin(HITS[0], me, world, FADE.first);
        return !!move;
      }
      const m = move.m;
      if (move.kind === 'roll') {
        // she goes her way as the clip's path says; the attack button as her feet come under her: the rising cast
        const far = pathAt(m.path, 1, move.t, 0);
        me.pos.x += move.dx * (far - move.at[0]) * hh(); me.pos.z += move.dz * (far - move.at[0]) * hh();
        move.at[0] = far;
        const to = Math.atan2(move.dx, move.dz);
        me.heading += Math.atan2(Math.sin(to - me.heading), Math.cos(to - me.heading)) * Math.min(1, dt * 30);
        if (wantHit > 0 && move.t < m.free + 0.12) move.rise = true;      // (pressed in the roll: remembered until it may begin)
        if (move.rise && move.t >= m.counter) begin(RISE, me, world, FADE.rise);
        else if (move.t >= m.dur || (move.t >= m.free && stick.amount > 0.3)) { move = null; return false; }
        return true;
      }
      // ---- a cast: she turns to her target as it begins, and goes where the move takes her
      if (move.target && move.t < 0.14) {
        const to = Math.atan2(move.target.pos.x - me.pos.x, move.target.pos.z - me.pos.z);
        me.heading += Math.atan2(Math.sin(to - me.heading), Math.cos(to - me.heading)) * Math.min(1, dt * AIM_TURN);
      }
      if (m.path) {
        const x = pathAt(m.path, 2, move.t, 0), z = pathAt(m.path, 2, move.t, 1);
        const dx = (x - move.at[0]) * hh(), dz = (z - move.at[1]) * hh(), s = Math.sin(me.heading), c = Math.cos(me.heading);
        me.pos.x += c * dx + s * dz; me.pos.z += -s * dx + c * dz;
        move.at[0] = x; move.at[1] = z;
      }
      const i = HITS.indexOf(move.def);
      const last = i < 0 || i === HITS.length - 1;
      const from = last ? (m.again ?? m.dur) : m.cancel;
      if (wantHit > 0 && move.t >= from) begin(last ? HITS[0] : HITS[i + 1], me, world, last ? FADE.first : FADE.next);
      else if (move.t >= m.dur) move = null;
      else if (move.fired && stick.amount > 0.5 && move.t >= (m.cancel || m.hit + 0.14) + FREE) move = null;
      return !!move;
    },
    after(dt, me, world) {
      const k = size();
      // ---- her hand: the light gathering in it, the ribbon of its swing, the cast leaving it
      if (move && move.kind === 'hit') {
        const m = move.m;
        handAt(m.hand, hand);
        if (handKnown && dt > 1e-5) handVel.subVectors(hand, handWas).divideScalar(dt);
        handWas.copy(hand); handKnown = true;
        if (!move.fired) {
          const u = Math.min(1, move.t / m.hit), g = move.def.glow * k * (0.3 + 0.7 * u * u);
          if (m.hand === 'B') {
            // both hands: a light in each as they sweep round, one between them as they come together
            hands.R.getWorldPosition(v); hands.L.getWorldPosition(want);
            const near = Math.min(1, Math.max(0, 1 - (v.distanceTo(want) / k - 0.25) / 0.45));
            fx.glow('handR', v, g * 0.5 * (1 - 0.6 * near)); fx.glow('handL', want, g * 0.5 * (1 - 0.6 * near));
            if (near > 0.02) fx.glow('hand', hand, g * near);
            if (move.t > 0.16) { fx.trail('swingR', v); fx.trail('swingL', want); }
          } else fx.glow('hand', hand, g);
          if (move.t >= m.hit) fire(me, world);
        }
        if (m.hand !== 'B' && move.t > m.hit - 0.17 && move.t < m.hit + 0.09) fx.trail('swing', hand);
      }
      // ---- what is in flight
      const ground = world.ground || (() => -1e5);
      for (let j = shots.length - 1; j >= 0; j--) {
        const s = shots[j], kd = s.kind;
        let left = kd.speed * k * dt, over = false;
        while (left > 1e-6 && !over) {
          const stepLen = Math.min(left, 0.2 * k);
          left -= stepLen;
          if (kd.steer) {
            // it turns to its target (to the way it was thrown, with none)
            if (s.target) want.set(s.target.pos.x, s.target.pos.y + s.target.height * 0.62, s.target.pos.z).sub(s.pos).normalize();
            else want.copy(s.aim);
            s.dir.addScaledVector(want.sub(s.dir), Math.min(1, kd.steer * stepLen / (kd.speed * k))).normalize();
          }
          s.pos.addScaledVector(s.dir, stepLen);
          s.far += stepLen;
          for (const t of world.targets || []) {
            if (s.done.has(t)) continue;
            const d = Math.hypot(t.pos.x - s.pos.x, t.pos.z - s.pos.z);
            if (d > t.radius + kd.radius * k || s.pos.y < t.pos.y - 0.3 * k || s.pos.y > t.pos.y + t.height + kd.radius * k) continue;
            v.set(t.pos.x, kd.through ? Math.min(s.pos.y, t.pos.y + t.height * 0.8) : s.pos.y, t.pos.z);
            if (!kd.through) v.copy(s.pos);
            land(s, t, world, v);
            if (!kd.through) { over = true; s.draw.place(s.pos, s.dir, s.far); s.draw.end(true); break; }
          }
          if (!over && (s.far > kd.range * k || (!kd.height && s.pos.y < ground(s.pos.x, s.pos.z) + 0.05))) {
            over = true;
            if (s.far <= kd.range * k) { fx.burst(s.pos, kd.burst * 0.6 * k); s.draw.end(true); } else s.draw.end(false);
          }
        }
        if (over) shots.splice(j, 1);
        else {
          if (kd.height) s.pos.y = ground(s.pos.x, s.pos.z) + kd.height * k;      // (a wave follows the ground)
          s.draw.place(s.pos, s.dir, s.far);
        }
      }
    },
  };
  return combo;
}
