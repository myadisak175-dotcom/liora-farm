// ambience.js
// The air about her: wind in the grass, birds, a brook, a waterfall, the night. Loops that never seem to end, each as
// loud as it is said to be from where she stands. In the game ambience-places.js says so, from the land and the hour;
// on the trial page (step-sounds.html), the page itself.
//
//   const air = createAmbience({ context: () => sounds.context });      // the AudioContext her steps woke (none before the first touch)
//   every frame:
//     air.set('wind', 0.8);                       how loud a layer is now, 0..1 (0: not heard)
//     air.set('fall', near, { pan, far });        a layer with a place: pan -1 (to her left) .. 1 (right); far 0 (beside it) .. 1
//                                                 (far off: duller, the way water far away is only its rumble)
//     air.update(dt);
//   air.volume = 0.8      air.stats (for a test, or the console)
//   air.under = 0.5       let all of it down so much (0..1), smoothly: while music plays (music.js says how much)
//
// THE LAYERS (LAYERS, below: how loud each is against the others) are what tools/make-ambience.py wrote into
// assets/audio/ambience.json: each a loop or two of 20 s, all levelled to one loudness there. The page decides what is
// heard: this file knows nothing of day and night, of her place or of the land.
//
// NOTHING IS FETCHED UNTIL IT IS HEARD. A layer's loops are fetched and decoded the first time it is asked for above
// nothing, its first loop first, so it is heard as soon as that one is in. A layer not heard for FORGET seconds is let
// go of (decoded, a loop is some megabytes), and fetched again if it comes back.
//
// A LOOP THAT DOES NOT SEEM TO LOOP. Each loop was made so its end meets its start, but an MP3 comes back from some
// decoders with a moment of silence at each end, which would be heard every 20 s. So a loop is not played round: each
// playing of it fades in over CROSS seconds as the one before fades out (equal power: no dip, no swell), and where a
// layer has two loops they take turns, so the same 20 s is not heard twice running.

const FILES = new URL('./assets/audio/', import.meta.url);
// each layer's loudness against the others, at 1 (the loops are all as loud as each other as written)
const LAYERS = {
  wind: 0.6, birds: 0.55, night: 0.55, dry: 0.65, crows: 0.6,      // the air all round
  brook: 1.5, river: 1.3, rapids: 1.8, fall: 3.2, leaves: 1.0, abyss: 1.6, frogs: 1.0,      // things with a place (at their loudest: beside them).
                                                                   // (fall: 2.0 at first, not heard clearly enough: "ตอนใกล้น้ำตก อยากได้ยินเสียงน้ำตกชัดๆ")
  windmill: 1.0, wheel: 1.4,                                       // the windmill's sails and the water wheel (beside them)
  brush: 0.8,                                                      // the grass she goes through, parted (at a run: ambience-places.js); about the wind's loudness
};
const MASTER = 1.0;            // the whole of it, at volume 1
const CROSS = 2.0;             // s: one playing of a loop fades into the next over this
const AHEAD = 1.0;             // s: the next playing is set this long before it is due
const EASE = 0.35;             // s: a layer's loudness follows what is asked with this time constant
const FORGET = 60;             // s: a layer not heard this long is let go of
const N = 64, FADE_IN = new Float32Array(N), FADE_OUT = new Float32Array(N);
for (let i = 0; i < N; i++) { FADE_IN[i] = Math.sin(0.5 * Math.PI * i / (N - 1)); FADE_OUT[i] = Math.cos(0.5 * Math.PI * i / (N - 1)); }

