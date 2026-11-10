// stylized-grassfield.js
// Fluffy grass + ground colour map for the stylized nature kit.
//
// The trick: the ground and every blade read the SAME colour map.
//   map.rgb = colour of the ground at that spot  -> the ground paints it, blades use it as their root colour
//   map.a   = how much grass grows there (1 full, 0 bare) -> blades shrink to nothing on bare earth, sand, water
// So blades have no visible root, and grass thins out into dirt instead of stopping at a line.
//
//   small scene (grass stays where it is planted):
//     const map = createGroundMap({ radius: 48, seed, heightAt, shade: [[x, z, r]], bare: [[x, z, r]] });
//     applyGroundMap(groundMesh, map, { far: '#cde6f2' });
//     scene.add(createFluffyGrass({ map, heightAt, count: 180000, radius: 34, far: '#cde6f2' }));
//
//   game world (a fixed number of blades that always surrounds the player):
//     const field = createHeightField({ radius: 120, cells: 320, heightFn });      // terrain grid + height texture
//     const map = createGroundMap({ radius: 120, size: 768, heightAt: field.heightAt, paint: (x, z) => [earth, sand, mow] });
//     scene.add(createTerrain(field, map, { far }));
//     const grass = createFollowGrass({ map, field, count: 260000, tile: 72 });   scene.add(grass);
//     every frame: grass.userData.follow(playerPosition, cameraDirection)
//
// The shared-colour-map idea follows Cortiz's "Stylized Grass" (github.com/cortiz2894/stylized-components, MIT).
// Written for plain three.js and for phone GPUs: no uniform arrays, no loops in GLSL.

import * as THREE from 'three';
import { _internal } from './stylized-nature.js';

const { NOISE, rgb, mulberry32, shared, fbm3 } = _internal;

const toRGB = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const HAZE_UNI = () => ({ uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax });

// ==========================================================================
// GROUND COLOUR MAP
// ==========================================================================
export const GROUND_COLORS = {
  deep: '#6f9a3c',     // damp, shaded grass
  mid: '#86ae42',      // the everyday green
  sunny: '#a2c44c',    // sun-bleached drifts
  shade: '#55843a',    // under tree crowns
  dirt: '#cdb079',     // bare earth
  dirtRim: '#a99a5e',  // where grass thins into earth
  sand: '#e6d3a0',     // beaches
  lawn: '#93b848',     // mown / trodden grass
};

