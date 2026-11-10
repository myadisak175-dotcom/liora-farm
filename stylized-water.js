// stylized-water.js
// Clear, moving, painterly game water in the spirit of stylized Unreal / Blender water.
//
//   look     : clear at the shore (you see the sand, stones and legs under it), turquoise, then deep blue;
//              a foam lip and drifting foam lines along the shore, light cells over the shallows, current strokes in
//              the stream, glints, sky sheen at low angles, sun sparkle on the wave faces
//   surface  : really moves up and down: slow swell + a wave simulation
//   dynamic  : createWaterSim() runs a small wave simulation on the GPU. Anything that touches the water starts
//              waves that spread, cross each other, bounce off the shore and die away:  sim.impulse(x, z, radius, strength)
//
//   const sim = createWaterSim({ rect: [minX, minZ, size], mask: (x, z) => isWater });      // optional
//   const mat = waterMaterial({ field, sim, far });      // field: createHeightField() from stylized-grassfield.js
//   mesh geometry needs: position, aFlow (vec3: F, metres across, streaminess 0 pond .. 1 stream), aDir (vec2: downstream direction) - see FLOW
//   const optics = createWaterOptics({ level });        // optional: see-through with bending, and a mirror of the scene
//   every frame: sim.step(renderer, dt);  optics.render(renderer, scene, camera, [water, lilyPads, grass]);
//   scene.add(createLilyPads({ pads: [[x, z, radius, flower 0/1, level, across, F]], sim }))
//
// Depth is read per pixel from the terrain height texture, so shorelines follow the land exactly.
// Bounded GLSL: no uniform arrays; smooth multi-scale noise and broken depth contours, without a cellular foam mesh.

import * as THREE from 'three';
import { _internal } from './stylized-nature.js';

const { NOISE, rgb, mulberry32, shared } = _internal;

export const WATER_LOOK = {
  shallow: '#60d7c9',   // turquoise
  mid: '#26abc7',       // bright blue
  deep: '#1b6fa8',
  abyss: '#1a5588',
  foam: '#f6fcff',
  cell: '#b4f3ea',      // light cells in the shallows
  sky: '#cfeaf7',       // what the surface mirrors at low angles
};

// An art-directed mask is loaded once and shared by all water materials.
// A load failure retains procedural water; it never blocks the game startup.
let foamTexturePromise;
export function loadFoamTexture() {
  if (foamTexturePromise) return foamTexturePromise;
  foamTexturePromise = new Promise(resolve => {
    let done = false;
    const finish = texture => { if (done) { if (texture) texture.dispose(); return; } done = true; clearTimeout(timer); resolve(texture); };
    const timer = setTimeout(() => finish(null), 8000);
    new THREE.TextureLoader().load(new URL('./assets/water/foam-brush-v1.png', import.meta.url).href,
      texture => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.NoColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        finish(texture);
      }, undefined, () => finish(null));
  });
  return foamTexturePromise;
}

// The look can be tuned while the game runs: every water material and lily pad reads these same values.
// (water-tuner.js puts sliders on them; the numbers here are the defaults)
export const WATER_TUNE = {
  foamDrift: { value: 1.95 },       // scale the simulated foam transport
  brushScale: { value: 0.49 },    // painted foam texture repetitions per metre
  shore: { value: 0.6 },         // shore-breaking swell strength
  foamLife: { value: 2.25 },        // seconds for surface foam to dissipate
  caustic: { value: 0.49 },        // brightness of the light netting on the bottom
  causticScale: { value: 2.2 },    // bigger number = smaller pattern
  swell: { value: 1.35 },           // height of the slow waves
  shimmer: { value: 0.27 },        // fine restless wobble of the surface
  speed: { value: 2.25 },             // how fast swell, shimmer and light pattern move
  refract: { value: 2.3 },           // how much the view under water bends
  reflect: { value: 0.18 },        // how strongly the scene is mirrored
  clear: { value: 0.6 },          // depth (m) at which you no longer see the bottom
  foam: { value: 1.75 },              // froth along the shore
  glint: { value: 0.1 },             // winking sparks
  fleck: { value: 1.15 },           // streaks of foam carried along by the current
  ripple: { value: 1.75 },          // strength of the waves made by touching the water
  simSpeed: { value: 1.8 },        // how fast those waves travel (m/s)
  calm: { value: 0.979 },          // how long they last (closer to 1 = longer)
};
const TUNE_UNIFORMS = () => ({
  uCaustic: WATER_TUNE.caustic, uCausticScale: WATER_TUNE.causticScale, uSwell: WATER_TUNE.swell, uShimmer: WATER_TUNE.shimmer, uSpeed: WATER_TUNE.speed,
  uRefract: WATER_TUNE.refract, uReflect: WATER_TUNE.reflect, uClear: WATER_TUNE.clear, uFoamAmt: WATER_TUNE.foam, uGlint: WATER_TUNE.glint, uFleck: WATER_TUNE.fleck, uShore: WATER_TUNE.shore, uBrushScale: WATER_TUNE.brushScale,
});

