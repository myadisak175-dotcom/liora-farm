// sky-tuner.js
// Which sliders the sky gets (SKY_TUNE in volumetric-sky.js). The panel itself lives in tuner-panel.js.
// The clouds are a baked picture, so cloud sliders show their effect a moment later: while a slider moves the sky
// is asked to redraw that picture as fast as it can (sky.userData.hurry).
//
//   createSkyTuner({ sky, button: document.getElementById('skyBtn'), panel: document.getElementById('skyTuner') });
import { createTunerPanel } from './tuner-panel.js';

const CONTROLS = [
  ['ก้อนเมฆ (เห็นผลหลังเลื่อนราวครึ่งวินาที)'],
  ['cover', 'ปริมาณเมฆ', 0, 1, 0.01],
  ['tall', 'ความสูงของก้อนเมฆ', 0.4, 1.15, 0.01],
  ['density', 'ความทึบ (น้อย = ขอบฟุ้ง)', 0.3, 2.5, 0.05],
  ['cirrus', 'เมฆริ้วชั้นสูง', 0, 1.5, 0.05],
  ['speed', 'ความเร็วลม', 0, 6, 0.1],
  ['แสงและสี (เห็นผลทันที)'],
  ['shade', 'ความเข้มของเงาในก้อนเมฆ', 0, 1.8, 0.05],
  ['blue', 'ความเข้มของสีฟ้า', 0.4, 1.4, 0.02],
  ['haze', 'หมอกขอบฟ้า (มาก = เมฆไกลจางเร็ว)', 0.2, 3, 0.05],
  ['glow', 'แสงฟุ้งรอบดวงอาทิตย์', 0, 2.5, 0.05],
  ['เงาเมฆบนพื้น (เมฆมาก = เงามาก, ไหลตามลม)'],
  ['shadow', 'ความเข้มของเงา', 0, 1, 0.02],
  ['shadowSize', 'ขนาดผืนเงา (เมตร)', 120, 900, 10],
];
const KEY = 'meadow.sky.tune.v1';

export function createSkyTuner({ sky, button, panel }) {
  const hurry = () => sky.userData.hurry(2.5);
  const made = createTunerPanel({ tune: sky.userData.tune, controls: CONTROLS, key: KEY, button, panel, onChange: hurry });
  hurry();                                           // values remembered from last time: show them straight away
  return made;
}
