import * as THREE from "three";

/**
 * Turn an authored chroma-key strip into a transparent texture without
 * resampling it horizontally. This is intentionally opt-in: the established
 * meadow/treeline/peaks WebPs already carry alpha and must stay untouched.
 *
 * A vertical crop can be applied at the same time. For the path strip this
 * keeps the full 4096 px panorama width while reducing the 512 px source to a
 * 256 px runtime canvas before WebGL uploads it.
 */
function prepareChromaTexture(texture, spec = {}) {
  if (!Number.isFinite(Number(spec.chromaKey))) return;

  const image = texture.image;
  const width = Number(image?.naturalWidth || image?.videoWidth || image?.width || 0);
  const sourceHeight = Number(image?.naturalHeight || image?.videoHeight || image?.height || 0);
  if (!width || !sourceHeight || typeof document === "undefined") return;

  const cropY = THREE.MathUtils.clamp(Math.round(Number(spec.cropY) || 0), 0, Math.max(0, sourceHeight - 1));
  const requestedHeight = Math.round(Number(spec.cropHeight) || sourceHeight);
  const cropHeight = THREE.MathUtils.clamp(requestedHeight, 1, sourceHeight - cropY);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = cropHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  context.drawImage(image, 0, cropY, width, cropHeight, 0, 0, width, cropHeight);
  const frame = context.getImageData(0, 0, width, cropHeight);
  const pixels = frame.data;

  const key = Number(spec.chromaKey) >>> 0;
  const kr = (key >> 16) & 255;
  const kg = (key >> 8) & 255;
  const kb = key & 255;
  const hard = Math.max(0, Number(spec.chromaTolerance) || 28);
  const feather = Math.max(1, Number(spec.chromaFeather) || 70);
  const hard2 = hard * hard;
  const soft = hard + feather;
  const soft2 = soft * soft;
  const span = Math.max(1, soft2 - hard2);

  // Fade only colours near the authored key. Using squared distance avoids a
  // million square-roots on a phone while still removing anti-aliased magenta
  // fringe instead of leaving a purple halo around fences and shrubs.
  for (let i = 0; i < pixels.length; i += 4) {
    const dr = pixels[i] - kr;
    const dg = pixels[i + 1] - kg;
    const db = pixels[i + 2] - kb;
    const distance2 = dr * dr + dg * dg + db * db;
    if (distance2 >= soft2) continue;
    if (distance2 <= hard2) {
      pixels[i + 3] = 0;
      continue;
    }
    const keep = THREE.MathUtils.clamp((distance2 - hard2) / span, 0, 1);
    pixels[i + 3] = Math.round(pixels[i + 3] * keep);
  }

  context.putImageData(frame, 0, 0);
  texture.image = canvas;
  texture.needsUpdate = true;
}

/**
 * Painted horizon bands — the world's own far scenery.
 *
 * Each band is one open cylinder around the world carrying a painted strip,
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

    const texture = loader.load(spec.texture, (loadedTexture) => prepareChromaTexture(loadedTexture, spec));
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
