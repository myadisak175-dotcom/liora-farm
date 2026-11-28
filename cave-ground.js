/* ==========================================================================
   cave-ground.js  —  the ground of a room of the caves' kit: its rock, its laid stone, and what lies on its floors

     const ground = await createCaveGround({ floor, scale, sprite, look })
       floor    the room's floor map (cave-level.js' header: spans; fl in cm, paint r earth, g sand, b moss, a 150: slabs)
       scale    what the baked light was divided by (bin.lightScale)
       sprite   { uSprPos, uSprCol }: the one light that moves (cave-light.js' uniforms, shared)
     new THREE.Mesh(geometry, ground.material)        // geometry: position, normal, aLight (rgb: the light baked on it),
                                                      // aInfo (r: laid stone, g: how open to the room)

   One job: one material for the whole rock of any kit room (tools/make-cave-room.py bakes the mesh), so a room brings no
   drawing code of its own. (Until the kit each room had its own: fang-hall.js, cave-hall.js, boss-hall.js; their looks are
   where this one's come from.) What it draws:
     natural rock   the cliffs' brush-painted rock (cliff-paint.webp) laid on from two sides, finer copies of it up close;
                    the roof the same rock from above, darker
     its floors     damp stone, and over it what the bake's paint says there: moss, earth (a trodden way), sand; read
                    smooth from a picture of the paint, not from the mesh's corners. A room may have floors over one
                    another (spans): the paint and the floors' heights are kept one span beside the next in two pictures,
                    and each bit of floor takes the paint of the span whose floor is at its own height
     laid stone     where the bake says built: blocks on walls (boss-blocks-paint.webp), slabs underfoot
                    (boss-slabs-paint.webp); on a slope the slabs are steps: a riser's dark line every 0.2 m of height
     the light      baked (the lamps with their shadows, the dark's own); the sprite's; a faint edge where the rock turns
                    away from the eye; the dark of the cave far off
   The water, the mist and the things in a room are other files' (the kit's next pieces).
   ========================================================================== */
import * as THREE from 'three';

export const GROUND_LOOK = {
  fog: '#0a1420', fogDensity: 0.018, rim: '#2b4d68',
  rockTint: [0.8, 0.85, 0.95], floorTint: [0.62, 0.66, 0.74], earthTint: [0.66, 0.68, 0.76], sandTint: [0.6, 0.63, 0.7],
  builtTint: [0.82, 0.88, 1.0],
};
const MAX_SPANS = 4;          // (a column's spans the floor's paint is told apart by: more are drawn with the fourth's)

const loadTex = (url) => new Promise((res) => {
  new THREE.TextureLoader().load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4; t.needsUpdate = true; res(t);
  }, undefined, () => res(null));
});
const hex3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };

