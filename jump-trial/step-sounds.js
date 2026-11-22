// step-sounds.js
// Her steps heard (in the game; ?sound=0: without it, and this file is not loaded). The first sound the game has.
//
//   const sounds = createStepSounds({ level, volume });      // volume: 0..2 (1: as made)
//   createPlayer({ ..., sounds })                              // player-moves.js says when and where; this file says what is heard
//     sounds.step(x, z, y, { pace, depth, in })          a foot comes down (player-footsteps.js: in seconds from now; it says
//                                                        which foot too, side: not used, this set's takes are not a foot's own)
//     sounds.circle(x, z, y, { n })                      a magic circle opens under her: the n-th of her flight (1: on the ground)
//     sounds.leap(x, z, y, { n, depth })                 she is off: the n-th jump of her flight (1: her feet leave the ground)
//     sounds.land(x, z, y, { hit, depth, height })       both feet down out of the air (hit: 0..1, how hard; height: m she
//                                                        came down from, at her size)
//     sounds.caught(x, z, y, { height })                 a long fall: the circle opens on the ground under her
//     sounds.dash(x, z, y)                               a dash begins
//     sounds.splash(x, z, y, { size, height, deep })     the water splashes where she is (size: 0.8 jumping out of it, 1 to 1.4
//                                                        landing in it, 1.5 going in deep; height: m she came down from)
//     sounds.stroke(x, z, y, { pace })                   a swimming stroke (pace: 0..1 of her swimming speed; 0: treading water)
//     sounds.vault(x, z, y, part)                        her 'hand', then her 'foot', put on a low thing's top
//     sounds.cast(n, hit)                                the n-th of her combo's four casts begins; hit: s from now that it
//                                                        leaves her hand (player-spells.js): its sound is timed to it
//     sounds.lance(what, hit)                            her held cast (magic-combo.js' combo.onLance). 'open': she takes the
//                                                        lance and its circle opens; 'throw': it is let go (hit: s from now
//                                                        that it leaves her hand); 'drop': it is given up
//     sounds.rush(speed, flying)                         every frame: how fast she goes through the air (m/s, at 1.75 m),
//                                                        and whether she is in the air at all: the wind past her as she flies
//   sounds.volume = 0.6      sounds.stats (for a test, or the console)      sounds.context (the AudioContext, once there is one)
//
// WHAT IS HEARD. The sounds the user chose on 21 and 22 Nov 2026, all made with ElevenLabs ("ชุดเก่าไม่เอาแล้ว": the first set, from
// Kenney's and Fantozzi's packs, is not wanted any more). Cut into takes (the tool, below):
//   - a step in grass, at a walk, is one of four takes of a walk in soft grass blended into one set: a soft airy swish
//     of grass as her foot comes down (step). Asked for when the walk before it, a crisp brush of grass, and her steps
//     in all were found too solid and too strong ("เสียงเท้ามันแน่น มันแรงไป") and a walk in grass was wanted soft and
//     light, like grass in the wind ("อยากได้เสียงแบบหญ้านุ่ม เบาๆ เหมือนเสียงหญ้าปลิว"). At a run each step is one of the
//     run's own (run), four takes made with the walk's: only grass is kept of them, no heel's thump (the tool)
//   - what her foot is on is the level's to say (level.surfaceAt(x, z, y): the hill village; a map that cannot say is grass
//     all over). The walk and the run are of grass only: earth, sand, stone and boards have no sound of their own, so
//     there a step is a low footfall with no grass in it (tread: from the walk sent first), a little lower or higher and
//     softer or louder by the ground (GROUND, below)
//   - IN THE WATER ("เสียงน้ำค่ะ"): a step is a wade (louder and lower the deeper the water, to WADE_DEEP), at a run a
//     shorter splash (wetrun: a wade is 0.6 s, too long for a run's steps, "เสียงวิ่งในน้ำก็ยังไม่ค่อยดี"); where she lands
//     in it, jumps out of it or goes in deep, a splash (as big as the one that is seen: player-moves.js says where); and
//     swimming, a stroke as her arms sweep out, and treading water a soft one now and then. A stroke was no louder than
//     a run's step at first, and went unheard ("ใส่เสียงตอนว่ายน้ำด้วย"): now as loud as a splash, over the brook she is
//     in. Where she begins to swim from standing in it, a small splash. A landing in it is its splash, not the thud
//   - HER JUMPS in layers, so they are not flat ("ต้องเบลนไม่ให้เสียงแบน"): each layer a sound of its own, in a range of its
//     own (her weight low, cloth and grass in the middle, the magic high), and not all at once but one after another:
//       the button on the ground: the circle opens under her, a sparkle (glint; softer: her push is what is heard)
//       her feet leave the ground (the take-off's crouch is over): her push, a step harder and lower; and the air taking
//         her up (gust: under a second)
//       the next jump in the air: the circle opens under her (the sparkle), and as she kicks off it her dress swishes
//         (swish);
//         at the 4th, her flip, it flutters (flutter)
//       EVERY JUMP, off the ground and off each circle: a whoosh, softly, with the rest ("เอาอันนี้ใส่ตอนกระโดด เบาๆ ผสมของ
//         เก่า", 22 Nov 2026: the user's own find, floraphonic's "Movement Swipe Whoosh 3", a short mid whoosh with nothing
//         shrill in it). Under her dress's swish; a little lower off the ground, higher at each kick, fuller for the flip.
//         It is a file of its own beside the pack (ALONE: tools/make-step-sounds.py --alone)
//       AND THE WIND PAST HER as long as she is in the air ("มีเสียงลมตามด้วยยิ่งดี"; asked which: the wind all the while
//         she flies, not a short gust after each jump): the air about her's own wind loop (ambience/wind-1.mp3, so nothing
//         more to fetch), louder, brighter and a little higher the faster she goes (up, down or across: a long fall loudest),
//         low-passed so it is a rush and never the hiss that was found too loud ("เสียงซ่าๆ ในเกมมันดัง"); dying away as she
//         lands. Under her own slider (เสียงตัวละคร), and not let down under the music as the air about her is
//       every circle of a flight is the same take of the sparkle, a little higher each time (LADDER: from a little under the take
//         as it is to a little over it: a sparkle is no note, and far from where it was made it is another sound). The
//         next flight may be another take
//       landing: her weight (the thud, as loud as she came down hard), her other foot, and her dress settling (settle)
//       FROM HIGH ("อยากได้เสียงตอนลงน้ำแรงๆ กับลงจากสูง"): a fall of more than 2.6 m is caught by a circle on the ground
//         (magic-jump.js): as it opens under her, its sparkle, low; and her landing is weightier the farther she came down (thump, over HIGH_FROM to HIGH_FULL m,
//         taking over from the thud). Into deep water nothing catches her, and she is heard going in as a thing
//         thrown into water is ("เสียงแบบเราโยนของลงน้ำ เวลาคนตกน้ำอะ อยากได้เสียงแบบนั้น"): from higher than PLUNGE_FROM a
//         heavy one (plunge), from lower a stone's plop (plop: louder the farther she came down)
//   - HER COMBO'S FOUR CASTS ("เสียงนี้ ท่าคอมโบปกติ", then "คอมโบปกติอันที่สอง", 22 Nov 2026): the second sound the user
//     sent for it (a swing into a round low blow, its top 0.16 s in), one take for all four, a little different for each (CAST_RATE, CAST_GAIN: the turn's cut lower, the
//     finisher lower and louder), begun so that its blow comes as the cast leaves her hand (its attack, found as it is
//     decoded: where it first reaches half its loudest). Not the leap, the roll or the rising cast: those as they were
//     (silent). A file of its own beside the pack (ALONE: cast)
//   - HER HELD CAST, THE LANCE (22 Nov 2026): the sound of the clip its look was asked after, where the circle is there
//     and where the lance goes, not its end ("ตอนวงเวท กับตอนพุ่ง… ช่วงท้ายๆ ไม่เอา"). As she takes the lance and its circle
//     opens: the clip's first two seconds, a soft shimmer that swells twice (gate). As she lets it go: the clip's blast, a
//     deep boom that dies away over two seconds (throw), begun so that its blow comes as the lance leaves her hand; the
//     shimmer, if it is still going, dies away under it (LANCE_OVER s), and at once if she gives the lance up (a roll).
//     Held longer than two seconds, the shimmer has ended: she holds it in silence until it is let go. Files of their own
//     (ALONE: gate, throw), as loud against each other as the clip has them
//   - a dash: her dress swishes as she bursts away
//   - her vault: a footfall for her hand (light, higher) and one for her foot on the thing's top, and her dress swishing
//     over it after her hand
//     The circle's sound was a chime at first, made and never put in: not liked ("ไม่ชอบเสียงวิ้งของเวทอะ"). Wanted
//     instead: clear, light, short ("เสียงแบบใสๆ เบาๆ สั้นๆ"). A droplet's note with a sparkle over it came next; one of the
//     two was "like a bird", and it was the droplet ("เอาเสียงประกายกลับมา เอาเสียงหยดน้ำออก"): the sparkle alone, until
//     22 Nov 2026, when a breath of wind was wanted in its place ("อยากได้เอฟเฟกต์เสียงเหยียบเวทเป็นเสียงลมเบาใสๆ"), made
//     here for a while; then two sounds the user sent, one after the other, and then the one she liked best ("เสียงตอนเหยียบ
//     วงแหวนเวทเอาอันนี้ละดีสุด"): a powerful low burst, there at once, 1 s of it (circle: a file of its own, ALONE). Every
//     circle of a flight, the caught fall's too. The sparkle (glint) is still in the pack: with no circle file, it is heard
//     Then a second clip, of a girl jumping off magic circles, whose sound was wanted with its look (22 Nov 2026): its
//     own sound for every jump of a flight, cut to ours ("ใช้เสียงแบบในคลิปเลยดีกว่า เอามาตัดให้เข้ากัน"): see JUMP_OFF,
//     below. The circle's own sound is the caught fall's still, and a flight's where the clip's files are not there.
//     And with the clip's sound a jump is that alone ("เอาเฉพาะเสียงวงเวทย์อันใหม่ก็พอ เสียงที่เหลือไม่เอา"; asked what
//     goes: the whoosh, her dress as she kicks, the gust, her push off the ground: the layers above; her landing stays)
// No take twice running (but the sparkle, above), each a little louder or softer and a little higher or lower than the
// last, louder the faster she goes. A set with no takes is not heard, and nothing else changes.
//
// WHEN. A step is told a little before the foot is down, and how long it has (in). The sound is set to begin then, less
// what the phone takes to play it (the AudioContext's own outputLatency, where it says) and less the take's own attack
// (how far in it the sound is really there: a step in grass takes a moment to rise), so it is heard as the foot
// lands rather than after it, at a walk, a run, a sprint and a dash alike. Two steps closer together than MIN_GAP are one
// (her gait changing: both feet can come down in one frame). The rest is told as it happens and heard at once.
//
// THE SOUNDS are one file, assets/audio/steps.mp3, and where each take lies in it, assets/audio/steps.json: both written by
// tools/make-step-sounds.py from the recordings (made with ElevenLabs' Sound Effects v3), cut and levelled there.
// They are fetched once the game is up (not part of its loading). A browser plays no sound before the first touch:
// the AudioContext is made at the first touch or key, and the file decoded then. An MP3 comes back from a decoder a
// little late, by how much depends on the browser: the file begins with a click at a known moment, found here once (shift).
//
// THE SPACE ("มันแบนมาก": it is very flat, 22 Nov 2026). Every sound was played dry and in the middle: heard as laid on the
// screen, not in her world. So there is one room for all of it, an airy one made here (no file: an impulse of noise dying
// away over a second, darker as it dies, a little different in each ear), and each sound puts some of itself into it
// (SPACE: her magic and her casts the most, her steps a breath of it, nothing under ROOM_LOW so it is not muddy). Her steps
// are a little to the left and the right by turns (her left foot, her right), her casts to one side and the other as she
// swings, the whooshes and the circles a little either way at random. Her magic and her casts are louder than they were
// against her steps (CIRCLE, CAST), so they stand out. A browser with no stereo panner: in the middle, the rest as it is.
//
// Nothing here was heard as it was made: only measured. To tune by ear: the numbers below.

