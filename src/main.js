import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CONFIG, QUALITY, ASSETS, ANIMATIONS } from "./config.js";
import { createPlayer } from "./entities/player.js";
import { createHomeIsland } from "./zones/home-island.js";
import { createInput } from "./systems/input.js";
import { createMovementSystem } from "./systems/movement.js";
import { createCameraController } from "./systems/camera.js";
import { setupLighting } from "./systems/lighting.js";
import { createSky } from "./systems/sky.js";
import { createDayNight } from "./systems/day-night.js";
import { createRunFx } from "./systems/run-fx.js";
import { createContactShadow } from "./systems/contact-shadow.js";
import { CROP_STATES } from "./systems/farming/crops.js";
import { BUILDABLE_ASSETS } from "./editor/asset-catalog.js";
import { createBuilderAssetLoader } from "./editor/asset-loader.js";
import { createBuilderState } from "./editor/builder-state.js";
import { createBuilderController } from "./editor/builder-controller.js";
import { createLayoutStore } from "./editor/layout-store.js";
import { createBuilderView } from "./editor/builder-view.js";
import { createBuilderUI } from "./editor/builder-ui.js";

window.__lioraBooted = true;

const status = document.querySelector("#status");
const pouchEl = document.querySelector("#pouch");
const pouchCount = document.querySelector("#pouch-count");
const toastEl = document.querySelector("#toast");

let statusTimer = null;
function setStatus(text, { autoHide = false } = {}) {
  status.textContent = text;
  status.classList.remove("hidden");
  clearTimeout(statusTimer);
  if (autoHide) statusTimer = setTimeout(() => status.classList.add("hidden"), 2200);
}

let toastTimer = null;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), 1400);
}

// ---------------------------------------------------------------- renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.sky.horizonColor);
scene.fog = new THREE.Fog(CONFIG.sky.horizonColor, CONFIG.fog.near, CONFIG.fog.far);

const camera = new THREE.PerspectiveCamera(
  CONFIG.camera.fov,
  innerWidth / innerHeight,
  CONFIG.camera.near,
  CONFIG.camera.far
);

const renderer = new THREE.WebGLRenderer({ antialias: QUALITY.antialias });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

// ------------------------------------------------------------------- world
const textureLoader = new THREE.TextureLoader();

// Ground that is off limits to both the builder and the sculpting brushes.
// The vegetable beds are modelled flat, so a hill under them would tear.
const RESERVED_AREAS = [
  {
    x: CONFIG.farmPlot.position.x,
    z: CONFIG.farmPlot.position.z,
    radius: CONFIG.farmPlot.reservedRadius,
    label: "แปลงผัก",
  },
];

let world = null;
try {
  world = await createHomeIsland({
    scene,
    textureLoader,
    config: CONFIG,
    assets: ASSETS,
    reservedAreas: RESERVED_AREAS,
    onCropsChange: () => refreshFarmHud(),
  });
} catch (error) {
  console.error(error);
  setStatus("โหลดพื้นไม่สำเร็จ — เช็คไฟล์ใน assets/textures/");
  throw error;
}

const lighting = setupLighting(scene, renderer, CONFIG.shadows);
const sky = createSky(CONFIG.sky);
scene.add(sky.group);

const clockButton = document.querySelector("#clock");
const dayNight = createDayNight({
  scene,
  sky,
  lighting,
  config: CONFIG.dayNight,
  onLabelChange: (label) => {
    clockButton.textContent = label;
  },
});
clockButton.onclick = () => dayNight.nextPreset();
const input = createInput();
const cameraController = createCameraController(
  camera,
  CONFIG.camera,
  renderer.domElement
);
const runFx = createRunFx(scene, CONFIG.runFx);
const contactShadow = createContactShadow(scene, CONFIG.contactShadow);

