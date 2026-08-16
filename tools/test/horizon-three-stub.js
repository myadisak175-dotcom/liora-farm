/**
 * Three.js additions used by the Open Horizon regression page. Existing tests
 * keep their original stubs; this file is isolated to horizon-layers.test.html.
 */
export * from "./mountain-three-stub.js";
import { MathUtils as BaseMathUtils } from "./three-stub.js";

export const MathUtils = {
  ...BaseMathUtils,
  lerp: (a, b, t) => a + (b - a) * t,
};

export class Quaternion {
  constructor() { this.angle = 0; }
}

export class Color {
  constructor(hex = 0xffffff) { this.setHex(hex); }
  setHex(hex) {
    const value = Number(hex) >>> 0;
    this.r = ((value >> 16) & 255) / 255;
    this.g = ((value >> 8) & 255) / 255;
    this.b = (value & 255) / 255;
    return this;
  }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  clone() { return new Color().copy(this); }
  lerp(c, t) {
    this.r += (c.r - this.r) * t;
    this.g += (c.g - this.g) * t;
    this.b += (c.b - this.b) * t;
    return this;
  }
}

export class Matrix4 {
  constructor() { this.payload = null; }
  compose(position, quaternion, scale) {
    this.payload = {
      x: position.x, y: position.y, z: position.z,
      scaleX: scale.x, scaleY: scale.y, scaleZ: scale.z,
    };
    return this;
  }
  clone() { const next = new Matrix4(); next.payload = this.payload ? { ...this.payload } : null; return next; }
}

class StubGeometry {
  constructor(kind, params) { this.kind = kind; this.params = params; this.disposed = false; }
  dispose() { this.disposed = true; }
}
export class SphereGeometry extends StubGeometry {
  constructor(...params) { super("sphere", params); }
}

export class MeshBasicMaterial {
  constructor(options = {}) {
    Object.assign(this, options);
    this.color = new Color(options.color ?? 0xffffff);
    this.disposed = false;
  }
  dispose() { this.disposed = true; }
}

export class ShaderMaterial {
  constructor(options = {}) { Object.assign(this, options); this.disposed = false; }
  dispose() { this.disposed = true; }
}

export class PointsMaterial {
  constructor(options = {}) { Object.assign(this, options); this.disposed = false; }
  dispose() { this.disposed = true; }
}

export class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
}

class Transform {
  constructor() { this.x = 0; this.y = 0; this.z = 0; }
  set(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; return this; }
  copy(other) { return this.set(other.x, other.y, other.z); }
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
