/* ==========================================================================
   spear-rain-fx.js  —  the lance thrown up into the sky, and what comes down: all that is seen of the spear rain
   (spear-rain.js: the attack button held, then flicked up). One job: draw it, and say when each spear lands. It
   decides nothing else: the move says where, and what a landing spear does to what stands there.

   Asked for on 23 Nov 2026 after ten seconds of a clip the user sent ("ดูเอฟเฟกต์ อยากได้แบบ ref"): the spear rain there
   had been (sky-spear.js, flat crystals under a drawn disc) "ออกมาไม่สวยเลย". The clip, beat by beat, and what is here:
     - she twirls the spear and a band of water follows its end round her          -> rain.twirl(): a band of water
     - it goes up, a broad ribbon of water wound round its way, beads of water     -> the lance (her own, the picture
       shed from it                                                                   magic-combo-fx.js has), a helix
     - where it stops a seal opens in the sky: small and white, then wide, its     -> the seal: three rings of marks
       face washed bright and a fringe of water thrown out round its rim; the         turning each its own way, drawn
       wash thins to line work: rings of runes, a seven-pointed star, a small star    once to a picture
     - lightning runs out from its middle, sparkles hang under it                  -> bolts, sparkles
     - spears take shape under it, points down, one after another round it         -> her lance's picture again
     - they fall, each on a streak of light; where one lands a crown of water      -> streaks; a splash and a crown
       stands up and falls, rings go out over the ground, drops fly                   of water, drops
     - last a great spear comes down the middle: a star of white needles, a tall   -> the same, greater; a star, a
       crown, a ring going out in the air, the ground under it awash                  hoop of water in the air
   The clip takes ten seconds; a move in a fight cannot, so from her hand to the great spear's landing is about three
   seconds (SPEAR_RAIN); a lance full grown, whose rain is three times as many and as long, five.
   And one thing the clip has not, asked after it: each spear stays a moment where it lands, stuck in the ground, and
   then goes, the first to land the first to go: a graveyard of spears that follows the rain (GRAVES).

   ITS WATER IS THE BASIC COMBO'S (the README: "The look of her magic", the same night: "หลังจากนี้ใช้ style ของสกิลคอมโบ
   พื้นฐานเป็น ref"). Nothing of water is drawn by a shader here; it is the clip's own painted water, the basic combo's
   pictures (assets/water-casts/water-*.webp, what is in them: water-casts.js there; read as magic-combo-fx.js reads
   them, TILED there):
     - where a spear lands: the splash (`hit`), a square turned to the camera, part of it in the ground so that it
       stands up out of it; under it a crown of water thrown outward over the ground (`blade` laid round a ring), as
       a leap's
     - the band behind the twirled lance, the ribbon wound round its way up: `blade` laid along them
     - round the seal as it opens, and in the air as the great spear lands: `blade` round a hoop
   The lance family keeps its own light, as the lance in her hand does (LANCE_LOOK): the seal's line work, the spears
   (the picture the user sent), the streaks, the four-pointed star in the seal's middle, the needles, the lightning.
   Drops are round beads of the water's aqua (WATER_LOOK). No soft light anywhere else.

     const rain = createSpearRainFx()
     scene.add(rain.object)                 (with the combo's light: after a page's dimming by night)
     rain.hold(point, dir, long, there)     every frame she has the lance in her hand in this move: its point, the way
                                            it points (unit), its length (m), how much of it is there (0..1)
     rain.twirl(at, dir, half)              every frame she twirls it: a place on it (m), the way it points (unit),
                                            half the band's width (m)
     rain.launch({ from, centre, ground, k, level, heading, long, keep })
                                            it leaves her hand at `from` for the sky over `centre` (the middle of where
                                            it will rain; its y is found from ground(x, z)); k: her size (1 at 1.75 m);
                                            level: how grown the lance was (0..3: more spears, wider; 3, full grown:
                                            another rain, see SPEAR_RAIN); keep { x, z, r }: no spear lands nearer
                                            that place than r m (her own); heading: the way
                                            she faces; long: the lance's length in her hand (m). Returns { portal,
                                            radius, lands: [Vector3], end, when }: the seal's middle, how wide it
                                            rains (m), where the spears will land, how long all of it takes (s), and
                                            when (s from now) the seal opens, the first spear is let go (fall) and lands,
                                            the last lands, the
                                            great spear: { open, first, last, great }
     rain.onStrike = s => …                 a spear lands: s { at, radius, great, index }
     rain.onBeat = what => …                'open' the seal opens; 'fall' the first spear is let go; 'great' the great
                                            spear is let go (for a page's sounds and camera)
     rain.update(dt, camera)                every frame
     rain.time                              s since it left her hand (-1: none); rain.busy: one is going (the spears
                                            that still stand where they landed are not counted: `rain.standing`)
     rain.portal, rain.radius               the seal's middle and how wide it rains, while one is going
     rain.stop()                            what is going is gone at once
     rain.setNight(on), rain.dispose()

   How it is drawn (as magic-combo-fx.js: laid over the picture with one blend, every material marked
   userData.noGrade; phone-safe shaders, no arrays, no loops; little of anything, for a weak phone held upright): the
   spears one instanced strip turned to the camera about each spear's own line, the streaks another; the splashes one
   instanced square, only as big as the water in the frame shown, one whole frame at a time; the crowns and hoops one
   instanced ring; the bands strips laid anew each frame, with a true width (broad seen flat, a line seen on edge); the
   seal one square, its lines from a picture drawn once (three layers, one in each colour of it, so each can turn by
   itself); drops, sparkles and flares instanced squares. A dozen draws at most.
   ========================================================================== */
import * as THREE from 'three';
import { WATER_SHEETS } from './assets/water-casts/water-casts.js?v=6';      // (?v: as magic-combo-fx.js names it, so that it is fetched once)

const WATER_AT = './assets/water-casts/';               // where the basic combo's water pictures are kept (water-<name>.webp)
const WATER_V = '?v=6';                                 // (and as magic-combo-fx.js asks for them)
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const backOut = t => { const u = clamp(t, 0, 1) - 1; return 1 + 2.70158 * u * u * u + 1.70158 * u * u; };
const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

// the lance's own light (magic-combo-fx.js' LANCE_LOOK), and the water's aqua for the drops (its WATER_LOOK)
export const LANCE_LOOK = { core: '#f6fffe', main: '#62ebf5', deep: '#1f86d8' };
export const WATER_LOOK = { core: '#effffe', main: '#5fe6e8', deep: '#169fb0' };
// when (s from the moment it leaves her hand) and how big (m at 1.75 m; by how grown the lance was, 0..3)
//   rise: s up to the seal; open: s the seal takes to open; form: the first and the last spear take shape, each in
//   `pop` s; fall: the first is let go, the next `every` s after (by how grown); drop: s a spear takes down
//   great: the great spear takes shape `after` s after the last has landed, in `form` s, and is `drop` s coming down
//   close: s the seal takes to break up once the great spear is down; end: s after that all of it is gone
//   high: the seal stands so far over the highest ground it rains on; seal: its radius; radius: how wide it rains;
//   spears: how many
// A LANCE FULL GROWN IS ANOTHER RAIN ("ถ้าชาจเต็ม ขอใหญ่ ศรเยอะๆ ฝนนานขึ้น", 23 Nov 2026): 66 spears where it had 18,
// over nearly twice the ground, a quarter more of them a second, and it goes on three times as long (2.3 s of rain
// where the others have a third to two thirds of a second); the seal a third wider again and higher, the great spear
// greater (`grand`). So many do not all hang under the seal first: those let go in the rain's first `first` s take shape as
// the seal opens, as a small rain's all do; each one after that takes shape `hang` s (and up to `linger` more) before
// it is let go, so the sky goes on making spears for as long as it rains
export const SPEAR_RAIN = {
  rise: 0.46, open: 0.5, form: [0.8, 1.32], pop: 0.18, fall: 1.52, every: [0.045, 0.045, 0.045, 0.036], drop: 0.22,
  first: 1.0, hang: 0.5, linger: 0.25,
  great: { after: 0.26, form: 0.36, drop: 0.2 }, close: 0.6, end: 1.35,
  high: [6.6, 6.6, 6.6, 7.6], seal: [3.4, 3.8, 4.2, 6.0], radius: [2.6, 3.0, 3.4, 5.2], spears: [8, 11, 14, 66],
  grand: [1, 1, 1, 1.3],        // the great spear, and the star it lands in, so many times as big
};
// THE SPEARS STAY WHERE THEY LAND, A MOMENT ("อยากให้มีหลังตกลงมาจะมีเอฟเฟคหอกปักพื้นสักพักก่อนแล้วค่อยสลายหาย เหมือนสุสานหอก",
// 23 Nov 2026: stuck in the ground, then gone; a graveyard of spears). Each stands where it struck, its point in the
// ground (`bury` of its length, and up to `deeper` more), come to rest leaning a little its own way (up to `lean` rad
// off the way it fell) with a quiver that dies in `quiver` s (`beats` times a second); the great spear in their
// middle, upright, and its blow shakes those that still stand about it (`shock`: rad, the nearest).
// EACH GOES BY ITS OWN CLOCK, THE FIRST TO LAND THE FIRST TO GO ("ตกแล้วปัก สลายทันที อันไหนปักก่อน สลายก่อน", the same
// night; they were first made to stand until the great spear was down and go together, then one after another from
// then: neither was what was meant): `stand` s after it struck it begins to go (the great one `last` times as long),
// and is gone in `gone` s: from its tail down to the ground, breaking up into small squares with a white edge where
// it goes and sparks rising off it (`sparks` a spear; the great one's `great`). So through a long rain there is always
// a second's worth of them standing where it has just rained, going as the rain goes on.
// They are not the rain's any more once they stand: another may be thrown up over them
export const GRAVES = { bury: 0.1, deeper: 0.07, lean: 0.26, quiver: 0.2, beats: 7, shock: 0.16, stand: 0.55, last: 1.6, gone: 0.45,
  sparks: 4, great: 14, mote: 0.1, cool: 0.16, hot: 0.18 };      // (mote: while they stand a spark rises off one of them so often; cool: s it takes to cool from white, to `hot`: how white it stands)
