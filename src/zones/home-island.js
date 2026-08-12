import * as THREE from "three";
import { createFloatingIsland } from "../systems/floating-island.js";
import { createTerrain } from "../systems/terrain.js";
import { createGroundPaint } from "../systems/ground-paint.js";
import { createFarmPlot } from "../systems/farming/plot.js";
import { createCrops } from "../systems/farming/crops.js";

function tile(texture, repeat) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function createHomeIsland({ scene, textureLoader, config, assets, onCropsChange }) {
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

  const terrain = createTerrain({ texture: textures.grass, config: config.terrain });

  const paint = createGroundPaint({
    config: config.groundPaint,
    worldSize: config.terrain.size,
    textures,
  });
  paint.applyTo(terrain.material);

  group.add(terrain.mesh);

  const farmPlot = createFarmPlot(config.farmPlot);
  group.add(farmPlot.group);

  scene.add(group);

  const crops = createCrops({
    plot: farmPlot,
    config: config.farming,
    onChange: onCropsChange,
  });

  return {
    group,
    ground: terrain.mesh,
    terrain,
    paint,
    farmPlot,
    crops,
    getGroundHeight: terrain.getHeight,
    dispose() {
      crops.dispose();
      farmPlot.dispose();
      paint.dispose();
      terrain.dispose();
      for (const texture of Object.values(textures)) texture.dispose();
      scene.remove(group);
    },
  };
}
