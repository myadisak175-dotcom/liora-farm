if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const AUDIO_BASE = "./assets/audio/";
const FILES = Object.freeze({
  walk: "footstep_grass_walk.mp3",
  run: "footstep_grass_run.mp3",
  leaves: "footstep_forest_leaves.mp3",
  night: "ambience_night_crickets.mp3",
  forest: "ambience_forest.mp3",
  morning: "ambience_morning_birds.mp3",
});

const FOOTSTEP_CUES = Object.freeze({
  walk: [
    { offset: 0.19, duration: 0.34 },
    { offset: 0.73, duration: 0.34 },
  ],
  run: [
    { offset: 0.11, duration: 0.17 },
    { offset: 0.38, duration: 0.17 },
    { offset: 0.64, duration: 0.17 },
    { offset: 0.90, duration: 0.17 },
    { offset: 1.16, duration: 0.17 },
    { offset: 1.42, duration: 0.17 },
  ],
  leaves: [
    { offset: 0.17, duration: 0.28 },
    { offset: 1.06, duration: 0.30 },
    { offset: 1.67, duration: 0.30 },
    { offset: 2.25, duration: 0.30 },
    { offset: 3.27, duration: 0.30 },
    { offset: 3.94, duration: 0.30 },
  ],
});

// Spacing is world distance per foot plant, not a timer. At Liora's current
// 2.4 m/s walk and 5.2 m/s run these land near ~0.53 s and ~0.29 s apart.
// That is deliberately slower than Audio v4 (1.02 / 1.08 m), whose footsteps
// raced ahead of the visible leg cycle, especially while running.
const STEP_PROFILE = Object.freeze({
  walk:       { sound: "walk",   spacing: 1.26, playbackRate: 0.98, gain: 0.60 },
  run:        { sound: "run",    spacing: 1.52, playbackRate: 1.00, gain: 0.64 },
  leavesWalk: { sound: "leaves", spacing: 1.18, playbackRate: 0.94, gain: 0.55 },
  leavesRun:  { sound: "leaves", spacing: 1.42, playbackRate: 1.13, gain: 0.60 },
});

const FIRST_STEP_PHASE = 0.56;
const AMBIENCE_GAIN = Object.freeze({ morning: 0.12, night: 0.095, forest: 0.085 });
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function makeButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "audio-toggle";
  button.textContent = "🔇 เสียง";
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

function zoneAt(position) {
  if (!position) return "world";
  const { x, z } = position;
  if (window.__lioraMap === "world-blockout-v1") {
    if (x >= -19 && x <= -5 && z >= -19 && z <= 0) return "forest";
    if (x >= 4 && x <= 20 && z >= -19 && z <= -4) return "lake";
    if (x >= 3 && x <= 19 && z >= 0 && z <= 16) return "town";
    if (x >= -14 && x <= -2 && z >= -5 && z <= 14) return "farm";
    if (x >= -4 && x <= 6 && z >= 18 && z <= 28) return "special";
  }
  return "world";
}

function morningWeight(hour) {
  if (hour < 5.5 || hour >= 10.5) return 0;
  if (hour < 7.0) return clamp01((hour - 5.5) / 1.5);
  if (hour < 8.5) return 1;
  return clamp01(1 - (hour - 8.5) / 2.0);
}

function nightWeight(hour) {
  if (hour >= 19.0) return clamp01((hour - 19.0) / 1.0);
  if (hour < 4.8) return 1;
  if (hour < 5.5) return clamp01(1 - (hour - 4.8) / 0.7);
  return 0;
}

const button = makeButton();
const debug = new URLSearchParams(location.search).get("audiodebug") === "1"
  ? (() => {
      const el = document.createElement("pre");
      Object.assign(el.style, {
        position: "fixed", left: "8px", top: "110px", zIndex: "7000", margin: 0,
        padding: "8px", maxWidth: "88vw", font: "11px/1.35 monospace",
        whiteSpace: "pre-wrap", color: "#fff", background: "rgba(0,0,0,.72)",
        borderRadius: "8px", pointerEvents: "none",
      });
      document.body.append(el);
      return el;
    })()
  : null;

