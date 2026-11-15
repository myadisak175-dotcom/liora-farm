/* ==========================================================================
   anime-tree.js  —  anime-style trees and bushes, built the way of the
   Blender "Anime Tree Tutorial" (trungduyng), in three.js.
   One job: build those plants (and their falling leaves), one at a time or
   as a forest. Trunks and limbs are grown by stylized-nature.js (same bark
   as the game's trees).

   The tutorial's five steps, and where they live here
     1. leaf planes that always face the camera          -> LEAF_VS: camera-facing cards
     2. many planes scattered over a ball = one puff      -> buildPuffs(): cards over each puff's ball
     3. the ball lends its normals to the planes          -> LEAF_FS: each leaf is lit with the normal of its
        (Blender: Data Transfer, custom normals)             puff's ball at that leaf (a little of the whole crown's too)
     4. cel shading: Shader to RGB -> Color Ramp          -> LEAF_FS: the light steps through five flat colours,
        (constant), plus AO and a gradient for weight        darker deep among the puffs (AO) and low in the plant
     5. puffs stacked into a tree                          -> broadleaf trees: one puff on every grown limb's tip;
                                                              the pine: one wide flat puff per skirt; bushes: two
                                                              puffs on top in a ring of lower ones
     extras: wind (shared with the game's plants), falling leaves

   Each leaf (or needle) of a card takes ONE colour: the mask stores where each leaf's middle is, so a light step runs
   leaf by leaf, never through the middle of a leaf.
   Leaf size follows how near the eye the leaves hang: the lower the crown, the smaller and denser the leaves.

   createAnimeTree({ type: 'broadleaf' | 'oak' | 'sapling' | 'birch' | 'pine', seed, falling: true }) -> Group
   createAnimeBush({ seed, bloom }) -> Group       its shape (one of BUSH_SHAPES) from the seed;
                                                    bloom: 'pink' | 'white' | 'yellow' | 'lilac' | 'blue' (a flowering bush:
                                                    the same bush, with heads of small flowers sitting in its leaves) or none
   createAnimeForest([{ kind: 'tree' | 'bush', type, seed, detail, x, y, z, rotY, scale }, ...]) -> Group
        a bush of type 'flowering' flowers, in one of BLOOM_COLORS: the same for every bush of a neighbourhood
        many plants in a few draw calls (one per leaf look, one per bark, one for the falling leaves). Each kind is built
        in VARIANTS shapes (picked by seed) and copied into place, turned and sized; detail under 0.8 (trees she never
        comes near) uses fewer, bigger leaf cards.
   setAnimeSun(vec3)       world direction toward the sun: every anime plant's leaves and bark follow it live
                           (never from below the horizon: at night the plants keep a low light)
   every frame: stylized-nature's update(dt) (time + wind are shared with the other plants)
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, uniforms as natureUniforms, growTreeFrame, treeSpec, NATURE_VCOMMON, NATURE_HAZEF } from './stylized-nature.js';

const range = (rng, a, b) => a + rng() * (b - a);
const rgb = h => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

// five flat tones, deep shade -> sunlit tips, and where each tone starts (the game's top tones are yellow, so they
// start late: only the brightest tips turn yellow). game / pine / birch: the game's own crown colours for those trees
const GAME_STEPS = [0.32, 0.54, 0.76, 1.0], BLOOM_STEPS = [0.2, 0.38, 0.62, 0.95];
export const ANIME_PALETTES = {
  game: { tones: ['#273a1b', '#466533', '#728e3e', '#a6b822', '#dde43a'], steps: GAME_STEPS },
  pine: { tones: ['#1b2d1e', '#2e4d2f', '#4b7339', '#7b9b39', '#c3d447'], steps: GAME_STEPS },
  // the trees' crowns: the game's own tones, the yellow kept for the sunlit tips; lit as one crown with a little light from
  // the sky on what faces up. oak: the same tones, deeper (less of the bright ones)
  tree: { tones: ['#2c4520', '#466533', '#728e3e', '#a6b822', '#dde43a'], steps: [0.26, 0.48, 0.76, 1.0], weights: { light: 0.66, height: 0.2, ao: 0.42, sky: 0.2, tint: 0.12 } },
  oak: { tones: ['#28401e', '#42602f', '#6c8839', '#9db024', '#d6de38'], steps: [0.3, 0.54, 0.84, 1.08], weights: { light: 0.66, height: 0.2, ao: 0.45, sky: 0.2, tint: 0.12 } },
  birch: { tones: ['#3a582c', '#4f6f33', '#7f9b3e', '#b4c42b', '#e9ed5c'], steps: [0.26, 0.48, 0.76, 1.0], weights: { light: 0.66, height: 0.2, ao: 0.42, sky: 0.2, tint: 0.12 } },      // (the yellow only on the sunlit tips)
  video: { tones: ['#1c4637', '#2c6a40', '#4c9737', '#86c23c', '#c6e055'], steps: [0.3, 0.5, 0.69, 0.93] },   // the tutorial's
  // flowers on the flowering bushes: the game's flower colours (stylized-nature's FLOWER_COLORS) as the fourth tone, deep shade
  // to sunlit; the top tone only on the brightest florets
  'bloom-pink': { tones: ['#8a3f5e', '#c2678a', '#e68aa8', '#f7b3c8', '#ffe3ec'], steps: BLOOM_STEPS, centre: '#f7d24a' },
  'bloom-white': { tones: ['#7d8672', '#b3baa6', '#dfe1d2', '#f6f3e8', '#ffffff'], steps: BLOOM_STEPS, centre: '#f2c33c' },
  'bloom-yellow': { tones: ['#8a5a14', '#c4821c', '#eda62c', '#f9c63e', '#ffe796'], steps: BLOOM_STEPS, centre: '#b85c1c' },
  'bloom-lilac': { tones: ['#4a3a86', '#6c56b8', '#8f76dc', '#b099f2', '#ded2ff'], steps: BLOOM_STEPS, centre: '#f7d24a' },
  'bloom-blue': { tones: ['#2f4f86', '#4a74b8', '#709bdc', '#9bbff2', '#d9e9ff'], steps: BLOOM_STEPS, centre: '#f7e9a0' },
};
export const BLOOM_COLORS = ['pink', 'white', 'yellow', 'lilac', 'blue'];

// one sun for every anime plant (leaves and bark)
const SUN = { value: new THREE.Vector3(-0.55, 0.7, 0.45).normalize() };
export function setAnimeSun(v) {
  SUN.value.copy(v);
  if (SUN.value.y < 0.12) SUN.value.y = 0.12;                       // (lit from below the horizon, a crown would glow underneath)
  SUN.value.normalize();
}

// Every tree's crown is made of boughs, not of balls: each limb's tip carries a canopy (a puff wider than it is tall), beside
// it one or two smaller ones a little lower, and sprays hanging round its lower outer edge (taller than they are wide), so
// the outline is lobed and ends in drooping points, with hollows between the boughs. A spec's boughs says how:
//   canopy: [a, b] the tip puff's height / width;  side: { n: [a, b], size, out, drop } the puffs beside it (size, how far out
//   and how far down, in tip radii);  sprays: { n: [a, b], r, f, drop, out } the hanging sprays (radius in tip radii, height /
//   width, how far below the tip and how far out round its edge)

// the broadleaf: the meadow's shade tree. A trunk forking into rising limbs, a tall crown of full boughs with a lobed outline
const BROADLEAF = {
  height: 10.4,
  trunk: {
    pts: [[0, -0.05, 0], [0.04, 1.2, 0], [0.12, 2.4, 0.04], [0.1, 3.5, 0], [0.03, 4.7, 0.03], [0, 6.0, 0], [0.06, 7.3, 0], [0.1, 8.6, 0]],
    radius: t => 0.24 * Math.pow(1 - t, 1.1) + 0.03 + 0.16 * Math.exp(-t * 24), lean: 0.22, sway: 0.25, roots: 4,
  },
  grow: {
    crown: { c: [0.1, 6.2, 0], r: [2.9, 3.6, 2.8], taper: 0.3, taperLow: 0.2, egg: 0.05 },
    limbs: { n: [10, 12], t: [0.3, 0.82], elev: [-0.55, 0.8], reach: [0.62, 0.97], r: 0.08 },
    floor: -0.55, tuck: 0.5,
    clump: { r: 0.86, flat: 0.75, vary: [0.72, 1.3], push: 0.12, lift: 0.08 },
    top: 1.05, fill: [5, 0.45, 0.9],
  },
  boughs: { canopy: [0.62, 0.8], side: { n: [1, 2], size: [0.6, 0.86], out: [0.8, 1.15], drop: [0.15, 0.5] },
    sprays: { n: [2, 3], r: [0.34, 0.48], f: [1.15, 1.6], drop: [0.55, 0.95], out: [0.5, 0.9] } },
  // warm brown bark in long furrowed plates
  bark: ['#b48d68', '#8a684d', '#5b4237'], barkHi: '#ecd3aa', furrow: 0.75, furrowN: 3.4, furrowW: 0.03, markCol: '#44312b',
  barkShade: 0.3, barkStroke: 0.9, barkFoot: 0.7, shadeY: 3.9,
};
// the oak: a short massive trunk forking low into heavy limbs that reach far out, nearly level: a crown much wider than it
// is tall, in broad full layers, deeper green than the broadleaf
const OAK = {
  height: 8.8,
  trunk: {
    pts: [[0, -0.05, 0], [0.03, 0.8, 0], [0.08, 1.6, 0.03], [0.05, 2.5, 0], [0.1, 3.5, 0.03], [0.1, 4.6, 0], [0.14, 5.8, 0], [0.1, 7.0, 0]],
    radius: t => 0.4 * Math.pow(1 - t, 1.1) + 0.03 + 0.3 * Math.exp(-t * 20), lean: 0.12, sway: 0.2, roots: 6,
  },
  grow: {
    crown: { c: [0, 5.5, 0], r: [4.5, 3.2, 4.3], taper: 0.55, taperLow: 0.12 },      // a low wide dome: broadest low down, drawn in toward its top
    limbs: { n: [8, 9], t: [0.3, 0.72], elev: [-0.5, 0.6], reach: [0.55, 0.98], r: 0.14, bend: [0.45, 0.15, 0.8, 0.5] },
    floor: -0.46, tuck: 0.6,
    clump: { r: 1.08, flat: 0.7, vary: [0.62, 1.45], push: 0.12, lift: 0.08 },
    top: 1.3, fill: [5, 0.5, 1.0],
  },
  boughs: { canopy: [0.6, 0.82], side: { n: [1, 2], size: [0.6, 0.9], out: [0.85, 1.2], drop: [0.1, 0.5] },
    sprays: { n: [2, 3], r: [0.3, 0.44], f: [1.2, 1.8], drop: [0.55, 1.05], out: [0.55, 0.95] } },
  // old grey-brown bark, its plates broad and its furrows deep; moss on the roots and on the tops of the great limbs
  bark: ['#a48a74', '#786352', '#4e403a'], barkHi: '#e0cba8', furrow: 0.9, furrowN: 2.7, furrowW: 0.032, markCol: '#30272a',
  barkShade: 0.32, barkStroke: 0.7, barkFoot: 0.7, moss: 0.5, shadeY: 3.4,
};
// the sapling: a young tree. A thin smooth stem, a few short limbs rising steeply, a small loose crown that narrows upward,
// the stem showing through it
const SAPLING = {
  height: 4.9,
  trunk: {
    pts: [[0, -0.05, 0], [0.02, 0.9, 0], [0.06, 1.8, 0], [0.05, 2.7, 0], [0.09, 3.6, 0], [0.07, 4.45, 0]],
    radius: t => 0.07 * Math.pow(1 - t, 1.1) + 0.014 + 0.045 * Math.exp(-t * 30), lean: 0.26, sway: 0.18, roots: 3,
  },
  grow: {
    crown: { c: [0.05, 3.2, 0], r: [0.92, 1.6, 0.88], taper: 0.4, taperLow: 0.2, egg: 0.1 },
    limbs: { n: [6, 7], t: [0.4, 0.93], lift: [0.1, 0.4], reach: [0.62, 1.0], r: 0.026, bend: [0.36, 0.34, 0.74, 0.74] },
    floor: -0.55, tuck: 0.5,
    clump: { r: 0.34, flat: 0.85, vary: [0.7, 1.3], push: 0.1, lift: 0.05 },
    top: 0.9,
  },
  boughs: { canopy: [0.72, 0.9], side: { n: [0, 1], p: 0.6, size: [0.6, 0.82], out: [0.8, 1.1], drop: [0.15, 0.5] },
    sprays: { n: [1, 2], r: [0.34, 0.46], f: [1.5, 2.1], drop: [0.7, 1.15], out: [0.4, 0.8] } },
  // young bark: smooth, olive grey, fine lenticels across it (the birch's way of painting, in its own colours)
  bark: ['#b3ad88', '#878264', '#5f5b49'], birch: true, markCol: '#4a4236', twig: '#6b5c48', barkShade: 0.2, barkFoot: 0.6, shadeY: 2.3,
};
// the birch: a slender white stem, slim limbs rising steeply from it, and a tall airy crown of small boughs with long hanging
// sprays, sky and white wood showing between them
const BIRCH = {
  height: 10,
  trunk: {
    pts: [[0, -0.05, 0], [0.05, 1.5, 0], [-0.06, 3, 0.05], [0.05, 4.5, 0], [0.13, 6, 0], [0.1, 7.6, 0], [0.14, 9.3, 0]],
    radius: t => 0.13 * Math.pow(1 - t, 1.05) + 0.016 + 0.06 * Math.exp(-t * 35), lean: 0.24, sway: 0.16, roots: 3,
  },
  grow: {
    crown: { c: [0.1, 6.3, 0], r: [1.9, 3.7, 1.8], taper: 0.4, taperLow: 0.25, egg: 0.1 },
    limbs: { n: [12, 14], t: [0.3, 0.94], lift: [0.1, 0.36], reach: [0.62, 1.0], r: 0.03, bend: [0.36, 0.34, 0.74, 0.74] },
    floor: -0.7, tuck: 0.55,
    clump: { r: 0.58, flat: 0.8, vary: [0.7, 1.35], push: 0.1, lift: 0.05 },
    top: 0.85,
  },
  boughs: { canopy: [0.7, 0.85], side: { n: [0, 1], p: 0.85, size: [0.6, 0.85], out: [0.8, 1.1], drop: [0.2, 0.55] },
    sprays: { n: [2, 3], p: 0.4, r: [0.3, 0.44], f: [1.9, 2.7], drop: [0.75, 1.3], out: [0.45, 0.85] } },
  // white bark painted as one form (stylized-nature's bark shader, spec.birch): white to the sun, a cool shade away from it
  bark: ['#f5f2e8', '#cfd3d6', '#a3a9b6'], birch: true, markCol: '#3a332e', twig: '#6e5c50', barkShade: 0.22, barkFoot: 0.55, shadeY: 4.6,
};
// leaf: card size (m), from how low the crown hangs; fall: falling leaves; mask: leaf clusters or needle tufts;
// upright: cards keep (about) upright, so needle tufts hang down; unity: 0..1 how much the crown is lit as one mass
// (each leaf's light comes from a ball drawn toward the crown's middle) and not puff by puff; rough: puffs' outlines broken
const KINDS = {
  broadleaf: { spec: () => BROADLEAF, leaf: 0.8, fall: 36, palette: 'tree', unity: 0.45, rough: 0.22 },
  oak: { spec: () => OAK, leaf: 0.7, fall: 40, palette: 'oak', unity: 0.45, rough: 0.22 },      // its crown hangs low: smaller leaves
  sapling: { spec: () => SAPLING, leaf: 0.52, fall: 10, palette: 'tree', unity: 0.4, rough: 0.22 },
  birch: { spec: () => BIRCH, leaf: 0.56, fall: 20, palette: 'birch', unity: 0.4, rough: 0.24 },
  // skirts, low down: each a wide flat puff (sunlit top, shaded underside), so the layers read one by one. The skirts
  // shade each other a lot, so their AO is gentler, and the light climbs more strongly up the spire
  pine: { spec: () => treeSpec('pine'), leaf: 0.7, fall: 0, palette: 'pine', mask: 'needle', upright: 0.7, thick: 1.1, wide: 1.15, ao: 0.5, hRange: [0.15, 1.15] },
};
const BUSH_LEAF = 0.46;
// a bush's size: as first drawn it stood ~1.9 m and ~3.4 m across, taller than Vivi (1.6 m). Now about waist to chest high
// on her (~1.15 m, ~2 m across). Everything shrinks with it, the leaves too (so the same number of leaf cards); the flower
// sprays a little less, so they still read as flowers
export const BUSH_SIZE = 0.6;
const BLOOM_SIZE = 0.72;
const BUSH_ROUGH = 0.17, BUSH_UNITY = 0.55;
const DENSITY = 7.5;              // cards per m² of puff at the broadleaf's leaf size; smaller leaves -> more cards
const densityFor = leaf => DENSITY * (0.8 / leaf) * (0.8 / leaf);
const VARIANTS = 4;               // shapes of each kind of tree in a forest
const BUSH_VARIANTS = 10;         // and of bushes: every one of the five shapes twice
const FAR_LEAF = 1.45;            // a far tree's leaf cards are this much bigger (and so about half as many)
// surface of an ellipsoid (Knud Thomsen's formula, within ~1%)
const ellipsoidArea = (a, b, c) => { const p = 1.6075; return 4 * Math.PI * Math.pow((Math.pow(a * b, p) + Math.pow(a * c, p) + Math.pow(b * c, p)) / 3, 1 / p); };

// --------------------------------------------------------------------------
// the masks: four cells each, white on black. r = coverage, g/b = where that leaf's middle is in its cell
// (0..1, times coverage: they blur the right way into mipmaps)
//   leaf:   a loose round cluster of small pointed leaves
//   needle: a fan of thin needles hanging down and out from one twig (pine)
//   blossom: one to three open five-petalled flowers and now and then a bud (the flowering bushes' flowers); a second
//            picture (masks['blossom/centre']) says where each flower's middle is, drawn in its own colour
// --------------------------------------------------------------------------
const masks = {};
function leafPath(g, L, W) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(L * 0.08, W * 0.62, L * 0.58, W * 0.66, L, 0);
  g.bezierCurveTo(L * 0.58, -W * 0.66, L * 0.08, -W * 0.62, 0, 0);
  g.closePath();
}
function needlePath(g, L, W) {
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(L * 0.45, W, L, 0);
  g.quadraticCurveTo(L * 0.45, -W, 0, 0);
  g.closePath();
}
function floretPath(g, R, turn) {                                   // five round petals about a middle, as one shape
  g.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = turn + k * Math.PI * 0.4;
    g.moveTo(Math.cos(a) * R, Math.sin(a) * R);
    g.ellipse(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.5, R * 0.37, a, 0, Math.PI * 2);
  }
  g.moveTo(R * 0.3, 0); g.arc(0, 0, R * 0.3, 0, Math.PI * 2);
}
function clusterMask(style) {
  if (masks[style]) return masks[style];
  const S = 1024, C = 512, rng = mulberry32(style === 'needle' ? 977 : style === 'blossom' ? 733 : 4211);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  let g2 = null, cv2 = null;                                        // (blossom: where each flower's middle is)
  if (style === 'blossom') { cv2 = document.createElement('canvas'); cv2.width = cv2.height = S; g2 = cv2.getContext('2d'); g2.fillStyle = '#000'; g2.fillRect(0, 0, S, S); }
  const draw = (ox, oy, bx, by, dir, L, W, cx, cy, path) => {
    g.save();
    g.translate(ox + bx, oy + by); g.rotate(dir);
    path(g, L, W);
    g.fillStyle = `rgb(255, ${Math.round(cx / C * 255)}, ${Math.round((1 - cy / C) * 255)})`;
    g.fill();
    g.restore();
  };
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * C, oy = Math.floor(v / 2) * C, mid = C / 2;
    g.save(); g.beginPath(); g.rect(ox + 4, oy + 4, C - 8, C - 8); g.clip();
    if (style === 'blossom') {
      // one to three open flowers and now and then a bud, with air between them (the leaves show through a card)
      const placed = [];
      const put = (R, bud) => {
        for (let tries = 0; tries < 200; tries++) {
          const rr = C * 0.3 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
          const bx = mid + Math.cos(a) * rr, by = mid + Math.sin(a) * rr;
          if (rr + R > C * 0.46) continue;
          if (placed.some(p => Math.hypot(p[0] - bx, p[1] - by) < (p[2] + R) * 1.08)) continue;
          placed.push([bx, by, R]);
          g.save();
          g.translate(ox + bx, oy + by);
          if (bud) { g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); } else floretPath(g, R, rng() * 6.28);
          g.fillStyle = `rgb(255, ${Math.round(bx / C * 255)}, ${Math.round((1 - by / C) * 255)})`;
          g.fill();
          g.restore();
          if (!bud) { g2.beginPath(); g2.arc(ox + bx, oy + by, R * 0.27, 0, Math.PI * 2); g2.fillStyle = '#fff'; g2.fill(); }
          return;
        }
      };
      for (let i = 0; i < [1, 2, 3, 2][v]; i++) put(C * range(rng, 0.16, 0.2), false);
      for (let i = 0; i < [1, 0, 0, 1][v]; i++) put(C * range(rng, 0.07, 0.09), true);
    } else if (style === 'needle') {
      // a twig across the top third; needles fan from it, down and out (canvas y is down)
      const n = 60;
      for (let i = 0; i < n; i++) {
        const u = rng(), bx = mid + (u - 0.5) * C * 0.42, by = mid - C * 0.16 + Math.abs(u - 0.5) * C * 0.12;
        const dir = Math.PI * 0.5 + (u - 0.5) * 2.4 + (rng() - 0.5) * 0.5;
        const L = C * range(rng, 0.2, 0.32), W = L * range(rng, 0.08, 0.12);
        const tx = bx + Math.cos(dir) * L, ty = by + Math.sin(dir) * L;
        if (Math.hypot(tx - mid, ty - mid) > C * 0.47) continue;
        draw(ox, oy, bx, by, dir, L, W, bx + Math.cos(dir) * L * 0.5, by + Math.sin(dir) * L * 0.5, needlePath);
      }
    } else {
      const placed = [];
      for (let tries = 0; tries < 400 && placed.length < 30; tries++) {
        const L = C * range(rng, 0.14, 0.2), W = L * range(rng, 0.56, 0.68);
        const rr = C * 0.36 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        const bx = mid + Math.cos(a) * rr, by = mid + Math.sin(a) * rr;            // where the leaf's stalk sits
        const dir = a + (rng() - 0.5) * 1.3 + (rr < C * 0.08 ? rng() * 6.28 : 0);  // leaves point out of the cluster
        const cx = bx + Math.cos(dir) * L * 0.5, cy = by + Math.sin(dir) * L * 0.5;
        const tx = bx + Math.cos(dir) * L, ty = by + Math.sin(dir) * L;
        if (Math.hypot(tx - mid, ty - mid) > C * 0.47) continue;                    // stays inside its cell
        if (placed.some(p => Math.hypot(p[0] - cx, p[1] - cy) < (p[2] + L) * 0.36)) continue;   // a little air between leaves
        placed.push([cx, cy, L]);
        draw(ox, oy, bx, by, dir, L, W, cx, cy, leafPath);
      }
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  if (cv2) { const t2 = new THREE.CanvasTexture(cv2); t2.minFilter = THREE.LinearMipmapLinearFilter; t2.magFilter = THREE.LinearFilter; masks['blossom/centre'] = t2; }
  return (masks[style] = t);
}

// --------------------------------------------------------------------------
// shaders
// --------------------------------------------------------------------------
const LEAF_VS = /* glsl */`
${NATURE_VCOMMON}
uniform vec3 uSun;
attribute vec3 iCenter;
attribute vec4 iPuff;     // the puff's ball: centre (mesh space) + radius
attribute vec4 iCard;     // x: rotation, y: size, z: aspect, w: atlas cell
attribute vec4 iShade;    // x: height in the plant 0..1, y: AO 0..1, z: tint, w: seed
attribute vec4 iCN;       // xyz: the whole crown's normal here, w: the puff's height / width
attribute vec4 iBase;     // plant foot + scale; (0,0,0,1) for a single plant
varying vec2 vUv;
varying vec3 vCard;
varying vec4 vPuff;
varying vec3 vRight;
varying vec3 vUp;
varying vec4 vRS;
varying vec3 vSun;
varying vec4 vCN;
varying vec4 vShade;
void main() {
  float ph = objPhase() + iBase.x * 0.37 + iBase.z * 0.23;
  float sc = objScale();
  vec3 c = iCenter + windOffset((iCenter - iBase.xyz) / iBase.w, ph) * iBase.w;
  vec3 pc = iPuff.xyz + windOffset((iPuff.xyz - iBase.xyz) / iBase.w, ph) * iBase.w;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float fl = uWind * (0.25 + iShade.x) * 0.02 * iBase.w;
  mv.xy += vec2(sin(uTime * 2.1 + iShade.w * 140.0 + ph), sin(uTime * 2.7 + iShade.w * 90.0) * 0.5) * fl * sc;
  float cs = cos(iCard.x), sn = sin(iCard.x);
  vec2 hs = vec2(iCard.z, 1.0 / iCard.z) * iCard.y;
  vec2 q = position.xy * hs * sc;
  mv.xy += vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);          // camera-facing card
  vHaze = hazeAt(mv.xyz);
  gl_Position = projectionMatrix * mv;
  vUv = uv * 0.5 + vec2(mod(iCard.w, 2.0), floor(iCard.w / 2.0)) * 0.5;
  mat3 mvm = mat3(modelViewMatrix);
  vRight = normalize(vec3(1.0, 0.0, 0.0) * mvm);                   // the screen's right and up, in mesh space
  vUp = normalize(vec3(0.0, 1.0, 0.0) * mvm);
  vSun = normalize(uSun * mat3(modelMatrix));
  vCard = c;
  vPuff = vec4(pc, iPuff.w);
  vRS = vec4(cs, sn, hs);
  vCN = iCN;
  vShade = iShade;
}`;

