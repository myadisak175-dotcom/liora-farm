/**
 * The slice of three.js that the ground layer modules touch, so they can be
 * exercised in a browser without the CDN. Only used by tools/test/*.
 */
export const NoColorSpace = "";
export const SRGBColorSpace = "srgb";
export const LinearFilter = 1006;
export const LinearMipmapLinearFilter = 1008;
export const ClampToEdgeWrapping = 1001;
export const RepeatWrapping = 1000;
export const RGBAFormat = 1023;
export const UnsignedByteType = 1009;

export const MathUtils = {
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
};

class StubTexture {
  constructor() {
    this.needsUpdate = false;
    this.disposed = false;
    this.generateMipmaps = false;
    this.anisotropy = 1;
  }
  dispose() {
    this.disposed = true;
  }
}

export class CanvasTexture extends StubTexture {
  constructor(image) {
    super();
    this.image = image;
    this.isCanvasTexture = true;
  }
}

export class DataArrayTexture extends StubTexture {
  constructor(data, width, height, depth) {
    super();
    this.image = { data, width, height, depth };
    this.isDataArrayTexture = true;
  }
}

export class TextureLoader {
  async loadAsync(url) {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`404 ${url}`));
      element.src = url;
    });
    const texture = new StubTexture();
    texture.image = image;
    return texture;
  }
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v) {
    return this.set(v.x, v.y, v.z);
  }
  setScalar(value) {
    return this.set(value, value, value);
  }
}

export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
}

/**
 * Enough of a Raycaster for builder-ui: it only reads `ray.origin` and
 * `ray.direction` after setFromCamera, then hands the whole object to
 * builder-view.pick(). The stub camera is {position, dir}.
 */
export class Raycaster {
  constructor() {
    this.ray = { origin: new Vector3(), direction: new Vector3(0, -1, 0) };
  }
  setFromCamera(ndc, camera) {
    this.ray.origin.copy(camera.position ?? { x: 0, y: 10, z: 10 });
    const d = camera.stubDirection ?? { x: 0, y: -0.7071, z: -0.7071 };
    this.ray.direction.copy(d);
    this.lastNdc = { x: ndc.x, y: ndc.y };
    return this;
  }
  intersectObjects() {
    return [];
  }
  intersectObject() {
    return [];
  }
}

MathUtils.degToRad = (deg) => (deg * Math.PI) / 180;

export const DynamicDrawUsage = 35048;

export class Color {
  constructor(r = 1, g = 1, b = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  copy(c) {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    return this;
  }
  equals(c) {
    return this.r === c.r && this.g === c.g && this.b === c.b;
  }
}

export class Quaternion {
  setFromAxisAngle(axis, angle) {
    this.angle = angle;
    return this;
  }
}

/**
 * The transform bookkeeping instanced-pool.js relies on, without re-deriving
 * Three.js matrix maths in a test double. `compose` records what it was given
 * and `multiplyMatrices` keeps the left operand's payload, which is exactly the
 * invariant the pool has to preserve: the holder transform of item X must end
 * up in X's slot, on every mesh of the asset.
 */
export class Matrix4 {
  constructor() {
    this.payload = null;
  }
  compose(position, quaternion, scale) {
    this.payload = { x: position.x, y: position.y, z: position.z, rotation: quaternion.angle, scale: scale.x };
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

export class InstancedBufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this.count = array.length / itemSize;
    this.needsUpdate = false;
  }
  setUsage(usage) {
    this.usage = usage;
    return this;
  }
}

export class Group {
  constructor() {
    this.children = [];
    this.name = "";
    this.userData = {};
  }
  add(child) {
    this.children.push(child);
    return this;
  }
  remove(child) {
    const at = this.children.indexOf(child);
    if (at !== -1) this.children.splice(at, 1);
    return this;
  }
}

export class InstancedMesh {
  constructor(geometry, material, capacity) {
    this.geometry = geometry;
    this.material = material;
    this.capacity = capacity;
    this.count = capacity;
    this.userData = {};
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = true;
    this.disposed = false;
    this.boundingSphereRevision = 0;
    this.instanceColor = null;
    this.matrices = new Array(capacity).fill(null);
    this.instanceMatrix = new InstancedBufferAttribute(new Float32Array(capacity * 16), 16);
  }
  setMatrixAt(index, matrix) {
    this.matrices[index] = matrix.payload ? { ...matrix.payload } : null;
  }
  getMatrixAt(index, target) {
    target.payload = this.matrices[index] ? { ...this.matrices[index] } : null;
    return target;
  }
  setColorAt(index, color) {
    if (!this.instanceColor) {
      this.instanceColor = new InstancedBufferAttribute(new Float32Array(this.capacity * 3).fill(1), 3);
    }
    this.instanceColor.array[index * 3] = color.r;
    this.instanceColor.array[index * 3 + 1] = color.g;
    this.instanceColor.array[index * 3 + 2] = color.b;
  }
  getColorAt(index, target) {
    const array = this.instanceColor?.array;
    target.r = array ? array[index * 3] : 1;
    target.g = array ? array[index * 3 + 1] : 1;
    target.b = array ? array[index * 3 + 2] : 1;
    return target;
  }
  computeBoundingSphere() {
    this.boundingSphereRevision += 1;
  }
  dispose() {
    this.disposed = true;
    return this;
  }
}
