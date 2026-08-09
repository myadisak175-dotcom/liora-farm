import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const CONFIG = Object.freeze({
  worldSize: 42,
  grassRepeat: 8,
  pathSize: 30,
  moveSpeed: 4,
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
document.body.prepend(renderer.domElement);

setupLighting();

const textureLoader = new THREE.TextureLoader();
const grassTexture = await loadTexture(ASSETS.grass, true);
const pathTexture = await loadTexture(ASSETS.dirtPath, false);

const ground = createGround(grassTexture);
scene.add(ground);

const path = createPath(pathTexture);
scene.add(path);

const player = createPlaceholderPlayer();
scene.add(player);

const input = createInput();
const cameraController = createCameraController();

const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3();

animate();

function setupLighting() {
  scene.add(new THREE.HemisphereLight(0xfff5dd, 0x496448, 2.2));

  const sun = new THREE.DirectionalLight(0xffedc4, 2.5);
  sun.position.set(-7, 12, 7);
  scene.add(sun);
}

function loadTexture(url, repeating) {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        if (repeating) {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(CONFIG.grassRepeat, CONFIG.grassRepeat);
        }
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

function createGround(texture) {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1,
  });

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize),
    material
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function createPath(texture) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.01,
  });

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.pathSize, CONFIG.pathSize),
    material
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.021;
  return mesh;
}

function createPlaceholderPlayer() {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.7, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0xf4e5c7 })
  );
  mesh.position.set(0, 0.65, 5);
  return mesh;
}

function createInput() {
  const keys = {};
  const joystick = { x: 0, y: 0 };
  let pointer = null;

  addEventListener("keydown", (event) => {
    keys[event.key.toLowerCase()] = true;
  });
  addEventListener("keyup", (event) => {
    keys[event.key.toLowerCase()] = false;
  });

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

  addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 2) return;

      pinchStart = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
      pinchZoom = zoomDistance;
    },
    { passive: false }
  );

  addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length !== 2 || !pinchStart) return;
      event.preventDefault();

      const distance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );

      setZoom(pinchZoom * (pinchStart / distance));
    },
    { passive: false }
  );

  addEventListener("touchend", (event) => {
    if (event.touches.length < 2) pinchStart = null;
  });

  return {
    update(target, delta) {
      const offset = CONFIG.camera.baseOffset.clone().multiplyScalar(zoomDistance);
      camera.position.lerp(
        target.clone().add(offset),
        1 - Math.pow(0.002, delta)
      );
      camera.lookAt(target);
    },
  };
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.04);
  const direction = input.getDirection();

  player.position.x += direction.x * CONFIG.moveSpeed * delta;
  player.position.z += direction.z * CONFIG.moveSpeed * delta;

  player.position.x = THREE.MathUtils.clamp(player.position.x, -18, 18);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -18, 18);

  cameraTarget.set(player.position.x, 0.55, player.position.z);
  cameraController.update(cameraTarget, delta);

  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
