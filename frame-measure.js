// frame-measure.js
// What each part of the picture costs on this phone, measured on the phone itself: only with ?measure=1 (27 Nov 2026).
// On the user's iPhone 17 Pro the game slowed and its picture was taken down, where her Samsung, its chip no stronger,
// played it smoothly ("ทำไม Samsung ไม่เป็น ชิปก็แรงพอๆ กัน"). Every browser on an iPhone draws through Safari's WebGL,
// which turns the game's drawing into Metal's: some things cheap elsewhere are dear there, and which of the game's they
// are can only be found on the phone.
//
//   createFrameMeasure({ frame, renderer, scene, camera, level, player, sky, charShadow, setDPR, dpr, sounds })
//     frame: the game's frame (index.html: everything a frame does, drawn at the end); setDPR(v) and dpr(): the picture's
//     resolution, as the game sets it (applied as the next frame begins)
//
// It runs by itself once the game has loaded; the game's own frames are stopped meanwhile (index.html leaves the loop to
// it, and its tuner does nothing). Nothing is to be touched until it asks:
//   1. THE SCREEN: how often the browser offers a frame, nothing drawn (60 a second; 30 in Low Power Mode)
//   2. AS PLAYED: the game's own frames for a few seconds where she starts, as many as the screen offers (up to 60)
//   3. EACH PART: a frame drawn and waited for until the GPU has done with it (a 1-pixel read), so it is timed whole, the
//      phone's GPU and Safari's own work included: with everything, then without one part at a time (the grass, the
//      trees, the water's mirror ...) and with a coarser picture. Where she starts and by the bridge's water, every part;
//      at three more places, everything only
//   4. THE SOUND: a touch asked for (it wakes the sound: her steps, the air, the music, decoded over its first half
//      minute), then the frames as played for 12 s, and a frame with the sound playing and with it stopped
//   5. THE PAGE TWICE MORE: loaded again without antialiasing (?aa=0), then with powerPreference 'default' (?gpu=default):
//      as played, and the frames where she starts and at the bridge
// Then a card with all of it, and a button that copies it as text, to send. Kept in localStorage (liora.measure) across
// the reloads; ?measure=show shows the last one again.

const KEY = 'liora.measure';
const EVERY = ['start', 'vl-bridge'];                         // every part measured here (the second by water: its mirror)
const ONLY = ['vl-plaza', 'vl-eastwood', 'vl-fallfoot'];       // everything only
const PLACE = { 'start': 'จุดเริ่ม', 'vl-bridge': 'สะพาน (ริมน้ำ)', 'vl-plaza': 'ลานหมู่บ้าน', 'vl-eastwood': 'ป่าตะวันออก', 'vl-fallfoot': 'ตีนน้ำตก' };
const WARM = 8, TAKE = 16, SETTLE = 36;                       // frames: before a part's measure (the change settles), measured, after she is moved
// the parts, by the names their objects have in the scene (the scene's own children and the level's)
const PARTS = [
  ['หญ้า', { hide: ['followGrass'] }],
  ['ต้นไม้', { hide: ['grove'] }],
  ['ดอกไม้ พุ่มไม้', { hide: ['flowers', 'ground_cover'] }],
  ['น้ำ', { hide: ['landWater', 'waterDroplets'] }],
  ['เงาสะท้อนในน้ำ', { off: ['optics'] }],
  ['พื้นดิน', { hide: ['terrain', 'mapRim', 'paths'] }],
  ['บ้าน สะพาน กังหัน', { hide: ['village-kit', 'hillVillageBuilt', 'hillVillageThings', 'plankBridge', 'windmillSails', 'waterWheel'] }],
  ['หิน', { hide: ['rocks', 'wetRocks'] }],
  ['ฟ้า เมฆ ภูเขาไกล', { hide: ['volumetricSky', 'distantMountains', 'abyssClouds'], off: ['sky'] }],
  ['ตัวละคร เงาตัว', { hide: ['player', 'characterShadow', 'sprite-companion', 'sprite-companion-shadow'], off: ['charShadow'] }],
  ['ภาพ 1.0', { dpr: 1 }],
  ['ภาพ 0.5', { dpr: 0.5 }],
  ['ไม่มีอะไรเลย', { nothing: true }],
];

