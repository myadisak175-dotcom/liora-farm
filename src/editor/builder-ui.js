import * as THREE from "three";
import { BUILDER_CONTEXTS } from "./builder-state.js";
import {
  BUILD_CATEGORIES,
  getBuildableAssets,
  getBuildableAsset,
} from "./asset-catalog.js";
import { SCULPT_TOOLS } from "../systems/terrain-height.js";

/**
 * Everything build mode shows, and every touch it handles.
 *
 * Three layout rules this file exists to enforce, because they are what makes
 * build mode usable on a phone at all:
 *
 *   1. The panel COLLAPSES. On a 375x667 screen the expanded sculpt panel used
 *      to take 66% of the display, leaving a 71 px slot to see the island
 *      through. The chevron in the tab row drops it to just the tabs, so the
 *      whole screen is the game again.
 *   2. Secondary controls live behind "เพิ่มเติม", never in the default view.
 *      Sculpt presets, strength and roughness are secondary. The tool picker,
 *      the brush size and the action row are not.
 *   3. The action row never scrolls and never hides. It is the row that
 *      commits, and a commit button past the right edge reads as "this mode is
 *      broken".
 */

const SCULPT_BUTTONS = [
  { tool: SCULPT_TOOLS.RAISE, label: "⛰️ ยก" },
  { tool: SCULPT_TOOLS.LOWER, label: "🕳️ ขุด" },
  { tool: SCULPT_TOOLS.SMOOTH, label: "〰️ เกลี่ย" },
  { tool: SCULPT_TOOLS.FLATTEN, label: "▭ ปรับระดับ" },
];

const ALL_CATEGORY = "all";
const CATEGORY_BUTTONS = [
  { id: ALL_CATEGORY, label: "ทั้งหมด" },
  { id: BUILD_CATEGORIES.NATURE, label: "🌳 ธรรมชาติ" },
  { id: BUILD_CATEGORIES.BUILDINGS, label: "🏡 อาคาร" },
  { id: BUILD_CATEGORIES.DECOR, label: "📦 ตกแต่ง" },
];

