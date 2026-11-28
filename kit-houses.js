/* ==========================================================================
   kit-houses.js  —  houses of many shapes and sizes, put together from every piece of a modular building kit
   (In the repo for the buildings made by hand, loria-buildings.js, seen on loria-buildings.html: each wall of those is set by
   hand, a storey's `plan`. What is said below of dice, roles and designFor() is the builder's other way, not used in the game.)
   The pieces are Quaternius' Medieval Village MegaKit (CC0), the free Standard set: all 176 of them, packed into
   assets/models/village-kit-all.glb by tools/pack-village-kit.py --all. village-kit.js stands every house as one box with
   one roof; here a house is put together out of blocks:

     a block        a box of storeys 2 m to a wall piece and 3 m to a storey, with a roof of its own: gabled (its ridge
                    steeper or flatter than the kit made it), a tower's pyramid, a lean-to of boards, or none
     a storey       plaster and timber, stone, or a lattice; it may jut out over the one below on any side: on coved walls
                    (the kit's overhangs, which have no doors or windows) or on braces over a soffit (the walls below keep
                    theirs)
     the walls      a door, windows of four kinds with shutters open or shut and hoods over some, or plain; a wall another
                    block stands against is not built, one a lower roof leans against has no window
     and on them    balconies, porches, canopies over doors, verandas on posts, arcades, outside stairs of stone or wood,
                    dormers, chimneys, vines, the stone kerbs, fences, crates, a wagon, loose bricks, an iron gate

   What a house becomes is worked out from what it is for (its role) and the ground it has (w by l), by a seed: designFor().
   The colours are the kit's own pictures, tinted for each house (the plaster, the wood, the stone) and the roof tiles in red,
   or grey tiles tinted slate, moss, brown or charcoal: one picture made grey here, so nothing more is loaded for it.

     const kit = await loadKitHouses();
     const b = kit.builder();
     b.house({ role: 'cottage', w: 4, l: 6, seed: 3, door: 'front' }, x, y, z, yaw);      // the same spec village-kit.js takes
     b.piece('Prop_Wagon', x, y, z, yaw);   b.bridge(...);                                 // as village-kit.js
     scene.add(b.build());                                                                 // a Group of merged meshes, one for each picture
     kit.measure(spec)  ->  { top, x0, x1, z0, z1 }   how high it stands and the ground it covers, in its own frame

   A house's frame is village-kit.js's: w metres across (x), l along (z), the front at +z, y = 0 the foot of its walls. Its
   ground floor stands inside w by l; what juts out over it (an upper storey, a balcony) and the eaves may reach a metre past.
   Roles: cottage, townhouse, tallhouse, towerhouse, veranda, shophouse, barn, stable, manor, keep, hall, mill, watermill,
   millhouse (designFor picks one from the size when none is given; the hill village's houses have theirs by name).
   ========================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMaterial } from './stylized-props.js';

const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hashOf = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const GLASS = [0.31, 0.42, 0.53];                                           // window panes: one flat colour (the kit's are see-through)
const DARK = [0.2, 0.15, 0.12];                                             // what shows through a lattice: the dark inside
const GREY = 'tiles:grey';                                                  // the roof tiles' picture made grey, to be tinted
const D90 = Math.PI / 2;
// which of the kit's pictures a primitive is painted from
const kindOf = key => !key ? 'glass' : key === GREY ? 'tiles' : /Plaster/.test(key) ? 'plaster' : /WoodTrim/.test(key) ? 'wood' : /UnevenBrick/.test(key) ? 'stone'
  : /RedBrick/.test(key) ? 'redbrick' : /Brick/.test(key) ? 'brick' : /RockTrim/.test(key) ? 'rock' : /RoundTiles/.test(key) ? 'tiles' : /Metal/.test(key) ? 'metal' : /Vine/.test(key) ? 'vine' : 'other';
// the roofs the kit has: across -> along the ridge (6x4 is made to butt against a wall at its z = 0 end)
const ROOFS = { 4: [4, 6, 8], 6: [4, 6, 8, 10, 12, 14], 8: [8, 10, 12, 14] };
export const roofFits = (w, l) => !!(ROOFS[w] && ROOFS[w].includes(l));
// how far the gable's beam ends (Roof_FrontSupports, 2.74 m each way) may be spread under a roof that wide: out to where
// its tiles still stand 0.2 m over them (the kit's 4-wide roof has them out at its eaves, as made)
const SUPPORTS = { 4: 1, 6: 3.3 / 2.74, 8: 4.2 / 2.74 };
// the line of the tiles' crests down a roof that wide, as the kit made it: [how steeply it falls, its height at the eave's tip]
const CREST = { 4: [1.39, -0.2], 6: [1.246, -0.39], 8: [1.268, -0.37] };

// ------------------------------------------------------------------ colours: each house one of these, its own shades of it
// (multiplied into the kit's pictures: plaster beige, wood brown, stone grey, tiles red; `grey` lays a tint over grey tiles)
const PALETTES = [
  { name: 'honey', plaster: [1.16, 1.08, 0.97], wood: [1.0, 0.97, 0.94], stone: [1.28, 1.24, 1.16], tiles: [1.0, 1.0, 1.0] },
  { name: 'rose', plaster: [1.18, 1.0, 0.98], wood: [0.84, 0.76, 0.74], stone: [1.3, 1.2, 1.15], tiles: [0.86, 0.74, 0.72] },
  { name: 'sky', plaster: [1.08, 1.12, 1.22], wood: [0.78, 0.72, 0.7], stone: [1.18, 1.24, 1.32], grey: [0.6, 0.74, 0.95] },
  { name: 'sage', plaster: [1.06, 1.12, 0.98], wood: [0.9, 0.84, 0.76], stone: [1.2, 1.24, 1.16], grey: [0.66, 0.84, 0.6] },
  { name: 'ochre', plaster: [1.2, 1.04, 0.78], wood: [0.8, 0.7, 0.62], stone: [1.3, 1.22, 1.08], grey: [0.86, 0.62, 0.46] },
  { name: 'chalk', plaster: [1.26, 1.24, 1.2], wood: [0.66, 0.6, 0.58], stone: [1.24, 1.24, 1.22], grey: [0.52, 0.54, 0.62] },
  { name: 'peach', plaster: [1.22, 1.06, 0.92], wood: [1.04, 0.98, 0.92], stone: [1.3, 1.22, 1.12], tiles: [1.08, 0.94, 0.86] },
  { name: 'lilac', plaster: [1.12, 1.06, 1.16], wood: [0.76, 0.7, 0.72], stone: [1.2, 1.18, 1.24], grey: [0.62, 0.6, 0.86] },
];
const jitter = (c, r, amt = 0.05) => c.map(v => v * (1 + (r() - 0.5) * 2 * amt));
export function paintOf(r, name = null) {                                 // (name: one of the palettes' names, or a palette given whole)
  const P = name && typeof name === 'object' ? name : (name && PALETTES.find(p => p.name === name)) || PALETTES[Math.floor(r() * PALETTES.length)];
  const out = { name: P.name, plaster: jitter(P.plaster, r), wood: jitter(P.wood, r, 0.04), stone: jitter(P.stone, r, 0.04), metal: [1, 1, 1], rock: jitter([1.2, 1.18, 1.12], r, 0.03),
    brick: [1.1, 1.08, 1.04], redbrick: [1, 1, 1], vine: jitter([0.42, 0.78, 0.26], r, 0.08), glass: GLASS, other: [1, 1, 1] };
  if (P.grey) { out.grey = true; out.tiles = jitter(P.grey, r, 0.04); } else out.tiles = jitter(P.tiles, r, 0.03);
  return out;
}

// ------------------------------------------------------------------ the kit, loaded
export async function loadKitHouses(url = new URL('./assets/models/village-kit-all.glb', import.meta.url).href) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const pieces = new Map(), pictures = new Map(), boxes = new Map();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const name = o.parent && o.parent.isGroup && o.parent !== gltf.scene ? o.parent.name : o.name;      // (a piece with several materials loads as a group of meshes)
    const g = o.geometry.clone();
    const n = g.attributes.normal, nf = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) { nf[i * 3] = n.getX(i); nf[i * 3 + 1] = n.getY(i); nf[i * 3 + 2] = n.getZ(i); }
    g.setAttribute('normal', new THREE.BufferAttribute(nf, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const map = o.material.map || null, key = map ? map.name || map.uuid : '';
    if (map) pictures.set(key, map);
    if (!pieces.has(name)) pieces.set(name, []);
    pieces.get(name).push({ key, geometry: g });
    g.computeBoundingBox();
    const b = boxes.get(name) || new THREE.Box3(); b.union(g.boundingBox); boxes.set(name, b);
  });
  // the roof tiles made grey (their light and dark kept, their red taken out), to be tinted any colour
  const tilesKey = [...pictures.keys()].find(k => /RoundTiles/.test(k));
  if (tilesKey) {
    const src = pictures.get(tilesKey), im = src.image, c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    let sum = 0; for (let i = 0; i < p.length; i += 4) sum += 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    const k = 0.74 * 255 / (sum / (p.length / 4));
    for (let i = 0; i < p.length; i += 4) { const v = Math.min(255, (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) * k); p[i] = p[i + 1] = p[i + 2] = v; }
    x.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.flipY = src.flipY; t.colorSpace = src.colorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.anisotropy = src.anisotropy; t.name = GREY;
    t.magFilter = src.magFilter; t.minFilter = src.minFilter;
    pictures.set(GREY, t);
  }
  // the stone cap at a tower roof's tip, painted to look like the tiles under it: for each of red, green and blue, how much
  // more or less of it the cap's picture must be given (as the props' shader paints: in the pictures' own display colours,
  // averaged over where the two pieces lie on their pictures), for red tiles and for grey ones
  const CAP = { red: [1, 1, 1], grey: [1, 1, 1] };
  const tower = pieces.get('Roof_Tower_RoundTiles');
  if (tower && tilesKey) {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high';
    const A = new THREE.Vector3(), Bv = new THREE.Vector3(), C = new THREE.Vector3();
    const meanAt = (image, g) => {                                         // over the piece's faces, each by its size
      x.clearRect(0, 0, N, N); x.drawImage(image, 0, 0, N, N);
      const d = x.getImageData(0, 0, N, N).data, sum = [0, 0, 0], pos = g.attributes.position, uv = g.attributes.uv, idx = g.index;
      let total = 0;
      const W3 = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
      for (let t = 0, n = idx ? idx.count : pos.count; t < n; t += 3) {
        const i = idx ? [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)] : [t, t + 1, t + 2];
        A.fromBufferAttribute(pos, i[0]); Bv.fromBufferAttribute(pos, i[1]); C.fromBufferAttribute(pos, i[2]);
        const area = Bv.sub(A).cross(C.sub(A)).length() / 2;
        for (const w of W3) {
          let u = 0, v = 0; for (let k = 0; k < 3; k++) { u += w[k] * uv.getX(i[k]); v += w[k] * uv.getY(i[k]); }
          u -= Math.floor(u); v -= Math.floor(v);
          const o = (Math.min(N - 1, Math.floor(v * N)) * N + Math.min(N - 1, Math.floor(u * N))) * 4;
          for (let k = 0; k < 3; k++) sum[k] += d[o + k] / 255 * area / 4;
        }
        total += area;
      }
      return sum.map(s => s / Math.max(1e-6, total));
    };
    const cap = tower.find(p => kindOf(p.key) === 'rock'), tiles = tower.find(p => kindOf(p.key) === 'tiles');
    if (cap && tiles) {
      const stone = meanAt(pictures.get(cap.key).image, cap.geometry);
      const red = meanAt(pictures.get(tilesKey).image, tiles.geometry), grey = meanAt(pictures.get(GREY).image, tiles.geometry);
      CAP.red = red.map((t, k) => t / Math.max(0.02, stone[k])); CAP.grey = grey.map((t, k) => t / Math.max(0.02, stone[k]));
    }
  }
  // a dark panel to stand behind a lattice wall: the kit's Wall_Plaster_WoodGrid is open, and a house has no inside, so the
  // ground showed through it (made here, not one of the kit's pieces: names that begin with _ are not counted among them)
  { const g = new THREE.PlaneGeometry(1.96, 2.9).translate(0, 1.5, -0.215); g.computeBoundingBox(); pieces.set('_LatticeBack', [{ key: '', geometry: g }]); boxes.set('_LatticeBack', g.boundingBox.clone()); }
  const shape = name => boxes.get(name);
  // the top of a piece as a field of heights (its faces let down onto a grid of 5 cm, the highest kept): what stands on a roof
  // is set by the tiles as they are, their rounds and steps and all, not by a straight line from ridge to eave
  const tops = new Map();
  const surface = name => {
    if (tops.has(name)) return tops.get(name);
    const b = boxes.get(name), C = 0.05, nx = Math.ceil((b.max.x - b.min.x) / C) + 1, nz = Math.ceil((b.max.z - b.min.z) / C) + 1, h = new Float32Array(nx * nz).fill(-1e6);
    for (const { geometry: g } of pieces.get(name)) {
      const p = g.attributes.position, ix = g.index, n = ix ? ix.count : p.count;
      for (let i = 0; i < n; i += 3) {
        const [a, c, e] = ix ? [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)] : [i, i + 1, i + 2];
        const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a), bx = p.getX(c), by = p.getY(c), bz = p.getZ(c), cx = p.getX(e), cy = p.getY(e), cz = p.getZ(e);
        const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(den) < 1e-9) continue;      // (a face seen on edge from above)
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - b.min.x) / C)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - b.min.x) / C));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - b.min.z) / C)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - b.min.z) / C));
        for (let q = i0; q <= i1; q++) for (let j = j0; j <= j1; j++) {
          const x = b.min.x + q * C, z = b.min.z + j * C;
          const w0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, w1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den, w2 = 1 - w0 - w1;
          if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
          const y = w0 * ay + w1 * by + w2 * cy; if (y > h[q * nz + j]) h[q * nz + j] = y;
        }
      }
    }
    const f = (x, z) => h[Math.max(0, Math.min(nx - 1, Math.round((x - b.min.x) / C))) * nz + Math.max(0, Math.min(nz - 1, Math.round((z - b.min.z) / C)))];
    tops.set(name, f);
    return f;
  };
  shape.surface = surface;                                                 // (goes with it to where the houses are put together)
  const plasterKey = ((pieces.get('Wall_Plaster_Straight') || []).find(q => kindOf(q.key) === 'plaster') || {}).key;      // the plaster's picture
  // each picture made small, for the flat look (?look=flat), as village-kit.js does it
  const pixels = new Map();
  const pixelsOf = key => {
    if (pixels.has(key)) return pixels.get(key);
    const n = /Trim|Metal/.test(key) ? 16 : 1;
    const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(pictures.get(key).image, 0, 0, n, n);
    const d = { n, data: x.getImageData(0, 0, n, n).data }; pixels.set(key, d);
    return d;
  };
  const cutouts = new Map();                                               // the vines' leaves: the props' light, with holes
  const cutoutMaterial = map => {
    if (cutouts.has(map)) return cutouts.get(map);
    const base = propMaterial(map), m = base.clone();
    m.uniforms = { ...base.uniforms };                                     // (the haze's uniforms shared, not copied)
    m.fragmentShader = base.fragmentShader.replace('vec3 texel = texture2D(uMap, vPropUv).rgb;', 'vec4 texA = texture2D(uMap, vPropUv); if (texA.a < 0.5) discard; vec3 texel = texA.rgb;');
    m.needsUpdate = true; cutouts.set(map, m);
    return m;
  };

  function builder() {
    const parts = new Map();                                               // picture key -> geometries, already where they stand
    const used = new Map();                                                // piece -> how many times
    let tris = 0;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3(), S = new THREE.Vector3();
    // a piece with the matrix m, its pictures tinted by paint (or white)
    const put = (name, m, paint = null) => {
      const prims = pieces.get(name);
      if (!prims) { console.warn('[kit-houses] no piece', name); return; }
      if (name[0] !== '_') used.set(name, (used.get(name) || 0) + 1);
      // a plaster wall up a storey: the band of bricks or stone the kit gives its foot (a ground storey's) drawn as plaster. (Left
      // out, the wall stood open there: the kit has no plaster behind the band, and a slit showed beside each corner post)
      const footless = paint && paint.noFoot && plasterKey && /^Wall_Plaster_/.test(name);
      for (const p of prims) {
        let kind = kindOf(p.key), pk = p.key;
        if (footless && (kind === 'brick' || kind === 'rock')) { kind = 'plaster'; pk = plasterKey; }
        const g = p.geometry.clone().applyMatrix4(m);
        const key = kind === 'tiles' && paint && paint.grey ? GREY : pk;
        const c = kind === 'rock' && paint && paint.cap && paint.tiles ? paint.tiles.map((t, k) => t * CAP[paint.grey ? 'grey' : 'red'][k])      // a tower's cap: its tiles' colour
          : (paint && paint[kind]) || [1, 1, 1], n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.set(c, i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        tris += (g.index ? g.index.count : n) / 3;
        if (!parts.has(key)) parts.set(key, []);
        parts.get(key).push(g);
      }
    };
    const mat = (x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V.set(x, y, z), Q.setFromAxisAngle(UP, yaw), S.set(sx, sy, sz));

    function house(spec, x = 0, y = 0, z = 0, yaw = 0) {
      const design = spec.blocks ? spec : designFor(spec);
      assemble(design, mat(x, y, z, yaw), put, shape);
    }
    const piece = (name, x, y, z, yaw = 0) => put(name, mat(x, y, z, yaw));

    // a humpbacked stone bridge along its own x, in the kit's own stone: as village-kit.js builds it (the same code, so the
    // hill village can be built from this kit alone)
    function bridge({ length: L = 11, width: W = 2.9, deck, span = 2.7, crown = 1.75, spring = -1.0, foot = -2.2, wall = 0.32, high = 0.6, ring = 0.45 }, x = 0, y = 0, z = 0, yaw = 0) {
      const keyOf = re => [...pictures.keys()].find(k => re.test(k)) || '';
      const RUB = keyOf(/UnevenBrick/), TRIM = keyOf(/RockTrim/);
      const SLAB = [0.345, 0.575], ASHLAR = [0.605, 0.985];
      const out = new Map();
      const WARM = { rubble: [1.43, 1.48, 1.5], ashlar: [1.42, 1.45, 1.38], slab: [1.58, 1.45, 1.24] };
      const quad = (key, P, n, U, tint = key === RUB ? WARM.rubble : WARM.ashlar) => {
        if (!out.has(key)) out.set(key, { p: [], n: [], uv: [], c: [], i: [] });
        const o = out.get(key), b0 = o.p.length / 3;
        const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        const flip = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2] < 0;
        for (let k = 0; k < 4; k++) { o.p.push(...P[k]); o.n.push(...n); o.uv.push(...U[k]); o.c.push(...tint); }
        if (flip) o.i.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2); else o.i.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
      };
      const rub = (h, yy) => [h / 2, yy * 0.474];
      const hw = W / 2, inner = hw - wall, A = span + ring, B = crown + ring;
      const archIn = t => [span * Math.cos(t), spring + crown * Math.sin(t)], archOut = t => [A * Math.cos(t), spring + B * Math.sin(t)];
      const outY = u => spring + B * Math.sqrt(Math.max(0, 1 - (u / A) * (u / A)));
      const cols = new Set([-L / 2, L / 2, -A, A, -span, span]);
      for (let u = -L / 2; u < L / 2; u += 0.3) cols.add(+u.toFixed(4));
      const U = [...cols].sort((p, q) => p - q);
      for (const sd of [-1, 1]) {
        const zf = sd * hw, nz = [0, 0, sd];
        for (let i = 0; i < U.length - 1; i++) {
          const u0 = U[i], u1 = U[i + 1], um = (u0 + u1) / 2, t0 = deck(u0) + high, t1 = deck(u1) + high;
          if (Math.abs(um) >= A) quad(RUB, [[u0, foot, zf], [u1, foot, zf], [u1, t1, zf], [u0, t0, zf]], nz, [rub(u0, foot), rub(u1, foot), rub(u1, t1), rub(u0, t0)]);
          else {
            const b0 = outY(u0), b1 = outY(u1);
            quad(RUB, [[u0, b0, zf], [u1, b1, zf], [u1, t1, zf], [u0, t0, zf]], nz, [rub(u0, b0), rub(u1, b1), rub(u1, t1), rub(u0, t0)]);
            if (Math.abs(um) >= span) quad(RUB, [[u0, foot, zf], [u1, foot, zf], [u1, spring, zf], [u0, spring, zf]], nz, [rub(u0, foot), rub(u1, foot), rub(u1, spring), rub(u0, spring)]);
          }
          const d0 = deck(u0), d1 = deck(u1), zi = sd * inner;
          quad(RUB, [[u0, d0, zi], [u1, d1, zi], [u1, d1 + high, zi], [u0, d0 + high, zi]], [0, 0, -sd], [rub(u0, d0), rub(u1, d1), rub(u1, d1 + high), rub(u0, d0 + high)]);
          if (sd > 0) quad(RUB, [[u0, d0, -inner], [u1, d1, -inner], [u1, d1, inner], [u0, d0, inner]], [0, 1, 0], [[u0 / 2, -inner / 2], [u1 / 2, -inner / 2], [u1 / 2, inner / 2], [u0 / 2, inner / 2]]);
          const c0 = d0 + high, c1 = d1 + high, ch = 0.14, zo = sd * (hw + 0.06), zn = sd * (inner - 0.06), sv = SLAB;
          quad(TRIM, [[u0, c0 + ch, zo], [u1, c1 + ch, zo], [u1, c1 + ch, zn], [u0, c0 + ch, zn]], [0, 1, 0], [[u0 / 4, sv[0] + 0.03], [u1 / 4, sv[0] + 0.03], [u1 / 4, sv[1]], [u0 / 4, sv[1]]], WARM.slab);
          for (const zz of [zo, zn]) quad(TRIM, [[u0, c0, zz], [u1, c1, zz], [u1, c1 + ch, zz], [u0, c0 + ch, zz]], [0, 0, zz === zo ? sd : -sd], [[u0 / 4, sv[0] + 0.03], [u1 / 4, sv[0] + 0.03], [u1 / 4, sv[0]], [u0 / 4, sv[0]]], WARM.slab);
          quad(TRIM, [[u0, c0, zo], [u1, c1, zo], [u1, c1, sd * hw], [u0, c0, sd * hw]], [0, -1, 0], [[u0 / 4, sv[0]], [u1 / 4, sv[0]], [u1 / 4, sv[0] + 0.02], [u0 / 4, sv[0] + 0.02]], WARM.slab);
          quad(TRIM, [[u0, c0, zn], [u1, c1, zn], [u1, c1, zi], [u0, c0, zi]], [0, -1, 0], [[u0 / 4, sv[0]], [u1 / 4, sv[0]], [u1 / 4, sv[0] + 0.02], [u0 / 4, sv[0] + 0.02]], WARM.slab);
        }
        const N = 18, zr = sd * (hw + 0.05), av = ASHLAR;
        let s0 = 0;
        for (let k = 0; k < N; k++) {
          const ta = Math.PI * k / N, tb = Math.PI * (k + 1) / N, [ia, ja] = archIn(ta), [ib, jb] = archIn(tb), [oa, pa] = archOut(ta), [ob, pb] = archOut(tb);
          const s1 = s0 + Math.hypot(ib - ia, jb - ja);
          quad(TRIM, [[ia, ja, zr], [ib, jb, zr], [ob, pb, zr], [oa, pa, zr]], [0, 0, sd], [[s0 / 2.4, av[0]], [s1 / 2.4, av[0]], [s1 / 2.4, av[0] + 0.19], [s0 / 2.4, av[0] + 0.19]]);
          const tm = (ta + tb) / 2;
          quad(TRIM, [[oa, pa, zf], [ob, pb, zf], [ob, pb, zr], [oa, pa, zr]], [Math.cos(tm), Math.sin(tm), 0], [[s0 / 2.4, av[0]], [s1 / 2.4, av[0]], [s1 / 2.4, av[0] + 0.03], [s0 / 2.4, av[0] + 0.03]]);
          if (sd > 0) quad(TRIM, [[ia, ja, -hw - 0.05], [ib, jb, -hw - 0.05], [ib, jb, hw + 0.05], [ia, ja, hw + 0.05]], [-Math.cos(tm), -Math.sin(tm), 0], [[s0 / 2.4, av[0]], [s1 / 2.4, av[0]], [s1 / 2.4, av[1]], [s0 / 2.4, av[1]]]);
          s0 = s1;
        }
      }
      for (const e of [-1, 1]) {
        const ux = e * span;
        quad(RUB, [[ux, foot, -hw], [ux, foot, hw], [ux, spring, hw], [ux, spring, -hw]], [-e, 0, 0], [rub(-hw, foot), rub(hw, foot), rub(hw, spring), rub(-hw, spring)]);
        const ue = e * L / 2, dk = deck(ue), de = dk + high;
        quad(RUB, [[ue, foot, -hw], [ue, foot, hw], [ue, dk, hw], [ue, dk, -hw]], [e, 0, 0], [rub(-hw, foot), rub(hw, foot), rub(hw, dk), rub(-hw, dk)]);
        for (const sd of [-1, 1]) quad(RUB, [[ue, dk, sd * inner], [ue, dk, sd * hw], [ue, de, sd * hw], [ue, de, sd * inner]], [e, 0, 0], [rub(inner, dk), rub(hw, dk), rub(hw, de), rub(inner, de)]);
        for (const sd of [-1, 1]) {
          const px = e * (L / 2 - 0.27), pz = sd * (hw - wall / 2), r = 0.3, y0 = deck(px) - 0.6, y1 = deck(px) + high + 0.5;
          const rows = Math.max(1, Math.round((y1 - y0) / 0.55));
          for (const [nx, nz2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const cx = px + nx * r, cz = pz + nz2 * r, tx = -nz2 * r, tz = nx * r, off = (nx + 2 * nz2 + 3) * 0.13;
            for (let q = 0; q < rows; q++) {
              const ya = y0 + (y1 - y0) * q / rows, yb = y0 + (y1 - y0) * (q + 1) / rows, ua = off + q * 0.11;
              quad(TRIM, [[cx - tx, ya, cz - tz], [cx + tx, ya, cz + tz], [cx + tx, yb, cz + tz], [cx - tx, yb, cz - tz]], [nx, 0, nz2], [[ua, ASHLAR[0] + 0.19], [ua + 0.3, ASHLAR[0] + 0.19], [ua + 0.3, ASHLAR[0]], [ua, ASHLAR[0]]]);
            }
          }
          quad(TRIM, [[px - r, y1, pz - r], [px + r, y1, pz - r], [px + r, y1, pz + r], [px - r, y1, pz + r]], [0, 1, 0], [[0, SLAB[0] + 0.03], [0.15, SLAB[0] + 0.03], [0.15, SLAB[1]], [0, SLAB[1]]], WARM.slab);
        }
      }
      const root = mat(x, y, z, yaw);
      for (const [key, o] of out) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
        g.setIndex(o.i); g.applyMatrix4(root);
        if (!parts.has(key)) parts.set(key, []);
        parts.get(key).push(g);
      }
    }

    function build({ look = 'kit' } = {}) {
      const group = new THREE.Group(); group.name = 'kit-houses';
      let count = 0;
      for (const [key, list] of parts) {
        if (!list.length) continue;
        let g = mergeGeometries(list, false);
        for (const one of list) one.dispose();
        const map = key ? pictures.get(key) : null;
        if (look === 'flat' || !map) {                                     // every face one colour: the picture's, where the face lies on it
          g = g.toNonIndexed();
          const n = g.attributes.position.count, col = g.attributes.color, uv = g.attributes.uv, px = map && kindOf(key) !== 'vine' ? pixelsOf(key === GREY ? tilesKey : key) : null;
          for (let i = 0; i < n; i += 3) {
            let c = [1, 1, 1];
            if (px) {
              const u = (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3, v = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3;
              const a = Math.floor((u - Math.floor(u)) * px.n) % px.n, b = Math.floor((v - Math.floor(v)) * px.n) % px.n, o = (b * px.n + a) * 4;
              c = key === GREY ? Array(3).fill((px.data[o] * 0.3 + px.data[o + 1] * 0.59 + px.data[o + 2] * 0.11) / 255 * 1.9) : [px.data[o] / 255, px.data[o + 1] / 255, px.data[o + 2] / 255];
            }
            for (let k = 0; k < 3; k++) col.setXYZ(i + k, col.getX(i + k) * c[0], col.getY(i + k) * c[1], col.getZ(i + k) * c[2]);
          }
        }
        const material = kindOf(key) === 'vine' && map ? cutoutMaterial(map) : propMaterial(look === 'flat' ? null : map);      // (leaves keep their holes in the flat look too)
        const mesh = new THREE.Mesh(g, material);
        mesh.name = 'kit:' + (key || 'glass');
        mesh.userData.dispose = () => g.dispose();
        count += (g.index ? g.index.count : g.attributes.position.count) / 3;
        group.add(mesh);
      }
      group.userData = { triangles: count, used: new Map(used), dispose() { for (const m of group.children) m.userData.dispose(); } };
      parts.clear(); used.clear(); tris = 0;
      return group;
    }
    return { house, piece, bridge, build, get triangles() { return tris; }, used };
  }
  const measure = spec => measureDesign(spec.blocks ? spec : designFor(spec), shape);
  return { builder, measure, names: [...pieces.keys()].filter(n => n[0] !== '_'), shape, surface, dispose() { for (const list of pieces.values()) for (const p of list) p.geometry.dispose(); for (const t of pictures.values()) t.dispose(); for (const m of cutouts.values()) m.dispose(); } };
}

// ==================================================================== putting a house together
// A design: { paint, blocks: [block], extras: [fn(ctx)] }. A block, in the house's frame:
//   { x, z, yaw, y, w, l, storeys: [{ mat, jet: { f, b, r, l }, style }], roof: { kind, steep, chimney, dormers, ... },
//     door: { side, k }, win: { p, kinds, shut, closed, hood }, balcony: { s, side, from, to, rail }, posts, ... }
// x, z: the middle of its ground storey; yaw a quarter turn or more; w across its own x, l along its own z (the ridge's way);
// y how high its ground storey stands. A storey's jet: how far it juts out past the storey below on each side (front +z,
// back -z, right +x, left -x), 1 or 2 m; style 'cove' (the kit's coved overhangs in the walls below) or 'brace' (braces and
// a soffit, the walls below keep their doors and windows); 'arcade' (posts and arches carry it, the wall below set back).
const SIDE = {                                                             // a rectangle's four sides, each from its left end as seen from outside
  f: { yaw: 0, n: [0, 1], len: r => r.x1 - r.x0, at: (r, u) => [r.x0 + u, r.z1] },
  b: { yaw: Math.PI, n: [0, -1], len: r => r.x1 - r.x0, at: (r, u) => [r.x1 - u, r.z0] },
  r: { yaw: D90, n: [1, 0], len: r => r.z1 - r.z0, at: (r, u) => [r.x1, r.z1 - u] },
  l: { yaw: -D90, n: [-1, 0], len: r => r.z1 - r.z0, at: (r, u) => [r.x0, r.z0 + u] },
};
const SIDES = ['f', 'r', 'b', 'l'];
// the way a piece's own side ('+x', '-x', '+z', '-z') faces once turned yaw; the yaw that turns that side to face the way d = [dx, dz];
// and, for a piece with two sides that matter (a landing's two open sides), the yaw that turns them to the ways da and db, in
// whichever order it can
const facing = (own, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return own === '+x' ? [c, -s] : own === '-x' ? [-c, s] : own === '+z' ? [s, c] : [-s, -c]; };
const yawTo = (own, d) => (own === '+x' ? Math.atan2(-d[1], d[0]) : own === '-x' ? Math.atan2(d[1], -d[0]) : own === '+z' ? Math.atan2(d[0], d[1]) : Math.atan2(-d[0], -d[1]));
const yawTo2 = (a, b, da, db) => { for (const [p, q] of [[da, db], [db, da]]) { const y = yawTo(a, p), f = facing(b, y); if (Math.abs(f[0] - q[0]) + Math.abs(f[1] - q[1]) < 0.01) return y; } return yawTo(a, da); };
const tanOf = S => [Math.cos(S.yaw), -Math.sin(S.yaw)];                   // along a side, the way u grows
const NEXT = { f: 'r', r: 'b', b: 'l', l: 'f' };                           // the side round the corner at a side's right end
// the corner at a side's right end: where it is, and how an overhang corner piece is turned there
const CORNER = { f: [r => [r.x1, r.z1], -D90], r: [r => [r.x1, r.z0], 0], b: [r => [r.x0, r.z0], D90], l: [r => [r.x0, r.z1], Math.PI] };
const POST = { f: 0, r: D90, b: Math.PI, l: -D90 };                        // a corner post at a side's right end (as village-kit.js turns them)

const WALLS = {
  plaster: { plain: ['Wall_Plaster_Straight', 'Wall_Plaster_Straight', 'Wall_Plaster_Straight_L', 'Wall_Plaster_Straight_R'], base: 'Wall_Plaster_Straight_Base',
    upper: ['Wall_Plaster_Straight'],                                     // (over the ground storey: _L, _R and _Base have bricks at their foot)
    door: { flat: 'Wall_Plaster_Door_Flat', round: 'Wall_Plaster_Door_Round', inset: 'Wall_Plaster_Door_RoundInset' },
    win: { wf: 'Wall_Plaster_Window_Wide_Flat', f2: 'Wall_Plaster_Window_Wide_Flat2', wr: 'Wall_Plaster_Window_Wide_Round', th: 'Wall_Plaster_Window_Thin_Round' },
    cove: 'Plaster', grid: 'Wall_Plaster_WoodGrid' },
  stone: { plain: ['Wall_UnevenBrick_Straight'], base: 'Wall_UnevenBrick_Straight',
    door: { flat: 'Wall_UnevenBrick_Door_Flat', round: 'Wall_UnevenBrick_Door_Round', inset: 'Wall_UnevenBrick_Door_Round' },
    win: { wf: 'Wall_UnevenBrick_Window_Wide_Flat', f2: 'Wall_UnevenBrick_Window_Wide_Flat', wr: 'Wall_UnevenBrick_Window_Wide_Round', th: 'Wall_UnevenBrick_Window_Thin_Round' },
    cove: 'UnevenBrick', grid: 'Wall_UnevenBrick_Straight' },
};
WALLS.grid = { ...WALLS.plaster, plain: ['Wall_Plaster_WoodGrid', 'Wall_Plaster_WoodGrid', 'Wall_Plaster_Straight'] };
WALLS.grid.upper = WALLS.grid.plain;
const GLAZE = { wf: 'Window_Wide_Flat1', f2: 'Window_Wide_Flat1', wr: 'Window_Wide_Round1', th: 'Window_Thin_Round1' };
const SHUTTERS = { wf: 'WindowShutters_Wide_Flat', f2: 'WindowShutters_Wide_Flat', wr: 'WindowShutters_Wide_Round', th: 'WindowShutters_Thin_Round' };
const HOOD = { wf: 'Window_Roof_Wide', f2: 'Window_Roof_Wide', wr: 'Window_Roof_Wide', th: 'Window_Roof_Thin' };

// A storey's walls set by hand: st.plan = { f: 'wo D -', r: 'to - to', b: '...', l: '...' }, a word for each 2 m of that side from
// its left end as seen from outside (a side left out: by the dice, as before). The words:
//   -   a plain wall (on the ground the plaster one with bricks at its foot)     <  >   plain, a brace across it
//   x   a lattice (dark behind it)          a   an open arch          0   nothing at all
//   w r t v   a window: wide with a flat top, wide with a round top, thin with a round top, the kit's wide one for upstairs
//             (no bricks at its foot); then o: shutters open, c: shutters shut, h: a hood over it        (wo, tc, rh ...)
//   d D       a door with a flat top or a round one; then its leaf's number (1 plain with a pane, 2 and 4 and 8 ironbound),
//             then s: a stone frame                                                                     (d1, D4s ...)
// The block's own door (B.door: { side, k, kind, leaf }) stands where it says whatever the word there is.
const planOf = (st, side, k) => { const p = st.plan && st.plan[side]; if (!p) return undefined; const a = Array.isArray(p) ? p : p.trim().split(/\s+/); return a[k] === undefined ? '-' : a[k]; };

// each storey's rectangle, in the block's own frame
function rectsOf(B) {
  const out = [{ x0: -B.w / 2, x1: B.w / 2, z0: -B.l / 2, z1: B.l / 2 }];
  if (B.veranda) { const { side, d } = B.veranda, r = { ...out[0] }; if (side === 'f') r.z1 -= d; if (side === 'b') r.z0 += d; if (side === 'r') r.x1 -= d; if (side === 'l') r.x0 += d; B.wallRect = r; }
  for (let s = 1; s < B.storeys.length; s++) {
    const j = B.storeys[s].jet || {}, p = out[s - 1];
    out.push({ x0: p.x0 - (j.l || 0), x1: p.x1 + (j.r || 0), z0: p.z0 - (j.b || 0), z1: p.z1 + (j.f || 0) });
  }
  return out;
}
const topOf = B => B.y + 3 * B.storeys.length;
// how a storey juts out on one side: 'cove', 'brace' or 'arcade' (a storey's style may differ side by side: { f: 'brace', b: 'cove' })
const styleOf = (st, side) => (st && typeof st.style === 'object' ? st.style[side] || 'cove' : (st && st.style) || 'cove');
// a roof's shape (from the piece itself): how high it stands over its walls' top a distance a from its ridge
function roofShape(B, shape) {
  const r = B.rects[B.rects.length - 1], W = r.x1 - r.x0, L = r.z1 - r.z0, R = B.roof || {}, steep = R.steep || 1;
  if (R.kind === 'gable' && roofFits(W, L)) {
    const b = shape(`Roof_RoundTiles_${W}x${L}`);
    return { ridge: b.max.y * steep, eave: b.min.y * steep, out: b.max.x, along: [r.z0 - 0.8, r.z1 + 0.8], cx: (r.x0 + r.x1) / 2, at: a => (b.max.y - (b.max.y - b.min.y) * Math.min(1, Math.abs(a) / b.max.x)) * steep };
  }
  if (R.kind === 'half') {                                                // one slope, its ridge along the block's back
    const span = R.span || 4, b = shape(`Roof_RoundTiles_${span}x${W}`);
    if (b) return { ridge: b.max.y * steep, eave: b.min.y * steep, out: b.max.x, half: true, z0: r.z0, x0: r.x0 - 0.8, x1: r.x1 + 0.8, at: a => (b.max.y - (b.max.y - b.min.y) * Math.min(1, Math.abs(a) / b.max.x)) * steep };
  }
  if (R.kind === 'tower') { const k = W / 4, h = 6.79 * steep * (R.tall || 1); return { ridge: h, eave: -0.57 * steep, out: 2.83 * k, along: [r.z0 - 0.8, r.z1 + 0.8], cx: (r.x0 + r.x1) / 2, pyramid: true, at: a => h * Math.max(0, 1 - Math.abs(a) / (2.83 * k)) }; }
  if (R.kind === 'lean') return { ridge: 1.1, eave: -0.1, out: W / 2 + 0.2, along: [r.z0, r.z1 + 0.6], cx: (r.x0 + r.x1) / 2, lean: true, at: () => 1.1 };
  if (R.kind === 'small') return { ridge: 2.3, eave: -0.34, out: 1.65, along: [r.z0 - 0.3, r.z1 + 0.3], cx: (r.x0 + r.x1) / 2, at: a => 2.3 - 2.64 * Math.min(1, Math.abs(a) / 1.65) };
  return null;
}
// a point of the house's frame in a block's frame
const toBlock = (B, x, z) => { const c = Math.cos(B.yaw || 0), s = Math.sin(B.yaw || 0), dx = x - B.x, dz = z - B.z; return [dx * c - dz * s, dx * s + dz * c]; };
const fromBlock = (B, x, z) => { const c = Math.cos(B.yaw || 0), s = Math.sin(B.yaw || 0); return [B.x + x * c + z * s, B.z - x * s + z * c]; };
// is a point of the house's frame (x, y, z) inside another block's storeys, or under its roof (and how far under)?
function inside(blocks, self, x, y, z, pad = 0.05) {
  for (const B of blocks) {
    if (B === self || B.ghost) continue;
    const [u, v] = toBlock(B, x, z);
    const s = Math.floor((y - B.y) / 3);
    // (an open shelter, B.open: posts and a roof with no walls, hides no wall of the block it stands against)
    if (!B.open && s >= 0 && s < B.storeys.length) { const r = B.rects[s]; if (u > r.x0 - pad && u < r.x1 + pad && v > r.z0 - pad && v < r.z1 + pad) return 'solid'; }
    const top = topOf(B), R = B.roofShape;
    if (R && y >= top - 0.2) {
      const r = B.rects[B.rects.length - 1];
      if (R.pyramid) { const a = Math.max(Math.abs(u - (r.x0 + r.x1) / 2), Math.abs(v - (r.z0 + r.z1) / 2)); if (a < R.out && y < top + R.at(a)) return 'roof'; }
      else if (R.half) { if (u > R.x0 && u < R.x1 && v > R.z0 - 0.3 && v < R.z0 + R.out && y < top + R.at(v - R.z0)) return 'roof'; }
      else if (u > R.cx - R.out && u < R.cx + R.out && v > R.along[0] && v < R.along[1] && y < top + R.at(u - R.cx)) return B.open ? 'shelter' : 'roof';
    }
  }
  return null;
}

// put a design's pieces where they go: root is the house's matrix in the world, put(name, matrix, paint) lays one piece.
// Returns the solid things that stand out of the house's ground (posts, steps, stairs): [[x, z, r], ...] in its frame
function assemble(design, root, put, shape) {
  const solids = [];
  const { blocks, paint } = design;
  for (const B of blocks) {
    B.yaw = B.yaw || 0; B.y = B.y || 0; B.rects = rectsOf(B);
    fitStair(B);
    const st = B.storeys[1], ds = B.door && B.door.side;
    if (st && ds && (st.jet || {})[ds] && styleOf(st, ds) === 'cove') st.style = { ...Object.fromEntries(SIDES.map(k => [k, styleOf(st, k)])), [ds]: 'brace' };
  }
  for (const B of blocks) B.roofShape = roofShape(B, shape);
  const R = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3(), S = new THREE.Vector3();
  // a piece in a block's frame (or the house's, B = null): at x, y, z, turned yaw, scaled
  const X1 = new THREE.Vector3(1, 0, 0), QT = new THREE.Quaternion();
  const at = (B, name, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, p = paint, tilt = 0) => {
    Q.setFromAxisAngle(UP, yaw); if (tilt) Q.multiply(QT.setFromAxisAngle(X1, tilt));      // (tilt: about the piece's own x, before it is turned)
    let m = new THREE.Matrix4().compose(V.set(x, y, z), Q, S.set(sx, sy, sz));
    if (B) m = R.compose(V.set(B.x, B.y, B.z), Q.setFromAxisAngle(UP, B.yaw), S.set(1, 1, 1)).clone().multiply(m);
    const M = root.clone().multiply(m);
    put(name, M, p);
    if (name === 'Wall_Plaster_WoodGrid') put('_LatticeBack', M, { ...(p || {}), glass: DARK });      // (dark behind a lattice)
  };
  const solid = (B, u, v, rad) => { const [x, z] = B ? fromBlock(B, u, v) : [u, v]; solids.push([+x.toFixed(2), +z.toFixed(2), rad]); };
  // the ground taken, as boxes [x0, z0, x1, z1] in the house's frame: the blocks (with all that juts out over them), the steps up
  // to their doors, outside stairs, porches. A thing of the yard (a fence, a shed, a low wall, a wagon) is built only where it
  // finds room (room(): free, then taken by it), so none stands in a stair, on a step or in a wall
  // (each box with the height it starts at: a storey jutting out 3 m up leaves room under it for a fence, not for a shed)
  const taken = [];
  const boxOf = (B, u0, v0, u1, v1) => { const p = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]].map(([u, v]) => B ? fromBlock(B, u, v) : [u, v]); return [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))]; };
  const meets = (a, b) => a[0] < b[2] - 0.05 && b[0] < a[2] - 0.05 && a[1] < b[3] - 0.05 && b[1] < a[3] - 0.05;
  const claim = (B, u0, v0, u1, v1, from = 0, to = 99) => { taken.push([...boxOf(B, u0, v0, u1, v1), from, to]); };
  const free = (B, u0, v0, u1, v1, h = 9, lo = 0) => { const a = boxOf(B, u0, v0, u1, v1); return !taken.some(t => t[4] < h && t[5] > lo && meets(a, t)); };      // (nothing there between the heights lo and h)
  const room = (B, u0, v0, u1, v1, h = 9) => { if (!free(B, u0, v0, u1, v1, h)) return false; claim(B, u0, v0, u1, v1, 0, h); return true; };
  for (const B of blocks) {
    if (B.ghost) continue;
    const g = B.rects[0], m = B.plinth ? 0.3 : 0.1;
    claim(B, g.x0 - m, g.z0 - m, g.x1 + m, g.z1 + m);
    B.rects.forEach((q, s) => { if (s) claim(B, q.x0 - 0.1, q.z0 - 0.1, q.x1 + 0.1, q.z1 + 0.1, B.y + 3 * s - 0.2); });
    // its roof's overhang, from the eaves' height up (a shed may not stand into the eaves; a fence may run under them)
    const E = B.roofShape, q = B.rects[B.rects.length - 1], top = B.y + 3 * B.storeys.length;
    if (E) {
      const from = top + (E.eave ?? -0.3) - 0.35, mz = (q.z0 + q.z1) / 2;
      if (E.pyramid) claim(B, E.cx - E.out, mz - E.out, E.cx + E.out, mz + E.out, from);
      else if (E.half) claim(B, E.x0, E.z0, E.x1, E.z0 + E.out, from);
      else claim(B, E.cx - E.out, E.along[0], E.cx + E.out, E.along[1], E.lean ? top - 0.5 : from);
    }
  }
  const ctx = { at, blocks, paint, shape, surface: shape.surface, solid, claim, free, room, rng: mulberry(design.seed || 7), inside: (x, y, z) => inside(blocks, null, x, y, z) };
  for (const B of blocks) if (!B.ghost) block(B, ctx, design);
  for (const fn of design.extras || []) if (!fn.yard) fn(ctx);                   // the house's own (porches, vines, paving) first,
  for (const fn of design.extras || []) if (fn.yard) fn(ctx);                    // then the yard's, where they find room
  return solids;
}

// one block: its storeys' walls, corners and overhangs, and its roof
function block(B, ctx, design) {
  const { at, blocks, paint } = ctx, r = mulberry(B.seed || hashOf(JSON.stringify([B.x, B.z, B.w, B.l])));
  const pick = a => a[Math.floor(r() * a.length)];
  const n = B.storeys.length, win = { p: 0.6, kinds: ['wf', 'wr', 'th'], shut: 0.6, closed: 0.25, hood: 0.15, ...(B.win || {}) };
  const winKind = pick(win.kinds), winKind2 = pick(win.kinds);           // two kinds of window at most in a block
  const world = (u, v) => fromBlock(B, u, v);
  // what is in front of a wall: 'solid' (another block: no wall), 'roof' (under a lower roof: plain), or free
  const facing = (s, side, rect, k, covered = false) => {
    const S = SIDE[side], y0 = B.y + 3 * s;
    let solid = 0, roofed = 0, high = 0;
    for (const du of [0.15, 1, 1.85]) {
      const [u, v] = S.at(rect, 2 * k + du), [px, pz] = world(u + S.n[0] * 0.45, v + S.n[1] * 0.45);
      const mid = inside(blocks, B, px, y0 + 1.5, pz), top = inside(blocks, B, px, y0 + 2.9, pz), low = inside(blocks, B, px, y0 + 0.3, pz);
      if (mid === 'solid') solid++;
      if (mid || low) roofed++;
      if (top && top !== 'shelter') high++;                                // (under an open shelter's boards a wall is still built whole)
    }
    if (solid >= 2 || high === 3) return 'hidden';
    return roofed || solid || covered ? 'plain' : 'free';
  };
  const coveTo = s => { const o = {}; if (s + 1 < n) for (const k of SIDES) if ((B.storeys[s + 1].jet || {})[k] && styleOf(B.storeys[s + 1], k) === 'cove') o[k] = B.storeys[s + 1].jet[k]; return o; };
  const doorSide = B.door ? B.door.side : null;
  const balDoorOf = (s, side) => (B.balcony && B.balcony.s === s && B.balcony.side === side ? Math.round((B.balcony.from + (B.balcony.to ?? B.balcony.from)) / 2) : -1);
  // no hood over a window that is sheltered already: under the eaves of the block's own roof (its top storey: the eave sides of a
  // gable, the low side of a catslide or a lean-to, every side under a pyramid), under a storey or a balcony jutting out above
  // it, on a veranda's wall or under a porch
  const R0 = B.roof || {};
  const noHood = (s, side) => (s === n - 1 && (R0.kind === 'tower' || ((R0.kind === 'gable' || R0.kind === 'small') && (side === 'l' || side === 'r')) || ((R0.kind === 'half' || R0.kind === 'lean') && side === 'f')))
    || (s + 1 < n && (B.storeys[s + 1].jet || {})[side] > 0) || (!!B.balcony && B.balcony.s === s + 1 && (B.balcony.side === side || (!!B.balcony.wrap && NEXT[B.balcony.side] === side)))
    || (s === 0 && ((!!B.veranda && B.veranda.side === side) || (B.sheltered || []).includes(side)));
  const span = stairSpan(B), underStair = (s, side, k) => span && s === 0 && side === span.side && 2 * k < span.u1 && 2 * k + 2 > span.u0;
  // a storey of four chamfered corners (the kit's Overhang_*_Corner_Front) over a 4 x 4 storey coved all round, if asked
  const chamfered = s => B.chamfer && s > 0 && s === n - 1 && B.rects[s - 1].x1 - B.rects[s - 1].x0 === 4 && B.rects[s - 1].z1 - B.rects[s - 1].z0 === 4
    && SIDES.every(k => (B.storeys[s].jet || {})[k] === 1 && styleOf(B.storeys[s], k) === 'cove');
  for (let s = 0; s < n; s++) {
    // up a storey the plaster walls stand without the band of bricks the kit gives their foot (a ground storey's): it showed as
    // grey patches across the face of a house, under some windows and not others
    const at = s > 0 ? (B2, name, x, y2, z, yaw = 0, sx = 1, sy = 1, sz = 1, p = paint, tilt = 0) => ctx.at(B2, name, x, y2, z, yaw, sx, sy, sz, p && /^Wall_Plaster_/.test(name) ? { ...p, noFoot: true } : p, tilt) : ctx.at;
    const sctx = s > 0 ? { ...ctx, at } : ctx;
    if (chamfered(s)) {
      const low = B.rects[s - 1], W2 = WALLS[B.storeys[s - 1].mat] || WALLS.plaster;
      for (const side of SIDES) { const [cxy, yawC] = CORNER[side], [cx, cz] = cxy(low); at(B, `Overhang_${W2.cove}_Corner_Front`, cx, 3 * s, cz, yawC); B[`segs${s}${side}`] = []; }
      continue;
    }
    const st = B.storeys[s], rect = s === 0 && B.wallRect ? B.wallRect : B.rects[s], y = 3 * s, W = WALLS[st.mat] || WALLS.plaster, cove = coveTo(s);
    const arcade = {}; if (s + 1 < n) for (const k of SIDES) if ((B.storeys[s + 1].jet || {})[k] && styleOf(B.storeys[s + 1], k) === 'arcade') arcade[k] = B.storeys[s + 1].jet[k];
    // a wall set by hand (st.plan, above rectsOf): what its word says, no dice
    const planned = (S, tok, u, v) => {
      if (tok === '0') return;
      if (tok === 'a') { at(B, 'Wall_Arch', u, y, v, S.yaw); return; }
      if (tok === 'x') { at(B, WALLS.plaster.grid, u, y, v, S.yaw); return; }
      if (tok === '<' || tok === '>') { at(B, tok === '<' ? 'Wall_Plaster_Straight_L' : 'Wall_Plaster_Straight_R', u, y, v, S.yaw); return; }
      const c0 = tok[0], kind = { w: 'wf', v: 'f2', r: 'wr', t: 'th' }[c0];
      if (c0 === 'd' || c0 === 'D') {
        const round = c0 === 'D', leaf = (tok.match(/[1248]/) || ['1'])[0];
        door(B, sctx, r, W, st, u, y, v, S.yaw, round ? 'round' : 'flat', { leaf: `Door_${leaf}_${round ? 'Round' : 'Flat'}`, frame: tok.includes('s') ? 'stone' : 'wood' });
      } else if (kind) {
        at(B, W.win[kind], u, y, v, S.yaw); at(B, GLAZE[kind], u, y, v, S.yaw);
        if (tok.includes('o')) at(B, SHUTTERS[kind] + '_Open', u, y, v, S.yaw); else if (tok.includes('c')) at(B, SHUTTERS[kind] + '_Closed', u, y, v, S.yaw);
        if (tok.includes('h')) at(B, HOOD[kind], u, y, v, S.yaw);
      } else at(B, st.mat === 'stone' ? 'Wall_UnevenBrick_Straight' : s === 0 ? WALLS.plaster.base : 'Wall_Plaster_Straight', u, y, v, S.yaw);
    };
    // the corners where both sides are coved: one overhang corner piece takes the last 2 m of each
    const cornered = {};
    for (const side of SIDES) { const nx = NEXT[side]; if ((cove[side] || 0) === 1 && (cove[nx] || 0) === 1) cornered[side] = true; }
    const cornerLeft = side => cornered[Object.keys(NEXT).find(k => NEXT[k] === side)];
    for (const side of SIDES) {
      const S = SIDE[side], len = S.len(rect), count = Math.round(len / 2), d = cove[side] || 0;
      const segs = [];
      for (let k = 0; k < count; k++) {
        if ((k === count - 1 && cornered[side]) || (k === 0 && cornerLeft(side))) { segs.push('corner'); continue; }
        const f = facing(s, side, rect, k);
        segs.push(f !== 'hidden' && underStair(s, side, k) ? 'stair' : f);   // (a plain wall behind an outside stair)
      }
      // the door: on the ground storey, on its side (the middle wall, or the one asked for, or the nearest free one)
      let doorK = -1;
      if (s === 0 && side === doorSide && !d) {
        const want = B.door.k === undefined || B.door.k === null ? Math.floor((count - 1) / 2) : Math.min(count - 1, B.door.k);
        const order = [...segs.keys()].sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
        doorK = order.find(k => segs[k] === 'free');
        if (doorK === undefined) doorK = order.find(k => segs[k] === 'plain');
        if (doorK === undefined) doorK = -1;
      }
      if (doorK >= 0) B.doorAt = { side, k: doorK };
      // the shelter over that door, and the walls under a canopy's eaves kept calm (no open shutters, no hood)
      const sh = s === 0 && doorK >= 0 ? shelterOf(B, side, doorK, count) : null;
      if (sh) B.shelterAt = { ...sh, side };
      const calm = k => !!sh && sh.kind !== 'porch' && k !== doorK && 2 * k < sh.u + sh.half && 2 * k + 2 > sh.u - sh.half;
      const isDoor = k => k === doorK || k === balDoorOf(s, side) || (B.doors || []).some(q => q.s === s && q.side === side && q.k === k) || (!!B.stair && s === 1 && B.stair.side === side && B.stair.k === k);
      const balc = B.balcony && B.balcony.s === s && B.balcony.side === side ? B.balcony : null;
      const balDoor = balDoorOf(s, side);                                  // (a balcony round the corner has no `to`: its door in its first wall)
      const more = (B.doors || []).filter(q => q.s === s && q.side === side);
      if (B.stair && s === 1 && B.stair.side === side) more.push({ s: 1, side, k: B.stair.k, kind: 'flat', leaf: B.stair.kind === 'wood' ? 'Door_1_Flat' : 'Door_8_Flat' });
      let lastOpen = -9;                                                 // (the last wall of this side whose wide shutters stand open)
      for (let k = 0; k < count; k++) {
        const what = segs[k];
        if (what === 'hidden' || what === 'corner') continue;
        const [u, v] = S.at(rect, 2 * k + 1);
        if (d) {                                                           // a coved wall: the storey above juts out d metres over it
          at(B, `Overhang_${W.cove}_${d === 2 ? 'Long' : 'Short'}`, u, y, v, S.yaw);
          continue;
        }
        if (arcade[side]) continue;                                        // (set back under an arcade: built with the arcade)
        if (s === 0 && B.arches && B.arches.includes(side)) { at(B, 'Wall_Arch', u, y, v, S.yaw); continue; }
        const extra = more.find(q => q.k === k);
        if (extra) { door(B, sctx, r, W, st, u, y, v, S.yaw, extra.kind || 'flat', extra); continue; }
        if (k === doorK || (k === balDoor && what === 'free')) { door(B, sctx, r, W, st, u, y, v, S.yaw, s === 0 ? (B.door.kind || pick(['flat', 'round', 'round', 'flat'])) : 'flat', s === 0 ? B.door : { leaf: 'Door_1_Flat' }); continue; }
        const tok = planOf(st, side, k);
        if (tok !== undefined) { planned(S, tok, u, v); continue; }
        if (what === 'free' && r() < (st.win ?? win.p)) {
          // a wide window's open shutters are wider than its 2 m of wall (2.3 to 2.5 m): open only with a wall on either side of it
          // whose own are not (at a wall's end they stood out past the corner, and two side by side ran into each other)
          const can = { open: k > 0 && k < count - 1 && lastOpen !== k - 1 && !isDoor(k - 1) && !isDoor(k + 1), hood: !noHood(s, side) && !calm(k), calm: calm(k) };
          if (window_(B, sctx, r, W, u, y, v, S.yaw, k % 2 ? winKind2 : winKind, win, s, can)) lastOpen = k;
        }
        else at(B, s === 0 && st.mat === 'plaster' && r() < 0.4 ? W.base : (st.grid && r() < st.grid ? WALLS.plaster.grid : pick(s > 0 && W.upper ? W.upper : W.plain)), u, y, v, S.yaw);
      }
      // the ends of a coved side that does not turn the corner coved: the overhang's side pieces
      if (d && count) {
        const len2 = d === 2 ? 'Long' : 'Short';
        if (!cornerLeft(side) && segs[0] !== 'hidden') { const [u, v] = S.at(rect, 1); at(B, `Overhang_Side_${W.cove === 'Plaster' ? 'Plaster' : 'UnevenBrick'}_${len2}_L`, u, y, v, S.yaw); }
        if (!cornered[side] && segs[count - 1] !== 'hidden') { const [u, v] = S.at(rect, 2 * count - 1); at(B, `Overhang_Side_${W.cove === 'Plaster' ? 'Plaster' : 'UnevenBrick'}_${len2}_R`, u, y, v, S.yaw); }
      }
      B[`segs${s}${side}`] = segs;
    }
    // the corners: an overhang corner piece, a post, stone quoins, or nothing (a side piece is there, or no wall is)
    for (const side of SIDES) {
      const [cxy, yawC] = CORNER[side], [cx, cz] = cxy(rect), nx = NEXT[side];
      if (cornered[side]) { at(B, `Overhang_${W.cove}_Corner`, cx, y, cz, yawC); continue; }
      const a = B[`segs${s}${side}`], b = B[`segs${s}${nx}`];
      const shown = (a && a.length && a[a.length - 1] !== 'hidden') || (b && b.length && b[0] !== 'hidden');
      if (!shown) continue;
      const sideAbove = (cove[side] && !cornered[side]) || (cove[nx] && !cornered[side]);        // a side piece covers it
      const below = s > 0 ? coveTo(s - 1) : {};
      if (sideAbove || ((below[side] || below[nx]) && !(below[side] && below[nx]))) continue;
      if (st.mat === 'stone' && B.quoins && s < (B.quoins === true || B.quoins === 'wide' ? 1 : B.quoins)) at(B, B.quoins === 'wide' ? 'Corner_ExteriorWide_Brick' : 'Corner_Exterior_Brick', cx, y, cz, POST[side]);
      else {
        at(B, st.mat === 'stone' ? 'Corner_ExteriorWide_Wood' : 'Corner_Exterior_Wood', cx, y, cz, POST[side]);
        if (st.mat !== 'stone') at(B, s === n - 1 ? 'Corner_Exterior_TopOnly' : 'Corner_Exterior_TopDown', cx, y, cz, POST[side]);
        if (B.open && s === 0) ctx.solid(B, cx, cz, 0.2);                  // (a shelter's post: to be walked round)
      }
    }
    // the storey above jutting out on braces, or on an arcade: a soffit under it, braces or posts, a beam under its walls
    if (s + 1 < n) {
      const nx2 = B.storeys[s + 1], j = nx2.jet || {}, up = B.rects[s + 1];
      for (const side of SIDES) {
        const d = j[side] || 0, sty = styleOf(nx2, side); if (!d || sty === 'cove') continue;
        const arc = sty === 'arcade';
        const S = SIDE[side], len = S.len(rect), count = Math.round(len / 2);
        for (let k = 0; k < count; k++) {
          const [u, v] = S.at(rect, 2 * k + 1);
          at(B, nx2.mat === 'stone' ? 'Overhang_Roof_UnevenBricks' : 'Overhang_Roof_Plaster', u + S.n[0] * d / 2, y + 3, v + S.n[1] * d / 2, S.yaw, 1, 1, d / 2);
          if (arc) {                                                       // the arcade: an arch on posts at its front, the shop's wall behind
            const [ou, ov] = [u + S.n[0] * d, v + S.n[1] * d];
            at(B, 'Wall_Arch', ou, y, ov, S.yaw);
            at(B, 'Floor_Brick', u + S.n[0] * d / 2, y + 0.02, v + S.n[1] * d / 2, S.yaw, 1, 1, d / 2);
            const what = B[`segs${s}${side}`][k];
            if (what !== 'hidden') {
              const tok = planOf(st, side, k);
              if (tok !== undefined) planned(S, tok, u, v);
              else if (k === Math.floor((count - 1) / 2) || r() < 0.35) door(B, sctx, r, W, st, u, y, v, S.yaw, 'round', { leaf: pick(['Door_1_Round', 'Door_4_Round']) });
              else window_(B, sctx, r, W, u, y, v, S.yaw, 'f2', { shut: 0, hood: 0 }, s);
            }
          }
        }
        for (let k = 0; k <= count; k++) {
          const [u, v] = S.at(rect, 2 * k);
          if (arc) { at(B, 'Corner_ExteriorWide_Wood', u + S.n[0] * (d - 0.05), y, v + S.n[1] * (d - 0.05), S.yaw); if (s === 0) ctx.solid(B, u + S.n[0] * (d - 0.05), v + S.n[1] * (d - 0.05), 0.2); }
          // (no brace at a corner of stones: the storey above rests on the stones there. A brace at the corner came out
          // through them, a dark stub on the wall round the corner)
          else if (!((k === 0 || k === count) && st.mat === 'stone' && B.quoins && s < (B.quoins === true || B.quoins === 'wide' ? 1 : B.quoins))) {
            // the kit's brace is made for a storey two metres out, its top (2.92 up) in the floor above. One metre out: made
            // smaller both ways and lifted, its top still in that floor (made lower only, its top hung short of the floor)
            const bs = d === 2 ? 1 : 0.6;
            at(B, 'Prop_Support', u, y + 2.92 * (1 - bs), v, S.yaw, 1, bs, d / 2);
          }
        }
        // the corners beyond the old ones, when the side round the corner juts out too
        for (const [end, other] of [[0, Object.keys(NEXT).find(k => NEXT[k] === side)], [count, NEXT[side]]]) {
          const e = styleOf(nx2, other) === 'cove' ? 0 : j[other] || 0; if (!e) continue;
          const [u, v] = S.at(rect, 2 * end), O = SIDE[other];
          if (end === 0) continue;                                         // (each corner once: at a side's right end)
          at(B, 'Overhang_Roof_Plaster', u + S.n[0] * d / 2 + O.n[0] * e / 2, y + 3, v + S.n[1] * d / 2 + O.n[1] * e / 2, S.yaw, e / 2, 1, d / 2);
        }
        // a beam under the walls above
        const U = SIDE[side], ulen = U.len(up), uc = Math.round(ulen / 2);
        for (let k = 0; k < uc; k++) { const [u, v] = U.at(up, 2 * k + 1); at(B, 'Wall_BottomCover', u, y + 3, v, U.yaw); }
      }
    }
  }
  // little caps on the corner posts, and a post in each inner corner where this block meets another
  for (let s = 0; s < n; s++) {
    const rect = s === 0 && B.wallRect ? B.wallRect : B.rects[s], y = 3 * s;
    for (const side of SIDES) {
      const S = SIDE[side], segs = B[`segs${s}${side}`]; if (!segs || !segs.length) continue;
      const t = tanOf(S);
      for (const [end, u, yawI] of [[0, 0, S.yaw - D90], [segs.length - 1, S.len(rect), S.yaw + Math.PI]]) {
        if (segs[end] === 'hidden' || segs[end] === 'corner') continue;
        const [pu, pv] = S.at(rect, u), dir = end === 0 ? -1 : 1;
        const [qx, qz] = world(pu + t[0] * dir * 0.4 + S.n[0] * 0.4, pv + t[1] * dir * 0.4 + S.n[1] * 0.4);
        if (inside(blocks, B, qx, B.y + y + 1.5, qz) === 'solid') at(B, B.storeys[s].mat === 'stone' ? 'Corner_Interior_Small' : 'Corner_Interior_Big', pu, y, pv, yawI);
      }
    }
  }
  if (B.doorAt) {                                                          // the ground before the door, kept clear
    const S = SIDE[B.doorAt.side], rect0 = B.wallRect || B.rects[0], t = tanOf(S), [u, v] = S.at(rect0, 2 * B.doorAt.k + 1);
    ctx.claim(B, u - t[0] * 1.0, v - t[1] * 1.0, u + t[0] * 1.0 + S.n[0] * 1.8, v + t[1] * 1.0 + S.n[1] * 1.8);
  }
  if (B.shelterAt) shelter(B, ctx, B.shelterAt);
  roof(B, ctx, r);
  if (B.balcony) balcony(B, ctx, r, B.balcony);
  if (B.veranda) veranda(B, ctx, r, B.veranda);
  if (B.stair) stair(B, ctx, r, B.stair);
  if (B.plinth) plinth(B, ctx, r, B.doorAt);
}

// what shelters a block's main door (the design asks with B.shelter: 'canopy', 'long' or 'porch'; the door is the wall k of
// `count` on its side): a tiled canopy, the kit's little gabled roofs, 3.3 m wide and 2.7 m high, or 4.35 m wide ('long'): only on
// the gable end of a one-storey block (a storey up, its gable stood before the window above), in the middle of a front of two
// walls or over a door in the middle of a longer one (over a door at a front's end its eaves reached past the corner); elsewhere a
// porch of boards on two posts, one wall wide. None under the eaves of the block's own roof, under a storey or a balcony jutting
// out, on a veranda, by an outside stair, or up on a plinth
function shelterOf(B, side, k, count) {
  const want = B.shelter; if (!want) return null;
  const n = B.storeys.length, R = B.roof || {};
  if (B.plinth || B.y) return null;
  if (n === 1 && (R.kind === 'tower' || ((R.kind === 'gable' || R.kind === 'small') && (side === 'l' || side === 'r')) || ((R.kind === 'half' || R.kind === 'lean') && side === 'f'))) return null;
  if ((B.balcony && B.balcony.s === 1 && (B.balcony.side === side || (B.balcony.wrap && NEXT[B.balcony.side] === side))) || (B.storeys[1] && (B.storeys[1].jet || {})[side]) || (B.veranda && B.veranda.side === side) || (B.stair && B.stair.side === side)) return null;
  if (want !== 'porch' && n === 1 && R.kind === 'gable' && (side === 'f' || side === 'b') && count >= 2) {
    const half = want === 'long' ? 2.17 : 1.65;
    if (count === 2) return { kind: 'canopy', u: 2, half: 1.65 };          // (the long one is wider than a front of two walls)
    if (k > 0 && k < count - 1) return { kind: want, u: 2 * k + 1, half };
  }
  return { kind: 'porch', u: 2 * k + 1, half: 1.13 };
}
function shelter(B, ctx, sh) {
  const { at, solid, claim } = ctx, S = SIDE[sh.side], rect = B.wallRect || B.rects[0], t = tanOf(S), [nx, nz] = S.n;
  const P = (u, out) => { const [a, b] = S.at(rect, u); return [a + nx * out, b + nz * out]; }, [u, v] = P(sh.u, 0);
  if (sh.kind === 'porch') {
    at(B, 'Roof_Wooden_2x1', u, 2.55, v, S.yaw, 1, 1, 1.25);
    for (const e of [-0.88, 0.88]) { const [pu, pv] = P(sh.u + e, 1.75); at(B, 'Corner_Exterior_Wood', pu, -0.4, pv, S.yaw, 0.8, 0.98, 0.8); solid(B, pu, pv, 0.22); }
    claim(B, ...P(sh.u - 1.2, 0), ...P(sh.u + 1.2, 2.0));
  } else {
    at(B, sh.kind === 'long' ? 'Roof_RoundTile_2x1_Long' : 'Roof_RoundTile_2x1', u, sh.kind === 'long' ? 3.1 : 2.75, v, S.yaw);
    claim(B, ...P(sh.u - sh.half, 0), ...P(sh.u + sh.half, 1.6), 1.9);
  }
  if ((B.roof || {}).kind === 'gable' && (sh.side === 'f' || sh.side === 'b')) { B.bareGable = [...(B.bareGable || []), sh.side]; B.plainGable = [...(B.plainGable || []), sh.side]; }
}

// a veranda: posts on the line the wall would have stood on, braces up to the eaves' beam, a board floor, a low rail
function veranda(B, ctx, r, { side, d }) {
  const { at } = ctx, S = SIDE[side], full = B.rects[0], count = Math.round(S.len(full) / 2), top = 3 * B.storeys.length;
  const [nx, nz] = S.n;
  for (let k = 0; k <= count; k++) {
    const [u, v] = S.at(full, 2 * k), inset = k === 0 ? 0.12 : k === count ? -0.12 : 0, t = [Math.cos(S.yaw), -Math.sin(S.yaw)];
    const pu = u + t[0] * inset - nx * 0.12, pv = v + t[1] * inset - nz * 0.12;
    at(B, 'Corner_Exterior_Wood', pu, 0, pv, S.yaw, 1, top / 3, 1);
    ctx.solid(B, pu, pv, 0.25);
    if (k > 0 && k < count) at(B, 'Prop_Support', pu - nx * 0.05, top - 3, pv - nz * 0.05, S.yaw + Math.PI, 1, 1, 0.5);
  }
  for (let k = 0; k < count; k++) {
    const [u, v] = S.at(full, 2 * k + 1);
    for (let q = 0; q < d / 2; q++) at(B, 'Floor_WoodLight', u - nx * (1 + 2 * q), 0.06, v - nz * (1 + 2 * q), S.yaw);
    if (k !== Math.floor((count - 1) / 2)) at(B, 'Balcony_Cross_Straight', u - nx * 1.12, 0.06, v - nz * 1.12, S.yaw, 1, 0.8, 1);
    at(B, 'Wall_BottomCover', u - nx * 0.12, top, v - nz * 0.12, S.yaw);
  }
}

// a door in a wall: the wall with its opening, the frame, the leaf hanging from its left jamb
function door(B, ctx, r, W, st, u, y, v, yaw, kind, opt = {}) {
  const { at } = ctx, inset = kind === 'inset' && W === WALLS.plaster;
  const k2 = kind === 'inset' ? 'round' : kind;
  at(B, W.door[inset ? 'inset' : k2], u, y, v, yaw);
  const back = inset ? -1 : 0, c = Math.cos(yaw), s = Math.sin(yaw), bx = u + Math.sin(yaw) * back, bz = v + Math.cos(yaw) * back;
  const stoneFrame = opt.frame === 'stone' || (st.mat === 'stone' && opt.frame !== 'wood' && B.quoins);
  at(B, k2 === 'round' ? (stoneFrame ? 'DoorFrame_Round_Brick' : 'DoorFrame_Round_WoodDark') : (stoneFrame ? 'DoorFrame_Flat_Brick' : 'DoorFrame_Flat_WoodDark'), bx, y, bz, yaw);
  const leaf = opt.leaf || (k2 === 'round' ? (r() < 0.5 ? 'Door_1_Round' : r() < 0.5 ? 'Door_8_Round' : 'Door_4_Round') : (r() < 0.5 ? 'Door_1_Flat' : r() < 0.5 ? 'Door_4_Flat' : 'Door_8_Flat'));
  at(B, k2 === 'round' ? leaf.replace('_Flat', '_Round') : leaf.replace('_Round', '_Flat'), bx - 0.51 * c, y, bz + 0.51 * s, yaw);
}
// a window in a wall: the wall with its opening, the frame and panes, shutters open or shut, a hood over some
// (can.open false: its wide shutters may not stand open; can.hood false: no hood. Says whether wide shutters stand open here)
function window_(B, ctx, r, W, u, y, v, yaw, kind, win, s, can = {}) {
  const { at } = ctx, wide = kind !== 'th';
  at(B, W.win[kind], u, y, v, yaw);
  at(B, GLAZE[kind], u, y, v, yaw);
  if ((win.shut ?? 0.6) > r()) {
    const closed = r() < (win.closed ?? 0.25);
    if (!closed && (can.calm || (wide && can.open === false))) { if (r() < 0.55) at(B, SHUTTERS[kind] + '_Closed', u, y, v, yaw); return false; }
    at(B, SHUTTERS[kind] + (closed ? '_Closed' : '_Open'), u, y, v, yaw);
    return !closed && wide;
  }
  if (can.hood !== false && (win.hood ?? 0.15) > r()) at(B, HOOD[kind], u, y, v, yaw);
  return false;
}

// a block's roof
function roof(B, ctx, r) {
  const { at, blocks } = ctx, R = B.roof || {}, top = 3 * B.storeys.length, rect = B.rects[B.rects.length - 1];
  const W = rect.x1 - rect.x0, L = rect.z1 - rect.z0, cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2, steep = R.steep || 1;
  const world = (u, v) => fromBlock(B, u, v);
  // is the end of the roof at v (its gable) against a taller block all across it? then no gable there (a gable partly against
  // another is built: the part inside the other is not seen, and without it the roof would stand open over the rest)
  const solidAt = (u, v, h) => { const [x, z] = world(u, v + Math.sign(v - cz) * 0.5); return inside(blocks, B, x, B.y + top + h, z) === 'solid'; };
  const against = v => { const hm = B.roofShape ? Math.max(0.8, B.roofShape.ridge * 0.5) : 1.2; return [[0, hm], [0, 0.5], [-W / 2 + 0.7, 0.4], [W / 2 - 0.7, 0.4]].every(([du, h]) => solidAt(cx + du, v, h)); };
  if (R.kind === 'gable' && roofFits(W, L)) {
    const name = `Roof_RoundTiles_${W}x${L}`, b = ctx.shape(name), off = (b.min.z + b.max.z) / 2 > 1 ? (b.min.z + b.max.z) / 2 : 0;      // (6x4 is made from its end)
    at(B, name, cx, top, cz - off, 0, 1, steep, 1);
    for (const [v, yaw] of [[rect.z1, 0], [rect.z0, Math.PI]]) {
      if (against(v) || (R.noGable && R.noGable.includes(yaw ? 'b' : 'f'))) continue;
      at(B, `Roof_Front_Brick${W}`, cx, top, v, yaw, 1, steep, 1);
      // a little window up in the gable, shutters open or shut (not where it is against another block). By hand: R.gables =
      // { f: 'open' | 'shut' | 'bare' (a window, no shutters) | 'none', b: ... }; else by the dice (R.gableWin: how likely)
      const asked = R.gables ? R.gables[yaw ? 'b' : 'f'] || 'none' : null;
      if (asked ? asked !== 'none' : R.gableWin && r() < R.gableWin) {
        const sg = yaw ? -1 : 1, open = asked ? asked === 'open' : r() < 0.6;
        if (![-0.45, 0, 0.45].some(du => solidAt(cx + du, v, 0.8)) && !(B.plainGable || []).includes(yaw ? 'b' : 'f')) {
          at(B, 'Window_Thin_Flat1', cx, top - 0.45, v + sg * 0.04, yaw);
          if (asked !== 'bare') at(B, open ? 'WindowShutters_Thin_Flat_Open' : 'WindowShutters_Thin_Flat_Closed', cx, top - 0.45, v + sg * 0.04, yaw);
        }
      }
      // the beam ends under the gable's eaves: spread for a wider roof, but no further than the tiles stand clear over them
      // (at the corners of a wider roof they would come up through the tiles)
      // (and drawn in until the tiles stand clear over the outermost one's top, by the tiles as they are: under the roof four
      // across, as the kit made them, the outermost came up through the tiles at the eave, a block of wood lying on the roof)
      if (R.supports && !(B.bareGable || []).includes(yaw ? 'b' : 'f')) {
        const surf = ctx.surface(name), zr = v - (cz - off), out = yaw ? -1 : 1;
        const under = q => [2.74, 2.6, 2.45].every(x => [0.05, 0.3, 0.62].every(dz => surf(x * q, zr + out * dz) * steep >= 0.11 + 0.2));
        let q = Math.min(W / 4, SUPPORTS[W] || 1);
        while (q > 0.5 && !under(q)) q -= 0.01;
        at(B, 'Roof_FrontSupports', cx, top, v, yaw, q, 1, 1);
      }
    }
    const S = B.roofShape, roofY = a => top + S.at(a);
    if (R.log) at(B, 'Roof_Log', cx, top + S.ridge - 4.89, cz, 0, 1, 1, (L + 1.2) / 10.7);      // a wooden ridge riding on the tiles' (made for the 6-wide roof)
    // a chimney. The kit's has its foot cut to lie on the kit's roofs: low at its own -x, 1.21 higher at its +x, 0.95 across.
    // So: its high edge to the ridge, and let down until all round its foot is under the tiles (6 cm under the lowest of them
    // there: the tiles are rounds and steps). (It stood the other way round, its foot's high edge down the slope: that edge
    // hung clear of the tiles, as two points. The user, 28 Nov 2026: "อันนี้ประกอบไม่มิด หรือควรเป็นแบบนี้")
    const chimney = (side, z, kind) => {
      const dx = W * 0.22, surf = ctx.surface(name);
      let y0 = 1e6;
      for (let k = 0; k <= 20; k++) for (const [px, pz] of [[-0.5 + 0.95 * k / 20, -0.5], [-0.5 + 0.95 * k / 20, 0.5], [-0.5, -0.5 + k / 20], [0.45, -0.45 + 0.9 * k / 20]])
        y0 = Math.min(y0, top + surf(side * (dx - px), z + off + pz) * steep - 1.21 * (px + 0.5) / 0.95);
      at(B, kind, cx + side * dx, y0 - 0.06, cz + z, side > 0 ? Math.PI : 0);
    };
    // by hand: R.chimneys = [{ side: 'left' | 'right', at: along the ridge from the roof's middle, kind: 1 | 2 }]
    for (const c of R.chimneys || []) chimney(c.side === 'left' ? -1 : 1, c.at || 0, c.kind === 2 ? 'Prop_Chimney2' : 'Prop_Chimney');
    if (R.chimney) {                                                       // by the dice: on the side of the ridge clear of the dormers, or moved along it
      let side = R.chimney === 'left' ? -1 : R.chimney === 'right' ? 1 : (r() < 0.5 ? 1 : -1), z = R.chimneyAt ?? (r() - 0.5) * (L - 3);
      const kind = r() < 0.5 ? 'Prop_Chimney' : 'Prop_Chimney2';
      const clash = (sd, zz) => (R.dormers || []).some(([d0, along]) => d0 === sd && Math.abs(along - zz) < 1.9);
      if (clash(side, z) && typeof R.chimney !== 'string' && !clash(-side, z)) side = -side;
      else if (clash(side, z)) for (const zz of [z + 2, z - 2, (L - 3) / 2, -(L - 3) / 2, 0]) if (Math.abs(zz) <= (L - 2) / 2 && !clash(side, zz)) { z = zz; break; }
      chimney(side, z, kind);
    }
    // ivy on the roof: the kit's three vines that lie on a slope (of 45 degrees: tilted here to this roof's), two of them with a
    // part that hangs over the eave (5, 6), one a patch up the slope (9). [side, along the ridge, which]
    for (const [sd, along, kind] of R.ivy || []) {
      const [k0, e0] = CREST[W] || CREST[6], slope = k0 * steep, up = kind === 9 ? 1.5 : 0;
      at(B, `Prop_Vine${kind}`, cx + sd * (S.out - 0.03 - up), top + e0 * steep + 0.07 + up * slope, cz + along, sd > 0 ? D90 : -D90, 1, 1, 1, ctx.paint, Math.atan(slope) - Math.PI / 4);
    }
    for (const dm of R.dormers || []) {                                    // [side (+1 right, -1 left), along]
      const [side, along] = dm, dx = W === 4 ? 0.35 : W * 0.2;
      at(B, 'Roof_Dormer_RoundTile', cx + side * dx, roofY(dx + 1.9) - 0.15, cz + along, side > 0 ? 0 : Math.PI);
    }
  } else if (R.kind === 'half') {                                          // a catslide: one slope of a roof, its ridge along the wall behind
    const span = R.span || 4, name = `Roof_RoundTiles_${span}x${W}`, b = ctx.shape(name);
    if (b) {
      const mid = (b.min.z + b.max.z) / 2 > 1 ? (b.min.z + b.max.z) / 2 : 0;
      at(B, name, cx - mid, top, rect.z0, D90, 1, steep, 1);
      const endAgainst = u => { const [x, z] = world(u + Math.sign(u - cx) * 0.5, rect.z0 + 0.8); return inside(blocks, B, x, B.y + top + 0.8, z) === 'solid'; };
      if (!endAgainst(rect.x1)) at(B, `Roof_Front_Brick${span}_Half_L`, rect.x1, top, rect.z0, D90, 1, steep, 1);
      if (!endAgainst(rect.x0)) at(B, `Roof_Front_Brick${span}_Half_R`, rect.x0, top, rect.z0, -D90, 1, steep, 1);
    }
  } else if (R.kind === 'tower') {                                         // (the stone cap at its tip the colour of its tiles)
    const k = W / 4;
    at(B, 'Roof_Tower_RoundTiles', cx, top, cz, 0, k, steep * (R.tall || 1), k, ctx.paint ? { ...ctx.paint, cap: true } : undefined);
  } else if (R.kind === 'lean') {                                          // boards from the back (high, against a wall) down to the front
    const count = Math.round(W / 2), deep = (L + 0.3) / 1.5;
    for (let k = 0; k < count; k++) {
      const u = rect.x0 + 1 + 2 * k, name = count === 1 ? 'Roof_Wooden_2x1' : k === 0 ? 'Roof_Wooden_2x1_L' : k === count - 1 ? 'Roof_Wooden_2x1_R' : 'Roof_Wooden_2x1_Center';
      at(B, name, u, top - 0.05, rect.z0, 0, 1, (R.rise || 1.2), deep);
    }
  } else if (R.kind === 'small') {                                         // a gable two metres across
    at(B, 'Roof_2x4_RoundTile', cx, top, cz, 0, 1, steep, L / 4 * (L < 4 ? 1.1 : 1));
    for (const [v, yaw] of [[rect.z1, 0], [rect.z0, Math.PI]]) if (!against(v)) at(B, 'Roof_Front_Brick2', cx, top, v, yaw, 1, steep, 1);
  } else if (R.kind === 'terrace') {                                       // no roof: a floor and a rail round it, the corner rails at its corners
    for (let u = rect.x0 + 1; u < rect.x1; u += 2) for (let v = rect.z0 + 1; v < rect.z1; v += 2) at(B, R.floor || 'Floor_RedBrick', u, top + 0.13, v, 0);
    const rail = R.rail === 'simple' ? 'Balcony_Simple_Straight' : 'Balcony_Cross_Straight', corner = R.rail === 'simple' ? 'Balcony_Simple_Corner' : 'Balcony_Cross_Corner';
    const shown = (side, k) => { const S = SIDE[side], [u, v] = S.at(rect, 2 * k + 1), [px, pz] = world(u + S.n[0] * 0.5, v + S.n[1] * 0.5); return inside(blocks, B, px, B.y + top + 1, pz) !== 'solid'; };
    for (const side of SIDES) {
      const S = SIDE[side], count = Math.round(S.len(rect) / 2), t = tanOf(S), [nx, nz] = S.n, nxt = NEXT[side];
      const lastOk = shown(side, count - 1), nextOk = shown(nxt, 0), prevCorner = shown(Object.keys(NEXT).find(k => NEXT[k] === side), Math.round(SIDE[Object.keys(NEXT).find(k => NEXT[k] === side)].len(rect) / 2) - 1);
      for (let k = 0; k < count; k++) {
        const atEnd = k === count - 1, atStart = k === 0;
        if (!shown(side, k) || (atEnd && nextOk) || (atStart && prevCorner)) continue;
        const [u, v] = S.at(rect, 2 * k + 1);
        at(B, rail, u - nx, top + 0.1, v - nz, S.yaw);
      }
      if (lastOk && nextOk) { const [cu, cv] = S.at(rect, S.len(rect)); at(B, corner, cu - nx - t[0] * 1.1, top + 0.1, cv - nz - t[1] * 1.1, S.yaw); }
    }
  }
}

// a balcony along a storey's side: a board floor a metre deep, its edge beam, a rail, brackets under it; with wrap, it goes
// on round the corner at the side's right end (the kit's corner rail) a metre along the next side
function balcony(B, ctx, r, bal) {
  const { at } = ctx, S = SIDE[bal.side], rect = B.rects[bal.s], y = 3 * bal.s, simple = bal.rail === 'simple';
  const rail = simple ? 'Balcony_Simple_Straight' : 'Balcony_Cross_Straight', corner = simple ? 'Balcony_Simple_Corner' : 'Balcony_Cross_Corner';
  const len = S.len(rect), [nx, nz] = S.n, t = tanOf(S), wrap = !!bal.wrap;
  const P = (u, out) => { const [a, b] = S.at(rect, u); return [a + nx * out, b + nz * out]; };
  const u0 = 2 * bal.from, u1 = wrap ? len : 2 * bal.to + 2;
  ctx.claim(B, ...P(u0 - 0.1, 0), ...P(u1 + (wrap ? 1.2 : 0.1), 1.2), B.y + y - 0.8, B.y + y + 1.3);
  if (wrap) { const N0 = SIDE[NEXT[bal.side]], q0 = N0.at(rect, 0), q1 = N0.at(rect, 1.2); ctx.claim(B, q0[0], q0[1], q1[0] + N0.n[0] * 1.2, q1[1] + N0.n[1] * 1.2, B.y + y - 0.8, B.y + y + 1.3); }
  for (let u = u0; u < u1 - 0.01; u += 2) {
    at(B, 'Floor_WoodDark_Half3', ...P(u + 1, 1).flatMap((q, i) => i ? [q] : [q, y + 0.02]), S.yaw);
    at(B, 'HoleCover_Straight', ...P(u + 1, 2).flatMap((q, i) => i ? [q] : [q, y + 0.02]), S.yaw);
    for (const du of [0.3, 1.7]) at(B, 'Roof_Support2', ...P(u + du, 0).flatMap((q, i) => i ? [q] : [q, y]), S.yaw);
  }
  const railEnd = wrap ? len - 1 : u1;
  for (let u = u0; u < railEnd - 0.01; u += 2) { const piece = Math.min(2, railEnd - u); at(B, rail, ...P(u + piece / 2, 0).flatMap((q, i) => i ? [q] : [q, y]), S.yaw, piece / 2, 1, 1); }
  const [lx, lz] = P(u0, 0.5);
  at(B, rail, lx + t[0], y, lz + t[1], S.yaw - D90, 0.5, 1, 1);         // the left end: a rail a metre long from the wall to the front
  if (!wrap) { const [ex, ez] = P(u1, 0.5); at(B, rail, ex - t[0], y, ez - t[1], S.yaw + D90, 0.5, 1, 1); return; }
  // round the corner: the corner rail, the corner's floor, a metre along the next side and the rail across its end
  const N = SIDE[NEXT[bal.side]], tn = tanOf(N), [cx, cz] = S.at(rect, len);
  const Q = (u, out) => { const [a, b] = N.at(rect, u); return [a + N.n[0] * out, b + N.n[1] * out]; };
  at(B, corner, cx, y, cz, S.yaw);
  at(B, 'Floor_WoodDark', ...P(len + 0.55, 0.5).flatMap((q, i) => i ? [q] : [q, y + 0.02]), S.yaw, 0.55, 1, 0.5);
  at(B, 'Floor_WoodDark_Half3', ...Q(0.55, 1).flatMap((q, i) => i ? [q] : [q, y + 0.02]), N.yaw, 0.55, 1, 1);
  at(B, 'HoleCover_90Half', ...P(len, 0).flatMap((q, i) => i ? [q] : [q, y + 0.02]), S.yaw - D90);
  at(B, 'HoleCover_StraightHalf', ...Q(0.55, 2).flatMap((q, i) => i ? [q] : [q, y + 0.02]), N.yaw);
  at(B, 'Roof_Support2', ...Q(0.6, 0).flatMap((q, i) => i ? [q] : [q, y]), N.yaw);
  const [qx, qz] = Q(1.1, 0.5);
  at(B, rail, qx - tn[0], y, qz - tn[1], N.yaw + D90, 0.5, 1, 1);
}

// outside stairs up to a door a storey up (a door is put there): of wood (the kit's inside stairs, with their rails, and a
// landing on posts before the door), or of stone (flights a metre high each, on their side walls, and a landing on a pier)
// the stretch of a block's ground-storey wall its outside stair runs along: { side, u0, u1 } (along the side, from its left end)
function stairSpan(B) {
  const st = B.stair; if (!st) return null;
  const S = SIDE[st.side], len = S.len(B.rects[0]), ud = 2 * st.k + 1, dir = st.dir || (ud > len / 2 ? -1 : 1);
  const far = st.kind === 'wood' ? ud + dir * (1 + (st.long && Math.abs(ud - (dir < 0 ? 0 : len)) >= 6.3 ? 5.8 : 4.35) + 0.6) : ud + dir * (2 * (3 + Math.round(B.y || 0) + (st.mid ? 1 : 0)) + 1);
  const near = ud - dir * 1.1;
  return { side: st.side, u0: Math.min(near, far), u1: Math.max(near, far), len };
}
// a stair is built only where it fits along its wall (a stone one; a wooden one's foot may stand a metre past the corner): one
// too long loses its landing half way, then is not built at all (it ran on past the house's corner, metres of it)
function fitStair(B) {
  const over = () => { const sp = stairSpan(B), slack = B.stair.kind === 'wood' ? 1.0 : 0.45; return sp.u0 < -slack || sp.u1 > sp.len + slack; };
  if (B.stair && over() && B.stair.mid) B.stair.mid = false;
  if (B.stair && over()) delete B.stair;
}
function stair(B, ctx, r, st) {
  const { at, solid } = ctx, S = SIDE[st.side], rect = B.rects[0], len = S.len(rect), [nx, nz] = S.n, t = tanOf(S);
  const ud = 2 * st.k + 1, dir = st.dir || (ud > len / 2 ? -1 : 1);       // it climbs toward the door from the side with room
  const P = (u, out) => { const [a, b] = S.at(rect, u); return [a + nx * out, b + nz * out]; };
  { const sp = stairSpan(B); ctx.claim(B, ...P(sp.u0, 0), ...P(sp.u1, 2.2)); }
  const climb = S.yaw + (dir < 0 ? -D90 : D90);                            // the stair's own -z: toward +t (dir -1: it comes from the -t side)
  if (st.kind === 'wood') {
    const long = st.long && Math.abs(ud - (dir < 0 ? 0 : len)) >= 6.3, run = long ? 5.8 : 4.35;
    const ub = ud + dir * (1 + run), [bx, bz] = P(ub, 1.0);
    const name = long ? 'Stair_Interior_SolidExtended' : st.open ? 'Stair_Interior_Simple' : 'Stair_Interior_Solid';
    at(B, name, bx, 0, bz, climb);
    if (!long) at(B, 'Stair_Interior_Rails', bx, 0, bz, climb);
    // the landing before the door: boards on two posts, a rail round its open sides, a beam where the stair comes up
    at(B, 'Floor_WoodDark', ...P(ud, 1).flatMap((q, i) => i ? [q] : [q, 3.03]), S.yaw);
    at(B, 'HoleCover_90Stairs', ...P(ud, 1).flatMap((q, i) => i ? [q] : [q, 3.03]), S.yaw + (dir < 0 ? Math.PI : 0));
    at(B, 'HoleCover_90Angle', ...P(ud, 1).flatMap((q, i) => i ? [q] : [q, 3.03]), S.yaw + (dir < 0 ? -D90 : Math.PI));
    for (const e of [-0.88, 0.88]) { const [px, pz] = P(ud + e, 1.88); at(B, 'Corner_Exterior_Wood', px, 0, pz, S.yaw, 1, 1.0, 1); solid(B, px, pz, 0.25); }
    at(B, 'Balcony_Cross_Straight', ...P(ud, 0).flatMap((q, i) => i ? [q] : [q, 3.03]), S.yaw, 1, 1, 2);
    const [ex, ez] = P(ud - dir * 1, 1); at(B, 'Balcony_Cross_Straight', ex + dir * t[0] * 0, 3.03, ez, S.yaw + (dir < 0 ? D90 : -D90));
    for (let q = 0; q <= run; q += 1.4) solid(B, ...P(ub - dir * q, 1.0), 0.75);
  } else {
    // of stone: a flight to each metre, from the ground up to the storey's floor, along the wall and away from the door. The kit's
    // landings have a finished face on some sides and are open on the others, where a flight or the house's wall joins them:
    const flights = 3 + Math.round(B.y), base = -Math.round(B.y), out = [nx, nz], to = [t[0] * dir, t[1] * dir], single = yawTo('-x', out);
    // the landing before the door: the one with two finished sides that meet, turned so that its open sides are the wall and the
    // stair; the courses under it turned to stand under its finished sides
    const [lx, lz] = P(ud, 1), clean = st.landing ? st.landing === '45Clean' : r() < 0.5;
    at(B, clean ? 'Stairs_Exterior_Platform45Clean' : 'Stairs_Exterior_Platform45', lx, 2, lz, yawTo2('+x', '+z', to, [-nx, -nz]));
    for (let q = base; q < 2; q++) at(B, 'Stairs_Exterior_Sides45', lx, q, lz, yawTo2('+x', '-z', out, [-to[0], -to[1]]));
    solid(B, lx, lz, 1.2);
    for (let i = 0, slot = 0; i < flights; i++, slot++) {
      if (st.mid && i === 1) {                                             // a landing half way: the one with one finished side, outward
        const [mx, mz] = P(ud + dir * (2 + 2 * slot), 1);
        at(B, 'Stairs_Exterior_SidePlatform', mx, 1, mz, single);
        for (let q = base; q < 1; q++) at(B, 'Stairs_Exterior_SingleSide', mx, q, mz, single);
        solid(B, mx, mz, 1.1); slot++;
      }
      const [fx, fz] = P(ud + dir * (2 + 2 * slot), 1), y = 2 - i;
      // (a flight's first step is the one that reaches down onto the flight or the landing below it; the lowest flight, on the
      // ground, is the kit's flight without it. The other way round a gap stood open between two flights)
      at(B, i < flights - 1 ? 'Stairs_Exterior_Straight' : 'Stairs_Exterior_NoFirstStep', fx, y, fz, climb);
      for (let q = base; q < y; q++) at(B, 'Stairs_Exterior_SingleSide', fx, q, fz, single);      // under it: the wall of its outer side
      solid(B, fx, fz, 1.1);
    }
  }
}

// a stone plinth a metre high under the ground storey, and steps up to its door (wide ones for a grand door)
function plinth(B, ctx, r, doorAt) {
  const { at, solid } = ctx, rect = B.wallRect || B.rects[0], high = Math.max(1, Math.round(B.y));      // (a metre, or two: a high plinth)
  for (const side of SIDES) {
    const S = SIDE[side], count = Math.round(S.len(rect) / 2), segs = B[`segs0${side}`] || [], [nx, nz] = S.n;
    for (let k = 0; k < count; k++) {
      if (segs[k] === 'hidden') continue;
      const [u, v] = S.at(rect, 2 * k + 1);
      if (doorAt && doorAt.side === side && doorAt.k === k) {             // the steps: one flight, or a wide one of three parts
        const wide = B.plinth === 'wide' && high === 1 && k > 0 && k < count - 1, P = du => { const [a, b] = S.at(rect, 2 * k + 1 + du); return [a + nx, b + nz]; };
        const Q = (du, out) => { const [a, b] = S.at(rect, 2 * k + 1 + du); return [a + nx * out, b + nz * out]; }, sd = k > 0 ? -1 : 1;
        if (B.plinth === 'stoop' && high === 1 && B.stoop === 'front') ctx.claim(B, ...Q(-1.2, 0), ...Q(1.2, 4.3));
        else if (B.plinth === 'stoop' && high === 1) ctx.claim(B, ...Q(sd < 0 ? -3.2 : -1.2, 0), ...Q(sd < 0 ? 1.2 : 3.2, 2.2));
        else ctx.claim(B, ...Q(wide ? -3.2 : -1.2, 0), ...Q(wide ? 3.2 : 1.2, 0.3 + 2 * high));
        if (B.plinth === 'stoop' && high === 1 && B.stoop === 'front') {       // a landing before the door (finished left and right), its flight straight out
          const [fx, fz] = Q(0, 3);
          at(B, 'Stairs_Exterior_Platform', u + nx, -1, v + nz, S.yaw);
          at(B, 'Stairs_Exterior_Straight', fx, -1, fz, S.yaw);
          solid(B, u + nx, v + nz, 1.0); solid(B, fx, fz, 1.0);
          continue;
        }
        if (B.plinth === 'stoop' && high === 1) {                            // a landing before the door, its flight along the wall: open to the wall and the flight
          const dir = k > 0 ? -1 : 1, [fx, fz] = P(dir * 2), tt = tanOf(S), clean = r() < 0.5;
          at(B, clean ? 'Stairs_Exterior_Platform45Clean' : 'Stairs_Exterior_Platform45', u + nx, -1, v + nz, yawTo2('+x', '+z', [tt[0] * dir, tt[1] * dir], [-nx, -nz]));
          at(B, 'Stairs_Exterior_Straight', fx, -1, fz, S.yaw + (dir < 0 ? -D90 : D90));
          solid(B, u + nx, v + nz, 1.0); solid(B, fx, fz, 1.0);
          continue;
        }
        if (wide) { const [ax, az] = P(-2), [cx2, cz2] = P(0), [bx, bz] = P(2); at(B, 'Stairs_Exterior_Straight_L', ax, -B.y, az, S.yaw); at(B, 'Stairs_Exterior_Straight_Center', cx2, -B.y, cz2, S.yaw); at(B, 'Stairs_Exterior_Straight_R', bx, -B.y, bz, S.yaw); }
        else for (let j = 0; j < high; j++) {                             // a flight to each metre, straight out from the door; under a raised one its two side walls
          const [fx, fz] = Q(0, 1 + 2 * j);
          at(B, 'Stairs_Exterior_Straight', fx, -1 - j, fz, S.yaw);
          for (let q = -high; q < -1 - j; q++) at(B, 'Stairs_Exterior_Sides', fx, q, fz, S.yaw);
          solid(B, fx, fz, 1.0);
        }
        if (wide) solid(B, u + nx, v + nz, 1.8);
        if (!wide) continue;
      }
      for (let q = -high; q < 0; q++) at(B, 'Stairs_Exterior_SingleSideThick', u, q, v, S.yaw + D90);
    }
  }
}

// how high a design stands, the ground it takes and what stands out of it (its own frame): for colliders, shadows, the
// place editor's ring
function measureDesign(design, shape) {
  const blocks = design.blocks;
  const solids = assemble(design, new THREE.Matrix4(), () => {}, shape);
  let top = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const real = blocks.some(B => !B.ghost), walls = [];
  for (const B of blocks) {
    if (B.ghost && real) continue;
    if (B.ghost) { B.rects = rectsOf(B); top = Math.max(top, 3); }
    else top = Math.max(top, topOf(B) + (B.roofShape ? B.roofShape.ridge : 0));
    const r = B.rects[0];
    const c = [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].map(([u, v]) => fromBlock(B, u, v));
    for (const [x, z] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    // (walls: the ground of each block with walls, [x0, z0, x1, z1, its walls' top]: what she cannot walk through; a veranda's floor and an open shelter are not)
    const w = B.wallRect || r, cw = [[w.x0, w.z0], [w.x1, w.z1]].map(([u, v]) => fromBlock(B, u, v));
    if (!B.ghost && !B.open) walls.push([Math.min(cw[0][0], cw[1][0]), Math.min(cw[0][1], cw[1][1]), Math.max(cw[0][0], cw[1][0]), Math.max(cw[0][1], cw[1][1]), topOf(B)].map(v => +v.toFixed(2)));
  }
  return { top, x0, x1, z0, z1, solids, walls };
}

// ==================================================================== what a house becomes
// a few helpers for the designs below
const ST = (mat, jet = null, style = 'cove', more = {}) => ({ mat, jet: { f: 0, b: 0, r: 0, l: 0, ...(jet || {}) }, style, ...more });
const lerp = (a, b, t) => a + (b - a) * t;
// the house's own sides (front, back, left, right) to a block's turned by yaw
const SIDE_OF = { front: 'f', back: 'b', left: 'l', right: 'r' };
function localSide(side, yaw) {                                           // the house's side as the block, turned yaw, calls it
  const order = ['f', 'l', 'b', 'r'], i = order.indexOf(side), q = Math.round(((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / D90) % 4;
  return order[(i + q) % 4];
}

// small things round a house, in the house's frame: each returns a function the assembly calls with its tools
const yard = fn => Object.assign(fn, { yard: true });                    // a thing of the yard: built after the house, where it finds room
// 2 m of low stone wall under a coping of round tiles, centred at (x, z), running along yaw
const lowWall = (at, x, z, yaw) => {
  const t = [Math.cos(yaw), -Math.sin(yaw)];
  at(null, 'Stairs_Exterior_SingleSideThick', x, 0, z, yaw + D90);
  at(null, 'Roof_Modular_RoundTiles', x + t[0] * 0.07, 0.98, z + t[1] * 0.07, yaw + D90, 0.95, 0.7, 0.885);      // (the piece is 2.25 m, from -1.21 to 1.05 along it)
};
// a stone pier for a low wall's end, its corner or a gate's side: the kit's capped chimney, small (half a metre square, 1.5 m high;
// tall: two, one on the other, 3 m, the lower one's cap a band at the wall's height)
const pier = (at, solid, x, z, tall = false) => {
  at(null, 'Prop_Chimney', x + 0.013, 0, z, 0, 0.5, 0.47, 0.5);
  if (tall) at(null, 'Prop_Chimney', x + 0.013, 1.49, z, 0, 0.5, 0.47, 0.5);
  solid(null, x, z, 0.3);
};
const X = {
  // a door's canopy: a little tiled gable over a door in the wall at (x, z) facing yaw
  canopy: (x, z, yaw, long = false) => ({ at }) => { at(null, long ? 'Roof_RoundTile_2x1_Long' : 'Roof_RoundTile_2x1', x, long ? 3.1 : 2.75, z, yaw); },
  // a porch of boards on two posts before a door
  porch: (x, z, yaw, wide = 2) => ({ at, solid, claim }) => {
    const t = [Math.cos(yaw), -Math.sin(yaw)], n = [Math.sin(yaw), Math.cos(yaw)], count = Math.round(wide / 2);
    for (let k = 0; k < count; k++) {
      const off = -wide / 2 + 1 + 2 * k, name = count === 1 ? 'Roof_Wooden_2x1' : k === 0 ? 'Roof_Wooden_2x1_L' : k === count - 1 ? 'Roof_Wooden_2x1_R' : 'Roof_Wooden_2x1_Center';
      at(null, name, x + t[0] * off, 2.55, z + t[1] * off, yaw, 1, 1.0, 1.25);
    }
    for (const e of [-1, 1]) {
      const px = x + t[0] * e * (wide / 2 - 0.12) + n[0] * 1.75, pz = z + t[1] * e * (wide / 2 - 0.12) + n[1] * 1.75;
      at(null, 'Corner_Exterior_Wood', px, -0.4, pz, yaw, 0.8, 0.98, 0.8); solid(null, px, pz, 0.22);
    }
    claim(null, x - t[0] * (wide / 2 + 0.2), z - t[1] * (wide / 2 + 0.2), x + t[0] * (wide / 2 + 0.2) + n[0] * 2, z + t[1] * (wide / 2 + 0.2) + n[1] * 2);
  },
  // a shed of boards on four posts: 'pent' (two slopes, 3 m deep) or 'wide' (two slopes and a flat middle, 5 m deep), len m long
  shed: (x, z, yaw, len = 4, kind = 'pent', h = 2.35) => yard(({ at, solid, room }) => {
    const t = [Math.cos(yaw), -Math.sin(yaw)], n = [Math.sin(yaw), Math.cos(yaw)], bays = Math.max(1, Math.round(len / 2)), half = kind === 'wide' ? 1 : 0;
    const P = (u, v) => [x + t[0] * u + n[0] * v, z + t[1] * u + n[1] * v];
    if (!room(null, ...P(-bays - 0.25, -1.55 - half), ...P(bays + 0.25, 1.55 + half), h + 1.2)) return false;
    for (let k = 0; k < bays; k++) {
      const u = -bays + 1 + 2 * k, first = k === 0, last = k === bays - 1;
      const front = bays === 1 ? 'Roof_Wooden_2x1' : first ? 'Roof_Wooden_2x1_L' : last ? 'Roof_Wooden_2x1_R' : 'Roof_Wooden_2x1_Center';
      const back = bays === 1 ? 'Roof_Wooden_2x1' : first ? 'Roof_Wooden_2x1_R' : last ? 'Roof_Wooden_2x1_L' : null;
      at(null, front, ...P(u, half).flatMap((q, i) => i ? [q] : [q, h]), yaw);
      if (back) at(null, back, ...P(u, -half).flatMap((q, i) => i ? [q] : [q, h]), yaw + Math.PI);
      else at(null, 'Roof_Wooden_2x1_Center_Mirror', ...P(u, -half).flatMap((q, i) => i ? [q] : [q, h]), yaw);
      if (half) at(null, 'Roof_Wooden_2x1_Middle', ...P(u, 0).flatMap((q, i) => i ? [q] : [q, h]), yaw);
    }
    if (!half) at(null, 'Roof_Log', ...P(0, 0).flatMap((q, i) => i ? [q] : [q, h - 0.08]), yaw + D90, 0.26, 0.26, (bays * 2 + 0.26) / 10.7);      // the kit's ridge log, slim, along the boards' ridge
    const depth = 1.3 + half;
    for (let k = 0; k < bays; k++) for (const e of [0, 1]) at(null, e ? 'Floor_WoodDark_Half2' : 'Floor_WoodDark_Half1', ...P(-bays + 1 + 2 * k, 0).flatMap((q, i) => i ? [q] : [q, 0.04]), yaw);
    for (const e of [-1, 1]) for (const f of [-1, 1]) { const [px, pz] = P(e * (bays - 0.15), f * depth); at(null, 'Corner_Exterior_Wood', px, 0, pz, yaw, 0.85, (h - 0.12) / 3, 0.85); solid(null, px, pz, 0.2); }
    return true;
  }),
  // a porch of boards round a front corner of a block: along its front from fromU metres in, round the corner (the kit's corner
  // board, its post under it), `along` metres down the side; mirror: round the left corner instead of the right. For blocks of two
  // storeys or more: under one storey's eaves the side's boards came up through the tiles
  wrapPorch: (B, fromU = 0, along = 4, mirror = false) => ({ at, solid, claim }) => {
    const sg = mirror ? -1 : 1, xc = B.x + sg * B.w / 2, xf = B.x - sg * (B.w / 2 - fromU), z1 = B.z + B.l / 2, h = 2.5, deep = 1.25;
    const nf = Math.round(Math.abs(xc - xf) / 2), ns = Math.round(along / 2);
    for (let k = 0; k < nf; k++) at(null, k === 0 ? (mirror ? 'Roof_Wooden_2x1_R' : 'Roof_Wooden_2x1_L') : 'Roof_Wooden_2x1_Center', xf + sg * (1 + 2 * k), h, z1, 0, 1, 1, deep);
    at(null, 'Roof_Wooden_2x1_Corner', xc, h, z1, mirror ? Math.PI : -D90, deep, 1, deep);
    for (let k = 0; k < ns; k++) at(null, k === ns - 1 ? (mirror ? 'Roof_Wooden_2x1_L' : 'Roof_Wooden_2x1_R') : 'Roof_Wooden_2x1_Center', xc, h, z1 - 1 - 2 * k, mirror ? -D90 : D90, 1, 1, deep);
    const posts = [[xf + sg * 0.15, z1 + 1.75], [xc + sg * 0.85, z1 + 0.85], [xc + sg * 1.75, z1 - along + 0.15]];
    if (nf >= 2) posts.push([(xf + xc) / 2 + sg * 0.5, z1 + 1.75]);
    for (const [px, pz] of posts) { at(null, 'Corner_Exterior_Wood', px, -0.45, pz, 0, 0.8, 0.98, 0.8); solid(null, px, pz, 0.22); }
    claim(null, Math.min(xf, xc + sg * 2), z1, Math.max(xf, xc + sg * 2), z1 + 2); claim(null, Math.min(xc, xc + sg * 2), z1 - along, Math.max(xc, xc + sg * 2), z1 + 2);
  },
  // a vine hanging down a wall from (x, y, z), the wall facing yaw; not where a porch, a stair, steps or a door's way stand before
  // the wall, nor where a lower roof leans on it (it hung through their boards and tiles)
  vine: (x, y, z, yaw, k = 1) => ({ at, free, inside }) => {
    const px = x + Math.sin(yaw) * 0.6, pz = z + Math.cos(yaw) * 0.6;
    if (!free(null, px - 0.25, pz - 0.25, px + 0.25, pz + 0.25, y + 0.5, y - 2.2) || !free(null, px - 0.25, pz - 0.25, px + 0.25, pz + 0.25, 1.5) || inside(px, y - 0.4, pz) || inside(px, y - 1.4, pz)) return;
    at(null, VINES[k % VINES.length], x, y, z, yaw);
  },
  // a thing at (x, y, z); out: one of the yard, left out where the house's things stand
  thing: (name, x, y, z, yaw = 0, s = 1, out = false) => {
    const fn = ({ at, solid, room }) => {
      const e = name === 'Prop_Wagon' ? 1.35 : 0.5 * s;
      if (out && !room(null, x - e, z - e, x + e, z + e, name === 'Prop_Wagon' ? 1.6 : y + 1.1 * s)) return false;
      at(null, name, x, y, z, yaw, s, s, s); if (y < 0.5 && !/Brick\d/.test(name)) solid(null, x, z, name === 'Prop_Wagon' ? 0.9 : 0.5 * s);
      return true;
    };
    return out ? yard(fn) : fn;
  },
  // the first of these things of the yard that finds room
  either: (...fns) => yard(ctx => fns.some(fn => fn(ctx) !== false)),
  // a low wall of stone with a tiled coping, len m from (x, z) along yaw; ends: a pier at its start ('a'), its end ('b') or both ('ab')
  gardenWall: (x, z, yaw, len, ends = '') => yard(({ at, solid, free, claim }) => {
    const t = [Math.cos(yaw), -Math.sin(yaw)], ex = Math.abs(t[0]) + Math.abs(t[1]) * 0.3, ez = Math.abs(t[1]) + Math.abs(t[0]) * 0.3, n = Math.round(len / 2);
    const spot = k => [x + t[0] * (1 + 2 * k), z + t[1] * (1 + 2 * k)];
    for (let k = 0; k < n; k++) { const [px, pz] = spot(k); if (!free(null, px - ex, pz - ez, px + ex, pz + ez, 1.5)) return false; }      // all of it or none
    for (let k = 0; k < n; k++) { const [px, pz] = spot(k); claim(null, px - ex, pz - ez, px + ex, pz + ez); lowWall(at, px, pz, yaw); solid(null, px, pz, 0.6); }
    if (ends.includes('a')) pier(at, solid, x - t[0] * 0.05, z - t[1] * 0.05);
    if (ends.includes('b')) pier(at, solid, x + t[0] * (len + 0.05), z + t[1] * (len + 0.05));
    return true;
  }),
  // a fence round a yard against a block's side: out from the wall at u0 along the side, across, and back in at u1 (a U), a post at
  // every 2 m and at each corner; gap: [[leg, i], ...] pieces left out for a way in (leg 0 out, 1 across, 2 back in). All of it or
  // none: it is built only if every piece of it finds room, so no loose length of fence is left standing by a stair or a shed
  yardFence: (B, side, depth = 4, { u0 = 0, u1 = null, gap = [] } = {}) => yard(({ at, solid, free, claim }) => {
    const S = SIDE[side], rect = B.wallRect || B.rects[0], t = tanOf(S), [nx, nz] = S.n, e = u1 === null ? S.len(rect) : u1, off = B.plinth ? 0.38 : 0.16;
    const P = (u, out) => { const [a, b] = S.at(rect, u); return [a + nx * out, b + nz * out]; };
    const legs = [[P(u0, off), [nx, nz], depth / 2], [P(u0, depth + off), t, (e - u0) / 2], [P(e, depth + off), [-nx, -nz], depth / 2]];
    const list = [];
    legs.forEach(([p0, d, count], leg) => { for (let i = 0; i < Math.round(count); i++) list.push({ x: p0[0] + d[0] * (1 + 2 * i), z: p0[1] + d[1] * (1 + 2 * i), d, skip: gap.some(g => g[0] === leg && g[1] === i) }); });
    const box = q => { const ex = Math.abs(q.d[0]) + Math.abs(q.d[1]) * 0.2, ez = Math.abs(q.d[1]) + Math.abs(q.d[0]) * 0.2; return [q.x - ex, q.z - ez, q.x + ex, q.z + ez]; };
    if (list.some(q => !q.skip && !free(B, ...box(q), 1.4))) return false;
    let post = true, run = 0;
    for (const q of list) {
      if (q.skip) { post = true; continue; }
      claim(B, ...box(q));
      // (Fence_Single has a post at each end, the Extensions one at their far end: so every joint and corner has one post)
      at(B, post ? 'Prop_WoodenFence_Single' : run % 2 ? 'Prop_WoodenFence_Extension1' : 'Prop_WoodenFence_Extension2', q.x, -B.y, q.z, Math.atan2(-q.d[1], q.d[0]));
      solid(B, q.x, q.z, 0.35); post = false; run++;
    }
    return true;
  }),
  // a low wall round a forecourt before a house's front (the house's frame: its front along z = z0 from x0 to x1): out from the
  // front's two ends, `depth` metres, and across; an iron gate in the 2 m of it numbered gateK, between tall piers; a pier at
  // each corner. Joined to the house at both ends (a wall across a garden that ends in the open at both ends is joined to nothing)
  court: (x0, x1, z0, depth = 4, gateK = 0, ornate = true) => yard(({ at, solid, free, claim }) => {
    const z1 = z0 + depth, n = Math.round((x1 - x0) / 2), m = Math.round(depth / 2);
    const strips = [[x0 - 0.3, z0 + 0.35, x0 + 0.3, z1 + 0.3], [x0 - 0.3, z1 - 0.3, x1 + 0.3, z1 + 0.3], [x1 - 0.3, z0 + 0.35, x1 + 0.3, z1 + 0.3]];
    if (strips.some(b => !free(null, ...b, 1.5))) return false;
    strips.forEach(b => claim(null, ...b));
    for (let k = 0; k < m; k++) for (const x of [x0, x1]) { lowWall(at, x, z0 + 1 + 2 * k, D90); solid(null, x, z0 + 1 + 2 * k, 0.6); }
    for (let k = 0; k < n; k++) {
      const x = x0 + 1 + 2 * k;
      if (k === gateK) at(null, ornate ? 'Prop_MetalFence_Ornament' : 'Prop_MetalFence_Simple', x, 0, z1, 0);
      else { lowWall(at, x, z1, 0); solid(null, x, z1, 0.6); }
    }
    const tall = new Set([x0 + 2 * gateK, x0 + 2 * gateK + 2]);
    for (const x of new Set([x0, x1, ...tall])) pier(at, solid, x, z1, tall.has(x));
    return true;
  }),
  // a stone platform that stands free, `high` metres (1 or 2), steps up to its front (the kit's landing with three finished sides:
  // its open side is where the flight joins): a mounting block by an inn, a crier's platform by a market. At (x, z), its front yaw
  dais: (x, z, yaw, high = 1) => yard(({ at, solid, room }) => {
    const f = [Math.sin(yaw), Math.cos(yaw)], sx = Math.abs(f[0]), sz = Math.abs(f[1]), far = 1 + 2 * high;
    const x1 = x + f[0] * far, z1 = z + f[1] * far;
    // (it may stand against a wall at its back and its sides: its room is asked for a little inside its own faces)
    if (!room(null, Math.min(x - f[0] * 0.8, x1) - sz * 0.8, Math.min(z - f[1] * 0.8, z1) - sx * 0.8, Math.max(x - f[0] * 0.8, x1) + sz * 0.8, Math.max(z - f[1] * 0.8, z1) + sx * 0.8, high + 1.15)) return false;
    at(null, 'Stairs_Exterior_PlatformU', x, high - 1, z, yaw);
    for (let q = 0; q < high - 1; q++) at(null, 'Stairs_Exterior_SidesU', x, q, z, yaw);
    solid(null, x, z, 1.2);
    for (let i = 0; i < high; i++) {
      const fx = x + f[0] * (2 + 2 * i), fz = z + f[1] * (2 + 2 * i), y = high - 1 - i;
      at(null, i < high - 1 ? 'Stairs_Exterior_Straight' : 'Stairs_Exterior_NoFirstStep', fx, y, fz, yaw);
      for (let q = 0; q < y; q++) at(null, 'Stairs_Exterior_Sides', fx, q, fz, yaw);
      solid(null, fx, fz, 1.1);
    }
    return true;
  }),
  // a walk of flat stones along the foot of a block's walls on the sides asked (the kit's border stones, as they are made: 0.7 m
  // wide, laid against the wall), a corner stone where two of them meet; not under a plinth, a veranda's floor or an arcade
  apron: (B, sides) => ({ at }) => {
    if (B.plinth || B.y) return;
    const rect = B.wallRect || B.rects[0], laid = new Set();
    const open = side => !(B.veranda && B.veranda.side === side) && !(B.arches && B.arches.includes(side)) && !(B.storeys[1] && styleOf(B.storeys[1], side) === 'arcade' && (B.storeys[1].jet || {})[side]);
    for (const side of sides) {
      if (!open(side)) continue;
      const S = SIDE[side], segs = B[`segs0${side}`] || [];
      segs.forEach((what, k) => { if (what === 'hidden') return; const [u, v] = S.at(rect, 2 * k + 1); at(B, k % 2 ? 'Prop_ExteriorBorder_Straight2' : 'Prop_ExteriorBorder_Straight1', u, 0, v, S.yaw); });
      if (segs.length && segs.every(w => w !== 'hidden')) laid.add(side);
    }
    for (const side of SIDES) {                                         // the corners between two sides laid all along
      const nx = NEXT[side]; if (!laid.has(side) || !laid.has(nx)) continue;
      const [cxy] = CORNER[side], [cx, cz] = cxy(rect), sx = Math.sign(cx - (rect.x0 + rect.x1) / 2), sz = Math.sign(cz - (rect.z0 + rect.z1) / 2);
      at(B, 'Prop_ExteriorBorder_Corner', cx, 0, cz, sx > 0 ? (sz > 0 ? D90 : Math.PI) : (sz > 0 ? 0 : -D90));
    }
  },
  ceiling: (x0, z0, x1, z1, y = 3, stone = false) => ({ at }) => { for (let x = x0 + 1; x < x1; x += 2) for (let z = z0 + 1; z < z1; z += 2) at(null, stone ? 'Overhang_Roof_UnevenBricks' : 'Overhang_Roof_Plaster', x, y, z, 0); },
  bricks: (x, z, r) => { const d = [0, 1, 2, 3, 4].map(k => [x + (r() - 0.5) * 1.4, z + (r() - 0.5) * 0.9, r() * 6]); return yard(({ at, room }) => { if (!room(null, x - 0.8, z - 0.55, x + 0.8, z + 0.55, 0.4)) return false; d.forEach(([bx, bz, a], k) => at(null, `Prop_Brick${1 + (k % 4)}`, bx, 0.1, bz, a)); return true; }); },
  // a paved yard: stone flags on the ground
  paving: (x0, z0, x1, z1, kind = 'Floor_UnevenBrick') => ({ at }) => { for (let x = x0 + 1; x < x1; x += 2) for (let z = z0 + 1; z < z1; z += 2) at(null, kind, x, 0.03, z, 0); },
};
// the vines that hang flat down a wall (the kit's other three, Prop_Vine5, 6 and 9, lie on a roof's slope: flat on a wall half of
// each went through it, and came out of whatever stood behind)
const VINES = ['Prop_Vine1', 'Prop_Vine2', 'Prop_Vine4'];

// the designs: each takes the spec (the ground w by l, the door's side, ...) and a random source, and gives blocks and extras
function base(spec, r, palette = null) { return { paint: paintOf(r, spec.palette || palette), blocks: [], extras: [], seed: Math.floor(r() * 1e9) }; }
const doorLocal = (spec, yaw = 0) => localSide(SIDE_OF[spec.door || 'front'] || 'f', yaw);
const pick2 = (r, a) => a[Math.floor(r() * a.length)];
const SIDE_YAW = { f: 0, r: D90, b: Math.PI, l: -D90 };
const opt = (spec, key, roll) => (spec.opt && spec.opt[key] !== undefined ? spec.opt[key] : roll);      // a forced choice, or the dice's

const DESIGNS = {
  // a little storehouse: one room under a little gable
  store(spec, r) {
    const D = base(spec, r);
    const B = { x: 0, z: 0, w: 2, l: 2, storeys: [ST(r() < 0.4 ? 'stone' : 'plaster')], roof: { kind: 'small', steep: lerp(1.0, 1.3, r()) }, door: { side: doorLocal(spec), kind: pick2(r, ['flat', 'round']) } };
    D.blocks.push(B);
    D.extras.push(X.thing('Prop_Crate', 1.6, 0, 0.5, r() * 3, 0.8, true));
    vines(D, spec, B, r, 1);
    return D;
  },
  // a woodshed: boards on four posts, crates under it
  shed(spec, r) {
    const D = base(spec, r), len = Math.max(2, Math.min(6, spec.l || 4));
    D.blocks.push({ ghost: true, x: 0, z: 0, w: 2, l: len, yaw: D90, storeys: [ST('plaster')] });
    D.extras.push(X.shed(0, 0, 0, len, 'pent'), X.thing('Prop_Crate', -len / 2 + 0.8, 0, 0.3, r() * 3, 0.9), X.thing('Prop_Crate', -len / 2 + 0.85, 0.95, 0.35, r() * 3, 0.7), X.thing('Prop_Crate', len / 2 - 0.9, 0, -0.2, r() * 3, 0.8));
    return D;
  },
  // one storey under a steep roof: a porch, a canopy or a little entrance bay at its door, maybe a lean-to behind; shutters, vines
  cottage(spec, r) {
    const D = base(spec, r), w = Math.min(spec.w, 6), l = spec.l, steep = lerp(1.1, 1.5, r()), ds = doorLocal(spec);
    const bay = (ds === 'f' || ds === 'b') && l >= 6 && opt(spec, 'bay', r() < 0.35), lean = !bay && l >= 6 && opt(spec, 'lean', r() < 0.55), ml = bay || lean ? l - 2 : l;
    const shift = (bay ? -1 : lean ? 1 : 0) * (ds === 'b' ? -1 : 1);
    const main = { x: 0, z: shift, w, l: roofFits(w, ml) ? ml : 4, storeys: [ST(r() < 0.3 ? 'stone' : 'plaster', null, 'cove', { win: 0.75 })],
      roof: { kind: 'gable', steep, chimney: r() < 0.85, supports: r() < 0.5, gableWin: 0.5, dormers: steep > 1.3 && ml >= 6 ? [[r() < 0.5 ? 1 : -1, 0]] : [] },
      door: bay ? null : { side: ds, kind: pick2(r, ['round', 'flat']) }, win: { kinds: [pick2(r, ['wf', 'wr', 'th'])], shut: 0.75, closed: 0.2, hood: 0.3 } };
    D.blocks.push(main);
    if (bay) D.blocks.push({ x: (r() < 0.5 ? -1 : 1) * (w / 2 - 1), z: (ds === 'b' ? -1 : 1) * (l / 2 - 1), yaw: SIDE_YAW[ds], w: 2, l: 2, storeys: [ST(main.storeys[0].mat)], roof: { kind: 'small', steep: steep * 0.85 }, door: { side: 'f', kind: 'round' } });
    if (lean) D.blocks.push({ x: w === 6 ? -1 : 0, z: (ds === 'b' ? 1 : -1) * (l / 2 - 1), w: w - 2, l: 2, storeys: [ST(r() < 0.5 ? 'plaster' : 'stone', null, 'cove', { win: 0.3 })], roof: { kind: 'lean', rise: 0.9 }, yaw: ds === 'b' ? 0 : Math.PI, win: { kinds: ['th'], shut: 0.3 } });
    if (!bay) porchOrCanopy(D, spec, main, r);
    vines(D, spec, main, r, 2);
    ivy(spec, main, r, 0.3);
    if (spec.yard) {                                                       // a fenced yard at one side (the way in by the house's front), the other if that has no room
      // (at its right, its left or behind it, four or six metres deep; the way in at the end of it nearest the front, or in its far side)
      const roll = r(), side = roll < 0.4 ? 'r' : roll < 0.8 ? 'l' : 'b', deep = r() < 0.6 ? 4 : 6;
      const fenced = sd => X.yardFence(main, sd, deep, { gap: [sd === 'r' ? [0, 0] : sd === 'l' ? [2, deep / 2 - 1] : [1, 0]] });
      D.extras.push(X.either(fenced(side), fenced(side === 'r' ? 'l' : 'r'), fenced('b')), X.apron(main, [ds]));
    }
    return D;
  },
  // two or three storeys, the upper ones jutting out over the street, on coves or braces; a balcony (round a corner, some),
  // or a wooden stair up the side to a door; a tall roof with a window in its gable
  townhouse(spec, r) {
    const D = base(spec, r), w = 4, l = spec.l, tall = opt(spec, 'tall', spec.floors >= 3 || r() < 0.35), coved = opt(spec, 'coved', r() < 0.5), ds = doorLocal(spec);
    const steep = lerp(1.15, 1.45, r()), s0 = ST(opt(spec, 'mat0', r() < 0.55 ? 'stone' : 'plaster'));
    let storeys, gl, gz = 0;
    if (coved && l >= 8 && opt(spec, 'back2', r() < 0.4)) { gl = l - 2; gz = 1; storeys = [s0, ST('plaster', { b: 2 }, 'cove', { grid: 0.2 })]; }      // two metres out over the back, on long coves
    else if (coved) { gl = Math.max(2, l - 2); storeys = [s0, ST('plaster', { f: 1, b: 1 }, 'cove', { grid: 0.2 })]; }
    else if (l <= 6) { gl = l - 2; storeys = [s0, ST('plaster', { f: 1, b: 1 }, 'brace', { grid: 0.15 })]; }
    else { gl = l - 2; gz = -1; storeys = [s0, ST('plaster', { f: 2 }, 'brace', { grid: 0.15 })]; }
    if (!coved && l >= 6 && opt(spec, 'straight', r() < 0.3)) { gl = l; gz = 0; storeys = [s0, ST('plaster', null, 'cove', { grid: 0.2 })]; }      // straight up, a stair at its side
    if (tall) storeys.push(ST(r() < 0.5 ? 'plaster' : 'grid', r() < 0.45 ? { r: 1, l: 1 } : null, 'brace'));
    const B = { x: 0, z: gz, w, l: gl, storeys, door: { side: ds }, quoins: s0.mat === 'stone' && r() < 0.4,
      win: { kinds: [pick2(r, ['wf', 'f2', 'wr']), 'th'], shut: 0.55, closed: 0.25, hood: 0.2 } };
    let rs = rectsOf(B), tr = rs[rs.length - 1];
    if (!roofFits(tr.x1 - tr.x0, tr.z1 - tr.z0)) { storeys[storeys.length - 1].jet = { f: 0, b: 0, r: 0, l: 0 }; rs = rectsOf(B); tr = rs[rs.length - 1]; }
    B.roof = { kind: 'gable', steep, chimney: true, supports: r() < 0.6, gableWin: 0.6, dormers: storeys.length < 3 && tr.z1 - tr.z0 >= 8 ? [[1, -1]] : [] };
    const top = storeys.length - 1, plain = !storeys.slice(1).some(q => Object.values(q.jet).some(Boolean));
    const across = ds === 'f' || ds === 'b' ? ['r', 'l'] : ['f', 'b'];
    if (plain && storeys.length === 2 && gl >= 6 && r() < 0.8) B.stair = { kind: 'wood', side: pick2(r, across), k: Math.round(gl / 2) - 1, open: opt(spec, 'open', r() < 0.4), long: opt(spec, 'long', r() < 0.5) };
    else if (r() < 0.75) {
      const side = ds === 'f' || ds === 'b' ? ds : 'f', cnt = Math.round(SIDE[side].len(rs[top]) / 2), aboveFree = !(storeys[top + 1]);
      B.balcony = opt(spec, 'wrap', r() < 0.5) && aboveFree ? { s: top, side, from: Math.max(0, cnt - 2), wrap: true, rail: r() < 0.4 ? 'simple' : 'cross' } : { s: top, side, from: 0, to: cnt - 1, rail: r() < 0.4 ? 'simple' : 'cross' };
    }
    D.blocks.push(B);
    porchOrCanopy(D, spec, B, r, true);
    vines(D, spec, B, r, 1);
    if (spec.yard) D.extras.push(X.apron(B, [ds]));
    return D;
  },
  // a narrow tower of three storeys with a pyramid roof, the house leaning on it: a gabled house, a lean-to of boards, or a
  // catslide of tiles
  towerhouse(spec, r) {
    const D = base(spec, r), l = spec.l, back = -l / 2 + 2, topJet = l <= 4 && r() < 0.7, ds = doorLocal(spec);
    const tower = { x: 0, z: back, w: 4, l: 4, storeys: [ST('stone'), ST(r() < 0.5 ? 'stone' : 'plaster'), ST('plaster', topJet ? { f: 1, b: 1, r: 1, l: 1 } : null, 'cove')], quoins: r() < 0.5,
      roof: { kind: 'tower', steep: lerp(1.0, 1.35, r()) }, win: { kinds: ['th', 'wr'], shut: 0.3, hood: 0.1 } };
    if (topJet) tower.storeys.splice(1, 1);
    D.blocks.push(tower);
    const rest = l - 4;
    if (rest >= 4) D.blocks.push({ x: 0, z: back + 2 + rest / 2, w: 4, l: rest, storeys: [ST(r() < 0.5 ? 'plaster' : 'stone')], roof: { kind: 'gable', steep: lerp(1.05, 1.3, r()), chimney: r() < 0.6, gableWin: 0.4 },
      door: { side: ds }, win: { kinds: [pick2(r, ['wf', 'wr'])], shut: 0.6 } });
    else if (rest >= 2 && opt(spec, 'half', r() < 0.5)) D.blocks.push({ x: 0, z: back + 2 + rest / 2, w: 4, l: rest, storeys: [ST('plaster', null, 'cove', { win: 0.8 })], roof: { kind: 'half', span: 4, steep: lerp(0.9, 1.3, r()) }, door: { side: ds }, win: { kinds: ['wf'], shut: 0.5 } });
    else if (rest >= 2) D.blocks.push({ x: 0, z: back + 2 + rest / 2, w: 4, l: rest, storeys: [ST('plaster', null, 'cove', { win: 0.8 })], roof: { kind: 'lean', rise: 1.2 }, door: { side: ds }, win: { kinds: ['wf'], shut: 0.5 } });
    else tower.door = { side: ds };
    vines(D, spec, tower, r, 2);
    return D;
  },
  // a house under one wide roof, a veranda of boards on posts down one long side; or two storeys, a balcony on that side
  veranda(spec, r) {
    const D = base(spec, r), w = 6, l = roofFits(6, spec.l) ? spec.l : 8, side = spec.door === 'left' ? 'l' : 'r';
    const two = opt(spec, 'two', spec.floors >= 2 || r() < 0.45), wrap = two && opt(spec, 'wrap', r() < 0.5);
    const main = { x: 0, z: 0, w, l, storeys: two ? [ST('stone'), ST('plaster', null, 'cove', { grid: 0.2 })] : [ST('plaster', null, 'cove', { win: 0.7 })], veranda: two ? null : { side, d: 2 },
      roof: { kind: 'gable', steep: lerp(1.05, 1.3, r()), chimney: side === 'r' ? 'left' : 'right', supports: true, gableWin: 0.5, dormers: l >= 8 && !two ? [[side === 'r' ? -1 : 1, -1.5], [side === 'r' ? -1 : 1, 1.5]] : [] },
      door: { side, kind: opt(spec, 'inset', r() < 0.4) ? 'inset' : pick2(r, ['flat', 'round']) }, win: { kinds: [pick2(r, ['wf', 'wr', 'f2'])], shut: 0.65, closed: 0.2, hood: 0.2 } };
    if (two) main.balcony = { s: 1, side, from: 1, to: Math.round(l / 2) - 2, rail: 'simple' };
    if (wrap) {                                                            // the porch round the corner, its door under it at the front
      const away = side === 'r';                                           // (round the left corner when the balcony is on the right)
      main.door = { side: 'f', k: 1, kind: 'flat' };
      main.bareGable = ['f']; main.sheltered = ['f', away ? 'l' : 'r'];
      D.extras.push(X.wrapPorch(main, 2, 4, away));
    }
    D.blocks.push(main);
    vines(D, spec, main, r, 2);
    if (two && !wrap) porchOrCanopy(D, spec, main, r);
    return D;
  },
  // a shop under an arcade: the upper storey on arches and posts over the pavement, crates by the door
  shophouse(spec, r) {
    const D = base(spec, r), l = spec.l, front = doorLocal(spec) === 'b' ? -1 : 1;
    const B = { x: 0, z: -front, w: 4, l: l - 2, yaw: front < 0 ? Math.PI : 0,
      storeys: [ST(r() < 0.5 ? 'stone' : 'plaster'), ST('plaster', { f: 2 }, 'arcade', { grid: 0.25 })], quoins: r() < 0.3,
      roof: { kind: 'gable', steep: lerp(1.15, 1.45, r()), chimney: true, supports: true, gableWin: 0.4 }, win: { kinds: ['wf', 'f2'], shut: 0.6, hood: 0.15 } };
    if (r() < 0.5 && roofFits(4, l)) B.storeys.push(ST('plaster', null, 'cove'));
    if (r() < 0.6) B.balcony = { s: B.storeys.length - 1, side: 'f', from: 0, to: 1, rail: 'simple' };
    D.blocks.push(B);
    D.extras.push(X.thing('Prop_Crate', 1.3 * front, 0, (l / 2 - 0.6) * front, r() * 6, 0.8), X.thing('Prop_Crate', 1.5 * front, 0.85, (l / 2 - 0.7) * front, r() * 6, 0.6));
    vines(D, spec, B, r, 1);
    return D;
  },
  // a barn: tall walls of stone and lattice, a wide door and a hay door over it, a shelter of boards in front (its roof all
  // tiles: the kit's wooden ridge log is left off, a brown ridge on a roof of another colour)
  barn(spec, r) {
    const D = base(spec, r), w = spec.w >= 8 ? 8 : spec.w >= 6 ? 6 : 4, l = spec.l, shelter = l >= 10 ? 2 : 0, bl = roofFits(w, l - shelter) ? l - shelter : l;
    const B = { x: 0, z: -shelter / 2, w, l: bl, storeys: [ST('stone', null, 'cove', { win: 0.2 }), ST('grid', null, 'cove', { win: 0.15 })],
      roof: { kind: 'gable', steep: lerp(1.15, 1.35, r()), supports: true }, door: { side: 'f', kind: 'round', leaf: 'Door_4_Round' }, win: { kinds: ['th'], shut: 0.9, closed: 0.6 },
      doors: [{ s: 1, side: 'f', k: Math.floor((w / 2 - 1) / 2), kind: 'flat', leaf: 'Door_8_Flat' }] };
    B.storeys[1].grid = 0.6;
    const stairKind = opt(spec, 'stair', r() < 0.5 ? pick2(r, ['stone', 'wood']) : false);
    if (w >= 6 && stairKind) B.stair = { kind: stairKind === 'wood' ? 'wood' : 'stone', side: pick2(r, ['r', 'l']), k: Math.round(bl / 2) - 1, landing: opt(spec, 'landing', null), open: true, mid: true };      // (a landing half way where the wall is long enough)
    D.blocks.push(B);
    D.extras.push(({ at }) => at(null, 'Window_Roof_Wide', [0, -1, 0, -1, 1][w / 2] ?? 0, 3.4, -shelter / 2 + bl / 2, 0, 1.2, 1, 1.2));      // a hood over the hay door
    if (shelter) D.extras.push(({ at, solid }) => {
      const z0 = -shelter / 2 + bl / 2;
      for (let x = -w / 2 + 1; x < w / 2; x += 2) at(null, x === -w / 2 + 1 ? 'Roof_Wooden_2x1_L' : x > w / 2 - 1.5 ? 'Roof_Wooden_2x1_R' : 'Roof_Wooden_2x1_Center', x, 2.75, z0, 0, 1, 1, 1.3);
      for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) { at(null, 'Corner_Exterior_Wood', x, -0.3, z0 + 1.85, 0, 1, 0.98, 1); solid(null, x, z0 + 1.85, 0.22); }
    });
    D.extras.push(X.either(X.thing('Prop_Wagon', w / 2 + 1.3, 0, 2.2, 0.15, 1, true), X.thing('Prop_Wagon', -w / 2 - 1.3, 0, 2.2, -0.15, 1, true)), X.thing('Prop_Crate', -w / 2 - 0.5, 0, 1.5, r() * 3, 1, true), X.bricks(-w / 2 - 1.0, -l / 2 + 1.5, r));
    if (spec.yard) D.extras.push(X.either(X.shed(-w / 2 - 3.3, -1, D90, 4, 'pent'), X.shed(w / 2 + 3.3, -1, D90, 4, 'pent')));      // (clear of the eaves)
    return D;
  },
  // an open stable or shed: three walls and two arches, crates inside
  stable(spec, r) {
    const D = base(spec, r), front = doorLocal(spec);
    const B = { x: 0, z: 0, w: 4, l: 4, storeys: [ST('plaster', null, 'cove', { win: 0.3 })], roof: { kind: 'gable', steep: lerp(0.9, 1.15, r()), supports: true, gableWin: 0.4 }, win: { kinds: ['th'], shut: 0.5 }, arches: [front] };
    D.blocks.push(B);
    const [fx, fz] = SIDE[front].n;
    D.extras.push(({ at }) => {
      for (let x = -1; x <= 1; x += 2) for (let z = -1; z <= 1; z += 2) at(null, 'Floor_WoodDark', x, 0.04, z, 0);
      at(null, 'Prop_Crate', -0.9 * (fz || 1), 0, -1 * (fz || 1), 0.3); at(null, 'Prop_Crate', -0.95 * (fz || 1), 1.05, -1.05 * (fz || 1), 0.9, 0.7, 0.7, 0.7); at(null, 'Prop_Crate', 0.6, 0, -1.2 * (fz || 1), 1.2, 0.85, 0.85, 0.85);
      at(null, 'Prop_WoodenFence_Single', fx * 0.2, 0, fz * 0.2, SIDE[front].yaw, 0.9, 0.9, 0.9);
    });
    if (spec.yard) {                                                       // a paddock at one side, the way in by the stable's front
      const right = NEXT[front], left = Object.keys(NEXT).find(k => NEXT[k] === front);
      D.extras.push(X.either(X.yardFence(B, right, 4, { gap: [[0, 0]] }), X.yardFence(B, left, 4, { gap: [[2, 1]] })));
    }
    return D;
  },
  // the manor: a long hall of two storeys on a plinth, its upper storey jutting out on braces, a slim tower at one corner, a
  // terrace over a stone loggia at the other, a grand door with an iron-studded leaf up wide steps, dormers
  manor(spec, r) {
    const D = base(spec, r, pick2(r, ['chalk', 'honey', 'sky'])), w = spec.w, ds = doorLocal(spec);
    const raise = opt(spec, 'plinth', r() < 0.6) ? 1 : 0;
    const hall = { x: 0, z: -2, y: raise, plinth: raise ? 'wide' : null, w: w - 2, l: 10, storeys: [ST('stone'), ST('plaster', { r: 1, l: 1 }, 'brace', { grid: 0.2 })], quoins: true,
      roof: { kind: 'gable', steep: 1.25, chimney: true, chimneyAt: lerp(-3.5, 0.2, r()), supports: true, gableWin: 0.8, dormers: [[1, -2], [-1, -2], [1, 1.5], [-1, 1.5]] }, door: { side: ds === 'f' || ds === 'b' ? 'l' : ds, kind: 'inset', leaf: 'Door_2_Round', frame: 'stone' },
      win: { kinds: ['wr', 'f2'], shut: 0.4, hood: 0.3 }, doors: [{ s: 1, side: 'f', k: 1, kind: 'round', leaf: 'Door_1_Round' }] };
    D.blocks.push(hall);
    D.blocks.push({ x: 2, z: 5, y: raise, plinth: raise ? true : null, w: 4, l: 4, storeys: [ST('stone'), ST('stone'), ST('plaster', null, 'cove', { grid: 0.3 })], quoins: true, roof: { kind: 'tower', steep: 1.25, tall: 1.15 }, win: { kinds: ['th', 'wr'], shut: 0.3 } });
    D.blocks.push({ x: -2, z: 5, y: raise, plinth: raise ? true : null, w: 4, l: 4, storeys: [ST('stone', null, 'cove', { win: 0.9 })], roof: { kind: 'terrace', rail: 'simple', floor: pick2(r, ['Floor_RedBrick', 'Floor_UnevenBrick', 'Floor_Brick']) }, door: { side: 'f', k: 1, kind: 'round' }, win: { kinds: ['wr'], shut: 0, hood: 0 } });      // (its door away from the corner: the forecourt's wall comes in there; no hoods: a vine hangs by its window)
    D.extras.push(X.vine(-3, 3 + raise, 7.12, 0, 0), X.vine(3.1, 6 + raise, 7.12, 0, 1));
    if (spec.yard) D.extras.push(X.court(-w / 2, w / 2, 7, 4, 1, true), X.apron(hall, ['l']));      // a walled forecourt, its gate before the terrace's door
    return D;
  },
  // a keep: stone storeys on a plinth, wide quoins, narrow windows, the top storey jutting out all round under a pyramid roof
  keep(spec, r) {
    const D = base(spec, r, pick2(r, ['chalk', 'sky', 'lilac'])), floors = Math.max(3, spec.floors || 4);
    const storeys = []; for (let s = 0; s < floors - 1; s++) storeys.push(ST('stone', null, 'cove', { win: s === 0 ? 0.2 : 0.5 }));
    storeys.push(ST(opt(spec, 'chamfer', false) ? 'stone' : 'plaster', { f: 1, b: 1, r: 1, l: 1 }, 'cove', { win: 0.9 }));
    const stoop = opt(spec, 'stoop', r() < 0.3 ? 'front' : null), chamfer = opt(spec, 'chamfer', r() < 0.25);
    const high = !stoop && opt(spec, 'high', r() < 0.35);                  // a plinth two metres high, two flights straight up to its door
    D.blocks.push({ x: 0, z: 0, y: high ? 2 : 1, w: 4, l: 4, storeys, quoins: 'wide', plinth: stoop ? 'stoop' : true, stoop, chamfer, roof: { kind: 'tower', steep: 1.2, tall: 1.1 },
      door: { side: doorLocal(spec), kind: r() < 0.5 ? 'round' : 'flat', leaf: 'Door_2_Round', frame: 'stone' }, win: { kinds: ['th'], shut: 0.2, hood: 0 } });
    D.extras.push(X.vine(2.12, floors * 3 - 2.4 + (high ? 1 : 0), 0.6, D90, 2));
    if (spec.yard) D.extras.push(X.paving(-3, 2, 3, high ? 8 : 6));
    return D;
  },
  // a hall beside a keep: stone below, plaster above on braces, a tall roof with dormers; stone steps up its side, some
  hall(spec, r) {
    const D = base(spec, r, pick2(r, ['chalk', 'sky', 'honey'])), l = spec.l, ds = doorLocal(spec);
    const B = { x: 0, z: 0, y: 1, plinth: 'stoop', stoop: opt(spec, 'stoop', 'side'), w: 4, l, storeys: [ST('stone'), ST('plaster', { r: 1, l: 1 }, 'brace', { grid: 0.25 })], quoins: true,
      roof: { kind: 'gable', steep: 1.2, chimney: 'right', supports: true, gableWin: 0.7, dormers: [[1, 0.5]] }, door: (k => ({ side: ds, k: spec.doorAt ?? null, kind: k, leaf: k === 'flat' ? 'Door_2_Flat' : 'Door_2_Round' }))(opt(spec, 'doorKind', pick2(r, ['round', 'flat']))),
      win: { kinds: ['wr', 'th'], shut: 0.3, hood: 0.25 } };
    D.blocks.push(B);
    return D;
  },
  // a windmill's tower: three storeys, nothing jutting out on its front (the sails turn there)
  mill(spec, r) {
    const D = base(spec, r);
    D.blocks.push({ x: 0, z: 0, w: 4, l: 4, storeys: [ST('stone'), ST('plaster', null, 'cove', { win: 0.5 }), ST('plaster', null, 'cove', { win: 0.4 })], quoins: r() < 0.5,
      roof: { kind: 'tower', steep: 1.0 }, door: { side: doorLocal(spec), kind: 'round' }, win: { kinds: ['th', 'wr'], shut: 0.5, hood: 0.2 } });
    r(); D.blocks[0].shelter = 'porch';                                    // (a porch before its door)
    return D;
  },
  // a water mill: stone below, plaster above jutting out front and back on braces, nothing on the wheel's side (its left);
  // a balcony or a wooden stair on the other side
  watermill(spec, r) {
    const D = base(spec, r), l = spec.l, stairs = opt(spec, 'stair', r() < 0.5);
    const B = { x: 0, z: 0, w: 4, l, storeys: [ST('stone', null, 'cove', { win: 0.5 }), ST('plaster', stairs ? null : { f: 1, b: 1 }, 'brace', { grid: 0.2 })], quoins: true,
      roof: { kind: 'gable', steep: lerp(1.1, 1.3, r()), chimney: 'right', supports: true, gableWin: 0.5 }, door: { side: doorLocal(spec), kind: 'flat' }, win: { kinds: ['wf', 'th'], shut: 0.6, hood: 0.2 } };
    if (stairs) B.stair = { kind: 'wood', side: 'r', k: Math.round(l / 2) - 1, open: opt(spec, 'open', r() < 0.5) };
    else B.balcony = { s: 1, side: 'r', from: 1, to: 2, rail: 'cross' };
    D.blocks.push(B);
    D.extras.push(X.thing('Prop_Crate', 2.6, 0, l / 2 - 0.4, 0.4, 0.8, true), X.bricks(2.95, -l / 2 + 0.8, r));
    return D;
  },
  // the miller's house: a cottage with crates by it
  millhouse(spec, r) {
    const D = DESIGNS.cottage({ ...spec }, r);
    D.extras.push(X.thing('Prop_Crate', -2.6, 0, 1.05, r() * 2, 0.85, true), X.thing('Prop_Crate', -2.65, 0, 2.4, r() * 2, 0.75, true));
    return D;
  },
  // three storeys straight up on a small ground, the top one jutting out all round, a lean-to behind
  tallhouse(spec, r) {
    const D = base(spec, r), l = Math.min(spec.l, 6);
    const B = { x: 0, z: (l - 4) / 2, w: 4, l: 4, storeys: [ST(r() < 0.6 ? 'stone' : 'plaster'), ST('plaster', null, 'cove', { grid: 0.2 }), ST('plaster', { f: 1, b: 1, r: 1, l: 1 }, opt(spec, 'top', r() < 0.5 ? 'cove' : 'brace'))],
      quoins: r() < 0.4, roof: { kind: 'gable', steep: lerp(1.2, 1.5, r()), chimney: true, supports: true, gableWin: 0.6, dormers: [] }, door: { side: doorLocal(spec) },
      win: { kinds: [pick2(r, ['wf', 'wr', 'f2']), 'th'], shut: 0.6, hood: 0.2 } };
    if (B.storeys[2].style === 'cove' && opt(spec, 'chamfer', r() < 0.35)) { B.chamfer = true; B.roof.dormers = [[1, 0], [-1, 0]]; B.roof.gableWin = 1; }
    D.blocks.push(B);
    const leanKind = opt(spec, 'lean', pick2(r, ['lean', 'half', 'half6']));
    if (l >= 6) D.blocks.push({ x: 0, z: -l / 2 + 1, w: 4, l: 2, yaw: Math.PI, storeys: [ST('plaster', null, 'cove', { win: 0.4 })], win: { kinds: ['th'] },
      roof: leanKind === 'lean' ? { kind: 'lean', rise: 1.1 } : leanKind === 'half6' ? { kind: 'half', span: 6, steep: 0.8 } : { kind: 'half', span: 4, steep: 0.95 } });
    porchOrCanopy(D, spec, B, r);
    vines(D, spec, B, r, 2);
    return D;
  },
  // an inn: a big hall of two storeys with a balcony round its corner, a catslide down one side, a wing at the back
  inn(spec, r) {
    const D = base(spec, r), l = spec.l >= 12 ? 12 : 10, w = 8;
    const main = { x: -1, z: 0, w: 6, l: l - 2, storeys: [ST('stone'), ST('plaster', { f: 1, b: 1 }, 'brace', { grid: 0.2 })], quoins: true,
      roof: { kind: 'gable', steep: 1.2, chimney: 'left', supports: true, gableWin: 0.9, dormers: [[1, -2], [1, 1.5]] }, door: { side: 'f', kind: 'round', leaf: 'Door_2_Round' },
      win: { kinds: ['wf', 'f2', 'wr'], shut: 0.6, hood: 0.3 }, balcony: { s: 1, side: 'f', from: 1, wrap: true, rail: 'simple' } };
    if (opt(spec, 'stair', r() < 0.5)) main.stair = { kind: 'stone', side: 'l', k: 1, landing: opt(spec, 'landing', null) };
    D.blocks.push(main);
    D.blocks.push({ x: 3, z: -1, yaw: D90, w: l - 4, l: 2, storeys: [ST('plaster', null, 'cove', { win: 0.7 })], roof: { kind: 'half', span: 4, steep: 0.72 }, win: { kinds: ['wf'], shut: 0.5 } });
    D.extras.push(X.thing('Prop_Wagon', w / 2 + 3.6, 0, l / 2 + 0.6, 0.4, 1, true), X.dais(3, l / 2 - 2, 0, 1));                          // (a mounting block in the nook before its wing)
    if (spec.yard) D.extras.push(X.apron(main, ['f', 'l']));
    vines(D, spec, main, r, 2);
    return D;
  },
  // a gatehouse: a way through under an arch, an iron gate in it, the storeys above jutting out over both sides of it
  gatehouse(spec, r) {
    const D = base(spec, r), l = 4;
    D.blocks.push({ x: 0, z: 0, w: 4, l, storeys: [ST('stone', null, 'cove', { win: 0 }), ST('plaster', { f: 1, b: 1 }, 'brace', { grid: 0.3 }), ST('plaster', opt(spec, 'topJet', r() < 0.5) ? { r: 1, l: 1 } : null, 'cove')], arches: ['f', 'b'], quoins: 'wide',
      roof: { kind: r() < 0.5 ? 'gable' : 'tower', steep: 1.25, supports: true, gableWin: 0.8 }, win: { kinds: ['th', 'wr'], shut: 0.4 } });
    D.extras.push(X.paving(-2, -3, 2, 3, opt(spec, 'paving', pick2(r, ['Floor_RedBrick', 'Floor_UnevenBrick']))), X.ceiling(-2, -2, 2, 2, 3, true), X.thing(opt(spec, 'gate', pick2(r, ['Prop_MetalFence_Ornament', 'Prop_MetalFence_Simple'])), -1, 0, 2, 0), X.gardenWall(2.2, 0, 0, 2, 'b'), X.gardenWall(-4.2, 0, 0, 2, 'a'));
    return D;
  },
  // a market hall: an open floor on arches all round, paved, a council room over it under a big roof
  market(spec, r) {
    const D = base(spec, r);
    D.blocks.push({ x: 0, z: 0, w: 8, l: 8, storeys: [ST('stone', null, 'cove', { win: 0 }), ST('plaster', null, 'cove', { grid: 0.35 })], arches: ['f', 'b', 'l', 'r'],
      roof: { kind: 'gable', steep: 1.1, chimney: true, supports: true, gableWin: 1, dormers: [[1, 0], [-1, 0]] }, win: { kinds: ['f2', 'wf'], shut: 0.5, hood: 0.3 } });
    D.extras.push(X.paving(-4, -4, 4, 4), X.ceiling(-4, -4, 4, 4, 3, opt(spec, 'stoneCeiling', r() < 0.5)), X.thing('Prop_Crate', -2.4, 0, -2.2, 0.3), X.thing('Prop_Crate', -1.5, 0, -2.6, 0.8, 0.85), X.thing('Prop_Crate', 2.3, 0, 1.6, 1.4, 0.9), X.thing('Prop_Crate', 2.2, 0.95, 1.7, 0.2, 0.7));
    if (spec.yard) D.extras.push(X.dais(-6.4, -2, 0, 2));                  // a crier's platform beside it, two flights up
    return D;
  },
  // a long house of stone: one storey under a long roof, a catslide down its back, two chimneys
  longhouse(spec, r) {
    const w = spec.w >= 8 ? 8 : 6, D = base(spec, r), l = roofFits(w, spec.l) && spec.l >= 10 ? spec.l : 12;
    D.blocks.push({ x: 0, z: 0, w, l, storeys: [ST('stone', null, 'cove', { win: 0.6 })], quoins: r() < 0.5, roof: { kind: 'gable', steep: lerp(1.1, 1.35, r()), chimney: 'right', supports: true, gableWin: 0.7, dormers: [[-1, -l / 4], [-1, l / 4]] },
      door: { side: 'r', kind: 'round' }, win: { kinds: ['wr', 'wf'], shut: 0.7, closed: 0.3, hood: 0.3 } });
    porchOrCanopy(D, spec, D.blocks[0], r, 'porch');
    D.extras.push(X.thing('Prop_Crate', w / 2 + 0.6, 0, l / 2 - 1, 0.4, 0.85, true));
    ivy(spec, D.blocks[0], r, 0.35);
    if (spec.yard) D.extras.push(X.yardFence(D.blocks[0], 'r', 4, { gap: [[1, Math.floor((l / 2 - 1) / 2)]] }), X.shed(-w / 2 - 4.3, -l / 2 + 2.5, D90, 4, 'wide'));
    vines(D, spec, D.blocks[0], r, 2);
    return D;
  },
};

// ask for a shelter over a block's main door: a canopy (some of them the long one), a porch, or none; block() builds it at the
// door it builds, where one fits (shelterOf). only: 'canopy' (no porch) or 'porch' (a porch for sure)
function porchOrCanopy(D, spec, B, r, only = false) {
  if (!B.door) return;
  const roll = only === 'porch' ? 0.5 : r();
  if (roll < 0.4) B.shelter = r() < 0.4 ? 'long' : 'canopy';
  else if (roll < 0.75 && only !== true && only !== 'canopy') B.shelter = 'porch';
  if (spec.opt && spec.opt.shelter !== undefined) B.shelter = spec.opt.shelter;
}
// ivy on a block's gabled roof, some: on a side with no dormer, a vine as long as the roof has room for
function ivy(spec, B, r, chance = 0.3) {
  const R = B.roof, roll = r(), pickK = r(), sideRoll = r(), forced = spec.opt ? spec.opt.ivy : undefined;
  if (!R || R.kind !== 'gable' || forced === false || !(forced || roll < chance)) return;
  const rs = rectsOf(B), q = rs[rs.length - 1], L = q.z1 - q.z0, free = [1, -1].filter(sd => !(R.dormers || []).some(d => d[0] === sd));
  if (!free.length || L < 4) return;
  const kinds = L >= 6 ? [5, 6, 9] : [5], kind = forced && kinds.includes(forced) ? forced : kinds[Math.floor(pickK * kinds.length)];
  R.ivy = [[free[Math.floor(sideRoll * free.length)], 0, kind]];
}
// vines down a wall or two
function vines(D, spec, B, r, n) {
  const rect = rectsOf(B)[0];
  for (let i = 0; i < n; i++) {
    if (r() < 0.35) continue;
    const side = pick2(r, ['l', 'r', 'b']), S = SIDE[side], count = Math.round(S.len(rect) / 2), k = Math.floor(r() * count);
    const [u, v] = S.at(rect, 2 * k + 0.4 + r() * 1.2), [x, z] = fromBlock({ x: B.x, z: B.z, yaw: B.yaw || 0 }, u + S.n[0] * 0.13, v + S.n[1] * 0.13);
    const yTop = (B.y || 0) + 3 * Math.min(B.storeys.length, 1 + Math.floor(r() * B.storeys.length)) - 0.15;
    D.extras.push(X.vine(x, yTop, z, S.yaw + (B.yaw || 0), Math.floor(r() * 6)));
  }
}

// the hill village's houses, by name: what each is for
const ROLES = {
  village_house_1: 'towerhouse', village_house_2: 'veranda', village_house_3: 'shophouse', village_house_4: 'cottage', ledge_house: 'tallhouse',
  cottage_upper_1: 'cottage', cottage_upper_2: 'townhouse', cottage_upper_3: 'cottage', manor: 'manor', barn: 'barn', stable_shed: 'stable',
  castle_keep: 'keep', castle_hall: 'hall', mill_tower: 'mill', mill_house: 'millhouse', watermill: 'watermill',
};
export function roleFor(spec) {
  if (spec.role) return spec.role;
  if (spec.id && ROLES[spec.id]) return ROLES[spec.id];
  if (spec.tower) return (spec.floors || 1) >= 4 ? 'keep' : 'mill';
  if (spec.w >= 8) return 'manor';
  if (spec.w >= 6) return spec.l >= 10 ? 'barn' : 'veranda';
  if (spec.l >= 8) return (spec.floors || 1) >= 2 ? 'shophouse' : 'townhouse';
  if (spec.l <= 4) return 'cottage';
  return (spec.floors || 1) >= 2 ? 'townhouse' : 'cottage';
}
export function designFor(spec) {
  const role = roleFor(spec), r = mulberry(hashOf((spec.id || role) + ':' + (spec.seed || 1)) ^ ((spec.seed || 1) * 7919));
  const D = (DESIGNS[role] || DESIGNS.cottage)({ w: 4, l: 6, floors: 1, door: 'front', ...spec }, r);
  for (const B of D.blocks) if (!B.seed) B.seed = Math.floor(r() * 1e9) + 1;       // (each block its own dice for its windows and doors)
  D.role = role;
  return D;
}
export const ROLE_NAMES = Object.keys(DESIGNS);
// for a file of designs made by hand (loria-buildings.js): a storey, the things of a yard, the dice
export { ST, X as EXTRAS, mulberry };