const LEAF_FS = /* glsl */`
${NATURE_HAZEF}
uniform sampler2D uMask;
uniform vec3 uC0, uC1, uC2, uC3, uC4;
uniform vec4 uStep;       // where each flat tone starts
uniform float uCrownMix, uLightW, uHeightW, uAOW, uLeafTint, uSkyW;
#ifdef BLOSSOM
uniform sampler2D uCentre;
uniform vec3 uCentreCol;
#endif
varying vec2 vUv;
varying vec3 vCard;
varying vec4 vPuff;
varying vec3 vRight;
varying vec3 vUp;
varying vec4 vRS;
varying vec3 vSun;
varying vec4 vCN;
varying vec4 vShade;
void main() {
  vec3 t = texture2D(uMask, vUv).rgb;
  float w = max(fwidth(t.r), 1e-3) * 0.75;
  float alpha = smoothstep(0.5 - w, 0.5 + w, t.r);
  if (alpha < 0.02) discard;
  // this leaf's middle, in mesh space: every pixel of one leaf is lit alike
  vec2 lc = t.gb / max(t.r, 0.05);
  vec2 lq = (lc - 0.5) * vRS.zw;
  vec3 p = vCard + vRight * (vRS.x * lq.x - vRS.y * lq.y) + vUp * (vRS.y * lq.x + vRS.x * lq.y);
  // the puff's ball lends its normal (an ellipsoid: flatter than it is wide), with a little of the whole crown's
  vec3 d = p - vPuff.xyz;
  vec3 n = normalize(vec3(d.x, d.y / (vCN.w * vCN.w), d.z));
  n = normalize(mix(n, normalize(vCN.xyz), uCrownMix));
  float lam = dot(n, vSun) * 0.5 + 0.5;
  float leaf = fract(dot(lc, vec2(17.31, 31.73)) + vShade.w * 7.0) - 0.5;
  float v = lam * uLightW + vShade.x * uHeightW - vShade.y * uAOW + vShade.z + leaf * uLeafTint + max(n.y, 0.0) * uSkyW;   // (uSkyW: light from the sky on what faces up, in the shade too)
  vec3 col = uC0;                                                   // Color Ramp, constant
  col = mix(col, uC1, step(uStep.x, v));
  col = mix(col, uC2, step(uStep.y, v));
  col = mix(col, uC3, step(uStep.z, v));
  col = mix(col, uC4, step(uStep.w, v));
#ifdef BLOSSOM
  col = mix(col, uCentreCol * (0.72 + 0.28 * step(uStep.y, v)), smoothstep(0.35, 0.6, texture2D(uCentre, vUv).r));
#endif
  gl_FragColor = vec4(mix(col, uHaze, vHaze), alpha);
}`;

