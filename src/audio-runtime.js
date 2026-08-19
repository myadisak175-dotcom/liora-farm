const AUDIO_SELECTOR_REVISION = "audio21";

const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const hasWebAudio = Boolean(window.AudioContext || window.webkitAudioContext);

// Android stays on the exact native audio19 runtime that passed real-device
// testing. Apple mobile gets a separate runtime so WebKit-specific recovery
// cannot regress Android. The iOS filename changes in audio21 because nested
// ES-module imports stay canonical (no ?query) and Safari may cache them.
const route = appleMobile && hasWebAudio ? "ios-context" : "native";
window.__lioraAudioPlatform = { revision: AUDIO_SELECTOR_REVISION, route };

if (route === "ios-context") {
  await import("./audio-ios-runtime-v2.js");
} else {
  await import("./audio-native-runtime.js");
}
