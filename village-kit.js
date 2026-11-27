/* ==========================================================================
   village-kit.js  —  houses put together from the pieces of a modular building kit
   The pieces are Quaternius' Medieval Village MegaKit (CC0), packed into assets/models/village-kit.glb by
   tools/pack-village-kit.py: walls 2 m wide and 3 m tall, doors, windows, shutters, tiled roofs, gables, chimneys.
   One job: to stand pieces side by side into buildings and hand them back as a few merged meshes (one for each of the
   kit's pictures), drawn with the props' material so the game's three bands of light fall on them.

     const kit = await loadVillageKit();
     const b = kit.builder();
     b.house({ w: 4, l: 6, floors: 2, wall: 'plaster', door: 'front', seed: 3 }, x, y, z, yaw);     // as many as wanted
     b.piece('Prop_Wagon', x, y, z, yaw);                                                           // or single pieces
     b.bridge({ length, width, deck }, x, y, z, yaw);                                               // a stone bridge, in the kit's stone
     scene.add(b.build());                                                                          // a Group of merged meshes

   A house: w metres across (4, 6 or 8), l metres along its ridge (4 .. 14, the sizes the kit has roofs for), ridge along
   its own z, gables at +z ("front") and -z, eaves at +x and -x. y = 0 is the foot of the walls.
   roofHole: { x, z, rx, rz } in its spec leaves the tiles out over an ellipse of the roof as seen from above (an old house's
   roof fallen in; the hero's cottage, old-farm.js).
   houseFootprint(spec) gives [w, l] with the eaves' and steps' room, for colliders and bare ground.

   look: 'kit' (the kit's own painted pictures) or 'flat' (each face one flat colour taken from them, like the restyled props).
   ========================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propMaterial } from './stylized-props.js';

const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const GLASS = [0.31, 0.42, 0.53];                                           // window panes: one flat colour (the kit's are see-through)
export const ROOFS = { 4: [4, 6, 8], 6: [6, 8, 10, 12], 8: [10, 12, 14] };  // the roofs the kit has: across -> along the ridge
const ROOF_SHAPE = { 4: { ridge: 3.73, eave: -0.52, out: 2.76 }, 6: { ridge: 4.89, eave: -0.78, out: 4.12 }, 8: { ridge: 6.0, eave: -0.78, out: 4.98 } };      // (as the kit's roofs are made)
const WALLS = {
  plaster: { plain: ['Wall_Plaster_Straight', 'Wall_Plaster_Straight', 'Wall_Plaster_WoodGrid'], base: 'Wall_Plaster_Straight_Base',
    door: ['Wall_Plaster_Door_Flat', 'Wall_Plaster_Door_Round'], wide: ['Wall_Plaster_Window_Wide_Flat', 'Wall_Plaster_Window_Wide_Round'], thin: 'Wall_Plaster_Window_Thin_Round' },
  brick: { plain: ['Wall_UnevenBrick_Straight'], base: 'Wall_UnevenBrick_Straight',
    door: ['Wall_UnevenBrick_Door_Flat', 'Wall_UnevenBrick_Door_Round'], wide: ['Wall_UnevenBrick_Window_Wide_Flat', 'Wall_UnevenBrick_Window_Wide_Round'], thin: 'Wall_UnevenBrick_Window_Thin_Round' },
};

export async function loadVillageKit(url = new URL('./assets/models/village-kit.glb', import.meta.url).href) {
  const gltf = await new GLTFLoader().loadAsync(url);
  // every piece: its primitives, each with the picture it is painted from (or none: glass)
  const pieces = new Map(), pictures = new Map();
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
  });
  // each picture made small, for the flat look: a trim sheet (many different strips on one picture) keeps the colour of the
  // strip a face lies on; a picture of one stuff all over (plaster, brick, tiles) is one colour
  const pixels = new Map();
  const pixelsOf = key => {
    if (pixels.has(key)) return pixels.get(key);
    const n = /Trim|Metal/.test(key) ? 16 : 1;
    const c = document.createElement('canvas'); c.width = c.height = n;
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(pictures.get(key).image, 0, 0, n, n);
    const d = { n, data: x.getImageData(0, 0, n, n).data }; pixels.set(key, d);
    return d;
  };

  // a piece's geometry without the triangles whose middle drop(x, y, z) names (its own frame); every corner of its own
  const without = (geometry, drop) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(), pos = g.attributes.position, keep = [];
    for (let t = 0; t < pos.count; t += 3) {
      const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, y = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3, z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      if (!drop(x, y, z)) keep.push(t);
    }
    const out = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) {
      const n = a.itemSize, src = a.array, dst = new src.constructor(keep.length * 3 * n);
      keep.forEach((t, k) => dst.set(src.subarray(t * n, (t + 3) * n), k * 3 * n));
      out.setAttribute(name, new THREE.BufferAttribute(dst, n));
    }
    out.setIndex(Array.from({ length: keep.length * 3 }, (_, k) => k));    // (indexed, as the other pieces are: they are merged together)
    g.dispose();
    return out;
  };

  function builder() {
    const parts = new Map();                                               // picture key -> geometries, already where they stand
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), root = new THREE.Matrix4();
    const put = (name, m, drop = null) => {
      const prims = pieces.get(name);
      if (!prims) { console.warn('[kit] no piece', name); return; }
      for (const p of prims) { const g = (drop ? without(p.geometry, drop) : p.geometry.clone()).applyMatrix4(m); if (!parts.has(p.key)) parts.set(p.key, []); parts.get(p.key).push(g); }
    };
    // a piece at x, y, z (in the frame set by root), turned yaw about the vertical; drop(x, y, z): the triangles whose middle
    // (in the piece's own frame) it names are left out (a hole in a roof)
    const local = (name, x, y, z, yaw = 0, sx = 1, drop = null) => put(name, M.compose(new THREE.Vector3(x, y, z), Q.setFromAxisAngle(UP, yaw), new THREE.Vector3(sx, 1, 1)).premultiply(root), drop);
    const at = (x, y, z, yaw) => root.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1));

    function house(spec, x = 0, y = 0, z = 0, yaw = 0) {
      const { w = 4, l = 6, floors = 1, wall = 'plaster', upper = 'plaster', door = 'front', doorAt = null, seed = 1, chimney = true, dormer = false, shutters = true, windows = 0.6, tower = false, roofHole = null } = spec;
      const r = mulberry(seed * 7919 + 13), pick = a => a[Math.floor(r() * a.length)];
      at(x, y, z, yaw);
      const nx = w / 2, nz = l / 2, hw = w / 2, hl = l / 2;
      // the four sides: [how many walls, where wall k stands, which way it faces]
      const sides = {
        front: [nx, k => [-hw + 1 + 2 * k, hl], 0], back: [nx, k => [hw - 1 - 2 * k, -hl], Math.PI],
        right: [nz, k => [hw, hl - 1 - 2 * k], Math.PI / 2], left: [nz, k => [-hw, -hl + 1 + 2 * k], -Math.PI / 2],
      };
      for (let f = 0; f < floors; f++) {
        const W = WALLS[f === 0 ? wall : upper], fy = f * 3;
        for (const [name, [n, where, turn]] of Object.entries(sides)) {
          const doorK = f === 0 && name === door ? (doorAt === null ? Math.floor((n - 1) / 2) : doorAt) : -1;
          for (let k = 0; k < n; k++) {
            const [px, pz] = where(k);
            if (k === doorK) {
              const round = r() < 0.5;
              local(W.door[round ? 1 : 0], px, fy, pz, turn);
              local(round ? 'DoorFrame_Round_WoodDark' : 'DoorFrame_Flat_WoodDark', px, fy, pz, turn);
              const c = Math.cos(turn), s = Math.sin(turn);              // the door hangs from its left jamb
              local(round ? (r() < 0.5 ? 'Door_1_Round' : 'Door_8_Round') : (r() < 0.5 ? 'Door_1_Flat' : 'Door_4_Flat'), px - 0.51 * c, fy, pz + 0.51 * s, turn);
            } else if (r() < windows && !(f === 0 && Math.abs(k - doorK) === 0)) {
              const kind = r();
              if (kind < 0.42) { local(W.wide[0], px, fy, pz, turn); local('Window_Wide_Flat1', px, fy, pz, turn); if (shutters && r() < 0.7) local('WindowShutters_Wide_Flat_Open', px, fy, pz, turn); }
              else if (kind < 0.8) { local(W.wide[1], px, fy, pz, turn); local('Window_Wide_Round1', px, fy, pz, turn); if (shutters && r() < 0.7) local('WindowShutters_Wide_Round_Open', px, fy, pz, turn); }
              else { local(W.thin, px, fy, pz, turn); local('Window_Thin_Round1', px, fy, pz, turn); if (shutters && r() < 0.6) local('WindowShutters_Thin_Round_Open', px, fy, pz, turn); }
            } else local(f === 0 && r() < 0.35 ? W.base : pick(W.plain), px, fy, pz, turn);
          }
        }
        for (const [cx, cz, turn] of [[hw, hl, 0], [-hw, hl, -Math.PI / 2], [-hw, -hl, Math.PI], [hw, -hl, Math.PI / 2]]) local('Corner_Exterior_Wood', cx, fy, cz, turn);
      }
      const top = floors * 3;
      if (tower) local('Roof_Tower_RoundTiles', 0, top, 0, 0);
      else {
        // roofHole { x, z, rx, rz }: tiles fallen in, an ellipse of the roof as seen from above (metres from the house's middle)
        const hole = roofHole ? (px, py, pz) => ((px - roofHole.x) / roofHole.rx) ** 2 + ((pz - roofHole.z) / roofHole.rz) ** 2 < 1 : null;
        local(`Roof_RoundTiles_${w}x${l}`, 0, top, 0, 0, 1, hole);
        local(`Roof_Front_Brick${w}`, 0, top, hl, 0); local(`Roof_Front_Brick${w}`, 0, top, -hl, Math.PI);
        // how high the roof's tiles lie above the walls' top, x metres from the ridge
        const R = ROOF_SHAPE[w], roofY = ax => R.ridge - (R.ridge - R.eave) * Math.min(1, Math.abs(ax) / R.out);
        if (chimney) { const side = r() < 0.5 ? 1 : -1, cx = hw * 0.45; local(r() < 0.5 ? 'Prop_Chimney' : 'Prop_Chimney2', side * cx, top + roofY(cx) - 1.9, (r() - 0.5) * (l - 3), side > 0 ? 0 : Math.PI); }
        if (dormer && l >= 8) { const side = r() < 0.5 ? 1 : -1, dx = hw * 0.2; local('Roof_Dormer_RoundTile', side * dx, top + roofY(dx + 1.9) - 0.15, (r() - 0.5) * (l - 5), side > 0 ? 0 : Math.PI); }
      }
      root.identity();
    }
    const piece = (name, x, y, z, yaw = 0) => { root.identity(); local(name, x, y, z, yaw); };

    // a humpbacked stone bridge along its own x, laid in the kit's own stone (the kit has no bridge, so it is made here, faces
    // and pictures as the kit's pieces have them): walls of the rubble the brick houses are built of, a ring of cut stones round
    // its arch and a vault of them under it, coping slabs on its parapets and posts of cut stone at its ends (the RockTrim sheet's
    // strips of ashlar and slab), its deck paved with the rubble as the kit's floors are. Merged with the houses' meshes of the same
    // pictures: nothing more to draw. y = 0 is the bank, deck(u) the height of its walking surface u metres from its middle
    function bridge({ length: L = 11, width: W = 2.9, deck, span = 2.7, crown = 1.75, spring = -1.0, foot = -2.2, wall = 0.32, high = 0.6, ring = 0.45 }, x = 0, y = 0, z = 0, yaw = 0) {
      const keyOf = re => [...pictures.keys()].find(k => re.test(k)) || '';
      const RUB = keyOf(/UnevenBrick/), TRIM = keyOf(/RockTrim/);
      const SLAB = [0.345, 0.575], ASHLAR = [0.605, 0.985];                 // (two strips of the RockTrim sheet: v from .. to)
      const out = new Map();
      // the kit's stone is grey and cool, the world's (the cliffs, the ways, the bridge as it was) warm and pale: each part is
      // tinted toward it, the picture's own light and dark kept (times the colour each vertex carries)
      const WARM = { rubble: [1.43, 1.48, 1.5], ashlar: [1.42, 1.45, 1.38], slab: [1.58, 1.45, 1.24] };
      const quad = (key, P, n, U, tint = key === RUB ? WARM.rubble : WARM.ashlar) => {      // four corners, the way it faces, their picture coordinates
        if (!out.has(key)) out.set(key, { p: [], n: [], uv: [], c: [], i: [] });
        const o = out.get(key), b0 = o.p.length / 3;
        const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        const flip = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2] < 0;
        for (let k = 0; k < 4; k++) { o.p.push(...P[k]); o.n.push(...n); o.uv.push(...U[k]); o.c.push(...tint); }
        if (flip) o.i.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2); else o.i.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
      };
      const rub = (h, yy) => [h / 2, yy * 0.474];                           // the rubble as the kit's walls lay it: 2 m to the picture
      const hw = W / 2, inner = hw - wall, A = span + ring, B = crown + ring;
      const archIn = t => [span * Math.cos(t), spring + crown * Math.sin(t)], archOut = t => [A * Math.cos(t), spring + B * Math.sin(t)];
      const outY = u => spring + B * Math.sqrt(Math.max(0, 1 - (u / A) * (u / A)));
      // the columns along it: every 0.3 m, and the ring's and the jambs' feet exactly
      const cols = new Set([-L / 2, L / 2, -A, A, -span, span]);
      for (let u = -L / 2; u < L / 2; u += 0.3) cols.add(+u.toFixed(4));
      const U = [...cols].sort((p, q) => p - q);
      for (const sd of [-1, 1]) {
        const zf = sd * hw, nz = [0, 0, sd];
        for (let i = 0; i < U.length - 1; i++) {
          const u0 = U[i], u1 = U[i + 1], um = (u0 + u1) / 2, t0 = deck(u0) + high, t1 = deck(u1) + high;
          if (Math.abs(um) >= A) quad(RUB, [[u0, foot, zf], [u1, foot, zf], [u1, t1, zf], [u0, t0, zf]], nz, [rub(u0, foot), rub(u1, foot), rub(u1, t1), rub(u0, t0)]);
          else {
            const b0 = outY(u0), b1 = outY(u1);                             // over the ring
            quad(RUB, [[u0, b0, zf], [u1, b1, zf], [u1, t1, zf], [u0, t0, zf]], nz, [rub(u0, b0), rub(u1, b1), rub(u1, t1), rub(u0, t0)]);
            if (Math.abs(um) >= span) quad(RUB, [[u0, foot, zf], [u1, foot, zf], [u1, spring, zf], [u0, spring, zf]], nz, [rub(u0, foot), rub(u1, foot), rub(u1, spring), rub(u0, spring)]);      // beside the arch, under its spring
          }
          // the parapet's inner face, and the deck between the parapets
          const d0 = deck(u0), d1 = deck(u1), zi = sd * inner;
          quad(RUB, [[u0, d0, zi], [u1, d1, zi], [u1, d1 + high, zi], [u0, d0 + high, zi]], [0, 0, -sd], [rub(u0, d0), rub(u1, d1), rub(u1, d1 + high), rub(u0, d0 + high)]);
          if (sd > 0) quad(RUB, [[u0, d0, -inner], [u1, d1, -inner], [u1, d1, inner], [u0, d0, inner]], [0, 1, 0], [[u0 / 2, -inner / 2], [u1 / 2, -inner / 2], [u1 / 2, inner / 2], [u0 / 2, inner / 2]]);
          // the coping: a slab along the parapet's top, a little over both its faces
          const c0 = d0 + high, c1 = d1 + high, ch = 0.14, zo = sd * (hw + 0.06), zn = sd * (inner - 0.06), sv = SLAB;
          quad(TRIM, [[u0, c0 + ch, zo], [u1, c1 + ch, zo], [u1, c1 + ch, zn], [u0, c0 + ch, zn]], [0, 1, 0], [[u0 / 4, sv[0] + 0.03], [u1 / 4, sv[0] + 0.03], [u1 / 4, sv[1]], [u0 / 4, sv[1]]], WARM.slab);
          for (const zz of [zo, zn]) quad(TRIM, [[u0, c0, zz], [u1, c1, zz], [u1, c1 + ch, zz], [u0, c0 + ch, zz]], [0, 0, zz === zo ? sd : -sd], [[u0 / 4, sv[0] + 0.03], [u1 / 4, sv[0] + 0.03], [u1 / 4, sv[0]], [u0 / 4, sv[0]]], WARM.slab);
          quad(TRIM, [[u0, c0, zo], [u1, c1, zo], [u1, c1, sd * hw], [u0, c0, sd * hw]], [0, -1, 0], [[u0 / 4, sv[0]], [u1 / 4, sv[0]], [u1 / 4, sv[0] + 0.02], [u0 / 4, sv[0] + 0.02]], WARM.slab);
          quad(TRIM, [[u0, c0, zn], [u1, c1, zn], [u1, c1, zi], [u0, c0, zi]], [0, -1, 0], [[u0 / 4, sv[0]], [u1 / 4, sv[0]], [u1 / 4, sv[0] + 0.02], [u0 / 4, sv[0] + 0.02]], WARM.slab);
        }
        // the ring of cut stones round the arch, standing a hand's breadth proud of the wall, and its outer edge
        const N = 18, zr = sd * (hw + 0.05), av = ASHLAR;
        let s0 = 0;
        for (let k = 0; k < N; k++) {
          const ta = Math.PI * k / N, tb = Math.PI * (k + 1) / N, [ia, ja] = archIn(ta), [ib, jb] = archIn(tb), [oa, pa] = archOut(ta), [ob, pb] = archOut(tb);
          const s1 = s0 + Math.hypot(ib - ia, jb - ja);
          quad(TRIM, [[ia, ja, zr], [ib, jb, zr], [ob, pb, zr], [oa, pa, zr]], [0, 0, sd], [[s0 / 2.4, av[0]], [s1 / 2.4, av[0]], [s1 / 2.4, av[0] + 0.19], [s0 / 2.4, av[0] + 0.19]]);
          const tm = (ta + tb) / 2;                                           // (its outer edge faces away from the arch's middle)
          quad(TRIM, [[oa, pa, zf], [ob, pb, zf], [ob, pb, zr], [oa, pa, zr]], [Math.cos(tm), Math.sin(tm), 0], [[s0 / 2.4, av[0]], [s1 / 2.4, av[0]], [s1 / 2.4, av[0] + 0.03], [s0 / 2.4, av[0] + 0.03]]);
          if (sd > 0) {                                                       // the vault under it, across the whole width
            quad(TRIM, [[ia, ja, -hw - 0.05], [ib, jb, -hw - 0.05], [ib, jb, hw + 0.05], [ia, ja, hw + 0.05]], [-Math.cos(tm), -Math.sin(tm), 0], [[s0 / 2.4, av[0]], [s1 / 2.4, av[0]], [s1 / 2.4, av[1]], [s0 / 2.4, av[1]]]);
          }
          s0 = s1;
        }
      }
      // the jambs under the arch's spring, and the ends (in the banks)
      for (const e of [-1, 1]) {
        const ux = e * span;
        quad(RUB, [[ux, foot, -hw], [ux, foot, hw], [ux, spring, hw], [ux, spring, -hw]], [-e, 0, 0], [rub(-hw, foot), rub(hw, foot), rub(hw, spring), rub(-hw, spring)]);
        const ue = e * L / 2, dk = deck(ue), de = dk + high;                // its end, in the bank: up to the deck across the way, up to the parapets' tops under them
        quad(RUB, [[ue, foot, -hw], [ue, foot, hw], [ue, dk, hw], [ue, dk, -hw]], [e, 0, 0], [rub(-hw, foot), rub(hw, foot), rub(hw, dk), rub(-hw, dk)]);
        for (const sd of [-1, 1]) quad(RUB, [[ue, dk, sd * inner], [ue, dk, sd * hw], [ue, de, sd * hw], [ue, de, sd * inner]], [e, 0, 0], [rub(inner, dk), rub(hw, dk), rub(hw, de), rub(inner, de)]);
        // a post of cut stone at each end of each parapet
        for (const sd of [-1, 1]) {
          const px = e * (L / 2 - 0.27), pz = sd * (hw - wall / 2), r = 0.3, y0 = deck(px) - 0.6, y1 = deck(px) + high + 0.5;      // (its outer face a little past the bridge's end, not in the same plane: they flickered)
          const rows = Math.max(1, Math.round((y1 - y0) / 0.55));               // (laid in courses of cut stone, two to a row of the sheet's strip)
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
      at(x, y, z, yaw);
      for (const [key, o] of out) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
        g.setIndex(o.i); g.applyMatrix4(root);
        if (!parts.has(key)) parts.set(key, []);
        parts.get(key).push(g);
      }
      root.identity();
    }

    function build({ look = 'kit' } = {}) {
      const group = new THREE.Group(); group.name = 'village-kit';
      let tris = 0;
      for (const [key, list] of parts) {
        if (!list.length) continue;
        const tinted = list.some(one => one.attributes.color);
        if (tinted) for (const one of list) if (!one.attributes.color) one.setAttribute('color', new THREE.BufferAttribute(new Float32Array(one.attributes.position.count * 3).fill(1), 3));
        let g = mergeGeometries(list, false);
        for (const one of list) one.dispose();
        const map = key ? pictures.get(key) : null;
        if (look === 'flat' || !map) {                                     // every face one colour: the picture's, where the face lies on it
          g = g.toNonIndexed();
          const n = g.attributes.position.count, col = new Float32Array(n * 3), uv = g.attributes.uv, px = map ? pixelsOf(key) : null, tint = g.attributes.color;
          for (let i = 0; i < n; i += 3) {
            let c = GLASS;
            if (px) {
              const u = (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3, v = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3;
              const a = Math.floor((u - Math.floor(u)) * px.n) % px.n, b = Math.floor((v - Math.floor(v)) * px.n) % px.n, o = (b * px.n + a) * 4;
              c = [px.data[o] / 255, px.data[o + 1] / 255, px.data[o + 2] / 255];
            }
            for (let k = 0; k < 3; k++) col.set(tint ? [c[0] * tint.getX(i + k), c[1] * tint.getY(i + k), c[2] * tint.getZ(i + k)] : c, (i + k) * 3);
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        } else if (!tinted) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
        const mesh = new THREE.Mesh(g, propMaterial(look === 'flat' ? null : map));
        mesh.name = 'kit:' + (key || 'glass');
        mesh.userData.dispose = () => g.dispose();
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        group.add(mesh);
      }
      group.userData = { triangles: tris, dispose() { for (const m of group.children) m.userData.dispose(); } };
      parts.clear();
      return group;
    }
    return { house, piece, bridge, build };
  }
  return { builder, names: [...pieces.keys()], dispose() { for (const list of pieces.values()) for (const p of list) p.geometry.dispose(); for (const t of pictures.values()) t.dispose(); } };
}

// the ground a house takes, eaves and doorstep included: [across, along]
export function houseFootprint({ w = 4, l = 6 } = {}) { return [w + 1.2, l + 1.2]; }
