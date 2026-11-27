/* ==========================================================================
   boss-light.js  —  the boss hall's light on everything that does not light itself (her, the sprite's plants, the doors)

     const light = createBossLight({ volume, lightScale, fireScale })   // volume: { data (Uint8, RGBA), nx, ny, nz, x0, y0, z0, cell }
     light.apply(root)                         // once everything is in the scene (as cave-light.js' apply)
     light.setSprite(position, on)             // every frame: where the sprite's light is (the one light that moves)
     light.uniforms                            // shared with the hall's own shaders: uBossFront, uBossFire are the fires'
     light.chunk                               // GLSL for a shader of one's own: vec3 bossLightAt(vec3 world)

   The hall's light is baked (tools/make-boss-hall.py) as a coarse picture of the air (1 m cells, a 3D texture): RGB the light
   that is always there (the dark, the pale shaft, the fires before the door), A the light of every other fire as one number.
   The fires are coloured here (uBossFire: blue, red once the statues wake) and only where they have caught: they catch from
   the door toward the throne as the door opens (uBossFront, a z: north of it nothing burns yet). The same hook as
   cave-light.js: every material of the kits fades into the haze through `vHaze = hazeAt(...)` (a skinned character is found
   by three's <project_vertex>); after it `vCave = caveAt(...)`; in the fragment what the material drew times vCave.
   A material with userData.noCave (the sprite, the spells' light) is left alone. One texture read a vertex.
   ========================================================================== */
import * as THREE from 'three';

const CHUNK = /* glsl */`
uniform highp sampler3D uBossVol;
uniform vec3 uBossBox0, uBossBoxS;        // the picture's corner (world) and 1 / its size (metres)
uniform float uBossLS, uBossFS, uBossFront, uBossOn, uBossRoll;          // (uBossOn: how much of it falls on her: her colours are lighter than stone)
uniform vec3 uBossFire;
uniform vec4 uSprPos;                     // xyz: the sprite's light, w: its reach (0: off)
uniform vec3 uSprCol;
vec3 bossLightAt(vec3 w) {
  vec4 t = texture(uBossVol, clamp((w - uBossBox0) * uBossBoxS, 0.0, 1.0));
  float caught = clamp((w.z - uBossFront) / 5.0 + 0.5, 0.0, 1.0);
  vec3 c = (t.rgb * uBossLS + t.a * uBossFS * uBossFire * caught) * uBossOn;
  c /= 1.0 + uBossRoll * max(c.r, max(c.g, c.b));            // (near a fire the light rolls off, not burns her to white)
  float d = distance(w, uSprPos.xyz) / max(uSprPos.w, 1e-3);
  float s = uSprPos.w > 0.0 ? (1.0 - smoothstep(0.0, 1.0, d)) / (1.0 + 9.0 * d * d) : 0.0;
  return c + uSprCol * s;
}
`;
const VERT = CHUNK + /* glsl */`
varying vec3 vCave;
vec3 caveAt(vec3 viewPos) { return bossLightAt(cameraPosition + viewPos * mat3(viewMatrix)); }
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

export function createBossLight({ volume, lightScale = 4, fireScale = 4, sprite = '#ffe2b0', reach = 8.5, strength = 1.0, fire = [0.36, 0.74, 1.0], on = 0.62, roll = 0.6 }) {
  const tex = new THREE.Data3DTexture(volume.data, volume.nx, volume.ny, volume.nz);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  const span = new THREE.Vector3((volume.nx - 1) * volume.cell, (volume.ny - 1) * volume.cell, (volume.nz - 1) * volume.cell);
  const col = new THREE.Color(sprite);
  const uniforms = {
    uBossVol: { value: tex },
    // texel centres: the corner cell's middle is at x0 (the bake samples cell centres at x0 + i * cell)
    uBossBox0: { value: new THREE.Vector3(volume.x0 - volume.cell / 2, volume.y0 - volume.cell / 2, volume.z0 - volume.cell / 2) },
    uBossBoxS: { value: new THREE.Vector3(1 / (span.x + volume.cell), 1 / (span.y + volume.cell), 1 / (span.z + volume.cell)) },
    uBossLS: { value: lightScale }, uBossFS: { value: fireScale },
    uBossFront: { value: 999 },
    uBossOn: { value: on }, uBossRoll: { value: roll },                       // (nothing caught yet: every fire north of z 999)
    uBossFire: { value: new THREE.Vector3(...fire) },
    uSprPos: { value: new THREE.Vector4(0, -999, 0, reach) },
    uSprCol: { value: new THREE.Vector3(col.r, col.g, col.b).multiplyScalar(strength) },
  };
  const done = new Set();
  return {
    uniforms, texture: tex, chunk: CHUNK,
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
