// tuner-panel.js
// The slider panel itself, shared by every tuner (water, sky): it knows nothing about what it tunes.
// Give it a set of uniform objects ({ value }) and a list of controls; it builds the sliders, remembers the values
// on this device, and offers reset / copy-as-text / close. Opening one panel closes any other.
//
//   createTunerPanel({ tune, controls, key, button, panel, onChange, head })
//     controls: ['a heading'] or [name in tune, label, min, max, step]
//     key:      where the values are remembered (localStorage)
//     onChange: called after any slider moves
//     head:     optional function(panel) that adds its own controls above the sliders

export function createTunerPanel({ tune, controls, key, button, panel, onChange = null, head = null }) {
  const names = controls.filter(c => c.length > 1).map(c => c[0]);
  const defaults = Object.fromEntries(names.map(k => [k, tune[k].value]));
  const save = () => { try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(names.map(k => [k, tune[k].value])))); } catch (e) { /* private mode: just not remembered */ } };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved) for (const k of names) if (typeof saved[k] === 'number') tune[k].value = saved[k];
  } catch (e) { /* nothing saved */ }

  if (head) head(panel);
  const rows = [];
  const fmt = (v, step) => (+v).toFixed(step < 0.01 ? 3 : 2);
  for (const c of controls) {
    if (c.length === 1) { const h = document.createElement('h4'); h.textContent = c[0]; panel.appendChild(h); continue; }
    const [name, label, min, max, step] = c;
    const row = document.createElement('label');
    const text = document.createElement('span'); text.textContent = label;
    const val = document.createElement('b');
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min, max, step, value: tune[name].value });
    val.textContent = fmt(tune[name].value, step);
    input.addEventListener('input', () => { tune[name].value = +input.value; val.textContent = fmt(input.value, step); save(); if (onChange) onChange(name); });
    row.append(text, val, input);
    panel.appendChild(row);
    rows.push({ name, input, val, step });
  }
  const bar = document.createElement('div'); bar.className = 'bar';
  const mk = (text, fn) => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; bar.appendChild(b); return b; };
  const out = document.createElement('textarea'); out.readOnly = true; out.rows = 3; out.style.display = 'none';
  mk('รีเซ็ต', () => {
    for (const r of rows) { tune[r.name].value = defaults[r.name]; r.input.value = defaults[r.name]; r.val.textContent = fmt(defaults[r.name], r.step); }
    save(); if (onChange) onChange(null);
  });
  const copy = mk('คัดลอกค่า', async () => {
    const text = rows.map(r => `${r.name}: ${fmt(tune[r.name].value, r.step)}`).join(', ');
    out.value = text; out.style.display = 'block';
    try { await navigator.clipboard.writeText(text); copy.textContent = 'คัดลอกแล้ว'; } catch (e) { out.select(); copy.textContent = 'กดค้างที่ข้อความเพื่อคัดลอก'; }
    setTimeout(() => { copy.textContent = 'คัดลอกค่า'; }, 2500);
  });
  mk('ปิด', () => { panel.classList.remove('open'); });
  panel.append(bar, out);
  button.onclick = () => {
    const open = !panel.classList.contains('open');
    document.querySelectorAll('.tuner.open').forEach(p => p.classList.remove('open'));     // one panel at a time
    if (open) panel.classList.add('open');
  };
  // touches on the panel must not reach the game underneath (walking, camera)
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart', 'touchmove']) panel.addEventListener(ev, e => e.stopPropagation());
  return { rows };
}
