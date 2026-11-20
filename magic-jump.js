/* ==========================================================================
   magic-jump.js  —  Vivi's magic jump: up to four jumps in one flight, each off a magic circle that opens under her feet
   (magic-circle-fx.js). The others fly; she jumps. Her body in the air, and the jump's own rules; nothing else.

     const air = createMagicJump({ character, circles, mocap, step })
                                     mocap: the first jump off the ground and a landing from high are the mocap's (Mixamo's
                                     Jumping Up and Jumping Down, posed again for her: tools/make-magic-jump-mocap.py),
                                     if her clips have them (mj_up, mj_land, mj_wall: magic-jump-mocap-anim.js). The
                                     game asks for it (player-moves.js); magic-jump.html?mocap=0 is the jump before it
                                     step (a trial: magic-jump.html, not the game yet): every jump in the air off a circle
                                     under her feet, one of four ways: 'flow' (the user's four moves from the library; her
                                     clips must have them: magic-jump-flow-anim.js), 'sky' (the Air Step: one foot at a
                                     time, right, left, right, the last into a pose ready to cast), 'dmc' (Devil May Cry's
                                     Air Hike: both feet stamped down, off at once) or 'stand' (true: onto it, a crouch, a
                                     push). See "The step" below. air.stepMode: which (taken up at her next jump in the
                                     air; false: none)
     air.takeOff(me)                 the jump button on the ground: the first jump (a small circle on the ground)
     air.drop(me, up, used, soft)    she left the ground some other way (off an edge, out of a hop: up m/s): falling, three
                                     jumps left (used: how many she has used, if not one: air.tier as it was, when
                                     something else had her in the air a while; soft: out of a pose of that something's,
                                     the falling pose takes her over a moment, not at once)
     air.kickOff(me, ax, az)         climbing, she kicks off the rock: away from it the way (ax, az) (unit, over the
                                     ground) and up, turning round to face away from it (the mocap's, mj_wall); three
                                     jumps left. false: her clips have no mj_wall (nothing done)
     air.press(me, stick)            the jump button in the air: the next one, if she has one left (false: none)
     air.end()                       the flight is over some other way (she took hold of a rock, swims, was put back): no
                                     landing; her body eases out of it into whatever plays next
     every frame she is in the air (air.active), after she has been moved across the ground:
       air.step(dt, me, stick, ground, catchable)  -> 'landed' on the frame she comes down (her clip is the landing's then).
                                     catchable: false where no circle should catch her (coming down into deep water)
     every frame (on the ground too: she eases out of the flight into the landing), after character.update(dt) and once
     she is placed (her object at her feet, turned to her heading):
       air.pose(dt, me)              her whole body in the air: its turns (the flip, the spin, her lean) and her limbs
     air.held                        0..1: how hard her hair and skirt should be held now: a little all through a flight (a
                                     long fall would blow her skirt up), hard through the flip and the spin
     air.upside                      0..1: how far she is upside down (her hair and skirt should not hang by their weight then)
     air.tier, air.beat              how many jumps this flight; what she is doing now (for a label)
     air.vy                          how fast she is going up (m/s; down: below 0)
     air.impact                      0..1, for a moment after she lands: how hard she came down (a page may slow her by it)
     air.landing                     the landing she came down into: { clip, rate, hold } (the page plays it on: clip at
                                     rate, and she may run on out of it after hold s)

   me: { pos (her feet, world), vel (her speed over the ground: x, z), heading }, the page's, changed here.
   stick: { x, z, amount }: where the stick points over the ground (unit) and how far it is pushed (0..1).
   ground: the height of what is under her now.

   The four jumps (numbers for a girl 1.75 m tall; a smaller or bigger one gets them in her own size):
     1  off the ground: the game's take-off clip, a little over waist high            rises HEIGHTS[0]
     2  a leap: her hand flicked down at the circle she kicks off, then reaching up     rises HEIGHTS[1] more
     3  a front flip: stretched, tucked, opened out                                    rises HEIGHTS[2] more
     4  a full turn: her hands at her chest, then one swept up over her head            rises HEIGHTS[3] more
   From the 2nd on, each a little less than the one before: it is a jump, not flying. Each in the air waits WINDUP s first (her knees come
   up, she stops falling), then she kicks and the circle opens under her.
   Where she goes: with the stick pushed, each jump sends her the way it points at a run's pace (PUSH: no faster than she
   runs, or four jumps would carry her over any gap), and she turns to face it. With the stick let go she goes straight up,
   keeping only a little of the way she was going (KEEP), so she can come down on a ledge's top and not overshoot it.
   Between jumps the stick only steers a little (AIR).
   A long fall (more than CUSHION m) is caught: a circle opens on the ground under her before she reaches it, and close
   over it she is slowed.

   How she moves (what makes it a jump and not a row of pictures):
   Her weight. She is pulled as hard as in the game's own jump, harder on the way down, and let off only at the very top
   of each jump: a moment on the 1st and 2nd (the top is easy to press on), longer on the 3rd and 4th, which she spends
   turning. She does not drift.
   Her body. In the air her arms, legs, back and head are not played from clips. Each jump is a few poses (the kick, the
   move, a gathering under her for the next), and she is carried from one to the next by springs: her back first, her
   forearms and shins a little after her arms and thighs. So a pose never just appears: she arrives in it, runs a little
   past and settles, and whenever the button is pressed what she does next starts from where she is.
   The clips (the library's) are under it: the take-off from the ground, the landing, and her hips and hands in between.
   Her standing pose is the base. She stands with her left foot ahead and her right behind her, turned out (the library's
   idle). The first jump leaves from that and every flight comes down into it: her right leg pushes off from where it
   stands and trails behind her, softly bent (not swung in under her like a post); just over the ground her legs are her
   standing pose's own, and the landing clip, whose feet are in the same two places, takes her on from the frame she
   touches. Where the landing shows, only its bent knees are turned (to face ahead): her feet are the clip's, where it
   has them and turned as it has them, so she comes up into her standing pose with no foot moving on the ground.
   With the mocap (mocap: true): the jump button on the ground plays the mocap's take-off. From standing she crouches
   (quickly: a little over half as deep as the mocap, 0.07 s down) and pushes up; her feet stay where she stands and
   she leaves the ground UP_LIFT s after the press, her hips going as fast as the game then lifts her. Running she
   starts at the push, out of her stride. Up to the top of the first jump her body is the mocap's (in place: the game
   lifts her); then the poses above take her on, beginning from where the mocap left her (her limbs as they are, going
   as they were going), at the top, or as soon as she presses again or starts down. Every flight ends in the mocap's
   landing (mj_land, Mixamo's Falling To Landing): down into a crouch and up into her standing pose; coming down with
   the stick pushed she runs on out of it before its bottom. Kicking off a rock (kickOff) she is the mocap's until its clip ends or she presses again (not
   when she starts down: she is still turning), and the way she faces goes round 180 degrees to her right as WALL_TURN
   goes (the clip has her hips turned back by as much: tools/make-magic-jump-mocap.py, wall_turn); the stick does not
   turn her until she is round.

   The step (step: true). Asked for: "stepping on a magic circle and kicking up off it, one floor at a time". Without it
   the circle opens as she leaves it, a little under her feet (her knees drawn up for the kick), so she is never seen on
   it. With it, a jump in the air goes:
     the press: the circle opens where her feet will be (STEP.reach s on, at her pace over the ground); her legs reach
       down for it (the 'reach' pose: her standing pose's legs) and she comes down onto it, STEP.drop m, quicker and
       quicker. The circle is a little grander for each floor, as before
     on it: she stands on it, still over the ground, crouching (crouchPad, STEP.crouch s: her weight taken, the circle
       giving under her: magic-circle-fx.js, press) then pushing (pushPad, STEP.push s). Her feet are kept on it: her
       whole body is moved up or down (standOff) so that the lower of her soles is on the circle, so as her knees bend
       she goes down and as she pushes she comes up (her soles: how high her ankles and toes are as she stands, measured)
     the kick: as she leaves it, as fast up as the jump needs (its height and the STEP.drop she came down); the stick as
       it was at the press sends her its way. The circle springs back, its light goes down, a wave goes round it, and it
       stays a while under her (kick), so the floors she climbed stand under her like steps
     off it: the 2nd and 3rd her arms on up over her head (risePad), then a knee drawn up (tuck1: her left; the 3rd
       tuck1M, her right: a step up each); the 4th still turns (kick4, twirl4, bloom4). No flip: one move, done the same
       way each floor, reads as climbing; the turn is the last floor's flourish
   The Air Hike (step: 'dmc'), asked for after the step above did not feel like Devil May Cry: a stamp, not a stand. At
   the press she is held DMC.stomp s while both legs are driven straight down (stomp) onto a circle that flashes open
   under her at once (magic-circle-fx.js, snap), and kicked at once; she is off it as fast as the game's jump, her knees
   snatched up (tuckHard, the 3rd tuckHardM), the 4th a front flip (tuck3, open3). The circle goes DMC.after s after.
   The Air Step (step: 'sky'), the user's own: after the jump off the ground, three steps up the air, one foot at a time:
     Air Step 1, her right foot: at the top of the first jump she waits on her right knee (skyWaitR); at the press her
       right foot is driven down onto a circle that flashes open under it (out to its side: SKY.side), her body held
       SKY.drive s (skyStepR: her left knee driven up, her arms swung as a runner's), and she is off it, her right leg
       trailing, her left knee high (skyRiseR), and waits on it (skyWaitL)
     Air Step 2, her left foot, the same the other way round (skyStepL, skyRiseL, skyWaitR), leaning on ahead as if
       running on the air (SKY.lean)
     Final Sky Kick, her right foot on the biggest circle: straight up with the stick let go, on ahead faster with it
       pushed (SKY.dash); then her right hand reaching ahead, her left at her chest, ready to cast (skyCast)
   (The user's plan had a 4th air step; four jumps in all were kept, so its last, Final Sky Kick, is the 3rd, on her
   right foot: the feet go on taking turns.)
   The flow (step: 'flow'), the user's set of four, each a move of its own from Quaternius' library (the user chose the
   clips; tools/make-magic-jump-flow.py cuts them, in place, into magic-jump-flow-anim.js, which the page merges into her
   clips): Step 1 kicked straight up (the take-off as the game's, then mjf_1 from its kick), Step 2 once round in the air,
   her arms drawn in and opened out (mjf_2: made from the double jump; the user's kick on the slant was not pretty),
   Step 3 her hips turned in the air and a spring
   (mjf_3), Step 4 a flip (mjf_4; on over the way she faces: FLOW[4].ahead), and the ninja's landing (mjf_land). A press
   in the air starts the next move's clip at once; the circle flashes open under her; she is held until its kick
   (FLOW[n].kick) and off the circle then. The clip has all of her (upBody, upLegs: no poses over it, her knees not laid
   as hinges) until the next press, or FLOW[n].end, when the poses take her on into her fall
   ========================================================================== */
import * as THREE from 'three';

