import * as THREE from "three";

export function createFloatingIsland(config) {
  const group = new THREE.Group();
  group.name = "floating-island";

  const half = config.size / 2;
  const topY = 0;
  const bottomY = -config.cliffDepth;
  const inset = config.bottomInset;

  const sideMaterial = new THREE.MeshStandardMaterial({
    color: config.cliffColor,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });

  const bottomMaterial = new THREE.MeshStandardMaterial({
    color: config.bottomColor,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });

  const ringTop = [
    new THREE.Vector3(-half, topY, -half),
    new THREE.Vector3(half, topY, -half),
    new THREE.Vector3(half, topY, half),
    new THREE.Vector3(-half, topY, half),
  ];

  const ringBottom = [
    new THREE.Vector3(-half + inset, bottomY, -half + inset),
    new THREE.Vector3(half - inset, bottomY, -half + inset),
    new THREE.Vector3(half - inset, bottomY, half - inset),
    new THREE.Vector3(-half + inset, bottomY, half - inset),
  ];

  const vertices = [];
  const indices = [];

  for (let i = 0; i < 4; i += 1) {
    const next = (i + 1) % 4;
    const base = vertices.length / 3;

    const a = ringTop[i];
    const b = ringTop[next];
    const c = ringBottom[next];
    const d = ringBottom[i];

    vertices.push(
      a.x, a.y, a.z,
      b.x, b.y, b.z,
      c.x, c.y, c.z,
      d.x, d.y, d.z
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const sideGeometry = new THREE.BufferGeometry();
  sideGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  sideGeometry.setIndex(indices);
  sideGeometry.computeVertexNormals();

  const sides = new THREE.Mesh(sideGeometry, sideMaterial);
  sides.castShadow = true;
  sides.receiveShadow = true;
  group.add(sides);

  const bottomGeometry = new THREE.BoxGeometry(
    config.size - inset * 2,
    config.bottomThickness,
    config.size - inset * 2
  );
  const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
  bottom.position.y = bottomY - config.bottomThickness / 2;
  bottom.castShadow = true;
  bottom.receiveShadow = true;
  group.add(bottom);

  return group;
}
