/* ==========================================================================
   barrier-fx.js  —  everything Vivi's water barrier draws, as in the barrier clip she is cast with (the clip of her
   own moves: Barrier_Cast, tools/make-barrier-anim.py): water gathered into a ball in her hand, ribbons of it turning
   round her and drops with them; the ribbons drawn up to the hand as it is thrown up over her head, a whirl of water
   turning flat over it; then the water breaks out of the ground round her, a column of it going up past her, splash
   crowns at its foot, a sheet of water running out over the ground; the column's head opens and pours down all round
   as a dome, thick with water (strokes of froth swept round it, splash crowns thrown up round its foot, small clouds
   of spray where it lands);
   the water runs off it and a clear bubble is left, long lights sweeping round it, drops hanging inside, a ring on the
   ground at its foot; then the bubble goes from its top down, the drops fall, and the ring is the last to go.
   One job: draw that. It decides nothing: whoever casts says when (t) and where (her feet, her hand); this follows.

     const fx = createBarrierFx({ radius, lift, seed })   radius: the barrier's (metres). lift: metres the water on the
                                                          ground lies over the ground (over the grass's tips)
     scene.add(fx.object)
     every frame: fx.update(dt, renderer, camera, t, at, hand)   t: seconds into the cast (the clip's own time), or < 0
                                                          when there is none; it goes on being fed until BARRIER.gone.
                                                          at: her feet (world). hand: the hand that casts (world)
     fx.shake                                             0..1: how hard the ground jolts now (the camera's to shake)
     fx.wind                                              0..1: how hard the water's draught lifts what hangs on her
                                                          (her hair, her skirt: the caster's to use, if it likes)
     fx.setSun(vec3), fx.setLight(r, g, b)                the light of the hour (1, 1, 1 by day): the water is dimmed
                                                          by it, the cold light in it is not
     fx.busy (anything of it still to be seen), fx.dispose()

   The beats are BARRIER (below): the clip's, to which its pictures are drawn. Change one, change the other.

   How it is drawn: as the game's own water is. Every sheet of it is lit by water-droplets.js's rule for thrown water
   (clear and turquoise, the sky on its rim, a glint of sun, white only where water is white: its froth, its lip, its
   foot), in WATER_LOOK's colours; its splash crowns and flying drops are water-droplets.js's own, and the clouds of
   spray at its foot stylized-waterfall.js's billows. What is new is only the cold blue light in it (BARRIER_LOOK.spark:
   on its rims, in the ball, in the glints), which is what says it is a spell and not a splash.
     - the dome: half a ball, drawn twice (its far wall, then its near one), everything on it worked out by the
       shader from where it is on the ball. 2 draw calls
     - the water on the ground: one flat patch. 1. Ribbons: one mesh, bent by the shader. 1. Whirl, column, ball: 1 each
     - the ring's light standing off the ground: a low strip. 1
     - hanging drops, glints: points. 1 each. Crowns and flying drops: the game's, 3. Billows: 6 small ones round the foot
   Nothing is sent to the shaders frame by frame but a handful of numbers.
   ========================================================================== */
import * as THREE from 'three';
import { WATER_LOOK } from './stylized-water.js';
import { createWaterDroplets } from './water-droplets.js';
import { createBillows } from './stylized-waterfall.js';
import { mulberry32, _internal as natureInternal } from './stylized-nature.js';

const { NOISE } = natureInternal;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const sstep = (a, b, t) => { const x = seg(t, a, b); return x * x * (3 - 2 * x); };
const out3 = x => 1 - (1 - x) ** 3;
const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

// the beats, in seconds into the cast (the clip Barrier_Cast is made to the same ones)
export const BARRIER = {
  raise: 16 / 30,        // the water is in her hand: the hand goes up
  burst: 1.05,           // the hand is up: the water breaks out of the ground round her
  pour: [1.15, 1.6],     // the column's head opens and pours down all round her: the dome closes
  clear: [2.0, 2.5],     // the water runs off it: a clear bubble is left
  fade: [2.7, 3.25],     // the bubble goes, from its top down
  end: 3.3,              // the clip is over: she stands as she stood
  gone: 4.1,             // the ring on the ground has gone too
  radius: 2.3,           // metres, for a caster 1.75 m tall
  apex: 1.0,             // how high the column goes, in radii (to the dome's top)
};
const B = BARRIER;

// the look: the game's water, and the cold light that makes it a spell
export const BARRIER_LOOK = {
  shallow: WATER_LOOK.shallow, mid: WATER_LOOK.mid, sky: WATER_LOOK.sky, foam: WATER_LOOK.foam, cell: WATER_LOOK.cell,
  spark: '#6fcbff',      // the cold blue light in it
  glint: '#d8f4ff',      // its glints
};

// how a sheet of the barrier's water is lit: water-droplets.js's thrown water (the same numbers), dimmed by the hour's light
const WATER = /* glsl */`
uniform vec3 uShallow, uMid, uSky, uWhite, uCell, uSpark, uSun, uLight;
uniform float uTime;
${NOISE}
float hash1(float n) { return fract(sin(n * 127.1 + 3.7) * 43758.5453); }      // (one number for a whole finger: nothing has to agree with a neighbour)
// value noise that joins up round a ring (period px along x), on the library's exact numbers
float wnoise(vec2 p, float px) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float x0 = i.x - px * floor((i.x + 0.5) / px), x1 = i.x + 1.0 - px * floor((i.x + 1.5) / px);
  return mix(mix(hash2(vec2(x0, i.y)), hash2(vec2(x1, i.y)), f.x), mix(hash2(vec2(x0, i.y + 1.0)), hash2(vec2(x1, i.y + 1.0)), f.x), f.y);
}
// two shapes run together the way water does: with a rounded web between them instead of a corner
float melt(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
// thick: 0 a film .. 1 a solid body of water.  white: 0 clear .. 1 froth.  see: how see-through the clear part is
vec4 water(vec3 N, vec3 V, float thick, float white, float see, float shine, bool far) {
  if (dot(N, V) < 0.0) N = -N;
  float facing = dot(N, V), rimLight = pow(1.0 - facing, 2.5);
  vec3 body = mix(uShallow, uMid, thick);
  body *= 0.9 + 0.22 * max(dot(N, uSun), 0.0);
  if (far) body = mix(body, uMid, 0.3);
  vec3 col = mix(body, uSky, rimLight * 0.6);
  float alpha = mix(1.0 - see, 0.9, rimLight);
  col = mix(col, uWhite, white);
  alpha = mix(alpha, 0.97, white);
  float spec = pow(max(dot(normalize(uSun + V), N), 0.0), 40.0);
  vec3 Nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  spec = max(spec, smoothstep(0.945, 0.985, dot(Nv, vec3(-0.5025, 0.5025, 0.7035))) * shine);
  col = col * uLight + uWhite * spec * 0.7 * (0.4 + 0.6 * uLight);
  alpha = min(1.0, alpha + spec * 0.6);
  return vec4(col, alpha);
}`;

