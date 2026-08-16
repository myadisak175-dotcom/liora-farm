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

/**
 * Ambient shader wind. This system owns only shared shader uniforms and visual
 * material preparation. It never mutates Object3D transforms, builder items,
 * collision radii, persistence, farming state or movement state.
 *
 * Nature palette grading rides the same already-shared material hook so it does
 * not allocate another material per plant or add another draw call. Wind can be
 * disabled while the palette stays active: in that case wind strength is zero
 * and only the fragment colour grade remains.
 */
export function createWindSystem({ config = {}, quality = {} } = {}) {
  const enabled = config.enabled !== false;
  const gust = config.gust ?? {};
  const paletteConfig = config.naturePalette ?? {};
  const paletteStrength = paletteConfig.enabled === false
    ? 0
    : clamp01(paletteConfig.strength ?? 0);
  const visualEnabled = enabled || paletteStrength > 0;

  const uniforms = {
    time: { value: 0 },
    direction: { value: normalizedDirection(config.direction) },
    strength: { value: enabled ? Number(config.strength ?? 0.55) : 0 },
    speed: { value: Number(config.speed ?? 0.75) },
    gustStrength: { value: Number(gust.strength ?? 0.3) },
    gustSpeed: { value: Number(gust.speed ?? 0.18) },
    gustScale: { value: Number(gust.scale ?? 0.07) },
    paletteStrength: { value: paletteStrength },
  };

  let attachedMeshes = 0;
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
    // so they are patched in place and never enter the shared cache.
    const assetKey = preview ? null : asset?.id ?? null;
    let meshIndex = -1;

    let attached = false;
    model.traverse((node) => {
      if (!node?.isMesh || !node.material || !node.geometry) return;
      meshIndex += 1;
      try {
        const source = Array.isArray(node.material) ? node.material : [node.material];
        const next = source.map((material, slot) => {
          // `clone(true)` keeps child order, so the traversal index identifies
          // the same mesh across every copy of an asset.
          const key = assetKey === null ? null : `${assetKey}|${meshIndex}|${slot}`;
          const cached = key === null ? null : sharedMaterials.get(key);
          if (cached) return cached;

          const patched = applyWindToMaterial({
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
          }) ?? material;

          if (key !== null && patched.userData?.lioraWind) sharedMaterials.set(key, patched);
          return patched;
        });
        node.material = Array.isArray(node.material) ? next : next[0];
        if (assetKey === null && !preview && next.some((material, index) => material !== source[index])) {
          node.userData.materialIsClone = true;
        }
        if (next.some((material) => material?.userData?.lioraWind)) {
          attached = true;
          attachedMeshes += 1;
        }
      } catch (error) {
        // Wind and palette grading are decorative. A shader/material problem
        // must never stop a Builder object from loading or becoming collidable.
        failedMeshes += 1;
        console.warn(`Visual material effects skipped mesh "${node.name || "unnamed"}"`, error);
      }
    });
    return attached;
  }

  function update(delta) {
    if (!enabled) return;
    const step = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    uniforms.time.value = (uniforms.time.value + step) % 10000;
  }

  return {
    attach,
    update,
    get enabled() {
      return enabled;
    },
    get paletteStrength() {
      return uniforms.paletteStrength.value;
    },
    get stats() {
      return { attachedMeshes, failedMeshes, sharedMaterials: sharedMaterials.size };
    },
    get uniforms() {
      return uniforms;
    },
  };
}