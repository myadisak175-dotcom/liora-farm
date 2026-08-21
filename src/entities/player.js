import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { WORLD_LOGIC } from "../systems/world-logic.js";
import { WORLD_MARKER_KIND, WORLD_NAVIGATION } from "../systems/world-navigation.js";

async function resolveSpawn() {
  // The logic system resolves the current map through maps/index.json, so a
  // world may move to a different file path without teaching the player model
  // about registry conventions.
  await WORLD_LOGIC.importCurrentMap();

  // Portal arrivals are deliberately session-only. Consume the token once and
  // resolve the marker from this map's live logic document, so locally-authored
  // markers work before their JSON has been exported back to the repository.
  const arrival = WORLD_NAVIGATION.consumeArrival(WORLD_LOGIC.mapId);
  if (arrival) {
    const marker = WORLD_LOGIC.getNode(arrival.markerId);
    const x = Number(marker?.x);
    const z = Number(marker?.z);
    if (marker?.kind === WORLD_MARKER_KIND && Number.isFinite(x) && Number.isFinite(z)) {
      return { x, z };
    }
  }
  return WORLD_LOGIC.spawn;
}

export async function createPlayer({
  url,
  height,
  groundOffset = 0,
  renderOrder,
  animations,
}) {
  const root = new THREE.Group();
  const spawn = await resolveSpawn();
  root.position.set(spawn.x, 0, spawn.z);

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

  const api = {
    root,
    model,
    mixer,
    clips: gltf.animations,
    fadeTo,
    playSpecial,
    isSpecial: () => special,
  };

  if (new URLSearchParams(location.search).get("npc") === "1") {
    window.__lioraNpcSource = api;
  }

  return api;
}