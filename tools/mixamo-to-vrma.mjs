#!/usr/bin/env node
// mixamo-to-vrma.mjs: a Mixamo FBX clip (any Mixamo character, "With Skin" or "Without Skin") -> a .vrma on the animation
// library's skeleton, made the way the library's own clips are: turns of the bones away from T-pose (identity rest
// rotations), facing +Z, 30 frames a second, the hips' place in the library skeleton's lengths. tools/bake-character-anim.py
// and tools/vrma_pose.py read it like any library clip. It also takes Kevin Iglesias' humanoid rig (his animation packs:
// bones named B-hips, B-upperArmL, ...; no upper chest, which is then left straight), told apart by its bone names.
//
// The retarget is three-vrm's for Mixamo (loadMixamoAnimation): Mixamo's rig stands in T-pose too, so each bone's turn in
// the world away from its rest is the same turn on any T-pose skeleton. Each frame: D(bone) = world(t) * world(rest)^-1,
// and the bone's turn from its parent on the library skeleton is D(parent)^-1 * D(bone). The hips' path is scaled by the
// library's hips height over Mixamo's.
//
// The clip keeps its root motion (where the hips go over the ground), as Mixamo made it with "In Place" off: a tool that
// makes a game clip from it (tools/make-vault-anim.py) takes that out.
//
// Mixamo's clips are free to use in a game but not to hand on as files of their own, so they are not kept in
// assets/animations/vrma (that library is CC0): write them somewhere of your own.
//
// Everything is measured in the rig's own space (that of the group the skeleton hangs from), not the world's: a file that
// turns that group (Kevin Iglesias' are Z-up, their "Rig" group turned one way at rest and the other way in the clip)
// comes out the same as one that does not.
//
// Usage (needs Node 18+ and three: `npm install --no-save three@0.187.0` in the repo folder, once; three 0.170's FBX
// loader cannot read Kevin Iglesias' files):
//   node tools/mixamo-to-vrma.mjs OUT_DIR path/to/Clip.fbx [more.fbx ...]
// writes OUT_DIR/Clip.vrma for each.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, '..', 'assets', 'animations', 'vrma', 'Idle_Loop.vrma');
const FPS = 30;

// library bone (VRM 1.0 humanoid name) -> the rig's bone. Mixamo's (without its "mixamorig" prefix):
const MIXAMO = { hips: 'Hips', spine: 'Spine', chest: 'Spine1', upperChest: 'Spine2', neck: 'Neck', head: 'Head' };
for (const [side, s] of [['left', 'Left'], ['right', 'Right']]) {
  Object.assign(MIXAMO, {
    [`${side}Shoulder`]: `${s}Shoulder`, [`${side}UpperArm`]: `${s}Arm`, [`${side}LowerArm`]: `${s}ForeArm`, [`${side}Hand`]: `${s}Hand`,
    [`${side}UpperLeg`]: `${s}UpLeg`, [`${side}LowerLeg`]: `${s}Leg`, [`${side}Foot`]: `${s}Foot`, [`${side}Toes`]: `${s}ToeBase`,
    [`${side}ThumbMetacarpal`]: `${s}HandThumb1`, [`${side}ThumbProximal`]: `${s}HandThumb2`, [`${side}ThumbDistal`]: `${s}HandThumb3`,
  });
  for (const [f, m] of [['Index', 'Index'], ['Middle', 'Middle'], ['Ring', 'Ring'], ['Little', 'Pinky']])
    ['Proximal', 'Intermediate', 'Distal'].forEach((j, i) => { MIXAMO[`${side}${f}${j}`] = `${s}Hand${m}${i + 1}`; });
}
// Kevin Iglesias' (no upper chest: the library's is left straight, its turn its parent's)
const IGLESIAS = { hips: 'B-hips', spine: 'B-spine', chest: 'B-chest', neck: 'B-neck', head: 'B-head' };
for (const [side, s] of [['left', 'L'], ['right', 'R']]) {
  Object.assign(IGLESIAS, {
    [`${side}Shoulder`]: `B-shoulder${s}`, [`${side}UpperArm`]: `B-upperArm${s}`, [`${side}LowerArm`]: `B-forearm${s}`, [`${side}Hand`]: `B-hand${s}`,
    [`${side}UpperLeg`]: `B-thigh${s}`, [`${side}LowerLeg`]: `B-shin${s}`, [`${side}Foot`]: `B-foot${s}`, [`${side}Toes`]: `B-toe${s}`,
    [`${side}ThumbMetacarpal`]: `B-thumb01${s}`, [`${side}ThumbProximal`]: `B-thumb02${s}`, [`${side}ThumbDistal`]: `B-thumb03${s}`,
  });
  for (const [f, m] of [['Index', 'indexFinger'], ['Middle', 'middleFinger'], ['Ring', 'ringFinger'], ['Little', 'pinky']])
    ['Proximal', 'Intermediate', 'Distal'].forEach((j, i) => { IGLESIAS[`${side}${f}${j}`] = `B-${m}0${i + 1}${s}`; });
}