export function createFrameMeasure({ frame, renderer, scene, camera, level, player, sky, charShadow, setDPR, dpr, sounds = null }) {
  const stage = new URLSearchParams(location.search).get('measure');
  const gl = renderer.getContext(), px = new Uint8Array(4);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (err) { return {}; } };
  const save = r => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (err) { /* (no storage: the card at the end of this page only) */ } };

  // ---- what it says while it runs
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:60;max-width:88vw;'
    + 'padding:8px 14px;border-radius:12px;background:rgba(20,26,14,.85);color:#fff;font:15px/1.4 system-ui,sans-serif;text-align:center;pointer-events:none';
  document.body.appendChild(box);
  const say = s => { box.textContent = s; };

  // ---- frames
  const next = () => new Promise(r => requestAnimationFrame(r));
  const median = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };
  const r1 = v => Math.round(v * 10) / 10;
  async function settle(n) { for (let i = 0; i < n; i++) { await next(); frame(1 / 60); } }
  // n frames, each drawn and then waited for until the GPU has finished it (reading a pixel of it back): ms, the whole frame
  // and the part of it the page's own work took (before the wait)
  async function timed(n = TAKE) {
    const all = [], cpu = [];
    for (let i = 0; i < n; i++) {
      await next();
      const t0 = performance.now(); frame(1 / 60); const t1 = performance.now();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      all.push(performance.now() - t0); cpu.push(t1 - t0);
    }
    return { ms: r1(median(all)), cpu: r1(median(cpu)) };
  }
  // everything: timed, with what a frame draws (every pass: the mirror, her shadow's picture, the clouds, the screen)
  async function whole() {
    renderer.info.autoReset = false; renderer.info.reset();
    await next(); frame(1 / 60);
    const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
    renderer.info.autoReset = true;
    return { ...(await timed()), calls, ktris: Math.round(tris / 1000) };
  }
  // the game's own frames for secs, as the game draws them (at most 60 a second): how many a second, the page's work per
  // frame, and how many took longer than 50 ms
  async function asPlayed(secs) {
    const gaps = [], cpu = [], end = performance.now() + secs * 1000;
    let last = -1, long = 0;
    while (performance.now() < end) {
      const t = await next();
      if (last >= 0 && t - last < 1000 / 60 - 2) continue;      // (a screen over 60 Hz: as the game does)
      if (last >= 0) { gaps.push(t - last); if (t - last > 50) long++; }
      const dt = last >= 0 ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
      last = t;
      const t0 = performance.now(); frame(dt); cpu.push(performance.now() - t0);
    }
    const sum = gaps.reduce((a, b) => a + b, 0);
    return { fps: gaps.length ? r1(1000 / median(gaps)) : 0, mean: r1(1000 * gaps.length / (sum || 1)), cpu: r1(median(cpu)), long };
  }
  async function screen() {
    const g = []; let last = -1;
    for (let i = 0; i < 90; i++) { const t = await next(); if (last >= 0) g.push(t - last); last = t; }
    return { hz: Math.round(1000 / median(g)), min: r1(Math.min(...g)) };
  }
  const goto = v => { const p = level.views && level.views[v]; if (p) player.teleport(p.x, p.z, p.yaw); };

  // ---- a part taken away, and given back
  const OFF = { optics: [level.optics, 'render'], sky: [sky.userData, 'update'], charShadow: [charShadow, 'update'] };
  const named = names => {
    const out = [];
    for (const root of [scene, level.group]) for (const c of root.children) if (names.includes(c.name)) out.push(c);
    return out;
  };
  function without(p) {
    const undo = [];
    const hide = list => { for (const o of list) { const was = o.visible; o.visible = false; undo.push(() => { o.visible = was; }); } };
    const off = keys => {
      for (const k of keys) {
        const [o, f] = OFF[k] || [];
        if (!o || typeof o[f] !== 'function') continue;
        const was = o[f]; o[f] = () => {}; undo.push(() => { o[f] = was; });
      }
    };
    if (p.hide) hide(named(p.hide));
    if (p.off) off(p.off);
    if (p.nothing) { hide(scene.children.filter(o => o.visible)); off(Object.keys(OFF)); }
    if (p.dpr) { const was = dpr(); setDPR(p.dpr); undo.push(() => setDPR(was)); }
    return () => { for (const u of undo.reverse()) u(); };
  }

  function device() {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info'), attrs = gl.getContextAttributes() || {};
    return { ua: navigator.userAgent, css: [innerWidth, innerHeight], ratio: devicePixelRatio, cores: navigator.hardwareConcurrency || 0,
      gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), dpr: dpr(), px: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      aa: !!attrs.antialias, power: attrs.powerPreference || '', grass: level.grass && level.grass.userData ? level.grass.userData.density : null,
      mirror: level.optics ? level.optics.quality : null };
  }

  // ---- the runs
  async function full() {
    const R = { at: new Date().toLocaleString('th-TH'), device: device(), views: {} };
    say('กำลังวัด… อย่าแตะจอนะคะ');
    R.screen = await screen();
    goto('start'); await settle(SETTLE);
    say('กำลังวัด… อย่าแตะจอนะคะ · เล่นจริง');
    R.played = await asPlayed(4);
    const steps = EVERY.length * (PARTS.length + 1) + ONLY.length;
    let step = 0;
    const tell = () => say(`กำลังวัด… อย่าแตะจอนะคะ · ${++step}/${steps}`);
    for (const v of EVERY) {
      goto(v); await settle(SETTLE); tell();
      const V = R.views[v] = { all: await whole(), parts: {} };
      for (const [name, p] of PARTS) {
        tell();
        const back = without(p);
        await settle(WARM); V.parts[name] = await timed(); back(); await settle(4);
      }
    }
    for (const v of ONLY) { goto(v); await settle(SETTLE); tell(); R.views[v] = { all: await whole() }; }
    save(R);
    // the sound: woken by a touch (step-sounds.js wakes it on the window, before anything else hears the touch)
    goto('start'); await settle(SETTLE);
    say('แตะจอ 1 ครั้งค่ะ (เปิดเสียง) แล้ววางไว้อีกสักครู่');
    if (await tapped(25000)) {
      say('กำลังวัดตอนมีเสียง… อย่าแตะจอนะคะ');
      R.sound = { played: await asPlayed(12) };
      const ctx = sounds && sounds.context;
      if (ctx) { R.sound.on = await timed(); try { await ctx.suspend(); R.sound.off = await timed(); await ctx.resume(); } catch (err) { /* (left as it was) */ } }
    }
    save(R);
    say('โหลดใหม่ ลองแบบไม่ลบรอยหยัก…');
    location.replace(location.pathname + '?measure=2&aa=0');      // (replace: the page before is not kept to go back to, nor its memory)
  }
  async function quick(name, then) {
    const R = load();
    if (!R.views) { say('ไม่พบผลรอบแรก: เปิด ?measure=1 ใหม่ค่ะ'); return; }
    say('กำลังวัด… อย่าแตะจอนะคะ');
    goto('start'); await settle(SETTLE);
    const Q = R[name] = { device: device(), played: await asPlayed(3) };
    for (const v of EVERY) { goto(v); await settle(SETTLE); Q[v] = await whole(); }
    save(R);
    then(R);
  }
  // a touch, on a cover over the game (the game itself does not hear it; the sound does, on the window, first)
  function tapped(ms) {
    return new Promise(done => {
      const cover = document.createElement('div');
      cover.style.cssText = 'position:fixed;inset:0;z-index:55;background:transparent;touch-action:none';
      document.body.appendChild(cover);
      const finish = v => { clearTimeout(timer); cover.remove(); done(v); };
      const timer = setTimeout(() => finish(false), ms);
      cover.addEventListener('pointerup', e => { e.stopPropagation(); setTimeout(() => finish(true), 1500); }, { once: true });
    });
  }

  // ---- the card
  function text(R) {
    const L = [], d = R.device || {};
    L.push(`Liora · วัดเฟรม · ${R.at || ''}`);
    L.push(`จอ ${d.css ? d.css.join('×') : '?'} ×${d.ratio} · ภาพ ×${d.dpr} = ${d.px ? d.px.join('×') : '?'} · ${d.gpu} · ${d.cores} คอร์`
      + ` · หญ้า ${d.grass} · เงาน้ำ ${d.mirror} · aa ${d.aa ? 1 : 0} · ${d.power}`);
    L.push(d.ua || '');
    if (R.screen) L.push(`จอส่งเฟรม ${R.screen.hz} Hz (สั้นสุด ${R.screen.min} ms)`);
    if (R.played) L.push(`เล่นจริงที่จุดเริ่ม: ${R.played.fps} fps (เฉลี่ย ${R.played.mean}) · งานหน้าเว็บ ${R.played.cpu} ms · เกิน 50 ms ${R.played.long} ครั้ง`);
    L.push('ต่อเฟรม รอ GPU เสร็จ (ms):');
    for (const v of [...EVERY, ...ONLY]) {
      const V = R.views && R.views[v];
      if (!V) continue;
      const a = V.all;
      L.push(`${PLACE[v]}: ${a.ms} (หน้าเว็บ ${a.cpu}) · ${a.calls} draw · ${a.ktris}k สามเหลี่ยม`);
      if (V.parts) {
        const rows = Object.entries(V.parts).map(([n, p]) => [n, p.ms, r1(a.ms - p.ms)]).sort((x, y) => y[2] - x[2]);
        L.push('  ' + rows.map(([n, ms, save]) => `${n.startsWith('ภาพ') || n.startsWith('ไม่มีอะไร') ? n : 'ไม่มี' + n} ${ms} (${save >= 0 ? '−' : '+'}${Math.abs(save)})`).join(' · '));
      }
    }
    if (R.sound) {
      const s = R.sound;
      L.push(`มีเสียง: เล่นจริง 12 วิ ${s.played.fps} fps (เฉลี่ย ${s.played.mean}) · เกิน 50 ms ${s.played.long} ครั้ง`
        + (s.on ? ` · เฟรม มีเสียง ${s.on.ms} / หยุดเสียง ${s.off ? s.off.ms : '?'}` : ''));
    } else if (R.views) L.push('เสียง: ไม่ได้แตะจอ (ข้าม)');
    for (const [k, label] of [['aa0', 'ไม่ลบรอยหยัก'], ['gpu', 'gpu แบบปกติ']]) {
      const Q = R[k];
      if (!Q) continue;
      L.push(`${label}: เล่นจริง ${Q.played.fps} fps · ` + EVERY.map(v => Q[v] ? `${PLACE[v]} ${Q[v].ms} (หน้าเว็บ ${Q[v].cpu})` : '').join(' · '));
    }
    return L.join('\n');
  }
  function card(R) {
    box.remove();
    const t = text(R);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:70;overflow:auto;background:rgba(250,247,236,.98);color:#27341a;'
      + 'padding:max(14px,env(safe-area-inset-top)) 14px max(14px,env(safe-area-inset-bottom));font:13px/1.45 system-ui,sans-serif';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px';
    const title = document.createElement('b'); title.textContent = 'ผลวัด: แคปจอ หรือกดคัดลอกแล้ววางในแชทได้เลยค่ะ';
    const copy = document.createElement('button');
    copy.textContent = '📋 คัดลอก';
    copy.style.cssText = 'flex:none;border:0;border-radius:999px;padding:8px 14px;background:#5d8a3a;color:#fff;font:inherit;font-size:14px';
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(t); copy.textContent = 'คัดลอกแล้ว ✓'; }
      catch (err) { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = 'เลือกข้อความไว้แล้ว'; }
    };
    head.append(title, copy);
    const pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,Menlo,monospace;user-select:text;-webkit-user-select:text';
    pre.textContent = t;
    wrap.append(head, pre);
    document.body.appendChild(wrap);
    console.log('[measure]\n' + t);
  }

  const done = new Promise(r => { setTimeout(r, 0); });
  done.then(async () => {
    try {
      if (stage === 'show') card(load());
      else if (stage === '2') await quick('aa0', () => { say('โหลดใหม่ ลองอีกแบบ…'); location.replace(location.pathname + '?measure=3&gpu=default'); });
      else if (stage === '3') await quick('gpu', card);
      else await full();
    } catch (err) { console.warn('[measure]', err); say('วัดไม่สำเร็จ: ' + (err && err.message || err)); }
  });
  return { text, card, load };
}
