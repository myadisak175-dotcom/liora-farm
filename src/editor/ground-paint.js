import * as THREE from "three";
import { createGroundMaterial } from "../systems/ground/ground-material.js";
import { createSplatPainter, SPLAT_LAYERS } from "../systems/ground/splat-texture.js";
import { createGroundStore } from "../systems/ground/ground-store.js";

const WORLD_SIZE = 90;
const SPLAT_RESOLUTION = 512;
const STORAGE_KEY = "liora-hybrid-ground-splat-v1";

const MODE_TO_LAYER = Object.freeze({
  grass: SPLAT_LAYERS.GRASS,
  dirt: SPLAT_LAYERS.DIRT,
  sand: SPLAT_LAYERS.SAND,
  rock: SPLAT_LAYERS.ROCK,
  erase: SPLAT_LAYERS.ERASE,
});

const LABELS = Object.freeze({
  grass: "หญ้า",
  dirt: "ดิน",
  sand: "ทราย",
  rock: "หิน",
  erase: "ลบ",
});

export function createGroundPaint({ scene, camera, renderer, orbit, mount = document.body } = {}) {
  if (!scene || !camera || !renderer || !orbit || !mount) {
    throw new Error("createGroundPaint requires scene, camera, renderer, orbit and mount");
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const activePointers = new Set();

  let mode = "off";
  let radius = 1.6;
  let strength = 0.85;
  let painting = false;
  let lastX = 0;
  let lastZ = 0;
  let painter = null;
  let store = null;
  let groundSystem = null;
  let ready = false;

  const groundMesh = scene.children.find((object) =>
    object?.isMesh && object.geometry?.type === "PlaneGeometry" && Math.abs(object.rotation.x + Math.PI / 2) < 0.01
  ) ?? null;

  const style = document.createElement("style");
  style.textContent = `
    #ground-paint-ui{position:fixed;z-index:35;left:12px;top:calc(env(safe-area-inset-top) + 12px);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f2efe4;pointer-events:none}
    #ground-paint-ui>*{pointer-events:auto}
    #ground-paint-toggle{border:1px solid #3d5648;background:#1b2b23f2;color:#f2efe4;border-radius:999px;padding:10px 14px;font-weight:800;font-size:12px;backdrop-filter:blur(8px)}
    #ground-paint-panel{display:none;margin-top:8px;width:min(92vw,350px);background:#1b2b23f2;border:1px solid #3d5648;border-radius:16px;padding:10px;box-shadow:0 8px 24px #0004;backdrop-filter:blur(10px)}
    #ground-paint-panel.open{display:block}
    #ground-paint-modes{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
    .ground-mode{border:1px solid #3d5648;background:#101a16;color:#f2efe4;border-radius:12px;padding:8px 3px;font-size:10px;font-weight:800;min-height:52px}
    .ground-mode span{display:block;font-size:20px;line-height:1.1;margin-bottom:3px}
    .ground-mode.active{border-color:#e8a33d;color:#e8a33d;background:#2a2818}
    #ground-paint-controls{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-top:9px}
    #ground-paint-size{width:100%;accent-color:#e8a33d}
    #ground-paint-radius{min-width:62px;text-align:center;font-size:10px;font-weight:800;color:#e8a33d}
    #ground-paint-bottom{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}
    #ground-paint-bottom button{border:1px solid #3d5648;background:#101a16;color:#f2efe4;border-radius:11px;padding:9px;font-weight:800}
    #ground-paint-hint{margin-top:7px;font-size:10px;opacity:.72;text-align:center}
    #ground-paint-status{margin-top:5px;font-size:9px;opacity:.62;text-align:center}
  `;
  document.head.appendChild(style);

  const ui = document.createElement("div");
  ui.id = "ground-paint-ui";
  ui.innerHTML = `
    <button id="ground-paint-toggle" type="button">🎨 พื้นเนียน</button>
    <div id="ground-paint-panel">
      <div id="ground-paint-modes">
        <button class="ground-mode" data-mode="grass" type="button"><span>🌿</span>หญ้า</button>
        <button class="ground-mode" data-mode="dirt" type="button"><span>🟫</span>ดิน</button>
        <button class="ground-mode" data-mode="sand" type="button"><span>🏖️</span>ทราย</button>
        <button class="ground-mode" data-mode="rock" type="button"><span>🪨</span>หิน</button>
        <button class="ground-mode" data-mode="erase" type="button"><span>🧹</span>ลบ</button>
      </div>
      <div id="ground-paint-controls">
        <input id="ground-paint-size" type="range" min="0.4" max="5" step="0.1" value="1.6" />
        <span id="ground-paint-radius">1.6 m</span>
      </div>
      <div id="ground-paint-bottom">
        <button id="ground-paint-undo" type="button">↶ Undo</button>
        <button id="ground-paint-close" type="button">✓ เสร็จ</button>
      </div>
      <div id="ground-paint-hint">ลากนิ้วเพื่อระบาย • ขอบจะ blend เนียนอัตโนมัติ</div>
      <div id="ground-paint-status">กำลังเตรียม Splat Paint…</div>
    </div>
  `;
  mount.appendChild(ui);

  const toggle = ui.querySelector("#ground-paint-toggle");
  const panel = ui.querySelector("#ground-paint-panel");
  const size = ui.querySelector("#ground-paint-size");
  const radiusLabel = ui.querySelector("#ground-paint-radius");
  const undo = ui.querySelector("#ground-paint-undo");
  const close = ui.querySelector("#ground-paint-close");
  const status = ui.querySelector("#ground-paint-status");
  const modeButtons = [...ui.querySelectorAll(".ground-mode")];

  function updateUI() {
    for (const button of modeButtons) {
      button.classList.toggle("active", button.dataset.mode === mode);
    }
    radiusLabel.textContent = `${radius.toFixed(1)} m`;
    toggle.textContent = mode === "off" ? "🎨 พื้นเนียน" : `🎨 ${LABELS[mode] ?? "พื้น"}`;
    if (ready && painter) status.textContent = `Splat Paint • ${painter.count()} strokes`;
  }

  function setMode(nextMode) {
    if (nextMode !== "off" && !Object.prototype.hasOwnProperty.call(MODE_TO_LAYER, nextMode)) return;
    mode = nextMode;
    painting = false;
    activePointers.clear();
    orbit.enabled = mode === "off";
    updateUI();
  }

  function screenToGround(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null;
  }

  function farEnough(x, z) {
    return Math.hypot(x - lastX, z - lastZ) >= radius / 3;
  }

  function paintAt(event, first) {
    if (!ready || !painter || mode === "off") return;
    const point = screenToGround(event);
    if (!point) return;
    if (!first && !farEnough(point.x, point.z)) return;
    painter.paint(point.x, point.z, radius, MODE_TO_LAYER[mode], strength);
    lastX = point.x;
    lastZ = point.z;
    store?.saveDraft();
    updateUI();
  }

  function onPointerDown(event) {
    activePointers.add(event.pointerId);
    if (mode === "off" || activePointers.size > 1) return;
    painting = true;
    paintAt(event, true);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onPointerMove(event) {
    if (mode === "off" || !painting) return;
    if (activePointers.size > 1) {
      painting = false;
      return;
    }
    paintAt(event, false);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onPointerUp(event) {
    activePointers.delete(event.pointerId);
    if (!painting) return;
    painting = false;
    store?.saveDraft();
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  toggle.onclick = () => panel.classList.toggle("open");
  close.onclick = () => {
    setMode("off");
    panel.classList.remove("open");
  };
  for (const button of modeButtons) {
    button.onclick = () => setMode(mode === button.dataset.mode ? "off" : button.dataset.mode);
  }
  size.oninput = () => {
    radius = THREE.MathUtils.clamp(Number(size.value) || 1.6, 0.4, 5);
    updateUI();
  };
  undo.onclick = () => {
    if (!painter?.undo()) return;
    store?.saveDraft();
    updateUI();
  };

  renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  renderer.domElement.addEventListener("pointermove", onPointerMove, true);
  renderer.domElement.addEventListener("pointerup", onPointerUp, true);
  renderer.domElement.addEventListener("pointercancel", onPointerUp, true);

  (async () => {
    try {
      if (!groundMesh) throw new Error("Hybrid ground mesh not found");
      groundSystem = await createGroundMaterial({
        textureLoader: new THREE.TextureLoader(),
        paths: {
          grass: "../assets/textures/grass.webp",
          dirt: "../assets/textures/dirt.webp",
          sand: "../assets/textures/sand.webp",
          rock: "../assets/textures/rock.webp",
          tileAtlas: null,
        },
        worldSize: WORLD_SIZE,
        gridSize: 90,
        unitsPerRepeat: 2,
        splatResolution: SPLAT_RESOLUTION,
      });

      const oldMaterial = groundMesh.material;
      groundMesh.material = groundSystem.material;
      groundMesh.material.needsUpdate = true;
      oldMaterial?.dispose?.();

      painter = createSplatPainter({
        canvas: groundSystem.splatCanvas,
        context: groundSystem.splatContext,
        commit: groundSystem.commitSplat,
        worldSize: WORLD_SIZE,
        resolution: SPLAT_RESOLUTION,
      });

      store = createGroundStore({
        painter,
        url: "../maps/home-island-ground.json",
        storageKey: STORAGE_KEY,
        worldSize: WORLD_SIZE,
        resolution: SPLAT_RESOLUTION,
      });
      await store.loadInitial();
      ready = true;
      status.textContent = `Splat Paint ready • ${painter.count()} strokes`;
      updateUI();
    } catch (error) {
      console.error("[hybrid-splat-paint]", error);
      status.textContent = `Splat Paint error • ${error?.message ?? error}`;
    }
  })();

  updateUI();

  return {
    get mode() { return mode; },
    setMode,
    save() { store?.saveDraft(); },
    clear() {
      painter?.reset();
      store?.clearDraft();
      updateUI();
    },
    dispose() {
      setMode("off");
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
      renderer.domElement.removeEventListener("pointermove", onPointerMove, true);
      renderer.domElement.removeEventListener("pointerup", onPointerUp, true);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp, true);
      ui.remove();
      style.remove();
      groundSystem?.dispose?.();
    },
  };
}