function readGlb(file) {
  const b = fs.readFileSync(file);
  let off = 12, js = null, bin = null;
  while (off < b.length) {
    const n = b.readUInt32LE(off), kind = b.toString('latin1', off + 4, off + 8);
    if (kind === 'JSON') js = JSON.parse(b.toString('utf8', off + 8, off + 8 + n));
    else if (kind === 'BIN\0') bin = b.subarray(off + 8, off + 8 + n);
    off += 8 + n;
  }
  return { js, bin };
}

function writeVrma(file, tpl, times, rot, hips, name) {
  const blobs = [], views = [], accessors = [];
  let length = 0;
  const add = (arr, width, type, minmax) => {
    const data = Buffer.from(new Float32Array(arr).buffer);
    views.push({ buffer: 0, byteOffset: length, byteLength: data.length });
    blobs.push(data); length += data.length;
    const acc = { bufferView: views.length - 1, componentType: 5126, count: arr.length / width, type };
    if (minmax) { acc.min = [Math.min(...arr)]; acc.max = [Math.max(...arr)]; }
    accessors.push(acc);
    return accessors.length - 1;
  };
  const t = add(times, 1, 'SCALAR', true), samplers = [], channels = [];
  const human = tpl.js.extensions.VRMC_vrm_animation.humanoid.humanBones;
  for (const [bone, { node }] of Object.entries(human)) {
    samplers.push({ input: t, output: add(rot[bone], 4, 'VEC4'), interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node, path: 'rotation' } });
  }
  samplers.push({ input: t, output: add(hips, 3, 'VEC3'), interpolation: 'LINEAR' });
  channels.push({ sampler: samplers.length - 1, target: { node: human.hips.node, path: 'translation' } });
  let bin = Buffer.concat(blobs);
  const js = {
    asset: { version: '2.0', generator: 'liora-farm tools/mixamo-to-vrma.mjs' },
    extensionsUsed: ['VRMC_vrm_animation'], extensions: tpl.js.extensions,
    scene: 0, scenes: tpl.js.scenes, nodes: tpl.js.nodes,
    animations: [{ name, samplers, channels }], accessors, bufferViews: views, buffers: [{ byteLength: bin.length }],
  };
  let jb = Buffer.from(JSON.stringify(js));
  jb = Buffer.concat([jb, Buffer.alloc((4 - jb.length % 4) % 4, 0x20)]);
  bin = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const head = Buffer.alloc(12); head.write('glTF', 0, 'latin1'); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + bin.length, 8);
  const ch = (n, kind) => { const h = Buffer.alloc(8); h.writeUInt32LE(n, 0); h.write(kind, 4, 'latin1'); return h; };
  fs.writeFileSync(file, Buffer.concat([head, ch(jb.length, 'JSON'), jb, ch(bin.length, 'BIN\0'), bin]));
}

