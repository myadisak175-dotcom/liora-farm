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
import {
  createEnvironmentLife,
  createEnvironmentLifeFallback,
} from "./systems/environment-life.js";
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
import { setStoreReporter, storageFootprint } from "./systems/local-store.js";
import { createFarmUI } from "./ui/farm-ui.js";
import { bindPlayerActionButtons } from "./ui/player-actions.js";
import { createPerfHud, isPerfHudEnabled } from "./ui/perf-hud.js";
import { createMapScope, DEFAULT_MAP_ID } from "./systems/map-scope.js";
import { createSystemRegistry } from "./systems/registry.js";
import { createFloatingIslandBackdrop } from "./systems/background/floating-island-backdrop.js";
import { createTreeLine } from "./systems/background/tree-line.js";
import { createOuterWorldHeightSampler } from "./systems/outer-world-ground.js";
import { NATURE_V2_ASSETS } from "./editor/nature-catalog-v2.js";

const APP_REVISION = "audio16";
window.__lioraBuild = BUILD;
window.__lioraRevision = APP_REVISION;
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
// Every localStorage failure now reaches the player. A full quota used to be a
// console.warn nobody on a phone would ever see, while terrain sculpting
// quietly stopped being saved.
setStoreReporter(toast);
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
const mapScope = createMapScope({
  entries: mapRegistry,
  defaultId: DEFAULT_MAP_ID,
  revision: APP_REVISION,
});
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
const sky = createSky(CONFIG.sky, CONFIG.distantRange, CONFIG.wind);
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

let floatingIslandBackdrop = null;
try {
  floatingIslandBackdrop = await createFloatingIslandBackdrop({
    url: ASSETS.floatingIslandHero,
    config: CONFIG.distantRange?.floatingIslandBackdrop,
    anisotropy: Math.min(2, renderer.capabilities.getMaxAnisotropy()),
  });
  scene.add(floatingIslandBackdrop.group);
} catch (error) {
  // The GLB is deliberately optional so code can deploy before the binary asset.
  console.warn("Floating island backdrop unavailable", error);
}

const input = createInput();
const cameraController = createCameraController(camera, CONFIG.camera, renderer.domElement);
const runFx = createRunFx(scene, CONFIG.runFx);
const contactShadow = createContactShadow(scene, CONFIG.contactShadow);
const wind = createWindSystem({ config: CONFIG.wind ?? {}, quality: QUALITY });
let environmentLife = null;

/**
 * Middle-ground trees, between the farm edge and the first mountain band.
 *
 * Built here, after `wind`, because the wind system is what patches the shared
 * materials — and after the world, because the trees have to sit on the
 * generated outer ground, whose surface is a formula rather than an authored
 * mesh (see `createOuterWorldHeightSampler`).
 *
 * Like the islands it loads async and is allowed to fail. An empty middle
 * ground is a worse-looking game, not a broken one.
 */
let outerGroundHeightAt = createOuterWorldHeightSampler(CONFIG.outerWorld, CONFIG.terrain.size);
let treeLine = null;
try {
  treeLine = await createTreeLine({
    config: CONFIG.treeLine,
    assets: NATURE_V2_ASSETS,
    heightAt: (x, z) => outerGroundHeightAt(x, z),
    anisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()),
    onModel: (model, asset) => wind.attach(model, asset),
  });
  scene.add(treeLine.group);
} catch (error) {
  console.warn("Tree line unavailable", error);
}


