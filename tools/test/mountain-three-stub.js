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

export class MeshLambertMaterial {
  constructor(options = {}) {
    Object.assign(this, options);
    this.name = "";
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
  }
}

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
