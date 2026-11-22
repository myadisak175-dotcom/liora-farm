/* ==========================================================================
   charge-hum.js  —  her held cast heard for as long as it is held: a low hum of the lance's circle turning, round and
   round until she lets go ("อันนี้เอามาปรับเป็นเสียงทุ้มต่ำเวลาชาตเวทค้างนานๆ อยากให้ได้ยินเสียงวนเวทหมุน loop เรื่อยๆ
   จนกว่าจะปล่อย", 23 Nov 2026, with a ringing to make it from). One job: that hum, from the circle opening to the lance
   let go or given up. In the game since 23 Nov 2026 (index.html makes it, player-spells.js
   says when; ?hum=0: without); first on spear-rain.html.

   The hum (assets/audio/charge-hum-1.mp3, made from the ringing by tools/make-charge-hum.py: what is done to it is
   told there): six seconds that go over into their own beginning, the circle heard to turn nine times in them. The
   file has a little of itself before its beginning and after its end, so any six seconds inside it are the whole of
   it, whatever a phone's MP3 reader adds or takes at a file's ends: it is played from HUM.pad / 2 in, and round.

   It comes in under the shimmer the circle opens with (step-sounds.js: gate), swelling as the lance grows (full grown
   1.4 s in: magic-combo.js' CHARGE.grows), and stays. Let go, it dies away under the lance's blast, gone as the lance
   leaves her hand; given up (a roll; the spear rain, which takes the lance from the cast), at once.

     const hum = createChargeHum({ context: () => sounds.context })      the AudioContext her steps woke (step-sounds.js;
                                     none before the first touch: a hold that is the page's first touch is not heard)
     hum.lance(what, hit)            as step-sounds.js' sounds.lance, from magic-combo.js' combo.onLance. 'open': she takes
                                     the lance; 'throw': it is let go, and leaves her hand `hit` s from now; 'drop': it is
                                     given up
     hum.pace = 1                    how fast the page runs (a page slowed to a half: 0.5: its swell and its end take
                                     twice as long; the hum itself is as it is)
     hum.volume = 1                  hum.on (it is heard, or is to be)      hum.stats (for a test, or the console)
   ========================================================================== */

// file; pad, long: s of itself before its beginning, s it is long (tools/make-charge-hum.py prints them); gain: of its
// level; wait: s after the circle opens that it comes in; swell: s it takes to; over: s it takes to die away as the
// lance is let go; drop: when it is given up; low: of its own pitch it is played at (1: as made; 0.94: a semitone lower)
export const HUM = { file: 'charge-hum-1.mp3', pad: 0.3, long: 6.0, gain: 1.0, wait: 0.15, swell: 1.25, over: 0.2, drop: 0.12, low: 1 };
const AT = new URL('./assets/audio/', import.meta.url).href;
const LOOK = 100;             // ms between looks for the sound to have woken, while a hold waits for it

