// music.js
// Music, over and over: a piece plays, fades out, and for 15 s after it there is only the air about her (wind, water,
// birds); then the next ("อยากให้เพลงหยุดสัก 15 วิ แล้วเล่นต่อเรื่อยๆ"). Some minutes of the air between them at first.
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
// their length, and when they fit ('day', 'night', 'curse', or 'any': any of the living world's hours); and the parts each
// is played from (tools/make-music-parts.py: parts, hop, over). A piece is played when one fits; at dusk the next one is a
// night one; in the cursed land only a cursed one (there is none yet, so it is silent there). One playing is let finish,
// whatever the hour does meanwhile.
//
// A LITTLE OVER THE AIR (LEVEL): the air about her is the place, the music its mood. (Under the air at first, it was too
// quiet.) And while a piece plays the air is let down (UNDER, as the piece fades in and out: the page sets air.under), or
// its wind covers the music ("เสียงบรรยากาศดังไป กลบเพลงหมด"); between the pieces it is as loud as ever. By a waterfall or
// rushing water it is the music that goes down (DROWN), and the air not (the page: air.under times what is not drowned).
// In the game it was still under the air at three places in four ("เสียงซ่าๆ ในเกมมันดัง แล้วก็ดนตรีเบาไป": counted over
// the whole land, README): LEVEL, DROWN and UNDER are as they are since then.
//
// A PIECE IS PLAYED IN PARTS, from the AudioContext (27 Nov 2026). It was streamed from an <audio> element through the
// context: on an iPhone that is known to come out warped now and then (the pieces are 44.1 kHz, the phone 48, and Safari
// resamples an element's sound badly: WebKit bugs 215314, 221553, 239696), and an element needs a touch of its own before
// it may be heard ("เพลงเล่นเพี้ยนๆ", "เพลงก็ไม่เล่นเองอัตโนมัติ"). Decoded whole a piece is some 80 MB. So it is played from
// its parts (HOP seconds each, and OVER more where it runs on into the next), each fetched and decoded LEAD seconds before it
// is due and let go of once it has played: two of them held at most (some 24 MB), and nothing to be let play but the
// context, which her first touch woke. One part fades into the next over the second they share, where the two are the same
// music (a plain crossfade: no dip, no swell). The list and the first part of each piece are fetched at once (fetching
// needs no touch), so the first piece begins a moment after her first touch. A piece not cut into parts is played whole.

const FILES = new URL('./assets/audio/', import.meta.url);
const LEVEL = 1.6;                 // the music's loudness, at volume 1 (the pieces are levelled to the air's loops, then this). 0.5 at first: too
                                   // quiet ("เพลงเบาไป"); then 1.0, and in the game still "ดนตรีเบาไป": a piece is levelled where it is loud, and
                                   // is 4.4 dB under that most of the while, where a loop of wind or water is as loud all the while
const DROWN = 0.3;                 // how much of it a waterfall at its loudest takes away (0.6 at first: with a fall in hearing it was all but gone)
const FIRST = 1;                   // s after the first touch before the first piece: at once ("ทำให้เพลงเล่นอัตโนมัติเลยนะคะ"; 20 s at
                                   // first, and it seemed not to play by itself). Before a touch no browser lets a page be heard
const GAP = 15;                    // s of only the air between one piece and the next ("หยุดสัก 15 วิ แล้วเล่นต่อเรื่อยๆ"; 150 to 300 s at
                                   // first, and the music seemed to stop and not come back)
const FADE_IN = 4, FADE_OUT = 6;   // s: a piece comes in, and goes, this gently (the pieces begin at once and some end abruptly)
const OFF_FADE = 1.5;              // s: switched off, it goes this fast
const EASE = 0.5;                  // s: its loudness follows what is asked (drowned, volume) with this time constant
const UNDER = 0.6;                 // how much the air about her is let down while a piece plays (0.6: 8 dB; 0.5 at first)
const LEAD = 12;                   // s: a part is fetched and decoded this long before it is due

