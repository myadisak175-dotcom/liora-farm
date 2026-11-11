/* ==========================================================================
   abyss-scene.js  —  what is seen in the abyss: the falls going over its brink and the clouds that hang in it

   One job: draw them. Where the abyss is and where its falls are comes from abyss-shape.js.
     const falls = createAbyssFalls({ falls: AB.falls, centre: [ABYSS.x, ABYSS.z], optics, foamTexture });
     const clouds = createAbyssClouds({ centre: [ABYSS.x, ABYSS.z], rimR: AB.rimR, ledges, falls: AB.falls });
     scene.add(falls.group, clouds.group)      both are driven by the shared clock: nothing to call each frame

   A fall here is the same water as the valley's waterfall (stylized-waterfall.js: its material, its painted foam streaks),
   only it never lands: the sheet leaves the brink, bows out a little as it drops and frays into white, and fades away into
   the clouds a good forty metres down. The clouds are soft white puffs (flat white in the light, pale blue in the folds, as
   at the foot of the falls) sitting on the ledges along the walls and drifting slowly round the pit, thicker where the falls
   go into them, and below them a slow swirl of mist with the dark eye of the abyss showing through in the middle.
   Mobile-safe shaders: no uniform arrays, no loops.
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';
import { _fall } from './stylized-waterfall.js';

const { NOISE, shared } = _internal;
const D = Math.PI / 180;

// ---------------------------------------------------------------- the falls
// a curved sheet hanging from the brink at the origin, falling down -y and bowing out along +z (into the pit)
function sheetGeometry({ width, height, forward, bulge = 0.5, inset = 0, spread = 0.55 }) {
  const g = new THREE.PlaneGeometry(1, 1, 16, 72);
  const a = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < a.count; i++) {
    const u = a.getX(i) * 2;                     // -1..1 across
    const t = 0.5 - a.getY(i);                   // 0 at the brink .. 1 at the bottom
    a.setXYZ(i, u * width * 0.5 * (1 + spread * t), -t * height, inset + forward * Math.sqrt(t) + bulge * (1 - u * u) * (0.3 + 0.7 * t));
    uv.setXY(i, u * 0.5 + 0.5, t);
  }
  g.computeVertexNormals();
  return g;
}

export function createAbyssFalls({ falls, centre, bottom = -52, optics = null, foamTexture = null, sun = [-0.4, 0.9, 0.5] }) {
  const group = new THREE.Group();
  group.name = 'abyssFalls';
  const common = _fall.commonUniforms({ optics, foamTexture, sun });
  const owned = [];
  for (const f of falls) {
    const H = f.top - bottom, w = f.width;
    const holder = new THREE.Group();
    holder.position.set(f.x, f.top, f.z);
    // local +z points into the pit: turn it toward the centre
    holder.rotation.y = Math.atan2(centre[0] - f.x, centre[1] - f.z);
    // (a long drop breaks the water up: whiter than the valley's falls, and it spreads as it goes)
    const body = new THREE.Mesh(sheetGeometry({ width: w, height: H, forward: 4.2, bulge: 0.5, spread: 1.1 }), _fall.fallMaterial(common, { layer: 0, speed: 1.15, white: 0.32, width: w, height: H }));
    const veil = new THREE.Mesh(sheetGeometry({ width: w * 0.7, height: H, forward: 4.2, inset: 0.25, bulge: 0.38, spread: 1.3 }),
      _fall.fallMaterial(common, { layer: 1, speed: 1.55, white: 0.6, opacity: 0.7, width: w * 0.7, height: H }));
    veil.position.x = -w * 0.04;
    body.renderOrder = 2; veil.renderOrder = 3;
    holder.add(body, veil);
    group.add(holder);
    owned.push(body, veil);
  }
  return {
    group,
    dispose() { for (const m of owned) { m.geometry.dispose(); m.material.dispose(); } },
  };
}

// ---------------------------------------------------------------- the clouds
// one card per puff, always turned full to the camera (they are seen from above as much as from the side). Each card has a
// cloud drawn on it: six round lobes joined into one shape, flat white where the light falls and pale blue in the folds;
// the deeper ones are bluer, as the light that reaches them is. They drift slowly round the pit and breathe a little.
function puffMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uWhite: { value: new THREE.Color('#ffffff') }, uShade: { value: new THREE.Color('#cfe4f0') },
      uDeep: { value: new THREE.Color('#9db6c9') }, uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax },
    vertexShader: /* glsl */`
      attribute vec4 aA;      // x: angle round the centre, y: distance out, z: height, w: size
      attribute vec4 aB;      // x: how fast it drifts round, y: phase, z: shape, w: how deep (0 near the rim .. 1 far down)
      uniform float uTime, uHazeNear, uHazeFar, uHazeMax;
      uniform vec3 uCentre;
      varying vec2 vP;
      varying vec3 vK;
      varying float vHaze;
      void main() {
        float a = aA.x + uTime * aB.x;
        vec3 c = uCentre + vec3(cos(a) * aA.y, aA.z + sin(uTime * 0.13 + aB.y * 6.28) * 0.5, sin(a) * aA.y);
        float s = aA.w * (1.0 + 0.07 * sin(uTime * 0.27 + aB.y * 6.28));
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 p = c + (right * position.x + up * position.y) * s * 1.3;
        vP = position.xy * 1.3;
        vK = vec3(aB.z, aB.w, aB.y);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz)) * 0.7;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uWhite, uShade, uDeep, uHaze;
      uniform float uTime;
      varying vec2 vP;
      varying vec3 vK;
      varying float vHaze;
      float h1(float n) { return fract(sin(n * 127.1 + 3.7) * 43758.5453); }
      vec2 lobe(vec2 p, vec2 c, float r, float i) {
        float sd = floor(vK.x + 0.5) + i * 7.0;
        vec2 j = vec2(h1(sd), h1(sd + 1.0)) - 0.5;
        c += j * 0.16 + vec2(sin(uTime * 0.21 + sd), cos(uTime * 0.17 + sd * 1.7)) * 0.02;
        r *= 0.85 + 0.3 * h1(sd + 2.0);
        return vec2(length(p - c) - r, length(p - c - vec2(0.05, 0.08)) - r * 0.84);
      }
      void main() {
        vec2 p = vP;
        vec2 d = lobe(p, vec2(0.0, -0.18), 0.55, 0.0);
        d = min(d, lobe(p, vec2(-0.46, -0.24), 0.36, 1.0));
        d = min(d, lobe(p, vec2(0.47, -0.2), 0.38, 2.0));
        d = min(d, lobe(p, vec2(-0.22, 0.22), 0.37, 3.0));
        d = min(d, lobe(p, vec2(0.26, 0.24), 0.35, 4.0));
        d = min(d, lobe(p, vec2(0.02, 0.5), 0.27, 5.0));
        float a = 1.0 - smoothstep(-0.035, 0.0, d.x);
        if (a < 0.01) discard;
        vec3 col = mix(uWhite, uShade, smoothstep(-0.03, 0.0, d.y));
        col = mix(col, col * uDeep / uShade, vK.y * 0.7);                   // deeper down, bluer
        col = mix(col, uHaze, vHaze);
        gl_FragColor = vec4(col, a * 0.97);
      }`,
    transparent: true, depthWrite: false,
  });
}

