import * as THREE from "three";
import { withLoadBudget } from "./load-budget.js";

/**
 * Packs every ground surface into ONE sampler2DArray.
 *
 * With a sampler per layer, 16 surfaces plus the splat pages plus whatever
 * MeshStandardMaterial binds for shadows blows past the 16 fragment texture
 * units that weaker mobile GPUs actually ship. An array texture costs one
 * unit no matter how many layers are in it.
 *
 * Everything is resampled to one square tile size because a texture array
 * requires identical dimensions per slice — this also stops a stray 4K source
 * image from quietly costing 40 MB of VRAM.
 */

const FALLBACK_COLOR = [138, 130, 116, 255];

function drawToTile(image, size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

function fallbackTile(size) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = FALLBACK_COLOR[0];
    data[i + 1] = FALLBACK_COLOR[1];
    data[i + 2] = FALLBACK_COLOR[2];
    data[i + 3] = FALLBACK_COLOR[3];
  }
  return data;
}

/**
 * @param {{ layers, textureLoader, tileSize?: number, anisotropy?: number }} options
 * @returns {Promise<{ texture: THREE.DataArrayTexture, images: Map<string, HTMLImageElement>, missing: string[], dispose(): void }>}
 */
export async function createGroundTextureArray({
  layers,
  textureLoader,
  tileSize = 512,
  anisotropy = 1,
}) {
  const slices = layers.all;
  const size = Math.max(16, Math.floor(tileSize));

  const images = new Map();
  const missing = [];

  const loaded = await Promise.all(
    slices.map(async (layer) => {
      try {
        const texture = await withLoadBudget(textureLoader.loadAsync(layer.texture), 8000, layer.texture, (late) => late.dispose());
        images.set(layer.key, texture.image);
        // The image is copied into the array below; the standalone GPU texture
        // this loader made would just sit there costing memory.
        texture.dispose();
        return drawToTile(texture.image, size);
      } catch (error) {
        // A layer whose art has not been drawn yet should look obviously
        // unfinished, not stop the island from loading.
        console.warn(`Ground texture missing for "${layer.key}"`, error);
        missing.push(layer.key);
        const pixels = fallbackTile(size);
        // The base-map path needs an image as well as the array's pixels.
        const image = document.createElement("canvas");
        image.width = image.height = size;
        image.getContext("2d").putImageData(new ImageData(pixels, size, size), 0, 0);
        images.set(layer.key, image);
        return pixels;
      }
    })
  );

  const stride = size * size * 4;
  const data = new Uint8Array(stride * slices.length);
  loaded.forEach((tile, index) => data.set(tile, index * stride));

  const texture = new THREE.DataArrayTexture(data, size, size, slices.length);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  // Without mips the tiled ground shimmers badly at the far edge of the island,
  // which is most of what the camera sees at default zoom.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;

  return {
    texture,
    images,
    missing,
    dispose() {
      texture.dispose();
    },
  };
}
