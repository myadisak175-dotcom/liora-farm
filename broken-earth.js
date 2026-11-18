/* ==========================================================================
   broken-earth.js  —  the earth the plant boss's roots break as they come up out of the ground (thicket-fx.js: the
   thicket's ring; thorn-patches-fx.js: the ultimate's patches of thorns). It is the game's own dry earth, the one the
   land under the curse is painted with (assets/ground/dry-paint.webp: tools/make-path-paint.py dry): its colour, and its
   cracks in the picture's alpha. Here it is laid on the world, every effect reading the same spot of it for the same
   spot of ground, at EARTH_TILE metres a repeat (larger than the land's 4.1 m: broken by a blow, the earth goes in
   pieces you can see, not in a fine craze). And its plates, cut along those very cracks (assets/ground/dry-plates.json,
   made with the picture), for an effect that heaves the ground up in pieces. One job: that earth, where it lies.

     const earth = brokenEarth()             one for the page (loaded once, shared): { texture, ready, platesAround }
     earth.platesAround(x, z, r0, r1)        the plates whose middles lie r0 .. r1 metres from (x, z), as they lie on the
                                             world: [{ pts: [[x, z], ...], cx, cz }] (a point every 24 px of the picture
                                             along each edge); [] until they have loaded
     earthUniforms(earth)                    { uEarthMap, uEarthTile } for a material whose shader takes BROKEN_EARTH_GLSL
     BROKEN_EARTH_GLSL                       vec4 earthAt(vec2 xz): the earth's colour at a world point (rgb), and how
                                               much of a crack is there (a: 0 none .. 1 the middle of one)
                                             float crackGlowAt(vec2 xz): the cracks seen soft, as their glow spreads round
                                               them (0 .. 1)

   Until the picture has loaded the earth reads as nothing at all (no colour, no cracks): never a black patch.
   ========================================================================== */
import * as THREE from 'three';

export const EARTH_TILE = 8;                       // metres the picture covers, each way
const PAINT = new URL('./assets/ground/dry-paint.webp', import.meta.url).href;
const PLATES = new URL('./assets/ground/dry-plates.json', import.meta.url).href;

let shared = null;
export function brokenEarth() {
  if (shared) return shared;
  const loaded = { value: 0 };
  const texture = new THREE.TextureLoader().load(PAINT, () => { loaded.value = 1; });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;          // (raw, as the land reads it: the kit paints in the picture's own tones)
  texture.flipY = false;                            // (so a world point reads the pixel the plates' outlines name: x across, y down)
  texture.anisotropy = 4;
  let plates = null;                                // in the picture's pixels, as the tool wrote them
  const ready = fetch(PLATES).then(r => (r.ok ? r.json() : null)).then(j => { if (j) plates = j; }).catch(() => {});
  function platesAround(x, z, r0, r1) {
    if (!plates) return [];
    const N = plates.size, S = EARTH_TILE, out = [];
    const i0 = Math.floor((x - r1) / S) - 1, i1 = Math.floor((x + r1) / S) + 1, j0 = Math.floor((z - r1) / S) - 1, j1 = Math.floor((z + r1) / S) + 1;
    for (const pl of plates.plates) {
      let mx = 0, my = 0;
      for (const [u, v] of pl) { mx += u; my += v; }
      mx /= pl.length; my /= pl.length;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const cx = (mx / N + i) * S, cz = (my / N + j) * S, d = Math.hypot(cx - x, cz - z);
        if (d < r0 || d > r1) continue;
        const pts = [];
        for (let k = 0; k < pl.length; k += 2) pts.push([(pl[k][0] / N + i) * S, (pl[k][1] / N + j) * S]);      // (every other point: plenty for a slab's edge)
        out.push({ pts, cx, cz });
      }
    }
    return out;
  }
  shared = { texture, loaded, ready, platesAround };
  return shared;
}

export const earthUniforms = earth => ({ uEarthMap: { value: earth.texture }, uEarthTile: { value: EARTH_TILE }, uEarthOn: earth.loaded });

export const BROKEN_EARTH_GLSL = /* glsl */`
uniform sampler2D uEarthMap;
uniform float uEarthTile, uEarthOn;
vec4 earthAt(vec2 xz) {
  vec4 e = texture2D(uEarthMap, xz / uEarthTile);
  return vec4(e.rgb, (1.0 - e.a) * uEarthOn);
}
float crackGlowAt(vec2 xz) {
  // the picture's own smaller copies: the cracks blurred, a few centimetres, then a hand's width round
  float a = 1.0 - texture2D(uEarthMap, xz / uEarthTile, 2.5).a, b = 1.0 - texture2D(uEarthMap, xz / uEarthTile, 4.0).a;
  return clamp(a * 2.4 + b * 2.0, 0.0, 1.0) * uEarthOn;
}`;
