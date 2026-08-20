const STABILIZER_REVISION = "audio23";

let settled = false;
let disposed = false;
let kickCount = 0;
let timers = [];

function runtime() {
  return window.__lioraAudio ?? null;
}

function status() {
  try { return runtime()?.status ?? null; }
  catch { return null; }
}

/**
 * Some iOS/WebKit builds report both HTMLAudio and AudioContext as healthy
 * after the first unlock gesture while the physical output route is still
 * silent. Manually toggling the in-game sound off and on fixes that route.
 *
 * Reproduce that exact reset automatically once the runtime is genuinely
 * unlocked: gate both outputs off, immediately restore them, then run the
 * existing iOS prime path again. No track is restarted and current music time
 * is preserved.
 */
function softOutputCycle(reason = "post-unlock") {
  if (disposed || settled || document.hidden) return false;
  const api = runtime();
  const current = status();
  if (!api || current?.platform !== "ios" || api.muted) return false;
  if (!api.unlocked || current?.contextState !== "running") return false;

  try {
    api.setMuted(true);
    api.setMuted(false);
    // With the context already running and music already playing, this does not
    // need a fresh media permission. It re-primes WebKit's output path using the
    // same oscillator path as a successful second tap used to do manually.
    void api.unlock?.();
    settled = true;
    kickCount += 1;
    window.__lioraAudioStabilizer = {
      revision: STABILIZER_REVISION,
      settled,
      kickCount,
      reason,
    };
    return true;
  } catch (error) {
    window.__lioraAudioStabilizer = {
      revision: STABILIZER_REVISION,
      settled: false,
      kickCount,
      reason,
      error: String(error?.message ?? error),
    };
    return false;
  }
}

function clearTimers() {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}

function schedulePostUnlockCycle() {
  clearTimers();
  // Fast path plus two late checks for Safari versions whose resume/play
  // promises settle unusually slowly. Only the first successful cycle runs.
  for (const delay of [180, 700, 1400]) {
    timers.push(setTimeout(() => {
      if (!settled) softOutputCycle(`post-unlock-${delay}`);
    }, delay));
  }
}

function onGesture(event) {
  if (disposed) return;
  const api = runtime();
  if (!api || api.muted) return;

  const target = event.target;
  const audioButton = target instanceof Element && Boolean(target.closest?.("#audio-toggle"));
  if (audioButton) {
    // The runtime unlock starts on pointerdown. Run the automatic off/on repair
    // only after that first gesture has had time to settle.
    settled = false;
    schedulePostUnlockCycle();
    return;
  }

  const current = status();
  if (!settled && api.unlocked && current?.contextState === "running") {
    softOutputCycle("first-game-gesture");
  } else if (!api.unlocked) {
    // Keep the existing retry path tied to a real user gesture when WebKit did
    // actually reject/suspend the context.
    api.retry?.();
  }
}

function onReturnToPage() {
  if (document.hidden) return;
  settled = false;
  clearTimers();
  // Do not resume here: Safari may require the next genuine gesture. The next
  // tap will either repair the context or run the soft output cycle.
}

document.addEventListener("pointerup", onGesture, { capture: true, passive: true });
document.addEventListener("touchend", onGesture, { capture: true, passive: true });
window.addEventListener("pageshow", onReturnToPage);
document.addEventListener("visibilitychange", onReturnToPage);

window.__lioraAudioStabilizer = {
  revision: STABILIZER_REVISION,
  settled,
  kickCount,
  reason: "waiting",
  dispose() {
    disposed = true;
    clearTimers();
    document.removeEventListener("pointerup", onGesture, { capture: true });
    document.removeEventListener("touchend", onGesture, { capture: true });
    window.removeEventListener("pageshow", onReturnToPage);
    document.removeEventListener("visibilitychange", onReturnToPage);
  },
};
