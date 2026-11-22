// sound-settings.js
// 🔊 The game's sound settings ("น่าจะทำให้ปรับตั้งค่าเสียงเองได้นะ หลายๆ เกมก็ทำ": let the player set the sound, as many
// games do). A button under the world's button opens a small panel of four sliders; what is set is heard at once and kept
// for the next time (localStorage 'loria.sound').
//
//   createSoundSettings({ sounds, air, music, base })
//     sounds: step-sounds.js; air: ambience-places.js; music: music.js (air and music may be null: ?air=0, ?music=0);
//     base: how loud the page asked for all of it (?sound=), 1 if it asked nothing
//   → { values, open(), close(), button, panel }      (values: { all, music, air, her }, each 0..100)
//
//   เสียงรวม       all of it
//   เพลง           the music. At 0 it is switched off: what plays fades away and nothing more is played or fetched. The
//                  panel took the place of the 🎵 button, and a player who had switched the music off there finds it at 0
//   บรรยากาศ       the air about her: the wind, the water, the birds, the trees, the windmill and the wheel
//   เสียงตัวละคร   her own: her steps, her jumps and landings, the water as she goes into it and swims
//
// 100 is each as it was tuned, and the most: nothing is made louder than it was (so nothing clips that did not; to hear
// the music over the rest, the rest comes down). A slider is heard as the square of where it stands (HEARD: 50 is a
// quarter, 12 dB down), which is near how the ear hears loudness: at 50 it sounds about half as loud, where with the
// slider as it stands the first half of its travel would hardly be heard to change anything.

const KEY = 'loria.sound';
const OLD_MUSIC_KEY = 'loria.music';          // the 🎵 button's choice, 'on' or 'off', before this panel
const ROWS = [['all', 'เสียงรวม'], ['music', 'เพลง'], ['air', 'บรรยากาศ'], ['her', 'เสียงตัวละคร']];
const STEP = 5;                               // the sliders move by so much
const HEARD = v => (v / 100) ** 2;            // a slider's place (0..100) → its gain
const clamp = v => Math.min(100, Math.max(0, Math.round(+v || 0)));

const STYLE = `
  #soundBtn.off { background: rgba(60, 60, 60, .7); }
  #soundPanel { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
    background: rgba(20, 26, 14, .35); box-sizing: border-box;
    padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }
  #soundPanel[hidden] { display: none; }
  #soundPanel .card { width: min(340px, 100%); max-height: 100%; overflow-y: auto; box-sizing: border-box; padding: 10px 16px 14px;
    background: rgba(250, 247, 236, .97); color: #27341a; border-radius: 16px; box-shadow: 0 6px 24px rgba(0, 0, 0, .25); font-size: 14px; }
  #soundPanel .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  #soundPanel .head b { font-size: 15px; }
  #soundPanel .x { width: 36px; height: 36px; border: 0; border-radius: 50%; background: none; color: inherit; font: inherit; font-size: 18px;
    touch-action: manipulation; }
  #soundPanel .row { display: grid; grid-template-columns: 6.6em 1fr 3em; align-items: center; gap: 8px; min-height: 42px; }
  #soundPanel input[type=range] { width: 100%; height: 32px; margin: 0; accent-color: #5d8a3a; touch-action: none; }
  #soundPanel output { text-align: right; font-variant-numeric: tabular-nums; }
  #soundPanel .reset { margin-top: 8px; border: 0; border-radius: 999px; padding: 8px 14px; background: rgba(39, 52, 26, .12);
    color: inherit; font: inherit; font-size: 13px; touch-action: manipulation; }
`;

export function createSoundSettings({ sounds = null, air = null, music = null, base = 1 } = {}) {
  const values = { all: 100, music: 100, air: 100, her: 100 };
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (kept && typeof kept === 'object') { for (const k of Object.keys(values)) if (k in kept) values[k] = clamp(kept[k]); }
    else if (localStorage.getItem(OLD_MUSIC_KEY) === 'off') values.music = 0;
  } catch (err) { /* (no storage here, or what was kept is not readable: as tuned) */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (err) { /* (no storage here) */ } };

  if (!document.getElementById('soundSettingsStyle')) {
    const st = document.createElement('style'); st.id = 'soundSettingsStyle'; st.textContent = STYLE; document.head.appendChild(st);
  }

  // ---- the button (where the 🎵 button was: index.html places it, by body.sound)
  const button = document.createElement('button');
  button.id = 'soundBtn'; button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');

  // ---- the panel: a card over a dimmed screen (a tap on the dimmed part, ✕, or Escape closes it)
  const panel = document.createElement('div'); panel.id = 'soundPanel'; panel.hidden = true;
  const card = document.createElement('div'); card.className = 'card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'ตั้งค่าเสียง');
  const head = document.createElement('div'); head.className = 'head';
  const title = document.createElement('b'); title.textContent = '🔊 ตั้งค่าเสียง';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '✕'; x.setAttribute('aria-label', 'ปิด');
  head.append(title, x); card.append(head);

  const rows = {};
  for (const [k, name] of ROWS) {
    if ((k === 'music' && !music) || (k === 'air' && !air) || (k === 'her' && !sounds)) continue;
    const row = document.createElement('label'); row.className = 'row';
    const t = document.createElement('span'); t.textContent = name;
    const r = document.createElement('input'); r.type = 'range'; r.min = '0'; r.max = '100'; r.step = String(STEP); r.value = String(values[k]);
    r.setAttribute('aria-label', name);
    const o = document.createElement('output');
    r.addEventListener('input', () => { values[k] = clamp(r.value); apply(); save(); });
    row.append(t, r, o); card.append(row); rows[k] = { r, o };
  }
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'reset'; reset.textContent = 'ค่าเริ่มต้น';
  reset.onclick = () => { for (const k of Object.keys(values)) values[k] = 100; apply(); save(); };
  card.append(reset); panel.append(card);

  // what is set, heard (and shown)
  function apply() {
    const all = HEARD(values.all);
    if (sounds) sounds.volume = base * all * HEARD(values.her);
    if (air) air.volume = base * all * HEARD(values.air);
    if (music) {
      music.volume = base * all * HEARD(values.music);
      const on = values.music > 0 && values.all > 0;
      if (music.on !== on) music.on = on;
    }
    for (const [k, { r, o }] of Object.entries(rows)) { r.value = String(values[k]); o.textContent = values[k] + '%'; }
    const quiet = values.all === 0;
    button.textContent = quiet ? '🔇 เสียง' : '🔊 เสียง';
    button.classList.toggle('off', quiet);
  }

  const open = () => { panel.hidden = false; button.setAttribute('aria-expanded', 'true'); };
  const close = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.onclick = () => (panel.hidden ? open() : close());
  x.onclick = close;
  panel.addEventListener('click', e => { if (e.target === panel) close(); });
  // keys pressed on a slider move the slider, not her (the game hears keys on the window: they stop here)
  for (const type of ['keydown', 'keyup']) card.addEventListener(type, e => { if (e.code === 'Escape' && type === 'keydown') close(); e.stopPropagation(); });
  addEventListener('keydown', e => { if (e.code === 'Escape' && !panel.hidden) close(); });

  apply();
  document.body.append(button, panel);
  document.body.classList.add('sound');
  return { values, open, close, button, panel };
}
