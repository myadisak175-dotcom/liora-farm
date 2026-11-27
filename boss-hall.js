/* ==========================================================================
   boss-hall.js  —  the boss's hall, room ⑤ of the dungeon under the waterfall cliff (boss-hall.html; made 28 Nov 2026 for
   the user's "ห้องบอสแบบ solo leveling": the dark throne room and the round temple of giant statues at once)

     const hall = await createBossHall({ onStep })
     scene.add(hall.group); ...; hall.light.apply(scene)     // the hall's light on her and the sprite (boss-light.js)
     hall.fx.front / door / wake / eyes / doorGlow / circle / throne / flare    // what the page's scenes play with (below)
     every frame: hall.update(dt, camera)
     hall.floorMap, hall.layout, hall.colliders, hall.doorColliders, hall.trunks, hall.crowns   // cave-level.js makes her level

   One job: build the hall from what tools/make-boss-hall.py baked (assets/caves/boss-hall.bin + .json) and draw it:
     the stone      one mesh, its light baked into it: the light that is always there (the dark; the pale shaft down the
                    oculus onto the rune circle; the two fires before the door), and the light of every other fire as one
                    number, coloured and lit here (fx.front: the fires have caught as far north as this z; fx.wake: their
                    blue turned red). Painted: the walls in courses of cut blocks, the floor in polished slabs (in rings
                    round the rotunda's middle, smaller and darker down the way), the carving and the statues in the
                    cliffs' brush-painted rock gone cold grey, the fires' stands in iron; the hall's dark air, a low mist
     the runes      grooves that glow: round the door (fx.doorGlow), down the way and round the pillars (as the fires catch),
                    the circle (fx.circle, rippling outward), the throne and the disc behind it (fx.throne); blue, red awake
     the eyes       two slits in each statue's hollow hood, lit one statue after another as fx.eyes goes 0 -> 1, each with a
                    soft halo (no bloom: a phone would pay for that in every frame)
     the fires      flames on the stands, drawn in the shader (each catches with a burst as the front passes it), a halo
                    round each, embers rising
     the door       two leaves on their hinges (fx.door 0 shut .. 1 open), carved and studded, a seam of runes down the
                    middle and a ring across both; lit by the hall's light (boss-light.js' bossLightAt)
     the shaft      the oculus' pale light down onto the circle, dust turning in it
   ========================================================================== */
import * as THREE from 'three';
import { createBossLight } from './boss-light.js';

export const BOSS_LOOK = {
  fog: '#09121f', fogDensity: 0.017, mist: '#141024', mistHeight: 1.4, rim: '#22385a',
  fireBlue: [0.36, 0.74, 1.0], fireRed: [1.0, 0.2, 0.25],
  runeBlue: [0.38, 0.8, 1.0], runeRed: [1.0, 0.13, 0.2],
  eye: [1.0, 0.1, 0.16],
  sky: [0.62, 0.76, 1.0],
  background: '#05080f',
};