const FILES = new URL('../assets/audio/', import.meta.url);      // (the trial's copy, in jump-trial/: the game's own audio folder, one up)
// what each ground sounds like: how loud against the others, how much lower (under 1) or higher its footfalls are played,
// and whether it is grass (the walk's and the run's own steps; else the low footfall)
const GROUND = {
  grass: { gain: 1.0, grass: true },
  earth: { gain: 0.9, rate: 0.96 },
  sand:  { gain: 0.75, rate: 0.9 },              // (looser ground: lower and softer)
  stone: { gain: 0.9, rate: 1.1 },               // (harder: higher and shorter)
  wood:  { gain: 1.0, rate: 0.84 },              // (boards: lower)
  water: { gain: 1.0, water: true },            // (wading: louder and lower the deeper it is, WADE_DEEP)
};
const MASTER = 1.0;            // the whole of it, at volume 1 (over that, the limiter holds the loudest takes down)
const WALK_GAIN = 0.55;        // a walk's step against a run's (1)
const FEET = 0.6;              // her steps on land (in grass, on earth, stone, boards, sand) against the rest of what she makes:
                               // 40% down, to sit with the music ("ลด 40 เปอร์เซ็นต์ กำลังดี ให้บาลานเสียงเพลง"). Not in water
const FLIGHT = 0.6;            // ... and her jumps and landings, as much ("เสียงลงพื้น เสียงกระโดด ก็ลดให้เท่ากัน"): the circle's
                               // sparkle, her push, the air, her dress, the thud, the thump from high, her other foot, the settling, the
                               // circle that catches a long fall. (Not her dash, her vault, nor the water)
