// water-droplets.js
// What the water throws into the air where something hits it: drops, and for a real splash a crown and a jet.
// The level decides WHERE and HOW HARD (from the same touch that pokes the wave simulation); this file only draws.
//
//   drops : one pooled Points draw. Each drop flies a ballistic arc worked out in the vertex shader and disappears when it
//           falls back to the surface. A footstep throws nothing but two or three of these.
//   crown : the thin sheet of water a splash throws up and outwards. It is made of the river's own water: clear, tinted
//           turquoise, with the sky on its rim and a glint of sun, and white only where water really is white - the churned
//           foot and the thick lip. The lip is not cut into points: it swells into rounded fingers with a bead at the tip
//           (the way a real sheet of water breaks up), and the beads are where the drops fly off from.
//   jet   : the column that rises out of the middle a moment later, with a bulb at its tip that pinches off as one or two
//           fat drops while the column sinks back.
// Crown and jet are two instanced draws, children of the drops, so everything shows and hides together.
//
//   const drops = createWaterDroplets({ time: shared.uTime });     // time: a { value } uniform that counts seconds
//   group.add(drops.points);
//   drops.emit(x, waterLevel, z, power, count);                    // power 1 = a full splash, 0.15 = a footstep
//   drops.update(renderer);                                        // once a frame
import * as THREE from 'three';
import { WATER_TUNE, WATER_LOOK } from './stylized-water.js';

const GRAVITY = 7;        // m/s2: a little floatier than real water, so the arc can be read
const FINGERS = 11;       // fingers round the lip of a crown
// the clock of one splash, shared by the shaders (which draw it) and emit() (which times the drops to it); s = size in metres
const CROWN_LIFE = s => 0.6 + 0.25 * s;                 // seconds the crown lasts
const JET_START = s => 0.3 * CROWN_LIFE(s);             // the jet comes up as the crown starts to fall
const JET_LIFE = s => 0.6 + 0.35 * s;
const JET_HEIGHT = 0.95;                                // x size
// the kit's colours are raw vectors (no colour-space conversion), the same numbers the water surface uses
const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

// how a piece of thrown water is lit: clear body, sky on the rim, a glint of sun, white where it is foam
const WATER_GLSL = /* glsl */`
  uniform vec3 uShallow, uMid, uSky, uWhite, uSun;
  uniform float uToon;
  float hash1(float n) { return fract(sin(n * 127.1 + 3.7) * 43758.5453); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // value noise that joins up round the ring (period px along x)
  float wnoise(vec2 p, float px) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float x0 = mod(i.x, px), x1 = mod(i.x + 1.0, px);
    return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), f.x), mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), f.x), f.y);
  }
  // thick: 0 a film .. 1 a solid body of water.  white: 0 clear .. 1 foam.  see: how see-through the clear part is (0..1)
  // shine: strength of the window of light
  vec4 thrownWater(vec3 N, vec3 V, float thick, float white, float see, float shine, bool far) {
    if (dot(N, V) < 0.0) N = -N;                                    // a sheet has two faces: light the one we look at
    float facing = dot(N, V), rimLight = pow(1.0 - facing, 2.5);
    vec3 body = mix(uShallow, uMid, thick);
    body *= 0.9 + 0.22 * max(dot(N, uSun), 0.0);
    if (far) body = mix(body, uMid, 0.3);                           // the far wall, seen through the near one
    vec3 col = mix(body, uSky, rimLight * 0.6);
    float alpha = mix(1.0 - see, 0.9, rimLight);
    col = mix(col, uWhite, white);
    alpha = mix(alpha, 0.97, white);
    // the sun's own glint, and the one bright window of light every wet round thing shows whichever way it is turned
    float spec = pow(max(dot(normalize(uSun + V), N), 0.0), 40.0);
    vec3 Nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
    spec = max(spec, smoothstep(0.945, 0.985, dot(Nv, vec3(-0.5025, 0.5025, 0.7035))) * shine);
    col += uWhite * spec * 0.7;
    alpha = min(1.0, alpha + spec * 0.6);
    // anime water: two flat colours and a white edge, nothing seen through it
    if (uToon > 0.5) { col = mix(mix(uShallow, uMid, far ? 0.75 : 0.3), uWhite, step(0.5, white)); alpha = 1.0; }
    return vec4(col, alpha);
  }`;

