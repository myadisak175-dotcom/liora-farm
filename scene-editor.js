// Scene editor: fix the valley by hand, on a phone or with a mouse.
//
// It looks straight down on the land (north up). Two kinds of thing can be worked on:
//   ways    the trodden ways of the village and its yards: drag a point, add one on a line, draw a new way, make a way
//           broad or narrow, move / size / pave a yard. The ground redraws as you drag.
//   plants  every tree, bush, rock and flower bed the level put down: take one out, move it, put it back, add new ones.
//           These are rebuilt with the level, so they change when the edits are saved and the scene loads again.
//
// Nothing here changes how the level lays itself out: the edits are a small list laid over it (see valley-level.js), kept in
// the browser (localStorage) and, once copied into valley-edits.js, in the game for everyone.
//
//   const editor = createSceneEditor({ level, camera });
//   editor.open();                         // editor.active is true while it is open
//   each frame, after the player has set the camera:  if (editor.active) editor.apply(camera);

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
const RESUME_KEY = 'liora.editor.resume';

const CSS = `
#sceneEditor { position:fixed; inset:0; z-index:60; touch-action:none; user-select:none; -webkit-user-select:none; font:600 13px system-ui, sans-serif; color:#16324a; }
#sceneEditor canvas { position:absolute; inset:0; width:100%; height:100%; }
#sceneEditor .bar { position:absolute; left:0; right:0; display:flex; flex-wrap:wrap; gap:6px; padding:8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left)); align-items:center; pointer-events:none; }
#sceneEditor .top { top:env(safe-area-inset-top); }
#sceneEditor .bottom { bottom:env(safe-area-inset-bottom); justify-content:center; }
#sceneEditor .row { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; width:100%; }
#sceneEditor button { pointer-events:auto; border:1px solid #ffffffaa; border-radius:999px; padding:9px 13px; background:#ffffffee; color:#16324a; font:inherit; touch-action:manipulation; box-shadow:0 1px 4px #0003; }
#sceneEditor button.on { background:#1f6fd0; color:#fff; }
#sceneEditor button.go { background:#18a058; color:#fff; }
#sceneEditor button.warn { background:#fff0f0; color:#b3261e; }
#sceneEditor .grow { flex:1; }
#sceneEditor .hint { margin:0 auto; max-width:92%; padding:6px 12px; border-radius:12px; background:#10243acc; color:#fff; font-weight:500; text-align:center; pointer-events:none; }
#sceneEditor .sheet { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(92%, 380px); max-height:80%; overflow:auto; padding:14px; border-radius:16px; background:#fffffffa; box-shadow:0 8px 30px #0006; display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
#sceneEditor .sheet p { width:100%; margin:0 0 4px; text-align:center; font-weight:500; }
#sceneEditor .sheet textarea { width:100%; height:120px; font:12px monospace; }
/* while editing, the game's own buttons and read-outs are put away: only the land and the editor are on screen */
body.sceneEditing > :not(#sceneEditor):not(canvas):not(script):not(style) { visibility:hidden !important; }
#editBtn { position:fixed; left:max(10px,env(safe-area-inset-left)); top:calc(164px + env(safe-area-inset-top)); z-index:4; border:1px solid #ffffff88; border-radius:999px; padding:9px 14px; background:#7a4fd0dc; color:white; font:600 12px system-ui; touch-action:manipulation; }
`;

