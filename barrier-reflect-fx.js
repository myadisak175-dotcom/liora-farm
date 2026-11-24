/* ==========================================================================
   barrier-reflect-fx.js  —  what the barrier that throws a blow back looks like (barrier-reflect.js says when): the clip
   it was asked after (24 Nov 2026, ten seconds: a girl in a meadow under a dome of light; a bolt of light strikes it, the
   dome turns deep blue and lightning runs all through it, then it bursts, throwing the blow back, its glass flying off
   over a disc of light on the ground; sparkles hang, and the dome stands up again). "สกิลบาเรียอยากได้เอฟเฟคประมาณนี้ค่ะ
   เหมือนเป็นโล่อะ เคลื่อนที่ได้ แล้วก็มี reflection ตอนบาเรียโดนโจมตี แล้วก็แตกด้วย ... เอฟเฟคขอแบบในวีดีโอเลยนะคะ": the
   clip's own look, on a shield that goes where she goes. Then, the same day, of the first try: "เอฟเฟคแข็งมาก ไม่นุ่มแบบ
   anime เลย แล้วก็อนิเมชั่นมันช้าไปอะ อยากได้แบบเกม action rpg": so its light is soft (a white heart in a wide glow, as
   the clip's has, which a picture over the whole screen gives it there and this cannot have on a phone), and it all goes
   at an action game's pace: up with a pop, struck, thrown back and broken inside half a second. And of the second try:
   "ทำเอฟเฟคตอนโดน สะท้อน ให้ใกล้เคียง ref หน่อยได้ไหมคะ": so the blow and the burst are the clip's shapes again, drawn
   crisp, each in a glow (the clip's are: anime's light is sharp shapes that glow, not blurs), at that pace still. Then:
   "เอฟเฟคตอนที่บาเรียกำลังจะแตกอะ ไม่เหมือน ลายสายฟ้าไม่เหมือน": so its lightning as it charges is the clip's: bolts
   straight out from where it was struck, kinked sharply, not lines wandering round it like hair. And of the pieces
   flying off it: "ตัวชิ้นส่วนที่แตกออกไม่สวยเลย": so they are the clip's flat flakes, not cut facets.
   One job: draw it. It decides nothing.

     const fx = createReflectBarrierFx({ heightAt })    heightAt(x, z): the ground's height (the disc lies on it)
     scene.add(fx.object)                     (a page that dims its land by night draws this after the dimming)
     fx.raise(center, size, feet)             the dome pops up round `center` (the middle of its ball); a ring of light
                                              runs out over the ground at `feet`
     fx.place(center, size, ground)           every frame, where it is now (ground: the height of the ground under it)
     fx.strike(point, from)                   a blow lands on it at `point`, come from `from` (both in the world): the
                                              flash, a ring of light, needles, lightning; it turns deep blue and the
                                              lightning runs through it by itself. A second blow while it is so: a
                                              smaller flash (absorbed)
     fx.reflect(targets)                      it bursts, throwing the blow back at each of `targets` (places) -> where it
                                              was struck (the thrown-back blow leaves from there)
     fx.fade()                                it goes without a blow (its time is up)
     fx.drop()                                gone at once (what is flying goes on)
     fx.bolts(list)                           the bolts in flight this frame: [{ head, way, kind, len, wide, seed }]
                                              (kind 0: a blow coming, the clip's; 1: one thrown back)
     fx.impact(at, from, size)                a bolt lands on something: a flash, needles, a little lightning, bits
     every frame: fx.update(dt, camera)       fx.busy: something is still drawn
     fx.setView(heightPx)                     the picture's height in pixels (how big the dome is on it)
     fx.setNight(on)                          by night its light shines more
     fx.dispose()
   (size: her height / 1.75 m)

   WHAT IS TAKEN FROM THE CLIP (REFLECT_FX: its numbers, at 1.75 m; seconds from the blow)
     - the dome: a ball a little bigger than she is tall, its middle a third of its radius over her feet, as clear as
       glass with a sky-blue tint and a bright edge; round it, bundles of thin lines of light (a white heart, cyan beside
       it, fanning out and drawn in again) going round it in waves (REFLECT_LOOK; the colours read off the clip's frames)
     - the blow: where it lands, at once a white heart in a crown of rays; then a ball of blue thrown out round it, lit
       at its rim as glass is, as the heart is drawn in to a point; needles of light all round it (white, thick, thinning
       to their tails); a few dark bits of glass; a long thin line of light across the picture through it; a line of light
       back the way it came; white lightning leaping off
     - the dome deep blue (the world behind her blue through it, she as she is), darker at its edge, its glow gone; from
       a star of light where the blow went in, lightning straight out every way across it: each bolt short straight
       pieces kinked sharply about its way, forking now and then, thinning to its tip, a white heart in a blue glow,
       flickering (the same bolts, about, their zigzags new); purple lightning round the star, kinked as lightning is
     - it bursts: the dome is gone at once; a ball of light swells out between where it was struck and her (round her
       hand, in the clip): white at first, its edge spiked like ice; then sky-blue glass, white at its heart with rays out
       of it, petals of deep blue between them, wide at its rim; it clears from its middle out to its bright spiked rim,
       and that goes. A long line of light across the picture through it and a short one up and down; a long line back
       the way the blow came (the blow thrown back, barrier-reflect.js); purple lightning out of it; its glass flying off
       as dark flakes with smooth edges (fangs drawn out to a point, then pebbles), across the picture; a disc of light thrown out over the ground (a broad white rim, a pale band, sky
       blue with blots of deep blue, purple lightning) with dust over its edge; dashes of light flung out of the ball as
       it clears, that hang as sparkles
     - standing up: clear, sparkles in it, a purple glow at its foot, the lines of light coming last
   What is not the clip's, for the action game's pace: the beats a quarter as long (the clip takes 1.8 s from the blow to
   the burst, here 0.4); the dome pops up as it is raised (smaller, past its size, back) with a ring of light over the
   ground; it swells and trembles as it charges; a glow round its edge. The page stops the world for an instant and
   shakes the camera at the blow, and at the burst once the ball is big and white (barrier-reflect.html).

   HOW IT IS DRAWN (as her other spells are: blink-fx.js, magic-combo-fx.js). Light laid over the picture with one blend
   (what a thing covers hides what is behind it, its glow only adds); every material see-through, writing no depth,
   marked userData.noGrade (the light of the hour and the curse leave it alone); the whole a Group whose renderOrder is
   100 (README, "Over water"). Sharp shapes in a glow: each shape's edge drawn crisp to the pixel (its shader's own
   fwidth()), its glow falling off round it (exp()); the dome's lines a thin white heart in a wide glow (their picture
   read twice: as it is, and from a smaller copy of itself the graphics chip makes (a mipmap, read at a set size:
   textureLod), which is the same lines blurred).
     - the dome: a ball drawn twice (its far wall, then its near one), everything on it worked out by its shader from
       where on the ball it is: the glass, the lines of light, the ripples, the lightning (a picture of cracks laid round
       the place it was struck); a glow round its edge (a square turned to the eye). 3 draws
     - the pictures: drawn once as the page opens, on canvases, the same each time (a seeded random)
     - the ring as it is raised, the disc, the dust: one shape each; the shards: one shape, instanced; the needles,
       dashes, sparkles, puffs: one square each, instanced, their whole way worked out by the shader from where and when
       they began; the lightning: one strip through all of it, its points made anew as it flickers; flashes, the burst,
       the long lines of light: a square each turned to the eye (a line's drawn out); the bolts: one square each,
       instanced
   At most some 15 draws while it bursts, 3 to 5 while it stands, none when nothing is.
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';

const NOISE = _internal.NOISE;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const outBack = (t, k = 2.2) => { t = clamp(t, 0, 1) - 1; return 1 + (k + 1) * t * t * t + k * t * t; };      // past 1 and back
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// the colours (read off the clip's frames)
export const REFLECT_LOOK = {
  core: '#f6ffff',          // the white heart of every light
  stream: '#7cf2ff',        // the lines of light, the needles
  crack: '#6fb4ff',         // the lightning's blue
  purple: '#c08cff',        // the purple lightning
  rim: '#fbfdfb', pale: '#b8f6fb', aqua: '#86def5', blot: '#5a8fe0', navy: '#2b4f9e',      // the disc
  dust: '#c2c5cf',
};

// what is drawn and for how long (s; m at 1.75 m)
//   dome:    r its radius; lift: its middle over her feet, of r; flow: how fast its lines go round (turns a second)
//   form:    s it takes to pop up (from `from` of its size, past it and back); lines: when its lines of light come (of
//            that); white: s its flash takes to go; sparkles thrown out of it as it pops up
//   ring:    the ring of light over the ground as it is raised (life; r: as far as it goes, of the dome's radius)
//   fade:    s it takes to go without a blow
//   strike:  the blow (s from it): flash (its life), needles (how many), bits (dark bits of glass off it), bolts (white
//            lightning off it: when, how long), dim (its lines go, from .. to), white (s the dome's own flash takes to go)
//   charge:  at: the cracks begin; spread: s they take to run all through it; rise: s it takes to go deep blue; flick: s
//            each look of the lightning lasts; purple: from when purple lightning plays round the star; swell: how much
//            bigger it grows as it charges, of its size
//   burst:   the ball of light where it was struck, the dome gone at once (life; size: m, its square's half; from: how
//            far it is from there to her, of the way; drift: how much further it goes as it swells)
//   flare:   the long line of light across the picture through the blow and through the burst: [life, m thick (its
//            square's half), how many times that long]
//   shards:  its glass flying off, dark flakes: fangs (at, how many, speed m/s out, up, life, half-width m), then pebbles
//            (from pebbleAt, how many, half-width m)
//   flash:   purple lightning out of the burst (at, how many, life, len m)
//   disc:    at, life, r0 .. r1 (m), hole (its middle going, from .. to, of its life), lift (over the ground: over the
//            grass), drop (it comes down so far onto that in its first `fall` s)
//   dust:    the ring of dust over its edge (at, life, its height m)
//   dashes:  flung up and out (at, how many, speed, life); sparkles left hanging (how many, life)
//   crackles: little lightning on the ground after (from, to, every s, len m)
//   puffs:   dust at the disc's edge (at, how many)
//   near:    close before the camera what is drawn would fill the picture: gone nearer than `none` m, whole from `whole`
export const REFLECT_FX = {
  dome: { r: 1.55, lift: 0.37, flow: 0.055 },
  form: { time: 0.34, from: 0.22, lines: [0.3, 1.0], white: 0.32, sparkles: 34 },
  ring: { life: 0.42, r: 1.45 },
  fade: 0.32,
  strike: { flash: 0.34, needles: 90, bits: 7, bolts: 3, boltAt: 0.05, boltLife: 0.2, dim: [0.06, 0.16], white: 0.05 },
  charge: { at: 0.1, spread: 0.07, rise: 0.08, flick: 0.06, purple: 0.13, swell: 0.05 },
  burst: { life: 0.6, size: 2.0, from: 0.2, drift: 0.15 },
  flare: { hit: [0.3, 0.3, 9], burst: [0.3, 0.36, 12] },
  shards: { at: 0.07, fangs: 7, speed: [2.4, 4.6], up: [0.4, 1.6], life: [0.4, 0.7], fang: [0.04, 0.06], pebbleAt: 0.2, pebbles: 22, pebble: [0.03, 0.055] },
  flash: { at: 0.06, n: 7, life: 0.34, len: [0.9, 1.8] },
  disc: { at: 0.03, life: 1.05, r0: 0.6, r1: 4.4, hole: [0.6, 0.97], lift: 0.3, drop: 0.2, fall: 0.12 },
  dust: { at: 0.06, life: 0.62, h: 0.5 },
  dashes: { at: 0.14, n: 90, speed: [2.5, 7.5], life: [0.45, 0.85], sparkles: 70, sparkleLife: [0.8, 1.4] },
  crackles: { from: 0.1, to: 0.85, every: 0.05, len: [0.35, 0.8] },
  puffs: { at: 0.22, n: 8 },
  near: { none: 0.6, whole: 1.6 },
};

const BLEND = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation };
const SPARKS = 640, SHARDS = 64, BOLTS = 8, LIGHTS = 26, LIGHT_PTS = 12, SPRITES = 8;

// ---------------------------------------------------------------------------------------------------------------------
// the pictures: drawn once, on canvases (each colour of a canvas a picture of its own: drawn with 'lighter', so they
// add up and do not mix). Thin lines only: their glow is the chip's smaller copies of them (mipmaps), read in the shader
function makePictures(seed) {
  const sheet = (w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    return [c, g];
  };
  const texture = (c, wrap) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;                 // (numbers, not colours)
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  const CH = ['255,0,0', '0,255,0', '0,0,255'];
  // a line of light in one colour of the canvas: a little soft at its edge, its bright heart (k: how bright)
  function line(g, pts, ch, w, k, dx = 0, cap = 'round') {
    if (k <= 0.004) return;
    g.lineCap = cap;
    for (const [ww, aa] of [[w * 2.2, 0.22], [w, 1.0]]) {
      g.strokeStyle = `rgba(${CH[ch]},${Math.min(1, aa * k)})`; g.lineWidth = ww;
      g.beginPath();
      for (let i = 0; i < pts.length; i++) (i ? g.lineTo(pts[i][0] + dx, pts[i][1]) : g.moveTo(pts[i][0] + dx, pts[i][1]));
      g.stroke();
    }
  }

  // ---- the lines of light round the dome: x round it (0 .. 2π), y up it (the canvas' top its top, π/2; its foot -π/2).
  // Red one set, green another (read moving two ways), blue the purple glow at its foot
  const SW = 2048, SH = 1024;
  const [sc, sg] = sheet(SW, SH);
  const X = lam => lam / (2 * Math.PI) * SW, Y = beta => (0.5 - beta / Math.PI) * SH;
  const r1 = seeded(seed * 7 + 1);
  for (const [ch, count, lo, hi] of [[0, 4, -0.26, 0.82], [1, 3, -0.18, 0.76], [0, 1, -0.95, -0.5], [1, 1, -0.85, -0.45]]) {
    for (let i = 0; i < count; i++) {
      const b0 = lo + (hi - lo) * ((i + 0.15 + r1() * 0.7) / count);
      const span = (0.8 + 0.85 * r1()) * Math.PI, start = r1() * 2 * Math.PI;
      const a1 = 0.12 + 0.17 * r1(), p1 = r1() * 6.283, a2 = 0.03 + 0.05 * r1(), k2 = 3 + Math.floor(r1() * 3), p2 = r1() * 6.283;
      const k3 = 2 + Math.floor(r1() * 3), p3 = r1() * 6.283;
      const lines = 3 + Math.floor(r1() * 4), gap = 0.012 + 0.014 * r1(), heart = Math.floor(r1() * lines);
      const steps = Math.ceil(span / (2 * Math.PI) * 260), PIECES = 12;
      const ks = Array.from({ length: lines }, (_, j) => (j === heart ? 1 : 0.32 + 0.36 * r1()));
      for (let j = 0; j < lines; j++) {
        const w = j === heart ? 3.0 : 1.3;
        for (let p = 0; p < PIECES; p++) {
          const pts = [];
          const s0 = Math.round(p * steps / PIECES), s1 = Math.round((p + 1) * steps / PIECES);
          for (let s = s0; s <= s1; s++) {
            const t = s / steps;
            const lam = start + t * span;
            const taper = Math.min(1, t / 0.2, (1 - t) / 0.2);
            const spread = (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(k3 * lam + p3))) * (0.2 + 0.8 * taper);
            const beta = b0 + a1 * Math.sin(lam + p1) + a2 * Math.sin(k2 * lam + p2) + (j - (lines - 1) / 2) * gap * spread * 2;
            pts.push([X(lam), Y(beta)]);
          }
          const tm = (p + 0.5) / PIECES, k = ks[j] * clamp(Math.min(tm / 0.2, (1 - tm) / 0.2), 0, 1) * (b0 < -0.4 ? 0.6 : 1);
          for (const dx of [-SW, 0, SW]) line(sg, pts, ch, w, k, dx, 'butt');
        }
      }
    }
  }
  // the purple glow at its foot: soft patches, a few streaks up out of them (the clip's, as it stands up again)
  for (let i = 0; i < 18; i++) {
    const lam = r1() * 2 * Math.PI, beta = -0.3 + 0.36 * r1();
    const rx = (0.16 + 0.3 * r1()) / (2 * Math.PI) * SW, ry = (0.07 + 0.12 * r1()) / Math.PI * SH;
    for (const dx of [-SW, 0, SW]) {
      sg.save(); sg.translate(X(lam) + dx, Y(beta)); sg.scale(rx, ry);
      const gr = sg.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, 'rgba(0,0,255,0.5)'); gr.addColorStop(0.6, 'rgba(0,0,255,0.2)'); gr.addColorStop(1, 'rgba(0,0,255,0)');
      sg.fillStyle = gr; sg.beginPath(); sg.arc(0, 0, 1, 0, 2 * Math.PI); sg.fill(); sg.restore();
    }
  }
  for (let i = 0; i < 26; i++) {
    const lam = r1() * 2 * Math.PI, b = -0.34 + 0.2 * r1(), up = 0.1 + 0.22 * r1();
    const pts = [[X(lam), Y(b)], [X(lam + 0.01 * (r1() - 0.5)), Y(b + up)]];
    for (const dx of [-SW, 0, SW]) line(sg, pts, 2, 2.5, 0.35 + 0.3 * r1(), dx);
  }

  // ---- the lightning through it: laid round where the dome was struck (the middle of the canvas that place, its edge the
  // far side of the ball). As the clip's: bolts straight out from there in every way, each a zigzag of short straight
  // pieces kinked sharply about its way (not a wandering line), forking now and then, thinning to its tip. Red one set,
  // green another (it flickers between them, turned), blue the purple lightning close round the middle (wider zigzags)
  const CW = 1024, C = CW / 2, PX = C / Math.PI;
  const [cc, cg] = sheet(CW, CW);
  function fork(rr, ch, x, y, way, len, w, depth) {
    const pts = [[C + x, C + y]];
    let d = 0;
    while (d < len) {
      const step = 7 + rr() * 12;
      way += (rr() - 0.5) * 0.16;                                   // (its way bends a little)
      const a = way + (rr() - 0.5) * 0.95;                          // (each piece kinked off it)
      x += Math.cos(a) * step; y += Math.sin(a) * step; d += step;
      pts.push([C + x, C + y]);
      if (depth < 2 && rr() < (depth ? 0.03 : 0.055)) fork(rr, ch, x, y, way + (rr() < 0.5 ? -1 : 1) * (0.3 + 0.45 * rr()), (len - d) * (0.3 + 0.4 * rr()), w * 0.7, depth + 1);
      if (Math.hypot(x, y) > C - 8) break;
    }
    const n = pts.length;                                            // (thinner each third of it)
    for (let p = 0; p < 3; p++) {
      const a0 = Math.floor(p * (n - 1) / 3), a1 = Math.floor((p + 1) * (n - 1) / 3);
      if (a1 > a0) line(cg, pts.slice(a0, a1 + 1), ch, w * (1 - 0.24 * p), 1 - 0.12 * p);
    }
  }
  for (const ch of [0, 1]) {
    const rr = seeded(seed * 13 + 101 * (ch + 1));
    const n = 10 + Math.floor(rr() * 4);
    for (let i = 0; i < n; i++) fork(rr, ch, 0, 0, (i + 0.2 + rr() * 0.6) / n * 2 * Math.PI, (0.5 + 0.5 * rr()) * Math.PI * PX, 1.5 + rr() * 1.0, 0);
  }
  {
    const rr = seeded(seed * 17 + 303);
    for (let i = 0; i < 9; i++) {
      const a = rr() * 2 * Math.PI, r = (0.01 + 0.04 * rr()) * Math.PI * PX;
      let x = Math.cos(a) * r, y = Math.sin(a) * r, h = a + (rr() - 0.5) * 1.2, d = 0, turn = rr() < 0.5 ? -1 : 1;
      const way = h, pts = [[C + x, C + y]], len = (0.08 + 0.18 * rr()) * Math.PI * PX;
      while (d < len) { const st = 6 + rr() * 16; if (rr() < 0.7) turn = -turn; const k = way + turn * (0.3 + 0.65 * rr()); x += Math.cos(k) * st; y += Math.sin(k) * st; d += st; pts.push([C + x, C + y]); }
      line(cg, pts, 2, 2.2, 1);
    }
  }

  // ---- the disc's blots (the middle of the canvas its middle, its edge the disc's rim), soft at their edges (read
  // from a smaller copy in the shader)
  const BW = 512, B = BW / 2;
  const [bc, bg] = sheet(BW, BW);
  {
    const rr = seeded(seed * 19 + 404);
    for (let i = 0; i < 96; i++) {
      const r = (0.16 + 0.78 * Math.sqrt((i % 12 + rr()) / 12)) * B, a = (i * 0.618034 + rr() * 0.3) * 2 * Math.PI;
      const size = (5 + 11 * rr()) * (0.6 + 0.8 * r / B), long = 1.3 + 1.4 * rr();
      const lumps = Array.from({ length: 7 }, () => 0.78 + 0.44 * rr()), turn = rr() * 6.28;
      for (const s of [1, 0.74, 0.46]) {
        bg.save(); bg.translate(B + Math.cos(a) * r, B + Math.sin(a) * r); bg.rotate(a + Math.PI / 2 + (rr() - 0.5) * 0.3);
        bg.fillStyle = 'rgba(255,0,0,0.34)'; bg.beginPath();
        for (let k = 0; k <= 28; k++) {
          const t = k / 28 * 2 * Math.PI, li = (t + turn) / (2 * Math.PI) * 7, l0 = lumps[Math.floor(li) % 7], l1 = lumps[(Math.floor(li) + 1) % 7];
          const lump = lerp(l0, l1, li - Math.floor(li)) * size * s;
          const px = Math.cos(t) * lump * long, py = Math.sin(t) * lump;
          (k ? bg.lineTo(px, py) : bg.moveTo(px, py));
        }
        bg.fill(); bg.restore();
      }
    }
  }
  return { streams: texture(sc, true), cracks: texture(cc, false), blots: texture(bc, false) };
}

// ---------------------------------------------------------------------------------------------------------------------
// ---- the dome: a ball (radius 1, scaled); everything on it from where on it a point is (vL)
const DOME_VERT = /* glsl */`
  varying vec3 vL, vW, vN;
  void main() {
    vL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const DOME_FRAG = /* glsl */`
  uniform sampler2D uStreams, uCracks;
  uniform float uTime, uAlpha, uLines, uCharge, uBase, uCrackR, uCrackA, uPurple, uStar, uBack, uGround, uR, uNight, uWhite, uFlow;
  uniform vec2 uLod;                        // how small a copy of the lines' picture to read: their hearts, their glow
  uniform vec3 uHit, uE1, uE2;
  uniform vec4 uTurn;                       // the cracks' picture turned (cos, sin), the purple's (cos, sin)
  uniform vec2 uPick;                       // which of the two sets of cracks
  uniform vec4 uRing0, uRing1, uRing2;      // a ripple going out from where a blow landed: which way (on the ball), s since
  uniform vec2 uNear;
  varying vec3 vL, vW, vN;
  const float PI = 3.14159265;
  // a ripple running out over it from where a blow landed: a soft bright ring, and light where it began
  float ripple(vec4 r, vec3 n) {
    if (r.w < 0.0 || r.w > 0.4) return 0.0;
    float th = acos(clamp(dot(n, r.xyz), -1.0, 1.0));
    float rr = 0.06 + 0.9 * (1.0 - exp(-r.w * 8.0));
    float d = (th - rr) / (0.06 + 0.12 * r.w);
    return exp(-d * d) * (1.0 - smoothstep(0.15, 0.4, r.w)) + exp(-th * th * 40.0) * (1.0 - smoothstep(0.0, 0.14, r.w)) * 0.8;
  }
  void main() {
    vec3 n = normalize(vL);
    vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
    float f = 1.0 - abs(dot(N, V));
    float e = smoothstep(0.18, 1.0, f);
    e = e * e * (3.0 - 2.0 * e);                                       // 0 face on .. 1 at its edge, smooth
    float above = (n.y - uGround) * uR;                                // m over the ground under it
    float foot = exp(-max(above, 0.0) * 5.0);
    // its glass: clear and sky blue, its edge glowing; struck, deep blue (each wall half of it: two make the clip's)
    vec3 rgb = mix(vec3(0.05, 0.115, 0.21), vec3(0.3, 0.52, 0.66), e * e) + vec3(0.06, 0.13, 0.16) * foot;
    float a = mix(0.085, 0.34, e * e) + 0.05 * foot;
    // struck, as the clip's: deep blue, its far wall the blue behind her, its near wall clear before her and blue only
    // towards its edge (she is seen as she is, the world behind her blue)
    vec3 rgbC = mix(mix(vec3(0.01, 0.02, 0.07), vec3(0.07, 0.14, 0.48), uBack), vec3(0.1, 0.2, 0.56), e);
    float aC = mix(mix(0.08, 0.62, uBack), 0.8, mix(pow(e, 1.5), e, uBack));
    rgb = mix(rgb, rgbC, uCharge); a = mix(a, aC, uCharge);
    // its lines of light: one picture round it, read twice, moving two ways and waving; each line's heart from the
    // picture as it is, its glow from a smaller copy (the same lines, blurred)
    float lon = atan(n.z, n.x) * (0.5 / PI) + 0.5;
    float lat = asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5;
    float wob = 0.012 * sin(lon * 12.566 + uTime * 2.1) + 0.007 * sin(lon * 18.85 - uTime * 2.9);
    vec2 uvA = vec2(lon + uTime * uFlow, lat + wob), uvB = vec2(lon - uTime * uFlow * 0.72 + 0.37, lat - wob * 0.8);
    vec3 a0 = textureLod(uStreams, uvA, uLod.x).rgb, a1 = textureLod(uStreams, uvA, uLod.y).rgb;
    float b0 = textureLod(uStreams, uvB, uLod.x).g, b1 = textureLod(uStreams, uvB, uLod.y).g;
    float k = uLines * mix(1.0, 0.45, uBack);
    float heart = smoothstep(0.25, 0.95, max(a0.r, b0)) * k;
    float glow = min(1.0, max(a1.r, b1) * 3.6) * k;
    rgb += vec3(0.16, 0.62, 0.92) * glow * 0.75 + vec3(0.62, 0.95, 1.0) * heart;
    a += glow * 0.16 + heart * 0.34;
    // a sheen going round it (it is alive)
    float sh = pow(max(0.0, sin((lon + lat * 0.4) * 12.566 - uTime * 2.4)), 14.0) * (1.0 - uCharge) * uLines;
    rgb += vec3(0.4, 0.75, 1.0) * sh * 0.14 * e; a += sh * 0.03 * e;
    // purple at its foot (as it stands up, and a little after)
    float pu = a1.b * 2.2 * (1.0 - smoothstep(0.1, 1.0, above)) * uBase;
    rgb += vec3(0.5, 0.22, 0.95) * pu; a += pu * 0.18;
    // ripples out from where blows landed
    float rp = max(ripple(uRing0, n), max(ripple(uRing1, n), ripple(uRing2, n)));
    rgb += vec3(0.55, 0.85, 1.0) * rp * 0.9; a += rp * 0.35;
    // the lightning through it, laid round where it was struck: a white heart in a blue glow
    if (uCrackA + uPurple + uStar > 0.001) {
      float c = clamp(dot(n, uHit), -1.0, 1.0);
      float th = acos(c);
      vec3 tp = n - uHit * c;
      float tl = length(tp);
      vec2 d2 = tl > 1e-4 ? vec2(dot(tp, uE1), dot(tp, uE2)) / tl : vec2(1.0, 0.0);
      float rad = 0.5 * th / PI;
      vec2 q1 = 0.5 + rad * vec2(d2.x * uTurn.x - d2.y * uTurn.y, d2.x * uTurn.y + d2.y * uTurn.x);
      vec2 q2 = 0.5 + rad * vec2(d2.x * uTurn.z - d2.y * uTurn.w, d2.x * uTurn.w + d2.y * uTurn.z);
      float reach = (1.0 - smoothstep(uCrackR - 0.35, uCrackR, th)) * mix(1.0, 0.65, smoothstep(0.4 * PI, 0.9 * PI, th));   // (dimmer far round it)
      float lc = max(uLod.x - 1.0, 0.0);              // (as fine as the picture can show it from here: no shimmer far off)
      float cr = dot(textureLod(uCracks, q1, lc).rg, uPick) * uCrackA * reach;
      float cg = min(1.0, dot(textureLod(uCracks, q1, lc + 2.5).rg, uPick) * 3.0) * uCrackA * reach;
      float pr = textureLod(uCracks, q2, lc).b * uPurple, pg = min(1.0, textureLod(uCracks, q2, lc + 2.5).b * 3.0) * uPurple;
      float ch = smoothstep(0.3, 0.85, cr * (1.0 + 0.7 * lc)), ph = smoothstep(0.3, 0.85, pr * (1.0 + 0.7 * lc));
      rgb += vec3(0.25, 0.5, 1.0) * cg * 0.55 + vec3(0.72, 0.5, 0.0) * ch + vec3(0.2, 0.2, 0.2) * ch;
      rgb += vec3(0.55, 0.22, 1.0) * pg * 0.8 + vec3(0.42, 0.6, 0.0) * ph;
      a += cg * 0.1 + ch * 0.4 + pg * 0.12 + ph * 0.3;
      float st = exp(-th * th * 220.0) * uStar;
      rgb += vec3(0.9, 0.97, 1.0) * st; a += st * 0.4;
    }
    rgb += vec3(0.55, 0.8, 0.95) * uWhite * (0.35 + 0.65 * e); a += uWhite * 0.22;
    rgb *= 1.0 + 0.18 * uNight;
    float kk = uAlpha * smoothstep(uNear.x, uNear.y, length(cameraPosition - vW));
    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), clamp(a, 0.0, 1.0)) * kk;
  }`;

// ---- the glow round the dome's edge: a square turned to the eye, at its middle; uRim the edge's radius on it
const HALO_FRAG = /* glsl */`
  uniform float uRim, uAlpha, uCharge, uNight, uWhite;
  varying vec2 vQ;
  void main() {
    float r = length(vQ);
    float out1 = max(r - uRim, 0.0);
    float g = exp(-out1 * out1 / (0.0009 + 0.002 * uWhite)) * smoothstep(uRim * 0.95, uRim, r);
    float wide = exp(-out1 * 12.0) * step(uRim, r) * 0.28;
    vec3 col = mix(vec3(0.36, 0.72, 1.0), vec3(0.3, 0.42, 1.0), uCharge);
    float k = (g * 0.55 + wide) * (0.8 + 0.6 * uWhite) * uAlpha * (1.0 + 0.3 * uNight);
    gl_FragColor = vec4(col * k, k * 0.32);
  }`;

// ---- the ring of light over the ground as it is raised: a flat square (-1..1)
const RING_VERT = /* glsl */`
  varying vec2 vQ;
  void main() { vQ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FRAG = /* glsl */`
  uniform float uU, uNight;
  varying vec2 vQ;
  void main() {
    float r = length(vQ);
    float R = 0.2 + 0.78 * (1.0 - pow(1.0 - uU, 3.0));
    float d = (r - R) / (0.035 + 0.07 * uU);
    float ring = exp(-d * d);
    float fill = exp(-r * r * 3.0) * (1.0 - smoothstep(0.0, 0.5, uU)) * 0.6;
    float k = 1.0 - smoothstep(0.3, 1.0, uU);
    vec3 rgb = (vec3(0.62, 0.94, 1.0) * ring + vec3(0.25, 0.55, 1.0) * fill) * k * (1.0 + 0.2 * uNight);
    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), (ring * 0.45 + fill * 0.15) * k);
  }`;

// ---- the disc on the ground: a round grid laid over the ground (its heights set as it is thrown out), drawn by its
// shader as the clip's: a broad white rim running out, a pale band in it, sky blue behind with blots of deep blue (their
// edges a little soft), a glow past the rim; its middle going first
const DISC_VERT = /* glsl */`
  uniform float uMax, uDrop;
  varying vec2 vP;
  void main() {
    vP = position.xz * uMax;
    vec4 w = modelMatrix * vec4(position.x * uMax, position.y + uDrop, position.z * uMax, 1.0);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const DISC_FRAG = /* glsl */`
  uniform sampler2D uBlots, uCracks;
  uniform float uRad, uHole, uAlpha, uLight, uNight, uSpin;
  uniform vec4 uTurn;
  uniform vec2 uPick;
  varying vec2 vP;
  void main() {
    float d = length(vP);
    float s = d / max(uRad, 1e-3);
    if (s > 1.2) discard;
    float aa = fwidth(s) * 1.3 + 1e-4;
    float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, s);
    float body = inside * smoothstep(uHole - 0.07, uHole + 0.02, s);           // (its middle going)
    float rim = smoothstep(0.875 - aa, 0.875 + aa, s);                         // its broad white rim
    float pale = smoothstep(0.75 - 2.0 * aa, 0.75 + 2.0 * aa, s) * (1.0 - rim); // a pale band in it
    float cs = cos(uSpin), sn = sin(uSpin);
    vec2 q = vP / uRad;
    vec2 uv = 0.5 + 0.47 * vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
    float b = textureLod(uBlots, uv, 0.8).r;
    float blot = smoothstep(0.23, 0.37, b), deep = smoothstep(0.55, 0.71, b);
    vec3 col = mix(vec3(0.36, 0.62, 0.93), vec3(0.52, 0.88, 0.99), smoothstep(0.4, 0.75, s));
    col = mix(col, vec3(0.27, 0.47, 0.88), blot);
    col = mix(col, vec3(0.14, 0.27, 0.64), deep);
    col = mix(col, vec3(0.72, 0.96, 0.99), pale);
    col = mix(col, vec3(0.97, 0.995, 1.0), rim);
    float a = body * mix(0.8, 0.97, rim);
    vec3 rgb = col * a;
    // a glow past its rim, soft
    float past = max(s - 1.0, 0.0);
    float glow = exp(-past * past / 0.005) * (1.0 - inside) * (1.0 - smoothstep(0.8, 1.0, uHole));
    rgb += vec3(0.5, 0.9, 1.0) * glow * 0.75; a += glow * 0.22;
    // purple lightning over it: white hearts in a purple glow
    vec2 q1 = 0.5 + 0.46 * vec2(q.x * uTurn.x - q.y * uTurn.y, q.x * uTurn.y + q.y * uTurn.x);
    float l = dot(textureLod(uCracks, q1, 0.0).rg, uPick) * uLight * body;
    float lg = min(1.0, dot(textureLod(uCracks, q1, 2.0).rg, uPick) * 3.0) * uLight * body;
    float lh = smoothstep(0.4, 0.9, l);
    rgb += vec3(0.66, 0.3, 1.0) * lg * 0.85 + vec3(0.3, 0.55, 0.02) * lh;
    a += lg * 0.2 + lh * 0.35;
    rgb *= 1.0 + 0.15 * uNight;
    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), clamp(a, 0.0, 1.0)) * uAlpha;
  }`;

// ---- the ring of dust over the disc's edge: a band round it (an open cylinder, radius 1, 0..1 high)
const DUST_VERT = /* glsl */`
  varying vec3 vP;
  void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DUST_FRAG = /* glsl */`
  uniform float uU, uAlpha;
  varying vec3 vP;
  ${NOISE}
  void main() {
    float h = vP.y;
    float wisp = noise2(vec2(vP.x * 5.0 + vP.z * 1.3, vP.z * 5.0 - vP.x * 1.1) + vec2(0.0, uU * 3.0)) * 0.6 + noise2(vec2(vP.x * 13.0, vP.z * 13.0 + h * 3.0 - uU * 4.0)) * 0.4;
    float band = smoothstep(0.0, 0.3, h) * (1.0 - smoothstep(0.4, 0.95, h + wisp * 0.3));
    float a = band * smoothstep(0.35, 0.75, wisp) * 0.32 * smoothstep(0.0, 0.1, uU) * (1.0 - smoothstep(0.35, 1.0, uU)) * uAlpha;
    vec3 col = mix(vec3(0.7, 0.73, 0.8), vec3(0.9, 0.92, 0.96), h);
    gl_FragColor = vec4(col * a, a);
  }`;

