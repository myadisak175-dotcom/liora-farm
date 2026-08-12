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
  const backupKey = `${storageKey}.backup`;
  let lastIssue = null;

  function save(items) {
    const payload = {
      version: CURRENT_SCHEMA_VERSION,
      savedAt: Date.now(),
      items: items.map(normalizeItem).filter(Boolean),
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (error) {
      lastIssue = { kind: "save-failed", error: String(error) };
      console.warn("Builder layout could not be saved", error);
    }
    return payload;
  }

  function hasSavedLayout() {
    return localStorage.getItem(storageKey) !== null;
  }

  /**
   * A payload from a different schema version used to be dropped on the floor
   * and then overwritten by the next autosave — an entire island's worth of
   * work gone with no warning. Keep a copy and say so.
   */
  function backup(raw, reason) {
    try {
      localStorage.setItem(backupKey, raw);
      lastIssue = { kind: reason, backupKey };
      console.warn(`Builder layout kept at "${backupKey}" (${reason})`);
    } catch (error) {
      lastIssue = { kind: reason, backupKey: null };
      console.warn("Builder layout backup failed", error);
    }
  }

  function load() {
    lastIssue = null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];

    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      backup(raw, "unreadable");
      console.warn("Builder layout could not be parsed", error);
      return [];
    }

    if (payload?.version !== CURRENT_SCHEMA_VERSION) {
      backup(raw, "version-mismatch");
      return [];
    }
    if (!Array.isArray(payload.items)) {
      backup(raw, "malformed");
      return [];
    }
    return payload.items.map(normalizeItem).filter(Boolean);
  }

  function clear() {
    localStorage.removeItem(storageKey);
  }

  return {
    save,
    load,
    clear,
    hasSavedLayout,
    storageKey,
    backupKey,
    get lastIssue() {
      return lastIssue;
    },
  };
}
