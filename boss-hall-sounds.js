/* ==========================================================================
   boss-hall-sounds.js  —  the boss hall's own sounds: the user's earshot renders made heavy and dark for the hall
   (tools/make-boss-sounds.py → assets/audio/boss/*.mp3), heard in a stone hall's echo

     const heard = createBossSounds({ context: () => sounds.context, volume, fires: hall.layout.fires })
     heard.hum()           the door's runes waking (a magic portal's swell, slow and low)
     heard.clunk()         its bar giving way (a dungeon door's iron latch)
     heard.rumble(s)       the leaves grinding open, s seconds (a giant stone door); heard.thud() as they meet the walls
     heard.whoosh(pan, g)  a fire catching (pan -1 left .. 1 right, g how near): a burst of flame
     heard.boom()          the circle under her feet waking: air drawn in to a heavy hit, the hall shaking, the fires roaring red
     heard.shing(i)        a statue's eyes lighting (i: which, each a little lower): a ring of steel
     heard.air(on)         the hall's own low air, always (from her first touch), and water dripping somewhere now and then
     heard.dread(on)       once the statues are awake: a dark living drone (a whale's call, slow) and a heart beating under it
     heard.update(dt, at, fx)  every frame; at: where she is ({ x, z }), fx: the hall's (which fires are lit, their flare):
                           keeps the heart beating and the water dripping, and the fires' crackle as loud as they are near

   The files are fetched as soon as this is made and made ready to play once there is a context (her first touch makes
   it). A single sound asked for before its file is ready (or whose file did not come) is made on the spot instead, as
   the hall had them first (WebAudio: hum, clunk ...); { made: true } (the page's ?sfx=old) makes every one so.
   Everything goes through one gain and the hall's echo: a convolver, a stone hall's 3 s tail, darker as it dies away.
   ========================================================================== */
const FILES = ['hum', 'clunk', 'grind', 'thud', 'fire', 'boom', 'eye', 'heart', 'drip1', 'drip2', 'air', 'crackle', 'drone'];

