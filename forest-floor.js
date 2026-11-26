// forest-floor.js  —  where the ground is a wood's floor: under trees that stand close together (a grove, a wood), and not
// under a tree that stands on its own (26 Nov 2026, chosen: "เฉพาะดงไม้ที่ขึ้นชิดกัน"), and wherever it was painted by hand
// (the path painter's 🍂 brush: path-brush.js, path-edits.js). One job: a picture of how much each spot of the land is a
// wood's floor, for the land's paint to lay its floor by (stylized-terrain.js, floor: earth, dry leaves, moss in patches,
// assets/ground/forest-*-paint.webp), and how much of the meadow's grass is left there: thinner and shorter, though not
// gone ("บางลง สั้นลง ยังมีบ้าง").
//
//   const floor = createForestFloor({ trees: [[x, z, crown], ...], rect: [x0, z0, x1, z1], heightAt, painted });
//                        crown: its crown's radius (m); heightAt(x, z): the land's height; painted(x, z) -> 0..1: the floor
//                        painted by hand as the map loads (path-edits.js, foldFloorOps), or null
//   floor.texture        the picture (red: 0 meadow .. 1 a wood's floor), over rect
//   floor.rect           [x0, z0, 1 / width, 1 / depth]: where the picture lies, for the land's paint
//   floor.at(x, z)       0..1, as the picture has it
//   floor.grass(x, z)    how much of the meadow's grass the floor leaves at a spot (1: all of it; a fifth to nearly a half
//                        on the floor itself, by patches)
//   floor.thin(map)      the ground map's grass (stylized-grassfield.js: its alpha) made so, once, as the level is laid
//                        out (the map keeps it when the sun's shadows are drawn anew)
//   floor.paint(box, fn) the floor painted by hand, live: fn(x, z, v) -> v' for each texel of box ([x0, x1, z0, z1]),
//                        v how much was painted there (0..1); the picture follows. Gives back its undoing
//   floor.groves         how many of the trees stand in a grove
//
// A grove: a tree with two others within NEAR of it. Each grove tree lays its floor round its foot, as far as its crown
// reaches and a little more (REACH), full near the trunk and fading out; where the crowns of a grove meet, theirs add up, so
// the floor runs on under the whole grove and its edge follows the grove's own. The picture is soft (a texel every ~0.6 m):
// the land's paint gives the edge its rag.
//
// It keeps to the ground the wood stands on (26 Nov 2026: "แก้ที่มันกินพื้นที่ตรงหน้าผา"). A tree's floor goes no higher
// or lower than its foot by more than a gentle slope would take it, so a grove at a cliff's top does not lay its leaves at
// the cliff's foot, nor one at its foot on the top; and no floor, grown or painted, lies on steep ground or in the last
// metre or so before it: a cliff's face and shoulders keep their rock and grass, and its edge a lip of grass.

import * as THREE from 'three';