// ----------------------------------------------------------------- builder
const builderLoader = createBuilderAssetLoader({ gltfLoader: new GLTFLoader() });
const layoutStore = createLayoutStore({ storageKey: CONFIG.builder.storageKey });
const builderState = createBuilderState({ historyLimit: CONFIG.builder.historyLimit });

const builderView = createBuilderView({
  scene,
  loader: builderLoader,
  getGroundHeight: world.getGroundHeight,
  config: CONFIG.builder,
  playerHeight: CONFIG.playerHeight,
});

let builderUI = null;
// Rebuilt whenever the layout changes rather than every frame.
let colliders = [];

const builder = createBuilderController({
  state: builderState,
  catalog: BUILDABLE_ASSETS,
  layoutStore,
  // Same number the player is clamped to, so nothing can be placed in a ring
  // Liora can never walk to.
  worldHalfSize: CONFIG.worldLimit,
  reservedAreas: RESERVED_AREAS,
  gridSize: CONFIG.builder.gridSize,
  saveDebounceMs: CONFIG.builder.saveDebounceMs,
  onContextChange: () => builderUI?.render(),
  onSelectionChange: (item) => builderUI?.setSelection(item),
  onPreviewChange: (preview) => builderUI?.setPreview(preview),
  onLayoutChange: () => {
    colliders = builder.getColliders();
  },
  onItemsRestored: () => {
    colliders = builder.getColliders();
  },
});

builderUI = createBuilderUI({
  controller: builder,
  view: builderView,
  paint: world.paint,
  paintConfig: CONFIG.groundPaint,
  height: world.height,
  sculptConfig: CONFIG.sculpt,
  brushCursor: world.brushCursor,
  reservedAreas: RESERVED_AREAS,
  builderConfig: CONFIG.builder,
  ground: world.ground,
  camera,
  cameraController,
  surface: renderer.domElement,
  onExport: exportMap,
  onResetLayout: resetLayout,
  onTerrainChange: () => {
    // Objects sit on the ground, so a sculpted hill moves whatever stands on it.
    for (const item of builder.items) builderView.update(item);
  },
});

const movement = createMovementSystem(
  camera,
  CONFIG,
  world.getGroundHeight,
  () => colliders
);

// ------------------------------------------------------------------ player
let player = null;
try {
  player = await createPlayer({
    url: ASSETS.player,
    height: CONFIG.playerHeight,
    groundOffset: CONFIG.playerGroundOffset,
    renderOrder: CONFIG.depth.playerOrder,
    animations: ANIMATIONS,
  });
  scene.add(player.root);
  setStatus("พร้อมเล่น", { autoHide: true });
  pouchEl.hidden = false;
} catch (error) {
  console.error(error);
  setStatus("โหลดตัวละครไม่สำเร็จ — เช็ค assets/models/player/");
}

async function fetchDefaultMap() {
  const response = await fetch(CONFIG.builder.defaultMap, { cache: "no-store" });
  if (!response.ok) throw new Error(`Default map request failed: ${response.status}`);
  return response.json();
}

async function spawnAll() {
  const results = await Promise.allSettled(
    builder.items.map((item) => builderView.spawn(item))
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed) console.warn(`${failed} builder objects failed to load`);
  colliders = builder.getColliders();
  builderUI.render();
}

