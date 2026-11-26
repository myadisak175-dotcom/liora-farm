// farm-tools.js  —  her farm in the game (a trial, ?farm=1): the tools she farms with, and the farm kept between visits.
// One job: what she does to her farm. Its ground and what lies on it are the level's (hill-village-level.js: level.farm;
// farm-soil.js, farm-debris.js); here she does to them what soil.html does with its buttons:
//   🪄 เคลียร์    the clearing magic: the water's own splash (magic-combo-fx.js) on a weed, a rock, a branch or a stump, and it
//                goes (a stone takes two, a boulder or a stump three)
//   ⛏ ไถ        a square dug (cleared, and not under the curse)
//   💧 รดน้ำ      a dug square watered (a splash on it)
//   🌧 เวทฝน      rain round where she points (a crown of water thrown out over the ground): every dug square near it wet, the
//                wet running out from there
//   ✨ มนต์       magic put into a dug square (a splash and the lance's sparkles)
//   🌱 ถอนคำสาป   the curse lifted off a square: its thorns go down into the ground, and it is meadow again
// A tool is chosen on the bar (shown only near the farm: NEAR), then a tap on a square uses it, on a square near her (REACH).
// No crops yet, nothing got for what is cleared; no move of hers either: she does not turn or cast (her cast is still to be
// made, to the magic jump's standard), only the magic is seen where it lands.
//
// The farm as it begins: overgrown, the same every time (SEED, START), but for a corner by the road, clear to dig at once, and
// a patch under the curse, its thorns on it (thorn-vine.js). What she has done is kept on this device (KEY) and given back as
// she left it when she comes again: the squares, and what still lies on them (and how many casts each still takes). ?farm=new:
// overgrown again, from the start.
//
//   const tools = await createFarmTools({ farm: level.farm, scene, player, camera, heightAt, fx });
//                                 fx: her spells' splash (magic-combo-fx.js), if she has spells; else it makes its own
//   tools.tap(origin, dir) -> true when the tap was the farm's (a tool chosen, a square of the farm under the finger)
//   tools.update(dt, hidden)      each frame (hidden: the bar put away, as while an editor is open)
//   tools.fxObject                its own splash's object, to put in the scene after the clouds' shade (null: the spells')

import * as THREE from 'three';
import { createThornClump } from './thorn-vine.js';

const KEY = 'liora.farm.v1';
const SEED = 2611;
const REACH = 7;                // metres: how far from her a square may be to use a tool on it
const NEAR = 9;                 // metres from the farm's edge: the bar shows
const DAY = 720;                // seconds in a day of the game (time-of-day.js, daySeconds): a watered square is dry by the next
const RAIN_R = 1.8;             // metres round where the rain falls
// what lies on a square of the farm as it begins, and how likely (the rest: meadow, cut short)
const KINDS = [['weed', 0.3], ['pebbles', 0.07], ['stone', 0.07], ['boulder', 0.035], ['branch', 0.09], ['stump', 0.035]];
const CLEAR = (i, j) => i <= 4 && j <= 2;                                // the corner by the road (and where she starts), clear
const CURSED = ['17,10', '18,10', '17,11', '18,11', '19,11', '18,12', '19,12'];      // the curse on a patch toward the far corner
const TOOLS = [
  { id: 'clear', icon: '🪄', name: 'เคลียร์', hint: 'แตะของรกเพื่อเคลียร์ · หินก้อนใหญ่กับตอไม้ต้องหลายครั้ง' },
  { id: 'till', icon: '⛏', name: 'ไถ', hint: 'แตะช่องที่โล่ง เพื่อขุดเป็นแปลงดิน' },
  { id: 'water', icon: '💧', name: 'รดน้ำ', hint: 'แตะช่องที่ขุดแล้ว เพื่อรดน้ำ' },
  { id: 'rain', icon: '🌧', name: 'เวทฝน', hint: 'แตะ ฝนจะตกรอบๆ จุดนั้น' },
  { id: 'magic', icon: '✨', name: 'มนต์', hint: 'แตะช่องที่ขุดแล้ว เพื่อใส่มนต์' },
  { id: 'lift', icon: '🌱', name: 'ถอนสาป', hint: 'แตะช่องที่มีเถาหนาม เพื่อถอนคำสาป' },
];
// (the game's own round buttons, a little darker: they stand over the bright meadow)
const CSS = `
  #farmTools { position: fixed; left: max(10px, env(safe-area-inset-left)); top: 50%; transform: translateY(-50%); z-index: 4; display: flex; flex-direction: column; gap: 7px; }
  #farmTools[hidden] { display: none; }
  #farmTools button { width: 52px; height: 52px; padding: 0; border-radius: 50%; border: 2px solid rgba(255, 255, 255, .75); background: rgba(52, 40, 28, .5);
    color: #fff; font: 700 10px system-ui, sans-serif; text-shadow: 0 1px 2px rgba(0, 0, 0, .6); display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1px; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  #farmTools button b { font-size: 19px; line-height: 1; font-weight: 400; text-shadow: none; }
  #farmTools button.on { background: rgba(176, 122, 60, .94); border-color: #fff; box-shadow: 0 0 0 3px rgba(255, 255, 255, .35); }
  #farmSay { position: absolute; left: 62px; box-sizing: border-box; width: max-content; max-width: min(46vw, 180px); transform: translateY(-50%); pointer-events: none; opacity: 0; transition: opacity .25s;
    background: rgba(58, 44, 34, .88); color: #fff; font: 600 12.5px/1.35 system-ui, sans-serif; padding: 7px 12px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, .4); }
  #farmSay.on { opacity: 1; }
  @media (max-height: 520px) {      /* the phone on its side: too low for a column beside the game's buttons at the left, so a row at the top's middle */
    #farmTools { top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); flex-direction: row; gap: 6px; }
    #farmTools button { width: 44px; height: 44px; font-size: 8.5px; } #farmTools button b { font-size: 16px; }
    #farmSay { left: 50% !important; top: 54px !important; transform: translateX(-50%); max-width: min(60vw, 320px); }
  }
`;
const rngOf = s => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

