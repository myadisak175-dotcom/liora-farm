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
//     (ring: few, coarse tufts on past the tile, out to a hundred metres; beyond: blades on land past the map's own.
//      See createFollowGrass.)
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
  grow = [],            // [x, z, radius]                 grass after all, in its own colour: e.g. on the tops of rocks, where the
                        // grass's height says the rock's top (bare and shade under the rock are for the ground beneath it)
  lawn = false,         // also keep the grass's own colour everywhere, as if nothing were painted over it (map.lawnTexture,
                        // map.lawnAt(x, z)): for things that grow grass of their own, e.g. the tops of rocks
} = {}) {
  const C = {};
  for (const k in GROUND_COLORS) C[k] = toRGB(colors[k] || GROUND_COLORS[k]);
  const data = new Uint8Array(size * size * 4), lawnData = lawn || grow.length ? new Uint8Array(size * size * 4) : null;
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
      if (lawnData) lawnData.set([col[0], col[1], col[2], 255], (j * size + i) * 4);
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
  stamp(grow, (o, d) => {                                                      // grass after all: the grass's own colour
    const k = 1 - sstep(0.6, 1, d);
    data[o] = lerp(data[o], lawnData[o], k); data[o + 1] = lerp(data[o + 1], lawnData[o + 1], k); data[o + 2] = lerp(data[o + 2], lawnData[o + 2], k);
  });
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
  stamp(grow, (o, d) => { data[o + 3] = Math.max(data[o + 3], 255 * (1 - sstep(0.6, 1, d))); });

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
    cov.set(nc); data.set(stage);
    if (!sendInStrips()) { texture.needsUpdate = true; castTex.needsUpdate = true; }
    job = null;
    return true;
  };
  // SENT A STRIP AT A TIME. The new shadows used to go to the GPU whole, both pictures at once (at 1280 a side 6.5 MB of
  // colour and 1.6 MB of shadow), on the frame they were done: with the clock running some every 9 seconds, and on an
  // iPhone a freeze each time (27 Nov 2026: "บนไอโฟน ไอแพด กระตุกมาก"). A level that calls send(renderer) every frame has
  // them sent STRIP rows a frame instead: the new shadows come in across the map from one edge to the other in half a
  // second, the sun having moved a few degrees. Without send (or before the pictures were first sent whole) as before.
  // A picture sent whole meanwhile (texture.needsUpdate: a stroke of the path brush, her farm's beds) carried the new
  // shadows with it: its strips stop there. sending: strips are still on their way
  const STRIP = 80;
  let sendR = null, strips = null;
  const sentWhole = t => { const p = sendR.properties.get(t); return !!p.__webglTexture && p.__version === t.version; };
  const sendInStrips = () => {
    if (!sendR || !sentWhole(texture) || !sentWhole(castTex)) return false;
    strips = { row: 0, of: [{ t: texture, bytes: 4, v: texture.version }, { t: castTex, bytes: 1, v: castTex.version }] };
    return true;
  };
  const send = renderer => {
    sendR = renderer;
    if (!strips) return;
    const gl = renderer.getContext(), y0 = strips.row, y1 = Math.min(size, y0 + STRIP);
    for (const s of strips.of) {
      if (s.t.version !== s.v) continue;                                         // (sent whole meanwhile)
      renderer.state.bindTexture(gl.TEXTURE_2D, renderer.properties.get(s.t).__webglTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, s.bytes === 4 ? 4 : 1);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, size, y1 - y0, s.bytes === 4 ? gl.RGBA : gl.RED, gl.UNSIGNED_BYTE, s.t.image.data, y0 * size * s.bytes);
    }
    strips.row = y1;
    if (y1 >= size) strips = null;
  };
  let lawnTexture = null, lawnAt = null;
  if (lawn) {
    lawnTexture = new THREE.DataTexture(lawnData, size, size, THREE.RGBAFormat);
    lawnTexture.colorSpace = THREE.NoColorSpace; lawnTexture.magFilter = lawnTexture.minFilter = THREE.LinearFilter;
    lawnTexture.wrapS = lawnTexture.wrapT = THREE.ClampToEdgeWrapping; lawnTexture.needsUpdate = true;
    lawnAt = (x, z) => {
      const i = Math.min(size - 1, Math.max(0, Math.floor((x - cx + radius) / span * size))), j = Math.min(size - 1, Math.max(0, Math.floor((z - cz + radius) / span * size))), o = (j * size + i) * 4;
      return [lawnData[o] / 255, lawnData[o + 1] / 255, lawnData[o + 2] / 255];
    };
  }
  // area: where the live grass currently is (centre x, centre z, tile size; 0 = no follow-grass). Ground and grass share it.
  return { texture, cast: castTex, castTint, beginCast, stepCast, send, get sending() { return !!strips; }, data, size, radius, center: [cx, cz], rect: new THREE.Vector3(cx, cz, 1 / span), area: new THREE.Vector3(0, 0, 0), paint: { value: 0 }, grassAt, lawnTexture, lawnAt, dispose() { texture.dispose(); castTex.dispose(); if (lawnTexture) lawnTexture.dispose(); } };
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
// DRY GROUND: land under the curse. The ground map is a living meadow's; where the dryness picture says the land is dead
// (stylized-nature's setDryness: the picture the trees die by) the same spot is read as dry ground instead, by the
// blades and by every paint that lays the meadow in (dryGround, below): bare dry earth, and dry grass still standing
// in patches over about a quarter of it, in straw tones with nothing green left in them (the tips, the deep tone and
// the dark between the roots have their dry colours too). What the map has bare stays bare, and where a shadow lies in
// the map it lies on the dry ground. Nothing is baked: change the picture and the land dries or comes back to life.
// A material that takes LOOK_GLSL takes GRASS_DRY's uniforms with it.
export const DRY_GROUND = {
  earth: '#9d917b',      // the bare dry earth, seen from afar (the middle of the painted earth: tools/make-path-paint.py dry)
  straw: ['#8f8361', '#b3a57c'],      // dry grass's ground, in drifts: deeper, paler
  tip: '#d4caad',        // a dry blade's tip
};
export const GRASS_DRY = {
  uDryMap: shared.uDryMap, uDryRect: shared.uDryRect,
  uDryEarth: { value: rgb(DRY_GROUND.earth) }, uDryStrawA: { value: rgb(DRY_GROUND.straw[0]) }, uDryStrawB: { value: rgb(DRY_GROUND.straw[1]) },
  uDryTip: { value: rgb(DRY_GROUND.tip) },
};
// GLSL shared by ground and follow-grass, so that what the ground paints between and beyond the blades matches them:
//   clumpAt  : lumpy drifts (taller, lighter grass)        tipColor : what a blade tip looks like on this ground
//   dryAt    : how dead the land is at a spot (0..1)       dryGround, mapShade : see DRY GROUND
const LOOK_GLSL = /* glsl */`
uniform sampler2D uDryMap;
uniform vec4 uDryRect;
uniform vec3 uDryEarth, uDryStrawA, uDryStrawB, uDryTip;
float dryAt(vec2 xz) { return texture2D(uDryMap, clamp((xz - uDryRect.xy) * uDryRect.zw, 0.0, 1.0)).r; }
// how much of a shadow lies on this spot of the living map (by how dark it is: its greens are never as dark as their shade)
float mapShade(vec3 ground) { return 1.0 - smoothstep(0.34, 0.47, dot(ground, vec3(0.3, 0.6, 0.1))); }
vec4 dryGround(vec4 m, vec2 xz, float dry) {
  if (dry <= 0.0) return m;
  float n = noise2(xz * 0.06 + 11.0) * 0.55 + noise2(xz * 0.17 + 3.0) * 0.3 + noise2(xz * 0.6 + 7.0) * 0.15;
  float stands = smoothstep(0.56, 0.63, n);                     // where dry grass still stands: ragged patches, and a tuft here and there
  vec3 straw = mix(uDryStrawA, uDryStrawB, smoothstep(0.3, 0.7, noise2(xz * 0.045 + 21.0)));
  vec3 c = mix(uDryEarth, straw, stands * smoothstep(0.05, 0.4, m.a));
  c *= mix(vec3(1.0), vec3(0.62, 0.68, 0.8), mapShade(m.rgb) * 0.85);
  return mix(m, vec4(c, m.a * stands * 0.9), dry);
}
float clumpAt(vec2 xz) { return noise2(xz * 0.6) * 0.65 + noise2(xz * 1.7 + 9.0) * 0.35; }
vec3 tipColor(vec3 ground, vec3 tip, float dry) { return mix(ground * 1.17, mix(tip, uDryTip, dry), 0.3); }
// between the roots: deeper and cooler, not just darker (plain darkening turns yellow-green into mud); dry: plainly darker
vec3 rootColor(vec4 m, float dry) { return m.rgb * mix(vec3(1.0), mix(vec3(0.7, 0.9, 0.9), vec3(0.74, 0.72, 0.7), dry), m.a); }
// painterly look: the field is laid in with a few flat tones, in long dabs that all lean the same way like brush strokes
float strokeAt(vec2 xz) {
  vec2 q = vec2(xz.x * 0.82 + xz.y * 0.57, -xz.x * 0.57 + xz.y * 0.82);
  return noise2(vec2(q.x * 0.55, q.y * 1.9)) * 0.6 + noise2(vec2(q.x * 1.5 + 5.0, q.y * 4.6)) * 0.4;
}
vec3 dabColor(vec3 ground, vec3 tip, float v, float dry) {
  vec3 light = tipColor(ground, tip, dry);
  vec3 c = ground * mix(vec3(0.8, 0.94, 0.9), vec3(0.8, 0.78, 0.76), dry);      // deep
  c = mix(c, ground, step(0.4, v));                             // local green
  c = mix(c, mix(ground, light, 0.62), step(0.52, v));          // light
  c = mix(c, light, step(0.71, v));                             // sunlit accents, used sparingly
  return c;
}`;
// (the land's own paint lays the far meadow in with these, so that it is the near one seen from afar: stylized-terrain.js, grassLook)
export const GRASS_LOOK_GLSL = LOOK_GLSL;

