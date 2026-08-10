export const BUILD_CATEGORIES = Object.freeze({
  NATURE: "nature",
  BUILDINGS: "buildings",
  FARMING: "farming",
  DECOR: "decor",
});

function defineAsset({
  id,
  label,
  category,
  icon,
  modelPath = null,
  thumbnailPath = null,
  placementRadius,
  minScale,
  maxScale,
  defaultScale = 1,
  terrainSnap = true,
}) {
  return Object.freeze({
    id,
    label,
    category,
    icon,
    modelPath,
    thumbnailPath,
    placementRadius,
    minScale,
    maxScale,
    defaultScale,
    terrainSnap,
  });
}

export const BUILDABLE_ASSETS = Object.freeze({
  tree: defineAsset({
    id: "tree",
    label: "Tree",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌳",
    modelPath: null,
    thumbnailPath: null,
    placementRadius: 1.15,
    minScale: 0.45,
    maxScale: 2.25,
  }),
  palm: defineAsset({
    id: "palm",
    label: "Palm",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌴",
    modelPath: null,
    thumbnailPath: null,
    placementRadius: 1.15,
    minScale: 0.45,
    maxScale: 2.25,
  }),
  pine: defineAsset({
    id: "pine",
    label: "Pine",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌲",
    modelPath: null,
    thumbnailPath: null,
    placementRadius: 1.15,
    minScale: 0.45,
    maxScale: 2.25,
  }),
  house: defineAsset({
    id: "house",
    label: "House",
    category: BUILD_CATEGORIES.BUILDINGS,
    icon: "🏡",
    modelPath: null,
    thumbnailPath: null,
    placementRadius: 2.65,
    minScale: 0.7,
    maxScale: 1.5,
  }),
});

export function getBuildableAsset(id) {
  return BUILDABLE_ASSETS[id] ?? null;
}

export function getBuildableAssetsByCategory(category) {
  return Object.values(BUILDABLE_ASSETS).filter(
    (asset) => asset.category === category
  );
}

export function getBuildableAssets() {
  return Object.values(BUILDABLE_ASSETS);
}

export function hasExternalModel(asset) {
  return Boolean(asset?.modelPath);
}

export function getAssetThumbnail(asset) {
  return asset?.thumbnailPath ?? null;
}
