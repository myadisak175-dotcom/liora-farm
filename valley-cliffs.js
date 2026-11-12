// valley-cliffs.js
// Gives the valley's cliff faces real body: blocks of bedrock ('slabs' in stylized-cliffs.js) stood in front of each steep
// stretch, so the face has steps, corners and a broken skyline instead of being one stretched sheet of ground. The land
// itself stays as it is (stylized-terrain.js), and the blocks are painted with the land's own rock layers and grass, so
// they read as the same cliff, only solid.
//
//   const { list, colliders } = valleyCliffPieces({ V, heightAt, z0, z1, skip });
//   group.add(createCliffSet(list, { material: valleyCliffMaterial() }));      // one mesh, one draw call
//
// Where: both sides of the river, between z0 and z1, every steep stretch going out from the river (the lower tier of the
// cliffs and the upper one). skip(x, z) says where to leave the face bare (paths cut into it, and so on).

import * as THREE from 'three';
import { _internal } from './stylized-nature.js';
import { _strata } from './stylized-terrain.js';

const { NOISE, HAZEF, rgb, shared } = _internal;

// The land's own paint: the same strata on every face that stands, the same grass on every face that lies flat.
let material = null;
export function valleyCliffMaterial() {
  if (material) return material;
  const C = _strata.colors;
  return (material = new THREE.ShaderMaterial({
    uniforms: {
      uR0: { value: rgb(C.rock[0]) }, uR1: { value: rgb(C.rock[1]) }, uR2: { value: rgb(C.rock[2]) }, uR3: { value: rgb(C.rock[3]) },
      uG0: { value: rgb(C.grass[0]) }, uG1: { value: rgb(C.grass[1]) }, uG2: { value: rgb(C.grass[2]) }, uG3: { value: rgb(C.grass[3]) },
      uHaze: shared.uHaze, uHazeNear: shared.uHazeNear, uHazeFar: shared.uHazeFar, uHazeMax: shared.uHazeMax,
    },
    vertexShader: /* glsl */`
      uniform float uHazeNear, uHazeFar, uHazeMax;
      varying vec3 vWP;
      varying vec3 vN;
      varying float vHaze;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vHaze = uHazeMax * smoothstep(uHazeNear, uHazeFar, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${_strata.GLSL}
      ${HAZEF}
      uniform vec3 uR0, uR1, uR2, uR3, uG0, uG1, uG2, uG3;
      varying vec3 vWP;
      varying vec3 vN;
      void main() {
        vec3 n = normalize(vN);
        float j = noise2(vWP.xz * 0.9) * 0.5 + noise2(vWP.xz * 3.0) * 0.25;
        vec3 col;
        if (n.y + (j - 0.37) * 0.3 < 0.7) {
          float v = strataTone(vWP, n);
          col = v > 0.72 ? uR0 : (v > 0.56 ? uR1 : (v > 0.4 ? uR2 : uR3));
        } else {                                                            // a top or a step: grass, as on the land
          float s = noise2(vWP.xz * 0.08) * 0.6 + noise2(vWP.xz * 0.3) * 0.3 + noise2(vWP.xz * 1.6) * 0.1;
          float g = s * 0.6 + (dot(n, normalize(vec3(-0.3, 1.0, 0.35))) - 0.9) * 2.6 + 0.2;
          col = g > 0.6 ? uG3 : (g > 0.45 ? uG2 : (g > 0.3 ? uG1 : uG0));
        }
        gl_FragColor = vec4(mix(col, uHaze, vHaze), 1.0);
      }`,
  }));
}

const STEP = 3.6;          // metres along the valley between pieces (they are wider than this, so they overlap)
const WIDTH = 5.4, DEPTH = 3.2;

// out from the river at z on one side: every stretch where the land climbs steeply, with its foot and its top
function facesAt(V, heightAt, z, side) {
  const cx = V.riverX(z), out = [];
  let start = null, prev = heightAt(cx + side * 6, z);
  for (let a = 6.25; a < 48; a += 0.25) {
    const h = heightAt(cx + side * a, z), steep = (h - prev) / 0.25 > 0.9;
    if (steep && start === null) start = { a: a - 0.25, h: prev };
    if (!steep && start !== null) {
      if (h - start.h > 2.2) out.push({ a0: start.a, a1: a, h0: start.h, h1: h });
      start = null;
    }
    prev = h;
  }
  return out;
}

export function valleyCliffPieces({ V, heightAt, z0, z1, skip = () => false, seed = 1 }) {
  const list = [], colliders = [];
  let n = 0;
  for (const side of [-1, 1]) {
    for (let z = z0; z <= z1; z += STEP) {
      const here = facesAt(V, heightAt, z, side);
      const before = facesAt(V, heightAt, z - 1.5, side), after = facesAt(V, heightAt, z + 1.5, side);
      for (const f of here) {
        // the face's line here, from the same face just up and down the valley: which way it faces
        const near = (list2, a) => list2.reduce((b, g) => (Math.abs(g.a0 - a) < Math.abs(b.a0 - a) ? g : b), { a0: 1e9 });
        const fb = near(before, f.a0), fa = near(after, f.a0);
        const xb = V.riverX(z - 1.5) + side * (Math.abs(fb.a0 - f.a0) < 3 ? fb.a0 : f.a0), xa = V.riverX(z + 1.5) + side * (Math.abs(fa.a0 - f.a0) < 3 ? fa.a0 : f.a0);
        let nx = 3, nz = -(xa - xb);                                        // perpendicular to the face's line (dx, 3)
        if (nx * -side < 0) { nx = -nx; nz = -nz; }                        // towards the river
        const l = Math.hypot(nx, nz); nx /= l; nz /= l;
        const fx = V.riverX(z) + side * f.a0, fz = z;
        if (skip(fx, fz)) continue;
        const height = f.h1 - f.h0 + 0.6;
        // the piece's front stands just in front of the foot of the face; its body goes back into the hill
        const x = fx - nx * (DEPTH / 2 - 0.25), zz = fz - nz * (DEPTH / 2 - 0.25);
        list.push({ type: 'slabs', x, y: f.h0, z: zz, rotY: Math.atan2(nx, nz), seed: seed * 1000 + n++, opts: { width: WIDTH, height, depth: DEPTH } });
        if (f.h0 < 4) {                                                    // pieces standing on the valley floor: solid to walk into
          const c = Math.cos(Math.atan2(nx, nz)), s = Math.sin(Math.atan2(nx, nz));
          for (const u of [-1.8, 0, 1.8]) colliders.push([x + u * c, zz - u * s, 1.25]);
        }
      }
    }
  }
  return { list, colliders };
}
