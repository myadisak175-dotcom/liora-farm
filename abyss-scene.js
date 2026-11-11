/* ==========================================================================
   abyss-scene.js  —  what is seen in the abyss: the falls going over its brink and the clouds that hang in it

   One job: draw them. Where the abyss is and where its falls are comes from abyss-shape.js.
     const falls = createAbyssFalls({ falls: AB.falls, centre: [ABYSS.x, ABYSS.z], foamTexture });
     const clouds = createAbyssClouds({ centre: [ABYSS.x, ABYSS.z], rimR: AB.rimR, ledges, falls: AB.falls });
     const caves = createAbyssCaves({ spots });  // spots: [{ x, y, z, yaw, lean, w, h }] on the walls
     scene.add(falls.group, clouds.group, caves.group)      all driven by the shared clock: nothing to call each frame

   A fall here is the same water as the valley's waterfall (stylized-waterfall.js: its material, its painted foam streaks).
   Some go down in steps: a short sheet into a pool on a ledge, where white spray boils up (the billows of the valley's falls),
   and on over the pool's lip; one splits round a rock. The last drop of each never lands: the sheet bows out a little as it
   falls, frays into white, and fades away into the clouds a good forty metres down. AB.falls says how each one goes. The clouds are soft white puffs (flat white in the light, pale blue in the folds, as
   at the foot of the falls) sitting on the ledges along the walls and drifting slowly round the pit, thicker where the falls
   go into them, and below them a slow swirl of mist with the dark eye of the abyss showing through in the middle.
   Mobile-safe shaders: no uniform arrays, no loops.
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';
import { _fall, createBillows, FALL_TUNE } from './stylized-waterfall.js';

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

export function createAbyssFalls({ falls, centre, optics = null, foamTexture = null, sun = [-0.4, 0.9, 0.5] }) {
  const group = new THREE.Group();
  group.name = 'abyssFalls';
  const common = _fall.commonUniforms({ optics, foamTexture, sun });
  const owned = [], billows = [];
  for (const f of falls) {
    const holder = new THREE.Group();
    holder.position.set(f.x, 0, f.z);
    // local +z points into the pit: turn it toward the centre
    const yaw = Math.atan2(centre[0] - f.x, centre[1] - f.z);
    holder.rotation.y = yaw;
    for (const sh of f.sheets) {
      const H = sh.top - sh.bottom, w = sh.width, long = H > 25;
      // (a long drop breaks the water up: whiter than the valley's falls, and it spreads as it goes)
      const body = new THREE.Mesh(sheetGeometry({ width: w, height: H, forward: sh.forward, bulge: long ? 0.5 : 0.35, spread: long ? 1.1 : 0.35 }),
        _fall.fallMaterial(common, { layer: 0, speed: 1.15, white: long ? 0.32 : 0.12, width: w, height: H }));
      const veil = new THREE.Mesh(sheetGeometry({ width: w * 0.7, height: H, forward: sh.forward, inset: 0.25, bulge: 0.38, spread: long ? 1.3 : 0.4 }),
        _fall.fallMaterial(common, { layer: 1, speed: 1.55, white: long ? 0.6 : 0.35, opacity: 0.7, width: w * 0.7, height: H }));
      for (const m of [body, veil]) m.position.set(sh.off + (m === veil ? -w * 0.04 : 0), sh.top, sh.u);
      body.renderOrder = 2; veil.renderOrder = 3;
      holder.add(body); owned.push(body);
      if (long) { holder.add(veil); owned.push(veil); } else { veil.geometry.dispose(); veil.material.dispose(); }      // a short step into a pool needs no second layer
    }
    // where a sheet lands in a pool: white spray boiling up out of it and drifting out over the water (not the mist: that
    // hangs in the pit, bluer and slower, below)
    for (const L of f.landings) {
      const x = f.x + Math.sin(yaw) * L.u, z = f.z + Math.cos(yaw) * L.u;
      const b = createBillows({ x, z, y: L.y, width: L.width, yaw, tune: SPRAY });
      b.renderOrder = 6;
      group.add(b);
      billows.push(b);
    }
    group.add(holder);
  }
  return {
    group,
    dispose() { for (const m of owned) { m.geometry.dispose(); m.material.dispose(); } for (const b of billows) b.userData.dispose(); },
  };
}

// the spray in the pools: the valley's billows, a little smaller and quicker (set once, not live from the tuner)
const SPRAY = Object.fromEntries(Object.entries(FALL_TUNE).map(([k, v]) => [k, { value: v.value }]));
SPRAY.puffSize.value *= 0.8; SPRAY.puffLife.value *= 0.85; SPRAY.puffAmount.value = 0.75;

// ---------------------------------------------------------------- caves
// dark mouths in the walls: an arch with a ragged edge, the dark going deeper toward its middle and a pale lip of lit rock
// along its top. Flat cards stood against the wall (the land here is one height per spot, so it cannot hollow itself out).
function caveMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uIn: { value: new THREE.Color('#142233') }, uMid: { value: new THREE.Color('#2c3d52') }, uLip: { value: new THREE.Color('#8d96a0') },
      uMist: { value: new THREE.Color('#a9c8d6') }, uSeed: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying float vY;
      void main() { vUv = uv; vY = (modelMatrix * vec4(position, 1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform vec3 uIn, uMid, uLip, uMist;
      uniform float uSeed;
      varying vec2 vUv;
      varying float vY;
      void main() {
        vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);                    // x -1..1, y 0 (foot) .. 1 (top)
        float ang = atan(p.x, p.y - 0.42);
        float rag = (noise2(vec2(ang * 2.2 + uSeed, uSeed * 1.7)) - 0.5) * 0.16 + (noise2(vec2(ang * 5.0 - uSeed, 3.0)) - 0.5) * 0.04;
        float e = p.y < 0.42 ? abs(p.x) : length(vec2(p.x, (p.y - 0.42) / 0.58));     // the arch: 0 in the middle .. 1 at its edge
        e += rag;
        if (e > 0.94 || p.y < 0.02 + (noise2(vec2(p.x * 4.0 + uSeed, 7.0)) - 0.5) * 0.06) discard;
        vec3 col = mix(uIn, uMid, smoothstep(0.35, 0.85, e));
        if (e > 0.8 && p.y > 0.55) col = uLip;                     // the lit lip over the mouth
        col = mix(col, uMist, smoothstep(-6.0, -42.0, vY) * 0.45);   // as far down in the mist as the wall round it
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
}
export function createAbyssCaves({ spots }) {
  const group = new THREE.Group();
  group.name = 'abyssCaves';
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const mats = [];
  spots.forEach((c, i) => {
    const m = caveMaterial();
    m.uniforms.uSeed.value = i * 3.7 + 1.3;
    mats.push(m);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(c.x, c.y, c.z);
    mesh.rotation.set(0, c.yaw, 0);
    mesh.rotateX(-c.lean);                    // lean back with the face of the wall
    mesh.scale.set(c.w, c.h, 1);
    group.add(mesh);
  });
  return { group, dispose() { geo.dispose(); mats.forEach(m => m.dispose()); } };
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
  // three sheets of swirling mist, thicker the deeper they hang: they hide the ledges further down, so the pit's shape is
  // never all seen at once
  const swirls = [];
  for (const [y, radius, tint, den] of [[-25, 36, '#d6e6ee', 0.42], [-41, 31, '#c2d8e4', 0.7], [-63, 23, '#93b0c4', 0.9]]) {
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