const loadTex = (url) => new Promise((res) => {
  new THREE.TextureLoader().load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4; t.needsUpdate = true; res(t);
  }, undefined, () => res(null));
});
const v3 = (a) => new THREE.Vector3(...a);
const NOISE = /* glsl */`
float bhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bhash(i), bhash(i + vec2(1.0, 0.0)), f.x), mix(bhash(i + vec2(0.0, 1.0)), bhash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

// ---------------------------------------------------------------- the stone
const HALL_VS = /* glsl */`
attribute vec4 aLight;
attribute vec4 aInfo;
uniform float uLS, uFS;
varying vec3 vW, vN, vBase;
varying vec2 vUv;
varying float vFire, vRune, vPhase, vD;
flat varying float vMat, vGroup;               // (flat: a triangle is one thing, never a blend of two)
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vBase = aLight.rgb * uLS; vFire = aLight.a * uFS;
  vMat = aInfo.x; vGroup = aInfo.y; vPhase = aInfo.z; vRune = aInfo.w / 127.5;
  vUv = uv;
  vec4 mv = viewMatrix * w;
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const HALL_FS = /* glsl */`
uniform sampler2D uBlocks, uSlabs, uRock;
uniform vec3 uBossFire, uRuneCol, uEyeCol, uSkyCol, uFogCol, uMistCol, uRimCol;
uniform float uBossFront, uTime, uCircle, uThrone, uDoorGlow, uEyes;
uniform vec3 uFog;                 // density, mist height, mist strength
uniform vec4 uSprPos;
uniform vec3 uSprCol;
uniform vec2 uC;                   // the rotunda's middle (x, z)
varying vec3 vW, vN, vBase;
varying vec2 vUv;
varying float vFire, vRune, vPhase, vD;
flat varying float vMat, vGroup;
vec3 tri(sampler2D t, vec3 p, vec3 n, float s) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
  return texture2D(t, p.zy * s).rgb * w.x + texture2D(t, p.xz * s).rgb * w.y + texture2D(t, p.xy * s).rgb * w.z;
}
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
float caught(float z) { return clamp((z - uBossFront) / 5.0 + 0.5, 0.0, 1.0); }
void main() {
  float m = floor(vMat + 0.5);
  vec3 n = normalize(vN);
  vec3 alb, emit = vec3(0.0);
  if (m < 0.5) {                               // the floor: polished slabs; in rings round the rotunda's middle; the way's darker
    vec2 p = vW.xz; float tint = 1.0;
    vec2 d = vW.xz - uC; float r = length(d);
    if (vW.z < -16.0 && r < 23.0) {
      float rc = (floor(r / 2.0) + 0.5) * 2.0;
      p = vec2(atan(-d.x, d.y) * rc, r);
    } else if (abs(vW.x) < 2.0 && vW.z < 21.0) { p = vW.xz * 2.0 + 0.5; tint = 0.72; }
    alb = texture2D(uSlabs, p * 0.25).rgb * tint * 1.45;
  } else if (m < 1.5) {                        // the walls' blocks, grimed at their foot
    alb = texture2D(uBlocks, vUv * 0.25).rgb * 1.45 * (0.74 + 0.26 * smoothstep(0.0, 1.8, vW.y));
  } else if (m < 4.5) {                        // carved stone, the statues, iron: the cliffs' brush-painted rock in cold greys
    float l = smoothstep(0.35, 0.85, lum(tri(uRock, vW, n, m < 2.5 ? 0.16 : 0.24)));
    if (m < 2.5) alb = mix(vec3(0.23, 0.26, 0.33), vec3(0.47, 0.51, 0.6), l);
    else if (m < 3.5) alb = mix(vec3(0.31, 0.33, 0.39), vec3(0.64, 0.66, 0.73), l);
    else alb = mix(vec3(0.09, 0.095, 0.115), vec3(0.24, 0.25, 0.29), l);
  } else if (m < 5.5) {                        // fallen stone
    alb = mix(vec3(0.17, 0.18, 0.23), vec3(0.38, 0.39, 0.45), smoothstep(0.35, 0.85, lum(tri(uRock, vW, n, 0.35))));
  } else if (m < 6.5) {                        // the runes: dark grooves that glow
    alb = vec3(0.04, 0.05, 0.07);
    float g = floor(vGroup + 0.5), on;
    if (g < 20.5) on = uThrone * (0.75 + 0.25 * sin(uTime * 2.0 - vPhase * 0.05));
    else if (g < 21.5) on = uCircle * (0.68 + 0.32 * sin(uTime * 2.4 - vPhase * 0.07));
    else if (g < 22.5) on = caught(vW.z) * (0.85 + 0.15 * sin(uTime * 3.0 + vPhase * 0.1));
    else if (g < 23.5) on = uDoorGlow;
    else on = caught(vW.z) * 0.36;
    emit = uRuneCol * on * 1.7;
  } else if (m < 7.5) {                        // the roof, the dome: blocks lost in the dark
    alb = texture2D(uBlocks, vUv * 0.2).rgb * 1.1;
  } else if (m < 8.5) {                        // a statue's eyes
    alb = vec3(0.0);
    float k = vPhase / 32.0 * 0.1;
    emit = uEyeCol * smoothstep(k, k + 0.12, uEyes) * (2.6 + 0.5 * sin(uTime * 9.0 + vGroup * 1.7));
  } else if (m < 9.5) {                        // the hollow of a hood
    alb = vec3(0.012, 0.012, 0.018);
  } else {                                     // the light down the oculus
    alb = vec3(0.0); emit = uSkyCol * 1.4;
  }
  vec3 L = vBase + vFire * uBossFire * caught(vW.z) + vRune * uRuneCol * uCircle * 0.9;
  vec3 sd = uSprPos.xyz - vW; float sl = length(sd);
  float sk = sl / max(uSprPos.w, 1e-3);
  float ss = uSprPos.w > 0.0 ? (1.0 - smoothstep(0.0, 1.0, sk)) / (1.0 + 9.0 * sk * sk) : 0.0;
  L += uSprCol * ss * clamp(dot(n, sd / max(sl, 1e-3)) * 0.65 + 0.35, 0.0, 1.0);
  L /= 1.0 + 0.16 * max(L.r, max(L.g, L.b));                     // (near a fire the light rolls off, not burns to white)
  vec3 col = alb * L;
  vec3 vdir = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(dot(n, vdir), 0.0), 3.0);
  col += uRimCol * fres * (m > 1.5 && m < 4.5 ? 0.55 : 0.25);                    // (shapes read in the dark)
  if (m < 0.5) col += (vFire * uBossFire * caught(vW.z) + vBase * 0.6) * fres * 0.14;   // the polished floor takes the light
  float f = clamp(1.0 - exp(-vD * uFog.x), 0.0, 0.93);
  col = mix(col, uFogCol, f);
  float mist = (1.0 - smoothstep(0.0, uFog.y, vW.y)) * smoothstep(3.0, 16.0, vD) * uFog.z;
  col = mix(col, uMistCol + L * 0.03, clamp(mist, 0.0, 0.5));
  col += emit * (1.0 - f * 0.55);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- the door's leaves
const DOOR_VS = /* glsl */`
attribute float aGlow;
varying vec3 vO, vN, vL, vW;
varying float vGlow, vD;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vO = position; vN = normalize(mat3(modelMatrix) * normal); vGlow = aGlow;
  vL = bossLightAt(w.xyz);
  vec4 mv = viewMatrix * w; vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const DOOR_FS = /* glsl */`
uniform sampler2D uRock;
uniform vec3 uRuneCol, uFogCol, uRimCol;
uniform float uDoorGlow, uFogD, uTime;
varying vec3 vO, vN, vL, vW;
varying float vGlow, vD;
void main() {
  vec3 n = normalize(vN);
  vec3 w = pow(abs(normalize(vN)), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
  vec3 t = texture2D(uRock, vO.zy * 0.22).rgb * w.x + texture2D(uRock, vO.xz * 0.22).rgb * w.y + texture2D(uRock, vO.xy * 0.22).rgb * w.z;
  float l = smoothstep(0.35, 0.85, dot(t, vec3(0.3, 0.59, 0.11)));
  vec3 alb = mix(vec3(0.13, 0.14, 0.17), vec3(0.33, 0.34, 0.39), l);
  if (vGlow > 0.5) alb = vec3(0.03, 0.035, 0.05);
  vec3 col = alb * vL;
  float fres = pow(1.0 - max(dot(n, normalize(cameraPosition - vW)), 0.0), 3.0);
  col += uRimCol * fres * 0.4;
  float f = clamp(1.0 - exp(-vD * uFogD), 0.0, 0.93);
  col = mix(col, uFogCol, f);
  if (vGlow > 0.5) col += uRuneCol * uDoorGlow * (1.5 + 0.25 * sin(uTime * 2.6 + vO.y * 0.8)) * (1.0 - f * 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;

function doorGeometry(side) {
  // one leaf, hinged at its origin: it reaches 3.6 m toward the middle (-x for the east leaf, +x for the west), 9 m up, its
  // nave face at z 0 and the vestibule's at 0.5. Carved on the vestibule's face: a frame, two bands, half of a ring across both
  // leaves, studs; a seam of runes down its inner edge and a ring of runes inside the carved one
  const pos = [], nrm = [], glow = [], idx = [];
  const s = side;                                  // +1 east leaf (reaches -x), -1 west leaf (reaches +x)
  const quadAt = (o, u, v, g) => {
    const n = new THREE.Vector3().crossVectors(u, v).normalize();
    const b = pos.length / 3;
    for (const [a, c] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(o.x + u.x * a + v.x * c, o.y + u.y * a + v.y * c, o.z + u.z * a + v.z * c);
      nrm.push(n.x, n.y, n.z); glow.push(g);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const box = (x0, x1, y0, y1, z0, z1, g = 0) => {       // (x in the leaf's own reach: 0 at the hinge .. 3.6 at the seam)
    const X0 = -s * x0, X1 = -s * x1, lo = Math.min(X0, X1), hi = Math.max(X0, X1);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    quadAt(V(lo, y0, z1), V(hi - lo, 0, 0), V(0, y1 - y0, 0), g);             // +z
    quadAt(V(hi, y0, z0), V(lo - hi, 0, 0), V(0, y1 - y0, 0), g);             // -z
    quadAt(V(hi, y0, z1), V(0, 0, z0 - z1), V(0, y1 - y0, 0), g);             // +x
    quadAt(V(lo, y0, z0), V(0, 0, z1 - z0), V(0, y1 - y0, 0), g);             // -x
    quadAt(V(lo, y1, z1), V(hi - lo, 0, 0), V(0, 0, z0 - z1), g);             // +y
    quadAt(V(lo, y0, z0), V(hi - lo, 0, 0), V(0, 0, z1 - z0), g);             // -y
  };
  const W = 3.6, H = 9.0, T = 0.5;
  box(0, W, 0, H, 0, T);                                       // the slab
  const F = 0.08;
  box(0, W, H - 0.32, H, T, T + F); box(0, W, 0, 0.32, T, T + F);                 // its frame
  box(0, 0.3, 0.32, H - 0.32, T, T + F); box(W - 0.26, W, 0.32, H - 0.32, T, T + F);
  for (const y of [2.85, 6.35]) box(0.3, W - 0.26, y, y + 0.2, T, T + 0.06);      // two bands
  // half a ring across both leaves (its middle on the seam, 4.6 up), and runes inside it
  const ring = (r0, r1, z0, z1, g, n = 20) => {
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i / n * Math.PI, a1 = -Math.PI / 2 + (i + 1) / n * Math.PI;
      const P = (r, a, z) => new THREE.Vector3(-s * (W - r * Math.cos(a)), 4.6 + r * Math.sin(a), z);
      const o = P(r0, a0, z1), u = P(r1, a0, z1).sub(o), v = P(r0, a1, z1).sub(o);
      const flipFront = new THREE.Vector3().crossVectors(u, v).z < 0;
      if (flipFront) quadAt(o, v, u, g); else quadAt(o, u, v, g);
      // its outer and inner sides
      const so = P(r1, a0, z0), su = P(r1, a1, z0).sub(so), sv = new THREE.Vector3(0, 0, z1 - z0);
      if (new THREE.Vector3().crossVectors(su, sv).dot(P(r1, (a0 + a1) / 2, z0).sub(new THREE.Vector3(-s * W, 4.6, z0))) < 0) quadAt(so, sv, su, g); else quadAt(so, su, sv, g);
      const si = P(r0, a0, z0), sui = P(r0, a1, z0).sub(si);
      if (new THREE.Vector3().crossVectors(sui, sv).dot(P(r0, (a0 + a1) / 2, z0).sub(new THREE.Vector3(-s * W, 4.6, z0))) > 0) quadAt(si, sv, sui, g); else quadAt(si, sui, sv, g);
    }
  };
  ring(2.05, 2.35, T, T + 0.11, 0);
  ring(1.72, 1.8, T, T + 0.02, 1, 24);
  for (let k = 0; k < 4; k++) {                                // glyph strokes between the rings
    const a = -Math.PI / 2 + (k + 0.5) / 4 * Math.PI;
    const r0 = 1.85, r1 = 2.0, c = Math.cos(a), sn = Math.sin(a);
    const xa = W - r1 * c, xb = W - r0 * c, ya = 4.6 + r0 * sn, yb = 4.6 + r1 * sn;
    box(Math.min(xa, xb) - 0.03, Math.max(xa, xb) + 0.03, Math.min(ya, yb) - 0.03, Math.max(ya, yb) + 0.03, T, T + 0.025, 1);
  }
  box(W - 0.05, W, 0.32, H - 0.32, T, T + 0.03, 1);                                // the seam
  for (let i = 0; i < 3; i++) for (let j = 0; j < 6; j++) {                        // studs
    const x = 0.65 + i * 0.6, y = j < 3 ? 0.9 + j * 0.62 : 6.95 + (j - 3) * 0.62;
    box(x - 0.09, x + 0.09, y - 0.09, y + 0.09, T, T + 0.09);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- the fires: flames, halos, embers
const FLAME_VS = /* glsl */`
attribute vec4 aFire;            // where (the flame's foot), how big
attribute float aAlways, aSeed;
uniform float uBossFront, uTime, uFlare;
varying vec2 vUv;
varying float vLit, vSeed;
void main() {
  float lit = aAlways > 0.5 ? 1.0 : clamp((aFire.z - uBossFront) / 1.5 + 0.5, 0.0, 1.0);
  float pop = aAlways > 0.5 ? 0.0 : exp(-pow((aFire.z - uBossFront - 2.0) / 2.2, 2.0));      // a burst as it catches
  float s = aFire.w * lit * (1.0 + 0.7 * pop + 0.35 * uFlare) * (0.93 + 0.07 * sin(uTime * 11.0 + aSeed * 40.0));
  vec3 c = aFire.xyz;
  vec3 toCam = normalize(vec3(cameraPosition.x - c.x, 0.0, cameraPosition.z - c.z) + vec3(1e-4));
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  vec3 wp = c + right * position.x * s * 0.95 + vec3(0.0, (position.y + 0.5) * s * 1.75 - s * 0.1, 0.0);
  vUv = vec2(position.x * 2.0, position.y + 0.5); vLit = lit; vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FLAME_FS = NOISE + /* glsl */`
uniform vec3 uBossFire;
uniform float uTime;
varying vec2 vUv;
varying float vLit, vSeed;
void main() {
  if (vLit < 0.003) discard;
  vec2 p = vUv;
  float n1 = bnoise(vec2(p.x * 2.6 + vSeed * 7.0, p.y * 3.5 - uTime * 4.6));
  float n2 = bnoise(vec2(p.x * 5.5 - vSeed * 3.0, p.y * 7.5 - uTime * 7.8));
  float x = p.x + (n1 - 0.5) * 0.6 * p.y + (n2 - 0.5) * 0.22 * p.y;
  float w = 0.6 * pow(max(1.0 - p.y, 0.0), 0.62) * (0.72 + 0.28 * sin(p.y * 3.1416));
  float body = smoothstep(w, w * 0.3, abs(x)) * smoothstep(0.0, 0.1, p.y);
  float tip = smoothstep(1.0, 0.5 + (n2 - 0.5) * 0.35, p.y);
  float core = smoothstep(w * 0.55, 0.0, abs(x)) * smoothstep(0.72, 0.12, p.y) * smoothstep(0.0, 0.14, p.y);
  vec3 col = uBossFire * 0.8 * body * tip + mix(vec3(1.0), uBossFire, 0.45) * core * 0.7;
  gl_FragColor = vec4(col * vLit, 1.0);
}`;
const HALO_VS = /* glsl */`
attribute vec4 aHalo;            // where, how big
attribute float aAlways, aKind;  // aKind 0: a fire's halo (blue/red), 1..: an eye's (its statue's order + 1)
uniform float uBossFront, uTime, uEyes;
varying vec2 vUv;
varying float vA, vKind;
void main() {
  float lit;
  if (aKind < 0.5) lit = aAlways > 0.5 ? 1.0 : clamp((aHalo.z - uBossFront) / 1.5 + 0.5, 0.0, 1.0);
  else { float k = (aKind - 1.0) * 0.1; lit = smoothstep(k, k + 0.12, uEyes); }
  vUv = position.xy * 2.0;
  vec4 mv = viewMatrix * vec4(aHalo.xyz, 1.0);
  float flick = aKind < 0.5 ? 0.9 + 0.1 * sin(uTime * 7.0 + aHalo.x * 3.0 + aHalo.z) : 0.9 + 0.1 * sin(uTime * 9.0 + aKind);
  mv.xy += position.xy * aHalo.w * 2.0;
  mv.xyz += normalize(-mv.xyz) * min(aHalo.w * 0.6, 0.8);         // toward the eye: not cut by what it sits on
  float dist = length(mv.xyz);
  vA = lit * flick * (1.0 - smoothstep(40.0, 75.0, dist)) * smoothstep(0.8, 3.0, dist);
  vKind = aKind;
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FS = /* glsl */`
uniform vec3 uBossFire, uEyeCol;
varying vec2 vUv;
varying float vA, vKind;
void main() {
  float r = length(vUv);
  float a = exp(-r * r * 4.5) * (1.0 - smoothstep(0.8, 1.0, r));
  vec3 c = vKind < 0.5 ? uBossFire * 0.2 : uEyeCol * 0.75;
  gl_FragColor = vec4(c * a * vA, 1.0);
}`;
const EMBER_VS = /* glsl */`
attribute vec4 aFire;
attribute float aAlways, aSeed;
uniform float uBossFront, uTime, uPx;
varying float vA;
void main() {
  float lit = aAlways > 0.5 ? 1.0 : clamp((aFire.z - uBossFront) / 1.5 + 0.5, 0.0, 1.0);
  float life = fract(uTime * (0.28 + 0.22 * fract(aSeed * 7.13)) + aSeed * 13.7);
  vec3 p = aFire.xyz + vec3(sin(aSeed * 40.0 + uTime * 1.3) * 0.3 * life, (0.3 + life * 3.0) * aFire.w, cos(aSeed * 23.0 + uTime * 1.1) * 0.3 * life);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.05 + 0.07 * (1.0 - life)) * uPx / max(-mv.z, 0.5);
  vA = lit * (1.0 - life) * smoothstep(0.0, 0.08, life);
  gl_Position = projectionMatrix * mv;
}`;
const EMBER_FS = /* glsl */`
uniform vec3 uBossFire;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(d));
  gl_FragColor = vec4(mix(uBossFire, vec3(1.0), 0.45) * a * vA * 1.4, 1.0);
}`;

// ---------------------------------------------------------------- the shaft of pale light, the dust in it; the low mist
const SHAFT_VS = /* glsl */`
varying float vF, vY, vD;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec3 nw = normalize(mat3(modelMatrix) * normal);
  vF = abs(dot(nw, normalize(cameraPosition - w.xyz)));
  vY = position.y;
  vec4 mv = viewMatrix * w; vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const SHAFT_FS = /* glsl */`
uniform vec3 uSkyCol;
uniform float uStrength, uTop;
varying float vF, vY, vD;
void main() {
  float a = pow(vF, 2.2) * smoothstep(0.0, 3.0, vY) * (0.55 + 0.45 * smoothstep(uTop, 4.0, vY)) * smoothstep(1.0, 5.0, vD);
  gl_FragColor = vec4(uSkyCol * a * uStrength, 1.0);
}`;
const DUST_VS = /* glsl */`
attribute vec3 aSeed;
uniform float uTime, uPx, uTop, uR;
uniform vec3 uFoot;
varying float vA;
void main() {
  float y = fract(aSeed.y - uTime * 0.012) * uTop;
  float a = aSeed.x * 6.2832 + uTime * 0.05 * (aSeed.z - 0.5);
  float r = sqrt(aSeed.z) * uR * (0.85 + 0.15 * y / uTop);
  vec3 p = uFoot + vec3(cos(a) * r, y, sin(a) * r);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = 0.045 * uPx / max(-mv.z, 0.5);
  vA = smoothstep(0.0, 2.0, y) * (0.5 + 0.5 * sin(uTime * 1.7 + aSeed.x * 40.0)) * smoothstep(1.0, 4.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FS = /* glsl */`
