import {
  STREAM_NAMES,
  STEP_PROFILE,
  approach,
  createStepper,
  normalizeHour,
  profileKeyFor,
  runBankForSurface,
  streamLevels,
} from "./systems/audio-mix.js";

if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const AUDIO_BASE = new URL("../assets/audio/", import.meta.url);
const AUDIO_REVISION = "audio20";
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
function audioUrl(file) {
  const url = new URL(file, AUDIO_BASE);
  url.searchParams.set("v", AUDIO_REVISION);
  return url.href;
}

const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
const context = new AudioContextCtor({ latencyHint: "interactive" });
const masterGain = context.createGain();
const musicGain = context.createGain();
const sfxGain = context.createGain();
masterGain.gain.value = 1;
musicGain.gain.value = 0;
sfxGain.gain.value = 1;
musicGain.connect(masterGain);
sfxGain.connect(masterGain);
masterGain.connect(context.destination);

function makeMusic() {
  const audio = document.createElement("audio");
  audio.src = audioUrl(STREAM_FILES.music);
  audio.loop = true;
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
        maxWidth: "90vw",
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

const music = makeMusic();
const musicSource = context.createMediaElementSource(music);
musicSource.connect(musicGain);

const ambience = Object.fromEntries(["birds", "night", "wind"].map((name) => {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain);
  return [name, { name, gain, buffer: null, source: null, level: 0, target: 0, state: "loading" }];
}));

const stepBuffers = new Map();
const runtimeErrors = new Map();
const activeStepVoices = new Set();
let stepCueCounters = { walk: 0, run: 0, runDirt: 0, runGround: 0, water: 0 };
let decodedSteps = 0;
let decodedAmbience = 0;
let activated = false;
let activating = false;
let muted = false;
let disposed = false;
let raf = 0;
let lastFrame = performance.now();
let lastPlayerPosition = null;
let currentFoot = "-";
let currentSurface = "grass";
let attemptedSteps = 0;
let playedSteps = 0;
let windPhase = 0;
const stepper = createStepper();