const SPRINT_GAIN = 1.2;       // a sprint's or a dash's
const RUN_FROM = 0.5;          // her pace (0: a walk's, 1: a run's) from which a step in grass is one of the run's
const VARY_GAIN = 0.16, VARY_RATE = 0.05;      // each step this much softer at most, this much higher or lower at most
const MIN_GAP = 0.085;         // s: steps closer together than this are one
const FRAME = 0.016;           // s: what she is told this frame is seen a frame later
const WET = 0.04;              // m: water deeper than this over the ground is water to her feet
// her jumps
const PUSH = 1.6, PUSH_RATE = 0.88;            // her push off the ground: a step, this loud, this much lower
const GUST = 0.7;                              // the air taking her up off the ground
const CIRCLE = 0.85, CIRCLE_GROUND = 0.55;     // a circle under her foot, the sound she chose for it: in the air; on the ground (her push is
                                               // what is heard there). 3 dB over the sparkle's 0.6, 0.4, so her magic stands out of her steps.
                                               // (Its take is low, levelled as the thump is: by ear 4 dB over the sparkle's, 9 dB under a cast)
const GLINT = 0.6, GLINT_GROUND = 0.4;         // a circle opening under her, its sparkle (only when there is no circle file): in the air (as loud as it was when it was heard
                                               // over the droplet, and asked back); on the ground (her push is what is heard)
// the magic jump after a second clip (22 Nov 2026: "มีเสียง effect กับ vfx วงเวทย์ตอนกระโดด น่าเอามาปรับใช้กับของเรา"; asked
// which of its sounds: where she leaves the ground and where she is thrown highest, the circles in the air between
// keeping their own, since the clip's there ring like a bell; then, the two heard beside the circle's own: the clip's
// for every jump, "ใช้เสียงแบบในคลิปเลยดีกว่า เอามาตัดให้เข้ากัน"). In place of the circle's own sound, then: off the ground,
// the clip's burst as the dome of water breaks (jump: its thud as the circle opens, the burst a tenth of a second
// after, as her feet leave the ground and the dome breaks); off the circles in the air, the clip's bursts there, one to
// each (air: the 2nd jump's take, the 3rd's; each there within a tenth of a second, as she kicks); the last circle of
// a flight (the LAST-th jump), the clip's biggest (launch). How loud each, against the circle's own in the air (CIRCLE):
// the four as loud against each other as the clip has them (launch the loudest; the first 2.6 dB under it, the two
// in the air 2.9 and 4 dB)
const JUMP_OFF = 0.93, AIR = [0.9, 0.8], LAUNCH = 1.0, LAST = 4;
const LADDER = [-2, -1, 0, 1, 2];              // semitones from the take as it is: the 1st, 2nd, 3rd, 4th (5th) circle of a flight
const KICK = { 2: 'swish', 3: 'swish', 4: 'flutter' };      // her dress as she kicks off the n-th circle (the flow's Step 2, her
                                               // turn; Step 3, her legs changing over; Step 4, her flip: magic-jump.js)
const CLOTH = { swish: 1.0, flutter: 1.0, settle: 0.8 };     // her dress: a kick or a dash; her flip; settling as she lands (louder since
                                               // "เสียงผ้าพริ้วๆ มันเบาไปอะ": they were 0.75, 0.8, 0.55, and the takes 4 to 6 dB lower)
