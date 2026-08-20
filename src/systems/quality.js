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

const APPLE_MOBILE = typeof navigator !== "undefined" && (
  /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
);
const DISPLAY_PIXEL_RATIO = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
// A native 3x iPhone canvas is unnecessarily expensive for this world, but the
// old 2x cap visibly softened fine grass, character edges and the painted
// horizon on Retina displays. 2.5x is the high-end iOS sweet spot: much sharper
// without doubling the pixel cost of the established 2x high preset.
const HIGH_PIXEL_RATIO_CAP = APPLE_MOBILE
  ? Math.min(2.5, Math.max(2, DISPLAY_PIXEL_RATIO))
  : 2;

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
    hint: APPLE_MOBILE ? "Retina iPhone / iPad" : "คอม / มือถือแรง",
    maxPixelRatio: HIGH_PIXEL_RATIO_CAP,
    antialias: true,
    shadowMapSize: 2048,
    shadowBounds: 20,
    anisotropy: APPLE_MOBILE ? 12 : 8,
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
 * expose navigator.deviceMemory and some iOS releases report a conservative
 * hardwareConcurrency value, so a Retina Apple phone is treated as high-end
 * before the generic core-count fallback can incorrectly classify it as low.
 */
export function detectQualityId({
  isTouch = false,
  deviceMemory = null,
  cores = null,
  pixelRatio = 1,
  appleMobile = false,
} = {}) {
  if (!isTouch) return "high";
  if (appleMobile && pixelRatio >= 3) return "high";
  if (appleMobile && pixelRatio >= 2
      && Number.isFinite(cores) && cores >= 6) return "high";
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
  const pixelRatio = environment.pixelRatio
    ?? (typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
  const appleMobile = environment.appleMobile ?? APPLE_MOBILE;
  const detected = detectQualityId({
    isTouch,
    deviceMemory: environment.deviceMemory ?? navigator?.deviceMemory ?? null,
    cores: environment.cores ?? navigator?.hardwareConcurrency ?? null,
    pixelRatio,
    appleMobile,
  });

  let id = resolveQualityId(environment.stored ?? readStoredId(), detected);
  const listeners = new Set();

  const api = {
    isTouch,
    appleMobile,
    detected,
    get id() { return id; },
    get preset() { return QUALITY_PRESETS[id]; },
    get presets() { return QUALITY_ORDER.map((key) => QUALITY_PRESETS[key]); },
    get isAuto() { return !QUALITY_ORDER.includes(readStoredId()); },
    set(next, { persist = true } = {}) {
      if (!QUALITY_ORDER.includes(next) || next === id) return api.preset;
      id = next;
      if (persist) writeStoredId(next);
      for (const listener of listeners) listener(api.preset);
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