const NEAR = 7.5;              // metres between two trees' trunks for them to stand together
const NEIGHBOURS = 2;          // how many others within NEAR make a grove tree
const REACH = 1.2;             // metres past its crown a grove tree's floor reaches
const CELL = 0.6;              // metres a texel of the picture
const STEEP = [0.5, 0.72];     // the floor gone between these slopes (rise over a metre: 27° .. 36°) ...
const LIP = 1.1;               // ... the steepest within this many metres of a spot counted
const DROP = [0.6, 0.42, 1.3]; // a tree's floor: as far above or below its foot as 0.6 m + 0.42 m to the metre out (a slope
                               // of 23°), gone 1.3 m past that
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createForestFloor({ trees = [], rect: [x0, z0, x1, z1], heightAt = null, painted = null }) {
  const w = x1 - x0, d = z1 - z0, nx = Math.ceil(w / CELL), nz = Math.ceil(d / CELL);
  const X = i => x0 + (i + 0.5) * CELL, Z = j => z0 + (j + 0.5) * CELL;
  // ---- which trees stand in a grove (a grid of NEAR-wide cells, to look only next door)
  const cells = new Map(), key = (i, j) => i + ',' + j;
  for (const t of trees) { const k = key(Math.floor(t[0] / NEAR), Math.floor(t[1] / NEAR)); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(t); }
  const grove = trees.filter(([x, z]) => {
    const ci = Math.floor(x / NEAR), cj = Math.floor(z / NEAR);
    let n = 0;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) for (const [ox, oz] of cells.get(key(i, j)) || []) {
      if ((ox !== x || oz !== z) && Math.hypot(ox - x, oz - z) < NEAR) n++;
    }
    return n >= NEIGHBOURS;
  });
  // ---- each grove tree's floor round its foot, added up (on the ground it stands on: see DROP)
  const dens = new Float32Array(nx * nz);
  for (const [x, z, crown] of grove) {
    const R = crown + REACH, i0 = Math.max(0, Math.floor((x - R - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((x + R - x0) / CELL));
    const j0 = Math.max(0, Math.floor((z - R - z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((z + R - z0) / CELL));
    const foot = heightAt ? heightAt(x, z) : 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const r = Math.hypot(X(i) - x, Z(j) - z), t = r / R;
      if (t >= 1) continue;
      let f = 1 - ss(0.45, 1, t);                                          // (full near the trunk, fading out where the crown ends)
      if (heightAt) { const off = DROP[0] + DROP[1] * r; f *= 1 - ss(off, off + DROP[2], Math.abs(heightAt(X(i), Z(j)) - foot)); }
      dens[j * nx + i] += f;
    }
  }
  // ---- steep ground: none of the floor there, nor within LIP of it (worked out only where there is floor, and kept)
  const keep = new Float32Array(nx * nz).fill(-1);
  const slopeAt = (x, z) => Math.hypot(heightAt(x + 0.5, z) - heightAt(x - 0.5, z), heightAt(x, z + 0.5) - heightAt(x, z - 0.5));
  const keepAt = k => {
    if (!heightAt) return 1;
    if (keep[k] < 0) {
      const x = X(k % nx), z = Z(Math.floor(k / nx));
      const s = Math.max(slopeAt(x, z), slopeAt(x + LIP, z), slopeAt(x - LIP, z), slopeAt(x, z + LIP), slopeAt(x, z - LIP));
      keep[k] = 1 - ss(STEEP[0], STEEP[1], s);
    }
    return keep[k];
  };
  // ---- the floor painted by hand, and the picture: the grove's or the painted, whichever is more, off the steep
  const hand = new Uint8Array(nx * nz), data = new Uint8Array(nx * nz);
  if (painted) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const v = painted(X(i), Z(j)); if (v > 0) hand[j * nx + i] = Math.round(255 * Math.min(1, v)); }
  const settle = k => { const v = Math.max(Math.min(1, dens[k]), hand[k] / 255); data[k] = v > 0 ? Math.round(255 * v * keepAt(k)) : 0; };
  for (let k = 0; k < data.length; k++) settle(k);
  const texture = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.unpackAlignment = 1; texture.colorSpace = THREE.NoColorSpace; texture.needsUpdate = true;

  const at = (x, z) => {                                                   // (read between texels, as the picture is)
    const u = (x - x0) / CELL - 0.5, v = (z - z0) / CELL - 0.5;
    if (u < -0.5 || v < -0.5 || u > nx - 0.5 || v > nz - 0.5) return 0;
    const i = Math.max(0, Math.min(nx - 2, Math.floor(u))), j = Math.max(0, Math.min(nz - 2, Math.floor(v))), fu = Math.min(1, Math.max(0, u - i)), fv = Math.min(1, Math.max(0, v - j)), o = j * nx + i;
    return ((data[o] * (1 - fu) + data[o + 1] * fu) * (1 - fv) + (data[o + nx] * (1 - fu) + data[o + nx + 1] * fu) * fv) / 255;
  };
  // the grass on the floor: a fifth to nearly a half of it left, by patches (two waves across each other: no ruled look)
  const grass = (x, z) => {
    const f = at(x, z);
    if (f <= 0) return 1;
    const patch = 0.5 + 0.28 * Math.sin(x * 0.83 + Math.sin(z * 0.61) * 1.7) + 0.22 * Math.sin(z * 1.07 + Math.sin(x * 0.47) * 2.1);
    return 1 - ss(0.2, 0.75, f) * (0.55 + 0.27 * patch);
  };
  const thin = map => {
    const S = map.size, R = map.radius, [cx, cz] = map.center, k = S / (2 * R);
    const ia = Math.max(0, Math.floor((x0 - cx + R) * k)), ib = Math.min(S - 1, Math.ceil((x1 - cx + R) * k));
    const ja = Math.max(0, Math.floor((z0 - cz + R) * k)), jb = Math.min(S - 1, Math.ceil((z1 - cz + R) * k));
    for (let j = ja; j <= jb; j++) {
      const z = cz - R + (j + 0.5) / k;
      for (let i = ia; i <= ib; i++) {
        const g = grass(cx - R + (i + 0.5) / k, z);
        if (g < 1) { const o = (j * S + i) * 4 + 3; map.data[o] = Math.round(map.data[o] * g); }
      }
    }
    map.texture.needsUpdate = true;
  };
  // painted by hand, live: the texels of the box changed, the picture with them (sent whole once: a stroke, not a frame)
  const paint = ([bx0, bx1, bz0, bz1], fn) => {
    const i0 = Math.max(0, Math.floor((bx0 - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((bx1 - x0) / CELL));
    const j0 = Math.max(0, Math.floor((bz0 - z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((bz1 - z0) / CELL));
    if (i1 < i0 || j1 < j0) return () => {};
    const bw = i1 - i0 + 1, before = new Uint8Array(bw * (j1 - j0 + 1));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * nx + i, v = hand[k];
      before[(j - j0) * bw + (i - i0)] = v;
      hand[k] = Math.round(255 * Math.min(1, Math.max(0, fn(X(i), Z(j), v / 255))));
      if (hand[k] !== v) settle(k);
    }
    texture.needsUpdate = true;
    return () => {
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i; hand[k] = before[(j - j0) * bw + (i - i0)]; settle(k); }
      texture.needsUpdate = true;
    };
  };
  return { texture, rect: [x0, z0, 1 / (nx * CELL), 1 / (nz * CELL)], at, grass, thin, paint, groves: grove.length, dispose() { texture.dispose(); } };
}