export function createChargeHum({ context = null, volume = 1 } = {}) {
  let ctx = null, out = null, buf = null, raw = null, failed = null, vol = volume, pace = 1;
  let voice = null, wanted = false, since = 0, timer = 0;      // (voice: { src, g, from, full } while it is heard; wanted: a cast is held; since: when it was taken, performance.now())
  const stats = { opened: 0, begun: 0, late: 0, ended: 0 };
  // the file: fetched at once (no touch is needed for that)
  fetch(AT + HUM.file).then(r => { if (!r.ok) throw new Error(HUM.file + ': HTTP ' + r.status); return r.arrayBuffer(); })
    .then(b => { raw = b; if (ctx) decode(); })
    .catch(err => { failed = err; console.warn('[charge hum]', err); });
  function decode() {
    if (!raw || buf || !ctx) return;
    const b = raw; raw = null;
    ctx.decodeAudioData(b, d => { buf = d; }, err => { failed = err; console.warn('[charge hum] not decoded:', err); });
  }
  function ready() {
    if (!ctx) {
      ctx = context ? context() : null;
      if (!ctx) return false;
      out = ctx.createGain(); out.gain.value = vol;
      out.connect(ctx.destination);
      decode();
    }
    return ctx.state === 'running' && !!buf;
  }
  // read the files as soon as the sound is awake (a finger come up, a key), not as the first of them is wanted: reading
  // takes a quarter of a second, and the first one would begin so much late
  const warm = () => setTimeout(() => { ready(); if (ctx) for (const e of WAKES) removeEventListener(e, warm, true); }, 0);
  const WAKES = ['pointerup', 'touchend', 'click', 'keydown'];
  for (const e of WAKES) addEventListener(e, warm, true);
  // it begins: `late` s after the circle opened (0: it is told as it opens)
  function begin(late) {
    const now = ctx.currentTime, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.loop = true;
    src.loopStart = HUM.pad / 2; src.loopEnd = HUM.pad / 2 + HUM.long;
    src.playbackRate.value = HUM.low;
    // where its swell has come to by now, had it begun when the circle opened
    const from = Math.max(now, now + (HUM.wait - late) / pace), full = Math.max(from + 0.05, now + (HUM.wait + HUM.swell - late) / pace);
    g.gain.value = 0;
    g.gain.setValueAtTime(0, from);
    g.gain.linearRampToValueAtTime(HUM.gain, full);
    src.connect(g).connect(out);
    src.start(from, HUM.pad / 2);
    voice = { src, g, from, full };      // (from, full: the context's clock as its swell begins and is done)
    stats.begun++; if (late > 0.05) stats.late++;
  }
  // it dies away over `secs`, from `after` s from now (let go while it still swells: it goes on up until then, and
  // down from where it has come to)
  function end(secs, after = 0) {
    wanted = false; clearTimeout(timer); timer = 0;
    if (!voice) return;
    const { src, g, from, full } = voice, now = ctx.currentTime, at = now + Math.max(0, after);
    const level = t => HUM.gain * Math.min(1, Math.max(0, (t - from) / (full - from)));
    voice = null; stats.ended++;
    try {
      g.gain.cancelScheduledValues(0);
      g.gain.setValueAtTime(level(now), now);
      if (at > now) g.gain.linearRampToValueAtTime(level(at), at);
      g.gain.linearRampToValueAtTime(0, at + Math.max(0.02, secs));
      src.stop(at + Math.max(0.02, secs) + 0.03);
    } catch (err) { try { src.stop(); } catch (e) { /* (it had ended) */ } }
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) { /* */ } };
  }
  // a hold whose sound has not woken yet (the first touch still down, or the file not read yet): looked for until it
  // has, or the lance is let go
  function look() {
    timer = 0;
    if (!wanted || voice) return;
    if (ready()) begin((performance.now() - since) / 1000 * pace);
    else if (!failed) timer = setTimeout(look, LOOK);
  }

  return {
    lance(what, hit = 0) {
      if (what === 'open') {
        stats.opened++;
        if (voice) end(HUM.drop);
        wanted = true; since = performance.now();
        look();
      } else if (what === 'throw') {
        // gone as the lance leaves her hand
        const lag = ctx ? Math.min(0.15, ctx.outputLatency || ctx.baseLatency || 0) : 0;
        end(HUM.over / pace, hit / pace - HUM.over / pace - lag);
      } else end(HUM.drop);
    },
    get pace() { return pace; },
    set pace(v) { pace = Math.max(0.1, +v || 1); },
    get volume() { return vol; },
    set volume(v) { vol = Math.min(2, Math.max(0, +v || 0)); if (out) out.gain.setTargetAtTime(vol, ctx.currentTime, 0.03); },
    get on() { return wanted || !!voice; },
    get stats() { return { ...stats, heard: !!voice, ready: !!buf, failed: failed ? String(failed) : null }; },
  };
}
