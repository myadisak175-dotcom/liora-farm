/* ==========================================================================
   blink-fx.js  —  what Vivi's blink looks like (blink.js says when and where): the clip it was asked after, done as a
   blink. The clip (24 Nov 2026, ten seconds made with Gemini, at night): cyan sparks gather at a girl's feet, a magic
   circle opens under her, a dome of light bursts round her with needles of light shooting up and a ribbon of light
   swung round her; she runs off, two or three cyan afterimages of herself left behind her, long ribbons of light
   sweeping after her, sparks hanging in the air; she lands crouched on another circle filled with light, sparks
   splashing up round her; once more the other way, the ribbons winding up round her first. In the clip she runs; here
   she is gone, and there again a few metres on ("ในวีดีโอมันวิ่ง แต่เราจะทำเป็น Blink แทน ให้เหมือนตัวละครวาร์ปได้ แต่ทำ
   effect คล้ายๆ ในวีดีโอ"). One job: draw it. It decides nothing.

     const fx = createBlinkFx()
     scene.add(fx.object)                     (a page that dims its land by night draws this after the dimming)
     fx.begin(from, to, size, character)      she presses: the circle opens under her, her body flashes cyan
     fx.vanish(from, to, travel, character)   she is gone: where she stood an afterimage of her as she was, the dome
                                              bursting round it, needles of light, sparks; the ribbons streak to where she
                                              is going in `travel` s, afterimages and sparks left along the way
     fx.arrive(at, character)                 she is there: the circle there fills with light, sparks splash up, two
                                              ribbons wind up round her, her body's cyan fades off her
     fx.stop(character)                       broken off: her colour is her own again (what is drawn fades by itself)
     fx.prepare(character)                    read her meshes now (once a character, some 15 ms), not as she first blinks
     every frame: fx.update(dt, camera)       fx.busy: something is still drawn
     fx.setNight(on)                          by night its light shines more
     fx.dispose()
   (from, to, at: her feet, { x, y, z }; size: her height / 1.75 m; character: stylized-character.js's)

   WHAT IS TAKEN FROM THE CLIP, AND HOW (BLINK_FX: its numbers, at 1.75 m)
     - the colours: read off the clip's frames (BLINK_LOOK): the ribbons' and the circle's white heart #c2fbfb, their
       cyan #7df0f0 / #72d0cf, the afterimages a bluer cyan (#9de4ef lit, #5fb5ca to #2d99b2 in shade). They are the
       basic combo's water (WATER_LOOK in magic-combo-fx.js: #effffe, #5fe6e8, #169fb0) all but the same, so these are
       those, and the afterimages' own two
     - the circle: a double ring, a band of marks round it, a ring, a six-pointed star in it, two rings and a small one
       in the middle (the clip's). It draws itself round as she presses, flashes as she goes, the star and the band of
       marks turning against each other; the one where she comes down fills with light first (the clip's landing: a
       disc of light under her), then is lines
     - the dome: half a ball of light round where she stood, swelling from a third of its size, full of white light while
       it is small, a hard bright edge, strokes of light on its face, gone in 0.45 s; needles of light shooting up out
       of it and out of its middle
     - the afterimages: her own body as she was the moment she went (every skinned mesh of hers, posed as she was, put
       into one shape: GHOST), in the afterimages' cyan, lit as she is (one hard edge between light and shade, the
       game's sun), a white rim; where she stood, and two more along her way, leaning into it; each goes by breaking up
       into small squares from its feet up, as the spears of the rain go. The clip's are of a girl running, each in
       another stride; here all three are her one pose: she is not seen between
     - the ribbons: three long ones wound about her way, streaking out to where she is going as she goes and left lying
       along it a moment after (the clip's, sweeping after her as she runs), a white heart and a cyan body with hard
       edges, pointed at both ends; two that wind up round her as she comes down (the clip's second time)
     - the sparks: thrown out of the burst on short streaks, sparkles hanging along her way, drifting up and
       twinkling (the clip's, which hang in the air for seconds), a splash of them up round her as she comes down; a
       few puffs of dust at her feet (the clip's grey wisps)
     - her own body: washed with the cyan as she goes (0.06 s), and the cyan going off her as she is there again (0.3 s):
       stylized-character.js's tint
     Not the clip's run, nor its sparks gathering at her feet for a second first: a blink is pressed and done.

   HOW IT IS DRAWN (as her other spells are: magic-combo-fx.js, magic-circle-fx.js). Light laid over the picture with
   one blend (what a thing covers hides what is behind it, its glow only adds); every material see-through, writing no
   depth (but the afterimages, below), marked userData.noGrade (the light of the hour and the curse leave it alone); the
   whole a Group whose renderOrder is 100, drawn after the world's own see-through things (README, "Over water").
     - a circle: one flat square, all of it worked out by its shader (by the rules for a phone's GPU: every line always
       drawn and then masked, a line's edge softened by how fast its distance changes on the screen (fwidth), taken once
       before anything else; nothing that can be NaN; what is drawn kept between 0 and 1). 4 at most
     - a dome: half a ball, its shader from where it is turned to the eye; 2 at most
     - an afterimage: the shape of her made when she goes (her skinned meshes put through their bones once, on the
       CPU: a few milliseconds for Vivi's 18,000 points), drawn twice: once for its depth alone, once for its colour
       over that depth, so that only its nearest face is seen (a see-through body, not one whose arms show through its
       chest). 6 at most (two blinks' worth), sharing two shapes
     - the ribbons: one strip through all of them, worked out anew each frame (they are few points), turned to the eye
     - sparks, sparkles, needles, puffs: one square each, instanced, their whole way worked out by the shader from
       where and when they began (nothing is moved on the CPU); 384 at most
   At most some 20 draws while a blink is drawn, none when nothing is.
   ========================================================================== */
import * as THREE from 'three';

const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

// the light (the basic combo's water) and the afterimages' own cyan, lit and in shade
export const BLINK_LOOK = { core: '#effffe', main: '#5fe6e8', deep: '#169fb0', ghost: '#98ecf5', shade: '#3aadcc' };