const LAND = 0.9, OTHER_FOOT = 0.045, SETTLE_AFTER = 0.08;   // the thud; her other foot, her dress settling, this long after it (s)
const HIGH_FROM = 1.5, HIGH_FULL = 6;          // m she came down from: the thump begins to be heard; it is all there is of her weight
const THUMP = 1.0;                             // a landing from HIGH_FULL and higher
const CAUGHT = 0.5, CAUGHT_NOTE = -5;          // the circle that catches a long fall: its sparkle this loud, so many semitones under
const GUST_OVER = 0.2, GUST_DOWN = 0.3;        // s: the gust dies away over this as the next jump takes over, as she lands
const DASH_SWISH = 1.0;                        // her dress as a dash begins
// the water
const WADE_DEEP = 0.5;                         // m: a wade this deep and deeper is half as loud again and 12% lower
const SPLASH = 1.0;                            // a splash of size 1.5 (going in deep); smaller ones softer and higher
const PLUNGE = 1.0, PLUNGE_FROM = 2.6, PLUNGE_FULL = 8;      // into deep water from higher than so many m: a plunge, louder up to PLUNGE_FULL
const PLOP = 0.9;                              // ... from lower: a plop (at PLUNGE_FROM; from no height at all, half of it)
const STROKE = 2.0, TREAD = 0.3;               // a stroke at her full swimming speed; and of that, treading water (slower: in between)
const TOUCH = { hand: 1.1, foot: 1.9 };        // her vault: her hand and her foot on the thing's top (as loud as before the footfall was turned down 9 dB)
const VAULT_SWISH = 0.8, VAULT_SWISH_AFTER = 0.06;      // ... and her dress going over, this long after her hand (s)
// her jumps' whoosh, and the wind past her as she flies (above)
const ALONE = { whoosh: ['whoosh-1.mp3'], circle: ['circle-1.mp3'], cast: ['cast-1.mp3'], gate: ['gate-1.mp3'], throw: ['throw-1.mp3'], jump: ['jump-1.mp3'], air: ['air-1.mp3', 'air-2.mp3'], launch: ['launch-1.mp3'] };      // her sounds kept as files of their own, beside the pack (tools/make-step-sounds.py: ALONE)
const WHOOSH = 0.7;                            // every jump's whoosh: under her dress's swish (1.0) and her push ("เบาๆ")
const WHOOSH_RATE = { 1: 0.96, 2: 1.0, 3: 1.05, 4: 0.93 };      // off the ground a little lower; higher at each kick; the flip fuller
// her combo's casts (above): how loud (the take is levelled 2 dB over her dress's swish) and how high, the 1st .. 4th
const CAST = 1.0;                              // (it was 0.8: 2 dB up, to stand out of her steps)
const CAST_RATE = { 1: 1.0, 2: 1.07, 3: 0.94, 4: 0.86 }, CAST_GAIN = { 1: 1.0, 2: 0.95, 3: 1.05, 4: 1.3 };
// her held cast (above): its circle's shimmer and its blast, how loud (the takes are levelled as the clip has them: the
// blast some 4 dB over a cast by ear, the shimmer 3 dB under one); the shimmer dies away so fast under the blast, and
// when the lance is given up (s)
const LANCE_GATE = 1.0, LANCE_THROW = 1.0, LANCE_OVER = 0.18, LANCE_DROP = 0.12;
const RUSH_FILE = 'ambience/wind-1.mp3';       // the wind past her: the air about her's own wind (a 20 s loop)
const RUSH = 2.2;                              // how loud at full speed (with FLIGHT: some 3 dB under her dress's swish; at a magic
                                               // jump's pace, 7.5 m/s, 7 dB under it; at its slowest nothing)
const RUSH_FROM = 1.5, RUSH_FULL = 12;         // m/s (at 1.75 m): it begins to be heard; it is at its loudest (a long fall)
const RUSH_CURVE = 0.7;                        // its loudness against how far between the two she is (under 1: heard early)
const RUSH_FLOOR = 0.25;                       // ... and in the air never less than this of the way (at the top of a jump straight up
                                               // she is all but still, and it went silent there: asked for all the while she flies)
const RUSH_LOW = 350, RUSH_HIGH = 1750;        // Hz: its low-pass, slow .. fast (unfiltered, half of it was over 2 kHz: a hiss)
const RUSH_RATE = [0.9, 1.15];                 // played lower slow, higher fast
const RUSH_IN = 0.08, RUSH_OUT = 0.25;         // s: it rises, it dies away (time constants: the latter as she lands)
const RUSH_REST = 3;                           // s: silent this long, it is stopped (begun again, wherever in the loop, when she flies)
// the space (above)
const ROOM_LENGTH = 1.4, ROOM_DECAY = 1.1, ROOM_PRE = 0.018;      // s: the room's impulse; to die away 60 dB; before it begins
const ROOM_LOW = 250;                          // Hz: under this nothing goes into it (else muddy)
const ROOM = 1.0;                              // all of the room, against what goes into it
const SPACE = {                                // how much of each sound goes into the room (any other: SPACE_REST)
  circle: 0.45, glint: 0.45, cast: 0.35,       // her magic, her casts: the most
  jump: 0.4, air: 0.4, launch: 0.4,            // (the jump's bursts after the second clip: off the ground, in the air, its last)
  gate: 0.4, throw: 0.3,                       // (the lance's circle and its blast: the clip's own sound has a room in it already)
  whoosh: 0.15, swish: 0.1, flutter: 0.1, gust: 0.1, settle: 0.08, land: 0.08, thump: 0.08,
  splash: 0.12, plunge: 0.12, plop: 0.12, stroke: 0.1, wade: 0.08, wetrun: 0.08,
};
const SPACE_REST = 0.05;                       // her steps and the rest: a breath of it, so they are in the same place
const STEP_PAN = 0.12;                         // her steps: her left foot this much to the left, her right to the right (-1 .. 1)
const CAST_PAN = { 1: 0.2, 2: -0.2, 3: 0, 4: 0 };      // her casts: the swing to one side, the swing back to the other; the turn, the finisher in the middle
const WHOOSH_PAN = 0.2, CIRCLE_PAN = 0.1;      // at most, either way, at random

