const AUDIO_SELECTOR_REVISION = "audio24-priority1";

const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const hasWebAudio = Boolean(window.AudioContext || window.webkitAudioContext);

// Android stays on the exact native audio19 runtime that passed real-device
// testing. Apple mobile keeps the WebKit-specific context runtime, now with
// priority loading for the immediately audible footsteps and ambience, plus
// the output stabilizer that fixes WebKit's occasional silent route.
const route = appleMobile && hasWebAudio ? "ios-context" : "native";
window.__lioraAudioPlatform = { revision: AUDIO_SELECTOR_REVISION, route };

if (route === "ios-context") {
  // Query-bust the iOS modules too: Safari aggressively caches nested modules.
  await import("./audio-ios-runtime-v3.js?v=audio24-priority1");
  await import("./audio-ios-output-stabilizer.js?v=audio23-fast1");
} else {
  await import("./audio-native-runtime.js");
}
