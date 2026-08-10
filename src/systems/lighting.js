import * as THREE from "three";

export function setupLighting(scene, renderer, shadowConfig) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(0xfff5dd, 0x496448, 2.2);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffedc4, 2.5);
  sun.castShadow = true;

  const sunOffset = new THREE.Vector3(-7, 12, 7);
  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sun.target = sunTarget;

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

  function follow(target) {
    sunTarget.position.set(target.x, 0, target.z);
    sun.position.set(
      target.x + sunOffset.x,
      sunOffset.y,
      target.z + sunOffset.z
    );
    sunTarget.updateMatrixWorld();
  }

  follow(new THREE.Vector3(0, 0, 5));

  return {
    sun,
    hemi,
    target: sunTarget,
    update(target) {
      follow(target);
    },
    setAtmosphere({ sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity, sunDirection }) {
      if (sunColor) sun.color.copy(sunColor);
      if (Number.isFinite(sunIntensity)) sun.intensity = sunIntensity;
      if (hemiSky) hemi.color.copy(hemiSky);
      if (hemiGround) hemi.groundColor.copy(hemiGround);
      if (Number.isFinite(hemiIntensity)) hemi.intensity = hemiIntensity;
      if (sunDirection) {
        const length = 15;
        sunOffset.copy(sunDirection).multiplyScalar(length);
      }
    },
  };
}
