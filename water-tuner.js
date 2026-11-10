// water-tuner.js
// Which sliders the water gets (WATER_TUNE in stylized-water.js), plus the mirror-quality switch.
// The panel itself lives in tuner-panel.js.
//
//   createWaterTuner({ tune: WATER_TUNE, optics: level.optics, button: document.getElementById('tune'), panel: document.getElementById('tuner') });
import { createTunerPanel } from './tuner-panel.js';

const CONTROLS = [
  ['ลายแสงใต้น้ำ'],
  ['caustic', 'ความสว่าง', 0, 0.6, 0.01],
  ['causticScale', 'ขนาดลาย (มาก = ลายเล็ก)', 0.4, 2.5, 0.05],
  ['ความพริ้วและการไหล (ทุกอย่างไหลตามน้ำทางเดียวกัน)'],
  ['swell', 'คลื่นผิวน้ำ', 0, 2.5, 0.05],
  ['shimmer', 'ระยิบละเอียด', 0, 0.3, 0.005],
  ['speed', 'ความเร็วน้ำไหล', 0.2, 3, 0.05],
  ['fleck', 'ริ้วฟองที่ไหลตามน้ำ', 0, 1.5, 0.05],
  ['dynamic (แตะน้ำ / ลุยน้ำ)'],
  ['ripple', 'แรงกระเพื่อม', 0, 2, 0.05],
  ['simSpeed', 'ความเร็ววงคลื่น', 0.5, 3, 0.05],
  ['calm', 'คลื่นค้างนานแค่ไหน', 0.95, 0.998, 0.001],
  ['มองทะลุและเงาสะท้อน'],
  ['refract', 'ภาพใต้น้ำบิดแค่ไหน', 0, 2.5, 0.05],
  ['reflect', 'เงาสะท้อนชัดแค่ไหน', 0, 1, 0.01],
  ['clear', 'ความใส (มาก = เห็นก้นลึกขึ้น)', 0.4, 3, 0.05],
  ['คลื่นเข้าฝั่งและฟองน้ำ'],
  ['shore', 'แรงคลื่นซัดฝั่ง', 0, 2, 0.05],
  ['foamLife', 'ฟองสลายภายใน (วินาที)', 0.5, 10, 0.25],
  ['ฟองและประกาย'],
  ['foam', 'ฟองริมฝั่ง', 0, 2, 0.05],
  ['glint', 'ประกายระยิบ', 0, 2, 0.05],
];
const KEY = 'meadow.water.tune.v1';

export function createWaterTuner({ tune, button, panel, optics = null }) {
  // mirror quality: the one setting that costs real speed
  const head = optics && (el => {
    const h = document.createElement('h4'); h.textContent = 'เงาสะท้อนบนผิวน้ำ (กินแรงเครื่องมากที่สุด)'; el.appendChild(h);
    const seg = document.createElement('div'); seg.className = 'bar';
    const btns = [['ปิด', 0], ['ประหยัด', 1], ['เต็ม', 2]].map(([text, q]) => {
      const b = document.createElement('button'); b.textContent = text;
      b.onclick = () => { optics.setQuality(q); try { localStorage.setItem(KEY + '.mirror', q); } catch (e) { /* not remembered */ } paint(); };
      seg.appendChild(b); return [b, q];
    });
    const paint = () => btns.forEach(([b, q]) => { b.style.opacity = optics.quality === q ? 1 : 0.45; });
    try { const q = localStorage.getItem(KEY + '.mirror'); if (q !== null) optics.setQuality(+q); } catch (e) { /* nothing saved */ }
    el.appendChild(seg);
    paint();
    el.repaintMirror = paint;
  });
  return createTunerPanel({ tune, controls: CONTROLS, key: KEY, button, panel, head });
}
