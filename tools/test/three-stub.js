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
