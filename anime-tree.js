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
   createAnimeBush({ seed, bloom, clump }) -> Group       its shape (one of BUSH_SHAPES) from the seed; clump: a flowering clump;
                                                    bloom: 'pink' | 'white' | 'yellow' | 'lilac' | 'blue' (a flowering bush:
                                                    the same bush, with heads of small flowers sitting in its leaves) or none
   createAnimeForest([{ kind: 'tree' | 'bush', type, seed, detail, x, y, z, rotY, scale, bloom }, ...]) -> Group
        a bush of type 'flowering' flowers, in one of BLOOM_COLORS: its own (bloom), or the same for every bush of a
        neighbourhood; of type 'clump' it is a flowering clump (a low leafy mound, larger leaves, flowers all over its
        top: planted small, among the meadow's flowers)
        many plants in a few draw calls (one per leaf look, one per bark, one for the falling leaves). Each kind is built
        in VARIANTS shapes (picked by seed) and copied into place, turned and sized; detail under 0.8 (trees she never
        comes near) uses fewer, bigger leaf cards.
   setAnimeSun(vec3)       world direction toward the sun: every anime plant's leaves and bark follow it live
                           (never from below the horizon: at night the plants keep a low light)
   setAnimeFarLeaves(on)   away from the eye, leaves that lie behind others are not drawn, and far off fewer are (on, as it
                           starts); off: every leaf of every plant is drawn at any distance (see FAR_LEAVES)
   setAnimeBrush(on)       the leaves as a brush lays them (on, as it starts; off: as they were): see BRUSH
   every frame: stylized-nature's update(dt) (time + wind are shared with the other plants)
   Low leaves part round whoever walks through them (stylized-nature's setWalker): a flowering clump is walked through.
   ========================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, uniforms as natureUniforms, growTreeFrame, treeSpec, setDryness, NATURE_VCOMMON, NATURE_HAZEF, _internal as natureInternal } from './stylized-nature.js';

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

// Leaves that cannot be seen are not drawn. A crown is some thirty leaf cards deep wherever it is looked at, and a phone
// shades every one of them, the hidden ones too (a card has holes, so the phone cannot skip what lies behind it): a wood
// seen from a hill, tree behind tree, was by far the costliest thing on screen. Two savings, both by how far off a plant
// is for its size (metres per unit of its size: a tree twice as big is treated alike twice as far off):
//   x..y   the cards that lie behind enough others, seen from where the eye is, shrink away (hiddenFrom: worked out for
//          every card as a tree is built, from sixteen sides round it). Nothing that is seen goes: a birch, whose far
//          side shows between its boughs, keeps it.
//   z..w   of the rest, fewer are drawn, each a little larger (FAR_KEEP: the share still drawn at w and beyond, and how
//          much larger): far off, a leaf is smaller than a dot of the screen
// Nearer than x every leaf is drawn (under a crown, looking up, too). setAnimeFarLeaves(false) draws every leaf anywhere.
// Both shrink a card to nothing in the shader: the phone shades none of it, but is still sent it and still works out where
// it would stand, and from most places well over half the cards sent were such, or stood out of view. So a forest can keep
// its cards in cells (createAnimeForest(list, { cell }): the plants of one square of ground, of one palette, are one mesh),
// each cell's cards in the order of their own numbers (the z..w saving goes by that number: the low ones stay), and
// forest.userData.lod(eye, frustum, mirrorY), called each frame, draws of each cell only as many cards, from the front, as
// its nearest plant still shows (the rest are the ones that had shrunk to nothing), and no cell that has no plant in view
// (nor mirrored in the water at mirrorY). The picture is the same; a third to a quarter of the cards are sent.
// The wood goes with them: in a forest kept in cells, a cell's trunks and limbs are one mesh too, not drawn out of view, and
// from further off drawn plainer, in two steps (for the tree's size): past WOOD_MID as MID_WOOD, past WOOD_FAR as FAR_WOOD.
// The same stem, limbs and roots, with fewer sides and rings: by 40 m a limb is a point or two thick and mostly in the
// leaves, and the stem a few points wide (its rings gathered at the foot, so it still swells into its roots); past 100 m
// the whole tree is a handful of points across. Under a third, then under a fifth, of the near wood's triangles, for wood
// that covers next to nothing of the screen.
// ?woodlod=old: as it was before (one step at 40 m, the stem never plainer), to compare
const OLD_WOOD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('woodlod') === 'old';
const MID_WOOD = OLD_WOOD ? { branchRadial: 4, branchLength: 5 }
  : { trunkRadial: 7, trunkLength: 10, trunkEase: 1.6, branchRadial: 4, branchLength: 3, rootRadial: 4, rootLength: 3 };
const FAR_WOOD = { trunkRadial: 5, trunkLength: 6, trunkEase: 1.8, branchRadial: 3, branchLength: 2, rootRadial: 3, rootLength: 2 };
const WOOD_MID = 40, WOOD_FAR = OLD_WOOD ? Infinity : 100;
const FAR_ON = [8, 13, 16, 48];
const FAR_LEAVES = { value: new THREE.Vector4(...FAR_ON) }, FAR_KEEP = { value: new THREE.Vector2(0.22, 1.25) };
export function setAnimeFarLeaves(on = true) { if (on) FAR_LEAVES.value.set(...FAR_ON); else FAR_LEAVES.value.set(1e6, 2e6, 1e6, 2e6); }

// BRUSH: the leaves as a brush lays them, as the grass's painterly look lays the meadow (stylized-grassfield.js). Two things
// change, and nothing is added to draw: the same cards, the same leaves on them, one flat tone each as before.
//   - the leaf clusters are brush dabs (the mask 'brush'): rounder and broader than pointed leaves, a little closer together,
//     their edges broken by the bristles, so a crown reads as soft heaped strokes of paint
//   - the tones run in strokes: where the light steps from one flat tone to the next is moved by long patches that lean the
//     same way all over the plant (strokeAt in the leaf's own shader), so a stroke of light or of shade runs over several
//     leaves at once; each leaf's own speck of tint is mostly left out
// Only the leafy plants (mask 'leaf'): needles and flowers stay as they are.
const BRUSH = { value: 1 };
export function setAnimeBrush(on = true) {
  BRUSH.value = on ? 1 : 0;
  for (const key in mats) if (key.endsWith('/leaf')) mats[key].leaf.uniforms.uMask.value = clusterMask(on ? 'brush' : 'leaf');
}
export const animeBrush = () => BRUSH.value > 0.5;

// DRYNESS: how dead the plants are, read from a picture laid over the land (the curse's mask: the red of each pixel, 0
// alive .. 1 dead), by where each leaf hangs. Drier: fewer leaves (each card's own number decides which go first, so a
// crown thins all over, not from one side), a little smaller, and in the dry tones; dead (1): no leaves at all. The
// falling leaves go brown with it, and a dead plant drops none. As it starts the picture is one black pixel: every plant
// alive, nothing changed.
//   stylized-nature's setDryness(texture, rect)   rect: [x0, z0, width, depth] of the land the picture covers (metres, world)
// A dead plant is not its limbs alone (a few thick sticks, far smaller than the crown was): it keeps its crown's shape, in
// bare twigs. TWIGS: a share of the leaf cards (TWIG.share: the ones with the lowest numbers, so a far crown keeps them
// all) carry a spray of twigs once their leaves are gone. Such a card is laid from inside its puff out to where its
// leaves were (rooted TWIG.root puff radii back toward the puff's middle, reaching TWIG.past of a card beyond: the crown
// keeps its size), turned so its spray points out of the crown as the eye sees it, in the dead wood's tones. A small
// puff has few cards: more of them carry twigs (up to TWIG.small times the share, for puffs under half a metre); a far
// crown keeps TWIG.far of its sprays (a haze of twigs: fewer do). They come a card at a time as the plant
// dries (each at its own dryness, between TWIG.from and TWIG.to), so a dying crown is brown leaves and bare twigs
// together. No card is added for it: the twigs are drawn on cards that would have shrunk to nothing, and their picture
// lies in the alpha of the leaves' own mask (twigAlpha). And the wood itself goes pale and grey, its bark peeling
// (stylized-nature's bark shader, DRYNESS, by the same picture).
const DRY_TONES = ['#3a2f24', '#5a4632', '#7d6243', '#a08356', '#c4aa78'];      // deep shade -> sunlit: dead leaves, ochre to grey-brown
const TWIG_TONES = ['#4a4541', '#69635b', '#8b857a'];                            // shade -> sunlit: bare twigs, a dry grey
const DEAD_WOOD = ['#b4aea2', '#918b81', '#69645f', '#cdc6b6', '#45413e'];       // dead wood: light, body, shade; bare wood where the bark has peeled; cracks
const TWIG = { share: 0.12, small: 1.5, far: 0.6, root: 0.86, past: 0.62, wide: 0.82, foot: 0.36, least: 1.7, from: 0.12, to: 0.72 };
const DRY = {
  uDryMap: natureUniforms.uDryMap, uDryRect: natureUniforms.uDryRect,      // (the picture is the kit's: the grass and the ground die by it too, stylized-nature's setDryness)
  uD0: { value: rgb(DRY_TONES[0]) }, uD1: { value: rgb(DRY_TONES[1]) }, uD2: { value: rgb(DRY_TONES[2]) }, uD3: { value: rgb(DRY_TONES[3]) }, uD4: { value: rgb(DRY_TONES[4]) },
  uT0: { value: rgb(TWIG_TONES[0]) }, uT1: { value: rgb(TWIG_TONES[1]) }, uT2: { value: rgb(TWIG_TONES[2]) },
  uTwigLay: { value: new THREE.Vector4(TWIG.root, TWIG.past, TWIG.wide, TWIG.least) },
  uTwigAt: { value: new THREE.Vector4(TWIG.from, TWIG.to, TWIG.foot, TWIG.far) },
};
// the same picture and the dead wood's tones, for the bark (stylized-nature's bark shader, DRYNESS)
const DRY_WOOD = { uDryMap: DRY.uDryMap, uDryRect: DRY.uDryRect, uDW0: { value: rgb(DEAD_WOOD[0]) }, uDW1: { value: rgb(DEAD_WOOD[1]) },
  uDW2: { value: rgb(DEAD_WOOD[2]) }, uDW3: { value: rgb(DEAD_WOOD[3]) }, uDW4: { value: rgb(DEAD_WOOD[4]) }, uDW5: { value: rgb(TWIG_TONES[1]) } };
export function setAnimeDryness(texture, rect) { setDryness(texture, rect); }      // (as it was called before the grass died by it too)
// a trunk's bark (stylized-nature's growTreeFrame) made to die by the same picture, in the same dead wood (the pines' too)
export function dyingWood(material) { Object.assign(material.uniforms, DRY_WOOD); material.defines = { ...material.defines, DRYNESS: 1 }; return material; }

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
function dabPath(g, L, W, rng) {                                   // a dab of the brush: round where it came down, drawn out a
  g.beginPath();                                                     // little the way it went, its edge broken by tufts of bristles
  g.ellipse(L * 0.5, 0, L * 0.5, W * 0.5, 0, 0, Math.PI * 2);
  for (let k = 0; k < 9; k++) {
    const a = rng() * Math.PI * 2, u = L * (0.5 + Math.cos(a) * 0.43), v = W * Math.sin(a) * 0.43;
    const rx = L * (0.09 + rng() * 0.08), ry = W * (0.13 + rng() * 0.1);
    g.moveTo(u + rx, v); g.ellipse(u, v, rx, ry, a * 0.3, 0, Math.PI * 2);
  }
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
// TWIGS (see DRYNESS): what a leaf card shows once its leaves are gone. Four sprays of bare twigs, one to a cell as the
// leaves' clusters are, each rooted at the middle of its cell's lower edge and reaching up to fill the cell. A spray is
// a twig: a leader that runs on in short straight lengths, turning a little at each joint and thinner as it goes, and
// at each joint a side twig, to one side and then the other, the lower ones longest, each a twig of the same kind (one
// upright, two leaning, one forked low into two leaders). -> its coverage, a byte a pixel, rows from the top
let twigs = null;
function twigAlpha(S, C) {
  if (twigs) return twigs;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), rng = mulberry32(8123), UP = -Math.PI / 2, THIN = 2.6;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * C, oy = Math.floor(v / 2) * C, pad = 12;
    // (a spray keeps inside a wedge, TWIG.foot of the cell wide at its foot and all of it at its top: its card is cut to
    // that wedge, so no card is drawn where no spray has a twig)
    const inside = (x, y) => y > pad && y < C - 2 && Math.abs(x - C / 2) < (TWIG.foot + (1 - TWIG.foot) * (1 - y / C)) * C / 2 - pad;
    g.save(); g.beginPath(); g.rect(ox + 5, oy, C - 10, C); g.clip();
    const twig = (x, y, dir, len, w, depth, side) => {
      const joints = depth === 0 ? 9 : depth === 3 ? 2 : Math.max(depth === 1 ? 3 : 2, Math.round(len / (C * 0.072))), step = len / joints;
      for (let j = 0; j < joints; j++) {
        const ww = Math.max(w * (1 - 0.62 * j / joints), THIN);
        let a = dir + (rng() - 0.5) * (depth === 0 ? 0.22 : 0.34), ex = x + Math.cos(a) * step, ey = y + Math.sin(a) * step;
        if (!inside(ex, ey)) {                                                // it would leave its cell: more upright and shorter, or it ends here
          a += (UP - a) * 0.6; ex = x + Math.cos(a) * step * 0.7; ey = y + Math.sin(a) * step * 0.7;
          if (!inside(ex, ey)) return;
        }
        g.lineWidth = ww;
        g.beginPath(); g.moveTo(ox + x, oy + y); g.lineTo(ox + ex, oy + ey); g.stroke();
        x = ex; y = ey; dir = a;
        if (depth < 3 && j < joints - 1 && (depth > 0 || j > 0)) {            // (the leader's first length is bare: it lies inside the crown)
          const reach = (len - step * (j + 1)) * range(rng, 0.7, 1) * (depth === 0 ? 0.86 : 0.8);
          if (reach > C * 0.03) twig(x, y, dir + side * range(rng, 0.52, 0.9), reach, Math.max(ww * 0.66, THIN), depth + 1, -side);
          side = -side;
        }
      }
    };
    if (v === 3) { twig(C / 2, C - 2, UP - 0.34, C * 0.9, 9, 0, -1); twig(C / 2, C - 2, UP + 0.3, C * 0.84, 8, 0, 1); }
    else twig(C / 2, C - 2, UP + [0, -0.16, 0.2][v], C * 0.95, 10, 0, v === 1 ? 1 : -1);
    g.restore();
  }
  const px = g.getImageData(0, 0, S, S).data, out = new Uint8Array(S * S);
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4];
  return (twigs = out);
}
function clusterMask(style) {
  if (masks[style]) return masks[style];
  const S = 1024, C = 512, rng = mulberry32(style === 'needle' ? 977 : style === 'blossom' ? 733 : style === 'brush' ? 5309 : 4211);
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
    } else if (style === 'brush') {
      // brush dabs (see BRUSH): fewer and broader than leaves, closer together, pointing out of the cluster as the leaves do
      const placed = [];
      for (let tries = 0; tries < 500 && placed.length < 19; tries++) {
        const L = C * range(rng, 0.2, 0.27), W = L * range(rng, 0.58, 0.74);
        const rr = C * 0.34 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        const bx = mid + Math.cos(a) * rr, by = mid + Math.sin(a) * rr;
        const dir = a + (rng() - 0.5) * 1.0 + (rr < C * 0.08 ? rng() * 6.28 : 0);
        const cx = bx + Math.cos(dir) * L * 0.5, cy = by + Math.sin(dir) * L * 0.5;
        const tx = bx + Math.cos(dir) * L * 1.05, ty = by + Math.sin(dir) * L * 1.05;
        if (Math.hypot(tx - mid, ty - mid) > C * 0.47) continue;
        if (placed.some(p => Math.hypot(p[0] - cx, p[1] - cy) < (p[2] + L) * 0.27)) continue;   // (less air than between leaves: dabs heap up)
        placed.push([cx, cy, L]);
        draw(ox, oy, bx, by, dir, L, W, cx, cy, (gg, l, w) => dabPath(gg, l, w, rng));
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
  let t;
  if (style === 'leaf' || style === 'brush') {
    // the leafy plants' mask carries the bare twigs too (see TWIGS), in its alpha: the picture's own bytes, rows from the
    // bottom as a texture's are, so nothing multiplies the leaves' colours by it
    const px = g.getImageData(0, 0, S, S).data, tw = twigAlpha(S, C), data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0, from = y * S * 4, to = (S - 1 - y) * S * 4; x < S; x++, from += 4, to += 4) {
      data[to] = px[from]; data[to + 1] = px[from + 1]; data[to + 2] = px[from + 2]; data[to + 3] = tw[y * S + x];
    }
    t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.generateMipmaps = true;
    t.needsUpdate = true;
  } else t = new THREE.CanvasTexture(cv);
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
uniform vec4 uWalker;     // her feet (world) + how far round her low leaves part (stylized-nature's setWalker)
uniform vec4 uFarLeaves;  // a far crown's leaves: x..y the hidden ones go, z..w the rest are fewer (see FAR_LEAVES)
uniform vec2 uFarKeep;    // x: the share still drawn far off, y: how much larger those are
attribute vec3 iCenter;
attribute vec4 iPuff;     // the puff's ball: centre (mesh space) + radius
attribute vec4 iCard;     // x: rotation, y: size, z: aspect, w: atlas cell
attribute vec4 iShade;    // x: height in the plant 0..1, y: AO 0..1, z: tint, w: seed
attribute vec4 iCN;       // xyz: the whole crown's normal here, w: the puff's height / width
attribute vec4 iBase;     // plant foot + scale; (0,0,0,1) for a single plant
attribute float iHid;     // from which eighths of the compass this card lies behind others: a bit each (hiddenFrom)
uniform sampler2D uDryMap;  // DRYNESS: how dead the land is here (red), over the rect uDryRect
uniform vec4 uDryRect;
uniform vec2 uTwigs;      // TWIGS: x: the share of the cards that carry bare twigs once their leaves are gone (0: none do), y: times as many in a small puff
uniform vec4 uTwigLay;    // x: how far back toward its puff's middle a spray is rooted (puff radii), y: how far past the card's middle it reaches (cards: to where its leaves reached), z: its width / its length, w: how far back at the least (cards)
uniform vec4 uTwigAt;     // x, y: between which two drynesses the sprays come, each at its own; z: how wide a spray's card is at its foot (of its width); w: the share of the sprays a far crown keeps
varying float vTwig;
varying vec2 vUv;
varying vec3 vCard;
varying vec4 vPuff;
varying vec3 vRight;
varying vec3 vUp;
varying vec4 vRS;
varying vec3 vSun;
varying vec4 vCN;
varying vec4 vShade;
varying float vDry;
void main() {
  float ph = objPhase() + iBase.x * 0.37 + iBase.z * 0.23;
  float sc = objScale();
  vec3 c = iCenter + windOffset((iCenter - iBase.xyz) / iBase.w, ph) * iBase.w;
  vec3 pc = iPuff.xyz + windOffset((iPuff.xyz - iBase.xyz) / iBase.w, ph) * iBase.w;
  // someone walking through a low plant (a flowering clump, a bush's edge): its leaves and flowers part round her legs and
  // sink a little, as the grass does. Leaves higher than her waist (every tree's) stay as they are.
  vec4 wc = modelMatrix * vec4(c, 1.0);
  vec2 away = wc.xz - uWalker.xz;
  float wd = length(away), wy = wc.y - uWalker.y;
  float push = (1.0 - smoothstep(0.1, uWalker.w * 1.1, wd)) * (1.0 - smoothstep(0.9, 1.5, wy)) * step(-0.6, wy);
  wc.xz += away / max(wd, 0.05) * push * 0.3;
  wc.y -= push * clamp(wy * 0.4, 0.0, 0.14);
  vec4 mv = viewMatrix * wc;
  float fl = uWind * (0.25 + iShade.x) * 0.02 * iBase.w;
  mv.xy += vec2(sin(uTime * 2.1 + iShade.w * 140.0 + ph), sin(uTime * 2.7 + iShade.w * 90.0) * 0.5) * fl * sc;
  // away from the eye: a card that lies behind others from where the eye is shrinks to nothing (iHid: yes or no for eight
  // sides round the plant, blended between the two the eye is between, so a card comes and goes softly as she walks round;
  // only for an eye about level with the crown, as it was worked out), and far off some of the rest do too (which: by
  // each card's own number), the others a little larger
  float span = length(mv.xyz) / max(iBase.w * sc, 1.0);
  vec3 eye = normalize((cameraPosition - wc.xyz) * mat3(modelMatrix));
  float side = fract(atan(eye.x, eye.z) / 6.2831853 + 1.0) * 8.0, s0 = floor(side);
  float hid = mix(mod(floor(iHid * exp2(-s0) + 0.001), 2.0), mod(floor(iHid * exp2(-mod(s0 + 1.0, 8.0)) + 0.001), 2.0), side - s0);
  hid *= smoothstep(uFarLeaves.x, uFarLeaves.y, span) * (smoothstep(-0.5, -0.4, eye.y) - smoothstep(0.6, 0.7, eye.y));
  float few = smoothstep(uFarLeaves.z, uFarLeaves.w, span), kept = mix(1.0, uFarKeep.x, few);
  float lod = (1.0 - hid) * (1.0 - smoothstep(kept, kept + 0.08, iShade.w)) * mix(1.0, uFarKeep.y, few);
  // DRYNESS: the drier, the fewer leaves (by each card's own number) and the smaller; dead: none
  vec2 dryUv = (wc.xz - uDryRect.xy) * uDryRect.zw;
  float dry = texture2D(uDryMap, clamp(dryUv, 0.0, 1.0)).r;
  float leafLeft = pow(clamp(1.0 - dry * 1.03, 0.0, 1.0), 1.5);      // (a crown is many leaves deep: thinned on a curve, so half dry looks half bare)
  float leafOn = mix(1.0, 1.0 - smoothstep(leafLeft - 0.05, leafLeft, iShade.w), step(0.002, dry)) * (1.0 - 0.18 * dry);
  // TWIGS: a card that carries a spray loses its leaves at its own dryness, and its twigs stand bare from then on
  float bareAt = mix(uTwigAt.x, uTwigAt.y, fract(iShade.w * 61.7));
  float twigShare = uTwigs.x * mix(uTwigs.y, 1.0, smoothstep(0.45, 1.0, iPuff.w)) * mix(1.0, uTwigAt.w, few);
  float carries = step(iShade.w, twigShare) * step(0.002, dry);
  float twig = carries * step(bareAt, dry);
  leafOn *= 1.0 - carries * smoothstep(bareAt - 0.06, bareAt, dry);
  vDry = dry;
  vTwig = twig;
  float cs = cos(iCard.x), sn = sin(iCard.x);
  vec2 hs = vec2(iCard.z, 1.0 / iCard.z) * iCard.y * lod * leafOn;
  vec2 cell = uv;
  if (twig > 0.5) {
    // laid from inside the puff out past where the leaves were, its foot toward the puff's middle: the card's own up is
    // the way out of the puff as the eye sees it. A spray that points at the eye, or away, is a short narrow tuft
    vec3 outM = c - pc;
    float far3 = length(outM);
    vec3 way = mat3(modelViewMatrix) * (outM / max(far3, 1e-4));      // (its length: the plant's own size on screen)
    float back = min(far3 * 0.94, max(iPuff.w * uTwigLay.x, iCard.y * uTwigLay.w)), whole = back + iCard.y * uTwigLay.y;      // (a small puff's spray: still long enough to reach back among the others)
    float flat2 = length(way.xy), sz = length(way);
    vec2 dir = flat2 > 1e-4 * sz ? way.xy / flat2 : vec2(0.0, 1.0);
    float grown = smoothstep(bareAt, bareAt + 0.06, dry) * (1.0 - smoothstep(twigShare * 0.8, twigShare, iShade.w) * few);      // (the ones a far crown is about to lose: smaller first)
    float across = flat2 / max(sz, 1e-5);                                  // (1: it lies across the view; 0: it points at the eye, a small tuft that keeps still as she moves)
    float tall = max(flat2, 0.3 * sz) * whole * grown, wide = sz * whole * uTwigLay.z * grown * mix(1.0, uFarKeep.y, few) * mix(0.55, 1.0, smoothstep(0.2, 0.6, across));
    mv.xyz += vec3(-way.xy * back + dir * tall * 0.5, way.z * (whole * 0.5 - back));
    float wedge = mix(uTwigAt.z, 1.0, uv.y);                               // (the card: a wedge, as narrow at its foot as the sprays are drawn)
    mv.xy += vec2(dir.y, -dir.x) * position.x * wide * wedge + dir * position.y * tall;
    cs = dir.y; sn = dir.x; hs = vec2(wide, tall);
    cell.x = 0.5 + (cell.x - 0.5) * wedge * (1.0 - 2.0 * step(0.5, fract(iShade.w * 173.3)));      // (half of them mirrored: eight sprays of four)
  } else {
    vec2 q = position.xy * hs * sc;
    mv.xy += vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);        // camera-facing card
  }
  vHaze = hazeAt(mv.xyz);
  gl_Position = projectionMatrix * mv;
  vUv = cell * 0.5 + vec2(mod(iCard.w, 2.0), floor(iCard.w / 2.0)) * 0.5;
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

// what a card covers of a pixel, for the colour pass and the depth pass alike: the leaves' outline (the mask's red), or a
// twig card's spray (its alpha). Twigs are thin: near, their outline as the leaves'; from where a twig is thinner than
// a pixel, the share of the pixel it covers and a little more (the screen's samples take it: a far crown of twigs is a
// haze, it neither fades away nor breaks into dots). No branch: the leaves' sums are as they were
const LEAF_COVER = /* glsl */`
uniform sampler2D uMask;
varying vec2 vUv;
varying float vTwig;
float cover(vec4 t) {
  float a = mix(t.r, t.a, vTwig);
  float w = max(fwidth(a), 1e-3) * 0.75;
  float perPx = (fwidth(vUv.x) + fwidth(vUv.y)) * 720.0;                 // the mask's pixels to one of the screen's (about)
  float thin = min(a * 1.8, 1.0) * step(0.14, a);
  return mix(smoothstep(0.5 - w, 0.5 + w, a), thin, vTwig * smoothstep(1.5, 4.0, perPx));
}`;
const LEAF_FS = /* glsl */`
${NATURE_HAZEF}
${natureInternal.NOISE}
${LEAF_COVER}
uniform vec3 uC0, uC1, uC2, uC3, uC4;
uniform vec4 uStep;       // where each flat tone starts
uniform float uCrownMix, uLightW, uHeightW, uAOW, uLeafTint, uSkyW;
uniform float uBrush, uBrushW;      // the tones laid in brush strokes (see BRUSH), and how far a stroke moves a tone
uniform vec3 uD0, uD1, uD2, uD3, uD4;   // DRYNESS: the dead leaves' tones
uniform vec3 uT0, uT1, uT2;             // TWIGS: bare twigs' tones
varying float vDry;
#ifdef BLOSSOM
uniform sampler2D uCentre;
uniform vec3 uCentreCol;
#endif
varying vec3 vCard;
varying vec4 vPuff;
varying vec3 vRight;
varying vec3 vUp;
varying vec4 vRS;
varying vec3 vSun;
varying vec4 vCN;
varying vec4 vShade;
void main() {
  vec4 t4 = texture2D(uMask, vUv);
  vec3 t = t4.rgb;
  float alpha = cover(t4);
  if (alpha < 0.02) discard;
  if (vTwig > 0.5) {
    // a spray of bare twigs: one flat tone to a spray, by how high in the crown it is, how deep among the others, which
    // way the crown faces the sun there, and its own number: the sprays read one behind another
    float tv = vShade.x * 0.45 + (dot(normalize(vCN.xyz), vSun) * 0.5 + 0.5) * 0.5 - vShade.y * 0.35 + (fract(vShade.w * 37.0) - 0.5) * 0.3;
    vec3 tc = mix(uT0, uT1, step(0.34, tv));
    tc = mix(tc, uT2, step(0.6, tv));
    gl_FragColor = vec4(mix(tc, uHaze, vHaze), alpha);
    return;
  }
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
  if (uBrush > 0.5) {
    // BRUSH: long patches leaning one way over the whole plant, the same for every leaf in one (from the leaf's middle)
    vec2 sq = vec2(p.x * 0.8 + p.z * 0.6 + p.y * 0.45, p.y - (p.x * 0.6 - p.z * 0.8) * 0.3);
    float stroke = noise2(vec2(sq.x * 0.7, sq.y * 2.1)) * 0.65 + noise2(vec2(sq.x * 1.7 + 5.0, sq.y * 4.8)) * 0.35;
    v += (stroke - 0.5) * uBrushW - leaf * uLeafTint * 0.75;
  }
  vec3 col = uC0;                                                   // Color Ramp, constant
  col = mix(col, uC1, step(uStep.x, v));
  col = mix(col, uC2, step(uStep.y, v));
  col = mix(col, uC3, step(uStep.z, v));
  col = mix(col, uC4, step(uStep.w, v));
  if (vDry > 0.002) {                                               // DRYNESS: the same steps, in the dead leaves' tones
    vec3 dc = uD0;
    dc = mix(dc, uD1, step(uStep.x, v));
    dc = mix(dc, uD2, step(uStep.y, v));
    dc = mix(dc, uD3, step(uStep.z, v));
    dc = mix(dc, uD4, step(uStep.w, v));
    col = mix(col, dc, smoothstep(0.05, 0.6, vDry));
  }
#ifdef BLOSSOM
  col = mix(col, uCentreCol * (0.72 + 0.28 * step(uStep.y, v)), smoothstep(0.35, 0.6, texture2D(uCentre, vUv).r));
#endif
  gl_FragColor = vec4(mix(col, uHaze, vHaze), alpha);
}`;

// LEAF PREPASS. A crown is many cards deep: from where she stands, a pixel of leaves had 30 to 60 cards over it (and
// more, under a tree), and the leaf shader above (tones, brush strokes, haze) ran for every one of them, the ones
// hidden behind others too: a shader that throws pixels away (the leaf's outline) and spreads its edge over the
// screen's samples (alpha to coverage) keeps the phone from skipping what lies behind. So the leaves are drawn twice:
// first only into depth, every card, with a shader that does nothing but read the leaf's outline (LEAF_DEPTH_FS: the
// same outline, the same soft edge); then in colour, not writing depth and only where a card is the nearest leaf there
//, so the leaf shader runs about once a pixel. The picture is the same. The depth pass is each leaf mesh's
// child (the same cards, the same cells and counts from lod), drawn before all else that is solid (renderOrder -1), so
// the ground and grass behind the crowns are skipped too. ?leafpre=0: as before, one pass.
const LEAF_PREPASS = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('leafpre') === '0');
const LEAF_DEPTH_FS = /* glsl */`
${LEAF_COVER}
void main() {
  float alpha = cover(texture2D(uMask, vUv));
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
}`;
const depthMats = new WeakMap();
function withPrepass(mesh) {
  if (!LEAF_PREPASS) return mesh;
  const m = mesh.material;
  let d = depthMats.get(m);
  if (!d) {
    // (the colour pass draws a hair nearer than the depth it tests against: polygonOffset on this one)
    d = new THREE.ShaderMaterial({ uniforms: m.uniforms, defines: m.defines, vertexShader: LEAF_VS, fragmentShader: LEAF_DEPTH_FS,
      alphaToCoverage: true, side: THREE.DoubleSide, colorWrite: false, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 2 });
    depthMats.set(m, d);
  }
  const dm = new THREE.Mesh(mesh.geometry, d);
  dm.frustumCulled = false; dm.renderOrder = -1; dm.name = 'anime_leaves_depth';
  mesh.add(dm);
  return mesh;
}