// falling leaves: each one drops from a spot in the crown, sways and tumbles downwind, fades, and starts again.
// All in the shader from the time: nothing to update per frame.
const FALL_VS = /* glsl */`
${NATURE_VCOMMON}
attribute vec3 iSpawn;
attribute vec4 iPar;      // x: phase 0..1, y: fall speed, z: sway rate, w: size
attribute float iTone;
attribute float iGround;  // the ground's height under the tree
varying vec2 vUv;
varying float vA;
varying float vTone;
varying float vSide;
void main() {
  float life = (iSpawn.y - iGround) / iPar.y + 1.2;
  float t = fract(uTime / life + iPar.x), age = t * life;
  vec3 p = iSpawn;
  p.y = max(p.y - iPar.y * age, iGround + 0.04);
  float s = iPar.z;
  p.x += (0.25 + 0.75 * uWind) * age * 0.55 + sin(age * s + iPar.x * 6.28) * 0.45;
  p.z += cos(age * s * 0.8 + iPar.x * 9.0) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float a = age * (1.2 + s * 0.4) + iPar.x * 6.28;
  float tumble = cos(age * s * 1.3 + iPar.x * 4.0);
  vec2 q = position.xy * iPar.w * objScale();
  q.x *= abs(tumble) * 0.85 + 0.15;
  mv.xy += vec2(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
  vHaze = hazeAt(mv.xyz);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vA = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.86, 1.0, t));
  vTone = iTone;
  vSide = step(0.0, tumble);
}`;
const FALL_FS = /* glsl */`
${NATURE_HAZEF}
uniform vec3 uC1, uC2, uC3;
varying vec2 vUv;
varying float vA;
varying float vTone;
varying float vSide;
void main() {
  // one pointed leaf drawn straight from the uv: stalk at the bottom, tip at the top
  float y = vUv.y, x = abs(vUv.x - 0.5) * 2.0;
  float hw = 0.62 * pow(sin(3.14159 * clamp(y, 0.0, 1.0)), 0.8) * (1.0 - 0.35 * y);
  float e = hw - x;
  float w = max(fwidth(e), 1e-3);
  float a = smoothstep(-w, w, e) * vA;
  if (a < 0.02) discard;
  vec3 col = mix(uC2, uC3, vTone);
  col = mix(uC1, col, 0.35 + 0.65 * vSide);          // the leaf's back, as it turns, is a tone darker
  gl_FragColor = vec4(mix(col, uHaze, vHaze), a);
}`;

