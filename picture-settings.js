// picture-settings.js
// The picture as the player sets it (27 Nov 2026). On the user's iPhone 17 Pro the game took its own picture down as she
// played and its frames came unevenly ("ยังลดคุณภาพอยู่ เฟรมเรทก็ไม่นิ่ง งงมาก"); asked how it should be, she chose to set
// it herself, the game never changing it on its own ("ให้เลือกเองในตั้งค่า"). Two choices, in the settings card
// (sound-settings.js holds it: ⚙️ ตั้งค่า), kept for the next time (localStorage 'loria.picture'):
//
//   ภาพ   สวย   the picture as the game is drawn at its best
//         ลื่น   a lighter one: what index.html makes of it (a coarser picture, thinner grass, the clouds redrawn less
//                often, a smaller mirror on the water)
//   เฟรม  60    as many frames as a 60 Hz screen shows
//         30    every other one, steady: a phone that cannot keep 60 draws its frames at 16, 33 and 50 ms as each happens
//                to fit, and the eye takes that unevenness for stutter more than it takes 30 for it
//
//   const pic = createPictureSettings({ apply })
//     apply({ look, fps }): index.html sets the picture (look 'pretty' or 'smooth', fps 60 or 30); called at once on a
//     choice, and by the page itself (pic.apply()) once what it sets is there, before its warm-up
//   → { values, section, apply() }      section: the rows, for the settings card

const KEY = 'loria.picture';
const CHOICES = [
  ['look', 'ภาพ', [['pretty', 'สวย'], ['smooth', 'ลื่น']]],
  ['fps', 'เฟรม', [[60, '60'], [30, '30']]],
];

const STYLE = `
  .picRows { margin: 2px 0 6px; }
  .picRows .row { display: grid; grid-template-columns: 6.6em 1fr; align-items: center; gap: 8px; min-height: 44px; }
  .picRows .seg { display: flex; gap: 6px; }
  .picRows .seg button { flex: 1; min-height: 36px; border: 0; border-radius: 999px; background: rgba(39, 52, 26, .1); color: inherit;
    font: inherit; font-size: 14px; touch-action: manipulation; }
  .picRows .seg button.on { background: #5d8a3a; color: #fff; }
  .picRows small { display: block; margin: 2px 0 0; color: #5b6650; font-size: 12px; line-height: 1.4; }
`;

export function createPictureSettings({ apply = () => {} } = {}) {
  const values = { look: 'pretty', fps: 60 };
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (kept && (kept.look === 'pretty' || kept.look === 'smooth')) values.look = kept.look;
    if (kept && (kept.fps === 60 || kept.fps === 30)) values.fps = kept.fps;
  } catch (err) { /* (no storage here, or what was kept is not readable: สวย, 60) */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (err) { /* (no storage here) */ } };

  if (!document.getElementById('pictureSettingsStyle')) {
    const st = document.createElement('style'); st.id = 'pictureSettingsStyle'; st.textContent = STYLE; document.head.appendChild(st);
  }
  const section = document.createElement('div'); section.className = 'picRows';
  const buttons = [];
  for (const [k, name, options] of CHOICES) {
    const row = document.createElement('div'); row.className = 'row';
    const t = document.createElement('span'); t.textContent = name;
    const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', name);
    for (const [v, label] of options) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.onclick = () => { if (values[k] === v) return; values[k] = v; save(); show(); apply({ ...values }); };
      seg.append(b); buttons.push([k, v, b]);
    }
    row.append(t, seg); section.append(row);
  }
  const note = document.createElement('small');
  note.textContent = 'ลื่น: ภาพหยาบลง หญ้าบางลง · 30: นิ่งกว่า ถ้าเครื่องทำ 60 ไม่ทัน';
  section.append(note);
  function show() { for (const [k, v, b] of buttons) { const on = values[k] === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } }
  show();

  return { values, section, apply: () => apply({ ...values }) };
}
