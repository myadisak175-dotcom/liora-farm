import {
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

const AUDIO_REVISION = "audio21";
const AUDIO_BASE = new URL("../assets/audio/", import.meta.url);
const RESUME_TIMEOUT_MS = 650;
const MUSIC_START_TIMEOUT_MS = 900;
const MAX_STEP_VOICES = 6;

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
const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
const OfflineAudioContextCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;

function audioUrl(file) {
  const url = new URL(file, AUDIO_BASE);
  url.searchParams.set("v", AUDIO_REVISION);
  return url.href;
}

function makeMusic() {
  const audio = document.createElement("audio");
  audio.src = audioUrl(STREAM_FILES.music);
  audio.loop = true;
  audio.preload = "auto";
  audio.playsInline = true;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  audio.hidden = true;
  try { audio.volume = 0.24; } catch {}
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

function settleWithin(promise, timeoutMs) {
  let timer = 0;
  return Promise.race([
    Promise.resolve(promise)
      .then((value) => ({ settled: true, ok: true, value }))
      .catch((error) => ({ settled: true, ok: false, error })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ settled: false, ok: false, timeout: true }), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
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
const ambience = Object.fromEntries(["birds", "night", "wind"].map((name) => [name, {
  name,
  buffer: null,
  source: null,
  gain: null,
  level: 0,
  target: 0,
  state: "loading",
}]));
const stepBuffers = new Map();
const rawAudio = new Map();
const runtimeErrors = new Map();
const activeStepVoices = new Set();
const stepper = createStepper();

let decoder = null;
try {
  if (OfflineAudioContextCtor) decoder = new OfflineAudioContextCtor(1, 1, 48000);
} catch {}

let context = null;
let masterGain = null;
let sfxGain = null;
let contextStateListener = null;
let contextGeneration = 0;
let contextNeedsRebuild = false;
let recoveries = 0;
let resumeTimeouts = 0;
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
let stepCueCounters = { walk: 0, run: 0, runDirt: 0, runGround: 0, water: 0 };

async function fetchBytes(file) {
  const cached = rawAudio.get(file);
  if (cached) return cached.slice(0);
  const response = await fetch(audioUrl(file), { cache: "force-cache" });
  if (!response.ok) throw new Error(`${file} HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  rawAudio.set(file, bytes);
  return bytes.slice(0);
}

async function decodeAhead(file) {
  const bytes = await fetchBytes(file);
  if (!decoder) return null;
  return decoder.decodeAudioData(bytes);
}

async function decodeWithLiveContext(file) {
  if (!context || context.state === "closed") return null;
  const bytes = await fetchBytes(file);
  return context.decodeAudioData(bytes);
}

function startAmbienceLoop(name) {
  const track = ambience[name];
  if (!track || !track.buffer || track.source || !context || !track.gain || disposed) return;
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
    const buffer = await decodeAhead(STREAM_FILES[name]);
    if (buffer) {
      track.buffer = buffer;
      decodedAmbience += 1;
      track.state = "ready";
      runtimeErrors.delete(name);
      if (activated) startAmbienceLoop(name);
    } else {
      track.state = "bytes-ready";
    }
  } catch (error) {
    track.state = "failed";
    runtimeErrors.set(name, String(error?.message ?? error));
  }
}

async function preloadStepBank(key) {
  const bank = STEP_BANKS[key];
  try {
    const buffer = await decodeAhead(bank.file);
    if (buffer) {
      stepBuffers.set(key, buffer);
      decodedSteps += 1;
      runtimeErrors.delete(`step-${key}`);
    }
  } catch (error) {
    runtimeErrors.set(`step-${key}`, String(error?.message ?? error));
  }
}

async function hydrateMissingBuffers() {
  if (!context || context.state === "closed") return;
  for (const key of Object.keys(STEP_BANKS)) {
    if (disposed || stepBuffers.has(key)) continue;
    try {
      const buffer = await decodeWithLiveContext(STEP_BANKS[key].file);
      if (!buffer) continue;
      stepBuffers.set(key, buffer);
      decodedSteps += 1;
      runtimeErrors.delete(`step-${key}`);
    } catch (error) {
      runtimeErrors.set(`step-${key}`, String(error?.message ?? error));
    }
  }
  for (const name of ["birds", "night", "wind"]) {
    const track = ambience[name];
    if (disposed || track.buffer) continue;
    try {
      const buffer = await decodeWithLiveContext(STREAM_FILES[name]);
      if (!buffer) continue;
      track.buffer = buffer;
      decodedAmbience += 1;
      track.state = "ready";
      runtimeErrors.delete(name);
      if (activated) startAmbienceLoop(name);
    } catch (error) {
      track.state = "failed";
      runtimeErrors.set(name, String(error?.message ?? error));
    }
  }
}

// Pre-decode with OfflineAudioContext. This never opens the live output session,
// so Safari cannot put the gameplay AudioContext into "interrupted" before the
// player has actually tapped the page.
(async () => {
  for (const key of Object.keys(STEP_BANKS)) await preloadStepBank(key);
  for (const name of ["birds", "night", "wind"]) await preloadAmbience(name);
})().catch((error) => runtimeErrors.set("preload", String(error?.message ?? error)));

function stopContextSources() {
  for (const source of activeStepVoices) {
    try { source.stop(); } catch {}
  }
  activeStepVoices.clear();
  for (const track of Object.values(ambience)) {
    if (track.source) {
      try { track.source.stop(); } catch {}
      try { track.source.disconnect(); } catch {}
    }
    track.source = null;
    track.gain = null;
    if (track.buffer) track.state = "ready";
  }
}

function abandonContext(reason) {
  const old = context;
  if (!old) return;
  stopContextSources();
  if (contextStateListener) {
    try { old.removeEventListener("statechange", contextStateListener); } catch {}
  }
  try { masterGain?.disconnect(); } catch {}
  try { sfxGain?.disconnect(); } catch {}
  context = null;
  masterGain = null;
  sfxGain = null;
  contextStateListener = null;
  contextNeedsRebuild = false;
  recoveries += 1;
  runtimeErrors.set("context-recovery", reason);
  try {
    const closing = old.close();
    Promise.resolve(closing).catch(() => {});
  } catch {}
}

function createLiveContext() {
  if (disposed) return null;
  const ctx = new AudioContextCtor({ latencyHint: "interactive" });
  const master = ctx.createGain();
  const sfx = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  sfx.gain.value = 1;
  sfx.connect(master);
  master.connect(ctx.destination);

  context = ctx;
  masterGain = master;
  sfxGain = sfx;
  contextGeneration += 1;
  contextNeedsRebuild = false;

  for (const track of Object.values(ambience)) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    track.gain = gain;
    track.source = null;
  }

  contextStateListener = () => {
    if (disposed || ctx !== context) return;
    if (ctx.state === "interrupted") {
      contextNeedsRebuild = true;
      runtimeErrors.set("context", "interrupted");
    } else if (ctx.state === "running") {
      contextNeedsRebuild = false;
      runtimeErrors.delete("context");
      runtimeErrors.delete("context-recovery");
    } else if (ctx.state !== "suspended") {
      runtimeErrors.set("context", ctx.state);
    }
    updateAudioButton();
  };
  ctx.addEventListener("statechange", contextStateListener);
  return ctx;
}

function contextForGesture() {
  if (context && (context.state === "interrupted" || contextNeedsRebuild)) {
    abandonContext(`rebuild ${context.state}`);
  }
  if (!context || context.state === "closed") return createLiveContext();
  return context;
}

function desiredLevels() {
  return streamLevels({
    hour: normalizeHour(window.__lioraAudioRuntime?.hour),
    muted,
    windPhase,
  });
}

function applyMix(dt = 1 / 60) {
  if (!context || !masterGain) return;
  const levels = desiredLevels();
  const now = context.currentTime;
  for (const name of ["birds", "night", "wind"]) {
    const track = ambience[name];
    track.target = muted ? 0 : clamp01(levels[name]);
    track.level = approach(track.level, track.target, dt);
    if (track.gain) track.gain.gain.setTargetAtTime(track.level, now, 0.05);
    if (activated && track.buffer && !track.source) startAmbienceLoop(name);
  }
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
  const contextBroken = context && context.state !== "running";
  button.textContent = contextBroken || runtimeErrors.has("music") ? "⚠️ เสียงบางส่วน" : "🔊 เสียง";
}

async function activateFromGesture() {
  if (disposed || muted || activating) return false;
  activating = true;
  updateAudioButton();
  runtimeErrors.delete("unlock");

  let ctx = null;
  try {
    // Crucially, create the live context synchronously inside the real gesture.
    ctx = contextForGesture();
  } catch (error) {
    runtimeErrors.set("unlock", `create ${String(error?.message ?? error)}`);
  }

  // Call both privileged operations before the first await. Safari can drop
  // transient user activation as soon as this stack yields.
  let resumeCall = null;
  if (ctx && ctx.state !== "running") {
    try { resumeCall = ctx.resume(); }
    catch (error) { runtimeErrors.set("unlock", `resume ${String(error?.message ?? error)}`); }
  }

  let musicCall = null;
  let musicAlreadyPlaying = !music.paused;
  if (!musicAlreadyPlaying) {
    try { musicCall = music.play(); }
    catch (error) { runtimeErrors.set("music", String(error?.message ?? error)); }
  }

  const resumeResult = resumeCall
    ? await settleWithin(resumeCall, RESUME_TIMEOUT_MS)
    : { settled: true, ok: Boolean(ctx && ctx.state === "running") };
  const musicResult = musicCall
    ? await settleWithin(musicCall, MUSIC_START_TIMEOUT_MS)
    : { settled: true, ok: musicAlreadyPlaying };

  if (resumeResult.timeout && ctx === context) {
    resumeTimeouts += 1;
    contextNeedsRebuild = true;
    runtimeErrors.set("context", `${ctx.state} resume timeout`);
  } else if (resumeResult.settled && !resumeResult.ok && resumeResult.error) {
    runtimeErrors.set("context", String(resumeResult.error?.message ?? resumeResult.error));
  }

  if (musicResult.settled && musicResult.ok) runtimeErrors.delete("music");
  else if (musicResult.timeout) runtimeErrors.set("music", "play timeout");
  else if (musicResult.error) runtimeErrors.set("music", String(musicResult.error?.message ?? musicResult.error));

  const contextRunning = Boolean(ctx && ctx === context && ctx.state === "running");
  const musicStarted = !music.paused || Boolean(musicResult.ok);
  activated = activated || contextRunning || musicStarted;

  if (contextRunning) {
    for (const name of ["birds", "night", "wind"]) startAmbienceLoop(name);
    applyMix();
    if (decodedSteps < Object.keys(STEP_BANKS).length || decodedAmbience < 3) void hydrateMissingBuffers();
  }

  activating = false;
  updateAudioButton();
  if (contextRunning) toast("🔊 เสียงพร้อมแล้ว");
  else if (musicStarted) toast("เพลงพร้อมแล้ว — แตะอีกครั้งเพื่อเปิดเสียงเกม");
  else toast("แตะอีกครั้งเพื่อเปิดเสียง");
  return contextRunning || musicStarted;
}

function setMuted(next) {
  muted = Boolean(next);
  music.muted = muted;
  if (masterGain && context) {
    masterGain.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.03);
  }
  if (!muted) applyMix();
  updateAudioButton();
}

function retryFromGesture() {
  if (disposed || muted || activating) return;
  const contextReady = Boolean(context && context.state === "running" && !contextNeedsRebuild);
  if (!contextReady || music.paused) void activateFromGesture();
}

function bankKeyFor(profileKey, surface) {
  if (profileKey.startsWith("water")) return "water";
  if (profileKey === "run") return runBankForSurface(surface);
  return "walk";
}

function playStep(profileKey, surface) {
  if (!activated || muted || disposed || !context || !sfxGain || context.state !== "running") return;
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
    if (activeStepVoices.size > MAX_STEP_VOICES) {
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
  if (activated && context?.state === "running") applyMix(dt);

  const runtime = window.__lioraAudioRuntime;
  const state = runtime?.state ?? null;
  const position = state?.position ?? null;
  if (activated && !muted && context?.state === "running" && state && position
      && document.body.dataset.mode === "play") {
    const moving = Boolean(state.moving) && !state.special;
    const profileKey = profileKeyFor(state);
    if (lastPlayerPosition) {
      const distance = Math.hypot(position.x - lastPlayerPosition.x, position.z - lastPlayerPosition.z);
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
    const contextState = context?.state ?? "uncreated";
    debug.textContent = [
      `AUDIO 21 IOS ${activated ? (muted ? "MUTED" : "ACTIVE") : (activating ? "STARTING" : "LOCKED")}`,
      `context=${contextState} generation=${contextGeneration} recoveries=${recoveries} resumeTimeouts=${resumeTimeouts}`,
      `decoder=${decoder ? "offline" : "live-fallback"} decoded ambience=${decodedAmbience}/3 steps=${decodedSteps}/${Object.keys(STEP_BANKS).length}`,
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

function handleVisibility() {
  if (document.hidden) return;
  lastFrame = performance.now();
  if (context?.state === "interrupted") contextNeedsRebuild = true;
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
  get routing() { return "ios-lazy-context"; },
  get status() {
    return {
      revision: AUDIO_REVISION,
      platform: "ios",
      routing: "ios-lazy-context",
      activated,
      activating,
      muted,
      contextState: context?.state ?? "uncreated",
      contextGeneration,
      recoveries,
      resumeTimeouts,
      decoder: decoder ? "offline" : "live-fallback",
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
    stopContextSources();
    const old = context;
    if (old && contextStateListener) {
      try { old.removeEventListener("statechange", contextStateListener); } catch {}
    }
    try { masterGain?.disconnect(); } catch {}
    try { sfxGain?.disconnect(); } catch {}
    context = null;
    masterGain = null;
    sfxGain = null;
    contextStateListener = null;
    try { music.pause(); } catch {}
    music.removeAttribute("src");
    try { music.load(); } catch {}
    music.remove();
    button.remove();
    debug?.remove();
    if (old) {
      try {
        const closing = old.close();
        await settleWithin(closing, 300);
      } catch {}
    }
  },
};