export async function createFarmTools({ farm, scene, player, camera = null, heightAt, fx = null, day = DAY } = {}) {
  const { soil, debris, rect } = farm;
  const v = new THREE.Vector3();
  soil.dryTime = day;
  let own = null;                                                         // (no spells: a splash of its own)
  if (!fx) { const { createMagicComboFx } = await import('./magic-combo-fx.js'); own = fx = createMagicComboFx(); fx.look('water'); }

  // ---- the farm as it began: for every square the same dice in the same order, whatever is kept (so what is kept names it)
  const START = [];
  {
    const rng = rngOf(SEED);
    for (let j = 0; j < soil.rows; j++) for (let i = 0; i < soil.cols; i++) {
      let r = rng(); const jx = rng() - 0.5, jz = rng() - 0.5, seed = 1 + Math.floor(rng() * 999), key = i + ',' + j;
      if (CLEAR(i, j) || CURSED.includes(key)) continue;
      let kind = null;
      for (const [k, p] of KINDS) { if (r < p) { kind = k; break; } r -= p; }
      if (!kind) continue;
      const [x, z] = soil.middle(i, j);
      START.push([key, kind, x + jx * 0.2, z + jz * 0.2, seed]);
    }
  }
  // ... and as she left it, if she has been here before (?farm=new: from the start again)
  let kept = null;
  try {
    if (new URLSearchParams(location.search).get('farm') === 'new') localStorage.removeItem(KEY);
    else { const k = JSON.parse(localStorage.getItem(KEY)); if (k && k.v === 1 && Array.isArray(k.soil) && k.left) kept = k; }
  } catch (e) { /* nothing kept: from the start */ }
  for (const [key, kind, x, z, seed] of START) if (!kept || key in kept.left) debris.put(key, kind, x, z, seed, kept ? kept.left[key] : undefined);
  if (kept) soil.load(kept.soil);
  else soil.load(Array.from({ length: soil.cols * soil.rows }, (_, k) => (CURSED.includes((k % soil.cols) + ',' + Math.floor(k / soil.cols)) ? 4 : 0)));
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, soil: soil.save(), left: Object.fromEntries(debris.keys().map(k => [k, debris.on(k).casts])) })); }
    catch (e) { /* not kept: a private window, or full */ }
  };
  let saveIn = -1, saveClock = 0;
  const changed = () => { saveIn = 1; };                                   // (kept a second after the last change)
  addEventListener('pagehide', save);

  // ---- the curse's thorns, on every other cursed square (a bed of them, not a thicket): they come up out of the ground, and
  // go down into it when the curse is lifted
  const thornGroup = new THREE.Group(); thornGroup.name = 'farmThorns';
  scene.add(thornGroup);
  const thorns = new Map();
  const thornOn = (i, j, grow = false) => {
    const k = i + ',' + j;
    if (thorns.has(k) || (i + j) % 2) return;
    const [x, z] = soil.middle(i, j), t = createThornClump({ seed: 1 + i * 7 + j * 13, look: 'curse', size: 0.3, count: 3 });
    t.position.set(x + ((i * 37 + j * 11) % 5 - 2) * 0.08, heightAt(x, z) - 0.02, z + ((i * 13 + j * 29) % 5 - 2) * 0.08);
    t.scale.setScalar(grow ? 0.01 : 1); t.userData.y = t.position.y;
    thornGroup.add(t); thorns.set(k, t);
  };
  const thornOff = (i, j) => { const t = thorns.get(i + ',' + j); if (t) t.userData.going = 0; };
  for (let j = 0; j < soil.rows; j++) for (let i = 0; i < soil.cols; i++) if (soil.get(i, j).cursed > 0.5) thornOn(i, j);

  // ---- the bar: a column of tools at the screen's left, under the game's own buttons there (the moves are on the right); the
  // phone on its side, a row at the top's middle. What she is told shows beside the tool chosen (under the row)
  if (!document.getElementById('farmToolsCss')) { const st = document.createElement('style'); st.id = 'farmToolsCss'; st.textContent = CSS; document.head.append(st); }
  const root = document.createElement('div'); root.id = 'farmTools'; root.hidden = true;
  const bubble = document.createElement('div'); bubble.id = 'farmSay';
  let tool = null, sayT = 0;
  const say = (text, secs = 2.6) => {
    bubble.textContent = text; bubble.classList.toggle('on', !!text); sayT = text ? secs : 0;
    const b = tool && buttons.get(tool);
    bubble.style.top = (b ? b.offsetTop + b.offsetHeight / 2 : 26) + 'px';
  };
  const buttons = new Map();
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.innerHTML = `<b>${t.icon}</b>${t.name}`;
    b.onpointerdown = e => e.stopPropagation();
    b.onclick = () => {
      tool = tool === t.id ? null : t.id;
      for (const [id, el] of buttons) el.classList.toggle('on', id === tool);
      say(tool ? t.hint : '', tool ? 4.5 : 0);
    };
    buttons.set(t.id, b); root.append(b);
  }
  root.append(bubble);
  document.body.append(root);

  // ---- the square used, marked for a moment: its outline on the ground
  const cursor = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false }));
  cursor.renderOrder = 10; cursor.frustumCulled = false; thornGroup.add(cursor);
  let cursorT = 0;
  const mark = (i, j) => {
    const C = [[0, 0], [1, 0], [1, 1], [0, 1]], pts = [], [x0, z0] = soil.middle(i, j);
    for (let e = 0; e < 4; e++) {
      const [ax, az] = C[e], [bx, bz] = C[(e + 1) % 4];
      for (let k = 0; k < 4; k++) { const t = k / 4, px = x0 - 0.5 + ax + (bx - ax) * t, pz = z0 - 0.5 + az + (bz - az) * t; pts.push(new THREE.Vector3(px, heightAt(px, pz) + 0.06, pz)); }
    }
    cursor.geometry.dispose(); cursor.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    cursorT = 0.9;
  };

  // ---- where a tap lands: the ground under the finger (marched along the ray, as the level finds the water), or a thing on
  // the farm the finger was on before the ground behind it (a stump, a boulder: by its own shape; its own square)
  const ray = new THREE.Ray();
  const pick = (o, d) => {
    let ground = null;
    for (let t = 0.5; t < 90; t += 0.15) { const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t; if (y <= heightAt(x, z) + 0.04) { ground = { x, z, t }; break; } }
    if (!ground) return null;
    const it = debris.pick(ray.set(o, d)), on = it && it.t < ground.t + 0.3 && debris.on(it.key);
    return { ground, thing: on ? { x: on.x, z: on.z, t: it.t } : null };
  };
  // ... and of the two (the thing the finger was on first, the ground behind it), the square the tool chosen can be used on:
  // lifting the curse, the cursed square behind a weed; digging, the clear square behind a stone (else the nearer, to be told why)
  const fits = (i, j) => {
    const s = soil.get(i, j), junk = !!debris.on(i + ',' + j), dug = s.tilled > 0.5, cursed = s.cursed > 0.5;
    return tool === 'clear' ? junk : tool === 'till' ? !junk && !cursed && !dug : tool === 'water' ? !junk && (dug || cursed)
      : tool === 'magic' ? !junk && dug && !cursed : tool === 'lift' ? cursed : true;
  };
  // ---- a tool used on a square
  const use = (i, j, hit) => {
    const [mx, mz] = soil.middle(i, j), me = player.position, y = heightAt(mx, mz);
    if (player.airborne === true) return say('ลงถึงพื้นก่อนนะ');
    if (Math.hypot(mx - me.x, mz - me.z) > REACH) return say('ไกลไป เข้าไปใกล้อีกหน่อย');
    const s = soil.get(i, j), dug = s.tilled > 0.5, cursed = s.cursed > 0.5, key = i + ',' + j, junk = debris.on(key);
    mark(i, j);
    if (tool === 'clear') {
      if (!junk) return say(cursed ? 'เถาหนามคำสาปเคลียร์ไม่ได้ ต้องใช้ 🌱 ถอนคำสาป' : 'ช่องนี้ไม่มีของรก');
      const r = debris.cast(key);
      fx.burst(v.set(r.x, r.y, r.z), r.size, false, 'water');
      changed();
      return say(r.gone ? '' : `อีก ${junk.casts - 1} ครั้ง`, 1.4);
    }
    if (tool === 'rain') {                                                // (anywhere on the farm: what is not dug is only rained on)
      fx.ring(v.set(hit.x, heightAt(hit.x, hit.z) + 0.05, hit.z), RAIN_R, 'water');
      soil.rain(hit.x, hit.z, RAIN_R); changed();
      return say('');
    }
    if (junk) return say('ต้องเคลียร์ของรกก่อน (🪄 เคลียร์)');
    if (tool === 'till') {
      if (cursed) return say('ดินต้องสาป ต้องถอนคำสาปก่อน (🌱)');
      if (dug) return say('ช่องนี้ขุดแล้ว', 1.4);
      soil.till(i, j);
    } else if (tool === 'water') {
      if (!dug && !cursed) return say('ต้องขุดก่อนถึงจะรดน้ำได้');
      soil.water(i, j); fx.burst(v.set(mx, y + 0.15, mz), 0.6, false, 'water');
    } else if (tool === 'magic') {
      if (cursed) return say('ดินต้องสาปรับมนต์ไม่ได้');
      if (!dug) return say('ต้องขุดก่อนถึงจะใส่มนต์ได้');
      soil.enrich(i, j); fx.burst(v.set(mx, y + 0.2, mz), 0.6, true, 'water');
    } else if (tool === 'lift') {
      if (!cursed) return say('ช่องนี้ไม่ได้ต้องสาป', 1.6);
      soil.lift(i, j); thornOff(i, j); fx.burst(v.set(mx, y + 0.3, mz), 0.9, true, 'water');
    }
    changed(); say('');
  };

  let wasShown = false;
  return {
    fxObject: own ? own.object : null,
    get tool() { return tool; },
    set tool(id) { tool = TOOLS.some(t => t.id === id) ? id : null; for (const [k, el] of buttons) el.classList.toggle('on', k === tool); },      // (for a test, or the console)
    tap(origin, dir) {
      if (!tool || root.hidden) return false;
      const hit = pick(origin, dir);
      const cands = hit ? [hit.thing, hit.ground].filter(Boolean).map(h => soil.at(h.x, h.z)).filter(Boolean) : [];
      if (!cands.length) return false;                                    // not on the farm: the tap is someone else's (the water's)
      const [i, j] = cands.find(([a, b]) => fits(a, b)) || cands[0];
      use(i, j, hit.ground);                                               // (the rain falls where the finger met the ground)
      return true;
    },
    update(dt, hidden = false) {
      const p = player.position, away = Math.hypot(Math.max(rect[0] - p.x, 0, p.x - rect[2]), Math.max(rect[1] - p.z, 0, p.z - rect[3]));
      const show = !hidden && away < NEAR;
      if (root.hidden === show) {
        root.hidden = !show;
        if (show && !wasShown) { wasShown = true; say('ฟาร์มของเรา · เลือกเครื่องมือ แล้วแตะช่องในแปลง', 4.5); }
      }
      if (own) own.update(dt, camera);
      if (sayT > 0 && (sayT -= dt) <= 0) bubble.classList.remove('on');
      cursorT = Math.max(0, cursorT - dt); cursor.material.opacity = Math.min(1, cursorT * 2) * 0.9; cursor.visible = cursorT > 0;
      for (const [k, t] of thorns) {
        if (t.userData.going !== undefined) {                              // the curse lifted: down into the ground
          const g = t.userData.going = t.userData.going + dt, e = Math.min(1, g / 0.6);
          t.scale.setScalar(1 - 0.7 * e); t.position.y = t.userData.y - e * 0.35;
          if (e >= 1) { thornGroup.remove(t); t.userData.dispose(); thorns.delete(k); }
        } else if (t.scale.x < 1) t.scale.setScalar(Math.min(1, t.scale.x + dt * 2.2));      // (up out of the ground)
      }
      if (saveIn >= 0 && (saveIn -= dt) < 0) save();
      if (show && (saveClock += dt) > 20) { saveClock = 0; save(); }       // (now and then while she is here: the squares drying)
    },
    save,
  };
}
