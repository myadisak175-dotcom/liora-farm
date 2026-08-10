export const BUILD_CATEGORIES = Object.freeze({
  NATURE: "nature",
  BUILDINGS: "buildings",
  FARMING: "farming",
  DECOR: "decor",
});

export const BUILDABLE_ASSETS = Object.freeze({
  tree: Object.freeze({
    id: "tree",
    label: "Tree",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌳",
    placementRadius: 1.15,
    minScale: 0.45,
    maxScale: 2.25,
    defaultScale: 1,
    terrainSnap: true,
  }),
  palm: Object.freeze({
    id: "palm",
    label: "Palm",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌴",
    placementRadius: 1.15,
    minScale: 0.45,
    maxScale: 2.25,
    defaultScale: 1,
    terrainSnap: true,
  }),
  pine: Object.freeze({
    id: "pine",
    label: "Pine",
    category: BUILD_CATEGORIES.NATURE,
    icon: "🌲",
    placementRadius: 1.15,
    minScale: 0.45,
    maxScale: 2.25,
    defaultScale: 1,
    terrainSnap: true,
  }),
  house: Object.freeze({
    id: "house",
    label: "House",
    category: BUILD_CATEGORIES.BUILDINGS,
    icon: "🏡",
    placementRadius: 2.65,
    minScale: 0.7,
    maxScale: 1.5,
    defaultScale: 1,
    terrainSnap: true,
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
