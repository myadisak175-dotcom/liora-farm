/**
 * One place that decides how expensive this frame is allowed to be.
 *
 * The rules here:
 * - A preset is data, not code.
 * - The player's explicit choice always wins and is remembered.
 * - Auto-detection only picks the starting point.
 */

// v2 intentionally ignores quality choices written by the old detector. That
// detector classified modern Safari phones as medium because Safari exposes no
// deviceMemory signal, so an old stored "medium" could permanently override a
// corrected detector and leave Retina rendering soft even after the code fix.
export const QUALITY_STORAGE_KEY = "liora.quality.v2";

export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({
    id: "low",
    label: "ต่ำ",
    hint: "เครื่องช้า / แบตน้อย",
    maxPixelRatio: 1,
    antialias: false,
    shadowMapSize: 512,
    shadowBounds: 9,
    anisotropy: 1,
    cloudShadows: false,
    groundAO: true,
    detailNormals: false,
    blobShadows: true,
    skyCloudDensity: 0.68,
    leafCount: 0,
    insectCount: 2,
    foliageInteraction: true,
  }),
  medium: Object.freeze({
    id: "medium",
    label: "กลาง",
    hint: "มือถือทั่วไป",
    maxPixelRatio: 1.5,
    antialias: false,
    shadowMapSize: 1024,
    shadowBounds: 14,
    anisotropy: 4,
    cloudShadows: true,
    groundAO: true,
    detailNormals: true,
    blobShadows: true,
    skyCloudDensity: 0.84,
    leafCount: 0,
    insectCount: 4,
    foliageInteraction: true,
  }),
  high: Object.freeze({
    id: "high",
    label: "สูง",
    hint: "คอม / มือถือแรง",
    maxPixelRatio: 2,
    antialias: true,
    shadowMapSize: 2048,
    shadowBounds: 20,
    anisotropy: 8,
    cloudShadows: true,
    groundAO: true,
    detailNormals: true,
    blobShadows: true,
    skyCloudDensity: 1,
    leafCount: 0,
    insectCount: 6,
    foliageInteraction: true,
  }),
});

export const QUALITY_ORDER = Object.freeze(["low", "medium", "high"]);

/**
 * Best guess at a starting tier.
 *
 * Missing browser signals are never interpreted as "slow". Safari does not
 * expose navigator.deviceMemory, so a dense 3x display plus six or more cores
 * is enough to identify a modern high-end mobile class. Android devices with a
 * real memory signal continue to use that stronger signal first.
 */
export function detectQualityId({
  isTouch = false,
  deviceMemory = null,
  cores = null,
  pixelRatio = 1,
} = {}) {
  if (!isTouch) return "high";
  if (Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 3) return "low";
  if (Number.isFinite(cores) && cores > 0 && cores <= 4) return "low";
  if (Number.isFinite(deviceMemory) && deviceMemory >= 6) return "high";
  if (!Number.isFinite(deviceMemory) && pixelRatio >= 3
      && Number.isFinite(cores) && cores >= 6) return "high";
  if (pixelRatio >= 3 && Number.isFinite(cores) && cores >= 8) return "high";
  return "medium";
}

export function resolveQualityId(stored, detected) {
  return QUALITY_ORDER.includes(stored) ? stored : detected;
}

function readStoredId() {
  try {
    return localStorage.getItem(QUALITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredId(id) {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, id);
  } catch {
    /* session-only in private mode */
  }
}

export function createQuality(environment = {}) {
  const isTouch = environment.isTouch
    ?? (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
  const detected = detectQualityId({
    isTouch,
    deviceMemory: environment.deviceMemory ?? navigator?.deviceMemory ?? null,
    cores: environment.cores ?? navigator?.hardwareConcurrency ?? null,
    pixelRatio: environment.pixelRatio ?? (typeof devicePixelRatio === "number" ? devicePixelRatio : 1),
  });

  let id = resolveQualityId(environment.stored ?? readStoredId(), detected);
  const listeners = new Set();

  const api = {
    isTouch,
    detected,
    get id() { return id; },
    get preset() { return QUALITY_PRESETS[id]; },
    get presets() { return QUALITY_ORDER.map((key) => QUALITY_PRESETS[key]); },
    get isAuto() { return !QUALITY_ORDER.includes(readStoredId()); },
    set(next, { persist = true } = {}) {
      if (!QUALITY_ORDER.includes(next) || next === id) return api.preset;
      id = next;
      if (persist) writeStoredId(next);
      for (const listener of listeners) listener(QUALITY_PRESETS[id]);
      return api.preset;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  Object.defineProperties(api, {
    maxPixelRatio: { get: () => api.preset.maxPixelRatio, enumerable: true },
    antialias: { get: () => api.preset.antialias, enumerable: true },
    shadowMapSize: { get: () => api.preset.shadowMapSize, enumerable: true },
  });

  return api;
}