// ---- a flash, the star, the burst, a flare: a square turned to the eye (q -1..1; a flare's drawn out along, uAspect
// times as long, and turned uSpin), drawn by what it is. As the clip's: crisp shapes of light, each in a glow, laid one
// over another (`over`: what it covers is hidden; `add`: light only)
const SPRITE_VERT = /* glsl */`
  uniform vec3 uPos;
  uniform float uSize, uPull, uAspect, uSpin;
  varying vec2 vQ;
  void main() {
    vQ = position.xy;
    vec4 mv = viewMatrix * vec4(uPos, 1.0);
    float z0 = mv.z;
    mv.z = min(mv.z + uPull, -0.15);                       // (towards the eye: not cut by the ground it stands on)
    float k = mv.z / min(z0, -0.15);
    mv.xy *= k;
    vec2 p = vec2(position.x * uAspect, position.y);
    float c = cos(uSpin), s = sin(uSpin);
    mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y) * uSize * k;
    gl_Position = projectionMatrix * mv;
  }`;
const SPRITE_FRAG = /* glsl */`
  uniform float uKind, uAge, uLife, uSeed, uFade, uNight, uTime, uAspect;
  varying vec2 vQ;
  float h1(float n) { return fract(sin(n * 12.9898 + uSeed * 78.233) * 43758.5453); }      // (a number for one whole ray)
  vec4 over(vec4 c, vec3 col, float k) { k = clamp(k, 0.0, 1.0); return vec4(col * k, k) + c * (1.0 - k); }
  vec4 add(vec4 c, vec3 col, float k, float w) { return c + vec4(col * k, k * w); }
  // a star of rays out of the middle: count of them, lo to hi of the square long (a few the longest), w wide at their
  // foot (from r0 out), narrowing to their tips. Each a crisp heart (x) in a glow (y)
  vec2 rays(vec2 q, float count, float lo, float hi, float w, float r0) {
    float r = length(q);
    float k = (atan(q.y, q.x) / 6.2831853 + 0.5) * count;
    float i = floor(k);
    float da = (fract(k) - 0.5 - (h1(i) - 0.5) * 0.6) / count * 6.2831853;
    float hk = h1(i + 7.0);
    float len = mix(lo, hi, hk * hk);
    float d = abs(sin(da)) * r;
    float ww = w * (0.6 + 0.8 * h1(i + 3.0)) * (1.0 - smoothstep(r0, len, r));
    float aa = fwidth(d) + 1e-4;
    float on = step(r, len) * smoothstep(r0 * 0.5, r0, r);
    return vec2(1.0 - smoothstep(ww * 0.5 - aa, ww * 0.5 + aa, d), exp(-d * d / (ww * ww * 3.0 + 1e-5))) * on;
  }
  void main() {
    vec2 q = vQ;
    float r = length(q), r2 = r * r, t = uAge;
    float u = clamp(t / max(uLife, 1e-3), 0.0, 1.0);
    float aa = fwidth(r) + 1e-4;
    vec4 c = vec4(0.0);
    if (uKind < 0.5) {
      // a blow landing (the clip's): at once a white heart in a crown of rays; then a ball of blue thrown out round it,
      // lit at its rim as glass is, as the heart is drawn in to a point
      float rc = mix(0.24, 0.05, smoothstep(0.03, 0.17, t)) * (1.0 - smoothstep(0.6, 1.0, u));
      float lk = smoothstep(0.012, 0.045, t) * (1.0 - smoothstep(0.42, 0.8, u));
      float ringR = 0.26 + 0.34 * (1.0 - exp(-max(t - 0.012, 0.0) * 8.0));
      float inL = 1.0 - smoothstep(ringR - aa, ringR + aa, r);
      float fr = smoothstep(0.45, 1.0, r / ringR); fr *= fr;
      float past = max(r - ringR, 0.0) / 0.04;
      c = add(c, vec3(0.2, 0.45, 1.0), exp(-r2 / 0.1) * (1.0 - smoothstep(0.1, 0.7, u)) * 0.4, 0.2);
      c = over(c, mix(vec3(0.16, 0.25, 0.84), vec3(0.58, 0.92, 1.0), fr), mix(0.38, 0.85, fr) * inL * lk);
      c = add(c, vec3(0.45, 0.85, 1.0), exp(-past * past) * (1.0 - inL) * lk * 0.6, 0.25);
      vec2 cr = rays(q, 44.0, 0.38, 0.86, 0.05, 0.12) * (1.0 - smoothstep(0.05, 0.16, t));
      vec2 lr = rays(vec2(q.x * 0.8 - q.y * 0.6, q.x * 0.6 + q.y * 0.8), 9.0, 0.6, 1.0, 0.04, 0.1) * (1.0 - smoothstep(0.08, 0.24, t));
      c = add(c, vec3(0.4, 0.8, 1.0), (cr.y + lr.y) * 0.5, 0.3);
      c = over(c, vec3(0.95, 1.0, 1.0), (cr.x + lr.x) * 0.95);
      c = add(c, vec3(0.55, 0.85, 1.0), exp(-r2 / (rc * rc * 3.0 + 0.002)) * (1.0 - smoothstep(0.5, 1.0, u)) * 0.6, 0.4);
      c = over(c, vec3(1.0), smoothstep(rc, rc * 0.45, r));
    } else if (uKind < 1.5) {
      // the star where the blow went in, while the lightning runs through the dome: a cross of light, rays, pulsing
      float pulse = 0.82 + 0.18 * sin(uTime * 34.0 + uSeed * 9.0);
      float tw = uTime * 0.8;
      vec2 qr = vec2(q.x * cos(tw) - q.y * sin(tw), q.x * sin(tw) + q.y * cos(tw));
      float crossL = exp(-qr.y * qr.y / 0.0006) * exp(-abs(qr.x) * 3.2) + exp(-qr.x * qr.x / 0.0006) * exp(-abs(qr.y) * 3.2);
      vec2 ry = rays(q, 18.0, 0.18, 0.5, 0.035, 0.05);
      c = add(c, vec3(0.2, 0.4, 1.0), exp(-r2 / 0.05) * 0.8 + exp(-r2 / 0.25) * 0.25, 0.25);
      c = add(c, vec3(0.6, 0.8, 1.0), ry.y * 0.5, 0.3);
      c = over(c, vec3(0.8, 0.92, 1.0), ry.x * 0.8);
      c = add(c, vec3(0.75, 0.9, 1.0), crossL, 0.5);
      c = over(c, vec3(1.0), smoothstep(0.1, 0.045, r));
      c *= pulse;
    } else if (uKind < 2.5) {
      // the burst (the clip's): a ball of light swelling out of where the blow went in, its edge spiked like ice: white
      // at first; then sky-blue glass, white at its heart with rays out of it, petals of blue between them (wide at its
      // rim, drawn out to a point towards its heart). It clears from its middle out to a bright spiked rim, and that
      // goes. A glow round all of it
      float g = 1.0 - exp(-t * 7.0);
      float R = mix(0.12, 0.5, g) + 0.1 * smoothstep(0.35, 1.0, u);
      float ang = atan(q.y, q.x) / 6.2831853 + 0.5;
      float k1 = ang * 40.0, t1 = 1.0 - abs(fract(k1) - 0.5) * 2.0, s1 = h1(floor(k1));
      float k2 = ang * 13.0 + 0.37, t2 = 1.0 - abs(fract(k2) - 0.5) * 2.0, s2 = h1(floor(k2) + 40.0);
      float spike = max(pow(t1, 4.0) * (0.06 + 0.24 * s1 * s1), pow(t2, 7.0) * (0.25 + 0.4 * s2 * s2) * step(0.45, s2)) * R * (1.5 - 0.9 * g);
      float edge = R + spike;
      float ea = aa * 1.4;
      float inside = 1.0 - smoothstep(edge - ea, edge + ea, r);
      float rim = inside * smoothstep(R * (1.0 - mix(0.12, 0.06, smoothstep(0.2, 0.7, u))) - ea, R * (1.0 - mix(0.12, 0.06, smoothstep(0.2, 0.7, u))) + ea, r);
      float body = inside - rim;
      float rr = r / R;
      float white = 1.0 - smoothstep(0.03, 0.1, t);
      float clear = smoothstep(0.3, 0.62, u);
      float keep = smoothstep(clear * 1.25 - 0.3, clear * 1.25, rr);
      float clearP = smoothstep(0.45, 0.82, u);
      float keepP = smoothstep(clearP * 1.25 - 0.3, clearP * 1.25, rr);
      float rimK = 1.0 - smoothstep(0.7, 1.0, u);
      // its petals: one in each of 13 turns round it (a few missing), from p0 out to p1 of its radius, widest out
      float pk = ang * 13.0 + 0.5, pi = floor(pk), pf = fract(pk);
      float p0 = 0.16 + 0.2 * h1(pi + 62.0), p1 = 0.86 + 0.09 * h1(pi + 63.0);
      float along = clamp((rr - p0) / (p1 - p0), 0.0, 1.0);
      float pw = (0.27 + 0.13 * h1(pi + 64.0)) * sqrt(max(1.0 - pow(2.0 * along - 1.0, 2.0), 0.0)) * (0.65 + 0.35 * along) * (1.0 + 0.15 * sin(rr * 17.0 + pi * 3.1));
      float pd = (abs(pf - 0.5 - (h1(pi + 61.0) - 0.5) * 0.35) - pw) / 13.0 * 6.2831853 * r;
      float pa = fwidth(pd) * 1.5 + 1e-4;
      float petal = (1.0 - smoothstep(-pa, pa, pd)) * step(p0, rr) * step(rr, p1) * step(0.15, h1(pi + 60.0));
      c = add(c, vec3(0.25, 0.55, 1.0), exp(-r2 / (R * R * 1.6)) * (1.0 - smoothstep(0.0, 0.25, u)) * 0.14, 0.08);
      float past = max(r - edge, 0.0);
      c = add(c, vec3(0.35, 0.8, 1.0), exp(-past * past / (0.0004 + 0.0012 * g)) * (1.0 - inside) * 0.4 * rimK, 0.2);
      vec3 light = mix(mix(vec3(0.74, 0.97, 1.0), vec3(0.5, 0.87, 1.0), smoothstep(0.2, 0.95, rr)), vec3(1.0), white * (1.0 - 0.35 * smoothstep(0.3, 1.0, rr)));
      c = over(c, light, body * mix(mix(0.66, 0.82, smoothstep(0.3, 1.0, rr)), 0.97, white) * keep);
      c = over(c, mix(vec3(0.34, 0.53, 0.96), vec3(0.17, 0.3, 0.8), along), body * petal * mix(0.88, 0.7, clear) * (1.0 - white) * keepP);
      c = over(c, vec3(1.0), body * smoothstep(0.4, 0.0, rr) * (1.0 - smoothstep(0.15, 0.5, u)));
      vec2 ry = rays(q, 34.0, 0.45 * R, 0.95 * R, 0.025, 0.06 * R) * (1.0 - smoothstep(0.3, 0.6, u));
      c = add(c, vec3(0.5, 0.85, 1.0), ry.y * 0.4, 0.3);
      c = over(c, vec3(0.95, 1.0, 1.0), ry.x * 0.9);
      c = over(c, mix(vec3(0.6, 0.93, 1.0), vec3(0.96, 1.0, 1.0), 0.3 + 0.7 * white), rim * 0.95 * rimK);
      float rc = R * mix(0.36, 0.1, smoothstep(0.0, 0.25, t));
      c = add(c, vec3(0.6, 0.9, 1.0), exp(-r2 / (rc * rc * 4.0 + 0.003)) * (1.0 - smoothstep(0.25, 0.7, u)) * 0.5, 0.4);
      c = over(c, vec3(1.0), smoothstep(rc, rc * 0.35, r) * (1.0 - smoothstep(0.3, 0.7, u)));
      c *= 1.0 - smoothstep(0.82, 1.0, u);
    } else {
      // a flare: a long thin line of light across the picture (q.x along it, of its half-length; q.y across, of
      // uSize), shooting out from its middle; a glow round it and round its middle
      float x = abs(q.x), y = q.y;
      float reach = max(1.0 - exp(-t * 40.0), 0.05);
      float along = max(1.0 - x / reach, 0.0);
      float th = 0.04 * pow(along, 0.8) * (1.0 - 0.5 * u);
      float ya = fwidth(y) + 1e-4;
      float k = (1.0 - smoothstep(0.35, 1.0, u)) * smoothstep(0.0, 0.012, t);
      float xm = x * uAspect;
      c = add(c, vec3(0.35, 0.75, 1.0), exp(-y * y / (0.006 + 0.014 * along)) * along * along * 0.7 * k, 0.15);
      c = add(c, vec3(0.5, 0.85, 1.0), exp(-xm * xm * 1.5 - y * y * 6.0) * 0.6 * k, 0.2);
      c = over(c, vec3(0.97, 1.0, 1.0), (1.0 - smoothstep(th - ya, th + ya, abs(y))) * step(0.0001, along) * k);
    }
    c.rgb *= 1.0 + 0.15 * uNight;
    gl_FragColor = clamp(c, 0.0, 1.0) * uFade;
  }`;

