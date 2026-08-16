import * as THREE from "three";
import { createGroundDetailNormal } from "./ground-detail-normal.js";

export function createTerrain({ texture, config, height, anisotropy = 1 }) {
  const segments = Math.max(1, Math.round(config.size / config.spacing));
  const geometry = new THREE.PlaneGeometry(config.size, config.size, segments, segments);

  /**
   * The vertex colour here is baked ambient occlusion from the height field,
   * not a tint. three runs <color_fragment> immediately after <map_fragment>,
   * so the ground-paint splat shader writes the surface and this multiplies
   * the shape onto it — no change to that shader, and no runtime cost beyond
   * one attribute. Starts white, so an unsculpted island looks unchanged.
   */
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(
    new Float32Array(geometry.getAttribute("position").count * 3).fill(1),
    3
  ));

  const detailNormal = createGroundDetailNormal(config.detailNormal, anisotropy);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    normalMap: detailNormal.texture,
    normalScale: new THREE.Vector2(detailNormal.strength, detailNormal.strength),
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "HomeIslandTerrain";
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  // Sculpted mountains have to cast shadows onto the land below them, otherwise
  // even a 6 m peak reads as a flat painted blob under the top-down camera.
  mesh.castShadow = true;
  mesh.renderOrder = config.renderOrder;

  height.applyTo(geometry);

  return {
    mesh,
    material,
    geometry,
    segments,
    vertexCount: geometry.getAttribute("position").count,
    getHeight: (x, z) => height.sample(x, z),
    get detailNormalEnabled() { return material.normalMap === detailNormal.texture && Boolean(detailNormal.texture); },
    setDetailNormalEnabled(enabled) {
      const next = Boolean(enabled && detailNormal.texture);
      const nextMap = next ? detailNormal.texture : null;
      if (material.normalMap === nextMap) return next;
      material.normalMap = nextMap;
      material.needsUpdate = true;
      return next;
    },
    setDetailNormalStrength(value) {
      const next = THREE.MathUtils.clamp(Number(value) || 0, 0, 1.5);
      material.normalScale.set(next, next);
      return next;
    },
    refresh() {
      if (!height.isDirty) return false;
      height.applyTo(geometry);
      return true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      detailNormal.dispose();
    },
  };
}
