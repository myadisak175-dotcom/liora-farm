/**
 * Stub for the horizon-layer tests.
 *
 * Builds on the mountain stub (BufferGeometry / Mesh / MeshLambertMaterial) and
 * adds the handful of primitives the distant-range layer uses. Local exports
 * shadow the re-exported ones, so nothing here changes the stubs the existing
 * suites run against.
 */
export * from "./mountain-three-stub.js";
import { MathUtils as BaseMathUtils } from "./three-stub.js";

export const MathUtils = {
  ...BaseMathUtils,
  lerp: (a, b, t) => a + (b - a) * t,
};

export class Euler {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

export class Quaternion {
  setFromAxisAngle(axis, angle) {
    this.angle = angle;
    return this;
  }
  setFromEuler(euler) {
    this.angle = euler.y;
    return this;
  }
}

export class Color {
  constructor(hex = 0xffffff) {
    this.setHex(hex);
  }
  setHex(hex) {
    const value = Number(hex) >>> 0;
    this.r = ((value >> 16) & 255) / 255;
    this.g = ((value >> 8) & 255) / 255;
    this.b = (value & 255) / 255;
    return this;
  }
  copy(c) {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    return this;
  }
  clone() {
    const next = new Color();
    return next.copy(this);
  }
  lerp(c, t) {
    this.r += (c.r - this.r) * t;
    this.g += (c.g - this.g) * t;
    this.b += (c.b - this.b) * t;
    return this;
  }
  equals(c) {
    return this.r === c.r && this.g === c.g && this.b === c.b;
  }
}

export class Matrix4 {
  constructor() {
    this.payload = null;
  }
  compose(position, quaternion, scale) {
    this.payload = {
      x: position.x, y: position.y, z: position.z,
      rotation: quaternion.angle,
      scale: scale.x, scaleX: scale.x, scaleY: scale.y, scaleZ: scale.z,
    };
    return this;
  }
  clone() {
    const next = new Matrix4();
    next.payload = this.payload ? { ...this.payload } : null;
    return next;
  }
  copy(other) {
    this.payload = other.payload ? { ...other.payload } : null;
    return this;
  }
  multiplyMatrices(a) {
    this.payload = a.payload ? { ...a.payload } : null;
    return this;
  }
}

class StubGeometry {
  constructor(kind, params) {
    this.kind = kind;
    this.params = params;
    this.offset = { x: 0, y: 0, z: 0 };
    this.disposed = false;
  }
  translate(x, y, z) {
    this.offset.x += x;
    this.offset.y += y;
    this.offset.z += z;
    return this;
  }
  dispose() {
    this.disposed = true;
  }
}

export class ConeGeometry extends StubGeometry {
  constructor(...params) { super("cone", params); }
}
export class SphereGeometry extends StubGeometry {
  constructor(...params) { super("sphere", params); }
}
export class CylinderGeometry extends StubGeometry {
  constructor(...params) { super("cylinder", params); }
}

export class MeshBasicMaterial {
  constructor(options = {}) {
    Object.assign(this, options);
    this.color = new Color(options.color ?? 0xffffff);
    this.name = "";
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
  }
}

export class ShaderMaterial {
  constructor(options = {}) {
    Object.assign(this, options);
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
  }
}

export class PointsMaterial {
  constructor(options = {}) {
    Object.assign(this, options);
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
  }
}

export class BufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array.length / itemSize;
  }
}

export class Points {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.renderOrder = 0;
    this.visible = true;
    this.position = new Transform();
  }
}

class Transform {
  constructor() { this.x = 0; this.y = 0; this.z = 0; }
  set(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(v) { return this.set(v, v, v); }
  copy(other) { return this.set(other.x, other.y, other.z); }
}

class Object3D {
  constructor() {
    this.children = [];
    this.name = "";
    this.userData = {};
    this.position = new Transform();
    this.scale = new Transform().setScalar(1);
    this.rotation = new Transform();
    this.castShadow = false;
    this.receiveShadow = false;
    this.renderOrder = 0;
    this.frustumCulled = true;
    this.visible = true;
  }
  add(child) { this.children.push(child); return this; }
  remove(child) {
    const at = this.children.indexOf(child);
    if (at !== -1) this.children.splice(at, 1);
    return this;
  }
  traverse(callback) {
    callback(this);
    for (const child of this.children) {
      if (typeof child.traverse === "function") child.traverse(callback);
      else callback(child);
    }
  }
}

export class Group extends Object3D {}

export class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}
