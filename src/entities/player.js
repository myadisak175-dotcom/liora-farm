import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export async function createPlayer({
  url,
  height,
  groundOffset = 0,
  renderOrder,
  animations,
}) {
  const root = new THREE.Group();
  root.position.set(0, 0, 5);

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

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) {
    actions[clip.name] = mixer.clipAction(clip);
  }

  let current = null;
  let special = false;
  let specialRun = 0;
  let specialTimer = null;

  function fadeTo(name, duration = 0.18, loop = true, timeScale = 1) {
    const next = actions[name];
    if (!next) return;

    next.setEffectiveTimeScale(timeScale);
    if (current === next) return;

    if (current) current.fadeOut(duration);
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(timeScale);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(duration).play();
    current = next;
  }

  /**
   * One-shot actions must never be able to strand the player in `special`.
   * Three normally emits `finished`, but a malformed/replaced clip or an
   * interrupted mixer can miss that event. A clip-duration watchdog provides
   * a second exit path and the run token prevents an older callback from
   * ending a newer action.
   */
  function playSpecial(name, onDone) {
    const action = actions[name];
    if (special || !action) return false;

    special = true;
    const run = ++specialRun;
    fadeTo(name, 0.15, false, 1);

    let settled = false;
    const finish = () => {
      if (settled || run !== specialRun) return;
      settled = true;
      mixer.removeEventListener("finished", finished);
      if (specialTimer) {
        clearTimeout(specialTimer);
        specialTimer = null;
      }
      special = false;
      fadeTo(animations.idle, 0.18, true, 1);
      onDone?.();
    };

    const finished = (event) => {
      if (event.action !== action) return;
      finish();
    };

    mixer.addEventListener("finished", finished);
    const duration = Math.max(0.1, Number(action.getClip()?.duration) || 0.1);
    specialTimer = setTimeout(finish, (duration + 0.6) * 1000);
    return true;
  }

  fadeTo(animations.idle, 0, true, 1);

  return {
    root,
    model,
    mixer,
    clips: gltf.animations,
    fadeTo,
    playSpecial,
    isSpecial: () => special,
  };
}
