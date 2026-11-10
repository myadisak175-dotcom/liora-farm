/* ==========================================================================
   cloud-shadows.js  —  soft shadows of clouds drifting over the land

     const shadows = createCloudShadows({ sky });      // sky from volumetric-sky.js (wind, cloud amount, sliders)
     shadows.apply(scene);                             // once, after everything is in the scene
     shadows.update();                                 // every frame

   The map is ~150 m across and a real cumulus shadow is kilometres wide, so real-scale shadows would simply turn
   the whole meadow dark for minutes. Instead the shadows are patches a few dozen metres wide: a tiling noise
   picture that slides over the land with the same wind as the clouds, and grows when the sky gets cloudier.

   How it reaches every material without editing five libraries: every material of the kit fades into the haze
   through a `vHaze` varying, computed from the view-space position. apply() adds a second varying next to it,
   `vCloud` (how deep in shadow this vertex is, one texture read), and tints the final colour by it. Skinned
   characters have no haze; they are recognised by three's <project_vertex> chunk instead.
   The water surface is left alone: what shows through it is already shadowed, and a reflection is not.
   The same hook carries the light of the hour (uGrade): every material of the scene is multiplied by one colour that the
   time-of-day controller changes (white at noon, warm at dusk, blue at night).
   Mobile-safe: no uniform arrays, no loops in the shaders.
   ========================================================================== */
import * as THREE from 'three';
import { _internal } from './stylized-nature.js';

const { mulberry32 } = _internal;

