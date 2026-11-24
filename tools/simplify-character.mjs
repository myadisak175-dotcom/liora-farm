#!/usr/bin/env node
// Fewer triangles for a game character model (a .glb from tools/prep-vrm1.py or tools/prep-vroid.py), by material:
// meshoptimizer's simplifier (MIT, github.com/zeux/meshoptimizer) takes away the triangles that change her shape least,
// minding her normals and her picture's seams. It only drops vertices, never moves one: every vertex left keeps its own
// place, picture and bone weights, so she still bends at the same bones.
//
// Made for hair: a VRoid-style head of hair is a hundred strands, each a ribbon cut many times along its length, and
// costs as many triangles as the rest of her (this game's first NPC: 27,000 of 52,000). Her face and eyes are left as
// they are, by default.
//
//   node tools/simplify-character.mjs IN.glb OUT.glb [--hair 0.5] [--cloth 1] [--skin 1] [--error 0.006]
//     --hair / --cloth / --skin   the share of triangles to keep, for the materials whose names hold _HAIR / _CLOTH / _SKIN
//                                 (the face's _SKIN is never touched: whatever is on the face is left alone)
//     --error                     the most a surface may move, as a share of the model's size
// Needs meshoptimizer: npm install meshoptimizer (in this folder or any folder above it).
import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf('--' + name); return i >= 0 ? +argv[i + 1] : d; };
const files = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (files.length < 2) { console.log('node tools/simplify-character.mjs IN.glb OUT.glb [--hair 0.5] [--cloth 1] [--skin 1] [--error 0.006]'); process.exit(1); }
const [src, out] = files;
const keep = { HAIR: opt('hair', 0.5), CLOTH: opt('cloth', 1), SKIN: opt('skin', 1) };
const ERROR = opt('error', 0.006);

const data = fs.readFileSync(src);
const jsonLen = data.readUInt32LE(12);
const js = JSON.parse(data.subarray(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8, binLen = data.readUInt32LE(20 + jsonLen);
const bin = data.subarray(binStart, binStart + binLen);
const COMP = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const replaced = new Map();                     // bufferView -> new bytes

function read(ai) {
  const a = js.accessors[ai], v = js.bufferViews[a.bufferView], T = COMP[a.componentType];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0), n = a.count * NC[a.type];
  if (v.byteStride && v.byteStride !== T.BYTES_PER_ELEMENT * NC[a.type]) throw new Error('interleaved buffers are not handled');
  return new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * T.BYTES_PER_ELEMENT));
}
function write(ai, arr, count) {
  const a = js.accessors[ai];
  a.count = count;
  replaced.set(a.bufferView, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  if (a.min) {                                  // (positions keep their bounds right)
    const n = NC[a.type], mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity);
    for (let i = 0; i < count; i++) for (let k = 0; k < n; k++) { const x = arr[i * n + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
    a.min = mn; a.max = mx;
  }
}

await MeshoptSimplifier.ready;
let before = 0, after = 0;
const shared = new Map();                       // a bufferView may only be rewritten once: refuse if two primitives share one
for (const mesh of js.meshes) for (const p of mesh.primitives) {
  const name = js.materials[p.material].name || '';
  const kind = /_HAIR/.test(name) ? 'HAIR' : /_CLOTH/.test(name) ? 'CLOTH' : /_SKIN/.test(name) && !/Face/.test(name) ? 'SKIN' : null;
  const idx = read(p.indices);
  before += idx.length / 3;
  if (!kind || keep[kind] >= 1) { after += idx.length / 3; continue; }
  for (const ai of [p.indices, ...Object.values(p.attributes)]) {
    const bv = js.accessors[ai].bufferView;
    if (shared.has(bv)) throw new Error(`bufferView ${bv} is shared between primitives`);
    shared.set(bv, true);
  }
  const pos = read(p.attributes.POSITION), nrm = read(p.attributes.NORMAL), uv = read(p.attributes.TEXCOORD_0);
  const nv = pos.length / 3;
  const attrs = new Float32Array(nv * 5);
  for (let i = 0; i < nv; i++) { attrs.set(nrm.subarray(i * 3, i * 3 + 3), i * 5); attrs.set(uv.subarray(i * 2, i * 2 + 2), i * 5 + 3); }
  const target = Math.floor(idx.length * keep[kind] / 3) * 3;
  const [simple, err] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(idx), pos, 3, attrs, 5, [0.6, 0.6, 0.6, 1.5, 1.5], null, target, ERROR, []);
  // only the vertices still used, in the order they are first used
  const map = new Int32Array(nv).fill(-1), order = [];
  const ni = new Uint32Array(simple.length);
  for (let i = 0; i < simple.length; i++) { let m = map[simple[i]]; if (m < 0) { m = map[simple[i]] = order.length; order.push(simple[i]); } ni[i] = m; }
  for (const [key, ai] of Object.entries(p.attributes)) {
    const src = read(ai), n = NC[js.accessors[ai].type], dst = new src.constructor(order.length * n);
    for (let i = 0; i < order.length; i++) for (let k = 0; k < n; k++) dst[i * n + k] = src[order[i] * n + k];
    write(ai, dst, order.length);
  }
  const big = order.length > 65535;
  if (!big && js.accessors[p.indices].componentType === 5125) js.accessors[p.indices].componentType = 5123;
  write(p.indices, big ? ni : Uint16Array.from(ni), ni.length);
  after += ni.length / 3;
  console.log(`${name}: ${idx.length / 3} -> ${ni.length / 3} triangles, ${nv} -> ${order.length} vertices (error ${(err * 100).toFixed(2)}% of her size)`);
}

// the buffer again, view by view, each on a 4-byte boundary
const parts = []; let size = 0;
js.bufferViews.forEach((v, i) => {
  const bytes = replaced.get(i) || bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const pad = (4 - size % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); size += pad; }
  v.byteOffset = size; v.byteLength = bytes.length; parts.push(bytes); size += bytes.length;
});
const pad = (4 - size % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); size += pad; }
js.buffers = [{ byteLength: size }];
js.asset.extras = { ...(js.asset.extras || {}), simplified: { ...keep, error: ERROR } };
let jb = Buffer.from(JSON.stringify(js));
jb = Buffer.concat([jb, Buffer.alloc((4 - jb.length % 4) % 4, 0x20)]);
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + size, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jb.length, 0); jh.write('JSON', 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(size, 0); bh.write('BIN\0', 4);
fs.writeFileSync(out, Buffer.concat([head, jh, jb, bh, ...parts]));
console.log(`${out}: ${(fs.statSync(out).size / 1e6).toFixed(2)} MB, ${before} -> ${after} triangles`);
