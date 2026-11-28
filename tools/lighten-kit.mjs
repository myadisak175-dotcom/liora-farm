#!/usr/bin/env node
// Fewer triangles for the heaviest pieces of Quaternius' Medieval Village MegaKit, before tools/pack-village-kit.py packs them.
// A stone corner of the kit (Corner_Exterior_Brick) is 3,100 triangles, an iron-studded door 6,200, a round window's frame
// 350 to 420: a house with stone corners and round windows cost more than its roof and walls together. meshoptimizer's
// simplifier (MIT, github.com/zeux/meshoptimizer) takes away the triangles that change a piece's shape least, minding its
// normals and its picture's seams; it only drops vertices, never moves one.
//
//   node tools/lighten-kit.mjs <the kit's glTF folder> <a new folder>
//   python3 tools/pack-village-kit.py <the new folder> --all
//
// Every piece is copied to the new folder (and the pictures linked there); those in KEEP are made lighter on the way: KEEP
// says the share of their triangles to keep, ERROR the most a surface may move, as a share of the piece's size.
// Needs meshoptimizer: npm install meshoptimizer (in this folder or any folder above it).
import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';

const KEEP = {
  Corner_Exterior_Brick: 0.2, Corner_ExteriorWide_Brick: 0.2, DoorFrame_Flat_Brick: 0.28, DoorFrame_Round_Brick: 0.28,
  Door_2_Flat: 0.18, Door_2_Round: 0.18, Door_4_Flat: 0.5, Door_4_Round: 0.5, Door_8_Flat: 0.55, Door_8_Round: 0.55,
  Prop_MetalFence_Ornament: 0.3, Prop_MetalFence_Simple: 0.3, Balcony_Simple_Straight: 0.4, Balcony_Simple_Corner: 0.4,
  Window_Wide_Round1: 0.5, Window_Thin_Round1: 0.45, Stair_Interior_Rails: 0.3, Prop_Wagon: 0.5, Prop_Chimney: 0.5,
  Roof_Tower_RoundTiles: 0.6, Roof_Dormer_RoundTile: 0.6,
};
const ERROR = 0.012;
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.log('node tools/lighten-kit.mjs <the kit\'s glTF folder> <a new folder>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const COMP = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;                    // (simplifyWithAttributes was 'experimental' before meshoptimizer 0.23)
let before = 0, after = 0;
for (const file of fs.readdirSync(src)) {
  const from = path.join(src, file), to = path.join(out, file);
  if (!file.endsWith('.gltf')) { if (!file.endsWith('.bin') && !fs.existsSync(to)) fs.symlinkSync(path.resolve(from), to); continue; }
  const name = file.slice(0, -5), js = JSON.parse(fs.readFileSync(from, 'utf8'));
  const bins = js.buffers.map(b => fs.readFileSync(path.join(src, b.uri)));
  const read = ai => {
    const a = js.accessors[ai], v = js.bufferViews[a.bufferView], T = COMP[a.componentType], n = NC[a.type];
    if (v.byteStride && v.byteStride !== T.BYTES_PER_ELEMENT * n) throw new Error(name + ': interleaved buffers are not handled');
    const b = bins[v.buffer], off = (v.byteOffset || 0) + (a.byteOffset || 0);
    return new T(b.buffer.slice(b.byteOffset + off, b.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT));
  };
  const views = js.bufferViews.map((v, i) => ({ i, bytes: null }));
  const set = (ai, arr, count) => {
    const a = js.accessors[ai]; a.count = count; a.byteOffset = 0;
    views[a.bufferView].bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    if (a.min) {
      const n = NC[a.type], mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity);
      for (let i = 0; i < count; i++) for (let k = 0; k < n; k++) { const x = arr[i * n + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
      a.min = mn; a.max = mx;
    }
  };
  let t0 = 0, t1 = 0;
  const seen = new Set();
  for (const mesh of js.meshes) for (const p of mesh.primitives) {
    const idx = read(p.indices); t0 += idx.length / 3;
    const share = KEEP[name];
    if (!share || idx.length / 3 < 60) { t1 += idx.length / 3; continue; }
    for (const ai of [p.indices, ...Object.values(p.attributes)]) { const bv = js.accessors[ai].bufferView; if (seen.has(bv)) throw new Error(name + ': a bufferView is shared'); seen.add(bv); }
    const pos = read(p.attributes.POSITION), nrm = read(p.attributes.NORMAL), uv = p.attributes.TEXCOORD_0 !== undefined ? read(p.attributes.TEXCOORD_0) : new Float32Array(pos.length / 3 * 2);
    const nv = pos.length / 3, attrs = new Float32Array(nv * 5);
    for (let i = 0; i < nv; i++) { attrs.set(nrm.subarray(i * 3, i * 3 + 3), i * 5); attrs.set(uv.subarray(i * 2, i * 2 + 2), i * 5 + 3); }
    const target = Math.max(3, Math.floor(idx.length * share / 3) * 3);
    const [simple] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(idx), pos, 3, attrs, 5, [0.5, 0.5, 0.5, 1.0, 1.0], null, target, ERROR, []);
    const map = new Int32Array(nv).fill(-1), order = [], ni = new Uint32Array(simple.length);
    for (let i = 0; i < simple.length; i++) { let m = map[simple[i]]; if (m < 0) { m = map[simple[i]] = order.length; order.push(simple[i]); } ni[i] = m; }
    for (const ai of Object.values(p.attributes)) {
      const s = read(ai), n = NC[js.accessors[ai].type], d = new s.constructor(order.length * n);
      for (let i = 0; i < order.length; i++) for (let k = 0; k < n; k++) d[i * n + k] = s[order[i] * n + k];
      set(ai, d, order.length);
    }
    const ia = js.accessors[p.indices];
    if (order.length < 65536) { ia.componentType = 5123; set(p.indices, Uint16Array.from(ni), ni.length); } else { ia.componentType = 5125; set(p.indices, ni, ni.length); }
    t1 += ni.length / 3;
  }
  before += t0; after += t1;
  // the buffer again, view by view on 4-byte boundaries (one buffer, as the kit has it)
  const parts = []; let size = 0;
  js.bufferViews.forEach((v, i) => {
    const b = bins[v.buffer], bytes = views[i].bytes || b.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const pad = (4 - size % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); size += pad; }
    v.buffer = 0; v.byteOffset = size; v.byteLength = bytes.length; parts.push(bytes); size += bytes.length;
  });
  js.buffers = [{ uri: name + '.bin', byteLength: size }];
  fs.writeFileSync(path.join(out, name + '.bin'), Buffer.concat(parts));
  fs.writeFileSync(to, JSON.stringify(js));
  if (KEEP[name]) console.log(`${name}: ${t0} -> ${t1} triangles`);
}
console.log(`all pieces: ${before} -> ${after} triangles`);