async function decodeFile(file) {
  const response = await fetch(audioUrl(file), { cache: "force-cache" });
  if (!response.ok) throw new Error(`${file} HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  return context.decodeAudioData(bytes);
}

function startAmbienceLoop(name) {
  const track = ambience[name];
  if (!track || !track.buffer || track.source || disposed) return;
  try {
    const source = context.createBufferSource();
    source.buffer = track.buffer;
    source.loop = true;
    source.connect(track.gain);
    source.start();
    track.source = source;
    track.state = "playing";
    runtimeErrors.delete(name);
  } catch (error) {
    track.state = "failed";
    runtimeErrors.set(name, String(error?.message ?? error));
  }
}

async function preloadAmbience(name) {
  const track = ambience[name];
  try {
    track.buffer = await decodeFile(STREAM_FILES[name]);
    decodedAmbience += 1;
    track.state = "ready";
    runtimeErrors.delete(name);
    if (activated) startAmbienceLoop(name);
  } catch (error) {
    track.state = "failed";
    runtimeErrors.set(name, String(error?.message ?? error));
  }
}

async function preloadStepBank(key) {
  const bank = STEP_BANKS[key];
  try {
    const buffer = await decodeFile(bank.file);
    stepBuffers.set(key, buffer);
    decodedSteps += 1;
    runtimeErrors.delete(`step-${key}`);
  } catch (error) {
    runtimeErrors.set(`step-${key}`, String(error?.message ?? error));
  }
}

// Decode before the player turns sound on. This moves MP3 decode work away from
// the gesture that resumes the audio session, which is where iOS was visibly
// hitching when several native media elements were started at once.
for (const name of ["birds", "night", "wind"]) void preloadAmbience(name);
for (const key of Object.keys(STEP_BANKS)) void preloadStepBank(key);

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
  const broken = context.state !== "running" || music.error || runtimeErrors.size > 0;
  button.textContent = broken ? "⚠️ เสียงบางส่วน" : "🔊 เสียง";
}

function desiredLevels() {
  return streamLevels({
    hour: normalizeHour(window.__lioraAudioRuntime?.hour),
    muted,
    windPhase,
  });
}

function applyMix(dt = 1 / 60) {
  const levels = desiredLevels();
  const now = context.currentTime;
  const musicLevel = muted ? 0 : clamp01(levels.music);
  musicGain.gain.setTargetAtTime(musicLevel, now, 0.05);
  for (const name of ["birds", "night", "wind"]) {
    const track = ambience[name];
    track.target = muted ? 0 : clamp01(levels[name]);
    track.level = approach(track.level, track.target, dt);
    track.gain.gain.setTargetAtTime(track.level, now, 0.05);
    if (activated && track.buffer && !track.source) startAmbienceLoop(name);
  }
}

async function activateFromGesture() {
  if (disposed || muted || activating) return false;
  activating = true;
  runtimeErrors.delete("unlock");
  try {
    if (context.state !== "running") await context.resume();
  } catch (error) {
    runtimeErrors.set("unlock", `context ${String(error?.message ?? error)}`);
  }

  let musicStarted = !music.paused;
  if (music.paused) {
    try {
      await music.play();
      musicStarted = true;
      runtimeErrors.delete("music");
    } catch (error) {
      runtimeErrors.set("music", String(error?.message ?? error));
    }
  }

  activated = context.state === "running";
  if (activated) {
    for (const name of ["birds", "night", "wind"]) startAmbienceLoop(name);
    applyMix();
  }
  activating = false;
  updateAudioButton();
  toast(activated && musicStarted ? "🔊 เสียงพร้อมแล้ว" : "แตะเพื่อเปิดเสียงอีกครั้ง");
  return activated;
}

function setMuted(next) {
  muted = Boolean(next);
  const now = context.currentTime;
  masterGain.gain.setTargetAtTime(muted ? 0 : 1, now, 0.03);
  music.muted = muted;
  if (!muted) applyMix();
  updateAudioButton();
}

function retryFromGesture() {
  if (disposed || muted) return;
  if (!activated || context.state !== "running" || music.paused) {
    void activateFromGesture();
  }
}

function bankKeyFor(profileKey, surface) {
  if (profileKey.startsWith("water")) return "water";
  if (profileKey === "run") return runBankForSurface(surface);
  return "walk";
}

function playStep(profileKey, surface) {
  if (!activated || muted || disposed || context.state !== "running") return;
  attemptedSteps += 1;
  const bankKey = bankKeyFor(profileKey, surface);
  const bank = STEP_BANKS[bankKey] ?? STEP_BANKS.walk;
  const buffer = stepBuffers.get(bankKey);
  if (!buffer) {
    runtimeErrors.set("footsteps", `${bankKey} buffer not ready`);
    return;
  }

  const counter = stepCueCounters[bankKey] ?? 0;
  const cue = bank.cues[counter % bank.cues.length];
  stepCueCounters[bankKey] = counter + 1;
  const offset = Math.max(0, Math.min(cue.offset, Math.max(0, buffer.duration - 0.01)));
  const duration = Math.max(0.03, Math.min(cue.duration, buffer.duration - offset));
  const profile = STEP_PROFILE[profileKey] ?? STEP_PROFILE.walk;
  const balance = bankKey === "water" ? 0.92 : ["runDirt", "runGround"].includes(bankKey) ? 0.84 : 1;
  const voiceGain = clamp01(Math.max(0.58, profile.gain * 1.9) * balance);

  try {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = profile.playbackRate;
    gain.gain.value = voiceGain;
    source.connect(gain);
    gain.connect(sfxGain);
    activeStepVoices.add(source);
    source.onended = () => {
      activeStepVoices.delete(source);
      try { source.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    };
    if (activeStepVoices.size > 6) {
      const oldest = activeStepVoices.values().next().value;
      if (oldest && oldest !== source) {
        try { oldest.stop(); } catch {}
        activeStepVoices.delete(oldest);
      }
    }
    source.start(context.currentTime + 0.003, offset, duration);
    playedSteps += 1;
    currentFoot = bankKey;
    currentSurface = profileKey.startsWith("water") ? "water" : surface;
    runtimeErrors.delete("footsteps");
  } catch (error) {
    runtimeErrors.set("footsteps", String(error?.message ?? error));
  }
}

function update(nowMs) {
  if (disposed) return;
  const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastFrame) / 1000));
  lastFrame = nowMs;
  windPhase += dt;
  if (activated) applyMix(dt);

  const runtime = window.__lioraAudioRuntime;
  const state = runtime?.state ?? null;
  const position = state?.position ?? null;
  if (activated && !muted && context.state === "running" && state && position
      && document.body.dataset.mode === "play") {
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
        playStep(profileKey, String(runtime?.surface ?? "grass"));
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
      `AUDIO 20 IOS ${activated ? (muted ? "MUTED" : "ACTIVE") : (activating ? "STARTING" : "LOCKED")}`,
      `context=${context.state} sampleRate=${context.sampleRate}`,
      `decoded ambience=${decodedAmbience}/3 steps=${decodedSteps}/${Object.keys(STEP_BANKS).length}`,
      `music=${music.paused ? "paused" : "playing"}@${music.currentTime.toFixed(1)}`,
      `foot=${currentFoot} surface=${currentSurface} attempted=${attemptedSteps} played=${playedSteps} voices=${activeStepVoices.size}`,
      ...["birds", "night", "wind"].map((name) => {
        const track = ambience[name];
        return `${name}=${track.state}@${track.level.toFixed(2)} loaded=${Boolean(track.buffer)}`;
      }),
      runtimeErrors.size
        ? `err=${[...runtimeErrors.entries()].map(([name, message]) => `${name}:${message}`).join(" | ")}`
        : "err=-",
      `hour=${hour.toFixed(2)}`,
    ].join("\n");
  }

  raf = requestAnimationFrame(update);
}

button.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!activated) {
    muted = false;
    void activateFromGesture();
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

function handleContextState() {
  if (!activated || disposed) return;
  if (context.state !== "running") runtimeErrors.set("context", context.state);
  else runtimeErrors.delete("context");
  updateAudioButton();
}
context.addEventListener("statechange", handleContextState);

function handleVisibility() {
  if (document.hidden) return;
  lastFrame = performance.now();
  if (activated && context.state !== "running") runtimeErrors.set("context", context.state);
  if (activated && music.paused) runtimeErrors.set("music", "paused by system");
  updateAudioButton();
}
document.addEventListener("visibilitychange", handleVisibility);

music.addEventListener("playing", () => {
  runtimeErrors.delete("music");
  updateAudioButton();
});
music.addEventListener("pause", () => {
  if (activated && !muted && !disposed) runtimeErrors.set("music", "unexpected pause");
  updateAudioButton();
});
music.addEventListener("error", () => {
  runtimeErrors.set("music", `media error ${music.error?.code ?? "unknown"}`);
  updateAudioButton();
});

raf = requestAnimationFrame(update);
updateAudioButton();

window.__lioraAudio = {
  unlock: activateFromGesture,
  setMuted,
  retry: retryFromGesture,
  get unlocked() { return activated; },
  get muted() { return muted; },
  get routing() { return "ios-single-context"; },
  get status() {
    return {
      revision: AUDIO_REVISION,
      platform: "ios",
      routing: "ios-single-context",
      activated,
      activating,
      muted,
      contextState: context.state,
      sampleRate: context.sampleRate,
      decodedAmbience,
      decodedSteps,
      footstep: currentFoot,
      surface: currentSurface,
      attemptedSteps,
      playedSteps,
      music: { paused: music.paused, position: music.currentTime, error: music.error?.code ?? null },
      ambience: Object.fromEntries(["birds", "night", "wind"].map((name) => {
        const track = ambience[name];
        return [name, { state: track.state, level: track.level, loaded: Boolean(track.buffer) }];
      })),
      error: [...runtimeErrors.entries()].map(([name, message]) => `${name}:${message}`).join(" | "),
    };
  },
  async dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    document.removeEventListener("pointerdown", handleGameGesture, { capture: true });
    document.removeEventListener("touchend", handleGameGesture, { capture: true });
    document.removeEventListener("visibilitychange", handleVisibility);
    context.removeEventListener("statechange", handleContextState);
    for (const source of activeStepVoices) {
      try { source.stop(); } catch {}
    }
    activeStepVoices.clear();
    for (const track of Object.values(ambience)) {
      if (track.source) {
        try { track.source.stop(); } catch {}
        try { track.source.disconnect(); } catch {}
      }
      try { track.gain.disconnect(); } catch {}
    }
    try { music.pause(); } catch {}
    try { musicSource.disconnect(); } catch {}
    music.removeAttribute("src");
    try { music.load(); } catch {}
    music.remove();
    button.remove();
    debug?.remove();
    try { await context.close(); } catch {}
  },
};
