import {
  STREAM_NAMES,
  STEP_PROFILE,
  approach,
  createStepper,
  normalizeHour,
  profileKeyFor,
  runBankForSurface,
  shouldStreamPlay,
  streamLevels,
} from "./systems/audio-mix.js";

if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const AUDIO_BASE = "./assets/audio/";
const AUDIO_REVISION = "audio19";
const STREAM_FILES = Object.freeze({
  music: "music_lanternfields_overture.mp3",
  birds: "ambience_morning_birdsong.mp3",
  night: "ambience_forest_night.mp3",
  wind: "ambience_tree_wind.mp3",
});
const STEP_BANKS = Object.freeze({
  walk: Object.freeze({
    file: "footstep_grass_soft.mp3",
    cues: Object.freeze([{ offset: 0, duration: 0.42 }]),
  }),
  run: Object.freeze({
    file: "footstep_grass_run_clean.mp3",
    cues: Object.freeze([
      { offset: 0.11, duration: 0.17 },
      { offset: 0.38, duration: 0.17 },
      { offset: 0.64, duration: 0.17 },
      { offset: 0.90, duration: 0.17 },
      { offset: 1.16, duration: 0.17 },
      { offset: 1.42, duration: 0.17 },
    ]),
  }),
  runDirt: Object.freeze({
    file: "footstep_run_dirt.mp3",
    cues: Object.freeze([
      0.08, 0.37, 0.64, 0.95, 1.21, 1.52, 1.83, 2.14,
      2.44, 2.75, 3.05, 3.36, 3.68, 4.00, 4.31, 4.63,
    ].map((offset) => ({ offset, duration: 0.22 }))),
  }),
  runGround: Object.freeze({
    file: "footstep_run_ground.mp3",
    cues: Object.freeze([
      0.27, 0.54, 0.83, 1.10, 1.39, 1.69, 1.96, 2.26, 2.54,
      2.78, 3.05, 3.33, 3.54, 3.87, 4.16, 4.45, 4.71, 5.00,
      5.29, 5.55, 5.85, 6.15, 6.45, 6.74, 7.02, 7.16,
    ].map((offset) => ({ offset, duration: 0.19 }))),
  }),
  water: Object.freeze({
    file: "footstep_water_wade_bank.mp3",
    cues: Object.freeze(Array.from({ length: 8 }, (_, index) => ({
      offset: index * 0.56,
      duration: 0.50,
    }))),
  }),
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * Use native media output everywhere.
 *
 * The previous runtime split output three ways: native HTMLAudio on Android,
 * MediaElementSource/Web Audio on iOS, and decoded Web Audio buffers for
 * footsteps. Real devices proved that each route could fail independently.
 * Keeping every audible file on HTMLMediaElement gives the browser one media
 * policy, one unlock path, and one mute path.
 */
function detectElementVolumeSupport() {
  try {
    const probe = document.createElement("audio");
    probe.volume = 0.37;
    return Math.abs(probe.volume - 0.37) < 0.01;
  } catch {
    return false;
  }
}
const elementVolumeSupported = detectElementVolumeSupport();
const routing = elementVolumeSupported ? "native-volume" : "native-gate";

function makeMedia(file, { loop = false } = {}) {
  const audio = document.createElement("audio");
  audio.src = `${AUDIO_BASE}${file}?v=${AUDIO_REVISION}`;
  audio.loop = loop;
  audio.preload = "auto";
  audio.playsInline = true;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  audio.hidden = true;
  document.body.append(audio);
  return audio;
}

function makeButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "audio-toggle";
  button.textContent = "🔊 เปิดเสียง";
  button.setAttribute("aria-label", "เปิดหรือปิดเสียง");
  Object.assign(button.style, {
    position: "fixed",
    right: "12px",
    top: "calc(env(safe-area-inset-top, 0px) + 58px)",
    minWidth: "82px",
    height: "42px",
    padding: "0 10px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,.35)",
    background: "rgba(16,38,46,.78)",
    color: "white",
    font: "600 14px system-ui,sans-serif",
    zIndex: "6500",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  });
  document.body.append(button);
  return button;
}

function toast(text) {
  const el = document.querySelector("#toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1600);
}

const button = makeButton();
const debug = new URLSearchParams(location.search).get("audiodebug") === "1"
  ? (() => {
      const el = document.createElement("pre");
      Object.assign(el.style, {
        position: "fixed",
        left: "8px",
        top: "110px",
        zIndex: "7000",
        margin: 0,
        padding: "8px",
        maxWidth: "88vw",
        font: "11px/1.35 monospace",
        whiteSpace: "pre-wrap",
        color: "#fff",
        background: "rgba(0,0,0,.72)",
        borderRadius: "8px",
        pointerEvents: "none",
      });
      document.body.append(el);
      return el;
    })()
  : null;

const runtimeErrors = new Map();
let muted = false;
let disposed = false;

const streamTracks = Object.fromEntries(
  STREAM_NAMES.map((name) => {
    const audio = makeMedia(STREAM_FILES[name], { loop: true });
    const track = {
      name,
      audio,
      state: "idle",
      target: 0,
      level: 0,
      wanted: false,
      expectedPause: false,
      lastPosition: 0,
      lastAdvanceAt: 0,
    };
    audio.addEventListener("playing", () => {
      track.state = "playing";
      track.lastPosition = audio.currentTime;
      track.lastAdvanceAt = performance.now();
      runtimeErrors.delete(name);
      updateAudioButton();
    });
    audio.addEventListener("error", () => {
      track.state = "failed";
      runtimeErrors.set(name, `media error ${audio.error?.code ?? "unknown"}`);
      updateAudioButton();
    });
    audio.addEventListener("pause", () => {
      if (track.expectedPause) {
        track.expectedPause = false;
        track.state = "paused";
        return;
      }
      if (track.wanted && !muted && !disposed) {
        track.state = "blocked";
        runtimeErrors.set(name, "unexpected pause");
        updateAudioButton();
      }
    });
    return [name, track];
  })
);

const stepAudio = makeMedia(STEP_BANKS.walk.file);
let stepFile = STEP_BANKS.walk.file;
let stepTimer = 0;
let stepToken = 0;
let stepCueCounters = { walk: 0, run: 0, runDirt: 0, runGround: 0, water: 0 };
let stepPrimed = false;

let activated = false;
let activating = false;
let raf = 0;
let lastFrame = performance.now();
let lastPlayerPosition = null;
let currentFoot = "-";
let currentSurface = "grass";
let playedSteps = 0;
let attemptedSteps = 0;
let windPhase = 0;
const stepper = createStepper();

function trackList() {
  return Object.values(streamTracks);
}

function setTrackMuted(track, next) {
  track.audio.muted = Boolean(next);
}

function updateAudioButton() {
  if (muted) {
    button.textContent = "🔇 เสียง";
    return;
  }
  if (activating) {
    button.textContent = "… เสียง";
    return;
  }
  if (!activated) {
    button.textContent = "🔊 เปิดเสียง";
    return;
  }
  const wanted = trackList().filter((track) => track.wanted);
  const broken = wanted.filter((track) => ["blocked", "failed"].includes(track.state));
  button.textContent = broken.length ? "⚠️ เสียงบางส่วน" : "🔊 เสียง";
}

function pauseTrack(track) {
  if (!track || track.audio.paused) {
    if (track) track.state = "paused";
    return;
  }
  track.expectedPause = true;
  try {
    track.audio.pause();
    track.state = "paused";
  } catch {
    track.expectedPause = false;
  }
}

function startTrack(track) {
  if (!track || disposed || muted || !track.wanted) return Promise.resolve(false);
  setTrackMuted(track, false);
  if (!track.audio.paused && ["playing", "starting"].includes(track.state)) {
    return Promise.resolve(true);
  }
  track.state = "starting";
  try {
    const started = track.audio.play();
    return Promise.resolve(started).then(() => {
      if (disposed) return false;
      track.state = "playing";
      track.lastPosition = track.audio.currentTime;
      track.lastAdvanceAt = performance.now();
      runtimeErrors.delete(track.name);
      updateAudioButton();
      return true;
    }).catch((error) => {
      if (disposed) return false;
      track.state = "blocked";
      runtimeErrors.set(track.name, String(error?.message ?? error));
      updateAudioButton();
      return false;
    });
  } catch (error) {
    track.state = "blocked";
    runtimeErrors.set(track.name, String(error?.message ?? error));
    updateAudioButton();
    return Promise.resolve(false);
  }
}

function desiredLevels() {
  return streamLevels({
    hour: normalizeHour(window.__lioraAudioRuntime?.hour),
    muted,
    windPhase,
  });
}

function applyMix({ allowStart = activated } = {}) {
  const levels = desiredLevels();
  for (const name of STREAM_NAMES) {
    const track = streamTracks[name];
    const target = clamp01(levels[name]);
    track.target = target;
    track.level = approach(track.level, target, 1 / 60);
    const shouldPlay = !muted && shouldStreamPlay(track.level, track.wanted);

    if (elementVolumeSupported) {
      try { track.audio.volume = clamp01(track.level); } catch {}
    }
    track.wanted = shouldPlay;
    setTrackMuted(track, muted);

    if (!shouldPlay) {
      pauseTrack(track);
      continue;
    }
    if (allowStart && !["playing", "starting"].includes(track.state)) void startTrack(track);
  }
}

function primeFootstepFromGesture() {
  if (stepPrimed || disposed) return Promise.resolve(stepPrimed);
  stepAudio.muted = true;
  try {
    stepAudio.currentTime = 0;
  } catch {}
  try {
    const started = stepAudio.play();
    return Promise.resolve(started).then(() => {
      try {
        stepAudio.pause();
        stepAudio.currentTime = 0;
      } catch {}
      stepPrimed = true;
      stepAudio.muted = muted;
      runtimeErrors.delete("footstep-prime");
      return true;
    }).catch((error) => {
      stepAudio.muted = muted;
      runtimeErrors.set("footstep-prime", String(error?.message ?? error));
      return false;
    });
  } catch (error) {
    stepAudio.muted = muted;
    runtimeErrors.set("footstep-prime", String(error?.message ?? error));
    return Promise.resolve(false);
  }
}

function activateFromGesture() {
  if (disposed || muted || activating) return;
  activating = true;

  // Compute the mix before play() so the play calls themselves occur in the
  // user's gesture.
  const levels = desiredLevels();
  for (const name of STREAM_NAMES) {
    const track = streamTracks[name];
    track.target = clamp01(levels[name]);
    track.level = track.target;
    track.wanted = shouldStreamPlay(track.level, false);
    if (elementVolumeSupported) {
      try { track.audio.volume = clamp01(track.level); } catch {}
    }
    setTrackMuted(track, false);
  }

  // One unmuted long-form play plus one muted short SFX prime is deliberately
  // the entire first-gesture workload. The old runtime tried to start four
  // streams and a Web Audio context at once; real Samsung browsers could reject
  // the whole burst. Once the music/footstep element has consumed the gesture,
  // sticky activation starts the remaining ambience through applyMix().
  const musicStart = startTrack(streamTracks.music);
  const footstepPrime = primeFootstepFromGesture();

  Promise.allSettled([musicStart, footstepPrime]).then((results) => {
    const anyStarted = results.some((result) => result.status === "fulfilled" && result.value === true);
    activated = activated || anyStarted || trackList().some((track) => track.state === "playing");
    activating = false;
    applyMix({ allowStart: activated });
    updateAudioButton();
    toast(activated ? "🔊 เสียงพร้อมแล้ว" : "แตะเพื่อเปิดเสียงอีกครั้ง");
  });
}

function setMuted(next) {
  muted = Boolean(next);
  stepAudio.muted = muted;
  if (muted) {
    clearTimeout(stepTimer);
    for (const track of trackList()) {
      track.wanted = false;
      setTrackMuted(track, true);
      pauseTrack(track);
    }
  } else {
    applyMix({ allowStart: false });
  }
  updateAudioButton();
}

function retryFromGesture() {
  if (disposed || muted) return;
  if (!activated) {
    activateFromGesture();
    return;
  }
  applyMix({ allowStart: false });
  for (const track of trackList()) {
    if (!track.wanted) continue;
    if (["blocked", "failed", "paused", "idle"].includes(track.state)) void startTrack(track);
  }
  if (!stepPrimed) void primeFootstepFromGesture();
}

function bankKeyFor(profileKey, surface) {
  if (profileKey.startsWith("water")) return "water";
  if (profileKey === "run") return runBankForSurface(surface);
  return "walk";
}

function playNativeStep(profileKey, surface) {
  if (!activated || muted || disposed) return;
  attemptedSteps += 1;

  const bankKey = bankKeyFor(profileKey, surface);
  const bank = STEP_BANKS[bankKey] ?? STEP_BANKS.walk;
  const counter = stepCueCounters[bankKey] ?? 0;
  const cue = bank.cues[counter % bank.cues.length];
  stepCueCounters[bankKey] = counter + 1;
  const profile = STEP_PROFILE[profileKey] ?? STEP_PROFILE.walk;

  if (stepFile !== bank.file) {
    stepFile = bank.file;
    stepAudio.src = `${AUDIO_BASE}${bank.file}?v=${AUDIO_REVISION}`;
    stepAudio.load();
  }

  const token = ++stepToken;
  clearTimeout(stepTimer);
  stepAudio.muted = false;
  try { stepAudio.playbackRate = profile.playbackRate; } catch {}
  if (elementVolumeSupported) {
    const balance = bankKey === "water" ? 0.85 : ["runDirt", "runGround"].includes(bankKey) ? 0.78 : 1;
    try { stepAudio.volume = clamp01(Math.max(0.55, profile.gain * 2.1) * balance); } catch {}
  }

  const begin = () => {
    if (token !== stepToken || disposed || muted) return;
    try {
      const maxOffset = Number.isFinite(stepAudio.duration)
        ? Math.max(0, stepAudio.duration - 0.04)
        : cue.offset;
      stepAudio.currentTime = Math.min(cue.offset, maxOffset);
    } catch {}
    try {
      const started = stepAudio.play();
      Promise.resolve(started).then(() => {
        if (token !== stepToken) return;
        playedSteps += 1;
        currentFoot = bankKey;
        currentSurface = profileKey.startsWith("water") ? "water" : surface;
        runtimeErrors.delete("footsteps");
        const wallDuration = cue.duration / Math.max(0.25, profile.playbackRate);
        stepTimer = setTimeout(() => {
          if (token !== stepToken) return;
          try { stepAudio.pause(); } catch {}
        }, Math.max(70, wallDuration * 1000));
      }).catch((error) => {
        runtimeErrors.set("footsteps", String(error?.message ?? error));
        stepPrimed = false;
        updateAudioButton();
      });
    } catch (error) {
      runtimeErrors.set("footsteps", String(error?.message ?? error));
      stepPrimed = false;
    }
  };

  if (stepAudio.readyState >= 1) begin();
  else stepAudio.addEventListener("loadedmetadata", begin, { once: true });
}

function checkForStalledStreams(now) {
  if (!activated || muted) return;
  for (const track of trackList()) {
    if (!track.wanted || track.state !== "playing" || track.audio.paused) continue;
    const position = track.audio.currentTime;
    if (Math.abs(position - track.lastPosition) > 0.05) {
      track.lastPosition = position;
      track.lastAdvanceAt = now;
      continue;
    }
    if (now - track.lastAdvanceAt > 7000) {
      track.state = "blocked";
      runtimeErrors.set(track.name, "media clock stalled");
    }
  }
}

function update(now) {
  if (disposed) return;
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  windPhase += dt;

  if (activated) {
    const levels = desiredLevels();
    for (const name of STREAM_NAMES) {
      const track = streamTracks[name];
      const target = clamp01(levels[name]);
      track.target = target;
      track.level = approach(track.level, target, dt);
      const shouldPlay = !muted && shouldStreamPlay(track.level, track.wanted);
      if (elementVolumeSupported) {
        try { track.audio.volume = clamp01(track.level); } catch {}
      }
      track.wanted = shouldPlay;
      if (!shouldPlay) pauseTrack(track);
      else if (!["playing", "starting"].includes(track.state)) {
        // Do not call play() continuously from RAF. A blocked mobile stream is
        // retried only from the next real user gesture.
      }
    }
    checkForStalledStreams(now);
  }

  const runtime = window.__lioraAudioRuntime;
  const state = runtime?.state ?? null;
  const position = state?.position ?? null;
  if (activated && !muted && state && position && document.body.dataset.mode === "play") {
    const moving = Boolean(state.moving) && !state.special;
    const profileKey = profileKeyFor(state);
    if (lastPlayerPosition) {
      const distance = Math.hypot(
        position.x - lastPlayerPosition.x,
        position.z - lastPlayerPosition.z
      );
      const steps = stepper.advance({ moving, profileKey, distance });
      if (!moving) currentFoot = "-";
      for (let index = 0; index < steps; index += 1) {
        playNativeStep(profileKey, String(runtime?.surface ?? "grass"));
      }
    }
    lastPlayerPosition = { x: position.x, z: position.z };
  } else {
    lastPlayerPosition = position ? { x: position.x, z: position.z } : null;
    stepper.reset();
  }

  if (debug) {
    const hour = normalizeHour(runtime?.hour);
    debug.textContent = [
      `AUDIO 19 ${activated ? (muted ? "MUTED" : "ACTIVE") : (activating ? "STARTING" : "LOCKED")} route=${routing}`,
      `hour=${hour.toFixed(2)} volumeControl=${elementVolumeSupported}`,
      `foot=${currentFoot} surface=${currentSurface} attempted=${attemptedSteps} played=${playedSteps} primed=${stepPrimed}`,
      ...STREAM_NAMES.map((name) => {
        const track = streamTracks[name];
        return `${name}=${track.state}@${track.level.toFixed(2)} wanted=${track.wanted} paused=${track.audio.paused}`;
      }),
      runtimeErrors.size
        ? `err=${[...runtimeErrors.entries()].map(([name, message]) => `${name}:${message}`).join(" | ")}`
        : "err=-",
    ].join("\n");
  }

  raf = requestAnimationFrame(update);
}

button.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!activated) {
    muted = false;
    activateFromGesture();
    return;
  }
  if (muted) {
    setMuted(false);
    retryFromGesture();
  } else {
    setMuted(true);
  }
});

