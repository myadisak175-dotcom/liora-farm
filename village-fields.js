/* ==========================================================================
   village-fields.js  —  tilled plots with rows of crops, built in code in the kit's flat-colour look
   Stand-ins until real crops (and planting) take their place: ridges of turned earth across a plot, and along each
   ridge something growing. The plot lies on the land as it is: every ridge follows the ground under it, so nothing
   has to be levelled for a field. Draw with propMaterial(), like the other code-built village pieces.

     const g = fieldGeometry({ x, z, w: 15, d: 9.5, yaw: 0, crop: 'cabbage', heightAt, seed: 3 });     // world space

   The plot is w metres along its rows and d across them, centred on (x, z), its rows turned by yaw.
   crop: 'cabbage' (round heads in a ring of leaves), 'carrot' (feathery tops), 'wheat' (tall golden clumps, thick)
   No shaders here: one job, the shapes.
   ========================================================================== */
import * as THREE from 'three';
import { kit } from './stylized-buildings.js';

export const FIELD_COLORS = {
  soil: '#8a6a48', soilDark: '#6f5238', cabbage: '#9fcf6a', cabbageLeaf: '#5f9a4a', carrot: '#4f9a3e', carrotRoot: '#e08a3a',
  wheat: '#e2bd58', wheatDark: '#c79a3e',
};

export function fieldGeometry({ x = 0, z = 0, w = 12, d = 8, yaw = 0, crop = 'cabbage', heightAt = () => 0, seed = 1, colors = FIELD_COLORS } = {}) {
  const K = kit(seed), C = colors, r = K.rng, c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];      // a spot in the plot -> the world
  const gap = crop === 'wheat' ? 0.62 : 0.95, rows = Math.max(1, Math.floor((d - 0.6) / gap)), z0 = -(rows - 1) * gap / 2;
  const SEG = 1.5, n = Math.max(1, Math.round((w - 0.5) / SEG)), len = (w - 0.5) / n;
  for (let i = 0; i < rows; i++) {
    const lz = z0 + i * gap;
    for (let k = 0; k < n; k++) {                                          // the ridge of turned earth, in short lengths that follow the ground
      const [ax, az] = at(-(w - 0.5) / 2 + k * len, lz), [bx, bz] = at(-(w - 0.5) / 2 + (k + 1) * len, lz), ya = heightAt(ax, az), yb = heightAt(bx, bz);
      K.box((ax + bx) / 2, (ya + yb) / 2 - 0.07, (az + bz) / 2, len + 0.06, 0.2, gap * 0.56, i % 2 ? C.soil : C.soilDark, { ry: yaw, rz: Math.atan2(yb - ya, len), vary: 0.06 });
    }
    const step = crop === 'wheat' ? 0.42 : crop === 'carrot' ? 0.55 : 0.9;
    for (let lx = -w / 2 + 0.6; lx <= w / 2 - 0.6; lx += step) {
      if (r() < 0.06) continue;                                             // a gap here and there
      const [px, pz] = at(lx + (r() - 0.5) * 0.12, lz + (r() - 0.5) * 0.1), y = heightAt(px, pz), k = 0.85 + r() * 0.35;
      if (crop === 'cabbage') {
        K.cyl(px, y + 0.1, pz, 0.12 * k, 0.4 * k, 0.16 * k, 6, C.cabbageLeaf, { ry: r() * 3, vary: 0.08 });      // the outer leaves, spread flat
        const head = new THREE.IcosahedronGeometry(0.2 * k, 0); head.scale(1, 0.8, 1); head.translate(px, y + 0.26 * k + 0.08, pz);
        K.raw(head, C.cabbage, 0.08);
      } else if (crop === 'carrot') {
        for (let j = 0; j < 3; j++) { const a = r() * 6.28, t = 0.25 + r() * 0.2; K.cyl(px + Math.cos(a) * 0.05, y + 0.1, pz + Math.sin(a) * 0.05, 0.05, 0.005, 0.34 * k, 4, C.carrot, { rx: Math.cos(a) * t, rz: Math.sin(a) * t, vary: 0.1 }); }
        if (r() < 0.3) K.cyl(px, y + 0.08, pz, 0.05, 0.035, 0.07, 5, C.carrotRoot);                             // a shoulder showing
      } else K.cyl(px, y + 0.08, pz, 0.07, 0.15, 0.78 * k, 4, r() < 0.5 ? C.wheat : C.wheatDark, { ry: r() * 1.5, rz: (r() - 0.5) * 0.24, vary: 0.07 });
    }
  }
  return K.done();
}
