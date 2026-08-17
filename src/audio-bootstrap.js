if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const AUDIO_BASE = "./assets/audio/";
const TRACK_DEFS = {
  walk: { file: "footstep_grass_walk.mp3", gain: 0.58 },
  run: { file: "footstep_grass_run.mp3", gain: 0.52 },
  leaves: { file: "footstep_forest_leaves.mp3", gain: 0.50 },
  night: { file: "ambience_night_crickets.mp3", gain: 0.12 },
  forest: { file: "ambience_forest.mp3", gain: 0.08 },
  morning: { file: "ambience_morning_birds.mp3", gain: 0.10 },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, dt, sharpness) => a + (b - a) * (1 - Math.exp(-sharpness * dt));

function createTrack(name, def) {
  const audio = new Audio(`${AUDIO_BASE}${def.file}?v=3`);
  audio.loop = true;
  audio.preload = "auto";
  audio.playsInline = true;
  audio.volume = 0;
  audio.load();
  return { name, audio, gain: def.gain, value: 0, target: 0, ready: false, failed: false, lastError: "" };
}

function joystickMagnitude(stick) {
  const text = stick?.style?.transform ?? "";
  const match = text.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/);
  return match ? clamp01(Math.hypot(Number(match[1]), Number(match[2])) / 40) : 0;
}

function clockHour() {
  const match = (document.querySelector("#clock")?.textContent ?? "").match(/(\d{1,2}):(\d{2})/);
  return match ? (Number(match[1]) % 24) + Number(match[2]) / 60 : 12;
}

function dayWeights(hour) {
  let morning = 0;
  if (hour >= 5 && hour < 11) morning = hour < 7.5 ? (hour - 5) / 2.5 : 1 - (hour - 7.5) / 3.5;
  let night = 0;
  if (hour >= 18.5) night = (hour - 18.5) / 1.5;
  else if (hour < 5.5) night = 1;
  else if (hour < 7) night = 1 - (hour - 5.5) / 1.5;
  return { morning: clamp01(morning), night: clamp01(night) };
}

function makeButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "audio-toggle";
  button.textContent = "🔇 เสียง";
  button.setAttribute("aria-label", "เปิดหรือปิดเสียง");
  Object.assign(button.style, {
    position: "fixed", right: "12px", top: "calc(env(safe-area-inset-top, 0px) + 58px)",
    minWidth: "76px", height: "42px", padding: "0 10px", borderRadius: "14px",
    border: "1px solid rgba(255,255,255,.35)", background: "rgba(16,38,46,.78)",
    color: "white", font: "600 14px system-ui,sans-serif", zIndex: "6500",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  });
  document.body.append(button);
  return button;
}

const tracks = Object.fromEntries(Object.entries(TRACK_DEFS).map(([n, d]) => [n, createTrack(n, d)]));
const allTracks = Object.values(tracks);
const button = makeButton();
const stick = document.querySelector("#stick");
const keys = new Set();
let unlocked = false;
let muted = false;
let disposed = false;
let previewUntil = 0;
let lastTime = performance.now();
let raf = 0;

for (const track of allTracks) {
  track.audio.addEventListener("canplay", () => { track.ready = true; });
  track.audio.addEventListener("loadedmetadata", () => { track.ready = true; });
  track.audio.addEventListener("error", () => {
    track.failed = true;
    track.lastError = `media-${track.audio.error?.code ?? "unknown"}`;
    console.warn(`Audio file failed: ${track.name}`, track.audio.error);
  });
}

function keyMagnitude() {
  return [...keys].some((k) => ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) ? 1 : 0;
}

function toast(text) {
  const el = document.querySelector("#toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1600);
}

function requestPlay(track) {
  if (track.failed) return;
  const promise = track.audio.play();
  promise?.catch((error) => {
    track.lastError = error?.name ?? String(error);
    console.warn(`Audio play deferred: ${track.name}`, error);
  });
}

function unlockAudio({ preview = false } = {}) {
  if (disposed) return;
  unlocked = true;
  muted = false;
  button.textContent = "🔊 เสียง";
  for (const track of allTracks) {
    track.audio.volume = 0;
    requestPlay(track);
  }
  if (preview) previewUntil = performance.now() + 900;
  toast("🔊 เปิดเสียงแล้ว");
}

button.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!unlocked) {
    unlockAudio({ preview: true });
    return;
  }
  muted = !muted;
  button.textContent = muted ? "🔇 เสียง" : "🔊 เสียง";
  if (!muted) {
    for (const track of allTracks) requestPlay(track);
    previewUntil = performance.now() + 700;
  }
});

window.addEventListener("pointerdown", () => {
  if (!unlocked) unlockAudio();
}, { once: true, capture: true });
window.addEventListener("keydown", () => {
  if (!unlocked) unlockAudio();
}, { once: true });
window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

function setTargets(now) {
  for (const track of allTracks) track.target = 0;
  if (!unlocked || muted) return;

  if (now < previewUntil && !tracks.walk.failed) {
    tracks.walk.target = 0.50;
    return;
  }

  const movement = document.body.dataset.mode === "play" ? Math.max(joystickMagnitude(stick), keyMagnitude()) : 0;
  const running = movement > 0.78;
  const moving = movement > 0.05;
  const forest = new URLSearchParams(location.search).get("audiozone") === "forest";

  if (moving) {
    if (forest && !tracks.leaves.failed) tracks.leaves.target = tracks.leaves.gain;
    else if (running && !tracks.run.failed) tracks.run.target = tracks.run.gain;
    else if (!tracks.walk.failed) tracks.walk.target = tracks.walk.gain;
  }

  const day = dayWeights(clockHour());
  if (!tracks.morning.failed) tracks.morning.target = tracks.morning.gain * day.morning;
  if (!tracks.night.failed) tracks.night.target = tracks.night.gain * day.night * (forest ? 0.45 : 1);
  if (forest && !tracks.forest.failed) tracks.forest.target = tracks.forest.gain;
}

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

function update(now) {
  if (disposed) return;
  const delta = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  setTargets(now);

  for (const track of allTracks) {
    track.value = smooth(track.value, track.target, delta, ["walk", "run", "leaves"].includes(track.name) ? 14 : 3.2);
    track.audio.volume = clamp01(track.value);
  }

  if (debug) {
    debug.textContent = `AUDIO ${unlocked ? "UNLOCKED" : "LOCKED"} ${muted ? "MUTED" : "ON"}\n` +
      allTracks.map((t) => `${t.name}: ready=${t.audio.readyState} fail=${t.failed} paused=${t.audio.paused} vol=${t.value.toFixed(2)} dur=${Number(t.audio.duration || 0).toFixed(1)} err=${t.lastError || "-"}`).join("\n");
  }
  raf = requestAnimationFrame(update);
}
raf = requestAnimationFrame(update);

window.__lioraAudio = {
  unlock: () => unlockAudio({ preview: true }),
  get unlocked() { return unlocked; },
  get muted() { return muted; },
  get status() {
    return Object.fromEntries(allTracks.map((t) => [t.name, {
      readyState: t.audio.readyState, failed: t.failed, paused: t.audio.paused,
      volume: +t.value.toFixed(3), duration: Number(t.audio.duration || 0), error: t.lastError,
    }]));
  },
  dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    for (const track of allTracks) {
      track.audio.pause();
      track.audio.removeAttribute("src");
      track.audio.load();
    }
    button.remove();
    debug?.remove();
  },
};
