import * as THREE from "three";
import { CONFIG, ASSETS, ANIMATIONS } from "./config.js";
import { createPlayer } from "./entities/player.js";
import { createInput } from "./systems/input.js";
import { createMovementSystem } from "./systems/movement.js";
import { createCameraController } from "./systems/camera.js";
import { createSystemRegistry } from "./systems/registry.js";
import { createPerfHud } from "./ui/perf-hud.js";

const boot = document.querySelector("#boot");
const systems = createSystemRegistry({
  onError: ({ name, error }) => console.error(`[${name}]`, error),
});

try {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe5ff);
  scene.fog = new THREE.Fog(0xbfe5ff, 52, 130);

  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    innerWidth / innerHeight,
    CONFIG.camera.near,
    CONFIG.camera.far
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.prepend(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xdff4ff, 0x71825f, 2.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1cf, 2.2);
  sun.position.set(-12, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  scene.add(sun);

  const grass = await new THREE.TextureLoader().loadAsync(ASSETS.grass);
  grass.wrapS = THREE.RepeatWrapping;
  grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(18, 18);
  grass.colorSpace = THREE.SRGBColorSpace;
  grass.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const groundGeometry = new THREE.PlaneGeometry(CONFIG.terrain.size, CONFIG.terrain.size, 1, 1);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: grass,
    color: 0xffffff,
    roughness: 0.93,
    metalness: 0,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.receiveShadow = true;
  scene.add(ground);

  const player = await createPlayer({
    url: ASSETS.player,
    height: CONFIG.playerHeight,
    groundOffset: CONFIG.playerGroundOffset,
    animations: ANIMATIONS,
  });
  scene.add(player.root);

  const input = systems.add("input", createInput());
  const movement = createMovementSystem(camera, CONFIG, () => 0, () => []);
  const cameraController = systems.add(
    "camera",
    createCameraController(camera, CONFIG.camera, renderer.domElement)
  );
  systems.add("player", player);

  const perf = createPerfHud(renderer, document.querySelector("#perf"));
  const cameraTarget = new THREE.Vector3(0, 0.7, 0);
  cameraController.update(cameraTarget, 1 / 60);

  const clock = new THREE.Clock();
  systems.start(() => {
    const delta = Math.min(0.05, clock.getDelta());
    const state = movement.update({ player, input: input.get(), delta });

    player.fadeTo(
      state.moving ? (state.running ? ANIMATIONS.run : ANIMATIONS.walk) : ANIMATIONS.idle,
      state.moving ? 0.15 : 0.18,
      state.running
        ? CONFIG.animationSpeed.run
        : state.moving
          ? CONFIG.animationSpeed.walk
          : CONFIG.animationSpeed.idle
    );
    player.mixer.update(delta);

    cameraTarget.set(player.root.position.x, player.root.position.y + 0.7, player.root.position.z);
    cameraController.update(cameraTarget, delta);

    sun.position.set(
      player.root.position.x - 12,
      player.root.position.y + 18,
      player.root.position.z + 10
    );
    sun.target.position.copy(player.root.position);
    scene.add(sun.target);

    renderer.render(scene, camera);
    perf.update(delta);
  });

  systems.listen(window, "resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
  });

  systems.listen(window, "pagehide", () => systems.dispose(), { once: true });

  boot.hidden = true;
  window.__lioraRebuild = {
    milestone: 1,
    dispose: () => systems.dispose(),
  };
} catch (error) {
  console.error(error);
  boot.textContent = `เปิด Liora ไม่สำเร็จ: ${error?.message ?? error}`;
  boot.hidden = false;
}
