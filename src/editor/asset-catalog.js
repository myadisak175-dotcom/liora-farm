export const BUILD_CATEGORIES = Object.freeze({
  NATURE: "nature",
  BUILDINGS: "buildings",
  DECOR: "decor",
  PATH: "path",
});

let ASSETS = Object.freeze({});
let CATEGORIES = Object.freeze([]);

function normalize(raw, root) {
  if (!raw || typeof raw.id !== "string") return null;
  if (typeof raw.modelPath !== "string") return null;
  return Object.freeze({
    id: raw.id,
    label: raw.label ?? raw.id,
    category: raw.category ?? BUILD_CATEGORIES.DECOR,
    icon: raw.icon ?? "▪",
    modelPath: root + raw.modelPath,
    thumbnailPath: raw.thumbnailPath ? root + raw.thumbnailPath : null,
    placementRadius: Number(raw.footprint ?? 1),
    minScale: Number(raw.minScale ?? 0.5),
    maxScale: Number(raw.maxScale ?? 2),
    defaultScale: Number(raw.defaultScale ?? 1),
    terrainSnap: raw.terrainSnap !== false,
  });
}

export async function loadCatalog({ url, root = "" } = {}) {
  if (!url) throw new Error("loadCatalog requires a url");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Catalog HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.assets)) throw new Error("Catalog has no assets array");

  const map = {};
  for (const raw of data.assets) {
    const asset = normalize(raw, root);
    if (!asset) {
      console.warn("Skipping malformed catalog entry", raw);
      continue;
    }
    if (map[asset.id]) throw new Error(`Duplicate asset id: ${asset.id}`);
    map[asset.id] = asset;
  }

  ASSETS = Object.freeze(map);
  CATEGORIES = Object.freeze(
    Array.isArray(data.categories) ? [...data.categories] : []
  );
  return ASSETS;
}

export function getCatalogMap() {
  return ASSETS;
}

export function getCatalogCategories() {
  return CATEGORIES;
}

export function getBuildableAsset(id) {
  return ASSETS[id] ?? null;
}

export function getBuildableAssets() {
  return Object.values(ASSETS);
}

export function getBuildableAssetsByCategory(category) {
  return Object.values(ASSETS).filter((a) => a.category === category);
}

export function hasExternalModel(asset) {
  return Boolean(asset?.modelPath);
}

export function getAssetThumbnail(asset) {
  return asset?.thumbnailPath ?? null;
}
