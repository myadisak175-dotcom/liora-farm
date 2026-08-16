import {
  CONFIG,
  QUALITY,
  ASSETS as BASE_ASSETS,
  ANIMATIONS,
} from "./config.js?v=floating-island-tune-base1";

/**
 * Camera-tested floating-island composition for the mobile view.
 *
 * Keep the base world configuration untouched and apply only the authored
 * backdrop placement here. CONFIG is shallow-frozen, so its nested authored
 * scenery entries remain intentionally adjustable at boot.
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

  Object.assign(items[1], {
    angle: 3.58,
    radius: 236,
    y: 73,
    scale: 7.4,
    rotationY: 0.42,
  });

  Object.assign(items[2], {
    angle: 4.26,
    radius: 244,
    y: 70,
    scale: 6.6,
    rotationY: -1.0,
  });

  Object.assign(items[3], {
    angle: 3.90,
    radius: 332,
    y: 110,
    scale: 5.6,
    rotationY: 1.04,
  });
}

export { CONFIG, QUALITY, ANIMATIONS };
export const ASSETS = Object.freeze({
  ...BASE_ASSETS,
  floatingIslandHero: "./assets/models/background/floating_island_hero.glb?v=floating-island-tune1",
});
export const BUILD = "worlds-2-floating-island-b-lite-tuned";
