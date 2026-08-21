import { WORLD_EVENTS } from "../systems/world-events.js";

/**
 * Lightweight player feedback for authored world events.
 *
 * This is intentionally only presentation. Game rules subscribe to the same
 * WORLD_EVENTS bus elsewhere, so replacing these toasts with quest UI, audio,
 * portals or cutscenes never changes the proximity runtime.
 */
function createToastPresenter({ durationMs = 1400 } = {}) {
  const element = document.querySelector("#toast");
  let timer = null;

  function show(text) {
    if (!element || !text) return;
    element.textContent = text;
    element.classList.add("on");
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.remove("on"), durationMs);
  }

  function dispose() {
    clearTimeout(timer);
    timer = null;
  }

  return { show, dispose };
}

const presenter = createToastPresenter();
const unsubscribe = WORLD_EVENTS.subscribe((event) => {
  if (event?.type !== "enter") return;
  const node = event.node;
  if (!node?.enabled) return;
  const authored = String(node.data?.message ?? "").trim();
  presenter.show(authored || `เข้าเขต: ${node.label || node.kind || "Zone"}`);
});

window.addEventListener("pagehide", () => {
  unsubscribe();
  presenter.dispose();
}, { once: true });
