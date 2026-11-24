/* ==========================================================================
   barrier-reflect-sounds.js  —  the barrier that throws a blow back, heard (barrier-reflect.js, barrier-reflect-fx.js):
   the sound of the clip it was made after, cut to its beats. One job: play each piece so that its moment is heard as the
   thing it belongs to is seen (as blink-sounds.js does).

   The pieces (assets/audio/reflect-*-1.mp3, cut from the clip by tools/make-barrier-reflect-sounds.py: what is in each,
   and why it is cut where it is, is told there):
     raise   the chime as the dome stands up (as the button is pressed)
     shot    the rush of a bolt coming (as one is thrown at her)
     hit     the crack of the blow on the dome (as it lands); taken in while it is charged: softer, higher
     charge  the crackle swelling as it turns deep blue (0.07 s after the blow)
     burst   the crack and rush as it bursts, glass ringing after (as it bursts)
     thud    a blow thrown back landing on whoever threw it: the hit, softer and higher

     const heard = createReflectBarrierSounds({ context: () => sounds.context })      the AudioContext her steps woke
     heard.raise(pace)  heard.strike(pace)  heard.absorb(pace)  heard.burst(pace)       (barrier-reflect.js calls these)
     heard.shot(gain, pace)  heard.thud(gain, pace)                                       (the page: its bolts)
     pace: how fast the page runs (1; slowed to a half: 0.5, and what comes after comes so much later)
     heard.on = true | false        heard.volume = 1        heard.stop()        heard.stats
   The files are fetched at once and decoded when there is an AudioContext; they go through a gain and a limiter of
   their own.
   ========================================================================== */

// name: { file; top: s into it that its moment lies (the tool prints them); gain }
export const PIECES = {
  raise: { file: 'reflect-raise-1.mp3', top: 0.0, gain: 1.0 },
  shot: { file: 'reflect-shot-1.mp3', top: 0.0, gain: 1.0 },
  hit: { file: 'reflect-hit-1.mp3', top: 0.0, gain: 1.0 },
  charge: { file: 'reflect-charge-1.mp3', top: 0.0, gain: 1.0 },
  burst: { file: 'reflect-burst-1.mp3', top: 0.009, gain: 1.0 },
};
export const BEATS = { charge: 0.07 };      // s after the blow the charge's swell begins
const AT = new URL('./assets/audio/', import.meta.url).href;
const MASTER = 1.0, STOP = 0.1;

export function createReflectBarrierSounds({ context = null, volume = 1 } = {}) {
  let ctx = null, out = null, vol = volume, failed = null, on = true;
  const raw = {}, bufs = {}, voices = new Set();
  const stats = { played: 0, late: 0, last: [] };
  for (const [name, p] of Object.entries(PIECES)) {
    fetch(AT + p.file + '?v=2').then(r => { if (!r.ok) throw new Error(p.file + ': HTTP ' + r.status); return r.arrayBuffer(); })
      .then(b => { raw[name] = b; if (ctx) decode(name); })
      .catch(err => { failed = failed || err; console.warn('[barrier sounds]', err); });
  }
  function decode(name) {
    const b = raw[name];
    if (!b || bufs[name] || !ctx) return;
    delete raw[name];
    ctx.decodeAudioData(b, buf => { bufs[name] = buf; }, err => { failed = failed || err; console.warn('[barrier sounds] not decoded:', name, err); });
  }
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
  const WAKES = ['pointerup', 'touchend', 'click', 'keydown'];
  const warm = () => setTimeout(() => { ready(); if (ctx) for (const e of WAKES) removeEventListener(e, warm, true); }, 0);
  for (const e of WAKES) addEventListener(e, warm, true);
  const lag = () => Math.min(0.15, ctx.outputLatency || ctx.baseLatency || 0);
  // a piece, its moment `due` s from now (told too late for that: from so far into itself). `now`: what it belongs to
  // has happened already (a blow is not known before it lands): from its start, at once
  function play(name, due = 0, { gain = 1, rate = 1, now: atOnce = false } = {}) {
    if (!on || !ready()) return null;
    const p = PIECES[name], buf = bufs[name];
    if (!buf) return null;
    const now = ctx.currentTime;
    let start = atOnce ? now : now + due - p.top / rate - lag(), skip = 0, soft = 0;
    if (start < now) { skip = (now - start) * rate; start = now; soft = 0.02; if (skip > 0.06) stats.late++; }
    if (skip >= buf.duration - 0.05) return null;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate;
    const level = p.gain * gain;
    g.gain.value = level;
    if (soft > 0) { g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(level, start + soft); }
    src.connect(g).connect(out);
    src.start(start, skip);
    const voice = { src, g, name };
    voices.add(voice);
    src.onended = () => { voices.delete(voice); try { g.disconnect(); } catch (err) { /* (gone already) */ } };
    stats.played++;
    stats.last.push({ name, due: +due.toFixed(3), begins: +(start - now).toFixed(3), skip: +skip.toFixed(3) });
    if (stats.last.length > 8) stats.last.shift();
    return voice;
  }
  const slow = pace => 1 / Math.max(0.05, pace || 1);
  function stop() {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of voices) {
      try { v.g.gain.cancelScheduledValues(now); v.g.gain.setValueAtTime(v.g.gain.value, now); v.g.gain.linearRampToValueAtTime(0, now + STOP); v.src.stop(now + STOP + 0.02); } catch (err) { /* (over already) */ }
    }
  }

  return {
    raise() { play('raise', 0, { now: true }); },
    strike(pace = 1) { play('hit', 0, { now: true }); play('charge', BEATS.charge * slow(pace)); },
    absorb() { play('hit', 0, { gain: 0.6, rate: 1.12, now: true }); },
    burst() { play('burst', 0, { now: true }); },
    shot(gain = 1) { play('shot', 0, { gain: Math.min(1, gain), rate: 0.96 + 0.08 * Math.random(), now: true }); },
    thud(gain = 1) { play('hit', 0, { gain: 0.55 * Math.min(1, gain), rate: 1.18, now: true }); },
    stop,
    get on() { return on; }, set on(v) { on = !!v; if (!on) stop(); },
    get volume() { return vol; },
    set volume(v) { vol = Math.min(2, Math.max(0, +v || 0)); if (out) out.gain.value = MASTER * vol; },
    get stats() { return { ...stats, state: ctx ? ctx.state : 'asleep', ready: Object.keys(bufs).length, of: Object.keys(PIECES).length, failed: failed ? String(failed) : null, sounding: voices.size }; },
  };
}