export const MAGIC_JUMP = {
  // m each jump rises: the first off the ground a jump's (a little over waist high), the rest each a little less than the one before;
  // 4.4 m up in all, at the top of each (1.0, 2.35, 3.45, 4.4)
  heights: [1.0, 1.35, 1.1, 0.95],
  grav: 24.8,                         // m/s²: the game's own jump's (at 1.75 m)
  fallGrav: 1.2,                      // the pull on the way down, times that
  // at the very top of each jump (slower than hangV m/s, up or down) the pull is cut to `hang` of itself
  hang: [0.34, 0.34, 0.24, 0.24], hangV: [1.0, 1.0, 1.9, 1.8],
  fall: 16,                           // m/s: the fastest she falls
  push: 4.2,                          // m/s over the ground that a jump with the stick pushed sends her (her run)
  keep: 0.35,                         // of her speed over the ground kept by a jump with the stick let go
  air: 1.4,                           // how quickly the stick steers her between jumps (1/s)
  windup: 0.07,                       // s before an air jump's kick: her knees come up, she stops falling
  gap: 0.12,                          // s after a kick before the next press counts
  flip: 0.48,                         // s the 3rd jump's flip takes
  flipKick: 0.72,                     // of that time gone before she can kick again (she is most of the way round: the 4th's kick finishes it)
  spin: 0.6,                          // s the 4th jump's turn takes
  cushion: 2.6,                       // m: a fall from higher than this is caught by a circle on the ground
  catchAt: 1.15,                      // m over the ground: from here down the circle slows her
  catchV: 4.6,                        // m/s: how fast she comes down onto it
};
const M = MAGIC_JUMP;
const REF = 1.75;
const START_RATE = 1.8, START_AT = 0.06;             // the take-off clip, as the game plays it (player-moves.js)
// the landing clip begins in the air, her left foot still tucked up (it is down 0.03 s in). She comes down with both feet
// reaching for where she stands, so the clip is begun a little in (its feet a finger over the ground on the frame she
// touches it, her hips going on down at the pace she fell), at once: not blended in from the clip in the air, whose left
// foot is up too (the blend lifted her foot off the ground again for a moment as she touched it)
const LAND_AT = 0.022;
// the mocap's (tools/make-magic-jump-mocap.py: UP_DOWN + UP_PUSH): when its feet leave the ground; where a running
// take-off begins (part way up out of the crouch)
const UP_LIFT = 0.155, UP_RUN = 0.1, UP_BODY = 0.02;
// the step (step: true; "The step" above): s from the press to her feet on the circle; m she comes down onto it (at
// 1.75 m); s on it crouching (her weight taken) and pushing off it; how quickly her body is moved to keep her feet on it
const STEP = { reach: 0.085, drop: 0.07, crouch: 0.11, push: 0.065, lock: 40 };
// the step as Devil May Cry's Air Hike (step: 'dmc'): s her legs are driven down onto the circle, her body held, before
// she is off it; s the circle stays after (a flash, not a step to stand on); m more each jump rises (held for the stamp,
// she does not drift up into it as the game's jump does in its wind-up: as high at the top of four as that)
const DMC = { stomp: 0.05, after: 0.45, more: 0.02 };
// the Air Step (step: 'sky'), the user's own: up the air one foot at a time, her feet in turn (right, left, right): s her
// stepping leg is driven down onto the circle, her body held; s the circle stays after; m more each rises (as DMC's);
// her lean the way she goes, by the jump (the 2nd air step: as if running on the air); how much faster over the ground
// the last one sends her with the stick pushed (Final Sky Kick: up, or on ahead); m the circle is out to her stepping
// foot's side (at 1.75 m)
const SKY = { drive: 0.06, after: 0.5, more: 0.02, lean: [0, 0, 0.12, 0.3, 0.06], dash: 1.5, side: 0.09 };
// the kick off a rock (mj_wall: the mocap's 0.35..1.27 s, played 1.6 times as fast: WALL_FROM, WALL_RATE in the tool):
// how fast up and away from the rock she leaves it (m/s at 1.75 m), and her turn round (0..1 of half a turn, to her
// right) as the clip goes: its own 0.42..1.27 s, smoothstepped (the tool's wall_turn)
const WALL_FROM = 0.35, WALL_RATE = 1.6, WALL_UP = 5.0, WALL_OUT = 3.0;
const WALL_TURN = s => { const u = clamp((WALL_FROM + s * WALL_RATE - 0.42) / (1.27 - 0.42), 0, 1); return u * u * (3 - 2 * u); };
const CARRY = 0.7;                                  // of how fast her limbs were going that the poses take on (all of it: her arms flung up too far)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// how far round a turn is (0..1) at u (0..1) of its time: it speeds up as u^a and slows as (1-u)^b, and starts and ends still
function turnCurve(a, b, n = 64) {
  const s = new Float32Array(n + 1);
  let sum = 0;
  for (let i = 1; i <= n; i++) { const u = (i - 0.5) / n; sum += Math.pow(u, a) * Math.pow(1 - u, b); s[i] = sum; }
  for (let i = 1; i <= n; i++) s[i] /= sum;
  return u => { u = clamp(u, 0, 1) * n; const i = Math.min(n - 1, Math.floor(u)); return s[i] + (s[i + 1] - s[i]) * (u - i); };
}
const FLIP = turnCurve(1.5, 1.2);                    // the flip: slow while she is stretched, quick tucked, slow opening
const SPIN = turnCurve(0.8, 2.0);                    // the turn: quick with her arms in, slowing as they open

/* ---- her poses. Directions in her own frame: she faces +Z, up is +Y, and x is OUT from her middle (her left arm's and
   leg's x as it is, her right's the other way), so a pose with the same numbers on both sides is even.
     aL, aR: [upper arm, forearm]      lL, lR: [thigh, shin]      toe: [left, right] 0..1 how far her feet are pointed
     out: [left, right] radians each leg is turned out about itself (its knee and toes away from her middle); left out: none
     flat: [left, right] 0..1 how far her feet are laid level, as she stands on them (over `toe`); left out: not at all
     spine: [bend forward, turn to her left, lean to her right] (radians, over her whole back)      head: the same, her neck's
   A pose says where she is going; the springs below take her there. Things kept to in all of them: her elbows are never
   locked straight, her arms are never both straight out to the sides, and her knees point the way she faces (not out to
   her sides) unless the move turns one out (the 4th's passé). */
