// place-editor.js  —  move a map's houses and small things by hand, in the map itself, on a phone or with a mouse.
//
// One job: the last pass over where things stand. The map's tool puts the houses, the well, the great tree and the small things
// (benches, lamps, stalls, ...); walking round, one is found too near a way, or on a slope, or just not where it looks right:
// here it is picked up and put down again.
//
//   the camera     flies free of her: one finger turns round what it looks at, two fingers move it and come nearer or go back
//                  (the mouse wheel too)
//   a thing        tap it to pick it; drag it to move it; ⟲ ⟳ and the slider turn it; ↺ back where the map has it
//   ↶ ย้อน         back one change
//   💾 บันทึก      keep it (in this browser) and load the map again: her way round it, the bare ground, the grass and the
//                  shadows are worked out again for where it now stands (until then only the thing itself moves)
//   ⋯              the moves as text, to send to Claude to put into the map's tool for everyone (the ground is then levelled under
//                  a moved house and the map's picture drawn again), or to paste back in; back to the map's own places
//
// Works on a level that offers level.placeEdit (hill-village-level.js). The moves themselves: place-edits.js.
//
//   const editor = createPlaceEditor({ level, camera, player });     // null on a map without it
//   editor.open();                          editor.active is true while it is open
//   each frame, after the player has set the camera:  if (editor.active) editor.apply(camera);
//   editor.focus: where the camera is looking (for the grass to grow round, instead of round her)

import * as THREE from 'three';
import { movesOf, itemsFrom } from './place-edits.js';

const RESUME_KEY = 'liora.placeEditor.resume';
const CSS = `
#placeEditor { position:fixed; inset:0; z-index:60; touch-action:none; user-select:none; -webkit-user-select:none; font:600 13px system-ui, sans-serif; color:#16324a; pointer-events:none; }
#placeEditor canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:auto; touch-action:none; }
#placeEditor .bar { position:absolute; left:0; right:0; display:flex; flex-direction:column; gap:6px; padding:8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left)); pointer-events:none; }
#placeEditor .head { top:env(safe-area-inset-top); }
#placeEditor .foot { bottom:env(safe-area-inset-bottom); align-items:center; }
#placeEditor .row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
#placeEditor .grow { flex:1; }
#placeEditor button { pointer-events:auto; border:1px solid #ffffffaa; border-radius:999px; padding:9px 12px; background:#ffffffee; color:#16324a; font:inherit; touch-action:manipulation; box-shadow:0 1px 4px #0003; }
#placeEditor button.go { background:#18a058; color:#fff; }
#placeEditor button.warn { background:#fff0f0; color:#b3261e; }
#placeEditor .hint { align-self:center; max-width:94%; padding:6px 12px; border-radius:12px; background:#10243acc; color:#fff; font-weight:500; text-align:center; }
#placeEditor .panel { pointer-events:auto; width:min(100%, 460px); padding:10px 12px; border-radius:16px; background:#fffffff0; box-shadow:0 4px 18px #0004; display:flex; flex-direction:column; gap:6px; }
#placeEditor .panel .name { font-weight:700; flex:1; }
#placeEditor .panel .bad { color:#b3261e; font-weight:600; }
#placeEditor .panel .ok { color:#18794e; font-weight:500; }
#placeEditor .panel label { display:grid; grid-template-columns:56px 1fr 44px; align-items:center; gap:8px; font-weight:500; }
#placeEditor .panel label span:last-child { text-align:right; font-variant-numeric:tabular-nums; color:#5a6a7a; }
#placeEditor input[type=range] { width:100%; height:28px; margin:0; accent-color:#1f6fd0; touch-action:pan-x; }
#placeEditor .sheet { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(92%, 380px); max-height:80%; overflow:auto; padding:14px; border-radius:16px; background:#fffffffa; box-shadow:0 8px 30px #0006; display:flex; flex-wrap:wrap; gap:8px; justify-content:center; pointer-events:auto; }
#placeEditor .sheet p { width:100%; margin:0 0 4px; text-align:center; font-weight:500; }
#placeEditor .sheet textarea { width:100%; height:120px; font:12px monospace; }
body.placeEditing > :not(#placeEditor):not(canvas):not(script):not(style) { visibility:hidden !important; }
#placeEditBtn { position:fixed; left:max(10px,env(safe-area-inset-left)); top:calc(164px + env(safe-area-inset-top)); z-index:4; border:1px solid #ffffff88; border-radius:999px; padding:9px 14px; background:#8a5a3cdc; color:white; font:600 12px system-ui; touch-action:manipulation; }
`;