export function createWaterDroplets({ time, capacity = 160, look = WATER_LOOK, sun = [-0.4, 0.9, 0.5] } = {}) {
  const waterUniforms = () => ({
    uTime: time, uToon: WATER_TUNE.anime,
    uShallow: { value: rgb(look.shallow) }, uMid: { value: rgb(look.mid) }, uSky: { value: rgb(look.sky) }, uWhite: { value: rgb(look.foam) },
    uSun: { value: new THREE.Vector3(...sun).normalize() },
  });

  // ------------------------------------------------------------------ drops
  const start = new Float32Array(capacity * 3), vel = new Float32Array(capacity * 3), par = new Float32Array(capacity * 3);
  for (let i = 0; i < capacity; i++) par[i * 3] = -100;                 // born long ago: not drawn
  const geo = new THREE.BufferGeometry();
  const aStart = new THREE.BufferAttribute(start, 3), aVel = new THREE.BufferAttribute(vel, 3), aPar = new THREE.BufferAttribute(par, 3);
  for (const a of [aStart, aVel, aPar]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aStart);
  geo.setAttribute('aVel', aVel);
  geo.setAttribute('aPar', aPar);                                       // x: time of birth, y: size in metres, z: seconds in the air
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...waterUniforms(), uH: { value: 500 }, uAspect: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec3 aVel, aPar;
      uniform float uTime, uH, uAspect;
      varying float vFade, vStretch;
      varying vec2 vDir;
      void main() {
        float t = uTime - aPar.x, flight = aPar.z;
        vec3 p = position + aVel * t;
        p.y -= ${(GRAVITY / 2).toFixed(2)} * t * t;
        vec3 v = aVel; v.y -= ${GRAVITY.toFixed(1)} * t;                     // how it is flying right now
        float k = clamp(t / max(flight, 0.01), 0.0, 1.0);
        vFade = smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.88, 1.0, k));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // the same drop a moment later, on screen: the direction to stretch it in
        vec4 ahead = projectionMatrix * modelViewMatrix * vec4(p + v * 0.02, 1.0);
        vec2 dir = (ahead.xy / ahead.w - gl_Position.xy / gl_Position.w) * vec2(uAspect, 1.0);
        float len = length(dir);
        vDir = len > 1e-5 ? dir / len : vec2(0.0, 1.0);
        vStretch = clamp(length(v) * 0.3, 0.0, 1.1);                       // fast = a streak, slow = a bead
        float size = aPar.y * (1.0 - 0.25 * k) * (1.0 + vStretch);
        gl_PointSize = size * projectionMatrix[1][1] * uH * 0.5 / max(-mv.z, 0.1);
        if (t < 0.0 || t > flight) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uShallow, uMid, uSky, uWhite;
      uniform float uToon;
      varying float vFade, vStretch;
      varying vec2 vDir;
      void main() {
        vec2 c = vec2(gl_PointCoord.x - 0.5, 0.5 - gl_PointCoord.y) * 2.0;
        float along = dot(c, vDir), across = dot(c, vec2(-vDir.y, vDir.x)) * (1.0 + vStretch);
        // a little fatter at the front than at the tail
        across *= 1.0 + 0.35 * vStretch * smoothstep(0.2, -1.0, along);
        float d = along * along + across * across;
        if (d > 1.0) discard;
        // a bead of the river's own water: clear in the middle, the colour gathering towards its edge, the sky on its upper
        // side and one small bright window of light
        vec3 col = mix(mix(uShallow, uWhite, 0.35), mix(uShallow, uMid, 0.3), smoothstep(0.1, 1.0, d));
        col = mix(col, uSky, smoothstep(-0.2, 0.9, c.y) * 0.6);
        float shine = 1.0 - smoothstep(0.0, 0.16, length(vec2(along, across) - vec2(0.2, 0.0)) - 0.12 + 0.3 * smoothstep(0.3, -0.3, c.y));
        col = mix(col, uWhite, shine * 0.9);
        float a = mix(0.45, 0.85, max(smoothstep(0.2, 1.0, d), shine)) * smoothstep(1.0, 0.8, d) * vFade;
        // anime water: a flat white drop with a drawn edge
        if (uToon > 0.5) { col = uWhite; a = step(d, 0.8) * step(0.3, vFade); }
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'waterDroplets';
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;

  // ------------------------------------------------------------------ crown and jet
  const SPLASHES = 12;
  const splash = new Float32Array(SPLASHES * 4), splashSize = new Float32Array(SPLASHES);
  for (let i = 0; i < SPLASHES; i++) splash[i * 4 + 3] = -100;
  const aSplash = new THREE.InstancedBufferAttribute(splash, 4), aSplashSize = new THREE.InstancedBufferAttribute(splashSize, 1);
  aSplash.setUsage(THREE.DynamicDrawUsage); aSplashSize.setUsage(THREE.DynamicDrawUsage);
  const instanced = src => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = src.index;
    g.setAttribute('position', src.attributes.position);
    g.setAttribute('uv', src.attributes.uv);
    g.setAttribute('aSplash', aSplash);                                 // x, y, z, time of birth
    g.setAttribute('aSize', aSplashSize);                               // metres
    g.instanceCount = SPLASHES;
    return g;
  };
  const tube = new THREE.CylinderGeometry(1, 1, 1, 66, 12, true), tube2 = new THREE.CylinderGeometry(1, 1, 1, 20, 26, true);
  const cgeo = instanced(tube), jgeo = instanced(tube2);
  // both shapes are written as a function of (angle round the ring, height along the wall): the vertex shader asks it three
  // times, for the point itself and for two neighbours, and so knows which way the surface faces without any stored normals
  const SURFACE = at => /* glsl */`
        float a = uv.x, v = position.y + 0.5;                             // v: 0 at the water, 1 at the top
        vec3 p = ${at}(a, v), da = ${at}(a + 0.004, v) - p, dv = ${at}(a, v + 0.02) - p;
        vec3 n = cross(da, dv);
        float nl = length(n);
        vN = normalize(mat3(modelMatrix) * (nl > 1e-9 ? n / nl : vec3(0.0, 1.0, 0.0)));
        vec4 wp = modelMatrix * vec4(aSplash.xyz + p, 1.0);
        vWP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;`;
  const cmat = new THREE.ShaderMaterial({
    uniforms: waterUniforms(),
    vertexShader: /* glsl */`
      attribute vec4 aSplash;
      attribute float aSize;
      uniform float uTime;
      varying vec3 vWP, vN;
      varying vec4 vQ;            // angle 0..1, height 0..1, age 0..1, a number of this splash's own
      varying vec3 vM;            // metres from finger to finger at this height, metres from foot to top, size
      float S, K, SEED;
      // the crown: a sheet thrown up and outwards. Its foot keeps spreading over the water; the wall starts as a bowl and opens
      // into a trumpet; it goes up fast and comes down slower; and it is thrown harder and a touch later on one side than on
      // the other, so the lip is never level.
      vec3 crownAt(float a, float v) {
        float ang = a * 6.2831853;
        float push = 0.8 + 0.2 * (0.6 * sin(ang * 2.0 + SEED) + 0.4 * sin(ang * 3.0 - SEED * 1.7));
        float late = 0.04 * (0.5 + 0.5 * sin(ang + SEED * 2.3));
        float s = clamp((K - late) / (1.0 - late), 0.0, 1.0);
        float h = S * 0.58 * push * sin(3.14159265 * pow(s, 0.72));
        float foot = S * (0.1 + 0.26 * (1.0 - (1.0 - K) * (1.0 - K)));
        float bowl = mix(sin(min(v, 1.0) * 1.5707963), v * v, smoothstep(0.1, 0.8, K));
        float r = foot + S * (0.1 + 0.24 * K) * push * bowl;
        r *= 1.0 + 0.05 * v * sin(ang * 4.0 + SEED - K * 7.0);              // whole numbers of waves: they meet at the seam
        return vec3(sin(ang) * r, v * h - 0.02 * S, cos(ang) * r);
      }
      void main() {
        S = aSize;
        float k = (uTime - aSplash.w) / (0.6 + 0.25 * S);                   // CROWN_LIFE
        K = clamp(k, 0.0, 1.0);
        SEED = fract(aSplash.x * 0.37 + aSplash.z * 0.71) * 6.2831853;
        ${SURFACE('crownAt')}
        vQ = vec4(a, v, K, SEED);
        vM = vec3(6.2831853 * length(p.xz) / ${FINGERS.toFixed(1)}, length(crownAt(a, 1.0) - crownAt(a, 0.0)), S);
        if (k < 0.0 || k > 1.0 || S < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${WATER_GLSL}
      varying vec3 vWP, vN;
      varying vec4 vQ;
      varying vec3 vM;
      // two shapes run together the way water does: with a rounded web between them instead of a corner
      float melt(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
      void main() {
        float a = vQ.x, v = vQ.y, k = vQ.z, seed = vQ.w, S = vM.z, ang = a * 6.2831853;
        // ---- the lip, drawn in metres so it keeps its shape however far the wall has opened. The sheet ends at a wavy line;
        // out of it grow fingers, each a stem with a bead at the tip, and late on the sheet draws back down into its foot.
        float settle = smoothstep(0.5, 1.0, k);
        float lipV = mix(0.6, 0.3, settle) + 0.05 * sin(ang * 3.0 + seed * 3.0) + 0.03 * sin(ang * 7.0 - seed);
        float cell = a * ${FINGERS.toFixed(1)}, id = mod(floor(cell), ${FINGERS.toFixed(1)}) + floor(seed * 9.0);
        float r1 = hash1(id), r2 = hash1(id * 1.9 + 5.3);
        vec2 q = vec2((fract(cell) - 0.5 - (r1 - 0.5) * 0.36) * vM.x, (v - lipV) * vM.y);
        float len = step(0.2, r2) * S * (0.05 + 0.2 * r2 * r2) * smoothstep(0.03, 0.4, k) * (1.0 - 0.75 * settle);
        float w = min(S * 0.03 * (1.0 - 0.4 * k), vM.x * 0.16);
        len = max(min(len, (1.0 - lipV) * vM.y - w * 2.6), 0.0);
        w *= smoothstep(0.0, S * 0.04, len);                                // no finger: nothing sticks out at all
        float stem = length(vec2(q.x, q.y - clamp(q.y, -0.1, len))) - w;
        float bead = length(q - vec2(0.0, len)) - w * (1.2 + 0.7 * r1);       // no two beads the same size
        float d = melt(q.y, min(stem, bead), S * 0.05);                     // < 0 inside the water
        float aa = fwidth(d) * 1.2 + 1e-5;
        float inside = 1.0 - smoothstep(-aa, aa, d);
        if (inside < 0.01) discard;
        // ---- white water: the thick rim all along the lip and round the beads, the churned foot, a few streaks torn up from it
        float churn = wnoise(vec2(a * 22.0 + seed, v * 3.0 - k * 2.5), 22.0);
        float rimW = S * (0.034 + 0.02 * churn);
        float rim = smoothstep(-rimW, 0.0, d);
        rim = rim * rim * (0.75 + 0.25 * churn);                            // foam gathering towards the edge, not a line drawn round it
        float foot = 1.0 - smoothstep(0.02, 0.16 + 0.3 * churn, v);
        float streak = smoothstep(0.62, 0.8, wnoise(vec2(a * 40.0 + seed, v * 1.3 - k * 1.5), 40.0)) * (1.0 - smoothstep(0.3, 0.7, v));
        float white = max(rim, max(foot, streak * 0.7));
        // ---- the sheet itself: thicker and bluer near the foot, a film at the lip, thinner still as it spreads
        // and where the water gathers behind the rim it is deeper in colour: the line that lets the crown be read against white
        // foam as well as against blue water
        float gather = smoothstep(-rimW * 3.0, -rimW * 1.2, d) * (1.0 - rim);
        float see = mix(0.4, 0.75, smoothstep(0.2, 0.9, k)) * (1.0 - 0.6 * gather);
        vec4 c = thrownWater(normalize(vN), normalize(cameraPosition - vWP), 0.25 + 0.5 * (1.0 - v) + 0.5 * gather, white, see, 0.6, !gl_FrontFacing);
        c.a *= inside * smoothstep(0.0, 0.04, k) * (1.0 - smoothstep(0.68, 1.0, k));
        gl_FragColor = c;
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const jmat = new THREE.ShaderMaterial({
    uniforms: waterUniforms(),
    vertexShader: /* glsl */`
      attribute vec4 aSplash;
      attribute float aSize;
      uniform float uTime;
      varying vec3 vWP, vN;
      varying vec2 vQ;            // height 0..1, age 0..1
      float S, K, SEED;
      // the jet: a skirt where it leaves the water, a stem, a bulb at the tip. As it sinks back the stem pinches under the bulb.
      float meltMax(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return max(a, b) + h * h * k * 0.25; }
      vec3 jetAt(float a, float t) {
        float ang = a * 6.2831853;
        float v = 1.0 - pow(1.0 - min(t, 1.0), 1.7);                        // the rings of the mesh crowd towards the tip
        float rise = sin(3.14159265 * pow(K, 0.8));
        float h = S * ${JET_HEIGHT.toFixed(2)} * rise, y = v * h;
        float rb = min(0.052 * S, 0.3 * h) * (1.0 - 0.6 * smoothstep(0.36, 0.56, K));      // the bulb: a ball of water sitting on the tip,
        float yc = h - rb;                                                  // most of which leaves as drops when the jet stops rising
        float bulb = sqrt(max(rb * rb - (y - yc) * (y - yc), 0.0));
        float pinch = 1.0 - 0.7 * smoothstep(0.45, 0.9, K) * exp(-pow((y - yc + rb * 1.7) / (rb * 1.6), 2.0));
        float stem = S * 0.04 * (1.0 - 0.45 * v) * pinch * (1.0 - smoothstep(yc, yc + rb * 0.6, y));
        float skirt = S * 0.17 * exp(-v * 8.0) * (0.35 + 0.65 * rise);
        float r = (skirt + meltMax(stem, bulb, 0.012 * S + 1e-5)) * (0.5 + 0.5 * smoothstep(0.0, 0.25, K));
        r *= step(t, 0.9999);                                               // closed at the very top
        vec3 p = vec3(sin(ang) * r, y - 0.02 * S, cos(ang) * r);
        float bend = v * v * S * rise;                                      // it never stands quite straight; the foot stays planted
        p.x += bend * (sin(v * 3.0 - K * 4.0 + SEED) * 0.05 + cos(SEED) * K * 0.1);
        p.z += bend * (cos(v * 2.6 - K * 3.4 + SEED) * 0.04 + sin(SEED) * K * 0.1);
        return p;
      }
      void main() {
        S = aSize;
        float t = uTime - aSplash.w, t0 = 0.3 * (0.6 + 0.25 * S);           // JET_START
        float k = (t - t0) / (0.6 + 0.35 * S);                              // JET_LIFE
        K = clamp(k, 0.0, 1.0);
        SEED = fract(aSplash.x * 0.37 + aSplash.z * 0.71) * 6.2831853;
        ${SURFACE('jetAt')}
        vQ = vec2(v, K);
        if (k < 0.0 || k > 1.0 || S < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${WATER_GLSL}
      varying vec3 vWP, vN;
      varying vec2 vQ;
      void main() {
        float v = vQ.x, k = vQ.y;
        float white = 1.0 - smoothstep(0.0, 0.1, v);                        // foam only where it stands in the churned water
        vec4 c = thrownWater(normalize(vN), normalize(cameraPosition - vWP), 0.2 + 0.45 * (1.0 - v), white, 0.5, smoothstep(0.15, 0.5, v), false);
        c.a *= smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.88, 1.0, k));
        gl_FragColor = c;
      }`,
    transparent: true, depthWrite: false,
  });
  const crowns = new THREE.Mesh(cgeo, cmat), jets = new THREE.Mesh(jgeo, jmat);
  crowns.name = 'waterCrowns'; jets.name = 'waterJets';
  crowns.frustumCulled = jets.frustumCulled = false;
  crowns.renderOrder = 3; jets.renderOrder = 3;
  points.add(crowns, jets);

  let cursor = 0, last = -100, splashCursor = 0;
  const drop = (x, y, z, vx, vy, vz, born, size) => {
    const o = cursor * 3, h = Math.max(0, y - drop.level);
    start[o] = x; start[o + 1] = y; start[o + 2] = z;
    vel[o] = vx; vel[o + 1] = vy; vel[o + 2] = vz;
    par[o] = born; par[o + 1] = size;
    par[o + 2] = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * h)) / GRAVITY;   // until it is back at the water
    cursor = (cursor + 1) % capacity;
  };
  return {
    points,
    emit(x, y, z, power = 1, count = 8) {
      const now = time.value, s = Math.sqrt(Math.max(0.02, power)), big = power > 0.4;
      const S = 0.9 * s;                                                    // the crown: knee-high for a full splash
      drop.level = y;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const fat = Math.random() < 0.25, size = (fat ? 0.055 + 0.025 * Math.random() : 0.026 + 0.022 * Math.random()) * (0.6 + 0.4 * s);
        if (!big) {
          // a footstep: two or three drops flicked off a small ring, nothing else
          const ring = (0.06 + 0.2 * Math.random()) * s, out = (0.35 + 0.9 * Math.random()) * s;
          drop(x + ca * ring, y + 0.02, z + sa * ring, ca * out, (1.5 + 2.0 * Math.random() * Math.random()) * s, sa * out, now + Math.random() * 0.05, size * 1.25);
        } else if (i < 2) {
          // the bulb at the tip of the jet lets go as it stops rising: a fat drop or two carry on up, then follow it down
          const t = JET_START(S) + JET_LIFE(S) * (0.36 + 0.1 * i), d = 0.12 * Math.random();
          drop(x + ca * 0.02, y + S * JET_HEIGHT * (0.92 - 0.1 * i), z + sa * 0.02, ca * d, 0.5 + 0.7 * Math.random(), sa * d, now + t, (0.08 + 0.02 * Math.random()) * (0.6 + 0.4 * s));
        } else {
          // the rest fly off the beads on the crown's lip: the later they leave, the higher and further out the lip already is
          const u = Math.random(), ring = S * (0.26 + 0.2 * u), out = (0.5 + 0.9 * Math.random()) * s;
          drop(x + ca * ring, y + S * (0.26 + 0.22 * u), z + sa * ring, ca * out, (0.9 + 1.7 * Math.random() * Math.random()) * s, sa * out, now + 0.06 + 0.18 * u, size);
        }
      }
      aStart.needsUpdate = aVel.needsUpdate = aPar.needsUpdate = true;
      if (big) {
        splash.set([x, y, z, now], splashCursor * 4);
        splashSize[splashCursor] = S;
        splashCursor = (splashCursor + 1) % SPLASHES;
        aSplash.needsUpdate = aSplashSize.needsUpdate = true;
      }
      last = now;
      points.visible = true;
    },
    update(renderer) {
      if (renderer) {
        const el = renderer.domElement;
        mat.uniforms.uH.value = el.height;
        mat.uniforms.uAspect.value = el.width / Math.max(1, el.height);
      }
      if (points.visible && time.value - last > 2.4) points.visible = false;        // nothing in the air: no draw at all
    },
    dispose() { geo.dispose(); mat.dispose(); cgeo.dispose(); jgeo.dispose(); tube.dispose(); tube2.dispose(); cmat.dispose(); jmat.dispose(); },
  };
}
