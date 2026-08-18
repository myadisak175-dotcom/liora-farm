import * as THREE from "three";

/**
 * Painted horizon bands.
 *
 * An experiment sitting alongside the built ranges rather than replacing them:
 * each band is one open cylinder around the world carrying a painted strip,
 * so the far scenery costs one draw call and a few hundred KB instead of
 * geometry. Bands at different radii give real parallax as Liora walks, which
 * a single painting on the sky dome cannot.
 *
 * The strips are mirror-tiled during asset prep, because a generated painting
 * has no matching left and right edge — wrapping one directly leaves a seam
 * the eye finds immediately when the camera turns.
 */
export function createPaintedBackdrop(config = {}) {
  const group = new THREE.Group();
  group.name = "PaintedBackdrop";
  const bands = [];

  if (config.enabled === false || !Array.isArray(config.bands) || config.bands.length === 0) {
    return {
      group,
      bands,
      stats: { drawCalls: 0 },
      setAtmosphere() {},
      dispose() {},
    };
  }

  const loader = new THREE.TextureLoader();
  for (const spec of config.bands) {
    const radius = Math.max(20, Number(spec.radius) || 600);
    const height = Math.max(4, Number(spec.height) || 100);
    const repeat = Math.max(1, Math.round(Number(spec.repeat) || 1));

    const texture = loader.load(spec.texture);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Wrapping horizontally is the whole point; vertically it must clamp or
    // the sky above a ridge picks up the ground from the bottom of the strip.
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(repeat, 1);
    texture.anisotropy = Math.max(1, Number(config.anisotropy) || 1);

    const geometry = new THREE.CylinderGeometry(radius, radius, height, 96, 1, true);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      // Seen from inside, and never writing depth: these are backdrops, and
      // anything in the world should draw over them without sorting games.
      side: THREE.BackSide,
      depthWrite: false,
      // Scene fog would swallow a band sitting past fog.far entirely. Distance
      // is expressed by the atmosphere tint below instead, the same way the
      // built peaks handle it.
      fog: false,
      toneMapped: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = spec.name ?? "PaintedBand";
    mesh.position.y = Number(spec.y) || 0;
    mesh.renderOrder = Number.isFinite(spec.renderOrder) ? spec.renderOrder : -28;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);

    bands.push({
      mesh,
      geometry,
      material,
      texture,
      base: new THREE.Color(spec.tint ?? 0xffffff),
      haze: THREE.MathUtils.clamp(Number(spec.haze ?? 0.25), 0, 1),
    });
  }

  return {
    group,
    bands,
    stats: { drawCalls: bands.length },
    /**
     * Distance and hour, in one colour. A band far away loses contrast to the
     * air in front of it, and every band has to turn orange at sunset with the
     * sky rather than staying a bright midday green.
     */
    setAtmosphere(horizonColor) {
      if (!horizonColor) return;
      // A painting carries its own light, baked at midday. Tinting toward the
      // horizon colour alone leaves it glowing green against an orange dusk or
      // a navy night, so the sky's own brightness drives an exposure on top:
      // as the horizon darkens, so does everything painted into the distance.
      const luminance = horizonColor.r * 0.2126 + horizonColor.g * 0.7152 + horizonColor.b * 0.0722;
      const exposure = 0.22 + 0.78 * THREE.MathUtils.clamp(luminance, 0, 1);
      // Distance also reads stronger in flat evening light than at noon.
      const blend = THREE.MathUtils.clamp(1 - luminance, 0, 1);
      for (const band of bands) {
        band.material.color
          .copy(band.base)
          .lerp(horizonColor, THREE.MathUtils.clamp(band.haze + blend * 0.3, 0, 1))
          .multiplyScalar(exposure);
      }
    },
    dispose() {
      for (const band of bands) {
        band.geometry.dispose();
        band.material.dispose();
        band.texture.dispose();
      }
      group.clear();
    },
  };
}
