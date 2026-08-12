import * as THREE from "three";
import { BUILDER_CONTEXTS } from "./builder-state.js";
import {
  BUILD_CATEGORIES,
  getBuildableAssets,
  getBuildableAsset,
} from "./asset-catalog.js";
import { PAINT_LAYERS } from "../systems/ground-paint.js";

const PAINT_BUTTONS = [
  { layer: PAINT_LAYERS.GRASS, label: "🌿 หญ้า" },
  { layer: PAINT_LAYERS.DIRT, label: "🟫 ดิน" },
  { layer: PAINT_LAYERS.SAND, label: "🏖️ ทราย" },
  { layer: PAINT_LAYERS.ROCK, label: "🪨 หิน" },
];

// The catalog has carried categories since day one; the strip never used them
// and just grew sideways. With hundreds of models that stops working.
const ALL_CATEGORY = "all";
const CATEGORY_BUTTONS = [
  { id: ALL_CATEGORY, label: "ทั้งหมด" },
  { id: BUILD_CATEGORIES.NATURE, label: "🌳 ธรรมชาติ" },
  { id: BUILD_CATEGORIES.BUILDINGS, label: "🏡 อาคาร" },
  { id: BUILD_CATEGORIES.DECOR, label: "📦 ตกแต่ง" },
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
  builderConfig,
  ground,
  camera,
  cameraController,
  surface,
  onExport,
  onResetLayout,
}) {
  const root = document.querySelector("#build-panel");
  const categoryStrip = document.querySelector("#asset-cats");
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
  let category = ALL_CATEGORY;
  let paintLayer = PAINT_LAYERS.DIRT;
  let paintRadius = paintConfig.defaultRadius;
  let snapEnabled = Boolean(builderConfig?.snapDefault);
  // "paint" | "ghost" | "item" | "pan" | null
  let dragMode = null;
  let dragRecorded = false;
  let grabOffsetX = 0;
  let grabOffsetZ = 0;
  let lastPanX = 0;
  let lastPanY = 0;
  let currentAssetId = null;
  let selectedId = null;
  let notice = "";

  function groundPoint(event) {
    const rect = surface.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(ground, false)[0]?.point ?? null;
  }

  function snapped(transform) {
    return controller.snapTransform(transform, snapEnabled);
  }

  function validationMessage(result) {
    if (result?.ok) return "";
    switch (result?.code) {
      case "edge":
        return "วางไม่ได้ — สิ่งของจะล้นขอบเกาะ";
      case "collision":
        return "วางไม่ได้ — ทับอาคารหลังอื่น";
      case "reserved":
        return `วางไม่ได้ — ตรงนี้เป็น${result.label ?? "พื้นที่สงวน"}`;
      case "stacked":
        return "วางซ้อนชิ้นเดิมไม่ได้ — ลากออกมาหน่อย";
      case "scale":
        return "ขนาดนี้อยู่นอกช่วงที่อนุญาต";
      default:
        return "วางตรงนี้ไม่ได้";
    }
  }

  function setNotice(text = "") {
    notice = text;
    renderHint();
  }

  function validateGhost() {
    const transform = view.getGhostTransform();
    if (!currentAssetId || !transform) return { ok: false, code: "invalid-transform" };
    return controller.validatePlacement(currentAssetId, transform);
  }

  function visibleAssets() {
    const all = getBuildableAssets();
    return category === ALL_CATEGORY
      ? all
      : all.filter((asset) => asset.category === category);
  }

  function buildCategoryStrip() {
    categoryStrip.replaceChildren(
      ...CATEGORY_BUTTONS.map(({ id, label }) => {
        const count =
          id === ALL_CATEGORY
            ? getBuildableAssets().length
            : getBuildableAssets().filter((asset) => asset.category === id).length;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.category = id;
        button.textContent = `${label} ${count}`;
        button.onclick = () => {
          category = id;
          notice = "";
          buildAssetStrip();
          render();
        };
        return button;
      })
    );
  }

  function buildAssetStrip() {
    assetStrip.replaceChildren(
      ...visibleAssets().map((asset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.assetId = asset.id;
        button.innerHTML = `<span class="glyph">${asset.icon}</span><span>${asset.label}</span>`;
        button.onclick = () => {
          notice = "";
          controller.beginPlacement(asset.id);
        };
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
        notice = "";
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

  function snapButton() {
    const button = actionButton(snapEnabled ? "📐 กริด" : "📐 อิสระ", () => {
      snapEnabled = !snapEnabled;
      render();
    });
    button.classList.toggle("active", snapEnabled);
    return button;
  }

  function scalePercent(asset, scale) {
    return Math.round((scale / asset.defaultScale) * 100);
  }

  function scaleFromPercent(asset, percent) {
    return asset.defaultScale * (percent / 100);
  }

  function updateGhostValidation() {
    const result = validateGhost();
    setNotice(validationMessage(result));
    return result;
  }

  function updateSelectedTransform(transform, { recordHistory = false } = {}) {
    const item = controller.items.find((entry) => entry.id === selectedId);
    if (!item) return null;
    const candidate = { ...item, ...transform };
    const result = controller.validatePlacement(item.assetId, candidate, item.id);
    if (!result.ok) {
      setNotice(validationMessage(result));
      return null;
    }
    const next = controller.updateSelected(transform, { recordHistory });
    if (next) {
      notice = "";
      view.update(next);
    }
    return next;
  }

  function scaleControl(asset, currentScale, onScale) {
    const label = document.createElement("label");
    label.className = "range size-range";

    const text = document.createElement("span");
    const setText = (scale) => {
      text.textContent = `ขนาด ${scalePercent(asset, scale)}%`;
    };
    setText(currentScale);

    const range = document.createElement("input");
    range.type = "range";
    range.min = String(scalePercent(asset, asset.minScale));
    range.max = String(scalePercent(asset, asset.maxScale));
    range.step = "1";
    range.value = String(scalePercent(asset, currentScale));
    range.oninput = () => {
      const next = scaleFromPercent(asset, Number(range.value));
      setText(next);
      const accepted = onScale(next);
      if (accepted === false) render();
    };

    label.append(text, range);
    return label;
  }

  async function duplicateSelected() {
    const duplicate = controller.duplicateSelected();
    if (!duplicate) {
      setNotice("ทำซ้ำไม่ได้ — รอบ ๆ ไม่มีพื้นที่ว่างพอ");
      return;
    }
    await view.spawn(duplicate);
    controller.selectItem(duplicate.id);
    notice = "";
    render();
  }

  function deleteSelected() {
    const removed = controller.deleteSelected();
    if (!removed) return;
    view.remove(removed.id);
    notice = "";
    render();
  }

  /** History was recorded from the start but never read — this is the reader. */
  async function undo() {
    const result = controller.undo();
    if (!result) {
      setNotice("ไม่มีอะไรให้ย้อนแล้ว");
      return;
    }
    if (result.type === "removed") view.remove(result.item.id);
    if (result.type === "restored") await view.spawn(result.item);
    if (result.type === "moved") view.update(result.item);
    notice = "";
    render();
  }

  function renderActions() {
    if (tab === "paint") {
      actions.replaceChildren(
        actionButton("↶ ย้อน", () => {
          paint.undo();
          render();
        }),
        actionButton("ล้างสีทั้งหมด", () => {
          if (!confirm("ล้างสีพื้นทั้งหมด? ย้อนกลับไม่ได้")) return;
          paint.clear();
          render();
        }, "danger")
      );
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.PLACE) {
      const asset = getBuildableAsset(currentAssetId);
      const transform = view.getGhostTransform();
      const currentScale = transform?.scale ?? asset?.defaultScale ?? 1;

      if (!asset) {
        actions.replaceChildren(actionButton("ยกเลิก", () => controller.cancelPlacement()));
        return;
      }

      actions.replaceChildren(
        actionButton("↺", () => {
          view.nudgeGhost({ rotation: -Math.PI / 12 });
          updateGhostValidation();
        }),
        actionButton("↻", () => {
          view.nudgeGhost({ rotation: Math.PI / 12 });
          updateGhostValidation();
        }),
        actionButton("−", () => {
          const liveScale = view.getGhostTransform()?.scale ?? asset.defaultScale;
          view.setGhostScale(liveScale - asset.scaleStep);
          updateGhostValidation();
          render();
        }),
        scaleControl(asset, currentScale, (next) => {
          view.setGhostScale(next);
          updateGhostValidation();
          return true;
        }),
        actionButton("＋", () => {
          const liveScale = view.getGhostTransform()?.scale ?? asset.defaultScale;
          view.setGhostScale(liveScale + asset.scaleStep);
          updateGhostValidation();
          render();
        }),
        actionButton("100%", () => {
          view.setGhostScale(asset.defaultScale);
          updateGhostValidation();
          render();
        }),
        snapButton(),
        actionButton("วางตรงนี้", commitPlacement, "primary"),
        actionButton("ยกเลิก", () => controller.cancelPlacement())
      );
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.EDIT) {
      const item = controller.items.find((entry) => entry.id === selectedId);
      const asset = item ? getBuildableAsset(item.assetId) : null;

      if (!item || !asset) {
        actions.replaceChildren(actionButton("เสร็จ", () => controller.clearSelection(), "primary"));
        return;
      }

      actions.replaceChildren(
        actionButton("↺", () => nudgeSelected({ rotation: -Math.PI / 12 })),
        actionButton("↻", () => nudgeSelected({ rotation: Math.PI / 12 })),
        actionButton("−", () => nudgeSelected({ scale: -asset.scaleStep })),
        scaleControl(asset, item.scale, (nextScale) => {
          const next = updateSelectedTransform({ scale: nextScale });
          if (next) renderHint();
          return Boolean(next);
        }),
        actionButton("＋", () => nudgeSelected({ scale: asset.scaleStep })),
        actionButton("100%", () => {
          updateSelectedTransform({ scale: asset.defaultScale });
          render();
        }),
        snapButton(),
        actionButton("ทำซ้ำ", duplicateSelected),
        actionButton("↶ ย้อน", undo),
        actionButton("ลบ", deleteSelected, "danger"),
        actionButton("เสร็จ", () => controller.clearSelection(), "primary")
      );
      return;
    }

    const undoButton = actionButton("↶ ย้อน", undo);
    undoButton.disabled = !controller.canUndo;

    actions.replaceChildren(
      snapButton(),
      undoButton,
      actionButton("บันทึกแผนที่", () => onExport?.(controller.items)),
      actionButton("รีเซ็ตแผนที่", async () => {
        if (!confirm("ล้างสิ่งของทั้งหมดแล้วโหลดแผนที่เริ่มต้นใหม่?\n(สีที่ระบายบนพื้นจะยังอยู่)")) return;
        await onResetLayout?.();
        notice = "";
        render();
      }, "danger")
    );
  }

  function renderHint() {
    let base = "";
    if (tab === "paint") {
      base = `ลากนิ้วเดียวบนพื้นเพื่อระบาย • สองนิ้ว = ซูม/หมุนกล้อง • ${paint.strokeCount} รอย`;
    } else if (controller.context === BUILDER_CONTEXTS.PLACE) {
      base = "ลากบนพื้นเพื่อย้าย แล้วกด วางตรงนี้ • วางซ้ำได้เรื่อย ๆ จนกว่าจะกดยกเลิก";
    } else if (controller.context === BUILDER_CONTEXTS.EDIT) {
      base = "ลากเพื่อย้าย • ปรับขนาดเป็น % เทียบสัดส่วน Liora • สองนิ้ว = ซูม/หมุนกล้อง";
    } else {
      base = `แตะสิ่งของเพื่อแก้ไข • ลากพื้นว่างเพื่อเลื่อนกล้อง • ทั้งหมด ${controller.items.length} ชิ้น`;
    }
    hint.innerHTML = notice
      ? `${base} • <span class="notice">${notice}</span>`
      : base;
  }

  function render() {
    root.dataset.tab = tab;
    tabPlace.classList.toggle("active", tab === "place");
    tabPaint.classList.toggle("active", tab === "paint");

    for (const button of categoryStrip.querySelectorAll("[data-category]")) {
      button.classList.toggle("active", button.dataset.category === category);
    }
    for (const button of paintStrip.querySelectorAll("[data-paint-layer]")) {
      button.classList.toggle(
        "active",
        Number(button.dataset.paintLayer) === paintLayer
      );
    }
    for (const button of assetStrip.querySelectorAll("[data-asset-id]")) {
      button.classList.toggle("active", button.dataset.assetId === currentAssetId);
    }

    renderActions();
    renderHint();
  }

  async function commitPlacement() {
    const transform = view.getGhostTransform();
    if (!transform || !currentAssetId) return;

    const validation = controller.validatePlacement(currentAssetId, transform);
    if (!validation.ok) {
      setNotice(validationMessage(validation));
      return;
    }

    const assetId = currentAssetId;
    const item = controller.addItem({ assetId, ...transform });
    if (!item) {
      setNotice("วางตรงนี้ไม่ได้");
      return;
    }

    view.clearGhost();
    await view.spawn(item);
    notice = "";
    // Stay armed with the same asset, rotation and scale so a row of tiles is
    // tap-tap-tap. The ghost steps clear of what was just placed, so repeated
    // taps lay a line instead of stacking everything on one spot.
    const next =
      controller.resolvePlacement(assetId, { ...transform }) ?? transform;
    controller.beginPlacement(assetId, { transform: next });
  }

  function nudgeSelected({ rotation = 0, scale = 0 }) {
    const item = controller.items.find((entry) => entry.id === selectedId);
    if (!item) return;
    const asset = getBuildableAsset(item.assetId);
    const transform = {
      rotation: item.rotation + rotation,
      scale: scale
        ? THREE.MathUtils.clamp(item.scale + scale, asset.minScale, asset.maxScale)
        : item.scale,
    };
    if (!scale) {
      const next = controller.updateSelected(
        { rotation: transform.rotation },
        { recordHistory: true }
      );
      if (next) view.update(next);
    } else {
      updateSelectedTransform(transform, { recordHistory: true });
    }
    render();
  }

  function onPointerDown(event) {
    activePointers.add(event.pointerId);
    if (activePointers.size > 1) {
      dragMode = null;
      return;
    }

    const point = groundPoint(event);
    lastPanX = event.clientX;
    lastPanY = event.clientY;
    dragRecorded = false;

    if (tab === "paint") {
      if (!point) return;
      dragMode = "paint";
      paint.beginStroke({ layer: paintLayer, radius: paintRadius });
      paint.strokeTo(point.x, point.z);
      renderHint();
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.PLACE) {
      if (!point) return;
      dragMode = "ghost";
      const target = snapped({ x: point.x, z: point.z });
      view.moveGhost(target.x, target.z);
      updateGhostValidation();
      return;
    }

    raycaster.setFromCamera(ndc, camera);
    const hitId = view.pick(raycaster);
    if (hitId) {
      notice = "";
      const item = controller.selectItem(hitId);
      dragMode = "item";
      // Grab where the finger actually landed, so the object does not jump
      // its centre under the fingertip the moment it is touched.
      grabOffsetX = point && item ? item.x - point.x : 0;
      grabOffsetZ = point && item ? item.z - point.z : 0;
      return;
    }

    notice = "";
    controller.clearSelection();
    dragMode = "pan";
  }

  function onPointerMove(event) {
    if (!dragMode || activePointers.size > 1) return;

    if (dragMode === "pan") {
      cameraController.pan(event.clientX - lastPanX, event.clientY - lastPanY);
      lastPanX = event.clientX;
      lastPanY = event.clientY;
      return;
    }

    const point = groundPoint(event);
    if (!point) return;

    if (dragMode === "paint") {
      // ground-paint fills in the space since the last point and decides the
      // spacing, so a fast swipe no longer leaves a hole in the stroke.
      if (paint.strokeTo(point.x, point.z)) renderHint();
      return;
    }

    if (dragMode === "ghost") {
      const target = snapped({ x: point.x, z: point.z });
      view.moveGhost(target.x, target.z);
      updateGhostValidation();
      return;
    }

    if (dragMode === "item") {
      const item = controller.items.find((entry) => entry.id === selectedId);
      if (!item) return;
      const wanted = snapped({
        x: point.x + grabOffsetX,
        z: point.z + grabOffsetZ,
      });
      // Slide around obstacles instead of freezing on the first refusal.
      const resolved =
        controller.resolvePlacement(
          item.assetId,
          { ...item, ...wanted },
          item.id
        ) ?? null;
      if (!resolved) return;
      const next = updateSelectedTransform(
        { x: resolved.x, z: resolved.z },
        { recordHistory: !dragRecorded }
      );
      if (next) {
        dragRecorded = true;
        renderHint();
      }
    }
  }

  function onPointerEnd(event) {
    activePointers.delete(event.pointerId);
    if (dragMode === "paint") {
      paint.endStroke();
      renderHint();
    }
    if (dragMode === "item") controller.flushSave();
    dragMode = null;
  }

  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", onPointerEnd);
  surface.addEventListener("pointercancel", onPointerEnd);
  // A mouse released outside the canvas never reports back, which used to
  // leave the builder stuck mid-drag.
  addEventListener("pointerup", onPointerEnd);
  addEventListener("pointercancel", onPointerEnd);

  tabPlace.onclick = () => {
    tab = "place";
    notice = "";
    render();
  };
  tabPaint.onclick = () => {
    tab = "paint";
    notice = "";
    controller.cancelPlacement();
    controller.clearSelection();
    render();
  };

  buildCategoryStrip();
  buildAssetStrip();
  buildPaintStrip();

  return {
    render,
    setPreview(preview) {
      currentAssetId = preview?.assetId ?? null;
      notice = "";
      if (preview) {
        // Re-arming after a placement keeps the previous transform; a fresh
        // pick starts where the camera is looking, not at world origin.
        const focus = cameraController.getFocus();
        const start = preview.transform ?? { x: focus.x, z: focus.z };
        view.showGhost(preview.asset, start).then(() => {
          updateGhostValidation();
          render();
        });
      } else {
        view.clearGhost();
      }
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
        notice = "";
        paint.endStroke();
        controller.cancelPlacement();
        controller.clearSelection();
        controller.flushSave();
        view.clearGhost();
        dragMode = null;
        activePointers.clear();
      }
      render();
    },
    /** Surfaced by main.js after the layout is loaded. */
    warn(message) {
      setNotice(message);
    },
  };
}
