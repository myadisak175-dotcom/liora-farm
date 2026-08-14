import * as THREE from "three";

export function createTerrain({ texture, config, height }) {
  const segments = Math.max(1, Math.round(config.size / config.spacing));
  const geometry = new THREE.PlaneGeometry(config.size, config.size, segments, segments);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });

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
    refresh() {
      if (!height.isDirty) return false;
      height.applyTo(geometry);
      return true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
