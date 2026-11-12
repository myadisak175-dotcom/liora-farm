// rock-editor.js  —  move a map's rocks by hand, in the map itself, on a phone or with a mouse.
//
// One job: the last pass over a layout. The map's code lays the rocks out (the cliff dressed piece by piece, the loose rocks, the
// stones on the paths), the way a studio's tools do; then they are gone over by hand, the way the studio's artist goes over
// them: this one a little to the left, that one turned, this one bigger, that one out, one more here.
//
//   the camera     flies free of her: one finger turns round what it looks at, two fingers move it and come nearer or go back
//                  (the mouse wheel too)
//   a rock         tap it to pick it; drag it to move it; the sliders turn it, tip it, size it, raise or sink it; ◀ ▶ another
//                  shape of the same kind; ⧉ one more like it; ⬇ down onto the ground; 🗑 out
//   ＋ เพิ่มหิน    a new rock of the kit, where you tap the ground
//   ↶ ย้อน         back one change
//   💾 บันทึก      keep it (in this browser) and load the map again: her way round the rocks, the grass, the shade and the
//                  shadows are worked out again for where they now stand (until then only the rocks themselves move)
//   ⋯              the rocks as text, to send to Claude to put into rocks-layout.js for everyone, or to paste back in;
//                  back to the game's own layout
//
// Works on a level that offers level.rockEdit (rocks-level.js). Nothing here knows how a rock is made: rocks.js draws them.
//
//   const editor = createRockEditor({ level, camera, player });      // null on a map without it
//   editor.open();                          editor.active is true while it is open
//   each frame, after the player has set the camera:  if (editor.active) editor.apply(camera);
//   editor.focus: where the camera is looking (for the grass to grow round, instead of round her)

import * as THREE from 'three';
import { moveKitRock, propRockGeometry } from './rocks.js';

const RESUME_KEY = 'liora.rockEditor.resume';
const SEEDS = 6;                                                            // shapes of each kind to choose from
const CSS = `
#rockEditor { position:fixed; inset:0; z-index:60; touch-action:none; user-select:none; -webkit-user-select:none; font:600 13px system-ui, sans-serif; color:#16324a; pointer-events:none; }
#rockEditor canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:auto; touch-action:none; }
#rockEditor .bar { position:absolute; left:0; right:0; display:flex; flex-direction:column; gap:6px; padding:8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left)); pointer-events:none; }
#rockEditor .head { top:env(safe-area-inset-top); }
#rockEditor .foot { bottom:env(safe-area-inset-bottom); align-items:center; }
#rockEditor .row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
#rockEditor .grow { flex:1; }
#rockEditor button { pointer-events:auto; border:1px solid #ffffffaa; border-radius:999px; padding:9px 12px; background:#ffffffee; color:#16324a; font:inherit; touch-action:manipulation; box-shadow:0 1px 4px #0003; }
#rockEditor button.on { background:#1f6fd0; color:#fff; }
#rockEditor button.go { background:#18a058; color:#fff; }
#rockEditor button.warn { background:#fff0f0; color:#b3261e; }
#rockEditor .hint { align-self:center; max-width:94%; padding:6px 12px; border-radius:12px; background:#10243acc; color:#fff; font-weight:500; text-align:center; }
#rockEditor .panel { pointer-events:auto; width:min(100%, 460px); padding:10px 12px; border-radius:16px; background:#fffffff0; box-shadow:0 4px 18px #0004; display:flex; flex-direction:column; gap:6px; }
#rockEditor .panel .name { font-weight:700; flex:1; }
#rockEditor .panel label { display:grid; grid-template-columns:96px 1fr 44px; align-items:center; gap:8px; font-weight:500; }
#rockEditor .panel label span:last-child { text-align:right; font-variant-numeric:tabular-nums; color:#5a6a7a; }
#rockEditor input[type=range] { width:100%; height:28px; margin:0; accent-color:#1f6fd0; touch-action:pan-x; }
#rockEditor .sheet { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(92%, 380px); max-height:80%; overflow:auto; padding:14px; border-radius:16px; background:#fffffffa; box-shadow:0 8px 30px #0006; display:flex; flex-wrap:wrap; gap:8px; justify-content:center; pointer-events:auto; }
#rockEditor .sheet p { width:100%; margin:0 0 4px; text-align:center; font-weight:500; }
#rockEditor .sheet textarea { width:100%; height:120px; font:12px monospace; }
body.rockEditing > :not(#rockEditor):not(canvas):not(script):not(style) { visibility:hidden !important; }
#rockEditBtn { position:fixed; left:max(10px,env(safe-area-inset-left)); top:calc(164px + env(safe-area-inset-top)); z-index:4; border:1px solid #ffffff88; border-radius:999px; padding:9px 14px; background:#7a6a58dc; color:white; font:600 12px system-ui; touch-action:manipulation; }
`;

