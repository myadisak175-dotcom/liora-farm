// path-brush.js  —  paint the map's ways by hand, in the map itself, on a phone or with a mouse.
//
// One job: the brush. A way is painted in the look the map's own ways have (soft trodden earth fading into the grass:
// ground-paths.js), or grass is painted back over a way to take it away (the map's own ways too). It shows at once.
//
//   the camera     looks down at the ground from above: two fingers move it, come nearer or go back, and twist it round
//                  (the mouse wheel zooms)
//   one finger     paints along where it goes, from where it touches down to where it lifts
//   🚶 ทาตามเท้า   the editor steps aside and she is walked about as in the game: the brush follows her feet
//   🟫 ทาง / 🌿 หญ้า   a way, or grass over a way;  เล็ก / กลาง / ใหญ่: how wide
//   ↶ ย้อน         back one stroke (of this visit)
//   💾 บันทึก      keep the strokes (in this browser) and load the map again: the ground's colour under them, the paths' little
//                  dip in the land and the grass are made again for them (until then only the grass's amount and the way's own
//                  paint change)
//   ⋯              the strokes as text, to send to Claude to put into the map for everyone (assets/heightmaps/hill-village-paths.json),
//                  or to paste back in; or all the painting taken away
//
// Works on a level that offers level.pathEdit (hill-village-level.js). The strokes themselves: path-edits.js.
//
//   const brush = createPathBrush({ level, camera, player });      // null on a map without it
//   brush.open();                     brush.active: the editor is open (its camera);  brush.walking: the brush follows her
//   each frame, after the player has set the camera:  brush.apply(camera)
//   brush.focus: where the camera is looking (for the grass to grow round, instead of round her)

import * as THREE from 'three';
import { savePathOps, okOp, tidy } from './path-edits.js';

const RESUME_KEY = 'liora.pathBrush.resume';
const SIZES = [['เล็ก', 0.7], ['กลาง', 1.1], ['ใหญ่', 1.6]];               // half the way's width, metres (the map's ways: 0.9 - 1.5)
const STEP = 0.5;                                                          // a stroke's points this far apart
const CSS = `
#pathBrush { position:fixed; inset:0; z-index:60; touch-action:none; user-select:none; -webkit-user-select:none; font:600 13px system-ui, sans-serif; color:#16324a; pointer-events:none; }
#pathBrush canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:auto; touch-action:none; }
#pathBrush .bar, #pathWalkBar { position:absolute; left:0; right:0; display:flex; flex-direction:column; gap:6px; padding:8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left)); pointer-events:none; }
#pathBrush .head { top:env(safe-area-inset-top); }
#pathBrush .foot { bottom:env(safe-area-inset-bottom); align-items:center; }
#pathBrush .row, #pathWalkBar .row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; justify-content:center; }
#pathBrush .grow { flex:1; }
#pathBrush button, #pathWalkBar button { pointer-events:auto; border:1px solid #ffffffaa; border-radius:999px; padding:9px 12px; background:#ffffffee; color:#16324a; font:600 13px system-ui, sans-serif; touch-action:manipulation; box-shadow:0 1px 4px #0003; }
#pathBrush button.on, #pathWalkBar button.on { background:#1f6fd0; color:#fff; }
#pathBrush button.go, #pathWalkBar button.go { background:#18a058; color:#fff; }
#pathBrush button.warn, #pathWalkBar button.warn { background:#fff0f0; color:#b3261e; }
#pathBrush .hint, #pathWalkBar .hint { align-self:center; max-width:94%; padding:6px 12px; border-radius:12px; background:#10243acc; color:#fff; font:500 13px system-ui, sans-serif; text-align:center; }
#pathBrush .panel { pointer-events:auto; width:min(100%, 460px); padding:10px 12px; border-radius:16px; background:#fffffff0; box-shadow:0 4px 18px #0004; display:flex; flex-direction:column; gap:8px; }
#pathBrush .sheet { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(92%, 380px); max-height:80%; overflow:auto; padding:14px; border-radius:16px; background:#fffffffa; box-shadow:0 8px 30px #0006; display:flex; flex-wrap:wrap; gap:8px; justify-content:center; pointer-events:auto; }
#pathBrush .sheet p { width:100%; margin:0 0 4px; text-align:center; font-weight:500; }
#pathBrush .sheet textarea { width:100%; height:120px; font:12px monospace; }
#pathWalkBar { position:fixed; top:auto; bottom:calc(132px + env(safe-area-inset-bottom)); z-index:61; align-items:center; }
body.pathPainting > :not(#pathBrush):not(canvas):not(script):not(style) { visibility:hidden !important; }
#pathBrushBtn { position:fixed; left:max(10px,env(safe-area-inset-left)); top:calc(164px + env(safe-area-inset-top)); z-index:4; border:1px solid #ffffff88; border-radius:999px; padding:9px 14px; background:#a07a3cdc; color:white; font:600 12px system-ui; touch-action:manipulation; }
`;