export function createAmbience({ context, volume = 1 } = {}) {
  let ctx = null, bus = null, meta = null, asked = false, failed = null, vol = Math.min(2, Math.max(0, volume)), under = 0, busSet = -1;
  const layers = {};
  const layer = name => layers[name] || (layers[name] = {
    name, want: 0, pan: 0, far: 0, loops: [], loading: false, gain: null, panner: null, filter: null, input: null,
    set: 0, panSet: 0, farSet: -1, heard: 0, quiet: 0, playing: false, nextAt: 0, turn: 0, live: [], none: false,
  });

  const decode = bytes => new Promise((yes, no) => { const p = ctx.decodeAudioData(bytes, yes, no); if (p && p.then) p.then(yes, no); });
  async function load(L) {
    L.loading = true;
    for (const loop of meta.layers[L.name] || []) {
      try {
        const r = await fetch(new URL(loop.file, FILES));
        if (!r.ok) throw new Error(`${loop.file}: ${r.status}`);
        L.loops.push(await decode(await r.arrayBuffer()));
      } catch (err) { failed = err; console.warn('[ambience]', err); }
    }
    L.loading = false;
    if (!L.loops.length) L.none = true;      // (no such layer, or none of it could be had: not asked for again)
  }

  // its nodes, made once: loop → (each playing's fade) → duller with distance → left or right → its loudness → out
  function wire(L) {
    L.gain = ctx.createGain(); L.gain.gain.value = 0;
    L.filter = ctx.createBiquadFilter(); L.filter.type = 'lowpass'; L.filter.frequency.value = 18000; L.filter.Q.value = 0.5;
    L.panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    L.input = L.filter;
    if (L.panner) L.filter.connect(L.panner).connect(L.gain); else L.filter.connect(L.gain);
    L.gain.connect(bus);
  }

  // one more playing of a loop, fading in as the one before it fades out
  function play(L, now) {
    const loop = L.loops[L.turn++ % L.loops.length], at = Math.max(L.nextAt, now + 0.02), cross = Math.min(CROSS, loop.duration / 4);
    const src = ctx.createBufferSource(), fade = ctx.createGain();
    src.buffer = loop;
    fade.gain.value = 0;
    fade.gain.setValueCurveAtTime(FADE_IN, at, cross);
    fade.gain.setValueCurveAtTime(FADE_OUT, at + loop.duration - cross, cross);
    src.connect(fade).connect(L.input);
    src.start(at); src.stop(at + loop.duration + 0.05);
    const one = { src, fade };
    src.onended = () => { src.disconnect(); fade.disconnect(); const i = L.live.indexOf(one); if (i >= 0) L.live.splice(i, 1); };
    L.live.push(one);
    L.nextAt = at + loop.duration - cross;
  }
  function hush(L, now) {
    for (const { src } of L.live) { try { src.stop(now + 0.05); } catch (err) { /* (not begun, or already stopped) */ } }
    L.playing = false;
  }

  return {
    get stats() {
      const out = {};
      for (const L of Object.values(layers)) out[L.name] = { want: +L.want.toFixed(3), loops: L.loops.length, playing: L.playing, live: L.live.length, pan: +L.pan.toFixed(2), far: +L.far.toFixed(2) };
      return { state: ctx ? ctx.state : 'asleep', ready: !!meta, failed: failed ? String(failed) : null, layers: out };
    },
    get volume() { return vol; },
    set volume(v) { vol = Math.min(2, Math.max(0, +v || 0)); },
    get under() { return under; },
    set under(v) { under = Math.min(1, Math.max(0, +v || 0)); },

    set(name, level, { pan = 0, far = 0 } = {}) {
      const L = layer(name);
      L.want = Math.min(1, Math.max(0, level || 0)); L.pan = Math.min(1, Math.max(-1, pan || 0)); L.far = Math.min(1, Math.max(0, far || 0));
    },

    update(dt) {
      if (!ctx) { ctx = context ? context() : null; if (!ctx) return; }
      if (ctx.state !== 'running') return;
      if (!bus) { bus = ctx.createGain(); bus.gain.value = MASTER * vol * (1 - under); busSet = bus.gain.value; bus.connect(ctx.destination); }
      { const want = MASTER * vol * (1 - under); if (Math.abs(want - busSet) > 0.004) { bus.gain.setTargetAtTime(want, ctx.currentTime, 0.4); busSet = want; } }
      if (!meta) {
        if (!asked) {
          asked = true;
          fetch(new URL('ambience.json', FILES)).then(r => { if (!r.ok) throw new Error(`ambience.json: ${r.status}`); return r.json(); })
            .then(m => { meta = m; }).catch(err => { failed = err; console.warn('[ambience]', err); });
        }
        return;
      }
      const now = ctx.currentTime;
      for (const L of Object.values(layers)) {
        const target = L.want * (LAYERS[L.name] === undefined ? 1 : LAYERS[L.name]);
        L.heard += (target - L.heard) * Math.min(1, dt / EASE);
        if (target > 0.001) {
          L.quiet = 0;
          if (!L.loops.length && !L.loading && !L.none) load(L);
        } else if ((L.quiet += dt) > FORGET && L.loops.length && !L.loading) { hush(L, now); L.loops = []; L.turn = 0; }
        if (!L.loops.length) continue;
        if (!L.gain) wire(L);
        if (Math.abs(target - L.set) > 0.004) { L.gain.gain.setTargetAtTime(target, now, EASE); L.set = target; }
        if (L.panner && Math.abs(L.pan - L.panSet) > 0.02) { L.panner.pan.setTargetAtTime(L.pan, now, 0.12); L.panSet = L.pan; }
        if (Math.abs(L.far - L.farSet) > 0.02) { L.filter.frequency.setTargetAtTime(700 + 17300 * (1 - L.far) ** 2.5, now, 0.2); L.farSet = L.far; }
        if (target <= 0.001 && L.heard < 0.002) { if (L.playing) hush(L, now); continue; }      // not heard: nothing is played
        if (!L.playing) { L.playing = true; L.nextAt = now + 0.03; }
        while (L.nextAt < now + AHEAD) play(L, now);
      }
    },
  };
}