export function createStepSounds({ level, volume = 1 } = {}) {
  let ctx = null, out = null, room = null, foot = 1, buffer = null, bytes = null, meta = null, shift = 0, failed = null;
  let lastAt = -1, wind = null, note = -1, circles = 0, shimmer = null, blast = null, vol = Math.min(2, Math.max(0, volume));      // (shimmer: the lance's circle's sound, while it is heard; blast: its blast, and when its blow comes)
  const alone = {}, aloneBytes = {}, aloneAttack = {};      // her sounds of their own (ALONE): their buffers once decoded (and each one's attack: s
                                                            // to where it first reaches half its loudest), their bytes until then
  let rushBuf = null, rushBytes = null, rush = null;      // the wind past her: its buffer; what is playing of it
  const last = {}, stats = { steps: 0, circles: 0, catches: 0, leaps: 0, lands: 0, dashes: 0, vaults: 0, splashes: 0, strokes: 0, whooshes: 0, casts: 0, lances: 0, rush: 0, played: 0, dropped: 0, late: 0 };      // (late: steps told too late to begin their take its attack early)

  // ---- the file: fetched at once (no touch needed for that), decoded when there is an AudioContext to decode it
  const fresh = { cache: 'no-cache' };      // (the file and where its takes lie change together: never one from the browser's cache and one new)
  const fetched = Promise.all([
    fetch(new URL('steps.json', FILES), fresh).then(r => { if (!r.ok) throw new Error(`steps.json: ${r.status}`); return r.json(); }),
    fetch(new URL('steps.mp3', FILES), fresh).then(r => { if (!r.ok) throw new Error(`steps.mp3: ${r.status}`); return r.arrayBuffer(); }),
  ]).then(([m, b]) => { meta = m; bytes = b; }).catch(err => { failed = err; console.warn('[step sounds]', err); });
  // her sounds of their own, and the wind (fetched as the air about her fetches it: the same file, from the browser's cache
  // if it has it). Without them nothing else changes
  const more = Promise.all([
    ...Object.entries(ALONE).flatMap(([name, files]) => files.map(f => fetch(new URL(f, FILES), fresh).then(r => (r.ok ? r.arrayBuffer() : null))
      .then(b => { if (b) (aloneBytes[name] || (aloneBytes[name] = [])).push(b); }).catch(err => console.warn('[step sounds]', f, err)))),
    fetch(new URL(RUSH_FILE, FILES)).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => { rushBytes = b; }).catch(err => console.warn('[step sounds]', RUSH_FILE, err)),
  ]);

  async function decode() {
    await fetched;
    if (!bytes || buffer || !ctx) return;
    const data = bytes; bytes = null;
    try {
      buffer = await new Promise((yes, no) => { const p = ctx.decodeAudioData(data, yes, no); if (p && p.then) p.then(yes, no); });      // (an older Safari answers only by its callbacks)
      // the click: the loudest moment of the file's first quarter second says how late this decoder gave it back
      const pcm = buffer.getChannelData(0), n = Math.min(pcm.length, Math.round(0.25 * buffer.sampleRate));
      let at = 0, top = 0;
      for (let i = 0; i < n; i++) { const v = Math.abs(pcm[i]); if (v > top) { top = v; at = i; } }
      const late = at / buffer.sampleRate - meta.click;
      shift = top > 0.05 && late > -0.01 && late < 0.08 ? late : 0;
    } catch (err) { failed = err; console.warn('[step sounds] the file could not be decoded', err); }
    await more;
    for (const [name, list] of Object.entries(aloneBytes)) {
      delete aloneBytes[name];
      for (const b of list) try {
        const buf = await decodeData(b);
        (alone[name] || (alone[name] = [])).push(buf); (aloneAttack[name] || (aloneAttack[name] = [])).push(attackOf(buf));
      } catch (err) { console.warn('[step sounds]', name, err); }
    }
    if (rushBytes) { const b = rushBytes; rushBytes = null; try { rushBuf = await decodeData(b); } catch (err) { console.warn('[step sounds] the wind', err); } }
  }
  const decodeData = data => new Promise((yes, no) => { const p = ctx.decodeAudioData(data, yes, no); if (p && p.then) p.then(yes, no); });
  // where a sound first reaches half its loudest (5 ms at a time): its attack (s)
  function attackOf(buf) {
    const x = buf.getChannelData(0), n = Math.max(1, Math.round(0.005 * buf.sampleRate)), e = [];
    let top = 0;
    for (let i = 0; i + n <= x.length; i += n) { let sum = 0; for (let j = i; j < i + n; j++) sum += x[j] * x[j]; const v = Math.sqrt(sum / n); e.push(v); if (v > top) top = v; }
    return Math.max(0, e.findIndex(v => v >= top * 0.5)) * n / buf.sampleRate;
  }

  // the room's impulse: noise dying away ROOM_DECAY s to 60 dB under, its own in each ear (so it is wide), open at first and
  // darker as it dies (a one-pole low-pass closing from nearly open to some 2 kHz: the air takes the highs first)
  function roomImpulse(ac) {
    const sr = ac.sampleRate, n = Math.round(ROOM_LENGTH * sr), pre = Math.round(ROOM_PRE * sr);
    const buf = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const x = buf.getChannelData(c);
      let y = 0;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr, a = 0.25 + 0.72 * Math.exp(-t / 0.4);
        y += a * (Math.random() * 2 - 1 - y);
        x[i] = y * Math.pow(10, -3 * t / ROOM_DECAY) * Math.min(1, t / 0.01);
      }
    }
    return buf;
  }

  // ---- the first touch: only then may a page make sound
  function wake() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { failed = failed || new Error('no AudioContext'); return; }
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (err) { ctx = new AC(); }
      // everything goes through one gain (the volume) and a limiter, so a landing's sounds at once do not clip
      // (the limiter also lifts what is quiet by about 3 dB: a DynamicsCompressorNode makes up for what it takes off)
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.1;
      out = ctx.createGain(); out.gain.value = MASTER * vol;
      out.connect(limiter).connect(ctx.destination);
      // the room: one for all of it, into which each sound puts some of itself (SPACE)
      try {
        const into = ctx.createGain(), low = ctx.createBiquadFilter(), verb = ctx.createConvolver(), back = ctx.createGain();
        low.type = 'highpass'; low.frequency.value = ROOM_LOW; low.Q.value = 0.6;
        verb.buffer = roomImpulse(ctx); back.gain.value = ROOM;
        into.connect(low).connect(verb).connect(back).connect(out);
        room = into;
      } catch (err) { room = null; console.warn('[step sounds] no room', err); }
      decode();
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});      // (a browser that puts it to sleep again, a call, another app: woken at the next touch)
  }
  for (const e of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(e, wake, { capture: true, passive: true });
  // a page put away is not heard, and wakes again when it is back
  document.addEventListener('visibilitychange', () => { if (ctx) { if (document.hidden) ctx.suspend(); else ctx.resume().catch(() => {}); } });

  // ---- which take of a set: not the one played last (-1: the set has none)
  function pick(set) {
    const takes = meta.sets[set];
    if (!takes || !takes.length) return -1;
    let i = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && i === last[set]) i = (i + 1 + Math.floor(Math.random() * (takes.length - 1))) % takes.length;
    return (last[set] = i);
  }
  // ---- one take of a set, so that it is heard at `when` (the context's clock): begun its attack before that, if there is still time
  // (pan: -1 left .. 1 right)
  function play(set, when, gain, rate = 1, i = pick(set), pan = 0) {
    if (i < 0) { stats.dropped++; return null; }
    const [from, length, attack = 0] = meta.sets[set][i];
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.playbackRate.value = rate;
    const g = voice(src, gain, set, pan);
    const begin = when - attack / rate, now = ctx.currentTime;
    if (begin < now - 0.005 && when > now) stats.late++;
    src.start(Math.max(now, begin), from + shift, length);
    stats.played++;
    return { src, g };
  }
  // one of a sound of her own (ALONE): the whole file, now
  function pickAlone(name) {
    const takes = alone[name];
    if (!takes || !takes.length) return -1;
    let i = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && i === last[name]) i = (i + 1) % takes.length;
    return (last[name] = i);
  }
  function playAlone(name, gain, rate = 1, i = pickAlone(name), when = 0, pan = 0) {
    const takes = alone[name];
    if (!takes || !takes[i]) return null;
    const src = ctx.createBufferSource();
    src.buffer = takes[i]; src.playbackRate.value = rate;
    const g = voice(src, gain, name, pan);
    src.start(Math.max(ctx.currentTime, when));
    stats.played++;
    return { src, g };
  }
  // a sound's way out: so loud, a little to one side (pan), and some of it into the room (as much as SPACE says for its name)
  function voice(src, gain, name, pan) {
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    let side = null, send = null;
    if (pan && ctx.createStereoPanner) { side = ctx.createStereoPanner(); side.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(side).connect(out); }
    else g.connect(out);
    const space = name in SPACE ? SPACE[name] : SPACE_REST;
    if (room && space > 0) { send = ctx.createGain(); send.gain.value = space; g.connect(send).connect(room); }
    src.onended = () => { src.disconnect(); g.disconnect(); if (side) side.disconnect(); if (send) send.disconnect(); };
    return g;
  }
  const either = most => most * (Math.random() * 2 - 1);      // a little to one side or the other, at random
  // the gust that is in the air now dies away over so long
  function hush(secs) {
    if (!wind) return;
    const { src, g } = wind, now = ctx.currentTime;
    wind = null;
    try { g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + secs); src.stop(now + secs + 0.02); } catch (err) { /* (it had ended by itself) */ }
  }
  // a sound that is playing dies away over so long, from `from` (the context's clock) on
  function fade(voice, secs, from = 0) {
    if (!voice) return;
    const { src, g } = voice, at = Math.max(ctx.currentTime, from);
    try { g.gain.setValueAtTime(g.gain.value, at); g.gain.linearRampToValueAtTime(0, at + secs); src.stop(at + secs + 0.02); } catch (err) { /* (it had ended by itself) */ }
  }
  // the lance's circle's shimmer dies away
  function still(secs, from = 0) { fade(shimmer, secs, from); shimmer = null; }
  const ready = () => !!(ctx && buffer && ctx.state === 'running');
  const has = set => !!(meta.sets[set] && meta.sets[set].length);
  const groundAt = (x, z, y, depth) => { const g = GROUND[depth > WET ? 'water' : level && level.surfaceAt ? level.surfaceAt(x, z, y) : 'grass']; return g === undefined ? GROUND.grass : g; };      // (a ground not in the table: grass)
  const footfall = ground => ground.water ? 'wade' : ground.grass ? 'step' : 'tread';
  const vary = () => 1 - VARY_GAIN * Math.random();
  const about = rate => rate * (1 + VARY_RATE * (Math.random() * 2 - 1));
  const pitch = ground => about(ground.rate || 1);
  // how long the phone takes to play what it is given (s), where it says
  const lag = () => Math.min(0.15, ctx.outputLatency || ctx.baseLatency || 0);

  return {
    get stats() { return { ...stats, state: ctx ? ctx.state : 'asleep', ready: ready(), wind: !!rushBuf, whoosh: alone.whoosh ? alone.whoosh.length : 0, circle: alone.circle ? alone.circle.length : 0, room: !!room, shift, lag: ctx ? lag() : 0, failed: failed ? String(failed) : null }; },
    get volume() { return vol; },
    get context() { return ctx; },      // (the AudioContext, once the first touch has made it: the air about her plays on it too, ambience.js)
    set volume(v) { vol = Math.min(2, Math.max(0, +v || 0)); if (out) out.gain.value = MASTER * vol; },

    step(x, z, y, { pace = 0, depth = 0, in: ahead = 0 } = {}) {
      stats.steps++;
      if (!ready()) return;
      const when = ctx.currentTime + Math.max(0, ahead + FRAME - lag());
      if (when - lastAt < MIN_GAP) { stats.dropped++; return; }
      lastAt = when;
      const ground = groundAt(x, z, y, depth);
      if (!ground) return;
      const loud = pace <= 1 ? WALK_GAIN + (1 - WALK_GAIN) * Math.max(0, pace) : 1 + (SPRINT_GAIN - 1) * Math.min(1, (pace - 1) / 0.6);
      const deep = ground.water ? Math.min(1, depth / WADE_DEEP) : 0;
      const running = pace >= RUN_FROM;      // (a run's own takes, where there are any: else the walk's, louder)
      const set = ground.water ? (running && has('wetrun') ? 'wetrun' : 'wade') : !ground.grass ? 'tread' : running && has('run') ? 'run' : 'step';
      foot = -foot;      // (her left foot and her right by turns)
      play(set, when, ground.gain * loud * vary() * (1 + 0.5 * deep) * (ground.water ? 1 : FEET), pitch(ground) * (1 - 0.12 * deep), undefined, foot * STEP_PAN);
    },

    circle(x, z, y, { n = 1 } = {}) {
      stats.circles++;
      if (!ready()) return;
      // one take of her circle's sound (the sparkle, with none) for every circle of a flight, a little higher each time; a
      // new flight may have another take
      // (the second clip's, for every jump: off the ground its burst, in the air a take to each circle, the last circle of
      // a flight its biggest; without their files, as before)
      if (n <= 1 && playAlone('jump', JUMP_OFF * FLIGHT * vary(), about(1), undefined, 0, either(CIRCLE_PAN))) { note = -1; circles = n; return; }
      if (n >= LAST && playAlone('launch', LAUNCH * FLIGHT * vary(), about(1), undefined, 0, either(CIRCLE_PAN))) { circles = n; return; }
      const take = Math.min(n - 2, AIR.length - 1);
      if (playAlone('air', AIR[take] * FLIGHT * vary(), about(1), take, 0, either(CIRCLE_PAN))) { circles = n; return; }
      const own = !!(alone.circle && alone.circle.length);
      if (note < 0 || n <= circles) note = own ? pickAlone('circle') : pick('glint');
      circles = n;
      const up = LADDER[Math.min(LADDER.length - 1, Math.max(0, n - 1))];
      if (own) playAlone('circle', (n <= 1 ? CIRCLE_GROUND : CIRCLE) * FLIGHT * vary(), Math.pow(2, up / 12), note, 0, either(CIRCLE_PAN));
      else play('glint', ctx.currentTime, (n <= 1 ? GLINT_GROUND : GLINT) * FLIGHT, Math.pow(2, up / 12), note, either(CIRCLE_PAN));
    },

    leap(x, z, y, { n = 1, depth = 0 } = {}) {
      stats.leaps++;
      if (!ready()) return;
      const now = ctx.currentTime;
      hush(GUST_OVER);
      // with the second clip's sound for the jump (circle, above), that is all of a jump: none of its layers over it
      // ("เอาเฉพาะเสียงวงเวทย์อันใหม่ก็พอ เสียงที่เหลือไม่เอา"); without the clip's files, the layers as before
      if (alone.jump && alone.jump.length) { if (n <= 1) lastAt = now; return; }
      if (playAlone('whoosh', WHOOSH * FLIGHT * vary(), about(WHOOSH_RATE[n] || 1), undefined, 0, either(WHOOSH_PAN))) stats.whooshes++;      // (every jump: softly, with the rest)
      if (n <= 1) {
        // her feet leave the ground: her push off it (a step, harder and lower: none off the water), and the air taking her up
        const ground = groundAt(x, z, y, depth);
        if (ground) play(footfall(ground), now, PUSH * ground.gain * FLIGHT, pitch(ground) * PUSH_RATE);
        wind = play('gust', now, GUST * FLIGHT, about(1));
        lastAt = now;
      } else {
        // off a circle in the air: her dress, as she kicks
        const cloth = KICK[n] || 'swish';
        play(cloth, now, CLOTH[cloth] * FLIGHT * vary(), about(1));
      }
    },

    land(x, z, y, { hit = 0.3, depth = 0, height = 0 } = {}) {
      stats.lands++;
      if (!ready()) return;
      const now = ctx.currentTime, ground = groundAt(x, z, y, depth), hard = Math.min(1, Math.max(0, hit));
      hush(GUST_DOWN);
      note = -1; circles = 0;
      lastAt = now + OTHER_FOOT;
      if (!ground || ground.water) return;      // (in the water: its splash is heard, sounds.splash)
      // her weight, lower the harder she comes down (from high, the thump: weightier the farther she came down); her other
      // foot after it; her dress settling
      const high = has('thump') ? Math.min(1, Math.max(0, (height - HIGH_FROM) / (HIGH_FULL - HIGH_FROM))) : 0;
      play('land', now, LAND * FLIGHT * (0.45 + 0.55 * hard) * (1 - 0.7 * high), about(1.04 - 0.1 * hard));
      if (high > 0) play('thump', now, THUMP * FLIGHT * (0.35 + 0.65 * high) * vary(), about(1.02 - 0.06 * high));
      play(footfall(ground), now + OTHER_FOOT, ground.gain * FLIGHT * (0.45 + 0.4 * Math.max(hard, high)), pitch(ground) * 0.94);
      play('settle', now + SETTLE_AFTER, CLOTH.settle * FLIGHT * (0.6 + 0.4 * Math.max(hard, high)) * vary(), about(1));
    },

    splash(x, z, y, { size = 1, height = 0, deep = false } = {}) {
      stats.splashes++;
      if (!ready()) return;
      // into deep water: a plunge from high (nothing catches her there), a plop from low; into water she stands in, or
      // out of it, a splash, bigger the farther she came down
      if (deep && height > PLUNGE_FROM && has('plunge')) {
        const far = Math.min(1, (height - PLUNGE_FROM) / (PLUNGE_FULL - PLUNGE_FROM));
        play('plunge', ctx.currentTime, PLUNGE * (0.6 + 0.4 * far) * vary(), about(1.03 - 0.08 * far));
        return;
      }
      if (deep && has('plop')) {
        const far = Math.min(1, Math.max(0, height / PLUNGE_FROM));
        play('plop', ctx.currentTime, PLOP * (0.5 + 0.5 * far) * vary(), about(1.06 - 0.08 * far));
        return;
      }
      const big = Math.min(1, Math.max(0, size / 1.5 + 0.4 * Math.max(0, height - HIGH_FROM) / (HIGH_FULL - HIGH_FROM)));
      play('splash', ctx.currentTime, SPLASH * (0.35 + 0.65 * big) * vary(), about(1.15 - 0.15 * big));
    },

    caught(x, z, y, { height = 0 } = {}) {
      stats.catches++;
      if (!ready()) return;
      // the circle opens on the ground under her: its sound (or the sparkle), low (a take of its own: no flight's climb
      // goes on from here)
      if (!playAlone('circle', CAUGHT * (CIRCLE / GLINT) * FLIGHT, Math.pow(2, CAUGHT_NOTE / 12))) play('glint', ctx.currentTime, CAUGHT * FLIGHT, Math.pow(2, CAUGHT_NOTE / 12));
    },

    stroke(x, z, y, { pace = 1 } = {}) {
      stats.strokes++;
      if (!ready()) return;
      play('stroke', ctx.currentTime, STROKE * (TREAD + (1 - TREAD) * Math.min(1, Math.max(0, pace))) * vary(), about(pace > 0 ? 1 : 0.92));      // (treading water: a little lower too)
    },

    dash(x, z, y) {
      stats.dashes++;
      if (!ready()) return;
      play('swish', ctx.currentTime, DASH_SWISH * vary(), about(1.04));
    },

    // the n-th of her combo's casts begins: its sound, begun so that its blow (its attack) comes `hit` s from now, as the
    // cast leaves her hand (too soon for that: at once)
    cast(n = 1, hit = 0) {
      stats.casts++;
      if (!ready()) return;
      const i = pickAlone('cast');
      if (i < 0) return;
      const rate = about(CAST_RATE[n] || 1), attack = aloneAttack.cast[i] / rate;
      playAlone('cast', CAST * (CAST_GAIN[n] || 1) * vary(), rate, i, ctx.currentTime + hit - attack - lag(), CAST_PAN[n] || 0);
    },

    // her held cast, the lance. 'open': its circle opens before her: the shimmer. 'throw': it is let go: the blast, begun
    // so that its blow comes `hit` s from now, as the lance leaves her hand (too soon for that: at once), and the shimmer
    // dies away under it. 'drop': it is given up: the shimmer dies away (and the blast, if she rolled out of the throw in
    // the tenth of a second before the lance left her hand: nothing was thrown)
    lance(what, hit = 0) {
      if (what === 'open') stats.lances++;
      if (!ready()) return;
      if (what === 'open') {
        still(LANCE_DROP);
        shimmer = playAlone('gate', LANCE_GATE * vary(), 1);
      } else if (what === 'throw') {
        const i = pickAlone('throw'), now = ctx.currentTime;
        const when = i < 0 ? now : Math.max(now, now + hit - aloneAttack.throw[i] - lag());
        blast = i < 0 ? null : { voice: playAlone('throw', LANCE_THROW * vary(), 1, i, when), blow: now + hit };
        still(LANCE_OVER, when);
      } else {
        still(LANCE_DROP);
        if (blast && ctx.currentTime < blast.blow) fade(blast.voice, LANCE_DROP);
        blast = null;
      }
    },

    // every frame: the wind past her, as fast as she goes through the air (0: she is on the ground, it dies away)
    rush(speed = 0, flying = speed > 0) {
      if (!ready() || !rushBuf) return;
      const u = flying ? Math.min(1, Math.max(RUSH_FLOOR, (speed - RUSH_FROM) / (RUSH_FULL - RUSH_FROM))) : 0, now = ctx.currentTime;
      if (!rush) {
        if (u <= 0) return;
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = rushBuf; src.loop = true;
        f.type = 'lowpass'; f.Q.value = 0.5; f.frequency.value = RUSH_LOW;
        g.gain.value = 0;
        src.connect(f).connect(g).connect(out);
        src.start(now, Math.random() * rushBuf.duration);
        rush = { src, f, g, want: 0, u: -1, loudAt: now };
      }
      const want = u > 0 ? RUSH * FLIGHT * Math.pow(u, RUSH_CURVE) : 0;
      if (Math.abs(want - rush.want) > 0.005 || Math.abs(u - rush.u) > 0.01) {      // (not every frame: only as it changes)
        rush.g.gain.setTargetAtTime(want, now, want > rush.want ? RUSH_IN : RUSH_OUT);
        rush.f.frequency.setTargetAtTime(RUSH_LOW + (RUSH_HIGH - RUSH_LOW) * u, now, 0.1);
        rush.src.playbackRate.setTargetAtTime(RUSH_RATE[0] + (RUSH_RATE[1] - RUSH_RATE[0]) * u, now, 0.15);
        rush.want = want; rush.u = u;
      }
      stats.rush = +want.toFixed(3);
      if (u > 0) rush.loudAt = now;
      else if (now - rush.loudAt > RUSH_REST) {
        const { src, f, g } = rush; rush = null;
        try { src.stop(); } catch (err) { /* (already) */ }
        src.disconnect(); f.disconnect(); g.disconnect();
      }
    },

    vault(x, z, y, part) {
      stats.vaults++;
      if (!ready()) return;
      const now = ctx.currentTime;
      play('tread', now, TOUCH[part] || TOUCH.hand, about(part === 'foot' ? 1.05 : 1.25));
      if (part === 'hand') play('swish', now + VAULT_SWISH_AFTER, VAULT_SWISH * vary(), about(1));
    },
  };
}
