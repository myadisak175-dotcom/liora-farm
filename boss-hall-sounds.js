/* ==========================================================================
   boss-hall-sounds.js  —  the boss hall's own sounds: the user's earshot renders made heavy and dark for the hall
   (tools/make-boss-sounds.py → assets/audio/boss/*.mp3), each from where it is in the hall, in a stone hall's echo

     const heard = createBossSounds({ context: () => sounds.context, volume, hall: hall.layout })
     heard.hum()           the door's runes waking (a magic portal's swell, slow and low)           } all four from
     heard.clunk()         its bar giving way (a dungeon door's iron latch)                         } the door
     heard.rumble(s)       the leaves grinding open, s seconds (a giant stone door); heard.thud() } itself
     heard.ignite(fires, k, n)  the k-th of n beats of the fires catching as the door opens (fires: those catching on it):
                           the beat, a deep thud, all round and the same each time (the last a little harder), and each
                           fire's flame catching from where it is ("อยากได้เสียงไฟลุกเป็นจังหวะ"; earshot's gas flame)
     heard.whoosh(pan, g, f)  a fire catching by itself: พรึ่บ! from fire f (of hall.fires; without f: pan -1 left .. 1
                           right, g how near): all at once, a thump and the flame, no whoosh
     heard.boom()          the circle under her feet waking, the fires turning red: low, echoing, of stone (a heavy hit, the
                           hall's stone groaning, the mountain rumbling, a moan from the deep), and stones falling round the
                           dome, each from where it falls
     heard.shing(i)        a statue opening its eyes (i: its order), from its eyes: a deep thud and a dark ring of steel,
                           each a little lower; with the first, a low brass swell under them all (earshot's braam)
     heard.air(on)         the hall's air, always (from her first touch): the cave all round (water running somewhere under
                           the rock, a waterfall heard through the stone), its mass (a deep pressure), its draft from the
                           oculus above and the fallen tunnel behind the door; now and then water dripping into pools,
                           small stones falling far off, a stone knocking, the stone groaning, each from a place of its own
                           round her; and every lit fire near her crackling where it burns
     heard.dread(on)       once the statues are awake: a dark living drone (a whale's call, very slow) and a heart under it
     heard.update(dt, at, fx, cam)  every frame; at: where she is; fx: the hall's (which fires are lit, their flare);
                           cam: the camera, which is where the hall is heard from (its position and quaternion)

   Heard from the camera: each placed sound goes through a PannerNode (HRTF: on headphones it is round her, above her,
   behind her; on a phone's speakers left and right), quieter the farther it is, while what it sends into the hall's echo
   is not (so a far sound is mostly echo: that is what tells the ear it is far). The echo: a convolver, a 4.6 s tail of
   noise darker as it dies away, after a few early answers off the near walls. Last, a limiter on the whole.

   The files are fetched as soon as this is made and made ready to play once there is a context (her first touch makes
   it). A single sound asked for before its file is ready (or whose file did not come) is made on the spot instead, as
   the hall had them first (WebAudio: hum, clunk ...); { made: true } (the page's ?sfx=old) makes every one so, and none of
   the placed ones.
   ========================================================================== */
const ONCE = ['hum', 'clunk', 'grind', 'thud', 'fire', 'beat', 'ignite', 'boom', 'eye', 'braam', 'heart', 'drip1', 'drip2', 'pebbles1', 'pebbles2', 'knock', 'groan'];
const LOOPS = ['air', 'room', 'cave', 'crackle', 'drone'];
const FILES = [...ONCE, ...LOOPS];
const DOOR = [0, 4.5, 22];            // where the door's sounds come from (its middle, a man's height and more up)
export const MADE = 8;                // raised whenever tools/make-boss-sounds.py makes the files again (phones keep the old;
                                      // the page asks for her steps on stone, boss/step-N.mp3, with it too)