const VS = /* glsl */`
attribute vec4 aLight;
attribute vec4 aInfo;
uniform float uScale;
varying vec3 vW, vN, vL;
varying vec4 vI;
varying float vD;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vL = aLight.rgb * uScale; vI = aInfo;
  vec4 mv = viewMatrix * w;
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */`
uniform sampler2D uCliff, uMossT, uEarth, uSand, uBlocks, uSlabs;
uniform sampler2D uFloorH, uFloorP;         // every span's floor height (m) and paint: span s of column (i, j) at ((j + s * nz), i)
uniform vec4 uMapBox;                       // the floor map: x0, z0 (less half a cell), 1 / (nz * cell), 1 / (nx * cell)
uniform vec2 uSpans;                        // how many spans a column has in the pictures; half a column of one span's width
uniform vec2 uCliffTile;
uniform vec4 uFloorTile;                    // repeats a metre: the moss, the earth, the sand, laid stone
uniform vec3 uEarthTint, uSandTint, uTint, uFloorTint, uBuiltTint, uFogCol, uRim;
uniform float uFogD;
uniform vec4 uSprPos;
uniform vec3 uSprCol;
varying vec3 vW, vN, vL;
varying vec4 vI;
varying float vD;
void main() {
  vec3 n = normalize(vN);
  float built = smoothstep(0.35, 0.65, vI.r);
  vec2 pw = pow(abs(n.xz), vec2(4.0)); pw /= max(pw.x + pw.y, 1e-4);
  vec2 ua = vec2(vW.z, vW.y), ub = vec2(vW.x, vW.y);
  float up = smoothstep(0.5, 0.86, n.y), down = smoothstep(-0.3, -0.7, n.y);
  float near = 1.0 - smoothstep(7.0, 18.0, vD);
  // ---- natural rock
  vec3 wall = texture2D(uCliff, ua * uCliffTile).rgb * pw.x + texture2D(uCliff, ub * uCliffTile).rgb * pw.y;
  if (near > 0.0) {
    vec3 fine = texture2D(uCliff, ua * uCliffTile * 3.7 + 0.53).rgb * pw.x + texture2D(uCliff, ub * uCliffTile * 3.7 + 0.53).rgb * pw.y;
    wall = mix(wall, wall * (0.45 + 1.1 * fine), 0.65 * near);
    float closer = 1.0 - smoothstep(2.5, 8.0, vD);
    if (closer > 0.0) {
      vec3 finer = texture2D(uCliff, ua * uCliffTile * 10.0 + 0.21).rgb * pw.x + texture2D(uCliff, ub * uCliffTile * 10.0 + 0.21).rgb * pw.y;
      wall = mix(wall, wall * (0.4 + 1.2 * finer), 0.55 * closer);
    }
  }
  vec3 roof = texture2D(uCliff, vW.xz * uCliffTile.x * 1.4 + 0.37).rgb;
  vec3 alb = mix(wall * uTint, roof * uTint * 0.9, down);
  if (up > 0.002 && built < 0.998) {
    // underfoot: damp stone, and over it what the bake's paint says (moss, earth, sand), their edges ragged by the stone
    vec3 stone = texture2D(uCliff, vW.xz * uCliffTile.x * 1.9 + 0.11).rgb * uFloorTint;
    stone *= 0.6 + 0.8 * texture2D(uCliff, vW.xz * uCliffTile.x * 7.0 + 0.71).r;
    vec3 ground = stone;
    // the span whose floor is at this height: its paint, read smooth from the paint's own picture
    float u = (vW.z - uMapBox.y) * uMapBox.z, v = (vW.x - uMapBox.x) * uMapBox.w;
    float best = 1e3, span = 0.0;
    for (int s = 0; s < ${MAX_SPANS}; s++) {
      if (float(s) >= uSpans.x) break;
      float d = abs(vW.y - texture2D(uFloorH, vec2((clamp(u, 0.0, 1.0) + float(s)) / uSpans.x, v)).r);
      if (d < best) { best = d; span = float(s); }
    }
    float onFloor = 1.0 - smoothstep(0.35, 0.9, best);
    if (onFloor > 0.0) {
      vec3 pc = texture2D(uFloorP, vec2((clamp(u, uSpans.y, 1.0 - uSpans.y) + span) / uSpans.x, v)).rgb;
      float rag = (dot(stone, vec3(0.3, 0.59, 0.11)) - 0.3) * 1.8;
      float m = smoothstep(0.3, 0.6, pc.b + rag * 0.35) * onFloor, e = smoothstep(0.32, 0.62, pc.r + rag * 0.3) * onFloor, s = smoothstep(0.32, 0.62, pc.g + rag * 0.2) * onFloor;
      if (m > 0.0) ground = mix(ground, texture2D(uMossT, vW.xz * uFloorTile.x).rgb, m);
      if (e > 0.0) ground = mix(ground, texture2D(uEarth, vW.xz * uFloorTile.y).rgb * uEarthTint, e);
      if (s > 0.0) ground = mix(ground, texture2D(uSand, vW.xz * uFloorTile.z).rgb * uSandTint, s);
    }
    alb = mix(alb, ground, up);
  }
  // ---- laid stone: blocks on its faces, slabs underfoot; on a slope the slabs are steps
  if (built > 0.002) {
    vec3 blocks = (texture2D(uBlocks, ua * uFloorTile.w).rgb * pw.x + texture2D(uBlocks, ub * uFloorTile.w).rgb * pw.y) * 1.3;
    vec3 slabs = texture2D(uSlabs, vW.xz * uFloorTile.w).rgb * 1.4;
    float sloped = smoothstep(0.9995, 0.992, n.y) * up, ph = fract(vW.y / 0.2);
    slabs *= 1.0 - 0.5 * sloped * (1.0 - smoothstep(0.0, 0.16, ph));
    slabs += 0.09 * sloped * smoothstep(0.84, 1.0, ph);
    alb = mix(alb, mix(mix(blocks, blocks * 0.78, down), slabs, up) * uBuiltTint, built);
  }
  // ---- the light: baked; the sprite's
  vec3 L = vL;
  vec3 d = uSprPos.xyz - vW; float dist = length(d);
  float k = dist / max(uSprPos.w, 1e-3);
  float s = uSprPos.w > 0.0 ? (1.0 - smoothstep(0.0, 1.0, k)) / (1.0 + 9.0 * k * k) : 0.0;
  L += uSprCol * s * clamp(dot(n, d / max(dist, 1e-3)) * 0.65 + 0.35, 0.0, 1.0);
  vec3 col = alb * L;
  vec3 vdir = normalize(cameraPosition - vW);
  col += uRim * pow(1.0 - max(dot(n, vdir), 0.0), 3.0) * (0.35 + 0.65 * vI.g) * (1.0 - 0.85 * up);
  col = mix(col, uFogCol, clamp(1.0 - exp(-vD * uFogD), 0.0, 0.88));
  gl_FragColor = vec4(col, 1.0);
}`;

export async function createCaveGround({ ground = './assets/ground/', floor, scale = 4, sprite = null, look = GROUND_LOOK } = {}) {
  const [cliff, mossT, earth, sand, blocks, slabs] = await Promise.all([
    loadTex(ground + 'cliff-paint.webp'), loadTex(ground + 'cave-moss-paint.webp'), loadTex(ground + 'path-dirt.webp'),
    loadTex(ground + 'path-sand.webp'), loadTex(ground + 'boss-blocks-paint.webp'), loadTex(ground + 'boss-slabs-paint.webp'),
  ]);
  // the floor map as two pictures (u along z, a span beside the next; v along x): every span's floor height, its paint
  const { nx, nz, x0, z0, cell } = floor, n = nx * nz, K = Math.min(MAX_SPANS, floor.layers || 1), W = K * nz;
  const H = new Float32Array(W * nx), P = new Uint8Array(W * nx * 4);
  for (let i = 0; i < nx; i++) for (let s = 0; s < K; s++) for (let j = 0; j < nz; j++) {
    const q = s * n + i * nz + j, t = i * W + s * nz + j, f = floor.fl[q];
    H[t] = f === -32768 ? -1e4 : f / 100;
    P[t * 4] = floor.paint[q * 4]; P[t * 4 + 1] = floor.paint[q * 4 + 1]; P[t * 4 + 2] = floor.paint[q * 4 + 2]; P[t * 4 + 3] = floor.paint[q * 4 + 3];
  }
  const floorH = new THREE.DataTexture(H, W, nx, THREE.RedFormat, THREE.FloatType);
  const floorP = new THREE.DataTexture(P, W, nx, THREE.RGBAFormat);
  floorH.magFilter = floorH.minFilter = THREE.NearestFilter;
  floorP.magFilter = floorP.minFilter = THREE.LinearFilter;
  for (const t of [floorH, floorP]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.needsUpdate = true; }
  const fogCol = hex3(look.fog);
  const uniforms = {
    uScale: { value: scale }, uCliff: { value: cliff }, uMossT: { value: mossT }, uEarth: { value: earth }, uSand: { value: sand },
    uBlocks: { value: blocks }, uSlabs: { value: slabs }, uFloorH: { value: floorH }, uFloorP: { value: floorP },
    uMapBox: { value: new THREE.Vector4(x0 - cell / 2, z0 - cell / 2, 1 / (nz * cell), 1 / (nx * cell)) },
    uSpans: { value: new THREE.Vector2(K, 0.5 / nz) },
    uCliffTile: { value: new THREE.Vector2(1 / 13, 1 / 7) }, uFloorTile: { value: new THREE.Vector4(1 / 3.6, 1 / 2.6, 1 / 2.3, 0.25) },
    uEarthTint: { value: new THREE.Vector3(...look.earthTint) }, uSandTint: { value: new THREE.Vector3(...look.sandTint) },
    uTint: { value: new THREE.Vector3(...look.rockTint) }, uFloorTint: { value: new THREE.Vector3(...look.floorTint) },
    uBuiltTint: { value: new THREE.Vector3(...look.builtTint) },
    uFogCol: { value: fogCol }, uFogD: { value: look.fogDensity }, uRim: { value: hex3(look.rim) },
    uSprPos: sprite ? sprite.uSprPos : { value: new THREE.Vector4(0, -999, 0, 0) },
    uSprCol: sprite ? sprite.uSprCol : { value: new THREE.Vector3(0, 0, 0) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms });
  material.userData.noCave = true;                       // (its light is its own: baked, and the sprite's read here)
  return {
    material, uniforms, fogColor: fogCol,
    dispose() { material.dispose(); floorH.dispose(); floorP.dispose(); for (const t of [cliff, mossT, earth, sand, blocks, slabs]) if (t) t.dispose(); },
  };
}
