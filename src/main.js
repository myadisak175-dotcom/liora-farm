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
import { createObjectShadows } from "./systems/object-shadows.js";
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
import { HORIZON_STORAGE_KEY } from "./systems/horizon-settings.js";
import { createNotifications } from "./ui/notifications.js";
import { createFarmUI } from "./ui/farm-ui.js";
import { bindPlayerActionButtons } from "./ui/player-actions.js";
import { createPerfHud, isPerfHudEnabled } from "./ui/perf-hud.js";
import { createMapScope, DEFAULT_MAP_ID } from "./systems/map-scope.js";

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

/**
 * Everything above 1.0 used to clip to the same white. Sunlit grass, the
 * beach, the far field and the sky all landed on that white, which is why the
 * outer world read as a separate flat sheet instead of the same land seen
 * further away. Tone mapping gives those values somewhere to go.
 */
const TONE_MAPPINGS = {
  none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  // Khronos PBR Neutral: rolls highlights off without the desaturation ACES
  // puts on a stylised palette. Falls back where the three build predates it.
  neutral: THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping,
};
renderer.toneMapping = TONE_MAPPINGS[CONFIG.render?.toneMapping ?? "neutral"] ?? TONE_MAPPINGS.neutral;
renderer.toneMappingExposure = Number(CONFIG.render?.exposure) || 1;

document.body.prepend(renderer.domElement);

const textureLoader = new THREE.TextureLoader();
const RESERVED_AREAS = [{ x: CONFIG.farmPlot.position.x, z: CONFIG.farmPlot.position.z, radius: CONFIG.farmPlot.reservedRadius, label: "แปลงผัก" }];

setBootState("map");
/**
 * Which world this tab is showing, resolved before anything that saves.
 *
 * Every store below takes its key through `mapScope.key()`. The default map
 * keeps its historical unscoped keys so nobody's existing island moves; see
 * map-scope.js for why that constraint is not negotiable.
 */
let mapRegistry = [];
try {
  const response = await fetch(CONFIG.builder.mapIndex, { cache: "no-store" });
  if (response.ok) {
    const index = await response.json();
    if (Array.isArray(index?.maps)) mapRegistry = index.maps;
  }
} catch (error) {
  console.warn("Map registry could not be loaded — falling back to the default map", error);
}
const mapScope = createMapScope({ entries: mapRegistry, defaultId: DEFAULT_MAP_ID });
window.__lioraMap = mapScope.id;
const MAP_CONFIG = {
  ...CONFIG,
  sculpt: { ...CONFIG.sculpt, storageKey: mapScope.key(CONFIG.sculpt.storageKey) },
  groundPaint: { ...CONFIG.groundPaint, storageKey: mapScope.key(CONFIG.groundPaint.storageKey) },
  farming: { ...CONFIG.farming, storageKey: mapScope.key(CONFIG.farming.storageKey) },
  builder: { ...CONFIG.builder, storageKey: mapScope.key(CONFIG.builder.storageKey) },
};