export function groundMaterial(map, { far = '#eef5e4', fadeA = null, fadeB = null, radius = null, tip = GRASS_TIP } = {}) {
  const R = radius || map.radius;
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map.texture }, uMapRect: { value: map.rect }, uArea: { value: map.area }, uTip: { value: rgb(tip) }, uPaint: map.paint,
      uFar: { value: rgb(far) }, uFadeA: { value: fadeA ?? R * 0.55 }, uFadeB: { value: fadeB ?? R * 0.97 },
      ...HAZE_UNI(), ...GRASS_DRY,
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
        float dry = dryAt(vWP.xz);
        vec4 m = dryGround(groundMap(vWP.xz), vWP.xz, dry);
        vec3 col = m.rgb;
        // a little grain on bare earth only
        col *= 1.0 - (1.0 - m.a) * 0.07 * (noise2(vWP.xz * 2.3) - 0.5) * 2.0;
        if (uArea.z > 0.0) {
          // where live grass stands: the dark layer between the roots.  beyond it: the look of grass seen from afar
          float under = 1.0 - smoothstep(uArea.z * 0.3, uArea.z * 0.47, length(vWP.xz - uArea.xy));
          float cn = clumpAt(vWP.xz);
          vec3 afar = mix(m.rgb, tipColor(m.rgb, uTip, dry), (0.3 + 0.5 * cn) * m.a);
          afar *= 1.0 + (noise2(vWP.xz * 4.0) - 0.5) * 0.1 * m.a * (1.0 - uPaint);  // brushy grain so distant meadow is not flat
          afar = mix(afar, mix(m.rgb, dabColor(m.rgb, uTip, cn * 0.45 + strokeAt(vWP.xz) * 0.55, dry), m.a), uPaint);
          col = mix(afar, rootColor(vec4(col, m.a), dry), under);
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
        // wind: slow gusts rolling over the field + a small flutter per blade (a hard wind, uWind over 1: the gusts roll by faster)
        float gust = noise2(root.xz * 0.085 - uTime * vec2(0.5, 0.3) * (1.0 + max(uWind - 1.0, 0.0) * 0.8));
        float sway = (gust - 0.3) * 1.25 + sin(uTime * 2.4 + iRnd.z * 6.283) * 0.1;
        vec2 lean = vec2(0.86, 0.5) * sway * 0.5 * uWind + vec2(cos(iRnd.z * 6.283), sin(iRnd.z * 6.283)) * 0.2;
        // someone walking through: the blades right at their feet part a little, nothing gets flattened
        vec2 away = root.xz - uWalker.xz;
        float wd = length(away);
        float push = (1.0 - smoothstep(0.08, uWalker.w, wd)) * (1.0 - smoothstep(1.0, 2.5, abs(root.y - uWalker.y)));
        lean += away / max(wd, 0.05) * push * 0.42;
        h *= 1.0 - 0.12 * push;
        // a blast running out over the field (uBlast, none as it starts): the blades its front is passing are thrown flat,
        // away from its middle, and those behind it are still coming back up
        vec2 blown = root.xz - uBlast.xy;
        float bd = length(blown), behind = uBlast.z - bd;                   // metres behind its front (less than 0: ahead of it)
        float blow = uBlast.w * (behind > 0.0 ? exp(-behind / 5.5) : exp(behind / 0.5));
        lean += blown / max(bd, 0.05) * blow * 1.5;
        h *= 1.0 - 0.3 * min(blow, 1.0);
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
      uniform vec4 uBlast;       // a blast over the field: x, z of its middle, how far out its front is (metres), how hard it blows (0: none)
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
    uBlast: { value: new THREE.Vector4(0, 0, 0, 0) },
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
    // a blast running out over the field from (x, z): its front `front` metres out now, blowing `power` hard (0..1; 0: none).
    // The blades its front is passing are thrown flat away from its middle, and come back up behind it
    setBlast(x, z, front, power) { mat.uniforms.uBlast.value.set(x, z, front, power); },
    dispose() { group.children.forEach(m => m.geometry.dispose()); blade.dispose(); mat.dispose(); },
  };
  return group;
}

