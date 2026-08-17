if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const AUDIO_BASE = "./assets/audio/";
const FILES = Object.freeze({
  // The first file in each list is the clean runtime encode. The extra
  // choices are valid fallbacks, so one missing footstep file cannot silence
  // the whole game again.
  walk: ["footstep_grass_soft.mp3", "footstep_grass_walk.mp3", "footstep_grass_run_clean.mp3"],
  run: ["footstep_grass_run_clean.mp3", "footstep_grass_run.mp3", "footstep_grass_soft.mp3"],
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
  // Slow walking stays audible but sits well behind the ambience on a phone.
  walk: { spacing: 1.52, playbackRate: 0.94, gain: 0.30 },
  run: { spacing: 1.52, playbackRate: 1.00, gain: 0.38 },
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
  // End crickets before the bird layer begins: morning and daytime should
  // sound like birds, never a bird/cricket blend.
  if (hour < 5.2) return clamp01(1 - (hour - 4.8) / 0.4);
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
let buffers = null;
let unlocked = false, muted = false, loading = false, disposed = false;
let loadError = "";
let raf = 0, lastTime = performance.now(), lastPosition = null, wasMoving = false;
let distanceSinceStep = 0, activeProfile = "-", currentFoot = "-", stepCount = 0;
let walkCue = 0, runCue = 0;
let nextBirdAt = 0, nextCricketAt = 0;
const resolvedFiles = {};

function normalizeFootstep(buffer, kind) {
  const targetPeak = kind === "run" ? 0.46 : 0.52;
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
  }
  if (peak < 0.001 || peak >= targetPeak) return buffer;
  const scale = Math.min(8, targetPeak / peak);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) samples[index] *= scale;
  }
  return buffer;
}

async function fetchBuffer(name) {
  const failures = [];
  for (const file of FILES[name]) {
    try {
      const response = await fetch(`${AUDIO_BASE}${file}?v=9`, { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = normalizeFootstep(
        await context.decodeAudioData(await response.arrayBuffer()),
        name
      );
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0.02) throw new Error("empty decode");
      return { buffer, file };
    } catch (error) {
      failures.push(`${file}: ${String(error?.message ?? error)}`);
    }
  }
  throw new Error(`${name}: ${failures.join(" | ")}`);
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
  const runUsesShortClip = isRun && ["footstep_grass_soft.mp3", "footstep_grass_walk.mp3"].includes(resolvedFiles.run);
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

function playAmbientTone({ startAt, fromHz, toHz, duration, gain, type = "sine" }) {
  if (!context || !ambienceBus) return;
  const source = context.createOscillator();
  const volume = context.createGain();
  source.type = type;
  source.frequency.setValueAtTime(fromHz, startAt);
  source.frequency.exponentialRampToValueAtTime(Math.max(80, toHz), startAt + duration * 0.68);
  volume.gain.setValueAtTime(0.0001, startAt);
  volume.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), startAt + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  source.connect(volume).connect(ambienceBus);
  source.start(startAt);
  source.stop(startAt + duration + 0.03);
  source.onended = () => { source.disconnect(); volume.disconnect(); };
}

function playBirdCall(weight) {
  const now = context.currentTime + 0.015;
  const base = 1_850 + Math.random() * 650;
  const gain = 0.075 + weight * 0.055;
  playAmbientTone({ startAt: now, fromHz: base, toHz: base * 1.28, duration: 0.11, gain });
  playAmbientTone({ startAt: now + 0.14, fromHz: base * 1.18, toHz: base * 0.87, duration: 0.15, gain: gain * 0.84 });
}

function playCricketCall(weight) {
  const now = context.currentTime + 0.01;
  const gain = 0.012 + weight * 0.020;
  const base = 3_650 + Math.random() * 550;
  for (let count = 0; count < 3; count += 1) {
    playAmbientTone({
      startAt: now + count * 0.075,
      fromHz: base,
      toHz: base * 1.07,
      duration: 0.052,
      gain,
      type: "triangle",
    });
  }
}

function updateAmbience(hour) {
  // Use small procedural calls rather than the supplied ambience MP3s: those
  // files decode inconsistently and are too quiet on mobile speakers.
  const bird = muted ? 0 : birdWeight(hour);
  const cricket = muted ? 0 : nightWeight(hour);
  const now = context?.currentTime ?? 0;
  if (bird > 0.05) {
    if (now >= nextBirdAt) {
      playBirdCall(bird);
      nextBirdAt = now + 3.2 + Math.random() * 4.8;
    }
  } else nextBirdAt = 0;
  if (cricket > 0.05) {
    if (now >= nextCricketAt) {
      playCricketCall(cricket);
      nextCricketAt = now + 1.8 + Math.random() * 2.5;
    }
  } else nextCricketAt = 0;
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
      `AUDIO V11 ${unlocked ? (muted ? "MUTED" : "SYNC") : (loading ? "LOADING" : "LOCKED")}`,
      `hour=${h.toFixed(2)} birds=${birdWeight(h).toFixed(2)} night=${nightWeight(h).toFixed(2)}`,
      `move=${Boolean(state?.moving)} run=${Boolean(state?.running)} speed=${instantSpeed.toFixed(2)}`,
      `foot=${currentFoot} profile=${activeProfile} steps=${stepCount}`,
      `walk=${resolvedFiles.walk ?? "-"} run=${resolvedFiles.run ?? "-"} ambience=synth`,
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
    context?.close?.();
    button.remove();
    debug?.remove();
    document.removeEventListener("pointerdown", unlockFromFirstGesture, { capture: true });
  },
};
