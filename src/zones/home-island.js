import * as THREE from "three";
import { createFloatingIsland } from "../systems/floating-island.js";
import { createTerrain } from "../systems/terrain.js";
import { createTerrainHeight } from "../systems/terrain-height.js";
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

  const island = createFloatingIsland(config.island);
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

  const height = createTerrainHeight({
    config: config.sculpt,
    worldSize: config.terrain.size,
    spacing: config.terrain.spacing,
    reservedAreas,
  });

  const terrainField = createTerrainField({
    height,
    worldSize: config.terrain.size,
    config: {
      ...config.terrainField,
      waterLevel: config.water.level,
    },
  });

  const terrain = createTerrain({ texture: baseMap, config: config.terrain, height });

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
  });

  group.add(water.mesh);
  group.add(terrain.mesh);

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
      terrain.dispose();
      water.dispose();
      terrainField.dispose();
      groundTextures.dispose();
      baseMap.dispose();
      scene.remove(group);
    },
  };
}
