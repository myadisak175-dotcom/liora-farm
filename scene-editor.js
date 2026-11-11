// Scene editor: fix the valley by hand, on a phone or with a mouse.
//
// Two ways of looking at the land while editing:
//   walk   (เดินแก้)  the game as it is played: walk to the spot and fix it there. Paint the ground with a brush (trodden earth,
//                     cobbles, or grass to take a way away) by tapping, or let the brush follow her feet and walk the way
//                     you want; put things down where you tap; take things out; move them.
//   top    (มุมบน)    straight down, north up: the same brush (drag a finger), every plant and rock as a dot to pick, drag or
//                     delete, and the village's ways as lines with points to drag, add and remove.
//
// What can be edited: the ground of the village (ways, yards, brush work) and every tree, bush, rock and flower bed the level
// put down, plus new ones. The ground shows at once; plants and rocks are built with the level, so those show when the edits
// are saved and the scene loads again (until then a mark says what will happen).
//
// Nothing here changes how the level lays itself out: the edits are a small list laid over it (see valley-level.js), kept in
// the browser (localStorage) and, once copied into valley-edits.js, in the game for everyone.
//
//   const editor = createSceneEditor({ level, camera, dom: renderer.domElement, player });
//   editor.open();                         // editor.active is true while it is open
//   each frame, after the player has set the camera:  if (editor.active) editor.apply(camera);

import * as THREE from 'three';

const KIND_COLOR = { tree: '#2fa457', bush: '#9bd94f', rock: '#aab0b8', flower: '#ff86bd' };
const TYPE_NAME = {
  broadleaf: 'ต้นใบกว้าง', oak: 'ต้นโอ๊ก', pine: 'ต้นสน', birch: 'ต้นเบิร์ช', sapling: 'ต้นอ่อน', round: 'พุ่มไม้', flowering: 'พุ่มดอก',
  boulder: 'หินก้อนใหญ่', slab: 'หินแผ่น', standing: 'หินตั้ง', crag: 'โขดหิน', stones: 'กองหิน', river: 'หินริมน้ำ', pebbles: 'กรวด', bed: 'แปลงดอกไม้',
};
// what can be added by hand: label, kind, type
const ADDABLE = [
  ['ต้นใบกว้าง', 'tree', 'broadleaf'], ['ต้นโอ๊ก', 'tree', 'oak'], ['ต้นสน', 'tree', 'pine'], ['ต้นเบิร์ช', 'tree', 'birch'], ['ต้นอ่อน', 'tree', 'sapling'],
  ['พุ่มไม้', 'bush', 'round'], ['พุ่มดอก', 'bush', 'flowering'], ['หินก้อนใหญ่', 'rock', 'boulder'], ['กองหิน', 'rock', 'stones'], ['โขดหิน', 'rock', 'crag'],
  ['ดอกไม้ชมพู', 'flower', 0], ['ดอกไม้เหลือง', 'flower', 1], ['ดอกไม้ม่วง', 'flower', 2], ['ดอกไม้ขาว', 'flower', 3], ['ดอกไม้ฟ้า', 'flower', 4],
];
const ADD_R = { tree: 2.6, bush: 0.9, rock: 1.0, flower: 1.8 };
const BRUSHES = [['ดิน', 0], ['หินปู', 1], ['หญ้า', 2]];                 // what the brush lays down
const SIZES = [['เล็ก', 0.6], ['กลาง', 1.0], ['ใหญ่', 1.7]];              // its radius, metres
const BRUSH_COLOR = ['#d9b77c', '#c9c2b0', '#7fc24a'];
const RESUME_KEY = 'liora.editor.resume';

const CSS = `
#sceneEditor { position:fixed; inset:0; z-index:60; touch-action:none; user-select:none; -webkit-user-select:none; font:600 13px system-ui, sans-serif; color:#16324a; pointer-events:none; }
#sceneEditor canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
#sceneEditor.top canvas { pointer-events:auto; }
#sceneEditor .bar { position:absolute; left:0; right:0; display:flex; flex-direction:column; gap:6px; padding:8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left)); pointer-events:none; }
#sceneEditor .head { top:env(safe-area-inset-top); }
#sceneEditor .foot { bottom:env(safe-area-inset-bottom); }
#sceneEditor .row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
#sceneEditor .foot .row { justify-content:center; }
#sceneEditor button { pointer-events:auto; border:1px solid #ffffffaa; border-radius:999px; padding:9px 12px; background:#ffffffee; color:#16324a; font:inherit; touch-action:manipulation; box-shadow:0 1px 4px #0003; }
#sceneEditor button.on { background:#1f6fd0; color:#fff; }
#sceneEditor button.go { background:#18a058; color:#fff; }
#sceneEditor button.warn { background:#fff0f0; color:#b3261e; }
#sceneEditor .grow { flex:1; }
#sceneEditor .hint { align-self:center; max-width:94%; padding:6px 12px; border-radius:12px; background:#10243acc; color:#fff; font-weight:500; text-align:center; }
#sceneEditor .sheet { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(92%, 380px); max-height:80%; overflow:auto; padding:14px; border-radius:16px; background:#fffffffa; box-shadow:0 8px 30px #0006; display:flex; flex-wrap:wrap; gap:8px; justify-content:center; pointer-events:auto; }
#sceneEditor .sheet p { width:100%; margin:0 0 4px; text-align:center; font-weight:500; }
#sceneEditor .sheet textarea { width:100%; height:120px; font:12px monospace; }
/* while editing, the game's own buttons and read-outs are put away: only the land and the editor are on screen (and, when
   walking, the stick she is steered with) */
body.sceneEditing > :not(#sceneEditor):not(canvas):not(script):not(style):not(#stick) { visibility:hidden !important; }
body.sceneEditing:not(.sceneWalk) > #stick { visibility:hidden !important; }
#editBtn { position:fixed; left:max(10px,env(safe-area-inset-left)); top:calc(164px + env(safe-area-inset-top)); z-index:4; border:1px solid #ffffff88; border-radius:999px; padding:9px 14px; background:#7a4fd0dc; color:white; font:600 12px system-ui; touch-action:manipulation; }
`;

