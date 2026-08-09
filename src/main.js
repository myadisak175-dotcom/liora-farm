import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CONFIG = Object.freeze({
  worldSize: 42,
  grassRepeat: 8,
  pathSize: 30,
  moveSpeed: 3.2,
  playerHeight: 1.7,
  worldLimit: 18,
  camera: {
    fov: 38,
    near: 0.1,
    far: 100,
    baseOffset: new THREE.Vector3(8, 10, 10),
    minZoom: 0.65,
    maxZoom: 1.55,
    zoomStep: 0.12,
  },
});

const ASSETS = Object.freeze({
  grass: "./assets/textures/grass.webp",
  dirtPath: "./assets/textures/dirt_path_refined.webp",
  player: "./assets/models/player/meadow_maiden_walk.glb",
});

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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

setupLighting();

const textureLoader = new THREE.TextureLoader();
const [grassTexture, pathTexture] = await Promise.all([
  loadTexture(ASSETS.grass, true),
  loadTexture(ASSETS.dirtPath, false),
]);

scene.add(createGround(grassTexture));
scene.add(createPath(pathTexture));

const player = new THREE.Group();
player.position.set(0, 0, 5);
scene.add(player);

let playerModel = null;
let playerMixer = null;
let walkAction = null;
let fallback = null;

await loadPlayer();

const input = createInput();
const cameraController = createCameraController();
const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3();

animate();

function setupLighting() {
  scene.add(new THREE.HemisphereLight(0xfff5dd, 0x496448, 2.2));
  const sun = new THREE.DirectionalLight(0xffedc4, 2.5);
  sun.position.set(-7, 12, 7);
  sun.castShadow = true;
  scene.add(sun);
}

function loadTexture(url, repeating) {
  return new Promise((resolve, reject) => {
    textureLoader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      if (repeating) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(CONFIG.grassRepeat, CONFIG.grassRepeat);
      }
      resolve(texture);
    }, undefined, reject);
  });
}

function createGround(texture) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function createPath(texture) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.pathSize, CONFIG.pathSize),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.01,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.021;
  return mesh;
}

async function loadPlayer() {
  const status = document.querySelector("#status");
  const loader = new GLTFLoader();

  try {
    const gltf = await loader.loadAsync(ASSETS.player);
    playerModel = gltf.scene;

    playerModel.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    const initialBox = new THREE.Box3().setFromObject(playerModel);
    const initialSize = initialBox.getSize(new THREE.Vector3());
    const scale = CONFIG.playerHeight / Math.max(initialSize.y, 0.0001);
    playerModel.scale.setScalar(scale);

    const box = new THREE.Box3().setFromObject(playerModel);
    const center = box.getCenter(new THREE.Vector3());
    playerModel.position.x -= center.x;
    playerModel.position.z -= center.z;
    playerModel.position.y -= box.min.y;

    player.add(playerModel);

    if (gltf.animations.length > 0) {
      playerMixer = new THREE.AnimationMixer(playerModel);
      walkAction = playerMixer.clipAction(gltf.animations[0]);
      walkAction.play();
      walkAction.paused = true;
    }

    status.textContent = "3D character ready ✓";
  } catch (error) {
    console.error("Player model failed to load:", error);
    fallback = createFallbackPlayer();
    player.add(fallback);
    status.textContent = "ยังไม่มี GLB — ใช้ตัวชั่วคราว";
  }
}

function createFallbackPlayer() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.7, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0xf4e5c7 })
  );
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.31, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x684637 })
  );
  head.position.y = 1.18;
  head.castShadow = true;
  group.add(head);
  return group;
}

