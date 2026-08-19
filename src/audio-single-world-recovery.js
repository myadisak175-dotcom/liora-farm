// Single-world mobile audio recovery.
//
// audio-bootstrap-v8 owns the actual mix. This companion supplies extra
// gesture paths after the old world-switch UI was removed. Some Android builds
// consume the first pointerdown while media/Web Audio is still starting; later
// pointerup/click/touchend gestures retry the same public runtime instead of
// creating a second audio system.

const BROKEN_STREAM_STATES = new Set(["blocked", "failed"]);
let sessionHasUnlocked = false;

function isAudioButtonTarget(target) {
  const button = document.querySelector("#audio-toggle");
  return Boolean(button && (target === button || button.contains?.(target)));
}

function recoverAudioFromGesture(event) {
  if (isAudioButtonTarget(event.target)) return;

  const audio = window.__lioraAudio;
  if (!audio) return;

  const status = audio.status;
  if (!status) return;
  if (status.unlocked) sessionHasUnlocked = true;

  // Before audio has ever succeeded in this page, a stale mute bit is treated
  // as legacy startup state. Clear it once from a real game gesture. Once sound
  // has successfully unlocked, later mute choices are respected and this path
  // never turns them back on behind the player's back.
  if (!sessionHasUnlocked && status.muted) {
    audio.setMuted(false);
    return;
  }

  if (status.loading || status.muted) return;

  if (!status.unlocked) {
    void audio.unlock();
    return;
  }

  const hasBrokenStream = Object.values(status.streams ?? {})
    .some((track) => BROKEN_STREAM_STATES.has(track?.state));

  // setMuted(false) is intentionally used as the public recovery path: inside
  // audio-bootstrap it resumes the AudioContext and calls startAllStreams()
  // without changing the player's current unmuted state.
  if (hasBrokenStream) audio.setMuted(false);
}

document.addEventListener("pointerup", recoverAudioFromGesture, { capture: true });
document.addEventListener("click", recoverAudioFromGesture, { capture: true });
document.addEventListener("touchend", recoverAudioFromGesture, { capture: true, passive: true });

window.__lioraAudioRecovery = Object.freeze({ revision: "single-world-2" });
