/* ==========================================================================
   plant-boss.js  —  the three-headed plant boss: three thick thorned necks rising out of a skirt of red-tipped leaves
   on a mound of roots, each neck ending in a round pod with a dark jagged mouth, two glowing eyes and a hood of leaves
   with a curl on top. One job: build it, and let each head be posed. One mesh, one material, one draw call.

     createPlantBoss({ seed, size }) -> Group      about 7 m high at size 1 (BOSS_HEIGHT), its faces toward +Z, its foot at y = 0
     boss.userData.heads[0..2]                     the middle head, the one toward +x, the one toward -x: numbers that pose it
         lean (Vector3)   where its neck's end is carried to, metres        wave   how wide its neck waves (1 as it starts)
         yaw, nod, tilt   its head turned about the upright / tipped face down / tipped over to its side, radians
         jaw 0..1         how far the lower lip has dropped (0.44 at rest)   curve -1..1   the mouth's corners down .. up
         lid 0..1         how open the eyes are                              brow         one eye more open than the other
         slant -1..1      sad .. angry eyes                                   smile 0..1   eyes bent into laughing arches
         size             how big the eyes are (1)                            flare -1..1  the hood drooped .. bristled
         scale            how big the whole head is (1): it can draw in small, to hide in the bud
         gazeX, gazeY -1..1   where the eyes look without the head turning: toward its own -x .. +x, down .. up
         bow (Vector3)    where the middle of its neck is pushed to, metres  glow 0..1    how brightly its eyes burn
         flash 0..1       it and its neck lit up white (it was struck)       wither 0..1  its and its neck's colours dried out (it is beaten)
     boss.userData.vines[0..1]                     the two whip vines (toward +x, toward -x), under the ground until they are used
         foot (Vector3)   where it leaves the ground                         length       how long it is, metres
         p1, p2, p3 (Vector3)   the curve it lies along: from its foot (at height footY) by p1 and p2 to its end p3
         width 0..1       how thick it is drawn (0: not at all)              footY        the height of its foot
     boss.userData.body                            the whole of it
         skirt -1..1      the skirt's leaves wilted to the ground .. as built .. curled up and in, shut into a bud over the necks
         swirl 0..1       closing, the leaves go one after another round the ring and wind round the bud (0: all together, straight)
         glow 0..1        the skirt lit from within: its midribs and veins burn
         wither 0..1      its colours dried out                              flash 0..1   lit up white (it was struck)
         sink             metres it stands down in the ground                shake (Vector3)   moved off its place (a rumble)
         leaves[0..2]     the skirt's leaves under each head (the middle one's in front, the others' to its sides):
                          lift (radians: raised like hackles; less than 0: drooped), stir 0..1 (how hard they tremble)
         ring             the same, for the whole skirt all round: { lift, stir }
     boss.userData.pose()                          writes those numbers into the shader: call it after changing them
     aimHead(head, point, share, most)             how to pose a head to look at a point (see the function)
     setPlantBossSun(vec3)                         world direction toward the sun (as setAnimeSun)
     setPlantBossMotion(k)                         0: stands still .. 1: sways (as it starts)
     every frame: stylized-nature's update(dt)     (it moves on the same time and wind as the other plants)
   (plant-boss-talk.js acts with these: the three heads talking. plant-boss-moves.js: how it fights.)

   How it is made
     - ONE head (buildHead): pod, mouth, eyes, hood, curl. It is built three times, once on the end of each neck, each
       with its own size, turn and dice. A neck is a tube along a curve; so is a thorn and a root. A leaf is a curved
       sheet along a spine (the hood's lie over the pod, the skirt's arch out and droop, the curl winds into a hook).
     - the mouth is a real hole: the pod's shell is cut by a jagged band worked out in the shader (so its edge is sharp
       however near the eye is, and the lip can move), and a dark shell inside carries the eyes, so they shift behind
       the lip as the eye moves. The eyes are drawn there too: an oval, cut by a lid, bent into an arch when it laughs

   How it is drawn, the kit's way: flat tones, not smooth light.
     - necks and pods: four greens stepped by the light, their edges ragged with long brush strokes laid along the wood
     - leaves: the game's five leaf tones, stepped the same way with strokes along the leaf, a light midrib, the
       underside darker; the skirt's leaves turn through yellow to coral red toward the tip
     - roots: the bark's three tones in long strokes, moss on what faces up
     - thorns: three pale bone tones
   How it moves (the vertex shader): a neck waves as an octopus's arm does: a slow bend that travels from its foot to
   its end, wider toward the end, never the same on two necks. Its head rides the neck's end and leans as the end
   leans. Leaves flutter toward their tips; the eyes blink. Over that, each head is carried and turned by its own
   numbers (above). The wind makes all of it larger, never still: it is alive.
   A neck bends as a limb does, not as a sheared stack: every ring of it is carried with the neck's middle line and
   turned to stay square to it, so it keeps its thickness however far it reaches (and its thorns go with it). A whip
   vine is built standing straight and laid along its curve the same way. A skirt leaf turns about its foot: the
   skirt breathes (a slow swell that goes round the ring), and its leaves can be raised, drooped and set trembling,
   those under each head by that head's own numbers (a leaf between two heads takes some of each).
   ========================================================================== */
import * as THREE from 'three';
import { mulberry32, uniforms as natureUniforms, NATURE_VCOMMON, NATURE_HAZEF, _internal as natureInternal } from './stylized-nature.js';

const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const range = (rng, a, b) => a + rng() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const BOSS_HEIGHT = 7;                 // metres at size 1, foot to the top of the middle head's curl
const H = BOSS_HEIGHT;

// the look: every colour it is painted with (deep -> lit)
export const BOSS_LOOK = {
  stem: ['#3f5f27', '#5f8730', '#87ab38', '#b3cc48'],                    // necks and pods
  leaf: ['#2c4520', '#466533', '#728e3e', '#a6b822', '#dde43a'],         // the game's tree tones (anime-tree.js: ANIME_PALETTES.tree)
  tip: ['#9c3a34', '#d9553f', '#f2805a'], tipBand: '#e2b23f',            // the skirt's leaf tips, and the band before them
  wood: ['#55322a', '#7f4e30', '#a87242', '#d0a06a'],                    // roots: shade, body, light, dry-brush light
  moss: ['#6c8a35', '#a9bd3c'],
  thorn: ['#a08a62', '#d9c79a', '#f6ecc9'],
  mouth: ['#2a2811', '#444119'],                                         // the hollow: deep, and where light gets in
  eye: ['#7d7a1f', '#ffe536', '#fff8ad'],                                // glow round an eye, the eye, its hot middle
};

// part numbers (aPart.x)
const STEM = 0, THORN = 1, POD = 2, MOUTH = 3, HOOD = 4, SKIRT = 5, WOOD = 6;

