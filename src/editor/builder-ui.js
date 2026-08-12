import * as THREE from "three";
import { BUILDER_CONTEXTS } from "./builder-state.js";
import { getBuildableAssets, getBuildableAsset } from "./asset-catalog.js?v=scale1";
import { PAINT_LAYERS } from "../systems/ground-paint.js?v=builderfix1";

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
  let notice = "";

  function groundPoint(event) {
    const rect = surface.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(ground, false)[0]?.point ?? null;
  }

  function validationMessage(result) {
    if (result?.ok) return "";
    switch (result?.code) {
      case "edge":
        return "วางไม่ได้ — สิ่งของจะล้นขอบเกาะ";
      case "collision":
        return "วางไม่ได้ — ชนกับสิ่งของชิ้นอื่น";
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

  function buildAssetStrip() {
    assetStrip.replaceChildren(
      ...getBuildableAssets().map((asset) => {
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

  function updateSelectedTransform(transform) {
    const item = controller.items.find((entry) => entry.id === selectedId);
    if (!item) return null;
    const candidate = { ...item, ...transform };
    const result = controller.validatePlacement(item.assetId, candidate, item.id);
    if (!result.ok) {
      setNotice(validationMessage(result));
      return null;
    }
    const next = controller.updateSelected(transform);
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
        actionButton("ทำซ้ำ", duplicateSelected),
        actionButton("ลบ", deleteSelected, "danger"),
        actionButton("เสร็จ", () => controller.clearSelection(), "primary")
      );
      return;
    }

    actions.replaceChildren(
      actionButton("บันทึกแผนที่", () => onExport?.(controller.items))
    );
  }

  function renderHint() {
    let base = "";
    if (tab === "paint") {
      base = `ลากนิ้วเดียวบนพื้นเพื่อระบาย • ${paint.strokeCount} รอย`;
    } else if (controller.context === BUILDER_CONTEXTS.PLACE) {
      base = "ขนาด 100% = สัดส่วนแนะนำเทียบ Liora • ลากเพื่อย้าย แล้วกด วางตรงนี้";
    } else if (controller.context === BUILDER_CONTEXTS.EDIT) {
      base = "ปรับขนาดเป็น % เทียบสัดส่วน Liora • ลากเพื่อย้าย • สองนิ้วซูมกล้อง";
    } else {
      base = `แตะสิ่งของเพื่อแก้ไข • ทั้งหมด ${controller.items.length} ชิ้น`;
    }
    hint.textContent = notice ? `${base} • ${notice}` : base;
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
    render();
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
      const next = controller.updateSelected({ rotation: transform.rotation });
      if (next) view.update(next);
    } else {
      updateSelectedTransform(transform);
    }
    render();
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
      updateGhostValidation();
      return;
    }

    raycaster.setFromCamera(ndc, camera);
    const hitId = view.pick(raycaster);
    if (hitId) {
      notice = "";
      controller.selectItem(hitId);
      dragging = true;
      return;
    }
    notice = "";
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
      updateGhostValidation();
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.EDIT) {
      const next = updateSelectedTransform({ x: point.x, z: point.z });
      if (next) renderHint();
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

  buildAssetStrip();
  buildPaintStrip();

  return {
    render,
    setPreview(preview) {
      currentAssetId = preview?.assetId ?? null;
      notice = "";
      if (preview) {
        view.showGhost(preview.asset).then(() => {
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
