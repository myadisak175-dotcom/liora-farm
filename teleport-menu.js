/* ==========================================================================
   teleport-menu.js  —  a button that takes her straight to a place on the map

     createTeleportMenu({ level, player, top: 206 });      // reads level.views ({ name: { x, z, yaw } })

   One job: show the places the level offers, grouped by area, and send her there on a tap.
   Only the places the map actually has are listed; a map with none gets no button.
   ========================================================================== */

// the places, in the order they are shown, by area: the view's name in level.views, and what the button says
const GROUPS = [
  ['หุบเขา', [['start', '🏠 จุดเริ่ม'], ['falls', '💧 ตีนน้ำตก'], ['climb', '🧗 ทางขึ้นผา']]],
  ['หมู่บ้าน', [['village', '🏘 หมู่บ้าน'], ['mill', '🌾 กังหันลม'], ['tree', '🌳 ต้นไม้ใหญ่'], ['guild', '⚔️ กิลด์นักผจญภัย']]],
  ['ห้วงลึก', [['abyss', '👀 จุดชมวิว'], ['bridge', '🌉 กลางสะพานแขวน'], ['brink', '🌊 ขอบเหว (ลุยน้ำ)'], ['abyssNorth', '🧭 ขอบหลุมฝั่งเหนือ'],
    ['abyssEast', '🌅 ขอบหลุมฝั่งตะวันออก'], ['abyssWest', '🌄 ขอบหลุมฝั่งตะวันตก'], ['rim', '🧗 ตีนทางขึ้นรอบหลุม']]],
  ['ก้นห้วงลึก', [['warp-rim', '🌀 แท่นวาปลงก้นห้วงลึก']]],
  ['Blockout มอนด์', [['bo-meadow', '🌾 ทุ่งหญ้า'], ['bo-foot', '⛰ ตีนผา A'], ['bo-lake', '🏞 ริมทะเลสาบ'], ['bo-falls', '💧 ตีนน้ำตก'], ['bo-a', '🟫 ลาน A (8 ม.)'], ['bo-b', '🟫 ลาน B (17 ม.)'], ['bo-ridge', '🌉 สันเขาขึ้นยอด'], ['bo-peak', '🌳 ยอดเขา (32 ม.)']]],
  ['หมู่บ้านขั้นบันได', [['vt-plaza', '⛲ ลานบ่อน้ำ (ชั้นล่าง)'], ['vt-market', '🛒 ตลาด (ชั้นกลาง)'], ['vt-manor', '🌳 คฤหาสน์ + ต้นไม้ใหญ่ (ชั้นบนสุด)'], ['vt-pasture', '🐑 คอกแกะ'],
    ['vt-keep', '🏰 หอคอย + โรงสีน้ำ'], ['vt-mill', '🌾 กังหันลม'], ['vt-west', '🏡 ชั้นตะวันตก'], ['vt-bridge', '🌉 สะพานหิน (พื้นล่าง)']]],
  ['ทดสอบหิน', [['rk-clearing', '🪨 ลานกลาง'], ['rk-cliff', '⛰ ตีนผา'], ['rk-falls', '💦 น้ำตก'], ['rk-top', '🏔 บนผา'], ['rk-pond', '💧 บ่อน้ำ'], ['rk-stream', '🌊 หินข้ามลำธาร'], ['rk-path', '🟫 ทางดิน']]],
];

const CSS = `
#tpBtn { position:fixed; left:max(10px,env(safe-area-inset-left)); top:calc(var(--tp-top) + env(safe-area-inset-top)); z-index:4; border:1px solid #ffffff88; border-radius:999px; padding:9px 14px; background:#c0702edc; color:white; font:600 12px system-ui; touch-action:manipulation; }
#tpSheet { position:fixed; inset:0; z-index:20; display:none; align-items:center; justify-content:center; background:#0006; }
#tpSheet.open { display:flex; }
#tpSheet .box { width:min(94%, 560px); max-height:88%; overflow:auto; padding:14px 14px 10px; border-radius:18px; background:#fffffffa; box-shadow:0 8px 30px #0006; font:13px system-ui; color:#16324a; }
#tpSheet h4 { margin:8px 2px 6px; font-size:12px; color:#6d8a4f; letter-spacing:.03em; }
#tpSheet .row { display:flex; flex-wrap:wrap; gap:7px; }
#tpSheet button { border:1px solid #c9d8c0; border-radius:999px; padding:9px 13px; background:#f3f8ee; color:#16324a; font:600 12px system-ui; touch-action:manipulation; }
#tpSheet button.close { display:block; margin:12px auto 2px; background:#16324a; color:white; border:0; }
`;

export function createTeleportMenu({ level, player, top = 206, onGo = null } = {}) {
  const views = level.views || {};
  const groups = GROUPS.map(([title, items]) => [title, items.filter(([k]) => views[k])]).filter(([, items]) => items.length);
  if (!groups.length) return null;
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const btn = document.createElement('button'); btn.id = 'tpBtn'; btn.textContent = '📍 ไปที่…';
  btn.style.setProperty('--tp-top', top + 'px');
  const sheet = document.createElement('div'); sheet.id = 'tpSheet';
  const box = document.createElement('div'); box.className = 'box';
  sheet.append(box);
  for (const [title, items] of groups) {
    const h = document.createElement('h4'); h.textContent = title;
    const row = document.createElement('div'); row.className = 'row';
    for (const [k, label] of items) {
      const b = document.createElement('button'); b.textContent = label;
      b.onclick = () => { const v = views[k]; player.teleport(v.x, v.z, v.yaw); close(); if (onGo) onGo(k); };
      row.append(b);
    }
    box.append(h, row);
  }
  const shut = document.createElement('button'); shut.className = 'close'; shut.textContent = 'ปิด';
  box.append(shut);
  const close = () => sheet.classList.remove('open');
  shut.onclick = close;
  sheet.onclick = e => { if (e.target === sheet) close(); };
  // taps here belong to the menu, not to the game underneath (no camera turning, no splashes)
  for (const el of [btn, sheet]) { el.onpointerdown = e => e.stopPropagation(); el.ontouchstart = e => e.stopPropagation(); }
  btn.onclick = () => sheet.classList.add('open');
  document.body.append(btn, sheet);
  return { open: () => sheet.classList.add('open'), close };
}
