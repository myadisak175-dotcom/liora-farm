import { getBuildableAsset } from "./asset-catalog.js";

export function createBuilderAssetLoader({ gltfLoader } = {}) {
  if (!gltfLoader) throw new Error("Builder asset loader requires a GLTFLoader instance");

  const cache = new Map();
  const pending = new Map();

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function withRetryQuery(path, attempt) {
    if (attempt === 0) return path;
    const join = path.includes("?") ? "&" : "?";
    return `${path}${join}retry=${Date.now()}-${attempt}`;
  }

  function loadWithThree(path) {
    return new Promise((resolve, reject) => {
      gltfLoader.load(path, resolve, undefined, reject);
    });
  }

  async function loadWithRetry(path, attempts = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await loadWithThree(withRetryQuery(path, attempt));
      } catch (error) {
        lastError = error;
        if (attempt >= attempts - 1) break;
        await delay(attempt === 0 ? 280 : 750);
      }
    }
    throw lastError ?? new Error(`Failed to load ${path}`);
  }

  async function load(assetId) {
    const asset = getBuildableAsset(assetId);
    if (!asset) throw new Error(`Unknown buildable asset: ${assetId}`);
    if (!asset.modelPath) {
      throw new Error(
        `Buildable asset "${assetId}" has no modelPath yet. Add the GLB to assets/ and register its path in asset-catalog.js.`
      );
    }

    if (cache.has(assetId)) return cache.get(assetId).clone(true);
    if (pending.has(assetId)) {
      const scene = await pending.get(assetId);
      return scene.clone(true);
    }

    const request = loadWithRetry(asset.modelPath, 3).then((gltf) => {
      const scene = gltf.scene;
      scene.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
      });
      cache.set(assetId, scene);
      pending.delete(assetId);
      return scene;
    }).catch((error) => {
      pending.delete(assetId);
      throw error;
    });

    pending.set(assetId, request);
    const scene = await request;
    return scene.clone(true);
  }

  function preload(assetIds = []) {
    return Promise.allSettled(assetIds.map((assetId) => load(assetId)));
  }

  function has(assetId) {
    return cache.has(assetId);
  }

  function clear(assetId) {
    if (assetId) {
      cache.delete(assetId);
      pending.delete(assetId);
      return;
    }
    cache.clear();
    pending.clear();
  }

  return { load, preload, has, clear };
}
