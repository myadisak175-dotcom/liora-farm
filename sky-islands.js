/* ==========================================================================
   sky-islands.js  —  floating islands in the hill village's sky (a trial, ?islands=1)

   The user, 28 Nov 2026, with a picture of anime floating islands (a big one with a village and a lake on it, smaller ones
   round it, cliffs of tan and blue-grey rock tapering down under them, little rocks adrift, clouds): "ถ้าจะทำเกาะลอยฟ้า
   ในเกม ต้อง heightmap ไหม", then, of putting a few in the sky where the village can see them first: "อยากค่ะ".
   No heightmap: these are only to be seen, three to five hundred metres off and one to two hundred up, never walked on.

   One job: the islands and what stands on them, as one mesh in one draw. Each island is made in code, as the abyss's
   floating rocks are (abyss-depths.js, floatingRock): a ragged ring for its edge, a flat grassy top, a lip of turf over the
   rim, cliffs nearly straight down in layers, then the rock drawing in to a floor with fangs hanging from it (a long one and
   shorter ones), painted face by face (tan where it is high, a cool blue-grey low down, darker streaks down it, moss hanging
   in streaks under the turf). On them: round trees (a trunk and a few lumps of leaves), more of them toward the rim; the
   kit's little flat-coloured houses and a tower (stylized-buildings.js), near the rim on the village's side, fronts out, so
   that they show from below (the top itself never does: she is always under it); on the big one a lake. Round them, small
   rocks adrift, half of them bare. Everything bobs slowly, each island in its own time (in the vertex shader: aBob, uTime), so nothing is moved on
   the CPU. Drawn as the props are (three bands of light, the sun's bearing, lower), fading into the haze with distance more gently than
   the land does, so they stay the sky's and do not wash out.

     const isl = createSkyIslands();
     scene.add(isl.object);          // before the cloud shadows and the curse are applied, so they reach it too
     isl.update(dt);                 // each frame: the bobbing

   Where they are (metres, the hill village's own frame; its middle is about x -20, z 30): a big island and three small ones
   east-south-east, over the trees where she looks from where she starts (index.html tilts her look up a little to begin
   with); one big and one small south over the valley; two west over the dead fringe (from the hero's farm, over
   his cottage's roof); one north beyond the castle. ISLANDS below.
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as BD from './stylized-buildings.js';
import { _internal } from './stylized-nature.js';

const { shared, fbm3, mulberry32 } = _internal;
const SUN = new THREE.Vector3(-0.4, 0.45, 0.5).normalize();               // the props' sun's bearing (stylized-props.js), lower: their sides
                                                                           // take it, not only their tops (seen from below, a top-down sun left them all in shade)
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };      // (display colours, as the kit's are)
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const P = {
  grass: ['#8fcf5f', '#7cc154', '#a3d86b', '#6cb24f'].map(hex), turf: hex('#5a9e46'), moss: hex('#6f9a4a'),
  rockHi: ['#ead5ad', '#dec79e', '#f2e1bf'].map(hex), rockMid: hex('#c7ae8d'), rockLow: hex('#a09fb4'), rockDeep: hex('#7f83a0'), streak: hex('#8f8292'),
  leaves: ['#4f9a45', '#63ab4b', '#7dbf55', '#3f8541'], trunk: '#7a5236', lake: hex('#5cb8da'), shore: hex('#bfe6ee'),
};

// [x, y, z, top radius, depth under the top, seed, trees, houses, tower, lake]: high enough to show over the village's trees
// with the look tilted up a little (from about 12 to 25 degrees over the horizon), the big one big enough to be read from there
const ISLANDS = [
  [331, 204, 171, 50, 78, 11, 28, 6, true, true],                            // the big one, east-south-east: a village and a lake
  [385, 185, 28, 18, 30, 12, 8, 1, false, false],
  [341, 215, 372, 10, 17, 13, 3, 0, false, false],
  [283, 151, 240, 8, 13, 14, 2, 0, false, false],
  [40, 104, 400, 30, 46, 21, 12, 1, false, false],                           // south, over the valley
  [-60, 86, 380, 10, 16, 22, 3, 0, false, false],
  [-420, 165, 64, 30, 46, 31, 12, 1, false, false],                          // west, over the dead fringe
  [-389, 150, 170, 11, 18, 32, 3, 0, false, false],
  [-14, 120, -420, 28, 42, 41, 11, 0, true, false],                          // north, beyond the castle
];
const VILLAGE = [-20, 30];                                                   // the village's middle: what stands on an island stands toward it

// ---- one island: its rock and turf, face by face (each triangle one colour: the kit's painted look)
//   r: its top's radius (m); depth: how far under its top its longest fang reaches; grass: false for a bare rock;
//   seg: points round it; bands: rings of cliff and rock under the turf; fangs: how many points it hangs down in.
//   Its shape, from the top down: a flat top a little raised, a lip of turf over the rim, cliffs nearly straight down
//   in layers (each ring its own shade), the rock then drawing in to a floor, and from the floor the fangs: a long one
//   near the middle and shorter ones beside it. Moss hangs from under the turf in streaks.
const TONE = [1, 0.9, 1.05, 0.94, 0.87, 1.02, 0.93, 0.98];                 // the cliffs' layers, ring by ring
function islandGeometry({ r, depth, seed, grass = true, seg = 28, bands = 7, fangs = 3 }) {
  const rnd = mulberry32(seed * 977 + 5), TAU = Math.PI * 2;
  const edge = a => 0.78 + 0.42 * fbm3(Math.cos(a) * 1.4 + seed, Math.sin(a) * 1.4, seed * 0.37, seed, 3);        // how far out its rim goes, by bearing
  const low = a => 0.75 + 0.5 * fbm3(Math.cos(a) * 1.9 + seed * 2, Math.sin(a) * 1.9, seed * 0.5, seed + 9, 2);   // how far down its cliffs go, by bearing
  const top = Math.min(r * 0.05, 1.2), lip = -r * 0.06, body = depth * 0.55;
  const prof = t => t < 0.45 ? 1 - 0.14 * t / 0.45 : 0.86 - 0.48 * Math.pow((t - 0.45) / 0.55, 1.2);           // the cliffs' line: straight down, then drawing in
  const row = (fn, wobble) => {                                            // a ring of points round it: fn(bearing) gives [out, y]
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = i / seg * TAU + (wobble ? (rnd() - 0.5) * 0.07 : 0), [q, y] = fn(a);
      pts.push([Math.cos(a) * q, y, Math.sin(a) * q]);
    }
    return pts;
  };
  const rows = [
    row(a => [r * edge(a) * 0.62, top * (0.92 + 0.08 * fbm3(Math.cos(a) * 2, Math.sin(a) * 2, seed, seed, 2))]),   // the flat top's edge
    row(a => [r * edge(a) * 0.97, top * 0.15]),                                                                    // the rim
    row(a => [r * edge(a) * 1.03, lip]),                                                                           // the turf's lip
  ];
  for (let j = 1; j <= bands; j++) {
    const t = j / bands;
    rows.push(row(a => [r * edge(a) * prof(t) * (0.9 + 0.2 * fbm3(Math.cos(a) * 3 + seed, Math.sin(a) * 3, t * 4, seed + 3, 2)),
                        lip - body * low(a) * t + (rnd() - 0.5) * body / bands * 0.3], true));
  }
  const pos = [], col = [];
  const rockAt = (y, ca, band) => {                                        // the rock's colour at a height (and on which bearing, in which layer)
    const t = Math.min(1, -y / depth);                                     // 0 at the rim, 1 at the longest fang's tip
    let c = t < 0.3 ? mix(P.rockHi[Math.floor(rnd() * 3)], P.rockMid, t / 0.3) : t < 0.7 ? mix(P.rockMid, P.rockLow, (t - 0.3) / 0.4) : mix(P.rockLow, P.rockDeep, (t - 0.7) / 0.3);
    if (band >= 0) c = c.map(v => v * TONE[band % TONE.length]);
    const s = fbm3(Math.cos(ca) * 4 + seed, Math.sin(ca) * 4, 0.5, seed + 7, 2);                              // streaks down it
    if (s > 0.62) c = mix(c, P.streak, (s - 0.62) * 1.5);
    if (grass && band >= 0 && band < 2) {                                  // moss hanging from under the turf, in streaks
      const m = fbm3(Math.cos(ca) * 3 + seed, Math.sin(ca) * 3, 1.7, seed + 11, 2);
      if (m > (band === 0 ? 0.45 : 0.6)) c = mix(c, P.moss, band === 0 ? 0.8 : 0.6);
    }
    return c;
  };
  const tri = (A, B, C, c) => { pos.push(...A, ...B, ...C); for (let k = 0; k < 3; k++) col.push(...c); };
  const face = (A, B, C, kind, band = -1) => {
    const cy = (A[1] + B[1] + C[1]) / 3, ca = Math.atan2((A[2] + B[2] + C[2]) / 3, (A[0] + B[0] + C[0]) / 3);
    const bare = mix(P.rockHi[Math.floor(rnd() * 3)], P.rockMid, 0.2);
    tri(A, B, C, kind === 'grass' ? (grass ? P.grass[Math.floor(rnd() * P.grass.length)] : bare)
               : kind === 'turf' ? (grass ? mix(P.turf, P.grass[3], rnd() * 0.4) : mix(bare, P.rockMid, 0.5))
               : rockAt(cy, ca, band));
  };
  const strip = (U, D, kind, band) => {                                    // the faces between two rings
    for (let i = 0; i < seg; i++) {
      const a = U[i], b = U[(i + 1) % seg], c = D[i], d = D[(i + 1) % seg];
      face(a, b, c, kind, band); face(b, d, c, kind, band);
    }
  };
  const mid = [0, top, 0];
  for (let i = 0; i < seg; i++) face(mid, rows[0][(i + 1) % seg], rows[0][i], 'grass');
  strip(rows[0], rows[1], 'grass');
  strip(rows[1], rows[2], 'turf');
  for (let j = 2; j < rows.length - 1; j++) strip(rows[j], rows[j + 1], 'rock', j - 2);
  const last = rows[rows.length - 1], floor = [0, lip - body * 1.02, 0];
  for (let i = 0; i < seg; i++) face(last[i], last[(i + 1) % seg], floor, 'rock');
  // the fangs, out of the floor: each a ring of points narrowing down to a tip, leaning a little
  for (let f = 0; f < fangs; f++) {
    const main = f === 0, an = rnd() * TAU, off = main ? rnd() * 0.06 * r : (0.17 + rnd() * 0.09) * r;
    const cx = Math.cos(an) * off, cz = Math.sin(an) * off;
    const rt = main ? 0.3 * r : (0.1 + rnd() * 0.05) * r, y0 = lip - body * (main ? 0.85 : 0.9);
    const y1 = main ? -depth * 1.02 : y0 - depth * (0.22 + rnd() * 0.2);
    const lean = [(rnd() - 0.5) * rt * 0.8, (rnd() - 0.5) * rt * 0.8], n = main ? 9 : 7, R = main ? 4 : 3;
    const fr = [];
    for (let k = 0; k <= R; k++) {
      const t = k / (R + 1), pts = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + (rnd() - 0.5) * 0.3, q = rt * Math.pow(1 - t, 0.9) * (0.8 + rnd() * 0.4);
        pts.push([cx + lean[0] * t + Math.cos(a) * q, y0 + (y1 - y0) * Math.pow(t, 1.1), cz + lean[1] * t + Math.sin(a) * q]);
      }
      fr.push(pts);
    }
    for (let k = 0; k < R; k++) for (let i = 0; i < n; i++) {
      const a = fr[k][i], b = fr[k][(i + 1) % n], c = fr[k + 1][i], d = fr[k + 1][(i + 1) % n];
      face(a, b, c, 'rock'); face(b, d, c, 'rock');
    }
    const tip = [cx + lean[0], y1, cz + lean[1]];
    for (let i = 0; i < n; i++) face(fr[R][i], fr[R][(i + 1) % n], tip, 'rock');
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const rimAt = a => r * edge(a);
  const groundAt = (lx, lz) => {                                           // how high its top is at a spot on it (its own frame)
    const p = Math.hypot(lx, lz) / rimAt(Math.atan2(lz, lx));
    return p < 0.62 ? top * (1 - 0.06 * p / 0.62) : top * (0.94 - 0.79 * Math.min(1, (p - 0.62) / 0.35));
  };
  return { geometry: g, rimAt, groundAt, top };
}

// a round tree: a trunk and a few lumps of leaves, flat faces (as the kit's things are)
function treeGeometry(seed, h) {
  const K = BD.kit(seed), r = K.rng;
  K.cyl(0, -0.4, 0, 0.32 * h / 8, 0.22 * h / 8, h * 0.55, 6, P.trunk);
  const lumps = 2 + Math.floor(r() * 3);
  for (let k = 0; k < lumps; k++) {
    const g = new THREE.IcosahedronGeometry(h * (0.26 + r() * 0.12), 0);
    g.translate((r() - 0.5) * h * 0.35, h * (0.6 + r() * 0.22), (r() - 0.5) * h * 0.35);
    K.raw(g, P.leaves[Math.floor(r() * P.leaves.length)], 0.06);
  }
  return K.done();
}

function islandMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLight: { value: SUN },
      uLit: { value: new THREE.Vector3(1.08, 1.03, 0.93) },               // the props' warm sunlit band
      uMid: { value: new THREE.Vector3(0.93, 0.89, 0.87) },
      uShade: { value: new THREE.Vector3(0.76, 0.77, 0.9) },               // and a cooler, bluer shade, light: the sky's under them too
      uHaze: shared.uHaze, uTime: { value: 0 },
      uFade: { value: new THREE.Vector3(180, 1200, 0.42) },                // haze: from, to (metres), at most
    },
    vertexColors: true,
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uFade;
      attribute vec2 aBob;                                                   // its island's time and how far it bobs (m)
      varying vec3 vCol;
      varying vec3 vWN;
      varying float vHaze;
      void main() {
        vCol = color;
        vec3 p = position;
        p.y += aBob.y * sin(uTime * 0.52 + aBob.x);
        vWN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vHaze = uFade.z * smoothstep(uFade.x, uFade.y, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight, uLit, uMid, uShade, uHaze;
      varying vec3 vCol;
      varying vec3 vWN;
      varying float vHaze;
      void main() {
        vec3 n = normalize(vWN) * (gl_FrontFacing ? 1.0 : -1.0);
        float d = dot(n, uLight) * 0.5 + 0.5;
        vec3 light = d > 0.66 ? uLit : (d > 0.42 ? uMid : uShade);
        gl_FragColor = vec4(mix(clamp(vCol * light, 0.0, 1.0), uHaze, vHaze), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

export function createSkyIslands({ islands = ISLANDS } = {}) {
  const parts = [];
  const add = (g, x, y, z, turn, phase, bob) => {                          // a part of an island, where it stands, bobbing with it
    if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.rotateY(turn); g.translate(x, y, z);
    const n = g.attributes.position.count, b = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { b[i * 2] = phase; b[i * 2 + 1] = bob; }
    g.setAttribute('aBob', new THREE.BufferAttribute(b, 2));
    parts.push(g);
  };
  for (const [ix, [x, y, z, r, depth, seed, trees, houses, tower, lake]] of islands.entries()) {
    const rnd = mulberry32(seed * 131 + 17), phase = ix * 1.7 + rnd() * 3, bob = 0.8 + r * 0.02, turn = rnd() * Math.PI * 2;
    const isl = islandGeometry({ r, depth, seed, fangs: r > 20 ? 3 : 2 });
    add(isl.geometry, x, y, z, turn, phase, bob);
    const c = Math.cos(turn), s = Math.sin(turn);
    const onTop = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];      // (the island's own frame, turned as it is)
    const vx = VILLAGE[0] - x, vz = VILLAGE[1] - z, toward = Math.atan2(vx * s + vz * c, vx * c - vz * s);   // the village's bearing, in its own frame
    const taken = [], big = Math.min(1.8, Math.max(1, r / 30));              // (what stands on a big island, drawn bigger: it is far off)
    const free = (lx, lz, room) => taken.every(([tx, tz, tr]) => Math.hypot(lx - tx, lz - tz) > room + tr);
    const near = (spread, from, to, keep) => {                                // a spot toward the village (spread: radians either side), from..to of the way out, keep metres off the rim
      const a = toward + (rnd() - 0.5) * 2 * spread, d = Math.max(0, (from + rnd() * (to - from)) * isl.rimAt(a) - keep);
      return [Math.cos(a) * d, Math.sin(a) * d, a];
    };
    const stand = (g, lx, lz, sink, yaw) => { const [wx, wz] = onTop(lx, lz); add(g, wx, y + isl.groundAt(lx, lz) - sink, wz, turn + yaw, phase, bob); };
    // houses toward the village, near the rim, where they can be seen from below (their fronts out); a tower among them;
    // on the big one a lake behind them (seen only from above: it is in the user's picture)
    for (let h = 0; h < houses; h++) {
      for (let tries = 0; tries < 40; tries++) {
        const [lx, lz, a] = near(0.85, 0.55, 0.9, 4 * big);
        if (!free(lx, lz, 3.8 * big)) continue;
        taken.push([lx, lz, 3.8 * big]);
        const g = BD.houseGeometry({ w: 5 + rnd() * 2, d: 4 + rnd() * 1.5, floors: rnd() < 0.3 ? 2 : 1, seed: seed * 10 + h });
        g.scale(big, big, big);
        stand(g, lx, lz, 0.35 * big, Math.PI / 2 - a + (rnd() - 0.5) * 0.5);
        break;
      }
    }
    if (tower) {
      for (let tries = 0; tries < 40; tries++) {
        const [lx, lz] = near(0.6, 0.2, 0.5, 5 * big);
        if (!free(lx, lz, 3.5 * big)) continue;
        taken.push([lx, lz, 3.5 * big]);
        const g = BD.towerGeometry({ s: 4.2, h: 13, seed });
        g.scale(big, big, big);
        stand(g, lx, lz, 0.4, rnd() * 6.28);
        break;
      }
    }
    if (lake) {
      const lr = r * 0.2, lx = -Math.cos(toward) * r * 0.14, lz = -Math.sin(toward) * r * 0.14;
      const disc = new THREE.CircleGeometry(lr, 20); disc.rotateX(-Math.PI / 2);
      const n = disc.attributes.position.count, cl = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) cl.set(i === 0 ? P.lake : mix(P.lake, P.shore, 0.35), i * 3);
      disc.setAttribute('color', new THREE.BufferAttribute(cl, 3));
      stand(disc, lx, lz, -0.08, 0);
      taken.push([lx, lz, lr + 1]);
    }
    for (let t = 0; t < trees; t++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = rnd() * Math.PI * 2, d = (0.2 + 0.72 * Math.sqrt(rnd())) * isl.rimAt(a) - 1.5;      // (more toward the rim: there they show)
        const lx = Math.cos(a) * d, lz = Math.sin(a) * d, h = (6 + rnd() * 5 * Math.min(1, r / 14)) * Math.sqrt(big);
        if (!free(lx, lz, 1.5)) continue;
        taken.push([lx, lz, 1.5]);
        stand(treeGeometry(seed * 100 + t, h), lx, lz, 0.1, rnd() * 6.28);
        break;
      }
    }
    // little rocks adrift round it, each bobbing in its own time (half of them bare)
    const bits = Math.round(2 + r / 6);
    for (let b = 0; b < bits; b++) {
      const a = rnd() * Math.PI * 2, d = r * (1.25 + rnd() * 0.9), br = 0.8 + rnd() * (1.5 + r * 0.05);
      const rock = islandGeometry({ r: br, depth: br * (1.3 + rnd()), seed: seed * 50 + b, grass: rnd() < 0.5, seg: 8, bands: 3, fangs: 1 });
      add(rock.geometry, x + Math.cos(a) * d, y - depth * (0.1 + rnd() * 0.5), z + Math.sin(a) * d, rnd() * 6.28, phase + 1 + rnd() * 4, 0.6 + rnd() * 0.8);
    }
  }
  const geometry = mergeGeometries(parts);
  parts.forEach(g => g.dispose());
  const material = islandMaterial();
  const object = new THREE.Mesh(geometry, material);
  object.name = 'skyIslands';
  object.frustumCulled = false;                                            // (one mesh round the whole sky: always partly in view)
  object.userData.dispose = () => { geometry.dispose(); material.dispose(); };
  let time = 0;
  return {
    object,
    update(dt) { time += dt; material.uniforms.uTime.value = time; },
    get triangles() { return geometry.attributes.position.count / 3; },
  };
}