const both = (arm, leg, rest) => ({ aL: arm, aR: arm, lL: leg, lR: leg, ...rest });
const POSES = {
  // 1: leaving the ground. Each leg pushed out straight from where it stands: her left under her, her right behind her
  // (not swung in under her), her toes pointed; her arms swinging up in front
  push1: {
    aL: [[0.3, -0.7, 0.65], [0.2, -0.35, 0.92]], aR: [[0.3, -0.7, 0.65], [0.2, -0.35, 0.92]],
    lL: [[0.03, -0.99, 0.06], [0.01, -0.99, -0.08]], lR: [[0.1, -0.97, -0.2], [0, -0.97, -0.25]],
    toe: [0.9, 0.9], out: [0, 0.7], spine: [-0.06, 0, 0], head: [-0.05, 0, 0],
  },
  // 1: up. Her left knee drawn up in front of her, pointing ahead, bent square (thigh near level, shin hanging under it);
  // her right leg trailing from where it stood: its thigh a little behind her, its knee softly bent, her foot let back
  // and a little in behind her (from behind her, where the game's camera is, a leg bent only straight back looks
  // straight: the turn in at the knee is what shows), her toes pointed. The leg she stands back on, let go: not a post
  // straight down under her, and not tucked up tight. Her arms out a little for balance, elbows bent
  tuck1: {
    aL: [[0.66, -0.6, 0.45], [0.5, -0.32, 0.8]], aR: [[0.66, -0.6, 0.45], [0.5, -0.32, 0.8]],
    lL: [[0.04, -0.3, 0.95], [0.02, -0.97, -0.24]], lR: [[0.1, -0.965, -0.22], [-0.14, -0.5, -0.85]],
    toe: [0.7, 0.7], spine: [0.1, 0, 0], head: [-0.04, 0, 0],
  },
  // waiting at the top of a jump: her left knee a little up, her right leg still behind her, straightening (its knee
  // bent a little, her foot back), ready to kick again
  ready: {
    aL: [[0.55, -0.8, -0.2], [0.5, -0.8, 0.33]], aR: [[0.55, -0.8, -0.2], [0.5, -0.8, 0.33]],
    lL: [[0.04, -0.72, 0.69], [0.02, -0.9, -0.43]], lR: [[0.1, -0.97, -0.2], [-0.09, -0.8, -0.6]],
    toe: [0.6, 0.5], spine: [0.08, 0, 0], head: [0, 0, 0],
  },
  // the wind-up of a kick: her knees right up under her, her arms swung back, her back curled
  gather: {
    aL: [[0.42, -0.78, -0.46], [0.38, -0.88, -0.28]], aR: [[0.42, -0.78, -0.46], [0.38, -0.88, -0.28]],
    lL: [[0.05, -0.48, 0.87], [0.02, -0.8, -0.6]], lR: [[0.05, -0.66, 0.74], [0.02, -0.88, -0.47]],
    toe: [0.35, 0.35], spine: [0.24, 0, 0], head: [-0.1, 0, 0],
  },
  // 2: the kick. Her right leg driven down through the circle, her left knee coming up, her right hand flung down at it
  kick2: {
    aR: [[0.3, -0.93, 0.2], [0.22, -0.97, 0.08]], aL: [[0.62, -0.6, -0.5], [0.6, -0.42, -0.68]],
    lR: [[0.04, -0.97, -0.24], [0, -0.95, -0.31]], lL: [[0.1, -0.45, 0.89], [0.02, -0.86, -0.51]],
    toe: [0.7, 1], spine: [0.12, 0.2, 0.1], head: [-0.05, -0.15, 0],
  },
  // 2: the leap. Her front knee high, her back leg trailing; the hand she flung comes on forward and up over her head,
  // reaching, her other arm trailing low behind: from behind her, one long slanting line
  leap2: {
    aR: [[0.22, 0.62, 0.75], [0.1, 0.8, 0.59]], aL: [[0.6, -0.62, -0.5], [0.62, -0.4, -0.68]],
    lL: [[0.08, -0.22, 0.97], [0, -0.93, -0.36]], lR: [[0.05, -0.74, -0.67], [0, -0.47, -0.88]],
    toe: [0.8, 1], spine: [-0.16, 0.14, -0.08], head: [-0.14, -0.05, 0],
  },
  // 3: the kick. Stretched as long as she is: her legs straight down through the circle, her arms thrown up and forward
  kick3: both([[0.3, 0.72, 0.62], [0.2, 0.86, 0.47]], [[0.05, -0.995, 0.08], [0, -0.99, -0.12]], { toe: [1, 1], spine: [-0.1, 0, 0], head: [-0.08, 0, 0] }),
  // 3: tucked. Her knees at her chest, her arms round her shins, her chin down
  tuck3: both([[0.36, -0.86, 0.36], [-0.22, -0.86, 0.46]], [[0.17, 0.16, 0.97], [0.03, -0.82, -0.57]], { toe: [0.9, 0.9], spine: [0.55, 0, 0], head: [0.35, 0, 0] }),
  // 3: opening out of it. Her legs reaching down under her, her arms out and up, her back arched
  open3: {
    aL: [[0.8, 0.42, -0.15], [0.72, 0.66, 0.02]], aR: [[0.8, 0.42, -0.15], [0.72, 0.66, 0.02]],
    lL: [[0.07, -0.9, 0.43], [0, -0.98, 0.18]], lR: [[0.06, -0.97, 0.24], [0, -0.99, 0.05]],
    toe: [1, 1], spine: [-0.2, 0, 0], head: [-0.12, 0, 0],
  },
  // 4: the kick. Long and narrow: her legs together, her arms folding in to her chest
  kick4: both([[0.3, -0.82, 0.48], [-0.5, 0.42, 0.76]], [[0.05, -0.995, 0.06], [0, -0.995, -0.08]], { toe: [1, 1], spine: [-0.08, 0, 0], head: [-0.04, 0, 0] }),
  // 4: turning. One leg straight under her, the other foot drawn up to its knee, her hands together at her chest
  twirl4: {
    aL: [[0.34, -0.8, 0.5], [-0.52, 0.5, 0.69]], aR: [[0.3, -0.84, 0.46], [-0.55, 0.38, 0.74]],
    lR: [[0.03, -0.999, 0.03], [0, -1, -0.03]], lL: [[0.5, -0.55, 0.67], [-0.42, -0.88, -0.22]],
    toe: [1, 1], spine: [-0.06, 0, 0], head: [-0.05, 0, 0],
  },
  // 4: opening as she slows. One hand swept up over her head (a little forward: it comes down in front of her after,
  // not out through her side), the other out low: one long slanting line; her chest up, her free leg let out behind her
  bloom4: {
    aL: [[0.22, 0.88, 0.42], [0, 0.93, 0.36]], aR: [[0.8, -0.56, -0.2], [0.86, -0.46, 0.14]],
    lR: [[0.03, -0.99, 0.14], [0, -1, 0]], lL: [[0.12, -0.9, -0.42], [0, -0.62, -0.78]],
    toe: [1, 1], spine: [-0.2, 0.08, 0.06], head: [-0.2, 0.14, -0.06],
  },
  // falling, slowly: her arms low, soft and not alike (one hand a little forward, one a little back), her left knee
  // forward, her right leg behind her as she stands
  fall: {
    aL: [[0.36, -0.78, 0.52], [0.3, -0.4, 0.87]], aR: [[0.6, -0.76, -0.25], [0.74, -0.62, -0.25]],
    lL: [[0.1, -0.8, 0.59], [0, -0.85, -0.53]], lR: [[0.1, -0.975, -0.18], [-0.06, -0.87, -0.49]],
    toe: [0.8, 0.8], spine: [0.04, 0.1, 0.03], head: [0.14, -0.06, 0],
  },
  // falling fast: the air lifts her arms a little (still low, still bent), her knee comes up more
  fallFast: {
    aL: [[0.42, -0.66, 0.62], [0.3, -0.05, 0.95]], aR: [[0.7, -0.66, -0.28], [0.8, -0.5, -0.34]],
    lL: [[0.12, -0.72, 0.68], [0, -0.8, -0.6]], lR: [[0.1, -0.975, -0.15], [0, -0.84, -0.54]],
    toe: [0.7, 0.7], spine: [0.08, 0.12, 0.04], head: [0.2, -0.08, 0],
  },
  // the step: her weight on the circle. Knees bent deep and ahead, her feet flat where she stands (her left ahead, her
  // right under her and turned out: both soles on the one level, which magic-jump.js keeps on the circle), her back bent
  // over them, her head up, her arms swung down and back for the push (close by her sides: swung on forward they go
  // past her hips, not out round her like wings)
  crouchPad: {
    aL: [[0.2, -0.8, -0.56], [0.18, -0.9, -0.4]], aR: [[0.2, -0.8, -0.56], [0.18, -0.9, -0.4]],
    lL: [[0.1, -0.5, 0.86], [0.05, -0.85, -0.52]], lR: [[0.12, -0.66, 0.74], [0.03, -0.7, -0.71]],
    toe: [0.15, 0.15], out: [0, 0.5], flat: [1, 1], spine: [0.34, 0, 0], head: [-0.24, 0, 0],
  },
  // the step: driving off it. Her legs straight down through it, the back one a little behind, onto her toes (the last
  // of her on it); her arms swung through, forward past her hips, her chest up
  pushPad: {
    aL: [[0.15, -0.35, 0.92], [0.12, 0.05, 0.99]], aR: [[0.15, -0.35, 0.92], [0.12, 0.05, 0.99]],
    lL: [[0.03, -0.99, 0.06], [0.01, -0.99, -0.08]], lR: [[0.1, -0.97, -0.2], [0, -0.97, -0.25]],
    toe: [0.9, 0.9], out: [0, 0.7], spine: [-0.1, 0, 0], head: [-0.14, 0, 0],
  },
  // the Air Hike: her legs driven straight down together onto the circle, her soles flat on it (a stamp, not a tiptoe),
  // her arms flung down and back, her chest up
  stomp: {
    aL: [[0.38, -0.72, -0.58], [0.3, -0.8, -0.52]], aR: [[0.38, -0.72, -0.58], [0.3, -0.8, -0.52]],
    lL: [[0.04, -0.995, 0.06], [0.01, -0.99, -0.04]], lR: [[0.06, -0.99, -0.1], [0, -0.99, -0.12]],
    toe: [0.2, 0.2], out: [0, 0.4], flat: [1, 1], spine: [-0.08, 0, 0], head: [-0.12, 0, 0],
  },
  // the Air Hike: up off it. Both knees snatched up in front of her (her left higher), heels under her, her arms in and
  // bent, her back a little round
  tuckHard: {
    aL: [[0.5, -0.72, 0.48], [0.32, -0.25, 0.91]], aR: [[0.5, -0.72, 0.48], [0.32, -0.25, 0.91]],
    lL: [[0.08, -0.12, 0.99], [0.02, -0.95, -0.3]], lR: [[0.1, -0.42, 0.9], [0, -0.9, -0.44]],
    toe: [0.8, 0.8], spine: [0.22, 0, 0], head: [-0.06, 0, 0],
  },
  // the Air Step (the user's, "Air Step 1 – เท้าขวาถีบขึ้น" and on), each made for her right foot; her left's are these
  // the other way round (mirrored, below). Running up the air: her arms swing as a runner's do, against her legs (her
  // right foot down, her right arm ahead), her chest turned with them (her right shoulder ahead), her head kept ahead.
  // skyStepR: her right foot driven straight down onto the circle, flat; her left knee driven up in front of her
  skyStepR: {
    aR: [[0.18, -0.5, 0.85], [0.1, 0.5, 0.86]], aL: [[0.18, -0.62, -0.76], [0.12, -0.92, 0.37]],
    lR: [[0.06, -0.97, 0.2], [0.02, -0.995, 0.04]], lL: [[0.07, -0.18, 0.98], [0.02, -0.96, -0.27]],
    toe: [0.7, 0.1], flat: [0, 1], spine: [0.14, 0.16, 0], head: [-0.14, -0.12, 0],
  },
  // skyRiseR: off it. Her right leg trailing behind her as it pushed, her heel up; her left knee high ahead (the next
  // step's); her right arm on up in front of her
  skyRiseR: {
    aR: [[0.2, -0.15, 0.97], [0.08, 0.72, 0.69]], aL: [[0.2, -0.55, -0.81], [0.14, -0.88, 0.45]],
    lR: [[0.05, -0.78, -0.62], [0.01, -0.4, -0.92]], lL: [[0.07, -0.12, 0.99], [0.02, -0.95, -0.3]],
    toe: [0.8, 0.95], spine: [0.1, 0.2, 0], head: [-0.12, -0.15, 0],
  },
  // skyWaitL: at the top, waiting to step with her left: her left knee up, her right leg under her and a little behind
  skyWaitL: {
    aR: [[0.3, -0.6, 0.74], [0.2, 0.2, 0.96]], aL: [[0.3, -0.75, -0.59], [0.25, -0.9, 0.36]],
    lL: [[0.07, -0.3, 0.95], [0.02, -0.96, -0.28]], lR: [[0.08, -0.96, -0.25], [0.02, -0.8, -0.6]],
    toe: [0.7, 0.75], spine: [0.1, 0.1, 0], head: [-0.08, -0.06, 0],
  },
  // skyCast: after the Final Sky Kick, ready to cast: her right hand reaching ahead, her left at her chest, her right
  // shoulder ahead, her left knee up, her right leg down under her
  skyCast: {
    aR: [[0.1, 0.12, 0.99], [0.04, 0.16, 0.99]], aL: [[0.35, -0.62, 0.7], [-0.5, 0.28, 0.82]],
    lL: [[0.08, -0.38, 0.92], [0.02, -0.97, -0.24]], lR: [[0.06, -0.97, -0.22], [0.01, -0.88, -0.47]],
    toe: [0.9, 0.9], spine: [-0.06, 0.22, 0], head: [-0.06, -0.18, 0],
  },
  // the step: just off it. Her legs still long under her, her arms on up in front of her, over her head
  risePad: {
    aL: [[0.22, 0.62, 0.75], [0.12, 0.85, 0.51]], aR: [[0.22, 0.62, 0.75], [0.12, 0.85, 0.51]],
    lL: [[0.04, -0.98, 0.18], [0.01, -0.97, -0.24]], lR: [[0.1, -0.97, -0.2], [0, -0.92, -0.38]],
    toe: [0.95, 0.95], out: [0, 0.6], spine: [-0.14, 0, 0], head: [-0.16, 0, 0],
  },
  // just over the ground: her legs reach down for where she stands (her standing pose's own legs: her left foot ahead,
  // her right behind and turned out, her knees soft, her feet level), so she comes down into her stance and the landing
  // clip, whose feet are in the same two places, takes her on from there; her arms low and a little out for balance
  reach: {
    aL: [[0.55, -0.8, 0.15], [0.66, -0.6, 0.45]], aR: [[0.55, -0.8, 0.15], [0.66, -0.6, 0.45]],
    lL: [[0.09, -0.93, 0.37], [0.1, -0.99, 0.04]], lR: [[0.14, -0.97, -0.17], [-0.03, -0.96, -0.29]],
    toe: [0.3, 0.3], out: [0, 0.7], flat: [1, 1], spine: [0.12, 0, 0], head: [0.1, 0, 0],
  },
};
// a pose as numbers in a row: 8 directions (aL, aR, lL, lR: upper then lower), her two feet, her back (3), her head (3),
// her two legs' turn out, her two feet laid level
const N = 36, DIRS = 8, LEGS = 12, TOES = 24, BACK = 26, HEAD = 29, OUT = 32, FLAT = 34;
const row = p => {
  const r = new Float32Array(N);
  [p.aL[0], p.aL[1], p.aR[0], p.aR[1], p.lL[0], p.lL[1], p.lR[0], p.lR[1]].forEach((d, i) => { const l = Math.hypot(d[0], d[1], d[2]); r[i * 3] = d[0] / l; r[i * 3 + 1] = d[1] / l; r[i * 3 + 2] = d[2] / l; });
  r.set(p.toe, TOES); r.set(p.spine, BACK); r.set(p.head, HEAD); r.set(p.out || [0, 0], OUT); r.set(p.flat || [0, 0], FLAT);
  return r;
};
const ROWS = Object.fromEntries(Object.entries(POSES).map(([k, p]) => [k, row(p)]));
// a pose the other way round: her left side's numbers her right's, her back and head turned and leaned the other way
const mirrored = r => {
  const m = r.slice();
  m.set(r.subarray(6, 12), 0); m.set(r.subarray(0, 6), 6); m.set(r.subarray(18, 24), 12); m.set(r.subarray(12, 18), 18);
  for (const i of [TOES, OUT, FLAT]) { m[i] = r[i + 1]; m[i + 1] = r[i]; }
  m[BACK + 1] = -r[BACK + 1]; m[BACK + 2] = -r[BACK + 2]; m[HEAD + 1] = -r[HEAD + 1]; m[HEAD + 2] = -r[HEAD + 2];
  return m;
};
ROWS.tuck1M = mirrored(ROWS.tuck1);
ROWS.tuckHardM = mirrored(ROWS.tuckHard);
ROWS.skyStepL = mirrored(ROWS.skyStepR); ROWS.skyRiseL = mirrored(ROWS.skyRiseR); ROWS.skyWaitR = mirrored(ROWS.skyWaitL);
// how quickly each part follows (times the pose's own pace): her back first, her forearms and shins after their arms and thighs
const PACE = new Float32Array(N);
[1, 0.74, 1, 0.74, 1.05, 0.8, 1.05, 0.8].forEach((v, i) => PACE.fill(v, i * 3, i * 3 + 3));
PACE.fill(0.9, TOES, BACK); PACE.fill(1.15, BACK, HEAD); PACE.fill(0.85, HEAD, OUT); PACE.fill(0.9, OUT, N);
/* each jump after its kick: [until (s after the kick), pose, pace (how hard the springs pull, 1/s), how it settles (1: it
   stops there; less: it runs a little past and comes back)]; after the last, 'ready' until she falls */
