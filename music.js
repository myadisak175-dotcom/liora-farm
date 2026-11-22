// music.js
// Music, now and then: a piece plays, fades out, and for some minutes after it there is only the air about her (wind,
// water, birds) until the next. Never all the while: heard all the while it would cover the air, and grow old.
// ("ทำเพลงด้วยดีไหม ดนตรีเบาๆ อะ": soft music. On step-sounds.html first, then in the game: "ขึ้นเมนเลยค่ะ เอาเพลงด้วยนะคะ".)
//
//   const music = createMusic({ context: () => sounds.context, volume });      // the AudioContext her steps woke
//   every frame: music.update(dt, { when, drowned });      // when: 'day', 'night' or 'curse' (the cursed land); drowned
//                                                          // 0..1: how much of what is heard a waterfall or rushing water takes up
//   air.under = music.under * (1 - drowned)      // every frame: the air about her let down while a piece plays (UNDER)
//   music.on = false        (off: what is playing fades away, and nothing more is played until it is on again)
//   music.volume = 0.8      music.stats (for a test, or the console)
//
// THE PIECES are listed in assets/audio/music.json (tools/make-music.py writes it, and each piece levelled): their file,
// their length, and when they fit ('day', 'night', 'curse', or 'any': any of the living world's hours). A piece is played
// when one fits; at dusk the next one is a night one; in the cursed land only a cursed one (there is none yet, so it is
// silent there). One playing is let finish, whatever the hour does meanwhile.
//
// A LITTLE OVER THE AIR (LEVEL): the air about her is the place, the music its mood. (Under the air at first, it was too
// quiet.) And while a piece plays the air is let down (UNDER, as the piece fades in and out: the page sets air.under), or
// its wind covers the music ("เสียงบรรยากาศดังไป กลบเพลงหมด"); between the pieces it is as loud as ever. By a waterfall or
// rushing water it is the music that goes down (DROWN), and the air not (the page: air.under times what is not drowned).
//
// A PIECE IS STREAMED, not decoded whole: three minutes of music decoded is some 80 MB, more than a phone should hold for
// it. It plays from an <audio> element through the AudioContext (its loudness is the context's to set). A phone may not
// let an <audio> element play but in answer to a touch: the first touch on the page plays it, silent, for a moment,
// which lets it play later.

const FILES = new URL('./assets/audio/', import.meta.url);
const LEVEL = 1.0;                 // the music's loudness, at volume 1 (the pieces are levelled to the air's loops, then this). 0.5 at first: too quiet ("เพลงเบาไป")
const DROWN = 0.6;                 // how much of it a waterfall at its loudest takes away
const FIRST = 20;                  // s after the first touch before the first piece
const GAP = [150, 300];            // s of only the air between one piece and the next (somewhere between)
const FADE_IN = 4, FADE_OUT = 6;   // s: a piece comes in, and goes, this gently (the pieces begin at once and some end abruptly)
const OFF_FADE = 1.5;              // s: switched off, it goes this fast
const EASE = 0.5;                  // s: its loudness follows what is asked (drowned, volume) with this time constant
const UNDER = 0.5;                 // how much the air about her is let down while a piece plays (0.5: 6 dB)

