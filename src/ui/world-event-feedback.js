import { WORLD_ACTION_RUNTIME } from "../systems/world-action-runtime.js";
import { WORLD_ACTIONS } from "../systems/world-actions.js";
import { WORLD_EVENTS } from "../systems/world-events.js";

// Importing the singleton starts the data-driven event -> action bridge before
// the first player movement event. Keep the reference explicit for module-graph
// tools and for the future teardown move into the main system registry.
void WORLD_ACTION_RUNTIME;

/**
 * Presentation adapters for authored world actions.
 *
 * Register immediately at module boot so the action vocabulary is complete
 * before gameplay can emit its first event. The DOM element is resolved lazily
 * only when feedback is actually shown, so this is safe while <body> is still
 * being parsed.
 */
function installWorldEventFeedback({ durationMs = 1400 } = {}) {
  let timer = null;

  function show(text) {
    if (!text) return;
    const element = document.querySelector("#toast");
    if (!element) return;
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

const dispose = installWorldEventFeedback();
window.addEventListener("pagehide", dispose, { once: true });
