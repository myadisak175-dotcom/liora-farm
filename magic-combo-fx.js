/* ==========================================================================
   magic-combo-fx.js  —  the light of Vivi's magic combo (magic-combo.js): an orb of light gathered in her hand and
   thrown, the ribbon it leaves, the wave a cut sends out, the burst where one lands, a few gold sparks. Sky blue with
   gold; made for this, not taken from her other spells. And the held cast's: a spear of ice and water thrown through
   a magic circle, in its own cyan (below). One job: draw them. It decides nothing: the combo says where.

     const fx = createMagicComboFx()
     scene.add(fx.object)             (a page that dims its land by night draws this after the dimming, as the circles)
     fx.glow(key, at, size)           light gathered at a hand: call it every frame it is there (key: any name, one glow
                                      each); a frame it is not called, it goes out
     fx.trail(key, at)                a ribbon through where a hand has been: call it every frame of a swing; it fades
                                      away behind by itself
     const shot = fx.shot(kind)       something thrown. kind 'orb' | 'big': an orb with a ribbon behind it, shedding a
                                      gold spark now and then; 'wave' | 'rise': the wave of a cut, a curved band of
                                      light seen from behind as a crescent (wave: leaning, as her cut came down; rise:
                                      standing, off an upward sweep); 'lance': a spear of ice and water, held in her
                                      hand while it grows and then thrown (the same one: far 0 while she holds it)
       shot.place(at, dir, far)       every frame: where it is (a lance: its point), the way it goes (unit), how far
                                      it has come (m)
       shot.size(level)               a lance: how grown it is (0..3); shot.long: its length now (m)
       shot.end(hit)                  it is over: it landed (the combo then asks for a burst) or ran out (it fades)
     const gate = fx.gate()           the magic circle a lance is thrown through: standing in the air, facing the way
                                      she aims
       gate.place(at, dir, radius)    every frame: its middle, the way it faces (unit), its outer ring's radius (m)
       gate.size(level)               how grown (0..3): it beats once each time (and its seals come when full grown)
       gate.close(k)                  how far its three layers have come together (0: apart, one before another on
                                      the lance's line, turning against each other; 1: one circle): GATE. Not told,
                                      it goes by how grown it is
       gate.fire()                    the lance goes through it: it flares, and all that is let go with the lance
                                      (THE LANCE, below); and it breaks up
       gate.end()                     nothing is thrown after all: it breaks up
     fx.burst(at, size, sea, look)    where one lands: a flash, a ring going out, gold sparks (sea: the lance's
                                      sparkles instead; look 'water': the clip's splash of water instead, WATER_HIT;
                                      look: as fx.look, the one now if not given)
     fx.ring(at, radius, look)        a ring of light going out over the ground from `at` to `radius` (she lands a leap;
                                      look 'water': a crown of the clip's water thrown outward instead, WATER_BLADE)
     fx.motes(at, n, from, sea)       n gold sparks (sea: the lance's sparkles) drawn in to `at` from `from` m away
                                      (light being gathered)
     fx.look(name)                    what is drawn from now on looks so: 'sky' (sky blue with gold, as it always was) or
                                      'water' (the clip the user sent of a girl's four water casts, "Vfx ทำแบบในวีดีโอได้ยิ่งดี",
                                      22 Nov 2026: all of it the clip's own pictures, WATER_CASTS, WATER_BOLT, WATER_HIT,
                                      WATER_BLADE: no glow at her hand, no ribbon, what is thrown the clip's bolt, a
                                      wave a band of the clip's water, where either lands the clip's splash, a ring
                                      over the ground a crown of the clip's water). What is thrown and its burst take
                                      the look there is as they are made (a shot keeps its own: shot.look). The lance
                                      and its circle have their own look, whatever this is
     fx.cast(n, { hand, dir, feet, size })  play a water release (WATER_CASTS' n-th) at the strike marker. The first cast
                                      starts at the palm, the sweep and turn wrap her body, the vortex opens ahead of
                                      her; the fifth (n 4) is the rising cast's crescent, coming up before her. size:
                                      of her 1.75 m (smaller: the first cast's needles at a hand that throws in the air)
     fx.update(dt, camera)            every frame
     fx.setNight(on)                  by night its light is let shine more
     fx.dispose()

   THE LANCE, as in the clip it was asked after (22 Nov 2026: ten seconds made with Gemini, a spear of water shot out of
   a magic circle; asked which of her spells: "ใส่แทนอันเดิม", in place of what the lance had, and its light "แบบในคลิป
   เลย", as the clip's. What it had, a picture's thick beam, crescents of wind and petals of light, an hour old, is in
   the history). The clip takes ten seconds over it; here it is a move in a fight, so all of it is over in about one:
     - the circle (the gate): a thick rim with a thin ring inside it, a band of marks, a ring; inside that a diamond and
       a square across it, turning; the circle in the square and a small star turning the other way; a ring in the
       middle, which the lance goes through; two small seals standing on its rim and a comet of light running round
       outside it. Its face is washed blue, its lines glow, sparkles drift off it while it stands
     - the lance: an ornate spear of ice and silver, a picture the user sent ("หอกอันนี้แทนได้ไหม", the same evening:
       assets/textures/lance-spear.webp); thrown, whiter, a blue flame licking back along its shaft. (Before it, and
       until it has come, a spear the shader draws: a pommel, a thin shaft, a bead, a spike across, a barbed head)
     - let go: the circle's middle flares into a four-pointed star; slivers of ice are thrown out round its rim; a hoop
       of water goes out round the lance's line a little way on, spray torn off its rim, and thin hoops further on as
       it flies; a white-hot beam is left standing from the circle on for a moment
     - the wake: ribbons of water wound round the lance's way from the circle on, a double helix (two broad ones, two
       thin blue ones between them), turning; each place on one, once the lance has passed it, thins to a line and
       loosens until it is gone
     - SINCE 23 Nov 2026 ("สกิลปาหอก ทำวงคลื่นให้เป็นแนวๆ เดียวกันได้ไหม", the basic combo's water
       being the look to go by from then on): its rings of water are the clip's water, as the combo's are, not lines
       of light the shader draws. The hoops round its line, and the wave that goes out round the circle: the blade
       laid round a ring (WATER_BLADE.hoop); the wake: the blade laid along each ribbon, crescents winding round its
       way, the ribbons broader for it (WATER_BLADE.wake); where it lands, and each time it grows in her hand: the
       clip's splash, with the lance's own sparkles. The circle, the spear, the beam, the slivers and the sparkles
       are as they were. And the circle is three layers that turn against each other and come together as the lance
       grows ("ทำวงเวทสามชั้นให้มันหมุนทวนกันแล้วค่อยๆ ประกบเข้ากันได้ไหม", the same night): GATE
     - sparkles: beads of light shed along its way, which drift and twinkle on a second after it has gone
   The clip's glow is laid over its whole picture (bloom), which a phone would pay for every frame; here each thing
   carries its own glow in its shader, so it is not as soft as the clip's.

   How it is drawn: light laid over the picture with one blend (what a thing covers hides what is behind it, its glow
   only adds), every material marked userData.noGrade (the light of the hour and the curse leave it alone). An orb, a
   glow, a burst: one square turned to the camera, all of it worked out by its shader. A ribbon: a strip through up to
   20 places, turned to the camera on the way (a lance: a strip of its own, its picture laid on it by its shader;
   a ribbon of its wake: a strip laid along a helix worked out anew each frame). Sparks, sparkles and slivers: one
   instanced square each, moved by its shader. The gate and a hoop: one square each, all of it drawn by its shader (as
   magic-circle-fx.js draws the jump's circles, and by its rules for a phone's GPU: every line always drawn and then
   masked, nothing that can be NaN, the result kept between 0 and 1). Few of anything: 8 orbs, 4 waves, 3 lances (4
   ribbons of wake and a beam each), 4 hoops (here: strips of the blade), 2 gates, 3 rings, 6 bursts, 10 ribbons, 192 sparks, 64 slivers at most.
   Phone-safe shaders: no arrays, no loops. Each water cast: one square with its frames' picture on it (WATER_CASTS); 6 bolts and 6
   splashes of water, a square each (WATER_BOLT, WATER_HIT); 4 waves and 3 rings of the blade, a strip each (WATER_BLADE).
   ========================================================================== */
import * as THREE from 'three';
import { WATER_SHEETS, BOLT_WAY } from './assets/water-casts/water-casts.js?v=6';

const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// the light: an orb's heart (near white), its body, the glow round it; the sparks
export const COMBO_LOOK = { core: '#f6fdff', main: '#74cfff', deep: '#2f8fe6', gold: '#ffd66e' };
// her four tapped casts, as in the clip: aqua water (its colours read off the clip: the body of a crescent about
// #7de0e1 over dark ground, its bright edge #a8f8f6, its heart #cbfdfd), drops of it in place of gold sparks
export const WATER_LOOK = { core: '#effffe', main: '#5fe6e8', deep: '#169fb0' };
// The four casts' pictures (water-<asset>.webp; what is in one and where: WATER_SHEETS, water-casts.js). duration: s
// a cast's frames take; elevation, reach: where it is put (m at 1.75 m: up from her hand or her feet, on the way she
// casts); wrap: m its top goes behind her and its foot comes before her.
// The pictures: the clip's own frames, as the first textures were (the same frames, put in the same place, as big),
// but cut from the clip at its full size and made crisp ("ถ้าทำให้ texture ชัดสวยจะดีมาก", 22 Nov 2026: the first
// were a quarter of the clip's size, 256 pixels across a cast five metres wide, and two frames were always shown
// mixed, so they looked out of focus). Now 4/3 of the clip's size (about 260 pixels to a metre: a phone held upright
// shows about 330), and one frame at a time. How they are made: tools/make-water-casts.py.
// Which way a picture is drawn, and how fast ("ถ้าคอมโบธรรมดา หนึ่ง สอง สาม เอฟเฟคมันดูพุ่งเบี้ยวๆ ไม่ตรงหน้าตัวละคร
// แล้วก็มันดูช้าๆ ดูไม่มี momentum เลย", 23 Nov 2026). The clip was filmed from behind the girl, so what is before
// her in a picture is up it; the game's camera does not come round behind her (player-camera.js), she casts the way
// she faces, and with her facing across the screen or out of it the picture's water still went up the screen: off
// to one side of her, or behind her. Now a picture is turned to the way she casts as the camera sees it from above.
//   flat: how it is turned. The crescent and the rings lie about her, level, and the clip saw them from a little
//         above: turned as they are they would stand up on their edge. So a picture is first made as tall as it is
//         from straight above (its height over `flat`), turned, and made as flat again: a ring round her stays a
//         ring round her, lying level, from every side. 1: turned as it is. None: not turned (the rings of the
//         third are round her head, as round from every side as the clip saw them; the finisher's shell stands on
//         the ground). A cast thrown steeply down (out of the air) is turned to the way it goes on the screen itself
//   quick: its first frames come faster, its last slower (1: all at one pace; 2: it begins twice as fast)
//   swell: it comes out smaller by so much and is its own size in a moment (SWELL), growing a little on to its end
const WATER_CASTS = [
  // (the needles: in the clip they fan out to the girl's right, the way her hand had swung; here they fan out the way
  // she casts, the way the bolt goes: turned a quarter round to the left before anything else)
  { asset: 'jet',    duration: 0.33, elevation: 0,    reach: 0,    wrap: 0.08, flat: 0.8,  quick: 1.5, swell: 0.3, turn: 1.45 },
  { asset: 'sweep',  duration: 0.5,  elevation: 1.43, reach: 0,    wrap: 1.05, flat: 0.68, quick: 1.7, swell: 0.22, fade: 0.25 },
  { asset: 'orbit',  duration: 0.52, elevation: 1.43, reach: 0.08, wrap: 0.85, quick: 1.7, swell: 0.22 },
  { asset: 'vortex', duration: 0.88, elevation: 0.12, reach: 0.64, wrap: 0.05 },
  // the rising cast ("ท่าเสยก็ต้องทำให้เข้ากัน", 22 Nov 2026): the sweep's crescent as it first comes up (its frames 1 to
  // 4: from low on one side of her up over her other shoulder), stood up steeper, smaller, and gone as it ends.
  // frames: first, last of the picture's; turn: radians it is turned (to the left, about where it is put); scale: of
  // its size; fade: the last part of its time it goes in
  { asset: 'sweep',  duration: 0.26, elevation: 1.05, reach: 0.25, wrap: 0.3, frames: [1, 4], turn: 0.5, scale: 0.72, fade: 0.45 },
];
// a frame is shown whole, one after another, when the game moves on by a good part of a frame at every picture it
// draws (as it does at its own pace); slowed (the page's ½ and ¼), the end of each frame is mixed into the next, over
// so much of it at most
const CAST_MIX = { whole: 0.4, most: 0.6 };
// a cast's swell: s it takes to come to its own size; how much it grows on by its end
const SWELL = { quick: 0.07, on: 0.06 };
// What her water casts throw and where that lands: the clip's own too ("ลูกบอลน้ำไม่เอาอันเก่าแล้ว effect ใช้ชุดใหม่ให้หมด",
// 22 Nov 2026, of the game's own orb, which the casts still threw, and of its burst, its glow at her hand, its ribbons
// and its drops: all of those are gone from the four casts). The first cast's bolt of water (water-bolt.webp: it is
// no longer in the jet's picture, it flies where the game throws it, turned the way it goes) and the splash where it
// lands on the boss (water-hit.webp).
//   WATER_BOLT: long, big: m long (a cast's; the finisher's); fps: its frames a second, round and round; born: s it
//               takes to come out of her hand; gone: s it takes to go when it runs out (landing, it is gone at once);
//               pull: thrown, it is drawn out so much longer along its way, less as it goes (over `ease` s; its
//               own shape after): a thing that leaves fast (less: of that, for the finisher's; tail: its picture is
//               about so many times its size long, and it is drawn out no further back than it has come); end: going straight at the camera or away from it, it
//               is seen from its end: so much of its length is left of it then, at least
//   WATER_HIT:  reach, most: it reaches so many times the burst asked for (as the splash before it), so many m at
//               most; life, more: s it lasts, and more for each m it reaches; fade: the last part of that it goes in;
//               near: m it is drawn before where it is (so that what was hit does not cut it in two)
//   NEAR:       close before the camera a bolt or a splash would fill the screen (she casts toward the camera too):
//               gone nearer than `none` m, whole from `whole` m
const WATER_BOLT = { long: 0.78, big: 1.5, fps: 24, born: 0.012, gone: 0.08, pull: 0.9, ease: 0.14, less: 0.35, tail: 1.3, end: 0.72 };
const NEAR = { none: 1.8, whole: 4.2 };
const WATER_HIT = { reach: 1.3, most: 1.5, life: 0.4, more: 0.1, fade: 0.3, near: 0.45 };
// The blade (water-blade.webp): the sweep's crescent laid out straight, three frames of it. A band of the clip's own
// water for what had no picture in it: the turn's wave and the rising cast's (laid along the wave the game throws: a
// piece of a round wall bowed forward, as the sky-blue one was, its white crest up; "คลื่นของท่า 3 ไม่มีภาพของตัวเอง" was
// one of the things not yet done), and the ring a leap or a blow sends out over the ground (laid round it, `round`
// times, its crest outward).
//   wave, rise: wide, tall: half its width, half its height (m); lean: radians it leans (as SHOTS')
//   fps: its frames a second, round and round; born, gone: s it takes to come and to go
//   ring: round: times the strip goes round it; inner: its inner edge, of its radius; rise: its outer edge stands so
//         much higher than its inner (of its radius: a crown of water thrown outward, which is seen from low over the
//         ground too; flat, it was a line in the grass); spin: rad/s it turns; from: of its radius it begins at;
//         life, more: s it lasts, and more for each m of radius
const WATER_BLADE = {
  wave: { wide: 1.45, tall: 0.4, lean: -0.14 }, rise: { wide: 1.05, tall: 0.27, lean: Math.PI / 2 },
  fps: 11, born: 0.05, gone: 0.14,
  ring: { round: 3, inner: 0.56, rise: 0.17, spin: 2.6, from: 0.22, life: 0.36, more: 0.06 },
  // the lance's ("สกิลปาหอก ทำวงคลื่นให้เป็นแนวๆ เดียวกันได้ไหม", 23 Nov 2026: its rings of water were lines of light the shader
  // drew; they are the blade now, as the basic combo's water is).
  //   hoop: the hoops round its line. round, inner: as the ring's; back: its outer edge is swept so far back along the
  //         line (of its radius); spin: rad/s it turns; let: the one at the circle as it is let go is so much bigger;
  //         gate: the wave that goes out round the circle itself as the lance goes through it: to so many of its radii
  //   wake: the ribbons wound round its way. every: m of its way to one blade along a ribbon; wide: a ribbon is so
  //         many times as wide as it was (a blade is seen only on a band broad enough for it)
  hoop: { round: 3, inner: 0.6, back: 0.14, spin: 3.2, let: 1.2, gate: 1.7 },
  wake: { every: 1.25, wide: 1.9 },
};

