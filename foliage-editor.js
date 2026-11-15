// foliage-editor.js  —  arrange a map's plants by hand, in the map itself, on a phone or with a mouse.
//
// One job: the last pass over the foliage. The map's tool plants it by rules; walking round, a tree is found too near a
// window, a bed of flowers would look better by the gate, a corner wants one more bush: here it is done by hand.
//
//   the camera     flies free of her: one finger turns round what it looks at, two fingers move it and come nearer or go back
//                  (the mouse wheel too)
//   a plant        tap it to pick it (a tree, a bush, a flowering clump, a bed of flowers; ferns and tufts of grass are picked
//                  a colony at a time); drag it to move it; the sliders size it and turn it; ◀ ▶ another shape of its kind;
//                  🎲 a shape, a size and a turn by the dice; a tree may be made another kind of tree, a clump or a bed another
//                  colour, a colony ferns or tufts; ⧉ one more like it; 🗑 out
//   ทั้งกลุ่ม       the whole group it was planted in: moved, turned, copied or taken out as one
//   ＋ เพิ่ม        a new plant of the kind chosen, where you tap the ground
//   ↶ ย้อน         back one change
//   💾 บันทึก      keep it (in this browser) and load the map again: her way round the trees, the bare ground at their feet
//                  and their shadows are worked out again for where they now stand (until then only the plants themselves move)
//   ⋯              what was changed as text, to send to Claude to put into the map for everyone, or to paste back in; back to
//                  the map's own foliage
//
// Works on a level that offers level.foliageEdit (hill-village-level.js): it makes rows into the scene; nothing here knows how
// a plant is drawn. The arrangement as data, and what its rows hold: foliage-edits.js.
//
//   const editor = createFoliageEditor({ level, camera, player });   // null on a map without it
//   editor.open();                          editor.active is true while it is open
//   each frame, after the player has set the camera:  if (editor.active) editor.apply(camera);
//   editor.focus: where the camera is looking (for the grass to grow round, instead of round her)

import * as THREE from 'three';
import { keepFoliage, dropFoliage, foliageEdits, foliageFromEdits } from './foliage-edits.js';

const RESUME_KEY = 'liora.foliageEditor.resume';
const NAME = { oak: 'ต้นโอ๊ก', broadleaf: 'ต้นใบกว้าง', birch: 'ต้นเบิร์ช', sapling: 'ต้นอ่อน', pine: 'ต้นสน', bush: 'พุ่มไม้', clump: 'กอดอกไม้', flower: 'แปลงดอกไม้', fern: 'กลุ่มเฟิร์น', tuft: 'กลุ่มกอหญ้า' };
const COLOUR = { pink: 'ดอกชมพู', white: 'ดอกขาว', yellow: 'ดอกเหลือง', lilac: 'ดอกม่วง', blue: 'ดอกฟ้า' };
const TREES = ['oak', 'broadleaf', 'birch', 'sapling', 'pine'];
// each kind: how tall it stands and how far it reaches on the ground (metres at size 1: for picking it and marking it), its
// sizes (the slider's least and most, and between which two the dice throw), the colours it may have
const KINDS = {
  oak: { h: 8.5, r: 2.4, size: [0.4, 1.6, 0.74, 1.09] }, broadleaf: { h: 7.5, r: 2.0, size: [0.4, 1.6, 0.7, 1.0] }, birch: { h: 8, r: 1.3, size: [0.4, 1.6, 0.78, 1.04] },
  sapling: { h: 3.2, r: 1.0, size: [0.4, 1.8, 0.74, 1.09] }, pine: { h: 10, r: 1.4, size: [0.4, 1.5, 0.74, 0.91] },
  bush: { h: 1.0, r: 0.6, size: [0.4, 1.8, 0.75, 1.15] },
  clump: { h: 0.6, r: 0.45, size: [0.3, 1.2, 0.5, 0.74], colours: ['pink', 'white', 'yellow', 'lilac', 'blue'] },
  flower: { h: 0.3, r: 1.2, size: [0.7, 2.6, 1.0, 1.7], colours: ['pink', 'yellow', 'blue'], flat: true },
  fern: { h: 0.5, r: 0.8, size: [0.5, 1.8, 0.85, 1.2], flat: true }, tuft: { h: 0.7, r: 0.8, size: [0.5, 1.8, 0.85, 1.2], flat: true },
};
const ADDABLE = ['oak', 'broadleaf', 'birch', 'sapling', 'pine', 'bush', 'clump', 'flower', 'fern', 'tuft'];
const CSS = `
#foliageEditor { position:fixed; inset:0; z-index:60; touch-action:none; user-select:none; -webkit-user-select:none; font:600 13px system-ui, sans-serif; color:#16324a; pointer-events:none; }
#foliageEditor canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:auto; touch-action:none; }
#foliageEditor .bar { position:absolute; left:0; right:0; display:flex; flex-direction:column; gap:6px; padding:8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left)); pointer-events:none; }
#foliageEditor .head { top:env(safe-area-inset-top); }
#foliageEditor .foot { bottom:env(safe-area-inset-bottom); align-items:center; }
#foliageEditor .row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
#foliageEditor .grow { flex:1; }
#foliageEditor button { pointer-events:auto; border:1px solid #ffffffaa; border-radius:999px; padding:9px 12px; background:#ffffffee; color:#16324a; font:inherit; touch-action:manipulation; box-shadow:0 1px 4px #0003; }
#foliageEditor button.go { background:#18a058; color:#fff; }
#foliageEditor button.on { background:#1f6fd0; color:#fff; }
#foliageEditor button.warn { background:#fff0f0; color:#b3261e; }
#foliageEditor .hint { align-self:center; max-width:94%; padding:6px 12px; border-radius:12px; background:#10243acc; color:#fff; font-weight:500; text-align:center; }
#foliageEditor .panel { pointer-events:auto; width:min(100%, 460px); padding:10px 12px; border-radius:16px; background:#fffffff0; box-shadow:0 4px 18px #0004; display:flex; flex-direction:column; gap:6px; }
#foliageEditor .panel .name { font-weight:700; flex:1; }
#foliageEditor .panel .ok { color:#18794e; font-weight:500; }
#foliageEditor .panel label { display:grid; grid-template-columns:56px 1fr 48px; align-items:center; gap:8px; font-weight:500; }
#foliageEditor .panel label span:last-child { text-align:right; font-variant-numeric:tabular-nums; color:#5a6a7a; }
#foliageEditor input[type=range] { width:100%; height:28px; margin:0; accent-color:#1f6fd0; touch-action:pan-x; }
#foliageEditor .sheet { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(92%, 380px); max-height:80%; overflow:auto; padding:14px; border-radius:16px; background:#fffffffa; box-shadow:0 8px 30px #0006; display:flex; flex-wrap:wrap; gap:8px; justify-content:center; pointer-events:auto; }
#foliageEditor .sheet p { width:100%; margin:0 0 4px; text-align:center; font-weight:500; }
#foliageEditor .sheet textarea { width:100%; height:120px; font:12px monospace; }
body.foliageEditing > :not(#foliageEditor):not(canvas):not(script):not(style) { visibility:hidden !important; }
#foliageEditBtn { position:fixed; left:max(10px,env(safe-area-inset-left)); top:calc(164px + env(safe-area-inset-top)); z-index:4; border:1px solid #ffffff88; border-radius:999px; padding:9px 14px; background:#2f8f4edc; color:#fff; font:600 13px system-ui, sans-serif; box-shadow:0 2px 8px #0004; touch-action:manipulation; }
`;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const between = (a, b) => a + Math.random() * (b - a);

