export * from "./three-stub.js";

export const DoubleSide = 2;

export class Float32BufferAttribute {
  constructor(array, itemSize) {
    this.array = array instanceof Float32Array ? array : new Float32Array(array);
    this.itemSize = itemSize;
    this.count = this.array.length / itemSize;
  }
}

export class BufferGeometry {
  constructor() {
    this.attributes = {};
    this.index = null;
    this.disposed = false;
  }
  setAttribute(name, attribute) {
    this.attributes[name] = attribute;
    return this;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  setIndex(values) {
    const array = Array.from(values);
    this.index = { array, count: array.length };
    return this;
  }
  computeVertexNormals() {
    this.normalsComputed = true;
  }
  computeBoundingSphere() {
    this.boundingSphereComputed = true;
  }
  computeBoundingBox() {
    this.boundingBoxComputed = true;
  }
  dispose() {
    this.disposed = true;
  }
}

/**
 * One shape for every mesh material the horizon code constructs.
 *
 * These used to be hand-written per class, and drifted: the source moved to
 * MeshStandardMaterial and started writing `material.userData.hazeDepth`,
 * while the stub still only offered MeshLambertMaterial with no `userData`.
 * Three suites had been failing on that at boot — not on an assertion, on a
 * TypeError — for long enough that CI red was the normal state.
 *
 * A stub that is missing a field should fail loudly on the field, not on the
 * constructor, so everything the real materials share lives here once.
 */
class StubMaterial {
  constructor(options = {}) {
    Object.assign(this, options);
    this.name = "";
    this.disposed = false;
    this.needsUpdate = false;
    this.userData = {};
    this.defines = {};
    this.onBeforeCompile = () => {};
  }
  dispose() {
    this.disposed = true;
  }
}

export class MeshLambertMaterial extends StubMaterial {}
export class MeshStandardMaterial extends StubMaterial {}
export class MeshPhongMaterial extends StubMaterial {}

export class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.name = "";
    this.castShadow = false;
    this.receiveShadow = false;
    this.renderOrder = 0;
  }
}
