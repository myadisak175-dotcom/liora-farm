// Single-world mobile audio recovery.
//
// audio-bootstrap-v8 owns the actual mix. This tiny companion only supplies a
// second gesture path after the old world-switch UI was removed. On some
// Android builds the first pointerdown is consumed while media/Web Audio is
// still starting; a later pointerup/click should be allowed to retry blocked
// long tracks without asking the player to find the sound button.

const BROKEN_STREAM_STATES = new Set(["blocked", "failed"]);

function isAudioButtonTarget(target) {
  const button = document.querySelector("#audio-toggle");
  return Boolean(button && (target === button || button.contains?.(target)));
}

function recoverAudioFromGesture(event) {
  if (isAudioButtonTarget(event.target)) return;

  const audio = window.__lioraAudio;
  if (!audio) return;

  const status = audio.status;
  if (!status || status.loading || status.muted) return;

  if (!status.unlocked) {
    void audio.unlock();
    return;
  }

  const hasBrokenStream = Object.values(status.streams ?? {})
    .some((track) => BROKEN_STREAM_STATES.has(track?.state));

  // setMuted(false) is intentionally used as the public recovery path: inside
  // audio-bootstrap it resumes the AudioContext and calls startAllStreams()
  // without changing the player's mute choice.
  if (hasBrokenStream) audio.setMuted(false);
}

document.addEventListener("pointerup", recoverAudioFromGesture, { capture: true });
document.addEventListener("click", recoverAudioFromGesture, { capture: true });

window.__lioraAudioRecovery = Object.freeze({ revision: "single-world-1" });
