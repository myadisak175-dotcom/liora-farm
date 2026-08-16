import * as THREE from "three";
import { applyWindToMaterial } from "./wind-material.js";

function normalizedDirection(direction = {}) {
  const x = Number(direction.x) || 0;
  const y = Number(direction.z) || 0;
  const length = Math.hypot(x, y) || 1;
  return new THREE.Vector2(x / length, y / length);
}

/**
 * Ambient shader wind. This system owns only shared shader uniforms and visual
 * material preparation. It never mutates Object3D transforms, builder items,
 * collision radii, persistence, farming state or movement state.
 */
export function createWindSystem({ config = {}, quality = {} } = {}) {
  const enabled = config.enabled !== false;
  const gust = config.gust ?? {};
  const uniforms = {
    time: { value: 0 },
    direction: { value: normalizedDirection(config.direction) },
    strength: { value: enabled ? Number(config.strength ?? 0.55) : 0 },
    speed: { value: Number(config.speed ?? 0.75) },
    gustStrength: { value: Number(gust.strength ?? 0.3) },
    gustSpeed: { value: Number(gust.speed ?? 0.18) },
    gustScale: { value: Number(gust.scale ?? 0.07) },
  };

  let attachedMeshes = 0;
  let failedMeshes = 0;

  function attach(model, asset, { preview = false } = {}) {
    const profileName = asset?.worldV2 ? asset.windProfile : null;
    if (!enabled || !profileName || !model?.traverse) return false;

    let attached = false;
    model.traverse((node) => {
      if (!node?.isMesh || !node.material || !node.geometry) return;
      try {
        const source = Array.isArray(node.material) ? node.material : [node.material];
        const next = source.map((material) =>
          applyWindToMaterial({
            material,
            geometry: node.geometry,
            mesh: node,
            profileName,
            uniforms,
            quality,
            clone: !preview,
          }) ?? material
        );
        node.material = Array.isArray(node.material) ? next : next[0];
        if (!preview && next.some((material, index) => material !== source[index])) {
          node.userData.materialIsClone = true;
        }
        if (next.some((material) => material?.userData?.lioraWind)) {
          attached = true;
          attachedMeshes += 1;
        }
      } catch (error) {
        failedMeshes += 1;
        console.warn(`Wind skipped mesh "${node.name || "unnamed"}"`, error);
      }
    });
    return attached;
  }

  function update(delta) {
    if (!enabled) return;
    const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    uniforms.time.value = (uniforms.time.value + step) % 10000;
  }

  return {
    attach,
    update,
    get enabled() {
      return enabled;
    },
    get stats() {
      return { attachedMeshes, failedMeshes };
    },
    get uniforms() {
      return uniforms;
    },
  };
}
