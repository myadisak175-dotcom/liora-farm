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
//       every circle of a flight is the same take of the sparkle, a little higher each time (LADDER: from a little under the take
//         as it is to a little over it: a sparkle is no note, and far from where it was made it is another sound). The
//         next flight may be another take
//       landing: her weight (the thud, as loud as she came down hard), her other foot, and her dress settling (settle)
//       FROM HIGH ("อยากได้เสียงตอนลงน้ำแรงๆ กับลงจากสูง"): a fall of more than 2.6 m is caught by a circle on the ground
//         (magic-jump.js): as it opens under her, its sparkle, low; and her landing is weightier the farther she came down (thump, over HIGH_FROM to HIGH_FULL m,
//         taking over from the thud). Into deep water nothing catches her, and she is heard going in as a thing
//         thrown into water is ("เสียงแบบเราโยนของลงน้ำ เวลาคนตกน้ำอะ อยากได้เสียงแบบนั้น"): from higher than PLUNGE_FROM a
//         heavy one (plunge), from lower a stone's plop (plop: louder the farther she came down)
//   - a dash: her dress swishes as she bursts away
//   - her vault: a footfall for her hand (light, higher) and one for her foot on the thing's top, and her dress swishing
//     over it after her hand
//     The circle's sound was a chime at first, made and never put in: not liked ("ไม่ชอบเสียงวิ้งของเวทอะ"). Wanted
//     instead: clear, light, short ("เสียงแบบใสๆ เบาๆ สั้นๆ"). A droplet's note with a sparkle over it came next; one of the
//     two was "like a bird", and it was the droplet ("เอาเสียงประกายกลับมา เอาเสียงหยดน้ำออก"): the sparkle alone now
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
// Nothing here was heard as it was made: only measured. To tune by ear: the numbers below.

const FILES = new URL('./assets/audio/', import.meta.url);
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
const GLINT = 0.6, GLINT_GROUND = 0.4;         // a circle opening under her, its sparkle: in the air (as loud as it was when it was heard
                                               // over the droplet, and asked back); on the ground (her push is what is heard)
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

export function createStepSounds({ level, volume = 1 } = {}) {
  let ctx = null, out = null, buffer = null, bytes = null, meta = null, shift = 0, failed = null;
  let lastAt = -1, wind = null, note = -1, circles = 0, vol = Math.min(2, Math.max(0, volume));
  const last = {}, stats = { steps: 0, circles: 0, catches: 0, leaps: 0, lands: 0, dashes: 0, vaults: 0, splashes: 0, strokes: 0, played: 0, dropped: 0, late: 0 };      // (late: steps told too late to begin their take its attack early)

  // ---- the file: fetched at once (no touch needed for that), decoded when there is an AudioContext to decode it
  const fresh = { cache: 'no-cache' };      // (the file and where its takes lie change together: never one from the browser's cache and one new)
  const fetched = Promise.all([
    fetch(new URL('steps.json', FILES), fresh).then(r => { if (!r.ok) throw new Error(`steps.json: ${r.status}`); return r.json(); }),
    fetch(new URL('steps.mp3', FILES), fresh).then(r => { if (!r.ok) throw new Error(`steps.mp3: ${r.status}`); return r.arrayBuffer(); }),
  ]).then(([m, b]) => { meta = m; bytes = b; }).catch(err => { failed = err; console.warn('[step sounds]', err); });

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
  function play(set, when, gain, rate = 1, i = pick(set)) {
    if (i < 0) { stats.dropped++; return null; }
    const [from, length, attack = 0] = meta.sets[set][i];
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffer; src.playbackRate.value = rate;
    g.gain.value = gain;
    src.connect(g).connect(out);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    const begin = when - attack / rate, now = ctx.currentTime;
    if (begin < now - 0.005 && when > now) stats.late++;
    src.start(Math.max(now, begin), from + shift, length);
    stats.played++;
    return { src, g };
  }
  // the gust that is in the air now dies away over so long
  function hush(secs) {
    if (!wind) return;
    const { src, g } = wind, now = ctx.currentTime;
    wind = null;
    try { g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + secs); src.stop(now + secs + 0.02); } catch (err) { /* (it had ended by itself) */ }
  }
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
    get stats() { return { ...stats, state: ctx ? ctx.state : 'asleep', ready: ready(), shift, lag: ctx ? lag() : 0, failed: failed ? String(failed) : null }; },
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
      play(set, when, ground.gain * loud * vary() * (1 + 0.5 * deep) * (ground.water ? 1 : FEET), pitch(ground) * (1 - 0.12 * deep));
    },

    circle(x, z, y, { n = 1 } = {}) {
      stats.circles++;
      if (!ready()) return;
      // one take of the sparkle for every circle of a flight, a little higher each time; a new flight may have another take
      if (note < 0 || n <= circles) note = pick('glint');
      circles = n;
      const up = LADDER[Math.min(LADDER.length - 1, Math.max(0, n - 1))];
      play('glint', ctx.currentTime, (n <= 1 ? GLINT_GROUND : GLINT) * FLIGHT, Math.pow(2, up / 12), note);
    },

    leap(x, z, y, { n = 1, depth = 0 } = {}) {
      stats.leaps++;
      if (!ready()) return;
      const now = ctx.currentTime;
      hush(GUST_OVER);
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
      // the circle opens on the ground under her: its sparkle, low (a take of its own: no flight's climb goes on from here)
      play('glint', ctx.currentTime, CAUGHT * FLIGHT, Math.pow(2, CAUGHT_NOTE / 12));
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

    vault(x, z, y, part) {
      stats.vaults++;
      if (!ready()) return;
      const now = ctx.currentTime;
      play('tread', now, TOUCH[part] || TOUCH.hand, about(part === 'foot' ? 1.05 : 1.25));
      if (part === 'hand') play('swish', now + VAULT_SWISH_AFTER, VAULT_SWISH * vary(), about(1));
    },
  };
}