const MOVES = {
  1: [[0.06, 'push1', 40, 0.85], [0.3, 'tuck1', 26, 0.8]],          // (from the ground only: off an edge she is past them)
  2: [[0.1, 'kick2', 40, 0.72], [0.34, 'leap2', 19, 0.74]],
  3: [[0.07, 'kick3', 42, 0.8], [0.31, 'tuck3', 38, 0.9], [0.53, 'open3', 24, 0.7]],
  4: [[0.08, 'kick4', 42, 0.8], [0.21, 'twirl4', 26, 0.85], [0.95, 'bloom4', 15, 0.7]],
};
// the step's, after she leaves the circle: the 2nd and 3rd her push carried on, then a knee drawn up (her left, then her
// right: a step up each), the 4th's turn as before
const STEP_MOVES = {
  2: [[0.1, 'risePad', 40, 0.78], [0.36, 'tuck1', 22, 0.8]],
  3: [[0.1, 'risePad', 40, 0.78], [0.36, 'tuck1M', 22, 0.8]],
  4: MOVES[4],
};
const BEATS = ['', 'ชั้น 1', 'ชั้น 2 · สะบัดมือ', 'ชั้น 3 · ตีลังกา', 'ชั้น 4 · หมุนตัว'];
const STEP_BEATS = ['', 'ชั้น 1', 'ชั้น 2', 'ชั้น 3', 'ชั้น 4 · หมุนตัว'];
// the Air Hike's, after she is off the circle: her legs still driven down a moment, then her knees snatched up to her
// chest (left higher, then right higher); the 4th a front flip (the 3rd's of the game's jump)
const DMC_MOVES = {
  2: [[0.05, 'stomp', 90, 0.85], [0.3, 'tuckHard', 42, 0.72]],
  3: [[0.05, 'stomp', 90, 0.85], [0.3, 'tuckHardM', 42, 0.72]],
  4: [[0.05, 'stomp', 90, 0.85], [0.31, 'tuck3', 40, 0.9], [0.53, 'open3', 24, 0.7]],
};
const DMC_BEATS = ['', 'ชั้น 1', 'ชั้น 2', 'ชั้น 3', 'ชั้น 4 · ตีลังกา'];
// the Air Step's, after she is off the circle: her stepping leg trailing behind her, her other knee high ahead (the next
// step's); then she waits on that knee (skyWait, chosen below); the last aims her right hand ahead, ready to cast
const SKY_MOVES = {
  2: [[0.18, 'skyRiseR', 40, 0.75]],
  3: [[0.18, 'skyRiseL', 40, 0.75]],
  4: [[0.12, 'skyRiseR', 50, 0.8], [0.95, 'skyCast', 22, 0.78]],
};
const SKY_BEATS = ['', 'ชั้น 1', 'Air Step 1 · เท้าขวา', 'Air Step 2 · เท้าซ้าย', 'Final Sky Kick'];
// the foot jump n of the Air Step is off: right, left, right
const skySide = n => (n % 2 === 0 ? 'R' : 'L');
// the flow (step: 'flow'): the user's own set of four, each its own move from Quaternius' library (the user chose the
// clips: tools/make-magic-jump-flow.py cuts them and plays them in place, magic-jump-flow-anim.js). For each jump: its
// clip, s into it that her legs are straightest (the kick: she is on the circle until then, held, and off it then), the
// rate it is played at, s into it that the poses take her back if no other jump has come first; side: m/s it sends her
// out to her left with the stick let go (none now: Step 2 kicked out on the slant once); ahead: m/s on the way she faces
// (Step 4's flip goes on over); more: m each rises more than the game's jump (held at the press, she does not drift up
// into the kick)
const FLOW = {
  1: { clip: 'mjf_1', kick: 0.033, rate: 1.1, end: 0.7 },                // Step 1, kicked straight up (after the take-off)
  2: { clip: 'mjf_2', kick: 0.033, rate: 1.15, end: 0.7 },               // Step 2, once round in the air (not a kick out:
                                                                         // the user found that one not pretty)
  3: { clip: 'mjf_3', kick: 0.1, rate: 1.3, end: 0.8 },                   // Step 3, the hips turned in the air, a spring
  4: { clip: 'mjf_4', kick: 0.067, rate: 1.0, end: 0.62, ahead: 0.7 },   // Step 4, the flip
  land: { clip: 'mjf_land', rate: 1.25, run: 1.6, hold: 0.28, runHold: 0.12 },     // the ninja's landing
  more: 0.02,
};
const FLOW_CLIPS = Object.fromEntries([1, 2, 3, 4].map(n => [FLOW[n].clip, FLOW[n]]));
const FLOW_BEATS = ['', 'Step 1 · ถีบขึ้นตรง', 'Step 2 · หมุนตัว', 'Step 3 · บิดสะโพกดีดตัว', 'Step 4 · พลิกตัว'];

