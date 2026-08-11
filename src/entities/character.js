import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createAnimationController } from "../animation/animation-controller.js";
import { createCharacterStateMachine } from "../animation/character-state-machine.js";

/**
 * Shared runtime character factory for Player, NPCs and creatures.
 * Meshy-specific clip names stay in the supplied `animations` map; movement,
 * AI and interaction systems only consume the semantic character API.
 */
export async function createCharacter({
  url,
  height = 1,
  groundOffset = 0,
  renderOrder = 0,
  animations = {},
  animationSpeeds = {},
  spawn = { x: 0, y: 0, z: 0 },
  role = "character",
  loader = null,
} = {}) {
  if (!url) throw new Error("createCharacter requires a model url");

  const root = new THREE.Group();
  root.userData.characterRole = role;
  root.position.set(
    Number(spawn?.x) || 0,
    Number(spawn?.y) || 0,
    Number(spawn?.z) || 0
  );

  const gltfLoader = loader ?? new GLTFLoader();
  const gltf = await gltfLoader.loadAsync(url);
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

  const state = createCharacterStateMachine({
    animation,
    animations,
    animationSpeeds,
  });

  // Characters are valid even when a model has no animation clips. This is
  // useful for simple Meshy creatures that are animated procedurally.
  if (animations.idle && animation.has(animations.idle)) {
    state.playState("idle", { fade: 0, force: true });
  }

  return {
    role,
    root,
    model,
    animation,
    state,
    mixer: animation.mixer,
    setLocomotion: state.setLocomotion,
    playAction: state.playAction,
    interact: state.interact,
    updateAnimation: state.update,
    isBusy: state.isBusy,
    getState: state.getState,
    getAction: state.getAction,
    dispose: state.dispose,
  };
}
