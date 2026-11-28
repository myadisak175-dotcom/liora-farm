/* ==========================================================================
   fang-hall.js  —  room ① of the dungeon under the waterfall cliff: the fang hall, and the way in to it from behind the
   big fall (dungeon.html; the level she walks in it is cave-level.js, made from what this hands it)

     const hall = await createFangHall({ onStep, onDrip })
     scene.add(hall.group); ...; hall.light.apply(scene)     // the cave's light on the ferns and on her (cave-light.js)
     const files = fetchFangHall()                           // its files, fetched ahead (the game, as she nears the falls:
     createFangHall({ files, globals: false })               // dungeon-in-game.js); globals false: the haze and the ferns'
                                                             // light (shared with the whole game) left as they are: hall.haze,
                                                             // hall.sun say what they are in here (the page sets them itself)
     every frame: hall.update(dt, camera)                    // the falling water, its light, the glowworms, the drips
     hall.floorMap, hall.colliders, hall.crowns, hall.trunks, hall.layout   (as cave-hall.js': cave-level.js reads them)
     hall.inward(x, z)      how far in from the mouth a spot is (m; < 0 out on the ledge behind the falling water)
     hall.curtainAt(y)      how far in the fall's line is at a height (it hangs further out lower down): her camera keeps
                            this side of it
     hall.setPixelRatio(r)  the renderer's pixel ratio changed (the glowworms are sized in pixels)
     hall.seeThrough(p, h)  every frame: where she stands and how tall she is. What is thin and stands between the eye and
                            her is drawn thinned out, in dots, along the way to her: the fangs (hanging, rising, the broken
                            ones, the column) and the crystals; her camera goes past such things (cave-level.js:
                            cameraReach), so without this a fang or a cluster of crystals hid her (her clip of 28 Nov 2026:
                            a big crystal on a wall across her). seeThrough(null): nothing thinned
     onDrip(x, y, z)        a drop landing in the pool (the page's sounds)

   One job: build the room from what tools/make-fang-hall.py baked (assets/caves/fang-hall.bin + .json):
     the rock      one mesh with the fangs in it: the rock painted with the game's own pictures (the cliffs' brush-painted
                   rock, laid on from the room's own two sides; underfoot damp stone, and over it moss where the daylight
                   or a crystal's glow reaches, earth on the ways, sand round the pool, read from the floor map's paint);
                   the fangs (and the broken ones in the pool, the column) pale calcite, ring on ring, whiter and a little
                   see-through toward their sharp tips, wet and glossy; the light baked into all of it, and the daylight
                   that comes in past the falling water rippling over the ledge and the tunnel as the water falls; the
                   sprite's light (cave-light.js' uniforms) where she goes
     glowworms     points of blue-green light all over the hall's roof between the fangs, twinkling; mirrored in the pool
     crystals      clusters on the walls and the floor, teal and cyan, each with its own soft halo, mirrored in the pool;
                   big white ones across the way on (closed for now: room ② is not made)
     mushrooms     small glowing caps in clumps along the walls, round the column and the stalagmites
     the pool      still and dark, the lake's own level; drops falling from the big fangs' tips over it, rings where they land
     the way out   the big fall seen from behind, as the village has it: its three strands (the middle one before the
                   cleft between the two ribs of rock), the day coming through them; past the ledge the lake, the far
                   bank, trees and sky, too bright to see well from in here; spray, a haze of the day in the mouth
     mist          a low veil over the hall's floor, lit by whatever light is where it hangs
     ferns         where the daylight reaches, along the ledge and the tunnel's first walls (ground-cover.js)
   ========================================================================== */
import * as THREE from 'three';
import * as N from './stylized-nature.js';
import { createGroundCover, setGroundCoverSun } from './ground-cover.js';
import { createCaveLight } from './cave-light.js';

export const FANG_LOOK = {
  fog: '#0b1824', fogDensity: 0.02, mist: '#1a3040', mistHeight: 1.9, rim: '#2f5874',
  rockTint: [0.78, 0.83, 0.95], floorTint: [0.62, 0.66, 0.74],
  earthTint: [0.66, 0.68, 0.76], sandTint: [0.6, 0.63, 0.7],
  fang: '#cfc6b4', fangTip: '#f4f0e6',
  day: '#dcefff', dayStrength: 0.45,
  glow: '#4ff2df', glowCore: '#e2fffb',
  crystal: { teal: '#47f0d8', cyan: '#62d8ff', white: '#c6f4ff' },
  shroom: '#b58cff',
  water: '#04121a',
};

const loadTex = (url) => new Promise((res) => {
  new THREE.TextureLoader().load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4; t.needsUpdate = true; res(t);
  }, undefined, () => res(null));
});
const hex3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const NOISE = /* glsl */`
float h2(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
`;
// what stands between the eye and her, thinned out in dots (the fangs, the crystals): 1 drawn whole, 0 not at all. The way
// kept clear is a cone from the eye (narrow) to her chest (uSee.w wide there), stopping just short of her
const SEE = /* glsl */`
uniform vec4 uSee;               // her chest (world); how wide the way to her is kept clear there (m; 0: nothing thinned)
float seeHash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float seeKeep(vec3 w) {
  if (uSee.w <= 0.0) return 1.0;
  vec3 ab = uSee.xyz - cameraPosition;
  float t = dot(w - cameraPosition, ab) / max(dot(ab, ab), 1e-4);
  if (t <= 0.0 || t >= 0.94) return 1.0;
  float d = length(w - (cameraPosition + ab * t));
  return smoothstep(0.55, 1.0, d / (uSee.w * (0.3 + 0.7 * t)));
}
`;
// where a point under the pool's level shows on its still water, seen from the eye (a flat mirror: the point mirrored up
// is seen where the line from the eye to it meets the water), and how much the water gives back there; off the pool: none
const MIRROR = /* glsl */`
uniform float uLevel;
uniform vec4 uPoolE;            // the pool: its middle (x, z), its half lengths along and across
uniform vec2 uPoolA;            // the way it lies (along, x z)
float mirrorAt(vec3 p, out vec3 q) {
  vec3 m = vec3(p.x, 2.0 * uLevel - p.y, p.z), c = cameraPosition;
  q = m;
  if (c.y <= uLevel + 0.03 || m.y >= uLevel) return -1.0;
  q = c + (m - c) * ((c.y - uLevel) / (c.y - m.y));
  vec2 r = q.xz - uPoolE.xy;
  float u = dot(r, uPoolA) / uPoolE.z, v = dot(r, vec2(-uPoolA.y, uPoolA.x)) / uPoolE.w;
  float e = u * u + v * v;
  if (e > 1.0) return -1.0;
  float cosT = (c.y - uLevel) / max(length(q - c), 1e-3);
  return (0.45 + 0.5 * pow(1.0 - cosT, 2.0)) * (1.0 - smoothstep(0.75, 1.0, e));
}
`;

