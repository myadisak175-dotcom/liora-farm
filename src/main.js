import * as THREE from "three";
import { CONFIG, ASSETS, ANIMATIONS } from "./config.js";
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

const textureLoader = new THREE.TextureLoader();
const homeIsland = await createHomeIsland({
  scene,
  textureLoader,
  config: CONFIG,
  assets: ASSETS,
});

const lighting = setupLighting(scene, renderer, CONFIG.shadows);
const sky = createSky(CONFIG.sky);
scene.add(sky.group);

const dayNight = createDayNight({
  scene,
  sky,
  lighting,
  config: CONFIG.dayNight,
});

const input = createInput();
const movement = createMovementSystem(
  camera,
  CONFIG,
  homeIsland.getGroundHeight
);
const cameraController = createCameraController(
  camera,
  CONFIG.camera,
  renderer.domElement
);
const runFx = createRunFx(scene, CONFIG.runFx);
const contactShadow = createContactShadow(scene, CONFIG.contactShadow);

const status = document.querySelector("#status");
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
  status.textContent = "Liora ready • Home Island terrain ✓";
} catch (error) {
  console.error(error);
  status.textContent = "Player load failed";
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.onclick = () => {
    if (!player) return;
    const key = button.dataset.action;
    if (
      player.playSpecial(
        ANIMATIONS[key],
        () => button.classList.remove("active")
      )
    ) {
      button.classList.add("active");
    }
  };
});

const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3();

function updatePlayer(delta) {
  if (!player) return;

  const state = movement.update({
    player,
    input: input.get(),
    delta,
  });

  if (!player.isSpecial()) {
    player.fadeTo(
      state.moving
        ? state.running
          ? ANIMATIONS.run
          : ANIMATIONS.walk
        : ANIMATIONS.idle,
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

animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