// --------------------------------------------------------------------------
// the shaders
// --------------------------------------------------------------------------
const VS = /* glsl */`
${NATURE_VCOMMON}
uniform float uMove;
uniform vec4 uBody;                         // x: the skirt (-1 wilted .. 0 as built .. 1 shut into a bud), y: withered 0..1, z: flash 0..1, w: the skirt's glow 0..1
uniform float uSwirl;                       // closing, the skirt's leaves go one after another and wind round the bud 0..1
uniform vec4 uLeafLift;                     // the skirt's leaves raised (radians; less than 0: drooped): xyz those under each head, w all round
uniform vec4 uLeafStir;                     // how hard they tremble 0..1: the same
uniform vec3 uLeafAz;                       // where round the ring each head's leaves are (radians from +z toward +x)
uniform vec4 uPose0, uPose1, uPose2;        // a head's: xyz where its neck's end is carried to (metres), w how wide its neck waves
uniform vec4 uBow0, uBow1, uBow2;           // xyz where the middle of its neck is pushed to (metres), w how withered it is
uniform mat3 uTurn0, uTurn1, uTurn2;        // how it is turned about its neck's end
uniform vec4 uFaceA0, uFaceA1, uFaceA2;     // jaw, lid, slant, smile
uniform vec4 uFaceB0, uFaceB1, uFaceB2;     // eye size, hood flare, brow, mouth corners
uniform vec4 uFaceC0, uFaceC1, uFaceC2;     // where the eyes look: sideways, up; z: how brightly they burn; w: how lit up it is (struck)
uniform vec4 uVineA0, uVineA1;              // a whip vine's curve: xyz its second point, w how thick it is drawn (0: not at all)
uniform vec4 uVineB0, uVineB1;              // xyz its third point, w the height of its foot
uniform vec4 uVineC0, uVineC1;              // xyz its end
attribute vec3 aPaint;      // where the brush is: a tube's (cos, sin round it, metres along it), a leaf's (metres across, metres along, its own number), a pod's direction out from its middle
attribute vec2 aUV;         // a leaf's (-1..1 across, 0..1 along); a tube's (round it 0..1, along it 0..1)
attribute vec4 aPart;       // x: which part, y: shade it stands in 0..1, z: its own dice 0..1, w: which limb it belongs to (0, 1, 2: a head and its neck; 3, 4: a whip vine; -1: none)
attribute vec4 aAnim;       // x: how far along its limb 0..1, y: the limb's beat 0..1, z: 1 = part of a head, w: how much it flutters
attribute vec3 aPivot;      // what it is carried by: a neck's or a vine's middle line there; a head's neck end; a skirt leaf's foot
attribute vec3 aAxis;       // the way that middle line runs there, times the limb's length; a skirt leaf's: the hinge it turns about
varying vec3 vN;
varying vec3 vV;
varying vec3 vPaint;
varying vec2 vUV;
varying vec4 vPart;
varying vec4 vFaceA;
varying vec4 vFaceB;
varying vec4 vFaceC;
varying vec2 vHurt;         // a head's and its neck's own: x lit up (struck), y withered (beaten)
varying float vBlink;
// the least turn that takes direction a to direction b
mat3 turnTo(vec3 a, vec3 b) {
  vec3 v = cross(a, b);
  float c = dot(a, b), k = 1.0 / max(1.0 + c, 0.04);
  return mat3(v.x * v.x * k + c, v.y * v.x * k + v.z, v.z * v.x * k - v.y,
              v.x * v.y * k - v.z, v.y * v.y * k + c, v.z * v.y * k + v.x,
              v.x * v.z * k + v.y, v.y * v.z * k - v.x, v.z * v.z * k + c);
}
// a turn by angle a about the axis k
mat3 hinge(vec3 k, float a) {
  float c = cos(a), s = sin(a), m = 1.0 - c;
  return mat3(m * k.x * k.x + c, m * k.y * k.x + s * k.z, m * k.z * k.x - s * k.y,
              m * k.x * k.y - s * k.z, m * k.y * k.y + c, m * k.z * k.y + s * k.x,
              m * k.x * k.z + s * k.y, m * k.y * k.z - s * k.x, m * k.z * k.z + c);
}
// a neck's wave, as an octopus's arm: a slow bend that travels from the foot (t 0) to the end (t 1), turning as it goes
// (side to side and to and fro are out of step), a quicker ripple over it. Widest past the neck's middle: the head is
// heavy, so the end swings less than the neck under it, and the neck is seen to bend in an S. Metres at size 1
vec3 waveAt(float t, float ph, float T) {
  float wide = 3.6 * t * sqrt(t) * (1.0 - t) + 0.5 * t * t;
  return vec3(sin(T * 0.85 + ph - t * 4.4) * 0.62 + sin(T * 1.9 + ph * 1.7 - t * 6.4) * 0.09,
              sin(T * 1.1 + ph * 2.3 - t * 2.2) * 0.05,
              cos(T * 0.67 + ph * 1.3 - t * 3.9) * 0.46 + sin(T * 1.5 + ph * 0.7 - t * 5.4) * 0.08) * wide;
}
// where a neck's middle line is carried to, t along it: its wave; its end's reach (most at the end); its middle's push
// (none at the foot or the end)
vec3 bendAt(float t, vec3 reach, vec3 bow, float ph, float T, float amp) {
  return waveAt(t, ph, T) * amp + reach * t * t + bow * (4.0 * t * t * (1.0 - t));
}
void main() {
  float limb = aPart.w;
  vec4 fa = limb < 0.5 ? uFaceA0 : (limb < 1.5 ? uFaceA1 : uFaceA2);
  vec4 fb = limb < 0.5 ? uFaceB0 : (limb < 1.5 ? uFaceB1 : uFaceB2);
  float ph = objPhase() + aAnim.y * 6.2831;
  float T = uTime;
  float k = (0.6 + 0.4 * uWind) * uMove;
  vec3 p = position, n = normal;
  // a leaf flutters toward its tip, along its own face; a head's leaves lift off it when its hood bristles
  p += n * (sin(T * 1.5 + aPart.z * 40.0 + aUV.y * 2.2) * 0.06 * k + fb.y * 0.5 * aAnim.z) * aAnim.w;
  if (limb > 2.5) {
    // a whip vine: built standing straight up, laid along its curve (foot, second and third points, end)
    vec4 va = limb < 3.5 ? uVineA0 : uVineA1, vb = limb < 3.5 ? uVineB0 : uVineB1, vc = limb < 3.5 ? uVineC0 : uVineC1;
    float t = aAnim.x, u = 1.0 - t;
    vec3 P0 = vec3(aPivot.x, vb.w, aPivot.z);
    vec3 C = u * u * u * P0 + 3.0 * u * u * t * va.xyz + 3.0 * u * t * t * vb.xyz + t * t * t * vc.xyz;
    vec3 dC = 3.0 * u * u * (va.xyz - P0) + 6.0 * u * t * (vb.xyz - va.xyz) + 3.0 * t * t * (vc.xyz - vb.xyz);
    mat3 R = turnTo(vec3(0.0, 1.0, 0.0), normalize(dC + vec3(0.0, 1e-3, 0.0)));
    p = C + R * ((p - aPivot) * va.w);
    n = R * n;
  } else if (limb > -0.5) {
    // a neck and its head: the neck's middle line is carried (wave, reach, push), and what is on it turns with it
    vec4 pose = limb < 0.5 ? uPose0 : (limb < 1.5 ? uPose1 : uPose2);
    vec3 bow = (limb < 0.5 ? uBow0 : (limb < 1.5 ? uBow1 : uBow2)).xyz;
    float amp = k * pose.w;
    float t = aAnim.z > 0.5 ? 1.0 : aAnim.x, t0 = max(t - 0.03, 0.0), t1 = t + 0.03;
    vec3 D = bendAt(t, pose.xyz, bow, ph, T, amp);
    vec3 dD = (bendAt(t1, pose.xyz, bow, ph, T, amp) - bendAt(t0, pose.xyz, bow, ph, T, amp)) / (t1 - t0);      // how the bend changes along it
    vec3 was = normalize(aAxis);
    if (aAnim.z > 0.5) {
      // a head: turned as its own numbers say, then carried on the neck's end; it leans half as far as the end does
      // (its face stays readable)
      mat3 R = turnTo(was, normalize(aAxis + dD * 0.5));
      mat3 turn = limb < 0.5 ? uTurn0 : (limb < 1.5 ? uTurn1 : uTurn2);
      p = aPivot + D + R * (turn * (p - aPivot));
      n = R * (turn * n);
    } else {
      mat3 R = turnTo(was, normalize(aAxis + dD));
      p = aPivot + D + R * (p - aPivot);
      n = R * n;
    }
  } else if (aPart.x > 4.5 && aPart.x < 5.5) {
    // a skirt leaf. Down (less than 0): it turns about its foot, wilting. Up (more than 0): it curls up and in, hardly
    // at all near its foot and far over at its tip, so that all of them together shut into a bud over the necks.
    // With swirl they go one after another round the ring, and wind round the bud as they shut
    float s = aUV.y, c = uBody.x, az = atan(aPivot.x, aPivot.z);               // (az: where round the ring its foot is)
    if (c > 0.0) {
      c = clamp(c * (1.0 + 0.6 * uSwirl) - 0.6 * uSwirl * fract(az / 6.2831 + 0.5), 0.0, 1.0);
      c = c * c * (3.0 - 2.0 * c);
    }
    float turn = c > 0.0 ? -c * 2.02 * s * s : -c * 0.62;
    // alive (open as built; not shut into a bud or wilted): it breathes, a slow swell going round the ring; raised or
    // drooped and trembling as the head over it has it (a leaf between two heads: some of each), more toward its tip
    vec3 near = pow(0.5 + 0.5 * cos(az - uLeafAz), vec3(2.0));
    near /= max(1.0, near.x + near.y + near.z);
    float lift = dot(near, uLeafLift.xyz) + uLeafLift.w, stir = min(dot(near, uLeafStir.xyz) + uLeafStir.w, 1.5);
    float alive = 1.0 - min(abs(uBody.x) * 1.5, 1.0);
    turn -= (lift * (0.35 + 0.65 * s) + sin(T * 0.9 + az * 2.0 + ph) * 0.028 * k * s
           + sin(T * 37.0 + aPart.z * 40.0 - s * 5.0) * 0.05 * stir * s) * alive;
    mat3 R = hinge(aAxis, turn);
    p = aPivot + R * (p - aPivot);
    n = R * n;
    if (c > 0.0 && uSwirl > 0.0) { mat3 W = hinge(vec3(0.0, 1.0, 0.0), c * uSwirl * 0.9 * s); p = W * p; n = W * n; }
  }
  // the eyes blink: shut for a moment every few seconds, each head in its own time
  float b = abs(fract(T * 0.21 + aAnim.y * 3.7) - 0.5);
  vBlink = 1.0 - 0.93 * (1.0 - smoothstep(0.0, 0.028, b)) * step(0.001, uMove);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp;
  vN = normalize(mat3(modelMatrix) * n);
  vV = normalize(cameraPosition - wp.xyz);
  vPaint = aPaint; vUV = aUV; vPart = aPart; vFaceA = fa; vFaceB = fb;
  bool own = limb > -0.5 && limb < 2.5;                               // (a head and its neck have their own; the rest of it, none)
  vFaceC = !own ? vec4(0.0, 0.0, 1.0, 0.0) : (limb < 0.5 ? uFaceC0 : (limb < 1.5 ? uFaceC1 : uFaceC2));
  vHurt = !own ? vec2(0.0) : vec2(vFaceC.w, limb < 0.5 ? uBow0.w : (limb < 1.5 ? uBow1.w : uBow2.w));
  vHaze = hazeAt(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FS = /* glsl */`
