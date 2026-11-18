/* ==========================================================================
   plant-boss-turn.js  —  the plant boss turning on its roots, to keep its faces to someone who walks round it: all the
   way round, and round again. One job: turn it. It moves no head and says nothing: it turns the whole boss (its
   Group's rotation.y) and tells plant-boss.js to turn the roots back by as much (body.roots), so the roots stay where
   they are in the ground and the rest of the plant comes round on them.

     const turn = createBossTurn(boss)            (as it stands then is how it stands when it has turned to no one)
     every frame: turn.update(dt, at, follows)    at: who it turns to (world, a Vector3); follows: false: it stays as it
                                                  is (it has not seen them). Before whatever calls boss.userData.pose()
                                                  that frame (plant-boss-talk.js, plant-boss-moves.js)
     turn.angle     radians it has turned from how it was placed (it goes on past a full turn)
     turn.off       radians from the way it faces to where they are (0: before it; near 3.14 either way: behind it)
     turn.speed     radians a second it is turning now

   How it turns (BOSS_TURN): slowly and heavily. It does not stir for a step to one side (its heads and eyes follow
   that by themselves); once they are well off to one side it sets off, picks up speed, comes round the nearer way,
   and slows as it gets there. It is not fast: someone running round it close by gets behind it for a moment, and
   its heads look back over their necks while the rest of it comes round. Its top comes after its foot (body.twist:
   the heads trail the turn, the skirt's leaves swing out and trail by their tips) and swings a little past as it stops.
   ========================================================================== */

export const BOSS_TURN = {
  speed: 0.6,       // radians a second, at most (a half turn in some five seconds)
  push: 1.2,        // how fast it picks up and loses speed, radians a second each second
  keen: 1.6,        // how hard it goes for a given angle off (it slows as it gets there)
  wakes: 0.35,      // radians off to one side before it sets off
  rests: 0.05,      // radians off at which it has got there
  loose: 3.2,       // its top coming after its foot: how quick,
  damp: 0.5,        //   and how damped (less: it swings further past)
  most: 0.45,       // the most it is ever twisted, radians
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));                          // an angle as the nearer way round: -pi..pi

export function createBossTurn(boss, T = BOSS_TURN) {
  const body = boss.userData.body, placed = boss.rotation.y;
  const top = { x: 0, v: 0 };                         // where its top has got to (radians, as angle), coming after
  let turning = false;
  const me = { angle: 0, off: 0, speed: 0, update };

  function update(dt, at, follows = true) {
    dt = Math.min(dt, 0.05);
    const dx = at.x - boss.position.x, dz = at.z - boss.position.z;
    me.off = Math.hypot(dx, dz) > 0.5 ? wrap(Math.atan2(dx, dz) - (placed + me.angle)) : 0;
    if (!follows) turning = false;
    else if (!turning) turning = Math.abs(me.off) > T.wakes;
    else if (Math.abs(me.off) < T.rests && Math.abs(me.speed) < 0.05) turning = false;
    // toward them the nearer way, slower as it gets there; its speed changes only so fast (it is heavy)
    const want = turning ? clamp(me.off * T.keen, -T.speed, T.speed) : 0;
    me.speed += clamp(want - me.speed, -T.push * dt, T.push * dt);
    me.angle += me.speed * dt;
    // its top after its foot: a loose spring, in small steps (the same at any frame rate)
    const n = Math.max(1, Math.ceil(dt / 0.0084)), h = dt / n;
    for (let i = 0; i < n; i++) { top.v += (T.loose * T.loose * (me.angle - top.x) - 2 * T.damp * T.loose * top.v) * h; top.x += top.v * h; }
    boss.rotation.y = placed + me.angle;
    body.roots = -me.angle;
    body.twist = clamp(top.x - me.angle, -T.most, T.most);
  }
  return me;
}
