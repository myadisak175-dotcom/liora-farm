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
import { createSculptControls } from "./editor/sculpt-controls.js";

window.__lioraBooted = false;
window.__lioraBootState = "starting";
window.__lioraBootError = null;
function setBootState(state) { window.__lioraBootState = state; }
function setBootError(error) { window.__lioraBootError = String(error?.message ?? error ?? "unknown error"); }

const status = document.querySelector("#status");
const pouchEl = document.querySelector("#pouch");
const pouchCount = document.querySelector("#pouch-count");
const toastEl = document.querySelector("#toast");
let statusTimer = null;
function setStatus(text, { autoHide = false } = {}) {
  status.textContent = text; status.classList.remove("hidden"); clearTimeout(statusTimer);
  if (autoHide) statusTimer = setTimeout(() => status.classList.add("hidden"), 2200);
}
let toastTimer = null;
function toast(text) {
  toastEl.textContent = text; toastEl.classList.add("on"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), 1400);
}

setBootState("renderer");
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.sky.horizonColor);
scene.fog = new THREE.Fog(CONFIG.sky.horizonColor, CONFIG.fog.near, CONFIG.fog.far);
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, CONFIG.camera.near, CONFIG.camera.far);
const renderer = new THREE.WebGLRenderer({ antialias: QUALITY.antialias });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const textureLoader = new THREE.TextureLoader();
const RESERVED_AREAS = [{ x: CONFIG.farmPlot.position.x, z: CONFIG.farmPlot.position.z, radius: CONFIG.farmPlot.reservedRadius, label: "แปลงผัก" }];

setBootState("world");
let world = null;
try {
  world = await createHomeIsland({
    scene, textureLoader, config: CONFIG, assets: ASSETS,
    anisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()),
    reservedAreas: RESERVED_AREAS,
    onCropsChange: () => refreshFarmHud(),
  });
} catch (error) {
  setBootError(error);
  console.error(error); setStatus("โหลดพื้นไม่สำเร็จ — เช็คไฟล์ใน assets/textures/"); throw error;
}
window.__liora = {
  get paint() { return world.paint; }, get layers() { return world.layers; },
  get height() { return world.height; }, get terrainField() { return world.terrainField; },
  get missingTextures() { return world.missingTextures; },
};

setBootState("systems");
const lighting = setupLighting(scene, renderer, CONFIG.shadows);
const sky = createSky(CONFIG.sky); scene.add(sky.group);
const clockButton = document.querySelector("#clock");
const dayNight = createDayNight({ scene, sky, lighting, config: CONFIG.dayNight, onLabelChange: (label) => { clockButton.textContent = label; } });
clockButton.onclick = () => dayNight.nextPreset();
const input = createInput();
const cameraController = createCameraController(camera, CONFIG.camera, renderer.domElement);
const runFx = createRunFx(scene, CONFIG.runFx);
const contactShadow = createContactShadow(scene, CONFIG.contactShadow);

const builderLoader = createBuilderAssetLoader({ gltfLoader: new GLTFLoader() });
const layoutStore = createLayoutStore({ storageKey: CONFIG.builder.storageKey });
const builderState = createBuilderState({ historyLimit: CONFIG.builder.historyLimit });
const builderView = createBuilderView({ scene, loader: builderLoader, getGroundHeight: world.getGroundHeight, config: CONFIG.builder, playerHeight: CONFIG.playerHeight });
let builderUI = null;
let colliders = [];
const builder = createBuilderController({
  state: builderState, catalog: BUILDABLE_ASSETS, layoutStore,
  worldHalfSize: CONFIG.worldLimit, reservedAreas: RESERVED_AREAS,
  getGroundHeight: world.getGroundHeight,
  gridSize: CONFIG.builder.gridSize, saveDebounceMs: CONFIG.builder.saveDebounceMs,
  onContextChange: () => builderUI?.render(),
  onSelectionChange: (item) => builderUI?.setSelection(item),
  onPreviewChange: (preview) => builderUI?.setPreview(preview),
  onLayoutChange: () => { colliders = builder.getColliders(); },
  onItemsRestored: () => { colliders = builder.getColliders(); },
});
const syncBuilderToTerrain = () => { for (const item of builder.items) builderView.update(item); };
builderUI = createBuilderUI({
  controller: builder, view: builderView, paint: world.paint, paintConfig: CONFIG.groundPaint,
  height: world.height, sculptConfig: CONFIG.sculpt, brushCursor: world.brushCursor,
  reservedAreas: RESERVED_AREAS, builderConfig: CONFIG.builder,
  camera, cameraController, surface: renderer.domElement,
  onExport: exportMap, onResetLayout: resetLayout, onTerrainChange: syncBuilderToTerrain,
});
createSculptControls({
  height: world.height, paint: world.paint, sculptConfig: CONFIG.sculpt,
  onTerrainChange: syncBuilderToTerrain, onRender: () => builderUI.render(),
});
const movement = createMovementSystem(camera, CONFIG, world.getGroundHeight, () => colliders);

