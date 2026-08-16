import * as THREE from "three";

export function setupLighting(scene, renderer, shadowConfig, balanceConfig = {}) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  /**
   * Ambient-versus-directional is the whole ballgame for shape.
   *
   * A HemisphereLight is light arriving from every direction at once, so it
   * lights the side of a form facing away from the sun nearly as brightly as
   * the side facing it. At the old 2.2 against a 2.5 sun that is close to
   * one-to-one: a sphere renders as a flat disc, a sculpted hill as a painted
   * blob, and every tree as a sticker. The per-hour palette in day-night.js
   * now authors a ~1:2.5 ratio instead, and these scales keep it tunable from
   * the panel without editing that palette.
   */
  let sunScale = Number.isFinite(balanceConfig.sunScale) ? balanceConfig.sunScale : 1;
  let hemiScale = Number.isFinite(balanceConfig.hemiScale) ? balanceConfig.hemiScale : 1;
  let baseSun = 2.9;
  let baseHemi = 1.15;

  const hemi = new THREE.HemisphereLight(0xfff5dd, 0x496448, baseHemi * hemiScale);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffedc4, baseSun * sunScale);
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
      if (Number.isFinite(sunIntensity)) baseSun = sunIntensity;
      if (hemiSky) hemi.color.copy(hemiSky);
      if (hemiGround) hemi.groundColor.copy(hemiGround);
      if (Number.isFinite(hemiIntensity)) baseHemi = hemiIntensity;
      sun.intensity = baseSun * sunScale;
      hemi.intensity = baseHemi * hemiScale;
      if (sunDirection) {
        const length = 15;
        sunOffset.copy(sunDirection).multiplyScalar(length);
      }
    },
    /**
     * Panel-side override. Applied on top of whatever hour it currently is,
     * so dragging it at sunset does not snap the scene back to noon values.
     */
    setBalance({ sunScale: nextSun, hemiScale: nextHemi } = {}) {
      if (Number.isFinite(nextSun)) sunScale = nextSun;
      if (Number.isFinite(nextHemi)) hemiScale = nextHemi;
      sun.intensity = baseSun * sunScale;
      hemi.intensity = baseHemi * hemiScale;
    },
    getBalance() {
      return { sunScale, hemiScale, sunIntensity: sun.intensity, hemiIntensity: hemi.intensity };
    },
    /** Shadow coverage in metres, tied to the quality preset. */
    setShadowBounds(bounds) {
      const size = Math.max(4, Number(bounds) || shadowConfig.bounds);
      sun.shadow.camera.left = -size;
      sun.shadow.camera.right = size;
      sun.shadow.camera.top = size;
      sun.shadow.camera.bottom = -size;
      sun.shadow.camera.updateProjectionMatrix();
    },
  };
}
