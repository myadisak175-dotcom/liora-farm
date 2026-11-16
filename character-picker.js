/* ==========================================================================
   character-picker.js  —  a button that lets you choose who walks the world

     createCharacterPicker({ characters, current, faceOf, top: 134, onPick: async id => { ... } });

   One job: show the playable characters' faces, and on a tap ask onPick(id) to put that one in her place. The tapped face
   says it is loading until onPick has finished (a character is a 1.3-2 MB download the first time); if it fails, it says
   so and the one playing stays. The button sits top left, under the hand tools, and shows who is playing.
   ========================================================================== */

const CSS = `
#charBtn { position:fixed; left:max(10px,env(safe-area-inset-left)); top:calc(var(--ch-top) + env(safe-area-inset-top)); z-index:4; display:flex; align-items:center; gap:7px; border:1px solid #ffffff88; border-radius:999px; padding:4px 13px 4px 4px; background:#4b5aa8dc; color:white; font:600 12px system-ui; touch-action:manipulation; }
#charBtn img { width:26px; height:26px; border-radius:50%; object-fit:cover; background:#ffffff55; }
#charSheet { position:fixed; inset:0; z-index:20; display:none; align-items:center; justify-content:center; background:#0006; }
#charSheet.open { display:flex; }
#charSheet .box { width:min(94%, 560px); max-height:88%; overflow:auto; padding:14px 14px 10px; border-radius:18px; background:#fffffffa; box-shadow:0 8px 30px #0006; font:13px system-ui; color:#16324a; }
#charSheet h4 { margin:4px 2px 10px; font-size:12px; color:#6d8a4f; letter-spacing:.03em; }
#charSheet .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(86px, 1fr)); gap:8px; }
#charSheet .pick { display:grid; justify-items:center; gap:5px; padding:8px 4px 7px; border:2px solid transparent; border-radius:14px; background:#f3f6fb; color:#16324a; font:600 11px system-ui; touch-action:manipulation; }
#charSheet .pick img { width:62px; height:62px; border-radius:50%; object-fit:cover; background:#dfe6f2; }
#charSheet .pick.on { border-color:#4b5aa8; background:#e6eaf8; }
#charSheet .pick.busy { opacity:.6; }
#charSheet .pick small { font:500 10px system-ui; color:#6b7a90; min-height:12px; }
#charSheet .pick small.err { color:#b23a3a; }
#charSheet button.close { display:block; margin:12px auto 2px; border:0; border-radius:999px; padding:9px 16px; background:#16324a; color:white; font:600 12px system-ui; }
`;

export function createCharacterPicker({ characters, current, faceOf, top = 134, onPick } = {}) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const btn = document.createElement('button'); btn.id = 'charBtn'; btn.type = 'button';
  btn.style.setProperty('--ch-top', top + 'px');
  const btnFace = document.createElement('img'); btnFace.alt = '';
  const btnText = document.createElement('span'); btnText.textContent = 'ตัวละคร';
  btn.append(btnFace, btnText);
  const sheet = document.createElement('div'); sheet.id = 'charSheet';
  const box = document.createElement('div'); box.className = 'box';
  const h = document.createElement('h4'); h.textContent = 'เลือกตัวละคร';
  const grid = document.createElement('div'); grid.className = 'grid';
  const shut = document.createElement('button'); shut.className = 'close'; shut.type = 'button'; shut.textContent = 'ปิด';
  box.append(h, grid, shut);
  sheet.append(box);

  let busy = false;
  const tiles = new Map();
  const show = () => {
    const c = characters.find(x => x.id === current);
    btnFace.src = faceOf(current);
    btn.setAttribute('aria-label', `ตัวละคร: ${c ? c.name : current}`);
    for (const [id, t] of tiles) t.el.classList.toggle('on', id === current);
  };
  for (const c of characters) {
    const el = document.createElement('button'); el.className = 'pick'; el.type = 'button';
    const img = document.createElement('img'); img.alt = ''; img.src = faceOf(c.id); img.loading = 'lazy';
    const name = document.createElement('span'); name.textContent = c.name;
    const note = document.createElement('small');
    el.append(img, name, note);
    el.onclick = async () => {
      if (busy) return;
      if (c.id === current) { close(); return; }
      busy = true;
      note.className = ''; note.textContent = 'กำลังโหลด…';
      el.classList.add('busy');
      try {
        await onPick(c.id);
        current = c.id;
        note.textContent = '';
        show();
        close();
      } catch (err) {
        console.warn('[character]', c.id, err);
        note.className = 'err'; note.textContent = 'โหลดไม่สำเร็จ';
      } finally {
        busy = false;
        el.classList.remove('busy');
      }
    };
    tiles.set(c.id, { el, note });
    grid.append(el);
  }
  const close = () => sheet.classList.remove('open');
  shut.onclick = close;
  sheet.onclick = e => { if (e.target === sheet && !busy) close(); };
  // taps here belong to the picker, not to the game underneath (no camera turning, no splashes)
  for (const el of [btn, sheet]) { el.onpointerdown = e => e.stopPropagation(); el.ontouchstart = e => e.stopPropagation(); }
  btn.onclick = () => sheet.classList.add('open');
  document.body.append(btn, sheet);
  show();
  return { open: () => sheet.classList.add('open'), close, get current() { return current; } };
}