function createInput() {
  const keys = {};
  const joystick = { x: 0, y: 0 };
  let pointer = null;

  addEventListener("keydown", (event) => { keys[event.key.toLowerCase()] = true; });
  addEventListener("keyup", (event) => { keys[event.key.toLowerCase()] = false; });

  const joy = document.querySelector("#joy");
  const stick = document.querySelector("#stick");

  function moveStick(event) {
    const rect = joy.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const max = 42;
    const length = Math.hypot(dx, dy) || 1;
    if (length > max) {
      dx *= max / length;
      dy *= max / length;
    }
    joystick.x = dx / max;
    joystick.y = dy / max;
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function endPointer(event) {
    if (event.pointerId !== pointer) return;
    pointer = null;
    joystick.x = 0;
    joystick.y = 0;
    stick.style.transform = "translate(0, 0)";
  }

  joy.addEventListener("pointerdown", (event) => {
    pointer = event.pointerId;
    joy.setPointerCapture(pointer);
    moveStick(event);
  });
  joy.addEventListener("pointermove", (event) => {
    if (event.pointerId === pointer) moveStick(event);
  });
  joy.addEventListener("pointerup", endPointer);
  joy.addEventListener("pointercancel", endPointer);

  return {
    getDirection() {
      let x = joystick.x;
      let z = joystick.y;
      if (keys.a || keys.arrowleft) x -= 1;
      if (keys.d || keys.arrowright) x += 1;
      if (keys.w || keys.arrowup) z -= 1;
      if (keys.s || keys.arrowdown) z += 1;
      const length = Math.hypot(x, z);
      if (length <= 0.05) return { x: 0, z: 0 };
      return {
        x: x / Math.max(1, length),
        z: z / Math.max(1, length),
      };
    },
  };
}

function createCameraController() {
  let zoomDistance = 1;
  let pinchStart = null;
  let pinchZoom = 1;

  function setZoom(value) {
    zoomDistance = THREE.MathUtils.clamp(
      value,
      CONFIG.camera.minZoom,
      CONFIG.camera.maxZoom
    );
  }

  document.querySelector("#zin").addEventListener("click", () => {
    setZoom(zoomDistance - CONFIG.camera.zoomStep);
  });
  document.querySelector("#zout").addEventListener("click", () => {
    setZoom(zoomDistance + CONFIG.camera.zoomStep);
  });

  addEventListener("touchstart", (event) => {
    if (event.touches.length !== 2) return;
    pinchStart = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    pinchZoom = zoomDistance;
  }, { passive: false });

  addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !pinchStart) return;
    event.preventDefault();
    const distance = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    setZoom(pinchZoom * (pinchStart / distance));
  }, { passive: false });

  addEventListener("touchend", (event) => {
    if (event.touches.length < 2) pinchStart = null;
  });

  return {
    update(target, delta) {
      const offset = CONFIG.camera.baseOffset.clone().multiplyScalar(zoomDistance);
      camera.position.lerp(target.clone().add(offset), 1 - Math.pow(0.002, delta));
      camera.lookAt(target);
    },
  };
}

function updatePlayer(direction, delta) {
  const moving = Math.abs(direction.x) + Math.abs(direction.z) > 0.001;

  if (moving) {
    player.position.x += direction.x * CONFIG.moveSpeed * delta;
    player.position.z += direction.z * CONFIG.moveSpeed * delta;

    const targetAngle = Math.atan2(direction.x, direction.z);
    const difference = Math.atan2(
      Math.sin(targetAngle - player.rotation.y),
      Math.cos(targetAngle - player.rotation.y)
    );
    player.rotation.y += difference * Math.min(1, 10 * delta);

    if (walkAction) walkAction.paused = false;
  } else if (walkAction && !walkAction.paused) {
    walkAction.reset();
    walkAction.play();
    walkAction.paused = true;
  }

  player.position.x = THREE.MathUtils.clamp(
    player.position.x,
    -CONFIG.worldLimit,
    CONFIG.worldLimit
  );
  player.position.z = THREE.MathUtils.clamp(
    player.position.z,
    -CONFIG.worldLimit,
    CONFIG.worldLimit
  );
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  const direction = input.getDirection();

  updatePlayer(direction, delta);
  if (playerMixer) playerMixer.update(delta);

  cameraTarget.set(player.position.x, 0.7, player.position.z);
  cameraController.update(cameraTarget, delta);
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