// one leaf material and one falling-leaf material per palette and mask, shared by every plant
const mats = {};
function materials(palette, mask = 'leaf') {
  const pk = ANIME_PALETTES[palette] ? palette : 'game', key = pk + '/' + mask;
  if (mats[key]) return mats[key];
  const pal = ANIME_PALETTES[pk].tones.map(rgb), st = ANIME_PALETTES[pk].steps, W = ANIME_PALETTES[pk].weights || {};      // weights: how much the sun, the height in the plant and the shade among the puffs move a leaf's tone
  const U = { ...natureUniforms, uSun: SUN, uC0: { value: pal[0] }, uC1: { value: pal[1] }, uC2: { value: pal[2] }, uC3: { value: pal[3] }, uC4: { value: pal[4] } };
  const leaf = new THREE.ShaderMaterial({
    uniforms: {
      ...U, uMask: { value: clusterMask(mask) },
      uStep: { value: new THREE.Vector4(...st) },
      uCrownMix: { value: 0.3 }, uLightW: { value: W.light ?? 0.85 }, uHeightW: { value: W.height ?? 0.28 }, uAOW: { value: W.ao ?? 0.5 }, uLeafTint: { value: W.tint ?? 0.08 }, uSkyW: { value: W.sky ?? 0 },
    },
    vertexShader: LEAF_VS, fragmentShader: LEAF_FS, alphaToCoverage: true, side: THREE.DoubleSide,
  });
  if (mask === 'blossom') {
    leaf.defines = { BLOSSOM: 1 };
    leaf.uniforms.uCentre = { value: masks['blossom/centre'] };
    leaf.uniforms.uCentreCol = { value: rgb(ANIME_PALETTES[pk].centre || '#f7d24a') };
  }
  const fall = new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: FALL_VS, fragmentShader: FALL_FS, alphaToCoverage: true, side: THREE.DoubleSide });
  return (mats[key] = { leaf, fall });
}

