import * as THREE from "three";

/**
 * Owns the Three.js side of the builder: spawning placed objects, the
 * ghost preview and selection tint. It holds no UI and no builder rules —
 * builder-controller.js decides what exists, this decides how it looks.
 */
export function createBuilderView({ scene, loader, getGroundHeight, config }) {
  const group = new THREE.Group();
  group.name = "BuilderObjects";
  scene.add(group);

  const objects = new Map(); // itemId -> Object3D
  const originalMaterials = new WeakMap();

  let ghost = null;
  let ghostAsset = null;
  let highlighted = null;

  function groundModel(model) {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    if (Number.isFinite(box.min.y)) {
      model.position.y -= box.min.y;
      model.updateMatrixWorld(true);
    }
  }

  function applyTransform(object, item) {
    object.position.set(item.x, getGroundHeight(item.x, item.z), item.z);
    object.rotation.y = item.rotation;
    object.scale.setScalar(item.scale);
  }

  function setGhostAppearance(object) {
    object.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      node.material = materials.map((material) => {
        const clone = material.clone();
        clone.transparent = true;
        clone.opacity = config.ghostOpacity;
        clone.depthWrite = false;
        return clone;
      });
      if (node.material.length === 1) node.material = node.material[0];
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
          const clone = material.clone();
          if (clone.emissive) {
            clone.emissive = new THREE.Color(config.selectionColor);
            clone.emissiveIntensity = 0.45;
          }
          return clone;
        });
        node.material = tinted.length === 1 ? tinted[0] : tinted;
        return;
      }
      const source = originalMaterials.get(node);
      if (source) node.material = source;
    });
  }

  async function spawn(item) {
    if (objects.has(item.id)) return objects.get(item.id);
    const model = await loader.load(item.assetId);
    groundModel(model);
    const holder = new THREE.Group();
    holder.name = `builder:${item.assetId}`;
    holder.userData.itemId = item.id;
    holder.add(model);
    applyTransform(holder, item);
    group.add(holder);
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

  async function showGhost(asset) {
    clearGhost();
    const model = await loader.load(asset.id);
    groundModel(model);
    ghost = new THREE.Group();
    ghost.add(model);
    ghost.userData.rotation = 0;
    ghost.userData.scale = asset.defaultScale;
    setGhostAppearance(ghost);
    ghost.scale.setScalar(asset.defaultScale);
    ghost.position.set(0, 0, 0);
    ghostAsset = asset;
    scene.add(ghost);
    return ghost;
  }

  function moveGhost(x, z) {
    if (!ghost) return;
    ghost.position.set(x, getGroundHeight(x, z), z);
  }

  function nudgeGhost({ rotation = 0, scale = 0 }) {
    if (!ghost) return;
    if (rotation) {
      ghost.userData.rotation += rotation;
      ghost.rotation.y = ghost.userData.rotation;
    }
    if (scale) {
      const next = THREE.MathUtils.clamp(
        ghost.userData.scale + scale,
        ghostAsset.minScale,
        ghostAsset.maxScale
      );
      ghost.userData.scale = next;
      ghost.scale.setScalar(next);
    }
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

  function clearGhost() {
    if (!ghost) return;
    scene.remove(ghost);
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
    nudgeGhost,
    getGhostTransform,
    clearGhost,
    pick,
    get hasGhost() {
      return Boolean(ghost);
    },
  };
}
