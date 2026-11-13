/* ==========================================================================
   village-kit.js  —  houses put together from the pieces of a modular building kit
   The pieces are Quaternius' Medieval Village MegaKit (CC0), packed into assets/models/village-kit.glb by
   tools/pack-village-kit.py: walls 2 m wide and 3 m tall, doors, windows, shutters, tiled roofs, gables, chimneys.
   One job: to stand pieces side by side into buildings and hand them back as a few merged meshes (one for each of the
   kit's pictures), drawn with the props' material so the game's three bands of light fall on them.

     const kit = await loadVillageKit();
     const b = kit.builder();
     b.house({ w: 4, l: 6, floors: 2, wall: 'plaster', door: 'front', seed: 3 }, x, y, z, yaw);     // as many as wanted
     b.piece('Prop_Wagon', x, y, z, yaw);                                                           // or single pieces (the kit's stairs and landings too)
     scene.add(b.build());                                                                          // a Group of merged meshes

   A house: w metres across (4, 6 or 8), l metres along its ridge (4 .. 14, the sizes the kit has roofs for), ridge along
   its own z, gables at +z ("front") and -z, eaves at +x and -x. y = 0 is the foot of the walls. base: 1 gives it a storey of
   plain stone wall below that, for a house that stands on a slope.
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

export async function loadVillageKit(url = new URL('./assets/models/village-kit.glb?v=2', import.meta.url).href) {
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

  function builder() {
    const parts = new Map();                                               // picture key -> geometries, already where they stand
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), root = new THREE.Matrix4();
    const put = (name, m) => {
      const prims = pieces.get(name);
      if (!prims) { console.warn('[kit] no piece', name); return; }
      for (const p of prims) { const g = p.geometry.clone().applyMatrix4(m); if (!parts.has(p.key)) parts.set(p.key, []); parts.get(p.key).push(g); }
    };
    // a piece at x, y, z (in the frame set by root), turned yaw about the vertical
    const local = (name, x, y, z, yaw = 0, sx = 1) => put(name, M.compose(new THREE.Vector3(x, y, z), Q.setFromAxisAngle(UP, yaw), new THREE.Vector3(sx, 1, 1)).premultiply(root));
    const at = (x, y, z, yaw) => root.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1));

    function house(spec, x = 0, y = 0, z = 0, yaw = 0) {
      const { w = 4, l = 6, floors = 1, wall = 'plaster', upper = 'plaster', door = 'front', doorAt = null, seed = 1, chimney = true, dormer = false, shutters = true, windows = 0.6, tower = false, base = 0 } = spec;
      const r = mulberry(seed * 7919 + 13), pick = a => a[Math.floor(r() * a.length)];
      at(x, y, z, yaw);
      const nx = w / 2, nz = l / 2, hw = w / 2, hl = l / 2;
      // the four sides: [how many walls, where wall k stands, which way it faces]
      const sides = {
        front: [nx, k => [-hw + 1 + 2 * k, hl], 0], back: [nx, k => [hw - 1 - 2 * k, -hl], Math.PI],
        right: [nz, k => [hw, hl - 1 - 2 * k], Math.PI / 2], left: [nz, k => [-hw, -hl + 1 + 2 * k], -Math.PI / 2],
      };
      // a house on a slope: `base` storeys of plain stone wall under its floor, down into the ground (no doors, no windows)
      for (let f = 1; f <= base; f++) {
        for (const [n, where, turn] of Object.values(sides)) for (let k = 0; k < n; k++) { const [px, pz] = where(k); local(WALLS.brick.plain[0], px, -f * 3, pz, turn); }
        for (const [cx, cz, turn] of [[hw, hl, 0], [-hw, hl, -Math.PI / 2], [-hw, -hl, Math.PI], [hw, -hl, Math.PI / 2]]) local('Corner_Exterior_Wood', cx, -f * 3, cz, turn);
      }
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
        local(`Roof_RoundTiles_${w}x${l}`, 0, top, 0, 0);
        local(`Roof_Front_Brick${w}`, 0, top, hl, 0); local(`Roof_Front_Brick${w}`, 0, top, -hl, Math.PI);
        // how high the roof's tiles lie above the walls' top, x metres from the ridge
        const R = ROOF_SHAPE[w], roofY = ax => R.ridge - (R.ridge - R.eave) * Math.min(1, Math.abs(ax) / R.out);
        if (chimney) { const side = r() < 0.5 ? 1 : -1, cx = hw * 0.45; local(r() < 0.5 ? 'Prop_Chimney' : 'Prop_Chimney2', side * cx, top + roofY(cx) - 1.9, (r() - 0.5) * (l - 3), side > 0 ? 0 : Math.PI); }
        if (dormer && l >= 8) { const side = r() < 0.5 ? 1 : -1, dx = hw * 0.2; local('Roof_Dormer_RoundTile', side * dx, top + roofY(dx + 1.9) - 0.15, (r() - 0.5) * (l - 5), side > 0 ? 0 : Math.PI); }
      }
      root.identity();
    }
    const piece = (name, x, y, z, yaw = 0, wide = 1) => { root.identity(); local(name, x, y, z, yaw, wide); };      // (wide: made that many times as wide, e.g. a stair for a broad way)
    const set = (name, matrix) => put(name, matrix);                       // a piece set by a matrix of the caller's own (stretched, or leaned: a wall that follows a stair)

    function build({ look = 'kit' } = {}) {
      const group = new THREE.Group(); group.name = 'village-kit';
      let tris = 0;
      for (const [key, list] of parts) {
        if (!list.length) continue;
        let g = mergeGeometries(list, false);
        for (const one of list) one.dispose();
        const map = key ? pictures.get(key) : null;
        if (look === 'flat' || !map) {                                     // every face one colour: the picture's, where the face lies on it
          g = g.toNonIndexed();
          const n = g.attributes.position.count, col = new Float32Array(n * 3), uv = g.attributes.uv, px = map ? pixelsOf(key) : null;
          for (let i = 0; i < n; i += 3) {
            let c = GLASS;
            if (px) {
              const u = (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3, v = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3;
              const a = Math.floor((u - Math.floor(u)) * px.n) % px.n, b = Math.floor((v - Math.floor(v)) * px.n) % px.n, o = (b * px.n + a) * 4;
              c = [px.data[o] / 255, px.data[o + 1] / 255, px.data[o + 2] / 255];
            }
            for (let k = 0; k < 3; k++) col.set(c, (i + k) * 3);
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        } else g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
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
    return { house, piece, set, build };
  }
  return { builder, names: [...pieces.keys()], dispose() { for (const list of pieces.values()) for (const p of list) p.geometry.dispose(); for (const t of pictures.values()) t.dispose(); } };
}

// the ground a house takes, eaves and doorstep included: [across, along]
export function houseFootprint({ w = 4, l = 6 } = {}) { return [w + 1.2, l + 1.2]; }