// --------------------------------------------------------------------------
// the crown: cards over each puff's ball (step 2), with their light baked only where it never changes (AO, height)
// puffs: [{ c: Vector3, r, f, taper, egg }] (f: height / width; taper: narrower toward its top, egg: its top drawn up into
// a cone — the pine's skirts); env: the whole crown's ellipsoid { c, r } (Vector3s)
// --------------------------------------------------------------------------
// a puff's outline broken further (rough > 0): a second, tighter wave over its ball, the same for its leaves and its flowers
const roughAt = (d, pi) => Math.sin(d.x * 7.3 + pi * 2.1 + d.y * 4.1) * Math.sin(d.z * 6.9 + pi * 1.3 - d.y * 3.7);
function buildPuffs(rng, puffs, env, { leaf, density, floorY = -Infinity, hRange = [0, 1], upright = 0, aoMul = 1, rough = 0 }) {
  const top = P => P.c.y + P.r * P.f * (1 + (P.egg || 0));
  const yLo = Math.max(floorY, Math.min(...puffs.map(P => P.c.y - P.r * P.f))), yHi = Math.max(...puffs.map(top));
  // inside a puff's ball (k < 1 = shrunk toward its middle)
  const inside = (x, y, z, P, k) => {
    const dx = (x - P.c.x) / P.r, dy = (y - P.c.y) / (P.r * P.f), dz = (z - P.c.z) / P.r;
    return dx * dx + dy * dy + dz * dz < k * k;
  };
  // the AO's rays: a fixed fan over the upper half of a ball, turned onto each card's normal
  const FAN = [];
  for (let i = 0; i < 12; i++) {
    const y = 1 - (i + 0.5) / 12, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
    FAN.push(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
  }
  const reach = Math.max(...puffs.map(P => P.r)) / 1.3;          // AO rays scale with the puffs (a bush's are short)
  const STEPS = [[0.3, 1], [0.7, 0.8], [1.25, 0.6], [2.0, 0.4]].map(([s, w]) => [s * Math.min(1, reach), w]);
  const STEP_SUM = STEPS.reduce((s, [, w]) => s + w, 0);
  const tmp = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const ao = (p, n) => {
    tA.crossVectors(Math.abs(n.y) < 0.9 ? up : tmp.set(1, 0, 0), n).normalize();
    tB.crossVectors(n, tA);
    let occ = 0;
    for (const f of FAN) {
      const dx = tA.x * f.x + n.x * f.y + tB.x * f.z, dy = tA.y * f.x + n.y * f.y + tB.y * f.z, dz = tA.z * f.x + n.z * f.y + tB.z * f.z;
      for (const [s, w] of STEPS) {
        const x = p.x + dx * s, y = p.y + dy * s, z = p.z + dz * s;
        if (y < floorY || puffs.some(P => inside(x, y, z, P, 0.86))) { occ += w; break; }      // the ground shades too
      }
    }
    return Math.min(1, occ / (FAN.length * STEP_SUM) * 2.2);
  };

  const C = [], PF = [], K = [], SH = [], CN = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3();
  puffs.forEach((P, pi) => {
    const others = puffs.filter((_, j) => j !== pi);
    const taper = P.taper || 0, egg = P.egg || 0;
    const N = Math.round(ellipsoidArea(P.r, P.r * P.f * (1 + egg * 0.5), P.r) * density), inner = Math.round(N * 0.22);
    for (let j = 0; j < N + inner; j++) {
      const deep = j >= N;                                  // a few leaves deep inside: a gap shows leaves in shade, never sky
      const m = deep ? inner : N, jj = deep ? j - N : j;
      const y0 = 1 - 2 * (jj + 0.5) / m, rr = Math.sqrt(1 - y0 * y0), phi = jj * 2.39996 + rng() * 0.6;
      d.set(Math.cos(phi) * rr + (rng() - 0.5) * 0.25, y0 + (rng() - 0.5) * 0.2, Math.sin(phi) * rr + (rng() - 0.5) * 0.25).normalize();
      // the ball's outline broken into bumps: a slow wave pushes leaves out or in
      const bump = Math.sin(d.x * 4.1 + pi * 1.7) * Math.sin(d.y * 3.7 + pi) * Math.sin(d.z * 4.3 + pi * 2.3);
      const depth = deep ? range(rng, 0.3, 0.62) : range(rng, 0.8, 1.02) + bump * 0.12 + rough * roughAt(d, pi);
      const up01 = Math.max(d.y, 0), k = 1 - taper * up01;
      p.set(d.x * P.r * depth * k, d.y * P.r * P.f * depth * (1 + egg * up01), d.z * P.r * depth * k).add(P.c);
      if (p.y < floorY + leaf * 0.3) continue;                                     // nothing under the ground
      if (!deep && others.some(Q => inside(p.x, p.y, p.z, Q, 0.8))) continue;     // buried in a neighbour: never seen
      tmp.copy(p).sub(env.c).divide(env.r);
      if (env.hollow !== false && tmp.length() < 0.42) continue;                    // deep in the crown: never seen
      n.set(d.x, d.y / P.f, d.z).normalize();
      const h = hRange[0] + (hRange[1] - hRange[0]) * THREE.MathUtils.clamp((p.y - yLo) / (yHi - yLo), 0, 1);
      const o = (deep ? 1 : ao(p, n)) * aoMul;
      tmp.copy(p).sub(env.c).divide(env.r).divide(env.r).normalize();             // the crown's own normal here
      C.push(p.x, p.y, p.z);
      PF.push(P.c.x, P.c.y, P.c.z, P.r);
      K.push(upright ? (rng() - 0.5) * upright : rng() * Math.PI * 2, leaf * range(rng, 0.85, 1.2) * (deep ? 1.25 : 1), range(rng, 1, 1.18), Math.floor(rng() * 4));
      SH.push(h, o, (rng() - 0.5) * 0.06, rng());
      CN.push(tmp.x, tmp.y, tmp.z, P.f);
    }
  });
  // where a leaf can drop clear of the rest (the crown's lower outer leaves): the falling leaves start there
  const drop = [];
  for (let i = 0; i < C.length / 3; i++) if (SH[i * 4] < 0.55 && SH[i * 4 + 1] < 0.35) drop.push(i);
  return { C, PF, K, SH, CN, drop };
}

function cardGeometry({ C, PF, K, SH, CN, B = null }) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  const n = C.length / 3;
  let base = B ? new Float32Array(B) : null;
  if (!base) { base = new Float32Array(n * 4); for (let i = 3; i < base.length; i += 4) base[i] = 1; }
  g.setAttribute('iCenter', new THREE.InstancedBufferAttribute(new Float32Array(C), 3));
  g.setAttribute('iPuff', new THREE.InstancedBufferAttribute(new Float32Array(PF), 4));
  g.setAttribute('iCard', new THREE.InstancedBufferAttribute(new Float32Array(K), 4));
  g.setAttribute('iShade', new THREE.InstancedBufferAttribute(new Float32Array(SH), 4));
  g.setAttribute('iCN', new THREE.InstancedBufferAttribute(new Float32Array(CN), 4));
  g.setAttribute('iBase', new THREE.InstancedBufferAttribute(base, 4));
  g.instanceCount = n;
  return g;
}

// falling leaves of one plant (spots in mesh space), or of many: S spawn xyz, P params, T tone, G ground
function addFalls(out, rng, cards, count, leaf, M = null, s = 1, ground = 0) {
  if (!cards.drop.length) return;
  const V = new THREE.Vector3(), k = leaf / 0.8;          // a small-leaved tree drops small leaves
  for (let i = 0; i < count; i++) {
    const j = cards.drop[Math.floor(rng() * cards.drop.length)];
    V.set(cards.C[j * 3], cards.C[j * 3 + 1], cards.C[j * 3 + 2]);
    if (M) V.applyMatrix4(M);
    out.S.push(V.x, V.y, V.z);
    out.P.push(rng(), range(rng, 0.55, 0.95), range(rng, 1.6, 3.0), range(rng, 0.17, 0.24) * k * s);
    out.T.push(rng()); out.G.push(ground);
  }
}
function fallGeometry({ S, P, T, G }) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  g.setAttribute('iSpawn', new THREE.InstancedBufferAttribute(new Float32Array(S), 3));
  g.setAttribute('iPar', new THREE.InstancedBufferAttribute(new Float32Array(P), 4));
  g.setAttribute('iTone', new THREE.InstancedBufferAttribute(new Float32Array(T), 1));
  g.setAttribute('iGround', new THREE.InstancedBufferAttribute(new Float32Array(G), 1));
  g.instanceCount = S.length / 3;
  return g;
}

