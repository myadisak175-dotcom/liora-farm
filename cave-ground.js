/* ==========================================================================
   cave-ground.js  —  the ground of a room of the caves' kit: its rock, its laid stone, and what lies on its floors

     const ground = await createCaveGround({ floor, scale, sprite, look })
       floor    the room's floor map (cave-level.js' header: spans; fl in cm, paint r earth, g sand, b moss, a 150: slabs)
       scale    what the baked light was divided by (bin.lightScale)
       sprite   { uSprPos, uSprCol }: the one light that moves (cave-light.js' uniforms, shared)
       look     the room's own colours (GROUND_LOOK, below; a room's description may change any of them)
     new THREE.Mesh(geometry, ground.material)
       geometry: position, normal, aLight (rgb: the light baked on it; a: a step's own tone, 0.5 none),
                 aInfo (r: laid stone, g: how open to the room, b: on a step, from its back, 0, to its edge, 1; a: 1 a step)

   One job: one material for the whole rock of any kit room (tools/make-cave-room.py bakes the mesh), so a room brings no
   drawing code of its own. (Until the kit each room had its own: fang-hall.js, cave-hall.js, boss-hall.js; their looks are
   where this one's come from.) What it draws:
     natural rock   the cliffs' brush-painted rock (cliff-paint.webp) laid on from two sides, finer copies of it up close;
                    the roof the same rock from above, darker
     its floors     damp stone, and over it what the bake's paint says there: moss, earth (a trodden way), sand; read
                    smooth from a picture of the paint, not from the mesh's corners (FLOORS OVER ONE ANOTHER, below)
     laid stone     where the bake says built: blocks on its faces, slabs underfoot (the boss hall's two pictures, for
                    their joints and patches only: the stone's colour is the look's `built`)
     steps          the bake's real steps (a way with "steps"): each its own worn stone, a little lighter or darker than
                    the next, dark at its back under the step above, a light line along its edge
     the light      baked (the lamps with their shadows, the dark's own); the sprite's; a faint edge where the rock turns
                    away from the eye; the dark of the cave far off
   The water, the mist and the things in a room are other files' (the kit's next pieces).

   FLOORS OVER ONE ANOTHER. The floor map keeps a column's spans lowest first, so one floor is span 0 here and span 1
   three columns on, where a tunnel runs under it. Read smooth (between columns) from that, a floor's paint would mix
   with another floor's. So the spans are laid out anew as SHEETS: a floor keeps one sheet from column to column
   (followed from each span to its neighbours at about its height; a way that winds over itself changes sheet once, on
   its laid stone, where no paint lies), every sheet's edge carried two columns on (so the paint runs to the walls'
   feet). Two pictures hold the sheets side by side: the floors' heights, and their paint; a bit of floor takes the
   paint of the sheet whose floor is at its own height.
   ========================================================================== */
import * as THREE from 'three';

export const GROUND_LOOK = {
  fog: '#0a1420', fogDensity: 0.018, rim: '#2b4d68',
  rock: [0.8, 0.85, 0.95], floor: [0.62, 0.66, 0.74], earth: [0.66, 0.68, 0.76], sand: [0.6, 0.63, 0.7],
  built: [0.62, 0.63, 0.66],                         // the colour of laid stone (old pale stone; the boss hall's: about 0.2, 0.22, 0.28)
};
const NONE = -32768;

const loadTex = (url) => new Promise((res) => {
  new THREE.TextureLoader().load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4; t.needsUpdate = true; res(t);
  }, undefined, () => res(null));
});
const hex3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };

