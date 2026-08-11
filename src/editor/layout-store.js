const DEFAULT_STORAGE_KEY = "liora-home-island-layout";
const CURRENT_SCHEMA_VERSION = 1;

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  if (typeof item.assetId !== "string") return null;

  const x = Number(item.x);
  const z = Number(item.z);
  const rotation = Number(item.rotation ?? 0);
  const scale = Number(item.scale ?? 1);

  if (![x, z, rotation, scale].every(Number.isFinite)) return null;

  return {
    id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
    assetId: item.assetId,
    x,
    z,
    rotation,
    scale,
  };
}

export function createLayoutStore({ storageKey = DEFAULT_STORAGE_KEY } = {}) {
  function save(items) {
    const payload = {
      version: CURRENT_SCHEMA_VERSION,
      savedAt: Date.now(),
      items: items.map(normalizeItem).filter(Boolean),
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    return payload;
  }

  function load() {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];

    try {
      const payload = JSON.parse(raw);
      if (payload?.version !== CURRENT_SCHEMA_VERSION) return [];
      if (!Array.isArray(payload.items)) return [];
      return payload.items.map(normalizeItem).filter(Boolean);
    } catch (error) {
      console.warn("Builder layout could not be loaded", error);
      return [];
    }
  }

  function hasSaved() {
    try {
      return Boolean(localStorage.getItem(storageKey));
    } catch (error) {
      console.warn("Builder layout presence could not be checked", error);
      return false;
    }
  }

  function clear() {
    localStorage.removeItem(storageKey);
  }

  return { save, load, hasSaved, clear, storageKey };
}
