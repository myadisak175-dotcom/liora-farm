import * as THREE from "three";
import { getBuildableAsset } from "./asset-catalog.js";

/**
 * Owns the Three.js side of the builder: spawning placed objects, the
 * ghost preview and selection tint. It holds no UI and no builder rules —
 * builder-controller.js decides what exists, this decides how it looks.
 */
export function createBuilderView({
  scene,
  loader,
  getGroundHeight,
  config,
  playerHeight = 1.7,
  prepareModel = null,
}) {
  const group = new THREE.Group();
  group.name = "BuilderObjects";
  scene.add(group);

  const objects = new Map(); // itemId -> Object3D
  const originalMaterials = new WeakMap();
  const box = new THREE.Box3();
  const size = new THREE.Vector3();

  let ghost = null;
  let ghostAsset = null;
  let ghostRevision = 0;
  let highlighted = null;

  function disposeMaterial(material) {
    for (const entry of Array.isArray(material) ? material : [material]) {
      entry?.dispose?.();
    }
  }

  function materialNeedsDispose(material) {
    return (Array.isArray(material) ? material : [material]).some(
      (entry) => Boolean(entry?.userData?.disposeWithBuilderView)
    );
  }

  /**
   * Three.js material clones intentionally do not promise to copy arbitrary
   * shader callbacks. Visual decorators can opt into preserving those hooks
   * without Builder knowing which effect installed them.
   */
  function cloneVisualMaterial(material) {
    const clone = material.clone();
    if (material?.userData?.preserveShaderHooksOnClone) {
      clone.onBeforeCompile = material.onBeforeCompile;
      clone.customProgramCacheKey = material.customProgramCacheKey;
    }
    return clone;
  }

  /** Cloned materials are per-instance, so they have to be handed back. */
  function disposeClonedMaterials(object) {
    object.traverse((node) => {
      if (!node.isMesh || !node.userData.materialIsClone) return;
      disposeMaterial(node.material);
      node.userData.materialIsClone = false;
    });
  }

  function measureSourceSize(model, asset) {
    model.updateMatrixWorld(true);
    box.setFromObject(model, true);
    box.getSize(size);
    if (asset?.sizeAxis === "footprint") return Math.max(size.x, size.z);
    return size.y;
  }

  function getScaleNormalization(model, asset) {
    if (!asset) return 1;
    const sourceSize = measureSourceSize(model, asset);
    if (!Number.isFinite(sourceSize) || sourceSize <= 0.0001) return 1;

    const targetSize = playerHeight * asset.sizeInPlayers;
    return targetSize / (sourceSize * asset.defaultScale);
  }

  function cacheBaseOffset(holder, model) {
    holder.position.set(0, 0, 0);
    holder.scale.setScalar(1);
    holder.rotation.set(0, 0, 0);
    holder.updateMatrixWorld(true);
    box.setFromObject(model, true);
    holder.userData.baseOffset = Number.isFinite(box.min.y) ? box.min.y : 0;
  }

  function snapToGround(object, x, z, totalScale) {
    const groundY = getGroundHeight(x, z);
    const baseOffset = object.userData.baseOffset ?? 0;
    object.position.set(x, groundY - baseOffset * totalScale, z);
    object.updateMatrixWorld(true);
  }

  function applyTransform(object, item) {
    const normalization = object.userData.scaleNormalization ?? 1;
    const totalScale = item.scale * normalization;
    object.rotation.y = item.rotation;
    object.scale.setScalar(totalScale);
    snapToGround(object, item.x, item.z, totalScale);
  }

  function setGhostAppearance(object) {
    object.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const clones = materials.map((material) => {
        const clone = cloneVisualMaterial(material);
        clone.transparent = true;
        clone.opacity = config.ghostOpacity;
        clone.depthWrite = false;
        return clone;
      });
      node.material = clones.length === 1 ? clones[0] : clones;
      node.userData.materialIsClone = true;
    });
  }

  function tint(object, on) {
    object.traverse((node) => {
      if (!node.isMesh) return;
      if (on) {
        if (!originalMaterials.has(node)) originalMaterials.set(node, node.material);
        const source = originalMaterials.get(node);
        const materials = Array.isArray(source) ? source : [source];
        const tinted = materials.map((material) => {
          const clone = cloneVisualMaterial(material);
          if (clone.emissive) {
            clone.emissive = new THREE.Color(config.selectionColor);
            clone.emissiveIntensity = 0.45;
          }
          return clone;
        });
        node.material = tinted.length === 1 ? tinted[0] : tinted;
        node.userData.materialIsClone = true;
        return;
      }
      const source = originalMaterials.get(node);
      if (!source) return;
      if (node.userData.materialIsClone) disposeMaterial(node.material);
      node.material = source;
      node.userData.materialIsClone = materialNeedsDispose(source);
    });
  }

  async function spawn(item) {
    if (objects.has(item.id)) return objects.get(item.id);
    const asset = getBuildableAsset(item.assetId);
    const model = await loader.load(item.assetId);
    prepareModel?.(model, asset, { preview: false });
    const holder = new THREE.Group();
    holder.name = `builder:${item.assetId}`;
    holder.userData.itemId = item.id;
    holder.userData.scaleNormalization = getScaleNormalization(model, asset);
    holder.add(model);
    group.add(holder);
    cacheBaseOffset(holder, model);
    applyTransform(holder, item);
    objects.set(item.id, holder);
    return holder;
  }

  function update(item) {
    const object = objects.get(item.id);
    if (object) applyTransform(object, item);
  }

  function remove(id) {
    const object = objects.get(id);
    if (!object) return;
    if (highlighted === object) highlight(null);
    disposeClonedMaterials(object);
    group.remove(object);
    objects.delete(id);
  }

  function clear() {
    highlight(null);
    for (const id of [...objects.keys()]) remove(id);
  }

  function highlight(id) {
    if (highlighted) tint(highlighted, false);
    highlighted = id ? objects.get(id) ?? null : null;
    if (highlighted) tint(highlighted, true);
  }

  /**
   * Ghost loads are asynchronous. The revision is owned here, where the ghost
   * variable is actually mutated, so an older slow request can never replace a
   * newer preview or resurrect a ghost after build mode was closed.
   */
  async function showGhost(asset, start = {}) {
    const request = ++ghostRevision;
    clearGhost({ invalidatePending: false });
    const model = await loader.load(asset.id);
    if (request !== ghostRevision) return null;

    const rotation = Number.isFinite(start.rotation) ? start.rotation : 0;
    const scale = THREE.MathUtils.clamp(
      Number.isFinite(start.scale) ? start.scale : asset.defaultScale,
      asset.minScale,
      asset.maxScale
    );

    const nextGhost = new THREE.Group();
    nextGhost.add(model);
    nextGhost.userData.rotation = rotation;
    nextGhost.userData.scale = scale;
    nextGhost.userData.scaleNormalization = getScaleNormalization(model, asset);
    setGhostAppearance(nextGhost);
    // Preview materials are already private translucent clones, so visual
    // decorators can patch them in-place without leaking into cached GLBs.
    prepareModel?.(nextGhost, asset, { preview: true });
    scene.add(nextGhost);
    cacheBaseOffset(nextGhost, model);
    nextGhost.rotation.y = rotation;
    const totalScale = scale * nextGhost.userData.scaleNormalization;
    nextGhost.scale.setScalar(totalScale);
    snapToGround(nextGhost, start.x ?? 0, start.z ?? 0, totalScale);

    if (request !== ghostRevision) {
      disposeClonedMaterials(nextGhost);
      scene.remove(nextGhost);
      return null;
    }

    ghost = nextGhost;
    ghostAsset = asset;
    return ghost;
  }

  function ghostTotalScale() {
    return (ghost?.userData.scale ?? 1) * (ghost?.userData.scaleNormalization ?? 1);
  }

  function moveGhost(x, z) {
    if (!ghost) return;
    snapToGround(ghost, x, z, ghostTotalScale());
  }

  function setGhostScale(value) {
    if (!ghost || !ghostAsset) return;
    const next = THREE.MathUtils.clamp(value, ghostAsset.minScale, ghostAsset.maxScale);
    ghost.userData.scale = next;
    const totalScale = next * (ghost.userData.scaleNormalization ?? 1);
    ghost.scale.setScalar(totalScale);
    snapToGround(ghost, ghost.position.x, ghost.position.z, totalScale);
  }

  function nudgeGhost({ rotation = 0, scale = 0 }) {
    if (!ghost) return;
    if (rotation) {
      ghost.userData.rotation += rotation;
      ghost.rotation.y = ghost.userData.rotation;
    }
    if (scale) setGhostScale(ghost.userData.scale + scale);
  }

  function getGhostTransform() {
    if (!ghost) return null;
    return {
      x: ghost.position.x,
      z: ghost.position.z,
      rotation: ghost.userData.rotation,
      scale: ghost.userData.scale,
    };
  }

  function clearGhost({ invalidatePending = true } = {}) {
    if (invalidatePending) ghostRevision += 1;
    if (!ghost) {
      ghostAsset = null;
      return;
    }
    disposeClonedMaterials(ghost);
    scene.remove(nextGhost);
    ghost = null;
    ghostAsset = null;
  }

  function pick(raycaster) {
    const hits = raycaster.intersectObjects([...objects.values()], true);
    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData.itemId) node = node.parent;
      if (node?.userData.itemId) return node.userData.itemId;
    }
    return null;
  }

  return {
    group,
    spawn,
    update,
    remove,
    clear,
    highlight,
    showGhost,
    moveGhost,
    setGhostScale,
    nudgeGhost,
    getGhostTransform,
    clearGhost,
    pick,
    get hasGhost() {
      return Boolean(ghost);
    },
  };
}
