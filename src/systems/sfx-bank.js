/**
 * Which one-shot sound effect belongs to which game moment, how loud it is, and
 * when it has to stay quiet — with no DOM or Web Audio attached.
 *
 * `src/audio-sfx.js` owns the wiring: decoding the files, playing buffers and
 * listening for events. Everything it *decides* lives here so it can be tested
 * in Node, the same split `audio-mix.js` makes for the long ambience streams.
 *
 * The two existing audio runtimes (Android native, iOS Web Audio) are not
 * touched by effects. Effects ride on their own small AudioContext and only
 * read the player's mute choice from `window.__lioraAudio`.
 */

const entry = (file, gain, cooldownMs, jitter = 0) =>
  Object.freeze({ file, gain, cooldownMs, jitter });

/**
 * `gain` is the level of the file at full weight, `cooldownMs` stops a held or
 * hammered button from machine-gunning the same sound, and `jitter` is the
 * +/- share of playback-rate variation that keeps a repeated sound from
 * sounding mechanical (0 for chimes, where a pitch change would sound wrong).
 */
export const SFX_BANK = Object.freeze({
  // Farm plot actions — played when the crop transaction actually succeeds.
  hoe: entry("sfx_hoe.mp3", 0.55, 200, 0.05),
  water: entry("sfx_water.mp3", 0.45, 200, 0.04),
  plant: entry("sfx_plant.mp3", 0.50, 200, 0.05),
  harvest: entry("sfx_harvest.mp3", 0.60, 200, 0.05),
  // Character emotes from the emote menu.
  pickUp: entry("sfx_pick_up.mp3", 0.45, 300, 0.05),
  hammer: entry("sfx_hammer.mp3", 0.55, 300, 0.05),
  mirror: entry("sfx_mirror.mp3", 0.40, 300, 0.03),
  // Interface and world feedback.
  uiTap: entry("sfx_ui_tap.mp3", 0.30, 60, 0.02),
  toast: entry("sfx_toast.mp3", 0.35, 500, 0),
  zoneEnter: entry("sfx_zone_enter.mp3", 0.40, 1500, 0),
});

export const SFX_NAMES = Object.freeze(Object.keys(SFX_BANK));

const SFX_NAME_SET = new Set(SFX_NAMES);

/** The bank entry for a name, or null — never a prototype property. */
export function sfxEntry(name) {
  return SFX_NAME_SET.has(name) ? SFX_BANK[name] : null;
}

/**
 * A toast that appears at the same moment as an action sound is the same
 * event, not a second one. The farm plot shows "รดน้ำแล้ว 💧" right as the
 * water sound plays; chiming on top of it would only muddy both.
 */
export const TOAST_YIELD_MS = 700;

const FARM_SOUNDS = new Map([
  ["hoe", "hoe"],
  ["water", "water"],
  ["plant", "plant"],
  ["harvest", "harvest"],
]);

const EMOTE_SOUNDS = new Map([
  ["pickUp", "pickUp"],
  ["hammer", "hammer"],
  ["mirror", "mirror"],
]);

export function soundForFarmAction(type) {
  return FARM_SOUNDS.get(type) ?? null;
}

/**
 * Gameplay events travel on the shared WORLD_EVENTS channel. Farm actions are
 * published there as `{ type: "farm-action", action }`, and zone entry already
 * arrives as `{ type: "enter", node }`. A disabled zone stays silent, the same
 * rule the on-screen "เข้าเขต" toast follows.
 */
export function soundForWorldEvent(event) {
  if (!event || typeof event !== "object") return null;
  if (event.type === "farm-action") return soundForFarmAction(event.action);
  if (event.type === "enter" && event.node?.enabled) return "zoneEnter";
  return null;
}

/**
 * One decision for every button press.
 *
 * - Only play mode makes sound: the builder is a dev tool with dozens of
 *   buttons and should stay quiet.
 * - The farm button stays silent at the tap; its outcome has its own sound.
 * - An emote button sounds only if the animation really started. The emote
 *   handler marks the button active in that case, so a tap that was refused
 *   ("wait for the pose to finish") does not make a sound for nothing.
 */
export function soundForButton({ mode, action, started = true } = {}) {
  if (mode !== "play") return null;
  if (action === "farm") return null;
  if (EMOTE_SOUNDS.has(action)) return started ? EMOTE_SOUNDS.get(action) : null;
  return "uiTap";
}

/**
 * Cooldown and toast-yield bookkeeping. `allow` both answers and records, so
 * call it only when the sound is really about to play: a sound that could not
 * play (file missing, muted) must not hold the toast chime back.
 */
export function createSfxGate() {
  const lastAt = new Map();
  let lastEffectAt = -Infinity;

  return {
    allow(name, now) {
      const bank = sfxEntry(name);
      const at = Number(now);
      if (!bank || !Number.isFinite(at)) return false;

      const previous = lastAt.get(name);
      if (previous !== undefined && at - previous < bank.cooldownMs) return false;
      if (name === "toast" && at - lastEffectAt < TOAST_YIELD_MS) return false;

      lastAt.set(name, at);
      if (name !== "toast") lastEffectAt = at;
      return true;
    },
    reset() {
      lastAt.clear();
      lastEffectAt = -Infinity;
    },
  };
}

/** Playback rate for one play: 1 +/- the sound's jitter, never outside it. */
export function playbackRateFor(name, random = Math.random) {
  const jitter = sfxEntry(name)?.jitter ?? 0;
  const roll = Number(random());
  const unit = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0.5;
  return 1 + (unit - 0.5) * 2 * jitter;
}
