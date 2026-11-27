/* ==========================================================================
   cave-light.js  —  the light inside a cave, on everything that does not light itself

     const light = createCaveLight({ volume, scale })      // volume: { data (Uint8, RGBA), nx, ny, nz, x0, y0, z0, cell }
     light.apply(root)                                     // once everything is in the scene (as cloud-shadows' apply)
     light.setSprite(position, on)                         // every frame: where the sprite's light is (the one light that moves)
     light.uniforms                                        // shared by every material it has patched (and by the rock's own)

   Out of doors every plant is lit by the sun and the hour (cloud-shadows.js multiplies every material by the hour's light).
   Under the ground there is no hour: the light is where it was baked (tools/make-cave-hall.py) — the shaft from the crack,
   the sky seen through it, the warm light thrown back off the sunlit floor, the crystals' glow — kept as a coarse picture of
   the air (1 m cells, RGB, a 3D texture). This hook reads that picture where each vertex is, adds the sprite's light (it
   floats at her shoulder: a warm round light that goes with her), and multiplies what the material drew by it.

   How it reaches every material without editing the kits (the same way as cloud-shadows.js): every plant material of the
   kit fades into the haze through `vHaze = hazeAt(<view position>)`; after each of those this adds `vCave = caveAt(...)`;
   a skinned character has no haze and is found by three's <project_vertex> chunk. In the fragment: what the material drew,
   less the haze laid over it, times vCave, plus the haze again (far plants melt into the cave's dark, lit or not).
   A material with userData.noCave (the crystals, the shaft, the sprite: they light themselves) is left alone.
   Mobile-safe: one texture read per vertex, no loops, no uniform arrays.
   ========================================================================== */
import * as THREE from 'three';

const VERT = /* glsl */`
uniform highp sampler3D uCaveVol;
uniform vec3 uCaveBox0, uCaveBoxS;        // the picture's corner (world) and 1 / its size (metres)
uniform float uCaveScale;
uniform vec4 uSprPos;                     // xyz: the sprite's light, w: its reach (0: off)
uniform vec3 uSprCol;
varying vec3 vCave;
vec3 caveAt(vec3 viewPos) {
  vec3 w = cameraPosition + viewPos * mat3(viewMatrix);                 // back from view space to the world
  vec3 c = texture(uCaveVol, clamp((w - uCaveBox0) * uCaveBoxS, 0.0, 1.0)).rgb * uCaveScale;
  float d = distance(w, uSprPos.xyz) / max(uSprPos.w, 1e-3);
  float s = uSprPos.w > 0.0 ? (1.0 - smoothstep(0.0, 1.0, d)) / (1.0 + 9.0 * d * d) : 0.0;
  return c + uSprCol * s;
}
`;
const FRAG = /* glsl */`
varying vec3 vCave;
`;

function inside(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}
const beforeEnd = (src, code) => { const i = src.lastIndexOf('}'); return src.slice(0, i) + code + src.slice(i); };

function patch(mat, uniforms) {
  let vs = mat.vertexShader, fs = mat.fragmentShader, hazed = false;
  if (vs.includes('vHaze =')) {
    let out = '', at = 0;
    for (;;) {
      const i = vs.indexOf('vHaze =', at);
      if (i < 0) break;
      const end = vs.indexOf(';', i), stmt = vs.slice(i, end);
      const call = stmt.search(/hazeAt\(|length\(/);
      const arg = call < 0 ? null : inside(stmt, stmt.indexOf('(', call));
      if (!arg) return false;
      out += vs.slice(at, end + 1) + ` vCave = caveAt(${arg});`;
      at = end + 1;
    }
    vs = out + vs.slice(at);
    hazed = fs.includes('uHaze') && fs.includes('vHaze');
  } else if (vs.includes('#include <project_vertex>')) {
    vs = beforeEnd(vs, '\n  vCave = caveAt(mvPosition.xyz);\n');
  } else return false;
  fs = beforeEnd(fs, hazed
    ? '\n  { vec3 cH = uHaze * vHaze; gl_FragColor.rgb = (gl_FragColor.rgb - cH) * vCave + cH; }\n'
    : '\n  gl_FragColor.rgb *= vCave;\n');
  mat.vertexShader = VERT + vs;
  mat.fragmentShader = FRAG + fs;
  Object.assign(mat.uniforms, uniforms);
  mat.needsUpdate = true;
  return true;
}

export function createCaveLight({ volume, scale = 4, sprite = '#ffe2b0', reach = 8.5, strength = 1.0 }) {
  const tex = new THREE.Data3DTexture(volume.data, volume.nx, volume.ny, volume.nz);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  const span = new THREE.Vector3((volume.nx - 1) * volume.cell, (volume.ny - 1) * volume.cell, (volume.nz - 1) * volume.cell);
  const col = new THREE.Color(sprite);
  const uniforms = {
    uCaveVol: { value: tex },
    // texel centres: the corner cell's middle is at x0 (the bake samples cell centres at x0 + i * cell)
    uCaveBox0: { value: new THREE.Vector3(volume.x0 - volume.cell / 2, volume.y0 - volume.cell / 2, volume.z0 - volume.cell / 2) },
    uCaveBoxS: { value: new THREE.Vector3(1 / (span.x + volume.cell), 1 / (span.y + volume.cell), 1 / (span.z + volume.cell)) },
    uCaveScale: { value: scale },
    uSprPos: { value: new THREE.Vector4(0, -999, 0, reach) },
    uSprCol: { value: new THREE.Vector3(col.r, col.g, col.b).multiplyScalar(strength) },
  };
  const done = new Set();
  return {
    uniforms, texture: tex,
    apply(root) {
      let n = 0;
      root.traverse(o => {
        for (const m of [].concat(o.material || [])) {
          if (!m.isShaderMaterial || done.has(m)) continue;
          done.add(m);
          if (m.userData && m.userData.noCave) continue;
          if (patch(m, uniforms)) n++;
        }
      });
      return n;
    },
    setSprite(p, on = true) { uniforms.uSprPos.value.set(p.x, p.y, p.z, on ? reach : 0); },
    get reach() { return reach; },
    dispose() { tex.dispose(); },
  };
}
