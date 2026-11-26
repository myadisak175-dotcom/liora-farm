// path-edits.js  —  the ways painted by hand on a map (path-brush.js), as data: kept in this browser until they go into the map.
//
// One job: the brush's strokes and what they do to the ground. A stroke is a way (trodden earth, in the look the map's own
// ways have), paving (flat stones laid in that earth: a way whose middle is paved), grass (the ground grows over again: a way
// taken away, the map's own or one painted, and its stones with it, and a wood's floor painted by hand) or a wood's floor
// (🍂: earth, dry leaves and moss, the grass thinner there: forest-floor.js; the ways go over it). Strokes are kept in the
// order they were painted, because the last one painted on a spot is what it is: a way painted over grass shows, grass
// painted over a way hides it, a way painted over paving takes the stones up again (trodden earth), paving painted over a way
// lays them, grass painted over a wood's floor brings the meadow back.
//
//   const key = pathKey('hillvillage');
//   const ops = loadPathOps(key);                       [{ k: 'way' | 'pave', half, pts: [[x, z], ...] } | { k: 'grass' | 'forest', r, pts }]
//   const ops = settlePathOps(key, plan.pathOps, map)   the same, less those the map's tool has taken in (they are let go here)
//   savePathOps(key, ops)                               (an empty list: nothing kept)
//   const paint = foldPathOps(basePaint, ops, wayPaint) (x, z) -> [earth, sand, mow] or null: the map's own ways' paint, then each
//                                                       stroke over it in turn (wayPaint(op) -> that one way's own paint function;
//                                                       a paving stroke is a way to the ground: bare earth under its stones)
//   const pave = createPaveField(ops)                   pave.at(x, z) -> 0..1: how much of a spot is laid with stones, by the
//                                                       strokes in turn, less the gaps; pave.laid(x, z): by the strokes alone;
//                                                       pave.add(op) / pave.remove(op) as strokes come and go;
//                                                       pave.gaps([[x, z, r], ...]) -> boxes that changed: where a plant stands
//                                                       on the paving, its stones are gone (it grows out of the gap)
//   const floor = foldFloorOps(ops)                     (x, z) -> 0..1: how much of a spot is a wood's floor painted by hand, by
//                                                       the strokes in turn (null: none painted)
//   opBox(op) -> [x0, x1, z0, z1]                       where a stroke can reach
//   grassOver(op, x, z) -> 0..1                         how much a grass stroke covers that spot
//   floorOver(op, x, z) -> 0..1                         how much a wood's floor stroke covers that spot
//   isWay(op)                                           a stroke of earth (a way, or paving: a way with stones in it)

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
export const isWay = o => o.k === 'way' || o.k === 'pave';
const isRound = o => o.k === 'grass' || o.k === 'forest';                 // (a stroke as wide as its r: no way of its own)
export const okOp = o => o && (isWay(o) ? isFinite(o.half) : isRound(o) && isFinite(o.r)) && Array.isArray(o.pts) && o.pts.length >= 1 && o.pts.every(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
const r2 = v => Math.round(v * 100) / 100;
export const tidy = o => isWay(o) ? { k: o.k, half: r2(o.half), pts: o.pts.map(p => [r2(p[0]), r2(p[1])]) } : { k: o.k === 'forest' ? 'forest' : 'grass', r: r2(o.r), pts: o.pts.map(p => [r2(p[0]), r2(p[1])]) };

export function opBox(o) {
  const reach = isWay(o) ? o.half + 3.6 : o.r + 0.6;
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
export const floorOver = (o, x, z) => 1 - ss(o.r - 1.2, o.r + 0.2, toLine(o.pts, x, z));      // (soft: the land's paint gives the edge its rag)

// the strokes by squares of the land (4 m), each square's in the order they were painted: a point asks only the strokes whose
// reach takes in its square, in the same order as before (going through every stroke for every point of the ground picture
// was a good part of the time the map took to load)
const G = 4, sqKey = (i, j) => (i + 32768) * 65536 + (j + 32768);
const bySquares = list => {
  const squares = new Map();
  for (const e of list) {
    const [x0, x1, z0, z1] = e.box;
    for (let i = Math.floor(x0 / G); i <= Math.floor(x1 / G); i++) for (let j = Math.floor(z0 / G); j <= Math.floor(z1 / G); j++) {
      const k = sqKey(i, j); let a = squares.get(k);
      if (!a) squares.set(k, a = []);
      a.push(e);
    }
  }
  return (x, z) => squares.get(sqKey(Math.floor(x / G), Math.floor(z / G))) || [];
};

export function foldPathOps(basePaint, ops, wayPaint) {
  ops = ops.filter(o => o.k !== 'forest');                                 // (a wood's floor is not the ways' paint: forest-floor.js lays it)
  if (!ops.length) return basePaint;
  const near = bySquares(ops.map(o => ({ o, box: opBox(o), paint: isWay(o) ? wayPaint(o) : null })));
  return (x, z) => {
    const p = basePaint(x, z);
    let e = p ? p[0] : 0, s = p ? p[1] : 0, m = p ? p[2] : 0;
    for (const { o, box, paint } of near(x, z)) {
      if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) continue;
      if (paint) { const q = paint(x, z); if (q) { e = Math.max(e, q[0]); m = Math.max(m, q[2]); } }
      else { const f = grassOver(o, x, z); if (f > 0) { e *= 1 - f; m *= 1 - f; } }
    }
    return e > 0.001 || s > 0.001 || m > 0.001 ? [e, s, m] : null;
  };
}

// THE WOOD'S FLOOR painted by hand (🍂): how much of a spot is one, by the strokes in the order they were painted: a floor
// stroke lays it, grass painted over it takes it away again (ways and paving go over it as they are: the land draws them on
// top of it). Only the strokes from the first floor stroke on are asked; with none painted, nothing is
export function foldFloorOps(ops) {
  const first = ops.findIndex(o => o.k === 'forest');
  if (first < 0) return null;
  const near = bySquares(ops.slice(first).filter(isRound).map(o => ({ o, box: opBox(o) })));
  return (x, z) => {
    let f = 0;
    for (const { o, box } of near(x, z)) {
      if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) continue;
      if (o.k === 'forest') f = Math.max(f, floorOver(o, x, z));
      else if (f > 0) f *= 1 - grassOver(o, x, z);
    }
    return f;
  };
}

