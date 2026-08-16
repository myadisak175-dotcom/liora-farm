import { getBuildableAsset } from "./asset-catalog.js";

export function createBuilderAssetLoader({ gltfLoader } = {}) {
  if (!gltfLoader) throw new Error("Builder asset loader requires a GLTFLoader instance");

  // Cache source GLBs by file path, not by asset id. World V2 files contain
  // several named objects, so five tree variants should still cost one fetch.
  const cache = new Map();
  const pending = new Map();

  function loadWithThree(path) {
    return new Promise((resolve, reject) => {
      gltfLoader.load(path, resolve, undefined, reject);
    });
  }

  async function sourceScene(path) {
    if (cache.has(path)) return cache.get(path);
    if (pending.has(path)) return pending.get(path);

    const request = loadWithThree(path)
      .then((gltf) => {
        if (!gltf?.scene) throw new Error(`GLB has no scene: ${path}`);
        cache.set(path, gltf.scene);
        pending.delete(path);
        return gltf.scene;
      })
      .catch((error) => {
        pending.delete(path);
        throw error;
      });

    pending.set(path, request);
    return request;
  }

  function cloneAsset(asset, scene) {
    const source = asset.nodeName ? scene.getObjectByName(asset.nodeName) : scene;
    if (!source) {
      throw new Error(
        `Buildable asset "${asset.id}" expected node "${asset.nodeName}" in ${asset.modelPath}`
      );
    }

    const clone = source.clone(true);
    // Casting is a per-asset decision (see CONFIG.shadows.minCasterHeight).
    // Receiving is not: ground cover still has to darken under a tree.
    const castShadow = asset.castShadow !== false;
    clone.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = castShadow;
      node.receiveShadow = true;
    });
    return clone;
  }

  async function load(assetId) {
    const asset = getBuildableAsset(assetId);
    if (!asset) throw new Error(`Unknown buildable asset: ${assetId}`);
    if (!asset.modelPath) {
      throw new Error(
        `Buildable asset "${assetId}" has no modelPath yet. Add the GLB to assets/ and register its path in asset-catalog.js.`
      );
    }

    const scene = await sourceScene(asset.modelPath);
    return cloneAsset(asset, scene);
  }

  function preload(assetIds = []) {
    return Promise.allSettled(assetIds.map((assetId) => load(assetId)));
  }

  function has(assetId) {
    const asset = getBuildableAsset(assetId);
    return Boolean(asset?.modelPath && cache.has(asset.modelPath));
  }

  function clear(assetId) {
    if (assetId) {
      const asset = getBuildableAsset(assetId);
      if (!asset?.modelPath) return;
      cache.delete(asset.modelPath);
      pending.delete(asset.modelPath);
      return;
    }
    cache.clear();
    pending.clear();
  }

  return { load, preload, has, clear };
}
