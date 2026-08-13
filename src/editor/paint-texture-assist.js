const VARIANT_EVENT = "liora-paint-variant";
const BASE_DIRT = "dirt";
const EXTRAS = [
  { variant: "dirtSoft", label: "🟤 ดินละเอียด" },
  { variant: "dirtPath", label: "🛤️ ทางดิน" },
];

let activeVariant = BASE_DIRT;

function emitVariant(variant) {
  window.dispatchEvent(new CustomEvent(VARIANT_EVENT, { detail: { variant } }));
}

function mount() {
  const strip = document.querySelector("#paint-strip");
  if (!strip || strip.querySelector("[data-paint-variant]")) return Boolean(strip);

  const baseButtons = [...strip.querySelectorAll("[data-paint-layer]")];
  const dirtButton = strip.querySelector('[data-paint-layer="0"]');
  if (!baseButtons.length || !dirtButton) return false;

  const extraButtons = EXTRAS.map(({ variant, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.paintVariant = variant;
    button.textContent = label;
    button.onclick = () => {
      dirtButton.click();
      activeVariant = variant;
      emitVariant(variant);
      sync();
    };
    return button;
  });

  function sync() {
    if (activeVariant !== BASE_DIRT) dirtButton.classList.remove("active");
    for (const button of extraButtons) {
      button.classList.toggle("active", button.dataset.paintVariant === activeVariant);
    }
  }

  for (const button of baseButtons) {
    button.addEventListener("click", () => {
      activeVariant = BASE_DIRT;
      emitVariant(BASE_DIRT);
      queueMicrotask(sync);
    });
  }

  strip.append(...extraButtons);
  emitVariant(BASE_DIRT);
  sync();
  return true;
}

if (!mount()) {
  const observer = new MutationObserver(() => {
    if (!mount()) return;
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
