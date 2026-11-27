// The lake's fishing loop. Drive it with press(), release() and update(dt) from any scene.
import { CAST_TIME, LAND_TIME } from './fishing-motion.js?v=2';

export const FISH = [
  { id: 'silver', name: 'ปลาซิวเงิน', color: '#729a9c', fin: '#9ca088', belly: '#e9e5c2', pattern: 'stripe', min: 10, max: 22, weight: 32, strength: .82 },
  { id: 'perch', name: 'ปลาคอนใบหลิว', color: '#7f9e5d', fin: '#d7884f', belly: '#e6d6a0', pattern: 'bars', min: 18, max: 33, weight: 27, strength: 1 },
  { id: 'trout', name: 'ปลาเทราต์สายรุ้ง', color: '#69998a', fin: '#9d8974', belly: '#ead6b0', pattern: 'rainbow', min: 25, max: 49, weight: 22, strength: 1.15 },
  { id: 'carp', name: 'ปลาคาร์ปอำพัน', color: '#d39746', fin: '#bc673e', belly: '#f6d593', pattern: 'scales', min: 30, max: 68, weight: 14, strength: 1.32 },
  { id: 'moon', name: 'ปลาจันทร์คราม', color: '#7796bc', fin: '#9d9cc7', belly: '#ebe0ca', pattern: 'stars', min: 38, max: 75, weight: 5, strength: 1.45 }
];

export function createFishing({ random = Math.random, onChange = () => {}, onCatch = () => {} } = {}) {
  const state = { phase: 'ready', age: 0, progress: 0, tension: 0, holding: false, running: false, fish: null, length: 0, reason: '' };
  let waitTime = 0;
  function enter(phase) {
    state.phase = phase;
    state.age = 0;
    state.holding = false;
    state.running = false;
    onChange(state);
  }
  function chooseFish() {
    let roll = random() * FISH.reduce((total, fish) => total + fish.weight, 0);
    return FISH.find(fish => (roll -= fish.weight) < 0) || FISH.at(-1);
  }
  function miss(reason) {
    state.reason = reason;
    enter('missed');
  }
  function press() {
    switch (state.phase) {
      case 'ready': case 'caught': case 'missed':
        state.fish = chooseFish();
        state.length = Math.round(state.fish.min + (state.fish.max - state.fish.min) * random());
        state.progress = 0;
        state.tension = 0;
        state.reason = '';
        waitTime = 1.8 + random() * 2.7;
        enter('cast');
        break;
      case 'bite':
        state.progress = .10;
        state.tension = .18;
        enter('reel');
        state.holding = true;
        break;
      case 'reel': state.holding = true; break;
    }
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .1);
    state.age += dt;
    switch (state.phase) {
      case 'cast': if (state.age >= CAST_TIME) enter('wait'); break;
      case 'wait': if (state.age >= waitTime) enter('bite'); break;
      case 'bite': if (state.age >= 2.4) miss('ปลาคายเหยื่อแล้ว'); break;
      case 'reel': {
        state.running = state.age % 3.1 > 1.45;
        const strength = state.fish.strength;
        const strain = state.running ? .58 * strength : .09 * strength;
        state.tension = Math.max(0, Math.min(1, state.tension + dt * (state.holding ? strain : -.57)));
        const pull = state.running ? .095 : .32;
        state.progress = Math.max(.025, Math.min(1, state.progress + dt * (state.holding ? pull / strength : -.026)));
        if (state.tension >= 1) miss('สายเบ็ดขาด');
        else if (state.progress >= 1) {
          enter('land');
        } else if (state.age >= 40) miss('ปลาสะบัดหลุดจากเบ็ด');
        break;
      }
      case 'land':
        if (state.age >= LAND_TIME) {
          const record = { id: state.fish.id, length: state.length };
          enter('caught');
          onCatch(record);
        }
        break;
    }
  }
  return {
    state, press, update,
    release() { state.holding = false; },
    retrieve() { if (state.phase === 'wait' || state.phase === 'bite') enter('ready'); }
  };
}