export function createGroundMap({
  radius = 48, center = [0, 0], size = 512, seed = 1, heightAt = null,
  dirt = 0.06,          // share of the field that is random bare earth (0 = none)
  shade = [],           // [x, z, radius, strength 0..1]  soft dark pools, e.g. under trees
  cast = [],            // [x, z, a, b, ux, uz, strength, dapple] shadows thrown by the sun: an ellipse, semi-axis a along (ux, uz), b across
  castTint = [0.5, 0.6, 0.76],    // what the light is multiplied by inside a shadow (cool, like the cloud shadows)
  bare = [],            // [x, z, radius]                 no grass at all, e.g. trunks
  press = [],           // [x, z, radius]                 short grass, e.g. around rocks
  paint = null,         // (x, z) => [earth, sand, mow] each 0..1, or null: hand-placed paths, plots, beaches, lawns
  colors = GROUND_COLORS,
} = {}) {
  const C = {};
  for (const k in GROUND_COLORS) C[k] = toRGB(colors[k] || GROUND_COLORS[k]);
  const data = new Uint8Array(size * size * 4);
  const span = radius * 2, cx = center[0], cz = center[1];
  const S = seed * 13 + 7;
  for (let j = 0; j < size; j++) {
    const z = cz - radius + (j + 0.5) / size * span;
    for (let i = 0; i < size; i++) {
      const x = cx - radius + (i + 0.5) / size * span;
      // broad drifts of colour: deep <-> mid <-> sunny
      const n = fbm3(x * 0.05, 0.3, z * 0.05, S, 3) * 0.75 + fbm3(x * 0.19, 1.1, z * 0.19, S + 3, 2) * 0.25;
      let t = sstep(0.38, 0.62, n);
      // sunlit slopes are a little brighter
      if (heightAt) {
        const e = 0.6;
        const sx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), sz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
        t = Math.min(1, Math.max(0, t + (sx * 0.3 - sz * 0.35) * 1.2));
      }
      let col = t < 0.5 ? mix3(C.deep, C.mid, t * 2) : mix3(C.mid, C.sunny, t * 2 - 1);
      let grass = 1;
      const earth = k => {            // grass thins into earth: rim colour first, then bare soil
        col = mix3(col, k < 0.5 ? mix3(col, C.dirtRim, k * 2) : mix3(C.dirtRim, C.dirt, k * 2 - 1), Math.min(1, k * 1.6));
        grass *= 1 - k;
      };
      if (dirt > 0) {                 // random bare patches with ragged outlines
        const wx = x + (fbm3(x * 0.3, 2.2, z * 0.3, S + 11, 2) - 0.5) * 5, wz = z + (fbm3(x * 0.3, 4.4, z * 0.3, S + 17, 2) - 0.5) * 5;
        const d = fbm3(wx * 0.085, 3.3, wz * 0.085, S + 23, 3);
        const thr = 0.5 + (0.5 - dirt) * 0.36;
        const k = sstep(thr - 0.045, thr + 0.02, d);
        if (k > 0) earth(k);
      }
      if (paint) {
        const p = paint(x, z);
        if (p) {
          const [e, s, m] = p;
          if (m > 0) { col = mix3(col, C.lawn, m * 0.55); grass *= 1 - 0.5 * m; }
          if (e > 0) earth(e);
          if (s > 0) { col = mix3(col, C.sand, Math.min(1, s * 1.5)); grass *= 1 - Math.min(1, s * 1.5); }
        }
      }
      data.set([col[0], col[1], col[2], grass * 255], (j * size + i) * 4);
    }
  }
  // stamps: soft pools painted over the base
  const stamp = (list, fn) => {
    for (const [x, z, r, s = 1] of list) {
      const i0 = Math.max(0, Math.floor((x - r - cx + radius) / span * size)), i1 = Math.min(size - 1, Math.ceil((x + r - cx + radius) / span * size));
      const j0 = Math.max(0, Math.floor((z - r - cz + radius) / span * size)), j1 = Math.min(size - 1, Math.ceil((z + r - cz + radius) / span * size));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = cx - radius + (i + 0.5) / size * span, pz = cz - radius + (j + 0.5) / size * span;
        const d = Math.hypot(px - x, pz - z) / r;
        if (d < 1) fn((j * size + i) * 4, d, s);
      }
    }
  };
  stamp(shade, (o, d, s) => {
    const k = (1 - sstep(0.25, 1, d)) * 0.75 * s * (data[o + 3] / 255);    // no shade tint on bare earth
    data[o] = lerp(data[o], C.shade[0], k); data[o + 1] = lerp(data[o + 1], C.shade[1], k); data[o + 2] = lerp(data[o + 2], C.shade[2], k);
  });
  // cast shadows: coverage 0..255 in its own picture (the terrain reads it too), and the grass colour darkened under it.
  // The shapes are rasterised in slices so a new sun position can be baked in the background (see beginCast / stepCast).
  const dapN = 128, dap = new Uint8Array(dapN * dapN);                         // light falling through leaves in patches: made once
  for (let j = 0; j < dapN; j++) for (let i = 0; i < dapN; i++) dap[j * dapN + i] = 255 * sstep(0.3, 0.7, fbm3(i / dapN * 14, 7.7, j / dapN * 14, S + 29, 2));
  const rasterShape = (cov, [x, z, a, b, ux, uz, st = 1, dp = 0]) => {
    const r = Math.max(a, b);
    const i0 = Math.max(0, Math.floor((x - r - cx + radius) / span * size)), i1 = Math.min(size - 1, Math.ceil((x + r - cx + radius) / span * size));
    const j0 = Math.max(0, Math.floor((z - r - cz + radius) / span * size)), j1 = Math.min(size - 1, Math.ceil((z + r - cz + radius) / span * size));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = cx - radius + (i + 0.5) / size * span, pz = cz - radius + (j + 0.5) / size * span;
      const dx = px - x, dz = pz - z, u = (dx * ux + dz * uz) / a, v = (-dx * uz + dz * ux) / b, d = Math.hypot(u, v);
      if (d >= 1) continue;
      let k = (1 - sstep(0.62, 1, d)) * st;
      if (dp > 0) k *= 1 - dp * (1 - dap[(Math.floor(pz * 2.2) & (dapN - 1)) * dapN + (Math.floor(px * 2.2) & (dapN - 1))] / 255);
      const o = j * size + i, c = Math.round(k * 255);
      if (c > cov[o]) cov[o] = c;
    }
  };
  const cov = new Uint8Array(size * size);
  for (const shape of cast) rasterShape(cov, shape);
  const base = data.slice();                                                     // the colours before any shadow went on
  const tintCast = k => {                                                        // k: how dark shadows are now (0 = none)
    for (let q = 0; q < cov.length; q++) {
      const o = q * 4, c = cov[q] / 255 * k;
      data[o] = base[o] * (1 + (castTint[0] - 1) * c); data[o + 1] = base[o + 1] * (1 + (castTint[1] - 1) * c); data[o + 2] = base[o + 2] * (1 + (castTint[2] - 1) * c);
    }
  };
  tintCast(1);
  stamp(press, (o, d) => { data[o + 3] = Math.min(data[o + 3], lerp(90, 255, sstep(0.55, 1, d))); });
  stamp(bare, (o, d) => { data[o + 3] = Math.min(data[o + 3], 255 * sstep(0.6, 1, d)); });

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;          // the kit's shaders work in raw sRGB values
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  const castTex = new THREE.DataTexture(cov, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  castTex.colorSpace = THREE.NoColorSpace; castTex.unpackAlignment = 1;
  castTex.magFilter = castTex.minFilter = THREE.LinearFilter;
  castTex.wrapS = castTex.wrapT = THREE.ClampToEdgeWrapping;
  castTex.needsUpdate = true;
  // CPU lookup for placing things: grassAt(x, z) -> 0..1
  const grassAt = (x, z) => {
    const i = Math.min(size - 1, Math.max(0, Math.floor((x - cx + radius) / span * size)));
    const j = Math.min(size - 1, Math.max(0, Math.floor((z - cz + radius) / span * size)));
    return data[(j * size + i) * 4 + 3] / 255;
  };
  // a new set of shadows (the sun moved): beginCast(list, k) starts it, stepCast(ms) works on it for a few milliseconds
  // per frame and returns true on the frame the new shadows go live
  let job = null;
  const beginCast = (list, k = 1) => { job = { list, i: 0, q: 0, cov: new Uint8Array(size * size), stage: data.slice(), k }; };
  const stepCast = (ms = 3) => {
    if (!job) return false;
    const t0 = performance.now();
    while (job.i < job.list.length && performance.now() - t0 < ms) rasterShape(job.cov, job.list[job.i++]);
    if (job.i < job.list.length) return false;
    // the shapes are done: darken a staging copy of the colours, a slice at a time, then swap everything in at once
    const { cov: nc, stage, k } = job, n = nc.length;
    while (job.q < n) {
      const end = Math.min(n, job.q + 40000);
      for (let q = job.q; q < end; q++) {
        const o = q * 4, c = nc[q] / 255 * k;
        stage[o] = base[o] * (1 + (castTint[0] - 1) * c); stage[o + 1] = base[o + 1] * (1 + (castTint[1] - 1) * c); stage[o + 2] = base[o + 2] * (1 + (castTint[2] - 1) * c);
      }
      job.q = end;
      if (performance.now() - t0 > ms) return false;
    }
    cov.set(nc); data.set(stage); texture.needsUpdate = true; castTex.needsUpdate = true;
    job = null;
    return true;
  };
  // area: where the live grass currently is (centre x, centre z, tile size; 0 = no follow-grass). Ground and grass share it.
  return { texture, cast: castTex, castTint, beginCast, stepCast, data, size, radius, center: [cx, cz], rect: new THREE.Vector3(cx, cz, 1 / span), area: new THREE.Vector3(0, 0, 0), paint: { value: 0 }, grassAt, dispose() { texture.dispose(); castTex.dispose(); } };
}

