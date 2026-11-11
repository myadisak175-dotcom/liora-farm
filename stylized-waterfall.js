/* ==========================================================================
   stylized-waterfall.js  —  a waterfall made of the same water as stylized-water.js

   One job: draw a falling body of water, the churn where it lands, the spray and the mist.
   It borrows the river's tools so the two read as one water:
     - the river's see-through picture (optics): the cliff behind the fall is seen bent through it
     - the river's palette (WATER_LOOK) and its painted foam texture, stretched into falling white streaks
     - a rounded cross-section, so light, rim brightening and refraction change across the fall (not a flat card)

     const fall = createWaterfall({ x, z, top, bottom, width, optics, foamTexture, cells });      // cells: the anime cell texture, for the anime churn
     scene.add(fall.group);
     every frame: fall.update()

   The water leaves the lip at (x, top, z) and curves forward (+z) as it falls, landing near z + forward.
   Mobile-safe shaders: no uniform arrays, no loops.
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';
import { WATER_LOOK, WATER_TUNE } from './stylized-water.js';

const { NOISE, rgb, shared } = _internal;

const BLANK = (c) => { const t = new THREE.DataTexture(new Uint8Array(c), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; return t; };

// the same seam-free sampling of the painted foam artwork as the river's shore foam
const PAINTED = /* glsl */`
float paintedFoam(vec2 uv) {
  vec2 a = fract(uv), b = fract(uv + vec2(0.47, 0.53));
  vec2 ea = smoothstep(vec2(0.0), vec2(0.08), min(a, 1.0 - a));
  vec2 eb = smoothstep(vec2(0.0), vec2(0.08), min(b, 1.0 - b));
  return max(texture2D(uFoamMap, a).r * ea.x * ea.y, texture2D(uFoamMap, b).r * eb.x * eb.y * 0.55);
}`;

function commonUniforms({ optics, foamTexture, sun }) {
  return {
    uTime: shared.uTime, uToon: WATER_TUNE.anime,
    uThrough: optics ? optics.uniforms.uThrough : { value: BLANK([200, 190, 160, 255]) },
    uInvRes: optics ? optics.uniforms.uInvRes : { value: new THREE.Vector2(1, 1) },
    uOptics: { value: optics ? 1 : 0 },
    uFoamMap: { value: foamTexture || BLANK([0, 0, 0, 255]) },
    uFoamOn: { value: foamTexture ? 1 : 0 },
    uShallow: { value: rgb(WATER_LOOK.shallow) }, uMid: { value: rgb(WATER_LOOK.mid) }, uDeep: { value: rgb(WATER_LOOK.deep) },
    uSky: { value: rgb(WATER_LOOK.sky) }, uWhite: { value: rgb('#f6fdff') },
    uSun: { value: new THREE.Vector3(...sun).normalize() },
    uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
  };
}