// falling leaves: each one drops from a spot in the crown, sways and tumbles downwind, fades, and starts again.
// All in the shader from the time: nothing to update per frame.
const FALL_VS = /* glsl */`
${NATURE_VCOMMON}
attribute vec3 iSpawn;
attribute vec4 iPar;      // x: phase 0..1, y: fall speed, z: sway rate, w: size
attribute float iTone;
attribute float iGround;  // the ground's height under the tree
uniform sampler2D uDryMap;  // DRYNESS (see the leaves): brown leaves fall from a dying plant, none from a dead one
uniform vec4 uDryRect;
varying vec2 vUv;
varying float vA;
varying float vTone;
varying float vSide;
varying float vDry;
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
  vec4 ws = modelMatrix * vec4(iSpawn, 1.0);
  vDry = texture2D(uDryMap, clamp((ws.xz - uDryRect.xy) * uDryRect.zw, 0.0, 1.0)).r;
  vA *= 1.0 - smoothstep(0.85, 0.98, vDry);
}`;
const FALL_FS = /* glsl */`
${NATURE_HAZEF}
uniform vec3 uC1, uC2, uC3;
uniform vec3 uD1, uD2, uD3;   // DRYNESS: the dead leaves' tones
varying vec2 vUv;
varying float vA;
varying float vTone;
varying float vSide;
varying float vDry;
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
  vec3 dc = mix(uD1, mix(uD2, uD3, vTone), 0.35 + 0.65 * vSide);
  col = mix(col, dc, smoothstep(0.05, 0.6, vDry));
  gl_FragColor = vec4(mix(col, uHaze, vHaze), a);
}`;