export function createSceneEditor({ level, camera }) {
  const ed = level.editor;
  if (!ed) return null;
  if (!document.getElementById('sceneEditorCss')) { const st = document.createElement('style'); st.id = 'sceneEditorCss'; st.textContent = CSS; document.head.append(st); }

  // ---- what is being edited (a working copy; nothing is kept until "save")
  let paths, yards, removed, moved, added, dirty = false;
  const load = () => { paths = ed.paths(); yards = ed.yards(); removed = new Set(ed.removed); moved = { ...ed.moved }; added = ed.added.map(a => ({ ...a })); dirty = false; };
  load();
  const snapshot = () => {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return {
      v: 1,
      paths: same(paths, ed.defaults.paths()) ? null : paths, yards: same(yards, ed.defaults.yards()) ? null : yards,
      removed: [...removed], moved, added,
    };
  };
  const round = v => Math.round(v * 100) / 100;

  // ---- state of the tool
  const cam = { x: 0, z: 0, h: 42, y: 0 };
  let active = false, mode = 'ways', sel = null, tool = null, drawing = null, sheet = null, savedUp = null, redrawAt = 0, redrawDue = false;
  const B = ed.box;

  // ---- the page
  const root = document.createElement('div'); root.id = 'sceneEditor';
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const top = document.createElement('div'); top.className = 'bar top';
  const bottom = document.createElement('div'); bottom.className = 'bar bottom';
  const hint = document.createElement('div'); hint.className = 'hint';
  const row = document.createElement('div'); row.className = 'row';
  bottom.append(hint, row);                                   // the words sit just above the buttons, however many rows those take
  root.append(cv, top, bottom);
  const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
  const closeSheet = () => { if (sheet) { sheet.remove(); sheet = null; } };
  const openSheet = (title, kids) => {
    closeSheet();
    sheet = document.createElement('div'); sheet.className = 'sheet';
    const p = document.createElement('p'); p.textContent = title;
    sheet.append(p, ...kids, btn('ปิด', closeSheet));
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) sheet.addEventListener(type, e => e.stopPropagation());
    root.append(sheet);
  };

  // ---- looking straight down: metres <-> pixels (the land's own height is allowed for, so marks sit on what they mark)
  let W = 1, H = 1, K = 1;                                    // K: screen pixels per metre, one metre below the camera
  const fit = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = root.clientWidth || innerWidth; H = root.clientHeight || innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    K = H / (2 * Math.tan(camera.fov * Math.PI / 360));
  };
  const toScreen = (x, z) => { const d = Math.max(2, cam.y + cam.h - ed.heightAt(x, z)); return [W / 2 + (x - cam.x) * K / d, H / 2 + (z - cam.z) * K / d]; };
  const toWorld = (sx, sy) => {
    let y = cam.y, x = cam.x, z = cam.z;
    for (let i = 0; i < 4; i++) { const d = Math.max(2, cam.y + cam.h - y); x = cam.x + (sx - W / 2) * d / K; z = cam.z + (sy - H / 2) * d / K; y = ed.heightAt(x, z); }
    return [x, z];
  };
  const inBox = (x, z) => x >= B.x0 + 1 && x <= B.x1 - 1 && z >= B.z0 + 1 && z <= B.z1 - 1;
  const clampBox = (x, z) => [Math.min(B.x1 - 1, Math.max(B.x0 + 1, x)), Math.min(B.z1 - 1, Math.max(B.z0 + 1, z))];

  // ---- the ways are redrawn on the ground as they change (not more often than the phone can take)
  const redrawWays = (now = false) => {
    const t = performance.now();
    if (!now && t - redrawAt < 160) { redrawDue = true; return; }
    redrawAt = t; redrawDue = false;
    const live = drawing && drawing.pts.length >= 2 ? [...paths, drawing] : paths;
    ed.drawWays(live, yards);
  };
  const changed = () => { dirty = true; };

  // ---- where a thing stands now
  const posOf = it => moved[it.key] || [it.x, it.z];
  const itemByKey = new Map(ed.items.map(it => [it.key, it]));

  // ---- what is under a finger
  const near = (sx, sy, x, z, r) => { const [px, py] = toScreen(x, z); return Math.hypot(px - sx, py - sy) <= r ? Math.hypot(px - sx, py - sy) : -1; };
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
    for (const it of ed.items) { const p = posOf(it); take(near(sx, sy, p[0], p[1], 24), { type: 'item', key: it.key }); }
    added.forEach((a, i) => take(near(sx, sy, a.x, a.z, 24), { type: 'add', i }));
    return best;
  };
  const sameSel = (a, b) => a && b && a.type === b.type && a.pi === b.pi && a.i === b.i && a.part === b.part && a.key === b.key;

  // ---- fingers: one drags the view (or the thing that is selected), two zoom, a tap picks or places
  const fingers = new Map();
  let down = null, pinch = null;
  const local = e => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    fingers.set(e.pointerId, [x, y]);
    if (fingers.size === 2) { const [a, b] = [...fingers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), h: cam.h }; down = null; return; }
    const hit = hitTest(x, y);
    down = { x, y, cx: cam.x, cz: cam.z, hit, drag: sameSel(hit, sel) && hit.type !== 'seg', far: false };
  });
  cv.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    const [x, y] = local(e);
    fingers.set(e.pointerId, [x, y]);
    if (pinch && fingers.size >= 2) { const [a, b] = [...fingers.values()]; cam.h = Math.min(110, Math.max(9, pinch.h * pinch.d / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])))); return; }
    if (!down) return;
    if (!down.far && Math.hypot(x - down.x, y - down.y) > 9) down.far = true;
    if (!down.far) return;
    if (down.drag) {
      let [wx, wz] = toWorld(x, y);
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
    if (d.far) { if (d.drag && (sel.type === 'pt' || sel.type === 'yard')) redrawWays(true); buttons(); return; }
    tap(d.hit, x, y);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { cam.h = Math.min(110, Math.max(9, cam.h * (1 + e.deltaY * 0.0012))); }, { passive: true });

  const tap = (hit, sx, sy) => {
    const [wx, wz] = toWorld(sx, sy);
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
    if (tool && tool.kind) {
      added.push({ kind: tool.kind, type: tool.type, x: round(wx), z: round(wz), scale: 1 });
      sel = { type: 'add', i: added.length - 1 };
      changed(); buttons(); return;
    }
    sel = hit; buttons();
  };

  // ---- words
  let sayTimer = 0, said = '';
  const say = text => { said = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => { said = ''; showHint(); }, 2600); showHint(); };
  const showHint = () => {
    let t = said;
    if (!t) {
      if (mode === 'ways') t = tool === 'path' ? 'แตะบนพื้นทีละจุดเพื่อวาดทาง แล้วกด ✓ เสร็จ' : tool === 'yard' ? 'แตะจุดที่จะวางลาน' : sel ? 'ลากจุดที่เลือกเพื่อย้าย · แตะบนเส้นเพื่อเพิ่มจุด' : 'แตะจุดบนทางเพื่อเลือก · ลากพื้นเพื่อเลื่อน · ถ่างนิ้วเพื่อซูม';
      else t = tool ? 'แตะบนพื้นเพื่อวาง' + tool.label + ' (วางได้หลายอัน) แล้วกด ✓ เสร็จ' : sel ? 'ลากเพื่อย้าย หรือกดลบ · จะเห็นผลจริงหลังกดบันทึก' : 'แตะจุดสีบนต้นไม้ พุ่มไม้ หิน หรือดอกไม้เพื่อเลือก';
    }
    hint.textContent = t;
  };

  // ---- buttons
  const setMode = m => { mode = m; sel = null; tool = null; finishDrawing(); ed.show({ grass: false, trees: m === 'plants' }); buttons(); };
  const finishDrawing = () => {
    if (drawing) { if (drawing.pts.length >= 2) { paths.push(drawing); sel = { type: 'pt', pi: paths.length - 1, i: drawing.pts.length - 1 }; } drawing = null; redrawWays(true); }
    if (tool === 'path') tool = null;
  };
  const buttons = () => {
    top.replaceChildren(
      btn('✕ ออก', close), btn('ทางเดิน', () => setMode('ways'), mode === 'ways' ? 'on' : ''), btn('พืชและหิน', () => setMode('plants'), mode === 'plants' ? 'on' : ''),
      Object.assign(document.createElement('span'), { className: 'grow' }), btn('⋯', more), btn('💾 บันทึก', save, 'go'),
    );
    const b = [];
    if (mode === 'ways') {
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
      if (tool) b.push(btn('✓ เสร็จ', () => { tool = null; buttons(); }, 'go'));
      else {
        b.push(btn('＋ เพิ่ม…', () => openSheet('เลือกสิ่งที่จะวาง แล้วแตะบนพื้น', ADDABLE.map(([label, kind, type]) => btn(label, () => { tool = { kind, type, label }; sel = null; closeSheet(); buttons(); })))));
        if (sel && sel.type === 'item') {
          const gone = removed.has(sel.key);
          b.push(btn(gone ? '↩ เอากลับมา' : 'ลบ', () => { if (gone) removed.delete(sel.key); else removed.add(sel.key); changed(); buttons(); }, gone ? '' : 'warn'));
          if (moved[sel.key]) b.push(btn('↩ กลับที่เดิม', () => { delete moved[sel.key]; changed(); buttons(); }));
        }
        if (sel && sel.type === 'add') b.push(btn('ลบ', () => { added.splice(sel.i, 1); sel = null; changed(); buttons(); }, 'warn'));
      }
    }
    row.replaceChildren(...b);
    showHint();
  };
  const more = () => {
    const out = document.createElement('textarea');
    out.value = JSON.stringify(snapshot());
    openSheet('ข้อมูลการแก้ไข: คัดลอกส่งให้ Claude เพื่อบันทึกถาวรลงเกม หรือวางข้อมูลที่เคยคัดลอกไว้แล้วกด "ใช้ข้อมูลนี้"', [
      out,
      btn('คัดลอกข้อมูล', () => { out.select(); const done = () => say('คัดลอกแล้ว'); if (navigator.clipboard) navigator.clipboard.writeText(out.value).then(done, () => { document.execCommand('copy'); done(); }); else { document.execCommand('copy'); done(); } }),
      btn('ใช้ข้อมูลนี้', () => {
        try {
          const e = JSON.parse(out.value);
          paths = Array.isArray(e.paths) ? e.paths : ed.defaults.paths(); yards = Array.isArray(e.yards) ? e.yards : ed.defaults.yards();
          removed = new Set(e.removed || []); moved = { ...(e.moved || {}) }; added = Array.isArray(e.added) ? e.added : [];
          sel = null; closeSheet(); redrawWays(true); changed(); buttons(); say('ใส่ข้อมูลแล้ว กดบันทึกเพื่อใช้จริง');
        } catch (err) { say('ข้อมูลไม่ถูกต้อง'); }
      }),
      btn('ทางเดินกลับเป็นแบบเดิม', () => { paths = ed.defaults.paths(); yards = ed.defaults.yards(); sel = null; closeSheet(); redrawWays(true); changed(); buttons(); }, 'warn'),
      btn('ล้างการแก้ทั้งหมด', () => { paths = ed.defaults.paths(); yards = ed.defaults.yards(); removed = new Set(); moved = {}; added = []; sel = null; closeSheet(); redrawWays(true); changed(); buttons(); say('ล้างแล้ว กดบันทึกเพื่อใช้จริง'); }, 'warn'),
    ]);
  };
  const save = () => {
    finishDrawing();
    try {
      localStorage.setItem(ed.key, JSON.stringify(snapshot()));
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({ x: cam.x, z: cam.z, h: cam.h, mode }));
    } catch (err) { say('บันทึกไม่ได้ (เบราว์เซอร์ไม่ให้เก็บข้อมูล)'); return; }
    say('บันทึกแล้ว กำลังโหลดฉากใหม่…');
    setTimeout(() => location.reload(), 350);
  };

  // ---- drawing the marks
  const draw = () => {
    g.clearRect(0, 0, W, H);
    // the ground that ways can be drawn on
    {
      const c = [[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1]].map(p => toScreen(p[0], p[1]));
      g.setLineDash([8, 8]); g.strokeStyle = '#ffffffaa'; g.lineWidth = 1.5;
      g.beginPath(); c.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.stroke(); g.setLineDash([]);
    }
    const ways = mode === 'ways';
    const line = (pts, color, width) => { g.strokeStyle = color; g.lineWidth = width; g.lineJoin = g.lineCap = 'round'; g.beginPath(); pts.forEach((p, i) => { const [x, y] = toScreen(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); };
    const dot = (x, z, r, fill, ring) => { const [px, py] = toScreen(x, z); g.beginPath(); g.arc(px, py, r, 0, 6.2832); g.fillStyle = fill; g.fill(); if (ring) { g.lineWidth = 3; g.strokeStyle = ring; g.stroke(); } return [px, py]; };
    for (const r of ed.ramps) line(r, '#ffffff66', 3);                                 // ramps are cut into the land: shown, not editable
    const all = drawing ? [...paths, drawing] : paths;
    all.forEach((w, pi) => {
      const on = ways && sel && sel.type === 'pt' && sel.pi === pi;
      line(w.pts, '#10243a88', w.wide ? 7 : 5); line(w.pts, w === drawing ? '#ffe14d' : on ? '#ffd23c' : ways ? '#fff6c8' : '#fff6c877', w.wide ? 4 : 2.5);
      if (ways) w.pts.forEach((p, i) => dot(p[0], p[1], on && sel.i === i ? 10 : 6.5, on && sel.i === i ? '#ff7a1a' : '#ffffff', '#10243a'));
    });
    yards.forEach((y, i) => {
      const on = ways && sel && sel.type === 'yard' && sel.i === i, [cx, cy] = toScreen(y.x, y.z), [ex] = toScreen(y.x + y.r, y.z);
      g.beginPath(); g.arc(cx, cy, Math.abs(ex - cx), 0, 6.2832); g.lineWidth = on ? 4 : 2.5; g.strokeStyle = on ? '#ffd23c' : ways ? '#fff6c8' : '#fff6c877'; g.stroke();
      if (ways) { dot(y.x, y.z, on ? 10 : 6.5, on ? '#ff7a1a' : y.paved ? '#c9c2b0' : '#e3cc98', '#10243a'); dot(y.x + y.r, y.z, 6, '#ffffff', '#10243a'); }
    });
    if (!ways) {
      const mark = (x, z, r, kind, on, gone) => {
        const [px, py] = toScreen(x, z);
        if (px < -30 || px > W + 30 || py < -30 || py > H + 30) return;
        const d = Math.max(2, cam.y + cam.h - ed.heightAt(x, z)), rr = Math.min(18, Math.max(5, r * K / d * 0.4));
        g.beginPath(); g.arc(px, py, on ? rr + 3 : rr, 0, 6.2832);
        g.fillStyle = gone ? '#00000055' : KIND_COLOR[kind] || '#fff'; g.fill();
        g.lineWidth = on ? 3.5 : 1.5; g.strokeStyle = on ? '#ffffff' : '#10243a'; g.stroke();
        if (gone) { g.strokeStyle = '#ff3b30'; g.lineWidth = 3; g.beginPath(); g.moveTo(px - rr, py - rr); g.lineTo(px + rr, py + rr); g.moveTo(px + rr, py - rr); g.lineTo(px - rr, py + rr); g.stroke(); }
      };
      for (const it of ed.items) {
        const p = posOf(it), on = sel && sel.type === 'item' && sel.key === it.key;
        if (moved[it.key]) { g.setLineDash([5, 5]); line([[it.x, it.z], p], '#ffffffcc', 2); g.setLineDash([]); }
        mark(p[0], p[1], it.r, it.kind, on, removed.has(it.key));
      }
      added.forEach((a, i) => { mark(a.x, a.z, ADD_R[a.kind] || 1, a.kind, sel && sel.type === 'add' && sel.i === i, false); const [px, py] = toScreen(a.x, a.z); g.fillStyle = '#fff'; g.font = '700 12px system-ui'; g.textAlign = 'center'; g.fillText('+', px, py + 4); });
      const s = sel && (sel.type === 'item' ? itemByKey.get(sel.key) : sel.type === 'add' ? added[sel.i] : null);
      if (s) {                                                                          // what the selected thing is
        const p = sel.type === 'item' ? posOf(s) : [s.x, s.z], [px, py] = toScreen(p[0], p[1]);
        const name = s.kind === 'flower' ? 'แปลงดอกไม้' : TYPE_NAME[s.type] || s.type;
        g.font = '600 13px system-ui'; g.textAlign = 'center';
        const tw = g.measureText(name).width + 14;
        g.fillStyle = '#10243add'; g.beginPath(); g.roundRect(px - tw / 2, py - 44, tw, 22, 11); g.fill();
        g.fillStyle = '#fff'; g.fillText(name, px, py - 29);
      }
    }
  };

  // ---- open / close
  const open = (at = null) => {
    if (active) return;
    active = true;
    load();
    cam.x = at ? at.x : camera.position.x; cam.z = at ? at.z : camera.position.z; cam.h = at ? at.h : 42;
    cam.y = ed.heightAt(cam.x, cam.z);
    savedUp = camera.up.clone();
    document.body.append(root);
    document.body.classList.add('sceneEditing');
    fit();
    setMode(at && at.mode === 'plants' ? 'plants' : 'ways');
    redrawWays(true);
  };
  const close = () => {
    if (!active) return;
    if (dirty && !window.confirm('ยังไม่ได้บันทึก ออกโดยทิ้งการแก้ไขหรือไม่')) return;
    active = false;
    closeSheet(); root.remove();
    document.body.classList.remove('sceneEditing');
    camera.up.copy(savedUp);
    load();
    ed.drawWays(paths, yards);                                                         // back to what is saved
    ed.show({ grass: true, trees: true });
  };
  addEventListener('resize', () => { if (active) fit(); });

  const api = {
    get active() { return active; },
    open, close,
    // each frame, after the player has placed the camera: look straight down instead, and redraw the marks
    apply(cameraNow) {
      if (!active) return;
      cam.y += (ed.heightAt(cam.x, cam.z) - cam.y) * 0.15;
      cameraNow.up.set(0, 0, -1);
      cameraNow.position.set(cam.x, cam.y + cam.h, cam.z);
      cameraNow.lookAt(cam.x, cam.y, cam.z);
      cameraNow.updateMatrixWorld();
      if (redrawDue) redrawWays();
      draw();
    },
    // (for tests) the working copy and the view
    _state: () => ({ paths, yards, removed: [...removed], moved, added, cam, mode, sel, dirty }),
    _tap: (x, z) => { const [sx, sy] = toScreen(x, z); tap(hitTest(sx, sy), sx, sy); },
    _setMode: setMode, _snapshot: snapshot, _screen: toScreen,
  };
  // after "save" the scene loads again: come back to the same place in the editor
  try {
    const r = sessionStorage.getItem(RESUME_KEY);
    if (r) { sessionStorage.removeItem(RESUME_KEY); api.resume = JSON.parse(r); }
  } catch (err) { /* nothing to resume */ }
  return api;
}
