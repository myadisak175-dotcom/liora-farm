import * as THREE from "three";

/**
 * The ground mesh. Shape comes from the height field in terrain-height.js,
 * which moves real vertices — the ground raycast, shadows and normals all
 * depend on that, so nothing here displaces in a shader.
 *
 * With a flat height field this renders exactly like the old two-triangle
 * plane, just with more vertices.
 */
export function createTerrain({ texture, config, height }) {
  const segments = Math.max(1, Math.round(config.size / config.spacing));

  const geometry = new THREE.PlaneGeometry(
    config.size,
    config.size,
    segments,
    segments
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
  mesh.castShadow = false;
  mesh.renderOrder = config.renderOrder;

  height.applyTo(geometry);

  return {
    mesh,
    material,
    geometry,
    segments,
    vertexCount: geometry.getAttribute("position").count,
    getHeight: (x, z) => height.sample(x, z),
    /** Called from the render loop; only rebuilds when something sculpted. */
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