// one leaf material and one falling-leaf material per palette and mask, shared by every plant
const mats = {};
function materials(palette, mask = 'leaf') {
  const pk = ANIME_PALETTES[palette] ? palette : 'game', key = pk + '/' + mask;
  if (mats[key]) return mats[key];
  const pal = ANIME_PALETTES[pk].tones.map(rgb), st = ANIME_PALETTES[pk].steps, W = ANIME_PALETTES[pk].weights || {};      // weights: how much the sun, the height in the plant and the shade among the puffs move a leaf's tone
  const U = { ...natureUniforms, ...DRY, uSun: SUN, uFarLeaves: FAR_LEAVES, uFarKeep: FAR_KEEP, uC0: { value: pal[0] }, uC1: { value: pal[1] }, uC2: { value: pal[2] }, uC3: { value: pal[3] }, uC4: { value: pal[4] } };
  const leaf = new THREE.ShaderMaterial({
    uniforms: {
      ...U, uMask: { value: clusterMask(mask === 'leaf' && BRUSH.value > 0.5 ? 'brush' : mask) },
      uBrush: mask === 'leaf' ? BRUSH : { value: 0 }, uBrushW: { value: W.brush ?? 0.36 },
      uTwigs: { value: new THREE.Vector2(mask === 'leaf' ? TWIG.share : 0, TWIG.small) },      // (needles and flowers: none; their masks carry no twigs)
      uStep: { value: new THREE.Vector4(...st) },
      uCrownMix: { value: 0.3 }, uLightW: { value: W.light ?? 0.85 }, uHeightW: { value: W.height ?? 0.28 }, uAOW: { value: W.ao ?? 0.5 }, uLeafTint: { value: W.tint ?? 0.08 }, uSkyW: { value: W.sky ?? 0 },
    },
    vertexShader: LEAF_VS, fragmentShader: LEAF_FS, alphaToCoverage: true, side: THREE.DoubleSide,
    depthWrite: !LEAF_PREPASS,
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
  // inside any puff's ball but the one numbered skip: the same sums as inside(), in plain numbers and given up on as soon as
  // they pass k² (asked tens of thousands of times a crown, by ao() and for the leaves buried in a neighbour)
  const PU = puffs.map(P => [P.c.x, P.c.y, P.c.z, P.r, P.r * P.f]);
  const inAny = (x, y, z, k, skip = -1, only = null) => {
    const kk = k * k, m = only ? only.length : PU.length;
    for (let w = 0; w < m; w++) {
      const q = only ? only[w] : w;
      if (q === skip) continue;
      const B = PU[q], dx = (x - B[0]) / B[3];
      let s = dx * dx; if (s >= kk) continue;
      const dy = (y - B[1]) / B[4]; s += dy * dy; if (s >= kk) continue;
      const dz = (z - B[2]) / B[3]; if (s + dz * dz < kk) return true;
    }
    return false;
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
  // (the puffs a card's rays can reach at all: a ray goes no further than the last of STEPS from the card, and a puff
  // shrunk by k reaches no further than k times its larger radius from its middle; a little to spare)
  const farthest = STEPS[STEPS.length - 1][0], near = [];
  const ao = (p, n) => {
    tA.crossVectors(Math.abs(n.y) < 0.9 ? up : tmp.set(1, 0, 0), n).normalize();
    tB.crossVectors(n, tA);
    near.length = 0;
    for (let q = 0; q < PU.length; q++) { const B = PU[q]; if (Math.hypot(p.x - B[0], p.y - B[1], p.z - B[2]) <= 0.86 * Math.max(B[3], B[4]) + farthest * 1.01 + 1e-3) near.push(q); }
    let occ = 0;
    for (const f of FAN) {
      const dx = tA.x * f.x + n.x * f.y + tB.x * f.z, dy = tA.y * f.x + n.y * f.y + tB.y * f.z, dz = tA.z * f.x + n.z * f.y + tB.z * f.z;
      for (const [s, w] of STEPS) {
        const x = p.x + dx * s, y = p.y + dy * s, z = p.z + dz * s;
        if (y < floorY || (near.length && inAny(x, y, z, 0.86, -1, near))) { occ += w; break; }      // the ground shades too
      }
    }
    return Math.min(1, occ / (FAN.length * STEP_SUM) * 2.2);
  };

  const C = [], PF = [], K = [], SH = [], CN = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3();
  puffs.forEach((P, pi) => {
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
      if (!deep && inAny(p.x, p.y, p.z, 0.8, pi)) continue;                       // buried in a neighbour: never seen
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

// Which of a crown's leaf cards lie behind enough others not to be drawn, by where the crown is looked at from.
// The crown is looked at from HID_AZ sides round it, from each at three heights (a little under level, level, well above:
// where an eye away from the tree is), as a flat picture: the cards are laid into it nearest first, each adding what a
// card covers of its square (a third: HID_COVER) to the cells it lies on; a card whose every cell has leaves HID_DEEP
// deep before it (one part in ten still showing through) is hidden from there. Hidden cards add nothing, so what
// hides a card is always drawn. -> for each card, a bit per side: hidden from that side at all three heights.
const HID_AZ = 16, HID_EL = [-0.3, 0.1, 0.5], HID_COVER = 0.35, HID_DEEP = 2.2;
function hiddenFrom({ C, K }) {
  const n = C.length / 3, out = new Uint16Array(n);
  if (n < 60) return out;
  let size = 0;
  for (let i = 0; i < n; i++) size += K[i * 4 + 1];
  const cell = size / n * 0.3, SL = 40;
  const a = new Float32Array(n), b = new Float32Array(n), d = new Float32Array(n), slab = new Uint8Array(n), order = new Uint32Array(n), at = new Uint32Array(SL + 1), put = new Uint32Array(SL);
  const shown = new Uint8Array(n), lays = new Uint8Array(n);
  for (let az = 0; az < HID_AZ; az++) {
    const th = az / HID_AZ * Math.PI * 2, ux = Math.cos(th), uz = -Math.sin(th);
    shown.fill(0);
    for (const el of HID_EL) {
      const ce = Math.cos(el), vx = ce * Math.sin(th), vy = Math.sin(el), vz = ce * Math.cos(th);      // toward the eye
      const wx = vy * uz, wy = vz * ux - vx * uz, wz = -vy * ux;                                    // up, in the picture
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, d0 = Infinity, d1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = C[i * 3], y = C[i * 3 + 1], z = C[i * 3 + 2];
        const pa = a[i] = x * ux + z * uz, pb = b[i] = x * wx + y * wy + z * wz, pd = d[i] = x * vx + y * vy + z * vz;
        if (pa < a0) a0 = pa; if (pa > a1) a1 = pa; if (pb < b0) b0 = pb; if (pb > b1) b1 = pb; if (pd < d0) d0 = pd; if (pd > d1) d1 = pd;
      }
      const gw = Math.ceil((a1 - a0) / cell) + 1, gh = Math.ceil((b1 - b0) / cell) + 1, deep = new Float32Array(gw * gh);
      // nearest the eye first, a slab of depth at a time (cards of one slab do not hide one another)
      const ds = (d1 - d0) / SL || 1;
      at.fill(0);
      for (let i = 0; i < n; i++) { const k = Math.min(SL - 1, Math.floor((d1 - d[i]) / ds)); slab[i] = k; at[k + 1]++; }
      for (let k = 0; k < SL; k++) { at[k + 1] += at[k]; put[k] = at[k]; }
      for (let i = 0; i < n; i++) order[put[slab[i]]++] = i;
      for (let k = 0; k < SL; k++) {
        for (let q = at[k]; q < at[k + 1]; q++) {
          const i = order[q], r = K[i * 4 + 1] * 0.45;
          const i0 = Math.max(0, Math.round((a[i] - r - a0) / cell)), i1 = Math.min(gw - 1, Math.round((a[i] + r - a0) / cell));
          const j0 = Math.max(0, Math.round((b[i] - r - b0) / cell)), j1 = Math.min(gh - 1, Math.round((b[i] + r - b0) / cell));
          let seen = false;
          for (let j = j0; j <= j1 && !seen; j++) for (let ii = i0; ii <= i1; ii++) if (deep[j * gw + ii] < HID_DEEP) { seen = true; break; }
          lays[i] = seen ? 1 : 0;
          if (seen) shown[i] = 1;
        }
        for (let q = at[k]; q < at[k + 1]; q++) {
          const i = order[q];
          if (!lays[i]) continue;
          const r = K[i * 4 + 1] * 0.5;
          const i0 = Math.max(0, Math.round((a[i] - r - a0) / cell)), i1 = Math.min(gw - 1, Math.round((a[i] + r - a0) / cell) - 1);
          const j0 = Math.max(0, Math.round((b[i] - r - b0) / cell)), j1 = Math.min(gh - 1, Math.round((b[i] + r - b0) / cell) - 1);
          for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) deep[j * gw + ii] += HID_COVER;
        }
      }
    }
    for (let i = 0; i < n; i++) if (!shown[i]) out[i] |= 1 << az;
  }
  return out;
}
// a card's sixteen sides round its own plant -> the eight of the compass, for a plant turned by rotY: hidden from a side of
// the compass when it is hidden from the plant's side nearest to it and from the two beside that one
const compassSides = (rotY = 0) => [0, 1, 2, 3, 4, 5, 6, 7].map(j => ((Math.round((j * Math.PI / 4 - rotY) / (Math.PI * 2) * HID_AZ) % HID_AZ) + HID_AZ) % HID_AZ);
function hiddenByCompass(bits, sides) {
  let out = 0;
  for (let j = 0; j < 8; j++) { const k = sides[j]; if ((bits >> k) & (bits >> ((k + 1) % HID_AZ)) & (bits >> ((k + HID_AZ - 1) % HID_AZ)) & 1) out |= 1 << j; }
  return out;
}

function cardGeometry({ C, PF, K, SH, CN, B = null, HD = null }, order = null) {      // order: the cards' order in it (inOwnOrder), else as they are
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  const n = C.length / 3;
  const laid = (src, size) => {
    const out = new Float32Array(n * size);
    if (!order) out.set(src);
    else for (let i = 0; i < n; i++) { const o = order[i] * size; for (let k = 0; k < size; k++) out[i * size + k] = src[o + k]; }
    return out;
  };
  let base = B ? laid(B, 4) : null;
  if (!base) { base = new Float32Array(n * 4); for (let i = 3; i < base.length; i += 4) base[i] = 1; }
  g.setAttribute('iCenter', new THREE.InstancedBufferAttribute(laid(C, 3), 3));
  g.setAttribute('iPuff', new THREE.InstancedBufferAttribute(laid(PF, 4), 4));
  g.setAttribute('iCard', new THREE.InstancedBufferAttribute(laid(K, 4), 4));
  g.setAttribute('iShade', new THREE.InstancedBufferAttribute(laid(SH, 4), 4));
  g.setAttribute('iCN', new THREE.InstancedBufferAttribute(laid(CN, 4), 4));
  g.setAttribute('iBase', new THREE.InstancedBufferAttribute(base, 4));
  g.setAttribute('iHid', new THREE.InstancedBufferAttribute(HD ? laid(HD, 1) : new Float32Array(n), 1));
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
  dyingWood(trunk.material);                                        // and dies by the same picture (DRYNESS)
  const plain = {};                                                  // the same wood with fewer sides and rings (MID_WOOD, FAR_WOOD): made when a forest first asks for it
  const trunkAt = step => plain[step] || (plain[step] = growTreeFrame(spec, seed, step === 'far' ? FAR_WOOD : MID_WOOD).trunk.geometry);
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
  cards.HID = hiddenFrom(cards);                                   // (by the tree's own sides: a forest turns them to the compass's)
  const sides = compassSides();
  cards.HD = Array.from(cards.HID, bits => hiddenByCompass(bits, sides));
  return { kind, spec, trunk, trunkAt, cards, leaf, rng };
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
const CLUMP_SHAPES = ['dome', 'spread', 'cluster', 'spread'], CLUMP_LEAF = 1.45;      // a clump: low shapes only; its leaves larger for its size (and so fewer)
function bushParts(seed, far = false, bloom = false, clump = false) {
  const rng = mulberry32(seed * 104729 + 11), K = BUSH_SIZE;
  const set = clump ? CLUMP_SHAPES : BUSH_SHAPES;
  const shape = set[((seed % set.length) + set.length) % set.length];
  const puffs = bushPuffs(shape, rng);
  for (const P of puffs) { P.c.multiplyScalar(K); P.r *= K; }
  // the whole bush's ellipsoid: the box round its puffs (each leaf leans a little toward its normal)
  const lo = new THREE.Vector3(Infinity, 0, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const P of puffs) {
    lo.min(new THREE.Vector3(P.c.x - P.r, 0, P.c.z - P.r));
    hi.max(new THREE.Vector3(P.c.x + P.r, P.c.y + P.r * P.f, P.c.z + P.r));
  }
  const env = { c: lo.clone().add(hi).multiplyScalar(0.5), r: hi.clone().sub(lo).multiplyScalar(0.5) };
  const leaf = BUSH_LEAF * K * (clump ? CLUMP_LEAF : 1) * (far ? FAR_LEAF : 1);
  const cards = buildPuffs(rng, puffs, env, { leaf, density: densityFor(leaf), floorY: 0, hRange: [0.25, 0.7], rough: BUSH_ROUGH, aoMul: 0.8 });
  // lit as one mass more than puff by puff: the ball each leaf takes its light from is drawn toward the bush's middle, low
  // down, so the bush has one sunlit side and one shaded side, and its puffs only ripple that
  const mass = new THREE.Vector3(env.c.x, env.c.y * 0.35, env.c.z);
  const asOne = c => { for (let i = 0; i < c.PF.length; i += 4) { c.PF[i] += (mass.x - c.PF[i]) * BUSH_UNITY; c.PF[i + 1] += (mass.y - c.PF[i + 1]) * BUSH_UNITY; c.PF[i + 2] += (mass.z - c.PF[i + 2]) * BUSH_UNITY; } return c; };
  return { cards: asOne(cards), leaf, shape, height: hi.y + leaf * 0.5, bloom: bloom || clump ? asOne(bloomParts(seed, puffs, env, far, clump)) : null };
}

// a flowering bush's flowers: open flowers about two leaves across (one to three to a card, now and then a bud), sitting on
// its outer leaves and lit as the leaves round them are. They gather in a few drifts over the bush's upper part, as a shrub
// in flower has them, with the leaves plain between; never under it or down in a crevice. Their own dice, so the bush under
// them is the same bush as the plain one of that seed
const BLOOM_PLAIN = { card: 0.44, per: 2.4, drifts: [3, 5], most: 28 };
const BLOOM_RICH = { card: 0.6, per: 6.5, drifts: [5, 7], most: 56 };      // a flowering clump: in flower all over its top      // card size (m) and cards per m² of a puff's upper half, at the first bush's measure
function bloomParts(seed, puffs, env, far = false, rich = false) {
  const rng = mulberry32(seed * 7919 + 5), K = BUSH_SIZE, BLOOM = rich ? BLOOM_RICH : BLOOM_PLAIN;
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
      if (rng() > 0.05 + 0.95 * THREE.MathUtils.smoothstep(near, rich ? 0.1 : 0.5, rich ? 0.6 : 0.9)) continue;
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
  withPrepass(leaves);
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

export function createAnimeBush({ seed = 3, bloom = null, clump = false } = {}) {
  if (clump && !bloom) bloom = 'pink';
  const { cards, leaf, shape, height, bloom: flowers } = bushParts(seed, false, !!bloom, clump);
  const { leaves } = leafMeshes(mulberry32(seed), cards, clump ? 'tree' : 'game', 'leaf', false, 0, leaf);      // (a clump: the trees' quieter greens)
  const group = new THREE.Group();
  group.add(leaves);
  let heads = null;
  if (flowers) {
    heads = new THREE.Mesh(cardGeometry(flowers), materials('bloom-' + (BLOOM_COLORS.includes(bloom) ? bloom : 'pink'), 'blossom').leaf);
    heads.frustumCulled = false; heads.name = 'anime_blossoms';
    group.add(heads);
  }
  group.name = 'anime_bush';
  group.userData = { kind: 'bush', type: clump ? 'clump' : bloom ? 'flowering' : 'anime', bloom, shape, height, cards: leaves.geometry.instanceCount + (heads ? heads.geometry.instanceCount : 0),
    setFalling() {}, dispose() { leaves.geometry.dispose(); if (heads) heads.geometry.dispose(); } };
  return group;
}

// --------------------------------------------------------------------------
// forest: every plant is one of a few shapes of its kind (built once, kept), copied into place, turned and sized
// --------------------------------------------------------------------------
const shapes = {};
const shapeOf = (kind, type, v, far) => {
  const key = kind + '/' + type + '/' + v + (far ? '/far' : '');
  return shapes[key] || (shapes[key] = kind === 'bush' ? bushParts(v + 1, far, type === 'flowering', type === 'clump') : treeParts(type, v + 1, far));
};

// a buffer's cards in the order of their own numbers (iShade.w, lowest first): that order (cardGeometry lays them out in
// it), and the numbers in it
function inOwnOrder(b) {
  const n = b.C.length / 3, order = Array.from({ length: n }, (_, i) => i).sort((p, q) => b.SH[p * 4 + 3] - b.SH[q * 4 + 3]);
  return { order, own: Float32Array.from(order, i => b.SH[i * 4 + 3]) };
}

export function createAnimeForest(list, { cell = 0 } = {}) {      // cell: metres (0: a forest's plants of one palette are one mesh, as before)
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S3 = new THREE.Vector3(), T3 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), BOX = new THREE.Box3(), BALL = new THREE.Sphere();
  const leafB = {}, barkB = {}, fallB = {};
  const rng = mulberry32(list.length * 7 + 3);
  for (const e of list) {
    const bush = e.kind === 'bush', s = e.scale ?? 1, far = (e.detail ?? 1) < 0.8, v = Math.abs(Math.round(e.seed ?? 0)) % (bush ? BUSH_VARIANTS : VARIANTS);
    const type = bush ? (e.type === 'flowering' || e.type === 'clump' ? e.type : 'bush') : (KINDS[e.type] ? e.type : 'broadleaf');
    const part = shapeOf(bush ? 'bush' : 'tree', type, v, far);
    const palette = bush ? (type === 'clump' ? 'tree' : 'game') : part.kind.palette, mask = bush ? 'leaf' : (part.kind.mask || 'leaf');
    M.compose(T3.set(e.x, e.y, e.z), Q.setFromAxisAngle(UP, e.rotY ?? 0), S3.set(s, s, s));
    const at = cell ? '@' + Math.floor(e.x / cell) + ',' + Math.floor(e.z / cell) : '', key = palette + '/' + mask + at;
    const b = leafB[key] || (leafB[key] = { palette, mask, C: [], PF: [], K: [], SH: [], CN: [], B: [], HD: [], T: [] });
    const c = part.cards, n = c.C.length / 3, sides = c.HID ? compassSides(e.rotY ?? 0) : null;
    let big = 0;                                                       // its biggest card, corner to corner
    BOX.makeEmpty();
    for (let i = 0; i < n; i++) {
      big = Math.max(big, c.K[i * 4 + 1] * s * Math.max(c.K[i * 4 + 2], 1 / c.K[i * 4 + 2]));
      b.HD.push(sides ? hiddenByCompass(c.HID[i], sides) : 0);
      V.set(c.C[i * 3], c.C[i * 3 + 1], c.C[i * 3 + 2]).applyMatrix4(M); b.C.push(V.x, V.y, V.z); BOX.expandByPoint(V);
      V.set(c.PF[i * 4], c.PF[i * 4 + 1], c.PF[i * 4 + 2]).applyMatrix4(M); b.PF.push(V.x, V.y, V.z, c.PF[i * 4 + 3] * s);
      b.K.push(c.K[i * 4], c.K[i * 4 + 1] * s, c.K[i * 4 + 2], c.K[i * 4 + 3]);
      b.SH.push(c.SH[i * 4], c.SH[i * 4 + 1], c.SH[i * 4 + 2], c.SH[i * 4 + 3]);
      V.set(c.CN[i * 4], c.CN[i * 4 + 1], c.CN[i * 4 + 2]).applyQuaternion(Q); b.CN.push(V.x, V.y, V.z, c.CN[i * 4 + 3]);
      b.B.push(e.x, e.y, e.z, s);
    }
    if (n) { BOX.getBoundingSphere(BALL); b.T.push(BALL.center.x, BALL.center.y, BALL.center.z, BALL.radius + big * 1.1 + 0.6 * s + 0.4, s); }      // (the ball its cards lie in: their middles, a far card's reach, and a little for the wind in them)
    if (bush && part.bloom) {                                         // its flowers, in the colour its seed picks
      const col = BLOOM_COLORS.includes(e.bloom) ? e.bloom      // its own colour, or its neighbourhood's (18 m: bushes side by side flower alike)
        : BLOOM_COLORS[Math.abs((Math.floor(e.x / 18) * 73856093) ^ (Math.floor(e.z / 18) * 19349663)) % BLOOM_COLORS.length];
      const fk = 'bloom-' + col + '/blossom' + at;
      const fb = leafB[fk] || (leafB[fk] = { palette: 'bloom-' + col, mask: 'blossom', C: [], PF: [], K: [], SH: [], CN: [], B: [], HD: [], T: [] });
      const f = part.bloom, nf = f.C.length / 3;
      let bigF = 0;
      BOX.makeEmpty();
      for (let i = 0; i < nf; i++) {
        bigF = Math.max(bigF, f.K[i * 4 + 1] * s * Math.max(f.K[i * 4 + 2], 1 / f.K[i * 4 + 2]));
        fb.HD.push(0);
        V.set(f.C[i * 3], f.C[i * 3 + 1], f.C[i * 3 + 2]).applyMatrix4(M); fb.C.push(V.x, V.y, V.z); BOX.expandByPoint(V);
        V.set(f.PF[i * 4], f.PF[i * 4 + 1], f.PF[i * 4 + 2]).applyMatrix4(M); fb.PF.push(V.x, V.y, V.z, f.PF[i * 4 + 3] * s);
        fb.K.push(f.K[i * 4], f.K[i * 4 + 1] * s, f.K[i * 4 + 2], f.K[i * 4 + 3]);
        fb.SH.push(f.SH[i * 4], f.SH[i * 4 + 1], f.SH[i * 4 + 2], f.SH[i * 4 + 3]);
        V.set(f.CN[i * 4], f.CN[i * 4 + 1], f.CN[i * 4 + 2]).applyQuaternion(Q); fb.CN.push(V.x, V.y, V.z, f.CN[i * 4 + 3]);
        fb.B.push(e.x, e.y, e.z, s);
      }
      if (nf) { BOX.getBoundingSphere(BALL); fb.T.push(BALL.center.x, BALL.center.y, BALL.center.z, BALL.radius + bigF * 1.1 + 0.6 * s + 0.4, s); }
    }
    if (bush) continue;
    const stood = geo => {                                             // a tree's wood, stood where the tree stands
      const g = geo.clone();
      g.applyMatrix4(M);
      if (g.attributes.aCtr) g.attributes.aCtr.applyMatrix4(M);
      if (g.attributes.aAx) g.attributes.aAx.applyMatrix4(M);
      const ab = g.attributes.aBase;
      for (let i = 0; i < ab.count; i++) ab.setXYZW(i, e.x, e.y, e.z, s);
      return g;
    };
    const wood = barkB[type + at] || (barkB[type + at] = { type, mat: part.trunk.material, geos: [], mid: [], far: [], T: [] });
    const g = stood(part.trunk.geometry);
    wood.geos.push(g);
    if (cell) {                                                        // (kept in cells: its plainer wood too, and the ball its wood lies in)
      wood.mid.push(stood(part.trunkAt('mid')));
      if (WOOD_FAR < Infinity) wood.far.push(stood(part.trunkAt('far')));
      g.computeBoundingSphere(); wood.T.push(g.boundingSphere.center.x, g.boundingSphere.center.y, g.boundingSphere.center.z, g.boundingSphere.radius + 0.3 * s, s);
    }
    if (!far && part.kind.fall) {                                     // the near trees drop leaves (half as many as a lone tree)
      const f = fallB[palette] || (fallB[palette] = { S: [], P: [], T: [], G: [] });
      addFalls(f, rng, c, Math.ceil(part.kind.fall * 0.5), part.leaf, M, s, e.y);
    }
  }
  const group = new THREE.Group(), owned = [];
  const add = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.name = name; group.add(m); owned.push(geo); };
  const woods = [];                                                    // each cell's wood: its mesh, its plainer meshes, its trees (T: the ball each one's wood lies in, its size)
  for (const { type, mat, geos, mid, far, T } of Object.values(barkB)) {
    add(mergeGeometries(geos), mat, 'anime_bark_' + type); geos.forEach(g => g.dispose());
    if (!mid.length) continue;
    const near = group.children[group.children.length - 1];
    const plainer = (list, name) => { add(mergeGeometries(list), mat, name); list.forEach(g => g.dispose()); const m = group.children[group.children.length - 1]; m.visible = false; return m; };
    woods.push({ near, mid: plainer(mid, 'anime_bark_mid_' + type), far: far.length ? plainer(far, 'anime_bark_far_' + type) : null, T });
  }
  let cards = 0;
  const leaves = [];                                                   // each mesh of cards: the mesh, its cards' own numbers in order, its plants (T: the ball each one's cards lie in, its size)
  for (const b of Object.values(leafB)) {
    const { order, own } = inOwnOrder(b), geo = cardGeometry(b, order);
    add(geo, materials(b.palette, b.mask).leaf, 'anime_leaves'); cards += own.length;
    leaves.push({ mesh: withPrepass(group.children[group.children.length - 1]), geo, own, T: b.T });
  }
  for (const [palette, f] of Object.entries(fallB)) if (f.S.length) add(fallGeometry(f), materials(palette).fall, 'anime_falling');
  group.name = 'anime_forest';
  const eyeHere = new THREE.Vector3(), ball = new THREE.Sphere();
  group.userData = {
    kind: 'forest', plants: list.length, cards, drawCalls: group.children.length,
    // Call each frame with the eye and the view (world): see the note on the savings above. Of each mesh of cards
    //   - none is drawn if none of its plants is in the view (frustum), nor mirrored in water that lies at mirrorY (a tree
    //     above the top of the picture still stands in the water below it): leave mirrorY out when no water mirrors anything
    //   - only as many cards are drawn as its nearest plant still shows (FAR_LEAVES: the cards past that have shrunk to nothing)
    // lod(null): all of it again. (The forest may have been moved, not turned or sized.)
    lod(eye, frustum = null, mirrorY = null) {
      const far = FAR_LEAVES.value, keep = FAR_KEEP.value.x;
      if (eye) group.worldToLocal(eyeHere.copy(eye));
      const e = group.matrixWorld.elements, ox = e[12], oy = e[13], oz = e[14];      // where the forest has been moved to
      for (const w of woods) {                                       // the wood: not out of view; far wood from far off
        const T = w.T;
        let span = eye ? Infinity : 0, seen = !eye || !frustum;
        for (let i = 0; i < T.length; i += 5) {
          if (span > 0) span = Math.min(span, Math.max(0, Math.hypot(eyeHere.x - T[i], eyeHere.y - T[i + 1], eyeHere.z - T[i + 2]) - T[i + 3]) / Math.max(T[i + 4], 1));
          if (!seen) {
            ball.center.set(T[i] + ox, T[i + 1] + oy, T[i + 2] + oz); ball.radius = T[i + 3];
            seen = frustum.intersectsSphere(ball);
            if (!seen && mirrorY !== null) { ball.center.y = 2 * mirrorY - ball.center.y; seen = frustum.intersectsSphere(ball); }
          }
          if (seen && span === 0) break;
        }
        w.near.visible = seen && span <= WOOD_MID; w.mid.visible = seen && span > WOOD_MID && span <= WOOD_FAR;
        if (w.far) w.far.visible = seen && span > WOOD_FAR;
      }
      for (const { mesh, geo, own, T } of leaves) {
        let span = eye ? Infinity : 0, seen = !eye || !frustum;      // how far off its nearest plant is, for its size; is any of its plants in view
        for (let i = 0; i < T.length; i += 5) {
          if (span > 0) span = Math.min(span, Math.max(0, Math.hypot(eyeHere.x - T[i], eyeHere.y - T[i + 1], eyeHere.z - T[i + 2]) - T[i + 3]) / Math.max(T[i + 4], 1));
          if (!seen) {
            ball.center.set(T[i] + ox, T[i + 1] + oy, T[i + 2] + oz); ball.radius = T[i + 3];
            seen = frustum.intersectsSphere(ball);
            if (!seen && mirrorY !== null) { ball.center.y = 2 * mirrorY - ball.center.y; seen = frustum.intersectsSphere(ball); }
          }
          if (seen && span === 0) break;
        }
        mesh.visible = seen;
        if (!seen) continue;
        const t = Math.min(1, Math.max(0, (span - far.z) / (far.w - far.z))), few = t * t * (3 - 2 * t), last = 1 + (keep - 1) * few + 0.08;      // a card whose number is under this may still show
        let lo = 0, hi = own.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (own[m] < last) lo = m + 1; else hi = m; }
        geo.instanceCount = Math.max(1, lo);
      }
    },
    get drawn() { return leaves.reduce((n, l) => n + (l.mesh.visible ? l.geo.instanceCount : 0), 0); },      // cards drawn now
    dispose() { owned.forEach(o => o.dispose()); },
  };
  return group;
}