export function createMusic({ context, volume = 1, first = FIRST } = {}) {
  let ctx = null, meta = null, failed = null, vol = Math.min(2, Math.max(0, volume)), on = true;
  let fade = null, gain = null, playing = null, wait = first, last = -1, played = 0;
  let heard = 0;                   // 0..1: how much a piece is heard now (as it fades in and out), for under
  let then = -1;                   // the AudioContext's clock at the last update: the waits go by it, not by the frames
                                   // (a page whose frames come slowly would make them minutes longer)

  // what a piece is played from: its parts, or (not cut) the whole of it as one part
  const partsOf = t => (t.parts && t.parts.length ? { files: t.parts, hop: t.hop, over: t.over } : { files: [t.file], hop: t.secs, over: 0 });
  // a file's bytes, fetched once ahead; taken (once: decoding takes them over) when it is decoded
  const bytes = new Map();
  const fetchBytes = file => {
    if (!bytes.has(file)) bytes.set(file, fetch(new URL(file, FILES)).then(r => { if (!r.ok) throw new Error(`${file}: ${r.status}`); return r.arrayBuffer(); }));
    return bytes.get(file);
  };
  const decode = data => new Promise((yes, no) => { const p = ctx.decodeAudioData(data, yes, no); if (p && p.then) p.then(yes, no); });
  const take = file => { const p = fetchBytes(file); bytes.delete(file); return p.then(decode); };
  fetch(new URL('music.json', FILES), { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`music.json: ${r.status}`); return r.json(); })
    .then(m => { meta = m; for (const t of m.tracks) fetchBytes(partsOf(t).files[0]).catch(() => { /* (asked again when it is played) */ }); })
    .catch(err => { failed = err; console.warn('[music]', err); });

  function wire() {
    fade = ctx.createGain(); fade.gain.value = 0;              // a piece's own fade in and out (and switching off)
    gain = ctx.createGain(); gain.gain.value = LEVEL * vol;    // how loud the music is (volume, a waterfall)
    fade.connect(gain).connect(ctx.destination);
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
    const t = meta.tracks[i];
    last = i; played++;
    playing = { i, ...partsOf(t), secs: t.secs, t0: -1, parts: [], next: 0, stopAt: Infinity, fading: false };
    load(playing, 0);
  }
  // a part of the piece playing: fetched, decoded, set to play at its time; the first begins the piece
  function load(p, k) {
    if (k >= p.files.length || p.parts[k]) return;
    const part = p.parts[k] = { buffer: null, src: null };
    p.next = k + 1;
    take(p.files[k]).then(b => {
      if (playing !== p || p.fading) return;
      part.buffer = b;
      if (k === 0) begin(p); else place(p, k);
    }, err => { failed = failed || err; console.warn('[music]', err); if (playing === p && k === 0) end(); });
  }
  function begin(p) {
    const now = ctx.currentTime;
    p.t0 = now + 0.05;
    fade.gain.cancelScheduledValues(now); fade.gain.setValueAtTime(0, now); fade.gain.setValueAtTime(0, p.t0); fade.gain.linearRampToValueAtTime(1, p.t0 + FADE_IN);
    place(p, 0);
  }
  // a part at its time in the piece: in over its first OVER seconds (not the first part), out over its last OVER (not the
  // last part), so each fades into the next where the two are the same music. One that came late begins where the piece is
  function place(p, k) {
    const part = p.parts[k];
    if (!part || !part.buffer || part.src || p.t0 < 0) return;
    const at = p.t0 + k * p.hop, len = part.buffer.duration, when = Math.max(at, ctx.currentTime + 0.02), offset = when - at;
    if (offset > len - 0.05) { part.buffer = null; return; }                          // (too late for any of it)
    const lastPart = k === p.files.length - 1, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = part.buffer;
    if (k > 0 && p.over > 0 && offset < p.over) { g.gain.setValueAtTime(offset / p.over, when); g.gain.linearRampToValueAtTime(1, at + p.over); }
    else g.gain.setValueAtTime(1, when);
    if (!lastPart && p.over > 0) { g.gain.setValueAtTime(1, Math.max(when, at + p.hop)); g.gain.linearRampToValueAtTime(0, at + p.hop + p.over); }
    src.connect(g).connect(fade);
    src.start(when, offset);
    src.stop(lastPart || !p.over ? at + len + 0.05 : at + p.hop + p.over + 0.02);
    part.src = src;
    src.onended = () => { src.disconnect(); g.disconnect(); part.buffer = null; };      // (played: let go of)
  }
  function end() {
    const p = playing;
    if (!p) return;
    playing = null;
    for (const part of p.parts) if (part && part.src) { try { part.src.stop(); } catch (err) { /* (not begun, or already stopped) */ } }
    wait = GAP;
  }
  function fadeOut(secs) {
    const now = ctx.currentTime;
    fade.gain.cancelScheduledValues(now); fade.gain.setValueAtTime(fade.gain.value, now); fade.gain.linearRampToValueAtTime(0, now + secs);
    playing.fading = true; playing.stopAt = Math.min(playing.stopAt, now + secs + 0.1);
  }

  return {
    get stats() {
      const p = playing;
      return { state: ctx ? ctx.state : 'asleep', ready: !!meta, failed: failed ? String(failed) : null, on, heard: +heard.toFixed(2), playing: p ? meta.tracks[p.i].file : null,
        part: p && p.t0 >= 0 && ctx ? Math.min(p.files.length - 1, Math.floor((ctx.currentTime - p.t0) / p.hop)) : -1, held: p ? p.parts.filter(x => x && x.buffer).length : 0,
        wait: +Math.max(0, wait).toFixed(1), played };
    },
    get volume() { return vol; },
    set volume(v) { vol = Math.min(2, Math.max(0, +v || 0)); },
    get on() { return on; },
    get under() { return UNDER * heard; },
    set on(v) {
      on = !!v;
      if (!on && playing && ctx && fade) fadeOut(OFF_FADE);
      if (on && !playing) wait = Math.min(wait, 2);      // (on again: a piece soon)
    },
    // skip the wait: the next piece now (for a test, or to hear it)
    next() { if (!playing) wait = 0; },

    update(dt, { when = 'day', drowned = 0 } = {}) {
      if (!ctx) { ctx = context ? context() : null; if (!ctx) return; }
      if (ctx.state !== 'running' || !meta) return;
      if (!fade) wire();
      const now = ctx.currentTime, gone = then < 0 ? 0 : Math.max(0, now - then); then = now;      // (s since the last update, by the clock: it stands still while the page is put away)
      const sounding = !!playing && playing.t0 >= 0 && !playing.fading;
      heard += ((sounding ? 1 : 0) - heard) * Math.min(1, gone / (sounding ? FADE_IN / 2 : FADE_OUT / 3));
      gain.gain.setTargetAtTime(LEVEL * vol * (1 - DROWN * Math.min(1, Math.max(0, drowned))), now, EASE);
      if (playing) {
        const p = playing;
        if (p.t0 < 0) { if (now > p.stopAt) end(); return; }                            // (its first part still on its way)
        if (p.next < p.files.length && now > p.t0 + p.next * p.hop - LEAD) load(p, p.next);
        const left = p.t0 + p.secs - now;
        if (!p.fading && now > p.t0 + 1 && left < FADE_OUT) fadeOut(Math.max(0.1, left));
        if (now > p.stopAt || left < -0.2) end();
        return;
      }
      if (!on) return;
      if ((wait -= gone) > 0) return;
      const i = pick(when);
      if (i >= 0) start(i); else wait = 10;      // (nothing fits the hour: look again in a while)
    },
  };
}
