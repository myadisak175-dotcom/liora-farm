import * as THREE from "three";

/**
 * One tiny, reusable tangent-space normal tile for the playable ground.
 *
 * A normal array per paint layer would double the ground texture-array memory
 * and roughly double the layer samples in the splat shader. That is the wrong
 * trade for a mobile web game. This tile is deliberately material-agnostic:
 * broad, soft micro-relief that makes grazing light move across the surface
 * without pretending to reproduce blades of grass or individual cobbles.
 *
 * The tile is generated once at boot, is seamless, and costs one normal-map
 * sample only while the quality tier enables it.
 */

function seededRandom(seed = 29) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function makeLattice(cells, random) {
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i += 1) grid[i] = random();
  return grid;
}

function samplePeriodic(grid, cells, u, v) {
  const fx = u * cells;
  const fy = v * cells;
  const floorX = Math.floor(fx);
  const floorY = Math.floor(fy);
  const x0 = ((floorX % cells) + cells) % cells;
  const y0 = ((floorY % cells) + cells) % cells;
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const tx = smooth(fx - floorX);
  const ty = smooth(fy - floorY);
  const top = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * tx;
  const bottom = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * tx;
  return top + (bottom - top) * ty;
}

export function createGroundDetailNormal(config = {}, anisotropy = 1) {
  const enabled = config.enabled !== false;
  const size = Math.max(32, Math.min(256, Math.round(Number(config.size) || 128)));
  const repeat = Math.max(1, Number(config.repeat) || 42);
  const strength = THREE.MathUtils.clamp(Number(config.strength ?? 0.24), 0, 1.5);
  const heightScale = Math.max(0.01, Number(config.heightScale) || 3.2);
  const seed = Number(config.seed) || 29;

  if (!enabled || typeof document === "undefined") {
    return { enabled: false, texture: null, strength, repeat, dispose() {} };
  }

  const random = seededRandom(seed);
  const octaves = [
    { cells: 4, weight: 0.5, grid: makeLattice(4, random) },
    { cells: 9, weight: 0.3, grid: makeLattice(9, random) },
    { cells: 17, weight: 0.2, grid: makeLattice(17, random) },
  ];
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      let value = 0;
      for (const octave of octaves) {
        value += samplePeriodic(octave.grid, octave.cells, u, v) * octave.weight;
      }
      heights[y * size + x] = value;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  const at = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * heightScale;
      const dy = (at(x, y + 1) - at(x, y - 1)) * heightScale;
      const invLength = 1 / Math.hypot(dx, dy, 1);
      const nx = -dx * invLength;
      const ny = -dy * invLength;
      const nz = invLength;
      const offset = (y * size + x) * 4;
      image.data[offset] = Math.round((nx * 0.5 + 0.5) * 255);
      image.data[offset + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      image.data[offset + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "LioraGroundDetailNormal";
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(1, Number(anisotropy) || 1);
  texture.needsUpdate = true;

  return {
    enabled: true,
    texture,
    strength,
    repeat,
    dispose() { texture.dispose(); },
  };
}