// ------------------------------------------------------------------ the dome
const DOME_REACH = 0.54;                                    // of a half turn: it goes a little under the ground
const DOME_VS = /* glsl */`
uniform vec3 uAt;
uniform float uR, uTime, uThick, uSwell;
varying vec3 vWP, vN;
varying vec2 vS;            // round it 0..1; down it: 0 at its top .. 1 at the ground
void main() {
  vec3 n = normalize(position);
  float a = uv.x, s = (1.0 - uv.y) * ${(DOME_REACH * 2).toFixed(3)}, ang = a * 6.2831853;
  // thick with water it is never a smooth ball: it heaves in slow waves that run down it (whole numbers of them round it)
  float heave = sin(ang * 3.0 + s * 5.0 - uTime * 2.6) * 0.6 + sin(ang * 5.0 - s * 7.0 + uTime * 1.9) * 0.4;
  float r = uR * uSwell * (1.0 + 0.045 * uThick * heave * smoothstep(0.05, 0.45, s));
  vWP = uAt + n * r; vN = n; vS = vec2(a, s);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWP, 1.0);
}`;
const DOME_FS = /* glsl */`
${WATER}
uniform float uR, uCover, uPour, uThick, uFade, uFar;
varying vec3 vWP, vN;
varying vec2 vS;
const float FING = 19.0;                                    // fingers round the lip of the pouring sheet
// one family of strokes swept round the dome. ph: which stroke and how far across it (a whole number of them round
// the dome); a: how far round; wide: a stroke's width at its broadest, of the way from one to the next. Each stroke is
// there for a stretch and gone for a stretch, swelling from a point and thinning to a point
float sweep(float ph, float a, float dice, float wide) {
  float off = abs(fract(ph) - 0.5), which = floor(ph);
  float there = smoothstep(0.42, 0.8, wnoise(vec2(a * 9.0 + dice - uTime * 0.15, which * 3.7 + dice), 9.0));
  float w = wide * there;
  return (1.0 - smoothstep(w * 0.55, w, off)) * step(0.004, w);
}
void main() {
  float a = vS.x, s = vS.y, ang = a * 6.2831853, t = uTime;
  vec3 V = normalize(cameraPosition - vWP);
  // ---- the lip of the sheet as it pours down from the top, drawn in metres: a wavy line, and out of it fingers, each
  // a stem with a bead at its tip (as the game's splash crown has them, here hanging down)
  float lat = max(sin(min(s, 1.0) * 1.5707963), 0.08);
  float lipS = uCover * 1.52 - 0.14 + 0.05 * sin(ang * 3.0 + 1.3) + 0.03 * sin(ang * 7.0 - 2.1);
  float cell = a * FING, id = floor(cell);
  float r1 = hash1(id + 3.0), r2 = hash1(id * 1.9 + 5.3);
  float across = 6.2831853 * uR * lat / FING;               // metres from finger to finger at this height
  vec2 q = vec2((fract(cell) - 0.5 - (r1 - 0.5) * 0.36) * across, (s - lipS) * 1.5707963 * uR);
  float len = step(0.2, r2) * uR * (0.05 + 0.2 * r2 * r2) * uPour;
  float w = min(uR * 0.019, across * 0.16);
  w *= smoothstep(0.0, uR * 0.03, len);
  float stem = length(vec2(q.x, q.y - clamp(q.y, -0.2, len))) - w;
  float bead = length(q - vec2(0.0, len)) - w * (1.2 + 0.7 * r1);
  float d = melt(q.y, min(stem, bead), uR * 0.035);
  float aa = fwidth(d) * 1.2 + 1e-5;
  float inside = 1.0 - smoothstep(-aa, aa, d);
  if (inside < 0.01) discard;
  float rimW = uR * 0.028;
  float rim = smoothstep(-rimW, 0.0, d);
  rim *= rim * uPour;                                       // froth gathering toward the lip while it runs
  // ---- thick with water: froth running down it in streaks that lean with its turning (more of them toward its
  // edge as it is seen, so she is not hidden in its middle); lighter cells drifting in its body
  float n1 = wnoise(vec2(a * 26.0 + s * 4.0 + t * 0.6, s * 3.0 - t * 1.5), 26.0);
  float n2 = wnoise(vec2(a * 11.0 - s * 1.5 - t * 0.25, s * 1.8 - t * 0.7), 11.0);
  float rimLight = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
  float th = uThick;
  // strokes of froth swept round it, winding down it as they go: each swells from a point and thins to a point again.
  // Broad and many while it is thick with water; when it has run clear the same strokes are left as thin lights
  // (on its near wall only: its far one is quiet)
  float sweeps = 0.0, shade = 0.0;
  if (uFar < 0.5) {
    float p1 = s * 3.4 + a * 3.0 - t * 0.5, p2 = s * 5.3 - a * 2.0 - t * 0.33;
    float where = smoothstep(0.06, 0.25, s) * (1.0 - smoothstep(0.9, 1.0, s));
    sweeps = max(sweep(p1, a, 1.0, 0.05 + 0.1 * th), sweep(p2, a, 6.0, 0.04 + 0.06 * th) * (0.35 + 0.65 * th)) * where;
    // (under each stroke, a line of deeper water: what lets white froth be read on pale water)
    shade = max(sweep(p1 - 0.05, a, 1.0, 0.1 + 0.14 * th), sweep(p2 - 0.04, a, 6.0, 0.07 + 0.08 * th)) * where * th;
  }
  float streak = max(smoothstep(0.55, 0.66, n1 * 0.7 + n2 * 0.3) * (0.4 + 0.6 * rimLight) * smoothstep(0.08, 0.3, s) * (1.0 - uFar), sweeps * 0.9);
  float cells = smoothstep(0.52, 0.6, n2);
  // its foot, where it stands on the ground: churned white, raggedly, streaks of froth torn up out of it, and deeper
  // water above that (the tongues of water thrown up round it are the game's own splash crowns, not drawn here)
  float up = 1.0 - s;
  float churn = wnoise(vec2(a * 30.0 + t * 0.5, up * 6.0 - t * 1.4), 30.0);
  float foot = 1.0 - smoothstep(0.02, 0.07 + 0.14 * churn, up);
  float torn = smoothstep(0.6, 0.78, wnoise(vec2(a * 44.0 - t * 0.4, up * 2.6 - t * 1.1), 44.0)) * (1.0 - smoothstep(0.1, 0.42, up));
  float deep = 1.0 - smoothstep(0.1, 0.55, up);
  // bands of deeper water going round and down it
  float band = smoothstep(0.45, 0.7, wnoise(vec2(a * 8.0 + s * 2.5 - t * 0.3, s * 2.2 - t * 0.9), 8.0));
  float white = max(rim, th * max(streak, max(foot, torn * 0.75)));
  float see = mix(0.94, 0.68, th);
  vec3 N = normalize(vN + vec3(n1 - 0.5, 0.0, n2 - 0.5) * 0.3 * th);
  vec4 c = water(N, V, 0.2 + th * (0.2 + 0.25 * n2 + 0.45 * max(deep * 0.8, band * 0.6)), white, see, 0.5, uFar > 0.5);
  c.rgb = mix(c.rgb, uCell * uLight, cells * th * 0.4 * (1.0 - white));
  c.rgb = mix(c.rgb, uMid * uLight, shade * 0.75 * (1.0 - white));
  c.a = mix(c.a, max(c.a, 0.56), max(max(deep * 0.8, band * 0.45), shade) * th * (1.0 - white));      // deep water: less is seen through it
  // ---- run clear: the strokes are left as lights on it, and its cold light stays on its rim
  float arc = sweeps * (1.0 - th);
  c.rgb = mix(c.rgb, uWhite, arc * 0.9);
  c.a = max(c.a, arc * 0.8);
  c.rgb += uSpark * rimLight * (0.2 + 0.25 * (1.0 - th));
  // and its foot is lit where it stands on the ground
  float footLit = smoothstep(0.9, 0.985, s) * (1.0 - th) * (0.75 + 0.25 * n1);
  c.rgb = mix(c.rgb, mix(uWhite, uSpark, 0.3), footLit * 0.85);
  c.a = max(c.a, footLit * 0.8);
  // ---- going: from its top down, eaten away raggedly, the torn edge lit
  float sN = s + 0.22 * (n2 - 0.5) + 0.1 * (n1 - 0.5);
  float front = uFade * 1.5 - 0.2;
  float left = smoothstep(front, front + 0.05, sN);
  float lit = (1.0 - smoothstep(front + 0.04, front + 0.14, sN)) * step(0.001, uFade);
  c.rgb = mix(c.rgb, mix(uWhite, uSpark, 0.3), lit * 0.8);
  c.a = max(c.a, lit * 0.75);
  c.a *= inside * left * mix(1.0, 0.6, uFar);
  gl_FragColor = c;
}`;

