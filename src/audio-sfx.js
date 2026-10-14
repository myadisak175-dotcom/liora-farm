import { WORLD_EVENTS } from "./systems/world-events.js";
import {
  SFX_BANK,
  SFX_NAMES,
  createSfxGate,
  playbackRateFor,
  soundForButton,
  soundForWorldEvent,
} from "./systems/sfx-bank.js";

/**
 * One-shot sound effects: farm actions, emotes, button taps, toasts, zones.
 *
 * This file is wiring only. Which sound belongs to which moment, how loud it is
 * and when it must stay quiet is decided in systems/sfx-bank.js (tested in
 * Node). The Android and iOS audio runtimes are deliberately left alone —
 * effects use their own AudioContext, created on the first touch, and only read
 * the player's mute choice from window.__lioraAudio so the existing sound
 * button silences them too.
 *
 * A missing or undecodable file is tried once and then left alone: the game
 * simply has no sound for that moment instead of failing.
 */
const SFX_REVISION = "sfx1";
const SFX_BASE = new URL("../assets/audio/sfx/", import.meta.url);

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const gate = createSfxGate();
const buffers = new Map();
const failures = new Map();

let context = null;
let master = null;
let loading = null;
let playedCount = 0;

function isMuted() {
  return Boolean(window.__lioraAudio?.muted);
}

function ensureContext() {
  if (context || !AudioContextClass) return context;
  try {
    context = new AudioContextClass({ latencyHint: "interactive" });
    master = context.createGain();
    master.connect(context.destination);
  } catch (error) {
    context = null;
    failures.set("context", String(error?.message ?? error));
  }
  return context;
}

function decode(data) {
  // The promise form of decodeAudioData is missing on older WebKit; the
  // callback form works everywhere. The returned promise (where one exists)
  // is swallowed so a decode failure is reported once, through the callback.
  return new Promise((resolve, reject) => {
    const result = context.decodeAudioData(data, resolve, reject);
    result?.catch?.(() => {});
  });
}

async function loadOne(name) {
  const url = new URL(SFX_BANK[name].file, SFX_BASE);
  url.searchParams.set("v", SFX_REVISION);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    buffers.set(name, await decode(await response.arrayBuffer()));
  } catch (error) {
    failures.set(name, String(error?.message ?? error));
  }
}

function loadAll() {
  if (!loading) loading = Promise.all(SFX_NAMES.map(loadOne));
  return loading;
}

function resume() {
  if (context?.state === "suspended" || context?.state === "interrupted") {
    context.resume().catch(() => {});
  }
}

function play(name) {
  if (!context || isMuted() || document.hidden) return false;
  const buffer = buffers.get(name);
  // Checked before the gate: a sound that cannot play must not hold back the
  // toast chime that would otherwise stand in for it.
  if (!buffer) return false;
  if (!gate.allow(name, performance.now())) return false;

  resume();
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = playbackRateFor(name);
  gain.gain.value = SFX_BANK[name].gain;
  source.connect(gain);
  gain.connect(master);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  source.start();
  playedCount += 1;
  return true;
}

// Browsers only allow audio after a gesture. The first touch creates the
// context and starts decoding; later touches just wake it if the phone put it
// to sleep (a call, another app, a locked screen).
function unlock() {
  if (!ensureContext()) return;
  resume();
  loadAll();
}
for (const type of ["pointerdown", "touchend", "keydown"]) {
  window.addEventListener(type, unlock, { passive: true, capture: true });
}

WORLD_EVENTS.subscribe((event) => {
  const name = soundForWorldEvent(event);
  if (name) play(name);
});

// Runs after the button's own onclick (the document listener fires last while
// the event bubbles), so the emote's "active" mark already says whether the
// pose really started.
document.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("button") : null;
  if (!button) return;
  const name = soundForButton({
    mode: document.body?.dataset.mode,
    action: button.dataset.action,
    started: button.classList.contains("active"),
  });
  if (name) play(name);
});

function watchToast() {
  const element = document.querySelector("#toast");
  if (!element) return;
  let wasOn = element.classList.contains("on");
  new MutationObserver(() => {
    const isOn = element.classList.contains("on");
    if (isOn && !wasOn) play("toast");
    wasOn = isOn;
  }).observe(element, { attributes: true, attributeFilter: ["class"] });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", watchToast, { once: true });
} else {
  watchToast();
}

window.__lioraSfx = {
  play,
  get status() {
    return {
      revision: SFX_REVISION,
      context: context?.state ?? "not-created",
      muted: isMuted(),
      loaded: [...buffers.keys()],
      missing: [...failures.keys()],
      errors: [...failures.entries()].map(([name, message]) => `${name}:${message}`),
      played: playedCount,
    };
  },
};