async function loadLayout() {
  if (!layoutStore.hasSavedLayout()) {
    try {
      const map = await fetchDefaultMap();
      if (Array.isArray(map.objects)) {
        for (const object of map.objects) {
          builder.addItem(object, {
            validate: false,
            saveLayout: false,
            recordHistory: false,
          });
        }
        // Saving even an empty array marks the user's intentionally empty
        // layout as initialized, so the default map will not respawn later.
        builder.save({ immediate: true });
      }
      if (map.groundPaint) {
        world.paint.importData(map.groundPaint);
      }
      if (map.terrainHeight) {
        if (!world.height.importData(map.terrainHeight)) {
          console.warn("Default map terrain height could not be loaded");
        }
      } else if (!world.height.isFlat()) {
        world.height.clear();
      }
    } catch (error) {
      console.warn("Default map could not be loaded", error);
    }
  } else {
    builder.load();
  }

  await spawnAll();

  const report = builder.loadReport;
  if (report?.dropped) {
    builderUI.warn(
      `ข้ามสิ่งของ ${report.dropped} ชิ้นที่ไม่รู้จัก (${report.unknownAssetIds.join(", ")})`
    );
  }
  if (report?.storeIssue?.kind === "version-mismatch") {
    builderUI.warn(`แผนที่เดิมคนละเวอร์ชัน — สำรองไว้ที่ ${layoutStore.backupKey}`);
    toast("แผนที่เดิมคนละเวอร์ชัน สำรองไว้แล้ว");
  }
}

/**
 * Once localStorage held a layout the repo's map was never read again, so a
 * newly committed home-island.json never showed up on a device that had
 * already played. This is the way back.
 */
async function resetLayout() {
  try {
    const map = await fetchDefaultMap();
    builderView.clear();
    builder.resetTo(Array.isArray(map.objects) ? map.objects : []);
    // Only touch the painting if the map actually carries one. Wiping hours of
    // ground paint as a side effect of resetting the object layout is not what
    // the button says it does.
    if (map.groundPaint) world.paint.importData(map.groundPaint);
    if (map.terrainHeight) {
      if (!world.height.importData(map.terrainHeight)) {
        console.warn("Default map terrain height could not be loaded");
      }
    } else if (!world.height.isFlat()) {
      world.height.clear();
    }
    await spawnAll();
    toast("โหลดแผนที่เริ่มต้นแล้ว");
  } catch (error) {
    console.warn("Default map could not be loaded", error);
    toast("โหลดแผนที่เริ่มต้นไม่สำเร็จ");
  }
}