// ---- the rows of a map's foliage <-> the things picked and moved here. A plant, a clump or a bed is one row; the ferns and
// tufts of one colony are one thing (its middle, and each of its plants by how far it stands from that)
function itemsOf(rows, src) {
  const items = [], at = (n, i) => (src ? src[n][i] : -1);
  rows.plants.forEach(([kind, x, z, size, fifth, group = 0, turn = 0, shape = 1], i) => items.push({ list: 'plants', kind, x, z, size, fifth, group, turn, shape, src: at('plants', i) }));
  rows.clumps.forEach(([x, z, size, fifth, group = 0, turn = 0, shape = 1], i) => items.push({ list: 'clumps', kind: 'clump', x, z, size, fifth, group, turn, shape, src: at('clumps', i) }));
  const colonies = new Map();
  rows.cover.forEach(([kind, x, z, size, colony = 0], i) => { if (!colonies.has(colony)) colonies.set(colony, []); colonies.get(colony).push({ kind, x, z, size, src: at('cover', i) }); });
  for (const [colony, list] of colonies) {
    const x = list.reduce((s, p) => s + p.x, 0) / list.length, z = list.reduce((s, p) => s + p.z, 0) / list.length;
    items.push({ list: 'cover', kind: list[0].kind, x, z, colony, parts: list.map(p => ({ kind: p.kind, dx: p.x - x, dz: p.z - z, size: p.size, src: p.src })) });
  }
  return items;
}
function rowsOf(items) {
  const rows = { plants: [], clumps: [], cover: [] }, src = { plants: [], clumps: [], cover: [] };
  for (const it of items) {
    if (it.list === 'plants') { rows.plants.push([it.kind, r2(it.x), r2(it.z), r2(it.size), it.fifth, it.group, r1(it.turn), it.shape]); src.plants.push(it.src); }
    else if (it.list === 'clumps') { rows.clumps.push([r2(it.x), r2(it.z), r2(it.size), it.fifth, it.group, r1(it.turn), it.shape]); src.clumps.push(it.src); }
    else for (const p of it.parts) { rows.cover.push([p.kind, r2(it.x + p.dx), r2(it.z + p.dz), r2(p.size), it.colony]); src.cover.push(p.src); }
  }
  return { rows, src };
}
// a new colony's plants: some eight to twelve, spread along one way, the biggest in the middle
function colonyParts(kind) {
  const parts = [], n = 7 + Math.floor(Math.random() * 6), a = Math.random() * Math.PI, c = Math.cos(a), s = Math.sin(a), la = between(1.4, 2.2), lc = between(0.7, 1.1);
  const bell = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.9;
  for (let tries = 0; parts.length < n && tries < n * 12; tries++) {
    const u = bell(), v = bell(), far = Math.hypot(u, v), dx = c * u * la - s * v * lc, dz = s * u * la + c * v * lc, size = (1.35 - 0.6 * Math.min(1, far / 1.1)) * between(0.9, 1.1);
    if (parts.every(p => Math.hypot(p.dx - dx, p.dz - dz) > 0.32 * (p.size + size))) parts.push({ kind, dx, dz, size, src: -1 });
  }
  return parts;
}

