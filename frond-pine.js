/* ==========================================================================
   frond-pine.js  —  a fir of drooping fronds, painted like a storybook pine.
   One job: build that pine, one at a time or as a grove. (The hill village's pines.)

   How it is made (all in code, nothing drawn by hand)
     1. one frond = one ribbon card that never turns to the camera: it leaves the trunk, reaches out and droops at the
        tip, and is curved down across its width like a roof, so it is never flat seen from the side   -> FROND_VS
     2. the card is painted by two masks of brush strokes: long slim blades, pointed at both ends, that
        leave the rib and sweep forward to the edge, laid in no order over an underpainting of the
        frond's body. One mask stores where each stroke's middle is (a stroke takes ONE flat tone, as
        the anime tree's leaves do), the other its own shade: most strokes differ a little, so the
        light's edge is ragged; a few thin ones are a tone darker or lighter, the brush's lines        -> frondMasks()
     3. the light: a rounder roof than the card's own (its normal turns from one edge to the other, as a
        puff's ball lends its normal in the anime tree), tilted with the droop, with some of a cone round
        the whole spire. Sun and sky: what faces up is lit on the shaded side too. Each skirt shades the
        inner half of the one below. Stepped through the game pine's five tones                         -> FROND_FS
     4. skirts: rings of fronds, long and drooping low down, small and close toward the tip. Order and
        chance, about 70 to 30. The order: a cone, in skirts, and the fronds of a skirt in pairs across
        the trunk, so the outline is as wide on one side as the other from wherever it is seen. The
        chance: no even rhythm up the tree (skirts sit nearer or farther apart, one reaches out past
        the cone, the next stays in, one hangs, the next lifts), some skirts are thin and their fronds
        bunched, leaving gaps that show the shade inside; and every tree has its own height, breadth and
        number of skirts. Short dark fronds are tucked inside each ring, so a gap shows shade, never
        sky; the top is one pointed bud standing on the last small skirt                               -> characterOf(), buildFronds()
     5. the trunk and bark: the game pine's own (stylized-nature.js), lit by the same sun

   createFrondPine({ seed, detail }) -> Group
   createFrondPineForest([{ x, y, z, rotY, scale, seed, detail }, ...]) -> Group
        a whole grove in two or three draw calls (the bark, the near trees' fronds, the far trees'). Each tree is one of
        VARIANTS shapes (picked by seed), copied into place, turned and sized. detail under 0.8 (a tree she never comes
        near): fewer skirts of fewer, wider fronds on plainer cards, under half the triangles.
   setFrondPineSun(vec3)   world direction toward the sun (as setAnimeSun)
   setFrondPineBrush(on)   the fronds' tones laid in long brush strokes over the whole tree (on, as it starts; off: as they were): see BRUSH
   every frame: stylized-nature's update(dt) (time + wind are shared with the other plants)
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, uniforms as natureUniforms, growTreeFrame, treeSpec, NATURE_VCOMMON, NATURE_HAZEF, _internal as natureInternal } from './stylized-nature.js';
import { ANIME_PALETTES } from './anime-tree.js';

const range = (rng, a, b) => a + rng() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.min(1, Math.max(0, v));
const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const H = 11.6;                   // a middling tree's height (each has its own: characterOf)

// one sun for these pines (fronds and bark)
const SUN = { value: new THREE.Vector3(-0.55, 0.7, 0.45).normalize() };
export function setFrondPineSun(v) {
  SUN.value.copy(v);
  if (SUN.value.y < 0.12) SUN.value.y = 0.12;                       // (lit from below the horizon, the skirts would glow underneath)
  SUN.value.normalize();
}

// BRUSH: the tones as a brush lays them, as the anime trees' leaves (anime-tree.js, BRUSH) and the grass's painterly look.
// The fronds keep their own shape, their strokes and the masks they are painted by: nothing else is drawn. Only where the
// light steps from one flat tone to the next moves, by long patches that lean the same way all over the tree (from each
// stroke's middle, so a stroke keeps one tone): a stroke of light or of shade runs over several fronds at once. Each
// stroke's own little shade is mostly left out; the thin dark and light accents stay
const BRUSH = { value: 1 };
export function setFrondPineBrush(on = true) { BRUSH.value = on ? 1 : 0; }
export const frondPineBrush = () => BRUSH.value > 0.5;

// the look, in one place
export const FROND_LOOK = {
  round: { value: 1.25 },         // how far a frond's normal turns from its rib to its edge (radians): light one side, shade the other
  jitter: { value: 0.3 },         // each stroke's normal turned a little its own way (radians): the light's edge is ragged
  pop: { value: 0.46 },           // how far a stroke's own shade moves it: most a little, the thin accents about a tone
  coneMix: { value: 0.42 },       // how much of the spire's cone the light takes (more: each skirt lit as one)
  coneUp: { value: 0.55 },        // how steep that cone faces up
  // two lights: the sun, and the sky from straight above. The sky lights whatever faces up wherever it is, so on the side
  // away from the sun the skirts still show their tops and the tree is never one dark mass
  lightW: { value: 0.6 }, skyW: { value: 0.3 }, heightW: { value: 0.22 }, under: { value: 0.16 },
  // the shade a skirt throws on the one below. Seen from the side, a frond shows only its outer part: the rest is behind
  // the hanging tips of the skirt above. The shade covers the top of that showing part (each frond knows how far out, see
  // buildFronds) and ends in a short step, not a slow fade: under every skirt's bright tips lies a dark band, so the
  // skirts read one by one from afar, on the sunny side and the shaded one alike
  aoW: { value: 0.5 }, aoSoft: { value: 0.2 },
  bias: { value: 0.01 },          // the whole tree lighter (+) or deeper (-)
  brush: { value: 0.4 },          // BRUSH: how far a brush stroke moves a tone
  soft: { value: 2.0 },           // BRUSH: how soft a stroke's edge (times as wide as it is otherwise)
};

// --------------------------------------------------------------------------
// the masks: four fronds, one under the other
//   mask:  r = coverage, g/b = where that stroke's middle is (along 0..1, across 0..1)
//   tone:  r = the stroke's own shade (0.5 = none), g = its own turn of the light, b = coverage
// Everything but coverage is stored times coverage, so it blurs the right way into mipmaps; and the shader only ever
// reads these smoothly (no random number is made from them), so where two strokes meet the tone is one or the other,
// never a dotted line of a third.
// --------------------------------------------------------------------------
const CELLS = 4, CW = 1024, CH = 512;     // (a texel is about as long along the frond as across it)
const ASPECT = 0.48;              // a frond card's full width / its length
const HW = ASPECT / 2;
const HWS = HW * 0.8;             // the painted frond's half width at its widest: the card leaves air round it, no stroke is cut off
let masks = null;
// the frond's half width along it (0..1 of HWS): slim at the trunk, full a third of the way out, a point at the tip
const profile = s => s < 0.36 ? 0.3 + 0.7 * Math.sin(s / 0.36 * Math.PI / 2) : Math.pow(Math.cos((Math.min(s, 1) - 0.36) / 0.64 * Math.PI / 2), 0.8);
// one brush stroke: a slim blade, pointed at both ends, bowed a little to one side (wid: its width at the middle)
function bladePath(g, len, wid, bow) {
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.42, bow - wid, len, 0);
  g.quadraticCurveTo(len * 0.42, bow + wid, 0, 0);
  g.closePath();
}
function frondMasks() {
  if (masks) return masks;
  const mk = () => { const c = document.createElement('canvas'); c.width = CW; c.height = CH * CELLS; return c; };
  const ca = mk(), cb = mk(), ga = ca.getContext('2d'), gb = cb.getContext('2d');
  // the underpainting: the frond's body, well inside its outline, lit as the card itself there: no gap between strokes
  // ever shows the sky
  const ia = ga.createImageData(CW, CH * CELLS), ib = gb.createImageData(CW, CH * CELLS);
  for (let v = 0; v < CELLS; v++) for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const o = ((v * CH + y) * CW + x) * 4, s = (x + 0.5) / CW, yy = (y + 0.5 - CH / 2) * ASPECT / CH;
    ia.data[o + 3] = ib.data[o + 3] = 255;
    if (s > 0.92 || Math.abs(yy) > HWS * profile(s) * 0.66) continue;
    ia.data[o] = 255; ia.data[o + 1] = Math.round(s * 255); ia.data[o + 2] = Math.round((y + 0.5) / CH * 255);
    ib.data[o] = 128; ib.data[o + 1] = 128; ib.data[o + 2] = 255;
  }
  ga.putImageData(ia, 0, 0); gb.putImageData(ib, 0, 0);
  for (let v = 0; v < CELLS; v++) {
    const rng = mulberry32(7331 + v * 977), oy = v * CH, S = [];
    // a stroke: most a little lighter or darker than the next; one in ten a thin dark line, one in eight a thin light one
    const put = (x, y, ang, len, wid, bow, plain = false) => {
      const k = plain ? 1 : rng();
      const acc = k < 0.1 ? -1 : k < 0.23 ? 1 : 0;
      const tone = acc < 0 ? range(rng, 0.04, 0.18) : acc > 0 ? range(rng, 0.84, 0.98) : 0.5 + (rng() - 0.5) * 0.38;
      S.push({ x, y, ang, len, wid: Math.max(0.005, wid * (acc ? 0.55 : 1)), bow, tone, turn: rng(), acc: acc ? 1 : 0 });
    };
    // the rib: long thin strokes down the middle
    for (let s0 = 0; s0 < 0.76; s0 += range(rng, 0.07, 0.11)) {
      const len = Math.min(range(rng, 0.22, 0.34), 0.97 - s0);
      put(s0, range(rng, -0.006, 0.006), range(rng, -0.04, 0.04), len, range(rng, 0.014, 0.02), range(rng, -0.012, 0.012), true);
    }
    // the barbs: blades that leave the rib and sweep forward, wide-angled near the trunk and laid nearly along the frond
    // toward its tip, bowed forward as a feather's are. Most land their point on (or a little past) the outline, a
    // ragged, feathery edge; the rest stop short inside
    for (let s0 = 0; s0 < 0.88; s0 += range(rng, 0.011, 0.017)) {
      for (const side of rng() < 0.5 ? [-1, 1] : [1, -1]) {
        const a = (lerp(36, 9, s0 / 0.88) + range(rng, -6, 6)) * Math.PI / 180;
        const y0 = side * HWS * profile(s0) * range(rng, 0, 0.25);
        const far = rng() < 0.6 ? range(rng, 0.85, 1.12) : range(rng, 0.4, 0.75);
        let len = 0.25;
        for (let it = 0; it < 2; it++) {
          const reach = HWS * profile(Math.min(0.99, s0 + len * Math.cos(a))) * far;
          len = Math.min(Math.max(0.05, (reach - Math.abs(y0)) / Math.sin(a)), 0.5, (0.99 - s0) / Math.cos(a));
        }
        put(s0, y0, side * a, len, len * range(rng, 0.06, 0.09), side * len * range(rng, 0.04, 0.14));
      }
    }
    // the fringe: short thin blades along the edge, pointing forward and out
    for (let i = 0; i < 64; i++) {
      const s0 = range(rng, 0.05, 0.9), side = rng() < 0.5 ? -1 : 1;
      const y0 = side * HWS * profile(s0) * range(rng, 0.55, 0.9);
      const a = (lerp(34, 12, s0) + range(rng, -8, 8)) * Math.PI / 180;
      const len = Math.min(range(rng, 0.05, 0.1) * (1.15 - s0 * 0.5), (0.995 - s0) / Math.cos(a));
      put(s0, y0, side * a, len, len * range(rng, 0.07, 0.1), side * len * range(rng, 0.03, 0.1));
    }
    // the tip splits into a few hairs
    for (let i = 0; i < 8; i++) {
      const s0 = range(rng, 0.78, 0.9), a = range(rng, -0.2, 0.2);
      put(s0, range(rng, -0.012, 0.012), a, Math.min(range(rng, 0.08, 0.18), (0.995 - s0) / Math.cos(a)), range(rng, 0.007, 0.012), 0);
    }
    // laid in no order (no row of strokes lies on the next like roof tiles), the thin accents last
    for (let i = S.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [S[i], S[j]] = [S[j], S[i]]; }
    S.sort((p, q) => p.acc - q.acc);
    for (const g of [ga, gb]) { g.save(); g.beginPath(); g.rect(0, oy + 1, CW, CH - 2); g.clip(); }
    for (const k of S) {
      const cs = Math.cos(k.ang), sn = Math.sin(k.ang), lx = k.len * 0.5, ly = k.bow * 0.25;     // the stroke's middle
      const mx = clamp01(k.x + cs * lx - sn * ly), my = clamp01((k.y + sn * lx + cs * ly) / ASPECT + 0.5);
      ga.fillStyle = `rgb(255, ${Math.round(mx * 255)}, ${Math.round(my * 255)})`;
      gb.fillStyle = `rgb(${Math.round(k.tone * 255)}, ${Math.round(k.turn * 255)}, 255)`;
      for (const g of [ga, gb]) {
        g.setTransform(CW, 0, 0, CH / ASPECT, 0, oy + CH / 2);       // drawn in the frond's own units (length 1, width ASPECT)
        g.translate(k.x, k.y); g.rotate(k.ang);
        bladePath(g, k.len, k.wid, k.bow);
        g.fill();
      }
    }
    for (const g of [ga, gb]) g.restore();
  }
  const tex = c => {
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    return t;
  };
  return (masks = { mask: tex(ca), tone: tex(cb) });
}

// --------------------------------------------------------------------------
// shaders
// --------------------------------------------------------------------------
const FROND_VS = /* glsl */`
${NATURE_VCOMMON}
uniform vec3 uSun;
attribute vec4 iRoot;     // xyz: where the frond leaves the trunk (mesh space), w: its mask (0..3)
attribute vec4 iFrond;    // x: heading (radians), y: length, z: half width, w: rise at the root
attribute vec4 iBend;     // x: droop, y: roof (how far the edges curve away from its top; under 0: cupped), z: sideways curl, w: roll
attribute vec4 iShade;    // x: height in the tree (0..1 at the root), y: how deep the shade of the skirt above, z: how far out along the frond it reaches, w: seed
attribute vec4 iBase;     // plant foot + scale; (0,0,0,1) for a single plant
varying vec2 vUv;
varying vec3 vDir;
varying vec3 vSide;
varying vec4 vFrond;
varying vec4 vBend;
varying vec4 vShade;
varying vec3 vSun;
varying float vOut;
varying vec3 vRoot;
void main() {
  float s = position.x + 0.5, u = position.y * 2.0;               // along the frond 0..1, across -1..1
  float L = iFrond.y, W = iFrond.z, e = iFrond.w;
  vec3 dir = vec3(cos(iFrond.x), 0.0, sin(iFrond.x));
  vec3 side = vec3(sin(iFrond.x), 0.0, -cos(iFrond.x));            // (dir, side, up) turn the right way: the card's front is its top
  // the rib reaches out and droops ever more toward the tip; the card curves away from the rib's own top to both edges
  vec3 top = normalize(vec3(0.0, 1.0 - 0.16 * s, 0.0) - dir * (e - 2.0 * iBend.x * s));
  vec3 p = iRoot.xyz + dir * (L * s * (1.0 - 0.08 * s)) + vec3(0.0, L * (e * s - iBend.x * s * s), 0.0)
         + side * (u * W + iBend.z * s * s * L) + top * (W * (iBend.w * u - iBend.y * u * u));
  // wind: the whole tree sways as the game's plants do, and each frond's outer half bobs on its own
  float ph = objPhase() + iBase.x * 0.37 + iBase.z * 0.23;
  p += windOffset((p - iBase.xyz) / iBase.w, ph) * iBase.w;
  p.y += sin(uTime * 2.2 + iShade.w * 40.0 + ph) * 0.045 * min(L, 3.0) * s * s * uWind;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vHaze = hazeAt(mv.xyz);
  gl_Position = projectionMatrix * mv;
  vUv = vec2(s, 1.0 - (iRoot.w + 0.5 + 0.5 * u) * 0.25);
  vDir = dir; vSide = side; vFrond = iFrond; vBend = iBend; vShade = iShade; vRoot = iRoot.xyz;
  vOut = dot(iRoot.xz - iBase.xz, dir.xz) < 0.0 ? -1.0 : 1.0;     // most fronds head out from the trunk; the bud's lean in over it
  vSun = normalize(uSun * mat3(modelMatrix));
}`;

