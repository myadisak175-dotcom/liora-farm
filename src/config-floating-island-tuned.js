import {
  CONFIG,
  QUALITY,
  ASSETS as BASE_ASSETS,
  ANIMATIONS,
} from "./config.js?v=floating-island-tune-base1";

/**
 * Camera-tested floating-island composition for the portrait mobile view.
 *
 * The hero stays centered while the support islands sit only about six
 * degrees to either side, keeping the whole 1+3 cluster inside the narrow
 * horizontal FOV. The top support is also pulled closer and lowered so it
 * remains visible below the browser/HUD area.
 */
const items = CONFIG.distantRange?.floatingIslandBackdrop?.items;
if (Array.isArray(items) && items.length >= 4) {
  Object.assign(items[0], {
    angle: 3.97,
    radius: 286,
    y: 88,
    scale: 11.8,
    rotationY: -0.72,
  });

  // ~6 degrees left of the hero, slightly closer to the player.
  Object.assign(items[1], {
    angle: 3.865,
    radius: 224,
    y: 73,
    scale: 7.4,
    rotationY: 0.42,
  });

  // ~6 degrees right of the hero, slightly closer to the player.
  Object.assign(items[2], {
    angle: 4.075,
    radius: 230,
    y: 70,
    scale: 6.6,
    rotationY: -1.0,
  });

  // Upper support: centered with the hero, closer than before, and lowered.
  Object.assign(items[3], {
    angle: 3.97,
    radius: 310,
    y: 96,
    scale: 5.6,
    rotationY: 1.04,
  });
}

export { CONFIG, QUALITY, ANIMATIONS };
export const ASSETS = Object.freeze({
  ...BASE_ASSETS,
  floatingIslandHero: "./assets/models/background/floating_island_hero.glb?v=floating-island-tune2",
});
export const BUILD = "worlds-2-floating-island-b-lite-tune2";
