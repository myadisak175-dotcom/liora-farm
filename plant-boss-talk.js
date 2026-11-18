/* ==========================================================================
   plant-boss-talk.js  —  the plant boss's three heads talking: a short scene with a script, played round and round.
   One job: act it. It builds nothing and draws nothing: it only sets the numbers plant-boss.js gives each head
   (boss.userData.heads) and its skirt (boss.userData.body), and calls boss.userData.pose().

     const talk = createBossTalk(boss, { direct, clip })   direct: who says what, when (below); without it, TALK_SCENE.
                                            clip: true: the heads talk as in the talking clip (CLIP_MANNERS: they turn
                                            right round to one another, lean far over, their necks in an S, the side
                                            ones standing apart); false (as the game has them for now): as before
     every frame: talk.update(dt, eye)      eye: where 'you' is (world, a Vector3): the eye that watches (the trial
                                            page), or her (the game)
     talk.on = false                        they stop and settle back to standing; true: the scene goes on
     talk.restart()                         from the top
     talk.time, talk.length                 where the scene is, and how long it is (seconds)
     talk.howl                              seconds into the howl (all three heads' move 'howl'), or -1: for howl-fx.js
   direct (dt) -> { heads }                 the scene from elsewhere (plant-boss-banter.js: the game): what each head does
                                            now, as one of TALK_SCENE's beats gives it ([who it looks at, mood, how much it
                                            talks, a move])

   The scene (TALK_SCENE: who looks at whom, in what mood, who is talking): the left head has news for the middle one,
   who doubts it, while the right one is bored and yawns; the right one butts in, the two quarrel, the left one looks
   from one to the other; then it laughs at them, they both turn on it; all three notice the player and freeze; the
   middle one checks with the others, and they all laugh.

   How a head acts
     - it looks at who it looks at with its eyes first (they slide over the hollow), and turns its head part of the way
       after them (not all the way: the heads are big and close, and it keeps its face to the player, as on a stage);
       it tips up or down to them, and its neck carries it a little toward them
     - its mood sets its face (MOODS: eyes, mouth, hood) and how it carries itself (leaning in, drawn back, drooping)
     - talking: a breath first (drawn back a little, its mouth shut), then its lower lip beats in syllables with short
       rests now and then, and its head beats on the words it stresses (out and back, softly); laughing, it is thrown
       back and bounces; a line said laughing is said first and laughed after; a yawn opens wide and slow, eyes shut
     - a roar (the move 'roar'): it rears and bellows at who it looks at, shaking, each head in its own way (the middle
       one drawn up tall, the right one lunging, the left one with its head thrown back); the bush shakes, and the
       other heads shrink from it
     - the howl (the move 'howl', all three at once, as in the end of the talking clip): they snap round to who they look
       at, crouch and gather themselves, shaking, mouths shut tight; the middle one rears up at the sky (the green light
       goes up out of its crown: howl-fx.js); they draw back, then all three lunge at her and bellow, mouths wide open,
       shaking, the whole skirt standing up trembling. HOWL holds its times

   Each head in its own manner (MANNERS), whatever it says:
     - the middle one, the leader: heavy and slow. It turns to a new speaker late and stops dead on its mark, more
       with its eyes than its head; holds itself high, its lids low; speaks slowly and hardly nods; laughs in slow
       heaves; a roar beside it hardly moves it
     - the right one, hot-headed: quick and jerky. It turns at once and goes past its mark; thrust forward, its hood
       up; cannot keep still (little turns of the head, its hood bristling in starts), rolls its eyes when it has to
       listen; speaks fast, jabbing its head at who it talks to; laughs hard
     - the left one, the trickster: loose and slinky. It sways, its head on one side, a smirk; its neck trails far
       behind its head; it speaks in a sing-song, weaving from side to side; steals sly looks at the others; giggles
       fast, wobbling; shrinks right away from a roar

   What makes it soft
     - nothing snaps: a turn or a reach is a spring (each head's as quick and as damped as its manner), worked in
       small steps so it is the same on a slow phone; a face changes quickly but not at once, eyes first, then the
       mouth, the hood last (it bristles past its mark and settles, and the eyes start wide the same way)
     - nothing starts together: the head that speaks moves at once, the others turn to it a little after, each in
       its own time; its eyes shut as they go over to someone new
     - the neck comes after the head: the middle of the neck trails where its end has gone and swings through, as an
       octopus's arm does; and the head tips against the way it is carried
     - what beats (a breath, a laugh's bounce, a sway, a shake) is laid over the springs, and comes and goes softly
   The skirt answers: the leaves under a head are raised when it is angry or startled (they start up), drooped when it
   is bored or sad, rise with each word it stresses, bounce when it laughs, and stand up trembling when it roars; a
   roar then goes round the whole ring.
   ========================================================================== */