// ------------------------------------------------------------------ the water on the ground under it
const GROUND_EXT = 1.6;                                     // the patch's half width, in radii
const GROUND_VS = /* glsl */`
uniform vec3 uAt;
uniform float uR, uLift;
varying vec2 vP;            // radii from her
varying vec3 vWP;
void main() {
  vP = position.xy * ${GROUND_EXT.toFixed(2)};
  vWP = uAt + vec3(vP.x * uR, uLift, vP.y * uR);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWP, 1.0);
}`;
const GROUND_FS = /* glsl */`
${WATER}
uniform float uWet, uSheet, uRing;
varying vec2 vP;
varying vec3 vWP;
void main() {
  float r = length(vP), ang = atan(vP.y, vP.x), a = ang / 6.2831853 + 0.5, t = uTime;
  // ---- the sheet that has run out from under her: thin and clear, lighter cells carried outwards in it, rings going
  // out over it, froth at its running edge
  float n = wnoise(vec2(a * 18.0, r * 5.0 - t * 0.5), 18.0);
  float edge = uWet + 0.035 * sin(ang * 5.0 + 1.0) + 0.02 * sin(ang * 9.0 - t * 2.0) + 0.05 * (n - 0.5);
  float sheet = (1.0 - smoothstep(edge - 0.015, edge, r)) * uSheet;
  float froth = smoothstep(edge - 0.1, edge - 0.015, r) * (0.55 + 0.45 * n);
  float ring1 = sin((r - t * 0.4) * 30.0);
  float rip = smoothstep(0.82, 0.97, ring1) * smoothstep(0.35, 0.7, n + 0.25) * smoothstep(0.1, 0.3, r);
  float cells = smoothstep(0.55, 0.63, wnoise(vec2(a * 12.0 + 4.0, r * 3.5 - t * 0.35), 12.0));
  vec3 col = mix(mix(uShallow, uMid, 0.3), uCell, cells * 0.75) * uLight;
  float white = max(froth, rip * 0.85);
  col = mix(col, uWhite * (0.4 + 0.6 * uLight), white);
  float alpha = sheet * mix(0.44, 0.92, max(white, cells * 0.35));
  // ---- the ring at the barrier's foot: a line of froth, never quite even, and its cold light on the water round it
  float off = abs(r - 1.0);
  float wide = 0.05 + 0.015 * sin(ang * 14.0 + t * 3.0) + 0.03 * (n - 0.5);
  float ring = (1.0 - smoothstep(wide * 0.5, wide, off)) * uRing;
  float glow = exp(-off * 7.0) * uRing;
  col = mix(col, uWhite, ring);
  alpha = max(alpha, ring * 0.95);
  col += uSpark * glow * 0.55;
  alpha = max(alpha, glow * 0.45);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}`;

// ------------------------------------------------------------------ the ring's light, standing a little way up off the ground
const RING_HIGH = 0.42;                                     // metres
const RINGLIGHT_VS = /* glsl */`
uniform vec3 uAt;
uniform float uR, uLift;
varying vec2 vQ;            // round it 0..1, up it 0..1
void main() {
  float ang = uv.x * 6.2831853, v = position.y + 0.5;
  vQ = vec2(uv.x, v);
  gl_Position = projectionMatrix * viewMatrix * vec4(uAt + vec3(cos(ang) * uR, uLift + v * ${RING_HIGH.toFixed(2)}, sin(ang) * uR), 1.0);
}`;
const RINGLIGHT_FS = /* glsl */`
uniform vec3 uWhite, uSpark;
uniform float uTime, uRing;
varying vec2 vQ;
${NOISE}
float wnoise(vec2 p, float px) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float x0 = i.x - px * floor((i.x + 0.5) / px), x1 = i.x + 1.0 - px * floor((i.x + 1.5) / px);
  return mix(mix(hash2(vec2(x0, i.y)), hash2(vec2(x1, i.y)), f.x), mix(hash2(vec2(x0, i.y + 1.0)), hash2(vec2(x1, i.y + 1.0)), f.x), f.y);
}
void main() {
  // a low wall of cold light, licking up unevenly, brightest where it leaves the water
  float high = 0.3 + 0.7 * wnoise(vec2(vQ.x * 48.0, uTime * 1.6), 48.0) * (0.6 + 0.4 * wnoise(vec2(vQ.x * 13.0 + 5.0, uTime * 0.7), 13.0));
  float g = 1.0 - smoothstep(0.0, high, vQ.y);
  g = g * g * g * uRing;
  if (g < 0.004) discard;
  gl_FragColor = vec4(mix(uSpark, uWhite, g * g) * g, g * 0.5);       // (mostly added onto what is behind)
}`;