export function createPlaceEditor({ level, camera, player = null }) {
  const R = level.placeEdit;
  if (!R) return null;
  if (!document.getElementById('placeEditorCss')) { const st = document.createElement('style'); st.id = 'placeEditorCss'; st.textContent = CSS; document.head.append(st); }
  const H = R.heightAt;

  // ---- what is being edited: where each thing stands; nothing is kept until "save"
  let items = [], base = [], sel = -1, history = [], sheet = null, active = false, kept = '';
  const save = list => movesOf(base, list);
  const changed = () => JSON.stringify(save(items)) !== kept;
  const differs = (a, b) => !a || !b || Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.z - b.z) > 1e-6 || Math.abs(a.yaw - b.yaw) > 1e-6;
  const resettle = was => { for (let i = 0; i < items.length; i++) if (differs(was[i], items[i])) R.settle(i, items[i]); };      // (only what changed is built again)
  const remember = () => { history.push({ items: items.map(it => ({ ...it })), sel }); if (history.length > 60) history.shift(); };
  const undo = () => {
    const h = history.pop();
    if (!h) return say('ไม่มีอะไรให้ย้อนแล้ว');
    const was = items; items = h.items; sel = h.sel; resettle(was); panel(); say('ย้อนแล้ว');
  };

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
    cam.yaw = Math.atan2(dx, dz); cam.dist = Math.max(20, Math.hypot(dx, dy, dz) * 2.5); cam.pitch = Math.max(0.6, Math.atan2(dy, Math.hypot(dx, dz)));
  };

  // ---- the page
  const root = document.createElement('div'); root.id = 'placeEditor';
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
  const pick = (sx, sy) => { aim(sx, sy); return R.pick(ray); };
  const onPlane = (sx, sy, y) => { plane.constant = -y; return aim(sx, sy).intersectPlane(plane, hitP) ? [hitP.x, hitP.z] : null; };

  // ---- fingers: one turns the view round (or drags the picked thing), two move it and zoom, a quick touch picks
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
      if (down && down.drag) settle();
      down = null; return;
    }
    down = { x, y, t: performance.now(), far: false, drag: null };
    if (sel >= 0 && pick(x, y) === sel) {                                    // on the picked thing: it goes where the finger goes
      const it = items[sel], gy = H(it.x, it.z), at = onPlane(x, y, gy);
      if (at) { remember(); down.drag = { y: gy, ox: it.x - at[0], oz: it.z - at[1] }; }
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
      const it = items[sel];
      it.x = at[0] + down.drag.ox; it.z = at[1] + down.drag.oz;
      down.drag.y = H(it.x, it.z);                                           // (the plane it slides on follows the ground under it)
      R.move(sel, it);
    } else { cam.yaw -= (x - last[0]) * 0.008; cam.pitch += (y - last[1]) * 0.006; }
  });
  const settle = () => { if (sel >= 0) R.settle(sel, items[sel]); panel(); };
  const up = e => {
    if (!fingers.has(e.pointerId)) return;
    const [x, y] = fingers.get(e.pointerId);
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (!down) return;
    const d = down; down = null;
    if (d.drag) { if (!d.far) history.pop(); else settle(); return; }       // (a touch on the picked thing that did not move it: no change)
    if (!d.far && performance.now() - d.t < 600) tap(x, y);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { cam.dist *= 1 + e.deltaY * 0.0012; }, { passive: true });
  const tap = (sx, sy) => { sel = pick(sx, sy); panel(); };

  // ---- words
  let sayTimer = 0, said = '';
  const say = text => { said = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => { said = ''; showHint(); }, 3200); showHint(); };
  const showHint = () => {
    hint.textContent = said || (sel >= 0 ? 'ลากของที่เลือกเพื่อย้าย · ลากที่อื่นเพื่อหมุนกล้อง · สองนิ้วเลื่อน/ซูม' : 'แตะบ้านหรือของชิ้นเล็กเพื่อเลือก · ลากเพื่อหมุนกล้อง · สองนิ้วเลื่อน/ซูม');
  };

  // ---- the buttons along the top, and the picked thing's panel at the bottom
  const top = () => {
    head.replaceChildren(row([
      btn('✕ ออก', close), btn('↶ ย้อน', undo),
      Object.assign(document.createElement('span'), { className: 'grow' }), btn('⋯', more), btn('💾 บันทึก', keep, 'go'),
    ]), hint);
    showHint();
  };
  const deg = v => Math.round(v * 180 / Math.PI);
  const norm = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
  const turnBy = d => { remember(); const it = items[sel]; it.yaw = norm(it.yaw + d); R.settle(sel, it); panel(); };
  const panel = () => {
    top();
    if (sel < 0) { foot.replaceChildren(); return; }
    const it = items[sel], b = base[sel], bad = R.clash(sel, it), moved = Math.hypot(it.x - b.x, it.z - b.z);
    const p = stop(document.createElement('div')); p.className = 'panel';
    const name = document.createElement('span'); name.className = 'name'; name.textContent = it.name;
    const note = document.createElement('div');
    note.className = bad ? 'bad' : 'ok';
    note.textContent = bad ? '⚠ ' + bad : moved > 0.05 || Math.abs(norm(it.yaw - b.yaw)) > 0.01 ? 'ย้ายจากที่เดิม ' + moved.toFixed(1) + ' ม.' : 'อยู่ที่เดิมของแมพ';
    const kids = [row([name]), note];
    if (it.turn) {
      const l = document.createElement('label'), nm = document.createElement('span'), inp = document.createElement('input'), val = document.createElement('span');
      nm.textContent = 'หมุน';
      Object.assign(inp, { type: 'range', min: -180, max: 180, step: 1, value: deg(norm(it.yaw)) });
      val.textContent = deg(norm(it.yaw)) + '°';
      let first = true;
      inp.addEventListener('pointerdown', () => { first = true; });
      inp.addEventListener('input', () => { if (first) { remember(); first = false; } it.yaw = +inp.value * Math.PI / 180; val.textContent = inp.value + '°'; R.move(sel, it); });
      inp.addEventListener('change', () => { R.settle(sel, it); panel(); });
      l.append(nm, inp, val);
      kids.push(l);
    }
    kids.push(row([
      ...(it.turn ? [btn('⟲ 15°', () => turnBy(Math.PI / 12)), btn('⟳ 15°', () => turnBy(-Math.PI / 12))] : []),
      Object.assign(document.createElement('span'), { className: 'grow' }),
      btn('↺ ที่เดิม', () => { remember(); Object.assign(it, { x: b.x, z: b.z, yaw: b.yaw }); R.settle(sel, it); panel(); say('กลับไปที่เดิมของแมพแล้ว'); }, 'warn'),
      btn('✓', () => { sel = -1; panel(); }),
    ]));
    p.append(...kids);
    foot.replaceChildren(p);
  };
  const more = () => {
    const out = document.createElement('textarea');
    const text = () => JSON.stringify({ map: 'hillvillage', v: 1, moves: save(items) });
    out.value = text();
    const use = (list, words) => { remember(); const was = items; items = list; sel = -1; resettle(was); closeSheet(); panel(); say(words); };
    openSheet('ของที่ย้ายทั้งหมดเป็นข้อความ: คัดลอกส่งให้ Claude เพื่อใส่ลงแมพถาวร (พื้นใต้บ้านจะถูกปรับ และแผนที่วาดใหม่) หรือวางข้อมูลที่เคยคัดลอกไว้', [
      out,
      btn('คัดลอกข้อมูล', () => {
        out.select(); const done = () => say('คัดลอกแล้ว ส่งให้ Claude ได้เลย');
        if (navigator.clipboard) navigator.clipboard.writeText(out.value).then(done, () => { document.execCommand('copy'); done(); }); else { document.execCommand('copy'); done(); }
      }, 'go'),
      btn('ใช้ข้อมูลนี้', () => {
        let moves = null; try { moves = JSON.parse(out.value).moves; } catch { /* not ours */ }
        if (Array.isArray(moves)) use(itemsFrom(base, moves), 'ใส่ข้อมูลแล้ว กดบันทึกเพื่อใช้จริง'); else say('ข้อความนี้ไม่ใช่ข้อมูลของที่ย้าย');
      }),
      btn('กลับเป็นแบบในแมพทั้งหมด', () => use(base.map(t => ({ ...t })), 'กลับเป็นแบบเดิมแล้ว กดบันทึกเพื่อใช้จริง'), 'warn'),
    ]);
  };
  const keep = () => {
    try {
      const moves = save(items);
      if (moves.length) localStorage.setItem(R.key, JSON.stringify({ map: 'hillvillage', v: 1, moves })); else localStorage.removeItem(R.key);
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({ cam, sel }));
    } catch { say('บันทึกไม่ได้ (เบราว์เซอร์ไม่ให้เก็บข้อมูล)'); return; }
    kept = JSON.stringify(save(items));
    say('บันทึกแล้ว กำลังโหลดแมพใหม่…');
    setTimeout(() => location.reload(), 350);
  };

  // ---- marks over the picture: a ring on the ground round the picked thing (red where it should not stand), its name above it
  const v3 = new THREE.Vector3();
  const toScreen = (x, y, z) => { v3.set(x, y, z).project(camera); return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * Hh, v3.z > -1 && v3.z < 1]; };
  const draw = () => {
    g.clearRect(0, 0, W, Hh);
    if (sel < 0) return;
    const it = items[sel], r = R.size(sel) + 0.4, bad = R.clash(sel, it);
    g.lineWidth = 3; g.strokeStyle = bad ? '#ff4d4d' : '#ffd23c'; g.setLineDash([10, 7]); g.beginPath();
    let pen = false;
    for (let i = 0; i <= 48; i++) {
      const a = i / 48 * Math.PI * 2, x = it.x + Math.cos(a) * r, z = it.z + Math.sin(a) * r, [px, py, ok] = toScreen(x, H(x, z) + 0.1, z);
      if (!ok) { pen = false; continue; }
      if (pen) g.lineTo(px, py); else g.moveTo(px, py);
      pen = true;
    }
    g.stroke(); g.setLineDash([]);
    const [px, py, ok] = toScreen(it.x, H(it.x, it.z) + R.top(sel), it.z);
    if (!ok) return;
    const label = it.name + (bad ? ' · ' + bad : '');
    g.font = '600 13px system-ui'; g.textAlign = 'center';
    const tw = g.measureText(label).width + 16;
    g.fillStyle = bad ? '#8a1c1cdd' : '#10243add'; g.beginPath(); g.roundRect(px - tw / 2, py - 24, tw, 22, 11); g.fill();
    g.fillStyle = '#fff'; g.fillText(label, px, py - 9);
  };

  // ---- open / close
  const open = (at = null) => {
    if (active) return;
    base = R.base(); items = R.items(); R.show(items);
    history = []; sel = -1; kept = JSON.stringify(save(items));
    if (at && at.cam) Object.assign(cam, at.cam); else lookFrom();
    if (at && at.sel >= 0 && at.sel < items.length) sel = at.sel;
    document.body.append(root);
    document.body.classList.add('placeEditing');
    fit(); active = true; panel();
    const rep = R.report || {};
    if (!at && rep.baked) say(rep.baked + ' ชิ้นที่เคยย้าย อยู่ในแมพถาวรแล้ว');
    else if (!at && rep.stale) say(rep.stale + ' ชิ้นที่เคยย้ายใช้ไม่ได้แล้ว เพราะแมพเปลี่ยน');
    else if (!at && rep.applied) say('ของ ' + rep.applied + ' ชิ้นย้ายไว้แล้ว (เก็บในเครื่องนี้)');
  };
  const close = () => {
    if (!active) return;
    if (changed() && !window.confirm('ยังไม่ได้บันทึก ออกโดยทิ้งการแก้ไขหรือไม่')) return;
    active = false; closeSheet(); root.remove();
    document.body.classList.remove('placeEditing');
    R.hide();                                                                // back to the village as it was built (what is kept)
  };
  addEventListener('resize', () => { if (active) fit(); });

  const api = {
    get active() { return active; },
    focus, open, close,
    apply() { if (!active) return; place(); draw(); },
    // (for tests)
    _state: () => ({ items, base, sel, cam, changed: changed(), history: history.length, moves: save(items) }),
    _tap: (x, y, z) => { place(); const [sx, sy] = toScreen(x, y, z); tap(sx, sy); },
    _drag: (x, z) => { if (sel < 0) return; remember(); Object.assign(items[sel], { x, z }); R.move(sel, items[sel]); settle(); },
    _turn: turnBy, _undo: undo, _save: keep, _more: more, _say: () => hint.textContent,
  };
  try {                                                                       // after "save" the map loads again: back to the same place
    const r = sessionStorage.getItem(RESUME_KEY);
    if (r) { sessionStorage.removeItem(RESUME_KEY); api.resume = JSON.parse(r); }
  } catch { /* nothing to resume */ }
  return api;
}
