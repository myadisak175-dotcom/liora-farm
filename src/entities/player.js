import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export async function createPlayer({ url, height, renderOrder, animations }) {
  const root = new THREE.Group();
  root.position.set(0, 0, 5);

  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.renderOrder = renderOrder;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
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
  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);

  let current = null;
  let special = false;

  function fadeTo(name, duration = 0.18, loop = true) {
    const next = actions[name];
    if (!next || current === next) return;
    if (current) current.fadeOut(duration);
    next.reset();
    next.enabled = true;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(duration).play();
    current = next;
  }

  function playSpecial(name, onDone) {
    if (special || !actions[name]) return false;
    special = true;
    fadeTo(name, 0.15, false);

    const finished = (event) => {
      if (event.action !== actions[name]) return;
      mixer.removeEventListener("finished", finished);
      special = false;
      fadeTo(animations.idle, 0.18, true);
      onDone?.();
    };
    mixer.addEventListener("finished", finished);
    return true;
  }

  fadeTo(animations.idle, 0, true);

  return {
    root,
    mixer,
    fadeTo,
    playSpecial,
    isSpecial: () => special,
  };
}
