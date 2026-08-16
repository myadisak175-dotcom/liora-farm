import { createLocalStore } from "../systems/local-store.js";

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
  // The backup-instead-of-lose policy this file used to own now lives in
  // local-store.js, so ground paint, terrain and the farm get it too. The
  // saved schema and the `lastIssue` kinds are unchanged.
  const store = createLocalStore({ key: storageKey, version: CURRENT_SCHEMA_VERSION });

  function save(items) {
    const payload = {
      version: CURRENT_SCHEMA_VERSION,
      savedAt: Date.now(),
      items: items.map(normalizeItem).filter(Boolean),
    };
    store.save(payload);
    return payload;
  }

  function load() {
    const payload = store.load();
    if (!payload) return [];
    if (!Array.isArray(payload.items)) {
      store.rejectLoaded("malformed");
      return [];
    }
    return payload.items.map(normalizeItem).filter(Boolean);
  }

  return {
    save,
    load,
    clear: () => store.clear(),
    hasSavedLayout: () => store.has(),
    storageKey: store.key,
    backupKey: store.backupKey,
    get lastIssue() {
      return store.lastIssue;
    },
  };
}
