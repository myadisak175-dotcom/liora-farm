/* ==========================================================================
   spear-rain-sounds.js  —  the spear rain heard (spear-rain.js, spear-rain-fx.js): the sound of the clip it was made
   after, cut to the move ("ขอเสียงจากวีดีโอเอามาดัดแปลงใส่ให้เข้ากันได้ไหมคะ", 23 Nov 2026). One job: play its four
   pieces so that each one's moment is heard as the thing it belongs to is seen. A trial's for now (spear-rain.html).

   The pieces (assets/audio/rain-*.mp3, cut from the clip by tools/make-spear-rain-sounds.py: what is in each, and
   why it is cut where it is, is told there):
     twirl   the whoosh as she twirls the lance; its moment: the lance leaves her hand
     seal    the lance's rise into the deep roar of the seal opening, then its thin ringing; its moment: the seal opens
     fall    the hiss of the spears coming down and their landing, splashes one over another; its moment: the first
             spear lands
     great   the great spear: a rise, the blow, its end dying away; its moment: it lands
   Each is set to begin so that its moment comes when it is due, less what the phone takes to play it (as
   step-sounds.js does for a cast's blow); told too late for that, it begins at once, from so far into itself.
   A small rain is shorter than the piece is: `fall` dies away a little after the last spear has landed.

     const heard = createSpearRainSounds({ context: () => sounds.context })      the AudioContext her steps woke
                                     (step-sounds.js; none before the first touch: until then nothing is heard)
     heard.begin(lead)               she begins the move: the lance leaves her hand `lead` s from now
     heard.rain({ open, first, last, great }, pace)
                                     the lance has left her hand: s from now that the seal opens, the first spear
                                     lands, the last, the great spear (spear-rain-fx.js: rain.launch's `when`); pace:
                                     how fast the page runs (1; a page slowed to a half: 0.5, and all of it comes later)
     heard.stop()                    what is heard dies away at once (she rolled out of the twirl)
     heard.volume = 1                heard.stats (for a test, or the console)

   The files are fetched at once and decoded when there is an AudioContext. They go through a gain and a limiter of
   their own (three of them sound at once as the rain begins).
   ========================================================================== */

// name: its file; top: s into it that its moment lies (tools/make-spear-rain-sounds.py prints them); gain: of its level
export const PIECES = {
  twirl: { file: 'rain-twirl-1.mp3', top: 0.300, gain: 0.9 },
  seal:  { file: 'rain-seal-1.mp3',  top: 0.460, gain: 0.9 },
  fall:  { file: 'rain-fall-1.mp3',  top: 0.420, gain: 1.0 },
  great: { file: 'rain-great-1.mp3', top: 0.426, gain: 1.0 },
};
const AT = new URL('./assets/audio/', import.meta.url).href;
const MASTER = 1.0;           // the whole of it, at volume 1
const AFTER = 0.18;           // s after a small rain's last spear that `fall` begins to die away ...
const DYING = 0.45;           // ... and how long it takes
const STOP = 0.12;            // s what is heard takes to die away when it is stopped

export function createSpearRainSounds({ context = null, volume = 1 } = {}) {
  let ctx = null, out = null, vol = volume, failed = null;
  const raw = {}, bufs = {}, voices = new Set();
  const stats = { begun: 0, rains: 0, played: 0, late: 0, last: [] };
  // the files: fetched at once (no touch is needed for that)
  for (const [name, p] of Object.entries(PIECES)) {
    fetch(AT + p.file).then(r => { if (!r.ok) throw new Error(p.file + ': HTTP ' + r.status); return r.arrayBuffer(); })
      .then(b => { raw[name] = b; if (ctx) decode(name); })
      .catch(err => { failed = failed || err; console.warn('[spear rain sounds]', err); });
  }
  function decode(name) {
    const b = raw[name];
    if (!b || bufs[name] || !ctx) return;
    delete raw[name];
    ctx.decodeAudioData(b, buf => { bufs[name] = buf; }, err => { failed = failed || err; console.warn('[spear rain sounds] not decoded:', name, err); });
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
      for (const name of Object.keys(PIECES)) decode(name);
    }
    return ctx.state === 'running';
  }
  const lag = () => Math.min(0.15, ctx.outputLatency || ctx.baseLatency || 0);
  // do it once the sound is awake and the pieces are decoded, and say how late that is (s). A first touch still down
  // has not woken the sound yet (a browser wakes it as a finger comes up), so it is looked for a while longer; what is
  // left of each piece then comes in where it would have been
  function once(fn, tries) {
    const told = performance.now();
    const go = left => {
      if (ready() && Object.keys(bufs).length === Object.keys(PIECES).length) fn((performance.now() - told) / 1000);
      else if (left > 0 && !failed) setTimeout(go, 100, left - 1);
    };
    go(tries);
  }
  // a piece, its moment `due` s from now; until: it dies away from so long after now (s; none: it plays out)
  function play(name, due, until = null) {
    const p = PIECES[name], buf = bufs[name];
    if (!buf) return null;
    const now = ctx.currentTime;
    let start = now + due - p.top - lag(), skip = 0;
    if (start < now) { skip = now - start; start = now; if (skip > 0.2) stats.late++; }      // (told too late: from so far into itself)
    if (skip >= buf.duration - 0.05 || (until !== null && until < 0.05)) return null;      // (nothing of it left to hear)
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    g.gain.value = p.gain;
    if (skip > 0) { g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(p.gain, now + 0.03); }      // (no click where it is cut into)
    src.connect(g).connect(out);
    src.start(start, skip);
    if (until !== null && now + until < start - skip + buf.duration) {
      const t = Math.max(now + 0.03, now + until);
      g.gain.setValueAtTime(p.gain, t); g.gain.linearRampToValueAtTime(0, t + DYING);
      src.stop(t + DYING + 0.02);
    }
    const voice = { src, g, name };
    voices.add(voice);
    src.onended = () => { voices.delete(voice); try { g.disconnect(); } catch (err) { /* (gone already) */ } };
    stats.played++;
    stats.last.push({ name, due: +due.toFixed(3), begins: +(start - now).toFixed(3), skip: +skip.toFixed(3), until });
    if (stats.last.length > 8) stats.last.shift();
    return voice;
  }

  return {
    get volume() { return vol; },
    set volume(v) { vol = Math.min(2, Math.max(0, +v || 0)); if (out) out.gain.value = MASTER * vol; },
    get stats() { return { ...stats, state: ctx ? ctx.state : 'asleep', ready: Object.keys(bufs).length, failed: failed ? String(failed) : null, sounding: voices.size }; },
    begin(lead = 0.3) {
      stats.begun++;
      once(gone => play('twirl', lead - gone), 5);
    },
    rain({ open, first, last, great }, pace = 1) {
      stats.rains++;
      const k = 1 / Math.max(0.05, pace);
      once(gone => {
        play('seal', open * k - gone);
        play('fall', first * k - gone, last * k + AFTER - gone);
        play('great', great * k - gone);
      }, 35);
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
