import * as THREE from "three";

/**
 * Home Island terrain is intentionally flat. Height gameplay is represented by
 * explicit meshes (bridges/platforms/cliffs), not hidden vertex undulation.
 */
export function createTerrain({ texture = null, material = null, config }) {
  const getHeight = () => 0;

  const geometry = new THREE.PlaneGeometry(
    config.size,
    config.size,
    config.segments,
    config.segments
  );

  const ownsMaterial = !material;
  const terrainMaterial = material ?? new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geometry, terrainMaterial);
  mesh.name = "HomeIslandTerrain";
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.renderOrder = config.renderOrder;

  return {
    mesh,
    getHeight,
    dispose() {
      geometry.dispose();
      if (ownsMaterial) terrainMaterial.dispose();
    },
  };
}