// ---------------------------------------------------------------- the falling water
function fallMaterial(common, { layer = 0, speed = 1, white = 0, opacity = 1, width = 4.6, height = 14 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...common, uLayer: { value: layer }, uSpeedF: { value: speed }, uWhiteAmt: { value: white }, uOpacity: { value: opacity }, uSize: { value: new THREE.Vector2(width, height) } },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec2 vUv;
      varying vec3 vWP, vN;
      varying float vHaze;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform sampler2D uThrough, uFoamMap;
      uniform vec2 uInvRes, uSize;
      uniform float uTime, uOptics, uFoamOn, uLayer, uSpeedF, uWhiteAmt, uOpacity, uToon;
      uniform vec3 uShallow, uMid, uDeep, uSky, uWhite, uSun, uHaze;
      varying vec2 vUv;          // x: across 0..1, y: 0 at the lip .. 1 at the foot
      varying vec3 vWP, vN;
      varying float vHaze;
      ${PAINTED}
      void main() {
        float x = vUv.x, y = vUv.y, t = uTime * uSpeedF;
        float edge = abs(x - 0.5) * 2.0;
        // ragged sides that wander as the water falls
        float wob = (noise2(vec2(y * 4.0 - t * 1.6, uLayer * 5.0 + 1.0)) - 0.5) * 0.22 + (noise2(vec2(y * 13.0 - t * 3.0, uLayer * 3.0)) - 0.5) * 0.08;
        float side = 1.0 - smoothstep(0.8 + wob, 0.97 + wob, edge);
        if (side < 0.01) discard;
        // the water speeds up as it falls: everything is stretched more and more towards the foot
        float fallP = y + y * y * 1.4;
        vec2 fp = vec2(x * uSize.x, fallP * uSize.y);
        float s1 = noise2(vec2(fp.x * 1.7 + uLayer * 3.1, fp.y * 0.22 - t * 2.4));
        float s2 = noise2(vec2(fp.x * 4.3 + 7.0, fp.y * 0.45 - t * 3.8));
        vec3 N = normalize(vN + vec3((s1 - 0.5) * 0.5, 0.0, (s2 - 0.5) * 0.3));
        vec3 V = normalize(cameraPosition - vWP);
        float facing = abs(dot(N, V));
        // ---- the cliff behind, bent through the water (the river's see-through picture); far away it would be stale
        float near = uOptics * (1.0 - smoothstep(30.0, 40.0, length(cameraPosition - vWP)));
        vec2 suv = gl_FragCoord.xy * uInvRes + vec2((s1 - 0.5) * 0.06 + N.x * 0.03, (s2 - 0.5) * 0.025);
        vec3 under = texture2D(uThrough, suv).rgb;
        // ---- body: clear turquoise where it is thin (lip, sides), deeper blue where it is thick
        float thick = (1.0 - edge * edge) * (0.55 + 0.45 * smoothstep(0.0, 0.5, y));
        vec3 body = mix(uShallow, uMid, thick);
        body = mix(body, uDeep, smoothstep(0.55, 0.9, thick) * (1.0 - smoothstep(0.3, 0.85, y)) * 0.6);
        // anime water: two flat blues, a paler one down the middle, and nothing seen through it
        vec3 flat2 = mix(uMid, mix(uShallow, uMid, 0.35), smoothstep(0.52, 0.56, s1 * 0.5 + (1.0 - edge) * 0.45));
        body = mix(body, flat2, uToon);
        vec3 col = mix(body, under * mix(vec3(1.0), uShallow * 1.25, 0.45), near * mix(0.55, 0.2, thick) * (1.0 - uToon));
        // light: the face turned to the sun is lighter, the rims catch the sky
        col *= mix(0.9 + 0.22 * max(dot(N, uSun), 0.0), 1.0, uToon);
        col = mix(col, uSky, pow(1.0 - facing, 3.0) * 0.55 * (1.0 - uToon));
        // ---- white water: the river's painted foam, stretched into falling streaks, more of it as the water breaks up
        float wv = (s1 - 0.5) * 0.08;                                              // let the streaks sway a little
        float brush = paintedFoam(vec2(fp.x * 0.55 + uLayer * 0.37 + wv, fp.y * 0.016 - t * 0.16));
        brush = max(brush, paintedFoam(vec2(fp.x * 0.9 + 0.23 + uLayer, fp.y * 0.024 - t * 0.27)) * 0.8);
        brush = mix(smoothstep(0.55, 0.85, s1 * 0.6 + s2 * 0.4), smoothstep(0.12, 0.65, brush), uFoamOn);
        float aerate = smoothstep(0.15, 1.0, y) * 0.75 + uWhiteAmt;
        float whiteness = clamp(brush * (0.35 + aerate) + smoothstep(0.55, 1.0, y) * 0.35, 0.0, 0.95);
        whiteness = mix(whiteness, smoothstep(0.42, 0.5, whiteness) * 0.97, uToon);      // anime water: streaks are white or not
        col = mix(col, uWhite, whiteness);
        col = mix(col, uWhite, (1.0 - smoothstep(0.0, 0.06, y)) * 0.5 * (1.0 - edge));      // the glassy roll over the lip
        // soft sun sparkle on the streaks
        float spec = pow(max(dot(normalize(uSun + V), N), 0.0), 60.0);
        col += uWhite * spec * 0.25 * (1.0 - uToon);
        col = mix(col, uHaze, vHaze);
        float alpha = side * (1.0 - smoothstep(0.88, 1.0, y)) * uOpacity;
        alpha *= mix(mix(mix(0.75, 1.0, thick), 1.0, whiteness), 1.0, uToon);
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// a curved sheet with a rounded front: centre bulges towards the viewer, sides tuck back
function fallGeometry({ x, z, top, bottom, width, forward, inset = 0, bulge = 0.5 }) {
  const g = new THREE.PlaneGeometry(1, 1, 18, 48);
  const a = g.attributes.position, uv = g.attributes.uv, H = top - bottom;
  for (let i = 0; i < a.count; i++) {
    const u = a.getX(i) * 2;                 // -1..1
    const t = 0.5 - a.getY(i);               // 0 top .. 1 bottom
    const spread = 1.0 + 0.35 * t;           // the fall widens a little as it drops
    a.setXYZ(i, x + u * width * 0.5 * spread, top - t * H, z + inset + forward * Math.sqrt(t) + bulge * (1 - u * u) * (0.4 + 0.6 * t));
    uv.setXY(i, u * 0.5 + 0.5, t);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- churn: the river's painted foam, pushed outwards from where the water lands
function churnMaterial(common, radius) {
  return new THREE.ShaderMaterial({
    uniforms: { ...common, uR: { value: radius } },
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform sampler2D uFoamMap;
      uniform float uTime, uR, uFoamOn;
      uniform vec3 uWhite, uShallow;
      varying vec2 vP;
      ${PAINTED}
      void main() {
        float r = length(vP) / uR;
        if (r > 1.0) discard;
        vec2 dirR = vP / max(length(vP), 0.001);
        float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
        // strokes ride outwards in rings, as the landing water pushes the surface away
        float brush = paintedFoam(vec2(a * 5.0, r * 1.6 - uTime * 0.55));
        float brush2 = paintedFoam(vec2(a * 3.0 + 0.31, r * 1.1 - uTime * 0.36 + 0.5));
        // the foam breaks up into patches that are carried away from the landing point
        float n = noise2(vP * 1.3 + dirR * -uTime * 0.9);
        float n2 = noise2(vP * 2.6 - dirR * uTime * 1.25 + 7.3);
        float patches = smoothstep(0.34 + r * 0.26, 0.66 + r * 0.14, n2);
        float art = mix(smoothstep(0.45, 0.8, n), smoothstep(0.1, 0.6, max(brush, brush2 * 0.8)), uFoamOn);
        art = max(art * 0.85, patches * (0.55 + 0.45 * art));
        float core = 1.0 - smoothstep(0.06, 0.34, r + (n - 0.5) * 0.15);       // solid boil right under the fall
        // a ring of foam is thrown out every few seconds and thins as it travels
        float pulse = fract(uTime * 0.32);
        float ring = smoothstep(0.16, 0.0, abs(r - pulse)) * (1.0 - pulse) * smoothstep(0.35, 0.7, n2 + 0.25);
        float foam = max(core, max(art * (1.0 - smoothstep(0.45, 1.0, r)), ring));
        gl_FragColor = vec4(mix(uShallow * 1.2, uWhite, 0.55 + 0.45 * foam), foam * 0.92 * (1.0 - smoothstep(0.82, 1.0, r)));
      }`,
    transparent: true, depthWrite: false,
  });
}

// ---------------------------------------------------------------- anime churn: a sheet of white foam pushed outwards from where the water
// lands, with round gaps that widen as it travels until the sheet tears into threads and flecks (the same cells as the
// foam rings of a footstep in stylized-water.js, here flowing without end)
function animeChurnMaterial(common, radius, cells) {
  return new THREE.ShaderMaterial({
    uniforms: { ...common, uR: { value: radius }, uCells: { value: cells } },
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uCells;
      uniform float uTime, uR;
      uniform vec3 uWhite, uShallow;
      varying vec2 vP;
      void main() {
        vec2 e = vec2(vP.x, vP.y / 0.75) / uR;                 // the churn is an ellipse: measure it as a circle
        float r = length(e);
        if (r > 1.0) discard;
        float ang = atan(e.y, e.x) / 6.2831853 + 0.5;
        // one sheet of foam running outwards: quick where the water lands and slowing as it spreads, its cells swaying instead
        // of sliding as a rigid plate, with slow swells of thicker foam rolling out through it. Soft edges, nothing that pops.
        float rr = pow(r, 0.72);
        vec2 sway = vec2(sin(ang * 12.566 + uTime * 0.5 + r * 5.0), sin(ang * 18.85 - uTime * 0.37 + r * 7.0)) * 0.012;
        vec2 c1 = texture2D(uCells, vec2(ang * 4.0, rr - uTime * 0.105) + sway).rg;
        float swell = sin(rr * 15.0 - uTime * 2.2) * (1.0 - r);
        float gap = 0.05 + 0.44 * smoothstep(0.16, 0.95, r) - 0.05 * swell;
        float foam = smoothstep(gap - 0.05, gap + 0.05, c1.r);
        foam = max(foam, 1.0 - smoothstep(0.12, 0.22, r + (c1.g - 0.3) * 0.12));        // solid boil right under the fall
        foam *= 1.0 - smoothstep(0.8, 1.0, r + (c1.g - 0.3) * 0.35);                     // a ragged rim
        float pale = (1.0 - smoothstep(0.25, 0.75, r)) * 0.5;                            // paler water under the foam
        gl_FragColor = vec4(mix(mix(uShallow * 1.2, uWhite, 0.6), uWhite, foam), max(foam * 0.96, pale));
      }`,
    transparent: true, depthWrite: false,
  });
}

// ---------------------------------------------------------------- spray: drops thrown up where the water lands, all moved on the GPU
function sprayMaterial(common, { count, top }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...common, uPx: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec4 aSeed;          // x: phase, y: angle, z: speed, w: size
      uniform float uTime, uPx;
      varying float vFade;
      void main() {
        float life = 1.25;
        float k = fract(uTime / life + aSeed.x);
        float tt = k * life;
        vec3 dir = vec3(cos(aSeed.y), 0.0, sin(aSeed.y) * 0.8 + 0.2);
        vec3 p = position + dir * aSeed.z * tt * 1.35 + vec3(0.0, aSeed.z * 1.4 * tt - 4.9 * tt * tt, 0.0);
        p.y = max(p.y, position.y - 0.05);
        vFade = sin(k * 3.14159) * step(position.y - 0.04, p.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSeed.w * uPx * 120.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uWhite;
      uniform float uToon;
      varying float vFade;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c) * 4.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(uWhite, mix((1.0 - d) * vFade * 0.8, step(d, 0.7) * step(0.35, vFade), uToon));
      }`,
    transparent: true, depthWrite: false,
  });
}

// ---------------------------------------------------------------- foam flecks: bits of foam flung across the surface from the landing point
function fleckMaterial(common) {
  return new THREE.ShaderMaterial({
    uniforms: { ...common, uPx: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec4 aSeed;          // x: phase, y: angle, z: speed, w: size
      uniform float uTime, uPx;
      varying float vFade;
      void main() {
        float life = 2.4;
        float k = fract(uTime / life + aSeed.x);
        float tt = k * life;
        vec3 dir = vec3(cos(aSeed.y), 0.0, sin(aSeed.y) * 0.75);
        float travel = aSeed.z * (1.0 - exp(-tt * 1.6)) / 1.6 * 2.2;      // thrown fast, then drifts to a stop
        vec3 p = position + dir * travel;
        vFade = smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.45, 1.0, k));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSeed.w * (0.7 + k * 0.8) * uPx * 120.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uWhite;
      uniform float uToon;
      varying float vFade;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c) * 4.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(uWhite, mix(smoothstep(1.0, 0.25, d) * vFade * 0.75, step(d, 0.7) * step(0.35, vFade), uToon));
      }`,
    transparent: true, depthWrite: false,
  });
}

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- billows: the foot of a cartoon waterfall
// Where the water lands it does not throw up crowns (that is a stone dropped in a pond): it boils up into small soft white
// puffs, like little clouds, that rise out of the water, drift out over the pool spreading apart and growing as they go, and
// fade away while new ones rise behind them. Each puff is one upright card that always faces the camera, with a cloud drawn
// on it: a handful of round lobes joined into one shape, flat white where the light falls and pale blue in the folds.
// As a puff fades its outline goes soft and its lobes drift apart, so it thins out like a cloud instead of popping.
//   const billows = createBillows({ x, z, y, width });      // the line where the water lands, and the water's level
export function createBillows({ x = 0, z = 0, y = 0, width = 4.6, count = 0, size = 0.7, time = shared.uTime, white = '#ffffff', shade = '#d3edf8' } = {}) {
  const n = count || Math.max(12, Math.round(width * 4.2));
  const quad = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  const base = new Float32Array(n * 4), seed = new Float32Array(n * 4), drift = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5 + (Math.random() - 0.5) * 0.9) / n - 0.5;                                // across the sheet
    const ends = 1 - 0.4 * (2 * u) * (2 * u);                                                     // smaller toward the ends
    base.set([x + u * width, y, z + (Math.random() - 0.5) * 0.35, size * (0.7 + 0.6 * Math.random()) * ends], i * 4);
    // phase, 1 / life, shape, how high it rises
    seed.set([Math.random(), 1 / (3.2 + 2.4 * Math.random()), Math.floor(Math.random() * 100), 0.25 + 0.45 * Math.random()], i * 4);
    // where it drifts in its life: out over the pool, and apart sideways (the ones at the ends fan out further)
    drift.set([1.1 + 1.6 * Math.random(), (u * 1.3 + (Math.random() - 0.5) * 0.5) * 1.2], i * 2);
  }
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 4));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.setAttribute('aDrift', new THREE.InstancedBufferAttribute(drift, 2));
  geo.instanceCount = n;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y + 1, z + 1.2), width + 4);
  const rgb = h => new THREE.Color(h);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uWhite: { value: rgb(white) }, uShade: { value: rgb(shade) } },
    vertexShader: /* glsl */`
      attribute vec4 aBase, aSeed;
      attribute vec2 aDrift;
      uniform float uTime;
      varying vec2 vP;
      varying vec3 vK;
      void main() {
        float k = fract(uTime * aSeed.y + aSeed.x);                        // 0 rising out of the water .. 1 faded away
        float grow = 1.0 - pow(1.0 - min(k / 0.22, 1.0), 2.0);             // pops up out of the foam ...
        float s = aBase.w * (0.3 + 0.7 * grow) * (1.0 + 1.2 * k);          // ... and keeps spreading as it drifts, like a cloud
        float go = 1.0 - pow(1.0 - k, 2.2);                                // quick off the foot of the falls, slowing out on the pool
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        // it sits on the water (the card's lower edge is under the surface), drifts out and apart, and lifts a little as it goes
        vec3 c = vec3(aBase.x + aDrift.y * go, aBase.y + s * 0.42 + aSeed.w * go, aBase.z + aDrift.x * go);
        vec3 p = c + (right * position.x + vec3(0.0, 1.0, 0.0) * position.y) * s * 1.3;      // the card is bigger than the cloud drawn on it, so no lobe is ever cut off by its edge
        vP = position.xy * 1.3; vK = vec3(k, smoothstep(0.3, 1.0, k), aSeed.z);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uWhite, uShade;
      uniform float uTime;
      varying vec2 vP;
      varying vec3 vK;
      float h1(float n) { return fract(sin(n * 127.1 + 3.7) * 43758.5453); }
      // one lobe: x = distance to its edge, y = distance to the edge of its lit part (the same circle pushed toward the light)
      vec2 lobe(vec2 p, vec2 c, float r, float i) {
        float sd = floor(vK.z + 0.5) + i * 7.0;                // a whole number: what reaches here has been interpolated, and the hash cannot bear the least wobble
        vec2 j = vec2(h1(sd), h1(sd + 1.0)) - 0.5;
        c += j * 0.14 + vec2(sin(uTime * 1.3 + sd), cos(uTime * 1.1 + sd * 1.7)) * 0.025;     // each one its own, and never quite still
        c += j * 0.5 * vK.y;                                                                  // fading: the lobes drift apart
        r *= (0.85 + 0.3 * h1(sd + 2.0)) * (1.0 - 0.3 * vK.y * (0.6 + 0.4 * h1(sd + 3.0)));
        return vec2(length(p - c) - r, length(p - c - vec2(0.04, 0.07)) - r * 0.86);
      }
      void main() {
        vec2 p = vP;
        vec2 d = lobe(p, vec2(0.0, -0.22), 0.56, 0.0);
        d = min(d, lobe(p, vec2(-0.44, -0.2), 0.36, 1.0));
        d = min(d, lobe(p, vec2(0.45, -0.22), 0.37, 2.0));
        d = min(d, lobe(p, vec2(-0.22, 0.2), 0.36, 3.0));
        d = min(d, lobe(p, vec2(0.24, 0.24), 0.34, 4.0));
        d = min(d, lobe(p, vec2(0.02, 0.48), 0.27, 5.0));
        float fade = vK.y;
        float soft = 0.03 + 0.32 * fade;                                                      // crisp while it boils, soft as it thins out
        float a = (1.0 - smoothstep(-soft, 0.0, d.x)) * smoothstep(-0.66, -0.6, p.y);         // cut flat where it meets the water
        a *= (1.0 - fade * fade) * (1.0 - fade) * 0.5 + (1.0 - fade) * 0.5;
        a *= smoothstep(0.0, 0.06, vK.x);                // fades the whole way out, no pop at either end
        if (a < 0.01) discard;
        vec3 col = mix(uWhite, uShade, smoothstep(-0.03, 0.0, d.y) * smoothstep(-0.5, -0.25, p.y));      // flat white in the light, pale blue in the folds; all white where it stands in the foam
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'waterfallBillows';
  mesh.frustumCulled = true;
  mesh.userData.dispose = () => { geo.dispose(); quad.dispose(); mat.dispose(); };
  return mesh;
}

export function createWaterfall({ x = 0, z = 0, top = 10, bottom = 0, width = 4.6, forward = 2.9, optics = null, foamTexture = null, cells = null, surfaceChurn = null, sun = [-0.4, 0.9, 0.5] } = {}) {
  const group = new THREE.Group();
  group.name = 'waterfallClear';
  const common = commonUniforms({ optics, foamTexture, sun });
  const H = top - bottom, owned = [];
  const add = (mesh, order) => { mesh.renderOrder = order; group.add(mesh); owned.push(mesh); return mesh; };
  // the body and a faster veil in front of it
  add(new THREE.Mesh(fallGeometry({ x, z, top, bottom, width, forward, bulge: 0.55 }), fallMaterial(common, { layer: 0, speed: 1, width, height: H })), 2);
  add(new THREE.Mesh(fallGeometry({ x: x - width * 0.05, z, top, bottom, width: width * 0.62, forward, inset: 0.22, bulge: 0.4 }),
    fallMaterial(common, { layer: 1, speed: 1.4, white: 0.25, opacity: 0.6, width: width * 0.62, height: H })), 3);
  // churn on the pool
  const footZ = z + forward + 0.35, R = width * 1.5;
  const churnGeo = new THREE.CircleGeometry(R, 56);
  churnGeo.rotateX(-Math.PI / 2);
  churnGeo.scale(1, 1, 0.75);
  const churn = add(new THREE.Mesh(churnGeo, cells ? animeChurnMaterial(common, R, cells) : churnMaterial(common, R)), 4);
  churn.position.set(x, bottom + 0.27, footZ);
  // surfaceChurn (WATER_CHURN of stylized-water.js): the water surface draws the churn itself, riding its own waves; the flat
  // sheet here would be cut through by every wave that rises above it, so it stays hidden
  if (surfaceChurn && cells) { surfaceChurn.value.set(x, footZ, R, 1); churn.visible = false; }
  // billows: soft white mounds boiling up along the line where the water lands
  add(createBillows({ x, z: footZ - 0.3, y: bottom + 0.25, width }), 6);
  // spray
  const N = 220, pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = x + (Math.random() - 0.5) * width * 1.1; pos[i * 3 + 1] = bottom + 0.3; pos[i * 3 + 2] = footZ + (Math.random() - 0.5) * 0.8;
    seed.set([Math.random(), Math.random() * Math.PI * 2, 1.2 + Math.random() * 2.6, 0.08 + Math.random() * 0.14], i * 4);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, bottom + 2, footZ), width * 2 + 4);
  const spray = add(new THREE.Points(sg, sprayMaterial(common, { count: N, top })), 5);
  // foam flecks scattering over the pool
  const FN = 110, fpos = new Float32Array(FN * 3), fseed = new Float32Array(FN * 4);
  for (let i = 0; i < FN; i++) {
    fpos[i * 3] = x + (Math.random() - 0.5) * width * 0.7; fpos[i * 3 + 1] = bottom + 0.3; fpos[i * 3 + 2] = footZ + (Math.random() - 0.5) * 0.5;
    fseed.set([Math.random(), Math.random() * Math.PI * 2, 0.8 + Math.random() * 1.8, 0.16 + Math.random() * 0.26], i * 4);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fg.setAttribute('aSeed', new THREE.BufferAttribute(fseed, 4));
  fg.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, bottom + 0.3, footZ), width * 2 + 4);
  const flecks = add(new THREE.Points(fg, fleckMaterial(common)), 4);
  flecks.renderOrder = 4;
  // a faint veil of mist drifting up from the pool
  const tex = mistTexture();
  const mists = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xeef9fb, transparent: true, depthWrite: false, opacity: 0 }));
    m.renderOrder = 6;
    m.userData = { phase: i / 6, ox: (Math.random() - 0.5) * width * 1.4, oz: (Math.random() - 0.2) * 1.4, s: 4 + Math.random() * 3 };
    group.add(m);
    mists.push(m);
  }
  const LIFE = 7.0;
  return {
    group,
    update(renderer = null) {
      if (renderer) { const px = renderer.getPixelRatio(); spray.material.uniforms.uPx.value = px; flecks.material.uniforms.uPx.value = px; }
      const now = shared.uTime.value;
      for (const m of mists) {
        const k = (now / LIFE + m.userData.phase) % 1;             // 0 born .. 1 gone
        m.position.set(x + m.userData.ox * (0.7 + k * 0.5), bottom + 0.6 + k * 2.6, footZ + m.userData.oz + k * 0.9);
        m.scale.setScalar(m.userData.s * (0.7 + k * 0.7));
        m.material.opacity = Math.sin(k * Math.PI) * 0.16;
      }
    },
    dispose() {
      for (const o of owned) { o.geometry.dispose(); o.material.dispose(); }
      for (const m of mists) m.material.dispose();
      tex.dispose();
    },
  };
}