// ---- needles, dashes, sparkles, puffs: one square each (corner -1..1), instanced; each one's whole way worked out
// here from where and when it began:
//   aA: where it began (x, y, z; with `follow`, from the dome's middle), when (s, the fx's clock)
//   aB: its speed (x, y, z: m/s), how long it lasts (s)
//   aC: its half-width (m: its glow's; its heart a third of that), its streak (s of its way behind it), what it is (0 a
//       needle, 1 a dash, 2 a sparkle, 3 a puff), a number of its own
//   aD: its weight (m/s² up), its drag (1/s), follow (1: it goes with the dome), 0
const SPARK_VERT = /* glsl */`
  attribute vec2 corner;
  attribute vec4 aA, aB, aC, aD;
  uniform float uTime;
  uniform vec3 uCenter;
  uniform vec2 uNear;
  varying vec2 vL;
  varying float vLen, vFade, vKind, vSeed;
  vec3 at(float t) {
    float c = max(aD.y, 0.001);
    return aA.xyz + aB.xyz * (1.0 - exp(-c * t)) / c + vec3(0.0, 0.5 * aD.x * t * t, 0.0) + uCenter * aD.z;
  }
  void main() {
    float age = uTime - aA.w, life = max(aB.w, 0.01), u = clamp(age / life, 0.0, 1.0);
    float kind = aC.z;
    float isDash = step(0.5, kind) * (1.0 - step(1.5, kind));
    float isDot = step(1.5, kind) * (1.0 - step(2.5, kind));
    float isPuff = step(2.5, kind);
    float streak = aC.y * (1.0 - isDash * smoothstep(0.3, 0.55, u));       // (a dash draws in to a point as it slows)
    vec3 head = at(age), tail = at(max(0.0, age - streak));
    tail = mix(tail, head, max(isDot, isPuff));
    float w = aC.x * mix(mix(1.0 - 0.5 * u, 1.0 - 0.25 * u, isDash), 1.0 + 2.2 * u, isPuff);
    vec4 h = viewMatrix * vec4(head, 1.0), t = viewMatrix * vec4(tail, 1.0);
    vec2 d = h.xy - t.xy;
    float l = length(d);
    vec2 along = l > 1e-5 ? d / l : vec2(1.0, 0.0);
    vec2 side = vec2(-along.y, along.x);
    float sx = corner.x * 0.5 + 0.5;
    vec4 p = mix(t, h, sx);
    p.xy += along * corner.x * w + side * corner.y * w;
    vLen = l / max(w, 1e-5);
    vL = vec2(sx * (vLen + 2.0) - 1.0, corner.y);
    float twinkle = 0.6 + 0.4 * sin(uTime * 13.0 + aC.w * 40.0);
    float needle = 1.0 - smoothstep(0.4, 1.0, u);
    float dash = (1.0 - smoothstep(0.7, 1.0, u)) * mix(1.0, twinkle, smoothstep(0.45, 0.7, u));
    float dot1 = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.5, 1.0, u)) * twinkle;
    float puff = smoothstep(0.0, 0.2, u) * pow(1.0 - u, 1.5);
    vFade = mix(mix(mix(needle, dash, isDash), dot1, isDot), puff, isPuff);
    vFade *= smoothstep(uNear.x, uNear.y, -p.z);
    vKind = kind; vSeed = aC.w;
    gl_Position = projectionMatrix * p;
    if (age < 0.0 || age > life) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);      // (not alive: off the picture)
  }`;
