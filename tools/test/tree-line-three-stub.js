/**
 * Stub for the tree-line tests.
 *
 * Builds on the base stub (Vector3 / Quaternion / Matrix4 / InstancedMesh) and
 * adds the scene-graph surface `tree-line.js` uses to pull one named variant
 * out of a loaded GLB: `getObjectByName`, `clone`, `traverse`, `clear`.
 *
 * Local exports shadow the re-exported ones, so nothing here changes the stubs
 * the existing suites run against.
 */
export * from "./three-stub.js";
import { Matrix4 } from "./three-stub.js";

export class Group {
  constructor() {
    this.children = [];
    this.name = "";
    this.userData = {};
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.scale = { x: 1, y: 1, z: 1, setScalar(v) { this.x = v; this.y = v; this.z = v; } };
    this.matrixWorld = new Matrix4();
  }
  add(child) { this.children.push(child); return this; }
  remove(child) {
    const at = this.children.indexOf(child);
    if (at !== -1) this.children.splice(at, 1);
    return this;
  }
  clear() { this.children.length = 0; return this; }
  traverse(fn) {
    fn(this);
    for (const child of this.children) (child.traverse ? child.traverse(fn) : fn(child));
  }
  updateMatrixWorld() { return this; }
  getObjectByName(name) {
    let found = null;
    this.traverse((node) => { if (!found && node?.name === name) found = node; });
    return found;
  }
  clone() {
    const next = new Group();
    next.name = this.name;
    next.children = this.children.map((child) => (child.clone ? child.clone() : child));
    return next;
  }
}

/** A leaf mesh inside a stub GLB — enough for collectParts() to accept it. */
export class StubMesh {
  constructor({ name = "", material = null, triangles = 100 } = {}) {
    this.isMesh = true;
    this.name = name;
    this.geometry = { index: { count: triangles * 3 }, attributes: { position: { count: triangles * 3 } } };
    this.material = material ?? { name: `${name}Material`, fog: false, map: null, userData: {} };
    this.matrixWorld = new Matrix4();
    this.children = [];
  }
  traverse(fn) { fn(this); }
  updateMatrixWorld() { return this; }
  clone() { const m = new StubMesh({ name: this.name }); m.material = this.material; m.geometry = this.geometry; return m; }
}

/** Builds a scene shaped like the Quaternius nature packs: named variants. */
export function stubNatureScene(variantNames, triangles = 100) {
  const scene = new Group();
  scene.name = "Scene";
  for (const name of variantNames) {
    const holder = new Group();
    holder.name = name;
    holder.add(new StubMesh({ name: `${name}_mesh`, triangles }));
    scene.add(holder);
  }
  return scene;
}