export function createPathBrush({ level, camera, player = null }) {
  const R = level.pathEdit;
  if (!R) return null;
  if (!document.getElementById('pathBrushCss')) { const st = document.createElement('style'); st.id = 'pathBrushCss'; st.textContent = CSS; document.head.append(st); }
  const H = R.heightAt;

  // ---- what is painted: the strokes kept before (already drawn as the map loaded) and this visit's, each with its undoing
  let kept = [], fresh = [], kind = 'way', size = 1, active = false, walking = false, sheet = null;
  const all = () => [...kept, ...fresh.map(f => f.op)];
  const paint = op => { op = tidy(op); fresh.push({ op, undo: R.apply(op) }); };
  const undo = () => {
    const f = fresh.pop();
    if (!f) return say(kept.length ? 'ย้อนได้แค่ที่ทารอบนี้ (ที่บันทึกไว้แล้ว ใช้ 🌿 หญ้า ทาทับ หรือ ⋯ เพื่อล้าง)' : 'ไม่มีอะไรให้ย้อนแล้ว');
    f.undo(); say('ย้อนแล้ว');
  };

  // ---- the camera: it looks down at a point on the ground from above (a little tilted, so the land still reads)
  const cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 1.05, dist: 26 };
  const focus = new THREE.Vector3(), D = new THREE.Vector3(), Rt = new THREE.Vector3(), Fw = new THREE.Vector3();
  const place = () => {
    cam.dist = Math.min(110, Math.max(5, cam.dist));
    const cp = Math.cos(cam.pitch);
    D.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    camera.up.set(0, 1, 0);
    camera.position.set(cam.x, cam.y, cam.z).addScaledVector(D, cam.dist);
    const floor = H(camera.position.x, camera.position.z) + 0.6;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(cam.x, cam.y, cam.z);
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    focus.set(cam.x, cam.y, cam.z);
  };
  const lookAtHer = () => {
    const p = player ? player.position : new THREE.Vector3();
    cam.x = p.x; cam.z = p.z; cam.y = H(p.x, p.z);
    const c = camera.position; cam.yaw = Math.atan2(c.x - p.x, c.z - p.z);
  };

  // ---- the page
  const root = document.createElement('div'); root.id = 'pathBrush';
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const head = document.createElement('div'); head.className = 'bar head';
  const foot = document.createElement('div'); foot.className = 'bar foot';
  const hint = document.createElement('div'); hint.className = 'hint';
  root.append(cv, head, foot);
  const walkBar = document.createElement('div'); walkBar.id = 'pathWalkBar';
  const walkHint = document.createElement('div'); walkHint.className = 'hint';
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

  // ---- where a finger touches the land: out along the line of sight until it goes under the ground
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const onGround = (sx, sy) => {
    ndc.set(sx / W * 2 - 1, -(sy / Hh) * 2 + 1); ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction, under = t => o.y + d.y * t <= H(o.x + d.x * t, o.z + d.z * t);
    let a = 0, t = 0.5;
    for (let i = 0; i < 120 && !under(t); i++) { a = t; t += Math.max(0.4, t * 0.06); if (t > 600) return null; }
    if (!under(t)) return null;
    for (let i = 0; i < 10; i++) { const m = (a + t) / 2; if (under(m)) t = m; else a = m; }
    return [o.x + d.x * t, o.z + d.z * t];
  };

  // ---- fingers: one paints, two move / zoom / twist the view
  const fingers = new Map();
  let stroke = null, pinch = null;
  const local = e => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const two = () => { const [a, b] = [...fingers.values()]; return { mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; };
  const grow = (pts, w) => { if (!w || !R.inMap(w[0], w[1])) return; const l = pts[pts.length - 1]; if (!l || Math.hypot(w[0] - l[0], w[1] - l[1]) >= STEP) pts.push(w); };
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    fingers.set(e.pointerId, [x, y]);
    if (fingers.size === 2) { stroke = null; const t = two(); pinch = { ...t, dist: cam.dist, x: cam.x, z: cam.z, yaw: cam.yaw }; return; }
    if (fingers.size === 1) { stroke = { pts: [] }; grow(stroke.pts, onGround(x, y)); }
  });
  cv.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    const [x, y] = local(e);
    fingers.set(e.pointerId, [x, y]);
    if (pinch && fingers.size >= 2) {
      const t = two();
      cam.dist = pinch.dist * pinch.d / Math.max(20, t.d);
      cam.yaw = pinch.yaw - (t.ang - pinch.ang);
      const k = cam.dist * 2 * Math.tan(camera.fov * Math.PI / 360) / Hh;        // metres per pixel at the point looked at
      Rt.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)); Fw.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
      const dx = t.mx - pinch.mx, dy = t.my - pinch.my;
      cam.x = pinch.x - Rt.x * dx * k + Fw.x * dy * k * 1.2; cam.z = pinch.z - Rt.z * dx * k + Fw.z * dy * k * 1.2;
      cam.y = H(cam.x, cam.z);
      return;
    }
    if (stroke) grow(stroke.pts, onGround(x, y));
  });
  const up = e => {
    if (!fingers.has(e.pointerId)) return;
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (fingers.size === 0 && stroke) { finish(stroke.pts); stroke = null; }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { cam.dist *= 1 + e.deltaY * 0.0012; }, { passive: true });
  const half = () => SIZES[size][1];
  const finish = pts => {                                                   // a stroke is down: drawn for real
    if (!pts.length) return;
    if (pts.length === 1) pts = [pts[0], [pts[0][0] + 0.35, pts[0][1] + 0.1]];          // (a touch: a short dab)
    paint(kind === 'way' ? { k: 'way', half: half(), pts } : { k: 'grass', r: half() + 0.5, pts });
    say(kind === 'way' ? 'ทาทางแล้ว' : 'ทาหญ้าทับแล้ว');
  };

  // ---- 🚶 the brush follows her: the editor steps aside, a small bar stays; the stroke grows as she walks
  let walk = null;
  const startWalk = () => {
    walking = true; walk = { pts: [], undo: null, at: 0 };
    root.remove(); document.body.classList.remove('pathPainting');
    document.body.append(walkBar); walkUI();
  };
  const stopWalk = () => {
    if (!walking) return;
    walking = false;
    if (walk && walk.undo) { walk.undo(); walk.undo = null; }
    if (walk && walk.pts.length >= 2) paint(walkOp(walk.pts)); else if (walk && walk.pts.length === 1) finish(walk.pts);
    walk = null; walkBar.remove();
    if (active) { document.body.append(root); document.body.classList.add('pathPainting'); lookAtHer(); fit(); panel(); }
  };
  const walkOp = pts => (kind === 'way' ? { k: 'way', half: half(), pts: pts.slice() } : { k: 'grass', r: half() + 0.5, pts: pts.slice() });
  const followFeet = () => {
    if (!walk || !player) return;
    const p = player.position, n = walk.pts.length;
    grow(walk.pts, [p.x, p.z]);
    if (walk.pts.length !== n && walk.pts.length >= 2 && walk.pts.length - walk.at >= 4) {      // every two metres: the stroke so far drawn again
      if (walk.undo) walk.undo();
      walk.undo = R.apply(tidy(walkOp(walk.pts))); walk.at = walk.pts.length;
    }
  };
  const walkUI = () => {
    walkHint.textContent = kind === 'way' ? '🚶 เดินไปตรงไหน ทางก็ตามไป' : '🚶 เดินไปตรงไหน หญ้าก็ขึ้นทับทาง';
    walkBar.replaceChildren(walkHint, row([
      btn('🟫 ทาง', () => setKind('way'), kind === 'way' ? 'on' : ''), btn('🌿 หญ้า', () => setKind('grass'), kind === 'grass' ? 'on' : ''),
      ...SIZES.map(([name], i) => btn(name, () => setSize(i), size === i ? 'on' : '')),
      btn('⏹ หยุด', stopWalk, 'go'),
    ]));
    stop(walkBar);
  };
  const setKind = k => { if (walking && walk && walk.pts.length) { const pts = walk.pts.slice(-1); stopWalk(); kind = k; startWalk(); walk.pts = pts; } else kind = k; walking ? walkUI() : panel(); };
  const setSize = i => { if (walking && walk && walk.pts.length) { const pts = walk.pts.slice(-1); stopWalk(); size = i; startWalk(); walk.pts = pts; } else size = i; walking ? walkUI() : panel(); };

  // ---- words
  let sayTimer = 0, said = '';
  const say = text => { said = text; clearTimeout(sayTimer); sayTimer = setTimeout(() => { said = ''; showHint(); }, 3000); showHint(); };
  const showHint = () => { hint.textContent = said || 'นิ้วเดียวลากเพื่อทา · สองนิ้วเลื่อน ซูม และบิดเพื่อหมุน'; };

  // ---- the buttons
  const top = () => {
    head.replaceChildren(row([
      btn('✕ ออก', close), btn('↶ ย้อน', undo), btn('🚶 ทาตามเท้า', startWalk),
      Object.assign(document.createElement('span'), { className: 'grow' }), btn('⋯', more), btn('💾 บันทึก', keep, 'go'),
    ]), hint);
    showHint();
  };
  const panel = () => {
    top();
    const p = stop(document.createElement('div')); p.className = 'panel';
    p.append(
      row([btn('🟫 ทาง', () => setKind('way'), kind === 'way' ? 'on' : ''), btn('🌿 หญ้า (ลบทาง)', () => setKind('grass'), kind === 'grass' ? 'on' : '')]),
      row(SIZES.map(([name], i) => btn(name, () => setSize(i), size === i ? 'on' : ''))),
    );
    foot.replaceChildren(p);
  };
  const more = () => {
    const out = document.createElement('textarea');
    out.value = JSON.stringify({ map: 'hillvillage', v: 1, ops: all() });
    openSheet('ทางที่ทาทั้งหมดเป็นข้อความ: คัดลอกส่งให้ Claude เพื่อใส่ลงแมพถาวร (แผนที่จะวาดทางใหม่ด้วย) หรือวางข้อมูลที่เคยคัดลอกไว้', [
      out,
      btn('คัดลอกข้อมูล', () => {
        out.select(); const done = () => say('คัดลอกแล้ว ส่งให้ Claude ได้เลย');
        if (navigator.clipboard) navigator.clipboard.writeText(out.value).then(done, () => { document.execCommand('copy'); done(); }); else { document.execCommand('copy'); done(); }
      }, 'go'),
      btn('ใช้ข้อมูลนี้', () => {
        let ops = null; try { ops = JSON.parse(out.value).ops; } catch { /* not ours */ }
        if (!Array.isArray(ops) || !ops.every(okOp)) return say('ข้อความนี้ไม่ใช่ข้อมูลทางที่ทา');
        if (!window.confirm('ใช้ทางชุดนี้แทนของเดิม แล้วโหลดแมพใหม่?')) return;
        store(ops);
      }),
      btn('ลบทางที่ทาทั้งหมด', () => { if (window.confirm('ลบทางที่ทาด้วยมือทั้งหมด แล้วโหลดแมพใหม่?')) store([]); }, 'warn'),
    ]);
  };
  const store = ops => {
    try { savePathOps(R.key, ops, 'hillvillage'); sessionStorage.setItem(RESUME_KEY, JSON.stringify({ cam })); }
    catch { say('บันทึกไม่ได้ (เบราว์เซอร์ไม่ให้เก็บข้อมูล)'); return; }
    fresh = []; say('บันทึกแล้ว กำลังโหลดแมพใหม่…');
    setTimeout(() => location.reload(), 350);
  };
  const keep = () => store(all());

  // ---- the stroke under the finger, before it is down, and the brush's size round the finger
  const v3 = new THREE.Vector3();
  const toScreen = (x, z) => { v3.set(x, H(x, z) + 0.05, z).project(camera); return [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * Hh, v3.z > -1 && v3.z < 1]; };
  const draw = () => {
    g.clearRect(0, 0, W, Hh);
    if (!stroke || !stroke.pts.length) return;
    const pts = stroke.pts, w = half() + (kind === 'grass' ? 0.5 : 0);
    const [ax, ay] = toScreen(pts[0][0], pts[0][1]), [bx, by] = toScreen(pts[0][0] + w, pts[0][1]);
    g.lineWidth = Math.max(6, Math.hypot(bx - ax, by - ay) * 2); g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = kind === 'way' ? 'rgba(214,178,112,0.7)' : 'rgba(104,186,72,0.7)';
    g.beginPath();
    pts.forEach(([x, z], i) => { const [sx, sy] = toScreen(x, z); if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
    if (pts.length === 1) g.lineTo(ax + 0.1, ay);
    g.stroke();
  };

  // ---- open / close
  const open = (at = null) => {
    if (active) return;
    kept = R.ops(); fresh = [];
    if (at && at.cam) Object.assign(cam, at.cam); else lookAtHer();
    document.body.append(root);
    document.body.classList.add('pathPainting');
    fit(); active = true; panel();
    if (!at && kept.length) say('มีทางที่ทาไว้แล้ว ' + kept.length + ' เส้น (เก็บในเครื่องนี้)');
  };
  const close = () => {
    if (!active) return;
    if (fresh.length && !window.confirm('ยังไม่ได้บันทึก ออกโดยทิ้งทางที่ทารอบนี้หรือไม่')) return;
    while (fresh.length) fresh.pop().undo();
    active = false; closeSheet(); root.remove();
    document.body.classList.remove('pathPainting');
  };
  addEventListener('resize', () => { if (active) fit(); });

  const api = {
    get active() { return active && !walking; },
    get walking() { return walking; },
    focus, open, close,
    apply() { if (walking) { followFeet(); return; } if (!active) return; place(); draw(); },
    // (for tests)
    _state: () => ({ kept: kept.length, fresh: fresh.length, ops: all(), cam, kind, size, walking, walk: walk && walk.pts.length }),
    _stroke: (pts, k = kind, s = size) => { kind = k; size = s; finish(pts.map(p => [...p])); },
    _walk: startWalk, _stopWalk: stopWalk, _undo: undo, _save: keep, _say: () => hint.textContent,
  };
  try {                                                                       // after "save" the map loads again: back to the same view
    const r = sessionStorage.getItem(RESUME_KEY);
    if (r) { sessionStorage.removeItem(RESUME_KEY); api.resume = JSON.parse(r); }
  } catch { /* nothing to resume */ }
  return api;
}
