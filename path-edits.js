// path-edits.js  —  the ways painted by hand on a map (path-brush.js), as data: kept in this browser until they go into the map.
//
// One job: the brush's strokes and what they do to the ground. A stroke is either a way (trodden earth, in the look the map's own
// ways have) or grass (the ground grows over again: a way taken away, the map's own or one painted). Strokes are kept in the
// order they were painted, because a way painted over grass shows, and grass painted over a way hides it.
//
//   const key = pathKey('hillvillage');
//   const ops = loadPathOps(key);                       [{ k: 'way', half, pts: [[x, z], ...] } | { k: 'grass', r, pts }]
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
  return (x, z) => {
    const p = basePaint(x, z);
    let e = p ? p[0] : 0, s = p ? p[1] : 0, m = p ? p[2] : 0;
    for (const { o, box, paint } of list) {
      if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) continue;
      if (paint) { const q = paint(x, z); if (q) { e = Math.max(e, q[0]); m = Math.max(m, q[2]); } }
      else { const f = grassOver(o, x, z); if (f > 0) { e *= 1 - f; m *= 1 - f; } }
    }
    return e > 0.001 || s > 0.001 || m > 0.001 ? [e, s, m] : null;
  };
}
