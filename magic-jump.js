/* ==========================================================================
   magic-jump.js  —  Vivi's magic jump: up to four jumps in one flight, each off a magic circle that opens under her feet
   (magic-circle-fx.js). The others fly; she jumps. Her body in the air, and the jump's own rules; nothing else.

     const air = createMagicJump({ character, circles })
     air.takeOff(me)                 the jump button on the ground: the first jump (a small circle on the ground)
     air.drop(me)                    she walked off an edge: falling, three jumps left
     air.press(me, stick)            the jump button in the air: the next one, if she has one left (false: none)
     every frame she is in the air (air.active), after she has been moved across the ground:
       air.step(dt, me, stick, ground)  -> 'landed' on the frame she comes down (her clip is the landing's then)
     every frame (on the ground too: she eases out of the flight into the landing), after character.update(dt) and once
     she is placed (her object at her feet, turned to her heading):
       air.pose(dt, me)              her whole body in the air: its turns (the flip, the spin, her lean) and her limbs
     air.held                        0..1: how hard her hair and skirt should be held now: a little all through a flight (a
                                     long fall would blow her skirt up), hard through the flip and the spin
     air.upside                      0..1: how far she is upside down (her hair and skirt should not hang by their weight then)
     air.tier, air.beat              how many jumps this flight; what she is doing now (for a label)
     air.impact                      0..1, for a moment after she lands: how hard she came down (a page may slow her by it)

   me: { pos (her feet, world), vel (her speed over the ground: x, z), heading }, the page's, changed here.
   stick: { x, z, amount }: where the stick points over the ground (unit) and how far it is pushed (0..1).
   ground: the height of what is under her now.

   The four jumps (numbers for a girl 1.75 m tall; a smaller or bigger one gets them in her own size):
     1  off the ground: the game's take-off clip                                       rises HEIGHTS[0]
     2  a leap: her hand flicked down at the circle she kicks off, then reaching up     rises HEIGHTS[1] more
     3  a front flip: stretched, tucked, opened out                                    rises HEIGHTS[2] more
     4  a full turn: her hands at her chest, then one swept up over her head            rises HEIGHTS[3] more
   Each a little less than the one before: it is a jump, not flying. Each in the air waits WINDUP s first (her knees come
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
   ========================================================================== */
import * as THREE from 'three';