const FROND_FS = /* glsl */`
${NATURE_HAZEF}
${natureInternal.NOISE}
uniform sampler2D uMask, uTone;
uniform float uBrush, uBrushW, uSoft;      // the tones laid in brush strokes (see BRUSH), how far a stroke moves a tone, how soft its edge
uniform vec3 uC0, uC1, uC2, uC3, uC4;
uniform vec4 uStep;       // where each flat tone starts
uniform float uRound, uJitter, uPop, uConeMix, uConeUp, uLightW, uSkyW, uHeightW, uAOW, uAoSoft, uUnder, uBias;
varying vec2 vUv;
varying vec3 vDir;
varying vec3 vSide;
varying vec4 vFrond;
varying vec4 vBend;
varying vec4 vShade;
varying vec3 vSun;
varying float vOut;
varying vec3 vRoot;
void main() {
  vec3 t = texture2D(uMask, vUv, -0.5).rgb;                       // (a little sharper than the mip would be: crisp stroke points)
  float w = max(fwidth(t.r), 1e-3) * 0.75 * mix(1.0, uSoft, uBrush);
  float alpha = smoothstep(0.5 - w, 0.5 + w, t.r);
  if (alpha < 0.02) discard;
  vec3 k = texture2D(uTone, vUv, -0.5).rgb;
  vec2 m = t.gb / max(t.r, 0.05);                                 // this stroke's middle: every pixel of one stroke is lit alike
  vec2 own = k.rg / max(k.b, 0.05) - 0.5;                         // its own shade, and its own turn of the light
  float s = m.x, u = m.y * 2.0 - 1.0;
  float e = vFrond.w, d = vBend.x;
  // the rib's own top there (tilted out as the frond droops), turned toward the edge the stroke sits on
  vec3 n0 = normalize(vec3(0.0, 1.0 - 0.16 * s, 0.0) - vDir * (e - 2.0 * d * s));
  float th = u * uRound * sign(vBend.y) + vBend.w + own.y * uJitter;
  vec3 n = n0 * cos(th) + vSide * sin(th);
  if (!gl_FrontFacing) n = -n;                                    // seen from its other side
  float under = gl_FrontFacing ? 0.0 : uUnder * smoothstep(0.2, 0.7, -n.y);      // a level frond's underside: a touch deeper still
  float sky = n.y * 0.5 + 0.5;                                    // the sky's light: on whatever faces up, sun or no sun
  // ... the sun's, with some of the cone round the whole spire
  n = normalize(mix(n, normalize(vDir * vOut + vec3(0.0, uConeUp, 0.0)), uConeMix));
  float lam = dot(n, vSun) * 0.5 + 0.5;
  float h = vShade.x + vFrond.y * (e * s - d * s * s) * 0.1;      // up the spire: lighter
  float ao = vShade.y * (1.0 - smoothstep(vShade.z - uAoSoft, vShade.z, s));     // under the skirt above: in its shade
  float v = lam * uLightW + sky * uSkyW + h * uHeightW - ao * uAOW + own.x * uPop + uBias - under;
  if (uBrush > 0.5) {
    // BRUSH: long patches leaning one way over the whole tree, from the stroke's middle (where the frond lays it, mesh space)
    vec3 q = vRoot + vDir * (vFrond.y * s * (1.0 - 0.08 * s)) + vec3(0.0, vFrond.y * (e * s - d * s * s), 0.0)
           + vSide * (u * vFrond.z + vBend.z * s * s * vFrond.y);
    vec2 sq = vec2(q.x * 0.8 + q.z * 0.6 + q.y * 0.45, q.y - (q.x * 0.6 - q.z * 0.8) * 0.3);
    float stroke = noise2(vec2(sq.x * 0.7, sq.y * 2.1)) * 0.65 + noise2(vec2(sq.x * 1.7 + 5.0, sq.y * 4.8)) * 0.35;
    v += (stroke - 0.5) * uBrushW - own.x * uPop * 0.6 * (1.0 - step(0.25, abs(own.x)));     // (the accents keep their own)
  }
  vec3 col = uC0;                                                  // the game pine's five flat tones
  col = mix(col, uC1, step(uStep.x, v));
  col = mix(col, uC2, step(uStep.y, v));
  col = mix(col, uC3, step(uStep.z, v));
  col = mix(col, uC4, step(uStep.w, v));
  gl_FragColor = vec4(mix(col, uHaze, vHaze), alpha);
}`;