setBootState("player");
let player = null;
try {
  player = await createPlayer({
    url: ASSETS.player, height: CONFIG.playerHeight, groundOffset: CONFIG.playerGroundOffset,
    renderOrder: CONFIG.depth.playerOrder, animations: ANIMATIONS,
  });
  scene.add(player.root); pouchEl.hidden = false;
} catch (error) {
  setBootError(error);
  console.error(error); setStatus("โหลดตัวละครไม่สำเร็จ — เช็ค assets/models/player/");
}

async function fetchDefaultMap() {
  const response = await fetch(CONFIG.builder.defaultMap, { cache: "no-store" });
  if (!response.ok) throw new Error(`Default map request failed: ${response.status}`);
  return response.json();
}
async function spawnAll() {
  const items = [...builder.items];
  const results = await Promise.allSettled(items.map((item) => builderView.spawn(item)));
  const failedIds = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status !== "rejected") continue;
    failedIds.push(items[index].id);
    console.error(`Builder object failed to load: ${items[index].assetId}`, result.reason);
  }
  builder.setInactiveItems(failedIds);
  colliders = builder.getColliders();
  if (failedIds.length) {
    toast(`โหลดโมเดลไม่สำเร็จ ${failedIds.length} ชิ้น — ปิดการชนชั่วคราว`);
    builderUI.warn(`มีโมเดล ${failedIds.length} ชิ้นโหลดไม่สำเร็จ จึงไม่ขวางการเดินหรือวางของ`);
  }
  builderUI.render();
}
async function loadLayout() {
  if (!layoutStore.hasSavedLayout()) {
    try {
      const map = await fetchDefaultMap();
      if (Array.isArray(map.objects)) {
        for (const object of map.objects) builder.addItem(object, { validate: false, saveLayout: false, recordHistory: false });
        builder.save({ immediate: true });
      }
      if (map.groundPaint) world.paint.importData(map.groundPaint);
      if (map.terrainHeight) {
        if (!world.height.importData(map.terrainHeight)) console.warn("Default map terrain height could not be loaded");
      }
    } catch (error) { console.warn("Default map could not be loaded", error); }
  } else builder.load();
  await spawnAll();
  const report = builder.loadReport;
  if (report?.dropped) builderUI.warn(`ข้ามสิ่งของ ${report.dropped} ชิ้นที่ไม่รู้จัก (${report.unknownAssetIds.join(", ")})`);
  if (report?.storeIssue?.kind === "version-mismatch") {
    builderUI.warn(`แผนที่เดิมคนละเวอร์ชัน — สำรองไว้ที่ ${layoutStore.backupKey}`);
    toast("แผนที่เดิมคนละเวอร์ชัน สำรองไว้แล้ว");
  }
}

async function resetLayout() {
  try {
    const map = await fetchDefaultMap();
    builderView.clear(); builder.resetTo(Array.isArray(map.objects) ? map.objects : []);
    await spawnAll(); syncBuilderToTerrain();
    toast("โหลดสิ่งของเริ่มต้นแล้ว — พื้นที่ระบายและปั้นไว้ยังอยู่");
  } catch (error) { console.warn("Default map could not be loaded", error); toast("โหลดแผนที่เริ่มต้นไม่สำเร็จ"); }
}

