/* ==========================================================================
   plant-boss-talk.js  —  the plant boss's three heads talking: a short scene with a script, played round and round.
   One job: act it. It builds nothing and draws nothing: it only sets the numbers plant-boss.js gives each head
   (boss.userData.heads) and calls boss.userData.pose().

     const talk = createBossTalk(boss, { direct })   direct: who says what, when (below); without it, TALK_SCENE
     every frame: talk.update(dt, eye)      eye: where 'you' is (world, a Vector3): the eye that watches (the trial
                                            page), or her (the game)
     talk.on = false                        they stop and settle back to standing; true: the scene goes on
     talk.restart()                         from the top
     talk.time, talk.length                 where the scene is, and how long it is (seconds)
   direct (dt) -> { heads, since }          the scene from elsewhere (plant-boss-banter.js: the game): what each head does
                                            now, as one of TALK_SCENE's beats gives it ([who it looks at, mood, how much it
                                            talks, a move]), and how many seconds it has been doing it

   The scene (TALK_SCENE: who looks at whom, in what mood, who is talking): the left head has news for the middle one,
   who doubts it, while the right one is bored and yawns; the right one butts in, the two quarrel, the left one looks
   from one to the other; then it laughs at them, they both turn on it; all three notice the player and freeze; the
   middle one checks with the others, and they all laugh.

   How a head acts
     - it looks at who it looks at with its eyes first (they slide over the hollow), and turns its head part of the way
       after them (not all the way: the heads are big and close, and it keeps its face to the player, as on a stage);
       it tips up or down to them, and its neck carries it a little toward them
     - a roar (the move 'roar'): it rears and bellows at who it looks at, shaking, each head in its own way (the middle
       one drawn up tall, the right one lunging, the left one with its head thrown back), and the bush shakes
     - its mood sets its face (MOODS: eyes, mouth, hood) and how it carries itself (leaning in, drawn back, drooping)
     - talking, its lower lip beats in syllables with short rests, and its head beats with it; laughing, it is thrown
       back and bounces; a yawn opens wide and slow with the eyes shut
     - nothing snaps: a turn or a reach overshoots a little and settles, as a soft heavy arm would (springs); a face
       changes quickly but not at once
   ========================================================================== */
import * as THREE from 'three';
import { BOSS_HEAD_REST, aimHead } from './plant-boss.js';

// the faces. Each is the numbers of plant-boss.js's heads; what is not named is as at rest. carry: how the head holds
// itself in that mood: in (metres its neck reaches toward who it looks at; less than 0: drawn back), up (metres),
// nod / tilt (radians), wave (how wide its neck still waves)
export const MOODS = {
  calm:  { jaw: 0.4, carry: { in: 0.1, wave: 0.6 } },
  keen:  { jaw: 0.5, size: 1.14, flare: 0.3, curve: 0.6, carry: { in: 0.22, up: 0.1, wave: 0.6 } },
  doubt: { jaw: 0.3, lid: 0.7, slant: 0.2, brow: 0.26, curve: -0.6, carry: { tilt: 0.24, wave: 0.5 } },
  bored: { jaw: 0.15, lid: 0.42, slant: -0.12, flare: -0.3, curve: -0.7, carry: { up: -0.38, nod: 0.06, wave: 1.0 } },
  angry: { jaw: 0.5, lid: 0.9, slant: 0.9, flare: 1.0, curve: -1.0, carry: { in: 0.3, up: 0.12, nod: 0.1, wave: 0.45 } },
  shock: { jaw: 1.0, size: 1.42, flare: 0.85, curve: -0.3, carry: { in: -0.3, up: 0.3, nod: -0.14, wave: 0.2 } },
  sad:   { jaw: 0.25, lid: 0.8, slant: -0.8, flare: -0.2, curve: -1.0, carry: { in: -0.1, up: -0.35, wave: 0.5 } },
  laugh: { jaw: 0.9, smile: 1, size: 1.05, flare: 0.45, curve: 1.0, carry: { up: 0.15, nod: -0.24, wave: 0.5 } },
};

