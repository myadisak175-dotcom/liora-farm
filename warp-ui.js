/* ==========================================================================
   warp-ui.js  —  the button that appears at a warp stone, and the list of places it leads to

     const warp = createWarpUI({ level, player });      // reads level.warps: [{ key, name, x, z, yaw, stand: [x, z] }]
     warp.update();                                     // every frame: shows the button while she stands by a stone

   One job: when she is by a warp stone, offer the other stones; on a tap, a white flash and she stands by that one.
   ========================================================================== */
const CSS = `
#warpBtn { position:fixed; left:50%; bottom:calc(168px + env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:5; display:none; border:1px solid #ffffffaa; border-radius:999px;
  padding:11px 20px; background:#1d4f6ee6; color:#fff; font:700 14px system-ui; box-shadow:0 4px 18px #0005; touch-action:manipulation; }
#warpBtn.on { display:block; }
#warpSheet { position:fixed; inset:0; z-index:21; display:none; align-items:center; justify-content:center; background:#0007; }
#warpSheet.open { display:flex; }
#warpSheet .box { width:min(92%, 420px); padding:16px 14px 12px; border-radius:18px; background:#fffffffa; box-shadow:0 8px 30px #0006; font:13px system-ui; color:#16324a; }
#warpSheet h4 { margin:0 2px 10px; font-size:14px; }
#warpSheet button { display:block; width:100%; margin:7px 0; border:1px solid #bcd6e4; border-radius:14px; padding:13px 14px; background:#eef7fb; color:#16324a; font:600 14px system-ui; text-align:left; touch-action:manipulation; }
#warpSheet button.close { text-align:center; background:#16324a; color:#fff; border:0; margin-top:12px; }
#warpFlash { position:fixed; inset:0; z-index:30; background:#fff; opacity:0; pointer-events:none; transition:opacity .18s ease-in; }
#warpFlash.on { opacity:1; }
`;
const ICON = { rim: '🏞', shelf: '☁️', gorge: '💦', meadow: '🪨' };

export function createWarpUI({ level, player, reach = 3.4 } = {}) {
  const warps = level.warps || [];
  if (!warps.length) return null;
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const btn = document.createElement('button'); btn.id = 'warpBtn'; btn.textContent = '🌀 แท่นวาป';
  const sheet = document.createElement('div'); sheet.id = 'warpSheet';
  const box = document.createElement('div'); box.className = 'box'; sheet.append(box);
  const flash = document.createElement('div'); flash.id = 'warpFlash';
  document.body.append(btn, sheet, flash);
  let here = null, busy = false;
  const layers = warps.filter(q => q.key !== 'rim');
  const label = w => `${ICON[w.key] || '🌀'} ${w.key === 'rim' ? '' : 'ชั้น ' + (layers.indexOf(w) + 1) + ' · '}${w.name}`;
  const close = () => sheet.classList.remove('open');
  const go = w => {
    if (busy) return;
    busy = true; close();
    flash.classList.add('on');
    setTimeout(() => {
      player.teleport(w.stand[0], w.stand[1], w.yaw);
      if (level.follow) level.follow(player.position, player.lookDir);
      setTimeout(() => { flash.style.transition = 'opacity .45s ease-out'; flash.classList.remove('on'); setTimeout(() => { flash.style.transition = ''; busy = false; }, 460); }, 120);
    }, 200);
  };
  const open = () => {
    box.textContent = '';
    const h = document.createElement('h4'); h.textContent = 'วาปไปที่ไหน?'; box.append(h);
    for (const w of warps) {
      if (w === here) continue;
      const b = document.createElement('button'); b.textContent = label(w); b.onclick = () => go(w); box.append(b);
    }
    const c = document.createElement('button'); c.className = 'close'; c.textContent = 'ปิด'; c.onclick = close; box.append(c);
    sheet.classList.add('open');
  };
  btn.onclick = open;
  sheet.addEventListener('pointerdown', e => { if (e.target === sheet) close(); });
  return {
    warps, go, label,
    get here() { return here; },
    update() {
      const p = player.position;
      let best = null, bd = reach;
      for (const w of warps) { const d = Math.hypot(p.x - w.x, p.z - w.z); if (d < bd) { bd = d; best = w; } }
      if (best !== here) { here = best; btn.classList.toggle('on', !!here && !busy); if (!here) close(); }
      else if (here) btn.classList.toggle('on', !busy);
    },
  };
}
