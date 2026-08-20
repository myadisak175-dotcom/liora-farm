const STABILIZER_REVISION = "audio24-route2";

let routeSettled = false;
let gameplaySettled = false;
let disposed = false;
let kickCount = 0;
let repairTimer = 0;
let repairStartedAt = 0;
let lastGestureAt = 0;

function runtime() {
  return window.__lioraAudio ?? null;
}

function status() {
  try { return runtime()?.status ?? null; }
  catch { return null; }
}

function primaryGameplayReady(current = status()) {
  const ambience = current?.ambience ?? {};
  return Number(current?.decodedSteps ?? 0) >= 2
    && Boolean(ambience.birds?.loaded)
    && Boolean(ambience.wind?.loaded);
}

function publish(reason = "waiting", error = null) {
  const current = status();
  window.__lioraAudioStabilizer = {
    revision: STABILIZER_REVISION,
    settled: gameplaySettled,
    routeSettled,
    gameplaySettled,
    gameplayReady: primaryGameplayReady(current),
    kickCount,
    reason,
    ...(error ? { error } : {}),
    dispose,
  };
}

/**
 * iOS/WebKit can report a running AudioContext while its physical WebAudio
 * route is still silent. A real off/on tap repairs that route, so reproduce the
 * same gate without restarting music or resetting currentTime.
 */
function outputCycle(reason) {
  if (disposed || document.hidden) return false;
  const api = runtime();
  const current = status();
  if (!api || current?.platform !== "ios" || api.muted) return false;
  if (current?.activating) return false;
  if (!api.unlocked || current?.contextState !== "running") return false;

  try {
    api.setMuted(true);
    api.setMuted(false);
    // The context is already running here. This call only re-primes the output
    // oscillator path and does not depend on a new autoplay permission grant.
    void api.unlock?.();
    kickCount += 1;
    publish(reason);
    return true;
  } catch (error) {
    publish(reason, String(error?.message ?? error));
    return false;
  }
}

function clearRepairTimer() {
  if (repairTimer) clearTimeout(repairTimer);
  repairTimer = 0;
}

/**
 * Repair in two phases:
 *  1) as soon as music + AudioContext are unlocked, repair the general route;
 *  2) once walk/run + birds/wind have actually decoded, gate WebAudio again.
 *
 * The second phase is important. The previous stabilizer could mark itself
 * settled before any audible WebAudio buffer existed, so footsteps/ambience
 * stayed silent until the player manually toggled sound off/on later.
 */
function runRepairs(reason = "scheduled") {
  if (disposed || document.hidden) return false;
  const api = runtime();
  const current = status();
  if (!api || api.muted) return false;

  if (!routeSettled) {
    if (!current?.activating && api.unlocked && current?.contextState === "running") {
      if (outputCycle(`${reason}-route`)) {
        routeSettled = true;
        publish(`${reason}-route`);
      }
    } else if (!api.unlocked) {
      return false;
    }
    // Never perform both gates back-to-back in the same task. Give WebKit one
    // turn to settle after the route kick before the gameplay-output kick.
    if (routeSettled) return true;
  }

  const refreshed = status();
  if (!gameplaySettled
      && !refreshed?.activating
      && runtime()?.unlocked
      && refreshed?.contextState === "running"
      && primaryGameplayReady(refreshed)) {
    if (outputCycle(`${reason}-gameplay`)) {
      gameplaySettled = true;
      clearRepairTimer();
      publish(`${reason}-gameplay`);
      return true;
    }
  }

  publish(reason);
  return routeSettled;
}

function scheduleRepairWindow() {
  if (disposed || repairTimer || gameplaySettled) return;
  repairStartedAt = performance.now();

  const tick = () => {
    repairTimer = 0;
    runRepairs("post-unlock");
    if (disposed || gameplaySettled) return;

    const elapsed = performance.now() - repairStartedAt;
    // Keep watching long enough for a cold-cache iPhone to download/decode the
    // primary SFX. After 8s the next ordinary game gesture retries immediately.
    if (elapsed >= 8000) {
      publish("waiting-for-next-gesture");
      return;
    }
    const delay = elapsed < 900 ? 80 : elapsed < 2500 ? 150 : 300;
    repairTimer = setTimeout(tick, delay);
  };

  repairTimer = setTimeout(tick, 50);
}

function onGesture(event) {
  if (disposed) return;
  const now = performance.now();
  // Modern iOS may emit pointer + touch completion for one physical tap.
  if (now - lastGestureAt < 140) return;
  lastGestureAt = now;

  const api = runtime();
  if (!api || api.muted) return;

  const target = event.target;
  const audioButton = target instanceof Element && Boolean(target.closest?.("#audio-toggle"));
  if (audioButton) {
    routeSettled = false;
    gameplaySettled = false;
    clearRepairTimer();
    scheduleRepairWindow();
    publish("audio-button");
    return;
  }

  const current = status();
  if (!api.unlocked) {
    // A genuine gesture is still required if Safari really suspended/rejected
    // the context rather than merely leaving its output route silent.
    api.retry?.();
    scheduleRepairWindow();
    return;
  }

  if (!gameplaySettled) {
    runRepairs("game-gesture");
    scheduleRepairWindow();
  } else if (current?.contextState !== "running") {
    api.retry?.();
  }
}

function onReturnToPage() {
  if (document.hidden) return;
  routeSettled = false;
  gameplaySettled = false;
  clearRepairTimer();
  publish("returned-to-page");
  // Do not resume a suspended context outside a user gesture.
}

function dispose() {
  disposed = true;
  clearRepairTimer();
  document.removeEventListener("pointerup", onGesture, { capture: true });
  document.removeEventListener("touchend", onGesture, { capture: true });
  window.removeEventListener("pageshow", onReturnToPage);
  document.removeEventListener("visibilitychange", onReturnToPage);
}

document.addEventListener("pointerup", onGesture, { capture: true, passive: true });
document.addEventListener("touchend", onGesture, { capture: true, passive: true });
window.addEventListener("pageshow", onReturnToPage);
document.addEventListener("visibilitychange", onReturnToPage);

publish("waiting");
