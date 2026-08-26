import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export async function createPlayer({ url, height, groundOffset = 0, animations }) {
  const root = new THREE.Group();
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
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

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map();
  for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));

  let current = null;
  function fadeTo(name, duration = 0.18, timeScale = 1) {
    const next = actions.get(name);
    if (!next) return;
    next.setEffectiveTimeScale(timeScale);
    if (current === next) return;
    current?.fadeOut(duration);
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(duration).play();
    current = next;
  }

  fadeTo(animations.idle, 0);

  return {
    root,
    model,
    mixer,
    fadeTo,
    isSpecial: () => false,
    dispose() {
      mixer.stopAllAction();
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material?.dispose?.();
      });
    },
  };
}
