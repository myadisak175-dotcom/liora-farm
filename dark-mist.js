/* ==========================================================================
   dark-mist.js  —  the curse's dark mist, rising now and then off the water that is left (?curse=1)

     const mist = createDarkMist(pools);      // pools: drought.js's droughtPools (where the water lies, and its deepest spot)
     group.add(mist.group);                   // nothing to call each frame: the puffs keep the kit's own time

   One job: out of a few of the bigger pools, one at a time and slowly, a puff of dark mist: it comes up off the water, lifts
   and spreads a little, and thins away slowly to nothing before the next comes up. It is the falls' own puffs
   (stylized-waterfall.js, createBillows: little clouds that rise off the water and fade as clouds do), in the curse's dark
   instead of foam's white, slower, fewer and higher. A pool sends one about every ten to twenty seconds (DARK_MIST.life);
   at most DARK_MIST.most pools send them, the biggest, never two within DARK_MIST.apart metres of each other.
   Mobile: one small mesh to a pool (one puff of six lobes on a card), no texture, nothing worked out on the CPU.
   ========================================================================== */
import * as THREE from 'three';
import { createBillows } from './stylized-waterfall.js';

export const DARK_MIST = { most: 10, apart: 14, least: 3, colour: '#3b3642', fold: '#24202a' };
// the puffs' own knobs (createBillows reads them live): one puff to a pool at a time, long-lived, rising more than it drifts
const TUNE = {
  puffAmount: { value: 1 }, puffSize: { value: 1.4 }, puffGrow: { value: 2.2 }, puffSpread: { value: 0.35 }, puffRise: { value: 2.4 },
  puffLife: { value: 15 }, puffFade: { value: 0.2 }, puffSoft: { value: 0.6 }, puffOpacity: { value: 0.38 },      // (see-through: a haze, not a thing)
};

export function createDarkMist(pools = []) {
  const group = new THREE.Group(); group.name = 'darkMist';
  const chosen = [];
  for (const p of pools.filter(q => q.area >= DARK_MIST.least).sort((a, b) => b.area - a.area)) {
    if (chosen.length >= DARK_MIST.most) break;
    if (chosen.some(q => Math.hypot(q.deepest[0] - p.deepest[0], q.deepest[1] - p.deepest[1]) < DARK_MIST.apart)) continue;
    chosen.push(p);
  }
  for (const p of chosen) {
    const puff = createBillows({ x: p.deepest[0], z: p.deepest[1], y: p.y, width: 0.6, count: 1, tune: TUNE, white: DARK_MIST.colour, shade: DARK_MIST.fold });
    puff.name = 'darkMistPuff';
    group.add(puff);
  }
  return { group, sources: chosen.length };
}
