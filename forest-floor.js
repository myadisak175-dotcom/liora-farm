// forest-floor.js  —  where the ground is a wood's floor: under trees that stand close together (a grove, a wood), and not
// under a tree that stands on its own (26 Nov 2026, chosen: "เฉพาะดงไม้ที่ขึ้นชิดกัน"). One job: from where the trees
// stand, a picture of how much each spot of the land is a wood's floor, for the land's paint to lay its floor by
// (stylized-terrain.js, floor: earth, dry leaves, moss in patches, assets/ground/forest-*-paint.webp), and the meadow's
// grass made thinner and shorter there, though not gone ("บางลง สั้นลง ยังมีบ้าง").
//
//   const floor = createForestFloor({ trees: [[x, z, crown], ...], rect: [x0, z0, x1, z1] });   // crown: its crown's radius (m)
//   floor.texture        the picture (red: 0 meadow .. 1 a wood's floor), over rect
//   floor.rect           [x0, z0, 1 / width, 1 / depth]: where the picture lies, for the land's paint
//   floor.at(x, z)       0..1, as the picture has it
//   floor.thin(map)      the ground map's grass (stylized-grassfield.js: its alpha) thinner and shorter on the floor, in
//                        patches (a fifth to nearly a half of it left); once, as the level is laid out (the map keeps it when the sun's shadows are drawn anew)
//   floor.groves         how many of the trees stand in a grove
//
// A grove: a tree with two others within NEAR of it. Each grove tree lays its floor round its foot, as far as its crown
// reaches and a little more (REACH), full near the trunk and fading out; where the crowns of a grove meet, theirs add up, so
// the floor runs on under the whole grove and its edge follows the grove's own. The picture is soft (a texel every ~0.6 m):
// the land's paint gives the edge its rag.

import * as THREE from 'three';

const NEAR = 7.5;              // metres between two trees' trunks for them to stand together
const NEIGHBOURS = 2;          // how many others within NEAR make a grove tree
const REACH = 1.2;             // metres past its crown a grove tree's floor reaches
const CELL = 0.6;              // metres a texel of the picture
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createForestFloor({ trees = [], rect: [x0, z0, x1, z1] }) {
  const w = x1 - x0, d = z1 - z0, nx = Math.ceil(w / CELL), nz = Math.ceil(d / CELL);
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
  // ---- each grove tree's floor round its foot, added up
  const dens = new Float32Array(nx * nz);
  for (const [x, z, crown] of grove) {
    const R = crown + REACH, i0 = Math.max(0, Math.floor((x - R - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((x + R - x0) / CELL));
    const j0 = Math.max(0, Math.floor((z - R - z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((z + R - z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const t = Math.hypot(x0 + (i + 0.5) * CELL - x, z0 + (j + 0.5) * CELL - z) / R;
      if (t < 1) dens[j * nx + i] += 1 - ss(0.45, 1, t);                 // (full near the trunk, fading out where the crown ends)
    }
  }
  const data = new Uint8Array(nx * nz);
  for (let k = 0; k < data.length; k++) data[k] = Math.round(255 * Math.min(1, dens[k]));
  const texture = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.unpackAlignment = 1; texture.colorSpace = THREE.NoColorSpace; texture.needsUpdate = true;

  const at = (x, z) => {                                                   // (read between texels, as the picture is)
    const u = (x - x0) / CELL - 0.5, v = (z - z0) / CELL - 0.5;
    if (u < -0.5 || v < -0.5 || u > nx - 0.5 || v > nz - 0.5) return 0;
    const i = Math.max(0, Math.min(nx - 2, Math.floor(u))), j = Math.max(0, Math.min(nz - 2, Math.floor(v))), fu = Math.min(1, Math.max(0, u - i)), fv = Math.min(1, Math.max(0, v - j)), o = j * nx + i;
    return ((data[o] * (1 - fu) + data[o + 1] * fu) * (1 - fv) + (data[o + nx] * (1 - fu) + data[o + nx + 1] * fu) * fv) / 255;
  };
  // the grass on the floor: a fifth to nearly a half of it left, by patches (two waves across each other: no ruled look)
  const thin = map => {
    const S = map.size, R = map.radius, [cx, cz] = map.center, k = S / (2 * R);
    const ia = Math.max(0, Math.floor((x0 - cx + R) * k)), ib = Math.min(S - 1, Math.ceil((x1 - cx + R) * k));
    const ja = Math.max(0, Math.floor((z0 - cz + R) * k)), jb = Math.min(S - 1, Math.ceil((z1 - cz + R) * k));
    for (let j = ja; j <= jb; j++) {
      const z = cz - R + (j + 0.5) / k;
      for (let i = ia; i <= ib; i++) {
        const x = cx - R + (i + 0.5) / k, f = at(x, z);
        if (f <= 0) continue;
        const patch = 0.5 + 0.28 * Math.sin(x * 0.83 + Math.sin(z * 0.61) * 1.7) + 0.22 * Math.sin(z * 1.07 + Math.sin(x * 0.47) * 2.1);
        const o = (j * S + i) * 4 + 3;
        map.data[o] = Math.round(map.data[o] * (1 - ss(0.2, 0.75, f) * (0.55 + 0.27 * patch)));
      }
    }
    map.texture.needsUpdate = true;
  };
  return { texture, rect: [x0, z0, 1 / (nx * CELL), 1 / (nz * CELL)], at, thin, groves: grove.length, dispose() { texture.dispose(); } };
}