// the whole crown's ellipsoid: the grown crown's own, or (the pine) the box round its puffs
function crownOf(spec, puffs) {
  if (spec.grow) return { c: new THREE.Vector3(...spec.grow.crown.c), r: new THREE.Vector3(...spec.grow.crown.r) };
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = lo.clone().negate();
  for (const P of puffs) {
    lo.min(new THREE.Vector3(P.c.x - P.r, P.c.y - P.r * P.f, P.c.z - P.r));
    hi.max(new THREE.Vector3(P.c.x + P.r, P.c.y + P.r * P.f * (1 + (P.egg || 0)), P.c.z + P.r));
  }
  return { c: lo.clone().add(hi).multiplyScalar(0.5), r: hi.clone().sub(lo).multiplyScalar(0.5), hollow: false };   // a spire: no hollow middle
}

// each limb's tip puff grown into a bough, as the spec's boughs says (see above the specs). Nothing is added toward the stem:
// the wood shows between the boughs.
function boughsOf(rng, tips, crown, B) {
  const out = [], pick = (n, p) => n[0] + (n[1] > n[0] && rng() < (p ?? 0.5) ? n[1] - n[0] : 0);
  for (const P of tips) {
    P.f = range(rng, ...B.canopy);                                  // the tip's own puff: a canopy over its sprays
    out.push(P);
    const dx = P.c.x - crown.c.x, dz = P.c.z - crown.c.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    let side = rng() < 0.5 ? 1 : -1;
    for (let j = 0, n = pick(B.side.n, B.side.p); j < n; j++, side = -side) {      // beside it, along the crown, a little lower and nearer the stem
      const o = P.r * range(rng, ...B.side.out);
      out.push({ c: new THREE.Vector3(P.c.x - uz * side * o - ux * P.r * 0.2, P.c.y - P.r * range(rng, ...B.side.drop), P.c.z + ux * side * o - uz * P.r * 0.2),
        r: P.r * range(rng, ...B.side.size), f: range(rng, B.canopy[0], B.canopy[1] + 0.1) });
    }
    for (let j = 0, n = pick(B.sprays.n, B.sprays.p); j < n; j++) {               // sprays hang round its outer, lower edge
      const a = Math.atan2(uz, ux) + (rng() - 0.5) * 3.6, o = P.r * range(rng, ...B.sprays.out);
      out.push({ c: new THREE.Vector3(P.c.x + Math.cos(a) * o, P.c.y - P.r * range(rng, ...B.sprays.drop), P.c.z + Math.sin(a) * o),
        r: P.r * range(rng, ...B.sprays.r), f: range(rng, ...B.sprays.f) });
    }
  }
  return out;
}

// one tree's wood and leaf cards (far: fewer, bigger cards)
function treeParts(type, seed, far = false) {
  const kind = KINDS[type] || KINDS.broadleaf, spec = kind.spec();
  const { trunk, tiers } = growTreeFrame(spec, seed);
  trunk.material.uniforms.uLight = SUN;                             // the bark is lit by the same sun
  const rng = mulberry32(seed * 131 + 7);
  const puffs = tiers.map(T => ({ c: new THREE.Vector3(...T.c), r: T.r[0] * (kind.wide || 1), f: T.r[1] / T.r[0] * (kind.thick || 1) / (kind.wide || 1),
    taper: T.taper || 0, egg: T.egg || 0 }));
  const leaf = kind.leaf * (far ? FAR_LEAF : 1);
  const crown = crownOf(spec, puffs);
  if (spec.boughs) puffs.splice(0, puffs.length, ...boughsOf(rng, puffs, crown, spec.boughs));
  const cards = buildPuffs(rng, puffs, crown, { leaf, density: densityFor(leaf), upright: kind.upright || 0,
    aoMul: kind.ao ?? 1, hRange: kind.hRange || [0, 1], rough: kind.rough || 0 });
  if (kind.unity) {                                                  // lit as one crown more than puff by puff
    const m = new THREE.Vector3(crown.c.x, crown.c.y - crown.r.y * 0.25, crown.c.z), u = kind.unity, PF = cards.PF;
    for (let i = 0; i < PF.length; i += 4) { PF[i] += (m.x - PF[i]) * u; PF[i + 1] += (m.y - PF[i + 1]) * u; PF[i + 2] += (m.z - PF[i + 2]) * u; }
  }
  return { kind, spec, trunk, cards, leaf, rng };
}
// a bush: puffs of small leaves, leaves all through (it is seen from above), smallest leaves of all. Small puffs, so the
// crevices between them show; the light up the bush is gentler than up a tree (it is short). Five shapes, so bushes side
// by side never read as one lump copied (the seed picks the shape, seed % 5, and throws its sizes):
//   dome      two puffs on top in a ring of lower ones (the first bush)
//   spread    low and wide: one flat middle in a wide ring, a few small ones trailing out at its foot
//   upright   tall and narrow: a ring at the foot, a middle tier, an uneven top of one or two puffs
//   leaning   lopsided: its mass on one side, falling away in smaller and lower puffs to the other
//   cluster   two or three small mounds side by side, ground showing between them
// Drawn at the first bush's measure (about 1.8 m) and shrunk by BUSH_SIZE.
export const BUSH_SHAPES = ['dome', 'spread', 'upright', 'leaning', 'cluster'];
function bushPuffs(shape, rng) {
  const P = [], add = (x, y, z, r, f = 0.86) => P.push({ c: new THREE.Vector3(x, y, z), r, f });
  const a0 = rng() * 6.28, s = range(rng, 0.9, 1.12), j = (v, k = 0.15) => v * range(rng, 1 - k, 1 + k);
  const ring = (n, d0, d1, y0, y1, r0, r1, f = 0.86, a = a0 + 0.6) => {
    for (let i = 0; i < n; i++) {
      const t = a + i / n * Math.PI * 2 + (rng() - 0.5) * 0.6, d = range(rng, d0, d1) * s;
      add(Math.cos(t) * d, range(rng, y0, y1), Math.sin(t) * d, range(rng, r0, r1) * s, f);
    }
  };
  if (shape === 'spread') {
    add(0, j(0.6), 0, j(0.62) * s, 0.68);
    ring(6 + (rng() < 0.5 ? 1 : 0), 0.95, 1.3, 0.34, 0.46, 0.42, 0.56, 0.72);
    ring(2 + (rng() < 0.5 ? 1 : 0), 1.55, 1.85, 0.2, 0.28, 0.28, 0.36, 0.75, a0 + 2);
  } else if (shape === 'upright') {
    // its puffs drawn up taller than wide and overlapping deep, tier into tier, so it reads as one column, not balls stacked
    ring(3 + (rng() < 0.5 ? 1 : 0), 0.36, 0.48, 0.5, 0.62, 0.46, 0.56, 1.05);
    add(0, j(0.98, 0.06), 0, j(0.5, 0.08) * s, 1.3);                          // a core through the middle: no waist
    ring(3, 0.14, 0.3, 0.95, 1.25, 0.44, 0.52, 1.25, a0 + 1.3);
    add(Math.cos(a0) * 0.14 * s, j(1.72, 0.06), Math.sin(a0) * 0.14 * s, j(0.38) * s, 1.25);
    if (rng() < 0.7) add(-Math.cos(a0) * 0.26 * s, j(1.48, 0.06), -Math.sin(a0) * 0.26 * s, j(0.34) * s, 1.2);     // a lower second top: never level
  } else if (shape === 'leaning') {
    const ux = Math.cos(a0), uz = Math.sin(a0), vx = -uz, vz = ux;            // u: the way it leans out of; v: across
    add(ux * 0.45 * s, j(1.02, 0.08), uz * 0.45 * s, j(0.64) * s);
    add(ux * 0.05 * s + vx * 0.3 * s, j(0.8, 0.08), uz * 0.05 * s + vz * 0.3 * s, j(0.54) * s);
    add(ux * 0.2 * s - vx * 0.4 * s, j(0.62, 0.08), uz * 0.2 * s - vz * 0.4 * s, j(0.48) * s);
    let d = 0.45, y = 0.58, r = 0.48;
    for (let i = 0; i < 3; i++) {                                              // falling away to the other side
      d += range(rng, 0.38, 0.48); y *= range(rng, 0.68, 0.8); r *= range(rng, 0.76, 0.86);
      const w = (rng() - 0.5) * 0.5;
      add(-ux * d * s + vx * w * s, y, -uz * d * s + vz * w * s, r * s, 0.82);
    }
    add(ux * 0.85 * s, 0.42, uz * 0.85 * s, j(0.42) * s);                      // and its foot on the heavy side
  } else if (shape === 'cluster') {
    const n = 2 + (rng() < 0.55 ? 1 : 0);
    for (let m = 0; m < n; m++) {
      const t = a0 + m / n * Math.PI * 2 + (rng() - 0.5) * 0.5, d = (n === 2 ? 0.62 : 0.78) * s;
      const cx = Math.cos(t) * d, cz = Math.sin(t) * d, big = m === 0 ? 1 : range(rng, 0.68, 0.85);
      add(cx, j(0.74) * big, cz, j(0.5) * s * big);
      for (let i = 0; i < 2 + (rng() < 0.5 ? 1 : 0); i++) {
        const u = rng() * 6.28, e = range(rng, 0.32, 0.44) * s * big;
        add(cx + Math.cos(u) * e, j(0.38) * big, cz + Math.sin(u) * e, j(0.36) * s * big);
      }
    }
  } else {                                                                     // dome
    add(Math.cos(a0) * 0.22 * s, 1.08, Math.sin(a0) * 0.22 * s, 0.62 * s);
    add(-Math.cos(a0) * 0.38 * s, 0.92, -Math.sin(a0) * 0.38 * s, 0.54 * s);
    ring(4 + (rng() < 0.5 ? 1 : 0), 0.75, 1.0, 0.45, 0.6, 0.46, 0.6);
  }
  return P;
}
function bushParts(seed, far = false, bloom = false) {
  const rng = mulberry32(seed * 104729 + 11), K = BUSH_SIZE;
  const shape = BUSH_SHAPES[((seed % BUSH_SHAPES.length) + BUSH_SHAPES.length) % BUSH_SHAPES.length];
  const puffs = bushPuffs(shape, rng);
  for (const P of puffs) { P.c.multiplyScalar(K); P.r *= K; }
  // the whole bush's ellipsoid: the box round its puffs (each leaf leans a little toward its normal)
  const lo = new THREE.Vector3(Infinity, 0, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const P of puffs) {
    lo.min(new THREE.Vector3(P.c.x - P.r, 0, P.c.z - P.r));
    hi.max(new THREE.Vector3(P.c.x + P.r, P.c.y + P.r * P.f, P.c.z + P.r));
  }
  const env = { c: lo.clone().add(hi).multiplyScalar(0.5), r: hi.clone().sub(lo).multiplyScalar(0.5) };
  const leaf = BUSH_LEAF * K * (far ? FAR_LEAF : 1);
  const cards = buildPuffs(rng, puffs, env, { leaf, density: densityFor(leaf), floorY: 0, hRange: [0.25, 0.7], rough: BUSH_ROUGH, aoMul: 0.8 });
  // lit as one mass more than puff by puff: the ball each leaf takes its light from is drawn toward the bush's middle, low
  // down, so the bush has one sunlit side and one shaded side, and its puffs only ripple that
  const mass = new THREE.Vector3(env.c.x, env.c.y * 0.35, env.c.z);
  const asOne = c => { for (let i = 0; i < c.PF.length; i += 4) { c.PF[i] += (mass.x - c.PF[i]) * BUSH_UNITY; c.PF[i + 1] += (mass.y - c.PF[i + 1]) * BUSH_UNITY; c.PF[i + 2] += (mass.z - c.PF[i + 2]) * BUSH_UNITY; } return c; };
  return { cards: asOne(cards), leaf, shape, height: hi.y + leaf * 0.5, bloom: bloom ? asOne(bloomParts(seed, puffs, env, far)) : null };
}