export function createMagicJump({ character, circles, mocap = false, step = false }) {
  let ch = character;
  const hasMocap = () => mocap && !!ch.actions.mj_up && !!ch.actions.mj_land;
  // the step's style: false (the game's jump), 'stand' (onto the circle, a crouch, a push), 'dmc' (the Air Hike), 'sky'
  // (the Air Step: one foot at a time) or 'flow' (the user's four moves from the library)
  const styleOf = s => (s === 'dmc' || s === 'sky' || s === 'flow' ? s : s ? 'stand' : false);
  // (the flow only where her clips have its moves: magic-jump-flow-anim.js merged into them)
  const flowOn = () => stepWanted === 'flow' && !!ch.actions.mjf_1 && !!ch.actions.mjf_4;
  let stepWanted = styleOf(step);
  const stepOn = () => stepWanted;
  // the step: this jump's circle and how high it is (her feet on it), where she came down onto it from; on it, and for
  // how long (s); this jump left one (its moves are STEP_MOVES); her way over the ground as she came down onto it (she
  // stands still on it); m her body is moved up (or down) so that her feet are on it; how high her ankles and her toes
  // are over the ground as she stands (measured as she stands: pose)
  let pad = null, padY = 0, reachFrom = 0, onPad = false, padT = 0, stepped = false, standOff = 0, soleA = -1, soleT = -1;
  let padStyle = 'stand';                     // the style of the circle she is coming down onto (stepped: of the one she left)
  let padSide = 'R';                          // (the Air Step: the foot she steps onto it with)
  let windAll = 1;                            // s the hold before a kick off a circle takes in all (the Air Hike, Air Step, flow)
  // whether this jump turns head over heels: the game's 3rd; the Air Hike's 4th
  const flips = () => (tier === 3 && !stepped) || (tier === 4 && stepped === 'dmc');
  const padVel = new THREE.Vector3();
  let crouch = -1;                            // s since the press, crouching on the ground before the mocap's take-off (-1: not)
  // the mocap's take-off still has her body (her arms, back, head: until just after she leaves the ground, when it would
  // fling her arms out level) and her legs (until the top of the first jump)
  let upBody = false, upLegs = false, tookOff = false;     // (tookOff: this flight began with the mocap's take-off)
  let upClip = 'mj_up';                       // the mocap's clip that has her: the take-off, or the kick off a rock
  let wall = null;                            // kicking off a rock: { from: the way she faced it, t: s since }
  const seen = new Float32Array(DIRS * 3), seenV = new Float32Array(DIRS * 3);      // her limbs as the mocap has them, and how fast they go
  let seenOk = false;
  let landing = { clip: 'jump_land', rate: 1.4, hold: 0.14 };
  let active = false, tier = 0, t = 0, wind = -1, nextDir = null, nextAmount = 0, vy = 0, peak = 0, caught = false, fell = 0, turnT = 0;
  let queued = null;                          // a press made too early (in the flip, or crouching for the mocap's take-off): kept until it can be taken
  let beat = '';
  let fromGround = false;                     // this flight began with the take-off clip (not by walking off an edge)
  let over = 1e9;                             // m of air under her feet (from the last step), for her legs' reach
  let clock = 0;                              // s, for what never stops (her arms and legs falling)
  let W = 0, Wl = 0;                          // how much of her is the poses' (the rest: the clip under them): her body, her legs
  let legsOut = 28;                           // how quickly her legs are given back to the clip (1/s)
  let bodyIn = 16, legsIn = 40;               // how quickly the poses take her body and her legs (1/s; a soft drop: slower)
  let Wh = 0;                                 // how far her knees are laid as hinges over what the clip has (in the air and through the landing)
  let held = 0, upside = 0, flipA = 0, spinA = 0, lean = 0, leanV = 0, kickLean = 0, impact = 0;
  let pace = 15, settle = 0.9;                // how the springs pull now
  const x = new Float32Array(N), xv = new Float32Array(N), goal = new Float32Array(N);      // her pose now, how fast it is changing, where it is going
  x.set(ROWS.ready);
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), cur = new THREE.Vector3(), want = new THREE.Vector3();
  const q = new THREE.Quaternion(), qt = new THREE.Quaternion(), qy = new THREE.Quaternion(), qf = new THREE.Quaternion(), qFoot = new THREE.Quaternion(), P = new THREE.Quaternion(), Pi = new THREE.Quaternion(), objQ = new THREE.Quaternion(), objQi = new THREE.Quaternion();
  const ONE = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), eul = new THREE.Euler();
  let bones = null, kept = [];
  const findBones = () => {
    const g = n => ch.model.getObjectByName(n);
    bones = { hips: g('J_Bip_C_Hips'), back: [g('J_Bip_C_Spine'), g('J_Bip_C_Chest'), g('J_Bip_C_UpperChest')].filter(Boolean), neck: [g('J_Bip_C_Neck'), g('J_Bip_C_Head')].filter(Boolean) };
    for (const s of ['L', 'R']) {
      bones[s] = [g(`J_Bip_${s}_UpperArm`), g(`J_Bip_${s}_LowerArm`), g(`J_Bip_${s}_Hand`)];
      bones[s + 'leg'] = [g(`J_Bip_${s}_UpperLeg`), g(`J_Bip_${s}_LowerLeg`), g(`J_Bip_${s}_Foot`), g(`J_Bip_${s}_ToeBase`)];
    }
    // each leg as a hinge, from how it was made (the bind pose: straight down, her toes ahead): for her thigh and her shin,
    // the bone's own way along it and its own front (the way her toes point, square to it)
    bones.hinge = {};
    let sk = null;
    ch.model.traverse(o => { if (!sk && o.isSkinnedMesh && o.skeleton.bones.includes(bones.Lleg[0])) sk = o.skeleton; });
    if (sk) for (const s of ['L', 'R']) {
      const [ul, ll, foot, toe] = bones[s + 'leg'], made = bone => {
        const i = sk.bones.indexOf(bone), m = new THREE.Matrix4().copy(sk.boneInverses[i]).invert(), p = new THREE.Vector3(), r = new THREE.Quaternion();
        m.decompose(p, r, new THREE.Vector3());
        return { p, r };
      };
      if (!toe || sk.bones.indexOf(toe) < 0 || sk.bones.indexOf(ul) < 0) continue;
      const T0 = made(ul), S0 = made(ll), F0 = made(foot), O0 = made(toe), ahead = new THREE.Vector3().subVectors(O0.p, F0.p);
      const own = (B, from, to) => {
        const along = new THREE.Vector3().subVectors(to.p, from.p).normalize(), front = ahead.clone().addScaledVector(along, -ahead.dot(along)).normalize();
        const back = B.r.clone().invert();
        return { along: along.applyQuaternion(back), front: front.applyQuaternion(back) };
      };
      bones.hinge[s] = { thigh: own(T0, T0, S0), shin: own(S0, S0, F0) };
    }
    // every bone turned here, with how its clip had it and how it was left (below)
    kept = [];
    const add = bone => { if (bone) kept.push({ bone, base: bone.quaternion.clone(), out: new THREE.Quaternion(NaN, 0, 0, 1) }); };
    bones.back.forEach(add); bones.neck.forEach(add);
    for (const s of ['L', 'R']) { bones[s].slice(0, 2).forEach(add); bones[s + 'leg'].slice(0, 3).forEach(add); }
  };
  findBones();
  // A clip only writes a bone when its value has changed (three.js' mixer), so a bone its clip holds still would keep
  // last frame's turn and be turned again on top of it, more every frame. So each frame, before anything else, every
  // bone still as it was left here is put back as its clip had it.
  const asTheClipHas = () => { for (const m of kept) { if (m.bone.quaternion.equals(m.out)) m.bone.quaternion.copy(m.base); else m.base.copy(m.bone.quaternion); } };
  const remember = on => { for (const m of kept) { if (on) m.out.copy(m.bone.quaternion); else m.out.x = NaN; } };
  const size = () => (ch.height || REF) / REF;
  // how fast jump n must leave to top out its height (and `more` m at 1.75 m) higher, the hold at its top counted in
  function speedFor(n, more = 0) {
    const k = size(), g = M.grav * k, V = M.hangV[n - 1] * k, c = M.hang[n - 1], s = (1 - c) / V;
    const through = (V / s + c / (s * s) * Math.log(c)) / g;          // m risen through the hold (from V to still)
    return Math.sqrt(Math.max(0, V * V + 2 * g * ((M.heights[n - 1] + more) * k - through)));
  }

  // turn a bone so that it points (to its child) the way `want` does: k of the way from where its clip has it
  function aimAt(bone, child, k) {
    if (k <= 0.001 || !bone || !child) return;
    bone.getWorldPosition(a); child.getWorldPosition(b);
    cur.subVectors(b, a).normalize();
    qt.setFromUnitVectors(cur, want);
    q.slerpQuaternions(ONE, qt, Math.min(1, k));
    bone.parent.getWorldQuaternion(P);
    Pi.copy(P).invert();
    bone.quaternion.premultiply(P).premultiply(q).premultiply(Pi);
    bone.updateMatrixWorld(true);
  }
  // turn a bone (k of the way from where its clip has it) so that its own way along (own.along) points along `along` and
  // its own front (own.front) faces `front`, both in the world (square to each other)
  const mB = new THREE.Matrix4(), mW = new THREE.Matrix4(), side = new THREE.Vector3(), side0 = new THREE.Vector3();
  function orient(bone, own, along, front, k) {
    side0.crossVectors(own.along, own.front); side.crossVectors(along, front);
    mB.makeBasis(own.along, own.front, side0); mW.makeBasis(along, front, side);
    qt.setFromRotationMatrix(mW.multiply(mB.transpose()));
    bone.parent.getWorldQuaternion(P);
    q.copy(P).invert().multiply(qt);
    bone.quaternion.slerp(q, Math.min(1, k));
    bone.updateMatrixWorld(true);
  }
  // her leg as a hinge: her thigh along d1, her shin along d2, her knee facing the way it bends from (forward, as a knee
  // does, unless the pose turns it out), and her thigh and shin turned about themselves to match (a clip may leave her
  // thigh turned out: laid by its direction alone, her knee then bent out to her side). o: radians a leg near straight is
  // turned about itself (+: its toes to her right), as she stands on it: her right foot, behind her, is turned out
  const d1 = new THREE.Vector3(), d2 = new THREE.Vector3(), f1 = new THREE.Vector3(), f2 = new THREE.Vector3(), fw = new THREE.Vector3(), up = new THREE.Vector3();
  function layLeg(hinge, thigh, shin, k, o = 0) {
    const c = clamp(d1.dot(d2), -1, 1), sn = Math.sqrt(1 - c * c);
    fw.set(0, 0, 1).applyQuaternion(objQ); fw.addScaledVector(d1, -fw.dot(d1));             // her front, square to her thigh
    up.set(0, 1, 0).applyQuaternion(objQ); up.addScaledVector(d1, -up.dot(d1));
    fw.addScaledVector(up, 0.25).normalize();                                                // (a leg straight out ahead: her knee faces up)
    if (o) { up.crossVectors(d1, fw); fw.multiplyScalar(Math.cos(o)).addScaledVector(up, Math.sin(o)); }
    f1.copy(d2).addScaledVector(d1, -c).multiplyScalar(-1);                                  // away from where her shin goes
    const bent = sstep(0.12, 0.45, sn);
    if (f1.lengthSq() > 1e-8) f1.normalize(); else f1.copy(fw);
    f1.multiplyScalar(bent).addScaledVector(fw, 1 - bent);
    f1.addScaledVector(d1, -f1.dot(d1)).normalize();
    orient(thigh, hinge.thigh, d1, f1, k);
    f2.copy(f1).multiplyScalar(c).addScaledVector(d1, sn);                                  // her shin's front: her thigh's, turned with the knee
    f2.addScaledVector(d2, -f2.dot(d2)).normalize();
    orient(shin, hinge.shin, d2, f2, k);
  }
  // where the clip shows (the landing: its right knee swings out to her side, its left in across her), a bent knee is
  // swung round the line from her hip to her foot until it faces the way she faces (and a little the way that foot points:
  // her right foot stands turned out, and its knee goes a little with it, not hard across it). Her foot stays exactly
  // where the clip has it (nothing slides), and it is one smooth turn: the more bent the knee, the more of it. A leg near
  // straight is left as the clip has it, so she comes up out of a landing into her own standing pose (her left foot
  // ahead, her right behind and turned out) and not into a pose of this file's. Her own poses (Wl) are left as they are
  // (the 4th's passé turns a knee out on purpose).
  //   pH, pK, pF: her hip, knee and foot in the world; toes: the way her foot points; pK is moved. -> 0..1: how bent the leg is
  const pH = new THREE.Vector3(), pK = new THREE.Vector3(), pF = new THREE.Vector3(), toes = new THREE.Vector3(), line = new THREE.Vector3(), off = new THREE.Vector3(), pole = new THREE.Vector3(), turn = new THREE.Vector3();
  function kneeAhead() {
    line.subVectors(pF, pH);
    const far = line.length();
    if (far < 1e-5) return 0;
    line.multiplyScalar(1 / far);
    off.subVectors(pK, pH);
    const along = off.dot(line);
    off.addScaledVector(line, -along);                                  // her knee, out from that line
    const out = off.length(), bent = sstep(0.1, 0.42, out / (Math.hypot(along, out) || 1));
    pole.set(0, 0.25, 1).applyQuaternion(objQ);                         // ahead of her (and a little up: a leg straight out ahead)
    turn.set(0, 1, 0).applyQuaternion(objQ);
    const whole = toes.length(), flat = toes.addScaledVector(turn, -toes.dot(turn)).length();      // her foot's way over the ground (a foot pointed down has none)
    if (flat > 1e-5) pole.addScaledVector(toes, 0.5 * sstep(0.3, 0.6, flat / whole) / flat);
    pole.addScaledVector(line, -pole.dot(line));
    const clear = pole.length(), w = bent * (1 - Wl) * sstep(0.05, 0.25, clear);
    if (w < 1e-3 || out < 1e-5) return bent;
    const angle = Math.atan2(turn.crossVectors(off, pole).dot(line), off.dot(pole)) * w;
    turn.crossVectors(line, off);
    off.multiplyScalar(Math.cos(angle)).addScaledVector(turn, Math.sin(angle));
    pK.copy(pH).addScaledVector(line, along).add(off);
    return bent;
  }
  // (`want`: direction number i of her pose, in the world; mirror: her right side's x is the other way)
  const wantDir = (i, mirror) => want.set(x[i * 3] * mirror, x[i * 3 + 1], x[i * 3 + 2]).normalize().applyQuaternion(objQ);
  // bend a bone by a turn given in her own frame (forward, to her left, to her right side), over what its clip has
  function bend(bone, pitch, yaw, roll) {
    q.setFromEuler(eul.set(pitch, yaw, roll, 'YXZ'));
    qt.copy(objQ).multiply(q).multiply(objQi);                        // the same turn, in the world
    bone.parent.getWorldQuaternion(P);
    Pi.copy(P).invert();
    bone.quaternion.premultiply(P).premultiply(qt).premultiply(Pi);
  }

  // how high the sole of one foot is now (world): under her ankle as she stands, or under her toes, whichever is lower
  function soleOf(s) {
    const [, , foot, toe] = bones[s + 'leg'];
    let y = 1e9;
    if (foot) y = Math.min(y, foot.getWorldPosition(a).y - soleA);
    if (toe) y = Math.min(y, toe.getWorldPosition(a).y - soleT);
    return y;
  }

  // ---- where her body is going now (goal), and how the springs pull it there (pace, settle)
  function choosePose() {
    const k = size();
    let name = 'ready';
    pace = 15; settle = 0.9;
    // (the step: her legs reach down for the circle, her standing pose's, and the mocap takes her on from it)
    // (on it: down into her crouch, running a little past (her weight), then the push, quick)
    if (onPad) { if (padT < STEP.crouch) { name = 'crouchPad'; pace = 52; settle = 0.68; } else { name = 'pushPad'; pace = 72; settle = 0.9; } }
    else if (wind >= 0) {
      if (pad && padStyle === 'dmc') { name = 'stomp'; pace = 95; settle = 0.9; }
      else if (pad && padStyle === 'sky') { name = padSide === 'R' ? 'skyStepR' : 'skyStepL'; pace = 90; settle = 0.85; }
      else { if (pad) { name = 'reach'; pace = 50; } else { name = 'gather'; pace = 34; } settle = 1; }
    }
    else {
      // (a move is let go of once she is well on her way down, but never the flip before she is round)
      const dropping = vy < -5.5 * k && !(flips() && t < M.flip);
      if (!dropping) for (const m of (stepped === 'flow' ? {} : stepped === 'sky' ? SKY_MOVES : stepped === 'dmc' ? DMC_MOVES : stepped ? STEP_MOVES : MOVES)[tier] || []) if (t < m[0]) { name = m[1]; pace = m[2]; settle = m[3]; break; }
      // (the Air Step: between steps she waits on the knee of the foot she steps with next)
      if (name === 'ready' && tier < 4 && (stepped === 'sky' || (tier === 1 && stepWanted === 'sky'))) { name = skySide(tier + 1) === 'R' ? 'skyWaitR' : 'skyWaitL'; pace = 18; settle = 0.85; }
    }
    goal.set(ROWS[name]);
    if ((name !== 'ready' && !name.startsWith('skyWait')) || wind >= 0) return;
    // out of a jump's move and coming down: her falling pose, the faster the more the air lifts her arms. Nothing in it
    // holds still: her left knee comes up and down a little (her right leg stays down under her, as she stands, swaying
    // only a little), the air goes through her arms, her back sways
    const down = sstep(1.2 * k, 4.5 * k, -vy), fast = sstep(6 * k, 13 * k, -vy);
    if (down > 0) {
      const F = ROWS.fall, FF = ROWS.fallFast;
      for (let i = 0; i < N; i++) goal[i] += ((F[i] + (FF[i] - F[i]) * fast) - goal[i]) * down;
      const swap = 0.3 * down * (0.5 + 0.5 * Math.sin(clock * 3.6));
      for (let i = LEGS; i < LEGS + 6; i++) goal[i] += (goal[i + 6] - goal[i]) * swap;
      goal[LEGS + 8] += 0.04 * down * Math.sin(clock * 2.6 + 1);                // (her right thigh: a little forward and back)
      const fl = (0.035 + 0.06 * fast) * down;
      goal[1] += fl * Math.sin(clock * 21); goal[4] += fl * 1.6 * Math.sin(clock * 21 - 0.9);
      goal[7] += fl * Math.sin(clock * 18.2 + 1.7); goal[10] += fl * 1.6 * Math.sin(clock * 18.2 + 0.8);
      goal[BACK + 1] += 0.05 * down * Math.sin(clock * 1.7 + 1); goal[BACK + 2] += 0.04 * down * Math.sin(clock * 2.3);
      pace = 12 + 4 * fast; settle = 0.85;
    }
    // just over the ground (0.15 s from it): her legs reach down for it
    if (vy < -2 * k && over < -vy * 0.15) { goal.set(ROWS.reach); pace = 26; settle = 1; }
  }

  const air = {
    get active() { return active; }, get tier() { return tier; }, get held() { return held; }, get upside() { return upside; }, get beat() { return beat; },
    get impact() { return impact; }, get vy() { return vy; }, get landing() { return landing; }, get crouching() { return crouch >= 0; },
    get stepMode() { return stepWanted; }, set stepMode(on) { stepWanted = styleOf(on); },
    get onCircle() { return onPad || (!!pad && wind >= 0); },      // (the step: coming down onto a circle or standing on it)
    // another character in her place: the one leaving gets back what its clip had (a bone its clip holds still would
    // otherwise keep this jump's turn for good), the one coming takes the flight on from here
    setCharacter(next) {
      if (next === ch) return;
      for (const m of kept) if (m.bone.quaternion.equals(m.out)) m.bone.quaternion.copy(m.base);
      ch = next; findBones();
    },
    takeOff(me) {
      if (hasMocap()) {
        // the mocap's: crouching on the ground first (from standing; running, out of her stride part way up)
        active = true; tier = 1; t = 0; wind = -1; bodyIn = 16; legsIn = 40; caught = false; fell = 0; queued = null; fromGround = true; over = 0;
        vy = 0; peak = me.pos.y; upBody = upLegs = tookOff = true; seenOk = false; upClip = 'mj_up'; wall = null;
        pad = null; onPad = stepped = false;
        const going = Math.hypot(me.vel.x, me.vel.z) / (M.push * size());
        crouch = UP_RUN * sstep(0.35, 0.9, going);
        x.set(ROWS.push1); xv.fill(0); kickLean = 0;
        ch.play('mj_up', crouch > 0 ? 0.07 : 0.05, false);
        ch.actions.mj_up.time = crouch;
        ch.setRate(1);
        circles.open(v.set(me.pos.x, me.pos.y + 0.02, me.pos.z), 1, { ground: true, size: size() });
        beat = 'ชั้น 1';
        return;
      }
      crouch = -1; upBody = upLegs = tookOff = false; wall = null; pad = null; onPad = stepped = false;
      active = true; tier = 1; t = 0; wind = -1; bodyIn = 16; legsIn = 40; caught = false; fell = 0; queued = null; fromGround = true; over = 1e9;
      vy = speedFor(1); peak = me.pos.y;
      x.set(ROWS.push1); xv.fill(0); kickLean = 0;
      ch.play('jump_start', 0.08, false);
      if (ch.actions.jump_start) ch.actions.jump_start.time = START_AT;
      ch.setRate(START_RATE);
      circles.open(v.set(me.pos.x, me.pos.y + 0.02, me.pos.z), 1, { ground: true, size: size() });
      beat = 'ชั้น 1';
    },
    // walking off a rock's top (or a little hop off it): falling, with the first jump as good as used (three are left)
    drop(me, up = 0, used = 1, soft = false) {
      bodyIn = soft ? 9 : 16; legsIn = soft ? 9 : 40;
      active = true; tier = Math.max(1, used); t = 1; wind = -1; caught = false; fell = 0; queued = null; fromGround = false; over = 1e9;
      crouch = -1; upBody = upLegs = tookOff = false; wall = null; pad = null; onPad = stepped = false;
      vy = up; peak = me.pos.y;
      x.set(ROWS.ready); xv.fill(0); kickLean = 0;
      ch.play('jump_air', 0.25, false);
      beat = '';
    },
    kickOff(me, ax, az) {
      if (!mocap || !ch.actions.mj_wall) return false;
      const k = size();
      active = true; tier = 1; t = 0; wind = -1; bodyIn = 16; legsIn = 40; caught = false; fell = 0; queued = null; fromGround = false; over = 1e9;
      crouch = -1; vy = WALL_UP * k; peak = me.pos.y; pad = null; onPad = stepped = false;
      me.vel.set(ax * WALL_OUT * k, 0, az * WALL_OUT * k);
      upBody = upLegs = tookOff = true; seenOk = false; upClip = 'mj_wall';
      wall = { from: me.heading, t: 0 };
      x.set(ROWS.ready); xv.fill(0); kickLean = 0; turnT = 0;
      ch.play('mj_wall', 0.1, false);
      ch.actions.mj_wall.time = 0;
      ch.setRate(1);
      beat = '';
      return true;
    },
    press(me, stick) {
      // still crouching for the mocap's take-off: the press waits until she is off the ground
      if (active && (crouch >= 0 || onPad)) { queued = { x: stick.x, z: stick.z, amount: stick.amount }; return true; }
      if (!active || tier >= 4 || wind >= 0 || t < M.gap) return false;
      // early in the flip she cannot kick: the press waits until she is most of the way round
      if (flips() && t < M.flip * M.flipKick - M.windup) { queued = { x: stick.x, z: stick.z, amount: stick.amount }; return true; }
      queued = null;
      wind = M.windup;
      nextAmount = stick.amount;
      nextDir = stick.amount > 0.12 ? [stick.x, stick.z] : null;
      if (ch.state !== 'jump_air' && !upLegs) { ch.play('jump_air', 0.14, false); ch.setRate(1); }
      pad = null;
      if (flowOn()) {
        // the flow: the next move's clip has her at once, from its start (her gathering for the kick); the circle flashes
        // open under her; she is held until its kick, and off the circle then
        const k = size(), F = FLOW[tier + 1];
        windAll = wind = F.kick / F.rate; padStyle = 'flow'; padY = me.pos.y; reachFrom = me.pos.y;
        pad = circles.open(v.set(me.pos.x + me.vel.x * wind, padY - 0.02, me.pos.z + me.vel.z * wind), tier + 1, { ground: false, size: k, step: true, snap: true, after: DMC.after }) || true;
        ch.play(F.clip, 0.07, false);
        ch.actions[F.clip].time = 0;
        ch.setRate(F.rate);
        upBody = upLegs = tookOff = true; seenOk = false; upClip = F.clip; legsOut = 60;
      } else if (stepOn() === 'sky') {
        // the Air Step: the circle flashes open under the foot she steps with (out to its side), where her sole will be
        // when that leg is straight; she is held while it is driven down onto it, and then she is off it
        const k = size(), side = skySide(tier + 1), out = (side === 'R' ? -1 : 1) * SKY.side * k;
        windAll = wind = SKY.drive; padStyle = 'sky'; padSide = side; padY = me.pos.y; reachFrom = me.pos.y;
        const lx = Math.cos(me.heading), lz = -Math.sin(me.heading);          // (her left, over the ground)
        pad = circles.open(v.set(me.pos.x + me.vel.x * SKY.drive + lx * out, padY - 0.02, me.pos.z + me.vel.z * SKY.drive + lz * out), tier + 1, { ground: false, size: k, step: true, snap: true, after: SKY.after }) || true;
      } else if (stepOn() === 'dmc') {
        // the Air Hike: the circle flashes open at once where her soles will be when her legs are straight (her feet's
        // place as she stands: here), she is held while her legs are driven down onto it, and then she is off it
        const k = size();
        windAll = wind = DMC.stomp; padStyle = 'dmc'; padY = me.pos.y; reachFrom = me.pos.y;
        pad = circles.open(v.set(me.pos.x + me.vel.x * DMC.stomp, padY - 0.02, me.pos.z + me.vel.z * DMC.stomp), tier + 1, { ground: false, size: k, step: true, snap: true, after: DMC.after }) || true;
      } else if (stepOn()) {
        // the step: the circle opens where her feet will be when she has come down onto it
        const k = size();
        wind = STEP.reach; padStyle = 'stand'; reachFrom = me.pos.y;
        padY = me.pos.y + clamp(vy, -3 * k, 3 * k) * STEP.reach * 0.5 - STEP.drop * k;
        pad = circles.open(v.set(me.pos.x + me.vel.x * STEP.reach, padY - 0.02, me.pos.z + me.vel.z * STEP.reach), tier + 1, { ground: false, size: k, step: true }) || true;
      }
      return true;
    },
    end() {
      if (!active) return;
      active = false; tier = 0; wind = -1; vy = 0; queued = null; beat = '';
      legsOut = 28; bodyIn = 16; legsIn = 40; crouch = -1; upBody = upLegs = false; wall = null; pad = null; onPad = stepped = false; standOff = 0;
    },
    step(dt, me, stick, ground, catchable = true) {
      const k = size();
      // ---- the mocap's take-off: on the ground, crouching and pushing, until its feet leave it (the stick does nothing yet)
      if (onPad) {
        // ---- the step: on the circle, crouching and pushing (her poses: crouchPad, pushPad), until she leaves it
        padT += dt;
        me.pos.y = padY; vy = 0; over = me.pos.y - ground;
        me.vel.set(0, 0, 0);
        if (padT < STEP.crouch + STEP.push) return null;
        const extra = padT - STEP.crouch - STEP.push;
        onPad = false; t = 0; fell = 0; peak = me.pos.y;
        vy = speedFor(tier, STEP.drop);
        // off it: the way the stick was pushed at the press, or straight up with a little of how she came
        if (nextDir) {
          const s = M.push * k * Math.max(0.6, Math.min(1, nextAmount / 0.72));
          me.vel.set(nextDir[0] * s, 0, nextDir[1] * s);
          turnT = 0.18; kickLean = 1;
        } else { me.vel.copy(padVel).multiplyScalar(M.keep); kickLean = 0.25; }
        if (pad !== true) circles.kick(pad);
        dt = extra;
      }
      if (crouch >= 0) {
        crouch += dt;
        me.pos.y = ground; over = 0;
        if (crouch < UP_LIFT) return null;
        const extra = crouch - UP_LIFT;
        crouch = -1; t = 0; vy = speedFor(1); peak = me.pos.y;
        if (flowOn()) {
          // the flow's Step 1: the take-off's push, and off the ground the double jump's kick and tuck (its clip from its kick)
          const F = FLOW[1];
          ch.play(F.clip, 0.07, false);
          ch.actions[F.clip].time = F.kick;
          ch.setRate(F.rate);
          upClip = F.clip; upBody = upLegs = true; seenOk = false; stepped = 'flow'; legsOut = 60;
          beat = FLOW_BEATS[1];
        }
        dt = extra;                                          // (what is left of this frame: off the ground)
      }
      t += dt;
      if (queued && t >= (flips() ? M.flip * M.flipKick - M.windup : M.gap)) air.press(me, queued);
      // ---- the kick: after the wind-up, off the circle that opens under her
      if (wind >= 0 && pad && (padStyle === 'dmc' || padStyle === 'sky' || padStyle === 'flow')) {
        // ---- the Air Hike, the Air Step: held (her legs, or her stepping leg, driven down onto the circle), then off it
        // at once. The Air Step's last (Final Sky Kick): with the stick pushed, on ahead faster (SKY.dash)
        const sky = padStyle === 'sky', flow = padStyle === 'flow';
        wind -= dt;
        vy = 0;
        if (wind < 0) {
          tier++; t = 0; fell = 0; stepped = padStyle; bodyIn = 16; legsIn = 40;
          vy = speedFor(tier, sky ? SKY.more : flow ? FLOW.more : DMC.more); peak = me.pos.y;
          if (nextDir) {
            const s = M.push * k * Math.max(0.6, Math.min(1, nextAmount / 0.72)) * (sky && tier === 4 ? SKY.dash : 1);
            me.vel.set(nextDir[0] * s, 0, nextDir[1] * s);
            turnT = 0.18; kickLean = 1;
          } else {
            me.vel.multiplyScalar(M.keep); kickLean = 0.25;
            // (the flow, the stick let go: Step 2 out to her left, on the slant; Step 4's flip on over the way she faces)
            const F = flow ? FLOW[tier] : null;
            if (F && F.side) { me.vel.x += Math.cos(me.heading) * F.side * k; me.vel.z -= Math.sin(me.heading) * F.side * k; }
            if (F && F.ahead) { me.vel.x += Math.sin(me.heading) * F.ahead * k; me.vel.z += Math.cos(me.heading) * F.ahead * k; }
          }
          if (pad !== true) { circles.press(pad); circles.kick(pad); }
          beat = (flow ? FLOW_BEATS : sky ? SKY_BEATS : DMC_BEATS)[tier];
        }
      } else if (wind >= 0 && pad) {
        // ---- the step: down onto the circle (quicker and quicker), and onto it
        wind -= dt;
        const u = 1 - Math.max(0, wind) / STEP.reach, was = me.pos.y;
        me.pos.y = reachFrom + (padY - reachFrom) * u * u;
        vy = dt > 1e-6 ? (me.pos.y - was) / dt : vy;
        if (wind < 0) {
          tier++; t = 0; fell = 0; stepped = 'stand'; bodyIn = 16; legsIn = 40;
          me.pos.y = padY; vy = 0;
          onPad = true; padT = 0;
          padVel.copy(me.vel); me.vel.set(0, 0, 0);
          if (pad !== true) circles.press(pad);
          beat = STEP_BEATS[tier];
          return null;                                       // (she stands on it: nothing pulls her down)
        }
      } else if (wind >= 0) {
        wind -= dt;
        vy = Math.max(vy, -0.15 * k);
        if (wind < 0) {
          tier++; t = 0; fell = 0; bodyIn = 16; legsIn = 40;
          vy = speedFor(tier);
          if (nextDir) {
            const s = M.push * k * Math.max(0.6, Math.min(1, nextAmount / 0.72));
            me.vel.set(nextDir[0] * s, 0, nextDir[1] * s);
            turnT = 0.18; kickLean = 1;
          } else { me.vel.multiplyScalar(M.keep); kickLean = 0.25; }
          circles.open(v.set(me.pos.x, me.pos.y - 0.02, me.pos.z), tier, { ground: false, size: k });
          stepped = false;
          beat = BEATS[tier];
        }
      }
      // ---- steering: at a kick she turns at once to where it sends her (even if the stick has been let go since the press);
      // between kicks the stick only nudges her
      if (wall) {
        // kicking off a rock: round to face away from it, as the clip turns her (the stick moves her, it does not turn her)
        wall.t += dt;
        me.heading = wall.from - Math.PI * WALL_TURN(wall.t);
        if (wall.t * WALL_RATE >= 1.27 - WALL_FROM) wall = null;
        if (stick.amount > 0.12) {
          const s = M.push * k * Math.min(1, stick.amount / 0.72);
          me.vel.x += (stick.x * s - me.vel.x) * Math.min(1, dt * M.air);
          me.vel.z += (stick.z * s - me.vel.z) * Math.min(1, dt * M.air);
        }
      } else if (turnT > 0 && nextDir) me.heading += wrap(Math.atan2(nextDir[0], nextDir[1]) - me.heading) * Math.min(1, dt * 16);
      else if (stick.amount > 0.12) {
        const to = Math.atan2(stick.x, stick.z);
        me.heading += wrap(to - me.heading) * Math.min(1, dt * 4);
        if (turnT <= 0) {
          const s = M.push * k * Math.min(1, stick.amount / 0.72);
          me.vel.x += (stick.x * s - me.vel.x) * Math.min(1, dt * M.air);
          me.vel.z += (stick.z * s - me.vel.z) * Math.min(1, dt * M.air);
        }
      } else if (turnT <= 0) me.vel.multiplyScalar(Math.exp(-0.5 * dt));
      turnT -= dt;
      // ---- up and down: the game's pull (more on the way down), let off at the very top of each jump
      if (wind < 0) {
        const n = Math.max(1, tier) - 1, near = Math.abs(vy) / (M.hangV[n] * k);
        const g = M.grav * k * (vy < 0 ? M.fallGrav : 1) * (near < 1 ? THREE.MathUtils.lerp(M.hang[n], 1, near) : 1);
        const was = vy;
        vy = Math.max(vy - g * dt, -M.fall * k);
        // a long fall: a circle opens on the ground under her, and close over it she is slowed
        if (catchable && !caught && vy < 0 && peak - ground > M.cushion * k && me.pos.y - ground < 0.5 * k - vy * 0.2) {
          caught = true;
          circles.open(v.set(me.pos.x, ground + 0.02, me.pos.z), 'land', { ground: true, size: k });
        }
        if (caught && me.pos.y - ground < M.catchAt * k && vy < -M.catchV * k) vy += (-M.catchV * k - vy) * Math.min(1, dt * 16);
        me.pos.y += (was + vy) * 0.5 * dt;                   // (the same arc at any frame rate)
      } else if (!pad) me.pos.y += vy * dt;                 // (coming down onto a circle: moved above)
      peak = Math.max(peak, me.pos.y);
      over = me.pos.y - ground;
      if (vy < 0) fell += dt;
      // ---- her clip under the poses: the take-off's, then the one in the air
      if (ch.state === 'mj_up' || ch.state === 'mj_wall') {
        if (!upLegs) ch.play('jump_air', 0.22, false);            // (the poses have her now: the clip in the air under them)
        else ch.setRate(1);                                      // (both are baked at the pace they are played)
      } else if (ch.state === 'jump_start') {
        const c = ch.actions.jump_start;
        if (c.time >= c.getClip().duration - 0.02 || vy < 1.2 * k) ch.play('jump_air', 0.22, false);
        else ch.setRate(START_RATE);
      } else if (FLOW_CLIPS[ch.state]) {
        if (!upLegs && !upBody) ch.play('jump_air', 0.25, false);     // (the poses have her: the clip in the air under them)
        else ch.setRate(FLOW_CLIPS[ch.state].rate);
      } else if (ch.state === 'jump_air') ch.setRate(1);
      if (vy < 0 && t > 0.25) beat = fell > 0.4 ? 'ลง' : beat;
      // ---- down
      if (me.pos.y <= ground) {
        me.pos.y = ground; over = 0;
        if (vy > 0) return null;                             // rising past a higher step: carried up with it
        impact = clamp(-vy / (9 * k), 0.25, 1);
        const style = stepped;
        active = false; tier = 0; wind = -1; vy = 0; queued = null; bodyIn = 16; legsIn = 40; beat = caught ? 'วงเวทรับ' : '';
        upBody = upLegs = false; wall = null; pad = null; onPad = stepped = false;
        if (style === 'flow' && ch.actions[FLOW.land.clip]) {
          // the flow's: the ninja's landing (the library's), from where its feet are down; running on out of it sooner
          const L = FLOW.land, run = stick.amount > 0.12;
          landing = { clip: L.clip, rate: run ? L.run : L.rate, hold: run ? L.runHold : L.hold };
          ch.play(L.clip, 0, false);
          ch.setRate(landing.rate);
        } else if (hasMocap()) {
          // the mocap's: down into its crouch and up into her standing pose. Coming down with the stick pushed, a little
          // quicker, and she runs on out of it before its bottom
          landing = stick.amount > 0.12 ? { clip: 'mj_land', rate: 1.3, hold: 0.12 } : { clip: 'mj_land', rate: 1, hold: 0.3 };
          ch.play('mj_land', 0, false);
          ch.setRate(landing.rate);
        } else {
          landing = { clip: 'jump_land', rate: 1.4, hold: 0.14 + 0.1 * impact };
          ch.play('jump_land', 0, false);
          if (ch.actions.jump_land) ch.actions.jump_land.time = LAND_AT;
        }
        // her legs are the landing's at once: her hips go down into it as fast as she fell, and legs still held out
        // straight under them would go through the ground
        legsOut = 60;
        return 'landed';
      }
      return null;
    },
    pose(dt, me) {
      const obj = ch.object, k = size();
      clock += dt;
      impact = Math.max(0, impact - dt * 2.4);
      asTheClipHas();
      // ---- how much of her is the poses': all of her in the air, her legs at once off the ground (the take-off clip has her
      // body for a moment, not her legs: its knees fly out to her sides), and out again into the landing (her legs first:
      // they are the landing clip's as soon as they touch)
      // the mocap's take-off: her arms, back and head are taken on by the poses just after she leaves the ground (UP_BODY
      // s), her legs at the top of the first jump (its clip near its end), or both as soon as she presses again or
      // starts down; each from where it is, going as it was going
      if ((upBody || upLegs) && active && crouch < 0) {
        // (off a rock she is still turning as she starts down: only her next press, or the clip's end, gives her over)
        // (the step: the 2nd and 3rd are the 1st's, up to their tops; the 4th's turn takes her legs just after she leaves)
        // (the flow: its clip has all of her until its end, or another has come; a press only starts the next move's clip)
        const c = ch.actions[upClip], fc = FLOW_CLIPS[upClip];
        const all = fc ? ch.state !== upClip || c.time >= fc.end : wind >= 0 || (vy < 0 && upClip === 'mj_up') || tier > 1 || ch.state !== upClip;
        if (upBody && (all || (!fc && upClip === 'mj_up' && t >= UP_BODY) || (upClip === 'mj_wall' && c.time >= c.getClip().duration - 0.1))) {
          upBody = false;
          for (let i = 0; i < 12; i++) { x[i] = seen[i]; xv[i] = seenV[i] * CARRY; }
          for (let i = TOES; i < N; i++) { x[i] = i < BACK ? 0.5 : 0; xv[i] = 0; }
        }
        if (upLegs && (all || (!fc && c.time >= c.getClip().duration - 0.1))) {
          upLegs = false;
          for (let i = LEGS; i < LEGS + 12; i++) { x[i] = seen[i]; xv[i] = seenV[i] * CARRY; }
        }
      }
      const lift = active && tier === 1 && fromGround && !tookOff && wind < 0;
      const wantW = !active || upBody ? 0 : lift ? sstep(0.03, 0.2, t) : 1, wantWl = !active || upLegs ? 0 : lift ? sstep(0, 0.07, t) : 1;
      W += (wantW - W) * Math.min(1, dt * (wantW > W ? bodyIn : FLOW_CLIPS[upClip] ? 30 : 11));      // (the flow's clips: at once)
      Wl += (wantWl - Wl) * Math.min(1, dt * (wantWl > Wl ? legsIn : legsOut));
      // (through the landing too her knees are hinges: the landing clip turns her left knee in across her)
      // (not over the flow's clips: their knees turned out, and her hips under them, are the moves)
      const flowing = !!FLOW_CLIPS[ch.state];
      const hinged = (active && !flowing) || ch.state === 'jump_land' || ch.state === 'mj_land';
      Wh += ((hinged ? 1 : 0) - Wh) * Math.min(1, dt * (hinged ? 30 : flowing ? 24 : 6));
      // ---- her pose: each number carried toward where it is going by a spring (in small steps: the same at any frame rate)
      if (active && !upBody) {
        choosePose();
        const steps = Math.max(1, Math.ceil(dt / 0.012)), h = dt / steps;
        for (let s = 0; s < steps; s++) {
          for (let i = 0; i < N; i++) {
            const w = pace * PACE[i], f = 1 + 2 * h * settle * w, hw = h * w * w, d = 1 / (f + h * hw);
            const nx = (f * x[i] + h * xv[i] + h * hw * goal[i]) * d;
            xv[i] = (xv[i] + hw * (goal[i] - x[i])) * d;
            x[i] = nx;
          }
        }
        for (let i = 0; i < DIRS; i++) { const l = Math.hypot(x[i * 3], x[i * 3 + 1], x[i * 3 + 2]) || 1; x[i * 3] /= l; x[i * 3 + 1] /= l; x[i * 3 + 2] /= l; }
      }
      // ---- her body turned: the flip (about her hips, head over heels forward), the spin (about her up), and her lean
      // into a kick. A turn she kicks or lands out of before it is round is finished quickly, the short way
      if (active && flips()) flipA = Math.PI * 2 * FLIP(t / M.flip);
      else if (flipA > 0) flipA += (flipA > Math.PI ? 1 : -1) * dt * 20;
      if (active && tier === 4 && (!stepped || stepped === 'stand')) spinA = Math.PI * 2 * SPIN(t / M.spin);
      else if (spinA > 0) spinA += (spinA > Math.PI ? 1 : -1) * dt * 20;
      if (flipA <= 0 || flipA >= Math.PI * 2 - 1e-3) flipA = 0;
      if (spinA <= 0 || spinA >= Math.PI * 2 - 1e-3) spinA = 0;
      kickLean = Math.max(0, kickLean - dt * 3.2);
      const going = Math.min(1, Math.hypot(me.vel.x, me.vel.z) / (M.push * k));
      const wantLean = !active || upLegs ? 0 : (0.1 * kickLean + 0.03) * going + (vy < 0 ? -0.04 * sstep(2, 9, -vy / k) : 0) + (wind >= 0 ? 0.05 : 0)
        + (stepped === 'sky' ? SKY.lean[tier] * (0.4 + 0.6 * going) : 0);         // (the Air Step: leaning into it, the more the faster she goes)
      { const w = 13, f = 1 + 2 * dt * 0.8 * w, hw = dt * w * w, d = 1 / (f + dt * hw), nl = (f * lean + dt * leanV + dt * hw * wantLean) * d; leanV = (leanV + hw * (wantLean - lean)) * d; lean = nl; }
      // (a clip that turns her over, the flow's flip: how far over, from her hips)
      let over_ = 0;
      if (active && FLOW_CLIPS[ch.state]) { bones.hips.getWorldQuaternion(q); over_ = sstep(0.45, -0.2, a.set(0, 1, 0).applyQuaternion(q).y); }
      held += ((flipA > 0 || over_ > 0.1 ? 1 : spinA > 0 ? 0.8 : active ? 0.6 : 0) - held) * Math.min(1, dt * 12);
      upside += (Math.max(flipA > 0.5 && flipA < Math.PI * 2 - 0.5 ? 1 : 0, over_) - upside) * Math.min(1, dt * 14);
      if (flipA > 0 || spinA > 0 || Math.abs(lean) > 1e-4) {
        obj.updateMatrixWorld(true);
        bones.hips.getWorldPosition(a);
        obj.parent.worldToLocal(a);                        // her hips, where the page stands her (not yet turned)
        qy.copy(obj.quaternion);
        qf.setFromAxisAngle(X, flipA);                     // the flip about her side,
        qf.premultiply(q.setFromAxisAngle(Y, spinA));      // the spin about her up,
        qf.premultiply(q.setFromAxisAngle(X, lean));       // and her lean the way she is going (it does not turn with the spin)
        obj.quaternion.copy(qy).multiply(qf);
        b.copy(a).applyQuaternion(Pi.copy(qy).invert()).applyQuaternion(obj.quaternion);
        obj.position.add(a).sub(b);                        // turned about her hips, not her feet
      }
      obj.updateMatrixWorld(true);
      obj.getWorldQuaternion(objQ);
      objQi.copy(objQ).invert();
      // ---- her back and her head, over the clip; then her arms and legs, and her feet pointed
      if (W > 0.001 || Wl > 0.001 || Wh > 0.001) {
        const nb = bones.back.length, nn = bones.neck.length;
        for (const bone of bones.back) bend(bone, x[BACK] * W / nb, x[BACK + 1] * W / nb, x[BACK + 2] * W / nb);
        for (const bone of bones.neck) bend(bone, x[HEAD] * W / nn, x[HEAD + 1] * W / nn, x[HEAD + 2] * W / nn);
        bones.hips.updateMatrixWorld(true);
        for (const [s, mirror, arm, leg] of [['L', 1, 0, 4], ['R', -1, 2, 6]]) {
          const [ua, la, hand] = bones[s], [ul, ll, foot, toe] = bones[s + 'leg'];
          wantDir(arm, mirror); aimAt(ua, la, W);
          wantDir(arm + 1, mirror); aimAt(la, hand, W);
          if (bones.hinge[s]) {
            const o = -mirror * x[OUT + (s === 'L' ? 0 : 1)] * Wl;     // her pose's turn of this leg (out: her left's toes to her left)
            foot.getWorldQuaternion(qFoot);                  // her foot as the clip has it, before her leg is laid
            if (Wl > 0.001) { wantDir(leg, mirror); d1.copy(want); wantDir(leg + 1, mirror); d2.copy(want); layLeg(bones.hinge[s], ul, ll, Wl, o); }
            if (Wh > 0.001) {                              // her knees as hinges, her legs where they now are (the clip's, under the poses)
              ul.getWorldPosition(pH); ll.getWorldPosition(pK); foot.getWorldPosition(pF);
              toe.getWorldPosition(toes).sub(pF);
              const bent = kneeAhead();
              d1.subVectors(pK, pH).normalize(); d2.subVectors(pF, pK).normalize();
              layLeg(bones.hinge[s], ul, ll, Wh * (bent + (1 - bent) * Wl), o);      // (a leg of the clip's near straight: not touched)
            }
            // where the clip shows, her foot is the clip's whichever way her knee was turned: flat on the ground and
            // pointing as she stands (not swung round with her shin, to swing back as she straightens)
            if (Wl < 0.999) { ll.getWorldQuaternion(P); foot.quaternion.slerp(q.copy(P).invert().multiply(qFoot), 1 - Wl); foot.updateMatrixWorld(true); }
          } else if (Wl > 0.001) { wantDir(leg, mirror); aimAt(ul, ll, Wl); wantDir(leg + 1, mirror); aimAt(ll, foot, Wl); }
          // her foot: pointed along her shin (her toes down, not her sole), or laid level to meet the ground (turned as her leg is)
          const side = s === 'L' ? 0 : 1, point = x[TOES + side] * Wl, level = x[FLAT + side] * Wl;
          if (point > 0.01 && ll && foot && toe) { ll.getWorldPosition(a); foot.getWorldPosition(b); want.subVectors(b, a).normalize(); aimAt(foot, toe, point * 0.8); }
          if (level > 0.01 && foot && toe) { want.set(Math.sin(x[OUT + side]) * mirror, -0.53, Math.cos(x[OUT + side])).normalize().applyQuaternion(objQ); aimAt(foot, toe, level); }
        }
      }
      // ---- the step: her feet on the circle. Coming down onto it and standing on it her body is moved up or down (quickly,
      // not at once) so that the lower of her soles is on it: as her knees bend her body goes down, as she pushes it
      // goes up; off it, that is let go of
      {
        const k = size();
        if (soleA < 0) { soleA = 0.085 * k; soleT = 0.025 * k; }
        let want = 0;
        if (onPad || (pad && wind >= 0)) {
          const low = pad && padStyle === 'sky' && !onPad ? soleOf(padSide) : Math.min(soleOf('L'), soleOf('R'));      // (the Air Step: her stepping foot's)
          want = (pad !== true && circles.level ? circles.level(pad) + 0.02 : padY) - low;      // (the circle gives under her)
          // (the Air Hike: her soles met with it as her legs come down, a little either way; coming down onto it: only so
          // as not to go through it)
          if ((padStyle === 'dmc' || padStyle === 'flow') && !onPad) want = clamp(want, -0.1 * k, 0.1 * k) * sstep(0.3, 1, 1 - wind / windAll);
          else if (padStyle === 'sky' && !onPad) want = clamp(want, -0.12 * k, 0.1 * k) * sstep(0.3, 1, 1 - wind / windAll);
          else if (!onPad) want = Math.min(0, want) * sstep(0.6, 1, 1 - wind / STEP.reach);
        }
        const was = standOff;
        standOff += (want - standOff) * Math.min(1, dt * (onPad ? STEP.lock : 16));
        if (Math.abs(standOff) < 1e-4 && !onPad) standOff = 0;
        if (standOff !== 0 || was !== 0) { obj.position.y += standOff; obj.updateMatrixWorld(true); }
      }
      // (standing on the ground, out of any jump: how high her ankles and toes are, for her soles above)
      if (!active && ch.state === 'idle' && W < 0.01 && Wl < 0.01 && Wh < 0.01) {
        obj.updateMatrixWorld(true);
        let A = 1e9, T = 1e9;
        for (const s of ['L', 'R']) { const [, , foot, toe] = bones[s + 'leg']; if (foot) A = Math.min(A, foot.getWorldPosition(a).y); if (toe) T = Math.min(T, toe.getWorldPosition(a).y); }
        if (A < 1e8 && T < 1e8) { soleA = A - me.pos.y; soleT = T - me.pos.y; }
      }
      remember(W > 0.001 || Wl > 0.001 || Wh > 0.001);
      // while the mocap has her: where her limbs point now (in her own frame, her right side's x the other way), and how
      // fast they are going, for the poses to begin from
      if (upBody || upLegs) {
        const ends = [['L', 0, 1], ['R', 6, -1]];
        for (const [s, at, mirror] of ends) {
          const [ua, la, hand] = bones[s], [ul, ll, foot] = bones[s + 'leg'];
          [[ua, la, at], [la, hand, at + 3], [ul, ll, at + 12], [ll, foot, at + 15]].forEach(([p, c, i]) => {
            p.getWorldPosition(a); c.getWorldPosition(b);
            want.subVectors(b, a).normalize().applyQuaternion(objQi);
            const nx = want.x * mirror, ny = want.y, nz = want.z;
            if (seenOk && dt > 1e-4) { seenV[i] = (nx - seen[i]) / dt; seenV[i + 1] = (ny - seen[i + 1]) / dt; seenV[i + 2] = (nz - seen[i + 2]) / dt; }
            seen[i] = nx; seen[i + 1] = ny; seen[i + 2] = nz;
          });
        }
        seenOk = true;
      }
    },
    // for a test: the state of the jump now
    get debug() { return { tier, t, wind, vy, peak, caught, flipA, spinA, W, Wl, lean, crouch, onPad, padT, stepped, padStyle, padSide, padY, standOff, soleA, soleT, pose: Array.from(x) }; },
  };
  return air;
}