export function createMusic({ context, volume = 1, first = FIRST } = {}) {
  let ctx = null, meta = null, asked = false, failed = null, vol = Math.min(2, Math.max(0, volume)), on = true;
  let el = null, src = null, gain = null, fade = null, playing = null, wait = first, last = -1, played = 0, unlocked = false;
  let heard = 0;                   // 0..1: how much a piece is heard now (as it fades in and out), for under
  let then = -1;                   // the AudioContext's clock at the last update: the waits go by it, not by the frames
                                   // (a page whose frames come slowly would make them minutes longer)

  // the first touch: the <audio> element is let play later (and made now, so it is the one that was let)
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous';
    el.muted = true;
    el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';      // (no sound at all)
    const p = el.play(); if (p && p.then) p.then(() => { el.pause(); el.muted = false; }, () => { el.muted = false; });
  }
  for (const e of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(e, unlock, { capture: true, passive: true });

  function wire() {
    src = ctx.createMediaElementSource(el);
    fade = ctx.createGain(); fade.gain.value = 0;              // a piece's own fade in and out (and switching off)
    gain = ctx.createGain(); gain.gain.value = LEVEL * vol;    // how loud the music is (volume, a waterfall)
    src.connect(fade).connect(gain).connect(ctx.destination);
    el.addEventListener('ended', () => end());
    el.addEventListener('error', () => { failed = failed || new Error(`music: ${el.src.split('/').pop()} could not be played`); end(); });
  }

  // which piece next: one that fits the hour, not the one played last if there is another
  function pick(when) {
    const fit = meta.tracks.map((t, i) => [t, i]).filter(([t]) => t.when === when || (t.when === 'any' && when !== 'curse'));
    if (!fit.length) return -1;
    let k = Math.floor(Math.random() * fit.length);
    if (fit.length > 1 && fit[k][1] === last) k = (k + 1) % fit.length;
    return fit[k][1];
  }

  function start(i) {
    const t = meta.tracks[i], now = ctx.currentTime;
    last = i; played++;
    el.src = new URL(t.file, FILES).href;
    fade.gain.cancelScheduledValues(now); fade.gain.setValueAtTime(0, now); fade.gain.linearRampToValueAtTime(1, now + FADE_IN);
    playing = { i, stopAt: Infinity, fading: false };
    const p = el.play(); if (p && p.catch) p.catch(err => { failed = failed || err; end(); });
  }
  function end() {
    if (!playing) return;
    playing = null;
    try { el.pause(); } catch (err) { /* (already) */ }
    wait = GAP[0] + Math.random() * (GAP[1] - GAP[0]);
  }
  function fadeOut(secs) {
    const now = ctx.currentTime;
    fade.gain.cancelScheduledValues(now); fade.gain.setValueAtTime(fade.gain.value, now); fade.gain.linearRampToValueAtTime(0, now + secs);
    playing.fading = true; playing.stopAt = Math.min(playing.stopAt, now + secs + 0.1);
  }

  return {
    get stats() { return { state: ctx ? ctx.state : 'asleep', ready: !!meta, failed: failed ? String(failed) : null, on, heard: +heard.toFixed(2), playing: playing ? meta.tracks[playing.i].file : null, wait: +Math.max(0, wait).toFixed(1), played, unlocked }; },
    get volume() { return vol; },
    set volume(v) { vol = Math.min(2, Math.max(0, +v || 0)); },
    get on() { return on; },
    get under() { return UNDER * heard; },
    set on(v) {
      on = !!v;
      if (!on && playing && ctx) fadeOut(OFF_FADE);
      if (on && !playing) wait = Math.min(wait, 2);      // (on again: a piece soon)
    },
    // skip the wait: the next piece now (for a test, or to hear it)
    next() { if (!playing) wait = 0; },

    update(dt, { when = 'day', drowned = 0 } = {}) {
      if (!ctx) { ctx = context ? context() : null; if (!ctx) return; }
      if (ctx.state !== 'running' || !el) return;
      if (!meta) {
        if (!asked) {
          asked = true;
          fetch(new URL('music.json', FILES), { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`music.json: ${r.status}`); return r.json(); })
            .then(m => { meta = m; }).catch(err => { failed = err; console.warn('[music]', err); });
        }
        return;
      }
      if (!src) wire();
      const t = ctx.currentTime, gone = then < 0 ? 0 : Math.max(0, t - then); then = t;      // (s since the last update, by the clock: it stands still while the page is put away)
      heard += ((playing && !playing.fading ? 1 : 0) - heard) * Math.min(1, gone / (playing && !playing.fading ? FADE_IN / 2 : FADE_OUT / 3));
      gain.gain.setTargetAtTime(LEVEL * vol * (1 - DROWN * Math.min(1, Math.max(0, drowned))), ctx.currentTime, EASE);
      const now = ctx.currentTime;
      if (playing) {
        const left = (el.duration || meta.tracks[playing.i].secs) - el.currentTime;      // (by the piece's own clock: a pause to load more is not counted)
        if (!playing.fading && el.currentTime > 1 && left < FADE_OUT) fadeOut(Math.max(0.1, left));
        if (now > playing.stopAt) end();
        return;
      }
      if (!on) return;
      if ((wait -= gone) > 0) return;
      const i = pick(when);
      if (i >= 0) start(i); else wait = 10;      // (nothing fits the hour: look again in a while)
    },
  };
}