// a flowering bush's flowers: open flowers about two leaves across (one to three to a card, now and then a bud), sitting on
// its outer leaves and lit as the leaves round them are. They gather in a few drifts over the bush's upper part, as a shrub
// in flower has them, with the leaves plain between; never under it or down in a crevice. Their own dice, so the bush under
// them is the same bush as the plain one of that seed
const BLOOM = { card: 0.44, per: 2.4, drifts: [3, 5], most: 28 };      // card size (m) and cards per m² of a puff's upper half, at the first bush's measure
function bloomParts(seed, puffs, env, far = false) {
  const rng = mulberry32(seed * 7919 + 5), K = BUSH_SIZE;
  const inside = (x, y, z, P, k) => { const dx = (x - P.c.x) / P.r, dy = (y - P.c.y) / (P.r * P.f), dz = (z - P.c.z) / P.r; return dx * dx + dy * dy + dz * dz < k * k; };
  const drifts = [], nd = Math.round(range(rng, ...BLOOM.drifts));
  for (let i = 0; i < nd; i++) { const y = range(rng, 0.25, 1), rr = Math.sqrt(1 - y * y), a = rng() * 6.28; drifts.push(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr)); }
  const yHi = Math.max(...puffs.map(P => P.c.y + P.r * P.f));
  const card = BLOOM.card * BLOOM_SIZE * (far ? FAR_LEAF : 1), gap = card * 0.62;
  const C = [], PF = [], KK = [], SH = [], CN = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3(), w = new THREE.Vector3();
  puffs.forEach((P, pi) => {
    const n = Math.round(2 * Math.PI * (P.r / K) ** 2 * BLOOM.per * range(rng, 0.7, 1.2) * (far ? 0.6 : 1));
    for (let j = 0, got = 0; j < n * 40 && got < n; j++) {
      if (C.length / 3 >= BLOOM.most) break;
      const y = range(rng, 0, 1), rr = Math.sqrt(1 - y * y), a = rng() * Math.PI * 2;
      d.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      const depth = 1.05 + BUSH_ROUGH * roughAt(d, pi);                           // on the leaves, wherever the outline has them
      p.set(d.x * P.r * depth, d.y * P.r * P.f * depth, d.z * P.r * depth).add(P.c);
      if (p.y < 0.35 * K) continue;
      if (puffs.some(Q => Q !== P && inside(p.x, p.y, p.z, Q, 0.98))) continue;     // in a crevice: hidden
      w.copy(p).sub(env.c).normalize();
      const near = Math.max(...drifts.map(D => D.dot(w)));                         // in a drift, or (rarely) between them
      if (rng() > 0.05 + 0.95 * THREE.MathUtils.smoothstep(near, 0.5, 0.9)) continue;
      let close = false;
      for (let q = 0; q < C.length; q += 3) if (Math.hypot(C[q] - p.x, C[q + 1] - p.y, C[q + 2] - p.z) < gap) { close = true; break; }
      if (close) continue;                                                         // not one on another
      got++;
      const h = 0.4 + 0.4 * THREE.MathUtils.clamp(p.y / yHi, 0, 1);
      C.push(p.x, p.y, p.z);
      PF.push(P.c.x, P.c.y, P.c.z, P.r);
      KK.push(rng() * Math.PI * 2, card * range(rng, 0.78, 1.12), 1, Math.floor(rng() * 4));
      SH.push(h, 0.25 * (1 - Math.max(d.y, 0)), (rng() - 0.5) * 0.06, rng());
      w.copy(p).sub(env.c).divide(env.r).divide(env.r).normalize();
      CN.push(w.x, w.y, w.z, P.f);
    }
  });
  return { C, PF, K: KK, SH, CN, drop: [] };
}

