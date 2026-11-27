/* ==========================================================================
   boss-hall-sounds.js  —  the boss hall's own sounds, made on the spot with WebAudio (no files to fetch)

     const heard = createBossSounds({ context: () => sounds.context, volume })   // the AudioContext her first touch makes
     heard.hum()           the door's runes waking: a low swell
     heard.clunk()         its bar giving way
     heard.rumble(s)       the leaves grinding open, s seconds; heard.thud() as they meet the walls
     heard.whoosh(pan, g)  a fire catching (pan -1 left .. 1 right, g how near)
     heard.boom()          the circle under her feet waking
     heard.shing(i)        a statue's eyes lighting (i: which, each a little lower)
     heard.air(on)         the hall's own low air, always (from her first touch)
     heard.dread(on)       once the statues are awake: a dark drone and a heart beating under it
     heard.update(dt)      every frame (keeps the heart beating)

   Nothing is made before there is a context (her first touch makes it); a call before then is simply not heard.
   Everything goes through one gain and a short stone echo (a delay fed back on itself through a low-pass).
   ========================================================================== */
export function createBossSounds({ context, volume = 1 } = {}) {
  let ctx = null, out = null, send = null, white = null, brown = null;
  let airNodes = null, dreadNodes = null, heartOn = false, nextBeat = 0, airWanted = false;

  function noise(c, seconds, kind) {
    const n = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  function ready() {
    const c = context && context();
    if (!c) return null;
    if (c !== ctx) {
      ctx = c;
      out = ctx.createGain(); out.gain.value = Math.min(2, Math.max(0, volume)) * 0.9; out.connect(ctx.destination);
      // the stone's echo
      const dl = ctx.createDelay(1.0), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
      dl.delayTime.value = 0.21; fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 1600; wet.gain.value = 0.5;
      send = ctx.createGain(); send.gain.value = 1;
      send.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(out);
      white = noise(ctx, 2, 'white'); brown = noise(ctx, 4, 'brown');
      airNodes = null; dreadNodes = null;
      if (airWanted) air(true);
    }
    return ctx;
  }
  const now = () => ctx.currentTime + 0.02;
  function env(param, t0, a, peak, hold, rel) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    param.setValueAtTime(Math.max(peak, 0.0002), t0 + a + hold);
    param.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
  }
  function chain(nodes, wetSend = 0.4) {       // nodes in a row, the last into the output (and some into the echo)
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    const last = nodes[nodes.length - 1];
    last.connect(out);
    if (wetSend > 0) { const s = ctx.createGain(); s.gain.value = wetSend; last.connect(s); s.connect(send); }
    return last;
  }
  function src(buf, loop = false, rate = 1) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.playbackRate.value = rate; return s; }
  function osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function filt(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  function gain(v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; }

  function hum() {
    if (!ready()) return;
    const t = now(), g = gain(), lp = filt('lowpass', 420);
    for (const [ty, f, k] of [['sine', 55, 1], ['sine', 82.5, 0.6], ['triangle', 110, 0.25]]) {
      const o = osc(ty, f), og = gain(k); o.connect(og); og.connect(lp); o.start(t); o.stop(t + 4.5);
    }
    chain([lp, g], 0.5);
    env(g.gain, t, 0.8, 0.22, 1.2, 1.8);
  }
  function clunk() {
    if (!ready()) return;
    const t = now();
    const n = src(white), lp = filt('lowpass', 650), g = gain();
    chain([n, lp, g], 0.6); env(g.gain, t, 0.004, 0.55, 0.03, 0.28); n.start(t); n.stop(t + 0.5);
    const o = osc('sine', 72), og = gain();
    o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    chain([o, og], 0.5); env(og.gain, t, 0.004, 0.75, 0.0, 0.38); o.start(t); o.stop(t + 0.6);
  }
  function rumble(seconds = 3) {
    if (!ready()) return;
    const t = now(), n = src(brown, true, 0.9), lp = filt('lowpass', 190), bp = filt('peaking', 95, 1.2), g = gain(), grind = gain(0.6);
    bp.gain.value = 6;
    // the grind: the gain shaken a few times a second, and slowly
    const l1 = osc('sine', 6.5), l1g = gain(0.32), l2 = osc('sine', 0.7), l2g = gain(0.2);
    l1.connect(l1g); l1g.connect(grind.gain); l2.connect(l2g); l2g.connect(grind.gain);
    n.connect(lp); lp.connect(bp); bp.connect(grind); chain([grind, g], 0.55);
    env(g.gain, t, 0.35, 0.62, Math.max(0, seconds - 0.95), 0.6);
    const lo = osc('sine', 38), log = gain();
    lo.frequency.setValueAtTime(36, t); lo.frequency.linearRampToValueAtTime(42, t + seconds);
    chain([lo, log], 0.3); env(log.gain, t, 0.5, 0.3, Math.max(0, seconds - 1.0), 0.5);
    for (const s of [n, l1, l2, lo]) { s.start(t); s.stop(t + seconds + 0.2); }
  }
  function thud() {
    if (!ready()) return;
    const t = now(), o = osc('sine', 66), g = gain();
    o.frequency.setValueAtTime(66, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.6);
    chain([o, g], 0.7); env(g.gain, t, 0.006, 0.85, 0.02, 0.7); o.start(t); o.stop(t + 0.9);
    const n = src(brown), lp = filt('lowpass', 320), ng = gain();
    chain([n, lp, ng], 0.7); env(ng.gain, t, 0.006, 0.7, 0.03, 0.5); n.start(t); n.stop(t + 0.8);
  }
  function whoosh(pan = 0, near = 1) {
    if (!ready()) return;
    const t = now(), k = Math.max(0.12, Math.min(1, near));
    const n = src(white, false, 0.8 + Math.random() * 0.3), bp = filt('bandpass', 350, 1.1), g = gain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1);
    if (p.pan) p.pan.value = Math.max(-1, Math.min(1, pan));
    bp.frequency.setValueAtTime(320, t); bp.frequency.exponentialRampToValueAtTime(2300, t + 0.26); bp.frequency.exponentialRampToValueAtTime(800, t + 0.7);
    chain([n, bp, g, p], 0.35); env(g.gain, t, 0.03, 0.5 * k, 0.06, 0.5); n.start(t); n.stop(t + 1.0);
    const o = osc('sine', 96), og = gain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.3);
    chain([o, og], 0.2); env(og.gain, t, 0.01, 0.35 * k, 0.0, 0.3); o.start(t); o.stop(t + 0.5);
  }
  function boom() {
    if (!ready()) return;
    const t = now(), o = osc('sine', 54), g = gain();
    o.frequency.setValueAtTime(54, t); o.frequency.exponentialRampToValueAtTime(27, t + 1.9);
    chain([o, g], 0.8); env(g.gain, t, 0.01, 0.95, 0.12, 2.2); o.start(t); o.stop(t + 2.6);
    const n = src(brown, false, 0.7), lp = filt('lowpass', 240), ng = gain();
    chain([n, lp, ng], 0.8); env(ng.gain, t, 0.01, 0.75, 0.15, 1.7); n.start(t); n.stop(t + 2.2);
    // and something high, far off, that rings after it
    const s = src(white), bp = filt('bandpass', 2600, 6), sg = gain();
    chain([s, bp, sg], 1.0); env(sg.gain, t + 0.05, 0.4, 0.06, 0.4, 1.4); s.start(t); s.stop(t + 2.4);
  }
  function shing(i = 0) {
    if (!ready()) return;
    const t = now(), f = 1480 * Math.pow(0.955, i);
    for (const [m, k] of [[1, 0.1], [1.5, 0.06], [2.76, 0.03]]) {
      const o = osc('sine', f * m), g = gain();
      chain([o, g], 0.9); env(g.gain, t, 0.004, k, 0.0, 1.1); o.start(t); o.stop(t + 1.3);
    }
    const n = src(white), bp = filt('bandpass', 3200, 2), g = gain();
    chain([n, bp, g], 0.6); env(g.gain, t, 0.002, 0.08, 0.0, 0.06); n.start(t); n.stop(t + 0.15);
  }
  function air(on) {
    airWanted = on;
    if (!ready()) return;
    if (on && !airNodes) {
      const t = now(), n = src(brown, true, 0.6), bp = filt('bandpass', 210, 0.6), g = gain(), l = osc('sine', 0.09), lg = gain(0.02);
      l.connect(lg); lg.connect(g.gain);
      chain([n, bp, g], 0.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 3);
      n.start(t); l.start(t);
      airNodes = { n, l, g };
    } else if (!on && airNodes) {
      const t = now(), a = airNodes; airNodes = null;
      a.g.gain.cancelScheduledValues(t); a.g.gain.setValueAtTime(a.g.gain.value, t); a.g.gain.linearRampToValueAtTime(0, t + 1);
      a.n.stop(t + 1.1); a.l.stop(t + 1.1);
    }
  }
  function dread(on) {
    heartOn = on;
    if (!ready()) return;
    if (on && !dreadNodes) {
      const t = now(), lp = filt('lowpass', 240, 1.5), g = gain();
      const os = [osc('sawtooth', 55), osc('sawtooth', 55.6), osc('sine', 27.5)];
      for (const o of os) { o.connect(lp); o.start(t); }
      chain([lp, g], 0.3);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.075, t + 2.5);
      dreadNodes = { os, g };
      nextBeat = t + 0.6;
    } else if (!on && dreadNodes) {
      const t = now(), d = dreadNodes; dreadNodes = null;
      d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0, t + 1.2);
      for (const o of d.os) o.stop(t + 1.3);
    }
  }
  function beat(t, k) {
    const o = osc('sine', 58), g = gain();
    o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    chain([o, g], 0.25); env(g.gain, t, 0.008, 0.5 * k, 0.02, 0.2); o.start(t); o.stop(t + 0.35);
  }
  return {
    hum, clunk, rumble, thud, whoosh, boom, shing, air, dread,
    update() {
      if (!heartOn || !ready() || !dreadNodes) return;
      const t = ctx.currentTime;
      while (nextBeat < t + 0.3) { beat(nextBeat, 1); beat(nextBeat + 0.27, 0.7); nextBeat += 1.18; }
    },
    get context() { return ctx; },
  };
}
