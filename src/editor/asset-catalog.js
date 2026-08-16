import { ASSETS } from "../config.js";
import { NATURE_V2_ASSETS } from "./nature-catalog-v2.js";

export const BUILD_CATEGORIES = Object.freeze({
  NATURE: "nature",
  BUILDINGS: "buildings",
  DECOR: "decor",
});

export const RETIRED_LEGACY_NATURE_IDS = Object.freeze(["tree", "pine", "palm"]);
export const REUSABLE_LEGACY_NATURE_IDS = Object.freeze(["grass"]);

/**
 * Builder palette policy.
 *
 * Nature V2 is the production tree/rock/plant set. The legacy grass clump stays
 * placeable because it is still useful as a plant/crop-like prop, while the old
 * tree, pine and palm models stay registered only for backwards-compatible
 * loading of existing maps and saves.
 *
 * Buildings and decor remain visible until their own replacement sets exist.
 */
export const PRIMARY_ASSET_POLICY = Object.freeze({
  natureSet: "world-v2",
  stableIdPrefix: "v2-",
  legacyNatureMode: "trees-fallback-only",
  requireNamedNode: true,
  requireSourceMetrics: true,
  requireTerrainSnap: true,
});

/**
 * Three radii answer three different questions:
 * footprintRadius keeps an object on the island and spaces duplicates,
 * blockRadius prevents solid buildables overlapping each other, and
 * walkRadius is what the player collides with.
 *
 * Terrain rules are opt-in. `maxGroundSlope` is the largest rise/run sampled
 * under the base; assets without it (trees, grass, barrels) remain free to sit
 * on natural slopes. Buildings opt in because a centre-point Y snap alone can
 * otherwise leave corners floating or buried after sculpting.
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
  maxGroundSlope = null,
  groundProbeRadius = null,
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
    maxGroundSlope,
    groundProbeRadius,
  });
}

export const BUILDABLE_ASSETS = Object.freeze({
  tree: defineAsset({
    id: "tree",
    label: "ต้นไม้",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌳",
    file: "tree.glb",
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
    maxGroundSlope: 0.16,
    groundProbeRadius: 2.0,
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
    maxGroundSlope: 0.16,
    groundProbeRadius: 1.7,
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

  // World V2 is the primary Nature set. Retired legacy tree IDs above remain
  // registered only for backwards-compatible load/save behavior.
  ...NATURE_V2_ASSETS,
});

export function isPrimaryBuilderAsset(asset) {
  if (!asset) return false;

  // Until buildings/decor receive V2 replacements, keep their existing assets
  // in the palette. The legacy grass also remains useful as a plant-like prop.
  if (asset.category !== BUILD_CATEGORIES.NATURE) return true;
  if (REUSABLE_LEGACY_NATURE_IDS.includes(asset.id)) return true;

  if (asset.worldV2 !== true) return false;
  if (!asset.id?.startsWith(PRIMARY_ASSET_POLICY.stableIdPrefix)) return false;
  if (PRIMARY_ASSET_POLICY.requireNamedNode && !asset.nodeName) return false;
  if (
    PRIMARY_ASSET_POLICY.requireSourceMetrics &&
    !(Number.isFinite(asset.sourceHeight) && asset.sourceHeight > 0 &&
      Number.isFinite(asset.sourceWidth) && asset.sourceWidth > 0 &&
      Number.isFinite(asset.tris) && asset.tris > 0)
  ) {
    return false;
  }
  if (PRIMARY_ASSET_POLICY.requireTerrainSnap && asset.terrainSnap !== true) return false;

  return true;
}

export function getBuildableAsset(id) {
  return BUILDABLE_ASSETS[id] ?? null;
}

// Builder palette: V2 Nature plus explicitly reusable legacy assets.
export function getBuildableAssets() {
  return Object.values(BUILDABLE_ASSETS).filter(isPrimaryBuilderAsset);
}

// Migration/debugging only: includes retired fallback assets so old saves remain
// inspectable and testable while the V2 rollout is reversible.
export function getAllBuildableAssets() {
  return Object.values(BUILDABLE_ASSETS);
}
