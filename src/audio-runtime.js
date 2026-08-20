const AUDIO_SELECTOR_REVISION = "audio23";

const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const hasWebAudio = Boolean(window.AudioContext || window.webkitAudioContext);

// Android stays on the exact native audio19 runtime that passed real-device
// testing. Apple mobile keeps the WebKit-specific context runtime, then adds a
// tiny output stabilizer that automatically reproduces the off/on reset some
// iPhones still needed after the first successful unlock.
const route = appleMobile && hasWebAudio ? "ios-context" : "native";
window.__lioraAudioPlatform = { revision: AUDIO_SELECTOR_REVISION, route };

if (route === "ios-context") {
  // Query-bust the iOS runtime too: Safari aggressively caches nested modules.
  await import("./audio-ios-runtime-v3.js?v=audio23");
  await import("./audio-ios-output-stabilizer.js?v=audio23");
} else {
  await import("./audio-native-runtime.js");
}