// GLSL shared by ground and blades: where to look in the map
const MAP_GLSL = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uMapRect;       // centre x, centre z, 1 / world size
vec4 groundMap(vec2 xz) { return texture2D(uMap, (xz - uMapRect.xy) * uMapRect.z + 0.5); }`;

// ==========================================================================
// GROUND
// ==========================================================================
export const GRASS_TIP = '#c6e26c';
// GLSL shared by ground and follow-grass, so that what the ground paints between and beyond the blades matches them:
//   clumpAt  : lumpy drifts (taller, lighter grass)        tipColor : what a blade tip looks like on this ground
const LOOK_GLSL = /* glsl */`
float clumpAt(vec2 xz) { return noise2(xz * 0.6) * 0.65 + noise2(xz * 1.7 + 9.0) * 0.35; }
vec3 tipColor(vec3 ground, vec3 tip) { return mix(ground * 1.17, tip, 0.3); }
// between the roots: deeper and cooler, not just darker (plain darkening turns yellow-green into mud)
vec3 rootColor(vec4 m) { return m.rgb * mix(vec3(1.0), vec3(0.7, 0.9, 0.9), m.a); }
// painterly look: the field is laid in with a few flat tones, in long dabs that all lean the same way like brush strokes
float strokeAt(vec2 xz) {
  vec2 q = vec2(xz.x * 0.82 + xz.y * 0.57, -xz.x * 0.57 + xz.y * 0.82);
  return noise2(vec2(q.x * 0.55, q.y * 1.9)) * 0.6 + noise2(vec2(q.x * 1.5 + 5.0, q.y * 4.6)) * 0.4;
}
vec3 dabColor(vec3 ground, vec3 tip, float v) {
  vec3 light = tipColor(ground, tip);
  vec3 c = ground * vec3(0.8, 0.94, 0.9);                       // deep
  c = mix(c, ground, step(0.4, v));                             // local green
  c = mix(c, mix(ground, light, 0.62), step(0.52, v));          // light
  c = mix(c, light, step(0.71, v));                             // sunlit accents, used sparingly
  return c;
}`;

export function groundMaterial(map, { far = '#eef5e4', fadeA = null, fadeB = null, radius = null, tip = GRASS_TIP } = {}) {
  const R = radius || map.radius;
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map.texture }, uMapRect: { value: map.rect }, uArea: { value: map.area }, uTip: { value: rgb(tip) }, uPaint: map.paint,
      uFar: { value: rgb(far) }, uFadeA: { value: fadeA ?? R * 0.55 }, uFadeB: { value: fadeB ?? R * 0.97 },
      ...HAZE_UNI(),
    },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vWP;
      varying float vHaze;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${MAP_GLSL}
      ${LOOK_GLSL}
      uniform vec3 uFar, uHaze, uArea, uTip;
      uniform float uFadeA, uFadeB, uPaint;
      varying vec3 vWP;
      varying float vHaze;
      void main() {
        vec4 m = groundMap(vWP.xz);
        vec3 col = m.rgb;
        // a little grain on bare earth only
        col *= 1.0 - (1.0 - m.a) * 0.07 * (noise2(vWP.xz * 2.3) - 0.5) * 2.0;
        if (uArea.z > 0.0) {
          // where live grass stands: the dark layer between the roots.  beyond it: the look of grass seen from afar
          float under = 1.0 - smoothstep(uArea.z * 0.3, uArea.z * 0.47, length(vWP.xz - uArea.xy));
          float cn = clumpAt(vWP.xz);
          vec3 afar = mix(m.rgb, tipColor(m.rgb, uTip), (0.3 + 0.5 * cn) * m.a);
          afar *= 1.0 + (noise2(vWP.xz * 4.0) - 0.5) * 0.1 * m.a * (1.0 - uPaint);  // brushy grain so distant meadow is not flat
          afar = mix(afar, mix(m.rgb, dabColor(m.rgb, uTip, cn * 0.45 + strokeAt(vWP.xz) * 0.55), m.a), uPaint);
          col = mix(afar, rootColor(vec4(col, m.a)), under);
        }
        col = mix(col, uHaze, vHaze);
        col = mix(col, uFar, smoothstep(uFadeA, uFadeB, length(vWP.xz - uMapRect.xy)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// repaint an existing ground mesh (e.g. createGround from stylized-nature.js) from the map
export function applyGroundMap(mesh, map, opts = {}) {
  const old = mesh.material;
  mesh.material = groundMaterial(map, { radius: mesh.userData.radius, ...opts });
  if (old && old.dispose) old.dispose();
  const prev = mesh.userData.dispose;
  mesh.userData.dispose = () => { if (prev) prev(); mesh.material.dispose(); map.dispose(); };
  return mesh;
}

// ==========================================================================
// HEIGHT FIELD: one grid of heights used by the terrain mesh, by gameplay (heightAt) and by the grass (texture)
// ==========================================================================
export function createHeightField({ radius = 120, center = [0, 0], cells = 320, heightFn }) {
  const n = cells + 1, span = radius * 2, [cx, cz] = center, step = span / cells;
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = heightFn(cx - radius + i * step, cz - radius + j * step);
  const heightAt = (x, z) => {
    const fx = Math.min(cells - 1e-4, Math.max(0, (x - cx + radius) / step)), fz = Math.min(cells - 1e-4, Math.max(0, (z - cz + radius) / step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * n + i;
    return (h[o] * (1 - u) + h[o + 1] * u) * (1 - v) + (h[o + n] * (1 - u) + h[o + n + 1] * u) * v;
  };
  const half = new Uint16Array(n * n);
  for (let k = 0; k < h.length; k++) half[k] = THREE.DataUtils.toHalfFloat(h[k]);
  const texture = new THREE.DataTexture(half, n, n, THREE.RedFormat, THREE.HalfFloatType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  // uv = (xz - corner) * scale + offset : texel centres sit exactly on grid vertices
  const rect = new THREE.Vector4(cx - radius, cz - radius, cells / n / span, 0.5 / n);
  return { heights: h, n, cells, step, radius, center: [cx, cz], heightAt, texture, rect };
}

export function createTerrain(field, map, opts = {}) {
  const { n, cells, step, radius, heights } = field, [cx, cz] = field.center;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const o = (j * n + i) * 3;
    pos[o] = cx - radius + i * step; pos[o + 1] = heights[j * n + i]; pos[o + 2] = cz - radius + j * step;
  }
  const idx = new Uint32Array(cells * cells * 6);
  let k = 0;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const a = j * n + i, b = a + n;
    idx[k++] = a; idx[k++] = b; idx[k++] = a + 1; idx[k++] = b; idx[k++] = b + 1; idx[k++] = a + 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, groundMaterial(map, { radius, ...opts }));
  mesh.name = 'terrain';
  mesh.userData = { kind: 'terrain', dispose() { g.dispose(); mesh.material.dispose(); } };
  return mesh;
}

// ==========================================================================
// FLUFFY GRASS
// ==========================================================================
function bladeGeometry() {
  // a small soft blade: 5 vertices, 3 triangles. x = -0.5..0.5 across, y = 0..1 up
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0, 0.5, 0, 0,
    -0.4, 0.55, 0, 0.4, 0.55, 0,
    0, 1, 0,
  ], 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  return g;
}

// what every blade does once it knows where it stands (root), what the map says there (m) and how tall it is (h)
const BLADE_BODY = /* glsl */`
        vec2 toCam = cameraPosition.xz - root.xz;
        float dist = length(toCam);
        toCam /= max(dist, 0.001);
        // face the camera, each blade turned a little differently
        float a = iRnd.x * 0.95;
        float ca = cos(a), sa = sin(a);
        vec2 f = vec2(toCam.x * ca - toCam.y * sa, toCam.x * sa + toCam.y * ca);
        vec2 right = vec2(f.y, -f.x);
        // wind: slow gusts rolling over the field + a small flutter per blade
        float gust = noise2(root.xz * 0.085 - uTime * vec2(0.5, 0.3));
        float sway = (gust - 0.3) * 1.25 + sin(uTime * 2.4 + iRnd.z * 6.283) * 0.1;
        vec2 lean = vec2(0.86, 0.5) * sway * 0.5 * uWind + vec2(cos(iRnd.z * 6.283), sin(iRnd.z * 6.283)) * 0.2;
        // someone walking through: the blades right at their feet part a little, nothing gets flattened
        vec2 away = root.xz - uWalker.xz;
        float wd = length(away);
        float push = (1.0 - smoothstep(0.08, uWalker.w, wd)) * (1.0 - smoothstep(1.0, 2.5, abs(root.y - uWalker.y)));
        lean += away / max(wd, 0.05) * push * 0.42;
        h *= 1.0 - 0.12 * push;
        // blades right in front of the lens would fill the screen: let them sink away
        h *= smoothstep(0.7, 2.4, distance(cameraPosition, root));
        float y = position.y;
        float w = uBlade.x * (0.85 + 0.3 * fract(iRnd.z * 7.0)) * (1.0 + dist * 0.03);    // far blades wider: thin blades would shimmer
        vec3 p = root;
        p.xz += right * (position.x * w) + lean * (h * y * y);
        p.y += h * y * (1.0 - 0.3 * min(dot(lean, lean), 1.6) * y);
        vY = y;
        vRoot = m.rgb;
        // tips: lighter and warmer, a sheen where a gust passes; dry and short on bare earth
        // (the tip is built from the ground colour, so shade pools and sunny drifts stay readable through the grass)
        float amt = (0.72 + 0.28 * tint + 0.3 * gust * uWind) * m.a;
        amt *= 1.0 - 0.45 * smoothstep(30.0, 70.0, dist);        // far away the field settles into the ground colour
        vTip = mix(m.rgb, mix(m.rgb * 1.2, uTip, 0.34), amt);
        vFade = length(root.xz - uMapRect.xy);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;`;

const BLADE_PARS = /* glsl */`
      ${NOISE}
      ${MAP_GLSL}
      attribute vec4 iRnd;       // turn (-1..1), height scale, phase (0..1), tint (-1..1)
      uniform float uTime, uWind;
      uniform vec2 uBlade;       // width, height
      uniform vec3 uTip;
      uniform vec4 uWalker;      // x, y, z of whoever walks through the grass, w = radius
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vRoot;        // ground colour under the blade
      varying vec3 vTip;
      varying float vY;
      varying float vFade;
      varying float vHaze;`;

const BLADE_FRAG = /* glsl */`
      uniform vec3 uFar, uHaze;
      uniform float uFadeA, uFadeB;
      varying vec3 vRoot;
      varying vec3 vTip;
      varying float vY;
      varying float vFade;
      varying float vHaze;
      void main() {
        vec3 col = mix(vRoot, vTip, smoothstep(0.12, 1.0, vY));
        col = mix(col, uHaze, vHaze);
        col = mix(col, uFar, smoothstep(uFadeA, uFadeB, vFade));
        gl_FragColor = vec4(col, 1.0);
      }`;

function bladeUniforms(map, { tip, far, fadeA, fadeB, bladeHeight, bladeWidth }) {
  return {
    uTime: shared.uTime, uWind: shared.uWind,
    uMap: { value: map.texture }, uMapRect: { value: map.rect },
    uTip: { value: rgb(tip) }, uFar: { value: rgb(far) }, uFadeA: { value: fadeA ?? map.radius * 0.55 }, uFadeB: { value: fadeB ?? map.radius * 0.97 },
    uBlade: { value: new THREE.Vector2(bladeWidth, bladeHeight) },
    uWalker: { value: new THREE.Vector4(0, -999, 0, 1) },
    ...HAZE_UNI(),
  };
}

// ---- grass that stays where it is planted (small scenes, showcases)
export function createFluffyGrass({
  map, heightAt = null, count = 180000, radius = 34, seed = 5,
  bladeHeight = 0.3, bladeWidth = 0.07, tip = '#d3e36c',
  far = '#eef5e4', fadeA = null, fadeB = null,
  cells = 6,            // the field is cut into cells x cells pieces so off-screen grass is skipped
} = {}) {
  const rng = mulberry32(seed * 733 + 11);
  const [cx, cz] = map.center;
  const group = new THREE.Group();
  group.name = 'fluffyGrass';
  const mat = new THREE.ShaderMaterial({
    uniforms: bladeUniforms(map, { tip, far, fadeA, fadeB, bladeHeight, bladeWidth }),
    vertexShader: /* glsl */`
      ${BLADE_PARS}
      attribute vec3 iRoot;      // where the blade stands
      void main() {
        vec3 root = (modelMatrix * vec4(iRoot, 1.0)).xyz;
        vec4 m = groundMap(root.xz);
        float h = uBlade.y * iRnd.y * smoothstep(0.1, 0.75, m.a);
        float tint = iRnd.w;
        ${BLADE_BODY}
      }`,
    fragmentShader: BLADE_FRAG,
    side: THREE.DoubleSide,
  });
  const blade = bladeGeometry();
  const cell = radius * 2 / cells;
  const buckets = Array.from({ length: cells * cells }, () => ({ root: [], rnd: [] }));
  const S = seed * 5 + 3;
  for (let n = 0; n < count; n++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * radius;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const turn = rng() * 2 - 1, phase = rng(), tint = rng() * 2 - 1, r4 = rng();
    if (map.grassAt(x, z) < 0.1) continue;
    // clumps: taller and shorter drifts make the carpet lumpy, i.e. fluffy; it also thins out at the rim
    const cn = fbm3(x * 0.55, 0.9, z * 0.55, S, 2);
    const clump = 0.62 + 0.8 * cn;
    const rim = 1 - sstep(radius * 0.8, radius, d);
    const hs = clump * (0.8 + 0.4 * r4) * (0.25 + 0.75 * rim);
    const b = buckets[Math.min(cells - 1, Math.floor((x - cx + radius) / cell)) + cells * Math.min(cells - 1, Math.floor((z - cz + radius) / cell))];
    b.root.push(x, heightAt ? heightAt(x, z) : 0, z);
    b.rnd.push(turn, hs, phase, Math.max(-1, Math.min(1, (cn - 0.5) * 3.2 + tint * 0.35)));   // tall clumps catch more light
  }
  let blades = 0;
  buckets.forEach((b, i) => {
    const n = b.root.length / 3;
    if (!n) return;
    blades += n;
    const g = new THREE.InstancedBufferGeometry();
    g.index = blade.index;
    g.setAttribute('position', blade.attributes.position);
    g.setAttribute('iRoot', new THREE.InstancedBufferAttribute(new Float32Array(b.root), 3));
    g.setAttribute('iRnd', new THREE.InstancedBufferAttribute(new Float32Array(b.rnd), 4));
    g.instanceCount = n;
    let y0 = Infinity, y1 = -Infinity;
    for (let k = 1; k < b.root.length; k += 3) { y0 = Math.min(y0, b.root[k]); y1 = Math.max(y1, b.root[k]); }
    const bx = cx - radius + (i % cells + 0.5) * cell, bz = cz - radius + (Math.floor(i / cells) + 0.5) * cell;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(bx, (y0 + y1) / 2, bz), Math.hypot(cell * 0.71, (y1 - y0) / 2) + bladeHeight * 2);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'fluffyGrassCell';
    group.add(mesh);
  });
  group.userData = {
    kind: 'fluffyGrass', blades,
    setWalker(pos, r = 0.55) { mat.uniforms.uWalker.value.set(pos.x, pos.y, pos.z, r); },
    dispose() { group.children.forEach(m => m.geometry.dispose()); blade.dispose(); mat.dispose(); },
  };
  return group;
}

// ---- grass that follows the player: a fixed pool of TUFTS (5 fine blades each) laid out on a square tile that wraps
// around a centre. Every tuft keeps its place in the world (it only jumps to the far side when the tile edge passes it,
// where it is already faded to nothing), so the grass never swims, and the cost stays the same however big the world is.
// Layers, back to front: dark ground between the roots -> a dense short carpet -> sparser tall tufts with light tips.
function tuftGeometry() {
  // 5 blades, each a soft two-segment leaf that can curve. aBlade = offset x, offset z (tuft units), height factor, turn
  const B = [[0, 0, 1.0, 0.0], [0.9, 0.25, 0.78, 0.9], [-0.75, 0.55, 0.7, -0.8], [0.2, -0.95, 0.62, 0.45], [-0.5, -0.7, 0.86, -0.35]];
  const pos = [], bl = [], idx = [];
  B.forEach((b, i) => {
    pos.push(-0.5, 0, 0, 0.5, 0, 0, -0.4, 0.5, 0, 0.4, 0.5, 0, 0, 1, 0);
    for (let k = 0; k < 5; k++) bl.push(...b);
    const o = i * 5; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3, o + 2, o + 3, o + 4);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 4));
  g.setIndex(idx);
  return g;
}

export function createFollowGrass({
  map, field, count = 200000, tile = 62, seed = 5,
  bladeHeight = 0.34, bladeWidth = 0.055, tuft = 0.11, tip = GRASS_TIP,
  far = '#eef5e4', fadeA = null, fadeB = null, thin = 1,        // thin > 1: fewer, wider blades (a lighter carpet that still closes)
} = {}) {
  const rng = mulberry32(seed * 733 + 11);
  map.area.set(map.center[0], map.center[1], tile);
  const uniforms = {
    ...bladeUniforms(map, { tip, far, fadeA, fadeB, bladeHeight, bladeWidth }),
    uHeight: { value: field.texture }, uHeightRect: { value: field.rect },
    uArea: { value: map.area }, uTuft: { value: tuft }, uPaint: map.paint,
    uThin: { value: thin },       // widens blades when fewer of them are drawn
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      ${NOISE}
      ${MAP_GLSL}
      ${LOOK_GLSL}
      attribute vec4 aBlade;     // this blade inside its tuft: offset x, offset z, height factor, turn
      attribute vec2 iCell;      // the tuft's place on the tile
      attribute vec4 iRnd;       // turn (-1..1), height scale, phase (0..1), tint (-1..1)
      uniform sampler2D uHeight;
      uniform vec4 uHeightRect;  // corner x, corner z, scale, offset
      uniform vec3 uArea;        // tile centre x, z, tile size
      uniform float uTime, uWind, uTuft, uThin, uPaint;
      uniform vec2 uBlade;       // width, height
      uniform vec3 uTip;
      uniform vec4 uWalker;      // x, y, z of whoever walks through the grass, w = radius
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vRoot;        // the dark between the roots
      varying vec3 vMid;         // ground colour
      varying vec3 vTip;
      varying float vY;
      varying float vFade;
      varying float vHaze;
      void main() {
        vec2 xz = mod(iCell - uArea.xy, uArea.z) - 0.5 * uArea.z + uArea.xy;
        float edge = 1.0 - smoothstep(uArea.z * 0.34, uArea.z * 0.49, length(xz - uArea.xy));
        float ground = texture2D(uHeight, (xz - uHeightRect.xy) * uHeightRect.z + uHeightRect.w).r;
        vec4 m = groundMap(xz);
        float cn = clumpAt(xz);
        // this blade's own root inside the tuft
        float ta = iRnd.x * 3.1416, tc = cos(ta), ts = sin(ta);
        vec2 off = vec2(aBlade.x * tc - aBlade.y * ts, aBlade.x * ts + aBlade.y * tc);
        vec3 root = vec3(xz.x + off.x * uTuft, ground, xz.y + off.y * uTuft);
        float h = uBlade.y * (0.6 + 0.85 * cn) * iRnd.y * aBlade.z * smoothstep(0.1, 0.75, m.a) * edge;
        vec3 toC = cameraPosition - root;
        float dist = length(toC.xz);
        h *= smoothstep(0.35, 1.2, length(toC));                // blades right in front of the lens sink away
        vec2 toCam = toC.xz / max(dist, 0.001);
        // face the camera, every blade turned a little differently
        float a = iRnd.x * 0.6 + aBlade.w * 0.75;
        float ca = cos(a), sa = sin(a);
        vec2 f = vec2(toCam.x * ca - toCam.y * sa, toCam.x * sa + toCam.y * ca);
        vec2 right = vec2(f.y, -f.x);
        // wind: slow gusts rolling over the field + a small flutter per blade; blades also splay out of their tuft
        float gust = noise2(xz * 0.085 - uTime * vec2(0.5, 0.3));
        float sway = (gust - 0.3) * 1.25 + sin(uTime * 2.4 + (iRnd.z + aBlade.w * 0.13) * 6.283) * 0.12;
        vec2 lean = vec2(0.86, 0.5) * sway * 0.5 * uWind + off * 0.42;
        // someone walking through: the blades right at their feet part a little, nothing gets flattened
        vec2 away = root.xz - uWalker.xz;
        float wd = length(away);
        float push = (1.0 - smoothstep(0.08, uWalker.w, wd)) * (1.0 - smoothstep(1.0, 2.5, abs(root.y - uWalker.y)));
        lean += away / max(wd, 0.05) * push * 0.42;
        h *= 1.0 - 0.12 * push;
        float y = position.y;
        float w = uThin * uBlade.x * (0.8 + 0.4 * fract(iRnd.z * 7.0)) * (1.0 + dist * 0.035) * (1.0 + 0.4 * uPaint);     // far blades wider: thin blades would shimmer
        vec3 p = root;
        p.xz += right * (position.x * w) + lean * (h * y * y);            // y squared: the blade arcs over instead of tilting stiffly
        p.y += h * y * (1.0 - 0.3 * min(dot(lean, lean), 1.6) * y);
        vY = y;
        vRoot = rootColor(m);
        vMid = m.rgb;
        // tips: lighter and warmer; tall clumps and tall blades catch more light; a sheen where a gust passes
        float tint = clamp((cn - 0.5) * 2.6 + iRnd.w * 0.45 + (aBlade.z - 0.8) * 0.9, -1.0, 1.0);
        float amt = clamp(0.7 + 0.34 * tint + 0.3 * gust * uWind, 0.0, 1.15) * m.a;
        vTip = mix(m.rgb, tipColor(m.rgb, uTip), amt);
        // painterly: the whole tuft takes ONE flat tone, chosen by the brush stroke it stands in.
        // The tone never changes with the wind (tufts hopping between flat tones would flicker); a gust only adds a soft sheen.
        float v = cn * 0.45 + strokeAt(xz) * 0.55 + iRnd.w * 0.05 + step(1.2, iRnd.y) * 0.1;
        vec3 dab = mix(m.rgb, dabColor(m.rgb, uTip, v), m.a) * (1.0 + 0.07 * (gust - 0.4) * uWind);
        vMid = mix(vMid, dab, uPaint);
        vTip = mix(vTip, dab, uPaint);
        vFade = length(root.xz - uMapRect.xy);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uFar, uHaze;
      uniform float uFadeA, uFadeB, uPaint;
      varying vec3 vRoot;
      varying vec3 vMid;
      varying vec3 vTip;
      varying float vY;
      varying float vFade;
      varying float vHaze;
      void main() {
        // three stops up the blade: shadow at the root, the ground's own green, a sunlit tip
        vec3 col = mix(vRoot, vMid, smoothstep(0.0, mix(0.42, 0.22, uPaint), vY));
        col = mix(col, vTip, smoothstep(0.3, 1.0, vY));
        col = mix(col, uHaze, vHaze);
        col = mix(col, uFar, smoothstep(uFadeA, uFadeB, vFade));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  const base = tuftGeometry();
  const cell = new Float32Array(count * 2), rnd = new Float32Array(count * 4);
  for (let n = 0; n < count; n++) {
    cell[n * 2] = rng() * tile; cell[n * 2 + 1] = rng() * tile;
    const tall = rng() < 0.16;                          // the upper layer: fewer, taller, lighter
    rnd[n * 4] = rng() * 2 - 1; rnd[n * 4 + 1] = tall ? 1.35 + 0.55 * rng() : 0.7 + 0.4 * rng(); rnd[n * 4 + 2] = rng();
    rnd[n * 4 + 3] = tall ? 0.3 + 0.7 * rng() : rng() * 2 - 1;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('aBlade', base.attributes.aBlade);
  g.setAttribute('iCell', new THREE.InstancedBufferAttribute(cell, 2));
  g.setAttribute('iRnd', new THREE.InstancedBufferAttribute(rnd, 4));
  g.instanceCount = count;
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'followGrass';
  mesh.frustumCulled = false;          // the shader decides where the blades are
  let density = 1;
  mesh.userData = {
    kind: 'followGrass', tufts: count, blades: count * 5,
    // centre the tile a little ahead of the walker, in the direction the camera looks, so most blades are on screen
    follow(pos, lookDir = null, lead = 0.24) {
      let x = pos.x, z = pos.z;
      if (lookDir) { const l = Math.hypot(lookDir.x, lookDir.z) || 1; x += lookDir.x / l * tile * lead; z += lookDir.z / l * tile * lead; }
      map.area.set(x, z, tile);
      uniforms.uWalker.value.set(pos.x, pos.y, pos.z, 0.55);
    },
    // draw only part of the pool (0.2..1); the blades that remain get wider so the carpet stays closed
    setDensity(d) {
      density = Math.min(1, Math.max(0.2, d));
      g.instanceCount = Math.round(count * density);
      uniforms.uThin.value = thin / Math.sqrt(density);
    },
    get density() { return density; },
    setPainterly(on) { map.paint.value = on ? 1 : 0; },
    get painterly() { return map.paint.value > 0.5; },
    dispose() { g.dispose(); base.dispose(); mat.dispose(); map.area.z = 0; },
  };
  return mesh;
}