// FLOW. Everything that moves on the water moves downstream, at the speed of the water where it is.
// The mesh carries "flow coordinates": aFlow = (F, across, streaminess) and aDir = the downstream direction.
//   across : metres from the middle of the stream
//   F      : distance along the stream, measured so that one unit always takes the same TIME to flow past -
//            metres in the slow pond, several metres in the fast stream. A pattern drawn in (across, F) and
//            slid along F at one steady rate therefore drifts slowly over the pond, races down the stream, and
//            never smears where the speed changes.
export const FLOW = { pond: 0.22, stream: 0.75 };     // metres per second
// slow swell in flow coordinates p = (across, F): three wave trains, all running downstream, their crests slightly
// skewed so they are not ruler-straight. Returns metres; waveSlope returns (d/d across, d/dF).
const WAVES = /* glsl */`
float waveH(vec2 p, float t) {
  return 0.020 * sin((p.y + 0.35 * p.x) * 1.5 - t * 1.15)
       + 0.014 * sin((p.y - 0.30 * p.x) * 2.5 - t * 1.75 + 1.3)
       + 0.008 * sin((p.y + 0.10 * p.x) * 4.3 - t * 2.6 + 4.0);
}
vec2 waveSlope(vec2 p, float t) {
  float c1 = 0.020 * 1.5 * cos((p.y + 0.35 * p.x) * 1.5 - t * 1.15);
  float c2 = 0.014 * 2.5 * cos((p.y - 0.30 * p.x) * 2.5 - t * 1.75 + 1.3);
  float c3 = 0.008 * 4.3 * cos((p.y + 0.10 * p.x) * 4.3 - t * 2.6 + 4.0);
  return vec2(0.35 * c1 - 0.30 * c2 + 0.10 * c3, c1 + c2 + c3);
}`;
// Contours of depth define the incoming front: phase advances toward shallower water.
// Broad wave groups avoid a mechanically repeating, perfectly straight foam stripe.
const SHORE_WAVES = /* glsl */`
float shorePhase(vec2 p, float depth, float t) {
  return depth * 10.5 + t * 1.3 + sin(p.x * 0.38 + p.y * 0.27) * 0.75
    + sin(p.y * 0.65 - p.x * 0.14) * 0.3;
}
float shoreGroup(vec2 p, float t) {
  return 0.65 + 0.35 * sin(t * 0.29 + p.x * 0.07 + p.y * 0.05);
}
float shoreH(vec2 p, float depth, float t) {
  float phase = shorePhase(p, depth, t);
  float crest = pow(max(0.0, sin(phase)), 3.0);
  return (crest - 0.2) * 0.095 * shoreGroup(p, t)
    * smoothstep(-0.025, 0.1, depth) * (1.0 - smoothstep(0.7, 1.5, depth));
}`;
const SIM_PARS = /* glsl */`
uniform sampler2D uSim;
uniform vec4 uSimRect;       // min x, min z, size (metres), on/off
float simAt(vec2 xz) {
  vec2 uv = (xz - uSimRect.xy) / uSimRect.z;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return texture2D(uSim, clamp(uv, 0.0, 1.0)).r * inside * uSimRect.w;
}`;
const NO_SIM = () => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return { texture: { value: t }, rect: new THREE.Vector4(0, 0, 1, 0), enabled: false, impulse() {}, step() {}, dispose() { t.dispose(); } };
};