${natureInternal.NOISE}
${NATURE_HAZEF}
uniform vec3 uSun;
uniform vec3 uS0, uS1, uS2, uS3;
uniform vec3 uL0, uL1, uL2, uL3, uL4;
uniform vec3 uR0, uR1, uR2, uRB;
uniform vec3 uW0, uW1, uW2, uW3, uM0, uM1;
uniform vec3 uT0, uT1, uT2;
uniform vec3 uD0, uD1;
uniform vec3 uE0, uE1, uE2;
uniform vec4 uBody;         // y: withered 0..1, z: flash 0..1, w: the skirt's glow 0..1
varying vec3 vN;
varying vec3 vV;
varying vec3 vPaint;
varying vec2 vUV;
varying vec4 vPart;
varying vec4 vFaceA;        // this head's jaw, lid, slant, smile
varying vec4 vFaceB;        // its eye size, hood flare, brow, mouth corners
varying vec4 vFaceC;        // where its eyes look: sideways, up; z: how brightly they burn
varying vec2 vHurt;         // x: lit up (struck), y: withered (beaten): this head's and its neck's own
varying float vBlink;
float noise3(vec3 x) {                                                // (the bark's: NOISE's exact arithmetic, the same on every chip)
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec4 c = m289(vec4(i.x, i.x + 1.0, i.y, i.y + 1.0));
  vec4 h = perm289(m289(perm289(c.xyxy) + c.zzww));
  vec4 lo = perm289(m289(h + m289(i.z))), hi = perm289(m289(h + m289(i.z + 1.0)));
  vec4 v = mix(lo, hi, f.z) * (1.0 / 289.0);
  return mix(mix(v.x, v.y, f.x), mix(v.z, v.w, f.x), f.y);
}
// a step from one flat tone to the next, a hair soft so it does not crawl
float edge(float e, float v) { return smoothstep(e - 0.012, e + 0.012, v); }
vec3 stemTone(float v) {
  vec3 c = mix(uS0, uS1, edge(0.34, v));
  c = mix(c, uS2, edge(0.54, v));
  return mix(c, uS3, edge(0.80, v));
}
vec3 leafTone(float v) {
  vec3 c = mix(uL0, uL1, edge(0.26, v));
  c = mix(c, uL2, edge(0.43, v));
  c = mix(c, uL3, edge(0.61, v));
  return mix(c, uL4, edge(0.83, v));
}
// the mouth: a jagged band across the pod's face. d: the direction out from the pod's middle (its own: +z the face, +y its top).
// jaw 0..1: how far the lower lip has dropped; curve -1..1: its corners turned down .. up.
// More than 0 inside the hole, less outside; about radians from its edge
float mouthAt(vec3 d, float jaw, float curve) {
  float az = abs(atan(d.x, d.z)), el = asin(clamp(d.y, -1.0, 1.0));
  float span = clamp(1.0 - az / 1.72, 0.0, 1.0);                      // 1 in the middle of the face, 0 at the mouth's corner
  float sq = sqrt(span);                                              // (it closes to a point at each corner)
  float mid = 0.12 + (0.20 + 0.22 * curve) * (1.0 - span) * (1.0 - span);        // the corners turn up: a grin (down: a scowl)
  float teeth = 0.21 * smoothstep(0.0, 0.3, span);
  float lo = mid - mix(0.25, 0.66, jaw) * sq + teeth * abs(fract(az * 1.62) - 0.5) * 2.0;      // lower lip: teeth pointing up (one in the middle)
  float hi = mid + 0.43 * sq - teeth * abs(fract(az * 1.62 + 0.5) - 0.5) * 2.0;                // upper lip: teeth pointing down, between them
  return min(el - lo, hi - el);
}
void main() {
  vec3 n = normalize(vN);
  bool back = !gl_FrontFacing;
  if (back) n = -n;
  float part = vPart.x, shade = vPart.y, dice = vPart.z;
  float sun = dot(n, uSun);
  float lam = sun * 0.5 + 0.5, sky = n.y * 0.5 + 0.5;
  float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0);
  vec3 col;
  float alpha = 1.0;
  if (part < 0.5) {
    // a neck: long strokes laid along it break the edge between one green and the next
    float st = noise3(vec3(vPaint.xy * 0.62, vPaint.z * 0.2) + dice * 9.0) * 0.6 + noise3(vec3(vPaint.xy * 1.7, vPaint.z * 0.55) + 3.7) * 0.4;
    col = stemTone(lam * 0.62 + sky * 0.12 + (st - 0.5) * 0.22 + rim * 0.20 - shade * 0.36 + 0.09);
  } else if (part < 1.5) {
    // a thorn: three bone tones, paler toward its point
    float v = lam + rim * 0.15 + vUV.y * 0.12 - shade * 0.3;
    col = mix(uT0, uT1, edge(0.47, v));
    col = mix(col, uT2, edge(0.74, v));
  } else if (part < 2.5) {
    // a pod: the necks' greens. Its shell is cut by the mouth; the lip catches the light; its top, under the hood, is leaf shade
    vec3 d = normalize(vPaint);
    float m = mouthAt(d, vFaceA.x, vFaceB.w);
    float w = min(max(fwidth(m), 1e-4) * 0.75, 0.03);
    alpha = 1.0 - smoothstep(-w, w, m);
    float st = noise3(d * vec3(2.1, 0.9, 2.1) + dice * 9.0) * 0.6 + noise3(d * vec3(5.2, 2.0, 5.2) + 3.7) * 0.4;      // (strokes that run down it)
    float v = lam * 0.62 + sky * 0.12 + (st - 0.5) * 0.20 + rim * 0.20 - shade * 0.40 + 0.09;
    col = stemTone(v + (1.0 - smoothstep(0.0, 0.085, -m)) * 0.26);
    col = mix(col, mix(uL0, uL1, edge(0.5, v + 0.25)), smoothstep(0.42, 0.62, d.y));
    if (back) col = uD0;                                              // the shell's inside, seen through the mouth
  } else if (part < 3.5) {
    // the hollow behind the mouth, and the eyes on it
    vec3 d = normalize(vPaint);
    float az = abs(atan(d.x, d.z)), el = asin(clamp(d.y, -1.0, 1.0));
    float st = noise3(d * 3.0 + dice * 9.0);
    col = mix(uD0, uD1, edge(0.5, 0.55 - el * 0.9 + (st - 0.5) * 0.5 - az * 0.12));
    // an eye: an oval; the lid comes down over it (slanted: angry, or sad the other way); laughing, it is wider and a
    // bite is taken out of it from below, which leaves an arch. brow: one eye more open than the other. Both eyes slide
    // over the hollow to where it looks
    float side = atan(d.x, d.z) - vFaceC.x * 0.17, ea = abs(side);
    float lid = clamp(vFaceA.y + vFaceB.z * sign(side), 0.0, 1.0) * vBlink, slant = vFaceA.z, smile = vFaceA.w, size = vFaceB.x;
    vec2 e = vec2((ea - 0.40) / (0.098 * size * (1.0 + 0.55 * smile)), (el - 0.15 - 0.03 * smile - vFaceC.y * 0.07) / (0.2 * size * (1.0 - 0.15 * smile)));
    float glow = 1.0 - smoothstep(0.9, 2.3, length(e));
    float inOval = 1.0 - length(e);
    float underLid = ((2.0 * lid - 1.0) + slant * 0.9 * e.x - e.y) * 0.7;
    float notBitten = length(e - vec2(0.0, -0.85)) - 1.3 * smile;
    float m = min(inOval, min(underLid, notBitten)), aa = max(fwidth(m), 1e-4);
    float burn = vFaceC.z;
    col = mix(col, uE0, glow * (0.3 + 0.35 * lid) * min(size, 1.3) * burn);
    col = mix(col, mix(uE0 * 0.8, uE1, burn), smoothstep(-aa, aa, m));
    col = mix(col, uE2, smoothstep(-aa, aa, m - 0.44) * burn);
  } else if (part < 5.5) {
    // a leaf: the five tones, strokes along it; a light midrib; the underside darker. The skirt's turn red toward the tip
    float u = vUV.x, s = vUV.y;
    float st = noise3(vec3(vPaint.x * 1.5, vPaint.y * 0.42, vPaint.z)) * 0.62 + noise3(vec3(vPaint.x * 4.0, vPaint.y * 1.1, vPaint.z + 5.0)) * 0.38;
    float v = lam * 0.46 + sky * 0.16 + (st - 0.5) * 0.30 + (1.0 - abs(u)) * 0.06 + sin(s * 3.1416) * 0.04 - shade * 0.42 + (dice - 0.5) * 0.14;      // (each leaf a touch lighter or darker than the next)
    v -= u * u * u * u * 0.10;                                        // (its edges a touch deeper: it tucks under its neighbours)
    if (back) v -= part > 4.5 ? 0.13 : 0.24;                           // (the skirt's underside less: shut into a bud, it is what shows)
    col = leafTone(v);
    float tip = 0.0;
    if (part > 4.5) {
      // (the red comes farther down the leaf along its edges than along its midrib)
      float t = s + u * u * 0.26 * s + (noise3(vec3(vPaint.x * 1.1, vPaint.y * 0.55, vPaint.z + 11.0)) - 0.5) * 0.14;
      col = mix(col, uRB * (back ? 0.78 : 1.0), edge(0.755, t) * 0.9);
      vec3 red = mix(uR0, uR1, edge(0.36, v));
      red = mix(red, uR2, edge(0.62, v));
      tip = edge(0.81, t);
      col = mix(col, red, tip);
    }
    float rib = (1.0 - smoothstep(0.03, 0.055, abs(u))) * smoothstep(0.03, 0.14, s) * (1.0 - smoothstep(0.80, 0.97, s));
    // side veins: thin lines that leave the midrib and sweep toward the tip, faint
    float q = s * (part > 4.5 ? 7.0 : 5.0) - abs(u) * 1.9, fq = max(fwidth(q), 1e-4);
    float vein = (1.0 - smoothstep(0.035, 0.035 + fq * 1.5, abs(fract(q) - 0.5))) * smoothstep(0.06, 0.2, abs(u)) * (1.0 - smoothstep(0.6, 0.9, abs(u))) * (1.0 - smoothstep(0.25, 0.6, fq));
    if (!back) col = mix(col, mix(leafTone(v + 0.2), uR2, tip), max(rib * 0.8, vein * 0.3));
    if (part > 4.5 && uBody.w > 0.001) {
      // the skirt lit from within (both its faces: shut into a bud, it is the undersides that show): its midrib and
      // veins burn, light soaks out from the midrib, its red tip glows
      float g = uBody.w, soak = (1.0 - smoothstep(0.0, 0.8, abs(u))) * smoothstep(0.02, 0.3, s);
      vec3 lit = mix(uE1, vec3(1.0, 0.98, 0.8), 0.35);
      col = mix(col, mix(col * 1.2 + uE0 * 0.3, lit, 0.4), g * soak * 0.6);
      col = mix(col, lit, g * max((1.0 - smoothstep(0.03, 0.09, abs(u))) * smoothstep(0.03, 0.14, s) * (1.0 - smoothstep(0.85, 0.98, s)), vein * 0.85));
      col = mix(col, vec3(1.0, 0.62, 0.3), g * tip * 0.55);
    }
  } else {
    // roots: the bark's long strokes, the sun only nudging which tone wins; moss on what faces up
    vec3 q = vec3(vPaint.xy, vPaint.z * 0.3);
    float st = noise3(q * vec3(0.9, 0.9, 0.5) + dice * 9.0) * 0.46 + noise3(q * vec3(2.2, 2.2, 1.3) + 7.3) * 0.38 + noise3(q * vec3(5.0, 5.0, 3.0) + 3.1) * 0.16;
    float t = 0.55 + (st - 0.5) * 1.15 + (sun - 0.3) * 0.18 + (sky - 0.5) * 0.22 - shade * 0.3;
    col = mix(uW0, uW1, smoothstep(0.37, 0.43, t));
    col = mix(col, uW2, smoothstep(0.58, 0.64, t));
    col = mix(col, uW3, smoothstep(0.74, 0.79, t) * smoothstep(0.0, 0.5, sun) * 0.85);
    float m = n.y * 0.75 + (noise3(q * 1.4 + 21.0) - 0.5) * 1.2 - 0.7 - shade * 0.5;
    col = mix(col, mix(uM0, uM1, smoothstep(0.1, 0.45, sun)), smoothstep(0.0, 0.06, m));
  }
  if (alpha < 0.02) discard;
  // withered: its colours dried to straw and brown. Struck: lit up for a moment. (All of it, or one head and its neck)
  col = mix(col, dot(col, vec3(0.3, 0.55, 0.15)) * vec3(1.05, 0.88, 0.62), max(uBody.y, vHurt.y) * 0.85);
  col = mix(col, vec3(1.0, 0.97, 0.84), max(uBody.z, vHurt.x) * 0.75);
  gl_FragColor = vec4(mix(col, uHaze, vHaze), alpha);
}`;

// the sun and how much they move: one for every boss. A material for each boss: it carries its own heads' numbers
const SUN = { value: new THREE.Vector3(-0.55, 0.7, 0.45).normalize() };
const MOVE = { value: 1 };
export function setPlantBossSun(v) { SUN.value.copy(v); if (SUN.value.y < 0.12) SUN.value.y = 0.12; SUN.value.normalize(); }
export function setPlantBossMotion(k) { MOVE.value = Math.min(1, Math.max(0, +k || 0)); }
const REST = { wave: 1, yaw: 0, nod: 0, tilt: 0, jaw: 0.44, lid: 1, slant: 0, smile: 0, size: 1, flare: 0, brow: 0, curve: 0, gazeX: 0, gazeY: 0, glow: 1, flash: 0, wither: 0, scale: 1 };   // a head as it starts
export const BOSS_HEAD_REST = REST;
function material() {
  const L = BOSS_LOOK, U = { ...natureUniforms, uSun: SUN, uMove: MOVE, uBody: { value: new THREE.Vector4(0, 0, 0, 0) }, uSwirl: { value: 0 },
    uLeafLift: { value: new THREE.Vector4(0, 0, 0, 0) }, uLeafStir: { value: new THREE.Vector4(0, 0, 0, 0) }, uLeafAz: { value: new THREE.Vector3(0, 1.3, -1.3) } };
  const set = (names, cols) => names.forEach((nm, i) => { U[nm] = { value: rgb(cols[i]) }; });
  set(['uS0', 'uS1', 'uS2', 'uS3'], L.stem);
  set(['uL0', 'uL1', 'uL2', 'uL3', 'uL4'], L.leaf);
  set(['uR0', 'uR1', 'uR2', 'uRB'], [...L.tip, L.tipBand]);
  set(['uW0', 'uW1', 'uW2', 'uW3', 'uM0', 'uM1'], [...L.wood, ...L.moss]);
  set(['uT0', 'uT1', 'uT2'], L.thorn);
  set(['uD0', 'uD1'], L.mouth);
  set(['uE0', 'uE1', 'uE2'], L.eye);
  for (let i = 0; i < 3; i++) {                                       // (one of each for each head: no arrays, as the kit's shaders)
    U['uPose' + i] = { value: new THREE.Vector4(0, 0, 0, REST.wave) };
    U['uBow' + i] = { value: new THREE.Vector4(0, 0, 0, 0) };
    U['uTurn' + i] = { value: new THREE.Matrix3() };
    U['uFaceA' + i] = { value: new THREE.Vector4(REST.jaw, REST.lid, REST.slant, REST.smile) };
    U['uFaceB' + i] = { value: new THREE.Vector4(REST.size, REST.flare, REST.brow, REST.curve) };
    U['uFaceC' + i] = { value: new THREE.Vector4(REST.gazeX, REST.gazeY, REST.glow, 0) };
  }
  for (let i = 0; i < 2; i++) for (const nm of ['uVineA', 'uVineB', 'uVineC']) U[nm + i] = { value: new THREE.Vector4(0, -1, 0, nm === 'uVineB' ? -1 : 0) };      // (under the ground, drawn to nothing)
  // (both sides: a leaf has an underside, and the pod's shell is seen from inside through the mouth. The mouth's edge is
  // smoothed by coverage, as the kit's leaf cards are: a scene needs createAlphaFix())
  return new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide, alphaToCoverage: true });
}

// --------------------------------------------------------------------------
// the builders: everything goes into one set of arrays
// --------------------------------------------------------------------------
const newArrays = () => ({ pos: [], nor: [], paint: [], uv: [], part: [], anim: [], pivot: [], axis: [], idx: [], n: 0, head: -1 });      // head: which limb what is added now belongs to
function vert(B, p, n, paint, uv, part, anim, pivot = null, axis = null) {
  B.pos.push(p.x, p.y, p.z); B.nor.push(n.x, n.y, n.z);
  B.paint.push(paint[0], paint[1], paint[2]); B.uv.push(uv[0], uv[1]);
  B.part.push(part[0], part[1], part[2], B.head); B.anim.push(anim[0], anim[1], anim[2], anim[3]);
  B.pivot.push(pivot ? pivot.x : 0, pivot ? pivot.y : 0, pivot ? pivot.z : 0);
  B.axis.push(axis ? axis.x : 0, axis ? axis.y : 0, axis ? axis.z : 0);
  return B.n++;
}

// a sheet of (NU + 1) x (NV + 1) points: at(i, j) -> { p, fallback, paint, uv, shade, anim, pivot, axis }. Its face is the side that
// sees i run to the right and j run up. A point's normal is taken from its neighbours (fallback: where the sheet has
// closed to a point)
function addSheet(B, NU, NV, at, part, dice, wrap = false) {
  const base = B.n, P = [];
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) P.push(at(i, j));
  const g = (i, j) => P[Math.min(NV, Math.max(0, j)) * (NU + 1) + (wrap ? (i + NU) % NU : Math.min(NU, Math.max(0, i)))].p;
  const du = new THREE.Vector3(), dv = new THREE.Vector3(), n = new THREE.Vector3();
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const q = P[j * (NU + 1) + i];
    du.subVectors(g(i + 1, j), g(i - 1, j)); dv.subVectors(g(i, j + 1), g(i, j - 1));
    n.crossVectors(du, dv);
    if (n.lengthSq() < 1e-10) n.copy(q.fallback); else { n.normalize(); if (q.fallback && n.dot(q.fallback) < 0) n.negate(); }
    vert(B, q.p, n, q.paint, q.uv, [part, q.shade, dice], q.anim, q.pivot, q.axis);
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = base + j * (NU + 1) + i, b = a + NU + 1;
    B.idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
}

// a tube along a curve. radius(t) metres; ref: a direction laid flat across the tube all along it (no twist); shade(t, a);
// anim(t) -> [along its limb, beat, 0, 0]; close: its end drawn to a point. spine: it is a limb's own middle line (each
// ring is carried by its own middle); rides: { pivot, axis }: all of it is carried by one place on a limb (a thorn)
function addTube(B, { curve, rings, sides, radius, ref, part, dice = 0, shade = () => 0, anim = () => [0, 0, 0, 0], close = true, spine = false, rides = null }) {
  const len = curve.getLength(), frames = [];
  const last = V3(1, 0, 0);
  for (let j = 0; j <= rings; j++) {
    const t = j / rings, c = curve.getPointAt(t), T = curve.getTangentAt(t);
    const N = ref.clone().addScaledVector(T, -ref.dot(T));
    if (N.lengthSq() < 1e-6) N.copy(last).addScaledVector(T, -last.dot(T));
    N.normalize(); last.copy(N);
    const r = radius(t), slope = (radius(Math.min(1, t + 0.01)) - radius(Math.max(0, t - 0.01))) / (0.02 * len);
    frames.push({ t, c, T, N, Bn: new THREE.Vector3().crossVectors(T, N), r, slope,
      pivot: spine ? c : (rides ? rides.pivot : null), axis: spine ? T.clone().multiplyScalar(len) : (rides ? rides.axis : null) });
  }
  addSheet(B, sides, rings, (i, j) => {
    const f = frames[j], a = (i / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const out = f.N.clone().multiplyScalar(ca).addScaledVector(f.Bn, sa);
    return {
      p: f.c.clone().addScaledVector(out, f.r), fallback: out.clone().addScaledVector(f.T, -f.slope).normalize(),
      paint: [ca, sa, f.t * len], uv: [i / sides, f.t], shade: shade(f.t, a), anim: anim(f.t), pivot: f.pivot, axis: f.axis,
    };
  }, part, dice, true);
  if (close) {
    const f = frames[rings], ring = B.n - (sides + 1);
    const tip = vert(B, f.c.clone().addScaledVector(f.T, f.r * 0.7), f.T, [0, 0, len], [0.5, 1], [part, shade(1, 0), dice], anim(1), f.pivot, f.axis);
    for (let i = 0; i < sides; i++) B.idx.push(ring + i, ring + i + 1, tip);
  }
}

// a leaf: a sheet along a spine. frame(s) -> { c, T, up } (up: the way its top face looks, about); half(s): half its width;
// bend(s, x, w): how far a point x across lies off the spine along the leaf's own up; hinge: { pivot, axis }: its foot and
// the line it turns about there
function addLeaf(B, { frame, half, bend, NU = 6, NV = 12, part, dice, shade = () => 0, flutter = s => s * s, length, hinge = null }) {
  const rows = [];
  for (let j = 0; j <= NV; j++) {
    const s = j / NV, f = frame(s);
    const up = f.up.clone().addScaledVector(f.T, -f.up.dot(f.T)).normalize();
    rows.push({ s, c: f.c, up, side: new THREE.Vector3().crossVectors(f.T, up), w: half(s) });
  }
  addSheet(B, NU, NV, (i, j) => {
    const r = rows[j], u = (i / NU) * 2 - 1, x = u * r.w;
    return {
      p: r.c.clone().addScaledVector(r.side, x).addScaledVector(r.up, bend(r.s, x, r.w)), fallback: r.up,
      paint: [x, r.s * length, dice * 31.7], uv: [u, r.s], shade: shade(r.s, u), anim: [0, 0, 0, flutter(r.s)],
      pivot: hinge ? hinge.pivot : null, axis: hinge ? hinge.axis : null,
    };
  }, part, dice);
}
// a leaf's outline: 0 at its foot and its tip, widest at 'at' of its length
const leafShape = (s, at = 0.42, round = 0.8) => Math.pow(Math.sin(Math.PI * Math.pow(s, Math.log(0.5) / Math.log(at))), round);

// a direction on a ball: az round it from +z toward +x, el up from its middle
const ballDir = (az, el) => V3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
function numTangent(fn, s, h = 0.01) { return fn(Math.min(1, s + h)).sub(fn(Math.max(0, s - h))).normalize(); }

// --------------------------------------------------------------------------
// ONE head, about its own middle: +y its top, +z its face. R: the pod's radius in metres
// --------------------------------------------------------------------------
const POD_FLAT = 0.94;                        // a pod is a little lower than it is wide
function buildHead(rng, R) {
  const B = newArrays(), dice = rng();
  const onPod = (az, el, rho) => { const d = ballDir(az, el).multiplyScalar(rho * R); d.y *= POD_FLAT; return d; };
  // the pod's shell (the mouth is cut out of it in the shader), in the shade of its hood toward the top
  addSheet(B, 28, 16, (i, j) => {
    const az = -Math.PI + (i / 28) * Math.PI * 2, el = -Math.PI / 2 + (j / 16) * Math.PI, d = ballDir(az, el);
    return { p: onPod(az, el, 1), fallback: d, paint: [d.x, d.y, d.z], uv: [i / 28, j / 16], shade: sstep(0.0, 0.75, d.y) * 0.5, anim: [0, 0, 0, 0] };
  }, POD, dice, true);
  // the hollow: a dark shell inside, only as much of it as the mouth can show
  addSheet(B, 18, 10, (i, j) => {
    const az = -2.0 + (i / 18) * 4.0, el = -0.8 + (j / 10) * 1.85, d = ballDir(az, el);
    return { p: onPod(az, el, 0.86), fallback: d, paint: [d.x, d.y, d.z], uv: [i / 18, j / 10], shade: 0, anim: [0, 0, 0, 0] };
  }, MOUTH, dice);

  // the hood: leaves that leave the pod's top and lie down over it, their tips lifting off it like a brim. Round the
  // face they stop short (a fringe over the eyes); behind they hang low. An under layer between them, in shade, so
  // no gap shows bare pod
  const hoodLeaf = ({ az, endEl, rho, flare, W, shade, twist = 0 }) => {
    const d = rng(), L = (1.42 - endEl) * R * 1.15;
    const spine = s => onPod(az + twist * s, lerp(1.42, endEl, s), rho + flare * Math.pow(sstep(0.3, 1, s), 1.25));
    addLeaf(B, {
      part: HOOD, dice: d, NU: 6, NV: 12, length: L,
      frame: s => ({ c: spine(s), T: numTangent(spine, s), up: ballDir(az + twist * s, lerp(1.42, endEl, s)) }),
      half: s => W * R * leafShape(s, 0.52, 0.8),
      bend: (s, x) => -(x * x) / (2 * R * rho) * lerp(1.0, 0.3, s * s),        // wrapped round the pod, freer toward the tip
      shade: s => shade + 0.22 * (1 - sstep(0.0, 0.3, s)),
      flutter: s => s * s * 0.8,
    });
  };
  const OUT = 9, IN = 7;
  const hoodEnd = front => -0.55 + 0.85 * Math.pow((front + 1) / 2, 1.7);     // how low a leaf's tip hangs: at the brow in front, well below the pod's middle behind
  for (let i = 0; i < OUT; i++) {
    const az = (i / OUT) * Math.PI * 2 + (i ? (rng() - 0.5) * 0.16 : 0), front = Math.cos(az);       // (the first hangs in the middle of the brow)
    hoodLeaf({
      az, endEl: hoodEnd(front) + (rng() - 0.5) * 0.12, rho: 1.07 + (i % 2) * 0.045, flare: 0.3 + 0.05 * (1 - front) + rng() * 0.08,
      W: range(rng, 0.56, 0.64), shade: 0, twist: (rng() - 0.5) * 0.2,
    });
  }
  for (let i = 0; i < IN; i++) {
    const az = ((i + 0.5) / IN) * Math.PI * 2 + (rng() - 0.5) * 0.2, front = Math.cos(az);
    hoodLeaf({ az, endEl: hoodEnd(front) + 0.14 + (rng() - 0.5) * 0.08, rho: 1.025, flare: 0.17 + 0.04 * (1 - front), W: range(rng, 0.56, 0.64), shade: 0.4, twist: (rng() - 0.5) * 0.2 });
  }
  // a small rosette on the crown, where the hood's leaves meet
  for (let i = 0; i < 5; i++) {
    const az = ((i + 0.5) / 5) * Math.PI * 2 + (rng() - 0.5) * 0.4, out = ballDir(az, 0), d = rng(), L = range(rng, 0.5, 0.66) * R;
    const spine = s => V3(0, POD_FLAT * R * 1.03, 0).addScaledVector(out, L * (0.9 * s)).add(V3(0, L * (0.55 * s - 0.5 * s * s), 0));
    addLeaf(B, {
      part: HOOD, dice: d, NU: 4, NV: 7, length: L,
      frame: s => ({ c: spine(s), T: numTangent(spine, s), up: V3(0, 1, 0) }),
      half: s => 0.2 * R * leafShape(s, 0.45, 0.85), bend: (s, x, w) => -(x * x) / (w + 0.001) * 0.25,
      shade: () => 0, flutter: s => s * s * 0.6,
    });
  }
  // the curl: a leaf that stands up out of the crown, swings over and winds down into a hook. A smaller one the other way
  const curl = (az, k) => {
    const dir = ballDir(az, 0), d = rng(), y0 = POD_FLAT * R * 0.98;
    const pts = [[0, 0], [-0.1, 0.36], [0.02, 0.72], [0.32, 0.92], [0.62, 0.8], [0.72, 0.5], [0.56, 0.3], [0.38, 0.34], [0.35, 0.5]]
      .map(([a, b]) => V3(0, y0, 0).addScaledVector(dir, a * k * R).add(V3(0, b * k * R, 0)));
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), side = new THREE.Vector3().crossVectors(dir, V3(0, 1, 0));
    addLeaf(B, {
      part: HOOD, dice: d, NU: 4, NV: 18, length: c.getLength(),
      frame: s => { const T = c.getTangentAt(s); return { c: c.getPointAt(s), T, up: new THREE.Vector3().crossVectors(side, T) }; },
      half: s => 0.2 * k * R * (0.35 * (1 - s) + leafShape(s, 0.4, 0.9)) * (1 - sstep(0.9, 1, s) * 0.999),
      bend: (s, x, w) => -(x * x) / (w + 0.001) * 0.3,                 // its edges rolled a little toward the inside of the curl
      shade: () => -0.3, flutter: s => s * 0.5,                         // (it stands in the open: lighter than the hood)
    });
  };
  const curlAz = range(rng, -1.0, -0.3) * (rng() < 0.5 ? 1 : -1);
  curl(curlAz, 1.15); curl(curlAz + Math.PI + range(rng, -0.5, 0.5), 0.7);
  return B;
}
// where a neck goes into its pod (the head's own frame): underneath, a little to the back, heading up and forward
const NECK_IN = V3(0, -0.6, -0.26), NECK_FROM = V3(0, -1.55, -0.62);

// --------------------------------------------------------------------------
// the whole boss
// --------------------------------------------------------------------------
// the three heads: where the pod's middle is (parts of the height), its radius, how it is turned (yaw: about y, toward
// +x; pitch: its face tipped down; roll: its top tipped toward -x), its neck's thickness and foot, and its beat
const HEADS = [
  { c: [0.0, 0.752, 0.04], r: 0.126, yaw: 0.0, pitch: 0.2, roll: 0.03, neck: 0.056, beat: 0.13,
    path: [[0.0, 0.05, -0.02], [0.014, 0.21, -0.05], [-0.034, 0.37, -0.06], [0.02, 0.5, -0.065]] },
  { c: [0.297, 0.598, 0.09], r: 0.108, yaw: 0.34, pitch: 0.24, roll: -0.15, neck: 0.049, beat: 0.52,
    path: [[0.04, 0.05, 0.0], [0.125, 0.195, 0.012], [0.248, 0.325, 0.03]] },
  { c: [-0.3, 0.622, 0.075], r: 0.11, yaw: -0.31, pitch: 0.22, roll: 0.14, neck: 0.05, beat: 0.86,
    path: [[-0.04, 0.05, 0.005], [-0.12, 0.2, 0.01], [-0.245, 0.34, 0.025]] },
];
// thorns on each neck: [how far along it, which way round it in degrees: 0 the front, 90 toward +x]
const THORNS = [
  [[0.3, -75], [0.44, 80], [0.57, -100], [0.69, 55], [0.36, 12], [0.52, 175]],
  [[0.3, 125], [0.47, 55], [0.64, 150], [0.4, -25], [0.58, -115]],
  [[0.31, -125], [0.48, -55], [0.65, -150], [0.41, 25], [0.57, 115]],
];

// a thorn on a limb: a bone spike bent toward the limb's end, standing in a small green socket. t: how far along the limb,
// a: which way round it (0: toward ref), r: the limb's radius there; long, wide: the spike's size; all of it rides the limb there
function addThorn(B, rng, { curve, len, t, a, r, ref, long, wide, dice, beat }) {
  const c = curve.getPointAt(t), T = curve.getTangentAt(t), N = ref.clone().addScaledVector(T, -ref.dot(T)).normalize(), Bn = new THREE.Vector3().crossVectors(T, N);
  const out = N.multiplyScalar(Math.cos(a)).addScaledVector(Bn, Math.sin(a)), foot = c.clone().addScaledVector(out, r * 0.9);
  const lean = out.clone().addScaledVector(T, 0.35).normalize(), leanTip = out.clone().addScaledVector(T, 0.95).normalize();
  const spike = new THREE.QuadraticBezierCurve3(foot, foot.clone().addScaledVector(lean, long * 0.55), foot.clone().addScaledVector(lean, long * 0.55).addScaledVector(leanTip, long * 0.5));
  const ta = [t, beat, 0, 0], rides = { pivot: c, axis: T.clone().multiplyScalar(len) };
  addTube(B, { curve: new THREE.LineCurve3(c.clone().addScaledVector(out, r * 0.8), c.clone().addScaledVector(out, r + wide * 0.5)), rings: 2, sides: 8, radius: u => wide * lerp(1.75, 1.15, u), ref: T, part: STEM, dice, shade: () => 0.3, anim: () => ta, close: false, rides });
  addTube(B, { curve: spike, rings: 5, sides: 7, radius: u => wide * (1 - u * 0.93) * (1 - 0.25 * sstep(0.0, 0.3, u) * (1 - u)), ref: T, part: THORN, dice: rng(), shade: u => 0.5 * (1 - sstep(0, 0.25, u)), anim: () => ta, rides });
}
// the two whip vines: where each leaves the ground (parts of the height: x, z), and how long one is (metres)
const VINES = [[0.37, 0.3], [-0.37, 0.3]];
export const BOSS_VINE_LENGTH = 7.4;

function bossGeometry(seed) {
  const rng = mulberry32(seed * 761 + 29), B = newArrays(), heads = [];
  const jit = k => (rng() - 0.5) * 2 * k;
  const Z = V3(0, 0, 1), Y = V3(0, 1, 0);

  // ---- necks, thorns and heads
  HEADS.forEach((hd, hi) => {
    const R = hd.r * H, C = V3(hd.c[0] + jit(0.006), hd.c[1] + jit(0.006), hd.c[2] + jit(0.006)).multiplyScalar(H);
    const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(hd.pitch + jit(0.03), hd.yaw + jit(0.05), hd.roll + jit(0.03), 'YZX'));
    const M = rot.clone().setPosition(C);
    B.head = hi;
    const end = NECK_IN.clone().multiplyScalar(R).applyMatrix4(M), before = NECK_FROM.clone().multiplyScalar(R).applyMatrix4(M);
    const curve = new THREE.CatmullRomCurve3([...hd.path.map(p => V3(p[0], p[1], p[2]).multiplyScalar(H)), before, end], false, 'centripetal');
    const r0 = hd.neck * H, len = curve.getLength(), dice = rng();
    // thick at its foot, a little narrower under the head, never quite even
    const radius = t => r0 * (1 + 0.18 * (1 - sstep(0.0, 0.3, t))) * (1 - 0.2 * sstep(0.62, 1, t)) * (1 + 0.02 * Math.sin(t * 9 + dice * 6));
    const anim = t => [t, hd.beat, 0, 0];
    addTube(B, {
      curve, rings: 44, sides: 14, radius, ref: Z, part: STEM, dice, anim, close: false, spine: true,
      shade: t => 0.55 * (1 - sstep(0.1, 0.32, t)) + 0.6 * sstep(0.84, 1, t),      // in the skirt's shade at its foot, in the hood's under the head
    });
    for (const [t0, deg] of THORNS[hi]) {
      const t = t0 + jit(0.015), a = (deg + jit(8)) * Math.PI / 180;
      addThorn(B, rng, { curve, len, t, a, r: radius(t), ref: Z, long: range(rng, 0.062, 0.082) * H, wide: range(rng, 0.021, 0.025) * H, dice, beat: hd.beat });
    }
    // the head: the one head, built for this neck and stood on its end
    const h = buildHead(mulberry32(seed * 131 + hi * 977 + 7), R), base = B.n, p = new THREE.Vector3(), endAxis = curve.getTangentAt(1).multiplyScalar(len);
    for (let i = 0; i < h.n; i++) {
      p.set(h.pos[i * 3], h.pos[i * 3 + 1], h.pos[i * 3 + 2]).applyMatrix4(M); B.pos.push(p.x, p.y, p.z);
      p.set(h.nor[i * 3], h.nor[i * 3 + 1], h.nor[i * 3 + 2]).transformDirection(rot); B.nor.push(p.x, p.y, p.z);
      B.paint.push(h.paint[i * 3], h.paint[i * 3 + 1], h.paint[i * 3 + 2]); B.uv.push(h.uv[i * 2], h.uv[i * 2 + 1]);
      B.part.push(h.part[i * 4], h.part[i * 4 + 1], h.part[i * 4 + 2], hi);
      B.anim.push(1, hd.beat, 1, h.anim[i * 4 + 3]);
      B.pivot.push(end.x, end.y, end.z); B.axis.push(endAxis.x, endAxis.y, endAxis.z);
    }
    for (const k of h.idx) B.idx.push(base + k);
    B.n += h.n;
    heads.push({ centre: C, frame: rot, radius: R });
  });
  B.head = -1;

  // ---- the skirt: broad leaves that leave the collar, arch out and droop, red toward the tip. Two rings, the lower
  // between the upper's leaves; small upright ones round the necks' feet
  const skirtLeaf = ({ az, pts, W, shade, k = 1, roll = 0, NU = 8, NV = 16, at = 0.4 }) => {
    const out = ballDir(az, 0), side = new THREE.Vector3().crossVectors(Y, out), d = rng();
    const c = new THREE.CatmullRomCurve3(pts.map(([r, y]) => out.clone().multiplyScalar(r * k * H).add(V3(0, y * H, 0))), false, 'centripetal');
    const L = c.getLength();
    addLeaf(B, {
      part: SKIRT, dice: d, NU, NV, length: L, hinge: { pivot: c.getPointAt(0), axis: side },
      frame: s => { const T = c.getTangentAt(s); return { c: c.getPointAt(s), T, up: new THREE.Vector3().crossVectors(T, side).applyAxisAngle(T, roll) }; },
      half: s => W * H * leafShape(s, at, 0.78),
      // a channel near the foot (its edges up), its edges falling away toward the tip; a crease along the midrib
      bend: (s, x, w) => Math.abs(x) * lerp(0.32, -0.1, sstep(0.0, 0.8, s)) - (x * x) / (w + 0.001) * 0.16 * s,
      shade: (s, u) => shade + 0.5 * (1 - sstep(0.0, 0.3, s)),
      flutter: s => s * s * 1.3,
    });
  };
  const UP = 7, a0 = jit(0.08);
  for (let i = 0; i < UP; i++) {
    const az = a0 + (i / UP) * Math.PI * 2 + jit(0.1), dr = jit(0.02);
    skirtLeaf({ az, W: range(rng, 0.098, 0.112), shade: 0, k: range(rng, 0.94, 1.06), roll: jit(0.22),
      pts: [[0.05, 0.27], [0.15, 0.345 + dr], [0.27, 0.337 + dr], [0.375, 0.262 + dr * 2], [0.436, 0.158 + dr * 3]] });
  }
  for (let i = 0; i < UP; i++) {
    const az = a0 + ((i + 0.5) / UP) * Math.PI * 2 + jit(0.12), dr = jit(0.015);
    skirtLeaf({ az, W: range(rng, 0.088, 0.1), shade: 0.2, k: range(rng, 0.94, 1.06), roll: jit(0.22),
      pts: [[0.055, 0.232], [0.16, 0.262 + dr], [0.265, 0.238 + dr], [0.35, 0.158 + dr * 2], [0.392, 0.07 + dr * 3]] });
  }
  for (let i = 0; i < 6; i++) {
    const az = a0 + ((i + 0.25) / 6) * Math.PI * 2 + jit(0.2);
    skirtLeaf({ az, W: range(rng, 0.05, 0.06), shade: 0.12, roll: jit(0.3), NU: 6, NV: 10, at: 0.5,
      pts: [[0.06, 0.27], [0.105, 0.34], [0.15, 0.385], [0.2, 0.395], [0.235, 0.375]] });
  }

  // ---- the roots: a lumpy mound, and thick roots that leave it, run over the ground and go into it; a few fork
  const NR = 9, r0 = jit(0.3), rootAz = [];
  for (let i = 0; i < NR; i++) rootAz.push(r0 + (i / NR) * Math.PI * 2 + jit(0.14));
  const moundDice = rng();
  addSheet(B, 24, 7, (i, j) => {
    const az = (i / 24) * Math.PI * 2, el = -0.12 + (j / 7) * (Math.PI / 2 + 0.12), d = ballDir(az, el);
    let ridge = 0;                                                    // it swells toward each root
    for (const a of rootAz) { const da = Math.atan2(Math.sin(az - a), Math.cos(az - a)); ridge = Math.max(ridge, Math.exp(-da * da * 14)); }
    const r = (0.168 + 0.045 * ridge * Math.cos(el)) * H;
    return { p: V3(d.x * r, d.y * 0.2 * H * (1 + 0.1 * ridge), d.z * r), fallback: d, paint: [Math.sin(az) * 2, Math.cos(az) * 2, el * 3 * H * 0.3], uv: [i / 24, j / 7],
      shade: 0.3 + 0.5 * sstep(0.3, 1.1, el), anim: [0, 0, 0, 0] };
  }, WOOD, moundDice, true);
  const root = (az, k, thick, pts, wig) => {
    const out = ballDir(az, 0), side = new THREE.Vector3().crossVectors(Y, out), ph = rng() * 6.28, d = rng();
    const c = new THREE.CatmullRomCurve3(pts.map(([r, y], i) => out.clone().multiplyScalar(r * k * H).add(V3(0, y * H, 0)).addScaledVector(side, Math.sin(i * 1.7 + ph) * wig * H * (i ? 1 : 0))), false, 'centripetal');
    addTube(B, {
      curve: c, rings: 14, sides: 8, ref: Y, part: WOOD, dice: d,
      radius: t => thick * H * (Math.pow(1 - t, 0.75) * 0.82 + 0.18) * (1 + 0.1 * Math.sin(t * 13 + ph)),
      shade: t => 0.5 * (1 - sstep(0.1, 0.5, t)),
    });
    return c;
  };
  for (let i = 0; i < NR; i++) {
    const k = range(rng, 0.86, 1.1), dy = jit(0.008);
    const c = root(rootAz[i], k, range(rng, 0.05, 0.062), [[0.06, 0.125], [0.14, 0.118], [0.215, 0.076 + dy], [0.29, 0.05 + dy], [0.355, 0.022], [0.405, -0.05]], 0.016);
    if (rng() < 0.6) {                                                // a fork: a thinner root off its outer half, turning aside
      const t = range(rng, 0.42, 0.56), p = c.getPointAt(t), turn = (rng() < 0.5 ? 1 : -1) * range(rng, 0.5, 0.85);
      const az = rootAz[i] + turn, out = ballDir(az, 0), d = rng(), ph = rng() * 6.28;
      const fc = new THREE.CatmullRomCurve3([p.clone().addScaledVector(Y, -0.006 * H), p.clone().addScaledVector(out, 0.06 * H).setY(0.024 * H), p.clone().addScaledVector(out, 0.13 * H).setY(0.004 * H), p.clone().addScaledVector(out, 0.18 * H).setY(-0.04 * H)], false, 'centripetal');
      addTube(B, { curve: fc, rings: 9, sides: 6, ref: Y, part: WOOD, dice: d, radius: u => 0.022 * H * (Math.pow(1 - u, 0.75) * 0.85 + 0.15) * (1 + 0.1 * Math.sin(u * 11 + ph)), shade: () => 0.1 });
    }
  }

  // ---- the whip vines: two long thorned vines, one each side of its front. Each is built standing straight up out of the
  // ground; the shader lays it along its own curve (as it starts: under the ground, drawn to nothing). Their own dice,
  // so the rest is as it was before there were vines
  const vrng = mulberry32(seed * 53 + 11), vines = [];
  VINES.forEach((vb, vi) => {
    B.head = 3 + vi;
    const foot = V3(vb[0] * H, 0, vb[1] * H), line = new THREE.LineCurve3(foot, foot.clone().add(V3(0, BOSS_VINE_LENGTH, 0))), dice = vrng(), beat = 0.3 + vi * 0.4;
    const radius = t => (0.2 * Math.pow(1 - t, 0.8) + 0.03) * (1 + 0.05 * Math.sin(t * 23 + dice * 6));
    addTube(B, { curve: line, rings: 46, sides: 8, radius, ref: Z, part: STEM, dice, spine: true, anim: t => [t, beat, 0, 0] });
    for (let k = 0, t = 0.07; t < 0.93; k++, t += 0.062 + vrng() * 0.03) {
      const r = radius(t);
      addThorn(B, vrng, { curve: line, len: BOSS_VINE_LENGTH, t, a: k * 2.39996 + (vrng() - 0.5) * 0.6, r, ref: Z, long: r * 2.3 + 0.1, wide: r * 0.62 + 0.012, dice, beat });
    }
    vines.push({ foot });
  });
  B.head = -1;

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
  g.setAttribute('aPaint', new THREE.Float32BufferAttribute(B.paint, 3));
  g.setAttribute('aUV', new THREE.Float32BufferAttribute(B.uv, 2));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(B.part, 4));
  g.setAttribute('aAnim', new THREE.Float32BufferAttribute(B.anim, 4));
  g.setAttribute('aPivot', new THREE.Float32BufferAttribute(B.pivot, 3));
  g.setAttribute('aAxis', new THREE.Float32BufferAttribute(B.axis, 3));
  g.setIndex(B.idx);
  g.boundingSphere = new THREE.Sphere(V3(0, 3.2, 1.2), 11.5);       // (room for the necks to reach and the vines to whip)
  return { geometry: g, heads, vines };
}

// how to pose a head so it looks at a point (in the mesh's own space): it turns `share` of the way there (no more than
// `most` radians to either side) and its eyes make up the rest. -> { yaw, nod, gazeX, gazeY }
export function aimHead(h, point, share = 0.7, most = 0.55) {
  const dx = point.x - h.centre.x, dy = point.y - h.centre.y, dz = point.z - h.centre.z, far = Math.hypot(dx, dz) || 1;
  const turn = Math.atan2(Math.sin(Math.atan2(dx, dz) - h.faces), Math.cos(Math.atan2(dx, dz) - h.faces)), tip = Math.atan2(-dy, far) - h.tipped;      // how far it would have to turn, and tip its face down, to face it
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const yaw = clamp(turn * share, -most, most), nod = clamp(tip * share, -0.3, 0.16);                 // (never far down: its hood would hide its face)
  return { yaw, nod, gazeX: clamp((turn - yaw) / 0.5, -1, 1), gazeY: clamp((nod - tip) / 0.5, -1, 1), dx: dx / far, dz: dz / far };
}

export function createPlantBoss({ seed = 1, size = 1 } = {}) {
  const { geometry, heads: built, vines: builtVines } = bossGeometry(seed);
  const mat = material(), U = mat.uniforms;
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = 'plant_boss_mesh';
  mesh.scale.setScalar(size);
  const group = new THREE.Group();
  group.name = 'plant_boss';
  group.add(mesh);
  // the heads: numbers that pose each (see the top of the file), and what an actor needs to aim one: where its pod's
  // middle is and which way it was built facing (in the mesh's own space, metres at size 1)
  const heads = built.map((b, index) => {
    const face = new THREE.Vector3(0, 0, 1).transformDirection(b.frame);
    return { index, ...REST, lean: new THREE.Vector3(), bow: new THREE.Vector3(), centre: b.centre.clone(), radius: b.radius, frame: b.frame.clone(),
      faces: Math.atan2(face.x, face.z), tipped: -Math.asin(face.y) };          // the way it faces round the upright, and how far its face is tipped down
  });
  // the whip vines: away under the ground as they start
  const vines = builtVines.map((b, index) => {
    const under = () => new THREE.Vector3(b.foot.x, -1, b.foot.z);
    return { index, foot: b.foot.clone(), length: BOSS_VINE_LENGTH, p1: under(), p2: under(), p3: under(), width: 0, footY: -1 };
  });
  const body = { skirt: 0, swirl: 0, glow: 0, wither: 0, flash: 0, sink: 0, shake: new THREE.Vector3(),
    leaves: heads.map(() => ({ lift: 0, stir: 0 })), ring: { lift: 0, stir: 0 } };
  U.uLeafAz.value.set(...heads.map(h => Math.atan2(h.centre.x, h.centre.z)));          // (each head's leaves: those on the side it stands over)
  const inv = new THREE.Matrix4(), m4 = new THREE.Matrix4(), e = new THREE.Euler();
  function pose() {
    for (const h of heads) {
      U['uPose' + h.index].value.set(h.lean.x, h.lean.y, h.lean.z, h.wave);
      U['uBow' + h.index].value.set(h.bow.x, h.bow.y, h.bow.z, h.wither);
      // turned about the upright; nodded and tipped about its own axes (as it was built facing)
      m4.makeRotationY(h.yaw).multiply(h.frame).multiply(inv.makeRotationFromEuler(e.set(h.nod, 0, h.tilt, 'YZX'))).multiply(inv.copy(h.frame).invert());
      U['uTurn' + h.index].value.setFromMatrix4(m4).multiplyScalar(Math.max(h.scale, 0.05));
      U['uFaceA' + h.index].value.set(h.jaw, h.lid, h.slant, h.smile);
      U['uFaceB' + h.index].value.set(h.size, h.flare, h.brow, h.curve);
      U['uFaceC' + h.index].value.set(h.gazeX, h.gazeY, h.glow, h.flash);
    }
    for (const v of vines) {
      U['uVineA' + v.index].value.set(v.p1.x, v.p1.y, v.p1.z, v.width);
      U['uVineB' + v.index].value.set(v.p2.x, v.p2.y, v.p2.z, v.footY);
      U['uVineC' + v.index].value.set(v.p3.x, v.p3.y, v.p3.z, 0);
    }
    U.uBody.value.set(body.skirt, body.wither, body.flash, body.glow);
    U.uSwirl.value = body.swirl;
    const [l0, l1, l2] = body.leaves;
    U.uLeafLift.value.set(l0.lift, l1.lift, l2.lift, body.ring.lift);
    U.uLeafStir.value.set(l0.stir, l1.stir, l2.stir, body.ring.stir);
    mesh.position.set(body.shake.x * size, (body.shake.y - body.sink) * size, body.shake.z * size);
  }
  pose();
  group.userData = { kind: 'plantBoss', seed, size, height: BOSS_HEIGHT * size, triangles: geometry.index.count / 3, mesh, heads, vines, body, pose,
    dispose() { geometry.dispose(); mat.dispose(); } };
  return group;
}
