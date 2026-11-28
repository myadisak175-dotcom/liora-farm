/* ==========================================================================
   cave-ground.js  —  the ground of a room of the caves' kit: its rock, its laid stone, and what lies on its floors

     const ground = await createCaveGround({ floor, scale, sprite, look })
       floor    the room's floor map (cave-level.js' header: spans; fl in cm) with what lies on it: `kinds` (the kinds of
                ground this room has, as tools/make-cave-room.py baked them from its GROUNDS: name, picture, tile, tint,
                grey, ragged, grows, mean, at), `paint` and, with more than three kinds, `paint2` (how much of each kind
                on each span)
       scale    what the baked light was divided by (bin.lightScale)
       sprite   { uSprPos, uSprCol }: the one light that moves (cave-light.js' uniforms, shared)
       look     the room's own colours (GROUND_LOOK, below; a room's description may change any of them, and may give a
                kind of ground its own tint by the kind's name: "moss": [r, g, b])
     new THREE.Mesh(geometry, ground.material)
       geometry: position, normal, aLight (rgb: the light baked on it; a: a step's own tone, 0.5 none),
                 aInfo (r: laid stone, g: how open to the room, b: on a step, from its back, 0, to its edge, 1; a: 1 a step)
     ground.reads     for whatever grows from the ground (cave-grass.js): see THE GROUND READ BY WHAT GROWS, below

   One job: one material for the whole rock of any kit room (tools/make-cave-room.py bakes the mesh), so a room brings no
   drawing code of its own. (Until the kit each room had its own: fang-hall.js, cave-hall.js, boss-hall.js; their looks are
   where this one's come from.) What it draws:
     natural rock   the cliffs' brush-painted rock (cliff-paint.webp) laid on from two sides, finer copies of it up close;
                    the roof the same rock from above, darker
     its floors     damp stone, and over it WHAT LIES THERE: the room's kinds of ground, each its own picture, laid one
                    over another in the bake's order (gravel, old paving, fallen leaves, moss, turf, earth, sand: whichever
                    the room has), their edges ragged by the stone under them; read smooth from pictures of the paint,
                    not from the mesh's corners (FLOORS OVER ONE ANOTHER, below)
     laid stone     where the bake says built: blocks on its faces, slabs underfoot (the boss hall's two pictures, for
                    their joints and patches only: the stone's colour is the look's `built`)
     steps          the bake's real steps (a way with "steps"): each its own worn stone, a little lighter or darker than
                    the next, dark at its back under the step above, a light line along its edge
     the light      baked (the lamps with their shadows, the dark's own); the sprite's; a faint edge where the rock turns
                    away from the eye; the dark of the cave far off
   The water is cave-water.js', the grass cave-grass.js'; the mist and the things in a room are other files' (to come).

   A KIND OF GROUND is not written here: the shader is made for the kinds the room's bake lists, so a new kind is a line
   in the tool's GROUNDS and a picture in assets/ground/ (a room may have seven at once: three in `paint`'s r, g, b, four
   in `paint2`).

   THE GROUND READ BY WHAT GROWS. Above the ground the meadow and its grass read one map (stylized-grassfield.js: the
   ground's colour at a spot, and how much grass grows there), so a blade has no root to be seen and the grass thins out
   into earth instead of stopping at a line. Here the same: what grows reads THIS ground, the very paint and pictures its
   own shader reads, by the very same lines of shader. READ (below) is those lines, written once: where a spot's paint
   lies in the sheets' pictures, the stone under everything, how much of a kind shows at a spot, its picture's colour
   there. This file's fragment shader is put together from them, and so is cave-grass.js' vertex shader (with `reads`:
   the kinds, the uniforms themselves, their declarations, and which sheet a spot's floor is on).

   FLOORS OVER ONE ANOTHER. The floor map keeps a column's spans lowest first, so one floor is span 0 here and span 1
   three columns on, where a tunnel runs under it. Read smooth (between columns) from that, a floor's paint would mix
   with another floor's. So the spans are laid out anew as SHEETS: a floor keeps one sheet from column to column
   (followed from each span to its neighbours at about its height; a way that winds over itself changes sheet once, on
   its laid stone, where no paint lies), every sheet's edge carried two columns on (so the paint runs to the walls'
   feet). Pictures hold the sheets side by side: the floors' heights, and their paint; a bit of floor takes the paint of
   the sheet whose floor is at its own height.
   ========================================================================== */
