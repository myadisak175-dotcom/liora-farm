import * as THREE from "three";

function gaussian(x, z, cx, cz, radius, height) {
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  return height * Math.exp(-d2 / (2 * radius * radius));
}

function flattenMask(x, z, zones) {
  let keep = 1;
  for (const zone of zones) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    const d = Math.hypot(dx, dz);
    const inner = zone.radius;
    const outer = zone.radius + zone.feather;
    const t = THREE.MathUtils.smoothstep(d, inner, outer);
    keep *= t;
  }
  return keep;
}

export function createTerrain({ texture, config }) {
  const getHeight = (x, z) => {
    let height = 0;

    for (const hill of config.hills) {
      height += gaussian(x, z, hill.x, hill.z, hill.radius, hill.height);
    }

    // Very subtle broad undulation so the island does not read as a flat board.
    height +=
      Math.sin(x * 0.18 + z * 0.07) * config.microVariation +
      Math.sin(z * 0.14 - x * 0.05) * config.microVariation * 0.65;

    height *= flattenMask(x, z, config.flatZones);
    return Math.max(config.minHeight, height);
  };

  const geometry = new THREE.PlaneGeometry(
    config.size,
    config.size,
    config.segments,
    config.segments
  );
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const localY = position.getY(i);
    const z = -localY;
    position.setZ(i, getHeight(x, z));
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

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
    getHeight,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
