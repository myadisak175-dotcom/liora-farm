import * as THREE from "three";
import { createFloatingIsland } from "../systems/floating-island.js";
import { createTerrain } from "../systems/terrain.js";
import { createGroundPaint } from "../systems/ground-paint.js?v=dirt4";
import { createFarmPlot } from "../systems/farming/plot.js";

function tile(texture, repeat) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function createHomeIsland({ scene, textureLoader, config, assets }) {
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

  return {
    group,
    ground: terrain.mesh,
    terrain,
    paint,
    farmPlot,
    getGroundHeight: terrain.getHeight,
    dispose() {
      farmPlot.dispose();
      paint.dispose();
      terrain.dispose();
      for (const texture of Object.values(textures)) texture.dispose();
      scene.remove(group);
    },
  };
}