// the scene. heads: [middle, right (+x), left (-x)], each [who it looks at, mood, how much it talks 0..1, a move of its
// own]. Looks at: 'C' 'R' 'L' (a head), 'you' (the player), 'away', 'down', or two of them (it looks from one to the other).
// Moves: 'nod' (it agrees as it listens), 'shake', 'yawn', 'roar'
export const TALK_SCENE = {
  length: 26,
  beats: [
    { t: 0.0,  heads: [['L', 'calm', 0, 'nod'],        ['away', 'bored', 0],          ['C', 'keen', 1]] },                // the left one has news
    { t: 3.6,  heads: [['L', 'doubt', 0.8],            ['away', 'bored', 0, 'yawn'],  ['C', 'keen', 0, 'nod']] },         // the middle one doubts it; the right one yawns
    { t: 6.6,  heads: [['R', 'shock', 0],              ['C', 'angry', 1],             ['R', 'doubt', 0]] },               // the right one butts in
    { t: 9.2,  heads: [['R', 'angry', 1],              ['C', 'angry', 1, 'shake'],    [['C', 'R'], 'sad', 0]] },          // they quarrel; the left one looks from one to the other
    { t: 12.6, heads: [['L', 'doubt', 0],              ['L', 'angry', 0],             ['you', 'laugh', 0]] },             // the left one laughs at them
    { t: 15.6, heads: [['L', 'angry', 1],              ['L', 'angry', 1],             ['C', 'shock', 0]] },               // both turn on it
    { t: 17.3, heads: [['L', 'angry', 0],              ['L', 'angry', 0],             ['down', 'sad', 0]] },
    { t: 18.8, heads: [['you', 'shock', 0],            ['you', 'shock', 0],           ['you', 'shock', 0]] },             // they notice the player
    { t: 20.8, heads: [[['L', 'R'], 'doubt', 0.5],     ['C', 'keen', 0, 'nod'],       ['C', 'keen', 0, 'nod']] },         // the middle one checks with the others
    { t: 22.6, heads: [['you', 'laugh', 0],            ['C', 'laugh', 0],             ['C', 'laugh', 0]] },               // and they all laugh
  ],
};