let context = null;
let master = null;
let ambienceBus = null;
let footstepBus = null;
let buffers = null;
let ambience = null;
let unlocked = false;
let muted = false;
let loading = false;
let disposed = false;
let loadError = "";
let leafFallback = false;
let raf = 0;
let lastTime = performance.now();
let lastPosition = null;
let wasMoving = false;
let distanceSinceStep = 0;
let activeProfileKey = "-";
let currentFoot = "-";
let currentZone = "world";
let stepCount = 0;
const cueIndex = { walk: 0, run: 0, leaves: 0 };

async function fetchBuffer(name) {
  const response = await fetch(`${AUDIO_BASE}${FILES[name]}?v=5`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return context.decodeAudioData(await response.arrayBuffer());
}

function makeLoop(name) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffers[name];
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
    const decoded = {};
    const errors = {};
    settled.forEach((result, index) => {
      const name = names[index];
      if (result.status === "fulfilled") decoded[name] = result.value[1];
      else errors[name] = String(result.reason?.message ?? result.reason);
    });
    if (!decoded.walk) throw new Error(`walk: ${errors.walk || "decode failed"}`);
    decoded.run ??= decoded.walk;
    if (!decoded.leaves) {
      decoded.leaves = decoded.walk;
      leafFallback = true;
    }
    buffers = decoded;
    loadError = Object.entries(errors).map(([name, message]) => `${name}:${message}`).join(" | ");

    ambience = {};
    if (buffers.morning) ambience.morning = makeLoop("morning");
    if (buffers.night) ambience.night = makeLoop("night");
    if (buffers.forest) ambience.forest = makeLoop("forest");

    unlocked = true;
    muted = false;
    lastPosition = null;
    distanceSinceStep = 0;
    activeProfileKey = "-";
    button.textContent = "🔊 เสียง";
    toast("🔊 ปรับจังหวะเท้าให้ตรงกับ Liora แล้ว");
  } catch (error) {
    console.error("Liora audio init failed", error);
    loadError = String(error?.message ?? error);
    button.textContent = "⚠️ เสียง";
    toast("เสียงโหลดไม่สำเร็จ");
    try { await context?.close?.(); } catch {}
    context = master = ambienceBus = footstepBus = null;
    buffers = ambience = null;
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

function profileFor(state, zone) {
  if (!state?.moving || state?.special) return null;
  if ((Number(state.waterDepth) || 0) >= 0.07) return null;
  if (zone === "forest") return state.running ? ["leavesRun", STEP_PROFILE.leavesRun] : ["leavesWalk", STEP_PROFILE.leavesWalk];
  return state.running ? ["run", STEP_PROFILE.run] : ["walk", STEP_PROFILE.walk];
}

function playFootstep(profile) {
  if (!unlocked || muted || !context || !buffers?.[profile.sound]) return;
  const cueName = profile.sound === "leaves" && leafFallback ? "walk" : profile.sound;
  const cues = FOOTSTEP_CUES[cueName];
  const index = cueIndex[cueName]++ % cues.length;
  const cue = cues[index];
  const buffer = buffers[profile.sound];
  const offset = Math.min(Math.max(0, cue.offset), Math.max(0, buffer.duration - 0.03));
  const duration = Math.min(cue.duration, Math.max(0.03, buffer.duration - offset));

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = profile.playbackRate * (0.98 + Math.random() * 0.04);
  const now = context.currentTime;
  const peak = profile.gain * (0.96 + Math.random() * 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + 0.01);
  gain.gain.setValueAtTime(Math.max(0.001, peak), now + Math.max(0.02, duration - 0.04));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(gain).connect(footstepBus);
  source.start(now, offset, duration);
  source.stop(now + duration + 0.02);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  currentFoot = profile.sound;
  stepCount += 1;
}

function updateAmbience(hour, zone) {
  if (!ambience || !context) return;
  const targets = {
    morning: AMBIENCE_GAIN.morning * morningWeight(hour) * (zone === "forest" ? 0.55 : 1),
    night: AMBIENCE_GAIN.night * nightWeight(hour) * (zone === "forest" ? 0.55 : 1),
    forest: zone === "forest" ? AMBIENCE_GAIN.forest : 0,
  };
  for (const [name, track] of Object.entries(ambience)) {
    const target = muted ? 0 : targets[name];
    if (Math.abs(track.target - target) < 0.001) continue;
    track.target = target;
    track.gain.gain.cancelScheduledValues(context.currentTime);
    track.gain.gain.setTargetAtTime(target, context.currentTime, 0.45);
  }
}

function update(now) {
  if (disposed) return;
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  const runtime = window.__lioraAudioRuntime;
  const state = runtime?.state ?? null;
  const hour = Number(runtime?.hour);
  const position = state?.position ?? null;
  const zone = zoneAt(position);
  currentZone = zone;
  let instantSpeed = 0;

  if (unlocked && !muted && state && position && document.body.dataset.mode === "play") {
    const moving = Boolean(state.moving) && !state.special;
    if (lastPosition) {
      const dx = position.x - lastPosition.x;
      const dz = position.z - lastPosition.z;
      const distance = Math.hypot(dx, dz);
      instantSpeed = distance / dt;
      const selected = profileFor(state, zone);

      if (!moving || !selected) {
        distanceSinceStep = 0;
        activeProfileKey = "-";
        currentFoot = "-";
      } else {
        const [profileKey, profile] = selected;
        if (!wasMoving) {
          // Start part-way through a stride so the first audible plant arrives
          // quickly, but not instantly on the joystick touch.
          distanceSinceStep = profile.spacing * FIRST_STEP_PHASE;
        } else if (activeProfileKey !== "-" && activeProfileKey !== profileKey) {
          // Keep stride phase when walk<->run or grass<->forest changes. This
          // avoids a double-step exactly at the run threshold or zone border.
          const previous = STEP_PROFILE[activeProfileKey];
          const phase = previous ? clamp01(distanceSinceStep / previous.spacing) : FIRST_STEP_PHASE;
          distanceSinceStep = phase * profile.spacing;
        }
        activeProfileKey = profileKey;

        if (distance < 2) distanceSinceStep += distance;
        else distanceSinceStep = profile.spacing * FIRST_STEP_PHASE;

        let safety = 0;
        while (distanceSinceStep >= profile.spacing && safety++ < 2) {
          distanceSinceStep -= profile.spacing;
          playFootstep(profile);
        }
      }
    }
    lastPosition = { x: position.x, z: position.z };
    wasMoving = moving;
  } else {
    lastPosition = position ? { x: position.x, z: position.z } : null;
    wasMoving = false;
    distanceSinceStep = 0;
    activeProfileKey = "-";
  }

  if (unlocked) updateAmbience(Number.isFinite(hour) ? hour : 12, zone);

  if (debug) {
    const s = state ?? {};
    const profile = STEP_PROFILE[activeProfileKey];
    debug.textContent = [
      `AUDIO ${unlocked ? (muted ? "MUTED" : "SYNC v5") : (loading ? "LOADING" : "LOCKED")}`,
      `zone=${zone} map=${window.__lioraMap ?? "-"}`,
      `hour=${Number.isFinite(hour) ? hour.toFixed(2) : "-"} move=${Boolean(s.moving)} run=${Boolean(s.running)} special=${Boolean(s.special)}`,
      `water=${Number(s.waterDepth || 0).toFixed(2)} speed=${instantSpeed.toFixed(2)}m/s`,
      `foot=${currentFoot} steps=${stepCount} profile=${activeProfileKey}`,
      profile ? `spacing=${profile.spacing.toFixed(2)}m phase=${(distanceSinceStep / profile.spacing).toFixed(2)}` : "spacing=-",
      position ? `pos=${position.x.toFixed(1)},${position.z.toFixed(1)}` : "pos=-",
      leafFallback ? "leaves=fallback(walk)" : "leaves=ok",
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
  get status() {
    return {
      unlocked, muted, loading, zone: currentZone, footstep: currentFoot,
      profile: activeProfileKey, steps: stepCount, error: loadError,
      spacing: STEP_PROFILE[activeProfileKey]?.spacing ?? null,
    };
  },
  dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    try {
      for (const track of Object.values(ambience ?? {})) {
        track.source.stop();
        track.source.disconnect();
        track.gain.disconnect();
      }
    } catch {}
    context?.close?.();
    button.remove();
    debug?.remove();
  },
};