// ==========================================================================
// WAVE SIMULATION: a height field that obeys the wave equation, stepped on the GPU
// ==========================================================================
export function createWaterSim({ rect = [0, 0, 50], size = 512, mask = null, field = null, level = -0.6, foamTexture = null } = {}) {
  const [minX, minZ, span] = rect;
  const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  let a = new THREE.WebGLRenderTarget(size, size, opts), b = new THREE.WebGLRenderTarget(size, size, opts);
  a.texture.generateMipmaps = b.texture.generateMipmaps = false;
  // where there is water: waves bounce off everything else
  const md = new Uint8Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) md[j * size + i] = !mask || mask(minX + (i + 0.5) / size * span, minZ + (j + 0.5) / size * span) ? 255 : 0;
  const maskTex = new THREE.DataTexture(md, size, size, THREE.RedFormat);
  maskTex.magFilter = maskTex.minFilter = THREE.NearestFilter;
  maskTex.needsUpdate = true;
  const foamMap = foamTexture || new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  if (!foamTexture) foamMap.needsUpdate = true;
  const texel = span / size, HZ = 60;
  const I = () => ({ value: new THREE.Vector4(0, 0, 1, 0) });
  const uniforms = {
    uState: { value: a.texture }, uMask: { value: maskTex }, uPx: { value: 1 / size },
    uC2: { value: 0 }, uDamp: WATER_TUNE.calm,
    uRect: { value: new THREE.Vector3(minX, minZ, span) },
    uHeight: { value: field ? field.texture : maskTex },
    uHeightRect: { value: field ? field.rect : new THREE.Vector4(0, 0, 0, 0) },
    uTerrainOn: { value: field ? 1 : 0 }, uLevel: { value: level },
    uTime: shared.uTime, uSpeed: WATER_TUNE.speed, uShore: WATER_TUNE.shore,
    uFoamLife: WATER_TUNE.foamLife, uFoamDrift: WATER_TUNE.foamDrift,
    uFoamMap: { value: foamMap }, uBrushScale: WATER_TUNE.brushScale,
    uI0: I(), uI1: I(), uI2: I(), uI3: I(),
  };
  const stepMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      ${SHORE_WAVES}
      uniform sampler2D uState, uMask, uHeight, uFoamMap;
      uniform vec4 uHeightRect;
      uniform float uTime, uSpeed, uShore, uLevel, uTerrainOn, uFoamLife, uFoamDrift, uBrushScale;
      uniform float uPx, uC2, uDamp;
      uniform vec3 uRect;
      uniform vec4 uI0, uI1, uI2, uI3;      // x, z, radius, strength: something touched the water here
      varying vec2 vUv;
      float poke(vec4 i, vec2 xz) { vec2 d = xz - i.xy; return i.w * exp(-dot(d, d) / (i.z * i.z)); }
      // a neighbour's height; a neighbour on land mirrors this cell, which is what makes waves bounce off the shore
      float nb(vec2 uv, float h) { return mix(h, texture2D(uState, uv).r, step(0.5, texture2D(uMask, uv).r)); }
      float bottom(vec2 p) { return texture2D(uHeight, (p - uHeightRect.xy) * uHeightRect.z + uHeightRect.w).r; }
      // Alpha stores velocity potential: its spatial gradient is the horizontal current.
      // Reflecting solid boundaries give zero potential gradient through the bank.
      float phi(vec2 uv, float center) {
        return mix(center, texture2D(uState, uv).a, step(0.5, texture2D(uMask, uv).r));
      }
      void main() {
        if (texture2D(uMask, vUv).r < 0.5) { gl_FragColor = vec4(0.0); return; }
        vec4 s = texture2D(uState, vUv);
        float h = s.r, before = s.g;
        float around = nb(vUv + vec2(uPx, 0.0), h) + nb(vUv - vec2(uPx, 0.0), h) + nb(vUv + vec2(0.0, uPx), h) + nb(vUv - vec2(0.0, uPx), h);
        float next = (2.0 * h - before + uC2 * (around - 4.0 * h)) * uDamp;
        vec2 xz = uRect.xy + vUv * uRect.z;
        next += poke(uI0, xz) + poke(uI1, xz) + poke(uI2, xz) + poke(uI3, xz);
        // soak waves up at the edge of the simulated square, so nothing bounces off an invisible wall
        vec2 e = min(vUv, 1.0 - vUv);
        next *= mix(0.86, 1.0, smoothstep(0.0, 0.05, min(e.x, e.y)));
        // Potential flow is accelerated by wave pressure, then loses energy to drag.
        // R/G: wave height history, B: advected painted foam, A: current potential.
        float dx = uRect.z * uPx;
        float ground = bottom(xz), depth = uLevel - ground;
        float t = uTime * uSpeed;
        float phase = shorePhase(xz, depth, t);
        float swell = shoreH(xz, depth, t) * uShore * uTerrainOn;
        float potential = clamp((s.a - 9.81 * (h + swell) / 60.0) * exp(-0.65 / 60.0), -0.65, 0.65);
        vec2 velocity = vec2(phi(vUv + vec2(uPx, 0.0), s.a) - phi(vUv - vec2(uPx, 0.0), s.a),
                             phi(vUv + vec2(0.0, uPx), s.a) - phi(vUv - vec2(0.0, uPx), s.a)) / (2.0 * dx);
        velocity *= uFoamDrift;
        velocity *= min(1.0, 0.85 / max(length(velocity), 0.001));
        // No transport through dry cells: the tangential component can continue along the edge.
        if (texture2D(uMask, vUv + vec2(sign(velocity.x) * uPx, 0.0)).r < 0.5) velocity.x = 0.0;
        if (texture2D(uMask, vUv + vec2(0.0, sign(velocity.y) * uPx)).r < 0.5) velocity.y = 0.0;
        vec2 sourceUV = clamp(vUv - velocity / (60.0 * uRect.z), 0.0, 1.0);
        float carried = texture2D(uState, sourceUV).b * step(0.5, texture2D(uMask, sourceUV).r);
        float foam = carried * exp(-1.0 / (60.0 * max(0.2, uFoamLife)));
        float breaking = smoothstep(0.78, 0.98, sin(phase)) * shoreGroup(xz, t)
          * smoothstep(0.015, 0.1, depth) * (1.0 - smoothstep(0.12, 0.32, depth));
        float disturbance = abs(next - h) * 60.0;
        float disturbed = smoothstep(0.05, 0.35, disturbance) * (1.0 - smoothstep(0.25, 0.95, depth));
        // Rasterize the artwork only when foam is born. Thereafter B carries and deforms that shape.
        vec2 artUV = xz * uBrushScale + vec2(t * 0.013, -t * 0.019);
        float pattern = smoothstep(0.08, 0.65, texture2D(uFoamMap, fract(artUV)).r);
        // Shore foam keeps the painted strokes. Disturbed open water only gets a soft, shapeless splash haze
        // (no artwork), so waves never leave brush-stroke scribbles floating on the lake.
        float splash = disturbed * (1.0 - smoothstep(0.1, 0.4, depth));
        foam = clamp(foam + (breaking * uShore * pattern * 0.08
          + splash * 0.006) * uTerrainOn, 0.0, 1.0);
        gl_FragColor = vec4(clamp(next, -0.5, 0.5), h, foam, potential);
      }`,
    depthTest: false, depthWrite: false,
  });
  const scene = new THREE.Scene(), cam = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), stepMat);
  quad.frustumCulled = false;
  scene.add(quad);
  const texture = { value: a.texture };
  const pokes = [uniforms.uI0, uniforms.uI1, uniforms.uI2, uniforms.uI3];
  const queue = [];
  let acc = 0, checked = false;
  const sim = {
    texture, rect: new THREE.Vector4(minX, minZ, span, 1), enabled: true, size,
    inside: (x, z) => x > minX && x < minX + span && z > minZ && z < minZ + span,
    impulse(x, z, radius = 0.35, strength = 0.05) { if (sim.enabled && sim.inside(x, z) && queue.length < 16) queue.push([x, z, radius, strength]); },
    step(renderer, dt) {
      if (!sim.enabled) return;
      if (!checked) {          // can this GPU draw into a half-float texture? if not, the water simply stays calm
        checked = true;
        const gl = renderer.getContext();
        if (!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) { sim.enabled = false; sim.rect.w = 0; return; }
      }
      uniforms.uC2.value = Math.min(0.45, Math.pow(WATER_TUNE.simSpeed.value / (texel * HZ), 2));
      acc = Math.min(acc + dt, 2.5 / HZ);
      const target = renderer.getRenderTarget();
      while (acc >= 1 / HZ) {
        acc -= 1 / HZ;
        for (const p of pokes) { const q = queue.shift(); if (q) p.value.set(q[0], q[1], q[2], q[3]); else p.value.w = 0; }
        uniforms.uState.value = a.texture;
        renderer.setRenderTarget(b);
        renderer.render(scene, cam);
        const t = a; a = b; b = t;
        texture.value = a.texture;
      }
      renderer.setRenderTarget(target);
    },
    dispose() { a.dispose(); b.dispose(); maskTex.dispose(); if (!foamTexture) foamMap.dispose(); stepMat.dispose(); quad.geometry.dispose(); },
  };
  return sim;
}

// ==========================================================================
// OPTICS: what you see THROUGH the water and what is MIRRORED on it, drawn each frame into two small pictures
//   through : the scene's underwater things only (objects on layer UNDERWATER: terrain, rocks, the player), same camera
//   mirror  : the scene seen from a camera flipped under the water plane (trees, sky, hills...), clipped at the surface
// ==========================================================================
export const UNDERWATER = 2;
export function createWaterOptics({ level = 0, throughScale = 0.5 } = {}) {
  const mk = () => { const t = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true }); t.texture.generateMipmaps = false; t.texture.colorSpace = THREE.NoColorSpace; return t; };
  const through = mk(), mirror = mk();
  let quality = 2;                              // 2: full mirror   1: small mirror, refreshed less often   0: no mirror (sky colour instead)
  const uniforms = {
    uThrough: { value: through.texture }, uMirror: { value: mirror.texture },
    uMirrorMatrix: { value: new THREE.Matrix4() }, uInvRes: { value: new THREE.Vector2(1, 1) }, uOptics: { value: 1 }, uMirrorOn: { value: 1 },
  };
  const vcam = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0), point = new THREE.Vector3(0, level, 0);
  const camPos = new THREE.Vector3(), rot = new THREE.Matrix4(), look = new THREE.Vector3(), view = new THREE.Vector3(), target = new THREE.Vector3();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4(), size = new THREE.Vector2();
  return {
    uniforms, level,
    get quality() { return quality; },
    setQuality(q) { quality = Math.max(0, Math.min(2, Math.round(q))); uniforms.uMirrorOn.value = quality > 0 ? 1 : 0; },
    // hide: objects that must not appear in either picture (the water itself, things floating on it, the grass)
    // doThrough / doMirror: which of the two pictures to refresh this frame
    render(renderer, scene, camera, hide = [], doThrough = true, doMirror = true) {
      renderer.getDrawingBufferSize(size);
      const scale = quality === 2 ? 0.5 : 0.34;
      const w = Math.max(2, Math.round(size.x * scale)), h = Math.max(2, Math.round(size.y * scale));
      const tw = Math.max(2, Math.round(size.x * throughScale)), th = Math.max(2, Math.round(size.y * throughScale));
      if (mirror.width !== w || mirror.height !== h) mirror.setSize(w, h);
      if (through.width !== tw || through.height !== th) through.setSize(tw, th);
      uniforms.uInvRes.value.set(1 / size.x, 1 / size.y);
      const was = hide.map(o => o.visible);
      hide.forEach(o => { o.visible = false; });
      const target0 = renderer.getRenderTarget();
      // ---- through the water
      if (doThrough) {
        const mask = camera.layers.mask;
        camera.layers.set(UNDERWATER);
        renderer.setRenderTarget(through);
        renderer.render(scene, camera);
        camera.layers.mask = mask;
      }
      // ---- mirrored on the water (camera above the surface only)
      camPos.setFromMatrixPosition(camera.matrixWorld);
      if (doMirror && quality > 0 && camPos.y > level + 0.02) {
        rot.extractRotation(camera.matrixWorld);
        view.subVectors(point, camPos).reflect(normal).negate().add(point);
        look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
        target.subVectors(point, look).reflect(normal).negate().add(point);
        vcam.position.copy(view);
        vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
        vcam.lookAt(target);
        vcam.near = camera.near; vcam.far = camera.far;
        vcam.updateMatrixWorld();
        vcam.projectionMatrix.copy(camera.projectionMatrix);
        uniforms.uMirrorMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
        // tilt the near plane onto the water surface, so nothing from below the surface gets into the mirror picture
        plane.setFromNormalAndCoplanarPoint(normal, point).applyMatrix4(vcam.matrixWorldInverse);
        clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
        const pm = vcam.projectionMatrix, e = pm.elements;
        q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
        clip.multiplyScalar(2 / clip.dot(q));
        e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
        renderer.setRenderTarget(mirror);
        renderer.render(scene, vcam);
      }
      renderer.setRenderTarget(target0);
      hide.forEach((o, i) => { o.visible = was[i]; });
    },
    dispose() { through.dispose(); mirror.dispose(); },
  };
}
const NO_OPTICS = () => {
  const px = c => { const t = new THREE.DataTexture(new Uint8Array(c), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; return t; };
  return { uniforms: { uThrough: { value: px([232, 214, 164, 255]) }, uMirror: { value: px([207, 234, 247, 255]) }, uMirrorMatrix: { value: new THREE.Matrix4() }, uInvRes: { value: new THREE.Vector2(1, 1) }, uOptics: { value: 0 }, uMirrorOn: { value: 0 } } };
};

// ==========================================================================
// WATER SURFACE
// ==========================================================================
export function waterMaterial({ field, animeCells = null, sim = null, optics = null, far = '#cde6f2', fadeA = 96, fadeB = 118, look = WATER_LOOK, foamTexture = null, sun = [-0.4, 0.9, 0.5] } = {}) {
  const L = { ...WATER_LOOK, ...look };
  const S = sim || NO_SIM(), O = optics || NO_OPTICS();
  const foamMap = foamTexture || new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  if (!foamTexture) foamMap.needsUpdate = true;
  const uniforms = {
    uTime: shared.uTime,
    uHeight: { value: field.texture }, uHeightRect: { value: field.rect },
    uSim: S.texture, uSimRect: { value: S.rect }, uSimPx: { value: S.enabled ? S.rect.z / S.size : 1 },
    ...O.uniforms, ...TUNE_UNIFORMS(),
    uShallow: { value: rgb(L.shallow) }, uMid: { value: rgb(L.mid) }, uDeep: { value: rgb(L.deep) }, uAbyss: { value: rgb(L.abyss) },
    uAnimeCells: { value: animeCells || foamMap }, uAnimeOn: { value: animeCells ? 1 : 0 },
    uFoamMap: { value: foamMap },
    uFoamMapOn: { value: foamTexture ? 1 : 0 },
    uFoam: { value: rgb(L.foam) }, uCell: { value: rgb(L.cell) }, uSky: { value: rgb(L.sky) },
    uSun: { value: new THREE.Vector3(...sun).normalize() },
    uFar: { value: rgb(far) }, uFadeA: { value: fadeA }, uFadeB: { value: fadeB },
    uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      ${WAVES}
      ${SHORE_WAVES}
      ${SIM_PARS}
      attribute vec3 aFlow;
      attribute vec2 aDir;
      uniform sampler2D uHeight;
      uniform vec4 uHeightRect;
      uniform float uTime, uHazeNear, uHazeFar, uHazeMax, uSwell, uSpeed, uShore;
      varying vec3 vWP;
      varying vec3 vFlow;
      varying vec2 vDir;
      varying float vHaze;
      varying float vLift;     // how far this point of the surface is lifted right now
      varying float vCalm;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float ground = texture2D(uHeight, (wp.xz - uHeightRect.xy) * uHeightRect.z + uHeightRect.w).r;
        float depth = wp.y - ground;
        vCalm = mix(1.0, 0.4, aFlow.z) * smoothstep(0.02, 0.55, depth) * uSwell;   // gentle at the shore and in the stream
        vLift = waveH(vec2(aFlow.y, aFlow.x), uTime * uSpeed) * vCalm + simAt(wp.xz) * smoothstep(0.0, 0.12, depth);
        vLift += shoreH(wp.xz, depth, uTime * uSpeed) * uShore * mix(1.0, 0.18, aFlow.z);
        wp.y += vLift;
        vWP = wp.xyz;
        vFlow = aFlow;
        vDir = aDir;
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${WAVES}
      ${SHORE_WAVES}
      ${SIM_PARS}
      uniform sampler2D uHeight, uThrough, uMirror, uFoamMap, uAnimeCells;
      uniform float uAnimeOn;
      uniform float uFoamMapOn, uBrushScale;
      uniform mat4 uMirrorMatrix;
      uniform vec2 uInvRes;
      uniform vec4 uHeightRect;
      uniform float uTime, uFadeA, uFadeB, uSimPx, uOptics, uMirrorOn;
      uniform float uCaustic, uCausticScale, uShimmer, uSpeed, uRefract, uReflect, uClear, uFoamAmt, uGlint, uFleck, uShore;
      uniform vec3 uShallow, uMid, uDeep, uAbyss, uFoam, uCell, uSky, uSun, uFar, uHaze;
      varying vec3 vWP;
      varying vec3 vFlow;
      varying vec2 vDir;
      varying float vHaze;
      varying float vLift;
      varying float vCalm;

      vec2 hash22(vec2 p) { return vec2(hash2(p), hash2(p + 37.31)); }
      float paintedFoam(vec2 uv) {
        vec2 a = fract(uv), b = fract(uv + vec2(0.47, 0.53));
        // Fade tile edges; an offset layer fills those edges so no texture seam is visible.
        vec2 ea = smoothstep(vec2(0.0), vec2(0.08), min(a, 1.0 - a));
        vec2 eb = smoothstep(vec2(0.0), vec2(0.08), min(b, 1.0 - b));
        float first = texture2D(uFoamMap, a).r * ea.x * ea.y;
        float second = texture2D(uFoamMap, b).r * eb.x * eb.y * 0.55;
        return max(first, second);
      }
      // a bright wandering line wherever the noise crosses its middle value: two of these, crossed, look like the net
      // of sunlight on a shallow bottom, and cost a fraction of a proper cell pattern
      float ridge(vec2 p) { return 1.0 - abs(noise2(p) * 2.0 - 1.0); }
      void main() {
        vec2 xz = vWP.xz;
        float ground = texture2D(uHeight, (xz - uHeightRect.xy) * uHeightRect.z + uHeightRect.w).r;
        float depth = vWP.y - ground;
        float restDepth = depth - vLift;
        if (depth < -0.01) discard;
        float t = uTime * uSpeed;
        float stream = vFlow.z;
        // flow coordinates riding with the water: q drifts downstream at the water's own speed, q2 a little faster
        // (a second layer sliding over the first, in the same direction)
        vec2 q = vec2(vFlow.y, vFlow.x - t * ${FLOW.pond.toFixed(3)});
        vec2 q2 = vec2(q.x, q.y - t * 0.08);
        vec2 T = normalize(vDir), A = vec2(-T.y, T.x);     // downstream, and across
        float squeeze = ${FLOW.pond.toFixed(3)} / mix(${FLOW.pond.toFixed(3)}, ${FLOW.stream.toFixed(3)}, stream);     // how many F units one metre is here

        // ---- which way the surface faces: swell + simulated waves + a fine restless shimmer
        float s0 = simAt(xz);
        float e = uSimPx * 1.5;
        vec2 simSl = vec2(simAt(xz + vec2(e, 0.0)) - simAt(xz - vec2(e, 0.0)), simAt(xz + vec2(0.0, e)) - simAt(xz - vec2(0.0, e))) / (2.0 * e);
        vec2 ws = waveSlope(vec2(vFlow.y, vFlow.x), t) * vCalm;
        vec2 sl = A * ws.x + T * (ws.y * squeeze) + simSl;
        // Refract and reflect the same incoming swell that displaces the geometry.
        float eps = 0.16;
        float gx = texture2D(uHeight, (xz + vec2(eps, 0.0) - uHeightRect.xy) * uHeightRect.z + uHeightRect.w).r;
        float gz = texture2D(uHeight, (xz + vec2(0.0, eps) - uHeightRect.xy) * uHeightRect.z + uHeightRect.w).r;
        float sh0 = shoreH(xz, restDepth, t);
        sl += vec2(shoreH(xz + vec2(eps, 0.0), restDepth + ground - gx, t) - sh0,
                   shoreH(xz + vec2(0.0, eps), restDepth + ground - gz, t) - sh0)
                   / eps * uShore * mix(1.0, 0.18, stream);
        vec2 shimmer = (vec2(noise2(q * 2.6 + 1.0), noise2(q2 * 2.6 + 5.0)) - 0.5) * 1.6 * uShimmer * smoothstep(0.02, 0.3, depth);
        // Fine ripples: two small wave layers crossing in different directions. They only tilt the surface
        // (so the mirrored scene and sun wobble); nothing is painted on top. Faded out with distance to avoid crawling.
        vec2 rpA = xz * 3.4 + vec2(t * 0.30, t * 0.18);
        vec2 rpB = xz * 5.6 + vec2(-t * 0.24, t * 0.34);
        const vec2 dE = vec2(0.07, 0.0);
        float rA = noise2(rpA), rB = noise2(rpB);
        vec2 ripple = vec2(noise2(rpA + dE.xy) - rA, noise2(rpA + dE.yx) - rA) * 0.6
                    + vec2(noise2(rpB + dE.xy) - rB, noise2(rpB + dE.yx) - rB) * 0.4;
        float rippleFade = 1.0 - smoothstep(22.0, 55.0, length(cameraPosition - vWP));
        shimmer += ripple * 4.0 * uShimmer * rippleFade * smoothstep(0.02, 0.3, depth);
        vec3 N = normalize(vec3(-sl.x * 3.0 - shimmer.x, 1.0, -sl.y * 3.0 - shimmer.y));
        vec3 V = normalize(cameraPosition - vWP);

        // ---- what lies under the water, seen through a surface that bends the view
        vec2 suv = gl_FragCoord.xy * uInvRes;
        vec3 under = texture2D(uThrough, suv + N.xz * (0.012 + 0.035 * smoothstep(0.0, 0.9, depth)) * uOptics * uRefract).rgb;
        // sunlight netting on the bottom: two soft layers of cells sliding over each other (glow, not drawn lines)
        vec2 cp = q * uCausticScale + (vec2(noise2(q * 0.5 + 2.0), noise2(q * 0.5 + 9.0)) - 0.5) * 1.6 + N.xz * 0.5;
        float net = ridge(cp * 0.9) * ridge(cp * 1.5 + vec2(4.7, -t * 0.1));
        float caustic = smoothstep(0.45, 1.0, net) * smoothstep(0.05, 0.3, depth) * (1.0 - smoothstep(0.9, 1.7, depth));
        under *= 1.0 + caustic * uCaustic;

        // ---- the water's own colour, thicker with depth (soft painted bands)
        float dn = depth + (noise2(xz * 0.55) - 0.5) * 0.22 + (noise2(xz * 1.9) - 0.5) * 0.07;
        // Depth ladder: emerald at the very edge, turquoise, then a clearly darker blue towards the middle.
        vec3 body = mix(vec3(0.40, 0.86, 0.62), uShallow, smoothstep(0.0, 0.3, dn));
        body = mix(body, uMid, smoothstep(0.1, 0.9, dn));
        body = mix(body, uDeep, smoothstep(0.5, 1.7, dn));
        body = mix(body, uAbyss, smoothstep(1.2, 3.0, dn));
        body += uCell * caustic * uCaustic * 0.3;
        vec3 col = mix(under, body, mix(0.16, 0.95, smoothstep(0.0, uClear, depth)));
        // faces of the waves turned to the sun are a little lighter, the others a little darker: soft, no outlines
        col *= 1.0 + clamp(dot(sl, -normalize(uSun.xz)) * 2.2 + vLift * 3.0, -0.13, 0.16);
        // Sunlight glowing through the thin water at the edges, strongest when looking towards the sun.
        float throughSun = pow(max(dot(-V, normalize(uSun)), 0.0), 2.0);
        float thin = 1.0 - smoothstep(0.05, 0.85, dn);
        col += vec3(0.50, 0.92, 0.52) * thin * (0.08 + 0.20 * throughSun) * smoothstep(0.0, 0.05, depth);

        // ---- the scene mirrored on the surface, stronger at low angles, broken up by the waves
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec4 mc = uMirrorMatrix * vec4(vWP, 1.0);
        vec3 refl = mix(uSky, texture2D(uMirror, mc.xy / mc.w + N.xz * 0.06).rgb, uOptics * uMirrorOn);
        col = mix(col, refl, fres * uReflect * smoothstep(0.0, 0.15, depth));

        // The open surface carries no drawn lines or blotches: its look comes from the fine ripples above
        // (they bend the mirrored scene) plus the soft sun sparkle below.
        vec2 drift = q + (vec2(noise2(q * 0.65 + 2.0), noise2(q * 0.65 + 8.0)) - 0.5) * 0.9;
        float white = 0.0;

        // Swash carries broken painted wisps towards the beach; backwash leaves short-lived foam.
        float shoreMask = (1.0 - smoothstep(0.22, 0.42, restDepth)) * smoothstep(-0.012, 0.022, depth);
        if (shoreMask > 0.001) {
          vec2 fw = xz - T * t * 0.045;
          float broad = noise2(fw * 1.7 + vec2(t * 0.04, 2.0));
          float detail = noise2(fw * 6.0 + vec2(7.0, -t * 0.055));
          float broken = smoothstep(0.24, 0.47, broad * 0.72 + detail * 0.28);
          float wob = (broad - 0.5) * 0.024 + (detail - 0.5) * 0.008;
          float surge = 0.5 + 0.5 * sin(t * 1.3 + noise2(xz * 0.25) * 2.0);
          float edgeDepth = restDepth + wob;
          float aa = max(fwidth(edgeDepth), 0.0015);
          float contactCenter = 0.018 + 0.012 * surge;
          // The wave tip is a soft, uneven lip: its width changes along the shore and it breaks into pieces,
          // instead of a hairline at one fixed depth.
          float lipW = 0.016 + 0.022 * broad + 0.010 * surge;
          float contact = 1.0 - smoothstep(0.0, lipW + aa * 1.5, abs(edgeDepth - contactCenter - 0.01));
          contact *= smoothstep(0.34, 0.62, broad * 0.6 + detail * 0.4 + 0.12 * surge);
          // a faint wet wash that fades out behind the tip, so the edge dissolves rather than ending in a line
          float wash = (1.0 - smoothstep(0.02, 0.11, edgeDepth)) * smoothstep(-0.004, 0.012, edgeDepth);
          float pulseCenter = 0.04 + 0.13 * (1.0 - surge);
          float pulse = 1.0 - smoothstep(0.016, 0.055 + aa, abs(edgeDepth - pulseCenter));
          pulse *= smoothstep(0.2, 0.6, surge) * uShore;
          // Flow coordinates form a stable ribbon around the river and pond.
          vec2 shoreUV = vec2(vFlow.x * uBrushScale, edgeDepth * 2.8 - t * 0.038);
          shoreUV += vec2(broad, detail) * 0.035;
          float shoreBrush = smoothstep(0.08, 0.65, paintedFoam(shoreUV));
          shoreBrush = mix(broken, shoreBrush, uFoamMapOn);
          float foam = contact * (0.45 + 0.55 * shoreBrush) * (0.5 + 0.5 * broken)
                     + pulse * shoreBrush * 0.25 * (1.0 - uSimRect.w)
                     + wash * (0.06 + 0.10 * broken) * (0.4 + 0.6 * surge);
          white = max(white, min(0.9, foam * shoreMask * uFoamAmt));
        }
        vec2 foamStateUV = (xz - uSimRect.xy) / uSimRect.z;
        float inState = step(0.0, foamStateUV.x) * step(foamStateUV.x, 1.0) * step(0.0, foamStateUV.y) * step(foamStateUV.y, 1.0);
        float movingFoam = texture2D(uSim, clamp(foamStateUV, 0.0, 1.0)).b * inState * uSimRect.w;
        white = max(white, smoothstep(0.025, 0.55, movingFoam) * 0.9 * uFoamAmt * smoothstep(0.0, 0.04, depth));
        // Baked cells add sparse anime-style foam islands to the existing painted, advected foam.
        // UVs ride with the flow; depth keeps the larger shapes close to the shore.
        vec2 animeCell = texture2D(uAnimeCells, q * vec2(0.26, 0.21)).rg;
        float animeLace = smoothstep(0.16, 0.26, animeCell.r) * (1.0 - smoothstep(0.12, 0.26, animeCell.g));
        float animeShore = (1.0 - smoothstep(0.10, 0.38, restDepth)) * smoothstep(0.0, 0.04, depth);
        float animePulse = smoothstep(0.35, 0.75, 0.5 + 0.5 * sin(restDepth * 16.0 - t * 1.8 + noise2(q * 0.6) * 1.6));
        white = max(white, min(0.75, animeLace * animeShore * animePulse * uFoamAmt) * uAnimeOn);
        // Crown meshes and droplets accompany physical impulses; the simulation still bends the view.

        // Rounded sun glints, not large four-point stars or long white scratches.
        vec2 gp = drift * 3.2;
        vec2 gi = floor(gp), gf = fract(gp) - 0.5;
        float gh = hash2(gi);
        vec2 go = gf - (hash22(gi + 5.0) - 0.5) * 0.6;
        float wink = pow(max(0.0, sin(uTime * 1.3 + gh * 60.0)), 8.0);
        float sparkle = exp(-dot(go * vec2(14.0, 24.0), go * vec2(14.0, 24.0)));
        white = max(white, sparkle * wink * step(0.82, gh) * smoothstep(0.15, 0.4, depth) * uGlint);
        // Soft sun sparkle on the small ripples: broad, rounded highlights, never lines.
        vec3 Hh = normalize(normalize(uSun) + V);
        float spec = pow(max(dot(N, Hh), 0.0), 140.0);
        white = max(white, min(0.55, spec * 0.5) * uGlint * smoothstep(0.1, 0.35, depth));

        col = mix(col, uFoam, clamp(white, 0.0, 1.0));
        col = mix(col, uHaze, vHaze);
        col = mix(col, uFar, smoothstep(uFadeA, uFadeB, length(xz)));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

// ==========================================================================
// LILY PADS: flat notched leaves that ride the waves, some with a flower
// ==========================================================================
export function createLilyPads({ pads = [], seed = 1, sim = null } = {}) {
  const rng = mulberry32(seed * 331 + 9);
  const S = sim || NO_SIM();
  const pos = [], col = [], ctr = [], idx = [];
  const PAD = [[0.56, 0.74, 0.25], [0.66, 0.8, 0.27], [0.5, 0.68, 0.24], [0.74, 0.82, 0.3]];
  let cur = [0, 0, 0], curFlow = [0, 0];
  const fl = [];
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c[0], c[1], c[2]); ctr.push(cur[0], cur[1], cur[2]); fl.push(curFlow[0], curFlow[1]); return pos.length / 3 - 1; };
  for (const [px, pz, r, flower, level, across = px, F = pz] of pads) {
    const phase = rng() * 6.28, rot = rng() * 6.28, base = PAD[Math.floor(rng() * PAD.length)];
    cur = [px, pz, phase]; curFlow = [across, F];
    const dark = base.map(v => v * 0.82), foam = [0.93, 0.98, 0.98];
    const SEG = 18, notch = 0.5;                       // radians cut out of the leaf
    // a thin ring of foam hugging the leaf, just under it
    const f0 = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const a = rot + i / SEG * Math.PI * 2;
      push(px + Math.cos(a) * r * 1.02, level + 0.014, pz + Math.sin(a) * r * 1.02, foam);
      push(px + Math.cos(a) * r * (1.065 + 0.015 * Math.sin(a * 3.0 + phase)), level + 0.014, pz + Math.sin(a) * r * (1.065 + 0.015 * Math.sin(a * 3.0 + phase)), foam);
    }
    for (let i = 0; i < SEG; i++) { if (Math.sin(i * 0.85 + phase) < 0.25) continue; const a = f0 + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    // the leaf: a fan with alternating light and dark wedges (veins), one wedge missing
    const c = push(px, level + 0.032, pz, base.map(v => v * 1.08));
    let prev = -1;
    for (let i = 0; i <= SEG; i++) {
      const a = rot + notch / 2 + i / SEG * (Math.PI * 2 - notch);
      const wob = 1 + 0.05 * Math.sin(i * 2.3 + phase);
      const v = push(px + Math.cos(a) * r * wob, level + 0.032, pz + Math.sin(a) * r * wob, i % 2 ? base : dark);
      if (prev >= 0) idx.push(c, v, prev);
      prev = v;
    }
    if (flower) {                                      // a lotus: two rings of petals round a yellow heart
      const tint = rng() < 0.5 ? [0.98, 0.62, 0.8] : (rng() < 0.5 ? [0.99, 0.95, 0.97] : [0.78, 0.7, 0.96]);
      const fx = px + Math.cos(rot + 2.2) * r * 0.25, fz = pz + Math.sin(rot + 2.2) * r * 0.25, fy = level + 0.05, s = Math.min(0.34, r * 0.55);
      for (const [n, out, up, w, k] of [[8, 1.0, 0.42, 0.34, 1.0], [6, 0.62, 0.72, 0.3, 1.12]]) {
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + (n === 6 ? 0.3 : 0) + rot;
          const dx = Math.cos(a), dz = Math.sin(a), tx = -dz, tz = dx;
          const tipc = tint.map(v => Math.min(1, v * k)), basec = [1, 0.97, 0.9];
          const a0 = push(fx + dx * s * 0.12 + tx * s * w * 0.5, fy, fz + dz * s * 0.12 + tz * s * w * 0.5, basec);
          const a1 = push(fx + dx * s * 0.12 - tx * s * w * 0.5, fy, fz + dz * s * 0.12 - tz * s * w * 0.5, basec);
          const a2 = push(fx + dx * s * out, fy + s * up, fz + dz * s * out, tipc);
          idx.push(a0, a2, a1);
        }
      }
      const yc = [0.98, 0.84, 0.3];
      const h0 = push(fx, fy + s * 0.3, fz, yc);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, b = (i + 1) / 6 * Math.PI * 2;
        idx.push(h0, push(fx + Math.cos(b) * s * 0.16, fy + s * 0.12, fz + Math.sin(b) * s * 0.16, yc), push(fx + Math.cos(a) * s * 0.16, fy + s * 0.12, fz + Math.sin(a) * s * 0.16, yc));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPad', new THREE.Float32BufferAttribute(ctr, 3));      // the leaf's centre x, z and its phase
  g.setAttribute('aPadFlow', new THREE.Float32BufferAttribute(fl, 2));   // the centre in flow coordinates (across, F)
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uSwell: WATER_TUNE.swell, uSpeed: WATER_TUNE.speed, uSim: S.texture, uSimRect: { value: S.rect }, uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax },
    vertexShader: /* glsl */`
      ${WAVES}
      ${SHORE_WAVES}
      ${SIM_PARS}
      attribute vec3 aCol;
      attribute vec3 aPad;
      attribute vec2 aPadFlow;
      uniform float uTime, uSwell, uSpeed, uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vCol;
      varying float vHaze;
      void main() {
        vec3 p = position;
        // the whole leaf rises and falls with the water under its middle
        vec2 c = aPad.xy;
        p.y += waveH(aPadFlow, uTime * uSpeed) * uSwell + simAt(c);
        p.xz += vec2(sin(uTime * 0.37 + aPad.z), cos(uTime * 0.31 + aPad.z * 1.7)) * 0.03;      // drifting on its stem
        vCol = aCol;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uHaze;
      varying vec3 vCol;
      varying float vHaze;
      void main() { gl_FragColor = vec4(mix(vCol, uHaze, vHaze), 1.0); }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'lilyPads';
  mesh.renderOrder = 3;                // after the water they float on
  mesh.userData = { kind: 'lilyPads', count: pads.length, dispose() { g.dispose(); mat.dispose(); } };
  return mesh;
}