export function createBuilderUI({
  controller,
  view,
  paint,
  paintConfig,
  height,
  sculptConfig,
  brushCursor,
  reservedAreas = [],
  builderConfig,
  camera,
  cameraController,
  surface,
  onExport,
  onResetLayout,
  onTerrainChange = () => {},
}) {
  const root = document.querySelector("#build-panel");
  const categoryStrip = document.querySelector("#asset-cats");
  const assetStrip = document.querySelector("#asset-strip");
  const paintStrip = document.querySelector("#paint-strip");
  const tools = document.querySelector("#build-tools");
  const actions = document.querySelector("#build-actions");
  const hint = document.querySelector("#build-hint");
  const tabPlace = document.querySelector("#tab-place");
  const tabPaint = document.querySelector("#tab-paint");
  const tabSculpt = document.querySelector("#tab-sculpt");
  const collapseButton = document.querySelector("#build-collapse");
  const moreButton = document.querySelector("#build-more");
  const sculptStrip = document.querySelector("#sculpt-strip");
  const sculptSize = document.querySelector("#sculpt-size");
  const paintSize = document.querySelector("#paint-size");

  const ndc = new THREE.Vector2();
  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const pickRaycaster = new THREE.Raycaster();
  const activePointers = new Set();

  let active = false;
  let tab = "place";
  let category = ALL_CATEGORY;
  let collapsed = false;
  let showMore = false;

  const paintButtons = [paint.layers.base, ...paint.layers.paintable].map((layer) => ({
    layer: layer.id,
    icon: layer.icon,
    label: layer.label,
  }));

  let paintLayer = paint.layers.paintable[0]?.id ?? paint.layers.base.id;
  let paintRadius = paintConfig.defaultRadius;
  let sculptTool = SCULPT_TOOLS.RAISE;
  let sculptRadius = sculptConfig.defaultRadius;
  let snapEnabled = Boolean(builderConfig?.snapDefault);

  let dragMode = null;
  let dragRecorded = false;
  let grabOffsetX = 0;
  let grabOffsetZ = 0;
  let lastPanX = 0;
  let lastPanY = 0;
  let currentAssetId = null;
  let selectedId = null;
  let notice = "";
  let previewRequest = 0;

  // --------------------------------------------------------------- picking

  function setRayFromEvent(event) {
    const rect = surface.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pickRaycaster.setFromCamera(ndc, camera);
    rayOrigin.copy(pickRaycaster.ray.origin);
    rayDirection.copy(pickRaycaster.ray.direction);
  }

  /**
   * Ground hit for the current pointer.
   *
   * This used to be Raycaster.intersectObject(groundMesh), i.e. ~14,000
   * triangle tests on every pointermove for the 42 m @ 0.5 m plane — most of
   * the reason painting and sculpting dragged on a phone. The height field
   * already knows the answer, so ask it: about 2 µs a call, accurate to well
   * under a millimetre.
   */
  function groundPoint(event) {
    setRayFromEvent(event);
    return height.raycast(rayOrigin, rayDirection);
  }

  function isReserved(x, z) {
    return reservedAreas.some(
      (area) => Math.hypot(x - area.x, z - area.z) <= Number(area.radius ?? 0)
    );
  }

  function showBrush(point) {
    if (!brushCursor) return;
    const radius = tab === "paint" ? paintRadius : sculptRadius;
    brushCursor.show(point.x, point.z, radius, isReserved(point.x, point.z));
  }

  function hideBrush() {
    brushCursor?.hide();
  }

  function snapped(transform) {
    return controller.snapTransform(transform, snapEnabled);
  }

  // ------------------------------------------------------------ validation

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

  function updateGhostValidation() {
    const result = validateGhost();
    setNotice(validationMessage(result));
    return result;
  }

  // -------------------------------------------------------- strip builders

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

  function sizeRow({ label, min, max, step, value, onInput }) {
    const row = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute("aria-label", label);
    const readout = document.createElement("span");
    readout.className = "value";
    const show = (v) => {
      readout.textContent = `${v.toFixed(1)} ม.`;
    };
    show(value);
    input.oninput = () => {
      const next = Number(input.value);
      show(next);
      onInput(next);
    };
    row.append(text, input, readout);
    return row;
  }

  function buildPaintStrip() {
    paintStrip.replaceChildren(
      ...paintButtons.map(({ layer, icon, label }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.paintLayer = String(layer);
        button.innerHTML = `<span class="glyph">${icon}</span><span>${label}</span>`;
        button.title = label;
        button.onclick = () => {
          paintLayer = layer;
          notice = "";
          render();
        };
        return button;
      })
    );
    paintSize.replaceChildren(
      sizeRow({
        label: "หัวแปรง",
        min: paintConfig.minRadius,
        max: paintConfig.maxRadius,
        step: 0.1,
        value: paintRadius,
        onInput: (value) => {
          paintRadius = value;
          brushCursor?.resize(value);
        },
      })
    );
  }

  function buildSculptStrip() {
    sculptStrip.replaceChildren(
      ...SCULPT_BUTTONS.map(({ tool, label }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.sculptTool = tool;
        button.textContent = label;
        button.onclick = () => {
          sculptTool = tool;
          notice = "";
          render();
        };
        return button;
      })
    );
    sculptSize.replaceChildren(
      sizeRow({
        label: "แปรง",
        min: sculptConfig.minRadius,
        max: sculptConfig.maxRadius,
        step: 0.5,
        value: sculptRadius,
        onInput: (value) => {
          sculptRadius = value;
          brushCursor?.resize(value);
        },
      })
    );
  }

  // ---------------------------------------------------------------- buttons

  function actionButton(label, handler, variant = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (variant) button.className = variant;
    button.onclick = handler;
    return button;
  }

  function iconButton(label, title, handler) {
    const button = actionButton(label, handler, "icon");
    button.setAttribute("aria-label", title);
    return button;
  }

  function snapButton() {
    const button = actionButton(
      "📐",
      () => {
        snapEnabled = !snapEnabled;
        render();
      },
      "icon"
    );
    button.setAttribute("aria-label", snapEnabled ? "ปิดการเข้ากริด" : "เปิดการเข้ากริด");
    button.title = snapEnabled ? "กริด 0.5 ม." : "วางอิสระ";
    button.classList.toggle("active", snapEnabled);
    return button;
  }

  function scalePercent(asset, scale) {
    return Math.round((scale / asset.defaultScale) * 100);
  }

  function currentScaleOf(asset) {
    if (controller.context === BUILDER_CONTEXTS.PLACE) {
      return view.getGhostTransform()?.scale ?? asset.defaultScale;
    }
    const item = controller.items.find((entry) => entry.id === selectedId);
    return item?.scale ?? asset.defaultScale;
  }

  function scaleStepper(asset, currentScale, onScale) {
    const wrap = document.createElement("div");
    wrap.className = "stepper";
    const readout = document.createElement("button");
    readout.type = "button";
    readout.className = "readout";
    const setText = (scale) => {
      readout.textContent = `${scalePercent(asset, scale)}%`;
    };
    setText(currentScale);
    readout.onclick = () => {
      onScale(asset.defaultScale);
      render();
    };
    const step = (delta) => {
      const from = currentScaleOf(asset);
      const next = THREE.MathUtils.clamp(from + delta, asset.minScale, asset.maxScale);
      setText(next);
      onScale(next);
      render();
    };
    const minus = actionButton("−", () => step(-asset.scaleStep));
    const plus = actionButton("＋", () => step(asset.scaleStep));
    minus.setAttribute("aria-label", "เล็กลง");
    plus.setAttribute("aria-label", "ใหญ่ขึ้น");
    wrap.append(minus, readout, plus);
    return wrap;
  }

  // --------------------------------------------------------------- mutation

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

  async function commitPlacement() {
    if (!currentAssetId) {
      setNotice("เลือกสิ่งของก่อนวาง");
      return;
    }
    const transform = view.getGhostTransform();
    if (!transform) {
      setNotice("โมเดลยังโหลดไม่สำเร็จ — ลองเลือกสิ่งของใหม่");
      return;
    }
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
    const next = controller.resolvePlacement(assetId, { ...transform }) ?? transform;
    controller.beginPlacement(assetId, { transform: next });
  }

  // -------------------------------------------------------------- rendering

  function renderTools() {
    if (tab === "paint" || tab === "sculpt") {
      tools.replaceChildren();
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.PLACE) {
      const asset = getBuildableAsset(currentAssetId);
      if (!asset) {
        tools.replaceChildren();
        return;
      }
      tools.replaceChildren(
        iconButton("↺", "หมุนซ้าย", () => {
          view.nudgeGhost({ rotation: -Math.PI / 12 });
          updateGhostValidation();
        }),
        iconButton("↻", "หมุนขวา", () => {
          view.nudgeGhost({ rotation: Math.PI / 12 });
          updateGhostValidation();
        }),
        scaleStepper(asset, currentScaleOf(asset), (next) => {
          view.setGhostScale(next);
          updateGhostValidation();
        }),
        snapButton()
      );
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.EDIT) {
      const item = controller.items.find((entry) => entry.id === selectedId);
      const asset = item ? getBuildableAsset(item.assetId) : null;
      if (!item || !asset) {
        tools.replaceChildren();
        return;
      }
      tools.replaceChildren(
        iconButton("↺", "หมุนซ้าย", () => nudgeSelected({ rotation: -Math.PI / 12 })),
        iconButton("↻", "หมุนขวา", () => nudgeSelected({ rotation: Math.PI / 12 })),
        scaleStepper(asset, item.scale, (next) => {
          updateSelectedTransform({ scale: next }, { recordHistory: true });
        }),
        snapButton()
      );
      return;
    }

    // Idle: snap and undo are the only tools and they are icons, so they ride
    // in the action row rather than claiming a whole row of panel height.
    tools.replaceChildren();
  }

  function renderActions() {
    if (tab === "sculpt") {
      const undoButton = iconButton("↶", "ย้อนการปั้น", () => {
        if (!height.undo()) {
          setNotice("ไม่มีอะไรให้ย้อนแล้ว");
          return;
        }
        onTerrainChange();
        render();
      });
      undoButton.disabled = height.undoDepth === 0;
      actions.replaceChildren(
        undoButton,
        actionButton(
          "ปรับพื้นให้แบนหมด",
          () => {
            if (!confirm("ปรับพื้นทั้งเกาะให้แบนเท่ากันหมด?")) return;
            height.clear();
            onTerrainChange();
            render();
          },
          "danger"
        )
      );
      return;
    }

    if (tab === "paint") {
      const undoButton = iconButton("↶", "ย้อนรอยล่าสุด", () => {
        paint.undo();
        render();
      });
      actions.replaceChildren(
        undoButton,
        actionButton(
          "ล้างสีทั้งหมด",
          () => {
            if (!confirm("ล้างสีพื้นทั้งหมด? ย้อนกลับไม่ได้")) return;
            paint.clear();
            render();
          },
          "danger"
        )
      );
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.PLACE) {
      actions.replaceChildren(
        actionButton("ยกเลิก", () => controller.cancelPlacement()),
        actionButton("✓ วางตรงนี้", commitPlacement, "primary")
      );
      return;
    }

    if (controller.context === BUILDER_CONTEXTS.EDIT) {
      const item = controller.items.find((entry) => entry.id === selectedId);
      if (!item) {
        actions.replaceChildren(
          actionButton("เสร็จ", () => controller.clearSelection(), "primary")
        );
        return;
      }
      actions.replaceChildren(
        actionButton("ลบ", deleteSelected, "danger"),
        actionButton("ทำซ้ำ", duplicateSelected),
        actionButton("เสร็จ", () => controller.clearSelection(), "primary")
      );
      return;
    }

    const undoButton = iconButton("↶", "ย้อนกลับ", undo);
    undoButton.disabled = !controller.canUndo;
    actions.replaceChildren(
      snapButton(),
      undoButton,
      actionButton("บันทึก", () => onExport?.(controller.items)),
      actionButton(
        "รีเซ็ต",
        async () => {
          // Say exactly what survives. The old copy promised the ground paint
          // would stay and said nothing about the terrain — which it then
          // flattened.
          if (
            !confirm(
              "ล้างสิ่งของทั้งหมดแล้วโหลดแผนที่เริ่มต้นใหม่?\n(สีที่ระบายและพื้นที่ปั้นไว้จะยังอยู่)"
            )
          ) {
            return;
          }
          await onResetLayout?.();
          notice = "";
          render();
        },
        "danger"
      )
    );
  }

  function renderHint() {
    let base = "";
    if (tab === "sculpt") {
      const names = {
        [SCULPT_TOOLS.RAISE]: "ยกขึ้น",
        [SCULPT_TOOLS.LOWER]: "กดลง",
        [SCULPT_TOOLS.SMOOTH]: "เกลี่ย",
        [SCULPT_TOOLS.FLATTEN]: "ปรับให้เท่ากัน",
      };
      base = `ลากนิ้วเดียวเพื่อ${names[sculptTool]} • สองนิ้ว = ซูม/หมุนกล้อง`;
    } else if (tab === "paint") {
      base = `ลากนิ้วเดียวเพื่อระบาย • ${paint.strokeCount} รอย`;
    } else if (controller.context === BUILDER_CONTEXTS.PLACE) {
      base = "ลากบนพื้นเพื่อเลือกจุด แล้วกด วางตรงนี้";
    } else if (controller.context === BUILDER_CONTEXTS.EDIT) {
      base = "ลากเพื่อย้าย • ขนาดเป็น % เทียบ Liora";
    } else {
      base = `แตะสิ่งของเพื่อแก้ไข • ลากพื้นเพื่อเลื่อนกล้อง • ${controller.items.length} ชิ้น`;
    }
    hint.innerHTML = notice ? `${base} • <span class="notice">${notice}</span>` : base;
  }

  function render() {
    root.dataset.tab = tab;
    root.dataset.context = tab === "place" ? controller.context : tab;
    root.classList.toggle("collapsed", collapsed);
    root.classList.toggle("more", showMore);

    collapseButton.textContent = collapsed ? "⌃" : "⌄";
    collapseButton.setAttribute(
      "aria-label",
      collapsed ? "ขยายแผงเครื่องมือ" : "ย่อแผงเครื่องมือ"
    );
    collapseButton.setAttribute("aria-expanded", String(!collapsed));

    // "เพิ่มเติม" only has something to reveal in the sculpt tab today.
    moreButton.hidden = tab !== "sculpt" || collapsed;
    moreButton.classList.toggle("active", showMore);
    moreButton.setAttribute("aria-expanded", String(showMore));

    tabPlace.classList.toggle("active", tab === "place");
    tabPaint.classList.toggle("active", tab === "paint");
    tabSculpt.classList.toggle("active", tab === "sculpt");

    for (const button of sculptStrip.querySelectorAll("[data-sculpt-tool]")) {
      button.classList.toggle("active", button.dataset.sculptTool === sculptTool);
    }
    for (const button of categoryStrip.querySelectorAll("[data-category]")) {
      button.classList.toggle("active", button.dataset.category === category);
    }
    for (const button of paintStrip.querySelectorAll("[data-paint-layer]")) {
      button.classList.toggle("active", Number(button.dataset.paintLayer) === paintLayer);
    }
    for (const button of assetStrip.querySelectorAll("[data-asset-id]")) {
      button.classList.toggle("active", button.dataset.assetId === currentAssetId);
    }

    renderTools();
    renderActions();
    renderHint();
  }

  // --------------------------------------------------------- sculpt driving

  let sculptFrame = null;
  let sculptLast = 0;

  function startSculptLoop() {
    stopSculptLoop();
    sculptLast = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - sculptLast) / 1000);
      sculptLast = now;
      // tick() reports whether the field actually moved. When it did, placed
      // objects have to re-seat on the new ground in the same frame — that is
      // the whole point of the return value.
      if (height.tick(dt)) onTerrainChange();
      sculptFrame = requestAnimationFrame(step);
    };
    sculptFrame = requestAnimationFrame(step);
  }

  function stopSculptLoop() {
    if (sculptFrame !== null) cancelAnimationFrame(sculptFrame);
    sculptFrame = null;
  }

  function finishActiveDrag() {
    if (dragMode === "paint") {
      paint.endStroke();
      hideBrush();
      renderHint();
    }
    if (dragMode === "sculpt") {
      stopSculptLoop();
      hideBrush();
      height.endStroke();
      onTerrainChange();
      render();
    }
    if (dragMode === "item") controller.flushSave();
    dragMode = null;
  }

  // ------------------------------------------------------------------ input

  function onPointerDown(event) {
    if (!active) return;
    activePointers.add(event.pointerId);
    if (activePointers.size > 1) {
      finishActiveDrag();
      return;
    }

    const point = groundPoint(event);
    lastPanX = event.clientX;
    lastPanY = event.clientY;
    dragRecorded = false;

    if (tab === "paint") {
      if (!point) return;
      dragMode = "paint";
      showBrush(point);
      paint.beginStroke({ layer: paintLayer, radius: paintRadius });
      paint.strokeTo(point.x, point.z);
      renderHint();
      return;
    }

    if (tab === "sculpt") {
      if (!point) return;
      dragMode = "sculpt";
      showBrush(point);
      height.beginStroke({
        tool: sculptTool,
        radius: sculptRadius,
        x: point.x,
        z: point.z,
      });
      startSculptLoop();
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

    // Placed objects are real meshes, so selecting one still needs a real
    // raycast — but only here on pointerdown, never on every move.
    const hitId = view.pick(pickRaycaster);
    if (hitId) {
      notice = "";
      const item = controller.selectItem(hitId);
      dragMode = "item";
      grabOffsetX = point && item ? item.x - point.x : 0;
      grabOffsetZ = point && item ? item.z - point.z : 0;
      return;
    }

    notice = "";
    controller.clearSelection();
    dragMode = "pan";
  }

  function onPointerMove(event) {
    if (!active || !dragMode || activePointers.size > 1) return;

    if (dragMode === "pan") {
      cameraController.pan(event.clientX - lastPanX, event.clientY - lastPanY);
      lastPanX = event.clientX;
      lastPanY = event.clientY;
      return;
    }

    const point = groundPoint(event);
    if (!point) return;

    if (dragMode === "paint") {
      showBrush(point);
      if (paint.strokeTo(point.x, point.z)) renderHint();
      return;
    }

    if (dragMode === "sculpt") {
      height.moveTo(point.x, point.z);
      showBrush(point);
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
      const wanted = snapped({ x: point.x + grabOffsetX, z: point.z + grabOffsetZ });
      const resolved =
        controller.resolvePlacement(item.assetId, { ...item, ...wanted }, item.id) ?? null;
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
    if (!active) return;
    activePointers.delete(event.pointerId);
    finishActiveDrag();
  }

  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", onPointerEnd);
  surface.addEventListener("pointercancel", onPointerEnd);
  addEventListener("pointerup", onPointerEnd);
  addEventListener("pointercancel", onPointerEnd);

  function switchTab(next) {
    tab = next;
    notice = "";
    collapsed = false;
    if (next !== "sculpt") showMore = false;
    if (next === "place") {
      hideBrush();
    } else {
      controller.cancelPlacement();
      controller.clearSelection();
    }
    render();
  }

  tabPlace.onclick = () => switchTab("place");
  tabPaint.onclick = () => switchTab("paint");
  tabSculpt.onclick = () => switchTab("sculpt");

  collapseButton.onclick = () => {
    collapsed = !collapsed;
    // Collapsing mid-drag would leave a stroke open with no way to finish it.
    if (collapsed) {
      finishActiveDrag();
      hideBrush();
    }
    render();
  };

  moreButton.onclick = () => {
    showMore = !showMore;
    render();
  };

  buildCategoryStrip();
  buildAssetStrip();
  buildPaintStrip();
  buildSculptStrip();

  return {
    render,

    setPreview(preview) {
      const requestId = ++previewRequest;
      currentAssetId = preview?.assetId ?? null;
      notice = "";
      if (preview) {
        const focus = cameraController.getFocus();
        const start = preview.transform ?? { x: focus.x, z: focus.z };
        view.showGhost(preview.asset, start)
          .then(() => {
            if (requestId !== previewRequest || currentAssetId !== preview.assetId) return;
            updateGhostValidation();
            render();
          })
          .catch((error) => {
            if (requestId !== previewRequest) return;
            console.error(`Builder ghost failed to load: ${preview.asset.id}`, error);
            view.clearGhost();
            controller.cancelPlacement();
            currentAssetId = null;
            setNotice(`โหลดโมเดล ${preview.asset.label} ไม่สำเร็จ`);
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
      active = Boolean(visible);
      root.classList.toggle("on", visible);
      if (!visible) {
        notice = "";
        collapsed = false;
        paint.endStroke();
        stopSculptLoop();
        hideBrush();
        height.endStroke();
        controller.cancelPlacement();
        controller.clearSelection();
        controller.flushSave();
        view.clearGhost();
        dragMode = null;
        activePointers.clear();
      }
      render();
    },

    warn(message) {
      setNotice(message);
    },
  };
}