const T = SPEAR_RAIN;
const SPEAR = new URL('./assets/textures/lance-spear.webp', import.meta.url).href;      // her lance's picture: its tail at the left, its point at the right
const SPEAR_WIDE = 0.125;                               // half its strip's width, of its length (the picture's)
// the ribbon of water round the lance's way up: strands, each a strip of so many places; r: m from the way; wide: half
// its width (m); pitch: m to a turn; spin: rad/s; life: s a place lasts once the lance has passed it; near: m behind
// the lance's point over which it closes in; every: m of its way to one blade along a strand
const HELIX = { places: 72, r: 0.55, wide: 0.4, pitch: 3.2, spin: 9, life: 0.62, near: 1.3, swell: 0.45,
  strands: [{ phase: 0, r: 1, wide: 1, every: 2.8 }, { phase: Math.PI, r: 0.72, wide: 0.6, every: 1.8 }] };
const TWIRL = { places: 30, life: 0.3, every: 1.9 };    // the band behind the lance as she twirls it
const BLADE_FPS = 11;                                   // the blade's frames a second, round and round (as the combo's)
// the splash where a spear lands (as the combo's WATER_HIT: life, more: s it lasts, and more for each m it reaches;
// fade: the last part of that it goes in); up: its middle stands so far over the ground, of its reach
const HIT = { life: 0.4, more: 0.1, fade: 0.3, up: 0.3 };
// a ring of the blade (as the combo's WATER_BLADE.ring: round: times the strip goes round it; inner: its inner edge, of
// its radius; rise: its outer edge stands so much higher, of its radius; spin: rad/s; from: of its radius it begins at)
const CROWN = { round: 3, inner: 0.56, rise: 0.17, spin: 2.6, from: 0.22, life: 0.36, more: 0.06 };
const BOLT = { n: 5, places: 13, life: 0.17 };
const MOST = { spears: 80, streaks: 24, stuck: 48, splashes: 40, rounds: 32, bits: 448, flares: 32 };      // (spears: a full rain has some 30 in the air at once, and as many standing where they have just landed; a streak behind each that falls)
const BLEND = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation };

const NOISE = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;
// the water at a place in a frame of one of the combo's pictures (counted in squares; map: where that frame's map is in
// the picture): the map says which tile, the tile how light the water is there (red) and how much of it there is
// (green), its colour the picture's own ramp at that lightness. Premultiplied. (magic-combo-fx.js' TILED, with the
// frame told for each thing drawn instead of once for all)
const TILED = /* glsl */`
  uniform sampler2D uAtlas;
  uniform vec2 uTexel, uGrid;
  uniform vec3 uR0, uR1, uR2, uR3, uR4, uR5, uR6, uR7;
  vec3 ramp(float l) {
    float t = (l - 0.44) / 0.08;
    vec3 c = uR0 * clamp(0.25 + 0.75 * l / 0.44, 0.0, 1.0);
    c += (uR1 - uR0) * clamp(t, 0.0, 1.0);
    c += (uR2 - uR1) * clamp(t - 1.0, 0.0, 1.0);
    c += (uR3 - uR2) * clamp(t - 2.0, 0.0, 1.0);
    c += (uR4 - uR3) * clamp(t - 3.0, 0.0, 1.0);
    c += (uR5 - uR4) * clamp(t - 4.0, 0.0, 1.0);
    c += (uR6 - uR5) * clamp(t - 5.0, 0.0, 1.0);
    c += (uR7 - uR6) * clamp(t - 6.0, 0.0, 1.0);
    return c;
  }
  vec4 water(vec2 map, vec2 at) {
    vec2 cell = clamp(floor(at), vec2(0.0), uGrid), f = clamp(at - cell, 0.0, 1.0);
    vec2 slot = floor(texelFetch(uAtlas, ivec2(floor(map + cell + 0.5)), 0).rg * 255.0 + 0.5);
    vec2 s = texture2D(uAtlas, (slot * 16.0 + 1.0 + f * 14.0) * uTexel).rg;
    return clamp(vec4(ramp(0.3 + 0.7 * s.r) * s.g, s.g), 0.0, 1.0);
  }`;

