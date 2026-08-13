import * as THREE from "three";
import { createFloatingIsland } from "../systems/floating-island.js";
import { createTerrain } from "../systems/terrain.js";
import { createTerrainHeight } from "../systems/terrain-height.js";
import { createGroundPaint } from "../systems/ground-paint.js";
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
  reservedAreas = [],
  onCropsChange,
}) {
  const group = new THREE.Group();
  group.name = "HomeIslandZone";

  const island = createFloatingIsland(config.island);
  group.add(island);

  const [grass, dirt, sand, rock] = await Promise.all(
    [assets.grass, assets.dirt, assets.sand, assets.rock].map((url) =>
      textureLoader.loadAsync(url)
    )
  );
  const repeat = config.groundPaint.textureRepeat;
  const textures = {
    grass: tile(grass, repeat),
    dirt: tile(dirt, repeat),
    sand: tile(sand, repeat),
    rock: tile(rock, repeat),
  };

  const height = createTerrainHeight({
    config: config.sculpt,
    worldSize: config.terrain.size,
    spacing: config.terrain.spacing,
    reservedAreas,
  });

  const terrain = createTerrain({
    texture: textures.grass,
    config: config.terrain,
    height,
  });

  const paint = createGroundPaint({
    config: config.groundPaint,
    worldSize: config.terrain.size,
    textures,
  });
  paint.applyTo(terrain.material);

  const water = createAnimatedWater({
    size: config.terrain.size,
    config: config.water,
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
    height,
    water,
    paint,
    brushCursor,
    farmPlot,
    crops,
    getGroundHeight: (x, z) => height.sample(x, z),
    /** Render loop calls this every frame; terrain rebuilds only when sculpted. */
    refresh() {
      water.update();
      const changed = terrain.refresh();
      if (changed) brushCursor.refresh();
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
      for (const texture of Object.values(textures)) texture.dispose();
      scene.remove(group);
    },
  };
}