const SHOTS = {
  orb: { size: 0.34, ribbon: 0.13, shed: 1.1 },          // the orb's own radius is about a third of its square's (m)
  big: { size: 0.95, ribbon: 0.3, shed: 0.7 },
  wave: { wide: 0.95, tall: 0.26, lean: -0.6 },         // half its width, half its height in the middle (m); radians it leans
  rise: { wide: 0.85, tall: 0.2, lean: Math.PI / 2 },
  lance: { long: [0.75, 1.05, 1.4, 1.8], wide: 0.1196 },      // its length by how grown it is (m); half its strip's width, of its length (its picture's)
};
// the held cast's own light (THE LANCE, above): white at its heart, the clip's cyan, a blue under it
export const LANCE_LOOK = { core: '#f6fffe', main: '#62ebf5', deep: '#1f86d8' };
const LANCE = 10;                                       // places along a lance
// the lance's look: a picture the user sent (22 Nov 2026, "หอกอันนี้แทนได้ไหม"), turned level and made 1024 x 256, its tail
// at the left, its point at the right, as wide across as it is in the picture (SHOTS.lance.wide)
const SPEAR = new URL('./assets/textures/lance-spear.webp', import.meta.url).href;
const RIBBON = 20, SPARKS = 192, SHARDS = 64;
// thrown, the lance is so much longer (and white hot); streak: s the streak of light behind it lasts
const FLIGHT = { long: 1.25, streak: 0.2 };
// the wake: ribbons of water wound round the lance's way from the circle on. places: along each; long: m of its way
// they lie along, from the circle on (nearer the far end they thin away); pitch: m to a turn; r: m from the way; near:
// m behind the lance's point over which they close in on it; wide: half a broad one's width (m); spin: rad/s the whole
// turns; life: s a place on one lasts once the lance has passed it, thinning to a line, further from the way by
// `swell` of its distance and wavering as it goes. strands: each one's place round the way (rad), and its distance,
// width and blue against a broad one's
const WAKE = { places: 96, long: 10, pitch: 2.4, r: 0.3, near: 1.6, wide: 0.085, spin: 7, life: 0.6, swell: 0.3,
  strands: [{ phase: 0, r: 1, wide: 1, blue: 0 }, { phase: Math.PI, r: 1, wide: 1, blue: 0 }, { phase: 1.9, r: 1.3, wide: 0.4, blue: 1 }, { phase: 1.9 + Math.PI, r: 1.3, wide: 0.4, blue: 1 }] };
// what a lance sheds on its way: a sparkle every so many m (and as many again at random)
const SHED = { sparkle: 0.3 };
// as it is let go:
//   beam: left standing from the circle on: places along it, m long at most, half its width (m), s it lasts
//   hoop: of water round the lance's line, spray torn off its rim: m past the circle, its radius at its widest (m), s
//   hoops: thin ones as it flies: one every so many m, so many at most, each so wide (m) and lasting so long (s)
//   shards, sparkles: slivers of ice thrown out round the circle's rim, sparkles thrown out of it
const LAUNCH = { beam: { places: 14, long: 9, wide: 0.1, life: 0.42 }, hoop: { ahead: 1.1, r: 0.8, life: 0.42 },
  hoops: { every: 5, most: 3, r: 0.55, life: 0.34 }, shards: 22, sparkles: 26 };
// the gate: its square reaches so many radii (its flare's rays and its comet stand out past its rim); it opens in `open`
// s, beats `beat` s as it grows, and after the lance has gone through flares and is gone in `fire` s (nothing thrown:
// in `end` s); dust: s between the sparkles that drift off it while it stands
const GATE = { reach: 1.7, open: 0.3, beat: 0.22, fire: 0.5, end: 0.2, dust: 0.06,
  // THREE LAYERS ("ทำวงเวทสามชั้นให้มันหมุนทวนกันแล้วค่อยๆ ประกบเข้ากันได้ไหม", 23 Nov 2026): the circle is three, one before
  // another on the lance's line, each turning against the next, which come together as the lance grows and are one
  // circle by the time it is full grown (let go sooner, they shut as it goes through). The outer one (its rim, the
  // band of marks, the seals, the comet) stands where the circle stood; the middle one (the ring with the diamond and
  // the square in it) and the inner one (the circle with the small star, the ring the lance goes through) stand
  // ahead of it.
  //   gap: how far apart they begin (of the circle's radius, from one to the next); spans: how much of the outer
  //   one's square the middle and the inner one need; apart: how much faster they turn while they are apart (they
  //   slow to their own pace as they meet); shut, snap: how fast they follow where they should be (1/s: as it
  //   grows; as it is let go)
  gap: 2.4, spans: [0.47, 0.31], apart: 2.4, shut: 9, snap: 26 };
const BLEND = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation };

const FACING = /* glsl */`
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }`;