// ---- the seal's lines, drawn once: three layers, one in each colour of the picture (red: its rim, a band of runes
// and four small seals on it; green: a seven-pointed star in a ring and a second band of runes; blue: a twelve-pointed
// star and the rings in its middle)
function sealPicture(size = 1024) {
  const layers = [0, 1, 2].map(() => { const c = document.createElement('canvas'); c.width = c.height = size; return c; });
  const H = size / 2, U = H * 0.97;                     // (a little room round it: nothing is cut off at the picture's edge)
  const pen = i => {
    const c = layers[i].getContext('2d');
    c.translate(H, H); c.strokeStyle = c.fillStyle = '#fff'; c.lineJoin = 'round'; c.lineCap = 'round';
    return c;
  };
  const ring = (c, r, w) => { c.lineWidth = w; c.beginPath(); c.arc(0, 0, r * U, 0, TAU); c.stroke(); };
  const star = (c, n, skip, r, w, turn = 0) => {
    c.lineWidth = w; c.beginPath();
    for (let i = 0; i <= n; i++) { const a = turn + i * skip * TAU / n - Math.PI / 2; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * U, Math.sin(a) * r * U); }
    c.stroke();
  };
  // a rune: a stave and a few branches off it, in a cell w by h about (0, -r); which, by its number
  const rune = (c, r, w, h, n) => {
    const q = i => { const v = Math.sin(n * 127.1 + i * 311.7) * 43758.5453; return v - Math.floor(v); };
    const y0 = -r - h / 2, x0 = (q(1) - 0.5) * w * 0.4;
    c.beginPath();
    if (q(0) < 0.85) { c.moveTo(x0, y0); c.lineTo(x0, y0 + h); }
    const m = 1 + Math.floor(q(2) * 2.6);
    for (let j = 0; j < m; j++) {
      const ya = y0 + q(3 + j * 5) * h, side = q(4 + j * 5) < 0.5 ? -1 : 1, reach = w * (0.28 + 0.24 * q(5 + j * 5));
      const yb = clamp(ya + (q(6 + j * 5) - 0.5) * h * 0.9, y0, y0 + h);
      c.moveTo(x0, ya); c.lineTo(x0 + side * reach, yb);
      if (q(7 + j * 5) < 0.4) c.lineTo(x0, clamp(yb + (yb - ya), y0, y0 + h));
    }
    c.stroke();
  };
  const band = (c, r, tall, n, w, seed) => {
    c.lineWidth = w;
    for (let i = 0; i < n; i++) { c.save(); c.rotate(i * TAU / n); rune(c, r * U, TAU * r * U / n * 0.62, tall * U, seed + i); c.restore(); }
  };
  const px = size / 1024;
  // the rim
  let c = pen(0);
  ring(c, 0.992, 5 * px); ring(c, 0.955, 2.4 * px); ring(c, 0.842, 2.4 * px); ring(c, 0.815, 3.6 * px);
  band(c, 0.899, 0.07, 44, 2.6 * px, 11);
  for (let i = 0; i < 4; i++) {                         // four small seals on the band of runes
    c.save(); c.rotate(i * TAU / 4 + 0.3); c.translate(0, -0.899 * U);
    c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(0, 0, 0.078 * U, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.lineWidth = 3 * px; c.beginPath(); c.arc(0, 0, 0.074 * U, 0, TAU); c.stroke();
    c.lineWidth = 2 * px; c.beginPath(); c.arc(0, 0, 0.052 * U, 0, TAU); c.stroke();
    c.lineWidth = 2.6 * px; c.beginPath();
    for (let j = 0; j <= 3; j++) { const a = j * TAU / 3 - Math.PI / 2; c[j ? 'lineTo' : 'moveTo'](Math.cos(a) * 0.05 * U, Math.sin(a) * 0.05 * U); }
    c.stroke();
    c.restore();
  }
  // the star in its ring, and the second band
  c = pen(1);
  ring(c, 0.76, 3 * px); ring(c, 0.735, 2 * px);
  star(c, 7, 3, 0.735, 3 * px); star(c, 7, 2, 0.735, 1.8 * px);
  ring(c, 0.585, 2.4 * px); ring(c, 0.47, 2.4 * px);
  band(c, 0.5275, 0.066, 30, 2.5 * px, 97);
  // the small star and the rings in the middle
  c = pen(2);
  ring(c, 0.44, 2.2 * px);
  c.lineWidth = 3 * px; c.beginPath();
  for (let i = 0; i <= 24; i++) { const a = i * TAU / 24, r = (i % 2 ? 0.265 : 0.425) * U; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  c.stroke();
  star(c, 6, 1, 0.26, 2 * px); star(c, 6, 1, 0.26, 2 * px, TAU / 12);
  ring(c, 0.215, 3 * px); ring(c, 0.105, 2.4 * px);
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12; c.beginPath(); c.arc(Math.cos(a) * 0.16 * U, Math.sin(a) * 0.16 * U, 0.012 * U, 0, TAU); c.fill(); }
  // ... each into its colour
  const out = document.createElement('canvas'); out.width = out.height = size;
  const o = out.getContext('2d'), img = o.createImageData(size, size);
  const data = layers.map(l => l.getContext('2d').getImageData(0, 0, size, size).data);
  for (let i = 0; i < size * size; i++) { img.data[i * 4] = data[0][i * 4 + 3]; img.data[i * 4 + 1] = data[1][i * 4 + 3]; img.data[i * 4 + 2] = data[2][i * 4 + 3]; img.data[i * 4 + 3] = 255; }
  o.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function createSpearRainFx({ seed = 11 } = {}) {
  const object = new THREE.Group();
  object.name = 'spearRainFx';
  let s0 = seed >>> 0;
  const rand = () => { s0 = (s0 + 0x6d2b79f5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const look = { uCore: { value: rgb(LANCE_LOOK.core) }, uMain: { value: rgb(LANCE_LOOK.main) }, uDeep: { value: rgb(LANCE_LOOK.deep) },
    uShine: { value: 0.8 }, uTime: { value: 0 } };       // the lance's light, shared by all that has it
  const aqua = { uWCore: { value: rgb(WATER_LOOK.core) }, uWMain: { value: rgb(WATER_LOOK.main) }, uWDeep: { value: rgb(WATER_LOOK.deep) } };
  const made = [], geos = [], pictures = [];
  // drawn with the see-through things, after all that is solid (the water too), in their own order (put's): as
  // magic-combo-fx.js' material says, unmarked they were painted over by the river wherever it lay behind them
  const material = o => { const m = new THREE.ShaderMaterial({ depthWrite: false, ...BLEND, transparent: true, forceSinglePass: !o.transparent, ...o }); m.userData.noGrade = true; made.push(m); return m; };
  const put = (geo, mat, order) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = order; object.add(m); return m; };
  const square = new THREE.PlaneGeometry(2, 2); geos.push(square);
  // so many of one thing, each with numbers of its own
  function instanced(base, count, spec) {
    const geo = new THREE.InstancedBufferGeometry(); geos.push(geo);
    geo.index = base.index;
    for (const name of Object.keys(base.attributes)) geo.setAttribute(name, base.attributes[name]);
    const a = {};
    for (const [name, size] of Object.entries(spec)) {
      a[name] = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a[name]);
    }
    geo.instanceCount = count;
    const set = { geo, a, count, next: 0, take() { const i = set.next; set.next = (i + 1) % count; for (const k in a) a[k].needsUpdate = true; return i; } };
    return set;
  }
  // one of the combo's water pictures, as its own fx reads it
  const loader = new THREE.TextureLoader();
  function tiled(name) {
    const sheet = WATER_SHEETS[name];
    const atlas = loader.load(new URL(`${WATER_AT}water-${name}.webp${WATER_V}`, import.meta.url).href, undefined, undefined, err => console.warn('[spear rain] the water picture', name, err));
    atlas.format = THREE.RGFormat; atlas.colorSpace = THREE.NoColorSpace;
    atlas.minFilter = atlas.magFilter = THREE.LinearFilter;
    atlas.generateMipmaps = false; atlas.flipY = false; atlas.premultiplyAlpha = false;
    pictures.push(atlas);
    const uniforms = { uAtlas: { value: atlas }, uTexel: { value: new THREE.Vector2(1 / sheet.size[0], 1 / sheet.size[1]) }, uGrid: { value: new THREE.Vector2(sheet.grid[0] - 1, sheet.grid[1] - 1) } };
    sheet.ramp.forEach((c, i) => { uniforms['uR' + i] = { value: new THREE.Vector3(c[0], c[1], c[2]) }; });
    return { sheet, uniforms };
  }
  const hit = tiled('hit'), blade = tiled('blade');
  const bladeFrame = age => blade.sheet.frames[Math.floor(Math.max(0, age) * BLADE_FPS) % blade.sheet.frames.length];

  // ==== the spears (her lance's picture) and the streaks behind them: a strip from tail to point, turned to the camera
  // about the spear's own line. aShape: its length (m), half its width (m), how much of it is there, how white hot
  const spearIn = { value: 0 };
  const picture = loader.load(SPEAR, () => { spearIn.value = 1; }, undefined, err => console.warn('[spear rain] the lance picture', err));
  picture.premultiplyAlpha = true; picture.anisotropy = 4;
  pictures.push(picture);
  const strip = new THREE.PlaneGeometry(1, 2).translate(0.5, 0, 0); geos.push(strip);      // x: 0 its tail .. 1 its point; y: -1 .. 1 across
  const ALONG = /* glsl */`
    attribute vec3 aTip, aDir;
    attribute vec4 aShape;
    attribute vec2 aGone;
    varying vec2 vUv;
    varying float vK, vHot;
    varying vec3 vGone;
    void main() {
      vUv = position.xy;
      vGone = vec3(aGone, aShape.x);
      vec3 p = aTip - aDir * aShape.x * (1.0 - position.x);
      vec3 side = cross(aDir, cameraPosition - p);
      side *= inversesqrt(max(dot(side, side), 1e-8));
      p += side * position.y * aShape.y;
      vK = aShape.z; vHot = aShape.w;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`;
  const spears = instanced(strip, MOST.spears, { aTip: 3, aDir: 3, aShape: 4, aGone: 2 });      // (aGone: how far gone a spear that stood is, 0..1, and a number of its own)
  const spearMesh = put(spears.geo, material({
    uniforms: { ...look, uMap: { value: picture }, uHas: spearIn },
    side: THREE.DoubleSide,
    vertexShader: ALONG,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uShine, uHas;
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying float vK, vHot;
      varying vec3 vGone;
      void main() {
        float x = vUv.x, y = abs(vUv.y);
        // one that stood, going: from its tail down, in small squares (7 cm), a white edge where it goes
        float sq = fract(sin(dot(floor(vec2(x, vUv.y * 0.125) * vGone.z * 14.0) + vGone.y * 61.0, vec2(127.1, 311.7))) * 43758.5453);
        float left = x + (sq - 0.5) * 0.32 - (vGone.x * 1.32 - 0.16);
        float kept = step(0.0, left), edge = (1.0 - step(0.06, left)) * step(0.001, vGone.x);
        // until the picture has come: a shaft and a head
        float shaft = (1.0 - smoothstep(0.03, 0.06, y)) * step(0.03, x) * step(x, 0.8);
        float head = (1.0 - smoothstep(-0.03, 0.03, y - 0.42 * (1.0 - (x - 0.74) / 0.26))) * step(0.74, x);
        float m = max(shaft, head);
        vec4 pic = mix(vec4(mix(uMain, uCore, 0.6) * m, m), texture2D(uMap, vec2(x, 0.5 + 0.5 * vUv.y)), uHas);
        // thrown, whiter, a blue flame close along it (as the lance thrown straight)
        float ends = smoothstep(0.0, 0.08, x) * smoothstep(0.0, 0.05, 1.0 - x);
        float flame = exp(-y * 7.0) * ends;
        vec3 col = mix(pic.rgb, uCore * pic.a, 0.5 * vHot) + (uMain * 0.6 + uDeep * 0.35) * flame * (0.15 + 0.6 * vHot) * (1.0 - pic.a);
        float a = pic.a + (1.0 - pic.a) * flame * 0.3 * vHot;
        col = mix(col, uCore * a, edge * 0.9);
        gl_FragColor = clamp(vec4(col * (0.84 + 0.2 * uShine), a) * vK * kept, 0.0, 1.0);
      }`,
  }), 6);
  const streaks = instanced(strip, MOST.streaks, { aTip: 3, aDir: 3, aShape: 4, aGone: 2 });
  const streakMesh = put(streaks.geo, material({
    uniforms: { ...look },
    side: THREE.DoubleSide,
    vertexShader: ALONG,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uShine;
      varying vec2 vUv;
      varying float vK, vHot;
      void main() {
        // (x 1: at the spear; 0: where it came from) a point up there, as wide as the spear's head down here; flat,
        // with hard edges: white down its middle, the lance's cyan either side
        float x = vUv.x, y = abs(vUv.y);
        float w = 0.06 + 0.94 * x * x, aa = fwidth(vUv.y) * 1.2 + 0.005;
        float heart = 1.0 - smoothstep(w * 0.3 - aa, w * 0.3 + aa, y);
        float body = 1.0 - smoothstep(w * 0.7 - aa, w * 0.7 + aa, y);
        float along = smoothstep(0.0, 0.45, x);
        vec3 col = mix(mix(uMain, uDeep, 0.25 * (1.0 - x)), uCore, heart) * body;
        gl_FragColor = clamp(vec4(col * (0.84 + 0.2 * uShine), body * 0.85) * along * vK, 0.0, 1.0);
      }`,
  }), 5);

  // ==== a band of water: a strip through places, with a true width, the blade laid along it one after another (aS:
  // where along them a place is, in blades). uv.x: how far gone a place is (0 new .. 1 gone); uv.y: across (1: the
  // blade's outer edge); aTone: how far its outside is turned to the camera (-1..1: its inside is dimmer)
  function makeBand(N) {
    const geo = new THREE.BufferGeometry(); geos.push(geo);
    const idx = [];
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 4), 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(N * 2), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTone', new THREE.BufferAttribute(new Float32Array(N * 2), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const uniforms = { ...blade.uniforms, uMap: { value: new THREE.Vector2() }, uK: { value: 1 } };
    const mat = material({
      uniforms,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute float aS, aTone;
        varying vec2 vUv;
        varying float vS, vTone;
        void main() { vUv = uv; vS = aS; vTone = aTone; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
      fragmentShader: TILED + /* glsl */`
        uniform vec2 uMap;
        uniform float uK;
        varying vec2 vUv;
        varying float vS, vTone;
        void main() {
          vec4 c = water(uMap, vec2(fract(vS), clamp(0.5 - 0.5 * vUv.y, 0.0, 0.9999)) * (uGrid + 1.0));
          float front = smoothstep(-0.25, 0.35, vTone);
          gl_FragColor = c * pow(clamp(1.0 - vUv.x, 0.0, 1.0), 1.25) * (0.55 + 0.45 * front) * uK;
        }`,
    });
    return { mesh: put(geo, mat, 7), N, uniforms, pos: geo.attributes.position, uv: geo.attributes.uv, s: geo.attributes.aS, tone: geo.attributes.aTone };
  }
  // one place of a band: its middle, the way across it (unit), half its width, how far gone, where along, its tone
  function lay(b, i, px, py, pz, wx, wy, wz, half, gone, s, tone) {
    b.pos.setXYZ(i * 2, px - wx * half, py - wy * half, pz - wz * half);
    b.pos.setXYZ(i * 2 + 1, px + wx * half, py + wy * half, pz + wz * half);
    b.uv.setXY(i * 2, gone, -1); b.uv.setXY(i * 2 + 1, gone, 1);
    b.s.setX(i * 2, s); b.s.setX(i * 2 + 1, s);
    b.tone.setX(i * 2, tone); b.tone.setX(i * 2 + 1, tone);
  }
  const shown = (b, age) => {
    b.pos.needsUpdate = b.uv.needsUpdate = b.s.needsUpdate = b.tone.needsUpdate = true;
    const f = bladeFrame(age); b.uniforms.uMap.value.set(f[0], f[1]);
    b.mesh.visible = true;
  };
  const twirlBand = makeBand(TWIRL.places), twirlPts = [];
  const helix = HELIX.strands.map(d => ({ d, band: makeBand(HELIX.places) }));
  const hAt = new Float32Array(HELIX.places * 3), hOut = new Float32Array(HELIX.places * 3);

  // ==== the splash where a spear lands: the combo's (`hit`), one square each turned to the camera, only as big as the
  // water in the frame shown. aBox: the squares with water in them (x0, y0, x1, y1); aFrame: the frame's map (x, y),
  // how far it reaches (m), how much of it is there; aSpin: its turn (cos, sin), mirrored or not (-1, 1)
  const splashSet = instanced(square, MOST.splashes, { aAt: 3, aBox: 4, aFrame: 4, aSpin: 3 });
  const splashMesh = put(splashSet.geo, material({
    uniforms: { ...hit.uniforms, uOrigin: { value: new THREE.Vector2(hit.sheet.origin[0], hit.sheet.origin[1]) }, uCell: { value: hit.sheet.cell } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec3 aAt, aSpin;
      attribute vec4 aBox, aFrame;
      uniform vec2 uOrigin;
      uniform float uCell;
      varying vec2 vCell, vMap;
      varying float vK;
      void main() {
        vec2 t = position.xy * 0.5 + 0.5;
        vCell = vec2(mix(aBox.x, aBox.z, t.x), mix(aBox.w, aBox.y, t.y));      // (squares are counted down the frame)
        vec2 m = uOrigin + vec2(vCell.x, -vCell.y) * uCell;                    // from its middle: to the right, up
        m = vec2(m.x * aSpin.x - m.y * aSpin.y, m.x * aSpin.y + m.y * aSpin.x);
        vec4 mv = viewMatrix * vec4(aAt, 1.0);
        mv.xy += vec2(m.x * aSpin.z, m.y) * aFrame.z;
        vMap = aFrame.xy; vK = aFrame.w;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: TILED + /* glsl */`
      varying vec2 vCell, vMap;
      varying float vK;
      void main() { gl_FragColor = water(vMap, vCell) * vK; }`,
  }), 4);
  const splashes = [];

  // ==== a ring of the blade: a crown of water thrown outward over the ground where a spear lands, a hoop in the air,
  // the fringe round the seal as it opens. position.x: where round it (0..1); position.y: 0 its outer edge, 1 its
  // inner. aRing: its radius now (m), its inner edge (of that), how much higher its outer edge stands (of that), its
  // turn; aFrame: the blade's frame (its map: x, y), times the strip goes round, how much of it is there
  const roundGeo = (() => {
    const N = 48, pos = [], idx = [];
    for (let i = 0; i <= N; i++) pos.push(i / N, 0, 0, i / N, 1, 0);
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const g = new THREE.BufferGeometry(); geos.push(g);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  })();
  const roundSet = instanced(roundGeo, MOST.rounds, { aAt: 3, aUp: 3, aRing: 4, aFrame: 4 });
  const roundMesh = put(roundSet.geo, material({
    uniforms: { ...blade.uniforms },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec3 aAt, aUp;
      attribute vec4 aRing, aFrame;
      varying vec2 vUv, vMap;
      varying float vK;
      void main() {
        float a = position.x * 6.2831853 + aRing.w;
        vec3 e1 = normalize(cross(aUp, vec3(0.0, 0.0, 1.0))), e2 = cross(aUp, e1);
        float r = aRing.x * mix(1.0, aRing.y, position.y);
        vec3 p = aAt + (e1 * cos(a) + e2 * sin(a)) * r + aUp * aRing.x * aRing.z * (1.0 - position.y);
        vUv = vec2(position.x * aFrame.z, position.y); vMap = aFrame.xy; vK = aFrame.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: TILED + /* glsl */`
      varying vec2 vUv, vMap;
      varying float vK;
      void main() { gl_FragColor = water(vMap, vec2(fract(vUv.x), clamp(vUv.y, 0.0, 0.9999)) * (uGrid + 1.0)) * vK; }`,
  }), 3);
  const rounds = [];

  // ==== the seal: one square lying flat in the sky. It is sized by how far open it is; uWash: how bright its face;
  // uFade: how much of it is left as it breaks up; uFlash: lightning
  const sealMap = sealPicture();
  const sealGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2); geos.push(sealGeo);
  const sealMat = material({
    uniforms: { ...look, uMap: { value: sealMap }, uWash: { value: 0 }, uFade: { value: 1 }, uFlash: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main() { vP = (uv - 0.5) * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uCore, uMain, uDeep;
      uniform float uShine, uTime, uWash, uFade, uFlash;
      varying vec2 vP;
      ${NOISE}
      vec2 turned(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y) * 0.5 + 0.5; }
      void main() {
        float r = length(vP), ang = atan(vP.y, vP.x);
        float within = 1.0 - smoothstep(0.985, 1.0, r);
        // its three layers, each turning its own way; the same again from further off, for their glow
        vec2 q1 = turned(vP, uTime * 0.1), q2 = turned(vP, -uTime * 0.17), q3 = turned(vP, uTime * 0.42);
        float lines = texture2D(uMap, q1).r + texture2D(uMap, q2).g + texture2D(uMap, q3).b;
        float glow = texture2D(uMap, q1, 2.6).r + texture2D(uMap, q2, 2.6).g + texture2D(uMap, q3, 2.6).b;
        // breaking up, it goes in patches
        float left = smoothstep(0.0, 0.2, noise(vec2(ang * 4.0, r * 7.0 - uTime)) - (1.0 - uFade) * 1.2 + 0.2 * uFade);
        lines = clamp(lines, 0.0, 1.0) * within * left; glow = clamp(glow * 1.5, 0.0, 1.0) * within * left;
        // its face: washed bright as it opens, streaked from the middle out, then almost clear
        float rays = 0.5 + 0.5 * sin(ang * 26.0 + 2.2 * sin(ang * 7.0 + uTime * 0.7));
        float face = within * (uWash * (0.45 + 0.55 * mix(1.0, rays, smoothstep(0.1, 0.6, r))) + 0.05 * uFade * left);
        vec3 col = uCore * lines + uMain * glow * 0.85 * (1.0 - lines) + mix(mix(uDeep, uMain, 0.8), uCore, 0.1 + 0.5 * rays) * face * 0.72;
        col *= 1.0 + 0.5 * uFlash;
        float a = clamp(lines * 0.9 + glow * 0.12 + face * 0.7, 0.0, 1.0);
        gl_FragColor = clamp(vec4(col * (0.84 + 0.2 * uShine), a), 0.0, 1.0);
      }`,
  });
  const seal = put(sealGeo, sealMat, 1);

  // ==== lightning out of the seal's middle: a few crooked strips turned to the camera, laid anew as each flickers
  const boltMat = () => material({
    uniforms: { ...look, uK: { value: 1 } },
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain;
      uniform float uShine, uK;
      varying vec2 vUv;
      void main() {
        float y = abs(vUv.y), ends = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.3, 1.0 - vUv.x);
        float heart = 1.0 - smoothstep(0.3, 0.42, y), edge = 1.0 - smoothstep(0.8, 0.95, y);
        vec3 col = mix(uMain, uCore, heart) * edge;
        gl_FragColor = clamp(vec4(col * (0.84 + 0.2 * uShine), edge * (0.45 + 0.5 * heart)) * ends * uK, 0.0, 1.0);
      }`,
  });
  const bolts = Array.from({ length: BOLT.n }, () => {
    const N = BOLT.places, geo = new THREE.BufferGeometry(); geos.push(geo);
    const uv = new Float32Array(N * 4), idx = [];
    for (let i = 0; i < N; i++) { uv[i * 4] = uv[i * 4 + 2] = i / (N - 1); uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return { mesh: put(geo, boltMat(), 2), pts: new Float32Array(N * 3), age: 1, life: BOLT.life, wide: 0.05, from: new THREE.Vector3(), to: new THREE.Vector3(), bent: false };
  });

  // ==== small things thrown about: one square each, turned to the camera, moved by its shader. aData: when it began,
  // how long it lasts, its size (m), a number of its own; aKind: 0 a drop of water (a round bead; it falls), 1 a
  // sparkle of the lance's (it drifts and twinkles), 2 a bead of water with a ring round it (it drifts)
  const bits = instanced(square, MOST.bits, { aAt: 3, aVel: 3, aData: 4, aKind: 1 });
  for (let i = 0; i < MOST.bits; i++) bits.a.aData.setXYZW(i, -1000, 1, 0, 0);
  const bitMesh = put(bits.geo, material({
    uniforms: { ...look, ...aqua },
    vertexShader: /* glsl */`
      attribute vec3 aAt, aVel;
      attribute vec4 aData;
      attribute float aKind;
      uniform float uTime;
      varying vec2 vP;
      varying float vKind;
      void main() {
        float age = uTime - aData.x, u = age / aData.y;
        float on = step(0.0, age) * step(u, 1.0);
        float drop = 1.0 - step(0.5, aKind);
        float slow = (1.0 - exp(-2.6 * age)) / 2.6;                      // (a sparkle or a bead slows as it goes)
        vec3 p = aAt + aVel * mix(slow, age, drop) - vec3(0.0, (4.9 * drop + 0.25 * (1.0 - drop)) * age * age, 0.0);
        float twinkle = mix(1.0, 0.6 + 0.4 * sin(uTime * 17.0 + aData.w * 60.0), step(0.5, aKind) * (1.0 - step(1.5, aKind)));
        float s = aData.z * on * smoothstep(0.0, 0.1, u) * pow(max(0.0, 1.0 - u), mix(0.7, 0.35, drop)) * twinkle;
        vP = position.xy; vKind = aKind;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        mv.xy += position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uWCore, uWMain, uWDeep;
      uniform float uShine;
      varying vec2 vP;
      varying float vKind;
      void main() {
        float r = length(vP);
        vec3 col; float a;
        if (vKind < 0.5) {
          // a drop: a round bead of the water's aqua, a white glint on it, darker under
          float body = 1.0 - smoothstep(0.8, 0.88, r);
          float glint = 1.0 - smoothstep(0.22, 0.3, length(vP - vec2(-0.26, 0.3)));
          float foot = smoothstep(0.1, 0.6, -vP.y - vP.x * 0.4);
          col = mix(mix(uWMain, uWCore, 0.35), mix(uWMain, uWDeep, 0.55), foot * 0.75);
          col = mix(col, uWCore, glint);
          a = body * 0.94; col *= a;
        } else if (vKind < 1.5) {
          // a sparkle: a four-pointed star, hard
          vec2 q = abs(vP);
          float star = 1.0 - smoothstep(0.0, 0.12, q.x * q.y * 34.0 + (q.x + q.y) * 0.95 - 0.86);
          float heart = 1.0 - smoothstep(0.16, 0.22, r);
          a = clamp(star + heart, 0.0, 1.0);
          col = mix(uMain, uCore, clamp(heart + star * 0.75, 0.0, 1.0)) * a;
          a *= 0.6;
        } else {
          // a bead: clear, a white ring round it and a glint
          float ring = 1.0 - smoothstep(0.06, 0.12, abs(r - 0.72)), fill = 1.0 - smoothstep(0.66, 0.74, r);
          float glint = 1.0 - smoothstep(0.14, 0.2, length(vP - vec2(-0.25, 0.28)));
          a = clamp(ring * 0.9 + fill * 0.34 + glint, 0.0, 1.0);
          col = mix(mix(uWMain, uWCore, 0.5), uWCore, clamp(ring + glint, 0.0, 1.0)) * a;
        }
        gl_FragColor = clamp(vec4(col * (0.84 + 0.2 * uShine), a), 0.0, 1.0);
      }`,
  }), 8);
  bitMesh.visible = true;

  // ==== a flare of the lance's: one square turned to the camera, over everything. aData: when, how long, its size
  // (m), a number of its own; aKind: 0 a four-pointed star (the seal's middle, as the circle the lance is thrown
  // through flares; a spear taking shape); 1 a star of long white needles (the great spear lands)
  const flares = instanced(square, MOST.flares, { aAt: 3, aData: 4, aKind: 1 });
  for (let i = 0; i < MOST.flares; i++) flares.a.aData.setXYZW(i, -1000, 1, 0, 0);
  const flareMesh = put(flares.geo, material({
    uniforms: { ...look },
    depthTest: false,
    vertexShader: /* glsl */`
      attribute vec3 aAt;
      attribute vec4 aData;
      attribute float aKind;
      uniform float uTime;
      varying vec2 vP;
      varying float vU, vKind, vSeed;
      void main() {
        float age = uTime - aData.x, u = age / aData.y;
        float on = step(0.0, age) * step(u, 1.0);
        vP = position.xy; vU = clamp(u, 0.0, 1.0); vKind = aKind; vSeed = aData.w;
        vec4 mv = viewMatrix * vec4(aAt, 1.0);
        mv.xy += position.xy * aData.z * on;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain;
      uniform float uShine;
      varying vec2 vP;
      varying float vU, vKind, vSeed;
      float hash1(float n) { return fract(sin(n * 78.233 + 4.7) * 43758.5453); }
      void main() {
        float r = length(vP), ang = atan(vP.y, vP.x);
        float go = 1.0 - pow(1.0 - vU, 3.0), left = 1.0 - vU;
        vec3 col; float a;
        if (vKind < 0.5) {
          vec2 q = abs(vP);
          float beat = sin(3.14159 * sqrt(vU));
          float star = (1.0 - smoothstep(0.0, 0.08, q.x * q.y * 70.0 + (q.x + q.y) * 0.95 - beat)) * step(0.02, beat);
          float heart = 1.0 - smoothstep(0.13 * beat, 0.16 * beat + 0.01, r);
          float halo = pow(max(0.0, 1.0 - r / 0.45), 2.0) * beat * 0.3;
          col = mix(uMain, uCore, clamp(heart + star * 0.8, 0.0, 1.0)) * clamp(star + heart, 0.0, 1.0) + uMain * halo;
          a = clamp(star * 0.8 + heart * 0.85, 0.0, 1.0);
        } else {
          // needles: so many round it, each its own length and width, thick at its foot and a point at its end; all
          // out at once, then thinning to nothing where they stand
          float n = 15.0, f = ang / 6.2831853 * n + vSeed, id = floor(f), x = fract(f) - 0.5;
          float len = (0.34 + 0.66 * hash1(id + vSeed * 3.0)) * (0.3 + 0.7 * go);
          float wide = (0.012 + 0.03 * hash1(id * 2.7 + vSeed)) * left;
          float across = abs(x) * 6.2831853 / n * r;
          float needle = (1.0 - smoothstep(0.75, 1.0, across / max(wide * (1.0 - r / len), 1e-4))) * step(r, len) * step(0.06, r);
          float heart = 1.0 - smoothstep(0.07 * left, 0.1 * left + 0.01, r);
          col = uCore * clamp(needle + heart, 0.0, 1.0);
          a = clamp(needle + heart, 0.0, 1.0) * 0.96;
        }
        gl_FragColor = clamp(vec4(col * (0.84 + 0.2 * uShine), a), 0.0, 1.0);
      }`,
  }), 9);
  flareMesh.visible = true;

  // ---- one of each
  let time = 0;
  const v = new THREE.Vector3(), w = new THREE.Vector3(), tan = new THREE.Vector3(), toCam = new THREE.Vector3(), side = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  // a splash at a place, reaching so far (m); lift: its middle so far over that place, of its reach
  function splash(at, reach, lift = HIT.up) {
    if (splashes.length >= MOST.splashes) splashes.shift();
    const turn = (rand() - 0.5) * 1.2;
    splashes.push({ x: at.x, y: at.y + reach * lift, z: at.z, age: 0, life: HIT.life + HIT.more * reach, reach, cos: Math.cos(turn), sin: Math.sin(turn), mirror: rand() < 0.5 ? -1 : 1 });
  }
  // a ring of the blade going out: to `radius` (m) from `from` of it, in `life` s
  function round(at, up, radius, { life = CROWN.life + CROWN.more * radius, inner = CROWN.inner, rise = CROWN.rise, spin = CROWN.spin, from = CROWN.from, times = CROWN.round } = {}) {
    if (rounds.length >= MOST.rounds) rounds.shift();
    rounds.push({ x: at.x, y: at.y, z: at.z, ux: up.x, uy: up.y, uz: up.z, radius, life, inner, rise, spin, from, times, t: 0, age: rand(), turn: rand() * TAU });
  }
  function bit(at, vx, vy, vz, life, size, kind) {
    const i = bits.take();
    bits.a.aAt.setXYZ(i, at.x, at.y, at.z);
    bits.a.aVel.setXYZ(i, vx, vy, vz);
    bits.a.aData.setXYZW(i, time, life, size, rand());
    bits.a.aKind.setX(i, kind);
  }
  function flare(at, size, life, kind) {
    const i = flares.take();
    flares.a.aAt.setXYZ(i, at.x, at.y, at.z);
    flares.a.aData.setXYZW(i, time, life, size, rand());
    flares.a.aKind.setX(i, kind);
  }
  // n small things thrown out from a place: up and out (drops), or every way (sparkles, beads)
  function scatter(at, n, speed, size, kind) {
    for (let j = 0; j < n; j++) {
      const a = rand() * TAU, out = 0.35 + 0.65 * rand(), rise = kind ? (rand() - 0.3) * 0.8 : 0.7 + 0.9 * rand();
      bit(at, Math.cos(a) * out * speed, rise * speed, Math.sin(a) * out * speed, kind ? 0.5 + 0.6 * rand() : 0.45 + 0.4 * rand(), size * (0.6 + 0.8 * rand()), kind);
    }
  }

  // ---- the cast that is going (one at a time)
  const cast = { t: -1, k: 1, level: 0, R: 1, sealR: 1, from: new THREE.Vector3(), mid: new THREE.Vector3(), portal: new THREE.Vector3(), centre: new THREE.Vector3(),
    right: new THREE.Vector3(1, 0, 0), long: 1, heading: 0, strikes: [], great: null, all: [], last: 0, close: 0, end: 0, bolt: 0, dust: 0, glow: 0, flash: 0, shed: 0, ground: null };
  const held = { on: false, tip: new THREE.Vector3(), dir: new THREE.Vector3(), long: 1, there: 1 };
  // where on its way up the lance is, `u` of the way (0 her hand .. 1 the seal): a bend, up first and then over
  function wayAt(u, out) {
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return out.set(cast.from.x * a + cast.mid.x * b + cast.portal.x * c, cast.from.y * a + cast.mid.y * b + cast.portal.y * c, cast.from.z * a + cast.mid.z * b + cast.portal.z * c);
  }
  function wayDir(u, out) {
    return out.set((cast.mid.x - cast.from.x) * (1 - u) + (cast.portal.x - cast.mid.x) * u, (cast.mid.y - cast.from.y) * (1 - u) + (cast.portal.y - cast.mid.y) * u,
      (cast.mid.z - cast.from.z) * (1 - u) + (cast.portal.z - cast.mid.z) * u).normalize();
  }
  const RISE_EASE = 1.5;                                 // (fast off her hand, slowing as it comes to the seal)
  const upAt = t => 1 - Math.pow(1 - clamp(t / T.rise, 0, 1), RISE_EASE);
  const passed = u => T.rise * (1 - Math.pow(1 - u, 1 / RISE_EASE));      // when it was `u` of the way up
  let nSpear = 0, nStreak = 0;
  function spearAt(tip, dir, long, there, hot, gone = 0, own = 0) {
    if (nSpear >= MOST.spears || there <= 0.001) return;
    spears.a.aTip.setXYZ(nSpear, tip.x, tip.y, tip.z); spears.a.aDir.setXYZ(nSpear, dir.x, dir.y, dir.z);
    spears.a.aShape.setXYZW(nSpear, long, long * SPEAR_WIDE, there, hot);
    spears.a.aGone.setXY(nSpear, gone, own);
    nSpear++;
  }
  // ---- the spears that stand where they landed
  const stuck = [];
  let mote = 0;
  // one stands: s, a strike that has landed; until: s from now that it begins to go
  function stand(s, until) {
    if (stuck.length >= MOST.stuck) stuck.shift();
    const g = { land: s.land.clone(), fell: s.dir.clone(), rest: new THREE.Vector3(), out: new THREE.Vector3(), long: s.long, great: s.great, age: 0, until, shed: 0,
      own: rand(), bury: s.great ? 0.18 : GRAVES.bury + GRAVES.deeper * rand(), shook: -1, shock: 0 };
    // at rest: the way it fell, turned a little its own way (the great one: as it fell, upright)
    const lean = s.great ? 0 : GRAVES.lean * Math.sqrt(rand()), a = rand() * TAU;
    g.rest.set(s.dir.x + Math.cos(a) * Math.tan(lean), s.dir.y, s.dir.z + Math.sin(a) * Math.tan(lean)).normalize();
    g.out.set(s.land.x - cast.centre.x, 0, s.land.z - cast.centre.z);
    g.far = g.out.length(); if (g.far > 1e-3) g.out.multiplyScalar(1 / g.far);
    stuck.push(g);
  }
  // the great spear's blow shakes those that stand about it: the nearest most
  function shake(reach) {
    for (const g of stuck) if (!g.great) { g.shook = 0; g.shock = GRAVES.shock * Math.max(0.25, 1 - g.far / Math.max(reach, 1e-3)); }
  }
  function streakAt(tip, dir, long, wide, there) {
    if (nStreak >= MOST.streaks || there <= 0.001 || long <= 0.001) return;
    streaks.a.aTip.setXYZ(nStreak, tip.x, tip.y, tip.z); streaks.a.aDir.setXYZ(nStreak, dir.x, dir.y, dir.z);
    streaks.a.aShape.setXYZW(nStreak, long, wide, there, 1);
    nStreak++;
  }
  function boltNew(b, big) {
    const k = cast.k, a = rand() * TAU, far = cast.sealR * (0.55 + 0.85 * rand()) * (big ? 1.2 : 1);
    b.from.copy(cast.portal); b.from.y -= 0.1 * k;
    b.to.set(cast.portal.x + Math.cos(a) * far, cast.portal.y - (0.2 + 1.5 * rand()) * k, cast.portal.z + Math.sin(a) * far);
    b.age = 0; b.life = BOLT.life * (0.8 + 0.6 * rand()); b.wide = (0.035 + 0.035 * rand()) * k * (big ? 1.5 : 1); b.bent = false;
    boltBend(b);
  }
  // its crooked way: each place pushed off the straight line, most in the middle
  function boltBend(b) {
    const N = BOLT.places, len = b.from.distanceTo(b.to);
    let ox = 0, oy = 0, oz = 0;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), sway = Math.sin(Math.PI * u) * len * 0.11;
      ox += (rand() - 0.5) * sway; oy += (rand() - 0.5) * sway * 0.7; oz += (rand() - 0.5) * sway;
      const hold = Math.sin(Math.PI * u);
      b.pts[i * 3] = b.from.x + (b.to.x - b.from.x) * u + ox * hold;
      b.pts[i * 3 + 1] = b.from.y + (b.to.y - b.from.y) * u + oy * hold;
      b.pts[i * 3 + 2] = b.from.z + (b.to.z - b.from.z) * u + oz * hold;
    }
  }
  function boltDraw(b, camera) {
    const N = BOLT.places, pos = b.mesh.geometry.attributes.position, p = b.pts;
    for (let i = 0; i < N; i++) {
      const j = i * 3, i0 = Math.max(0, i - 1) * 3, i1 = Math.min(N - 1, i + 1) * 3;
      tan.set(p[i1] - p[i0], p[i1 + 1] - p[i0 + 1], p[i1 + 2] - p[i0 + 2]);
      toCam.set(camera.position.x - p[j], camera.position.y - p[j + 1], camera.position.z - p[j + 2]);
      side.crossVectors(tan, toCam);
      const l = side.length(), wide = l > 1e-6 ? b.wide * (1 - 0.6 * i / (N - 1)) / l : 0;
      pos.setXYZ(i * 2, p[j] - side.x * wide, p[j + 1] - side.y * wide, p[j + 2] - side.z * wide);
      pos.setXYZ(i * 2 + 1, p[j] + side.x * wide, p[j + 1] + side.y * wide, p[j + 2] + side.z * wide);
    }
    pos.needsUpdate = true;
    b.mesh.material.uniforms.uK.value = 1 - smooth(0.5, 1, b.age / b.life);
    b.mesh.visible = true;
  }
  // a spear has landed: the splash, a crown of water thrown outward over the ground under it, drops; the great spear,
  // more of each, a hoop of water going out in the air and a star of needles. And whoever listens is told
  function landed(s) {
    const k = cast.k, z = s.size * k, at = s.land;
    if (s.great) {
      // (a splash is at its best no bigger than the combo's own, so: a ring of them round where it lands,
      // and three one over another up the spear, a column of water)
      const grand = s.size > 1.05;      // (a full rain's: a storey higher, and a second ring of splashes round the first)
      for (let i = 0; i < (grand ? 4 : 3); i++) splash(v.set(at.x, at.y + i * 1.05 * k, at.z), (1.5 - 0.15 * i) * k, 0.4);
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5 + rand(), far = (1.5 + 0.5 * rand()) * k;
        v.set(at.x + Math.cos(a) * far, at.y, at.z + Math.sin(a) * far); splash(v, (1.25 + 0.25 * rand()) * k);
      }
      if (grand) for (let i = 0; i < 9; i++) {
        const a = i * TAU / 9 + rand(), far = (3.1 + 0.7 * rand()) * k;
        v.set(at.x + Math.cos(a) * far, cast.ground ? cast.ground(at.x + Math.cos(a) * far, at.z + Math.sin(a) * far) : at.y, at.z + Math.sin(a) * far); splash(v, (1.2 + 0.3 * rand()) * k);
      }
      round(v.copy(at).addScaledVector(s.up, 0.1 * k), s.up, cast.R * 1.2, { life: 0.62, rise: 0.24 });
      round(v.copy(at).addScaledVector(s.up, 0.1 * k), s.up, cast.R * 0.6, { life: 0.42, rise: 0.5, spin: -3.4 });
      round(v.copy(at).addScaledVector(UP, 1.15 * k), UP, cast.R * 1.35, { life: 0.5, inner: 0.72, rise: 0.05, from: 0.18, spin: 3.2, times: 4 });
      v.copy(at).y += 0.9 * k;
      flare(v, 6 * k * (grand ? 1.12 : 1), 0.36, 1);      // (its star hardly bigger: it would hide her)
      v.copy(at).y += 0.3 * k;
      scatter(v, grand ? 44 : 30, 5.6 * k * (grand ? 1.2 : 1), 0.085 * k, 0); scatter(v, 10, 3.4 * k, 0.11 * k, 2); scatter(v, grand ? 16 : 10, 4.2 * k, 0.12 * k, 1);
    } else {
      splash(at, Math.min(1.5 * k, (1.25 + 0.25 * rand()) * z));
      round(v.copy(at).addScaledVector(s.up, 0.1 * k), s.up, 1.25 * z, { rise: 0.3 });
      v.copy(at).y += 0.25 * k;
      scatter(v, 4, 3.3 * k, 0.062 * k, 0); scatter(v, 1, 2.2 * k, 0.085 * k, 2);
    }
    // it stands where it landed, a moment, and goes by its own clock: the first to land is the first to go
    if (s.great) { shake(cast.R); stand(s, GRAVES.stand * GRAVES.last); }
    else stand(s, GRAVES.stand);
    if (rain.onStrike) rain.onStrike({ at, radius: (s.great ? cast.R : 1.15 * z), great: s.great, index: s.index });
  }

  const rain = {
    object, onStrike: null, onBeat: null,
    get time() { return cast.t; },
    get busy() { return cast.t >= 0; },
    get portal() { return cast.portal; },
    get radius() { return cast.R; },
    get standing() { return stuck.length; },
    hold(tip, dir, long, there = 1) { held.on = true; held.tip.copy(tip); held.dir.copy(dir); held.long = long; held.there = there; },
    twirl(at, dir, half) {
      const p = twirlPts[0];
      if (p && p.age < 0.008) { p.at.copy(at); p.dir.copy(dir); p.half = half; return; }
      twirlPts.unshift({ at: at.clone(), dir: dir.clone(), half, age: 0 });
      if (twirlPts.length > TWIRL.places) twirlPts.length = TWIRL.places;
      // (beads of water thrown off its end now and then)
      if (rand() < 0.35) bit(v.copy(at).addScaledVector(dir, half), dir.x * 1.6 + (rand() - 0.5), 0.6 + rand(), dir.z * 1.6 + (rand() - 0.5), 0.45 + 0.3 * rand(), 0.07 * (0.6 + rand()), rand() < 0.5 ? 2 : 0);
    },
    launch({ from, centre, ground, k = 1, level = 0, heading = 0, long = 0, keep = null }) {
      const c = cast, g = clamp(Math.round(level), 0, 3), n = T.spears[g];
      c.t = 0; c.k = k; c.level = g; c.R = T.radius[g] * k; c.sealR = T.seal[g] * k; c.heading = heading; c.long = (long || (1.1 + 0.25 * g) * k) * 1.25;
      c.from.copy(from); c.ground = ground;
      c.centre.set(centre.x, ground(centre.x, centre.z), centre.z);
      c.right.set(Math.cos(heading), 0, -Math.sin(heading));
      // where each will land (spread evenly, none in the middle: the great spear's), the slope there, and where it hangs
      // under the seal before it falls (nearer the middle than it lands: they fan out as they come down)
      const upOf = (x, z, out) => { const e = 0.35 * k; return out.set(ground(x - e, z) - ground(x + e, z), 2 * e, ground(x, z - e) - ground(x, z + e)).normalize(); };
      let top = Math.max(c.centre.y, from.y - 1.4 * k);
      c.strikes.length = 0;
      const turn0 = rand() * TAU, order = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (let i = 0; i < n; i++) {
        const a = turn0 + i * 2.39996 + (rand() - 0.5) * 0.4, far = c.R * Math.sqrt(0.17 + 0.83 * (i + 0.5) / n) * (0.94 + 0.12 * rand());
        let x = c.centre.x + Math.cos(a) * far, z = c.centre.z + Math.sin(a) * far;
        if (keep) {      // (none on her own head: one that would land there lands beside her)
          const dx = x - keep.x, dz = z - keep.z, d = Math.hypot(dx, dz);
          if (d < keep.r) { const b = d > 1e-3 ? Math.atan2(dz, dx) : a; x = keep.x + Math.cos(b) * keep.r; z = keep.z + Math.sin(b) * keep.r; }
        }
        const y = ground(x, z);
        top = Math.max(top, y);
        c.strikes.push({ index: i, great: false, done: false, popped: false, size: 0.85 + 0.35 * rand(), a, far, land: new THREE.Vector3(x, y, z), up: upOf(x, z, new THREE.Vector3()),
          hang: new THREE.Vector3(), dir: new THREE.Vector3(), form: 0, go: T.fall + order[i] * T.every[g], hit: 0 });
      }
      c.portal.set(c.centre.x, top + T.high[g] * k, c.centre.z);
      // (they take shape one after another round the seal)
      const about = c.strikes.slice().sort((p, q) => ((p.a - turn0) % TAU + TAU) % TAU - ((q.a - turn0) % TAU + TAU) % TAU);
      const early = about.filter(s => s.go < T.fall + T.first);
      early.forEach((s, i) => { s.form = T.form[0] + (T.form[1] - T.form[0]) * i / Math.max(1, early.length - 1); });
      // (a long rain's later ones: each a little before it is let go)
      for (const s of about) if (s.go >= T.fall + T.first) s.form = s.go - T.hang - T.linger * rand();
      for (const s of c.strikes) {
        const in_ = s.far / c.R * c.sealR * 0.78;
        s.long = (2.0 + 0.5 * rand()) * s.size * k;
        s.hang.set(c.portal.x + Math.cos(s.a) * in_, c.portal.y - (0.35 + 0.4 * rand()) * k - s.long, c.portal.z + Math.sin(s.a) * in_);
        s.dir.subVectors(s.land, s.hang).normalize();
        s.hit = s.go + T.drop;
      }
      c.last = T.fall + (n - 1) * T.every[g] + T.drop;
      const gf = c.last + T.great.after;
      c.great = { index: n, great: true, done: false, popped: false, size: T.grand[g], long: 3.7 * k * T.grand[g], land: c.centre.clone(), up: upOf(c.centre.x, c.centre.z, new THREE.Vector3()),
        hang: new THREE.Vector3(c.portal.x, c.portal.y - 3.2 * k * T.grand[g], c.portal.z), dir: new THREE.Vector3(0, -1, 0), form: gf, go: gf + T.great.form, hit: gf + T.great.form + T.great.drop };
      c.all = [...c.strikes, c.great];
      c.close = c.great.hit + 0.12; c.end = c.great.hit + T.end;
      // its way up: from her hand, up first, then over to the seal's middle
      c.mid.copy(from).lerp(c.portal, 0.18); c.mid.y = from.y + (c.portal.y - from.y) * 0.72;
      c.bolt = 0; c.dust = 0; c.glow = 0; c.flash = 0; c.shed = 0;
      for (const b of bolts) { b.age = 1; b.mesh.visible = false; }
      // let go: a splash at her hand, beads thrown off
      splash(from, 0.7 * k, 0);
      scatter(from, 8, 2.6 * k, 0.08 * k, 2); scatter(from, 5, 3 * k, 0.07 * k, 0);
      return { portal: c.portal, radius: c.R, lands: c.strikes.map(s => s.land), end: c.end,
        when: { open: T.rise, fall: T.fall, first: T.fall + T.drop, last: c.last, great: c.great.hit } };
    },
    stop() {
      cast.t = -1; twirlPts.length = 0; splashes.length = 0; rounds.length = 0; held.on = false; stuck.length = 0;
      seal.visible = false; twirlBand.mesh.visible = false;
      for (const h of helix) h.band.mesh.visible = false;
      for (const b of bolts) { b.age = 1; b.mesh.visible = false; }
      for (const set of [bits, flares]) { for (let i = 0; i < set.count; i++) set.a.aData.setXYZW(i, -1000, 1, 0, 0); set.a.aData.needsUpdate = true; }
      spearMesh.visible = streakMesh.visible = splashMesh.visible = roundMesh.visible = false;
    },
    update(dt, camera) {
      time += dt;
      look.uTime.value = time;
      nSpear = nStreak = 0;
      // ---- the lance in her hand, this frame (the move says); the band behind it as she twirls it: where its end
      // has been, newest first
      if (held.on) { spearAt(held.tip, held.dir, held.long, held.there, 0.25); held.on = false; }
      for (const p of twirlPts) p.age += dt;
      while (twirlPts.length && twirlPts[twirlPts.length - 1].age > TWIRL.life) twirlPts.pop();
      if (twirlPts.length >= 2) {
        let far = 0;
        for (let i = 0; i < TWIRL.places; i++) {
          const p = twirlPts[Math.min(i, twirlPts.length - 1)], gone = clamp(p.age / TWIRL.life, 0, 1);
          if (i > 0 && i < twirlPts.length) far += p.at.distanceTo(twirlPts[i - 1].at);
          const ends = i >= twirlPts.length - 1 ? 0 : Math.min(1, i / 2) * (1 - 0.5 * gone);
          lay(twirlBand, i, p.at.x, p.at.y, p.at.z, p.dir.x, p.dir.y, p.dir.z, p.half * ends, gone, far / TWIRL.every, 1);
        }
        shown(twirlBand, time);
      } else twirlBand.mesh.visible = false;

      const c = cast;
      if (c.t >= 0) {
        const was = c.t, k = c.k;
        c.t += dt;
        const t = c.t;
        // ---- the lance on its way up, the ribbon of water wound round its way, beads shed from it
        const u = upAt(t);
        if (t < T.rise + 0.06) {
          wayAt(u, v); wayDir(u, w);
          const there = 1 - smooth(T.rise - 0.05, T.rise + 0.06, t);
          spearAt(v, w, c.long * (0.55 + 0.45 * there), there, 1);
          wayAt(Math.max(0, u - 0.04), tan);
          streakAt(tan, w, Math.min(2.4 * k, tan.distanceTo(c.from)), 0.16 * k, there * 0.9);
          c.shed -= dt;
          if (c.shed <= 0) {
            c.shed = 0.026;
            wayAt(Math.max(0, u - 0.06 - 0.1 * rand()), tan);
            const a = rand() * TAU;
            tan.x += Math.cos(a) * HELIX.r * k; tan.z += Math.sin(a) * HELIX.r * k;
            bit(tan, Math.cos(a) * 1.3 * k, (0.5 + rand()) * k, Math.sin(a) * 1.3 * k, 0.5 + 0.4 * rand(), (0.05 + 0.06 * rand()) * k, rand() < 0.5 ? 2 : rand() < 0.6 ? 0 : 1);
          }
        }
        const lenWay = c.from.distanceTo(c.mid) + c.mid.distanceTo(c.portal);
        for (const h of helix) {
          if (t > T.rise + HELIX.life) { h.band.mesh.visible = false; continue; }
          const N = HELIX.places, d = h.d;
          for (let i = 0; i < N; i++) {
            const s = u * i / (N - 1), m = s * lenWay, back = (u - s) * lenWay, gone = clamp((t - passed(s)) / HELIX.life, 0, 1), j = i * 3;
            wayAt(s, v); wayDir(s, tan);
            side.crossVectors(tan, c.right).normalize();                 // one way across its way; the other is `right`
            const close = 0.3 + 0.7 * Math.max(Math.min(1, back / (HELIX.near * k)), smooth(T.rise, T.rise + 0.2, t));      // (it closes in on the lance behind its point; the lance gone, it lets go)
            const r = HELIX.r * d.r * k * close * (1 + HELIX.swell * gone + 0.1 * gone * Math.sin(m * 2.3 + t * 8 + d.phase));
            const th = d.phase + m * TAU / (HELIX.pitch * k) - t * HELIX.spin, cs = Math.cos(th), sn = Math.sin(th);
            hOut[j] = side.x * cs + c.right.x * sn; hOut[j + 1] = side.y * cs + c.right.y * sn; hOut[j + 2] = side.z * cs + c.right.z * sn;
            hAt[j] = v.x + hOut[j] * r; hAt[j + 1] = v.y + hOut[j + 1] * r; hAt[j + 2] = v.z + hOut[j + 2] * r;
          }
          for (let i = 0; i < N; i++) {
            const s = u * i / (N - 1), m = s * lenWay, back = (u - s) * lenWay, gone = clamp((t - passed(s)) / HELIX.life, 0, 1), j = i * 3;
            const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(N - 1, i + 1) * 3;
            tan.set(hAt[i1] - hAt[i0], hAt[i1 + 1] - hAt[i0 + 1], hAt[i1 + 2] - hAt[i0 + 2]);
            v.set(hOut[j], hOut[j + 1], hOut[j + 2]);
            side.crossVectors(v, tan).normalize();                       // across the band: along the lance's way, near enough
            toCam.set(camera.position.x - hAt[j], camera.position.y - hAt[j + 1], camera.position.z - hAt[j + 2]).normalize();
            const ends = Math.min(1, m / (0.5 * k)) * (u < 1 ? Math.min(1, back / (0.5 * k)) : 1);
            // (the blade's head leads, up the lance's way: counted back from its far end)
            lay(h.band, i, hAt[j], hAt[j + 1], hAt[j + 2], side.x, side.y, side.z, HELIX.wide * d.wide * k * ends * (1 - 0.45 * gone), gone, d.phase - m / (d.every * k), v.dot(toCam));
          }
          shown(h.band, time + d.phase);
        }
        // ---- the seal: it opens where the lance stops, its face bright and a fringe of water thrown out round it;
        // lightning out of its middle and sparkles under it while it stands; it breaks up once the great spear is down
        if (was < T.rise && t >= T.rise) {
          flare(c.portal, 0.5 * c.sealR, 0.4, 0);
          round(c.portal, UP, c.sealR * 1.42, { life: 0.66, inner: 0.76, rise: -0.04, from: 0.5, spin: 1.5, times: 6 });
          scatter(c.portal, 12, 3.6 * k, 0.12 * k, 1); scatter(c.portal, 8, 3 * k, 0.1 * k, 2);
          if (rain.onBeat) rain.onBeat('open');
        }
        const open = (t - T.rise) / T.open, left = 1 - clamp((t - c.close) / T.close, 0, 1);
        if (open > 0 && left > 0) {
          seal.visible = true;
          seal.position.copy(c.portal);
          seal.rotation.y = c.heading;
          seal.scale.setScalar(c.sealR * (0.05 + 0.95 * backOut(open)));
          sealMat.uniforms.uWash.value = 0.95 * (1 - smooth(0.25, 1.9, open));
          sealMat.uniforms.uFade.value = left;
          c.flash = Math.max(0, c.flash - dt / 0.12);
          sealMat.uniforms.uFlash.value = c.flash;
          const standing = t < c.great.go;
          c.bolt -= dt;
          if (open > 0.5 && standing && c.bolt <= 0) {
            const b = bolts.find(o => o.age >= 1) || bolts[0], big = t > c.great.form;
            boltNew(b, big); c.bolt = big ? 0.05 + 0.05 * rand() : 0.09 + 0.2 * rand(); c.flash = 1;
          }
          c.dust -= dt;
          if (open > 0.4 && left > 0.6 && c.dust <= 0) {
            c.dust = 0.045;
            const a = rand() * TAU, far = c.sealR * Math.sqrt(rand());
            v.set(c.portal.x + Math.cos(a) * far, c.portal.y - (0.2 + 2.6 * rand()) * k, c.portal.z + Math.sin(a) * far);
            bit(v, (rand() - 0.5) * 0.4, -(0.3 + 0.8 * rand()) * k, (rand() - 0.5) * 0.4, 0.7 + 0.7 * rand(), (0.07 + 0.09 * rand()) * k, 1);
          }
          c.glow -= dt;
          if (standing && open > 0.6 && c.glow <= 0) { c.glow = 0.24; flare(c.portal, (0.8 + 0.4 * rand()) * k * (t > c.great.form ? 2 : 1), 0.5, 0); }
        } else seal.visible = false;
        for (const b of bolts) {
          if (b.age >= 1) { b.mesh.visible = false; continue; }
          b.age += dt / b.life;
          if (!b.bent && b.age > 0.45) { b.bent = true; boltBend(b); }
          if (b.age >= 1) b.mesh.visible = false; else boltDraw(b, camera);
        }
        // ---- the spears: each takes shape under the seal (out of a small star, growing down from its tail), hangs,
        // falls on a streak of light, and lands; the great spear last, out of the seal's middle
        for (const s of c.all) {
          const far = (s.great ? 6.5 : 4.6) * k, wide = (s.great ? 0.6 : 0.25) * k * s.size;
          if (s.done) {
            // (it stands where it struck: `stuck`, below; what is left of its streak thins away)
            const since = t - s.hit;
            if (since < 0.16) streakAt(s.land, s.dir, far * (1 - since / 0.16), wide, 1 - since / 0.16);
            continue;
          }
          if (t < s.form) continue;
          const pop = (t - s.form) / (s.great ? T.great.form : T.pop);
          if (!s.popped) {
            s.popped = true;
            v.copy(s.hang).addScaledVector(s.dir, -s.long);
            flare(v, (s.great ? 2.4 : 0.5) * k * s.size, s.great ? 0.36 : 0.2, 0);
            scatter(v, s.great ? 8 : 1, 1.6 * k, 0.09 * k, 1);
          }
          if (t < s.go) {
            // hanging: grown down from its tail, swaying a little
            const grown = backOut(pop), bob = Math.sin(t * 5 + s.index * 1.7) * 0.03 * k;
            v.copy(s.hang).addScaledVector(s.dir, -s.long * (1 - grown)); v.y += bob;
            spearAt(v, s.dir, s.long * Math.max(0.02, grown), Math.min(1, pop * 3), 1 - 0.8 * smooth(0.5, 1.6, pop));
            continue;
          }
          const fall = (t - s.go) / (s.hit - s.go);
          if (s.great && was < s.go && rain.onBeat) rain.onBeat('great');
          if (fall >= 1) { s.done = true; landed(s); streakAt(s.land, s.dir, far, wide, 1); continue; }
          v.copy(s.hang).lerp(s.land, fall * fall * (0.55 + 0.45 * fall));
          spearAt(v, s.dir, s.long, 1, 0.75);
          w.copy(v).addScaledVector(s.dir, -0.72 * s.long);              // (the streak begins behind its head)
          streakAt(w, s.dir, Math.min(far, w.distanceTo(s.hang) + 0.6 * s.long), wide, Math.min(1, fall * 5));
        }
        if (was < T.fall && t >= T.fall && rain.onBeat) rain.onBeat('fall');
        if (t >= c.end) { c.t = -1; seal.visible = false; for (const b of bolts) b.mesh.visible = false; for (const h of helix) h.band.mesh.visible = false; }
      }
      // ---- the spears that stand where they landed (whether a rain is going or not): quivering to rest, standing, going
      {
        const G = GRAVES, k = cast.k;
        let alive = 0;
        for (let i = 0; i < stuck.length; i++) {
          const g = stuck[i];
          g.age += dt;
          const gone = (g.age - g.until) / G.gone;
          if (gone >= 1) continue;
          stuck[alive++] = g;
          // the way it points: at rest, with what is left of its quiver (from the way it fell, through its rest and back),
          // and of the great spear's blow (away from it and back)
          const q = Math.exp(-g.age / G.quiver) * Math.cos(TAU * G.beats * g.age);
          w.copy(g.rest).addScaledVector(g.fell, q).addScaledVector(g.rest, -q);
          if (g.shook >= 0) {
            g.shook += dt;
            const sh = g.shock * Math.exp(-g.shook / 0.28) * Math.sin(TAU * 5.5 * g.shook);
            w.addScaledVector(g.out, sh);
            if (g.shook > 1.5) g.shook = -1;
          }
          w.normalize();
          const going = Math.max(0, gone), hot = G.hot + (0.75 - G.hot) * Math.exp(-g.age / G.cool) + 0.5 * going;
          spearAt(v.copy(g.land).addScaledVector(w, g.bury * g.long), w, g.long, 1, Math.min(1, hot), going, g.own);
          // sparks off it where it goes, rising
          if (going > 0) {
            const n = g.great ? G.great : G.sparks;
            while (g.shed < n && going >= (g.shed + 0.5) / n) {
              const x = clamp(going * 1.1, 0, 1 - g.bury);      // (how far down it the going has come)
              tan.copy(g.land).addScaledVector(w, -g.long * (1 - g.bury - x));
              bit(tan, (rand() - 0.5) * 0.5 * k, (0.5 + 0.9 * rand()) * k, (rand() - 0.5) * 0.5 * k, 0.5 + 0.5 * rand(), (g.great ? 0.1 : 0.07) * (0.7 + 0.6 * rand()) * k, 1);
              g.shed++;
            }
          }
        }
        stuck.length = alive;
        // (while they stand: a spark off one of them now and then)
        mote -= dt;
        if (alive && mote <= 0) {
          mote = G.mote * (0.6 + 0.8 * rand()) * Math.max(1, 12 / alive);
          const g = stuck[Math.floor(rand() * alive)];
          if (g.age < g.until) {
            tan.copy(g.land).addScaledVector(g.rest, -g.long * (0.15 + 0.8 * rand()));
            bit(tan, (rand() - 0.5) * 0.2 * k, (0.25 + 0.4 * rand()) * k, (rand() - 0.5) * 0.2 * k, 0.6 + 0.5 * rand(), (0.045 + 0.04 * rand()) * k, 1);
          }
        }
      }
      spears.geo.instanceCount = nSpear; streaks.geo.instanceCount = nStreak;
      spearMesh.visible = nSpear > 0; streakMesh.visible = nStreak > 0;
      if (nSpear) for (const n in spears.a) spears.a[n].needsUpdate = true;
      if (nStreak) for (const n in streaks.a) streaks.a[n].needsUpdate = true;
      // ---- the splashes: one whole frame at a time, the last part of each going
      let n = 0;
      for (let i = 0; i < splashes.length; i++) {
        const h = splashes[i];
        h.age += dt;
        const p = h.age / h.life, fr = hit.sheet.frames;
        if (p >= 1) continue;
        const f = fr[Math.min(fr.length - 1, Math.floor(p * fr.length))], gone = clamp((p - (1 - HIT.fade)) / HIT.fade, 0, 1);
        splashSet.a.aAt.setXYZ(n, h.x, h.y, h.z);
        splashSet.a.aBox.setXYZW(n, f[2], f[3], f[4], f[5]);
        splashSet.a.aFrame.setXYZW(n, f[0], f[1], h.reach, 1 - gone * gone * (3 - 2 * gone));
        splashSet.a.aSpin.setXYZ(n, h.cos, h.sin, h.mirror);
        splashes[n++] = h;
      }
      splashes.length = n;
      splashSet.geo.instanceCount = n; splashMesh.visible = n > 0;
      if (n) for (const a in splashSet.a) splashSet.a[a].needsUpdate = true;
      // ---- the rings of the blade: out fast at first, turning, thinning away
      n = 0;
      for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i];
        r.t += dt / r.life; r.age += dt; r.turn += r.spin * dt;
        if (r.t >= 1) continue;
        const out_ = 1 - Math.pow(1 - r.t, 2.5), f = bladeFrame(r.age);
        roundSet.a.aAt.setXYZ(n, r.x, r.y, r.z);
        roundSet.a.aUp.setXYZ(n, r.ux, r.uy, r.uz);
        roundSet.a.aRing.setXYZW(n, r.radius * (r.from + (1 - r.from) * out_), r.inner, r.rise, r.turn);
        roundSet.a.aFrame.setXYZW(n, f[0], f[1], r.times, 1 - r.t * r.t);
        rounds[n++] = r;
      }
      rounds.length = n;
      roundSet.geo.instanceCount = n; roundMesh.visible = n > 0;
      if (n) for (const a in roundSet.a) roundSet.a[a].needsUpdate = true;
    },
    setNight(on) { look.uShine.value = on ? 1.35 : 0.8; },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of made) m.dispose();
      for (const p of pictures) p.dispose();
      sealMap.dispose();
    },
  };
  return rain;
}
