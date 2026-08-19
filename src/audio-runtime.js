const AUDIO_SELECTOR_REVISION = "audio20";

const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const hasWebAudio = Boolean(window.AudioContext || window.webkitAudioContext);

// Keep the Android/native runtime isolated from the iOS Web Audio runtime.
// Only one of these modules is ever evaluated on a page. Android keeps the
// exact audio19 implementation that is already verified on real hardware.
// The nested specifiers stay canonical (no ?query): both files are new names
// in audio20, while index.html cache-busts this selector itself.
const route = appleMobile && hasWebAudio ? "ios-context" : "native";
window.__lioraAudioPlatform = { revision: AUDIO_SELECTOR_REVISION, route };

if (route === "ios-context") {
  await import("./audio-ios-runtime.js");
} else {
  await import("./audio-native-runtime.js");
}