// the floor map's spans as sheets (see FLOORS OVER ONE ANOTHER): two pictures, K sheets side by side (u along z, v along x)
function sheetsOf(floor) {
  const { nx, nz } = floor, n = nx * nz, K = floor.layers || 1, fl = floor.fl, W = K * nz;
  const sheet = new Int8Array(K * n).fill(-1);
  const freeIn = (col, want) => {                          // a sheet no other span of this column has: the one wanted, if it may
    let used = 0;
    for (let s = 0; s < K; s++) { const q = s * n + col; if (fl[q] === NONE) break; if (sheet[q] >= 0) used |= 1 << sheet[q]; }
    if (want >= 0 && !(used & (1 << want))) return want;
    for (let s = 0; s < K; s++) if (!(used & (1 << s))) return s;
    return 0;
  };
  const stack = [];
  for (let q0 = 0; q0 < K * n; q0++) {
    if (fl[q0] === NONE || sheet[q0] >= 0) continue;
    sheet[q0] = freeIn(q0 % n, -1); stack.push(q0);
    while (stack.length) {
      const q = stack.pop(), col = q % n, i = (col / nz) | 0, j = col % nz, f = fl[q];
      for (let e = 0; e < 4; e++) {
        const a = i + (e === 0 ? -1 : e === 1 ? 1 : 0), b = j + (e === 2 ? -1 : e === 3 ? 1 : 0);
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const c2 = a * nz + b;
        for (let s = 0; s < K; s++) {
          const q2 = s * n + c2;
          if (fl[q2] === NONE) break;
          if (sheet[q2] >= 0 || Math.abs(fl[q2] - f) > 60) continue;       // (cm: the same floor, a column on)
          sheet[q2] = freeIn(c2, sheet[q]); stack.push(q2);
        }
      }
    }
  }
  const H = new Float32Array(W * nx).fill(-1e4), P = new Uint8Array(W * nx * 4);
  for (let q = 0; q < K * n; q++) {
    if (fl[q] === NONE) continue;
    const col = q % n, i = (col / nz) | 0, j = col % nz, t = i * W + sheet[q] * nz + j;
    H[t] = fl[q] / 100;
    for (let c = 0; c < 4; c++) P[t * 4 + c] = floor.paint[q * 4 + c];
  }
  // every sheet's edge carried on two columns (its paint to the walls' feet; no other sheet's paint read in at its edge)
  for (let pass = 0; pass < 2; pass++) {
    const H0 = H.slice(), P0 = P.slice();
    for (let s = 0; s < K; s++) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const t = i * W + s * nz + j;
      if (H0[t] > -1e3) continue;
      let m = 0, h = 0, r = 0, g = 0, b = 0, al = 0;
      for (let a = Math.max(0, i - 1); a <= Math.min(nx - 1, i + 1); a++) for (let c = Math.max(0, j - 1); c <= Math.min(nz - 1, j + 1); c++) {
        const u = a * W + s * nz + c;
        if (H0[u] > -1e3) { m++; h += H0[u]; r += P0[u * 4]; g += P0[u * 4 + 1]; b += P0[u * 4 + 2]; al += P0[u * 4 + 3]; }
      }
      if (m) { H[t] = h / m; P[t * 4] = r / m; P[t * 4 + 1] = g / m; P[t * 4 + 2] = b / m; P[t * 4 + 3] = al / m; }
    }
  }
  return { H, P, W, K };
}

const VS = /* glsl */`
attribute vec4 aLight;
attribute vec4 aInfo;
uniform float uScale;
varying vec3 vW, vN, vL;
varying vec4 vI;
varying float vD, vTone;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vL = aLight.rgb * uScale; vTone = 0.75 + 0.5 * aLight.a; vI = aInfo;
  vec4 mv = viewMatrix * w;
  vD = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */`
