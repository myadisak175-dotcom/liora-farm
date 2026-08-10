import * as THREE from "three";
import { createFloatingIsland } from "../systems/floating-island.js";
import { createTerrain } from "../systems/terrain.js";
import { createFarmPlot } from "../systems/farming/plot.js";

export async function createHomeIsland({ scene, textureLoader, config, assets }) {
  const group = new THREE.Group();
  group.name = "HomeIslandZone";

  const island = createFloatingIsland(config.island);
  group.add(island);

  const grass = await textureLoader.loadAsync(assets.grass);
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(config.grassRepeat, config.grassRepeat);
  grass.colorSpace = THREE.SRGBColorSpace;

  const terrain = createTerrain({
    texture: grass,
    config: config.terrain,
  });
  group.add(terrain.mesh);

  // Keep the first 3x3 farm plot on a deliberately flattened gameplay pad.
  const farmPlot = createFarmPlot(config.farmPlot);
  farmPlot.group.position.y += terrain.getHeight(
    config.farmPlot.position.x,
    config.farmPlot.position.z
  );
  group.add(farmPlot.group);

  scene.add(group);

  return {
    group,
    ground: terrain.mesh,
    terrain,
    farmPlot,
    getGroundHeight: terrain.getHeight,
    dispose() {
      farmPlot.dispose();
      terrain.dispose();
      grass.dispose();
      scene.remove(group);
    },
  };
}