export const MAGIC_JUMP = {
  heights: [1.4, 1.19, 0.98, 0.84],   // m each jump rises (100%, 85%, 70%, 60%): 4.4 m up in all, at the top of each
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
     spine: [bend forward, turn to her left, lean to her right] (radians, over her whole back)      head: the same, her neck's
   A pose says where she is going; the springs below take her there. Two things kept to in all of them: her elbows are
   never locked straight, and her arms are never both straight out to the sides. */
const both = (arm, leg, rest) => ({ aL: arm, aR: arm, lL: leg, lR: leg, ...rest });
const POSES = {
  // waiting at the top of a jump: gathered a little under her, ready to kick again
  ready: {
    aL: [[0.55, -0.8, -0.2], [0.5, -0.8, 0.33]], aR: [[0.55, -0.8, -0.2], [0.5, -0.8, 0.33]],
    lL: [[0.09, -0.72, 0.69], [0.02, -0.9, -0.43]], lR: [[0.08, -0.9, 0.42], [0.02, -0.95, -0.3]],
    toe: [0.6, 0.6], spine: [0.08, 0, 0], head: [0, 0, 0],
  },
  // the wind-up of a kick: her knees right up under her, her arms swung back, her back curled
  gather: {
    aL: [[0.42, -0.78, -0.46], [0.38, -0.88, -0.28]], aR: [[0.42, -0.78, -0.46], [0.38, -0.88, -0.28]],
    lL: [[0.1, -0.48, 0.87], [0.02, -0.8, -0.6]], lR: [[0.1, -0.66, 0.74], [0.02, -0.88, -0.47]],
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
  // falling, slowly: her arms low, soft and not alike (one hand a little forward, one a little back), one knee forward
  fall: {
    aL: [[0.36, -0.78, 0.52], [0.3, -0.4, 0.87]], aR: [[0.6, -0.76, -0.25], [0.74, -0.62, -0.25]],
    lL: [[0.1, -0.8, 0.59], [0, -0.85, -0.53]], lR: [[0.06, -0.99, -0.08], [0, -0.86, -0.5]],
    toe: [0.8, 0.8], spine: [0.04, 0.1, 0.03], head: [0.14, -0.06, 0],
  },
  // falling fast: the air lifts her arms a little (still low, still bent), her knee comes up more
  fallFast: {
    aL: [[0.42, -0.66, 0.62], [0.3, -0.05, 0.95]], aR: [[0.7, -0.66, -0.28], [0.8, -0.5, -0.34]],
    lL: [[0.12, -0.72, 0.68], [0, -0.8, -0.6]], lR: [[0.08, -0.97, 0.1], [0, -0.82, -0.57]],
    toe: [0.7, 0.7], spine: [0.08, 0.12, 0.04], head: [0.2, -0.08, 0],
  },
  // just over the ground: her legs reach down for it, her arms low and a little out for balance
  reach: {
    aL: [[0.55, -0.8, 0.15], [0.66, -0.6, 0.45]], aR: [[0.55, -0.8, 0.15], [0.66, -0.6, 0.45]],
    lL: [[0.07, -0.97, 0.22], [0, -0.99, -0.1]], lR: [[0.07, -0.99, 0.08], [0, -0.99, -0.14]],
    toe: [0.45, 0.45], spine: [0.12, 0, 0], head: [0.1, 0, 0],
  },
};
// a pose as numbers in a row: 8 directions (aL, aR, lL, lR: upper then lower), her two feet, her back (3), her head (3)
const N = 32, DIRS = 8, LEGS = 12, TOES = 24, BACK = 26, HEAD = 29;
const row = p => {
  const r = new Float32Array(N);
  [p.aL[0], p.aL[1], p.aR[0], p.aR[1], p.lL[0], p.lL[1], p.lR[0], p.lR[1]].forEach((d, i) => { const l = Math.hypot(d[0], d[1], d[2]); r[i * 3] = d[0] / l; r[i * 3 + 1] = d[1] / l; r[i * 3 + 2] = d[2] / l; });
  r.set(p.toe, TOES); r.set(p.spine, BACK); r.set(p.head, HEAD);
  return r;
};
const ROWS = Object.fromEntries(Object.entries(POSES).map(([k, p]) => [k, row(p)]));
// how quickly each part follows (times the pose's own pace): her back first, her forearms and shins after their arms and thighs
const PACE = new Float32Array(N);
[1, 0.74, 1, 0.74, 1.05, 0.8, 1.05, 0.8].forEach((v, i) => PACE.fill(v, i * 3, i * 3 + 3));
PACE.fill(0.9, TOES, BACK); PACE.fill(1.15, BACK, HEAD); PACE.fill(0.85, HEAD, N);
/* each jump after its kick: [until (s after the kick), pose, pace (how hard the springs pull, 1/s), how it settles (1: it
   stops there; less: it runs a little past and comes back)]; after the last, 'ready' until she falls */
const MOVES = {
  1: [],
  2: [[0.1, 'kick2', 40, 0.72], [0.34, 'leap2', 19, 0.74]],
  3: [[0.07, 'kick3', 42, 0.8], [0.31, 'tuck3', 38, 0.9], [0.53, 'open3', 24, 0.7]],
  4: [[0.08, 'kick4', 42, 0.8], [0.21, 'twirl4', 26, 0.85], [0.95, 'bloom4', 15, 0.7]],
};

export function createMagicJump({ character, circles }) {
  let ch = character;
  let active = false, tier = 0, t = 0, wind = -1, nextDir = null, nextAmount = 0, vy = 0, peak = 0, caught = false, fell = 0, turnT = 0;
  let queued = null;                          // a press made early in the flip: kept until she is most of the way round
  let beat = '';
  let fromGround = false;                     // this flight began with the take-off clip (not by walking off an edge)
  let over = 1e9;                             // m of air under her feet (from the last step), for her legs' reach
  let clock = 0;                              // s, for what never stops (her arms and legs falling)
  let W = 0, Wl = 0;                          // how much of her is the poses' (the rest: the clip under them): her body, her legs
  let held = 0, upside = 0, flipA = 0, spinA = 0, lean = 0, leanV = 0, kickLean = 0, impact = 0;
  let pace = 15, settle = 0.9;                // how the springs pull now
  const x = new Float32Array(N), xv = new Float32Array(N), goal = new Float32Array(N);      // her pose now, how fast it is changing, where it is going
  x.set(ROWS.ready);
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), cur = new THREE.Vector3(), want = new THREE.Vector3();
  const q = new THREE.Quaternion(), qt = new THREE.Quaternion(), qy = new THREE.Quaternion(), qf = new THREE.Quaternion(), P = new THREE.Quaternion(), Pi = new THREE.Quaternion(), objQ = new THREE.Quaternion(), objQi = new THREE.Quaternion();
  const ONE = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), eul = new THREE.Euler();
  let bones = null, kept = [];
  const findBones = () => {
    const g = n => ch.model.getObjectByName(n);
    bones = { hips: g('J_Bip_C_Hips'), back: [g('J_Bip_C_Spine'), g('J_Bip_C_Chest'), g('J_Bip_C_UpperChest')].filter(Boolean), neck: [g('J_Bip_C_Neck'), g('J_Bip_C_Head')].filter(Boolean) };
    for (const s of ['L', 'R']) {
      bones[s] = [g(`J_Bip_${s}_UpperArm`), g(`J_Bip_${s}_LowerArm`), g(`J_Bip_${s}_Hand`)];
      bones[s + 'leg'] = [g(`J_Bip_${s}_UpperLeg`), g(`J_Bip_${s}_LowerLeg`), g(`J_Bip_${s}_Foot`), g(`J_Bip_${s}_ToeBase`)];
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
  // how fast jump n must leave to top out its height higher, the hold at its top counted in
  function speedFor(n) {
    const k = size(), g = M.grav * k, V = M.hangV[n - 1] * k, c = M.hang[n - 1], s = (1 - c) / V;
    const through = (V / s + c / (s * s) * Math.log(c)) / g;          // m risen through the hold (from V to still)
    return Math.sqrt(Math.max(0, V * V + 2 * g * (M.heights[n - 1] * k - through)));
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

  // ---- where her body is going now (goal), and how the springs pull it there (pace, settle)
  function choosePose() {
    const k = size();
    let name = 'ready';
    pace = 15; settle = 0.9;
    if (wind >= 0) { name = 'gather'; pace = 34; settle = 1; }
    else {
      // (a move is let go of once she is well on her way down, but never the flip before she is round)
      const dropping = vy < -5.5 * k && !(tier === 3 && t < M.flip);
      if (!dropping) for (const m of MOVES[tier] || []) if (t < m[0]) { name = m[1]; pace = m[2]; settle = m[3]; break; }
    }
    goal.set(ROWS[name]);
    if (name !== 'ready' || wind >= 0) return;
    // out of a jump's move and coming down: her falling pose, the faster the more the air lifts her arms. Nothing in it
    // holds still: her legs change places slowly, the air goes through her arms, her back sways
    const down = sstep(1.2 * k, 4.5 * k, -vy), fast = sstep(6 * k, 13 * k, -vy);
    if (down > 0) {
      const F = ROWS.fall, FF = ROWS.fallFast;
      for (let i = 0; i < N; i++) goal[i] += ((F[i] + (FF[i] - F[i]) * fast) - goal[i]) * down;
      const swap = 0.3 * down * (0.5 + 0.5 * Math.sin(clock * 3.6));
      for (let i = LEGS; i < LEGS + 6; i++) { const l = goal[i], r = goal[i + 6]; goal[i] = l + (r - l) * swap; goal[i + 6] = r + (l - r) * swap; }
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
    get impact() { return impact; },
    setCharacter(next) { ch = next; findBones(); },
    takeOff(me) {
      active = true; tier = 1; t = 0; wind = -1; caught = false; fell = 0; queued = null; fromGround = true; over = 1e9;
      vy = speedFor(1); peak = me.pos.y;
      x.set(ROWS.ready); xv.fill(0); kickLean = 0;
      ch.play('jump_start', 0.08, false);
      if (ch.actions.jump_start) ch.actions.jump_start.time = START_AT;
      ch.setRate(START_RATE);
      circles.open(v.set(me.pos.x, me.pos.y + 0.02, me.pos.z), 1, { ground: true, size: size() });
      beat = 'ชั้น 1';
    },
    // walking off a rock's top: falling, with the first jump as good as used (three are left)
    drop(me) {
      active = true; tier = 1; t = 1; wind = -1; caught = false; fell = 0; queued = null; fromGround = false; over = 1e9;
      vy = 0; peak = me.pos.y;
      x.set(ROWS.ready); xv.fill(0); kickLean = 0;
      ch.play('jump_air', 0.25, false);
      beat = '';
    },
    press(me, stick) {
      if (!active || tier >= 4 || wind >= 0 || t < M.gap) return false;
      // early in the flip she cannot kick: the press waits until she is most of the way round
      if (tier === 3 && t < M.flip * M.flipKick - M.windup) { queued = { x: stick.x, z: stick.z, amount: stick.amount }; return true; }
      queued = null;
      wind = M.windup;
      nextAmount = stick.amount;
      nextDir = stick.amount > 0.12 ? [stick.x, stick.z] : null;
      if (ch.state !== 'jump_air') { ch.play('jump_air', 0.14, false); ch.setRate(1); }
      return true;
    },
    step(dt, me, stick, ground) {
      const k = size();
      t += dt;
      if (queued && t >= M.flip * M.flipKick - M.windup) air.press(me, queued);
      // ---- the kick: after the wind-up, off the circle that opens under her
      if (wind >= 0) {
        wind -= dt;
        vy = Math.max(vy, -0.15 * k);
        if (wind < 0) {
          tier++; t = 0; fell = 0;
          vy = speedFor(tier);
          if (nextDir) {
            const s = M.push * k * Math.max(0.6, Math.min(1, nextAmount / 0.72));
            me.vel.set(nextDir[0] * s, 0, nextDir[1] * s);
            turnT = 0.18; kickLean = 1;
          } else { me.vel.multiplyScalar(M.keep); kickLean = 0.25; }
          circles.open(v.set(me.pos.x, me.pos.y - 0.02, me.pos.z), tier, { ground: false, size: k });
          beat = ['', 'ชั้น 1', 'ชั้น 2 · สะบัดมือ', 'ชั้น 3 · ตีลังกา', 'ชั้น 4 · หมุนตัว'][tier];
        }
      }
      // ---- steering: at a kick she turns at once to where it sends her (even if the stick has been let go since the press);
      // between kicks the stick only nudges her
      if (turnT > 0 && nextDir) me.heading += wrap(Math.atan2(nextDir[0], nextDir[1]) - me.heading) * Math.min(1, dt * 16);
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
        if (!caught && vy < 0 && peak - ground > M.cushion * k && me.pos.y - ground < 0.5 * k - vy * 0.2) {
          caught = true;
          circles.open(v.set(me.pos.x, ground + 0.02, me.pos.z), 'land', { ground: true, size: k });
        }
        if (caught && me.pos.y - ground < M.catchAt * k && vy < -M.catchV * k) vy += (-M.catchV * k - vy) * Math.min(1, dt * 16);
        me.pos.y += (was + vy) * 0.5 * dt;                   // (the same arc at any frame rate)
      } else me.pos.y += vy * dt;
      peak = Math.max(peak, me.pos.y);
      over = me.pos.y - ground;
      if (vy < 0) fell += dt;
      // ---- her clip under the poses: the take-off's, then the one in the air
      if (ch.state === 'jump_start') {
        const c = ch.actions.jump_start;
        if (c.time >= c.getClip().duration - 0.02 || vy < 1.2 * k) ch.play('jump_air', 0.22, false);
        else ch.setRate(START_RATE);
      } else if (ch.state === 'jump_air') ch.setRate(1);
      if (vy < 0 && t > 0.25) beat = fell > 0.4 ? 'ลง' : beat;
      // ---- down
      if (me.pos.y <= ground) {
        me.pos.y = ground; over = 0;
        if (vy > 0) return null;                             // rising past a higher step: carried up with it
        impact = clamp(-vy / (9 * k), 0.25, 1);
        active = false; tier = 0; wind = -1; vy = 0; queued = null; beat = caught ? 'วงเวทรับ' : '';
        ch.play('jump_land', 0.1, false);
        return 'landed';
      }
      return null;
    },
    pose(dt, me) {
      const obj = ch.object, k = size();
      clock += dt;
      impact = Math.max(0, impact - dt * 2.4);
      asTheClipHas();
      // ---- how much of her is the poses': not the take-off (the clip's), all of her from near the top of the first jump
      // on, and out again into the landing (her legs first: they are the landing clip's as soon as they touch)
      const wantW = !active ? 0 : (tier === 1 && fromGround && wind < 0 ? sstep(0.16, 0.36, t) : 1);
      W += (wantW - W) * Math.min(1, dt * (wantW > W ? 16 : 11));
      Wl += (wantW - Wl) * Math.min(1, dt * (wantW > Wl ? 16 : 28));
      // ---- her pose: each number carried toward where it is going by a spring (in small steps: the same at any frame rate)
      if (active) {
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
      if (active && tier === 3) flipA = Math.PI * 2 * FLIP(t / M.flip);
      else if (flipA > 0) flipA += (flipA > Math.PI ? 1 : -1) * dt * 20;
      if (active && tier === 4) spinA = Math.PI * 2 * SPIN(t / M.spin);
      else if (spinA > 0) spinA += (spinA > Math.PI ? 1 : -1) * dt * 20;
      if (flipA <= 0 || flipA >= Math.PI * 2 - 1e-3) flipA = 0;
      if (spinA <= 0 || spinA >= Math.PI * 2 - 1e-3) spinA = 0;
      kickLean = Math.max(0, kickLean - dt * 3.2);
      const going = Math.min(1, Math.hypot(me.vel.x, me.vel.z) / (M.push * k));
      const wantLean = !active ? 0 : (0.1 * kickLean + 0.03) * going + (vy < 0 ? -0.04 * sstep(2, 9, -vy / k) : 0) + (wind >= 0 ? 0.05 : 0);
      { const w = 13, f = 1 + 2 * dt * 0.8 * w, hw = dt * w * w, d = 1 / (f + dt * hw), nl = (f * lean + dt * leanV + dt * hw * wantLean) * d; leanV = (leanV + hw * (wantLean - lean)) * d; lean = nl; }
      held += ((flipA > 0 ? 1 : spinA > 0 ? 0.8 : active ? 0.6 : 0) - held) * Math.min(1, dt * 12);
      upside += ((flipA > 0.5 && flipA < Math.PI * 2 - 0.5 ? 1 : 0) - upside) * Math.min(1, dt * 14);
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
      if (W > 0.001) {
        const nb = bones.back.length, nn = bones.neck.length;
        for (const bone of bones.back) bend(bone, x[BACK] * W / nb, x[BACK + 1] * W / nb, x[BACK + 2] * W / nb);
        for (const bone of bones.neck) bend(bone, x[HEAD] * W / nn, x[HEAD + 1] * W / nn, x[HEAD + 2] * W / nn);
        bones.hips.updateMatrixWorld(true);
        for (const [s, mirror, arm, leg] of [['L', 1, 0, 4], ['R', -1, 2, 6]]) {
          const [ua, la, hand] = bones[s], [ul, ll, foot, toe] = bones[s + 'leg'];
          wantDir(arm, mirror); aimAt(ua, la, W);
          wantDir(arm + 1, mirror); aimAt(la, hand, W);
          wantDir(leg, mirror); aimAt(ul, ll, Wl);
          wantDir(leg + 1, mirror); aimAt(ll, foot, Wl);
          // her foot: pointed along her shin (her toes down, not her sole)
          const point = x[TOES + (s === 'L' ? 0 : 1)] * Wl;
          if (point > 0.01 && ll && foot && toe) { ll.getWorldPosition(a); foot.getWorldPosition(b); want.subVectors(b, a).normalize(); aimAt(foot, toe, point * 0.8); }
        }
      }
      remember(W > 0.001);
    },
    // for a test: the state of the jump now
    get debug() { return { tier, t, wind, vy, peak, caught, flipA, spinA, W, lean, pose: Array.from(x) }; },
  };
  return air;
}