const SPARK_FRAG = /* glsl */`
  uniform float uNight;
  varying vec2 vL;
  varying float vLen, vFade, vKind, vSeed;
  void main() {
    vec2 q = vL;
    float line = step(0.05, vLen);
    float toHead = vLen > 0.01 ? clamp(q.x / vLen, 0.0, 1.0) : 1.0;
    float d = length(vec2(q.x - clamp(q.x, 0.0, vLen), q.y)) / mix(1.0, 0.55 + 0.45 * toHead, line);   // (thinner to its tail)
    float aa = fwidth(d) + 1e-4;
    float isPuff = step(2.5, vKind);
    float heart = 1.0 - smoothstep(0.3 - aa, 0.3 + aa, d);          // as the clip's: a crisp white heart
    float body = 1.0 - smoothstep(0.5 - aa, 0.5 + aa, d);            // in a crisp pale blue (a needle's all but white)
    float glow = exp(-d * d * 3.2);                                  // in a soft glow
    float bright = mix(1.0, 0.55 + 0.45 * toHead, line);
    vec3 sky = vec3(0.42, 0.86, 1.0);
    vec3 pale = mix(vec3(0.62, 0.92, 1.0), vec3(0.86, 0.98, 1.0), 1.0 - step(0.5, vKind));
    float tail = mix(0.0, 1.0 - toHead, line);                       // (its tail bluer: light, not grey, as it goes)
    pale = mix(pale, sky, tail * 0.7);
    vec3 col = sky * glow * 0.35 * (1.0 + 0.4 * uNight);
    float a = glow * 0.1;
    col = col * (1.0 - body) + pale * body; a = a * (1.0 - body) + body * 0.9;
    col = col * (1.0 - heart) + mix(vec3(1.0), pale, tail * 0.6) * heart; a = a * (1.0 - heart) + heart;
    col *= bright; a *= bright;
    float rag = 0.8 + 0.12 * sin(q.x * 6.0 + vSeed * 20.0) * sin(q.y * 5.0 - vSeed * 13.0);
    float pa = (1.0 - smoothstep(rag - 0.45, rag, d)) * 0.3;
    vec3 pc = vec3(0.76, 0.78, 0.84) * pa;
    a = mix(a, pa, isPuff); col = mix(col, pc, isPuff);
    gl_FragColor = vec4(clamp(col * vFade, 0.0, 1.0), clamp(a * vFade, 0.0, 1.0));
  }`;