// a slow swirl of mist across the pit, thick along the walls and thin in the middle, where the dark shows through.
// Painted the same way: flat pale tones with hard-ish edges, not a smooth fog.
function swirlMaterial({ radius, tint, density }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uR: { value: radius }, uTint: { value: new THREE.Color(tint) }, uLight: { value: new THREE.Color('#eef6fa') }, uDen: { value: density } },
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform float uTime, uR, uDen;
      uniform vec3 uTint, uLight;
      varying vec2 vP;
      void main() {
        float r = length(vP) / uR;
        if (r > 1.0) discard;
        float ang = atan(vP.y, vP.x);
        // turn slowly, the outside faster than the middle, so it reads as a swirl and never as a sliding picture
        float spin = uTime * (0.012 + 0.02 * r);
        vec2 q = vec2(cos(ang + spin), sin(ang + spin)) * r * uR;
        float n = noise2(q * 0.09 + 3.0) * 0.6 + noise2(q * 0.23 - uTime * 0.02) * 0.3 + noise2(q * 0.6 + 9.0) * 0.1;
        float thick = mix(0.0, 0.95, smoothstep(0.35, 0.9, r)) * uDen;          // nothing over the eye
        float a = smoothstep(1.0 - thick, 1.0 - thick + 0.06, n);
        a *= 1.0 - smoothstep(0.93, 1.0, r);
        if (a < 0.01) discard;
        float lit = noise2(q * 0.09 + 3.0 + vec2(-0.35, -0.5));
        vec3 col = mix(uTint, uLight, step(0.5, lit + (n - 0.5) * 0.5));
        gl_FragColor = vec4(col, a * 0.92);
      }`,
    transparent: true, depthWrite: false,
  });
}

export function createAbyssClouds({ centre, rimR, ledges, falls = [], count = 170, seed = 7 }) {
  const group = new THREE.Group();
  group.name = 'abyssClouds';
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const R = (a, b) => a + rnd() * (b - a);
  const items = [];
  // on the ledges, hugging the walls (the higher ones thinner), from the second ledge down
  for (let i = 0; i < count; i++) {
    const k = 1 + Math.floor(Math.pow(rnd(), 0.8) * (ledges.length - 1));
    const L = ledges[k], a = R(0, Math.PI * 2);
    const u = R(L.u0 + 0.6, L.u0 + 5.5);
    const y = L.y + R(0.8, 3.5);
    const size = R(2.6, 5.5) * (0.75 + 0.15 * k);
    items.push([a, Math.max(4, rimR(a) - u), y, size, R(-1, 1) * 0.006 + 0.008, rnd(), Math.floor(rnd() * 97), Math.min(1, (-y - 8) / 55)]);
  }
  // where the falls go into the clouds: a big soft bank round the foot of each sheet
  for (const f of falls) {
    for (let i = 0; i < 9; i++) {
      const a = f.a + R(-1, 1) * (f.width * 0.9 + 3) / 40, y = R(-50, -36);
      items.push([a, rimR(a) - R(3.5, 9), y, R(4.5, 8), 0.004, rnd(), Math.floor(rnd() * 97), Math.min(1, (-y - 8) / 55)]);
    }
  }
  // a deep bank round the eye, which is left open: the dark shows through it
  for (let i = 0; i < 34; i++) {
    const a = R(0, Math.PI * 2), d = R(13, 25), y = R(-72, -58);
    items.push([a, d, y, R(5, 9), 0.006 + 0.004 * rnd(), rnd(), Math.floor(rnd() * 97), 1]);
  }
  const n = items.length;
  const quad = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  const A = new Float32Array(n * 4), B = new Float32Array(n * 4);
  items.forEach((it, i) => { A.set(it.slice(0, 4), i * 4); B.set(it.slice(4, 8), i * 4); });
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4));
  geo.instanceCount = n;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(centre[0], -35, centre[1]), 60);
  const mat = puffMaterial();
  mat.uniforms.uCentre = { value: new THREE.Vector3(centre[0], 0, centre[1]) };
  const puffs = new THREE.Mesh(geo, mat);
  puffs.name = 'abyssPuffs';
  puffs.renderOrder = 6;
  group.add(puffs);
  // two sheets of swirling mist: one between the third and fourth ledges, a thicker one over the eye
  const swirls = [];
  for (const [y, radius, tint, den] of [[-41, 30, '#c2d8e4', 0.55], [-63, 22, '#93b0c4', 0.8]]) {
    const g = new THREE.CircleGeometry(radius, 64);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, swirlMaterial({ radius, tint, density: den }));
    m.position.set(centre[0], y, centre[1]);
    m.renderOrder = 5;
    group.add(m);
    swirls.push(m);
  }
  return {
    group,
    dispose() { geo.dispose(); quad.dispose(); mat.dispose(); for (const m of swirls) { m.geometry.dispose(); m.material.dispose(); } },
  };
}