export function createMagicComboFx({ seed = 7 } = {}) {
  const object = new THREE.Group();
  object.name = 'magicComboFx';
  object.renderOrder = 100;          // (a Group's renderOrder orders all within it as one: after all the world's own see-through things (the falls' foam, the mist, splashes: their renderOrder goes up to 6), so that those behind her spells are not painted over them (README, "Over water"); the order within stays as set below)
  let s0 = seed >>> 0;
  const rand = () => { s0 = (s0 + 0x6d2b79f5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const colours = { uCore: { value: rgb(COMBO_LOOK.core) }, uMain: { value: rgb(COMBO_LOOK.main) }, uDeep: { value: rgb(COMBO_LOOK.deep) },
    uGold: { value: rgb(COMBO_LOOK.gold) }, uShine: { value: 1 }, uWater: { value: rgb(WATER_LOOK.main) }, uWaterCore: { value: rgb(WATER_LOOK.core) } };      // shared by every material
  // the held cast's: the same names, its own light (the hour's shine is the one shared)
  const water = { uCore: { value: rgb(LANCE_LOOK.core) }, uMain: { value: rgb(LANCE_LOOK.main) }, uDeep: { value: rgb(LANCE_LOOK.deep) }, uShine: colours.uShine };
  // the lance's picture (SPEAR): shared by the lances; uHas 1 once it has come. Its colours are taken as they are in the
  // file (as every colour here is), and premultiplied by its alpha as it is uploaded, so that drawn smaller its clear
  // edges do not bleed into it
  const spearIn = { value: 0 };
  const spear = new THREE.TextureLoader().load(SPEAR, () => { spearIn.value = 1; }, undefined, err => console.warn('[magic combo] the lance picture', err));
  spear.premultiplyAlpha = true; spear.anisotropy = 4;
  const spearMap = { value: spear };
  // the looks (fx.look): a thing that may be either has colours of its own (own()), set as it is made (paint)
  const LOOKS = {
    sky: { core: colours.uCore.value, main: colours.uMain.value, deep: colours.uDeep.value },
    water: { core: rgb(WATER_LOOK.core), main: rgb(WATER_LOOK.main), deep: rgb(WATER_LOOK.deep) },
  };
  let look = 'sky';
  let eye = null;                                                          // the camera, as of the last update
  const own = () => ({ ...colours, uCore: { value: LOOKS.sky.core.clone() }, uMain: { value: LOOKS.sky.main.clone() }, uDeep: { value: LOOKS.sky.deep.clone() } });
  const paint = (mat, name) => {
    const L = LOOKS[name] || LOOKS.sky, u = mat.uniforms;
    u.uCore.value.copy(L.core); u.uMain.value.copy(L.main); u.uDeep.value.copy(L.deep);
  };
  const square = new THREE.PlaneGeometry(2, 2);
  const made = [];
  // Every one of them is drawn with the see-through things, after all that is solid. (Until 23 Nov 2026 most were not
  // marked so: they were drawn with the solid things and, writing no depth, were painted over by whatever solid came
  // after them. The river comes after the land: so wherever water lay behind her light on the screen, the water was
  // drawn over it, the lance's circle cut off along the far bank, the lance, its wake and the orbs gone over the river:
  // "น้ำบังสกิลหมดเลย".) Those that were not see-through before are drawn in one pass, as they were (forceSinglePass).
  const material = o => { const m = new THREE.ShaderMaterial({ depthWrite: false, ...BLEND, transparent: true, forceSinglePass: !o.transparent, ...o }); m.userData.noGrade = true; made.push(m); return m; };
  const put = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.visible = false; object.add(m); return m; };

  // ---- the four casts' pictures. A frame is mostly air, so a picture holds it as tiles: squares of 14 pixels, each
  // with a rim of one pixel from its neighbours (so that it joins them without a seam), and below them a map for every
  // frame that says where each square's tile is (a square with no water in it points at the first tile, which is
  // empty). A pixel is two numbers: how light the water is there (red) and how much of it there is (green); its colour
  // is the cast's own ramp of colours at that lightness (WATER_SHEETS' ramp: eight colours, from lightness 0.44 to 1).
  // One square is drawn, only as big as the frame's water; the picture is read twice for each frame shown (the map
  // exactly, by texelFetch; then the tile).
  // The pictures are fetched one after another, behind whatever else the page is fetching (5 MB in all, which a phone
  // should not have to take at once with the map it is loading), from the moment this is made: by the time she can
  // cast, they have mostly come. Until a picture has come, nothing of it is drawn (its texture is empty: every square
  // reads as the empty tile). Decoded off the game's own thread where the browser can (createImageBitmap), as they
  // are in the file: no colour made over, nothing multiplied in.
  const atlases = {}, waiting = [];
  const FIRST = ['jet', 'bolt', 'hit', 'sweep', 'blade', 'orbit', 'vortex'];      // (what her first cast needs first)
  let fetching = false, gone = false;
  function fetchNext() {
    if (gone) return;
    waiting.sort((a, b) => FIRST.indexOf(a.name) - FIRST.indexOf(b.name));
    const job = waiting.shift();
    fetching = !!job;
    if (!job) return;
    const got = image => { if (gone) return; job.atlas.image = image; job.atlas.needsUpdate = true; fetchNext(); };
    const plain = () => new THREE.ImageLoader().load(job.url, got, undefined, err => { console.warn('[magic combo] a water picture did not come:', job.name, err); fetchNext(); });
    if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') { plain(); return; }
    fetch(job.url, { priority: 'low' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(b => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: 'none' }))
      .then(got, plain);
  }
  function atlasOf(name) {
    let atlas = atlases[name];
    if (!atlas) {
      atlas = atlases[name] = new THREE.Texture();
      atlas.format = THREE.RGFormat; atlas.colorSpace = THREE.NoColorSpace;
      atlas.minFilter = atlas.magFilter = THREE.LinearFilter;
      atlas.generateMipmaps = false; atlas.flipY = false; atlas.premultiplyAlpha = false;
      if (!waiting.length && !fetching) setTimeout(() => { if (!fetching) fetchNext(); }, 0);      // (once all of them are asked for, below)
      waiting.push({ name, atlas, url: new URL(`./assets/water-casts/water-${name}.webp?v=6`, import.meta.url).href });
    }
    return atlas;
  }
  // a frame's water at a place in it (counted in squares): its map says which tile; premultiplied
  const TILED = /* glsl */`
    uniform sampler2D uAtlas;
    uniform vec2 uTexel, uGrid, uMapA, uMapB;
    uniform float uMix, uK;
    uniform vec3 uR0, uR1, uR2, uR3, uR4, uR5, uR6, uR7;
    // the water's colour at a lightness: the ramp's eight colours, 0.08 apart from 0.44; darker below
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
    vec4 frame(vec2 map, vec2 cell, vec2 f) {
      vec2 slot = floor(texelFetch(uAtlas, ivec2(map + cell), 0).rg * 255.0 + 0.5);
      vec2 s = texture2D(uAtlas, (slot * 16.0 + 1.0 + f * 14.0) * uTexel).rg;
      return vec4(ramp(0.3 + 0.7 * s.r) * s.g, s.g);
    }
    vec4 water(vec2 at) {
      vec2 cell = clamp(floor(at), vec2(0.0), uGrid), f = clamp(at - cell, 0.0, 1.0);
      vec4 c = frame(uMapA, cell, f);
      if (uMix > 0.0) c = mix(c, frame(uMapB, cell, f), uMix);            // (slowed only: the next frame coming in)
      return clamp(c, 0.0, 1.0) * uK;
    }`;
  const tiled = sheet => {
    const uniforms = {
      uAtlas: { value: null }, uTexel: { value: new THREE.Vector2(1 / sheet.size[0], 1 / sheet.size[1]) },
      uGrid: { value: new THREE.Vector2(sheet.grid[0] - 1, sheet.grid[1] - 1) },
      uMapA: { value: new THREE.Vector2() }, uMapB: { value: new THREE.Vector2() }, uMix: { value: 0 }, uK: { value: 1 },
    };
    sheet.ramp.forEach((c, i) => { uniforms['uR' + i] = { value: new THREE.Vector3(c[0], c[1], c[2]) }; });
    return uniforms;
  };
  // a picture on one square turned to the camera, only as big as the frame's water
  function tiles(name) {
    const sheet = WATER_SHEETS[name], atlas = atlasOf(name);
    const uniforms = {
      ...tiled(sheet),
      uBox: { value: new THREE.Vector4() }, uOrigin: { value: new THREE.Vector2(sheet.origin[0], sheet.origin[1]) },
      uCell: { value: sheet.cell }, uHalf: { value: sheet.half }, uScale: { value: 1 }, uWrap: { value: 0 }, uMirror: { value: 1 },
      uSpin: { value: new THREE.Vector2(1, 0) }, uNear: { value: 0 }, uFlat: { value: 1 }, uPull: { value: new THREE.Vector3(1, 0, 0) },
    };
    uniforms.uAtlas.value = atlas;
    const mat = material({
      uniforms, transparent: true,
      side: THREE.DoubleSide,                                              // (mirrored, its square is turned over)
      vertexShader: /* glsl */`
        uniform vec4 uBox;                                                 // the squares with water in them: x0, y0, x1, y1
        uniform vec2 uOrigin, uSpin;
        uniform vec3 uPull;                                                // a way across the screen, and how much longer along it
        uniform float uCell, uHalf, uScale, uWrap, uMirror, uNear, uFlat;
        varying vec2 vCell;
        void main() {
          vec2 t = position.xy * 0.5 + 0.5;
          vCell = vec2(mix(uBox.x, uBox.z, t.x), mix(uBox.w, uBox.y, t.y));       // (squares are counted down the frame)
          vec2 m = uOrigin + vec2(vCell.x, -vCell.y) * uCell;              // from where it is put: to the right, up
          // turned about that point (a bolt, a splash; a cast, to the way she casts: as from straight above, see WATER_CASTS)
          m.y /= uFlat;
          m = vec2(m.x * uSpin.x - m.y * uSpin.y, m.x * uSpin.y + m.y * uSpin.x);
          m.y *= uFlat;
          m += uPull.xy * (dot(m, uPull.xy) * uPull.z);
          vec4 mv = modelViewMatrix * vec4(0., 0., 0., 1.);
          mv.xy += vec2(m.x * uMirror, m.y) * uScale;
          // The lower lip passes in front of Vivi while the high rim goes behind her.
          mv.z += uNear - m.y / uHalf * uWrap;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: TILED + /* glsl */`
        varying vec2 vCell;
        void main() { gl_FragColor = water(vCell); }`,
    });
    return { sheet, atlas, mesh: put(square, mat), uniforms, age: 0 };
  }
  // a picture laid on a shape of its own (the blade: along a wave, round a ring): the shape's uv is where along the
  // strip (0..1, and round again past 1) and where across it (0: its outer edge)
  function laid(name, geo) {
    const sheet = WATER_SHEETS[name], uniforms = tiled(sheet);
    uniforms.uAtlas.value = atlasOf(name);
    const mat = material({
      uniforms, transparent: true, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: TILED + /* glsl */`
        varying vec2 vUv;
        void main() { gl_FragColor = water(vec2(fract(vUv.x), clamp(vUv.y, 0.0, 0.9999)) * (uGrid + 1.0)); }`,
    });
    return { sheet, mesh: put(geo, mat), uniforms, age: 0 };
  }
  // one frame of a picture shown, whole
  function still(p, i) {
    const f = p.sheet.frames[i], u = p.uniforms;
    u.uMapA.value.set(f[0], f[1]); u.uMapB.value.set(f[0], f[1]); u.uMix.value = 0;
    if (u.uBox) u.uBox.value.set(f[2], f[3], f[4], f[5]);
  }

  // ---- an orb (thrown, or gathering at her hand): its heart covers what is behind it, its glow only adds
  const orbMat = () => material({
    uniforms: { ...own(), uSize: { value: 1 }, uK: { value: 1 }, uBeat: { value: 0 } },
    vertexShader: FACING,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uK, uShine, uBeat;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float body = 1.0 - smoothstep(0.24, 0.34, r);                      // the orb itself
        float rim = smoothstep(0.08, 0.32, r);                             // bluer toward its edge
        float glow = pow(max(0.0, 1.0 - r), 2.4) * (0.85 + 0.15 * uBeat);
        // four soft rays, the way a bright light looks
        float rays = pow(max(0.0, 1.0 - r), 3.0) * (pow(max(0.0, 1.0 - abs(vP.x) * 9.0), 2.0) + pow(max(0.0, 1.0 - abs(vP.y) * 9.0), 2.0)) * 0.5;
        // (its glow covers a little too: over bright grass it stays blue, not the grass's green lit up)
        vec3 col = mix(uCore, uMain, rim * 0.8) * body + (uMain * 0.8 + uDeep * 0.35) * (glow + rays) * (1.0 - body) * uShine;
        gl_FragColor = vec4(col * uK, (body * 0.95 + (1.0 - body) * min(1.0, glow * 1.6) * 0.5) * uK);
      }`,
  });
  const orbs = Array.from({ length: 8 }, () => ({ mesh: put(square, orbMat()), live: false, k: 0, kind: null, shed: 0, ribbon: null }));
  const glows = new Map();                                                 // key -> { mesh, seen, k, size }

  // ---- a ribbon: where something has been, newest first
  function makeRibbon() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(RIBBON * 2 * 3), uv = new Float32Array(RIBBON * 2 * 2), idx = [];
    for (let i = 0; i < RIBBON; i++) { uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < RIBBON - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...own(), uK: { value: 1 } },
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain;
        uniform float uK, uShine;
        varying vec2 vUv;
        void main() {
          float along = 1.0 - vUv.x;                                       // 1 at its head, 0 where it ends
          float across = 1.0 - vUv.y * vUv.y;
          float a = along * along * across;
          vec3 col = mix(uMain, uCore, across * across * along);
          gl_FragColor = vec4(col * a * uK * (0.7 + 0.3 * uShine), a * 0.6 * uK);
        }`,
    });
    return { mesh: put(geo, mat), mine: { uCore: mat.uniforms.uCore, uMain: mat.uniforms.uMain }, pts: [], width: 0.1, life: 0.14, used: false, key: null };
  }
  const ribbons = Array.from({ length: 10 }, makeRibbon);
  // (whose: the lance's light, for its streak; none: the ribbon's own colours, painted as the look there is now)
  function takeRibbon(width, life, key = null, whose = null) {
    const r = ribbons.find(o => !o.used && !o.pts.length) || ribbons.find(o => !o.used) || ribbons[0];
    r.pts.length = 0; r.width = width; r.life = life; r.used = true; r.key = key; r.seen = true;
    const u = r.mesh.material.uniforms, c = whose || r.mine;
    u.uCore = c.uCore; u.uMain = c.uMain;
    if (!whose) paint(r.mesh.material, look);
    return r;
  }
  function feed(r, at) {
    const p = r.pts[0];
    if (p && p.age < 0.012 && p.at.distanceToSquared(at) < 0.0009) { p.at.copy(at); return; }
    r.pts.unshift({ at: at.clone(), age: 0 });
    if (r.pts.length > RIBBON) r.pts.length = RIBBON;
  }

  // ---- the wave of a cut: a piece of a round wall, bowed forward, tallest in the middle and gone to nothing at its ends
  const waveGeo = (() => {
    const N = 24, A = 1.05, pos = [], uv = [], idx = [];                   // (half its angle: 60 degrees)
    for (let i = 0; i <= N; i++) {
      const u = i / N * 2 - 1, th = u * A, h = Math.pow(Math.cos(u * Math.PI / 2), 0.7);
      for (const v of [-1, 1]) { pos.push(Math.sin(th) / Math.sin(A), v * h, (Math.cos(th) - 1) / Math.sin(A)); uv.push(u, v); }
    }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  })();
  const waveMat = () => material({
    uniforms: { ...own(), uK: { value: 1 }, uAge: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uK, uShine, uAge;
      varying vec2 vUv;
      void main() {
        float ends = 1.0 - pow(abs(vUv.x), 2.5);
        float v = abs(vUv.y);
        float heart = 1.0 - smoothstep(0.0, 0.42, v);                      // the bright line along its middle
        float body = 1.0 - smoothstep(0.35, 1.0, v);
        // light running along it, so that it is not a still shape
        float run = 0.82 + 0.18 * sin(vUv.x * 9.0 - uAge * 30.0);
        vec3 col = mix(uMain, uCore, heart) * body + uDeep * (1.0 - body) * 0.3;
        float a = body * ends * run;
        gl_FragColor = vec4(col * a * uK * (0.75 + 0.35 * uShine), a * (0.45 + 0.5 * heart) * uK);
      }`,
  });
  const waves = Array.from({ length: 4 }, () => ({ mesh: put(waveGeo, waveMat()), live: false, k: 0, kind: null, age: 0 }));

  // ---- a burst: a flash, and a ring going out
  const burstMat = () => material({
    uniforms: { ...own(), uSize: { value: 1 }, uT: { value: 0 }, uSpike: { value: 0 }, uSeed: { value: 0 } },
    depthTest: false,
    vertexShader: FACING,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uT, uShine, uSpike, uSeed;
      varying vec2 vP;
      float hash(float n) { return fract(sin(n * 78.233 + uSeed) * 43758.5453); }
      // a spike out of the middle in each of n places round (each its own length, reach of the square at most): 1 inside
      float spikes(float ang, float r, float n, float off, float reach, float thin) {
        float s = (ang / 6.2831853 + 0.5) * n + off, id = floor(s), f = abs(fract(s) - 0.5) * 2.0;
        float L = max(0.02, reach * (0.35 + 0.65 * hash(id + off * 50.0)));
        float w = thin * max(0.0, 1.0 - r / L);
        return (1.0 - smoothstep(w, w + fwidth(f) + 0.02, f)) * (1.0 - smoothstep(L * 0.85, L, r));
      }
      void main() {
        float r = length(vP);
        float out_ = 1.0 - pow(1.0 - uT, 3.0);                             // fast at first
        float R = 0.18 + 0.72 * out_;
        float w = 0.05 + 0.07 * (1.0 - uT);
        float ring = (1.0 - smoothstep(0.0, w, abs(r - R))) * (1.0 - uT) * (1.0 - uT);
        float flash = pow(max(0.0, 1.0 - r / (0.3 + 0.5 * out_)), 1.6) * pow(1.0 - uT, 3.0);
        // eight short rays out of the middle, gone at once
        float ang = atan(vP.y, abs(vP.x) < 1e-5 ? 1e-5 : vP.x);
        float rays = pow(abs(cos(ang * 4.0)), 24.0) * (1.0 - smoothstep(0.1, 0.25 + 0.7 * out_, r)) * pow(1.0 - uT, 2.0) * (1.0 - uSpike);
        // water (uSpike): a splash, spikes of every length thrown out of the middle (two sets of them), hollowing from the
        // middle out as it goes, the ring fainter
        float reach = 0.3 + 0.68 * out_;
        float curl = ang + 0.29 * r + 0.08 * sin(ang * 5.0 + uSeed + r * 7.0);
        float sp = max(spikes(curl, r, 16.0, 0.0, reach, 1.05), spikes(curl, r, 9.0, 0.37, reach * 0.76, 1.15) * 0.8);
        sp *= smoothstep(out_ * 0.5 - 0.06, out_ * 0.5 + 0.06, r) * pow(1.0 - uT, 1.4) * uSpike;
        ring *= 1.0 - 0.92 * uSpike;
        vec3 col = uCore * (flash * 1.2 + rays * 0.8) + mix(uMain, uCore, 0.35) * ring + uDeep * flash * 0.4
                 + mix(uMain, uCore, clamp(1.0 - r / reach, 0.0, 1.0) * 0.8) * sp;
        gl_FragColor = clamp(vec4(col * (0.75 + 0.45 * uShine), flash * 0.7 + ring * 0.4 + sp * 0.6), 0.0, 1.0);
      }`,
  });
  const bursts = Array.from({ length: 6 }, () => ({ mesh: put(square, burstMat()), t: 1, life: 0.3 }));

  // ---- a lance: a spear of ice and water on a strip from its tail to its point, turned to the camera: the picture the
  // user sent (SPEAR), laid on the strip from its tail (x 0) to its point (x 1), as wide across as it is in the picture.
  // Until the picture has come (or if it does not), the shader draws one of its own in its place: a pommel, a thin
  // shaft with a bead on it, a guard (a tall thin spike across), and its head, barbed, white down its middle.
  // uHot: thrown (whiter, a blue flame licking back along it)
  function makeLance() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(LANCE * 2 * 3), uv = new Float32Array(LANCE * 2 * 2), idx = [];
    for (let i = 0; i < LANCE; i++) { uv[i * 4] = uv[i * 4 + 2] = i / (LANCE - 1); uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < LANCE - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...water, uK: { value: 1 }, uHot: { value: 0 }, uAge: { value: 0 }, uMap: spearMap, uHas: spearIn },
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain, uDeep;
        uniform float uK, uShine, uHot, uAge, uHas;
        uniform sampler2D uMap;
        varying vec2 vUv;
        // a part of its outline: so tall at x0, narrowing in a straight line to nothing at x1 (before x0 or after it)
        float part(float x, float y, float x0, float x1, float tall, float aa) {
          float u = clamp((x - x0) / (x1 - x0), 0.0, 1.0);
          float within = step(min(x0, x1), x) * step(x, max(x0, x1));
          return within * (1.0 - smoothstep(-aa, aa, y - tall * (1.0 - u)));
        }
        // ... and one that narrows fast at first (a spike)
        float spike(float x, float y, float x0, float x1, float tall, float aa) {
          float u = clamp((x - x0) / (x1 - x0), 0.0, 1.0);
          float within = step(min(x0, x1), x) * step(x, max(x0, x1));
          return within * (1.0 - smoothstep(-aa, aa, y - tall * (1.0 - u) * (1.0 - u)));
        }
        void main() {
          float x = vUv.x, y = abs(vUv.y);
          float ends = smoothstep(0.0, 0.05, x) * smoothstep(0.0, 0.03, 1.0 - x);
          float glow = exp(-y * 6.5) * (0.3 + 0.7 * smoothstep(0.4, 0.8, x)) * ends;
          // thrown: a blue flame licking back along its shaft
          float lick = exp(-y * 4.2) * (0.5 + 0.5 * sin(x * 34.0 - uAge * 28.0 + y * 7.0)) * (1.0 - smoothstep(0.55, 0.8, x)) * smoothstep(0.0, 0.12, x) * uHot;
          // the drawn one (until the picture has come)
          float aa = fwidth(vUv.y) * 1.2 + 0.008;
          float m = (1.0 - smoothstep(-aa, aa, y - 0.03)) * step(0.04, x) * step(x, 0.82);                 // its shaft
          m = max(m, max(part(x, y, 0.045, 0.0, 0.1, aa), part(x, y, 0.045, 0.1, 0.1, aa)));               // its pommel
          m = max(m, max(part(x, y, 0.6, 0.565, 0.12, aa), part(x, y, 0.6, 0.635, 0.12, aa)));             // the bead
          m = max(m, max(spike(x, y, 0.69, 0.65, 0.66, aa), spike(x, y, 0.69, 0.73, 0.66, aa)));           // its guard
          m = max(m, part(x, y, 0.745, 1.0, 0.4, aa) * (1.0 - part(x, y, 0.745, 0.81, 0.4, aa)));         // its head, barbed
          float heart = 1.0 - smoothstep(0.0, 0.14, y);                    // white down its middle
          vec3 ice = mix(uMain, uCore, clamp(0.45 + 0.55 * heart + uHot, 0.0, 1.0));
          vec3 drawn = ice * m + ((uMain * 0.55 + uDeep * 0.6) * glow * (0.8 + 0.7 * uHot) + uDeep * lick * 1.3) * (1.0 - m);
          float drawnA = m * 0.92 + (1.0 - m) * min(1.0, glow * 0.6 + lick * 0.35);
          // the picture (its colour premultiplied as it was uploaded): thrown, whiter, the flame and a glow round it
          vec4 pic = texture2D(uMap, vec2(x, 0.5 + 0.5 * vUv.y));
          vec3 shown = mix(pic.rgb, uCore * pic.a, 0.35 * uHot) + (uDeep * lick * 1.3 + (uMain * 0.55 + uDeep * 0.6) * glow * 0.6 * uHot) * (1.0 - pic.a);
          float shownA = pic.a + (1.0 - pic.a) * min(1.0, lick * 0.35 + glow * 0.3 * uHot);
          vec3 col = mix(drawn, shown, uHas);
          float a = mix(drawnA, shownA, uHas);
          gl_FragColor = clamp(vec4(col * uK * (0.8 + 0.3 * uShine), a * uK), 0.0, 1.0);
        }`,
    });
    return { mesh: put(geo, mat), live: false, k: 0, level: 0, long: 0, grown: 0, hot: 0, ribbon: null, head: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1),
      // in flight: where it was thrown from, how far it has come (m), two ways across its own (for the wake round it),
      // how long ago it was thrown and how long it has been over (s), its pace (m/s), whether its wake is still there,
      // where along its way it sheds its next sparkle and leaves its next hoop (m), how many hoops it has left
      from: new THREE.Vector3(), far: 0, X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), flown: 0, gone: 0, pace: 30, wakeOn: false, sparkAt: 0, hoopAt: 0, hoopN: 0,
      wake: WAKE.strands.map(makeStrand), beam: makeBeam() };
  }
  // ---- a ribbon of the wake: a strip along a helix round the lance's way, turned to the camera, laid anew each frame;
  // the blade laid along it, one after another (aAlong: where along them a place is), so that it is crescents of the
  // clip's water winding round the lance's way. Where it is on the far side of the way from the camera it is fainter
  // (aTone: how far it is turned to the camera, -1..1). uv.x: how far gone a place on it is (0 new, 1 gone)
  function makeStrand(d) {
    const N = WAKE.places, geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), tone = new Float32Array(N * 2), along = new Float32Array(N * 2), idx = [];
    for (let i = 0; i < N; i++) { uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTone', new THREE.BufferAttribute(tone, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    const sheet = WATER_SHEETS.blade, uniforms = tiled(sheet);
    uniforms.uAtlas.value = atlasOf('blade');
    const mat = material({
      uniforms, transparent: true, side: THREE.DoubleSide,
      vertexShader: 'attribute float aTone, aAlong; varying vec2 vUv; varying float vTone, vAlong; void main() { vUv = uv; vTone = aTone; vAlong = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: TILED + /* glsl */`
        varying vec2 vUv;
        varying float vTone, vAlong;
        void main() {
          vec4 c = water(vec2(fract(vAlong), clamp(0.5 - 0.5 * vUv.y, 0.0, 0.9999)) * (uGrid + 1.0));
          float front = smoothstep(-0.25, 0.35, vTone);
          gl_FragColor = c * pow(clamp(1.0 - vUv.x, 0.0, 1.0), 1.25) * (0.5 + 0.5 * front);
        }`,
    });
    return { mesh: put(geo, mat), d, sheet, uniforms };
  }
  // ---- the beam left standing as a lance is let go: a strip from where it was thrown, thin there and thick further
  // on; white hot down its middle, a blue flame flickering along it
  function makeBeam() {
    const N = LAUNCH.beam.places, geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), idx = [];
    for (let i = 0; i < N; i++) { uv[i * 4] = uv[i * 4 + 2] = i / (N - 1); uv[i * 4 + 1] = -1; uv[i * 4 + 3] = 1; }
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = material({
      uniforms: { ...water, uK: { value: 1 }, uAge: { value: 0 } },
      side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uCore, uMain, uDeep;
        uniform float uK, uShine, uAge;
        varying vec2 vUv;
        void main() {
          float y = abs(vUv.y);
          float heart = 1.0 - smoothstep(0.08, 0.3, y);                     // white hot down its middle
          float glow = exp(-y * 3.4) * (1.0 - smoothstep(0.8, 1.0, y));
          float lick = 0.6 + 0.4 * sin(vUv.x * 46.0 - uAge * 30.0 + y * 6.0);
          float ends = smoothstep(0.0, 0.05, vUv.x) * smoothstep(0.0, 0.25, 1.0 - vUv.x);
          vec3 col = uCore * heart + mix(uDeep, uMain, glow * 0.6) * glow * lick * (1.0 - heart);
          gl_FragColor = clamp(vec4(col * ends * uK * (0.85 + 0.3 * uShine), min(1.0, heart * 0.9 + glow * 0.3 * lick) * ends * uK), 0.0, 1.0);
        }`,
    });
    return { mesh: put(geo, mat) };
  }
  const lances = Array.from({ length: 3 }, makeLance);
  const wakeAt = new Float32Array(WAKE.places * 3), wakeR = new Float32Array(WAKE.places * 3);      // a ribbon's places; the way out from the lance's line at each

  // ---- a hoop of water round the lance's line: the blade laid round a ring across the line, its crest outward, its
  // outer edge swept back a little (a crown of water the lance has gone through)
  const hoopGeo = (() => {
    const N = 64, pos = [], uv = [], idx = [], { round, inner, back } = WATER_BLADE.hoop;
    for (let i = 0; i <= N; i++) {
      const th = i / N * Math.PI * 2;
      for (const r of [1, inner]) { pos.push(Math.cos(th) * r, Math.sin(th) * r, r === 1 ? -back : 0); uv.push(i / N * round, r === 1 ? 0 : 1); }
    }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  })();
  const hoops = Array.from({ length: 4 }, () => ({ ...laid('blade', hoopGeo), t: 1, life: 0.4, radius: 1 }));

  // ---- the gate: a magic circle standing in the air, which a lance is thrown through, as the clip's. One square; all
  // of it is drawn by its shader from where on it a pixel is (in radii: its outer ring at 1)
  // (part: 0 the whole circle on one square, as the game has it; 1, 2, 3: its outer, middle and inner layer. span: how
  // much of the whole circle's square this one's square is. uSpin: the clock its marks and figures turn by)
  const gateMat = (part = 0, span = 1) => material({
    uniforms: { ...water, uOpen: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 }, uFlash: { value: 0 }, uWave: { value: 0 }, uFade: { value: 0 }, uAge: { value: 0 },
      uPart: { value: part }, uSpan: { value: span }, uSpin: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: `uniform float uSpan; varying vec2 vP; void main() { vP = position.xy * ${GATE.reach.toFixed(2)} * uSpan; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      #define PI 3.14159265
      #define TAU 6.2831853
      uniform vec3 uCore, uMain, uDeep;
      uniform float uOpen, uLevel, uBeat, uFlash, uWave, uFade, uAge, uShine, uPart, uSpin;
      varying vec2 vP;
      // a line's edge is softened by how fast its distance changes on the screen (see magic-circle-fx.js: every line is
      // drawn for every pixel and then masked, never inside an if that differs from one pixel to the next)
      float line(float d, float w) { float f = fwidth(d) * 1.2 + 0.002; return 1.0 - smoothstep(w * 0.5, w * 0.5 + f, abs(d)); }
      vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
      float hash(float n) { return fract(sin(n * 78.233 + 4.7) * 43758.5453); }
      // how much of a ring is drawn yet: each draws itself round from its own starting point as the gate opens
      float drawn(float a, float at, float from) {
        float s = fract((a + PI) / TAU + from);
        return step(s, clamp((uOpen - at) * 2.6, 0.0, 1.0));
      }
      // the marks round a band (r0..r1): n cells, each a little glyph of strokes picked by a hash
      float runes(float r, float a, float r0, float r1, float n) {
        float v = (r - r0) / (r1 - r0);
        float s = (a / TAU + 0.5) * n, id = floor(s), u = fract(s);
        float h = hash(id), h2 = hash(id + 17.0);
        vec2 q = vec2((u - 0.5) * r * TAU / n / (r1 - r0), v - 0.5);
        float w = 0.13, g = line(q.x, w) * step(abs(q.y), 0.3);
        g = max(g, line(q.y - 0.2, w) * step(abs(q.x), 0.24) * step(0.45, h));
        g = max(g, line(length(q - vec2(0.0, -0.14)) - 0.12, w) * step(0.5, h2));
        g = max(g, line(q.y + q.x * 1.3, w) * step(abs(q.x), 0.2) * (1.0 - step(0.3, h)));
        g = max(g, line(q.y + 0.24, w) * step(abs(q.x), 0.24) * (1.0 - step(0.2, h2)));
        return g * step(0.0, v) * step(v, 1.0);
      }
      float sq(vec2 p, float s) { vec2 q = abs(p); return max(q.x, q.y) - s; }
      // a small seal standing on the rim, at angle a0: two rings and a dot
      float seal(vec2 p, float a0) {
        float d = length(p - vec2(cos(a0), sin(a0)) * 0.94);
        return max(max(line(d - 0.16, 0.018), line(d - 0.105, 0.012)), 1.0 - smoothstep(0.02, 0.04, d));
      }
      void main() {
        vec2 p = vP;
        float r = length(p), a = atan(p.y, abs(p.x) < 1e-6 ? 1e-6 : p.x);  // (no angle at the very middle)
        float t = uAge, spinA = uSpin * 0.9, spinB = -uSpin * 1.3;         // the band of marks and the figures inside turn opposite ways
        // which layer this is (all of them at once: uPart 0): P1 its rim and marks, P2 the ring with the diamond and
        // the square, P3 the circle with the star and the ring in the middle. In layers, the figures are there from
        // the first (they are what is seen to turn); on one square they come as the lance grows, as they did
        float whole = 1.0 - step(0.5, uPart), lay = 1.0 - whole;
        float P1 = max(whole, 1.0 - step(0.5, abs(uPart - 1.0))), P2 = max(whole, 1.0 - step(0.5, abs(uPart - 2.0))), P3 = max(whole, 1.0 - step(0.5, abs(uPart - 3.0)));
        float L = 0.0;
        // its rim, thick, and a thin ring just inside it; the band of marks, a ring inside that; a small ring in the
        // middle (the lance goes through it)
        L = max(L, line(r - 1.0, 0.042) * drawn(a, 0.0, 0.0) * P1);
        L = max(L, line(r - 0.935, 0.016) * drawn(a, 0.06, 0.5) * P1);
        L = max(L, line(r - 0.73, 0.022) * drawn(a, 0.16, 0.25) * P2);
        L = max(L, line(r - 0.17, 0.02) * drawn(a, 0.3, 0.6) * P3);
        L = max(L, runes(r, a + spinA, 0.765, 0.905, 26.0) * step(0.3, uOpen) * P1);
        // grown once: a diamond in the inner ring and a square across it, turning (how near a pixel is to either: fig)
        vec2 q = rot(p, spinB * 0.5);
        float fig = min(abs(sq(rot(q, PI * 0.25), 0.516)), abs(sq(q, 0.47)));
        float came = lay * smoothstep(0.15, 0.55, uOpen);
        float one = max(step(0.5, uLevel), came), two = max(step(1.5, uLevel), came), three = step(2.5, uLevel);
        L = max(L, line(fig, 0.022) * one * P2);
        // twice: the circle in the square, and a small star (two squares) turning the other way round the middle
        vec2 q2 = rot(p, -spinB * 1.1);
        L = max(L, line(r - 0.47, 0.016) * two * P3);
        L = max(L, line(min(abs(sq(q2, 0.235)), abs(sq(rot(q2, PI * 0.25), 0.235))), 0.016) * two * P3);
        // full grown: two small seals standing on its rim, going round with the marks
        L = max(L, max(seal(p, 2.5 - spinA), seal(p, 3.75 - spinA)) * three * P1);
        // a comet of light running round outside its rim: as it opens, each time it grows, and all the while once full grown
        float tail = clamp((fract((a - t * 3.4) / TAU + 0.5) - 0.68) / 0.32, 0.0, 1.0);
        float comet = line(r - 1.1, 0.012 + 0.06 * tail) * tail * tail * max(max(1.0 - uOpen, uBeat), three * 0.75) * P1;
        // the lance has gone through: a wave going out round the rim, and its middle flares into a four-pointed star
        float out_ = 1.0 - pow(clamp(1.0 - uWave, 0.0, 1.0), 3.0);
        float W = line(r - (1.0 + 0.5 * out_), 0.03 + 0.05 * (1.0 - uWave)) * (1.0 - uWave) * (1.0 - uWave) * step(0.0005, uWave) * P1;
        float star = (exp(-abs(p.y) * 42.0) * exp(-abs(p.x) * 1.7) + exp(-abs(p.x) * 42.0) * exp(-abs(p.y) * 2.6) + exp(-r * 6.0)) * uFlash * P1;
        // glow: round the rim and the inner ring, along the figure, over its whole face (a wash of blue), in its middle
        float G = exp(-abs(r - 0.97) * 9.0) * 0.6 * P1 + (exp(-abs(r - 0.73) * 16.0) * 0.25 + exp(-fig * 16.0) * 0.3 * one) * P2
          + (1.0 - smoothstep(0.1, 0.98, r)) * 0.22 * P1 + exp(-r * 5.0) * 0.35 * P3;
        G *= smoothstep(0.0, 0.25, uOpen) * (1.0 - smoothstep(1.3, 1.6, r)) * (1.0 + 0.5 * uBeat + 0.6 * uFlash);
        // going: it breaks into bits (by angle and by ring), from the middle out
        float bit = hash(floor((a / TAU + 0.5) * 40.0) + floor(r * 14.0) * 41.0);
        float keep = step(uFade * 1.25 - r * 0.25, bit * 0.9 + 0.08);
        float pulse = 0.9 + 0.1 * sin(t * 21.0);
        L = max(L, comet) * keep * pulse;
        G *= (1.0 - uFade) * pulse;
        float A = clamp(L + W, 0.0, 1.0);
        vec3 lineCol = mix(uMain, uCore, clamp(0.45 + 0.3 * smoothstep(0.55, 1.0, L) + 0.5 * uBeat + uFlash + W, 0.0, 1.0));
        vec3 col = lineCol * A + mix(uDeep, uMain, 0.35) * G + uCore * star;
        gl_FragColor = clamp(vec4(col * (0.75 + 0.35 * uShine), A * 0.85 + min(1.0, G) * 0.4 + min(1.0, star) * 0.5), 0.0, 1.0);
      }`,
  });
  const gates = Array.from({ length: 2 }, () => {
    const mats = [gateMat(1, 1), gateMat(2, GATE.spans[0]), gateMat(3, GATE.spans[1])];
    const mesh = put(square, mats[0]);
    // (the middle and the inner layer go with the outer one: ahead of it on its own line, their squares smaller)
    const ahead = GATE.spans.map((span, i) => { const m = new THREE.Mesh(square, mats[i + 1]); m.frustumCulled = false; m.scale.set(span, span, 1); mesh.add(m); return m; });
    return { mesh, mats, ahead, live: false, open: 0, level: 0, beat: 0, fired: -1, fade: 1, age: 0, radius: 0, want: 0, fresh: true, dust: 0, dir: new THREE.Vector3(0, 0, 1),
      shut: 0, toShut: 0, told: false, spin: 0 };       // how far its layers have come together (0..1), how far they should have; whether the combo says; their turning's clock
  });

  // ---- a ring over the ground: going out from the middle, thinning as it goes
  const flat = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const ringMat = () => material({
    uniforms: { ...own(), uT: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain, uDeep;
      uniform float uT, uShine;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float out_ = 1.0 - pow(1.0 - uT, 2.5);
        float R = 0.12 + 0.84 * out_;
        float w = 0.035 + 0.1 * (1.0 - uT);
        float edge = 1.0 - smoothstep(0.0, w, abs(r - R));
        float wash = (1.0 - smoothstep(0.0, R, r)) * 0.22 * (1.0 - uT);      // a little light inside it, at first
        float a = (edge + wash) * (1.0 - uT * uT);
        vec3 col = mix(uMain, uCore, edge * 0.7) + uDeep * wash;
        gl_FragColor = vec4(col * a * (0.75 + 0.4 * uShine), a * 0.5);
      }`,
  });
  const rings = Array.from({ length: 3 }, () => ({ mesh: put(flat, ringMat()), t: 1, life: 0.4 }));

  // ---- sparks: gold, four-pointed; thrown out, slowing, falling a little, going out (all in the shader). And the
  // lance's sparkles (aTint 1): a round bead of light with a soft glow, which hardly falls, and twinkles as it drifts
  const sGeo = new THREE.InstancedBufferGeometry();
  sGeo.index = square.index;
  sGeo.setAttribute('position', square.attributes.position);
  const sAt = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sVel = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sData = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS * 4), 4).setUsage(THREE.DynamicDrawUsage);      // born, life, size, turn
  const sTint = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS), 1).setUsage(THREE.DynamicDrawUsage);         // 0: a gold spark; 1: a sparkle of the lance's; 2: a drop of water
  for (let j = 0; j < SPARKS; j++) sData.setXYZW(j, -1000, 1, 0, 0);                                                      // (none yet)
  sGeo.setAttribute('aAt', sAt); sGeo.setAttribute('aVel', sVel); sGeo.setAttribute('aData', sData); sGeo.setAttribute('aTint', sTint);
  sGeo.instanceCount = SPARKS;
  const sMat = material({
    uniforms: { ...colours, uSea: water.uMain, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aAt, aVel;
      attribute vec4 aData;
      attribute float aTint;
      uniform float uTime;
      varying vec2 vP;
      varying float vU, vTint;
      void main() {
        float age = uTime - aData.x, u = age / aData.y;
        float on = step(0.0, age) * step(u, 1.0);
        float slow = (1.0 - exp(-3.0 * age)) / 3.0;                        // (how far it has come, slowing as it goes)
        float sea = step(0.5, aTint) * step(aTint, 1.5);                  // (1: the lance's sparkle; a drop of water falls as a spark does)
        vec3 p = aAt + aVel * slow - vec3(0.0, 0.7 * age * age * (1.0 - 0.9 * sea), 0.0);
        float twinkle = mix(0.7 + 0.3 * sin(uTime * 26.0 + aData.w * 50.0), 0.55 + 0.45 * sin(uTime * 15.0 + aData.w * 50.0), sea);
        float s = aData.z * on * smoothstep(0.0, 0.12, u) * pow(max(0.0, 1.0 - u), 0.6) * twinkle;
        float c = cos(aData.w), sn = sin(aData.w);
        vP = position.xy; vU = u; vTint = aTint;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        mv.xy += mat2(c, -sn, sn, c) * position.xy * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uGold, uSea, uWater, uWaterCore;
      uniform float uShine;
      varying vec2 vP;
      varying float vU, vTint;
      void main() {
        vec2 q = abs(vP);
        float r = length(vP);
        float star = max(0.0, 1.0 - (q.x * q.y * 30.0 + (q.x + q.y) * 0.95));
        float heart = 1.0 - smoothstep(0.0, 0.2, r);
        float bead = 1.0 - smoothstep(0.14, 0.3, r);
        float halo = pow(max(0.0, 1.0 - r), 2.2) * 0.6 + star * 0.3;
        float sea = step(0.5, vTint) * step(vTint, 1.5), drop = step(1.5, vTint);
        float a = mix(clamp(star + heart, 0.0, 1.0), clamp(bead + halo, 0.0, 1.0), sea);
        vec3 col = mix(mix(uGold, uCore, heart * 0.8), mix(uSea, uCore, bead * 0.85), sea);
        float cover = a * mix(0.55, 0.4, sea);
        // a drop of water (tint 2): a round bead of light with a soft glow round it, not a star
        float wet = 1.0 - smoothstep(0.22, 0.42, r), b = clamp(wet + pow(max(0.0, 1.0 - r), 2.0) * 0.5, 0.0, 1.0);
        col = mix(col, mix(uWater, uWaterCore, wet * 0.7), drop); a = mix(a, b, drop); cover = mix(cover, b * 0.55, drop);
        gl_FragColor = vec4(col * a * (0.8 + 0.4 * uShine), cover);
      }`,
  });
  const sparks = put(sGeo, sMat);
  sparks.visible = true;
  let sNext = 0, time = 0;
  function spark(at, vx, vy, vz, life, size, tint = 0) {
    const j = sNext; sNext = (sNext + 1) % SPARKS;
    sAt.setXYZ(j, at.x, at.y, at.z); sVel.setXYZ(j, vx, vy, vz); sData.setXYZW(j, time, life, size, rand() * 6.283); sTint.setX(j, tint);
    sAt.needsUpdate = sVel.needsUpdate = sData.needsUpdate = sTint.needsUpdate = true;
  }
  // ---- slivers of ice: thin, pointed at both ends, lying along the way they fly; thrown out, slowing, going out
  const hGeo = new THREE.InstancedBufferGeometry();
  hGeo.index = square.index;
  hGeo.setAttribute('position', square.attributes.position);
  const hAt = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const hVel = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const hData = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 4), 4).setUsage(THREE.DynamicDrawUsage);      // born, life, size (half its length, m), how thin (its width of its length)
  for (let j = 0; j < SHARDS; j++) hData.setXYZW(j, -1000, 1, 0, 0);
  hGeo.setAttribute('aAt', hAt); hGeo.setAttribute('aVel', hVel); hGeo.setAttribute('aData', hData);
  hGeo.instanceCount = SHARDS;
  const hMat = material({
    uniforms: { ...water, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aAt, aVel;
      attribute vec4 aData;
      uniform float uTime;
      varying vec2 vP;
      void main() {
        float age = uTime - aData.x, u = age / aData.y;
        float on = step(0.0, age) * step(u, 1.0);
        float slow = (1.0 - exp(-4.0 * age)) / 4.0;
        vec3 p = aAt + aVel * slow;
        float s = aData.z * on * smoothstep(0.0, 0.08, u) * pow(max(0.0, 1.0 - u), 0.5);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        // it lies along the way it flies, as the camera sees that (straight at the camera: level)
        vec2 d = (viewMatrix * vec4(aVel, 0.0)).xy;
        float len = length(d);
        d = len > 1e-4 ? d / len : vec2(1.0, 0.0);
        vP = position.xy;
        mv.xy += (d * position.x + vec2(-d.y, d.x) * position.y * aData.w) * s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCore, uMain;
      uniform float uShine;
      varying vec2 vP;
      void main() {
        float y = abs(vP.y);
        float w = max(0.0, 1.0 - abs(vP.x));                               // pointed at both ends
        float body = 1.0 - smoothstep(w * 0.6, w + 0.02, y);
        float heart = 1.0 - smoothstep(0.0, 0.4, y);
        vec3 col = mix(uMain, uCore, 0.45 + 0.55 * heart);
        gl_FragColor = clamp(vec4(col * body * (0.8 + 0.35 * uShine), body * 0.6), 0.0, 1.0);
      }`,
  });
  const shards = put(hGeo, hMat);
  shards.visible = true;
  let hNext = 0;
  function shard(at, vx, vy, vz, life, size, thin) {
    const j = hNext; hNext = (hNext + 1) % SHARDS;
    hAt.setXYZ(j, at.x, at.y, at.z); hVel.setXYZ(j, vx, vy, vz); hData.setXYZW(j, time, life, size, thin);
    hAt.needsUpdate = hVel.needsUpdate = hData.needsUpdate = true;
  }
  // n sparks thrown out from a place, every way (up a little more than down); sea: the lance's sparkles; wet: drops of
  // water, which hang longer
  function scatter(at, n, speed, size, sea = false, wet = false) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.283, z = rand() * 1.6 - 0.6, r = Math.sqrt(Math.max(0, 1 - Math.min(1, z * z))), v = speed * (0.55 + 0.6 * rand());
      if (wet) spark(at, Math.cos(a) * r * v, z * v + 0.4, Math.sin(a) * r * v, 0.55 + 0.5 * rand(), size * (0.35 + 0.9 * rand() * rand()), 2);
      else spark(at, Math.cos(a) * r * v, z * v + 0.6, Math.sin(a) * r * v, (sea ? 0.5 : 0.35) + 0.3 * rand(), size * (0.7 + 0.6 * rand()), sea ? 1 : 0);
    }
  }

  const casts = WATER_CASTS.map(def => {
    const c = { ...tiles(def.asset), def, direction: new THREE.Vector3() };
    c.frames = def.frames ? c.sheet.frames.slice(def.frames[0], def.frames[1] + 1) : c.sheet.frames;
    return c;
  });
  // the blade: along a wave (a piece of a round wall bowed forward, a little narrower toward its ends), and round a
  // ring lying on the ground
  const bladeGeo = (() => {
    const N = 28, A = 1.05, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N * 2 - 1, th = u * A, h = Math.pow(Math.cos(u * Math.PI / 2), 0.3);
      for (const v of [1, -1]) { pos.push(Math.sin(th) / Math.sin(A), v * h, (Math.cos(th) - 1) / Math.sin(A)); uv.push(i / N, v > 0 ? 0 : 1); }
    }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  })();
  // ... and the same arc lying in its own plane, the strip's width along the way it bows (its crest ahead): seen from
  // the side, the wall above is a line, and this is the crescent; seen from behind it is the other way about. A wave
  // is both, crossed
  const flatGeo = (() => {
    const N = 28, A = 1.05, W = 0.25, pos = [], uv = [], idx = [];       // (W: half its width, of half its length)
    for (let i = 0; i <= N; i++) {
      const u = i / N * 2 - 1, th = u * A, h = Math.pow(Math.cos(u * Math.PI / 2), 0.3) * W;
      const cx = Math.sin(th) / Math.sin(A), cz = (Math.cos(th) - 1) / Math.sin(A);
      for (const v of [1, -1]) { pos.push(cx + Math.sin(th) * v * h, 0, cz + Math.cos(th) * v * h); uv.push(i / N, v > 0 ? 0 : 1); }
    }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  })();
  const roundGeo = (() => {
    const N = 64, pos = [], uv = [], idx = [], { round, inner, rise } = WATER_BLADE.ring;
    for (let i = 0; i <= N; i++) {
      const th = i / N * Math.PI * 2;
      for (const r of [1, inner]) { pos.push(Math.cos(th) * r, r === 1 ? rise : 0, Math.sin(th) * r); uv.push(i / N * round, r === 1 ? 0 : 1); }
    }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  })();
  const blades = Array.from({ length: 4 }, () => {
    const w = { ...laid('blade', bladeGeo), live: false, k: 1, kind: null };
    const flat = new THREE.Mesh(flatGeo, w.mesh.material);                // (the same picture, the same frame)
    flat.frustumCulled = false;
    w.mesh.add(flat);
    return w;
  });
  const rounds = Array.from({ length: 3 }, () => ({ ...laid('blade', roundGeo), t: 1, life: 0.4, radius: 1 }));
  // what the casts throw, and where it lands: a few of each at once
  const bolts = Array.from({ length: 6 }, () => ({ ...tiles('bolt'), live: false, k: 1, turn: 0, dir: new THREE.Vector3(0, 0, 1) }));
  const splashes = Array.from({ length: 6 }, () => ({ ...tiles('hit'), life: 0.4 }));
  for (const h of splashes) h.uniforms.uNear.value = WATER_HIT.near;

  const tmp = new THREE.Vector3(), side = new THREE.Vector3(), tan = new THREE.Vector3(), toCam = new THREE.Vector3();
  // how far before the camera a place is (m; far, with no camera yet), and how much of a thing is drawn there (NEAR)
  const ahead = at => (eye ? -toCam.copy(at).applyMatrix4(eye.matrixWorldInverse).z : 1e3);
  const nearK = at => clamp((ahead(at) - NEAR.none) / (NEAR.whole - NEAR.none), 0, 1);
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), basis = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);

  // two ways across `way` (unit), into X and Y: level, and up
  function across(way) {
    X.crossVectors(UP, way);
    if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
    X.normalize(); Y.crossVectors(way, X);
  }
  // a hoop of water begins: round the line through `at` along `way`, so wide at its widest, lasting so long
  function hoop(at, way, radius, life, feather) {
    const h = hoops.find(o => o.t >= 1) || hoops.reduce((m, o) => (o.t > m.t ? o : m));
    Z.copy(way).normalize(); across(Z);
    basis.makeBasis(X, Y, Z);
    h.mesh.quaternion.setFromRotationMatrix(basis);
    h.mesh.rotateZ(rand() * 6.283);
    h.radius = radius * (feather ? WATER_BLADE.hoop.let : 1);            // (feather: the one at the circle as the lance is let go)
    h.mesh.position.copy(at); h.mesh.scale.setScalar(h.radius * 0.42); h.mesh.visible = true;
    h.t = 0; h.age = 0; h.life = life;
    h.uniforms.uK.value = 1;
    still(h, 0);
  }
  // what a lance sheds `at` m along its way: a sparkle, from beside it, drifting out and on a little
  function shed(l, at) {
    const a = rand() * 6.283, c = Math.cos(a), sn = Math.sin(a), out = 0.1 + 0.4 * rand();
    side.copy(l.X).multiplyScalar(c).addScaledVector(l.Y, sn);
    tmp.copy(l.from).addScaledVector(l.dir, at).addScaledVector(side, out);
    const v = 0.5 + 1.4 * rand(), f = 1 + 2.5 * rand(), d = l.dir;
    spark(tmp, side.x * v + d.x * f, side.y * v + d.y * f + 0.3, side.z * v + d.z * f, 0.7 + 0.6 * rand(), 0.06 + 0.07 * rand(), 1);
  }
  // a lance's way since it was let go: the beam left standing from the circle on, and the wake wound round it
  function leaves(l, dt, camera) {
    const thrown = l.far > 0;
    if (thrown) { l.flown += dt; if (l.live) l.pace = Math.max(1, l.far / Math.max(l.flown, 1e-3)); else l.gone += dt; }
    // the beam: thin at the circle, thick further on, thinner as it goes out
    const bm = LAUNCH.beam, left = thrown ? 1 - l.flown / bm.life : 0;
    l.beam.mesh.visible = left > 0;
    if (left > 0) {
      const N = bm.places, pos = l.beam.mesh.geometry.attributes.position, long = Math.min(l.far, bm.long), W = bm.wide * (0.8 + 0.12 * l.level) * Math.pow(left, 0.6);
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        tan.copy(l.from).addScaledVector(l.dir, u * long);
        toCam.subVectors(camera.position, tan);
        side.crossVectors(l.dir, toCam).normalize();
        const w = W * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.5)), 0.7);
        pos.setXYZ(i * 2, tan.x - side.x * w, tan.y - side.y * w, tan.z - side.z * w);
        pos.setXYZ(i * 2 + 1, tan.x + side.x * w, tan.y + side.y * w, tan.z + side.z * w);
      }
      pos.needsUpdate = true;
      const u = l.beam.mesh.material.uniforms;
      u.uK.value = Math.min(1, left * 2.2); u.uAge.value = time;
    }
    // the wake: each ribbon's strip laid along its helix, from the circle to the lance's point (the first `long` m of
    // its way). A place the lance passed some while ago is so far gone: thinner, further out, wavering. All of it is
    // gone `life` s after the lance is over (or has left the last of it behind)
    if (l.wakeOn && l.flown - Math.min(l.far, WAKE.long) / l.pace >= WAKE.life) l.wakeOn = false;
    if (!thrown || !l.wakeOn) { for (const w of l.wake) w.mesh.visible = false; return; }
    const N = WAKE.places, long = Math.min(l.far, WAKE.long), big = 1 + 0.12 * l.level, within = l.far <= WAKE.long + WAKE.near;
    for (const w of l.wake) {
      const d = w.d, pos = w.mesh.geometry.attributes.position, uv = w.mesh.geometry.attributes.uv, tone = w.mesh.geometry.attributes.aTone, al = w.mesh.geometry.attributes.aAlong;
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1) * long, back = l.far - s, gone = clamp((l.flown - s / l.pace) / WAKE.life, 0, 1);
        const close = within ? 0.4 + 0.6 * Math.min(1, back / WAKE.near) : 1;      // it closes in on the lance behind its point
        const r = WAKE.r * d.r * big * close * (1 + WAKE.swell * gone + 0.14 * gone * Math.sin(s * 2.1 + l.flown * 9 + d.phase));
        const th = d.phase + s * 6.2832 / WAKE.pitch - l.flown * WAKE.spin, c = Math.cos(th), sn = Math.sin(th), j = i * 3;
        wakeR[j] = l.X.x * c + l.Y.x * sn; wakeR[j + 1] = l.X.y * c + l.Y.y * sn; wakeR[j + 2] = l.X.z * c + l.Y.z * sn;
        wakeAt[j] = l.from.x + l.dir.x * s + wakeR[j] * r;
        wakeAt[j + 1] = l.from.y + l.dir.y * s + wakeR[j + 1] * r;
        wakeAt[j + 2] = l.from.z + l.dir.z * s + wakeR[j + 2] * r;
      }
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1) * long, back = l.far - s, gone = clamp((l.flown - s / l.pace) / WAKE.life, 0, 1);
        const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(N - 1, i + 1) * 3, j = i * 3;
        tan.set(wakeAt[i0] - wakeAt[i1], wakeAt[i0 + 1] - wakeAt[i1 + 1], wakeAt[i0 + 2] - wakeAt[i1 + 2]);
        toCam.set(camera.position.x - wakeAt[j], camera.position.y - wakeAt[j + 1], camera.position.z - wakeAt[j + 2]);
        side.crossVectors(tan, toCam);
        const len = side.length(), far = toCam.length() || 1;
        // a ribbon seen flat on is broad, seen edge on narrow: as it winds round, as the camera sees it (from behind
        // the lance, looking along its way, all of it is broad)
        const facing = (wakeR[j] * toCam.x + wakeR[j + 1] * toCam.y + wakeR[j + 2] * toCam.z) / far;
        const along = Math.abs(l.dir.x * toCam.x + l.dir.y * toCam.y + l.dir.z * toCam.z) / far;
        const turn = 0.3 + 0.7 * Math.max(Math.abs(facing), along);
        // it thins away: out of the circle, to the lance's point, at the far end of what there is of it, and as it goes
        const ends = Math.min(1, s / 0.5) * (within ? Math.min(1, back / 0.7) : 1) * clamp((WAKE.long - s) / (0.3 * WAKE.long), 0, 1);
        const wide = len > 1e-6 ? WAKE.wide * WATER_BLADE.wake.wide * d.wide * big * turn * ends * (1 - 0.75 * gone) / len : 0;
        pos.setXYZ(i * 2, wakeAt[j] - side.x * wide, wakeAt[j + 1] - side.y * wide, wakeAt[j + 2] - side.z * wide);
        pos.setXYZ(i * 2 + 1, wakeAt[j] + side.x * wide, wakeAt[j + 1] + side.y * wide, wakeAt[j + 2] + side.z * wide);
        uv.setX(i * 2, gone); uv.setX(i * 2 + 1, gone);
        tone.setX(i * 2, facing); tone.setX(i * 2 + 1, facing);
        const a = s / (WATER_BLADE.wake.every * (0.6 + 0.4 * d.wide)) + d.phase;      // (a thin ribbon's blades are shorter; each ribbon's begin elsewhere)
        al.setX(i * 2, a); al.setX(i * 2 + 1, a);
      }
      pos.needsUpdate = true; uv.needsUpdate = true; tone.needsUpdate = true; al.needsUpdate = true;
      w.mesh.visible = true;
      w.uniforms.uK.value = Math.min(1, l.far / 1.0);
      still(w, Math.floor(l.flown * WATER_BLADE.fps + d.phase) % w.sheet.frames.length);
    }
  }

  // the frame of a cast that is shown now: one whole frame at the game's own pace; slowed, the end of each is mixed into
  // the next (dt: s since the last picture). The square is made only as big as the water in what is shown
  function show(cast, dt) {
    const fr = cast.frames, n = fr.length, u = cast.uniforms;
    // (quick: 1 - (1 - u)^q, by q times as fast as it begins, slower as it ends)
    const q = cast.def.quick || 1, u0 = clamp(cast.age / cast.def.duration, 0, 1);
    const at = (n - 1) * (q === 1 ? u0 : 1 - Math.pow(1 - u0, q));
    const step = dt * (n - 1) / cast.def.duration * (q === 1 ? 1 : q * Math.pow(1 - u0, q - 1));      // frames a picture of the game moves on by
    const over = dt > 0 ? CAST_MIX.most * clamp(1 - step / CAST_MIX.whole, 0, 1) : 0;
    let a = Math.round(at), b = a, mix = 0;
    if (over > 0.01) {
      a = Math.floor(at); b = Math.min(n - 1, a + 1);
      const k = clamp((at - a - (1 - over)) / over, 0, 1);
      mix = k * k * (3 - 2 * k);
      if (mix <= 0) b = a;
    }
    const A = fr[a], B = fr[b];
    u.uMapA.value.set(A[0], A[1]); u.uMapB.value.set(B[0], B[1]); u.uMix.value = mix;
    const none = A[4] <= A[2], noneB = B[4] <= B[2];                       // (a frame with no water in it at all)
    if (b === a || noneB) u.uBox.value.set(A[2], A[3], A[4], A[5]);
    else if (none) u.uBox.value.set(B[2], B[3], B[4], B[5]);
    else u.uBox.value.set(Math.min(A[2], B[2]), Math.min(A[3], B[3]), Math.max(A[4], B[4]), Math.max(A[5], B[5]));
  }

  const fx = {
    object,
    glow(key, at, size) {
      if (look === 'water') return;                                       // (her water casts: the clip's own, nothing of this)
      let g = glows.get(key);
      if (!g) { g = { mesh: put(square, orbMat()), seen: false, k: 0, size: 0 }; glows.set(key, g); }
      g.mesh.position.copy(at); g.seen = true; g.size = size;
      if (g.look !== look) { g.look = look; paint(g.mesh.material, look); }
    },
    trail(key, at) {
      if (look === 'water') return;
      let r = ribbons.find(o => o.used && o.key === key);
      if (!r) { r = takeRibbon(0.07, 0.16, key); paint(r.mesh.material, look); }
      r.seen = true;
      feed(r, at);
    },
    shot(kind) {
      const def = SHOTS[kind] || SHOTS.orb;
      if (def.long) {
        const l = lances.find(o => !o.mesh.visible && !o.wakeOn) || lances.find(o => !o.mesh.visible) || lances[0];
        l.live = true; l.k = 1; l.level = 0; l.grown = 0; l.hot = 0; l.long = def.long[0]; l.mesh.visible = true;
        if (l.ribbon) l.ribbon.used = false;
        l.ribbon = null;
        l.far = 0; l.flown = 0; l.gone = 0; l.wakeOn = false; l.beam.mesh.visible = false;
        return {
          look: 'sky',
          get long() { return l.long; },
          size(level) { l.level = Math.max(0, Math.min(3, level)); },
          place(at, dir, far = 0) {
            l.head.copy(at); l.dir.copy(dir).normalize();
            if (far <= 0) return;
            // in flight: a streak behind it; its wake; sparkles shed from beside it as it goes, a thin hoop now and then
            if (!l.ribbon) l.ribbon = takeRibbon(0.1 + 0.03 * l.level, FLIGHT.streak, null, water);
            feed(l.ribbon, at);
            if (l.far <= 0) {
              l.from.copy(at).addScaledVector(l.dir, -far);
              across(l.dir); l.X.copy(X); l.Y.copy(Y);
              l.wakeOn = true; l.sparkAt = 0.3; l.hoopAt = LAUNCH.hoops.every; l.hoopN = LAUNCH.hoops.most;
            }
            l.far = far;
            while (far >= l.sparkAt) { shed(l, l.sparkAt); l.sparkAt += SHED.sparkle * (1 + rand()); }
            if (l.hoopN > 0 && far >= l.hoopAt) {
              hoop(tmp.copy(l.from).addScaledVector(l.dir, l.hoopAt), l.dir, LAUNCH.hoops.r * (1 + 0.1 * l.level), LAUNCH.hoops.life, false);
              l.hoopAt += LAUNCH.hoops.every; l.hoopN--;
            }
          },
          end() { l.live = false; if (l.ribbon) l.ribbon.used = false; },
        };
      }
      if (look === 'water') {
        // her water casts: the clip's bolt for what is thrown (the finisher's bigger); a wave (the turn's, the rising
        // cast's) is the blade, a band of the clip's water laid along it
        if (def.wide) {
          const d = def === SHOTS.rise ? WATER_BLADE.rise : WATER_BLADE.wave;
          const w = blades.find(o => !o.mesh.visible) || blades.reduce((m, o) => (o.age > m.age ? o : m));
          w.live = true; w.k = 1; w.age = 0; w.kind = d; w.mesh.visible = true;
          w.uniforms.uK.value = 0;
          still(w, 0);
          return {
            look,
            place(at, dir, far = 0) {
              // (as the sky-blue wave: ahead the way it goes, across level and leaning as her cut did, widening a little)
              Z.copy(dir).normalize();
              X.crossVectors(UP, Z).normalize();
              Y.crossVectors(Z, X);
              const c = Math.cos(d.lean), sn = Math.sin(d.lean);
              tmp.copy(X).multiplyScalar(c).addScaledVector(Y, sn);
              side.copy(Y).multiplyScalar(c).addScaledVector(X, -sn);
              basis.makeBasis(tmp, side, Z);
              w.mesh.quaternion.setFromRotationMatrix(basis);
              w.mesh.position.copy(at);
              const grow = 0.55 + 0.45 * Math.min(1, far / 1.2) + 0.03 * far;
              w.mesh.scale.set(d.wide * grow, d.tall * (0.8 + 0.2 * grow), d.wide * grow);
            },
            end() { w.live = false; },
          };
        }
        const b = bolts.find(o => !o.live && !o.mesh.visible) || bolts.reduce((m, o) => (o.age > m.age ? o : m));
        b.live = true; b.age = 0; b.k = 1; b.mesh.visible = false; b.turned = false; b.far = 0; b.big = def === SHOTS.big;
        b.uniforms.uScale.value = b.big ? WATER_BOLT.big : WATER_BOLT.long;
        b.uniforms.uK.value = 0;
        still(b, 0);
        return {
          look,
          place(at, dir, far = 0) { b.mesh.position.copy(at); b.dir.copy(dir); b.far = far; b.mesh.visible = true; },
          end(hit) { b.live = false; if (hit) b.mesh.visible = false; },
        };
      }
      if (def.wide) {
        const w = waves.find(o => !o.mesh.visible) || waves[0];
        w.live = true; w.k = 1; w.kind = def; w.age = 0; w.mesh.visible = true;
        paint(w.mesh.material, look);
        return {
          look,
          place(at, dir, far = 0) {
            // ahead: the way it goes; across: level, leaning as her cut did; it widens a little as it flies
            Z.copy(dir).normalize();
            X.crossVectors(UP, Z).normalize();
            Y.crossVectors(Z, X);
            const c = Math.cos(def.lean), s = Math.sin(def.lean);
            tmp.copy(X).multiplyScalar(c).addScaledVector(Y, s);
            side.copy(Y).multiplyScalar(c).addScaledVector(X, -s);
            basis.makeBasis(tmp, side, Z);
            w.mesh.quaternion.setFromRotationMatrix(basis);
            w.mesh.position.copy(at);
            const grow = 0.55 + 0.45 * Math.min(1, far / 1.2) + 0.03 * far;
            w.mesh.scale.set(def.wide * grow, def.tall * (0.8 + 0.2 * grow), def.wide * grow);
          },
          end(hit) { w.live = false; if (hit) w.k = Math.min(w.k, 0.5); },
        };
      }
      const o = orbs.find(v => !v.mesh.visible) || orbs[0];
      o.live = true; o.k = 1; o.kind = def; o.shed = def.shed * 0.5; o.mesh.visible = true;
      o.mesh.material.uniforms.uSize.value = def.size;
      o.ribbon = takeRibbon(def.ribbon, 0.13);
      paint(o.mesh.material, look); paint(o.ribbon.mesh.material, look);
      let last = -1;
      const wet = look === 'water';
      return {
        look,
        place(at, dir, far = 0) {
          o.mesh.position.copy(at);
          feed(o.ribbon, at);
          if (last >= 0) {
            o.shed -= far - last;
            if (o.shed <= 0) { o.shed = def.shed * (wet ? 0.45 : 1); spark(at, (rand() - 0.5) * 1.6, 0.4 + rand() * 0.8, (rand() - 0.5) * 1.6, 0.4 + 0.2 * rand(), def.size * (wet ? 0.2 : 0.3), wet ? 2 : 0); }
          }
          last = far;
        },
        end(hit) { o.live = false; o.ribbon.used = false; if (hit) { o.k = 0; o.mesh.visible = false; } },
      };
    },
    burst(at, size = 0.7, sea = false, lk = look) {
      if (lk === 'water' || sea) {
        // her water casts, and the lance's (its ring of light was the last of the rings not of the clip's water): the
        // clip's splash, turned and mirrored a little differently each time; the lance's with its own sparkles
        if (ahead(at) < NEAR.none) return;                                 // (right before the camera: nothing)
        if (sea) scatter(at, Math.round(5 + 5 * Math.min(2, size)), 2.2 + 1.6 * size, 0.07 + 0.05 * Math.min(2, size), true);
        const h = splashes.find(o => !o.mesh.visible) || splashes.reduce((m, o) => (o.age > m.age ? o : m));
        const reach = Math.min(size * WATER_HIT.reach, WATER_HIT.most), turn = (rand() - 0.5) * 1.2;
        h.age = 0; h.life = WATER_HIT.life + WATER_HIT.more * reach;
        h.mesh.position.copy(at); h.mesh.visible = true;
        h.uniforms.uScale.value = reach; h.uniforms.uMirror.value = rand() < 0.5 ? -1 : 1; h.uniforms.uK.value = 1;
        h.uniforms.uSpin.value.set(Math.cos(turn), Math.sin(turn));
        still(h, 0);
        return;
      }
      const b = bursts.find(o => o.t >= 1) || bursts.reduce((m, o) => (o.t > m.t ? o : m));
      b.t = 0; b.life = 0.24 + 0.1 * Math.min(1.5, size);
      b.mesh.position.copy(at); b.mesh.visible = true;
      b.mesh.material.uniforms.uSize.value = size;
      scatter(at, Math.round(5 + 5 * Math.min(2, size)), 2.2 + 1.6 * size, 0.07 + 0.05 * Math.min(2, size), sea);
    },
    ring(at, radius = 2, lk = look) {
      if (lk === 'water') {
        const d = WATER_BLADE.ring, r = rounds.find(o => o.t >= 1) || rounds.reduce((m, o) => (o.t > m.t ? o : m));
        r.t = 0; r.age = 0; r.radius = radius; r.life = d.life + d.more * radius;
        r.mesh.position.copy(at); r.mesh.rotation.y = rand() * 6.283; r.mesh.scale.setScalar(radius * d.from); r.mesh.visible = true;
        still(r, 0);
        scatter(at, 10, 3.4, 0.09, false, true);
        return;
      }
      const r = rings.find(o => o.t >= 1) || rings[0];
      paint(r.mesh.material, lk);
      r.t = 0; r.life = 0.32 + 0.05 * radius;
      r.mesh.position.copy(at); r.mesh.scale.setScalar(radius); r.mesh.visible = true;
      scatter(at, 8, 3.2, 0.09, false, lk === 'water');
    },
    look(name) { look = name in LOOKS ? name : 'sky'; },
    get current() { return look; },
    cast(n, { hand, dir, feet, size = 1 }) {
      const cast = casts[n];
      if (!cast) return;
      const { def, mesh, uniforms } = cast;
      const fromHand = n === 0 || n === 3;
      cast.age = 0;
      cast.direction.copy(dir);
      // (one put where she stands goes with her: she steps on as she casts, the third cast most, and from the side she
      // was seen walking out of her own rings. feet: where she is, kept, not a copy)
      cast.feet = fromHand ? null : feet; cast.lift = def.elevation * size; cast.far = def.reach * size;
      mesh.position.copy(fromHand ? hand : feet).addScaledVector(dir, def.reach * size);
      mesh.position.y += def.elevation * size;
      cast.size = size * (def.scale || 1);
      uniforms.uScale.value = cast.size * (1 - (def.swell || 0));
      uniforms.uWrap.value = def.wrap * size;
      uniforms.uFlat.value = def.flat || 1;
      uniforms.uSpin.value.set(Math.cos(def.turn || 0), Math.sin(def.turn || 0));
      uniforms.uMirror.value = 1;
      uniforms.uK.value = 1;
      show(cast, 0);
      mesh.visible = true;
    },
    gate() {
      const g = gates.find(o => !o.mesh.visible) || gates[0];
      g.live = true; g.open = 0; g.level = 0; g.beat = 0; g.fired = -1; g.fade = 0; g.age = rand() * 10; g.fresh = true; g.dust = 0;
      g.shut = 0; g.toShut = 0; g.told = false; g.spin = g.age;
      return {
        place(at, dir, radius) {
          g.mesh.position.copy(at);
          g.dir.copy(dir).normalize();
          across(g.dir);
          basis.makeBasis(X, Y, g.dir);
          g.mesh.quaternion.setFromRotationMatrix(basis);
          g.want = radius;
          if (g.fresh) { g.fresh = false; g.radius = radius; g.mesh.scale.setScalar(1e-4); g.mesh.visible = true; }
        },
        size(level) {
          const to = Math.max(0, Math.min(3, level));
          if (to > g.level) g.beat = 1;
          g.level = to;
          if (!g.told) g.toShut = to / 3;                                 // (nobody says how far along it is: by how grown)
        },
        // how far its three layers have come together (0: as far apart as they begin; 1: one circle)
        close(k) { g.told = true; g.toShut = clamp(k, 0, 1); },
        fire() {
          if (g.fired >= 0 || !g.mesh.visible) return;
          g.fired = 0; g.live = false;
          // let go with the lance, the bigger the more it has grown: a hoop of water round its line a little way on,
          // spray off its rim; slivers of ice thrown out round the circle's rim; sparkles thrown out of it and on
          const big = 0.7 + 0.1 * g.level, R = g.radius, d = g.dir, at = g.mesh.position;
          hoop(tmp.copy(at).addScaledVector(d, LAUNCH.hoop.ahead * big), d, LAUNCH.hoop.r * big, LAUNCH.hoop.life, true);
          hoop(at, d, R * WATER_BLADE.hoop.gate, GATE.fire * 0.85, false);      // (the wave that goes out round the circle itself)
          across(d);
          const nh = Math.round(LAUNCH.shards * big), ns = Math.round(LAUNCH.sparkles * big);
          for (let i = 0; i < nh + ns; i++) {
            const a = rand() * 6.283, c = Math.cos(a), sn = Math.sin(a);
            side.copy(X).multiplyScalar(c).addScaledVector(Y, sn);
            if (i < nh) {
              const v = 5 + 6 * rand(), f = 0.5 + 2 * rand();
              tmp.copy(at).addScaledVector(side, R * (0.95 + 0.3 * rand()));
              shard(tmp, side.x * v + d.x * f, side.y * v + d.y * f, side.z * v + d.z * f, 0.28 + 0.2 * rand(), (0.1 + 0.12 * rand()) * big, 0.1 + 0.08 * rand());
            } else {
              const v = 1.2 + 3 * rand(), f = 1 + 5 * rand();
              tmp.copy(at).addScaledVector(side, R * (0.3 + 1.0 * rand())).addScaledVector(d, rand() * 0.6);
              spark(tmp, side.x * v + d.x * f, side.y * v + d.y * f + 0.4, side.z * v + d.z * f, 0.6 + 0.6 * rand(), 0.06 + 0.07 * rand(), 1);
            }
          }
        },
        end() { g.live = false; },
      };
    },
    motes(at, n = 1, from = 0.6, sea = false) {
      for (let i = 0; i < n; i++) {
        const a = rand() * 6.283, z = rand() * 1.4 - 0.4, r = Math.sqrt(Math.max(0, 1 - Math.min(1, z * z)));
        tmp.set(at.x + Math.cos(a) * r * from, at.y + z * from, at.z + Math.sin(a) * r * from);
        // (a spark slows to a third of its first pace's reach: sent three times as fast as the way is long, it ends at `at`)
        spark(tmp, (at.x - tmp.x) * 3, (at.y - tmp.y) * 3 + 0.5, (at.z - tmp.z) * 3, 0.42, 0.06 + 0.03 * rand(), sea ? 1 : 0);
      }
    },
    setNight(on) { colours.uShine.value = on ? 1.35 : 0.8; },
    update(dt, camera) {
      time += dt;
      eye = camera;
      if (!fetching && waiting.length) fetchNext();                       // (the water's pictures: should their fetching not have begun)
      sMat.uniforms.uTime.value = time; hMat.uniforms.uTime.value = time;
      const beat = 0.5 + 0.5 * Math.sin(time * 34);
      // orbs: one that ran out goes out quickly
      for (const o of orbs) {
        if (!o.mesh.visible) continue;
        if (!o.live) { o.k -= dt / 0.1; if (o.k <= 0) { o.mesh.visible = false; continue; } }
        const u = o.mesh.material.uniforms;
        u.uK.value = Math.max(0, o.k); u.uBeat.value = beat;
        u.uSize.value = o.kind.size * (0.94 + 0.06 * beat) * (o.live ? 1 : 0.6 + 0.4 * o.k);
      }
      // the light at her hand: there while it is asked for
      for (const g of glows.values()) {
        g.k = clamp(g.k + (g.seen ? dt / 0.05 : -dt / 0.07), 0, 1);
        g.seen = false;
        g.mesh.visible = g.k > 0;
        if (!g.mesh.visible) continue;
        const u = g.mesh.material.uniforms;
        u.uK.value = g.k; u.uBeat.value = beat; u.uSize.value = g.size * (0.9 + 0.1 * beat);
      }
      // waves
      for (const w of waves) {
        if (!w.mesh.visible) continue;
        w.age += dt;
        if (!w.live) { w.k -= dt / 0.12; if (w.k <= 0) { w.mesh.visible = false; continue; } }
        const u = w.mesh.material.uniforms;
        u.uK.value = Math.max(0, w.k) * Math.min(1, w.age / 0.04); u.uAge.value = w.age;
      }
      // bursts
      for (const b of bursts) {
        if (b.t >= 1) continue;
        b.t = Math.min(1, b.t + dt / b.life);
        b.mesh.visible = b.t < 1;
        b.mesh.material.uniforms.uT.value = b.t;
      }
      for (const cast of casts) {
        if (!cast.mesh.visible) continue;
        cast.age += dt;
        cast.mesh.visible = cast.age < cast.def.duration;
        show(cast, dt);
        const def = cast.def;
        if (cast.feet) { cast.mesh.position.copy(cast.feet).addScaledVector(cast.direction, cast.far); cast.mesh.position.y += cast.lift; }
        if (def.fade) { const k = clamp((cast.age / def.duration - (1 - def.fade)) / def.fade, 0, 1); cast.uniforms.uK.value = 1 - k * k * (3 - 2 * k); }
        if (def.swell) cast.uniforms.uScale.value = cast.size * (1 - def.swell * Math.exp(-cast.age / SWELL.quick) + SWELL.on * cast.age / def.duration);
        if (def.flat) {
          // turned to the way she casts, as the camera sees it from above (ahead of the camera: up the picture, as
          // the clip was filmed; see WATER_CASTS)
          const e = camera.matrixWorld.elements, d = cast.direction;
          let fx = -e[8], fz = -e[10], ax, ay;
          if (fx * fx + fz * fz < 1e-4) { fx = e[4]; fz = e[6]; }          // (looking straight down: its top is ahead)
          if (d.x * d.x + d.z * d.z > 0.36 * d.lengthSq()) { ax = d.z * fx - d.x * fz; ay = d.x * fx + d.z * fz; cast.uniforms.uFlat.value = def.flat; }
          else { tmp.copy(d).transformDirection(camera.matrixWorldInverse); ax = tmp.x; ay = tmp.y; cast.uniforms.uFlat.value = 1; }      // (steeply down or up: as it goes on the screen)
          if (Math.hypot(ax, ay) > 1e-4) {
            const turn = Math.atan2(-ax, ay) + (def.turn || 0);
            cast.uniforms.uSpin.value.set(Math.cos(turn), Math.sin(turn));
          }
        } else {
          // (the rings, the finisher, the rising cast: as they are, mirrored when the camera is on the far side of her)
          toCam.subVectors(camera.position, cast.mesh.position);
          cast.uniforms.uMirror.value = toCam.dot(cast.direction) > 0 ? -1 : 1;
        }
      }
      // the water casts' bolts: turned the way they go on the screen; out of her hand at once, drawn out along their
      // way as they leave; run out, gone in a moment
      for (const b of bolts) {
        if (!b.mesh.visible) { if (!b.live) b.age += dt; continue; }
        b.age += dt;
        if (!b.live) { b.k -= dt / WATER_BOLT.gone; if (b.k <= 0) { b.mesh.visible = false; continue; } }
        // (where it is on the screen and where it will be: going away it goes to where the far ground meets the sky,
        // not straight up; going nearly straight at the camera or away from it, the way it went before)
        tmp.copy(b.mesh.position).applyMatrix4(camera.matrixWorldInverse);
        side.copy(b.mesh.position).addScaledVector(b.dir, 0.5).applyMatrix4(camera.matrixWorldInverse);
        if (tmp.z < -0.1 && side.z < -0.1) {
          const dx = side.x / -side.z - tmp.x / -tmp.z, dy = side.y / -side.z - tmp.y / -tmp.z;
          if (Math.hypot(dx, dy) > 0.004) { b.turn = Math.atan2(dy, dx) - BOLT_WAY; b.turned = true; }
        }
        if (!b.turned) {
          tmp.copy(b.dir).transformDirection(camera.matrixWorldInverse);
          b.turn = Math.atan2(tmp.y, tmp.x || -1e-6) - BOLT_WAY;
        }
        b.uniforms.uSpin.value.set(Math.cos(b.turn), Math.sin(b.turn));
        // (how much of its length is seen: all of it going across the view, `end` of it going along the view)
        toCam.subVectors(camera.position, b.mesh.position).normalize();
        const along = Math.abs(toCam.dot(b.dir)), seen = Math.max(WATER_BOLT.end, Math.sqrt(Math.max(0, 1 - along * along)));
        // (drawn out no further back than it has come: its tail does not reach behind the hand that threw it; the
        // finisher's, big and slow, hardly at all)
        const pull = Math.min(WATER_BOLT.pull * (b.big ? WATER_BOLT.less : 1) * Math.exp(-b.age / WATER_BOLT.ease), b.far / (WATER_BOLT.tail * b.uniforms.uScale.value));
        b.uniforms.uPull.value.set(Math.cos(b.turn + BOLT_WAY), Math.sin(b.turn + BOLT_WAY), seen * (1 + pull) - 1);
        b.uniforms.uK.value = Math.max(0, b.k) * Math.min(1, b.age / WATER_BOLT.born) * nearK(b.mesh.position);
        still(b, Math.floor(b.age * WATER_BOLT.fps) % b.sheet.frames.length);
      }
      // ... and their splashes: once through, going at the end
      for (const h of splashes) {
        if (!h.mesh.visible) { h.age += dt; continue; }
        h.age += dt;
        const u = h.age / h.life, n = h.sheet.frames.length;
        if (u >= 1) { h.mesh.visible = false; continue; }
        const k = clamp((u - (1 - WATER_HIT.fade)) / WATER_HIT.fade, 0, 1);
        h.uniforms.uK.value = (1 - k * k * (3 - 2 * k)) * nearK(h.mesh.position);
        still(h, Math.min(n - 1, Math.floor(u * n)));
      }
      // the blades along the waves: there in a moment, gone in a moment; their frames round and round
      for (const w of blades) {
        if (!w.mesh.visible) { w.age += dt; continue; }
        w.age += dt;
        if (!w.live) { w.k -= dt / WATER_BLADE.gone; if (w.k <= 0) { w.mesh.visible = false; continue; } }
        w.uniforms.uK.value = Math.max(0, w.k) * Math.min(1, w.age / WATER_BLADE.born);
        still(w, Math.floor(w.age * WATER_BLADE.fps) % w.sheet.frames.length);
      }
      // ... and round the rings over the ground: out fast at first, turning, thinning away
      for (const r of rounds) {
        if (r.t >= 1) continue;
        r.t = Math.min(1, r.t + dt / r.life); r.age += dt;
        r.mesh.visible = r.t < 1;
        const d = WATER_BLADE.ring, out_ = 1 - Math.pow(1 - r.t, 2.5);
        r.mesh.scale.setScalar(r.radius * (d.from + (1 - d.from) * out_));
        r.mesh.rotation.y += d.spin * dt;
        r.uniforms.uK.value = 1 - r.t * r.t;
        still(r, Math.floor(r.age * WATER_BLADE.fps) % r.sheet.frames.length);
      }
      // rings over the ground
      for (const r of rings) {
        if (r.t >= 1) continue;
        r.t = Math.min(1, r.t + dt / r.life);
        r.mesh.visible = r.t < 1;
        r.mesh.material.uniforms.uT.value = r.t;
      }
      // gates: opening, beating as they grow, a sparkle drifting off now and then; the lance through, a flare and gone
      // (nothing thrown: gone)
      for (const g of gates) {
        if (!g.mesh.visible) continue;
        g.age += dt;
        g.open = Math.min(1, g.open + dt / GATE.open);
        g.beat = Math.max(0, g.beat - dt / GATE.beat);
        g.radius += (g.want - g.radius) * Math.min(1, dt * 16);
        let flash = 0, wave = 0, grow = 1;
        if (g.fired >= 0) {
          g.fired += dt;
          const f = Math.min(1, g.fired / GATE.fire);
          flash = (1 - f) * (1 - f); wave = Math.max(0.001, f); grow = 1 + 0.15 * (1 - Math.pow(1 - f, 3));
          g.fade = clamp((f - 0.35) / 0.65, 0, 1);
        } else if (!g.live) g.fade = Math.min(1, g.fade + dt / GATE.end);
        if (g.fade >= 1) { g.mesh.visible = false; continue; }
        if (g.live && g.open > 0.4) {
          g.dust -= dt;
          if (g.dust <= 0) {
            g.dust = GATE.dust * (0.6 + 0.8 * rand());
            const a = rand() * 6.283, c = Math.cos(a), sn = Math.sin(a), v = 0.25 + 0.5 * rand();
            across(g.dir);
            side.copy(X).multiplyScalar(c).addScaledVector(Y, sn);
            tmp.copy(g.mesh.position).addScaledVector(side, g.radius * (0.7 + 0.6 * rand()));
            spark(tmp, side.x * v, side.y * v + 0.25, side.z * v, 0.6 + 0.5 * rand(), 0.035 + 0.035 * rand(), 1);
          }
        }
        const opened = 0.5 + 0.5 * (1 - Math.pow(1 - g.open, 3));
        g.mesh.scale.setScalar(Math.max(1e-4, g.radius * GATE.reach * opened * (1 + 0.14 * g.beat * g.beat) * grow));
        // its three layers: apart at first, one before another on the lance's line, turning fast against each other;
        // together as the lance grows (the combo says how far along: close()), and at once as it is let go or given up
        const going = g.fired >= 0 || !g.live;
        g.shut += ((going ? 1 : g.toShut) - g.shut) * Math.min(1, dt * (going ? GATE.snap : GATE.shut));
        g.spin += dt * (1 + GATE.apart * (1 - g.shut));
        const gap = GATE.gap * g.radius * (1 - g.shut) * opened / g.mesh.scale.x;       // (in the outer one's own measure)
        g.ahead.forEach((m, i) => { m.position.z = gap * (i + 1); });
        for (const mat of g.mats) {
          const u = mat.uniforms;
          u.uOpen.value = g.open; u.uLevel.value = g.level; u.uBeat.value = g.beat; u.uFlash.value = flash; u.uFade.value = g.fade; u.uAge.value = g.age; u.uSpin.value = g.spin;
          u.uWave.value = 0;                                              // (its wave is a hoop of the clip's water now: fire())
        }
      }
      // hoops of water
      for (const h of hoops) {
        if (h.t >= 1) continue;
        h.t = Math.min(1, h.t + dt / h.life); h.age += dt;
        h.mesh.visible = h.t < 1;
        const out_ = 1 - Math.pow(1 - h.t, 2.6);                             // out fast at first, as it was
        h.mesh.scale.setScalar(h.radius * (0.42 + 0.58 * out_));
        h.mesh.rotateZ(WATER_BLADE.hoop.spin * dt);
        h.uniforms.uK.value = (1 - h.t) * (1 - h.t * h.t);
        still(h, Math.floor(h.age * WATER_BLADE.fps) % h.sheet.frames.length);
      }
      // lances: each grows toward how grown it should be; its strip is laid from its tail to its point, facing the camera
      for (const l of lances) {
        leaves(l, dt, camera);
        if (!l.mesh.visible) continue;
        if (!l.live) { l.k -= dt / 0.1; if (l.k <= 0) { l.mesh.visible = false; continue; } }
        l.grown += (l.level - l.grown) * Math.min(1, dt * 14);
        const def = SHOTS.lance, i0 = Math.min(2, Math.floor(l.grown)), f = l.grown - i0;
        const mix = a => a[i0] + (a[i0 + 1] - a[i0]) * f;
        l.long = mix(def.long);
        l.hot += ((l.far > 0 ? 1 : 0) - l.hot) * Math.min(1, dt * 30);      // (thrown: white hot, and longer)
        const long = l.long * (1 + (FLIGHT.long - 1) * l.hot), wide = l.long * def.wide * (0.97 + 0.03 * beat);      // (thrown, it is drawn out longer, not wider)
        const pos = l.mesh.geometry.attributes.position;
        for (let i = 0; i < LANCE; i++) {
          const u = i / (LANCE - 1);
          tan.copy(l.head).addScaledVector(l.dir, -long * (1 - u));
          toCam.subVectors(camera.position, tan);
          side.crossVectors(l.dir, toCam).normalize();
          pos.setXYZ(i * 2, tan.x - side.x * wide, tan.y - side.y * wide, tan.z - side.z * wide);
          pos.setXYZ(i * 2 + 1, tan.x + side.x * wide, tan.y + side.y * wide, tan.z + side.z * wide);
        }
        pos.needsUpdate = true;
        const u = l.mesh.material.uniforms;
        u.uK.value = Math.max(0, l.k); u.uHot.value = l.hot; u.uAge.value = time;
      }
      // ribbons: every place on one grows older and is dropped; the strip is laid through what is left, facing the camera
      for (const r of ribbons) {
        if (r.key !== null && r.used && !r.seen) r.used = false;          // (a hand's ribbon nobody fed this frame: let go)
        r.seen = false;
        for (const p of r.pts) p.age += dt;
        while (r.pts.length && r.pts[r.pts.length - 1].age > r.life) r.pts.pop();
        const n = r.pts.length;
        r.mesh.visible = n > 1;
        if (n < 2) { if (!r.used) r.key = null; continue; }
        const pos = r.mesh.geometry.attributes.position, uv = r.mesh.geometry.attributes.uv;
        for (let i = 0; i < RIBBON; i++) {
          const j = Math.min(i, n - 1), p = r.pts[j].at;
          tan.subVectors(r.pts[Math.max(0, j - 1)].at, r.pts[Math.min(n - 1, j + 1)].at);
          toCam.subVectors(camera.position, p);
          side.crossVectors(tan, toCam);
          const l = side.length();
          const u = Math.min(1, r.pts[j].age / r.life);
          const w = l > 1e-6 && i < n ? r.width * (1 - 0.7 * u) / l : 0;
          pos.setXYZ(i * 2, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
          pos.setXYZ(i * 2 + 1, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
          uv.setX(i * 2, u); uv.setX(i * 2 + 1, u);
        }
        pos.needsUpdate = true; uv.needsUpdate = true;
      }
    },
    dispose() {
      square.dispose(); waveGeo.dispose(); bladeGeo.dispose(); flatGeo.dispose(); roundGeo.dispose(); hoopGeo.dispose(); sGeo.dispose(); hGeo.dispose(); flat.dispose(); spear.dispose();
      gone = true;
      for (const name in atlases) atlases[name].dispose();
      for (const r of ribbons) r.mesh.geometry.dispose();
      for (const l of lances) { l.mesh.geometry.dispose(); l.beam.mesh.geometry.dispose(); for (const w of l.wake) w.mesh.geometry.dispose(); }
      for (const m of made) m.dispose();
    },
  };
  fx.setNight(false);
  return fx;
}
