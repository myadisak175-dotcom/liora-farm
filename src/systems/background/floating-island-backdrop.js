import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * One authored GLB reused as a distant floating-island cluster.
 * Scenery only: no collision, terrain sampling, saving, or builder ownership.
 *
 * Important: the controller is returned immediately. The GLB loads in the
 * background so a large scenery asset can never hold the playable boot at the
 * `systems` stage.
 */
export async function createFloatingIslandBackdrop({ url, config = {}, anisotropy = 1 }) {
  const group = new THREE.Group();
  group.name = "FloatingIslandBackdrop";
  const items = Array.isArray(config.items) ? config.items : [];
  const islands = [];
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let disposed = false;

  const controller = {
    group,
    update() {
      const time = performance.now() * 0.001;
      for (const item of islands) {
        const t = time + item.phase;
        item.wrapper.position.y = item.baseY + Math.sin(t * item.bobSpeed) * item.bobAmplitude;
        item.wrapper.rotation.z = Math.sin(t * item.swaySpeed) * item.swayAmplitude;
        item.island.rotation.y = item.baseRotationY + Math.sin(t * item.yawSpeed) * item.yawAmplitude;
      }
    },
    dispose() {
      disposed = true;
      group.clear();
      islands.length = 0;
      for (const texture of textures) texture.dispose?.();
      for (const material of materials) material.dispose?.();
      for (const geometry of geometries) geometry.dispose?.();
      textures.clear();
      materials.clear();
      geometries.clear();
    },
  };

  if (!url || config.enabled === false || items.length === 0) return controller;

  new GLTFLoader().loadAsync(url).then((gltf) => {
    if (disposed) return;
    const source = gltf.scene ?? gltf.scenes?.[0];
    if (!source) throw new Error("Floating island model has no scene");

    source.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = true;
      if (object.geometry) geometries.add(object.geometry);
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of mats) {
        if (!material) continue;
        materials.add(material);
        material.fog = true;
        if (material.map) {
          material.map.colorSpace = THREE.SRGBColorSpace;
          material.map.anisotropy = Math.min(2, anisotropy);
          textures.add(material.map);
        }
      }
    });

    for (const [index, item] of items.entries()) {
      const wrapper = new THREE.Group();
      wrapper.name = item.role === "hero" ? "FloatingIslandHero" : `FloatingIslandSupport${index}`;
      const island = source.clone(true);
      const angle = Number(item.angle) || 0;
      const radius = Number(item.radius) || 220;
      const baseY = Number(item.y) || 64;
      const baseRotationY = Number(item.rotationY) || 0;
      island.scale.setScalar(Number(item.scale) || 12);
      island.rotation.y = baseRotationY;
      wrapper.position.set(Math.cos(angle) * radius, baseY, Math.sin(angle) * radius);
      wrapper.add(island);
      group.add(wrapper);
      islands.push({
        wrapper,
        island,
        baseY,
        baseRotationY,
        phase: Number(item.phase) || 0,
        bobAmplitude: Number(item.bobAmplitude) || 0,
        bobSpeed: Number(item.bobSpeed) || 0,
        swayAmplitude: Number(item.swayAmplitude) || 0,
        swaySpeed: Number(item.swaySpeed) || 0,
        yawAmplitude: Number(item.yawAmplitude) || 0,
        yawSpeed: Number(item.yawSpeed) || 0,
      });
    }
  }).catch((error) => {
    // Background scenery is optional. Never turn a scenery failure into a boot failure.
    group.userData.loadError = String(error?.message ?? error ?? "unknown error");
    console.warn("Floating island backdrop unavailable", error);
  });

  return controller;
}