window.__liora = {
  get paint() { return world.paint; },
  get layers() { return world.layers; },
  get height() { return world.height; },
  get terrainField() { return world.terrainField; },
  get missingTextures() { return world.missingTextures; },
  get wind() { return wind; },
  get life() { return environmentLife?.stats ?? null; },
  get treeLine() { return treeLine?.stats ?? null; },
  get systems() { return systems.names; },
  /**
   * Tear the whole game down. Nothing calls this yet — it exists so that
   * loading a second map without a page reload is a change to main.js rather
   * than a hunt through 34 listeners.
   */
  dispose() {
    systems.dispose();
    renderer.dispose();
  },
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
  floatingIslandBackdrop,
  treeLine,
  makeGroundSampler: (outerWorld) => createOuterWorldHeightSampler(outerWorld, CONFIG.terrain.size),
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
  surfaceAt: (x, z) => world.paint.surfaceAt(x, z),
});
try {
  environmentLife = createEnvironmentLife({
    scene,
    config: CONFIG.environmentLife,
    wind,
    getGroundHeight: world.getGroundHeight,
    waterLevel: CONFIG.water.level,
    quality: QUALITY,
  });
} catch (error) {
  console.warn("Environment life unavailable", error);
  environmentLife = createEnvironmentLifeFallback(wind);
}
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
  if (rescued.length) {
    const names = rescued.map(([label]) => label).join(", ");
    toast("ข้อมูลเดิมบางส่วนอ่านไม่ได้ — สำรองไว้ให้แล้ว");
    builderUI?.warn(`อ่านข้อมูลเดิมไม่ได้: ${names} — สำรองไว้ ยังไม่ได้ลบทิ้ง`);
    return;
  }

  // Backups from *earlier* sessions never expire, by design — an autosave
  // eating one is the bug local-store.js exists to prevent. So the only thing
  // between them and a full ~5 MB phone quota is telling the player they are
  // there. Silence is what turns this into "saving just stopped working".
  const { bytes, backups } = storageFootprint();
  if (backups && bytes > 3_000_000) {
    builderUI?.warn(
      `ข้อมูลที่เก็บไว้ ${(bytes / 1e6).toFixed(1)} MB · มีไฟล์สำรองค้าง ${backups} ชุด — ใกล้เต็มโควตาเบราว์เซอร์`
    );
  }
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
  sky.setQuality?.(preset);
  wind.setQuality?.(preset);
  environmentLife.setQuality?.(preset);
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

/**
 * The frame order, as data.
 *
 * It used to be a sequence of statements inside `animate()`, which is fine to
 * read and impossible to take apart: nothing could stop the loop, and nothing
 * knew which systems existed, so a second map could only ever be a page
 * reload. The order below is the order that was there — it is load-bearing
 * (movement before camera, camera before shadows, everything before render) —
 * but it is now a list the registry walks and can also tear down.
 *
 * Systems that own listeners or GPU resources also expose `dispose()`, which
 * runs in reverse registration order.
 */
const systems = createSystemRegistry({
  onError: ({ name, phase }) => console.error(`"${name}" failed during ${phase}`),
});

systems.add("dayNight", dayNight);
systems.add("wind", wind);
systems.add("world", { update: (delta) => world.refresh(delta), dispose: () => world.dispose?.() });
systems.add("player", {
  update: (delta) => playerRuntime.update(delta, { active: mode === "play", cameraTarget }),
});
systems.add("environmentLife", {
  update: (delta) => environmentLife.update(delta, {
    position: playerRuntime.position,
    state: playerRuntime.state,
    camera,
    hour: dayNight.getHour(),
  }),
  dispose: () => environmentLife.dispose(),
});
systems.add("crops", { update: (delta) => world.crops.update(delta) });
systems.add("farmUI", { update: (delta) => farmUI.update(delta, { active: mode === "play" }) });
systems.add("camera", {
  update: (delta) => cameraController.update(cameraTarget, delta),
  dispose: () => cameraController.dispose?.(),
});
systems.add("objectShadows", {
  // The blobs hand over to the real shadow map around the point it is centred
  // on, so they follow the same target the sun does.
  update: () => {
    objectShadows.setFollowPoint(cameraTarget.x, cameraTarget.z);
    objectShadows.refresh();
  },
  dispose: () => objectShadows.dispose?.(),
});
systems.add("floatingIslands", floatingIslandBackdrop);
systems.add("treeLine", treeLine);
systems.add("sky", { update: (delta) => sky.update(camera, delta), dispose: () => sky.dispose?.() });
systems.add("input", { dispose: () => input.dispose?.() });
systems.add("builder", { dispose: () => builder.dispose?.() });
systems.add("builderUI", { dispose: () => builderUI?.dispose?.() });
systems.add("horizonPanel", { dispose: () => horizonPanel?.dispose?.() });

systems.listen(window, "resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  const delta = Math.min(clock.getDelta(), 0.04);
  systems.update(delta);
  renderer.render(scene, camera);
  perfHud.update(delta);
}

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
// The registry owns the frame now, so the loop can actually be stopped.
systems.start(animate);