export function createBossSounds({ context, volume = 1, hall = null, fires = null, made = false, base = './assets/audio/boss/' } = {}) {
  const FIRES = fires || (hall && hall.fires) || [], STATUES = (hall && hall.statues) || [];
  const OC = hall && hall.oculus ? [hall.oculus.c[0], hall.oculus.y - 3, hall.oculus.c[1]] : [0, 28, -36];
  const ROUND = hall && hall.circle ? hall.circle.c : [0, -36];
  let ctx = null, out = null, send = null, white = null, brown = null;
  let airNodes = null, dreadNodes = null, heartOn = false, nextBeat = 0, airWanted = false;
  const voices = new Map();                         // a lit fire near her: its crackle
  const next = { drip: 0, stone: 0, groan: 0 };
  const ear = { x: 0, y: 1.6, z: 30 };
  const raw = {}, buf = {};
  if (!made) for (const n of FILES) raw[n] = fetch(base + n + '.mp3?v=' + MADE).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);

  function noise(c, seconds, kind) {
    const n = Math.floor(c.sampleRate * seconds), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  // the hall's echo: noise dying away over 4.6 s, a one-pole low-pass closing on it as it dies (stone and air keep the
  // low longest), after a few early answers off the nearer walls; the two sides apart
  function hallEcho(c) {
    const sr = c.sampleRate, len = Math.floor(sr * 4.6), ir = c.createBuffer(2, len, sr), pre = Math.floor(sr * 0.03);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr, k = 0.55 - 0.48 * Math.min(1, t / 3.0);
        lp += k * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-t / 0.66);
      }
      for (const [ms, g] of [[11, 0.5], [23, 0.38], [37, 0.3], [52, 0.25], [74, 0.2], [97, 0.14]]) {
        const j = Math.floor(sr * (ms + (ch ? 6 : 0)) / 1000);
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
      // all of it through one gain, then a limiter (so the boom and the stones falling with it never clip together)
      out = ctx.createGain(); out.gain.value = Math.min(2, Math.max(0, volume)) * 0.9;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -8; lim.knee.value = 4; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.3;
      out.connect(lim); lim.connect(ctx.destination);
      const echo = hallEcho(ctx), wet = ctx.createGain(); wet.gain.value = 0.5;
      send = ctx.createGain(); send.gain.value = 1;
      send.connect(echo); echo.connect(wet); wet.connect(out);
      white = noise(ctx, 2, 'white'); brown = noise(ctx, 4, 'brown');
      airNodes = null; dreadNodes = null; voices.clear();
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
  const rnd = (a, b) => a + Math.random() * (b - a);
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
  // ---- a place in the hall, heard from the camera
  function setXYZ(node, pre, x, y, z) {             // an AudioParam triple (positionX ...), or the older setPosition
    if (node[pre + 'X']) { node[pre + 'X'].value = x; node[pre + 'Y'].value = y; node[pre + 'Z'].value = z; return true; }
    return false;
  }
  function spot(x, y, z, ref = 3, model = 'HRTF') {
    const p = ctx.createPanner();
    p.panningModel = model; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1; p.maxDistance = 200;
    if (!setXYZ(p, 'position', x, y, z) && p.setPosition) p.setPosition(x, y, z);
    return p;
  }
  function rot(q, vx, vy, vz) {                     // a vector turned by a quaternion
    const tx = 2 * (q.y * vz - q.z * vy), ty = 2 * (q.z * vx - q.x * vz), tz = 2 * (q.x * vy - q.y * vx);
    return [vx + q.w * tx + (q.y * tz - q.z * ty), vy + q.w * ty + (q.z * tx - q.x * tz), vz + q.w * tz + (q.x * ty - q.y * tx)];
  }
  function hearFrom(cam, at) {
    const L = ctx.listener, p = cam ? cam.position : { x: at.x, y: (at.y || 0) + 1.6, z: at.z };
    const q = cam ? cam.quaternion : { x: 0, y: 0, z: 0, w: 1 };
    const f = rot(q, 0, 0, -1), u = rot(q, 0, 1, 0);
    ear.x = p.x; ear.y = p.y; ear.z = p.z;
    if (L.positionX) {                              // (plain values: an automation a frame would pile up)
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f[0]; L.forwardY.value = f[1]; L.forwardZ.value = f[2];
      L.upX.value = u[0]; L.upY.value = u[1]; L.upZ.value = u[2];
    } else if (L.setPosition) { L.setPosition(p.x, p.y, p.z); L.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]); }
  }
  // the hall's floor (the vestibule, the nave, the round hall): where water may drip and a stone fall
  function inside(x, z) {
    return (Math.abs(x) < 6 && z > 21 && z < 38.5) || (Math.abs(x) < 9.6 && z > -15 && z <= 21.5)
      || Math.hypot(x - ROUND[0], z - ROUND[1]) < 20.5;
  }
  function somewhere(rmin, rmax) {                  // a place on the floor rmin..rmax m from her ear
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(rmin, rmax), x = ear.x + Math.cos(a) * r, z = ear.z + Math.sin(a) * r;
      if (inside(x, z)) return [x, z];
    }
    return null;
  }

  // ---- a file played: once (from a place, or all round), or round and round
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
  function playAt(n, x, y, z, { rate = 1, level = 1, ref = 3, wet = 0.6, lp = 0, at = 0 } = {}) {
    const b = buf[n];
    if (!b || !ctx.createPanner) return null;
    const s = src(b, false, rate), g = gain(level), p = spot(x, y, z, ref), w = gain(wet);
    let last = s;
    if (lp) { const f = filt('lowpass', lp); s.connect(f); last = f; }
    last.connect(g); g.connect(p); p.connect(out);
    g.connect(w); w.connect(send);                  // the echo is the hall's, as loud wherever the sound is
    s.start(at || now());
    return { s, p };
  }
  function loop(n, wet) {
    const b = buf[n], s = src(b, true), g = gain(0);
    s.loopStart = b.span[0]; s.loopEnd = b.span[1];
    chain([s, g], wet);
    s.start(now(), b.span[0]);
    return { s, g };
  }
  function loopAt(n, x, y, z, ref, wet, lp, from, model) {
    const b = buf[n], s = src(b, true), g = gain(0), p = spot(x, y, z, ref, model), w = gain(wet);
    s.loopStart = b.span[0]; s.loopEnd = b.span[1];
    let last = s;
    if (lp) { const f = filt('lowpass', lp); s.connect(f); last = f; }
    last.connect(g); g.connect(p); p.connect(out); g.connect(w); w.connect(send);
    s.start(now(), b.span[0] + (from || 0) * (b.span[1] - b.span[0]));
    return { s, g };
  }
  function fadeTo(g, v, secs) { const t = now(); g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + secs); }
  const placed = () => !made && !!(ctx && ctx.createPanner);

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
    return { stop: at => { n.stop(at); l.stop(at); }, gs: [g] };
  }
  function madeDrone() {
    const t = now(), lp = filt('lowpass', 240, 1.5), g = gain();
    const os = [osc('sawtooth', 55), osc('sawtooth', 55.6), osc('sine', 27.5)];
    for (const o of os) { o.connect(lp); o.start(t); }
    chain([lp, g], 0.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.075, t + 2.5);
    return { stop: at => os.forEach(o => o.stop(at)), gs: [g] };
  }
  function madeBeat(t, k) {
    const o = osc('sine', 58), g = gain();
    o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    chain([o, g], 0.25); env(g.gain, t, 0.008, 0.5 * k, 0.02, 0.2); o.start(t); o.stop(t + 0.35);
  }

  // ---- what the page asks for
  function atDoor(n, opts) { return placed() ? playAt(n, DOOR[0], DOOR[1], DOOR[2], { ref: 7, ...opts }) : play(n, opts); }
  function hum() { if (!ready()) return; if (!atDoor('hum', { level: 1.1, wet: 0.6 })) madeHum(); }
  function clunk() { if (!ready()) return; if (!atDoor('clunk', { level: 1.2, wet: 0.7 })) madeClunk(); }
  function rumble(seconds = 3) {
    if (!ready()) return;
    const b = buf.grind;
    if (!b) return madeRumble(seconds);
    atDoor('grind', { rate: clamp(b.duration / seconds, 0.85, 1.15), level: 1.5, wet: 0.7 });
  }
  function thud() { if (!ready()) return; if (!atDoor('thud', { level: 1.3, wet: 1.0 })) madeThud(); }
  function whoosh(pan = 0, near = 1, f = null) {
    if (!ready()) return;
    const k = clamp(near, 0.12, 1), m = Math.max(0.25, k);        // (a far fire is still heard catching: darker, not lost)
    if (f && placed() && buf.fire) {
      const d = Math.hypot(f.x - ear.x, f.y - ear.y, f.z - ear.z);
      playAt('fire', f.x, f.y + 0.8, f.z, { rate: rnd(0.93, 1.07), level: 2.2, ref: 4, wet: 0.5, lp: 1800 + 6200 * clamp(1 - d / 45, 0, 1) });
      return;
    }
    if (!play('fire', { rate: rnd(0.93, 1.07), level: 1.25 * m, pan, wet: 0.45, lp: 1800 + 6200 * m })) madeWhoosh(clamp(pan, -1, 1), k);
  }
  function ignite(group, k = 0, n = 1) {
    if (!ready()) return;
    if (!placed() || !buf.ignite || !buf.beat) {            // (as before: each fire's own burst)
      for (const f of group) whoosh(clamp(f.x / 6, -1, 1), 1.4 / (1 + Math.hypot(f.x - ear.x, f.z - ear.z) * 0.08), f);
      return;
    }
    play('beat', { level: k === n - 1 ? 1.35 : 1.0, wet: 0.7 });
    for (const f of group) {
      const d = Math.hypot(f.x - ear.x, f.y - ear.y, f.z - ear.z);
      playAt('ignite', f.x, f.y + 0.8, f.z, { rate: rnd(0.95, 1.05), level: 2.0, ref: 4, wet: 0.5, lp: 1800 + 6200 * clamp(1 - d / 45, 0, 1) });
    }
  }
  function boom() {
    if (!ready()) return;
    if (!play('boom', { level: 1.0, wet: 1.2 })) return madeBoom();
    if (!placed()) return;
    // stones and dust falling round the dome, each from where it falls
    const t = now();
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(12, 19), n = ['pebbles1', 'pebbles2', 'knock', 'pebbles1', 'pebbles2', 'knock'][i];
      playAt(n, ROUND[0] + Math.cos(a) * r, rnd(6, 22), ROUND[1] + Math.sin(a) * r,
        { at: t + 0.45 + i * 0.42 + Math.random() * 0.25, rate: rnd(0.65, 0.95), level: rnd(1.0, 1.5), ref: 7, wet: 0.9, lp: 3000 });
    }
  }
  function shing(i = 0) {
    if (!ready()) return;
    if (i === 0 && placed() && buf.braam) play('braam', { level: 0.9, wet: 0.9 });
    const s = STATUES.find(v => v.order === i);
    if (s && s.eyes && placed() && buf.eye) {
      const e = s.eyes, x = (e[0][0] + e[1][0]) / 2, y = (e[0][1] + e[1][1]) / 2, z = (e[0][2] + e[1][2]) / 2;
      playAt('eye', x, y, z, { rate: Math.pow(0.955, i), level: 2.4, ref: 8, wet: 1.0 });
      return;
    }
    if (!play('eye', { rate: Math.pow(0.955, i), level: 1.2, wet: 0.9 })) madeShing(i);
  }

  function air(on) {
    airWanted = on;
    if (!ready()) return;
    if (!on && airNodes) {
      const t = now(), a = airNodes; airNodes = null;
      for (const g of a.gs) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 1); }
      a.stop(t + 1.1);
    }
    startLoops();
  }
  function dread(on) {
    heartOn = on;
    if (!ready()) return;
    if (!on && dreadNodes) {
      const t = now(), d = dreadNodes; dreadNodes = null;
      for (const g of d.gs) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 1.2); }
      d.stop(t + 1.3);
    }
    if (on && !dreadNodes) nextBeat = now() + 0.6;
    startLoops();
  }
  // the loops wanted, once their files are ready (made on the spot, as before, if they did not come or with ?sfx=old)
  function startLoops() {
    const gone = n => made || !raw[n];
    if (airWanted && !airNodes) {
      if (buf.air && buf.room && buf.cave && placed()) {
        const room = loop('room', 0), cave = loop('cave', 0.25), up = loopAt('air', OC[0], OC[1], OC[2], 9, 0.25, 0, 0),
          back = loopAt('air', 0, 3, 41, 6, 0.2, 900, 0.5);
        fadeTo(room.g, 0.9, 3); fadeTo(cave.g, 1.0, 3); fadeTo(up.g, 1.0, 3); fadeTo(back.g, 0.8, 3);
        airNodes = { gs: [room.g, cave.g, up.g, back.g], stop: at => [room, cave, up, back].forEach(l => l.s.stop(at)) };
        const t = ctx.currentTime;
        next.drip = t + rnd(1, 3); next.stone = t + rnd(5, 12); next.groan = t + rnd(18, 35);
      } else if (buf.air && (made || !ctx.createPanner)) {
        const l = loop('air', 0.3); fadeTo(l.g, 0.8, 3); airNodes = { gs: [l.g], stop: at => l.s.stop(at) };
      } else if (gone('air')) airNodes = madeAir();
    }
    if (heartOn && !dreadNodes) {
      if (buf.drone) { const l = loop('drone', 0.35); fadeTo(l.g, 0.85, 2.5); dreadNodes = { gs: [l.g], stop: at => l.s.stop(at) }; }
      else if (gone('drone')) dreadNodes = madeDrone();
    }
  }
  // every lit fire within 16 m of her ear crackles where it burns (started and stopped as she comes and goes, or as it is
  // put out: the page's 🚪 shuts the door and puts the fires out); equal-power panning, cheaper than HRTF for so many
  function tendFires(fx) {
    if (!buf.crackle || !placed() || !airWanted) return;
    const t = ctx.currentTime, flare = fx ? fx.flare || 0 : 0;
    FIRES.forEach((f, i) => {
      const lit = f.kind === 'door' ? 1 : clamp((f.z - (fx ? fx.front : 999)) / 1.5 + 0.5, 0, 1);
      const d = Math.hypot(f.x - ear.x, f.y - ear.y, f.z - ear.z), v = voices.get(i);
      if (lit > 0.01 && d < 16) {
        const want = lit * 0.7 * (1 + 0.8 * flare);
        if (!v) {
          const l = loopAt('crackle', f.x, f.y + 0.6, f.z, 2.2, 0.22, 0, Math.random(), 'equalpower');
          l.g.gain.setTargetAtTime(want, t, 0.3); l.want = want;
          voices.set(i, l);
        } else if (Math.abs(want - v.want) > 0.03) { v.g.gain.setTargetAtTime(want, t, 0.25); v.want = want; }
      } else if (v && (lit <= 0.01 || d > 18)) {
        v.g.gain.setTargetAtTime(0, t, 0.15); v.s.stop(t + 0.8); voices.delete(i);
      }
    });
  }
  // the hall's own noises now and then, each from a place of its own round her ear
  function nowAndThen() {
    if (!airNodes || !placed()) return;
    const t = ctx.currentTime;
    if (t >= next.drip && (buf.drip1 || buf.drip2)) {
      const p = somewhere(3, 24);
      if (p) playAt(Math.random() < 0.5 && buf.drip1 ? 'drip1' : (buf.drip2 ? 'drip2' : 'drip1'), p[0], 0.1, p[1],
        { rate: rnd(0.8, 1.05), level: rnd(0.9, 1.6), ref: 2.5, wet: 0.65, lp: 5000 });   // (a splash: its echo does not whistle)
      next.drip = t + rnd(1.5, 4.5);
    }
    if (t >= next.stone && buf.pebbles1 && buf.pebbles2 && buf.knock) {
      const p = somewhere(16, 40);
      if (p) playAt(['pebbles1', 'pebbles2', 'knock'][Math.floor(Math.random() * 3)], p[0], rnd(4, 16), p[1],
        { rate: rnd(0.6, 0.9), level: rnd(0.8, 1.4), ref: 5, wet: 1.0, lp: 2200 });
      next.stone = t + rnd(9, 22);
    }
    if (t >= next.groan && buf.groan) {
      const p = somewhere(25, 50);
      if (p) playAt('groan', p[0], 0, p[1], { rate: rnd(0.85, 1.05), level: 1.4, ref: 8, wet: 1.2, lp: 900 });
      next.groan = t + rnd(30, 60);
    }
  }

  return {
    hum, clunk, rumble, thud, whoosh, ignite, boom, shing, air, dread,
    update(dt, at, fx, cam) {
      if (!ctx || !ready()) return;
      if (placed() && (cam || at)) hearFrom(cam, at);
      startLoops();
      const t = ctx.currentTime;
      if (heartOn && dreadNodes) {
        if (nextBeat < t - 0.1) nextBeat = t + 0.1;       // (after the page was away: not every beat missed at once)
        while (nextBeat < t + 0.3) {
          if (!play('heart', { at: nextBeat, level: 0.9, wet: 0.3 })) { madeBeat(nextBeat, 1); madeBeat(nextBeat + 0.27, 0.7); }
          nextBeat += 1.18;
        }
      }
      tendFires(fx);
      nowAndThen();
    },
    get context() { return ctx; },
    get ready() { return FILES.filter(n => buf[n]).length; },
    get playing() { return { fires: voices.size, air: !!airNodes, dread: !!dreadNodes }; },
  };
}
