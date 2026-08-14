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
}

MathUtils.degToRad = (deg) => (deg * Math.PI) / 180;
