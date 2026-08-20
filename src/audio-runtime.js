const AUDIO_SELECTOR_REVISION = "audio22";

const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const hasWebAudio = Boolean(window.AudioContext || window.webkitAudioContext);

// Android stays on the exact native audio19 runtime that passed real-device
// testing. Apple mobile gets its own runtime so WebKit-specific recovery cannot
// regress Android. audio22 uses a new iOS module filename to defeat Safari's
// nested ES-module cache and ships the first-tap repair path independently.
const route = appleMobile && hasWebAudio ? "ios-context" : "native";
window.__lioraAudioPlatform = { revision: AUDIO_SELECTOR_REVISION, route };

if (route === "ios-context") {
  await import("./audio-ios-runtime-v3.js");
} else {
  await import("./audio-native-runtime.js");
}
