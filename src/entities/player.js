import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createAnimationController } from "../animation/animation-controller.js";

export async function createPlayer({
  url,
  height,
  groundOffset = 0,
  renderOrder,
  animations,
  spawn = null,
}) {
  const root = new THREE.Group();
  const isBuilder = typeof location !== "undefined" && /\/builder\//.test(location.pathname);
  const start = spawn ?? (isBuilder ? { x: -5.2, y: 0, z: -4.6 } : { x: 0, y: 0, z: 5 });
  root.position.set(
    Number(start.x) || 0,
    Number(start.y) || 0,
    Number(start.z) || 0
  );

  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.renderOrder = renderOrder;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of materials) {
      if (!material) continue;
      material.depthTest = true;
      material.depthWrite = true;
      material.needsUpdate = true;
    }
  });

  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(height / Math.max(size.y, 0.0001));

  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  model.position.y += groundOffset;
  root.add(model);

  const animation = createAnimationController({
    model,
    clips: gltf.animations,
  });

  // Keep the old Player API stable while routing the implementation through
  // AnimationController. Existing gameplay pages can migrate gradually.
  function fadeTo(name, duration = 0.18, loop = true, timeScale = 1) {
    return animation.play(name, {
      fade: duration,
      loop,
      timeScale,
    });
  }

  function playSpecial(name, onDone) {
    return animation.playOnce(name, {
      fade: 0.15,
      timeScale: 1,
      returnTo: animations.idle,
      returnFade: 0.18,
      returnTimeScale: 1,
      onDone,
    });
  }

  fadeTo(animations.idle, 0, true, 1);

  return {
    root,
    model,
    animation,
    mixer: animation.mixer,
    fadeTo,
    playSpecial,
    isSpecial: animation.isSpecial,
  };
}
