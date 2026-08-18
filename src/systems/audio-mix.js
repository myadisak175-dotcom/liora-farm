/**
 * The decisions the audio bootstrap makes every frame, with no DOM or Web
 * Audio attached.
 *
 * The bootstrap owns wiring: HTML media elements, decoded footstep buffers,
 * autoplay unlocking. Everything it *decides* — which ambience is audible at
 * this hour, how fast a crossfade moves, when a silent track should stop
 * costing battery, how far Liora walks between footfalls — lives here so it
 * can be tested without a phone in hand. Audio bugs on mobile are expensive to
 * reproduce; these are the parts that used to be untestable and therefore kept
 * regressing.
 */

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Relative loudness of each long track at full weight. */
export const STREAM_MIX = Object.freeze({ music: 0.24, birds: 0.80, night: 0.80, wind: 0.45 });

/** The order streams are created and mixed in. */
export const STREAM_NAMES = Object.freeze(["music", "birds", "night", "wind"]);

/**
 * Footstep cadence. `spacing` is metres of ground travel between footfalls, so
 * the cadence follows the resolved movement of the character instead of a
 * timer that keeps ticking when she is blocked by a collider.
 */
export const STEP_PROFILE = Object.freeze({
  // Slow walking stays audible but sits well behind the ambience on a phone.
  walk: { spacing: 1.52, playbackRate: 0.94, gain: 0.30 },
  run: { spacing: 1.52, playbackRate: 1.00, gain: 0.38 },
  waterWalk: { spacing: 1.34, playbackRate: 0.94, gain: 0.40 },
  waterRun: { spacing: 1.24, playbackRate: 1.04, gain: 0.44 },
});

export const DIRT_SURFACES = new Set(["dirt", "sand", "cracked_dirt"]);
export const HARD_SURFACES = new Set(["rock", "cobblestone_path"]);

/** Ankle-deep is enough to swap grass footfalls for splashes. */
export const WATER_STEP_DEPTH = 0.055;

/** A jump larger than this is a teleport or a world switch, never a stride. */
export const TELEPORT_DISTANCE = 2;

/** Where in the stride the first step after standing still lands. */
export const FIRST_STEP_PHASE = 0.48;

/**
 * A stream quieter than the pause level is stopped outright, and only starts
 * again once it climbs past the play level. The gap is hysteresis: without it
 * the night track would stutter between play and pause around dusk, and on
 * iOS — where element volume is read-only — pausing is the *only* way to make
 * a track silent at all.
 */
export const STREAM_PLAY_LEVEL = 0.035;
export const STREAM_PAUSE_LEVEL = 0.006;

/**
 * The clock can hand us anything: a missing runtime, a paused day-night cycle
 * mid-write, or an hour that has run past midnight without wrapping. Bird and
 * cricket weights are piecewise, so an out-of-range hour used to silence the
 * whole ambience layer instead of wrapping around to night.
 */
export function normalizeHour(hour) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return 12;
  // An hour already inside the day is handed back untouched: `((h % 24) + 24) %
  // 24` costs a float ulp, which is enough to land 5.2 just under the dawn
  // boundary and leave a whisper of crickets under the first birdsong.
  if (value >= 0 && value < 24) return value;
  return ((value % 24) + 24) % 24;
}

/**
 * Morning/day birds hand over to the forest track at dusk without bringing
 * crickets into the morning mix.
 */
export function birdWeight(hour) {
  const h = normalizeHour(hour);
  if (h < 5.2 || h >= 18.5) return 0;
  if (h < 6.5) return clamp01((h - 5.2) / 1.3);
  if (h < 10.0) return 1.0;
  if (h < 16.5) return 0.78;
  return 0.78 * clamp01(1 - (h - 16.5) / 2.0);
}

export function nightWeight(hour) {
  const h = normalizeHour(hour);
  if (h >= 18.5) return clamp01((h - 18.5) / 1.0);
  if (h < 4.8) return 1;
  // End crickets before the bird layer begins: morning and daytime should
  // sound like birds, never a bird/cricket blend.
  if (h < 5.2) return clamp01(1 - (h - 4.8) / 0.4);
  return 0;
}

/** Slow breathing applied to the tree-wind layer so it never sits flat. */
export function windBreath(phase) {
  const p = Number.isFinite(phase) ? phase : 0;
  return clamp01(0.78 + Math.sin(p * 0.31) * 0.13 + Math.sin(p * 0.73) * 0.09);
}

