if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const AUDIO_BASE = "./assets/audio/";
const FILES = Object.freeze({
  // The first file in each list is the clean runtime encode.  The extra
  // choices are deliberately valid fallbacks, so one broken optional asset
  // cannot silence the whole game again.
  walk: ["footstep_grass_soft.mp3", "footstep_grass_walk.mp3", "footstep_grass_run_clean.mp3"],
  run: ["footstep_grass_run_clean.mp3", "footstep_grass_run.mp3", "footstep_grass_soft.mp3"],
  birds: ["ambience_morning_birds_clean.mp3", "ambience_morning_birds.mp3"],
  night: ["ambience_night_crickets_clean.mp3", "ambience_night_crickets.mp3"],
});

// The original dry-leaf file committed as an MP3 is corrupt, so its v8 cue
// offsets pointed beyond the usable audio and caused audio initialization to
// fail.  This compact, clean grass clip contains one soft walking impact.
const WALK_CUES = Object.freeze([
  { offset: 0, duration: 0.42 },
]);

// Running is intentionally unchanged from v7.
const RUN_CUES = Object.freeze([
  { offset: 0.11, duration: 0.17 },
  { offset: 0.38, duration: 0.17 },
  { offset: 0.64, duration: 0.17 },
  { offset: 0.90, duration: 0.17 },
  { offset: 1.16, duration: 0.17 },
  { offset: 1.42, duration: 0.17 },
]);

const STEP_PROFILE = Object.freeze({
  // Keep the v7/v6 relaxed cadence; only the slow-walk loudness and cue choice change.
  walk: { spacing: 1.52, playbackRate: 0.94, gain: 0.38 },
  run: { spacing: 1.52, playbackRate: 1.00, gain: 0.64 },
});
const FIRST_STEP_PHASE = 0.48;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Bird timing/mix is unchanged from v7.
function birdWeight(hour) {
  if (hour < 5.2 || hour >= 18.5) return 0;
  if (hour < 6.5) return clamp01((hour - 5.2) / 1.3);
  if (hour < 10.0) return 1.0;
  if (hour < 16.5) return 0.78;
  return 0.78 * clamp01(1 - (hour - 16.5) / 2.0);
}

function nightWeight(hour) {
  if (hour >= 19.0) return clamp01((hour - 19.0) / 1.0);
  if (hour < 4.8) return 1;
  if (hour < 5.5) return clamp01(1 - (hour - 4.8) / 0.7);
  return 0;
}

function makeButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "audio-toggle";
  button.textContent = "🔊 เปิดเสียง";
  button.setAttribute("aria-label", "เปิดหรือปิดเสียง");
  Object.assign(button.style, {
    position: "fixed", right: "12px", top: "calc(env(safe-area-inset-top, 0px) + 58px)",
    minWidth: "82px", height: "42px", padding: "0 10px", borderRadius: "14px",
    border: "1px solid rgba(255,255,255,.35)", background: "rgba(16,38,46,.78)",
    color: "white", font: "600 14px system-ui,sans-serif", zIndex: "6500",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
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
        position: "fixed", left: "8px", top: "110px", zIndex: "7000", margin: 0,
        padding: "8px", maxWidth: "88vw", font: "11px/1.35 monospace", whiteSpace: "pre-wrap",
        color: "#fff", background: "rgba(0,0,0,.72)", borderRadius: "8px", pointerEvents: "none",
      });
      document.body.append(el);
      return el;
    })()
  : null;

let context = null, master = null, ambienceBus = null, footstepBus = null;
let buffers = null, birds = null, night = null;
let unlocked = false, muted = false, loading = false, disposed = false;
let loadError = "";
let raf = 0, lastTime = performance.now(), lastPosition = null, wasMoving = false;
let distanceSinceStep = 0, activeProfile = "-", currentFoot = "-", stepCount = 0;
let walkCue = 0, runCue = 0;
const resolvedFiles = {};

async function fetchBuffer(name) {
  const failures = [];
  for (const file of FILES[name]) {
    try {
      const response = await fetch(`${AUDIO_BASE}${file}?v=9`, { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0.02) throw new Error("empty decode");
      return { buffer, file };
    } catch (error) {
      failures.push(`${file}: ${String(error?.message ?? error)}`);
    }
  }
  throw new Error(`${name}: ${failures.join(" | ")}`);
}

function makeLoop(buffer) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  gain.gain.value = 0;
  source.connect(gain).connect(ambienceBus);
  source.start();
  return { source, gain, target: 0 };
}