// a tiling picture of soft blobs (Perlin, two sizes)
function shadowNoise(S, seed) {
  const rng = mulberry32(seed * 131 + 7);
  const perm = new Uint8Array(512);
  {
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (ix, iy, dx, dy) => { const a = perm[perm[ix] + iy] * (Math.PI * 2 / 256); return Math.cos(a) * dx + Math.sin(a) * dy; };
  const perlin = (x, y, P) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, x0 = ix % P, x1 = (ix + 1) % P, y0 = iy % P, y1 = (iy + 1) % P;
    const u = fade(fx), v = fade(fy);
    const a = grad(x0, y0, fx, fy), b = grad(x1, y0, fx - 1, fy), c = grad(x0, y1, fx, fy - 1), d = grad(x1, y1, fx - 1, fy - 1);
    return a + (b - a) * u + (c + (d - c) * u - a - (b - a) * u) * v;
  };
  const data = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const n = perlin(u * 3, v * 3, 3) + 0.45 * perlin(u * 7 + 0.3, v * 7 + 0.6, 7) + 0.15 * perlin(u * 15, v * 15, 15);
    data[y * S + x] = 255 * Math.min(1, Math.max(0, 0.5 + n * 0.95));
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */`
uniform sampler2D uCloudTex;
uniform vec2 uCloudOff;
uniform vec3 uCloudP;          // 1 / patch size, threshold, strength
uniform vec2 uCloudFade;       // distance from the middle of the map where the shadows start and finish fading out
varying float vCloud;
float cloudShade(vec3 viewPos) {
  vec3 w = cameraPosition + viewPos * mat3(viewMatrix);                 // back from view space to the world
  float c = texture2D(uCloudTex, (w.xz + uCloudOff) * uCloudP.x).r;
  // none on the far land: it has to melt into the haze without dark patches
  return smoothstep(uCloudP.y, uCloudP.y + 0.16, c) * uCloudP.z * (1.0 - smoothstep(uCloudFade.x, uCloudFade.y, length(w.xz)));
}
`;
const FRAG = /* glsl */`
uniform vec3 uCloudCol;
uniform vec3 uGrade;          // the light of the hour: what everything is multiplied by (white at noon, warm at dusk, blue at night)
varying float vCloud;
`;

// the text between the bracket at `open` and its partner
function inside(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}
const beforeEnd = (src, code) => { const i = src.lastIndexOf('}'); return src.slice(0, i) + code + src.slice(i); };   // main() is the last thing in every shader of the kit

function patch(mat, uniforms) {
  let vs = mat.vertexShader, fs = mat.fragmentShader, hazed = false;
  if (vs.includes('vHaze =')) {
    // after every "vHaze = ...(<view position>)...;" also work out the shadow there
    let out = '', at = 0;
    for (;;) {
      const i = vs.indexOf('vHaze =', at);
      if (i < 0) break;
      const end = vs.indexOf(';', i), stmt = vs.slice(i, end);
      const call = stmt.search(/hazeAt\(|length\(/);
      const arg = call < 0 ? null : inside(stmt, stmt.indexOf('(', call));
      if (!arg) return false;
      out += vs.slice(at, end + 1) + ` vCloud = cloudShade(${arg});`;
      at = end + 1;
    }
    vs = out + vs.slice(at);
    hazed = fs.includes('uHaze') && fs.includes('vHaze');
  } else if (vs.includes('#include <project_vertex>')) {
    vs = beforeEnd(vs, '\n  vCloud = cloudShade(mvPosition.xyz);\n');
  } else return false;
  // tint what the material drew, but not the haze laid over it
  fs = beforeEnd(fs, hazed
    ? '\n  { vec3 cH = uHaze * vHaze; gl_FragColor.rgb = (gl_FragColor.rgb - cH) * mix(vec3(1.0), uCloudCol, vCloud) * uGrade + cH; }\n'
    : '\n  gl_FragColor.rgb *= mix(vec3(1.0), uCloudCol, vCloud) * uGrade;\n');
  mat.vertexShader = VERT + vs;
  mat.fragmentShader = FRAG + fs;
  Object.assign(mat.uniforms, uniforms);
  mat.needsUpdate = true;
  return true;
}

// a shader that cannot take the cloud shadow still gets the light of the hour (water gets a softer dose: it already mirrors a graded world)
function patchGrade(mat, uniforms, name) {
  if (mat.fragmentShader.includes('uniform vec3 ' + name + ';')) return false;
  mat.fragmentShader = 'uniform vec3 ' + name + ';\n' + beforeEnd(mat.fragmentShader, '\n  gl_FragColor.rgb *= ' + name + ';\n');
  mat.uniforms[name] = uniforms[name];
  mat.needsUpdate = true;
  return true;
}

export function createCloudShadows({ sky, seed = 2, color = [0.55, 0.62, 0.76], fadeA = 85, fadeB = 115 } = {}) {
  const tune = sky.userData.tune;
  const tex = shadowNoise(256, seed);
  const uniforms = {
    uCloudTex: { value: tex }, uCloudOff: { value: new THREE.Vector2() }, uCloudP: { value: new THREE.Vector3(1 / 380, 0.55, 0.5) },
    uCloudCol: { value: new THREE.Vector3(...color) }, uCloudFade: { value: new THREE.Vector2(fadeA, fadeB) },
    uGrade: { value: new THREE.Vector3(1, 1, 1) }, uGradeW: { value: new THREE.Vector3(1, 1, 1) },
  };
  let strength = 1;
  const done = new Set();
  return {
    uniforms,
    // give every material under root the shadow; returns how many took it
    apply(root, skip = m => !!(m.uniforms && m.uniforms.uThrough)) {
      let n = 0;
      root.traverse(o => {
        for (const m of [].concat(o.material || [])) {
          if (!m.isShaderMaterial || done.has(m)) continue;
          done.add(m);
          if (m.userData && m.userData.noGrade) continue;                                  // the sky draws its own light
          if (skip(m)) { if (patchGrade(m, uniforms, 'uGradeW')) n++; continue; }          // water: a softer grade
          if (patch(m, uniforms)) n++;
          else if (patchGrade(m, uniforms, 'uGrade')) n++;
        }
      });
      return n;
    },
    update() {
      const d = sky.userData.drift;
      uniforms.uCloudOff.value.set(d.x, d.y);
      // cloudier sky -> more of the land in shadow
      uniforms.uCloudP.value.set(1 / tune.shadowSize.value, 0.74 - 0.4 * tune.cover.value, tune.shadow.value * strength);
    },
    get strength() { return strength; },
    set strength(v) { strength = v; },       // cloud shadows fade out with the daylight
    dispose() { tex.dispose(); },
  };
}
