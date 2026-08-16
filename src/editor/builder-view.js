import * as THREE from "three";
import { getBuildableAsset } from "./asset-catalog.js";
import { createInstancedPools } from "./instanced-pool.js";

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

  // Ground cover renders as one draw call per plant type instead of one per
  // plant. Everything else keeps the Object3D path — see instanced-pool.js for
  // why that split is not just laziness.
  const pools = createInstancedPools({ scene });
  const poolMetrics = new Map(); // assetId -> { scaleNormalization, baseOffset }
  const selectionTint = new THREE.Color(config.selectionColor);

  let ghost = null;
  let ghostAsset = null;
  let ghostRevision = 0;
  let highlighted = null;
  let highlightedInstance = null;

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

  /**
   * The model's own bounding box floor, which `snapToGround` subtracts so an
   * object sits on the terrain instead of through it. Same number
   * `cacheBaseOffset` caches per holder, measured once per pooled asset.
   */
  function measureBaseOffset(model) {
    model.updateMatrixWorld(true);
    box.setFromObject(model, true);
    return Number.isFinite(box.min.y) ? box.min.y : 0;
  }

  function attachObject(item, asset, model) {
    if (objects.has(item.id)) return objects.get(item.id);
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

  /**
   * Pooled assets pay the model measuring cost once, not once per placed copy.
   * An asset the pool refuses (a multi-material mesh) silently falls back to
   * the ordinary path rather than failing to appear.
   */
  async function spawnInstanced(item, asset) {
    if (!pools.has(asset.id)) {
      const model = await loader.load(item.assetId);
      prepareModel?.(model, asset, { preview: false });
      const metrics = {
        scaleNormalization: getScaleNormalization(model, asset),
        baseOffset: measureBaseOffset(model),
      };
      if (!pools.ensure(asset.id, model, metrics)) return attachObject(item, asset, model);
      poolMetrics.set(asset.id, metrics);
    }
    pools.add(item, getGroundHeight(item.x, item.z));
    return null;
  }

  async function spawn(item) {
    const asset = getBuildableAsset(item.assetId);
    if (asset?.instanced) {
      return pools.holds(item.id) ? null : spawnInstanced(item, asset);
    }
    if (objects.has(item.id)) return objects.get(item.id);
    const model = await loader.load(item.assetId);
    prepareModel?.(model, asset, { preview: false });
    return attachObject(item, asset, model);
  }

  function update(item) {
    if (pools.update(item, getGroundHeight(item.x, item.z))) return;
    const object = objects.get(item.id);
    if (object) applyTransform(object, item);
  }

  function remove(id) {
    if (highlighted?.userData.itemId === id || highlightedInstance === id) highlight(null);
    if (pools.remove(id)) return;
    const object = objects.get(id);
    if (!object) return;
    disposeClonedMaterials(object);
    group.remove(object);
    objects.delete(id);
  }

  function clear() {
    highlight(null);
    pools.clear();
    for (const id of [...objects.keys()]) remove(id);
  }

  /**
   * One selected item at a time, on either path. An Object3D gets the emissive
   * material clone; a pooled plant gets a per-instance colour, because its
   * material is shared with every other copy on the island.
   */
  function highlight(id) {
    if (highlighted) tint(highlighted, false);
    if (highlightedInstance) pools.tint(highlightedInstance, null);
    highlighted = null;
    highlightedInstance = null;
    if (!id) return;

    const object = objects.get(id);
    if (object) {
      highlighted = object;
      tint(object, true);
      return;
    }
    if (pools.tint(id, selectionTint)) highlightedInstance = id;
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
    scene.remove(ghost);
    ghost = null;
    ghostAsset = null;
  }

  /**
   * Both paths are tested in one call so the result is ordered by real depth:
   * raycasting pools separately would let a distant tree win over the grass
   * clump actually under the finger.
   */
  function pick(raycaster) {
    const hits = raycaster.intersectObjects([...objects.values(), ...pools.pickTargets()], true);
    for (const hit of hits) {
      const instanced = pools.resolve(hit);
      if (instanced) return instanced;
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
