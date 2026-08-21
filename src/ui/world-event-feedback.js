import { WORLD_EVENTS } from "../systems/world-events.js";

/**
 * Lightweight player feedback for authored world events.
 *
 * This is intentionally only presentation. Game rules subscribe to the same
 * WORLD_EVENTS bus elsewhere, so replacing these toasts with quest UI, audio,
 * portals or cutscenes never changes the proximity runtime.
 */
function installWorldEventFeedback({ durationMs = 1400 } = {}) {
  const element = document.querySelector("#toast");
  if (!element) return () => {};
  let timer = null;

  function show(text) {
    if (!text) return;
    element.textContent = text;
    element.classList.add("on");
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.remove("on"), durationMs);
  }

  const unsubscribe = WORLD_EVENTS.subscribe((event) => {
    if (event?.type !== "enter") return;
    const node = event.node;
    if (!node?.enabled) return;
    const authored = String(node.data?.message ?? "").trim();
    show(authored || `เข้าเขต: ${node.label || node.kind || "Zone"}`);
  });

  return () => {
    unsubscribe();
    clearTimeout(timer);
    timer = null;
  };
}

function boot() {
  const dispose = installWorldEventFeedback();
  window.addEventListener("pagehide", dispose, { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