let material = null;
function frondMaterial() {
  if (material) return material;
  const P = ANIME_PALETTES.pine, pal = P.tones.map(rgb), K = FROND_LOOK, M = frondMasks();
  material = new THREE.ShaderMaterial({
    uniforms: {
      ...natureUniforms, uSun: SUN, uMask: { value: M.mask }, uTone: { value: M.tone },
      uC0: { value: pal[0] }, uC1: { value: pal[1] }, uC2: { value: pal[2] }, uC3: { value: pal[3] }, uC4: { value: pal[4] },
      uStep: { value: new THREE.Vector4(...P.steps) },
      uRound: K.round, uJitter: K.jitter, uPop: K.pop, uConeMix: K.coneMix, uConeUp: K.coneUp, uLightW: K.lightW, uSkyW: K.skyW,
      uHeightW: K.heightW, uAOW: K.aoW, uAoSoft: K.aoSoft, uUnder: K.under, uBias: K.bias, uBrush: BRUSH, uBrushW: K.brush, uSoft: K.soft,
    },
    vertexShader: FROND_VS, fragmentShader: FROND_FS, alphaToCoverage: true, side: THREE.DoubleSide,
  });
  return material;
}

// --------------------------------------------------------------------------
// the fronds of one tree (mesh space). R root + mask, F heading/length/width/rise, B droop/roof/curl/roll, S shade
// --------------------------------------------------------------------------
// what makes one pine unlike the next, from its seed
function characterOf(seed) {
  const rng = mulberry32(seed * 7717 + 3);
  const wide = range(rng, 0.88, 1.14);    // slim or broad
  return {
    top: range(rng, 10.0, 11.5),          // where the bud stands (the leader ends just under it)
    first: 1.0 + 1.9 * wide + range(rng, 0, 0.4),   // the lowest skirt's height: a broad tree's long fronds start higher, to hang clear of the grass
    wide,
    taper: range(rng, 0.95, 1.2),         // straight-sided, or drawn in toward the tip
    skirts: 13 + Math.floor(rng() * 4),   // 13 to 16
    droop: range(rng, -0.08, 0.08),       // its fronds a little more lifted, or more hanging
  };
}

