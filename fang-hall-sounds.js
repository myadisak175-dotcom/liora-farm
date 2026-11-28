/* ==========================================================================
   fang-hall-sounds.js  —  what is heard in the fang hall and its way in from behind the big fall (dungeon.html)

     const heard = createFangSounds({ context: () => sounds.context, volume, hall })    // hall: fang-hall.js' (or its plan
                              alone, { frame, layout }: the game makes these before the room, so the files are on their way)
     heard.air(on)            from her first touch: the fall behind the curtain, and the cave's own water all round; off: they
                              die away (the game: she has gone out of the dungeon)
     heard.volume = v         as loud as the game's air about her is set (its settings' slider)
     heard.drip(x, y, z)      a drop landing in the pool (fang-hall.js' onDrip), from where it lands
     heard.update(dt, cam)    every frame: heard from the camera (its position and quaternion)
     heard.drowned            how much the fall takes of what is heard, 0..1 (music.js goes down by it)

   The fall: the game's own waterfall (assets/audio/ambience/fall-1, fall-2: the village hears its falls with them), two
   voices from the curtain's foot, either side of the middle, round her on headphones (PannerNode, HRTF). On the ledge it
   roars; as she goes in it is quieter (further) and duller (a low-pass closing the deeper the camera is: the rock between),
   in the hall a low rumble through the tunnel. The cave: the boss hall's `cave` loop (water running somewhere under the
   rock, a fall heard through the stone: tools/make-boss-sounds.py), all round, louder in the hall than at the mouth. The
   drops: the boss hall's splashes (drip1, drip2). A stone room's echo under all of it (shorter than the boss hall's: this
   room is smaller), and a limiter on the whole.
   ========================================================================== */
import { MADE } from './boss-hall-sounds.js';

const FILES = { fall1: 'ambience/fall-1.mp3', fall2: 'ambience/fall-2.mp3', cave: 'boss/cave.mp3?v=' + MADE, drip1: 'boss/drip1.mp3?v=' + MADE, drip2: 'boss/drip2.mp3?v=' + MADE };

