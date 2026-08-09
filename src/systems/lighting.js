import * as THREE from "three";

export function setupLighting(scene, renderer, shadowConfig) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight(0xfff5dd, 0x496448, 2.2));

  const sun = new THREE.DirectionalLight(0xffedc4, 2.5);
  sun.position.set(-7, 12, 7);
  sun.castShadow = true;

  const mapSize = Math.min(
    shadowConfig.mapSize,
    renderer.capabilities.maxTextureSize
  );
  sun.shadow.mapSize.set(mapSize, mapSize);

  sun.shadow.camera.left = -shadowConfig.bounds;
  sun.shadow.camera.right = shadowConfig.bounds;
  sun.shadow.camera.top = shadowConfig.bounds;
  sun.shadow.camera.bottom = -shadowConfig.bounds;
  sun.shadow.camera.near = shadowConfig.near;
  sun.shadow.camera.far = shadowConfig.far;
  sun.shadow.bias = shadowConfig.bias;
  sun.shadow.normalBias = shadowConfig.normalBias;
  sun.shadow.radius = shadowConfig.radius;

  scene.add(sun);
  return sun;
}
