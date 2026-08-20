const AUDIO_SELECTOR_REVISION = "audio24-route2";

const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const hasWebAudio = Boolean(window.AudioContext || window.webkitAudioContext);

// Android stays on the exact native audio19 runtime that passed real-device
// testing. Apple mobile keeps the priority-loaded WebKit runtime and now uses a
// two-phase output repair: once after unlock, then again when the primary
// footsteps + ambience buffers are actually ready.
const route = appleMobile && hasWebAudio ? "ios-context" : "native";
window.__lioraAudioPlatform = { revision: AUDIO_SELECTOR_REVISION, route };

if (route === "ios-context") {
  // Query-bust both nested iOS modules: Safari aggressively caches them.
  await import("./audio-ios-runtime-v3.js?v=audio24-route2");
  await import("./audio-ios-output-stabilizer.js?v=audio24-route2");
} else {
  await import("./audio-native-runtime.js");
}