// ---------------------------------------------------------------- the rock and the fangs
const ROCK_VS = /* glsl */`
attribute vec4 aLight;
attribute vec4 aInfo;
attribute vec4 aPaint;
uniform float uScale;
varying vec3 vW, vN, vL;
varying vec4 vI, vP;
varying float vD;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vL = aLight.rgb * uScale; vI = aInfo; vP = aPaint;
  vec4 mv = viewMatrix * w;
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const ROCK_FS = /* glsl */`
uniform sampler2D uCliff, uMossT, uEarth, uSand;
uniform sampler2D uPaintMap, uFloorMap;     // per column of the floor map (smooth): earth, sand, moss; the floor's height
uniform vec4 uMapBox;                       // the floor map: x0, z0, 1 / (nz * cell), 1 / (nx * cell)
uniform vec2 uCliffTile;
uniform vec4 uFloorTile;         // repeats a metre: the moss, the earth, the sand
uniform vec3 uEarthTint, uSandTint, uTint, uFloorTint, uFogCol, uMistCol, uRim, uFang, uFangTip, uDay;
uniform vec3 uFog;               // density, the mist's top, its strength
uniform vec4 uSprPos;
uniform vec3 uSprCol;
uniform vec3 uMouth;             // the mouth, behind the curtain
uniform vec2 uIn;                // the way in (x, z)
uniform float uTime, uDayMax;
uniform vec3 uFangFill;          // what a fang catches of every light there is (it reads pale in the dark)
varying vec3 vW, vN, vL;
varying vec4 vI, vP;
varying float vD;
${NOISE}
${SEE}
void main() {
  if (vP.a > 0.25) { float keep = seeKeep(vW); if (keep < 1.0 && keep <= seeHash(gl_FragCoord.xy)) discard; }      // (a fang between the eye and her)
  vec3 n = normalize(vN);
  float fang = smoothstep(0.12, 0.42, vP.a);                  // calcite: a fang, a broken one, the column (0 rock)
  // the walls' picture laid on from the room's own two sides (the way in and across it), not the world's: the tunnel runs
  // across the world's axes, and a wall facing between two of them would be two pictures smeared into one
  vec2 nr = vec2(dot(n.xz, vec2(-uIn.y, uIn.x)), dot(n.xz, uIn));
  vec2 pw = pow(abs(nr), vec2(4.0)); pw /= max(pw.x + pw.y, 1e-4);
  vec2 ua = vec2(dot(vW.xz, uIn), vW.y), ub = vec2(dot(vW.xz, vec2(-uIn.y, uIn.x)), vW.y);
  vec3 wall = texture2D(uCliff, ua * uCliffTile).rgb * pw.x + texture2D(uCliff, ub * uCliffTile).rgb * pw.y;
  float near = 1.0 - smoothstep(7.0, 18.0, vD);
  if (near > 0.0) {
    // up close (the tunnel's walls are never far): the same rock at finer sizes over it, so it is not a smooth smear
    vec3 fine = texture2D(uCliff, ua * uCliffTile * 3.7 + 0.53).rgb * pw.x + texture2D(uCliff, ub * uCliffTile * 3.7 + 0.53).rgb * pw.y;
    wall = mix(wall, wall * (0.45 + 1.1 * fine), 0.65 * near);
    float closer = 1.0 - smoothstep(2.5, 8.0, vD);
    if (closer > 0.0) {
      vec3 finer = texture2D(uCliff, ua * uCliffTile * 10.0 + 0.21).rgb * pw.x + texture2D(uCliff, ub * uCliffTile * 10.0 + 0.21).rgb * pw.y;
      wall = mix(wall, wall * (0.4 + 1.2 * finer), 0.55 * closer);
    }
  }
  vec3 roof = texture2D(uCliff, vW.xz * uCliffTile.x * 1.4 + 0.37).rgb;
  float up = smoothstep(0.5, 0.86, n.y), down = smoothstep(-0.3, -0.7, n.y);
  vec3 alb = mix(wall * uTint, roof * uTint * 0.9, down);
  vec3 moss = texture2D(uMossT, vW.xz * uFloorTile.x).rgb;
  if (up > 0.002) {
    // underfoot: damp stone, and over it what the bake's paint says (moss, earth, sand), their edges ragged by the stone
    vec3 stone = texture2D(uCliff, vW.xz * uCliffTile.x * 1.9 + 0.11).rgb * uFloorTint;
    stone *= 0.6 + 0.8 * texture2D(uCliff, vW.xz * uCliffTile.x * 7.0 + 0.71).r;
    vec3 ground = stone;
    // what lies there: the bake's paint for this spot of floor, read smooth from its own map (not from the mesh's corners,
    // which would cut it along the triangles), on what is the floor here (not a ledge higher up over it)
    vec2 mc = vec2((vW.z - uMapBox.y) * uMapBox.z, (vW.x - uMapBox.x) * uMapBox.w);
    vec3 pc = texture2D(uPaintMap, mc).rgb;
    float onFloor = 1.0 - smoothstep(0.3, 0.8, vW.y - texture2D(uFloorMap, mc).r);
    if (onFloor > 0.0) {
      float rag = (dot(stone, vec3(0.3, 0.59, 0.11)) - 0.3) * 1.8;
      float m = smoothstep(0.3, 0.6, pc.b + rag * 0.35) * onFloor, e = smoothstep(0.32, 0.62, pc.r + rag * 0.3) * onFloor, s = smoothstep(0.32, 0.62, pc.g + rag * 0.2) * onFloor;
      if (m > 0.0) ground = mix(ground, moss, m);
      if (e > 0.0) ground = mix(ground, texture2D(uEarth, vW.xz * uFloorTile.y).rgb * uEarthTint, e);
      if (s > 0.0) ground = mix(ground, texture2D(uSand, vW.xz * uFloorTile.z).rgb * uSandTint, s);
    }
    alb = mix(alb, ground, up);
  }
  alb = mix(alb, moss, clamp(vI.g * (1.0 - fang) * 0.9, 0.0, 0.85));      // moss on the ledges the daylight reaches
  if (fang > 0.5) {
    // a fang: pale calcite, ring on ring, streaked down its length, whiter toward its tip
    float t = vI.g;
    float band = 0.5 + 0.5 * sin(vW.y * 8.5 + n2(vW.xz * 2.6) * 5.0);
    float streak = texture2D(uCliff, vec2(vW.z * 0.55, vW.y * 0.13)).r * pw.x + texture2D(uCliff, vec2(vW.x * 0.55, vW.y * 0.13)).r * pw.y;
    alb = mix(uFang, uFangTip, smoothstep(0.35, 1.0, t)) * (0.84 + 0.16 * band) * (0.78 + 0.36 * streak);
  }
  float wet = vI.b;
  alb *= 1.0 - wet * 0.3 * (1.0 - fang);
  // the light: baked; the daylight through the falling water, rippling as the water falls (softer further in)
  vec3 L = vL;
  if (vI.a > 0.002) {
    vec2 rel = vW.xz - uMouth.xz;
    float across = dot(rel, vec2(-uIn.y, uIn.x)), into = dot(rel, uIn);
    vec2 q = mix(vec2(across * 1.25 + vW.y * 0.15, vW.y * 0.55 + uTime * 1.6), vec2(across * 1.1 + into * 0.35, into * 0.8 - uTime * 1.3), up);
    float c1 = n2(q * 1.6), c2 = n2(q * 2.9 + vec2(7.3, uTime * 0.7));
    float caustic = pow(1.0 - abs(c1 + c2 - 1.0), 5.0);
    float rip = mix(0.62 + 0.85 * caustic, 1.0, smoothstep(1.5, 13.0, into));
    L += uDay * (vI.a * uDayMax) * rip;
  }
  vec3 d = uSprPos.xyz - vW; float dist = length(d);
  float k = dist / max(uSprPos.w, 1e-3);
  float s = uSprPos.w > 0.0 ? (1.0 - smoothstep(0.0, 1.0, k)) / (1.0 + 9.0 * k * k) : 0.0;
  L += uSprCol * s * clamp(dot(n, d / max(dist, 1e-3)) * 0.65 + 0.35, 0.0, 1.0);
  vec3 col = alb * L;
  // a fang (calcite) catches every light there is and lets a little through toward its thin end: it reads pale in the dark
  col += fang * alb * (uFangFill + L * smoothstep(0.5, 1.0, vI.g) * 0.35);
  // wet ground and the fangs shine: the sprite's light; the daylight's sheen near the mouth on the wet floor
  vec3 vdir = normalize(cameraPosition - vW);
  float gloss = fang * 0.55 + wet * (0.25 + 0.6 * up);
  if (gloss > 0.01) {
    vec3 hS = normalize(d / max(dist, 1e-3) + vdir);
    col += uSprCol * s * pow(max(dot(n, hS), 0.0), 36.0) * gloss * 1.4;
    vec3 hD = normalize(normalize(vec3(-uIn.x, 0.25, -uIn.y)) + vdir);
    col += uDay * (vI.a * uDayMax) * pow(max(dot(n, hD), 0.0), 40.0) * (fang * 0.3 + wet * up * 0.5);
  }
  // a faint edge of light where the rock turns away from the eye: the cave's shapes read in the dark (the fangs' more;
  // none on the floor, where it would draw the mesh's steps)
  col += uRim * pow(1.0 - max(dot(n, vdir), 0.0), 3.0) * (0.35 + 0.65 * vI.r) * (1.0 + fang * 1.4) * (1.0 - 0.85 * up * (1.0 - fang));
  float f = 1.0 - exp(-vD * uFog.x);
  col = mix(col, uFogCol, clamp(f, 0.0, 0.88));
  float mist = (1.0 - smoothstep(uFog.y - 2.2, uFog.y, vW.y)) * smoothstep(2.0, 14.0, vD) * uFog.z * smoothstep(12.0, 22.0, dot(vW.xz - uMouth.xz, uIn));
  col = mix(col, uMistCol + L * 0.05, clamp(mist, 0.0, 0.55));
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- glowworms (and their mirror in the pool)
const WORM_VS = /* glsl */`
attribute float aSeed;
uniform float uTime, uPix, uMirror;
varying float vA;
${MIRROR}
void main() {
  vA = 0.75 + 0.45 * sin(uTime * (0.5 + fract(aSeed * 7.13) * 0.9) + aSeed * 40.0);
  vec3 p = position;
  if (uMirror > 0.5) {
    vec3 q;
    float r = mirrorAt(p, q);
    if (r < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; return; }
    vA *= r;
    gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
    gl_PointSize = clamp(uPix / distance(vec3(p.x, 2.0 * uLevel - p.y, p.z), cameraPosition), 1.5, 7.0);
    return;
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uPix / max(-mv.z, 0.5), 1.5, 7.0);
}`;
const WORM_FS = /* glsl */`
uniform vec3 uCol, uCore;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c));
  gl_FragColor = vec4(mix(uCol, uCore, a * a) * a * vA, 1.0);
}`;

// ---------------------------------------------------------------- crystals, mushroom caps: they light themselves (as the forest hall's)
const GLOW_VS = /* glsl */`
attribute float aPhase;
varying vec3 vC, vNv, vV, vWp;
varying float vY, vPh, vD;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWp = w.xyz;
  vec4 mv = viewMatrix * w;
  vC = instanceColor; vY = position.y; vPh = aPhase;
  vNv = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = normalize(-mv.xyz);
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FS = /* glsl */`
uniform float uTime, uCore, uFogD;
uniform vec3 uFogCol;
varying vec3 vC, vNv, vV, vWp;
varying float vY, vPh, vD;
${SEE}
void main() {
  { float keep = seeKeep(vWp); if (keep < 1.0 && keep <= seeHash(gl_FragCoord.xy)) discard; }      // (a crystal between the eye and her)
  float fres = pow(1.0 - abs(dot(normalize(vNv), vV)), 2.0);
  float pulse = 0.88 + 0.12 * sin(uTime * 1.4 + vPh * 6.28);
  vec3 col = mix(vC * 0.45, vC * 1.35 + 0.18, smoothstep(0.0, 1.0, vY * uCore)) * pulse + vC * fres * 0.9;
  col = mix(col, uFogCol, clamp((1.0 - exp(-vD * uFogD)) * 0.45, 0.0, 0.45));
  gl_FragColor = vec4(col, 1.0);
}`;
const HALO_VS = /* glsl */`
attribute vec4 aHalo;          // xyz: where, w: size
attribute vec3 aHaloCol;
attribute float aPhase;
uniform float uTime, uMirror;
varying vec2 vUv;
varying vec3 vC;
varying float vA;
${MIRROR}
void main() {
  vUv = position.xy;
  float pulse = 0.85 + 0.15 * sin(uTime * 1.4 + aPhase * 6.28);
  vec3 at = aHalo.xyz;
  float size = aHalo.w, a = 1.0;
  if (uMirror > 0.5) {
    vec3 q;
    float r = mirrorAt(at, q);
    if (r < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vC = vec3(0.0); vA = 0.0; return; }
    size *= distance(q, cameraPosition) / max(distance(vec3(at.x, 2.0 * uLevel - at.y, at.z), cameraPosition), 1e-3);
    at = q; a = r * 0.8;
  }
  vec4 mv = viewMatrix * vec4(at, 1.0);
  mv.xy += position.xy * size;
  mv.xyz += normalize(-mv.xyz) * min(size * 0.5, 0.6) * (1.0 - uMirror);       // toward the eye, so the rock it sits on does not cut it
  vC = aHaloCol * pulse;
  float dist = length(mv.xyz);
  vA = a * (1.0 - smoothstep(30.0, 60.0, dist)) * smoothstep(1.2, 4.5, dist);
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FS = /* glsl */`
varying vec2 vUv;
varying vec3 vC;
varying float vA;
void main() {
  float r = length(vUv);
  float a = exp(-r * r * 5.0) * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(vC * a * vA, 1.0);
}`;

// ---------------------------------------------------------------- the pool: still and dark; rings where the drops land
const POOL_VS = /* glsl */`
varying vec3 vW;
varying float vD;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const POOL_FS = /* glsl */`
uniform highp sampler3D uCaveVol;
uniform vec3 uCaveBox0, uCaveBoxS;
uniform float uCaveScale, uTime;
uniform vec3 uDeep;
uniform vec4 uSprPos;
uniform vec3 uSprCol;
uniform vec4 uPoolE;
uniform vec2 uPoolA;
uniform vec4 uD0, uD1, uD2, uD3, uD4;      // the drips: where (x, z), how often, when the first lands
varying vec3 vW;
varying float vD;
${NOISE}
float ring(vec4 dp, vec2 p) {
  if (dp.z <= 0.0) return 0.0;
  float age = mod(uTime - dp.w, dp.z), r = distance(p, dp.xy), front = age * 0.85;
  return sin((r - front) * 18.0) * exp(-abs(r - front) * 5.0) * exp(-age * 1.3) * step(r, front + 0.3);
}
float hgt(vec2 p) {
  return n2(p * 0.9 + uTime * 0.05) * 0.04 + ring(uD0, p) + ring(uD1, p) + ring(uD2, p) + ring(uD3, p) + ring(uD4, p);
}
void main() {
  vec2 e = vec2(0.05, 0.0);
  float hx = hgt(vW.xz + e.xy) - hgt(vW.xz - e.xy), hz = hgt(vW.xz + e.yx) - hgt(vW.xz - e.yx);
  vec3 n = normalize(vec3(-hx * 0.5, 1.0, -hz * 0.5));
  vec3 v = normalize(cameraPosition - vW);
  float fres = 0.05 + 0.95 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 L = texture(uCaveVol, clamp((vW + vec3(0.0, 0.5, 0.0) - uCaveBox0) * uCaveBoxS, 0.0, 1.0)).rgb * uCaveScale;
  vec3 r = reflect(-v, n);
  vec3 refl = mix(vec3(0.03, 0.07, 0.1), L * 1.25, 0.6);
  vec3 sd = uSprPos.xyz - vW; float sl = length(sd);
  refl += uSprCol * pow(max(dot(r, sd / max(sl, 1e-3)), 0.0), 90.0) * 2.2 * step(0.001, uSprPos.w);
  vec3 body = uDeep + L * 0.08;
  vec3 col = mix(body, refl, fres);
  // shallow at its edge: the bed shows through
  vec2 rr = vW.xz - uPoolE.xy;
  float u = dot(rr, uPoolA) / uPoolE.z, w = dot(rr, vec2(-uPoolA.y, uPoolA.x)) / uPoolE.w;
  float edge = smoothstep(0.55, 1.05, u * u + w * w);
  float a = mix(0.9, 0.45, edge) * (1.0 - smoothstep(55.0, 75.0, vD));
  gl_FragColor = vec4(col, a);
}`;
const DROP_VS = /* glsl */`
attribute vec4 aDrop;          // the tip's height, how often, when the first falls, how long it falls
uniform float uTime, uPix;
varying float vA;
void main() {
  float u = mod(uTime - aDrop.z, aDrop.y);
  vec3 p = position;
  vA = 0.0;
  if (u < aDrop.w) { p.y = aDrop.x - 4.9 * u * u; vA = 1.0; }
  else if (u > aDrop.y - 1.2) { p.y = aDrop.x - 0.02; vA = smoothstep(aDrop.y - 1.2, aDrop.y, u) * 0.8; }      // gathering on the tip
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = vA < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
  gl_PointSize = clamp(uPix / max(-mv.z, 0.5), 1.5, 6.0);
}`;
const DROP_FS = /* glsl */`
varying float vA;
void main() {
  float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vec3(0.75, 0.97, 1.0) * a * vA, 1.0);
}`;

// ---------------------------------------------------------------- the curtain of the fall, seen from behind
const CURTAIN_VS = /* glsl */`
uniform float uTime;
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv;
  vec3 p = position;
  vW = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;
const STRAND_FS = /* glsl */`
uniform float uTime;
uniform vec3 uBody, uDeep;
varying vec2 vUv;
varying vec3 vW;
${NOISE}
void main() {
  // u across, v down (0 at the lip); the water speeds up as it falls: its pattern runs faster lower down
  float v = vUv.y, u = vUv.x;
  float fall = v * v * 3.2 + v * 1.4;
  float s1 = n2(vec2(u * 16.0, fall * 3.0 - uTime * 2.4));
  float s2 = n2(vec2(u * 7.0 + 3.1, fall * 1.6 - uTime * 1.7));
  float s3 = n2(vec2(u * 34.0 + 7.7, fall * 9.0 - uTime * 4.6));
  float mid = 1.0 - pow(abs(u - 0.5) * 2.0, 2.0);
  float thick = smoothstep(0.2, 0.9, s2 * 0.6 + s1 * 0.4) * mid;
  float foam = smoothstep(0.6, 0.95, s1 * 0.5 + s3 * 0.6);
  // seen from behind, the day coming through it: pale where it is thin, turquoise where it runs thick, threads of white
  vec3 col = mix(vec3(0.9, 0.98, 1.0), uBody, thick * 0.75);
  col = mix(col, uDeep, thick * thick * 0.35);
  col = mix(col, vec3(1.0), foam * 0.55);
  float a = (0.5 + 0.42 * thick + 0.3 * foam) * smoothstep(0.0, 0.3, mid) * smoothstep(0.0, 0.03, v);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
}`;
const LAKE_FS = /* glsl */`
uniform float uTime;
uniform vec4 uF0, uF1, uF2;     // where each strand lands (x, z), how wide its churn
varying vec2 vUv;
varying vec3 vW;
${NOISE}
float churn(vec4 f) { return 1.0 - smoothstep(f.z * 0.4, f.z, distance(vW.xz, f.xy)); }
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float glance = pow(1.0 - max(v.y, 0.0), 3.0);
  vec2 q = vW.xz * 0.9;
  float rip = n2(q + vec2(uTime * 0.3, -uTime * 0.2)) * 0.6 + n2(q * 2.7 - uTime * 0.5) * 0.4;
  vec3 col = mix(vec3(0.33, 0.78, 0.86), vec3(0.62, 0.92, 0.98), smoothstep(0.3, 0.8, rip));
  col = mix(col, vec3(0.9, 0.97, 1.0), glance * 0.65);                                       // the bright sky in it, far off
  float glint = smoothstep(0.82, 0.95, n2(vW.xz * 6.0 + uTime * 1.3)) * 0.6;
  float c = max(churn(uF0), max(churn(uF1), churn(uF2)));
  float foam = c * smoothstep(0.35, 0.8, n2(vW.xz * 4.0 + vec2(0.0, uTime * 2.5)) * 0.6 + n2(vW.xz * 9.0 - uTime * 3.0) * 0.5);
  col = mix(col + glint, vec3(0.97, 1.0, 1.0), clamp(foam + c * 0.35, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;
// the day beyond the ledge, seen from the dark: the lake's far side, its green bank, trees, the sky, all a little too bright
const DAYOUT_FS = /* glsl */`
uniform float uTime, uLake;
uniform vec2 uOut;              // the way out (x, z)
varying vec2 vUv;
varying vec3 vW;
${NOISE}
void main() {
  vec2 dir = normalize(vW.xz - cameraPosition.xz);
  float side = dir.x * uOut.y - dir.y * uOut.x;                                                // left .. right, as she looks out
  float y = vW.y - uLake;
  float bank = 3.2 + 2.2 * n2(vec2(side * 3.0, 1.7)) + 1.5 * n2(vec2(side * 9.0, 4.1));        // the grass bank's top
  float trees = bank + 3.0 + 4.5 * smoothstep(0.35, 0.75, n2(vec2(side * 5.0, 7.3))) + 1.5 * n2(vec2(side * 17.0, 2.2));
  vec3 sky = mix(vec3(0.93, 0.98, 1.0), vec3(0.64, 0.84, 0.98), smoothstep(trees, trees + 14.0, y));
  vec3 grass = mix(vec3(0.55, 0.83, 0.36), vec3(0.75, 0.93, 0.5), n2(vec2(side * 20.0, y * 2.0)) * 0.6 + 0.2);
  vec3 tree = mix(vec3(0.28, 0.55, 0.26), vec3(0.42, 0.7, 0.32), n2(vec2(side * 26.0, y * 1.7)));
  vec3 water = vec3(0.4, 0.85, 0.92);
  vec3 col = sky;
  col = mix(col, tree, 1.0 - smoothstep(trees - 0.4, trees + 0.4, y));
  col = mix(col, grass, 1.0 - smoothstep(bank - 0.25, bank + 0.25, y));
  col = mix(col, water, 1.0 - smoothstep(0.35, 0.7, y));
  col = mix(col, vec3(1.0), 0.28);                                                            // too bright to see well from in here
  gl_FragColor = vec4(col, 1.0);
}`;
// spray and its haze: soft points drifting up out of the foam and in under the cliff, lit by the day
const SPRAY_VS = /* glsl */`
attribute vec4 aSeed;
uniform float uTime, uPix;
uniform vec3 uFoot, uAcross, uIn3;
varying float vA;
void main() {
  float t = fract(aSeed.w + uTime * (0.08 + 0.07 * aSeed.z));
  vec3 p = uFoot + uAcross * (aSeed.x - 0.5) * 10.0 + uIn3 * (t * (1.2 + 3.5 * aSeed.y)) + vec3(0.0, t * (1.6 + 3.0 * aSeed.z), 0.0);
  p += vec3(sin(uTime * 0.7 + aSeed.x * 30.0), 0.0, cos(uTime * 0.6 + aSeed.y * 30.0)) * 0.15;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uPix * (0.5 + aSeed.z) / max(-mv.z, 0.5), 1.0, 9.0);
  vA = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.55, 1.0, t)) * (0.5 + 0.5 * sin(uTime * 1.7 + aSeed.x * 50.0));
}`;
const SPRAY_FS = /* glsl */`
uniform vec3 uDay;
varying float vA;
void main() {
  float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA;
  gl_FragColor = vec4(uDay * a * 0.55, 1.0);
}`;
// mist low over the hall's floor, lit by the light where it hangs (as the forest hall's)
const MIST_VS = /* glsl */`
varying vec3 vW;
varying float vD;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const MIST_FS = /* glsl */`
uniform highp sampler3D uCaveVol;
uniform vec3 uCaveBox0, uCaveBoxS;
uniform float uCaveScale, uTime, uAlpha;
uniform vec3 uCol;
varying vec3 vW;
varying float vD;
${NOISE}
void main() {
  vec2 q = vW.xz * 0.07;
  float n = n2(q + vec2(uTime * 0.012, uTime * 0.008)) * 0.6 + n2(q * 2.3 - vec2(uTime * 0.02, 0.0)) * 0.4;
  float a = smoothstep(0.35, 0.85, n) * uAlpha * smoothstep(1.5, 7.0, vD) * (1.0 - smoothstep(45.0, 70.0, vD))
    * smoothstep(0.5, 2.5, abs(cameraPosition.y - vW.y));
  vec3 L = texture(uCaveVol, clamp((vW - uCaveBox0) * uCaveBoxS, 0.0, 1.0)).rgb * uCaveScale;
  gl_FragColor = vec4(uCol * 0.5 + L * 0.55, a);
}`;

