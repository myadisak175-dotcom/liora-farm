import { WORLD_ACTIONS } from "../systems/world-actions.js";
import { WORLD_EVENTS } from "../systems/world-events.js";

/**
 * Presentation adapters for authored world actions.
 *
 * The gameplay action registry stays DOM-free. This module teaches it only the
 * `toast` presentation action and keeps a small fallback for legacy/generic
 * zones that have no authored action list yet.
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

  const unregisterToast = WORLD_ACTIONS.register("toast", (action, context) => {
    const authored = String(action.text ?? action.message ?? "").trim();
    show(authored || context?.node?.label || "เหตุการณ์ในโลก");
  });

  const unsubscribeFallback = WORLD_EVENTS.subscribe((event) => {
    if (event?.type !== "enter") return;
    const node = event.node;
    if (!node?.enabled) return;
    const actions = node.data?.actions?.enter;
    if (Array.isArray(actions) && actions.length) return;
    show(`เข้าเขต: ${node.label || node.kind || "Zone"}`);
  });

  return () => {
    unregisterToast();
    unsubscribeFallback();
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
