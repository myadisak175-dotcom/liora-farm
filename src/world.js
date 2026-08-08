// ทะเบียนโซนทั้งหมด + โซนที่กำลังอยู่
import { farm } from "./zones/farm.js";
import { village } from "./zones/village.js";
import { forest } from "./zones/forest.js";

export const ZONES = { farm, village, forest };
const LAYER = { g: "grass", d: "dirt", w: "water" };
let current = ZONES.farm;
const listeners = [];

export function currentZone() { return current; }
export function zoneSize(zone = current) { return { h: zone.tiles.length, w: zone.tiles[0].length }; }
export function setZone(id) {
  const next = ZONES[id];
  if (!next) throw new Error(`ไม่มีโซนชื่อ ${id}`);
  current = next;
  listeners.forEach((fn) => fn(current));
  return current;
}
export function onZoneChange(fn) { listeners.push(fn); }
export function layerAt(i, j) {
  const { h, w } = zoneSize();
  if (i < 0 || j < 0 || i >= h || j >= w) return current.outside;
  return LAYER[current.tiles[i][j]] ?? current.outside;
}
export function exitAt(i, j, zone = current) {
  return zone.exits.find((e) => {
    const [i0, j0, i1, j1] = e.rect;
    return i >= i0 && i <= i1 && j >= j0 && j <= j1;
  });
}
export function travel(exit) {
  setZone(exit.to);
  return { i: exit.spawn[0], j: exit.spawn[1] };
}
