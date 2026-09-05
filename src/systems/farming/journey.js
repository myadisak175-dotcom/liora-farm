import { CROP_STATES, SOIL_STATES } from "./states.js";

export const FIRST_BASKET_GOAL = 3;

// The existing, per-map crop save is the only source of progress. Reloading or
// visiting another map must not mint a second reward or reset someone's farm.
export function getFarmJourney({ cells = [], pouch = 0, growSeconds = 40, now = Date.now() } = {}) {
  const amount = Number(pouch);
  const harvested = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const progress = Math.min(FIRST_BASKET_GOAL, harvested);
  const result = { progress, goal: FIRST_BASKET_GOAL, complete: progress >= FIRST_BASKET_GOAL };
  if (result.complete) {
    return { ...result, phase: "complete", step: 4, hint: "ตะกร้าแรกเต็มแล้ว! ปลูกต่อหรือแต่งสวนได้เลย" };
  }
  if (cells.some((cell) => cell.state === CROP_STATES.RIPE)) {
    return { ...result, phase: "harvest", step: 3, hint: "ผักโตแล้ว เดินเข้าใกล้ช่องผักแล้วเก็บเกี่ยว" };
  }
  const growing = cells.filter((cell) => cell.state === CROP_STATES.GROWING);
  if (growing.length >= FIRST_BASKET_GOAL - progress || (growing.length && !cells.some((cell) => cell.state === CROP_STATES.EMPTY))) {
    const seconds = Math.max(1, Math.ceil(Math.min(...growing.map((cell) => {
      const elapsed = Math.max(0, (now - (Number(cell.plantedAt) || now)) / 1000);
      return Math.max(0, growSeconds - elapsed);
    }))));
    return { ...result, phase: "growing", step: 3, hint: `ผักชุดแรกพร้อมในประมาณ ${seconds} วิ · เดินชมสวนรอได้` };
  }
  if (cells.some((cell) => cell.state === CROP_STATES.EMPTY && cell.soilState === SOIL_STATES.WATERED)) {
    return { ...result, phase: "plant", step: 2, hint: "ดินชุ่มแล้ว เดินไปช่องนั้นแล้วหยอดเมล็ด" };
  }
  if (cells.some((cell) => cell.state === CROP_STATES.EMPTY && cell.soilState === SOIL_STATES.TILLED)) {
    return { ...result, phase: "water", step: 1, hint: "พรวนดินแล้ว รดน้ำให้ชุ่มก่อนปลูก" };
  }
  return { ...result, phase: "hoe", step: 0, hint: "เดินไปแปลงดิน แล้วพรวนช่องที่มีวงแสง" };
}
