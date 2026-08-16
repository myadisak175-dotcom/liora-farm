import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CONFIG, QUALITY, ASSETS, ANIMATIONS, BUILD } from "./config.js";
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
import { createPlayerRuntime } from "./systems/player-runtime.js";
import { createWindSystem } from "./systems/wind/wind-system.js";
import { BUILDABLE_ASSETS } from "./editor/asset-catalog.js";
import { createBuilderAssetLoader } from "./editor/asset-loader.js";
import { createBuilderState } from "./editor/builder-state.js";
import { createBuilderController } from "./editor/builder-controller.js";
import { createLayoutStore } from "./editor/layout-store.js";
import { createLayoutRuntime } from "./editor/layout-runtime.js";
import { createBuilderView } from "./editor/builder-view.js";
import { createBuilderUI } from "./editor/builder-ui.js";
import { createSculptControls } from "./editor/sculpt-controls.js";
import { createHorizonControls } from "./editor/horizon-controls.js";
import { createNotifications } from "./ui/notifications.js";
import { createFarmUI } from "./ui/farm-ui.js";
import { bindPlayerActionButtons } from "./ui/player-actions.js";
import { createPerfHud, isPerfHudEnabled } from "./ui/perf-hud.js";

window.__lioraBuild = BUILD;
window.__lioraBooted = false;
window.__lioraBootState = "starting";
window.__lioraBootError = null;
function setBootState(state) { window.__lioraBootState = state; }
function setBootError(error) { window.__lioraBootError = String(error?.message ?? error ?? "unknown error"); }

const status = document.querySelector("#status");
const pouchEl = document.querySelector("#pouch");
const pouchCount = document.querySelector("#pouch-count");
const toastEl = document.querySelector("#toast");
const { setStatus, toast } = createNotifications({ statusElement: status, toastElement: toastEl });
let farmUI = null;

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
    scene,
    textureLoader,
    config: CONFIG,
    assets: ASSETS,
    anisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()),
    reservedAreas: RESERVED_AREAS,
    onCropsChange: () => farmUI?.refresh(),
  });
} catch (error) {
  setBootError(error);
  console.error(error);
  setStatus("โหลดพื้นไม่สำเร็จ — เช็คไฟล์ใน assets/textures/");
  throw error;
}

setBootState("systems");
const lighting = setupLighting(scene, renderer, CONFIG.shadows);
const sky = createSky(CONFIG.sky, CONFIG.distantRange);
scene.add(sky.group);
const clockButton = document.querySelector("#clock");
const dayNight = createDayNight({
  scene,
  sky,
  lighting,
  config: CONFIG.dayNight,
  onLabelChange: (label) => { clockButton.textContent = label; },
});
clockButton.onclick = () => dayNight.nextPreset();
const input = createInput();
const cameraController = createCameraController(camera, CONFIG.camera, renderer.domElement);
const runFx = createRunFx(scene, CONFIG.runFx);
const contactShadow = createContactShadow(scene, CONFIG.contactShadow);
const wind = createWindSystem({ config: CONFIG.wind ?? {}, quality: QUALITY });

window.__liora = {
  get paint() { return world.paint; },
  get layers() { return world.layers; },
  get height() { return world.height; },
  get terrainField() { return world.terrainField; },
  get missingTextures() { return world.missingTextures; },
  get wind() { return wind; },
};

const builderLoader = createBuilderAssetLoader({ gltfLoader: new GLTFLoader() });
const layoutStore = createLayoutStore({ storageKey: CONFIG.builder.storageKey });
const builderState = createBuilderState({ historyLimit: CONFIG.builder.historyLimit });
const builderView = createBuilderView({
  scene,
  loader: builderLoader,
  getGroundHeight: world.getGroundHeight,
  config: CONFIG.builder,
  playerHeight: CONFIG.playerHeight,
  prepareModel: (model, asset, context) => wind.attach(model, asset, context),
});
let builderUI = null;
let horizonPanel = null;
let colliders = [];
const builder = createBuilderController({
  state: builderState,
  catalog: BUILDABLE_ASSETS,
  layoutStore,
  worldHalfSize: CONFIG.worldLimit,
  reservedAreas: RESERVED_AREAS,
  getGroundHeight: world.getGroundHeight,
  gridSize: CONFIG.builder.gridSize,
  saveDebounceMs: CONFIG.builder.saveDebounceMs,
  onContextChange: () => builderUI?.render(),
  onSelectionChange: (item) => builderUI?.setSelection(item),
  onPreviewChange: (preview) => builderUI?.setPreview(preview),
  onLayoutChange: () => { colliders = builder.getColliders(); },
  onItemsRestored: () => { colliders = builder.getColliders(); },
});
const syncBuilderToTerrain = () => {
  for (const item of builder.items) builderView.update(item);
};
const layoutRuntime = createLayoutRuntime({
  builder,
  builderView,
  layoutStore,
  world,
  defaultMapUrl: CONFIG.builder.defaultMap,
  getUI: () => builderUI,
  onToast: toast,
  onCollidersChange: (next) => { colliders = next; },
  onTerrainSync: syncBuilderToTerrain,
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
  camera,
  cameraController,
  surface: renderer.domElement,
  onExport: layoutRuntime.exportMap,
  onResetLayout: layoutRuntime.reset,
  onTerrainChange: syncBuilderToTerrain,
});
horizonPanel = createHorizonControls({
  config: CONFIG,
  scene,
  sky,
  world,
  cameraController,
  container: document.querySelector("#horizon-strip"),
  surface: renderer.domElement,
  onToast: toast,
});
createSculptControls({
  height: world.height,
  paint: world.paint,
  sculptConfig: CONFIG.sculpt,
  onTerrainChange: syncBuilderToTerrain,
  onRender: () => builderUI.render(),
});
const movement = createMovementSystem(camera, CONFIG, world.getGroundHeight, () => colliders);

