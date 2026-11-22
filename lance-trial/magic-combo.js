/* ==========================================================================
   magic-combo.js  —  Vivi's magic combo: the attack button pressed again and again is four casts, each a different move
   that goes straight into the next (a swipe, the swipe back, a whole turn into a cut, and both hands thrust out); held
   down, a lance of ice and water that grows in her hand until it is let go; pressed on the run, a leap that turns once round
   and comes down in a ring of light; and a roll that gets her out of the way, with a rising cast out of it. The moves'
   own rules and what they throw; nothing else. Her moves: magic-combo-anim.js (tools/make-magic-combo-anim.py), the
   roll the game's own clip. What is thrown is drawn by magic-combo-fx.js.

     const combo = createMagicCombo({ character, marks: MAGIC_COMBO, fx })
     combo.attack()                  the attack button goes down (remembered for a moment: a little early still counts)
     combo.release()                 the attack button comes up (it lets a held cast go)
     combo.dodge()                   the roll button
     combo.airShot(me, world)        the attack button in the air (the page's own jump has her; true: the combo has her
                                     now, the page ends that flight): a cast in the air, or over a target the rain.
                                     The button held on becomes the drop (combo.plunge, which a page may also call)
     combo.takeFall()                true once when a cast in the air is over and she is still up: the page lets its
                                     jump have her again (air.drop)
     (world.grounded: she is on the ground: tell it every frame; the casts in one flight are counted from it)
     every frame, before character.update(dt):
       combo.step(dt, me, world)     -> true while she is in one of its moves (the page then leaves her walking alone).
                                     me: { pos, vel, heading }; it turns her to what she casts at and moves her where
                                     a move takes her (the page keeps her out of things afterwards). me.vel as she
                                     was going before the press says whether she was running.
                                     world: { stick: { x, z, amount }, targets, ground(x, z) }
                                     a target: { pos (its foot), radius, height, hit({ power, x, z, launch, kind }) }
     every frame, after character.update(dt) and once she is placed (her bones are where they will be drawn):
       combo.after(dt, me, world)    the light at her hand, the cast leaving it, what is in flight and what it hits
     combo.active                    she is in a move; combo.airborne: dropping in the cast in the air (her height is the
                                     combo's then: the page must not put her on the ground)
     combo.beat                      what she is doing now (for a label); combo.index: which of the four casts (0..3, -1:
                                     none of them); combo.rising: the rising cast; combo.charge: how grown the held
                                     cast is (0..3; -1: she is not holding one); combo.aiming: she holds the lance or
                                     is throwing it (a page may bring its camera in over her shoulder)
     combo.hits                      how many casts have landed one after another (0 again 2.5 s after the last)
     combo.held, combo.upside        0..1: how hard her hair and skirt should be held now (the roll, the turns), and how
                                     far she is upside down (for character.holdSprings, as magic-jump.js')
     combo.stop()                    she is taken out of it some other way (falls, is thrown)
     combo.setCharacter(next)        another character takes her place (the game's picker): what she was doing is over,
                                     what is in flight flies on
     combo.onLand = (kind, at) => …  something landed (a page may shake its camera)
     combo.onBegin = (index, hit) => …   a move begins (index: which of the four casts, 0..3; -1: another move);
                                     hit: s from now that its cast leaves her hand (a page may time a sound to it)
     combo.onLance = (what, hit) => …   the held cast, for its sounds. 'open': she takes the lance and the circle
                                     opens before her; 'throw': she lets it go (hit: s from now that it leaves her
                                     hand and goes through the circle); 'drop': it is given up (a roll, a fall)

   The rules:
     - Tapped: a cast leaves her hand at its move's `hit`; from its `cancel` on the next press is the next move (pressed
       before: remembered, and it begins on the dot). Not pressed, the move ends in her standing pose; the stick pushed
       after the cancel moment walks her out of it sooner. After the fourth it is the first again, once the fourth is
       nearly over (its `again`: the finisher leaves her open for half a second); after a pause, the first.
     - Held: the first cast is the same (the press casts at once); the button still down at its cancel moment, her arm
       goes on round into the hold and a lance of ice and water is in her hand, growing at 0.35, 0.8 and 1.4 s (a ring of
       light at her hand each time). Let go, it is thrown: straight, fast, through everything in its way, harder the more it
       has grown; full grown, it bursts on all near each thing it goes through. Holding, she turns slowly to her target.
       A magic circle stands in the air before her while she holds it (the gate: on the line the lance will take, just
       past where her hand lets it go, facing the way she aims; more of it drawn and bigger each time the lance grows),
       and the lance is thrown through its middle ("ถ้าปาหอกเวท ขอเอฟเฟกต์คล้ายๆ มีวงแหวนเวท": asked which, the circle
       there while she charges and the lance through it). How all of it looks is the clip's it was asked after later
       the same day (magic-combo-fx.js: THE LANCE).
     - On the run (as fast as her run when the button goes down): she leaps the way she runs, turning once round in the
       air, her hands leaving rings of light; what she passes within arm's reach is hit; she comes down in a low cut and
       a ring goes out over the ground, hitting all inside it.
     - In the air (the page's jump), tapped: a cast at her target from one hand thrust out, then the other, each
       holding her up a moment (eight in one flight; after them she falls as she casts). Over a thing, once in a
       flight, the rain instead: she goes over forward till her head is down and spins, casting down at all under
       her for as long as the button is tapped, and on over, upright again. Not pressed again, she falls on.
     - In the air, held: she hangs a moment as her hand goes up, light gathering in it, then drops hard, and lands a
       blow: a ring goes out over the ground, wider than the leap's, and what is in it is thrown up.
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
const THROW = { clip: 'mc_throw', shot: 'lance', power: 2, glow: 0, name: 'ขว้างหอกแสง' };
const DASH = { clip: 'mc_dash', shot: null, power: 1.5, glow: 0.26, name: 'พุ่งหมุน', ring: { radius: 2.4, power: 2 }, reach: 1.25 };
// the cast in the air: dropping with her hand up (hang: s she hangs first; fall: m/s at most, pull: m/s² down), and the
// blow as she lands: a ring over the ground that throws what is in it up
const PLUNGE = { clip: 'mc_plunge', hang: 0.1, fall: 24, pull: 90, name: 'ทิ้งตัว' };
const SLAM = { clip: 'mc_slam', shot: null, glow: 0.5, name: 'กระแทกพื้น', ring: { radius: 3.2, power: 4, launch: true } };
// the held cast: its two clips, when it grows (s held), how hard it lands at each size, how fast she turns holding it (1/s)
// tilt: how far up its point is held (a slope); grip: how far along it from her hand to its point (of its length)
const CHARGE = { into: 'mc_charge_in', hold: 'mc_charge', grows: [0.35, 0.8, 1.4], power: [2, 3, 5, 8], turn: 2.6, burst: 1.6, tilt: 0.7, grip: 0.6 };
// the gate, the magic circle the lance is thrown through. hand: where her hand lets the lance go, in her own frame (m at
// 1.75 m: ahead of her, up, to her left; measured off the throw); ahead: how far past that, on the lance's line, the
// circle stands; radius: of its outer ring, by how grown the lance is (the clip's circle is a third of its lance's
// length across: bigger than the first circle here was, 0.26 to 0.4)
const GATE = { hand: [0.68, 1.47, -0.05], ahead: 0.4, radius: [0.32, 0.38, 0.45, 0.52] };
const RUN = 3.2;              // m/s: as fast as this when the button goes down, the running cast
// what is thrown: its pace (m/s), how near a target it lands (m, added to the target's own), how far it goes, how fast it
// turns to its target (1/s; 0: straight), the burst where it lands; through: it goes on through what it hits; blast: all
// within so far of where it lands are hit too; launch: what it hits is thrown up; height: it keeps so far over the ground
const SHOTS = {
  orb: { speed: 18, radius: 0.2, range: 15, steer: 9, burst: 0.75 },
  big: { speed: 13, radius: 0.45, range: 17, steer: 4, burst: 2.0, blast: 2.4 },
  wave: { speed: 14, radius: 0.85, range: 9, steer: 0, burst: 0.8, through: true, height: 0.95 },
  rise: { speed: 12, radius: 0.4, range: 7, steer: 0, burst: 0.9, through: true, launch: true, height: 0.85 },
  lance: { speed: 36, radius: 0.3, range: 26, steer: 0, burst: 0.8, through: true },
  bolt: { speed: 26, radius: 0.18, range: 14, steer: 12, burst: 0.5 },
};
// casting in the air (as Devil May Cry's gunfire in the air): each cast holds her up a moment. most: casts in one flight
// that do (after them she casts on, falling); over: s after a cast with none after it, she falls on; hold: the button
// held so long is the drop; pop: m/s up a cast gives her; pull: m/s² down between; sink: m/s down at most; fall: m/s²
// down once they are spent.
// The rain (once in a flight): over a thing (within `near` m of it, her feet `above` of its height up, `room` m of air
// under her): she goes over forward till her head is down and spins (`spin` rad/s), a cast down every `every` s at
// each thing within `wide` m in turn, for `lasts` s after the last press (`longest` s in all), sinking `drift` m/s;
// it is over `floor` m from the ground too; it is `costs` casts of the flight's
const AIR = { L: 'mc_air_l', R: 'mc_air_r', into: 'mc_rain_in', rain: 'mc_rain', out: 'mc_rain_out',
  most: 8, over: 0.27, hold: 0.22, pop: 0.75, pull: 7, sink: 1.5, fall: 16, power: 0.6,
  near: 1.8, above: 0.55, room: 1.5, floor: 1.0, every: 0.09, lasts: 0.6, longest: 1.8, costs: 4, spin: 13, wide: 3.5, drift: 0.4, quick: 1.7 };
const BOLT = { name: 'ยิงกลางอากาศ' }, RAIN = { name: 'หมุนยิงลง' };
const REMEMBER = 0.35;        // s a press of the attack button is remembered
const AIM_FAR = 13;           // m: she turns to a target no further than this
const AIM_TURN = 20;          // how fast she turns to it (1/s)
const FREE = 0.16;            // s after a move's cancel moment before the stick walks her out of it
const COUNT = 2.5;            // s the count of casts landed stays up
const FADE = { first: 0.09, next: 0.06, roll: 0.06, rise: 0.07, charge: 0.05, dash: 0.07 };

export function createMagicCombo({ character, marks, fx }) {
  const bone = n => character.model.getObjectByName(n);
  const handsOf = () => ({ R: bone('J_Bip_R_Middle1') || bone('J_Bip_R_Hand'), L: bone('J_Bip_L_Middle1') || bone('J_Bip_L_Hand') });
  let hands = handsOf();
  const size = () => character.height / 1.75;
  const hh = () => (character.hipsHeight || 1) * (character.size || 1);      // a hips height of hers, in the world (m)
  const has = name => !!character.actions[name] && !!marks.clips[name];
  // move: { kind: 'hit' | 'roll' | 'charge', def, m, t, fired, target, at: its path so far, press: the press that began it,
  //         level, draw: the lance in her hand, done: what a leap has hit, phase: 'in' | 'hold' }
  let move = null;
  let wantHit = 0, wantRoll = 0, hits = 0, hitsT = 0, down = false, press = 0, mote = 0, airShots = 0, rained = false, fell = false;
  const shots = [];
  const hand = new THREE.Vector3(), handWas = new THREE.Vector3(), handVel = new THREE.Vector3();
  const v = new THREE.Vector3(), aim = new THREE.Vector3(), want = new THREE.Vector3();
  const gateAt = new THREE.Vector3(), gateDir = new THREE.Vector3(0, 0, 1);      // the gate: its middle, the way it faces (the lance's line)
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
  const turnTo = (me, to, rate, dt) => { me.heading += Math.atan2(Math.sin(to - me.heading), Math.cos(to - me.heading)) * Math.min(1, dt * rate); };
  // the target she casts at: the nearest, one the stick points at (or she faces) more so. cone: only one so near ahead (radians)
  function pick(me, world, cone = 1.9) {
    const s = world.stick, pushed = s && s.amount > 0.3;
    const ax = pushed ? s.x : Math.sin(me.heading), az = pushed ? s.z : Math.cos(me.heading);
    let best = null, bestScore = 1e9;
    for (const t of world.targets || []) {
      const dx = t.pos.x - me.pos.x, dz = t.pos.z - me.pos.z, d = Math.hypot(dx, dz);
      if (d > AIM_FAR * size() || d < 1e-3) continue;
      const off = Math.acos(Math.min(1, Math.max(-1, (dx * ax + dz * az) / d)));
      if (off > cone && (cone < 1.9 || d > 3 * size())) continue;         // behind her and not near: not that one
      const score = d * (1 + 1.6 * off / Math.PI);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }
  // the way from `from` to her target (the way she faces, with none), level or nearly
  function aimFrom(me, from, target, flat) {
    aim.set(Math.sin(me.heading), 0, Math.cos(me.heading));
    if (target) {
      aim.set(target.pos.x - from.x, flat ? 0 : (target.pos.y + target.height * 0.62 - from.y) * 0.5, target.pos.z - from.z).normalize();
    }
    return aim;
  }
  function drop() {
    const held = !!(move && move.draw && !move.fired);
    if (held) move.draw.end(false);                                      // (a lance she still held goes out)
    if (move && move.gate) { move.gate.end(); move.gate = null; }        // (and the circle before her)
    if (held && combo.onLance) combo.onLance('drop', 0);
  }
  function begin(def, me, world, fade, more = null) {
    drop();
    if (character.state === def.clip) character.play('idle', 0);          // (the same move again: from its beginning)
    character.play(def.clip, fade, false);
    move = { kind: 'hit', def, m: marks.clips[def.clip], t: 0, fired: false, target: pick(me, world, def === DASH ? 0.6 : 1.9), at: [0, 0], press, ...more };
    wantHit = 0; handKnown = false;
    me.vel.set(0, 0, 0);
    if (combo.onBegin) combo.onBegin(HITS.indexOf(def), move.m.hit || 0);
  }
  function charge(me, world) {
    character.play(CHARGE.into, FADE.charge, false);
    move = { kind: 'charge', def: THROW, m: marks.clips[CHARGE.into], t: 0, phase: 'in', level: 0, fired: false, target: pick(me, world), draw: fx.shot('lance'),
      gate: fx.gate ? fx.gate() : null };
    wantHit = 0; mote = 0;
    if (combo.onLance) combo.onLance('open', 0);
  }
  function roll(me, world) {
    drop();
    const s = world.stick, pushed = s && s.amount > 0.2;
    const dx = pushed ? s.x : Math.sin(me.heading), dz = pushed ? s.z : Math.cos(me.heading);
    if (character.state === marks.roll.clip) character.play('idle', 0);
    character.play(marks.roll.clip, FADE.roll, false);
    character.setRate(marks.roll.rate);
    move = { kind: 'roll', m: marks.roll, t: 0, at: [0], dx, dz };
    wantRoll = 0;
    me.vel.set(0, 0, 0);
  }
  // the next cast in the air: from her other hand; it holds her up (while the flight has casts left)
  function airNext(me, world) {
    move.hand = move.hand === 'L' ? 'R' : 'L';
    character.play(AIR[move.hand], move.at === undefined ? 0.07 : 0.04, false);
    move.at = 0; move.fired = false; airShots++;
    if (airShots <= AIR.most) move.vy = Math.max(move.vy, AIR.pop * size());
    move.target = pick(me, world, 3.2) || move.target;
    move.press = press; move.pressAt = move.t; wantHit = 0;
  }
  // the rain is over: she goes on over, upright again (quick: with the drop after it)
  function rainOut(then) {
    character.play(AIR.out, 0.04, false);
    if (then) character.setRate(AIR.quick);
    move.phase = 'out'; move.at = 0; move.then = then; move.rate = then ? AIR.quick : 1;
  }
  // a small orb from a hand at a target (with none: the way given)
  function bolt(from, target, way) {
    const dir = way.clone();
    if (target) dir.set(target.pos.x - from.x, target.pos.y + target.height * 0.62 - from.y, target.pos.z - from.z);
    dir.normalize();
    shots.push({ kind: SHOTS.bolt, power: AIR.power, name: 'orb', pos: from.clone(), dir, aim: dir.clone(), target, far: 0, done: new Set(), draw: fx.shot('orb') });
  }
  // a thing is hit: told so, counted, a burst where
  function strike(target, hit, at, burst) {
    target.hit(hit);
    hits++; hitsT = COUNT;
    if (burst) fx.burst(at, burst, hit.kind === 'lance');                // (the lance's: its own sparkles, not gold)
  }
  function fire(me) {
    const { def, target } = move, k = size();
    let kind = SHOTS[def.shot], power = def.power;
    const draw = move.draw;
    handAt(move.m.hand, hand);
    const from = hand.clone();
    aimFrom(me, from, target, !!kind.height);
    const dir = aim.clone();
    if (kind.height) {
      // a wave: from in front of her, at its own height over the ground, level
      from.set(me.pos.x + aim.x * 0.5 * k, me.pos.y + kind.height * k, me.pos.z + aim.z * 0.5 * k);
    } else if (def === THROW) {
      // the lance: from where she held it, harder and wider the more it has grown; full grown, it bursts on what is near
      const g = move.level;
      kind = { ...kind, radius: kind.radius + 0.06 * g, burst: kind.burst + 0.25 * g, blast: g >= 3 ? CHARGE.burst : 0 };
      power = CHARGE.power[g];
      from.addScaledVector(dir, draw.long * CHARGE.grip * k);
      if (move.gate) {
        // through the middle of the circle: along the circle's own line, from where on it its point is (not past the circle)
        dir.copy(gateDir);
        from.copy(gateAt).addScaledVector(dir, Math.min(0, v.copy(from).sub(gateAt).dot(dir)));
        move.gate.fire(); move.gate = null;
      }
    } else if (kind.steer && handKnown && handVel.lengthSq() > 4) {
      // an orb leaves her hand the way her hand was going, and curves in
      dir.addScaledVector(v.copy(handVel).normalize(), 0.55).normalize();
    }
    shots.push({ kind, power, name: def.shot, pos: from, dir, aim: aim.clone(), target: kind.steer ? target : null, far: 0, done: new Set(), draw: draw || fx.shot(def.shot) });
    move.fired = true;
  }
  function land(shot, target, world, at) {
    const k = size();
    strike(target, { power: shot.power, x: shot.dir.x, z: shot.dir.z, launch: !!shot.kind.launch, kind: shot.name }, at, shot.kind.burst * k);
    shot.done.add(target);
    if (shot.kind.blast) {
      for (const t of world.targets || []) {
        if (shot.done.has(t)) continue;
        const dx = t.pos.x - at.x, dz = t.pos.z - at.z, d = Math.hypot(dx, dz);
        if (d > shot.kind.blast * k) continue;
        strike(t, { power: shot.power * 0.5, x: dx / (d || 1), z: dz / (d || 1), launch: false, kind: 'blast' }, at, 0);
        shot.done.add(t);
      }
    }
    if (combo.onLand) combo.onLand(shot.name, at);
  }

  const combo = {
    onLand: null, onBegin: null, onLance: null,
    get active() { return !!move; },
    get hits() { return hits; },
    get beat() {
      if (!move) return '';
      if (move.kind === 'roll') return 'กลิ้งหลบ';
      if (move.kind === 'plunge') return PLUNGE.name;
      if (move.kind === 'airshot' || move.kind === 'rain') return move.def.name;
      if (move.kind === 'charge') return `ชาร์จ ${'★'.repeat(move.level)}${'☆'.repeat(3 - move.level)}`;
      const i = HITS.indexOf(move.def);
      return `${i >= 0 ? i + 1 + ' · ' : ''}${move.def.name}`;
    },
    get index() { return move && move.kind === 'hit' ? HITS.indexOf(move.def) : -1; },
    get airborne() { return !!move && (move.kind === 'plunge' || move.kind === 'airshot' || move.kind === 'rain'); },
    takeFall() { const f = fell; fell = false; return f; },
    get rising() { return !!move && move.kind === 'hit' && move.def === RISE; },
    get charge() { return move && move.kind === 'charge' ? move.level : -1; },
    get aiming() { return !!move && (move.kind === 'charge' || (move.def === THROW && move.t < move.m.hit + 0.18)); },
    // how hard her hair and skirt should be held (0..1), and how far she is upside down (they should not hang by their weight then)
    get held() {
      if (!move) return 0;
      if (move.kind === 'roll') return Math.min(1, Math.max(0, 1 - (move.t - move.m.land) / 0.15));
      return move.kind === 'airshot' ? 0.3 : move.kind === 'plunge' || move.kind === 'rain' ? 0.9 : move.def === DASH ? 0.6 : move.def === HITS[2] ? 0.5 : 0.15;
    },
    get upside() {
      if (move && move.kind === 'rain') return move.phase === 'loop' ? 1 : 0.5;
      if (!move || move.kind !== 'roll') return 0;
      const u = move.t / move.m.land;
      return Math.min(1, Math.max(0, (u - 0.2) / 0.1)) * Math.min(1, Math.max(0, (0.9 - u) / 0.1));
    },
    attack() { wantHit = REMEMBER; down = true; press++; },
    release() { down = false; },
    dodge() { wantRoll = 0.25; },
    airShot(me, world) {
      if (!has(AIR.L) || !has(AIR.R)) return false;
      drop();
      const k = size(), g = (world.ground || (() => -1e5))(me.pos.x, me.pos.z);
      const under = !rained && airShots < AIR.most && has(AIR.into) && has(AIR.rain) && has(AIR.out) && me.pos.y - g > AIR.room * k
        && (world.targets || []).some(t => Math.hypot(t.pos.x - me.pos.x, t.pos.z - me.pos.z) < AIR.near * k && me.pos.y - t.pos.y > AIR.above * t.height);
      me.vel.x *= 0.3; me.vel.z *= 0.3;
      if (under) {
        character.play(AIR.into, 0.06, false);
        move = { kind: 'rain', def: RAIN, phase: 'in', t: 0, at: 0, until: AIR.lasts, next: 0, hand: 'R', i: 0, vy: AIR.pop * k, press, pressAt: 0, rate: 1 };
        rained = true; airShots += AIR.costs; wantHit = 0;
      } else {
        move = { kind: 'airshot', def: BOLT, t: 0, hand: 'R', vy: 0, target: null };
        airNext(me, world);
      }
      wantRoll = 0;
      return true;
    },
    plunge(me, world) {
      if (!has(PLUNGE.clip) || !has(SLAM.clip)) return false;
      drop();
      character.play(PLUNGE.clip, 0.08, false);
      move = { kind: 'plunge', def: SLAM, m: marks.clips[PLUNGE.clip], t: 0, vy: 1.5 * size(), fired: false, target: pick(me, world) };
      wantHit = wantRoll = 0;
      return true;
    },
    stop() { drop(); move = null; wantHit = wantRoll = 0; },
    setCharacter(next) { combo.stop(); character = next; hands = handsOf(); handKnown = false; },
    step(dt, me, world) {
      wantHit = Math.max(0, wantHit - dt); wantRoll = Math.max(0, wantRoll - dt);
      if (hitsT > 0) { hitsT -= dt; if (hitsT <= 0) hits = 0; }
      const stick = world.stick || { x: 0, z: 0, amount: 0 };
      if (move) move.t += dt;
      if (world.grounded) { airShots = 0; rained = false; }
      // ---- casting in the air: each cast holds her up; the button held is the drop; no more of them, she falls on
      if (move && (move.kind === 'airshot' || move.kind === 'rain')) {
        const k = size(), g = (world.ground || (() => -1e5))(me.pos.x, me.pos.z), slow = Math.exp(-3 * dt);
        const held = down && move.press === press && move.t - move.pressAt > AIR.hold;
        if (move.kind === 'airshot') {
          if (held && combo.plunge(me, world)) return true;
          const spent = airShots > AIR.most;
          move.at += dt;
          move.vy = Math.max(-(spent ? AIR.fall : AIR.sink) * k, move.vy - (spent ? AIR.fall : AIR.pull) * k * dt);
          if (move.target) turnTo(me, Math.atan2(move.target.pos.x - me.pos.x, move.target.pos.z - me.pos.z), 14, dt);
          if (wantHit > 0 && move.at >= marks.clips[AIR[move.hand]].again) airNext(me, world);
          else if (move.at >= AIR.over) { move = null; fell = true; return false; }
        } else {
          // ---- the rain: over (the spin beginning), casting (as long as she is asked, and has the air), and on over
          const whole = marks.clips[move.phase === 'out' ? AIR.out : AIR.into].dur / move.rate, u = Math.min(1, move.at / whole);
          move.at += dt;
          if (wantHit > 0) { wantHit = 0; move.press = press; move.pressAt = move.t; move.until = Math.min(AIR.longest, move.t + AIR.lasts); }
          if (move.phase === 'in') {
            me.heading += AIR.spin * u * u * dt;
            if (move.at >= whole) { character.play(AIR.rain, 0.03, false); move.phase = 'loop'; }
          } else if (move.phase === 'loop') {
            me.heading += AIR.spin * dt;
            if (held) rainOut('drop');
            else if (move.t >= move.until || me.pos.y - g < AIR.floor * k) rainOut(null);
          } else {
            me.heading += AIR.spin * (1 - u) * (1 - u) * dt;
            if (move.at >= whole) {
              if (move.then && combo.plunge(me, world)) return true;
              move = null; fell = true; return false;
            }
          }
          if (move.phase === 'out') move.vy = Math.max(-AIR.fall * k, move.vy - AIR.fall * 0.6 * k * dt);
          else move.vy += (-AIR.drift * k - move.vy) * Math.min(1, dt * 6);
        }
        me.vel.x *= slow; me.vel.z *= slow;
        me.pos.x += me.vel.x * dt; me.pos.z += me.vel.z * dt; me.pos.y += move.vy * dt;
        if (me.pos.y <= g) { me.pos.y = g; move = null; return false; }
        wantRoll = 0;
        return true;
      }
      // ---- dropping in the cast in the air: a breath as her hand goes up, then down hard; on the ground, the blow
      if (move && move.kind === 'plunge') {
        const k = size(), g = (world.ground || (() => me.pos.y))(me.pos.x, me.pos.z), slow = Math.exp(-4 * dt);
        move.vy = Math.max(-PLUNGE.fall * k, move.vy - (move.t < PLUNGE.hang ? 14 : PLUNGE.pull) * k * dt);
        me.vel.x *= slow; me.vel.z *= slow;
        me.pos.x += me.vel.x * dt; me.pos.z += me.vel.z * dt; me.pos.y += move.vy * dt;
        if (move.target) turnTo(me, Math.atan2(move.target.pos.x - me.pos.x, move.target.pos.z - me.pos.z), 6, dt);
        if (me.pos.y <= g) { me.pos.y = g; begin(SLAM, me, world, 0.05); }
        wantRoll = 0;
        return true;
      }
      // ---- the roll: at any time but in a roll's own flight (and on the ground: in the air it waits, as her first cast does)
      if (wantRoll > 0 && world.grounded !== false && (!move || move.kind !== 'roll' || move.t >= move.m.dur)) roll(me, world);
      if (!move) {
        // the attack button: on the run, the leap; else the first cast
        if (wantHit > 0 && world.grounded !== false) {            // (in the air it waits: on the ground in time, it is her first cast)
          if (has(DASH.clip) && Math.hypot(me.vel.x, me.vel.z) > RUN * size()) begin(DASH, me, world, FADE.dash, { done: new Set() });
          else begin(HITS[0], me, world, FADE.first);
        }
        return !!move;
      }
      const m = move.m;
      if (move.kind === 'roll') {
        // she goes her way as the clip's path says; the attack button as her feet come under her: the rising cast
        const far = pathAt(m.path, 1, move.t, 0);
        me.pos.x += move.dx * (far - move.at[0]) * hh(); me.pos.z += move.dz * (far - move.at[0]) * hh();
        move.at[0] = far;
        turnTo(me, Math.atan2(move.dx, move.dz), 30, dt);
        if (wantHit > 0 && move.t < m.free + 0.12) move.rise = true;      // (pressed in the roll: remembered until it may begin)
        if (move.rise && move.t >= m.counter) begin(RISE, me, world, FADE.rise);
        else if (move.t >= m.dur || (move.t >= m.free && stick.amount > 0.3)) { move = null; return false; }
        return true;
      }
      if (move.kind === 'charge') {
        // holding the lance: it grows; she turns slowly to her target; let go (once she has it cocked), it is thrown
        move.target = pick(me, world) || move.target;
        if (move.target) turnTo(me, Math.atan2(move.target.pos.x - me.pos.x, move.target.pos.z - me.pos.z), CHARGE.turn, dt);
        else if (stick.amount > 0.3) turnTo(me, Math.atan2(stick.x, stick.z), CHARGE.turn, dt);
        let level = 0;
        for (const g of CHARGE.grows) if (move.t >= g) level++;
        if (level > move.level) move.grew = true;
        move.level = level;
        if (move.phase === 'in' && move.t >= m.dur) { move.phase = 'hold'; character.play(CHARGE.hold, FADE.charge, false); }
        if (!down && move.phase === 'hold') {
          const { level: g, draw, gate, target } = move;
          move.draw = null; move.gate = null;
          begin(THROW, me, world, FADE.charge, { level: g, draw, gate });
          move.target = target || move.target;
          if (combo.onLance) combo.onLance('throw', move.m.hit || 0);
        }
        return true;
      }
      // ---- a cast: she turns to her target as it begins, and goes where the move takes her
      if (move.target && move.t < 0.14) turnTo(me, Math.atan2(move.target.pos.x - me.pos.x, move.target.pos.z - me.pos.z), AIM_TURN, dt);
      if (m.path) {
        const x = pathAt(m.path, 2, move.t, 0), z = pathAt(m.path, 2, move.t, 1);
        const dx = (x - move.at[0]) * hh(), dz = (z - move.at[1]) * hh(), s = Math.sin(me.heading), c = Math.cos(me.heading);
        me.pos.x += c * dx + s * dz; me.pos.z += -s * dx + c * dz;
        move.at[0] = x; move.at[1] = z;
      }
      const i = HITS.indexOf(move.def);
      const last = i < 0 || i === HITS.length - 1;
      const from = last ? (m.again ?? m.dur) : m.cancel;
      // the button still down since the press that began the first cast: the held cast
      if (i === 0 && down && move.press === press && move.t >= from && has(CHARGE.into) && has(CHARGE.hold) && has(THROW.clip)) charge(me, world);
      else if (wantHit > 0 && move.t >= from) begin(last ? HITS[0] : HITS[i + 1], me, world, last ? FADE.first : FADE.next);
      else if (move.t >= m.dur) move = null;
      else if (move.fired && stick.amount > 0.5 && move.t >= (m.cancel || m.hit + 0.14) + FREE) move = null;
      return !!move;
    },
    after(dt, me, world) {
      const k = size();
      const ground = world.ground || (() => -1e5);
      // ---- holding the lance: in her right hand, pointing at her target; light drawn in to it; a ring each time it grows
      if (move && (move.kind === 'charge' || (move.def === THROW && !move.fired))) {
        if (move.gate) {
          // the circle before her: on the line from where her hand will let the lance go to her target
          const sn = Math.sin(me.heading), c = Math.cos(me.heading), [ahead, up, left] = GATE.hand;
          gateAt.set(me.pos.x + (sn * ahead + c * left) * k, me.pos.y + up * k, me.pos.z + (c * ahead - sn * left) * k);
          gateDir.copy(aimFrom(me, gateAt, move.target, false));
          gateAt.addScaledVector(gateDir, GATE.ahead * k);
          move.gate.size(move.level);
          move.gate.place(gateAt, gateDir, GATE.radius[move.level] * k);
        }
        handAt('R', hand);
        aimFrom(me, hand, move.target, false);
        // held, its point is up over her shoulder (from behind her its whole length shows); thrown, it comes down level
        aim.y += CHARGE.tilt * (move.kind === 'charge' ? 1 : Math.max(0, 1 - move.t / move.m.hit));
        aim.normalize();
        move.draw.size(move.level);
        move.draw.place(v.copy(hand).addScaledVector(aim, move.draw.long * CHARGE.grip * k), aim, 0);
        fx.glow('hand', hand, (0.12 + 0.04 * move.level) * k);
        if (move.kind === 'charge') {
          mote -= dt;
          if (mote <= 0 && move.level < 3) { mote = 0.11; fx.motes(hand, 1, 0.7 * k, true); }
          if (move.grew) { move.grew = false; fx.burst(hand, (0.3 + 0.1 * move.level) * k, true); }
        }
      }
      // ---- casting in the air: a light in each hand; a cast leaves the hand thrust out. The rain: one every so often,
      // from each hand in turn, at each thing under her in turn (with none: down, round her as she spins)
      if (move && (move.kind === 'airshot' || move.kind === 'rain')) {
        const r = handAt('R', new THREE.Vector3()).clone(), l = handAt('L', new THREE.Vector3()).clone();
        // (the hand a cast has just left flares)
        const flare = move.kind === 'airshot' && move.fired ? Math.max(0, 1 - (move.at - marks.clips[AIR[move.hand]].hit) / 0.08) : 0;
        fx.glow('handR', r, (0.2 + (move.hand === 'R' ? 0.2 * flare : 0)) * k); fx.glow('handL', l, (0.2 + (move.hand === 'L' ? 0.2 * flare : 0)) * k);
        if (move.kind === 'airshot') {
          if (!move.fired && move.at >= marks.clips[AIR[move.hand]].hit) {
            move.fired = true;
            const from = move.hand === 'R' ? r : l;
            bolt(from, move.target, v.set(Math.sin(me.heading), -0.3, Math.cos(me.heading)));
          }
        } else if (move.phase === 'loop') {
          move.next -= dt;
          if (move.next <= 0) {
            move.next += AIR.every; move.hand = move.hand === 'L' ? 'R' : 'L';
            const under = (world.targets || []).filter(t => Math.hypot(t.pos.x - me.pos.x, t.pos.z - me.pos.z) < AIR.wide * k && t.pos.y < me.pos.y);
            bolt(move.hand === 'R' ? r : l, under.length ? under[move.i++ % under.length] : null, v.set(Math.sin(me.heading) * 0.35, -1, Math.cos(me.heading) * 0.35));
          }
        }
      }
      // ---- dropping: the light in her raised hand, growing, and its ribbon behind her
      if (move && move.kind === 'plunge') {
        handAt('R', hand);
        fx.glow('hand', hand, (0.2 + 0.4 * Math.min(1, move.t / 0.3)) * k);
        fx.trail('swing', hand);
      }
      // ---- her hand: the light gathering in it, the ribbon of its swing, the cast leaving it
      if (move && move.kind === 'hit') {
        const m = move.m, def = move.def;
        handAt(m.hand, hand);
        if (handKnown && dt > 1e-5) handVel.subVectors(hand, handWas).divideScalar(dt);
        handWas.copy(hand); handKnown = true;
        if (def.ring) {
          // the leap: rings of light off both hands as she turns; what she passes is hit. Down (the leap, the blow out of
          // the air), a ring over the ground
          const [up, dn] = m.air || [1, 0];
          if (!def.reach && !move.fired) fx.glow('hand', hand, def.glow * k);
          if (def.reach && move.t > up && move.t < dn + 0.06) {
            hands.R.getWorldPosition(v); fx.trail('swingR', v);
            hands.L.getWorldPosition(want); fx.trail('swingL', want);
            fx.glow('handR', v, def.glow * k); fx.glow('handL', want, def.glow * 0.8 * k);
            for (const t of world.targets || []) {
              const dx = t.pos.x - me.pos.x, dz = t.pos.z - me.pos.z, d = Math.hypot(dx, dz);
              if (move.done.has(t) || d > def.reach * k + t.radius) continue;
              move.done.add(t);
              v.set(t.pos.x, t.pos.y + t.height * 0.6, t.pos.z);
              strike(t, { power: def.power, x: dx / (d || 1), z: dz / (d || 1), launch: false, kind: 'leap' }, v, 0.6 * k);
            }
          }
          if (!move.fired && move.t >= m.hit) {
            move.fired = true;
            v.set(me.pos.x, ground(me.pos.x, me.pos.z) + 0.14 * k, me.pos.z);
            fx.ring(v, def.ring.radius * k);
            if (!def.reach) fx.burst(hand, 1.1 * k);
            for (const t of world.targets || []) {
              const dx = t.pos.x - me.pos.x, dz = t.pos.z - me.pos.z, d = Math.hypot(dx, dz);
              if (d > def.ring.radius * k + t.radius) continue;
              want.set(t.pos.x, t.pos.y + t.height * 0.4, t.pos.z);
              strike(t, { power: def.ring.power, x: dx / (d || 1), z: dz / (d || 1), launch: !!def.ring.launch, kind: 'ring' }, want, 0.6 * k);
            }
            if (combo.onLand) combo.onLand('ring', v);
          }
        } else if (def !== THROW) {
          if (!move.fired) {
            const u = Math.min(1, move.t / m.hit), g = def.glow * k * (0.3 + 0.7 * u * u);
            if (m.hand === 'B') {
              // both hands: a light in each as they sweep round, one between them as they come together
              hands.R.getWorldPosition(v); hands.L.getWorldPosition(want);
              const near = Math.min(1, Math.max(0, 1 - (v.distanceTo(want) / k - 0.25) / 0.45));
              fx.glow('handR', v, g * 0.5 * (1 - 0.6 * near)); fx.glow('handL', want, g * 0.5 * (1 - 0.6 * near));
              if (near > 0.02) fx.glow('hand', hand, g * near);
              if (move.t > 0.16) { fx.trail('swingR', v); fx.trail('swingL', want); }
            } else fx.glow('hand', hand, g);
          }
          if (m.hand !== 'B' && move.t > m.hit - 0.17 && move.t < m.hit + 0.09) fx.trail('swing', hand);
        }
        if (def.shot && !move.fired && move.t >= m.hit) fire(me);
      }
      // ---- what is in flight
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
            if (kd.through) v.set(t.pos.x, Math.min(s.pos.y, t.pos.y + t.height * 0.8), t.pos.z); else v.copy(s.pos);
            land(s, t, world, v);
            if (!kd.through) { over = true; s.draw.place(s.pos, s.dir, s.far); s.draw.end(true); break; }
          }
          if (!over && (s.far > kd.range * k || (!kd.height && s.pos.y < ground(s.pos.x, s.pos.z) + 0.05))) {
            over = true;
            if (s.far <= kd.range * k) { fx.burst(s.pos, kd.burst * 0.6 * k, s.name === 'lance'); s.draw.end(true); } else s.draw.end(false);
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
