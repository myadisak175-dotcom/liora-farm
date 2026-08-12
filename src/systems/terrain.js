import * as THREE from "three";

/**
 * Dead-flat ground. Height is always 0 — surface variety comes from
 * ground painting, not from geometry. getHeight() stays in the API so
 * movement and object placement do not need to know that.
 */
export function createTerrain({ texture, config }) {
  const getHeight = () => 0;

  const geometry = new THREE.PlaneGeometry(
    config.size,
    config.size,
    config.segments,
    config.segments
  );

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "HomeIslandTerrain";
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.renderOrder = config.renderOrder;

  return {
    mesh,
    material,
    getHeight,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
