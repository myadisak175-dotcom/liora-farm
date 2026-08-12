import { ASSETS } from "../config.js";

export const BUILD_CATEGORIES = Object.freeze({
  NATURE: "nature",
  BUILDINGS: "buildings",
  DECOR: "decor",
});

/**
 * Three radii, because they answer three different questions. The old single
 * `placementRadius` tried to answer all three and ended up wrong for each:
 * a house got a 5.3 m no-build bubble around a 3.9 m building, so a path
 * could never reach its door.
 *
 *   footprintRadius — how much ground the base really covers. Used to keep an
 *                     object on the island and to space out duplicates.
 *                     Measured from the GLB's lowest 15% of geometry.
 *   blockRadius     — refuses to overlap another blocking object. Only
 *                     buildings block; nature and decor may overlap freely,
 *                     which is how decorating actually works.
 *   walkRadius      — solid to the player in play mode. 0 = walk through.
 */
function defineAsset({
  id,
  label,
  category,
  icon,
  file,
  footprintRadius,
  blockRadius = 0,
  walkRadius = 0,
  defaultScale = 1,
  minScale = null,
  maxScale = null,
  scaleStep = null,
  sizeAxis = "height",
  sizeInPlayers = 1,
  terrainSnap = true,
}) {
  const resolvedMinScale = minScale ?? defaultScale * 0.4;
  const resolvedMaxScale = maxScale ?? defaultScale * 2.5;
  const resolvedScaleStep = scaleStep ?? defaultScale * 0.05;

  return Object.freeze({
    id,
    label,
    category,
    icon,
    modelPath: `${ASSETS.modelDir}/${file}`,
    thumbnailPath: null,
    footprintRadius,
    blockRadius,
    walkRadius,
    minScale: resolvedMinScale,
    maxScale: resolvedMaxScale,
    defaultScale,
    scaleStep: resolvedScaleStep,
    sizeAxis,
    sizeInPlayers,
    terrainSnap,
  });
}

export const BUILDABLE_ASSETS = Object.freeze({
  tree: defineAsset({
    id: "tree",
    label: "ต้นไม้",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌳",
    file: "tree.glb",
    // Canopy is 5.6 m wide but the trunk is what you bump into.
    footprintRadius: 2.25,
    walkRadius: 0.55,
    defaultScale: 1.7,
    sizeInPlayers: 2.4,
  }),
  pine: defineAsset({
    id: "pine",
    label: "สน",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌲",
    file: "pine.glb",
    footprintRadius: 0.4,
    walkRadius: 0.4,
    defaultScale: 1.9,
    sizeInPlayers: 2.8,
  }),
  palm: defineAsset({
    id: "palm",
    label: "มะพร้าว",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌴",
    file: "palm.glb",
    footprintRadius: 0.55,
    walkRadius: 0.45,
    defaultScale: 1.2,
    sizeInPlayers: 2.6,
  }),
  grass: defineAsset({
    id: "grass",
    label: "พุ่มหญ้า",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌾",
    file: "grass.glb",
    footprintRadius: 0.2,
    defaultScale: 1,
    sizeInPlayers: 0.45,
  }),
  house: defineAsset({
    id: "house",
    label: "บ้าน",
    category: BUILD_CATEGORIES.BUILDINGS,
    icon: "🏡",
    file: "house.glb",
    footprintRadius: 2.25,
    blockRadius: 2.25,
    walkRadius: 2.1,
    defaultScale: 1.2,
    sizeInPlayers: 2.3,
  }),
  house2: defineAsset({
    id: "house2",
    label: "บ้าน 2",
    category: BUILD_CATEGORIES.BUILDINGS,
    icon: "🏠",
    file: "house2.glb",
    footprintRadius: 1.9,
    blockRadius: 1.9,
    walkRadius: 1.8,
    defaultScale: 1.2,
    sizeInPlayers: 2.3,
  }),
  path_tile: defineAsset({
    id: "path_tile",
    label: "แผ่นทางเดิน",
    category: BUILD_CATEGORIES.DECOR,
    icon: "🧱",
    file: "path_tile.glb",
    footprintRadius: 1,
    defaultScale: 1,
    sizeAxis: "footprint",
    sizeInPlayers: 1.15,
  }),
  crate: defineAsset({
    id: "crate",
    label: "ลัง",
    category: BUILD_CATEGORIES.DECOR,
    icon: "📦",
    file: "crate.glb",
    footprintRadius: 0.5,
    walkRadius: 0.45,
    defaultScale: 1,
    sizeInPlayers: 0.55,
  }),
  wine_barrel: defineAsset({
    id: "wine_barrel",
    label: "ถังไม้",
    category: BUILD_CATEGORIES.DECOR,
    icon: "🛢️",
    file: "wine_barrel.glb",
    footprintRadius: 0.5,
    walkRadius: 0.45,
    defaultScale: 1,
    sizeInPlayers: 0.75,
  }),
});

export function getBuildableAsset(id) {
  return BUILDABLE_ASSETS[id] ?? null;
}

export function getBuildableAssets() {
  return Object.values(BUILDABLE_ASSETS);
}