// ---- grass that follows the player: a fixed pool of TUFTS (5 fine blades each) laid out on a square tile that wraps
// around a centre. Every tuft keeps its place in the world (it only jumps to the far side when the tile edge passes it,
// where it is already faded to nothing), so the grass never swims, and the cost stays the same however big the world is.
// Layers, back to front: dark ground between the roots -> a dense short carpet -> sparser tall tufts with light tips.
// a tuft's blades: offset x, offset z (tuft units), height factor, turn. A far tuft is the first three of them
const TUFT_BLADES = [[0, 0, 1.0, 0.0], [0.9, 0.25, 0.78, 0.9], [-0.75, 0.55, 0.7, -0.8], [0.2, -0.95, 0.62, 0.45], [-0.5, -0.7, 0.86, -0.35]];
function tuftGeometry() {
  // 5 blades, each a soft two-segment leaf that can curve. aBlade: see TUFT_BLADES; aSpare: 1 on the two blades a far tuft has not
  const pos = [], bl = [], spare = [], idx = [];
  TUFT_BLADES.forEach((b, i) => {
    pos.push(-0.5, 0, 0, 0.5, 0, 0, -0.4, 0.5, 0, 0.4, 0.5, 0, 0, 1, 0);
    for (let k = 0; k < 5; k++) { bl.push(...b); spare.push(i < 3 ? 0 : 1); }
    const o = i * 5; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3, o + 2, o + 3, o + 4);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 4));
  g.setAttribute('aSpare', new THREE.Float32BufferAttribute(spare, 1));
  g.setIndex(idx);
  return g;
}
// a tuft as it is drawn far from the walker: the full tuft's first 3 blades, one flat triangle each (3 triangles where the
// full tuft has 15). At that distance a blade is a few pixels wide and the whole tuft one flat tone
function farTuftGeometry() {
  const pos = [], bl = [], spare = [], idx = [];
  TUFT_BLADES.slice(0, 3).forEach((b, i) => {
    pos.push(-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0);
    for (let k = 0; k < 3; k++) { bl.push(...b); spare.push(0); }
    const o = i * 3; idx.push(o, o + 1, o + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(bl, 4));
  g.setAttribute('aSpare', new THREE.Float32BufferAttribute(spare, 1));
  g.setIndex(idx);
  return g;
}

// NEAR AND FAR (farLod, on by default): the full tufts are drawn only round the walker, the rest of the tile as far tufts
// (above), a little under half the triangles. Nothing is seen to change over, because it is ONE tuft that is drawn either way:
//   - the tile is the same quarter of it laid out four times over, so the tufts round the walker (that quarter, on its own
//     small tile about her) stand exactly where the big pool's do, and are the same tufts
//   - going out from her (uMorph: from x to y) a full tuft turns INTO its far shape, little by little: its two spare blades
//     sink away, the other three widen and straighten until each lies exactly on the far tuft's flat triangle
//   - only there, where the two shapes are one and the same, is the far tuft drawn in the full one's place (uMorph.z)
// userData.setFarLod(false): every tuft in full, as it was.
//
// THE RING (ring: { tile, count, width, spread, height, lead }; none without it): past the tile the meadow does not go bare.
// A third pool of far tufts stands on a tile of its own, several times as wide (tile: its size; they are seen out to a
// little under half of it), few and coarse: count of them on all of it, each as broad as a clump (width: its blades this
// many times a far blade's; spread: its three blades stand this many times further apart; height). A ring tuft comes up
// where the tile's own tufts thin out, one for one at distances of their own, and thins out the same way at the ring's own
// edge: so nothing is seen to begin or end. userData.setRing(false): without it.
//
// ONLY WHAT IS IN VIEW: every tuft of the pools is sent every frame, and the shader used to work each one out in full
// (the ground's map, the noise, the wind) though from where she stands well over half of them are behind the camera, to
// the side of it, or past where their kind is drawn at all. So the shader first finds where the tuft stands (cheap) and
// folds it away at once when it is not drawn there (edge 0), or when no blade of it can reach into the camera's view (a
// ball round it, wider and taller than any blade can bend, wholly past a side of the view or behind the camera; the
// ground's height from the height field, with room under and over it). The camera is whichever draws: the water's
// mirror too. Only for a camera with perspective. For this to save anything the tufts that a phone's GPU works on
// together (its next few in the pool) must stand together: so each pool is in order of place on its tile (a Z-order
// curve), within eighths of the pool (setDensity keeps whole eighths: the thinning stays even, and a near tuft and its
// far tuft are kept or dropped together). The picture is the same. ?grasscull=0: as before, every tuft in full.
// And a tuft where no blade grows (the ground's map says so: a way, sand, a field, the water) stands zero high, each of its
// blades a line on the ground that draws nothing: it is folded away too, once the map is read, before the rest. The same
// picture.
//
// FEWER FAR OFF (setFarKeep(far, ring); 27 Nov 2026, for the phone that heats: "ลดรายละเอียดที่อยู่ไกล"): of the tufts
// drawn, only the share far has its far tuft drawn, and the ring only the share ring of its own, each in whole eighths
// of its pool; the blades of those that are drawn are as much wider, so the carpet is as closed. A near tuft whose far
// tuft is not drawn sinks away as it turns (between uMorph's x and y), so nothing is seen to go where the far ones begin;
// round her every tuft is drawn as before. Which near tufts: by their place in the near pool (its first eighths are
// kept), as the far pool's first eighths are their four copies. setFarKeep(1, 1): all of them, as it was.
//
// PAST THE LAND (beyond: { sheet, rect, land, greens, lean, shade, shadeRect, shadeTint, shadeK }; nothing without it): the
// map and the heights speak for the land only (land: x0, z0, x1, z1). Where the land runs on past that (map-rim.js) the
// tufts stand on what the sheet says: a picture of that ground (rect: centre x, z, 1 / its size) with, in r g b a, its
// height, how much grass grows (none on rock or on a way), how deep in a wood it lies, and how its slope leans to the sun.
// Their colour there is the ground's own, made as the ground's paint makes it (stylized-terrain.js, grassLook: the three
// greens in broad drifts, lean, the trees' shadows from shade), so the tufts come up out of ground of their colour.
// a pool put in order of place on its tile (ONLY WHAT IS IN VIEW): by eighth of the pool first (eighth(t): which eighth
// tuft t, in the pool's own order, is in), then along a Z-order curve over the tile
function inPlaceOrder(pool, size, eighth) {
  const n = pool.n, c = pool.iCell.array, r = pool.iRnd.array, key = new Float64Array(n);
  const spread = v => { v &= 1023; v = (v | (v << 8)) & 0x00ff00ff; v = (v | (v << 4)) & 0x0f0f0f0f; v = (v | (v << 2)) & 0x33333333; return (v | (v << 1)) & 0x55555555; };
  for (let t = 0; t < n; t++) {
    const x = Math.min(1023, Math.max(0, Math.floor(c[t * 2] / size * 1024))), z = Math.min(1023, Math.max(0, Math.floor(c[t * 2 + 1] / size * 1024)));
    key[t] = eighth(t) * 2097152 + (spread(x) | (spread(z) << 1));
  }
  const order = Uint32Array.from({ length: n }, (_, t) => t).sort((a, b) => key[a] - key[b]);
  const c2 = new Float32Array(n * 2), r2 = new Float32Array(n * 4);
  for (let t = 0; t < n; t++) { const o = order[t]; c2[t * 2] = c[o * 2]; c2[t * 2 + 1] = c[o * 2 + 1]; for (let q = 0; q < 4; q++) r2[t * 4 + q] = r[o * 4 + q]; }
  c.set(c2); r.set(r2);
}

export function createFollowGrass({
  map, field, count = 200000, tile = 62, seed = 5,
  bladeHeight = 0.34, bladeWidth = 0.055, tuft = 0.11, tip = GRASS_TIP,
  far = '#eef5e4', fadeA = null, fadeB = null, thin = 1,        // thin > 1: fewer, wider blades (a lighter carpet that still closes)
  farLod = true, farWidth = 1.7,                                // farWidth: a far tuft's blades are this much wider (three stand for five)
  ring = null, beyond = null,
  paving = null,                                                // { glsl, uniforms }: flat stones laid in the ways (ground-paths.js, onLand(...).grass): see PAVING
} = {}) {
  const rng = mulberry32(seed * 733 + 11);
  const nearTile = tile / 2;                                    // the quarter that the tile repeats: the full tufts' own tile
  map.area.set(map.center[0], map.center[1], tile);
  const uniforms = {
    ...bladeUniforms(map, { tip, far, fadeA, fadeB, bladeHeight, bladeWidth }), ...GRASS_DRY,
    uHeight: { value: field.texture }, uHeightRect: { value: field.rect },
    uArea: { value: map.area }, uTuft: { value: tuft }, uPaint: map.paint,
    uThin: { value: thin },       // widens blades when fewer of them are drawn
    uNear: { value: new THREE.Vector4(map.center[0], map.center[1], nearTile, farWidth) },      // the near tufts' tile: centre x, z, size; w: a far blade's extra width
    uMorph: { value: new THREE.Vector3(nearTile * 0.26, nearTile * 0.47, nearTile * 0.47) },     // from the walker: a full tuft starts turning into its far shape, has turned; the far tuft is drawn from here on (inside the near tile's half width)
    uRing: { value: new THREE.Vector3(map.center[0], map.center[1], ring ? ring.tile : 0) },   // the ring's tile: centre x, z, size
    uRingLook: { value: new THREE.Vector3(ring ? ring.width ?? 1.6 : 1, ring ? ring.spread ?? 3 : 1, ring ? ring.height ?? 1.1 : 1) },      // a ring tuft's blades: so many times as wide, as far apart, as tall
    uCull: { value: typeof location !== 'undefined' && new URLSearchParams(location.search).get('grasscull') === '0' ? 0 : 1 },     // ONLY WHAT IS IN VIEW (?grasscull=0: off)
    uFarKeep: { value: new THREE.Vector3(1e9, 1, 1) },      // FEWER FAR OFF: x the near tufts from this one on have no far tuft; y how much wider a far blade is for it, z a ring blade
  };
  if (paving) Object.assign(uniforms, paving.uniforms);
  if (beyond) Object.assign(uniforms, {
    uBeyond: { value: beyond.sheet }, uBeyondRect: { value: beyond.rect }, uLand: { value: new THREE.Vector4(...beyond.land) },
    uBeyondDeep: { value: rgb(beyond.greens[0]) }, uBeyondMid: { value: rgb(beyond.greens[1]) }, uBeyondSunny: { value: rgb(beyond.greens[2]) }, uBeyondLean: { value: beyond.lean ?? 1.2 },
    uBeyondShade: { value: beyond.shade }, uBeyondShadeRect: { value: beyond.shadeRect }, uBeyondShadeTint: { value: beyond.shadeTint }, uBeyondShadeK: beyond.shadeK,
  });
  const mat = new THREE.ShaderMaterial({
    uniforms,
    defines: { ...(beyond ? { BEYOND: 1 } : {}), ...(paving ? { PAVING: 1 } : {}) },
    vertexShader: /* glsl */`
      ${NOISE}
      ${MAP_GLSL}
      ${LOOK_GLSL}
      ${paving ? paving.glsl : ''}
      attribute vec4 aBlade;     // this blade inside its tuft: offset x, offset z, height factor, turn
      attribute vec2 iCell;      // the tuft's place on the tile
      attribute vec4 iRnd;       // turn (-1..1), height scale, phase (0..1), tint (-1..1)
      attribute float aLod;      // 0: a full tuft of the whole pool (no near and far)   1: a far tuft   2: a near tuft, on its own tile   3: a tuft of the ring
      attribute float aSpare;    // 1: one of the two blades a far tuft has not
      uniform sampler2D uHeight;
      uniform vec4 uHeightRect;  // corner x, corner z, scale, offset
      uniform vec3 uArea;        // tile centre x, z, tile size
      uniform vec4 uNear;        // the near tufts' tile: centre x, z, size; w = how much wider a far tuft's blades are
      uniform vec3 uMorph;       // distance from the walker: a full tuft starts turning into its far shape, has turned, the far tuft takes its place
      uniform vec3 uRing;        // the ring's tile: centre x, z, size
      uniform vec3 uRingLook;    // a ring tuft's blades: so many times as wide, as far apart, as tall
      #ifdef BEYOND
        uniform sampler2D uBeyond, uBeyondShade;      // past the land: that ground (height, grass, wood, lean); its trees' shadows
        uniform vec3 uBeyondRect, uBeyondShadeRect, uBeyondShadeTint, uBeyondDeep, uBeyondMid, uBeyondSunny;
        uniform vec4 uLand;      // the land the map and the heights speak for: x0, z0, x1, z1
        uniform float uBeyondLean, uBeyondShadeK;
      #endif
      uniform float uTime, uWind, uTuft, uThin, uPaint;
      uniform vec2 uBlade;       // width, height
      uniform vec3 uTip;
      uniform vec4 uWalker;      // x, y, z of whoever walks through the grass, w = radius
      uniform float uCull;       // 1: a tuft out of view is folded away before its heavy part (ONLY WHAT IS IN VIEW)
      uniform vec3 uFarKeep;     // FEWER FAR OFF: x the near tufts from this one on have no far tuft; y a far blade's widening for it, z a ring blade's
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vRoot;        // the dark between the roots
      varying vec3 vMid;         // ground colour
      varying vec3 vTip;
      varying float vY;
      varying float vFade;
      varying float vHaze;
      void main() {
        float ringed = step(2.5, aLod);
        vec3 area = aLod > 2.5 ? uRing : aLod > 1.5 ? uNear.xyz : uArea;
        vec2 xz = mod(iCell - area.xy, area.z) - 0.5 * area.z + area.xy;
        // the tile's edge: the grass thins out a tuft at a time, each at a distance of its own (its phase), over the tile's last
        // third. (All at one distance they came up together as she walked: a line of grass rising, running ahead of her)
        float own = mix(0.30, 0.43, fract(iRnd.z * 37.0 + 0.61));
        float edge = 1.0 - smoothstep(uArea.z * own, uArea.z * (own + 0.06), length(xz - uArea.xy));
        float walk = length(xz - uNear.xy);
        // a tuft of the ring: up where the tile's own are down, by the same rule; and down again at the ring's own edge. (None
        // near her: the tile lies ahead of her, so behind her its tufts thin out a few steps off, and a coarse tuft is for afar)
        if (aLod > 2.5) edge = (1.0 - edge) * (1.0 - smoothstep(uRing.z * own, uRing.z * (own + 0.06), length(xz - uRing.xy))) * smoothstep(uMorph.z, uMorph.z * 1.4, walk);
        // near and far: a near tuft is the far tuft that stands on the same spot (see NEAR AND FAR above). turned: how far it
        // has turned into the far shape, 0 the full tuft .. 1 the far one. Past uMorph.z the far tuft is drawn and the near one not
        float turned = aLod < 0.5 ? 0.0 : (aLod < 1.5 || aLod > 2.5) ? 1.0 : smoothstep(uMorph.x, uMorph.y, walk);
        if (aLod > 0.5 && aLod < 2.5) edge *= aLod < 1.5 ? step(uMorph.z, walk) : 1.0 - step(uMorph.z, walk);
        // ONLY WHAT IS IN VIEW: not drawn here at all, or out of this camera's view: folded away now (off the screen, so not
        // a pixel of it is drawn), before the heavy part
        if (uCull > 0.5) {
          if (edge <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          if (projectionMatrix[3][3] < 0.5) {
            float g0 = texture2D(uHeight, (xz - uHeightRect.xy) * uHeightRect.z + uHeightRect.w).r;
            vec4 lowP = vec4(xz.x, g0 - 3.0, xz.y, 1.0), highP = vec4(xz.x, g0 + 2.0, xz.y, 1.0);
            vec3 vl = (viewMatrix * lowP).xyz, vh = (viewMatrix * highP).xyz;
            float depth = max(-vl.z, -vh.z), tH = 1.0 / projectionMatrix[0][0], reach = 2.0;
            if (depth < -reach || max(abs(vl.x), abs(vh.x)) > depth * tH + reach * sqrt(1.0 + tH * tH)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          }
        }
        float ground;
        vec4 m;
        #ifdef BEYOND
          vec2 inl = clamp(xz, uLand.xy, uLand.zw);
          float past = length(xz - inl);
          if (past > 0.0) {
            // past the land (see PAST THE LAND above): the ground's height and colour as that ground has them
            vec4 by = texture2D(uBeyond, (xz - uBeyondRect.xy) * uBeyondRect.z + 0.5);
            ground = by.r;
            float dn = noise2(xz * 0.05) * 0.75 + noise2(xz * 0.19 + 3.0) * 0.25;
            float dt = clamp(smoothstep(0.38, 0.62, dn) + by.a * uBeyondLean, 0.0, 1.0);
            vec3 wild = dt < 0.5 ? mix(uBeyondDeep, uBeyondMid, dt * 2.0) : mix(uBeyondMid, uBeyondSunny, dt * 2.0 - 1.0);
            m = mix(groundMap(inl), vec4(wild, 1.0), smoothstep(0.5, 9.0, past));
            m.rgb *= mix(vec3(1.0), uBeyondShadeTint, texture2D(uBeyondShade, (xz - uBeyondShadeRect.xy) * uBeyondShadeRect.z + 0.5).r * uBeyondShadeK);
            // none in a wood: its edge is ragged, as that ground paints it
            float wd = by.b + (noise2(xz * 0.9) * 0.5 + noise2(xz * 3.0) * 0.25 - 0.37) * 0.45 + (noise2(xz * 0.11 + 4.0) - 0.5) * 0.6;
            m.a *= by.g * (1.0 - smoothstep(0.32, 0.5, wd));
          } else {
            ground = texture2D(uHeight, (xz - uHeightRect.xy) * uHeightRect.z + uHeightRect.w).r;
            m = groundMap(xz);
          }
        #else
          ground = texture2D(uHeight, (xz - uHeightRect.xy) * uHeightRect.z + uHeightRect.w).r;
          m = groundMap(xz);
        #endif
        #ifdef PAVING
          // PAVING (ground-paths.js): where flat stones are laid in a way, none of the tuft's blades stands on a slab, and short
          // grass comes up between them: each blade is asked where it stands. (Not a ring tuft: that is a whole clump, for afar)
          if (ringed < 0.5) {
            float pa = iRnd.x * 3.1416, pca = cos(pa), psa = sin(pa);
            m = paveGrass(m, xz + vec2(aBlade.x * pca - aBlade.y * psa, aBlade.x * psa + aBlade.y * pca) * uTuft);
          }
        #endif
        // no blade grows here: the tuft would stand zero high (h below: the dry ground only lessens m.a), so it is folded away
        // now, before the rest (ONLY WHAT IS IN VIEW)
        if (uCull > 0.5 && m.a <= mix(0.1, 0.5, ringed)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float dry = dryAt(xz);
        m = dryGround(m, xz, dry);                              // (land under the curse: see DRY GROUND)
        float cn = clumpAt(xz);
        // this blade's own root inside the tuft
        float ta = iRnd.x * 3.1416, tc = cos(ta), ts = sin(ta);
        vec2 off = vec2(aBlade.x * tc - aBlade.y * ts, aBlade.x * ts + aBlade.y * tc);
        vec3 root = vec3(xz.x + off.x * uTuft * mix(1.0, uRingLook.y, ringed), ground, xz.y + off.y * uTuft * mix(1.0, uRingLook.y, ringed));
        // (a ring tuft is broad: it keeps further back from a way's or the water's edge, where the grass thins, than a blade need)
        float h = uBlade.y * (0.6 + 0.85 * cn) * iRnd.y * aBlade.z * smoothstep(mix(0.1, 0.5, ringed), mix(0.75, 0.95, ringed), m.a) * edge * mix(1.0, uRingLook.z, ringed);
        vec3 toC = cameraPosition - root;
        float dist = length(toC.xz);
        h *= smoothstep(0.35, 1.2, length(toC));                // blades right in front of the lens sink away
        h *= 1.0 - aSpare * turned;                             // the two blades a far tuft has not: gone by the time it has turned
        // FEWER FAR OFF: a near tuft whose far tuft is not drawn sinks away as it turns
        if (aLod > 1.5 && aLod < 2.5 && float(gl_InstanceID) >= uFarKeep.x) h *= 1.0 - turned;
        vec2 toCam = toC.xz / max(dist, 0.001);
        // face the camera, every blade turned a little differently
        float a = iRnd.x * 0.6 + aBlade.w * 0.75;
        float ca = cos(a), sa = sin(a);
        vec2 f = vec2(toCam.x * ca - toCam.y * sa, toCam.x * sa + toCam.y * ca);
        vec2 right = vec2(f.y, -f.x);
        // wind: slow gusts rolling over the field + a small flutter per blade; blades also splay out of their tuft
        float gust = noise2(xz * 0.085 - uTime * vec2(0.5, 0.3) * (1.0 + max(uWind - 1.0, 0.0) * 0.8));      // (a hard wind: faster)
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
        w *= mix(1.0, uNear.w, turned) * mix(1.0, uRingLook.x, ringed);      // a far tuft: three blades stand for five; a ring tuft: for a whole clump
        w *= ringed > 0.5 ? uFarKeep.z : aLod > 0.5 ? mix(1.0, uFarKeep.y, turned) : 1.0;      // (FEWER FAR OFF: as much wider as fewer are drawn)
        // the leaf's waist (y = 0.5) comes in onto the straight line from foot to tip as the tuft turns: turned, the leaf IS the flat triangle
        float waist = (1.0 - abs(y - 0.5) * 2.0) * turned;
        vec3 p = root;
        p.xz += right * (position.x * mix(1.0, 0.625, waist) * w) + lean * (h * mix(y * y, y, turned));            // y squared: the blade arcs over instead of tilting stiffly
        p.y += h * y * (1.0 - 0.3 * min(dot(lean, lean), 1.6) * mix(y, 1.0, turned));
        vY = y;
        vRoot = rootColor(m, dry);
        vMid = m.rgb;
        // tips: lighter and warmer; tall clumps and tall blades catch more light; a sheen where a gust passes
        float tint = clamp((cn - 0.5) * 2.6 + iRnd.w * 0.45 + (aBlade.z - 0.8) * 0.9, -1.0, 1.0);
        float amt = clamp(0.7 + 0.34 * tint + 0.3 * gust * uWind, 0.0, 1.15) * m.a;
        vTip = mix(m.rgb, tipColor(m.rgb, uTip, dry), amt);
        // painterly: the whole tuft takes ONE flat tone, chosen by the brush stroke it stands in.
        // The tone never changes with the wind (tufts hopping between flat tones would flicker); a gust only adds a soft sheen.
        float v = cn * 0.45 + strokeAt(xz) * 0.55 + iRnd.w * 0.05 + step(1.2, iRnd.y) * 0.1;
        vec3 dab = mix(m.rgb, dabColor(m.rgb, uTip, v, dry), m.a) * (1.0 + 0.07 * (gust - 0.4) * uWind);
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
  const base = tuftGeometry(), flat = farTuftGeometry();
  // the tufts of one quarter of the tile: each one's place on it, and what makes it itself
  const n0 = Math.round(count / 4);
  const cell0 = new Float32Array(n0 * 2), rnd0 = new Float32Array(n0 * 4);
  for (let i = 0; i < n0; i++) {
    cell0[i * 2] = rng() * nearTile; cell0[i * 2 + 1] = rng() * nearTile;
    const tall = rng() < 0.16;                          // the upper layer: fewer, taller, lighter
    rnd0[i * 4] = rng() * 2 - 1; rnd0[i * 4 + 1] = tall ? 1.35 + 0.55 * rng() : 0.7 + 0.4 * rng(); rnd0[i * 4 + 2] = rng();
    rnd0[i * 4 + 3] = tall ? 0.3 + 0.7 * rng() : rng() * 2 - 1;
  }
  // the whole tile: that quarter four times over. A tuft's four copies follow one another, so drawing only the first part of
  // the pool (setDensity) thins the whole tile evenly, and leaves the same tufts as the first part of the quarter's own pool
  const cell4 = new Float32Array(n0 * 8), rnd4 = new Float32Array(n0 * 16);
  for (let i = 0; i < n0; i++) for (let k = 0; k < 4; k++) {
    const o = i * 4 + k;
    cell4[o * 2] = cell0[i * 2] + (k & 1) * nearTile; cell4[o * 2 + 1] = cell0[i * 2 + 1] + (k >> 1) * nearTile;
    for (let j = 0; j < 4; j++) rnd4[o * 4 + j] = rnd0[i * 4 + j];
  }
  const wide = { n: n0 * 4, iCell: new THREE.InstancedBufferAttribute(cell4, 2), iRnd: new THREE.InstancedBufferAttribute(rnd4, 4) };
  // (the shader lays a tile out from half its size before its centre: half a near tile's difference between the two pools,
  // made up here, so that a near tuft stands on its far tuft's spot to the millimetre)
  const cellN = cell0.map(v => (v + nearTile / 2) % nearTile);
  const close = { n: n0, iCell: new THREE.InstancedBufferAttribute(cellN, 2), iRnd: new THREE.InstancedBufferAttribute(rnd0, 4) };
  // a pool drawn with one of the two tuft shapes; lod tells the shader which of the three it is (see aLod there)
  const tufts = (shape, lod, p) => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = shape.index;
    g.setAttribute('position', shape.attributes.position);
    g.setAttribute('aBlade', shape.attributes.aBlade);
    g.setAttribute('aSpare', shape.attributes.aSpare);
    g.setAttribute('aLod', new THREE.Float32BufferAttribute(new Float32Array(shape.attributes.position.count).fill(lod), 1));
    g.setAttribute('iCell', p.iCell);
    g.setAttribute('iRnd', p.iRnd);
    g.instanceCount = p.n;
    return g;
  };
  inPlaceOrder(wide, tile, o => Math.floor(Math.floor(o / 4) * 8 / n0));
  inPlaceOrder(close, nearTile, i => Math.floor(i * 8 / n0));
  const gAll = tufts(base, 0, wide), gFar = tufts(flat, 1, wide), gNear = tufts(base, 2, close);
  // the ring's own pool: anywhere on its tile, each tuft itself as the others are
  let gRing = null, ringMesh = null, ringN = 0;
  if (ring) {
    ringN = ring.count;
    const cellR = new Float32Array(ringN * 2), rndR = new Float32Array(ringN * 4);
    for (let i = 0; i < ringN; i++) {
      cellR[i * 2] = rng() * ring.tile; cellR[i * 2 + 1] = rng() * ring.tile;
      const tall = rng() < 0.16;
      rndR[i * 4] = rng() * 2 - 1; rndR[i * 4 + 1] = tall ? 1.35 + 0.55 * rng() : 0.7 + 0.4 * rng(); rndR[i * 4 + 2] = rng();
      rndR[i * 4 + 3] = tall ? 0.3 + 0.7 * rng() : rng() * 2 - 1;
    }
    const poolR = { n: ringN, iCell: new THREE.InstancedBufferAttribute(cellR, 2), iRnd: new THREE.InstancedBufferAttribute(rndR, 4) };
    inPlaceOrder(poolR, ring.tile, i => Math.floor(i * 8 / ringN));
    gRing = tufts(flat, 3, poolR);
  }
  const mesh = new THREE.Mesh(farLod ? gFar : gAll, mat);
  mesh.name = 'followGrass';
  mesh.frustumCulled = false;          // the shader decides where the blades are
  const nearMesh = new THREE.Mesh(gNear, mat);          // (the same material: what is taught to the grass, her shadow, the clouds', is taught to both)
  nearMesh.name = 'followGrassNear';
  nearMesh.frustumCulled = false;
  nearMesh.visible = farLod;
  mesh.add(nearMesh);                  // (so whoever hides the grass hides both)
  if (gRing) {
    ringMesh = new THREE.Mesh(gRing, mat);
    ringMesh.name = 'followGrassRing';
    ringMesh.frustumCulled = false;
    mesh.add(ringMesh);
  }
  let density = 1, farKeep = 1, ringKeep = 1;
  // how many of each pool are drawn: the near pool by the density; of its tufts, the far pool the copies of the first
  // eighths farKeep says, the ring its own first eighths (FEWER FAR OFF), their blades as much wider
  const counts = () => {
    const D = Math.round(density * 8), F = Math.max(1, Math.round(D * farKeep)), L = Math.ceil(close.n * F / 8);
    gNear.instanceCount = Math.round(close.n * density);                    // (the same tufts in both pools: see the pools above)
    gAll.instanceCount = gNear.instanceCount * 4;
    gFar.instanceCount = L * 4;
    uniforms.uFarKeep.value.set(F < D ? L : 1e9, Math.sqrt(D / F), 1);
    if (gRing) { const R = Math.max(1, Math.round(D * ringKeep)); gRing.instanceCount = Math.ceil(ringN * R / 8); uniforms.uFarKeep.value.z = Math.sqrt(D / R); }
  };
  mesh.userData = {
    kind: 'followGrass', tufts: wide.n, blades: wide.n * 5, nearTufts: close.n, ringTufts: ringN,
    // centre the tile a little ahead of the walker, in the direction the camera looks, so most blades are on screen
    follow(pos, lookDir = null, lead = 0.24) {
      let x = pos.x, z = pos.z;
      if (lookDir) { const l = Math.hypot(lookDir.x, lookDir.z) || 1; x += lookDir.x / l * tile * lead; z += lookDir.z / l * tile * lead; }
      map.area.set(x, z, tile);
      if (ring) { const k = (ring.lead ?? 0.1) * ring.tile / (tile * lead || 1); uniforms.uRing.value.set(pos.x + (x - pos.x) * k, pos.z + (z - pos.z) * k, ring.tile); }      // (the ring: as far ahead of her as lead says, of its own tile)
      uniforms.uNear.value.x = pos.x; uniforms.uNear.value.y = pos.z;      // the full tufts: round the walker herself (turning the camera moves nothing)
      uniforms.uWalker.value.set(pos.x, pos.y, pos.z, 0.55);
    },
    // draw only part of the pool (0.25..1, in whole eighths: see ONLY WHAT IS IN VIEW); the blades that remain get wider so the carpet stays closed
    setDensity(d) {
      density = Math.min(1, Math.max(0.25, Math.round(d * 8) / 8));
      counts();
      uniforms.uThin.value = thin / Math.sqrt(density);
    },
    get density() { return density; },
    // FEWER FAR OFF: the share of the tufts drawn whose far tuft is drawn too, and the share of the ring's (each 0..1, kept
    // in whole eighths of what the density draws); 1, 1: all of them
    setFarKeep(far = 1, ring = 1) { farKeep = Math.min(1, Math.max(0.125, far)); ringKeep = Math.min(1, Math.max(0.125, ring)); counts(); },
    get farKeep() { return [farKeep, ringKeep]; },
    // near and far (true), or every tuft in full as it was (false): to compare, on the device
    setFarLod(on) { mesh.geometry = on ? gFar : gAll; nearMesh.visible = !!on; },
    get farLod() { return nearMesh.visible; },
    // the ring of coarse tufts past the tile (true), or none (false): to compare, on the device
    setRing(on) { if (ringMesh) ringMesh.visible = !!on; },
    get ring() { return !!ringMesh && ringMesh.visible; },
    get triangles() { return (nearMesh.visible ? gFar.instanceCount * 3 + gNear.instanceCount * 15 : gAll.instanceCount * 15) + (ringMesh && ringMesh.visible ? gRing.instanceCount * 3 : 0); },      // as drawn now
    setPainterly(on) { map.paint.value = on ? 1 : 0; },
    get painterly() { return map.paint.value > 0.5; },
    dispose() { gAll.dispose(); gFar.dispose(); gNear.dispose(); if (gRing) gRing.dispose(); base.dispose(); flat.dispose(); mat.dispose(); map.area.z = 0; },
  };
  return mesh;
}