const CLEAR = 1.0;                // no frond's tip hangs lower than this above the tree's foot
// far: the tree as it is drawn where she never comes near it: two skirts fewer, three pairs of wider fronds to a skirt
function buildFronds(seed, far = false) {
  const C = characterOf(seed), rng = mulberry32(seed * 977 + 13);
  const F = { R: [], F: [], B: [], S: [], height: C.top + 0.6 }, WF = far ? 1.45 : 1;
  const add = (a, L, y, rootR, o) => {
    // never down into the grass: a frond whose tip would hang lower than CLEAR lifts it (one tucked inside is cut short)
    let d = o.d;
    if (y + L * (o.e - d) < CLEAR) { if (o.inner) L = Math.max(0.2, (y - CLEAR) / (d - o.e)); else d = Math.max(0.12, o.e + (y - CLEAR) / L); }
    F.R.push(Math.cos(a) * rootR, y, Math.sin(a) * rootR, Math.floor(rng() * CELLS));
    const Lr = L * (Math.hypot(1, o.e) + Math.hypot(1, o.e - 2 * d)) / 2;          // its length along the bend
    F.F.push(a, L, (o.w ?? Lr * HW * range(rng, 0.92, 1.08)) * WF, o.e);
    F.B.push(d, o.roof ?? range(rng, 0.35, 0.55), range(rng, -0.12, 0.12), range(rng, -0.12, 0.12));
    F.S.push(0.15 + (y - 1.6) / (H - 1.6), o.ao, o.edge ?? 1.3, rng());                // (no edge given: in shade all along)
  };
  const K = far ? Math.max(11, C.skirts - 2) : C.skirts, Y0 = C.first, Y1 = C.top, ph0 = rng() * 6.28;
  // skirts far apart low down, close together toward the tip ...
  const even = [];
  let yLast = 0;
  for (let k = 0; k < K; k++) { const q = k / (K - 1); even.push(Y0 + (Y1 - Y0) * (0.6 * q + 0.4 * (1 - (1 - q) * (1 - q)))); }
  for (let k = 0; k < K; k++) {
    const q = k / (K - 1);
    // ... but in no even rhythm: each sits up to a quarter of the gap nearer one neighbour than the other (the last few
    // under the bud keep their places)
    const gap = k > 0 && k < K - 1 ? Math.min(even[k] - even[k - 1], even[k + 1] - even[k]) : 0;
    const y = even[k] + (rng() - 0.5) * 0.55 * gap * (1 - 0.7 * q);
    // long and drooping low down, small steep chevrons up top; one skirt reaches out past the cone, the next stays in
    const L = (2.85 * Math.pow(1 - q * 0.94, C.taper) + 0.2) * C.wide * range(rng, 0.9, k ? 1.1 : 1.0);     // (the lowest stays within the cone)
    // an even number of fronds, in pairs that face each other across the trunk, the two of a pair alike in length and
    // droop: from any side a skirt reaches as far left as it does right. How many, and how they are spread, is the skirt's
    // own: about a third are thin, a fifth thick; in some the pairs stand evenly round, in others they bunch and leave gaps
    let n = Math.max(8, 2 * Math.round((4.5 + L * 1.9) / 2));
    const thick = rng(), bunch = range(rng, 0.25, far ? 0.45 : 0.9);
    if (far) n = 6; else if (q < 0.75) n += thick < 0.32 ? -2 : thick > 0.8 ? 2 : 0;
    const e0 = lerp(0.1, -0.55, Math.pow(q, 1.4)) + C.droop + range(rng, -0.1, 0.1), d0 = lerp(0.55, 0.42, q) * range(rng, 0.88, 1.14);
    const ph = ph0 + k * 2.39996;
    const tip = L * range(rng, 0.01, 0.03), tph = rng() * 6.28;
    // how far out the shade of the skirt above reaches along these fronds: low down the skirts hang deep over one another
    // and only the outer third of a frond shows; up the spire they are short and more of each shows
    const edge = lerp(0.77, 0.62, q) - (far ? 0.05 : 0);      // (a far tree's skirts stand further apart: more of each frond shows)
    for (let i = 0; i < n / 2; i++) {
      const a0 = ph + (i + (rng() - 0.5) * bunch) / n * Math.PI * 2;
      const len = L * range(rng, 0.9, 1.1), e = e0 + range(rng, -0.07, 0.07), d = d0 * range(rng, 0.9, 1.1);
      for (let j = 0; j < 2; j++) {
        const a = a0 + j * Math.PI + (rng() - 0.5) * 0.06;
        add(a, len * range(rng, 0.975, 1.025), y + tip * Math.cos(a - tph) + (rng() - 0.5) * 0.08 * (1 - q * 0.7), 0.06,
          { e: e + range(rng, -0.03, 0.03), d: d * range(rng, 0.96, 1.04), ao: lerp(0.78, 0.6, q), edge: edge + range(rng, -0.04, 0.04) });
      }
    }
    // the shade inside: short dark fronds tucked under the skirt, down the whole gap to the skirt below and more of them
    // where that gap is wide: what shows between two skirts, or through a thin one, is shade, never the sky beyond
    const below = k ? y - yLast : 0.6, m = far ? 6 : Math.round(Math.max(n, 8) * (0.55 + 0.3 * below));
    for (let i = 0; i < m; i++) {
      const a = ph + (i + 0.5 + (rng() - 0.5) * 0.6) / m * Math.PI * 2;
      add(a, L * range(rng, 0.4, 0.58), y - range(rng, 0.1, Math.max(0.35, below * 0.9)) * (1 - q * 0.5), 0.05, { e: e0 - 0.25, d: d0 + 0.25, ao: 1.0, inner: true });
    }
    yLast = y;
    // up the spire, the leader wears a collar at each skirt: small fronds rooted just above it that hang close down along
    // the leader, widest where the skirt's own fronds are still slim, so no bare wood shows between the skirts
    const collar = far ? 4 : 5;
    if (q > (far ? 0.2 : 0.45)) for (let i = 0; i < collar; i++) {      // (a far tree's thin skirts hide less of the leader: its collars start lower)
      const a = ph + 0.8 + (i + rng() * 0.6) / collar * Math.PI * 2;
      add(a, Math.max(0.1, L * 0.2), y + 0.12, 0.02, { e: -3.0, d: 0.3, ao: 0.9, w: Math.max(0.075, L * 0.12) });
    }
  }
  // the top: one pointed bud. Three small fronds stand round the leader's tip, each rooted on the far side of it and
  // leaning in, so they close over it and meet in one point, cupped round it; three smaller ones between them fill its foot
  const yb = Y1 - 0.1, ab = ph0 + 1.0;
  for (let i = 0; i < (far ? 3 : 6); i++) {
    const inner = i >= 3, R = inner ? 0.06 : 0.08, tall = inner ? range(rng, 0.3, 0.36) : range(rng, 0.5, 0.56);
    const a = ab + (i % 3) / 3 * Math.PI * 2 + (inner ? Math.PI / 3 : 0) + (rng() - 0.5) * 0.3;
    add(a, R, yb + range(rng, 0, 0.04), -R, { e: tall / R + 0.4, d: 0.4, ao: 0.0, roof: 0.4, w: inner ? 0.1 : range(rng, 0.12, 0.14) });
  }
  // ... and its point: two slender fronds, crossed, standing in the bud's mouth
  for (let i = 0; i < (far ? 1 : 2); i++) add(ab + 0.5 + i * Math.PI / 2, 0.02, yb + 0.3, -0.02, { e: range(rng, 18, 20), d: 0.4, ao: 0.0, roof: 0.3, w: 0.055 });
  return F;
}