// ------------------------------------------------------------------ the ribbons round her
const RIBBONS = 7, RIB_SEG = 44;
const RIBBON_VS = /* glsl */`
attribute vec3 aRib;        // along it 0 (its head) .. 1 (its tail), across it -1..1, which ribbon
attribute vec4 aA;          // where round her it starts, how far out it turns, how high, how fast
attribute vec4 aB;          // how much its ring is tipped, how long it is (radians), how wide (metres), its twist
attribute vec2 aC;          // when it appears (seconds), how near the hand it ends up 0..1
uniform vec3 uAt, uHand;
uniform float uTime, uT, uSpin, uRaise;
varying vec3 vRib, vWP, vN;
varying float vShown;
vec2 axisAt() { return mix(uAt.xz, uHand.xz, uRaise * aC.y); }
// its middle line: a tipped ring round her while the water gathers; as the hand goes up it is drawn in and up, to
// turn tightly under the hand
vec3 pathAt(float u) {
  float ang = aA.x + uSpin * aA.w - u * aB.y;
  float top = uHand.y - uAt.y;
  float r = mix(aA.y, 0.2 + 0.5 * (1.0 - aC.y), uRaise) * (1.0 + 0.25 * u);
  float y = mix(aA.z, top - 0.08 - (top - 0.5) * (1.0 - aC.y) * 0.8, uRaise);
  y += sin(ang + aB.w) * aB.x * r - u * 0.3 * (1.0 + uRaise);       // (its tail hangs lower: it is climbing)
  vec2 ax = axisAt();
  return vec3(ax.x + cos(ang) * r, uAt.y + y, ax.y + sin(ang) * r);
}
void main() {
  float u = aRib.x, v = aRib.y;
  vec3 p = pathAt(u), along = normalize(pathAt(u + 0.012) - pathAt(u - 0.012));
  vec2 ax = axisAt();
  vec3 outward = normalize(vec3(p.x - ax.x, 0.0, p.z - ax.y) + vec3(1e-4, 0.0, 0.0));
  // a band standing on edge round her, rocking over a little along its length and as it goes (never lying flat: a
  // stream of water, not a pane of it)
  float tw = 0.8 * sin(aB.w + u * 2.4 + uTime * 1.3);
  vec3 wide = vec3(0.0, cos(tw), 0.0) + outward * sin(tw);
  wide = normalize(wide - along * dot(wide, along));
  vShown = smoothstep(aC.x, aC.x + 0.4, uT) * 1.05;                 // drawn on from its head
  float shape = smoothstep(0.0, 0.07, u) * pow(1.0 - u, 0.75);     // a round head, thinning to nothing at the tail
  shape *= smoothstep(vShown, vShown - 0.3, u);                     // (and to a point where it is still being drawn)
  p += wide * v * aB.z * shape;
  vRib = aRib; vWP = p; vN = normalize(cross(along, wide));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const RIBBON_FS = /* glsl */`