import * as THREE from 'three';
import { BOSS_HEAD_REST, aimHead } from './plant-boss.js';

// the faces. Each is the numbers of plant-boss.js's heads; what is not named is as at rest. carry: how the head holds
// itself in that mood: in (metres its neck reaches toward who it looks at; less than 0: drawn back), up (metres),
// nod / tilt (radians), wave (how wide its neck still waves). leaf: how the skirt's leaves under it are held (radians:
// raised; less than 0: drooped), stir: how they tremble 0..1, start: how hard they start up as the mood takes it
export const MOODS = {
  calm:  { jaw: 0.4, carry: { in: 0.1, wave: 0.6 } },
  keen:  { jaw: 0.5, size: 1.14, flare: 0.3, curve: 0.6, leaf: 0.05, start: 0.5, carry: { in: 0.22, up: 0.1, wave: 0.6 } },
  doubt: { jaw: 0.3, lid: 0.7, slant: 0.2, brow: 0.26, curve: -0.6, leaf: -0.02, carry: { tilt: 0.24, wave: 0.5 } },
  bored: { jaw: 0.15, lid: 0.42, slant: -0.12, flare: -0.3, curve: -0.7, leaf: -0.08, start: 0, carry: { up: -0.38, nod: 0.06, wave: 1.0 } },
  angry: { jaw: 0.5, lid: 0.9, slant: 0.9, flare: 1.0, curve: -1.0, leaf: 0.11, stir: 0.2, start: 0.8, carry: { in: 0.3, up: 0.12, nod: 0.1, wave: 0.45 } },
  shock: { jaw: 1.0, size: 1.42, flare: 0.85, curve: -0.3, leaf: 0.15, stir: 0.12, start: 1.6, carry: { in: -0.3, up: 0.3, nod: -0.14, wave: 0.2 } },
  sad:   { jaw: 0.25, lid: 0.8, slant: -0.8, flare: -0.2, curve: -1.0, leaf: -0.1, start: 0, carry: { in: -0.1, up: -0.35, wave: 0.5 } },
  laugh: { jaw: 0.9, smile: 1, size: 1.05, flare: 0.45, curve: 1.0, leaf: 0.05, stir: 0.18, start: 0.6, carry: { up: 0.15, nod: -0.24, wave: 0.5 } },
};

// each head's manners: how it moves whatever it says (middle, right, left).
//   late    seconds before it turns to someone new (the one who speaks never waits)
//   quick, damp   its springs: how quick (1: as the scene was first made), how damped (1: it stops dead; less: it goes past and settles)
//   share   how much of a look its head makes (the eyes make up the rest)
//   trail, loose  how far the middle of its neck trails its head, and how quick that comes after (less: later)
//   wave    how wide its neck waves, of its mood's
//   hold    how it carries itself always: up, in, side (out past its own side) (metres), nod, tilt (radians; tilt more
//           than 0: its top toward -x), and what its face adds
//   reach   metres it leans in toward who it speaks to (CLIP_MANNERS only: the head goes right over to the other)
//   s       how far the middle of its neck is pushed the other way to where its head is carried: an S (CLIP_MANNERS only)
//   breath  [metres, how fast]: it rises and falls
//   fidget  it cannot keep still        sway   it sways, weaving
//   glance  now and then, listening, its eyes go elsewhere for a moment: every [from, to] seconds, lasts; to: [sideways, up] (its eyes
//           rolled away), or 'other' (a sly look at the head it is not looking at)
//   tempo   how fast it speaks and nods
//   word    each word it stresses, its head beats: nod (down, radians), jab (at who it talks to, metres), side (weaving, one way then the other, metres)
//   song    it speaks in a sing-song: its head goes from side to side
//   laugh   hz (how fast it bounces), bounce (metres), back (how far thrown back, of its mood's), jaw [least, more], wobble (radians)
//   flinch  metres it shrinks from a head roaring beside it
//   leaf    its leaves of the skirt: [how quick, how damped]
export const MANNERS = [
  { late: 0.3, quick: 0.75, damp: 0.9, share: 0.5, trail: 0.4, loose: 2.8, wave: 0.8, blink: 0.24,
    hold: { up: 0.14, in: 0, nod: -0.04, tilt: 0, face: { lid: -0.1 } },
    breath: [0.06, 0.7], fidget: 0, sway: 0, glance: null, tempo: 0.76,
    word: { nod: 0.11, jab: 0.07, side: 0 }, song: 0,
    laugh: { hz: 6.2, bounce: 0.08, back: 0.6, jaw: [0.5, 0.25], wobble: 0 },
    flinch: 0.05, leaf: [6.5, 0.55] },
  { late: 0.04, quick: 1.3, damp: 0.5, share: 0.8, trail: 0.6, loose: 4.2, wave: 1.0, blink: 0.1,
    hold: { up: -0.05, in: 0.1, nod: 0.03, tilt: 0, face: { flare: 0.15, brow: 0.1, slant: 0.1 } },
    breath: [0.035, 1.5], fidget: 1, sway: 0, glance: { every: [2.4, 4.4], lasts: 0.42, to: [0.55, 0.9] }, tempo: 1.18,
    word: { nod: 0.14, jab: 0.22, side: 0 }, song: 0,
    laugh: { hz: 10, bounce: 0.15, back: 1.2, jaw: [0.7, 0.3], wobble: 0 },
    flinch: 0.12, leaf: [11, 0.38] },
  { late: 0.17, quick: 0.95, damp: 0.6, share: 0.7, trail: 0.95, loose: 3.2, wave: 1.25, blink: 0.14,
    hold: { up: 0.02, in: 0.03, nod: 0, tilt: -0.14, face: { curve: 0.25, lid: -0.06 } },
    breath: [0.05, 1.0], fidget: 0, sway: 1, glance: { every: [3.2, 5.8], lasts: 0.6, to: 'other' }, tempo: 1.0,
    word: { nod: 0.08, jab: 0.09, side: 0.14 }, song: 1,
    laugh: { hz: 15, bounce: 0.07, back: 0.8, jaw: [0.6, 0.3], wobble: 0.1 },
    flinch: 0.3, leaf: [8, 0.36] },
];