uniform sampler2D uCliff, uMossT, uEarth, uSand, uBlocks, uSlabs;
uniform sampler2D uFloorH, uFloorP;         // the sheets side by side: their floors' heights (m), their paint
uniform vec4 uMapBox;                       // the floor map: x0, z0 (less half a cell), 1 / (nz * cell), 1 / (nx * cell)
uniform float uHalf;                        // half a column, of one sheet's width
uniform vec2 uCliffTile, uBuiltTile;        // (uBuiltTile: repeats a metre of the blocks, of the slabs)
uniform vec3 uFloorTile;                    // repeats a metre: the moss, the earth, the sand
uniform vec3 uEarthTint, uSandTint, uTint, uFloorTint, uBuilt, uFogCol, uRim;
uniform float uFogD;
uniform vec4 uSprPos;
uniform vec3 uSprCol;
varying vec3 vW, vN, vL;
varying vec4 vI;
varying float vD, vTone;
const vec3 LUM = vec3(0.3, 0.59, 0.11);
void main() {
  vec3 n = normalize(vN);
  float built = smoothstep(0.35, 0.65, vI.r);
  vec2 pw = pow(abs(n.xz), vec2(4.0)); pw /= max(pw.x + pw.y, 1e-4);
  vec2 ua = vec2(vW.z, vW.y), ub = vec2(vW.x, vW.y);
  float up = smoothstep(0.5, 0.86, n.y), down = smoothstep(-0.3, -0.7, n.y);
  vec3 alb;
  if (built < 0.998) {
    // ---- natural rock
    float near = 1.0 - smoothstep(7.0, 18.0, vD);
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
    alb = mix(wall * uTint, roof * uTint * 0.9, down);
    if (up > 0.002) {
      // underfoot: damp stone, and over it what the bake's paint says (moss, earth, sand), their edges ragged by the stone
      vec3 stone = texture2D(uCliff, vW.xz * uCliffTile.x * 1.9 + 0.11).rgb * uFloorTint;
      stone *= 0.6 + 0.8 * texture2D(uCliff, vW.xz * uCliffTile.x * 7.0 + 0.71).r;
      vec3 ground = stone;
      // the sheet whose floor is at this height: its paint
      float u = (vW.z - uMapBox.y) * uMapBox.z, v = (vW.x - uMapBox.x) * uMapBox.w;
      float best = 1e3, sheet = 0.0;
      for (int s = 0; s < SHEETS; s++) {
        float d = abs(vW.y - texture2D(uFloorH, vec2((clamp(u, 0.0, 1.0) + float(s)) / float(SHEETS), v)).r);
        if (d < best) { best = d; sheet = float(s); }
      }
      float onFloor = 1.0 - smoothstep(0.5, 1.1, best);
      if (onFloor > 0.0) {
        vec3 pc = texture2D(uFloorP, vec2((clamp(u, uHalf, 1.0 - uHalf) + sheet) / float(SHEETS), v)).rgb;
        float rag = (dot(stone, LUM) - 0.3) * 1.8;
        float m = smoothstep(0.3, 0.6, pc.b + rag * 0.35) * onFloor, e = smoothstep(0.32, 0.62, pc.r + rag * 0.3) * onFloor, s = smoothstep(0.32, 0.62, pc.g + rag * 0.2) * onFloor;
        if (m > 0.0) ground = mix(ground, texture2D(uMossT, vW.xz * uFloorTile.x).rgb, m);
        if (e > 0.0) ground = mix(ground, texture2D(uEarth, vW.xz * uFloorTile.y).rgb * uEarthTint, e);
        if (s > 0.0) ground = mix(ground, texture2D(uSand, vW.xz * uFloorTile.z).rgb * uSandTint, s);
      }
      alb = mix(alb, ground, up);
    }
  }
  // ---- laid stone: a step; or blocks on its faces, slabs underfoot
  if (built > 0.002) {
    vec3 laid;
    if (vI.a > 0.5) {
      float worn = texture2D(uCliff, vW.xz * 0.23 + vW.y * 0.37).r, fine = texture2D(uCliff, vW.xz * 0.9 + vW.y * 0.61).g;
      laid = uBuilt * (0.42 + 0.5 * worn + 0.4 * fine) * vTone * (0.5 + 0.5 * smoothstep(0.0, 0.32, vI.b)) + 0.07 * smoothstep(0.88, 1.0, vI.b);
    } else {
      float blocks = (dot(texture2D(uBlocks, ua * uBuiltTile.x).rgb, LUM) * pw.x + dot(texture2D(uBlocks, ub * uBuiltTile.x).rgb, LUM) * pw.y) / 0.245;
      float slabs = dot(texture2D(uSlabs, vW.xz * uBuiltTile.y).rgb, LUM) / 0.187;
      laid = uBuilt * mix(mix(blocks, blocks * 0.8, down), slabs, up);
    }
    alb = built > 0.998 ? laid : mix(alb, laid, built);
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

export async function createCaveGround({ ground = './assets/ground/', floor, scale = 4, sprite = null, look = null } = {}) {
  look = { ...GROUND_LOOK, ...(look || {}) };
  const [cliff, mossT, earth, sand, blocks, slabs] = await Promise.all([
    loadTex(ground + 'cliff-paint.webp'), loadTex(ground + 'cave-moss-paint.webp'), loadTex(ground + 'path-dirt.webp'),
    loadTex(ground + 'path-sand.webp'), loadTex(ground + 'boss-blocks-paint.webp'), loadTex(ground + 'boss-slabs-paint.webp'),
  ]);
  const { nx, nz, x0, z0, cell } = floor;
  const { H, P, W, K } = sheetsOf(floor);
  const floorH = new THREE.DataTexture(H, W, nx, THREE.RedFormat, THREE.FloatType);
  const floorP = new THREE.DataTexture(P, W, nx, THREE.RGBAFormat);
  floorH.magFilter = floorH.minFilter = THREE.NearestFilter;
  floorP.magFilter = floorP.minFilter = THREE.LinearFilter;
  for (const t of [floorH, floorP]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.needsUpdate = true; }
  const fogCol = hex3(look.fog), v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const uniforms = {
    uScale: { value: scale }, uCliff: { value: cliff }, uMossT: { value: mossT }, uEarth: { value: earth }, uSand: { value: sand },
    uBlocks: { value: blocks }, uSlabs: { value: slabs }, uFloorH: { value: floorH }, uFloorP: { value: floorP },
    uMapBox: { value: new THREE.Vector4(x0 - cell / 2, z0 - cell / 2, 1 / (nz * cell), 1 / (nx * cell)) }, uHalf: { value: 0.5 / nz },
    uCliffTile: { value: new THREE.Vector2(1 / 13, 1 / 7) }, uBuiltTile: { value: new THREE.Vector2(0.3, 0.42) },
    uFloorTile: { value: new THREE.Vector3(1 / 3.6, 1 / 2.6, 1 / 2.3) },
    uEarthTint: { value: v3(look.earth) }, uSandTint: { value: v3(look.sand) }, uTint: { value: v3(look.rock) }, uFloorTint: { value: v3(look.floor) },
    uBuilt: { value: v3(look.built) },
    uFogCol: { value: fogCol }, uFogD: { value: look.fogDensity }, uRim: { value: hex3(look.rim) },
    uSprPos: sprite ? sprite.uSprPos : { value: new THREE.Vector4(0, -999, 0, 0) },
    uSprCol: sprite ? sprite.uSprCol : { value: new THREE.Vector3(0, 0, 0) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms, defines: { SHEETS: K } });
  material.userData.noCave = true;                       // (its light is its own: baked, and the sprite's read here)
  return {
    material, uniforms, fogColor: fogCol, sheets: K,
    dispose() { material.dispose(); floorH.dispose(); floorP.dispose(); for (const t of [cliff, mossT, earth, sand, blocks, slabs]) if (t) t.dispose(); },
  };
}
