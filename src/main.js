import * as THREE from "three";
import { CONFIG, ASSETS, ANIMATIONS } from "./config.js";
import { createInput } from "./systems/input.js";
import { createCameraController } from "./systems/camera.js";
import { setupLighting } from "./systems/lighting.js";
import { createPlayer } from "./entities/player.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8d8ec);
scene.fog = new THREE.Fog(0xa8d8ec, 24, 54);

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

setupLighting(scene, renderer, CONFIG.shadows);

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
ground.receiveShadow = true;
ground.renderOrder = CONFIG.depth.groundOrder;
scene.add(ground);

const pathTexture = await textureLoader.loadAsync(ASSETS.dirtPath);
pathTexture.colorSpace = THREE.SRGBColorSpace;

const pathMaterial = new THREE.MeshBasicMaterial({
  map: pathTexture,
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
path.position.y = CONFIG.depth.pathY;
path.renderOrder = CONFIG.depth.pathOrder;
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
const cameraController = createCameraController(camera, CONFIG.camera);
const clock = new THREE.Clock();
const target = new THREE.Vector3();

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

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);

  if (player) {
    const direction = input.get();

    if (!player.isSpecial() && direction.m > 0.05) {
      const running = direction.m > CONFIG.runThreshold;
      const speed = running ? CONFIG.runSpeed : CONFIG.walkSpeed;

      player.root.position.x += direction.x * speed * delta;
      player.root.position.z += direction.z * speed * delta;

      const targetAngle = Math.atan2(direction.x, direction.z);
      const angleDifference = Math.atan2(
        Math.sin(targetAngle - player.root.rotation.y),
        Math.cos(targetAngle - player.root.rotation.y)
      );
      player.root.rotation.y += angleDifference * Math.min(1, 10 * delta);

      player.fadeTo(
        running ? ANIMATIONS.run : ANIMATIONS.walk,
        0.15,
        true
      );
    } else if (!player.isSpecial()) {
      player.fadeTo(ANIMATIONS.idle, 0.18, true);
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
