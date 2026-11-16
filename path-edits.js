// path-edits.js  —  the ways painted by hand on a map (path-brush.js), as data: kept in this browser until they go into the map.
//
// One job: the brush's strokes and what they do to the ground. A stroke is either a way (trodden earth, in the look the map's own
// ways have) or grass (the ground grows over again: a way taken away, the map's own or one painted). Strokes are kept in the
// order they were painted, because a way painted over grass shows, and grass painted over a way hides it.
//
//   const key = pathKey('hillvillage');
//   const ops = loadPathOps(key);                       [{ k: 'way', half, pts: [[x, z], ...] } | { k: 'grass', r, pts }]
//   const ops = settlePathOps(key, plan.pathOps, map)   the same, less those the map's tool has taken in (they are let go here)
//   savePathOps(key, ops)                               (an empty list: nothing kept)
//   const paint = foldPathOps(basePaint, ops, wayPaint) (x, z) -> [earth, sand, mow] or null: the map's own ways' paint, then each
//                                                       stroke over it in turn (wayPaint(op) -> that one way's own paint function)
//   opBox(op) -> [x0, x1, z0, z1]                       where a stroke can reach
//   grassOver(op, x, z) -> 0..1                         how much a grass stroke covers that spot

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const pathKey = map => 'liora.pathEdits.' + map;

export function loadPathOps(key) {
  try { const s = localStorage.getItem(key); const o = s ? JSON.parse(s) : null; return o && Array.isArray(o.ops) ? o.ops.filter(okOp) : []; } catch { return []; }
}
// The strokes sent to Claude go into the map (hill-village-paths.json: the plan's pathOps, in the order they were painted). Once
// the map has them they are let go from this browser, from the first kept stroke on, as long as each is one the map has: else
// the map would draw them and then this browser again. What was painted after them stays kept (and is what ⋯ gives next time).
export function settlePathOps(key, mapOps = [], map = '') {
  const kept = loadPathOps(key);
  if (!kept.length || !mapOps || !mapOps.length) return kept;
  const inMap = new Map();
  for (const o of mapOps) if (okOp(o)) { const s = JSON.stringify(tidy(o)); inMap.set(s, (inMap.get(s) || 0) + 1); }
  let n = 0;
  for (; n < kept.length; n++) { const s = JSON.stringify(tidy(kept[n])), c = inMap.get(s); if (!c) break; inMap.set(s, c - 1); }
  if (!n) return kept;
  const rest = kept.slice(n);
  try { savePathOps(key, rest, map); } catch { /* used as it is this once */ }
  return rest;
}
export function savePathOps(key, ops, map = '') {
  if (ops.length) localStorage.setItem(key, JSON.stringify({ map, v: 1, ops: ops.map(tidy) })); else localStorage.removeItem(key);
}
export const okOp = o => o && (o.k === 'way' || o.k === 'grass') && Array.isArray(o.pts) && o.pts.length >= 1 && o.pts.every(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
const r2 = v => Math.round(v * 100) / 100;
export const tidy = o => o.k === 'way' ? { k: 'way', half: r2(o.half), pts: o.pts.map(p => [r2(p[0]), r2(p[1])]) } : { k: 'grass', r: r2(o.r), pts: o.pts.map(p => [r2(p[0]), r2(p[1])]) };

export function opBox(o) {
  const reach = o.k === 'way' ? o.half + 3.6 : o.r + 0.6;
  const xs = o.pts.map(p => p[0]), zs = o.pts.map(p => p[1]);
  return [Math.min(...xs) - reach, Math.max(...xs) + reach, Math.min(...zs) - reach, Math.max(...zs) + reach];
}
const toLine = (pts, x, z) => {                                            // how far a spot is from a stroke's line
  if (pts.length === 1) return Math.hypot(x - pts[0][0], z - pts[0][1]);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, L = bx * bx + bz * bz || 1e-9;
    const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / L));
    best = Math.min(best, Math.hypot(x - ax - bx * t, z - az - bz * t));
  }
  return best;
};
export const grassOver = (o, x, z) => 1 - ss(o.r - 0.35, o.r + 0.45, toLine(o.pts, x, z));

export function foldPathOps(basePaint, ops, wayPaint) {
  if (!ops.length) return basePaint;
  const list = ops.map(o => ({ o, box: opBox(o), paint: o.k === 'way' ? wayPaint(o) : null }));
  // the strokes by squares of the land (4 m), each square's in the order they were painted: a point asks only the strokes
  // whose reach takes in its square, in the same order as before (going through every stroke for every point of the ground
  // picture was a good part of the time the map took to load)
  const G = 4, squares = new Map(), key = (i, j) => (i + 32768) * 65536 + (j + 32768);
  for (const e of list) {
    const [x0, x1, z0, z1] = e.box;
    for (let i = Math.floor(x0 / G); i <= Math.floor(x1 / G); i++) for (let j = Math.floor(z0 / G); j <= Math.floor(z1 / G); j++) {
      const k = key(i, j); let a = squares.get(k);
      if (!a) squares.set(k, a = []);
      a.push(e);
    }
  }
  return (x, z) => {
    const p = basePaint(x, z);
    let e = p ? p[0] : 0, s = p ? p[1] : 0, m = p ? p[2] : 0;
    const here = squares.get(key(Math.floor(x / G), Math.floor(z / G))) || [];
    for (const { o, box, paint } of here) {
      if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) continue;
      if (paint) { const q = paint(x, z); if (q) { e = Math.max(e, q[0]); m = Math.max(m, q[2]); } }
      else { const f = grassOver(o, x, z); if (f > 0) { e *= 1 - f; m *= 1 - f; } }
    }
    return e > 0.001 || s > 0.001 || m > 0.001 ? [e, s, m] : null;
  };
}