// the clip's manners (clip: true): as MANNERS, but each head turns further to who it looks at, leans right over to who
// it speaks to (reach), its neck in an S (s), the side heads stand apart and taller (hold.side, hold.up), nods harder
const CLIP = [
  { share: 0.72, reach: 0.35, s: 0.45, hold: { up: 0.32, side: 0 }, word: { nod: 0.15, jab: 0.1 } },
  { share: 0.92, reach: 0.62, s: 0.6, hold: { up: 0.24, side: 0.55 }, word: { nod: 0.19, jab: 0.3 } },
  { share: 0.85, reach: 0.75, s: 0.7, hold: { up: 0.24, side: 0.55 }, word: { nod: 0.11, jab: 0.12, side: 0.18 } },
];
export const CLIP_MANNERS = MANNERS.map((m, i) => ({ ...m, ...CLIP[i], hold: { ...m.hold, ...CLIP[i].hold }, word: { ...m.word, ...CLIP[i].word } }));

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
const REST = BOSS_HEAD_REST;
const FACE = ['jaw', 'lid', 'slant', 'smile', 'size', 'flare', 'brow', 'curve'];
const LIMITS = { jaw: [0, 1], lid: [0, 1], slant: [-1, 1], smile: [0, 1], size: [0.4, 1.6], flare: [-1, 1.25], brow: [-1, 1], curve: [-1, 1] };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const pulse = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t));            // up from a to b, held, down from c to d
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);                               // how much of the way to go this frame (the same however long the frame)
const between = ([a, b]) => a + Math.random() * (b - a);
// how each head roars (as it does before its blows, plant-boss-moves.js): how far it rears up and reaches at who it
// roars at (metres), how hard and fast it shakes, how its face is tipped, its eyes and mouth
const ROARS = [
  { up: 0.75, at: 0.15, shake: 0.022, hz: 21, nod: -0.34, slant: 0.9, curve: -1 },       // middle: drawn up tall, slow and deep
  { up: 0.15, at: 0.95, shake: 0.045, hz: 33, nod: -0.08, slant: 1, curve: -1 },         // right: lunging, shaking with rage
  { up: 0.7, at: -0.3, shake: 0.032, hz: 26, nod: -0.5, slant: 0.5, curve: 0.9 },        // left: its head thrown back, for show
];
const roarAt = t => pulse(t, 0.1, 0.26, 1.55, 1.95);                               // how much of its roar a head is in, seconds after it began
// the howl's beats (seconds from its start): they gather themselves; the middle one rears up (the green light goes up at
// beam); the green wind goes round (swirl); they draw back (pull) and bellow (roar .. roarEnd); it is over (length)
export const HOWL = { length: 4.9, gather: 0.35, beam: 1.45, swirl: 1.9, pull: 2.1, roar: 2.4, roarEnd: 4.3 };
const HOWL_AT = [0.45, 0.85, 0.7];                                                 // metres each head lunges at her as it bellows
// a soft heavy thing going to where it is sent: it goes past a little and settles (w: how quick, z: how damped). In
// steps of no more than a 120th of a second, so it moves the same at any frame rate
function spring(s, to, dt, w, z) {
  const n = Math.max(1, Math.ceil(dt / 0.0084)), h = dt / n;
  for (let i = 0; i < n; i++) { s.v += (w * w * (to - s.x) - 2 * z * w * s.v) * h; s.x += s.v * h; }
  return s.x;
}

