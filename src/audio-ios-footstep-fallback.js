// iOS footstep fallback for devices where long-form audio plays but decoded
// Web Audio footsteps do not reach the speaker.
//
// The normal audio runtime remains authoritative. This helper only emits a
// compact HTMLMediaElement footstep while the normal runtime has not produced
// any footstep events. As soon as the regular runtime reports a step, the
// fallback disables itself for the rest of the page so sounds never double.

const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

if (isAppleMobile) {
  const SOURCE = "./assets/audio/footstep_grass_soft.mp3?v=audio18";
  const SPACING = 1.35;
  const POOL_SIZE = 4;
  const pool = Array.from({ length: POOL_SIZE }, () => {
    const audio = document.createElement("audio");
    audio.src = SOURCE;
    audio.preload = "auto";
    audio.playsInline = true;
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.hidden = true;
    document.body.append(audio);
    return audio;
  });

  let poolIndex = 0;
  let primed = false;
  let disabled = false;
  let lastPosition = null;
  let distanceSinceStep = 0;
  let baselineSteps = 0;

  function primePool() {
    if (primed) return;
    primed = true;
    baselineSteps = Number(window.__lioraAudio?.status?.steps) || 0;
    for (const audio of pool) {
      try {
        audio.muted = true;
        const started = audio.play();
        Promise.resolve(started).then(() => {
          try { audio.pause(); audio.currentTime = 0; } catch {}
          audio.muted = false;
        }).catch(() => { audio.muted = false; });
      } catch {
        audio.muted = false;
      }
    }
  }

  function playFallbackStep() {
    const audio = pool[poolIndex++ % pool.length];
    try {
      audio.muted = false;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    } catch {}
  }

  function frame() {
    if (disabled) return;
    const audio = window.__lioraAudio;
    const runtime = window.__lioraAudioRuntime;
    const state = runtime?.state;
    const position = state?.position;

    const normalSteps = Number(audio?.status?.steps) || 0;
    if (normalSteps > baselineSteps) {
      disabled = true;
      for (const item of pool) {
        try { item.pause(); item.remove(); } catch {}
      }
      return;
    }

    if (!primed || !audio?.unlocked || audio?.muted || !state?.moving || state?.special
        || document.body.dataset.mode !== "play" || !position) {
      lastPosition = position ? { x: position.x, z: position.z } : null;
      requestAnimationFrame(frame);
      return;
    }

    if (lastPosition) {
      const distance = Math.hypot(position.x - lastPosition.x, position.z - lastPosition.z);
      if (Number.isFinite(distance) && distance >= 0 && distance < 2) {
        distanceSinceStep += distance;
        if (distanceSinceStep >= SPACING) {
          distanceSinceStep %= SPACING;
          playFallbackStep();
        }
      } else {
        distanceSinceStep = 0;
      }
    }
    lastPosition = { x: position.x, z: position.z };
    requestAnimationFrame(frame);
  }

  document.addEventListener("pointerdown", primePool, { capture: true, once: true });
  document.addEventListener("touchend", primePool, { capture: true, once: true, passive: true });
  requestAnimationFrame(frame);

  window.__lioraIOSFootstepFallback = Object.freeze({ revision: "ios-footstep-1" });
}
