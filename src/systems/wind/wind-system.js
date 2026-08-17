import * as THREE from "three";
import { applyWindToMaterial, createModelWindFrame } from "./wind-material.js";
import { inferAssetWindProfile } from "./wind-profiles.js";

function normalizedDirection(direction = {}) {
  const x = Number(direction.x) || 0;
  const y = Number(direction.z) || 0;
  const length = Math.hypot(x, y) || 1;
  return new THREE.Vector2(x / length, y / length);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

// The shadow pass should read as the same breeze, not as a second animation.
// Keep one clock/direction/gust source, slow that source very slightly for both
// colour and depth, then attenuate only the depth displacement. This makes the
// projected canopy calmer without adding another oscillator, material pass or
// shadow caster. Config can override the defaults later without changing code.
const NATURAL_MOTION_DEFAULTS = Object.freeze({
  speedScale: 0.9,
  gustSpeedScale: 0.9,
  shadowStrength: 0.84,
});

// Nature V2 is intentionally matte/cozy rather than glossy PBR foliage. These
// are floors/ceilings, not replacements: already-matte authored materials keep
// their original values, while unexpectedly shiny materials are softened.
const NATURE_SURFACE = Object.freeze({
  roughnessMin: 0.82,
  metalnessMax: 0.03,
  envMapIntensityMax: 0.35,
});

function softenNatureSurface(material) {
  if (!material) return material;

  if (Number.isFinite(material.roughness)) {
    material.roughness = Math.max(material.roughness, NATURE_SURFACE.roughnessMin);
  }
  if (Number.isFinite(material.metalness)) {
    material.metalness = Math.min(material.metalness, NATURE_SURFACE.metalnessMax);
  }
  if (Number.isFinite(material.envMapIntensity)) {
    material.envMapIntensity = Math.min(
      material.envMapIntensity,
      NATURE_SURFACE.envMapIntensityMax
    );
  }

  material.userData = {
    ...material.userData,
    lioraNatureSurface: true,
  };
  material.needsUpdate = true;
  return material;
}

/**
 * Builds a depth-only material that keeps the authored alpha cutout. The same
 * wind decorator is then applied to its vertex shader, so the directional
 * shadow pass follows the displaced foliage silhouette.
 */
function createDepthSource(material) {
  if (!material || Array.isArray(material)) return null;
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: material.map ?? null,
    alphaMap: material.alphaMap ?? null,
    alphaTest: Number.isFinite(material.alphaTest) ? material.alphaTest : 0,
    side: material.shadowSide ?? material.side,
  });
  depth.name = material.name ?? "";
  depth.userData = { ...depth.userData, lioraWindDepth: true };
  return depth;
}

/**
 * Ambient shader wind. This system owns only shared shader uniforms and visual
 * material preparation. It never mutates Object3D transforms, builder items,
 * collision radii, persistence, farming state or movement state.
 *
 * Nature palette grading rides the same already-shared material hook so it does
 * not allocate another material per plant or add another draw call. Wind can be
 * disabled while the palette stays active: in that case wind strength is zero
 * and only the fragment colour grade remains.
 *
 * The Nature V2 surface pass also runs on that same shared material. It only
 * softens PBR response (roughness/metalness/environment intensity), so house,
 * terrain, water and gameplay lighting remain unchanged.
 *
 * Shadow animation is also visual-only: only meshes that already cast a shadow
 * receive a custom depth material. Grass/flowers below the existing caster
 * height remain non-casters, so this does not expand the shadow workload.
 */
