const STABILIZER_REVISION = "audio23-fast1";

let settled = false;
let disposed = false;
let kickCount = 0;
let timers = [];
let lastGestureAt = 0;

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
  // Wait until the original first-tap async resume/play sequence has completely
  // settled. Cycling while `activating` is still true would make api.unlock()
  // short-circuit and could mark the repair complete too early.
  if (current?.activating) return false;
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
    clearTimers();
    window.__lioraAudioStabilizer = {
      revision: STABILIZER_REVISION,
      settled,
      kickCount,
      reason,
      dispose,
    };
    return true;
  } catch (error) {
    window.__lioraAudioStabilizer = {
      revision: STABILIZER_REVISION,
      settled: false,
      kickCount,
      reason,
      error: String(error?.message ?? error),
      dispose,
    };
    return false;
  }
}

function clearTimers() {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}

function schedulePostUnlockCycle() {
  if (timers.length) return;
  // Poll tightly during the first half-second. On some iPhones the old first
  // check landed while the runtime was still `activating`, then the next chance
  // was 700 ms later. These shorter checks repair the physical output route as
  // soon as resume/play has actually settled, without requiring another tap.
  for (const delay of [60, 120, 220, 340, 480, 650, 900, 1250]) {
    timers.push(setTimeout(() => {
      if (!settled) softOutputCycle(`post-unlock-${delay}`);
    }, delay));
  }
}

function onGesture(event) {
  if (disposed) return;
  const now = performance.now();
  // Modern iOS can emit both pointer and touch completion for one physical tap.
  // Treat them as one gesture so the second event cannot clear/restart recovery
  // timers and accidentally add hundreds of milliseconds of silence.
  if (now - lastGestureAt < 140) return;
  lastGestureAt = now;

  const api = runtime();
  if (!api || api.muted) return;

  const target = event.target;
  const audioButton = target instanceof Element && Boolean(target.closest?.("#audio-toggle"));
  if (audioButton) {
    // The runtime unlock starts on pointerdown. Run the automatic off/on repair
    // after that first gesture, and keep the existing timers if touchend follows
    // pointerup for the same physical tap.
    settled = false;
    clearTimers();
    schedulePostUnlockCycle();
    return;
  }

  const current = status();
  if (!settled && !current?.activating && api.unlocked && current?.contextState === "running") {
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

function dispose() {
  disposed = true;
  clearTimers();
  document.removeEventListener("pointerup", onGesture, { capture: true });
  document.removeEventListener("touchend", onGesture, { capture: true });
  window.removeEventListener("pageshow", onReturnToPage);
  document.removeEventListener("visibilitychange", onReturnToPage);
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
  dispose,
};