export function createBossTalk(boss, { direct = null, clip = false } = {}) {
  const MAN = clip ? CLIP_MANNERS : MANNERS;
  const { heads, pose, mesh, body } = boss.userData;
  const sp = (x = 0) => ({ x, v: 0 });
  // what each head carries from frame to frame
  const S = heads.map(() => ({
    yaw: sp(), nod: sp(), tilt: sp(), lx: sp(), ly: sp(), lz: sp(),              // where it is turned and carried
    tx: sp(), ty: sp(), tz: sp(),                                                // where the middle of its neck has got to, coming after
    size: sp(REST.size), flare: sp(), leaf: sp(), face: { ...REST },
    look: null, key: '', nextKey: '', wait: 0, lookT: 0,                         // who it looks at and in what mood: what it has taken up, and what it is about to
    act: '', actT: 0,                                                            // what it does (speaks, a move), and for how long
    syl: 0, on: 0, up: false, beat: 1, beatK: 0, beatSide: 1, laughs: 0, stir: 0,
    kTalk: sp(), kLaugh: sp(), kNod: sp(), kShake: sp(), kAlive: sp(),                 // how much of each thing that beats is on (they come and go softly)
    blink: 0, glanceIn: 1.5 + Math.random() * 3, glance: 0,
  }));
  const eyeIn = new THREE.Vector3(), at = new THREE.Vector3(), at2 = new THREE.Vector3();
  const talk = { on: true, time: 0, length: TALK_SCENE.length, howl: -1, restart() { talk.time = 0; }, update };
  let life = 0, ringK = 0;                                                       // a clock that never turns back (for what beats); how far round the ring a roar has got

  // where a head looks: a point in the boss's own space
  function aim(h, who, since, m) {
    if (Array.isArray(who)) who = who[Math.floor(since * m.tempo / 0.8) % who.length];   // from one to the other
    if (who in NAMES) return clip ? at.copy(heads[NAMES[who]].centre).add(heads[NAMES[who]].lean).add(at2.set(0, 0, 0.8))      // (a little in front of that head, where it is now: it does not quite turn its back on the player)
                                  : at.copy(heads[NAMES[who]].centre).add(at2.set(0, 0, 2.6));                                  // (well in front of it: it keeps its face to the player, as on a stage)
    if (who === 'you') return at.copy(eyeIn);
    const side = h.index === 1 ? 1 : -1;
    if (who === 'down') return at.copy(h.centre).add(at2.set(side * 0.8, -1.9, 3));
    return at.copy(h.centre).add(at2.set(side * 3.2, 0.6, 2.4));                 // away: out past its own side
  }

  function update(dt, eye) {
    dt = Math.min(dt, 0.05);
    let cast;
    if (direct) { talk.time += dt; cast = direct(dt).heads; }         // the scene from elsewhere: the time only goes on
    else {                                                            // the scripted scene, round and round
      if (talk.on) talk.time = (talk.time + dt) % TALK_SCENE.length;
      const beats = TALK_SCENE.beats;
      let bi = 0;
      while (bi + 1 < beats.length && beats[bi + 1].t <= talk.time) bi++;
      cast = beats[bi].heads;
    }
    life += dt;
    if (eye) mesh.worldToLocal(eyeIn.copy(eye)); else eyeIn.set(0, 1.6, 11);

    // what each head takes up. What it does (speaking, a move) at once. Who it looks at and in what mood: at once if
    // it is the one that speaks or is startled, otherwise a little late, each in its own time: they never all turn together
    let roarK = 0, roarer = -1, howlK = 0;
    talk.howl = -1;
    for (const h of heads) {
      const s = S[h.index], m = MAN[h.index], want = cast[h.index];
      const act = talk.on ? (want[2] > 0 ? 'say' : '') + (want[3] || '') : '';
      if (act !== s.act) { s.act = act; s.actT = 0; s.on = 0; if (act) s.leaf.v += 0.35; } else s.actT += dt;
      const key = String(want[0]) + '|' + want[1];
      if (key === s.key) s.nextKey = '';
      else {
        if (key !== s.nextKey) { s.nextKey = key; s.wait = !s.look || act || want[1] === 'shock' ? 0 : m.late * (0.75 + 0.5 * Math.random()); }
        if ((s.wait -= dt) <= 0) {
          if (s.look && String(want[0]) !== String(s.look[0])) s.blink = m.blink;                // (its eyes shut as they go over)
          if (s.look && want[1] !== s.look[1] && talk.on) s.leaf.v += (MOODS[want[1]] || {}).start ?? 0.25;      // (its leaves start as the mood takes it)
          s.look = [want[0], want[1]]; s.key = key; s.nextKey = ''; s.lookT = 0;
        }
      }
      s.lookT += dt;
      if (act.endsWith('roar')) { const k = roarAt(s.actT); if (k > roarK) { roarK = k; roarer = h.index; } }
      if (act.endsWith('howl')) { talk.howl = Math.max(talk.howl, s.actT); howlK = Math.max(howlK, pulse(s.actT, HOWL.roar - 0.05, HOWL.roar + 0.1, HOWL.roarEnd - 0.2, HOWL.roarEnd + 0.3)); }
    }

    for (const h of heads) {
      const i = h.index, s = S[i], m = MAN[i], n = i * 1.7 + 0.3, want = cast[i];
      // where it is sent (springs take it there) ...
      let yaw = 0, nod = 0, tilt = 0, lx = 0, ly = 0, lz = 0, gx = 0, gy = 0, wave = REST.wave, quick = 1, leaf = 0, stir = 0;
      // ... and what beats over that (laid on after the springs)
      let bx = 0, by = 0, bz = 0, bYaw = 0, bNod = 0, bTilt = 0, sx = 0, sy = 0, sz = 0;
      let talks = 0, laughing = 0, nods = 0, shakes = 0;
      const face = { ...REST };
      if (talk.on) {
        const speaks = want[2] || 0, move = want[3] || null, [who, moodName] = s.look;
        const mood = MOODS[moodName] || MOODS.calm, c = mood.carry || {}, hold = m.hold;
        for (const k of FACE) if (k in mood) face[k] = mood[k];
        for (const k in hold.face) face[k] += hold.face[k];
        // turned to who it looks at, tipped up or down to them, carried a little toward them; held as its manner has it
        const atHead = clip && !Array.isArray(who) && who in NAMES;
        const look = aimHead(h, aim(h, who, s.lookT, m), m.share, atHead ? 0.95 : 0.55), dx = look.dx, dz = look.dz;
        yaw = look.yaw; nod = look.nod + (c.nod || 0) + hold.nod; gx = look.gazeX; gy = look.gazeY;
        tilt = (c.tilt || 0) * (i === 1 ? -1 : 1) + hold.tilt;
        const reach = (c.in || 0) + hold.in + (atHead ? 0.15 : 0);              // (listening to another head, it leans in a little)
        const out = (hold.side || 0) * (i === 1 ? 1 : i === 2 ? -1 : 0);        // the side heads stand apart (the clip's manners)
        const fwd = atHead ? 0.4 : 1;                                           // (to another head: across, not out in front of it)
        lx = dx * reach + out; lz = dz * reach * fwd; ly = (c.up || 0) + hold.up;
        wave = (c.wave ?? 0.7) * m.wave;
        leaf = mood.leaf || 0; stir = mood.stir || 0;
        if (moodName === 'shock') quick = 2.2;

        // listening, its eyes go elsewhere for a moment: rolled away (the right one), or a sly look at the other head (the left one)
        if (m.glance && !speaks && !move && moodName !== 'shock') {
          if ((s.glanceIn -= dt) <= 0) { s.glanceIn = between(m.glance.every); s.glance = m.glance.lasts; }
        } else s.glance = 0;
        if (s.glance > 0) {
          const L = m.glance.lasts, g = pulse(L - s.glance, 0, 0.1, L - 0.14, L);
          s.glance -= dt;
          if (m.glance.to === 'other') {
            const j = who === 'C' ? 1 : 0, o = aimHead(h, at.copy(heads[j].centre).add(at2.set(0, 0, 2.6)), 0, 0);
            gx = lerp(gx, o.gazeX, g); gy = lerp(gy, o.gazeY, g); face.curve += 0.5 * g; face.lid -= 0.15 * g;
          } else { gx = lerp(gx, m.glance.to[0] * (i === 2 ? -1 : 1), g); gy = lerp(gy, m.glance.to[1], g); face.lid -= 0.2 * g; }
        }

        // talking: a breath first (drawn back and up, its mouth shut); then its lower lip beats in syllables, with short
        // rests now and then, and on the words it stresses its head beats: a nod, a jab at who it talks to, a weave to one side
        // (a line said laughing: said first, laughed after)
        const said = speaks > 0 && moodName === 'laugh' ? 1 - sstep(0.9, 1.5, s.actT) : 1;
        if (speaks > 0) {
          const loud = moodName === 'angry' ? 1 : 0.75, breath = pulse(s.actT, 0, 0.09, 0.12, 0.28), on = sstep(0.16, 0.3, s.actT);
          s.syl += dt * 13.5 * m.tempo;
          const syl = Math.pow(0.5 - 0.5 * Math.cos(2 * s.syl + n * 7), 0.6);
          const rest = sstep(-0.95, -0.45, Math.sin(s.syl * 0.141 + n * 5) + Math.sin(s.syl * 0.23 + n * 9)) * on;
          // a stressed word: its first, then one about every third syllable, not quite evenly, now and then one let go by
          const ph = s.syl * 0.7 + n * 5, up = Math.sin(ph) > 0;
          if ((on > 0.5 && s.on <= 0.5) || (up && !s.up && rest > 0.5 && Math.sin(ph * 0.37 + n) > -0.55)) {
            s.beat = 0; s.beatK = (0.65 + 0.35 * Math.sin(ph * 0.53 + n * 3)) * speaks * said * (0.6 + 0.4 * loud); s.beatSide = -s.beatSide;
          }
          s.on = on; s.up = up;
          face.jaw = 0.12 + syl * rest * speaks * (clip ? 0.47 + 0.2 * loud : 0.5 + 0.35 * loud);
          ly += 0.1 * breath + 0.03 * rest; lx -= dx * 0.12 * breath; lz -= dz * 0.12 * breath;
          const over = (m.reach || 0) * on * speaks * (atHead ? 1 : 0.45);        // over to who it speaks to (less, to the player)
          lx += dx * over; lz += dz * over * fwd; ly -= 0.12 * over;
          leaf += 0.03 * rest * speaks - 0.04 * breath;
          talks = speaks * said; quick = 1.6;
        }
        if (s.beat < 1) {                                             // the beat of a stressed word: out and back, softly (the springs round it off)
          s.beat = Math.min(1, s.beat + dt * m.tempo / 0.3);
          const w = m.word, b = Math.pow(Math.sin(Math.PI * s.beat), 2) * s.beatK, side = w.side * s.beatSide;
          nod += w.nod * b; lx += (dx * w.jab + dz * side) * b; lz += (dz * w.jab - dx * side) * b;
          leaf += 0.1 * b;                                            // (and its leaves rise with it)
        }
        // laughing: thrown back, bouncing, each head its own laugh
        if (moodName === 'laugh') {
          const lg = m.laugh, k = 1 - (speaks > 0 ? said : 0);
          nod += (c.nod || 0) * (lg.back - 1) * k;
          face.jaw = lerp(face.jaw, lg.jaw[0] + lg.jaw[1] * Math.abs(Math.sin(s.laughs + n * 3)), k);
          laughing = k; quick = Math.max(quick, 1.6);
        }
        if (move === 'nod') nods = 1;
        if (move === 'shake') shakes = 1;
        if (move === 'yawn') {                                        // opens wide and slow, eyes shut, head back; then smacks shut
          const y = Math.pow(Math.sin(Math.PI * clamp(s.actT / 2.5, 0, 1)), 1.5);
          face.jaw = 0.15 + 0.85 * y; face.lid = 0.42 - 0.34 * y; face.flare = -0.3 + 0.5 * y;
          nod -= 0.3 * y; ly += 0.3 * y; leaf += 0.08 * y;
        }
        if (move === 'roar') {                                        // a short pull back, then it rears and bellows, shaking
          const r = ROARS[i], pull = pulse(s.actT, 0, 0.08, 0.1, 0.2), k = roarAt(s.actT);
          lx += (-0.35 * pull + r.at * k) * dx; lz += (-0.35 * pull + r.at * k) * dz; ly += -0.12 * pull + r.up * k;
          sx = Math.sin(life * r.hz) * r.shake * k; sy = Math.sin(life * r.hz * 1.13 + 1) * r.shake * k; sz = Math.cos(life * r.hz * 0.9) * r.shake * k;
          nod = lerp(nod, r.nod, k);
          for (const [key, v] of Object.entries({ jaw: 1, flare: 1, slant: r.slant, size: 1.15, curve: r.curve, smile: 0, lid: 1 })) face[key] = lerp(face[key], v, k);
          quick = Math.max(quick, 1 + 1.6 * k);
          leaf += 0.2 * k - 0.08 * pull; stir = Math.max(stir, k);     // (its leaves stand up, trembling)
        } else if (move === 'howl') {                                  // the howl (see the top of the file)
          const t = s.actT, H2 = HOWL;
          const snap = pulse(t, 0, 0.12, 0.3, 0.55), gather = pulse(t, H2.gather, H2.gather + 0.4, H2.pull - 0.1, H2.roar);
          const rear = i === 0 ? pulse(t, H2.beam - 0.35, H2.beam, H2.swirl, H2.pull + 0.1) : 0;
          const pull = pulse(t, H2.pull, H2.pull + 0.15, H2.roar - 0.05, H2.roar + 0.05), k = pulse(t, H2.roar - 0.05, H2.roar + 0.12, H2.roarEnd - 0.15, H2.roarEnd + 0.35);
          const tremble = Math.max(gather * 0.6, k);
          // startled round to her
          for (const [key, v] of Object.entries({ size: 1.35, flare: 1, lid: 1, jaw: 0.5 })) face[key] = lerp(face[key], v, snap);
          // gathering: low, drawn in, its mouth shut tight, glaring; shaking with it
          lx -= dx * 0.3 * gather; lz -= dz * 0.3 * gather; ly -= 0.4 * gather * (1 - rear);
          for (const [key, v] of Object.entries({ jaw: 0.06, lid: 0.72, slant: 1, flare: 0.9, curve: -1, size: 0.95, smile: 0 })) face[key] = lerp(face[key], v, gather);
          // the middle one rears up at the sky as the light goes up out of it
          ly += 1.15 * rear; nod = lerp(nod, -0.5, rear);
          for (const [key, v] of Object.entries({ jaw: 0.75, lid: 1, size: 1.2 })) face[key] = lerp(face[key], v, rear);
          // drawn back, then it lunges at her and bellows, mouth wide
          lx += dx * (-0.45 * pull + HOWL_AT[i] * k); lz += dz * (-0.45 * pull + HOWL_AT[i] * k); ly += 0.1 * pull + 0.15 * k;
          nod = lerp(nod, -0.12, k);
          for (const [key, v] of Object.entries({ jaw: 1, lid: 1, slant: 1, flare: 1.1, curve: -1, size: 1.2, smile: 0 })) face[key] = lerp(face[key], v, k);
          const hz = 27 + i * 5, sh = 0.03 * tremble + 0.03 * k;
          sx = Math.sin(life * hz) * sh; sy = Math.sin(life * hz * 1.13 + 1) * sh; sz = Math.cos(life * hz * 0.9) * sh;
          quick = Math.max(quick, 1 + 2.2 * Math.max(snap, k, rear, pull));
          leaf += 0.12 * gather + 0.25 * k; stir = Math.max(stir, tremble);
        } else if (roarK > 0 && roarer >= 0) {                        // another head roars: it shrinks from it, squinting, each as far as its manner
          const o = heads[roarer].centre, ax = h.centre.x - o.x, az = h.centre.z - o.z, far = Math.hypot(ax, az) || 1, f = m.flinch * roarK;
          lx += ax / far * f; lz += az / far * f; ly -= 0.35 * f;
          face.lid -= 1.4 * f; face.flare -= 2 * f;
          leaf += 0.07 * roarK; stir = Math.max(stir, 0.35 * roarK);
        }
      }
      // what beats, each coming and going softly: a breath; the right head's fidget; the left one's sway; talking in a
      // sing-song; a laugh's bounce; a nod, a shake of the head
      const a = clamp(spring(s.kAlive, talk.on ? (s.look && s.look[1] === 'shock' ? 0.2 : 1) : 0, dt, 5, 1), 0, 1);      // (startled, it freezes)
      const kTalk = clamp(spring(s.kTalk, talks, dt, 9, 1), 0, 1), kLaugh = clamp(spring(s.kLaugh, laughing, dt, 9, 1), 0, 1);
      const kNod = clamp(spring(s.kNod, nods, dt, 7, 1), 0, 1), kShake = clamp(spring(s.kShake, shakes, dt, 8, 1), 0, 1);
      const br = Math.sin(life * m.breath[1] + n * 2.1);
      by += m.breath[0] * br * a; face.flare += 0.05 * Math.sin(life * m.breath[1] + n * 2.1 - 0.9) * a;
      if (m.fidget) {
        bYaw += m.fidget * 0.07 * Math.sin(life * 6.3) * sstep(0.1, 0.8, Math.sin(life * 0.9 + n)) * a;
        face.flare += m.fidget * 0.25 * Math.pow(Math.max(0, Math.sin(life * 2.3 + n)), 6) * a;
      }
      if (m.sway) { bTilt += m.sway * 0.1 * Math.sin(life * 1.15 + n) * a; bx += m.sway * 0.13 * Math.sin(life * 0.8 + n) * a; bz += m.sway * 0.07 * Math.sin(life * 1.6 + n) * a; }
      if (m.song) { bTilt += m.song * 0.13 * Math.sin(s.syl * 0.21) * kTalk; bx += m.song * 0.09 * Math.sin(s.syl * 0.21 + 1.3) * kTalk; }
      if (kLaugh > 0.002) {
        const lg = m.laugh;
        s.laughs += dt * lg.hz;
        const b = Math.sin(s.laughs + n * 3), fits = 0.72 + 0.28 * Math.sin(s.laughs * 0.13 + n);      // (it comes in fits)
        by += lg.bounce * b * fits * kLaugh; bNod += 0.05 * b * kLaugh; bTilt += lg.wobble * Math.sin(s.laughs * 0.5 + n) * kLaugh;
        leaf += 0.07 * b * fits * kLaugh;
      }
      bNod += 0.12 * Math.pow(Math.max(0, Math.sin(life * 5.2 * m.tempo + n)), 2) * sstep(-0.3, 0.1, Math.sin(life * 0.9 + n * 2.0)) * kNod;
      bYaw += 0.16 * Math.sin(life * 9.0 * m.tempo + n) * kShake;

      // the heads lean far over to one another now, as in the clip: never into one another, nor in front of one another
      // as the player sees them. Where it is sent is kept clear of where each other head is, side to side and up and down
      // (their pods' sizes apart), whatever their depth
      if (clip) for (const o of heads) {
        if (o === h) continue;
        const px = h.centre.x + lx - o.centre.x - o.lean.x, py = h.centre.y + ly - o.centre.y - o.lean.y;
        const d = Math.hypot(px, py) || 1e-3, need = (h.radius + o.radius) * 1.3;      // (their hoods stand out past their pods)
        if (d < need) { lx += px / d * (need - d); ly += py / d * (need - d) * 0.6; }
      }
      // nothing snaps: springs for where it is carried and turned, as quick and as damped as its manner; its head tips
      // against the way it is carried (its top comes after)
      const W = Math.sqrt(quick) * m.quick, Z = m.damp;
      const drag = clamp(s.lx.v * 0.045, -0.13, 0.13);
      h.yaw = spring(s.yaw, yaw, dt, 7.5 * W, Z + 0.1) + bYaw;
      h.nod = clamp(spring(s.nod, clamp(nod, -0.5, 0.26), dt, 9 * W, Z + 0.1) + bNod, -0.56, 0.3);
      h.tilt = spring(s.tilt, tilt + drag, dt, 6 * m.quick, Z + 0.08) + bTilt;
      h.lean.set(spring(s.lx, lx, dt, 5.5 * W, Z) + bx, spring(s.ly, ly, dt, 6.5 * W, Z) + by, spring(s.lz, lz, dt, 5.5 * W, Z) + bz);
      // the neck comes after the head: its middle trails where its end has gone, and swings through
      h.bow.set((spring(s.tx, h.lean.x, dt, m.loose, 0.45) - h.lean.x) * m.trail, (spring(s.ty, h.lean.y, dt, m.loose, 0.45) - h.lean.y) * m.trail * 0.4,
        (spring(s.tz, h.lean.z, dt, m.loose, 0.45) - h.lean.z) * m.trail);
      if (m.s) { h.bow.x -= h.lean.x * m.s; h.bow.z -= h.lean.z * m.s; }      // an S: the middle of its neck the other way to its head
      h.lean.x += sx; h.lean.y += sy; h.lean.z += sz;                 // (a roar's shake: the head only)
      h.gazeX += (gx - h.gazeX) * ease(dt, 16); h.gazeY += (gy - h.gazeY) * ease(dt, 16);      // (the eyes are quick: they get there before the head)
      h.wave += (wave - h.wave) * ease(dt, 2.5);
      // its face: the mouth at once, the eyes quickly, the mouth's corners after; the eyes' size and the hood go past and settle
      const f = s.face;
      for (const k of FACE) face[k] = clamp(face[k], LIMITS[k][0], LIMITS[k][1]);
      f.jaw += (face.jaw - f.jaw) * ease(dt, 24);
      for (const k of ['lid', 'slant', 'smile', 'brow']) f[k] += (face[k] - f[k]) * ease(dt, 11 * quick);
      f.curve += (face.curve - f.curve) * ease(dt, 8 * quick);
      f.size = spring(s.size, face.size, dt, 15, 0.5); f.flare = spring(s.flare, face.flare, dt, 10, 0.5);
      for (const k of FACE) h[k] = f[k];
      h.flare = clamp(h.flare, -1, 1.12);
      if (s.blink > 0) { s.blink -= dt; h.lid *= 1 - 0.9 * Math.sin(Math.PI * clamp(1 - s.blink / m.blink, 0, 1)); }      // (shut as its eyes go over to someone new)
      // the skirt's leaves under it: raised or drooped as its mood has them, with what it does; a spring, loose: they bounce
      const lf = body && body.leaves && body.leaves[i];
      if (lf) {
        lf.lift = clamp(spring(s.leaf, leaf + 0.1 * (s.ly.x - m.hold.up * (talk.on ? 1 : 0)), dt, m.leaf[0], m.leaf[1]), -0.25, 0.42);
        s.stir += (stir - s.stir) * ease(dt, 8); lf.stir = s.stir;
      }
    }
    // a roar shakes the bush, and goes round the ring: the whole skirt stands up after the roarer's own leaves, trembling
    roarK = Math.max(roarK, howlK);
    ringK += (roarK - ringK) * ease(dt, roarK > ringK ? 5 : 3);
    if (body) {
      body.shake.set(Math.sin(life * 38) * 0.022 * roarK, 0, Math.sin(life * 31) * 0.022 * roarK);
      if (body.ring) { body.ring.lift = 0.1 * ringK; body.ring.stir = 0.6 * ringK; }
    }
    pose();
  }
  return talk;
}