function exportMap(items) {
  const payload = {
    version: 1,
    mapId: "home-island",
    savedAt: new Date().toISOString(),
    objects: items.map(({ id, assetId, x, z, rotation, scale }) => ({
      id,
      assetId,
      x: +x.toFixed(3),
      z: +z.toFixed(3),
      rotation: +rotation.toFixed(4),
      scale: +scale.toFixed(3),
    })),
    groundPaint: world.paint.exportData(),
    terrainHeight: world.height.exportData(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "home-island.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

// -------------------------------------------------------------------- mode
let mode = null;

// Scoped to the nav on purpose. A bare `[data-mode]` also matches
// <body data-mode="play">, so every tap anywhere on the screen re-ran
// setMode() — which re-entered build mode and threw away whatever was being
// placed. That is why the build panel could never reach "วางตรงนี้".
const modeButtons = document.querySelectorAll("#mode-bar [data-mode]");

function setMode(next) {
  if (next === mode) return;
  const buildMode = next === "build";
  mode = next;
  document.body.dataset.mode = next;

  // Build state is disabled in Play mode, not merely hidden: builder-ui stops
  // listening to the canvas entirely, so Play mode is a read-only world.
  if (buildMode) builder.enable();
  else builder.disable({ saveLayout: true });

  cameraController.setOrbitEnabled(!buildMode);
  if (!buildMode) cameraController.clearPan();
  builderUI.show(buildMode);
  for (const button of modeButtons) {
    button.classList.toggle("active", button.dataset.mode === next);
  }
}

for (const button of modeButtons) {
  button.onclick = () => setMode(button.dataset.mode);
}

addEventListener("pagehide", () => {
  builder.flushSave();
  world.height.flushSave();
});

// ------------------------------------------------------------ action bar
const farmButton = document.querySelector('[data-action="farm"]');
let farmTarget = null;

function playAction(button, animationName, onDone) {
  if (!player) return;
  const started = player.playSpecial(animationName, () => {
    button.classList.remove("active");
    onDone?.();
  });
  if (started) button.classList.add("active");
}

/**
 * The action buttons used to fire an animation and nothing else. This one is
 * bound to whatever plot cell Liora is standing next to: plant it, wait for
 * it, pull it.
 */
function refreshFarmHud() {
  if (!world?.crops) return;
  pouchCount.textContent = String(world.crops.pouch);

  if (!farmTarget) {
    farmButton.textContent = "ถอนผัก";
    farmButton.disabled = true;
    farmButton.classList.remove("ready");
    return;
  }

  if (farmTarget.state === CROP_STATES.EMPTY) {
    farmButton.textContent = "ปลูกผัก";
    farmButton.disabled = false;
    farmButton.classList.add("ready");
    return;
  }

  if (farmTarget.state === CROP_STATES.GROWING) {
    farmButton.textContent = `กำลังโต ${Math.round(farmTarget.progress * 100)}%`;
    farmButton.disabled = true;
    farmButton.classList.remove("ready");
    return;
  }

  farmButton.textContent = "เก็บเกี่ยว";
  farmButton.disabled = false;
  farmButton.classList.add("ready");
}

farmButton.onclick = () => {
  if (!player || !world.crops || !farmTarget) return;
  const { index, state } = farmTarget;

  if (state === CROP_STATES.EMPTY) {
    playAction(farmButton, ANIMATIONS.pickUp, () => {
      if (world.crops.plant(index)) toast("ปลูกแล้ว 🌱");
    });
    return;
  }

  if (state === CROP_STATES.RIPE) {
    playAction(farmButton, ANIMATIONS.pullRadish, () => {
      if (world.crops.harvest(index)) toast("ได้หัวไชเท้า +1 🥕");
    });
  }
};

for (const button of document.querySelectorAll("[data-action]")) {
  if (button.dataset.action === "farm") continue;
  button.onclick = () => playAction(button, ANIMATIONS[button.dataset.action]);
}

// -------------------------------------------------------------------- loop
const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3(0, 0.7, 5);
let sinceFarmCheck = 0;

function sameTarget(a, b) {
  if (!a || !b) return a === b;
  return a.index === b.index && a.state === b.state;
}

function updateFarmTarget(delta) {
  if (!player || !world.crops) return;
  sinceFarmCheck += delta;
  if (sinceFarmCheck < 0.2) return;
  sinceFarmCheck = 0;

  const next = world.crops.getTarget(player.root.position);
  const changed =
    !sameTarget(farmTarget, next) ||
    (next?.state === CROP_STATES.GROWING);
  farmTarget = next;
  if (changed) refreshFarmHud();
}

function updatePlayer(delta) {
  if (!player) return;

  const state = movement.update({
    player,
    input: mode === "play" ? input.get() : { x: 0, z: 0, m: 0 },
    delta,
  });

  if (!player.isSpecial()) {
    player.fadeTo(
      state.moving ? (state.running ? ANIMATIONS.run : ANIMATIONS.walk) : ANIMATIONS.idle,
      state.moving ? 0.15 : 0.18,
      true,
      state.running
        ? CONFIG.animationSpeed.run
        : state.moving
          ? CONFIG.animationSpeed.walk
          : CONFIG.animationSpeed.idle
    );
  }

  player.mixer.update(delta);
  runFx.update(player.root.position, state.direction, state.running, delta);
  contactShadow.update(
    player.root.position,
    player.root.rotation.y,
    dayNight.getHour()
  );

  cameraTarget.set(
    player.root.position.x,
    player.root.position.y + 0.7,
    player.root.position.z
  );
  lighting.update(player.root.position);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);

  dayNight.update(delta);
  // Rebuilds the ground mesh only on the frames where something was sculpted.
  world.refresh();
  updatePlayer(delta);
  world.crops.update(delta);
  if (mode === "play") updateFarmTarget(delta);
  cameraController.update(cameraTarget, delta);
  sky.update(camera);
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

setMode("play");
refreshFarmHud();
animate();
await loadLayout();
