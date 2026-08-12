import { ASSETS } from "../config.js";

export const BUILD_CATEGORIES = Object.freeze({
  NATURE: "nature",
  BUILDINGS: "buildings",
  DECOR: "decor",
});

function defineAsset({
  id,
  label,
  category,
  icon,
  file,
  placementRadius,
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
    placementRadius,
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
    placementRadius: 1.15,
    defaultScale: 1.7,
    sizeInPlayers: 2.4,
  }),
  pine: defineAsset({
    id: "pine",
    label: "สน",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌲",
    file: "pine.glb",
    placementRadius: 1.15,
    defaultScale: 1.9,
    sizeInPlayers: 2.8,
  }),
  palm: defineAsset({
    id: "palm",
    label: "มะพร้าว",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌴",
    file: "palm.glb",
    placementRadius: 1.15,
    defaultScale: 1.2,
    sizeInPlayers: 2.6,
  }),
  grass: defineAsset({
    id: "grass",
    label: "พุ่มหญ้า",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌾",
    file: "grass.glb",
    placementRadius: 0.6,
    defaultScale: 1,
    sizeInPlayers: 0.45,
  }),
  house: defineAsset({
    id: "house",
    label: "บ้าน",
    category: BUILD_CATEGORIES.BUILDINGS,
    icon: "🏡",
    file: "house.glb",
    placementRadius: 2.65,
    defaultScale: 1.2,
    sizeInPlayers: 2.3,
  }),
  house2: defineAsset({
    id: "house2",
    label: "บ้าน 2",
    category: BUILD_CATEGORIES.BUILDINGS,
    icon: "🏠",
    file: "house2.glb",
    placementRadius: 2.65,
    defaultScale: 1.2,
    sizeInPlayers: 2.3,
  }),
  path_tile: defineAsset({
    id: "path_tile",
    label: "แผ่นทางเดิน",
    category: BUILD_CATEGORIES.DECOR,
    icon: "🧱",
    file: "path_tile.glb",
    placementRadius: 0.7,
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
    placementRadius: 0.6,
    defaultScale: 1,
    sizeInPlayers: 0.55,
  }),
  wine_barrel: defineAsset({
    id: "wine_barrel",
    label: "ถังไม้",
    category: BUILD_CATEGORIES.DECOR,
    icon: "🛢️",
    file: "wine_barrel.glb",
    placementRadius: 0.65,
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