/** Target volume of every long track for one moment of game time. */
export function streamLevels({ hour, muted = false, windPhase = 0 } = {}) {
  if (muted) return { music: 0, birds: 0, night: 0, wind: 0 };
  const h = normalizeHour(hour);
  return {
    music: STREAM_MIX.music,
    birds: clamp01(STREAM_MIX.birds * birdWeight(h)),
    night: clamp01(STREAM_MIX.night * nightWeight(h)),
    wind: clamp01(STREAM_MIX.wind * windBreath(windPhase)),
  };
}

/**
 * Frame-rate independent glide toward a target, snapping once the remaining
 * distance stops mattering. Without the snap a "silent" track keeps an
 * infinitesimal volume forever and never reaches the pause threshold.
 */
export function approach(current, target, dt, tau = 0.42) {
  const from = Number.isFinite(current) ? current : 0;
  const to = Number.isFinite(target) ? target : 0;
  const step = Math.max(0.001, Number.isFinite(dt) ? dt : 0.016);
  const blend = 1 - Math.exp(-step / Math.max(0.01, tau));
  const next = from + (to - from) * blend;
  return Math.abs(next - to) < 0.001 ? to : next;
}

/** Whether a track at this level should be playing, with hysteresis. */
export function shouldStreamPlay(level, playing) {
  const value = Number.isFinite(level) ? level : 0;
  if (value >= STREAM_PLAY_LEVEL) return true;
  if (value <= STREAM_PAUSE_LEVEL) return false;
  return Boolean(playing);
}

/** Which cadence profile the resolved movement state calls for. */
export function profileKeyFor(state) {
  const waterDepth = Number(state?.waterDepth) || 0;
  const running = Boolean(state?.running);
  if (waterDepth >= WATER_STEP_DEPTH) return running ? "waterRun" : "waterWalk";
  return running ? "run" : "walk";
}

/** Painted ground under the foot picks the running bank. */
export function runBankForSurface(surface) {
  if (DIRT_SURFACES.has(surface)) return "runDirt";
  if (HARD_SURFACES.has(surface)) return "runGround";
  return "run";
}

/**
 * Distance-driven footfall cadence.
 *
 * `advance` returns how many steps to play this frame. It is capped, because a
 * dropped frame or a lag spike must not fire a burst of footsteps — and any
 * distance left over past the cap is dropped rather than banked, which is what
 * used to turn one stutter into several seconds of machine-gun steps.
 */
export function createStepper({ firstStepPhase = FIRST_STEP_PHASE, maxStepsPerFrame = 2 } = {}) {
  let distanceSinceStep = 0;
  let wasMoving = false;
  let activeProfile = "-";

  function reset() {
    distanceSinceStep = 0;
    wasMoving = false;
    activeProfile = "-";
  }

  return {
    reset,
    get profile() { return activeProfile; },
    get phase() {
      const profile = STEP_PROFILE[activeProfile];
      return profile ? clamp01(distanceSinceStep / profile.spacing) : 0;
    },
    advance({ moving, profileKey, distance } = {}) {
      const profile = STEP_PROFILE[profileKey] ?? STEP_PROFILE.walk;
      if (!moving) {
        reset();
        return 0;
      }
      if (!wasMoving) {
        distanceSinceStep = profile.spacing * firstStepPhase;
      } else if (activeProfile !== "-" && activeProfile !== profileKey) {
        // Keep the stride phase when walking turns into running or into a
        // wade, so the switch never lands a step on top of the previous one.
        const previous = STEP_PROFILE[activeProfile];
        const phase = previous ? clamp01(distanceSinceStep / previous.spacing) : firstStepPhase;
        distanceSinceStep = profile.spacing * phase;
      }
      wasMoving = true;
      activeProfile = STEP_PROFILE[profileKey] ? profileKey : "walk";

      const travelled = Number(distance);
      if (Number.isFinite(travelled) && travelled >= 0 && travelled < TELEPORT_DISTANCE) {
        distanceSinceStep += travelled;
      } else {
        distanceSinceStep = profile.spacing * firstStepPhase;
      }

      let steps = 0;
      while (distanceSinceStep >= profile.spacing && steps < maxStepsPerFrame) {
        distanceSinceStep -= profile.spacing;
        steps += 1;
      }
      if (distanceSinceStep >= profile.spacing) distanceSinceStep = profile.spacing * firstStepPhase;
      return steps;
    },
  };
}