export function createFoliageEditor({ level, camera, player = null }) {
  const R = level.foliageEdit;
  if (!R) return null;
  if (!document.getElementById('foliageEditorCss')) { const st = document.createElement('style'); st.id = 'foliageEditorCss'; st.textContent = CSS; document.head.append(st); }
  const H = R.heightAt;

  // ---- what is being edited. `items` is never changed in place: a changed thing is a new object, so an earlier list is
  // still what it was (that is all "back one change" needs)
  let items = [], history = [], sheet = null, active = false, kept = '', adding = null;
  let sel = null;       // what is picked up: { ids (which of items), holder (its own small scene), px, pz (where that stands), mx, mz, turn, scale (moved, turned and sized since, not yet set down) }
  const picked = () => (sel ? sel.ids.map(i => items[i]) : []);
  const one = () => (sel && sel.ids.length === 1 ? items[sel.ids[0]] : null);
  const reach = it => (it.list === 'cover' ? Math.max(...it.parts.map(p => Math.hypot(p.dx, p.dz))) + 0.6 : KINDS[it.kind].r * it.size);
  const dirtyOf = (list, into = { groves: new Set(), squares: new Set() }) => {      // which groves and squares of the scene these stand in
    for (const it of list) {
      if (it.list === 'cover') for (const p of it.parts) into.squares.add(R.squareOf(it.x + p.dx, it.z + p.dz)); else into.groves.add(R.groveOf(it.x, it.z));
    }
    return into;
  };
  const changed = () => JSON.stringify(rowsOf(items).rows) !== kept;
  const middle = list => [list.reduce((s, it) => s + it.x, 0) / list.length, list.reduce((s, it) => s + it.z, 0) / list.length];

  // picking up and setting down. What is picked up leaves the scene's groves and stands in a small scene of its own (the
  // level's "sprig"), which is moved, turned and sized as a whole; set down, it is planted in the groves again
  const sprig = () => {
    if (sel.holder) R.drop(sel.holder);
    const [px, pz] = middle(picked());
    Object.assign(sel, { px, pz, mx: 0, mz: 0, turn: 0, scale: 1, holder: R.sprig(rowsOf(picked()).rows, px, pz) });
  };
  const hold = ids => {
    if (!ids.length) return;
    R.plant(rowsOf(items.filter((_, i) => !ids.includes(i))).rows, dirtyOf(ids.map(i => items[i])));
    sel = { ids, holder: null }; sprig();
  };
  const carried = () => sel && (sel.mx || sel.mz || sel.turn || sel.scale !== 1);
  const pose = () => {                                                       // the small scene where the finger and the sliders have it
    const x = sel.px + sel.mx, z = sel.pz + sel.mz;
    sel.holder.position.set(x, H(x, z) - H(sel.px, sel.pz), z); sel.holder.rotation.y = sel.turn; sel.holder.scale.setScalar(sel.scale);
  };
  const settle = () => {                                                     // what was carried is where it now stands: each thing's own place, turn and size
    if (!carried()) return;
    const c = Math.cos(sel.turn), s = Math.sin(sel.turn), k = sel.scale, deg = sel.turn * 180 / Math.PI;
    const turned = (dx, dz) => [(dx * c + dz * s) * k, (-dx * s + dz * c) * k];
    for (const i of sel.ids) {
      const it = items[i], [dx, dz] = turned(it.x - sel.px, it.z - sel.pz), x = sel.px + sel.mx + dx, z = sel.pz + sel.mz + dz;
      if (it.list === 'cover') items[i] = { ...it, x, z, parts: it.parts.map(p => { const [qx, qz] = turned(p.dx, p.dz); return { ...p, dx: qx, dz: qz, size: p.size * k }; }) };
      else items[i] = { ...it, x, z, turn: (((it.turn + deg) % 360) + 360) % 360, size: it.size * k };
    }
    sprig();
  };
  const release = () => {
    if (!sel) return;
    settle(); R.drop(sel.holder);
    R.plant(rowsOf(items).rows, dirtyOf(picked()));
    sel = null;
  };
  const remember = () => { if (sel) settle(); history.push({ items: items.slice(), ids: sel ? sel.ids.slice() : null }); if (history.length > 60) history.shift(); };
  const restore = (list, words) => {                                         // another list altogether: the scene built again where the two differ
    const was = new Set(items), now = new Set(list), dirty = dirtyOf([...picked(), ...items.filter(it => !now.has(it)), ...list.filter(it => !was.has(it))]);
    if (sel) { R.drop(sel.holder); sel = null; }
    items = list; R.plant(rowsOf(items).rows, dirty); panel(); say(words);
  };
  const undo = () => { const h = history.pop(); if (!h) return say('ไม่มีอะไรให้ย้อนแล้ว'); restore(h.items, 'ย้อนแล้ว'); };
  const change = (i, patch) => { items = items.slice(); items[i] = { ...items[i], ...patch }; };

  // ---- the camera: it looks at a point on the ground, from a way off and a height
  const cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0.55, dist: 22 };
  const focus = new THREE.Vector3();
  const D = new THREE.Vector3(), Rt = new THREE.Vector3(), Fw = new THREE.Vector3();
  const place = () => {
    cam.pitch = Math.min(1.45, Math.max(0.08, cam.pitch)); cam.dist = Math.min(120, Math.max(3, cam.dist));
    const cp = Math.cos(cam.pitch);
    D.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    camera.up.set(0, 1, 0);
    camera.position.set(cam.x, cam.y, cam.z).addScaledVector(D, cam.dist);
    const floor = H(camera.position.x, camera.position.z) + 0.6;            // never under the ground
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(cam.x, cam.y, cam.z);
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    focus.set(cam.x, cam.y, cam.z);
  };
  const lookFrom = () => {                                                   // start where the game's camera is, looking at her
    const p = player ? player.position : new THREE.Vector3();
    cam.x = p.x; cam.z = p.z; cam.y = H(p.x, p.z) + 1;
    const c = camera.position, dx = c.x - cam.x, dz = c.z - cam.z, dy = c.y - cam.y;
    cam.yaw = Math.atan2(dx, dz); cam.dist = Math.max(16, Math.hypot(dx, dy, dz) * 2.2); cam.pitch = Math.max(0.6, Math.atan2(dy, Math.hypot(dx, dz)));
  };

  // ---- the page
  const root = document.createElement('div'); root.id = 'foliageEditor';
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const head = document.createElement('div'); head.className = 'bar head';
  const foot = document.createElement('div'); foot.className = 'bar foot';
  const hint = document.createElement('div'); hint.className = 'hint';
  root.append(cv, head, foot);
  const row = kids => { const r = document.createElement('div'); r.className = 'row'; r.append(...kids); return r; };
  const gap = () => Object.assign(document.createElement('span'), { className: 'grow' });
  const btn = (label, fn, cls = '') => {
    const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls;
    b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); fn(); };
    return b;
  };
  const stop = el => { for (const t of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) el.addEventListener(t, e => e.stopPropagation()); return el; };
  const closeSheet = () => { if (sheet) { sheet.remove(); sheet = null; } };
  const openSheet = (title, kids) => {
    closeSheet();
    sheet = stop(document.createElement('div')); sheet.className = 'sheet';
    const p = document.createElement('p'); p.textContent = title;
    sheet.append(p, ...kids, btn('ปิด', closeSheet));
    root.append(sheet);
  };
  let W = 1, Hh = 1;
  const fit = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = root.clientWidth || innerWidth; Hh = root.clientHeight || innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // ---- what is under a finger
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3(), v3 = new THREE.Vector3();
  const aim = (sx, sy) => { ndc.set(sx / W * 2 - 1, -(sy / Hh) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray; };
  const onPlane = (sx, sy, y) => { plane.constant = -y; return aim(sx, sy).intersectPlane(plane, hitP) ? [hitP.x, hitP.z] : null; };
  const toScreen = (x, y, z) => { v3.set(x, y, z).project(camera); return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * Hh, v3.z > -1 && v3.z < 1]; };
  const ground = (sx, sy) => {                                               // where a ray from the finger meets the land: [x, z], or null
    const { origin: o, direction: d } = aim(sx, sy);
    let t0 = 0;
    for (let t = 0.5; t < 400; t += 0.5) {
      if (o.y + d.y * t < H(o.x + d.x * t, o.z + d.z * t)) {
        let a = t0, b = t;
        for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (o.y + d.y * m < H(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        return [o.x + d.x * b, o.z + d.z * b];
      }
      t0 = t;
    }
    return null;
  };
  // which thing a finger is on: what stands up (a tree, a bush, a clump) by how near the finger is, on the screen, to the line
  // from its foot to its top; what lies on the ground (a bed of flowers, a colony of ferns) by where the finger's ray meets the
  // land. A finger right on a trunk means the tree; one only near it, over a bed or a colony at the tree's foot, means that
  const pick = (sx, sy) => {
    let up = -1, upD = 22;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], K = KINDS[it.kind];
      if (K.flat) continue;
      const y = H(it.x, it.z), [ax, ay, aok] = toScreen(it.x, y, it.z), [bx, by, bok] = toScreen(it.x, y + K.h * it.size, it.z);
      if (!aok || !bok) continue;
      const ux = bx - ax, uy = by - ay, t = Math.min(1, Math.max(0, ((sx - ax) * ux + (sy - ay) * uy) / (ux * ux + uy * uy || 1)));
      const dist = Math.hypot(sx - ax - ux * t, sy - ay - uy * t);
      if (dist < upD) { upD = dist; up = i; }
    }
    if (up >= 0 && upD < 9) return up;
    const at = ground(sx, sy);
    let flat = -1, flatD = 0;
    if (at) for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!KINDS[it.kind].flat) continue;
      const d = it.list === 'cover' ? Math.min(...it.parts.map(p => Math.hypot(it.x + p.dx - at[0], it.z + p.dz - at[1]))) - 0.9 : Math.hypot(it.x - at[0], it.z - at[1]) - reach(it);
      if (d < flatD) { flatD = d; flat = i; }
    }
    return flat >= 0 ? flat : up;
  };
  const onPicked = (sx, sy) => {                                             // is the finger on what is picked up (the thing itself, or the ground inside its ring)
    if (!sel) return false;
    const i = pick(sx, sy);
    if (i >= 0 && sel.ids.includes(i)) return true;
    const at = ground(sx, sy), far = Math.max(...picked().map(it => Math.hypot(it.x - sel.px, it.z - sel.pz) + reach(it)));
    return !!at && Math.hypot(at[0] - sel.px - sel.mx, at[1] - sel.pz - sel.mz) < far + 0.5;
  };

  // ---- fingers: one turns the view round (or drags what is picked up), two move it and zoom, a quick touch picks
  const fingers = new Map();
  let down = null, pinch = null;
  const local = e => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const mid = () => { const [a, b] = [...fingers.values()]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(a[0] - b[0], a[1] - b[1])]; };
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    fingers.set(e.pointerId, [x, y]);
    if (fingers.size === 2) {
      const [mx, my, d] = mid();
      pinch = { d, dist: cam.dist, mx, my, x: cam.x, z: cam.z };
      if (down && down.drag) { settle(); panel(); }
      down = null; return;
    }
    down = { x, y, t: performance.now(), far: false, drag: null };
    if (!adding && onPicked(x, y)) {                                         // on what is picked up: it goes where the finger goes
      const gy = H(sel.px, sel.pz), at = onPlane(x, y, gy);
      if (at) { remember(); down.drag = { y: gy, ox: sel.px - at[0], oz: sel.pz - at[1] }; }
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    const [x, y] = local(e), last = fingers.get(e.pointerId);
    fingers.set(e.pointerId, [x, y]);
    if (pinch && fingers.size >= 2) {
      const [mx, my, d] = mid();
      cam.dist = pinch.dist * pinch.d / Math.max(20, d);
      const k = cam.dist * 2 * Math.tan(camera.fov * Math.PI / 360) / Hh;        // metres per pixel at the point looked at
      Rt.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)); Fw.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
      const dx = mx - pinch.mx, dy = my - pinch.my;
      cam.x = pinch.x - Rt.x * dx * k + Fw.x * dy * k * 1.4; cam.z = pinch.z - Rt.z * dx * k + Fw.z * dy * k * 1.4;
      cam.y = H(cam.x, cam.z) + 1;
      return;
    }
    if (!down) return;
    if (!down.far && Math.hypot(x - down.x, y - down.y) > 8) down.far = true;
    if (!down.far) return;
    if (down.drag) {
      const at = onPlane(x, y, down.drag.y);
      if (!at) return;
      sel.mx = at[0] + down.drag.ox - sel.px; sel.mz = at[1] + down.drag.oz - sel.pz;
      pose();
    } else { cam.yaw -= (x - last[0]) * 0.008; cam.pitch += (y - last[1]) * 0.006; }
  });
  const up = e => {
    if (!fingers.has(e.pointerId)) return;
    const [x, y] = fingers.get(e.pointerId);
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (!down) return;
    const d = down; down = null;
    if (d.drag) { if (!d.far) history.pop(); else { settle(); panel(); } return; }      // (a touch on what is picked up that did not move it: no change)
    if (!d.far && performance.now() - d.t < 600) tap(x, y);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { cam.dist *= 1 + e.deltaY * 0.0012; }, { passive: true });
  const tap = (sx, sy) => {
    if (adding) { const at = ground(sx, sy); if (at) plantNew(adding, at[0], at[1]); else say('แตะบนพื้นเพื่อวาง'); return; }
    if (sel) settle();
    const i = pick(sx, sy);
    if (sel && i >= 0 && sel.ids.includes(i) && sel.ids.length > 1) { const it = items[i]; release(); hold([items.indexOf(it)]); panel(); return; }      // (in a group picked up: that one alone)
    if (sel && i >= 0 && sel.ids.includes(i)) return;
    const it = i >= 0 ? items[i] : null;
    release();
    if (it) hold([items.indexOf(it)]);
    panel();
  };

  // ---- what the buttons do
  const groupOf = it => items.map((o, i) => (o.list !== 'cover' && o.group === it.group ? i : -1)).filter(i => i >= 0);
  const wholeGroup = () => {
    const it = one();
    if (!it || it.list === 'cover') return;
    if (!it.group) return say('ต้นนี้ไม่ได้อยู่ในกลุ่มไหน (ป่ารอบนอก)');
    release(); hold(groupOf(it)); panel(); say('เลือกทั้งกลุ่ม ' + sel.ids.length + ' ต้น · แตะต้นใดต้นหนึ่งเพื่อกลับไปแก้ทีละต้น');
  };
  const nextId = key => items.reduce((m, o) => Math.max(m, o[key] || 0), 0) + 1;
  const plantNew = (kind, x, z) => {
    release(); remember();
    let it;
    if (kind === 'fern' || kind === 'tuft') it = { list: 'cover', kind, x, z, colony: nextId('colony'), parts: colonyParts(kind) };
    else {
      const K = KINDS[kind], near = items.filter(o => o.list !== 'cover' && o.group && Math.hypot(o.x - x, o.z - z) < 6).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
      const fifth = K.colours ? K.colours[Math.floor(Math.random() * K.colours.length)] : kind === 'bush' ? 'green' : 0.8;
      it = { list: kind === 'clump' ? 'clumps' : 'plants', kind, x, z, size: r2(between(K.size[2], K.size[3])), fifth, group: near ? near.group : nextId('group'), turn: Math.floor(Math.random() * 360), shape: 1 + Math.floor(Math.random() * 999), src: -1 };
    }
    items = [...items, it]; hold([items.length - 1]); panel();
    say('วาง' + NAME[kind] + 'แล้ว · แตะพื้นอีกครั้งเพื่อวางเพิ่ม หรือกด ✓ เสร็จ');
  };
  const copyPicked = () => {
    settle();
    const from = picked(), far = Math.max(1.2, ...from.map(it => Math.hypot(it.x - sel.px, it.z - sel.pz) + reach(it))), dx = Math.cos(cam.yaw) * far * 1.3, dz = -Math.sin(cam.yaw) * far * 1.3;
    release(); remember();
    const group = from.length > 1 ? nextId('group') : null, n0 = items.length;
    let colony = nextId('colony');
    items = [...items, ...from.map(it => (it.list === 'cover'
      ? { ...it, x: it.x + dx, z: it.z + dz, colony: colony++, parts: it.parts.map(p => ({ ...p, src: -1 })) }
      : { ...it, x: it.x + dx, z: it.z + dz, group: group || it.group, src: -1 }))];
    hold(from.map((_, k) => n0 + k)); panel(); say('ทำซ้ำแล้ว ลากไปวางได้เลย');
  };
  const removePicked = () => {
    const ids = sel.ids, n = ids.length;
    remember(); R.drop(sel.holder); sel = null;
    items = items.filter((_, i) => !ids.includes(i)); panel(); say('เอาออกแล้ว ' + n + ' ชิ้น');
  };
  const dice = () => {
    const i = sel.ids[0], it = items[i];
    remember();
    if (it.list === 'cover') change(i, { parts: colonyParts(it.kind) });
    else { const K = KINDS[it.kind]; change(i, { shape: 1 + Math.floor(Math.random() * 999), size: r2(between(K.size[2], K.size[3])), turn: Math.floor(Math.random() * 360) }); }
    sprig(); panel();
  };
  const otherShape = by => { const i = sel.ids[0], it = items[i]; remember(); change(i, { shape: Math.max(1, it.shape + by) }); sprig(); panel(); };
  const otherKind = () => {
    const i = sel.ids[0], it = items[i], K = KINDS[it.kind];
    remember();
    if (it.list === 'cover') { const kind = it.kind === 'fern' ? 'tuft' : 'fern'; change(i, { kind, parts: it.parts.map(p => ({ ...p, kind })) }); }
    else if (K.colours) change(i, { fifth: K.colours[(K.colours.indexOf(it.fifth) + 1) % K.colours.length] });
    else if (TREES.includes(it.kind)) change(i, { kind: TREES[(TREES.indexOf(it.kind) + 1) % TREES.length] });
    sprig(); panel();
  };

  // ---- words
  let sayTimer = 0, said = '';
  const say = text => { said = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => { said = ''; showHint(); }, 3600); showHint(); };
  const showHint = () => {
    hint.textContent = said || (adding ? 'แตะพื้นตรงที่จะวาง' + NAME[adding] : sel ? 'ลากของที่เลือกเพื่อย้าย · ลากที่อื่นเพื่อหมุนกล้อง · สองนิ้วเลื่อน/ซูม' : 'แตะต้นไม้ พุ่ม หรือดอกไม้เพื่อเลือก · ลากเพื่อหมุนกล้อง · สองนิ้วเลื่อน/ซูม');
  };

  // ---- the buttons along the top, and the panel of what is picked up at the bottom
  const top = () => {
    head.replaceChildren(row([
      btn('✕ ออก', close), btn('↶ ย้อน', undo), adding ? btn('✓ เสร็จ', () => { adding = null; panel(); }, 'on') : btn('＋ เพิ่ม', addSheet),
      gap(), btn('⋯', more), btn('💾 บันทึก', keep, 'go'),
    ]), hint);
    showHint();
  };
  const slider = (name, min, max, step, value, words, live) => {             // live(value): as it is dragged; set down when let go
    const l = document.createElement('label'), nm = document.createElement('span'), inp = document.createElement('input'), val = document.createElement('span');
    nm.textContent = name; Object.assign(inp, { type: 'range', min, max, step, value }); val.textContent = words(value);
    let first = true;
    inp.addEventListener('pointerdown', () => { first = true; });
    inp.addEventListener('input', () => { if (first) { remember(); first = false; } live(+inp.value); val.textContent = words(+inp.value); pose(); });
    inp.addEventListener('change', () => { settle(); panel(); });
    l.append(nm, inp, val);
    return l;
  };
  const panel = () => {
    top();
    if (!sel) { foot.replaceChildren(); return; }
    const p = stop(document.createElement('div')); p.className = 'panel';
    const name = document.createElement('span'); name.className = 'name';
    const note = document.createElement('div'); note.className = 'ok';
    const it = one(), kids = [];
    const turnSlider = () => slider('หมุน', -180, 180, 1, 0, v => (v > 0 ? '+' : '') + v + '°', v => { sel.turn = v * Math.PI / 180; });
    if (it) {
      const K = KINDS[it.kind], colony = it.list === 'cover';
      name.textContent = NAME[it.kind] + (K.colours ? ' · ' + (COLOUR[it.fifth] || it.fifth) : '');
      note.textContent = colony ? it.parts.length + ' กอ · จับย้ายทั้งกลุ่ม' : it.src < 0 ? 'ของใหม่ ยังไม่อยู่ในแมพ' : it.group ? 'อยู่ในกลุ่มที่มี ' + groupOf(it).length + ' ต้น' : 'ป่ารอบนอก (ไม่มีกลุ่ม)';
      kids.push(row([name, ...(it.kind === 'bush' ? [] : [btn(colony ? '⇄ ' + NAME[it.kind === 'fern' ? 'tuft' : 'fern'] : K.colours ? '🎨 เปลี่ยนสี' : '🌳 เปลี่ยนชนิด', otherKind)])]), note);
      const size0 = colony ? 1 : it.size;
      kids.push(slider('ขนาด', colony ? 0.5 : K.size[0], colony ? 1.8 : K.size[1], 0.01, size0, v => (colony ? Math.round(v * 100) + '%' : v.toFixed(2)), v => { sel.scale = v / size0; }));
      if (it.kind !== 'flower') kids.push(turnSlider());
      kids.push(row([
        ...(colony ? [] : [btn('◀ ทรง', () => otherShape(-1)), btn('ทรง ▶', () => otherShape(1))]), btn('🎲 สุ่ม', dice),
        gap(), ...(colony || !it.group ? [] : [btn('ทั้งกลุ่ม', wholeGroup)]),
      ]));
    } else {
      name.textContent = 'ทั้งกลุ่ม ' + sel.ids.length + ' ชิ้น';
      note.textContent = 'ย้าย หมุน ทำซ้ำ หรือลบทั้งกลุ่ม · แตะต้นใดต้นหนึ่งเพื่อแก้ทีละต้น';
      kids.push(row([name]), note, turnSlider());
    }
    kids.push(row([btn('⧉ ทำซ้ำ', copyPicked), btn('🗑 ลบ', removePicked, 'warn'), gap(), btn('✓', () => { release(); panel(); })]));
    p.append(...kids);
    foot.replaceChildren(p);
  };
  const addSheet = () => {
    openSheet('เลือกชนิดที่จะเพิ่ม แล้วแตะพื้นตรงที่จะวาง (วางต่อได้หลายต้น จนกว่าจะกด ✓ เสร็จ)', ADDABLE.map(kind => btn(NAME[kind], () => { closeSheet(); release(); adding = kind; panel(); })));
  };
  const more = () => {
    release(); panel();
    const out = document.createElement('textarea');
    const { rows, src } = rowsOf(items), ed = foliageEdits(R.map, R.report, rows, R.report.src ? src : null);
    out.value = JSON.stringify(ed);
    const count = ed.full ? 'ทั้งหมด' : ['plants', 'clumps', 'cover'].reduce((n, k) => n + (ed[k] ? ed[k].set.length + ed[k].del.length + ed[k].add.length : 0), 0) + ' รายการ';
    openSheet('สิ่งที่แก้ (' + count + ') เป็นข้อความ: คัดลอกส่งให้ Claude เพื่อใส่ลงแมพถาวรให้ทุกคน หรือวางข้อความที่เคยคัดลอกไว้แล้วกด "ใช้ข้อมูลนี้"', [
      out,
      btn('คัดลอกข้อมูล', () => {
        out.select(); const done = () => say('คัดลอกแล้ว ส่งให้ Claude ได้เลย');
        if (navigator.clipboard) navigator.clipboard.writeText(out.value).then(done, () => { document.execCommand('copy'); done(); }); else { document.execCommand('copy'); done(); }
      }, 'go'),
      btn('ใช้ข้อมูลนี้', () => {
        let got = null; try { got = foliageFromEdits(R.report.own, JSON.parse(out.value)); } catch { /* not ours */ }
        if (!got) return say('ข้อความนี้ไม่ใช่ข้อมูลการจัดต้นไม้');
        remember(); closeSheet(); restore(itemsOf(got.lists, got.src), 'ใส่ข้อมูลแล้ว กดบันทึกเพื่อใช้จริง');
      }),
      btn('กลับเป็นแบบในแมพทั้งหมด', () => {
        const own = R.report.own, ident = { plants: own.plants.map((_, i) => i), clumps: own.clumps.map((_, i) => i), cover: own.cover.map((_, i) => i) };
        remember(); closeSheet(); restore(itemsOf(own, ident), 'กลับเป็นแบบในแมพแล้ว กดบันทึกเพื่อใช้จริง');
      }, 'warn'),
    ]);
  };
  const keep = () => {
    release();
    const { rows, src } = rowsOf(items);
    try {
      if (JSON.stringify(rows) === JSON.stringify(R.report.own)) dropFoliage(R.key);      // (nothing differs from the map's own: nothing to keep)
      else keepFoliage(R.key, R.report.base, rows, R.report.src ? src : null);
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({ cam }));
    } catch { say('บันทึกไม่ได้ (เบราว์เซอร์ไม่ให้เก็บข้อมูล หรือข้อมูลใหญ่เกิน)'); return; }
    kept = JSON.stringify(rows);
    say('บันทึกแล้ว กำลังโหลดแมพใหม่…');
    setTimeout(() => location.reload(), 350);
  };

  // ---- marks over the picture: a ring on the ground round each thing picked up, and a name above them
  const ring = (x, z, r) => {
    g.beginPath();
    let pen = false;
    for (let i = 0; i <= 32; i++) {
      const a = i / 32 * Math.PI * 2, qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r, [px, py, ok] = toScreen(qx, H(qx, qz) + 0.1, qz);
      if (!ok) { pen = false; continue; }
      if (pen) g.lineTo(px, py); else g.moveTo(px, py);
      pen = true;
    }
    g.stroke();
  };
  const draw = () => {
    g.clearRect(0, 0, W, Hh);
    if (!sel) return;
    const c = Math.cos(sel.turn), s = Math.sin(sel.turn), k = sel.scale, list = picked();
    g.lineWidth = list.length > 1 ? 2 : 3; g.strokeStyle = '#ffd23c'; g.setLineDash([10, 7]);
    let top = 0;
    for (const it of list) {
      const dx = it.x - sel.px, dz = it.z - sel.pz, x = sel.px + sel.mx + (dx * c + dz * s) * k, z = sel.pz + sel.mz + (-dx * s + dz * c) * k;
      ring(x, z, reach(it) * k + 0.3); top = Math.max(top, KINDS[it.kind].h * (it.size || 1) * k);
    }
    g.setLineDash([]);
    const x = sel.px + sel.mx, z = sel.pz + sel.mz, [px, y0, ok] = toScreen(x, H(x, z) + Math.min(top, 9) + 0.6, z);
    if (!ok) return;
    const py = Math.max(y0, 124);                                           // (never under the buttons along the top)
    const label = list.length > 1 ? 'กลุ่ม ' + list.length + ' ชิ้น' : NAME[list[0].kind];
    g.font = '600 13px system-ui'; g.textAlign = 'center';
    const tw = g.measureText(label).width + 16;
    g.fillStyle = '#10243add'; g.beginPath(); g.roundRect(px - tw / 2, py - 24, tw, 22, 11); g.fill();
    g.fillStyle = '#fff'; g.fillText(label, px, py - 9);
  };

  // ---- open / close
  const open = (at = null) => {
    if (active) return;
    items = itemsOf(R.rows(), R.report.src);
    history = []; sel = null; adding = null; kept = JSON.stringify(rowsOf(items).rows);
    if (at && at.cam) Object.assign(cam, at.cam); else lookFrom();
    document.body.append(root);
    document.body.classList.add('foliageEditing');
    fit(); active = true; panel();
    const rep = R.report;
    if (!at && rep.baked) say('ที่จัดไว้ในเครื่องนี้ อยู่ในแมพถาวรแล้ว');
    else if (!at && rep.stale) say('ที่จัดไว้ในเครื่องนี้ทำบนแมพชุดก่อน: แมพมีต้นไม้ชุดใหม่กว่า (⋯ เพื่อกลับไปใช้ของแมพ)');
    else if (!at && rep.used) say('ใช้การจัดต้นไม้ที่เก็บไว้ในเครื่องนี้');
  };
  const close = () => {
    if (!active) return;
    const dirty = changed();
    if (dirty && !window.confirm('ยังไม่ได้บันทึก ออกโดยทิ้งการแก้ไขหรือไม่')) return;
    release();
    active = false; closeSheet(); root.remove();
    document.body.classList.remove('foliageEditing');
    if (dirty) R.plant(R.rows());                                            // back to the foliage as it is kept
  };
  addEventListener('resize', () => { if (active) fit(); });

  const api = {
    get active() { return active; },
    focus, open, close,
    apply() { if (!active) return; place(); draw(); },
    // (for tests)
    _state: () => ({ items, sel: sel && { ids: sel.ids, mx: sel.mx, mz: sel.mz, turn: sel.turn, scale: sel.scale }, cam, changed: changed(), history: history.length, rows: rowsOf(items) }),
    _tap: (x, z, y = null) => { place(); const [sx, sy] = toScreen(x, y ?? H(x, z) + 0.05, z); tap(sx, sy); },
    _pick: (x, z, y) => { place(); const [sx, sy] = toScreen(x, y, z); return pick(sx, sy); },
    _move: (dx, dz) => { if (!sel) return; remember(); sel.mx = dx; sel.mz = dz; pose(); settle(); panel(); },
    _turn: deg => { if (!sel) return; remember(); sel.turn = deg * Math.PI / 180; pose(); settle(); panel(); },
    _size: k => { if (!sel) return; remember(); sel.scale = k; pose(); settle(); panel(); },
    _add: kind => { release(); adding = kind; panel(); },
    _group: wholeGroup, _copy: copyPicked, _remove: removePicked, _dice: dice, _kind: otherKind, _shape: otherShape, _done: () => { adding = null; release(); panel(); },
    _undo: undo, _save: keep, _more: more, _say: () => hint.textContent, _edits: () => { const { rows, src } = rowsOf(items); return foliageEdits(R.map, R.report, rows, R.report.src ? src : null); },
  };
  try {                                                                       // after "save" the map loads again: back to the same place
    const r = sessionStorage.getItem(RESUME_KEY);
    if (r) { sessionStorage.removeItem(RESUME_KEY); api.resume = JSON.parse(r); }
  } catch { /* nothing to resume */ }
  return api;
}