// ---------------------------------------------------------------- building it
function mergeGeometries(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}
function crystalGeometry() {
  const body = new THREE.CylinderGeometry(0.085, 0.11, 0.78, 6, 1, true).translate(0, 0.39, 0);
  const tip = new THREE.ConeGeometry(0.085, 0.24, 6).translate(0, 0.9, 0);
  const g = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()]);
  g.computeVertexNormals();
  return g;
}
function shroomGeometry() {
  const stem = new THREE.CylinderGeometry(0.03, 0.045, 0.2, 6).translate(0, 0.1, 0);
  const cap = new THREE.SphereGeometry(0.11, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1).translate(0, 0.19, 0);
  return mergeGeometries([stem.toNonIndexed(), cap.toNonIndexed()]);
}

// what the room is built from: its bake (the plan, the meshes, the light) and the game's pictures it is painted with
export function fetchFangHall({ base = './assets/caves/fang-hall', ground = './assets/ground/' } = {}) {
  return Promise.all([
    fetch(base + '.json').then((r) => { if (!r.ok) throw new Error(base + '.json: ' + r.status); return r.json(); }),
    fetch(base + '.bin').then((r) => { if (!r.ok) throw new Error(base + '.bin: ' + r.status); return r.arrayBuffer(); }),
    loadTex(ground + 'cliff-paint.webp'),
    loadTex(ground + 'cave-moss-paint.webp'),
    loadTex(ground + 'path-dirt.webp'),
    loadTex(ground + 'path-sand.webp'),
  ]);
}