export function createFangSounds({ context, volume = 1, hall, base = './assets/audio/' } = {}) {
  const Fr = hall.frame, IN = Fr.in, M = Fr.mouth, C = hall.layout.curtain;
  const foot = C.rows[C.rows.length - 1];
  let ctx = null, out = null, send = null, on = false, nodes = null, drowned = 0, vol = Math.min(2, Math.max(0, volume));
  const raw = {}, buf = {};
  for (const [k, f] of Object.entries(FILES)) raw[k] = fetch(base + f).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function echo(c) {
    const sr = c.sampleRate, len = Math.floor(sr * 2.6), ir = c.createBuffer(2, len, sr), pre = Math.floor(sr * 0.02);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr, k = 0.5 - 0.42 * Math.min(1, t / 1.8);
        lp += k * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-t / 0.45);
      }
      for (const [ms, g] of [[9, 0.45], [19, 0.33], [31, 0.26], [46, 0.2]]) {
        const j = Math.floor(sr * (ms + (ch ? 5 : 0)) / 1000);
        if (j < len) d[j] += ch ? -g : g;
      }
    }
    const cv = c.createConvolver(); cv.buffer = ir;
    return cv;
  }
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
      ctx = c; nodes = null;
      out = ctx.createGain(); out.gain.value = vol * 0.9;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -8; lim.knee.value = 4; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.3;
      out.connect(lim); lim.connect(ctx.destination);
      const cv = echo(ctx), wet = ctx.createGain(); wet.gain.value = 0.45;
      send = ctx.createGain(); send.connect(cv); cv.connect(wet); wet.connect(out);
      for (const k of Object.keys(FILES)) delete buf[k];
      const mine = ctx;
      for (const k of Object.keys(FILES)) raw[k].then((ab) => (ab && mine === ctx ? ctx.decodeAudioData(ab.slice(0)) : null))
        .then((b) => { if (b && mine === ctx) { b.span = edges(b); buf[k] = b; } }).catch(() => {});
    }
    return ctx;
  }
  const now = () => ctx.currentTime + 0.02;
  function spot(x, y, z, ref) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1; p.maxDistance = 200;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else if (p.setPosition) p.setPosition(x, y, z);
    return p;
  }
  function loopAt(k, x, y, z, ref, wet, from) {
    const b = buf[k], s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), p = spot(x, y, z, ref), w = ctx.createGain();
    s.buffer = b; s.loop = true; s.loopStart = b.span[0]; s.loopEnd = b.span[1];
    lp.type = 'lowpass'; lp.frequency.value = 12000; lp.Q.value = 0.5;
    g.gain.value = 0; w.gain.value = wet;
    s.connect(lp); lp.connect(g); g.connect(p); p.connect(out); g.connect(w); w.connect(send);
    s.start(now(), b.span[0] + from * (b.span[1] - b.span[0]));
    return { s, lp, g };
  }
  function loopAll(k, wet) {
    const b = buf[k], s = ctx.createBufferSource(), g = ctx.createGain(), w = ctx.createGain();
    s.buffer = b; s.loop = true; s.loopStart = b.span[0]; s.loopEnd = b.span[1];
    g.gain.value = 0; w.gain.value = wet;
    s.connect(g); g.connect(out); g.connect(w); w.connect(send);
    s.start(now(), b.span[0]);
    return { s, g };
  }
  // the fall's voices: at its foot, a little in from it, either side of the middle
  const at = (wv) => [foot[0] + Fr.right[0] * wv + IN[0] * 0.8, M[1] + 1.4, foot[2] + Fr.right[1] * wv + IN[1] * 0.8];
  function start() {
    if (nodes || !buf.fall1 || !buf.fall2 || !buf.cave) return;
    const a = at(-2.6), b = at(2.6);
    nodes = { f1: loopAt('fall1', ...a, 4, 0.25, 0), f2: loopAt('fall2', ...b, 4, 0.25, 0.37), cave: loopAll('cave', 0.35) };
  }
  function rot(q, vx, vy, vz) {
    const tx = 2 * (q.y * vz - q.z * vy), ty = 2 * (q.z * vx - q.x * vz), tz = 2 * (q.x * vy - q.y * vx);
    return [vx + q.w * tx + (q.y * tz - q.z * ty), vy + q.w * ty + (q.z * tx - q.x * tz), vz + q.w * tz + (q.x * ty - q.y * tx)];
  }
  return {
    air(want) {
      on = !!want;
      if (on) { if (ready()) start(); return; }
      if (!nodes || !ctx) return;
      const t = ctx.currentTime, gone = nodes; nodes = null;                // (each loop dies away, then stops)
      for (const v of [gone.f1, gone.f2, gone.cave]) { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.2); try { v.s.stop(t + 1.2); } catch (e) { /* (stopped) */ } }
    },
    get volume() { return vol; },
    set volume(v) {
      v = Math.min(2, Math.max(0, +v || 0));
      if (Math.abs(v - vol) < 1e-3) return;
      vol = v;
      if (out) out.gain.setTargetAtTime(vol * 0.9, ctx.currentTime, 0.1);
    },
    drip(x, y, z) {
      if (!ready() || !ctx.createPanner) return;
      const b = buf[Math.random() < 0.5 ? 'drip1' : 'drip2'];
      if (!b) return;
      const s = ctx.createBufferSource(), g = ctx.createGain(), p = spot(x, y + 0.1, z, 3), w = ctx.createGain();
      s.buffer = b; s.playbackRate.value = 0.9 + Math.random() * 0.25;
      g.gain.value = 0.9; w.gain.value = 0.8;
      s.connect(g); g.connect(p); p.connect(out); g.connect(w); w.connect(send);
      s.start(now());
    },
    get drowned() { return drowned; },
    update(dt, cam) {
      if (!on || !ready()) return;                                          // (the game's AudioContext may come later: her first touch)
      if (!nodes) start();
      const L = ctx.listener, p = cam.position, q = cam.quaternion, f = rot(q, 0, 0, -1), u = rot(q, 0, 1, 0);
      if (L.positionX) {
        L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
        L.forwardX.value = f[0]; L.forwardY.value = f[1]; L.forwardZ.value = f[2];
        L.upX.value = u[0]; L.upY.value = u[1]; L.upZ.value = u[2];
      } else if (L.setPosition) { L.setPosition(p.x, p.y, p.z); L.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]); }
      if (!nodes) return;
      // how far in the camera is: the rock between it and the fall
      const s = (p.x - M[0]) * IN[0] + (p.z - M[2]) * IN[1];
      const cut = clamp(14000 * Math.pow(0.82, Math.max(0, s + 1)), 320, 14000);
      const t = ctx.currentTime;
      for (const v of [nodes.f1, nodes.f2]) {
        v.lp.frequency.setTargetAtTime(cut, t, 0.12);
        v.g.gain.setTargetAtTime(0.85, t, 0.4);
      }
      drowned = clamp(1 - (s + 1) / 16, 0, 1);
      nodes.cave.g.gain.setTargetAtTime(0.18 + 0.5 * clamp((s - 4) / 18, 0, 1), t, 0.5);
    },
  };
}