import * as THREE from 'three';

export const GROUND_LOOK = {
  fog: '#0a1420', fogDensity: 0.018, rim: '#2b4d68',
  rock: [0.8, 0.85, 0.95], floor: [0.62, 0.66, 0.74],
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
export const num = (v) => { const s = String(+(+v).toFixed(5)); return /[.e]/.test(s) ? s : s + '.0'; };      // a figure as a shader reads one

// ---- READ: the ground at a spot, in shader text, written once (see THE GROUND READ BY WHAT GROWS). In scope where these
// are used: `xz` (the spot), `sheet` (which sheet its floor is on), `pc` and `pd` (the paint there), `rag` (the stone's
// own, for a ragged edge), LUM. `read(sampler, uv)` is how a picture is read there: plainly in a fragment shader; from a
// smaller copy of it in a vertex shader (one read stands for a whole tuft's foot)
const AT = ['pc.r', 'pc.g', 'pc.b', 'pd.r', 'pd.g', 'pd.b', 'pd.a'];
const plain = (s, uv) => `texture2D(${s}, ${uv})`;
export const READ = {
  // where the spot's paint lies in the sheets' pictures
  where: 'vec2((clamp((xz.y - uMapBox.y) * uMapBox.z, uHalf, 1.0 - uHalf) + sheet) / float(SHEETS), (xz.x - uMapBox.x) * uMapBox.w)',
  // the paint there
  paint: (kinds, at) => `vec4 pc = texture2D(uFloorP, ${at});${kinds.some((k) => k.at > 2) ? ` vec4 pd = texture2D(uFloorP2, ${at});` : ''}`,
  // the damp stone under everything, and what it does to an edge
  stone: (read = plain) => `${read('uCliff', 'xz * uCliffTile.x * 1.9 + 0.11')}.rgb * uFloorTint * (0.6 + 0.8 * ${read('uCliff', 'xz * uCliffTile.x * 7.0 + 0.71')}.r)`,
  rag: '(dot(stone, LUM) - 0.3) * 1.8',
  // how much of a kind shows at the spot (0: none of it; 1: all)
  shows: (k) => `smoothstep(0.32, 0.62, ${AT[k.at]} + rag * ${num(k.ragged)})`,
  // its picture's colour there, tinted (kind number i of the room's)
  colour: (k, i, read = plain) => {
    const tex = `${read(`uK${i}`, `xz * ${num(1 / k.tile)}`)}.rgb`;
    return `${k.grey ? `vec3(dot(${tex}, LUM) / ${num(k.grey)})` : tex} * uKT${i}`;
  },
  // what a shader that reads the ground declares
  pars: (kinds) => `
uniform sampler2D uCliff;
${kinds.map((k, i) => `uniform sampler2D uK${i}; uniform vec3 uKT${i};      // ${k.name}`).join('\n')}
uniform sampler2D uFloorP;                  // the sheets side by side: their paint
${kinds.some((k) => k.at > 2) ? 'uniform sampler2D uFloorP2;' : ''}
uniform vec4 uMapBox;                       // the floor map: x0, z0 (less half a cell), 1 / (nz * cell), 1 / (nx * cell)
uniform float uHalf;                        // half a column, of one sheet's width
uniform vec2 uCliffTile;
uniform vec3 uFloorTint;
const vec3 LUM = vec3(0.3, 0.59, 0.11);`,
};

// the floor map's spans as sheets (see FLOORS OVER ONE ANOTHER): pictures of K sheets side by side (u along z, v along x)
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
  // the paint: 4 bytes a span from `paint`, 4 more from `paint2` where the room has it (8 kept side by side here)
  const two = !!floor.paint2, C = two ? 8 : 4;
  const H = new Float32Array(W * nx).fill(-1e4), A = new Uint8Array(W * nx * C);
  for (let q = 0; q < K * n; q++) {
    if (fl[q] === NONE) continue;
    const col = q % n, i = (col / nz) | 0, j = col % nz, t = i * W + sheet[q] * nz + j;
    H[t] = fl[q] / 100;
    for (let c = 0; c < 4; c++) A[t * C + c] = floor.paint[q * 4 + c];
    if (two) for (let c = 0; c < 4; c++) A[t * C + 4 + c] = floor.paint2[q * 4 + c];
  }
  // every sheet's edge carried on two columns (its paint to the walls' feet; no other sheet's paint read in at its edge)
  const sum = new Float64Array(C);
  for (let pass = 0; pass < 2; pass++) {
    const H0 = H.slice(), A0 = A.slice();
    for (let s = 0; s < K; s++) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const t = i * W + s * nz + j;
      if (H0[t] > -1e3) continue;
      let m = 0, h = 0; sum.fill(0);
      for (let a = Math.max(0, i - 1); a <= Math.min(nx - 1, i + 1); a++) for (let c = Math.max(0, j - 1); c <= Math.min(nz - 1, j + 1); c++) {
        const u = a * W + s * nz + c;
        if (H0[u] > -1e3) { m++; h += H0[u]; for (let e = 0; e < C; e++) sum[e] += A0[u * C + e]; }
      }
      if (m) { H[t] = h / m; for (let e = 0; e < C; e++) A[t * C + e] = sum[e] / m; }
    }
  }
  const P = new Uint8Array(W * nx * 4), P2 = two ? new Uint8Array(W * nx * 4) : null;
  for (let t = 0; t < W * nx; t++) for (let c = 0; c < 4; c++) { P[t * 4 + c] = A[t * C + c]; if (two) P2[t * 4 + c] = A[t * C + 4 + c]; }
  // which sheet the floor at a spot is on (the sheet whose floor there is nearest that height), as the shader finds it
  const sheetOf = (x, y, z) => {
    const i = Math.min(nx - 1, Math.max(0, Math.round((x - floor.x0) / floor.cell))), j = Math.min(nz - 1, Math.max(0, Math.round((z - floor.z0) / floor.cell)));
    let best = 1e9, at = 0;
    for (let s = 0; s < K; s++) { const d = Math.abs(H[i * W + s * nz + j] - y); if (d < best) { best = d; at = s; } }
    return at;
  };
  return { H, P, P2, W, K, sheetOf };
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

// the fragment shader for a room's kinds of ground: each laid over the ones before it, where its byte of the paint says
const fragmentFor = (kinds) => {
  const lay = kinds.map((k, i) => `
        a = ${READ.shows(k)} * onFloor;      // ${k.name}
        if (a > 0.0) ground = mix(ground, ${READ.colour(k, i)}, a);`).join('');
  return /* glsl */`
uniform sampler2D uBlocks, uSlabs;
uniform sampler2D uFloorH;                  // the sheets side by side: their floors' heights (m)
${READ.pars(kinds)}
uniform vec2 uBuiltTile;                    // repeats a metre of the blocks, of the slabs
uniform vec3 uTint, uBuilt, uFogCol, uRim;
uniform float uFogD;
uniform vec4 uSprPos;
uniform vec3 uSprCol;
varying vec3 vW, vN, vL;
varying vec4 vI;
varying float vD, vTone;
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
      // underfoot: damp stone, and over it what the bake's paint says lies there, each kind's edge ragged by the stone
      vec2 xz = vW.xz;
      vec3 stone = ${READ.stone()};
      vec3 ground = stone;
      // the sheet whose floor is at this height: its paint
      float u = (xz.y - uMapBox.y) * uMapBox.z, v = (xz.x - uMapBox.x) * uMapBox.w;
      float best = 1e3, sheet = 0.0;
      for (int s = 0; s < SHEETS; s++) {
        float d = abs(vW.y - texture2D(uFloorH, vec2((clamp(u, 0.0, 1.0) + float(s)) / float(SHEETS), v)).r);
        if (d < best) { best = d; sheet = float(s); }
      }
      float onFloor = 1.0 - smoothstep(0.5, 1.1, best);
      if (onFloor > 0.0) {
        ${READ.paint(kinds, READ.where)}
        float rag = ${READ.rag}, a;${lay}
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
};

export async function createCaveGround({ ground = './assets/ground/', floor, scale = 4, sprite = null, look = null } = {}) {
  look = { ...GROUND_LOOK, ...(look || {}) };
  const kinds = floor.kinds || [];
  // every picture once, though two kinds (or a kind and the laid stone) may share one
  const pictures = new Map();
  const picture = (file) => { if (!pictures.has(file)) pictures.set(file, loadTex(ground + file)); return pictures.get(file); };
  const [cliff, blocks, slabs, ...kindTex] = await Promise.all(['cliff-paint.webp', 'boss-blocks-paint.webp', 'boss-slabs-paint.webp', ...kinds.map((k) => k.picture)].map(picture));
  const { nx, nz, x0, z0, cell } = floor;
  const { H, P, P2, W, K, sheetOf } = sheetsOf(floor);
  const floorH = new THREE.DataTexture(H, W, nx, THREE.RedFormat, THREE.FloatType);
  const floorP = new THREE.DataTexture(P, W, nx, THREE.RGBAFormat);
  const floorP2 = P2 ? new THREE.DataTexture(P2, W, nx, THREE.RGBAFormat) : null;
  floorH.magFilter = floorH.minFilter = THREE.NearestFilter;
  const made = [floorH, floorP, floorP2].filter(Boolean);
  for (const t of made) {
    if (t !== floorH) t.magFilter = t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.needsUpdate = true;
  }
  const fogCol = hex3(look.fog), v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  // a kind's tint: the room's own for it (look[its name]), else the bake's (a word there: the look of that name)
  const tintOf = (k) => v3(look[k.name] || (typeof k.tint === 'string' ? look[k.tint] : k.tint) || [1, 1, 1]);
  // what a reading of the ground needs (READ.pars): shared, the very same, with whatever grows from it
  const read = {
    uCliff: { value: cliff }, uFloorP: { value: floorP }, ...(floorP2 ? { uFloorP2: { value: floorP2 } } : {}),
    uMapBox: { value: new THREE.Vector4(x0 - cell / 2, z0 - cell / 2, 1 / (nz * cell), 1 / (nx * cell)) }, uHalf: { value: 0.5 / nz },
    uCliffTile: { value: new THREE.Vector2(1 / 13, 1 / 7) }, uFloorTint: { value: v3(look.floor) },
  };
  kinds.forEach((k, i) => { read['uK' + i] = { value: kindTex[i] }; read['uKT' + i] = { value: tintOf(k) }; });
  const uniforms = {
    ...read,
    uScale: { value: scale }, uBlocks: { value: blocks }, uSlabs: { value: slabs }, uFloorH: { value: floorH },
    uBuiltTile: { value: new THREE.Vector2(0.3, 0.42) }, uTint: { value: v3(look.rock) }, uBuilt: { value: v3(look.built) },
    uFogCol: { value: fogCol }, uFogD: { value: look.fogDensity }, uRim: { value: hex3(look.rim) },
    uSprPos: sprite ? sprite.uSprPos : { value: new THREE.Vector4(0, -999, 0, 0) },
    uSprCol: sprite ? sprite.uSprCol : { value: new THREE.Vector3(0, 0, 0) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fragmentFor(kinds), uniforms, defines: { SHEETS: K } });
  material.userData.noCave = true;                       // (its light is its own: baked, and the sprite's read here)
  return {
    material, uniforms, fogColor: fogCol, sheets: K, kinds: kinds.map((k) => k.name),
    reads: { kinds, uniforms: read, pars: READ.pars(kinds), defines: { SHEETS: K }, sheetOf },
    dispose() { material.dispose(); for (const t of made) t.dispose(); for (const p of pictures.values()) p.then((t) => t && t.dispose()); },
  };
}
