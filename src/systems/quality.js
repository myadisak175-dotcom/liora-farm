/**
 * One place that decides how expensive this frame is allowed to be.
 *
 * Before this, quality was a single `isTouch` boolean, which answers the wrong
 * question: a flagship phone and a five-year-old budget phone both report
 * `pointer: coarse` and got identical settings, while every effect added since
 * then had its own private on/off switch buried in its own config block.
 *
 * The rules here:
 *
 * - A preset is data, not code. Adding an effect means adding a field to the
 *   three presets, not another `if (isTouch)` somewhere.
 * - The player's explicit choice always wins and is remembered. Auto-detection
 *   only picks the starting point.
 * - Nothing here imports THREE or touches the DOM beyond `matchMedia` and
 *   `localStorage`, so the presets can be unit-tested directly.
 */

export const QUALITY_STORAGE_KEY = "liora.quality.v1";

export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({
    id: "low",
    label: "ต่ำ",
    hint: "เครื่องช้า / แบตน้อย",
    maxPixelRatio: 1,
    antialias: false,
    shadowMapSize: 512,
    // Shadows cost a whole extra render of the scene per frame, so the cheap
    // tier spends its budget on resolution and keeps the shadow area tight.
    shadowBounds: 9,
    anisotropy: 1,
    cloudShadows: false,
    groundAO: true,
    detailNormals: false,
    blobShadows: true,
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
  }),
});

export const QUALITY_ORDER = Object.freeze(["low", "medium", "high"]);

/**
 * Best guess at a starting tier.
 *
 * `deviceMemory` and `hardwareConcurrency` are both missing on plenty of
 * browsers, so every branch has to survive `undefined` — an absent signal must
 * never read as "this device is slow", or Safari users all start on low.
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
    /** True when the player has never chosen — the HUD marks it "อัตโนมัติ". */
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

  // The old QUALITY shape, so existing call sites keep working unchanged.
  Object.defineProperties(api, {
    maxPixelRatio: { get: () => api.preset.maxPixelRatio, enumerable: true },
    antialias: { get: () => api.preset.antialias, enumerable: true },
    shadowMapSize: { get: () => api.preset.shadowMapSize, enumerable: true },
  });

  return api;
}
