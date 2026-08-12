import * as THREE from "three";
import { BUILDER_CONTEXTS } from "./builder-state.js";
import { getBuildableAssets, getBuildableAsset } from "./asset-catalog.js";
import { PAINT_LAYERS } from "../systems/ground-paint.js";

const PAINT_BUTTONS = [
  { layer: PAINT_LAYERS.GRASS, label: "🌿 หญ้า" },
  { layer: PAINT_LAYERS.DIRT, label: "🟫 ดิน" },
  { layer: PAINT_LAYERS.SAND, label: "🏖️ ทราย" },
  { layer: PAINT_LAYERS.ROCK, label: "🪨 หิน" },
];

/**
 * The only file that knows about builder DOM and touch gestures.
 * It reads from builder-controller, draws through builder-view and
 * ground-paint, and never mutates the layout itself.
 */
export function createBuilderUI({
  controller,
  view,
  paint,
  paintConfig,
  ground,
  camera,
  surface,
  onExport,
}) {
  const root = document.querySelector("#build-panel");
  const assetStrip = document.querySelector("#asset-strip");
  const paintStrip = document.querySelector("#paint-strip");
  const actions = document.querySelector("#build-actions");
  const hint = document.querySelector("#build-hint");
  const tabPlace = document.querySelector("#tab-place");
  const tabPaint = document.querySelector("#tab-paint");

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const activePointers = new Set();

  let tab = "place";
  let paintLayer = PAINT_LAYERS.DIRT;
  let paintRadius = paintConfig.defaultRadius;
  let dragging = false;
  let lastPaintX = 0;
  let lastPaintZ = 0;
  let currentAssetId = null;
  let selectedId = null;

  function groundPoint(event) {
    const rect = surface.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(ground, false)[0]?.point ?? null;
  }

  function buildAssetStrip() {
    assetStrip.replaceChildren(
      ...getBuildableAssets().map((asset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.assetId = asset.id;
        button.innerHTML = `<span class="glyph">${asset.icon}</span><span>${asset.label}</span>`;
        button.onclick = () => controller.beginPlacement(asset.id);
        return button;
      })
    );
  }

  function buildPaintStrip() {
    const buttons = PAINT_BUTTONS.map(({ layer, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.paintLayer = String(layer);
      button.textContent = label;
      button.onclick = () => {
        paintLayer = layer;
        render();
      };
      return button;
    });

    const sizeLabel = document.createElement("label");
    sizeLabel.className = "range";
    const range = document.createElement("input");
    range.type = "range";
    range.min = String(paintConfig.minRadius);
    range.max = String(paintConfig.maxRadius);
    range.step = "0.1";
    range.value = String(paintRadius);
    range.oninput = () => {
      paintRadius = Number(range.value);
    };
    sizeLabel.append("ขนาด", range);

    const undo = document.createElement("button");
    undo.type = "button";
    undo.textContent = "↶ ย้อน";
    undo.onclick = () => {
      paint.undo();
      render();
    };

    paintStrip.replaceChildren(...buttons, sizeLabel, undo);
  }

  function actionButton(label, handler, variant = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (variant) button.className = variant;
    button.onclick = handler;
    return button;
  }

  function renderActions() {
    if (tab === "paint") {
      actions.replaceChildren(
        actionButton("ล้างสีทั้งหมด", () => {
          paint.clear();
          render();
        }, "danger")
      );
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.PLACE) {
      actions.replaceChildren(
        actionButton("↺", () => view.nudgeGhost({ rotation: -Math.PI / 12 })),
        actionButton("↻", () => view.nudgeGhost({ rotation: Math.PI / 12 })),
        actionButton("−", () => view.nudgeGhost({ scale: -0.1 })),
        actionButton("＋", () => view.nudgeGhost({ scale: 0.1 })),
        actionButton("วางตรงนี้", commitPlacement, "primary"),
        actionButton("ยกเลิก", () => controller.cancelPlacement())
      );
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.EDIT) {
      actions.replaceChildren(
        actionButton("↺", () => nudgeSelected({ rotation: -Math.PI / 12 })),
        actionButton("↻", () => nudgeSelected({ rotation: Math.PI / 12 })),
        actionButton("−", () => nudgeSelected({ scale: -0.1 })),
        actionButton("＋", () => nudgeSelected({ scale: 0.1 })),
        actionButton("ทำซ้ำ", () => controller.duplicateSelected()),
        actionButton("ลบ", () => controller.deleteSelected(), "danger"),
        actionButton("เสร็จ", () => controller.clearSelection(), "primary")
      );
      return;
    }

    actions.replaceChildren(
      actionButton("บันทึกแผนที่", () => onExport?.(controller.items))
    );
  }

  function renderHint() {
    if (tab === "paint") {
      hint.textContent = `ลากนิ้วเดียวบนพื้นเพื่อระบาย • ${paint.strokeCount} รอย`;
      return;
    }
    if (controller.context === BUILDER_CONTEXTS.PLACE) {
      hint.textContent = "ลากนิ้วเดียวเพื่อเลื่อนตำแหน่ง แล้วกด วางตรงนี้";
      return;
    }
    if (controller.context === BUILDER_CONTEXTS.EDIT) {
      hint.textContent = "ลากเพื่อย้าย • สองนิ้วหมุนกล้อง";
      return;
    }
    hint.textContent = `แตะสิ่งของเพื่อแก้ไข • ทั้งหมด ${controller.items.length} ชิ้น`;
  }

  function render() {
    root.dataset.tab = tab;
    tabPlace.classList.toggle("active", tab === "place");
    tabPaint.classList.toggle("active", tab === "paint");

    for (const button of paintStrip.querySelectorAll("[data-paint-layer]")) {
      button.classList.toggle(
        "active",
        Number(button.dataset.paintLayer) === paintLayer
      );
    }
    for (const button of assetStrip.querySelectorAll("[data-asset-id]")) {
      button.classList.remove("active");
    }

    renderActions();
    renderHint();
  }

  async function commitPlacement() {
    const transform = view.getGhostTransform();
    if (!transform) return;
    if (!currentAssetId) return;
    const assetId = currentAssetId;
    view.clearGhost();
    const item = controller.addItem({ assetId, ...transform });
    await view.spawn(item);
    render();
  }

  function nudgeSelected({ rotation = 0, scale = 0 }) {
    const item = controller.items.find((entry) => entry.id === selectedId);
    if (!item) return;
    const asset = getBuildableAsset(item.assetId);
    const next = controller.updateSelected({
      rotation: item.rotation + rotation,
      scale: scale
        ? THREE.MathUtils.clamp(item.scale + scale, asset.minScale, asset.maxScale)
        : item.scale,
    });
    if (next) view.update(next);
  }

  function onPointerDown(event) {
    activePointers.add(event.pointerId);
    if (activePointers.size > 1) {
      dragging = false;
      return;
    }

    const point = groundPoint(event);

    if (tab === "paint") {
      if (!point) return;
      dragging = true;
      paint.paintAt(point.x, point.z, { layer: paintLayer, radius: paintRadius });
      lastPaintX = point.x;
      lastPaintZ = point.z;
      renderHint();
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.PLACE) {
      if (!point) return;
      dragging = true;
      view.moveGhost(point.x, point.z);
      return;
    }

    raycaster.setFromCamera(ndc, camera);
    const hitId = view.pick(raycaster);
    if (hitId) {
      controller.selectItem(hitId);
      dragging = true;
      return;
    }
    controller.clearSelection();
  }

  function onPointerMove(event) {
    if (!dragging || activePointers.size > 1) return;
    const point = groundPoint(event);
    if (!point) return;

    if (tab === "paint") {
      if (Math.hypot(point.x - lastPaintX, point.z - lastPaintZ) < paintRadius / 3) return;
      paint.paintAt(point.x, point.z, { layer: paintLayer, radius: paintRadius });
      lastPaintX = point.x;
      lastPaintZ = point.z;
      renderHint();
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.PLACE) {
      view.moveGhost(point.x, point.z);
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.EDIT) {
      const next = controller.updateSelected({ x: point.x, z: point.z });
      if (next) view.update(next);
    }
  }

  function onPointerEnd(event) {
    activePointers.delete(event.pointerId);
    dragging = false;
  }

  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", onPointerEnd);
  surface.addEventListener("pointercancel", onPointerEnd);

  tabPlace.onclick = () => {
    tab = "place";
    render();
  };
  tabPaint.onclick = () => {
    tab = "paint";
    controller.cancelPlacement();
    controller.clearSelection();
    render();
  };

  buildAssetStrip();
  buildPaintStrip();

  return {
    render,
    setPreview(preview) {
      currentAssetId = preview?.assetId ?? null;
      if (preview) view.showGhost(preview.asset).then(render);
      else view.clearGhost();
      render();
    },
    setSelection(item) {
      selectedId = item?.id ?? null;
      view.highlight(selectedId);
      render();
    },
    show(visible) {
      root.classList.toggle("on", visible);
      if (!visible) {
        controller.cancelPlacement();
        controller.clearSelection();
        view.clearGhost();
        dragging = false;
        activePointers.clear();
      }
      render();
    },
  };
}