export async function createFangHall({ base = './assets/caves/fang-hall', ground = './assets/ground/', files = null, globals = true, look = FANG_LOOK, onStep = async () => {}, onDrip = null, pixelRatio = Math.min(2, devicePixelRatio || 1) } = {}) {
  await onStep('อ่านแผนผังถ้ำ');
  const [L, bin, cliff, mossTex, earthTex, sandTex] = await (files || fetchFangHall({ base, ground }));
  const B = L.bin, group = new THREE.Group();
  group.name = 'fang-hall';
  const light = createCaveLight({ volume: { ...B.volume, data: new Uint8Array(bin, B.volume.data, B.volume.nx * B.volume.ny * B.volume.nz * 4) }, scale: B.lightScale });
  const U = light.uniforms;
  const fogCol = hex3(look.fog), dayCol = hex3(look.day);
  const time = { value: 0 };
  const Fr = L.frame, IN = new THREE.Vector2(Fr.in[0], Fr.in[1]), RIGHT = new THREE.Vector3(Fr.right[0], 0, Fr.right[1]);
  const MOUTH = new THREE.Vector3(...Fr.mouth);
  const inward = (x, z) => (x - MOUTH.x) * IN.x + (z - MOUTH.z) * IN.y;
  const P = L.pool, E = P.ellipse;
  const poolU = {
    uLevel: { value: P.level }, uPoolE: { value: new THREE.Vector4(P.c[0], P.c[1], E.a, E.b) }, uPoolA: { value: new THREE.Vector2(E.along[0], E.along[1]) },
  };

  // ---- the rock, the fangs in it
  await onStep('ปั้นผนังถ้ำและเขี้ยวหิน');
  const M = B.mesh, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, M.pos, M.vertices * 3), 3));
  g.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(bin, M.nrm, M.vertices * 4), 4), 3, 0, true));
  g.setAttribute('aLight', new THREE.BufferAttribute(new Uint8Array(bin, M.light, M.vertices * 4), 4, true));
  g.setAttribute('aInfo', new THREE.BufferAttribute(new Uint8Array(bin, M.info, M.vertices * 4), 4, true));
  g.setAttribute('aPaint', new THREE.BufferAttribute(new Uint8Array(bin, M.paint, M.vertices * 4), 4, true));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, M.idx, M.indices), 1));
  g.computeBoundingSphere();
  const F = B.floor;
  const floorMap = {
    nx: F.nx, nz: F.nz, x0: F.x0, z0: F.z0, cell: F.cell,
    fl: new Int16Array(bin, F.floor, F.nx * F.nz), ce: new Int16Array(bin, F.ceil, F.nx * F.nz), paint: new Uint8Array(bin, F.paint, F.nx * F.nz * 4),
  };
  // the floor map as two pictures for the rock's shader (u along z, v along x: the map's own order): its paint, its height
  const paintMap = new THREE.DataTexture(new Uint8Array(floorMap.paint), F.nz, F.nx, THREE.RGBAFormat);
  const hgt = new Float32Array(F.nx * F.nz);
  for (let i = 0; i < hgt.length; i++) hgt[i] = floorMap.fl[i] === -32768 ? -100 : floorMap.fl[i] / 100;
  const floorTex = new THREE.DataTexture(hgt, F.nz, F.nx, THREE.RedFormat, THREE.FloatType);
  for (const t of [paintMap, floorTex]) {
    t.magFilter = t.minFilter = t === paintMap ? THREE.LinearFilter : THREE.NearestFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  }
  const see = { value: new THREE.Vector4(0, 0, 0, 0) };      // (hall.seeThrough: her chest, and the width kept clear to her)
  const rockMat = new THREE.ShaderMaterial({
    vertexShader: ROCK_VS, fragmentShader: ROCK_FS,
    uniforms: {
      uScale: { value: B.lightScale }, uCliff: { value: cliff },
      uMossT: { value: mossTex }, uEarth: { value: earthTex }, uSand: { value: sandTex },
      uPaintMap: { value: paintMap }, uFloorMap: { value: floorTex },
      uMapBox: { value: new THREE.Vector4(F.x0 - F.cell / 2, F.z0 - F.cell / 2, 1 / (F.nz * F.cell), 1 / (F.nx * F.cell)) },
      uCliffTile: { value: new THREE.Vector2(1 / 13, 1 / 7) }, uFloorTile: { value: new THREE.Vector4(1 / 3.6, 1 / 2.6, 1 / 2.3, 1 / 3.6) },
      uEarthTint: { value: new THREE.Vector3(...look.earthTint) }, uSandTint: { value: new THREE.Vector3(...look.sandTint) },
      uTint: { value: new THREE.Vector3(...look.rockTint) }, uFloorTint: { value: new THREE.Vector3(...look.floorTint) },
      uFang: { value: hex3(look.fang) }, uFangTip: { value: hex3(look.fangTip) }, uDay: { value: dayCol }, uDayMax: { value: B.dayMax * look.dayStrength },
      uFangFill: { value: new THREE.Vector3(0.1, 0.12, 0.14) },
      uMouth: { value: MOUTH.clone() }, uIn: { value: IN.clone() }, uTime: time,
      uFogCol: { value: fogCol }, uMistCol: { value: hex3(look.mist) }, uRim: { value: hex3(look.rim) },
      uFog: { value: new THREE.Vector3(look.fogDensity, P.level + look.mistHeight + 0.4, 0.35) },
      uSprPos: U.uSprPos, uSprCol: U.uSprCol, uSee: see,
    },
  });
  rockMat.userData.noCave = true;
  const rock = new THREE.Mesh(g, rockMat);
  rock.name = 'cave-rock';
  group.add(rock);

  // ---- glowworms on the roof, and their mirror in the pool
  await onStep('จุดหนอนเรืองแสง');
  const GW = B.glowworms, wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, GW.pos, GW.count * 3), 3));
  const wseed = new Float32Array(GW.count), wr = mulberry(77);
  for (let i = 0; i < GW.count; i++) wseed[i] = wr();
  wg.setAttribute('aSeed', new THREE.BufferAttribute(wseed, 1));
  const pix = { value: 52 * pixelRatio };
  const wormMat = (mirror) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: WORM_VS, fragmentShader: WORM_FS,
      uniforms: { uTime: time, uPix: pix, uMirror: { value: mirror ? 1 : 0 }, uCol: { value: hex3(look.glow) }, uCore: { value: hex3(look.glowCore) }, ...poolU },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    m.userData.noCave = true;
    return m;
  };
  const worms = new THREE.Points(wg, wormMat(false));
  worms.frustumCulled = false; worms.renderOrder = 6; worms.name = 'glowworms';
  const wormsMirror = new THREE.Points(wg, wormMat(true));
  wormsMirror.frustumCulled = false; wormsMirror.renderOrder = 7; wormsMirror.name = 'glowworms-mirrored';
  group.add(worms, wormsMirror);

  // ---- crystals: clusters on the walls and the floor
  await onStep('ปลูกคริสตัล');
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
    uniforms: { uTime: time, uCore: { value: 1.0 }, uFogCol: { value: fogCol }, uFogD: { value: look.fogDensity }, uSee: see },
  });
  glowMat.userData.noCave = true;
  const halos = [];
  const cg = crystalGeometry(), rnd = mulberry(91);
  let count = 0;
  for (const c of L.crystals) count += c.count;
  // (the haze of daylight in the mouth: soft puffs of its light in the air, fading as they go in)
  {
    const dc = new THREE.Color(look.day);
    for (const [s_, w_, h_, size, k_] of [[-3.0, -1.9, 3.0, 6.0, 0.08], [-3.0, 1.9, 3.0, 6.0, 0.08], [-1.0, 0.0, 2.2, 5.0, 0.07], [0.8, 0.2, 2.6, 4.6, 0.06], [2.6, 0.3, 2.3, 4.2, 0.045], [4.6, 0.4, 2.8, 4.0, 0.035], [7.0, 0.8, 2.6, 3.6, 0.025]]) {
      halos.push([MOUTH.x + IN.x * s_ + RIGHT.x * w_, Fr.mouth[1] + h_, MOUTH.z + IN.y * s_ + RIGHT.z * w_, size, dc.r * k_, dc.g * k_, dc.b * k_, rnd()]);
    }
  }
  const crys = new THREE.InstancedMesh(cg, glowMat, count);
  crys.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const phase = new Float32Array(count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const nrm = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0), tilt = new THREE.Vector3(), col = new THREE.Color();
  let k = 0;
  for (const c of L.crystals) {
    const r = mulberry(c.seed);
    nrm.set(...c.n).normalize();
    if (c.kind === 'wall') nrm.y += 0.45, nrm.normalize();
    col.set(look.crystal[c.col] || look.crystal.teal);
    for (let i = 0; i < c.count; i++) {
      tilt.set(nrm.x + (r() - 0.5) * 0.9, nrm.y + (r() - 0.5) * 0.5, nrm.z + (r() - 0.5) * 0.9).normalize();
      q.setFromUnitVectors(UPV, tilt);
      q2.setFromAxisAngle(tilt, r() * 6.28);
      q.premultiply(q2);
      const big = i === 0 ? 1.0 : 0.45 + r() * 0.5, len = c.size * (0.55 + 0.95 * big), wid = c.size * (0.7 + 0.6 * big);
      s3.set(wid, len, wid);
      p3.set(c.p[0] + (r() - 0.5) * 0.5 * c.size - nrm.x * 0.12, c.p[1] + (r() - 0.5) * 0.3 * c.size - nrm.y * 0.12, c.p[2] + (r() - 0.5) * 0.5 * c.size - nrm.z * 0.12);
      m4.compose(p3, q, s3);
      crys.setMatrixAt(k, m4);
      const vary = 0.85 + r() * 0.3;
      crys.instanceColor.setXYZ(k, col.r * vary, col.g * vary, col.b * vary);
      phase[k] = r();
      k++;
    }
    halos.push([c.p[0] + nrm.x * 0.5 * c.size, c.p[1] + nrm.y * 0.5 * c.size, c.p[2] + nrm.z * 0.5 * c.size, 1.6 + c.size * 1.6, col.r * 0.32, col.g * 0.32, col.b * 0.32, r()]);
  }
  cg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  crys.instanceMatrix.needsUpdate = true; crys.frustumCulled = false; crys.name = 'crystals';
  group.add(crys);

  // ---- mushrooms
  const sg = shroomGeometry();
  let sn = 0;
  for (const s of L.shrooms) sn += s.count;
  const shroomMat = glowMat.clone();
  shroomMat.uniforms.uTime = time; shroomMat.uniforms.uCore = { value: 4.2 };
  shroomMat.uniforms.uSee = { value: new THREE.Vector4(0, 0, 0, 0) };      // (the caps are small, at the walls' feet: never thinned)
  shroomMat.userData.noCave = true;
  const shrooms = new THREE.InstancedMesh(sg, shroomMat, sn);
  shrooms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sn * 3), 3);
  const sph = new Float32Array(sn);
  k = 0;
  const shroomCols = [look.shroom, '#7fe6ff', look.shroom, '#ffb3e6'];
  for (const s of L.shrooms) {
    const r = mulberry(s.seed);
    col.set(shroomCols[Math.floor(r() * shroomCols.length)]);
    for (let i = 0; i < s.count; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 0.55 * s.size;
      p3.set(s.p[0] + Math.cos(a) * d, s.p[1] - 0.04, s.p[2] + Math.sin(a) * d);
      q.setFromAxisAngle(new THREE.Vector3(Math.cos(a + 1.6), 0, Math.sin(a + 1.6)), (r() - 0.5) * 0.5);
      s3.setScalar((0.6 + r() * 1.0) * s.size);
      m4.compose(p3, q, s3);
      shrooms.setMatrixAt(k, m4);
      shrooms.instanceColor.setXYZ(k, col.r, col.g, col.b);
      sph[k] = r();
      k++;
    }
    halos.push([s.p[0], s.p[1] + 0.25, s.p[2], 1.1 + s.size * 0.9, col.r * 0.2, col.g * 0.2, col.b * 0.2, r()]);
  }
  sg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(sph, 1));
  shrooms.frustumCulled = false; shrooms.name = 'mushrooms';
  group.add(shrooms);

  // ---- halos (and theirs in the pool)
  const hq = new THREE.PlaneGeometry(2, 2);
  const hg = new THREE.InstancedBufferGeometry();
  hg.index = hq.index; hg.setAttribute('position', hq.attributes.position);
  hg.setAttribute('aHalo', new THREE.InstancedBufferAttribute(new Float32Array(halos.flatMap((h) => [h[0], h[1], h[2], h[3]])), 4));
  hg.setAttribute('aHaloCol', new THREE.InstancedBufferAttribute(new Float32Array(halos.flatMap((h) => [h[4], h[5], h[6]])), 3));
  hg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(halos.map((h) => h[7])), 1));
  hg.instanceCount = halos.length;
  const haloMat = (mirror) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: HALO_VS, fragmentShader: HALO_FS, uniforms: { uTime: time, uMirror: { value: mirror ? 1 : 0 }, ...poolU },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    m.userData.noCave = true;
    return m;
  };
  const haloMesh = new THREE.Mesh(hg, haloMat(false));
  haloMesh.frustumCulled = false; haloMesh.renderOrder = 5; haloMesh.name = 'halos';
  const haloMirror = new THREE.Mesh(hg, haloMat(true));
  haloMirror.frustumCulled = false; haloMirror.renderOrder = 7; haloMirror.name = 'halos-mirrored';
  group.add(haloMesh, haloMirror);

  // ---- the pool, and the drops falling into it
  const drips = L.drips || [];
  const tFall = drips.map((d) => Math.sqrt(Math.max(0.01, 2 * (d.y - P.level) / 9.8)));
  const dripU = {};
  for (let i = 0; i < 5; i++) {
    const d = drips[i];
    dripU['uD' + i] = { value: d ? new THREE.Vector4(d.x, d.z, d.period, d.phase + tFall[i]) : new THREE.Vector4(0, 0, 0, 0) };
  }
  const poolMat = new THREE.ShaderMaterial({
    vertexShader: POOL_VS, fragmentShader: POOL_FS,
    uniforms: {
      uCaveVol: U.uCaveVol, uCaveBox0: U.uCaveBox0, uCaveBoxS: U.uCaveBoxS, uCaveScale: U.uCaveScale, uTime: time,
      uDeep: { value: hex3(look.water) }, uSprPos: U.uSprPos, uSprCol: U.uSprCol, ...poolU, ...dripU,
    },
    transparent: true, depthWrite: false,
  });
  poolMat.userData.noCave = true;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), poolMat);
  pool.scale.set(E.a + 1.6, 1, E.b + 1.6);
  pool.rotation.y = -Math.atan2(E.along[1], E.along[0]);
  pool.position.set(P.c[0], P.level, P.c[1]); pool.renderOrder = 2; pool.name = 'pool';
  group.add(pool);
  if (drips.length) {
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(drips.flatMap((d) => [d.x, d.y, d.z])), 3));
    dg.setAttribute('aDrop', new THREE.BufferAttribute(new Float32Array(drips.flatMap((d, i) => [d.y, d.period, d.phase, tFall[i]])), 4));
    const dropMat = new THREE.ShaderMaterial({
      vertexShader: DROP_VS, fragmentShader: DROP_FS, uniforms: { uTime: time, uPix: pix },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    dropMat.userData.noCave = true;
    const drops = new THREE.Points(dg, dropMat);
    drops.frustumCulled = false; drops.renderOrder = 6; drops.name = 'drops';
    group.add(drops);
  }

  // ---- the big fall's three strands, seen from behind; the lake out past the ledge; the day beyond; spray at their feet
  await onStep('เปิดม่านน้ำตก');
  const C = L.curtain, rows = C.rows, OUT = new THREE.Vector3(-IN.x, 0, -IN.y);
  const strandMat = new THREE.ShaderMaterial({
    vertexShader: CURTAIN_VS, fragmentShader: STRAND_FS,
    uniforms: { uTime: time, uBody: { value: hex3('#7fd8ea') }, uDeep: { value: hex3('#3fa9c9') } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  strandMat.userData.noCave = true;
  const feet = [];
  for (const st of L.strands || []) {
    const sr = st.rows, cols = 10, pos = [], uv = [], idx = [];
    sr.forEach((rw, i) => {
      for (let j = 0; j <= cols; j++) {
        const u = j / cols, a = (u - 0.5) * 2 * st.half, bow = 0.12 + 0.18 * (1 - (2 * u - 1) ** 2);
        pos.push(rw[0] + C.across[0] * a + OUT.x * bow, rw[1], rw[2] + C.across[2] * a + OUT.z * bow);
        uv.push(u, i / (sr.length - 1));
      }
    });
    for (let i = 0; i < sr.length - 1; i++) for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const sg2 = new THREE.BufferGeometry();
    sg2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    sg2.setIndex(idx);
    const m = new THREE.Mesh(sg2, strandMat);
    m.name = 'strand'; m.renderOrder = 4; m.frustumCulled = false;
    group.add(m);
    const f = sr[sr.length - 1];
    feet.push(new THREE.Vector4(f[0], f[2], st.half * 1.6, 0));
  }
  while (feet.length < 3) feet.push(new THREE.Vector4(0, 0, 0.001, 0));
  // the lake out past the ledge's edge (only seen beyond it: the rock's floor hides it under the ledge)
  const lakeMat = new THREE.ShaderMaterial({ vertexShader: CURTAIN_VS, fragmentShader: LAKE_FS, uniforms: { uTime: time, uF0: { value: feet[0] }, uF1: { value: feet[1] }, uF2: { value: feet[2] } } });
  lakeMat.userData.noCave = true;
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(40, 24).rotateX(-Math.PI / 2), lakeMat);
  lake.position.copy(MOUTH).addScaledVector(OUT, 13.5); lake.position.y = C.lake;
  lake.rotation.y = Math.atan2(OUT.x, OUT.z);
  lake.name = 'lake';
  group.add(lake);
  // the day beyond: a wide band round the mouth, painted from inside
  const dayMat = new THREE.ShaderMaterial({ vertexShader: CURTAIN_VS, fragmentShader: DAYOUT_FS, uniforms: { uTime: time, uLake: { value: C.lake }, uOut: { value: new THREE.Vector2(OUT.x, OUT.z) } }, side: THREE.BackSide });
  dayMat.userData.noCave = true;
  const outAng = Math.atan2(OUT.x, OUT.z);
  const day = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 40, 40, 1, true, outAng - 1.9, 3.8), dayMat);
  day.position.set(MOUTH.x, C.lake + 16, MOUTH.z);
  day.name = 'day-outside'; day.frustumCulled = false;
  group.add(day);
  const nSpray = 260, spg = new THREE.BufferGeometry(), sseed = new Float32Array(nSpray * 4);
  for (let i = 0; i < nSpray * 4; i++) sseed[i] = rnd();
  spg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nSpray * 3), 3));
  spg.setAttribute('aSeed', new THREE.BufferAttribute(sseed, 4));
  const sprayMat = new THREE.ShaderMaterial({
    vertexShader: SPRAY_VS, fragmentShader: SPRAY_FS,
    uniforms: { uTime: time, uPix: { value: 90 * pixelRatio }, uDay: { value: dayCol },
      uFoot: { value: new THREE.Vector3(rows[rows.length - 1][0], C.lake + 0.1, rows[rows.length - 1][2]) }, uAcross: { value: RIGHT.clone() }, uIn3: { value: new THREE.Vector3(IN.x, 0, IN.y) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  sprayMat.userData.noCave = true;
  const spray = new THREE.Points(spg, sprayMat);
  spray.frustumCulled = false; spray.renderOrder = 6; spray.name = 'spray';
  group.add(spray);
  // ---- mist: two veils low over the hall's floor
  const hallC = MOUTH.clone().addScaledVector(new THREE.Vector3(IN.x, 0, IN.y), 36).addScaledVector(RIGHT, 5);     // (the hall's middle)
  for (const [y, a] of [[0.7, 0.3], [2.0, 0.16]]) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: MIST_VS, fragmentShader: MIST_FS,
      uniforms: { uCaveVol: U.uCaveVol, uCaveBox0: U.uCaveBox0, uCaveBoxS: U.uCaveBoxS, uCaveScale: U.uCaveScale, uTime: time, uAlpha: { value: a }, uCol: { value: hex3(look.mist) } },
      transparent: true, depthWrite: false,
    });
    mat.userData.noCave = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(38, 34).rotateX(-Math.PI / 2), mat);
    m.rotation.y = -Math.atan2(IN.y, IN.x);
    m.position.set(hallC.x, P.level + 0.4 + y, hallC.z); m.renderOrder = 3; m.name = 'mist';
    group.add(m);
  }

  // ---- ferns where the daylight reaches
  await onStep('ปลูกเฟิร์นปากถ้ำ');
  const toward = new THREE.Vector3(-IN.x, 0.7, -IN.y).normalize();
  const haze = { color: look.fog, near: 8, far: 70, max: 0.7 };
  if (globals) { setGroundCoverSun(toward); N.setHaze(haze); }      // (shared with all the ferns and plants there are: in the game, set only while she is in here)
  if (L.cover && L.cover.length) {
    const cover = createGroundCover(L.cover.map((c) => ({ kind: c.kind, x: c.x, y: c.y, z: c.z, seed: c.seed, scale: c.scale })));
    cover.name = 'cave-cover';
    // a material of their own, the ferns' one copied (its uniforms shared: the time, the wind, the sun): the cave's light is
    // laid on it (cave-light.js), not on the one every fern of the game is drawn with (in the game, those of the village)
    const own = new Map();
    cover.traverse((o) => {
      const m = o.material;
      if (!m || !m.isShaderMaterial) return;
      if (!own.has(m)) { const u = m.uniforms; m.uniforms = {}; const c = m.clone(); m.uniforms = u; c.uniforms = { ...u }; own.set(m, c); }
      o.material = own.get(m);
    });
    group.add(cover);
  }

  // ---- what she bumps into, the floor and the roof over every spot (cave-level.js makes her level of it)
  const colliders = [];
  for (const f of L.fangs) if (f.up) colliders.push([f.x, f.z, f.r * 0.85]);
  for (const [x, z, r] of L.columns) colliders.push([x, z, r * 0.8]);
  // the curtain's line: how far in it is at a height (its rows go from the lip down)
  const rowIn = rows.map((rw) => [rw[1], inward(rw[0], rw[2])]).sort((a, b) => a[0] - b[0]);
  const curtainAt = (y) => {
    if (y <= rowIn[0][0]) return rowIn[0][1];
    for (let i = 1; i < rowIn.length; i++) if (y <= rowIn[i][0]) {
      const t = (y - rowIn[i - 1][0]) / (rowIn[i][0] - rowIn[i - 1][0]);
      return rowIn[i - 1][1] + (rowIn[i][1] - rowIn[i - 1][1]) * t;
    }
    return rowIn[rowIn.length - 1][1];
  };

  let clock = 0;
  const landed = drips.map(() => -1);
  return {
    group, light, layout: L, rock, colliders, floorMap, crowns: [], trunks: [],
    pool: P, look, fogColor: fogCol, frame: Fr, inward, curtainAt, haze, sun: toward,
    setPixelRatio(r) { pix.value = 52 * r; },          // (the glowworms and the drops are sized in pixels: the game's picture setting can change it)
    seeThrough(p, h = 1.75) { if (p) see.value.set(p.x, p.y + h * 0.55, p.z, 1.0); else see.value.w = 0; },
    update(dt, camera) {
      clock += dt;
      time.value = clock;
      N.update(dt);
      // a drop landing: the page hears it (when it is due by the same clock the rings use)
      if (onDrip) drips.forEach((d, i) => {
        const n = Math.floor((clock - d.phase - tFall[i]) / d.period);
        if (n > landed[i]) { if (landed[i] >= 0) onDrip(d.x, P.level, d.z); landed[i] = n; }
      });
    },
  };
}