// ---- the shards: flakes of its dark glass, as the clip's: smooth-edged, not cut facets. A fang (drawn out to a point,
// a little bent) as it bursts, pebbles after; one square each turned to the eye, instanced, its whole way worked out
// here from where and when it began, pointing the way it flies, turning in the picture and tumbling (drawn narrower and
// wider as it turns over), shrinking away at its end. Deep navy, lighter on one side and at its rim
//   aP: where (x, y, z), when;  aV: its speed (x, y, z), how long it lasts;  aS: its turning (rad/s), its tumbling
//   (rad/s), its length (of its width), its fall (m/s²);  aZ: its half-width (m), a number of its own, its bend, how
//   wide it is at its tip (of its width at its back)
const SHARD_VERT = /* glsl */`
  attribute vec2 corner;
  attribute vec4 aP, aV, aS, aZ;
  uniform float uTime;
  uniform vec2 uNear;
  varying vec2 vQ;
  varying float vFade, vLight, vBend, vTip;
  void main() {
    float age = uTime - aP.w, life = max(aV.w, 0.01), u = clamp(age / life, 0.0, 1.0);
    float drag = 2.0;
    vec3 p = aP.xyz + aV.xyz * (1.0 - exp(-drag * age)) / drag - vec3(0.0, 0.5 * aS.w * age * age, 0.0);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vec3 vv = mat3(viewMatrix) * aV.xyz;
    float turn = atan(vv.y, vv.x + 1e-5) + (aZ.y - 0.5) * 0.8 + aS.x * age;
    float tumble = abs(cos(aZ.y * 17.0 + aS.y * age));
    float w = aZ.x * (1.0 - smoothstep(0.6, 1.0, u)) * smoothstep(0.0, 0.04, age);
    vec2 q = vec2(corner.x * aS.z, corner.y * mix(0.3, 1.0, tumble)) * w;
    float c = cos(turn), s = sin(turn);
    mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    vQ = corner; vBend = aZ.z; vTip = aZ.w;
    vLight = 0.5 + 0.5 * sin(turn + aS.y * age * 0.5);
    vFade = smoothstep(uNear.x, uNear.y, -mv.z);
    gl_Position = projectionMatrix * mv;
    if (age < 0.0 || age > life) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`;
const SHARD_FRAG = /* glsl */`
  varying vec2 vQ;
  varying float vFade, vLight, vBend, vTip;
  void main() {
    float x = vQ.x, y = vQ.y + vBend * (1.0 - x * x);
    float hw = sqrt(max(1.0 - x * x, 0.0)) * mix(0.92, vTip, smoothstep(-0.4, 1.0, x));     // round at its back, to a point (or not)
    float d = abs(y) - hw;                                    // (< 0 in it; in its half-widths)
    float aa = fwidth(d) + 1e-4;
    float k = 1.0 - smoothstep(-aa, aa, d);
    if (k <= 0.001) discard;
    float rim = smoothstep(-0.32, -0.02, d);
    vec3 col = mix(vec3(0.05, 0.07, 0.18), vec3(0.14, 0.2, 0.42), vLight * (0.5 + 0.5 * sign(y) * min(abs(y) / max(hw, 1e-3), 1.0)));
    col = mix(col, vec3(0.3, 0.45, 0.85), rim * 0.4);
    gl_FragColor = vec4(col * k, k) * vFade;
  }`;

