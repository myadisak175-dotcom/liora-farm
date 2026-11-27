/* ==========================================================================
   cave-hall.js  —  the forest hall, room ③ of the dungeon under the waterfall cliff (a beauty test: cave-hall.html)

     const hall = await createCaveHall({ onStep })
     scene.add(hall.group); ...; hall.light.apply(scene)     // the cave's light on the plants and on her (cave-light.js)
     every frame: hall.update(dt, camera)                    // water, dust, mist, crystals' pulse, the plants' wind
     hall.floorAt(x, z) / hall.ceilAt(x, z)                  // where she can stand, and the roof over it (null: rock)
     hall.heightAt(x, z)                                     // for the follow camera: the floor, or far up inside the rock
     hall.crowns, hall.trunks, hall.colliders, hall.layout

   One job: build the hall from what tools/make-cave-hall.py baked (assets/caves/cave-hall.bin + .json):
     the rock      one mesh, its light baked into it (the shaft, the crack's sky, the light thrown back off the sunlit floor,
                   the crystals); painted with the game's own pictures (the cliffs' brush-painted rock on the walls and the
                   roof, the damp forest floor underfoot, moss where the light reaches); the cave's dark air over it, thicker
                   low down; the sprite's light (cave-light.js' uniforms) added where she goes
     crystals      clusters on the walls and the floor, and some floating free (as the Chasm's lumenspar), glowing teal, each
                   with its own soft halo (no bloom: a phone would pay for that in every frame)
     mushrooms     small glowing caps in clumps along the walls and round the columns
     the shaft     sunlight through the crack in the roof onto the great tree: a soft beam, dust turning in it
     mist          a low veil over the floor, lit by whatever light is where it hangs
     the pool      under the crack's east end, a thin fall of water dropping into it from the roof
     the forest    the game's anime trees and bushes on the floor, trees hanging from the roof round the crack, ferns in the
                   shade and grass tufts in the light (anime-tree.js, ground-cover.js), lit by the cave (cave-light.js)
   ========================================================================== */
import * as THREE from 'three';
import * as N from './stylized-nature.js';
import { createAnimeForest, createAnimeTree, createAnimeBush, setAnimeSun } from './anime-tree.js';
import { createGroundCover, setGroundCoverSun } from './ground-cover.js';
import { createCaveLight } from './cave-light.js';

export const CAVE_LOOK = {
  fog: '#10242d', fogDensity: 0.018, mist: '#1e3a41', mistHeight: 1.8, rim: '#33626f',
  moss: '#4f6b2a', rockTint: [0.84, 0.89, 0.95], sky: '#d8ecff',
  shaft: '#fff0c4', shaftStrength: 0.5,
  crystal: { teal: '#47f0d8', cyan: '#62d8ff', white: '#c6f4ff' },
  shroom: '#b58cff',
};

