const AUDIO_BASE = "./assets/audio/";

const TRACK_DEFS = {
  walk: { file: "footstep_grass_walk.mp3", loop: true, gain: 0.52 },
  run: { file: "footstep_grass_run.mp3", loop: true, gain: 0.48 },
  leaves: { file: "footstep_forest_leaves.mp3", loop: true, gain: 0.48 },
  night: { file: "ambience_night_crickets.mp3", loop: true, gain: 0.11 },
  forest: { file: "ambience_forest.mp3", loop: true, gain: 0.09 },
  morning: { file: "ambience_morning_birds.mp3", loop: true, gain: 0.10 },
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smooth(current, target, delta, sharpness = 7) {
  return current + (target - current) * (1 - Math.exp(-sharpness * delta));
}

function createTrack(name, def) {
  const audio = new Audio(`${AUDIO_BASE}${def.file}`);
  audio.loop = def.loop !== false;
  audio.preload = "auto";
  audio.playsInline = true;
  audio.volume = 0;
  audio.dataset.lioraTrack = name;
  return { name, audio, gain: def.gain, value: 0, target: 0, ready: false, failed: false };
}

function parseJoystickMagnitude(stick) {
  const text = stick?.style?.transform ?? "";
  const match = text.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/);
  if (!match) return 0;
  return clamp01(Math.hypot(Number(match[1]), Number(match[2])) / 40);
}

function parseClockHour() {
  const text = document.querySelector("#clock")?.textContent ?? "";
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 12;
  return (Number(match[1]) % 24) + Number(match[2]) / 60;
}

function dayWeights(hour) {
  let morning = 0;
  if (hour >= 5 && hour < 11) {
    morning = hour < 7.5 ? (hour - 5) / 2.5 : 1 - (hour - 7.5) / 3.5;
  }
  morning = clamp01(morning);

  let night = 0;
  if (hour >= 18.5) night = clamp01((hour - 18.5) / 1.5);
  else if (hour < 5.5) night = 1;
  else if (hour < 7) night = clamp01(1 - (hour - 5.5) / 1.5);
  return { morning, night };
}

function createAudioButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "audio-toggle";
  button.textContent = "🔇";
  button.setAttribute("aria-label", "เปิดหรือปิดเสียง");
  Object.assign(button.style, {
    position: "fixed",
    right: "12px",
    top: "calc(env(safe-area-inset-top, 0px) + 58px)",
    width: "42px",
    height: "42px",
    borderRadius: "14px",
    border: "1px solid rgba(255,255,255,.35)",
    background: "rgba(16,38,46,.72)",
    color: "white",
    fontSize: "20px",
    zIndex: "6500",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  });
  document.body.append(button);
  return button;
}

const tracks = Object.fromEntries(
  Object.entries(TRACK_DEFS).map(([name, def]) => [name, createTrack(name, def)])
);
const allTracks = Object.values(tracks);
const audioButton = createAudioButton();
const stick = document.querySelector("#stick");
const keys = new Set();
let unlocked = false;
let muted = false;
let disposed = false;
let lastTime = performance.now();
let raf = 0;
let unlockMessageShown = false;

for (const track of allTracks) {
  track.audio.addEventListener("canplay", () => { track.ready = true; }, { once: true });
  track.audio.addEventListener("error", () => {
    track.failed = true;
    console.warn(`Audio track failed: ${track.name}`, track.audio.error);
  });
}

function keyboardMagnitude() {
  const x = Number(keys.has("a") || keys.has("arrowleft")) + Number(keys.has("d") || keys.has("arrowright"));
  const z = Number(keys.has("w") || keys.has("arrowup")) + Number(keys.has("s") || keys.has("arrowdown"));
  return (x || z) ? 1 : 0;
}

function showUnlockMessage() {
  if (unlockMessageShown) return;
  unlockMessageShown = true;
  const toast = document.querySelector("#toast");
  if (!toast) return;
  const old = toast.textContent;
  toast.textContent = "🔊 เปิดเสียง Liora แล้ว";
  toast.classList.add("show");
  setTimeout(() => {
    if (toast.textContent === "🔊 เปิดเสียง Liora แล้ว") toast.textContent = old;
  }, 1600);
}

function unlockAudio() {
  if (unlocked || disposed) return;
  unlocked = true;
  muted = false;
  audioButton.textContent = "🔊";

  // Mobile browsers only grant media playback from a user gesture. Starting
  // every loop at zero volume here means later crossfades do not need another
  // tap when morning turns to night or walking turns into running.
  for (const track of allTracks) {
    track.audio.volume = 0;
    const promise = track.audio.play();
    promise?.catch((error) => {
      console.warn(`Audio unlock failed: ${track.name}`, error);
      unlocked = false;
      audioButton.textContent = "🔇";
    });
  }
  showUnlockMessage();
}

function toggleMute(event) {
  event?.stopPropagation?.();
  if (!unlocked) {
    unlockAudio();
    return;
  }
  muted = !muted;
  audioButton.textContent = muted ? "🔇" : "🔊";
}

audioButton.addEventListener("pointerdown", toggleMute);
window.addEventListener("pointerdown", unlockAudio, { capture: true, once: true });
window.addEventListener("keydown", unlockAudio, { capture: true, once: true });
window.addEventListener("keydown", (event) => keys.add(event.key.toLowerCase()));
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

function setTargets() {
  for (const track of allTracks) track.target = 0;
  if (!unlocked || muted) return;

  const playing = document.body.dataset.mode === "play";
  const joy = parseJoystickMagnitude(stick);
  const movement = playing ? Math.max(joy, keyboardMagnitude()) : 0;
  const running = movement > 0.78;
  const moving = movement > 0.05;

  // Until the player position is exposed to this sidecar, grass is the safe
  // surface fallback. Forest sounds can still be auditioned with
  // ?audiozone=forest without changing gameplay or map data.
  const forcedForest = new URLSearchParams(location.search).get("audiozone") === "forest";
  if (moving) {
    if (forcedForest) tracks.leaves.target = tracks.leaves.gain;
    else if (running) tracks.run.target = tracks.run.gain;
    else tracks.walk.target = tracks.walk.gain;
  }

  const { morning, night } = dayWeights(parseClockHour());
  tracks.morning.target = tracks.morning.gain * morning;
  tracks.night.target = tracks.night.gain * night * (forcedForest ? 0.45 : 1);
  tracks.forest.target = forcedForest ? tracks.forest.gain : 0;
}

function update(now) {
  if (disposed) return;
  const delta = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  setTargets();

  for (const track of allTracks) {
    track.value = smooth(track.value, track.target, delta, track.name === "walk" || track.name === "run" || track.name === "leaves" ? 12 : 3.2);
    track.audio.volume = clamp01(track.value);
  }
  raf = requestAnimationFrame(update);
}
raf = requestAnimationFrame(update);

window.__lioraAudio = {
  unlock: unlockAudio,
  get unlocked() { return unlocked; },
  get muted() { return muted; },
  get status() {
    return Object.fromEntries(allTracks.map((track) => [track.name, {
      ready: track.ready,
      failed: track.failed,
      volume: +track.value.toFixed(3),
      src: track.audio.src,
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
    audioButton.remove();
  },
};