setBootState("player");
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
  pouchEl.hidden = false;
} catch (error) {
  setBootError(error);
  console.error(error);
  setStatus("โหลดตัวละครไม่สำเร็จ — เช็ค assets/models/player/");
}

const playerRuntime = createPlayerRuntime({
  player,
  movement,
  input,
  animations: ANIMATIONS,
  config: CONFIG,
  runFx,
  contactShadow,
  dayNight,
  lighting,
});
const farmButton = document.querySelector('[data-action="farm"]');
farmUI = createFarmUI({
  crops: world.crops,
  playerRuntime,
  button: farmButton,
  pouchCount,
  animations: ANIMATIONS,
  onToast: toast,
});
bindPlayerActionButtons({
  buttons: document.querySelectorAll("[data-action]"),
  animations: ANIMATIONS,
  playSpecial: playerRuntime.playSpecial,
});

let mode = null;
const modeButtons = document.querySelectorAll("#mode-bar [data-mode]");
function setMode(next) {
  if (next === mode) return;
  const buildMode = next === "build";
  mode = next;
  document.body.dataset.mode = next;
  if (buildMode) builder.enable();
  else builder.disable({ saveLayout: true });
  cameraController.setOrbitEnabled(!buildMode);
  if (!buildMode) cameraController.clearPan();
  builderUI.show(buildMode);
  for (const button of modeButtons) {
    button.classList.toggle("active", button.dataset.mode === next);
  }
}
for (const button of modeButtons) button.onclick = () => setMode(button.dataset.mode);

function flushPersistentState() {
  builder.flushSave();
  world.height.flushSave();
  world.paint.flushSave();
}
addEventListener("pagehide", flushPersistentState);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushPersistentState();
});

function reportRescuedSaves() {
  const rescued = [
    ["การระบายพื้น", world.paint],
    ["การปั้นพื้น", world.height],
    ["แปลงผัก", world.crops],
  ].filter(([, owner]) => owner.storeIssue && owner.storeIssue.kind !== "save-failed");
  if (!rescued.length) return;
  const names = rescued.map(([label]) => label).join(", ");
  toast("ข้อมูลเดิมบางส่วนอ่านไม่ได้ — สำรองไว้ให้แล้ว");
  builderUI?.warn(`อ่านข้อมูลเดิมไม่ได้: ${names} — สำรองไว้ ยังไม่ได้ลบทิ้ง`);
}

const perfHud = createPerfHud({
  renderer,
  enabled: isPerfHudEnabled(),
  getObjectCount: () => builder.items.length,
  build: BUILD,
});

const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3(0, 0.7, 5);
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  dayNight.update(delta);
  wind.update(delta);
  world.refresh();
  playerRuntime.update(delta, { active: mode === "play", cameraTarget });
  world.crops.update(delta);
  farmUI.update(delta, { active: mode === "play" });
  cameraController.update(cameraTarget, delta);
  sky.update(camera);
  renderer.render(scene, camera);
  perfHud.update(delta);
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

setMode("play");
farmUI.refresh();
setBootState("layout");
setStatus("กำลังโหลดแผนที่…");
await layoutRuntime.load();
reportRescuedSaves();
setBootState(player ? "ready" : "ready-degraded");
window.__lioraBooted = true;
if (player) setStatus("พร้อมเล่น", { autoHide: true });
else setStatus("โหลดตัวละครไม่สำเร็จ — โหมดสร้างยังใช้ได้");
animate();