export function createWindSystem({ config = {}, quality = {} } = {}) {
  const enabled = config.enabled !== false;
  const gust = config.gust ?? {};
  const motion = config.motion ?? {};
  const interaction = config.interaction ?? {};
  const interactionEnabled = interaction.enabled !== false;
  const paletteConfig = config.naturePalette ?? {};
  const paletteStrength = paletteConfig.enabled === false
    ? 0
    : clamp01(paletteConfig.strength ?? 0);
  const visualEnabled = enabled || interactionEnabled || paletteStrength > 0;

  const speedScale = Math.max(0, Number(motion.speedScale ?? NATURAL_MOTION_DEFAULTS.speedScale) || 0);
  const gustSpeedScale = Math.max(
    0,
    Number(motion.gustSpeedScale ?? NATURAL_MOTION_DEFAULTS.gustSpeedScale) || 0
  );
  const shadowStrength = clamp01(
    motion.shadowStrength ?? NATURAL_MOTION_DEFAULTS.shadowStrength
  );

  const uniforms = {
    time: { value: 0 },
    direction: { value: normalizedDirection(config.direction) },
    strength: { value: enabled ? Number(config.strength ?? 0.55) : 0 },
    speed: { value: Number(config.speed ?? 0.75) * speedScale },
    gustStrength: { value: Number(gust.strength ?? 0.3) },
    gustSpeed: { value: Number(gust.speed ?? 0.18) * gustSpeedScale },
    gustScale: { value: Number(gust.scale ?? 0.07) },
    paletteStrength: { value: paletteStrength },
    interactionPosition: { value: new THREE.Vector2(100000, 100000) },
    interactionDirection: { value: normalizedDirection(config.direction) },
    interactionRadius: { value: Math.max(0.1, Number(interaction.radius ?? 1.25) || 1.25) },
    interactionStrength: { value: Math.max(0, Number(interaction.strength ?? 0.52) || 0) },
    interactionMotion: { value: 0 },
    interactionActive: { value: 0 },
  };

  // A depth material already had one lioraWindStrength uniform. Pointing that
  // existing slot at a shared attenuated value changes no uniform count and no
  // render-pass count; it only makes the projected motion less exaggerated.
  const shadowUniforms = {
    ...uniforms,
    strength: { value: uniforms.strength.value * shadowStrength },
  };

  let attachedMeshes = 0;
  let animatedShadowMeshes = 0;
  let failedMeshes = 0;

  /**
   * Wind uniforms describe an *asset*, not a placed object: the height frame,
   * the bend axis and the profile weights are identical for every copy of the
   * same tree. Cloning a material per placed object therefore bought nothing
   * and cost a full uniform upload per object per frame, because Three.js only
   * skips that work while consecutive draws share one material instance.
   *
   * One island of 300 plants went from ~450 unique materials to ~20. The
   * materials outlive the objects using them, so they are deliberately not
   * flagged for Builder disposal — removing one tree must not blank every
   * other tree of the same kind.
   */
  const sharedMaterials = new Map();
  const sharedDepthMaterials = new Map();

  function attachShadowDepth({
    node,
    sourceMaterial,
    assetKey,
    meshIndex,
    profileName,
    up,
    bounds,
  }) {
    if (!(enabled || interactionEnabled) || node.castShadow === false || Array.isArray(sourceMaterial)) return false;

    const key = assetKey === null ? null : `${assetKey}|${meshIndex}|depth`;
    const cached = key === null ? null : sharedDepthMaterials.get(key);
    if (cached) {
      node.customDepthMaterial = cached;
      animatedShadowMeshes += 1;
      return true;
    }

    const source = createDepthSource(sourceMaterial);
    if (!source) return false;
    const depth = applyWindToMaterial({
      material: source,
      geometry: node.geometry,
      mesh: node,
      profileName,
      uniforms: shadowUniforms,
      quality,
      clone: false,
      shared: key !== null,
      up,
      bounds,
    });
    if (!depth?.userData?.lioraWind) return false;

    depth.userData = { ...depth.userData, lioraWindDepth: true };
    node.customDepthMaterial = depth;
    if (key !== null) sharedDepthMaterials.set(key, depth);
    animatedShadowMeshes += 1;
    return true;
  }

  function attach(model, asset, { preview = false } = {}) {
    const profileName = asset?.windProfile ?? inferAssetWindProfile(asset);
    if (!visualEnabled || !profileName || !model?.traverse) return false;

    // The bend axis is read from each mesh's world matrix, so it has to be up
    // to date. Builder hands the model over before parenting it, which is what
    // we want: the matrix is then relative to the model root, and the holder's
    // later Y rotation cannot tilt the axis.
    model.updateMatrixWorld?.(true);
    const { up, bounds } = createModelWindFrame(model);

    // Ghost previews are private translucent clones that die with the preview,
    // so they are patched in place and never enter the shared cache. Builder
    // also disables their shadow casting before this hook runs.
    const assetKey = preview ? null : asset?.id ?? null;
    let meshIndex = -1;

    let attached = false;
    model.traverse((node) => {
      if (!node?.isMesh || !node.material || !node.geometry) return;
      meshIndex += 1;
      try {
        const originalWasArray = Array.isArray(node.material);
        const source = originalWasArray ? node.material : [node.material];
        const next = source.map((material, slot) => {
          // `clone(true)` keeps child order, so the traversal index identifies
          // the same mesh across every copy of an asset.
          const key = assetKey === null ? null : `${assetKey}|${meshIndex}|${slot}`;
          const cached = key === null ? null : sharedMaterials.get(key);
          if (cached) return cached;

          const decorated = applyWindToMaterial({
            material,
            geometry: node.geometry,
            mesh: node,
            profileName,
            uniforms,
            quality,
            clone: !preview,
            shared: key !== null,
            up,
            bounds,
          });

          // A geometry with unusable bounds can skip the shader decorator. The
          // matte surface treatment should still work, but never by mutating the
          // GLB cache's source material for a placed object.
          const patched = decorated ?? (preview ? material : material.clone());
          softenNatureSurface(patched);

          if (key !== null && patched.userData?.lioraWind) sharedMaterials.set(key, patched);
          return patched;
        });
        node.material = originalWasArray ? next : next[0];

        // Shadow depth must be derived from the authored material, not the
        // selected/graded clone, so alpha cutout and side rules stay identical.
        // Multi-material meshes deliberately keep Three.js's default static
        // depth path rather than guessing one alpha map for several groups.
        if (!preview && !originalWasArray) {
          attachShadowDepth({
            node,
            sourceMaterial: source[0],
            assetKey,
            meshIndex,
            profileName,
            up,
            bounds,
          });
        }

        if (assetKey === null && !preview && next.some((material, index) => material !== source[index])) {
          node.userData.materialIsClone = true;
        }
        if (next.some((material) => material?.userData?.lioraWind)) {
          attached = true;
          attachedMeshes += 1;
        }
      } catch (error) {
        // Wind, palette grading, surface tuning and animated shadow depth are
        // decorative. A material problem must never stop a Builder object
        // loading or becoming collidable.
        failedMeshes += 1;
        console.warn(`Visual material effects skipped mesh "${node.name || "unnamed"}"`, error);
      }
    });
    return attached;
  }

  function update(delta) {
    if (!visualEnabled) return;
    const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    uniforms.time.value = (uniforms.time.value + step) % 10000;
  }

  let qualityAllowsInteraction = quality?.preset?.foliageInteraction !== false
    && quality?.foliageInteraction !== false;

  function setInteraction(position, state = {}) {
    if (!interactionEnabled || !qualityAllowsInteraction || !position) {
      uniforms.interactionActive.value = 0;
      return;
    }

    const x = Number(position.x);
    const z = Number(position.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      uniforms.interactionActive.value = 0;
      return;
    }

    uniforms.interactionPosition.value.set(x, z);
    const dx = Number(state?.direction?.x) || 0;
    const dz = Number(state?.direction?.z) || 0;
    const length = Math.hypot(dx, dz);
    if (length > 0.001) uniforms.interactionDirection.value.set(dx / length, dz / length);
    uniforms.interactionMotion.value = state?.moving
      ? (state?.running ? 1 : 0.82)
      : 0;
    uniforms.interactionActive.value = 1;
  }

  function setQuality(preset = {}) {
    qualityAllowsInteraction = preset.foliageInteraction !== false;
    if (!qualityAllowsInteraction) uniforms.interactionActive.value = 0;
  }

  return {
    attach,
    update,
    setInteraction,
    setQuality,
    get enabled() {
      return enabled;
    },
    get paletteStrength() {
      return uniforms.paletteStrength.value;
    },
    get stats() {
      return {
        attachedMeshes,
        animatedShadowMeshes,
        failedMeshes,
        sharedMaterials: sharedMaterials.size,
        sharedDepthMaterials: sharedDepthMaterials.size,
      };
    },
    get uniforms() {
      return uniforms;
    },
  };
}