// one frond's card. x: along the frond, y: across (the middle row is the rib; the light is rounder than the card). A far
// tree's card bends in half as many places along it
const SEG = new THREE.PlaneGeometry(1, 1, 8, 2), SEG_FAR = new THREE.PlaneGeometry(1, 1, 4, 2);
function frondGeometry({ R, F, B, S, base = null }, far = false) {
  const g = new THREE.InstancedBufferGeometry(), seg = far ? SEG_FAR : SEG;
  g.index = seg.index;
  g.setAttribute('position', seg.attributes.position);
  const n = R.length / 4;
  if (!base) { base = new Float32Array(n * 4); for (let i = 3; i < base.length; i += 4) base[i] = 1; }
  g.setAttribute('iRoot', new THREE.InstancedBufferAttribute(new Float32Array(R), 4));
  g.setAttribute('iFrond', new THREE.InstancedBufferAttribute(new Float32Array(F), 4));
  g.setAttribute('iBend', new THREE.InstancedBufferAttribute(new Float32Array(B), 4));
  g.setAttribute('iShade', new THREE.InstancedBufferAttribute(new Float32Array(S), 4));
  g.setAttribute('iBase', new THREE.InstancedBufferAttribute(base instanceof Float32Array ? base : new Float32Array(base), 4));
  g.instanceCount = n;
  return g;
}