const NAMES = { C: 0, R: 1, L: 2 };
const FACE = ['jaw', 'lid', 'slant', 'smile', 'size', 'flare', 'brow', 'curve'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
// how each head roars (as it does before its blows, plant-boss-moves.js): how far it rears up and reaches at who it
// roars at (metres), how hard and fast it shakes, how its face is tipped, its eyes and mouth
const ROARS = [
  { up: 0.75, at: 0.15, shake: 0.03, hz: 34, nod: -0.34, slant: 0.9, curve: -1 },        // middle: drawn up tall, slow and deep
  { up: 0.15, at: 0.95, shake: 0.075, hz: 57, nod: -0.08, slant: 1, curve: -1 },         // right: lunging, shaking with rage
  { up: 0.7, at: -0.3, shake: 0.045, hz: 44, nod: -0.5, slant: 0.5, curve: 0.9 },        // left: its head thrown back, for show
];
// syllables: a beat about four to the second, with short rests between words (0..1)
const speech = (t, n) => (Math.sin(t * 1.9 + n * 5.0) + Math.sin(t * 3.1 + n * 9.0) > -0.75 ? 1 : 0) * Math.pow(Math.abs(Math.sin(t * 13.5 + n * 7.0)), 0.7);
// a soft heavy thing going to where it is sent: it overshoots a little and settles (w: how quick, z: how damped)
function spring(s, to, dt, w, z) { s.v += (w * w * (to - s.x) - 2 * z * w * s.v) * dt; s.x += s.v * dt; return s.x; }

export function createBossTalk(boss, { direct = null } = {}) {
  const { heads, pose, mesh, body } = boss.userData;
  const S = heads.map(() => ({ yaw: { x: 0, v: 0 }, nod: { x: 0, v: 0 }, tilt: { x: 0, v: 0 }, lx: { x: 0, v: 0 }, ly: { x: 0, v: 0 }, lz: { x: 0, v: 0 } }));
  const eyeIn = new THREE.Vector3(), at = new THREE.Vector3();
  const talk = { on: true, time: 0, length: TALK_SCENE.length, restart() { talk.time = 0; }, update };

  // where a head looks: a point in the boss's own space
  function aim(h, who, tb) {
    if (Array.isArray(who)) who = who[Math.floor(tb / 0.8) % who.length];                // from one to the other
    if (who in NAMES) return at.copy(heads[NAMES[who]].centre).add(new THREE.Vector3(0, 0, 2.6));     // (a little in front of that head: it does not turn its back on the player)
    if (who === 'you') return at.copy(eyeIn);
    const side = h.index === 1 ? 1 : -1;
    if (who === 'down') return at.copy(h.centre).add(new THREE.Vector3(side * 0.8, -1.9, 3));
    return at.copy(h.centre).add(new THREE.Vector3(side * 3.2, 0.6, 2.4));               // away: out past its own side
  }

  function update(dt, eye) {
    dt = Math.min(dt, 0.05);
    let cast, tb;
    if (direct) {                                                     // the scene from elsewhere: the time only goes on
      talk.time += dt;
      const d = direct(dt);
      cast = d.heads; tb = d.since;
    } else {                                                          // the scripted scene, round and round
      if (talk.on) talk.time = (talk.time + dt) % TALK_SCENE.length;
      const beats = TALK_SCENE.beats;
      let bi = 0;
      while (bi + 1 < beats.length && beats[bi + 1].t <= talk.time) bi++;
      cast = beats[bi].heads; tb = talk.time - beats[bi].t;
    }
    const t = talk.time;
    let roaring = 0;
    if (eye) mesh.worldToLocal(eyeIn.copy(eye)); else eyeIn.set(0, 1.6, 11);

    for (const h of heads) {
      const s = S[h.index], n = h.index * 1.7 + 0.3;
      let yaw = 0, nod = 0, tilt = 0, lx = 0, ly = 0, lz = 0, gx = 0, gy = 0, wave = BOSS_HEAD_REST.wave, quick = 1;
      const face = { ...BOSS_HEAD_REST };
      if (talk.on) {
        const [who, moodName, speaks = 0, move = null] = cast[h.index];
        const mood = MOODS[moodName] || MOODS.calm, c = mood.carry || {};
        for (const k of FACE) if (k in mood) face[k] = mood[k];
        // turned to who it looks at, tipped up or down to them, carried a little toward them
        const look = aimHead(h, aim(h, who, tb)), dx = look.dx, dz = look.dz;
        yaw = look.yaw; nod = look.nod; gx = look.gazeX; gy = look.gazeY;
        nod += c.nod || 0;
        tilt = (c.tilt || 0) * (h.index === 1 ? -1 : 1);
        lx = dx * (c.in || 0); lz = dz * (c.in || 0); ly = c.up || 0;
        wave = c.wave ?? 0.7;
        // talking: the lower lip beats in syllables, and the head with it
        if (speaks > 0) {
          const sy = speech(t, n) * speaks, loud = moodName === 'angry' ? 1 : 0.75;
          face.jaw = 0.1 + sy * (0.55 + 0.35 * loud);
          nod += -0.06 * sy * loud; ly += 0.05 * sy; lx += dx * 0.06 * sy; lz += dz * 0.06 * sy;
          quick = 2.4;
        }
        if (moodName === 'laugh') {                                   // thrown back, bouncing
          const b = Math.sin(t * 11.5 + n * 3.0);
          face.jaw = 0.72 + 0.28 * Math.abs(b); ly += 0.13 * b; nod += 0.05 * b; quick = 2.0;
        }
        if (moodName === 'shock') quick = 2.2;
        if (move === 'nod') nod += 0.11 * Math.max(0, Math.sin(t * 5.2 + n)) * (Math.sin(t * 0.9 + n * 2.0) > -0.2 ? 1 : 0);
        if (move === 'shake') yaw += 0.16 * Math.sin(t * 9.0 + n);
        if (move === 'yawn') {                                        // opens wide and slow, eyes shut, head back; then smacks shut
          const u = clamp(tb / 2.5, 0, 1), y = Math.pow(Math.sin(Math.PI * u), 1.5);
          face.jaw = 0.15 + 0.85 * y; face.lid = 0.42 - 0.34 * y; face.flare = -0.3 + 0.5 * y;
          nod -= 0.3 * y; ly += 0.3 * y;
        }
        if (move === 'roar') {                                        // a short pull back, then it rears and bellows, shaking
          const r = ROARS[h.index], pull = clamp(tb / 0.08, 0, 1) * (1 - clamp((tb - 0.08) / 0.1, 0, 1));
          const k = clamp((tb - 0.1) / 0.15, 0, 1) * (1 - clamp((tb - 1.55) / 0.4, 0, 1));
          lx += -dx * 0.35 * pull + (dx * r.at + Math.sin(t * r.hz) * r.shake) * k;
          lz += -dz * 0.35 * pull + (dz * r.at + Math.cos(t * r.hz * 0.9) * r.shake) * k;
          ly += -0.12 * pull + (r.up + Math.sin(t * r.hz * 1.13 + 1) * r.shake) * k;
          nod = lerp(nod, r.nod, k);
          for (const [key, v] of Object.entries({ jaw: 1, flare: 1, slant: r.slant, size: 1.15, curve: r.curve, smile: 0, lid: 1 })) face[key] = lerp(face[key], v, k);
          quick = Math.max(quick, 1 + 1.6 * k); roaring = Math.max(roaring, k);
        }
      }
      // nothing snaps: springs for where it is carried and turned, a quick easing for its face
      h.yaw = spring(s.yaw, yaw, dt, 7.5 * Math.sqrt(quick), 0.62);
      h.nod = spring(s.nod, clamp(nod, -0.5, 0.26), dt, 9 * Math.sqrt(quick), 0.6);
      h.gazeX += (gx - h.gazeX) * Math.min(1, dt * 14); h.gazeY += (gy - h.gazeY) * Math.min(1, dt * 14);      // (the eyes are quick: they get there before the head)
      h.tilt = spring(s.tilt, tilt, dt, 6, 0.6);
      h.lean.set(spring(s.lx, lx, dt, 5.5 * Math.sqrt(quick), 0.5), spring(s.ly, ly, dt, 6.5 * Math.sqrt(quick), 0.5), spring(s.lz, lz, dt, 5.5 * Math.sqrt(quick), 0.5));
      h.wave += (wave - h.wave) * Math.min(1, dt * 2.5);
      for (const k of FACE) h[k] += (face[k] - h[k]) * Math.min(1, dt * (k === 'jaw' ? 26 : 9) * (k === 'jaw' ? 1 : quick));
    }
    if (body) body.shake.set(Math.sin(t * 61) * 0.02 * roaring, 0, Math.sin(t * 47) * 0.02 * roaring);      // (a roar shakes the bush)
    pose();
  }
  return talk;
}