function convert(fbxFile, outDir, tpl) {
  const b = fs.readFileSync(fbxFile);
  const root = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  const clip = root.animations[0];
  if (!clip) throw new Error(`${fbxFile}: no animation`);
  const byName = {};
  root.traverse(o => { if (o.isBone || o.type === 'Bone' || o.isObject3D) byName[o.name.replace(/^mixamorig\d*:?/, '')] = o; });
  const MAP = byName['B-hips'] ? IGLESIAS : MIXAMO;
  for (const m of Object.values(MAP)) if (!byName[m]) throw new Error(`${fbxFile}: no bone ${m}`);
  // the rig's own space: the group its skeleton hangs from (its topmost bone's parent)
  let top = byName[MAP.hips];
  while (top.parent && (top.parent.isBone || top.parent.type === 'Bone')) top = top.parent;
  const space = top.parent;
  const spaceQ = new THREE.Quaternion(), spaceInv = new THREE.Matrix4();
  const inSpace = () => {      // (identity for a rig whose group is not turned: Mixamo's files come out as they did)
    space.getWorldQuaternion(spaceQ);
    if (Math.abs(spaceQ.w) > 1 - 1e-12) { spaceQ.identity(); spaceInv.identity(); return; }
    spaceQ.invert(); spaceInv.copy(space.matrixWorld).invert();
  };
  const turnOf = m => spaceQ.clone().multiply(byName[m].getWorldQuaternion(new THREE.Quaternion()));
  const placeOf = m => byName[m].getWorldPosition(new THREE.Vector3()).applyMatrix4(spaceInv);
  // the library skeleton: each bone's parent, and its hips height
  const human = tpl.js.extensions.VRMC_vrm_animation.humanoid.humanBones, nodes = tpl.js.nodes;
  const boneOf = Object.fromEntries(Object.entries(human).map(([b, { node }]) => [node, b])), parent = {};
  nodes.forEach((n, i) => (n.children || []).forEach(c => { if (boneOf[c] && boneOf[i]) parent[boneOf[c]] = boneOf[i]; }));
  const libHips = nodes[human.hips.node].translation[1];
  const order = [], seen = new Set();                                  // the library's bones, parents first
  const visit = b => { if (seen.has(b)) return; if (parent[b]) visit(parent[b]); seen.add(b); order.push(b); };
  Object.keys(human).forEach(visit);
  const isBelow = (b, a) => { for (let x = parent[b]; x; x = parent[x]) if (x === a) return true; return false; };
  const between = order.filter(b => !MAP[b] && parent[b] && Object.keys(MAP).some(x => isBelow(x, b)));
  // Mixamo at rest (as the FBX has it, before any frame is played): each bone's turn in the world, the hips' height
  root.updateMatrixWorld(true);
  inSpace();
  const restInv = {}, p = new THREE.Vector3();
  for (const [bone, m] of Object.entries(MAP)) restInv[bone] = turnOf(m).invert();
  // A file not made by Mixamo itself (one for a Mixamo skeleton from elsewhere, e.g. RapaMotion's) may rest with its arms
  // down, not in T-pose: then every turn above would be off by as much (her arms out level when the move has them down).
  // It is stood in T-pose first: each bone swung, parents first, to point where the library's T-pose has it, its own
  // twist about its length kept. A file already in T-pose (Mixamo's) is left as it is.
  const armDir = placeOf(MAP.leftHand).sub(placeOf(MAP.leftUpperArm)).normalize();
  if (armDir.x < 0.97) {
    const CHILD = { hips: 'spine', spine: 'chest', chest: 'upperChest', upperChest: 'neck', neck: 'head' };
    for (const sd of ['left', 'right']) {
      Object.assign(CHILD, { [sd + 'Shoulder']: sd + 'UpperArm', [sd + 'UpperArm']: sd + 'LowerArm', [sd + 'LowerArm']: sd + 'Hand',
        [sd + 'Hand']: sd + 'MiddleProximal', [sd + 'UpperLeg']: sd + 'LowerLeg', [sd + 'LowerLeg']: sd + 'Foot', [sd + 'Foot']: sd + 'Toes',
        [sd + 'ThumbMetacarpal']: sd + 'ThumbProximal', [sd + 'ThumbProximal']: sd + 'ThumbDistal' });
      for (const f of ['Index', 'Middle', 'Ring', 'Little'])
        Object.assign(CHILD, { [sd + f + 'Proximal']: sd + f + 'Intermediate', [sd + f + 'Intermediate']: sd + f + 'Distal' });
    }
    const S = {}, at = placeOf;
    const mapped = b => { while (b && !MAP[b]) b = parent[b]; return b; };      // (a bone the rig has not: its parent's)
    for (const b of order.filter(x => MAP[x])) {
      const pb = mapped(parent[b]);
      const Sp = pb && S[pb] ? S[pb].clone() : new THREE.Quaternion();
      let c = CHILD[b];
      const want = new THREE.Vector3();
      while (c && !MAP[c] && nodes[human[c].node].translation) { want.add(new THREE.Vector3(...nodes[human[c].node].translation)); c = CHILD[c]; }
      if (c && MAP[c] && byName[MAP[c]] && nodes[human[c].node].translation) {
        const now = at(MAP[c]).sub(at(MAP[b])).applyQuaternion(Sp).normalize();
        want.add(new THREE.Vector3(...nodes[human[c].node].translation)).normalize();
        S[b] = new THREE.Quaternion().setFromUnitVectors(now, want).multiply(Sp);
      } else S[b] = Sp;
      restInv[b] = S[b].clone().multiply(turnOf(MAP[b])).invert();
    }
    console.log(`${path.basename(fbxFile)}: rests with its arms ${(Math.acos(Math.min(1, armDir.x)) * 180 / Math.PI).toFixed(0)} degrees from T-pose: stood in T-pose first`);
  }
  const mixHips = placeOf(MAP.hips).y;
  const scale = libHips / mixHips;
  // every frame
  const mixer = new THREE.AnimationMixer(root), action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  const frames = Math.round(clip.duration * FPS) + 1, times = [], rot = {}, hips = [], D = {};
  for (const bone in human) rot[bone] = [];
  for (let f = 0; f < frames; f++) {
    const t = Math.min(f / FPS, clip.duration);
    mixer.setTime(t);
    root.updateMatrixWorld(true);
    inSpace();
    times.push(t);
    for (const [bone, m] of Object.entries(MAP)) D[bone] = turnOf(m).multiply(restInv[bone]);
    for (const bone of between) D[bone] = D[parent[bone]];          // (a bone the rig has not, between two it has: straight)
    for (const bone in human) {
      const q = D[bone] ? (parent[bone] && D[parent[bone]] ? D[parent[bone]].clone().invert().multiply(D[bone]) : D[bone].clone()) : new THREE.Quaternion();
      const prev = rot[bone].length ? rot[bone].slice(-4) : null;
      if (prev && prev[0] * q.x + prev[1] * q.y + prev[2] * q.z + prev[3] * q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);      // no flips between frames
      rot[bone].push(q.x, q.y, q.z, q.w);
    }
    p.copy(placeOf(MAP.hips));
    hips.push(p.x * scale, p.y * scale, p.z * scale);
  }
  const name = path.basename(fbxFile).replace(/\.fbx$/i, '');
  const out = path.join(outDir, `${name}.vrma`);
  writeVrma(out, tpl, times, rot, hips, name);
  console.log(`${name}: ${clip.duration.toFixed(2)} s, ${frames} frames, ${MAP === IGLESIAS ? 'Iglesias' : 'Mixamo'} hips ${mixHips.toFixed(1)} -> ${libHips.toFixed(3)} (x${scale.toFixed(4)}) -> ${out}`);
}

const [outDir, ...files] = process.argv.slice(2);
if (!outDir || !files.length) { console.log('usage: node tools/mixamo-to-vrma.mjs OUT_DIR Clip.fbx [more.fbx ...]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const tpl = readGlb(TEMPLATE);
for (const f of files) convert(f, outDir, tpl);
