import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  DEFAULT_MAP_ID,
  scopeStorageKey,
} from "../systems/map-scope.js";

const LOGIC_STORAGE_KEY = "liora.world-logic.v1";
const LOGIC_VERSION = 1;
const FALLBACK_SPAWN = Object.freeze({ x: 0, z: 5 });

function sanitizeSpawn(value) {
  const x = Number(value?.x);
  const z = Number(value?.z);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function readStoredSpawn(mapId) {
  if (typeof localStorage === "undefined") return null;
  const key = scopeStorageKey(LOGIC_STORAGE_KEY, mapId, DEFAULT_MAP_ID);
  try {
    const payload = JSON.parse(localStorage.getItem(key) ?? "null");
    if (payload?.version !== LOGIC_VERSION) return null;
    return sanitizeSpawn(payload.spawn);
  } catch {
    return null;
  }
}

async function readAuthoredSpawn(mapId) {
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch(`./maps/${mapId}.json`, { cache: "no-store" });
    if (!response.ok) return null;
    const map = await response.json();
    return sanitizeSpawn(map?.logic?.spawn);
  } catch {
    return null;
  }
}

async function resolveSpawn() {
  const mapId = typeof window !== "undefined" && typeof window.__lioraMap === "string"
    ? window.__lioraMap
    : DEFAULT_MAP_ID;
  return readStoredSpawn(mapId)
    ?? await readAuthoredSpawn(mapId)
    ?? FALLBACK_SPAWN;
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

  const api = {
    root,
    model,
    mixer,
    clips: gltf.animations,
    fadeTo,
    playSpecial,
    isSpecial: () => special,
  };

  // Test-only bridge. It exists only when the URL explicitly asks for NPCs,
  // keeping the normal game surface unchanged while the sidecar test module
  // reuses the player's already-loaded model and clips.
  if (new URLSearchParams(location.search).get("npc") === "1") {
    window.__lioraNpcSource = api;
  }

  return api;
}