async function ensureAudio() {
  if (unlocked || loading || disposed) return;
  loading = true;
  button.textContent = "… เสียง";
  loadError = "";
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error("Web Audio ไม่รองรับ");
    context = new AudioContextCtor({ latencyHint: "interactive" });
    await context.resume();

    master = context.createGain();
    ambienceBus = context.createGain();
    footstepBus = context.createGain();
    master.gain.value = 0.95;
    ambienceBus.gain.value = 1;
    footstepBus.gain.value = 0.88;
    ambienceBus.connect(master);
    footstepBus.connect(master);
    master.connect(context.destination);

    const names = Object.keys(FILES);
    const settled = await Promise.allSettled(names.map(async (name) => [name, await fetchBuffer(name)]));
    const decoded = {}, errors = {};
    settled.forEach((result, index) => {
      const name = names[index];
      if (result.status === "fulfilled") {
        decoded[name] = result.value[1].buffer;
        resolvedFiles[name] = result.value[1].file;
      }
      else errors[name] = String(result.reason?.message ?? result.reason);
    });
    if (!decoded.walk) throw new Error(`walk: ${errors.walk || "decode failed"}`);
    decoded.run ??= decoded.walk;
    resolvedFiles.run ??= resolvedFiles.walk;
    buffers = decoded;
    loadError = Object.entries(errors).map(([name, message]) => `${name}:${message}`).join(" | ");

    if (buffers.birds) birds = makeLoop(buffers.birds);
    if (buffers.night) night = makeLoop(buffers.night);

    unlocked = true;
    muted = false;
    lastPosition = null;
    distanceSinceStep = 0;
    activeProfile = "-";
    button.textContent = "🔊 เสียง";
    toast("🔊 เสียงพร้อมแล้ว");
  } catch (error) {
    console.error("Liora audio init failed", error);
    loadError = String(error?.message ?? error);
    button.textContent = "⚠️ เสียง";
    toast("เสียงโหลดไม่สำเร็จ");
    try { await context?.close?.(); } catch {}
    context = master = ambienceBus = footstepBus = null;
    buffers = null;
  } finally {
    loading = false;
  }
}

function setMuted(next) {
  muted = Boolean(next);
  if (master && context) {
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : 0.95, context.currentTime, 0.03);
  }
  button.textContent = muted ? "🔇 เสียง" : "🔊 เสียง";
}

button.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!unlocked) ensureAudio();
  else setMuted(!muted);
});

// Mobile browsers only let Web Audio start inside a user gesture.  Unlock from
// the first normal game touch as well as from the button, so moving the joystick
// does not leave Liora permanently silent just because the small sound button
// was missed.
const unlockFromFirstGesture = () => {
  if (!unlocked && !loading && !disposed) ensureAudio();
};
document.addEventListener("pointerdown", unlockFromFirstGesture, { capture: true, once: true });

function playStep(kind) {
  if (!unlocked || muted || !context || !buffers) return;
  const isRun = kind === "run";
  const buffer = isRun ? buffers.run : buffers.walk;
  if (!buffer) return;
  // If a run file had to fall back to the short walking clip, retain a usable
  // cue instead of seeking into silence with the long running offsets.
  const runUsesShortClip = isRun && resolvedFiles.run === "footstep_grass_soft.mp3";
  const cues = isRun && !runUsesShortClip ? RUN_CUES : WALK_CUES;
  const index = isRun ? runCue++ : walkCue++;
  const cue = cues[index % cues.length];
  const profile = STEP_PROFILE[kind];
  const offset = Math.min(cue.offset, Math.max(0, buffer.duration - 0.04));
  const duration = Math.min(cue.duration, Math.max(0.04, buffer.duration - offset));

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = profile.playbackRate * (0.99 + Math.random() * 0.02);
  const now = context.currentTime;
  const peak = profile.gain * (0.97 + Math.random() * 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + 0.024);
  gain.gain.setValueAtTime(Math.max(0.001, peak), now + Math.max(0.04, duration - 0.09));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(gain).connect(footstepBus);
  source.start(now, offset, duration);
  source.stop(now + duration + 0.03);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  currentFoot = kind;
  stepCount += 1;
}

