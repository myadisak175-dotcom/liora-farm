import * as THREE from "three";
import { CONFIG, ASSETS, ANIMATIONS } from "./config.js";
import { createInput } from "./systems/input.js";
import { createCameraController } from "./systems/camera.js";
import { setupLighting } from "./systems/lighting.js";
import { createFloatingIsland } from "./systems/floating-island.js";
import { createPlayer } from "./entities/player.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.island.skyColor);
scene.fog = new THREE.Fog(CONFIG.island.skyColor, 24, 54);

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

const lighting = setupLighting(scene, renderer, CONFIG.shadows);
const island = createFloatingIsland(CONFIG.island);
scene.add(island);

const textureLoader = new THREE.TextureLoader();

const grass = await textureLoader.loadAsync(ASSETS.grass);
grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
grass.repeat.set(CONFIG.grassRepeat, CONFIG.grassRepeat);
grass.colorSpace = THREE.SRGBColorSpace;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize),
  new THREE.MeshStandardMaterial({ map: grass, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.01;
ground.receiveShadow = true;
ground.renderOrder = CONFIG.depth.groundOrder;
scene.add(ground);

const pathTexture = await textureLoader.loadAsync(ASSETS.dirtPath);
pathTexture.colorSpace = THREE.SRGBColorSpace;

const pathMaterial = new THREE.MeshStandardMaterial({
  map: pathTexture,
  roughness: 1,
  metalness: 0,
  transparent: false,
  alphaTest: CONFIG.depth.pathAlphaTest,
  depthTest: true,
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const path = new THREE.Mesh(
  new THREE.PlaneGeometry(CONFIG.pathSize, CONFIG.pathSize),
  pathMaterial
);
path.rotation.x = -Math.PI / 2;
path.position.y = CONFIG.depth.pathY + 0.01;
path.renderOrder = CONFIG.depth.pathOrder;
path.receiveShadow = true;
scene.add(path);

const status = document.querySelector("#status");
let player;

try {
  player = await createPlayer({
    url: ASSETS.player,
    height: CONFIG.playerHeight,
    renderOrder: CONFIG.depth.playerOrder,
    animations: ANIMATIONS,
  });
  scene.add(player.root);
  status.textContent = "Liora ready • 7 animations ✓";
} catch (error) {
  console.error(error);
  status.textContent = "Player load failed";
}

const input = createInput();
const cameraController = createCameraController(
  camera,
  CONFIG.camera,
  renderer.domElement
);
const clock = new THREE.Clock();
const target = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);

document.querySelectorAll("[data-action]").forEach((button) => {
  button.onclick = () => {
    if (!player) return;
    const key = button.dataset.action;
    if (
      player.playSpecial(ANIMATIONS[key], () => button.classList.remove("active"))
    ) {
      button.classList.add("active");
    }
  };
});

function getCameraRelativeDirection(direction) {
  camera.getWorldDirection(cameraForward);
  cameraForward.y = 0;
  cameraForward.normalize();

  cameraRight.crossVectors(cameraForward, worldUp).normalize();

  moveDirection.set(0, 0, 0);
  moveDirection.addScaledVector(cameraRight, direction.x);
  moveDirection.addScaledVector(cameraForward, -direction.z);

  if (moveDirection.lengthSq() > 0.0001) moveDirection.normalize();
  return moveDirection;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);

  if (player) {
    const direction = input.get();

    if (!player.isSpecial() && direction.m > 0.05) {
      const running = direction.m > CONFIG.runThreshold;
      const speed = running ? CONFIG.runSpeed : CONFIG.walkSpeed;
      const move = getCameraRelativeDirection(direction);

      player.root.position.x += move.x * speed * delta;
      player.root.position.z += move.z * speed * delta;

      const targetAngle = Math.atan2(move.x, move.z);
      const angleDifference = Math.atan2(
        Math.sin(targetAngle - player.root.rotation.y),
        Math.cos(targetAngle - player.root.rotation.y)
      );
      player.root.rotation.y += angleDifference * Math.min(1, 10 * delta);

      player.fadeTo(
        running ? ANIMATIONS.run : ANIMATIONS.walk,
        0.15,
        true,
        running ? CONFIG.animationSpeed.run : CONFIG.animationSpeed.walk
      );
    } else if (!player.isSpecial()) {
      player.fadeTo(
        ANIMATIONS.idle,
        0.18,
        true,
        CONFIG.animationSpeed.idle
      );
    }

    player.mixer.update(delta);
    player.root.position.x = THREE.MathUtils.clamp(
      player.root.position.x,
      -CONFIG.worldLimit,
      CONFIG.worldLimit
    );
    player.root.position.z = THREE.MathUtils.clamp(
      player.root.position.z,
      -CONFIG.worldLimit,
      CONFIG.worldLimit
    );

    target.set(player.root.position.x, 0.7, player.root.position.z);
    lighting.update(player.root.position);
  }

  cameraController.update(target, delta);
  renderer.render(scene, camera);
}

animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