// what is drawn and for how long (s; m at 1.75 m)
//   circle: r its radius where she goes, rB where she comes down; open: s to draw itself round; flash: s its flash dies
//           away in; hold: s it stays whole after it opened; fade: s it then goes in; spin: rad/s the star turns (the band
//           of marks the other way, a little slower); fill: s the light that fills the circle where she comes down dies in
//   dome:   r: its radius at its full size; from: of that, as it bursts; grow: s to its full size; white: s it is white
//           for; fade: s it goes in, from `hold` s on
//   ghost:  life: s the one where she stood lasts; along: where along her way the others are (0..1); alongLife: s they
//           last; alpha: how much of her it covers at first (the others: alongAlpha); white: s it is white as it is
//           left; lean: rad the ones along her way lean into it; drift: m the one where she stood is carried after her;
//           grain: its squares' size (m) as it breaks up
//   trails: the ribbons along her way: up (m over her way at its middle), r (m from her way), turns (round it along
//           the way), phase (rad), wide (m, half its width at its widest); lag: s the tail is behind the head as she goes;
//           linger: s they lie along her way after she is there
//   swirls: the two that wind up round her as she comes down: r (m), up (m: how high they reach), turns, wide; grow:
//           s their heads take to the top; lag, linger as the trails'
//   sparks: out (thrown out of the burst), rays (needles up out of the dome), needles (out of its middle), along (sparkles
//           a metre of her way), splash (up round her as she comes down), hang (sparkles left round her then), puffs
//           (of dust at her feet, each time)
//   near:   close before the camera what is drawn would fill the picture: the camera comes after her through where she
//           stood (the afterimage left there, the dome, the circle), and from behind her, as the game's camera mostly is,
//           the afterimages along her way stand between it and her as she comes down. Gone nearer than `none` m, whole
//           from `whole` m: the game's camera stands 5.3 m from her, so where she stood is whole as she goes, and what
//           lies between it and her is all but gone; seen from the side, all of it is whole
//   tint:   the colour washed over her body as she goes (stylized-character.js' tint: r, g, b; most: how much), how much
//           of it is on her as she is there again (land), and s it takes to go off her then (back)
export const BLINK_FX = {
  circle: { r: 1.1, rB: 1.0, open: 0.07, flash: 0.22, hold: 0.3, fade: 0.5, spin: 1.3, fill: 0.55, lift: 0.05 },
  dome: { r: 1.15, from: 0.32, grow: 0.22, white: 0.09, hold: 0.12, fade: 0.32 },
  ghost: { life: 0.46, along: [0.42, 0.76], alongLife: 0.38, alpha: 0.9, alongAlpha: 0.8, white: 0.1, lean: 0.24, drift: 0.14, grain: 0.06 },
  trails: [
    { up: 0.95, r: 0.42, turns: 0.75, phase: 0.0, wide: 0.075 },
    { up: 0.72, r: 0.52, turns: -0.6, phase: 2.2, wide: 0.06 },
    { up: 1.28, r: 0.3, turns: 0.5, phase: 4.1, wide: 0.05 },
  ],
  lag: 0.04, linger: 0.36,
  swirls: { r: 0.62, up: 1.35, turns: 1.25, wide: 0.06, grow: 0.2, lag: 0.08, linger: 0.24 },
  sparks: { out: 26, rays: 4, needles: 5, along: 6, splash: 34, hang: 24, puffs: 3 },
  near: { none: 2.0, whole: 4.6 },
  tint: { colour: [0.55, 1.25, 1.3], most: 0.85, land: 0.6, back: 0.26 },
};

const BLEND = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation };
const SPARKS = 384, RIBBONS = 10, PLACES = 28, CIRCLES = 4, DOMES = 2, GHOSTS = 6;

// ---- the circle: one flat square (-1..1), drawn by its shader
const CIRCLE_VERT = /* glsl */`
  uniform vec2 uNear;
  varying vec2 vP;
  varying float vNear;
  void main() {
    vP = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNear = smoothstep(uNear.x * 0.7, uNear.y * 0.7, length(mv.xyz));      // (it lies under the camera's way: a little nearer)
    gl_Position = projectionMatrix * mv;
  }`;
const CIRCLE_FRAG = /* glsl */`
  uniform vec3 uCore, uMain, uDeep;
  uniform float uShine, uOpen, uFade, uFlash, uFill, uSpin;
  varying vec2 vP;
  varying float vNear;
  float cell(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }      // (one number for a whole mark: neighbours need not agree)
  float ring(float r, float at, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(r - at)); }
  float bar(float d, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
  void main() {
    float r = length(vP);
    float aa = fwidth(r) * 0.85 + 1e-4;                       // (taken once, before anything else: the same for every line)
    float wid = 1.0 + 0.8 * uFlash;                           // its lines thicken as it flashes
    // the band of marks turns one way, the star the other
    float c1 = cos(-0.7 * uSpin), s1 = sin(-0.7 * uSpin), c2 = cos(uSpin), s2 = sin(uSpin);
    vec2 o = vec2(c1 * vP.x - s1 * vP.y, s1 * vP.x + c1 * vP.y);
    vec2 q = vec2(c2 * vP.x - s2 * vP.y, s2 * vP.x + c2 * vP.y);
    float far = abs(o.x) + abs(o.y) < 1e-5 ? 1.0 : 0.0;        // (the very middle has no angle)
    float ang = atan(o.y, o.x + far) / 6.2831853 + 0.5;
    float far0 = abs(vP.x) + abs(vP.y) < 1e-5 ? 1.0 : 0.0;
    float round0 = atan(vP.y, vP.x + far0) / 6.2831853 + 0.5;   // (where it is drawn round from: it does not turn)
    // rings
    float L = ring(r, 0.965, 0.011 * wid, aa);
    L = max(L, ring(r, 0.925, 0.0055 * wid, aa));
    L = max(L, ring(r, 0.79, 0.009 * wid, aa));
    L = max(L, ring(r, 0.43, 0.0075 * wid, aa));
    L = max(L, ring(r, 0.385, 0.005 * wid, aa));
    L = max(L, ring(r, 0.13, 0.0065 * wid, aa));
    // the band of marks (0.80 .. 0.905): forty cells round it, in each a mark of one to three strokes, each drawn always
    // and kept or not by the cell's numbers
    float N = 40.0, ci = floor(ang * N);
    float h1 = cell(ci + 1.0), h2 = cell(ci + 17.0), h3 = cell(ci + 41.0), h4 = cell(ci + 73.0);
    vec2 g = vec2((fract(ang * N) - 0.5) * 6.2831853 * 0.8525 / N, r - 0.8525);       // about the cell's middle, in the circle's units
    float gw = 0.0052 * wid;
    float inBox = step(abs(g.y), 0.034) * step(abs(g.x), 0.05);
    float st = bar(g.x - (h1 - 0.5) * 0.05, gw, aa) * step(abs(g.y), 0.032) * step(0.22, h2);                    // across the band
    st = max(st, bar(g.y - (h2 > 0.5 ? 0.019 : -0.019), gw, aa) * step(abs(g.x), 0.036) * step(h3, 0.72));       // along it
    st = max(st, bar(0.7071 * (g.x + g.y * (h4 > 0.5 ? 1.0 : -1.0)), gw, aa) * step(length(g), 0.034) * step(0.55, h4));      // a slant
    st = max(st, ring(length(g - vec2((h3 - 0.5) * 0.03, 0.0)), 0.014, gw * 0.85, aa) * step(0.62, h1));       // a small ring
    L = max(L, st * inBox * step(0.8, r) * step(r, 0.905));
    // small ticks round the inner band (0.385 .. 0.43)
    float tk = bar((fract(ang * 48.0 + 0.5) - 0.5) * 6.2831853 * 0.41 / 48.0, 0.0045 * wid, aa) * step(0.392, r) * step(r, 0.423);
    L = max(L, tk);
    // the six-pointed star in the ring at 0.79: two triangles, each edge a line 0.395 from the middle, inside the ring
    float hw = 0.0065 * wid, inr = 0.395, star = 0.0;
    star = max(star, bar(dot(q, vec2(0.8660254, 0.5)) - inr, hw, aa));
    star = max(star, bar(dot(q, vec2(0.0, 1.0)) - inr, hw, aa));
    star = max(star, bar(dot(q, vec2(-0.8660254, 0.5)) - inr, hw, aa));
    star = max(star, bar(dot(q, vec2(-0.8660254, -0.5)) - inr, hw, aa));
    star = max(star, bar(dot(q, vec2(0.0, -1.0)) - inr, hw, aa));
    star = max(star, bar(dot(q, vec2(0.8660254, -0.5)) - inr, hw, aa));
    L = max(L, star * step(r, 0.778));
    // drawn round as it opens (from its far side, the way the clock goes), a bright head where it is being drawn
    float drawn = 1.0 - smoothstep(uOpen - 0.06, uOpen, round0);
    float head = (1.0 - smoothstep(0.0, 0.06, abs(round0 - uOpen))) * step(uOpen, 0.999);
    L *= max(drawn, step(0.999, uOpen));
    // its glow round the rings, and the light that fills it where she comes down
    float glow = 0.55 * exp(-abs(r - 0.965) * 26.0) + 0.35 * exp(-abs(r - 0.79) * 30.0) + 0.3 * exp(-r * 9.0);
    float disc = uFill * (0.32 + 0.68 * (1.0 - r * r)) * (1.0 - smoothstep(0.955 - aa, 0.955 + aa, r));
    float edge = 1.0 - smoothstep(0.995 - aa, 0.995 + aa, r);
    float a = clamp(L * (0.88 + 0.12 * uFlash) + head * 0.6 * step(0.86, r), 0.0, 1.0);
    vec3 line = mix(uMain, uCore, 0.5 + 0.5 * uFlash);
    vec3 col = line * a + uMain * glow * (0.35 + 0.65 * uFlash) * uShine * edge;
    col += mix(uMain, uCore, 1.0 - r) * disc * 0.8;
    float alpha = clamp(a + disc * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(clamp(col * uFade * vNear, 0.0, 1.0), alpha * uFade * vNear);
  }`;

