// valley-cliffs.js
// Dresses the valley's cliff faces in stacked plates of rock ('slabs' in stylized-cliffs.js), the look of the cliffs in
// Genshin Impact. The land itself stays as it is (stylized-terrain.js): this only finds where it is steep and stands a
// piece of rock in front of each stretch of face, so the stretched ground there is hidden behind real chunks of stone.
//
//   const { list, colliders } = valleyCliffPieces({ V, heightAt, z0, z1, skip });
//   group.add(createCliffSet(list));                 // one mesh, one draw call
//
// Where: both sides of the river, between z0 and z1, every steep stretch going out from the river (the lower tier of the
// cliffs and the upper one). skip(x, z) says where to leave the face bare (paths cut into it, and so on).

const STEP = 3.6;          // metres along the valley between pieces (they are wider than this, so they overlap)
const WIDTH = 5.4, DEPTH = 3.2;

// out from the river at z on one side: every stretch where the land climbs steeply, with its foot and its top
function facesAt(V, heightAt, z, side) {
  const cx = V.riverX(z), out = [];
  let start = null, prev = heightAt(cx + side * 6, z);
  for (let a = 6.25; a < 48; a += 0.25) {
    const h = heightAt(cx + side * a, z), steep = (h - prev) / 0.25 > 0.9;
    if (steep && start === null) start = { a: a - 0.25, h: prev };
    if (!steep && start !== null) {
      if (h - start.h > 2.2) out.push({ a0: start.a, a1: a, h0: start.h, h1: h });
      start = null;
    }
    prev = h;
  }
  return out;
}

export function valleyCliffPieces({ V, heightAt, z0, z1, skip = () => false, seed = 1 }) {
  const list = [], colliders = [];
  let n = 0;
  for (const side of [-1, 1]) {
    for (let z = z0; z <= z1; z += STEP) {
      const here = facesAt(V, heightAt, z, side);
      const before = facesAt(V, heightAt, z - 1.5, side), after = facesAt(V, heightAt, z + 1.5, side);
      for (const f of here) {
        // the face's line here, from the same face just up and down the valley: which way it faces
        const near = (list2, a) => list2.reduce((b, g) => (Math.abs(g.a0 - a) < Math.abs(b.a0 - a) ? g : b), { a0: 1e9 });
        const fb = near(before, f.a0), fa = near(after, f.a0);
        const xb = V.riverX(z - 1.5) + side * (Math.abs(fb.a0 - f.a0) < 3 ? fb.a0 : f.a0), xa = V.riverX(z + 1.5) + side * (Math.abs(fa.a0 - f.a0) < 3 ? fa.a0 : f.a0);
        let nx = 3, nz = -(xa - xb);                                        // perpendicular to the face's line (dx, 3)
        if (nx * -side < 0) { nx = -nx; nz = -nz; }                        // towards the river
        const l = Math.hypot(nx, nz); nx /= l; nz /= l;
        const fx = V.riverX(z) + side * f.a0, fz = z;
        if (skip(fx, fz)) continue;
        const height = f.h1 - f.h0 + 0.6;
        // the piece's front stands just in front of the foot of the face; its body goes back into the hill
        const x = fx - nx * (DEPTH / 2 - 0.25), zz = fz - nz * (DEPTH / 2 - 0.25);
        list.push({ type: 'slabs', x, y: f.h0, z: zz, rotY: Math.atan2(nx, nz), seed: seed * 1000 + n++, opts: { width: WIDTH, height, depth: DEPTH } });
        if (f.h0 < 4) {                                                    // pieces standing on the valley floor: solid to walk into
          const c = Math.cos(Math.atan2(nx, nz)), s = Math.sin(Math.atan2(nx, nz));
          for (const u of [-1.8, 0, 1.8]) colliders.push([x + u * c, zz - u * s, 1.25]);
        }
      }
    }
  }
  return { list, colliders };
}
