/* ==========================================================================
   game-map.js  —  the map as a game shows it: a small round one that follows her, and the whole map on a tap

     const map = await createGameMap({ url: level.map, player, places });      // places: teleportPlaces(level)
     every frame: map.update()

   One job: show where she is on a picture of the land, and take her to a place she picks on it.
   The picture is painted from the level's own plan (tools/make-hill-village-map.py); its .json says which part of the
   world it covers. North (the game's -z) is at the top, east (+x) to the right.

   The small map: a circle at the top of the screen, the land sliding under an arrow that points the way she faces, with
   a pale fan for the way the camera looks. A tap opens the whole map.
   The whole map: drag to move it, pinch (or the + and - buttons, or the wheel) to zoom. Every place the level offers is a
   pin; a tap on a pin names it and offers to go there. ◎ brings her back to the middle.

   Mobile-first: no canvas redrawn each frame; the picture is one <img> moved with a CSS transform.
   ========================================================================== */

const CSS = `
#gmMini { position:fixed; left:50%; top:calc(6px + env(safe-area-inset-top)); width:96px; height:96px; margin-left:-48px; z-index:4; border-radius:50%; overflow:hidden;
  border:2px solid #fffdf2; box-shadow:0 2px 10px #0005, inset 0 0 0 1px #0002; background:#dfe8d8; touch-action:manipulation; cursor:pointer; }
#gmMini .land { position:absolute; left:0; top:0; transform-origin:0 0; will-change:transform; }
#gmMini .land img { display:block; }
#gmMini .dot { position:absolute; width:18px; height:18px; margin:-9px 0 0 -9px; border-radius:50%; background:#ff9d2e; border:4px solid #fffdf2; box-sizing:border-box; }
#gmMini .fan, #gmFull .fan { position:absolute; left:50%; top:50%; width:0; height:0; margin:-34px 0 0 -22px; border-left:22px solid transparent; border-right:22px solid transparent; border-top:34px solid #ffffff66;
  transform-origin:22px 34px; pointer-events:none; }
#gmMini .me, #gmFull .me { position:absolute; left:50%; top:50%; width:0; height:0; margin:-11px 0 0 -8px; border-left:8px solid transparent; border-right:8px solid transparent; border-bottom:19px solid #2f7fe0;
  filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 1px 2px #0006); transform-origin:8px 11px; pointer-events:none; }
#gmMini .north { position:absolute; left:50%; top:2px; margin-left:-7px; width:14px; text-align:center; font:700 9px system-ui; color:#16324a; text-shadow:0 0 2px #fff, 0 0 2px #fff; pointer-events:none; }
#gmFull { position:fixed; inset:0; z-index:30; display:none; background:#10241acc; overflow:hidden; touch-action:none; font:13px system-ui; color:#16324a; }
#gmFull.open { display:block; }
#gmFull .land { position:absolute; left:0; top:0; transform-origin:0 0; will-change:transform; border-radius:6px; box-shadow:0 6px 30px #0008; }
#gmFull .land img { display:block; border-radius:6px; }
#gmFull .pins { position:absolute; inset:0; pointer-events:none; }
#gmFull .pin { position:absolute; width:30px; height:30px; margin:-15px 0 0 -15px; padding:0; border-radius:50%; border:2px solid #fffdf2; background:#fff8e6f2; box-shadow:0 2px 6px #0006; font-size:15px; line-height:26px;
  text-align:center; pointer-events:auto; touch-action:manipulation; }
#gmFull .pin.on { background:#ffb347; border-color:#fff; transform:scale(1.25); z-index:2; }
#gmFull .who { position:absolute; left:0; top:0; width:0; height:0; pointer-events:none; z-index:3; }
#gmFull .who .fan, #gmFull .who .me { left:0; top:0; }
#gmFull .bar { position:absolute; left:max(10px,env(safe-area-inset-left)); top:calc(8px + env(safe-area-inset-top)); display:flex; gap:8px; align-items:center; }
#gmFull .title { padding:8px 14px; border-radius:999px; background:#fffdf2f2; font-weight:700; box-shadow:0 2px 8px #0004; }
#gmFull button.tool { width:40px; height:40px; border-radius:50%; border:0; background:#fffdf2f2; color:#16324a; font:700 18px system-ui; box-shadow:0 2px 8px #0004; touch-action:manipulation; }
#gmFull .close { position:absolute; right:max(10px,env(safe-area-inset-right)); top:calc(8px + env(safe-area-inset-top)); }
#gmFull .zoom { position:absolute; right:max(10px,env(safe-area-inset-right)); bottom:max(12px,env(safe-area-inset-bottom)); display:flex; flex-direction:column; gap:8px; }
#gmFull .card { position:absolute; left:50%; bottom:max(12px,env(safe-area-inset-bottom)); transform:translateX(-50%); display:none; align-items:center; gap:12px; padding:9px 10px 9px 16px; border-radius:999px;
  background:#fffdf2fa; box-shadow:0 4px 16px #0006; white-space:nowrap; max-width:86vw; }
#gmFull .card.on { display:flex; }
#gmFull .card b { overflow:hidden; text-overflow:ellipsis; }
#gmFull .card button { border:0; border-radius:999px; padding:9px 16px; background:#2f8f5b; color:#fff; font:700 13px system-ui; touch-action:manipulation; }
#gmFull .compass { position:absolute; left:max(12px,env(safe-area-inset-left)); bottom:max(12px,env(safe-area-inset-bottom)); width:38px; height:38px; border-radius:50%; background:#fffdf2e6; box-shadow:0 2px 8px #0004;
  text-align:center; font:700 12px/38px system-ui; color:#c0392b; pointer-events:none; }
`;
const MINI = { size: 96, metres: 64 };          // the small map: this many pixels across, showing this many metres of land
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export async function createGameMap({ url, player, places = [], onGo = null } = {}) {
  const info = await (await fetch(url)).json();
  const src = new URL(info.file, new URL(url, location.href)).href;
  const picture = () => { const i = new Image(); i.src = src; i.width = info.width; i.height = info.height; i.draggable = false; i.alt = ''; return i; };
  const ppm = info.width / (info.x1 - info.x0);                           // the picture's pixels to a metre
  const at = (x, z) => [(x - info.x0) * ppm, (z - info.z0) * ppm];        // a place in the world -> a point of the picture
  document.head.append(Object.assign(el('style'), { textContent: CSS }));
  const icon = label => label.split(' ')[0], name = label => label.slice(label.indexOf(' ') + 1);

  // ---- the small map
  const mini = el('div'); mini.id = 'gmMini'; mini.title = 'แผนที่';
  const miniLand = el('div', 'land'); miniLand.append(picture());
  for (const p of places) { const d = el('div', 'dot'), [px, py] = at(p.x, p.z); d.style.left = px + 'px'; d.style.top = py + 'px'; miniLand.append(d); }
  const miniFan = el('div', 'fan'), miniMe = el('div', 'me');
  mini.append(miniLand, miniFan, miniMe, el('div', 'north', 'N'));
  const mk = MINI.size / MINI.metres / ppm;                               // the picture's scale on the small map

  // ---- the whole map
  const full = el('div'); full.id = 'gmFull';
  const land = el('div', 'land'); land.append(picture());
  const pins = el('div', 'pins'), who = el('div', 'who'), fan = el('div', 'fan'), me = el('div', 'me');
  who.append(fan, me);
  const bar = el('div', 'bar'); bar.append(el('div', 'title', '🗺 แผนที่'));
  const shut = el('button', 'tool close', '✕'), zoom = el('div', 'zoom'), plus = el('button', 'tool', '+'), minus = el('button', 'tool', '−'), home = el('button', 'tool', '◎');
  zoom.append(home, plus, minus);
  const card = el('div', 'card'), cardName = el('b'), go = el('button', '', 'ไปที่นี่');
  card.append(cardName, go);
  full.append(land, pins, who, bar, shut, zoom, card, el('div', 'compass', 'N'));      // (she is drawn over the pins)
  let picked = null;
  const pinEls = places.map(p => {
    const b = el('button', 'pin', icon(p.label)); b.title = name(p.label);
    b.onclick = e => { e.stopPropagation(); pick(p, b); };
    pins.append(b);
    return b;
  });
  const pick = (p, b) => {
    for (const q of pinEls) q.classList.toggle('on', q === b);
    picked = p; card.classList.toggle('on', !!p);
    if (p) cardName.textContent = p.label;
  };
  go.onclick = e => { e.stopPropagation(); if (!picked) return; const p = picked; player.teleport(p.x, p.z, p.yaw); close(); if (onGo) onGo(p.key); };

  // the whole map's view: the picture at scale k, its corner at (ox, oy) on the screen
  let k = 0.6, ox = 0, oy = 0;
  const limits = () => { const w = full.clientWidth || innerWidth, h = full.clientHeight || innerHeight; return { w, h, min: Math.min(w / info.width, h / info.height) * 0.92, max: 2.4 }; };
  const place = () => {
    const { w, h, min, max } = limits();
    k = Math.min(max, Math.max(min, k));
    // the middle of the screen stays on the picture
    ox = Math.min(w / 2, Math.max(w / 2 - info.width * k, ox)); oy = Math.min(h / 2, Math.max(h / 2 - info.height * k, oy));
    land.style.transform = `translate(${ox}px,${oy}px) scale(${k})`;
    places.forEach((p, i) => { const [px, py] = at(p.x, p.z); pinEls[i].style.left = ox + px * k + 'px'; pinEls[i].style.top = oy + py * k + 'px'; });
    drawMe();
  };
  const zoomAt = (factor, sx, sy) => { const { min, max } = limits(), nk = Math.min(max, Math.max(min, k * factor)); ox = sx - (sx - ox) * nk / k; oy = sy - (sy - oy) * nk / k; k = nk; place(); };
  const centre = (x, z) => { const { w, h } = limits(), [px, py] = at(x, z); ox = w / 2 - px * k; oy = h / 2 - py * k; place(); };
  // her arrow and the camera's fan, on both maps (north up: a way (dx, dz) in the world points atan2(dx, -dz) round from up)
  let last = '';
  const drawMe = () => {
    const turn = Math.PI - player.heading, look = -player.camYaw, [px, py] = at(player.position.x, player.position.z);
    miniLand.style.transform = `translate(${MINI.size / 2 - px * mk}px,${MINI.size / 2 - py * mk}px) scale(${mk})`;
    miniMe.style.transform = `rotate(${turn}rad)`; miniFan.style.transform = `rotate(${look}rad)`;
    if (full.classList.contains('open')) {
      who.style.transform = `translate(${ox + px * k}px,${oy + py * k}px)`;
      me.style.transform = `rotate(${turn}rad)`; fan.style.transform = `rotate(${look}rad)`;
    }
  };
  const open = () => { full.classList.add('open'); pick(null, null); k = Math.max(k, 0.6); centre(player.position.x, player.position.z); };
  const close = () => full.classList.remove('open');
  mini.onclick = open; shut.onclick = e => { e.stopPropagation(); close(); };
  plus.onclick = e => { e.stopPropagation(); const { w, h } = limits(); zoomAt(1.5, w / 2, h / 2); };
  minus.onclick = e => { e.stopPropagation(); const { w, h } = limits(); zoomAt(1 / 1.5, w / 2, h / 2); };
  home.onclick = e => { e.stopPropagation(); centre(player.position.x, player.position.z); };

  // drag to move, two fingers to zoom, the wheel to zoom; a tap on the land (not a drag) lets a picked pin go
  const touch = new Map(); let moved = 0, span = 0;
  full.addEventListener('pointerdown', e => { e.stopPropagation(); if (e.target.closest('button')) return; touch.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; span = 0; full.setPointerCapture(e.pointerId); });
  full.addEventListener('pointermove', e => {
    e.stopPropagation();
    const was = touch.get(e.pointerId); if (!was) return;
    touch.set(e.pointerId, [e.clientX, e.clientY]);
    if (touch.size === 1) { ox += e.clientX - was[0]; oy += e.clientY - was[1]; moved += Math.abs(e.clientX - was[0]) + Math.abs(e.clientY - was[1]); place(); }
    else if (touch.size === 2) {
      const [a, b] = [...touch.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (span) zoomAt(d / span, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      span = d; moved += 10;
    }
  });
  const lift = e => { e.stopPropagation(); if (!touch.has(e.pointerId)) return; touch.delete(e.pointerId); span = 0; if (moved < 6 && e.type === 'pointerup') pick(null, null); };
  full.addEventListener('pointerup', lift); full.addEventListener('pointercancel', lift);
  full.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }, { passive: false });
  // taps here belong to the map, not to the game underneath (no camera turning, no splashes)
  for (const node of [mini, full]) { node.addEventListener('pointerdown', e => e.stopPropagation()); node.addEventListener('touchstart', e => e.stopPropagation(), { passive: true }); node.addEventListener('click', e => e.stopPropagation()); }
  addEventListener('resize', () => { if (full.classList.contains('open')) place(); });

  document.body.append(mini, full);
  drawMe();
  return {
    info, open, close,
    get isOpen() { return full.classList.contains('open'); },
    // every frame: the land slides under her on the small map; her arrow turns on both (only when something has changed)
    update() {
      const now = player.position.x.toFixed(1) + ',' + player.position.z.toFixed(1) + ',' + player.heading.toFixed(2) + ',' + player.camYaw.toFixed(2);
      if (now !== last) { last = now; drawMe(); }
    },
    // where a place of the world lies on the open map, in screen pixels (for tests)
    screenOf(x, z) { const [px, py] = at(x, z); return [ox + px * k, oy + py * k]; },
    dispose() { mini.remove(); full.remove(); },
  };
}