function leafMeshes(rng, cards, palette, mask, falling, fallCount, leaf) {
  const M = materials(palette, mask);
  const leaves = new THREE.Mesh(cardGeometry(cards), M.leaf);
  let fall = null;
  if (fallCount) {
    const f = { S: [], P: [], T: [], G: [] };
    addFalls(f, rng, cards, fallCount, leaf);
    fall = new THREE.Mesh(fallGeometry(f), M.fall);
    fall.frustumCulled = false; fall.visible = falling; fall.name = 'anime_falling';
  }
  leaves.frustumCulled = false; leaves.name = 'anime_leaves';
  return { leaves, fall };
}

// --------------------------------------------------------------------------
export function createAnimeTree({ type = 'broadleaf', seed = 1, falling = true } = {}) {
  const { kind, spec, trunk, cards, leaf, rng } = treeParts(type, seed);
  const { leaves, fall } = leafMeshes(rng, cards, kind.palette, kind.mask, falling, kind.fall, leaf);
  const group = new THREE.Group();
  group.add(trunk, leaves);
  if (fall) group.add(fall);
  group.name = 'anime_tree_' + type;
  group.userData = {
    kind: 'tree', type, height: spec.height, cards: leaves.geometry.instanceCount,
    setFalling(on) { if (fall) fall.visible = !!on; },
    dispose() { trunk.geometry.dispose(); trunk.material.dispose(); leaves.geometry.dispose(); if (fall) fall.geometry.dispose(); },
  };
  return group;
}

export function createAnimeBush({ seed = 3, bloom = null } = {}) {
  const { cards, leaf, shape, height, bloom: flowers } = bushParts(seed, false, !!bloom);
  const { leaves } = leafMeshes(mulberry32(seed), cards, 'game', 'leaf', false, 0, leaf);
  const group = new THREE.Group();
  group.add(leaves);
  let heads = null;
  if (flowers) {
    heads = new THREE.Mesh(cardGeometry(flowers), materials('bloom-' + (BLOOM_COLORS.includes(bloom) ? bloom : 'pink'), 'blossom').leaf);
    heads.frustumCulled = false; heads.name = 'anime_blossoms';
    group.add(heads);
  }
  group.name = 'anime_bush';
  group.userData = { kind: 'bush', type: bloom ? 'flowering' : 'anime', bloom, shape, height, cards: leaves.geometry.instanceCount + (heads ? heads.geometry.instanceCount : 0),
    setFalling() {}, dispose() { leaves.geometry.dispose(); if (heads) heads.geometry.dispose(); } };
  return group;
}

// --------------------------------------------------------------------------
// forest: every plant is one of a few shapes of its kind (built once, kept), copied into place, turned and sized
// --------------------------------------------------------------------------
const shapes = {};
const shapeOf = (kind, type, v, far) => {
  const key = kind + '/' + type + '/' + v + (far ? '/far' : '');
  return shapes[key] || (shapes[key] = kind === 'bush' ? bushParts(v + 1, far, type === 'flowering') : treeParts(type, v + 1, far));
};

export function createAnimeForest(list) {
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S3 = new THREE.Vector3(), T3 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const leafB = {}, barkB = {}, fallB = {};
  const rng = mulberry32(list.length * 7 + 3);
  for (const e of list) {
    const bush = e.kind === 'bush', s = e.scale ?? 1, far = (e.detail ?? 1) < 0.8, v = Math.abs(Math.round(e.seed ?? 0)) % (bush ? BUSH_VARIANTS : VARIANTS);
    const type = bush ? (e.type === 'flowering' ? 'flowering' : 'bush') : (KINDS[e.type] ? e.type : 'broadleaf');
    const part = shapeOf(bush ? 'bush' : 'tree', type, v, far);
    const palette = bush ? 'game' : part.kind.palette, mask = bush ? 'leaf' : (part.kind.mask || 'leaf');
    M.compose(T3.set(e.x, e.y, e.z), Q.setFromAxisAngle(UP, e.rotY ?? 0), S3.set(s, s, s));
    const key = palette + '/' + mask;
    const b = leafB[key] || (leafB[key] = { palette, mask, C: [], PF: [], K: [], SH: [], CN: [], B: [] });
    const c = part.cards, n = c.C.length / 3;
    for (let i = 0; i < n; i++) {
      V.set(c.C[i * 3], c.C[i * 3 + 1], c.C[i * 3 + 2]).applyMatrix4(M); b.C.push(V.x, V.y, V.z);
      V.set(c.PF[i * 4], c.PF[i * 4 + 1], c.PF[i * 4 + 2]).applyMatrix4(M); b.PF.push(V.x, V.y, V.z, c.PF[i * 4 + 3] * s);
      b.K.push(c.K[i * 4], c.K[i * 4 + 1] * s, c.K[i * 4 + 2], c.K[i * 4 + 3]);
      b.SH.push(c.SH[i * 4], c.SH[i * 4 + 1], c.SH[i * 4 + 2], c.SH[i * 4 + 3]);
      V.set(c.CN[i * 4], c.CN[i * 4 + 1], c.CN[i * 4 + 2]).applyQuaternion(Q); b.CN.push(V.x, V.y, V.z, c.CN[i * 4 + 3]);
      b.B.push(e.x, e.y, e.z, s);
    }
    if (bush && part.bloom) {                                         // its flowers, in the colour its seed picks
      const col = BLOOM_COLORS[Math.abs((Math.floor(e.x / 18) * 73856093) ^ (Math.floor(e.z / 18) * 19349663)) % BLOOM_COLORS.length];   // (a neighbourhood, 18 m, flowers in one colour)
      const fk = 'bloom-' + col + '/blossom';
      const fb = leafB[fk] || (leafB[fk] = { palette: 'bloom-' + col, mask: 'blossom', C: [], PF: [], K: [], SH: [], CN: [], B: [] });
      const f = part.bloom, nf = f.C.length / 3;
      for (let i = 0; i < nf; i++) {
        V.set(f.C[i * 3], f.C[i * 3 + 1], f.C[i * 3 + 2]).applyMatrix4(M); fb.C.push(V.x, V.y, V.z);
        V.set(f.PF[i * 4], f.PF[i * 4 + 1], f.PF[i * 4 + 2]).applyMatrix4(M); fb.PF.push(V.x, V.y, V.z, f.PF[i * 4 + 3] * s);
        fb.K.push(f.K[i * 4], f.K[i * 4 + 1] * s, f.K[i * 4 + 2], f.K[i * 4 + 3]);
        fb.SH.push(f.SH[i * 4], f.SH[i * 4 + 1], f.SH[i * 4 + 2], f.SH[i * 4 + 3]);
        V.set(f.CN[i * 4], f.CN[i * 4 + 1], f.CN[i * 4 + 2]).applyQuaternion(Q); fb.CN.push(V.x, V.y, V.z, f.CN[i * 4 + 3]);
        fb.B.push(e.x, e.y, e.z, s);
      }
    }
    if (bush) continue;
    const g = part.trunk.geometry.clone();
    g.applyMatrix4(M);
    if (g.attributes.aCtr) g.attributes.aCtr.applyMatrix4(M);
    if (g.attributes.aAx) g.attributes.aAx.applyMatrix4(M);
    const ab = g.attributes.aBase;
    for (let i = 0; i < ab.count; i++) ab.setXYZW(i, e.x, e.y, e.z, s);
    (barkB[type] || (barkB[type] = { mat: part.trunk.material, geos: [] })).geos.push(g);
    if (!far && part.kind.fall) {                                     // the near trees drop leaves (half as many as a lone tree)
      const f = fallB[palette] || (fallB[palette] = { S: [], P: [], T: [], G: [] });
      addFalls(f, rng, c, Math.ceil(part.kind.fall * 0.5), part.leaf, M, s, e.y);
    }
  }
  const group = new THREE.Group(), owned = [];
  const add = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.name = name; group.add(m); owned.push(geo); };
  for (const [type, { mat, geos }] of Object.entries(barkB)) { add(mergeGeometries(geos), mat, 'anime_bark_' + type); geos.forEach(g => g.dispose()); }
  let cards = 0;
  for (const b of Object.values(leafB)) { add(cardGeometry(b), materials(b.palette, b.mask).leaf, 'anime_leaves'); cards += b.C.length / 3; }
  for (const [palette, f] of Object.entries(fallB)) if (f.S.length) add(fallGeometry(f), materials(palette).fall, 'anime_falling');
  group.name = 'anime_forest';
  group.userData = { kind: 'forest', plants: list.length, cards, drawCalls: group.children.length, dispose() { owned.forEach(o => o.dispose()); } };
  return group;
}