// PAVING: how much of a spot is laid with flat stones (0..1), by the strokes in the order they were painted. A paving stroke
// lays them over its width (a little less: the earth of its way shows round the stones, and the shader lets the last stones go
// one by one there, ground-paths.js); a way painted over them takes them up again, back to trodden earth; grass over them hides
// them with the way (a wood's floor painted over them leaves them be). Kept by squares of the land, as foldPathOps keeps its
// strokes, so a point asks only the strokes near it, in the order they were painted; with no paving stroke at all nothing is
// asked (the land's every point is asked once).
const paveCover = (o, x, z) => 1 - ss(o.half - Math.min(1.5, o.half * 0.9), o.half + 0.1, toLine(o.pts, x, z));      // (the edge a stone or two wide)
const earthCover = (o, x, z) => 1 - ss(o.half - 0.35, o.half + 0.35, toLine(o.pts, x, z));
const paveBox = o => {
  const reach = isWay(o) ? o.half + 0.5 : o.r + 0.6, xs = o.pts.map(p => p[0]), zs = o.pts.map(p => p[1]);
  return [Math.min(...xs) - reach, Math.max(...xs) + reach, Math.min(...zs) - reach, Math.max(...zs) + reach];
};
export function createPaveField(ops = []) {
  const squares = new Map(), list = [];
  let paving = 0;                                                          // how many paving strokes there are
  const enroll = (e, on) => {
    const [x0, x1, z0, z1] = e.box;
    for (let i = Math.floor(x0 / G); i <= Math.floor(x1 / G); i++) for (let j = Math.floor(z0 / G); j <= Math.floor(z1 / G); j++) {
      const k = sqKey(i, j); let a = squares.get(k);
      if (on) { if (!a) squares.set(k, a = []); a.push(e); } else if (a) { const p = a.lastIndexOf(e); if (p >= 0) a.splice(p, 1); }
    }
  };
  const add = o => { if (o.k === 'forest') return o; const e = { o, box: paveBox(o) }; list.push(e); enroll(e, true); if (o.k === 'pave') paving++; return o; };
  const remove = o => {
    let k = list.length - 1; while (k >= 0 && list[k].o !== o) k--;
    if (k < 0) return;
    enroll(list[k], false); list.splice(k, 1); if (o.k === 'pave') paving--;
  };
  for (const o of ops) add(o);
  // GAPS: where a plant stands on the paving (a tuft, a fern, a clump, a bush, a tree) its stones are gone, in a round as wide
  // as its foot (r), so it grows out of the earth between them. Kept by the same squares
  let gapList = [], gapSquares = new Map();
  const gapAt = (x, z) => {
    const here = gapSquares.get(sqKey(Math.floor(x / G), Math.floor(z / G)));
    if (!here) return 0;
    let g = 0;
    for (const [gx, gz, r] of here) { const d = Math.hypot(x - gx, z - gz); if (d < r) g = Math.max(g, 1 - ss(r * 0.55, r, d)); }
    return g;
  };
  const gaps = list => {
    const was = new Set(gapList.map(g => g.join())), now = new Set(list.map(g => g.join())), changed = [];
    for (const g of [...gapList.filter(g => !now.has(g.join())), ...list.filter(g => !was.has(g.join()))]) changed.push([g[0] - g[2], g[0] + g[2], g[1] - g[2], g[1] + g[2]]);
    gapList = list.map(g => g.slice()); gapSquares = new Map();
    for (const g of gapList) for (let i = Math.floor((g[0] - g[2]) / G); i <= Math.floor((g[0] + g[2]) / G); i++) for (let j = Math.floor((g[1] - g[2]) / G); j <= Math.floor((g[1] + g[2]) / G); j++) {
      const k = sqKey(i, j); let a = gapSquares.get(k);
      if (!a) gapSquares.set(k, a = []);
      a.push(g);
    }
    return changed;
  };
  const laid = (x, z) => {
    if (!paving) return 0;
    const here = squares.get(sqKey(Math.floor(x / G), Math.floor(z / G)));
    if (!here) return 0;
    let p = 0;
    for (const { o, box } of here) {
      if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) continue;
      if (o.k === 'pave') p = Math.max(p, paveCover(o, x, z));
      else if (p > 0) p *= 1 - (o.k === 'way' ? earthCover(o, x, z) : grassOver(o, x, z));
    }
    return p;
  };
  const at = (x, z) => { const p = laid(x, z); return p > 0 && gapList.length ? p * (1 - gapAt(x, z)) : p; };
  return { at, laid, add, remove, gaps, get paving() { return paving; }, box: paveBox };
}