setBootState("world");
let world = null;
try {
  world = await createHomeIsland({
    scene,
    textureLoader,
    config: MAP_CONFIG,
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
const lighting = setupLighting(scene, renderer, CONFIG.shadows, CONFIG.lighting);
const sky = createSky(CONFIG.sky, CONFIG.distantRange);
scene.add(sky.group);
const clockButton = document.querySelector("#clock");
const dayNight = createDayNight({
  scene,
  sky,
  lighting,
  world,
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
const layoutStore = createLayoutStore({ storageKey: MAP_CONFIG.builder.storageKey });
const builderState = createBuilderState({ historyLimit: CONFIG.builder.historyLimit });
const objectShadows = createObjectShadows({
  scene,
  config: { ...CONFIG.objectShadows, enabled: CONFIG.objectShadows.enabled && QUALITY.preset.blobShadows },
  shadowBounds: CONFIG.shadows.bounds,
  getGroundHeight: world.getGroundHeight,
});
const builderView = createBuilderView({
  scene,
  loader: builderLoader,
  getGroundHeight: world.getGroundHeight,
  config: CONFIG.builder,
  playerHeight: CONFIG.playerHeight,
  prepareModel: (model, asset, context) => wind.attach(model, asset, context),
  objectShadows,
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
  // Sculpting moved the ground out from under every blob, not just the ones
  // whose item changed.
  objectShadows.invalidate();
};
const layoutRuntime = createLayoutRuntime({
  builder,
  builderView,
  layoutStore,
  world,
  defaultMapUrl: mapScope.entry.file,
  mapId: mapScope.id,
  mapName: mapScope.entry.name,
  getUI: () => builderUI,
  getHorizon: () => horizonPanel?.toMap?.(),
  onHorizon: (authored) => horizonPanel?.setAuthored?.(authored),
  onToast: toast,
  onCollidersChange: (next) => { colliders = next; },
  onTerrainSync: syncBuilderToTerrain,
});
builderUI = createBuilderUI({
  controller: builder,
  view: builderView,
  paint: world.paint,
  paintConfig: MAP_CONFIG.groundPaint,
  height: world.height,
  sculptConfig: MAP_CONFIG.sculpt,
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
  renderer,
  lighting,
  cameraController,
  container: document.querySelector("#horizon-strip"),
  surface: renderer.domElement,
  storageKey: mapScope.key(HORIZON_STORAGE_KEY),
  mapScope,
  onToast: toast,
});
createSculptControls({
  height: world.height,
  paint: world.paint,
  sculptConfig: MAP_CONFIG.sculpt,
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
  quality: QUALITY,
  build: BUILD,
});

/**
 * Everything a quality tier can change without rebuilding the WebGL context.
 *
 * `antialias` is deliberately absent: it is fixed when the context is created,
 * so switching tiers mid-session cannot turn MSAA on or off. The HUD reports
 * the tier that is actually live rather than pretending otherwise.
 */
function applyQuality(preset) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, preset.maxPixelRatio));
  renderer.setSize(innerWidth, innerHeight);

  if (lighting.sun.shadow.mapSize.width !== preset.shadowMapSize) {
    lighting.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    // The allocated depth texture is the old size; dropping it makes three
    // rebuild at the new one on the next frame.
    lighting.sun.shadow.map?.dispose();
    lighting.sun.shadow.map = null;
  }
  lighting.setShadowBounds(preset.shadowBounds);

  world.cloudShadows.setStrength(preset.cloudShadows ? CONFIG.cloudShadows.strength : 0);
  world.setQuality?.(preset);
  objectShadows.setShadowBounds(preset.shadowBounds);
  objectShadows.setOpacity(preset.blobShadows ? CONFIG.objectShadows.opacity : 0);
}
applyQuality(QUALITY.preset);
QUALITY.onChange((preset) => {
  applyQuality(preset);
  horizonPanel?.apply?.();
  toast(`คุณภาพ: ${preset.label} — ${preset.hint}`);
});

const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3(0, 0.7, 5);
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  dayNight.update(delta);
  wind.update(delta);
  world.refresh(delta);
  playerRuntime.update(delta, { active: mode === "play", cameraTarget });
  world.crops.update(delta);
  farmUI.update(delta, { active: mode === "play" });
  cameraController.update(cameraTarget, delta);
  // The blobs hand over to the real shadow map around the point it is centred
  // on, so they follow the same target the sun does.
  objectShadows.setFollowPoint(cameraTarget.x, cameraTarget.z);
  objectShadows.refresh();
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
// Which world you are in has to be visible somewhere, or a second map is a
// silent state you can only detect by recognising the scenery.
if (!mapScope.isDefault) document.title = `${mapScope.entry.name} — Liora's Farm`;
if (player) {
  setStatus(mapScope.isDefault ? "พร้อมเล่น" : `พร้อมเล่น • ${mapScope.entry.name}`, { autoHide: true });
}
else setStatus("โหลดตัวละครไม่สำเร็จ — โหมดสร้างยังใช้ได้");
animate();
