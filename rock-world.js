// rock-world.js  —  the rocks of a level, and all that they do in it
//
// One job: a level hands over the rocks it lays out and what it knows of its land; this puts the rocks in the world, the same
// way on every map:
//   - drawn with the kit (rocks.js: instancing, LOD), in the one stone
//   - placed by hand where they have been (the rock editor, rock-editor.js): kept in the browser, or in a layout file for
//     everyone, laid over what the code put down (?edits=off: the code's own layout)
//   - each rock's footprint on the land, in one-metre cells: where it stands out of the ground it is in her way (colliders),
//     no grass grows, the grass round it is pressed down, the ground under it is shaded, it throws a shadow with the sun, tall
//     ones keep the camera out
//   - where she can stand on them: the tops of the rocks, worked out from their real shapes on a half-metre grid; a top she
//     reaches from the land (or another top) by a step of no more than half a metre, with no drop round it bigger than that,
//     is ground she walks on (standAt), not a wall
//   - the meadow's own grass on the flat tops of the mossy ones (a picture of the land's height with those tops raised into it,
//     for the follow-grass; grass grown there on the ground map; the rocks' paint under it)
//   - cliff pieces fitted to the edge they stand at (fitToEdge): foot in the ground below, head level with the edge, stretched
//     to span the face whatever their size; refitted in the editor whenever moved, turned or sized
//
//   const rw = createRockWorld({ group, list, heightAt, walkLand, waterDepthAt, waterLevelAt, key, committed });
//   colliders.push(...rw.colliders) (and shade, bare, press, casters, cameraTrunks), before the level's own (trees)
//   createGroundMap({ ..., lawn: true, grow: rw.grow }); rw.useLawn(map); createFollowGrass({ field: rw.grassField(field) })
//   level: { standAt: rw.standAt, rockEdit: rw.edit, ... }; walkable: rw.onRockTop(x, z) || (land && !rw.inRock(x, z))
//   each frame: rw.update(renderer, camera, { terrain, size })

import * as THREE from 'three';
import * as RK from './rocks.js';

const DEG = Math.PI / 180, SG = 0.5;                                       // the grid she stands on: half a metre
const key2 = (i, j) => i + ',' + j;
const PROP_KEYS = new Set(RK.PROP_ROCK_TYPES.map(t => t.key));

// ---- a piece fitted to the edge it stands at: its face looks out over a drop; its foot is sunk into the land below, its head
// (the top of its front: rocks.js, rockFrontTop) lies `head` under the top of the land behind it, and it is stretched up or down
// to span the drop; nothing of it stands up out of the land behind (where a part of it lies under the land up there, it stays
// under the grass). A piece much taller than the drop is not squashed flat: it keeps at least `least` of its height and is sunk
// deeper. The edge: the top of the rise behind its front (not the next block up, further back). Along its width, only where there is a drop counts (a piece on a corner, its ends past the edge, is fitted to the
// part of the edge it stands at). foot: the height of the ground in front, where the map knows it (a ledge); otherwise it is
// looked for a little way out in front of the piece. false where there is no drop under its middle (and the piece is left as it was).
export function fitToEdge(it, H, { head = -0.06, least = 0.75, foot = null, skip = null } = {}) {
  if (skip && skip(it.x, it.z)) return false;
  const seed = it.seed || 1, geo = RK.propRockGeometry(it.type, seed), bb = geo.boundingBox, s = it.s || 1, a = (it.ry || 0) * DEG;
  const fx = Math.sin(a), fz = Math.cos(a), lx = Math.cos(a), lz = -Math.sin(a);      // where its face looks; along its width
  const mid = (bb.max.x + bb.min.x) / 2 * s, half = Math.max(0.5, (bb.max.x - bb.min.x) * s * 0.4), front = Math.max(0.5, bb.max.z * s), back = -bb.min.z * s;
  let edge = Infinity, low = Infinity, centre = false;
  for (let k = -2; k <= 2; k++) {                                          // (the lowest of the land behind, and of the land in front, along its width)
    const cx = it.x + lx * (mid + half * k / 2), cz = it.z + lz * (mid + half * k / 2);
    let up = -Infinity, prev = Infinity, rose = false, flat = 0;
    for (let t = front; t >= -back - 6; t -= 0.5) {                        // (back from its front to the top of the rise behind it, and no further)
      const h = H(cx + fx * t, cz + fz * t);
      if (h > prev + 0.15) { rose = true; flat = 0; } else if (rose && ++flat >= 4) break;
      up = Math.max(up, h); prev = h;
    }
    const lo = foot ?? H(cx + fx * (front + 2.5), cz + fz * (front + 2.5));
    if (up - lo < 1.5) continue;
    if (k === 0) centre = true;
    edge = Math.min(edge, up); low = Math.min(low, lo);
  }
  if (!centre) return false;
  const ft = RK.rockFrontTop(it.type, seed) * s, P = geo.attributes.position, ca = Math.cos(a), sa = Math.sin(a), over = [];
  for (let i = 0; i < P.count; i += 2) {                                   // (its points that lie over the land behind)
    const px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
    if (py <= 0) continue;
    const h = H(it.x + (px * ca + pz * sa) * s, it.z + (-px * sa + pz * ca) * s);
    if (h > edge - 0.1) over.push(py * s, h - 0.04);
  }
  let y = low - 0.6 * s, sy = (edge + head - y) / ft;
  for (let i = 0; i < over.length; i += 2) sy = Math.min(sy, (over[i + 1] - y) / over[i]);
  if (sy < least) {                                                        // too tall for this drop: sunk deeper instead
    sy = least; y = edge + head - ft * sy;
    for (let i = 0; i < over.length; i += 2) y = Math.min(y, over[i + 1] - over[i] * sy);
  }
  it.y = y; it.sy = Math.min(3, sy); it.fit = true;
  return true;
}

