// foliage-edits.js  —  a map's plants as arranged by hand (foliage-editor.js), kept in this browser until they go into the map's tool.
//
// One job: the arrangement itself, as data. A map's foliage is three lists of rows in its plan (what each row holds: the map's
// level says, hill-village-level.js):
//   plants   trees, bushes and beds of flowers        clumps   flowering clumps        cover   ferns and tall tufts of grass
// Arranged by hand, all three are kept here whole, and laid over the plan as it loads: while this browser has them they are the
// map's foliage, all of it. To make them the map's for everyone the editor gives what changed as text (rows taken out, changed
// and added, by where they stood in the map's own lists) to send to Claude, who puts it beside the plan
// (assets/heightmaps/hill-village-foliage-edits.json) where the map's tool lays it over the foliage it keeps. Once the map comes
// back with the same foliage as this browser's, the browser's copy is let go. Nothing here draws anything.
//
//   const key = foliageKey('hillvillage');
//   const report = applyFoliage(plan, key);     // before anything is built. { own, stamp, base, src, used, baked, stale }:
//                                               //   own    the map's own three lists, as the plan had them
//                                               //   used   this browser's lists were laid over the plan
//                                               //   baked  this browser's were the same as the map's own: let go
//                                               //   stale  this browser's were made on an earlier foliage of the map's:
//                                               //          not laid over (the map's own are used); they are in kept
//                                               //          (made on the foliage stamped keptBase), to send
//                                               //   src    for each row now, which of the map's own it was (-1: a new one)
//                                               // An arrangement made on the foliage just before the map's (plan.foliageWas: when
//                                               // the map's only had plants taken out, or put in) has the same taken out and put
//                                               // in, and stands.
//   keepFoliage(key, base, lists, src)          // keep these lists (made on the map's foliage with the stamp `base`)
//   dropFoliage(key)                            // back to the map's own
//   foliageEdits(map, report, lists, src)       // what changed, to send: { map, v, base, plants: { set, del, add }, ... }, or
//                                               // every row ({ full, plants: { all }, ... }) when src is null
//   foliageFromEdits(own, edits)                // the lists that text gives, laid over the map's own: { lists, src } (null: not ours)

export const foliageKey = map => `liora.foliage.${map}`;
export const FOLIAGE_LISTS = ['plants', 'clumps', 'cover'];
const copy = rows => (rows || []).map(r => r.slice());
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function applyFoliage(plan, key) {
  const own = {};
  for (const n of FOLIAGE_LISTS) own[n] = copy(plan[n]);
  const report = { own, stamp: plan.foliage || 0, base: plan.foliage || 0, src: null, used: false, baked: false, stale: false };
  for (const n of FOLIAGE_LISTS) (report.src = report.src || {})[n] = own[n].map((_, i) => i);
  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* nothing kept, or nowhere to keep it */ }
  if (!kept || kept.v !== 1 || !Array.isArray(kept.plants)) return report;
  if (plan.foliageWas && kept.base === plan.foliageWas.base) {             // made on the foliage just before this one, which differs only by what was taken out: the same taken out here, and it stands as before
    kept = carriedOver(kept, plan.foliageWas, report.stamp, own);
    try { localStorage.setItem(key, JSON.stringify(kept)); } catch { /* used this once all the same */ }
  }
  if (FOLIAGE_LISTS.every(n => same(kept[n] || [], own[n]))) {              // the map has caught up with what was arranged here
    try { localStorage.removeItem(key); } catch { /* no matter */ }
    report.baked = true; return report;
  }
  if (kept.base !== report.stamp) {                                        // made on an earlier foliage: the map's own stand (its trees may have been grown since), this browser's are kept to send
    report.stale = true; report.keptBase = kept.base; report.kept = {};
    for (const n of FOLIAGE_LISTS) report.kept[n] = copy(kept[n]);
    return report;
  }
  for (const n of FOLIAGE_LISTS) plan[n] = copy(kept[n]);
  report.used = true; report.base = kept.base;
  report.src = kept.src || null;
  return report;
}

// An arrangement made on the map's foliage before some plants were taken out of it (plan.foliageWas: the stamp of that
// foliage; gone: for each list, which of its rows went, by where they stood, or 'all'; kinds: which kinds go from this
// browser's rows too, the ones added here included, or 'all'; add: for each list, which of the map's own rows now are the
// ones put in, by where they stand): those rows out, the rest as arranged, the ones put in added, now on the stamp `base`.
function carriedOver(kept, was, base, own) {
  const out = { v: 1, base, src: kept.src ? {} : null };
  for (const n of FOLIAGE_LISTS) {
    const gone = was.gone && was.gone[n], kinds = was.kinds && was.kinds[n], rows = kept[n] || [], src = kept.src && kept.src[n];
    const goneSet = new Set(Array.isArray(gone) ? gone : []);
    const shift = j => { let k = 0; for (const g of goneSet) if (g < j) k++; return j - k; };      // where a row of the old foliage stands in the new
    const keep = rows.map((row, i) => !(gone === 'all' || kinds === 'all' || (Array.isArray(kinds) && kinds.includes(row[0])) || (src && src[i] >= 0 && goneSet.has(src[i]))));
    out[n] = rows.filter((_, i) => keep[i]);
    if (out.src) out.src[n] = src ? src.filter((_, i) => keep[i]).map(j => (j >= 0 ? shift(j) : j)) : out[n].map(() => -1);
    for (const j of (was.add && was.add[n]) || []) if (own[n][j]) { out[n].push(own[n][j].slice()); if (out.src) out.src[n].push(j); }
  }
  return out;
}

export function keepFoliage(key, base, lists, src) {
  const out = { v: 1, base, src };
  for (const n of FOLIAGE_LISTS) out[n] = lists[n];
  localStorage.setItem(key, JSON.stringify(out));
}
export function dropFoliage(key) { localStorage.removeItem(key); }

export function foliageEdits(map, report, lists, src) {
  const out = { map, v: 1, base: report.base };
  if (!src) { out.full = true; for (const n of FOLIAGE_LISTS) out[n] = { all: lists[n] }; return out; }
  for (const n of FOLIAGE_LISTS) {
    const seen = new Set(), set = [], add = [];
    lists[n].forEach((row, i) => {
      const j = src[n][i];
      if (j == null || j < 0) add.push(row); else { seen.add(j); if (!same(row, report.own[n][j])) set.push([j, row]); }
    });
    const del = report.own[n].map((_, j) => j).filter(j => !seen.has(j));
    if (set.length || del.length || add.length) out[n] = { set, del, add };
  }
  return out;
}

export function foliageFromEdits(own, ed) {
  if (!ed || ed.v !== 1 || !FOLIAGE_LISTS.some(n => ed[n]) && !('base' in ed)) return null;
  const lists = {}, src = {};
  for (const n of FOLIAGE_LISTS) {
    const e = ed[n] || {};
    if (Array.isArray(e.all)) { lists[n] = copy(e.all); src[n] = e.all.map(() => -1); continue; }
    const rows = copy(own[n]), gone = new Set(e.del || []);
    for (const [j, row] of e.set || []) if (j >= 0 && j < rows.length) rows[j] = row.slice();
    lists[n] = [...rows.filter((_, j) => !gone.has(j)), ...copy(e.add)];
    src[n] = [...rows.map((_, j) => j).filter(j => !gone.has(j)), ...(e.add || []).map(() => -1)];
  }
  return { lists, src: ed.full ? null : src };
}