// the game pine's trunk and bark, lit by this sun, made for this crown: as tall as this tree, dead straight (the fronds
// are rooted on the tree's axis, a wandering stem would show beside them), with a slim leader that runs out to a point
// and ends inside the bud; the bark under the skirts is shaded from where they start
function trunkOf(seed) {
  const spec = treeSpec('pine'), C = characterOf(seed);
  const tops = spec.trunk.pts[spec.trunk.pts.length - 1][1];
  const slim = { ...spec, trunk: { ...spec.trunk, sway: 0, lean: 0.03,
    pts: spec.trunk.pts.map(([, y], i) => [0, i === 0 ? y : y / tops * (C.top - 0.05), 0]),
    radius: t => 0.2 * Math.pow(1 - t, 0.9) + 0.012 + 0.13 * Math.exp(-t * 30) } };
  const { trunk } = growTreeFrame(slim, seed);
  trunk.material.uniforms.uLight = SUN;
  trunk.material.uniforms.uShadeY.value = C.first - 0.3;
  return trunk;
}

// --------------------------------------------------------------------------
export function createFrondPine({ seed = 1, detail = 1 } = {}) {
  const trunk = trunkOf(seed), far = detail < 0.8;
  const F = buildFronds(seed, far);
  const fronds = new THREE.Mesh(frondGeometry(F, far), frondMaterial());
  fronds.frustumCulled = false; fronds.name = 'frond_pine_fronds';
  const group = new THREE.Group();
  group.add(trunk, fronds);
  group.name = 'frond_pine';
  group.userData = {
    kind: 'tree', type: 'frondPine', height: F.height, fronds: F.R.length / 4,
    dispose() { trunk.geometry.dispose(); trunk.material.dispose(); fronds.geometry.dispose(); },
  };
  return group;
}

