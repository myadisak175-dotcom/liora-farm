import * as THREE from "three";
import { SPLAT_LAYERS } from "./splat-texture.js";

const LAYER_BUTTONS = [
  { label: "ดิน", layer: SPLAT_LAYERS.DIRT },
  { label: "ทราย", layer: SPLAT_LAYERS.SAND },
  { label: "หิน", layer: SPLAT_LAYERS.ROCK },
  { label: "ลบ", layer: SPLAT_LAYERS.ERASE },
];

const PANEL_STYLE = {
  position: "fixed", left: "50%", bottom: "84px", transform: "translateX(-50%)",
  zIndex: "12", display: "none", gap: "6px", alignItems: "center", maxWidth: "94vw",
  overflowX: "auto", padding: "8px 10px", borderRadius: "16px",
  background: "rgba(23,60,75,.86)", border: "1px solid rgba(255,255,255,.5)",
  backdropFilter: "blur(5px)",
};

const BUTTON_STYLE = {
  flex: "0 0 auto", border: "1px solid rgba(255,255,255,.5)",
  background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: "11px",
  padding: "7px 9px", font: "700 12px system-ui,sans-serif",
};

function styled(tag, style, text) {
  const element = document.createElement(tag);
  Object.assign(element.style, style);
  if (text) element.textContent = text;
  if (tag === "button") element.type = "button";
  return element;
}

export function createPaintController({
  renderer,
  camera,
  groundMesh,
  painter,
  store = null,
  brushRadius = 1.6,
  strength = 0.85,
  minRadius = 0.4,
  maxRadius = 5,
}) {
  const surface = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const activePointers = new Set();
  let enabled = false;
  let layer = SPLAT_LAYERS.DIRT;
  let radius = brushRadius;
  let painting = false;
  let lastX = 0;
  let lastZ = 0;

  const toggle = styled("button", {
    ...BUTTON_STYLE, position: "fixed", right: "18px", bottom: "190px",
    width: "50px", height: "50px", borderRadius: "50%", fontSize: "20px",
    background: "rgba(23,60,75,.73)", zIndex: "12",
  }, "🖌");
  document.body.appendChild(toggle);

  const panel = styled("div", PANEL_STYLE);
  const layerButtons = LAYER_BUTTONS.map(({ label, layer: value }) => {
    const button = styled("button", BUTTON_STYLE, label);
    button.onclick = () => setLayer(value);
    panel.appendChild(button);
    return { button, value };
  });

  const size = document.createElement("input");
  size.type = "range";
  size.min = String(minRadius);
  size.max = String(maxRadius);
  size.step = "0.1";
  size.value = String(radius);
  size.style.flex = "0 0 auto";
  size.style.width = "76px";
  size.oninput = () => { radius = Number(size.value); };
  panel.appendChild(size);

  const undo = styled("button", BUTTON_STYLE, "↶");
  undo.onclick = () => { if (painter.undo()) markChanged(); };
  panel.appendChild(undo);

  const exportButton = styled("button", BUTTON_STYLE, "⬇ Export");
  exportButton.style.display = store ? "block" : "none";
  exportButton.onclick = () => store?.download();
  panel.appendChild(exportButton);

  const counter = styled("span", {
    flex: "0 0 auto", color: "#cfe9f3", font: "600 11px system-ui,sans-serif", padding: "0 2px",
  }, "0");
  panel.appendChild(counter);
  document.body.appendChild(panel);

  function refreshCounter() {
    if (!store) {
      counter.textContent = String(painter.count());
      return;
    }
    const label = { draft: "ดราฟต์", map: "แผนที่", empty: "ว่าง" }[store.getSource()];
    counter.textContent = `${painter.count()} • ${label}`;
  }

  function markChanged() {
    store?.saveDraft();
    refreshCounter();
  }

  function paintLayerHighlight() {
    for (const { button, value } of layerButtons) {
      button.style.background = value === layer ? "rgba(255,255,255,.42)" : "rgba(255,255,255,.12)";
    }
  }

  function setLayer(value) {
    layer = value;
    paintLayerHighlight();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    painting = false;
    panel.style.display = enabled ? "flex" : "none";
    toggle.style.background = enabled ? "rgba(255,255,255,.42)" : "rgba(23,60,75,.73)";
    if (enabled) refreshCounter();
  }

  function groundPointAt(event) {
    const rect = surface.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hit = raycaster.intersectObject(groundMesh, false)[0];
    return hit ? hit.point : null;
  }

  function shouldRecord(x, z) {
    return Math.hypot(x - lastX, z - lastZ) >= radius / 3;
  }

  function apply(event, isFirst) {
    const point = groundPointAt(event);
    if (!point) return;
    if (!isFirst && !shouldRecord(point.x, point.z)) return;
    painter.paint(point.x, point.z, radius, layer, strength);
    lastX = point.x;
    lastZ = point.z;
    markChanged();
  }

  function onPointerDown(event) {
    activePointers.add(event.pointerId);
    if (!enabled || activePointers.size > 1) return;
    event.stopPropagation();
    painting = true;
    apply(event, true);
  }

  function onPointerMove(event) {
    if (!enabled || !painting) return;
    if (activePointers.size > 1) {
      painting = false;
      return;
    }
    event.stopPropagation();
    apply(event, false);
  }

  function onPointerUp(event) {
    activePointers.delete(event.pointerId);
    if (!enabled || !painting) return;
    event.stopPropagation();
    painting = false;
  }

  toggle.onclick = () => setEnabled(!enabled);
  paintLayerHighlight();
  refreshCounter();

  surface.addEventListener("pointerdown", onPointerDown, { capture: true });
  surface.addEventListener("pointermove", onPointerMove, { capture: true });
  surface.addEventListener("pointerup", onPointerUp, { capture: true });
  surface.addEventListener("pointercancel", onPointerUp, { capture: true });

  return {
    isEnabled: () => enabled,
    setEnabled,
    setLayer,
    refresh: refreshCounter,
    setRadius(value) {
      radius = THREE.MathUtils.clamp(value, minRadius, maxRadius);
      size.value = String(radius);
    },
    dispose() {
      surface.removeEventListener("pointerdown", onPointerDown, { capture: true });
      surface.removeEventListener("pointermove", onPointerMove, { capture: true });
      surface.removeEventListener("pointerup", onPointerUp, { capture: true });
      surface.removeEventListener("pointercancel", onPointerUp, { capture: true });
      toggle.remove();
      panel.remove();
    },
  };
}