// ---- the dome: half a ball (its uv: round it, up it)
const DOME_VERT = /* glsl */`
  varying vec3 vN, vW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const DOME_FRAG = /* glsl */`
  uniform vec3 uCore, uMain, uDeep;
  uniform float uShine, uFade, uWhite, uTurn;
  uniform vec2 uNear;
  varying vec3 vN, vW;
  varying vec2 vUv;
  float arc(float u, float from, float len) { float d = fract(u - from); return step(d, len) * sin(3.14159 * clamp(d / len, 0.0, 1.0)); }
  void main() {
    vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
    float f = 1.0 - abs(dot(n, v));
    float h = vUv.y;                                          // 0 at its foot .. 1 at its top
    float aaf = fwidth(f) + 1e-4, aah = fwidth(h) + 1e-4;     // (taken once)
    float rim = smoothstep(0.68 - aaf, 0.68 + aaf, f);        // its bright edge, hard
    float soft = f * f * f;
    // strokes of light on its face: three arcs going round it, each part of the way
    float s = (1.0 - smoothstep(0.012 - aah, 0.012 + aah, abs(h - 0.28))) * arc(vUv.x, 0.12 + uTurn, 0.3);
    s = max(s, (1.0 - smoothstep(0.009 - aah, 0.009 + aah, abs(h - 0.52))) * arc(vUv.x, 0.55 - uTurn * 0.8, 0.24));
    s = max(s, (1.0 - smoothstep(0.008 - aah, 0.008 + aah, abs(h - 0.74))) * arc(vUv.x, 0.83 + uTurn * 1.3, 0.18));
    float foot = 1.0 - smoothstep(0.0, 0.1, h);
    float a = clamp(rim * 0.8 + s * 0.75 + 0.08 + 0.22 * soft + foot * 0.25, 0.0, 1.0);
    vec3 col = mix(mix(uDeep, uMain, 0.5 + 0.5 * soft), uCore, max(rim, s) * 0.8);
    col = mix(col, mix(uMain, uCore, 0.75), uWhite);
    a = max(a, 0.42 * uWhite);
    a *= uFade * smoothstep(uNear.x, uNear.y, length(cameraPosition - vW));
    gl_FragColor = vec4(clamp(col * a * (0.85 + 0.15 * uShine), 0.0, 1.0), a);
  }`;

// ---- an afterimage: her shape, put where it is left (modelMatrix), lit as she is
const GHOST_VERT = /* glsl */`
  varying vec3 vN, vW, vO;
  void main() {
    vO = position;                                            // (about her feet: its squares go with it as it drifts)
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
// (its depth and its colour are drawn with the same shader, the depth with no colour written: both break up alike)
const GHOST_FRAG = /* glsl */`
  uniform vec3 uCore, uGhost, uShade, uSun;
  uniform float uAlpha, uWhite, uShine, uGone, uGrain, uTall;
  uniform vec2 uNear;
  varying vec3 vN, vW, vO;
  float cell(vec3 c) { return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }      // (one number for a whole square)
  void main() {
    // breaking up into squares from its feet up: a square goes once the line going up has passed it, by its own number
    float up = clamp(vO.y / uTall, 0.0, 1.0);
    float n = cell(floor(vO / uGrain));
    float gone = uGone * 1.6 - up * 0.6;                      // (its feet first)
    if (n < gone) discard;
    float edge = 1.0 - smoothstep(0.0, 0.12, n - gone);       // (where it is going: white)
    vec3 nn = normalize(vN);
    if (!gl_FrontFacing) nn = -nn;
    vec3 v = normalize(cameraPosition - vW);
    float f = 1.0 - abs(dot(nn, v));
    float lit = smoothstep(0.43, 0.47, dot(nn, uSun) * 0.5 + 0.5);      // the game's one edge between light and shade
    vec3 body = mix(uShade, uGhost, 0.35 + 0.65 * lit);
    float rim = smoothstep(0.55, 0.62, f);
    vec3 col = mix(body, uCore, max(rim * 0.85, edge * step(0.001, uGone)));
    col = mix(col, uCore, uWhite);
    float a = uAlpha * mix(0.7, 0.96, rim) * smoothstep(uNear.x, uNear.y, length(cameraPosition - vW));
    gl_FragColor = vec4(clamp(col * (0.9 + 0.12 * uShine), 0.0, 1.0) * a + uGhost * 0.2 * a * uShine, a);      // (and a little light of its own)
  }`;

// ---- sparks, sparkles, needles, puffs: one square each (corner -1..1), instanced. Each one's whole way is worked out
// here from where and when it began:
//   aA: where it began (x, y, z), when (s, the fx's clock)
//   aB: its speed (x, y, z: m/s; a needle: the way it points), how long it lasts (s)
//   aC: its half-width (m), its streak (s of its way behind it; a needle: its length, m), what it is (0 a spark, 1 a
//       sparkle, 2 a needle, 3 a puff), a number of its own
//   aD: its weight (m/s² up), its drag (1/s), 0, 0
const SPARK_VERT = /* glsl */`
  attribute vec2 corner;
  attribute vec4 aA, aB, aC, aD;
  uniform float uTime;
  uniform vec2 uNear;
  varying vec2 vL;
  varying float vLen, vFade, vKind, vSeed, vHead;
  vec3 at(float t) {
    float c = max(aD.y, 0.001);
    return aA.xyz + aB.xyz * (1.0 - exp(-c * t)) / c + vec3(0.0, 0.5 * aD.x * t * t, 0.0);
  }
  void main() {
    float age = uTime - aA.w, life = max(aB.w, 0.01), u = clamp(age / life, 0.0, 1.0);
    float kind = aC.z;
    float isRay = step(1.5, kind) * (1.0 - step(2.5, kind)), isPuff = step(2.5, kind), isDot = step(0.5, kind) * (1.0 - isRay);
    vec3 head = at(age), tail = at(max(0.0, age - aC.y));
    // a needle: out from where it began along its way, its tail following it off
    vec3 way = normalize(aB.xyz + vec3(0.0, 1e-5, 0.0));
    float grow = 1.0 - pow(1.0 - clamp(age / 0.07, 0.0, 1.0), 3.0);
    float leave = pow(clamp((age - 0.05) / max(life - 0.05, 0.01), 0.0, 1.0), 1.4);
    head = mix(head, aA.xyz + way * aC.y * grow, isRay);
    tail = mix(tail, aA.xyz + way * aC.y * leave, isRay);
    tail = mix(tail, head, isDot);                            // (a sparkle, a puff: one place)
    float w = aC.x * mix(mix(1.0 - 0.55 * u, 1.0 - 0.7 * u, isRay), 1.0 + 2.4 * u, isPuff);
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
    // how much of it there is, by what it is: a spark dies as it goes, a sparkle comes and goes and twinkles, a needle
    // goes as it leaves, a puff comes and thins away
    float twinkle = 0.62 + 0.38 * sin(uTime * 15.0 + aC.w * 40.0);
    float spark = pow(1.0 - u, 1.2), dot1 = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.55, 1.0, u)) * twinkle;
    float ray = 1.0 - u, puff = smoothstep(0.0, 0.15, u) * pow(1.0 - u, 1.4);
    vFade = mix(mix(mix(spark, dot1, step(0.5, kind)), ray, isRay), puff, isPuff) * step(0.0, age) * step(age, life);
    vKind = kind; vSeed = aC.w; vHead = 1.0;
    vFade *= smoothstep(uNear.x * mix(0.6, 1.5, isRay), uNear.y * mix(0.6, 1.5, isRay), -p.z);      // (a needle stands tall: further)
    gl_Position = projectionMatrix * p;
    if (age < 0.0 || age > life) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);      // (not alive: off the picture)
  }`;
const SPARK_FRAG = /* glsl */`
  uniform vec3 uCore, uMain, uDeep;
  uniform float uShine;
  varying vec2 vL;
  varying float vLen, vFade, vKind, vSeed, vHead;
  void main() {
    // the distance from its line, in its widths (0 on it .. 1 at its edge)
    vec2 q = vL;
    float d = length(vec2(q.x - clamp(q.x, 0.0, vLen), q.y));
    float aa = fwidth(d) + 1e-4;                              // (taken once)
    float isPuff = step(2.5, vKind), isRay = step(1.5, vKind) * (1.0 - isPuff);
    float core = 1.0 - smoothstep(0.34 - aa, 0.34 + aa, d);
    float body = 1.0 - smoothstep(0.66 - aa, 0.66 + aa, d);
    float halo = (1.0 - smoothstep(0.66, 1.0, d)) * 0.45;
    float toHead = vLen > 0.01 ? clamp(q.x / vLen, 0.0, 1.0) : 1.0;
    float bright = mix(1.0, 0.35 + 0.65 * toHead, step(0.02, vLen) * (1.0 - isRay));      // (a streak: brighter at its head)
    float a = (core + body * 0.75) * 0.75 * bright;
    vec3 col = mix(uMain, uCore, core) * a + uMain * halo * uShine * bright;
    // a puff: a grey wisp with a ragged edge
    float rag = 0.86 + 0.1 * sin(q.x * 7.0 + vSeed * 20.0) * sin(q.y * 6.0 - vSeed * 13.0);
    float pa = (1.0 - smoothstep(rag - 0.08 - aa, rag + aa, d)) * 0.42;
    vec3 pc = mix(vec3(0.74, 0.8, 0.84), vec3(0.9, 0.94, 0.96), clamp(0.5 - q.y * 0.5, 0.0, 1.0)) * pa;
    a = mix(a, pa, isPuff); col = mix(col, pc, isPuff);
    gl_FragColor = vec4(clamp(col * vFade, 0.0, 1.0), clamp(a * vFade, 0.0, 1.0));
  }`;

// ---- the ribbons: one strip through all of them; each point knows how far along its ribbon it is (u), which side
// (v), how much of it there is (fade)
const RIBBON_VERT = /* glsl */`
  attribute vec3 aR;
  uniform vec2 uNear;
  varying vec3 vR;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vR = aR; vR.z *= smoothstep(uNear.x, uNear.y, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const RIBBON_FRAG = /* glsl */`
  uniform vec3 uCore, uMain, uDeep;
  uniform float uShine;
  varying vec3 vR;
  void main() {
    float v = abs(vR.y);
    float aa = fwidth(vR.y) + 1e-4;                           // (taken once)
    float body = 1.0 - smoothstep(0.86 - aa, 0.86 + aa, v);
    float core = 1.0 - smoothstep(0.34 - aa, 0.34 + aa, v);
    float rim = smoothstep(0.64 - aa, 0.64 + aa, v) * body;
    float head = smoothstep(0.15, 1.0, vR.x);
    vec3 col = mix(uMain, uDeep, rim * 0.55);
    col = mix(col, uCore, core * (0.55 + 0.45 * head));
    float a = body * vR.z * (0.7 + 0.3 * head);
    float glow = (1.0 - smoothstep(0.86, 1.0, v)) * 0.3 * vR.z;
    gl_FragColor = vec4(clamp(col * a + uMain * glow * uShine, 0.0, 1.0), a);
  }`;

export function createBlinkFx({ seed = 11 } = {}) {
  const object = new THREE.Group();
  object.name = 'blinkFx';
  object.renderOrder = 100;          // (after the world's own see-through things: README, "Over water")
  let s0 = seed >>> 0;
  const rand = () => { s0 = (s0 + 0x6d2b79f5) >>> 0; let t = s0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const between = (a, b) => a + (b - a) * rand();
  const colours = { uCore: { value: rgb(BLINK_LOOK.core) }, uMain: { value: rgb(BLINK_LOOK.main) }, uDeep: { value: rgb(BLINK_LOOK.deep) }, uShine: { value: 1 } };
  const made = [];
  const near = { value: new THREE.Vector2(BLINK_FX.near.none, BLINK_FX.near.whole) };      // (shared: a bigger character, further)
  const material = o => { const m = new THREE.ShaderMaterial({ depthWrite: false, transparent: true, side: THREE.DoubleSide, forceSinglePass: true, ...BLEND, ...o }); m.userData.noGrade = true; made.push(m); return m; };
  const put = (geo, mat, order) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.visible = false; m.renderOrder = order; object.add(m); return m; };
  let clock = 0, eye = null, night = false;

  // ---- the circles
  const square = new THREE.PlaneGeometry(2, 2);
  const circles = Array.from({ length: CIRCLES }, () => {
    const mat = material({ uniforms: { ...colours, uOpen: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 }, uFill: { value: 0 }, uSpin: { value: 0 }, uNear: near }, vertexShader: CIRCLE_VERT, fragmentShader: CIRCLE_FRAG });
    const mesh = put(square, mat, 1);
    mesh.rotation.x = -Math.PI / 2;
    return { mesh, u: mat.uniforms, t0: -1, flashAt: 0, fill: false, spin0: 0, on: false };
  });
  let circleTurn = 0;
  function openCircle(at, radius, { flashAt = 0, fill = false } = {}) {
    const c = circles[circleTurn++ % CIRCLES];
    c.mesh.position.set(at.x, at.y + BLINK_FX.circle.lift, at.z);
    c.mesh.scale.setScalar(radius);
    c.t0 = clock; c.flashAt = flashAt; c.fill = fill; c.spin0 = rand() * 6.28; c.on = true; c.mesh.visible = true;
    return c;
  }
  function stepCircle(c) {
    const C = BLINK_FX.circle, age = clock - c.t0;
    const end = C.open + C.hold + C.fade + (c.fill ? 0.15 : 0);
    if (age > end) { c.on = false; c.mesh.visible = false; return; }
    c.u.uOpen.value = clamp(age / C.open, 0, 1);
    const since = age - c.flashAt;
    c.u.uFlash.value = since < 0 ? 0 : Math.exp(-since / (C.flash * 0.45));
    c.u.uFill.value = c.fill ? Math.exp(-age / (C.fill * 0.4)) * 0.9 + 0.1 * (1 - sstep(0, C.fill * 2, age)) : 0;
    c.u.uFade.value = 1 - sstep(end - C.fade, end, age);
    c.u.uSpin.value = c.spin0 + age * C.spin;
  }

  // ---- the domes
  const half = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const domes = Array.from({ length: DOMES }, () => {
    const mat = material({ uniforms: { ...colours, uFade: { value: 0 }, uWhite: { value: 0 }, uTurn: { value: 0 }, uNear: near }, vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, forceSinglePass: false });
    return { mesh: put(half, mat, 2), u: mat.uniforms, t0: -1, r: 1, on: false };
  });
  let domeTurn = 0;
  function burstDome(at, r) {
    const d = domes[domeTurn++ % DOMES];
    d.mesh.position.set(at.x, at.y, at.z);
    d.t0 = clock; d.r = r; d.on = true; d.mesh.visible = true;
    d.mesh.rotation.y = rand() * 6.28;
  }
  function stepDome(d) {
    const D = BLINK_FX.dome, age = clock - d.t0, end = D.hold + D.fade;
    if (age > end) { d.on = false; d.mesh.visible = false; return; }
    const g = 1 - Math.pow(1 - clamp(age / D.grow, 0, 1), 3);
    d.mesh.scale.setScalar(d.r * (D.from + (1 - D.from) * g + 0.06 * age));
    d.u.uWhite.value = 1 - sstep(0, D.white, age);
    d.u.uFade.value = 1 - sstep(D.hold, end, age);
    d.u.uTurn.value = age * 0.9;
  }

  // ---- the afterimages. Her shape, made once for each blink (two in hand, so the last blink's may still be drawn as
  // the next is made): every skinned mesh of hers put through its bones as she was last drawn, about her feet and
  // turned as she faces, so that it can be put anywhere along her way
  const looks = new WeakMap();          // a character: her meshes' points, normals and bones' weights, read once
  function bodyOf(ch) {
    let b = looks.get(ch);
    if (b) return b;
    const parts = [], index = [];
    let count = 0;
    ch.object.updateMatrixWorld(true);
    ch.object.traverse(o => {
      if (!o.isSkinnedMesh || !o.geometry.attributes.skinIndex) return;
      const g = o.geometry, P = g.attributes.position, Nn = g.attributes.normal, I = g.attributes.skinIndex, W = g.attributes.skinWeight, n = P.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i);
        if (Nn) { nor[i * 3] = Nn.getX(i); nor[i * 3 + 1] = Nn.getY(i); nor[i * 3 + 2] = Nn.getZ(i); } else nor[i * 3 + 1] = 1;
        si[i * 4] = I.getX(i); si[i * 4 + 1] = I.getY(i); si[i * 4 + 2] = I.getZ(i); si[i * 4 + 3] = I.getW(i);
        sw[i * 4] = W.getX(i); sw[i * 4 + 1] = W.getY(i); sw[i * 4 + 2] = W.getZ(i); sw[i * 4 + 3] = W.getW(i);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) index.push(g.index.getX(i) + count);
      else for (let i = 0; i < n; i++) index.push(i + count);
      parts.push({ mesh: o, pos, nor, si, sw, n, at: count, bones: new Float32Array(o.skeleton.bones.length * 16) });
      count += n;
    });
    b = { parts, count, index: new THREE.BufferAttribute(count > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1) };
    looks.set(ch, b);
    return b;
  }
  const shapes = [0, 1].map(() => ({ geo: null, count: 0, body: null }));
  let shapeTurn = 0;
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4();
  // her shape now, about `feet`, turned by -yaw. -> the geometry (shared by the afterimages of this blink); ms it took
  function shapeOf(ch, feet, yaw) {
    const t0 = performance.now();
    const body = bodyOf(ch);
    const s = shapes[shapeTurn++ % shapes.length];
    if (!s.geo || s.count !== body.count || s.body !== body) {
      if (s.geo) s.geo.dispose();
      s.geo = new THREE.BufferGeometry();
      s.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(body.count * 3), 3));
      s.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(body.count * 3), 3));
      s.geo.setIndex(body.index);
      s.count = body.count; s.body = body;
    }
    ch.object.updateMatrixWorld(true);
    const P = s.geo.attributes.position.array, Nn = s.geo.attributes.normal.array;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    let lo = Infinity, hi = -Infinity;
    for (const part of body.parts) {
      const m = part.mesh, sk = m.skeleton, B = part.bones;
      // in the world: matrixWorld x bindMatrixInverse x (the bone's matrixWorld x its inverse at rest) x bindMatrix, each bone
      mA.multiplyMatrices(m.matrixWorld, m.bindMatrixInverse);
      for (let b = 0; b < sk.bones.length; b++) {
        mB.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]).premultiply(mA).multiply(m.bindMatrix);
        B.set(mB.elements, b * 16);
      }
      const { pos, nor, si, sw, n, at } = part;
      for (let i = 0; i < n; i++) {
        const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2], qx = nor[i * 3], qy = nor[i * 3 + 1], qz = nor[i * 3 + 2];
        let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0;
        for (let j = 0; j < 4; j++) {
          const w = sw[i * 4 + j];
          if (w === 0) continue;
          const e = si[i * 4 + j] * 16;
          x += w * (B[e] * px + B[e + 4] * py + B[e + 8] * pz + B[e + 12]);
          y += w * (B[e + 1] * px + B[e + 5] * py + B[e + 9] * pz + B[e + 13]);
          z += w * (B[e + 2] * px + B[e + 6] * py + B[e + 10] * pz + B[e + 14]);
          nx += w * (B[e] * qx + B[e + 4] * qy + B[e + 8] * qz);
          ny += w * (B[e + 1] * qx + B[e + 5] * qy + B[e + 9] * qz);
          nz += w * (B[e + 2] * qx + B[e + 6] * qy + B[e + 10] * qz);
        }
        // about her feet, turned back by her heading (her face to +z)
        const dx = x - feet.x, dz = z - feet.z, o = (at + i) * 3;
        P[o] = cs * dx - sn * dz; P[o + 1] = y - feet.y; P[o + 2] = sn * dx + cs * dz;
        const l = Math.hypot(nx, ny, nz) || 1;
        Nn[o] = (cs * nx - sn * nz) / l; Nn[o + 1] = ny / l; Nn[o + 2] = (sn * nx + cs * nz) / l;
        if (y < lo) lo = y; if (y > hi) hi = y;
      }
    }
    s.geo.attributes.position.needsUpdate = true; s.geo.attributes.normal.needsUpdate = true;
    s.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (hi - lo) / 2, 0), Math.max(1, hi - lo));
    s.tall = Math.max(0.5, hi - lo);
    stats.shapeMs = +(performance.now() - t0).toFixed(2);
    return s;
  }
  const SUN = new THREE.Vector3(-0.4, 0.9, 0.5).normalize();      // (the game's sun: stylized-character.js)
  const ghosts = Array.from({ length: GHOSTS }, (_, i) => {
    const u = { uCore: colours.uCore, uShine: colours.uShine, uGhost: { value: rgb(BLINK_LOOK.ghost) }, uShade: { value: rgb(BLINK_LOOK.shade) }, uSun: { value: SUN },
      uAlpha: { value: 0 }, uWhite: { value: 0 }, uGone: { value: 0 }, uGrain: { value: BLINK_FX.ghost.grain }, uTall: { value: 1.7 }, uNear: near };
    // once for its depth alone, then its colour over that depth: only its nearest face is seen
    const depth = material({ uniforms: u, vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, colorWrite: false, depthWrite: true, side: THREE.DoubleSide, forceSinglePass: true });
    const colour = material({ uniforms: u, vertexShader: GHOST_VERT, fragmentShader: GHOST_FRAG, depthWrite: false, depthFunc: THREE.LessEqualDepth, side: THREE.DoubleSide, forceSinglePass: true });
    const a = put(new THREE.BufferGeometry(), depth, 3 + i * 0.01), b = put(a.geometry, colour, 4 + i * 0.01);
    return { a, b, u, t0: -1, life: 1, alpha: 1, on: false, at: new THREE.Vector3(), to: new THREE.Vector3(), yaw: 0, lean: 0, size: 1 };
  });
  let ghostTurn = 0;
  function leaveGhost(shape, at, yaw, { when = clock, life, alpha, lean = 0, drift = null, size = 1 }) {
    const g = ghosts[ghostTurn++ % GHOSTS];
    g.a.geometry = shape.geo; g.b.geometry = shape.geo;
    g.at.copy(at); g.to.copy(drift || at); g.yaw = yaw; g.lean = lean;
    g.t0 = when; g.life = life; g.alpha = alpha; g.on = true; g.size = size;
    g.u.uTall.value = shape.tall;
    stepGhost(g);
  }
  function stepGhost(g) {
    const G = BLINK_FX.ghost, age = clock - g.t0;
    if (age > g.life) { g.on = false; g.a.visible = g.b.visible = false; return; }
    const shown = age >= 0;
    g.a.visible = g.b.visible = shown;
    if (!shown) return;
    const u = age / g.life, carry = 1 - Math.pow(1 - u, 2);
    g.a.position.lerpVectors(g.at, g.to, carry); g.b.position.copy(g.a.position);
    g.a.rotation.set(g.lean * (0.6 + 0.4 * carry), g.yaw, 0, 'YXZ'); g.b.rotation.copy(g.a.rotation);
    g.u.uWhite.value = 1 - sstep(0, G.white, age);
    g.u.uAlpha.value = g.alpha * (1 - 0.35 * u);
    g.u.uGone.value = sstep(0.25, 1, u);                 // (it breaks up over its last three quarters)
    g.u.uGrain.value = BLINK_FX.ghost.grain * g.size;
  }

  // ---- the ribbons: one strip through all of them
  const RV = RIBBONS * PLACES * 2;
  const ribbonGeo = new THREE.BufferGeometry();
  const rPos = new Float32Array(RV * 3), rAt = new Float32Array(RV * 3);
  ribbonGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage));
  ribbonGeo.setAttribute('aR', new THREE.BufferAttribute(rAt, 3).setUsage(THREE.DynamicDrawUsage));
  {
    const idx = [];
    for (let r = 0; r < RIBBONS; r++) for (let i = 0; i < PLACES - 1; i++) {
      const a = (r * PLACES + i) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    ribbonGeo.setIndex(idx);
  }
  const ribbonMesh = put(ribbonGeo, material({ uniforms: { ...colours, uNear: near }, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG }), 5);
  // a ribbon: where it lies (way(s, out): s 0..1 along it) and when its head and tail are where (s)
  const ribbons = Array.from({ length: RIBBONS }, () => ({ on: false, way: null, head: null, tail: null, wide: 0.05, end: 0 }));
  let ribbonTurn = 0;
  function layRibbon(way, head, tail, wide, end) {
    const r = ribbons[ribbonTurn++ % RIBBONS];
    Object.assign(r, { on: true, way, head, tail, wide, end });
  }
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), tan = new THREE.Vector3(), sideV = new THREE.Vector3(), toEye = new THREE.Vector3();
  function stepRibbons() {
    let any = false;
    for (let r = 0; r < RIBBONS; r++) {
      const R = ribbons[r], base = r * PLACES * 2;
      let shown = false;
      if (R.on) {
        if (clock > R.end) R.on = false;
        else {
          const h = clamp(R.head(clock), 0, 1), t = clamp(R.tail(clock), 0, 1);
          if (h - t > 0.004) {
            shown = true;
            const fade = 1 - sstep(0.7, 1, t);
            for (let i = 0; i < PLACES; i++) {
              const k = i / (PLACES - 1), s = t + (h - t) * k;
              R.way(s, p0);
              R.way(Math.min(1, s + 0.01), p1); tan.subVectors(p1, p0);
              if (tan.lengthSq() < 1e-10) { R.way(Math.max(0, s - 0.01), p1); tan.subVectors(p0, p1); }
              toEye.subVectors(eye.position, p0);
              sideV.crossVectors(tan, toEye);
              const sl = sideV.length();
              const w = R.wide * Math.pow(Math.sin(Math.PI * k), 0.65) * (0.55 + 0.45 * fade);
              if (sl > 1e-8) sideV.multiplyScalar(w / sl); else sideV.set(0, w, 0);
              const o = (base + i * 2) * 3;
              rPos[o] = p0.x + sideV.x; rPos[o + 1] = p0.y + sideV.y; rPos[o + 2] = p0.z + sideV.z;
              rPos[o + 3] = p0.x - sideV.x; rPos[o + 4] = p0.y - sideV.y; rPos[o + 5] = p0.z - sideV.z;
              rAt[o] = k; rAt[o + 1] = 1; rAt[o + 2] = fade;
              rAt[o + 3] = k; rAt[o + 4] = -1; rAt[o + 5] = fade;
            }
          }
        }
      }
      if (!shown) for (let i = 0; i < PLACES * 2; i++) { const o = (base + i) * 3; rPos[o] = rPos[o + 1] = rPos[o + 2] = 0; rAt[o + 2] = 0; }
      any = any || shown;
    }
    ribbonGeo.attributes.position.needsUpdate = true; ribbonGeo.attributes.aR.needsUpdate = true;
    ribbonMesh.visible = any;
  }

  // ---- sparks, sparkles, needles, puffs
  const sparkGeo = new THREE.InstancedBufferGeometry();
  sparkGeo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
  sparkGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const sA = new Float32Array(SPARKS * 4).fill(0), sB = new Float32Array(SPARKS * 4), sC = new Float32Array(SPARKS * 4), sD = new Float32Array(SPARKS * 4);
  for (let i = 0; i < SPARKS; i++) { sA[i * 4 + 3] = -1e6; sB[i * 4 + 3] = 0.1; }      // (none alive)
  const iA = new THREE.InstancedBufferAttribute(sA, 4), iB = new THREE.InstancedBufferAttribute(sB, 4), iC = new THREE.InstancedBufferAttribute(sC, 4), iD = new THREE.InstancedBufferAttribute(sD, 4);
  for (const a of [iA, iB, iC, iD]) a.setUsage(THREE.DynamicDrawUsage);
  sparkGeo.setAttribute('aA', iA); sparkGeo.setAttribute('aB', iB); sparkGeo.setAttribute('aC', iC); sparkGeo.setAttribute('aD', iD);
  sparkGeo.instanceCount = SPARKS;
  const sparkTime = { value: 0 };
  const sparkMesh = put(sparkGeo, material({ uniforms: { ...colours, uTime: sparkTime, uNear: near }, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG }), 6);
  let sparkTurn = 0, sparkUntil = -1, sparkDirty = false;
  // one of them: at (x, y, z), speed (vx, vy, vz) or a needle's way, life (s), half-width (m), streak (s) or a needle's
  // length (m), kind, weight (m/s² up), drag
  function spark(x, y, z, vx, vy, vz, life, wide, streak, kind, weight = 0, drag = 0, when = clock) {
    const i = sparkTurn++ % SPARKS, o = i * 4;
    sA[o] = x; sA[o + 1] = y; sA[o + 2] = z; sA[o + 3] = when;
    sB[o] = vx; sB[o + 1] = vy; sB[o + 2] = vz; sB[o + 3] = life;
    sC[o] = wide; sC[o + 1] = streak; sC[o + 2] = kind; sC[o + 3] = rand();
    sD[o] = weight; sD[o + 1] = drag; sD[o + 2] = 0; sD[o + 3] = 0;
    sparkUntil = Math.max(sparkUntil, when + life);
    sparkDirty = true;
  }

  // ---- her colour: washed with the cyan as she goes, the cyan going off her as she is there again
  let tinted = null, tintFrom = 0, tintTo = 0, tintT0 = 0, tintLen = 0.06;
  function tint(ch, to, len, from = null) {
    if (!ch || !ch.tint) return;
    if (tinted && tinted !== ch) tinted.tint.set(0, 0, 0, 0);
    tinted = ch; tintFrom = from === null ? ch.tint.w : from; tintTo = to; tintT0 = clock; tintLen = Math.max(0.001, len);
    const c = BLINK_FX.tint.colour;
    ch.tint.set(c[0], c[1], c[2], tintFrom);
  }
  function stepTint() {
    if (!tinted) return;
    const u = clamp((clock - tintT0) / tintLen, 0, 1), w = tintFrom + (tintTo - tintFrom) * (tintTo > tintFrom ? u : 1 - Math.pow(1 - u, 2));
    tinted.tint.w = w;
    if (u >= 1 && tintTo === 0) { tinted.tint.set(0, 0, 0, 0); tinted = null; }
  }

  const stats = { blinks: 0, shapeMs: 0 };
  const way = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), across = new THREE.Vector3(), vA = new THREE.Vector3(), vB = new THREE.Vector3();
  let lastSize = 1;

  return {
    object,
    get busy() {
      return circles.some(c => c.on) || domes.some(d => d.on) || ghosts.some(g => g.on) || ribbons.some(r => r.on) || clock < sparkUntil || !!tinted;
    },
    get stats() { return { ...stats, clock: +clock.toFixed(3), drawn: object.children.filter(c => c.visible).length }; },
    begin(from, to, size = 1, character = null) {
      stats.blinks++;
      lastSize = size;
      openCircle(from, BLINK_FX.circle.r * size, { flashAt: 0.06 });
      tint(character, BLINK_FX.tint.most, 0.06);
    },
    vanish(from, to, travel, character = null) {
      const k = lastSize, F = BLINK_FX, S = F.sparks;
      vA.set(from.x, from.y, from.z); vB.set(to.x, to.y, to.z);
      way.subVectors(vB, vA); way.y = 0;
      const dist = way.length();
      if (dist > 1e-4) way.multiplyScalar(1 / dist); else way.set(0, 0, 1);
      const yaw = Math.atan2(way.x, way.z);
      across.crossVectors(up, way).normalize();               // (to her left as she goes)
      // ---- her afterimages: where she stood, and along her way
      if (character) {
        const shape = shapeOf(character, vA, yaw);
        const drift = vA.clone().addScaledVector(way, F.ghost.drift * k);
        leaveGhost(shape, vA, yaw, { life: F.ghost.life, alpha: F.ghost.alpha, lean: 0.05, drift, size: k });
        for (const s of F.ghost.along) {
          if (dist < 1.6 * k && s > 0.5) continue;            // (a short blink: one along it)
          const at = vA.clone().lerp(vB, s);
          // (she passes it this far into her travel: her way out is fast and slows as she comes)
          const when = clock + travel * (1 - Math.sqrt(1 - s));
          leaveGhost(shape, at, yaw, { when, life: F.ghost.alongLife, alpha: F.ghost.alongAlpha, lean: F.ghost.lean, drift: at.clone().addScaledVector(way, 0.08 * k), size: k });
        }
      }
      // ---- the dome where she stood, needles of light, sparks thrown out, dust at her feet
      burstDome(vA, F.dome.r * k);
      for (let i = 0; i < S.rays; i++) {
        const a = rand() * 6.28, tilt = between(0, 0.28);
        spark(vA.x + Math.cos(a) * between(0.05, 0.4) * k, vA.y + between(0.5, 1.1) * k, vA.z + Math.sin(a) * between(0.05, 0.4) * k,
          Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt), between(0.16, 0.24), between(0.014, 0.022) * k, between(1.3, 2.2) * k, 2);
      }
      for (let i = 0; i < S.needles; i++) {
        const a = rand() * 6.28, e = between(-0.1, 0.6);
        spark(vA.x, vA.y + 0.8 * k, vA.z, Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), between(0.1, 0.16), 0.012 * k, between(0.45, 0.85) * k, 2);
      }
      for (let i = 0; i < S.out; i++) {
        const a = rand() * 6.28, sp = between(2.6, 6.5) * k, e = between(0.05, 0.75), fwd = between(0, 0.6);
        const vx = Math.cos(a) * Math.cos(e) + way.x * fwd, vz = Math.sin(a) * Math.cos(e) + way.z * fwd;
        spark(vA.x + Math.cos(a) * 0.2 * k, vA.y + between(0.15, 1.2) * k, vA.z + Math.sin(a) * 0.2 * k, vx * sp, Math.sin(e) * sp, vz * sp,
          between(0.3, 0.6), between(0.018, 0.03) * k, 0.045, 0, -3 * k, 3.2);
      }
      for (let i = 0; i < S.puffs; i++) {
        const a = Math.atan2(-way.z, -way.x) + between(-0.9, 0.9);
        spark(vA.x + Math.cos(a) * 0.15 * k, vA.y + 0.12 * k, vA.z + Math.sin(a) * 0.15 * k, Math.cos(a) * between(0.6, 1.3) * k, between(0.2, 0.5) * k, Math.sin(a) * between(0.6, 1.3) * k,
          between(0.45, 0.65), between(0.16, 0.24) * k, 0, 3, 0, 2.5);
      }
      // ---- sparkles left along her way, hanging and drifting up
      const n = Math.round(S.along * dist / k);
      for (let i = 0; i < n; i++) {
        const s = rand(), when = clock + travel * (1 - Math.sqrt(1 - s)) * 0.9;
        spark(vA.x + (vB.x - vA.x) * s + across.x * between(-0.6, 0.6) * k, vA.y + (vB.y - vA.y) * s + between(0.15, 1.7) * k, vA.z + (vB.z - vA.z) * s + across.z * between(-0.6, 0.6) * k,
          way.x * between(0.2, 1.2) * k + between(-0.25, 0.25), between(0.2, 0.7) * k, way.z * between(0.2, 1.2) * k + between(-0.25, 0.25),
          between(0.9, 2.0), between(0.02, 0.04) * k, 0, 1, 0, 1.2, when);
      }
      // ---- the ribbons, streaking out along her way as she goes, lying along it a moment after (each keeps its own
      // way: the next blink's must not move it)
      const t0 = clock, T = travel, lag = F.lag, end = T + F.linger + 0.1;
      const A = vA.clone(), B = vB.clone(), side = across.clone();
      for (const R of F.trails) {
        const ph = R.phase + rand() * 0.6, tw = R.turns * 6.2832;
        const ribbonWay = (s, out) => {
          const swell = Math.pow(Math.sin(Math.PI * clamp(s, 0, 1)), 0.8), r = R.r * k * (0.35 + 0.65 * swell), th = ph + tw * s;
          out.copy(A).lerp(B, s);
          out.addScaledVector(up, (R.up + 0.12 * swell) * k + Math.sin(th) * r);
          out.addScaledVector(side, Math.cos(th) * r);
          return out;
        };
        const ease = u => 1 - Math.pow(1 - clamp(u, 0, 1), 2);
        layRibbon(ribbonWay, c => ease((c - t0) / T), c => ease((c - t0 - lag) / (T + F.linger)), R.wide * k, t0 + end);
      }
    },
    arrive(at, character = null) {
      const k = lastSize, F = BLINK_FX, S = F.sparks;
      vB.set(at.x, at.y, at.z);
      openCircle(vB, F.circle.rB * k, { flashAt: 0, fill: true });
      // sparks splashing up round her, and sparkles left hanging round her
      for (let i = 0; i < S.splash; i++) {
        const a = rand() * 6.28, sp = between(2.2, 5.2) * k, e = between(0.6, 1.35);
        spark(vB.x + Math.cos(a) * between(0.2, 0.85) * k, vB.y + 0.05 * k, vB.z + Math.sin(a) * between(0.2, 0.85) * k,
          Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, between(0.35, 0.7), between(0.016, 0.026) * k, 0.05, 0, -7 * k, 2.2);
      }
      for (let i = 0; i < S.hang; i++) {
        const a = rand() * 6.28, r = between(0.3, 1.4) * k;
        spark(vB.x + Math.cos(a) * r, vB.y + between(0.1, 1.7) * k, vB.z + Math.sin(a) * r, Math.cos(a) * between(0.1, 0.5), between(0.25, 0.8) * k, Math.sin(a) * between(0.1, 0.5),
          between(1.0, 2.2), between(0.02, 0.038) * k, 0, 1, 0, 1.2, clock + between(0, 0.25));
      }
      for (let i = 0; i < S.puffs; i++) {
        const a = rand() * 6.28;
        spark(vB.x + Math.cos(a) * 0.2 * k, vB.y + 0.1 * k, vB.z + Math.sin(a) * 0.2 * k, Math.cos(a) * between(0.8, 1.6) * k, between(0.1, 0.35) * k, Math.sin(a) * between(0.8, 1.6) * k,
          between(0.45, 0.7), between(0.15, 0.22) * k, 0, 3, 0, 3);
      }
      // two ribbons winding up round her
      const W = F.swirls, t0 = clock, ease = u => 1 - Math.pow(1 - clamp(u, 0, 1), 2), C = vB.clone();
      for (let j = 0; j < 2; j++) {
        const ph = j * Math.PI + rand() * 0.8, turn = (j ? -1 : 1) * W.turns * 6.2832;
        const swirlWay = (s, out) => {
          const r = W.r * k * (1 - 0.4 * s), th = ph + turn * s;
          return out.set(C.x + Math.cos(th) * r, C.y + (0.08 + W.up * s) * k, C.z + Math.sin(th) * r);
        };
        layRibbon(swirlWay, c => ease((c - t0) / W.grow), c => ease((c - t0 - W.lag) / (W.grow + W.linger)), W.wide * k, t0 + W.grow + W.linger + 0.1);
      }
      tint(character, 0, F.tint.back, F.tint.land);
    },
    prepare(character) { if (character) bodyOf(character); },
    stop(character = null) { if (character && character.tint && tinted === character) { character.tint.set(0, 0, 0, 0); tinted = null; } },
    update(dt, camera) {
      clock += dt;
      eye = camera;
      for (const c of circles) if (c.on) stepCircle(c);
      for (const d of domes) if (d.on) stepDome(d);
      for (const g of ghosts) if (g.on) stepGhost(g);
      if (eye) stepRibbons();
      sparkTime.value = clock;
      if (sparkDirty) { for (const a of [iA, iB, iC, iD]) a.needsUpdate = true; sparkDirty = false; }
      sparkMesh.visible = clock < sparkUntil;
      stepTint();
    },
    setNight(on) { night = !!on; colours.uShine.value = night ? 1.3 : 0.85; },
    dispose() {
      for (const m of made) m.dispose();
      square.dispose(); half.dispose(); ribbonGeo.dispose(); sparkGeo.dispose();
      for (const s of shapes) if (s.geo) s.geo.dispose();
    },
  };
}