function handleGameGesture(event) {
  if (event.target === button || button.contains(event.target)) return;
  if (muted || disposed) return;
  retryFromGesture();
}
document.addEventListener("pointerdown", handleGameGesture, { capture: true });
document.addEventListener("touchend", handleGameGesture, { capture: true, passive: true });

function handleVisibility() {
  if (document.hidden) return;
  lastFrame = performance.now();
  // Do not synthesize play() from visibilitychange. If the OS paused media,
  // the next real tap/joystick gesture is the standards-safe retry point.
  for (const track of trackList()) {
    if (track.wanted && track.audio.paused) track.state = "blocked";
  }
}
document.addEventListener("visibilitychange", handleVisibility);

raf = requestAnimationFrame(update);
updateAudioButton();

window.__lioraAudio = {
  unlock: activateFromGesture,
  setMuted,
  retry: retryFromGesture,
  get unlocked() { return activated; },
  get muted() { return muted; },
  get routing() { return routing; },
  get status() {
    return {
      revision: AUDIO_REVISION,
      activated,
      muted,
      activating,
      routing,
      elementVolumeSupported,
      footstep: currentFoot,
      surface: currentSurface,
      attemptedSteps,
      playedSteps,
      stepPrimed,
      error: [...runtimeErrors.entries()].map(([name, message]) => `${name}:${message}`).join(" | "),
      streams: Object.fromEntries(STREAM_NAMES.map((name) => {
        const track = streamTracks[name];
        return [name, {
          state: track.state,
          level: track.level,
          wanted: track.wanted,
          paused: track.audio.paused,
          position: track.audio.currentTime,
          muted: track.audio.muted,
        }];
      })),
    };
  },
  dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    clearTimeout(stepTimer);
    for (const track of trackList()) {
      try { track.audio.pause(); } catch {}
      track.audio.removeAttribute("src");
      try { track.audio.load(); } catch {}
      track.audio.remove();
    }
    try { stepAudio.pause(); } catch {}
    stepAudio.removeAttribute("src");
    try { stepAudio.load(); } catch {}
    stepAudio.remove();
    button.remove();
    debug?.remove();
    document.removeEventListener("pointerdown", handleGameGesture, { capture: true });
    document.removeEventListener("touchend", handleGameGesture, { capture: true });
    document.removeEventListener("visibilitychange", handleVisibility);
  },
};