uniform vec3 uSkyCol;
varying float vA;
void main() {
  float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(uSkyCol * a * vA * 0.7, 1.0);
}`;
const MIST_VS = /* glsl */`
varying vec3 vW, vL;
varying float vD;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vL = bossLightAt(w.xyz + vec3(0.0, 0.6, 0.0));
  vec4 mv = viewMatrix * w; vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const MIST_FS = NOISE + /* glsl */`
uniform vec3 uMistCol;
uniform float uTime, uMistA, uLayer;
varying vec3 vW, vL;
varying float vD;
void main() {
  vec2 q = vW.xz + vec2(uLayer * 17.0, uLayer * 9.0);
  float n = bnoise(q * 0.11 + vec2(uTime * 0.045, uTime * 0.03)) * 0.6 + bnoise(q * 0.31 - vec2(uTime * 0.07, -uTime * 0.02)) * 0.4;
  float a = smoothstep(0.38, 0.85, n) * uMistA * smoothstep(1.2, 5.0, vD) * (1.0 - smoothstep(50.0, 80.0, vD));
  gl_FragColor = vec4(uMistCol + vL * 0.22, a);
}`;

export async function createBossHall({ base = './assets/caves/boss-hall', ground = './assets/ground/', look = BOSS_LOOK, onStep = async () => {} } = {}) {
  await onStep('อ่านแผนผังห้องบอส');
  const [L, bin, blocks, slabs, rock] = await Promise.all([
    fetch(base + '.json').then((r) => r.json()),
    fetch(base + '.bin').then((r) => r.arrayBuffer()),
    loadTex(ground + 'boss-blocks-paint.webp'),           // (tools/make-boss-paint.py)
    loadTex(ground + 'boss-slabs-paint.webp'),
    loadTex(ground + 'cliff-paint.webp'),                 // the cliffs' brush-painted rock, for the carving and the statues
  ]);
  const B = L.bin, group = new THREE.Group();
  group.name = 'boss-hall';
  const light = createBossLight({ volume: { ...B.volume, data: new Uint8Array(bin, B.volume.data, B.volume.nx * B.volume.ny * B.volume.nz * 4) },
    lightScale: B.lightScale, fireScale: B.fireScale, fire: look.fireBlue });
  const U = light.uniforms;
  const time = { value: 0 };
  const runeCol = { value: v3(look.runeBlue) }, eyeCol = { value: v3(look.eye) }, skyCol = { value: v3(look.sky) };
  const fogCol = { value: new THREE.Color(look.fog) }, rimCol = { value: new THREE.Color(look.rim) };
  const fx = { front: 999, door: 0, wake: 0, eyes: 0, doorGlow: 0.35, circle: 0.3, throne: 0, flare: 0, shaft: 1 };
  const uCircle = { value: fx.circle }, uThrone = { value: 0 }, uDoorGlow = { value: fx.doorGlow }, uEyes = { value: 0 }, uFlare = { value: 0 };
  const px = { value: 600 };

  // ---- the stone
  await onStep('ก่อหินห้องบอส');
  const M = B.mesh, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, M.pos, M.vertices * 3), 3));
  g.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(bin, M.nrm, M.vertices * 4), 4), 3, 0, true));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, M.uv, M.vertices * 2), 2));
  g.setAttribute('aLight', new THREE.BufferAttribute(new Uint8Array(bin, M.light, M.vertices * 4), 4, true));
  g.setAttribute('aInfo', new THREE.BufferAttribute(new Uint8Array(bin, M.info, M.vertices * 4), 4, false));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, M.idx, M.indices), 1));
  g.computeBoundingSphere();
  const hallMat = new THREE.ShaderMaterial({
    vertexShader: HALL_VS, fragmentShader: HALL_FS,
    uniforms: {
      uLS: { value: B.lightScale }, uFS: { value: B.fireScale },
      uBlocks: { value: blocks }, uSlabs: { value: slabs }, uRock: { value: rock },
      uBossFire: U.uBossFire, uBossFront: U.uBossFront, uSprPos: U.uSprPos, uSprCol: U.uSprCol,
      uRuneCol: runeCol, uEyeCol: eyeCol, uSkyCol: skyCol, uFogCol: fogCol, uRimCol: rimCol,
      uMistCol: { value: new THREE.Color(look.mist) },
      uFog: { value: new THREE.Vector3(look.fogDensity, look.mistHeight, 0.35) },
      uTime: time, uCircle, uThrone, uDoorGlow, uEyes,
      uC: { value: new THREE.Vector2(L.circle.c[0], L.circle.c[1]) },
    },
  });
  hallMat.userData.noCave = true;
  const stone = new THREE.Mesh(g, hallMat);
  stone.name = 'boss-stone';
  group.add(stone);

  // ---- the door's two leaves
  await onStep('แขวนประตู');
  const D = L.door;
  const doorMat = new THREE.ShaderMaterial({
    vertexShader: light.chunk + DOOR_VS, fragmentShader: DOOR_FS,
    uniforms: { ...U, uRock: { value: rock }, uRuneCol: runeCol, uFogCol: fogCol, uRimCol: rimCol, uDoorGlow, uFogD: { value: look.fogDensity }, uTime: time },
  });
  doorMat.side = THREE.DoubleSide;
  doorMat.userData.noCave = true;
  const leaves = [1, -1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * D.hw, 0, D.z - D.thick / 2);
    const leaf = new THREE.Mesh(doorGeometry(s), doorMat);
    leaf.name = 'boss-door-leaf';
    pivot.add(leaf);
    group.add(pivot);
    return { pivot, s };
  });
  // shut, they stand across the door's gap: she stops at them
  const doorColliders = [];
  for (let x = -D.hw + 0.4; x <= D.hw - 0.39; x += 0.8) doorColliders.push([x, D.z + 0.35, 0.62]);

  // ---- the fires: flames, halos round them (and round the statues' eyes), embers
  await onStep('จุดไฟ');
  const fires = L.fires, nf = fires.length;
  const plane = new THREE.PlaneGeometry(1, 1);
  const flameGeo = new THREE.InstancedBufferGeometry();
  flameGeo.index = plane.index; flameGeo.setAttribute('position', plane.getAttribute('position'));
  const aFire = new Float32Array(nf * 4), aAlways = new Float32Array(nf), aSeed = new Float32Array(nf);
  fires.forEach((f, i) => { aFire.set([f.x, f.y - 0.05, f.z, f.size * 0.55], i * 4); aAlways[i] = f.kind === 'door' ? 1 : 0; aSeed[i] = (i * 0.618) % 1; });
  flameGeo.setAttribute('aFire', new THREE.InstancedBufferAttribute(aFire, 4));
  flameGeo.setAttribute('aAlways', new THREE.InstancedBufferAttribute(aAlways, 1));
  flameGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  flameGeo.instanceCount = nf;
  const flameMat = new THREE.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uBossFire: U.uBossFire, uBossFront: U.uBossFront, uTime: time, uFlare } });
  flameMat.userData.noCave = true;
  const flames = new THREE.Mesh(flameGeo, flameMat);
  flames.frustumCulled = false; flames.renderOrder = 5; flames.name = 'boss-flames';
  group.add(flames);
  // halos: one round each fire, one round each eye
  const eyes = [];
  for (const st of L.statues) for (const e of st.eyes) eyes.push({ p: e, order: st.order });
  const nh = nf + eyes.length;
  const haloGeo = new THREE.InstancedBufferGeometry();
  haloGeo.index = plane.index; haloGeo.setAttribute('position', plane.getAttribute('position'));
  const aHalo = new Float32Array(nh * 4), hAlways = new Float32Array(nh), hKind = new Float32Array(nh);
  fires.forEach((f, i) => { aHalo.set([f.x, f.y + f.size * 0.35, f.z, f.size * 1.05], i * 4); hAlways[i] = f.kind === 'door' ? 1 : 0; });
  eyes.forEach((e, k) => { aHalo.set([e.p[0], e.p[1], e.p[2], 0.3], (nf + k) * 4); hKind[nf + k] = e.order + 1; });
  haloGeo.setAttribute('aHalo', new THREE.InstancedBufferAttribute(aHalo, 4));
  haloGeo.setAttribute('aAlways', new THREE.InstancedBufferAttribute(hAlways, 1));
  haloGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(hKind, 1));
  haloGeo.instanceCount = nh;
  const haloMat = new THREE.ShaderMaterial({ vertexShader: HALO_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uBossFire: U.uBossFire, uBossFront: U.uBossFront, uEyeCol: eyeCol, uEyes, uTime: time } });
  haloMat.userData.noCave = true;
  const halos = new THREE.Mesh(haloGeo, haloMat);
  halos.frustumCulled = false; halos.renderOrder = 6; halos.name = 'boss-halos';
  group.add(halos);
  // embers: ten from each fire
  const NE = 10, ne = nf * NE;
  const emGeo = new THREE.BufferGeometry();
  const eF = new Float32Array(ne * 4), eA = new Float32Array(ne), eS = new Float32Array(ne), eP = new Float32Array(ne * 3);
  fires.forEach((f, i) => { for (let k = 0; k < NE; k++) { const j = i * NE + k; eF.set([f.x, f.y, f.z, f.size], j * 4); eA[j] = f.kind === 'door' ? 1 : 0; eS[j] = ((j * 0.754877) % 1); eP.set([f.x, f.y, f.z], j * 3); } });
  emGeo.setAttribute('position', new THREE.BufferAttribute(eP, 3));
  emGeo.setAttribute('aFire', new THREE.BufferAttribute(eF, 4));
  emGeo.setAttribute('aAlways', new THREE.BufferAttribute(eA, 1));
  emGeo.setAttribute('aSeed', new THREE.BufferAttribute(eS, 1));
  const emMat = new THREE.ShaderMaterial({ vertexShader: EMBER_VS, fragmentShader: EMBER_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uBossFire: U.uBossFire, uBossFront: U.uBossFront, uTime: time, uPx: px } });
  emMat.userData.noCave = true;
  const embers = new THREE.Points(emGeo, emMat);
  embers.frustumCulled = false; embers.renderOrder = 6; embers.name = 'boss-embers';
  group.add(embers);

  // ---- the shaft of pale light down the oculus, the dust in it
  const O = L.oculus, top = O.y;
  const shaftGeo = new THREE.CylinderGeometry(O.r * 0.92, O.r * 1.18, top, 40, 1, true);
  shaftGeo.translate(0, top / 2, 0);
  const shaftMat = new THREE.ShaderMaterial({ vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uSkyCol: skyCol, uStrength: { value: 0.3 }, uTop: { value: top } } });
  shaftMat.userData.noCave = true;
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.position.set(O.c[0], 0, O.c[1]); shaft.renderOrder = 4; shaft.name = 'boss-shaft';
  group.add(shaft);
  const ND = 220, dS = new Float32Array(ND * 3), dP = new Float32Array(ND * 3);
  for (let i = 0; i < ND; i++) dS.set([Math.random(), Math.random(), Math.random()], i * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dP, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dS, 3));
  const dustMat = new THREE.ShaderMaterial({ vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSkyCol: skyCol, uTime: time, uPx: px, uTop: { value: top * 0.8 }, uR: { value: O.r * 1.05 }, uFoot: { value: new THREE.Vector3(O.c[0], 0, O.c[1]) } } });
  dustMat.userData.noCave = true;
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false; dust.renderOrder = 5; dust.name = 'boss-dust';
  group.add(dust);

  // ---- a low mist over the floor, lit by whatever burns where it hangs (two thin layers)
  const mistMats = [];
  for (const [y, a, k] of [[0.35, 0.32, 0], [0.95, 0.22, 1]]) {
    const mg = new THREE.PlaneGeometry(46, 82, 23, 41);
    mg.rotateX(-Math.PI / 2); mg.translate(0, y, -21);
    const mm = new THREE.ShaderMaterial({ vertexShader: light.chunk + MIST_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false,
      uniforms: { ...U, uMistCol: { value: new THREE.Color('#1d1630') }, uTime: time, uMistA: { value: a }, uLayer: { value: k } } });
    mm.userData.noCave = true;
    mistMats.push(mm);
    const mist = new THREE.Mesh(mg, mm);
    mist.renderOrder = 3; mist.name = 'boss-mist';
    group.add(mist);
  }

  // ---- her floor and roof (cave-level.js), what she walks round
  const F = B.floor;
  const floorMap = {
    nx: F.nx, nz: F.nz, x0: F.x0, z0: F.z0, cell: F.cell,
    fl: new Int16Array(bin, F.floor, F.nx * F.nz), ce: new Int16Array(bin, F.ceil, F.nx * F.nz), paint: new Uint8Array(bin, F.paint, F.nx * F.nz * 4),
  };
  const colliders = (L.stones || []).map((s) => s.slice());

  const blue = v3(look.fireBlue), red = v3(look.fireRed), rBlue = v3(look.runeBlue), rRed = v3(look.runeRed);
  let clock = 0;
  const inShaft = new THREE.Vector3(), db = new THREE.Vector2();
  return {
    group, light, layout: L, stone, floorMap, colliders, doorColliders, trunks: [], crowns: [], look, fx,
    update(dt, camera, renderer) {
      clock += dt;
      time.value = clock;
      if (renderer) { renderer.getDrawingBufferSize(db); px.value = db.y * camera.projectionMatrix.elements[5] * 0.5; }
      U.uBossFront.value = fx.front;
      const w = THREE.MathUtils.clamp(fx.wake, 0, 1);
      U.uBossFire.value.copy(blue).lerp(red, w);
      runeCol.value.copy(rBlue).lerp(rRed, w);
      uCircle.value = fx.circle; uThrone.value = fx.throne; uDoorGlow.value = fx.doorGlow; uEyes.value = fx.eyes; uFlare.value = fx.flare;
      // the door's leaves on their hinges (they swing in, toward the nave)
      const open = THREE.MathUtils.clamp(fx.door, 0, 1) * Math.PI / 2 * 0.94;
      for (const l of leaves) l.pivot.rotation.y = -l.s * open;
      // the camera inside the pale shaft: its light let down (or the whole view would be washed in it)
      inShaft.set(camera.position.x - O.c[0], 0, camera.position.z - O.c[1]);
      const r = inShaft.length();
      shaftMat.uniforms.uStrength.value = 0.3 * fx.shaft * (1 - 0.8 * (1 - THREE.MathUtils.smoothstep(r, O.r * 0.8, O.r * 1.4)));
    },
  };
}
