import * as THREE from "three";
import { getBuildableAsset } from "./asset-catalog.js";

export function createBuilderView({ scene, camera, renderer, orbit, assetLoader }) {
  if (!scene || !camera || !renderer || !orbit || !assetLoader) {
    throw new Error("createBuilderView requires scene, camera, renderer, orbit and assetLoader");
  }

  const placed = new Map();
  const warnedInstancing = new Set();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const centre = new THREE.Vector2(0, 0);
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHit = new THREE.Vector3();

  let preview = null;
  let previewAsset = null;
  let previewToken = 0;
  let moving = null;
  let snap = 1;
  let disposed = false;

  function cloneRenderableResources(root) {
    root.traverse((node) => {
      if (!node.isMesh) return;
      if (node.geometry?.clone) node.geometry = node.geometry.clone();
      if (Array.isArray(node.material)) {
        node.material = node.material.map((material) => material?.clone?.() ?? material);
      } else if (node.material?.clone) {
        node.material = node.material.clone();
      }
    });
    return root;
  }

  // Hybrid calibration rule:
  // - Liora is the world ruler at 1.7 m.
  // - Each asset may define its own targetHeight in catalog.json.
  // - We scale the inner GLB once to that physical target, then ground it.
  // - The outer holder keeps user scale/rotation independent, so +/- remains free.
  function makeGroundedRoot(model, asset) {
    const root = new THREE.Group();
    root.userData.builderAssetId = asset?.id ?? null;
    root.add(model);
    root.updateMatrixWorld(true);

    let bounds = new THREE.Box3().setFromObject(model);
    if (!bounds.isEmpty()) {
      const size = bounds.getSize(new THREE.Vector3());
      const targetHeight = Number(asset?.targetHeight ?? 0);
      if (targetHeight > 0 && Number.isFinite(size.y) && size.y > 0.0001) {
        const baseScale = targetHeight / size.y;
        model.scale.multiplyScalar(baseScale);
        model.updateMatrixWorld(true);
        root.userData.builderBaseScale = baseScale;
        root.userData.builderTargetHeight = targetHeight;
      }
    }

    bounds = new THREE.Box3().setFromObject(model);
    if (!bounds.isEmpty() && Number.isFinite(bounds.min.y)) {
      model.position.y -= bounds.min.y;
      model.updateMatrixWorld(true);
    }
    return root;
  }

  async function loadGroundedObject(assetId) {
    const asset = getBuildableAsset(assetId);
    const model = cloneRenderableResources(await assetLoader.load(assetId));
    return makeGroundedRoot(model, asset);
  }

  function disposeObject(root) {
    if (!root) return;
    root.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) {
        for (const material of node.material) material?.dispose?.();
      } else {
        node.material?.dispose?.();
      }
    });
  }

  function eachMaterial(root, fn) {
    root?.traverse((node) => {
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) if (material) fn(material, node);
    });
  }

  function setGhost(root, on) {
    if (!root) return;
    root.traverse((node) => {
      if (!node.isMesh) return;
      if (on) {
        if (node.userData.builderCastShadow == null) node.userData.builderCastShadow = node.castShadow;
        node.castShadow = false;
      } else if (node.userData.builderCastShadow != null) {
        node.castShadow = node.userData.builderCastShadow;
        delete node.userData.builderCastShadow;
      }
    });
  }

  function setEmissive(root, hex) {
    eachMaterial(root, (material) => material.emissive?.setHex?.(hex));
  }

  function applyTransform(root, item) {
    root.position.set(Number(item.x) || 0, 0, Number(item.z) || 0);
    root.rotation.y = Number(item.rotation) || 0;
    root.scale.setScalar(Number(item.scale) || 1);
  }

  function transformOf(root) {
    if (!root) return null;
    return { x: root.position.x, z: root.position.z, rotation: root.rotation.y, scale: root.scale.x };
  }

  function sameTransform(a, b) {
    const e = 1e-6;
    return Math.abs(Number(a.x)-Number(b.x))<e &&
      Math.abs(Number(a.z)-Number(b.z))<e &&
      Math.abs(Number(a.rotation??0)-Number(b.rotation??0))<e &&
      Math.abs(Number(a.scale??1)-Number(b.scale??1))<e;
  }

  function activeObject() { return preview ?? moving?.object ?? null; }
  function activeAsset() {
    if (previewAsset) return previewAsset;
    return moving?.assetId ? getBuildableAsset(moving.assetId) : null;
  }

  function snapForActive() {
    const asset = activeAsset();
    const grid = Number(asset?.gridSize ?? 0);
    return grid > 0 ? grid : snap;
  }

  function follow(root) {
    raycaster.setFromCamera(centre, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return;
    const step = snapForActive();
    const quantize = (value) => step ? Math.round(value / step) * step : value;
    root.position.x = quantize(groundHit.x);
    root.position.z = quantize(groundHit.z);
    root.position.y = 0;
  }

  function clampedScale(value) {
    const asset = activeAsset();
    if (asset?.lockScale) return Number(asset.defaultScale ?? 1);
    const min = Number(asset?.minScale ?? .35);
    const max = Number(asset?.maxScale ?? 3);
    return THREE.MathUtils.clamp(value, min, max);
  }

  function scalePreview(factor) {
    const target = activeObject();
    if (!target) return;
    target.scale.setScalar(clampedScale(target.scale.x * Number(factor || 1)));
  }

  async function addPlaced(item) {
    const object = await loadGroundedObject(item.assetId);
    if (disposed) { disposeObject(object); return; }
    object.userData.builderItemId = item.id;
    object.userData.builderAssetId = item.assetId;
    applyTransform(object, item);
    placed.set(item.id, { object, assetId: item.assetId });
    scene.add(object);
  }

  async function syncItems(items) {
    if (disposed) return;
    const next = new Map(items.map((item) => [item.id, item]));

    for (const [id, entry] of placed) {
      if (next.has(id)) continue;
      if (moving?.id === id) moving = null;
      scene.remove(entry.object);
      disposeObject(entry.object);
      placed.delete(id);
    }

    const counts = new Map();
    for (const item of items) counts.set(item.assetId, (counts.get(item.assetId) ?? 0) + 1);
    for (const [assetId, count] of counts) {
      if (count > 30 && !warnedInstancing.has(assetId)) {
        warnedInstancing.add(assetId);
        console.warn(`Builder asset "${assetId}" has ${count} instances; move it to InstancedMesh (threshold: 30).`);
      }
    }

    const loads = [];
    for (const item of items) {
      const entry = placed.get(item.id);
      if (!entry) { loads.push(addPlaced(item)); continue; }
      if (entry.assetId !== item.assetId) {
        scene.remove(entry.object);
        disposeObject(entry.object);
        placed.delete(item.id);
        loads.push(addPlaced(item));
        continue;
      }
      if (moving?.id === item.id) {
        if (!sameTransform(item, moving.original)) {
          setGhost(entry.object, false);
          moving = null;
          applyTransform(entry.object, item);
        }
        continue;
      }
      applyTransform(entry.object, item);
    }
    await Promise.all(loads);
  }

  async function beginPreview(asset) {
    if (!asset?.id) throw new Error("beginPreview requires a catalog asset");
    if (moving) endPreview();
    if (preview) { scene.remove(preview); disposeObject(preview); preview = null; }

    const token = ++previewToken;
    const object = await loadGroundedObject(asset.id);
    if (disposed || token !== previewToken) { disposeObject(object); return null; }

    previewAsset = asset;
    preview = object;
    preview.userData.builderPreview = true;
    preview.userData.builderAssetId = asset.id;
    preview.rotation.y = 0;
    preview.scale.setScalar(asset.defaultScale ?? 1);
    setGhost(preview, true);
    follow(preview);
    scene.add(preview);
    return preview;
  }

  function endPreview() {
    previewToken += 1;
    if (preview) { scene.remove(preview); disposeObject(preview); preview = null; previewAsset = null; }
    if (moving) {
      const entry = placed.get(moving.id);
      if (entry) { applyTransform(entry.object, moving.original); setGhost(entry.object, false); }
      moving = null;
    }
  }

  function getPreviewTransform() { return preview ? transformOf(preview) : moving ? transformOf(moving.object) : null; }
  function rotatePreview(step) { const target = activeObject(); if (target) target.rotation.y += Number(step) * Math.PI / 8; }

  function beginMove(id) {
    if (preview) {
      scene.remove(preview); disposeObject(preview); preview = null; previewAsset = null; previewToken += 1;
    }
    if (moving) endPreview();
    const entry = placed.get(id);
    if (!entry) return null;
    moving = { id, assetId: entry.assetId, object: entry.object, original: transformOf(entry.object) };
    setGhost(entry.object, true);
    follow(entry.object);
    return entry.object;
  }

  function pickAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX-rect.left)/rect.width)*2-1, -((clientY-rect.top)/rect.height)*2+1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(Array.from(placed.values(), (entry) => entry.object), true)[0];
    if (!hit) return null;
    let object = hit.object;
    while (object && !object.userData.builderItemId) object = object.parent;
    return object?.userData.builderItemId ?? null;
  }

  function highlight(id) {
    for (const [itemId, entry] of placed) setEmissive(entry.object, itemId === id ? 0x3A2A00 : 0x000000);
  }

  function setSnap(value) {
    const next = Number(value);
    snap = Number.isFinite(next) && next > 0 ? next : 0;
  }

  function update() { if (preview) follow(preview); if (moving) follow(moving.object); }

  function dispose() {
    if (disposed) return;
    disposed = true;
    endPreview();
    for (const entry of placed.values()) { scene.remove(entry.object); disposeObject(entry.object); }
    placed.clear();
    warnedInstancing.clear();
  }

  return {
    syncItems, beginPreview, endPreview, getPreviewTransform, rotatePreview, scalePreview,
    beginMove, pickAt, highlight, setSnap, update, dispose,
  };
}