const loadTex = (url) => new Promise((res) => {
  new THREE.TextureLoader().load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4; t.needsUpdate = true; res(t);
  }, undefined, () => res(null));
});
const hex3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- the rock
const ROCK_VS = /* glsl */`
attribute vec4 aLight;
attribute vec4 aInfo;
uniform float uScale;
varying vec3 vW, vN, vL;
varying vec4 vI;
varying float vD;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vL = aLight.rgb * uScale; vI = aInfo;
  vec4 mv = viewMatrix * w;
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const ROCK_FS = /* glsl */`
uniform sampler2D uCliff, uGround;
uniform vec2 uCliffTile;
uniform float uGroundTile;
uniform vec3 uMoss, uTint, uFogCol, uMistCol, uRim;
uniform vec3 uFog;               // density, mist height, mist strength
uniform vec4 uSprPos;
uniform vec3 uSprCol;
varying vec3 vW, vN, vL;
varying vec4 vI;
varying float vD;
void main() {
  vec3 n = normalize(vN);
  vec2 pw = pow(abs(n.xz), vec2(4.0)); pw /= max(pw.x + pw.y, 1e-4);
  vec3 wall = texture2D(uCliff, vW.zy * uCliffTile).rgb * pw.x + texture2D(uCliff, vW.xy * uCliffTile).rgb * pw.y;
  vec3 roof = texture2D(uCliff, vW.xz * uCliffTile.x * 1.4 + 0.37).rgb;
  vec3 ground = texture2D(uGround, vW.xz * uGroundTile).rgb;
  float up = smoothstep(0.5, 0.86, n.y), down = smoothstep(-0.3, -0.7, n.y);
  vec3 alb = mix(wall * uTint, ground, up);
  alb = mix(alb, roof * uTint * 0.92, down);
  // moss where the light reaches what faces up (and a little on the ledges of the strata)
  float moss = vI.g * (0.7 + 0.3 * ground.g / max(ground.r, 0.05));
  alb = mix(alb, uMoss * (0.8 + 0.4 * ground.r), clamp(moss, 0.0, 0.92));
  alb *= 1.0 - vI.b * 0.3;                                   // wet by the pool
  // the light: baked, and the sprite's
  vec3 L = vL;
  vec3 d = uSprPos.xyz - vW; float dist = length(d);
  float k = dist / max(uSprPos.w, 1e-3);
  float s = uSprPos.w > 0.0 ? (1.0 - smoothstep(0.0, 1.0, k)) / (1.0 + 9.0 * k * k) : 0.0;
  L += uSprCol * s * clamp(dot(n, d / max(dist, 1e-3)) * 0.65 + 0.35, 0.0, 1.0);
  vec3 col = alb * L;
  // a faint edge of light where the rock turns away from the eye: the cave's shapes read in the dark
  vec3 vdir = normalize(cameraPosition - vW);
  col += uRim * pow(1.0 - max(dot(n, vdir), 0.0), 3.0) * (0.35 + 0.65 * vI.r);
  // the cave's dark air, and the mist low down
  float f = 1.0 - exp(-vD * uFog.x);
  col = mix(col, uFogCol, clamp(f, 0.0, 0.88));
  float mist = (1.0 - smoothstep(0.0, uFog.y, vW.y)) * smoothstep(2.0, 14.0, vD) * uFog.z;
  col = mix(col, uMistCol + L * 0.05, clamp(mist, 0.0, 0.6));
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- glowing things (crystals, mushroom caps): they light themselves
const GLOW_VS = /* glsl */`
attribute float aPhase;
varying vec3 vC, vNv, vV;
varying float vY, vPh, vD;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
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
varying vec3 vC, vNv, vV;
varying float vY, vPh, vD;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vNv), vV)), 2.0);
  float pulse = 0.88 + 0.12 * sin(uTime * 1.4 + vPh * 6.28);
  vec3 col = mix(vC * 0.45, vC * 1.35 + 0.18, smoothstep(0.0, 1.0, vY * uCore)) * pulse + vC * fres * 0.9;
  col = mix(col, uFogCol, clamp((1.0 - exp(-vD * uFogD)) * 0.45, 0.0, 0.45));
  gl_FragColor = vec4(col, 1.0);
}`;
// soft halos: camera-facing quads, added on (each glowing thing carries its own glow)
const HALO_VS = /* glsl */`
attribute vec4 aHalo;          // xyz: where, w: size
attribute vec3 aHaloCol;
attribute float aPhase;
uniform float uTime;
varying vec2 vUv;
varying vec3 vC;
varying float vA;
void main() {
  vUv = position.xy;
  vec4 mv = viewMatrix * vec4(aHalo.xyz, 1.0);
  float pulse = 0.85 + 0.15 * sin(uTime * 1.4 + aPhase * 6.28);
  mv.xy += position.xy * aHalo.w;
  // pull the quad toward the eye so it is not cut by the rock it sits on
  mv.xyz += normalize(-mv.xyz) * min(aHalo.w * 0.5, 0.6);
  vC = aHaloCol * pulse;
  float dist = length(mv.xyz);
  vA = (1.0 - smoothstep(30.0, 60.0, dist)) * smoothstep(1.2, 4.5, dist);      // (none in the eye's face)
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

// ---------------------------------------------------------------- the shaft of sunlight, and the dust in it
const SHAFT_VS = /* glsl */`
varying vec2 vUv;
varying float vF, vD;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec3 nw = normalize(mat3(modelMatrix) * normal);
  vec3 v = normalize(cameraPosition - w.xyz);
  vF = abs(dot(nw, v));
  vec4 mv = viewMatrix * w;
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const SHAFT_FS = /* glsl */`
uniform vec3 uCol;
uniform float uStrength, uTime;
varying vec2 vUv;
varying float vF, vD;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  float a = pow(vF, 2.2);
  float streak = 0.6 + 0.4 * n1(vUv.x * 18.0 + uTime * 0.05) * n1(vUv.x * 7.0 - uTime * 0.03 + 3.0);
  float along = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.8, 1.0, vUv.y)) * (0.7 + 0.3 * vUv.y);
  float near = smoothstep(0.5, 3.5, vD);
  gl_FragColor = vec4(uCol * a * streak * along * near * uStrength, 1.0);
}`;
const DUST_VS = /* glsl */`
attribute vec4 aSeed;
uniform float uTime, uPix;
uniform vec3 uA, uAxis;          // the shaft: its foot, and up along it (length in w of aSeed's scale)
uniform float uLen, uRad;
varying float vA;
void main() {
  float t = fract(aSeed.w + uTime * 0.012 * (0.5 + aSeed.z));
  vec3 side = normalize(cross(uAxis, vec3(0.0, 0.0, 1.0)));
  vec3 side2 = cross(uAxis, side);
  float ang = aSeed.x * 6.283 + uTime * 0.05 * (aSeed.z - 0.5);
  vec3 p = uA + uAxis * (t * uLen) + (side * cos(ang) + side2 * sin(ang)) * uRad * sqrt(aSeed.y);
  p += vec3(sin(uTime * 0.3 + aSeed.x * 20.0), 0.0, cos(uTime * 0.27 + aSeed.y * 20.0)) * 0.25;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPix * (0.6 + aSeed.z) / max(-mv.z, 0.5);
  vA = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.8, 1.0, t)) * (0.55 + 0.45 * sin(uTime * 2.0 + aSeed.x * 40.0));
}`;
const DUST_FS = /* glsl */`
uniform vec3 uCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c)) * vA;
  gl_FragColor = vec4(uCol * a, 1.0);
}`;

// ---------------------------------------------------------------- mist, lit by the light where it hangs
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
float h2(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 q = vW.xz * 0.07;
  float n = n2(q + vec2(uTime * 0.012, uTime * 0.008)) * 0.6 + n2(q * 2.3 - vec2(uTime * 0.02, 0.0)) * 0.4;
  float a = smoothstep(0.35, 0.85, n) * uAlpha * smoothstep(1.5, 7.0, vD) * (1.0 - smoothstep(45.0, 70.0, vD))
    * smoothstep(0.5, 2.5, abs(cameraPosition.y - vW.y));            // (a veil seen edge-on from its own height: none)
  vec3 L = texture(uCaveVol, clamp((vW - uCaveBox0) * uCaveBoxS, 0.0, 1.0)).rgb * uCaveScale;
  gl_FragColor = vec4(uCol * 0.5 + L * 0.55, a);
}`;

// ---------------------------------------------------------------- the pool and the thin fall into it
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
uniform vec3 uDeep, uGlint, uShaftDir, uFall;
uniform vec4 uSprPos;
uniform vec3 uSprCol;
varying vec3 vW;
varying float vD;
float h2(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float hgt(vec2 p) {
  float r = distance(p, uFall.xz);
  float ring = sin(r * 7.0 - uTime * 5.0) * exp(-r * 0.55) * 0.5;
  return n2(p * 1.3 + uTime * 0.25) * 0.5 + n2(p * 2.9 - uTime * 0.31) * 0.25 + ring;
}
void main() {
  vec2 e = vec2(0.06, 0.0);
  float hx = hgt(vW.xz + e.xy) - hgt(vW.xz - e.xy), hz = hgt(vW.xz + e.yx) - hgt(vW.xz - e.yx);
  vec3 n = normalize(vec3(-hx * 0.9, 1.0, -hz * 0.9));
  vec3 v = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 L = texture(uCaveVol, clamp((vW + vec3(0.0, 0.4, 0.0) - uCaveBox0) * uCaveBoxS, 0.0, 1.0)).rgb * uCaveScale;
  vec3 r = reflect(-v, n);
  // what the water mirrors: the cave's dark, the teal glow round it, the shaft's warm light where it looks toward it
  vec3 refl = mix(vec3(0.05, 0.13, 0.15), L * 1.15, 0.6) + uGlint * pow(max(dot(r, uShaftDir), 0.0), 18.0) * 1.4;
  // light dancing on the surface where light falls on it
  float dance = n2(vW.xz * 2.2 + vec2(uTime * 0.6, -uTime * 0.4)) * n2(vW.xz * 3.7 - vec2(uTime * 0.5, uTime * 0.7));
  vec3 sd = uSprPos.xyz - vW; float sl = length(sd);
  refl += uSprCol * pow(max(dot(r, sd / max(sl, 1e-3)), 0.0), 80.0) * 2.0 * step(0.001, uSprPos.w);
  vec3 body = uDeep + L * 0.16;
  float foam = smoothstep(1.1, 0.0, distance(vW.xz, uFall.xz)) * (0.5 + 0.5 * n2(vW.xz * 6.0 + uTime * 2.0));
  vec3 col = mix(body, refl, fres) + vec3(0.85, 0.95, 1.0) * foam * 0.5 * (0.4 + L) + L * smoothstep(0.35, 0.8, dance) * 0.22;
  float a = mix(0.78, 0.96, fres) * (1.0 - smoothstep(55.0, 75.0, vD));
  gl_FragColor = vec4(col, a);
}`;
const FALL_VS = /* glsl */`
uniform vec3 uTop, uBot;
uniform float uWidth;
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv;
  vec3 axis = uTop - uBot;
  vec3 p = uBot + axis * uv.y;
  vec3 toCam = cameraPosition - p; toCam.y = 0.0;
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam + vec3(1e-4, 0.0, 0.0))));
  float w = uWidth * (0.6 + 0.4 * uv.y);
  p += side * (uv.x - 0.5) * w;
  vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const FALL_FS = /* glsl */`
uniform highp sampler3D uCaveVol;
uniform vec3 uCaveBox0, uCaveBoxS;
uniform float uCaveScale, uTime;
varying vec2 vUv;
varying vec3 vW;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  float edge = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0);
  float s = n1(vUv.x * 14.0 + floor(vUv.y * 2.0)) * 0.5 + n1(vUv.x * 30.0) * 0.5;
  float streak = smoothstep(0.25, 0.9, n1(vUv.x * 22.0 + 7.0) * 0.6 + n1((vUv.y + uTime * 0.9) * 9.0 + vUv.x * 13.0) * 0.6);
  vec3 L = texture(uCaveVol, clamp((vW - uCaveBox0) * uCaveBoxS, 0.0, 1.0)).rgb * uCaveScale;
  float a = edge * (0.35 + 0.65 * streak) * smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.96, 1.0, vUv.y));
  vec3 col = vec3(0.8, 0.92, 1.0) * (0.25 + L * 0.9) + s * 0.05;
  gl_FragColor = vec4(col, a * 0.8);
}`;

// ---------------------------------------------------------------- building it
function crystalGeometry() {
  // a six-sided prism, tapering to a point: 0..1 along y
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
// (three's BufferGeometryUtils, inlined for two simple merges: position + normal only)
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

export async function createCaveHall({ base = './assets/caves/cave-hall', ground = './assets/ground/', look = CAVE_LOOK, onStep = async () => {} } = {}) {
  await onStep('อ่านแผนผังถ้ำ');
  const [L, bin, cliff, floorTex] = await Promise.all([
    fetch(base + '.json').then((r) => r.json()),
    fetch(base + '.bin').then((r) => r.arrayBuffer()),
    loadTex(ground + 'cliff-paint.webp'),
    loadTex(ground + 'forest-damp-paint.webp'),
  ]);
  const B = L.bin, group = new THREE.Group();
  group.name = 'cave-hall';
  const light = createCaveLight({ volume: { ...B.volume, data: new Uint8Array(bin, B.volume.data, B.volume.nx * B.volume.ny * B.volume.nz * 4) }, scale: B.lightScale });
  const U = light.uniforms;
  const fogCol = hex3(look.fog);
  const SUN = new THREE.Vector3(...L.sun);

  // ---- the rock
  await onStep('ปั้นผนังถ้ำ');
  const M = B.mesh, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, M.pos, M.vertices * 3), 3));
  g.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(bin, M.nrm, M.vertices * 4), 4), 3, 0, true));
  g.setAttribute('aLight', new THREE.BufferAttribute(new Uint8Array(bin, M.light, M.vertices * 4), 4, true));
  g.setAttribute('aInfo', new THREE.BufferAttribute(new Uint8Array(bin, M.info, M.vertices * 4), 4, true));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, M.idx, M.indices), 1));
  g.computeBoundingSphere();
  const rockMat = new THREE.ShaderMaterial({
    vertexShader: ROCK_VS, fragmentShader: ROCK_FS,
    uniforms: {
      uScale: { value: B.lightScale }, uCliff: { value: cliff }, uGround: { value: floorTex },
      uCliffTile: { value: new THREE.Vector2(1 / 20, 1 / 10) }, uGroundTile: { value: 1 / 5 },
      uMoss: { value: hex3(look.moss) }, uTint: { value: new THREE.Vector3(...look.rockTint) },
      uFogCol: { value: fogCol }, uMistCol: { value: hex3(look.mist) }, uRim: { value: hex3(look.rim) },
      uFog: { value: new THREE.Vector3(look.fogDensity, look.mistHeight, 0.35) },
      uSprPos: U.uSprPos, uSprCol: U.uSprCol,
    },
  });
  rockMat.userData.noCave = true;
  const rock = new THREE.Mesh(g, rockMat);
  rock.name = 'cave-rock';
  group.add(rock);

  // ---- crystals: clusters on the walls and the floor; some floating free
  await onStep('ปลูกคริสตัล');
  const time = { value: 0 };
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
    uniforms: { uTime: time, uCore: { value: 1.0 }, uFogCol: { value: fogCol }, uFogD: { value: look.fogDensity } },
  });
  glowMat.userData.noCave = true;
  const halos = [];                                // [x, y, z, size, r, g, b, phase]
  const cg = crystalGeometry(), rnd = mulberry(91);
  const fixed = L.crystals.filter((c) => c.kind !== 'float'), floating = L.crystals.filter((c) => c.kind === 'float');
  let count = 0;
  for (const c of fixed) count += c.count;
  const crys = new THREE.InstancedMesh(cg, glowMat, count);
  crys.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const phase = new Float32Array(count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const nrm = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0), tilt = new THREE.Vector3(), col = new THREE.Color();
  let k = 0;
  for (const c of fixed) {
    const r = mulberry(c.seed);
    nrm.set(...c.n).normalize();
    // floor clusters stand up; wall clusters lean out of the wall and a little upward
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
    const hc = new THREE.Color(look.crystal[c.col] || look.crystal.teal);
    halos.push([c.p[0] + nrm.x * 0.5 * c.size, c.p[1] + nrm.y * 0.5 * c.size, c.p[2] + nrm.z * 0.5 * c.size, 1.6 + c.size * 1.6, hc.r * 0.32, hc.g * 0.32, hc.b * 0.32, r()]);
  }
  cg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  crys.instanceMatrix.needsUpdate = true; crys.frustumCulled = false; crys.name = 'crystals';
  group.add(crys);
  // floating ones: a long bipyramid each, turning slowly, bobbing
  const fg = new THREE.OctahedronGeometry(1, 0).scale(0.32, 0.9, 0.32).translate(0, 0.5, 0);
  fg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(floating.map(() => rnd())), 1));
  const floatMesh = new THREE.InstancedMesh(fg, glowMat, floating.length);
  floatMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(floating.length * 3), 3);
  floating.forEach((c, i) => {
    col.set(look.crystal[c.col] || look.crystal.cyan);
    floatMesh.instanceColor.setXYZ(i, col.r * 1.1, col.g * 1.1, col.b * 1.1);
    halos.push([c.p[0], c.p[1] + 0.3, c.p[2], 2.2 + c.size * 2.0, col.r * 0.4, col.g * 0.4, col.b * 0.4, rnd()]);
  });
  floatMesh.frustumCulled = false; floatMesh.name = 'floating-crystals';
  group.add(floatMesh);
  const floatAt = (dt, t) => {
    floating.forEach((c, i) => {
      q.setFromAxisAngle(UPV, t * 0.25 + i);
      q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.18 * Math.sin(t * 0.5 + i));
      q.multiply(q2);
      p3.set(c.p[0], c.p[1] + Math.sin(t * 0.8 + i * 1.7) * 0.18, c.p[2]);
      s3.setScalar(c.size);
      m4.compose(p3, q, s3);
      floatMesh.setMatrixAt(i, m4);
    });
    floatMesh.instanceMatrix.needsUpdate = true;
  };
  floatAt(0, 0);

  // ---- mushrooms: clumps of small glowing caps
  const sg = shroomGeometry();
  let sn = 0;
  for (const s of L.shrooms) sn += s.count;
  const shroomMat = glowMat.clone();
  shroomMat.uniforms.uTime = time; shroomMat.uniforms.uCore = { value: 4.2 };
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

  // ---- halos
  const hq = new THREE.PlaneGeometry(2, 2);
  const hg = new THREE.InstancedBufferGeometry();
  hg.index = hq.index; hg.setAttribute('position', hq.attributes.position);
  hg.setAttribute('aHalo', new THREE.InstancedBufferAttribute(new Float32Array(halos.flatMap((h) => [h[0], h[1], h[2], h[3]])), 4));
  hg.setAttribute('aHaloCol', new THREE.InstancedBufferAttribute(new Float32Array(halos.flatMap((h) => [h[4], h[5], h[6]])), 3));
  hg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(halos.map((h) => h[7])), 1));
  hg.instanceCount = halos.length;
  const haloMat = new THREE.ShaderMaterial({
    vertexShader: HALO_VS, fragmentShader: HALO_FS, uniforms: { uTime: time },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  haloMat.userData.noCave = true;
  const haloMesh = new THREE.Mesh(hg, haloMat);
  haloMesh.frustumCulled = false; haloMesh.renderOrder = 5; haloMesh.name = 'halos';
  group.add(haloMesh);

  // ---- the shaft and its dust
  const cr = L.crack, foot = new THREE.Vector3(...L.shaftFoot);
  const top = foot.clone().addScaledVector(SUN, (cr.y + 7.5 - foot.y) / SUN.y);
  const shaftLen = top.distanceTo(foot);
  const sgeo = new THREE.CylinderGeometry(1, 1.3, 1, 28, 1, true).translate(0, 0.5, 0);
  const shaftMat = new THREE.ShaderMaterial({
    vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS,
    uniforms: { uCol: { value: hex3(look.shaft) }, uStrength: { value: look.shaftStrength }, uTime: time },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  shaftMat.userData.noCave = true;
  const shaft = new THREE.Mesh(sgeo, shaftMat);
  shaft.position.copy(foot);
  shaft.quaternion.setFromUnitVectors(UPV, SUN);
  // its cross-section: the crack's shape, turned with it
  const sx = new THREE.Group();
  sx.position.copy(foot); sx.quaternion.copy(shaft.quaternion);
  shaft.position.set(0, 0, 0); shaft.quaternion.identity();
  shaft.scale.set(cr.a * 0.8, shaftLen, cr.b * 0.85);
  shaft.rotation.y = -cr.ang;
  sx.add(shaft); sx.name = 'shaft';
  group.add(sx);
  const nDust = 320, dg = new THREE.BufferGeometry(), dseed = new Float32Array(nDust * 4);
  for (let i = 0; i < nDust * 4; i++) dseed[i] = rnd();
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nDust * 3), 3));
  dg.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 4));
  const dustMat = new THREE.ShaderMaterial({
    vertexShader: DUST_VS, fragmentShader: DUST_FS,
    uniforms: { uTime: time, uPix: { value: 60 }, uA: { value: foot.clone() }, uAxis: { value: SUN.clone() }, uLen: { value: shaftLen * 0.92 }, uRad: { value: cr.a * 0.75 }, uCol: { value: hex3('#ffe9b8') } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  dustMat.userData.noCave = true;
  const dust = new THREE.Points(dg, dustMat);
  dust.frustumCulled = false; dust.name = 'dust';
  group.add(dust);

  // ---- mist: two veils low over the floor
  for (const [y, a] of [[0.7, 0.32], [2.0, 0.18]]) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: MIST_VS, fragmentShader: MIST_FS,
      uniforms: { uCaveVol: U.uCaveVol, uCaveBox0: U.uCaveBox0, uCaveBoxS: U.uCaveBoxS, uCaveScale: U.uCaveScale, uTime: time, uAlpha: { value: a }, uCol: { value: hex3(look.mist) } },
      transparent: true, depthWrite: false,
    });
    mat.userData.noCave = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(70, 54).rotateX(-Math.PI / 2), mat);
    m.position.y = y; m.renderOrder = 3; m.name = 'mist';
    group.add(m);
  }

  // ---- the pool and the thin fall into it
  const P = L.pool, T = L.trickle;
  const poolMat = new THREE.ShaderMaterial({
    vertexShader: POOL_VS, fragmentShader: POOL_FS,
    uniforms: {
      uCaveVol: U.uCaveVol, uCaveBox0: U.uCaveBox0, uCaveBoxS: U.uCaveBoxS, uCaveScale: U.uCaveScale, uTime: time,
      uDeep: { value: hex3('#061a1e') }, uGlint: { value: hex3('#fff1c8') }, uShaftDir: { value: SUN.clone() },
      uFall: { value: new THREE.Vector3(...T.bottom) }, uSprPos: U.uSprPos, uSprCol: U.uSprCol,
    },
    transparent: true, depthWrite: false,
  });
  poolMat.userData.noCave = true;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(P.r + 1.6, 48).rotateX(-Math.PI / 2), poolMat);
  pool.position.set(P.c[0], P.level, P.c[1]); pool.renderOrder = 2; pool.name = 'pool';
  group.add(pool);
  const fallMat = new THREE.ShaderMaterial({
    vertexShader: FALL_VS, fragmentShader: FALL_FS,
    uniforms: { uTop: { value: new THREE.Vector3(...T.top) }, uBot: { value: new THREE.Vector3(...T.bottom) }, uWidth: { value: 0.55 },
      uCaveVol: U.uCaveVol, uCaveBox0: U.uCaveBox0, uCaveBoxS: U.uCaveBoxS, uCaveScale: U.uCaveScale, uTime: time },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  fallMat.userData.noCave = true;
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 48), fallMat);
  fall.frustumCulled = false; fall.renderOrder = 4; fall.name = 'trickle';
  group.add(fall);

  // ---- the forest
  await onStep('ปลูกป่าใต้ดิน');
  setAnimeSun(SUN); setGroundCoverSun(SUN);
  N.setHaze({ color: look.fog, near: 8, far: 70, max: 0.7 });
  const floorTrees = L.trees.map((t) => ({ kind: t.kind === 'bush' ? 'bush' : 'tree', type: t.kind === 'bush' ? undefined : t.type, seed: t.seed, x: t.x, y: t.y - 0.05, z: t.z, rotY: (t.seed * 2.39) % 6.28, scale: t.scale, detail: 1 }));
  const forest = createAnimeForest(floorTrees);
  forest.name = 'cave-forest';
  group.add(forest);
  // a sample of each kind, to know how big its crown is (for the camera, which keeps out of the leaves)
  const crownOf = {};
  for (const type of new Set(L.trees.filter((t) => t.kind !== 'bush').map((t) => t.type))) {
    const sample = createAnimeTree({ type, seed: 1, falling: false });
    const box = new THREE.Box3().setFromObject(sample), sz = box.getSize(new THREE.Vector3());
    crownOf[type] = { y: box.min.y + sz.y * 0.68, r: Math.max(sz.x, sz.z) * 0.42 };
    sample.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  const crowns = [], trunks = [], colliders = [];
  for (const t of L.trees) {
    if (t.kind === 'bush') { colliders.push([t.x, t.z, 0.55 * t.scale]); continue; }
    const c = crownOf[t.type] || { y: 6, r: 3 };
    crowns.push([t.x, t.y + c.y * t.scale, t.z, c.r * t.scale]);
    trunks.push([t.x, t.z, 0.32 * t.scale, t.y, t.y + c.y * t.scale * 0.7]);
    colliders.push([t.x, t.z, 0.38 * t.scale]);
  }
  for (const [x, z, r] of L.columns) colliders.push([x, z, r * 0.78]);
  // trees hanging from the roof, round the crack
  for (const h of L.hanging) {
    const tr = createAnimeTree({ type: h.type, seed: h.seed, falling: false });
    tr.position.set(h.x, h.roof, h.z);
    tr.rotation.set(Math.PI, (h.seed * 1.7) % 6.28, 0);
    tr.scale.setScalar(h.scale);
    tr.name = 'hanging-tree';
    group.add(tr);
  }
  // green hanging over the crack's edge, in the sun
  for (const h of L.rim || []) {
    const bu = createAnimeBush({ seed: h.seed });
    bu.position.set(h.x, h.y, h.z);
    bu.rotation.set(Math.PI, (h.seed * 2.3) % 6.28, 0);
    bu.scale.setScalar(h.scale);
    bu.name = 'crack-green';
    group.add(bu);
  }
  // ferns in the shade, grass tufts in the light
  const cover = createGroundCover(L.cover.map((c) => ({ kind: c.kind, x: c.x, y: c.y, z: c.z, seed: c.seed, scale: c.scale })));
  cover.name = 'cave-cover';
  group.add(cover);

  // ---- where she can stand
  const F = B.floor, fl = new Int16Array(bin, F.floor, F.nx * F.nz), ce = new Int16Array(bin, F.ceil, F.nx * F.nz);
  const NONE = -32768;
  const at = (arr, x, z) => {
    const fx = (x - F.x0) / F.cell, fz = (z - F.z0) / F.cell;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= F.nx - 1 || j >= F.nz - 1) return null;
    const a = arr[i * F.nz + j], b = arr[(i + 1) * F.nz + j], c = arr[i * F.nz + j + 1], d = arr[(i + 1) * F.nz + j + 1];
    if (a === NONE || b === NONE || c === NONE || d === NONE) {
      const u = fx - i, v = fz - j, near = [[a, u + v], [b, 1 - u + v], [c, u + 1 - v], [d, 2 - u - v]].filter((e) => e[0] !== NONE).sort((p, q2) => p[1] - q2[1]);
      return near.length && near[0][1] < 0.9 ? near[0][0] / 100 : null;
    }
    const u = fx - i, v = fz - j;
    return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) / 100;
  };
  const floorAt = (x, z) => at(fl, x, z), ceilAt = (x, z) => at(ce, x, z);
  const heightAt = (x, z) => { const f = floorAt(x, z); return f === null ? 60 : f; };

  let clock = 0;
  return {
    group, light, layout: L, rock, crowns, trunks, colliders, floorAt, ceilAt, heightAt,
    sun: SUN, pool: P, look, fogColor: fogCol,
    update(dt, camera) {
      clock += dt;
      time.value = clock;
      N.update(dt);
      floatAt(dt, clock);
    },
  };
}