// stand: false for rocks no one can reach (in a pit): no rock tops to stand on, no grass on them (and none of the work of
// finding them). lod: < 1 for a map that can spare fewer triangles (the kit drops to its coarser versions sooner).
export function createRockWorld({ group, list, extra = [], heightAt: H, walkLand = () => false, waterDepthAt = () => 0, waterLevelAt = () => -1e4,
  key = null, committed = null, fit = null, tone = null, lod = 1, stand = true, onKit = null, seed = 1, types = null } = {}) {
  const refit = fit || (it => fitToEdge(it, H));                          // (a map that knows its cliffs better brings its own)

  // ---- placed by hand: a list of every rock, kept as height above the ground (so it stays put on the land)
  const r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;
  const toRow = it => [it.type, it.seed || 1, r2(it.x), r2(it.z), r2((it.y ?? 0) - H(it.x, it.z)), r1(it.ry || 0), r1(it.rx || 0), r1(it.rz || 0), Math.round((it.s || 1) * 1000) / 1000, Math.round((it.sy || 1) * 1000) / 1000, it.fit ? 1 : 0];
  const fromRow = ([type, sd, x, z, dy, ry, rx, rz, s, sy = 1, f = 0]) => ({ type, seed: sd, x, z, y: H(x, z) + dy, ry, rx, rz, s, sy, fit: !!f });
  const validLayout = d => !!(d && Array.isArray(d.rocks) && d.rocks.every(r => Array.isArray(r) && r.length >= 9 && r.length <= 11 && PROP_KEYS.has(r[0]) && r.slice(1).every(Number.isFinite)));
  const QS = new URLSearchParams(location.search), off = QS.get('edits') === 'off';
  const generated = list.map(it => ({ ...it }));
  const kept = validLayout(committed) ? committed : null;
  let local = null;
  if (key && !off) {
    try { local = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* none kept */ }
    if (!validLayout(local)) local = null;
  }
  const layout = off ? null : local || kept;
  let items = layout ? layout.rocks.map(fromRow) : list.slice();

  // ---- drawn
  const makeKit = l => {
    const kit = RK.createRockKit(l, { tone, lod });
    kit.name = 'rocks';
    if (onKit) onKit(kit);
    return kit;
  };
  let kit = makeKit([...items, ...extra]);
  group.add(kit);

  // ---- where she can stand on them
  const standTop = new Map(), standable = new Set(), grassTop = new Map();
  if (stand) {
    const top = new Map(), pts = RK.sampleKitSurface(kit, { step: 0.3, seed });
    for (let q = 0; q < pts.length; q += 4) { const k = key2(Math.floor(pts[q] / SG), Math.floor(pts[q + 2] / SG)); if (!(top.get(k) >= pts[q + 1])) top.set(k, pts[q + 1]); }
    // a cell of rock: where a rock stands well out of the land, or covers land too steep to walk on (a cliff's face, at its brink):
    // its height, the rock's top (or the land's, if that is higher)
    const rockAt = (i, j) => {
      const t = top.get(key2(i, j)), x = (i + 0.5) * SG, z = (j + 0.5) * SG;
      if (t === undefined) return null;
      const h = H(x, z);
      return t > h + 0.35 || (t > h - 0.5 && !walkLand(x, z)) ? Math.max(t, h) : null;
    };
    const landOk = (i, j) => rockAt(i, j) === null && walkLand((i + 0.5) * SG, (j + 0.5) * SG);
    const landH = (i, j) => H((i + 0.5) * SG, (j + 0.5) * SG);
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const inner = (i, j, t) => N4.every(([a, b]) => { const r = rockAt(i + a, j + b); return r !== null ? Math.abs(r - t) <= 0.6 : landOk(i + a, j + b) && Math.abs(landH(i + a, j + b) - t) <= 0.6; });
    const queue = [], cand = new Map();
    for (const k of top.keys()) {
      const [i, j] = k.split(',').map(Number), t = rockAt(i, j);
      if (t === null || !inner(i, j, t)) continue;
      const x = (i + 0.5) * SG, z = (j + 0.5) * SG;
      if (waterDepthAt(x, z) > 0 && t < waterLevelAt(x, z) + 0.05) continue;     // (under the water)
      if (N4.some(([a, b]) => landOk(i + a, j + b) && Math.abs(landH(i + a, j + b) - t) <= 0.5)) { standable.add(k); queue.push([i, j]); }
      else cand.set(k, t);                                                   // (reached, if at all, from another rock top)
    }
    while (queue.length) {
      const [i, j] = queue.pop(), t = rockAt(i, j);
      for (const [a, b] of N4) {
        const k = key2(i + a, j + b);
        if (standable.has(k) || !cand.has(k)) continue;
        if (Math.abs(cand.get(k) - t) <= 0.5) { standable.add(k); queue.push([i + a, j + b]); }
      }
    }
    for (const k of standable) { const [i, j] = k.split(',').map(Number); standTop.set(k, rockAt(i, j)); }
    // the meadow's grass grows on: rock tops she stands on that are the flat top of a mossy rock, and not at an edge
    const mossTop = new Map(), mp = RK.sampleKitSurface(kit, { step: 0.25, seed: seed + 3, filter: it => RK.rockMoss(it.type) >= 0.75 });
    for (let q = 0; q < mp.length; q += 4) { if (mp[q + 3] < 0.8) continue; const k = key2(Math.floor(mp[q] / SG), Math.floor(mp[q + 2] / SG)); if (!(mossTop.get(k) >= mp[q + 1])) mossTop.set(k, mp[q + 1]); }
    const lawnish = k => standable.has(k) && Math.abs((mossTop.get(k) ?? -1e9) - standTop.get(k)) < 0.15;
    for (const k of standable) {
      if (!lawnish(k)) continue;
      const [i, j] = k.split(',').map(Number);
      if (N4.every(([a, b]) => lawnish(key2(i + a, j + b)) || landOk(i + a, j + b))) grassTop.set(k, standTop.get(k));
    }
  }
  const standKey = (x, z) => key2(Math.floor(x / SG), Math.floor(z / SG));
  const onRockTop = (x, z) => standable.has(standKey(x, z));
  const standAt = (x, z) => {
    if (!onRockTop(x, z)) return H(x, z);
    const fx = x / SG - 0.5, fz = z / SG - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, own = standTop.get(standKey(x, z));
    const at = (a, b) => standTop.get(key2(i + a, j + b)) ?? own;           // (smoothed between neighbouring tops)
    return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v;
  };

  // ---- each rock's footprint on the land, in one-metre cells (a cell is taken if a point of its surface comes down to within half
  // a metre of the ground there)
  const colliders = [], shade = [], bare = [], press = [], casters = [], cameraTrunks = [], solid = new Set();
  {
    const v = new THREE.Vector3(), cells = new Map();
    for (const { geometry, matrix } of kit.userData.instances) {
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 2) {
        v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        const cx = Math.floor(v.x), cz = Math.floor(v.z), k = key2(cx, cz);
        let c = cells.get(k);
        if (!c) cells.set(k, c = { cx, cz, g: H(cx + 0.5, cz + 0.5), low: Infinity, top: -Infinity });
        c.low = Math.min(c.low, v.y - c.g); c.top = Math.max(c.top, v.y - c.g);
      }
    }
    for (const c of cells.values()) {
      if (c.low > 0.5 || c.top < 0.08) continue;                            // an overhang above the ground, or a sliver at its foot
      const x = c.cx + 0.5, z = c.cz + 0.5;
      const stood = [0.25, 0.75].reduce((n, a) => n + [0.25, 0.75].filter(b => onRockTop(c.cx + a, c.cz + b)).length, 0);
      if (c.top > 0.35 && stood < 3) { colliders.push([x, z, 0.62]); solid.add(key2(c.cx, c.cz)); }      // (a rock top she can stand on is not in her way)
      bare.push([x, z, 0.55]); press.push([x, z, 1.25]);
      if (c.top < 0.25) continue;                                            // a flat stone or pebbles: no pool of shade, no shadow worth drawing
      shade.push([x, z, 1.3, Math.min(0.55, 0.2 + c.top * 0.12)]);
      const above = c.g + c.top - Math.max(H(x + 3, z), H(x - 3, z), H(x, z + 3), H(x, z - 3));      // (a rock against a face casts only as high as it stands above the land beside it)
      if (above > 0.3) casters.push([x, z, Math.min(c.top, above), 0.62, 0.85]);
      if (c.top > 1.8) cameraTrunks.push([x, z, 0.7, c.g, c.g + c.top]);
    }
  }
  const inRock = (x, z) => solid.has(key2(Math.floor(x), Math.floor(z)));

  // ---- the grass on the rocks' tops
  const grow = [...grassTop.keys()].map(k => { const [i, j] = k.split(',').map(Number); return [(i + 0.5) * SG, (j + 0.5) * SG, 0.4]; });
  const textures = [];
  const grassField = field => {                                            // the land's height with the grassy rock tops raised into it
    if (!grassTop.size) return field;
    const n = field.n, hh = new Uint16Array(n * n), [cx, cz] = field.center, r = field.radius, st = field.step;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = cx - r + i * st, z = cz - r + j * st, ci = Math.round(x / SG), cj = Math.round(z / SG);      // (a point of the land's grid lies between four cells)
      let h = field.heights[j * n + i];
      for (const [a, b] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const t = grassTop.get(key2(ci + a, cj + b)); if (t !== undefined && t > h) h = t; }
      hh[j * n + i] = THREE.DataUtils.toHalfFloat(h);
    }
    const texture = new THREE.DataTexture(hh, n, n, THREE.RedFormat, THREE.HalfFloatType);
    texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
    textures.push(texture);
    return { ...field, texture };
  };
  const useLawn = map => { if (map.lawnTexture) RK.setRockLawn({ texture: map.lawnTexture, center: map.center, size: map.radius * 2 }); };

  // ---- for the rock editor
  const edit = key ? {
    key, heightAt: H, fit: refit, edited: !!local,
    types: types || RK.PROP_ROCK_TYPES.filter(t => t.key !== 'range'),
    get kit() { return kit; },
    items: () => items.map(it => ({ ...it })),
    base: () => kept ? kept.rocks.map(fromRow) : generated.map(it => ({ ...it })),
    generated: kept ? () => generated.map(it => ({ ...it })) : null,
    save: l => ({ v: 1, rocks: l.map(toRow) }),
    load: d => validLayout(d) ? d.rocks.map(fromRow) : null,
    show(l) {                                                              // draw a changed list at once (the rest follows when the map loads again)
      const old = kit;
      kit = makeKit([...l, ...extra]);
      group.add(kit); group.remove(old); old.userData.dispose();
      return kit;
    },
  } : null;

  let baked = false;
  return {
    get kit() { return kit; }, items, edited: !!local,
    colliders, shade, bare, press, casters, cameraTrunks, inRock, onRockTop, standAt, grow, grassField, useLawn, edit, fit: refit,
    stats: { rocks: items.length + extra.length, shapes: kit.userData.shapes, triangles: kit.userData.triangles, standM2: standable.size * SG * SG, grassM2: grassTop.size * SG * SG, solid: solid.size },
    // each frame: the ground's height for the rocks' paint (drawn once), each rock as finely as its distance calls for (LOD)
    update(renderer, camera, { terrain = null, size = 200, center = [0, 0] } = {}) {
      if (!baked && terrain && renderer) { baked = true; RK.bakeGroundForRocks(renderer, [terrain], { center, size, res: 1024 }); }
      if (camera) kit.userData.update(camera);
    },
    dispose() { for (const t of textures) t.dispose(); RK.setRockLawn({}); },
  };
}
