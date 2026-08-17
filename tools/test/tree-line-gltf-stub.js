/**
 * GLTFLoader stub for the tree-line tests.
 *
 * The test decides what each path resolves to by writing into
 * `window.__stubGltf`, so a missing file and a missing variant can both be
 * exercised without a network or a real binary.
 */
export class GLTFLoader {
  loadAsync(path) {
    const table = globalThis.__stubGltf ?? {};
    const scene = table[path];
    if (!scene) return Promise.reject(new Error(`stub GLB missing: ${path}`));
    return Promise.resolve({ scene });
  }
}
