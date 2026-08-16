import * as THREE from "three";
import { createFloatingIsland } from "../systems/floating-island.js";
import { createTerrain } from "../systems/terrain.js";
import { createTerrainHeight } from "../systems/terrain-height.js";
import { createWorldBoundary } from "../systems/world-boundary.js";
import { createMountainBackdrop } from "../systems/mountain-backdrop.js";
import { createTerrainField } from "../systems/terrain-field.js";
import { createGroundPaint } from "../systems/ground-paint.js";
import { createGroundLayers } from "../systems/ground-layers.js";
import { createGroundTextureArray } from "../systems/ground-texture-array.js";
import { createBrushCursor } from "../systems/brush-cursor.js";
import { createAnimatedWater } from "../systems/water.js";
import { createFarmPlot } from "../systems/farming/plot.js";
import { createCrops } from "../systems/farming/crops.js";

function tile(texture, repeat) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function createHomeIsland({
  scene,
  textureLoader,
  config,
  assets,
  anisotropy = 1,
  reservedAreas = [],
  onCropsChange,
}) {
  const group = new THREE.Group();
  group.name = "HomeIslandZone";

  const mountainBackdrop = createMountainBackdrop(config.mountainBackdrop);
  group.add(mountainBackdrop.group);

  const island = createFloatingIsland({ ...config.island, topY: (config.worldBoundary?.enabled !== false && config.worldBoundary?.type === "ridge") ? config.worldBoundary.height : 0 });
  group.add(island);

  const layers = createGroundLayers(
    config.groundPaint.layers.map((layer) => ({
      ...layer,
      texture: `${assets.textureDir}/${layer.texture}`,
    })),
    { maxLayers: config.groundPaint.maxLayers }
  );

  const repeat = config.groundPaint.textureRepeat;
  const groundTextures = await createGroundTextureArray({
    layers,
    textureLoader,
    tileSize: config.groundPaint.tileSize,
    anisotropy,
  });

  const baseMap = tile(
    new THREE.Texture(groundTextures.images.get(layers.base.key)),
    repeat
  );
  baseMap.needsUpdate = true;

  let waterTexture = null;
  if (config.water.texture) {
    try {
      waterTexture = await textureLoader.loadAsync(
        `${assets.textureDir}/${config.water.texture}`
      );
      waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping;
      waterTexture.colorSpace = THREE.SRGBColorSpace;
      waterTexture.anisotropy = anisotropy;
    } catch (error) {
      console.warn(`Water texture missing: ${config.water.texture}`, error);
    }
  }

  const baseHeight = createTerrainHeight({
    config: config.sculpt,
    worldSize: config.terrain.size,
    spacing: config.terrain.spacing,
    reservedAreas,
  });
  const worldBoundary = createWorldBoundary({
    config: config.worldBoundary,
    baseHeight,
    worldSize: config.terrain.size,
    spacing: config.terrain.spacing,
    renderOrder: config.terrain.renderOrder,
  });
  const height = worldBoundary.height;

  const terrainField = createTerrainField({
    height: worldBoundary.heightView,
    worldSize: config.terrain.size,
    config: {
      ...config.terrainField,
      waterLevel: config.water.level,
    },
  });

  const terrain = createTerrain({ texture: baseMap, config: config.terrain, height: baseHeight });

  const paint = createGroundPaint({
    config: config.groundPaint,
    worldSize: config.terrain.size,
    layers,
    layerArray: groundTextures.texture,
    terrainField,
    autoSurfaceConfig: config.terrainField,
  });
  paint.applyTo(terrain.material);

  const water = createAnimatedWater({
    size: config.terrain.size,
    config: config.water,
    terrainField,
    texture: waterTexture,
  });

  group.add(water.mesh);
  group.add(terrain.mesh);
  const boundaryMesh = worldBoundary.createMesh(terrain.material);
  if (boundaryMesh) group.add(boundaryMesh);

  const farmPlot = createFarmPlot(config.farmPlot);
  group.add(farmPlot.group);
  scene.add(group);

  const brushCursor = createBrushCursor({
    scene,
    getGroundHeight: (x, z) => height.sample(x, z),
    config: config.brushCursor,
  });

  const crops = createCrops({
    plot: farmPlot,
    config: config.farming,
    onChange: onCropsChange,
  });

  return {
    group,
    ground: terrain.mesh,
    terrain,
    layers,
    missingTextures: groundTextures.missing,
    height,
    terrainField,
    worldBoundary,
    mountainBackdrop,
    water,
    paint,
    brushCursor,
    farmPlot,
    crops,
    getGroundHeight: (x, z) => height.sample(x, z),
    refresh() {
      water.update();
      const changed = terrain.refresh();
      if (changed) {
        worldBoundary.refresh();
        terrainField.refresh();
        brushCursor.refresh();
      }
      return changed;
    },
    dispose() {
      brushCursor.dispose();
      crops.dispose();
      farmPlot.dispose();
      paint.dispose();
      height.dispose();
      worldBoundary.dispose();
      mountainBackdrop.dispose();
      terrain.dispose();
      water.dispose();
      terrainField.dispose();
      groundTextures.dispose();
      baseMap.dispose();
      scene.remove(group);
    },
  };
}