function setLoopTarget(track, target) {
  if (!track || !context) return;
  if (Math.abs(track.target - target) < 0.001) return;
  track.target = target;
  track.gain.gain.cancelScheduledValues(context.currentTime);
  track.gain.gain.setTargetAtTime(target, context.currentTime, 0.6);
}

function updateAmbience(hour) {
  // Exactly the same bird/night levels as v7.
  const bird = muted ? 0 : 0.18 * birdWeight(hour);
  const cricket = muted ? 0 : 0.08 * nightWeight(hour);
  setLoopTarget(birds, bird);
  setLoopTarget(night, cricket);
}

function update(now) {
  if (disposed) return;
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  const runtime = window.__lioraAudioRuntime;
  const state = runtime?.state ?? null;
  const hour = Number(runtime?.hour);
  const position = state?.position ?? null;
  let instantSpeed = 0;

  if (unlocked && !muted && state && position && document.body.dataset.mode === "play") {
    const moving = Boolean(state.moving) && !state.special && (Number(state.waterDepth) || 0) < 0.07;
    const kind = state.running ? "run" : "walk";
    const profile = STEP_PROFILE[kind];
    if (lastPosition) {
      const dx = position.x - lastPosition.x;
      const dz = position.z - lastPosition.z;
      const distance = Math.hypot(dx, dz);
      instantSpeed = distance / dt;
      if (!moving) {
        distanceSinceStep = 0;
        activeProfile = "-";
        currentFoot = "-";
      } else {
        if (!wasMoving) distanceSinceStep = profile.spacing * FIRST_STEP_PHASE;
        else if (activeProfile !== "-" && activeProfile !== kind) {
          const previous = STEP_PROFILE[activeProfile];
          const phase = previous ? clamp01(distanceSinceStep / previous.spacing) : FIRST_STEP_PHASE;
          distanceSinceStep = profile.spacing * phase;
        }
        activeProfile = kind;
        if (distance < 2) distanceSinceStep += distance;
        else distanceSinceStep = profile.spacing * FIRST_STEP_PHASE;
        let safety = 0;
        while (distanceSinceStep >= profile.spacing && safety++ < 2) {
          distanceSinceStep -= profile.spacing;
          playStep(kind);
        }
      }
    }
    lastPosition = { x: position.x, z: position.z };
    wasMoving = moving;
  } else {
    lastPosition = position ? { x: position.x, z: position.z } : null;
    wasMoving = false;
    distanceSinceStep = 0;
    activeProfile = "-";
  }

  if (unlocked) updateAmbience(Number.isFinite(hour) ? hour : 12);

  if (debug) {
    const h = Number.isFinite(hour) ? hour : 12;
    debug.textContent = [
      `AUDIO V9 ${unlocked ? (muted ? "MUTED" : "SYNC") : (loading ? "LOADING" : "LOCKED")}`,
      `hour=${h.toFixed(2)} birds=${birdWeight(h).toFixed(2)} night=${nightWeight(h).toFixed(2)}`,
      `move=${Boolean(state?.moving)} run=${Boolean(state?.running)} speed=${instantSpeed.toFixed(2)}`,
      `foot=${currentFoot} profile=${activeProfile} steps=${stepCount}`,
      `walk=${resolvedFiles.walk ?? "-"} run=${resolvedFiles.run ?? "-"}`,
      loadError ? `err=${loadError}` : "err=-",
    ].join("\n");
  }
  raf = requestAnimationFrame(update);
}
raf = requestAnimationFrame(update);

window.__lioraAudio = {
  unlock: ensureAudio,
  get unlocked() { return unlocked; },
  get muted() { return muted; },
  get status() { return { unlocked, muted, loading, footstep: currentFoot, steps: stepCount, error: loadError }; },
  dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    try {
      for (const track of [birds, night]) {
        if (!track) continue;
        track.source.stop(); track.source.disconnect(); track.gain.disconnect();
      }
    } catch {}
    context?.close?.();
    button.remove();
    debug?.remove();
    document.removeEventListener("pointerdown", unlockFromFirstGesture, { capture: true });
  },
};