function exportMap(items) {
  const payload = {
    version: 1, mapId: "home-island", savedAt: new Date().toISOString(),
    objects: items.map(({ id, assetId, x, z, rotation, scale }) => ({ id, assetId, x: +x.toFixed(3), z: +z.toFixed(3), rotation: +rotation.toFixed(4), scale: +scale.toFixed(3) })),
    groundPaint: world.paint.exportData(), terrainHeight: world.height.exportData(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = "home-island.json"; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

let mode = null;
const modeButtons = document.querySelectorAll("#mode-bar [data-mode]");
function setMode(next) {
  if (next === mode) return;
  const buildMode = next === "build"; mode = next; document.body.dataset.mode = next;
  if (buildMode) builder.enable(); else builder.disable({ saveLayout: true });
  cameraController.setOrbitEnabled(!buildMode); if (!buildMode) cameraController.clearPan();
  builderUI.show(buildMode);
  for (const button of modeButtons) button.classList.toggle("active", button.dataset.mode === next);
}
for (const button of modeButtons) button.onclick = () => setMode(button.dataset.mode);
function flushPersistentState() { builder.flushSave(); world.height.flushSave(); world.paint.flushSave(); }
addEventListener("pagehide", flushPersistentState);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPersistentState(); });

const farmButton = document.querySelector('[data-action="farm"]');
let farmTarget = null;
function playAction(button, animationName, onDone) {
  if (!player) return;
  const started = player.playSpecial(animationName, () => { button.classList.remove("active"); onDone?.(); });
  if (started) button.classList.add("active");
}
function refreshFarmHud() {
  if (!world?.crops) return;
  pouchCount.textContent = String(world.crops.pouch);
  if (!farmTarget) { farmButton.textContent = "ถอนผัก"; farmButton.disabled = true; farmButton.classList.remove("ready"); return; }
  if (farmTarget.state === CROP_STATES.EMPTY) { farmButton.textContent = "ปลูกผัก"; farmButton.disabled = false; farmButton.classList.add("ready"); return; }
  if (farmTarget.state === CROP_STATES.GROWING) { farmButton.textContent = `กำลังโต ${Math.round(farmTarget.progress * 100)}%`; farmButton.disabled = true; farmButton.classList.remove("ready"); return; }
  farmButton.textContent = "เก็บเกี่ยว"; farmButton.disabled = false; farmButton.classList.add("ready");
}
farmButton.onclick = () => {
  if (!player || !world.crops || !farmTarget) return;
  const { index, state } = farmTarget;
  if (state === CROP_STATES.EMPTY) { playAction(farmButton, ANIMATIONS.pickUp, () => { if (world.crops.plant(index)) toast("ปลูกแล้ว 🌱"); }); return; }
  if (state === CROP_STATES.RIPE) playAction(farmButton, ANIMATIONS.pullRadish, () => { if (world.crops.harvest(index)) toast("ได้หัวไชเท้า +1 🥕"); });
};
for (const button of document.querySelectorAll("[data-action]")) {
  if (button.dataset.action === "farm") continue;
  button.onclick = () => playAction(button, ANIMATIONS[button.dataset.action]);
}

const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3(0, 0.7, 5);
let sinceFarmCheck = 0;
function sameTarget(a, b) { if (!a || !b) return a === b; return a.index === b.index && a.state === b.state; }
function updateFarmTarget(delta) {
  if (!player || !world.crops) return;
  sinceFarmCheck += delta; if (sinceFarmCheck < 0.2) return; sinceFarmCheck = 0;
  const next = world.crops.getTarget(player.root.position);
  const changed = !sameTarget(farmTarget, next) || next?.state === CROP_STATES.GROWING;
  farmTarget = next; if (changed) refreshFarmHud();
}
function updatePlayer(delta) {
  if (!player) return;
  const state = movement.update({ player, input: mode === "play" ? input.get() : { x: 0, z: 0, m: 0 }, delta });
  if (!player.isSpecial()) {
    player.fadeTo(
      state.moving ? (state.running ? ANIMATIONS.run : ANIMATIONS.walk) : ANIMATIONS.idle,
      state.moving ? 0.15 : 0.18, true,
      state.running ? CONFIG.animationSpeed.run : state.moving ? CONFIG.animationSpeed.walk : CONFIG.animationSpeed.idle
    );
  }
  player.mixer.update(delta);
  runFx.update(player.root.position, state.direction, state.running, delta, { moving: state.moving, depth: state.waterDepth, level: CONFIG.water.level });
  contactShadow.update(player.root.position, player.root.rotation.y, dayNight.getHour());
  cameraTarget.set(player.root.position.x, player.root.position.y + 0.7, player.root.position.z);
  lighting.update(player.root.position);
}
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  dayNight.update(delta); world.refresh(); updatePlayer(delta); world.crops.update(delta);
  if (mode === "play") updateFarmTarget(delta);
  cameraController.update(cameraTarget, delta); sky.update(camera); renderer.render(scene, camera);
}
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

setMode("play"); refreshFarmHud(); setBootState("layout"); setStatus("กำลังโหลดแผนที่…");
await loadLayout();
setBootState(player ? "ready" : "ready-degraded"); window.__lioraBooted = true;
if (player) setStatus("พร้อมเล่น", { autoHide: true });
else setStatus("โหลดตัวละครไม่สำเร็จ — โหมดสร้างยังใช้ได้");
animate();