export function createRockEditor({ level, camera, player = null }) {
  const R = level.rockEdit;
  if (!R) return null;
  if (!document.getElementById('rockEditorCss')) { const st = document.createElement('style'); st.id = 'rockEditorCss'; st.textContent = CSS; document.head.append(st); }
  const H = R.heightAt, NAME = Object.fromEntries(R.types.map(t => [t.key, t.name]));

  // ---- what is being edited: a working copy of the rocks, drawn as it changes; nothing is kept until "save"
  let items = [], kit = null, instIndex = new Map(), sel = -1, placing = null, history = [], sheet = null, active = false, kept = '';
  const changed = () => JSON.stringify(R.save(items)) !== kept;              // anything not yet saved?
  const show = () => { kit = R.show(items); instIndex = new Map(kit.userData.instances.map((inst, i) => [inst, i])); };
  const instOf = i => kit.userData.instances[i];
  const remember = () => { history.push({ items: items.map(it => ({ ...it })), sel }); if (history.length > 60) history.shift(); };
  const undo = () => {
    const h = history.pop();
    if (!h) return say('ไม่มีอะไรให้ย้อนแล้ว');
    items = h.items; sel = h.sel < items.length ? h.sel : -1; show(); panel(); say('ย้อนแล้ว');
  };
  const nudge = () => { if (sel >= 0) moveKitRock(instOf(sel)); };      // the picked rock has moved: draw it there

  // ---- the camera: it looks at a point on the ground, from a way off and a height
  const cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0.45, dist: 14 };
  const focus = new THREE.Vector3();
  const D = new THREE.Vector3(), Rt = new THREE.Vector3(), Fw = new THREE.Vector3();
  const place = () => {
    cam.pitch = Math.min(1.45, Math.max(0.08, cam.pitch)); cam.dist = Math.min(90, Math.max(2.5, cam.dist));
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
    cam.yaw = Math.atan2(dx, dz); cam.dist = Math.max(13, Math.hypot(dx, dy, dz) * 2); cam.pitch = Math.max(0.5, Math.atan2(dy, Math.hypot(dx, dz)));
  };

  // ---- the page
  const root = document.createElement('div'); root.id = 'rockEditor';
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const head = document.createElement('div'); head.className = 'bar head';
  const foot = document.createElement('div'); foot.className = 'bar foot';
  const hint = document.createElement('div'); hint.className = 'hint';
  root.append(cv, head, foot);
  const row = kids => { const r = document.createElement('div'); r.className = 'row'; r.append(...kids); return r; };
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
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
  const aim = (sx, sy) => { ndc.set(sx / W * 2 - 1, -(sy / Hh) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray; };
  const pick = (sx, sy) => {                                                 // the rock under the finger: [index, the point touched], or null
    aim(sx, sy);
    const hits = ray.intersectObjects(kit.children, false);
    for (const h of hits) {
      const inst = h.object.userData.instances && h.object.userData.instances[h.instanceId];
      const i = inst ? instIndex.get(inst) : undefined;
      if (i !== undefined) return [i, h.point.clone()];
    }
    return null;
  };
  const onGround = (sx, sy) => {                                             // where a finger touches the land
    const r = aim(sx, sy), o = r.origin, d = r.direction, under = t => o.y + d.y * t <= H(o.x + d.x * t, o.z + d.z * t);
    let a = 0, t = 0.5;
    for (let i = 0; i < 120 && !under(t); i++) { a = t; t += Math.max(0.4, t * 0.06); if (t > 600) return null; }
    if (!under(t)) return null;
    for (let i = 0; i < 10; i++) { const m = (a + t) / 2; if (under(m)) t = m; else a = m; }
    return [o.x + d.x * t, o.z + d.z * t];
  };
  const onPlane = (sx, sy, y) => { plane.constant = -y; return aim(sx, sy).intersectPlane(plane, hitP) ? [hitP.x, hitP.z] : null; };

  // ---- fingers: one turns the view round (or drags the picked rock), two move it and zoom, a quick touch picks
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
      if (down && down.drag) panel();
      down = null; return;
    }
    down = { x, y, t: performance.now(), far: false, drag: null };
    if (sel >= 0 && !placing) {
      const hit = pick(x, y);
      if (hit && hit[0] === sel) {                                           // on the picked rock: it goes where the finger goes
        const at = onPlane(x, y, hit[1].y);
        if (at) { remember(); down.drag = { y: hit[1].y, ox: items[sel].x - at[0], oz: items[sel].z - at[1] }; }
      }
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
      return;
    }
    if (!down) return;
    if (!down.far && Math.hypot(x - down.x, y - down.y) > 8) down.far = true;
    if (!down.far) return;
    if (down.drag) {
      const at = onPlane(x, y, down.drag.y);
      if (!at) return;
      const it = items[sel], gy = lowUnder(it);
      it.x = at[0] + down.drag.ox; it.z = at[1] + down.drag.oz;
      it.y += lowUnder(it) - gy;                                             // it keeps its depth in the ground as it goes (the lowest ground under it: a cliff piece stands on the land below the face)
      nudge();
    } else { cam.yaw -= (x - last[0]) * 0.008; cam.pitch += (y - last[1]) * 0.006; }
  });
  const up = e => {
    if (!fingers.has(e.pointerId)) return;
    const [x, y] = fingers.get(e.pointerId);
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (!down) return;
    const d = down; down = null;
    if (d.drag) { if (!d.far) history.pop(); panel(); return; }             // (a touch on the picked rock that did not move it: no change)
    if (!d.far && performance.now() - d.t < 600) tap(x, y);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { cam.dist *= 1 + e.deltaY * 0.0012; }, { passive: true });

  const tap = (sx, sy) => {
    if (placing) {
      const w = onGround(sx, sy);
      if (!w) return say('แตะบนพื้น');
      remember();
      const it = { type: placing, seed: 1, x: w[0], z: w[1], y: 0, ry: Math.round((cam.yaw * 180 / Math.PI + 360) % 360), rx: 0, rz: 0, s: 1 };
      items.push(it); toGround(it);
      sel = items.length - 1; placing = null; show(); panel(); return;
    }
    const hit = pick(sx, sy);
    if (!hit) { sel = -1; panel(); return; }
    sel = hit[0]; panel();
  };
  const lowUnder = it => {                                                   // the lowest ground under a rock
    const b = propRockGeometry(it.type, it.seed).boundingBox, s = it.s || 1, a = (it.ry || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    let low = Infinity;
    for (const [px, pz] of [[0, 0], [b.min.x, b.min.z], [b.max.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.max.z]]) {
      const x = it.x + (px * c + pz * sn) * s * 0.8, z = it.z + (-px * sn + pz * c) * s * 0.8;
      low = Math.min(low, H(x, z));
    }
    return low;
  };
  const toGround = it => {                                                   // sit it on the land: its foot a little into the lowest ground under it
    const b = propRockGeometry(it.type, it.seed).boundingBox, s = it.s || 1;
    it.y = lowUnder(it) - 0.3 * s - b.min.y * s;
  };

  // ---- words
  let sayTimer = 0, said = '';
  const say = text => { said = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => { said = ''; showHint(); }, 2800); showHint(); };
  const showHint = () => {
    hint.textContent = said || (placing ? 'แตะพื้นตรงที่จะวาง' + NAME[placing] : sel >= 0 ? 'ลากหินที่เลือกเพื่อย้าย · ลากที่อื่นเพื่อหมุนมุมมอง' : 'แตะหินเพื่อเลือก · ลากเพื่อหมุนมุมมอง · สองนิ้วเลื่อนและซูม');
  };

  // ---- the buttons along the top, and the picked rock's panel at the bottom
  const top = () => {
    head.replaceChildren(row([
      btn('✕ ออก', close), btn('＋ เพิ่มหิน', pickAdd, placing ? 'on' : ''), btn('↶ ย้อน', undo),
      Object.assign(document.createElement('span'), { className: 'grow' }), btn('⋯', more), btn('💾 บันทึก', save, 'go'),
    ]), hint);
    showHint();
  };
  const pickAdd = () => openSheet('เลือกหินที่จะวาง แล้วแตะบนพื้น', R.types.map(t => btn(t.name, () => { closeSheet(); placing = t.key; sel = -1; top(); panel(); })));
  const slider = (label, min, max, step, get, set, fmt) => {
    const l = document.createElement('label'), name = document.createElement('span'), inp = document.createElement('input'), val = document.createElement('span');
    name.textContent = label;
    Object.assign(inp, { type: 'range', min, max, step, value: get() });
    val.textContent = fmt(get());
    let first = true;
    inp.addEventListener('pointerdown', () => { first = true; });
    inp.addEventListener('input', () => { if (first) { remember(); first = false; } set(+inp.value); val.textContent = fmt(+inp.value); nudge(); });
    l.append(name, inp, val);
    return l;
  };
  const panel = () => {
    top();
    if (sel < 0) { foot.replaceChildren(); return; }
    const it = items[sel], y0 = it.y, deg = v => Math.round(v) + '°';
    const p = stop(document.createElement('div')); p.className = 'panel';
    const name = document.createElement('span'); name.className = 'name'; name.textContent = (NAME[it.type] || it.type) + ' · ทรง ' + it.seed;
    const shape = d => { remember(); it.seed = (it.seed - 1 + d + SEEDS) % SEEDS + 1; show(); panel(); };
    p.append(
      row([name, btn('◀', () => shape(-1)), btn('▶', () => shape(1))]),
      slider('หมุน', -180, 180, 1, () => ((it.ry || 0) + 540) % 360 - 180, v => { it.ry = v; }, deg),
      slider('เอียงหน้า-หลัง', -35, 35, 1, () => it.rx || 0, v => { it.rx = v; }, deg),
      slider('เอียงข้าง', -35, 35, 1, () => it.rz || 0, v => { it.rz = v; }, deg),
      slider('ขนาด', 0.3, 2.5, 0.01, () => it.s || 1, v => { it.s = v; }, v => v.toFixed(2)),
      slider('สูง-ต่ำ', -4, 4, 0.02, () => it.y - y0, v => { it.y = y0 + v; }, v => (v > 0 ? '+' : '') + v.toFixed(1)),
      row([
        btn('⧉ ก๊อป', () => {
          remember();
          const c = { ...it, x: it.x + Math.cos(cam.yaw) * 2 * (it.s || 1), z: it.z - Math.sin(cam.yaw) * 2 * (it.s || 1), ry: ((it.ry || 0) + 40) % 360 };
          c.y = it.y + H(c.x, c.z) - H(it.x, it.z);
          items.push(c); sel = items.length - 1; show(); panel();
        }),
        btn('⬇ ลงพื้น', () => { remember(); toGround(it); nudge(); panel(); }),
        Object.assign(document.createElement('span'), { className: 'grow' }),
        btn('🗑 ลบ', () => { remember(); items.splice(sel, 1); sel = -1; show(); panel(); }, 'warn'),
        btn('✓', () => { sel = -1; panel(); }),
      ]),
    );
    foot.replaceChildren(p);
  };
  const more = () => {
    const out = document.createElement('textarea');
    out.value = JSON.stringify(R.save(items));
    const use = (list, text) => { remember(); items = list; sel = -1; show(); closeSheet(); panel(); say(text); };
    const kids = [
      out,
      btn('คัดลอกข้อมูล', () => { out.select(); const done = () => say('คัดลอกแล้ว ส่งให้ Claude ได้เลย'); if (navigator.clipboard) navigator.clipboard.writeText(out.value).then(done, () => { document.execCommand('copy'); done(); }); else { document.execCommand('copy'); done(); } }),
      btn('ใช้ข้อมูลนี้', () => { let l = null; try { l = R.load(JSON.parse(out.value)); } catch { /* not ours */ } if (l) use(l, 'ใส่ข้อมูลแล้ว กดบันทึกเพื่อใช้จริง'); else say('ข้อมูลไม่ถูกต้อง'); }),
      btn('กลับเป็นแบบในเกม', () => use(R.base(), 'กลับเป็นแบบเดิมแล้ว กดบันทึกเพื่อใช้จริง'), 'warn'),
    ];
    if (R.generated) kids.push(btn('ให้โค้ดวางใหม่ทั้งหมด', () => use(R.generated(), 'โค้ดวางใหม่แล้ว กดบันทึกเพื่อใช้จริง'), 'warn'));
    openSheet('หินทั้งหมดเป็นข้อความ: คัดลอกส่งให้ Claude เพื่อใส่ลงเกมถาวร หรือวางข้อมูลที่เคยคัดลอกไว้แล้วกด "ใช้ข้อมูลนี้"', kids);
  };
  const save = () => {
    try {
      const mine = JSON.stringify(R.save(items)), base = JSON.stringify(R.save(R.base()));
      if (mine === base) localStorage.removeItem(R.key); else localStorage.setItem(R.key, mine);      // (the game's own layout: nothing to keep)
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({ cam, sel }));
    } catch { say('บันทึกไม่ได้ (เบราว์เซอร์ไม่ให้เก็บข้อมูล)'); return; }
    kept = JSON.stringify(R.save(items));
    say('บันทึกแล้ว กำลังโหลดแมพใหม่…');
    setTimeout(() => location.reload(), 350);
  };

  // ---- marks over the picture: a ring on the ground round the picked rock, and its name above it
  const v3 = new THREE.Vector3();
  const toScreen = (x, y, z) => { v3.set(x, y, z).project(camera); return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * Hh, v3.z > -1 && v3.z < 1]; };
  const draw = () => {
    g.clearRect(0, 0, W, Hh);
    if (sel < 0) return;
    const it = items[sel], b = propRockGeometry(it.type, it.seed).boundingBox, s = it.s || 1;
    const r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * s * 0.6 + 0.3;
    g.lineWidth = 3; g.strokeStyle = '#ffd23c'; g.setLineDash([10, 7]); g.beginPath();
    let pen = false;
    for (let i = 0; i <= 40; i++) {
      const a = i / 40 * Math.PI * 2, x = it.x + Math.cos(a) * r, z = it.z + Math.sin(a) * r, [px, py, ok] = toScreen(x, H(x, z) + 0.08, z);
      if (!ok) { pen = false; continue; }
      if (pen) g.lineTo(px, py); else g.moveTo(px, py);
      pen = true;
    }
    g.stroke(); g.setLineDash([]);
    const [px, py, ok] = toScreen(it.x, it.y + b.max.y * s + 0.4, it.z);
    if (!ok) return;
    const name = NAME[it.type] || it.type;
    g.font = '600 13px system-ui'; g.textAlign = 'center';
    const tw = g.measureText(name).width + 16;
    g.fillStyle = '#10243add'; g.beginPath(); g.roundRect(px - tw / 2, py - 24, tw, 22, 11); g.fill();
    g.fillStyle = '#fff'; g.fillText(name, px, py - 9);
  };

  // ---- open / close
  const open = (at = null) => {
    if (active) return;
    items = R.items(); show();
    history = []; placing = null; sel = -1; kept = JSON.stringify(R.save(items));
    if (at && at.cam) Object.assign(cam, at.cam); else lookFrom();
    if (at && at.sel >= 0 && at.sel < items.length) sel = at.sel;
    document.body.append(root);
    document.body.classList.add('rockEditing');
    fit(); active = true; panel();
    if (R.edited && !at) say('หินชุดนี้แก้มือไว้แล้ว (เก็บในเครื่องนี้)');
  };
  const close = () => {
    if (!active) return;
    const lose = changed();
    if (lose && !window.confirm('ยังไม่ได้บันทึก ออกโดยทิ้งการแก้ไขหรือไม่')) return;
    active = false; closeSheet(); root.remove();
    document.body.classList.remove('rockEditing');
    if (lose) { items = R.items(); show(); }                                // back to what is kept
  };
  addEventListener('resize', () => { if (active) fit(); });

  const api = {
    get active() { return active; },
    focus, open, close,
    apply() { if (!active) return; place(); draw(); },
    // (for tests)
    _state: () => ({ items, sel, cam, changed: changed(), placing, history: history.length }),
    _tap: (x, y, z) => { place(); const [sx, sy] = toScreen(x, y, z); tap(sx, sy); },
    _pick: (i) => { sel = i; panel(); },
    _undo: undo, _save: save, _ground: () => { if (sel >= 0) { remember(); toGround(items[sel]); nudge(); } },
  };
  try {                                                                       // after "save" the map loads again: back to the same place
    const r = sessionStorage.getItem(RESUME_KEY);
    if (r) { sessionStorage.removeItem(RESUME_KEY); api.resume = JSON.parse(r); }
  } catch { /* nothing to resume */ }
  return api;
}
