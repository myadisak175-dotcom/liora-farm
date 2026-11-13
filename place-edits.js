// place-edits.js  —  the things moved by hand on a map (place-editor.js), kept in this browser until they go into the map's tool.
//
// One job: the moves themselves, as data. Which things of a plan may be moved (the houses and what else is built, the small
// things: benches, lamps, stalls, ...), the moves read back onto a plan as it loads, and the moves as text to send to Claude
// (who puts them in assets/heightmaps/hill-village-moves.json, where the map's tool reads them: the ground is then levelled
// under a moved house and the map's picture drawn again). Nothing here draws anything.
//
//   const key = placeKey('hillvillage');
//   const base = placeables(plan);               // what may be moved, where the plan has it  [{ id, kind, name, x, z, yaw, turn }]
//   const report = applyPlaceEdits(plan, key);   // the moves kept in this browser, put onto the plan (before anything is built)
//                                                // { moves, used, applied, baked, stale }: used = the moves put (by the plan's ids),
//                                                // baked = already in the map, stale = the
//                                                // thing is no longer where the move found it (the map changed): both skipped
//   movesOf(base, items) -> [{ id, from: [x, z, yaw], to: [x, z, yaw] }]   only what differs from the plan
//   itemsFrom(base, moves) -> items               the moves laid on the plan's things (for text pasted back in)
//
// A thing's id: a building's own id (the plan names them); a small thing's kind and where the plan put it ('bench@-31.2,40.8'),
// so a move still finds it when the tool writes the plan again with the things in another order.

export const placeKey = map => 'liora.placeEdits.' + map;

const BUILDING_NAME = {
  castle_keep: 'หอปราสาท', castle_hall: 'ตึกปราสาท', manor: 'คฤหาสน์', barn: 'โรงนา', stable_shed: 'เพิงคอกสัตว์',
  mill_tower: 'กังหันลม', mill_house: 'บ้านข้างกังหัน', watermill: 'โรงสีน้ำ', ledge_house: 'บ้านริมผา',
  fountain: 'บ่อน้ำกลางตลาด', great_tree: 'ต้นไม้ใหญ่',
};
const PROP_NAME = {
  bench: 'ม้านั่ง', signpost: 'ป้ายบอกทาง', stall: 'แผงตลาด', barrels: 'ถังไม้', lamp: 'โคมไฟ', sheep: 'แกะ', hay: 'กองฟาง',
  crates: 'ลังไม้', woodpile: 'กองฟืน', table: 'โต๊ะ', cart: 'รถเข็น', 'kit:Prop_Wagon': 'เกวียน',
};
const nameOf = id => BUILDING_NAME[id]
  || (id.startsWith('village_house_') ? 'บ้านในหมู่บ้าน ' + id.slice(14) : id.startsWith('cottage_upper_') ? 'บ้านบนเนิน ' + id.slice(14) : id);
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const propId = (kind, x, z) => kind + '@' + x.toFixed(1) + ',' + z.toFixed(1);
const near = (a, b, d = 0.06) => Math.abs(a[0] - b[0]) < d && Math.abs(a[1] - b[1]) < d && Math.abs(turnGap(a[2], b[2])) < 0.01;
const turnGap = (a, b) => { const d = (a - b) % (2 * Math.PI); return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d; };

// what may be moved, where the plan has it. (The windmill's sails are not one: they go with the mill's tower.)
export function placeables(P) {
  const out = [];
  for (const b of P.buildings) {
    if (b.kind === 'sails') continue;
    out.push({ id: b.id, kind: b.kind, name: nameOf(b.id), x: b.x, z: b.z, yaw: b.yaw || 0, turn: b.kind !== 'tree' });
  }
  for (const p of P.props) out.push({ id: propId(p[0], p[1], p[2]), kind: 'prop', prop: p[0], name: PROP_NAME[p[0]] || p[0], x: p[1], z: p[2], yaw: p[3] || 0, turn: true });
  return out;
}

// the moves kept in this browser, put onto the plan. A move is put only where its thing still stands where the move found it
export function applyPlaceEdits(P, key) {
  let moves = [];
  try { const s = localStorage.getItem(key); if (s) moves = JSON.parse(s).moves || []; } catch { moves = []; }
  const report = { moves, used: [], applied: 0, baked: 0, stale: 0 };
  if (!moves.length) return report;
  const byId = new Map(placeables(P).map(t => [t.id, t]));
  for (const m of moves) {
    const t = byId.get(m.id) || findProp(P, m);
    if (!t) { report.stale++; continue; }
    const at = [t.x, t.z, t.yaw];
    if (near(at, m.to)) { report.baked++; continue; }                     // the map's tool has it there already
    if (!near(at, m.from)) { report.stale++; continue; }                  // the map has moved it since: the move is out of date
    setOnPlan(P, t, m.to); report.applied++; report.used.push({ ...m, id: t.id });
  }
  return report;
}
const findProp = (P, m) => {                                              // a small thing the tool wrote again a little off: the nearest of its kind
  const kind = m.id.split('@')[0]; let best = null, bd = 0.3;
  for (const t of placeables(P)) if (t.kind === 'prop' && t.prop === kind) { const d = Math.hypot(t.x - m.from[0], t.z - m.from[1]); if (d < bd) { bd = d; best = t; } }
  return best;
};
function setOnPlan(P, t, [x, z, yaw]) {
  if (t.kind === 'prop') {
    const p = P.props.find(q => propId(q[0], q[1], q[2]) === t.id || (q[0] === t.prop && Math.abs(q[1] - t.x) < 1e-6 && Math.abs(q[2] - t.z) < 1e-6));
    if (p) { p[1] = x; p[2] = z; p[3] = yaw; }
    return;
  }
  const b = P.buildings.find(q => q.id === t.id);
  if (!b) return;
  if (b.id === 'mill_tower') {                                           // the windmill's sails go with its tower: the same move, the same turn
    const s = P.buildings.find(q => q.kind === 'sails');
    if (s) {
      const d = yaw - b.yaw, c = Math.cos(d), sn = Math.sin(d), ox = s.x - b.x, oz = s.z - b.z;
      s.x = x + ox * c + oz * sn; s.z = z - ox * sn + oz * c; s.yaw = (s.yaw || 0) + d;
    }
  }
  b.x = x; b.z = z; if (t.turn) b.yaw = yaw;
}

// only what differs from the plan
export function movesOf(base, items) {
  const byId = new Map(base.map(t => [t.id, t])), out = [];
  for (const it of items) {
    const b = byId.get(it.id);
    if (!b) continue;
    const from = [r2(b.x), r2(b.z), r3(b.yaw)], to = [r2(it.x), r2(it.z), r3(it.yaw)];
    if (!near(from, to, 0.01)) out.push({ id: it.id, name: it.name, from, to });
  }
  return out;
}

export function itemsFrom(base, moves) {
  const byId = new Map(moves.map(m => [m.id, m]));
  return base.map(t => { const m = byId.get(t.id); return m ? { ...t, x: m.to[0], z: m.to[1], yaw: m.to[2] } : { ...t }; });
}
