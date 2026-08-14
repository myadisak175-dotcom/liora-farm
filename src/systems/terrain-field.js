import * as THREE from "three";

/**
 * One tiny terrain-derived texture shared by water and ground shading.
 * R = normalized water depth, G = automatic sand weight, B = automatic rock weight.
 * The 85x85 RGBA8 texture is ~29 KB and only changes after terrain changes.
 */
export function createTerrainField({ height, worldSize, config }) {
  const cells = height.cells;
  const data = new Uint8Array(cells * cells * 4);
  const texture = new THREE.DataTexture(
    data,
    cells,
    cells,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  const half = worldSize / 2;
  const spacing = height.spacing;
  const maxDepth = Math.max(0.25, config.maxDepth ?? 3.5);
  const rockSlope = config.rockSlope ?? 0.6;
  const rockFeather = Math.max(0.01, config.rockFeather ?? 0.12);
  const sandFeather = Math.max(0.01, config.sandFeather ?? 0.18);

  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const smoothstep = (a, b, value) => {
    if (a === b) return value >= b ? 1 : 0;
    const t = clamp01((value - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  const fieldAt = (ix, iz) =>
    height.heights[Math.max(0, Math.min(cells - 1, iz)) * cells + Math.max(0, Math.min(cells - 1, ix))];

  function refresh() {
    for (let iz = 0; iz < cells; iz += 1) {
      const z = iz * spacing - half;
      for (let ix = 0; ix < cells; ix += 1) {
        const x = ix * spacing - half;
        const h = height.heights[iz * cells + ix];
        const depth = Math.max(0, config.waterLevel - h);
        const dx = (fieldAt(ix + 1, iz) - fieldAt(ix - 1, iz)) / (2 * spacing);
        const dz = (fieldAt(ix, iz + 1) - fieldAt(ix, iz - 1)) / (2 * spacing);
        const slope = Math.hypot(dx, dz);

        const rock = smoothstep(rockSlope - rockFeather, rockSlope + rockFeather, slope);
        const wetSand = smoothstep(-sandFeather, sandFeather, config.waterLevel - h);
        const sand = wetSand * (1 - rock);

        const textureRow = cells - 1 - iz; // PlaneGeometry v=1 is world -Z.
        const offset = (textureRow * cells + ix) * 4;
        data[offset] = Math.round(clamp01(depth / maxDepth) * 255);
        data[offset + 1] = Math.round(clamp01(sand) * 255);
        data[offset + 2] = Math.round(clamp01(rock) * 255);
        data[offset + 3] = 255;
      }
    }
    texture.needsUpdate = true;
  }

  refresh();

  return {
    texture,
    maxDepth,
    refresh,
    dispose() {
      texture.dispose();
    },
  };
}
