/* ==========================================================================
   blink-sounds.js  —  the blink heard (blink.js, blink-fx.js): the sound of the clip it was made after, cut to the move
   ("เอาเสียงในวีดีโอมาใช้กับ effect Blink ได้ทำให้เข้ากัน", 24 Nov 2026). One job: play its two pieces so that each one's
   moment is heard as the thing it belongs to is seen. A trial, with the blink: blink.html.

   The pieces (assets/audio/blink-*.mp3, cut from the clip by tools/make-blink-sounds.py: what is in each, and why it is
   cut where it is, is told there). The clip does the same thing twice, each time with sounds of its own, so there are
   two sets, to be chosen by ear (SETS; on the page, the 🔊 button):
     out   as she goes: set 1 the clip's burst (a low thump as the dome bursts round her, a rush of sparkle over it);
           set 2 its second (a low whoosh with a glitter over it, as the ribbons wind up round her)
     in    as she is there again: set 1 the clip's landing (a whump with sparkle in it, as she comes down on the second
           circle); set 2 the end of its second run (a whoosh, then a high glitter dying away)
   Each is begun so that its moment comes when it is due, less what the phone takes to play it (as spear-rain-sounds.js
   does); told too late for that, it begins at once, from so far into itself.

     const heard = createBlinkSounds({ context: () => sounds.context })      the AudioContext her steps woke
                                     (step-sounds.js; none before the first touch: until then nothing is heard)
     heard.blink(gone, there, pace)  she blinks: `gone` s from now she is gone, `there` s from now she is there again
                                     (blink.js: BLINK.vanish, and that and the travel); pace: how fast the page runs
                                     (1; slowed to a half: 0.5, and all of it comes later)
     heard.set = 1 | 2               which of the clip's two sets
     heard.stop()                    what is heard dies away at once
     heard.volume = 1                heard.stats (for a test, or the console)

   The files are fetched at once and decoded when there is an AudioContext. They go through a gain and a limiter of
   their own (the two of a blink sound together).
   ========================================================================== */

// set: { piece: its file; top: s into it that its moment lies (tools/make-blink-sounds.py prints them); gain: of its level }
export const SETS = {
  1: { out: { file: 'blink-out-1.mp3', top: 0.020, gain: 1.0 }, in: { file: 'blink-in-1.mp3', top: 0.120, gain: 1.0 } },
  2: { out: { file: 'blink-out-2.mp3', top: 0.060, gain: 1.0 }, in: { file: 'blink-in-2.mp3', top: 0.100, gain: 1.0 } },
};
const AT = new URL('./assets/audio/', import.meta.url).href;
const MASTER = 1.0;           // the whole of it, at volume 1
const STOP = 0.1;             // s what is heard takes to die away when it is stopped
const RATE = [0.97, 1.03];    // each blink a little higher or lower than the last, so that a run of them is not one sound over and over

export function createBlinkSounds({ context = null, volume = 1, set = 1 } = {}) {
  let ctx = null, out = null, vol = volume, failed = null, which = SETS[set] ? set : 1, turn = 0;
  const raw = {}, bufs = {}, voices = new Set();
  const stats = { blinks: 0, played: 0, late: 0, last: [] };
  const key = (n, name) => n + name;
  // the files: fetched at once (no touch is needed for that)
  for (const [n, pieces] of Object.entries(SETS)) {
    for (const [name, p] of Object.entries(pieces)) {
      fetch(AT + p.file).then(r => { if (!r.ok) throw new Error(p.file + ': HTTP ' + r.status); return r.arrayBuffer(); })
        .then(b => { raw[key(n, name)] = b; if (ctx) decode(key(n, name)); })
        .catch(err => { failed = failed || err; console.warn('[blink sounds]', err); });
    }
  }
  const all = Object.values(SETS).reduce((s, p) => s + Object.keys(p).length, 0);
  function decode(k) {
    const b = raw[k];
    if (!b || bufs[k] || !ctx) return;
    delete raw[k];
    ctx.decodeAudioData(b, buf => { bufs[k] = buf; }, err => { failed = failed || err; console.warn('[blink sounds] not decoded:', k, err); });
  }
  // the AudioContext, once there is one: a gain and a limiter of its own
  function ready() {
    if (!ctx) {
      ctx = context ? context() : null;
      if (!ctx) return false;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.1;
      out = ctx.createGain(); out.gain.value = MASTER * vol;
      out.connect(limiter).connect(ctx.destination);
      for (const k of Object.keys(raw)) decode(k);
    }
    return ctx.state === 'running';
  }
  // read the files as soon as the sound is awake (a finger come up, a key), not as the first blink wants them: reading
  // takes a quarter of a second, and the first one would begin so much late
  const WAKES = ['pointerup', 'touchend', 'click', 'keydown'];
  const warm = () => setTimeout(() => { ready(); if (ctx) for (const e of WAKES) removeEventListener(e, warm, true); }, 0);
  for (const e of WAKES) addEventListener(e, warm, true);
  const lag = () => Math.min(0.15, ctx.outputLatency || ctx.baseLatency || 0);
  // a piece of the set, its moment `due` s from now
  function play(name, due, rate) {
    const p = SETS[which][name], buf = bufs[key(which, name)];
    if (!buf) return null;
    const now = ctx.currentTime;
    let start = now + due - p.top / rate - lag(), skip = 0, soft = 0;
    if (start < now) { skip = (now - start) * rate; start = now; soft = 0.02; if (skip > 0.06) stats.late++; }      // (told too late: from so far into itself)
    if (skip >= buf.duration - 0.05) return null;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate;
    g.gain.value = p.gain;
    if (soft > 0) { g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(p.gain, start + soft); }      // (no click where it is cut into)
    src.connect(g).connect(out);
    src.start(start, skip);
    const voice = { src, g, name };
    voices.add(voice);
    src.onended = () => { voices.delete(voice); try { g.disconnect(); } catch (err) { /* (gone already) */ } };
    stats.played++;
    stats.last.push({ set: which, name, due: +due.toFixed(3), begins: +(start - now).toFixed(3), skip: +skip.toFixed(3) });
    if (stats.last.length > 6) stats.last.shift();
    return voice;
  }

  return {
    get volume() { return vol; },
    set volume(v) { vol = Math.min(2, Math.max(0, +v || 0)); if (out) out.gain.value = MASTER * vol; },
    get set() { return which; },
    set set(n) { if (SETS[n]) which = +n; },
    get stats() { return { ...stats, set: which, state: ctx ? ctx.state : 'asleep', ready: Object.keys(bufs).length, of: all, failed: failed ? String(failed) : null, sounding: voices.size }; },
    blink(gone = 0.06, there = 0.18, pace = 1) {
      stats.blinks++;
      if (!ready() || !bufs[key(which, 'out')]) return;      // (asleep still, or not read yet: this one goes unheard)
      const k = 1 / Math.max(0.05, pace), rate = RATE[turn++ % RATE.length];
      play('out', gone * k, rate);
      play('in', there * k, rate);
    },
    stop() {
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const v of voices) {
        try { v.g.gain.cancelScheduledValues(now); v.g.gain.setValueAtTime(v.g.gain.value, now); v.g.gain.linearRampToValueAtTime(0, now + STOP); v.src.stop(now + STOP + 0.02); } catch (err) { /* (over already) */ }
      }
    },
  };
}