// a grove: every tree is one of a few shapes (built once, kept), copied into place, turned and sized
const VARIANTS = 6;
const shapes = {};
const shapeOf = (v, far) => shapes[v + (far ? 'f' : 'n')] || (shapes[v + (far ? 'f' : 'n')] = { F: buildFronds(v + 1, far), trunk: trunkOf(v + 1) });
export function createFrondPineForest(list) {
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S3 = new THREE.Vector3(), T3 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const batch = () => ({ R: [], F: [], B: [], S: [], base: [] }), out = [batch(), batch()], geos = [];      // the near trees' fronds, the far trees'
  let barkMat = null;
  for (const e of list) {
    const s = e.scale ?? 1, rot = e.rotY ?? 0, far = (e.detail ?? 1) < 0.8, part = shapeOf(Math.abs(Math.round(e.seed ?? 0)) % VARIANTS, far), F = part.F, o = out[far ? 1 : 0];
    M.compose(T3.set(e.x, e.y, e.z), Q.setFromAxisAngle(UP, rot), S3.set(s, s, s));
    for (let i = 0; i < F.R.length / 4; i++) {
      V.set(F.R[i * 4], F.R[i * 4 + 1], F.R[i * 4 + 2]).applyMatrix4(M);
      o.R.push(V.x, V.y, V.z, F.R[i * 4 + 3]);
      o.F.push(F.F[i * 4] - rot, F.F[i * 4 + 1] * s, F.F[i * 4 + 2] * s, F.F[i * 4 + 3]);   // a turn about up: the heading turns back
      o.B.push(F.B[i * 4], F.B[i * 4 + 1], F.B[i * 4 + 2], F.B[i * 4 + 3]);
      o.S.push(F.S[i * 4], F.S[i * 4 + 1], F.S[i * 4 + 2], F.S[i * 4 + 3]);
      o.base.push(e.x, e.y, e.z, s);
    }
    const g = part.trunk.geometry.clone();
    g.applyMatrix4(M);
    if (g.attributes.aCtr) g.attributes.aCtr.applyMatrix4(M);
    if (g.attributes.aAx) g.attributes.aAx.applyMatrix4(M);
    const ab = g.attributes.aBase;
    for (let i = 0; i < ab.count; i++) ab.setXYZW(i, e.x, e.y, e.z, s);
    geos.push(g);
    barkMat = barkMat || part.trunk.material;
  }
  const group = new THREE.Group(), owned = [];
  const add = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.name = name; group.add(m); owned.push(geo); };
  if (geos.length) { add(mergeGeometries(geos), barkMat, 'frond_pine_bark'); geos.forEach(g => g.dispose()); }
  out.forEach((o, far) => { if (o.R.length) add(frondGeometry(o, !!far), frondMaterial(), far ? 'frond_pine_fronds_far' : 'frond_pine_fronds'); });
  group.name = 'frond_pine_forest';
  group.userData = { kind: 'forest', plants: list.length, fronds: (out[0].R.length + out[1].R.length) / 4, drawCalls: group.children.length, dispose() { owned.forEach(g => g.dispose()); } };
  return group;
}