// ---- the lightning: one strip through all of it. Each point: where it is, which way its line goes there, which side
// of it (x), how far along it (y), half its width (z, m: its glow's), what it is (w: 0 white, 1 purple, 2 a straight
// streak of light)
const LIGHT_VERT = /* glsl */`
  attribute vec3 aWay;
  attribute vec4 aS;
  attribute float aA;
  uniform vec2 uNear;
  varying vec2 vS;
  varying float vKind, vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 dv = mat3(modelViewMatrix) * aWay;
    vec2 d = dv.xy;
    float l = length(d);
    d = l > 1e-5 ? d / l : vec2(1.0, 0.0);
    mv.xy += vec2(-d.y, d.x) * aS.x * aS.z;
    vS = aS.xy; vKind = aS.w;
    vA = aA * smoothstep(uNear.x, uNear.y, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const LIGHT_FRAG = /* glsl */`
  uniform float uNight;
  varying vec2 vS;
  varying float vKind, vA;
  void main() {
    float x = vS.x;
    float isP = step(0.5, vKind) * (1.0 - step(1.5, vKind)), isS = step(1.5, vKind);
    float heart = exp(-x * x * mix(26.0, 18.0, isS));
    float glow = exp(-x * x * 3.0);
    float tip = 1.0 - smoothstep(0.8, 1.0, vS.y) * (1.0 - isS) - isS * smoothstep(0.5, 1.0, vS.y) * 0.85;
    vec3 gc = mix(mix(vec3(0.3, 0.6, 1.0), vec3(0.62, 0.3, 1.0), isP), vec3(0.45, 0.88, 1.0), isS);
    vec3 cc = mix(vec3(0.96, 0.99, 1.0), vec3(0.98, 0.88, 1.0), isP);
    float a = (heart * 0.9 + glow * 0.22) * tip * vA;
    vec3 col = (cc * heart + gc * glow * 0.7 * (1.0 + 0.4 * uNight)) * tip * vA;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(a, 0.0, 1.0));
  }`;

// ---- the bolts in flight: one square each, from its tail to a little past its head, turned to the eye; drawn by its
// shader in half-widths (x from its tail, y across)
//   aH: its head (x, y, z), its length (m);  aW: the way it goes (x, y, z), half its width (m);  aK: what it is, a number
//   of its own, how much of it there is, 0
const BOLT_VERT = /* glsl */`
  attribute vec2 corner;
  attribute vec4 aH, aW, aK;
  varying vec2 vQ;
  varying float vLen, vKind, vSeed, vA;
  void main() {
    vec4 h = viewMatrix * vec4(aH.xyz, 1.0), t = viewMatrix * vec4(aH.xyz - aW.xyz * aH.w, 1.0);
    vec2 d = h.xy - t.xy;
    float l = length(d);
    vec2 along = l > 1e-5 ? d / l : vec2(1.0, 0.0);
    vec2 side = vec2(-along.y, along.x);
    float sx = corner.x * 0.5 + 0.5;
    vec4 p = mix(t, h, sx);
    p.xy += along * aW.w * 2.2 * sx + side * corner.y * aW.w * 2.0;          // (room for its glow all round)
    vLen = l / max(aW.w, 1e-4);
    vQ = vec2(sx * (vLen + 2.2), corner.y * 2.0);
    vKind = aK.x; vSeed = aK.y; vA = aK.z;
    gl_Position = projectionMatrix * p;
    if (aK.z <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }`;
const BOLT_FRAG = /* glsl */`
  uniform float uTime, uNight;
  varying vec2 vQ;
  varying float vLen, vKind, vSeed, vA;
  void main() {
    float y = vQ.y;
    float back = vLen - vQ.x;                                  // half-widths behind its head (less than 0: before it)
    float hd = length(vec2(max(back, -2.2) * 0.75, y));
    float heart = exp(-hd * hd * 5.0);
    float glow = exp(-hd * hd * 1.2);
    float along = clamp(back / max(vLen, 0.01), 0.0, 1.0);     // 0 at its head .. 1 at its tail
    // its strands: wavy lines behind it, coming together at its head, each a white heart in a glow
    float st = 0.0, sg = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float amp = (0.22 + 0.16 * fi) * smoothstep(0.0, 2.5, back);
      float yc = amp * sin(back * (1.1 + 0.37 * fi) - uTime * (19.0 + 3.0 * fi) + vSeed * 7.0 + fi * 2.1);
      float wv = (0.12 - 0.02 * fi) * (1.0 - 0.7 * along);
      float dd = (y - yc) / wv;
      float on = step(0.0, back) * (1.0 - smoothstep(0.5, 1.0, along)) * (1.0 - 0.18 * fi);
      st += exp(-dd * dd * 2.0) * on; sg += exp(-dd * dd * 0.25) * on;
    }
    st = min(st, 1.0); sg = min(sg, 1.0);
    float isBack = step(0.5, vKind);
    vec3 body = mix(vec3(0.38, 0.88, 1.0), vec3(0.6, 0.76, 1.0), isBack);
    vec3 col = vec3(1.0) * heart + vec3(1.0) * st * 0.7 + body * sg * 0.5 + mix(vec3(0.2, 0.55, 1.0), vec3(0.45, 0.35, 1.0), isBack) * glow * 0.55;
    float a = heart * 0.95 + st * 0.5 + sg * 0.15 + glow * 0.2;
    col *= (1.0 + 0.15 * uNight) * vA; a *= vA;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(a, 0.0, 1.0));
  }`;

// ---------------------------------------------------------------------------------------------------------------------
export function createReflectBarrierFx({ seed = 5, heightAt = null } = {}) {
  const object = new THREE.Group();
  object.name = 'reflectBarrierFx';
  object.renderOrder = 100;                      // (after the world's own see-through things: README, "Over water")
  const rand = seeded(seed);
  const between = (a, b) => a + (b - a) * rand();
  const pics = makePictures(seed);
  const near = { value: new THREE.Vector2(REFLECT_FX.near.none, REFLECT_FX.near.whole) };
  const nightU = { value: 0 }, clockU = { value: 0 };
  const made = [];
  const material = o => {
    const m = new THREE.ShaderMaterial({ depthWrite: false, transparent: true, side: THREE.DoubleSide, forceSinglePass: true, ...BLEND, ...o });
    m.userData.noGrade = true; made.push(m); return m;
  };
  const put = (geo, mat, order) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = order; object.add(m); return m; };
  let clock = 0, night = false, viewH = 900;
  const later = [];                              // things to do at a time to come: { at, fn }
  const after = (dt, fn) => later.push({ at: clock + dt, fn });
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

  // ---- the dome, and the glow round its edge
  const ball = new THREE.SphereGeometry(1, 72, 44);
  const domeU = {
    uStreams: { value: pics.streams }, uCracks: { value: pics.cracks },
    uTime: clockU, uAlpha: { value: 0 }, uLines: { value: 0 }, uCharge: { value: 0 }, uBase: { value: 0 }, uFlow: { value: REFLECT_FX.dome.flow },
    uCrackR: { value: 0 }, uCrackA: { value: 0 }, uPurple: { value: 0 }, uStar: { value: 0 }, uGround: { value: -0.37 },
    uR: { value: REFLECT_FX.dome.r }, uNight: nightU, uWhite: { value: 0 }, uLod: { value: new THREE.Vector2(0, 3.2) },
    uHit: { value: new THREE.Vector3(0, 0, 1) }, uE1: { value: new THREE.Vector3(1, 0, 0) }, uE2: { value: new THREE.Vector3(0, 1, 0) },
    uTurn: { value: new THREE.Vector4(1, 0, 1, 0) }, uPick: { value: new THREE.Vector2(1, 0) },
    uRing0: { value: new THREE.Vector4(0, 0, 1, -1) }, uRing1: { value: new THREE.Vector4(0, 0, 1, -1) }, uRing2: { value: new THREE.Vector4(0, 0, 1, -1) },
    uNear: near,
  };
  const farWall = put(ball, material({ uniforms: { ...domeU, uBack: { value: 1 } }, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide }), 1);
  const nearWall = put(ball, material({ uniforms: { ...domeU, uBack: { value: 0 } }, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.FrontSide }), 2);
  const square = new THREE.PlaneGeometry(2, 2);
  const haloU = { uPos: { value: new THREE.Vector3() }, uSize: { value: 1 }, uPull: { value: 0 }, uAspect: { value: 1 }, uSpin: { value: 0 }, uRim: { value: 0.74 }, uAlpha: { value: 0 }, uCharge: domeU.uCharge, uNight: nightU, uWhite: domeU.uWhite };
  const halo = put(square, material({ uniforms: haloU, vertexShader: SPRITE_VERT, fragmentShader: HALO_FRAG }), 3);
  const dome = {
    on: false, center: new THREE.Vector3(), size: 1, ground: 0, formT: -1, fadeT: -1, strikeT: -1, popT: -1, hit: new THREE.Vector3(0, 0, 1),
    rings: [0, 1, 2].map(() => ({ dir: new THREE.Vector3(0, 0, 1), t: -99 })), ringTurn: 0, flickT: 0, flick: 1, pick: false, turn: 0, crackles: 0, sparkT: 0, purpleT: 0, starOn: null,
  };
  const radius = () => REFLECT_FX.dome.r * dome.size;
  let scaleNow = 1;
  const hitPoint = out => out.copy(dome.hit).multiplyScalar(radius() * scaleNow).add(dome.center);

  // ---- the ring as it is raised, the disc, the dust
  const ringU = { uU: { value: 0 }, uNight: nightU };
  const ring = put(square, material({ uniforms: ringU, vertexShader: RING_VERT, fragmentShader: RING_FRAG }), 0);
  ring.rotation.x = -Math.PI / 2;
  const ringS = { t0: -99, on: false };
  const DISC_RINGS = 14, DISC_ROUND = 72;
  const discGeo = (() => {
    const pos = [], idx = [];
    pos.push(0, 0, 0);
    for (let i = 1; i <= DISC_RINGS; i++) for (let j = 0; j < DISC_ROUND; j++) { const r = i / DISC_RINGS, a = j / DISC_ROUND * 2 * Math.PI; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
    for (let j = 0; j < DISC_ROUND; j++) idx.push(0, 1 + (j + 1) % DISC_ROUND, 1 + j);
    for (let i = 1; i < DISC_RINGS; i++) for (let j = 0; j < DISC_ROUND; j++) {
      const a = 1 + (i - 1) * DISC_ROUND + j, b = 1 + (i - 1) * DISC_ROUND + (j + 1) % DISC_ROUND, c = a + DISC_ROUND, d = b + DISC_ROUND;
      idx.push(a, b, d, a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    return g;
  })();
  const discU = {
    uBlots: { value: pics.blots }, uCracks: { value: pics.cracks }, uMax: { value: 1 }, uDrop: { value: 0 }, uRad: { value: 1 }, uHole: { value: 0 },
    uAlpha: { value: 0 }, uLight: { value: 0 }, uNight: nightU, uSpin: { value: 0 }, uTurn: { value: new THREE.Vector4(1, 0, 1, 0) }, uPick: { value: new THREE.Vector2(1, 0) },
  };
  const disc = put(discGeo, material({ uniforms: discU, vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 0);
  const discS = { t0: -99, size: 1, on: false, flickT: 0 };
  const dustGeo = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true).translate(0, 0.5, 0);
  const dust = put(dustGeo, material({ uniforms: { uU: { value: 0 }, uAlpha: { value: 1 } }, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG }), 5);
  const dustS = { t0: -99, size: 1, on: false };

  // ---- the flashes, the star, the burst, the flares (kind 0 .. 3)
  const sprites = Array.from({ length: SPRITES }, () => {
    const mat = material({
      uniforms: {
        uPos: { value: new THREE.Vector3() }, uSize: { value: 1 }, uPull: { value: 0 }, uAspect: { value: 1 }, uSpin: { value: 0 }, uKind: { value: 0 },
        uAge: { value: 0 }, uLife: { value: 1 }, uSeed: { value: 0 }, uFade: { value: 1 }, uNight: nightU, uTime: clockU,
      },
      vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG,
    });
    return { mesh: put(square, mat, 9), u: mat.uniforms, on: false, t0: 0, life: 1, kind: 0, at: new THREE.Vector3(), to: null, drift: 0, onDome: false, size: 1 };
  });
  let spriteTurn = 0;
  // aspect: a flare's length, of its thickness; spin: which way it lies on the picture (0 across)
  function sprite(kind, at, size, life, { onDome = false, to = null, drift = 0, pull = 0.4, aspect = 1, spin = 0 } = {}) {
    let s = sprites.find(x => !x.on);
    if (!s) s = sprites[spriteTurn++ % SPRITES];
    s.on = true; s.kind = kind; s.t0 = clock; s.life = life; s.at.copy(at); s.size = size; s.onDome = onDome; s.to = to ? to.clone() : null; s.drift = drift;
    s.u.uKind.value = kind; s.u.uLife.value = life; s.u.uSeed.value = rand() * 10; s.u.uSize.value = size; s.u.uPull.value = pull; s.u.uFade.value = 1; s.u.uAge.value = 0;
    s.u.uAspect.value = aspect; s.u.uSpin.value = spin;
    s.u.uPos.value.copy(at);
    s.mesh.visible = true;
    return s;
  }

  // ---- needles, dashes, sparkles, puffs
  const sparkGeo = new THREE.InstancedBufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  sparkGeo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
  sparkGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const sA = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 4).fill(-1e5), 4), sB = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 4), 4);
  const sC = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 4), 4), sD = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 4), 4);
  for (const [n, at] of [['aA', sA], ['aB', sB], ['aC', sC], ['aD', sD]]) { at.setUsage(THREE.DynamicDrawUsage); sparkGeo.setAttribute(n, at); }
  sparkGeo.instanceCount = SPARKS;
  const sparkU = { uTime: clockU, uCenter: { value: new THREE.Vector3() }, uNear: near, uNight: nightU };
  const sparks = put(sparkGeo, material({ uniforms: sparkU, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG }), 10);
  let sparkTurn = 0, sparkDirty = false, sparkEnd = -1;
  // kind 0 a needle, 1 a dash, 2 a sparkle, 3 a puff. p: where (from the dome's middle if follow), v: m/s; w: the
  // half-width of its glow (its heart a third of it)
  function spark(kind, p, v, life, w, streak, { up = 0, drag = 2, follow = 0, wait = 0 } = {}) {
    const i = sparkTurn++ % SPARKS;
    sA.array.set([p.x, p.y, p.z, clock + wait], i * 4);
    sB.array.set([v.x, v.y, v.z, life], i * 4);
    sC.array.set([w, streak, kind, rand()], i * 4);
    sD.array.set([up, drag, follow, 0], i * 4);
    sparkDirty = true; sparkEnd = Math.max(sparkEnd, clock + wait + life);
  }

  // ---- the shards: flakes of its dark glass (a fang, a pebble), one square each, instanced
  const shardGeo = new THREE.InstancedBufferGeometry();
  shardGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  shardGeo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
  shardGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const zA = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 4).fill(-1e5), 4), zV = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 4), 4);
  const zS = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 4), 4), zZ = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 4), 4);
  for (const [n, at] of [['aP', zA], ['aV', zV], ['aS', zS], ['aZ', zZ]]) { at.setUsage(THREE.DynamicDrawUsage); shardGeo.setAttribute(n, at); }
  shardGeo.instanceCount = SHARDS;
  const shards = put(shardGeo, material({ uniforms: { uTime: clockU, uNear: near }, vertexShader: SHARD_VERT, fragmentShader: SHARD_FRAG }), 9.5);      // (over the burst)
  let shardTurn = 0, shardDirty = false, shardEnd = -1;
  // a flake: p where, v its speed (m/s), life (s), w its half-width (m); long: its length, of its width (a fang 3 .. 5,
  // a pebble 1.2 .. 1.8); spin: rad/s it turns in the picture; fall: m/s² down; bend: how it curves; tip: how wide at
  // its tip (a fang's sharp, 0.2; a pebble's blunt)
  function shard(p, v, life, w, { wait = 0, long = 4, spin = between(-4, 4), fall = 3.5, bend = between(-0.25, 0.25), tip = 0.2 } = {}) {
    const i = shardTurn++ % SHARDS;
    zA.array.set([p.x, p.y, p.z, clock + wait], i * 4);
    zV.array.set([v.x, v.y, v.z, life], i * 4);
    zS.array.set([spin, between(3, 9) * (rand() < 0.5 ? -1 : 1), long, fall], i * 4);
    zZ.array.set([w, rand(), bend, tip], i * 4);
    shardDirty = true; shardEnd = Math.max(shardEnd, clock + wait + life);
  }

  // ---- the lightning
  const LV = LIGHTS * LIGHT_PTS * 2;
  const lPos = new Float32Array(LV * 3), lWay = new Float32Array(LV * 3), lS = new Float32Array(LV * 4), lA = new Float32Array(LV);
  const lightGeo = new THREE.BufferGeometry();
  const lPosA = new THREE.BufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage), lWayA = new THREE.BufferAttribute(lWay, 3).setUsage(THREE.DynamicDrawUsage);
  const lSA = new THREE.BufferAttribute(lS, 4).setUsage(THREE.DynamicDrawUsage), lAA = new THREE.BufferAttribute(lA, 1).setUsage(THREE.DynamicDrawUsage);
  lightGeo.setAttribute('position', lPosA); lightGeo.setAttribute('aWay', lWayA); lightGeo.setAttribute('aS', lSA); lightGeo.setAttribute('aA', lAA);
  {
    const idx = [];
    for (let b = 0; b < LIGHTS; b++) for (let i = 0; i < LIGHT_PTS - 1; i++) {
      const v = (b * LIGHT_PTS + i) * 2;
      idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    }
    lightGeo.setIndex(idx);
  }
  const lights = put(lightGeo, material({ uniforms: { uNear: near, uNight: nightU }, vertexShader: LIGHT_VERT, fragmentShader: LIGHT_FRAG }), 8);
  const bolts = Array.from({ length: LIGHTS }, () => ({ on: false, kind: 0, t0: 0, life: 0, every: 0.05, next: 0, w: 0.02, make: null, onDome: false, pts: [], alpha: 1, fadeIn: 0.02 }));
  // a bolt of lightning: `make(pts)` fills its points (in the world, or from the dome's middle if onDome), made anew
  // every `every` s. w: the half-width of its glow (its heart about a fifth of it)
  function bolt(kind, life, w, make, { every = 0.05, onDome = false, wait = 0, fadeIn = 0.012 } = {}) {
    let b = bolts.find(x => !x.on);
    if (!b) b = bolts.reduce((o, x) => (x.t0 + x.life < o.t0 + o.life ? x : o));
    Object.assign(b, { on: true, kind, t0: clock + wait, life, w, make, every, next: clock + wait, onDome, alpha: 1, fadeIn });
    b.pts.length = 0;
    return b;
  }
  // points of a jagged line from a to b: n points, out of line by up to `amp` (m), most in the middle
  function jagged(pts, a, b, n, amp) {
    const dir = v1.subVectors(b, a).clone();
    const len = dir.length(); dir.normalize();
    const s1 = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? THREE.Object3D.DEFAULT_UP : new THREE.Vector3(1, 0, 0)).normalize();
    const s2 = new THREE.Vector3().crossVectors(dir, s1);
    pts.length = 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), env = Math.sin(Math.PI * t) * 0.85 + 0.15 * (t > 0 ? 1 : 0);
      const o1 = (rand() - 0.5) * 2 * amp, o2 = (rand() - 0.5) * 2 * amp;
      const along = t + (i > 0 && i < n - 1 ? (rand() - 0.5) * 0.5 / n : 0);
      pts.push(new THREE.Vector3().copy(a).addScaledVector(dir, along * len).addScaledVector(s1, o1 * env).addScaledVector(s2, o2 * env));
    }
    return pts;
  }
  // a zigzag on the dome from `from` (a way on the ball) heading `head` (a way along it), `len` (rad), as points on it
  // (from its middle, in m)
  function onBall(pts, from, head, len, n, r) {
    pts.length = 0;
    const p = from.clone(), h = head.clone().sub(v1.copy(from).multiplyScalar(head.dot(from))).normalize();
    let turn = rand() < 0.5 ? -1 : 1;
    const step = len / (n - 1);
    for (let i = 0; i < n; i++) {
      pts.push(p.clone().multiplyScalar(r * 1.012));
      if (rand() < 0.7) turn = -turn;                    // (kinked as lightning is: not a row of Ws)
      const side = v2.crossVectors(p, h).normalize();
      h.addScaledVector(side, turn * (0.3 + 0.7 * rand())).normalize();
      p.addScaledVector(h, step).normalize();
      h.sub(v1.copy(p).multiplyScalar(h.dot(p))).normalize();
    }
    return pts;
  }

  // ---- the bolts in flight
  const boltGeo = new THREE.InstancedBufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  boltGeo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
  boltGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const bH = new THREE.InstancedBufferAttribute(new Float32Array(BOLTS * 4), 4), bW = new THREE.InstancedBufferAttribute(new Float32Array(BOLTS * 4), 4), bK = new THREE.InstancedBufferAttribute(new Float32Array(BOLTS * 4), 4);
  for (const [n, at] of [['aH', bH], ['aW', bW], ['aK', bK]]) { at.setUsage(THREE.DynamicDrawUsage); boltGeo.setAttribute(n, at); }
  boltGeo.instanceCount = BOLTS;
  const flying = put(boltGeo, material({ uniforms: { uTime: clockU, uNight: nightU }, vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG }), 11);

  // ------------------------------------------------------------------------------------------------------------------
  // what happens
  function raise(center, size = 1, feet = null) {
    dome.on = true; dome.center.copy(center); dome.size = size;
    dome.formT = clock; dome.fadeT = -1; dome.strikeT = -1; dome.popT = -1; dome.starOn = null;
    for (const r of dome.rings) r.t = -99;
    dome.crackles = clock + between(0.6, 1.2); dome.sparkT = clock + 0.2;
    farWall.visible = nearWall.visible = halo.visible = true;
    const R = radius();
    // the ring of light over the ground at her feet (over the grass)
    const at = feet || v1.copy(center).setY(center.y - REFLECT_FX.dome.lift * R);
    ring.position.set(at.x, at.y + REFLECT_FX.disc.lift * size, at.z); ring.scale.setScalar(R * REFLECT_FX.ring.r);
    ringS.t0 = clock; ringS.on = true; ring.visible = true;
    // sparkles thrown out of it as it pops up, going with it
    for (let i = 0; i < REFLECT_FX.form.sparkles; i++) {
      const a = rand() * 2 * Math.PI, up = between(-0.3, 0.8), rr = R * between(0.6, 1.0) * Math.sqrt(Math.max(0.05, 1 - up * up));
      v1.set(Math.cos(a) * rr, up * R, Math.sin(a) * rr);
      const out = v2.copy(v1).normalize().multiplyScalar(between(0.3, 1.4));
      spark(2, v1, out, between(0.5, 1.0), between(0.05, 0.08) * size, 0, { drag: 4, follow: 1, wait: rand() * 0.12 });
    }
  }
  function place(center, size = 1, ground = null) {
    dome.center.copy(center); dome.size = size;
    dome.ground = ground === null ? center.y - REFLECT_FX.dome.lift * radius() : ground;
  }
  function ringAt(dir) { const r = dome.rings[dome.ringTurn++ % 3]; r.dir.copy(dir); r.t = clock; }
  // a flash with needles where a blow lands (the dome's, or a thing's): `out` the way the needles go most; the long line
  // of light across the picture through it; `bits` dark bits of glass thrown off
  function flashAt(point, out, back, size, count, life, bits = 0) {
    sprite(0, point, 1.25 * size, life);
    const [fl, th, long] = REFLECT_FX.flare.hit;
    sprite(3, point, th * size, fl * life / REFLECT_FX.strike.flash, { aspect: long, pull: 0.45 });
    for (let i = 0; i < count; i++) {
      v1.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      v1.addScaledVector(out, rand() * 0.3).normalize();
      const p = v2.copy(point).addScaledVector(v1, between(0.08, 0.3) * size);
      spark(0, p, v1.multiplyScalar(between(2.0, 7.0) * size), between(0.2, 0.34), between(0.035, 0.052) * size, between(0.05, 0.09), { drag: 3, wait: between(0.012, 0.05) });
    }
    for (let i = 0; i < bits; i++) {
      v1.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().addScaledVector(out, 0.8).addScaledVector(back, 0.3).normalize();
      shard(point, v1.multiplyScalar(between(3, 7) * size), between(0.3, 0.5), between(0.02, 0.032) * size, { wait: 0.02 + rand() * 0.04, long: between(3.5, 5) });
    }
  }
  function strike(point, from) {
    if (!dome.on || dome.popT >= 0) return;
    const dir = v3.subVectors(point, dome.center).normalize().clone();
    const back = new THREE.Vector3().subVectors(from, point).normalize();
    const size = dome.size;
    if (dome.strikeT < 0) {
      dome.strikeT = clock; dome.hit.copy(dir); dome.turn = rand() * 6.283;
      const e1 = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? THREE.Object3D.DEFAULT_UP : new THREE.Vector3(1, 0, 0)).normalize();
      domeU.uHit.value.copy(dir); domeU.uE1.value.copy(e1); domeU.uE2.value.crossVectors(dir, e1);
      ringAt(dir);
      const S = REFLECT_FX.strike;
      flashAt(point, dir, back, size, S.needles, S.flash, S.bits);
      // a line of light back the way the blow came (the clip's)
      const p0 = point.clone(), p1 = point.clone().addScaledVector(back, 2.6 * size);
      bolt(0, 0.26, 0.1 * size, pts => jagged(pts, p0, p1, 10, 0.09 * size), { every: 0.04 });
      // white lightning leaping off it, out and up (as the clip's)
      for (let i = 0; i < S.bolts; i++) {
        const way = new THREE.Vector3().copy(dir).multiplyScalar(0.8).addScaledVector(back, 0.35).add(v1.set(rand() - 0.5, between(0.3, 1.0), rand() - 0.5)).normalize();
        const len = between(0.7, 1.35) * size, q0 = point.clone().addScaledVector(dir, 0.04);
        bolt(0, S.boltLife, 0.085 * size, pts => jagged(pts, q0, v2.copy(q0).addScaledVector(way, len), 10, 0.13 * size), { wait: S.boltAt + i * 0.025, every: 0.04 });
      }
    } else {
      // another blow while it is so: taken in, a smaller flash
      ringAt(dir);
      flashAt(point, dir, back, size * 0.75, 22, REFLECT_FX.strike.flash * 0.8);
    }
  }
  function reflect(targets = []) {
    if (!dome.on || dome.popT >= 0) return null;
    const size = dome.size, R = radius();
    const at = hitPoint(new THREE.Vector3());
    const center = dome.center.clone(), ground = dome.ground;
    dome.popT = clock; hide();                           // (gone at once, as the clip's: the burst is all there is)
    for (const b of bolts) if (b.on && b.onDome) b.on = false;       // (the lightning on the dome goes with it)
    for (const s of sprites) if (s.on && s.onDome) { s.on = false; s.mesh.visible = false; }
    // the burst between where it was struck and her (as the clip's: round her hand), drifting a little more towards her
    // as it swells; the long line of light across the picture through it, and a short one up and down
    const B = REFLECT_FX.burst;
    const mid = at.clone().lerp(v1.copy(center).setY(at.y), B.from), midTo = center.clone().setY(at.y);
    sprite(2, mid, B.size * size, B.life, { to: midTo, drift: B.drift, pull: 0 });
    const heart = mid.clone().lerp(midTo, B.drift * 0.7);              // (where it is, about, as things fly out of it)
    const [fl, th, long] = REFLECT_FX.flare.burst;
    sprite(3, at, th * size, fl, { aspect: long, pull: 1.0 * size });
    sprite(3, at, th * 0.8 * size, fl * 0.45, { aspect: long * 0.25, spin: Math.PI / 2, pull: 1.0 * size });
    // long lines of light back the way each blow came (the blow thrown back goes along it)
    for (const t of targets) {
      const way = v1.subVectors(t, at); const len = Math.min(way.length(), 9 * size); way.normalize();
      const p0 = at.clone(), p1 = at.clone().addScaledVector(way, len);
      bolt(2, 0.24, 0.07 * size, pts => { pts.length = 0; for (let i = 0; i < 4; i++) pts.push(p0.clone().lerp(p1, i / 3)); return pts; }, { every: 10 });
    }
    // purple lightning out of it, from within it out past its rim
    const F = REFLECT_FX.flash;
    for (let i = 0; i < F.n; i++) {
      const way = new THREE.Vector3(rand() - 0.5, between(-0.3, 0.8), rand() - 0.5).normalize();
      const from = heart.clone().addScaledVector(way, between(0.1, 0.4) * size);
      const len = between(F.len[0], F.len[1]) * size;
      bolt(1, F.life, 0.1 * size, pts => jagged(pts, from, v2.copy(from).addScaledVector(way, len), 11, 0.2 * size), { wait: F.at + rand() * 0.1, every: 0.04 });
    }
    // its glass flying off as dark flakes, as the clip's: first a few fangs out of the burst's edge (more out the way it
    // was struck, and up), pointing the way they fly; then, as it clears, pebbles thrown out from all round its rim,
    // drifting up and out and falling
    const Z = REFLECT_FX.shards;
    const look = new THREE.Vector3().subVectors(heart, camPos).normalize();      // (they fly across the picture, as the
    const across = d => d.addScaledVector(look, -d.dot(look) * 0.75).normalize();  // clip's do: few at the eye)
    for (let i = 0; i < Z.fangs; i++) {
      across(v1.set(rand() - 0.5, between(0.0, 0.9), rand() - 0.5).normalize().addScaledVector(dome.hit, 0.3));
      const p = heart.clone().addScaledVector(v1, between(0.4, 0.75) * size);
      const v = v1.clone().multiplyScalar(between(Z.speed[0], Z.speed[1]) * size); v.y += between(Z.up[0], Z.up[1]) * size;
      shard(p, v, between(Z.life[0], Z.life[1]), between(Z.fang[0], Z.fang[1]) * size, { wait: Z.at + rand() * 0.08, long: between(3.2, 4.6), spin: between(-1.5, 1.5), fall: 2 });
    }
    for (let i = 0; i < Z.pebbles; i++) {
      across(v1.set(rand() - 0.5, between(-0.4, 0.5), rand() - 0.5).normalize());
      const p = heart.clone().addScaledVector(v1, between(0.55, 0.95) * size);
      const v = v1.clone().multiplyScalar(between(1.2, 2.8) * size); v.y += between(0.1, 0.9) * size;
      shard(p, v, between(0.6, 1.0), between(Z.pebble[0], Z.pebble[1]) * size, { wait: Z.pebbleAt + rand() * 0.16, long: between(1.15, 1.6), spin: between(-6, 6), fall: 4, tip: between(0.55, 0.8), bend: between(-0.15, 0.15) });
    }
    // the disc thrown out over the ground, the dust over its edge
    layDisc(center, ground, size);
    // dashes of light flung out of the burst as it clears, up and out, left hanging as sparkles low round her
    const D = REFLECT_FX.dashes;
    for (let i = 0; i < D.n; i++) {
      v1.set(rand() - 0.5, between(-0.2, 0.75), rand() - 0.5).normalize();
      const p = heart.clone().addScaledVector(v1, between(0.05, 0.55) * size);
      const v = v1.clone().multiplyScalar(between(D.speed[0], D.speed[1]) * size);
      spark(1, p, v, between(D.life[0], D.life[1]), between(0.035, 0.055) * size, 0.035, { drag: 3.6, up: -0.6, wait: D.at + rand() * 0.1 });
    }
    for (let i = 0; i < D.sparkles; i++) {
      const a = rand() * 2 * Math.PI, r = R * Math.sqrt(rand()) * 2.3;
      const p = new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
      p.y = groundAt(p.x, p.z, ground) + between(0.15, 2.2) * size;
      spark(2, p, v2.set((rand() - 0.5) * 0.4, between(-0.18, 0.08), (rand() - 0.5) * 0.4), between(D.sparkleLife[0], D.sparkleLife[1]), between(0.055, 0.09) * size, 0, { drag: 0.8, wait: 0.18 + rand() * 0.4 });
    }
    // little lightning on the ground after, and dust at the disc's edge
    const K = REFLECT_FX.crackles;
    for (let t = K.from; t < K.to; t += K.every * between(0.6, 1.4)) {
      after(t, () => {
        const a = rand() * 2 * Math.PI, r = between(0.8, 3.4) * size;
        const p0 = new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
        p0.y = groundAt(p0.x, p0.z, ground) + 0.18;
        const h = rand() * 2 * Math.PI, len = between(K.len[0], K.len[1]) * size;
        const p1 = new THREE.Vector3(p0.x + Math.cos(h) * len, 0, p0.z + Math.sin(h) * len);
        p1.y = groundAt(p1.x, p1.z, ground) + 0.18;
        bolt(rand() < 0.6 ? 1 : 0, between(0.08, 0.14), 0.07 * size, pts => jagged(pts, p0, p1, 7, 0.08 * size), { every: 0.04 });
      });
    }
    const P = REFLECT_FX.puffs;
    for (let i = 0; i < P.n; i++) {
      const a = (i + rand() * 0.6) / P.n * 2 * Math.PI, r = between(2.4, 3.6) * size;
      const p = new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
      p.y = groundAt(p.x, p.z, ground) + 0.25 * size;
      spark(3, p, v2.set(Math.cos(a) * 0.8, 0.3, Math.sin(a) * 0.8), between(0.6, 0.9), between(0.3, 0.45) * size, 0, { drag: 1.6, wait: P.at + rand() * 0.25 });
    }
    return at;
  }
  const groundAt = (x, z, fallback) => (heightAt ? heightAt(x, z) : fallback);
  function layDisc(center, ground, size) {
    const D = REFLECT_FX.disc, max = D.r1 * size * 1.25;
    const p = disc.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = center.x + p.getX(i) * max, z = center.z + p.getZ(i) * max;
      p.setY(i, groundAt(x, z, ground) - ground + D.lift);
    }
    p.needsUpdate = true;
    disc.position.set(center.x, ground, center.z);
    discU.uMax.value = max; discU.uSpin.value = rand() * 6.28;
    discS.t0 = clock + D.at; discS.size = size; discS.on = true;
    dust.position.set(center.x, ground + 0.12 * size, center.z);
    dustS.t0 = clock + REFLECT_FX.dust.at; dustS.size = size; dustS.on = true;
  }
  function fade() {
    if (!dome.on || dome.fadeT >= 0 || dome.popT >= 0) return;
    dome.fadeT = clock;
    const R = radius();
    for (let i = 0; i < 22; i++) {
      v1.set(rand() - 0.5, between(-0.25, 0.9), rand() - 0.5).normalize().multiplyScalar(R * between(0.85, 1.0));
      spark(2, v1.add(dome.center), v2.set((rand() - 0.5) * 0.4, between(0.1, 0.5), (rand() - 0.5) * 0.4), between(0.5, 0.9), 0.06 * dome.size, 0, { drag: 1, wait: rand() * 0.2 });
    }
  }
  function hide() { dome.on = false; farWall.visible = nearWall.visible = halo.visible = false; }
  function drop() { hide(); for (const b of bolts) if (b.onDome) b.on = false; for (const s of sprites) if (s.onDome) { s.on = false; s.mesh.visible = false; } }
  function impact(at, from, size = 1) {
    const back = v3.subVectors(from, at).normalize().clone();
    flashAt(at, back, back, size, 26, 0.3);
    for (let i = 0; i < 2; i++) {
      const way = back.clone().add(v1.set(rand() - 0.5, between(0.2, 0.9), rand() - 0.5)).normalize();
      const p0 = at.clone(), len = between(0.5, 1.0) * size;
      bolt(i ? 1 : 0, 0.18, 0.07 * size, pts => jagged(pts, p0, v2.copy(p0).addScaledVector(way, len), 8, 0.1 * size), { wait: 0.02 * i, every: 0.04 });
    }
    for (let i = 0; i < 8; i++) {
      v1.set(rand() - 0.5, between(0.2, 1), rand() - 0.5).normalize().add(back).normalize();
      shard(at, v1.multiplyScalar(between(2.5, 6) * size), between(0.35, 0.6), between(0.025, 0.045) * size, { long: between(2.5, 4) });
    }
  }
  function setBolts(list) {
    let n = 0;
    for (let i = 0; i < BOLTS; i++) {
      const b = list[i];
      if (!b) { bK.array[i * 4 + 2] = 0; continue; }
      n++;
      bH.array.set([b.head.x, b.head.y, b.head.z, b.len], i * 4);
      bW.array.set([b.way.x, b.way.y, b.way.z, b.wide], i * 4);
      bK.array.set([b.kind || 0, b.seed || 0, b.alpha === undefined ? 1 : b.alpha, 0], i * 4);
    }
    bH.needsUpdate = bW.needsUpdate = bK.needsUpdate = true;
    flying.visible = n > 0;
  }

  // ------------------------------------------------------------------------------------------------------------------
  const camPos = new THREE.Vector3();
  function update(dt, camera = null) {
    clock += dt;
    clockU.value = clock;
    for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= clock) { const f = later[i].fn; later.splice(i, 1); f(); }
    const R = radius();
    // ---- the dome
    if (dome.on) {
      const F = REFLECT_FX.form, tf = clock - dome.formT;
      const form = clamp(tf / F.time, 0, 1);
      let alpha = sstep(0, 0.3, form), lines = sstep(F.lines[0], F.lines[1], form);
      let scale = lerp(F.from, 1, outBack(form));
      let white = (1 - sstep(0, F.white, tf)) * 0.9;
      const base = 0.3 + 0.7 * sstep(0.05, 0.4, form) * (1 - sstep(0.8, 2.6, tf / F.time));
      if (dome.fadeT >= 0) {
        const u = (clock - dome.fadeT) / REFLECT_FX.fade;
        alpha *= 1 - sstep(0.1, 1, u); lines *= 1 - sstep(0, 0.6, u); scale *= 1 + 0.06 * sstep(0, 1, u);
        if (u >= 1) hide();
      }
      let charge = 0, crackR = 0, crackA = 0, purple = 0, star = 0;
      if (dome.strikeT >= 0) {
        const S = REFLECT_FX.strike, C = REFLECT_FX.charge, ts = clock - dome.strikeT;
        lines *= 1 - sstep(S.dim[0], S.dim[1], ts);
        charge = 0.25 * sstep(0.02, 0.08, ts) + 0.75 * sstep(C.at, C.at + C.rise, ts);
        crackR = Math.PI * 1.08 * clamp((ts - C.at) / C.spread, 0, 1);
        if (clock >= dome.flickT) {
          // it flickers as the clip's does: the other set of bolts, turned a little about the way they lie (so the
          // bolts are still where they were, about, their zigzags new), the purple anywhere
          dome.flickT = clock + C.flick * between(0.7, 1.3);
          dome.pick = !dome.pick;
          const a1 = dome.turn + (rand() - 0.5) * 0.5, a2 = rand() * 6.283;
          domeU.uPick.value.set(dome.pick ? 1 : 0, dome.pick ? 0 : 1);
          domeU.uTurn.value.set(Math.cos(a1), Math.sin(a1), Math.cos(a2), Math.sin(a2));
          dome.flick = between(0.75, 1.0);
        }
        crackA = sstep(C.at - 0.01, C.at + 0.02, ts) * dome.flick;
        purple = (sstep(0.0, 0.03, ts) * (1 - sstep(0.06, 0.12, ts)) * 0.8 + 1.3 * sstep(C.purple, C.purple + 0.05, ts)) * (0.55 + 0.45 * rand());
        star = sstep(C.at - 0.02, C.at + 0.03, ts) * 1.2;
        white = Math.max(white, Math.exp(-ts / S.white) * 0.15);
        // it swells and trembles as it charges
        scale *= 1 + C.swell * sstep(C.at, C.at + 0.3, ts) + 0.006 * Math.sin(clock * 95) * sstep(C.at, C.at + 0.05, ts);
        // the star where the blow went in, and purple lightning round it, on the dome (going with it)
        if (ts >= C.at && !dome.starOn) dome.starOn = sprite(1, hitPoint(v1), 0.7 * dome.size, 30, { onDome: true, pull: 0.3 });
        if (ts >= C.purple && clock >= dome.purpleT) {
          dome.purpleT = clock + between(0.05, 0.1);
          for (let k = 0; k < 2; k++) {
            const from = dome.hit.clone(), head = v2.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().clone();
            bolt(1, between(0.07, 0.14), 0.075 * dome.size, pts => onBall(pts, from, head, between(0.22, 0.6), 11, radius() * scaleNow), { onDome: true, every: 0.04 });
          }
        }
      } else dome.starOn = null;
      // now and then a little lightning over it near its foot, and sparkles in it (the clip's, as it stands)
      if (dome.strikeT < 0 && dome.fadeT < 0 && dome.popT < 0 && tf > F.time) {
        if (clock >= dome.crackles) {
          dome.crackles = clock + between(0.9, 2.2);
          const a = rand() * 6.283, from = new THREE.Vector3(Math.cos(a), between(-0.25, 0.25), Math.sin(a)).normalize();
          const head = new THREE.Vector3(-Math.sin(a), between(-0.3, 0.3), Math.cos(a)).multiplyScalar(rand() < 0.5 ? -1 : 1);
          bolt(0, between(0.1, 0.18), 0.045 * dome.size, pts => onBall(pts, from, head, between(0.3, 0.6), 9, radius() * scaleNow), { onDome: true, every: 0.04 });
        }
        if (clock >= dome.sparkT) {
          dome.sparkT = clock + between(0.05, 0.1);
          const a = rand() * 2 * Math.PI, up = between(-0.32, 0.35), rr = R * between(0.55, 0.98) * Math.sqrt(Math.max(0.05, 1 - up * up));
          spark(2, v1.set(Math.cos(a) * rr, up * R, Math.sin(a) * rr), v2.set(0, between(0.05, 0.2), 0), between(0.8, 1.3), 0.05 * dome.size, 0, { drag: 0.5, follow: 1 });
        }
      }
      scaleNow = scale;
      for (const m of [farWall, nearWall]) { m.position.copy(dome.center); m.scale.setScalar(R * scale); }
      domeU.uAlpha.value = dome.on ? alpha : 0; domeU.uLines.value = lines; domeU.uBase.value = base;
      domeU.uCharge.value = charge; domeU.uCrackR.value = crackR; domeU.uCrackA.value = crackA; domeU.uPurple.value = purple;
      domeU.uStar.value = star; domeU.uWhite.value = clamp(white, 0, 1);
      domeU.uR.value = R * scale; domeU.uGround.value = clamp((dome.ground - dome.center.y) / (R * scale), -1.2, 0);
      for (let i = 0; i < 3; i++) { const r = dome.rings[i]; domeU['uRing' + i].value.set(r.dir.x, r.dir.y, r.dir.z, clock - r.t); }
      // how small a copy of the lines' picture to read, for how big the dome is on the picture (its hearts as they
      // are when it is close, smaller when far: no shimmer), and the glow round its edge, as big as its edge looks
      if (camera) {
        camPos.setFromMatrixPosition(camera.matrixWorld);
        const rr = R * scale, dist = Math.max(rr * 1.05, camPos.distanceTo(dome.center));
        const px = (camera.isPerspectiveCamera ? 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) : 1) * viewH / dist;      // pixels a metre there
        const lod = Math.max(0, Math.log2((2048 / (2 * Math.PI * rr)) / Math.max(px, 1e-3)));
        domeU.uLod.value.set(lod, lod + 3.2);
        const edge = rr * dist / Math.sqrt(Math.max(1e-4, dist * dist - rr * rr));      // its edge's radius, as seen
        haloU.uPos.value.copy(dome.center); haloU.uSize.value = edge * 1.35; haloU.uRim.value = 1 / 1.35;
      }
      haloU.uAlpha.value = dome.on ? alpha * (0.55 + 0.45 * lines) * (1 - 0.65 * charge) : 0;      // (struck: its edge dark, as the clip's)
    }
    sparkU.uCenter.value.copy(dome.center);
    // ---- the sprites
    for (const s of sprites) {
      if (!s.on) continue;
      const age = clock - s.t0;
      if (age > s.life) { s.on = false; s.mesh.visible = false; continue; }
      if (s.onDome) { if (!dome.on || dome.popT >= 0) { s.on = false; s.mesh.visible = false; continue; } hitPoint(s.u.uPos.value); }
      else if (s.to) s.u.uPos.value.copy(s.at).lerp(s.to, s.drift * (1 - Math.exp(-age * 9)));
      else s.u.uPos.value.copy(s.at);
      s.u.uAge.value = age;
      s.u.uFade.value = s.kind === 1 ? sstep(0, 0.04, age) : 1;
    }
    // ---- the ring as it is raised, the disc, the dust
    if (ringS.on) {
      const u = (clock - ringS.t0) / REFLECT_FX.ring.life;
      if (u > 1) { ringS.on = false; ring.visible = false; } else ringU.uU.value = u;
    }
    if (discS.on) {
      const D = REFLECT_FX.disc, age = clock - discS.t0, u = age / D.life;
      if (u > 1) { discS.on = false; disc.visible = false; }
      else if (age >= 0) {
        disc.visible = true;
        const g = 1 - Math.pow(1 - clamp(u * 1.4, 0, 1), 3);
        discU.uRad.value = lerp(D.r0, D.r1, g) * discS.size;
        discU.uHole.value = lerp(-0.2, 1.0, sstep(D.hole[0], D.hole[1], u));
        discU.uAlpha.value = sstep(0, 0.03, age) * (1 - sstep(0.7, 1, u));
        discU.uDrop.value = D.drop * discS.size * (1 - sstep(0, D.fall, age));
        if (clock >= discS.flickT) {
          discS.flickT = clock + 0.045;
          const pick = rand() < 0.5, a1 = rand() * 6.283;
          discU.uPick.value.set(pick ? 1 : 0, pick ? 0 : 1); discU.uTurn.value.set(Math.cos(a1), Math.sin(a1), 1, 0);
        }
        discU.uLight.value = sstep(0.08, 0.16, u) * (1 - sstep(0.6, 0.85, u)) * between(0.6, 1.0);
      }
    }
    if (dustS.on) {
      const age = clock - dustS.t0, u = age / REFLECT_FX.dust.life;
      if (u > 1) { dustS.on = false; dust.visible = false; }
      else if (age >= 0) {
        dust.visible = true;
        const r = discU.uRad.value * 1.07 + 0.25 * u;
        dust.scale.set(r, REFLECT_FX.dust.h * dustS.size * (0.7 + 0.5 * u), r);
        dust.material.uniforms.uU.value = u;
      }
    }
    // ---- the lightning
    let lit = false;
    for (let b = 0; b < LIGHTS; b++) {
      const L = bolts[b], base = b * LIGHT_PTS * 2;
      let show = false;
      if (L.on) {
        const age = clock - L.t0;
        if (age > L.life) L.on = false;
        else if (age >= 0) {
          if (clock >= L.next || !L.pts.length) { L.make(L.pts); L.next = clock + L.every; }
          show = L.pts.length > 1;
          L.alpha = sstep(0, L.fadeIn, age) * (1 - sstep(L.life * 0.55, L.life, age)) * (L.kind === 2 ? 1 : 0.75 + 0.25 * rand());
        }
      }
      if (!show) { for (let i = 0; i < LIGHT_PTS * 2; i++) lA[base + i] = 0; lPos.fill(0, base * 3, (base + LIGHT_PTS * 2) * 3); continue; }
      lit = true;
      const n = Math.min(LIGHT_PTS, L.pts.length);
      for (let i = 0; i < LIGHT_PTS; i++) {
        const k = Math.min(i, n - 1);
        const p = v1.copy(L.pts[k]);
        if (L.onDome) p.add(dome.center);
        const q = v2.copy(L.pts[Math.min(k + 1, n - 1)]), o = v3.copy(L.pts[Math.max(k - 1, 0)]);
        const way = q.sub(o);
        const t = k / (n - 1);
        const w = L.w * (L.kind === 2 ? 1 : 1 - 0.5 * t);
        for (const side of [0, 1]) {
          const v = base + i * 2 + side;
          lPos[v * 3] = p.x; lPos[v * 3 + 1] = p.y; lPos[v * 3 + 2] = p.z;
          lWay[v * 3] = way.x; lWay[v * 3 + 1] = way.y; lWay[v * 3 + 2] = way.z;
          lS[v * 4] = side ? 1 : -1; lS[v * 4 + 1] = t; lS[v * 4 + 2] = i < n ? w : 0; lS[v * 4 + 3] = L.kind;
          lA[v] = i < n ? L.alpha : 0;
        }
      }
    }
    lights.visible = lit;
    if (lit || lights.userData.was) { lPosA.needsUpdate = lWayA.needsUpdate = lSA.needsUpdate = lAA.needsUpdate = true; }
    lights.userData.was = lit;
    // ---- sparks, shards
    if (sparkDirty) { sA.needsUpdate = sB.needsUpdate = sC.needsUpdate = sD.needsUpdate = true; sparkDirty = false; }
    sparks.visible = clock < sparkEnd + 0.05;
    if (shardDirty) { zA.needsUpdate = zV.needsUpdate = zS.needsUpdate = zZ.needsUpdate = true; shardDirty = false; }
    shards.visible = clock < shardEnd + 0.05;
  }

  return {
    object,
    raise, place, strike, reflect, fade, drop, impact,
    bolts: setBolts,
    update,
    get up() { return dome.on; },
    get struck() { return dome.on && dome.strikeT >= 0; },
    get busy() { return dome.on || sparks.visible || shards.visible || lights.visible || discS.on || dustS.on || ringS.on || sprites.some(s => s.on) || later.length > 0; },
    get clock() { return clock; },
    hitPoint: out => hitPoint(out || new THREE.Vector3()),
    setNight(on) { night = !!on; nightU.value = night ? 1 : 0; },
    setView(heightPx) { viewH = heightPx || 900; },
    pictures: pics,
    dispose() {
      for (const m of made) m.dispose();
      for (const g of [ball, discGeo, dustGeo, square, sparkGeo, shardGeo, lightGeo, boltGeo]) g.dispose();
      for (const t of Object.values(pics)) t.dispose();
      object.removeFromParent();
    },
  };
}