export function createSceneEditor({ level, camera, dom = null, player = null }) {
  const ed = level.editor;
  if (!ed) return null;
  if (!document.getElementById('sceneEditorCss')) { const st = document.createElement('style'); st.id = 'sceneEditorCss'; st.textContent = CSS; document.head.append(st); }

  // ---- what is being edited (a working copy; nothing is kept until "save")
  let paths, yards, removed, moved, added, dabs, strokes = [], dirty = false;
  const load = () => {
    paths = ed.paths(); yards = ed.yards(); removed = new Set(ed.removed); moved = { ...ed.moved }; added = ed.added.map(a => ({ ...a })); dabs = ed.dabs.map(d => [...d]);
    strokes = []; dirty = false;
  };
  load();
  const snapshot = () => {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return {
      v: 1,
      paths: same(paths, ed.defaults.paths()) ? null : paths, yards: same(yards, ed.defaults.yards()) ? null : yards,
      dabs, removed: [...removed], moved, added,
    };
  };
  const round = v => Math.round(v * 100) / 100;

  // ---- state of the tool
  const cam = { x: 0, z: 0, h: 42, y: 0 };                                   // the top view: what it looks down on, from how high
  let active = false, view = 'walk', mode = 'paint', sel = null, tool = null, drawing = null, sheet = null, savedUp = null, redrawAt = 0, redrawDue = false;
  let brush = 0, brushR = 1.0, follow = false, lastDab = null, lastFlush = 0;
  const B = ed.box;

  // ---- the page
  const root = document.createElement('div'); root.id = 'sceneEditor';
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
  const closeSheet = () => { if (sheet) { sheet.remove(); sheet = null; } };
  const openSheet = (title, kids) => {
    closeSheet();
    sheet = document.createElement('div'); sheet.className = 'sheet';
    const p = document.createElement('p'); p.textContent = title;
    sheet.append(p, ...kids, btn('ปิด', closeSheet));
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) sheet.addEventListener(type, e => e.stopPropagation());
    root.append(sheet);
  };

  // ---- metres <-> pixels, through whatever the camera sees (straight down, or over her shoulder)
  let W = 1, H = 1, K = 1;                                    // K: screen pixels per metre, one metre from the camera
  const fit = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = root.clientWidth || innerWidth; H = root.clientHeight || innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    K = H / (2 * Math.tan(camera.fov * Math.PI / 360));
  };
  const v3 = new THREE.Vector3(), dir = new THREE.Vector3();
  const syncCamera = () => { camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); };
  // -> [screen x, screen y, in front of the camera?, pixels per metre there]
  const toScreen = (x, z) => {
    v3.set(x, ed.heightAt(x, z), z);
    const far = v3.distanceTo(camera.position);
    v3.project(camera);
    return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * H, v3.z > -1 && v3.z < 1, K / Math.max(1, far)];
  };
  // where a finger touches the land: walk out along the line of sight until it goes under the ground
  const toWorld = (sx, sy) => {
    v3.set(sx / W * 2 - 1, -(sy / H * 2 - 1), 0.5).unproject(camera);
    dir.copy(v3).sub(camera.position).normalize();
    const o = camera.position, under = t => o.y + dir.y * t <= ed.heightAt(o.x + dir.x * t, o.z + dir.z * t);
    let a = 0, t = 0.5;
    for (let i = 0; i < 110 && !under(t); i++) { a = t; t += Math.max(0.4, t * 0.06); if (t > 600) return null; }
    if (!under(t)) return null;
    for (let i = 0; i < 9; i++) { const m = (a + t) / 2; if (under(m)) t = m; else a = m; }
    return [o.x + dir.x * t, o.z + dir.z * t];
  };
  const inBox = (x, z) => x >= B.x0 + 1 && x <= B.x1 - 1 && z >= B.z0 + 1 && z <= B.z1 - 1;
  const clampBox = (x, z) => [Math.min(B.x1 - 1, Math.max(B.x0 + 1, x)), Math.min(B.z1 - 1, Math.max(B.z0 + 1, z))];

  // ---- the ground is redrawn as the ways change (not more often than the phone can take)
  const redrawWays = (now = false) => {
    const t = performance.now();
    if (!now && t - redrawAt < 160) { redrawDue = true; return; }
    redrawAt = t; redrawDue = false;
    const live = drawing && drawing.pts.length >= 2 ? [...paths, drawing] : paths;
    ed.drawWays(live, yards, dabs);
  };
  const changed = () => { dirty = true; };

  // ---- the brush: one dab on the ground, shown at once
  const dab = (x, z, newStroke = false, quiet = false) => {
    if (!inBox(x, z)) { if (!quiet) say('ระบายได้เฉพาะในเขตหมู่บ้าน'); return false; }
    if (!newStroke && lastDab && lastDab[3] === brush && Math.hypot(x - lastDab[0], z - lastDab[1]) < brushR * 0.45) return false;
    if (newStroke || !strokes.length) strokes.push(dabs.length);
    lastDab = [round(x), round(z), brushR, brush];
    dabs.push(lastDab);
    ed.stamp(lastDab[0], lastDab[1], brushR, brush);
    changed();
    return true;
  };
  const undoStroke = () => {
    if (!strokes.length) return say('ไม่มีรอยระบายให้ย้อน');
    dabs.length = strokes.pop(); lastDab = null;
    redrawWays(true); changed(); say('ย้อนรอยระบายล่าสุดแล้ว (หญ้าจะกลับมาหลังบันทึก)');
  };

  // ---- where a thing stands now
  const posOf = it => moved[it.key] || [it.x, it.z];
  const itemByKey = new Map(ed.items.map(it => [it.key, it]));

  // ---- what is under a finger
  const near = (sx, sy, x, z, r) => { const [px, py, ok] = toScreen(x, z); const d = Math.hypot(px - sx, py - sy); return ok && d <= r ? d : -1; };
  const hitTest = (sx, sy) => {
    let best = null, bd = 1e9;
    const take = (d, h) => { if (d >= 0 && d < bd) { bd = d; best = h; } };
    if (mode === 'ways') {
      paths.forEach((w, pi) => w.pts.forEach((p, i) => take(near(sx, sy, p[0], p[1], 26), { type: 'pt', pi, i })));
      yards.forEach((y, i) => { take(near(sx, sy, y.x, y.z, 26), { type: 'yard', i, part: 'c' }); take(near(sx, sy, y.x + y.r, y.z, 24), { type: 'yard', i, part: 'r' }); });
      if (best) return best;
      paths.forEach((w, pi) => {                                                      // on a line between two points
        for (let i = 0; i < w.pts.length - 1; i++) {
          const [ax, ay] = toScreen(w.pts[i][0], w.pts[i][1]), [bx, by] = toScreen(w.pts[i + 1][0], w.pts[i + 1][1]);
          const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / (dx * dx + dy * dy || 1)));
          const d = Math.hypot(sx - ax - dx * t, sy - ay - dy * t);
          if (d < 16) take(d, { type: 'seg', pi, i });
        }
      });
      return best;
    }
    if (mode !== 'plants') return null;
    const reach = view === 'walk' ? 38 : 24, c = camera.position;
    for (const it of ed.items) {
      const p = posOf(it);
      if (view === 'walk' && Math.hypot(p[0] - c.x, p[1] - c.z) > 45) continue;       // only what is near enough to tell apart
      take(near(sx, sy, p[0], p[1], reach), { type: 'item', key: it.key });
    }
    added.forEach((a, i) => take(near(sx, sy, a.x, a.z, reach), { type: 'add', i }));
    return best;
  };
  const sameSel = (a, b) => a && b && a.type === b.type && a.pi === b.pi && a.i === b.i && a.part === b.part && a.key === b.key;

  // ---- top view: one finger drags the view (or what is selected, or the brush), two fingers move and zoom, a tap picks
  const fingers = new Map();
  let down = null, pinch = null;
  const local = e => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const mid = () => { const [a, b] = [...fingers.values()]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(a[0] - b[0], a[1] - b[1])]; };
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    fingers.set(e.pointerId, [x, y]);
    if (fingers.size === 2) { const [mx, my, d] = mid(); pinch = { d, h: cam.h, mx, my, cx: cam.x, cz: cam.z }; down = null; return; }
    const hit = hitTest(x, y);
    down = { x, y, cx: cam.x, cz: cam.z, hit, drag: sameSel(hit, sel) && hit.type !== 'seg', paint: mode === 'paint', far: false };
    if (down.paint) { const w = toWorld(x, y); if (w) dab(w[0], w[1], true); }
  });
  cv.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    const [x, y] = local(e);
    fingers.set(e.pointerId, [x, y]);
    if (pinch && fingers.size >= 2) {
      const [mx, my, d] = mid(), s = cam.h / K;
      cam.h = Math.min(110, Math.max(9, pinch.h * pinch.d / Math.max(20, d)));
      cam.x = pinch.cx - (mx - pinch.mx) * s; cam.z = pinch.cz - (my - pinch.my) * s;
      return;
    }
    if (!down) return;
    if (!down.far && Math.hypot(x - down.x, y - down.y) > 9) down.far = true;
    if (down.paint) { const w = toWorld(x, y); if (w) dab(w[0], w[1]); return; }
    if (!down.far) return;
    if (down.drag) {
      const w = toWorld(x, y);
      if (!w) return;
      let [wx, wz] = w;
      const s = sel;
      if (s.type === 'pt') { [wx, wz] = clampBox(wx, wz); paths[s.pi].pts[s.i] = [round(wx), round(wz)]; redrawWays(); }
      else if (s.type === 'yard') {
        const yd = yards[s.i];
        if (s.part === 'c') { [wx, wz] = clampBox(wx, wz); yd.x = round(wx); yd.z = round(wz); } else yd.r = round(Math.min(9, Math.max(1.2, Math.hypot(wx - yd.x, wz - yd.z))));
        redrawWays();
      } else if (s.type === 'item') moved[s.key] = [round(wx), round(wz)];
      else if (s.type === 'add') { added[s.i].x = round(wx); added[s.i].z = round(wz); }
      changed();
    } else {                                                                          // drag the view
      const d = cam.h / K;
      cam.x = down.cx - (x - down.x) * d; cam.z = down.cz - (y - down.y) * d;
    }
  });
  const up = e => {
    if (!fingers.has(e.pointerId)) return;
    const [x, y] = fingers.get(e.pointerId);
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (!down) return;
    const d = down; down = null;
    if (d.paint) { buttons(); return; }
    if (d.far) { if (d.drag && (sel.type === 'pt' || sel.type === 'yard')) redrawWays(true); buttons(); return; }
    tapAt(d.hit, x, y);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { cam.h = Math.min(110, Math.max(9, cam.h * (1 + e.deltaY * 0.0012))); }, { passive: true });

  // ---- walk view: the game keeps its own touches (stick, look); a quick touch that did not drag is a tap for the editor
  if (dom) {
    const taps = new Map();
    dom.addEventListener('pointerdown', e => { if (active && view === 'walk') taps.set(e.pointerId, [e.clientX, e.clientY, performance.now()]); });
    dom.addEventListener('pointerup', e => {
      const t = taps.get(e.pointerId); taps.delete(e.pointerId);
      if (!t || !active || view !== 'walk' || performance.now() - t[2] > 350 || Math.hypot(e.clientX - t[0], e.clientY - t[1]) > 10) return;
      const r = root.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      tapAt(hitTest(x, y), x, y);
    });
    dom.addEventListener('pointercancel', e => taps.delete(e.pointerId));
  }

  const tapAt = (hit, sx, sy) => {
    const w = toWorld(sx, sy);
    if (!w) return;
    const [wx, wz] = w;
    if (mode === 'paint') { dab(wx, wz, true); buttons(); return; }
    if (mode === 'ways') {
      if (tool === 'path') {
        if (!inBox(wx, wz)) return say('วาดทางได้เฉพาะในเขตหมู่บ้าน (กรอบเส้นประ)');
        if (!drawing) drawing = { pts: [], wide: true };
        drawing.pts.push([round(wx), round(wz)]);
        redrawWays(true); changed(); buttons(); return;
      }
      if (tool === 'yard') {
        if (!inBox(wx, wz)) return say('วางลานได้เฉพาะในเขตหมู่บ้าน (กรอบเส้นประ)');
        yards.push({ x: round(wx), z: round(wz), r: 2.5, paved: false });
        sel = { type: 'yard', i: yards.length - 1, part: 'c' }; tool = null;
        redrawWays(true); changed(); buttons(); return;
      }
      if (hit && hit.type === 'seg') {                                                // a new point on the line
        paths[hit.pi].pts.splice(hit.i + 1, 0, [round(wx), round(wz)]);
        sel = { type: 'pt', pi: hit.pi, i: hit.i + 1 };
        redrawWays(true); changed(); buttons(); return;
      }
      sel = hit; buttons(); return;
    }
    // plants and rocks
    if (tool && tool.kind) {
      added.push({ kind: tool.kind, type: tool.type, x: round(wx), z: round(wz), scale: 1 });
      sel = { type: 'add', i: added.length - 1 };
      changed(); buttons(); return;
    }
    if (tool === 'delete') {
      if (!hit) return say('แตะที่จุดสีของต้นไม้ พุ่มไม้ หิน หรือดอกไม้ที่จะลบ');
      if (hit.type === 'add') { added.splice(hit.i, 1); sel = null; } else if (removed.has(hit.key)) removed.delete(hit.key); else removed.add(hit.key);
      changed(); buttons(); return;
    }
    if (tool === 'move' && sel && !hit) {                                             // put what is picked down here
      if (sel.type === 'item') moved[sel.key] = [round(wx), round(wz)]; else { added[sel.i].x = round(wx); added[sel.i].z = round(wz); }
      changed(); buttons(); return;
    }
    sel = hit; buttons();
  };

  // ---- words
  let sayTimer = 0, said = '';
  const say = text => { said = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => { said = ''; showHint(); }, 2800); showHint(); };
  const showHint = () => {
    let t = said;
    if (!t) {
      if (mode === 'paint') t = view === 'walk' ? (follow ? 'เดินไปตามทางที่อยากได้ แปรงจะระบายตามเท้า' : 'แตะพื้นเพื่อระบาย หรือเปิด 👣 ตามเท้า แล้วเดิน') : 'ลากนิ้วบนพื้นเพื่อระบาย · สองนิ้วเลื่อนและซูม';
      else if (mode === 'ways') t = tool === 'path' ? 'แตะบนพื้นทีละจุดเพื่อวาดทาง แล้วกด ✓ เสร็จ' : tool === 'yard' ? 'แตะจุดที่จะวางลาน' : sel ? 'ลากจุดที่เลือกเพื่อย้าย · แตะบนเส้นเพื่อเพิ่มจุด' : 'แตะจุดบนทางเพื่อเลือก · ลากพื้นเพื่อเลื่อน · ถ่างนิ้วเพื่อซูม';
      else if (tool && tool.kind) t = 'แตะบนพื้นเพื่อวาง' + tool.label + ' (วางได้หลายอัน)';
      else if (tool === 'delete') t = 'แตะจุดสีของสิ่งที่จะลบ (แตะซ้ำเพื่อเอากลับ) · เห็นผลจริงหลังบันทึก';
      else if (tool === 'move') t = sel ? 'แตะพื้นตรงที่จะย้ายไป · เห็นผลจริงหลังบันทึก' : 'แตะจุดสีของสิ่งที่จะย้าย แล้วแตะพื้นที่ใหม่';
      else t = sel ? 'ลากเพื่อย้าย หรือกดลบ · เห็นผลจริงหลังบันทึก' : 'แตะจุดสีบนต้นไม้ พุ่มไม้ หิน หรือดอกไม้เพื่อเลือก';
    }
    hint.textContent = t;
  };

  // ---- buttons
  const finishDrawing = () => {
    if (drawing) { if (drawing.pts.length >= 2) { paths.push(drawing); sel = { type: 'pt', pi: paths.length - 1, i: drawing.pts.length - 1 }; } drawing = null; redrawWays(true); }
    if (tool === 'path') tool = null;
  };
  const setMode = (m, t = null) => {
    finishDrawing();
    mode = m; sel = null; tool = t; lastDab = null;
    if (view === 'top') ed.show({ grass: false, trees: m === 'plants' });
    buttons();
  };
  const setView = v => {
    if (v === view && active) return;
    finishDrawing();
    if (v === 'walk') {
      camera.up.copy(savedUp);
      ed.show({ grass: true, trees: true });
      if (player && view === 'top' && ed.walkable(cam.x, cam.z)) player.teleport(cam.x, cam.z);      // come down where the top view was looking
      if (mode === 'ways') { mode = 'paint'; sel = null; tool = null; }
    } else {
      if (player && view === 'walk') { cam.x = player.position.x; cam.z = player.position.z; }
      cam.y = ed.heightAt(cam.x, cam.z);
      follow = false;
      ed.show({ grass: false, trees: mode === 'plants' });
    }
    view = v;
    root.classList.toggle('top', v === 'top');
    document.body.classList.toggle('sceneWalk', v === 'walk');
    buttons();
  };
  const pickAdd = () => openSheet('เลือกสิ่งที่จะวาง แล้วแตะบนพื้น', ADDABLE.map(([label, kind, type]) => btn(label, () => { closeSheet(); setMode('plants', { kind, type, label }); })));
  const buttons = () => {
    const walk = view === 'walk', rows = [];
    rows.push(row([
      btn('✕ ออก', close), btn('🚶 เดินแก้', () => setView('walk'), walk ? 'on' : ''), btn('🗺 มุมบน', () => setView('top'), walk ? '' : 'on'),
      Object.assign(document.createElement('span'), { className: 'grow' }), btn('⋯', more), btn('💾 บันทึก', save, 'go'),
    ]));
    const placing = mode === 'plants' && tool && tool.kind;
    if (walk) rows.push(row([
      btn('🖌 ระบาย', () => setMode('paint'), mode === 'paint' ? 'on' : ''), btn('＋ วาง', pickAdd, placing ? 'on' : ''),
      btn('🗑 ลบ', () => setMode('plants', 'delete'), tool === 'delete' ? 'on' : ''), btn('✋ ย้าย', () => setMode('plants', 'move'), tool === 'move' ? 'on' : ''),
    ]));
    else rows.push(row([
      btn('🖌 ระบาย', () => setMode('paint'), mode === 'paint' ? 'on' : ''), btn('พืชและหิน', () => setMode('plants'), mode === 'plants' ? 'on' : ''), btn('เส้นทาง', () => setMode('ways'), mode === 'ways' ? 'on' : ''),
    ]));
    // what goes with the tool in hand
    const b = [];
    if (mode === 'paint') {
      for (const [label, k] of BRUSHES) b.push(btn(label, () => { brush = k; lastDab = null; buttons(); }, brush === k ? 'on' : ''));
      for (const [label, r] of SIZES) b.push(btn(label, () => { brushR = r; lastDab = null; buttons(); }, brushR === r ? 'on' : ''));
      if (walk) b.push(btn(follow ? '👣 ตามเท้า: เปิด' : '👣 ตามเท้า', () => { follow = !follow; lastDab = null; buttons(); }, follow ? 'go' : ''));
      b.push(btn('↶ ย้อน', undoStroke));
    } else if (mode === 'ways') {
      if (tool === 'path') b.push(btn('✓ เสร็จ', () => { finishDrawing(); buttons(); }, 'go'));
      else {
        b.push(btn('＋ ทางใหม่', () => { tool = 'path'; sel = null; buttons(); }), btn('＋ ลาน', () => { tool = tool === 'yard' ? null : 'yard'; sel = null; buttons(); }, tool === 'yard' ? 'on' : ''));
        if (sel && sel.type === 'pt') {
          const w = paths[sel.pi];
          b.push(btn(w.wide ? 'ทางกว้าง → แคบ' : 'ทางแคบ → กว้าง', () => { w.wide = !w.wide; redrawWays(true); changed(); buttons(); }));
          b.push(btn('ลบจุด', () => { w.pts.splice(sel.i, 1); if (w.pts.length < 2) paths.splice(sel.pi, 1); sel = null; redrawWays(true); changed(); buttons(); }, 'warn'));
          b.push(btn('ลบทั้งเส้น', () => { paths.splice(sel.pi, 1); sel = null; redrawWays(true); changed(); buttons(); }, 'warn'));
        }
        if (sel && sel.type === 'yard') {
          const y = yards[sel.i];
          b.push(btn(y.paved ? 'ลานหินปู → ดิน' : 'ลานดิน → หินปู', () => { y.paved = !y.paved; redrawWays(true); changed(); buttons(); }));
          b.push(btn('ลบลาน', () => { yards.splice(sel.i, 1); sel = null; redrawWays(true); changed(); buttons(); }, 'warn'));
        }
      }
    } else {
      if (placing) b.push(btn('กำลังวาง: ' + tool.label, pickAdd, 'on'), btn('✓ เสร็จ', () => setMode('plants'), 'go'));
      else if (!walk) b.push(btn('＋ เพิ่ม…', pickAdd));
      if (!placing && tool !== 'delete') {
        if (sel && sel.type === 'item') {
          const gone = removed.has(sel.key);
          b.push(btn(gone ? '↩ เอากลับมา' : 'ลบ', () => { if (gone) removed.delete(sel.key); else removed.add(sel.key); changed(); buttons(); }, gone ? '' : 'warn'));
          if (moved[sel.key]) b.push(btn('↩ กลับที่เดิม', () => { delete moved[sel.key]; changed(); buttons(); }));
        }
        if (sel && sel.type === 'add') b.push(btn('ลบ', () => { added.splice(sel.i, 1); sel = null; changed(); buttons(); }, 'warn'));
      }
    }
    // walking: everything sits at the top, the bottom of the screen is for steering her; from above: tools at the bottom
    if (walk) { head.replaceChildren(...rows, row(b), hint); foot.replaceChildren(); } else { head.replaceChildren(...rows); foot.replaceChildren(hint, row(b)); }
    showHint();
  };
  const more = () => {
    const out = document.createElement('textarea');
    out.value = JSON.stringify(snapshot());
    const reset = all => { paths = ed.defaults.paths(); yards = ed.defaults.yards(); dabs = []; strokes = []; if (all) { removed = new Set(); moved = {}; added = []; } sel = null; closeSheet(); redrawWays(true); changed(); buttons(); say('ล้างแล้ว กดบันทึกเพื่อใช้จริง'); };
    openSheet('ข้อมูลการแก้ไข: คัดลอกส่งให้ Claude เพื่อบันทึกถาวรลงเกม หรือวางข้อมูลที่เคยคัดลอกไว้แล้วกด "ใช้ข้อมูลนี้"', [
      out,
      btn('คัดลอกข้อมูล', () => { out.select(); const done = () => say('คัดลอกแล้ว'); if (navigator.clipboard) navigator.clipboard.writeText(out.value).then(done, () => { document.execCommand('copy'); done(); }); else { document.execCommand('copy'); done(); } }),
      btn('ใช้ข้อมูลนี้', () => {
        try {
          const e = JSON.parse(out.value);
          paths = Array.isArray(e.paths) ? e.paths : ed.defaults.paths(); yards = Array.isArray(e.yards) ? e.yards : ed.defaults.yards(); dabs = Array.isArray(e.dabs) ? e.dabs : []; strokes = [];
          removed = new Set(e.removed || []); moved = { ...(e.moved || {}) }; added = Array.isArray(e.added) ? e.added : [];
          sel = null; closeSheet(); redrawWays(true); changed(); buttons(); say('ใส่ข้อมูลแล้ว กดบันทึกเพื่อใช้จริง');
        } catch (err) { say('ข้อมูลไม่ถูกต้อง'); }
      }),
      btn('พื้นและทางกลับเป็นแบบเดิม', () => reset(false), 'warn'),
      btn('ล้างการแก้ทั้งหมด', () => reset(true), 'warn'),
    ]);
  };
  const save = () => {
    finishDrawing();
    try {
      localStorage.setItem(ed.key, JSON.stringify(snapshot()));
      const p = player ? player.position : null;
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({ x: cam.x, z: cam.z, h: cam.h, mode, view, px: p ? p.x : 0, pz: p ? p.z : 0, yaw: player ? player.heading : 0 }));
    } catch (err) { say('บันทึกไม่ได้ (เบราว์เซอร์ไม่ให้เก็บข้อมูล)'); return; }
    say('บันทึกแล้ว กำลังโหลดฉากใหม่…');
    setTimeout(() => location.reload(), 350);
  };

  // ---- drawing the marks
  const draw = () => {
    g.clearRect(0, 0, W, H);
    const top = view === 'top', ways = mode === 'ways';
    const line = (pts, color, width) => {
      g.strokeStyle = color; g.lineWidth = width; g.lineJoin = g.lineCap = 'round'; g.beginPath();
      let pen = false;
      for (const p of pts) { const [x, y, ok] = toScreen(p[0], p[1]); if (!ok) { pen = false; continue; } if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; }
      g.stroke();
    };
    const dot = (x, z, r, fill, ring) => { const [px, py, ok] = toScreen(x, z); if (!ok) return; g.beginPath(); g.arc(px, py, r, 0, 6.2832); g.fillStyle = fill; g.fill(); if (ring) { g.lineWidth = 3; g.strokeStyle = ring; g.stroke(); } };
    const ring = (x, z, r, color, width) => { const pts = []; for (let i = 0; i <= 28; i++) pts.push([x + Math.cos(i / 28 * 6.2832) * r, z + Math.sin(i / 28 * 6.2832) * r]); line(pts, color, width); };
    if (top) {
      // the ground that can be painted and that ways can be drawn on
      g.setLineDash([8, 8]); line([[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1], [B.x0, B.z0]], '#ffffffaa', 1.5); g.setLineDash([]);
      for (const r of ed.ramps) line(r, '#ffffff66', 3);                               // ramps are cut into the land: shown, not editable
      const all = drawing ? [...paths, drawing] : paths;
      all.forEach((w, pi) => {
        const on = ways && sel && sel.type === 'pt' && sel.pi === pi;
        line(w.pts, '#10243a88', w.wide ? 7 : 5); line(w.pts, w === drawing ? '#ffe14d' : on ? '#ffd23c' : ways ? '#fff6c8' : '#fff6c855', w.wide ? 4 : 2.5);
        if (ways) w.pts.forEach((p, i) => dot(p[0], p[1], on && sel.i === i ? 10 : 6.5, on && sel.i === i ? '#ff7a1a' : '#ffffff', '#10243a'));
      });
      yards.forEach((y, i) => {
        const on = ways && sel && sel.type === 'yard' && sel.i === i;
        ring(y.x, y.z, y.r, on ? '#ffd23c' : ways ? '#fff6c8' : '#fff6c855', on ? 4 : 2.5);
        if (ways) { dot(y.x, y.z, on ? 10 : 6.5, on ? '#ff7a1a' : y.paved ? '#c9c2b0' : '#e3cc98', '#10243a'); dot(y.x + y.r, y.z, 6, '#ffffff', '#10243a'); }
      });
    }
    if (mode === 'paint') {                                                             // where the brush is, and how big
      if (!top && follow && player) ring(player.position.x, player.position.z, brushR, BRUSH_COLOR[brush], 3);
      else if (lastDab) ring(lastDab[0], lastDab[1], lastDab[2], BRUSH_COLOR[brush] + 'cc', 2.5);
    }
    if (mode === 'plants') {
      const c = camera.position;
      const mark = (x, z, r, kind, on, gone) => {
        if (!top && Math.hypot(x - c.x, z - c.z) > 45) return;
        const [px, py, ok, ppm] = toScreen(x, z);
        if (!ok || px < -30 || px > W + 30 || py < -30 || py > H + 30) return;
        const rr = Math.min(18, Math.max(top ? 5 : 7, r * ppm * 0.4));
        g.beginPath(); g.arc(px, py, on ? rr + 3 : rr, 0, 6.2832);
        g.fillStyle = gone ? '#00000066' : KIND_COLOR[kind] || '#fff'; g.fill();
        g.lineWidth = on ? 3.5 : 1.5; g.strokeStyle = on ? '#ffffff' : '#10243a'; g.stroke();
        if (gone) { g.strokeStyle = '#ff3b30'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(px - rr, py - rr); g.lineTo(px + rr, py + rr); g.moveTo(px + rr, py - rr); g.lineTo(px - rr, py + rr); g.stroke(); }
      };
      for (const it of ed.items) {
        const p = posOf(it), on = sel && sel.type === 'item' && sel.key === it.key;
        if (moved[it.key]) { g.setLineDash([5, 5]); line([[it.x, it.z], p], '#ffffffcc', 2); g.setLineDash([]); }
        mark(p[0], p[1], it.r, it.kind, on, removed.has(it.key));
      }
      added.forEach((a, i) => {
        mark(a.x, a.z, ADD_R[a.kind] || 1, a.kind, sel && sel.type === 'add' && sel.i === i, false);
        const [px, py, ok] = toScreen(a.x, a.z);
        if (ok && (top || Math.hypot(a.x - c.x, a.z - c.z) <= 45)) { g.fillStyle = '#fff'; g.font = '700 13px system-ui'; g.textAlign = 'center'; g.fillText('+', px, py + 4.5); }
      });
      const s = sel && (sel.type === 'item' ? itemByKey.get(sel.key) : sel.type === 'add' ? added[sel.i] : null);
      if (s) {                                                                          // what the picked thing is
        const p = sel.type === 'item' ? posOf(s) : [s.x, s.z], [px, py, ok] = toScreen(p[0], p[1]);
        if (ok) {
          const name = s.kind === 'flower' ? 'แปลงดอกไม้' : TYPE_NAME[s.type] || s.type;
          g.font = '600 13px system-ui'; g.textAlign = 'center';
          const tw = g.measureText(name).width + 14;
          g.fillStyle = '#10243add'; g.beginPath(); g.roundRect(px - tw / 2, py - 44, tw, 22, 11); g.fill();
          g.fillStyle = '#fff'; g.fillText(name, px, py - 29);
        }
      }
    }
  };

  // ---- open / close
  const open = (at = null) => {
    if (active) return;
    load();
    savedUp = camera.up.clone();
    cam.x = at && at.x !== undefined ? at.x : camera.position.x; cam.z = at && at.z !== undefined ? at.z : camera.position.z; cam.h = at && at.h ? at.h : 42;
    cam.y = ed.heightAt(cam.x, cam.z);
    document.body.append(root);
    document.body.classList.add('sceneEditing');
    fit();
    mode = at && at.mode ? at.mode : 'paint'; tool = null; sel = null; follow = false; view = null;
    if (at && at.view === 'walk' && player && at.px !== undefined) player.teleport(at.px, at.pz, at.yaw);
    active = true;
    setView(at && at.view === 'top' ? 'top' : 'walk');
    redrawWays(true);
  };
  const close = () => {
    if (!active) return;
    if (dirty && !window.confirm('ยังไม่ได้บันทึก ออกโดยทิ้งการแก้ไขหรือไม่')) return;
    active = false;
    closeSheet(); root.remove();
    document.body.classList.remove('sceneEditing', 'sceneWalk');
    camera.up.copy(savedUp);
    const wasDirty = dirty;
    load();
    ed.drawWays(paths, yards, dabs);                                                   // back to what is saved
    ed.show({ grass: true, trees: true });
    if (wasDirty) location.reload();                                                   // the grass was laid low by brush work that is now thrown away: build it again
  };
  addEventListener('resize', () => { if (active) fit(); });

  const api = {
    get active() { return active; },
    open, close,
    // each frame, after the player has placed the camera
    apply(cameraNow) {
      if (!active) return;
      if (view === 'top') {                                                             // look straight down instead
        cam.y += (ed.heightAt(cam.x, cam.z) - cam.y) * 0.15;
        cameraNow.up.set(0, 0, -1);
        cameraNow.position.set(cam.x, cam.y + cam.h, cam.z);
        cameraNow.lookAt(cam.x, cam.y, cam.z);
      } else if (follow && mode === 'paint' && player) dab(player.position.x, player.position.z, false, true);      // the brush goes where she walks
      syncCamera();
      if (redrawDue) redrawWays();
      const t = performance.now();
      if (t - lastFlush > 220) { lastFlush = t; ed.flush(); }
      draw();
    },
    // (for tests) the working copy and the view
    _state: () => ({ paths, yards, dabs, removed: [...removed], moved, added, cam, view, mode, tool, sel, dirty, follow }),
    _tap: (x, z) => { const [sx, sy] = toScreen(x, z); tapAt(hitTest(sx, sy), sx, sy); },
    _setMode: setMode, _setView: setView, _snapshot: snapshot, _screen: (x, z) => toScreen(x, z).slice(0, 2), _world: toWorld,
  };
  // after "save" the scene loads again: come back to the same place in the editor
  try {
    const r = sessionStorage.getItem(RESUME_KEY);
    if (r) { sessionStorage.removeItem(RESUME_KEY); api.resume = JSON.parse(r); }
  } catch (err) { /* nothing to resume */ }
  return api;
}