${WATER}
uniform float uA;
varying vec3 vRib, vWP, vN;
varying float vShown;
void main() {
  float u = vRib.x, v = vRib.y, id = vRib.z, t = uTime;
  if (u > vShown) discard;
  // its edges: wavy, and ragged toward the tail
  float n = noise2(vec2(u * 13.0 - t * 3.0, id * 7.3));
  float cut = 1.0 - abs(v) - 0.3 * n * (0.25 + u);
  float aa = fwidth(cut) * 1.5 + 1e-4;
  float inside = smoothstep(0.03 - aa, 0.03 + aa, cut);
  if (inside < 0.01) discard;
  // white water: its head, the froth along its edges, streaks torn along it
  float head = 1.0 - smoothstep(0.0, 0.12, u);
  float rim = 1.0 - smoothstep(0.0, 0.32, cut);
  float streak = smoothstep(0.62, 0.8, noise2(vec2(u * 9.0 - t * 4.0 + id * 3.1, v * 2.2 + id)));
  float white = max(max(head, rim * 0.85), streak * 0.7);
  vec4 c = water(normalize(vN), normalize(cameraPosition - vWP), 0.55 + 0.4 * n, white, 0.3, 0.4, false);
  // (a line of deeper water inside its froth, as the game's crowns have: it is read against sky and grass alike)
  c.rgb = mix(c.rgb, uMid * uLight * 0.92, smoothstep(0.3, 0.38, cut) * (1.0 - smoothstep(0.42, 0.6, cut)) * (1.0 - white) * 0.7);
  c.rgb += uSpark * (0.15 + 0.4 * head);
  c.a *= inside * (1.0 - smoothstep(0.72, 1.0, u)) * smoothstep(vShown, vShown - 0.12, u) * uA;
  gl_FragColor = c;
}`;

// ------------------------------------------------------------------ the whirl over her hand
const WHIRL_VS = /* glsl */`
uniform vec3 uHand;
uniform float uWR, uTime;
varying vec2 vP;
varying vec3 vWP;
void main() {
  vP = position.xy;
  // flat over the hand, never quite level
  float tip = 0.1 * sin(uTime * 2.1) * position.x + 0.08 * cos(uTime * 1.6) * position.y;
  vWP = uHand + vec3(position.x * uWR, 0.3 + tip * uWR, position.y * uWR);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWP, 1.0);
}`;
const WHIRL_FS = /* glsl */`
${WATER}
uniform float uA, uTurn;
varying vec2 vP;
varying vec3 vWP;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
  // three arms of water wound in to the middle, their leading edges froth, torn at the rim
  float n = wnoise(vec2(a * 16.0 - uTurn * 16.0, r * 5.0), 16.0);
  float f = fract(a * 3.0 + log(r + 0.06) * 1.25 - uTurn * 3.0);
  float arm = smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.36 + 0.2 * n, 0.5 + 0.2 * n, f));
  float crest = arm * (1.0 - smoothstep(0.03, 0.17, f));
  float core = 1.0 - smoothstep(0.06, 0.3, r);
  float edge = 1.0 - smoothstep(0.62, 1.0, r + 0.2 * (n - 0.5));
  vec4 c = water(normalize(vec3(n - 0.5, 1.0, 0.3 - f)), normalize(cameraPosition - vWP), 0.25 + 0.45 * r, max(crest, core), 0.5, 0.3, false);
  c.rgb += uSpark * (0.18 + 0.35 * core);
  c.a *= max(arm, core) * edge * uA;
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}`;

// ------------------------------------------------------------------ the column that goes up past her
const COLUMN_VS = /* glsl */`
uniform vec3 uAt;
uniform float uTime, uColH, uColR, uLift;
varying vec3 vWP, vN;
varying vec2 vQ;            // round it 0..1, up it 0..1
// a skirt where it leaves the ground, a stem, and a head that opens outward (into the dome it becomes)
vec3 columnAt(float a, float v) {
  float ang = a * 6.2831853;
  float head = smoothstep(0.62, 1.0, v);
  float r = uColR * (1.0 + 1.3 * exp(-v * 9.0) + 1.5 * head * head);
  r *= 1.0 + 0.07 * sin(ang * 3.0 + v * 7.0 - uTime * 9.0) + 0.04 * sin(ang * 5.0 - v * 11.0 + uTime * 6.0);
  return vec3(cos(ang) * r, uLift + (v - 0.1 * head * head) * uColH, sin(ang) * r);       // (its head curls over)
}
void main() {
  float a = uv.x, v = position.y + 0.5;
  vec3 p = columnAt(a, v), da = columnAt(a + 0.004, v) - p, dv = columnAt(a, v + 0.02) - p;
  vec3 n = cross(da, dv);
  float nl = length(n);
  vN = nl > 1e-9 ? n / nl : vec3(0.0, 1.0, 0.0);
  vWP = uAt + p; vQ = vec2(a, v);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWP, 1.0);
}`;
const COLUMN_FS = /* glsl */`
${WATER}
uniform float uA, uColH, uSunk;
varying vec3 vWP, vN;
varying vec2 vQ;
void main() {
  float a = vQ.x, v = vQ.y, t = uTime;
  // water going up fast: froth in long streaks rushing up it, its foot churned white, its head torn
  float n1 = wnoise(vec2(a * 18.0 + v * 2.0, v * uColH * 1.6 - t * 7.0), 18.0);
  float n2 = wnoise(vec2(a * 7.0 - v, v * uColH * 0.8 - t * 4.0), 7.0);
  if (v > mix(0.82, 0.08, uSunk) + 0.18 * n2) discard;        // its torn head; as the dome closes it sinks back to the ground
  float streak = smoothstep(0.55, 0.72, n1 * 0.65 + n2 * 0.35);
  float foot = 1.0 - smoothstep(0.0, 0.12 + 0.1 * n2, v);
  vec4 c = water(normalize(vN), normalize(cameraPosition - vWP), 0.3 + 0.3 * n2, max(streak, foot), 0.74, 0.5, !gl_FrontFacing);
  c.rgb += uSpark * 0.18;
  c.a *= uA * (gl_FrontFacing ? 1.0 : 0.6);
  gl_FragColor = c;
}`;

// ------------------------------------------------------------------ the ball of water in her hand
const BALL_REACH = 3.4;                                     // the card's half width, in the ball's radii (room for its light)
const BALL_VS = /* glsl */`
uniform vec3 uHand;
uniform float uBR, uBUp;
varying vec2 vP;
void main() {
  vP = position.xy * ${BALL_REACH.toFixed(1)};
  vec4 mv = viewMatrix * vec4(uHand + vec3(0.0, uBUp, 0.0), 1.0);
  mv.xy += vP * uBR;
  gl_Position = projectionMatrix * mv;
}`;
const BALL_FS = /* glsl */`
uniform vec3 uShallow, uMid, uWhite, uSpark, uLight;
uniform float uTime, uA, uSolid;
varying vec2 vP;
void main() {
  float d = length(vP), ang = atan(vP.y, vP.x);
  // a ball of the same water, turning: clear turquoise, white where it turns over and at its heart, a line of deeper
  // water at its edge, one window of light; and round it the cold light that says it is a spell
  float body = (1.0 - smoothstep(0.93, 1.0, d)) * uSolid;
  float turn = 0.5 + 0.5 * sin(ang * 2.0 + d * 5.0 - uTime * 7.0);
  vec3 col = mix(uShallow, uWhite, 0.25 + 0.5 * smoothstep(0.45, 0.9, turn) * smoothstep(0.25, 0.9, d));
  col = mix(col, uWhite, 1.0 - smoothstep(0.0, 0.55, d));
  col = mix(col, uMid, smoothstep(0.78, 0.98, d) * 0.55);
  col = mix(col, uWhite, 1.0 - smoothstep(0.1, 0.2, length(vP - vec2(-0.36, 0.42))));
  float halo = (exp(-d * d * 0.8) * 0.6 + exp(-d * 1.9) * 0.3) * (1.0 - smoothstep(${(BALL_REACH - 0.8).toFixed(1)}, ${BALL_REACH.toFixed(1)}, d));
  vec3 light = mix(uSpark, uWhite, 0.3) * halo;
  gl_FragColor = vec4((col * (0.5 + 0.5 * uLight) * body + light) * uA, body * 0.96 * uA);       // (its light is added onto what is behind)
}`;

// ------------------------------------------------------------------ drops hanging in it, and its glints
const POINT_PARS = /* glsl */`
attribute vec4 aDice;       // four numbers of its own, 0..1
attribute float aKind;
uniform vec3 uAt, uHand;
uniform float uTime, uT, uSpin, uRaise, uR, uLift, uScale;
varying float vA;
varying float vDice;
// turning with the ribbons before the water breaks out: drawn in and up with them as the hand goes up
vec3 turning(float lag) {
  float ang = aDice.x * 6.2831853 + uSpin * (0.6 + 0.6 * aDice.y) - lag;
  float r = mix(0.55 + 1.15 * aDice.z, 0.18 + 0.5 * aDice.z, uRaise);
  float y = mix(0.25 + 1.8 * aDice.w, (uHand.y - uAt.y) * (0.45 + 0.6 * aDice.w), uRaise) + 0.12 * sin(uTime * 3.0 + aDice.x * 40.0);
  vec2 ax = mix(uAt.xz, uHand.xz, uRaise * aDice.w);
  return vec3(ax.x + cos(ang) * r, uAt.y + y, ax.y + sin(ang) * r);
}
float turningShown() {
  float born = 0.12 + 0.45 * aDice.y;
  return smoothstep(born, born + 0.15, uT) * (1.0 - smoothstep(${(B.burst - 0.02).toFixed(3)}, ${(B.burst + 0.12).toFixed(3)}, uT));
}`;
const BEAD_VS = /* glsl */`
${POINT_PARS}
void main() {
  vec3 p; float size;
  if (aKind < 0.5) {
    p = turning(0.0); vA = turningShown(); size = 0.03 + 0.045 * aDice.z;
  } else {
    // hanging inside the barrier, drifting slowly round her, bobbing; when it goes they fall, not all at once
    float ang = aDice.x * 6.2831853 + uTime * (0.25 + 0.3 * aDice.y), el = aDice.w * 1.3;
    float rr = uR * (0.32 + 0.6 * sqrt(aDice.z));
    p = uAt + vec3(cos(ang) * cos(el), sin(el), sin(ang) * cos(el)) * rr;
    p.y += 0.12 + 0.06 * sin(uTime * 1.7 + aDice.x * 31.0);
    float born = ${(B.pour[0] + 0.15).toFixed(3)} + 0.5 * aDice.y;
    float fall = max(uT - (${(B.fade[0] - 0.1).toFixed(3)} + 0.45 * aDice.x), 0.0);
    p.y -= 3.5 * fall * fall;
    vA = smoothstep(born, born + 0.12, uT) * step(uAt.y + uLift, p.y);
    size = (0.03 + 0.05 * aDice.z * aDice.y) * (0.5 + 0.5 * smoothstep(born, born + 0.25, uT));
  }
  vDice = aDice.x;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uScale / max(-mv.z, 0.1);
  if (vA < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const BEAD_FS = /* glsl */`
uniform vec3 uShallow, uMid, uSky, uWhite, uLight;
varying float vA;
void main() {
  // a bead of the same water, as the game's flying drops are drawn: clear in the middle, the colour gathering toward
  // its edge, the sky on its upper side and one small window of light
  vec2 c = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * 2.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  vec3 col = mix(mix(uShallow, uWhite, 0.35), mix(uShallow, uMid, 0.3), smoothstep(0.1, 1.0, d));
  col = mix(col, uSky, smoothstep(-0.2, 0.9, c.y) * 0.6) * uLight;
  float shine = 1.0 - smoothstep(0.0, 0.16, length(c - vec2(-0.3, 0.35)) - 0.12);
  col = mix(col, uWhite, shine * 0.9);
  gl_FragColor = vec4(col, mix(0.5, 0.88, max(smoothstep(0.2, 1.0, d), shine)) * smoothstep(1.0, 0.8, d) * vA);
}`;
const GLINT_VS = /* glsl */`
${POINT_PARS}
void main() {
  vec3 p; float shown;
  if (aKind < 0.5) {                                     // among the ribbons
    p = turning(0.25); shown = turningShown();
  } else if (aKind < 1.5) {                              // on the barrier itself, once the water has run off it
    float ang = aDice.x * 6.2831853 + uTime * 0.12, el = asin(aDice.w * 0.96);
    p = uAt + vec3(cos(ang) * cos(el), sin(el), sin(ang) * cos(el)) * uR;
    shown = smoothstep(${(B.pour[1]).toFixed(3)}, ${(B.clear[0] + 0.2).toFixed(3)}, uT) * (1.0 - smoothstep(${(B.fade[0]).toFixed(3)} + 0.4 * (1.0 - aDice.w), ${(B.fade[0] + 0.15).toFixed(3)} + 0.4 * (1.0 - aDice.w), uT));
  } else {                                               // on the ring at its foot, and rising off it as it goes
    float ang = aDice.x * 6.2831853;
    float up = max(uT - ${(B.fade[0]).toFixed(3)}, 0.0) * (0.25 + 0.5 * aDice.w);
    p = uAt + vec3(cos(ang) * uR, uLift + 0.04 + up, sin(ang) * uR);
    shown = smoothstep(${(B.pour[1] - 0.05).toFixed(3)}, ${(B.pour[1] + 0.2).toFixed(3)}, uT) * (1.0 - smoothstep(${(B.gone - 0.9).toFixed(3)}, ${(B.gone - 0.2).toFixed(3)}, uT));
  }
  // each winks at its own pace
  float k = fract(uTime * (1.1 + 1.6 * aDice.y) + aDice.z * 7.0);
  float wink = pow(sin(k * 3.14159265), 3.0);
  vA = shown * wink;
  vDice = aDice.z;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.1 + 0.16 * aDice.z) * (0.5 + 0.5 * wink) * uScale / max(-mv.z, 0.1);
  if (vA < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const GLINT_FS = /* glsl */`
uniform vec3 uGlint, uSpark;
varying float vA;
void main() {
  // a four-pointed star and its heart
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  float d = length(c);
  float star = (1.0 - smoothstep(0.0, 0.05, abs(c.x) * abs(c.y) * 6.0)) * (1.0 - smoothstep(0.3, 1.0, d));
  float heart = exp(-d * d * 22.0);
  float s = clamp(star * 0.9 + heart, 0.0, 1.0) * vA;
  gl_FragColor = vec4(mix(uSpark, uGlint, clamp(heart + star * 0.5, 0.0, 1.0)) * s, s);
}`;

export function createBarrierFx({ radius = B.radius, lift = 0.06, seed = 1, look = BARRIER_LOOK, sun = [-0.4, 0.9, 0.5] } = {}) {
  const rng = mulberry32(seed * 977 + 5);
  const object = new THREE.Group();
  object.name = 'barrier_fx';
  object.renderOrder = 100;          // (a Group's renderOrder orders all within it as one, a Group within it too: after all the world's own see-through things (the falls' foam, the mist, splashes: their renderOrder goes up to 6), so that those behind her spells are not painted over them (README, "Over water"); the order within stays as set below)
  const time = { value: 0 };                                 // seconds, for what flows (it only ever goes on)
  const uAt = { value: new THREE.Vector3() }, uHand = { value: new THREE.Vector3() };
  const uR = { value: radius }, uLift = { value: lift }, uT = { value: -1 }, uSpin = { value: 0 }, uRaise = { value: 0 }, uScale = { value: 500 };
  const light = { value: new THREE.Vector3(1, 1, 1) };
  const colours = {
    uShallow: { value: rgb(look.shallow) }, uMid: { value: rgb(look.mid) }, uSky: { value: rgb(look.sky) }, uWhite: { value: rgb(look.foam) },
    uCell: { value: rgb(look.cell) }, uSpark: { value: rgb(look.spark) }, uSun: { value: new THREE.Vector3(...sun).normalize() }, uLight: light,
  };
  const common = { uTime: time, uAt, uHand, uR, uLift, uT, uSpin, uRaise, ...colours };
  const sheet = (vs, fs, uniforms, side = THREE.FrontSide) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: { ...common, ...uniforms }, transparent: true, depthWrite: false, side });
  const made = [];                                           // what to dispose of
  const add = (mesh, order) => { mesh.frustumCulled = false; mesh.renderOrder = order; mesh.visible = false; object.add(mesh); made.push(mesh); return mesh; };

  // ---- the water on the ground; the dome's far wall; what is inside; its near wall (drawn in that order)
  const groundU = { uWet: { value: 0 }, uSheet: { value: 0 }, uRing: { value: 0 } };
  const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sheet(GROUND_VS, GROUND_FS, groundU)), 12);
  const domeU = { uCover: { value: 0 }, uPour: { value: 0 }, uThick: { value: 0 }, uFade: { value: 0 }, uSwell: { value: 1 } };
  const domeGeo = new THREE.SphereGeometry(1, 72, 34, 0, Math.PI * 2, 0, Math.PI * DOME_REACH);
  const domeFar = add(new THREE.Mesh(domeGeo, sheet(DOME_VS, DOME_FS, { ...domeU, uFar: { value: 1 } }, THREE.BackSide)), 13);
  const domeNear = add(new THREE.Mesh(domeGeo, sheet(DOME_VS, DOME_FS, { ...domeU, uFar: { value: 0 } }, THREE.FrontSide)), 19);

  const ringLight = add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true), new THREE.ShaderMaterial({
    vertexShader: RINGLIGHT_VS, fragmentShader: RINGLIGHT_FS, uniforms: { ...common, uRing: groundU.uRing },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, premultipliedAlpha: true })), 20);
  const columnU = { uA: { value: 0 }, uColH: { value: 0 }, uColR: { value: 0.5 }, uSunk: { value: 0 } };
  const column = add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 44, 18, true), sheet(COLUMN_VS, COLUMN_FS, columnU, THREE.DoubleSide)), 14);

  // the ribbons: one mesh, each a strip the shader bends
  const ribbonGeo = new THREE.BufferGeometry();
  {
    const rib = [], A = [], Bv = [], C = [], idx = [];
    for (let i = 0; i < RIBBONS; i++) {
      const k = i / (RIBBONS - 1);
      const a = [rng() * Math.PI * 2, 0.75 + 0.8 * rng(), 0.55 + 1.3 * ((i * 3) % RIBBONS) / (RIBBONS - 1), 0.85 + 0.5 * rng()];
      const b = [0.12 + 0.3 * rng(), 2.4 + 2.0 * rng(), 0.075 + 0.07 * rng(), rng() * Math.PI * 2];
      const c = [0.04 + 0.28 * k, (i * 2 % RIBBONS) / (RIBBONS - 1)];
      const base = rib.length / 3;
      for (let s = 0; s <= RIB_SEG; s++) for (const v of [-1, 1]) { rib.push(s / RIB_SEG, v, i); A.push(...a); Bv.push(...b); C.push(...c); }
      for (let s = 0; s < RIB_SEG; s++) { const o = base + s * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    }
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(rib.length), 3));
    ribbonGeo.setAttribute('aRib', new THREE.Float32BufferAttribute(rib, 3));
    ribbonGeo.setAttribute('aA', new THREE.Float32BufferAttribute(A, 4));
    ribbonGeo.setAttribute('aB', new THREE.Float32BufferAttribute(Bv, 4));
    ribbonGeo.setAttribute('aC', new THREE.Float32BufferAttribute(C, 2));
    ribbonGeo.setIndex(idx);
  }
  const ribbonU = { uA: { value: 0 } };
  const ribbons = add(new THREE.Mesh(ribbonGeo, sheet(RIBBON_VS, RIBBON_FS, ribbonU, THREE.DoubleSide)), 15);

  const whirlU = { uA: { value: 0 }, uWR: { value: 0 }, uTurn: { value: 0 } };
  const whirl = add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 6, 6), sheet(WHIRL_VS, WHIRL_FS, whirlU, THREE.DoubleSide)), 16);

  const ballU = { uA: { value: 0 }, uBR: { value: 0.1 }, uBUp: { value: 0.1 }, uSolid: { value: 1 } };
  const ballMat = new THREE.ShaderMaterial({ vertexShader: BALL_VS, fragmentShader: BALL_FS, uniforms: { ...common, ...ballU }, transparent: true, depthWrite: false, premultipliedAlpha: true });
  const ball = add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ballMat), 18);

  // points: drops (some turning with the ribbons, most hanging inside the barrier) and glints (ribbons, barrier, ring)
  const points = (kinds, vs, fs, extra) => {
    const n = kinds.reduce((s, k) => s + k, 0), dice = new Float32Array(n * 4), kind = new Float32Array(n);
    let o = 0;
    kinds.forEach((count, k) => { for (let i = 0; i < count; i++, o++) { kind[o] = k; for (let j = 0; j < 4; j++) dice[o * 4 + j] = rng(); } });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aDice', new THREE.Float32BufferAttribute(dice, 4));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    return new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: { ...common, uScale, ...extra }, transparent: true, depthWrite: false, ...(extra.uGlint ? { blending: THREE.AdditiveBlending, premultipliedAlpha: true } : {}) }));
  };
  const beads = add(points([36, 64], BEAD_VS, BEAD_FS, {}), 17);
  const glints = add(points([26, 46, 30], GLINT_VS, GLINT_FS, { uGlint: { value: rgb(look.glint) } }), 20);

  // ---- the game's own: splash crowns and flying drops (water-droplets.js), clouds of spray (stylized-waterfall.js)
  const drops = createWaterDroplets({ time, capacity: 420, sun });
  object.add(drops.points);
  drops.points.children.find(m => m.name === 'waterJets').visible = false;      // crowns and drops only: no column out of each crown's middle
  const dropColours = [drops.points, ...drops.points.children].map(m => ['uShallow', 'uMid', 'uSky', 'uWhite'].map(k => [m.material.uniforms[k].value, m.material.uniforms[k].value.clone()]));
  const puff = { puffAmount: { value: 1 }, puffSize: { value: 0.24 }, puffGrow: { value: 0.9 }, puffSpread: { value: 0.4 }, puffRise: { value: 0.5 },
    puffLife: { value: 1.3 }, puffFade: { value: 0.3 }, puffSoft: { value: 0.32 }, puffOpacity: { value: 0 } };
  const SIDES = 6, spray = new THREE.Group(), billows = [];
  spray.renderOrder = object.renderOrder;            // (a Group within sets its own: the same, and for each side below)
  for (let i = 0; i < SIDES; i++) {
    // one stretch of the barrier's foot each: its puffs come up along it and drift outwards
    const side = new THREE.Group(), b = createBillows({ width: 2 * radius * Math.tan(Math.PI / SIDES) * 0.9, count: 7, time, tune: puff });
    side.rotation.y = i / SIDES * Math.PI * 2;
    side.renderOrder = object.renderOrder;
    b.position.z = radius * 0.97;
    b.frustumCulled = false;
    side.add(b); spray.add(side); billows.push(b);
    b.userData.out = new THREE.Vector3(Math.sin(side.rotation.y), 0, Math.cos(side.rotation.y));
    b.userData.colours = ['uWhite', 'uShade'].map(k => [b.material.uniforms[k].value, b.material.uniforms[k].value.clone()]);
  }
  spray.visible = false;
  object.add(spray);

  const fx = {
    object, shake: 0, wind: 0, busy: false,
    setSun(v) { colours.uSun.value.copy(v).normalize(); for (const m of [drops.points, ...drops.points.children]) m.material.uniforms.uSun.value.copy(v).normalize(); },
    // the hour's light: what the scene is multiplied by (white by day). The water takes it; its cold light does not
    setLight(r, g, b) {
      light.value.set(r, g, b);
      for (const set of dropColours) for (const [now, day] of set) now.set(day.x * r, day.y * g, day.z * b);
      for (const bl of billows) for (const [now, day] of bl.userData.colours) now.setRGB(day.r * r, day.g * g, day.b * b);
    },
    dispose() {
      for (const m of made) { m.geometry.dispose(); m.material.dispose(); }
      drops.dispose();
      for (const b of billows) b.userData.dispose();
    },
  };

  let last = -1;                                             // the cast's time at the last frame (a smaller one now: it has begun again)
  const toCam = new THREE.Vector3();
  const crowns = (r, n, power, count) => {
    const turn = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = turn + (i + 0.3 * (rng() - 0.5)) / n * Math.PI * 2, rr = r * (0.94 + 0.12 * rng());
      drops.emit(uAt.value.x + Math.cos(a) * rr, uAt.value.y + lift, uAt.value.z + Math.sin(a) * rr, power * (0.8 + 0.4 * rng()), count);
    }
  };
  fx.update = (dt, renderer, camera, t, at, hand) => {
    time.value += dt;
    if (renderer) uScale.value = camera.projectionMatrix.elements[5] * renderer.domElement.height * 0.5;
    drops.update(renderer);
    const on = t >= 0 && t <= B.gone;
    fx.busy = on || drops.points.visible;
    if (!on) {
      for (const m of made) m.visible = false;
      spray.visible = false; fx.shake = fx.wind = 0; last = -1; uT.value = -1;
      return;
    }
    if (t < last) uSpin.value = 0;                           // begun again
    uAt.value.copy(at); uT.value = t;
    if (t <= B.burst || last < 0) uHand.value.copy(hand);    // (once the water has broken out, what was over her hand stays where it was thrown up)
    const gather = sstep(0.05, B.raise, t), raise = sstep(B.raise + 0.05, B.burst - 0.04, t);
    uRaise.value = raise;
    uSpin.value += (3.5 + 5.5 * gather + 9 * raise) * dt;    // what turns round her turns faster as the hand goes up

    // ---- the ball in her hand: swelling as the water comes to it, larger as it goes up; it goes off in a flash
    const flash = seg(t, B.burst, B.burst + 0.18);
    ball.visible = t > 0.06 && flash < 1;
    ballU.uBR.value = (0.02 + 0.1 * out3(seg(t, 0.06, B.raise)) + 0.07 * raise) * (1 + 0.07 * Math.sin(time.value * 11)) * (1 + 4 * out3(flash));
    ballU.uBUp.value = 0.1 + 0.12 * raise;
    ballU.uA.value = sstep(0.06, 0.22, t) * (1 - flash * flash);
    ballU.uSolid.value = 1 - sstep(0, 0.5, flash);

    // ---- the ribbons, the drops and glints with them; the whirl over the hand
    ribbons.visible = t < B.burst + 0.2;
    ribbonU.uA.value = 1 - sstep(B.burst - 0.02, B.burst + 0.18, t);
    whirl.visible = t > B.raise + 0.1 && t < B.burst + 0.3;
    whirlU.uWR.value = 1.15 * out3(seg(t, B.raise + 0.1, B.burst - 0.05)) + 0.7 * sstep(B.burst, B.burst + 0.25, t);
    whirlU.uA.value = sstep(B.raise + 0.1, B.raise + 0.3, t) * (1 - sstep(B.burst + 0.05, B.burst + 0.3, t));
    whirlU.uTurn.value = uSpin.value / (Math.PI * 2) * 0.55;

    // ---- the water breaks out: the column goes up past her, and stands until the dome it opens into has closed
    column.visible = t > B.burst && t < B.pour[1] + 0.1;
    columnU.uColH.value = radius * B.apex * out3(seg(t, B.burst, B.burst + 0.17));
    columnU.uSunk.value = sstep(B.pour[0] + 0.02, B.pour[1] - 0.05, t);
    columnU.uA.value = sstep(B.burst, B.burst + 0.04, t) * (1 - sstep(B.pour[1] - 0.15, B.pour[1] + 0.08, t));

    // ---- the dome: closing from its top; thick with water, then run clear; then going from its top
    const dome = t > B.pour[0] && t < B.fade[1];
    domeFar.visible = domeNear.visible = dome;
    const cover = sstep(B.pour[0], B.pour[1], t), landed = seg(t, B.pour[1], B.pour[1] + 0.5);
    domeU.uCover.value = cover;
    domeU.uPour.value = 1 - sstep(B.pour[1] - 0.05, B.pour[1] + 0.1, t);
    domeU.uThick.value = 1 - sstep(B.clear[0], B.clear[1], t);
    domeU.uFade.value = sstep(B.fade[0], B.fade[1], t);
    // (as it lands it gives, and springs back; as it goes it lets go a little)
    domeU.uSwell.value = 1 + 0.045 * Math.sin(landed * Math.PI * 2.5) * (1 - landed) * (t > B.pour[1] ? 1 : 0) + 0.05 * domeU.uFade.value;

    // ---- on the ground: the sheet running out from under her, the ring where the dome stands, last to go
    ground.visible = t > B.burst;
    groundU.uWet.value = 0.12 + 1.02 * out3(seg(t, B.burst, B.burst + 0.5));
    groundU.uSheet.value = sstep(B.burst, B.burst + 0.08, t) * (1 - sstep(B.fade[1] - 0.25, B.gone - 0.25, t));
    groundU.uRing.value = sstep(B.pour[1] - 0.06, B.pour[1] + 0.1, t) * (1 - sstep(B.gone - 0.7, B.gone, t));
    ringLight.visible = groundU.uRing.value > 0.01;

    beads.visible = t > 0.1 && t < B.fade[1] + 0.7;
    glints.visible = t > 0.1;

    // ---- the game's own splash crowns: round her as the water breaks out, round the dome's foot as it lands; and the
    // clouds of spray that boil up along the foot (those on the far side are drawn before the dome, the near ones after)
    // (the game draws twelve crowns at once: four, then seven, then four more as the first four sink)
    if (last < B.burst && t >= B.burst) crowns(0.85, 4, 1.3, 10);
    if (last < B.pour[1] - 0.04 && t >= B.pour[1] - 0.04) crowns(radius * 0.99, 7, 1.2, 9);
    for (let i = 0; i < 4; i++) { const at = B.burst + 0.93 + 0.05 * i; if (last < at && t >= at) crowns(radius * 0.99, 1, 1.1, 7); }
    puff.puffOpacity.value = 0.85 * sstep(B.pour[1] - 0.06, B.pour[1] + 0.15, t) * (1 - sstep(B.clear[0], B.clear[1] + 0.15, t));
    spray.visible = puff.puffOpacity.value > 0.01;
    if (spray.visible) {
      spray.position.set(at.x, at.y + lift, at.z);
      toCam.set(camera.position.x - at.x, 0, camera.position.z - at.z);
      for (const b of billows) b.renderOrder = b.userData.out.dot(toCam) < 0 ? 12.5 : 21;
    }

    // ---- what the caster may take from it: the ground's jolt, and the draught that lifts her hair and skirt
    fx.shake = Math.max(0.7 * (1 - seg(t, B.burst, B.burst + 0.3)) * (t >= B.burst ? 1 : 0), 0.4 * (1 - seg(t, B.pour[1], B.pour[1] + 0.25)) * (t >= B.pour[1] ? 1 : 0));
    fx.wind = Math.max(0.35 * gather, sstep(B.burst - 0.1, B.burst + 0.1, t)) * (1 - sstep(B.clear[0], B.fade[0], t));
    last = t;
  };
  return fx;
}
