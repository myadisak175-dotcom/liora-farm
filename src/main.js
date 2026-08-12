import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CONFIG, ASSETS, ANIMATIONS } from "./config.js?v=dirt3";
import { createPlayer } from "./entities/player.js";
import { createHomeIsland } from "./zones/home-island.js?v=dirt4";
import { createInput } from "./systems/input.js";
import { createMovementSystem } from "./systems/movement.js";
import { createCameraController } from "./systems/camera.js";
import { setupLighting } from "./systems/lighting.js";
import { createSky } from "./systems/sky.js";
import { createDayNight } from "./systems/day-night.js";
import { createRunFx } from "./systems/run-fx.js";
import { createContactShadow } from "./systems/contact-shadow.js";
import { BUILDABLE_ASSETS } from "./editor/asset-catalog.js?v=scale1";
import { createBuilderAssetLoader } from "./editor/asset-loader.js";
import { createBuilderState } from "./editor/builder-state.js";
import { createBuilderController } from "./editor/builder-controller.js";
import { createLayoutStore } from "./editor/layout-store.js";
import { createBuilderView } from "./editor/builder-view.js?v=scale1";
import { createBuilderUI } from "./editor/builder-ui.js?v=scale1";

const status = document.querySelector("#status");
const setStatus = (text) => {
  status.textContent = text;
};

// ---------------------------------------------------------------- renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.sky.horizonColor);
scene.fog = new THREE.Fog(CONFIG.sky.horizonColor, 30, 72);

const camera = new THREE.PerspectiveCamera(
  CONFIG.camera.fov,
  innerWidth / innerHeight,
  CONFIG.camera.near,
  CONFIG.camera.far
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

// ------------------------------------------------------------------- world
const textureLoader = new THREE.TextureLoader();

let world = null;
try {
  world = await createHomeIsland({
    scene,
    textureLoader,
    config: CONFIG,
    assets: ASSETS,
  });
} catch (error) {
  console.error(error);
  setStatus("โหลดพื้นไม่สำเร็จ — เช็คไฟล์ใน assets/textures/");
  throw error;
}

const lighting = setupLighting(scene, renderer, CONFIG.shadows);
const sky = createSky(CONFIG.sky);
scene.add(sky.group);

const dayNight = createDayNight({ scene, sky, lighting, config: CONFIG.dayNight });
const input = createInput();
const movement = createMovementSystem(camera, CONFIG, world.getGroundHeight);
const cameraController = createCameraController(
  camera,
  CONFIG.camera,
  renderer.domElement
);
const runFx = createRunFx(scene, CONFIG.runFx);
const contactShadow = createContactShadow(scene, CONFIG.contactShadow);

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
  setStatus("พร้อมเล่น");
} catch (error) {
  console.error(error);
  setStatus("โหลดตัวละครไม่สำเร็จ — เช็ค assets/models/player/");
}

// ----------------------------------------------------------------- builder
const builderLoader = createBuilderAssetLoader({ gltfLoader: new GLTFLoader() });
const layoutStore = createLayoutStore({ storageKey: CONFIG.builder.storageKey });
const builderState = createBuilderState();

const builderView = createBuilderView({
  scene,
  loader: builderLoader,
  getGroundHeight: world.getGroundHeight,
  config: CONFIG.builder,
  playerHeight: CONFIG.playerHeight,
});

let builderUI = null;

const builder = createBuilderController({
  state: builderState,
  catalog: BUILDABLE_ASSETS,
  layoutStore,
  onContextChange: () => builderUI?.render(),
  onSelectionChange: (item) => builderUI?.setSelection(item),
  onPreviewChange: (preview) => builderUI?.setPreview(preview),
});

builderUI = createBuilderUI({
  controller: builder,
  view: builderView,
  paint: world.paint,
  paintConfig: CONFIG.groundPaint,
  ground: world.ground,
  camera,
  surface: renderer.domElement,
  onExport: exportMap,
});

async function loadLayout() {
  let items = layoutStore.load();

  if (!items.length) {
    try {
      const response = await fetch(CONFIG.builder.defaultMap, { cache: "no-store" });
      if (response.ok) {
        const map = await response.json();
        if (Array.isArray(map.objects)) {
          for (const object of map.objects) builder.addItem(object);
          items = builder.items;
        }
      }
    } catch (error) {
      console.warn("Default map could not be loaded", error);
    }
  } else {
    builder.load();
  }

  const results = await Promise.allSettled(
    builder.items.map((item) => builderView.spawn(item))
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed) console.warn(`${failed} builder objects failed to load`);
  builderUI.render();
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
let mode = "play";

function setMode(next) {
  mode = next;
  document.body.dataset.mode = next;
  cameraController.setOrbitEnabled(next === "play");
  builderUI.show(next === "build");
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.classList.toggle("active", button.dataset.mode === next);
  }
}

for (const button of document.querySelectorAll("[data-mode]")) {
  button.onclick = () => setMode(button.dataset.mode);
}

// ------------------------------------------------------------ action bar
document.querySelectorAll("[data-action]").forEach((button) => {
  button.onclick = () => {
    if (!player) return;
    const key = button.dataset.action;
    if (player.playSpecial(ANIMATIONS[key], () => button.classList.remove("active"))) {
      button.classList.add("active");
    }
  };
});

// -------------------------------------------------------------------- loop
const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3(0, 0.7, 5);

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
  updatePlayer(delta);
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
animate();
await loadLayout();
