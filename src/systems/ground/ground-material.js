import * as THREE from "three";

const PLACEHOLDER_COLORS = {
  grass: "#6f8f4a",
  dirt: "#8a5a36",
  sand: "#d9c9a3",
  rock: "#8f8d88",
};

const PLACEHOLDER_TILE_COLORS = ["#9c9186", "#6b4a2f", "#4a3220", "#ff00ff"];

function makeSolidTexture(hex) {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 4, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePlaceholderAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  [[0,0],[32,0],[0,32],[32,32]].forEach(([x, y], index) => {
    ctx.fillStyle = PLACEHOLDER_TILE_COLORS[index];
    ctx.fillRect(x, y, 32, 32);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

async function loadOrPlaceholder(textureLoader, path, fallbackHex) {
  if (!path) return makeSolidTexture(fallbackHex);
  try {
    const texture = await textureLoader.loadAsync(path);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch (error) {
    console.warn(`[ground] "${path}" failed, using placeholder:`, error.message);
    return makeSolidTexture(fallbackHex);
  }
}

function makeDataCanvasTexture(size, filter) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = filter;
  texture.magFilter = filter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return { canvas, ctx, texture };
}

const GROUND_UNIFORMS_GLSL = /* glsl */ `
uniform sampler2D uSplatMap;
uniform sampler2D uGridMap;
uniform sampler2D uGrassMap;
uniform sampler2D uDirtMap;
uniform sampler2D uSandMap;
uniform sampler2D uRockMap;
uniform sampler2D uTileAtlas;
uniform float uTextureRepeat;
uniform float uGridSize;
`;

const GROUND_MAP_FRAGMENT = /* glsl */ `
vec2 groundUv = vMapUv;
vec2 tiledUv = groundUv * uTextureRepeat;

vec3 splat = texture2D(uSplatMap, groundUv).rgb;
float wDirt = splat.r;
float wSand = splat.g;
float wRock = splat.b;
float wGrass = 1.0 - clamp(wDirt + wSand + wRock, 0.0, 1.0);

vec3 ground =
  texture2D(uGrassMap, tiledUv).rgb * wGrass +
  texture2D(uDirtMap, tiledUv).rgb * wDirt +
  texture2D(uSandMap, tiledUv).rgb * wSand +
  texture2D(uRockMap, tiledUv).rgb * wRock;

ground /= max(wGrass + wDirt + wSand + wRock, 0.001);

float tileIndex = floor(texture2D(uGridMap, groundUv).r * 255.0 + 0.5);
if (tileIndex > 0.5) {
  float cell = tileIndex - 1.0;
  vec2 cellUv = clamp(fract(groundUv * uGridSize), 0.02, 0.98);
  vec2 atlasOrigin = vec2(mod(cell, 2.0) * 0.5, 0.5 - floor(cell / 2.0) * 0.5);
  ground = texture2D(uTileAtlas, atlasOrigin + cellUv * 0.5).rgb;
}

diffuseColor *= vec4(ground, 1.0);
`;

export async function createGroundMaterial({
  textureLoader = new THREE.TextureLoader(),
  paths = {},
  worldSize = 42,
  gridSize = 42,
  unitsPerRepeat = 2,
  splatResolution = 512,
} = {}) {
  const [grassMap, dirtMap, sandMap, rockMap] = await Promise.all([
    loadOrPlaceholder(textureLoader, paths.grass, PLACEHOLDER_COLORS.grass),
    loadOrPlaceholder(textureLoader, paths.dirt, PLACEHOLDER_COLORS.dirt),
    loadOrPlaceholder(textureLoader, paths.sand, PLACEHOLDER_COLORS.sand),
    loadOrPlaceholder(textureLoader, paths.rock, PLACEHOLDER_COLORS.rock),
  ]);

  let tileAtlas;
  if (paths.tileAtlas) {
    tileAtlas = await loadOrPlaceholder(textureLoader, paths.tileAtlas, "#ff00ff");
    tileAtlas.wrapS = tileAtlas.wrapT = THREE.ClampToEdgeWrapping;
    tileAtlas.generateMipmaps = false;
    tileAtlas.minFilter = THREE.LinearFilter;
    tileAtlas.magFilter = THREE.LinearFilter;
  } else {
    tileAtlas = makePlaceholderAtlas();
  }

  const splat = makeDataCanvasTexture(splatResolution, THREE.LinearFilter);
  const grid = makeDataCanvasTexture(gridSize, THREE.NearestFilter);

  const uniforms = {
    uSplatMap: { value: splat.texture },
    uGridMap: { value: grid.texture },
    uGrassMap: { value: grassMap },
    uDirtMap: { value: dirtMap },
    uSandMap: { value: sandMap },
    uRockMap: { value: rockMap },
    uTileAtlas: { value: tileAtlas },
    uTextureRepeat: { value: worldSize / unitsPerRepeat },
    uGridSize: { value: gridSize },
  };

  const material = new THREE.MeshStandardMaterial({
    map: grassMap,
    roughness: 1,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${GROUND_UNIFORMS_GLSL}`)
      .replace("#include <map_fragment>", GROUND_MAP_FRAGMENT);
  };
  material.customProgramCacheKey = () => "liora-ground-v1";

  return {
    material,
    uniforms,
    splatCanvas: splat.canvas,
    splatContext: splat.ctx,
    splatTexture: splat.texture,
    gridCanvas: grid.canvas,
    gridContext: grid.ctx,
    gridTexture: grid.texture,
    commitSplat() { splat.texture.needsUpdate = true; },
    commitGrid() { grid.texture.needsUpdate = true; },
    dispose() {
      material.dispose();
      const disposed = new Set();
      for (const uniform of Object.values(uniforms)) {
        const value = uniform.value;
        if (value?.dispose && !disposed.has(value)) {
          value.dispose();
          disposed.add(value);
        }
      }
    },
  };
}