export function createBossSounds({ context, volume = 1, fires = [], made = false, base = './assets/audio/boss/' } = {}) {
  let ctx = null, out = null, send = null, white = null, brown = null;
  let airNodes = null, dreadNodes = null, crackle = null, heartOn = false, nextBeat = 0, nextDrip = 0, airWanted = false;
  const raw = {}, buf = {};
  if (!made) for (const n of FILES) raw[n] = fetch(base + n + '.mp3').then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);

  function noise(c, seconds, kind) {
    const n = Math.floor(c.sampleRate * seconds), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  // the hall's echo: noise dying away over 3 s, a one-pole low-pass closing on it as it dies (stone and air keep the low
  // longest), after a few early answers off the nearer walls; the two sides apart
  function hallEcho(c) {
    const sr = c.sampleRate, len = Math.floor(sr * 3.0), ir = c.createBuffer(2, len, sr), pre = Math.floor(sr * 0.022);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr, k = 0.6 - 0.52 * Math.min(1, t / 2.2);
        lp += k * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-t / 0.43);
      }
      for (const [ms, g] of [[9, 0.5], [21, 0.36], [34, 0.28], [49, 0.22], [71, 0.16]]) {
        const j = Math.floor(sr * (ms + (ch ? 5 : 0)) / 1000);
        if (j < len) d[j] += ch ? -g : g;
      }
    }
    const cv = c.createConvolver(); cv.buffer = ir;
    return cv;
  }
  // where in a decoded loop its sound begins and ends (an mp3 decoded may have a little silence at either end)
  function edges(b) {
    const d = b.getChannelData(0), n = d.length;
    let a = 0, z = n - 1;
    while (a < n - 1 && Math.abs(d[a]) < 1e-4) a++;
    while (z > a && Math.abs(d[z]) < 1e-4) z--;
    return [a / b.sampleRate, (z + 1) / b.sampleRate];
  }
  function ready() {
    const c = context && context();
    if (!c) return null;
    if (c !== ctx) {
      ctx = c;
      out = ctx.createGain(); out.gain.value = Math.min(2, Math.max(0, volume)) * 0.9; out.connect(ctx.destination);
      const echo = hallEcho(ctx), wet = ctx.createGain(); wet.gain.value = 0.55;
      send = ctx.createGain(); send.gain.value = 1;
      send.connect(echo); echo.connect(wet); wet.connect(out);
      white = noise(ctx, 2, 'white'); brown = noise(ctx, 4, 'brown');
      airNodes = null; dreadNodes = null; crackle = null;
      for (const n of FILES) delete buf[n];
      const mine = ctx;
      for (const n of FILES) if (raw[n]) {
        raw[n].then(ab => (ab && mine === ctx ? ctx.decodeAudioData(ab.slice(0)) : null))
          .then(b => { if (b && mine === ctx) { b.span = edges(b); buf[n] = b; } })
          .catch(() => {});
      }
    }
    return ctx;
  }
  const now = () => ctx.currentTime + 0.02;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
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
  function src(b, loop = false, rate = 1) { const s = ctx.createBufferSource(); s.buffer = b; s.loop = loop; s.playbackRate.value = rate; return s; }
  function osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function filt(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  function gain(v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function panner(p) {
    if (!ctx.createStereoPanner) return gain(1);
    const n = ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1); return n;
  }

  // ---- a file played: once, or round and round
  function play(n, { rate = 1, level = 1, pan = 0, wet = 0.4, lp = 0, at = 0 } = {}) {
    const b = buf[n];
    if (!b) return null;
    const s = src(b, false, rate), nodes = [s];
    if (lp) nodes.push(filt('lowpass', lp));
    nodes.push(gain(level));
    if (pan) nodes.push(panner(pan));
    chain(nodes, wet);
    s.start(at || now());
    return s;
  }
  function loop(n, wet) {
    const b = buf[n], s = src(b, true), g = gain(0);
    s.loopStart = b.span[0]; s.loopEnd = b.span[1];
    chain([s, g], wet);
    s.start(now(), b.span[0]);
    return { s, g };
  }
  function fadeTo(g, v, secs) { const t = now(); g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + secs); }

  // ---- the hall as it had them first, made on the spot (when a file is not there, or ?sfx=old)
  function madeHum() {
    const t = now(), g = gain(), lp = filt('lowpass', 420);
    for (const [ty, f, k] of [['sine', 55, 1], ['sine', 82.5, 0.6], ['triangle', 110, 0.25]]) {
      const o = osc(ty, f), og = gain(k); o.connect(og); og.connect(lp); o.start(t); o.stop(t + 4.5);
    }
    chain([lp, g], 0.5);
    env(g.gain, t, 0.8, 0.22, 1.2, 1.8);
  }
  function madeClunk() {
    const t = now();
    const n = src(white), lp = filt('lowpass', 650), g = gain();
    chain([n, lp, g], 0.6); env(g.gain, t, 0.004, 0.55, 0.03, 0.28); n.start(t); n.stop(t + 0.5);
    const o = osc('sine', 72), og = gain();
    o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    chain([o, og], 0.5); env(og.gain, t, 0.004, 0.75, 0.0, 0.38); o.start(t); o.stop(t + 0.6);
  }
  function madeRumble(seconds) {
    const t = now(), n = src(brown, true, 0.9), lp = filt('lowpass', 190), bp = filt('peaking', 95, 1.2), g = gain(), grind = gain(0.6);
    bp.gain.value = 6;
    const l1 = osc('sine', 6.5), l1g = gain(0.32), l2 = osc('sine', 0.7), l2g = gain(0.2);
    l1.connect(l1g); l1g.connect(grind.gain); l2.connect(l2g); l2g.connect(grind.gain);
    n.connect(lp); lp.connect(bp); bp.connect(grind); chain([grind, g], 0.55);
    env(g.gain, t, 0.35, 0.62, Math.max(0, seconds - 0.95), 0.6);
    const lo = osc('sine', 38), log = gain();
    lo.frequency.setValueAtTime(36, t); lo.frequency.linearRampToValueAtTime(42, t + seconds);
    chain([lo, log], 0.3); env(log.gain, t, 0.5, 0.3, Math.max(0, seconds - 1.0), 0.5);
    for (const s of [n, l1, l2, lo]) { s.start(t); s.stop(t + seconds + 0.2); }
  }
  function madeThud() {
    const t = now(), o = osc('sine', 66), g = gain();
    o.frequency.setValueAtTime(66, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.6);
    chain([o, g], 0.7); env(g.gain, t, 0.006, 0.85, 0.02, 0.7); o.start(t); o.stop(t + 0.9);
    const n = src(brown), lp = filt('lowpass', 320), ng = gain();
    chain([n, lp, ng], 0.7); env(ng.gain, t, 0.006, 0.7, 0.03, 0.5); n.start(t); n.stop(t + 0.8);
  }
  function madeWhoosh(pan, k) {
    const t = now();
    const n = src(white, false, 0.8 + Math.random() * 0.3), bp = filt('bandpass', 350, 1.1), g = gain(), p = panner(pan);
    bp.frequency.setValueAtTime(320, t); bp.frequency.exponentialRampToValueAtTime(2300, t + 0.26); bp.frequency.exponentialRampToValueAtTime(800, t + 0.7);
    chain([n, bp, g, p], 0.35); env(g.gain, t, 0.03, 0.5 * k, 0.06, 0.5); n.start(t); n.stop(t + 1.0);
    const o = osc('sine', 96), og = gain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.3);
    chain([o, og], 0.2); env(og.gain, t, 0.01, 0.35 * k, 0.0, 0.3); o.start(t); o.stop(t + 0.5);
  }
  function madeBoom() {
    const t = now(), o = osc('sine', 54), g = gain();
    o.frequency.setValueAtTime(54, t); o.frequency.exponentialRampToValueAtTime(27, t + 1.9);
    chain([o, g], 0.8); env(g.gain, t, 0.01, 0.95, 0.12, 2.2); o.start(t); o.stop(t + 2.6);
    const n = src(brown, false, 0.7), lp = filt('lowpass', 240), ng = gain();
    chain([n, lp, ng], 0.8); env(ng.gain, t, 0.01, 0.75, 0.15, 1.7); n.start(t); n.stop(t + 2.2);
    const s = src(white), bp = filt('bandpass', 2600, 6), sg = gain();
    chain([s, bp, sg], 1.0); env(sg.gain, t + 0.05, 0.4, 0.06, 0.4, 1.4); s.start(t); s.stop(t + 2.4);
  }
  function madeShing(i) {
    const t = now(), f = 1480 * Math.pow(0.955, i);
    for (const [m, k] of [[1, 0.1], [1.5, 0.06], [2.76, 0.03]]) {
      const o = osc('sine', f * m), g = gain();
      chain([o, g], 0.9); env(g.gain, t, 0.004, k, 0.0, 1.1); o.start(t); o.stop(t + 1.3);
    }
    const n = src(white), bp = filt('bandpass', 3200, 2), g = gain();
    chain([n, bp, g], 0.6); env(g.gain, t, 0.002, 0.08, 0.0, 0.06); n.start(t); n.stop(t + 0.15);
  }
  function madeAir() {
    const t = now(), n = src(brown, true, 0.6), bp = filt('bandpass', 210, 0.6), g = gain(), l = osc('sine', 0.09), lg = gain(0.02);
    l.connect(lg); lg.connect(g.gain);
    chain([n, bp, g], 0.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 3);
    n.start(t); l.start(t);
    return { stop: at => { n.stop(at); l.stop(at); }, g };
  }
  function madeDrone() {
    const t = now(), lp = filt('lowpass', 240, 1.5), g = gain();
    const os = [osc('sawtooth', 55), osc('sawtooth', 55.6), osc('sine', 27.5)];
    for (const o of os) { o.connect(lp); o.start(t); }
    chain([lp, g], 0.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.075, t + 2.5);
    return { stop: at => os.forEach(o => o.stop(at)), g };
  }
  function madeBeat(t, k) {
    const o = osc('sine', 58), g = gain();
    o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    chain([o, g], 0.25); env(g.gain, t, 0.008, 0.5 * k, 0.02, 0.2); o.start(t); o.stop(t + 0.35);
  }

  // ---- what the page asks for
  function hum() { if (!ready()) return; if (!play('hum', { level: 0.9, wet: 0.55 })) madeHum(); }
  function clunk() { if (!ready()) return; if (!play('clunk', { level: 1, wet: 0.6 })) madeClunk(); }
  function rumble(seconds = 3) {
    if (!ready()) return;
    const b = buf.grind;
    if (!b) return madeRumble(seconds);
    play('grind', { rate: clamp(b.duration / seconds, 0.85, 1.15), level: 1.25, wet: 0.5 });
  }
  function thud() { if (!ready()) return; if (!play('thud', { level: 1, wet: 0.75 })) madeThud(); }
  function whoosh(pan = 0, near = 1) {
    if (!ready()) return;
    const k = clamp(near, 0.12, 1), f = Math.max(0.25, k);        // (a far fire is still heard catching: darker, not lost)
    if (!play('fire', { rate: 0.9 + Math.random() * 0.22, level: 1.25 * f, pan, wet: 0.45, lp: 1500 + 6500 * f })) madeWhoosh(clamp(pan, -1, 1), k);
  }
  function boom() { if (!ready()) return; if (!play('boom', { level: 1, wet: 0.8 })) madeBoom(); }
  function shing(i = 0) { if (!ready()) return; if (!play('eye', { rate: Math.pow(0.955, i), level: 1.2, wet: 0.9 })) madeShing(i); }

  function air(on) {
    airWanted = on;
    if (!ready()) return;
    if (!on && airNodes) {
      const t = now(), a = airNodes; airNodes = null;
      a.g.gain.cancelScheduledValues(t); a.g.gain.setValueAtTime(a.g.gain.value, t); a.g.gain.linearRampToValueAtTime(0, t + 1);
      a.stop(t + 1.1);
    }
    startLoops();
  }
  function dread(on) {
    heartOn = on;
    if (!ready()) return;
    if (!on && dreadNodes) {
      const t = now(), d = dreadNodes; dreadNodes = null;
      d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0, t + 1.2);
      d.stop(t + 1.3);
    }
    if (on && !dreadNodes) nextBeat = now() + 0.6;
    startLoops();
  }
  // the loops wanted, once their files are ready (made on the spot, as before, if they did not come or with ?sfx=old)
  function startLoops() {
    const gone = n => made || !raw[n];
    if (airWanted && !airNodes) {
      if (buf.air) { const l = loop('air', 0.3); fadeTo(l.g, 0.8, 3); airNodes = { g: l.g, stop: at => l.s.stop(at) }; }
      else if (gone('air')) airNodes = madeAir();
    }
    if (heartOn && !dreadNodes) {
      if (buf.drone) { const l = loop('drone', 0.35); fadeTo(l.g, 0.85, 2.5); dreadNodes = { g: l.g, stop: at => l.s.stop(at) }; }
      else if (gone('drone')) dreadNodes = madeDrone();
    }
    if (airWanted && !crackle && buf.crackle) crackle = loop('crackle', 0.3);
  }
  // how near the lit fires are to her: each counts the less the farther (half at 3.2 m)
  function fireNear(at, fx) {
    let s = 0;
    for (const f of fires) {
      const lit = f.kind === 'door' ? 1 : clamp((f.z - (fx ? fx.front : 999)) / 1.5 + 0.5, 0, 1);
      if (lit <= 0) continue;
      const d2 = (f.x - at.x) ** 2 + (f.z - at.z) ** 2;
      s += lit / (1 + d2 / (3.2 * 3.2));
    }
    return Math.min(1, s);
  }

  return {
    hum, clunk, rumble, thud, whoosh, boom, shing, air, dread,
    update(dt, at, fx) {
      if (!ctx || !ready()) return;
      startLoops();
      const t = ctx.currentTime;
      if (heartOn && dreadNodes) {
        if (nextBeat < t - 0.1) nextBeat = t + 0.1;       // (after the page was away: not every beat missed at once)
        while (nextBeat < t + 0.3) {
          if (!play('heart', { at: nextBeat, level: 0.9, wet: 0.3 })) { madeBeat(nextBeat, 1); madeBeat(nextBeat + 0.27, 0.7); }
          nextBeat += 1.18;
        }
      }
      if (airWanted && (buf.drip1 || buf.drip2)) {
        if (!nextDrip) nextDrip = t + 2 + Math.random() * 3;
        if (t >= nextDrip) {
          play(Math.random() < 0.5 && buf.drip1 ? 'drip1' : (buf.drip2 ? 'drip2' : 'drip1'),
            { rate: 0.7 + Math.random() * 0.5, level: 0.3 + Math.random() * 0.45, pan: Math.random() * 1.6 - 0.8, wet: 1.2, lp: 5000 });
          nextDrip = t + 2.5 + Math.random() * 6;
        }
      }
      if (crackle && at) {
        const want = fireNear(at, fx) * 0.85 * (1 + 0.8 * (fx ? fx.flare || 0 : 0));
        crackle.g.gain.setTargetAtTime(want, t, 0.25);
      }
    },
    get context() { return ctx; },
    get ready() { return FILES.filter(n => buf[n]).length; },
  };
}
