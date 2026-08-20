import * as THREE from "three";

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
// 2.25x looked excellent but could saturate an iPhone GPU before the adaptive
// controller had time to react. Start at 2.0x instead: it still renders a crisp
// Retina image, while cutting about 21% of the fragment workload versus 2.25x.
// All High-tier lighting, shadows, AO, normals and cloud effects remain intact.
const HIGH_PIXEL_RATIO_CAP = APPLE_MOBILE
  ? Math.min(2, Math.max(1.8, DISPLAY_PIXEL_RATIO))
  : 2;

/**
 * iOS dynamic resolution, installed before main.js creates its renderer.
 *
 * We deliberately adapt only the render resolution — never shadows, AO,
 * normals, clouds or world detail. The player therefore keeps the High visual
 * preset while the GPU gets a temporary pixel-count reduction during sustained
 * slow frames. Resolution climbs back only after several seconds of stable
 * ~60 fps pacing, which avoids visible oscillation while the camera is moving.
 *
 * WebGLRenderer.setPixelRatio() already resizes the drawing buffer without
 * changing the canvas' CSS size, so this is cheap enough to do occasionally.
 * A long cooldown and small DPR steps keep each transition subtle.
 */
function installIOSAdaptiveResolution() {
  if (!APPLE_MOBILE || typeof window === "undefined" || typeof performance === "undefined") return;
  const proto = THREE.WebGLRenderer?.prototype;
  if (!proto || proto.__lioraAdaptiveResolutionInstalled) return;

  const originalSetPixelRatio = proto.setPixelRatio;
  const originalRender = proto.render;
  if (typeof originalSetPixelRatio !== "function" || typeof originalRender !== "function") return;

  const STATE = Symbol("lioraAdaptiveResolution");
  const STEP = 0.15;
  const FLOOR = 1.7;
  const SLOW_EMA_MS = 18.5;       // ~54 fps sustained
  const STABLE_EMA_MS = 17.25;    // ~58+ fps sustained
  const SLOW_HOLD_MS = 520;
  const STABLE_HOLD_MS = 7000;
  const DOWN_COOLDOWN_MS = 1200;
  const UP_COOLDOWN_MS = 3500;
  const WARMUP_MS = 900;

  function roundDpr(value) {
    return Math.round(value * 100) / 100;
  }

  function publish(state) {
    state.stats.enabled = state.active;
    state.stats.currentPixelRatio = state.current;
    state.stats.minPixelRatio = state.floor;
    state.stats.maxPixelRatio = state.ceiling;
    state.stats.emaFrameMs = Math.round(state.emaMs * 100) / 100;
    state.stats.emaFps = Math.round((1000 / Math.max(1, state.emaMs)) * 10) / 10;
    state.stats.changes = state.changes;
    state.stats.lastDirection = state.lastDirection;
    window.__lioraAdaptiveResolution = state.stats;
  }

  function configure(renderer, requested) {
    const ceiling = Math.max(0.5, Number(requested) || 1);
    let state = renderer[STATE];
    if (!state) {
      state = {
        ceiling,
        floor: ceiling,
        current: ceiling,
        active: false,
        emaMs: 16.67,
        lastFrameAt: 0,
        slowMs: 0,
        stableMs: 0,
        cooldownUntil: 0,
        warmupUntil: performance.now() + WARMUP_MS,
        changes: 0,
        lastDirection: "initial",
        stats: {},
      };
      renderer[STATE] = state;
    }

    state.ceiling = roundDpr(ceiling);
    // Dynamic scaling is a High/Retina feature only. Medium and Low remain
    // exact player choices and are never silently pushed below their preset.
    state.active = state.ceiling >= 1.95 && DISPLAY_PIXEL_RATIO >= 2;
    state.floor = state.active ? Math.min(state.ceiling, FLOOR) : state.ceiling;
    state.current = state.ceiling;
    state.emaMs = 16.67;
    state.lastFrameAt = 0;
    state.slowMs = 0;
    state.stableMs = 0;
    state.cooldownUntil = performance.now() + DOWN_COOLDOWN_MS;
    state.warmupUntil = performance.now() + WARMUP_MS;
    state.lastDirection = "preset";
    publish(state);
    return state;
  }

  function applyAdaptive(renderer, state, next, direction, now) {
    const resolved = roundDpr(Math.max(state.floor, Math.min(state.ceiling, next)));
    if (Math.abs(resolved - state.current) < 0.01) return;
    state.current = resolved;
    state.changes += 1;
    state.lastDirection = direction;
    state.slowMs = 0;
    state.stableMs = 0;
    state.cooldownUntil = now + (direction === "down" ? DOWN_COOLDOWN_MS : UP_COOLDOWN_MS);
    // Call the original method directly so this adaptive change is not mistaken
    // for a new player-selected quality ceiling by our wrapper below.
    originalSetPixelRatio.call(renderer, resolved);
    publish(state);
  }

  proto.setPixelRatio = function lioraSetPixelRatio(value) {
    configure(this, value);
    return originalSetPixelRatio.call(this, value);
  };

  proto.render = function lioraAdaptiveRender(scene, camera) {
    const state = this[STATE];
    if (state?.active) {
      const now = performance.now();
      if (state.lastFrameAt > 0) {
        const frameMs = now - state.lastFrameAt;
        // Returning from the background or hitting a debugger breakpoint must
        // not look like a catastrophic GPU frame and force resolution down.
        if (frameMs > 0 && frameMs < 250) {
          const sample = Math.min(frameMs, 50);
          state.emaMs += (sample - state.emaMs) * 0.1;

          if (now >= state.warmupUntil) {
            if (state.emaMs > SLOW_EMA_MS) {
              // A genuinely bad 30+ ms frame carries extra weight, so thermal
              // throttling or a dense scene gets relief quickly.
              state.slowMs += frameMs * (frameMs >= 30 ? 1.7 : 1);
              state.stableMs = Math.max(0, state.stableMs - frameMs * 1.8);
            } else if (state.emaMs < STABLE_EMA_MS) {
              state.stableMs += frameMs;
              state.slowMs = Math.max(0, state.slowMs - frameMs * 1.4);
            } else {
              state.slowMs = Math.max(0, state.slowMs - frameMs * 0.5);
              state.stableMs = Math.max(0, state.stableMs - frameMs * 0.35);
            }

            if (now >= state.cooldownUntil) {
              if (state.slowMs >= SLOW_HOLD_MS && state.current > state.floor + 0.01) {
                applyAdaptive(this, state, state.current - STEP, "down", now);
              } else if (state.stableMs >= STABLE_HOLD_MS && state.current < state.ceiling - 0.01) {
                applyAdaptive(this, state, state.current + STEP, "up", now);
              }
            }
          }
        } else if (frameMs >= 250) {
          state.emaMs = 16.67;
          state.slowMs = 0;
          state.stableMs = 0;
          state.warmupUntil = now + 900;
        }
      }
      state.lastFrameAt = now;
      publish(state);
    }
    return originalRender.call(this, scene, camera);
  };

  Object.defineProperty(proto, "__lioraAdaptiveResolutionInstalled", {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

installIOSAdaptiveResolution();

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
